import { useEffect, useState } from 'react';

/**
 * The conference clock.
 *
 * Conference time is simulated: we take the viewer's real time of day and
 * project it onto a conference day (Day 1 is the day the database was seeded). Open the app at 10:40 and
 * you are standing in the 10:15 slot, watching it run. The clock ticks on its
 * own, so progress bars actually move.
 *
 * Outside conference hours we clamp to a lively mid-morning moment rather than
 * showing an empty venue at 3am.
 *
 * Overrides, in priority order:
 *   ?at=YYYY-MM-DDTHH:MM   query string — for demos and screenshots
 *   localStorage orbit:clockAt   — sticky version of the same
 */
const FALLBACK_TIME = '10:40';
const DEFAULT_DAY = '2026-10-12';
const DAY_START = 8 * 60;
const DAY_END = 22 * 60 + 30;

const pad = (n) => String(n).padStart(2, '0');
const toHHMM = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

function readOverride() {
  const fromQuery = new URLSearchParams(window.location.search).get('at');
  const raw = fromQuery ?? window.localStorage.getItem('orbit:clockAt');
  if (!raw) return null;
  const [day, time] = raw.split('T');
  if (!day || !time) return null;
  return { day, time: time.slice(0, 5) };
}

function currentMoment(anchorDay) {
  const override = readOverride();
  if (override) return override;

  const real = new Date();
  const minutes = real.getHours() * 60 + real.getMinutes();
  const inHours = minutes >= DAY_START && minutes <= DAY_END;

  return {
    day: anchorDay,
    time: inHours ? toHHMM(minutes) : FALLBACK_TIME,
  };
}

/**
 * Ticks every 30s. Returns `{ day, time }`.
 *
 * Depends on the anchor *date string*, not the days array — the array is a new
 * reference on every render before bootstrap resolves, which would restart the
 * effect forever.
 */
export function useConferenceClock(days = []) {
  const anchorDay = days[0]?.date ?? DEFAULT_DAY;
  const [moment, setMoment] = useState(() => currentMoment(anchorDay));

  useEffect(() => {
    setMoment(currentMoment(anchorDay));
    if (readOverride()) return; // pinned for a demo or a test — no need to tick
    const id = setInterval(() => setMoment(currentMoment(anchorDay)), 30_000);
    return () => clearInterval(id);
  }, [anchorDay]);

  return moment;
}

export const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** How far through a session we are, 0–1. */
export function progressOf(session, nowHHMM) {
  const now = toMinutes(nowHHMM);
  const start = toMinutes(session.startsAt);
  const end = toMinutes(session.endsAt);
  if (now <= start) return 0;
  if (now >= end) return 1;
  return (now - start) / (end - start);
}

/** "in 12 min" / "started 8 min ago" / "in 2h 5m" */
export function relativeToNow(hhmm, nowHHMM) {
  const delta = toMinutes(hhmm) - toMinutes(nowHHMM);
  if (delta === 0) return 'starting now';
  const abs = Math.abs(delta);
  const label = abs >= 60 ? `${Math.floor(abs / 60)}h ${abs % 60}m` : `${abs} min`;
  return delta > 0 ? `in ${label}` : `${label} ago`;
}

/** Is a venue/vendor open at the current conference time? */
export function isOpenAt(opensAt, closesAt, nowHHMM) {
  const now = toMinutes(nowHHMM);
  const open = toMinutes(opensAt);
  const close = toMinutes(closesAt);
  // Places that close after midnight (bars) wrap around.
  return close < open ? now >= open || now < close : now >= open && now < close;
}
