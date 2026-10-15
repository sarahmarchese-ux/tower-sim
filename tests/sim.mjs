// Simulation tests: the game's rules, checked without a browser. Run them
// with `npm run sim` (no install needed). They take a few seconds.
//
// Each test loads the game's logic files (everything but input, ui,
// render and main) into a fresh sandbox, with a seeded Math.random so a
// run is the same every time, and small stand-ins for the page (UI,
// Camera, localStorage). It then builds a tower through the game's own
// functions (World.placeRoom and so on) and checks what happens. The
// smoke test (tests/smoke.mjs) covers the page itself.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "grid", "clock", "rooms", "world", "routing", "elevators", "people", "economy", "stress",
  "shops", "cafes", "restaurants", "snackbars", "hotels", "housekeeping", "security", "parking", "ratings", "save",
];
const SOURCE = FILES.map((f) => fs.readFileSync(path.join(ROOT, `${f}.js`), "utf8")).join("\n;\n");
// The game's objects are top-level `const`s, which a sandbox doesn't expose
// as properties, so the script hands them over itself.
const EXPORTS = `
;globalThis.G = { Grid, Clock, World, Routing, Elevators, People, Economy, Stress, Shops, Cafes, Restaurants,
  SnackBars, Hotels, Housekeeping, Security, Parking, Ratings, SaveGame, ROOM_TYPES, TRANSIT_TYPES, ELEVATOR_CAPACITY,
  RESTAURANT_SEATS, CAFE_SEATS, SNACK_BAR_SEATS, SAVE_KEY, MINUTES_PER_DAY, RENT_LEVELS, parkingSpaces, roomWidth, roomCost };`;

// A new game, with `seed` for its dice.
function newGame(seed = 1) {
  let s = seed;
  const random = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const storage = () => {
    const items = new Map();
    return {
      getItem: (k) => (items.has(k) ? items.get(k) : null),
      setItem: (k, v) => items.set(k, String(v)),
      removeItem: (k) => items.delete(k),
    };
  };
  const ctx = {
    console,
    performance: { now: () => 0 },
    localStorage: storage(),
    sessionStorage: storage(),
    location: { reload() {} },
    Camera: { x: 0, y: 0 },
    UI: { announce() {}, showGameOver() {} },
    floorLabel: (f) => (f >= 0 ? `${f + 1}F` : `B${-f}`),
  };
  ctx.Math = Object.create(Math);
  ctx.Math.random = random;
  vm.createContext(ctx);
  vm.runInContext(SOURCE + EXPORTS, ctx);
  const G = ctx.G;
  G.ctx = ctx;
  G.reseed = (n) => (s = n);
  G.popups = [];
  const popup = G.Economy.popupOverRoom.bind(G.Economy);
  G.Economy.popupOverRoom = (room, text, color) => {
    G.popups.push(text);
    return popup(room, text, color);
  };
  // What main.js does each frame, in steps of a quarter of a game minute.
  G.run = (minutes) => {
    for (let left = minutes; left > 1e-9; left -= 0.25) {
      const step = Math.min(left, 0.25);
      G.Clock.advance(step);
      G.Elevators.update(step);
      G.People.update(step);
      G.Shops.update();
      G.Hotels.update();
      G.Security.update();
      G.Stress.update(step);
      G.Economy.update();
      G.Ratings.update();
    }
  };
  // Run until the clock reads this hour (0–24) on day `day` (0 = the first Monday).
  G.runTo = (day, hour) => G.run(day * G.MINUTES_PER_DAY + hour * 60 - G.Clock.totalMinutes);
  G.money = (amount) => (G.World.money = amount);
  return G;
}

// Every placement in a test is meant to work; one that doesn't is a failure.
function build(G, result, what) {
  if (!result.ok) throw new Error(`couldn't build ${what}: ${result.reason}`);
}
const room = (G, type) => G.World.rooms.find((r) => r.type === type);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let problems = 0;
let checks = 0;
function check(condition, message) {
  checks++;
  if (condition) return;
  problems++;
  console.error(`    FAIL: ${message}`);
}

// --- Elevators and stairs ---------------------------------------------------

// Two shafts from the lobby floor to 10F, cars up top, and one resident
// (P) queueing to go up. Dummy waiters fill out the queues.
function twoShafts() {
  const G = newGame();
  G.money(1e9);
  for (let f = 0; f <= 10; f++) G.World.buildFloorRun(f, 0, 60);
  build(G, G.World.placeRoom("lobby", 0, 20), "a lobby");
  build(G, G.World.placeTransit("elevator", 10, 0, 10), "shaft A");
  build(G, G.World.placeTransit("elevator", 34, 0, 10), "shaft B");
  build(G, G.World.placeRoom("condo", 10, 40), "a condo");
  const [A, B] = G.World.transit;
  const carA = G.Elevators.cars.get(A.id);
  const carB = G.Elevators.cars.get(B.id);
  carA.floor = carB.floor = 10;
  const condo = room(G, "condo");
  const P = {
    id: 999, role: "resident", room: condo, slot: 0, state: "waitingForElevator", movingIn: false, movingOut: false,
    stress: 0, floor: 0, x: A.tileStart + 0.5, idleUntil: 0, target: "room",
    tripWaitMinutes: 0, tripStairsMinutes: 0, tripStartedAt: 0,
  };
  P.route = G.Routing.plan([{ floor: 0, x: A.tileStart + 0.5 }], [{ floor: 10, x: G.People.homeX(P) }]);
  P.legIndex = P.route.legs.findIndex((l) => l.type === "elevator");
  G.People.list.push(P);
  const others = (car, n) => {
    for (let i = 0; i < n; i++) car.waiting.push({ person: { id: -1 }, floor: 0, dest: 10, direction: 1, since: 0 });
  };
  const mine = { person: P, floor: 0, dest: 10, direction: 1, since: 0 };
  return { G, A, B, carA, carB, P, others, mine };
}

test("someone at the front of a queue keeps their place", () => {
  const { G, carA, carB, P, others, mine } = twoShafts();
  carA.waiting.push(mine);
  others(carA, 19); // 19 joined after P...
  others(carB, 9); // ...and the other shaft has 9 waiting
  G.People.reconsiderQueue(P);
  check(carA.waiting[0] && carA.waiting[0].person === P, "P left the front of a queue for the back of another (PR #26's bug)");
  check(P.state === "waitingForElevator", `P is ${P.state}, not still waiting`);
});

test("someone at the back of a long queue switches to an empty shaft", () => {
  const { G, B, carA, P, others, mine } = twoShafts();
  others(carA, 30);
  carA.waiting.push(mine);
  G.People.reconsiderQueue(P);
  check(!carA.waiting.some((w) => w.person === P), "P stayed behind 30 people with an empty shaft nearby");
  check(P.route && P.route.legs.some((l) => l.transitId === B.id), "P's new route doesn't use the empty shaft");
});

test("each full carload ahead costs a round trip of the shaft", () => {
  const { G, A, carA, others } = twoShafts();
  const cost = (n) => {
    carA.waiting = [];
    others(carA, n);
    return G.Routing.boardCost(A, 0, 1);
  };
  const perPerson = cost(7) - cost(6);
  const fullLoad = cost(G.ELEVATOR_CAPACITY) - cost(G.ELEVATOR_CAPACITY - 1);
  check(perPerson > 0 && perPerson <= 5, `one more person within a carload added ${perPerson}, expected a little`);
  check(fullLoad > 50, `a full carload ahead added only ${fullLoad}, expected a round trip`);
});

test("a full car stops only to let people off", () => {
  const { G, carA } = twoShafts();
  carA.direction = -1;
  carA.waiting = [{ person: { id: -1 }, floor: 5, dest: 0, direction: -1, since: 0 }];
  carA.riders = Array.from({ length: G.ELEVATOR_CAPACITY }, () => ({ person: { id: -2 }, dest: 0 }));
  check(!G.Elevators.shouldStop(carA, 5), "a full car stopped for someone it couldn't take");
  carA.riders[0].dest = 5;
  check(G.Elevators.shouldStop(carA, 5), "a full car didn't stop for a rider getting off");
  carA.riders = carA.riders.slice(1);
  carA.riders.forEach((r) => (r.dest = 0));
  check(G.Elevators.shouldStop(carA, 5), "a car with room didn't stop for someone waiting");
});

