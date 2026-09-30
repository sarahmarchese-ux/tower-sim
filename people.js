// Everyone who lives or works in the tower.
//
// Nobody is born inside a room. When a room's new tenants arrive (see
// economy.js), they appear at a lobby as movers and walk in; once there,
// they settle into their daily rhythm. A person's `movingIn` flag is true
// until they've reached their room for the first time. Moving out is the
// reverse: `movingOut` people head for the lobby and are gone once they
// reach it.
//
// Every person carries a `stress` value (see stress.js), shown as their
// colour. Each trip's length and elevator wait feed into it.
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
// `tripWaitMinutes` and `tripStairsMinutes` add up time spent queueing and
// climbing on the current trip, and `tripStartedAt` is when they set off;
// on arrival all three go to stress.js.

const WALK_TILES_PER_MINUTE = 3;
const STAIRS_MINUTES_PER_FLOOR = 2;
const RETRY_MINUTES = 30; // how long to wait before trying again if there's no route
const MOVER_GAP_MINUTES = [3, 8]; // movers arrive a few minutes apart
const UNPACK_MINUTES = [20, 40]; // a new arrival stays put this long

const People = {
  list: [],
  nextId: 1,

  // A room's tenants arrive: they start out of the building and head in
  // one after another, from the lobby.
  moveIn(room) {
    const type = ROOM_TYPES[room.type];
    let showUpAt = Clock.totalMinutes;
    for (let slot = 0; slot < type.tenants; slot++) {
      // Everyone gets their own times, so the morning rush is a stream of
      // people rather than a whole building teleporting at 8:00 sharp.
      const person = {
        id: this.nextId++,
        role: type.role,
        room,
        slot,
        state: "offsite",
        movingIn: true,
        movingOut: false,
        stress: 0,
        floor: room.floor,
        x: this.slotX(room, slot),
        route: null,
        legIndex: 0,
        legProgress: 0,
        target: null,
        idleUntil: showUpAt,
        tripStartedAt: 0,
        tripWaitMinutes: 0,
        tripStairsMinutes: 0,
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
      showUpAt += randomBetween(MOVER_GAP_MINUTES);
    }
  },

  removeForRoom(room) {
    for (const person of this.list.filter((p) => p.room === room)) Elevators.forget(person);
    this.list = this.list.filter((p) => p.room !== room);
  },

  // A room's tenants are leaving for good. Anyone already out of the
  // building is simply gone; everyone else heads for the lobby (after a
  // few minutes to pack) and is gone when they get there.
  moveOut(room) {
    for (const person of this.list.filter((p) => p.room === room)) {
      person.movingOut = true;
      if (person.state === "offsite") this.remove(person);
      else if (person.state === "inRoom") person.idleUntil = Clock.totalMinutes + randomBetween(MOVER_GAP_MINUTES);
    }
  },

  remove(person) {
    Elevators.forget(person);
    this.list = this.list.filter((p) => p !== person);
  },

  // Where each tenant stands inside their room, spread evenly across it.
  slotX(room, slot) {
    const type = ROOM_TYPES[room.type];
    return room.tileStart + ((slot + 1) * type.width) / (type.tenants + 1);
  },

  // The one question: where should this person be at game time `t`?
  desiredLocation(person, t) {
    if (person.movingOut) return "offsite";
    if (person.movingIn) return "room";
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
      // tries again in a little while in case the player fixes it. Being
      // stuck is stressful. Someone moving out finds their own way out.
      if (person.movingOut) {
        this.remove(person);
        return;
      }
      if (from) person.state = "offsite";
      if (!person.movingIn) Stress.onNoRoute(person);
      person.route = null;
      person.idleUntil = Clock.totalMinutes + RETRY_MINUTES;
      return;
    }

    // A re-route (`from`) is the same trip carrying on, so the clock keeps
    // running from when they first set off.
    if (!from) person.tripStartedAt = Clock.totalMinutes;
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
        person.tripStairsMinutes += used;
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
    if (!person.movingIn && !person.movingOut) {
      const tripMinutes = Clock.totalMinutes - person.tripStartedAt;
      Stress.onTripFinished(person, tripMinutes, person.tripStairsMinutes, person.tripWaitMinutes);
    }
    person.tripWaitMinutes = 0;
    person.tripStairsMinutes = 0;
    if (person.movingOut && person.target === "offsite") {
      this.remove(person);
      return;
    }
    if (person.target === "room") {
      person.floor = person.room.floor;
      person.x = this.slotX(person.room, person.slot);
      if (person.movingIn) {
        person.movingIn = false;
        person.idleUntil = Clock.totalMinutes + randomBetween(UNPACK_MINUTES);
        Economy.onArrived(person.room);
      }
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
  // them steps off where they are and works out a new way.
  onTransitRemoved(transit) {
    for (const person of this.list) {
      if (!person.route) continue;
      const usesIt = person.route.legs
        .slice(person.legIndex)
        .some((leg) => leg.transitId === transit.id);
      if (usesIt) this.reroute(person, transit);
    }
  },

  // Floor was demolished. Anyone whose way ahead now crosses a gap (or
  // who's standing on one) works out a new way.
  onFloorsChanged() {
    for (const person of this.list) {
      if (person.route && !this.routeStillWalkable(person)) this.reroute(person);
    }
  },

  // Does every walk left on this person's route, from where they are now,
  // still run along built floor?
  routeStillWalkable(person) {
    let x = person.x;
    for (let i = person.legIndex; i < person.route.legs.length; i++) {
      const leg = person.route.legs[i];
      if (leg.type === "walk") {
        if (!Routing.canWalk(leg.floor, x, leg.toX)) return false;
        x = leg.toX;
      } else {
        const transit = World.transit.find((t) => t.id === leg.transitId);
        if (!transit) return false;
        x = Routing.stopX(transit, leg.toFloor);
        if (Routing.segmentOf(leg.toFloor, x) === undefined) return false;
      }
    }
    return true;
  },

  // Plan a new way to the same place from where this person is now: the
  // nearest whole floor if mid-ride or mid-climb, and the shaft's own door
  // if they were in (or queueing for) an elevator, since the queue can
  // stretch past the built floor. They leave any car or queue they were in:
  // the new route starts from scratch. `removed` is the transit just
  // demolished, if that's why, since it's no longer in World.transit.
  reroute(person, removed) {
    const floor = Math.round(person.floor);
    let x = person.x;
    if (person.state === "waitingForElevator" || person.state === "riding") {
      const leg = person.route.legs[person.legIndex];
      const transit = removed && removed.id === leg.transitId ? removed : World.transit.find((t) => t.id === leg.transitId);
      if (transit) x = Routing.stopX(transit, floor);
    }
    Elevators.forget(person);
    this.startTrip(person, person.target, { floor, x });
  },

  // Everyone who lives or works here: not movers still on their way in,
  // nor those on their way out.
  population() {
    return this.list.filter((p) => !p.movingIn && !p.movingOut).length;
  },
};

World.subscribe((event, payload) => {
  if (event === "roomRemoved") People.removeForRoom(payload);
  if (event === "transitRemoved") People.onTransitRemoved(payload);
  if (event === "floorsChanged") People.onFloorsChanged();
});
