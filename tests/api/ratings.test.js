import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { days, shiftTime, startApi } from './harness.js';

/**
 * Rating.
 *
 * The last link in the attendee chain, and the one with the most to prove:
 * you may only rate a session you checked in to, only once it is over, and
 * only once — though you may change your mind. Whatever you say rolls straight
 * up onto the session and onto the people who gave it.
 *
 * Everything here happens on day 2, which the seed leaves unrated — ratings
 * only exist for sessions that have actually finished, and on day 1 that means
 * the morning's.
 */

const ME = 4;

let api;
let close;
let spare;

before(async () => {
  ({ api, close } = await startApi());
  const DAYS = await days(api);
  spare = (await api.json('/sessions')).filter((s) => s.day === DAYS[1] && s.startsAt >= '10:00');
});
after(() => close());

/** A session nothing else in this file has touched. */
function nextSession() {
  assert.ok(spare.length, 'ran out of untouched sessions');
  return spare.shift();
}

/** The same, but given by people nobody has rated yet — so the roll-up is legible. */
async function nextUnratedSpeakers() {
  for (const [i, session] of spare.entries()) {
    if (!session.speakers.length) continue;
    const speakers = await Promise.all(session.speakers.map((sp) => api.json(`/speakers/${sp.id}`)));
    if (speakers.every((sp) => sp.avgRating === 0)) return spare.splice(i, 1)[0];
  }
  assert.fail('the seed should leave plenty of speakers nobody has rated yet');
}

const checkIn = (session, time) =>
  api.put(`/users/${ME}/checkins/${session.id}`, { day: session.day, time });

const rate = (session, body) =>
  api.put(`/users/${ME}/ratings/${session.id}`, {
    day: session.day, time: shiftTime(session.endsAt, 30), ...body,
  });

/** Sit through a session, so there is something to have an opinion about. */
async function attend(session) {
  assert.equal((await checkIn(session, shiftTime(session.startsAt, 5))).status, 200);
  return session;
}

describe('Rating a session', () => {
  test('is refused if you were never there', async () => {
    const session = nextSession();
    const res = await rate(session, { stars: 5, comment: 'Sounded good from the corridor.' });

    assert.equal(res.status, 409);
    assert.equal(res.body.rejected, 'not-checked-in');
    assert.equal(res.body.myRating, null);
    assert.equal((await api.json(`/sessions/${session.id}`)).ratingCount, 0);
  });

  test('is refused while it is still running — you have not seen the end yet', async () => {
    const session = await attend(nextSession());
    const res = await api.put(`/users/${ME}/ratings/${session.id}`, {
      stars: 4, day: session.day, time: shiftTime(session.startsAt, 10),
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.rejected, 'too-early');
    assert.equal(res.body.checkedIn, true);
    assert.equal(res.body.myRating, null);
  });

  test('is accepted once it is over and you were in the room', async () => {
    const session = await attend(nextSession());
    const res = await rate(session, { stars: 4, comment: 'Dense slides, excellent delivery.' });

    assert.equal(res.status, 200);
    assert.equal(res.body.canRate, true);
    assert.deepEqual(res.body.myRating, { stars: 4, comment: 'Dense slides, excellent delivery.' });
  });

  test('can be changed afterwards, comment and all', async () => {
    const session = await attend(nextSession());
    await rate(session, { stars: 5, comment: 'Best thing I have seen all week.' });

    const revised = await rate(session, { stars: 2, comment: '' });
    assert.equal(revised.status, 200);
    assert.deepEqual(revised.body.myRating, { stars: 2, comment: null }, 'a cleared comment is cleared');
    assert.equal((await api.json(`/sessions/${session.id}`)).ratingCount, 1, 'an edit is not a second opinion');
  });

  test('surfaces the comment as an attributed review on the session', async () => {
    const session = await attend(nextSession());
    const comment = 'Finally, someone showing the failure cases.';
    await rate(session, { stars: 5, comment });

    const mine = (await api.json(`/sessions/${session.id}`)).reviews.find((r) => r.comment === comment);
    assert.ok(mine, 'a comment should surface as a review');
    assert.equal(mine.stars, 5);
    assert.ok(mine.author.name, 'a review is attributed');
  });
});

describe('A rating rolls up', () => {
  test('onto the session it was left on, immediately', async () => {
    const session = await attend(nextSession());

    await rate(session, { stars: 5 });
    const rated = await api.json(`/sessions/${session.id}`);
    assert.equal(rated.ratingCount, 1);
    assert.equal(rated.avgRating, 5);

    await rate(session, { stars: 3 });
    const revised = await api.json(`/sessions/${session.id}`);
    assert.equal(revised.ratingCount, 1);
    assert.equal(revised.avgRating, 3, 'changing your mind moves the average');
  });

  test('onto the speakers who gave it', async () => {
    const session = await nextUnratedSpeakers();

    await attend(session);
    await rate(session, { stars: 5, comment: 'Took four pages of notes.' });

    for (const sp of session.speakers) {
      const speaker = await api.json(`/speakers/${sp.id}`);
      assert.equal(speaker.avgRating, 5, 'a speaker carries what their talks earned');
    }
  });
});
