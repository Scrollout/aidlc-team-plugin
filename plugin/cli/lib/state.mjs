// State: derives unit and intent states from git and the bundle, stamps approvals, picks the next action
// and records builder reports and reviewer verdicts (docs/design/state.md). Nothing here is a ledger.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { config, done, isMap, list, readJson, UsageError, relPath } from './config.mjs';
import { msg } from './template.mjs';
import { loadProfile } from './profile.mjs';
import { parseDoc } from './okf.mjs';
import { acsOf, computeLane, overlaps, readPlan, reqId as reqIdOf } from './grid.mjs';

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
// Bounded runtime counters the retro reads and resets (docs/design/steering.md#3-across-intents-the-retro).
export const statsFile = (cwd) => join(aidlcDir(cwd), config.retro.stats);
export function bump(cwd, kind, key) {
  const st = readJson(statsFile(cwd)) ?? {}; // `since` is the last retro's reset
  if (config.retro.lists.includes(kind)) st[kind] = [...(st[kind] ?? []), key].slice(-config.retro.keep);
  else st[kind] = { ...st[kind], [key]: (st[kind]?.[key] ?? 0) + 1 };
  writeJson(statsFile(cwd), st);
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
export const events = (fm) => (isMap(fm.verified) ? [fm.verified] : Array.isArray(fm.verified) ? fm.verified.filter(isMap) : []);

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

// The owner's run mode and the last owner prompt, as status shows them (docs/design/approvals.md#owner-prompts).
export function ownerLines(cwd) {
  const run = readJson(personal(cwd))?.run;
  const prompt = readJson(join(aidlcDir(cwd), config.hooks.prompts))?.at(-1);
  return (run ? msg('statusRun', { run: msg('runLine', { mode: run.mode, stop: list(run.stop), report: list(run.report) }) }) : '')
    + (prompt ? msg('statusPrompt', { command: prompt.command, state: prompt.ran ? config.hooks.promptStates[1] : config.hooks.promptStates[0], at: prompt.ran ?? prompt.at }) : '');
}

// The text of a doc as last approved: the newest commit of it whose content matches its verified_hash.
function approvedText(cwd, file, hash) {
  const path = relPath(git(cwd, 'rev-parse', '--show-toplevel'), file);
  for (const sha of (tryGit(cwd, 'log', '--format=%H', '--', path) ?? '').split('\n').filter(Boolean)) {
    const text = execFileSync('git', ['show', `${sha}:${path}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); // untrimmed: the hash covers the last newline
    if (hashDoc(parseDoc(text)) === hash) return text;
  }
  return null;
}
const acLines = (doc) => acsOf(doc).map((a) => a.text.trim()).join('\n');

// The latest approval of a doc by one of `by`, in epoch ms (0 when none). Answering an escalation takes the
// owner (human: only); a delegated re-approval of a fixed spec is enough to restart a stopped builder.
export const approvedAt = (doc, by = S.approvers) => Math.max(0, ...events(doc.fm).filter((e) => by.some((b) => String(e.by ?? '').startsWith(b))).map((e) => Date.parse(String(e.at)) || 0));
const beforeApproval = (round, at) => Date.parse(round.at) < at;

// A unit's review rounds. An escalation the owner answered by re-approving the unit counts as answered: the unit
// goes back to review, and the card lists those findings for the reviewer to check again (docs/design/verification.md).
export function readReview(cwd, unit, doc) {
  const review = readJson(runtimeFile(cwd, 'reviews', unit));
  const at = doc ? approvedAt(doc, [S.human]) : 0;
  const escalate = S.verdicts[2];
  // The owner's re-approval answers an escalation: its findings are answered by the spec change, and a review follows.
  return review && { ...review, rounds: review.rounds.map((r) => (r.verdict === escalate && at && beforeApproval(r, at) ? { ...r, verdict: S.answered } : r)) };
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

export const heartbeatAt = (cwd, unit, kind = S.heartbeats) => {
  const file = join(aidlcDir(cwd), kind, unit);
  return existsSync(file) ? statSync(file).mtimeMs : 0;
};
export const heartbeatFresh = (cwd, unit, now = Date.now(), kind = S.heartbeats) => now - heartbeatAt(cwd, unit, kind) < S.heartbeatMs;

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

  const answered = researched(bundle);
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
    // A builder launched after the stop report has taken over: the unit reads as building.
    else if (report?.status === S.stopped && Date.parse(report.at) > approvedAt(u.doc)
      && !(review?.rounds ?? []).some((r) => r.at > report.at)
      && !(heartbeatFresh(cwd, u.id, now) && heartbeatAt(cwd, u.id) > Date.parse(report.at))) state = 'stopped';
    else if (!u.depends.every((d) => merged.has(d))) state = 'blocked';
    else if (branches.has(branchOf(u.id))) {
      // The last verdict of each required focus, counted only while it is for the current diff.
      // A quick-lane unit gets no review: its report alone makes it ready to merge.
      const quick = lane === 'quick';
      const hash = diffHash(cwd, base, u.id);
      const verdicts = (quick ? [] : [...reviewFocuses(cwd, profile, base, u.id).keys()]).map((f) => {
        const last = roundsOf(review, f).at(-1);
        return { focus: f, verdict: last?.diffHash === hash && !(report?.at > last.at) ? last.verdict : null }; // a later report asks for a new verdict
      });
      const has = (v) => verdicts.some((x) => x.verdict === v);
      const lastAt = review?.rounds?.at(-1)?.at;
      focus = verdicts.find((x) => x.verdict !== 'pass')?.focus ?? null;
      if (has('escalate')) state = 'escalated';
      else if (has('fix')) state = heartbeatFresh(cwd, u.id, now) ? 'building' : 'fix';
      else if (!focus && (!quick || report)) {
        const gate = readJson(runtimeFile(cwd, 'gates', u.id));
        state = gate?.diffHash === hash && gate.base === tryGit(cwd, 'rev-parse', base) ? 'gated' : 'reviewed';
      }
      else if (has('pass') || has(S.answered) || (report && report.status !== S.stopped && (!lastAt || report.at > lastAt) && Date.parse(report.at) > approvedAt(u.doc))) {
        state = heartbeatFresh(cwd, u.id, now, S.reviewing) ? 'reviewing' : 'reported';
      }
      else state = 'building';
    } else state = heartbeatFresh(cwd, u.id, now) ? 'building' : 'approved';
    return { ...u, lane, state, focus, fresh: heartbeatFresh(cwd, u.id, now), report, review, held: Boolean(u.fm.hold) && !answered.has(researchOf(u)) }; // an answered research hold no longer holds
  });

  const intents = plan.intents.sort(byId).map((i) => {
    const own = units.filter((u) => u.fm.intent === i.id);
    const complete = own.length > 0 && own.every((u) => u.state === 'merged');
    const released = complete && own.every((u) => (tryGit(cwd, 'tag', '--contains', merged.get(u.id)) ?? '') !== '');
    return { ...i, state: released ? 'released' : complete ? 'merged' : approval(i.doc), units: own };
  });
  const requirements = plan.requirements.map((r) => ({ ...r, state: approval(r.doc) }));
  return { cwd, profile, base, bundle, intents, units, requirements, answered, auto: delegated(cwd), mergeUnit: mergeInProgress(cwd, units) };
}

// ---- next ----

const ids = (docs) => docs.map((u) => u.id).join(' ');
// An owner step starts with the owner badge, a refusal or stop with the stop badge; the lead's own steps carry none.
const badgeOf = (kind, key) => (S.badges.stops.includes(key) ? S.badges.stop : kind === 'human' ? S.badges.owner : '');
const action = (kind, key, data = {}) => ({ kind, key, line: badgeOf(kind, key) + msg(key, data) });
const priorityOf = (u) => Number(u.fm.priority ?? 0);

// Open points of a draft: frontmatter fields and sections still holding a template placeholder, or items under
// the open-questions heading (docs/design/state.md). Plan fields (a hold's question) are not doc content.
const PLACEHOLDER = /<[^<>\n]+>/;
export function openPoints(doc) {
  const points = new Set();
  doc.lines.slice(1, doc.body).forEach((l) => { const m = /^(\w+):(.*)$/.exec(l); if (m && !S.hashExclude.includes(m[1]) && PLACEHOLDER.test(m[2])) points.add(m[1]); });
  let heading = '';
  for (const line of doc.lines.slice(doc.body)) {
    const h = /^#+\s+(.+)$/.exec(line);
    if (h) heading = h[1].trim();
    else if (/^\s*(?:[-*]\s+)?<[^<>]+>\s*$/.test(line) || (heading === S.openQuestions && /^\s*[-*]\s+\S/.test(line))) points.add(heading);
  }
  return [...points];
}

// Draft Decision docs the units' bodies link to: approved with the units (docs/design/approvals.md).
// The Decision docs the given docs link to, as { file, doc }; `next` asks for the drafts with their units.
export function decisionsOf(st, docs) {
  const out = new Map();
  for (const u of docs) {
    for (const [, link] of u.doc.lines.slice(u.doc.body).join('\n').matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
      const file = link.startsWith('/') ? join(st.bundle, link) : resolve(dirname(u.file), link);
      const doc = existsSync(file) ? parseDoc(readFileSync(file, 'utf8')) : null;
      if (doc?.fm?.type === S.decisionType) out.set(file, { file, doc });
    }
  }
  return [...out.values()];
}
const citedDecisions = (st, units) => decisionsOf(st, units).filter((d) => approval(d.doc) === 'draft').map((d) => relPath(st.cwd, d.file));

// The owner gate of steps 2-5 (docs/design/state.md#next) and the docs it waits on, or the lead's own step.
function gateOf(st, intent, scope) {
  const rel = (dir) => relPath(st.cwd, join(st.bundle, dir)) || dir;
  const gate = (key, docs, data, kind = 'human') => ({ action: action(kind, key, data), docs: new Set(docs) });
  const stale = [...st.requirements, ...st.intents, ...st.units].filter((d) => d.state === 'stale');
  if (stale.length) {
    const decisions = citedDecisions(st, stale.filter((d) => st.units.includes(d)));
    const docs = [ids(stale), ...decisions].join(' ');
    return gate(...(st.auto.includes(S.auto[0]) && !decisions.length ? ['nextAutoApprove', stale.map((d) => d.id), { docs }, 'act'] : ['nextReapprove', stale.map((d) => d.id), { docs }]));
  }
  const open = [...st.requirements, ...st.intents, ...st.units].filter((d) => d.state === 'draft').map((d) => ({ d, points: openPoints(d.doc) })).find((x) => x.points.length);
  // An open conversation with the owner comes before any unit work: no docs, so nothing counts as independent.
  if (open) return gate('nextOpenDraft', [], { doc: open.d.id, points: open.points.join(', '), file: relPath(st.cwd, open.d.file) });
  if (!intent && !st.intents.length && !st.units.length) {
    if (st.profile.adopted) return gate('nextMigrate', [], { dir: rel(config.grid.intents), commit: String(st.profile.adopted).slice(0, 12) });
    return gate('nextNoIntent', [], { dir: rel(config.grid.intents) });
  }
  if (intent && intent.state === 'draft') return gate('nextApproveIntent', [intent.id], { intent: intent.id });
  if (intent && intent.state === 'approved' && !intent.units.length) return gate('nextDraftUnits', [], { intent: intent.id, dir: rel(config.grid.units) }, 'act');
  const cited = new Set([...(intent?.requirements ?? []), ...scope.filter((u) => u.state !== 'merged').flatMap((u) => u.requirements)]);
  const draftReqs = st.requirements.filter((r) => r.state === 'draft' && cited.has(r.id));
  if (draftReqs.length) return gate('nextApproveRequirements', draftReqs.map((r) => r.id), { reqs: ids(draftReqs) });
  const drafts = scope.filter((u) => u.state === 'draft');
  if (!drafts.length) return null;
  const decisions = citedDecisions(st, drafts);
  const docs = [ids(drafts), ...decisions].join(' ');
  const auto = st.auto.includes(S.auto[1]) && drafts.every((u) => u.lane === 'quick') && !decisions.length;
  return gate(auto ? 'nextAutoApprove' : 'nextApprovePlan', drafts.map((u) => u.id), { docs, units: docs }, auto ? 'act' : 'human');
}

// AC tags that no file on the unit branch carries outside the bundle, as the gate looks for them.
export function untagged(st, u) {
  const tags = u.acs.map((a) => `${u.id}/${a.id}`);
  if (!tags.length) return [];
  const top = git(st.cwd, 'rev-parse', '--show-toplevel');
  const bundle = relPath(top, st.bundle);
  const out = tryGit(top, 'grep', '-h', '-o', '-F', ...tags.flatMap((t) => ['-e', t]), branchOf(u.id), '--', '.', ...(bundle ? [`:(exclude)${bundle}/**`] : []));
  const found = new Set((out ?? '').split('\n'));
  return tags.filter((t) => !found.has(t));
}

// Steps 6-12 for the given units; a held unit gets no action until the hold is released.
function unitWork(st, scope) {
  const merged = (id) => st.units.find((x) => x.id === id)?.state === 'merged';
  const live = scope.filter((u) => !u.held);
  // A merge is offered only when each AC has a tagged test on the branch; a builder sent back for one is waited for.
  const backAtWork = [];
  for (const u of live.filter((x) => x.state === 'reviewed' && x.depends.every(merged))) {
    const missing = u.lane === 'quick' ? [] : untagged(st, u);
    if (!missing.length) return action('act', 'nextMerge', { unit: u.id });
    if (!u.fresh) return action('act', 'nextUntagged', { unit: u.id, tags: missing.join(', ') });
    backAtWork.push(u);
  }
  const gated = live.find((u) => u.state === 'gated');
  if (gated) return action('human', 'nextGated', { unit: gated.id, codes: readJson(runtimeFile(st.cwd, 'gates', gated.id)).codes.join(', ') });
  const escalated = live.find((u) => u.state === 'escalated');
  if (escalated) return action('human', 'nextEscalated', { unit: escalated.id });
  const stopped = live.find((u) => u.state === 'stopped');
  if (stopped) return action('act', 'nextStopped', { unit: stopped.id, reason: String(stopped.report.stop ?? stopped.report.summary ?? '') });
  const fix = live.find((u) => u.state === 'fix');
  if (fix) return action('act', 'nextFixRound', { unit: fix.id });
  const reported = live.find((u) => u.state === 'reported');
  if (reported) return action('act', 'nextReview', { unit: reported.id, focus: reported.focus, model: st.profile.models.review });
  const lost = live.find((u) => u.state === 'building' && !u.fresh);
  if (lost) return action('act', 'nextRestart', { unit: lost.id, branch: branchOf(lost.id) });
  // A builder still holding a merged unit's worktree: the merge could not remove it.
  const trees = git(st.cwd, 'worktree', 'list', '--porcelain').split('\n\n');
  for (const u of st.units.filter((x) => x.state === 'merged')) {
    const tree = trees.find((w) => w.split('\n').includes(`branch refs/heads/${branchOf(u.id)}`));
    if (tree) return action('act', 'nextWorktreeLeft', { unit: u.id, path: tree.split('\n')[0].replace(/^worktree /, ''), branch: branchOf(u.id) });
  }

  const inFlight = [...scope.filter((u) => ['building', 'reviewing'].includes(u.state)), ...backAtWork];
  const max = st.profile.parallel.max;
  const picked = [];
  const ready = live.filter((u) => u.state === 'approved').sort((a, b) => priorityOf(b) - priorityOf(a) || byId(a, b));
  for (const u of ready) {
    if (inFlight.length + picked.length >= max) break;
    const clash = [...inFlight, ...picked].some((o) => u.scope.some((g) => o.scope.some((h) => overlaps(g, h))));
    if (!clash) picked.push(u);
  }
  if (picked.length) return action('act', 'nextBuild', { units: picked.map((u) => u.id).join(', '), cards: picked.map((u) => `aidlc card ${u.id}`).join(', ') });
  if (inFlight.length) return action('wait', 'nextWait', { units: inFlight.map((u) => u.id).join(', ') });
  const held = scope.filter((u) => u.held && u.state !== 'merged');
  if (held.length) return action('human', 'nextHeld', { units: held.map((u) => (u.fm.hold === true ? u.id : msg('heldReason', { unit: u.id, reason: u.fm.hold }))).join(', ') });
  return null;
}

// An action auto mode refused at this commit goes to the owner, not demanded again (docs/design/state.md#next).
export const hostDeniedFile = (cwd) => join(aidlcDir(cwd), S.hostDenied);
export function nextAction(st) {
  const next = pickAction(st);
  const refused = next.kind === 'act' && /: aidlc ([^()]+)$/.exec(next.line)?.[1];
  const head = refused && tryGit(st.cwd, 'rev-parse', 'HEAD');
  if (!refused || !(readJson(hostDeniedFile(st.cwd)) ?? []).some((d) => d.head === head && String(d.command).includes(refused))) return next;
  return action('human', 'nextHostDenied', { refused, command: refused.split(' ').filter((a) => a !== S.autoFlag).join(' ') });
}

// A question the lead held for research (decision 0010) and the questions the bundle's research docs answer.
export const researchOf = (doc) => (typeof doc.fm.hold === 'string' && doc.fm.hold.startsWith(S.researchHold) ? doc.fm.hold.slice(S.researchHold.length).trim() : null);
function researched(bundle) {
  const dir = join(bundle, config.grid.research);
  return new Set((existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith(config.okf.ext)).map((f) => parseDoc(readFileSync(join(dir, f), 'utf8')).fm?.question));
}

function pickAction(st) {
  if (st.mergeUnit) return action('act', 'nextContinueMerge', { unit: st.mergeUnit });
  const asked = [...st.requirements, ...st.intents, ...st.units].find((d) => researchOf(d) && !st.answered.has(researchOf(d)));
  if (asked) return heartbeatFresh(st.cwd, asked.id, Date.now(), S.researching) ? action('wait', 'nextWaitResearch', { doc: asked.id }) : action('act', 'nextResearch', { doc: asked.id, model: st.profile.models.research });
  const unreleased = st.intents.find((i) => i.state === 'merged'); // its release does not hold back the next intent
  const intent = st.intents.find((i) => !['released', 'merged'].includes(i.state)) ?? unreleased;
  const scope = st.units.filter((u) => !u.fm.intent || u.fm.intent === intent?.id);
  const gate = gateOf(st, intent, scope);
  if (gate?.action.kind === 'act') return gate.action;
  if (gate) {
    // Units that do not wait on the gate's docs go first, so builders run while the owner answers.
    const waits = (u) => [u.id, u.fm.intent, ...u.requirements, ...u.depends].some((d) => gate.docs.has(d));
    const work = unitWork(st, gate.docs.size ? scope.filter((u) => !waits(u)) : []);
    return work?.kind === 'act' ? work : gate.action;
  }
  const work = unitWork(st, scope);
  if (work) return work;
  if (unreleased) return action('human', 'nextRelease', { intent: unreleased.id });
  return action('human', 'nextIdle');
}

// ---- Commands ----

function findDoc(cwd, bundle, name) {
  const path = resolve(cwd, name);
  if (existsSync(path)) return path;
  const plan = readPlan(bundle);
  const hit = [...plan.units, ...plan.intents, ...plan.requirements].find((d) => reqIdOf(d.id) === reqIdOf(name));
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
    let out = ownerLines(cwd);
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
      if (auto && cls === S.auto[0] && doc.fm.type === S.unitType) {
        const before = approvedText(cwd, file, doc.fm.verified_hash);
        if (before === null || acLines(parseDoc(before)) !== acLines(doc)) throw new UsageError(msg('notDelegatedAcs', { name })); // what done means is the owner's
      }
      writeFileSync(file, stamp(text, auto ? S.agent : S.human + by, at));
      out += msg('approved', { doc: relPath(cwd, file) });
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

  mode(args, { cwd }) {
    const [mode, ...rest] = args;
    const opt = (flag) => { const k = rest.indexOf(flag); return k >= 0 ? rest[k + 1] : undefined; };
    const stop = opt('--stop');
    const data = readJson(personal(cwd)) ?? {};
    if (mode === S.off) {
      writeJson(personal(cwd), { ...data, run: undefined });
      return done(msg('modeSet', { run: S.off }));
    }
    const flags = rest.filter((_, k) => k % 2 === 0);
    if (!S.modes.includes(mode) || (stop !== undefined && !S.stops[stop]) || rest.length % 2 || flags.some((f) => !['--stop', '--report'].includes(f))) usage('modeUsage');
    const run = { mode, stop, report: opt('--report') };
    writeJson(personal(cwd), { ...data, run });
    return done(msg('modeSet', { run: msg('runLine', { mode, stop: list(stop), report: list(run.report) }) }));
  },

  hold: ([unit, ...why], { cwd }) => (unit ? setField(cwd, unit, 'hold', why[0] === S.off ? null : why.length ? JSON.stringify(why.join(' ')) : true) : usage('holdUsage')),
  priority: ([unit, n], { cwd }) => (unit && /^-?\d+$/.test(n ?? '') ? setField(cwd, unit, 'priority', Number(n)) : usage('priorityUsage')),

  report(args, ctx) {
    const unit = args[0];
    if (!unit) throw new UsageError(msg('noDoc', { name: '' }));
    const data = parseObject(readStdin(ctx), 'report');
    writeJson(runtimeFile(ctx.cwd, 'reports', unit), { ...data, unit, at: new Date().toISOString() });
    if (data.status === S.stopped) {
      bump(ctx.cwd, 'escalations', config.retro.reasons.stopped);
      bump(ctx.cwd, config.retro.stops, { unit, reason: String(data.stop ?? data.summary ?? ''), at: new Date().toISOString() }); // a restart's report replaces this one
    }
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
    // A `fix` that would start fix round `review.fixRounds + 1` in its focus since the unit's last approval
    // becomes `escalate`: the owner decides (U33).
    const planUnit = readPlan(bundleOf(cwd, profile)).units.find((u) => u.id === unit);
    const since = planUnit ? approvedAt(planUnit.doc, [S.human]) : 0;
    const limit = profile.review.fixRounds;
    const round = roundsOf({ rounds: prior }, focus).filter((r) => r.verdict === 'fix' && !beforeApproval(r, since)).length + 1;
    // A pass while an AC has no tagged test on the branch is a fix: the gate would refuse it (U32).
    const missing = data.verdict === S.verdicts[0] && planUnit ? untagged({ cwd, bundle: bundleOf(cwd, profile) }, planUnit) : [];
    if (missing.length) Object.assign(data, { verdict: 'fix', findings: missing.map((tag) => ({ path: '', line: '', claim: msg('untaggedClaim', { tag }), scenario: msg('untaggedScenario', {}), confidence: S.confirmed })) });
    if (missing.length) bump(cwd, config.retro.sendBacks, { unit, tags: missing.join(', '), at: new Date().toISOString() });
    const verdict = data.verdict === 'fix' && round > limit ? 'escalate' : data.verdict;
    const card = readJson(runtimeFile(cwd, 'cards', unit))?.hash ?? null;
    writeJson(target, { unit, rounds: [...prior, { ...data, focus, verdict, card, diffHash: diffHash(cwd, baseOf(profile), unit), at: new Date().toISOString() }] });
    if (verdict === S.verdicts[2]) bump(cwd, 'escalations', config.retro.reasons.review);
    rmSync(join(aidlcDir(cwd), S.reviewing, unit), { force: true }); // the review is no longer in flight
    const why = verdict !== data.verdict ? 'recordedEscalate' : missing.length ? 'recordedUntagged' : verdict === 'fix' ? 'recordedFix' : 'recorded';
    return done(msg(why, { what: verdict, unit, focus, tags: missing.join(', '), round, limit })); // the reviewer learns why
  },
};
