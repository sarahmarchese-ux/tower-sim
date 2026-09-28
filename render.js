// Draws everything: the grid itself (floor lines, tile columns, the ground,
// a ruler of floor numbers — milestone 1), plus what's been built on it and
// a live preview of what the selected tool would do next (milestone 2).
// This file only draws; World (world.js) decides what's true, and input.js
// decides what the player is doing.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// How many floors/tiles to draw above and below/around whatever's on
// screen. A little slack means fast scrolling never shows a blank edge.
const DRAW_MARGIN_FLOORS = 2;
const DRAW_MARGIN_TILES = 2;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
}

function draw() {
  const w = canvas.width;
  const h = canvas.height;

  drawSky(w, h);
  drawFloorLines(w, h);
  drawTileLines(w, h);
  drawGroundHighlight(w, h);
  drawBuiltFloors(w, h);
  drawRooms(w, h);
  drawHoverPreview(w, h);
  drawFloorLabels(h);
  UI.updateMoney();
  UI.updateClock();
}

// Sky color keyframes through the day, keyed by hour. Drawn colors between
// two keyframes are interpolated, so the sky shifts continuously rather
// than snapping. The first and last keyframe (0 and 24) share the same
// colors, so the cycle wraps around midnight without a visible seam.
const SKY_KEYFRAMES = [
  { hour: 0, top: "#0b1026", bottom: "#1b2550" }, // midnight
  { hour: 5, top: "#2b3a67", bottom: "#e8935f" }, // dawn
  { hour: 7, top: "#4a90d9", bottom: "#bfe3f7" }, // morning
  { hour: 12, top: "#4a90d9", bottom: "#bfe3f7" }, // midday
  { hour: 17, top: "#4a80c9", bottom: "#e8935f" }, // dusk begins
  { hour: 19, top: "#2b3a67", bottom: "#5b4b8a" }, // dusk ends
  { hour: 21, top: "#0b1026", bottom: "#1b2550" }, // night
  { hour: 24, top: "#0b1026", bottom: "#1b2550" }, // wraps to midnight
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(hexA, hexB, t) {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function skyColorsAt(hour) {
  for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
    const a = SKY_KEYFRAMES[i];
    const b = SKY_KEYFRAMES[i + 1];
    if (hour >= a.hour && hour <= b.hour) {
      const t = (hour - a.hour) / (b.hour - a.hour);
      return { top: lerpColor(a.top, b.top, t), bottom: lerpColor(a.bottom, b.bottom, t) };
    }
  }
  return SKY_KEYFRAMES[0];
}

function drawSky(w, h) {
  const { top, bottom } = skyColorsAt(Clock.hour);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, top);
  sky.addColorStop(1, bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
}

// Horizontal lines, one per floor boundary, across the whole visible height.
function drawFloorLines(w, h) {
  const topFloor = Grid.yToFloor(Camera.y) + DRAW_MARGIN_FLOORS;
  const bottomFloor = Grid.yToFloor(Camera.y + h) - DRAW_MARGIN_FLOORS;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1;
  for (let floor = bottomFloor; floor <= topFloor; floor++) {
    const y = Camera.worldToScreenY(Grid.floorToY(floor));
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

// Vertical lines, one per tile boundary. Drawn faint so they read as a grid,
// not as walls — actual room walls come later.
function drawTileLines(w, h) {
  const leftTile = Grid.xToTile(Camera.x) - DRAW_MARGIN_TILES;
  const rightTile = Grid.xToTile(Camera.x + w) + DRAW_MARGIN_TILES;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  for (let tile = leftTile; tile <= rightTile; tile++) {
    const x = Camera.worldToScreenX(Grid.tileToX(tile));
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

// Ground level (the boundary between floor 0 and basement floor -1) gets a
// solid line and a tinted fill below it, so "underground" reads at a glance.
function drawGroundHighlight(w, h) {
  const groundY = Camera.worldToScreenY(Grid.floorToY(0));
  ctx.fillStyle = "rgba(107, 91, 74, 0.5)";
  ctx.fillRect(0, groundY, w, h - groundY);
  ctx.strokeStyle = "#6b5b4a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();
}

// A ruler of floor numbers down the left edge, like the original game's
// floor indicator. Makes it obvious which floor you're looking at while
// scrolling.
function drawFloorLabels(h) {
  const topFloor = Grid.yToFloor(Camera.y) + DRAW_MARGIN_FLOORS;
  const bottomFloor = Grid.yToFloor(Camera.y + h) - DRAW_MARGIN_FLOORS;

  ctx.fillStyle = "#ffffff";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let floor = bottomFloor; floor <= topFloor; floor++) {
    const yTop = Camera.worldToScreenY(Grid.floorToY(floor));
    const yBottom = Camera.worldToScreenY(Grid.floorToY(floor + 1));
    const label = floor >= 0 ? `${floor + 1}F` : `B${-floor}`;
    ctx.fillText(label, 6, (yTop + yBottom) / 2);
  }
}

// Built floor tiles get a light fill, so an empty-but-built tile reads
// differently from bare sky/grid before anything is placed on it.
function drawBuiltFloors(w, h) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  for (const [floor, tiles] of World.floors) {
    const yTop = Camera.worldToScreenY(Grid.floorToY(floor + 1));
    const yBottom = Camera.worldToScreenY(Grid.floorToY(floor));
    if (yBottom < 0 || yTop > h) continue; // whole floor off-screen
    for (const tile of tiles) {
      const x = Camera.worldToScreenX(Grid.tileToX(tile));
      if (x + Grid.TILE_SIZE < 0 || x > w) continue; // tile off-screen
      ctx.fillRect(x, yTop, Grid.TILE_SIZE, yBottom - yTop);
    }
  }
}

function drawRooms(w, h) {
  for (const room of World.rooms) {
    const type = ROOM_TYPES[room.type];
    const box = roomScreenBox(room, type);
    if (box.right < 0 || box.left > w || box.bottom < 0 || box.top > h) continue;

    ctx.fillStyle = type.color;
    ctx.fillRect(box.left, box.top, box.width, box.height);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(box.left, box.top, box.width, box.height);

    ctx.fillStyle = "#2b2b2b";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(type.name, box.left + box.width / 2, box.top + box.height / 2, box.width - 6);
  }
}

function roomScreenBox(room, type) {
  const tileEnd = room.tileStart + type.width - 1;
  const left = Camera.worldToScreenX(Grid.tileToX(room.tileStart));
  const right = Camera.worldToScreenX(Grid.tileToX(tileEnd + 1));
  const top = Camera.worldToScreenY(Grid.floorToY(room.floor + 1));
  const bottom = Camera.worldToScreenY(Grid.floorToY(room.floor));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

// What the currently selected tool would do at the mouse's current
// position, colored green if it's a legal move and red if it isn't — so you
// find out a placement is invalid before you click, not after.
function drawHoverPreview(w, h) {
  if (Pointer.tile === null || Pointer.floor === null) return;

  if (Tool.current === "floor") {
    const start = Pointer.dragging ? Math.min(Pointer.dragStartTile, Pointer.tile) : Pointer.tile;
    const end = Pointer.dragging ? Math.max(Pointer.dragStartTile, Pointer.tile) : Pointer.tile;
    drawFootprintPreview(Pointer.floor, start, end, true);
    return;
  }

  if (Tool.current === "demolish") {
    const hasTarget = World.roomAt(Pointer.floor, Pointer.tile) || World.isFloorBuilt(Pointer.floor, Pointer.tile);
    drawFootprintPreview(Pointer.floor, Pointer.tile, Pointer.tile, !!hasTarget);
    return;
  }

  const type = ROOM_TYPES[Tool.current];
  if (!type) return;
  const check = World.canPlaceRoom(Tool.current, Pointer.floor, Pointer.tile);
  const tileEnd = Pointer.tile + type.width - 1;
  drawFootprintPreview(Pointer.floor, Pointer.tile, tileEnd, check.ok);
}

function drawFootprintPreview(floor, tileStart, tileEnd, valid) {
  const left = Camera.worldToScreenX(Grid.tileToX(tileStart));
  const right = Camera.worldToScreenX(Grid.tileToX(tileEnd + 1));
  const top = Camera.worldToScreenY(Grid.floorToY(floor + 1));
  const bottom = Camera.worldToScreenY(Grid.floorToY(floor));

  ctx.fillStyle = valid ? "rgba(80, 200, 120, 0.35)" : "rgba(220, 70, 70, 0.35)";
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.strokeStyle = valid ? "#3ea45c" : "#c94444";
  ctx.lineWidth = 2;
  ctx.strokeRect(left, top, right - left, bottom - top);
}

window.addEventListener("resize", resize);
Camera.reset(window.innerWidth, window.innerHeight);
attachCameraControls(canvas);
attachBuildControls(canvas);
UI.attachToolbar();
UI.attachClockControls();
UI.showHint(null);
resize();
