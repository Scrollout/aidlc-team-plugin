// State: derives unit and intent states from git and the bundle, stamps approvals, picks the next action
// and records builder reports and reviewer verdicts (docs/design/state.md). Nothing here is a ledger.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { bundleOf, config, QUICK, VERDICT, done, git, gitLines, isMap, list, readJson, readStdin, tryGit, UsageError, relPath } from './config.mjs';
import { finding as codeFinding, msg, render } from './template.mjs';
import { loadProfile, withDefaults } from './profile.mjs';
import { linksOf, parseDoc, sizeCap } from './okf.mjs';
import { boardBehind } from './board.mjs';
import { acsOf, computeLane, inside, lintPlan, overlaps, readPlan, reqId as reqIdOf, productGlobs, testsOnly, withIntents } from './grid.mjs';

const S = config.state;

// ---- git ----

export const aidlcDir = (cwd) => join(resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir')), S.dir);
export const runtimeFile = (cwd, kind, unit) => join(aidlcDir(cwd), S[kind], `${unit}.json`);
export const ciFile = (cwd) => join(aidlcDir(cwd), S.ci); // the base's last CI poll (docs/design/base-ci.md)
export const branchOf = (unit) => S.branchPrefix + unit;
export const baseOf = (profile) => profile.base;
// The paths a unit's branch changes since its merge base with the base branch.
export const unitPaths = (cwd, base, unit) => gitLines(cwd, 'diff', '--name-only', `${base}...${branchOf(unit)}`);
// The worktree holding each branch: branch → path.
export const worktrees = (cwd) => new Map(git(cwd, 'worktree', 'list', '--porcelain').split('\n\n')
  .flatMap((w) => [w.match(/^branch refs\/heads\/(.+)$/m)?.[1]].filter(Boolean).map((b) => [b, w.split('\n')[0].replace(/^worktree /, '')])));

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
  const paths = unitPaths(cwd, base, unit);
  const needed = new Map([[S.focus, '']]);
  for (const [focus, globs] of Object.entries(profile.focus ?? {})) {
    const path = paths.find((x) => list(globs).some((g) => overlaps('/' + x, g)));
    if (path) needed.set(focus, msg('gateFocusPath', { path, focus }));
  }
  const hit = needed.has(S.contentFocus) ? null : contentHit(cwd, profile, `${base}...${branchOf(unit)}`);
  if (hit) needed.set(S.contentFocus, msg('gateFocusContent', hit));
  return needed;
}

// The first added line in a diff range that matches a `security.content` pattern: code that needs a security
// review wherever it sits (docs/design/profile.md).
function contentHit(cwd, profile, range) {
  const patterns = list(profile.security?.content);
  if (!patterns.length) return null;
  let path = null;
  let line = 0;
  for (const l of gitLines(cwd, 'diff', '-U0', '--no-color', '--no-ext-diff', range)) {
    if (l.startsWith('+++ ')) path = l.slice(6);
    else if (l.startsWith('@@')) line = Number(l.match(/\+(\d+)/)?.[1]);
    else if (l.startsWith('+') && path) {
      const pattern = patterns.find((p) => new RegExp(p, 'i').test(l.slice(1)));
      if (pattern) return { path, line, pattern };
      line++;
    }
  }
  return null;
}

// A focus other than general keeps its last pass after a fix round when the commits since the reviewed commit
// touch none of its globs (docs/design/review-rounds.md); general always reviews the current diff.
// A verdict counts for the diff it saw, and only until a later report: a report's mutations are the reviewer's to judge.
export const verdictCurrent = (last, hash, report) => last?.diffHash === hash && !(report?.at > last.at);

export function keptPass(cwd, profile, unit, focus, last) {
  if (focus === S.focus || last?.verdict !== VERDICT.pass || !last.commit) return false;
  const paths = tryGit(cwd, 'diff', '--name-only', last.commit, branchOf(unit));
  return paths !== null && !paths.split('\n').filter(Boolean).some((x) => list(profile.focus?.[focus]).some((g) => overlaps('/' + x, g)))
    && !(focus === S.contentFocus && contentHit(cwd, profile, `${last.commit}..${branchOf(unit)}`));
}

// ---- Back-fill ----

// A path in one of the levels' test paths.
const isTestPath = (f, levels) => Object.values(levels ?? {}).some((l) => list(l?.paths).some((g) => inside('/' + f, g)));
// A unit's changes outside the test paths, the bundle and the project folder: what proof-revert reverts. None
// makes it a back-fill unit, proved by mutations instead (docs/design/backfill.md).
export const codeChanges = (paths, levels, bundleRel) => {
  const project = dirname(config.layers.find((l) => l.from === 'project').path) + '/';
  return paths.filter((f) => !isTestPath(f, levels) && !f.startsWith(bundleRel + '/') && !f.startsWith(project));
};

// The reported mutation for an AC tag.
export const mutationOf = (mutations, tag) => (Array.isArray(mutations) ? mutations : []).find((x) => x?.ac === tag);

