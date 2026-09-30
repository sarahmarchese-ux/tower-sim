// Turns raw mouse events into grid coordinates and tool actions. This is the
// only file that converts a screen pixel back into a (tile, floor) pair —
// everywhere else works in grid units already.
//
// Left button = build (this file). Right button = pan the camera (see
// camera.js). Splitting them this way means dragging never accidentally
// scrolls the tower when you meant to lay a floor, or vice versa.
//
// Two tools use a drag: Floor drags sideways along one level, and Elevator
// drags up or down along one column (from an existing shaft's end, that
// extends it). Everything else is a single click.
//
// No tool is picked at the start. A right-click that doesn't drag (or Esc,
// or clicking the picked tool's button again; see ui.js) puts the tool
// down, so the mouse is back to just looking.

const Tool = {
  current: null, // "floor", "sewing", "stairs", ... or null for none
};

// A right-click that moves less than this many pixels is a click, not a pan.
const RIGHT_CLICK_SLOP = 4;

const Pointer = {
  tile: null,
  floor: null,
  screenX: 0, // where the mouse is on screen, for placing the tooltip
  screenY: 0,
  dragStartTile: null,
  dragStartFloor: null,
  dragging: false,
  buildCheck: null, // why the hovered build would be refused, if it would (see render.js)
  buildNote: null, // what the hovered build would do, when that's not obvious
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

// What an elevator drag (or click) would do right now: build a new shaft,
// or extend an existing one.
//
// A drag that starts on a shaft, or just above or below it, in the same
// column extends it to cover every floor dragged over; a click just above
// or below adds that one floor. Anywhere else, the drag's floors are a new
// shaft, and a click without dragging is the smallest one: this floor and
// the one above.
function elevatorPlan() {
  const tile = Pointer.dragging ? Pointer.dragStartTile : Pointer.tile;
  const from = Pointer.dragging ? Pointer.dragStartFloor : Pointer.floor;
  const to = Pointer.floor;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);

  const shaft = World.elevatorToExtend(tile, from, from);
  if (shaft) {
    return {
      extend: shaft,
      tile: shaft.tileStart,
      bottom: Math.min(shaft.floorBottom, lo),
      top: Math.max(shaft.floorTop, hi),
    };
  }
  if (lo === hi) return { tile, bottom: lo, top: lo + 1 };
  return { tile, bottom: lo, top: hi };
}

function elevatorPlanCheck(plan) {
  return plan.extend
    ? World.canExtendElevator(plan.extend, plan.bottom, plan.top)
    : World.canPlaceTransit("elevator", plan.tile, plan.bottom, plan.top);
}

// Where new stairs clicked at (floor, tile) go. Hovering over the floor
// directly above existing stairs snaps to their column, so stacking a
// staircase straight up doesn't need pixel-perfect aim.
function stairsTileAt(floor, tile) {
  const below = World.transit.find(
    (t) =>
      t.kind === "stairs" &&
      t.floorTop === floor &&
      tile >= t.tileStart &&
      tile < t.tileStart + TRANSIT_TYPES.stairs.width,
  );
  return below ? below.tileStart : tile;
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

  // Right button: dragging pans (camera.js); a plain click puts the tool down.
  let rightDownAt = null;
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) rightDownAt = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button !== 2 || !rightDownAt) return;
    const moved = Math.hypot(e.clientX - rightDownAt.x, e.clientY - rightDownAt.y);
    rightDownAt = null;
    if (moved < RIGHT_CLICK_SLOP) UI.selectTool(null);
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
      const plan = elevatorPlan();
      UI.reportResult(
        plan.extend
          ? World.extendElevator(plan.extend, plan.bottom, plan.top)
          : World.placeTransit("elevator", plan.tile, plan.bottom, plan.top),
      );
    }

    Pointer.dragging = false;
    Pointer.dragStartTile = null;
    Pointer.dragStartFloor = null;
  });

  // A plain click (no drag) handles everything except the two drag tools,
  // which were already handled on mouseup above.
  canvas.addEventListener("click", () => {
    if (!Tool.current || Tool.current === "floor" || Tool.current === "elevator") return;
    if (Pointer.tile === null || Pointer.floor === null) return;

    let result;
    if (Tool.current === "demolish") {
      result = World.demolishAt(Pointer.floor, Pointer.tile);
    } else if (Tool.current === "stairs") {
      result = World.placeTransit("stairs", stairsTileAt(Pointer.floor, Pointer.tile), Pointer.floor, Pointer.floor + 1);
    } else {
      result = World.placeRoom(Tool.current, Pointer.floor, Pointer.tile);
    }
    UI.reportResult(result);
  });
}
