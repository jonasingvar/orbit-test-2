import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline } from '../../src/lib/timeline.js';

const AURORA = 1;
const FOUNDRY = 2;

/** The two-venue travel table, in the camelCase shape `toTravel` returns. */
const travel = [
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Shuttle', minutes: 25, costUsd: 0 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Rideshare', minutes: 16, costUsd: 18 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Transit', minutes: 34, costUsd: 3 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Walk', minutes: 118, costUsd: 0 },
  { fromVenueId: FOUNDRY, toVenueId: AURORA, mode: 'Shuttle', minutes: 27, costUsd: 0 },
];

const mins = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** A booked session, the shape `toSession` hands the page. */
let nextId = 1;
const session = (startsAt, endsAt, { venueId = AURORA, walkMinutes = 0, title = 'A talk' } = {}) => ({
  id: nextId++,
  title,
  startsAt,
  endsAt,
  durationMins: mins(endsAt) - mins(startsAt),
  room: { name: 'Hall A', walkMinutes },
  venue: { id: venueId, shortName: venueId === AURORA ? 'Aurora' : 'Foundry', accent: 'violet' },
});

const sessions = (t) => t.items.filter((i) => i.kind === 'session');
const gaps = (t) => t.items.filter((i) => i.kind === 'gap');

describe('The shape of a booked day', () => {
  test('a block takes the share of the strip its duration earns', () => {
    const t = buildTimeline({
      travel,
      sessions: [
        session('09:00', '10:30', { title: 'Keynote' }),  // 90 min
        session('10:30', '11:00', { title: 'Lightning' }), // 30 min
      ],
    });

    const [keynote, lightning] = sessions(t);
    assert.equal(keynote.minutes, 90);
    assert.equal(lightning.minutes, 30);
    assert.equal(keynote.percent, 75);
    assert.equal(lightning.percent, 25);
    // three times the duration, three times the width
    assert.equal(keynote.percent, lightning.percent * 3);
  });

  test('every item together spans the whole strip', () => {
    const t = buildTimeline({
      travel,
      sessions: [session('09:00', '09:45'), session('11:00', '12:30'), session('14:00', '14:20')],
    });

    const total = t.items.reduce((n, i) => n + i.percent, 0);
    assert.ok(Math.abs(total - 100) < 0.001, `items summed to ${total}`);
    assert.equal(t.spanMinutes, mins('14:20') - mins('09:00'));
  });

  test('the strip runs from the first start to the last end, in order', () => {
    const t = buildTimeline({
      travel,
      sessions: [session('14:00', '14:45'), session('09:00', '09:45')],
    });

    assert.equal(t.startsAt, '09:00');
    assert.equal(t.endsAt, '14:45');
    assert.deepEqual(t.items.map((i) => i.kind), ['session', 'gap', 'session']);
  });

  test('gaps carry how long they are', () => {
    const t = buildTimeline({
      travel,
      sessions: [session('09:00', '09:45'), session('11:00', '11:45')],
    });

    assert.equal(gaps(t).length, 1);
    assert.equal(gaps(t)[0].minutes, 75);
  });

  test('back-to-back sessions leave no gap', () => {
    const t = buildTimeline({
      travel,
      sessions: [session('09:00', '09:45'), session('09:45', '10:30')],
    });

    assert.equal(gaps(t).length, 0);
  });

  test('an overlapping waitlist place does not produce a negative gap', () => {
    const t = buildTimeline({
      travel,
      sessions: [session('09:00', '10:00'), session('09:30', '10:30')],
    });

    assert.equal(gaps(t).length, 0);
    assert.ok(t.items.every((i) => i.percent > 0));
    // the strip is drawn at the sum of its blocks, but the day really only
    // took an hour and a half
    assert.equal(t.spanMinutes, 120);
    assert.equal(t.endToEndMinutes, 90);
    assert.equal(t.endsAt, '10:30');
  });
});

describe('The gap you cannot spend', () => {
  const crossTown = (gapMinutes, walkMinutes = 6) => {
    const start = mins('09:00');
    const secondStart = start + 45 + gapMinutes;
    const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return buildTimeline({
      travel,
      sessions: [
        session('09:00', hhmm(start + 45)),
        session(hhmm(secondStart), hhmm(secondStart + 45), { venueId: FOUNDRY, walkMinutes }),
      ],
    });
  };

  test('a gap that changes venue is marked as travel', () => {
    const [gap] = gaps(crossTown(60));
    assert.equal(gap.isTravel, true);
    assert.equal(gap.from, 'Aurora');
    assert.equal(gap.to, 'Foundry');
  });

  test('an hour to cross town, and the free shuttle makes it comfortably', () => {
    const [gap] = gaps(crossTown(60));
    assert.equal(gap.level, 'comfortable');
    // 25 min shuttle + 6 min walk at the far end
    assert.equal(gap.travel.fastest.total, 22);
    assert.equal(gap.travel.free.total, 31);
  });

  test('ten minutes to cross town is not enough, whatever you pay', () => {
    const [gap] = gaps(crossTown(10));
    assert.equal(gap.level, 'impossible');
    assert.equal(gap.travel.impossible, true);
  });

  test('a gap only a rideshare can make is tight, not comfortable', () => {
    const [gap] = gaps(crossTown(25));
    assert.equal(gap.level, 'tight');
    assert.equal(gap.travel.freeTooSlow, true);
  });

  test('clearing the free shuttle by only a few minutes is still tight', () => {
    const [gap] = gaps(crossTown(35));
    assert.equal(gap.travel.free.fits, true);
    assert.equal(gap.level, 'tight');
  });

  test('a gap inside one building is ordinary free time, however long', () => {
    const t = buildTimeline({
      travel,
      sessions: [session('09:00', '09:45'), session('15:00', '15:45')],
    });

    const [gap] = gaps(t);
    assert.equal(gap.isTravel, false);
    assert.equal(gap.level, null);
    assert.equal(gap.travel, null);
  });

  test('every gap says something a reader can read without colour', () => {
    for (const t of [crossTown(60), crossTown(25), crossTown(10)]) {
      assert.match(gaps(t)[0].label, /\S/);
    }
  });
});

describe('Days that are barely days', () => {
  test('one session fills the strip on its own, with no gaps', () => {
    const t = buildTimeline({ travel, sessions: [session('09:00', '09:45')] });

    assert.equal(t.items.length, 1);
    assert.equal(t.items[0].kind, 'session');
    assert.equal(t.items[0].percent, 100);
    assert.equal(t.spanMinutes, 45);
  });

  test('a day with nothing booked has no timeline at all', () => {
    assert.equal(buildTimeline({ travel, sessions: [] }), null);
    assert.equal(buildTimeline({ travel, sessions: undefined }), null);
  });

  test('a zero-length booking still renders rather than dividing by zero', () => {
    const t = buildTimeline({ travel, sessions: [session('09:00', '09:00')] });

    assert.equal(t.items.length, 1);
    assert.ok(Number.isFinite(t.items[0].percent));
  });
});
