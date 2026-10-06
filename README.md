# Tower Sim

A SimTower-inspired tower-building game, with a twist: it's a maker's building.
Artisans (sewists, potters, woodworkers, jewellers) rent studios, sell in shops,
and live in condos, while visiting buyers stay in the hotel. Layout matters
because noisy studios stress out the neighbors.

Design doc: see the Claude Doc linked from the project this repo belongs to.

## Running it locally

No build step, no install. Just open `index.html` in a browser, or serve the
folder with any static file server, e.g.:

```
python3 -m http.server
```

Then visit `http://localhost:8000`.

## Smoke test

`tests/smoke.mjs` opens the game in headless Chromium, builds a small tower
with real mouse clicks (checking shops and hotel rooms stay locked until
2★, then adding one of each), runs 8 game days (checking the shop sells
something and the hotel room earns a night), hovers every room, saves and reloads, demolishes things and keeps running. It fails on any page error,
`console.error`, frozen game loop, or save that doesn't restore the same
state. GitHub Actions runs it on every pull request
(`.github/workflows/smoke.yml`). To run it yourself:

```
npm install
npx playwright install chromium   # first time only
npm run smoke
```

(The game itself still needs no install; `package.json` is only for this test.)

## Status

**Milestone 9: hotel rooms.** Visiting buyers and tourists check in for a
night or a few, and pay for every night they stay. They're in their rooms
during the day, so studio noise now really matters.

Since milestone 9 shipped, hotel rooms come in two sizes, Single and
Twin, and guests mind long trips more. A save with the old 8-tile hotel
rooms has them taken down and refunded in full ($14,000 each) when it
loads.

- **Hotel rooms unlock at 2★**, like shops, and come in two sizes, as in
  SimTower. Each earns for every night guests sleep in it, paid at the
  midnight tally ("Night +$2,000", and "hotel tonight" in the top bar).
  - **Single Room:** 6 tiles, $10,000, $2,000 a night. Takes a buyer on
    their own.
  - **Twin Room:** 10 tiles, $17,000, $2,800 a night. Takes a pair of
    tourists. On a night no tourists book it, it takes a lone buyer if
    every Single is taken, but a buyer only pays the Single rate.
- **Bookings.** Each afternoon an empty room may get a booking, and the
  guests turn up at the lobby between 2pm and 9pm. Buyers come mostly in
  the week and tourists mostly on Fridays and Saturdays, so a tower needs
  both sizes to stay full all week. They stay 1–3 nights and check out
  between 8 and 11 in the morning. Guests wheel a suitcase in and out.
  They're visitors, so they don't count towards the population. Nobody
  books a room they can't reach.
- **Guests are in by day.** Apart from the odd outing (tourists go
  sightseeing more than buyers), guests spend the day in their room, and
  studio noise stresses them 7½ times as fast as it does condo
  residents. A woodwork studio next door, or pottery below, makes for a
  stressful weekday; weekends are quiet whatever the layout. Long trips
  up from the lobby stress them too, more than residents: anything over
  15 minutes counts (stairs and queueing double, as ever), so two flights
  of stairs are fine but five are not.
- **Too much and they leave.** A guest who goes red checks out early
  ("Checked out early: too noisy"), and that night earns nothing.
- **Reviews set occupancy.** Every stay ends with a review: good if the
  guests hardly noticed a thing, poor if they went red. A room's
  reviews set how often it's booked, down to a quarter as often. In a
  test run over twelve weeks, a quiet Single was booked 4–5 nights a week
  (about $1,400–1,700 a tile), one beside a sewing studio about 3½, one
  five flights up by stairs alone 3⅓, and one beside a woodwork studio or
  over a pottery studio about 2 ($600–800 a tile). A quiet Twin was booked
  about 5½ nights ($1,250–1,400 a tile).
- **Hover a hotel room** to see who's staying and which night of how many,
  their stress, the room's reviews, how many of the last 7 nights it was
  booked, and the noise it gets now and in working hours. It warns when a
  room gets pottery-or-louder noise in working hours.
- Hotel rooms aren't part of the weekly stress review: guests are judged
  stay by stay instead.

