// Shops (milestone 8): where the tower's makers sell their work, and the
// first rooms that earn from visitors rather than tenants.
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
// than one by the lobby: foot traffic is about layout.
//
// Takings go into the shop's till (`room.till`) as the day goes on, and
// economy.js banks every till at midnight. Like rent owed, the till lives
// on the room, so it's saved with it and lost if the shop is demolished.

const SHOPPER_HOURS = [10, 19.5]; // shoppers arrive 10:00–19:30
const SHOPPER_GAP_MINUTES = 40; // average gap between one shop's shoppers, weekday daytime
const WEEKEND_RUSH = 2; // twice as many shoppers at weekends...
const EVENING_RUSH = 1.5; // ...and half as many again after work
const EVENING_FROM_HOUR = 17;
const BROWSE_MINUTES = [15, 40];
const NO_SALE_TRIP_MINUTES = 60; // a trip that felt this long: no sale
const MAX_SHOPPERS_PER_SHOP = 8; // in the building at once, so a jam can't snowball

const Shops = {
  _open: new Set(), // shops whose shopkeeper is in right now; see update()

  isOpen(room) {
    return this._open.has(room);
  },

  // Which shops are open: their shopkeeper is in, settled (not still
  // moving in, nor on their way out).
  refreshOpen() {
    this._open = new Set(
      People.list
        .filter((p) => p.role === "shopkeeper" && p.state === "inRoom" && !p.movingIn && !p.movingOut)
        .map((p) => p.room),
    );
  },

  update() {
    this.refreshOpen();
    const now = Clock.totalMinutes;
    const hour = Clock.hour;
    const inHours = hour >= SHOPPER_HOURS[0] && hour < SHOPPER_HOURS[1];

    for (const room of World.rooms) {
      if (room.type !== "shop") continue;
      if (!inHours || !this.isOpen(room)) {
        room.nextShopperAt = null; // the first shopper comes a while after opening
        continue;
      }
      if (room.nextShopperAt == null) {
        room.nextShopperAt = now + this.gapMinutes();
      } else if (now >= room.nextShopperAt) {
        if (this.shoppersFor(room) < MAX_SHOPPERS_PER_SHOP) {
          People.addShopper(room, randomBetween(ROOM_TYPES.shop.spendPerShopper));
        }
        room.nextShopperAt = now + this.gapMinutes();
      }
    }
  },

  // Minutes until the next shopper, around an average that shrinks when
  // it's busy, so they don't arrive like clockwork.
  gapMinutes() {
    let rush = 1;
    if (Clock.isWeekend) rush *= WEEKEND_RUSH;
    if (Clock.hour >= EVENING_FROM_HOUR) rush *= EVENING_RUSH;
    return (SHOPPER_GAP_MINUTES / rush) * randomBetween([0.5, 1.5]);
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
    person.idleUntil = Clock.totalMinutes + randomBetween(BROWSE_MINUTES);
  },

  // Called by people.js when a shopper has finished browsing.
  checkout(person) {
    const room = person.room;
    const spend = Math.round(person.budget * person.mood);
    person.bought = spend;
    if (spend > 0) {
      room.till = (room.till || 0) + spend;
      Economy.popupOverRoom(room, `+${World.formatMoney(spend)}`, "#c8f7d4");
    } else {
      Economy.popupOverRoom(room, "No sale: the trip took too long", "#d0d0d0");
    }
  },

  // Everything taken in the shops so far today, banked at midnight.
  takingsToday() {
    return World.rooms.reduce((sum, room) => sum + (room.till || 0), 0);
  },
};
