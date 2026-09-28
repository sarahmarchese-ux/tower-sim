// The room catalogue. Every number here is a placeholder for tuning once we
// can actually play the game (milestone 5 is where the economy gets balanced
// for real) — what matters right now is that each room differs in width,
// cost, and (once milestone 6 adds stress) noise, the way the design doc's
// "Maker studios" table describes.
//
// `width` is in tiles. `groundOnly` enforces the design doc's rule that the
// lobby sits on the ground floor. `noise` isn't used by anything yet — it's
// here so milestone 6 (stress & ratings) has somewhere to read it from.

const STARTING_MONEY = 200000;
const FLOOR_COST_PER_TILE = 200;

const ROOM_TYPES = {
  lobby: { name: "Lobby", width: 20, cost: 0, color: "#d8c9a3", groundOnly: true, noise: 0 },
  sewing: { name: "Sewing Studio", width: 8, cost: 9000, color: "#c9a0dc", noise: 1 },
  pottery: { name: "Pottery Studio", width: 10, cost: 11000, color: "#d2965a", noise: 2 },
  woodwork: { name: "Woodwork Studio", width: 12, cost: 10000, color: "#8b5e34", noise: 3 },
  jewellery: { name: "Jewellery Studio", width: 6, cost: 15000, color: "#f4d35e", noise: 0 },
  condo: { name: "Condo", width: 16, cost: 20000, color: "#a3c9d8", noise: 0 },
};
