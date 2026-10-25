import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIndexes, checkBundle, parseYaml, writeIndexes } from '../plugin/cli/lib/okf.mjs';
import { tempDir } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const SPEC = join(ROOT, 'tests/fixtures/okf/spec');
const OFFICIAL = join(ROOT, 'tests/fixtures/okf/official');
const CLI = join(ROOT, 'plugin/cli/aidlc.mjs');
const errors = (findings) => findings.filter((f) => f.level === 'error');
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

function bundle(files) {
  const dir = tempDir('okf-');
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

for (const name of readdirSync(SPEC).filter((n) => n.startsWith('OKF-'))) {
  const code = name.match(/^OKF-[A-Z]+/)[0];
  test(`U2/AC-1 ${code} fires on its fixture ${name} and nothing else errs`, () => {
    const found = errors(checkBundle(join(SPEC, name), { base: SPEC }));
    assert.ok(found.length > 0, `${code} did not fire`);
    assert.deepEqual([...new Set(found.map((f) => f.code))], [code], JSON.stringify(found));
  });
}

test('U2/AC-1 a bundle with no indexes and a broken link is spec-conformant', () => {
  const found = checkBundle(join(SPEC, 'conformant'), { base: SPEC });
  assert.deepEqual(errors(found), []);
  assert.ok(found.some((f) => f.code === 'HOUSE-LINK'));
  assert.ok(found.some((f) => f.code === 'HOUSE-INDEX-STALE'));
});

test('U2/AC-1 every spec error code has a fixture', () => {
  const codes = Object.entries(JSON.parse(readFileSync(join(ROOT, 'plugin/cli/cli.json'), 'utf8')).okf.codes)
    .filter(([code, c]) => code.startsWith('OKF-') && !c.house).map(([code]) => code);
  for (const code of codes) assert.ok(readdirSync(SPEC).some((n) => n.startsWith(code)), `${code} has no fixture`);
});

test('U2/AC-1 YAML subset reads what PyYAML reads', () => {
  assert.deepEqual(parseYaml('a: |\n  one\n  two\nb: >\n  folded\n  text\nc: [1, {x: y}]\nd: plain\n  continued'),
    { a: 'one\ntwo\n', b: 'folded text\n', c: [1, { x: 'y' }], d: 'plain continued' });
  assert.deepEqual(parseYaml("list:\n- a\n- b: 1\n  c: 2\nq: 'it''s'\nn: ~\ny: yes\no: 010"),
    { list: ['a', { b: 1, c: 2 }], q: "it's", n: null, y: true, o: 8 });
  assert.deepEqual(parseYaml('w: 12\np: 100\nh: 0x1f\nz: 0'), { w: 12, p: 100, h: 31, z: 0 }, 'only a leading 0 is octal');
  assert.deepEqual(parseYaml('at: 2026-07-10T21:14:56Z\nby: human:me@x'), { at: '2026-07-10T21:14:56Z', by: 'human:me@x' });
  for (const bad of ['a: b: c', 'a: [1', 'a: "open', 'a: @x', 'a: 1\n  b: 2', 'a: &x 1']) {
    assert.throws(() => parseYaml(bad), /line \d+/, bad);
  }
});

test('U2/AC-2 house rules follow profile.docs.rules; a rule set to error exits 1', () => {
  const docs = { 'kb/a.md': '---\ntype: Note\ngenerated: { by: x/1, at: 2026-01-01T00:00:00Z }\n---\n' };
  const plain = bundle(docs);
  let r = run(plain, 'check', 'kb');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /kb\/a\.md:1 HOUSE-DESC missing title, description → /);

  const strict = bundle({ ...docs, '.aidlc/profile.json': JSON.stringify({ docs: { bundle: 'kb', rules: { 'HOUSE-DESC': 'error' } } }) });
  r = run(strict, 'check');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /HOUSE-DESC/);

  const off = bundle({ ...docs, '.aidlc/profile.json': JSON.stringify({ docs: { bundle: 'kb', rules: { 'HOUSE-DESC': 'off', 'HOUSE-INDEX-STALE': 'off' } } }) });
  r = run(off, 'check');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');

  const fixed = bundle({ ...docs, '.aidlc/profile.json': JSON.stringify({ docs: { bundle: 'kb', rules: { 'OKF-FM': 'off', 'HOUSE-LINK': 'loud' } } }) });
  r = run(fixed, 'check');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\.aidlc\/profile\.json:1 PROFILE-RULE docs\.rules\.OKF-FM: spec codes cannot be changed/);
  assert.match(r.stdout, /PROFILE-RULE docs\.rules\.HOUSE-LINK: level must be/);
});

