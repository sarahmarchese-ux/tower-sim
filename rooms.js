// The room catalogue. Every number here is a placeholder for tuning once we
// can actually play the game (milestone 5 is where the economy gets balanced
// for real) — what matters right now is that each room differs in width,
// cost, and (once milestone 6 adds stress) noise, the way the design doc's
// "Maker studios" table describes.
//
// `width` is in tiles. `groundOnly` enforces the design doc's rule that the
// lobby sits on the ground floor. `allowsTransit` marks rooms that stairs and
// elevators may pass through — only the lobby, an open hall, as in SimTower.
// `tenants` is how many people live or work there, and `role` says which
// daily schedule they follow (see people.js). `noise` isn't used by anything
// yet — it's here so milestone 6 (stress & ratings) has somewhere to read it.

const STARTING_MONEY = 200000;
const FLOOR_COST_PER_TILE = 200;

const ROOM_TYPES = {
  lobby: { name: "Lobby", width: 20, cost: 0, color: "#d8c9a3", groundOnly: true, allowsTransit: true, tenants: 0, noise: 0 },
  sewing: { name: "Sewing Studio", width: 8, cost: 9000, color: "#c9a0dc", tenants: 2, role: "maker", noise: 1 },
  pottery: { name: "Pottery Studio", width: 10, cost: 11000, color: "#d2965a", tenants: 2, role: "maker", noise: 2 },
  woodwork: { name: "Woodwork Studio", width: 12, cost: 10000, color: "#8b5e34", tenants: 3, role: "maker", noise: 3 },
  jewellery: { name: "Jewellery Studio", width: 6, cost: 15000, color: "#f4d35e", tenants: 1, role: "maker", noise: 0 },
  condo: { name: "Condo", width: 16, cost: 20000, color: "#a3c9d8", tenants: 3, role: "resident", noise: 0 },
};

// Stairs always join exactly two neighbouring floors. An elevator shaft can
// span up to `maxFloors`, and costs more the taller it is.
const TRANSIT_TYPES = {
  stairs: { name: "Stairs", width: 4, cost: 5000 },
  elevator: { name: "Elevator", width: 4, baseCost: 20000, costPerFloor: 1000, maxFloors: 30 },
};

function transitCost(kind, floorBottom, floorTop) {
  const type = TRANSIT_TYPES[kind];
  if (kind === "stairs") return type.cost;
  return type.baseCost + type.costPerFloor * (floorTop - floorBottom + 1);
}
