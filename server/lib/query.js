import { db } from '../db.js';

/**
 * Shared SQL fragments + row shaping.
 *
 * Convention: every route returns camelCase JSON. SQLite gives us snake_case,
 * so each `toX()` function here is the single place that translation happens.
 * If you add a column, add it here too — the React side never sees snake_case.
 */

export const SESSION_SELECT = `
  SELECT
    s.*,
    t.name  AS track_name,  t.slug  AS track_slug,  t.color AS track_color,
    r.name  AS room_name,   r.building, r.floor, r.walk_minutes, r.capacity AS room_capacity,
    r.kind  AS room_kind,   r.accessible AS room_accessible, r.amenities AS room_amenities,
    v.id    AS venue_id,    v.name AS venue_name, v.short_name AS venue_short,
    v.accent AS venue_accent, v.emoji AS venue_emoji, v.is_primary AS venue_is_primary,
    (SELECT COUNT(*) FROM reservations r
      WHERE r.session_id = s.id AND r.status = 'waitlisted') AS waitlist_count
  FROM sessions s
  JOIN tracks t ON t.id = s.track_id
  JOIN rooms  r ON r.id = s.room_id
  JOIN venues v ON v.id = r.venue_id
`;

const speakersForSessions = (ids) => {
  if (!ids.length) return new Map();
  const rows = db.prepare(`
    SELECT ss.session_id, ss.role, sp.id, sp.name, sp.pronouns, sp.job_title, sp.company,
           sp.initials, sp.accent, sp.image_url, sp.city, sp.country, sp.featured
    FROM session_speakers ss
    JOIN speakers sp ON sp.id = ss.speaker_id
    WHERE ss.session_id IN (${ids.map(() => '?').join(',')})
    ORDER BY ss.role = 'Speaker', sp.name
  `).all(...ids);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.session_id)) map.set(r.session_id, []);
    map.get(r.session_id).push({
      id: r.id, name: r.name, pronouns: r.pronouns, role: r.role,
      jobTitle: r.job_title, company: r.company, initials: r.initials,
      accent: r.accent, imageUrl: r.image_url, city: r.city, country: r.country,
      featured: !!r.featured,
    });
  }
  return map;
};

const tagsForSessions = (ids) => {
  if (!ids.length) return new Map();
  const rows = db.prepare(`
    SELECT st.session_id, tg.name, tg.slug, tg.kind
    FROM session_tags st JOIN tags tg ON tg.id = st.tag_id
    WHERE st.session_id IN (${ids.map(() => '?').join(',')})
    ORDER BY tg.kind, tg.name
  `).all(...ids);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.session_id)) map.set(r.session_id, []);
    map.get(r.session_id).push({ name: r.name, slug: r.slug, kind: r.kind });
  }
  return map;
};

export function toSession(row, extra = {}) {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    abstract: row.abstract,
    takeaways: row.takeaways ? row.takeaways.split('|') : [],
    prerequisites: row.prerequisites,
    day: row.day,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    durationMins: row.duration_mins,
    format: row.format,
    level: row.level,
    language: row.language,
    capacity: row.capacity,
    seatsTaken: row.seats_taken,
    seatsLeft: Math.max(0, row.capacity - row.seats_taken),
    fillRate: row.capacity ? Math.min(1, row.seats_taken / row.capacity) : 0,
    isFull: row.seats_taken >= row.capacity,
    waitlistCount: row.waitlist_count ?? 0,
    isKeynote: !!row.is_keynote,
    isRecorded: !!row.is_recorded,
    requiresRsvp: !!row.requires_rsvp,
    livestream: !!row.livestream,
    recordingUrl: row.recording_url,
    slidesUrl: row.slides_url,
    repoUrl: row.repo_url,
    avgRating: row.avg_rating,
    ratingCount: row.rating_count,
    track: { id: row.track_id, name: row.track_name, slug: row.track_slug, color: row.track_color },
    room: {
      id: row.room_id, name: row.room_name, building: row.building, floor: row.floor,
      kind: row.room_kind, capacity: row.room_capacity, walkMinutes: row.walk_minutes,
      accessible: !!row.room_accessible,
      amenities: row.room_amenities ? row.room_amenities.split(',').filter(Boolean) : [],
    },
    venue: {
      id: row.venue_id, name: row.venue_name, shortName: row.venue_short,
      accent: row.venue_accent, emoji: row.venue_emoji, isPrimary: !!row.venue_is_primary,
    },
    ...extra,
  };
}

