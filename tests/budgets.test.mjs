// The budgets in docs/design/overview.md, each checked against what exists in plugin/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { approve, commit, intentDoc, makeRepo, run, unitDoc } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const files = (dir, re) => {
  if (!existsSync(join(ROOT, dir))) return [];
  return readdirSync(join(ROOT, dir), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && re.test(e.name))
    .map((e) => join(e.parentPath ?? e.path, e.name).slice(ROOT.length + 1));
};
const maybe = (p) => (existsSync(join(ROOT, p)) ? read(p) : '');
const tokens = (text) => Math.ceil(text.length / 4);
const description = (text) => text.match(/^---\n[\s\S]*?^description:\s*(.*)$/m)?.[1].replace(/^["']|["']$/g, '') ?? '';

// Budget rows from the Overview table: item → numeric limit.
function budgets() {
  const md = read('docs/design/overview.md');
  const section = md.split('# Budgets')[1].split('\n# ')[0];
  const rows = {};
  for (const line of section.split('\n')) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([\d,]+)/);
    if (m && m[1] !== 'Item') rows[m[1]] = Number(m[2].replace(/,/g, ''));
  }
  return rows;
}

// Each checker returns the violations for its inputs; `real()` gathers the inputs from this repo.
const sizes = (items, limit, unit, measure) =>
  items.filter((i) => measure(i.text) > limit).map((i) => `${i.name}: ${measure(i.text)} ${unit} > ${limit}`);

const CHECKS = {
  'Always-on context added to a project session': {
    check: (items, limit) => sizes([{ name: 'always-on', text: items.map((i) => i.text).join('\n') }], limit, 'tokens', tokens),
    real: () => [
      { name: 'AGENTS.md', text: maybe('plugin/templates/AGENTS.md') },
      { name: 'CLAUDE.md', text: maybe('plugin/templates/CLAUDE.md') },
      ...files('plugin/skills', /^SKILL\.md$/).concat(files('plugin/agents', /\.md$/)).map((f) => ({ name: f, text: description(read(f)) })),
    ],
  },
  'Generated AGENTS.md': {
    check: (items, limit) => sizes(items, limit, 'lines', (t) => t.split('\n').length),
    real: () => files('plugin/templates', /^AGENTS\.md$/).map((f) => ({ name: f, text: read(f) })),
  },
  'SessionStart status injection': {
    check: (items, limit) => sizes(items, limit, 'chars', (t) => t.length),
    real: () => [], // U7 wires the hook output.
  },
  'Skill body / agent prompt': {
    check: (items, limit) => sizes(items, limit * 1024, 'bytes', (t) => Buffer.byteLength(t)),
    real: () => files('plugin/skills', /^SKILL\.md$/).concat(files('plugin/agents', /\.md$/)).map((f) => ({ name: f, text: read(f) })),
  },
  'Skill and agent descriptions': {
    check: (items, limit) => sizes(items.map((i) => ({ ...i, text: description(i.text) })), limit, 'chars', (t) => t.length),
    real: () => files('plugin/skills', /^SKILL\.md$/).concat(files('plugin/agents', /\.md$/)).map((f) => ({ name: f, text: read(f) })),
  },
  'Unit card': {
    check: (items, limit) => sizes(items, limit, 'chars', (t) => t.length),
    real: () => files('plugin/cli', /^card.*\.md$/).map((f) => ({ name: f, text: read(f) })), // templates; rendered cards are capped at runtime
  },
  'CLI source (`plugin/cli/`)': {
    check: (items, limit) => sizes([{ name: 'plugin/cli', text: items.map((i) => i.text.replace(/\n$/, '')).join('\n') }], limit, 'lines', (t) => t.split('\n').length),
    real: () => files('plugin/cli', /\.mjs$/).map((f) => ({ name: f, text: read(f) })),
  },
  'Hook timeout': {
    check: (items, limit) => items.flatMap(({ name, text }) => {
      const out = [];
      for (const [event, groups] of Object.entries(JSON.parse(text).hooks ?? {})) {
        for (const h of groups.flatMap((g) => g.hooks ?? [])) {
          const id = `${name} ${event} ${h.command ?? h.args?.join(' ') ?? ''}`.trim();
          if (typeof h.timeout !== 'number' || h.timeout > limit) out.push(`${id}: timeout ${h.timeout} not ≤ ${limit}`);
          if (event === 'PreToolUse' && h.args?.at(-1) !== 'heartbeat' && h.onFailure !== 'block') out.push(`${id}: blocking hook without onFailure "block"`);
        }
      }
      return out;
    }),
    real: () => files('plugin/hooks', /^hooks\.json$/).map((f) => ({ name: f, text: read(f) })),
  },
  'Blocking hook run time': {
    check: (items, limit) => items.filter((i) => Number(i.text) > limit).map((i) => `${i.name}: ${i.text} ms > ${limit}`),
    real: hookTimes,
  },
};

