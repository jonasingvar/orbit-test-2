/**
 * Turn the JUnit file from `node --test` into the run summary GitHub shows on
 * the Actions page, so the fast suite reports like the Playwright ones do.
 *
 *   node scripts/ci-summary-node.mjs >> "$GITHUB_STEP_SUMMARY"
 */
import { readFileSync } from 'node:fs';

const REPORT = 'test-results/node-tests.xml';

let xml;
try {
  xml = readFileSync(REPORT, 'utf8');
} catch {
  console.log(`### Unit + API\n\nNo report at \`${REPORT}\` — the suite did not get as far as running.`);
  process.exit(0);
}

const attr = (tag, name) => Number(tag.match(new RegExp(`${name}="([\\d.]+)"`))?.[1] ?? 0);
const suites = xml.match(/<testsuite [^>]*>/g) ?? [];

const total = (name) => suites.reduce((n, s) => n + attr(s, name), 0);
const tests = total('tests');
const failures = total('failures') + total('errors');
const skipped = total('skipped');
const seconds = total('time').toFixed(1);

// One line per failing case, with the suite it belongs to.
const failed = [];
for (const suite of xml.split('<testsuite ').slice(1)) {
  const name = suite.match(/name="([^"]*)"/)?.[1] ?? '';
  for (const testcase of suite.split('<testcase ').slice(1)) {
    if (!testcase.includes('<failure') && !testcase.includes('<error')) continue;
    failed.push(`${name} › ${testcase.match(/name="([^"]*)"/)?.[1] ?? ''}`);
  }
}

console.log(`### ${failures ? '❌' : '✅'} Unit + API\n`);
console.log('| Passed | Failed | Skipped | Suites | Time |');
console.log('| ---: | ---: | ---: | ---: | ---: |');
console.log(`| ${tests - failures - skipped} | ${failures} | ${skipped} | ${suites.length} | ${seconds}s |`);

if (failed.length) {
  console.log('\n**Failed**\n');
  for (const f of failed) console.log(`- ${f}`);
}
