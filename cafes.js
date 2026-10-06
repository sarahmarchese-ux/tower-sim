// Cafés (milestone 10): lunch for the tower's makers.
//
// A café is a storefront (shops.js does its keeper, its till, its lunch
// crowd from outside and its weekly review). This file adds the makers.
//
// On weekdays every maker takes a lunch break (people.js: `lunchAt`,
// `lunchMinutes`). When it comes round, they decide where to eat, once a
// day: the nearest café that's open and has a free seat, unless it's a lot
// further than going out (more than LUNCH_DETOUR_COST further, in the route
// planner's "tiles of walking"; a flight of stairs is 25). With no such
// café they go out of the building and come back, as in SimTower, which
// brings a lunchtime rush to the lobby and elevators. A café saves them the
// trip down, and they pay for their meal. But a café high up the tower
// pulls everyone up the elevators at once, so where it goes matters.
//
// While it's serving lunch (weekdays, its `lunchHours`), a café is busy
// and noisy: it gives off its `noise` to the rooms around it, as a studio
// does while its makers work (stress.js).

const LUNCH_DETOUR_COST = 10; // a café this much further than the way out is still worth it
const CAFE_SEATS = 24; // makers and diners from outside at once

const Cafes = {
  // Weekdays in its lunch hours, while it's open.
  isServingLunch(room) {
    const [from, to] = ROOM_TYPES[room.type].lunchHours;
    return Shops.isOpen(room) && !Clock.isWeekend && Clock.hour >= from && Clock.hour < to;
  },

  // Called by people.js for a maker at work in their studio: once their
  // break has started, make today's plan (if not made already).
  planLunch(person, now) {
    const day = Math.floor(now / MINUTES_PER_DAY);
    const minute = now - day * MINUTES_PER_DAY;
    if (person.lunchDay === day || day % 7 >= 5) return;
    if (minute < person.lunchAt || minute >= person.lunchAt + person.lunchMinutes) return;
    person.lunchDay = day;
    person.lunchCafe = this.pick(person);
    if (person.lunchCafe) {
      const width = ROOM_TYPES.cafe.width;
      person.seatX = person.lunchCafe.tileStart + 0.5 + Math.random() * (width - 1);
    }
  },

  // The café closest to this maker's studio that's open, has a seat, and
  // isn't much further than going out; null if none.
  pick(person) {
    const home = { floor: person.room.floor, x: People.homeX(person) };
    const out = Routing.plan([home], Routing.lobbyPoints());
    let best = null;
    let bestCost = out ? out.cost + LUNCH_DETOUR_COST : Infinity;
    for (const room of World.rooms) {
      if (room.type !== "cafe" || !Shops.isOpen(room) || this.seated(room) >= CAFE_SEATS) continue;
      const seat = { floor: room.floor, x: room.tileStart + ROOM_TYPES.cafe.width / 2 };
      const route = Routing.plan([home], [seat]);
      if (route && route.cost <= bestCost) {
        best = room;
        bestCost = route.cost;
      }
    }
    return best;
  },

  // Called by people.js when a maker sits down: they pay for lunch. If
  // it's shut, they go and eat out instead.
  onMakerArrived(person) {
    const room = person.lunchCafe;
    if (!Shops.isOpen(room)) {
      Economy.popupOverRoom(room, "Closed: eating out", "#d0d0d0");
      this.eatOut(person);
      return;
    }
    const spend = Math.round(randomBetween(ROOM_TYPES.cafe.visitors.spend));
    room.till = (room.till || 0) + spend;
    Economy.popupOverRoom(room, `+${World.formatMoney(spend)}`, "#c8f7d4");
  },

  // A café has closed (its owner moved out) or been knocked down: makers
  // eating there or on their way eat out instead (or, if their break is
  // over, go back to work).
  onClosed(room) {
    for (const person of People.list) {
      if (person.lunchCafe === room) this.eatOut(person);
    }
  },

  eatOut(person) {
    person.lunchCafe = null; // keeps `lunchDay`: today's plan is now "out"
    const want = People.desiredLocation(person, Clock.totalMinutes);
    if (person.state === "eating") {
      People.startTrip(person, want, { floor: person.floor, x: person.x });
    } else if (person.route && person.target === "cafe") {
      person.target = want;
      People.reroute(person);
    }
  },

  // Makers having lunch here today, or on their way.
  makersAt(room) {
    return People.list.filter(
      (p) => p.role === "maker" && p.lunchCafe === room && p.lunchDay === Clock.day &&
        (p.state === "eating" || (p.route && p.target === "cafe")),
    ).length;
  },

  // Everyone eating here or on their way: makers and the lunch crowd.
  seated(room) {
    return this.makersAt(room) + Shops.shoppersFor(room);
  },
};
