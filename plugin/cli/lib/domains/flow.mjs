// Flow: derives unit and intent states from git and the bundle, picks the next action and shows the status
// (docs/design/state.md). Nothing here is a ledger.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { bundleOf, config, QUICK, VERDICT, done, list, readJson, UsageError, relPath } from '../foundation/data.mjs';
import { git, gitLines, tryGit } from '../foundation/git.mjs';
import { msg, render } from '../foundation/text.mjs';
import { loadProfile, withDefaults } from '../foundation/profile.mjs';
import { linksOf, parseDoc } from './bundle.mjs';
import { seam } from '../foundation/seams.mjs';
import { computeLane, incrementLines, incrementSection, readPlan, productGlobs, testsOnly } from './plan.mjs';
import { inside, overlaps } from '../foundation/glob.mjs';
import { baseOf, baseRedFile, branchOf, ciFile, heartbeatAt, heartbeatFresh, hostDeniedFile, mergedUnits, runtimeFile, worktrees } from '../foundation/store.mjs';
import { acsKept, approval, approvedAt, delegated, findDoc, ownerLines, reviewDue } from './approval.mjs';
import { diffHash, keptPass, readReview, reviewFocuses, roundsOf, untagged, verdictCurrent } from './review.mjs';
const S = config.state;
const DATE = /^\d{4}-\d{2}-\d{2}$/; // an escape hatch's until

