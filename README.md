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

## Status

**Milestone 7: save/load & polish.** Close the tab and pick up where you
left off. That completes the first playable version: build a tower, fill
it, keep it calm, and reach 2★.

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
- `people.js` — every tenant: moving in, their daily schedule, and how
  they work through a route.
- `economy.js` — who moves in (and out) when, condo sales and refunds,
  weekly rent, nightly upkeep, and bankruptcy.
- `stress.js` — each person's stress: trips, noise, rest, and the weekly
  review that decides who moves out.
- `ratings.js` — the star rating and its population targets.
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
  people, stress, economy, ratings), and redraw.
