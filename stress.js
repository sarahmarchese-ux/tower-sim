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
//   - Noise, for residents only. Each studio with makers in gives off noise
//     (rooms.js: Woodwork 3, Pottery 2, Sewing 1, Jewellery 0) to the rooms
//     beside it and on the floors directly above and below. A resident at
//     home in a noisy condo gains stress every hour. Makers don't mind noise.
// What takes it away: resting, i.e. being at home in peace, or out of the
// building.
//
// Each week (at the Sunday-night tally), every room checks its people's
// average stress. If it's in the red, they move out (economy.js).

const STRESS_MAX = 100;
const STRESS_PINK = 35; // people turn pink from here...
const STRESS_RED = 65; // ...and red from here. A room averaging red moves out.
const COMFORTABLE_TRIP_MINUTES = 30;
const NO_ROUTE_STRESS = 10;
const NOISE_STRESS_PER_HOUR = 0.4; // per point of noise, while at home
const REST_PER_HOUR = 0.5;

const Stress = {
  _noiseVersion: -1,
  _noise: new Map(), // room id -> noise level reaching it

  // Total noise reaching a room from occupied studios around it. Cached
  // until the building changes (rooms added/removed, people moving in/out).
  noiseAt(room) {
    if (this._noiseVersion !== World.version) {
      this._noise = new Map();
      this._noiseVersion = World.version;
    }
    if (!this._noise.has(room.id)) {
      let level = 0;
      for (const studio of World.rooms) {
        const noise = ROOM_TYPES[studio.type].noise;
        if (studio === room || !noise || studio.status !== "occupied") continue;
        if (this.areNeighbours(studio, room)) level += noise;
      }
      this._noise.set(room.id, level);
    }
    return this._noise.get(room.id);
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
  update(minutes) {
    const hours = minutes / 60;
    for (const person of People.list) {
      if (person.movingIn || person.movingOut) continue;
      if (person.state === "inRoom" && person.role === "resident") {
        const noise = this.noiseAt(person.room);
        if (noise > 0) {
          this.add(person, noise * NOISE_STRESS_PER_HOUR * hours);
          continue;
        }
      }
      if (person.state === "inRoom" || person.state === "offsite") this.add(person, -REST_PER_HOUR * hours);
    }
  },

  onTripFinished(person, tripMinutes, stairsMinutes, waitMinutes) {
    const felt = tripMinutes + stairsMinutes + waitMinutes;
    this.add(person, Math.max(0, felt - COMFORTABLE_TRIP_MINUTES));
  },

  onNoRoute(person) {
    this.add(person, NO_ROUTE_STRESS);
  },

  add(person, amount) {
    person.stress = Math.min(STRESS_MAX, Math.max(0, person.stress + amount));
  },

  // The average stress of a room's settled tenants (null if none yet).
  roomAverage(room) {
    const people = People.list.filter((p) => p.room === room && !p.movingIn && !p.movingOut);
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
      if (room.status !== "occupied") continue;
      const average = this.roomAverage(room);
      if (average !== null && average >= STRESS_RED) Economy.moveOut(room);
    }
  },
};