// ---- State ----

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
  const branches = new Set(gitLines(cwd, 'for-each-ref', '--format=%(refname:short)', `refs/heads/${S.branchPrefix}`, `refs/heads/${S.boltBranch}`));
  const live = plan.units.filter((u) => u.fm.status !== config.grid.dropped).sort(byId);

  const answered = researched(bundle);
  const units = live.map((u) => {
    const lane = computeLane(u.scope, profile, { floor: u.floor }).lane;
    const needsApproval = Boolean(u.fm.intent) || lane !== QUICK;
    const approvalState = approval(u.doc);
    const report = readJson(runtimeFile(cwd, 'reports', u.id));
    const review = readReview(cwd, u.id, u.doc);
    const fresh = heartbeatFresh(cwd, u.id, now);
    // A builder launched after `at` and still at work: a new round in flight, not the state `at` recorded.
    const relaunched = (at) => fresh && heartbeatAt(cwd, u.id, S.launches) > at;
    let state;
    let focus = null, focuses = [];
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
      focuses = verdicts.filter((x) => !x.verdict).map((x) => x.focus); // each one a reviewer of its own, in parallel (U115)
      // A builder launched after the last verdict and the last report is at work on a new diff, whatever verdict a
      // focus kept: no review of a head it is still moving (U130).
      const atWork = relaunched(Date.parse(lastAt ?? 0)) && relaunched(Date.parse(report?.at ?? 0));
      if (has(VERDICT.escalate)) state = 'escalated';
      else if (atWork && review?.rounds?.length) state = 'building';
      // A fix round is in flight once a builder was launched after the verdict: the builder that reported before
      // the review keeps its heartbeat fresh for minutes (docs/design/in-flight.md).
      else if (has(VERDICT.fix)) {
        const fixAt = Math.max(0, ...(review?.rounds ?? []).filter((r) => r.verdict === VERDICT.fix).map((r) => Date.parse(r.at)));
        state = relaunched(fixAt) ? 'building' : 'fix';
      }
      else if (!focus && (!quick || report)) {
        const gate = readJson(runtimeFile(cwd, 'gates', u.id));
        // A builder launched after the gate refused it is a fix round in flight, not a merge to offer again.
        if (gate?.at && relaunched(Date.parse(gate.at))) state = 'building';
        // Refused only for a red base, it stays refused until a merge lands: a plan commit does not fix the base (U145).
        else state = gate?.diffHash === hash && (gate.base === tryGit(cwd, 'rev-parse', base) || (gate.codes.every((c) => c === 'GATE-BASE') && noMergeSince(cwd, gate.base, base))) ? 'gated' : 'reviewed';
      }
      else if (has(VERDICT.pass) || has(S.answered) || (report && report.status !== S.stopped && (!lastAt || report.at > lastAt) && Date.parse(report.at) > approvedAt(u.doc))) {
        state = heartbeatFresh(cwd, u.id, now, S.reviewing) ? 'reviewing' : 'reported';
      }
      else state = 'building';
    } else state = fresh ? 'building' : 'approved';
    return { ...u, lane, state, focus, focuses, fresh, report, review, held: Boolean(u.fm.hold) && !answered.has(researchOf(u)) }; // an answered research hold no longer holds
  });

  const intents = plan.intents.sort(byId).map((i) => {
    const own = units.filter((u) => u.fm.intent === i.id);
    // An increment line naming no bolt is an increment still to cut: the intent is not done (docs/design/increments-and-bolts.md).
    const ids = new RegExp(config.grid.lineIds, 'g');
    const uncut = incrementSection(i.doc).map(([, t]) => t.trim()).filter((t) => /^([-*]|\d+\.)\s/.test(t) && !t.match(ids));
    const complete = own.length > 0 && own.every((u) => u.state === 'merged') && !uncut.length;
    // Released: the owner tagged it, or its recorded release (and smoke) passed (docs/design/operations.md).
    const deploy = readJson(runtimeFile(cwd, 'deploys', i.id)) ?? {};
    const smoked = !profile.deploy?.smoke || (deploy.smoke?.ok && deploy.smoke.at >= deploy.release.at);
    // Ships nothing: all tests, or, with modules, merges that changed no file of the product (docs/design/operations.md).
    const changed = () => own.flatMap((u) => gitLines(cwd, 'diff', '--name-only', `${merged.get(u.id)}^1`, merged.get(u.id)));
    const nothing = complete && (testsOnly(own, profile) || ((profile.modules ?? []).length > 0 && !changed().some((f) => productGlobs(profile).some((g) => inside('/' + f, g)))));
    // An increment ships when its bolts merge: due while a merged increment is not in the last passing release (U121).
    const shipped = (ids) => deploy.release?.ok && smoked && ids.every((id) => tryGit(cwd, 'merge-base', '--is-ancestor', merged.get(id), deploy.release.base) !== null);
    // Another intent's bolt cited on a line is not this intent's work (U123).
    const increments = incrementLines(i).map((l) => l.ids.filter((id) => own.some((u) => u.id === id))).filter((x) => x.length && x.every((id) => merged.has(id)));
    const incrementDue = !complete && Boolean(profile.deploy || profile.release) && increments.length > 0 && !shipped(increments.flat());
    const released = complete && (nothing || (profile.deploy || profile.release) && Boolean(shipped(own.map((u) => u.id)))
      || own.every((u) => (tryGit(cwd, 'tag', '--contains', merged.get(u.id)) ?? '') !== ''));
    return { ...i, state: released ? 'released' : complete ? 'merged' : approval(i.doc), units: own, deploy, uncut, incrementDue, shipped };
  });
  const requirements = plan.requirements.map((r) => ({ ...r, state: approval(r.doc) }));
  return { cwd, profile, base, bundle, intents, units, requirements, decisions: bundleHeld(bundle), answered, auto: delegated(cwd), mergeUnit: mergeInProgress(cwd, units), ci: ciOf(cwd, profile, base), red: redOf(cwd, base) };
}

// With ci.wait: the base head, its remote, the last CI poll, and whether the base is red: the poll found it red and
// no merge landed since, so plan commits (the fix unit's doc) keep it red and a merged fix ends it.
function ciOf(cwd, profile, base) {
  if (!profile.ci?.wait) return null;
  const head = tryGit(cwd, 'rev-parse', base);
  const rec = readJson(ciFile(cwd));
  const red = rec?.state === 'red' && noMergeSince(cwd, rec.sha, head);
  return { head, remote: tryGit(cwd, 'rev-parse', '-q', '--verify', `${config.gate.remote}/${base}`), rec, red };
}

