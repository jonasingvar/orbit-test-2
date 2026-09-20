import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claim, release, list, sweep, isStale, asEnv, FIRST_PORT } from '../../scripts/lane.mjs';

/**
 * The lane allocator is what keeps ten agents off each other's ports, so the
 * interesting cases are the ones that only happen when two of them run at
 * once: a race for the same pair, a worktree that died holding a lane, a port
 * taken by something that never claimed one.
 *
 * Ports are never actually opened here — `free` is injected — so these run in
 * milliseconds and cannot fail because of what else is on the machine.
 */

let root;
const tree = (name) => `/tmp/worktrees/${name}`;
const allFree = async () => true;

/** Only the named worktrees still exist on disk. */
const onlyTheseExist = (...names) => (path) => names.map(tree).includes(path);

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'orbit-lanes-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const claimFor = (name, opts = {}) =>
  claim({ root, worktree: tree(name), free: allFree, exists: onlyTheseExist(name), ...opts });

describe('claiming a lane', () => {
  test('the first claim gets the first pair, API below web', async () => {
    const lane = await claimFor('wt-a');
    assert.equal(lane.lane, 0);
    assert.equal(lane.port, FIRST_PORT);
    assert.equal(lane.webPort, FIRST_PORT + 1);
  });

  test('a second worktree gets the next pair, not the same one', async () => {
    const a = await claimFor('wt-a');
    const b = await claim({ root, worktree: tree('wt-b'), free: allFree, exists: onlyTheseExist('wt-a', 'wt-b') });

    assert.equal(b.lane, 1);
    assert.equal(b.port, a.port + 2);
    assert.notEqual(a.port, b.port);
    assert.notEqual(a.webPort, b.port);   // the pairs must not interleave
  });

  test('claiming twice from one worktree returns the same lane', async () => {
    const first = await claimFor('wt-a');
    const again = await claimFor('wt-a');

    assert.deepEqual(again, first);
    assert.equal(list(root).length, 1, 'a re-claim must not leak a second pair');
  });

  test('a pair whose ports are taken is skipped, and the lock is handed back', async () => {
    // Something outside the repo holds 4300/4301 without ever claiming a lane.
    const free = async (port) => port > FIRST_PORT + 1;
    const lane = await claimFor('wt-a', { free });

    assert.equal(lane.port, FIRST_PORT + 2);
    assert.equal(list(root).length, 1, 'the rejected pair must not stay locked');
  });

  test('it refuses rather than handing out a pair it cannot verify', async () => {
    await assert.rejects(
      () => claimFor('wt-a', { free: async () => false }),
      /No free lane/,
    );
  });

  test('a lane records the label it was claimed for', async () => {
    const lane = await claimFor('wt-a', { label: '42' });
    assert.equal(lane.label, '42');
    assert.equal(list(root)[0].label, '42');
  });
});

describe('a worktree that died holding a lane', () => {
  test('its claim is stale once the worktree is gone', async () => {
    const lane = await claimFor('wt-gone');
    assert.equal(isStale(lane, { exists: onlyTheseExist('wt-gone') }), false);
    assert.equal(isStale(lane, { exists: onlyTheseExist() }), true);
  });

  test('the next claim reclaims the abandoned pair', async () => {
    const dead = await claimFor('wt-gone');

    // `git worktree remove` took the directory; the lock is still on disk.
    const next = await claim({ root, worktree: tree('wt-new'), free: allFree, exists: onlyTheseExist('wt-new') });

    assert.equal(next.port, dead.port, 'the freed pair should be reused before a fresh one');
    assert.equal(list(root).length, 1);
    assert.equal(list(root)[0].worktree, tree('wt-new'));
  });

  test('sweeping reports what it reclaimed and leaves live lanes alone', async () => {
    await claimFor('wt-live');
    await claim({ root, worktree: tree('wt-gone'), free: allFree, exists: onlyTheseExist('wt-live', 'wt-gone') });

    const reclaimed = sweep(root, { exists: onlyTheseExist('wt-live') });

    assert.equal(reclaimed.length, 1);
    assert.equal(reclaimed[0].worktree, tree('wt-gone'));
    assert.deepEqual(list(root).map((l) => l.worktree), [tree('wt-live')]);
  });

  test('a half-written lock is ignored rather than crashing the listing', async () => {
    await claimFor('wt-a');
    writeFileSync(join(root, '4390.json'), '{ "port": 439');

    assert.equal(list(root).length, 1);
  });
});

describe('releasing', () => {
  test('a released pair is handed to the next claimant', async () => {
    const a = await claimFor('wt-a');
    assert.equal(release({ root, worktree: tree('wt-a') }).port, a.port);
    assert.equal(list(root).length, 0);

    const b = await claim({ root, worktree: tree('wt-b'), free: allFree, exists: onlyTheseExist('wt-b') });
    assert.equal(b.port, a.port);
  });

  test('releasing by port frees another worktree\'s lane', async () => {
    const a = await claimFor('wt-a');
    assert.equal(release({ root, worktree: tree('wt-b'), port: a.port }).worktree, tree('wt-a'));
    assert.equal(list(root).length, 0);
  });

  test('releasing nothing is not an error', () => {
    assert.equal(release({ root, worktree: tree('wt-none') }), null);
  });
});

describe('the environment a lane exports', () => {
  test('it names every port the app and the suite read', async () => {
    const env = asEnv(await claimFor('wt-a'));

    assert.match(env, /^export ORBIT_LANE=0$/m);
    assert.match(env, new RegExp(`^export PORT=${FIRST_PORT}$`, 'm'));
    assert.match(env, new RegExp(`^export WEB_PORT=${FIRST_PORT + 1}$`, 'm'));
    assert.match(env, /^export NO_OPEN=1$/m, 'ten lanes must not open ten browser windows');
  });

  test('lane 0 still counts as a lane', async () => {
    // playwright.config.js guards on `!process.env.ORBIT_LANE`. The value
    // arrives as the string "0", which is truthy — if this ever became a
    // number, lane 0 would quietly go back to reusing another worktree's app.
    const { lane } = await claimFor('wt-a');
    assert.equal(lane, 0);
    assert.ok(String(lane), 'ORBIT_LANE must be truthy for every lane, including the first');
  });

  test('it does not pin ORBIT_DB, because each worktree seeds its own', async () => {
    assert.doesNotMatch(asEnv(await claimFor('wt-a')), /ORBIT_DB/);
  });
});
