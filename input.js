// Turns raw mouse and touch events into grid coordinates and tool actions.
// This is the only file that converts a screen pixel back into a (tile,
// floor) pair — everywhere else works in grid units already.
//
// Left button = build (this file). Right button = pan the camera (see
// camera.js). Splitting them this way means dragging never accidentally
// scrolls the tower when you meant to lay a floor, or vice versa.
//
// On a touch screen a tap is a click, and dragging a finger builds with
// Floor or Elevator in hand (as a left-drag does) and scrolls otherwise.
// Two fingers always scroll.
//
// Some tools use a drag. Floor, the Planter Strip and Parking drag
// sideways along one level (Parking in whole bays of 4 tiles), and
// Elevator and Staff Lift drag up or down along one column (from an
// existing shaft's end, that extends it). Everything else is a single
// click.
//
// No tool is picked at the start. A right-click that doesn't drag (or Esc,
// or clicking the picked tool's button again; see ui.js) puts the tool
// down, so the mouse is back to just looking. With no tool, clicking (or
// tapping) a studio, condo or hotel room opens its rent panel (ui.js).

const Tool = {
  current: null, // "floor", "sewing", "stairs", ... or null for none
};

// The tools built by dragging: along a floor, or up and down a column.
const DRAG_ALONG_TOOLS = ["floor", "planterStrip", "parking"];
const LIFT_TOOLS = ["elevator", "staffLift"];
function isDragTool(tool) {
  return DRAG_ALONG_TOOLS.includes(tool) || LIFT_TOOLS.includes(tool);
}

// A right-click that moves less than this many pixels is a click, not a pan.
const RIGHT_CLICK_SLOP = 4;
// ...and a finger that moves less than this is a tap (fingers wobble more).
const TAP_SLOP = 10;

const Pointer = {
  tile: null,
  floor: null,
  screenX: 0, // where the mouse is on screen, for placing the tooltip
  screenY: 0,
  overCanvas: false,
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

// What an elevator or staff lift drag (or click) would do right now: build
// a new shaft, or extend an existing one of the same kind.
//
// A drag that starts on a shaft, or just above or below it, in the same
// column extends it to cover every floor dragged over; a click just above
// or below adds that one floor. Anywhere else, the drag's floors are a new
// shaft, and a click without dragging is the smallest one: this floor and
// the one above.
function elevatorPlan(kind = Tool.current) {
  const tile = Pointer.dragging ? Pointer.dragStartTile : Pointer.tile;
  const from = Pointer.dragging ? Pointer.dragStartFloor : Pointer.floor;
  const to = Pointer.floor;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);

  const shaft = World.elevatorToExtend(tile, from, from, kind);
  if (shaft) {
    return {
      kind,
      extend: shaft,
      tile: shaft.tileStart,
      bottom: Math.min(shaft.floorBottom, lo),
      top: Math.max(shaft.floorTop, hi),
    };
  }
  if (lo === hi) return { kind, tile, bottom: lo, top: lo + 1 };
  return { kind, tile, bottom: lo, top: hi };
}

function elevatorPlanCheck(plan) {
  return plan.extend
    ? World.canExtendElevator(plan.extend, plan.bottom, plan.top)
    : World.canPlaceTransit(plan.kind, plan.tile, plan.bottom, plan.top);
}

// What a Planter Strip or Parking drag (or click) would build right now:
// the tiles from where it started to the mouse, along the floor it started
// on. A car park grows a whole bay at a time, away from where the drag
// started, so a click builds one bay.
function roomRunPlan(typeKey = Tool.current) {
  const floor = Pointer.dragging ? Pointer.dragStartFloor : Pointer.floor;
  const start = Pointer.dragging ? Pointer.dragStartTile : Pointer.tile;
  const end = Pointer.tile;
  const bay = ROOM_TYPES[typeKey].bayWidth || 1;
  const width = Math.ceil((Math.abs(end - start) + 1) / bay) * bay;
  const tileStart = end >= start ? start : start - width + 1;
  return { typeKey, floor, tileStart, width };
}

function roomRunCheck(plan) {
  return World.canPlaceRoom(plan.typeKey, plan.floor, plan.tileStart, plan.width);
}

// Where new stairs clicked at (floor, tile) go. Hovering over the floor
// directly above existing stairs snaps to their column, so stacking a
// staircase straight up doesn't need pixel-perfect aim.
function stairsTileAt(floor, tile) {
  const below = World.stairsLandingAt(floor, tile);
  return below ? below.tileStart : tile;
}

// Which tile and floor are under the mouse. Called on every mouse move, and
// every frame (main.js) so scrolling with the keys, which moves the tower
// under a still mouse, keeps aiming at what's under the cursor now.
function updatePointer(canvas) {
  if (!Pointer.overCanvas) return;
  const { tile, floor } = screenToWorld(canvas, Pointer.screenX, Pointer.screenY);
  Pointer.tile = tile;
  Pointer.floor = floor;
}

// Aim at a point on screen, as the mouse being there would.
function aimAt(canvas, clientX, clientY) {
  Pointer.overCanvas = true;
  Pointer.screenX = clientX;
  Pointer.screenY = clientY;
  updatePointer(canvas);
}

