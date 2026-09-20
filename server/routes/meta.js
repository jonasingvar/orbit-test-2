import { Router } from 'express';
import { db } from '../db.js';
import { SESSION_SELECT, hydrateSessions, toVenue, toRoom, toSponsor, toVendor, toAnnouncement, toUser, toTrack, toTravel } from '../lib/query.js';

export const metaRouter = Router();

const allVenues = db.prepare('SELECT * FROM venues ORDER BY is_primary DESC, name');
const allTravel = db.prepare('SELECT * FROM venue_travel');
const allTracks = db.prepare('SELECT * FROM tracks ORDER BY name');
const allTags = db.prepare('SELECT * FROM tags ORDER BY kind, name');
const allRooms = db.prepare('SELECT * FROM rooms ORDER BY venue_id, level_order, name');
const allUsers = db.prepare('SELECT * FROM users ORDER BY id');
const confirmedSeats = db.prepare("SELECT COUNT(*) n FROM reservations WHERE user_id = ? AND status = 'confirmed'");
const dayCounts = db.prepare('SELECT day, COUNT(*) n FROM sessions GROUP BY day ORDER BY day');
const allCuisines = db.prepare('SELECT DISTINCT cuisine FROM vendors ORDER BY cuisine');
const formatCounts = db.prepare('SELECT format, COUNT(*) n FROM sessions GROUP BY format ORDER BY n DESC');
const levelCounts = db.prepare('SELECT level, COUNT(*) n FROM sessions GROUP BY level');

const venuesByRank = db.prepare('SELECT * FROM venues ORDER BY is_primary DESC');
const roomsInVenue = db.prepare('SELECT * FROM rooms WHERE venue_id = ? ORDER BY level_order, name');
const vendorsInVenue = db.prepare('SELECT COUNT(*) n FROM vendors WHERE venue_id = ?');
const sessionsInVenue = db.prepare(
  'SELECT COUNT(*) n FROM sessions s JOIN rooms r ON r.id = s.room_id WHERE r.venue_id = ?');

const sponsorsByTier = db.prepare(`SELECT * FROM sponsors ORDER BY
  CASE tier WHEN 'Diamond' THEN 0 WHEN 'Platinum' THEN 1 WHEN 'Gold' THEN 2 WHEN 'Silver' THEN 3 ELSE 4 END, name`);
const allAnnouncements = db.prepare('SELECT * FROM announcements ORDER BY pinned DESC, posted_at DESC');

const runningAt = db.prepare(`${SESSION_SELECT}
  WHERE s.day = ? AND s.starts_at <= ? AND s.ends_at > ?
  ORDER BY s.is_keynote DESC, s.capacity DESC`);
const nextSlotAfter = db.prepare('SELECT MIN(starts_at) t FROM sessions WHERE day = ? AND starts_at > ?');
const startingAt = db.prepare(`${SESSION_SELECT}
  WHERE s.day = ? AND s.starts_at = ?
  ORDER BY s.is_keynote DESC, s.avg_rating DESC`);
const dayBounds = db.prepare('SELECT MIN(starts_at) first, MAX(ends_at) last FROM sessions WHERE day = ?');

/** Everything the app shell needs, in one request. */
metaRouter.get('/bootstrap', (req, res) => {
  const venues = allVenues.all().map(toVenue);
  const travel = allTravel.all().map(toTravel);
  const tracks = allTracks.all().map(toTrack);
  const tags = allTags.all();
  const rooms = allRooms.all().map(toRoom);
  const users = allUsers.all()
    .map((u) => toUser(u, { reservedCount: confirmedSeats.get(u.id).n }));
  const days = dayCounts.all()
    .map((d, i) => ({
      date: d.day,
      label: `Day ${i + 1}`,
      weekday: new Date(`${d.day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
      sessionCount: d.n,
    }));
  const cuisines = allCuisines.all().map((c) => c.cuisine);
  const formats = formatCounts.all().map((f) => ({ name: f.format, count: f.n }));
  const levels = levelCounts.all().map((l) => ({ name: l.level, count: l.n }));

  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  const fmt = (iso, opts) => new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
  const sameMonth = first && last && first.slice(0, 7) === last.slice(0, 7);
  const dateRange = first && last
    ? sameMonth
      ? `${fmt(first, { month: 'long', day: 'numeric' })}–${fmt(last, { day: 'numeric' })}, ${first.slice(0, 4)}`
      : `${fmt(first, { month: 'long', day: 'numeric' })} – ${fmt(last, { month: 'long', day: 'numeric' })}, ${first.slice(0, 4)}`
    : '';

  res.json({
    conference: {
      name: 'ORBIT',
      edition: `’${first ? first.slice(2, 4) : '26'}`,
      tagline: 'The Applied AI Conference',
      city: 'Las Vegas, NV',
      dates: dateRange,
      startDate: first,
    },
    venues, travel, tracks, tags, rooms, users, days, formats, levels, cuisines,
  });
});

metaRouter.get('/venues', (req, res) => {
  res.json(venuesByRank.all().map(toVenue).map((v) => ({
    ...v,
    rooms: roomsInVenue.all(v.id).map(toRoom),
    vendorCount: vendorsInVenue.get(v.id).n,
    sessionCount: sessionsInVenue.get(v.id).n,
  })));
});

metaRouter.get('/vendors', (req, res) => {
  const { venueId, cuisine, dietary, q } = req.query;
  let sql = 'SELECT * FROM vendors WHERE 1=1';
  const args = [];
  if (venueId) { sql += ' AND venue_id = ?'; args.push(venueId); }
  if (cuisine) { sql += ' AND cuisine = ?'; args.push(cuisine); }
  if (dietary) { sql += ' AND dietary LIKE ?'; args.push(`%${dietary}%`); }
  if (q) { sql += ' AND (name LIKE ? OR description LIKE ? OR cuisine LIKE ?)'; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY rating DESC, name';
  res.json(db.prepare(sql).all(...args).map(toVendor));
});

metaRouter.get('/sponsors', (req, res) => {
  res.json(sponsorsByTier.all().map(toSponsor));
});

metaRouter.get('/announcements', (req, res) => {
  res.json(allAnnouncements.all().map(toAnnouncement));
});

/**
 * GET /api/live?day=YYYY-MM-DD&time=HH:MM
 * What is running right now, and what starts next. Drives the live strip.
 */
metaRouter.get('/live', (req, res) => {
  const { day, time } = req.query;
  if (!day || !time) return res.status(400).json({ error: 'day and time are required' });

  const running = runningAt.all(day, time, time);
  const nextSlot = nextSlotAfter.get(day, time)?.t;
  const upcoming = nextSlot ? startingAt.all(day, nextSlot) : [];

  // The day's own bounds, so the client can tell "not started yet" from
  // "between slots" from "that's a wrap" instead of guessing from array lengths.
  const bounds = dayBounds.get(day);

  res.json({
    day,
    time,
    dayStartsAt: bounds?.first ?? null,
    dayEndsAt: bounds?.last ?? null,
    nextSlot: nextSlot ?? null,
    happeningNow: hydrateSessions(running),
    upNext: hydrateSessions(upcoming),
  });
});
