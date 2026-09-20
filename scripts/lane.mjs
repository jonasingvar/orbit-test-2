/**
 * Lanes — one worktree, one port pair, one database, one agent.
 *
 *   eval "$(node scripts/lane.mjs claim 42)"   # claim a lane for issue 42
 *   node scripts/lane.mjs list                 # who holds what
 *   node scripts/lane.mjs release              # give this worktree's lane back
 *
 * Several agents can work several tickets at once, each in its own
 * `git worktree`, as long as no two of them reach for the same port. This
 * hands out a free consecutive pair and records the claim where every
 * worktree can see it.
 *
 * The registry lives in the *common* git directory. Linked worktrees each get
 * their own `.git`, but `git rev-parse --git-common-dir` resolves to the same
 * path from inside all of them — so a lock written by one lane is visible to
 * every other, with no daemon, no config file and no machine-wide state. It
 * also disappears when the repo does.
 *
 * `ORBIT_DB` is deliberately not part of a lane: `data/` is gitignored and
 * per-checkout, so every worktree already seeds its own database.
 */
import { createServer } from 'node:net';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

/**
 * 4300 upward, two ports to a lane: the API on the even port, the web server
 * on the odd one above it. Fifty lanes is far more than anyone will run, and
 * the range stays clear of the app's own 3001/5173 defaults so a lane never
 * collides with a plain `npm run dev`.
 */
export const FIRST_PORT = 4300;
export const LAST_PORT = 4398;

/** Where every worktree's claims are recorded. */
export function laneRoot(cwd = process.cwd()) {
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' }).trim();
  return resolve(cwd, common, 'orbit-lanes');
}

/** The worktree a claim belongs to — its top-level directory. */
export function worktreeOf(cwd = process.cwd()) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
}

/** Can we actually listen on this port right now? */
export function portFree(port) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once('error', () => done(false));
    probe.once('listening', () => probe.close(() => done(true)));
    probe.listen(port, '127.0.0.1');
  });
}

const lockPath = (root, port) => join(root, `${port}.json`);

/** Every claim currently on record, oldest first. */
export function list(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try { return JSON.parse(readFileSync(join(root, f), 'utf8')); }
      catch { return null; }   // a half-written lock is no claim at all
    })
    .filter(Boolean)
    .sort((a, b) => a.port - b.port);
}

/**
 * A lane belongs to a worktree, so a claim whose worktree has been removed is
 * nobody's. That makes `git worktree remove` enough to clean up after an agent
 * that died without releasing.
 */
export function isStale(lane, { exists = existsSync } = {}) {
  return !exists(lane.worktree);
}

/** Drop every claim whose worktree is gone. Returns what it reclaimed. */
export function sweep(root, opts = {}) {
  const gone = list(root).filter((lane) => isStale(lane, opts));
  for (const lane of gone) rmSync(lockPath(root, lane.port), { force: true });
  return gone;
}

/**
 * Claim a lane for this worktree.
 *
 * Claiming is what makes a lane safe, not the arithmetic: the lock file is
 * created exclusively, so two agents racing for the same port cannot both win
 * it, and the ports are probed afterwards in case something outside the repo
 * already holds them.
 *
 * Claiming twice from the same worktree returns the same lane — re-running
 * this after a shell dies gives an agent its ports back rather than leaking a
 * second pair.
 */
export async function claim({
  root = laneRoot(),
  worktree = worktreeOf(),
  label = null,
  first = FIRST_PORT,
  last = LAST_PORT,
  free = portFree,
  exists = existsSync,
} = {}) {
  mkdirSync(root, { recursive: true });
  sweep(root, { exists });

  const held = list(root).find((lane) => lane.worktree === worktree);
  if (held) return held;

  for (let port = first; port <= last - 1; port += 2) {
    const lane = {
      lane: (port - first) / 2,
      port,
      webPort: port + 1,
      worktree,
      name: basename(worktree),
      label,
      claimedAt: new Date().toISOString(),
    };

    try {
      // 'wx' fails if the file is already there, which is the whole lock.
      writeFileSync(lockPath(root, port), JSON.stringify(lane, null, 2), { flag: 'wx' });
    } catch (err) {
      if (err.code === 'EEXIST') continue;
      throw err;
    }

    if ((await free(port)) && (await free(lane.webPort))) return lane;

    // Held by something that never took a lane — a stray dev server, another
    // project. Give the lock back and move on.
    rmSync(lockPath(root, port), { force: true });
  }

  throw new Error(`No free lane between ${first} and ${last}. Run \`node scripts/lane.mjs list\`.`);
}

/** Release this worktree's lane, or one named by port. Returns what it freed. */
export function release({ root = laneRoot(), worktree = worktreeOf(), port = null } = {}) {
  const lane = list(root).find((l) => (port ? l.port === Number(port) : l.worktree === worktree));
  if (!lane) return null;
  rmSync(lockPath(root, lane.port), { force: true });
  return lane;
}

/**
 * The environment a lane runs in, as shell exports.
 *
 * ORBIT_LANE is what tells the rest of the harness a lane is in force —
 * `playwright.config.js` reads it and refuses to reuse someone else's dev
 * server. Lane 0 stringifies to "0", which is truthy as a string; the unit
 * tests pin that, because it is exactly the sort of thing that silently
 * stops guarding anything.
 */
export function asEnv(lane) {
  return [
    `export ORBIT_LANE=${lane.lane}`,
    `export PORT=${lane.port}`,
    `export WEB_PORT=${lane.webPort}`,
    `export NO_OPEN=1`,
  ].join('\n');
}

/* ------------------------------------------------------------------ CLI -- */

const invokedDirectly = process.argv[1]?.endsWith('lane.mjs');

if (invokedDirectly) {
  const [command = 'claim', arg] = process.argv.slice(2);

  if (command === 'claim') {
    const lane = await claim({ label: arg ?? null });
    console.log(asEnv(lane));
    console.error(`  lane ${lane.lane} → api ${lane.port}, web ${lane.webPort}${lane.label ? ` (${lane.label})` : ''}`);
  } else if (command === 'release') {
    const lane = release({ port: arg ?? null });
    console.log(lane ? `  released lane ${lane.lane} (api ${lane.port})` : '  nothing to release');
  } else if (command === 'list') {
    const lanes = list(laneRoot());
    if (!lanes.length) console.log('  no lanes held');
    for (const lane of lanes) {
      const stale = isStale(lane) ? '  [stale]' : '';
      console.log(`  lane ${lane.lane}  api ${lane.port}  web ${lane.webPort}  ${lane.name}${lane.label ? `  ${lane.label}` : ''}${stale}`);
    }
  } else {
    console.error('usage: lane.mjs [claim <label> | release [port] | list]');
    process.exitCode = 1;
  }
}
