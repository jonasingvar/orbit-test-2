/**
 * Turn Playwright's JSON report into the run summary GitHub shows on the
 * Actions page — so a green run says what it actually proved, and a red one
 * names the failures without anyone opening the log.
 *
 *   node scripts/ci-summary.mjs desktop >> "$GITHUB_STEP_SUMMARY"
 */
import { readFileSync } from 'node:fs';

const project = process.argv[2] ?? 'all';
const REPORT = 'test-results/results.json';

let report;
try {
  report = JSON.parse(readFileSync(REPORT, 'utf8'));
} catch {
  console.log(`### ${project}\n\nNo test report at \`${REPORT}\` — the suite did not get as far as running.`);
  process.exit(0);
}

/**
 * The JSON report nests suites inside suites: file, then each describe block.
 * Carry the describe titles down so a failure reads the way it does in the
 * terminal rather than as a bare test name.
 */
function* specsIn(suite, path = []) {
  const here = suite.title && suite.title !== suite.file ? [...path, suite.title] : path;
  for (const spec of suite.specs ?? []) yield { spec, path: here };
  for (const child of suite.suites ?? []) yield* specsIn(child, here);
}

const specs = (report.suites ?? []).flatMap((s) => [...specsIn(s)]);
const results = specs.map(({ spec, path }) => {
  const test = spec.tests?.[0];
  const last = test?.results?.[test.results.length - 1];
  return {
    title: [...path, spec.title].join(' › '),
    file: spec.file,
    line: spec.line,
    status: test?.status ?? last?.status ?? 'unknown', // 'expected' | 'unexpected' | 'flaky' | 'skipped'
    ms: last?.duration ?? 0,
  };
});

const count = (status) => results.filter((r) => r.status === status).length;
const passed = count('expected');
const flaky = count('flaky');
const skipped = count('skipped');
const failed = results.filter((r) => r.status === 'unexpected');
const seconds = ((report.stats?.duration ?? 0) / 1000).toFixed(1);
const icon = failed.length ? '❌' : flaky ? '⚠️' : '✅';

const files = [...new Set(results.map((r) => r.file))].length;

console.log(`### ${icon} Playwright · ${project}\n`);
console.log('| Passed | Failed | Flaky | Skipped | Files | Time |');
console.log('| ---: | ---: | ---: | ---: | ---: | ---: |');
console.log(`| ${passed} | ${failed.length} | ${flaky} | ${skipped} | ${files} | ${seconds}s |`);

if (failed.length) {
  console.log(`\n**Failed**\n`);
  for (const f of failed) console.log(`- \`${f.file}:${f.line}\` — ${f.title}`);
  console.log(`\nThe HTML report and traces are attached to this run as \`playwright-report-${project}\`.`);
}
