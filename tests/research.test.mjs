import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { approve, commit, hook as hookCall, intentDoc, makeRepo, run, unitDoc, write } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const U1 = 'docs/units/U-1-a.md';

test('U23/AC-1 the researcher has read and web tools only, and the model hook holds it to models.research', () => {
  const agent = readFileSync(join(ROOT, 'plugin/agents/researcher.md'), 'utf8');
  assert.match(agent, /^tools: Read, Grep, Glob, WebSearch, WebFetch$/m);
  assert.match(agent, /Official sources first/);
  assert.match(agent, /Mark each as secondary; none is the only support/);
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), 'docs/units/U-1-u1.md': unitDoc({ scope: ['sdk/**'] }) }, { models: { research: 'haiku' } });
  approve(dir, 'I-1', 'U-1');
  const hook = (model, prompt = 'Research U-1.') => hookCall('model', { cwd: dir, session_id: 's', tool_name: 'Agent', tool_input: { subagent_type: 'aidlc-team:researcher', prompt, model } }, { pinned: false }).json;
  assert.match(hook('haiku').hookSpecificOutput.permissionDecisionReason, /^MODEL-UNIT aidlc-team:researcher for U-1 has no brief to read/, 'no question held');
  run(dir, ['hold', 'U-1', 'research:', 'which proxy?']);
  const launched = hook('haiku').hookSpecificOutput;
  assert.equal(launched.permissionDecision, 'allow');
  assert.match(launched.updatedInput.prompt, /^# Research for U-1\n\nQuestion: which proxy\?/, 'B219/AC-1 the hook delivers the brief the CLI renders');
  assert.equal(launched.updatedInput.effort, 'medium', 'B219/AC-1 at the role\'s effort');
  assert.match(hook('opus').hookSpecificOutput.permissionDecisionReason, /^MODEL-MISMATCH aidlc-team:researcher for a research question uses opus, the profile's models\.research says haiku/);
});

test('U23/AC-2 U23/AC-3 U23/AC-4 a question held for research is next; the brief carries the project\'s own context; a filed digest ends it', () => {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), [U1]: unitDoc({ scope: ['sdk/**'] }), 'go.mod': 'module example\n' },
    { research: { sources: ['https://go.dev/ref/mod'] } });
  approve(dir, 'I-1', 'U-1');
  assert.match(run(dir, ['next']).out, /^build U-1/, 'no research unless asked');
  assert.equal(run(dir, ['hold', 'U-1', 'research:', 'how does go get read a file:// GOPROXY?']).code, 0);
  const next = run(dir, ['next']);
  assert.equal(next.code, 0, 'the lead\'s step');
  assert.match(next.out, /^research for U-1: researcher on sonnet \(brief: aidlc research U-1\)/);

  const brief = run(dir, ['research', 'U-1']);
  assert.equal(brief.code, 0, brief.err);
  assert.match(brief.out, /^Question: how does go get read a file:\/\/ GOPROXY\?$/m);
  assert.match(brief.out, /^- Stack: go\.mod$/m, 'the project\'s stack files');
  assert.doesNotMatch(brief.out, /Stack: package\.json/);
  assert.match(brief.out, /^- https:\/\/go\.dev\/ref\/mod$/m, 'the owner\'s sources');
  assert.match(brief.out, /^Read at most 8 sources\./m);
  assert.doesNotMatch(readFileSync(join(ROOT, 'plugin/templates/research.md'), 'utf8'), /https?:/, 'the plugin ships no source list');
  const out = brief.out.match(/writes it unchanged to (\S+)/)[1];
  assert.equal(out, 'docs/research/U-1-how-does-go-get-read-a.md');
  assert.match(brief.out, /^The lead then runs `aidlc check docs\/research\/U-1-how-does-go-get-read-a\.md` and the project's own doc checks, and sends any finding back to you to fix; it never edits the digest itself\.$/m, 'a resend is the brief\'s step');

  const digest = brief.out.split(/never edits the digest itself\.\n/)[1].replace('<the question in a few words>', 'Go file proxy').replace('<the answer in one line>', 'It reads the module files.');
  write(dir, { [out]: digest });
  commit(dir, 'research for U-1');
  assert.match(run(dir, ['next']).out, /^build U-1/, 'researched once: the answered hold no longer holds U-1');
  assert.equal(run(dir, ['research', 'U-2']).code, 64);
});

