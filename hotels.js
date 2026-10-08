// Hotel rooms (milestone 9): where visiting buyers and tourists stay for a
// night or a few, and the first rooms that earn by the night.
//
// A hotel room has no tenants. Instead, each afternoon an empty room may
// get a booking: a party turns up at a lobby some time between
// CHECK_IN_HOURS and walks up to it. Rooms come in two sizes (rooms.js). A
// Single takes a buyer on their own, who mostly comes in the week. A Twin
// takes a pair of tourists, who mostly come on Fridays and Saturdays; on a
// night no tourists book it, it takes a lone buyer if every Single in the
// tower is taken, at the Single rate. So a tower needs both sizes to stay
// full all week. A party stays 1 to 3 nights, and checks
// out between 8 and 11 in the morning. While they're staying, the room
// earns its nightly rate at every midnight tally (economy.js).
//
// Guests spend their days in the room, apart from the odd outing (tourists
// go sightseeing more often than buyers do). So, unlike condo residents,
// who are mostly out while makers work, guests are in when the studios
// next door are noisy, and noise bothers them a lot more (stress.js). A
// long trip up from the lobby stresses them too. A guest who goes red
// checks out early, and that night earns nothing.
//
// Every stay ends with a review. A stay that stayed calm is a good review;
// one that got pink, a mixed one; red, a bad one. Each room keeps a
// reputation from its reviews (`room.reputation`, 0 to 1), and a room with
// a bad name gets fewer bookings, down to a quarter as many. So a room
// beside a woodwork studio, or up eight flights of stairs, sits empty more
// often: occupancy is how layout shows up in a hotel's takings. Weekend
// stays are quiet whatever the layout, since the studios are shut.
//
// Once its guests have gone, a room needs cleaning (`needsCleaning`), and
// nobody can book it until a housekeeper has been (milestone 12,
// housekeeping.js). Rooms in a save from before then load clean.
//
// Guests robbed in a night-time break-in (security.js) give the stay the
// worst review, however calm they were otherwise (`robbed`).
//
// Room state lives on the room: `status` is "vacant", "checkingIn" (a
// party is on its way up) or "occupied" (they've arrived), and the party's
// details (`party`, `nights`, `checkInDay`, `checkoutAt`) sit beside it.
// `nightHistory` remembers which of the last week's nights were booked.

const CHECK_IN_HOURS = [14, 21]; // parties arrive at the lobby 2pm–9pm
const CHECK_OUT_HOURS = [8, 11];
// The chance an empty room that suits them gets booked, by the day the
// party arrives (Mon ... Sun): buyers come in the week, tourists at weekends.
const BOOKING_CHANCE = {
  buyer: [0.6, 0.6, 0.6, 0.6, 0.35, 0.25, 0.4],
  tourists: [0.1, 0.1, 0.1, 0.2, 0.9, 0.9, 0.3],
};
const OUTING_CHANCE = { tourists: 0.6, buyer: 0.3 }; // per full day of a stay
const OUTING_START_HOURS = [10, 13];
const OUTING_LENGTH_HOURS = [2, 5];
const UNBOTHERED_STRESS = 15; // a stay that never got more stressful than this: a perfect review
const REVIEW_WEIGHT = 0.4; // how much one stay's review moves the room's reputation
const MIN_BOOKING_REPUTATION = 0.25; // even a room with a bad name gets some guests
const NIGHTS_REMEMBERED = 7;