test('U75/AC-3 check warns PROFILE-KEY for a top-level or security key nothing reads, in the project and personal layers', () => {
  const docs = { 'kb/a.md': '---\ntype: Note\ntitle: A\ndescription: A.\ngenerated: { by: x/1, at: 2026-01-01T00:00:00Z }\n---\n' };
  const dir = bundle({ ...docs, '.aidlc/profile.json': JSON.stringify({ docs: { bundle: 'kb' }, security: { patterns: ['x'], content: ['y'] }, colour: 'red' }), '.aidlc/local/profile.json': JSON.stringify({ run: { mode: 'attended' }, tempo: 1 }) });
  const r = run(dir, 'check');
  assert.equal(r.status, 0, 'a warning');
  const lines = r.stdout.split('\n').filter((l) => l.includes('PROFILE-KEY'));
  assert.deepEqual(lines, [
    '.aidlc/profile.json:1 PROFILE-KEY colour is read by nothing in the plugin → remove it, or use the key the profile doc names for what you meant',
    '.aidlc/profile.json:1 PROFILE-KEY security.patterns is read by nothing in the plugin → remove it, or use the key the profile doc names for what you meant',
    '.aidlc/local/profile.json:1 PROFILE-KEY tempo is read by nothing in the plugin → remove it, or use the key the profile doc names for what you meant',
  ]);
});

test('U2/AC-2 check on one file reports only that file; bad usage exits 64', () => {
  const dir = bundle({ 'docs/a.md': '# none\n', 'docs/b.md': '# none\n' });
  const r = run(dir, 'check', 'docs/a.md');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /docs\/a\.md:1 OKF-FM/);
  assert.doesNotMatch(r.stdout, /b\.md/);
  assert.equal(run(dir, 'check', 'nope.md').status, 64);
  assert.equal(run(dir, 'check', '--bogus').status, 64);
});

test('U2/AC-3 size caps follow the doc type', () => {
  const doc = (type, size) => {
    const head = `---\ntype: ${type}\ntitle: T\ndescription: D.\ngenerated: { by: x/1, at: 2026-01-01T00:00:00Z }\n---\n`;
    return head + 'x'.repeat(size - head.length);
  };
  const sizes = (files) => checkBundle(bundle(files)).filter((f) => f.code === 'HOUSE-SIZE').map((f) => f.path.split('/').pop()).sort();
  assert.deepEqual(sizes({
    'design-ok.md': doc('Design', 6000), 'design-over.md': doc('Design', 6001),
    'unit-ok.md': doc('Unit', 12000), 'unit-over.md': doc('Unit', 12001),
    'plan-ok.md': doc('Plan', 9000), 'decision-over.md': doc('Decision', 6001),
    'metric-ok.md': doc('Metric', 4000), 'metric-over.md': doc('Metric', 4001),
    'research-ok.md': doc('Research', 6000), 'research-over.md': doc('Research', 6001), // U103/AC-1
    'principles-ok.md': doc('Principles', 6000), 'principles-over.md': doc('Principles', 6001), // U106/AC-2
  }), ['decision-over.md', 'design-over.md', 'metric-over.md', 'principles-over.md', 'research-over.md', 'unit-over.md']);
});

test('U92/AC-1 docs.caps sets the caps by type, with default for the rest', () => {
  const doc = (type, size) => {
    const head = `---\ntype: ${type}\ntitle: T\ndescription: D.\ngenerated: { by: x/1, at: 2026-01-01T00:00:00Z }\n---\n`;
    return head + 'x'.repeat(size - head.length);
  };
  const root = bundle({ 'unit.md': doc('Unit', 4001), 'design.md': doc('Design', 3001), 'metric.md': doc('Metric', 3001) });
  const sizes = (caps) => checkBundle(root, { caps }).filter((f) => f.code === 'HOUSE-SIZE').map((f) => f.path.split('/').pop()).sort();
  assert.deepEqual(sizes({ default: 4000 }), ['unit.md']);
  assert.deepEqual(sizes({ default: 4000, Design: 3000 }), ['design.md', 'unit.md']);
  assert.deepEqual(sizes({ Metric: 3000 }), ['metric.md']);
});

