// How does someone get from where they are to where they want to be?
//
// The building is turned into a small map of "stops": the start, the goal,
// and every place you can get on or off stairs or an elevator. Two stops are
// connected if you can walk between them along the same floor (with no gap
// in the floor between), or if one stairway/elevator links them. Each
// connection has a cost, and Dijkstra's algorithm finds the cheapest chain
// of connections from start to goal. That chain becomes a list of "legs":
//
//   { type: "walk", floor, toX }
//   { type: "stairs" | "elevator", transitId, fromFloor, toFloor }
//
// (A ride in a staff lift is an "elevator" leg too: it runs the same way.)
// Staff lifts (milestone 14b) are only for housekeepers and guards, so
// only a plan made for them (`staff`) uses them; everyone else plans as if
// they weren't there. Staff take whichever way is quickest: a staff lift,
// an elevator or the stairs.
//
// Positions along a floor (`x`) are in tiles and can be fractional — 3.5 is
// the middle of tile 3.
//
// A start or goal can also be a stretch of floor, from `xMin` to `xMax`:
// a lobby, which people enter or leave anywhere along. A route uses the
// spot on it nearest the next stop (or the last one), so people come in
// at the end of the lobby nearest where they're going, or right by the
// stairs or elevator they want if it's in the lobby. A long lobby spreads
// them across every shaft in it, rather than favouring those near its
// middle. Separate lobbies are still separate doors.

// Costs are in "tiles of walking" (3 tiles a minute), set to match how
// long each kind of travel *feels* (stress.js counts stairs and queueing
// twice). A flight of stairs takes 2 minutes, so it feels like 4: 12 tiles.
// An elevator costs a typical wait (counted twice) to board, plus the ride.
// On top of that comes the queue, judged the way someone at the call
// button would: the people who'll fill the car before them (waiting on
// their floor, or "upstream", where the car comes from, going the same
// way, and riders in a car on its way to them who are going past). Up to a carload costs only a little (the car takes them all);
// every full carload ahead means waiting out another round trip of the
// shaft. Anyone else waiting adds a stop. With these numbers people take
// nearby stairs for a floor or two, spread out across shafts at rush
// hour, and walk to the stairs rather than wait out several full cars.
const STAIRS_COST_PER_FLOOR = 12;
const ELEVATOR_BOARD_COST = 15;
const ELEVATOR_COST_PER_FLOOR = 1.5;
const TILES_PER_FELT_MINUTE = 6; // 3 tiles a minute, a queueing minute felt twice
const ELEVATOR_AHEAD_COST = 2; // per person ahead, within the car's first load
const ELEVATOR_STOP_COST = 2; // per other person waiting (another stop)