// The median run time of each blocking hook, through the plugin's run.mjs and the pinned CLI, on a small project.
function hookTimes() {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), 'docs/units/U-1-a.md': unitDoc({ scope: ['src/**'] }) });
  run(dir, ['upgrade', '--dirty']);
  commit(dir, 'pin the CLI');
  approve(dir, 'I-1', 'U-1');
  run(dir, ['card', 'U-1']);
  const write = { tool_name: 'Write', tool_input: { file_path: join(dir, 'src/a.mjs'), content: '1;\n' } };
  const calls = {
    guard: { tool_name: 'Bash', tool_input: { command: 'git status' } },
    scope: write,
    secrets: write,
    model: { tool_name: 'Agent', tool_input: { subagent_type: 'team:builder', prompt: 'Build U-1.', model: 'sonnet' } },
  };
  return Object.entries(calls).map(([name, call]) => {
    const input = JSON.stringify({ cwd: dir, hook_event_name: 'PreToolUse', ...call });
    const times = Array.from({ length: 5 }, () => {
      const start = performance.now();
      spawnSync(process.execPath, [join(ROOT, 'plugin/hooks/run.mjs'), name], { input });
      return performance.now() - start;
    }).sort((a, b) => a - b);
    return { name, text: String(Math.round(times[2])) };
  });
}

const OVER = {
  'Always-on context added to a project session': (n) => [{ name: 'AGENTS.md', text: 'x'.repeat(n * 4 + 1) }],
  'Generated AGENTS.md': (n) => [{ name: 'AGENTS.md', text: 'line\n'.repeat(n) }],
  'SessionStart status injection': (n) => [{ name: 'status', text: 'x'.repeat(n + 1) }],
  'Skill body / agent prompt': (n) => [{ name: 'SKILL.md', text: 'x'.repeat(n * 1024 + 1) }],
  'Skill and agent descriptions': (n) => [{ name: 'builder.md', text: `---\nname: b\ndescription: ${'x'.repeat(n + 1)}\n---\n` }],
  'Unit card': (n) => [{ name: 'card', text: 'x'.repeat(n + 1) }],
  'CLI source (`plugin/cli/`)': (n) => [{ name: 'a.mjs', text: 'x\n'.repeat(n) }, { name: 'b.mjs', text: 'y\n' }],
  'Blocking hook run time': (n) => [{ name: 'guard', text: String(n + 1) }],
  'Hook timeout': (n) => [
    { name: 'hooks.json', text: JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'guard', timeout: n + 1, onFailure: 'block' }] }] } }) },
  ],
};

test('U1/AC-4 every budget in the Overview has a checker', () => {
  assert.deepEqual(Object.keys(budgets()).sort(), Object.keys(CHECKS).sort());
});

for (const [item, limit] of Object.entries(budgets())) {
  test(`U1/AC-4 within budget: ${item} (${limit})`, () => {
    assert.deepEqual(CHECKS[item].check(CHECKS[item].real(), limit), []);
  });
  test(`U1/AC-4 fails when exceeded: ${item}`, () => {
    assert.ok(CHECKS[item].check(OVER[item](limit), limit).length > 0);
  });
}

test('U1/AC-4 a blocking hook without onFailure or a timeout fails', () => {
  const text = JSON.stringify({ hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'guard', timeout: 10 }] }],
    SessionStart: [{ hooks: [{ type: 'command', command: 'status' }] }],
  } });
  assert.equal(CHECKS['Hook timeout'].check([{ name: 'hooks.json', text }], 10).length, 2);
});
