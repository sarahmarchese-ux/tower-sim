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
// The Save file panel (ui.js) copies it out as text or a file, to keep or
// to send, and loads one back in, replacing the tower being played.
// A save carries a version number; a save from a different version of the
// game is ignored rather than risking a half-restored tower. A save is also
// checked from end to end before it's used (every room and shaft a known
// kind, everyone riding or queueing in exactly one car, and so on), since
// a pasted one may have been edited or damaged, and one bad value would
// otherwise stop the game on every reload.
//
// Hotel rooms used to come in one size, 8 tiles wide (type "hotel"). They
// now come as Singles and Twins, so a save from before that has its old
// hotel rooms knocked down on load, their guests sent home and their full
// cost refunded; `refundNote` says so in the welcome-back message.

// The one-size hotel room from before Singles and Twins, and what it cost.
const OLD_HOTEL = { type: "hotel", cost: 14000 };

const SAVE_KEY = "tower-sim-save";
const SAVE_VERSION = 1;

// What a saved person or elevator car can be doing (see people.js and
// elevators.js), and the most game time a save can hold (about 190
// years), so a damaged clock can't make the game tally a million midnights.
const PERSON_STATES = ["offsite", "inRoom", "eating", "cleaning", "walking", "onStairs", "waitingForElevator", "riding"];
const TRAVELLING_STATES = ["walking", "onStairs", "waitingForElevator", "riding"];
const CAR_STATES = ["idle", "moving", "doors"];
const MAX_SAVED_MINUTES = 1e8;

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
        waiting: car.waiting.map((w) => ({ personId: w.person.id, floor: w.floor, dest: w.dest, direction: w.direction, since: w.since })),
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
          job: undefined,
          jobId: p.job ? p.job.id : null,
          cleaningAt: undefined, // the job, while they're at it (see load)
          parking: undefined,
          parkingId: p.parking ? p.parking.id : null,
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

  // The game as text, for the Save file panel to copy or download.
  exportText() {
    return JSON.stringify(this.snapshot());
  },

  // A save pasted or opened in the Save file panel. It's checked first;
  // if it's good, it becomes the stored save and the page reloads into it,
  // just as if you'd closed the tab and come back. Returns null on success
  // (the page is reloading), or why it couldn't be used, with nothing
  // changed.
  importText(text) {
    const trimmed = text.trim();
    if (!this.parse(trimmed, true)) {
      return "That isn't a save this version of the game can load. Nothing was changed.";
    }
    if (!this._write(trimmed)) {
      return "Your browser won't let the game store a save here (private browsing?), so it can't load one. Nothing was changed.";
    }
    this.discarded = true; // so leaving this page doesn't save the old tower over it
    location.reload();
    return null;
  },

  // Read a save (the one in storage, unless given another's text) and
  // rebuild the game from it. Returns true if a save was loaded.
  load(text = this._read()) {
    const swapIn = this.parse(text);
    if (!swapIn) return false;
    swapIn();
    return true;
  },

  // Check a save and build the game it holds, without touching the game
  // being played. Everything is built into local variables first, and the
  // function returned swaps them in, so a damaged save can't leave the game
  // half-restored, and an imported one can be checked before anything is
  // overwritten. Returns null if the save can't be used. `quiet`: a pasted
  // save that isn't one is the player's mistake, not the game's, so it
  // isn't logged as an error.
  parse(text, quiet = false) {
    if (typeof text !== "string") return null;

    let data;
    try {
      data = JSON.parse(text);
      if (!data || data.version !== SAVE_VERSION) return null;

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
      const check = (ok, problem) => {
        if (!ok) throw new Error(problem);
      };
      const isInt = Number.isInteger;
      const known = (table, key) => typeof key === "string" && Object.hasOwn(table, key);
      const ids = new Set(); // rooms and shafts share World.nextId
      const uniqueId = (id, ofWhat) => {
        check(isInt(id) && id > 0 && !ids.has(id), `${ofWhat} has a missing or repeated id`);
        ids.add(id);
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

      for (const room of rooms) {
        uniqueId(room.id, "a room");
        check(known(ROOM_TYPES, room.type), "a room is of an unknown kind");
        check(isInt(room.floor) && isInt(room.tileStart), "a room's place is damaged");
      }
      for (const transit of data.world.transit) {
        uniqueId(transit.id, "a shaft or stairway");
        check(known(TRANSIT_TYPES, transit.kind), "a shaft or stairway is of an unknown kind");
        check(isInt(transit.tileStart) && isInt(transit.floorBottom) && isInt(transit.floorTop) &&
          transit.floorBottom <= transit.floorTop, "a shaft's or stairway's place is damaged");
      }
      const roomsById = new Map(rooms.map((room) => [room.id, room]));
      const transitById = new Map(data.world.transit.map((t) => [t.id, t]));
      const personIds = new Set();
      const people = data.people.list.map((saved) => {
        const { roomId, lunchCafeId, dinnerRoomId, jobId, parkingId, ...person } = saved;
        person.room = roomsById.get(roomId);
        if (!person.room) throw new Error("a person's room is missing");
        check(isInt(person.id) && person.id > 0 && !personIds.has(person.id), "a person has a missing or repeated id");
        personIds.add(person.id);
        check(PERSON_STATES.includes(person.state), "a person is doing something unknown");
        check([person.floor, person.x, person.stress].every(Number.isFinite), "a person's numbers are damaged");
        // Someone on their way somewhere needs a route, along shafts and
        // stairs that exist.
        const legs = person.route && person.route.legs;
        if (person.route != null || TRAVELLING_STATES.includes(person.state)) {
          check(Array.isArray(legs) && isInt(person.legIndex) && person.legIndex >= 0 &&
            person.legIndex <= legs.length, "a person's route is damaged");
          check(legs.every((leg) => leg && (leg.type === "walk" || transitById.has(leg.transitId))), "a person's route uses a missing shaft or stairway");
        }
        // A driver's car park (saves from before parking have none).
        if (person.role === "shopper") {
          person.parking = (parkingId != null && roomsById.get(parkingId)) || null;
          if (!person.parking) person.space = null;
        }
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
        // A housekeeper's hotel room to clean, if they're on a job.
        if (person.role === "housekeeper") {
          person.job = (jobId != null && roomsById.get(jobId)) || null;
          person.cleaningAt = person.state === "cleaning" ? person.job : null;
        }
        return person;
      });
      const peopleById = new Map(people.map((p) => [p.id, p]));

      const cars = new Map();
      const inCars = new Map(); // person -> how many cars they're riding or queueing for
      for (const saved of data.elevators) {
        const transit = transitById.get(saved.transitId);
        if (!transit) throw new Error("an elevator's shaft is missing");
        check(transit.kind === "elevator" && !cars.has(transit.id), "an elevator's car is in the wrong place");
        const inShaft = (floor) => Number.isFinite(floor) && floor >= transit.floorBottom && floor <= transit.floorTop;
        const stop = (floor) => isInt(floor) && inShaft(floor);
        check(inShaft(saved.floor) && CAR_STATES.includes(saved.state) && [-1, 0, 1].includes(saved.direction) &&
          Number.isFinite(saved.doorTimer), "an elevator's car is damaged");
        check(saved.riders.length <= ELEVATOR_CAPACITY && saved.riders.every((r) => stop(r.dest)) &&
          saved.waiting.every((w) => stop(w.floor) && stop(w.dest) && w.dest !== w.floor && w.direction === Math.sign(w.dest - w.floor)),
          "an elevator's riders or queue are damaged");
        for (const { personId } of [...saved.riders, ...saved.waiting]) {
          const person = personById(personId);
          inCars.set(person, (inCars.get(person) || 0) + 1);
        }
        const rides = (r) => personById(r.personId).state === "riding";
        const queues = (w) => personById(w.personId).state === "waitingForElevator";
        check(saved.riders.every(rides) && saved.waiting.every(queues), "an elevator holds someone who isn't riding or queueing");
        cars.set(transit.id, {
          transit,
          floor: saved.floor,
          direction: saved.direction,
          state: saved.state,
          doorTimer: saved.doorTimer,
          riders: saved.riders.map((r) => ({ person: personById(r.personId), dest: r.dest })),
          waiting: saved.waiting.map((w) => ({ person: personById(w.personId), floor: w.floor, dest: w.dest, direction: w.direction, since: Number.isFinite(w.since) ? w.since : null })),
          recentWaits: [],
        });
      }
      for (const transit of data.world.transit) {
        if (transit.kind === "elevator" && !cars.has(transit.id)) throw new Error("an elevator's car is missing");
      }
      for (const person of people) {
        const expected = person.state === "riding" || person.state === "waitingForElevator" ? 1 : 0;
        check((inCars.get(person) || 0) === expected, "someone riding or queueing isn't in exactly one elevator");
      }

      // Everything else is read here too, before anything is swapped in, so
      // a damaged save can't leave the game half old and half new.
      const totalMinutes = number(data.clock.totalMinutes);
      check(totalMinutes >= 0 && totalMinutes <= MAX_SAVED_MINUTES, "the clock is out of range");
      const money = number(data.world.money) + refund;
      check(Math.abs(money) < 1e15, "the money is out of range");
      check(data.world.floors.every(([floor, tiles]) => isInt(floor) && Array.isArray(tiles) && tiles.every(isInt)), "a floor is damaged");
      const floors = new Map(data.world.floors.map(([floor, tiles]) => [floor, new Set(tiles)]));
      const economy = {
        lastTallyDay: number(data.economy.lastTallyDay),
        lastPayday: data.economy.lastPayday == null ? null : number(data.economy.lastPayday),
        lastSales: data.economy.lastSales == null ? null : number(data.economy.lastSales), // saves from before shops have none
        lastHotel: data.economy.lastHotel == null ? null : number(data.economy.lastHotel), // ...or hotels
        debtSince: data.economy.debtSince === null ? null : number(data.economy.debtSince),
      };
      // The day's takings are settled at midnight, so the last tally is
      // today's (or, in a save from mid-step, yesterday's).
      const daysUntallied = Math.floor(totalMinutes / MINUTES_PER_DAY) - economy.lastTallyDay;
      check(daysUntallied === 0 || daysUntallied === 1, "the clock and the books disagree");
      const stars = number(data.ratings.stars);
      check(isInt(stars) && stars >= 1 && stars <= STAR_TARGETS[STAR_TARGETS.length - 1].stars, "the star rating is out of range");
      const camera = { x: number(data.camera.x), y: number(data.camera.y) };
      // New rooms, shafts and people get ids past every one in use.
      const worldNextId = Math.max(number(data.world.nextId), Math.max(0, ...ids) + 1);
      const peopleNextId = Math.max(number(data.people.nextId), Math.max(0, ...personIds) + 1);

      // Everything parsed; the caller swaps it in.
      return () => {
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
      };
    } catch (e) {
      if (!quiet) console.error("Couldn't load the saved game:", e);
      return null;
    }
  },
};
