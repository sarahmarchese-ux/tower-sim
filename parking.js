// Parking (milestone 13): a second way in, below ground.
//
// A car park goes in a basement (rooms.js: `basementOnly`) and has
// `spaces` for cars. It has no staff, charges no fee and costs nothing to
// run: it pays off only through the drivers it brings.
//
// Drivers are visitors like shoppers, the lunch crowd and diners (shops.js
// sends them), and come on top of them: every shop, café, restaurant and
// Snack Bar gets DRIVER_SHARE as many again by car, with the same rushes. A driver
// comes only if a car park has a free space and a way through to where
// they're going; with several, they use the one with the easiest trip.
// They park, walk (or climb, or ride) from the car park, and go back to
// their car when they're done, so `parking` on a person is their car park
// and `space` the space their car is in. The space is theirs from the
// moment they arrive until they drive off. Like other visitors they spend
// less after a long trip and give up after one that feels like an hour,
// so a basement shop by the car park is the first thing they reach, and
// one high up adds to the elevator rush.

const DRIVER_SHARE = 0.5; // drivers per walk-in visitor

const Parking = {
  _reachVersion: -1,
  _reaches: new Map(), // car park id -> can drivers get from it to any storefront?

  // Drivers parked in this car park, by space.
  drivers(carPark) {
    return People.list.filter((p) => p.parking === carPark);
  },

  spacesTaken(carPark) {
    return this.drivers(carPark).length;
  },

  // Where space `space` is, along the car park.
  spaceX(carPark, space) {
    const type = ROOM_TYPES.parking;
    return carPark.tileStart + ((space + 0.5) * type.width) / type.spaces;
  },

  // A driver's car, where they start and finish their visit.
  carPoint(person) {
    return { floor: person.parking.floor, x: this.spaceX(person.parking, person.space) };
  },

  // A driver for this storefront: the car park with a free space that's
  // the easiest trip from, and the space they'll take there; null if none.
  pickFor(room) {
    const goal = [{ floor: room.floor, x: room.tileStart + ROOM_TYPES[room.type].width / 2 }];
    let best = null;
    let bestCost = Infinity;
    for (const carPark of World.rooms) {
      if (carPark.type !== "parking") continue;
      const taken = new Set(this.drivers(carPark).map((p) => p.space));
      if (taken.size >= ROOM_TYPES.parking.spaces) continue;
      const route = Routing.plan([{ floor: carPark.floor, x: carPark.tileStart + ROOM_TYPES.parking.width / 2 }], goal);
      if (route && route.cost < bestCost) {
        let space = 0;
        while (taken.has(space)) space++;
        best = { carPark, space };
        bestCost = route.cost;
      }
    }
    return best;
  },

  // Called by people.js when a driver arrives at their shop, café,
  // restaurant or Snack Bar: today's count, for the tooltip. (One who
  // stops at a Snack Bar after a shop was counted at the shop.)
  onDriverArrived(person) {
    const carPark = person.parking;
    if (!carPark || person.afterShop) return;
    if (carPark.driversDay !== Clock.day) {
      carPark.driversDay = Clock.day;
      carPark.driversToday = 0;
    }
    carPark.driversToday++;
  },

  driversToday(carPark) {
    return carPark.driversDay === Clock.day ? carPark.driversToday : 0;
  },

  // Can drivers get from this car park to any storefront?
  // Cached until the building changes, since the tooltip asks every frame.
  reachesAnything(carPark) {
    if (this._reachVersion !== World.version) {
      this._reaches = new Map();
      this._reachVersion = World.version;
    }
    if (!this._reaches.has(carPark.id)) {
      const goals = World.rooms
        .filter((room) => isStorefront(room))
        .map((room) => ({ floor: room.floor, x: room.tileStart + ROOM_TYPES[room.type].width / 2 }));
      const start = [{ floor: carPark.floor, x: carPark.tileStart + ROOM_TYPES.parking.width / 2 }];
      this._reaches.set(carPark.id, goals.length > 0 && Routing.plan(start, goals) !== null);
    }
    return this._reaches.get(carPark.id);
  },

  // "Parking · 12 of 20 spaces taken · 31 drivers today"
  describe(carPark) {
    const spaces = ROOM_TYPES.parking.spaces;
    const drivers = this.driversToday(carPark);
    return `Parking · ${this.spacesTaken(carPark)} of ${spaces} spaces taken · ${drivers} driver${drivers === 1 ? "" : "s"} today`;
  },

  // For the car park's tooltip: why no drivers come, if none can.
  warning(carPark) {
    if (!World.rooms.some((room) => isStorefront(room))) {
      return "Drivers come to shops, cafés, restaurants and Snack Bars: build one for them to visit.";
    }
    if (!this.reachesAnything(carPark)) {
      return "No shop or place to eat can be reached from here: connect this floor to them with stairs or an elevator.";
    }
    return null;
  },

  // A car park was knocked down, cars and all: its drivers leave by the
  // lobby instead.
  onRoomRemoved(room) {
    if (room.type !== "parking") return;
    for (const person of People.list) {
      if (person.parking !== room) continue;
      person.parking = null;
      person.space = null;
      // On the way back to their car: head for the lobby now.
      if (person.route && person.target === "offsite") People.reroute(person);
    }
  },
};

World.subscribe((event, payload) => {
  if (event === "roomRemoved") Parking.onRoomRemoved(payload);
});