// What a back-fill unit's mutations lack: one per AC, of a file outside the tests and the diff, whose `find`
// occurs exactly once on the unit branch. A quick-lane unit needs none; one that changes code only when it reports
// some, which may then edit its own diff (docs/design/backfill.md).
const profilePath = config.layers.find((l) => l.from === 'project').path; // a profile AC is proved by mutating it, not reverting it
function mutationProblems(cwd, profile, unit, mutations) {
  const u = readPlan(bundleOf(cwd, profile)).units.find((x) => x.id === unit);
  if (!u || computeLane(u.scope, profile).lane === QUICK) return [];
  const levels = withDefaults(profile).levels;
  const paths = unitPaths(cwd, baseOf(profile), unit);
  const code = codeChanges(paths, levels, relPath(git(cwd, 'rev-parse', '--show-toplevel'), bundleOf(cwd, profile))).length > 0;
  if (code && ![mutations].flat().some((m) => m?.ac)) return [];
  return Object.assign(u.acs.flatMap((ac) => {
    const tag = `${unit}/${ac.id}`;
    const m = mutationOf(mutations, tag);
    if (!m) return [msg('mutationMissing', { tag })];
    const text = m.path && tryGit(cwd, 'show', `${branchOf(unit)}:${m.path}`);
    const count = text && m.find ? text.split(String(m.find)).length - 1 : 0;
    if (!(count === 1 && typeof m.replace === 'string' && !isTestPath(m.path, levels) && (code || m.path === profilePath || !paths.includes(m.path)))) return [msg('mutationBad', { tag, path: m.path ?? '', count })];
    return String(m.breaks ?? '').trim() ? [] : [msg('mutationBreaks', { tag })]; // what it breaks, for the reviewer to judge (U61)
  }), { wired: code });
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
export const delegated = (cwd) => list(readJson(personal(cwd))?.approvals?.auto);

// The owner's run mode and the last owner prompt, as status shows them (docs/design/approvals.md#owner-prompts).
function ownerLines(cwd) {
  const run = readJson(personal(cwd))?.run;
  const prompt = readJson(join(aidlcDir(cwd), config.hooks.prompts))?.at(-1);
  return (run ? msg('statusRun', { run: msg('runLine', { mode: run.mode, stop: list(run.stop), report: list(run.report) }) }) : '')
    + (prompt ? msg('statusPrompt', { command: prompt.command, state: config.hooks.promptStates[prompt.ran ? 1 : prompt.refused ? 2 : 0], at: prompt.ran ?? prompt.refused ?? prompt.at }) : '');
}

// The text of a doc as last approved: the newest commit of it whose content matches its verified_hash.
function approvedText(cwd, file, hash) {
  const path = relPath(git(cwd, 'rev-parse', '--show-toplevel'), file);
  for (const sha of gitLines(cwd, 'log', '--format=%H', '--', path)) {
    const text = execFileSync('git', ['show', `${sha}:${path}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); // untrimmed: the hash covers the last newline
    if (hashDoc(parseDoc(text)) === hash) return text;
  }
  return null;
}
const acLines = (doc) => acsOf(doc).map((a) => a.text.trim()).join('\n');
// A stale unit's ACs read as last approved: a delegated re-approval keeps them, as what done means is the owner's.
const acsKept = (cwd, file, doc) => { const before = approvedText(cwd, file, doc.fm.verified_hash); return before !== null && acLines(parseDoc(before)) === acLines(doc); };

// The latest approval of a doc by one of `by`, in epoch ms (0 when none). Answering an escalation takes the
// owner (human: only); a delegated re-approval of a fixed spec is enough to restart a stopped builder.
const approvedAt = (doc, by = S.approvers) => Math.max(0, ...events(doc.fm).filter((e) => by.some((b) => String(e.by ?? '').startsWith(b))).map((e) => Date.parse(String(e.at)) || 0));
const beforeApproval = (round, at) => Date.parse(round.at) < at;

// A unit's review rounds. An escalation the owner answered by re-approving the unit counts as answered: the unit
// goes back to review, and the card lists those findings for the reviewer to check again (docs/design/verification.md).
export function readReview(cwd, unit, doc) {
  const review = readJson(runtimeFile(cwd, 'reviews', unit));
  const at = doc ? approvedAt(doc, [S.human]) : 0;
  // The owner's re-approval answers an escalation: its findings are answered by the spec change, and a review follows.
  return review && { ...review, rounds: review.rounds.map((r) => (r.verdict === VERDICT.escalate && at && beforeApproval(r, at) ? { ...r, verdict: S.answered } : r)) };
}

const plain = (v) => /^[A-Za-z0-9_@.+/][A-Za-z0-9_@:.+/ -]*$/.test(v) && !/:(\s|$)/.test(v) && !/^\d+$/.test(v);
const scalar = (v) => (typeof v === 'string' && plain(v) ? v : JSON.stringify(v));
const flowMap = (e) => `{ ${Object.entries(e).map(([k, v]) => `${k}: ${scalar(v)}`).join(', ')} }`;

// Returns the doc text with the owner's stamp: earlier events kept, one appended, status and hash set.
function stamp(text, by, at) {
  const doc = parseDoc(text);
  if (doc.error || !doc.fm) throw new UsageError(msg('fmYaml', { error: doc.error ?? '' }));
  const kept = [];
  let skipping = false;
  for (const line of doc.fmLines.slice(1, -1)) {
    const key = line.match(/^([A-Za-z_][\w-]*):/)?.[1];
    if (key) skipping = S.stampFields.includes(key);
    else if (!/^(\s|-)/.test(line) && line.trim()) skipping = false;
    if (!skipping) kept.push(line);
  }
  const all = [...events(doc.fm), { by, at }];
  const body = doc.lines.slice(doc.body).join('\n');
  const draft = ['---', ...kept, `status: ${S.stable}`, 'verified:', ...all.map((e) => `  - ${flowMap(e)}`), '---', body].join('\n');
  const hash = hashDoc(parseDoc(draft));
  return draft.replace(/\nverified:\n/, `\nverified_hash: ${hash}\nverified:\n`);
}

// How far a stamped doc is over its cap, or null; HOUSE-SIZE off counts nothing (docs/design/approvals.md).
function stampOver(stamped, doc, profile) {
  const cap = sizeCap(String(doc.fm.type), profile.docs?.caps), size = [...stamped].length;
  return profile.docs?.rules?.['HOUSE-SIZE'] !== 'off' && size > cap ? { size, cap, trim: size - cap, type: doc.fm.type } : null;
}

// HOUSE-SIZE for each draft or stale doc in `files` its next approval would take over its cap, so `check` warns before `approve` refuses.
export function stampFindings(cwd, profile, files) {
  const by = tryGit(cwd, 'config', 'user.email');
  const out = [];
  for (const file of by ? files : []) {
    const text = readFileSync(file, 'utf8'), doc = parseDoc(text);
    if (doc.error || !S.approvable.includes(String(doc.fm?.type)) || approval(doc) === 'approved') continue;
    if ([...text].length > sizeCap(String(doc.fm.type), profile.docs?.caps)) continue; // the docs check reports it already
    const over = stampOver(stamp(text, S.human + by, new Date().toISOString()), doc, profile);
    const level = config.okf.levels.includes(profile.docs?.rules?.['HOUSE-SIZE']) ? profile.docs.rules['HOUSE-SIZE'] : config.okf.codes['HOUSE-SIZE'].level;
    if (over) out.push(codeFinding(config.okf.codes, 'HOUSE-SIZE', relPath(cwd, file), 1, 'stampOver', over, level));
  }
  return out;
}

// ---- State ----

export function mergedUnits(cwd, base) {
  const out = new Map();
  const log = tryGit(cwd, 'log', base, `--format=%H%x1f%(trailers:key=${config.gate.trailers.unit},valueonly,separator=%x1e)%x1d`);
  for (const rec of (log ?? '').split('\x1d')) {
    const [sha, values] = rec.trim().split('\x1f');
    for (const v of (values ?? '').split('\x1e').map((x) => x.trim()).filter(Boolean)) if (!out.has(v)) out.set(v, sha);
  }
  return out;
}

const heartbeatAt = (cwd, unit, kind = S.heartbeats) => statSync(join(aidlcDir(cwd), kind, unit), { throwIfNoEntry: false })?.mtimeMs ?? 0;
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
  const branches = new Set(gitLines(cwd, 'for-each-ref', '--format=%(refname:short)', `refs/heads/${S.branchPrefix}`));
  const live = plan.units.filter((u) => u.fm.status !== config.grid.dropped).sort(byId);

  const answered = researched(bundle);
  const units = live.map((u) => {
    const lane = computeLane(u.scope, profile).lane;
    const needsApproval = Boolean(u.fm.intent) || lane !== QUICK;
    const approvalState = approval(u.doc);
    const report = readJson(runtimeFile(cwd, 'reports', u.id));
    const review = readReview(cwd, u.id, u.doc);
    let state;
    let focus = null;
    if (merged.has(u.id)) state = 'merged';
    else if (needsApproval && approvalState !== 'approved') state = approvalState;
    // A builder that stopped hands the unit back to the lead until the owner re-approves its fixed spec.
    // A builder launched after the stop report has taken over: the unit reads as building. The launch mark, not the
    // heartbeat, decides: the stopped builder's own last calls touch the heartbeat after its report.
    else if (report?.status === S.stopped && Date.parse(report.at) > approvedAt(u.doc)
      && !(review?.rounds ?? []).some((r) => r.at > report.at)
      && !(heartbeatAt(cwd, u.id, S.launches) > Date.parse(report.at))) state = 'stopped';
    else if (!u.depends.every((d) => merged.has(d))) state = 'blocked';
    else if (branches.has(branchOf(u.id))) {
      // The last verdict of each required focus, counted only while it is for the current diff.
      // A quick-lane unit gets no review: its report alone makes it ready to merge.
      const quick = lane === QUICK;
      const hash = diffHash(cwd, base, u.id);
      const verdicts = (quick ? [] : [...reviewFocuses(cwd, profile, base, u.id).keys()]).map((f) => {
        const last = roundsOf(review, f).at(-1);
        return { focus: f, verdict: verdictCurrent(last, hash, report) || keptPass(cwd, profile, u.id, f, last) ? last.verdict : null };
      });
      const has = (v) => verdicts.some((x) => x.verdict === v);
      const lastAt = review?.rounds?.at(-1)?.at;
      focus = verdicts.find((x) => x.verdict !== VERDICT.pass)?.focus ?? null;
      if (has(VERDICT.escalate)) state = 'escalated';
      // A fix round is in flight once a builder was launched after the verdict: the builder that reported before
      // the review keeps its heartbeat fresh for minutes (docs/design/in-flight.md).
      else if (has(VERDICT.fix)) {
        const fixAt = Math.max(0, ...(review?.rounds ?? []).filter((r) => r.verdict === VERDICT.fix).map((r) => Date.parse(r.at)));
        state = heartbeatFresh(cwd, u.id, now) && heartbeatAt(cwd, u.id, S.launches) > fixAt ? 'building' : 'fix';
      }
      else if (!focus && (!quick || report)) {
        const gate = readJson(runtimeFile(cwd, 'gates', u.id));
        // A builder launched after the gate refused it is a fix round in flight, not a merge to offer again.
        if (gate?.at && heartbeatFresh(cwd, u.id, now) && heartbeatAt(cwd, u.id, S.launches) > Date.parse(gate.at)) state = 'building';
        else state = gate?.diffHash === hash && gate.base === tryGit(cwd, 'rev-parse', base) ? 'gated' : 'reviewed';
      }
      else if (has(VERDICT.pass) || has(S.answered) || (report && report.status !== S.stopped && (!lastAt || report.at > lastAt) && Date.parse(report.at) > approvedAt(u.doc))) {
        state = heartbeatFresh(cwd, u.id, now, S.reviewing) ? 'reviewing' : 'reported';
      }
      else state = 'building';
    } else state = heartbeatFresh(cwd, u.id, now) ? 'building' : 'approved';
    return { ...u, lane, state, focus, fresh: heartbeatFresh(cwd, u.id, now), report, review, held: Boolean(u.fm.hold) && !answered.has(researchOf(u)) }; // an answered research hold no longer holds
  });

  const intents = plan.intents.sort(byId).map((i) => {
    const own = units.filter((u) => u.fm.intent === i.id);
    const complete = own.length > 0 && own.every((u) => u.state === 'merged');
    // Released: the owner tagged it, or its recorded release (and smoke) passed (docs/design/operations.md).
    const deploy = readJson(runtimeFile(cwd, 'deploys', i.id)) ?? {};
    const smoked = !profile.deploy?.smoke || (deploy.smoke?.ok && deploy.smoke.at >= deploy.release.at);
    // Ships nothing: all tests, or, with modules, merges that changed no file of the product (docs/design/operations.md).
    const changed = () => own.flatMap((u) => gitLines(cwd, 'diff', '--name-only', `${merged.get(u.id)}^1`, merged.get(u.id)));
    const nothing = complete && (testsOnly(own, profile) || ((profile.modules ?? []).length > 0 && !changed().some((f) => productGlobs(profile).some((g) => inside('/' + f, g)))));
    const released = complete && (nothing || (profile.deploy || profile.release) && Boolean(deploy.release?.ok && smoked)
      || own.every((u) => (tryGit(cwd, 'tag', '--contains', merged.get(u.id)) ?? '') !== ''));
    return { ...i, state: released ? 'released' : complete ? 'merged' : approval(i.doc), units: own, deploy };
  });
  const requirements = plan.requirements.map((r) => ({ ...r, state: approval(r.doc) }));
  return { cwd, profile, base, bundle, intents, units, requirements, decisions: bundleHeld(bundle), answered, auto: delegated(cwd), mergeUnit: mergeInProgress(cwd, units), ci: ciOf(cwd, profile, base) };
}

// With ci.wait: the base head, its remote, the last CI poll, and whether the base is red: the poll found it red and
// no merge landed since, so plan commits (the fix unit's doc) keep it red and a merged fix ends it.
function ciOf(cwd, profile, base) {
  if (!profile.ci?.wait) return null;
  const head = tryGit(cwd, 'rev-parse', base);
  const rec = readJson(ciFile(cwd));
  const red = rec?.state === 'red' && tryGit(cwd, 'rev-list', '--count', '--merges', `${rec.sha}..${head}`) === '0';
  return { head, remote: tryGit(cwd, 'rev-parse', '-q', '--verify', `${config.gate.remote}/${base}`), rec, red };
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
function openPoints(doc) {
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

// The Decision docs the given docs link to, as { file, doc }; `next` asks for the drafts with their units
// (docs/design/approvals.md).
export function decisionsOf(st, docs) {
  const out = new Map();
  for (const file of docs.flatMap((u) => linksOf(u, st.bundle))) {
    const doc = existsSync(file) ? parseDoc(readFileSync(file, 'utf8')) : null;
    if (doc?.fm?.type === config.grid.decisionType) out.set(file, { file, doc });
  }
  return [...out.values()];
}
const citedDecisions = (st, units) => decisionsOf(st, units).filter((d) => approval(d.doc) === 'draft').map((d) => relPath(st.cwd, d.file));

// The owner gate of steps 2-5 (docs/design/state.md#next) and the docs it waits on, or the lead's own step.
function gateOf(st, intent, scope) {
  const rel = (dir) => relPath(st.cwd, join(st.bundle, dir)) || dir;
  const gate = (key, docs, data, kind = 'human') => ({ action: action(kind, key, data), docs: new Set(docs) });
  const stale = [...st.requirements, ...st.intents, ...st.units, ...st.decisions.filter((d) => d.fm.type === config.grid.decisionType && approval(d.doc) === 'stale').map((d) => ({ ...d, state: 'stale' }))].filter((d) => d.state === 'stale'); // an approved decision edited is the owner's again
  if (stale.length) {
    const decisions = [...citedDecisions(st, stale.filter((d) => st.units.includes(d))), ...st.requirements.filter((r) => r.state === 'draft' && stale.some((d) => (d.requirements ?? []).includes(r.id))).map((r) => r.id)]; // and the new drafts they cite
    const docs = [ids(stale), ...decisions].join(' ');
    // A delegated re-approval keeps every unit's ACs, as `approve --auto` checks: what done means is the owner's.
    const kept = stale.filter((d) => st.units.includes(d)).every((d) => acsKept(st.cwd, d.file, d.doc));
    return gate(...(st.auto.includes(S.auto[0]) && !decisions.length && kept ? ['nextAutoApprove', stale.map((d) => d.id), { docs }, 'act'] : ['nextReapprove', stale.map((d) => d.id), { docs }]));
  }
  const open = [...st.requirements, ...st.intents, ...st.units].filter((d) => d.state === 'draft').map((d) => ({ d, points: openPoints(d.doc) })).find((x) => x.points.length);
  // An open conversation with the owner comes before any unit work: no docs, so nothing counts as independent.
  if (open) return gate('nextOpenDraft', [], { doc: open.d.id, points: open.points.join(', '), file: relPath(st.cwd, open.d.file) });
  if (!intent && !st.intents.length && !st.units.length) {
    if (st.profile.adopted) return gate('nextMigrate', [], { dir: rel(config.grid.intents), commit: String(st.profile.adopted).slice(0, 12) });
    return gate('nextNoIntent', [], { dir: rel(config.grid.intents) });
  }
  // A first approval names the draft requirements its docs cite, so one owner prompt covers them (U39).
  const draftCited = (docs) => st.requirements.filter((r) => r.state === 'draft' && docs.some((d) => d.requirements.includes(r.id)));
  if (intent && intent.state === 'draft') {
    const docs = [intent, ...draftCited([intent])];
    return gate('nextApproveIntent', docs.map((d) => d.id), { intent: ids(docs) });
  }
  // The draft decisions an approved intent links come before its units: an architecture choice shapes the cut.
  const linked = intent && intent.state === 'approved' && !intent.units.length ? decisionsOf(st, [intent]).filter((d) => approval(d.doc) === 'draft') : [];
  const unfinished = linked.find((d) => openPoints(d.doc).length);
  if (unfinished) return gate('nextFinishDecision', [], { intent: intent.id, doc: relPath(st.cwd, unfinished.file), points: openPoints(unfinished.doc).join(', ') }, 'act');
  if (linked.length) return gate('nextApproveDecisions', [], { intent: intent.id, docs: linked.map((d) => relPath(st.cwd, d.file)).join(' ') });
  if (intent && intent.state === 'approved' && !intent.units.length) return gate('nextDraftUnits', [], { intent: intent.id, dir: rel(config.grid.units) }, 'act');
  const cited = new Set([...(intent?.requirements ?? []), ...scope.filter((u) => u.state !== 'merged').flatMap((u) => u.requirements)]);
  const draftReqs = st.requirements.filter((r) => r.state === 'draft' && cited.has(r.id));
  const drafts = scope.filter((u) => u.state === 'draft');
  if (!drafts.length) return draftReqs.length ? gate('nextApproveRequirements', draftReqs.map((r) => r.id), { reqs: ids(draftReqs) }) : null;
  const decisions = citedDecisions(st, drafts);
  const reqs = draftReqs; // the ones the intent and these units cite
  const docs = [ids([...drafts, ...reqs]), ...decisions].join(' ');
  const auto = st.auto.includes(S.auto[1]) && drafts.every((u) => u.lane === QUICK) && !decisions.length && !reqs.length;
  return gate(auto ? 'nextAutoApprove' : 'nextApprovePlan', [...drafts, ...reqs].map((d) => d.id), { docs, units: docs }, auto ? 'act' : 'human');
}

// AC tags that no file on the unit branch carries outside the bundle, as the gate looks for them.
function untagged(st, u) {
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
  const fixOnly = (u) => !st.ci?.red || !u.fm.intent; // on a red base only fix units build or merge
  // A merge is offered only when each AC has a tagged test on the branch; a builder sent back for one is waited for.
  const backAtWork = [];
  for (const u of live.filter((x) => x.state === 'reviewed' && x.depends.every(merged) && fixOnly(x))) {
    const missing = u.lane === QUICK ? [] : untagged(st, u);
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
  const trees = worktrees(st.cwd);
  const left = st.units.find((x) => x.state === 'merged' && trees.has(branchOf(x.id)));
  if (left) return action('act', 'nextWorktreeLeft', { unit: left.id, path: trees.get(branchOf(left.id)), branch: branchOf(left.id) });

  const inFlight = [...scope.filter((u) => u.state === 'reviewing' || (u.state === 'building' && u.fresh)), ...backAtWork]; // a held unit's quiet builder is not in flight
  const max = st.profile.parallel.max;
  const picked = [];
  const ready = live.filter((u) => u.state === 'approved' && fixOnly(u)).sort((a, b) => priorityOf(b) - priorityOf(a) || byId(a, b));
  for (const u of ready) {
    if (inFlight.length + picked.length >= max) break;
    const clash = [...inFlight, ...picked].some((o) => u.scope.some((g) => o.scope.some((h) => overlaps(g, h))));
    if (!clash) picked.push(u);
  }
  // With ci.wait, builders start on a pushed base whose CI is known; on a red one the fix unit builds.
  const ci = st.ci && !st.ci.red && (st.ci.head !== st.ci.remote ? 'nextCiPush' : st.ci.rec?.sha !== st.ci.head || st.ci.rec.state === 'pending' ? 'nextCiWait' : null);
  if (picked.length && ci) return action('act', ci);
  if (picked.length) return action('act', 'nextBuild', { units: picked.map((u) => u.id).join(', '), cards: picked.map((u) => msg('cardCommand', { unit: u.id })).join(', ') });
  if (inFlight.length) return action('wait', 'nextWait', { units: inFlight.map((u) => u.id).join(', ') });
  const held = scope.filter((u) => u.held && u.state !== 'merged');
  if (held.length) return action('human', 'nextHeld', { units: held.map((u) => (u.fm.hold === true ? u.id : msg('heldReason', { unit: u.id, reason: u.fm.hold }))).join(', ') });
  return null;
}

// An action auto mode refused at this commit goes to the owner, not demanded again (docs/design/state.md#next).
export const hostDeniedFile = (cwd) => join(aidlcDir(cwd), S.hostDenied);
export function nextAction(st) {
  const next = pickAction(st);
  const refused = next.kind === 'act' && new RegExp(S.refusedLine).exec(next.line)?.[1];
  const head = refused && tryGit(st.cwd, 'rev-parse', 'HEAD');
  if (!refused || !(readJson(hostDeniedFile(st.cwd)) ?? []).some((d) => d.head === head && String(d.command).includes(refused))) return next;
  return action('human', 'nextHostDenied', { refused, command: refused.split(' ').filter((a) => a !== S.autoFlag).join(' ') });
}

// A question the lead held for research (decision 0010) and the questions the bundle's research docs answer.
export const researchOf = (doc) => (typeof doc.fm.hold === 'string' && doc.fm.hold.startsWith(S.researchHold) ? doc.fm.hold.slice(S.researchHold.length).trim() : null);
// The decisions, by number as the owner types them: an architecture choice is a usual research question (second project).
// The other docs a research question can be held on: decisions by number, any other doc by its name (second project).
const bundleHeld = (bundle) => (existsSync(bundle) ? readdirSync(bundle, { recursive: true }).map(String) : [])
  .filter((f) => f.endsWith(config.okf.ext) && ![config.okf.index, config.okf.log].includes(basename(f)))
  .map((f) => ({ f, fm: parseDoc(readFileSync(join(bundle, f), 'utf8')).fm ?? {} }))
  .filter(({ fm }) => fm.type === config.grid.decisionType || researchOf({ fm }))
  .map(({ f, fm }) => ({ id: fm.type === config.grid.decisionType ? basename(f).match(/^(\d+)-/)?.[1] ?? basename(f, config.okf.ext) : basename(f, config.okf.ext), file: join(bundle, f), fm, doc: parseDoc(readFileSync(join(bundle, f), 'utf8')) }));
// The doc a research question is held on, named as `hold` takes it.
export const heldDoc = (st, name) => { const file = findDoc(st.cwd, st.bundle, String(name)); return [...st.requirements, ...st.intents, ...st.units, ...st.decisions].find((d) => d.file === file); };
function researched(bundle) {
  const dir = join(bundle, config.grid.research);
  return new Set((existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith(config.okf.ext)).map((f) => parseDoc(readFileSync(join(dir, f), 'utf8')).fm?.question));
}

function pickAction(st) {
  if (st.mergeUnit) return action('act', 'nextContinueMerge', { unit: st.mergeUnit });
  const unreleased = st.intents.find((i) => i.state === 'merged'); // its release does not hold back the next intent
  const ops = unreleased && releaseStep(st, unreleased);
  if (S.badges.stops.includes(ops?.key) || ops?.key === 'nextSmokeFix') return ops; // a failed release or smoke comes first
  // A red base comes next: a fix unit, unless one is live (docs/design/base-ci.md).
  if (st.ci?.red && !st.units.some((u) => !u.fm.intent && u.state !== 'merged')) {
    const red = st.ci.rec.runs.filter((r) => config.ci.red.includes(r.conclusion));
    return action('act', 'nextCiFix', { runs: red.map((r) => r.name).join(', '), logs: red.map((r) => render(config.ci.log, r, 'ci.log')).join('; '), tests: firstTests(st.profile) });
  }
  const asked = [...st.requirements, ...st.intents, ...st.units, ...st.decisions].find((d) => researchOf(d) && !st.answered.has(researchOf(d)));
  if (asked) return heartbeatFresh(st.cwd, asked.id, Date.now(), S.researching) ? action('wait', 'nextWaitResearch', { doc: asked.id }) : action('act', 'nextResearch', { doc: asked.id, model: st.profile.models.research });
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
  if (ops) return ops;
  // A clear newer than the last merge on the base already gave the lead a fresh session (docs/design/resume.md).
  const lastMerge = Number(tryGit(st.cwd, 'log', '-1', '--merges', '--format=%ct', st.base) || 0) * 1000;
  return action('human', heartbeatAt(st.cwd, S.cleared, '.') > lastMerge ? 'nextIdleCleared' : 'nextIdle');
}

const firstTests = (profile) => Object.values(withDefaults(profile).levels).flatMap((l) => list(l?.paths))[0] ?? S.testsPlaceholder;
// A merged intent's Deployment rows, from its deploy record and the base commit (docs/design/operations.md).
function releaseStep(st, i) {
  const rec = i.deploy;
  const base = tryGit(st.cwd, 'rev-parse', st.base);
  const smokeDown = rec.smoke && !rec.smoke.ok && !(rec.rollback?.ok && rec.rollback.at > rec.smoke.at);
  // A held intent parks its release steps until the owner resumes them; a failed smoke still stops (U59).
  if (i.fm.hold && !smokeDown) return action('human', 'nextReleaseHeld', { intent: i.id, reason: i.fm.hold === true ? [] : [String(i.fm.hold)] });
  if (!st.profile.deploy && !st.profile.release) return action('human', 'nextRelease', { intent: i.id });
  // A fix unit's scope holds its test: the example names the first level's test location (U58).
  const tests = firstTests(st.profile);
  // A failed smoke stops everything until the owner rolled back; then a fix unit, after which the base moves.
  if (smokeDown) return action('human', 'nextSmokeFailed', { intent: i.id, ...rec.smoke });
  if (rec.smoke && !rec.smoke.ok && rec.smoke.base === base) return action('act', 'nextSmokeFix', { intent: i.id, tests, file: relPath(st.cwd, runtimeFile(st.cwd, 'deploys', i.id)) });
  if (rec.release && !rec.release.ok && rec.release.base === base) return action('human', 'nextReleaseFailed', { intent: i.id, tests, ...rec.release });
  const checked = list(st.profile.deploy?.check).length > 0;
  if (checked && rec.check?.base !== base) return action('act', 'nextDeployCheck', { intent: i.id });
  if (checked && !rec.check.ok) return action('act', 'nextDeployFailed', { intent: i.id, tests, ...rec.check });
  return action('human', 'nextDeployRelease', { intent: i.id });
}

// ---- Commands ----

function findDoc(cwd, bundle, name) {
  const path = resolve(cwd, name);
  if (existsSync(path)) return path;
  const plan = readPlan(bundle);
  const hit = [...plan.units, ...plan.intents, ...plan.requirements].find((d) => reqIdOf(d.id) === reqIdOf(name));
  if (hit) return hit.file;
  // A decision by its number, as the owner types it: `approve 0010` (docs/design/cli.md).
  const decision = /^\d+$/.test(name) && readdirSync(bundle, { recursive: true }).map(String)
    .filter((f) => Number(basename(f).match(/^(\d+)-.*\.md$/)?.[1]) === Number(name)).map((f) => join(bundle, f))
    .find((f) => parseDoc(readFileSync(f, 'utf8')).fm?.type === config.grid.decisionType);
  if (decision) return decision;
  // Any other doc by its file name, as `next` names a held one: `aidlc research reputation`.
  const named = readdirSync(bundle, { recursive: true }).map(String).filter((f) => basename(f) === `${name}${config.okf.ext}`);
  if (named.length !== 1) throw new UsageError(msg('noDoc', { name }));
  return join(bundle, named[0]);
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

// The status lines `status` and the session-start hook show: owner lines, intents, the units not yet history
// (merged units of a released intent are), the requirements not delivered, then the next action and `tail`.
export function statusText(st, next, tail = '') {
  const lines = [...st.intents.map((i) => msg('statusIntent', { id: i.id, state: i.state, title: i.fm.title ?? '' })),
    ...st.units.filter((x) => x.state !== 'merged' || !st.intents.some((i) => i.state === 'released' && i.id === x.fm.intent))
      .map((u) => msg('statusUnit', { id: u.id, state: u.state, title: u.fm.title ?? '' }))];
  const delivered = new Set(st.units.filter((u) => u.state === 'merged').flatMap((u) => u.requirements));
  const open = st.requirements.filter((r) => !delivered.has(r.id));
  const end = (open.length ? msg('statusUncovered', { reqs: ids(open) }) : '') + msg('statusNext', { line: next.line }) + tail;
  let out = ownerLines(st.cwd);
  for (let k = 0; k < lines.length; k++) {
    const more = msg('statusMore', { count: lines.length - k });
    if ((out + lines[k] + more + end).length > S.statusMax) { out += more; break; }
    out += lines[k];
  }
  return out + end;
}

const usage = (key) => { throw new UsageError(msg(key, {})); };
const humanGate = (a) => (a.kind === 'human' ? config.exit.blocked : config.exit.ok);

export const commands = {
  status(args, { cwd }) {
    const st = readState(cwd);
    const next = nextAction(st);
    return done(statusText(st, next, boardBehind(st)), humanGate(next));
  },

  next(args, { cwd }) {
    const st = readState(cwd);
    const next = nextAction(st);
    return done(msg('nextLine', next) + boardBehind(st), humanGate(next));
  },

  approve(args, { cwd }) {
    const by = tryGit(cwd, 'config', 'user.email');
    if (!by) throw new UsageError(msg('noEmail', {}));
    const { profile } = loadProfile(cwd);
    const bundle = bundleOf(cwd, profile);
    const at = new Date().toISOString(); // to the millisecond: review rounds are compared with it
    const auto = args.includes(S.autoFlag) && delegated(cwd);
    let out = '';
    // Not approved: a door without its decision, or a slice finding on the doc or its intent (docs/design/plan-lint.md).
    const errors = lintPlan(bundle, profile, { base: cwd, skip: [...mergedUnits(cwd, withDefaults(profile).base).keys()] }).filter((f) => S.approveBlocks.includes(f.code));
    for (const name of args.filter((a) => a !== S.autoFlag)) {
      const wanted = new Set([...withIntents(bundle, [findDoc(cwd, bundle, name)])].map((f) => relPath(cwd, f)));
      const error = errors.find((f) => wanted.has(f.path));
      if (error) throw new UsageError(msg('approveLint', error));
    }
    for (const name of args.filter((a) => a !== S.autoFlag)) {
      const file = findDoc(cwd, bundle, name);
      const text = readFileSync(file, 'utf8');
      const doc = parseDoc(text);
      if (!S.approvable.includes(String(doc.fm?.type))) throw new UsageError(msg('notApprovable', { name }));
      const quick = doc.fm.type === S.unitType && approval(doc) === 'draft' && computeLane(list(doc.fm.scope), profile).lane === QUICK;
      const cls = approval(doc) === 'stale' ? S.auto[0] : quick ? S.auto[1] : null;
      if (auto && !auto.includes(cls)) throw new UsageError(msg('notDelegated', { name }));
      if (auto && cls === S.auto[0] && doc.fm.type === S.unitType && !acsKept(cwd, file, doc)) throw new UsageError(msg('notDelegatedAcs', { name }));
      // The stamps count toward the doc's cap: an approved doc must still pass the docs check (docs/design/approvals.md).
      const stamped = stamp(text, auto ? S.agent : S.human + by, at);
      const over = stampOver(stamped, doc, profile);
      if (over) throw new UsageError(msg('approveSize', { doc: relPath(cwd, file), ...over }));
      writeFileSync(file, stamped);
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
    if (mode === S.off && !rest.length) {
      writeJson(personal(cwd), { ...data, run: undefined });
      return done(msg('modeSet', { run: S.off }));
    }
    const flags = rest.filter((_, k) => k % 2 === 0);
    if (!S.modes.includes(mode) || (stop !== undefined && !S.stops[stop]) || rest.length % 2 || flags.some((f) => !config.commands.find((c) => c.name === 'mode').flags.includes(f))) usage('modeUsage');
    const run = { mode, stop, report: opt('--report') };
    writeJson(personal(cwd), { ...data, run });
    return done(msg('modeSet', { run: msg('runLine', { mode, stop: list(stop), report: list(run.report) }) }));
  },

  hold: ([unit, ...why], { cwd }) => (unit ? setField(cwd, unit, 'hold', why[0] === S.off ? null : why.length ? JSON.stringify(why.join(' ')) : true) : usage('holdUsage')),
  priority: ([unit, n], { cwd }) => (unit && /^-?\d+$/.test(n ?? '') ? setField(cwd, unit, 'priority', Number(n)) : usage('priorityUsage')),

  report(args, ctx) {
    const unit = args[0];
    if (!unit) throw new UsageError(msg('noDoc', { name: '' }));
    const data = args[1] ? parseObject(readFileSync(resolve(ctx.cwd, args[1]), 'utf8'), args[1]) : parseObject(readStdin(ctx), 'report');
    const { profile } = loadProfile(ctx.cwd);
    const problems = data.status === S.stopped ? [] : mutationProblems(ctx.cwd, profile, unit, data.mutations);
    if (problems.length) throw new UsageError(msg(problems.wired ? 'reportMutationsWired' : 'reportMutations', { problems: problems.join('; ') }));
    // A changed manifest names each version's source: the registry, not memory (docs/design/dependencies.md).
    const pins = data.status === S.stopped ? [] : unitPaths(ctx.cwd, baseOf(profile), unit).filter((f) => list(profile.deps?.manifests).some((g) => inside('/' + f, g)));
    const sourced = [data.deps ?? []].flat().filter((d) => d?.name && d.version && d.source);
    if (pins.length && (!sourced.length || sourced.length < [data.deps].flat().length)) throw new UsageError(msg('reportDeps', { unit, files: pins.join(', ') }));
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
    if (!Object.values(VERDICT).includes(data.verdict)) throw new UsageError(msg('badVerdict', { verdicts: Object.values(VERDICT).join(', ') }));
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
    const round = roundsOf({ rounds: prior }, focus).filter((r) => r.verdict === VERDICT.fix && !beforeApproval(r, since)).length + 1;
    // A pass while an AC has no tagged test on the branch is a fix: the gate would refuse it (U32).
    // A pass carrying a CONFIRMED finding is a fix too: the reviewer saw the defect (U35).
    const pass = data.verdict === VERDICT.pass;
    const missing = pass && planUnit ? untagged({ cwd, bundle: bundleOf(cwd, profile) }, planUnit) : [];
    const confirmed = pass ? (data.findings ?? []).filter((f) => f.confidence === S.confirmed).length : 0;
    const sentBack = missing.map((tag) => ({ path: '', line: '', claim: msg('untaggedClaim', { tag }), scenario: msg('untaggedScenario', {}), confidence: S.confirmed }));
    if (missing.length || confirmed) Object.assign(data, { verdict: VERDICT.fix, findings: [...(data.findings ?? []), ...sentBack] });
    if (missing.length) bump(cwd, config.retro.sendBacks, { unit, tags: missing.join(', '), at: new Date().toISOString() });
    // A reviewer's own escalate is a fix round first, until the limit (U38).
    const verdict = [VERDICT.fix, VERDICT.escalate].includes(data.verdict) ? (round > limit ? VERDICT.escalate : VERDICT.fix) : data.verdict;
    const card = readJson(runtimeFile(cwd, 'cards', unit))?.hash ?? null;
    const commit = git(cwd, 'rev-parse', branchOf(unit)); // what a kept pass is measured from (U34)
    writeJson(target, { unit, rounds: [...prior, { ...data, focus, verdict, card, diffHash: diffHash(cwd, baseOf(profile), unit), commit, at: new Date().toISOString() }] });
    if (verdict === VERDICT.escalate) bump(cwd, 'escalations', config.retro.reasons.review);
    rmSync(join(aidlcDir(cwd), S.reviewing, unit), { force: true }); // the review is no longer in flight
    const why = verdict === VERDICT.escalate ? 'recordedEscalate' : data.verdict === VERDICT.escalate ? 'recordedEscalateFix' : missing.length ? 'recordedUntagged' : confirmed ? 'recordedConfirmed' : verdict === VERDICT.fix ? 'recordedFix' : 'recorded';
    return done(msg(why, { what: verdict, unit, focus, tags: missing.join(', '), round, limit, confirmed })); // the reviewer learns why
  },
};
