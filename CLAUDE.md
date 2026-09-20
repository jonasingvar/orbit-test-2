# ORBIT '26 — conference companion app

A sample app for a workshop on using AI across the software delivery lifecycle.
Attendees fork this repo, turn requirements into GitHub Issues, and let an
engineering harness implement them. **Read this file before writing code here.**

## Run it

```bash
npm install
npm run dev          # seeds the database, then starts API + web on one command
```

- Web: http://localhost:5173 (Vite, hot reload)
- API: http://localhost:3001/api (Express)
- The web dev server proxies `/api` → `:3001`, so the frontend only ever
  fetches relative URLs.

| Command | What it does |
| --- | --- |
| `npm run dev` | Seed + run everything. The only command you normally need. |
| `npm run db:seed` | Rebuild `data/orbit.db` from `server/seed.js`. Destructive and deterministic. |
| `npm run db:reset` | Delete the database file and reseed from scratch. |
| `npm test` | Unit + API tests, no browser. Under a second — run it after every edit. |
| `npm run verify` | Reseed, then the Playwright suite, headless. **Run this before calling a ticket done.** |
| `npm run verify -- --ui` | Interactive Playwright runner. |
| `npm run shot` | Screenshot every main route into `.screenshots/`. Starts the app if it is not running. |
| `npm run shot -- /schedule --mobile --user=2` | Screenshot one route, mobile viewport, as attendee 2. |
| `npm run avatars` | Download any missing speaker portraits. They are committed, so you rarely need this. |

## Stack

Node 22 · Express · better-sqlite3 · React 18 · Vite 6 · React Router 6 ·
Tailwind CSS v4 · Playwright. No state library, no ORM, no component library —
if you are reaching for one, you are probably solving the wrong problem.

## Layout

```
server/
  db.js              schema (one SQL string), connection, migrate(), dropAll()
  seed.js            all fake data generation; deterministic via a seeded PRNG
  index.js           express app, mounts routers, 404 + error handlers
  lib/
    query.js         shared SQL fragments and every snake_case → camelCase mapper
    seats.js         reserve / release / waitlist promotion, overlap guard
    attendance.js    check-in window and rating rules
    agenda.js        the /today payload and the agenda: clashes, totals, suggestions
    ical.js          .ics calendar export
  routes/
    meta.js          /bootstrap, /live, /venues, /vendors, /sponsors, /announcements
    sessions.js      /sessions, /sessions/:id, /sessions/:id.ics
    speakers.js      /speakers, /speakers/:id
    users.js         /users, /users/:id, /today, /schedule, /agenda.ics,
                     reservations, attendance, check-ins, ratings, follows
src/
  main.jsx           entry: Router → Toaster → ConferenceProvider → App
  App.jsx            route table
  index.css          Tailwind import + design tokens + custom utilities
  lib/
    api.js           one function per endpoint; nothing else calls fetch()
    store.jsx        ConferenceProvider (global data) + useFetch (page data)
    format.js        time/date/pluralisation helpers
    accents.js       accent name → fixed Tailwind class strings (+ hex for SVG)
    travel.js        travel-time helpers for the two-venue split
    clock.js         the conference clock: simulated "now", progress, open/closed
    useDocumentTitle.js, useInView.js, useMediaQuery.js  — small hooks
  components/        Layout, SessionCard, SpeakerCard, UserSwitcher, ui.jsx,
                     Icon.jsx, ScheduleGrid, SpeakerSpotlight, LiveNow,
                     SeatPanel, AttendancePanel, ConflictDialog, Toaster,
                     VenueBoard, GeneratedAvatar, GeneratedCover, VenueRouteMap …
  pages/             one file per route, named <Thing>Page
public/
  avatars/           committed synthetic portraits, served from /avatars/
  images/            optional hero photography — see that folder's README
tests/               Playwright specs + helpers.js
scripts/shot.mjs     screenshot tool
data/orbit.db        generated, gitignored
```

