// The one continuous heartbeat: each animation frame, poll held keys for
// camera panning, move the simulation forward, and redraw. Before milestone
// 3, the game only redrew in reaction to something the player did (a click,
// a drag, a resize) — fine when nothing changes on its own, but the clock
// needs to keep ticking, and people need to keep moving, whether or not the
// player touches anything.

// If the tab was in the background, the next frame can arrive seconds late.
// Rather than simulating all of that in one lurch, cap how much real time a
// single frame is allowed to cover.
const MAX_FRAME_MS = 250;

// The simulation always moves in steps of at most this many game minutes,
// however fast the game is running. At 3x speed a frame covers more game
// time, so it just takes more steps — each one small enough that nobody
// walks through a wall or overshoots a floor.
const SIM_STEP_MINUTES = 0.25;

function advanceSimulation(minutes) {
  let remaining = minutes;
  while (remaining > 1e-9) {
    const step = Math.min(remaining, SIM_STEP_MINUTES);
    Clock.advance(step);
    Elevators.update(step);
    People.update(step);
    remaining -= step;
  }
}

let lastFrameTime = performance.now();

function frame(now) {
  const deltaMs = Math.min(now - lastFrameTime, MAX_FRAME_MS);
  lastFrameTime = now;

  Camera.pollKeys();
  advanceSimulation(Clock.gameMinutesFor(deltaMs));
  draw();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
