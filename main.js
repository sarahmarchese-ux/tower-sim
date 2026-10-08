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
  if (Economy.bankrupt) return; // the game is over; time stops
  let remaining = minutes;
  while (remaining > 1e-9) {
    const step = Math.min(remaining, SIM_STEP_MINUTES);
    Clock.advance(step);
    Elevators.update(step);
    People.update(step);
    Shops.update();
    Hotels.update();
    Security.update();
    Stress.update(step);
    Economy.update();
    Ratings.update();
    if (Economy.bankrupt) {
      UI.showGameOver();
      return;
    }
    remaining -= step;
  }
}

let lastFrameTime = performance.now();

function frame(now) {
  const deltaMs = Math.min(now - lastFrameTime, MAX_FRAME_MS);
  lastFrameTime = now;

  Camera.pollKeys();
  updatePointer(canvas); // the camera may have moved under a still mouse
  advanceSimulation(Clock.gameMinutesFor(deltaMs));
  SaveGame.autosave();
  draw();

  requestAnimationFrame(frame);
}

// Pick up where the last session left off. A restored game starts paused,
// so nothing happens before you're ready.
if (SaveGame.load()) {
  UI.setSpeed(0);
  const note = SaveGame.refundNote ? ` ${SaveGame.refundNote}` : "";
  UI.announce(`Welcome back! Your tower is as you left it.${note} Press Play (or space) to carry on.`);
} else {
  SaveGame.lastSavedDay = Clock.day;
}

// Closing or switching away from the tab saves too, so you never lose more
// than you'd expect. (Not after "New game" or bankruptcy: SaveGame.save
// checks for both.)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") SaveGame.save();
});
window.addEventListener("pagehide", () => SaveGame.save());

requestAnimationFrame(frame);
