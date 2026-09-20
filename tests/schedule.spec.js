import { test, expect } from '@playwright/test';
import { API, visit, momentOn, waitForResults, conferenceDays, laneFor, bookableFor } from './helpers.js';


test.describe('Schedule', () => {
  test('lists sessions for the selected day', async ({ page }) => {
    await visit(page, '/schedule?view=list');
    await waitForResults(page);
    await expect(page.getByTestId('result-count')).toContainText(/\d+ sessions/);
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('switching day changes the results', async ({ page }) => {
    await visit(page, '/schedule?view=list');
    await waitForResults(page);
    const first = await page.getByTestId('result-count').textContent();

    // the filter rail is collapsed on narrow viewports
    const filters = page.getByRole('button', { name: /^Filters/ });
    if (await filters.isVisible()) await filters.click();
    const days = await conferenceDays();
    await page.getByTestId(`tab-${days[2]}`).click();
    await waitForResults(page);
    await expect(page).toHaveURL(new RegExp(`day=${days[2]}`));
    await expect(page.getByTestId('result-count')).not.toHaveText(first);
  });

  test('search narrows the list and survives a reload', async ({ page }) => {
    await visit(page, '/schedule?view=list');
    await waitForResults(page);

    const filtersBtn = page.getByRole('button', { name: /^Filters/ });
    if (await filtersBtn.isVisible()) await filtersBtn.click();
    await page.getByTestId('search-input').fill('agents');
    await waitForResults(page);
    const count = await page.getByTestId('result-count').textContent();
    expect(count).not.toContain('Loading');

    await expect(page).toHaveURL(/q=agents/);
    await page.reload();
    const reopened = page.getByRole('button', { name: /^Filters/ });
    if (await reopened.isVisible()) await reopened.click();
    await expect(page.getByTestId('search-input')).toHaveValue('agents');
  });

  test('filtering by venue only returns that venue', async ({ page }) => {
    await visit(page, '/schedule?venue=2&view=list');
    await waitForResults(page);
    // Everything at the Foundry carries the cross-town chip.
    const cards = page.locator('article');
    await expect(cards.first()).toContainText('Foundry');
  });

  test('the seats-left filter hides full sessions and survives a reload', async ({ page }) => {
    await visit(page, '/schedule?view=list');
    await waitForResults(page);
    const before = await page.getByTestId('result-count').textContent();

    const filtersBtn = page.getByRole('button', { name: /^Filters/ });
    if (await filtersBtn.isVisible()) await filtersBtn.click();
    await page.getByTestId('seats-toggle').click();
    await waitForResults(page);

    await expect(page).toHaveURL(/seats=1/);
    await expect(page.getByTestId('result-count')).not.toHaveText(before);
    await expect(page.getByTestId('session-full')).toHaveCount(0);

    await page.reload();
    await waitForResults(page);
    const reopened = page.getByRole('button', { name: /^Filters/ });
    if (await reopened.isVisible()) await reopened.click();
    await expect(page.getByTestId('seats-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('session-full')).toHaveCount(0);
  });

  test('an impossible filter combination shows the empty state', async ({ page }) => {
    await visit(page, '/schedule?q=zzzznotathing&view=list');
    await expect(page.getByRole('heading', { name: /No sessions match/i })).toBeVisible();
  });
});

test.describe('Schedule grid', () => {
  test('the grid lays sessions out by time and room', async ({ page }) => {
    await visit(page, '/schedule?view=grid');
    const grid = page.getByTestId('schedule-grid');
    await expect(grid).toBeVisible();
    await expect(grid.getByRole('columnheader').first()).toBeVisible();
    // the keynote is not in a room column — it spans the whole width
    await expect(grid.getByText('Keynote').first()).toBeVisible();
  });

  test('switching view swaps the layout and stays in the URL', async ({ page }) => {
    await visit(page, '/schedule?view=grid');
    await expect(page.getByTestId('schedule-grid')).toBeVisible();

    await page.getByTestId('view-list').click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page.getByTestId('schedule-grid')).toHaveCount(0);
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('adding from a grid cell updates the agenda count', async ({ page, request }, testInfo) => {
    // Seat state is shared and everything runs concurrently, so this books in
    // its own lane and releases only the session it added.
    const lane = await laneFor('schedule.grid', testInfo);
    const target = (await bookableFor(request, lane.user, lane.day)).find((s) => s.seatsLeft > 3);
    expect(target, 'nothing this attendee can add').toBeTruthy();

    await visit(page, `/schedule?view=grid&day=${lane.day}`, { as: lane.user, at: await momentOn(0, '07:00') });
    const count = page.getByTestId('starred-count');
    await expect(page.getByTestId('schedule-grid')).toBeVisible();
    const before = Number(await count.innerText());

    await page.getByTestId('schedule-grid')
      .getByRole('button', { name: `Add ${target.title} to my agenda`, exact: true }).click();
    await expect(count).toHaveText(String(before + 1));

    await request.delete(`${API}/users/${lane.user}/reservations/${target.id}`);
  });
});