// The gate's red-base record while no merge has landed on the base since: a plan commit keeps it red.
function redOf(cwd, base) {
  const rec = readJson(baseRedFile(cwd));
  return rec && noMergeSince(cwd, rec.sha, base) ? rec : null;
}
const noMergeSince = (cwd, sha, head) => tryGit(cwd, 'rev-list', '--count', '--merges', `${sha}..${head}`) === '0';

// ---- next ----

const ids = (docs) => docs.map((u) => u.id).join(' ');
// An owner step starts with the owner badge, a refusal or stop with the stop badge; the lead's own steps carry none.
const badgeOf = (kind, key) => (S.badges.stops.includes(key) ? S.badges.stop : kind === 'human' ? S.badges.owner : '');
// An elaborate step names the role the lead works in (decision 0019).
const roleOf = (key) => config.personas.steps[key];
const action = (kind, key, data = {}) => ({ kind, key, line: badgeOf(kind, key) + msg(key, data) + (roleOf(key) ? msg('personaLine', { role: roleOf(key) }) : '') });
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
  if (open) return gate(st.intents.includes(open.d) && !decisionsOf(st, [open.d]).length ? 'nextOpenIntent' : 'nextOpenDraft', [], { doc: open.d.id, points: open.points.join(', '), file: relPath(st.cwd, open.d.file) }); // decisions take shape with the intent (U139)
  if (!intent && !st.intents.length && !st.units.length) {
    if (st.profile.adopted) return gate('nextMigrate', [], { dir: rel(config.grid.intents), commit: String(st.profile.adopted).slice(0, 12) });
    return gate('nextNoIntent', [], { dir: rel(config.grid.intents) });
  }
  // A first approval names the draft requirements its docs cite, so one owner prompt covers them (U39).
  const draftCited = (docs) => st.requirements.filter((r) => r.state === 'draft' && docs.some((d) => d.requirements.includes(r.id)));
  if (intent && intent.state === 'draft') {
    const docs = [intent, ...draftCited([intent])];
    // A method 9 intent is reviewed first; its findings go to the owner as advice (docs/design/intake.md#review-before-approval).
    if (reviewDue(st.cwd, st.profile, st, intent)) return gate('nextReviewIntent', [], { intent: intent.id }, 'act');
    const advice = readJson(runtimeFile(st.cwd, 'intentReview', intent.id))?.findings ?? [];
    if (advice.length) return gate('nextApproveReviewed', docs.map((d) => d.id), { intent: ids(docs), review: intent.id, findings: advice.map((f) => `${f.id} ${f.claim}`).join('; ') });
    return gate('nextApproveIntent', docs.map((d) => d.id), { intent: ids(docs) });
  }
  // The draft decisions an approved intent links come before its units: an architecture choice shapes the cut.
  const linked = intent && intent.state === 'approved' && !intent.units.length ? decisionsOf(st, [intent]).filter((d) => approval(d.doc) === 'draft') : [];
  const unfinished = linked.find((d) => openPoints(d.doc).length);
  if (unfinished) return gate('nextFinishDecision', [], { intent: intent.id, doc: relPath(st.cwd, unfinished.file), points: openPoints(unfinished.doc).join(', ') }, 'act');
  if (linked.length) return gate('nextApproveDecisions', [], { intent: intent.id, docs: linked.map((d) => relPath(st.cwd, d.file)).join(' ') });
  if (intent && intent.state === 'approved' && !intent.units.length) return gate('nextDraftUnits', [], { intent: intent.id, file: st.profile.system ? msg('draftBoltFile', { dir: rel(config.grid.bolts) }) : msg('draftUnitFile', { dir: rel(config.grid.units) }) }, 'act'); // a v2 plan writes bolts
  const cited = new Set([...(intent?.requirements ?? []), ...scope.filter((u) => u.state !== 'merged').flatMap((u) => u.requirements)]);
  const draftReqs = st.requirements.filter((r) => r.state === 'draft' && cited.has(r.id));
  const drafts = scope.filter((u) => u.state === 'draft');
  if (!drafts.length) return draftReqs.length ? gate('nextApproveRequirements', draftReqs.map((r) => r.id), { reqs: ids(draftReqs) }) : null;
  const decisions = citedDecisions(st, drafts);
  const docs = [ids([...drafts, ...draftReqs]), ...decisions].join(' ');
  const auto = st.auto.includes(S.auto[1]) && drafts.every((u) => u.lane === QUICK) && !decisions.length && !draftReqs.length;
  return gate(auto ? 'nextAutoApprove' : 'nextApprovePlan', [...drafts, ...draftReqs].map((d) => d.id), { docs, units: docs }, auto ? 'act' : 'human');
}