## Conventions

**The API boundary is camelCase.** SQLite gives snake_case. Every translation
happens in `server/lib/query.js` (`toSession`, `toSpeaker`, `toVenue`, …). If you
add a column, add it to the mapper — React must never see `snake_case`.

**Adding an endpoint.** Put the route in the matching `server/routes/*.js`, map
rows with an existing `toX()` helper, then add one function to `src/lib/api.js`.
Components import from `api.js`; they never call `fetch` directly.

**Routes stay thin; rules live in `server/lib/`.** A handler reads the request,
calls one function, and sends the result. Anything with a rule in it — seats and
the overlap guard, the check-in window, what the home page and the agenda are
made of — belongs beside `seats.js`, `attendance.js` and `agenda.js`, where it
can be called and tested without HTTP.

**Prepare statements once, at module scope.** `db.prepare(...)` compiles SQL, so
a handler that prepares on every request recompiles on every request. Name the
statement next to the others at the top of the file (`const getUser =
db.prepare(…)`). The exception is a filter whose SQL genuinely varies with the
query string — `/sessions`, `/speakers` and `/vendors` build theirs per request,
and still pass every value as a bound `?`.

**Fetching data in a page.** Use `useFetch` from `src/lib/store.jsx`:

```jsx
const { data, loading, error, reload } = useFetch(() => api.getSessions({ day }), [day]);
```

Global data (venues, tracks, tags, rooms, days, attendees, the clock, the current
user, their reservations and who they follow) is already in `useConference()`.
Do not refetch it per page.

**Filters live in the URL.** Pages use `useSearchParams` so a filtered view is
shareable and survives reload. `'all'` means "no filter" and is stripped by
`qs()` in `api.js`.

**Tailwind colours are tokens, not raw hexes.** Use `bg-surface`, `text-muted`,
`border-hairline` etc. from `src/index.css`. The elevation ladder is
`ground` (page) → `surface` (module panel) → `raised` (card in a panel) →
`overlay` (controls, hover). Keep that order; it is what stops dense screens
turning to mush.

**Accent colours cannot be built at runtime.** Tailwind needs literal class
names, so `src/lib/accents.js` maps `'violet'` → a fixed set of class strings.
Never write `` `bg-${color}-500` ``.

**Every interactive element needs an accessible name.** Icon-only buttons take
`aria-label`. A visible label hidden at some breakpoint still needs one.

**Add `data-testid` to anything a test needs to find** — result counts, panels,
list containers. Do not put testids on decorative elements.

## There is exactly one action

Adding a session to your agenda **takes a seat**. There is no separate bookmark,
and there should not be one.

We originally copied AWS re:Invent and Google I/O, which split favouriting from
reserving. Both had to publish FAQ entries explaining the difference, and it
confused people here too. Most of the industry — Sched, EventMobi, and KubeCon
on top of Sched — uses a single action with capacity rules attached, so that is
what this app does.

- `reservations` is the only table. Adding moves `sessions.seats_taken` for
  *everybody*; a full room waitlists you instead; removing a confirmed seat
  promotes whoever has waited longest (skipping anyone who has since taken a seat
  in that slot). All transactional — `server/lib/seats.js`.
- The page is **My Agenda** (`/my-agenda`), which is what Whova, Cvent, EventMobi
  and AWS all call it. `/my-plan` redirects.
- `useConference()` exposes `toggleSeat`, `reservationFor` and `onAgenda`. The
  store is the source of truth for your own reservation state — never fall back
  to the payload a page was fetched with, or "removed" stays unreachable until a
  refresh.

## The attendee chain

Four real rules, each borrowed from how conferences actually run. They are the
interesting part of this app — all of them write state, and each one gates the
next:

1. **Add a session** → takes a seat, or a waitlist place. **You cannot hold two
   seats in overlapping slots** — the API returns 409 with the clashing session,
   and the UI offers a swap. Every real system blocks this rather than warning.
   Nor can you take a seat in a session that has already ended (also a 409).
