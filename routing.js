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
// Positions along a floor (`x`) are in tiles and can be fractional — 3.5 is
// the middle of tile 3.

// Costs are in "tiles of walking". Stairs are tiring, so each floor of stairs
// counts as a long walk; an elevator costs a fixed amount for the wait plus
// a little per floor. With these numbers people take the stairs for one
// floor when an elevator is far away, and the elevator otherwise.
const STAIRS_COST_PER_FLOOR = 25;
const ELEVATOR_BOARD_COST = 20;
const ELEVATOR_COST_PER_FLOOR = 2;

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

  lobbyPoints() {
    return World.rooms
      .filter((room) => room.type === "lobby")
      .map((room) => ({ floor: room.floor, x: room.tileStart + ROOM_TYPES.lobby.width / 2 }));
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
  // allowed (e.g. "any lobby") — the cheapest one wins.
  // Returns { start, goal, legs, cost } or null if there's no way through.
  plan(starts, goals) {
    const nodes = [];
    for (const s of starts) nodes.push({ floor: s.floor, x: s.x, isStart: true });
    for (const g of goals) nodes.push({ floor: g.floor, x: g.x, isGoal: true });
    for (const t of World.transit) {
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
        const other = nodes[next];
        if (this.canWalk(node.floor, node.x, other.x)) relax(next, Math.abs(node.x - other.x));
      }

      // Riding or climbing to the same transit's stops on other floors.
      if (node.transit) {
        const t = node.transit;
        for (let floor = t.floorBottom; floor <= t.floorTop; floor++) {
          if (floor === node.floor) continue;
          const floors = Math.abs(floor - node.floor);
          const cost = t.kind === "stairs"
            ? STAIRS_COST_PER_FLOOR * floors
            : ELEVATOR_BOARD_COST + ELEVATOR_COST_PER_FLOOR * floors;
          const next = byFloor.get(floor).find((i) => nodes[i].transit === t);
          relax(next, cost);
        }
      }
    }
  },

  // Walk the `prev` links back from the goal and turn them into legs.
  _legsTo(goalIndex, nodes, prev) {
    const path = [];
    for (let i = goalIndex; i !== -1; i = prev[i]) path.unshift(nodes[i]);
    const legs = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (a.floor === b.floor) {
        if (a.x !== b.x) legs.push({ type: "walk", floor: a.floor, toX: b.x });
      } else {
        legs.push({ type: a.transit.kind, transitId: a.transit.id, fromFloor: a.floor, toFloor: b.floor });
      }
    }
    return { start: path[0], goal: path[path.length - 1], legs };
  },

  // Can people get from a lobby to this room at all? Cached until the
  // building changes, since the drawing code asks every frame.
  isReachable(room) {
    if (this._reachableVersion !== World.version) {
      this._reachable = new Map();
      this._reachableVersion = World.version;
    }
    if (!this._reachable.has(room.id)) {
      const target = { floor: room.floor, x: room.tileStart + ROOM_TYPES[room.type].width / 2 };
      this._reachable.set(room.id, this.plan(this.lobbyPoints(), [target]) !== null);
    }
    return this._reachable.get(room.id);
  },
};