// Steps 6-12 for the given units; a held unit gets no action until the hold is released.
function unitWork(st, scope) {
  const merged = (id) => st.units.find((x) => x.id === id)?.state === 'merged';
  const live = scope.filter((u) => !u.held);
  const fixOnly = (u) => !(st.ci?.red || st.red) || !u.fm.intent; // on a red base only fix units build or merge
  // A merge is offered only when each AC has a tagged test on the branch; a builder sent back for one is waited for.
  const backAtWork = [];
  for (const u of live.filter((x) => x.state === 'reviewed' && x.depends.every(merged) && fixOnly(x))) {
    const missing = u.lane === QUICK ? [] : untagged(st, u);
    if (!missing.length) return action('act', 'nextMerge', { unit: u.id });
    if (!u.fresh) return action('act', 'nextUntagged', { unit: u.id, tags: missing.join(', ') });
    backAtWork.push(u);
  }
  const fix = live.find((u) => u.state === 'fix');
  if (fix) return action('act', 'nextFixRound', { unit: fix.id });
  const reported = live.find((u) => u.state === 'reported');
  if (reported) return action('act', 'nextReview', { unit: reported.id, focus: (reported.focuses.length ? reported.focuses : [reported.focus]).join(', '), model: st.profile.models.review });
  const lost = live.find((u) => u.state === 'building' && !u.fresh);
  if (lost) return action('act', 'nextRestart', { unit: lost.id, branch: branchOf(lost.id) });
  // A unit waiting on the owner or on its spec holds back no other unit's review, fix or restart (U141).
  const onRed = (u) => u.state === 'gated' && readJson(runtimeFile(st.cwd, 'gates', u.id)).codes.every((c) => c === 'GATE-BASE'); // waits for the base's fix, which it never blocks
  const gated = live.find((u) => u.state === 'gated' && !onRed(u));
  if (gated) return action('human', 'nextGated', { unit: gated.id, codes: readJson(runtimeFile(st.cwd, 'gates', gated.id)).codes.join(', ') });
  const escalated = live.find((u) => u.state === 'escalated');
  if (escalated) return action('human', 'nextEscalated', { unit: escalated.id });
  const stopped = live.find((u) => u.state === 'stopped');
  if (stopped) return action('act', 'nextStopped', { unit: stopped.id, reason: String(stopped.report.stop ?? stopped.report.summary ?? '') });
  // A builder still holding a merged unit's worktree: the merge could not remove it.
  const trees = worktrees(st.cwd);
  const left = st.units.find((x) => x.state === 'merged' && trees.has(branchOf(x.id)));
  if (left) return action('act', 'nextWorktreeLeft', { unit: left.id, path: trees.get(branchOf(left.id)), branch: branchOf(left.id) });

  const inFlight = [...scope.filter((u) => u.state === 'reviewing' || (u.state === 'building' && u.fresh)), ...backAtWork]; // a held unit's quiet builder is not in flight
  const max = st.profile.parallel.max;
  const picked = [];
  const ready = live.filter((u) => u.state === 'approved' && fixOnly(u)).sort((a, b) => priorityOf(b) - priorityOf(a) || !a.fm.intent - !b.fm.intent || byId(a, b));
  const started = [...inFlight, ...st.units.filter((u) => !inFlight.includes(u) && !onRed(u) && !['draft', 'stale', 'approved', 'blocked', 'merged'].includes(u.state))];
  for (const u of ready) {
    if (inFlight.length + picked.length >= max) break;
    // Side by side only with disjoint scopes and, in a v2 project, bindings that share no module (docs/design/construction.md).
    const clash = [...started, ...picked].some((o) => u.scope.some((g) => o.scope.some((h) => overlaps(g, h))) || (st.profile.system && o.modules.some((m) => u.modules.includes(m))));
    if (!clash) picked.push(u);
  }
  // With ci.wait, builders start on a pushed base; a CI not yet known holds none: its wait runs beside them,
  // and a red result holds their merges (U115). On a red base the fix unit builds.
  const ci = st.ci && !st.ci.red;
  if (picked.length && ci && st.ci.head !== st.ci.remote) return action('act', 'nextCiPush');
  const wait = ci && (st.ci.rec?.sha !== st.ci.head || st.ci.rec.state === 'pending') ? [true] : [];
  if (picked.length) return action('act', 'nextBuild', { units: picked.map((u) => u.id).join(', '), cards: picked.map((u) => msg('cardCommand', { unit: u.id })).join(', '), wait });
  if (inFlight.length) return action('wait', 'nextWait', { units: inFlight.map((u) => u.id).join(', ') });
  const held = scope.filter((u) => u.held && u.state !== 'merged');
  if (held.length) return action('human', 'nextHeld', { units: held.map((u) => (u.fm.hold === true ? u.id : msg('heldReason', { unit: u.id, reason: u.fm.hold }))).join(', ') });
  return null;
}

