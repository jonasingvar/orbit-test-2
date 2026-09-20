/**
 * Put a screenshot (or a GIF) where a pull request body can show it.
 *
 *   node scripts/pr-media.mjs 42 .screenshots/before.png .screenshots/after.png
 *   → ![before](https://github.com/OWNER/REPO/raw/pr-media/pr-42-before.png)
 *   → ![after](https://github.com/OWNER/REPO/raw/pr-media/pr-42-after.png)
 *
 * Several files in one call, because the agent pays per step and a before and
 * an after are one thought, not two.
 *
 * A reviewer looking at a UI change wants to see the UI. GitHub only renders
 * an image it is hosting, and the web upload that normally provides that is a
 * browser drag-and-drop — no API, so an agent cannot use it.
 *
 * What it can do is commit the file. Images live on a `pr-media` branch that
 * is never merged and never branched from, so they are servable by URL
 * without appearing in anybody's diff or reaching `main`.
 *
 * On a private repository only github.com URLs render, because they carry the
 * reader's session. `raw.githubusercontent.com` returns 404 to a browser and
 * the image silently breaks, so this prints the `/raw/` form.
 *
 * This exists as a script rather than a few lines in the build skill because
 * an agent pays for every step it takes: one command that always works costs
 * less than four that have to be got right.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { basename, extname } from 'node:path';

const BRANCH = 'pr-media';

/**
 * Five is the most a reviewer will actually look at. Past that they scroll
 * past the lot and the evidence stops being evidence, so this refuses rather
 * than letting a run quietly bury the diff under screenshots.
 *
 * The limit is per pull request, not per call — it counts what this ticket
 * already has on the branch, so five calls of one do not slip past it.
 */
const MAX = 5;

const [issue, ...files] = process.argv.slice(2);
if (!issue || !files.length) {
  console.error('usage: pr-media.mjs <issue-number> <file> [file...]');
  process.exit(1);
}

for (const f of files) {
  if (!existsSync(f)) {
    console.error(`no such file: ${f}`);
    process.exit(1);
  }
}

const gh = (args, input) =>
  execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    // Probes below expect to fail; their 404 is an answer, not an error worth
    // printing over the markdown this writes to stdout.
    stdio: ['pipe', 'pipe', 'ignore'],
  }).trim();

/** OWNER/REPO, from the environment in a runner or from the remote locally. */
const repo = process.env.GITHUB_REPOSITORY
  ?? gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);

/** The branch has to exist before anything can be committed to it. */
function ensureBranch() {
  try {
    gh(['api', `repos/${repo}/git/refs/heads/${BRANCH}`, '--jq', '.object.sha']);
  } catch {
    const head = gh(['api', `repos/${repo}/git/refs/heads/main`, '--jq', '.object.sha']);
    gh(['api', `repos/${repo}/git/refs`, '-f', 'ref=refs/heads/' + BRANCH, '-f', `sha=${head}`, '--silent']);
  }
}

ensureBranch();

/** What this ticket already has up there, so the cap holds across calls. */
function alreadyOnBranch() {
  try {
    const listed = gh(['api', `repos/${repo}/contents?ref=${BRANCH}`, '--jq', '.[].name']);
    return new Set(listed.split('\n').filter((n) => n.startsWith(`pr-${issue}-`)));
  } catch {
    return new Set();
  }
}

const existing = alreadyOnBranch();
const wanted = new Set(files.map((f) => `pr-${issue}-${basename(f, extname(f))}${extname(f)}`));
const total = new Set([...existing, ...wanted]).size;

if (total > MAX) {
  console.error(
    `#${issue} would have ${total} images — at most ${MAX} per pull request` +
    (existing.size ? ` (${existing.size} already up: ${[...existing].join(', ')})` : '') +
    '. Pick the ones that show the change.',
  );
  process.exit(1);
}

for (const file of files) {
  const label = basename(file, extname(file));
  const name = `pr-${issue}-${label}${extname(file)}`;

  // Replacing an existing file needs its blob sha, so a re-run of the same
  // ticket updates the image rather than failing.
  let sha = null;
  try {
    sha = gh(['api', `repos/${repo}/contents/${name}?ref=${BRANCH}`, '--jq', '.sha']);
  } catch { /* first upload of this one */ }

  const args = [
    'api', '--method', 'PUT', `repos/${repo}/contents/${name}`,
    '-f', `message=Media for #${issue}`,
    '-f', `branch=${BRANCH}`,
    '--field', 'content=@-',
    '--jq', '.content.path',
  ];
  if (sha) args.splice(-2, 0, '-f', `sha=${sha}`);

  gh(args, readFileSync(file).toString('base64'));

  console.log(`![${label}](https://github.com/${repo}/raw/${BRANCH}/${name})`);
}
