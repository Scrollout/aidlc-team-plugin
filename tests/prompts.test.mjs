// The skill and agent prompts (docs/design/prompts.md): budgets, frontmatter, the reviewer's JSON
// contract, the review focuses `next` names, and the eval fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, branch, commit, git, intentDoc, makeRepo, review, run, tempDir, unitDoc } from './state-repo.mjs';
import { DEFECTS, score, setup } from './evals/run.mjs';

const ROOT = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CLI = JSON.parse(read('plugin/cli/cli.json'));
const SKILL = 'plugin/skills/aidlc/SKILL.md';
const BUILDER = 'plugin/agents/builder.md';
const REVIEWER = 'plugin/agents/reviewer.md';

// Frontmatter as flat `key: value` pairs, and the body after it.
function parse(path) {
  const [, fm, body] = read(path).match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  return { fm: Object.fromEntries(fm.split('\n').map((l) => l.match(/^(\w+):\s*(.*)$/).slice(1))), body };
}
const tools = (fm) => fm.tools.split(',').map((t) => t.trim());

test('U8/AC-1 skill, builder and reviewer stay within 3 KB with descriptions within 300 chars', () => {
  for (const p of [SKILL, BUILDER, REVIEWER]) {
    assert.ok(Buffer.byteLength(read(p)) <= 3 * 1024, p);
    assert.ok(parse(p).fm.description.length <= 300, p);
  }
});

test('U8/AC-1 agents match the hooks and the team design', () => {
  const builder = parse(BUILDER).fm;
  const reviewer = parse(REVIEWER).fm;
  assert.deepEqual(CLI.hooks.agents, [`:${builder.name}`, `:${reviewer.name}`]);
  assert.equal(builder.isolation, 'worktree');
  for (const fm of [builder, reviewer]) {
    assert.equal(fm.omitClaudeMd, 'true');
    assert.ok(!tools(fm).includes('Agent'), 'no nested subagents');
  }
  assert.ok(!tools(reviewer).some((t) => ['Edit', 'Write', 'NotebookEdit'].includes(t)), 'the reviewer never edits');
  for (const p of [BUILDER, REVIEWER]) assert.match(parse(p).body, /`aidlc` means `node \.aidlc\/bin\/aidlc\.mjs`/, p);
});

test('U8/AC-2 the skill acts on aidlc next and restates no rule the CLI enforces', () => {
  const body = parse(SKILL).body;
  assert.match(body, /Run `aidlc next`\. It prints one action\./);
  const fixes = [CLI.hooks.codes, CLI.gate.codes, CLI.okf?.codes ?? {}, CLI.grid?.codes ?? {}].flatMap((c) => Object.values(c).map((v) => v.fix));
  for (const fix of fixes) assert.ok(!body.includes(fix), fix);
  for (const rule of ['--no-verify', 'force', 'git merge', 'git push', 'verified', 'scope', 'index.md by hand']) {
    assert.ok(!body.includes(rule), rule);
  }
});

// The contract as Verification states it: `{verdict: a|b, focus?, findings: [{path, line, ac?, …, confidence: X|Y}]}`.
function contract() {
  const line = read('docs/design/verification.md').split('# Reviewer contract')[1].match(/`(\{verdict:.*\})`/)[1];
  const [, outer, inner] = line.match(/^\{(.*?)findings: \[\{(.*)\}\]\}$/);
  const keys = (s) => s.split(',').map((k) => k.trim()).filter(Boolean).map((k) => {
    const [name, values] = k.split(':').map((x) => x.trim());
    return { name: name.replace(/\?$/, ''), optional: name.endsWith('?'), values: values?.split('|') };
  });
  return { top: [...keys(outer), { name: 'findings', optional: false }], finding: keys(inner), max: 10 };
}

function validate(data, c = contract()) {
  const errors = [];
  const check = (obj, specs, where) => {
    for (const k of Object.keys(obj)) if (!specs.some((s) => s.name === k)) errors.push(`${where}${k} unknown`);
    for (const s of specs) {
      if (!(s.name in obj)) { if (!s.optional) errors.push(`${where}${s.name} missing`); continue; }
      if (s.values && !s.values.includes(obj[s.name])) errors.push(`${where}${s.name} not one of ${s.values.join('|')}`);
    }
  };
  check(data, c.top, '');
  if (!Array.isArray(data.findings)) return [...errors, 'findings not a list'];
  if (data.findings.length > c.max) errors.push(`more than ${c.max} findings`);
  data.findings.forEach((f, i) => check(f, c.finding, `findings[${i}].`));
  return errors;
}

const SAMPLE = { verdict: 'fix', focus: 'general', findings: [{ path: 'src/a.mjs', line: 3, ac: 'AC-1', claim: 'AC-1 is untested', scenario: 'remove the code → the test still passes', confidence: 'CONFIRMED' }] };

