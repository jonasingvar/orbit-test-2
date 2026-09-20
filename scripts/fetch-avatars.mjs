/**
 * Download synthetic speaker portraits.
 *
 * Faces come from thispersondoesnotexist.com, which serves StyleGAN2 output:
 * every image is generated, so no real person is depicted and there are no
 * likeness rights to worry about. They are downloaded ONCE, downscaled, and
 * committed to the repo — the app never calls out to the network at runtime,
 * and a workshop room with bad wifi still works.
 *
 *   npm run avatars           # fill in whatever is missing
 *   npm run avatars -- 200    # target a different count
 *   npm run avatars -- --force  # re-download everything
 *
 * Speakers whose file is missing fall back to the generated SVG portrait,
 * so a partial run is harmless.
 */
import { mkdirSync, existsSync, writeFileSync, readdirSync, unlinkSync, readFileSync, rmdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'avatars');
const TMP_DIR = join(OUT_DIR, '.tmp');

const SOURCE = 'https://thispersondoesnotexist.com/random-person.jpeg';
const REFERER = 'https://thispersondoesnotexist.com/';
const SIZE = 256;     // plenty for a 96px avatar at 2× DPI
const GAP_MS = 900;   // the source regenerates on a timer — request too fast
                      // and it hands back the same face repeatedly

const args = process.argv.slice(2);
const force = args.includes('--force');
const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 180);

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });

const name = (i) => `speaker-${String(i).padStart(3, '0')}.jpg`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const todo = [];
for (let i = 1; i <= count; i++) {
  if (force || !existsSync(join(OUT_DIR, name(i)))) todo.push(i);
}

if (!todo.length) {
  console.log(`✓ ${count} portraits already present in public/avatars`);
  process.exit(0);
}
console.log(`→ fetching ${todo.length} portraits (${SIZE}px) …`);

let done = 0;
let failed = 0;

/** Content hashes we have already accepted, so no face appears twice. */
const seen = new Set();
for (const f of readdirSync(OUT_DIR).filter((f) => f.endsWith('.jpg'))) {
  seen.add(createHash('sha1').update(readFileSync(join(OUT_DIR, f))).digest('hex'));
}

async function fetchOne(i) {
  const tmp = join(TMP_DIR, name(i));
  const out = join(OUT_DIR, name(i));

  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(SOURCE, {
        headers: { 'User-Agent': 'orbit-conference-app/1.0 (workshop sample data)', Referer: REFERER },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 20_000) throw new Error(`suspiciously small (${buf.length}b)`);

      // The source serves whatever it generated most recently, so back-to-back
      // requests can return an identical face. Wait it out rather than
      // accepting a duplicate.
      const digest = createHash('sha1').update(buf).digest('hex');
      if (seen.has(digest)) throw new Error('duplicate face');
      seen.add(digest);

      writeFileSync(tmp, buf);
      // sips ships with macOS; on other platforms the full-size file is kept.
      try {
        execFileSync('sips', ['-Z', String(SIZE), '-s', 'formatOptions', '72', tmp, '--out', out], { stdio: 'ignore' });
      } catch {
        writeFileSync(out, buf);
      }
      unlinkSync(tmp);

      done++;
      if (done % 20 === 0 || done === todo.length) {
        console.log(`   ${done}/${todo.length}`);
      }
      return;
    } catch (err) {
      if (attempt === 6) {
        failed++;
        console.warn(`   ✗ ${name(i)}: ${err.message}`);
        return;
      }
      await sleep(err.message === 'duplicate face' ? 1500 : 1200 * attempt);
    }
  }
}

// Strictly sequential. Parallel requests get served the same cached face.
for (const i of todo) {
  await fetchOne(i);
  await sleep(GAP_MS);
}

try { readdirSync(TMP_DIR).forEach((f) => unlinkSync(join(TMP_DIR, f))); } catch {}
try { rmdirSync(TMP_DIR); } catch {}
const total = readdirSync(OUT_DIR).filter((f) => f.endsWith('.jpg')).length;
console.log(`✓ ${total} portraits in public/avatars${failed ? ` (${failed} failed — re-run to fill gaps)` : ''}`);
