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
//     Around midday they take a lunch break (milestone 10): at a café in
//     the tower if one's open and close enough (cafes.js), or out of the
//     building if not, which makes for a lunchtime rush on the elevators.
//   - Residents leave their condo on weekday mornings and come back in the
//     evening; on weekends about half of them go out around midday. Some
//     evenings they go to a restaurant in the tower for dinner (milestone
//     11, restaurants.js); otherwise they eat at home.
//   - Shopkeepers open their shop every day, weekends too, from about 9:30
//     in the morning to about 8:30 at night. A café's keeper keeps café
//     hours instead, about 8am to 4pm, and a restaurant's about 5pm to
//     11pm (rooms.js: `keeperHours`).
//   - Shoppers (milestone 8) are visitors, not tenants. shops.js sends them
//     in from the lobby while a shop is open; each one walks to the shop,
//     browses, buys (or doesn't; see shops.js) and leaves for good.
//   - Hotel guests (milestone 9) are visitors too. hotels.js checks a
//     party in at a lobby; they stay in their room for a night or a few,
//     apart from the odd daytime outing (and dinner at a restaurant, if
//     the tower has one), then check out and leave.
//   - Housekeepers (milestone 12) work 9am to 5pm every day. Between jobs
//     they wait in their Housekeeping room; when a hotel room needs
//     cleaning, one of them goes and cleans it (housekeeping.js).
//   - Security guards (milestone 12) work nights, 8pm to 6am, in their
//     Security office, and commute in and out like makers (security.js).
//
// Instead of a timetable of "at 9:00 do X", each person just asks, whenever
// they're standing still: "given the time right now, where should I be — in
// my room, out of the building, (a maker at lunch) at a café, (a
// resident or guest at dinner) at a restaurant, or (a housekeeper) in the
// hotel room they're cleaning?" If the answer differs
// from where they are, they set off. That one question handles everything:
// a studio placed at 2pm, a maker who got stuck in a queue past quitting
// time, a weekend.
//
// While travelling, a person works through the legs of their route (see
// routing.js) one at a time. States:
//   offsite            — out of the building, not drawn
//   inRoom             — in their studio or condo
//   eating             — a maker having lunch at a café (`lunchCafe`), or a
//                        resident or guest at dinner (`dinnerRoom`)
//   cleaning           — a housekeeper cleaning a hotel room (`job`)
//   walking            — walking along a floor
//   onStairs           — climbing or descending one flight
//   waitingForElevator — queueing at a shaft (elevators.js takes over)
//   riding             — inside an elevator car
//
// Someone who has queued for an elevator for REPLAN_MINUTES (`queuedSince`)
// looks again for a quicker way, and every REPLAN_MINUTES after that.
//
// `tripWaitMinutes` and `tripStairsMinutes` add up time spent queueing and
// climbing on the current trip, and `tripStartedAt` is when they set off;
// on arrival all three go to stress.js.