test("stairs for a short hop, an elevator for a long one, stairs into a basement", () => {
  const G = newGame();
  G.money(1e9);
  G.Ratings.stars = 3;
  for (let f = -1; f <= 6; f++) build(G, G.World.buildFloorRun(f, 0, 40), `floor ${f}`);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeTransit("stairs", 20, 0, 1), "stairs up");
  build(G, G.World.placeTransit("stairs", 30, -1, 0), "stairs down");
  build(G, G.World.placeTransit("elevator", 36, 0, 6), "an elevator");
  const kinds = (route) => route.legs.filter((l) => l.type !== "walk").map((l) => l.type).join(",");
  check(kinds(G.Routing.plan([{ floor: 0, x: 22 }], [{ floor: 1, x: 22 }])) === "stairs", "one floor up didn't take the stairs");
  check(kinds(G.Routing.plan([{ floor: 0, x: 34 }], [{ floor: 6, x: 34 }])) === "elevator", "six floors up didn't take the elevator");
  check(kinds(G.Routing.plan([{ floor: -1, x: 10 }], [{ floor: 0, x: 10 }])) === "stairs", "B1 to the lobby didn't take the stairs");

  // And makers on 1F really climb them, and feel it.
  build(G, G.World.placeRoom("sewing", 1, 24), "a studio on 1F, by the stairs");
  let climbs = 0;
  const finished = G.Stress.onTripFinished.bind(G.Stress);
  G.Stress.onTripFinished = (person, trip, stairs, wait) => {
    if (stairs > 0) climbs++;
    return finished(person, trip, stairs, wait);
  };
  G.runTo(2, 19); // to Wednesday evening
  check(climbs > 0, "nobody ever climbed the stairs to the 1F studio");
});

// --- Money ------------------------------------------------------------------

test("rent, payday, upkeep and wages at midnight", () => {
  const G = newGame();
  G.money(1e6);
  G.Ratings.stars = 2;
  for (let f = 0; f <= 2; f++) G.World.buildFloorRun(f, 0, 59);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeTransit("elevator", 20, 0, 2), "an elevator");
  build(G, G.World.placeRoom("sewing", 1, 30), "a studio");
  build(G, G.World.placeRoom("housekeeping", 2, 30), "Housekeeping");
  build(G, G.World.placeRoom("security", 2, 40), "a Security office");
  const studio = room(G, "sewing");
  const housekeeping = room(G, "housekeeping");
  G.World.setRoomStatus(studio, "occupied");
  G.World.setRoomStatus(housekeeping, "occupied"); // Security stays unstaffed
  studio.rentOwed = 0;

  G.Economy.lastTallyDay = 1; // the tally for the night into Tuesday
  let before = G.World.money;
  G.Economy.tally();
  const day = G.World.money - before;
  check(day === -1000 - 500, `a weekday midnight moved money by ${day}: expected -$1,000 upkeep and -$500 wages (none for unstaffed Security)`);
  check(Math.abs(studio.rentOwed - 11200 / 7) < 1e-6, `a day's rent owed is ${studio.rentOwed}, expected ${11200 / 7}`);

  for (let d = 2; d <= 6; d++) {
    G.Economy.lastTallyDay = d;
    G.Economy.tally();
  }
  check(G.Economy.lastPayday === null, "rent was paid before the end of Sunday");
  before = G.World.money;
  G.Economy.lastTallyDay = 7; // the night into the second Monday: payday
  G.Economy.tally();
  check(G.Economy.lastPayday === 11200, `payday paid ${G.Economy.lastPayday}, expected a week's rent of $11,200`);
  check(G.World.money - before === 11200 - 1500, "payday's rent didn't reach the bank");
  check(studio.rentOwed === 0, "rent owed wasn't cleared at payday");
});

test("a condo sells when its residents move in, and isn't refunded once sold", () => {
  const G = newGame();
  G.money(1e6);
  G.World.buildFloorRun(0, 0, 59);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeRoom("condo", 0, 20), "a condo");
  build(G, G.World.placeRoom("condo", 0, 40), "another condo");
  const [sold, unsold] = G.World.rooms.filter((r) => r.type === "condo");
  G.World.setRoomStatus(sold, "movingIn");
  let before = G.World.money;
  G.Economy.onArrived(sold);
  check(G.World.money - before === 30000, `a condo sale paid ${G.World.money - before}, expected $30,000`);
  before = G.World.money;
  G.World.demolishAt(0, 45);
  check(G.World.money - before === 10000, `demolishing an unsold condo refunded ${G.World.money - before}, expected half its $20,000`);
  before = G.World.money;
  G.World.demolishAt(0, 25);
  check(G.World.money === before, `demolishing a sold condo refunded ${G.World.money - before}, expected nothing`);
});

test("the weekly review: red studios move out, quiet shops close", () => {
  const G = newGame();
  G.money(1e6);
  G.Ratings.stars = 2;
  G.World.buildFloorRun(0, 0, 59);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeRoom("sewing", 0, 20), "a studio");
  build(G, G.World.placeRoom("shop", 0, 30), "a shop");
  build(G, G.World.placeRoom("condo", 0, 40), "a condo");
  G.runTo(1, 12); // Tuesday noon: everyone's moved in
  const studio = room(G, "sewing");
  const shop = room(G, "shop");
  const condo = room(G, "condo");
  check([studio, shop, condo].every((r) => r.status === "occupied"), "the studio, shop and condo should be occupied by Tuesday noon");
  for (const p of G.People.list) if (p.room === studio || p.room === condo) p.stress = p.room === studio ? 90 : 10;
  shop.weekDays = 3;
  shop.weekSales = 3 * 100; // $100 a day, under the $700 line
  const money = G.World.money;
  G.Stress.weeklyReview();
  G.Shops.weeklyReview();
  check(studio.status === "vacant", "a studio whose makers are red didn't move out");
  check(condo.status === "occupied", "a calm condo moved out");
  check(shop.status === "vacant", "a shop taking $100 a day didn't close");
  check(G.popups.includes("Closed: too few shoppers"), `no "Closed: too few shoppers" message (got ${G.popups.slice(-3)})`);
  check(G.World.money === money, "moving a studio out or closing a shop shouldn't cost money");
});

test("hotel guests stay 1–3 nights, 1–2 if they arrive on a Friday or Saturday", () => {
  const G = newGame();
  G.money(1e6);
  G.Ratings.stars = 2;
  G.World.buildFloorRun(0, 0, 39);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeRoom("single", 0, 20), "a Single");
  const single = room(G, "single");
  const stays = (dayOfWeek) => {
    const nights = new Set();
    for (let i = 0; i < 60; i++) {
      G.Clock.totalMinutes = dayOfWeek * G.MINUTES_PER_DAY + 15 * 60;
      G.People.list = [];
      G.World.setRoomStatus(single, "vacant");
      G.Hotels.checkIn(single, "buyer");
      nights.add(single.nights);
    }
    return [...nights].sort().join(",");
  };
  check(stays(1) === "1,2,3", `Tuesday arrivals stayed ${stays(1)} nights`);
  check(stays(4) === "1,2", `Friday arrivals stayed ${stays(4)} nights`);
});

// --- Break-ins and Security -------------------------------------------------

