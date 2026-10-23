import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, commit, intentDoc, makeRepo, run, unitDoc, write } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const U1 = 'docs/units/U-1-a.md';

test('U23/AC-1 the researcher has read and web tools only, and the model hook holds it to models.research', () => {
  const agent = readFileSync(join(ROOT, 'plugin/agents/researcher.md'), 'utf8');
  assert.match(agent, /^tools: Read, Grep, Glob, WebSearch, WebFetch$/m);
  assert.match(agent, /Official sources first/);
  assert.match(agent, /Mark each as secondary; none is the only support/);
  const dir = makeRepo({}, { models: { research: 'haiku' } });
  const hook = (model) => JSON.parse(spawnSync(process.execPath, [join(ROOT, 'plugin/cli/aidlc.mjs'), 'hook', 'model'], { cwd: dir, encoding: 'utf8',
    input: JSON.stringify({ cwd: dir, session_id: 's', tool_name: 'Agent', tool_input: { subagent_type: 'aidlc-team:researcher', prompt: '# Research for U-1', model } }) }).stdout);
  assert.deepEqual(hook('haiku'), {});
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
  assert.doesNotMatch(readFileSync(join(ROOT, 'plugin/cli/research.md'), 'utf8'), /https?:/, 'the plugin ships no source list');
  const out = brief.out.match(/writes it unchanged to (\S+)/)[1];
  assert.equal(out, 'docs/research/U-1-how-does-go-get-read-a.md');

  const digest = brief.out.split(/writes it unchanged to \S+\n/)[1].replace('<the question in a few words>', 'Go file proxy').replace('<the answer in one line>', 'It reads the module files.');
  write(dir, { [out]: digest });
  commit(dir, 'research for U-1');
  const after = run(dir, ['next']);
  assert.equal(after.code, 2, after.out);
  assert.match(after.out, /U-1 \(research: how does go get read a file:\/\/ GOPROXY\?\)/, 'researched once: the hold is the owner\'s to release');
  assert.equal(run(dir, ['research', 'U-2']).code, 64);
});
