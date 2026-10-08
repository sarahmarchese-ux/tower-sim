// The tower's star rating: the scoreboard, and (later) the tech tree.
//
// Every tower starts at 1★. Each target below is a population to reach
// (and, from 3★ on, facilities to provide, once those exist). Stars are
// never taken away: a tower that dips back under a target keeps its stars,
// as in SimTower. 2★ at 100 people is the MVP's goal; it unlocks shops,
// hotel rooms, restaurants, Housekeeping and the Security office (rooms.js:
// `unlocksAt`).

const STAR_TARGETS = [
  { stars: 2, population: 100 },
];

// The target for a given star rating.
function starTarget(stars) {
  return STAR_TARGETS.find((target) => target.stars === stars);
}

const Ratings = {
  stars: 1,

  update() {
    const next = this.nextTarget();
    if (next && People.population() >= next.population) {
      this.stars = next.stars;
      UI.announce(`${"★".repeat(this.stars)} Your tower is now ${this.stars}-star! ${next.population} people live and work here.`);
    }
  },

  // The next target to aim for, or null once every star is earned.
  nextTarget() {
    return STAR_TARGETS.find((target) => target.stars > this.stars) || null;
  },
};
