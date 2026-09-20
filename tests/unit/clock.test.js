import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
// Safe to import outside a browser: nothing in this module touches `window`
// until a hook is actually called.
import { toMinutes, progressOf, relativeToNow, isOpenAt } from '../../src/lib/clock.js';

const session = { startsAt: '14:30', endsAt: '15:30' };

describe('Conference time is minutes since midnight', () => {
  test('a clock string becomes minutes', () => {
    assert.equal(toMinutes('00:00'), 0);
    assert.equal(toMinutes('08:15'), 495);
    assert.equal(toMinutes('23:59'), 1439);
  });
});

describe('A running session knows how far through it is', () => {
  test('a session that has not started yet is at zero, not a negative fraction', () => {
    assert.equal(progressOf(session, '14:00'), 0);
    assert.equal(progressOf(session, '14:30'), 0);
  });

  test('the halfway point is a half', () => {
    assert.equal(progressOf(session, '15:00'), 0.5);
  });

  test('a finished session is at one, and stays there', () => {
    assert.equal(progressOf(session, '15:30'), 1);
    assert.equal(progressOf(session, '18:00'), 1);
  });

  test('progress is a fraction the whole way through, never out of bounds', () => {
    for (let m = 13 * 60; m < 17 * 60; m += 7) {
      const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const p = progressOf(session, hhmm);
      assert.ok(p >= 0 && p <= 1, `${hhmm} gave ${p}`);
    }
  });
});

describe('Times are described relative to now', () => {
  test('a session starting this minute is starting now', () => {
    assert.equal(relativeToNow('10:30', '10:30'), 'starting now');
  });

  test('something soon is counted in minutes', () => {
    assert.equal(relativeToNow('10:42', '10:30'), 'in 12 min');
  });

  test('something that has already begun is counted backwards', () => {
    assert.equal(relativeToNow('10:22', '10:30'), '8 min ago');
  });

  test('past an hour it switches to hours and minutes, in both directions', () => {
    assert.equal(relativeToNow('12:35', '10:30'), 'in 2h 5m');
    assert.equal(relativeToNow('09:30', '10:30'), '1h 0m ago');
  });

  test('the switch to hours happens at exactly sixty minutes', () => {
    assert.equal(relativeToNow('11:29', '10:30'), 'in 59 min');
    assert.equal(relativeToNow('11:30', '10:30'), 'in 1h 0m');
  });
});

describe('Opening hours', () => {
  test('a venue is open from its opening minute', () => {
    assert.equal(isOpenAt('08:00', '18:00', '07:59'), false);
    assert.equal(isOpenAt('08:00', '18:00', '08:00'), true);
  });

  test('a venue is shut on its closing minute, not a minute after', () => {
    assert.equal(isOpenAt('08:00', '18:00', '17:59'), true);
    assert.equal(isOpenAt('08:00', '18:00', '18:00'), false);
  });

  test('a bar that closes after midnight is still open late', () => {
    assert.equal(isOpenAt('08:00', '01:00', '22:30'), true);
    assert.equal(isOpenAt('08:00', '01:00', '23:59'), true);
  });

  test('a bar that closes after midnight is open in the small hours too', () => {
    assert.equal(isOpenAt('08:00', '01:00', '00:00'), true);
    assert.equal(isOpenAt('08:00', '01:00', '00:59'), true);
  });

  test('and shut between closing time and the next opening', () => {
    assert.equal(isOpenAt('08:00', '01:00', '01:00'), false);
    assert.equal(isOpenAt('08:00', '01:00', '04:00'), false);
    assert.equal(isOpenAt('08:00', '01:00', '07:59'), false);
  });
});
