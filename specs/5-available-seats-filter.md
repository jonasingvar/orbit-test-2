# 5 — Let an attendee hide sessions that are already full

## What this changes

On `/schedule`, a **Seats left** toggle sits in the filter rail with the other
filters. Switched on, the list shows only sessions that still have a seat to
take, so an attendee scanning for something to commit to never opens a card and
finds a waitlist. The result count above the list counts the filtered list, the
choice lands in the URL as `?seats=1`, and it combines with day, track, venue,
level, format, topic and search rather than replacing any of them.

Like every other content filter, it falls back to the list view: it removes
scattered sessions from across the day, which would leave the grid a
mostly-empty matrix. The grid toggle is disabled with a reason, exactly as a
track or topic filter already does.

## Where

- `server/routes/sessions.js` — `GET /api/sessions` accepts `hasSeats=1`, adding
  `s.seats_taken < s.capacity` to the `WHERE` list. No new mapper field:
  `toSession` already exposes `seatsLeft` and `isFull`.
- `src/lib/api.js` — nothing; `getSessions` already forwards whatever filters it
  is handed through `qs()`.
- `src/pages/SchedulePage.jsx` — read `seats` from the URL, pass `hasSeats` to
  the fetch, render the toggle in the rail, count it in `activeKeys`, and add it
  to `BLOCKERS`.
- `src/components/SessionCard.jsx` — a `data-testid` on the existing "Full"
  badge so a browser test can assert none is rendered. No visual change.

## How it will be proved

- `tests/api/seats.test.js` — the filter returns only sessions with a seat free,
  a session the seed sold out is absent from it, and it narrows alongside a day
  filter rather than ignoring it. (API layer: the rule needs the database and the
  route, not a browser.)
- `tests/api/endpoints.test.js` — the new filter joins the breadth list, which
  that file asks for by name.
- `tests/schedule.spec.js` — apply the toggle from the page: the count drops, the
  URL carries `seats=1`, a reload keeps it on, and no rendered card says "Full".

## Decisions

- **`?seats=1` in the URL, `hasSeats=1` on the API.** The page's params are the
  short user-facing ones (`track`, `venue`, `tag`), the API's are explicit
  (`trackSlug`, `venueId`); `open=1` on `/food` is the existing precedent for a
  boolean filter in a URL, and this toggle follows its markup too.
- **"Seats left", not "hide full sessions".** The control states what you get,
  and matches the wording already on the card.
- **It blocks the grid.** The ticket does not mention the two views, but
  `CLAUDE.md` is explicit that a content filter makes the grid meaningless; a
  filter that silently gapped the grid would be the bug this ticket exists to
  avoid.
- A full session's own card is untouched — hiding it is the attendee's choice,
  and the ticket puts the card's appearance out of scope.

## Out of scope

Waitlists and `server/lib/seats.js`. The session detail page. Filtering by seats
anywhere other than `/schedule`.
