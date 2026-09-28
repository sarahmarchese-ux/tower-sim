// Step 0: "hello tower". This just proves the page loads and draws something —
// no game logic yet. Milestone 1 replaces this with the real grid and camera.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// The canvas has its own pixel grid separate from the CSS size of the page.
// Whenever the window resizes, we tell the canvas to match it and redraw.
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
}

function draw() {
  const w = canvas.width;
  const h = canvas.height;
  const groundY = h * 0.75;

  // Sky: a vertical gradient from a lunchtime blue to a paler horizon.
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, "#4a90d9");
  sky.addColorStop(1, "#bfe3f7");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, groundY);

  // Ground, below the horizon line.
  ctx.fillStyle = "#6b5b4a";
  ctx.fillRect(0, groundY, w, h - groundY);

  // A single placeholder building block, standing on the ground, centered.
  const towerWidth = 120;
  const towerHeight = 220;
  const towerX = w / 2 - towerWidth / 2;
  const towerY = groundY - towerHeight;
  ctx.fillStyle = "#e8dcc8";
  ctx.fillRect(towerX, towerY, towerWidth, towerHeight);
  ctx.strokeStyle = "#8a7a63";
  ctx.lineWidth = 2;
  ctx.strokeRect(towerX, towerY, towerWidth, towerHeight);

  // Title text.
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Tower Sim", w / 2, 60);
  ctx.font = "14px sans-serif";
  ctx.fillText("milestone 0 — the page loads", w / 2, 84);
}

window.addEventListener("resize", resize);
resize();
