import './sandbox-db.js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { escape, fold } from '../../server/lib/ical.js';

const octets = (line) => Buffer.byteLength(line, 'utf8');
const lines = (folded) => folded.split('\r\n');

describe('iCalendar text escaping', () => {
  test('a semicolon and a comma are escaped, because they separate values', () => {
    assert.equal(escape('Agents, evals; and you'), 'Agents\\, evals\\; and you');
  });

  test('a backslash is escaped first, so an escape is never escaped twice', () => {
    assert.equal(escape('a \\ b'), 'a \\\\ b');
    assert.equal(escape('a \\; b'), 'a \\\\\\; b');
  });

  test('newlines become the literal \\n that consumers expect', () => {
    assert.equal(escape('one\ntwo'), 'one\\ntwo');
    assert.equal(escape('one\r\ntwo'), 'one\\ntwo');
  });

  test('a missing value becomes an empty property rather than "undefined"', () => {
    assert.equal(escape(), '');
  });

  test('ordinary text is passed through untouched', () => {
    assert.equal(escape('Platform Engineering · 45 min'), 'Platform Engineering · 45 min');
  });
});

describe('Lines fold at 75 octets', () => {
  test('a short line is left exactly as it was', () => {
    assert.equal(fold('SUMMARY:Keynote'), 'SUMMARY:Keynote');
  });

  test('a line of exactly 75 octets is not folded', () => {
    const line = 'X'.repeat(75);
    assert.equal(octets(line), 75);
    assert.equal(fold(line), line);
  });

  test('a longer line is split, with continuations starting with a single space', () => {
    const folded = lines(fold(`SUMMARY:${'A'.repeat(100)}`));
    assert.equal(folded.length, 2);
    assert.ok(folded.every((l) => octets(l) <= 75), 'every folded line fits in 75 octets');
    assert.equal(folded[1][0], ' ');
    assert.equal(folded.map((l, i) => (i ? l.slice(1) : l)).join(''), `SUMMARY:${'A'.repeat(100)}`);
  });

  test('folding counts octets, not characters, so a multi-byte title is measured honestly', () => {
    const title = `SUMMARY:${'é'.repeat(50)}`;
    const folded = lines(fold(title));
    assert.ok(folded.length > 1, 'a 100-octet title folds even though it is 58 characters');
    assert.ok(folded.every((l) => octets(l) <= 75));
  });

  test('a multi-byte character is never split across the fold', () => {
    for (const glyph of ['é', '·', '’', '🛰']) {
      const folded = fold(`SUMMARY:${glyph.repeat(60)}`);
      for (const line of lines(folded)) {
        assert.ok(!line.includes('�'), 'no replacement character');
        // Re-decoding each line as UTF-8 must give back what we wrote.
        assert.equal(Buffer.from(line, 'utf8').toString('utf8'), line);
      }
      assert.equal(lines(folded).map((l, i) => (i ? l.slice(1) : l)).join(''), `SUMMARY:${glyph.repeat(60)}`);
    }
  });

  test('a very long line folds as many times as it needs to', () => {
    const folded = lines(fold('DESCRIPTION:' + 'z'.repeat(500)));
    assert.ok(folded.length >= 7);
    assert.ok(folded.every((l) => octets(l) <= 75));
    assert.ok(folded.slice(1).every((l) => l.startsWith(' ')));
  });
});
