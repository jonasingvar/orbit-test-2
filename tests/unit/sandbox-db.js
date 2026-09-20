import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Point `server/db.js` at a throwaway database file.
 *
 * Server modules open the database when they are imported — some of them
 * prepare statements at module scope — so a unit test that imports one would
 * otherwise reach into `data/orbit.db` and depend on a seed having run. This
 * must be imported *before* anything under `server/`, because `db.js` reads
 * `ORBIT_DB` once, as it is evaluated.
 *
 * Kept synchronous on purpose: a top-level `await` here would not be settled
 * before the sibling imports in a test file are evaluated.
 */
const dir = mkdtempSync(join(tmpdir(), 'orbit-unit-'));

process.env.ORBIT_DB = join(dir, 'unit.db');
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
