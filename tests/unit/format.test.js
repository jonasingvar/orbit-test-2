import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { time, timeRange, dayLabel, shortDay, relativeDate, plural } from '../../src/lib/format.js';

describe('Clock times read as people say them', () => {
  test('midnight and noon are twelve, not zero', () => {
    assert.equal(time('00:00'), '12:00 AM');
    assert.equal(time('12:00'), '12:00 PM');
  });

  test('the hour flips to PM at noon and back at midnight', () => {
    assert.equal(time('11:59'), '11:59 AM');
    assert.equal(time('12:01'), '12:01 PM');
    assert.equal(time('23:59'), '11:59 PM');
    assert.equal(time('00:15'), '12:15 AM');
  });

  test('minutes keep their leading zero', () => {
    assert.equal(time('09:05'), '9:05 AM');
  });

  test('a range joins both ends with an en dash', () => {
    assert.equal(timeRange('09:00', '10:30'), '9:00 AM – 10:30 AM');
    assert.equal(timeRange('11:30', '12:15'), '11:30 AM – 12:15 PM');
  });
});

describe('Conference dates are read as dates, never as the machine sees them', () => {
  test('a day gets its weekday and date', () => {
    assert.equal(dayLabel('2026-10-12'), 'Monday, Oct 12');
    assert.equal(shortDay('2026-10-12'), 'Mon');
  });

  test('the same date reads the same whatever timezone the machine is in', () => {
    const tz = process.env.TZ;
    try {
      for (const zone of ['Pacific/Kiritimati', 'Pacific/Niue', 'UTC', 'America/Denver']) {
        process.env.TZ = zone;
        assert.equal(dayLabel('2026-10-12'), 'Monday, Oct 12', zone);
        assert.equal(shortDay('2026-10-15'), 'Thu', zone);
      }
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
});

describe('"How long ago" is measured against the conference clock', () => {
  const clock = { day: '2026-10-13', time: '14:30' };

  test('something in the last hour is counted in minutes', () => {
    assert.equal(relativeDate('2026-10-13T14:18:00Z', clock), '12m ago');
    assert.equal(relativeDate('2026-10-13T13:31:00Z', clock), '59m ago');
  });

  test('an hour or more is counted in hours', () => {
    assert.equal(relativeDate('2026-10-13T13:30:00Z', clock), '1h ago');
    assert.equal(relativeDate('2026-10-13T11:30:00Z', clock), '3h ago');
  });

  test('anything older than a day falls back to the date itself', () => {
    assert.equal(relativeDate('2026-10-11T09:00:00Z', clock), 'Oct 11');
  });

  test('it reads the clock it was given, not the wall clock', () => {
    const iso = '2026-10-13T12:30:00Z';
    assert.equal(relativeDate(iso, { day: '2026-10-13', time: '12:42' }), '12m ago');
    assert.equal(relativeDate(iso, { day: '2026-10-13', time: '16:30' }), '4h ago');
    assert.equal(relativeDate(iso, { day: '2026-10-15', time: '09:00' }), 'Oct 13');
  });

  test('a timestamp the clock has not reached yet clamps to a minute rather than going negative', () => {
    assert.equal(relativeDate('2026-10-13T14:30:00Z', clock), '1m ago');
    assert.equal(relativeDate('2026-10-13T15:30:00Z', clock), '1m ago');
  });
});

describe('Counts are pluralised', () => {
  test('one of a thing keeps the singular', () => {
    assert.equal(plural(1, 'session'), '1 session');
  });

  test('none and many both take the plural', () => {
    assert.equal(plural(0, 'session'), '0 sessions');
    assert.equal(plural(12, 'session'), '12 sessions');
  });

  test('an irregular plural can be given outright', () => {
    assert.equal(plural(1, 'person', 'people'), '1 person');
    assert.equal(plural(3, 'person', 'people'), '3 people');
  });
});
