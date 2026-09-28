// The camera decides which part of the (in principle infinite) grid is
// visible on screen right now, and lets the player scroll around.
//
// camera.x / camera.y are pixel offsets, in the same coordinate system as
// Grid.tileToX / Grid.floorToY. Moving the camera just changes these two
// numbers — nothing about the grid or the building itself ever moves.
//
// The one wrinkle: Grid.floorToY(0) = 0, i.e. "world y = 0" is ground level.
// But we want the ground to appear near the BOTTOM of the screen, not at the
// very top. So camera.y starts as a negative number: it's the world y that
// should land at screen y = 0, and making it negative pushes world y = 0
// (the ground) down to a positive screen position.

const Camera = {
  x: 0,
  y: 0,

  // Call once, when we know the canvas size, to center the view sensibly:
  // ground a little below the middle of the screen, tile 0 in the middle.
  reset(canvasWidth, canvasHeight) {
    this.x = -canvasWidth / 2;
    this.y = -canvasHeight * 0.75;
  },

  // World-space (grid pixel) -> screen pixel.
  worldToScreenX(worldX) {
    return worldX - this.x;
  },
  worldToScreenY(worldY) {
    return worldY - this.y;
  },

  pan(dx, dy) {
    this.x += dx;
    this.y += dy;
  },
};

// --- Input handling -------------------------------------------------------
// Two ways to scroll: right-click drag, or hold an arrow key / WASD. The
// left button is reserved for building (see input.js) — splitting them this
// way means a drag never has to guess whether you meant to pan or build.
// Camera itself knows nothing about input devices, which keeps it easy to
// test or swap out later (e.g. touch drag).

function attachCameraControls(canvas) {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 2) return; // right button only; left button builds
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button !== 2) return;
    dragging = false;
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    // Dragging right should reveal what's to the left, so the camera moves
    // opposite to the mouse movement.
    Camera.pan(-(e.clientX - lastX), -(e.clientY - lastY));
    lastX = e.clientX;
    lastY = e.clientY;
    draw();
  });

  const heldKeys = new Set();
  window.addEventListener("keydown", (e) => heldKeys.add(e.key));
  window.addEventListener("keyup", (e) => heldKeys.delete(e.key));

  const PAN_SPEED = 8; // pixels per animation frame
  function tick() {
    let dx = 0;
    let dy = 0;
    if (heldKeys.has("ArrowLeft") || heldKeys.has("a")) dx -= PAN_SPEED;
    if (heldKeys.has("ArrowRight") || heldKeys.has("d")) dx += PAN_SPEED;
    if (heldKeys.has("ArrowUp") || heldKeys.has("w")) dy -= PAN_SPEED;
    if (heldKeys.has("ArrowDown") || heldKeys.has("s")) dy += PAN_SPEED;
    if (dx !== 0 || dy !== 0) {
      Camera.pan(dx, dy);
      draw();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