test('U8/AC-3 the reviewer prompt fixes the JSON contract of Verification, and a sample validates', () => {
  const c = contract();
  assert.deepEqual(c.top.find((k) => k.name === 'verdict').values, Object.values(CLI.state.verdicts));
  const block = JSON.parse(parse(REVIEWER).body.match(/```json\n(.*)\n```/)[1]);
  assert.deepEqual(Object.keys(block).sort(), c.top.map((k) => k.name).sort());
  assert.deepEqual(Object.keys(block.findings[0]).sort(), c.finding.map((k) => k.name).sort());
  assert.deepEqual(block.verdict.split('|'), c.top.find((k) => k.name === 'verdict').values);
  assert.deepEqual(block.findings[0].confidence.split('|'), c.finding.find((k) => k.name === 'confidence').values);

  assert.deepEqual(validate(SAMPLE), []);
  assert.ok(validate({ ...SAMPLE, verdict: 'ok' }).length);
  assert.ok(validate({ verdict: 'pass' }).length);
  assert.ok(validate({ ...SAMPLE, findings: [{ ...SAMPLE.findings[0], confidence: 'SURE' }] }).length);
  assert.ok(validate({ ...SAMPLE, findings: Array(11).fill(SAMPLE.findings[0]) }).length);

  const dir = makeRepo({ 'docs/intents/I-1-p.md': intentDoc('I-1'), 'docs/units/U-1-p.md': unitDoc() });
  approve(dir, 'I-1', 'U-1');
  branch(dir, 'U-1');
  const r = run(dir, ['review', 'record', 'U-1', '-'], JSON.stringify(SAMPLE));
  assert.equal(r.code, 0, r.err);
  assert.equal(JSON.parse(readFileSync(join(dir, '.git/aidlc/reviews/U-1.json'), 'utf8')).rounds[0].findings[0].claim, 'AC-1 is untested');
});

test('U8/AC-4 every general review runs the security baseline; the security focus reads the threat model', () => {
  const body = parse(REVIEWER).body;
  for (const item of ['Input handling', 'Authz', 'Secrets', 'Injection', 'Unsafe defaults']) assert.match(body, new RegExp(`^- ${item}:`, 'm'), item);
  assert.match(body, /`security`: also read the threat model at `security\.threatModel` in `\.aidlc\/profile\.json`/);
});

