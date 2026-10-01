// The building itself: what floor tiles exist, what rooms and transit sit
// where, and how much money the player has. Nothing in here knows about
// pixels, the camera, or the mouse — it only works in grid units (tiles and
// floors) and answers yes/no questions like "can I build this?". That
// separation means we can test or change these rules without touching any
// drawing code.
//
// World also announces every change it makes ("a room was added", "an
// elevator was removed", ...) to anyone who subscribed. People and elevators
// listen for those announcements and react — World itself never has to know
// they exist. Every change to the building's layout also bumps `version`, a
// counter other modules can compare against to know when something they
// cached (like a route) might be out of date.

const World = {
  money: STARTING_MONEY,
  floors: new Map(), // floor number -> Set of built tile indices
  rooms: [], // { id, type: "sewing", floor: 0, tileStart: 3, status: "vacant" }
  transit: [], // { id, kind: "stairs" | "elevator", tileStart, floorBottom, floorTop }
  version: 0,
  nextId: 1,
  listeners: [],

  subscribe(listener) {
    this.listeners.push(listener);
  },

  emit(event, payload, { layout = true } = {}) {
    if (layout) this.version++;
    for (const listener of this.listeners) listener(event, payload);
  },

  isFloorBuilt(floor, tile) {
    const tiles = this.floors.get(floor);
    return !!tiles && tiles.has(tile);
  },

  // The room (if any) whose footprint covers this tile on this floor.
  roomAt(floor, tile) {
    return this.rooms.find((room) => {
      const width = ROOM_TYPES[room.type].width;
      return (
        room.floor === floor &&
        tile >= room.tileStart &&
        tile < room.tileStart + width
      );
    });
  },

  // Every stairs or elevator shaft taking up this tile on this floor.
  // Stairs take up only the floor they start on: the flight climbs within
  // that floor's height and lets you off on the floor above, so that floor
  // stays free (for a room, or the next set of stairs stacked on top).
  transitsAt(floor, tile) {
    return this.transit.filter((t) => {
      const width = TRANSIT_TYPES[t.kind].width;
      const top = t.kind === "stairs" ? t.floorBottom : t.floorTop;
      return (
        floor >= t.floorBottom &&
        floor <= top &&
        tile >= t.tileStart &&
        tile < t.tileStart + width
      );
    });
  },

  // Stairs whose top landing is this tile, on the floor above the flight.
  stairsLandingAt(floor, tile) {
    return this.transit.find(
      (t) =>
        t.kind === "stairs" &&
        t.floorTop === floor &&
        tile >= t.tileStart &&
        tile < t.tileStart + TRANSIT_TYPES.stairs.width,
    );
  },

  // The stairs or elevator shaft (if any) taking up this tile on this floor.
  transitAt(floor, tile) {
    return this.transitsAt(floor, tile)[0];
  },

  // Only tiles that aren't already built cost money — re-dragging over
  // existing floor is free, which makes the drag gesture forgiving to use.
  floorRunCost(floor, tileStart, tileEnd) {
    let newTiles = 0;
    for (let tile = tileStart; tile <= tileEnd; tile++) {
      if (!this.isFloorBuilt(floor, tile)) newTiles++;
    }
    return newTiles * FLOOR_COST_PER_TILE;
  },

  buildFloorRun(floor, tileStart, tileEnd) {
    const cost = this.floorRunCost(floor, tileStart, tileEnd);
    if (cost > this.money) {
      return { ok: false, reason: "Not enough money to build that floor" };
    }
    if (!this.floors.has(floor)) this.floors.set(floor, new Set());
    const tiles = this.floors.get(floor);
    for (let tile = tileStart; tile <= tileEnd; tile++) tiles.add(tile);
    this.money -= cost;
    this.emit("floorsChanged", { floor });
    return { ok: true };
  },

  // Checked both before placing (to charge money) and every frame while
  // hovering (to color the preview green or red) — kept as one function so
  // the rules can never drift between "what we check" and "what we allow".
  canPlaceRoom(typeKey, floor, tileStart) {
    const type = ROOM_TYPES[typeKey];
    if (!type) return { ok: false, reason: "Unknown room type" };

    // New room types are the reward for each star (ratings.js).
    if (type.unlocksAt && Ratings.stars < type.unlocksAt) {
      return { ok: false, reason: `${type.name}s unlock at ${type.unlocksAt}★: grow the tower to ${starTarget(type.unlocksAt).population} people first` };
    }

    if (type.groundOnly && floor !== 0) {
      return { ok: false, reason: "The lobby has to be on the ground floor" };
    }

    const tileEnd = tileStart + type.width - 1;
    for (let tile = tileStart; tile <= tileEnd; tile++) {
      if (!this.isFloorBuilt(floor, tile)) {
        return { ok: false, reason: "Build the floor here first" };
      }
      if (this.roomAt(floor, tile)) {
        return { ok: false, reason: "Overlaps another room" };
      }
      if (!type.allowsTransit && this.transitAt(floor, tile)) {
        return { ok: false, reason: "Overlaps stairs or an elevator" };
      }
    }

    if (type.cost > this.money) {
      return { ok: false, reason: "Not enough money" };
    }

    return { ok: true, tileEnd };
  },

  // Occupancy changes go through here so they're announced like any other
  // change. They don't move any walls, so they leave `version` alone: that
  // would throw away every cached route each time someone moved in, which
  // stutters a big tower while it fills.
  setRoomStatus(room, status) {
    room.status = status;
    this.emit("roomStatusChanged", room, { layout: false });
  },

  placeRoom(typeKey, floor, tileStart) {
    const check = this.canPlaceRoom(typeKey, floor, tileStart);
    if (!check.ok) return check;
    // Rooms with tenants start empty; economy.js moves people in later and
    // updates `status` ("vacant" -> "movingIn" -> "occupied"). The lobby has
    // no tenants, so it has no status.
    const hasTenants = ROOM_TYPES[typeKey].tenants > 0;
    const room = { id: this.nextId++, type: typeKey, floor, tileStart, status: hasTenants ? "vacant" : null };
    this.rooms.push(room);
    this.money -= ROOM_TYPES[typeKey].cost;
    this.emit("roomAdded", room);
    return { ok: true };
  },

  // Same idea as canPlaceRoom, for a stairway or elevator shaft covering
  // every floor from floorBottom to floorTop.
  canPlaceTransit(kind, tileStart, floorBottom, floorTop) {
    const type = TRANSIT_TYPES[kind];
    if (!type) return { ok: false, reason: "Unknown transit type" };

    const floorCount = floorTop - floorBottom + 1;
    if (kind === "stairs" && floorCount !== 2) {
      return { ok: false, reason: "Stairs join two neighbouring floors" };
    }
    if (kind === "elevator" && floorCount < 2) {
      return { ok: false, reason: "Drag up or down so the elevator spans at least 2 floors" };
    }
    if (kind === "elevator" && floorCount > type.maxFloors) {
      return { ok: false, reason: `An elevator can span at most ${type.maxFloors} floors` };
    }

    for (let floor = floorBottom; floor <= floorTop; floor++) {
      for (let tile = tileStart; tile < tileStart + type.width; tile++) {
        if (!this.isFloorBuilt(floor, tile)) {
          return { ok: false, reason: "Build floor on every level it passes through first" };
        }
        // Stairs only take up their bottom floor (see transitsAt); the
        // floor above just needs to be built for people to step off onto.
        const occupies = kind !== "stairs" || floor === floorBottom;
        if (!occupies) continue;
        const room = this.roomAt(floor, tile);
        if (room && !ROOM_TYPES[room.type].allowsTransit) {
          return { ok: false, reason: "Overlaps a room (only the lobby can share space)" };
        }
        if (this.transitAt(floor, tile)) {
          return { ok: false, reason: "Overlaps other stairs or an elevator" };
        }
      }
    }

    if (transitCost(kind, floorBottom, floorTop) > this.money) {
      return { ok: false, reason: "Not enough money" };
    }

    return { ok: true };
  },

  placeTransit(kind, tileStart, floorBottom, floorTop) {
    const check = this.canPlaceTransit(kind, tileStart, floorBottom, floorTop);
    if (!check.ok) return check;
    const transit = { id: this.nextId++, kind, tileStart, floorBottom, floorTop };
    this.transit.push(transit);
    this.money -= transitCost(kind, floorBottom, floorTop);
    this.emit("transitAdded", transit);
    return { ok: true };
  },

  // The elevator shaft (if any) in this tile's column that a drag over
  // floors floorLo..floorHi would extend: one it overlaps or touches end to
  // end.
  elevatorToExtend(tile, floorLo, floorHi) {
    return this.transit.find(
      (t) =>
        t.kind === "elevator" &&
        tile >= t.tileStart &&
        tile < t.tileStart + TRANSIT_TYPES.elevator.width &&
        floorLo <= t.floorTop + 1 &&
        floorHi >= t.floorBottom - 1,
    );
  },

  // Growing a shaft up or down to floorBottom..floorTop. Only the new
  // floors are checked and paid for ($1k each); the car and anyone riding
  // or waiting carry on as before.
  canExtendElevator(t, floorBottom, floorTop) {
    const type = TRANSIT_TYPES.elevator;
    const added = t.floorBottom - floorBottom + (floorTop - t.floorTop);
    if (added <= 0) return { ok: false, reason: "Drag up or down from the shaft's end to extend it" };
    if (floorTop - floorBottom + 1 > type.maxFloors) {
      return { ok: false, reason: `An elevator can span at most ${type.maxFloors} floors` };
    }
    for (let floor = floorBottom; floor <= floorTop; floor++) {
      if (floor >= t.floorBottom && floor <= t.floorTop) continue; // already shaft
      for (let tile = t.tileStart; tile < t.tileStart + type.width; tile++) {
        if (!this.isFloorBuilt(floor, tile)) {
          return { ok: false, reason: "Build floor on every level it passes through first" };
        }
        const room = this.roomAt(floor, tile);
        if (room && !ROOM_TYPES[room.type].allowsTransit) {
          return { ok: false, reason: "Overlaps a room (only the lobby can share space)" };
        }
        if (this.transitAt(floor, tile)) {
          return { ok: false, reason: "Overlaps other stairs or an elevator" };
        }
      }
    }
    if (added * type.costPerFloor > this.money) return { ok: false, reason: "Not enough money" };
    return { ok: true, cost: added * type.costPerFloor };
  },

  extendElevator(t, floorBottom, floorTop) {
    const check = this.canExtendElevator(t, floorBottom, floorTop);
    if (!check.ok) return check;
    t.floorBottom = floorBottom;
    t.floorTop = floorTop;
    this.money -= check.cost;
    this.emit("transitChanged", t);
    return { ok: true };
  },

  // Demolishing refunds half the build cost. Free would make floor tiles a
  // way to launder money (build, demolish, rebuild for no reason); charging
  // the full cost again would make misclicks too punishing. A sold condo
  // refunds nothing (see roomRefund in rooms.js).
  //
  // Whatever is drawn on top goes first: transit (drawn over the lobby),
  // then a room, then the bare floor tile.
  demolishAt(floor, tile) {
    const transit = this.transitAt(floor, tile);
    if (transit) {
      this.transit = this.transit.filter((t) => t !== transit);
      this.money += transitCost(transit.kind, transit.floorBottom, transit.floorTop) / 2;
      this.emit("transitRemoved", transit);
      return { ok: true };
    }
    const room = this.roomAt(floor, tile);
    if (room) {
      this.rooms = this.rooms.filter((r) => r !== room);
      this.money += roomRefund(room);
      this.emit("roomRemoved", room);
      return { ok: true };
    }
    if (this.isFloorBuilt(floor, tile)) {
      // Stairs take up only their bottom floor, but people step off onto
      // the floor above, so that landing has to stay.
      if (this.stairsLandingAt(floor, tile)) {
        return { ok: false, reason: "Stairs land here: demolish the stairs first" };
      }
      this.floors.get(floor).delete(tile);
      this.money += FLOOR_COST_PER_TILE / 2;
      this.emit("floorsChanged", { floor });
      return { ok: true };
    }
    return { ok: false, reason: "Nothing here to demolish" };
  },

  formatMoney(amount) {
    const sign = amount < 0 ? "-" : "";
    return `${sign}$${Math.abs(Math.round(amount)).toLocaleString()}`;
  },
};

