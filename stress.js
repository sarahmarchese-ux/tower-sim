// Stress: how fed up each person is, from 0 (content) to 100 (at the end
// of their tether). It's what makes layout matter.
//
// What adds stress:
//   - A long trip. Door-to-door time counts, with minutes spent climbing
//     stairs (tiring) and queueing for an elevator (annoying) counted
//     twice. Every minute of that over COMFORTABLE_TRIP_MINUTES adds a
//     point. So a lift to the 8th floor is fine, a few flights of stairs
//     are fine, but eight flights, or a 15-minute queue, are not.
//     Hotel guests, hauling a suitcase and paying by the night, are
//     fussier: anything over GUEST_COMFORTABLE_TRIP_MINUTES counts, and
//     counts double. Two flights of stairs are fine; five are not.
//   - Not being able to get there at all (no route, e.g. a demolished
//     elevator).
//   - Noise, for residents and hotel guests. A studio gives off noise while
//     its makers are at work in it (rooms.js: Woodwork 3, Pottery 2, Sewing
//     1, Jewellery 0) to the rooms beside it and on the floors directly
//     above and below. After hours and at weekends it's quiet. A resident
//     at home in a noisy condo gains stress every hour. Hotel guests, who
//     are in during the day and came to get away from it all, gain it 7½
//     times as fast: a woodwork studio next door can send them red in a
//     single working day. A café is noisy too, while it's serving lunch
//     on weekdays (cafes.js), and a restaurant every evening while it's
//     serving dinner (restaurants.js). Residents are home to unwind in the
//     evening, so from UNWIND_FROM_HOUR noise bothers them nearly four
//     times as much as by day. Makers and shopkeepers don't mind noise.
//   - A break-in (security.js): a jewellery studio's makers lose their
//     tools and stock.
// What takes it away: resting, i.e. being at home in peace, or out of the
// building.
//
// Each person also keeps a running total of the stress they've gained by
// cause over the last CAUSE_DAYS days (`stressCauses`: one entry per game
// day), so a room's tooltip can say what's getting to its people: "stress
// 96 (red): mostly elevator waits, then long trips". A trip's stress is
// shared between its causes by how much each added to how long it felt:
// time on the move beyond a comfortable trip (long trips), and the time
// spent on stairs and queueing (counted twice).
//
// Each week (at the Sunday-night tally), every room checks its people's
// average stress. If it's in the red, they move out (economy.js). Hotel
// rooms are judged stay by stay instead (hotels.js).

const STRESS_MAX = 100;
const STRESS_PINK = 35; // people turn pink from here...
const STRESS_RED = 65; // ...and red from here. A room averaging red moves out.
const COMFORTABLE_TRIP_MINUTES = 30;
const GUEST_COMFORTABLE_TRIP_MINUTES = 15;
const GUEST_TRIP_STRESS_PER_MINUTE = 1.5; // per minute over, for a hotel guest
const NO_ROUTE_STRESS = 10;
const NOISE_STRESS_PER_HOUR = 0.4; // per point of noise, while at home
const EVENING_NOISE_STRESS_PER_HOUR = 1.5; // the same, for a resident in the evening
const UNWIND_FROM_HOUR = 18;
const GUEST_NOISE_STRESS_PER_HOUR = 3; // the same, for a hotel guest in their room
const REST_PER_HOUR = 0.5;
const CAUSE_DAYS = 7;
// The causes of stress, as a room's tooltip names them.
const STRESS_CAUSES = {
  trips: "long trips",
  waits: "elevator waits",
  stairs: "stairs",
  dayNoise: "noise by day",
  eveningNoise: "noise in the evening",
  noRoute: "no route",
  breakIns: "break-ins",
};