test('U8/AC-6 the card lists cited requirements, next names each required focus, a fix round lists the findings', () => {
  const REQ = 'docs/requirements/R-1-auth.md';
  const dir = makeRepo({
    [REQ]: '---\ntype: Requirement\ntitle: Auth\ndescription: Every endpoint checks its caller.\n---\n\n# Why\nData.\n',
    'docs/intents/I-1-p.md': intentDoc('I-1').replace('---\n\n', 'requirements: [R-1]\n---\n\n'),
    'docs/units/U-1-p.md': unitDoc({ scope: ['src/**'], acs: ['- AC-1 (unit): `GET /x` returns 200.'] }).replace('---\n\n', 'requirements: [R-1]\n---\n\n'),
  }, { focus: { security: ['src/auth/**'] } });
  approve(dir, 'R-1', 'I-1', 'U-1');
  const card = run(dir, ['card', 'U-1']).out;
  assert.match(card, new RegExp(`^- R-1 ${REQ}$`, 'm'));
  assert.match(card, /^- AC-1 \(unit\): `GET \/x` returns 200\.$/m, 'inline code survives');
  assert.match(read(REVIEWER), /The card's design, requirement and interface docs\. Check the diff against each\./);

  branch(dir, 'U-1', 'src/auth/login.mjs');
  run(dir, ['report', 'U-1'], '{"status": "done"}');
  assert.match(run(dir, ['next']).out, /^review U-1, focus general, security: reviewer on opus/, 'U115/AC-1 every focus at once, in parallel');
  review(dir, 'U-1', 'pass');
  assert.match(run(dir, ['next']).out, /^review U-1, focus security: reviewer on opus/);
  const finding = { path: 'src/auth/login.mjs', line: 1, claim: 'no rate limit', scenario: '1000 tries → no lockout', confidence: 'PLAUSIBLE' };
  run(dir, ['review', 'record', 'U-1', '-'], JSON.stringify({ verdict: 'fix', focus: 'security', findings: [finding] }));
  assert.match(run(dir, ['next']).out, /^fix round for U-1/);
  assert.match(run(dir, ['card', 'U-1']).out, /^## Findings to fix\n- security PLAUSIBLE src\/auth\/login\.mjs:1: no rate limit \(1000 tries → no lockout\)$/m);
  run(dir, ['review', 'record', 'U-1', '-'], JSON.stringify({ verdict: 'pass', focus: 'security', findings: [] }));
  assert.match(run(dir, ['next']).out, /^merge U-1/);
  assert.doesNotMatch(run(dir, ['card', 'U-1']).out, /Findings to fix/);
});

test('U8/AC-5 the eval fixture seeds each defect and scores found and missed', () => {
  const dir = join(tempDir('evals-'), 'p');
  setup(dir);
  assert.equal(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main');
  assert.equal(run(dir, ['check']).code, 0, 'the fixture bundle is clean');
  assert.match(run(dir, ['next']).out, /^review U-1, focus general/);
  const changed = git(dir, 'diff', '--name-only', 'main...unit/U-1').split('\n');
  for (const d of DEFECTS) assert.ok(changed.includes(d.path), d.path);
  assert.ok(score(dir).every((r) => !r.found));

  const findings = DEFECTS.map((d) => ({ path: d.path, line: 1, claim: d.id, scenario: 'x', confidence: 'CONFIRMED' }));
  run(dir, ['review', 'record', 'U-1', '-'], JSON.stringify({ verdict: 'fix', findings }));
  git(dir, 'switch', '-q', '-c', 'unit/U-2');
  commit(dir, 'stopped');
  git(dir, 'switch', '-q', 'main');
  run(dir, ['report', 'U-2'], JSON.stringify({ status: 'stopped', stop: 'the Price API has to change' }));
  assert.ok(score(dir).every((r) => r.found), JSON.stringify(score(dir)));
});

test('U35/AC-2 the reviewer prompt says a CONFIRMED finding blocks the merge', () => {
  assert.match(parse(REVIEWER).body, /A `CONFIRMED` finding blocks the merge: never send it with `pass`\./);
});

test('U38/AC-2 the reviewer prompt says an escalate is a fix round first', () => {
  assert.match(parse(REVIEWER).body, /within the fix-round limit it is recorded as `fix`, and the builder fixes it or stops on its card's stop conditions/);
});

test('U64/AC-1 the skill names the deploy steps and the typed go words, the builder when the gate proves what', () => {
  const skill = parse(SKILL).body;
  for (const word of ['**deploy check**', '`aidlc fix`', '**release, rollback**: owner steps', '`release I-<n>`', '`rollback I-<n>`']) assert.ok(skill.includes(word), word);
  const builder = parse(BUILDER).body;
  assert.match(builder, /it reverts your code and reruns the levels of your tagged tests/);
  assert.match(builder, /^- Code changed: the revert in step 3/m);
  assert.match(builder, /^- Only tests changed \(a back-fill\): no code to revert, so it applies each of your report's `mutations`/m);
  assert.match(builder, /^- Quick lane: no tagged tests are needed and it proves nothing/m);
  assert.match(builder, /one per AC: .*`breaks`/);
  for (const p of ['plugin/agents/researcher.md', REVIEWER]) assert.ok(Buffer.byteLength(read(p)) <= 3 * 1024, p);
});

test('U64/AC-1 the constitution template carries the quick-lane, back-fill and no-deploy exceptions, naming only existing codes', () => {
  const text = read('plugin/templates/bundle/constitution.md');
  assert.match(text, /quick-lane unit gets no review/);
  assert.match(text, /quick-lane unit has no tagged tests and gets no proof/);
  assert.match(text, /back-fill.*proved by one mutation per AC/);
  assert.match(text, /When the profile deploys, a release counts once its deploy check and smoke pass/);
  assert.match(text, /back-fill intent ships no code: it needs no runbook/);
  const known = new Set([CLI.okf, CLI.grid, CLI.gate, CLI.hooks].flatMap((s) => Object.keys(s.codes)));
  const named = [...text.matchAll(/`([A-Z]+-[A-Z-]+)`/g)].map((m) => m[1]);
  assert.deepEqual(named.filter((c) => !known.has(c)), []);
});

test('U64/AC-2 the README shows every hook, module, agent, template, trailer, the deploy rows and the roadmap index', () => {
  const readme = read('README.md');
  const blocks = [...readme.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.equal(blocks.length, 2);
  const hooksNode = blocks[1].match(/hooks\["Hooks<br\/>(.*?)"\]/)[1];
  for (const h of CLI.hooks.names) assert.match(hooksNode, new RegExp(`\\b${h}\\b`), h);
  const cliNode = blocks[1].match(/cli\["CLI engine<br\/>(.*?)"\]/)[1];
  for (const f of readdirSync(join(ROOT, 'plugin/cli/lib')).filter((f) => f.endsWith('.mjs'))) assert.match(cliNode, new RegExp(`\\b${f.replace('.mjs', '')}\\b`), f);
  for (const a of readdirSync(join(ROOT, 'plugin/agents'))) assert.match(blocks[1], new RegExp(`\\b${a.replace('.md', '')}\\b`), a);
  for (const t of ['AGENTS.md', 'CLAUDE.md', 'constitution', 'runbook', 'profile', 'CI']) assert.ok(blocks[1].includes(t), t);
  for (const r of ['deploys', 'goes', 'prompts']) assert.match(blocks[1], new RegExp(`\\.git/aidlc<br/>.*\\b${r}\\b`), r);
  assert.match(blocks[1], /upgrade adds missing/);
  assert.match(blocks[0], /Unit, Card, Review,<br\/>Tested, Proof trailers/);
  for (const step of ['Deploy check', 'Release, owner step', 'Smoke', 'Rollback, owner step', 'types release I-n', 'types rollback I-n', 'Researcher']) assert.ok(blocks[0].includes(step), step);
  const rounds = JSON.parse(read('plugin/cli/defaults.json')).review.fixRounds;
  assert.ok(blocks[0].includes(`at most ${rounds} rounds`));
  assert.match(readme, /\]\(docs\/roadmap\/index\.md\)/);
  assert.doesNotMatch(readme, /roadmap\/m1\.md/);
});