test("break-ins come at night from 2★, and never under guard", () => {
  const G = newGame();
  G.money(1e6);
  for (let f = 0; f <= 1; f++) G.World.buildFloorRun(f, 0, 59);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeTransit("stairs", 20, 0, 1), "stairs");
  build(G, G.World.placeRoom("jewellery", 0, 30), "a jewellery studio");
  const studio = room(G, "jewellery");
  let robbed = 0;
  const breakIn = G.Security.breakIn.bind(G.Security);
  G.Security.breakIn = (r) => {
    const message = breakIn(r);
    if (message) {
      robbed++;
      check(G.Clock.hour < 5, `a break-in at ${G.Clock.hour.toFixed(1)}h, outside midnight–5am`);
    }
    return message;
  };
  // Load the dice: every night is a break-in night.
  const random = G.ctx.Math.random;
  const loaded = () => (G.ctx.Math.random = () => 0);

  loaded();
  G.Security.update(); // 1★, 6am: nothing
  G.ctx.Math.random = random;
  G.runTo(1, 23);
  loaded();
  G.runTo(2, 6);
  G.ctx.Math.random = random;
  check(robbed === 0, "a break-in happened at 1★");

  G.Ratings.stars = 2;
  loaded();
  G.runTo(3, 6);
  G.ctx.Math.random = random;
  check(robbed === 1, `one loaded night at 2★ with no guards gave ${robbed} break-ins, expected 1`);

  // A Security office upstairs, its guards in: loaded nights rob nothing.
  build(G, G.World.placeRoom("security", 1, 30), "a Security office");
  G.runTo(4, 23); // guards hired and on shift
  const office = room(G, "security");
  check(office.status === "occupied" && G.Security.onDuty(office), "the Security office's guards aren't on duty at 11pm");
  check(G.Security.warning(studio) === null, `a guarded studio still warns: ${G.Security.warning(studio)}`);
  loaded();
  G.runTo(7, 6);
  G.ctx.Math.random = random;
  check(robbed === 1, `under guard, ${robbed - 1} more break-ins happened`);

  // Guards who can't get to the office: the studio warns (PR #28).
  G.World.demolishAt(0, 21); // the stairs
  const warning = G.Security.warning(studio);
  check(/can't get to the Security office/.test(warning || ""), `no warning when the guards can't reach their office: ${warning}`);
});

// --- Shops, cafés and restaurants (PR #28) ----------------------------------

function shopTower() {
  const G = newGame();
  G.money(1e8);
  G.Ratings.stars = 3;
  for (let f = -1; f <= 6; f++) G.World.buildFloorRun(f, 0, 99);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeRoom("lobby", 0, 60), "a second lobby");
  build(G, G.World.placeTransit("elevator", 30, -1, 6), "an elevator");
  build(G, G.World.placeRoom("parking", -1, 40), "a car park");
  build(G, G.World.placeRoom("shop", 6, 40), "a shop");
  build(G, G.World.placeRoom("restaurant", 1, 40), "a restaurant");
  return G;
}

test("a keeper stays past closing until the last shopper has paid", () => {
  const G = shopTower();
  const shop = room(G, "shop");
  G.runTo(1, 18.5);
  const keeper = G.People.list.find((p) => p.role === "shopkeeper" && p.room === shop);
  check(keeper && G.Shops.isOpen(shop), "the shop isn't open at 6:30pm");
  keeper.leaveAt = 19 * 60;
  G.People.list = G.People.list.filter((p) => p.role !== "shopper");
  G.People.addShopper(shop, 100);
  const shopper = G.People.list.find((p) => p.role === "shopper");
  G.runTo(1, 18.95);
  check(shopper.state === "inRoom", `the shopper is ${shopper.state}, not browsing`);
  shopper.idleUntil = G.Clock.totalMinutes + 30; // still browsing at 7:15pm
  G.popups = [];
  G.runTo(1, 19.25);
  check(G.Shops.isOpen(shop), "the shop shut at closing time with a shopper still browsing");
  G.runTo(1, 20);
  check(shopper.bought === 100, `the late shopper spent ${shopper.bought}, expected their $100`);
  check(!G.popups.includes("No sale: closed"), "a shopper who came in before closing got \"No sale: closed\"");
  check(!G.Shops.isOpen(shop), "the shop stayed open after its last shopper paid");
});

test("visitors on their way hold their seats", () => {
  const G = shopTower();
  const restaurant = room(G, "restaurant");
  G.runTo(1, 18.5);
  G.People.list = G.People.list.filter((p) => p.role !== "shopper");
  for (let i = 0; i < G.RESTAURANT_SEATS; i++) G.People.addShopper(restaurant, 50);
  check(G.Shops.isFull(restaurant, false), "a restaurant with 40 diners just setting off isn't full");
  // A busy evening never seats more than 40.
  let most = 0;
  for (let t = 0; t < 4 * 60; t++) {
    G.run(1);
    const seated = G.Restaurants.seated(restaurant);
    most = Math.max(most, seated);
  }
  check(most <= G.RESTAURANT_SEATS, `the restaurant seated ${most}`);
});

test("when a shop closes, visitors on their way turn back", () => {
  const G = shopTower();
  const shop = room(G, "shop");
  G.runTo(1, 13);
  G.People.list = G.People.list.filter((p) => p.role !== "shopper");
  for (let i = 0; i < 3; i++) G.People.addShopper(shop, 100);
  G.run(2); // on their way up
  check(G.People.list.some((p) => p.role === "shopper" && p.target === "room" && p.state !== "inRoom"), "no shopper on their way");
  let browsing = 0;
  const arrived = G.Shops.onShopperArrived.bind(G.Shops);
  G.Shops.onShopperArrived = (p, felt) => {
    if (p.room === shop) browsing++;
    return arrived(p, felt);
  };
  G.Economy.moveOut(shop, "Closed");
  G.run(120);
  check(browsing === 0, `${browsing} shoppers browsed a closed shop`);
  check(!G.People.list.some((p) => p.role === "shopper" && p.room === shop), "shoppers for the closed shop are still about");
});

test("demolishing a lobby sends people out through another", () => {
  const G = newGame();
  G.money(1e8);
  for (let f = 0; f <= 4; f++) G.World.buildFloorRun(f, 0, 99);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeRoom("lobby", 0, 70), "a lobby by the studios");
  build(G, G.World.placeTransit("elevator", 50, 0, 4), "an elevator");
  for (let f = 1; f <= 4; f++) {
    build(G, G.World.placeRoom("sewing", f, 60), "a studio");
    build(G, G.World.placeRoom("pottery", f, 80), "a studio");
  }
  G.runTo(2, 17.3); // Wednesday, going home
  const leaving = () => G.People.list.filter((p) => p.route && p.target === "offsite");
  check(leaving().some((p) => p.route.goal.x === 80), "nobody was heading for the second lobby");
  G.World.demolishAt(0, 75);
  const stale = leaving().filter((p) => p.route.goal.x === 80).length;
  check(stale === 0, `${stale} people still head for the demolished lobby`);
});

// --- Building, basements and parking ----------------------------------------

test("basements: 3★, B10 at most, the right rooms, half back", () => {
  const G = newGame();
  G.money(1e8);
  G.Ratings.stars = 2;
  build(G, G.World.buildFloorRun(0, 0, 19), "the ground floor");
  check(!G.World.buildFloorRun(-1, 0, 19).ok, "a basement was dug at 2★");
  G.Ratings.stars = 3;
  const money = G.World.money;
  build(G, G.World.buildFloorRun(-1, 0, 19), "B1");
  check(money - G.World.money === 20 * 400, `digging 20 tiles cost ${money - G.World.money}, expected $8,000`);
  for (let f = -2; f >= -10; f--) build(G, G.World.buildFloorRun(f, 0, 19), `B${-f}`);
  check(!G.World.buildFloorRun(-11, 0, 19).ok, "B11 was dug");
  check(G.World.placeRoom("shop", -10, 0).ok, "a shop couldn't go on B10");
  check(!G.World.placeRoom("sewing", -1, 0).ok, "a studio went underground");
  check(!G.World.placeRoom("condo", -2, 0).ok, "a condo went underground");
  check(!G.World.placeRoom("single", -3, 0).ok, "a hotel room went underground");
  check(G.World.placeRoom("parking", -4, 0).ok, "Parking couldn't go on B4");
  build(G, G.World.buildFloorRun(1, 0, 19), "1F");
  check(!G.World.placeRoom("parking", 1, 0).ok, "Parking went above ground");
  const before = G.World.money;
  G.World.demolishAt(-5, 3);
  check(G.World.money - before === 200, `demolishing a basement tile refunded ${G.World.money - before}, expected $200`);
});

test("a car park nobody can get anywhere from says so", () => {
  const G = newGame();
  G.money(1e8);
  G.Ratings.stars = 3;
  G.World.buildFloorRun(0, 0, 59);
  G.World.buildFloorRun(-1, 0, 59);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeRoom("parking", -1, 20), "a car park");
  const carPark = room(G, "parking");
  check(/build one/.test(G.Parking.warning(carPark) || ""), `with no storefront, the warning reads: ${G.Parking.warning(carPark)}`);
  build(G, G.World.placeRoom("shop", 0, 40), "a shop");
  check(/can be reached from here/.test(G.Parking.warning(carPark) || ""), `cut off, the warning reads: ${G.Parking.warning(carPark)}`);
  build(G, G.World.placeTransit("stairs", 50, -1, 0), "stairs");
  check(G.Parking.warning(carPark) === null, `connected, the car park still warns: ${G.Parking.warning(carPark)}`);
});

// --- The Snack Bar (milestone 14) -------------------------------------------

// The plan's test tower: a lobby, two shops with a Snack Bar between them,
// a car park on B1, condos (one right over the Snack Bar), and hotel rooms
// with Housekeeping. (Makers and a full café have their own tower, below.)
function snackTower(seed = 1) {
  const G = newGame(seed);
  G.money(1e8);
  G.Ratings.stars = 3;
  for (let f = -1; f <= 6; f++) G.World.buildFloorRun(f, 0, 99);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeTransit("elevator", 24, -1, 6), "an elevator");
  build(G, G.World.placeTransit("stairs", 28, -1, 0), "stairs to B1");
  build(G, G.World.placeTransit("stairs", 28, 0, 1), "stairs to 1F");
  build(G, G.World.placeRoom("parking", -1, 40), "a car park");
  build(G, G.World.placeRoom("shop", 0, 32), "a shop");
  build(G, G.World.placeRoom("snackbar", 0, 42), "a Snack Bar");
  build(G, G.World.placeRoom("shop", 0, 50), "a second shop");
  build(G, G.World.placeRoom("condo", 1, 42), "a condo over the Snack Bar");
  build(G, G.World.placeRoom("condo", 5, 32), "a condo");
  build(G, G.World.placeRoom("condo", 5, 48), "a condo");
  build(G, G.World.placeRoom("condo", 5, 64), "a condo");
  for (let x = 32; x < 92; x += 6) build(G, G.World.placeRoom("single", 6, x), "a Single");
  build(G, G.World.placeRoom("housekeeping", 6, 92), "Housekeeping");
  return G;
}

test("the Snack Bar unlocks at 3★ and goes where storefronts go, basements included", () => {
  const G = newGame();
  G.money(1e8);
  G.Ratings.stars = 2;
  build(G, G.World.buildFloorRun(0, 0, 59), "the ground floor");
  const locked = G.World.placeRoom("snackbar", 0, 0);
  check(!locked.ok && /Snack Bars unlock at 3★/.test(locked.reason), `at 2★ a Snack Bar: ${JSON.stringify(locked)}`);
  G.Ratings.stars = 3;
  build(G, G.World.buildFloorRun(-1, 0, 59), "B1");
  const money = G.World.money;
  build(G, G.World.placeRoom("snackbar", 0, 0), "a Snack Bar");
  check(money - G.World.money === 10000, `a Snack Bar cost ${money - G.World.money}, expected $10,000`);
  build(G, G.World.placeRoom("snackbar", -1, 0), "a Snack Bar on B1");
  const before = G.World.money;
  G.World.demolishAt(-1, 3);
  check(G.World.money - before === 5000, `demolishing a Snack Bar refunded ${G.World.money - before}, expected $5,000`);
});

test("shoppers stop for a snack after a shop next door (not one far away), and drivers come too", () => {
  const G = snackTower();
  const snackBar = room(G, "snackbar");
  let shopCheckouts = 0;
  const kinds = { walkIn: 0, driver: 0, afterShop: 0 };
  let afterShopMood = 0;
  const checkout = G.Shops.checkout.bind(G.Shops);
  G.Shops.checkout = (p) => {
    if (p.room.type === "shop") shopCheckouts++;
    return checkout(p);
  };
  const arrived = G.Shops.onShopperArrived.bind(G.Shops);
  G.Shops.onShopperArrived = (p, felt) => {
    arrived(p, felt);
    if (p.room !== snackBar) return;
    if (p.afterShop) {
      kinds.afterShop++;
      afterShopMood += p.mood;
    } else kinds[p.parking ? "driver" : "walkIn"]++;
  };
  G.runTo(1, 0);
  shopCheckouts = 0;
  afterShopMood = 0;
  for (const kind in kinds) kinds[kind] = 0;
  G.runTo(2, 0); // a whole Tuesday
  const share = kinds.afterShop / shopCheckouts;
  check(share > 0.2 && share < 0.45, `${kinds.afterShop} of ${shopCheckouts} shoppers stopped for a snack, expected about 1 in 3`);
  check(afterShopMood / kinds.afterShop > 0.95, `shoppers from next door spent ${Math.round((100 * afterShopMood) / kinds.afterShop)}% of their budget, not all of it`);
  check(kinds.walkIn >= 20 && kinds.walkIn <= 45, `${kinds.walkIn} walk-ins on a weekday, expected about 30 (every 20 minutes, 10am–8:30pm)`);
  check(kinds.driver > 0, "no drivers came to the Snack Bar");
  check(snackBar.salesYesterday >= 300 && snackBar.salesYesterday <= 1200, `the Snack Bar took ${snackBar.salesYesterday} on a weekday`);

  // Three floors up from the shops, it's no short detour.
  const H = newGame();
  H.money(1e8);
  H.Ratings.stars = 3;
  for (let f = 0; f <= 3; f++) H.World.buildFloorRun(f, 0, 79);
  build(H, H.World.placeRoom("lobby", 0, 0), "a lobby");
  build(H, H.World.placeTransit("elevator", 24, 0, 3), "an elevator");
  build(H, H.World.placeRoom("shop", 0, 32), "a shop");
  build(H, H.World.placeRoom("shop", 0, 50), "a second shop");
  build(H, H.World.placeRoom("snackbar", 3, 32), "a Snack Bar up on 4F");
  const far = room(H, "snackbar");
  H.runTo(1, 20);
  check(H.Shops.isOpen(far) && H.Shops.weekAverage(far) === null, "the far Snack Bar isn't open on its first full day");
  check(H.SnackBars.afterShopToday(far) === 0, `${H.SnackBars.afterShopToday(far)} shoppers went three floors up for a snack`);
  check(H.Shops.takingsToday() > 0 && far.till > 0, "nobody bought anything in the tower with a far Snack Bar");
});

test("makers eat at a Snack Bar only when the café is full, then go back to work", () => {
  // 44 makers on 2F–4F, and a café and a Snack Bar on 2F by the elevator.
  // The café seats 24, and its lunch crowd from outside takes some of those.
  const G = newGame();
  G.money(1e8);
  G.Ratings.stars = 3;
  for (let f = 0; f <= 3; f++) G.World.buildFloorRun(f, 0, 95);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeTransit("elevator", 24, 0, 3), "an elevator");
  build(G, G.World.placeRoom("cafe", 1, 28), "a café");
  build(G, G.World.placeRoom("snackbar", 1, 40), "a Snack Bar");
  for (let x = 48; x < 96; x += 8) build(G, G.World.placeRoom("sewing", 1, x), "a studio");
  for (let f = 2; f <= 3; f++) {
    for (let x = 28; x < 92; x += 8) build(G, G.World.placeRoom("sewing", f, x), "a studio");
  }
  const snackBar = room(G, "snackbar");
  const cafe = room(G, "cafe");
  const picks = [];
  const pick = G.Cafes.pick.bind(G.Cafes);
  G.Cafes.pick = (p) => {
    const full = !G.Shops.isOpen(cafe) || G.Cafes.seated(cafe) >= G.CAFE_SEATS;
    const chosen = pick(p);
    picks.push({ chosen, full });
    return chosen;
  };
  G.runTo(1, 11);
  const eating = new Map(); // maker -> minutes at the Snack Bar today
  const leftEarly = new Set(); // ...who headed back to work before their break was over
  for (let t = 0; t < 4 * 60; t++) {
    G.run(1);
    for (const p of G.People.list) {
      if (p.role !== "maker" || p.lunchCafe !== snackBar) continue;
      if (p.state === "eating") eating.set(p, (eating.get(p) || 0) + 1);
      const minute = G.Clock.totalMinutes % G.MINUTES_PER_DAY;
      if (eating.has(p) && p.route && p.target === "room" && minute < p.lunchAt + p.lunchMinutes) leftEarly.add(p);
    }
  }
  const toSnackBar = picks.filter((x) => x.chosen === snackBar);
  check(picks.some((x) => x.chosen === cafe), "no maker ate at the café");
  check(toSnackBar.length > 0, "no maker ate at the Snack Bar when the café was full");
  check(toSnackBar.every((x) => x.full), `${toSnackBar.filter((x) => !x.full).length} makers chose the Snack Bar while the café had a seat`);
  const longest = Math.max(...eating.values());
  check(longest <= 16, `a maker sat at the Snack Bar for ${longest} minutes, expected 10–15`);
  check(leftEarly.size > 0, "no maker headed back to their studio before their break was over (as they'd stay at a café)");
});

test("residents at weekends and hotel guests any day come down for lunch", () => {
  const G = snackTower();
  const snackBar = room(G, "snackbar");
  const seen = new Set();
  const byDay = { resident: [0, 0, 0, 0, 0, 0, 0], guest: [0, 0, 0, 0, 0, 0, 0] };
  const eating = new Map();
  for (let t = 0; t < 7 * G.MINUTES_PER_DAY; t++) {
    G.run(1);
    for (const p of G.People.list) {
      if (p.snackRoom !== snackBar || p.state !== "eating") continue;
      const key = `${p.id}:${G.Clock.day}`;
      eating.set(key, (eating.get(key) || 0) + 1);
      if (seen.has(key)) continue;
      seen.add(key);
      byDay[p.role][G.Clock.day % 7]++;
    }
  }
  const weekday = (counts) => counts.slice(0, 5).reduce((a, b) => a + b, 0);
  const weekend = (counts) => counts[5] + counts[6];
  check(weekday(byDay.resident) === 0, `residents came down for a snack on weekdays: ${byDay.resident}`);
  check(weekend(byDay.resident) > 0, "no resident came down for a snack at the weekend");
  check(weekday(byDay.guest) + weekend(byDay.guest) > 0, "no hotel guest came down for a snack all week");
  check(Math.max(...eating.values()) <= 16, `someone sat at the Snack Bar for ${Math.max(...eating.values())} minutes, expected 10–15`);
  check(snackBar.status === "occupied", "a busy Snack Bar closed at its first weekly review");
});

test("a Snack Bar is noisy 10am–9pm, every day, evenings included", () => {
  const G = snackTower();
  const condo = G.World.rooms.find((r) => r.type === "condo" && r.floor === 1);
  const at = (day, hour) => {
    G.runTo(day, hour);
    return G.Stress.noiseAt(condo);
  };
  check(at(5, 9.75) === 0, "the condo over the Snack Bar heard noise at 9:45am on Saturday");
  check(at(5, 10.5) === 1, "the condo over the Snack Bar heard no noise at 10:30am on Saturday");
  check(at(5, 20.75) === 1, "the condo over the Snack Bar heard no noise at 8:45pm on Saturday");
  check(at(5, 21.5) === 0, "the condo over the Snack Bar still heard noise at 9:30pm");
  check(G.Stress.noiseAt(condo, "working") === 1 && G.Stress.noiseAt(condo, "evening") === 1,
    "the condo's readout should show the Snack Bar's noise both in working hours and in the evening");
});

test("a quiet Snack Bar closes at the weekly review", () => {
  const G = snackTower();
  const snackBar = room(G, "snackbar");
  G.runTo(1, 12);
  check(snackBar.status === "occupied", "the Snack Bar isn't open by Tuesday noon");
  snackBar.weekDays = 3;
  snackBar.weekSales = 3 * 150; // $150 a day, under the $200 line
  G.Shops.weeklyReview();
  check(snackBar.status === "vacant", "a Snack Bar taking $150 a day didn't close");
  check(G.popups.includes("Closed: too few customers"), `no "Closed: too few customers" message (got ${G.popups.slice(-3)})`);
  G.run(30);
  check(!G.People.list.some((p) => p.room === snackBar), "customers or the keeper are still in a Snack Bar that closed half an hour ago");
});

test("closing a Snack Bar or restaurant moves only those eating there", () => {
  // Someone who had a snack at lunch still points at the Snack Bar at
  // dinner, and someone who dined last night still points at the
  // restaurant at lunch. Neither counts as seated there, nor is sent back
  // to their seat (to pay again) when it closes.
  const G = snackTower();
  build(G, G.World.placeRoom("restaurant", 0, 60), "a restaurant");
  const snackBar = room(G, "snackbar");
  const restaurant = room(G, "restaurant");
  G.runTo(5, 19.5); // Saturday evening
  const [A, B] = G.People.list.filter((p) => p.role === "resident" && p.state === "inRoom");
  const sitAt = (p, target, place) => {
    p.state = "eating";
    p.target = target;
    p.route = null;
    p.floor = place.floor;
    p.x = place.tileStart + 1;
    p.idleUntil = G.Clock.totalMinutes + 60;
  };
  Object.assign(A, { snackRoom: snackBar, snackDay: G.Clock.day, snackDoneAt: 0, dinnerRoom: restaurant, dinnerDay: G.Clock.day });
  sitAt(A, "restaurant", restaurant); // at dinner, after a snack at lunch
  Object.assign(B, { dinnerRoom: restaurant, dinnerDay: G.Clock.day - 1, snackRoom: snackBar, snackDay: G.Clock.day, snackDoneAt: G.Clock.totalMinutes + 60 });
  sitAt(B, "snack", snackBar); // at the Snack Bar, after dinner out last night
  check(G.SnackBars.snackersAt(snackBar) === 1, `the Snack Bar counts ${G.SnackBars.snackersAt(snackBar)} residents, expected 1 (not the one at dinner)`);
  check(G.Restaurants.dinersAt(restaurant) === 1, `the restaurant counts ${G.Restaurants.dinersAt(restaurant)} residents, expected 1 (not the one at the Snack Bar)`);
  G.World.demolishAt(0, 44);
  check(A.state === "eating" && A.target === "restaurant", `demolishing the Snack Bar moved a resident at dinner (${A.state}, ${A.target})`);
  check(B.state !== "eating", "a resident eating at the demolished Snack Bar stayed sat there");
  sitAt(B, "snack", { floor: 0, tileStart: 42 });
  G.World.demolishAt(0, 64);
  check(A.state !== "eating", "a resident at dinner in the demolished restaurant stayed sat there");
  check(B.state === "eating" && B.target === "snack", `demolishing the restaurant moved someone eating elsewhere (${B.state}, ${B.target})`);
});

test("a save reloads with someone mid-snack, and plays on the same", () => {
  const G = snackTower();
  const snackBar = room(G, "snackbar");
  G.runTo(5, 11.5); // Saturday lunchtime
  const snacking = () => G.People.list.find((p) => p.snackRoom === snackBar && p.state === "eating");
  for (let t = 0; t < 180 && !snacking(); t++) G.run(1);
  const P = snacking();
  check(P, "nobody was having a snack on Saturday lunchtime");
  if (!P) return;
  const strip = (text) => {
    const data = JSON.parse(text);
    delete data.savedAt;
    return JSON.stringify(data);
  };
  const text = G.SaveGame.exportText();
  const H = newGame();
  check(H.SaveGame.load(text), "the save didn't load");
  const Q = H.People.list.find((p) => p.id === P.id);
  check(Q && Q.state === "eating" && Q.snackRoom === H.World.rooms.find((r) => r.id === snackBar.id),
    "the reloaded snacker isn't eating at the Snack Bar");
  check(strip(H.SaveGame.exportText()) === strip(text), "the reloaded game saves differently from the original");
  G.reseed(42);
  H.reseed(42);
  G.run(60);
  H.run(60);
  check(strip(H.SaveGame.exportText()) === strip(G.SaveGame.exportText()), "after an hour the reloaded game had drifted from the original");
  check(Q.state !== "eating", "the reloaded snacker was still eating an hour later");
});

// --- Decorations, staff lifts, parking and rent (milestone 14b) -------------

test("a decoration keeps noise apart on its floor, and shafts go through it", () => {
  const G = newGame();
  G.money(1e7);
  for (let f = 0; f <= 2; f++) G.World.buildFloorRun(f, 0, 59);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeRoom("woodwork", 1, 10), "a woodwork studio, 10–21");
  build(G, G.World.placeRoom("bench", 1, 22), "a bench beside it, at 1★"); // unlocked from the start
  build(G, G.World.placeRoom("condo", 1, 26), "a condo beyond the bench");
  build(G, G.World.placeRoom("condo", 2, 6), "a condo above the studio");
  build(G, G.World.placeRoom("planterStrip", 2, 22, 4), "a planter strip beside that one");
  const studio = room(G, "woodwork");
  const [beside, above] = G.World.rooms.filter((r) => r.type === "condo");
  G.World.setRoomStatus(studio, "occupied");
  check(G.Stress.noiseAt(beside, "working") === 0, `a condo with a bench between it and a woodwork studio gets noise ${G.Stress.noiseAt(beside, "working")}`);
  check(G.Stress.noiseAt(above, "working") === 3, `the condo above the studio gets noise ${G.Stress.noiseAt(above, "working")}, expected 3`);

  // Stairs and an elevator go through decorations, as through the lobby.
  build(G, G.World.placeTransit("stairs", 22, 1, 2), "stairs through the bench");
  build(G, G.World.placeRoom("fountain", 0, 44), "a fountain");
  build(G, G.World.placeTransit("elevator", 46, 0, 2), "an elevator through the fountain");

  // Not in a basement, even at 3★.
  G.Ratings.stars = 3;
  build(G, G.World.buildFloorRun(-1, 0, 19), "B1");
  const below = G.World.placeRoom("planter", -1, 4);
  check(!below.ok && /above ground/.test(below.reason), `a planter in a basement: ${JSON.stringify(below)}`);

  // Half back: of a fountain's $40,000, and of what a planter strip cost.
  const strip = room(G, "planterStrip");
  check(G.roomWidth(strip) === 4 && G.roomCost(strip) === 20000, `a 4-tile planter strip is ${G.roomWidth(strip)} tiles for $${G.roomCost(strip)}`);
  let money = G.World.money;
  G.World.demolishAt(0, 44);
  check(G.World.money - money === 20000, `demolishing a fountain refunded ${G.World.money - money}`);
  money = G.World.money;
  G.World.demolishAt(2, 25);
  check(G.World.money - money === 10000, `demolishing a 4-tile planter strip refunded ${G.World.money - money}`);
});

// A tower with a staff lift right by the lobby, and the public elevator
// out at the far end: Housekeeping, a Security office and a studio up on
// 10F, hotel rooms on 5F.
function staffLiftTower() {
  const G = newGame();
  G.money(1e8);
  G.Ratings.stars = 2;
  for (let f = 0; f <= 10; f++) G.World.buildFloorRun(f, 0, 79);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeTransit("staffLift", 20, 0, 10), "a staff lift");
  build(G, G.World.placeTransit("elevator", 70, 0, 10), "an elevator");
  build(G, G.World.placeRoom("housekeeping", 10, 22), "Housekeeping");
  build(G, G.World.placeRoom("sewing", 10, 30), "a studio");
  build(G, G.World.placeRoom("security", 10, 38), "a Security office");
  for (let x = 22; x < 46; x += 6) build(G, G.World.placeRoom("single", 5, x), "a Single");
  return G;
}

test("housekeepers and guards ride a staff lift, and nobody else does", () => {
  const G = staffLiftTower();
  const [lift, elevator] = G.World.transit;
  const rode = { [lift.id]: new Set(), [elevator.id]: new Set() };
  let mostAboard = 0;
  const onBoard = G.People.onBoard.bind(G.People);
  G.People.onBoard = (person) => {
    for (const car of G.Elevators.cars.values()) {
      if (car.riders.some((r) => r.person === person)) rode[car.transit.id].add(person.role);
    }
    mostAboard = Math.max(mostAboard, G.Elevators.cars.get(lift.id).riders.length);
    return onBoard(person);
  };
  // Monday to Tuesday night: movers, the commute, guests and cleaning,
  // and the guards' night shift.
  for (const single of G.World.rooms.filter((r) => r.type === "single")) single.needsCleaning = true;
  G.runTo(1, 21);
  const staff = [...rode[lift.id]].sort().join(",");
  check(staff === "guard,housekeeper", `the staff lift carried: ${staff || "nobody"}`);
  check(rode[elevator.id].has("maker") && rode[elevator.id].has("guest"), `the public elevator carried: ${[...rode[elevator.id]]}`);
  check(mostAboard <= 4, `the staff lift's car held ${mostAboard}, more than 4`);
  const used = G.Elevators.staffToday(lift);
  check(used.housekeepers === 2 && used.guards === 2, `today the staff lift says ${used.housekeepers} housekeepers and ${used.guards} guards used it`);
  check(G.World.rooms.filter((r) => r.type === "single").some((r) => !r.needsCleaning), "no hotel room was cleaned");

  // Staff take the public elevator when it's the quicker way; nobody else
  // ever plans a staff lift, even right beside them.
  const shaft = (route) => route.legs.filter((l) => l.type === "elevator").map((l) => l.transitId).join(",");
  const farEnd = G.Routing.plan([{ floor: 0, x: 72 }], [{ floor: 10, x: 74 }], { staff: true });
  check(shaft(farEnd) === String(elevator.id), "a housekeeper at the far end didn't take the public elevator beside them");
  const byLift = G.Routing.plan([{ floor: 0, x: 20.5 }], [{ floor: 10, x: 21 }]);
  check(shaft(byLift) === String(elevator.id), "someone who isn't staff planned a trip on the staff lift");
  check(G.Routing.isReachable(room(G, "housekeeping")), "Housekeeping, reached by the staff lift, counts as unreachable");

  // A staff lift no service room's staff can get to says so.
  check(G.Elevators.staffCanReach(lift), "the staff lift by Housekeeping says no staff can reach it");
  for (let f = 0; f <= 1; f++) G.World.buildFloorRun(f, 100, 105);
  build(G, G.World.placeTransit("staffLift", 102, 0, 1), "a staff lift off on its own");
  check(!G.Elevators.staffCanReach(G.World.transit[2]), "a staff lift nobody can reach doesn't say so");
});

