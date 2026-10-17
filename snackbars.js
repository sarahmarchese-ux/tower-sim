// Snack Bars (milestone 14): cheap, quick food, all day, every day.
//
// A Snack Bar is a storefront (shops.js does its keeper, its till, its own
// small crowd from outside, drivers on top, and its weekly review). It
// unlocks at 3★, and it's the first room where one visit leads into
// another. This file adds everyone else who eats there:
//
//   - Shoppers, on their way out of a shop: about one in SNACK_AFTER_SHOP
//     stops for a snack, if a Snack Bar is open, has a seat and is a short
//     detour from the shop (SNACK_DETOUR_COST: about one flight of stairs
//     or a short walk). They're still visitors: they walk over, eat, pay,
//     and leave from there (by the lobby, or back to their car). What they
//     spend depends on that short leg, as it does for any visitor, so a
//     Snack Bar beside the shops gets their full spend. `afterShop` marks
//     them, so they don't take the places of the Snack Bar's own crowd.
//   - Makers with no café seat on their weekday lunch break (cafes.js):
//     they pick a café first, and with none, the nearest Snack Bar within
//     the same detour, instead of going out. They eat for 10–15 minutes,
//     then go back to their studio for the rest of their break, which
//     keeps them off the lifts to the lobby at the busiest time of day.
//   - Residents at weekends and hotel guests any day, at lunchtime, if
//     they're at home: about one day in SNACK_CHANCE_DAYS, they go to the
//     nearest Snack Bar that's open, has a seat and is no further than
//     they'd go for dinner (MAX_SNACK_TRIP_COST: about four flights of
//     stairs with a short walk, or a lift ride), eat for 10–15 minutes and
//     go home. Without one, they eat at home.
//
// Makers, residents and guests pay in full; visitors pay less after a long
// trip, as at any storefront.
//
// While it's serving (every day, its `servingHours`), a Snack Bar is busy
// and noisy: it gives off its `noise` to the rooms around it (stress.js),
// evenings included, when residents mind noise most. So it's a poor
// neighbour for condos and hotel rooms, who also want one close.
//
// A resident's or guest's lunchtime (`snackAt`) is given them once the
// tower has a Snack Bar, the first time they're at home to plan, rather
// than when an older save loads, so a save from before Snack Bars loads
// (and saves back) exactly as it was.

const SNACK_BAR_SEATS = 12; // everyone eating or on their way, at once
const SNACK_AFTER_SHOP = 3; // about one shopper in this many stops for a snack
const SNACK_DETOUR_COST = 24; // from the shop: a flight of stairs (12) and a short walk, or 24 tiles on the level
const SNACK_CHANCE_DAYS = 3; // residents (at weekends) and guests snack about one day in this many
const MAX_SNACK_TRIP_COST = MAX_DINNER_TRIP_COST; // further than this, residents and guests eat at home, as for dinner
const SNACK_START_HOURS = [11.5, 13.5]; // residents' and guests' lunchtimes start 11:30am–1:30pm...
const SNACK_LOOK_MINUTES = 30; // ...and if they're out or busy for this long after, they skip it
const SNACK_MINUTES = [10, 15]; // how long anyone eats at a Snack Bar
const SNACK_GIVE_UP_MINUTES = 120; // still not there this long after setting off: lunch is over

