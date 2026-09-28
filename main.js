// The one continuous heartbeat: each animation frame, poll held keys for
// camera panning, advance the game clock, and redraw. Before this, the game
// only redrew in reaction to something the player did (a click, a drag, a
// resize) — fine when nothing changes on its own, but the clock needs to
// keep ticking, and the sky needs to keep shifting, whether or not the
// player touches anything.

let lastFrameTime = performance.now();

function frame(now) {
  const deltaMs = now - lastFrameTime;
  lastFrameTime = now;

  Camera.pollKeys();
  Clock.update(deltaMs);
  draw();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
