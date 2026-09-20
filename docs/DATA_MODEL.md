# Data model

SQLite, one file at `data/orbit.db`, rebuilt from scratch by `npm run db:seed`.
The authoritative schema is the `SCHEMA` string in [`server/db.js`](../server/db.js);
this document explains the shape and the parts that carry meaning.

## Scale

Approximate counts from a fresh seed. The tables attendees write to drift as you
(and the test suite) use the app.

| Table | Rows | Notes |
| --- | --- | --- |
| `venues` | 2 | Two physical sites, 6.2 miles apart |
| `venue_travel` | 8 | Travel time + cost per mode, both directions |
| `rooms` | 29 | Stages, workshops, roundtables; each belongs to a venue |
| — | — | Each *day* uses a stable five of them (four Aurora, one Foundry), each themed to one track, plus the keynote stage and a social venue |
| `tracks` | 10 | Programme tracks, each with a colour |
| `tags` | 69 | Four kinds: `topic`, `tech`, `audience`, `vibe` |
| `speakers` | 110 | Fictional, with synthetic portraits. Two are linked to attendee accounts |
| `sessions` | ~140 | 4 days × 7 slots × 5 rooms (a few slots left empty), plus a keynote and a social each day |
| `session_speakers` | ~195 | Many-to-many, with a `role` (Speaker / Moderator / Host) |
| `session_tags` | ~980 | Many-to-many |
| `users` | 6 | Attendees. No passwords — there is no auth |
| `reservations` | ~60 | An attendee's agenda. Holds a real seat; `status` is `confirmed` or `waitlisted` |
| `speaker_follows` | ~20 | |
| `ratings` | ~10 | Only submittable by someone who checked in, once the session is over |
| `check_ins` | ~10, grows | Proof of attendance; gates rating. Seeded only for Day 1's morning |
| `vendors` | 24 | Food and drink at both venues, with opening hours and wait times |
| `sponsors` | 28 | Five tiers, booth numbers, perks |
| `announcements` | 10 | Two are pinned. The home page shows the latest one already posted at the clock's time |

## The two-venue split

This is the most important thing in the data model, because it is where the
interesting product problems come from.

```
Aurora Convention Center          The Foundry at Red Rock Yards
3200 Neon Boulevard               1145 Ironworks Road
19 stages · main site             10 stages · workshops, hardware, late shows
        │                                        │
        └──────── 6.2 miles ─────────────────────┘
             Shuttle   27 min   free
             Rideshare 18 min   ~$23.50
             Taxi      19 min   ~$31.00
             Walk      96 min   please do not
```

Session slots run back to back with a 30-minute gap (`09:00–09:45`, then
`10:15`). **A 27-minute shuttle plus walking time does not fit in that gap**, so
an attendee can book two sessions that do not overlap in time and still be
unable to attend both. Day 3's keynote is deliberately at the Foundry.

`venue_travel` rows are directional — `from_venue_id` → `to_venue_id` — because
the return journey is slightly slower.

## Key relationships

```
venues ──< rooms ──< sessions >── tracks
                        │
                        ├──< session_speakers >── speakers
                        ├──< session_tags >────── tags
                        ├──< reservations >────── users
                        ├──< check_ins >───────── users
                        └──< ratings >─────────── users

users ──< speaker_follows >── speakers

users.speaker_id ──> speakers.id     (set for attendees who are also presenting)
venues ──< vendors, sponsors, announcements
```

## Columns worth knowing

**`sessions`** — `day` (`YYYY-MM-DD`), `starts_at`/`ends_at` (`HH:MM`, local
venue time, no timezone stored), `duration_mins`, `capacity` and `seats_taken`
(the API derives `seatsLeft` and `fillRate`), `takeaways` (pipe-separated),
`is_keynote`, `is_recorded`, `requires_rsvp`, `livestream`, and `avg_rating` /
`rating_count`, which are rolled up from `ratings` whenever someone rates.
`recording_url`, `slides_url` and `repo_url` are always `NULL` — a link to a
domain that does not exist is worse than no link.

**`rooms`** — `walk_minutes` is time on foot from that venue's entrance. There
are no map coordinates: the only map is `VenueRouteMap`, drawn from the venues'
real `lat`/`lng`. `accessible = 0` means step-free access is not available
(two rooms at the Foundry).

**`speakers`** — `image_url` points at a committed synthetic portrait in
`public/avatars/` (`/avatars/speaker-042.jpg`). The faces are StyleGAN output:
generated, not photographs of real people. Speakers without a file fall back to
a deterministic generated SVG portrait (`src/components/GeneratedAvatar.jsx`).
`expertise` and `languages` are comma-separated. `avg_rating` is not invented:
the seed derives it from the ratings on that speaker's sessions, so most
speakers start at 0.

**`users`** — `speaker_id` links an attendee to their speaker profile. When set,
`GET /api/users/:id` returns `isSpeaker: true`, a `speaker` object and
`speakingSessions`, which is what renders the speaking panel on My Agenda and
the home page.

**`reservations`** — one row per attendee per session, `status` `confirmed` or
`waitlisted`, `created_at` ordering the waitlist. Taking or releasing a
confirmed seat moves `sessions.seats_taken`; the rules live in
`server/lib/seats.js`. `seats_taken` also counts the crowd who are not seeded
attendees, so it is not a count of rows here.

**`check_ins`** / **`ratings`** — one of each per attendee per session.
A rating (`stars` 1–5, optional `comment`) needs a check-in and a finished
session; see `server/lib/attendance.js`.

## Time

Nothing in the database stores a timezone. `sessions.starts_at` / `ends_at` are
local venue time as `HH:MM`, and `day` is a plain date. The app's sense of "now"
is simulated client-side by `src/lib/clock.js` and passed to
`GET /api/live?day=&time=`, which returns the sessions running at that instant
plus the next slot. The server has no clock of its own for any rule — reserving,
check-in and rating are all judged against a moment the client sends (it only
uses real time to stamp `created_at` / `checked_in_at`), which is what makes
the whole thing testable.

## Determinism

`server/seed.js` uses its own linear congruential PRNG seeded with `20261012`.
Everyone who clones this repo gets identical data, shifted to start on the day
they seed (or on `ORBIT_START_DATE`). **Never use `Math.random()` in the seed**
— it breaks screenshot comparisons, test fixtures and shared issue reports.

Attendee agendas are shaped, not random. Nobody attends seven sessions a day, so
each attendee books the keynote (sometimes) plus **one to four talks** on the
days they actually show up — leaving most of the grid deliberately empty, the
way a real schedule looks. Totals run from a handful to about 16 sessions across
the whole conference, varying by persona: Marcus flew in for a couple of
specific talks, Sofia wants to see everything.

The seed books at most one seat per slot, because the API refuses overlapping
seats and the seed must not create state the rules make unreachable.

Jonas's cross-town traps are planted **before** the organic picks, so the slots
are already taken when the random filling happens. Otherwise the trap
degenerates into an ordinary time clash instead of the subtler "these do not
overlap, but you still cannot make both" case it is meant to be.