test("staff lifts: 2★, $10,000 + $500 a floor, $500 a day, 2 tiles", () => {
  const G = newGame();
  G.money(1e6);
  for (let f = 0; f <= 6; f++) G.World.buildFloorRun(f, 0, 39);
  const locked = G.World.placeTransit("staffLift", 10, 0, 4);
  check(!locked.ok && /unlock at 2★/.test(locked.reason), `a staff lift at 1★: ${JSON.stringify(locked)}`);
  G.Ratings.stars = 2;
  let money = G.World.money;
  build(G, G.World.placeTransit("staffLift", 10, 0, 4), "a staff lift, 1F–5F");
  check(money - G.World.money === 12500, `a 5-floor staff lift cost ${money - G.World.money}, expected $12,500`);
  build(G, G.World.placeTransit("stairs", 12, 0, 1), "stairs right beside it: it's 2 tiles wide");
  const lift = G.World.transit[0];
  money = G.World.money;
  build(G, G.World.extendElevator(lift, 0, 6), "the staff lift, extended to 7F");
  check(money - G.World.money === 1000, `extending a staff lift 2 floors cost ${money - G.World.money}`);
  check(G.World.elevatorToExtend(10, 7, 7) === undefined && G.World.elevatorToExtend(10, 7, 7, "staffLift") === lift,
    "an elevator drag would extend the staff lift, or a staff lift drag wouldn't");
  G.Economy.lastTallyDay = 1;
  money = G.World.money;
  G.Economy.tally();
  check(money - G.World.money === 500, `a staff lift's upkeep was ${money - G.World.money}, expected $500`);
});

