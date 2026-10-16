// Money coming in and going out, and who moves in when.
//
// A new studio or condo starts empty ("vacant"). After a delay, its new
// tenants turn up at the lobby and walk in ("movingIn"; people.js does the
// walking). The moment the first of them steps through the door, the room
// is "occupied": a condo's sale price is paid right then, and a studio
// starts owing rent. A room nobody can reach from a lobby (the red "!")
// never fills — its viewing is simply put off until the player connects it.
//
// If a room's people are too stressed at the weekly review (stress.js),
// they move out and the room goes back on the market. A condo's owners get
// their money back, as in SimTower, so a condo that empties costs you its
// sale price.
//
// Every midnight is a tally. Each occupied studio adds a day's worth of its
// weekly rent to what it owes (so a studio that moved in on Thursday pays
// for Thursday to Sunday), each shop's takings for the day are banked (see
// shops.js; cafés, restaurants and Snack Bars too), each hotel room with guests in it earns its night (see
// hotels.js), and each elevator's upkeep and each staffed service room's
// wages (Housekeeping and Security; rooms.js `wagesPerDay`) are paid. Once a week,
// at midnight at the end of Sunday, is payday: everything owed comes in at
// once. Upkeep keeps coming every night whether or not anyone pays you, so
// money can dip below zero between paydays. Stay in the red for a full game
// week and the game is over.
//
// Rent levels (milestone 14b; rooms.js: RENT_LEVELS) set what a studio pays
// and what a condo sells for, and how fast a new tenant turns up. A
// studio's level applies at once, to the rent it owes from then on. A
// condo's price is fixed when it sells (`soldFor`, `soldAtLevel`), and a
// refund pays back what its owners paid. A studio or condo whose tenants
// moved out stressed gets a bad name (`hardToLet`): nobody moves in for
// HARD_TO_LET_DAYS, rather than the usual few hours, and less at a lower
// rent. One that empties for any other reason re-lets as usual.
//
// State lives in two places: each room's `status` / `moveInAt` / `rentOwed`
// (so it disappears with the room if it's demolished), and the few totals
// below. Hotel rooms don't take tenants: hotels.js books guests into them.

const MOVE_IN_DELAY_MINUTES = [60, 240]; // after placing: 1–4 game hours (at Normal rent)
const HARD_TO_LET_DAYS = [1, 3]; // after tenants leave stressed (at Normal rent)
const MOVE_IN_RETRY_MINUTES = [30, 90]; // unreachable: look again this soon
// When movers turn up. Makers come to see a studio during working hours
// (weekdays, 8am–4pm); condo buyers can come any day until the evening,
// and so can shopkeepers (shops open at weekends too) until 6pm, and new
// housekeepers and guards (they work weekends too).
const MOVE_IN_HOURS = { maker: [8, 16], resident: [8, 20], shopkeeper: [8, 18], housekeeper: [8, 18], guard: [8, 18] };
const MOVE_IN_WEEKDAYS_ONLY = { maker: true, resident: false, shopkeeper: false, housekeeper: false, guard: false };
const BANKRUPTCY_GRACE_DAYS = 7;

