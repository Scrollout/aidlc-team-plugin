// M18: a deterministic Inception (docs/design/inception.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashDoc, lintPlan, parseDoc } from '../plugin/cli/lib/index.mjs';
import { approve, commit, makeRepo, read, run } from './state-repo.mjs';

const V2 = { system: { core: ['src/**'] }, naming: { tokens: { system: 'shop' } }, modules: [
  { id: 'quotas', kind: 'domain', paths: ['src/quotas/**'] }, { id: 'deployments', kind: 'domain', paths: ['src/deployments/**'] },
  { id: 'orchestration', kind: 'pipeline', paths: ['src/orchestration/**'] }, { id: 'database', kind: 'foundation', paths: ['src/database/**'] },
] };
// Method 5: these intents predate the request and its sources (method 6, tests/intake.test.mjs).
const intent = (fm, body = '') => `---\ntype: Intent\ntitle: Backbone\ndescription: The backbone.\nmethod: 5\n${fm}---\n\n# Goal\nx\n${body}`;
const domain = (code, extra = '') => `---\ntype: Domain\ntitle: ${code}\ndescription: ${code}.\ncode: ${code}\nkind: domain\n---\n\n# Glossary\n- **operation**: ${code === 'quotas' ? 'a counted use of a limit' : 'one deployment step'}\n\n# Owns\n- \`${code}.ledger\`: rows\n${extra}`;
const decision = (n, fm, title = `Decision ${n}`) => [`docs/decisions/${String(n).padStart(4, '0')}-decision-${n}.md`, `---\ntype: Decision\ntitle: ${String(n).padStart(4, '0')} ${title}\ndescription: d.\n${fm}---\n\n# Decision\nx\n`];
const codes = (dir, profile = V2) => lintPlan(join(dir, 'docs'), profile, { base: dir }).filter((f) => !/^PLAN-/.test(f.code)).map((f) => `${f.code} ${f.message}`);

test('B173/AC-1 a v2 intent declares its pathway, and a step the pathway requires that is missing is PATHWAY-SKIP', () => {
  assert.deepEqual(codes(makeRepo({ 'docs/intents/I-1-backbone.md': intent('') }, V2)), ['PATHWAY-SKIP I-1 declares no pathway: one of greenfield, feature, brownfield, model']);
  assert.deepEqual(codes(makeRepo({ 'docs/intents/I-1-backbone.md': intent('pathway: greenfield\ndomains: [quotas]\n') }, V2)), ['PATHWAY-SKIP I-1 (greenfield) skips its domains step: a domain doc for each of its domains']);
  const legacy = { ...V2, modules: [...V2.modules, { id: 'legacy', paths: ['lib/**'] }] };
  const brown = codes(makeRepo({ 'docs/intents/I-1-backbone.md': intent('pathway: brownfield\n') }, legacy), legacy);
  assert.deepEqual(brown.filter((l) => /PATHWAY/.test(l)), ['PATHWAY-SKIP I-1 (brownfield) skips its map step: the codebase map written', 'PATHWAY-SKIP I-1 (brownfield) skips its kinds step: a kind for every module']);
  assert.deepEqual(codes(makeRepo({ 'docs/intents/I-1-backbone.md': intent('') }, {}), {}), [], 'a v1 project keeps its intents');
});

test('B174/AC-1 an intent of more than 5 increments is INTENT-SIZE; a question with no answer is ELAB-OPEN, one answered with no option ELAB-BARE', () => {
  const incs = '\n# Increments\n' + [1, 2, 3, 4, 5, 6].map((k) => `- I-1.${k} Step ${k}: later`).join('\n') + '\n';
  const qs = '\n# Questions\n- Q1 Which identity issuer?\n  - a) our own: the manager keeps the keys\n  - b) an engine: one more system to run\n  - Answer: a, the owner\n- Q2 Which key vault?\n  - a) none yet: keys in config\n  - Answer: yes\n- Q3 Which observability stack?\n  - a) metrics only: cheap\n';
  assert.deepEqual(codes(makeRepo({ 'docs/intents/I-1-backbone.md': intent('pathway: feature\n', incs + qs) }, V2)).sort(), [
    'ELAB-BARE I-1 Q2: the answer yes names none of the options a',
    'ELAB-OPEN I-1 Q3 has no answer',
    'INTENT-SIZE I-1 has 6 increments and 0 domains, more than 5 and 5',
    'PATHWAY-SKIP I-1 (feature) skips its questions step: every question answered by an option',
  ]);
});