const SnackBars = {
  _anyVersion: -1,
  _any: false,

  // Does the tower have a Snack Bar at all? Cached until the building
  // changes, since everyone at home asks at lunchtime.
  anyBuilt() {
    if (this._anyVersion !== World.version) {
      this._any = World.rooms.some((room) => room.type === "snackbar");
      this._anyVersion = World.version;
    }
    return this._any;
  },

  // Every day in its serving hours, while it's open.
  isServing(room) {
    const [from, to] = ROOM_TYPES.snackbar.servingHours;
    return Shops.isOpen(room) && Clock.hour >= from && Clock.hour < to;
  },

  // Somewhere to sit: serving, with a free seat.
  hasSeat(room) {
    return this.isServing(room) && this.seated(room) < SNACK_BAR_SEATS;
  },

  // A seat somewhere along the counter.
  seatX(room) {
    return room.tileStart + 0.5 + Math.random() * (ROOM_TYPES.snackbar.width - 1);
  },

  // The middle of a Snack Bar, for planning routes to it.
  point(room) {
    return { floor: room.floor, x: room.tileStart + ROOM_TYPES.snackbar.width / 2 };
  },

  // The Snack Bar with a seat that's the cheapest trip from `from`, if
  // that's no more than `maxCost`; null if none.
  nearest(from, maxCost) {
    const open = World.rooms.filter((room) => room.type === "snackbar" && this.hasSeat(room));
    return open[Routing.cheapestOf(from, open.map((room) => this.point(room)), maxCost)] || null;
  },

  // --- Shoppers, after a shop ---

  // Called by people.js when a shopper has paid at a shop: maybe they stop
  // for a snack on their way out. If so, they become the Snack Bar's
  // visitor, set off for it from where they stand, and this returns true.
  stopAfterShop(person) {
    if (person.room.type !== "shop" || person.afterShop || person.movingOut) return false;
    if (!World.rooms.some((room) => room.type === "snackbar" && this.hasSeat(room))) return false;
    if (Math.random() * SNACK_AFTER_SHOP >= 1) return false;
    const snackBar = this.nearest({ floor: person.floor, x: person.x }, SNACK_DETOUR_COST);
    if (!snackBar) return false;
    person.room = snackBar;
    person.afterShop = true;
    person.hasBag = person.bought > 0; // still carrying what they bought at the shop
    person.budget = randomBetween(ROOM_TYPES.snackbar.visitors.spend);
    person.bought = null;
    person.browseX = this.seatX(snackBar);
    People.startTrip(person, "room", { floor: person.floor, x: person.x }, true);
    return true;
  },

  // --- Residents and hotel guests, at lunchtime ---

  // When a resident or guest has lunch, in minutes after midnight, and
  // today's plan: `snackDay` (the game day it was made for), `snackRoom`
  // (the Snack Bar, or null to eat at home) and `snackDoneAt` (when they've
  // finished eating, once they're there).
  snackTimes() {
    return {
      snackAt: randomBetween(SNACK_START_HOURS.map((h) => h * 60)),
      snackDay: null,
      snackRoom: null,
      snackDoneAt: null,
    };
  },

  // Called by people.js for a resident or guest at home: once their
  // lunchtime has come, decide about today (if not decided already).
  // Residents only go at weekends.
  planSnack(person, now) {
    const day = Math.floor(now / MINUTES_PER_DAY);
    const minute = now - day * MINUTES_PER_DAY;
    if (person.snackDay === day) return;
    if (person.snackAt != null && (minute < person.snackAt || minute >= person.snackAt + SNACK_LOOK_MINUTES)) return;
    if (!this.anyBuilt()) return; // nothing to plan for (and no lunchtime given yet)
    if (person.snackAt == null) {
      Object.assign(person, this.snackTimes());
      if (minute < person.snackAt || minute >= person.snackAt + SNACK_LOOK_MINUTES) return;
    }
    person.snackDay = day;
    person.snackDoneAt = null;
    const today = person.role === "guest" || day % 7 >= 5;
    const home = { floor: person.room.floor, x: People.homeX(person) };
    person.snackRoom = today && Math.random() * SNACK_CHANCE_DAYS < 1 ? this.nearest(home, MAX_SNACK_TRIP_COST) : null;
    if (person.snackRoom) person.seatX = this.seatX(person.snackRoom);
  },

  // For people.js's one question: is this resident or guest out for a
  // snack right now? From their lunchtime until they've eaten (or, if
  // they never got there, until lunch is long over).
  wantsSnack(person, t, day) {
    if (!person.snackRoom || person.snackDay !== day) return false;
    if (person.snackDoneAt != null) return t < person.snackDoneAt;
    const minute = t - day * MINUTES_PER_DAY;
    return minute >= person.snackAt && minute < person.snackAt + SNACK_GIVE_UP_MINUTES;
  },

  // --- Sitting down ---

  // Called by people.js when a resident or guest sits down: they pay, and
  // eat for a few minutes. If it's shut, they go home. A guest who
  // checked out early on the way down doesn't stop to eat.
  onSnackerArrived(person) {
    const room = person.snackRoom;
    if (person.movingOut) return;
    if (!Shops.isOpen(room)) {
      Economy.popupOverRoom(room, "Closed: lunch at home", "#d0d0d0");
      this.goHome(person);
      return;
    }
    person.snackDoneAt = Clock.totalMinutes + randomBetween(SNACK_MINUTES);
    person.idleUntil = person.snackDoneAt;
    this.pay(room);
  },

  // Called by cafes.js when a maker sits down here: they eat for a few
  // minutes, then go back to their studio for the rest of their break.
  onMakerArrived(person) {
    person.lunchDoneAt = Clock.totalMinutes + randomBetween(SNACK_MINUTES);
    person.idleUntil = person.lunchDoneAt;
    this.pay(person.lunchCafe);
  },

  // A full-price meal into the till.
  pay(room) {
    const spend = Math.round(randomBetween(ROOM_TYPES.snackbar.visitors.spend));
    room.till = (room.till || 0) + spend;
    Economy.popupOverRoom(room, `+${World.formatMoney(spend)}`, "#c8f7d4");
  },

  // --- Closing ---

  // A Snack Bar has closed (its keeper moved out) or been knocked down:
  // makers eating there or on their way eat out instead, and residents and
  // guests go home. (Its own visitors, shoppers after a shop included,
  // turn back with it: people.js.)
  onClosed(room) {
    Cafes.onClosed(room);
    for (const person of People.list) {
      if (person.snackRoom === room) this.goHome(person);
    }
  },

  // Only someone eating here or on their way moves: a resident or guest
  // still pointing at today's Snack Bar may be at dinner by now.
  goHome(person) {
    const going = person.target === "snack" && (person.state === "eating" || person.route);
    person.snackRoom = null; // keeps `snackDay`: today's plan is now "at home"
    if (!going) return;
    const want = People.desiredLocation(person, Clock.totalMinutes);
    if (person.state === "eating") {
      People.startTrip(person, want, { floor: person.floor, x: person.x }, true);
    } else {
      person.target = want;
      People.reroute(person);
    }
  },

  // --- Counting ---

  // Residents and guests eating here today, or on their way.
  snackersAt(room) {
    return People.list.filter(
      (p) => p.snackRoom === room && p.snackDay === Clock.day && p.target === "snack" && (p.state === "eating" || p.route),
    ).length;
  },

  // Everyone eating here or on their way: makers, residents, guests, and
  // visitors (its own, drivers, and shoppers after a shop; as at any
  // storefront, a visitor holds their place until they've left the
  // building).
  seated(room) {
    return Cafes.makersAt(room) + this.snackersAt(room) + Shops.shoppersFor(room);
  },

  // Shoppers who came over from a shop today, for the tooltip.
  onVisitorArrived(person) {
    if (!person.afterShop) return;
    const room = person.room;
    if (room.afterShopDay !== Clock.day) {
      room.afterShopDay = Clock.day;
      room.afterShopToday = 0;
    }
    room.afterShopToday++;
  },

  afterShopToday(room) {
    return room.afterShopDay === Clock.day ? room.afterShopToday : 0;
  },
};
