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

## Controls

Pick something from the toolbar along the bottom, then click to build (drag
for Floor, the Lobby and Elevator). Esc, a right-click, or clicking its
button again puts it down. Scroll around with a right-drag, the mouse wheel
(or a trackpad), or the arrow keys / WASD. Hover a room or an elevator shaft
for details. With nothing picked, click a studio, condo or hotel room to set
its rent level. Space pauses, and 1 and 3 set the speed.

On a touch screen, tap to build, and drag a finger to scroll (or, with
Floor, Lobby or Elevator picked, to build along the drag; two fingers still
scroll). Tap a room for its details (and, for a studio, condo or hotel room,
its rent level).

## Tests

Two test files, both run by GitHub Actions on every pull request
(`.github/workflows/smoke.yml`), and both with `npm test`.

**`tests/sim.mjs`** checks the game's rules without a browser, in about 15
seconds, with nothing to install (`npm run sim`). It loads the game's logic
into a sandbox with seeded dice, builds towers through the game's own
functions, and checks: someone at the front of an elevator queue keeps their
place while someone at the back of a long one switches; each full carload
ahead costs a round trip; a full car stops only to let people off; people
take stairs for a floor or two (and into a basement) and really climb them;
midnight rent, payday, upkeep and wages; condo sales and refunds; the weekly
review (red studios move out, quiet shops close); hotel stays of 1–3 nights
(1–2 from a Friday or Saturday); break-ins only at night from 2★ and never
under guard, and the warning when guards can't reach their office; a keeper
staying for a late shopper; seats held by diners on their way; visitors
turning back from a shop that closes; people rerouting when a lobby is
demolished; basements (3★, B10, which rooms, half back); the car park's
warnings; the Snack Bar (3★, any storefront spot, basements included):
shoppers stopping for a snack after a shop next door (about 1 in 3) but
not after one three floors down, drivers coming too, makers eating there
only when the café is full and heading back to work before their break
is over, residents at weekends and guests any day coming down at
lunchtime, its noise from 10am to 9pm, a quiet one closing, and a save
reloading with someone mid-snack; decorations (a bench between a woodwork
studio and a condo keeps the noise out, one above doesn't, shafts go
through them, none in a basement, half back); staff lifts (housekeepers and
guards ride one and nobody else does, staff still take a public elevator
when it's quicker, at most 4 aboard, 2★, prices and upkeep, and the warning
when no staff can reach one); car parks by the bay, and an old one keeping
its 20 spaces and $10,000 refund; rent levels (a studio at Low pays 80% and
keeps makers at stress 70, at High loses them at 60, a condo sells and
refunds at its level and its owners keep their line, a Very low hotel room
books more often, earns less and keeps its guests at 70); a studio whose
makers left stressed sitting empty for days, and a rebuilt one re-letting in
hours; a save reloading to the very same game,
which then plays on the same; and a save that won't load being kept. It also loads a real player's
tower, `tests/saves/day-85.json` (a 3★ game on day 85: 14 floors, about 300
people, nine elevators and four car parks), checks it saves back the same,
and plays it for a day: drivers come, shops sell, money goes up, and it
keeps its people and its third star. Then it loads it again, adds a staff
lift, a planter strip, a 2-bay car park and rent levels, checks that saves
and reloads the same, and plays on. Those two take most of the time.

