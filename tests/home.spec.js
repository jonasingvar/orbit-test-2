import { test, expect } from '@playwright/test';
import { API, visit, momentOn, conferenceDays, ATTENDEES } from './helpers.js';


test.describe('Home is about you, and about now', () => {
  test('the day shown is today, not the first day you booked something', async ({ page }) => {
    // Kenji only attends the first two days; on day 3 the page must not
    // present day 1 as if it were happening.
    await visit(page, '/', { as: ATTENDEES.kenji, at: await momentOn(2, '14:00') });

    const panel = page.getByTestId('today-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Day 3');
    await expect(panel).not.toContainText('Day 1');
  });

  test('an attendee with nothing booked today gets a way in, not an empty grid', async ({ page }) => {
    // Marcus flew in for two days, so day 4 is empty for him — and no seat test books it.
    await visit(page, '/', { as: ATTENDEES.marcus, at: await momentOn(3, '10:00') });

    const empty = page.getByTestId('today-empty');
    await expect(empty).toBeVisible();
    await expect(empty.getByRole('link', { name: /Browse today/i })).toBeVisible();
  });

  test('the live strip tells the truth at both ends of the day', async ({ page }) => {
    const strip = page.getByTestId('live-now');

    await visit(page, '/', { at: await momentOn(0, '07:15') });
    await expect(strip.getByRole('heading').first()).toContainText(/Not started yet/i);
    await expect(strip).not.toContainText(/changing rooms/i);

    await visit(page, '/', { at: await momentOn(0, '23:30') });
    await expect(strip.getByRole('heading').first()).toContainText(/is done/i);
    await expect(strip).not.toContainText(/has not started/i);
  });

  test('your own sessions are marked in the live strip', async ({ page }) => {
    const days = await conferenceDays();
    const today = await (await page.request.get(
      `${API}/users/${ATTENDEES.jonas}/today?day=${days[0]}&time=07:30`)).json();
    test.skip(!today.next, 'nothing booked on day 1');

    await visit(page, '/', { as: ATTENDEES.jonas, at: await momentOn(0, '07:30') });
    const strip = page.getByTestId('live-now');
    await expect(strip).toContainText('Yours');
  });

  test('a cross-town gap is called out, with what actually fits', async ({ page, request }) => {
    // Jonas has cross-venue back-to-backs. Find the one the free shuttle cannot
    // make rather than guessing at a time — but insist there is one, because a
    // warning that only sometimes renders is a test that asserts nothing.
    const { travel } = await (await request.get(`${API}/bootstrap`)).json();
    const plan = await (await request.get(`${API}/users/${ATTENDEES.jonas}/schedule`)).json();
    const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const shuttle = (a, b) => travel.find((t) =>
      t.fromVenueId === a.venue.id && t.toVenueId === b.venue.id && t.costUsd === 0 && t.mode !== 'Walk');

    const pair = (plan.days ?? [])
      .flatMap((d) => d.sessions.filter((s) => s.reservation === 'confirmed'))
      .flatMap((s, i, booked) => (booked[i + 1] ? [[s, booked[i + 1]]] : []))
      .find(([a, b]) => {
        const free = a.day === b.day && a.venue.id !== b.venue.id ? shuttle(a, b) : null;
        return free && mins(b.startsAt) - mins(a.endsAt) < free.minutes + b.room.walkMinutes;
      });
    expect(pair, 'Jonas should have a cross-town gap the shuttle cannot make').toBeTruthy();
    const [from, to] = pair;

    await visit(page, '/', { as: ATTENDEES.jonas, at: `${from.day}T${from.endsAt}` });

    const warning = page.getByTestId('travel-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(/shuttle|cannot make/i);
    await expect(warning).toContainText(`${to.room.walkMinutes} min walk`);
  });

  test('no announcement appears before it was posted', async ({ page, request }) => {
    const days = await conferenceDays();
    const all = await (await request.get(`${API}/announcements`)).json();
    const cutoff = `${days[0]}T09:00:00Z`;
    const posted = all.filter((a) => a.postedAt <= cutoff);
    const future = all.filter((a) => a.postedAt > cutoff);
    expect(posted.length, 'nothing is posted before 09:00 on day 1').toBeGreaterThan(0);
    expect(future.length, 'nothing is posted after 09:00 on day 1').toBeGreaterThan(0);

    await visit(page, '/', { at: await momentOn(0, '09:00') });
    const strip = page.getByTestId('announcements');
    await expect(strip).toBeVisible();

    const shown = await strip.innerText();
    for (const a of future) {
      expect(shown, `"${a.title}" was posted later than the clock`).not.toContain(a.title);
    }
  });

  test('only a speaker sees the speaker strip', async ({ page }) => {
    await visit(page, '/', { as: ATTENDEES.priya });
    await expect(page.getByTestId('speaking-strip')).toBeVisible();

    await visit(page, '/', { as: ATTENDEES.kenji });
    await expect(page.getByTestId('speaking-strip')).toHaveCount(0);
  });

  test('the brochure sections are gone', async ({ page }) => {
    await visit(page, '/');
    for (const id of ['keynotes', 'tracks', 'venue-split', 'featured-speakers', 'popular-sessions']) {
      await expect(page.getByTestId(id), `${id} should no longer be on home`).toHaveCount(0);
    }
  });
});