// Floor, Elevator and the other drag tools are built by dragging: from
// where the button (or finger) goes down, to where it comes up.
function startBuildDrag() {
  if (!isDragTool(Tool.current)) return;
  Pointer.dragging = true;
  Pointer.dragStartTile = Pointer.tile;
  Pointer.dragStartFloor = Pointer.floor;
}

function finishBuildDrag() {
  if (Tool.current === "floor" && Pointer.dragging) {
    const start = Math.min(Pointer.dragStartTile, Pointer.tile);
    const end = Math.max(Pointer.dragStartTile, Pointer.tile);
    UI.reportResult(World.buildFloorRun(Pointer.dragStartFloor, start, end));
  }

  if (LIFT_TOOLS.includes(Tool.current) && Pointer.dragging) {
    const plan = elevatorPlan();
    UI.reportResult(
      plan.extend
        ? World.extendElevator(plan.extend, plan.bottom, plan.top)
        : World.placeTransit(plan.kind, plan.tile, plan.bottom, plan.top),
    );
  }

  if (ROOM_TYPES[Tool.current] && Pointer.dragging) {
    const plan = roomRunPlan();
    UI.reportResult(World.placeRoom(plan.typeKey, plan.floor, plan.tileStart, plan.width));
  }
  cancelBuildDrag();
}

function cancelBuildDrag() {
  Pointer.dragging = false;
  Pointer.dragStartTile = null;
  Pointer.dragStartFloor = null;
  if (!Pointer.overCanvas) {
    Pointer.tile = null;
    Pointer.floor = null;
  }
}

// A plain click (no drag) handles everything except the drag tools. With
// no tool, it opens the rent panel of the studio, condo or hotel room
// clicked (or closes the panel, clicking anywhere else).
function clickBuild() {
  if (isDragTool(Tool.current)) return;
  if (Pointer.tile === null || Pointer.floor === null) return;
  if (!Tool.current) {
    const room = World.roomAt(Pointer.floor, Pointer.tile);
    if (room && hasRentLevel(room)) UI.openRoomPanel(room);
    else UI.closeRoomPanel();
    return;
  }

  let result;
  if (Tool.current === "demolish") {
    result = World.demolishAt(Pointer.floor, Pointer.tile);
  } else if (Tool.current === "stairs") {
    result = World.placeTransit("stairs", stairsTileAt(Pointer.floor, Pointer.tile), Pointer.floor, Pointer.floor + 1);
  } else {
    result = World.placeRoom(Tool.current, Pointer.floor, Pointer.tile);
  }
  UI.reportResult(result);
}

function attachBuildControls(canvas) {
  canvas.addEventListener("mousemove", (e) => aimAt(canvas, e.clientX, e.clientY));

  // Off the canvas (over the toolbar, or out of the window) nothing is
  // hovered, so the tooltip goes away. Mid-drag, the drag keeps the last
  // spot it was over, so letting go over the toolbar builds up to the edge
  // rather than from tile 0.
  canvas.addEventListener("mouseleave", () => {
    Pointer.overCanvas = false;
    if (Pointer.dragging) return;
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
    aimAt(canvas, e.clientX, e.clientY);
    startBuildDrag();
  });

  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) finishBuildDrag();
  });
  // A button let go in another window never reports its mouseup here, so
  // losing focus mid-drag drops the drag (builds nothing) rather than
  // leaving it stuck to the mouse.
  window.addEventListener("blur", cancelBuildDrag);

  // The drag tools were already handled on mouseup above.
  canvas.addEventListener("click", clickBuild);

  // Touch. The page's own scrolling and zooming are off over the canvas
  // (touch-action in index.html), and each handler calls preventDefault,
  // so the browser doesn't also send its pretend mouse events afterwards
  // and build everything twice. `touch` follows the gesture: where its
  // fingers were last (their middle, with two), whether it has moved far
  // enough not to be a tap, and whether it's a build drag.
  let touch = null;
  const middle = (touches) => {
    let x = 0;
    let y = 0;
    for (const t of touches) {
      x += t.clientX;
      y += t.clientY;
    }
    return { x: x / touches.length, y: y / touches.length };
  };

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const at = middle(e.touches);
    if (e.touches.length === 1) {
      aimAt(canvas, at.x, at.y);
      startBuildDrag();
      touch = { ...at, startX: at.x, startY: at.y, moved: false, build: Pointer.dragging };
    } else {
      // A second finger: the gesture is a scroll now, and builds nothing.
      cancelBuildDrag();
      touch = { ...at, startX: at.x, startY: at.y, moved: true, build: false };
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!touch) return;
    const at = middle(e.touches);
    if (Math.hypot(at.x - touch.startX, at.y - touch.startY) >= TAP_SLOP) touch.moved = true;
    if (touch.build) {
      aimAt(canvas, at.x, at.y);
    } else if (touch.moved) {
      Camera.pan(-(at.x - touch.x), -(at.y - touch.y)); // as with the right button
    }
    touch.x = at.x;
    touch.y = at.y;
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    if (!touch) return;
    if (e.touches.length > 0) {
      // One of two fingers lifted: carry on scrolling from the other.
      Object.assign(touch, middle(e.touches));
      return;
    }
    // A tap with nothing in hand leaves the room under it hovered, so its
    // tooltip shows.
    if (touch.build) finishBuildDrag();
    else if (!touch.moved) clickBuild();
    touch = null;
  }, { passive: false });

  canvas.addEventListener("touchcancel", () => {
    cancelBuildDrag();
    touch = null;
  });
}