test('U95/AC-1 check fails a malformed naming rule', () => {
  const dir = tempDir('names-');
  spawnSync('git', ['init', '-q'], { cwd: dir });
  mkdirSync(join(dir, '.aidlc'));
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, '.aidlc/profile.json'), JSON.stringify({ names: [{ id: 'a', files: ['x/**'], find: '(', pattern: 'y' }, { id: 'b', files: [] }, { id: 'c', files: ['x/**'], find: 'v (\\w+)', pattern: '[a-z]+' }] }));
  const r = spawnSync(process.execPath, [join(import.meta.dirname, '../plugin/cli/aidlc.mjs'), 'check'], { cwd: dir, encoding: 'utf8' });
  assert.match(r.stdout + r.stderr, /PROFILE-NAMES names rule a: find or pattern is no valid regex/);
  assert.match(r.stdout + r.stderr, /PROFILE-NAMES names rule b needs id, files and pattern/);
  assert.doesNotMatch(r.stdout + r.stderr, /names rule c/);
  writeFileSync(join(dir, '.aidlc/profile.json'), JSON.stringify({ modules: [{ id: 'core', paths: ['src/**'], api: ['src/**'] }], architecture: { data: { prefix: 'data/' }, acyclic: true } }));
  const none = spawnSync(process.execPath, [join(import.meta.dirname, '../plugin/cli/aidlc.mjs'), 'check'], { cwd: dir, encoding: 'utf8' });
  assert.match(none.stdout + none.stderr, /PROFILE-NAMES the profile has modules but no names rule/, 'U96/AC-2');
  assert.equal(none.status, 0, 'a warning');
});

test('U105/AC-1 a profile with modules fails without data ownership (a warning once adopted) and warns without acyclic or an api', () => {
  const dir = tempDir('arch-');
  spawnSync('git', ['init', '-q'], { cwd: dir });
  mkdirSync(join(dir, '.aidlc'));
  mkdirSync(join(dir, 'docs'));
  const check = (profile) => { writeFileSync(join(dir, '.aidlc/profile.json'), JSON.stringify({ names: [{ id: 'x', files: ['src/**'], pattern: '.+' }], ...profile })); return spawnSync(process.execPath, [join(import.meta.dirname, '../plugin/cli/aidlc.mjs'), 'check'], { cwd: dir, encoding: 'utf8' }); };
  const modules = [{ id: 'core', paths: ['src/**'] }];
  const bare = check({ modules });
  assert.equal(bare.status, 1);
  assert.match(bare.stdout, /PROFILE-ARCH the profile has modules but no data ownership/);
  assert.match(bare.stdout, /PROFILE-ARCH the profile has modules but architecture\.acyclic is off/);
  assert.match(bare.stdout, /PROFILE-ARCH modules without an api surface: core/);
  assert.equal(check({ modules, adopted: 'abc' }).status, 0, 'adopted: a warning until the migration sets owners');
  const full = check({ modules: [{ ...modules[0], api: ['src/api/**'] }], architecture: { data: { prefix: 'data/' }, acyclic: true } });
  assert.equal(full.status, 0);
  assert.doesNotMatch(full.stdout, /PROFILE-ARCH/);
  assert.doesNotMatch(check({}).stdout, /PROFILE-ARCH/, 'no modules yet');
});

for (const name of ['ga4', 'stackoverflow', 'crypto_bitcoin']) {
  test(`U2/AC-4 aidlc index reproduces the official ${name} indexes byte for byte`, () => {
    const dir = tempDir(`okf-${name}-`);
    cpSync(join(OFFICIAL, name), dir, { recursive: true });
    const indexes = [...buildIndexes(dir).keys()].map((d) => join(d, 'index.md'));
    const originals = new Map(indexes.map((f) => [f, readFileSync(f, 'utf8')]));
    assert.ok(indexes.length > 1);

    // Keep only the subdirectory lines (the LLM-written part the generator keeps); everything else is rebuilt.
    for (const f of indexes) {
      writeFileSync(f, originals.get(f).split('\n').filter((l) => /^\* \[[^\]]+\]\([^)]+\/index\.md\)/.test(l)).join('\n'));
    }
    const r = run(dir, 'index', '.');
    assert.equal(r.status, 0, r.stderr);
    for (const f of indexes) assert.equal(readFileSync(f, 'utf8'), originals.get(f), f);
    assert.deepEqual(writeIndexes(dir), [], 'a second run writes nothing');
  });
}

for (const name of ['acme_retail', 'ga4', 'stackoverflow', 'crypto_bitcoin']) {
  test(`U2/AC-5 the official ${name} bundle has zero errors`, () => {
    assert.deepEqual(errors(checkBundle(join(OFFICIAL, name))), []);
  });
}

test("U2/AC-6 this repo's docs pass with HOUSE-INDEX-STALE as an error", () => {
  assert.deepEqual(errors(checkBundle(join(ROOT, 'docs'), { rules: { 'HOUSE-INDEX-STALE': 'error' } })), []);
});
