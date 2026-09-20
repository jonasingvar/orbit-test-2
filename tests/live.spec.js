import { test, expect } from '@playwright/test';
import { API, visit, momentOn, conferenceDays, MID_SESSION_TIME, BETWEEN_SLOTS_TIME, ATTENDEES } from './helpers.js';

test.describe('Conference clock', () => {
  test('mid-slot shows what is running, with progress', async ({ page }) => {
    await visit(page, '/', { at: await momentOn(0, MID_SESSION_TIME) });
    const strip = page.getByTestId('live-now');
    await expect(strip).toBeVisible();
    await expect(strip.getByRole('heading', { name: /Happening right now/i })).toBeVisible();
    await expect(strip.getByText(/min left/).first()).toBeVisible();
  });

  test('between slots it counts down to the next one', async ({ page }) => {
    await visit(page, '/', { at: await momentOn(0, BETWEEN_SLOTS_TIME) });
    const strip = page.getByTestId('live-now');
    await expect(strip.getByRole('heading', { name: /changing rooms/i })).toBeVisible();
    await expect(strip.getByText(/^in \d/).first()).toBeVisible();
  });

  test('a running session is flagged live on the schedule', async ({ page }) => {
    const [day1] = await conferenceDays();
    await visit(page, `/schedule?day=${day1}&view=list`, { at: await momentOn(0, MID_SESSION_TIME) });
    await expect(page.getByTestId('result-count')).not.toHaveText(/Loading/);
    await expect(page.getByTestId('slot-10:15').getByText('Live').first()).toBeVisible();
  });

  test('the live endpoint agrees with the UI', async ({ request }) => {
    const [day1] = await conferenceDays();
    const res = await request.get(`${API}/live?day=${day1}&time=10:30`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.happeningNow.length).toBeGreaterThan(0);
    for (const s of body.happeningNow) {
      expect(s.startsAt <= '10:30' && s.endsAt > '10:30').toBeTruthy();
    }
  });
});

test.describe('Food', () => {
  test('open-now filter only keeps places that are open', async ({ page }) => {
    await visit(page, '/food', { at: await momentOn(0, MID_SESSION_TIME) });
    await expect(page.getByTestId('vendor-count')).not.toHaveText(/Loading/);
    const before = await page.getByTestId('vendor-count').textContent();

    await page.getByTestId('open-now-toggle').click();
    await expect(page.getByTestId('open-now-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Closed now')).toHaveCount(0);

    const after = await page.getByTestId('vendor-count').textContent();
    expect(after).not.toEqual(before);
  });

  test('cuisine filter narrows to one cuisine', async ({ page }) => {
    await visit(page, '/food?cuisine=Coffee');
    await expect(page.getByTestId('vendor-count')).not.toHaveText(/Loading/);
    await expect(page.getByTestId('vendor-count')).toContainText(/vendor/);
    // every card shown should be a coffee place
    await expect(page.getByText('Japanese ·')).toHaveCount(0);
  });
});

test.describe('Following a speaker', () => {
  test('the follow button toggles and persists', async ({ page, request }, testInfo) => {
    // Follows are shared state and the projects run concurrently: one attendee each.
    const user = testInfo.project.name === 'mobile' ? ATTENDEES.kenji : ATTENDEES.marcus;
    const me = await (await request.get(`${API}/users/${user}`)).json();
    const wasFollowing = me.followedSpeakers.some((s) => s.id === 3);

    await visit(page, '/speakers/3', { as: user });
    const follow = page.getByTestId('follow-speaker');
    await expect(follow).toBeVisible();

    if (wasFollowing) await follow.click();
    await expect(follow).toHaveAttribute('aria-pressed', 'false');

    await follow.click();
    await expect(follow).toHaveAttribute('aria-pressed', 'true');
    await expect(follow).toContainText('Following');

    await page.reload();
    await expect(page.getByTestId('follow-speaker')).toHaveAttribute('aria-pressed', 'true');

    if (!wasFollowing) await request.delete(`${API}/users/${user}/follows/3`);
  });
});
