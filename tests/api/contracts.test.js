import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { days, keysDeep, startApi } from './harness.js';

/**
 * The API boundary.
 *
 * Two promises the whole front end leans on: the JSON is camelCase all the way
 * down, and a request that cannot be served says so with a status code and an
 * `error` string rather than a 200 full of nulls.
 */

const SNAKE = /[a-z0-9]_[a-z]/i;

let api;
let close;
let DAYS;

before(async () => {
  ({ api, close } = await startApi());
  DAYS = await days(api);
});
after(() => close());

const snakeKeys = (payload) => [...keysDeep(payload)].filter((k) => SNAKE.test(k));

describe('The boundary is camelCase', () => {
  test('nowhere in the bootstrap payload does SQLite leak through', async () => {
    const boot = await api.json('/bootstrap');

    // guard against a vacuous pass: the walk has to be reaching nested objects
    const keys = keysDeep(boot);
    assert.ok(keys.has('startDate') && keys.has('shortName') && keys.has('walkMinutes'));
    assert.deepEqual(snakeKeys(boot), []);
  });

  test('nor anywhere in the payloads a page actually renders', async () => {
    const session = (await api.json('/sessions'))[0];
    const speaker = session.speakers[0];

    for (const path of [
      '/sessions',
      `/sessions/${session.id}?userId=1`,
      '/speakers',
      `/speakers/${speaker.id}`,
      '/users',
      '/users/1',
      '/users/1/schedule',
      `/users/1/today?day=${DAYS[0]}&time=10:30`,
      '/venues',
      '/vendors',
      '/sponsors',
      '/announcements',
      `/live?day=${DAYS[0]}&time=10:30`,
    ]) {
      assert.deepEqual(snakeKeys(await api.json(path)), [], `snake_case in ${path}`);
    }
  });
});

describe('Asking for something that is not there', () => {
  test('gets a 404 and an explanation, whatever it was', async () => {
    for (const path of ['/users/99999', '/speakers/99999', '/sessions/99999']) {
      const res = await api.get(path);
      assert.equal(res.status, 404, path);
      assert.ok(res.body.error, `${path} should say what was missing`);
    }
  });

  test('including the attendee-scoped routes hanging off a missing attendee', async () => {
    for (const path of ['/users/99999/schedule', `/users/99999/today?day=${DAYS[0]}`, '/users/99999/agenda.ics']) {
      const res = await api.get(path);
      assert.equal(res.status, 404, path);
    }
    const seat = await api.put('/users/99999/reservations/1');
    assert.equal(seat.status, 404);
  });

  test('and a route that does not exist at all still answers in JSON', async () => {
    const res = await api.get('/nonsense');
    assert.equal(res.status, 404);
    assert.match(res.type, /json/);
    assert.match(res.body.error, /GET/);
  });
});

describe('Asking for something impossible', () => {
  test('a malformed body is a 400, not a 500', async () => {
    // the app's error handler prints the parse failure — that stack in the
    // output is this test working, not this test failing
    const res = await api.put('/users/1/reservations/1', '{"day":');
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('stars outside one to five are refused before anything is written', async () => {
    for (const stars of [0, 6, 3.5, -1, 'five', null, undefined]) {
      const res = await api.put('/users/1/ratings/1', { stars, day: DAYS[0], time: '23:00' });
      assert.equal(res.status, 400, `stars: ${stars}`);
      assert.match(res.body.error, /1 to 5/);
    }
  });

  test('the live strip insists on both a day and a time', async () => {
    assert.equal((await api.get('/live')).status, 400);
    assert.equal((await api.get(`/live?day=${DAYS[0]}`)).status, 400);
    assert.equal((await api.get('/live?time=10:30')).status, 400);

    const live = await api.json(`/live?day=${DAYS[0]}&time=10:30`);
    assert.equal(live.day, DAYS[0]);
    assert.equal(live.time, '10:30');
    assert.ok(Array.isArray(live.happeningNow) && Array.isArray(live.upNext));
    assert.ok(live.happeningNow.every((s) => s.startsAt <= '10:30' && s.endsAt > '10:30'));
  });

  test('a day with nothing on it is empty, not an error', async () => {
    const live = await api.json('/live?day=1999-01-01&time=10:30');
    assert.deepEqual(live.happeningNow, []);
    assert.equal(live.dayStartsAt, null);
  });
});