const Economy = {
  lastTallyDay: Clock.day,
  lastPayday: null, // total rent paid at the most recent payday
  lastSales: null, // total shop takings banked at the most recent midnight
  lastHotel: null, // total hotel nights paid at the most recent midnight
  debtSince: null, // game minute money went negative, or null
  bankrupt: false,
  popups: [], // floating "Rent +$11,200" labels; see render.js

  onRoomAdded(room) {
    if (room.status === "vacant" && !isHotel(room)) {
      room.moveInAt = Clock.totalMinutes + randomBetween(MOVE_IN_DELAY_MINUTES);
    }
  },

  update() {
    const now = Clock.totalMinutes;

    for (const room of World.rooms) {
      if (room.status === "vacant" && !isHotel(room) && now >= room.moveInAt) this.tryMoveIn(room);
    }

    while (Clock.day > this.lastTallyDay) {
      this.lastTallyDay++;
      this.tally();
    }

    if (World.money >= 0) {
      this.debtSince = null;
    } else if (this.debtSince === null) {
      this.debtSince = now;
    } else if (now - this.debtSince >= BANKRUPTCY_GRACE_DAYS * MINUTES_PER_DAY) {
      this.bankrupt = true;
    }
  },

  // The viewing is due. Movers only come in their hours (see
  // MOVE_IN_HOURS), and only if they can actually get to the room;
  // otherwise the viewing is put off.
  // (A bad name wears off once its wait is over, and from then on the
  // room is only waiting for hours, which no rent level changes:
  // `hoursWait`.)
  tryMoveIn(room) {
    delete room.hardToLet;
    const opensAt = this.nextMoveInOpening(ROOM_TYPES[room.type].role);
    if (opensAt > Clock.totalMinutes) {
      room.moveInAt = opensAt + randomBetween([0, 120]);
      room.hoursWait = true;
      return;
    }
    delete room.hoursWait;
    if (!Routing.isReachable(room)) {
      room.moveInAt = Clock.totalMinutes + randomBetween(MOVE_IN_RETRY_MINUTES);
      return;
    }
    World.setRoomStatus(room, "movingIn");
    People.moveIn(room);
  },

  // The game minute movers for this role can next turn up: now, if it's
  // within their hours, else the next day their hours open.
  nextMoveInOpening(role) {
    const [openHour, closeHour] = MOVE_IN_HOURS[role];
    const weekdaysOnly = MOVE_IN_WEEKDAYS_ONLY[role];
    for (let day = Clock.day; ; day++) {
      if (weekdaysOnly && day % 7 >= 5) continue; // Sat and Sun
      const opens = day * MINUTES_PER_DAY + openHour * 60;
      const closes = day * MINUTES_PER_DAY + closeHour * 60;
      if (Clock.totalMinutes < closes) return Math.max(opens, Clock.totalMinutes);
    }
  },

  // Called by people.js when a mover reaches their new room. A condo sells
  // at its rent level's price, and its owners keep that level's line.
  onArrived(room) {
    if (room.status !== "movingIn") return;
    World.setRoomStatus(room, "occupied");
    room.occupiedAt = Clock.totalMinutes;
    room.rentOwed = room.rentOwed || 0;
    const salePrice = ROOM_TYPES[room.type].salePrice;
    if (salePrice) {
      const level = rentLevel(room);
      const price = Math.round(salePrice * RENT_LEVELS[level].factor);
      room.soldFor = price;
      room.soldAtLevel = level;
      World.money += price;
      this.popupOverRoom(room, `Sold +${World.formatMoney(price)}`, "#7dffa0");
    }
  },

  // What a condo's owners paid for it (a condo sold before rent levels:
  // the full price).
  soldFor(room) {
    return room.soldFor ?? ROOM_TYPES[room.type].salePrice;
  },

  // How long until a vacant room's next tenants turn up, in minutes: a few
  // hours, or days if it has a bad name, and quicker at a lower rent.
  reletMinutes(room, hardToLet = false) {
    const wait = hardToLet ? randomBetween(HARD_TO_LET_DAYS) * MINUTES_PER_DAY : randomBetween(MOVE_IN_DELAY_MINUTES);
    return wait / RENT_LEVELS[rentLevel(room)].letSpeed;
  },

  // A new rent level for a studio, condo or hotel room. A vacant studio or
  // condo waiting for tenants gets them sooner (or later) to match.
  setRentLevel(room, level) {
    if (!hasRentLevel(room) || !RENT_LEVELS[level]) return;
    const before = RENT_LEVELS[rentLevel(room)].letSpeed;
    if (level === "normal") delete room.rentLevel;
    else room.rentLevel = level;
    const after = RENT_LEVELS[level].letSpeed;
    const now = Clock.totalMinutes;
    if (room.status === "vacant" && !isHotel(room) && !room.hoursWait && room.moveInAt > now) {
      room.moveInAt = now + ((room.moveInAt - now) * before) / after;
    }
  },

  // Midnight: settle the day that just ended (`lastTallyDay` is the day now
  // starting, so day 7, 14, ... means a week has just finished).
  tally() {
    for (const room of World.rooms) {
      const rentPerWeek = ROOM_TYPES[room.type].rentPerWeek;
      if (rentPerWeek && room.status === "occupied") room.rentOwed += (rentPerWeek * RENT_LEVELS[rentLevel(room)].factor) / 7;
    }

    let sales = 0;
    for (const room of World.rooms) {
      if (!isStorefront(room)) continue;
      const takings = room.till || 0;
      room.till = 0;
      // Occupied all through the day just ended? Then it counts towards
      // the week's average (shops.js).
      const dayStart = (this.lastTallyDay - 1) * MINUTES_PER_DAY;
      if (room.status === "occupied" && (room.occupiedAt ?? 0) <= dayStart) Shops.recordFullDay(room, takings);
      if (room.status === "occupied" || takings > 0) room.salesYesterday = takings; // not before it ever opened
      if (takings <= 0) continue;
      sales += takings;
      this.popupOverRoom(room, `Sales +${World.formatMoney(takings)}`, "#7dffa0");
    }
    World.money += sales;
    this.lastSales = sales;

    const nights = Hotels.nightlyTally();
    World.money += nights;
    this.lastHotel = nights;

    for (const t of World.transit) {
      const upkeepPerDay = TRANSIT_TYPES[t.kind].upkeepPerDay;
      if (!upkeepPerDay) continue;
      World.money -= upkeepPerDay;
      this.popup(t.tileStart + TRANSIT_TYPES[t.kind].width / 2, t.floorBottom, `-${World.formatMoney(upkeepPerDay)}`, "#ff9d9d");
    }

    // Service rooms pay their staff every day, once they've been hired.
    for (const room of World.rooms) {
      const wages = ROOM_TYPES[room.type].wagesPerDay;
      if (!wages || room.status !== "occupied") continue;
      World.money -= wages;
      this.popupOverRoom(room, `Wages -${World.formatMoney(wages)}`, "#ff9d9d");
    }

    if (this.lastTallyDay % 7 === 0) {
      Stress.weeklyReview();
      Shops.weeklyReview();
      this.payday();
    }
  },

  // Too stressed (or, for a shop, too quiet; see shops.js): the tenants
  // leave and the room is back on the market. A departing studio still
  // pays the rent it owes at payday. A studio or condo whose tenants left
  // stressed (`stressed`) is hard to let for a while.
  moveOut(room, reason = "Moved out", { stressed = false } = {}) {
    World.setRoomStatus(room, "vacant");
    const hardToLet = stressed && hasRentLevel(room) && !isHotel(room);
    if (hardToLet) room.hardToLet = true;
    delete room.hoursWait;
    room.moveInAt = Clock.totalMinutes + this.reletMinutes(room, hardToLet);
    People.moveOut(room);
    if (isStorefront(room)) Shops.onMovedOut(room);
    if (room.type === "cafe") Cafes.onClosed(room);
    if (room.type === "restaurant") Restaurants.onClosed(room);
    if (room.type === "snackbar") SnackBars.onClosed(room);
    if (ROOM_TYPES[room.type].salePrice) {
      const refund = this.soldFor(room);
      delete room.soldFor;
      delete room.soldAtLevel;
      World.money -= refund;
      this.popupOverRoom(room, `Moved out: refund -${World.formatMoney(refund)}`, "#ff9d9d");
    } else {
      this.popupOverRoom(room, reason, "#ff9d9d");
    }
  },

  payday() {
    let total = 0;
    for (const room of World.rooms) {
      if (!room.rentOwed) continue;
      const rent = Math.round(room.rentOwed);
      total += rent;
      room.rentOwed = 0;
      this.popupOverRoom(room, `Rent +${World.formatMoney(rent)}`, "#7dffa0");
    }
    World.money += total;
    this.lastPayday = total;
  },

  // Rent owed so far this week, paid at the end of Sunday.
  rentDue() {
    return Math.round(World.rooms.reduce((sum, room) => sum + (room.rentOwed || 0), 0));
  },

  // How long until bankruptcy, in game minutes (null if not in debt).
  minutesUntilBankrupt() {
    if (this.debtSince === null) return null;
    return Math.max(0, this.debtSince + BANKRUPTCY_GRACE_DAYS * MINUTES_PER_DAY - Clock.totalMinutes);
  },

  popupOverRoom(room, text, color) {
    this.popup(room.tileStart + roomWidth(room) / 2, room.floor, text, color);
  },

  // Popups fade on real time, not game time, so they're readable at any
  // speed (and still fade while paused).
  popup(x, floor, text, color) {
    this.popups.push({ x, floor, text, color, bornAt: performance.now() });
  },
};

World.subscribe((event, payload) => {
  if (event === "roomAdded") Economy.onRoomAdded(payload);
});
