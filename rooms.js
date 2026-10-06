// The room catalogue. Every number here is a starting point for tuning —
// what matters is that each room differs in width, cost, income and
// noise, the way the design doc's "Maker studios"
// table describes.
//
// `width` is in tiles. `groundOnly` enforces the design doc's rule that the
// lobby sits on the ground floor. `allowsTransit` marks rooms that stairs and
// elevators may pass through — only the lobby, an open hall, as in SimTower.
// `tenants` is how many people live or work there, and `role` says which
// daily schedule they follow (see people.js). `noise` is how loud a studio
// is once its makers are in; it stresses residents next door (stress.js).
//
// Money in (milestone 5, see economy.js): studios pay `rentPerWeek` every
// Sunday night, for the days their makers were in; a condo pays `salePrice`
// once, when its residents move in. Jewellery earns the most per tile and
// woodwork the least, so the roomy, loud studio is the cheap one.
//
// A shop (milestone 8, see shops.js) has one shopkeeper and earns from the
// shoppers who visit it: each spends around `spendPerShopper`, and the
// day's takings are banked at midnight. `unlocksAt` is the star rating a
// room type needs before it can be built.
//
// A hotel room (milestone 9, see hotels.js) has no tenants of its own:
// parties of up to `tenants` guests book it for a night or a few, and it
// earns `ratePerNight` for every night someone sleeps in it. There are two
// sizes, as in SimTower: a Single for a buyer on their own, and a Twin for
// a pair of tourists. `parties` says who a room takes; a Twin takes a lone
// buyer too when every Single is taken, but a buyer pays the Single rate.

const STARTING_MONEY = 200000;
const FLOOR_COST_PER_TILE = 200;

const ROOM_TYPES = {
  lobby: { name: "Lobby", width: 20, cost: 0, color: "#d8c9a3", groundOnly: true, allowsTransit: true, tenants: 0, noise: 0 },
  sewing: { name: "Sewing Studio", width: 8, cost: 9000, color: "#c9a0dc", tenants: 2, role: "maker", noise: 1, rentPerWeek: 11200 },
  pottery: { name: "Pottery Studio", width: 10, cost: 11000, color: "#d2965a", tenants: 2, role: "maker", noise: 2, rentPerWeek: 12600 },
  woodwork: { name: "Woodwork Studio", width: 12, cost: 10000, color: "#8b5e34", tenants: 3, role: "maker", noise: 3, rentPerWeek: 9100 },
  jewellery: { name: "Jewellery Studio", width: 6, cost: 15000, color: "#f4d35e", tenants: 1, role: "maker", noise: 0, rentPerWeek: 17500 },
  condo: { name: "Condo", width: 16, cost: 20000, color: "#a3c9d8", tenants: 3, role: "resident", noise: 0, salePrice: 30000 },
  shop: { name: "Craft Shop", width: 10, cost: 15000, color: "#8fd1a8", tenants: 1, role: "shopkeeper", noise: 0, spendPerShopper: [50, 150], unlocksAt: 2 },
  single: { name: "Single Room", width: 6, cost: 10000, color: "#e9a6a6", tenants: 1, role: "guest", noise: 0, ratePerNight: 2000, parties: ["buyer"], unlocksAt: 2 },
  twin: { name: "Twin Room", width: 10, cost: 17000, color: "#e08f9a", tenants: 2, role: "guest", noise: 0, ratePerNight: 2800, parties: ["tourists", "buyer"], unlocksAt: 2 },
};

// Stairs always join exactly two neighbouring floors. An elevator shaft can
// span up to `maxFloors`, and costs more the taller it is. Elevators also
// cost `upkeepPerDay` to run, taken at the nightly tally; stairs are free.
const TRANSIT_TYPES = {
  stairs: { name: "Stairs", width: 4, cost: 5000, upkeepPerDay: 0 },
  elevator: { name: "Elevator", width: 4, baseCost: 20000, costPerFloor: 1000, maxFloors: 30, upkeepPerDay: 1000 },
};

// Single and Twin rooms are both hotel rooms.
function isHotel(room) {
  return ROOM_TYPES[room.type].role === "guest";
}

function transitCost(kind, floorBottom, floorTop) {
  const type = TRANSIT_TYPES[kind];
  if (kind === "stairs") return type.cost;
  return type.baseCost + type.costPerFloor * (floorTop - floorBottom + 1);
}

// Demolishing a room refunds half its build cost — except a condo that has
// been sold. It belongs to its owners now, so knocking it down gets you
// nothing back. Otherwise selling, demolishing and rebuilding the same
// condo would pay better than building anything new.
function roomRefund(room) {
  const type = ROOM_TYPES[room.type];
  if (type.salePrice && room.status === "occupied") return 0;
  return type.cost / 2;
}