// An action auto mode refused at this commit goes to the owner, not demanded again (docs/design/state.md#next).
export function nextAction(st) {
  const next = pickAction(st);
  const refused = next.kind === 'act' && new RegExp(S.refusedLine).exec(next.line)?.[1];
  const head = refused && tryGit(st.cwd, 'rev-parse', 'HEAD');
  if (!refused || !(readJson(hostDeniedFile(st.cwd)) ?? []).some((d) => d.head === head && String(d.command).includes(refused))) return next;
  return action('human', 'nextHostDenied', { refused, command: refused.split(' ').filter((a) => a !== S.autoFlag).join(' ') });
}

// A question the lead held for research (decision 0010) and the questions the bundle's research docs answer.
export const researchOf = (doc) => (typeof doc.fm.hold === 'string' && doc.fm.hold.startsWith(S.researchHold) ? doc.fm.hold.slice(S.researchHold.length).trim() : null);
// The other docs a research question can be held on: decisions by number, any other doc by its name.
const bundleHeld = (bundle) => (existsSync(bundle) ? readdirSync(bundle, { recursive: true }).map(String) : [])
  .filter((f) => f.endsWith(config.okf.ext) && ![config.okf.index, config.okf.log].includes(basename(f)))
  .map((f) => ({ f, fm: parseDoc(readFileSync(join(bundle, f), 'utf8')).fm ?? {} }))
  .filter(({ fm }) => fm.type === config.grid.decisionType || researchOf({ fm }))
  .map(({ f, fm }) => ({ f, fm, num: fm.type === config.grid.decisionType ? basename(f).match(/^(\d+)-/)?.[1] : null }))
  // A decision by its number, as the owner types it, unless another shares it: then by its file name (U113).
  .map(({ f, fm, num }, k, all) => ({ id: num && all.filter((d) => d.num === num).length === 1 ? num : basename(f, config.okf.ext), file: join(bundle, f), fm, doc: parseDoc(readFileSync(join(bundle, f), 'utf8')) }));
// The doc a research question is held on, named as `hold` takes it.
export const heldDoc = (st, name) => { const file = findDoc(st.cwd, st.bundle, String(name)); return [...st.requirements, ...st.intents, ...st.units, ...st.decisions].find((d) => d.file === file); };
function researched(bundle) {
  const dir = join(bundle, config.grid.research);
  return new Set((existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith(config.okf.ext)).map((f) => parseDoc(readFileSync(join(dir, f), 'utf8')).fm?.question));
}

