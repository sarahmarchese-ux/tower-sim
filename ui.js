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
      if (isStorefront(room) && room.status === "occupied" && Shops.isQuiet(room)) {
        const visitors = ROOM_TYPES[room.type].visitors;
        const Who = visitors.who[0].toUpperCase() + visitors.who.slice(1);
        this.addWarning(tip, `Too few ${visitors.who}: closes at the weekly review if takings stay under ${World.formatMoney(visitors.quietPerDay)} a day. ${Who} give up on long trips: bring it nearer the lobby or the elevators.`);
      }
      if (isHotel(room)) {
        const loudByDay = Stress.noiseAt(room, "working") >= 2;
        const loudAtNight = Stress.noiseAt(room, "evening") >= 2;
        if (loudByDay) {
          this.addWarning(tip, "Noisy in working hours: guests are in by day, and studio noise stresses them fast. Rooms beside, above or below pottery and woodwork count as next door: leave a floor between them.");
        }
        if (loudAtNight) {
          this.addWarning(tip, "Noisy in the evening: a restaurant next door, above or below keeps guests up. Leave a floor between hotel rooms and restaurants.");
        }
        if (!loudByDay && !loudAtNight && Hotels.reviewsLabel(room) === "poor") {
          this.addWarning(tip, "Poor reviews mean fewer bookings. Guests mind long trips up from the lobby: bring the room nearer the lobby or the elevators.");
        }
      }
      if (room.type === "condo" && room.status === "occupied" && Stress.noiseAt(room, "evening") >= 2) {
        this.addWarning(tip, "Noisy in the evening: residents are home to unwind, and a restaurant next door, above or below stresses them. Leave a floor between condos and restaurants.");
      }
      if (isHotel(room) && room.needsCleaning && !Housekeeping.staffed()) {
        this.addWarning(tip, "Can't be booked until it's cleaned, and the tower has no housekeepers. Build Housekeeping, near the hotel rooms.");
      }
      const unguarded = Security.warning(room);
      if (unguarded) this.addWarning(tip, unguarded);
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
    if (isHotel(room)) parts.push(...this.describeHotel(room));
    else if (room.status === "vacant") parts.push(type.role === "shopkeeper" ? "looking for a shopkeeper" : vacantLabel(type).toLowerCase());
    else if (room.status === "movingIn") parts.push("moving in");
    else {
      if (room.type === "housekeeping") parts.push(...this.describeHousekeeping(room));
      if (room.type === "security") parts.push(...this.describeSecurity(room));
      const stress = Stress.roomReadout(room);
      if (stress) parts.push(stress);
    }
    if (isStorefront(room) && room.status === "occupied") {
      parts.splice(1, 0, Shops.isOpen(room) ? "open" : "closed"); // right after its name
      if (room.type === "cafe") {
        const eating = Cafes.seated(room);
        if (eating > 0) parts.push(`${eating} at lunch`);
      } else if (room.type === "restaurant") {
        const dining = Restaurants.seated(room);
        if (dining > 0) parts.push(`${dining} dining`);
      } else {
        const shoppers = Shops.shoppersFor(room);
        if (shoppers > 0) parts.push(`${shoppers} shopper${shoppers === 1 ? "" : "s"}`);
      }
      let sales = `sales today ${World.formatMoney(room.till || 0)}`;
      if (room.salesYesterday !== undefined) sales += ` (yesterday ${World.formatMoney(room.salesYesterday)})`;
      parts.push(sales);
      const average = Shops.weekAverage(room);
      if (average !== null) parts.push(`this week ${World.formatMoney(average)}/day`);
    }
    if (type.role === "resident" || type.role === "guest") {
      // Studios are only noisy while their makers work, and restaurants
      // while they serve dinner, so show those too.
      const now = Stress.noiseAt(room);
      const working = Stress.noiseAt(room, "working");
      const evening = Stress.noiseAt(room, "evening");
      const other = [];
      if (working > 0) other.push(`${working} in working hours`);
      if (evening > 0) other.push(`${evening} in the evening`);
      parts.push(other.length ? `noise here: ${now} now, ${other.join(", ")}` : `noise here: ${now}`);
    }
    else if (room.type === "cafe") parts.push(`noise ${type.noise} while serving lunch`);
    else if (room.type === "restaurant") parts.push(`noise ${type.noise} while serving dinner`);
    else if (type.noise > 0) parts.push(`makes noise ${type.noise}`);
    else if (room.type !== "security") parts.push("quiet"); // an office's reach says more (describeSecurity)
    return parts.join(" · ");
  },

  // Who's staying in a hotel room (and how they're feeling), how it's been
  // reviewed, and how many of the last week's nights it was booked.
  describeHotel(room) {
    const parts = [];
    if (room.status === "vacant" && room.needsCleaning) parts.push(Housekeeping.describeRoom(room));
    else if (room.status === "vacant") parts.push(room.nextGuestsAt != null ? "booked: guests arrive later today" : "vacant");
    else if (room.status === "checkingIn") parts.push(`${room.party === "tourists" ? "2 tourists" : "a buyer"} checking in`);
    else {
      parts.push(Hotels.describeStay(room));
      const stress = Stress.roomReadout(room);
      if (stress) parts.push(stress);
    }
    const reviews = Hotels.reviewsLabel(room);
    if (reviews) parts.push(`${reviews} reviews`);
    const history = room.nightHistory || [];
    if (history.length) {
      const booked = history.filter(Boolean).length;
      if (history.length === 1) parts.push(booked ? "booked last night" : "empty last night");
      else parts.push(`booked ${booked} of the last ${history.length} nights`);
    }
    return parts;
  },

  // Housekeeping: who's working, the rooms waiting, and today's tally.
  describeHousekeeping(room) {
    const staff = People.list.filter((p) => p.room === room && !p.movingIn && !p.movingOut);
    const cleaning = staff.filter((p) => p.job).length;
    const atWork = staff.filter((p) => p.state !== "offsite").length;
    const parts = [atWork ? `${atWork} of ${staff.length} at work${cleaning ? `, ${cleaning} cleaning` : ""}` : "off duty (works 9am–5pm)"];
    const waiting = Housekeeping.waitingRooms().length;
    parts.push(`${waiting} room${waiting === 1 ? "" : "s"} waiting`);
    parts.push(`cleaned today ${Housekeeping.cleanedToday(room)}`);
    return parts;
  },

  // Security: whether the guards are on duty, and what's in their reach.
  describeSecurity(room) {
    const covered = Security.roomsCovered(room);
    return [
      Security.onDuty(room) ? "on duty" : "off duty (guards work 8pm–6am)",
      `covers ${Security.coverageLabel(room)}: ${covered} room${covered === 1 ? "" : "s"} worth robbing`,
    ];
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

    // Shop takings and hotel nights banked at midnight, and rent building
    // up towards Sunday night's payday.
    const sales = Shops.takingsToday();
    const tonight = Hotels.tonight();
    const due = Economy.rentDue();
    const ledger = [];
    if (sales > 0) ledger.push(`sales today +${World.formatMoney(sales)}`);
    if (tonight > 0) ledger.push(`hotel tonight +${World.formatMoney(tonight)}`);
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
    // (Only redone when the stars change, not every frame.)
    if (this._lockedForStars !== Ratings.stars) {
      this._lockedForStars = Ratings.stars;
      document.querySelectorAll("#toolbar button[data-tool]").forEach((button) => {
        const type = ROOM_TYPES[button.dataset.tool];
        button.classList.toggle("locked", !!type && !!type.unlocksAt && Ratings.stars < type.unlocksAt);
      });
    }
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
    // "New game" asks first, on the page itself: the browser's own
    // confirm() is silently refused where the game is embedded in a
    // sandboxed frame, which made the button do nothing.
    const ask = document.getElementById("newgame");
    document.getElementById("new-btn").addEventListener("click", () => ask.classList.add("shown"));
    document.getElementById("newgame-no").addEventListener("click", () => ask.classList.remove("shown"));
    document.getElementById("newgame-yes").addEventListener("click", () => this.startOver());
  },

  // The Save file panel: copy the tower out as text or a file (to keep, or
  // to send to someone who can load it and look), or load one in. The
  // game pauses while it's open. In the claude.ai artifact a file is
  // offered through the page's downloads capability, which asks before
  // saving; opened straight from disk, an ordinary browser download.
  attachSaveFile() {
    const panel = document.getElementById("savefile");
    const text = document.getElementById("savefile-text");
    const note = document.getElementById("savefile-note");
    const picker = document.getElementById("savefile-picker");
    let speedBefore = 1;
    const say = (message, isError = false) => {
      note.textContent = message;
      note.classList.toggle("error", isError);
    };

    document.getElementById("savefile-btn").addEventListener("click", () => {
      speedBefore = Clock.speed;
      this.setSpeed(0);
      text.value = SaveGame.exportText();
      say("This is your tower as it is right now. Copy it or download it to keep it or send it. To play a save from somewhere else, paste it in here (or open its file) and press Load.");
      panel.classList.add("shown");
    });
    document.getElementById("savefile-close").addEventListener("click", () => {
      panel.classList.remove("shown");
      this.setSpeed(speedBefore);
    });

    document.getElementById("savefile-copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text.value);
        say("Copied.");
        return;
      } catch (e) {
        // Embedded pages can be refused the clipboard; try the old way.
      }
      text.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (e) {
        copied = false;
      }
      say(copied ? "Copied." : "Couldn't copy here: the text is selected, so press Ctrl+C (or ⌘C) to copy it.", !copied);
    });

    document.getElementById("savefile-download").addEventListener("click", async () => {
      const filename = `tower-sim-day-${Clock.day + 1}.json`;
      const downloads = window.claude && window.claude.use ? await window.claude.use("downloads") : null;
      if (downloads) {
        try {
          await downloads.save({ filename, data: text.value });
          say(`Saved as ${filename}.`);
        } catch (e) {
          if (e && e.code === "declined") say("Download cancelled.");
          else say("Couldn't download here. Use Copy instead.", true);
        }
        return;
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([text.value], { type: "application/json" }));
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      say(`Downloading ${filename}. If nothing appears, use Copy instead.`);
    });

    document.getElementById("savefile-open").addEventListener("click", () => picker.click());
    picker.addEventListener("change", async () => {
      const file = picker.files[0];
      picker.value = ""; // so picking the same file again still counts
      if (!file) return;
      text.value = await file.text();
      say(`Opened ${file.name}. Press Load to play it instead of this tower.`);
    });

    document.getElementById("savefile-load").addEventListener("click", () => {
      const problem = SaveGame.importText(text.value);
      if (problem) say(problem, true);
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
      if (isTyping(e) || Economy.bankrupt) return;
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