<details>
<summary>Milestone 8: shops</summary>

Makers sell their work, and shoppers come to buy it: the first people in
the tower who are visiting rather than living or working there.

- **Shops unlock at 2★.** Until then the Shop button is greyed out, and
  hovering with it says what it takes. A Craft Shop is 10 tiles wide and
  costs $15,000.
- **A shopkeeper** moves in like any tenant and keeps shop every day,
  weekends too, from about 9:30am to 8:30pm. The shop is open (its sign
  says so) only while they're in. They count towards the population.
- **Shoppers** arrive at the lobby while a shop is open, 10am–7:30pm: one
  every 40 minutes or so on a weekday, twice as many at weekends, and more
  again after 5pm. Each walks (or climbs, or rides) to the shop, browses
  for 15–40 minutes, pays, and leaves with a bag. They don't count towards
  the population.
- **Layout sets the takings.** A shopper spends $50–150 after an easy trip
  in. If it felt longer than 30 minutes (stairs and queueing count
  double, as for stress) they spend less, and once it has felt like an
  hour they give up and go home ("Gave up: too far"). A shopper who
  arrives after closing buys nothing either. A shop by the lobby earns
  about $13–14k a week; one three flights up by stairs alone, less.
- **Word gets around.** A shop that keeps letting shoppers down draws
  fewer of them (down to a quarter), so a jammed elevator isn't swamped
  by shoppers who won't buy anything. Shoppers who do buy still ride the
  elevators, so busy shops need good transit.
- **Daily takings.** Each sale goes into the shop's till ("sales today" in
  the top bar and the shop's tooltip), and every till is banked at
  midnight ("Sales +$1,500").
- **Quiet shops close.** At the Sunday-night review, a shop that has
  traded at least 3 full days that week and averaged under $700 a day
  closes ("Closed: too few shoppers") and goes back on the market with a
  fresh name. Its tooltip shows the week's average a day, and warns while
  it's on course to close. Shops sell on their own: what they take
  doesn't depend on the tower's studios.
</details>

<details>
<summary>Milestone 7: save/load & polish</summary>

Close the tab and pick up where you left off. That completed the first
playable version: build a tower, fill it, keep it calm, and reach 2★.

- **Your tower is saved** in your browser: automatically at the start of
  every game day, whenever you close or switch away from the tab, and when
  you press **Save**. It's one save slot, kept on this browser only (a
  different browser or device starts fresh).
- **Coming back** restores everything: the clock, money, stars, every room,
  stair and elevator, every person (even mid-climb or mid-ride), what
  each studio owes in rent, and where you'd scrolled to. The game starts
  paused with a welcome-back note; press Play or space to carry on.
- **New game** (top bar) throws the save away and starts an empty lot,
  after asking. Going bankrupt also deletes the save.
- Saves carry a version number. A save from an incompatible version of the
  game, or a damaged one, is ignored and you get a new game instead. If
  your browser blocks storage the game still works; Save just says it
  can't.
- Polish: error messages fade after a few seconds instead of sticking.
</details>

<details>
<summary>Milestone 6: stress & ratings</summary>

Everyone has a stress level, drawn black (calm), pink or red. Long trips
(stairs and queueing count double, over 30 minutes) and noise next door
(Woodwork 3, Pottery 2, Sewing 1, only while makers are at work;
residents only) raise it; resting
lowers it. At the Sunday-night review, a room averaging red moves out (a
condo's owners get their $30,000 back). Hover a room to see its stress and
noise. The tower reaches **2★ at 100 people**, and stars are never lost.
</details>

<details>
<summary>Milestone 5: economy & move-in</summary>

New rooms started empty and filled after a delay, with tenants walking in
from the lobby (never into a room nobody could reach). Condos sold for
$30,000 on move-in; studios paid rent weekly on Sunday night (pro-rated for
a mid-week move-in); elevators cost $1,000/day upkeep. A full game week
below $0 meant bankruptcy.
</details>

<details>
<summary>Milestone 4: people & transit</summary>

Makers commuted to their studios on weekdays (8:00–9:30 in, 16:30–18:00
out) and residents left their condos in the morning and came back in the
evening, with about half going out around midday on weekends. Everyone
entered and left through a lobby, walked along built floor, and took the
stairs or a self-running elevator. Unreachable rooms got a red **!**.
</details>

<details>
<summary>Milestone 3: the game clock</summary>

The sky cycled through a full day as the clock ticked forward, with
pause/play and 1x / 3x speed controls (spacebar toggles pause; 1 / 3 set
speed).
</details>

<details>
<summary>Milestone 2: placement</summary>

Pick a tool from the bottom toolbar:

- **Floor** — drag across tiles on one level to build floor there ($200/tile,
  only charged for tiles not already built).
- **Lobby / Sewing / Pottery / Woodwork / Jewellery / Condo** — click a built
  tile to place that room. A green outline means it's a legal spot; red means
  it isn't (missing floor, overlapping another room, or — for the lobby —
  not the ground floor). The reason for a red outline shows in the top bar.
