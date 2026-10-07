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
//
// Hotel rooms used to come in one size, 8 tiles wide (type "hotel"). They
// now come as Singles and Twins, so a save from before that has its old
// hotel rooms knocked down on load, their guests sent home and their full
// cost refunded; `refundNote` says so in the welcome-back message.

// The one-size hotel room from before Singles and Twins, and what it cost.
const OLD_HOTEL = { type: "hotel", cost: 14000 };

const SAVE_KEY = "tower-sim-save";
const SAVE_VERSION = 1;

const SaveGame = {
  lastSavedDay: null,
  discarded: false, // set by "New game" so closing the tab doesn't re-save
  refundNote: null, // set by load() when it refunded old hotel rooms

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
        list: People.list.map((p) => ({
          ...p,
          room: undefined,
          roomId: p.room.id,
          lunchCafe: undefined,
          lunchCafeId: p.lunchCafe ? p.lunchCafe.id : null,
          dinnerRoom: undefined,
          dinnerRoomId: p.dinnerRoom ? p.dinnerRoom.id : null,
        })),
      },
      elevators: cars,
      economy: {
        lastTallyDay: Economy.lastTallyDay,
        lastPayday: Economy.lastPayday,
        lastSales: Economy.lastSales,
        lastHotel: Economy.lastHotel,
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

      // Old one-size hotel rooms are knocked down and refunded (see top).
      const oldHotelIds = new Set(data.world.rooms.filter((r) => r.type === OLD_HOTEL.type).map((r) => r.id));
      const oldGuestIds = new Set(data.people.list.filter((p) => oldHotelIds.has(p.roomId)).map((p) => p.id));
      const rooms = data.world.rooms.filter((r) => !oldHotelIds.has(r.id));
      data.people.list = data.people.list.filter((p) => !oldGuestIds.has(p.id));
      for (const saved of data.elevators) {
        saved.riders = saved.riders.filter((r) => !oldGuestIds.has(r.personId));
        saved.waiting = saved.waiting.filter((w) => !oldGuestIds.has(w.personId));
      }
      const refund = oldHotelIds.size * OLD_HOTEL.cost;

      const roomsById = new Map(rooms.map((room) => [room.id, room]));
      const people = data.people.list.map((saved) => {
        const { roomId, lunchCafeId, dinnerRoomId, ...person } = saved;
        person.room = roomsById.get(roomId);
        if (!person.room) throw new Error("a person's room is missing");
        // A maker's lunch café, if they're eating at or heading for one.
        // Makers from before lunch breaks get their times now.
        if (person.role === "maker") {
          if (person.lunchAt == null) Object.assign(person, People.lunchTimes());
          person.lunchCafe = (lunchCafeId != null && roomsById.get(lunchCafeId)) || null;
          if (person.state === "eating" && !person.lunchCafe) person.state = "offsite";
        }
        // A resident's or guest's restaurant, if they're dining at or
        // heading for one. Those from before restaurants get dinner times now.
        if (person.role === "resident" || person.role === "guest") {
          if (person.dinnerAt == null) Object.assign(person, People.dinnerTimes());
          person.dinnerRoom = (dinnerRoomId != null && roomsById.get(dinnerRoomId)) || null;
          if (person.state === "eating" && !person.dinnerRoom) person.state = "offsite";
        }
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
      const money = number(data.world.money) + refund;
      const floors = new Map(data.world.floors.map(([floor, tiles]) => [floor, new Set(tiles)]));
      const economy = {
        lastTallyDay: number(data.economy.lastTallyDay),
        lastPayday: data.economy.lastPayday,
        lastSales: data.economy.lastSales == null ? null : number(data.economy.lastSales), // saves from before shops have none
        lastHotel: data.economy.lastHotel == null ? null : number(data.economy.lastHotel), // ...or hotels
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
      Economy.lastSales = economy.lastSales;
      Economy.lastHotel = economy.lastHotel;
      Economy.debtSince = economy.debtSince;
      Economy.bankrupt = false;
      Economy.popups = [];
      Ratings.stars = stars;
      Camera.x = camera.x;
      Camera.y = camera.y;
      Shops.refreshOpen(); // the game starts paused, so the shops' open/closed signs need this now...
      Stress.refreshWorking(); // ...and the noise readout (which needs to know which cafés and restaurants are open)
      this.lastSavedDay = Clock.day;
      this.refundNote = refund
        ? `Hotel rooms now come in two sizes, Single and Twin. Your ${oldHotelIds.size === 1 ? "old hotel room was" : `${oldHotelIds.size} old hotel rooms were`} taken down and refunded in full (${World.formatMoney(refund)}).`
        : null;
      return true;
    } catch (e) {
      console.error("Couldn't load the saved game:", e);
      return false;
    }
  },
};
