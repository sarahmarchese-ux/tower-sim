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
with real mouse clicks (checking shops, hotel rooms, restaurants and
service rooms stay locked until 2★, then adding one of each, plus a café
and Housekeeping), runs 8 game days (checking the shop sells something,
the hotel rooms earn a night, makers have lunch at the café, the
restaurant sells dinners, some to residents or guests, and a housekeeper
cleans a room after a checkout), forces a break-in at the unprotected
shop (checking the money and the message) and two at the jewellery studio
(checking its tooltip names the cause of its stress), builds a Security
office and checks nothing under guard is ever robbed, hovers every room,
saves and reloads, exports a save file and loads it back in (turning away
one that isn't a save), demolishes things and keeps running. It fails on any page error,
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

**Milestone 12: service rooms.** The tower's first rooms that cost money
and earn nothing: Housekeeping and the Security office. Both unlock at
2★, both will be needed for 3★ (milestone 13), and both make placement
matter, because their staff have to get to the rooms they look after.

- **Housekeeping** is 8 tiles wide and costs $12,000, plus $500 a day in
  wages, paid at midnight like elevator upkeep (once its staff are
  hired). Two housekeepers move in like shopkeepers, count towards the
  population, and work every day, 9am–5pm.
- **Hotel rooms need cleaning.** Once guests check out (or leave early),
  their room needs cleaning, and it can't be booked again until a
  housekeeper has been, as in SimTower. A housekeeper goes to the nearest
  room waiting, cleans it for 45 minutes, and moves straight on to the
  next. Without Housekeeping, a tower's hotel rooms stop taking bookings
  once each one's guests have gone; the room says "Needs cleaning", and
  its tooltip says why.
- **How many it can look after.** In a test with one elevator,
  Housekeeping beside the hotel rooms kept 18 of them as busy as rooms
  that clean themselves (about 3.6 nights a week each). With 36 rooms,
  bookings fell by about 8%, and with 54 by about 11%, with rooms still
  waiting at the end of the day. So a hotel of 30 rooms or more wants a
  second Housekeeping.
- **Where it goes matters, for the staff.** Housekeeping 20 floors above
  the hotel rooms, on the same elevator, sent its housekeepers red
  ("mostly elevator waits, then long trips"): they quit at every weekly
  review, and bookings fell to 3.5 nights.
- **The Security office** is 8 tiles wide and costs $20,000, plus $800 a
  day in wages. Two guards work nights, 8pm–6am, and commute like makers.
  While a guard is on duty, an office protects its own floor and the 5
  floors above and below. Hover an office, or hold the Security tool, to
  see the floors it covers shaded.
- **Break-ins** start once the tower reaches 2★. Between midnight and
  5am, each shop, jewellery studio and hotel room with guests in has
  about a 1 in 20 chance a night: a shop loses $1,000–3,000 of stock,
  straight out of your money; a jewellery studio's maker loses tools and
  stock and gains 25 stress; hotel guests are robbed, and the stay gets
  the worst review. A message says what happened ("Break-in at the Craft
  Shop on 4F: $2,100 of stock taken"). Protected rooms are never robbed,
  and an unprotected one's tooltip warns "No security within 5 floors".
  In a test with four shops, a jewellery studio and a Single, there were
  10–11 break-ins in four weeks; with an office in reach, none.
- **Stress names its cause.** Everyone keeps a running total of the
  stress they've gained over the last 7 days, by cause: long trips,
  elevator waits, stairs, noise by day, noise in the evening, no route,
  and break-ins. Hover a pink or red room to see its people's top one
  or two: "stress 96 (red): mostly elevator waits, then long trips".
  "Long trips" is time on the move (walking, and riding in the car,
  stops for other people included) beyond a comfortable trip;
  "elevator waits" is time queueing for the car, and "stairs" time
  climbing. So a short hop pushed over by a long queue is all
  "elevator waits".
- **Stairs for short hops.** Routes are costed by how long the trip
  feels: a flight of stairs like 4 minutes, an elevator like a typical
  wait plus the ride, plus a bit for everyone already queueing at that
  shaft. So people take stairs that are on their way for a floor or
  two, and further when the elevator has a queue, rather than walking
  past them to wait for the car. Noise from the floor directly above or
  below counts as next door, and the warnings now say so.
- **Save file** (top bar) copies your tower out as text, or downloads it
  as a `.json` file, to keep or to send (say, to Claude, to look at a
  bug in your actual tower). Paste one in, or open its file, and press
  **Load** to play it instead: it's checked first, and a bad one changes
  nothing. The game pauses while the panel is open. In the claude.ai
  artifact, Download asks before saving the file.
- Both rooms together cost $1,300 a day, about $9,100 a week, so a tower
  needs steady income before it builds them.
- Hotel rooms in an older save load clean.

<details>
<summary>Milestone 11: the Restaurant</summary>

**Milestone 11: the Restaurant.** The tower's first room that's busy at
night, when residents and hotel guests are home. Evenings bring a fourth
rush to the elevators.

- **The Restaurant** unlocks at 2★, like shops and hotel rooms. It's 16
  tiles wide and costs $30,000. A restaurant owner moves in like a
  shopkeeper and keeps it open every day, about 5pm to 11pm. It serves
  dinner 6–11pm and seats 40. Diners stay 60–90 minutes and spend $40–80
  each. Takings are banked at midnight.
- **Diners from outside** come in from the lobby 6–9pm: steady on
  weeknights, twice as many on Fridays and Saturdays. Like shoppers,
  they spend less after a long trip in, and give up after one that feels
  like an hour.
- **Residents and hotel guests** eat there some evenings, at 7–9pm:
  residents about one night in four (one in two on Fridays and
  Saturdays), guests one in two. They go to the nearest restaurant
  that's open, has a seat, and isn't too far (about three flights of
  stairs, or an elevator ride); otherwise they eat at home. Nobody leaves
  the building for dinner, so a tower without a restaurant has quiet
  evenings.
- **It's noisy at dinner.** While it's serving, a restaurant gives off
  noise 2 (like a pottery studio) to the rooms beside it and directly
  above and below. Studios are empty by then, but residents and guests
  are home, and residents mind noise nearly four times as much from 6pm
  as by day. In a test, a condo over a restaurant went pink in its first
  week and moved out at the second weekly review. A Single beside one got
  poor reviews, and by the third week nobody was booking it, while a
  quiet Single was booked 4 nights a week. Beside or
  under studios is the place for it. Hovering a condo or hotel room
  shows its evening noise, with a warning when a restaurant is next door.
- In a test tower with 30 residents, a restaurant by the lobby took
  about $2,600 a weeknight and $4,100 on Fridays and Saturdays, about
  $21,000 a week. Up on the 9th floor it took nearly as much. A
  restaurant that averages under $1,000 a day closes at the weekly
  review ("Closed: too few diners").
- **Hover a restaurant** to see whether it's open, how many are dining,
  today's takings and this week's average a day.
- Residents and guests in an older save get their dinner times when it
  loads.
</details>

<details>
<summary>Milestone 10: food & lunch trips</summary>

Makers now take a lunch break, and the tower can feed them. Lunchtime
brings a third rush to the elevators, after the morning and the evening.

- **Lunch breaks.** On weekdays every maker takes a 30–45 minute break,
  starting some time between 11:30am and 1:30pm. With no café in the
  tower, they go out of the building and come back, as in SimTower:
  two more trips through the lobby each, in the middle of the day.
- **The Café** (available from the start, 1★) is 12 tiles wide and costs
  $16,000. A café owner moves in like a shopkeeper and keeps it open every
  day, about 8am to 4pm. Makers eat at the nearest café that's open and
  has a seat, unless it's much further than going out; each pays $15–25.
  A lunch crowd also comes in from the lobby, 11:30am–2pm (half as many
  at weekends), and spends the same. Takings are banked at midnight.
- **Where it goes matters.** A café by the elevator on the studios' floors
  feeds nearly every maker. One at the far end of a floor only feeds the
  makers on that floor. One high up the tower pulls everyone up a single
  elevator at once: in a test with 48 makers and one elevator, a café on
  the 10th floor stretched lunchtime waits past an hour, and a fifth of
  the makers moved out.
- **It's noisy at lunch.** While it's serving lunch on weekdays, a café
  gives off noise 1 (like a sewing studio) to the rooms around it. Keep
  it away from hotel rooms.
- In a test tower with 48 makers, a café by the elevator took about
  $1,300 on a weekday and $350 at weekends, about $7,000 a week. A café
  that averages under $300 a day closes at the weekly review, as quiet
  shops do ("Closed: too few diners").
- **Hover a café** to see whether it's open, how many are at lunch,
  today's takings and this week's average a day.
- Makers in an older save get their lunch breaks when it loads.
</details>

<details>
<summary>Milestone 9: hotel rooms</summary>

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
</details>

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
- `people.js` — every tenant, shopper and hotel guest: moving in, their
  daily schedule (makers' lunch breaks, residents' and guests' dinners,
  housekeepers' and guards' shifts included), and how they work through a
  route.
- `economy.js` — who moves in (and out) when, condo sales and refunds,
  weekly rent, nightly shop takings, hotel nights, upkeep and wages, and
  bankruptcy.
- `shops.js` — shops, cafés and restaurants: when they're open, sending
  shoppers (and the lunch crowd, and diners) in, what each spends (less
  after a long trip), the day's takings, and closing quiet ones.
- `cafes.js` — makers' lunch: which café (if any) each maker eats at, what
  they pay, and when a café is serving lunch (and noisy).
- `restaurants.js` — residents' and guests' dinners: who eats out tonight,
  at which restaurant, what they pay, and when a restaurant is serving
  dinner (and noisy).
- `hotels.js` — hotel rooms: bookings, checking guests in and out (early,
  if they're too stressed), reviews and occupancy, and nightly takings.
- `housekeeping.js` — cleaning hotel rooms after their guests leave: which
  housekeeper takes which room, and the 45 minutes it takes.
- `security.js` — night-time break-ins, and the Security offices whose
  guards stop them within 5 floors.
- `stress.js` — each person's stress: trips, noise, break-ins, rest, what
  caused it over the last week, and the weekly review that decides who
  moves out.
- `ratings.js` — the star rating and its population targets (2★ unlocks
  shops, hotel rooms, restaurants and service rooms).
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
