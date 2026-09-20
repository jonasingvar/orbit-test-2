import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Harness for the API suite (`npm test`).
 *
 * These tests drive the real Express app over real HTTP against a real SQLite
 * file — just never *the* SQLite file. `server/db.js` takes its path from
 * `ORBIT_DB`, so every test file seeds its own throwaway database and can book,
 * release, check in and rate as destructively as it likes: no lane discipline,
 * no cleanup, and `data/orbit.db` is never opened.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Boot the app on an ephemeral port against this file's own database.
 * `ORBIT_DB` must be set before anything imports `server/db.js`, which is why
 * the import is dynamic and why nothing up top reaches into `server/`.
 */
export async function startApi() {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-api-'));
  const path = join(dir, 'orbit.db');
  // Seeding is deterministic and takes about a quarter of a second, and
  // `node --test` gives each file its own process, so they seed in parallel.
  execFileSync(process.execPath, [join(ROOT, 'server', 'seed.js')], {
    env: { ...process.env, ORBIT_DB: path },
    stdio: 'ignore',
  });
  process.env.ORBIT_DB = path;

  const { app } = await import('../../server/index.js');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  return {
    api: client(`http://127.0.0.1:${server.address().port}/api`),
    async close() {
      await new Promise((done) => server.close(done));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Minimal fetch wrapper: every call reports its status and its parsed body. */
export function client(base) {
  const send = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      // a string body goes out verbatim, so a test can post malformed JSON
      body: body === undefined || typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, type, text, body: type.includes('json') ? JSON.parse(text) : text };
  };

  return {
    get: (path) => send('GET', path),
    put: (path, body) => send('PUT', path, body),
    del: (path) => send('DELETE', path),
    /** The body of a GET that is expected to succeed. */
    async json(path) {
      const res = await send('GET', path);
      if (res.status !== 200) throw new Error(`GET ${path} → ${res.status} ${res.text}`);
      return res.body;
    },
  };
}

/** The four conference dates. Day 1 is whenever the database was seeded. */
export const days = async (api) => (await api.json('/bootstrap')).days.map((d) => d.date);

/** Do two sessions collide for one attendee? */
export const overlaps = (a, b) =>
  a.day === b.day && a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/** "10:15" shifted by minutes. Conference time is simulated, so tests state it. */
export function shiftTime(hhmm, mins) {
  const total = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + mins;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Empty an attendee's plan, seats and waitlist places alike. The seed gives
 * everyone a plan, and the overlap guard is per attendee, so a test that wants
 * to book freely starts by clearing the board.
 */
export async function clearAgenda(api, userId) {
  const { reservations } = await api.json(`/users/${userId}`);
  for (const r of reservations) await api.del(`/users/${userId}/reservations/${r.sessionId}`);
}

/** Every key in a payload, however deeply nested. */
export function keysDeep(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, found));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      found.add(key);
      keysDeep(v, found);
    }
  }
  return found;
}
