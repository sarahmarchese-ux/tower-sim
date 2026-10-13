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
  "shops", "cafes", "restaurants", "hotels", "housekeeping", "security", "parking", "ratings", "save",
];
const SOURCE = FILES.map((f) => fs.readFileSync(path.join(ROOT, `${f}.js`), "utf8")).join("\n;\n");
// The game's objects are top-level `const`s, which a sandbox doesn't expose
// as properties, so the script hands them over itself.
const EXPORTS = `
;globalThis.G = { Grid, Clock, World, Routing, Elevators, People, Economy, Stress, Shops, Cafes, Restaurants,
  Hotels, Housekeeping, Security, Parking, Ratings, SaveGame, ROOM_TYPES, TRANSIT_TYPES, ELEVATOR_CAPACITY,
  RESTAURANT_SEATS, SAVE_KEY, MINUTES_PER_DAY };`;

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