2. **Check in** → opens 15 minutes before the session starts, closes when it
   ends. You cannot check in to something that has not happened.
3. **Rate it** → only if you checked in, only once it is over. One rating per
   person, editable. Ratings roll up onto `sessions.avg_rating` immediately.
4. **Export** → `/api/users/:id/agenda.ics` and `/api/sessions/:id.ics`.

A clash is a **choice, not an error**: the 409 carries both sessions and the UI
opens `<ConflictDialog>` showing them side by side with Keep / Swap. Do not
demote that to a toast — a toast disappears while the decision is still open.

`server/lib/seats.js` and `server/lib/attendance.js` hold the rules; both run
inside transactions. Reserving, check-in and rating take the clock from the
*client*, because conference time is simulated.

### Writing tests against this

Seat, check-in and rating state is **real and written to the database**, so
`npm run verify` reseeds first — every run starts from the same data, and a run
killed halfway cannot poison the next one. Within a run nothing is reset, and
everything runs concurrently: the desktop and mobile projects run side by side,
and `fullyParallel: true` in `playwright.config.js` means tests *within* a
project, even within one file, run in parallel too. So:

- Give each **test, per project,** its own attendee and day, so no two running
  tests mutate the same counter or the same attendee's agenda. `tests/helpers.js`
  keeps this in one table: register a lane in `LANES` and read it with
  `await laneFor(name, testInfo)`. `bookableFor(request, userId, day)` lists
  what that attendee can book without tripping the overlap guard.
- **Clean up after yourself.** A test that books a seat and does not release it
  will hit the overlap guard on its next run. Release what you booked;
  `clearAgendaFor(request, userId, day)` wipes a whole day, so use it only on a
  lane marked `clean`.
- There is deliberately **no way to undo a check-in**, so pick a session the
  attendee has not been to rather than trying to reset one.
- Do not use `test.describe.configure({ mode: 'serial' })` with conditional
  `test.skip()` — a skip abandons the rest of the group.

## The conference clock

**Day 1 is the day you seed.** `npm run db:seed` sets the conference to start
today unless `ORBIT_START_DATE` says otherwise, so whoever runs it is standing
in Day 1. The seed treats that morning (everything ending by 12:15) as already
attended: seeded check-ins and ratings exist only there. Tests must therefore ask
the API for the dates (`conferenceDays()` in `tests/helpers.js`) rather than
hard-coding them.

"Now" within that day is simulated. `src/lib/clock.js` takes the
viewer's real time of day and projects it onto Day 1, then ticks every
30 seconds. Open the app at 10:40 and you are standing in the 10:15 slot watching
it run; outside 08:00–22:30 it clamps to a lively mid-morning moment.

`useConference().clock` gives you `{ day, time }`. Use it — do not call `new Date()`
in a component. `GET /api/live?day=&time=` returns what is running and what starts
next.

Pin it for demos and tests with `?at=YYYY-MM-DDTHH:MM` (a date from `days`, e.g.
Day 2 at 14:30), or the same value in the `orbit:clockAt` localStorage key; a
value without the `T` time part is silently ignored. `npm run shot -- / --at=…`
takes the same value. In tests, `visit(page, path, { at })` sets it for you, and
`at` must be a full timestamp: build it with `await momentOn(dayIndex, time)`
from `tests/helpers.js`, which also exports `MID_SESSION_TIME` ('10:30') and
`BETWEEN_SLOTS_TIME` ('11:10') as `HH:MM` strings. **Any test that touches live
state must pin the clock**, otherwise it passes or fails depending on the hour
it runs.

## Imagery

**No photograph of a real person appears anywhere in this repo, and none should
be added.** Two systems cover it:

**Portraits** live in `public/avatars/` and are served from `/avatars/…`. They
are StyleGAN output from thispersondoesnotexist.com — every face is synthetic,
so no real person is depicted and there are no likeness rights. They were
downloaded once by `scripts/fetch-avatars.mjs`, downscaled to 256px and
committed, so the app never touches the network at runtime. `speakers.image_url`
and `users.image_url` point at them; a speaker with no file falls back to the
generated SVG portrait, so a partial set is never a broken image.

Two rules if you ever regenerate a portrait:

1. **Fetch sequentially.** The source serves whatever it generated most
   recently, so concurrent requests come back identical. The script is
   sequential and hashes each image to reject duplicates — do not "speed it up".
2. **Update `server/avatar-presentation.json`.** It records whether each
   portrait reads as masculine or feminine, and the seed picks the speaker's
   first name and pronouns *from the photo*. Change a face without updating that
   file and you get a speaker whose name fights their picture. The source
   dataset also contains children; they are not plausible speakers, so eyeball
   any replacement before committing it.

**Everything else is generated deterministically from a string:**

- `GeneratedAvatar` — the SVG portrait fallback, hashed from a name.
- `GeneratedCover` — key art for sessions, speakers, vendors and sponsors.
  Variants: `orbit` (keynote cards, session heroes), `mesh` (vendor tiles, the
  spotlight backdrop), `strata` (wide banners), `mark` (sponsor logos).
- `VenueRouteMap` — the two sites projected from their real lat/lng. This is the
  *only* map in the app, and it is honest because the coordinates are real.
  There was once a per-venue "floor plan" built from invented `map_x`/`map_y`
  values; it looked like geography, meant nothing, and has been removed. Do not
  bring it back — `VenueBoard` shows what is actually happening in each room
  instead.

Same input, same output, on every machine — which keeps screenshots and tests
stable.

## The home page is about *this* attendee, at *this* moment

Everything on `/` is either personal or time-sensitive. It is not a brochure —
an attendee bought a ticket, so the dates, the session count and the track list
tell them nothing they did not already know.

- `GET /api/users/:id/today?day=&time=` is the whole payload: what they are in
  now, what is next, what they are waiting on, what they attended but have not
  rated, and suggestions for the first slot they have left empty.
- **Suggestions rank on behaviour, not declaration.** `interests` is what
  someone ticked at registration; the topic tags on what they have actually
  booked are what they want, so suggestions rank on those.
- **Everything is driven by `clock.day`.** The old page rendered `days[0]` —
  the first day the attendee had anything booked — so on day 3 it presented
  day 1 as if it were happening.
- Sections **self-hide when empty** rather than rendering a heading over
  nothing. Follow `FromSpeakersYouFollow`.

If you add a section here, it has to answer "why is this on the home page and
not on the page that owns it?" Keynotes, the track list, the venue split and
featured speakers all failed that test and were removed.

## Nothing may claim to be true when it is not

The seed generates a *live* conference, so anything that implies elapsed time
has to be earned:

- **Ratings and reviews only exist for sessions that have already finished.**
  Seeding a 4.5 onto a talk three days away was the clearest possible tell that
  the data was fake, and it poisoned the "highest rated" ranking. The seed only
  rates Day 1 morning sessions, and only from attendees it checked in, by the
  same rules as the API; `speakers.avg_rating` is derived from those session
  ratings, never invented.
- **Never hard-code a date, month or weekday.** Day 1 moves with the seed, so
  the footer, announcements and body copy all derive from `conference.dates`
  and `days[n]`. A footer reading "Oct 12–15" under a September hero is the
  fastest way to lose an attendee's trust.
- **No invented external links.** Speaker socials show the handle but do not
  link, and sponsor websites are not shown, because the domains do not exist.

## Chrome and correctness

Things that are easy to forget and immediately read as unfinished:

- **Every page calls `useDocumentTitle`.** The tab, the history entry and a
  bookmark all read from it. New route, new title.
- **`<RouteChange>` in the layout** resets scroll and moves focus to `#main` on
  every navigation. React Router does neither by default — without it you click
  a nav link and land halfway down the next page.