test("car parks are priced per bay, and an old one keeps its size and price", () => {
  const G = newGame();
  G.money(1e7);
  G.Ratings.stars = 3;
  G.World.buildFloorRun(0, 0, 59);
  G.World.buildFloorRun(-1, 0, 59);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  check(!G.World.placeRoom("parking", -1, 0, 6).ok, "a car park of a bay and a half was built");
  let money = G.World.money;
  build(G, G.World.placeRoom("parking", -1, 0, 8), "2 bays of parking");
  const carPark = room(G, "parking");
  check(G.parkingSpaces(carPark) === 10, `2 bays have ${G.parkingSpaces(carPark)} spaces, expected 10`);
  check(money - G.World.money === 50000, `2 bays cost ${money - G.World.money}, expected $50,000`);
  money = G.World.money;
  G.World.demolishAt(-1, 3);
  check(G.World.money - money === 25000, `demolishing 2 bays refunded ${G.World.money - money}, expected $25,000`);

  // A car park from before (no width or price of its own): 16 tiles and
  // 20 spaces, and half its $20,000 back.
  const old = { id: G.World.nextId++, type: "parking", floor: -1, tileStart: 20, status: null };
  G.World.rooms.push(old);
  G.World.version++;
  check(G.roomWidth(old) === 16 && G.parkingSpaces(old) === 20, `an old car park is ${G.roomWidth(old)} tiles with ${G.parkingSpaces(old)} spaces`);
  check(G.World.roomAt(-1, 35) === old && !G.World.roomAt(-1, 36), "an old car park doesn't cover its 16 tiles");
  money = G.World.money;
  G.World.demolishAt(-1, 25);
  check(G.World.money - money === 10000, `demolishing an old car park refunded ${G.World.money - money}, expected $10,000`);
});

