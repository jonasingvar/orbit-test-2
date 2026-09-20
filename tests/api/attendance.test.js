import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearAgenda, days, shiftTime, startApi } from './harness.js';

/**
 * Check-in.
 *
 * The window opens fifteen minutes before a session starts and closes when it
 * ends — you cannot check in to something that has not happened, and you cannot
 * check in to something you missed. "Now" comes from the client, because
 * conference time is simulated.
 *
 * There is deliberately no way to undo a check-in, so every test that expects
 * one to succeed takes a session of its own.
 */

const ME = 3;

let api;
let close;
let DAYS;
let spare;

before(async () => {
  ({ api, close } = await startApi());
  DAYS = await days(api);
  await clearAgenda(api, ME); // check-in owes nothing to seats, and we assert that
  // Day 2, well clear of the seeded check-ins on day 1 and late enough that
  // "two hours before" is still a real time of day.
  spare = (await api.json('/sessions'))
    .filter((s) => s.day === DAYS[1] && s.startsAt >= '10:00')
    .sort((a, b) => a.id - b.id);
});
after(() => close());

/** A session nothing else in this file has touched. */
const nextSession = () => spare.shift();

const checkIn = (session, time, day = session.day) =>
  api.put(`/users/${ME}/checkins/${session.id}`, { day, time });

describe('The check-in window', () => {
  test('is shut hours before the doors open', async () => {
    const session = nextSession();
    const res = await checkIn(session, shiftTime(session.startsAt, -120));

    assert.equal(res.status, 409);
    assert.equal(res.body.rejected, 'future');
    assert.equal(res.body.canCheckIn, false);
    assert.equal(res.body.checkedIn, false);
    assert.equal(res.body.checkInOpensAt, session.startsAt, 'the UI has to say when to come back');
  });

  test('is still shut twenty minutes out', async () => {
    const session = nextSession();
    const res = await checkIn(session, shiftTime(session.startsAt, -20));

    assert.equal(res.status, 409);
    assert.equal(res.body.rejected, 'future');
    assert.equal(res.body.checkedIn, false);
  });

  test('is open ten minutes out, because the boundary is fifteen', async () => {
    const session = nextSession();
    const res = await checkIn(session, shiftTime(session.startsAt, -10));

    assert.equal(res.status, 200);
    assert.equal(res.body.checkedIn, true);
    assert.equal(res.body.phase, 'opening');
    assert.ok(res.body.checkedInAt, 'a check-in records when it happened');
    assert.equal(res.body.canCheckIn, false, 'there is nothing left to offer once you are in');
  });

  test('is open while the session is actually running', async () => {
    const session = nextSession();
    const res = await checkIn(session, shiftTime(session.startsAt, 5));

    assert.equal(res.status, 200);
    assert.equal(res.body.checkedIn, true);
    assert.equal(res.body.phase, 'running');
  });

  test('shuts the moment the session ends', async () => {
    const session = nextSession();
    const onTheBell = await checkIn(session, session.endsAt);

    assert.equal(onTheBell.status, 409);
    assert.equal(onTheBell.body.rejected, 'past');
    assert.equal(onTheBell.body.checkedIn, false);

    const later = await checkIn(session, shiftTime(session.endsAt, 60));
    assert.equal(later.status, 409);
    assert.equal(later.body.rejected, 'past');
  });

  test('never opens for a session on another day', async () => {
    const session = nextSession();

    const tomorrow = await checkIn(session, session.startsAt, DAYS[2]);
    assert.equal(tomorrow.status, 409);
    assert.equal(tomorrow.body.rejected, 'past', 'from day 3, a day 2 session is history');

    const yesterday = await checkIn(session, session.startsAt, DAYS[0]);
    assert.equal(yesterday.status, 409);
    assert.equal(yesterday.body.rejected, 'future');
  });

  test('does not require a seat — only that you are standing there', async () => {
    const session = nextSession();
    assert.equal((await api.get(`/users/${ME}/reservations/${session.id}`)).body.status, null);

    const res = await checkIn(session, shiftTime(session.startsAt, 5));
    assert.equal(res.status, 200);
    assert.equal(res.body.checkedIn, true);
  });
});

describe('Attendance state', () => {
  test('reports the same window the check-in route enforces', async () => {
    const session = nextSession();
    const url = `/users/${ME}/attendance/${session.id}?day=${session.day}`;

    const early = await api.json(`${url}&time=${shiftTime(session.startsAt, -20)}`);
    assert.equal(early.canCheckIn, false);
    assert.equal(early.phase, 'future');

    const open = await api.json(`${url}&time=${shiftTime(session.startsAt, -10)}`);
    assert.equal(open.canCheckIn, true);
    assert.equal(open.phase, 'opening');

    const over = await api.json(`${url}&time=${shiftTime(session.endsAt, 30)}`);
    assert.equal(over.canCheckIn, false);
    assert.equal(over.phase, 'past');
    assert.equal(over.canRate, false, 'you were not there, so there is nothing to rate');
  });

  test('says nothing definite without a clock', async () => {
    const session = nextSession();
    const state = await api.json(`/users/${ME}/attendance/${session.id}`);

    assert.equal(state.phase, 'unknown');
    assert.equal(state.canCheckIn, false);
    assert.equal(state.canRate, false);
  });
});
