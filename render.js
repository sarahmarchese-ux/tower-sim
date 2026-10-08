// Draws everything: the grid itself (floor lines, tile columns, the ground,
// a ruler of floor numbers — milestone 1), what's been built on it and a
// live preview of what the selected tool would do next (milestone 2), and
// the stairs, elevators and people moving through it (milestone 4), and
// which rooms are still empty plus the money floating up from rent, sales
// and upkeep (milestone 5), how stressed everyone is (milestone 6), and
// which shops are open and who's carrying a shopping bag (milestone 8), and
// which hotel rooms have guests and who's carrying a suitcase (milestone 9),
// and which hotel rooms need cleaning, whether the guards are on duty and
// which floors they cover (milestone 12).
// This file only draws; World (world.js), Elevators and People decide what's
// true, and input.js decides what the player is doing.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// How many floors/tiles to draw above and below/around whatever's on
// screen. A little slack means fast scrolling never shows a blank edge.
const DRAW_MARGIN_FLOORS = 2;
const DRAW_MARGIN_TILES = 2;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
}

function draw() {
  const w = canvas.width;
  const h = canvas.height;

  drawSky(w, h);
  drawFloorLines(w, h);
  drawTileLines(w, h);
  drawGroundHighlight(w, h);
  drawBuiltFloors(w, h);
  drawRooms(w, h);
  drawTransit(w, h);
  drawPeople(w, h);
  drawSecurityCoverage(w, h);
  drawMoneyPopups(w, h);
  drawHoverPreview(w, h);
  drawFloorLabels(h);
  UI.updateMoney();
  UI.updateClock();
  UI.updatePopulation();
  UI.updateInspect();
}

