// State: derives unit and intent states from git and the bundle, stamps approvals, picks the next action
// and records builder reports and reviewer verdicts (docs/design/state.md). Nothing here is a ledger.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { config, done, isMap, list, readJson, UsageError } from './config.mjs';
import { msg } from './template.mjs';
import { loadProfile } from './profile.mjs';
import { parseDoc } from './okf.mjs';
import { computeLane, overlaps, readPlan, reqId as reqIdOf } from './grid.mjs';

const S = config.state;

// ---- git ----

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const tryGit = (cwd, ...args) => {
  try { return git(cwd, ...args); } catch { return null; }
};

export const aidlcDir = (cwd) => join(resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir')), S.dir);
export const runtimeFile = (cwd, kind, unit) => join(aidlcDir(cwd), S[kind], `${unit}.json`);
export const branchOf = (unit) => S.branchPrefix + unit;
export const baseOf = (profile) => profile.base;
export const bundleOf = (cwd, profile) => resolve(cwd, profile.docs.bundle);

export function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// Review rounds of one focus; a verdict without `focus` is the general review.
export const roundsOf = (review, focus = S.focus) => (review?.rounds ?? []).filter((r) => (r.focus ?? S.focus) === focus);

// Diff of a unit branch against its merge base with the base branch.
export const diffHash = (cwd, base, unit) => sha256(git(cwd, 'diff', `${base}...${branchOf(unit)}`));


// Focuses the unit's diff needs a review in, each with why: general first, then each focus whose globs
// the diff touches (docs/design/prompts.md).
export function reviewFocuses(cwd, profile, base, unit) {
  const paths = git(cwd, 'diff', '--name-only', `${base}...${branchOf(unit)}`).split('\n').filter(Boolean);
  const needed = new Map([[S.focus, '']]);
  for (const [focus, globs] of Object.entries(profile.focus ?? {})) {
    const path = paths.find((x) => list(globs).some((g) => overlaps('/' + x, g)));
    if (path) needed.set(focus, msg('gateFocusPath', { path, focus }));
  }
  return needed;
}

// ---- Approvals ----

const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : isMap(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const events = (fm) => (isMap(fm.verified) ? [fm.verified] : Array.isArray(fm.verified) ? fm.verified.filter(isMap) : []);

export function hashDoc(doc) {
  const fm = Object.fromEntries(Object.entries(doc.fm ?? {}).filter(([k]) => !S.hashExclude.includes(k)));
  return sha256(JSON.stringify(sortKeys(fm)) + '\n' + doc.lines.slice(doc.body).join('\n'));
}

// approved: a human `verified` event and a matching hash; stale: approved once, changed since.
export function approval(doc) {
  const human = events(doc.fm).some((e) => S.approvers.some((a) => String(e.by ?? '').startsWith(a)));
  if (!human) return 'draft';
  return doc.fm.verified_hash === hashDoc(doc) ? 'approved' : 'stale';
}

// Approval classes the owner delegated to the lead; only the untracked personal layer counts (decision 0008).
const personal = (cwd) => join(cwd, config.layers.find((l) => l.name === 'personal').path);
const delegated = (cwd) => list(readJson(personal(cwd))?.approvals?.auto);

// The latest approval of a doc by one of `by`, in epoch ms (0 when none). Answering an escalation takes the
// owner (human: only); a delegated re-approval of a fixed spec is enough to restart a stopped builder.
export const approvedAt = (doc, by = S.approvers) => Math.max(0, ...events(doc.fm).filter((e) => by.some((b) => String(e.by ?? '').startsWith(b))).map((e) => Date.parse(String(e.at)) || 0));
const beforeApproval = (round, at) => Date.parse(round.at) < at;

// A unit's review rounds. An escalation the owner answered by re-approving the unit counts as a `fix`:
// the spec changed, so the builder gets a fix round with those findings (docs/design/verification.md).
export function readReview(cwd, unit, doc) {
  const review = readJson(runtimeFile(cwd, 'reviews', unit));
  const at = doc ? approvedAt(doc, [S.human]) : 0;
  const [, fix, escalate] = S.verdicts;
  return review && { ...review, rounds: review.rounds.map((r) => (r.verdict === escalate && at && beforeApproval(r, at) ? { ...r, verdict: fix } : r)) };
}

const plain = (v) => /^[A-Za-z0-9_@.+/][A-Za-z0-9_@:.+/ -]*$/.test(v) && !/:(\s|$)/.test(v) && !/^\d+$/.test(v);
const scalar = (v) => (typeof v === 'string' && plain(v) ? v : JSON.stringify(v));
const flowMap = (e) => `{ ${Object.entries(e).map(([k, v]) => `${k}: ${scalar(v)}`).join(', ')} }`;

// Returns the doc text with the owner's stamp: earlier events kept, one appended, status and hash set.
export function stamp(text, by, at) {
  const doc = parseDoc(text);
  if (doc.error || !doc.fm) throw new UsageError(msg('fmYaml', { error: doc.error ?? '' }));
  const drop = ['verified', 'verified_hash', 'status'];
  const kept = [];
  let skipping = false;
  for (const line of doc.fmLines.slice(1, -1)) {
    const key = line.match(/^([A-Za-z_][\w-]*):/)?.[1];
    if (key) skipping = drop.includes(key);
    else if (!/^(\s|-)/.test(line) && line.trim()) skipping = false;
    if (!skipping) kept.push(line);
  }
  const all = [...events(doc.fm), { by, at }];
  const body = doc.lines.slice(doc.body).join('\n');
  const draft = ['---', ...kept, `status: ${S.stable}`, 'verified:', ...all.map((e) => `  - ${flowMap(e)}`), '---', body].join('\n');
  const hash = hashDoc(parseDoc(draft));
  return draft.replace(/\nverified:\n/, `\nverified_hash: ${hash}\nverified:\n`);
}

// ---- State ----

export function mergedUnits(cwd, base) {
  const out = new Map();
  const log = tryGit(cwd, 'log', base, `--format=%H%x1f%(trailers:key=${S.trailer},valueonly,separator=%x1e)%x1d`);
  for (const rec of (log ?? '').split('\x1d')) {
    const [sha, values] = rec.trim().split('\x1f');
    for (const v of (values ?? '').split('\x1e').map((x) => x.trim()).filter(Boolean)) if (!out.has(v)) out.set(v, sha);
  }
  return out;
}

export function heartbeatFresh(cwd, unit, now = Date.now(), kind = S.heartbeats) {
  const file = join(aidlcDir(cwd), kind, unit);
  return existsSync(file) && now - statSync(file).mtimeMs < S.heartbeatMs;
}

function mergeInProgress(cwd, units) {
  const head = tryGit(cwd, 'rev-parse', '-q', '--verify', 'MERGE_HEAD');
  if (!head) return null;
  return units.find((u) => tryGit(cwd, 'rev-parse', branchOf(u.id)) === head)?.id ?? null;
}

const num = (id) => Number(id.split('-')[1]);
const byId = (a, b) => num(a.id) - num(b.id);

// Every intent and live unit with its derived state, plus what next needs.
export function readState(cwd, { now = Date.now() } = {}) {
  const { profile } = loadProfile(cwd);
  const base = baseOf(profile);
  const bundle = bundleOf(cwd, profile);
  const plan = readPlan(bundle);
  const merged = mergedUnits(cwd, base);
  const branches = new Set((tryGit(cwd, 'for-each-ref', '--format=%(refname:short)', `refs/heads/${S.branchPrefix}`) ?? '').split('\n').filter(Boolean));
  const live = plan.units.filter((u) => u.fm.status !== config.grid.dropped).sort(byId);

  const units = live.map((u) => {
    const lane = computeLane(u.scope, profile).lane;
    const needsApproval = Boolean(u.fm.intent) || lane !== 'quick';
    const approvalState = approval(u.doc);
    const report = readJson(runtimeFile(cwd, 'reports', u.id));
    const review = readReview(cwd, u.id, u.doc);
    let state;
    let focus = null;
    if (merged.has(u.id)) state = 'merged';
    else if (needsApproval && approvalState !== 'approved') state = approvalState;
    // A builder that stopped hands the unit back to the lead until the owner re-approves its fixed spec.
    else if (report?.status === S.stopped && Date.parse(report.at) > approvedAt(u.doc)
      && !(review?.rounds ?? []).some((r) => r.at > report.at)) state = 'stopped';
    else if (!u.depends.every((d) => merged.has(d))) state = 'blocked';
    else if (branches.has(branchOf(u.id))) {
      // The last verdict of each required focus, counted only while it is for the current diff.
      // A quick-lane unit gets no review: its report alone makes it ready to merge.
      const quick = lane === 'quick';
      const hash = diffHash(cwd, base, u.id);
      const verdicts = (quick ? [] : [...reviewFocuses(cwd, profile, base, u.id).keys()]).map((f) => {
        const last = roundsOf(review, f).at(-1);
        return { focus: f, verdict: last?.diffHash === hash ? last.verdict : null };
      });
      const has = (v) => verdicts.some((x) => x.verdict === v);
      const lastAt = review?.rounds?.at(-1)?.at;
      focus = verdicts.find((x) => x.verdict !== 'pass')?.focus ?? null;
      if (has('escalate')) state = 'escalated';
      else if (has('fix')) state = 'fix';
      else if (!focus && (!quick || report)) {
        const gate = readJson(runtimeFile(cwd, 'gates', u.id));
        state = gate?.diffHash === hash && gate.base === tryGit(cwd, 'rev-parse', base) ? 'gated' : 'reviewed';
      }
      else if (has('pass') || (report && (!lastAt || report.at > lastAt) && Date.parse(report.at) > approvedAt(u.doc))) {
        state = heartbeatFresh(cwd, u.id, now, S.reviewing) ? 'reviewing' : 'reported';
      }
      else state = 'building';
    } else state = 'approved';
    return { ...u, lane, state, focus, fresh: heartbeatFresh(cwd, u.id, now), report, review };
  });

  const intents = plan.intents.sort(byId).map((i) => {
    const own = units.filter((u) => u.fm.intent === i.id);
    const complete = own.length > 0 && own.every((u) => u.state === 'merged');
    const released = complete && own.every((u) => (tryGit(cwd, 'tag', '--contains', merged.get(u.id)) ?? '') !== '');
    return { ...i, state: released ? 'released' : complete ? 'merged' : approval(i.doc), units: own };
  });
  const requirements = plan.requirements.map((r) => ({ ...r, state: approval(r.doc) }));
  return { cwd, profile, base, bundle, intents, units, requirements, auto: delegated(cwd), mergeUnit: mergeInProgress(cwd, units) };
}

// ---- next ----

const ids = (docs) => docs.map((u) => u.id).join(' ');
const action = (kind, key, data = {}) => ({ kind, key, line: msg(key, data) });
const priorityOf = (u) => Number(u.fm.priority ?? 0);

export function nextAction(st) {
  const rel = (dir) => relative(st.cwd, join(st.bundle, dir)) || dir;
  if (st.mergeUnit) return action('act', 'nextContinueMerge', { unit: st.mergeUnit });

  const stale = [...st.requirements, ...st.intents, ...st.units].filter((d) => d.state === 'stale');
  if (stale.length) return action(...(st.auto.includes(S.auto[0]) ? ['act', 'nextAutoApprove'] : ['human', 'nextReapprove']), { docs: ids(stale) });

  const intent = st.intents.find((i) => i.state !== 'released');
  if (!intent && !st.intents.length && !st.units.length) {
    if (st.profile.adopted) return action('human', 'nextMigrate', { dir: rel(config.grid.intents), commit: String(st.profile.adopted).slice(0, 12) });
    return action('human', 'nextNoIntent', { dir: rel(config.grid.intents) });
  }
  if (intent && intent.state === 'draft') return action('human', 'nextApproveIntent', { intent: intent.id });
  if (intent && intent.state === 'approved' && !intent.units.length) return action('act', 'nextDraftUnits', { intent: intent.id, dir: rel(config.grid.units) });

  const scope = st.units.filter((u) => !u.fm.intent || u.fm.intent === intent?.id);
  const cited = new Set([...(intent?.requirements ?? []), ...scope.filter((u) => u.state !== 'merged').flatMap((u) => u.requirements)]);
  const draftReqs = st.requirements.filter((r) => r.state === 'draft' && cited.has(r.id));
  if (draftReqs.length) return action('human', 'nextApproveRequirements', { reqs: ids(draftReqs) });
  const drafts = scope.filter((u) => u.state === 'draft');
  if (drafts.length) return action(...(st.auto.includes(S.auto[1]) && drafts.every((u) => u.lane === 'quick') ? ['act', 'nextAutoApprove'] : ['human', 'nextApprovePlan']), { docs: ids(drafts), units: ids(drafts) });

  const merged = (id) => st.units.find((x) => x.id === id)?.state === 'merged';
  const reviewed = scope.find((u) => u.state === 'reviewed' && !u.fm.hold && u.depends.every(merged));
  if (reviewed) return action('act', 'nextMerge', { unit: reviewed.id });
  const gated = scope.find((u) => u.state === 'gated');
  if (gated) return action('human', 'nextGated', { unit: gated.id, codes: readJson(runtimeFile(st.cwd, 'gates', gated.id)).codes.join(', ') });
  const escalated = scope.find((u) => u.state === 'escalated');
  if (escalated) return action('human', 'nextEscalated', { unit: escalated.id });
  const stopped = scope.find((u) => u.state === 'stopped');
  if (stopped) return action('act', 'nextStopped', { unit: stopped.id, reason: String(stopped.report.stop ?? stopped.report.summary ?? '') });
  const fix = scope.find((u) => u.state === 'fix');
  if (fix) return action('act', 'nextFixRound', { unit: fix.id });
  const reported = scope.find((u) => u.state === 'reported');
  if (reported) return action('act', 'nextReview', { unit: reported.id, focus: reported.focus, model: st.profile.models.review });
  const lost = scope.find((u) => u.state === 'building' && !u.fresh);
  if (lost) return action('act', 'nextRestart', { unit: lost.id, branch: branchOf(lost.id) });

  const inFlight = scope.filter((u) => ['building', 'reviewing'].includes(u.state));
  const max = st.profile.parallel.max;
  const picked = [];
  const ready = scope.filter((u) => u.state === 'approved').sort((a, b) => priorityOf(b) - priorityOf(a) || byId(a, b));
  for (const u of ready.filter((x) => !x.fm.hold)) {
    if (inFlight.length + picked.length >= max) break;
    const clash = [...inFlight, ...picked].some((o) => u.scope.some((g) => o.scope.some((h) => overlaps(g, h))));
    if (!clash) picked.push(u);
  }
  if (picked.length) return action('act', 'nextBuild', { units: picked.map((u) => u.id).join(', '), cards: picked.map((u) => `aidlc card ${u.id}`).join(', ') });
  if (inFlight.length) return action('wait', 'nextWait', { units: inFlight.map((u) => u.id).join(', ') });
  const held = scope.filter((u) => u.fm.hold && ['approved', 'reviewed'].includes(u.state));
  if (held.length) return action('human', 'nextHeld', { units: held.map((u) => u.id).join(', ') });
  if (intent?.state === 'merged') return action('human', 'nextRelease', { intent: intent.id });
  return action('human', 'nextIdle');
}

// ---- Commands ----

function findDoc(cwd, bundle, name) {
  const path = resolve(cwd, name);
  if (existsSync(path)) return path;
  const plan = readPlan(bundle);
  const hit = [...plan.units, ...plan.intents, ...plan.requirements].find((d) => d.id === reqIdOf(name));
  if (!hit) throw new UsageError(msg('noDoc', { name }));
  return hit.file;
}

function readStdin(ctx) {
  return ctx.stdin ? ctx.stdin() : readFileSync(0, 'utf8');
}

function parseObject(text, name) {
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!isMap(data)) throw new UsageError(msg('badJson', { name }));
  return data;
}

// Sets or removes one top-level frontmatter field of a plan doc: an owner instruction (docs/design/state.md).
function setField(cwd, name, key, value) {
  const file = findDoc(cwd, bundleOf(cwd, loadProfile(cwd).profile), name);
  const lines = readFileSync(file, 'utf8').split('\n');
  const end = lines.indexOf('---', 1);
  const kept = lines.filter((l, k) => !(k > 0 && k < end && l.startsWith(`${key}:`)));
  if (value !== null) kept.splice(kept.indexOf('---', 1), 0, `${key}: ${value}`);
  writeFileSync(file, kept.join('\n'));
  return done(msg('recorded', { what: `${key} ${value ?? S.off}`, unit: name }));
}

const usage = (key) => { throw new UsageError(msg(key, {})); };
const humanGate = (a) => (a.kind === 'human' ? config.exit.blocked : config.exit.ok);

export const commands = {
  status(args, { cwd }) {
    const st = readState(cwd);
    const next = nextAction(st);
    const lines = [];
    for (const i of st.intents) lines.push(msg('statusIntent', { id: i.id, state: i.state, title: i.fm.title ?? '' }));
    for (const u of st.units.filter((x) => x.state !== 'merged' || !st.intents.some((i) => i.state === 'released' && i.id === x.fm.intent))) {
      lines.push(msg('statusUnit', { id: u.id, state: u.state, title: u.fm.title ?? '' }));
    }
    const delivered = new Set(st.units.filter((u) => u.state === 'merged').flatMap((u) => u.requirements));
    const open = st.requirements.filter((r) => !delivered.has(r.id));
    const tail = (open.length ? msg('statusUncovered', { reqs: ids(open) }) : '') + msg('statusNext', { line: next.line });
    let out = '';
    for (let k = 0; k < lines.length; k++) {
      const more = msg('statusMore', { count: lines.length - k });
      if ((out + lines[k] + more + tail).length > S.statusMax) { out += more; break; }
      out += lines[k];
    }
    return done(out + tail, humanGate(next));
  },

  next(args, { cwd }) {
    const next = nextAction(readState(cwd));
    return done(msg('nextLine', next), humanGate(next));
  },

  approve(args, { cwd }) {
    const by = tryGit(cwd, 'config', 'user.email');
    if (!by) throw new UsageError(msg('noEmail', {}));
    const { profile } = loadProfile(cwd);
    const bundle = bundleOf(cwd, profile);
    const at = new Date().toISOString(); // to the millisecond: review rounds are compared with it
    const auto = args.includes(S.autoFlag) && delegated(cwd);
    let out = '';
    for (const name of args.filter((a) => a !== S.autoFlag)) {
      const file = findDoc(cwd, bundle, name);
      const text = readFileSync(file, 'utf8');
      const doc = parseDoc(text);
      if (!S.approvable.includes(String(doc.fm?.type))) throw new UsageError(msg('notApprovable', { name }));
      const quick = doc.fm.type === S.unitType && approval(doc) === 'draft' && computeLane(list(doc.fm.scope), profile).lane === 'quick';
      const cls = approval(doc) === 'stale' ? S.auto[0] : quick ? S.auto[1] : null;
      if (auto && !auto.includes(cls)) throw new UsageError(msg('notDelegated', { name }));
      writeFileSync(file, stamp(text, auto ? S.agent : S.human + by, at));
      out += msg('approved', { doc: relative(cwd, file) });
    }
    return done(out);
  },

  delegate(args, { cwd }) {
    if (!args.length || args.some((a) => ![...S.auto, S.off].includes(a))) usage('delegateUsage');
    const data = readJson(personal(cwd)) ?? {};
    const auto = args.includes(S.off) ? [] : args;
    writeJson(personal(cwd), { ...data, approvals: { ...data.approvals, auto } });
    return done(msg('delegated', { classes: auto.join(', ') || S.off }));
  },

  hold: ([unit, off], { cwd }) => (unit && [undefined, S.off].includes(off) ? setField(cwd, unit, 'hold', off ? null : true) : usage('holdUsage')),
  priority: ([unit, n], { cwd }) => (unit && /^-?\d+$/.test(n ?? '') ? setField(cwd, unit, 'priority', Number(n)) : usage('priorityUsage')),

  report(args, ctx) {
    const unit = args[0];
    if (!unit) throw new UsageError(msg('noDoc', { name: '' }));
    const data = parseObject(readStdin(ctx), 'report');
    writeJson(runtimeFile(ctx.cwd, 'reports', unit), { ...data, unit, at: new Date().toISOString() });
    return done(msg('recorded', { what: 'report', unit }));
  },

  review(args, ctx) {
    const { cwd } = ctx;
    const [sub, unit, file] = args;
    if (sub !== 'record' || !unit || !file) throw new UsageError(msg('reviewUsage', {}));
    if (file !== S.stdin && !existsSync(resolve(cwd, file))) throw new UsageError(msg('noSuchPath', { name: file }));
    const data = parseObject(file === S.stdin ? readStdin(ctx) : readFileSync(resolve(cwd, file), 'utf8'), file);
    if (!S.verdicts.includes(data.verdict)) throw new UsageError(msg('badVerdict', { verdicts: S.verdicts.join(', ') }));
    const { profile } = loadProfile(cwd);
    if (!tryGit(cwd, 'rev-parse', '-q', '--verify', branchOf(unit))) throw new UsageError(msg('noBranch', { branch: branchOf(unit) }));
    const target = runtimeFile(cwd, 'reviews', unit);
    const prior = readJson(target)?.rounds ?? [];
    const focus = data.focus ?? S.focus;
    // A second `fix` in the same focus since the unit's last approval becomes `escalate`: the owner decides.
    const doc = readPlan(bundleOf(cwd, profile)).units.find((u) => u.id === unit)?.doc;
    const since = doc ? approvedAt(doc, [S.human]) : 0;
    const again = roundsOf({ rounds: prior }, focus).some((r) => r.verdict === 'fix' && !beforeApproval(r, since));
    const verdict = data.verdict === 'fix' && again ? 'escalate' : data.verdict;
    const card = readJson(runtimeFile(cwd, 'cards', unit))?.hash ?? null;
    const round = { ...data, focus, verdict, card, diffHash: diffHash(cwd, baseOf(profile), unit), at: new Date().toISOString() };
    writeJson(target, { unit, rounds: [...prior, round] });
    return done(msg('recorded', { what: verdict, unit }));
  },
};