const WALK_TILES_PER_MINUTE = 3;
const STAIRS_MINUTES_PER_FLOOR = 2;
const REPLAN_MINUTES = 10; // queueing this long, people look again for a quicker way
const RETRY_MINUTES = 30; // how long to wait before trying again if there's no route
const MOVER_GAP_MINUTES = [3, 8]; // movers arrive a few minutes apart
const UNPACK_MINUTES = [20, 40]; // a new arrival stays put this long
const LUNCH_START_HOURS = [11.5, 13.5]; // makers' lunch breaks start 11:30am–1:30pm...
const LUNCH_MINUTES = [30, 45]; // ...and last this long
const DINNER_START_HOURS = [19, 21]; // residents and guests go for dinner 7–9pm...
const DINNER_MINUTES = [60, 90]; // ...and take this long over it

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
        ...this.dailyTimes(room),
      };
      this.list.push(person);
      showUpAt += randomBetween(MOVER_GAP_MINUTES);
    }
  },

  // Each tenant's own times of day, in minutes after midnight.
  dailyTimes(room) {
    const type = ROOM_TYPES[room.type];
    const between = (fromHour, toHour) => randomBetween([fromHour * 60, toHour * 60]);
    if (type.role === "maker") return { arriveAt: between(8, 9.5), leaveAt: between(16.5, 18), ...this.lunchTimes() };
    if (type.role === "shopkeeper") {
      const [arrive, leave] = type.keeperHours;
      return { arriveAt: between(...arrive), leaveAt: between(...leave) };
    }
    if (type.role === "housekeeper" || type.role === "guard") {
      const [arrive, leave] = type.shiftHours;
      const times = { arriveAt: between(...arrive), leaveAt: between(...leave) };
      return type.role === "housekeeper" ? { ...times, job: null, cleaningAt: null, jobDoneAt: 0, workX: 0, lookAt: 0 } : times;
    }
    return {
      leaveAt: between(7.5, 9),
      returnAt: between(17.5, 19),
      weekendOuting: Math.random() < 0.5,
      outingStart: between(11, 13),
      outingEnd: between(15, 18),
      ...this.dinnerTimes(),
    };
  },

  // When a maker takes their lunch break, and for how long, in minutes.
  // `lunchDay` / `lunchCafe` are today's plan, made when the break starts
  // (cafes.js): the game day it was made for, and the café, or null to go
  // out.
  lunchTimes() {
    return {
      lunchAt: randomBetween(LUNCH_START_HOURS.map((h) => h * 60)),
      lunchMinutes: randomBetween(LUNCH_MINUTES),
      lunchDay: null,
      lunchCafe: null,
      seatX: 0,
    };
  },

  // When a resident or guest has dinner, and for how long, in minutes.
  // `dinnerDay` / `dinnerRoom` are tonight's plan, made when dinner time
  // comes (restaurants.js): the game day it was made for, and the
  // restaurant, or null to eat at home.
  dinnerTimes() {
    return {
      dinnerAt: randomBetween(DINNER_START_HOURS.map((h) => h * 60)),
      dinnerMinutes: randomBetween(DINNER_MINUTES),
      dinnerDay: null,
      dinnerRoom: null,
      seatX: 0,
    };
  },

  // A shopper turns up at a lobby and heads for this shop. `browseX` is
  // where in the shop they'll stand, and `budget` what they'd spend after
  // an easy trip (shops.js).
  addShopper(room, budget) {
    const width = ROOM_TYPES[room.type].width;
    this.list.push({
      id: this.nextId++,
      role: "shopper",
      room,
      slot: 0,
      state: "offsite",
      movingIn: false,
      movingOut: false,
      stress: 0,
      floor: room.floor,
      x: room.tileStart,
      browseX: room.tileStart + 0.5 + Math.random() * (width - 1),
      budget,
      bought: null, // what they spent once they've been to the till (0 = nothing)
      route: null,
      legIndex: 0,
      legProgress: 0,
      target: null,
      idleUntil: Clock.totalMinutes,
      tripStartedAt: 0,
      tripWaitMinutes: 0,
      tripStairsMinutes: 0,
      lastTripWaitMinutes: 0,
    });
  },

  // A hotel guest turns up at a lobby at `showUpAt` and heads for their
  // room. `outings` maps a game day to the [from, to] minutes they're out
  // that day (hotels.js). `peakStress` is the most stressed they get during
  // the stay, which is what their review hangs on.
  addGuest(room, slot, showUpAt, outings) {
    this.list.push({
      id: this.nextId++,
      role: "guest",
      room,
      slot,
      state: "offsite",
      movingIn: false,
      movingOut: false,
      stress: 0,
      peakStress: 0,
      arrived: false,
      outings,
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
      ...this.dinnerTimes(),
    });
  },

  removeForRoom(room) {
    for (const person of this.list.filter((p) => p.room === room)) Elevators.forget(person);
    this.list = this.list.filter((p) => p.room !== room);
    if (room.type === "cafe") Cafes.onClosed(room);
    if (room.type === "restaurant") Restaurants.onClosed(room);
    if (isHotel(room)) Housekeeping.onRoomGone(room);
  },

  // A room's tenants are leaving for good. Anyone already out of the
  // building is simply gone; everyone else heads for the lobby (after a
  // few minutes to pack) and is gone when they get there.
  moveOut(room) {
    for (const person of this.list.filter((p) => p.room === room)) {
      person.movingOut = true;
      if (person.job) Housekeeping.dropJob(person); // a housekeeper leaving doesn't go and clean first
      if (person.state === "offsite") this.remove(person);
      else if (person.state === "inRoom" || person.state === "cleaning") person.idleUntil = Clock.totalMinutes + randomBetween(MOVER_GAP_MINUTES);
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

  // Where this person stands in their room: a tenant's own slot, or the
  // spot a shopper picked to browse.
  homeX(person) {
    return person.role === "shopper" ? person.browseX : this.slotX(person.room, person.slot);
  },

  // Where someone is when standing still: "room", "cafe", "restaurant",
  // "cleaning" or "offsite". Makers eat lunch; everyone else who eats
  // here, dinner. A housekeeper who has finished the room they're in
  // (`cleaningAt`) and taken another job isn't where they want to be yet.
  whereIs(person) {
    if (person.state === "inRoom") return "room";
    if (person.state === "eating") return person.role === "maker" ? "cafe" : "restaurant";
    if (person.state === "cleaning") return person.job && person.cleaningAt === person.job ? "cleaning" : "cleaned";
    return "offsite";
  },

  // The spots that count as being at a place (any lobby, for "offsite").
  pointsFor(person, place) {
    if (place === "room") return [{ floor: person.room.floor, x: this.homeX(person) }];
    if (place === "cafe") return person.lunchCafe ? [{ floor: person.lunchCafe.floor, x: person.seatX }] : [];
    if (place === "restaurant") return person.dinnerRoom ? [{ floor: person.dinnerRoom.floor, x: person.seatX }] : [];
    if (place === "cleaning") return person.job ? [{ floor: person.job.floor, x: person.workX }] : [];
    return Routing.lobbyPoints();
  },

  // The one question: where should this person be at game time `t`?
  desiredLocation(person, t) {
    if (person.movingOut) return "offsite";
    if (person.movingIn) return "room";
    // A shopper is in the shop until they've been to the till, then gone.
    if (person.role === "shopper") return person.bought === null ? "room" : "offsite";
    const day = Math.floor(t / MINUTES_PER_DAY);
    const minute = t - day * MINUTES_PER_DAY;
    // A resident or guest at a restaurant for dinner tonight.
    if (person.dinnerRoom && person.dinnerDay === day && minute >= person.dinnerAt && minute < person.dinnerAt + person.dinnerMinutes) {
      return "restaurant";
    }
    // A guest is in their room, unless they're out for the day's outing.
    // (Checking out is hotels.js's call: it sends them off as movingOut.)
    if (person.role === "guest") {
      const outing = person.outings[day];
      return outing && t >= outing[0] && t < outing[1] ? "offsite" : "room";
    }
    const weekend = day % 7 >= 5;
    if (person.role === "maker") {
      if (weekend || minute < person.arriveAt || minute >= person.leaveAt) return "offsite";
      if (minute >= person.lunchAt && minute < person.lunchAt + person.lunchMinutes) {
        return person.lunchDay === day && person.lunchCafe ? "cafe" : "offsite";
      }
      return "room";
    }
    if (person.role === "shopkeeper") {
      return minute >= person.arriveAt && minute < person.leaveAt ? "room" : "offsite";
    }
    if (person.role === "housekeeper") {
      // Once started, a room gets finished, even past five o'clock.
      if (person.job && person.state === "cleaning" && person.cleaningAt === person.job) return "cleaning";
      if (minute < person.arriveAt || minute >= person.leaveAt) return "offsite";
      return person.job ? "cleaning" : "room";
    }
    if (person.role === "guard") {
      // The night shift runs past midnight: on from the evening, off in the morning.
      return minute >= person.arriveAt || minute < person.leaveAt ? "room" : "offsite";
    }
    if (!weekend) {
      return minute >= person.leaveAt && minute < person.returnAt ? "offsite" : "room";
    }
    return person.weekendOuting && minute >= person.outingStart && minute < person.outingEnd ? "offsite" : "room";
  },

  update(minutes) {
    const now = Clock.totalMinutes;
    for (const person of this.list) {
      if (person.state === "inRoom" || person.state === "offsite" || person.state === "eating" || person.state === "cleaning") {
        if (now < person.idleUntil) continue;
        // A maker at work whose lunch break has come round decides where
        // to eat.
        if (person.role === "maker" && person.state === "inRoom" && !person.movingIn && !person.movingOut) Cafes.planLunch(person, now);
        // A resident or guest at home whose dinner time has come decides
        // whether to eat out tonight. (A guest still on their way in to
        // check in isn't home yet.)
        const diner = person.role === "resident" || (person.role === "guest" && person.arrived);
        if (diner && person.state === "inRoom" && !person.movingIn && !person.movingOut) Restaurants.planDinner(person, now);
        // Done browsing: pay (or not) on the way out.
        if (person.role === "shopper" && person.state === "inRoom" && person.bought === null && !person.movingOut) {
          Shops.checkout(person);
        }
        // A housekeeper at work finishes the room they're cleaning, and
        // looks for the next one that needs it.
        if (person.role === "housekeeper" && !person.movingIn && !person.movingOut) Housekeeping.planWork(person, now);
        const here = this.whereIs(person);
        const want = this.desiredLocation(person, now);
        // From a hotel room that's been cleaned, the next trip starts where
        // they're standing (the job they were on is done).
        if (want !== here) {
          if (person.state === "cleaning") this.startTrip(person, want, { floor: person.floor, x: person.x }, true);
          else this.startTrip(person, want);
        }
      } else {
        // A shopper whose trip in has dragged on past the point of buying
        // anything turns back (but not mid-ride or mid-climb).
        const turnBack = person.role === "shopper" && person.target === "room" && !person.movingOut &&
          (person.state === "walking" || person.state === "waitingForElevator") && Shops.shouldGiveUp(person);
        if (turnBack) {
          Shops.giveUp(person);
          person.target = "offsite";
          this.reroute(person);
        } else {
          if (person.state === "waitingForElevator") {
            if (person.queuedSince == null) person.queuedSince = now; // queueing in a save from before this
            if (now - person.queuedSince >= REPLAN_MINUTES) this.reconsiderQueue(person);
          }
          this.advanceTrip(person, minutes);
        }
      }
    }
  },

  // Plan a route and set off, from where they are (or `from`, when
  // re-routing mid-trip) to `target`: "room", "cafe", "restaurant" or
  // "offsite". Coming in, you appear at a lobby; going out, you head for
  // one and vanish when you reach it.
  startTrip(person, target, from, freshTrip = false) {
    const starts = from ? [from] : this.pointsFor(person, this.whereIs(person));
    const goals = this.pointsFor(person, target);
    const route = starts.length && goals.length ? Routing.plan(starts, goals) : null;

    if (!route) {
      // No way through (no lobby, a missing elevator, a gap in the floor...).
      // Anyone already inside the building gives up and leaves; everyone
      // tries again in a little while in case the player fixes it. Being
      // stuck is stressful. Someone moving out finds their own way out, and
      // a shopper who can't get there (or back) gives up and goes home.
      if (person.movingOut || person.role === "shopper") {
        this.remove(person);
        return;
      }
      if (from) person.state = "offsite";
      // A housekeeper who can't get to a room leaves it to whoever can.
      if (target === "cleaning") Housekeeping.dropJob(person, false);
      else if (!person.movingIn) Stress.onNoRoute(person);
      person.route = null;
      person.idleUntil = Clock.totalMinutes + RETRY_MINUTES;
      return;
    }

    // A re-route (`from`) is the same trip carrying on, so the clock keeps
    // running from when they first set off. A new trip starts from zero,
    // even if the last one was abandoned partway, and so does one from a
    // seat whose café or restaurant has just shut (`freshTrip`).
    if (!from || freshTrip) {
      person.tripStartedAt = Clock.totalMinutes;
      person.tripWaitMinutes = 0;
      person.tripStairsMinutes = 0;
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
        person.queuedSince = Clock.totalMinutes;
        Elevators.call(person, leg);
      }
    }
  },

  finishTrip(person) {
    const states = { room: "inRoom", cafe: "eating", restaurant: "eating", cleaning: "cleaning" };
    person.state = states[person.target] || "offsite";
    person.route = null;
    person.lastTripWaitMinutes = person.tripWaitMinutes;
    let felt = 0;
    if (!person.movingIn && !person.movingOut) {
      const tripMinutes = Clock.totalMinutes - person.tripStartedAt;
      felt = Stress.onTripFinished(person, tripMinutes, person.tripStairsMinutes, person.tripWaitMinutes);
    }
    person.tripWaitMinutes = 0;
    person.tripStairsMinutes = 0;
    if ((person.movingOut || person.role === "shopper") && person.target === "offsite") {
      this.remove(person);
      return;
    }
    if (person.target === "room") {
      person.floor = person.room.floor;
      person.x = this.homeX(person);
      if (person.role === "shopper") Shops.onShopperArrived(person, felt);
      if (person.role === "guest") Hotels.onGuestArrived(person);
      if (person.movingIn) {
        person.movingIn = false;
        person.idleUntil = Clock.totalMinutes + randomBetween(UNPACK_MINUTES);
        Economy.onArrived(person.room);
      }
    }
    if (person.target === "cafe") {
      person.floor = person.lunchCafe.floor;
      person.x = person.seatX;
      Cafes.onMakerArrived(person);
    }
    if (person.target === "restaurant") {
      person.floor = person.dinnerRoom.floor;
      person.x = person.seatX;
      Restaurants.onDinerArrived(person);
    }
    if (person.target === "cleaning") {
      person.floor = person.job.floor;
      person.x = person.workX;
      Housekeeping.onArrived(person);
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
  // Someone who has queued for REPLAN_MINUTES looks again: if, from where
  // they stand, another shaft or the stairs now looks quicker than waiting
  // on, they go that way (the trip's clock keeps running). If not, they
  // keep their place and look again later.
  reconsiderQueue(person) {
    person.queuedSince = Clock.totalMinutes;
    const leg = person.route.legs[person.legIndex];
    const car = Elevators.cars.get(leg.transitId);
    const spot = car ? car.waiting.findIndex((w) => w.person === person) : -1;
    if (spot < 0) return;
    const here = { floor: Math.round(person.floor), x: Routing.stopX(car.transit, leg.fromFloor) };
    const goals = this.pointsFor(person, person.target);
    // Planned as if they'd stepped out of the queue, so they don't count
    // themselves as being in their own way.
    const [mine] = car.waiting.splice(spot, 1);
    const route = goals.length ? Routing.plan([here], goals) : null;
    car.waiting.splice(spot, 0, mine);
    const first = route && route.legs.find((l) => l.type !== "walk");
    if (!route || (first && first.transitId === leg.transitId)) return;
    this.reroute(person);
  },

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
  // nor those on their way out, nor visitors (shoppers and hotel guests).
  population() {
    return this.list.filter((p) => !p.movingIn && !p.movingOut && !isVisitor(p)).length;
  },
};

World.subscribe((event, payload) => {
  if (event === "roomRemoved") People.removeForRoom(payload);
  if (event === "transitRemoved") People.onTransitRemoved(payload);
  if (event === "floorsChanged") People.onFloorsChanged();
});

// Shoppers and hotel guests are only visiting, so they don't count
// towards the population.
function isVisitor(person) {
  return person.role === "shopper" || person.role === "guest";
}
