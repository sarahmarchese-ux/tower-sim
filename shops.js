// Shops (milestone 8): where the tower's makers sell their work, and the
// first rooms that earn from visitors rather than tenants.
//
// Cafés (milestone 10) and restaurants (milestone 11) run on the same
// machinery: a keeper, visitors from the lobby (the lunch crowd, or diners
// in the evening), a till and a weekly review. What differs, such as their
// hours and what visitors spend, is in rooms.js (`keeperHours`,
// `visitors`). Makers' lunch breaks are in cafes.js, and residents' and
// guests' dinners in restaurants.js. Below, "shop" means any of them, and
// "shopper" any visitor, diners included.
//
// A shop has one shopkeeper, who moves in like any tenant (economy.js) and
// keeps shop every day, weekends included (people.js). The shop is open
// while they're in it. While it's open, shoppers turn up at a lobby every
// so often and head for it: more at weekends, and more in the evening
// after work. Each one browses for a while, buys, and leaves for good.
// Shoppers are visitors, so they don't count towards the population.
//
// What a shopper spends depends on the trip in. After an easy trip
// (under COMFORTABLE_TRIP_MINUTES, the same comfort line stress.js uses,
// with stairs and queueing counted double) they spend their whole budget.
// The longer it felt beyond that, the less they spend, and after a trip
// that felt like an hour or more they leave without buying anything. So a
// shop up a long flight of stairs, or behind a jammed elevator, earns less
// than one by the lobby: foot traffic is about layout. A shopper whose trip
// in has already felt that long gives up and goes home rather than joining
// the queue, and a shopper who reaches a shop after it has closed buys
// nothing.
//
// Word gets around. Each shop keeps a reputation (`room.reputation`, 0 to
// 1) from how its recent visits went, and a shop that keeps letting
// shoppers down draws fewer of them, down to a quarter of the usual
// number. That also keeps shoppers from piling into an elevator that's
// already jammed, pushing the tenants who rely on it out.
//
// A quiet shop closes. Each shop keeps the takings of every full day it
// traded this week (`room.weekSales` over `room.weekDays`; the day it
// opened doesn't count, as it wasn't open all day). At the weekly review,
// a shop that has traded at least MIN_DAYS_JUDGED full days and averaged
// under its `quietPerDay` (rooms.js) closes: its shopkeeper leaves and it goes back
// on the market, and the next shopkeeper starts with a fresh name.
//
// Takings go into the shop's till (`room.till`) as the day goes on, and
// economy.js banks every till at midnight. Like rent owed, the till lives
// on the room, so it's saved with it and lost if the shop is demolished.

// Each storefront's visitor hours, rushes, stay, spend and quiet line are
// its `visitors` in rooms.js.
const EVENING_FROM_HOUR = 17; // the evening rush starts here
const NO_SALE_TRIP_MINUTES = 60; // a trip that felt this long: no sale
const WORD_OF_MOUTH = 0.2; // how much each visit moves a shop's reputation
const MIN_REPUTATION = 0.25; // even a shop with a bad name sees some shoppers
const MIN_DAYS_JUDGED = 3; // full days of trading before a shop can be judged quiet

