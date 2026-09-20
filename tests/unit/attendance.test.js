import './sandbox-db.js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../../server/db.js';

// attendance.js prepares its statements at module scope, so the tables have to
// exist before it is imported.
migrate();
const { attendanceWindow, CHECK_IN_OPENS_MINS } = await import('../../server/lib/attendance.js');

/** A 45-minute talk on day 2, in the shape the sessions table hands back. */
const session = { id: 42, day: '2026-10-13', starts_at: '14:30', ends_at: '15:15' };

const at = (day, time) => attendanceWindow(session, { day, time });
const today = (time) => at('2026-10-13', time);

describe('Check-in opens shortly before a session and closes when it ends', () => {
  test(`the window opens exactly ${CHECK_IN_OPENS_MINS} minutes before the start`, () => {
    assert.equal(CHECK_IN_OPENS_MINS, 15);
    assert.deepEqual(today('14:15'), { phase: 'opening', canCheckIn: true });
  });

  test('a minute too early is still refused, and says when it will open', () => {
    assert.deepEqual(today('14:14'), { phase: 'future', canCheckIn: false, opensAt: '14:30' });
  });

  test('a minute inside the window is allowed', () => {
    assert.deepEqual(today('14:16'), { phase: 'opening', canCheckIn: true });
  });

  test('the phase turns from opening to running on the stroke of the start time', () => {
    assert.equal(today('14:29').phase, 'opening');
    assert.equal(today('14:30').phase, 'running');
    assert.equal(today('14:30').canCheckIn, true);
  });

  test('you can still check in halfway through — people arrive late', () => {
    assert.deepEqual(today('14:50'), { phase: 'running', canCheckIn: true });
  });

  test('the last minute of the session is still open', () => {
    assert.deepEqual(today('15:14'), { phase: 'running', canCheckIn: true });
  });

  test('the window shuts on the stroke of the end time, not a minute later', () => {
    assert.deepEqual(today('15:15'), { phase: 'past', canCheckIn: false });
    assert.deepEqual(today('15:16'), { phase: 'past', canCheckIn: false });
  });
});

describe('A session on another day is never checkable', () => {
  test('a session later in the conference reads as future, however late in the day it is', () => {
    assert.deepEqual(at('2026-10-12', '23:59'), { phase: 'future', canCheckIn: false });
  });

  test('a session earlier in the conference reads as past, however early in the day it is', () => {
    assert.deepEqual(at('2026-10-14', '00:01'), { phase: 'past', canCheckIn: false });
  });

  test('the wrong day does not leak an opensAt the UI would count down to', () => {
    assert.equal(at('2026-10-12', '14:14').opensAt, undefined);
  });
});

describe('Without a clock there is nothing to say', () => {
  for (const [label, now] of [
    ['no clock at all', undefined],
    ['a null clock', null],
    ['a clock with no time', { day: '2026-10-13' }],
    ['a clock with no day', { time: '14:30' }],
    ['a clock with an empty time', { day: '2026-10-13', time: '' }],
  ]) {
    test(`${label} gives an unknown phase rather than a guess`, () => {
      assert.deepEqual(attendanceWindow(session, now), { phase: 'unknown', canCheckIn: false });
    });
  }
});
