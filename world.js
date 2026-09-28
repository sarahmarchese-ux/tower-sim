// The building itself: what floor tiles exist, what rooms sit where, and
// how much money the player has. Nothing in here knows about pixels, the
// camera, or the mouse — it only works in grid units (tiles and floors) and
// answers yes/no questions like "can I build this?". That separation means
// we can test or change these rules without touching any drawing code.

const World = {
  money: STARTING_MONEY,
  floors: new Map(), // floor number -> Set of built tile indices
  rooms: [], // { type: "sewing", floor: 0, tileStart: 3 }

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
    }

    if (type.cost > this.money) {
      return { ok: false, reason: "Not enough money" };
    }

    return { ok: true, tileEnd };
  },

  placeRoom(typeKey, floor, tileStart) {
    const check = this.canPlaceRoom(typeKey, floor, tileStart);
    if (!check.ok) return check;
    this.rooms.push({ type: typeKey, floor, tileStart });
    this.money -= ROOM_TYPES[typeKey].cost;
    return { ok: true };
  },

  // Demolishing refunds half the build cost. Free would make floor tiles a
  // way to launder money (build, demolish, rebuild for no reason); charging
  // the full cost again would make misclicks too punishing. Half is a
  // starting compromise — like everything else here, worth revisiting once
  // the economy milestone is tuning real numbers.
  demolishAt(floor, tile) {
    const room = this.roomAt(floor, tile);
    if (room) {
      this.rooms = this.rooms.filter((r) => r !== room);
      this.money += ROOM_TYPES[room.type].cost / 2;
      return { ok: true };
    }
    if (this.isFloorBuilt(floor, tile)) {
      this.floors.get(floor).delete(tile);
      this.money += FLOOR_COST_PER_TILE / 2;
      return { ok: true };
    }
    return { ok: false, reason: "Nothing here to demolish" };
  },

  formatMoney(amount) {
    const sign = amount < 0 ? "-" : "";
    return `${sign}$${Math.abs(Math.round(amount)).toLocaleString()}`;
  },
};
