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
    const money = document.getElementById("money");
    money.textContent = World.formatMoney(World.money);
    money.classList.toggle("in-debt", World.money < 0);

    // Rent building up towards Sunday night's payday.
    const due = Economy.rentDue();
    document.getElementById("ledger").textContent = due > 0 ? `(rent due Sun night +${World.formatMoney(due)})` : "";

    // In the red: count down to bankruptcy.
    const left = Economy.minutesUntilBankrupt();
    let warning = "";
    if (left !== null) {
      const days = Math.floor(left / MINUTES_PER_DAY);
      const hours = Math.floor((left % MINUTES_PER_DAY) / 60);
      warning = `· bankrupt in ${days}d ${hours}h`;
    }
    document.getElementById("debt").textContent = warning;
  },

  showGameOver() {
    this.setSpeed(0);
    document.getElementById("gameover").classList.add("shown");
  },

  updateClock() {
    document.getElementById("clock-label").textContent = Clock.label();
  },

  updatePopulation() {
    document.getElementById("population").textContent = `Pop ${People.population()}`;
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

  attachGameOver() {
    // A fresh start is just a fresh page: nothing is saved yet (that's
    // milestone 7), so reloading gives a brand-new empty lot.
    document.getElementById("restart-btn").addEventListener("click", () => location.reload());
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
      if (e.target.tagName === "INPUT" || Economy.bankrupt) return;
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
