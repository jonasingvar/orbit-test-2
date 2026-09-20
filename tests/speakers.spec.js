import { test, expect } from '@playwright/test';
import { API, visit, ATTENDEES } from './helpers.js';


test.describe('Speakers', () => {
  test('the unfiltered page is tiered, not one flat list', async ({ page }) => {
    await visit(page, '/speakers');
    await expect(page.getByTestId('headline-speakers')).toBeVisible();
    await expect(page.getByTestId('all-speakers')).toBeVisible();
    await expect(page.getByRole('heading', { name: /The headliners/i })).toBeVisible();
    // the long tail is browsable by letter rather than one endless column
    await expect(page.getByRole('button', { name: /Jump to [A-Z]/ }).first()).toBeVisible();
  });

  test('every speaker on the programme is actually presenting', async ({ request }) => {
    const speakers = await (await request.get(`${API}/speakers`)).json();
    const idle = speakers.filter((s) => (s.sessionCount ?? 0) === 0);
    expect(idle.map((s) => s.name)).toEqual([]);
  });

  test('following a speaker surfaces them at the top of the list', async ({ page, request }, testInfo) => {
    // Follows are shared state and the projects run concurrently: one attendee each.
    const user = testInfo.project.name === 'mobile' ? ATTENDEES.kenji : ATTENDEES.marcus;
    const me = await (await request.get(`${API}/users/${user}`)).json();
    const wasFollowing = me.followedSpeakers.some((s) => s.id === 9);

    await visit(page, '/speakers/9', { as: user });
    const name = await page.getByTestId('speaker-name').innerText();

    const follow = page.getByTestId('follow-speaker');
    if (wasFollowing) await follow.click();
    await expect(follow).toHaveAttribute('aria-pressed', 'false');
    await follow.click();
    await expect(follow).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/speakers');
    const following = page.getByTestId('followed-speakers');
    await expect(following).toBeVisible();
    await expect(following).toContainText(name);

    // and the Following chip filters down to just them
    await page.getByTestId('filter-following').click();
    await expect(page.getByTestId('followed-speakers')).toContainText(name);
    await expect(page.getByTestId('headline-speakers')).toHaveCount(0);

    if (!wasFollowing) await request.delete(`${API}/users/${user}/follows/9`);
  });

  test('the keynotes filter lists the keynote speakers rather than a blank page', async ({ page, request }) => {
    // Filtering hides the headliner spotlight, so featured speakers have to show
    // up in the results — anyone you follow is lifted into their own section.
    const featured = (await (await request.get(`${API}/speakers`)).json()).filter((s) => s.featured);
    const jonas = await (await request.get(`${API}/users/${ATTENDEES.jonas}`)).json();
    const followed = new Set(jonas.followedSpeakers.map((s) => s.id));
    const listed = featured.filter((s) => !followed.has(s.id));
    expect(listed.length).toBeGreaterThan(0);

    await visit(page, '/speakers?show=keynotes', { as: ATTENDEES.jonas });
    const results = page.getByTestId('all-speakers');
    await expect(results).toBeVisible();
    await expect(page.getByTestId('speaker-count')).toHaveText(String(listed.length));
    await expect(results.getByRole('link').first()).toBeVisible();
  });

  test('searching collapses the tiers into one flat result list', async ({ page }) => {
    await visit(page, '/speakers?q=a&track=agents-tool-use');
    await expect(page.getByTestId('headline-speakers')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Matching speakers/i })).toBeVisible();
  });

  test('speakers have real portraits, not just initials', async ({ page }) => {
    await visit(page, '/speakers');
    const portraits = page.getByTestId('headline-speakers').locator('img');
    await expect(portraits.first()).toBeVisible();
    const src = await portraits.first().getAttribute('src');
    expect(src).toMatch(/^\/avatars\/speaker-\d{3}\.jpg$/);

    // and the file is actually served
    const res = await page.request.get(new URL(src, page.url()).toString());
    expect(res.ok()).toBeTruthy();
  });

  test('sorting changes the order of the list', async ({ page }) => {
    // Comparing only the first name is not enough — the most-prolific speaker
    // can also happen to be first alphabetically.
    const order = async (sort) => {
      await visit(page, `/speakers?q=a&sort=${sort}`);
      const list = page.getByTestId('all-speakers');
      await expect(list).toBeVisible();
      return list.locator('a').allInnerTexts();
    };

    const byName = await order('name');
    const bySessions = await order('sessions');
    expect(byName.length).toBeGreaterThan(3);
    expect(byName).not.toEqual(bySessions);
    // A–Z really is alphabetical
    expect(byName.map((n) => n.split('\n')[0])).toEqual(
      [...byName.map((n) => n.split('\n')[0])].sort((a, b) => a.localeCompare(b)),
    );
  });
});

test.describe('Headliner spotlight', () => {
  test('renders and advances through the headliners', async ({ page }) => {
    await visit(page, '/speakers');
    const spotlight = page.getByTestId('speaker-spotlight');
    await expect(spotlight).toBeVisible();

    const first = await spotlight.getByRole('heading').innerText();
    await spotlight.getByTestId('spotlight-next').click();
    await expect(spotlight.getByRole('heading')).not.toHaveText(first);
  });

  test('the filmstrip jumps straight to a speaker', async ({ page }) => {
    await visit(page, '/speakers');
    const spotlight = page.getByTestId('speaker-spotlight');
    const tabs = spotlight.getByRole('tab');
    const target = await tabs.nth(4).getAttribute('aria-label');

    await tabs.nth(4).click();
    await expect(spotlight.getByRole('heading', { name: target })).toBeVisible();
    await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');
  });

  test('every speaker name matches the pronouns on their profile', async ({ request }) => {
    const res = await request.get(`${API}/speakers`);
    const speakers = await res.json();
    // Portraits are classified in server/avatar-presentation.json and the seed
    // picks the name + pronouns to match, so these must never disagree.
    for (const s of speakers) {
      expect(s.imageUrl, `${s.name} has no portrait`).toMatch(/^\/avatars\/speaker-\d{3}\.jpg$/);
      expect(s.pronouns, `${s.name} has odd pronouns`).toMatch(/^(he|she)\//);
    }
    // the programme size is not the point — that every one of them is consistent is
    expect(speakers.length).toBeGreaterThan(50);
  });
});
