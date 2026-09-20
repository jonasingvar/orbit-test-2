/** Shared display helpers. Keep formatting out of components. */

export const time = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
};

export const timeRange = (start, end) => `${time(start)} – ${time(end)}`;

export const dayLabel = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
  });

export const shortDay = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', timeZone: 'UTC',
  });

/**
 * "12m ago" measured against the conference clock, not the browser's.
 * Seeded timestamps are conference-local wall time with a Z suffix, so the
 * clock is compared on that same basis.
 */
export const relativeDate = (iso, clock) => {
  const d = new Date(iso);
  const diff = (new Date(`${clock.day}T${clock.time}:00Z`).getTime() - d.getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
