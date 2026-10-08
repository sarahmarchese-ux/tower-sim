// The Security office and theft (milestone 12).
//
// From 2★, the tower has things worth stealing, and every night between
// midnight and BREAK_IN_HOURS[1] each room with something worth taking has
// about a 1 in 20 chance of a break-in:
//   - a Craft Shop loses $1,000–3,000 of stock, straight out of your money;
//   - a Jewellery Studio's makers lose tools and stock, and gain
//     BREAK_IN_STRESS each (stress.js names it as the cause);
//   - a hotel room with guests in has them robbed, and the stay gets the
//     worst review, however calm it was otherwise (hotels.js).
// A message says what happened. So a tower with four unprotected shops
// sees a break-in or two a week.
//
// A Security office protects its own floor and the `reach` floors above
// and below it (rooms.js: 5), while its guards are on duty: in the office,
// on their night shift (8pm–6am; people.js). Protected rooms are never
// robbed. So a tall tower needs several offices, and the guards have to be
// able to get to theirs: an office nobody can reach protects nothing.
//
// Whether (and when) a room is broken into tonight is decided once a
// night, the first time the game sees it after midnight (`breakInDay`,
// `breakInAt` on the room, so it's saved with it). Whether it's protected
// is checked at the moment it happens.

const BREAK_IN_CHANCE = 1 / 20; // per room, per night
const BREAK_IN_HOURS = [0, 5]; // midnight to 5am
const THEFTS_FROM_STARS = 2;
const STOCK_STOLEN = [1000, 3000]; // from a shop
const BREAK_IN_STRESS = 25; // for each maker of a jewellery studio

const Security = {
  update() {
    if (Ratings.stars < THEFTS_FROM_STARS || Clock.hour >= BREAK_IN_HOURS[1]) return;
    const now = Clock.totalMinutes;
    const day = Clock.day;
    for (const room of [...World.rooms]) {
      if (!this.isValuable(room)) continue;
      if (room.breakInDay !== day) {
        room.breakInDay = day;
        const lastChance = day * MINUTES_PER_DAY + BREAK_IN_HOURS[1] * 60;
        room.breakInAt = Math.random() < BREAK_IN_CHANCE ? randomBetween([now, lastChance]) : null;
      }
      if (room.breakInAt != null && now >= room.breakInAt) {
        room.breakInAt = null;
        this.breakIn(room);
      }
    }
  },

  // Shops, jewellery studios and hotel rooms: the rooms a thief is after.
  isValuable(room) {
    return room.type === "shop" || room.type === "jewellery" || isHotel(room);
  },

  // Does this office's reach take in this room's floor?
  covers(office, room) {
    return Math.abs(office.floor - room.floor) <= ROOM_TYPES.security.reach;
  },

  // Is at least one of this office's guards in, on shift?
  onDuty(office) {
    return People.list.some(
      (p) => p.room === office && p.role === "guard" && p.state === "inRoom" && !p.movingIn && !p.movingOut,
    );
  },

  isProtected(room) {
    return World.rooms.some((office) => office.type === "security" && this.covers(office, room) && this.onDuty(office));
  },

  // A thief tries this room. Returns what happened (the message), or null
  // if there was nothing to take or a guard was on duty nearby.
  breakIn(room) {
    if (this.isProtected(room)) return null;
    const where = `${ROOM_TYPES[room.type].name} on ${floorLabel(room.floor)}`;
    let message = null;
    let popup = "Break-in!";
    if (room.type === "shop") {
      if (room.status !== "occupied") return null;
      const taken = Math.round(randomBetween(STOCK_STOLEN) / 100) * 100;
      World.money -= taken;
      message = `Break-in at the ${where}: ${World.formatMoney(taken)} of stock taken`;
      popup = `Break-in -${World.formatMoney(taken)}`;
    } else if (room.type === "jewellery") {
      if (room.status !== "occupied") return null;
      const makers = People.list.filter((p) => p.room === room && !p.movingIn && !p.movingOut);
      for (const maker of makers) Stress.add(maker, BREAK_IN_STRESS, "breakIns");
      message = `Break-in at the ${where}: ${makers.length === 1 ? "its maker lost" : "the makers lost"} tools and stock`;
    } else if (isHotel(room)) {
      const guests = People.list.filter((p) => p.room === room && p.role === "guest" && p.state === "inRoom" && !p.movingOut);
      if (room.status !== "occupied" || !guests.length) return null;
      room.robbed = true;
      message = `Break-in at the ${where}: ${guests.length === 1 ? "the guest was" : "the guests were"} robbed`;
    }
    Economy.popupOverRoom(room, popup, "#ff9d9d");
    UI.announce(message);
    return message;
  },

  // For a valuable room's tooltip, from 2★: why it isn't protected, or
  // null if an office with guards covers it.
  warning(room) {
    if (Ratings.stars < THEFTS_FROM_STARS || !this.isValuable(room)) return null;
    const reach = ROOM_TYPES.security.reach;
    const offices = World.rooms.filter((office) => office.type === "security" && this.covers(office, room));
    if (!offices.length) {
      return `No security within ${reach} floors: break-ins happen at night. Build a Security office no more than ${reach} floors above or below.`;
    }
    if (!offices.some((office) => office.status === "occupied")) {
      return "The Security office nearby has no guards yet, so nothing stops a break-in.";
    }
    return null;
  },

  // "2F–12F" for an office's tooltip: its reach, as far as the tower goes.
  coverageLabel(office) {
    const reach = ROOM_TYPES.security.reach;
    const built = [...World.floors].filter(([, tiles]) => tiles.size).map(([floor]) => floor);
    const low = Math.max(office.floor - reach, Math.min(...built));
    const high = Math.min(office.floor + reach, Math.max(...built));
    return `${floorLabel(low)}–${floorLabel(high)}`;
  },

  // Shops, jewellery studios and hotel rooms in this office's reach.
  roomsCovered(office) {
    return World.rooms.filter((room) => this.isValuable(room) && this.covers(office, room)).length;
  },
};