// Sky color keyframes through the day, keyed by hour. Drawn colors between
// two keyframes are interpolated, so the sky shifts continuously rather
// than snapping. The first and last keyframe (0 and 24) share the same
// colors, so the cycle wraps around midnight without a visible seam.
const SKY_KEYFRAMES = [
  { hour: 0, top: "#0b1026", bottom: "#1b2550" }, // midnight
  { hour: 5, top: "#2b3a67", bottom: "#e8935f" }, // dawn
  { hour: 7, top: "#4a90d9", bottom: "#bfe3f7" }, // morning
  { hour: 12, top: "#4a90d9", bottom: "#bfe3f7" }, // midday
  { hour: 17, top: "#4a80c9", bottom: "#e8935f" }, // dusk begins
  { hour: 19, top: "#2b3a67", bottom: "#5b4b8a" }, // dusk ends
  { hour: 21, top: "#0b1026", bottom: "#1b2550" }, // night
  { hour: 24, top: "#0b1026", bottom: "#1b2550" }, // wraps to midnight
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(hexA, hexB, t) {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function skyColorsAt(hour) {
  for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
    const a = SKY_KEYFRAMES[i];
    const b = SKY_KEYFRAMES[i + 1];
    if (hour >= a.hour && hour <= b.hour) {
      const t = (hour - a.hour) / (b.hour - a.hour);
      return { top: lerpColor(a.top, b.top, t), bottom: lerpColor(a.bottom, b.bottom, t) };
    }
  }
  return SKY_KEYFRAMES[0];
}

function drawSky(w, h) {
  const { top, bottom } = skyColorsAt(Clock.hour);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, top);
  sky.addColorStop(1, bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
}

// Horizontal lines, one per floor boundary, across the whole visible height.
function drawFloorLines(w, h) {
  const topFloor = Grid.yToFloor(Camera.y) + DRAW_MARGIN_FLOORS;
  const bottomFloor = Grid.yToFloor(Camera.y + h) - DRAW_MARGIN_FLOORS;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1;
  for (let floor = bottomFloor; floor <= topFloor; floor++) {
    const y = Camera.worldToScreenY(Grid.floorToY(floor));
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

// Vertical lines, one per tile boundary. Drawn faint so they read as a grid,
// not as walls — actual room walls come later.
function drawTileLines(w, h) {
  const leftTile = Grid.xToTile(Camera.x) - DRAW_MARGIN_TILES;
  const rightTile = Grid.xToTile(Camera.x + w) + DRAW_MARGIN_TILES;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  for (let tile = leftTile; tile <= rightTile; tile++) {
    const x = Camera.worldToScreenX(Grid.tileToX(tile));
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

// Ground level (the boundary between floor 0 and basement floor -1) gets a
// solid line and a tinted fill below it, so "underground" reads at a glance.
function drawGroundHighlight(w, h) {
  const groundY = Camera.worldToScreenY(Grid.floorToY(0));
  ctx.fillStyle = "rgba(107, 91, 74, 0.5)";
  ctx.fillRect(0, groundY, w, h - groundY);
  ctx.strokeStyle = "#6b5b4a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();
}

// A ruler of floor numbers down the left edge, like the original game's
// floor indicator. Makes it obvious which floor you're looking at while
// scrolling.
function drawFloorLabels(h) {
  const topFloor = Grid.yToFloor(Camera.y) + DRAW_MARGIN_FLOORS;
  const bottomFloor = Grid.yToFloor(Camera.y + h) - DRAW_MARGIN_FLOORS;

  ctx.fillStyle = "#ffffff";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let floor = bottomFloor; floor <= topFloor; floor++) {
    const yTop = Camera.worldToScreenY(Grid.floorToY(floor));
    const yBottom = Camera.worldToScreenY(Grid.floorToY(floor + 1));
    const label = floor >= 0 ? `${floor + 1}F` : `B${-floor}`;
    ctx.fillText(label, 6, (yTop + yBottom) / 2);
  }
}

// Built floor tiles get a light fill, so an empty-but-built tile reads
// differently from bare sky/grid before anything is placed on it.
function drawBuiltFloors(w, h) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  for (const [floor, tiles] of World.floors) {
    const yTop = Camera.worldToScreenY(Grid.floorToY(floor + 1));
    const yBottom = Camera.worldToScreenY(Grid.floorToY(floor));
    if (yBottom < 0 || yTop > h) continue; // whole floor off-screen
    for (const tile of tiles) {
      const x = Camera.worldToScreenX(Grid.tileToX(tile));
      if (x + Grid.TILE_SIZE < 0 || x > w) continue; // tile off-screen
      ctx.fillRect(x, yTop, Grid.TILE_SIZE, yBottom - yTop);
    }
  }
}

function drawRooms(w, h) {
  for (const room of World.rooms) {
    const type = ROOM_TYPES[room.type];
    const box = roomScreenBox(room, type);
    if (box.right < 0 || box.left > w || box.bottom < 0 || box.top > h) continue;

    // A room nobody has moved into yet is drawn faded, with a dashed
    // outline and a sign saying it's on the market.
    const empty = room.status === "vacant" || room.status === "movingIn" || room.status === "checkingIn";
    ctx.globalAlpha = empty ? 0.4 : 1;
    ctx.fillStyle = type.color;
    ctx.fillRect(box.left, box.top, box.width, box.height);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 1;
    if (empty) ctx.setLineDash([4, 3]);
    ctx.strokeRect(box.left, box.top, box.width, box.height);
    ctx.setLineDash([]);

    // Label near the top, leaving the lower half of the room for its people.
    ctx.fillStyle = "#2b2b2b";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(type.name, box.left + box.width / 2, box.top + 9, box.width - 6);
    if (empty) {
      const sign = room.status === "movingIn" ? "Moving in" : room.status === "checkingIn" ? "Checking in"
        : room.needsCleaning ? "Needs cleaning" : vacantLabel(type);
      ctx.font = "italic 10px sans-serif";
      ctx.fillText(sign, box.left + box.width / 2, box.top + 21, box.width - 6);
    } else if (isStorefront(room)) {
      // In the corner, clear of the shopkeeper standing in the middle.
      ctx.font = "italic 10px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(Shops.isOpen(room) ? "Open" : "Closed", box.left + 5, box.top + 22, box.width - 10);
      ctx.textAlign = "center";
    } else if (room.type === "security") {
      ctx.font = "italic 10px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(Security.onDuty(room) ? "On duty" : "Off duty", box.left + 5, box.top + 22, box.width - 10);
      ctx.textAlign = "center";
    }

    // A pink or red dot on rooms whose people are getting stressed, so
    // trouble spots stand out before the weekly review.
    const average = room.status === "occupied" ? Stress.roomAverage(room) : null;
    const band = average === null ? "calm" : Stress.band(average);
    if (band !== "calm") {
      ctx.fillStyle = STRESS_COLORS[band];
      ctx.beginPath();
      ctx.arc(box.left + 8, box.top + 9, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
      ctx.stroke();
    }

    // A red "!" on rooms nobody can get to from a lobby.
    if (type.tenants > 0 && !Routing.isReachable(room)) {
      ctx.fillStyle = "#c94444";
      ctx.beginPath();
      ctx.arc(box.right - 9, box.top + 9, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("!", box.right - 9, box.top + 9.5);
    }
  }
}

// Screen rectangle covering tiles [tileStart, tileEnd] on every floor from
// floorBottom to floorTop. Shared by transit, previews and anything else
// that spans a block of the grid.
function areaScreenBox(floorBottom, floorTop, tileStart, tileEnd) {
  const left = Camera.worldToScreenX(Grid.tileToX(tileStart));
  const right = Camera.worldToScreenX(Grid.tileToX(tileEnd + 1));
  const top = Camera.worldToScreenY(Grid.floorToY(floorTop + 1));
  const bottom = Camera.worldToScreenY(Grid.floorToY(floorBottom));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function drawTransit(w, h) {
  for (const t of World.transit) {
    const width = TRANSIT_TYPES[t.kind].width;
    // Stairs are one floor tall: the flight climbs within the floor it
    // starts on and lets people off on the floor above.
    const top = t.kind === "stairs" ? t.floorBottom : t.floorTop;
    const box = areaScreenBox(t.floorBottom, top, t.tileStart, t.tileStart + width - 1);
    if (box.right < 0 || box.left > w || box.bottom < 0 || box.top > h) continue;
    if (t.kind === "stairs") drawStairs(box);
    else drawElevator(t, box);
  }
}

// A light block with a zigzag of steps running from bottom-left to top-right.
function drawStairs(box) {
  ctx.fillStyle = "rgba(235, 235, 235, 0.95)";
  ctx.fillRect(box.left, box.top, box.width, box.height);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(box.left, box.top, box.width, box.height);

  const steps = 6;
  ctx.strokeStyle = "#7a7a7a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(box.left + 4, box.bottom - 2);
  for (let i = 0; i < steps; i++) {
    const x = box.left + 4 + ((box.width - 8) * (i + 1)) / steps;
    const y = box.bottom - 2 - ((box.height - 4) * (i + 1)) / steps;
    ctx.lineTo(x, box.bottom - 2 - ((box.height - 4) * i) / steps);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// A dark shaft with a mark at each floor, and the car wherever it is now.
function drawElevator(t, box) {
  ctx.fillStyle = "#4f555c";
  ctx.fillRect(box.left, box.top, box.width, box.height);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;
  for (let floor = t.floorBottom; floor <= t.floorTop + 1; floor++) {
    const y = Camera.worldToScreenY(Grid.floorToY(floor));
    ctx.beginPath();
    ctx.moveTo(box.left, y);
    ctx.lineTo(box.right, y);
    ctx.stroke();
  }

  const car = Elevators.cars.get(t.id);
  if (!car) return;
  const carTop = Camera.worldToScreenY(Grid.floorToY(car.floor + 1)) + 3;
  ctx.fillStyle = car.state === "doors" ? "#fff3c4" : "#d9d9d9";
  ctx.fillRect(box.left + 3, carTop, box.width - 6, Grid.FLOOR_HEIGHT - 6);
  ctx.strokeStyle = "#2b2b2b";
  ctx.strokeRect(box.left + 3, carTop, box.width - 6, Grid.FLOOR_HEIGHT - 6);
}

// Stress colours, as in SimTower: black when calm, pink when stressed,
// red when they're thinking of leaving.
const STRESS_COLORS = { calm: "#1e1e1e", pink: "#e8609e", red: "#d62828" };

// Little stick figures: a body and a head, standing on whatever floor
// they're on (fractional while riding or climbing). Riders are drawn inside
// their car rather than at their own x, so a full car looks full.
function drawPeople(w, h) {
  const riderX = new Map();
  for (const car of Elevators.cars.values()) {
    car.riders.forEach((rider, i) => riderX.set(rider.person, car.transit.tileStart + 0.6 + i * 0.4));
  }

  for (const person of People.list) {
    if (person.state === "offsite") continue;
    const tileX = riderX.get(person) ?? person.x;
    const x = Camera.worldToScreenX(Grid.tileToX(tileX));
    const feet = Camera.worldToScreenY(Grid.floorToY(person.floor)) - 3;
    if (x < -10 || x > w + 10 || feet < -20 || feet > h + 20) continue;

    ctx.fillStyle = STRESS_COLORS[Stress.band(person.stress)];
    ctx.fillRect(x - 2, feet - 9, 4, 9);
    ctx.beginPath();
    ctx.arc(x, feet - 12, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // A shopper who bought something carries a bag out.
    if (person.role === "shopper" && person.bought > 0 && person.room.type === "shop") {
      ctx.fillStyle = "#e07a2f";
      ctx.fillRect(x + 2, feet - 6, 4, 4);
    }

    // A housekeeper on a job carries a bucket.
    if (person.role === "housekeeper" && person.job) {
      ctx.fillStyle = "#3aa3c9";
      ctx.fillRect(x + 2, feet - 4, 4, 4);
    }

    // A hotel guest wheels a suitcase in when they check in, and out again
    // when they leave.
    if (person.role === "guest" && (!person.arrived || person.movingOut)) {
      ctx.fillStyle = "#3b5b92";
      ctx.fillRect(x + 3, feet - 7, 4, 7);
    }
  }
}

// Money labels ("+$1,600", "Sold +$30,000", "-$1,000") drift up from where
// the money came from, and fade out.
const POPUP_MS = 2500;
const POPUP_RISE_PX = 24;

function drawMoneyPopups(w, h) {
  const now = performance.now();
  Economy.popups = Economy.popups.filter((p) => now - p.bornAt < POPUP_MS);

  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of Economy.popups) {
    const age = (now - p.bornAt) / POPUP_MS;
    const x = Camera.worldToScreenX(Grid.tileToX(p.x));
    const y = Camera.worldToScreenY(Grid.floorToY(p.floor + 1)) - 6 - age * POPUP_RISE_PX;
    if (x < -60 || x > w + 60 || y < -20 || y > h + 20) continue;
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillText(p.text, x + 1, y + 1);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, x, y);
  }
  ctx.globalAlpha = 1;
}

// What an empty room's sign says: condos are sold, studios rented, a shop
// is waiting for someone to run it, a hotel room for its next guests, and
// a service room for its staff.
function vacantLabel(type) {
  if (type.salePrice) return "For sale";
  if (type.role === "guest") return "Vacancy";
  if (type.role === "shopkeeper") return "Vacant";
  if (type.role === "housekeeper" || type.role === "guard") return "Hiring";
  return "For rent";
}

// Hovering a Security office, or holding the Security tool, shades the
// floors it protects (its own and `reach` above and below): every
// office's, and the one about to be placed.
function drawSecurityCoverage(w, h) {
  const hovered = Pointer.floor !== null && World.roomAt(Pointer.floor, Pointer.tile);
  let floors = [];
  if (Tool.current === "security") {
    floors = World.rooms.filter((room) => room.type === "security").map((room) => room.floor);
    if (Pointer.floor !== null) floors.push(Pointer.floor);
  } else if (hovered && hovered.type === "security") {
    floors = [hovered.floor];
  }
  if (!floors.length) return;
  const reach = ROOM_TYPES.security.reach;
  const covered = new Set();
  for (const floor of floors) for (let f = floor - reach; f <= floor + reach; f++) covered.add(f);
  ctx.fillStyle = "rgba(90, 140, 230, 0.12)";
  for (const floor of covered) {
    const top = Camera.worldToScreenY(Grid.floorToY(floor + 1));
    const bottom = Camera.worldToScreenY(Grid.floorToY(floor));
    if (bottom < 0 || top > h) continue;
    ctx.fillRect(0, top, w, bottom - top);
  }
}

function roomScreenBox(room, type) {
  const tileEnd = room.tileStart + type.width - 1;
  const left = Camera.worldToScreenX(Grid.tileToX(room.tileStart));
  const right = Camera.worldToScreenX(Grid.tileToX(tileEnd + 1));
  const top = Camera.worldToScreenY(Grid.floorToY(room.floor + 1));
  const bottom = Camera.worldToScreenY(Grid.floorToY(room.floor));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

// What the currently selected tool would do at the mouse's current
// position, colored green if it's a legal move and red if it isn't — so you
// find out a placement is invalid before you click, not after.
function drawHoverPreview(w, h) {
  Pointer.buildCheck = null; // set below by the tools that can be refused
  Pointer.buildNote = null; // a line about what the click would do, if worth saying
  if (Pointer.tile === null || Pointer.floor === null) return;

  if (Tool.current === "floor") {
    const floor = Pointer.dragging ? Pointer.dragStartFloor : Pointer.floor;
    const start = Pointer.dragging ? Math.min(Pointer.dragStartTile, Pointer.tile) : Pointer.tile;
    const end = Pointer.dragging ? Math.max(Pointer.dragStartTile, Pointer.tile) : Pointer.tile;
    const affordable = World.floorRunCost(floor, start, end) <= World.money;
    if (!affordable) Pointer.buildCheck = { ok: false, reason: "Not enough money to build that floor" };
    drawAreaPreview(floor, floor, start, end, affordable);
    return;
  }

  if (Tool.current === "demolish") {
    const onTop = World.transitAt(Pointer.floor, Pointer.tile) || World.roomAt(Pointer.floor, Pointer.tile);
    const landing = !onTop && World.stairsLandingAt(Pointer.floor, Pointer.tile);
    if (landing) Pointer.buildCheck = { ok: false, reason: "Stairs land here: demolish the stairs first" };
    const hasTarget = onTop || (!landing && World.isFloorBuilt(Pointer.floor, Pointer.tile));
    drawAreaPreview(Pointer.floor, Pointer.floor, Pointer.tile, Pointer.tile, !!hasTarget);
    return;
  }

  if (Tool.current === "stairs") {
    const width = TRANSIT_TYPES.stairs.width;
    const tile = stairsTileAt(Pointer.floor, Pointer.tile);
    const check = World.canPlaceTransit("stairs", tile, Pointer.floor, Pointer.floor + 1);
    Pointer.buildCheck = check;
    drawAreaPreview(Pointer.floor, Pointer.floor, tile, tile + width - 1, check.ok);
    return;
  }

  if (Tool.current === "elevator") {
    const width = TRANSIT_TYPES.elevator.width;
    const plan = elevatorPlan();
    const check = elevatorPlanCheck(plan);
    Pointer.buildCheck = check;
    if (plan.extend && check.ok) {
      Pointer.buildNote = `Extend elevator to ${floorLabel(plan.bottom)}–${floorLabel(plan.top)}: ${World.formatMoney(check.cost)}`;
    }
    drawAreaPreview(plan.bottom, plan.top, plan.tile, plan.tile + width - 1, check.ok);
    return;
  }

  const type = ROOM_TYPES[Tool.current];
  if (!type) return;
  const check = World.canPlaceRoom(Tool.current, Pointer.floor, Pointer.tile);
  Pointer.buildCheck = check;
  const tileEnd = Pointer.tile + type.width - 1;
  drawAreaPreview(Pointer.floor, Pointer.floor, Pointer.tile, tileEnd, check.ok);
}

function drawAreaPreview(floorBottom, floorTop, tileStart, tileEnd, valid) {
  const box = areaScreenBox(floorBottom, floorTop, tileStart, tileEnd);
  ctx.fillStyle = valid ? "rgba(80, 200, 120, 0.35)" : "rgba(220, 70, 70, 0.35)";
  ctx.fillRect(box.left, box.top, box.width, box.height);
  ctx.strokeStyle = valid ? "#3ea45c" : "#c94444";
  ctx.lineWidth = 2;
  ctx.strokeRect(box.left, box.top, box.width, box.height);
}

window.addEventListener("resize", resize);
Camera.reset(window.innerWidth, window.innerHeight);
attachCameraControls(canvas);
attachBuildControls(canvas);
UI.attachToolbar();
UI.attachClockControls();
UI.attachGameOver();
UI.attachBanner();
UI.attachSaveControls();
UI.showHint(null);
resize();
