// Everyone who lives or works in the tower.
//
// Each person belongs to one room and follows a simple daily rhythm:
//   - Makers come to their studio on weekdays and go home in the evening.
//   - Residents leave their condo on weekday mornings and come back in the
//     evening; on weekends about half of them go out around midday.
//
// Instead of a timetable of "at 9:00 do X", each person just asks, whenever
// they're standing still: "given the time right now, where should I be — in
// my room, or out of the building?" If the answer differs from where they
// are, they set off. That one question handles everything: a studio placed
// at 2pm, a maker who got stuck in a queue past quitting time, a weekend.
//
// While travelling, a person works through the legs of their route (see
// routing.js) one at a time. States:
//   offsite            — out of the building, not drawn
//   inRoom             — in their studio or condo
//   walking            — walking along a floor
//   onStairs           — climbing or descending one flight
//   waitingForElevator — queueing at a shaft (elevators.js takes over)
//   riding             — inside an elevator car
//
// `tripWaitMinutes` adds up time spent queueing on the current trip, and is
// kept as `lastTripWaitMinutes` when they arrive. Nothing uses it yet —
// milestone 6 will turn long waits into stress.

const WALK_TILES_PER_MINUTE = 3;
const STAIRS_MINUTES_PER_FLOOR = 2;
const RETRY_MINUTES = 30; // how long to wait before trying again if there's no route