**`tests/smoke.mjs`** plays the game in headless Chromium. It builds a
small tower with real mouse clicks (checking shops, hotel rooms,
restaurants and service rooms stay locked until 2★, and that building cost
exactly what it should), runs 8 game days (checking the shop sells
something, the hotel rooms earn a night, makers sit down to lunch at the
café, the restaurant sells dinners, some to residents or guests, and a
housekeeper cleans a room after a checkout), forces break-ins (checking the
money, the message and the stress tooltip), builds a Security office and
runs three nights with every valuable room tried every night (nothing is
taken), checks the 3★ checklist and the basement, Parking and Snack Bar locks,
digs a basement, builds a Snack Bar on B1, drags out a 4-bay car park
($100,000, 20 spaces), runs it (and the Snack Bar) for 2 days, builds a
bench and a planter strip from the Decor button (and not a fountain in the
basement) and a staff lift (locked before 2★; hovering it says it's staff
only), clicks a studio with no tool to open its rent panel and sets its
floor to Low, demolishes the bench and staff lift for half back, hovers every room with people in it
and the elevator shaft, and tries the controls: Space, 1 and 3, WASD and
the arrows, a right-drag, the wheel, Esc and a right-click to put a tool
down, losing focus mid-drag, and the Save file panel and New game question
(keys off behind them, Space and Esc). It saves and reloads (checking the
whole save comes back the same), exports a save file and loads it back in
(turning away one that isn't a save, or is from a newer version),
demolishes the car park with drivers about, checks a second tab's save
stops the first from saving over it, that a save that won't load is kept
for Save file's Old save, that New game starts over, and, on a phone-sized
touch screen, that the lobby starts in view, a tap builds and a drag
scrolls. It fails on any page error, `console.error` or frozen game loop.
To run it yourself:

```
npm install
npx playwright install chromium   # first time only
npm run smoke
```

(The game itself still needs no install; `package.json` is only for the tests.)

## Status

**Milestone 14b: decorations, staff lifts and rent.** Things for a rich
tower to spend on, and new levers against stress.

- **Decorations** are unlocked from the start, under the toolbar's
  **Decor** button: a **Planter Strip** dragged along a floor ($5,000 a
  tile, any width), a **Planter** (2 tiles, $10,000), a **Bench** (4,
  $20,000), a **Mural** (6, $30,000) and a **Fountain** (8, $40,000).
  They go on any floor above ground, the ground floor included, but not
  in basements. They're just for looks: no effect on stress, takings or
  reviews. They don't pass noise: on a floor, noise only travels between
  rooms that touch, so one between two rooms keeps them apart, as a gap
  does. (Noise to the floors above and below is as before.) Stairs and
  elevators can be built through them, as through a lobby, and
  demolishing one refunds half.
- **The Staff Lift** unlocks at 2★, with Housekeeping and Security. It's
  2 tiles wide with a car for 4, costs $10,000 + $500 a floor and $500 a
  day, spans up to 30 floors, and runs like an elevator (0.5 min a floor,
  1 min a stop). It's built and extended by dragging, as elevators are.
  Only housekeepers and guards ride it. They take whichever way is
  quickest: a staff lift, an elevator or the stairs. Everyone else plans
  as if it weren't there. Its shaft is drawn brown. Hover it to see how
  it's coping, plus who used it today ("Staff only: 2 housekeepers and 1
  guard used it today"). It warns when no Housekeeping or Security
  office's staff can get to it.
- In a test tower with Housekeeping on the 13th floor, hotel rooms on the
  2nd to 4th, and 104 makers sharing one elevator, both housekeeping
  crews were at stress 84–97 by Sunday and quit at the first weekly
  review, in each of three runs. With a staff lift beside them, they
  stayed at 0–65 and nobody quit. A staff lift spares staff the queues,
  not the distance: Housekeeping 20 floors from the hotel rooms still
  means waits of 10–20 minutes for its one car.
- **Parking is priced per space.** A car park is dragged along a basement
  floor in bays of 4 tiles and 5 spaces, at $25,000 a bay ($5,000 a
  space). One bay is the smallest; the old 16-tile car park is now 4
  bays, 20 spaces, $100,000. There's still no fee and no upkeep. Car
  parks in an older save keep their 20 spaces, and demolishing one
  refunds half of the $20,000 it cost.
- **Rent levels.** Click a studio, condo or hotel room with no tool picked
  (or tap it) to set its level, or press **Set for this floor** to give
  every studio, condo and hotel room on its floor the same one:

  | Level | Rent, price, rate | Moves out (or leaves early) at stress | New tenants or bookings |
  | --- | --- | --- | --- |
  | High | 125% | 55 | half as fast; bookings ×0.75 |
  | Normal | 100% | 65 | as before |
  | Low | 80% | 75 | twice as fast; bookings ×1.25 |
  | Very low | 60% | 85 | four times as fast; bookings ×1.5 |

  A level moves where tenants draw the line, not how fast they get
  stressed: rooms still turn pink at 35 and red at 65, so a layout
  problem still shows. A studio's level applies at once, rent and line
  alike, so raising the rent on a stressed studio can push its makers out
  at the next review. A condo's price is fixed when it sells, its owners
  keep the line that price gave them, and a refund pays back what they
  paid. A hotel room's level applies from the next booking, and a stay
  keeps the rate, the early-checkout line and the review bands (moved by
  the same 10 points a level) it was booked at. Shops, cafés,
  restaurants and Snack Bars pay no rent and have no level. A small tag
  ("−20%", "+25%") marks a room at another level, and its tooltip says
  "Low rent (80%): moves out at stress 75".
- **Moving out stressed now costs something.** A studio or condo whose
  tenants moved out stressed is hard to let: nobody moves in for 1–3 game
  days (half that at Low, double at High), and it says so ("Hard to let:
  last tenants left stressed"). A room that empties for any other reason,
  or is knocked down and rebuilt, re-lets in hours, as before.
- In a test with 12 Singles beside Housekeeping over two weeks, Singles at
  Low were booked 5–5⅓ nights in the second week against 3½ at Normal,
  and earned a little more ($16,000–17,100 a room over the two weeks,
  against $14,000–15,700). Very low filled them more (4⅔–5 nights) but
  earned less ($12,000–12,800), and High emptied them (2–2⅓ nights, about
  $12,000–12,500). So a lower rate pays only where it fills rooms that
  would sit empty.
- The day-85 save, and any save from before, loads and saves back
  unchanged; its four car parks keep 20 spaces each.
- **The lobby is drawn tile by tile.** Drag along the ground floor to
  build it, as wide as you like, from a single tile (still free). Lobby
  drawn touching lobby joins it, so a lobby built a bit at a time, or
  between two others, is one long hall. Demolish takes it down a tile at
  a time too: a tile off either end shortens it, and one from the middle
  splits it in two. Lobbies in an older save stay 20 tiles wide.

<details>
<summary>Milestone 14: the Snack Bar</summary>

**Milestone 14: the Snack Bar.** Cheap, quick food, open all day, every
day, and the first room where one visit leads into another: shoppers stop
for a snack on their way out of a shop.

- **The Snack Bar** unlocks at 3★. It's 8 tiles wide and costs $10,000.
  Its keeper is in about 9:30am–9:30pm, and it serves 10am–9pm every day,
  with 12 seats. A meal is $8–12 and takes 10–15 minutes. It goes
  wherever shops, cafés and restaurants go, basements included.
- **Its own customers** walk in about every 20 minutes, 10am–8:30pm
  (twice as often at weekends), up to 6 at a time, with drivers half as
  many again, as at every storefront.
- **Shoppers, after a shop.** About 1 in 3 stop for a snack on their way
  out of a shop, if a Snack Bar is open, has a seat and is a short detour
  away: about one flight of stairs or a short walk. They walk over (with
  their shopping), eat, pay, and leave from there. That short leg decides
  what they spend, so a Snack Bar beside the shops gets their full spend.
- **Makers with no café seat.** On their weekday lunch break a maker picks
  a café first. With none open, with a seat and near enough, they go to
  the nearest Snack Bar within the same detour instead of going out, eat
  for 10–15 minutes, and head back to their studio for the rest of their
  break, which keeps them off the lifts to the lobby.
- **Residents at weekends, and hotel guests any day,** if they're at home
  at lunchtime, come down about 1 day in 3 to the nearest Snack Bar no
  further than they'd go for dinner. Otherwise they eat at home.
- Makers, residents and guests pay in full; visitors pay less after a
  long trip, as at any storefront.
- **It's noisy the whole time it serves:** noise 1 from 10am to 9pm,
  evenings included, when residents mind noise nearly four times as much.
  Hovering a condo or hotel room beside, above or below one warns about it.
- A Snack Bar that averages under $200 a day closes at the weekly review
  ("Closed: too few customers").
- **Hover a Snack Bar** to see whether it's open, how many of its 12 seats
  are taken, how many came over from the shops today, today's takings and
  this week's average a day.
- In a test tower with a Snack Bar between two shops by the lobby, a car
  park on B1 and a full café upstairs, a weekday brought about 30
  walk-ins, 15 drivers, 14 shoppers from next door and 7 makers: about
  $650. Weekends brought twice that, about $1,300. So it pays for itself
  in under two weeks.
- In the day-85 test tower, two Snack Bars on B1 beside the car parks took
  about $450–530 each on a weekday and $1,000 at weekends. With seven cafés
  there already, they kept only 7 to 30 more makers' lunches a week in
  the building, and a few more people at the first weekly review (5 to
  18, across three runs). They don't fix the elevator waits that stall that
  tower at about 265 people.
- The day-85 save, and any save from before Snack Bars, loads and saves
  back unchanged.
</details>

<details>
<summary>Milestone 13: 3★, basements and parking</summary>

**Milestone 13: 3★, basements and parking.** Stars become a tech tree
again: 3★ asks for more than a head count, and it opens up the ground
beneath the tower, with a second way in for visitors.

- **3★ needs 300 people, plus a Housekeeping room and a Security office
  with their staff hired** (whether or not they're on shift). The top bar
  shows the progress as a checklist: "3★: 214 / 300 people · Housekeeping
  ✓ · Security office ✗". As with 2★, the star is never lost, and a
  banner says what it unlocks.
- **Basements unlock at 3★.** Drag the Floor tool below ground to dig,
  for $400 a tile (twice floor above ground) at any depth, down to B10.
  Demolishing refunds half. Stairs and elevators go down into basements
  as they go up. Basement floor built in an older save stays as it is.
- **What goes underground:** shops, cafés, restaurants, Housekeeping,
  Security offices and Parking. Studios, condos and hotel rooms need
  daylight, and the red outline says so.
- **Parking** goes in a basement only. It's 16 tiles wide, costs $20,000
  and has 20 spaces. There's no fee and nothing to pay to run it: it pays
  off through the drivers it brings.
- **Drivers come on top of the walk-ins.** Every shop, café and
  restaurant gets half as many visitors again by car, on the same rushes,
  as long as a car park has a free space and a way through to it. Drivers
  park, ride or climb up from the car park, and go back to their car when
  they're done, taking a space the whole time. Like other visitors they
  spend less after a long trip, give up after one that feels like an
  hour, and don't count towards the population. A driver goes to the car
  park with the easiest trip.
- In a test tower with a Craft Shop and Café by the lobby, a Restaurant on
  the 2nd floor and one car park on B1, drivers came at half the rate of
  walk-ins (663 to 1,349 in two weeks). They took up to 17 of the 20
  spaces: up to 12 for the restaurant on weeknights and 15 on Fridays and
  Saturdays, 7 for the café's lunch crowd and 2–3 for the shop. Takings
  rose by about half: the shop from $13,600 to $20,300 a week, the café
  from $4,100 to $6,300 and the restaurant from $17,400 to $25,400. So
  that car park paid for itself in under ten days. A second car park
  added nothing for those three, and a shop on the 11th floor took
  $17,800, against $20,300 by the lobby.
- **Hover a car park** to see how many spaces are taken and how many
  drivers came today. It warns if no shop, café or restaurant can be
  reached from it. Parked cars are drawn in their spaces.
</details>

<details>
<summary>Milestone 12: service rooms</summary>

**Milestone 12: service rooms.** The tower's first rooms that cost money
and earn nothing: Housekeeping and the Security office. Both unlock at
2★, both will be needed for 3★ (milestone 13), and both make placement
matter, because their staff have to get to the rooms they look after.

- **Housekeeping** is 8 tiles wide and costs $12,000, plus $500 a day in
  wages, paid at midnight like elevator upkeep (once its staff are
  hired). Two housekeepers move in like shopkeepers, count towards the
  population, and work every day, 9am–5pm.
- **Hotel rooms need cleaning.** Once guests check out (or leave early),
  their room needs cleaning, and it can't be booked again until a
  housekeeper has been, as in SimTower. A housekeeper goes to the nearest
  room waiting, cleans it for 45 minutes, and moves straight on to the
  next. Without Housekeeping, a tower's hotel rooms stop taking bookings
  once each one's guests have gone; the room says "Needs cleaning", and
  its tooltip says why.
- **How many it can look after.** In a test with one elevator,
  Housekeeping beside the hotel rooms kept 18 of them as busy as rooms
  that clean themselves (about 3.6 nights a week each). With 36 rooms,
  bookings fell by about 8%, and with 54 by about 11%, with rooms still
  waiting at the end of the day. So a hotel of 30 rooms or more wants a
  second Housekeeping.
- **Where it goes matters, for the staff.** Housekeeping 20 floors above
  the hotel rooms, on the same elevator, sent its housekeepers red
  ("mostly elevator waits, then long trips"): they quit at every weekly
  review, and bookings fell to 3.5 nights.
- **The Security office** is 8 tiles wide and costs $20,000, plus $800 a
  day in wages. Two guards work nights, 8pm–6am, and commute like makers.
  While a guard is on duty, an office protects its own floor and the 5
  floors above and below. Hover an office, or hold the Security tool, to
  see the floors it covers shaded.
- **Break-ins** start once the tower reaches 2★. Between midnight and
  5am, each shop, jewellery studio and hotel room with guests in has
  about a 1 in 20 chance a night: a shop loses $1,000–3,000 of stock,
  straight out of your money; a jewellery studio's maker loses tools and
  stock and gains 25 stress; hotel guests are robbed, and the stay gets
  the worst review. A message says what happened ("Break-in at the Craft
  Shop on 4F: $2,100 of stock taken"). Protected rooms are never robbed,
  and an unprotected one's tooltip warns "No security within 5 floors"
  (or that the office nearby has no guards, or that they can't get to it).
  In a test with four shops, a jewellery studio and a Single, there were
  10–11 break-ins in four weeks; with an office in reach, none.
- **Stress names its cause.** Everyone keeps a running total of the
  stress they've gained over the last 7 days, by cause: long trips,
  elevator waits, stairs, noise by day, noise in the evening, no route,
  and break-ins. Hover a pink or red room to see its people's top one
  or two: "stress 96 (red): mostly elevator waits, then long trips".
  "Long trips" is time on the move (walking, and riding in the car,
  stops for other people included) beyond a comfortable trip;
  "elevator waits" is time queueing for the car, and "stairs" time
  climbing. So a short hop pushed over by a long queue is all
  "elevator waits".
- **Stairs for short hops.** Routes are costed by how long the trip
  feels: a flight of stairs like 4 minutes, an elevator like a typical
  wait plus the ride, plus the queue as someone at the call button
  would judge it. Up to a carload of people ahead of them (on their
  floor, or upstream going their way) costs a little; every full
  carload ahead means waiting out another round trip of the shaft. So
  people take stairs that are on their way for a floor or two, spread
  out across shafts at rush hour, and walk to the stairs rather than
  wait out several full cars. A full car only stops to let people off.
  Someone who has queued for 10 minutes looks again from where they
  stand, and switches to another shaft or the stairs if that's now
  clearly quicker (keeping their place if not: those who queued behind
  them don't count as being in their way). In a playtester's 242-person
  tower this took the worst wait of a weekday from 97 minutes to 36, and
  red rooms from about 20 to 13. Noise from the floor directly above or
  below counts as next door, and the warnings now say so.
- **Hover an elevator shaft** to see how it's coping: where its car is
  and how full, who's waiting now (and on which floors), and how many
  got on in the last hour and how long they waited (average and
  longest). An average of 10 minutes or more gets a warning, since
  waiting counts double towards stress.
- **Save file** (top bar) copies your tower out as text, or downloads it
  as a `.json` file, to keep or to send (say, to Claude, to look at a
  bug in your actual tower). Paste one in, or open its file, and press
  **Load** to play it instead: it's checked first, and a bad one changes
  nothing. Where the browser won't let the game keep a save (private
  browsing, or storage blocked), Load still works, and the tower lasts
  while the page is open. A saved tower that can't be loaded when the
  game opens (from a newer version, say) is kept aside, and **Old save**
  in this panel copies it out. With the game open in two tabs, a tab
  whose save the other one has replaced stops saving and says so. The
  game pauses while the panel is open, and its keys do nothing behind it. Esc closes the panel (or New game's question). In
  the claude.ai artifact, Download asks before saving the file.
- Both rooms together cost $1,300 a day, about $9,100 a week, so a tower
  needs steady income before it builds them.
- Hotel rooms in an older save load clean.
</details>

<details>
<summary>Milestone 11: the Restaurant</summary>

**Milestone 11: the Restaurant.** The tower's first room that's busy at
night, when residents and hotel guests are home. Evenings bring a fourth
rush to the elevators.

- **The Restaurant** unlocks at 2★, like shops and hotel rooms. It's 16
  tiles wide and costs $30,000. A restaurant owner moves in like a
  shopkeeper and keeps it open every day, about 5pm to 11pm. It serves
  dinner 6–11pm and seats 40. Diners stay 60–90 minutes and spend $40–80
  each. Takings are banked at midnight.
- **Diners from outside** come in from the lobby 6–9pm: steady on
  weeknights, twice as many on Fridays and Saturdays. Like shoppers,
  they spend less after a long trip in, and give up after one that feels
  like an hour.
- **Residents and hotel guests** eat there some evenings, at 7–9pm:
  residents about one night in four (one in two on Fridays and
  Saturdays), guests one in two. They go to the nearest restaurant
  that's open, has a seat, and isn't too far (about four flights of
  stairs with a short walk, or an elevator ride); otherwise they eat at home. Nobody leaves
  the building for dinner, so a tower without a restaurant has quiet
  evenings.
- **It's noisy at dinner.** While it's serving, a restaurant gives off
  noise 2 (like a pottery studio) to the rooms beside it and directly
  above and below. Studios are empty by then, but residents and guests
  are home, and residents mind noise nearly four times as much from 6pm
  as by day. In a test, a condo over a restaurant went pink in its first
  week and moved out at the second weekly review. A Single beside one got
  poor reviews, and by the third week nobody was booking it, while a
  quiet Single was booked 4 nights a week. Beside or
  under studios is the place for it. Hovering a condo or hotel room
  shows its evening noise, with a warning when a restaurant is next door.
- In a test tower with 30 residents, a restaurant by the lobby took
  about $2,600 a weeknight and $4,100 on Fridays and Saturdays, about
  $21,000 a week. Up on the 9th floor it took nearly as much. A
  restaurant that averages under $1,000 a day closes at the weekly
  review ("Closed: too few diners").
- **Hover a restaurant** to see whether it's open, how many are dining,
  today's takings and this week's average a day.
- Residents and guests in an older save get their dinner times when it
  loads.
</details>

<details>
<summary>Milestone 10: food & lunch trips</summary>

Makers now take a lunch break, and the tower can feed them. Lunchtime
brings a third rush to the elevators, after the morning and the evening.

- **Lunch breaks.** On weekdays every maker takes a 30–45 minute break,
  starting some time between 11:30am and 1:30pm. With no café in the
  tower, they go out of the building and come back, as in SimTower:
  two more trips through the lobby each, in the middle of the day.
- **The Café** (available from the start, 1★) is 12 tiles wide and costs
  $16,000. A café owner moves in like a shopkeeper and keeps it open every
  day, about 8am to 4pm. Makers eat at the nearest café that's open and
  has a seat, unless it's much further than going out; each pays $15–25.
  A lunch crowd also comes in from the lobby, 11:30am–2pm (half as many
  at weekends), and spends the same. Takings are banked at midnight.
- **Where it goes matters.** A café by the elevator on the studios' floors
  feeds nearly every maker. One at the far end of a floor only feeds the
  makers on that floor. One high up the tower pulls everyone up a single
  elevator at once: in a test with 48 makers and one elevator, a café on
  the 10th floor stretched lunchtime waits past an hour, and a fifth of
  the makers moved out.
- **It's noisy at lunch.** While it's serving lunch on weekdays, a café
  gives off noise 1 (like a sewing studio) to the rooms around it. Keep
  it away from hotel rooms.
- In a test tower with 48 makers, a café by the elevator took about
  $1,300 on a weekday and $350 at weekends, about $7,000 a week. A café
  that averages under $300 a day closes at the weekly review, as quiet
  shops do ("Closed: too few diners").
- **Hover a café** to see whether it's open, how many are at lunch,
  today's takings and this week's average a day.
- Makers in an older save get their lunch breaks when it loads.
</details>

<details>
<summary>Milestone 9: hotel rooms</summary>

**Milestone 9: hotel rooms.** Visiting buyers and tourists check in for a
night or a few, and pay for every night they stay. They're in their rooms
during the day, so studio noise now really matters.

Since milestone 9 shipped, hotel rooms come in two sizes, Single and
Twin, and guests mind long trips more. A save with the old 8-tile hotel
rooms has them taken down and refunded in full ($14,000 each) when it
loads.

- **Hotel rooms unlock at 2★**, like shops, and come in two sizes, as in
  SimTower. Each earns for every night guests sleep in it, paid at the
  midnight tally ("Night +$2,000", and "hotel tonight" in the top bar).
  - **Single Room:** 6 tiles, $10,000, $2,000 a night. Takes a buyer on
    their own.
  - **Twin Room:** 10 tiles, $17,000, $2,800 a night. Takes a pair of
    tourists. On a night no tourists book it, it takes a lone buyer if
    every Single is taken, but a buyer only pays the Single rate.
- **Bookings.** Each afternoon an empty room may get a booking, and the
  guests turn up at the lobby between 2pm and 9pm. Buyers come mostly in
  the week and tourists mostly on Fridays and Saturdays, so a tower needs
  both sizes to stay full all week. They stay 1–3 nights (1–2 if they
  arrive on a Friday or Saturday) and check out
  between 8 and 11 in the morning. Guests wheel a suitcase in and out.
  They're visitors, so they don't count towards the population. Nobody
  books a room they can't reach.
- **Guests are in by day.** Apart from the odd outing (tourists go
  sightseeing more than buyers), guests spend the day in their room, and
  studio noise stresses them 7½ times as fast as it does condo
  residents. A woodwork studio next door, or pottery below, makes for a
  stressful weekday; weekends are quiet whatever the layout. Long trips
  up from the lobby stress them too, more than residents: anything over
  15 minutes counts (stairs and queueing double, as ever), so two flights
  of stairs are fine but five are not.
- **Too much and they leave.** A guest who goes red checks out early
  ("Checked out early: too noisy"), and that night earns nothing.
- **Reviews set occupancy.** Every stay ends with a review: good if the
  guests hardly noticed a thing, poor if they went red. A room's
  reviews set how often it's booked, down to a quarter as often. In a
  test run over twelve weeks, a quiet Single was booked 4–5 nights a week
  (about $1,400–1,700 a tile), one beside a sewing studio about 3½, one
  five flights up by stairs alone 3⅓, and one beside a woodwork studio or
  over a pottery studio about 2 ($600–800 a tile). A quiet Twin was booked
  about 5½ nights ($1,250–1,400 a tile).
- **Hover a hotel room** to see who's staying and which night of how many,
  their stress, the room's reviews, how many of the last 7 nights it was
  booked, and the noise it gets now and in working hours. It warns when a
  room gets pottery-or-louder noise in working hours.
- Hotel rooms aren't part of the weekly stress review: guests are judged
  stay by stay instead.
</details>

<details>
<summary>Milestone 8: shops</summary>

Makers sell their work, and shoppers come to buy it: the first people in
the tower who are visiting rather than living or working there.

- **Shops unlock at 2★.** Until then the Shop button is greyed out, and
  hovering with it says what it takes. A Craft Shop is 10 tiles wide and
  costs $15,000.
- **A shopkeeper** moves in like any tenant and keeps shop every day,
  weekends too, from about 9:30am to 8:30pm. The shop is open (its sign
  says so) only while they're in. They count towards the population.
- **Shoppers** arrive at the lobby while a shop is open, 10am–7:30pm: one
  every 40 minutes or so on a weekday, twice as many at weekends, and more
  again after 5pm. Each walks (or climbs, or rides) to the shop, browses
  for 15–40 minutes, pays, and leaves with a bag. They don't count towards
  the population.
- **Layout sets the takings.** A shopper spends $50–150 after an easy trip
  in. If it felt longer than 30 minutes (stairs and queueing count
  double, as for stress) they spend less, and once it has felt like an
  hour they give up and go home ("Gave up: too far"). A shopper who
  arrives after closing buys nothing either. A shop by the lobby earns
  about $13–14k a week; one three flights up by stairs alone, less.
- **Word gets around.** A shop that keeps letting shoppers down draws
  fewer of them (down to a quarter), so a jammed elevator isn't swamped
  by shoppers who won't buy anything. Shoppers who do buy still ride the
  elevators, so busy shops need good transit.
- **Daily takings.** Each sale goes into the shop's till ("sales today" in
  the top bar and the shop's tooltip), and every till is banked at
  midnight ("Sales +$1,500").
- **Quiet shops close.** At the Sunday-night review, a shop that has
  traded at least 3 full days that week and averaged under $700 a day
  closes ("Closed: too few shoppers") and goes back on the market with a
  fresh name. Its tooltip shows the week's average a day, and warns while
  it's on course to close. Shops sell on their own: what they take
  doesn't depend on the tower's studios.
</details>

<details>
<summary>Milestone 7: save/load & polish</summary>

Close the tab and pick up where you left off. That completed the first
playable version: build a tower, fill it, keep it calm, and reach 2★.

- **Your tower is saved** in your browser: automatically at the start of
  every game day, whenever you close or switch away from the tab, and when
  you press **Save**. It's one save slot, kept on this browser only (a
  different browser or device starts fresh).
- **Coming back** restores everything: the clock, money, stars, every room,
  stair and elevator, every person (even mid-climb or mid-ride), what
  each studio owes in rent, and where you'd scrolled to. The game starts
  paused with a welcome-back note; press Play or space to carry on.
- **New game** (top bar) throws the save away and starts an empty lot,
  after asking. Going bankrupt also deletes the save.
- Saves carry a version number. A save from an incompatible version of the
  game, or a damaged one, is ignored and you get a new game instead. If
  your browser blocks storage the game still works; Save just says it
  can't.
- Polish: error messages fade after a few seconds instead of sticking.
</details>

<details>
<summary>Milestone 6: stress & ratings</summary>

Everyone has a stress level, drawn black (calm), pink or red. Long trips
(stairs and queueing count double, over 30 minutes) and noise next door
(Woodwork 3, Pottery 2, Sewing 1, only while makers are at work;
residents only) raise it; resting
lowers it. At the Sunday-night review, a room averaging red moves out (a
condo's owners get their $30,000 back). Hover a room to see its stress and
noise. The tower reaches **2★ at 100 people**, and stars are never lost.
</details>

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
  back (from milestone 5, nothing for a condo that's been sold: it belongs
  to its owners).

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
  counts, rent, sale prices and upkeep (starting numbers, for tuning),
  decorations, the staff lift, car parks by the bay, and rent levels.
- `world.js` — the building's actual state (floors, rooms, stairs,
  elevators, money) and the placement rules. Announces every change so
  people and elevators can react. Knows nothing about pixels or the mouse.
- `routing.js` — plans a route through the building (walk / stairs /
  elevator legs) and works out which rooms can be reached from a lobby.
  Only housekeepers' and guards' routes use staff lifts.
- `elevators.js` — self-running elevator cars ("collective control"),
  staff lifts' included, and who rode a staff lift today.
- `people.js` — every tenant, shopper and hotel guest: moving in, their
  daily schedule (makers' lunch breaks, residents' and guests' snacks and dinners,
  housekeepers' and guards' shifts included), and how they work through a
  route.
- `economy.js` — who moves in (and out) when, condo sales and refunds,
  weekly rent, nightly shop takings, hotel nights, upkeep and wages, and
  bankruptcy; rent levels, and rooms that are hard to let.
- `shops.js` — shops, cafés, restaurants and Snack Bars: when they're open, sending
  shoppers (and the lunch crowd, and diners, and drivers) in, what each spends (less
  after a long trip), the day's takings, and closing quiet ones.
- `cafes.js` — makers' lunch: which café (if any) each maker eats at, what
  they pay, and when a café is serving lunch (and noisy).
- `restaurants.js` — residents' and guests' dinners: who eats out tonight,
  at which restaurant, what they pay, and when a restaurant is serving
  dinner (and noisy).
- `snackbars.js` — the Snack Bar's customers beyond its own crowd:
  shoppers stopping on their way out of a shop, makers with no café seat,
  and residents and guests at lunchtime; what they pay, and when it's
  serving (and noisy).
- `hotels.js` — hotel rooms: bookings, checking guests in and out (early,
  if they're too stressed), reviews and occupancy, and nightly takings, at
  the rent level each stay was booked at.
- `housekeeping.js` — cleaning hotel rooms after their guests leave: which
  housekeeper takes which room, and the 45 minutes it takes.
- `security.js` — night-time break-ins, and the Security offices whose
  guards stop them within 5 floors.
- `parking.js` — car parks: which one a driver uses, their spaces (5 a
  bay), and the car park's tooltip.
- `ratings.js` — the star rating, its population targets and the rooms
  each star needs (2★ unlocks shops, hotel rooms, restaurants and service
  rooms; 3★ unlocks basements, Parking and the Snack Bar).
- `stress.js` — each person's stress: trips, noise, break-ins, rest, what
  caused it over the last week, and the weekly review that decides who
  moves out (at the line their rent level sets).
- `save.js` — saving the whole game to the browser and loading it back,
  turning pointers between objects into ids and back.
- `input.js` — turns mouse events into grid coordinates and tool actions
  (left-click/drag builds; see camera.js for the right-click pan split;
  with no tool, a click opens a room's rent panel).
- `clock.js` — game time as one number (minutes elapsed), and the pause/speed
  controls on top of it.
- `ui.js` — the HTML toolbar (and its Decor row), money display, clock
  controls, status hint, tooltips and the rent panel.
- `render.js` — draws everything each frame: the sky (colored by time of
  day), the grid, built floors, rooms, and a live green/red placement preview.
- `main.js` — the game loop: once per animation frame, poll held keys for
  panning, advance the simulation in small fixed steps (clock, elevators,
  people, shops, hotels, stress, economy, ratings), and redraw.
