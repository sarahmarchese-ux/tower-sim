// Housekeeping (milestone 12): someone has to clean the hotel rooms.
//
// When guests check out (or leave early), their room needs cleaning
// (`room.needsCleaning`), and it can't be booked again until it's been
// done, as in SimTower (hotels.js). A Housekeeping room's two housekeepers
// work 9am to 5pm every day (rooms.js: `shiftHours`). Between jobs they
// wait in their Housekeeping room. When a room needs cleaning, the nearest
// free housekeeper (by the route planner's cost from where they are) walks
// or rides over, cleans it for CLEANING_MINUTES, and moves straight on to
// the next one; when there's none left, they go back to their room. So
// travel time counts: Housekeeping a few floors from the hotel rooms gets
// through more rooms a day than Housekeeping twenty floors away, and a
// hotel with no Housekeeping at all stops taking bookings once each room's
// guests have checked out.
//
// A housekeeper's current job is `person.job` (the hotel room). Once
// they're there, `cleaningAt` is that room and `jobDoneAt` is when they'll
// have finished it. A room a housekeeper is already on is left to them,
// and one they can't get to (or are leaving before they've cleaned) is
// given up for someone else. Each Housekeeping room
// counts the rooms its staff cleaned today (`cleanedToday` on `cleanedDay`)
// for its tooltip.

const CLEANING_MINUTES = 45;
const LOOK_AGAIN_MINUTES = 5; // nothing to clean (or nothing reachable): look again this soon

const Housekeeping = {
  // Called by people.js for a housekeeper standing still (in their
  // Housekeeping room, or in a hotel room they're cleaning): finish the
  // job if it's done, and pick the next one if they're on shift.
  planWork(person, now) {
    if (person.state === "cleaning" && person.job && person.cleaningAt === person.job && now >= person.jobDoneAt) this.finish(person);
    const minute = now % MINUTES_PER_DAY;
    const onShift = minute >= person.arriveAt && minute < person.leaveAt;
    // A job they never got to (no way there, say) is left for tomorrow's shift.
    if (!onShift && person.job && person.state !== "cleaning") person.job = null;
    if (!onShift || person.job || person.state === "offsite" || now < (person.lookAt || 0)) return;
    const job = this.pick(person);
    if (!job) {
      person.lookAt = now + LOOK_AGAIN_MINUTES;
      return;
    }
    person.job = job;
    // Somewhere in the room, so a pair cleaning neighbours don't overlap.
    const width = ROOM_TYPES[job.type].width;
    person.workX = job.tileStart + 0.5 + Math.random() * (width - 1);
  },

  // The hotel room needing cleaning that's cheapest to get to from where
  // this housekeeper stands, and that nobody else is already on; null if
  // there isn't one.
  pick(person) {
    const waiting = this.waitingRooms().filter((room) => !this.cleanerFor(room));
    if (!waiting.length) return null;
    const here = { floor: person.floor, x: person.x };
    let best = null;
    let bestCost = Infinity;
    for (const room of waiting) {
      const spot = { floor: room.floor, x: room.tileStart + ROOM_TYPES[room.type].width / 2 };
      const route = Routing.plan([here], [spot]);
      if (route && route.cost < bestCost) {
        best = room;
        bestCost = route.cost;
      }
    }
    return best;
  },

  // Called by people.js when a housekeeper reaches the room to clean.
  onArrived(person) {
    person.cleaningAt = person.job;
    person.jobDoneAt = Clock.totalMinutes + CLEANING_MINUTES;
    person.idleUntil = person.jobDoneAt;
  },

  // The room's done: it can be booked again.
  finish(person) {
    const room = person.job;
    person.job = null;
    person.cleaningAt = null;
    room.needsCleaning = false;
    const office = person.room;
    if (office.cleanedDay !== Clock.day) {
      office.cleanedDay = Clock.day;
      office.cleanedToday = 0;
    }
    office.cleanedToday++;
    Economy.popupOverRoom(room, "Cleaned", "#d6f5ef");
  },

  // A hotel room was knocked down: whoever was cleaning it, or on their
  // way, drops the job.
  onRoomGone(room) {
    for (const person of People.list) {
      if (person.role === "housekeeper" && person.job === room) this.dropJob(person);
    }
  },

  // A housekeeper gives up their job, unfinished: the room's knocked down,
  // they're leaving, or (`redirect` false: people.js has it in hand) they
  // can't get there. Someone else can take it; this one looks again in a
  // little while, from wherever they end up.
  dropJob(person, redirect = true) {
    person.job = null;
    person.cleaningAt = null;
    person.lookAt = Clock.totalMinutes + LOOK_AGAIN_MINUTES;
    if (!redirect) return;
    const want = People.desiredLocation(person, Clock.totalMinutes);
    if (person.state === "cleaning") {
      People.startTrip(person, want, { floor: person.floor, x: person.x }, true);
    } else if (person.route && person.target === "cleaning") {
      person.target = want;
      People.reroute(person);
    }
  },

  // The housekeeper (still working here) on this room, if any.
  cleanerFor(room) {
    return People.list.find((p) => p.role === "housekeeper" && p.job === room && !p.movingOut) || null;
  },

  // Every hotel room waiting to be cleaned.
  waitingRooms() {
    return World.rooms.filter((room) => isHotel(room) && room.needsCleaning);
  },

  // Is there a Housekeeping room with staff hired?
  staffed() {
    return World.rooms.some((room) => room.type === "housekeeping" && room.status === "occupied");
  },

  // For a hotel room's tooltip: "needs cleaning", and who's on it.
  describeRoom(room) {
    const cleaner = this.cleanerFor(room);
    if (!cleaner) return "needs cleaning";
    return cleaner.cleaningAt === room ? "being cleaned" : "needs cleaning: housekeeper on the way";
  },

  // Rooms this Housekeeping room's staff have cleaned today.
  cleanedToday(office) {
    return office.cleanedDay === Clock.day ? office.cleanedToday : 0;
  },
};
