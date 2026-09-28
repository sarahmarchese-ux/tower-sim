// Milestone 1: draws the grid itself — floor lines, tile columns, the
// ground, and a ruler of floor numbers — instead of a fixed placeholder
// scene. This is the surface everything else (rooms, people, elevators)
// will be drawn on top of, so it needs to be right before we build on it.

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
  drawFloorLabels(h);
  drawHud();
}

function drawSky(w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#4a90d9");
  sky.addColorStop(1, "#bfe3f7");
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

function drawHud() {
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Tower Sim", canvas.width / 2, 32);
  ctx.font = "13px sans-serif";
  ctx.fillText(
    "milestone 1 — grid & camera. Drag, or use arrow keys / WASD, to scroll.",
    canvas.width / 2,
    52
  );
}

window.addEventListener("resize", resize);
Camera.reset(window.innerWidth, window.innerHeight);
attachCameraControls(canvas);
resize();
