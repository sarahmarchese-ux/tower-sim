// Stress: how fed up each person is, from 0 (content) to 100 (at the end
// of their tether). It's what makes layout matter.
//
// What adds stress:
//   - A long trip. Door-to-door time counts, with minutes spent climbing
//     stairs (tiring) and queueing for an elevator (annoying) counted
//     twice. Every minute of that over COMFORTABLE_TRIP_MINUTES adds a
//     point. So a lift to the 8th floor is fine, a few flights of stairs
//     are fine, but eight flights, or a 15-minute queue, are not.
//   - Not being able to get there at all (no route, e.g. a demolished
//     elevator).
//   - Noise, for residents and hotel guests. A studio gives off noise while
//     its makers are at work in it (rooms.js: Woodwork 3, Pottery 2, Sewing
//     1, Jewellery 0) to the rooms beside it and on the floors directly
//     above and below. After hours and at weekends it's quiet. A resident
//     at home in a noisy condo gains stress every hour. Hotel guests, who
//     are in during the day and came to get away from it all, gain it five
//     times as fast: a woodwork studio next door sends them red within a
//     couple of weekdays. Makers and shopkeepers don't mind noise.
// What takes it away: resting, i.e. being at home in peace, or out of the
// building.
//
// Each week (at the Sunday-night tally), every room checks its people's
// average stress. If it's in the red, they move out (economy.js). Hotel
// rooms are judged stay by stay instead (hotels.js).

const STRESS_MAX = 100;
const STRESS_PINK = 35; // people turn pink from here...
const STRESS_RED = 65; // ...and red from here. A room averaging red moves out.
const COMFORTABLE_TRIP_MINUTES = 30;
const NO_ROUTE_STRESS = 10;
const NOISE_STRESS_PER_HOUR = 0.4; // per point of noise, while at home
const GUEST_NOISE_STRESS_PER_HOUR = 3; // the same, for a hotel guest in their room
const REST_PER_HOUR = 0.5;

const Stress = {
  _neighboursVersion: -1,
  _neighbours: new Map(), // room id -> the noisy studios next to it
  _working: new Set(), // studios with a maker at work right now; see update()

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

  // Noise reaching a room right now: from the studios next to it that have
  // a maker at work. With `whenWorking`, what it would be with every
  // occupied studio at work, i.e. on a weekday afternoon.
  noiseAt(room, whenWorking = false) {
    let level = 0;
    for (const studio of this.noisyNeighbours(room)) {
      const noisy = whenWorking ? studio.status === "occupied" : this._working.has(studio);
      if (noisy) level += ROOM_TYPES[studio.type].noise;
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
  // Which studios have a maker at work right now.
  refreshWorking() {
    this._working = new Set(
      People.list.filter((p) => p.role === "maker" && p.state === "inRoom").map((p) => p.room),
    );
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
          const perHour = person.role === "guest" ? GUEST_NOISE_STRESS_PER_HOUR : NOISE_STRESS_PER_HOUR;
          this.add(person, noise * perHour * hours);
          continue;
        }
      }
      if (person.state === "inRoom" || person.state === "offsite") this.add(person, -REST_PER_HOUR * hours);
    }
  },

  // Returns how long the trip felt, which is what a shopper's mood (and
  // so their spending) hangs on; see shops.js.
  onTripFinished(person, tripMinutes, stairsMinutes, waitMinutes) {
    const felt = tripMinutes + stairsMinutes + waitMinutes;
    this.add(person, Math.max(0, felt - COMFORTABLE_TRIP_MINUTES));
    return felt;
  },

  onNoRoute(person) {
    this.add(person, NO_ROUTE_STRESS);
  },

  add(person, amount) {
    person.stress = Math.min(STRESS_MAX, Math.max(0, person.stress + amount));
  },

  // The average stress of a room's settled tenants, or of the guests
  // staying in a hotel room (null if none yet). Shoppers are only passing
  // through, so they don't count.
  roomAverage(room) {
    const people = People.list.filter((p) => p.room === room && !p.movingIn && !p.movingOut && p.role !== "shopper");
    if (!people.length) return null;
    return people.reduce((sum, p) => sum + p.stress, 0) / people.length;
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
      if (room.status !== "occupied" || room.type === "hotel") continue;
      const average = this.roomAverage(room);
      if (average !== null && average >= STRESS_RED) Economy.moveOut(room);
    }
  },
};
