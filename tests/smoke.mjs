// Smoke test: opens the game in a headless browser, plays a short scripted
// session, and fails if anything breaks. Run it with `npm run smoke`
// (after `npm install` and, the first time, `npx playwright install chromium`).
//
// The game has no test hooks. Its scripts declare top-level `const`s (World,
// Clock, ...), which page.evaluate can read by name, so the script reads game
// state directly and clicks the real toolbar and canvas to build.
//
// Set CHROMIUM_PATH to use an already-installed Chromium.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STEP_TIMEOUT_MS = 30_000;
const SIM_DAYS = 8; // enough to cross a Sunday-night payday and weekly review

const MIME = { ".html": "text/html", ".js": "text/javascript" };

function serve() {
  const server = http.createServer((req, res) => {
    const name = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
    const file = path.join(ROOT, path.normalize(name));
    if (name === "/favicon.ico") {
      res.writeHead(204).end(); // the game has no icon; don't count the browser asking for one as an error
      return;
    }
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const problems = [];
function fail(message) {
  problems.push(message);
  console.error(`  FAIL: ${message}`);
}
function check(condition, message) {
  if (!condition) fail(message);
}

// A step that times out may still be running in the page (page.evaluate
// can't be cancelled), so the steps after it are skipped rather than run
// beside it and fail for its reasons.
let timedOut = false;
async function step(name, fn) {
  console.log(`- ${name}`);
  if (timedOut) {
    fail(`${name}: skipped, after a step timed out`);
    return;
  }
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${STEP_TIMEOUT_MS / 1000}s`)), STEP_TIMEOUT_MS);
  });
  try {
    await Promise.race([fn(), timeout]);
  } catch (e) {
    if (/^timed out/.test(e.message)) timedOut = true;
    fail(`${name}: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
}

const server = await serve();
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
// A context of its own, so a second tab can share the page's storage.
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

page.on("pageerror", (e) => fail(`page error: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") fail(`console.error: ${m.text()}`);
});
// Counts animation frames, so we can tell a frozen game loop from a running one.
await page.addInitScript(() => {
  window.__frames = 0;
  const tick = () => {
    window.__frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const frames = () => page.evaluate(() => window.__frames);
// Let the frames already in flight finish (rather than sleeping for a
// fixed time and hoping).
async function settle(count = 3) {
  const now = await frames();
  await page.waitForFunction((n) => window.__frames >= n, now + count, { timeout: 5000 });
}
const state = () =>
  page.evaluate(() => ({
    money: World.money,
    minutes: Clock.totalMinutes,
    people: People.population(),
    shoppers: People.list.filter((p) => p.role === "shopper").length,
    guests: People.list.filter((p) => p.role === "guest").length,
    stars: Ratings.stars,
    floors: [...World.floors].map(([f, t]) => [f, [...t].sort((a, b) => a - b)]).sort((a, b) => a[0] - b[0]),
    rooms: World.rooms.map((r) => `${r.type}@${r.floor}:${r.tileStart}:${r.status}`).sort(),
    transit: World.transit.map((t) => `${t.kind}@${t.tileStart}:${t.floorBottom}-${t.floorTop}`).sort(),
    drivers: People.list.filter((p) => p.parking).map((p) => `${p.parking.id}:${p.space}`).sort(),
  }));

// Screen position of the middle of a tile on a floor, for real mouse input.
async function spot(tile, floor) {
  return page.evaluate(
    ([tile, floor]) => {
      const rect = document.getElementById("game").getBoundingClientRect();
      return {
        x: rect.left + Camera.worldToScreenX(Grid.tileToX(tile) + Grid.TILE_SIZE / 2),
        y: rect.top + Camera.worldToScreenY(Grid.floorToY(floor) - Grid.FLOOR_HEIGHT / 2),
      };
    },
    [tile, floor],
  );
}
async function pickTool(tool) {
  // Decorations are behind the toolbar's Decor button.
  const selector = `button[data-tool="${tool}"]`;
  if (!(await page.isVisible(selector))) await page.click("#decor-btn");
  await page.click(selector);
}
async function clickAt(tile, floor) {
  const p = await spot(tile, floor);
  await page.mouse.click(p.x, p.y);
}
async function dragAcross(from, to) {
  const a = await spot(...from);
  const b = await spot(...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}
const simulate = (minutes) =>
  page.evaluate(async (minutes) => {
    for (let left = minutes; left > 0; left -= 60) advanceSimulation(Math.min(left, 60));
  }, minutes);

try {
  await step("start a new game", async () => {
    await page.goto(url);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector("#toolbar");
    check((await page.evaluate(() => World.rooms.length)) === 0, "a new game should start with no rooms");
    check((await frames()) > 0, "the game loop never started");
  });

  await step("build floors, rooms, stairs and an elevator", async () => {
    // Scroll so the whole 40-tile-wide layout fits inside the window.
    await page.evaluate(() => {
      Camera.x = 0;
    });
    await pickTool("floor");
    for (const floor of [0, 1, 2, 3, 4]) await dragAcross([0, floor], [39, floor]);

    // The lobby is dragged out, in two pieces that join into one.
    await pickTool("lobby");
    await dragAcross([0, 0], [9, 0]);
    await dragAcross([19, 0], [10, 0]);
    check(await page.evaluate(() => {
      const lobbies = World.rooms.filter((r) => r.type === "lobby");
      return lobbies.length === 1 && lobbies[0].tileStart === 0 && roomWidth(lobbies[0]) === 20;
    }), "the two pieces of lobby didn't join into one 20 tiles wide");
    await pickTool("elevator");
    await dragAcross([0, 0], [0, 4]);
    await pickTool("stairs");
    await clickAt(34, 0);

    for (const [tool, tile, floor] of [
      ["sewing", 4, 1],
      ["pottery", 12, 1],
      ["woodwork", 22, 1],
      ["jewellery", 4, 2],
      ["condo", 10, 2],
      ["cafe", 4, 3], // by the elevator, so the makers below come up for lunch
    ]) {
      await pickTool(tool);
      await clickAt(tile, floor);
    }

    // Shops, hotel rooms, restaurants and service rooms unlock at 2★.
    // Reaching 100 people would take too long here, so check the lock,
    // then hand the tower its second star directly, and the money for the
    // lot (it costs more than a new game's $200,000). (The Single sits
    // over the woodwork studio, so its weekday guests get noise too; the
    // Twin is up on the 3rd floor, clear of the café and the restaurant,
    // which is on the 4th by the elevator. Housekeeping is beside the
    // Single. The Security office comes later, once a break-in has been
    // tried without it.)
    await pickTool("shop");
    await clickAt(22, 0);
    await pickTool("single");
    await clickAt(26, 2);
    await pickTool("restaurant");
    await clickAt(4, 4);
    await pickTool("twin");
    await clickAt(28, 3);
    await pickTool("housekeeping");
    await clickAt(32, 2);
    await pickTool("security");
    await clickAt(20, 4);
    const early = await page.evaluate(() =>
      World.rooms.filter((r) => ["shop", "restaurant", "housekeeping", "security"].includes(r.type) || isHotel(r)).length,
    );
    check(early === 0, "a shop, hotel room, restaurant or service room was built before 2★");
    check(await page.evaluate(() => document.querySelector('#toolbar button[data-tool="staffLift"]').classList.contains("locked")), "the Staff Lift isn't locked before 2★");
    await page.evaluate(() => {
      Ratings.stars = 2;
      World.money += 50000;
    });
    await pickTool("twin");
    await clickAt(28, 3);
    await pickTool("restaurant");
    await clickAt(4, 4);
    await pickTool("single");
    await clickAt(26, 2);
    await pickTool("shop");
    await clickAt(22, 0);
    await pickTool("housekeeping");
    await clickAt(32, 2);
    await page.keyboard.press("Escape");

    const s = await state();
    check(s.rooms.length === 12, `expected 12 rooms, got ${s.rooms.length}: ${s.rooms}`);
    for (const type of ["lobby", "sewing", "pottery", "woodwork", "jewellery", "condo", "cafe", "shop", "single", "twin", "restaurant", "housekeeping"]) {
      check(s.rooms.some((r) => r.startsWith(`${type}@`)), `no ${type} was built: ${s.rooms}`);
    }
    check(s.transit.length === 2, `expected stairs and an elevator, got ${s.transit}`);
    // $200,000 to start and $50,000 handed over at 2★, less 5 floors of 40
    // tiles at $200, every room, the stairs and the elevator.
    const spent = await page.evaluate(() =>
      5 * 40 * FLOOR_COST_PER_TILE +
      World.rooms.reduce((sum, r) => sum + ROOM_TYPES[r.type].cost, 0) +
      World.transit.reduce((sum, t) => sum + transitCost(t.kind, t.floorBottom, t.floorTop), 0),
    );
    check(s.money === 250000 - spent, `money is ${s.money} after building, expected ${250000 - spent}`);
  });

  await step(`run ${SIM_DAYS} game days`, async () => {
    const before = await state();
    // A day at a time, so each step crosses one midnight and banks one
    // day's shop takings and hotel nights.
    let sales = 0;
    let nights = 0;
    let lunches = 0;
    let dinners = 0;
    // Count residents and guests sitting down to dinner at an open
    // restaurant, and hotel rooms cleaned after their guests checked out.
    await page.evaluate(() => {
      window.__makersAte = 0;
      const sat = Cafes.onMakerArrived.bind(Cafes);
      Cafes.onMakerArrived = (person) => {
        if (Shops.isOpen(person.lunchCafe)) window.__makersAte++;
        return sat(person);
      };
      window.__dinedIn = 0;
      const arrived = Restaurants.onDinerArrived.bind(Restaurants);
      Restaurants.onDinerArrived = (person) => {
        if (Shops.isOpen(person.dinnerRoom) && !person.movingOut) window.__dinedIn++;
        return arrived(person);
      };
      // A clean counts only if its housekeeper got to the room and spent
      // the full 45 minutes there.
      window.__cleaned = 0;
      window.__badCleans = [];
      const arrivals = new Map();
      const onArrived = Housekeeping.onArrived.bind(Housekeeping);
      Housekeeping.onArrived = (person) => {
        arrivals.set(person, { room: person.job, at: Clock.totalMinutes });
        return onArrived(person);
      };
      const finish = Housekeeping.finish.bind(Housekeeping);
      Housekeeping.finish = (person) => {
        const arrival = arrivals.get(person);
        const there = arrival && arrival.room === person.job && person.floor === person.job.floor;
        if (!there || Clock.totalMinutes - arrival.at < CLEANING_MINUTES - 0.5) {
          window.__badCleans.push(`${person.job.type} on ${floorLabel(person.job.floor)} at ${Clock.label()}`);
        } else if (person.job.needsCleaning && person.job.status === "vacant") {
          window.__cleaned++;
        }
        return finish(person);
      };
    });
    for (let day = 0; day < SIM_DAYS; day++) {
      await simulate(24 * 60);
      sales += await page.evaluate(() => World.rooms.find((r) => r.type === "shop").salesYesterday || 0);
      nights += await page.evaluate(() => Economy.lastHotel || 0);
      lunches += await page.evaluate(() => World.rooms.find((r) => r.type === "cafe").salesYesterday || 0);
      dinners += await page.evaluate(() => World.rooms.find((r) => r.type === "restaurant").salesYesterday || 0);
    }
    check(dinners > 0, "the restaurant never sold a dinner");
    check((await page.evaluate(() => window.__cleaned)) > 0, "no housekeeper ever cleaned a hotel room after a checkout");
    const badCleans = await page.evaluate(() => window.__badCleans);
    check(badCleans.length === 0, `rooms marked clean without a housekeeper there for 45 minutes: ${badCleans.join("; ")}`);
    check((await page.evaluate(() => window.__dinedIn)) > 0, "no resident or hotel guest ever had dinner at the restaurant");
    check(lunches > 0, "the café never sold a lunch");
    check((await page.evaluate(() => window.__makersAte)) > 0, "no maker ever sat down to lunch at the café");
    const after = await state();
    check(sales > 0, "the shop never sold anything");
    check(nights > 0, "the hotel rooms never earned a night");
    check(after.people > 0, "nobody moved in");
    check(after.rooms.some((r) => r.endsWith(":occupied")), "no room became occupied");
    check(Number.isFinite(after.money), `money is ${after.money}`);
    check(!(await page.evaluate(() => Economy.bankrupt)), "the tower went bankrupt");
  });

  await step("break-ins, and a Security office that stops them", async () => {
    // An unprotected shop loses stock, and a message says so.
    const theft = await page.evaluate(() => {
      const shop = World.rooms.find((r) => r.type === "shop");
      const before = World.money;
      const message = Security.breakIn(shop);
      return { status: shop.status, message, taken: before - World.money, banner: document.getElementById("banner").textContent };
    });
    check(theft.status === "occupied", `the shop should have a shopkeeper by now, but it's ${theft.status}`);
    check(theft.taken >= 1000 && theft.taken <= 3000, `a break-in at the shop should take $1,000–3,000, took ${theft.taken}`);
    check(/^Break-in at the Craft Shop on 1F: \$[\d,]+ of stock taken$/.test(theft.banner), `no break-in message: "${theft.banner}"`);

    // Two break-ins at the jewellery studio stress its maker, and hovering
    // it names the cause.
    const jewellery = await page.evaluate(() => {
      const room = World.rooms.find((r) => r.type === "jewellery");
      Security.breakIn(room);
      Security.breakIn(room);
      return { floor: room.floor, tile: room.tileStart, status: room.status };
    });
    check(jewellery.status === "occupied", `the jewellery studio should have its maker, but it's ${jewellery.status}`);
    const p = await spot(jewellery.tile + 1, jewellery.floor);
    await page.mouse.move(p.x, p.y);
    await page.waitForFunction(() => document.getElementById("tooltip").classList.contains("shown"), null, { timeout: 2000 });
    const tip = await page.textContent("#tooltip");
    check(/stress \d+ \((pink|red)\): mostly break-ins/.test(tip), `a stressed room's tooltip doesn't name the cause: "${tip}"`);
    check(/No security within 5 floors/.test(tip), `an unprotected studio's tooltip doesn't warn: "${tip}"`);
    await page.mouse.move(5, 5);

    // A Security office on the top floor covers the whole tower. Run to
    // 2am, when its guards are on duty: then nothing is ever taken.
    await pickTool("security");
    await clickAt(20, 4);
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      while (Clock.hour < 2 || Clock.hour >= 3) advanceSimulation(15);
    });
    const guarded = await page.evaluate(() => {
      const office = World.rooms.find((r) => r.type === "security");
      const shop = World.rooms.find((r) => r.type === "shop");
      const before = World.money;
      let robbed = 0;
      for (let i = 0; i < 50; i++) if (Security.breakIn(shop)) robbed++;
      return { status: office.status, onDuty: Security.onDuty(office), robbed, lost: before - World.money };
    });
    check(guarded.status === "occupied" && guarded.onDuty, `the Security office's guards aren't on duty at 2am (${guarded.status})`);
    check(guarded.robbed === 0 && guarded.lost === 0, `a protected shop was robbed ${guarded.robbed} times`);
    // And over three more nights, with the dice loaded so that every
    // valuable room is tried every night, nothing is taken.
    await page.evaluate(() => {
      window.__tried = 0;
      window.__robbed = 0;
      const breakIn = Security.breakIn.bind(Security);
      Security.breakIn = (room) => {
        window.__tried++;
        const message = breakIn(room);
        if (message) window.__robbed++;
        return message;
      };
      const update = Security.update.bind(Security);
      Security.update = () => {
        const random = Math.random;
        Math.random = () => 0;
        try {
          update();
        } finally {
          Math.random = random;
        }
      };
      window.__unloadDice = () => (Security.update = update);
    });
    await simulate(3 * 24 * 60);
    const nights = await page.evaluate(() => {
      window.__unloadDice();
      return { tried: window.__tried, robbed: window.__robbed };
    });
    check(nights.tried >= 3, `only ${nights.tried} break-ins were tried over three loaded nights`);
    check(nights.robbed === 0, `a room under guard was broken into (${nights.robbed} of ${nights.tried} tries)`);
  });

  await step("3★, basements and parking", async () => {
    // The top bar lists what the next star needs; both service rooms are
    // staffed by now.
    const bar = await page.textContent("#population");
    check(/^3★: \d+ \/ 300 people · Housekeeping ✓ · Security office ✓$/.test(bar), `the star checklist reads "${bar}"`);

    // Before 3★: no digging, no car park.
    await page.evaluate(() => (World.money += 250000));
    const before = await page.evaluate(() => World.money);
    await pickTool("floor");
    await dragAcross([0, -1], [39, -1]);
    check(!(await page.evaluate(() => World.floors.has(-1) && World.floors.get(-1).size > 0)), "a basement was dug before 3★");
    check((await page.evaluate(() => World.money)) === before, "a refused basement cost money");
    for (const tool of ["parking", "snackbar"]) {
      check(await page.evaluate((t) => document.querySelector(`#toolbar button[data-tool="${t}"]`).classList.contains("locked"), tool), `${tool} isn't locked before 3★`);
    }

    // 300 people isn't enough without both service rooms staffed. (Reaching
    // 300 would take too long here, so the head count is faked.)
    const stars = await page.evaluate(() => {
      const population = People.population;
      People.population = () => 300;
      const office = World.rooms.find((r) => r.type === "security");
      office.status = "vacant";
      Ratings.update();
      const without = Ratings.stars;
      office.status = "occupied";
      Ratings.update();
      People.population = population;
      return { without, with: Ratings.stars, banner: document.getElementById("banner").textContent };
    });
    check(stars.without === 2, `3★ was given without a staffed Security office (${stars.without}★)`);
    check(stars.with === 3, `300 people with both service rooms staffed didn't make 3★ (${stars.with}★)`);
    check(/3-star!.*Basements, Parking and the Snack Bar unlock/.test(stars.banner), `no 3★ banner: "${stars.banner}"`);

    // Dig B1 at $400 a tile, and run the elevator down to it.
    const dug = await page.evaluate(() => World.money);
    await dragAcross([0, -1], [39, -1]);
    const cost = dug - (await page.evaluate(() => World.money));
    check(cost === 40 * 400, `digging 40 tiles of basement cost ${cost}, expected $16,000`);
    await pickTool("elevator");
    await dragAcross([0, 0], [0, -1]);
    const shaft = await page.evaluate(() => World.transit.find((t) => t.kind === "elevator").floorBottom);
    check(shaft === -1, `the elevator wasn't extended down to B1 (bottom ${shaft})`);

    // Studios, condos and hotel rooms stay above ground; Parking goes below.
    for (const [tool, tile, floor] of [["sewing", 6, -1], ["single", 6, -1], ["parking", 20, 1]]) {
      await pickTool(tool);
      await clickAt(tile, floor);
    }
    check(!(await page.evaluate(() => World.rooms.some((r) => r.floor < 0 || r.type === "parking"))), "a studio or hotel room went underground, or Parking above ground");
    // Still holding Parking: drag out 4 bays (16 tiles, 20 spaces) at
    // $25,000 a bay. A drag that ends mid-bay rounds up to the whole bay.
    const beforeParking = await page.evaluate(() => World.money);
    await dragAcross([20, -1], [34, -1]);
    await page.keyboard.press("Escape");
    const carPark = await page.evaluate(() => {
      const r = World.rooms.find((r) => r.type === "parking");
      return r && { floor: r.floor, tileStart: r.tileStart, width: r.width, spaces: parkingSpaces(r) };
    });
    check(carPark && carPark.floor === -1 && carPark.tileStart === 20 && carPark.width === 16 && carPark.spaces === 20,
      `the car park dragged on B1 is ${JSON.stringify(carPark)}, expected 16 tiles and 20 spaces at tile 20`);
    check(beforeParking - (await page.evaluate(() => World.money)) === 100000, "4 bays of parking didn't cost $100,000");
    // A Snack Bar by the elevator on B1, for the drivers.
    const unlocked = await page.evaluate(() => !document.querySelector('#toolbar button[data-tool="snackbar"]').classList.contains("locked"));
    check(unlocked, "the Snack Bar is still locked at 3★");
    const beforeSnack = await page.evaluate(() => World.money);
    await pickTool("snackbar");
    await clickAt(4, -1);
    await page.keyboard.press("Escape");
    check(await page.evaluate(() => World.rooms.some((r) => r.type === "snackbar" && r.floor === -1 && r.tileStart === 4)), "no Snack Bar was built on B1");
    check(beforeSnack - (await page.evaluate(() => World.money)) === 10000, "the Snack Bar didn't cost $10,000");

    // Drivers park, visit the shop, café, restaurant and Snack Bar, and
    // drive off.
    await page.evaluate(() => {
      window.__snackSales = 0;
      window.__drivers = 0;
      window.__driverSales = 0;
      window.__mostParked = 0;
      const arrived = Parking.onDriverArrived.bind(Parking);
      Parking.onDriverArrived = (person) => {
        if (person.parking) window.__drivers++;
        return arrived(person);
      };
      const checkout = Shops.checkout.bind(Shops);
      Shops.checkout = (person) => {
        checkout(person);
        if (person.parking) window.__driverSales += person.bought;
      };
    });
    for (let hour = 0; hour < 48; hour++) {
      await simulate(60);
      await page.evaluate(() => {
        const carPark = World.rooms.find((r) => r.type === "parking");
        const spaces = Parking.drivers(carPark).map((p) => p.space);
        window.__mostParked = Math.max(window.__mostParked, spaces.length);
        if (new Set(spaces).size !== spaces.length) window.__mostParked = 999; // two cars in one space
        const snackBar = World.rooms.find((r) => r.type === "snackbar");
        window.__snackSales = Math.max(window.__snackSales, snackBar.till || 0, snackBar.salesYesterday || 0);
      });
    }
    const parked = await page.evaluate(() => ({ drivers: window.__drivers, sales: window.__driverSales, most: window.__mostParked }));
    check(parked.drivers > 0, "no driver ever came");
    check(parked.sales > 0, "drivers never bought anything");
    check(parked.most <= 20, `the car park held ${parked.most} cars (20 spaces), or two in one space`);
    check((await page.evaluate(() => window.__snackSales)) > 0, "the Snack Bar never sold anything");

    // Hovering the car park says how full it is.
    const p = await spot(22, -1);
    await page.mouse.move(p.x, p.y);
    await page.waitForFunction(() => document.getElementById("tooltip").classList.contains("shown"), null, { timeout: 2000 });
    const tip = await page.textContent("#tooltip");
    check(/^Parking · \d+ of 20 spaces taken · \d+ drivers? today$/.test(tip), `the car park's tooltip reads "${tip}"`);
    await page.mouse.move(5, 5);
  });

  await step("decorations, a staff lift and rent levels", async () => {
    await page.evaluate(() => (World.money += 200000));
    // A bench in the gap beside the café on 4F, and a planter strip dragged
    // after it; a fountain won't go in a basement.
    let before = await page.evaluate(() => World.money);
    await pickTool("bench");
    await clickAt(16, 3);
    await pickTool("planterStrip");
    await dragAcross([20, 3], [25, 3]);
    await pickTool("fountain");
    await clickAt(12, -1);
    await page.keyboard.press("Escape");
    const decor = await page.evaluate(() => World.rooms.filter((r) => ROOM_TYPES[r.type].decoration).map((r) => `${r.type}@${r.floor}:${r.tileStart}:${roomWidth(r)}`).sort());
    check(JSON.stringify(decor) === JSON.stringify(["bench@3:16:4", "planterStrip@3:20:6"]), `decorations built: ${decor}`);
    check(before - (await page.evaluate(() => World.money)) === 20000 + 6 * 5000, "a bench and 6 tiles of planter strip didn't cost $50,000");

    // A staff lift beside the Twin, 4F–5F, through to the Security office's
    // floor: $10,000 + $500 a floor. Hovering it says it's staff only.
    before = await page.evaluate(() => World.money);
    await pickTool("staffLift");
    await dragAcross([38, 3], [38, 4]);
    await page.keyboard.press("Escape");
    check(await page.evaluate(() => World.transit.some((t) => t.kind === "staffLift" && t.tileStart === 38 && t.floorBottom === 3 && t.floorTop === 4)), "no staff lift was built");
    check(before - (await page.evaluate(() => World.money)) === 11000, "a 2-floor staff lift didn't cost $11,000");
    let p = await spot(38, 4);
    await page.mouse.move(p.x, p.y);
    await page.waitForFunction(() => document.getElementById("tooltip").classList.contains("shown"), null, { timeout: 2000 });
    const lift = await page.textContent("#tooltip");
    check(/^Staff Lift 4F–5F · car at (4F|5F)( going (up|down))?, \d of 4 aboard/.test(lift) && /Staff only: /.test(lift), `the staff lift's tooltip reads "${lift}"`);
    check(!/NaN|undefined|No staff use this lift/.test(lift), `bad staff lift tooltip: "${lift}"`);

    // With nothing in hand, clicking the sewing studio opens its rent
    // panel. Low rent for it, then for its whole floor; it says so on hover.
    await page.mouse.move(5, 5);
    await clickAt(6, 1);
    check(await page.isVisible("#roompanel"), "clicking a studio with no tool didn't open its rent panel");
    check(/^Sewing Studio on 2F$/.test(await page.textContent("#roompanel-title")), "the rent panel isn't the sewing studio's");
    await page.click('#roompanel button[data-level="low"]');
    await page.click("#roompanel-floor");
    const levels = await page.evaluate(() => World.rooms.filter((r) => r.floor === 1).map((r) => `${r.type}:${rentLevel(r)}`).sort());
    check(JSON.stringify(levels) === JSON.stringify(["pottery:low", "sewing:low", "woodwork:low"]), `2F's rent levels: ${levels}`);
    await page.keyboard.press("Escape");
    check(!(await page.isVisible("#roompanel")), "Esc didn't close the rent panel");
    p = await spot(6, 1);
    await page.mouse.move(p.x, p.y);
    await page.waitForFunction(() => document.getElementById("tooltip").classList.contains("shown"), null, { timeout: 2000 });
    const tip = await page.textContent("#tooltip");
    check(/Low rent \(80%\): moves out at stress 75/.test(tip), `the sewing studio's tooltip reads "${tip}"`);
    await page.mouse.move(5, 5);

    // Knocking the bench and the staff lift down refunds half of each.
    before = await page.evaluate(() => World.money);
    await pickTool("demolish");
    await clickAt(17, 3);
    await clickAt(38, 4);
    await page.keyboard.press("Escape");
    check((await page.evaluate(() => World.money)) - before === 10000 + 5500, "demolishing the bench and staff lift didn't refund half");
    check(!(await page.evaluate(() => World.transit.some((t) => t.kind === "staffLift"))), "the staff lift wasn't demolished");
  });

  await step("hover every room with people in it, and the elevator shaft", async () => {
    const rooms = await page.evaluate(() =>
      World.rooms.filter((r) => ROOM_TYPES[r.type].tenants > 0).map((r) => ({ type: r.type, floor: r.floor, tile: r.tileStart })),
    );
    for (const room of rooms) {
      const p = await spot(room.tile + 1, room.floor);
      await page.mouse.move(p.x, p.y);
      try {
        await page.waitForFunction(() => document.getElementById("tooltip").classList.contains("shown"), null, { timeout: 2000 });
      } catch {
        fail(`no tooltip when hovering the ${room.type} room`);
        continue;
      }
      const text = await page.textContent("#tooltip");
      check(text.trim().length > 0 && !/NaN|undefined/.test(text), `bad tooltip for ${room.type}: "${text}"`);
    }
    // The shaft runs B1–5F at tile 0, drawn over the lobby.
    const p = await spot(1, 2);
    await page.mouse.move(p.x, p.y);
    await page.waitForFunction(() => document.getElementById("tooltip").classList.contains("shown"), null, { timeout: 2000 });
    const shaft = await page.textContent("#tooltip");
    check(/^Elevator B1–5F · car at (B1|\dF)( going (up|down))?, \d of 8 aboard/.test(shaft), `the shaft's tooltip reads "${shaft}"`);
    check(/(Waiting now: \d+|Nobody waiting now)/.test(shaft) && /Last hour: /.test(shaft), `the shaft's tooltip has no queue or last hour: "${shaft}"`);
    check(!/NaN|undefined/.test(shaft), `bad shaft tooltip: "${shaft}"`);
    await page.mouse.move(5, 5);
  });

  await step("keys, mouse and dialogs", async () => {
    // Space pauses and resumes; 1 and 3 set the speed.
    await page.mouse.click(640, 300); // focus the page, not a button
    await page.keyboard.press("Escape");
    await page.click('.speed-btn[data-speed="1"]');
    await page.mouse.click(640, 300);
    const speeds = [];
    for (const key of ["Space", "Space", "3", "1"]) {
      await page.keyboard.press(key);
      speeds.push(await page.evaluate(() => Clock.speed));
    }
    check(speeds.join(",") === "0,1,3,1", `Space, Space, 3, 1 set the speed to ${speeds}`);

    // WASD and the arrows scroll; so do a right-drag and the wheel.
    const camera = () => page.evaluate(() => ({ x: Camera.x, y: Camera.y }));
    const home = await camera(); // put back at the end, for the steps after
    let c = home;
    await page.keyboard.down("d");
    await page.waitForFunction((x) => Camera.x > x + 20, c.x, { timeout: 2000 }).catch(() => fail("holding D didn't scroll right"));
    await page.keyboard.up("d");
    c = await camera();
    await page.keyboard.down("ArrowUp");
    await page.waitForFunction((y) => Camera.y < y - 20, c.y, { timeout: 2000 }).catch(() => fail("holding the up arrow didn't scroll up"));
    await page.keyboard.up("ArrowUp");
    c = await camera();
    await page.mouse.move(640, 300);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(540, 350, { steps: 4 });
    await page.mouse.up({ button: "right" });
    let after = await camera();
    check(after.x === c.x + 100 && after.y === c.y - 50, `a right-drag of (-100, +50) moved the camera by (${after.x - c.x}, ${after.y - c.y})`);
    c = after;
    await page.mouse.wheel(0, 120);
    await page.waitForFunction((y) => Camera.y > y, c.y, { timeout: 2000 }).catch(() => fail("the mouse wheel didn't scroll"));

    // Esc, or a right-click, puts the tool down; losing focus drops a drag.
    await pickTool("floor");
    await page.mouse.click(640, 300, { button: "right" });
    check((await page.evaluate(() => Tool.current)) === null, "a right-click didn't put the tool down");
    await pickTool("floor");
    await page.mouse.move(640, 300);
    await page.mouse.down();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    check(!(await page.evaluate(() => Pointer.dragging)), "losing focus mid-drag left the drag stuck");
    await page.mouse.up();
    await page.keyboard.press("Escape");
    check((await page.evaluate(() => Tool.current)) === null, "Esc didn't put the tool down");

    // Behind the Save file panel the game's keys do nothing. Space presses
    // the panel's own focused button (Close), and so does Esc; either way
    // the game goes back to the speed it had.
    c = await camera();
    await page.click("#savefile-btn");
    await page.keyboard.press("3");
    await page.keyboard.down("a");
    await settle(5);
    await page.keyboard.up("a");
    check((await page.evaluate(() => Clock.speed)) === 0, "a key behind the Save file panel changed the speed");
    check((await camera()).x === c.x, "A behind the Save file panel scrolled the tower");
    await page.keyboard.press("Space");
    check(!(await page.isVisible("#savefile")), "Space didn't press the panel's Close button");
    check((await page.evaluate(() => Clock.speed)) === 1, "closing the panel didn't go back to the speed before");
    await page.click("#savefile-btn");
    await page.keyboard.press("Escape");
    check(!(await page.isVisible("#savefile")), "Esc didn't close the Save file panel");
    check((await page.evaluate(() => Clock.speed)) === 1, "closing the panel with Esc didn't go back to the speed before");

    // New game asks first; Esc means "Keep playing".
    await page.click("#new-btn");
    check(await page.isVisible("#newgame"), "New game didn't ask first");
    await page.keyboard.press("Escape");
    check(!(await page.isVisible("#newgame")), "Esc didn't close New game's question");
    check((await page.evaluate(() => World.rooms.length)) > 0, "Esc on New game's question started over");
    await page.evaluate((home) => Object.assign(Camera, home), home);
  });

  await step("save and reload", async () => {
    // Reloading saves and restores the game paused, so it may already be.
    if ((await page.evaluate(() => Clock.speed)) !== 0) await page.click("#pause-btn");
    check((await page.evaluate(() => Clock.speed)) === 0, "Pause did not pause the game");
    await settle();
    const before = await state();
    const wholeSave = () => page.evaluate(() => {
      const data = SaveGame.snapshot();
      delete data.savedAt;
      return JSON.stringify(data);
    });
    const saved = await wholeSave();
    await page.click("#save-btn");
    check(await page.evaluate(() => SaveGame.hasSave()), "pressing Save stored nothing");
    await page.reload();
    await page.waitForSelector("#toolbar");
    const after = await state();
    for (const key of Object.keys(before)) {
      check(JSON.stringify(after[key]) === JSON.stringify(before[key]), `after reloading, ${key} is ${JSON.stringify(after[key])}, saved ${JSON.stringify(before[key])}`);
    }
    check((await page.evaluate(() => Clock.speed)) === 0, "a restored game should start paused");
    // Everything else too: stress, rent owed, tills, cars, queues, where
    // everyone stands.
    check((await wholeSave()) === saved, "the reloaded game doesn't save the same as the one saved");
  });

  await step("Save file: export, then load it back in", async () => {
    const before = await state();
    await page.click("#savefile-btn");
    check(await page.isVisible("#savefile-text"), "the Save file panel didn't open");
    check((await page.evaluate(() => Clock.speed)) === 0, "the game should pause while the Save file panel is open");
    const exported = await page.inputValue("#savefile-text");
    let parsed = null;
    try {
      parsed = JSON.parse(exported);
    } catch (e) {
      fail("the exported save isn't JSON");
    }
    check(parsed && parsed.version === (await page.evaluate(() => SAVE_VERSION)), "the exported save has the wrong version");

    // Typing in the box isn't playing: no scrolling, no speed change.
    const cameraX = await page.evaluate(() => Camera.x);
    await page.focus("#savefile-text");
    await page.keyboard.press("End");
    await page.keyboard.down("d");
    await page.waitForTimeout(200);
    await page.keyboard.up("d");
    await page.keyboard.press("3");
    check((await page.evaluate(() => Camera.x)) === cameraX, "typing D in the Save file box scrolled the tower");
    check((await page.evaluate(() => Clock.speed)) === 0, "typing 3 in the Save file box changed the speed");

    // An ordinary browser download, outside the claude.ai artifact.
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#savefile-download")]);
    check(download.suggestedFilename().endsWith(".json"), `the download is named ${download.suggestedFilename()}`);
    const downloaded = fs.readFileSync(await download.path(), "utf8");
    check(downloaded === exported + "d3", "the download doesn't hold the text in the box");

    // Something that isn't a save is turned away, and nothing changes.
    await page.evaluate(() => (window.__notReloaded = true));
    await page.fill("#savefile-text", "not a save");
    await page.click("#savefile-load");
    await settle();
    check(await page.evaluate(() => window.__notReloaded === true), "loading a bad save reloaded the page");
    check(await page.evaluate(() => document.getElementById("savefile-note").classList.contains("error")), "a bad save gave no error");
    check((await state()).money === before.money, "loading a bad save changed the game");

    // So is a save from a newer version of the game.
    const newer = JSON.parse(exported);
    newer.version = 99;
    await page.fill("#savefile-text", JSON.stringify(newer));
    await page.click("#savefile-load");
    await settle();
    check(await page.evaluate(() => window.__notReloaded === true), "loading a save from a newer version reloaded the page");
    check(/isn't a save this version/.test(await page.textContent("#savefile-note")), "a newer version's save gave no error");

    // A good one (marked by a different bank balance) replaces the tower.
    const marked = JSON.parse(exported);
    marked.world.money += 12345;
    await page.fill("#savefile-text", JSON.stringify(marked));
    await Promise.all([page.waitForEvent("load"), page.click("#savefile-load")]);
    await page.waitForSelector("#toolbar");
    const after = await state();
    check(after.money === before.money + 12345, `after loading a save file, money is ${after.money}, expected ${before.money + 12345}`);
    for (const key of Object.keys(before)) {
      if (key === "money") continue;
      check(JSON.stringify(after[key]) === JSON.stringify(before[key]), `after loading a save file, ${key} is ${JSON.stringify(after[key])}, saved ${JSON.stringify(before[key])}`);
    }
  });

  await step("demolish, then keep running", async () => {
    // Knock the car park down at a busy hour, with drivers about: they
    // leave by the lobby instead, and nobody is left stranded.
    await page.evaluate(() => {
      while (Clock.hour < 19 || Clock.hour >= 20) advanceSimulation(15);
    });
    const drivers = await page.evaluate(() => People.list.filter((p) => p.parking).length);
    check(drivers > 0, "no drivers were about at 7pm to test knocking the car park down");
    await pickTool("demolish");
    await clickAt(22, -1);
    check(!(await page.evaluate(() => World.rooms.some((r) => r.type === "parking"))), "the car park wasn't demolished");
    await simulate(4 * 60);
    const stranded = await page.evaluate(() =>
      People.list
        .filter((p) => p.role === "shopper" && (p.parking || (!p.route && !["inRoom", "offsite"].includes(p.state))))
        .map((p) => `${p.state} at ${floorLabel(Math.round(p.floor))}`),
    );
    check(stranded.length === 0, `shoppers left stranded after the car park went: ${stranded.join(", ")}`);

    await clickAt(0, 0); // the elevator, drawn over the lobby
    await clickAt(34, 0); // the stairs
    await clickAt(14, 1); // the pottery studio
    await page.keyboard.press("Escape");
    const s = await state();
    check(s.transit.length === 0, `transit should be gone, got ${s.transit}`);
    check(!s.rooms.some((r) => r.startsWith("pottery")), "the pottery studio should be gone");

    await simulate(2 * 24 * 60);
    await page.click('.speed-btn[data-speed="3"]'); // also resumes a paused game
    const f0 = await frames();
    const t0 = (await state()).minutes;
    await settle(10).catch(() => fail("the game loop stopped"));
    await page.waitForFunction((t) => Clock.totalMinutes > t, t0, { timeout: 5000 }).catch(() => fail("the clock stopped at 3x speed"));
    check((await frames()) > f0, "the game loop stopped");
  });

  await step("an old save's one-size hotel rooms are refunded on load", async () => {
    // Saves from before Singles and Twins have 8-tile "hotel" rooms. Fake
    // one by relabelling the Twin, guests and all, then reload.
    const before = await page.evaluate(() => {
      // A copy: the snapshot shares the live rooms, and relabelling the
      // live Twin would trip up the game before the reload.
      const data = JSON.parse(JSON.stringify(SaveGame.snapshot()));
      const twin = data.world.rooms.find((r) => r.type === "twin");
      twin.type = "hotel";
      SaveGame.discarded = true; // so reloading doesn't save over it
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return { money: data.world.money, rooms: data.world.rooms.length };
    });
    await page.reload();
    await page.waitForSelector("#toolbar");
    const after = await page.evaluate(() => ({
      money: World.money,
      rooms: World.rooms.length,
      oldRooms: World.rooms.filter((r) => r.type === "hotel").length,
      strays: People.list.filter((p) => !World.rooms.includes(p.room)).length,
      banner: document.getElementById("banner").textContent,
    }));
    check(after.oldRooms === 0, "an old hotel room survived loading");
    check(after.rooms === before.rooms - 1, `expected ${before.rooms - 1} rooms after loading, got ${after.rooms}`);
    check(after.money === before.money + 14000, `expected a $14,000 refund, money went ${before.money} -> ${after.money}`);
    check(after.strays === 0, "someone was left behind in a removed hotel room");
    check(/refunded/.test(after.banner), `the welcome-back note doesn't mention the refund: "${after.banner}"`);
    await simulate(24 * 60);
  });

  await step("two tabs: the one whose save is replaced stops saving", async () => {
    const other = await context.newPage();
    other.on("pageerror", (e) => fail(`page error in the second tab: ${e.message}`));
    await other.goto(url);
    await other.waitForSelector("#toolbar");
    await other.evaluate(() => (World.money = 424242));
    await other.click("#save-btn");
    await page.waitForFunction(() => SaveGame.otherTab, null, { timeout: 5000 }).catch(() => {});
    check(await page.evaluate(() => SaveGame.otherTab), "the first tab didn't notice the second tab's save");
    check(/saved from another tab/.test(await page.textContent("#banner")), "the first tab didn't say its save was replaced");
    await page.click("#save-btn");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem(SAVE_KEY)).world.money);
    check(stored === 424242, `the first tab saved over the second tab's save (money ${stored})`);
    await other.close();
    await page.reload(); // carries on from the second tab's save
    await page.waitForSelector("#toolbar");
    check(!(await page.evaluate(() => SaveGame.otherTab)) && (await page.evaluate(() => World.money)) === 424242, "reloading didn't pick up the second tab's save");
  });

  await step("a save that won't load is kept, and Save file shows it", async () => {
    await page.evaluate(() => {
      SaveGame.discarded = true; // so reloading doesn't save over it
      localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 99, from: "a newer game" }));
    });
    await page.reload();
    await page.waitForSelector("#toolbar");
    check((await page.evaluate(() => World.rooms.length)) === 0, "a save from a newer version loaded");
    check(/couldn't be loaded/.test(await page.textContent("#banner")), "no word that the save couldn't be loaded");
    await page.click("#savefile-btn");
    check(await page.isVisible("#savefile-old"), "no Old save button");
    await page.click("#savefile-old");
    check(JSON.parse(await page.inputValue("#savefile-text")).from === "a newer game", "Old save doesn't show the save that wouldn't load");
    await page.keyboard.press("Escape");
  });

  await step("New game starts over", async () => {
    await page.evaluate(() => {
      World.money = 1;
      SaveGame.save();
    });
    await page.click("#new-btn");
    await Promise.all([page.waitForEvent("load"), page.click("#newgame-yes")]);
    await page.waitForSelector("#toolbar");
    const fresh = await page.evaluate(() => ({ rooms: World.rooms.length, money: World.money }));
    check(fresh.rooms === 0 && fresh.money === 200000, `New game left ${fresh.rooms} rooms and $${fresh.money}`);
  });

  await step("on a phone: the lobby in view, tap to build, drag to scroll", async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
    const tab = await phone.newPage();
    tab.on("pageerror", (e) => fail(`page error on the phone: ${e.message}`));
    await tab.goto(url);
    await tab.waitForSelector("#toolbar");
    const at = (tile, floor) =>
      tab.evaluate(([t, f]) => ({ x: Camera.worldToScreenX(Grid.tileToX(t) + 12), y: Camera.worldToScreenY(Grid.floorToY(f) - 16) }), [tile, floor]);
    const ground = await at(0, 0);
    const under = await tab.evaluate(({ x, y }) => document.elementFromPoint(x, y).tagName, ground);
    check(under === "CANVAS", `on a phone the ground floor starts under the ${under}, not on the canvas`);
    const cdp = await phone.newCDPSession(tab);
    const touch = (type, points) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) });
    // A finger drag with Floor picked builds along it...
    await tab.tap('#toolbar button[data-tool="floor"]');
    const a = await at(-5, 0);
    const b = await at(20, 0);
    await touch("touchStart", [a]);
    for (let i = 1; i <= 5; i++) await touch("touchMove", [{ x: a.x + ((b.x - a.x) * i) / 5, y: a.y }]);
    await touch("touchEnd", []);
    check((await tab.evaluate(() => World.floors.get(0)?.size || 0)) === 26, "a finger drag with Floor didn't build 26 tiles");
    // ...a tap places a room...
    await tab.tap('#toolbar button[data-tool="lobby"]');
    const l = await at(-5, 0);
    await tab.touchscreen.tap(l.x, l.y);
    check(await tab.evaluate(() => World.rooms.some((r) => r.type === "lobby")), "a tap didn't place the lobby");
    // ...and with nothing picked, a drag scrolls and builds nothing.
    await tab.tap('#toolbar button[data-tool="lobby"]');
    const before = await tab.evaluate(() => ({ x: Camera.x, rooms: World.rooms.length }));
    await touch("touchStart", [{ x: 200, y: 300 }]);
    for (let i = 1; i <= 5; i++) await touch("touchMove", [{ x: 200 + 20 * i, y: 300 }]);
    await touch("touchEnd", []);
    const after = await tab.evaluate(() => ({ x: Camera.x, rooms: World.rooms.length }));
    check(after.x === before.x - 100 && after.rooms === before.rooms, `a finger drag moved the camera by ${after.x - before.x} and built ${after.rooms - before.rooms}`);
    await phone.close();
  });
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error(`\nSmoke test FAILED (${problems.length} problem${problems.length === 1 ? "" : "s"})`);
  process.exit(1);
}
console.log("\nSmoke test passed");
