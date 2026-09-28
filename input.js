// Turns raw mouse events into grid coordinates and tool actions. This is the
// only file that converts a screen pixel back into a (tile, floor) pair —
// everywhere else works in grid units already.
//
// Left button = build (this file). Right button = pan the camera (see
// camera.js). Splitting them this way means dragging never accidentally
// scrolls the tower when you meant to lay a floor, or vice versa.

const Tool = {
  current: "floor",
};

const Pointer = {
  tile: null,
  floor: null,
  dragStartTile: null,
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

function attachBuildControls(canvas) {
  canvas.addEventListener("mousemove", (e) => {
    const { tile, floor } = screenToWorld(canvas, e.clientX, e.clientY);
    Pointer.tile = tile;
    Pointer.floor = floor;
    draw();
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // right button pans; see camera.js
    if (Tool.current === "floor") {
      Pointer.dragging = true;
      Pointer.dragStartTile = Pointer.tile;
    }
  });

  window.addEventListener("mouseup", (e) => {
    if (e.button !== 0) return;

    if (Tool.current === "floor" && Pointer.dragging) {
      const start = Math.min(Pointer.dragStartTile, Pointer.tile);
      const end = Math.max(Pointer.dragStartTile, Pointer.tile);
      UI.reportResult(World.buildFloorRun(Pointer.floor, start, end));
    }

    Pointer.dragging = false;
    Pointer.dragStartTile = null;
    draw();
  });

  // A plain click (no drag) handles everything except laying floor, which
  // needs the drag range from mouseup above instead.
  canvas.addEventListener("click", () => {
    if (Tool.current === "floor") return;
    if (Pointer.tile === null || Pointer.floor === null) return;

    const result =
      Tool.current === "demolish"
        ? World.demolishAt(Pointer.floor, Pointer.tile)
        : World.placeRoom(Tool.current, Pointer.floor, Pointer.tile);

    UI.reportResult(result);
    draw();
  });
}