const People = {
  list: [],
  nextId: 1,

  spawnForRoom(room) {
    const type = ROOM_TYPES[room.type];
    for (let slot = 0; slot < type.tenants; slot++) {
      // Everyone gets their own times, so the morning rush is a stream of
      // people rather than a whole building teleporting at 8:00 sharp.
      const person = {
        id: this.nextId++,
        role: type.role,
        room,
        slot,
        state: type.role === "maker" ? "offsite" : "inRoom",
        floor: room.floor,
        x: this.slotX(room, slot),
        route: null,
        legIndex: 0,
        legProgress: 0,
        target: null,
        idleUntil: Clock.totalMinutes + Math.random() * 30,
        tripWaitMinutes: 0,
        lastTripWaitMinutes: 0,
        // Minutes after midnight.
        arriveAt: 8 * 60 + Math.random() * 90, // makers: 8:00–9:30
        leaveAt: type.role === "maker"
          ? 16.5 * 60 + Math.random() * 90 // makers: 16:30–18:00
          : 7.5 * 60 + Math.random() * 90, // residents: 7:30–9:00
        returnAt: 17.5 * 60 + Math.random() * 90, // residents: 17:30–19:00
        weekendOuting: Math.random() < 0.5,
        outingStart: 11 * 60 + Math.random() * 120,
        outingEnd: 15 * 60 + Math.random() * 180,
      };
      this.list.push(person);
    }
  },

  removeForRoom(room) {
    for (const person of this.list.filter((p) => p.room === room)) Elevators.forget(person);
    this.list = this.list.filter((p) => p.room !== room);
  },

  // Where each tenant stands inside their room, spread evenly across it.
  slotX(room, slot) {
    const type = ROOM_TYPES[room.type];
    return room.tileStart + ((slot + 1) * type.width) / (type.tenants + 1);
  },

  // The one question: where should this person be at game time `t`?
  desiredLocation(person, t) {
    const day = Math.floor(t / MINUTES_PER_DAY);
    const minute = t - day * MINUTES_PER_DAY;
    const weekend = day % 7 >= 5;
    if (person.role === "maker") {
      return !weekend && minute >= person.arriveAt && minute < person.leaveAt ? "room" : "offsite";
    }
    if (!weekend) {
      return minute >= person.leaveAt && minute < person.returnAt ? "offsite" : "room";
    }
    return person.weekendOuting && minute >= person.outingStart && minute < person.outingEnd ? "offsite" : "room";
  },

  update(minutes) {
    const now = Clock.totalMinutes;
    for (const person of this.list) {
      if (person.state === "inRoom" || person.state === "offsite") {
        if (now < person.idleUntil) continue;
        const here = person.state === "inRoom" ? "room" : "offsite";
        const want = this.desiredLocation(person, now);
        if (want !== here) this.startTrip(person, want);
      } else {
        this.advanceTrip(person, minutes);
      }
    }
  },

  // Plan a route and set off. Coming in, you appear at a lobby; going out,
  // you head for one and vanish when you reach it.
  startTrip(person, target, from) {
    const home = { floor: person.room.floor, x: this.slotX(person.room, person.slot) };
    const starts = from ? [from] : target === "room" ? Routing.lobbyPoints() : [home];
    const goals = target === "room" ? [home] : Routing.lobbyPoints();
    const route = starts.length && goals.length ? Routing.plan(starts, goals) : null;

    if (!route) {
      // No way through (no lobby, a missing elevator, a gap in the floor...).
      // Anyone already inside the building gives up and leaves; everyone
      // tries again in a little while in case the player fixes it.
      if (from) person.state = "offsite";
      person.route = null;
      person.idleUntil = Clock.totalMinutes + RETRY_MINUTES;
      return;
    }

    person.route = route;
    person.target = target;
    person.legIndex = 0;
    person.legProgress = 0;
    person.floor = route.start.floor;
    person.x = route.start.x;
    person.state = "walking";
  },

  // Work through the route's legs, spending up to `minutes` of game time.
  advanceTrip(person, minutes) {
    let remaining = minutes;
    while (remaining > 1e-9) {
      const leg = person.route.legs[person.legIndex];
      if (!leg) {
        this.finishTrip(person);
        return;
      }

      if (leg.type === "walk") {
        person.state = "walking";
        const distance = Math.abs(leg.toX - person.x);
        const reach = WALK_TILES_PER_MINUTE * remaining;
        if (reach >= distance) {
          person.x = leg.toX;
          remaining -= distance / WALK_TILES_PER_MINUTE;
          person.legIndex++;
        } else {
          person.x += Math.sign(leg.toX - person.x) * reach;
          remaining = 0;
        }
      } else if (leg.type === "stairs") {
        const transit = World.transit.find((t) => t.id === leg.transitId);
        person.state = "onStairs";
        const total = STAIRS_MINUTES_PER_FLOOR * Math.abs(leg.toFloor - leg.fromFloor);
        const used = Math.min(remaining, (1 - person.legProgress) * total);
        person.legProgress += used / total;
        remaining -= used;
        // Move diagonally between the stairs' two stops as you climb.
        const fromX = Routing.stopX(transit, leg.fromFloor);
        const toX = Routing.stopX(transit, leg.toFloor);
        person.floor = leg.fromFloor + (leg.toFloor - leg.fromFloor) * person.legProgress;
        person.x = fromX + (toX - fromX) * person.legProgress;
        if (person.legProgress >= 1 - 1e-9) {
          person.floor = leg.toFloor;
          person.x = toX;
          person.legProgress = 0;
          person.legIndex++;
        }
      } else {
        // Elevator: press the button once, then wait. elevators.js moves us
        // from here, and calls onBoard / onElevatorArrive at the right times.
        if (person.state === "waitingForElevator" || person.state === "riding") {
          if (person.state === "waitingForElevator") person.tripWaitMinutes += remaining;
          return;
        }
        person.state = "waitingForElevator";
        Elevators.call(person, leg);
      }
    }
  },

  finishTrip(person) {
    person.state = person.target === "room" ? "inRoom" : "offsite";
    person.route = null;
    person.lastTripWaitMinutes = person.tripWaitMinutes;
    person.tripWaitMinutes = 0;
    if (person.target === "room") {
      person.floor = person.room.floor;
      person.x = this.slotX(person.room, person.slot);
    }
  },

  onBoard(person) {
    person.state = "riding";
  },

  onElevatorArrive(person, floor) {
    const leg = person.route.legs[person.legIndex];
    const transit = World.transit.find((t) => t.id === leg.transitId);
    person.floor = floor;
    person.x = Routing.stopX(transit, floor);
    person.legIndex++;
    person.state = "walking";
  },

  // Stairs or an elevator were demolished. Anyone whose remaining route used
  // them steps off where they are (rounded to the nearest floor, if they
  // were mid-ride or mid-climb) and works out a new way.
  onTransitRemoved(transit) {
    for (const person of this.list) {
      if (!person.route) continue;
      const usesIt = person.route.legs
        .slice(person.legIndex)
        .some((leg) => leg.transitId === transit.id);
      if (!usesIt) continue;
      const from = { floor: Math.round(person.floor), x: person.x };
      this.startTrip(person, person.target, from);
    }
  },

  population() {
    return this.list.length;
  },
};

World.subscribe((event, payload) => {
  if (event === "roomAdded") People.spawnForRoom(payload);
  if (event === "roomRemoved") People.removeForRoom(payload);
  if (event === "transitRemoved") People.onTransitRemoved(payload);
});
