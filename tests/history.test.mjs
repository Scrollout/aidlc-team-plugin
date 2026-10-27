// Tracked files state rules and reasons in general terms and carry no session history: no other tools, no trial
// projects, no person's words, no dated accounts (docs/design/standards.md#rationale).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const RULES = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/history.json'), 'utf8'));
// The owner's private names, kept outside the repo; CI has none.
const privateFile = join(ROOT, RULES.private);
const words = existsSync(privateFile) ? JSON.parse(readFileSync(privateFile, 'utf8')).terms : [];
const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const regex = (p) => (p.startsWith('(?i)') ? new RegExp(p.slice(4), 'i') : new RegExp(p));
const patterns = [...RULES.patterns, ...words.map((w) => ({ match: `\\b${escape(w)}\\b` }))].map((p) => ({ re: regex(p.match), in: p.in }));
const applies = (p, f) => !p.in || p.in.some((x) => f.startsWith(x));

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean)
  .filter((f) => RULES.extensions.some((x) => f.endsWith(x)) && !RULES.skip.some((s) => f.startsWith(s)) && existsSync(join(ROOT, f)));

test('tracked files carry no session history', () => {
  const found = tracked.flatMap((f) => readFileSync(join(ROOT, f), 'utf8').split('\n').flatMap((l, k) => patterns.filter((p) => applies(p, f) && p.re.test(l)).map((p) => `${f}:${k + 1} ${l.match(p.re)[0]}`)));
  assert.deepEqual(found, []);
});