// A row of studios, a condo and Singles by the lobby, everyone moved in.
function rentTower() {
  const G = newGame();
  G.money(1e7);
  G.Ratings.stars = 2;
  G.World.buildFloorRun(0, 0, 99);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeRoom("sewing", 0, 20), "studio A");
  build(G, G.World.placeRoom("sewing", 0, 28), "studio B");
  build(G, G.World.placeRoom("sewing", 0, 36), "studio C");
  build(G, G.World.placeRoom("condo", 0, 44), "a condo");
  build(G, G.World.placeRoom("single", 0, 60), "a Single");
  build(G, G.World.placeRoom("single", 0, 66), "another Single");
  G.runTo(1, 12); // Tuesday noon: everyone's moved in
  const [A, B, C] = G.World.rooms.filter((r) => r.type === "sewing");
  return { G, A, B, C, condo: room(G, "condo") };
}

test("rent levels: studios pay and put up with stress by their level", () => {
  const { G, A, B, C } = rentTower();
  check([A, B, C].every((r) => r.status === "occupied"), "the studios should be occupied by Tuesday noon");
  G.Economy.setRentLevel(A, "low");
  G.Economy.setRentLevel(B, "high");
  for (const r of [A, B, C]) r.rentOwed = 0;
  G.Economy.lastTallyDay = 2;
  G.Economy.tally();
  check(Math.abs(A.rentOwed - (11200 * 0.8) / 7) < 1e-6, `a day's rent at Low is ${A.rentOwed}, expected 80%`);
  check(Math.abs(B.rentOwed - (11200 * 1.25) / 7) < 1e-6, `a day's rent at High is ${B.rentOwed}, expected 125%`);
  check(Math.abs(C.rentOwed - 11200 / 7) < 1e-6, `a day's rent at Normal is ${C.rentOwed}`);

  // At the review: stress 70 is fine at Low, not at Normal; 60 is too
  // much at High.
  for (const p of G.People.list) if (p.room === A || p.room === C) p.stress = 70;
  for (const p of G.People.list) if (p.room === B) p.stress = 60;
  G.Stress.weeklyReview();
  check(A.status === "occupied", "makers at stress 70 left a studio at Low rent (their line is 75)");
  check(B.status === "vacant", "makers at stress 60 stayed in a studio at High rent (their line is 55)");
  check(C.status === "vacant", "makers at stress 70 stayed in a studio at Normal rent");
  check(G.Stress.band(70) === "red", "stress 70 should still show red");
});

