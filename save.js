// Saving and loading, so you can close the tab and pick up where you left off.
//
// The whole game is a handful of plain objects, so a save is just those
// objects turned into JSON text and kept in the browser's localStorage (a
// small key/value store that survives closing the tab). The one wrinkle is
// that some objects point at each other: a person points at their room, an
// elevator car points at the people riding it. JSON can't hold pointers, so
// each pointer is saved as an id and turned back into a pointer on load.
//
// There is one save slot. It's written automatically at the start of every
// game day and whenever you press Save, and read once when the page opens.
// A save carries a version number; a save from a different version of the
// game is ignored rather than risking a half-restored tower.

const SAVE_KEY = "tower-sim-save";
const SAVE_VERSION = 1;

const SaveGame = {
  lastSavedDay: null,
  discarded: false, // set by "New game" so closing the tab doesn't re-save

  // localStorage can be missing or full (private browsing, blocked cookies),
  // so every use goes through these two, which fail quietly.
  _read() {
    try {
      return localStorage.getItem(SAVE_KEY);
    } catch (e) {
      return null;
    }
  },
  _write(text) {
    try {
      localStorage.setItem(SAVE_KEY, text);
      return true;
    } catch (e) {
      return false;
    }
  },

  hasSave() {
    return this._read() !== null;
  },

  clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      // nothing to do
    }
  },

  // The whole game as one plain object.
  snapshot() {
    const cars = [];
    for (const car of Elevators.cars.values()) {
      cars.push({
        transitId: car.transit.id,
        floor: car.floor,
        direction: car.direction,
        state: car.state,
        doorTimer: car.doorTimer,
        riders: car.riders.map((r) => ({ personId: r.person.id, dest: r.dest })),
        waiting: car.waiting.map((w) => ({ personId: w.person.id, floor: w.floor, dest: w.dest, direction: w.direction })),
      });
    }

    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      clock: { totalMinutes: Clock.totalMinutes },
      camera: { x: Camera.x, y: Camera.y },
      world: {
        money: World.money,
        nextId: World.nextId,
        floors: [...World.floors].map(([floor, tiles]) => [floor, [...tiles]]),
        rooms: World.rooms,
        transit: World.transit,
      },
      people: {
        nextId: People.nextId,
        list: People.list.map((p) => ({ ...p, room: undefined, roomId: p.room.id })),
      },
      elevators: cars,
      economy: {
        lastTallyDay: Economy.lastTallyDay,
        lastPayday: Economy.lastPayday,
        debtSince: Economy.debtSince,
      },
      ratings: { stars: Ratings.stars },
    };
  },

  save() {
    // A finished game, or one the player just threw away, has nothing to
    // come back to.
    if (Economy.bankrupt || this.discarded) return false;
    const ok = this._write(JSON.stringify(this.snapshot()));
    if (ok) this.lastSavedDay = Clock.day;
    return ok;
  },

  // Once per game day, at the first moment of the day.
  autosave() {
    if (this.lastSavedDay !== null && Clock.day !== this.lastSavedDay) this.save();
  },

  // Read the save and rebuild the game from it. Everything is built into
  // local variables first and only swapped in at the end, so a damaged save
  // can't leave the game half-restored. Returns true if a save was loaded.
  load() {
    const text = this._read();
    if (text === null) return false;

    let data;
    try {
      data = JSON.parse(text);
      if (data.version !== SAVE_VERSION) return false;

      const rooms = data.world.rooms;
      const roomsById = new Map(rooms.map((room) => [room.id, room]));
      const people = data.people.list.map((saved) => {
        const { roomId, ...person } = saved;
        person.room = roomsById.get(roomId);
        if (!person.room) throw new Error("a person's room is missing");
        return person;
      });
      const peopleById = new Map(people.map((p) => [p.id, p]));
      const transitById = new Map(data.world.transit.map((t) => [t.id, t]));

      const cars = new Map();
      for (const saved of data.elevators) {
        const transit = transitById.get(saved.transitId);
        if (!transit) throw new Error("an elevator's shaft is missing");
        cars.set(transit.id, {
          transit,
          floor: saved.floor,
          direction: saved.direction,
          state: saved.state,
          doorTimer: saved.doorTimer,
          riders: saved.riders.map((r) => ({ person: peopleById.get(r.personId), dest: r.dest })),
          waiting: saved.waiting.map((w) => ({ person: peopleById.get(w.personId), floor: w.floor, dest: w.dest, direction: w.direction })),
        });
      }

      // Everything parsed; now swap it in.
      Clock.totalMinutes = data.clock.totalMinutes;
      World.money = data.world.money;
      World.nextId = data.world.nextId;
      World.floors = new Map(data.world.floors.map(([floor, tiles]) => [floor, new Set(tiles)]));
      World.rooms = rooms;
      World.transit = data.world.transit;
      World.version++; // anything cached about the old building is now stale
      People.list = people;
      People.nextId = data.people.nextId;
      Elevators.cars = cars;
      Economy.lastTallyDay = data.economy.lastTallyDay;
      Economy.lastPayday = data.economy.lastPayday;
      Economy.debtSince = data.economy.debtSince;
      Economy.bankrupt = false;
      Economy.popups = [];
      Ratings.stars = data.ratings.stars;
      Camera.x = data.camera.x;
      Camera.y = data.camera.y;
      this.lastSavedDay = Clock.day;
      return true;
    } catch (e) {
      console.error("Couldn't load the saved game:", e);
      return false;
    }
  },
};
