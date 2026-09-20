import { db } from '../db.js';

/**
 * iCalendar output.
 *
 * Deliberately hand-rolled but to spec: CRLF line endings, 75-octet folding,
 * and escaped separators. METHOD:PUBLISH rather than REQUEST — REQUEST implies
 * an organiser sending invitations and obliges us to send REPLY/CANCEL, which
 * we are not doing.
 *
 * Note for anyone extending this: a subscribed feed is *pull*. Google refreshes
 * every 12-24h and ignores REFRESH-INTERVAL entirely, so this is a planning
 * artifact — never the channel for a same-day room change.
 */
export const escape = (v) => String(v ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

/** Fold to 75 octets, continuation lines starting with a single space. */
export function fold(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const out = [];
  let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char, 'utf8') > (out.length ? 74 : 75)) {
      out.push(current);
      current = ' ';
    }
    current += char;
  }
  out.push(current);
  return out.join('\r\n');
}

// 2026-09-11T23:40:30.123Z -> 20260911T234030Z
const stamp = (iso) => `${iso.replace(/[-:]/g, '').slice(0, 15)}Z`;

/** Local venue time, emitted as floating local time so it lands as written. */
const local = (day, hhmm) => `${day.replace(/-/g, '')}T${hhmm.replace(':', '')}00`;

function event(s) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:orbit-session-${s.id}@orbitconf.dev`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${local(s.day, s.starts_at)}`,
    `DTEND:${local(s.day, s.ends_at)}`,
    `SUMMARY:${escape(s.title)}`,
    `LOCATION:${escape(`${s.room_name}, ${s.venue_name}`)}`,
    `DESCRIPTION:${escape(`${s.track_name} · ${s.format}\n\n${s.abstract}`)}`,
    `URL:http://localhost:5173/sessions/${s.id}`,
    'END:VEVENT',
  ];
  return lines.map(fold).join('\r\n');
}

const SELECT = `
  SELECT s.id, s.title, s.abstract, s.day, s.starts_at, s.ends_at, s.format,
         t.name AS track_name, r.name AS room_name, v.name AS venue_name
  FROM sessions s
  JOIN tracks t ON t.id = s.track_id
  JOIN rooms  r ON r.id = s.room_id
  JOIN venues v ON v.id = r.venue_id`;

function wrap(name, events) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ORBIT 26//Conference App//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${escape(name)}`),
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function sessionCalendar(sessionId) {
  const s = db.prepare(`${SELECT} WHERE s.id = ?`).get(sessionId);
  if (!s) return null;
  return wrap(`ORBIT ’26 — ${s.title}`, [event(s)]);
}

export function agendaCalendar(userId) {
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const rows = db.prepare(`${SELECT}
    JOIN reservations res ON res.session_id = s.id AND res.user_id = ? AND res.status = 'confirmed'
    ORDER BY s.day, s.starts_at`).all(userId);
  return wrap(`ORBIT ’26 — ${user.name}`, rows.map(event));
}
