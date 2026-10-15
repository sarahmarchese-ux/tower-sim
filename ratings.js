// The tower's star rating: the scoreboard, and the tech tree.
//
// Every tower starts at 1★. Each target below is a population to reach
// and, from 3★ on, rooms the tower must have (`needs`). Stars are never
// taken away: a tower that dips back under a target keeps its stars, as in
// SimTower. 2★ at 100 people unlocks shops, hotel rooms, restaurants,
// Housekeeping and the Security office; 3★ at 300 people, with a
// Housekeeping room and a Security office whose staff are hired, unlocks
// basements, Parking and the Snack Bar (rooms.js: `unlocksAt`,
// BASEMENTS_AT_STARS).

const STAR_TARGETS = [
  { stars: 2, population: 100, unlocks: "Shops, hotel rooms, the Restaurant and service rooms unlock." },
  { stars: 3, population: 300, needs: ["housekeeping", "security"], unlocks: "Basements, Parking and the Snack Bar unlock." },
];

// Rooms a star can need, and how the checklist names them. "Staffed" means
// its staff are hired (the room is occupied), whether or not they're on
// shift right now.
const STAR_NEEDS = {
  housekeeping: "Housekeeping",
  security: "Security office",
};

// The target for a given star rating.
function starTarget(stars) {
  return STAR_TARGETS.find((target) => target.stars === stars);
}

// What it takes to reach a target, for a locked button's reason:
// "grow the tower to 300 people, with Housekeeping and a Security office".
function howToReach(target) {
  const needs = (target.needs || []).map((need) => (need === "security" ? "a Security office" : STAR_NEEDS[need]));
  return needs.length
    ? `grow the tower to ${target.population} people, with ${needs.join(" and ")}`
    : `grow the tower to ${target.population} people first`;
}

const Ratings = {
  stars: 1,

  update() {
    const next = this.nextTarget();
    if (!next || People.population() < next.population) return;
    if (!this.checklist(next).every((item) => item.done)) return;
    this.stars = next.stars;
    UI.announce(`${"★".repeat(this.stars)} Your tower is now ${this.stars}-star! ${next.population} people live and work here. ${next.unlocks}`);
  },

  // The next target to aim for, or null once every star is earned.
  nextTarget() {
    return STAR_TARGETS.find((target) => target.stars > this.stars) || null;
  },

  // The rooms a target needs, and whether the tower has each one staffed.
  checklist(target) {
    return (target.needs || []).map((need) => ({
      label: STAR_NEEDS[need],
      done: World.rooms.some((room) => room.type === need && room.status === "occupied"),
    }));
  },
};
