/**
 * Screenshot one or more routes into .screenshots/ — the fastest way for a
 * human or an agent to actually look at the app.
 *
 *   npm run shot                     # every main route, desktop
 *   npm run shot -- /schedule        # one route
 *   npm run shot -- /my-agenda --mobile --user=2
 *   npm run shot -- / --at=2026-10-13T14:30   # pin the conference clock
 *   npm run shot -- / --full         # full-page instead of viewport
 *
 * WEB_PORT points it at a particular app, so a worktree running its own lane
 * screenshots its own code.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';

/**
 * The app this run looks at. WEB_PORT follows whichever lane claimed it, so a
 * worktree on 4301 screenshots its own app rather than whatever happens to own
 * the default port.
 */
const WEB_PORT = process.env.WEB_PORT ?? 5173;
const BASE = `http://localhost:${WEB_PORT}`;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const routes = args.filter((a) => !a.startsWith('--'));
const userId = Number(args.find((a) => a.startsWith('--user='))?.split('=')[1] ?? 1);
const at = args.find((a) => a.startsWith('--at='))?.split('=')[1];

const DEFAULT_ROUTES = ['/', '/schedule', '/sessions/1', '/speakers', '/speakers/1', '/my-agenda', '/venues', '/food', '/expo'];
const targets = routes.length ? routes : DEFAULT_ROUTES;
const mobile = flags.has('--mobile');
const fullPage = flags.has('--full');
const outDir = '.screenshots';

mkdirSync(outDir, { recursive: true });

/** Start `npm run dev` if nothing is listening yet, so this works from cold. */
const isUp = async () => {
  try { await fetch(BASE, { signal: AbortSignal.timeout(1000) }); return true; }
  catch { return false; }
};

let devServer;
if (!(await isUp())) {
  console.log(`  starting the app on ${WEB_PORT}…`);
  // NO_OPEN keeps Vite from launching a browser window. One is a courtesy;
  // ten agents taking screenshots at once is ten windows fighting for focus.
  devServer = spawn('npm', ['run', 'dev'], {
    stdio: 'ignore',
    detached: false,
    env: { ...process.env, NO_OPEN: '1' },
  });
  const deadline = Date.now() + 60_000;
  while (!(await isUp())) {
    if (Date.now() > deadline) { devServer.kill(); throw new Error('App did not start within 60s'); }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 950 },
  deviceScaleFactor: 2,
});
await context.addInitScript(({ id, at }) => {
  window.localStorage.setItem('orbit:currentUserId', String(id));
  if (at) window.localStorage.setItem('orbit:clockAt', at);
}, { id: userId, at });

const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && problems.push(`[console] ${m.text()}`));

for (const route of targets) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const name = (route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-'))
    + (mobile ? '.mobile' : '') + '.png';
  await page.screenshot({ path: `${outDir}/${name}`, fullPage });
  console.log(`  ${route.padEnd(16)} → ${outDir}/${name}`);
}

await browser.close();
devServer?.kill();
if (problems.length) {
  console.log('\n⚠ page problems:');
  problems.forEach((p) => console.log('  ', p));
  process.exitCode = 1;
}