const Shops = {
  _open: new Set(), // shops whose shopkeeper is in right now; see update()

  isOpen(room) {
    return this._open.has(room);
  },

  // Which shops are open: their shopkeeper is in, settled (not still
  // moving in, nor on their way out), and within their hours. One who's
  // stuck in after closing (no way out) doesn't keep the shop open.
  refreshOpen() {
    const now = Clock.totalMinutes;
    this._open = new Set(
      People.list
        .filter((p) => p.role === "shopkeeper" && p.state === "inRoom" && !p.movingIn && !p.movingOut)
        .filter((p) => People.desiredLocation(p, now) === "room")
        .map((p) => p.room),
    );
  },

  update() {
    this.refreshOpen();
    const now = Clock.totalMinutes;
    const hour = Clock.hour;

    for (const room of World.rooms) {
      if (!isStorefront(room)) continue;
      const visitors = ROOM_TYPES[room.type].visitors;
      const inHours = hour >= visitors.hours[0] && hour < visitors.hours[1];
      if (!inHours || !this.isOpen(room)) {
        room.nextShopperAt = null; // the first shopper comes a while after opening
        continue;
      }
      if (room.nextShopperAt == null) {
        room.nextShopperAt = now + this.gapMinutes(room);
      } else if (now >= room.nextShopperAt) {
        const full = this.shoppersFor(room) >= visitors.max ||
          (room.type === "cafe" && Cafes.seated(room) >= CAFE_SEATS) ||
          (room.type === "restaurant" && Restaurants.seated(room) >= RESTAURANT_SEATS);
        if (!full) People.addShopper(room, randomBetween(visitors.spend));
        room.nextShopperAt = now + this.gapMinutes(room);
      }
    }
  },

  // Minutes until the next shopper, around an average that shrinks when
  // it's busy and grows when the shop has a bad name, so they don't arrive
  // like clockwork.
  gapMinutes(room) {
    const visitors = ROOM_TYPES[room.type].visitors;
    let rush = Math.max(MIN_REPUTATION, this.reputation(room));
    if (visitors.dayRush) rush *= visitors.dayRush[Clock.day % 7];
    else if (Clock.isWeekend) rush *= visitors.weekendRush;
    if (Clock.hour >= EVENING_FROM_HOUR) rush *= visitors.eveningRush;
    return (visitors.gapMinutes / rush) * randomBetween([0.5, 1.5]);
  },

  // A new shop starts with a good name.
  reputation(room) {
    return room.reputation ?? 1;
  },

  // Each visit's outcome (1 = an easy trip and a full spend, 0 = no sale)
  // nudges the shop's reputation towards it.
  recordVisit(room, mood) {
    room.reputation = this.reputation(room) * (1 - WORD_OF_MOUTH) + mood * WORD_OF_MOUTH;
  },

  // How long a shopper's trip in has felt so far: the same sum stress.js
  // makes on arrival.
  feltSoFar(person) {
    return Clock.totalMinutes - person.tripStartedAt + person.tripStairsMinutes + person.tripWaitMinutes;
  },

  // Called by people.js for a shopper on their way in: past the point of
  // buying anything, they turn back.
  shouldGiveUp(person) {
    return this.feltSoFar(person) >= NO_SALE_TRIP_MINUTES;
  },

  giveUp(person) {
    person.bought = 0;
    this.recordVisit(person.room, 0);
    Economy.popupOverRoom(person.room, "Gave up: too far", "#d0d0d0");
  },

  // Shoppers in the building for this shop: on their way, browsing, or
  // leaving.
  shoppersFor(room) {
    return People.list.filter((p) => p.role === "shopper" && p.room === room && p.state !== "offsite").length;
  },

  // How much of their budget a shopper will spend, from how long the trip
  // in felt: all of it up to the comfort line, nothing from an hour on.
  moodFor(feltMinutes) {
    const range = NO_SALE_TRIP_MINUTES - COMFORTABLE_TRIP_MINUTES;
    return Math.min(1, Math.max(0, (NO_SALE_TRIP_MINUTES - feltMinutes) / range));
  },

  // Called by people.js when a shopper walks in.
  onShopperArrived(person, feltMinutes) {
    person.mood = this.moodFor(feltMinutes);
    person.idleUntil = Clock.totalMinutes + randomBetween(ROOM_TYPES[person.room.type].visitors.stayMinutes);
  },

  // Called by people.js when a shopper has finished browsing.
  checkout(person) {
    const room = person.room;
    const open = this.isOpen(room);
    const mood = open ? person.mood : 0;
    const spend = Math.round(person.budget * mood);
    person.bought = spend;
    this.recordVisit(room, mood);
    if (spend > 0) {
      room.till = (room.till || 0) + spend;
      Economy.popupOverRoom(room, `+${World.formatMoney(spend)}`, "#c8f7d4");
    } else {
      Economy.popupOverRoom(room, open ? "No sale: the trip took too long" : "No sale: closed", "#d0d0d0");
    }
  },

  // Called by economy.js at midnight, with the day's takings, for a shop
  // that was occupied the whole day just ended.
  recordFullDay(room, takings) {
    room.weekSales = (room.weekSales || 0) + takings;
    room.weekDays = (room.weekDays || 0) + 1;
  },

  // This week's average takings per full day (null before the first).
  weekAverage(room) {
    return room.weekDays ? room.weekSales / room.weekDays : null;
  },

  // On course to close at the weekly review?
  isQuiet(room) {
    const average = this.weekAverage(room);
    return average !== null && average < ROOM_TYPES[room.type].visitors.quietPerDay;
  },

  // Sunday night, after the stress review: quiet shops close. Every shop
  // starts the new week with a clean slate.
  weeklyReview() {
    for (const room of [...World.rooms]) {
      if (!isStorefront(room)) continue;
      if (room.status === "occupied" && room.weekDays >= MIN_DAYS_JUDGED && this.isQuiet(room)) {
        Economy.moveOut(room, `Closed: too few ${ROOM_TYPES[room.type].visitors.who}`);
      }
      room.weekSales = 0;
      room.weekDays = 0;
    }
  },

  // A shop changing hands starts afresh.
  onMovedOut(room) {
    room.reputation = 1;
    room.weekSales = 0;
    room.weekDays = 0;
  },

  // Everything taken in the shops so far today, banked at midnight.
  takingsToday() {
    return World.rooms.reduce((sum, room) => sum + (room.till || 0), 0);
  },
};
