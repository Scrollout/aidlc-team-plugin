// Unit card: rendered from the base commit, refused for unapproved or stale units, recorded for `start`
// and the model hook (docs/design/unit-card.md). Model routing follows docs/design/team.md.
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { CLI_DIR, config, UsageError } from './config.mjs';
import { msg, render } from './template.mjs';
import { loadProfile, withDefaults } from './profile.mjs';
import { parseDoc, proseLines } from './okf.mjs';
import { computeLane, overlaps, readPlan } from './grid.mjs';
import { aidlcDir, approval, baseOf, branchOf, bundleOf, diffHash, git, roundsOf, runtimeFile, sha256, tryGit, writeJson } from './state.mjs';

const C = config.card;
const AC_LINE = /^\s*[-*]\s+AC-\d+\b/;
const LINK = /\]\(([^)\s#]+\.md)(?:#[^)]*)?\)/g;

// Model for a unit: lane default, escalated for size or complex globs, and for a fix round after a CONFIRMED finding.
export function routeModel(unit, lane, profile = {}, review = null) {
  const m = withDefaults(profile).models;
  let model = m[lane];
  let reason = msg('laneModel', { lane });
  if (lane === 'standard') {
    const complex = (m.complex ?? []).find((g) => unit.scope.some((s) => overlaps(s, g)));
    const why = unit.modules.length >= m.modules ? msg('modelModules', { count: unit.modules.length })
      : unit.acs.length >= m.acs ? msg('modelAcs', { count: unit.acs.length })
      : complex ? msg('modelComplex', { glob: complex }) : null;
    if (why) [model, reason] = [m.escalate, msg('modelEscalated', { reason: why })];
  }
  const last = roundsOf(review).at(-1);
  if (last?.verdict === 'fix' && model !== m.escalate && (last.findings ?? []).some((f) => f.confidence === config.state.confirmed)) {
    [model, reason] = [m.escalate, msg('modelFix', {})];
  }
  return { model, reason };
}

function templateFile(cwd, name) {
  const own = join(cwd, config.templates.find((t) => t.from === 'project').path, name);
  return existsSync(own) ? own : join(CLI_DIR, name);
}

function section(doc, heading) {
  const out = [];
  let on = false;
  for (const [, text] of proseLines(doc.lines, doc.body)) {
    if (/^#{1,6}\s/.test(text)) on = new RegExp(`^#{1,6}\\s+${heading}\\s*$`, 'i').test(text);
    else if (on && text.trim()) out.push(text);
  }
  return out;
}

// Renders the card for `unitId` from the base commit; returns { code, card, record } or a refusal.
export function renderCard(cwd, unitId) {
  const { profile } = loadProfile(cwd);
  const base = baseOf(profile);
  const baseSha = tryGit(cwd, 'rev-parse', '-q', '--verify', `${base}^{commit}`);
  if (!baseSha) throw new UsageError(msg('noBase', { base }));
  const bundle = bundleOf(cwd, profile);
  const unit = readPlan(bundle).units.find((u) => u.id === unitId);
  if (!unit) throw new UsageError(msg('unknownUnit', { name: unitId, dir: relative(cwd, join(bundle, config.grid.units)) }));

  const top = git(cwd, 'rev-parse', '--show-toplevel');
  const docText = tryGit(cwd, 'show', `${baseSha}:${relative(top, unit.file).split('\\').join('/')}`);
  const doc = docText === null ? null : parseDoc(docText + '\n');
  const atBase = doc && !doc.error && doc.fm ? readPlanUnit(unit, doc) : null;
  const lane = atBase ? computeLane(atBase.scope, profile) : null;
  const state = !atBase ? 'draft' : atBase.fm.intent || lane.lane !== 'quick' ? approval(doc) : 'approved';
  if (state !== 'approved') return { code: config.exit.blocked, output: msg('cardRefused', { unit: unitId, state }) };

  const review = existsSync(runtimeFile(cwd, 'reviews', unitId)) ? JSON.parse(readFileSync(runtimeFile(cwd, 'reviews', unitId), 'utf8')) : null;
  const current = review && tryGit(cwd, 'rev-parse', '-q', '--verify', branchOf(unitId)) && roundsOf(review).at(-1)?.diffHash === diffHash(cwd, base, unitId);
  const { model, reason } = routeModel(atBase, lane.lane, profile, current ? review : null);
  const modules = new Set(atBase.modules);
  const data = {
    id: unitId,
    title: String(atBase.fm.title ?? ''),
    goal: String(atBase.fm.description ?? ''),
    lane: lane.lane,
    laneReason: lane.reason,
    model,
    modelReason: reason,
    base: baseSha,
    acs: proseLines(doc.lines, doc.body).filter(([, t]) => AC_LINE.test(t)).map(([, t]) => t.trim()),
    scope: atBase.scope,
    interfaces: [...new Set([...doc.lines.slice(doc.body).join('\n').matchAll(LINK)].map((m) => m[1]))],
    reserves: atBase.reserves,
    checks: (profile.modules ?? []).filter((m) => modules.has(m.id) && m.check).map((m) => ({ module: m.id, check: m.check })),
    outOfScope: section(doc, 'Out of scope'),
  };
  const file = templateFile(cwd, lane.lane === 'quick' ? C.quickTemplate : C.template);
  const template = readFileSync(file, 'utf8');
  const hash = sha256(docText + '\n' + render(template, { ...data, hash: '' }, file)).slice(0, C.hashLength);
  const card = render(template, { ...data, hash }, file);
  if (card.length > C.max) return { code: config.exit.findings, output: msg('cardTooLong', { unit: unitId, size: card.length, max: C.max }) };
  const record = { unit: unitId, hash, base: baseSha, lane: lane.lane, model };
  writeJson(runtimeFile(cwd, 'cards', unitId), record);
  return { code: config.exit.ok, output: card, record };
}

// The unit's fields as written at the base commit.
function readPlanUnit(unit, doc) {
  const list = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]).map(String);
  return {
    ...unit,
    fm: doc.fm,
    scope: list(doc.fm.scope),
    modules: list(doc.fm.modules),
    reserves: list(doc.fm.reserves),
    acs: proseLines(doc.lines, doc.body).filter(([, t]) => AC_LINE.test(t)),
  };
}

const done = (output, code = config.exit.ok) => ({ code, findings: [], output });

export const commands = {
  card(args, { cwd }) {
    if (!args[0]) throw new UsageError(msg('noDoc', { name: '' }));
    const r = renderCard(cwd, args[0]);
    return done(r.output, r.code);
  },

  // In a builder's worktree: name the branch unit/U-<n> and refuse when the base differs from the card's.
  start(args, { cwd }) {
    const unit = args[0];
    if (!unit) throw new UsageError(msg('noDoc', { name: '' }));
    const gitDir = resolve(cwd, git(cwd, 'rev-parse', '--git-dir'));
    if (gitDir === resolve(aidlcDir(cwd), '..')) throw new UsageError(msg('notWorktree', {}));
    const recordFile = runtimeFile(cwd, 'cards', unit);
    if (!existsSync(recordFile)) return done(msg('noCard', { unit }), config.exit.findings);
    const record = JSON.parse(readFileSync(recordFile, 'utf8'));
    const branch = branchOf(unit);
    const current = git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD');
    if (current !== branch) {
      const head = git(cwd, 'rev-parse', 'HEAD');
      if (head !== record.base) return done(msg('baseMismatch', { unit, head, base: record.base }), config.exit.findings);
      if (tryGit(cwd, 'rev-parse', '-q', '--verify', `refs/heads/${branch}`)) {
        const taken = git(cwd, 'worktree', 'list', '--porcelain').split('\n\n').find((w) => w.includes(`branch refs/heads/${branch}`));
        if (taken) return done(msg('branchTaken', { branch, path: taken.split('\n')[0].replace(/^worktree /, '') }), config.exit.findings);
        git(cwd, 'switch', '-q', branch);
      } else git(cwd, 'branch', '-m', branch);
    }
    return done(msg('started', { branch, base: record.base }));
  },
};
