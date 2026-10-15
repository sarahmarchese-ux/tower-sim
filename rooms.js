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
// shoppers who visit it, and the day's takings are banked at midnight.
// `unlocksAt` is the star rating a room type needs before it can be built.
// A café (milestone 10) works the same way, with its own hours and
// visitors: makers on their lunch break, and a lunch crowd from outside.
// So does a restaurant (milestone 11, see restaurants.js), in the evening:
// residents and hotel guests some nights, and diners from outside, who
// come in twice as often on Fridays and Saturdays (`dayRush`, Mon ... Sun).
// The Snack Bar (milestone 14, see snackbars.js) unlocks at 3★: cheap and
// quick, open all day, every day, for shoppers on their way out of a shop,
// makers with no café seat, residents and guests at lunchtime, and a small
// crowd of its own.
// Shops, cafés, restaurants and Snack Bars are "storefronts": `keeperHours`
// is when the keeper is in (the room is open), and `visitors` says when
// visitors come from the lobby, how often, how long they stay and what they
// spend. A café is noisy (`noise`) only while it's serving lunch, a
// restaurant only while it's serving dinner, and a Snack Bar while it
// serves (`servingHours`), as a studio is only while its makers work.
//
// A hotel room (milestone 9, see hotels.js) has no tenants of its own:
// parties of up to `tenants` guests book it for a night or a few, and it
// earns `ratePerNight` for every night someone sleeps in it. There are two
// sizes, as in SimTower: a Single for a buyer on their own, and a Twin for
// a pair of tourists. `parties` says who a room takes; a Twin takes a lone
// buyer too when every Single is taken, but a buyer pays the Single rate.
//
// Service rooms (milestone 12) cost money and earn nothing. Their staff
// move in like any tenant, count towards the population and work
// `shiftHours` (arrive, leave), and each room costs `wagesPerDay`, paid at
// the midnight tally once its staff are hired. Housekeeping
// (housekeeping.js) cleans hotel rooms after their guests check out. A
// Security office (security.js) stops break-ins on its own floor and the
// `reach` floors above and below, while its guards are on duty.
//
// Basements (milestone 13) can be dug from BASEMENTS_AT_STARS, down to
// BASEMENT_FLOORS below ground, and digging costs DIG_COST_PER_TILE, twice
// the cost of floor above ground. Studios, condos and hotel rooms need daylight
// (`underground: false`); Parking (parking.js) goes nowhere else
// (`basementOnly`). A car park has `spaces` for drivers' cars, and brings
// them in on top of the walk-in visitors.
//
// From milestone 14b a car park is dragged along a basement floor in bays
// of `bayWidth` tiles, `spacesPerBay` spaces and `costPerBay` each, so it
// can be any size. Its `width` and `cost` are what a car park was before
// then (16 tiles, 20 spaces, $20,000), which a car park in an older save
// still is. Rooms that can be any width (`sized`) keep their own `width`,
// and what was paid for them (`paid`), on the room: see roomWidth and
// roomCost below.
//
// Decorations (milestone 14b) are just for looks: planters, benches, murals
// and fountains, unlocked from the start, on any floor above ground. They
// have no tenants, make no noise and pass none (noise on a floor only
// travels between rooms that touch, so one between two rooms keeps them
// apart, as a gap does), and stairs and elevators can go through them, as
// through the lobby. A Planter Strip is dragged along a floor, any width,
// at `costPerTile`; the rest are clicked, like rooms.

const STARTING_MONEY = 200000;
const FLOOR_COST_PER_TILE = 200;
const DIG_COST_PER_TILE = 400;
const BASEMENT_FLOORS = 10; // B1 to B10
const BASEMENTS_AT_STARS = 3;

