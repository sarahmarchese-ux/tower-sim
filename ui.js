// The toolbar, money display, and status hint are ordinary HTML elements
// layered over the canvas (see index.html), not drawn on it. Buttons, text
// and hover states are things browsers already know how to do well — no
// reason to reinvent them in canvas drawing code.

const UI = {
  defaultHint: "Pick something to build below (Esc or right-click puts it down). Right-drag or WASD/arrows to scroll. Hover a room for details.",

  // An error (e.g. "Build the floor here first") shows for a few seconds,
  // then the hint goes back to the default or to the room being hovered.
  showHint(message) {
    const el = document.getElementById("hint");
    el.textContent = message || this.defaultHint;
    el.classList.toggle("hint-error", !!message);
    clearTimeout(this._hintTimer);
    if (message) this._hintTimer = setTimeout(() => this.showHint(null), 4000);
  },

  // Hovering a room with tenants shows a tooltip beside the mouse: who's
  // there, how stressed they are, and (for condos) how much noise reaches
  // it. A room nobody can reach (the red "!") also says how to fix that.
  updateInspect() {
    const tip = document.getElementById("tooltip");
    const room = Pointer.floor !== null && World.roomAt(Pointer.floor, Pointer.tile);
    const tenanted = room && ROOM_TYPES[room.type].tenants > 0;
    tip.textContent = "";

    if (tenanted && !Pointer.dragging) {
      tip.textContent = this.describeRoom(room);
      if (!Routing.isReachable(room)) this.addWarning(tip, "! " + this.unreachableAdvice(room));
    } else if (Pointer.buildCheck && !Pointer.buildCheck.ok) {
      // A build that would be refused says why, right where you're aiming,
      // before you click.
      this.addWarning(tip, Pointer.buildCheck.reason);
    } else if (Pointer.buildNote) {
      tip.textContent = Pointer.buildNote;
    } else {
      tip.classList.remove("shown");
      return;
    }
    tip.classList.add("shown");
    this.placeTooltip(tip);
  },

  addWarning(tip, text) {
    const warn = document.createElement("div");
    warn.className = "warn";
    warn.textContent = text;
    tip.appendChild(warn);
  },

  placeTooltip(tip) {
    // Just below and right of the cursor, flipped to the other side near
    // the window's right or bottom edge so it never goes off-screen.
    const gap = 14;
    let x = Pointer.screenX + gap;
    let y = Pointer.screenY + gap;
    if (x + tip.offsetWidth > window.innerWidth - 4) x = Pointer.screenX - gap - tip.offsetWidth;
    if (y + tip.offsetHeight > window.innerHeight - 4) y = Pointer.screenY - gap - tip.offsetHeight;
    tip.style.left = `${Math.max(4, x)}px`;
    tip.style.top = `${Math.max(4, y)}px`;
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
    if (room.type === "shop" && room.status === "occupied") {
      parts.splice(1, 0, Shops.isOpen(room) ? "open" : "closed"); // right after its name
      const shoppers = Shops.shoppersFor(room);
      if (shoppers > 0) parts.push(`${shoppers} shopper${shoppers === 1 ? "" : "s"}`);
      let sales = `sales today ${World.formatMoney(room.till || 0)}`;
      if (room.salesYesterday !== undefined) sales += ` (yesterday ${World.formatMoney(room.salesYesterday)})`;
      parts.push(sales);
    }
    if (type.role === "resident") {
      // Studios are only noisy while their makers work, so show both.
      const now = Stress.noiseAt(room);
      const working = Stress.noiseAt(room, true);
      parts.push(now === working ? `noise here: ${now}` : `noise here: ${now} now, ${working} in working hours`);
    }
    else if (type.noise > 0) parts.push(`makes noise ${type.noise}`);
    else parts.push("quiet");
    return parts.join(" · ");
  },

  // Nobody moves into a room they can't walk to from a lobby. The usual
  // reasons, most basic first.
  unreachableAdvice(room) {
    if (!World.rooms.some((r) => r.type === "lobby")) {
      return "Can't be reached: there's no Lobby yet. Build one on the ground floor so people can enter the tower.";
    }
    // Which floors can be climbed to from a lobby floor, ignoring walking?
    // Stairs join just their two floors; an elevator joins every floor it
    // spans.
    const reached = new Set(World.rooms.filter((r) => r.type === "lobby").map((r) => r.floor));
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of World.transit) {
        const floors = t.kind === "stairs" ? [t.floorBottom, t.floorTop] : range(t.floorBottom, t.floorTop);
        if (floors.some((f) => reached.has(f)) && floors.some((f) => !reached.has(f))) {
          floors.forEach((f) => reached.add(f));
          grew = true;
        }
      }
    }
    if (!reached.has(room.floor)) {
      // Name the first missing step on the way from the lobby to this room.
      const below = [...reached].filter((f) => f < room.floor);
      const lower = below.length ? Math.max(...below) : Math.min(...reached) - 1;
      const upper = lower + 1;
      return `Can't be reached: nothing connects ${floorLabel(lower)} and ${floorLabel(upper)}. ` +
        `Stairs join the floor you click on to the one above, so click Stairs on ${floorLabel(lower)}, ` +
        "or drag an Elevator across both.";
    }
    return "Can't be reached from a Lobby: check for gaps in the Floor along the way, between the lobby, stairs or elevators, and this room.";
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

    // Shop takings banked at midnight, and rent building up towards Sunday
    // night's payday.
    const sales = Shops.takingsToday();
    const due = Economy.rentDue();
    const ledger = [];
    if (sales > 0) ledger.push(`sales today +${World.formatMoney(sales)}`);
    if (due > 0) ledger.push(`rent due Sun night +${World.formatMoney(due)}`);
    document.getElementById("ledger").textContent = ledger.length ? `(${ledger.join(" · ")})` : "";

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
    // Room types the tower hasn't earned yet are greyed out on the toolbar.
    document.querySelectorAll("#toolbar button[data-tool]").forEach((button) => {
      const type = ROOM_TYPES[button.dataset.tool];
      button.classList.toggle("locked", !!type && !!type.unlocksAt && Ratings.stars < type.unlocksAt);
    });
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
        if (e.repeat) return; // holding Space would flick pause on and off
        Clock.togglePause();
        this.setSpeed(Clock.speed);
      } else if (e.key === "1") {
        this.setSpeed(1);
      } else if (e.key === "3") {
        this.setSpeed(3);
      } else if (e.key === "Escape") {
        this.selectTool(null);
      }
    });
  },

  attachToolbar() {
    document.querySelectorAll("#toolbar button[data-tool]").forEach((button) => {
      // Clicking the picked tool again puts it down.
      button.addEventListener("click", () => {
        const tool = button.dataset.tool;
        this.selectTool(Tool.current === tool ? null : tool);
      });
    });
  },

  // Pick a tool (or put it down, with null) and light up its button.
  selectTool(tool) {
    Tool.current = tool;
    document.querySelectorAll("#toolbar button[data-tool]").forEach((b) => {
      b.classList.toggle("active", b.dataset.tool === tool);
    });
    this.showHint(null);
  },
};

function range(from, to) {
  const out = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

// "1F" for the ground floor, "B1" for the first basement, as drawn beside
// the tower.
function floorLabel(floor) {
  return floor >= 0 ? `${floor + 1}F` : `B${-floor}`;
}