const Routing = {
  _segmentsVersion: -1,
  _segments: new Map(), // floor -> Map(tile -> segment id)
  _reachableVersion: -1,
  _reachable: new Map(), // room id -> boolean

  // Where you stand to get on or off a piece of transit on a given floor.
  // Stairs climb diagonally from the bottom-left to the top-right corner of
  // their footprint; elevators are boarded from their first tile.
  stopX(transit, floor) {
    const width = TRANSIT_TYPES[transit.kind].width;
    if (transit.kind === "stairs") {
      return floor === transit.floorBottom ? transit.tileStart + 0.5 : transit.tileStart + width - 0.5;
    }
    return transit.tileStart + 0.5;
  },

  // Every lobby, as a stretch people can enter or leave anywhere along
  // (the middle of its first tile to the middle of its last).
  lobbyPoints() {
    return World.rooms
      .filter((room) => room.type === "lobby")
      .map((room) => ({
        floor: room.floor,
        x: room.tileStart + roomWidth(room) / 2,
        xMin: room.tileStart + 0.5,
        xMax: room.tileStart + roomWidth(room) - 0.5,
      }));
  },

  // The nearest two spots on stops a and b, on the same floor: each a
  // point (`x`) or a stretch (`xMin`..`xMax`). Returns [x on a, x on b].
  nearestSpots(a, b) {
    const aMin = a.xMin ?? a.x;
    const aMax = a.xMax ?? a.x;
    const bMin = b.xMin ?? b.x;
    const bMax = b.xMax ?? b.x;
    if (aMax < bMin) return [aMax, bMin];
    if (bMax < aMin) return [aMin, bMax];
    const overlap = Math.max(aMin, bMin);
    return [overlap, overlap];
  },

  // Split every floor into runs of connected built tiles ("segments"), so
  // "can I walk from here to there?" is just "same segment?". Rebuilt only
  // when the building changes, not on every question.
  segmentOf(floor, x) {
    if (this._segmentsVersion !== World.version) {
      this._segments = new Map();
      let nextSegment = 0;
      for (const [f, tiles] of World.floors) {
        const byTile = new Map();
        const sorted = [...tiles].sort((a, b) => a - b);
        let previous = null;
        for (const tile of sorted) {
          if (previous === null || tile !== previous + 1) nextSegment++;
          byTile.set(tile, nextSegment);
          previous = tile;
        }
        this._segments.set(f, byTile);
      }
      this._segmentsVersion = World.version;
    }
    const byTile = this._segments.get(floor);
    return byTile ? byTile.get(Math.floor(x)) : undefined;
  },

  canWalk(floor, x1, x2) {
    const a = this.segmentOf(floor, x1);
    return a !== undefined && a === this.segmentOf(floor, x2);
  },

  // starts / goals: arrays of { floor, x }. Several starts or goals are
  // allowed (e.g. "any lobby") — the cheapest one wins. `staff`: the trip
  // is a housekeeper's or a guard's, who can ride staff lifts too.
  // Returns { start, goal, legs, cost } or null if there's no way through.
  plan(starts, goals, { staff = false } = {}) {
    const nodes = [];
    for (const s of starts) nodes.push({ floor: s.floor, x: s.x, xMin: s.xMin, xMax: s.xMax, isStart: true });
    for (const g of goals) nodes.push({ floor: g.floor, x: g.x, xMin: g.xMin, xMax: g.xMax, isGoal: true });
    for (const t of World.transit) {
      if (TRANSIT_TYPES[t.kind].staffOnly && !staff) continue;
      for (let floor = t.floorBottom; floor <= t.floorTop; floor++) {
        nodes.push({ floor, x: this.stopX(t, floor), transit: t });
      }
    }

    const byFloor = new Map();
    nodes.forEach((node, i) => {
      if (!byFloor.has(node.floor)) byFloor.set(node.floor, []);
      byFloor.get(node.floor).push(i);
    });

    const dist = nodes.map((node) => (node.isStart ? 0 : Infinity));
    const prev = nodes.map(() => -1);
    const done = nodes.map(() => false);

    for (;;) {
      // Pick the closest stop we haven't finished with. A simple scan is fine
      // here: even a big tower only has a few hundred stops.
      let current = -1;
      for (let i = 0; i < nodes.length; i++) {
        if (!done[i] && dist[i] < Infinity && (current === -1 || dist[i] < dist[current])) current = i;
      }
      if (current === -1) return null; // nothing left to explore: no route
      const node = nodes[current];
      if (node.isGoal) return { ...this._legsTo(current, nodes, prev), cost: dist[current] };
      done[current] = true;

      const relax = (next, cost) => {
        if (!done[next] && dist[current] + cost < dist[next]) {
          dist[next] = dist[current] + cost;
          prev[next] = current;
        }
      };

      // Walking to other stops on the same floor.
      for (const next of byFloor.get(node.floor)) {
        if (next === current) continue;
        const [from, to] = this.nearestSpots(node, nodes[next]);
        if (this.canWalk(node.floor, from, to)) relax(next, Math.abs(from - to));
      }

      // Riding or climbing to the same transit's stops on other floors.
      if (node.transit) {
        const t = node.transit;
        const boardCost = isLift(t.kind)
          ? { up: this.boardCost(t, node.floor, 1), down: this.boardCost(t, node.floor, -1) }
          : null;
        for (let floor = t.floorBottom; floor <= t.floorTop; floor++) {
          if (floor === node.floor) continue;
          const floors = Math.abs(floor - node.floor);
          const cost = !isLift(t.kind)
            ? STAIRS_COST_PER_FLOOR * floors
            : (floor > node.floor ? boardCost.up : boardCost.down) + ELEVATOR_COST_PER_FLOOR * floors;
          const next = byFloor.get(floor).find((i) => nodes[i].transit === t);
          relax(next, cost);
        }
      }
    }
  },

  // Which of `places` ({ floor, x } each) is the cheapest trip from
  // `from`, if it's no more than `maxCost`: its index, or -1 if none. One
  // plan to all of them at once: a plan apiece, for every maker choosing
  // among a dozen cafés, was a third of a big tower's time.
  cheapestOf(from, places, maxCost = Infinity) {
    if (!places.length) return -1;
    const route = this.plan([from], places);
    if (!route || route.cost > maxCost) return -1;
    return places.findIndex((p) => p.floor === route.goal.floor && p.x === route.goal.x);
  },

  // What getting on this elevator (or staff lift) at `floor`, going
  // `direction`, costs right now (see the costs at the top). A staff
  // lift's small car fills sooner.
  boardCost(transit, floor, direction) {
    const car = Elevators.cars.get(transit.id);
    if (!car) return ELEVATOR_BOARD_COST;
    // Riders in a car still coming this way will fill seats first.
    const coming = car.direction === direction && (car.floor - floor) * direction < 0;
    let ahead = coming ? car.riders.filter((r) => (r.dest - floor) * direction > 0).length : 0;
    let others = 0;
    for (const w of car.waiting) {
      if (w.direction === direction && (w.floor - floor) * direction <= 0) ahead++;
      else others++;
    }
    const capacity = TRANSIT_TYPES[transit.kind].capacity;
    const fullLoads = Math.floor(ahead / capacity);
    const firstLoad = ahead - fullLoads * capacity;
    // A round trip: down and back up the shaft, stopping on most floors.
    const floors = transit.floorTop - transit.floorBottom;
    const roundTrip = floors * (2 * ELEVATOR_MINUTES_PER_FLOOR + ELEVATOR_DOOR_MINUTES);
    return ELEVATOR_BOARD_COST + fullLoads * roundTrip * TILES_PER_FELT_MINUTE +
      firstLoad * ELEVATOR_AHEAD_COST + others * ELEVATOR_STOP_COST;
  },

  // Walk the `prev` links back from the goal and turn them into legs. A
  // start or goal that's a stretch (a lobby) becomes the spot on it nearest
  // the stop after (or before) it.
  _legsTo(goalIndex, nodes, prev) {
    const path = [];
    for (let i = goalIndex; i !== -1; i = prev[i]) path.unshift(nodes[i]);
    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      if (node.xMin === undefined) continue;
      const x = i === 0
        ? (path.length > 1 ? this.nearestSpots(node, path[1])[0] : node.x)
        : this.nearestSpots(path[i - 1], node)[1];
      path[i] = { floor: node.floor, x, isStart: node.isStart, isGoal: node.isGoal };
    }
    const legs = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (a.floor === b.floor) {
        if (a.x !== b.x) legs.push({ type: "walk", floor: a.floor, toX: b.x });
      } else {
        legs.push({ type: isLift(a.transit.kind) ? "elevator" : "stairs", transitId: a.transit.id, fromFloor: a.floor, toFloor: b.floor });
      }
    }
    return { start: path[0], goal: path[path.length - 1], legs };
  },

  // Can people get from a lobby to this room at all? Cached until the
  // building changes, since the drawing code asks every frame. A service
  // room's staff can use staff lifts to get there.
  isReachable(room) {
    if (this._reachableVersion !== World.version) {
      this._reachable = new Map();
      this._reachableVersion = World.version;
    }
    if (!this._reachable.has(room.id)) {
      const target = { floor: room.floor, x: room.tileStart + roomWidth(room) / 2 };
      const staff = isStaffRole(ROOM_TYPES[room.type].role);
      this._reachable.set(room.id, this.plan(this.lobbyPoints(), [target], { staff }) !== null);
    }
    return this._reachable.get(room.id);
  },
};

// Housekeepers and guards: the staff who can ride staff lifts.
function isStaffRole(role) {
  return role === "housekeeper" || role === "guard";
}
