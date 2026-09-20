import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearAgenda, overlaps, startApi } from './harness.js';

/**
 * Seat inventory, at the API.
 *
 * There is exactly one action — adding a session takes a seat — so everything
 * in `server/lib/seats.js` is reachable through two verbs on one URL. The
 * database is this file's own copy, so tests book destructively and never
 * bother tidying up.
 */

const ATTENDEES = [1, 2, 3, 4, 5, 6];
/** Promotion tests consume their fixture, so each one takes a fresh session. */
const used = new Set();

let api;
let close;

before(async () => { ({ api, close } = await startApi()); });
after(() => close());

/** A session with room to spare. Call it after clearing the attendee's plan. */
async function openSession() {
  const sessions = await api.json('/sessions');
  return sessions.find((s) => !s.isFull && s.seatsLeft > 2);
}

/**
 * A sold-out session that somebody still holds a real seat on — releasing that
 * seat is the only way to make a promotion happen — together with a session it
 * clashes with that still has seats. The seed guarantees both exist.
 */
async function promotionFixture(skip) {
  const sessions = await api.json('/sessions');
  for (const session of sessions.filter((s) => s.isFull && !skip.has(s.id))) {
    for (const holder of ATTENDEES) {
      const { body } = await api.get(`/users/${holder}/reservations/${session.id}`);
      if (body.status !== 'confirmed') continue;
      const clashing = sessions.find((s) => s.id !== session.id && !s.isFull && overlaps(s, session));
      if (clashing) return { session, holder, clashing };
    }
  }
  return null;
}

/** Take everyone out of this session's queue, so promotion order is ours to set. */
async function emptyTheQueue(sessionId) {
  for (const id of ATTENDEES) {
    const { body } = await api.get(`/users/${id}/reservations/${sessionId}`);
    if (body.status === 'waitlisted') await api.del(`/users/${id}/reservations/${sessionId}`);
  }
}

describe('Taking a seat', () => {
  test('confirms the seat and moves the count for everybody', async () => {
    const user = 3;
    await clearAgenda(api, user);
    const session = await openSession();
    const before = (await api.json(`/sessions/${session.id}`)).seats;

    const res = await api.put(`/users/${user}/reservations/${session.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'confirmed');
    assert.equal(res.body.seatsTaken, before.seatsTaken + 1);
    assert.equal(res.body.seatsLeft, before.seatsLeft - 1);
    assert.equal(res.body.waitlistPosition, null);

    // the count is inventory, not a view of my own reservation
    const seen = (await api.json(`/sessions/${session.id}`)).seats;
    assert.equal(seen.seatsTaken, before.seatsTaken + 1);
  });

  test('twice over still only takes one seat', async () => {
    const user = 4;
    await clearAgenda(api, user);
    const session = await openSession();
    const url = `/users/${user}/reservations/${session.id}`;

    const first = await api.put(url);
    const second = await api.put(url);
    assert.equal(second.status, 200);
    assert.equal(second.body.status, 'confirmed');
    assert.equal(second.body.seatsTaken, first.body.seatsTaken);
  });

  test('and giving it back returns it to the room', async () => {
    const user = 2;
    await clearAgenda(api, user);
    const session = await openSession();
    const url = `/users/${user}/reservations/${session.id}`;
    const before = (await api.json(`/sessions/${session.id}`)).seats.seatsTaken;

    await api.put(url);
    const released = await api.del(url);
    assert.equal(released.status, 200);
    assert.equal(released.body.status, null);
    assert.equal(released.body.seatsTaken, before);
    assert.equal((await api.get(url)).body.status, null);
  });

  test('releasing something you never held changes nothing', async () => {
    const user = 6;
    await clearAgenda(api, user);
    const session = await openSession();
    const before = (await api.json(`/sessions/${session.id}`)).seats.seatsTaken;

    const res = await api.del(`/users/${user}/reservations/${session.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.seatsTaken, before);
    assert.ok(!res.body.promoted, 'no seat was freed, so nobody moves up');
  });
});

describe('Waitlists', () => {
  test('a full room offers a place in the queue and consumes no seat', async () => {
    const user = 5;
    await clearAgenda(api, user);
    const sessions = await api.json('/sessions');
    const full = sessions.find((s) => s.isFull);
    assert.ok(full, 'the seed should sell some sessions out');
    const before = (await api.json(`/sessions/${full.id}`)).seats;

    const res = await api.put(`/users/${user}/reservations/${full.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'waitlisted');
    assert.equal(res.body.waitlistPosition, before.waitlistCount + 1);
    assert.equal(res.body.waitlistCount, before.waitlistCount + 1);
    // joining a queue must not take a chair away from anyone
    assert.equal(res.body.seatsTaken, before.seatsTaken);
    assert.equal(res.body.isFull, true);
  });

  test('releasing a seat promotes whoever has waited longest', async () => {
    const [waiter, later] = [3, 5];
    await clearAgenda(api, waiter);
    await clearAgenda(api, later);

    const fixture = await promotionFixture(used);
    assert.ok(fixture, 'the seed should leave a sold-out session with a real holder');
    used.add(fixture.session.id);
    await emptyTheQueue(fixture.session.id);

    // `waiter` queues first, so the freed seat is theirs
    assert.equal((await api.put(`/users/${waiter}/reservations/${fixture.session.id}`)).body.status, 'waitlisted');
    const second = await api.put(`/users/${later}/reservations/${fixture.session.id}`);
    assert.equal(second.body.status, 'waitlisted');
    assert.equal(second.body.waitlistCount, 2);

    const released = await api.del(`/users/${fixture.holder}/reservations/${fixture.session.id}`);
    assert.equal(released.body.promoted, waiter);
    assert.equal((await api.get(`/users/${waiter}/reservations/${fixture.session.id}`)).body.status, 'confirmed');
    assert.equal((await api.get(`/users/${later}/reservations/${fixture.session.id}`)).body.status, 'waitlisted');
    // the seat moved sideways rather than appearing: the room is still full
    assert.equal(released.body.isFull, true);
  });

  test('promotion skips a waiter who has since taken a clashing seat', async () => {
    // Kenji queues first but then books something in the same slot; the queue
    // has to step over him, or he would be handed a seat he cannot sit in.
    const [clashing, next] = [3, 5];
    await clearAgenda(api, clashing);
    await clearAgenda(api, next);

    const fixture = await promotionFixture(used);
    assert.ok(fixture, 'the seed should leave a second sold-out session with a real holder');
    used.add(fixture.session.id);
    await emptyTheQueue(fixture.session.id);

    assert.equal((await api.put(`/users/${clashing}/reservations/${fixture.session.id}`)).body.status, 'waitlisted');
    // a waitlist place is not a seat, so this is allowed — and is what sets the trap
    const elsewhere = await api.put(`/users/${clashing}/reservations/${fixture.clashing.id}`);
    assert.equal(elsewhere.body.status, 'confirmed');
    assert.equal((await api.put(`/users/${next}/reservations/${fixture.session.id}`)).body.status, 'waitlisted');

    const released = await api.del(`/users/${fixture.holder}/reservations/${fixture.session.id}`);
    assert.equal(released.body.promoted, next, 'the longest waiter was busy — the seat goes to the next one');
    assert.equal((await api.get(`/users/${next}/reservations/${fixture.session.id}`)).body.status, 'confirmed');
    assert.equal((await api.get(`/users/${clashing}/reservations/${fixture.session.id}`)).body.status, 'waitlisted');
    // and nobody ends up holding two seats in the same slot
    assert.equal((await api.get(`/users/${clashing}/reservations/${fixture.clashing.id}`)).body.status, 'confirmed');
  });
});
