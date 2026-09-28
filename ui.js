// The toolbar, money display, and status hint are ordinary HTML elements
// layered over the canvas (see index.html), not drawn on it. Buttons, text
// and hover states are things browsers already know how to do well — no
// reason to reinvent them in canvas drawing code.

const UI = {
  defaultHint: "Left-click, or drag, to build. Right-click/drag or WASD/arrows to scroll.",

  showHint(message) {
    const el = document.getElementById("hint");
    el.textContent = message || this.defaultHint;
    el.classList.toggle("hint-error", !!message);
  },

  reportResult(result) {
    this.showHint(result.ok ? null : result.reason);
    if (result.ok) this.updateMoney();
  },

  updateMoney() {
    document.getElementById("money").textContent = World.formatMoney(World.money);
  },

  updateClock() {
    document.getElementById("clock-label").textContent = Clock.label();
  },

  // Pause/play and speed buttons all need to agree on which one is
  // "active", so every path that changes the speed goes through this one
  // function to update both the clock and the buttons together.
  setSpeed(speed) {
    Clock.setSpeed(speed);
    document.getElementById("pause-btn").textContent = speed === 0 ? "Play" : "Pause";
    document.querySelectorAll(".speed-btn").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.speed) === speed && speed !== 0);
    });
  },

  attachClockControls() {
    const pauseBtn = document.getElementById("pause-btn");
    pauseBtn.addEventListener("click", () => {
      Clock.togglePause();
      this.setSpeed(Clock.speed);
    });

    document.querySelectorAll(".speed-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.setSpeed(Number(btn.dataset.speed)));
    });

    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === " ") {
        e.preventDefault();
        Clock.togglePause();
        this.setSpeed(Clock.speed);
      } else if (e.key === "1") {
        this.setSpeed(1);
      } else if (e.key === "3") {
        this.setSpeed(3);
      }
    });
  },

  attachToolbar() {
    const buttons = document.querySelectorAll("#toolbar button[data-tool]");
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        Tool.current = button.dataset.tool;
        buttons.forEach((b) => b.classList.toggle("active", b === button));
        this.showHint(null);
      });
    });
    // "floor" is the default tool, so its button should look selected
    // before the player has clicked anything.
    document.querySelector('#toolbar button[data-tool="floor"]').classList.add("active");
  },
};
