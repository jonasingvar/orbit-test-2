# 2 — Say how many results a filter returned on the speakers page

## What this changes

`/speakers` gains a result count beside the page heading, reading `110 speakers`
unfiltered and `7 speakers` once a search, a day, a track or a Show chip has
narrowed the list. While the fetch is in flight it reads `Loading…` rather than
flashing `0 speakers`, and when nothing matches it reads `0 speakers` above the
existing empty state.

This is the same element the schedule already has: a small muted count on the
header row, `data-testid="result-count"`, built with `plural()`.

## Where

- `src/pages/SpeakersPage.jsx` — render the count in the `SectionHeader`
  `action` slot. The header description currently carries the number in prose
  (`110 of them, …` / `7 speakers match.`), so drop the number from that copy
  rather than print it twice.
- `tests/speakers.spec.js` — the new check.

## How it will be proved

Playwright (`tests/speakers.spec.js`), because the count is rendered state that
depends on the store and the filter chips — the cheapest layer that can prove it
is the browser.

One test: read the unfiltered and keynote-filtered totals from
`GET /api/speakers`, assert the page shows each of them before and after
clicking the Keynotes chip, then search for a string nothing matches and assert
it reads `0 speakers`. The expected numbers come from the API, not from the
rendered output.

## Decisions

- **Counts everyone listed, not just the results grid.** The page is tiered —
  people you follow, the headliner spotlight, everyone else — and
  `data-testid="speaker-count"` already labels the third tier only. The new
  count is the whole list, which is the question the ticket asks.
- **`0 speakers`, not `No speakers`.** The schedule renders `plural(n, …)`
  unmodified at zero and the ticket asks for the existing pattern; the empty
  state below it already explains what to do about it.

## Out of scope

The schedule page, the filters, the tiering and the speaker cards, per the
ticket. `speaker-count` on the third tier stays as it is.
