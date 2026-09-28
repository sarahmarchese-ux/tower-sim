// The toolbar, money display, and status hint are ordinary HTML elements
// layered over the canvas (see index.html), not drawn on it. Buttons, text
// and hover states are things browsers already know how to do well — no
// reason to reinvent them in canvas drawing code.

const UI = {
  defaultHint: "Left-click, or drag, to build. Right-click/drag or WASD/arrows to scroll.",

  // An error (e.g. "Build the floor here first") shows for a few seconds,
  // then the hint goes back to the default or to the room being hovered.
  showHint(message) {
    const el = document.getElementById("hint");
    el.textContent = message || this.defaultHint;
    el.classList.toggle("hint-error", !!message);
    clearTimeout(this._hintTimer);
    if (message) this._hintTimer = setTimeout(() => this.showHint(null), 4000);
  },

  // Hovering a room with tenants shows who's there, how stressed they are,
  // and (for condos) how much noise reaches it; unless an error is showing.
  updateInspect() {
    const el = document.getElementById("hint");
    if (el.classList.contains("hint-error")) return;
    const room = Pointer.floor !== null && World.roomAt(Pointer.floor, Pointer.tile);
    el.textContent = room && ROOM_TYPES[room.type].tenants > 0 ? this.describeRoom(room) : this.defaultHint;
  },

  describeRoom(room) {
    const type = ROOM_TYPES[room.type];
    const parts = [type.name];
    if (room.status === "vacant") parts.push(type.salePrice ? "for sale" : "for rent");
    else if (room.status === "movingIn") parts.push("moving in");
    else {
      const average = Stress.roomAverage(room);
      if (average !== null) parts.push(`stress ${Math.round(average)} (${Stress.band(average)})`);
    }
    if (type.role === "resident") parts.push(`noise here: ${Stress.noiseAt(room)}`);
    else if (type.noise > 0) parts.push(`makes noise ${type.noise}`);
    else parts.push("quiet");
    if (!Routing.isReachable(room)) parts.push("can't be reached from a lobby");
    return parts.join(" · ");
  },

  // A message across the top of the screen (a new star, say) that fades
  // after a while or when clicked.
  announce(message) {
    const el = document.getElementById("banner");
    el.textContent = message;
    el.classList.add("shown");
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => el.classList.remove("shown"), 8000);
  },

  attachBanner() {
    const el = document.getElementById("banner");
    el.addEventListener("click", () => el.classList.remove("shown"));
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
    SaveGame.clear(); // a bankrupt tower isn't worth coming back to
    this.setSpeed(0);
    document.getElementById("gameover").classList.add("shown");
  },

  updateClock() {
    document.getElementById("clock-label").textContent = Clock.label();
  },

  updatePopulation() {
    document.getElementById("stars").textContent = "★".repeat(Ratings.stars);
    const next = Ratings.nextTarget();
    const population = People.population();
    document.getElementById("population").textContent = next
      ? `Pop ${population} / ${next.population} for ${next.stars}★`
      : `Pop ${population}`;
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

  // A fresh start is a fresh page with the save thrown away.
  startOver() {
    SaveGame.discarded = true;
    SaveGame.clear();
    location.reload();
  },

  attachGameOver() {
    document.getElementById("restart-btn").addEventListener("click", () => this.startOver());
  },

  attachSaveControls() {
    const saveBtn = document.getElementById("save-btn");
    saveBtn.addEventListener("click", () => {
      const ok = SaveGame.save();
      saveBtn.textContent = ok ? "Saved" : "Can't save";
      saveBtn.classList.toggle("saved", ok);
      setTimeout(() => {
        saveBtn.textContent = "Save";
        saveBtn.classList.remove("saved");
      }, 1500);
    });
    document.getElementById("new-btn").addEventListener("click", () => {
      if (confirm("Start a new game? Your current tower and its save will be lost.")) this.startOver();
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
