import { test, expect } from '@playwright/test';
import { API, visit, momentOn, laneFor, bookableFor } from './helpers.js';

test.describe('Session detail', () => {
  test('shows the full session record', async ({ page }) => {
    await visit(page, '/sessions/1');
    const detail = page.getByTestId('session-detail');
    await expect(page.getByTestId('session-title')).toBeVisible();
    await expect(detail).toContainText('About this session');
    await expect(detail.getByRole('heading', { name: /Speaker/ })).toBeVisible();
  });

  test('adding from the detail page toggles the button', async ({ page, request }, testInfo) => {
    // Its own lane, so the click cannot land on a session this attendee is
    // already booked against — that would open the conflict dialog instead.
    const lane = await laneFor('session.add', testInfo);
    const target = (await bookableFor(request, lane.user, lane.day)).find((s) => s.seatsLeft > 3);
    expect(target, 'nothing this attendee can add').toBeTruthy();

    await visit(page, `/sessions/${target.id}`, { as: lane.user, at: await momentOn(0, '07:00') });
    const action = page.getByTestId('save-session');
    await expect(action).toHaveText('Add to my agenda');
    await action.click();
    await expect(action).toHaveText('On my agenda');

    await request.delete(`${API}/users/${lane.user}/reservations/${target.id}`);
  });

  test('off-site sessions warn about travel time', async ({ page }) => {
    // Find a Foundry session, then open it.
    await visit(page, '/schedule?venue=2&view=list');
    await expect(page.getByTestId('result-count')).not.toHaveText(/Loading/);
    await page.locator('article').first().getByRole('heading').click();

    await expect(page.getByTestId('travel-notice')).toBeVisible();
    await expect(page.getByTestId('travel-notice')).toContainText(/min/);
  });

  test('navigating from a session to its speaker works', async ({ page }) => {
    await visit(page, '/sessions/1');
    await page.getByRole('link', { name: /./ }).filter({ hasText: /Labs|Systems|AI|Research/ }).first().click();
    await expect(page.getByTestId('speaker-detail')).toBeVisible();
  });
});