function pickAction(st) {
  if (st.mergeUnit) return action('act', 'nextContinueMerge', { unit: st.mergeUnit });
  const unreleased = st.intents.find((i) => i.state === 'merged' || i.incrementDue); // its release does not hold back the next intent
  const ops = unreleased && releaseStep(st, unreleased);
  if (S.badges.stops.includes(ops?.key) || ops?.key === 'nextSmokeFix') return ops; // a failed release or smoke comes first
  // A red base comes next: a fix unit, unless one is live (docs/design/base-ci.md).
  const fixLive = st.units.some((u) => !u.fm.intent && u.state !== 'merged');
  if (st.ci?.red && !fixLive) {
    const red = st.ci.rec.runs.filter((r) => config.ci.red.includes(r.conclusion));
    return action('act', 'nextCiFix', { runs: red.map((r) => r.name).join(', '), logs: red.map((r) => render(config.ci.log, r, 'ci.log')).join('; '), tests: firstTests(st.profile) });
  }
  if (st.red && !fixLive) return action('act', 'nextBaseFix', { level: st.red.level, unit: st.red.unit, tests: firstTests(st.profile) });
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
  if (work && !(work.kind === 'wait' && ops)) return work; // a due release step beats waiting (U121)
  if (intent?.state === 'approved' && intent.uncut.length && intent.units.length && intent.units.every((u) => u.state === 'merged')) {
    return action('act', 'nextCutIncrements', { intent: intent.id, increments: intent.uncut.map((t) => t.replace(/^([-*]|\d+\.)\s+/, '')).join('; ') });
  }
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
  // With ci.wait the owner releases only a pushed base whose CI passed (U129).
  const ci = ciGreen(st.ci);
  if (ci === 'unpushed') return action('act', 'nextCiPush');
  if (ci === 'red') return action('wait', 'nextReleaseCiRed', { intent: i.id });
  if (ci !== true) return action('act', 'nextReleaseCiWait', { intent: i.id });
  return action('human', 'nextDeployRelease', { intent: i.id });
}

// True without ci.wait or on a pushed base whose last CI passed; else what holds it: unpushed, red, pending or unknown.
export function ciGreen(ci) {
  if (!ci) return true;
  if (ci.head !== ci.remote) return 'unpushed';
  if (ci.red) return 'red';
  return ci.rec?.sha === ci.head && ['green', 'none'].includes(ci.rec.state) ? true : ci.rec?.sha === ci.head ? ci.rec.state : 'unknown';
}

// ---- Commands ----

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
  // Delivered as a plugged rule says (construction: by released tests), else by a merged unit citing it.
  const proven = seam('delivered', st.profile).map((rule) => rule(st)).find(Boolean);
  const delivered = new Set(proven ?? st.units.filter((u) => u.state === 'merged').flatMap((u) => u.requirements));
  const open = st.requirements.filter((r) => !delivered.has(r.id));
  const extra = seam('statusLines', st.profile).map((line) => line(st)).join('');
  const end = (open.length ? msg('statusUncovered', { reqs: ids(open) }) : '') + extra + msg('statusNext', { line: next.line }) + tail;
  let out = ownerLines(st.cwd);
  for (let k = 0; k < lines.length; k++) {
    const more = msg('statusMore', { count: lines.length - k });
    if ((out + lines[k] + more + end).length > S.statusMax) { out += more; break; }
    out += lines[k];
  }
  return out + end;
}

const usage = (key) => { throw new UsageError(msg(key, {})); };
// `status` and `next` exit blocked when the next step is the owner's.
const showNext = (cwd, text) => {
  const st = readState(cwd), next = nextAction(st);
  return done(text(st, next, seam('statusTail', st.profile).map((tail) => tail(st)).join('')), next.kind === 'human' ? config.exit.blocked : config.exit.ok);
};

export const commands = {
  status: (args, { cwd }) => showNext(cwd, statusText),
  next: (args, { cwd }) => showNext(cwd, (st, next, tail) => msg('nextLine', next) + tail),

  hold: ([unit, ...why], { cwd }) => (unit ? setField(cwd, unit, 'hold', why[0] === S.off ? null : why.length ? JSON.stringify(why.join(' ')) : true) : usage('holdUsage')),
  priority: ([unit, n], { cwd }) => (unit && /^-?\d+$/.test(n ?? '') ? setField(cwd, unit, 'priority', Number(n)) : usage('priorityUsage')),
};