- **`useToast()`** for anything the user does that would otherwise be silent.
  Booking a seat toasts; removing one toasts with an Undo action. The toast
  stack (`<Toaster>`) wraps the store in `main.jsx` so `store.jsx` can reach it.
- **Footer links must resolve.** There is a smoke test that walks every footer
  link and fails if one hits the not-found page.

## Motion

Animation is CSS-driven and lives in `src/index.css` as Tailwind utilities:
`animate-rise` (dialogs, menus, toasts), `stagger` (list entrance),
`animate-pulse-dot` (live indicators), `animate-ken-burns`, `animate-slide-in`,
`animate-fade-zoom` and `animate-fill` (the speaker spotlight and its autoplay
progress), `reveal` (scroll-triggered) and `animate-marquee` (sponsor logos).

- `<Reveal>` wraps a block so it lifts into view on first scroll, via the
  `useInView` hook.
- `<CountUp>` animates a number once it is on screen.
- The whole lot is switched off by the `prefers-reduced-motion` block at the
  bottom of `index.css`, which also forces `.reveal` content visible — so
  nothing is ever hidden behind an animation that never runs. Anything new you
  add must survive that same test.

## The schedule has two views

`/schedule` renders either a **grid** (time down, rooms across, tinted by the
track that room runs that day) or a **list** (cards grouped by time slot). The
choice lives in `?view=`; with no param the grid is used on `lg` and up and the
list below, because a horizontally scrolling matrix is miserable on a phone.

The grid only makes sense when whole rooms are visible, so a search or a track,
topic, level or format filter falls back to the list automatically, and the grid
toggle is disabled with a reason — `BLOCKERS` / `blocker` in `SchedulePage`. A
venue filter only drops columns, so it keeps the grid.

This works because the seed gives each day a **stable set of five rooms (four at
Aurora, one at the Foundry), each with a track for the day**, the way real
conferences run. Keynotes and social events sit outside that set and render as
full-width bars across the grid. If you change session generation to scatter
talks across arbitrary rooms again, the grid becomes a mostly-empty spreadsheet.

Filters live in a sticky left rail on desktop and collapse behind a Filters
button on mobile — tests must open it before touching a filter control.

## Visual hierarchy

Not every card is equal, and the UI must say so. Keynotes get the `feature`
treatment in `SessionCard` — cover art, a wider span, more of the abstract. It
is keynotes only: it once also fired on every room over 1,200 seats, and when
most of the list is featured, nothing is. The top-rated vendor and the Diamond
and Platinum sponsors get similar promotion. When you add a new card type, ask
what makes one instance more important than another and show it.

The speakers page is the clearest example: 110 people are too many for one flat
grid, so it is tiered — speakers you follow first as normal `SpeakerCard`s, the
`featured` headliners in the photo-forward `SpeakerSpotlight` carousel, and
everyone else as `compact` cards in an A–Z index with a jump bar. `SpeakerCard`
takes a `variant` (`grid`, the default, or `compact`) for exactly this. Searching
or filtering hides the spotlight and flattens the rest into a single compact
result grid (so does any sort other than the default), because at that point
the user has stated what matters.

Grids that mix feature and normal cards use `grid-flow-row-dense` so the wide
ones never leave holes.

## Verifying a change

Three layers, fastest first. Run the cheap one constantly; a ticket is not done
until the browser agrees.

1. **`npm test`** — `tests/unit/` and `tests/api/`, under a second, no browser.
   Run it after every edit.
2. **`npm run verify`** — reseeds, then drives the real app in Chromium on
   desktop **and** mobile. The gate for "done".
3. **`npm run shot -- /your-route`** — look at the PNG if the change is visual.

**Where a new test goes:**

- `tests/unit/*.test.js` — a pure function: the check-in window, the clock
  projection, travel, iCal escaping, a mapper. Import the module and assert.
  `sandbox-db.js` first if the module reaches the database on import.