test('B175/AC-2 a table two domains own, a term with two meanings and a cited requirement without a domain are reported; the context map is drawn', () => {
  const docs = {
    'docs/intents/I-1-backbone.md': intent('pathway: feature\ndomains: [quotas, deployments]\nrequirements: [R-1]\n'),
    'docs/requirements/R-1-limits.md': '---\ntype: Requirement\ntitle: Limits\ndescription: Limits.\n---\n\n# Acceptance criteria\n- AC-1 (unit): x.\n',
    'docs/domains/quotas.md': domain('quotas', '\n# Relationships\n- deployments: downstream, customer-supplier\n'),
    'docs/domains/deployments.md': domain('deployments').replace('`deployments.ledger`', '`quotas.ledger`'),
  };
  const dir = makeRepo(docs, V2);
  assert.deepEqual(codes(dir), [
    'DOMAIN-DATA table quotas.ledger has two owners: deployments, quotas',
    'DOMAIN-TERM the term operation has two meanings, in deployments, quotas',
    'DOMAIN-REQ I-1 cites R-1, which names no domain',
  ]);
  assert.equal(run(dir, ['map']).code, 0);
  assert.match(read(dir, 'docs/architecture/context-map.md'), /```mermaid\nflowchart LR\n {2}deployments\[deployments\]\n {2}quotas\[quotas\]\n {2}quotas -->\|customer-supplier\| deployments\n```/);
});

test('B176/AC-1 aidlc fact records a read-only probe as a platform fact; a platform decision without one is FACT-MISSING, an old one FACT-STALE', () => {
  const dir = makeRepo({ 'docs/intents/I-1-backbone.md': intent('pathway: feature\n'), ...Object.fromEntries([decision(8, 'affects: { platform: true }\n')]) }, V2);
  assert.deepEqual(codes(dir), ['FACT-MISSING 0008 affects the platform and cites no fact']);
  const r = run(dir, ['fact', 'Workload identity form', '--env', 'dev', '--', 'echo', 'spiffe://k3s/ns/shop-dev/sa/shop-providers-api']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^wrote docs\/platform\/F-1-workload-identity-form\.md: cite it as F-1/);
  const fact = read(dir, 'docs/platform/F-1-workload-identity-form.md');
  assert.match(fact, /^type: Fact\n[\s\S]*^command: "echo spiffe:\/\/k3s\/ns\/shop-dev\/sa\/shop-providers-api"\nenvironment: "dev"\ndigest: [0-9a-f]{16}\nat: \S+Z$/m);
  assert.match(fact, /^spiffe:\/\/k3s\/ns\/shop-dev\/sa\/shop-providers-api$/m);
  writeFileSync(join(dir, 'docs/decisions/0008-decision-8.md'), read(dir, 'docs/decisions/0008-decision-8.md').replace('affects:', 'facts: [F-1]\naffects:'));
  assert.deepEqual(codes(dir), []);
  writeFileSync(join(dir, 'docs/platform/F-1-workload-identity-form.md'), fact.replace(/^at: .*$/m, 'at: 2026-01-01T00:00:00Z'));
  assert.deepEqual(codes(dir), ['FACT-STALE 0008 cites F-1, older than 30 days']);
  assert.match(run(dir, ['fact', 'Nope', '--env', 'dev', '--', 'false']).err, /the probe exited 1/);
});

test('B177/AC-1 an approved decision edited is DOC-AMEND; approving one that supersedes it marks it superseded; a decision beyond the horizon is DECISION-HORIZON', () => {
  const incs = '\n# Increments\n- I-1.1 Skeleton: later\n- I-1.2 Next: later\n- I-1.3 Then: later\n- I-1.4 Later: later\n';
  const dir = makeRepo({ 'docs/intents/I-1-backbone.md': intent('pathway: feature\n', incs), ...Object.fromEntries([decision(3, ''), decision(4, 'serves: [I-1.4]\n'), decision(5, 'supersedes: 9\n')]) }, V2);
  approve(dir, '0003');
  writeFileSync(join(dir, 'docs/decisions/0003-decision-3.md'), read(dir, 'docs/decisions/0003-decision-3.md').replace('x\n', 'y\n'));
  assert.deepEqual(codes(dir).sort(), [
    'DECISION-HORIZON 0004 serves only I-1.4, beyond the next 2 increments from 1',
    'DOC-AMEND 0003 is approved and was edited: supersede it, never amend it',
    'DOC-REF 0005 supersedes: 0009 is no Decision',
  ]);
  commit(dir, 'restore 0003', { 'docs/decisions/0003-decision-3.md': read(dir, 'docs/decisions/0003-decision-3.md').replace('y\n', 'x\n'), 'docs/decisions/0006-decision-6.md': decision(6, 'supersedes: 3\n')[1] });
  const r = run(dir, ['approve', '0006']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /docs\/decisions\/0003-decision-3\.md is superseded by docs\/decisions\/0006-decision-6\.md/);
  assert.match(read(dir, 'docs/decisions/0003-decision-3.md'), /^status: superseded by ADR-0006$/m); // as MADR writes it
  assert.ok(!codes(dir).some((l) => /DOC-AMEND 0003/.test(l)), 'superseding is no amendment');
  // A link target rewritten after a rename keeps the approval; a changed word does not, and a delegated re-approval
  // of a decision covers only link targets.
  commit(dir, 'linked', { 'docs/decisions/0007-decision-7.md': decision(7, '').at(1).replace('x\n', 'See [the store](0003-decision-3.md).\n') });
  approve(dir, '0007');
  const d7 = 'docs/decisions/0007-decision-7.md';
  // As approved before link targets were left out: the hash of the raw text.
  commit(dir, 'legacy', { [d7]: read(dir, d7).replace(/^verified_hash: \w+$/m, `verified_hash: ${hashDoc(parseDoc(read(dir, d7)), true)}`) });
  commit(dir, 'renamed', { [d7]: read(dir, d7).replace('(0003-decision-3.md)', '(0003-the-store.md)') });
  assert.ok(!codes(dir).some((l) => /0007/.test(l)), 'a link target is no amendment');
  commit(dir, 'reworded', { [d7]: read(dir, d7).replace('See [the store]', 'Use [the store]') });
  assert.ok(codes(dir).some((l) => /DOC-AMEND 0007/.test(l)));
  run(dir, ['delegate', 'reapprove']);
  assert.match(run(dir, ['approve', '--auto', '0007']).err, /DOC-AMEND 0007/, 'a delegated re-approval amends no decision');
  // An unquoted 0012 is the decision 0012, though YAML 1.1 reads it as the octal 10.
  commit(dir, 'octal', Object.fromEntries([decision(10, ''), decision(12, ''), decision(13, 'supersedes: 0012\n')]));
  assert.match(run(dir, ['approve', '0013']).out, /0012-decision-12\.md is superseded/);
  assert.doesNotMatch(read(dir, 'docs/decisions/0010-decision-10.md'), /superseded/);
});

