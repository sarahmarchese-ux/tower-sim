// Restaurants (milestone 11): dinner for the tower's residents and hotel
// guests.
//
// A restaurant is a storefront (shops.js does its keeper, its till, its
// diners from outside and its weekly review). This file adds the residents
// and guests.
//
// Every resident and guest has their own dinner time (people.js:
// `dinnerAt`, `dinnerMinutes`). When it comes round and they're at home,
// they decide, once a day, whether to eat out tonight: about one night in
// four for a resident (one in two on Fridays and Saturdays), one in two
// for a guest. If they do, they go to the nearest restaurant that's open,
// has a seat, and isn't too far (MAX_DINNER_TRIP_COST, in the route
// planner's "tiles of walking"; a flight of stairs is 25). Without one,
// they eat at home: unlike makers at lunch, nobody leaves the building for
// dinner, so a tower without a restaurant has quiet evenings.
//
// While it's serving dinner (every day, its `dinnerHours`), a restaurant
// is busy and noisy: it gives off its `noise` to the rooms around it
// (stress.js). The studios are empty by then, but residents and guests are
// home, so where it goes matters.

const MAX_DINNER_TRIP_COST = 100; // further than this, they eat at home
const RESTAURANT_SEATS = 40; // residents, guests and diners from outside at once
// The chance someone eats out tonight, by day of the week (Mon ... Sun).
const DINNER_CHANCE = {
  resident: [0.25, 0.25, 0.25, 0.25, 0.5, 0.5, 0.25],
  guest: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
};

const Restaurants = {
  // Every day in its dinner hours, while it's open.
  isServingDinner(room) {
    const [from, to] = ROOM_TYPES[room.type].dinnerHours;
    return Shops.isOpen(room) && Clock.hour >= from && Clock.hour < to;
  },

  // Called by people.js for a resident or guest at home: once their
  // dinner time has come, decide about tonight (if not decided already).
  planDinner(person, now) {
    const day = Math.floor(now / MINUTES_PER_DAY);
    const minute = now - day * MINUTES_PER_DAY;
    if (person.dinnerDay === day) return;
    if (minute < person.dinnerAt || minute >= person.dinnerAt + person.dinnerMinutes) return;
    person.dinnerDay = day;
    person.dinnerRoom = Math.random() < DINNER_CHANCE[person.role][day % 7] ? this.pick(person) : null;
    if (person.dinnerRoom) {
      const width = ROOM_TYPES.restaurant.width;
      person.seatX = person.dinnerRoom.tileStart + 0.5 + Math.random() * (width - 1);
    }
  },

  // The restaurant closest to this person's home that's open, has a seat,
  // and isn't too far; null if none.
  pick(person) {
    const home = { floor: person.room.floor, x: People.homeX(person) };
    let best = null;
    let bestCost = MAX_DINNER_TRIP_COST;
    for (const room of World.rooms) {
      if (room.type !== "restaurant" || !Shops.isOpen(room) || this.seated(room) >= RESTAURANT_SEATS) continue;
      const seat = { floor: room.floor, x: room.tileStart + ROOM_TYPES.restaurant.width / 2 };
      const route = Routing.plan([home], [seat]);
      if (route && route.cost <= bestCost) {
        best = room;
        bestCost = route.cost;
      }
    }
    return best;
  },

  // Called by people.js when a resident or guest sits down: they pay for
  // dinner. If it's shut, they go home and eat there instead. A guest who
  // checked out early on the way down doesn't stop to eat.
  onDinerArrived(person) {
    const room = person.dinnerRoom;
    if (person.movingOut) return;
    if (!Shops.isOpen(room)) {
      Economy.popupOverRoom(room, "Closed: dinner at home", "#d0d0d0");
      this.goHome(person);
      return;
    }
    const spend = Math.round(randomBetween(ROOM_TYPES.restaurant.visitors.spend));
    room.till = (room.till || 0) + spend;
    Economy.popupOverRoom(room, `+${World.formatMoney(spend)}`, "#c8f7d4");
  },

  // A restaurant has closed (its owner moved out) or been knocked down:
  // residents and guests eating there or on their way go home instead.
  onClosed(room) {
    for (const person of People.list) {
      if (person.dinnerRoom === room) this.goHome(person);
    }
  },

  goHome(person) {
    person.dinnerRoom = null; // keeps `dinnerDay`: tonight's plan is now "at home"
    const want = People.desiredLocation(person, Clock.totalMinutes);
    if (person.state === "eating") {
      People.startTrip(person, want, { floor: person.floor, x: person.x }, true);
    } else if (person.route && person.target === "restaurant") {
      person.target = want;
      People.reroute(person);
    }
  },

  // Residents and guests having dinner here tonight, or on their way.
  dinersAt(room) {
    return People.list.filter(
      (p) => p.dinnerRoom === room && p.dinnerDay === Clock.day &&
        (p.state === "eating" || (p.route && p.target === "restaurant")),
    ).length;
  },

  // Everyone eating here or on their way: residents, guests and diners
  // from outside.
  seated(room) {
    return this.dinersAt(room) + Shops.shoppersFor(room);
  },
};
