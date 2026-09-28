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

**Milestone 5: economy & move-in.** Money comes in now, and it can run out.

- **New rooms start empty.** A fresh studio says *For rent* and a fresh
  condo *For sale*. A few game hours later (always in the daytime,
  8:00–20:00) the new tenants turn up at the lobby and walk in.
- **A condo sells when its residents move in** ($30,000, paid once).
- **Studios pay rent every night at midnight** once their makers have
  moved in: Jewellery $2,500/day, Pottery $1,800, Sewing $1,600,
  Woodwork $1,300.
- **Elevators cost $1,000/day to run**, taken at the same midnight tally.
  Stairs are free. The top bar shows what last night's tally came to.
- **A room with the red !** (unreachable from a lobby) never fills. Connect
  it and it fills within an hour or two.
- **Bankruptcy.** Upkeep can push you below $0. The top bar then counts
  down; stay in the red for a full game week and the game is over.
  Demolishing things (for their refund) is one way back out.
- Demolishing refunds half the build cost, except a sold condo, which
  refunds nothing: it belongs to its owners now.
- Population only counts people who've moved in.

People still don't get stressed. That, move-outs and the 2★ rating come in
milestone 6 (stress & ratings).

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
- `economy.js` — who moves in when, condo sales, the nightly rent and
  upkeep tally, and bankruptcy.
- `input.js` — turns mouse events into grid coordinates and tool actions
  (left-click/drag builds; see camera.js for the right-click pan split).
- `clock.js` — game time as one number (minutes elapsed), and the pause/speed
  controls on top of it.
- `ui.js` — the HTML toolbar, money display, clock controls and status hint.
- `render.js` — draws everything each frame: the sky (colored by time of
  day), the grid, built floors, rooms, and a live green/red placement preview.
- `main.js` — the game loop: once per animation frame, poll held keys for
  panning, advance the simulation in small fixed steps (clock, elevators,
  people, economy), and redraw.
