# 4 — Show how each day actually runs, including the gap you cannot spend

## What this changes

Each day section on **My Agenda** gains a timeline above its session rows: a
horizontal strip spanning that day's booked hours, where every booked session is
a block whose width is proportional to its duration, and every gap between two
sessions is a visible piece of the strip labelled with its length.

A gap that crosses from Aurora to The Foundry (or back) is not free time, it is
the drive. Those gaps are marked as travel and say which of the three it is:

- **Enough time** — the free shuttle fits with room to spare.
- **Tight** — it fits, but only just, or only if you pay for a rideshare.
- **Not enough time** — nothing in `venue_travel` gets you there in the gap.

The verdict comes from `assessTravel()` and the `venue_travel` rows, plus the
walk at the far end — never from a guess about distance.

The distinction never rests on hue: each gap carries a word, an icon, and (for
travel) a striped fill, so a reader who cannot separate amber from emerald still
reads "Tight" next to a warning icon.

A day with one session renders as a single full-width block with no gaps. A day
with none renders nothing at all — no empty strip.

## Where

- `src/lib/timeline.js` — **new.** `buildTimeline({ sessions, travel })` turns a
  day's booked sessions into an ordered list of `session` and `gap` items, each
  with its minutes and its share of the strip, and asks `assessTravel()` about
  every gap that changes venue. Pure; no DOM, no fetch.
- `src/components/DayTimeline.jsx` — **new.** Renders that list. Session blocks
  link to the session; gaps are informative only. The strip has a floor width
  and scrolls inside its own container on a phone, so proportions stay exact
  rather than collapsing into unreadable slivers.
- `src/pages/MyAgendaPage.jsx` — `DayPlan` renders `<DayTimeline>` between the
  clash banner and the session rows; `travel` comes from `useConference()`.
- `tests/unit/timeline.test.js` — **new.**
- `tests/plan.spec.js` — one browser test that the timeline is on the page.

## How it will be proved

Almost all of it is a pure function, so almost all of it is proved without a
browser — `tests/unit/timeline.test.js`:

- a 90-minute block is three times the share of a 30-minute one, and every
  item's share sums to 100
- a gap between Aurora and The Foundry comes back marked as travel with the
  level the `venue_travel` rows imply — comfortable at 60 minutes, not enough
  at 10
- a gap inside one building is not travel, whatever its length
- one session → one item, full width, no gaps
- no sessions → nothing to render

`tests/plan.spec.js` adds the part only a browser can answer: each day section
on `/my-agenda` shows a timeline holding exactly one block per session on that
day, each with an accessible name. It runs on the desktop and mobile projects,
so phone width is covered, and the existing smoke suite already fails on
horizontal page overflow.

## Decisions

- **"Tight" needs a number the data does not carry.** `assessTravel()` reports
  what fits, not what is comfortable, so the strip calls a gap comfortable only
  when the free option clears it by ten minutes or more. That threshold is a
  display judgement and lives in `timeline.js` as a named constant; it does not
  touch how travel times are calculated.
- **Gaps may be clamped to a readable minimum width; session blocks never are.**
  Proportionality is a stated criterion for sessions only, and a five-minute gap
  clamped up from two pixels still leaves the session blocks proportional to
  each other.
- **Overlapping bookings do not break the strip.** A waitlist place can overlap
  a seat, so the day is walked in start order with a cursor: an item that starts
  before the previous one ends simply produces no gap.

## Out of scope

Booking or removing from the timeline, the schedule page, anything about how
travel times are calculated or what `venue_travel` holds, and the speaking
panel — all untouched.