const modelHook = (dir, input) => hookCall(input.hook_event_name === 'PostToolUse' ? 'heartbeat' : 'model', { cwd: dir, session_id: 's', ...input }, { pinned: false });

test('U25/AC-1 a researcher in flight is waited for, and steer does not demand it again', () => {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), [U1]: unitDoc({ scope: ['sdk/**'] }) });
  approve(dir, 'I-1', 'U-1');
  run(dir, ['hold', 'U-1', 'research:', 'which proxy?']);
  commit(dir, 'hold U-1');
  assert.match(run(dir, ['next']).out, /^research for U-1/);
  const r = modelHook(dir, { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'aidlc-team:researcher', prompt: run(dir, ['research', 'U-1']).out, model: 'sonnet' } });
  assert.equal(r.code, 0, r.err);
  const next = run(dir, ['next']);
  assert.match(next.out, /^wait for the researcher of U-1$/m);
  const steer = hookCall('steer', { cwd: dir, session_id: 's', hook_event_name: 'Stop', last_assistant_message: 'Started.' }, { pinned: false });
  assert.equal(steer.json.decision, undefined, 'the stop is let through');
  const marker = join(dir, '.git/aidlc/researching/U-1');
  utimesSync(marker, new Date(Date.now() - 13 * 60 * 1000), new Date(Date.now() - 13 * 60 * 1000));
  modelHook(dir, { hook_event_name: 'PostToolUse', tool_name: 'WebFetch', agent_type: 'aidlc-team:researcher', tool_input: {} });
  assert.match(run(dir, ['next']).out, /^research for U-1/, 'a stale marker is not refreshed: the researcher is gone');
  modelHook(dir, { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'aidlc-team:researcher', prompt: '# Research for U-1', model: 'sonnet' } });
  modelHook(dir, { hook_event_name: 'PostToolUse', tool_name: 'WebFetch', agent_type: 'aidlc-team:researcher', tool_input: {} });
  assert.ok(Date.now() - statSync(marker).mtimeMs < 5000, 'its calls keep the marker fresh');
});

test('U25/AC-2 U25/AC-3 an answered research hold no longer holds the doc; the brief caps the whole digest and asks for generated', () => {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), [U1]: unitDoc({ scope: ['sdk/**'] }) });
  approve(dir, 'I-1', 'U-1');
  run(dir, ['hold', 'U-1', 'research:', 'which proxy?']);
  commit(dir, 'hold U-1');
  const brief = run(dir, ['research', 'U-1']).out;
  assert.match(brief, / Keep the whole digest, frontmatter included, under 6000 characters\.$/m);
  assert.match(brief, /^generated: \{ by: claude-code\/<your AI model id>, at: <the current UTC time> \}$/m);
  write(dir, { 'docs/research/U-1-which-proxy.md': '---\ntype: Research\ntitle: Proxy\ndescription: The file proxy.\nquestion: "which proxy?"\n---\n\n# Options\nOne.\n' });
  commit(dir, 'digest');
  assert.match(run(dir, ['next']).out, /^build U-1/);
  run(dir, ['hold', 'U-1', 'the owner asks to wait']);
  commit(dir, 'owner hold');
  assert.match(run(dir, ['next']).out, /on hold/, 'any other hold still holds');
});

