// The tower's coordinate system.
//
// We think in two units, not pixels:
//   - "tile" = one horizontal unit of width (a column).
//   - "floor" = one vertical unit of height (a row). Floor 0 is ground level;
//     floors count UP as you go higher, matching how a real building numbers
//     floors — but screen Y increases DOWNWARD, so higher floors get drawn
//     nearer the top of the screen (smaller pixel Y). Floor -1, -2, ... are
//     basements, drawn below ground.
//
// Everything else (placing rooms, walking people, elevators) will work in
// tile/floor coordinates and only convert to pixels at the very end, when
// it's time to draw. Keeping game logic in grid units means the game plays
// the same however far you've zoomed or scrolled.

const TILE_SIZE = 24; // pixels per tile, at zoom level 1
const FLOOR_HEIGHT = 32; // pixels per floor, at zoom level 1

const Grid = {
  TILE_SIZE,
  FLOOR_HEIGHT,

  // Converts a tile column to an X pixel position, relative to the grid's
  // own origin (tile 0). The camera adds its own offset on top of this.
  tileToX(tile) {
    return tile * TILE_SIZE;
  },

  // Converts a floor number to a Y pixel position, relative to the grid's
  // own origin (the ground line at floor 0). Higher floors get a smaller
  // (more negative) Y, since floor 1's floor slab sits above floor 0's.
  floorToY(floor) {
    return -floor * FLOOR_HEIGHT;
  },

  // The inverse conversions, used when we need to turn a mouse click back
  // into "which tile and floor did the player click on?".
  xToTile(x) {
    return Math.floor(x / TILE_SIZE);
  },
  yToFloor(y) {
    return Math.ceil(-y / FLOOR_HEIGHT) - 1;
  },
};
