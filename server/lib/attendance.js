import { db } from '../db.js';
import { toMinutes } from './query.js';

/**
 * Turning up, and saying what you thought.
 *
 * Three rules, all of them borrowed from how real conferences run this:
 *  - Check-in opens shortly before a session starts and closes when it ends.
 *    You cannot check in to something that has not happened.
 *  - You can only rate a session you checked in to. Otherwise ratings are just
 *    opinions about titles.
 *  - One rating per person, editable — people change their minds.
 */
export const CHECK_IN_OPENS_MINS = 15;

const getSession = db.prepare('SELECT id, day, starts_at, ends_at FROM sessions WHERE id = ?');
const getCheckIn = db.prepare('SELECT checked_in_at FROM check_ins WHERE user_id = ? AND session_id = ?');
const getRating = db.prepare('SELECT stars, comment FROM ratings WHERE user_id = ? AND session_id = ?');

/** Where a session sits relative to a given moment. */
export function attendanceWindow(session, now) {
  if (!now?.day || !now?.time) return { phase: 'unknown', canCheckIn: false };
  if (session.day !== now.day) {
    return { phase: session.day < now.day ? 'past' : 'future', canCheckIn: false };
  }
  const at = toMinutes(now.time);
  const opens = toMinutes(session.starts_at) - CHECK_IN_OPENS_MINS;
  const closes = toMinutes(session.ends_at);

  if (at < opens) return { phase: 'future', canCheckIn: false, opensAt: session.starts_at };
  if (at >= closes) return { phase: 'past', canCheckIn: false };
  return { phase: at < toMinutes(session.starts_at) ? 'opening' : 'running', canCheckIn: true };
}

/** Everything the UI needs to decide what to offer for one session. */
export function attendanceState(sessionId, userId, now) {
  const session = getSession.get(sessionId);
  if (!session) return null;

  const window = attendanceWindow(session, now);
  const checkIn = userId ? getCheckIn.get(userId, sessionId) : null;
  const rating = userId ? getRating.get(userId, sessionId) : null;

  return {
    sessionId: session.id,
    phase: window.phase,
    checkInOpensAt: window.opensAt ?? null,
    canCheckIn: window.canCheckIn && !checkIn,
    checkedIn: Boolean(checkIn),
    checkedInAt: checkIn?.checked_in_at ?? null,
    // you can rate once the session is over and you were there
    canRate: Boolean(checkIn) && window.phase === 'past',
    myRating: rating ? { stars: rating.stars, comment: rating.comment } : null,
  };
}

export const checkIn = db.transaction((userId, sessionId, now) => {
  const session = getSession.get(sessionId);
  if (!session) return null;
  const window = attendanceWindow(session, now);
  if (!window.canCheckIn) return { ...attendanceState(sessionId, userId, now), rejected: window.phase };

  db.prepare('INSERT OR IGNORE INTO check_ins (user_id, session_id, checked_in_at) VALUES (?, ?, ?)')
    .run(userId, sessionId, new Date().toISOString());
  return attendanceState(sessionId, userId, now);
});

/** Ratings roll up onto the session so listings stay cheap to read. */
const recompute = db.prepare(`
  UPDATE sessions SET
    avg_rating   = COALESCE((SELECT ROUND(AVG(stars), 2) FROM ratings WHERE session_id = ?), 0),
    rating_count = (SELECT COUNT(*) FROM ratings WHERE session_id = ?)
  WHERE id = ?`);

/** A speaker's rating is the average of the ratings their sessions earned. */
const recomputeSpeakers = db.prepare(`
  UPDATE speakers SET avg_rating = COALESCE((
    SELECT ROUND(AVG(r.stars), 2) FROM ratings r
    JOIN session_speakers ss ON ss.session_id = r.session_id
    WHERE ss.speaker_id = speakers.id), 0)
  WHERE id IN (SELECT speaker_id FROM session_speakers WHERE session_id = ?)`);

export const rateSession = db.transaction((userId, sessionId, { stars, comment }, now) => {
  const state = attendanceState(sessionId, userId, now);
  if (!state) return null;
  if (!state.checkedIn) return { ...state, rejected: 'not-checked-in' };
  if (state.phase !== 'past') return { ...state, rejected: 'too-early' };

  db.prepare(`
    INSERT INTO ratings (user_id, session_id, stars, comment, created_at)
    VALUES (@userId, @sessionId, @stars, @comment, @at)
    ON CONFLICT(user_id, session_id)
    DO UPDATE SET stars = @stars, comment = @comment, created_at = @at
  `).run({ userId, sessionId, stars, comment: comment || null, at: new Date().toISOString() });

  recompute.run(sessionId, sessionId, sessionId);
  recomputeSpeakers.run(sessionId);
  return attendanceState(sessionId, userId, now);
});
