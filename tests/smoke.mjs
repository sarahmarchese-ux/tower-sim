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

async function step(name, fn) {
  console.log(`- ${name}`);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${STEP_TIMEOUT_MS / 1000}s`)), STEP_TIMEOUT_MS);
  });
  try {
    await Promise.race([fn(), timeout]);
  } catch (e) {
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

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
  await page.click(`#toolbar button[data-tool="${tool}"]`);
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

    await pickTool("lobby");
    await clickAt(0, 0);
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
    check(s.money < 250000, "building should have cost money");
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
    check(
      await page.evaluate(() => People.list.some((p) => p.role === "maker" && p.lunchCafe)),
      "no maker ever had lunch at the café",
    );
    const after = await state();
    check(sales > 0, "the shop never sold anything");
    check(nights > 0, "the hotel rooms never earned a night");
    check(after.minutes - before.minutes >= SIM_DAYS * 24 * 60 - 1, "the clock did not advance");
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
    // And over three more nights, nothing in the tower is broken into.
    await page.evaluate(() => {
      window.__robbed = 0;
      const breakIn = Security.breakIn.bind(Security);
      Security.breakIn = (room) => {
        const message = breakIn(room);
        if (message) window.__robbed++;
        return message;
      };
    });
    await simulate(3 * 24 * 60);
    check((await page.evaluate(() => window.__robbed)) === 0, "a room under guard was broken into");
  });

  await step("hover every tenanted room", async () => {
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
    await page.mouse.move(5, 5);
  });

  await step("save and reload", async () => {
    // Reloading saves and restores the game paused, so it may already be.
    if ((await page.evaluate(() => Clock.speed)) !== 0) await page.click("#pause-btn");
    check((await page.evaluate(() => Clock.speed)) === 0, "Pause did not pause the game");
    await page.waitForTimeout(300); // let any frame already in flight finish
    const before = await state();
    await page.click("#save-btn");
    check(await page.evaluate(() => SaveGame.hasSave()), "pressing Save stored nothing");
    await page.reload();
    await page.waitForSelector("#toolbar");
    const after = await state();
    for (const key of Object.keys(before)) {
      check(JSON.stringify(after[key]) === JSON.stringify(before[key]), `after reloading, ${key} is ${JSON.stringify(after[key])}, saved ${JSON.stringify(before[key])}`);
    }
    check((await page.evaluate(() => Clock.speed)) === 0, "a restored game should start paused");
  });

  await step("demolish, then keep running", async () => {
    await pickTool("demolish");
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
    await page.waitForTimeout(1500);
    check((await frames()) > f0 + 10, "the game loop stopped");
    check((await state()).minutes > t0, "the clock stopped at 3x speed");
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
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error(`\nSmoke test FAILED (${problems.length} problem${problems.length === 1 ? "" : "s"})`);
  process.exit(1);
}
console.log("\nSmoke test passed");
