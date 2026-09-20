import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * One database file, chosen by the environment. `ORBIT_DB` lets a test suite —
 * or a second agent working a second ticket — run against its own copy instead
 * of fighting over this one.
 */
export const DB_PATH = process.env.ORBIT_DB
  ? resolve(process.env.ORBIT_DB)
  : join(__dirname, '..', 'data', 'orbit.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  job_title   TEXT,
  company     TEXT,
  initials    TEXT NOT NULL,
  accent      TEXT NOT NULL,
  image_url   TEXT,
  bio         TEXT,
  pronouns    TEXT,
  home_city   TEXT,
  timezone    TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  ticket_tier TEXT NOT NULL DEFAULT 'Standard',
  interests   TEXT NOT NULL DEFAULT '',
  -- Attendees who are also presenting link to their speakers row.
  speaker_id  INTEGER REFERENCES speakers(id)
);

-- Two physical sites, roughly 6 miles apart on opposite ends of the Strip.
CREATE TABLE IF NOT EXISTS venues (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  short_name   TEXT NOT NULL,
  address      TEXT NOT NULL,
  city         TEXT NOT NULL,
  description  TEXT NOT NULL,
  accent       TEXT NOT NULL,
  emoji        TEXT NOT NULL,
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  is_primary   INTEGER NOT NULL DEFAULT 0,
  wifi_ssid    TEXT,
  opens_at     TEXT NOT NULL DEFAULT '07:00',
  closes_at    TEXT NOT NULL DEFAULT '23:00'
);

-- How long it takes to get from one site to another, per travel mode.
CREATE TABLE IF NOT EXISTS venue_travel (
  from_venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  to_venue_id   INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  mode          TEXT NOT NULL,
  minutes       INTEGER NOT NULL,
  cost_usd      REAL NOT NULL DEFAULT 0,
  note          TEXT,
  PRIMARY KEY (from_venue_id, to_venue_id, mode)
);

CREATE TABLE IF NOT EXISTS tracks (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  -- one or two words, for filter chips where the full name wraps
  short_name  TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  color       TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  slug  TEXT NOT NULL UNIQUE,
  kind  TEXT NOT NULL DEFAULT 'topic'
);

CREATE TABLE IF NOT EXISTS rooms (
  id            INTEGER PRIMARY KEY,
  venue_id      INTEGER NOT NULL REFERENCES venues(id),
  name          TEXT NOT NULL UNIQUE,
  building      TEXT NOT NULL,
  floor         TEXT NOT NULL,
  level_order   INTEGER NOT NULL DEFAULT 1,
  capacity      INTEGER NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'Breakout',
  -- minutes on foot from that venue's main entrance / registration desk
  walk_minutes  INTEGER NOT NULL DEFAULT 3,
  amenities     TEXT NOT NULL DEFAULT '',
  accessible    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS speakers (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  pronouns       TEXT,
  job_title      TEXT NOT NULL,
  company        TEXT NOT NULL,
  bio            TEXT NOT NULL,
  initials       TEXT NOT NULL,
  accent         TEXT NOT NULL,
  image_url      TEXT,
  city           TEXT,
  country        TEXT,
  languages      TEXT NOT NULL DEFAULT 'English',
  expertise      TEXT NOT NULL DEFAULT '',
  years_exp      INTEGER NOT NULL DEFAULT 5,
  talks_given    INTEGER NOT NULL DEFAULT 0,
  avg_rating     REAL NOT NULL DEFAULT 0,
  first_time     INTEGER NOT NULL DEFAULT 0,
  twitter        TEXT,
  github         TEXT,
  linkedin       TEXT,
  website        TEXT,
  featured       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  subtitle      TEXT,
  abstract      TEXT NOT NULL,
  takeaways     TEXT NOT NULL DEFAULT '',
  prerequisites TEXT,
  track_id      INTEGER NOT NULL REFERENCES tracks(id),
  room_id       INTEGER NOT NULL REFERENCES rooms(id),
  day           TEXT NOT NULL,
  starts_at     TEXT NOT NULL,
  ends_at       TEXT NOT NULL,
  duration_mins INTEGER NOT NULL,
  format        TEXT NOT NULL,
  level         TEXT NOT NULL,
  language      TEXT NOT NULL DEFAULT 'English',
  capacity      INTEGER NOT NULL,
  seats_taken   INTEGER NOT NULL DEFAULT 0,
  is_keynote    INTEGER NOT NULL DEFAULT 0,
  is_recorded   INTEGER NOT NULL DEFAULT 0,
  requires_rsvp INTEGER NOT NULL DEFAULT 0,
  livestream    INTEGER NOT NULL DEFAULT 0,
  recording_url TEXT,
  slides_url    TEXT,
  repo_url      TEXT,
  avg_rating    REAL NOT NULL DEFAULT 0,
  rating_count  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS session_tags (
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, tag_id)
);

CREATE TABLE IF NOT EXISTS session_speakers (
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  speaker_id INTEGER NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'Speaker',
  PRIMARY KEY (session_id, speaker_id)
);

-- An attendee's plan. Adding a session takes one of a finite number of seats
-- and moves sessions.seats_taken for everybody; when a session is full the
-- reservation is waitlisted instead, and promoted in order as seats free up.
-- There is deliberately no separate 'bookmark' concept — see CLAUDE.md.
CREATE TABLE IF NOT EXISTS reservations (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, session_id)
);

