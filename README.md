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

**Milestone 2: placement.** Pick a tool from the bottom toolbar:

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
- `rooms.js` — the room catalogue: widths, costs, colors (placeholder
  numbers, tuned for real once the game is playable).
- `world.js` — the building's actual state (floors, rooms, money) and the
  placement rules. Knows nothing about pixels or the mouse.
- `input.js` — turns mouse events into grid coordinates and tool actions
  (left-click/drag builds; see camera.js for the right-click pan split).
- `ui.js` — the HTML toolbar, money display and status hint.
- `render.js` — draws everything each frame: the grid, built floors, rooms,
  and a live green/red preview of what the selected tool would do next.