test('B178/AC-2 contradicting designs are DESIGN-COHERENCE: a quota transaction across domains, operations data given to a horizontal module', () => {
  const docs = {
    'docs/intents/I-1-backbone.md': intent('pathway: feature\n'),
    'docs/domains/quotas.md': domain('quotas'),
    ...Object.fromEntries([
      decision(7, 'affects: { transactions: ["quotas + deployments"] }\n', 'Partitioned persistence'),
      decision(22, 'affects: { data: { "deployments.operations": orchestration } }\n', 'Vertical slices and horizontal layers'),
      decision(23, 'affects: { dependencies: ["database -> quotas"], data: { "quotas.ledger": deployments } }\n'),
    ]),
  };
  assert.deepEqual(codes(makeRepo(docs, V2)), [
    'DESIGN-COHERENCE 0007 keeps a transaction across quotas + deployments: one domain owns each transaction',
    'DESIGN-COHERENCE 0022 gives deployments.operations to orchestration, a pipeline: only a domain owns data',
    'DESIGN-COHERENCE 0023 has database -> quotas, a foundation on a domain, which the kind table forbids',
    'DESIGN-COHERENCE 0023 gives quotas.ledger to another owner than quotas does (quotas, deployments), with no supersedes',
  ]);
});

test('B179/AC-1 B180/AC-1 a confirmed design finding blocks approval until disposed; two one-way doors in one approve are refused', () => {
  const doors = Object.fromEntries([decision(1, 'oneWayDoor: true\n'), decision(2, 'oneWayDoor: true\n')]);
  const dir = makeRepo({ 'docs/intents/I-1-backbone.md': intent('pathway: feature\n', '\n# Decisions\n[0001](../decisions/0001-decision-1.md)\n'), ...doors }, V2);
  assert.match(run(dir, ['approve', '0001', '0002']).err, /APPROVE-BULK: 0001, 0002 are one-way doors; approve each one on its own/);
  writeFileSync(join(dir, 'review.json'), JSON.stringify({ verdict: 'fix', findings: [{ claim: 'two owners of the ledger', confidence: 'CONFIRMED' }, { claim: 'maybe slow', confidence: 'PLAUSIBLE' }] }));
  assert.match(run(dir, ['review', 'record', 'I-1', 'review.json']).out, /recorded the design review of I-1: 2 findings, 1 confirmed/);
  assert.match(run(dir, ['approve', '0001']).err, /APPROVE-OPEN: 0001 waits on the design review of I-1: F-1 still open/);
  assert.match(run(dir, ['approve', 'I-1']).err, /APPROVE-OPEN: I-1 waits on the design review of I-1/);
  assert.match(run(dir, ['dispose', 'I-1', 'F-1', 'accepted', 'one owner in 0023']).out, /I-1 F-1: accepted \(one owner in 0023\)/);
  assert.equal(run(dir, ['approve', '0001']).code, 0);
  assert.equal(run(dir, ['dispose', 'I-1', 'F-9', 'fixed', 'x']).code, 64, 'no such finding');
});

test('B173/AC-1 an Inception finding that blocks refuses the approval of its doc', () => {
  const dir = makeRepo({ 'docs/intents/I-1-backbone.md': intent('pathway: greenfield\ndomains: [quotas]\n') }, V2);
  assert.match(run(dir, ['approve', 'I-1']).err, /PATHWAY-SKIP I-1 \(greenfield\) skips its domains step/);
  commit(dir, 'domain', { 'docs/domains/quotas.md': domain('quotas') });
  assert.equal(run(dir, ['approve', 'I-1']).code, 0);
});