-- Proof you actually turned up. Self check-in opens shortly before a session
-- starts and closes when it ends; rating a session requires one.
CREATE TABLE IF NOT EXISTS check_ins (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  checked_in_at TEXT NOT NULL,
  PRIMARY KEY (user_id, session_id)
);

CREATE TABLE IF NOT EXISTS speaker_follows (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  speaker_id INTEGER NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, speaker_id)
);

CREATE TABLE IF NOT EXISTS ratings (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  stars      INTEGER NOT NULL,
  comment    TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, session_id)
);

CREATE TABLE IF NOT EXISTS vendors (
  id          INTEGER PRIMARY KEY,
  venue_id    INTEGER NOT NULL REFERENCES venues(id),
  name        TEXT NOT NULL,
  cuisine     TEXT NOT NULL,
  description TEXT NOT NULL,
  building    TEXT NOT NULL,
  floor       TEXT NOT NULL,
  opens_at    TEXT NOT NULL,
  closes_at   TEXT NOT NULL,
  price_tier  TEXT NOT NULL,
  rating      REAL NOT NULL,
  review_count INTEGER NOT NULL DEFAULT 0,
  dietary     TEXT NOT NULL DEFAULT '',
  emoji       TEXT NOT NULL DEFAULT '🍽️',
  wait_mins   INTEGER NOT NULL DEFAULT 0,
  accepts_meal_credit INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sponsors (
  id       INTEGER PRIMARY KEY,
  venue_id INTEGER NOT NULL REFERENCES venues(id),
  name     TEXT NOT NULL,
  tier     TEXT NOT NULL,
  booth    TEXT NOT NULL,
  blurb    TEXT NOT NULL,
  website  TEXT,
  accent   TEXT NOT NULL,
  initials TEXT NOT NULL,
  perk     TEXT,
  hiring   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS announcements (
  id        INTEGER PRIMARY KEY,
  title     TEXT NOT NULL,
  body      TEXT NOT NULL,
  kind      TEXT NOT NULL,
  venue_id  INTEGER REFERENCES venues(id),
  posted_at TEXT NOT NULL,
  pinned    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_day       ON sessions(day);
CREATE INDEX IF NOT EXISTS idx_sessions_track     ON sessions(track_id);
CREATE INDEX IF NOT EXISTS idx_sessions_room      ON sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_ss_speaker         ON session_speakers(speaker_id);
CREATE INDEX IF NOT EXISTS idx_st_tag             ON session_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user  ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user      ON check_ins(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_sess  ON reservations(session_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_rooms_venue        ON rooms(venue_id);
`;

export function migrate() {
  db.exec(SCHEMA);
}

export function dropAll() {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    DROP TABLE IF EXISTS ratings;
    DROP TABLE IF EXISTS check_ins;
    DROP TABLE IF EXISTS reservations;
    DROP TABLE IF EXISTS speaker_follows;
    DROP TABLE IF EXISTS session_tags;
    DROP TABLE IF EXISTS session_speakers;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS speakers;
    DROP TABLE IF EXISTS vendors;
    DROP TABLE IF EXISTS sponsors;
    DROP TABLE IF EXISTS announcements;
    DROP TABLE IF EXISTS rooms;
    DROP TABLE IF EXISTS tags;
    DROP TABLE IF EXISTS tracks;
    DROP TABLE IF EXISTS venue_travel;
    DROP TABLE IF EXISTS venues;
    DROP TABLE IF EXISTS users;
  `);
  db.pragma('foreign_keys = ON');
}