const Stress = {
  _neighboursVersion: -1,
  _neighbours: new Map(), // room id -> the noisy studios next to it
  _working: new Set(), // rooms making noise right now; see refreshWorking()

  // The studios whose noise can reach a room. Cached until the building
  // changes (rooms added or removed).
  noisyNeighbours(room) {
    if (this._neighboursVersion !== World.version) {
      this._neighbours = new Map();
      this._neighboursVersion = World.version;
    }
    if (!this._neighbours.has(room.id)) {
      this._neighbours.set(
        room.id,
        World.rooms.filter((studio) => studio !== room && ROOM_TYPES[studio.type].noise > 0 && this.areNeighbours(studio, room)),
      );
    }
    return this._neighbours.get(room.id);
  },

  // Noise reaching a room right now (`when` "now"): from the studios next
  // to it that have a maker at work, and the cafés and restaurants serving.
  // "working" is what it would be with every occupied studio at work (and
  // café serving), i.e. on a weekday lunchtime; "evening" is what it would
  // be with every occupied restaurant serving dinner.
  noiseAt(room, when = "now") {
    let level = 0;
    for (const neighbour of this.noisyNeighbours(room)) {
      const evening = neighbour.type === "restaurant";
      const noisy = when === "now" ? this._working.has(neighbour)
        : neighbour.status === "occupied" && evening === (when === "evening");
      if (noisy) level += ROOM_TYPES[neighbour.type].noise;
    }
    return level;
  },

  // Beside each other on the same floor (touching), or on floors directly
  // above/below with at least one tile of overlap.
  areNeighbours(a, b) {
    const aEnd = a.tileStart + ROOM_TYPES[a.type].width - 1;
    const bEnd = b.tileStart + ROOM_TYPES[b.type].width - 1;
    if (a.floor === b.floor) return aEnd + 1 === b.tileStart || bEnd + 1 === a.tileStart;
    if (Math.abs(a.floor - b.floor) === 1) return a.tileStart <= bEnd && b.tileStart <= aEnd;
    return false;
  },

  // Noise and rest, for everyone who isn't mid-trip. Movers aren't settled
  // in yet (or are on their way out), so they're left alone.
  // Which rooms are making noise right now: studios with a maker at work
  // (not out at lunch), cafés serving lunch and restaurants serving dinner.
  refreshWorking() {
    this._working = new Set(
      People.list.filter((p) => p.role === "maker" && p.state === "inRoom").map((p) => p.room),
    );
    for (const room of World.rooms) {
      if (room.type === "cafe" && Cafes.isServingLunch(room)) this._working.add(room);
      if (room.type === "restaurant" && Restaurants.isServingDinner(room)) this._working.add(room);
    }
  },

  update(minutes) {
    const hours = minutes / 60;
    this.refreshWorking();
    for (const person of People.list) {
      if (person.movingIn || person.movingOut) continue;
      const hearsNoise = person.role === "resident" || person.role === "guest";
      if (person.state === "inRoom" && hearsNoise) {
        const noise = this.noiseAt(person.room);
        if (noise > 0) {
          const evening = Clock.hour >= UNWIND_FROM_HOUR;
          const perHour = person.role === "guest" ? GUEST_NOISE_STRESS_PER_HOUR
            : evening ? EVENING_NOISE_STRESS_PER_HOUR : NOISE_STRESS_PER_HOUR;
          this.add(person, noise * perHour * hours, evening ? "eveningNoise" : "dayNoise");
          continue;
        }
      }
      if (person.state === "inRoom" || person.state === "offsite" || person.state === "eating") this.add(person, -REST_PER_HOUR * hours);
    }
  },

  // Returns how long the trip felt, which is what a shopper's mood (and
  // so their spending) hangs on; see shops.js.
  onTripFinished(person, tripMinutes, stairsMinutes, waitMinutes) {
    const felt = tripMinutes + stairsMinutes + waitMinutes;
    const amount = person.role === "guest"
      ? Math.max(0, felt - GUEST_COMFORTABLE_TRIP_MINUTES) * GUEST_TRIP_STRESS_PER_MINUTE
      : Math.max(0, felt - COMFORTABLE_TRIP_MINUTES);
    if (amount > 0) {
      // Stairs and queueing count twice towards how long it felt; the rest
      // is time on the move. The comfortable allowance goes on time on the
      // move first, so "long trips" only takes a share when the journey
      // itself is longer than comfortable, not whenever a long queue pushes
      // a short hop over.
      const comfortable = person.role === "guest" ? GUEST_COMFORTABLE_TRIP_MINUTES : COMFORTABLE_TRIP_MINUTES;
      const moving = Math.max(0, tripMinutes - stairsMinutes - waitMinutes);
      const shares = { trips: Math.max(0, moving - comfortable), stairs: 2 * stairsMinutes, waits: 2 * waitMinutes };
      const total = shares.trips + shares.stairs + shares.waits;
      for (const cause in shares) {
        if (shares[cause] > 0) this.add(person, (amount * shares[cause]) / total, cause);
      }
    }
    return felt;
  },

  onNoRoute(person) {
    this.add(person, NO_ROUTE_STRESS, "noRoute");
  },

  // Rest is a negative amount, with no cause.
  add(person, amount, cause) {
    person.stress = Math.min(STRESS_MAX, Math.max(0, person.stress + amount));
    if (cause && amount > 0) this.noteCause(person, cause, amount);
  },

  // Add to today's entry in this person's stress-by-cause log, dropping
  // days older than CAUSE_DAYS.
  noteCause(person, cause, amount) {
    const day = Clock.day;
    const log = person.stressCauses || (person.stressCauses = []);
    let today = log[log.length - 1];
    if (!today || today.day !== day) {
      today = { day };
      log.push(today);
      while (log.length && log[0].day <= day - CAUSE_DAYS) log.shift();
    }
    today[cause] = (today[cause] || 0) + amount;
  },

  // What's stressed these people over the last week, biggest cause first:
  // [{ cause, amount }].
  causesFor(people) {
    const totals = {};
    for (const person of people) {
      for (const entry of person.stressCauses || []) {
        if (entry.day <= Clock.day - CAUSE_DAYS) continue;
        for (const cause in STRESS_CAUSES) {
          if (entry[cause]) totals[cause] = (totals[cause] || 0) + entry[cause];
        }
      }
    }
    return Object.entries(totals)
      .map(([cause, amount]) => ({ cause, amount }))
      .sort((a, b) => b.amount - a.amount);
  },

  // "mostly elevator waits, then long trips" for a room's stressed people;
  // null if nothing has stressed them this week. A second cause is only
  // named if it's a real part of it.
  causeSummary(room) {
    const causes = this.causesFor(this.roomPeople(room));
    if (!causes.length) return null;
    const total = causes.reduce((sum, c) => sum + c.amount, 0);
    let text = `mostly ${STRESS_CAUSES[causes[0].cause]}`;
    if (causes[1] && causes[1].amount >= total * 0.15) text += `, then ${STRESS_CAUSES[causes[1].cause]}`;
    return text;
  },

  // The average stress of a room's settled tenants, or of the guests
  // staying in a hotel room (null if none yet). Shoppers are only passing
  // through, so they don't count.
  roomAverage(room) {
    const people = this.roomPeople(room);
    if (!people.length) return null;
    return people.reduce((sum, p) => sum + p.stress, 0) / people.length;
  },

  roomPeople(room) {
    return People.list.filter((p) => p.room === room && !p.movingIn && !p.movingOut && p.role !== "shopper");
  },

  // "stress 96 (red): mostly elevator waits, then long trips", for a
  // room's tooltip. The cause is named once its people are pink or red.
  roomReadout(room) {
    const average = this.roomAverage(room);
    if (average === null) return null;
    const band = this.band(average);
    const readout = `stress ${Math.round(average)} (${band})`;
    const why = band === "calm" ? null : this.causeSummary(room);
    return why ? `${readout}: ${why}` : readout;
  },

  // "calm" / "pink" / "red", for colours and the hover readout.
  band(stress) {
    if (stress >= STRESS_RED) return "red";
    if (stress >= STRESS_PINK) return "pink";
    return "calm";
  },

  // Once a week: rooms whose people are in the red move out.
  weeklyReview() {
    for (const room of [...World.rooms]) {
      if (room.status !== "occupied" || isHotel(room)) continue;
      const average = this.roomAverage(room);
      if (average !== null && average >= STRESS_RED) Economy.moveOut(room);
    }
  },
};
