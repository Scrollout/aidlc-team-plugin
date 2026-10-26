// The gate tests' project: an approved, carded, built and reviewed U-1, shared by the gate test files.
import assert from 'node:assert/strict';
import { approve, commit, git, intentDoc, makeRepo, review, run, unitDoc } from './state-repo.mjs';

export const OK = 'node -e "process.exit(0)"';
export const FAIL = 'node -e "process.exit(1)"';
// Fails only once the unit's code is in: a level FAIL fails on the base too, which is GATE-BASE (U114).
export const FAIL_MERGED = 'node -e "process.exit(require(\'fs\').existsSync(\'src/add.mjs\') ? 1 : 0)"';
export const U1 = 'docs/units/U-1-add.md';
export const PROFILE = {
  levels: { unit: { paths: ['tests/**'], run: 'node --test' } },
  modules: [{ id: 'core', kind: 'domain', paths: ['src/**'], check: OK, api: ['src/**'] }],
  architecture: { data: { prefix: 'data/' }, acyclic: true }, // the slice architecture every project gets (U105)
  lanes: { quick: ['docs/**'], full: ['db/**'] },
  focus: { security: ['auth/**'] },
  security: { content: ['password'], check: [OK] },
};
export const CODE = { 'src/add.mjs': 'export const add = (a, b) => a + b;\n' };
export const TEST = { 'tests/add.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { add } from '../src/add.mjs';\ntest('U-1/AC-1 adds', () => assert.equal(add(1, 2), 3));\n" };
export const LOG = { 'docs/log.md': '---\ntype: Log\ntitle: History\n---\n\n# History\n\n## 2026-01-01\n\n- **Creation** docs.\n' };

// A repo with an approved, carded, built and reviewed U-1; `opts` change one thing.
export function setup({ profile = PROFILE, unit = {}, files = { ...CODE, ...TEST }, verdict = 'pass', beforeReview } = {}) {
  const dir = makeRepo({
    ...LOG,
    'docs/intents/I-1-math.md': intentDoc('I-1', 'Math'),
    [U1]: unitDoc({ scope: ['src/**', 'tests/**'], modules: ['core'], acs: ['- AC-1 (unit): adds two numbers.'], ...unit }),
  }, profile);
  approve(dir, 'I-1', 'U-1');
  assert.equal(run(dir, ['card', 'U-1']).code, 0);
  git(dir, 'switch', '-q', '-c', 'unit/U-1');
  commit(dir, 'build U-1', files);
  git(dir, 'switch', '-q', 'main');
  beforeReview?.(dir);
  if (verdict) review(dir, 'U-1', verdict);
  return dir;
}
export const merge = (dir) => run(dir, ['merge', 'U-1']);
export const codes = (r) => [...new Set([...r.out.matchAll(/^\S+:\d+ (\S+) /gm)].map((m) => m[1]))];
