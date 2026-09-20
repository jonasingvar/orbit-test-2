/**
 * A booked day as a strip of time.
 *
 * My Agenda lists what you hold a seat for; this turns that list into the shape
 * of the day — how long each session runs, and what sits between them. The
 * interesting part is the gaps: across two sites six miles apart, the hour
 * between a talk at Aurora and one at the Foundry is not free time, it is the
 * drive. `assessTravel` and the `venue_travel` rows decide that, never a guess.
 */
import { assessTravel } from './travel.js';

const minutesInto = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * How much slack over the free shuttle counts as comfortable.
 *
 * `assessTravel` answers what fits, which is not the same question as what is
 * pleasant: clearing a 25-minute shuttle by four minutes technically fits and
 * is still a sprint. Purely a display judgement — it changes nothing about how
 * travel times are calculated.
 */
export const COMFORTABLE_SLACK_MINS = 10;

/** The words the strip uses, so nothing is carried by colour alone. */
const TRAVEL_LABEL = {
  comfortable: 'Enough time',
  tight: 'Tight',
  impossible: 'Not enough time',
};

function levelFor(check) {
  if (check.impossible) return 'impossible';
  if (check.freeTooSlow) return 'tight';
  if (check.free && check.gapMinutes - check.free.total >= COMFORTABLE_SLACK_MINS) return 'comfortable';
  return 'tight';
}

/**
 * `buildTimeline({ sessions, travel })` → `{ startsAt, endsAt, spanMinutes, items }`,
 * or `null` when there is nothing booked — a day with no sessions gets no strip
 * rather than an empty one.
 *
 * `items` alternates sessions and gaps in clock order. Each carries `minutes`
 * and `percent`, its share of the strip, so a 90-minute keynote is three times
 * the width of a 30-minute talk. A gap that changes venue also carries the
 * `assessTravel` verdict and a `level` of comfortable / tight / impossible.
 */
export function buildTimeline({ sessions, travel = [] }) {
  if (!sessions?.length) return null;

  const ordered = [...sessions].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.endsAt.localeCompare(b.endsAt),
  );

  const items = [];
  // A waitlist place can overlap a seat, so walk the day with a cursor: a
  // session starting before the previous one ends simply produces no gap.
  let cursor = null;
  let previous = null;

  for (const s of ordered) {
    const start = minutesInto(s.startsAt);

    if (cursor !== null && start > cursor) {
      const gapMinutes = start - cursor;
      const check = assessTravel({ travel, from: previous, to: s, gapMinutes });
      const level = check ? levelFor(check) : null;

      items.push({
        kind: 'gap',
        key: `gap-${previous.id}-${s.id}`,
        minutes: gapMinutes,
        startsAt: previous.endsAt,
        endsAt: s.startsAt,
        isTravel: Boolean(check),
        travel: check,
        level,
        from: check ? previous.venue.shortName : null,
        to: check ? s.venue.shortName : null,
        label: check ? TRAVEL_LABEL[level] : 'Free',
      });
    }

    items.push({
      kind: 'session',
      key: `session-${s.id}`,
      session: s,
      minutes: Math.max(0, minutesInto(s.endsAt) - start),
      startsAt: s.startsAt,
      endsAt: s.endsAt,
    });

    // Where you end up is wherever you are latest, which after an overlap is
    // not necessarily the session that came last in the list.
    if (cursor === null || minutesInto(s.endsAt) >= cursor) {
      cursor = minutesInto(s.endsAt);
      previous = s;
    }
  }

  const spanMinutes = items.reduce((n, i) => n + i.minutes, 0);
  // A session can be booked with no measurable length; share the strip evenly
  // rather than dividing by zero.
  const share = (minutes) => (spanMinutes > 0 ? (minutes / spanMinutes) * 100 : 100 / items.length);

  return {
    startsAt: items[0].startsAt,
    endsAt: previous.endsAt,
    spanMinutes,
    // What the day costs you in wall clock. The same as `spanMinutes` unless
    // two bookings overlap, and the honest number to put under the strip.
    endToEndMinutes: minutesInto(previous.endsAt) - minutesInto(items[0].startsAt),
    items: items.map((i) => ({ ...i, percent: share(i.minutes) })),
  };
}
