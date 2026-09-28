// Money coming in and going out, and who moves in when.
//
// A new studio or condo starts empty ("vacant"). After a delay, its new
// tenants turn up at the lobby and walk in ("movingIn"; people.js does the
// walking). The moment the first of them steps through the door, the room
// is "occupied": a condo's sale price is paid right then, and a studio
// starts owing rent. A room nobody can reach from a lobby (the red "!")
// never fills — its viewing is simply put off until the player connects it.
//
// Every midnight is a tally. Each occupied studio adds a day's worth of its
// weekly rent to what it owes (so a studio that moved in on Thursday pays
// for Thursday to Sunday), and each elevator's upkeep is paid. Once a week,
// at midnight at the end of Sunday, is payday: everything owed comes in at
// once. Upkeep keeps coming every night whether or not anyone pays you, so
// money can dip below zero between paydays. Stay in the red for a full game
// week and the game is over.
//
// State lives in two places: each room's `status` / `moveInAt` / `rentOwed`
// (so it disappears with the room if it's demolished), and the few totals
// below.

const MOVE_IN_DELAY_MINUTES = [60, 240]; // after placing: 1–4 game hours
const MOVE_IN_RETRY_MINUTES = [30, 90]; // unreachable: look again this soon
const MOVE_IN_HOURS = [8, 20]; // movers only turn up during the day
const BANKRUPTCY_GRACE_DAYS = 7;

const Economy = {
  lastTallyDay: Clock.day,
  lastPayday: null, // total rent paid at the most recent payday
  debtSince: null, // game minute money went negative, or null
  bankrupt: false,
  popups: [], // floating "Rent +$11,200" labels; see render.js

  onRoomAdded(room) {
    if (room.status === "vacant") {
      room.moveInAt = Clock.totalMinutes + randomBetween(MOVE_IN_DELAY_MINUTES);
    }
  },

  update() {
    const now = Clock.totalMinutes;

    for (const room of World.rooms) {
      if (room.status === "vacant" && now >= room.moveInAt) this.tryMoveIn(room);
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

  // The viewing is due. Movers only come in daytime, and only if they can
  // actually get to the room; otherwise the viewing is put off.
  tryMoveIn(room) {
    const [openHour, closeHour] = MOVE_IN_HOURS;
    if (Clock.hour < openHour || Clock.hour >= closeHour) {
      const day = Clock.day + (Clock.hour >= closeHour ? 1 : 0);
      room.moveInAt = day * MINUTES_PER_DAY + openHour * 60 + randomBetween([0, 120]);
      return;
    }
    if (!Routing.isReachable(room)) {
      room.moveInAt = Clock.totalMinutes + randomBetween(MOVE_IN_RETRY_MINUTES);
      return;
    }
    room.status = "movingIn";
    People.moveIn(room);
  },

  // Called by people.js when a mover reaches their new room.
  onArrived(room) {
    if (room.status !== "movingIn") return;
    room.status = "occupied";
    room.rentOwed = 0;
    const salePrice = ROOM_TYPES[room.type].salePrice;
    if (salePrice) {
      World.money += salePrice;
      this.popupOverRoom(room, `Sold +${World.formatMoney(salePrice)}`, "#7dffa0");
    }
  },

  // Midnight: settle the day that just ended (`lastTallyDay` is the day now
  // starting, so day 7, 14, ... means a week has just finished).
  tally() {
    for (const room of World.rooms) {
      const rentPerWeek = ROOM_TYPES[room.type].rentPerWeek;
      if (rentPerWeek && room.status === "occupied") room.rentOwed += rentPerWeek / 7;
    }

    for (const t of World.transit) {
      const upkeepPerDay = TRANSIT_TYPES[t.kind].upkeepPerDay;
      if (!upkeepPerDay) continue;
      World.money -= upkeepPerDay;
      this.popup(t.tileStart + TRANSIT_TYPES[t.kind].width / 2, t.floorBottom, `-${World.formatMoney(upkeepPerDay)}`, "#ff9d9d");
    }

    if (this.lastTallyDay % 7 === 0) this.payday();
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
    this.popup(room.tileStart + ROOM_TYPES[room.type].width / 2, room.floor, text, color);
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
