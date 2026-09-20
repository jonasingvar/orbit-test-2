import './sandbox-db.js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { toMinutes, toSession, toSpeaker, toUser, toVenue } from '../../server/lib/query.js';

/** Every key in the tree, so the camelCase boundary can be checked in one go. */
function keysDeep(value, out = []) {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    value.forEach((v) => keysDeep(v, out));
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    out.push(k);
    keysDeep(v, out);
  }
  return out;
}

const sessionRow = {
  id: 7, title: 'Agents in anger', subtitle: null, abstract: 'What broke.',
  takeaways: 'Budget for evals|Ship the boring thing', prerequisites: null,
  day: '2026-10-13', starts_at: '14:30', ends_at: '15:15', duration_mins: 45,
  format: 'Talk', level: 'Intermediate', language: 'English',
  capacity: 200, seats_taken: 120, waitlist_count: 3,
  is_keynote: 0, is_recorded: 1, requires_rsvp: 0, livestream: 1,
  recording_url: null, slides_url: null, repo_url: null,
  avg_rating: 4.5, rating_count: 12,
  track_id: 2, track_name: 'Platform', track_slug: 'platform', track_color: 'violet',
  room_id: 5, room_name: 'Orbit Hall', building: 'North', floor: 2, walk_minutes: 6,
  room_capacity: 200, room_kind: 'Theatre', room_accessible: 1, room_amenities: 'Wi-Fi,Power,',
  venue_id: 1, venue_name: 'Aurora Convention Center', venue_short: 'Aurora',
  venue_accent: 'cyan', venue_emoji: '🛰', venue_is_primary: 1,
};

describe('Clock strings become minutes', () => {
  test('a time is the number of minutes since midnight', () => {
    assert.equal(toMinutes('00:00'), 0);
    assert.equal(toMinutes('09:00'), 540);
    assert.equal(toMinutes('14:30'), 870);
    assert.equal(toMinutes('23:59'), 1439);
  });

  test('seconds on the end are ignored, not misread', () => {
    assert.equal(toMinutes('14:30:00'), 870);
  });

  test('ordering by minutes matches ordering by clock string', () => {
    const times = ['14:30', '09:00', '23:59', '08:45'];
    assert.deepEqual(
      [...times].sort((a, b) => toMinutes(a) - toMinutes(b)),
      [...times].sort(),
    );
  });
});

describe('A session row becomes the shape React expects', () => {
  test('nothing snake_case survives the mapper, at any depth', () => {
    const keys = keysDeep(toSession(sessionRow, { speakers: [], tags: [] }));
    assert.deepEqual(keys.filter((k) => k.includes('_')), []);
  });

  test('seat maths is derived, so a listing never has to do it', () => {
    const s = toSession(sessionRow);
    assert.equal(s.seatsLeft, 80);
    assert.equal(s.fillRate, 0.6);
    assert.equal(s.isFull, false);
  });

  test('a full room reports zero seats left and a full room, not a negative number', () => {
    const s = toSession({ ...sessionRow, seats_taken: 205 });
    assert.equal(s.seatsLeft, 0);
    assert.equal(s.fillRate, 1);
    assert.equal(s.isFull, true);
  });

  test('a session at exactly capacity is full', () => {
    assert.equal(toSession({ ...sessionRow, seats_taken: 200 }).isFull, true);
    assert.equal(toSession({ ...sessionRow, seats_taken: 199 }).isFull, false);
  });

  test('a room with no capacity gives a fill rate of zero rather than NaN', () => {
    assert.equal(toSession({ ...sessionRow, capacity: 0, seats_taken: 0 }).fillRate, 0);
  });

  test('pipe- and comma-delimited columns become lists, with no empty strings', () => {
    const s = toSession(sessionRow);
    assert.deepEqual(s.takeaways, ['Budget for evals', 'Ship the boring thing']);
    assert.deepEqual(s.room.amenities, ['Wi-Fi', 'Power']);
  });

  test('an empty delimited column becomes an empty list, not a list with one empty string', () => {
    const s = toSession({ ...sessionRow, takeaways: '', room_amenities: '' });
    assert.deepEqual(s.takeaways, []);
    assert.deepEqual(s.room.amenities, []);
  });

  test('SQLite 0/1 flags come out as real booleans', () => {
    const s = toSession(sessionRow);
    assert.equal(s.isKeynote, false);
    assert.equal(s.isRecorded, true);
    assert.equal(s.room.accessible, true);
    assert.equal(s.venue.isPrimary, true);
  });

  test('a session nobody is waiting for reports a waitlist of zero, not undefined', () => {
    const { waitlist_count, ...noCount } = sessionRow;
    assert.equal(toSession(noCount).waitlistCount, 0);
    assert.equal(toSession(sessionRow).waitlistCount, 3);
  });

  test('extras are merged in on top, which is how speakers and tags arrive', () => {
    const s = toSession(sessionRow, { speakers: [{ id: 1 }], tags: [{ slug: 'evals' }] });
    assert.equal(s.speakers.length, 1);
    assert.equal(s.tags[0].slug, 'evals');
  });
});

describe('The other mappers hold the same boundary', () => {
  test('a speaker with no expertise gets an empty list, not a list of nothing', () => {
    const row = { id: 1, name: 'Amara Osei', job_title: 'Principal', years_exp: 12, expertise: '', languages: '' };
    const sp = toSpeaker(row);
    assert.deepEqual(sp.expertise, []);
    assert.deepEqual(sp.languages, []);
    assert.equal(sp.jobTitle, 'Principal');
    assert.equal(sp.yearsExperience, 12);
    assert.deepEqual(keysDeep(sp).filter((k) => k.includes('_')), []);
  });

  test('an attendee linked to a speakers row is flagged as a speaker', () => {
    assert.equal(toUser({ id: 2, name: 'Amara', speaker_id: 9 }).isSpeaker, true);
    assert.equal(toUser({ id: 2, name: 'Amara', speaker_id: 9 }).speakerId, 9);
  });

  test('an attendee with no speakers row gets a null id, never undefined', () => {
    const u = toUser({ id: 3, name: 'Kenji' });
    assert.equal(u.isSpeaker, false);
    assert.equal(u.speakerId, null);
  });

  test('interests survive the round trip as a clean list', () => {
    assert.deepEqual(toUser({ interests: 'Agent Design,Evaluation,' }).interests, ['Agent Design', 'Evaluation']);
    assert.deepEqual(toUser({ interests: '' }).interests, []);
  });

  test('a venue keeps its real coordinates and opening hours', () => {
    const v = toVenue({ id: 1, name: 'Aurora', short_name: 'Aurora', lat: 39.74, lng: -104.99, is_primary: 1, opens_at: '07:30', closes_at: '22:30' });
    assert.equal(v.shortName, 'Aurora');
    assert.equal(v.isPrimary, true);
    assert.deepEqual([v.lat, v.lng], [39.74, -104.99]);
    assert.deepEqual([v.opensAt, v.closesAt], ['07:30', '22:30']);
  });
});