const ROOM_TYPES = {
  lobby: { name: "Lobby", width: 20, cost: 0, color: "#d8c9a3", groundOnly: true, allowsTransit: true, tenants: 0, noise: 0 },
  sewing: { name: "Sewing Studio", width: 8, cost: 9000, color: "#c9a0dc", underground: false, tenants: 2, role: "maker", noise: 1, rentPerWeek: 11200 },
  pottery: { name: "Pottery Studio", width: 10, cost: 11000, color: "#d2965a", underground: false, tenants: 2, role: "maker", noise: 2, rentPerWeek: 12600 },
  woodwork: { name: "Woodwork Studio", width: 12, cost: 10000, color: "#8b5e34", underground: false, tenants: 3, role: "maker", noise: 3, rentPerWeek: 9100 },
  jewellery: { name: "Jewellery Studio", width: 6, cost: 15000, color: "#f4d35e", underground: false, tenants: 1, role: "maker", noise: 0, rentPerWeek: 17500 },
  condo: { name: "Condo", width: 16, cost: 20000, color: "#a3c9d8", underground: false, tenants: 3, role: "resident", noise: 0, salePrice: 30000 },
  shop: {
    name: "Craft Shop", width: 10, cost: 15000, color: "#8fd1a8", tenants: 1, role: "shopkeeper", noise: 0, unlocksAt: 2,
    keeperHours: [[9, 10], [20, 21]], // arrives 9–10am, leaves 8–9pm
    visitors: {
      who: "shoppers", hours: [10, 19.5], gapMinutes: 40, weekendRush: 2, eveningRush: 1.5, max: 8,
      stayMinutes: [15, 40], spend: [50, 150], quietPerDay: 700,
    },
  },
  cafe: {
    name: "Café", width: 12, cost: 16000, color: "#f2c48d", tenants: 1, role: "shopkeeper", noise: 1,
    keeperHours: [[7.5, 8.5], [15.5, 16.5]], // arrives 7:30–8:30am, leaves 3:30–4:30pm
    visitors: {
      who: "diners", hours: [11.5, 14], gapMinutes: 4, weekendRush: 0.5, eveningRush: 1, max: 14,
      stayMinutes: [20, 35], spend: [15, 25], quietPerDay: 300,
    },
    lunchHours: [11.5, 14], // when it's busy (and noisy) on weekdays
  },
  restaurant: {
    name: "Restaurant", width: 16, cost: 30000, color: "#bfc78a", tenants: 1, role: "shopkeeper", noise: 2, unlocksAt: 2,
    keeperHours: [[16.5, 17.5], [23, 23.5]], // arrives 4:30–5:30pm, leaves 11–11:30pm
    visitors: {
      who: "diners", hours: [18, 21], gapMinutes: 5, dayRush: [1, 1, 1, 1, 2, 2, 1], eveningRush: 1, max: 30,
      stayMinutes: [60, 90], spend: [40, 80], quietPerDay: 1000,
    },
    dinnerHours: [18, 23], // when it's busy (and noisy), every day
  },
  snackbar: {
    name: "Snack Bar", width: 8, cost: 10000, color: "#f0a868", tenants: 1, role: "shopkeeper", noise: 1, unlocksAt: 3,
    keeperHours: [[9.5, 10], [21, 21.5]], // arrives 9:30–10am, leaves 9–9:30pm
    visitors: {
      who: "customers", hours: [10, 20.5], gapMinutes: 20, weekendRush: 2, eveningRush: 1, max: 6,
      stayMinutes: [10, 15], spend: [8, 12], quietPerDay: 200,
    },
    servingHours: [10, 21], // when it's busy (and noisy), every day
  },
  single: { name: "Single Room", width: 6, cost: 10000, color: "#e9a6a6", underground: false, tenants: 1, role: "guest", noise: 0, ratePerNight: 2000, parties: ["buyer"], unlocksAt: 2 },
  twin: { name: "Twin Room", width: 10, cost: 17000, color: "#e08f9a", underground: false, tenants: 2, role: "guest", noise: 0, ratePerNight: 2800, parties: ["tourists", "buyer"], unlocksAt: 2 },
  housekeeping: {
    name: "Housekeeping", plural: "Housekeeping rooms", width: 8, cost: 12000, color: "#b8d8d0", tenants: 2, role: "housekeeper", noise: 0, unlocksAt: 2,
    shiftHours: [[8.75, 9.25], [16.75, 17.25]], // 9am–5pm, every day
    wagesPerDay: 500,
  },
  security: {
    name: "Security Office", width: 8, cost: 20000, color: "#9fb0c8", tenants: 2, role: "guard", noise: 0, unlocksAt: 2,
    shiftHours: [[19.5, 20.5], [5.5, 6.5]], // 8pm–6am, every night
    wagesPerDay: 800,
    reach: 5, // floors above and below it protects
  },
  parking: {
    name: "Parking", plural: "Car parks", width: 16, cost: 20000, color: "#9a9a92", tenants: 0, noise: 0, unlocksAt: 3, basementOnly: true,
    sized: true, bayWidth: 4, spacesPerBay: 5, costPerBay: 25000,
  },
  planterStrip: { name: "Planter Strip", plural: "Planter strips", width: 1, cost: 5000, costPerTile: 5000, sized: true, color: "#7fb069", decoration: true, allowsTransit: true, underground: false, tenants: 0, noise: 0 },
  planter: { name: "Planter", width: 2, cost: 10000, color: "#6a9f58", decoration: true, allowsTransit: true, underground: false, tenants: 0, noise: 0 },
  bench: { name: "Bench", plural: "Benches", width: 4, cost: 20000, color: "#b98b5e", decoration: true, allowsTransit: true, underground: false, tenants: 0, noise: 0 },
  mural: { name: "Mural", width: 6, cost: 30000, color: "#d98bb0", decoration: true, allowsTransit: true, underground: false, tenants: 0, noise: 0 },
  fountain: { name: "Fountain", width: 8, cost: 40000, color: "#8cc7e8", decoration: true, allowsTransit: true, underground: false, tenants: 0, noise: 0 },
};