const Hotels = {
  update() {
    const now = Clock.totalMinutes;
    const guestsByRoom = new Map();
    for (const person of People.list) {
      if (person.role !== "guest" || person.movingOut) continue;
      if (!guestsByRoom.has(person.room)) guestsByRoom.set(person.room, []);
      guestsByRoom.get(person.room).push(person);
    }

    // Singles first, so a buyer only ends up in a Twin when every Single
    // is taken.
    const rooms = World.rooms.filter(isHotel).sort((a, b) => ROOM_TYPES[a.type].tenants - ROOM_TYPES[b.type].tenants);
    for (const room of rooms) {
      if (room.status === "vacant") {
        this.updateBooking(room, now);
        continue;
      }
      const guests = guestsByRoom.get(room) || [];
      for (const guest of guests) guest.peakStress = Math.max(guest.peakStress, guest.stress);
      if (!guests.length) {
        // Everyone's gone (e.g. couldn't find a way out and left): the room
        // is free again.
        this.endStay(room, guests, null);
      } else if (now >= room.checkoutAt) {
        this.endStay(room, guests, "Checked out");
      } else if (guests.some((g) => Stress.band(g.stress) === "red")) {
        const why = Stress.noiseAt(room) > 0 ? "too noisy" : "too far to get to";
        this.endStay(room, guests, `Checked out early: ${why}`);
      }
    }
  },

  // An empty room: once a day, in check-in hours, see whether anyone
  // books it for tonight, and if so when they'll turn up at the lobby.
  updateBooking(room, now) {
    const hour = Clock.hour;
    if (room.nextGuestsAt == null) {
      // A room waiting for Housekeeping can't be booked yet. (Once it's
      // clean, it still gets today's chance if there's time to arrive.)
      if (room.needsCleaning) return;
      if (hour < CHECK_IN_HOURS[0] || hour >= CHECK_IN_HOURS[1] || room.bookingDay === Clock.day) return;
      room.bookingDay = Clock.day;
      const party = this.whoBooks(room);
      if (party) {
        room.nextParty = party;
        const lastArrival = Clock.day * MINUTES_PER_DAY + CHECK_IN_HOURS[1] * 60;
        room.nextGuestsAt = randomBetween([now, lastArrival]);
      }
    } else if (now >= room.nextGuestsAt) {
      room.nextGuestsAt = null;
      // Nobody books a room they can't get to (the red "!").
      if (Routing.isReachable(room)) this.checkIn(room, room.nextParty || "buyer");
    }
  },

  // Who (if anyone) books this room tonight: "buyer", "tourists" or null.
  // Each kind of party the room takes gets a chance, in the order rooms.js
  // lists them; a Twin only gets a buyer when there's no Single free.
  whoBooks(room) {
    const goodName = Math.max(MIN_BOOKING_REPUTATION, this.reputation(room));
    for (const party of ROOM_TYPES[room.type].parties) {
      if (party === "buyer" && room.type !== "single" && this.singleFree()) continue;
      if (Math.random() < BOOKING_CHANCE[party][Clock.day % 7] * goodName) return party;
    }
    return null;
  },

  // Is there a Single nobody has booked tonight, that a buyer could get to?
  singleFree() {
    return World.rooms.some(
      (room) => room.type === "single" && room.status === "vacant" && !room.needsCleaning && room.nextGuestsAt == null && Routing.isReachable(room),
    );
  },

  // What a party pays a night: a buyer pays the Single rate, whichever
  // room they're in.
  rateFor(room) {
    return room.party === "buyer" ? ROOM_TYPES.single.ratePerNight : ROOM_TYPES[room.type].ratePerNight;
  },

  // A new room starts with a good name.
  reputation(room) {
    return room.reputation ?? 1;
  },

  // A party turns up at the lobby and heads for the room.
  checkIn(room, party) {
    const weekday = Clock.day % 7;
    const weekendArrival = weekday === 4 || weekday === 5; // Friday or Saturday
    const tourists = party === "tourists";
    room.nextParty = null;
    const nights = 1 + Math.floor(Math.random() * (weekendArrival ? 2 : 3));
    room.party = tourists ? "tourists" : "buyer";
    room.nights = nights;
    room.checkInDay = Clock.day;
    room.checkoutAt = (Clock.day + nights) * MINUTES_PER_DAY + randomBetween(CHECK_OUT_HOURS.map((h) => h * 60));
    World.setRoomStatus(room, "checkingIn");

    const size = tourists ? 2 : 1;
    let showUpAt = Clock.totalMinutes;
    for (let slot = 0; slot < size; slot++) {
      People.addGuest(room, slot, showUpAt, this.planOutings(room));
      showUpAt += randomBetween([0, 3]); // a pair arrives (nearly) together
    }
  },

  // Each guest's own outings: on the full days of the stay (not the day
  // they arrive or the day they leave), maybe a few hours out around midday.
  // Keyed by game day.
  planOutings(room) {
    const outings = {};
    for (let day = room.checkInDay + 1; day < room.checkInDay + room.nights; day++) {
      if (Math.random() >= OUTING_CHANCE[room.party]) continue;
      const start = day * MINUTES_PER_DAY + randomBetween(OUTING_START_HOURS.map((h) => h * 60));
      outings[day] = [start, start + randomBetween(OUTING_LENGTH_HOURS.map((h) => h * 60))];
    }
    return outings;
  },

  // Called by people.js when a guest reaches the room (on arrival, or
  // back from an outing).
  onGuestArrived(person) {
    // Someone from a party that has already checked out, still finishing
    // their trip up, mustn't check in the next party for them.
    if (person.movingOut) return;
    person.arrived = true;
    if (person.room.status === "checkingIn") World.setRoomStatus(person.room, "occupied");
  },

  // The stay is over: the guests pack and head for the lobby, the stay is
  // reviewed, and the room is free for the next booking. `reason` is the
  // popup over the room (null: say nothing).
  endStay(room, guests, reason) {
    if (guests.length) {
      const peak = Math.max(...guests.map((g) => g.peakStress));
      const review = room.robbed ? 0 : this.reviewFor(peak);
      room.reputation = this.reputation(room) * (1 - REVIEW_WEIGHT) + review * REVIEW_WEIGHT;
    }
    // Guests who got as far as the room leave it needing a clean.
    if (room.status === "occupied") room.needsCleaning = true;
    room.robbed = false;
    People.moveOut(room);
    World.setRoomStatus(room, "vacant");
    room.party = null;
    room.checkoutAt = null;
    if (reason) Economy.popupOverRoom(room, reason, reason === "Checked out" ? "#d0d0d0" : "#ff9d9d");
  },

  // How a stay went, from the most stressed its guests got: 1 if they
  // hardly noticed anything, falling to 0 at red.
  reviewFor(peakStress) {
    return Math.min(1, Math.max(0, (STRESS_RED - peakStress) / (STRESS_RED - UNBOTHERED_STRESS)));
  },

  // "good" / "mixed" / "poor", for the hover readout (null before the
  // first review).
  reviewsLabel(room) {
    if (room.reputation === undefined) return null;
    if (room.reputation >= 0.75) return "good";
    if (room.reputation >= 0.45) return "mixed";
    return "poor";
  },

  // Called by economy.js at midnight: every room someone is sleeping in
  // earns its night. Returns the total.
  nightlyTally() {
    let total = 0;
    for (const room of World.rooms) {
      if (!isHotel(room)) continue;
      const booked = room.status === "occupied";
      room.nightHistory = [...(room.nightHistory || []), booked].slice(-NIGHTS_REMEMBERED);
      if (!booked) continue;
      const rate = this.rateFor(room);
      total += rate;
      Economy.popupOverRoom(room, `Night +${World.formatMoney(rate)}`, "#7dffa0");
    }
    return total;
  },

  // What tonight's guests will pay at midnight, for the top bar. A party
  // checking out this morning has had its last night.
  tonight() {
    const staying = World.rooms.filter(
      (room) => isHotel(room) && room.status === "occupied" && Clock.day < room.checkInDay + room.nights,
    );
    return staying.reduce((sum, room) => sum + this.rateFor(room), 0);
  },

  // "2 tourists, night 2 of 3", for the hover readout.
  describeStay(room) {
    let who = room.party === "tourists" ? "2 tourists" : "a buyer";
    if (room.party === "buyer" && room.type === "twin") who += " (at the Single rate)";
    const night = Clock.day - room.checkInDay + 1;
    if (night > room.nights) return `${who}, checking out this morning`;
    return `${who}, night ${night} of ${room.nights}`;
  },
};
