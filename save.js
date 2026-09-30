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
    try {
      return this._write(JSON.stringify(this.snapshot()));
    } catch (e) {
      console.error("Couldn't save the game:", e);
      return false;
    }
  },

  // Once per game day, at the first moment of the day. A save that fails
  // (storage blocked or full) isn't retried until the next day: trying
  // again every frame would turn the whole game into JSON 60 times a second.
  autosave() {
    if (this.lastSavedDay === null || Clock.day === this.lastSavedDay) return;
    this.lastSavedDay = Clock.day;
    this.save();
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

      // A number that isn't one (missing, or damaged) would spread NaN
      // through the clock or the money, so it rejects the whole save.
      const number = (value) => {
        if (!Number.isFinite(value)) throw new Error("a saved number is missing");
        return value;
      };
      const personById = (id) => {
        const found = peopleById.get(id);
        if (!found) throw new Error("an elevator rider is missing");
        return found;
      };

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
          riders: saved.riders.map((r) => ({ person: personById(r.personId), dest: r.dest })),
          waiting: saved.waiting.map((w) => ({ person: personById(w.personId), floor: w.floor, dest: w.dest, direction: w.direction })),
        });
      }
      for (const transit of data.world.transit) {
        if (transit.kind === "elevator" && !cars.has(transit.id)) throw new Error("an elevator's car is missing");
      }

      // Everything else is read here too, before anything is swapped in, so
      // a damaged save can't leave the game half old and half new.
      const totalMinutes = number(data.clock.totalMinutes);
      const money = number(data.world.money);
      const floors = new Map(data.world.floors.map(([floor, tiles]) => [floor, new Set(tiles)]));
      const economy = {
        lastTallyDay: number(data.economy.lastTallyDay),
        lastPayday: data.economy.lastPayday,
        debtSince: data.economy.debtSince === null ? null : number(data.economy.debtSince),
      };
      const stars = number(data.ratings.stars);
      const camera = { x: number(data.camera.x), y: number(data.camera.y) };
      const worldNextId = number(data.world.nextId);
      const peopleNextId = number(data.people.nextId);

      // Everything parsed; now swap it in.
      Clock.totalMinutes = totalMinutes;
      World.money = money;
      World.nextId = worldNextId;
      World.floors = floors;
      World.rooms = rooms;
      World.transit = data.world.transit;
      World.version++; // anything cached about the old building is now stale
      People.list = people;
      People.nextId = peopleNextId;
      Elevators.cars = cars;
      Economy.lastTallyDay = economy.lastTallyDay;
      Economy.lastPayday = economy.lastPayday;
      Economy.debtSince = economy.debtSince;
      Economy.bankrupt = false;
      Economy.popups = [];
      Ratings.stars = stars;
      Camera.x = camera.x;
      Camera.y = camera.y;
      Stress.refreshWorking(); // the game starts paused, so the noise readout needs this now
      this.lastSavedDay = Clock.day;
      return true;
    } catch (e) {
      console.error("Couldn't load the saved game:", e);
      return false;
    }
  },
};
