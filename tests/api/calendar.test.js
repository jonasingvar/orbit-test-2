import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearAgenda, overlaps, startApi } from './harness.js';

/**
 * Export.
 *
 * The end of the attendee chain: a plan that only exists inside this app is not
 * a plan. iCalendar is unforgiving about its separators — an unescaped comma in
 * a talk title silently truncates the entry in Google Calendar — so these tests
 * read the bytes rather than trusting the 200.
 */

let api;
let close;
let sessions;

before(async () => {
  ({ api, close } = await startApi());
  sessions = await api.json('/sessions');
});
after(() => close());

/** Undo the 75-octet line folding, so each property is one string again. */
const unfold = (ics) => ics.replace(/\r\n /g, '');

const events = (ics) => unfold(ics).split('BEGIN:VEVENT').slice(1);

/** The value side of a property line, e.g. `SUMMARY` → the title. */
const valueOf = (block, name) => block.match(new RegExp(`^${name}:(.*)$`, 'm'))?.[1]?.trimEnd();

describe('One session as a calendar entry', () => {
  test('is a calendar a client will actually accept', async () => {
    const session = sessions[0];
    const res = await api.get(`/sessions/${session.id}.ics`);

    assert.equal(res.status, 200);
    assert.match(res.type, /text\/calendar/);
    assert.match(res.text, /^BEGIN:VCALENDAR\r\n/);
    assert.match(res.text, /END:VCALENDAR\r\n$/);
    assert.equal(events(res.text).length, 1, 'one session, one VEVENT');
    // CRLF throughout: the only \n left should be escaped ones inside values
    assert.equal(res.text.split('\r\n').join('').includes('\n'), false);
  });

  test('starts before it ends, at the time the programme says', async () => {
    const session = sessions.find((s) => s.startsAt !== s.endsAt);
    const [block] = events((await api.get(`/sessions/${session.id}.ics`)).text);

    const start = valueOf(block, 'DTSTART');
    const end = valueOf(block, 'DTEND');
    assert.equal(start, `${session.day.replace(/-/g, '')}T${session.startsAt.replace(':', '')}00`);
    assert.equal(end, `${session.day.replace(/-/g, '')}T${session.endsAt.replace(':', '')}00`);
    assert.ok(start < end, `${start} should come before ${end}`);
  });

  test('escapes the separators that would otherwise truncate it', async () => {
    const withComma = sessions.find((s) => s.title.includes(','));
    assert.ok(withComma, 'the seed should produce at least one title with a comma in it');
    const [block] = events((await api.get(`/sessions/${withComma.id}.ics`)).text);

    assert.equal(valueOf(block, 'SUMMARY'), withComma.title.replace(/,/g, '\\,'));
    // LOCATION is always "Room, Venue", so the comma is there whatever the data
    assert.equal(valueOf(block, 'LOCATION'), `${withComma.room.name}\\, ${withComma.venue.name}`);

    for (const line of block.split('\r\n').filter((l) => l.includes(':'))) {
      const value = line.slice(line.indexOf(':') + 1);
      assert.doesNotMatch(value, /(?<!\\)[,;]/, `unescaped separator in ${line}`);
    }
  });

  test('escapes semicolons and newlines in the long fields too', async () => {
    const withSemicolon = sessions.find((s) => s.abstract.includes(';'));
    assert.ok(withSemicolon, 'the seed should produce at least one abstract with a semicolon');
    const [block] = events((await api.get(`/sessions/${withSemicolon.id}.ics`)).text);

    const description = valueOf(block, 'DESCRIPTION');
    assert.ok(description.includes('\\;'));
    assert.ok(description.includes('\\n'), 'the blank line before the abstract survives as \\n');
  });

  test('does not exist for a session that does not', async () => {
    const res = await api.get('/sessions/99999.ics');
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });
});

describe('A whole agenda as a subscription', () => {
  test('carries one event per seat held, and nothing you are only queued for', async () => {
    const user = 2;
    await clearAgenda(api, user);

    // three seats that do not clash with each other — the API would refuse them
    const confirmed = [];
    for (const s of sessions.filter((x) => !x.isFull && x.seatsLeft > 2)) {
      if (confirmed.length === 3) break;
      if (!confirmed.some((held) => overlaps(held, s))) confirmed.push(s);
    }
    for (const s of confirmed) {
      assert.equal((await api.put(`/users/${user}/reservations/${s.id}`)).body.status, 'confirmed');
    }
    const queued = sessions.find((s) => s.isFull && !confirmed.some((held) => overlaps(held, s)));
    assert.equal((await api.put(`/users/${user}/reservations/${queued.id}`)).body.status, 'waitlisted');

    const ics = (await api.get(`/users/${user}/agenda.ics`)).text;
    const uids = events(ics).map((b) => valueOf(b, 'UID'));

    assert.equal(uids.length, confirmed.length);
    for (const s of confirmed) assert.ok(uids.includes(`orbit-session-${s.id}@orbitconf.dev`));
    assert.equal(uids.includes(`orbit-session-${queued.id}@orbitconf.dev`), false,
      'a place in a queue is not a diary entry');
  });

  test('is named after the attendee and offered as a download', async () => {
    const user = await api.json('/users/3');
    const res = await api.get('/users/3/agenda.ics');

    assert.equal(res.status, 200);
    assert.match(unfold(res.text), new RegExp(`X-WR-CALNAME:.*${user.name.split(' ')[0]}`));
  });

  test('is empty rather than broken for an attendee with no seats', async () => {
    await clearAgenda(api, 5);
    const res = await api.get('/users/5/agenda.ics');

    assert.equal(res.status, 200);
    assert.equal(events(res.text).length, 0);
    assert.match(res.text, /^BEGIN:VCALENDAR\r\n/);
  });

  test('does not exist for an attendee who does not', async () => {
    assert.equal((await api.get('/users/99999/agenda.ics')).status, 404);
  });
});