- **Demolish** — click a room or floor tile to remove it, for half its cost
  back.

Left-click (or drag) builds. Right-click drag, or arrow keys / WASD, still
scrolls the camera. Nothing walks around the building yet — that starts at
milestone 4 (people & transit). Money only ever goes down for now; income
arrives at milestone 5 (economy).
</details>

<details>
<summary>Milestone 1: grid & camera</summary>

The screen showed a scrollable floor/tile grid, with floor numbers down the
left edge and ground/basement shaded differently.
</details>

<details>
<summary>Milestone 0: repo + "hello tower" page</summary>

The page loaded and drew a placeholder scene (sky, ground, one block for
the building), to prove the setup worked end to end before any real code.
</details>

## Stack

Plain HTML, CSS and JavaScript, drawn on an HTML5 `<canvas>`. No framework,
no build tools, no dependencies. This keeps every line of the game readable
and easy to explain, and it means the game can be played by opening a file
or visiting a GitHub Pages link.

## Files

- `index.html` — the page shell, canvas, and the HTML toolbar/topbar overlay.
- `grid.js` — the tower's coordinate system (tiles and floors) and the
  conversions between grid units and pixels.
- `camera.js` — what part of the grid is on screen, and the right-click-drag
  / keyboard controls that scroll it.
- `rooms.js` — the room and transit catalogue: widths, costs, colors, tenant
  counts, rent, sale prices and upkeep (starting numbers, for tuning).
- `world.js` — the building's actual state (floors, rooms, stairs,
  elevators, money) and the placement rules. Announces every change so
  people and elevators can react. Knows nothing about pixels or the mouse.
- `routing.js` — plans a route through the building (walk / stairs /
  elevator legs) and works out which rooms can be reached from a lobby.
- `elevators.js` — self-running elevator cars ("collective control").
- `people.js` — every tenant, shopper and hotel guest: moving in, their daily schedule,
  and how they work through a route.
- `economy.js` — who moves in (and out) when, condo sales and refunds,
  weekly rent, nightly shop takings, hotel nights and upkeep, and
  bankruptcy.
- `shops.js` — shops: when they're open, sending shoppers in, what each
  shopper spends (less after a long trip), and the day's takings.
- `hotels.js` — hotel rooms: bookings, checking guests in and out (early,
  if they're too stressed), reviews and occupancy, and nightly takings.
- `stress.js` — each person's stress: trips, noise, rest, and the weekly
  review that decides who moves out.
- `ratings.js` — the star rating and its population targets (2★ unlocks
  shops and hotel rooms).
- `save.js` — saving the whole game to the browser and loading it back,
  turning pointers between objects into ids and back.
- `input.js` — turns mouse events into grid coordinates and tool actions
  (left-click/drag builds; see camera.js for the right-click pan split).
- `clock.js` — game time as one number (minutes elapsed), and the pause/speed
  controls on top of it.
- `ui.js` — the HTML toolbar, money display, clock controls and status hint.
- `render.js` — draws everything each frame: the sky (colored by time of
  day), the grid, built floors, rooms, and a live green/red placement preview.
- `main.js` — the game loop: once per animation frame, poll held keys for
  panning, advance the simulation in small fixed steps (clock, elevators,
  people, shops, hotels, stress, economy, ratings), and redraw.
