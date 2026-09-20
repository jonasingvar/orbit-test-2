/**
 * Travel-time helpers for a conference spread across two sites.
 *
 * The Foundry is 6.2 miles from Aurora. Getting between them is a real
 * cost in minutes, and any feature that reasons about an attendee's day
 * should account for it.
 */

/** All modes between two venues, cheapest-in-time first. */
export function routesBetween(travel, fromVenueId, toVenueId) {
  return travel
    .filter((t) => t.fromVenueId === fromVenueId && t.toVenueId === toVenueId)
    .sort((a, b) => a.minutes - b.minutes);
}

/**
 * Can you get from one session to the next in the gap between them?
 *
 * Returns every mode that fits and every mode that does not, because the
 * interesting answer is rarely yes or no — it is usually "not on the free
 * shuttle, but a rideshare just about does it".
 */
export function assessTravel({ travel, from, to, gapMinutes }) {
  if (!from || !to || from.venue.id === to.venue.id) return null;

  const walk = to.room.walkMinutes ?? 0;
  const options = travel
    .filter((t) => t.fromVenueId === from.venue.id && t.toVenueId === to.venue.id && t.mode !== 'Walk')
    .map((t) => ({ ...t, total: t.minutes + walk, fits: gapMinutes >= t.minutes + walk }))
    .sort((a, b) => a.total - b.total);

  if (!options.length) return null;
  const free = options.find((o) => o.costUsd === 0);

  return {
    gapMinutes,
    walk,
    options,
    fastest: options[0],
    free,
    // nothing fits at all, or only something you have to pay for
    impossible: options.every((o) => !o.fits),
    freeTooSlow: Boolean(free && !free.fits && options.some((o) => o.fits)),
  };
}