/** Hydrate a list of raw session rows with speakers + tags in two batched queries. */
export function hydrateSessions(rows) {
  const ids = rows.map((r) => r.id);
  const speakers = speakersForSessions(ids);
  const tags = tagsForSessions(ids);
  return rows.map((r) => toSession(r, {
    speakers: speakers.get(r.id) ?? [],
    tags: tags.get(r.id) ?? [],
  }));
}

export function toSpeaker(row, extra = {}) {
  return {
    id: row.id,
    name: row.name,
    pronouns: row.pronouns,
    jobTitle: row.job_title,
    company: row.company,
    bio: row.bio,
    initials: row.initials,
    accent: row.accent,
    imageUrl: row.image_url,
    city: row.city,
    country: row.country,
    languages: row.languages ? row.languages.split(',') : [],
    expertise: row.expertise ? row.expertise.split(',').filter(Boolean) : [],
    yearsExperience: row.years_exp,
    talksGiven: row.talks_given,
    avgRating: row.avg_rating,
    firstTime: !!row.first_time,
    featured: !!row.featured,
    socials: {
      twitter: row.twitter, github: row.github,
      linkedin: row.linkedin, website: row.website,
    },
    ...extra,
  };
}

export const toVenue = (row) => ({
  id: row.id, name: row.name, shortName: row.short_name, address: row.address, city: row.city,
  description: row.description, accent: row.accent, emoji: row.emoji,
  lat: row.lat, lng: row.lng, isPrimary: !!row.is_primary,
  wifiSsid: row.wifi_ssid, opensAt: row.opens_at, closesAt: row.closes_at,
});

export const toTravel = (row) => ({
  fromVenueId: row.from_venue_id, toVenueId: row.to_venue_id, mode: row.mode,
  minutes: row.minutes, costUsd: row.cost_usd, note: row.note,
});

export const toTrack = (row) => ({
  id: row.id, name: row.name, shortName: row.short_name, slug: row.slug,
  color: row.color, description: row.description,
});

export const toRoom = (row) => ({
  id: row.id, venueId: row.venue_id, name: row.name, building: row.building, floor: row.floor,
  levelOrder: row.level_order, capacity: row.capacity, kind: row.kind,
  walkMinutes: row.walk_minutes,
  amenities: row.amenities ? row.amenities.split(',').filter(Boolean) : [],
  accessible: !!row.accessible,
});

export const toVendor = (row) => ({
  id: row.id, venueId: row.venue_id, name: row.name, cuisine: row.cuisine,
  description: row.description, building: row.building, floor: row.floor,
  opensAt: row.opens_at, closesAt: row.closes_at,
  priceTier: row.price_tier, rating: row.rating, reviewCount: row.review_count,
  dietary: row.dietary ? row.dietary.split(',').filter(Boolean) : [],
  emoji: row.emoji, waitMins: row.wait_mins, acceptsMealCredit: !!row.accepts_meal_credit,
});

export const toSponsor = (row) => ({
  id: row.id, venueId: row.venue_id, name: row.name, tier: row.tier, booth: row.booth,
  blurb: row.blurb, website: row.website, accent: row.accent, initials: row.initials,
  perk: row.perk, hiring: !!row.hiring,
});

export const toUser = (row, extra = {}) => ({
  id: row.id, name: row.name, email: row.email, jobTitle: row.job_title, company: row.company,
  initials: row.initials, accent: row.accent, imageUrl: row.image_url, bio: row.bio, pronouns: row.pronouns,
  homeCity: row.home_city, timezone: row.timezone, ticketTier: row.ticket_tier,
  interests: row.interests ? row.interests.split(',').filter(Boolean) : [],
  speakerId: row.speaker_id ?? null,
  isSpeaker: !!row.speaker_id,
  ...extra,
});

export const toAnnouncement = (row) => ({
  id: row.id, title: row.title, body: row.body, kind: row.kind,
  venueId: row.venue_id, postedAt: row.posted_at, pinned: !!row.pinned,
});

/** "09:00" -> 540 */
export const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
