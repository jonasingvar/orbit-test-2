import { db } from '../db.js';
import { toMinutes } from './query.js';

/**
 * Seat inventory.
 *
 * `sessions.seats_taken` is the live count — it moves when someone reserves or
 * releases. Everything here runs inside a transaction because a reservation
 * touches two tables and must not half-apply.
 *
 * When a session is full, reservations are accepted as `waitlisted` and do not
 * consume a seat. Releasing a confirmed seat promotes the longest-waiting
 * person automatically.
 */

const getSession = db.prepare(`
  SELECT s.id, s.capacity, s.seats_taken, s.day, s.starts_at, s.ends_at, s.title,
         rm.name AS room_name, v.short_name AS venue_name
  FROM sessions s
  JOIN rooms rm ON rm.id = s.room_id
  JOIN venues v ON v.id = rm.venue_id
  WHERE s.id = ?`);
const getReservation = db.prepare('SELECT status, created_at FROM reservations WHERE user_id = ? AND session_id = ?');
const insertReservation = db.prepare(
  'INSERT INTO reservations (user_id, session_id, status, created_at) VALUES (?, ?, ?, ?)');
const deleteReservation = db.prepare('DELETE FROM reservations WHERE user_id = ? AND session_id = ?');
const bumpSeats = db.prepare('UPDATE sessions SET seats_taken = MAX(0, seats_taken + ?) WHERE id = ?');
const waitingInOrder = db.prepare(`
  SELECT user_id FROM reservations
  WHERE session_id = ? AND status = 'waitlisted'
  ORDER BY created_at, user_id`);
const promote = db.prepare("UPDATE reservations SET status = 'confirmed' WHERE user_id = ? AND session_id = ?");
const countWaiting = db.prepare("SELECT COUNT(*) n FROM reservations WHERE session_id = ? AND status = 'waitlisted'");
const waitlistAhead = db.prepare(`
  SELECT COUNT(*) n FROM reservations
  WHERE session_id = ? AND status = 'waitlisted' AND created_at < ?`);

/** Current seat state for one session, from one attendee's point of view. */
export function seatState(sessionId, userId) {
  const s = getSession.get(sessionId);
  if (!s) return null;
  const mine = userId ? getReservation.get(userId, sessionId) : null;

  return {
    sessionId: s.id,
    capacity: s.capacity,
    seatsTaken: s.seats_taken,
    seatsLeft: Math.max(0, s.capacity - s.seats_taken),
    isFull: s.seats_taken >= s.capacity,
    waitlistCount: countWaiting.get(sessionId).n,
    status: mine?.status ?? null,
    waitlistPosition: mine?.status === 'waitlisted'
      ? waitlistAhead.get(sessionId, mine.created_at).n + 1
      : null,
  };
}

/**
 * You cannot hold two seats at the same time. This is the one invariant every
 * real reservation system enforces — AWS re:Invent and Google I/O both block
 * it outright rather than warning — because a seat you cannot physically use
 * is a seat somebody else wanted.
 */
const overlapping = db.prepare(`
  SELECT s.id, s.title, s.starts_at, s.ends_at, s.day, r.status,
         rm.name AS room_name, v.short_name AS venue_name
  FROM reservations r
  JOIN sessions s ON s.id = r.session_id
  JOIN rooms rm ON rm.id = s.room_id
  JOIN venues v ON v.id = rm.venue_id
  WHERE r.user_id = ?
    AND r.status = 'confirmed'
    AND s.id != ?
    AND s.day = ?
    AND s.starts_at < ?
    AND ? < s.ends_at
  LIMIT 1`);

export const reserveSeat = db.transaction((userId, sessionId, now) => {
  const s = getSession.get(sessionId);
  if (!s) return null;
  if (getReservation.get(userId, sessionId)) return seatState(sessionId, userId); // already holding one

  // You cannot take a seat in something that has already finished. Without this
  // the app will happily sell you a chair in a talk that ended three days ago.
  if (now?.day && now?.time) {
    const over = s.day < now.day || (s.day === now.day && toMinutes(s.ends_at) <= toMinutes(now.time));
    if (over) return { ...seatState(sessionId, userId), rejected: 'ended' };
  }

  const clash = overlapping.get(userId, sessionId, s.day, s.ends_at, s.starts_at);
  if (clash) {
    return {
      ...seatState(sessionId, userId),
      rejected: 'overlap',
      // Both sides, so the client can present an actual choice rather than an error.
      wanted: {
        id: s.id, title: s.title, startsAt: s.starts_at, endsAt: s.ends_at,
        roomName: s.room_name, venueName: s.venue_name,
      },
      conflictsWith: {
        id: clash.id, title: clash.title, startsAt: clash.starts_at, endsAt: clash.ends_at,
        roomName: clash.room_name, venueName: clash.venue_name,
      },
    };
  }

  const full = s.seats_taken >= s.capacity;
  insertReservation.run(userId, sessionId, full ? 'waitlisted' : 'confirmed', new Date().toISOString());
  if (!full) bumpSeats.run(1, sessionId);

  return seatState(sessionId, userId);
});

export const releaseSeat = db.transaction((userId, sessionId) => {
  const mine = getReservation.get(userId, sessionId);
  if (!mine) return seatState(sessionId, userId);

  deleteReservation.run(userId, sessionId);

  let promoted = null;
  if (mine.status === 'confirmed') {
    bumpSeats.run(-1, sessionId);
    // hand the freed seat to whoever has been waiting longest — skipping anyone
    // who has since taken a seat in the same slot, or they would hold two
    const s = getSession.get(sessionId);
    const next = waitingInOrder.all(sessionId)
      .find((w) => !overlapping.get(w.user_id, sessionId, s.day, s.ends_at, s.starts_at));
    if (next) {
      promote.run(next.user_id, sessionId);
      bumpSeats.run(1, sessionId);
      promoted = next.user_id;
    }
  }

  return { ...seatState(sessionId, userId), promoted };
});
