// Elevators that run themselves. Each shaft has one car, and the car follows
// the same simple rule most real elevators use ("collective control"):
//
//   1. Keep going in your current direction while anyone needs you further
//      that way — a rider who wants to get off, or someone waiting.
//   2. On the way, stop at a floor if a rider wants off there, or if someone
//      there is waiting to go the same way you're going.
//   3. When nobody needs you further ahead, turn around if someone needs you
//      behind. Otherwise, sit still with the doors shut until called.
//
// That's it — no scheduling tables, no player input. It isn't perfect (a
// single car gets swamped at rush hour, which is exactly the pressure the
// player should feel), but it never forgets anyone.
//
// Times are in game minutes. `floor` is fractional while moving: 3.4 means
// 40% of the way from floor 3 to floor 4.

const ELEVATOR_CAPACITY = 8;
const ELEVATOR_MINUTES_PER_FLOOR = 0.5;
const ELEVATOR_DOOR_MINUTES = 1;

const Elevators = {
  cars: new Map(), // transit id -> car

  // A person at `leg.fromFloor` presses the call button. They stand in a
  // little queue next to the shaft until a car going their way opens up.
  call(person, leg) {
    const car = this.cars.get(leg.transitId);
    const direction = Math.sign(leg.toFloor - leg.fromFloor);
    const queueSpot = car.waiting.filter((w) => w.floor === leg.fromFloor).length;
    car.waiting.push({ person, floor: leg.fromFloor, dest: leg.toFloor, direction });
    person.x = Routing.stopX(car.transit, leg.fromFloor) - 0.4 * queueSpot;
  },

  // Take someone out of every queue and car (their room was demolished).
  forget(person) {
    for (const car of this.cars.values()) {
      car.waiting = car.waiting.filter((w) => w.person !== person);
      car.riders = car.riders.filter((r) => r.person !== person);
    }
  },

  update(minutes) {
    for (const car of this.cars.values()) {
      this.step(car, minutes);
      for (const rider of car.riders) rider.person.floor = car.floor;
    }
  },

  // Is there any reason to keep travelling in `direction` from here?
  hasRequestsBeyond(car, direction) {
    if (direction === 0) return false;
    const beyond = (floor) => (floor - car.floor) * direction > 0.001;
    return car.riders.some((r) => beyond(r.dest)) || car.waiting.some((w) => beyond(w.floor));
  },

  // Rule 1 and rule 3 above: which way should the car go next?
  chooseDirection(car) {
    const up = this.hasRequestsBeyond(car, 1);
    const down = this.hasRequestsBeyond(car, -1);
    if (car.direction > 0 && up) return 1;
    if (car.direction < 0 && down) return -1;
    if (up && down) {
      // Idle with calls both ways: go toward the nearest one.
      const floors = [...car.riders.map((r) => r.dest), ...car.waiting.map((w) => w.floor)];
      const nearest = floors.reduce((a, b) => (Math.abs(b - car.floor) < Math.abs(a - car.floor) ? b : a));
      return Math.sign(nearest - car.floor);
    }
    if (up) return 1;
    if (down) return -1;
    return 0;
  },

  // Rule 2: should the car stop at `floor`, which it has just reached? A
  // full car only stops to let people off: opening for people it can't
  // take would just cost everyone aboard a minute.
  shouldStop(car, floor) {
    if (car.riders.some((r) => r.dest === floor)) return true;
    if (car.riders.length >= ELEVATOR_CAPACITY) return false;
    const turningAround = !this.hasRequestsBeyond(car, car.direction);
    return car.waiting.some((w) => w.floor === floor && (w.direction === car.direction || turningAround));
  },

  openDoors(car) {
    car.state = "doors";
    car.doorTimer = ELEVATOR_DOOR_MINUTES;
    this.exchange(car);
  },

  // Doors are open: riders for this floor get off, then people waiting here
  // who are going the car's way get on, as long as there's room.
  exchange(car) {
    const floor = Math.round(car.floor);

    const staying = [];
    for (const rider of car.riders) {
      if (rider.dest === floor) People.onElevatorArrive(rider.person, floor);
      else staying.push(rider);
    }
    car.riders = staying;

    const here = car.waiting.filter((w) => w.floor === floor);
    if (here.length === 0) return;
    // If riders or calls further on need the car to keep going its way,
    // only people going that way get on. Otherwise the car is free, and the
    // people here decide: anyone going its way first, else whoever was
    // first in the queue. (Asking chooseDirection here would look only at
    // calls on *other* floors: with someone here going up and someone
    // below going down, the car would turn down, pass them over, then at
    // the floor below turn up and pass that one over, and bounce between
    // the two forever.)
    let direction = car.direction !== 0 && this.hasRequestsBeyond(car, car.direction) ? car.direction : 0;
    if (direction === 0 && car.riders.length > 0) direction = this.chooseDirection(car);
    if (direction === 0) {
      direction = here.some((w) => w.direction === car.direction) ? car.direction : here[0].direction;
    }

    const room = ELEVATOR_CAPACITY - car.riders.length;
    const boarding = here.filter((w) => w.direction === direction).slice(0, room);
    for (const w of boarding) {
      car.waiting.splice(car.waiting.indexOf(w), 1);
      car.riders.push({ person: w.person, dest: w.dest });
      People.onBoard(w.person);
    }
    if (boarding.length > 0) car.direction = direction;
  },

  // Move the car forward by `minutes` of game time. The loop lets one call
  // cover several things (finish closing the doors, then start moving, then
  // reach the next floor) without losing any time in between.
  step(car, minutes) {
    let remaining = minutes;
    for (let guard = 0; remaining > 1e-9 && guard < 50; guard++) {
      if (car.state === "doors") {
        const used = Math.min(remaining, car.doorTimer);
        car.doorTimer -= used;
        remaining -= used;
        if (car.doorTimer > 1e-9) continue;
        this.exchange(car); // let anyone who arrived while the doors were open on
        car.direction = this.chooseDirection(car);
        car.state = car.direction === 0 ? "idle" : "moving";
      } else if (car.state === "idle") {
        // Someone waiting right here gets the doors before the car heads
        // off to anyone else.
        if (car.waiting.some((w) => w.floor === Math.round(car.floor))) {
          car.direction = 0;
          this.openDoors(car);
          continue;
        }
        car.direction = this.chooseDirection(car);
        if (car.direction !== 0) {
          car.state = "moving";
        } else {
          return; // nothing to do
        }
      } else {
        // Moving: head for the next whole floor in our direction.
        //
        // Adding up small fractions of a floor leaves tiny rounding errors —
        // the car can end up at 1.9999999998 rather than exactly 2. So
        // "within a hair of a whole floor" counts as *on* that floor;
        // otherwise the car would think it had already passed floor 2 and
        // sail by without stopping.
        const nearest = Math.round(car.floor);
        const onFloor = Math.abs(car.floor - nearest) < 1e-6;
        const next = onFloor
          ? nearest + car.direction
          : car.direction > 0 ? Math.ceil(car.floor) : Math.floor(car.floor);

        // Never head out of the shaft. (Shouldn't happen — nobody can ask for
        // a floor the shaft doesn't reach — but a car that leaves its shaft
        // strands everyone inside, so it's worth a guard.)
        if (next > car.transit.floorTop || next < car.transit.floorBottom) {
          car.floor = nearest;
          car.direction = this.chooseDirection(car);
          if (car.direction === 0) car.state = "idle";
          continue;
        }

        const timeToNext = Math.abs(next - car.floor) * ELEVATOR_MINUTES_PER_FLOOR;
        if (remaining < timeToNext - 1e-9) {
          car.floor += (car.direction * remaining) / ELEVATOR_MINUTES_PER_FLOOR;
          return;
        }
        car.floor = next;
        remaining = Math.max(0, remaining - timeToNext);
        if (this.shouldStop(car, next)) {
          this.openDoors(car);
        } else if (!this.hasRequestsBeyond(car, car.direction)) {
          car.direction = this.chooseDirection(car);
          if (car.direction === 0) car.state = "idle";
        }
      }
    }
  },
};

World.subscribe((event, transit) => {
  if (event === "transitAdded" && transit.kind === "elevator") {
    Elevators.cars.set(transit.id, {
      transit,
      floor: transit.floorBottom,
      direction: 0,
      state: "idle",
      doorTimer: 0,
      riders: [], // { person, dest }
      waiting: [], // { person, floor, dest, direction }
    });
  }
  if (event === "transitRemoved") Elevators.cars.delete(transit.id);
});
