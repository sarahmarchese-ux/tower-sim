// Turns raw mouse events into grid coordinates and tool actions. This is the
// only file that converts a screen pixel back into a (tile, floor) pair —
// everywhere else works in grid units already.
//
// Left button = build (this file). Right button = pan the camera (see
// camera.js). Splitting them this way means dragging never accidentally
// scrolls the tower when you meant to lay a floor, or vice versa.
//
// Two tools use a drag: Floor drags sideways along one level, and Elevator
// drags up or down along one column. Everything else is a single click.

const Tool = {
  current: "floor",
};

const Pointer = {
  tile: null,
  floor: null,
  screenX: 0, // where the mouse is on screen, for placing the tooltip
  screenY: 0,
  dragStartTile: null,
  dragStartFloor: null,
  dragging: false,
};

function screenToWorld(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;
  return {
    tile: Grid.xToTile(screenX + Camera.x),
    floor: Grid.yToFloor(screenY + Camera.y),
  };
}

// The floors an elevator drag currently covers. A click without dragging
// counts as the smallest possible elevator: this floor and the one above.
function elevatorDragSpan() {
  if (!Pointer.dragging || Pointer.floor === Pointer.dragStartFloor) {
    const floor = Pointer.dragging ? Pointer.dragStartFloor : Pointer.floor;
    return { tile: Pointer.dragging ? Pointer.dragStartTile : Pointer.tile, bottom: floor, top: floor + 1 };
  }
  return {
    tile: Pointer.dragStartTile,
    bottom: Math.min(Pointer.dragStartFloor, Pointer.floor),
    top: Math.max(Pointer.dragStartFloor, Pointer.floor),
  };
}

function attachBuildControls(canvas) {
  canvas.addEventListener("mousemove", (e) => {
    const { tile, floor } = screenToWorld(canvas, e.clientX, e.clientY);
    Pointer.tile = tile;
    Pointer.floor = floor;
    Pointer.screenX = e.clientX;
    Pointer.screenY = e.clientY;
  });

  // Off the canvas (over the toolbar, or out of the window) nothing is
  // hovered, so the tooltip goes away.
  canvas.addEventListener("mouseleave", () => {
    Pointer.tile = null;
    Pointer.floor = null;
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // right button pans; see camera.js
    if (Tool.current === "floor" || Tool.current === "elevator") {
      Pointer.dragging = true;
      Pointer.dragStartTile = Pointer.tile;
      Pointer.dragStartFloor = Pointer.floor;
    }
  });

  window.addEventListener("mouseup", (e) => {
    if (e.button !== 0) return;

    if (Tool.current === "floor" && Pointer.dragging) {
      const start = Math.min(Pointer.dragStartTile, Pointer.tile);
      const end = Math.max(Pointer.dragStartTile, Pointer.tile);
      UI.reportResult(World.buildFloorRun(Pointer.dragStartFloor, start, end));
    }

    if (Tool.current === "elevator" && Pointer.dragging) {
      const span = elevatorDragSpan();
      UI.reportResult(World.placeTransit("elevator", span.tile, span.bottom, span.top));
    }

    Pointer.dragging = false;
    Pointer.dragStartTile = null;
    Pointer.dragStartFloor = null;
  });

  // A plain click (no drag) handles everything except the two drag tools,
  // which were already handled on mouseup above.
  canvas.addEventListener("click", () => {
    if (Tool.current === "floor" || Tool.current === "elevator") return;
    if (Pointer.tile === null || Pointer.floor === null) return;

    let result;
    if (Tool.current === "demolish") {
      result = World.demolishAt(Pointer.floor, Pointer.tile);
    } else if (Tool.current === "stairs") {
      result = World.placeTransit("stairs", Pointer.tile, Pointer.floor, Pointer.floor + 1);
    } else {
      result = World.placeRoom(Tool.current, Pointer.floor, Pointer.tile);
    }
    UI.reportResult(result);
  });
}