test("a condo sells and refunds at its level, and keeps its owners' line", () => {
  const G = newGame();
  G.money(1e6);
  G.World.buildFloorRun(0, 0, 59);
  build(G, G.World.placeRoom("lobby", 0, 0), "a lobby");
  build(G, G.World.placeRoom("condo", 0, 20), "a condo");
  const condo = room(G, "condo");
  G.Economy.setRentLevel(condo, "low");
  G.World.setRoomStatus(condo, "movingIn");
  let money = G.World.money;
  G.Economy.onArrived(condo);
  check(G.World.money - money === 24000, `a condo at Low sold for ${G.World.money - money}, expected $24,000`);
  G.Economy.setRentLevel(condo, "high"); // for the next sale
  G.People.moveIn(condo);
  for (const p of G.People.list) {
    p.movingIn = false;
    p.state = "inRoom";
    p.stress = 70;
  }
  G.Stress.weeklyReview();
  check(condo.status === "occupied", "owners who bought at Low (line 75) left at stress 70 after the level went up");
  for (const p of G.People.list) p.stress = 80;
  money = G.World.money;
  G.Stress.weeklyReview();
  check(condo.status === "vacant" && money - G.World.money === 24000, `the condo refunded ${money - G.World.money}, expected the $24,000 paid`);
  G.World.setRoomStatus(condo, "movingIn");
  money = G.World.money;
  G.Economy.onArrived(condo);
  check(G.World.money - money === 37500, `the next sale, at High, paid ${G.World.money - money}, expected $37,500`);
});

test("a hotel room at Very low books more often, earns less a night and keeps its guests longer", () => {
  const { G } = rentTower();
  const [cheap, normal] = G.World.rooms.filter((r) => r.type === "single");
  G.Economy.setRentLevel(cheap, "veryLow");
  G.Clock.totalMinutes = 8 * G.MINUTES_PER_DAY + 15 * 60; // a Tuesday afternoon
  const booked = (r) => {
    let n = 0;
    for (let i = 0; i < 2000; i++) if (G.Hotels.whoBooks(r)) n++;
    return n;
  };
  const cheapBooked = booked(cheap);
  const normalBooked = booked(normal);
  check(cheapBooked > normalBooked * 1.35, `a Very low room was booked ${cheapBooked} times in 2,000, a Normal one ${normalBooked}`);

  for (const r of [cheap, normal]) {
    G.World.setRoomStatus(r, "vacant");
    G.People.list = G.People.list.filter((p) => p.room !== r);
    G.Hotels.checkIn(r, "buyer");
    for (const p of G.People.list.filter((p) => p.room === r)) {
      p.arrived = true;
      p.state = "inRoom";
      p.stress = 70;
    }
    G.World.setRoomStatus(r, "occupied");
  }
  check(G.Hotels.rateFor(cheap) === 1200 && G.Hotels.rateFor(normal) === 2000, `nightly rates ${G.Hotels.rateFor(cheap)} and ${G.Hotels.rateFor(normal)}`);
  G.Economy.setRentLevel(cheap, "high"); // only from the next booking
  check(G.Hotels.rateFor(cheap) === 1200, "a new level changed the rate of a stay already booked");
  G.Hotels.update();
  check(cheap.status === "occupied", "guests at stress 70 left a room booked at Very low (their line is 85)");
  check(normal.status === "vacant", "guests at stress 70 stayed in a Normal room");
  check(Math.abs(G.Hotels.reviewFor(70, 20) - 0.3) < 1e-9 && G.Hotels.reviewFor(70) === 0, "a cheap room's review bands didn't move 20 points");
});