- `tests/api/*.test.js` — a rule that needs the database and the routes: seats,
  waitlists, promotion, check-in, rating, response shapes, `.ics` output.
  `startApi()` from `harness.js` seeds a throwaway database, boots the app on a
  free port and hands you a client. Book and break whatever you like — nothing
  is shared, so there is no cleanup and no lane to respect.
- `tests/*.spec.js` — anything that needs a browser: what the attendee sees,
  navigation, the conflict dialog, responsive behaviour. Use
  `visit(page, path, { as: ATTENDEES.kenji })` from `tests/helpers.js` rather
  than `page.goto` — it sets which attendee is signed in.

If a rule can be proven without a browser, prove it without a browser: an agent
can afford `npm test` after every edit, and cannot afford Playwright.

The smoke suite already asserts every route renders with no console errors and
no horizontal overflow, so responsive regressions fail automatically.

**Nothing is pinned to one machine.** `ORBIT_DB`, `PORT`, `WEB_PORT` and
`PW_OUTPUT_DIR` pick the database file, the two servers and Playwright's output
directory, so a second checkout — or a second agent on a second ticket — can run
its own app and its own suite at the same time without touching yours.

**Claim a lane before you run anything.** Working in a worktree, take a port
pair first:

```bash
eval "$(node scripts/lane.mjs claim 42)"   # 42 is the issue you are on
```

That exports `ORBIT_LANE`, `PORT`, `WEB_PORT` and `NO_OPEN`, and records the
claim in the git *common* directory, which every worktree shares — so
`node scripts/lane.mjs list` shows what every other agent holds. Claiming twice
from the same worktree returns the same lane; `release` gives it back, and a
lane whose worktree has been removed is reclaimed automatically.

`ORBIT_DB` is not part of a lane: `data/` is gitignored and per-checkout, so
every worktree already seeds its own database.

The lane is also what makes `npm run verify` honest. Playwright reuses an app
already listening on `WEB_PORT` unless `ORBIT_LANE` is set — which, with two
worktrees on one port, would run your specs against the *other* branch's code
and pass. Under a lane it starts its own app or fails.

**CI runs the same commands.** `.github/workflows/verify.yml` runs `npm test` in
one job and the two Playwright projects in two more, all in parallel, on every
push and pull request. A failed run uploads the HTML report and the traces, and
every run writes a pass/fail table to the Actions summary.

## Where work is tracked

**Tickets are GitHub Issues.** This repo is made to be forked, so the tracker is
the Issues of the fork you are working in, never the upstream's.

## Data model in one paragraph

Four days starting on the day you seed, ~140 sessions, 110 speakers, across
**two physical venues 6.2 miles apart**: the Aurora Convention Center (main) and
The Foundry at Red Rock Yards. `venue_travel` holds how long it takes to get
between them per mode. Sessions belong to a track and a room; rooms belong to a
venue and carry `walk_minutes`, capacity and accessibility — no map coordinates.
Attendees are rows in `users`; there is no authentication — the selected
attendee lives in `localStorage` under `orbit:currentUserId`. Two attendees
(Amara, Priya) have `speaker_id` set, linking them to a `speakers` row, which is
what drives the speaking panel on My Agenda and the home page. See
`docs/DATA_MODEL.md` for the full schema.

## Setting this up on a fork

A fork inherits the workflows and the skills but **not the labels**, and
`ready-for-ai` is what starts everything — so on a fresh fork, labelling an
issue does nothing and nothing says why.

Actions → **Set up the harness** → Run workflow. It creates the four labels and
writes a summary saying what else the fork needs: an `ANTHROPIC_API_KEY`
secret **scoped to a workspace** (an organisation-level key is rejected, and
the error does not say which kind to make), and optionally an
`AGENT_GITHUB_TOKEN`.

## What happens to a ticket

Four stages, each its own GitHub Actions workflow, each in a fresh process:

1. **Build** — `ready-for-ai` on an issue starts a runner. It writes the spec,
   writes a failing check, implements, and gates on `npm run verify`. No green,
   no pull request.
2. **Code review** — a second agent reads the issue's acceptance criteria *first*,
   then the diff. It has not seen the reasoning that produced the change, which
   is the point. Blockers only, three findings at most.
3. **QA** — a third agent boots the app and drives it in a browser, looking for
   what nobody wrote a test for: the empty agenda, the phone viewport, day four,
   the second click. Its verdict also goes back on the **issue** as one line:
   the ticket asked for something, and whether it works is the ticket's
   business. The code review's findings stay on the pull request, because they
   are about the diff.
4. **A human merges.** Nothing here is a required check, so a red one informs
   the decision rather than making it.

They run when a pull request **opens**, and again if it is marked ready for
review — but never on a push. One pull request costs one pass of each.
`synchronize` was the expensive part: it charged for a full review on every
commit, so a fourteen-commit branch paid fourteen times over for one change.
To ask for another look after pushing fixes, put the pull request back to
draft and mark it ready again.

Both passes publish a verdict carrying a **confidence**, which means coverage
rather than feeling: how much of the change the agent could actually exercise
or judge. A high-confidence pass is green, a low-confidence one publishes as
*unproven* — a pass nobody could earn should not read like one.

Code review and QA trigger on the pull request itself. An earlier design keyed
off the build workflow finishing, which cannot work: a build started by an
`issues` event reports its `head_branch` as `main`, so looking up the pull
request by branch found nothing and neither pass ever ran.

**`pull_request` does fire for a pull request the agent opened**, even though
that pull request is created with `GITHUB_TOKEN`. This gets re-derived wrongly
about once a week, because the well-known rule — GitHub does not trigger
workflows from `GITHUB_TOKEN` actions — sounds like it should apply and does
not. Verified on PR #22, opened by `github-actions[bot]` with no
`AGENT_GITHUB_TOKEN` set: `verify` ran on it twice, `event=pull_request`.

What does happen is that every run on it sits at **`action_required`** until
somebody clicks *Approve workflows to run*. Verified on a brand-new repository
in a personal account with no organisation policy of any kind: three workflows
waiting. This is GitHub's behaviour for anything `github-actions[bot]` opens
and there is no setting that turns it off.

`AGENT_GITHUB_TOKEN` is the only way around it — the pull request is then
authored by a person, so nothing is gated. Keeping the click instead is a
defensible choice: it is a human checkpoint before any agent work runs.

## Every change starts with a spec

`specs/<issue>-<slug>.md`, written before the code and pushed as the first
commit on the branch. A reviewer reads the intent before the diff, and a
misreading of the ticket surfaces while it is still cheap.

They are kept. `CLAUDE.md` describes how the code works; `specs/` records how
it got that way — what each change was for, what the ticket left open, and what
was deliberately left undone.

## Commits

**Conventional Commits.** `type(scope): subject` — the subject in the
imperative, lower case, no full stop, under about 70 characters.

```
feat(agenda): total the hours booked across the conference
fix(seats): release a waitlist place when the seat ahead is dropped
ci: stop pr-media pushes triggering the browser suite
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`,
`chore`. The scope is optional and names the area, not the file.

The subject says what changed; **the body says why.** A diff already shows
what you did, so a body that restates it earns nothing — the reason, the
alternative you rejected, and the thing that will look wrong to whoever reads
this in six months are what is worth writing down. Skip the body when the
subject genuinely covers it.

## House rules

- Good engineering, no over-engineering. Match the surrounding code.
- Prefer editing an existing file over adding a new abstraction layer.
- Keep `seed.js` deterministic — it seeds its own PRNG so everyone's database is
  identical apart from the dates. Never use `Math.random()` there.
- Do not commit `data/orbit.db`, `.screenshots/`, or Playwright artefacts.
- Do not introduce a state management library, an ORM, or a UI kit.