// Stairs always join exactly two neighbouring floors. An elevator shaft can
// span up to `maxFloors`, and costs more the taller it is. Elevators also
// cost `upkeepPerDay` to run, taken at the nightly tally; stairs are free.
// Anything with a car (`capacity`, the most it holds) is a lift, run by
// elevators.js. A Staff Lift (milestone 14b) is a narrow, cheaper lift with
// a small car that only housekeepers and guards ride (`staffOnly`), so
// they don't queue with everyone else; it unlocks with them, at 2★.
const TRANSIT_TYPES = {
  stairs: { name: "Stairs", width: 4, cost: 5000, upkeepPerDay: 0 },
  elevator: { name: "Elevator", width: 4, baseCost: 20000, costPerFloor: 1000, maxFloors: 30, upkeepPerDay: 1000, capacity: 8 },
  staffLift: {
    name: "Staff Lift", plural: "Staff lifts", width: 2, baseCost: 10000, costPerFloor: 500, maxFloors: 30, upkeepPerDay: 500, capacity: 4,
    staffOnly: true, unlocksAt: 2,
  },
};

// Rent levels (milestone 14b), set room by room on studios, condos and
// hotel rooms (`room.rentLevel`; none means Normal). A level scales a
// studio's rent, a condo's price and a hotel room's nightly rate
// (`factor`), and moves the stress at which tenants give up (`line`): a
// studio's makers move out at the weekly review, and hotel guests leave
// early, at or above it. Rooms still turn pink and red at the usual
// stress, so a layout problem still shows. Cheaper rooms also fill faster
// (`letSpeed`: new tenants arrive that many times as fast) and get booked
// more (`bookings`), and a hotel stay's review bands move with the line
// (stress.js, hotels.js). A condo's price, and the line its residents
// keep, are fixed when it sells (`room.soldAtLevel`); a hotel stay's when
// it's booked (`room.stayLevel`).
const RENT_LEVELS = {
  high: { name: "High", factor: 1.25, line: 55, letSpeed: 0.5, bookings: 0.75 },
  normal: { name: "Normal", factor: 1, line: 65, letSpeed: 1, bookings: 1 },
  low: { name: "Low", factor: 0.8, line: 75, letSpeed: 2, bookings: 1.25 },
  veryLow: { name: "Very low", factor: 0.6, line: 85, letSpeed: 4, bookings: 1.5 },
};

// Shops, cafés, restaurants and Snack Bars: rooms with a keeper that sell
// to visitors (shops.js).
function isStorefront(room) {
  return !!ROOM_TYPES[room.type].visitors;
}

// Single and Twin rooms are both hotel rooms.
function isHotel(room) {
  return ROOM_TYPES[room.type].role === "guest";
}

// What a tile of floor costs to build: dug out below ground, more.
function floorTileCost(floor) {
  return floor < 0 ? DIG_COST_PER_TILE : FLOOR_COST_PER_TILE;
}

// Does this kind of transit have a car (an elevator or a staff lift)?
function isLift(kind) {
  return TRANSIT_TYPES[kind].capacity !== undefined;
}

// How many tiles wide a room is: its own width, for a room that can be any
// size, or its type's.
function roomWidth(room) {
  return room.width ?? ROOM_TYPES[room.type].width;
}

// What a room cost to build: what was paid, for one that can be any size,
// or its type's price. (A car park from before they were priced per space
// cost $20,000, its type's old price.)
function roomCost(room) {
  return room.paid ?? ROOM_TYPES[room.type].cost;
}

// What a room of this type and width would cost.
function sizedCost(typeKey, width) {
  const type = ROOM_TYPES[typeKey];
  if (type.costPerTile) return type.costPerTile * width;
  if (type.costPerBay) return type.costPerBay * (width / type.bayWidth);
  return type.cost;
}

// A car park's spaces: 5 a bay, so 20 in an old 16-tile one.
function parkingSpaces(carPark) {
  const type = ROOM_TYPES.parking;
  return (roomWidth(carPark) / type.bayWidth) * type.spacesPerBay;
}

// Studios, condos and hotel rooms have a rent level; shops, cafés,
// restaurants and Snack Bars pay no rent and have none.
function hasRentLevel(room) {
  const role = ROOM_TYPES[room.type].role;
  return role === "maker" || role === "resident" || role === "guest";
}

// A room's rent level, as set now (for a condo, its next sale's; for a
// hotel room, its next booking's).
function rentLevel(room) {
  return RENT_LEVELS[room.rentLevel] ? room.rentLevel : "normal";
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
  return roomCost(room) / 2;
}
