import { test, expect } from '@playwright/test';
import { API, visit, momentOn, laneFor, bookableFor, ATTENDEES } from './helpers.js';


test.describe('My Agenda', () => {
  test('adding a session from the schedule puts it on the agenda', async ({ page, request }, testInfo) => {
    const lane = await laneFor('agenda.add', testInfo);
    const target = (await bookableFor(request, lane.user, lane.day)).find((s) => s.seatsLeft > 3);
    expect(target, 'nothing this attendee can add').toBeTruthy();

    await visit(page, `/schedule?day=${lane.day}&view=list`, { as: lane.user, at: await momentOn(0, '07:00') });
    await expect(page.getByTestId('result-count')).not.toHaveText(/Loading/);

    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: target.title, exact: true }) });
    const seat = card.getByRole('button', { name: /agenda|waitlist/i });
    await expect(seat).toHaveAttribute('aria-pressed', 'false');
    await seat.click();
    await expect(seat).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/my-agenda');
    await expect(page.getByText(target.title, { exact: false }).first()).toBeVisible();

    // release only what this test booked — the rest of the day is seeded
    await request.delete(`${API}/users/${lane.user}/reservations/${target.id}`);
  });

  test('the hours tile totals the hours shown on each day', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.sofia });

    const perDay = await page.getByText(/^\d+h of content$/).allTextContents();
    expect(perDay.length, 'needs a plan spanning several days to be worth summing').toBeGreaterThan(1);
    const sum = perDay.reduce((n, text) => n + Number(text.match(/^(\d+)h/)[1]), 0);

    await expect(page.getByTestId('stat-hours-booked')).toHaveText(String(sum));
  });

  test('each attendee sees their own plan', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.sofia });
    await expect(page.getByRole('heading', { name: /Sofia’s agenda/ })).toBeVisible();

    await visit(page, '/my-agenda', { as: ATTENDEES.kenji });
    await expect(page.getByRole('heading', { name: /Kenji’s agenda/ })).toBeVisible();
  });

  test('the switcher counts what is on an agenda, not what was "saved"', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.sofia });
    await page.getByRole('button', { name: /Switch attendee/ }).click();

    const option = page.getByRole('option', { name: /Sofia/ });
    await expect(option).toContainText(/[1-9]\d* on agenda/);
    await expect(option).not.toContainText(/saved/i);
  });

  test('switching attendee in the header changes the plan', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.jonas });
    await expect(page.getByRole('heading', { name: /Jonas’s agenda/ })).toBeVisible();

    await page.getByRole('button', { name: /Switch attendee/ }).click();
    await page.getByRole('option', { name: /Kenji Nakamura/ }).click();
    await expect(page.getByRole('heading', { name: /Kenji’s agenda/ })).toBeVisible();
  });
});

/**
 * Read-only: these look at a seeded plan and book nothing, so they need no lane.
 * Every assertion is an invariant of whatever happens to be rendered — a lane
 * test booking a seat for Sofia mid-run changes the strip, not its rules.
 */
test.describe('The shape of the day', () => {
  /** Each day's strip, read in clock order straight out of the DOM. */
  const stripsOn = (page) => page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="plan-day-"]')].map((section) => ({
      date: section.dataset.testid.replace('plan-day-', ''),
      items: [...(section.querySelector('[role="list"]')?.children ?? [])].map((el) => ({
        kind: el.dataset.testid,
        venue: el.dataset.venue ?? null,
        level: el.dataset.level ?? null,
        minutes: Number(el.dataset.minutes),
        width: el.offsetWidth,
        name: el.getAttribute('aria-label'),
      })),
    })));

  test('every day shows a block per session, proportional to its length', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.sofia });
    await expect(page.getByTestId('stat-hours-booked')).toBeVisible();

    const strips = await stripsOn(page);
    expect(strips.length, 'needs a booked day to have a shape').toBeGreaterThan(0);

    for (const strip of strips) {
      const blocks = strip.items.filter((i) => i.kind === 'timeline-session');
      const heading = await page.getByTestId(`plan-day-${strip.date}`).getByText(/^\d+ sessions?$/).textContent();
      expect(blocks.length, `${strip.date} strip vs heading`).toBe(Number(heading.match(/^(\d+)/)[1]));

      // Every block earns width at the same rate, so longer is always wider.
      const rates = blocks.filter((b) => b.minutes > 0).map((b) => b.width / b.minutes);
      const spread = Math.max(...rates) / Math.min(...rates);
      expect(spread, `${strip.date} px per minute varies`).toBeLessThan(1.05);

      const longest = blocks.reduce((a, b) => (b.minutes > a.minutes ? b : a));
      const shortest = blocks.reduce((a, b) => (b.minutes < a.minutes ? b : a));
      if (longest.minutes > shortest.minutes) expect(longest.width).toBeGreaterThan(shortest.width);

      for (const block of blocks) expect(block.name, 'a block with no accessible name').toMatch(/\S/);
    }
  });

  test('the gap you cannot spend is the one that changes venue', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.sofia });
    await expect(page.getByTestId('stat-hours-booked')).toBeVisible();

    const strips = await stripsOn(page);
    let travelGaps = 0;

    for (const strip of strips) {
      strip.items.forEach((item, i) => {
        if (!item.kind?.endsWith('gap')) return;
        const before = strip.items[i - 1];
        const after = strip.items[i + 1];

        if (item.kind === 'timeline-travel-gap') {
          travelGaps++;
          expect(before.venue, `${strip.date}: travel gap inside one venue`).not.toBe(after.venue);
          // the verdict is a word, not just a colour
          expect(item.name).toMatch(/Enough time|Tight|Not enough time/);
          expect(['comfortable', 'tight', 'impossible']).toContain(item.level);
        } else {
          expect(before.venue, `${strip.date}: venue change not marked as travel`).toBe(after.venue);
          expect(item.name).toMatch(/free between sessions/);
        }
      });
    }

    expect(travelGaps, 'this attendee is booked across both sites').toBeGreaterThan(0);
  });

  test('a thin day still reads as a day, never as an empty strip', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.marcus });
    await expect(page.getByTestId('stat-hours-booked')).toBeVisible();

    const strips = await stripsOn(page);
    for (const strip of strips) {
      const blocks = strip.items.filter((i) => i.kind === 'timeline-session');
      expect(blocks.length, `${strip.date} rendered a strip with nothing in it`).toBeGreaterThan(0);
      // one session on its own fills the day it is the whole of
      if (blocks.length === 1) expect(strip.items).toHaveLength(1);
    }
  });
});

test.describe('Speaker view', () => {
  test('a speaking attendee sees their own sessions', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.amara });
    const panel = page.getByTestId('speaking-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('You are speaking');
    await expect(panel.getByRole('link')).not.toHaveCount(0);
  });

  test('a non-speaking attendee sees no speaker panel', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.kenji });
    await expect(page.getByTestId('speaking-panel')).toHaveCount(0);
  });
});
