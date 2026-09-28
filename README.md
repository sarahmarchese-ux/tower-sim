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

**Milestone 6: stress & ratings.** Layout matters now: unhappy tenants
leave, and the tower earns its second star.

- **Everyone has a stress level**, shown by their colour: black when calm,
  pink when stressed, red when they're thinking of leaving. A pink or red
  dot on a room means its people are getting fed up.
- **Long trips stress people.** Door-to-door time counts, with stair
  climbing and elevator queueing counted double; anything over 30 minutes
  adds stress. An elevator to the 8th floor is fine; eight flights of
  stairs, or a jammed elevator at rush hour, is not. Not being able to get
  home at all is worse.
- **Noise stresses residents.** Each studio with makers in makes noise
  (Woodwork 3, Pottery 2, Sewing 1, Jewellery 0). It reaches the rooms
  touching it on the same floor, and rooms directly above and below. A
  condo resident at home in noise gets steadily more stressed. Makers
  don't mind noise. Zone the tower: workshops together, homes up and away.
- **Stress eases** while people rest, at home in quiet or out of the
  building.
- **Weekly review.** At Sunday midnight, any room whose people average
  red moves out. A condo's owners get their $30,000 back, as in SimTower,
  and the room goes back on the market. A departing studio still pays the
  rent it owes.
- **Hover a room** to see its stress and the noise reaching it.
- **Stars.** The tower starts at 1★ and reaches **2★ at 100 people**
  (the top bar shows progress). Stars are never lost.

2★ is the goal of the first playable version. Next is milestone 7 (save/load
& polish).

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