test("a studio whose makers left stressed sits empty for days; a rebuilt one re-lets in hours", () => {
  const { G, A, B } = rentTower();
  for (const p of G.People.list) if (p.room === A || p.room === B) p.stress = 90;
  G.Economy.setRentLevel(B, "low");
  const now = G.Clock.totalMinutes;
  G.Stress.weeklyReview();
  const days = (r) => (r.moveInAt - now) / G.MINUTES_PER_DAY;
  check(A.hardToLet && days(A) >= 1 && days(A) <= 3, `a studio whose makers left stressed re-lets in ${days(A).toFixed(2)} days`);
  check(B.hardToLet && days(B) >= 0.5 && days(B) <= 1.5, `at Low rent it re-lets in ${days(B).toFixed(2)} days, expected half of 1–3`);
  G.Economy.setRentLevel(A, "veryLow");
  check(days(A) >= 0.25 && days(A) <= 0.75, `cutting the rent to Very low didn't bring the new tenants sooner (${days(A).toFixed(2)} days)`);
  G.run(6 * 60);
  check(A.status === "vacant", "a hard-to-let studio filled within 6 hours");

  // Knocked down and built again, it's a new room: hours, not days.
  G.World.demolishAt(0, A.tileStart);
  build(G, G.World.placeRoom("sewing", 0, 20), "the studio, rebuilt");
  const rebuilt = G.World.roomAt(0, 20);
  const hours = (rebuilt.moveInAt - G.Clock.totalMinutes) / 60;
  check(!rebuilt.hardToLet && hours >= 1 && hours <= 4, `a rebuilt studio re-lets in ${hours.toFixed(1)} hours`);
});

// --- Saving -----------------------------------------------------------------

test("a save reloads to exactly the same game, which plays on the same", () => {
  const G = shopTower();
  for (let f = 2; f <= 5; f++) {
    build(G, G.World.placeRoom("condo", f, 0), "a condo");
    build(G, G.World.placeRoom("sewing", f, 70), "a studio");
  }
  build(G, G.World.placeTransit("stairs", 34, 0, 1), "stairs");
  G.runTo(2, 17.5); // Wednesday rush hour: queues, rides, climbs, tills, rent owed
  const strip = (text) => {
    const data = JSON.parse(text);
    delete data.savedAt;
    return JSON.stringify(data);
  };
  const text = G.SaveGame.exportText();
  const H = newGame();
  check(H.SaveGame.load(text), "the save didn't load");
  check(strip(H.SaveGame.exportText()) === strip(text), "the reloaded game saves differently from the original");
  G.reseed(42);
  H.reseed(42);
  G.run(90);
  H.run(90);
  check(strip(H.SaveGame.exportText()) === strip(G.SaveGame.exportText()), "after 90 more minutes the reloaded game had drifted from the original");
});

test("a save that won't load is kept, and tabs can tell their saves apart", () => {
  const G = newGame();
  const future = JSON.stringify({ version: 99, from: "a newer game" });
  G.ctx.localStorage.setItem(G.SAVE_KEY, future);
  check(!G.SaveGame.load(), "a save from a newer version loaded");
  check(G.SaveGame.keepUnloadable(), "the unloadable save wasn't kept");
  check(G.SaveGame.unloadableText() === future, "the kept save isn't the one that wouldn't load");

  check(G.SaveGame.save(), "saving failed");
  check(!G.SaveGame.changedElsewhere(), "this tab's own save counts as another tab's");
  G.ctx.localStorage.setItem("tower-sim-saved-by", "another-tab");
  check(G.SaveGame.changedElsewhere(), "another tab's save counts as this tab's");
  G.SaveGame.otherTab = true;
  check(!G.SaveGame.save(), "a tab whose save another tab replaced saved over it");
});

// A real tower: Sarah's own 3★ game from day 85 (14 floors, about 300
// people, nine elevators, four car parks). Any change that stops a player's
// save from loading, or breaks a big tower once it's running, shows up here.
test("a real 3★ tower (the day-85 save) loads and plays a day", () => {
  const text = fs.readFileSync(path.join(ROOT, "tests", "saves", "day-85.json"), "utf8");
  const G = newGame();
  check(G.SaveGame.load(text), "the day-85 save didn't load");
  const strip = (saved) => {
    const data = JSON.parse(saved);
    delete data.savedAt;
    return JSON.stringify(data);
  };
  check(strip(G.SaveGame.exportText()) === strip(text), "the day-85 save saves differently once loaded");
  check(G.Ratings.stars === 3, `the day-85 tower is ${G.Ratings.stars}★, not 3★`);
  const money = G.World.money;
  const day = G.Clock.day;
  G.runTo(day, 22); // Monday: the morning rush, lunch, the evening rush and dinner
  const carParks = G.World.rooms.filter((r) => r.type === "parking");
  const drivers = carParks.reduce((sum, r) => sum + G.Parking.driversToday(r), 0);
  check(drivers > 0, "no drivers came to the day-85 tower's car parks");
  G.runTo(day + 1, 1); // past the midnight tally
  check(G.Economy.lastSales > 0, "the day-85 tower's shops sold nothing");
  check(G.World.money > money, `the day-85 tower lost money in a day (${money} -> ${G.World.money})`);
  check(G.People.population() > 250, `the day-85 tower dropped to ${G.People.population()} people in a day`);
  check(G.Ratings.stars === 3, "the day-85 tower lost its third star");
});

// The same tower, with milestone 14b's additions: its four car parks keep
// their size and price, and with a staff lift, decorations, a new car park
// and rent levels added it saves and reloads the same, and plays on.
test("the day-85 tower with a staff lift, decorations and rent levels plays on", () => {
  const text = fs.readFileSync(path.join(ROOT, "tests", "saves", "day-85.json"), "utf8");
  const G = newGame();
  check(G.SaveGame.load(text), "the day-85 save didn't load");
  const carParks = G.World.rooms.filter((r) => r.type === "parking");
  check(carParks.length === 4 && carParks.every((r) => G.parkingSpaces(r) === 20 && G.roomCost(r) === 20000),
    "the day-85 car parks aren't 20 spaces at $20,000 each");
  // A staff lift up a new column at the right-hand end, beside the hotel
  // rooms; a planter strip; a 2-bay car park; studios at Low on 10F and
  // hotel rooms at High on 7F.
  for (let f = -1; f <= 8; f++) build(G, G.World.buildFloorRun(f, 72, 75), `floor at the end of ${f}`);
  build(G, G.World.placeTransit("staffLift", 72, 0, 8), "a staff lift");
  build(G, G.World.placeRoom("planterStrip", 8, 74, 2), "a planter strip beside the staff lift");
  build(G, G.World.placeRoom("parking", -1, -68, 8), "2 bays of parking");
  for (const r of G.World.rooms.filter((r) => r.floor === 9 && G.ROOM_TYPES[r.type].role === "maker")) G.Economy.setRentLevel(r, "low");
  for (const r of G.World.rooms.filter((r) => r.floor === 6 && (r.type === "single" || r.type === "twin"))) G.Economy.setRentLevel(r, "high");
  const day = G.Clock.day;
  const money = G.World.money;
  G.runTo(day, 22);
  const strip = (saved) => {
    const data = JSON.parse(saved);
    delete data.savedAt;
    return JSON.stringify(data);
  };
  const saved = G.SaveGame.exportText();
  const H = newGame();
  check(H.SaveGame.load(saved), "the day-85 tower with 14b's additions didn't load");
  check(strip(H.SaveGame.exportText()) === strip(saved), "the day-85 tower with 14b's additions saves differently once loaded");
  G.runTo(day + 1, 1);
  check(G.World.money > money - 150000, `the day-85 tower lost ${money - G.World.money} in a day`);
  check(G.People.population() > 250, `the day-85 tower dropped to ${G.People.population()} people in a day`);
  check(G.Ratings.stars === 3, "the day-85 tower lost its third star");
});

// --- Run --------------------------------------------------------------------

const started = Date.now();
for (const { name, fn } of tests) {
  console.log(`- ${name}`);
  try {
    fn();
  } catch (e) {
    problems++;
    console.error(`    FAIL: ${e.stack}`);
  }
}
const seconds = ((Date.now() - started) / 1000).toFixed(1);
if (problems) {
  console.error(`\nSimulation tests FAILED (${problems} problem${problems === 1 ? "" : "s"}, ${tests.length} tests, ${seconds}s)`);
  process.exit(1);
}
console.log(`\nSimulation tests passed (${tests.length} tests, ${checks} checks, ${seconds}s)`);