test('U25/AC-2 a research question with <angle brackets> on a draft is no open point once answered', () => {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), [U1]: unitDoc({ scope: ['sdk/**'] }) });
  approve(dir, 'I-1');
  run(dir, ['hold', 'U-1', 'research:', 'is go build ./internal/<m>/... enough?']);
  commit(dir, 'hold U-1');
  assert.match(run(dir, ['next']).out, /^research for U-1/);
  write(dir, { 'docs/research/U-1-go-build.md': '---\ntype: Research\ntitle: Build\ndescription: Enough.\nquestion: "is go build ./internal/<m>/... enough?"\n---\n\n# Options\nOne.\n' });
  commit(dir, 'digest');
  assert.match(run(dir, ['next']).out, /^👉 ask the owner to approve the plan: aidlc approve U-1/);
});

test('U27/AC-2 the research brief carries the project rules', () => {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), [U1]: unitDoc({ scope: ['sdk/**'] }), '.aidlc/rules/docs.md': 'Every doc starts with a **TL;DR:** line.\n' });
  run(dir, ['hold', 'U-1', 'research:', 'which proxy?']);
  commit(dir, 'hold');
  const brief = run(dir, ['research', 'U-1']).out;
  assert.match(brief, /^## Project rule: \.aidlc\/rules\/docs\.md\nEvery doc starts with a \*\*TL;DR:\*\* line\.$/m);
});

test('U100/AC-1 a decision held for research gets a brief by its number and holds next until a digest answers it', () => {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), [U1]: unitDoc({ scope: ['sdk/**'] }),
    'docs/decisions/0003-mta-core.md': '---\ntype: Decision\ntitle: 0003 MTA core\ndescription: Which MTA core.\n---\n\n# Context\nx\n' });
  approve(dir, 'I-1', 'U-1');
  assert.equal(run(dir, ['hold', '0003', 'research:', 'which MTA core meets R-2?']).code, 0);
  assert.match(run(dir, ['next']).out, /^research for 0003: researcher on \w+ \(brief: aidlc research 0003\)/);
  const brief = run(dir, ['research', '0003']);
  assert.equal(brief.code, 0, brief.err);
  assert.match(brief.out, /^Question: which MTA core meets R-2\?$/m);
  const out = brief.out.match(/writes it unchanged to (\S+)/)[1];
  assert.equal(out, 'docs/research/0003-which-mta-core-meets-r-2.md');
  write(dir, { [out]: `---\ntype: Research\ntitle: MTA core\ndescription: d.\nquestion: "which MTA core meets R-2?"\n---\n` });
  assert.match(run(dir, ['next']).out, /^build U-1/, 'the digest ends the hold');
});

test('U102/AC-1 a research hold on any doc gets a brief by its name and holds next', () => {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), [U1]: unitDoc({ scope: ['sdk/**'] }),
    'docs/catalogue/reputation.md': '---\ntype: Design\ntitle: Reputation\ndescription: Reputation checks.\n---\n\n# Today\nx\n' });
  approve(dir, 'I-1', 'U-1');
  assert.equal(run(dir, ['hold', 'docs/catalogue/reputation.md', 'research:', 'what do RFC 5782 DNSBLs say?']).code, 0);
  assert.match(run(dir, ['next']).out, /^research for reputation: researcher on \w+ \(brief: aidlc research reputation\)/);
  for (const name of ['reputation', 'docs/catalogue/reputation.md']) assert.match(run(dir, ['research', name]).out, /^Question: what do RFC 5782 DNSBLs say\?$/m, name);
});

test('U109/AC-3 the research brief states the project\'s Research cap', () => {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), [U1]: unitDoc({ scope: ['sdk/**'] }) }, { docs: { bundle: 'docs', caps: { default: 4000 } } });
  approve(dir, 'I-1', 'U-1');
  run(dir, ['hold', 'U-1', 'research:', 'which proxy?']);
  assert.match(run(dir, ['research', 'U-1']).out, /under 4000 characters\.$/m);
});
