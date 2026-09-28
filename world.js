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
// they exist. Every change also bumps `version`, a counter other modules can
// compare against to know when something they cached (like a route) might
// be out of date.

const World = {
  money: STARTING_MONEY,
  floors: new Map(), // floor number -> Set of built tile indices
  rooms: [], // { id, type: "sewing", floor: 0, tileStart: 3 }
  transit: [], // { id, kind: "stairs" | "elevator", tileStart, floorBottom, floorTop }
  version: 0,
  nextId: 1,
  listeners: [],

  subscribe(listener) {
    this.listeners.push(listener);
  },

  emit(event, payload) {
    this.version++;
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

  // The stairs or elevator shaft (if any) covering this tile on this floor.
  transitAt(floor, tile) {
    return this.transit.find((t) => {
      const width = TRANSIT_TYPES[t.kind].width;
      return (
        floor >= t.floorBottom &&
        floor <= t.floorTop &&
        tile >= t.tileStart &&
        tile < t.tileStart + width
      );
    });
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

  placeRoom(typeKey, floor, tileStart) {
    const check = this.canPlaceRoom(typeKey, floor, tileStart);
    if (!check.ok) return check;
    const room = { id: this.nextId++, type: typeKey, floor, tileStart };
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

  // Demolishing refunds half the build cost. Free would make floor tiles a
  // way to launder money (build, demolish, rebuild for no reason); charging
  // the full cost again would make misclicks too punishing. Half is a
  // starting compromise — like everything else here, worth revisiting once
  // the economy milestone is tuning real numbers.
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
      this.money += ROOM_TYPES[room.type].cost / 2;
      this.emit("roomRemoved", room);
      return { ok: true };
    }
    if (this.isFloorBuilt(floor, tile)) {
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
