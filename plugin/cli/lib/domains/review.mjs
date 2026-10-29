// Review: review rounds and focuses, the back-fill proof by mutations, builder reports, reviewer verdicts and the owner's
// disposition of findings (docs/design/review-rounds.md, backfill.md).
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { bundleOf, config, QUICK, VERDICT, done, isMap, list, packageFile, readJson, readStdin, UsageError, relPath } from '../foundation/data.mjs';
import { addedLines, git, gitLines, tryGit } from '../foundation/git.mjs';
import { msg, render } from '../foundation/text.mjs';
import { loadProfile, withDefaults } from '../foundation/profile.mjs';
import { computeLane, readPlan } from './plan.mjs';
import { inside, overlaps } from '../foundation/glob.mjs';
import { aidlcDir, baseOf, branchOf, bump, runtimeFile, sha256, unitPaths, writeJson } from '../foundation/store.mjs';
import { approvedAt, beforeApproval, reviewedHash } from './approval.mjs';

const S = config.state;
const DATE = /^\d{4}-\d{2}-\d{2}$/; // an escape hatch's until

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
  for (const { file: path, line, text } of patterns.length ? addedLines(cwd, range) : []) {
    const pattern = patterns.find((p) => new RegExp(p, 'i').test(text));
    if (pattern) return { path, line, pattern };
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

const profilePath = config.layers.find((l) => l.from === 'project').path; // a profile AC is proved by mutating it, not reverting it
// A path in one of the levels' test paths.
const isTestPath = (f, levels) => Object.values(levels ?? {}).some((l) => list(l?.paths).some((g) => inside('/' + f, g)));
// A unit's changes outside the test paths, the bundle and the project folder: what proof-revert reverts. None
// makes it a back-fill unit, proved by mutations instead (docs/design/backfill.md).
export const codeChanges = (paths, levels, bundleRel) => paths
  .filter((f) => !isTestPath(f, levels) && !f.startsWith(bundleRel + '/') && !f.startsWith(dirname(profilePath) + '/'));

// The reported mutation for an AC tag.
export const mutationOf = (mutations, tag) => (Array.isArray(mutations) ? mutations : []).find((x) => x?.ac === tag);

// What a back-fill unit's mutations lack: one per AC, of a file outside the tests and the diff, whose `find`
// occurs exactly once on the unit branch. A quick-lane unit needs none; one that changes code only when it reports
// some, which may then edit its own diff (docs/design/backfill.md).
function mutationProblems(cwd, profile, unit, mutations) {
  const u = readPlan(bundleOf(cwd, profile)).units.find((x) => x.id === unit);
  if (!u || computeLane(u.scope, profile, { floor: u.floor }).lane === QUICK) return [];
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

// A unit's review rounds. An escalation the owner answered by re-approving the unit counts as answered: the unit
// goes back to review, and the card lists those findings for the reviewer to check again (docs/design/verification.md).
export function readReview(cwd, unit, doc) {
  const review = readJson(runtimeFile(cwd, 'reviews', unit));
  const at = doc ? approvedAt(doc, [S.human]) : 0;
  // The owner's re-approval answers an escalation: its findings are answered by the spec change, and a review follows.
  return review && { ...review, rounds: review.rounds.map((r) => (r.verdict === VERDICT.escalate && at && beforeApproval(r, at) ? { ...r, verdict: S.answered } : r)) };
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

function parseObject(text, name) {
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!isMap(data)) throw new UsageError(msg('badJson', { name }));
  return data;
}

const usage = (key) => { throw new UsageError(msg(key, {})); };

// The intent reviewer's brief: the request, the intent and its requirements, and what to check.
export function intentBrief(cwd, id) {
  const { profile } = loadProfile(cwd), bundle = bundleOf(cwd, profile), plan = readPlan(bundle), intent = plan.intents.find((i) => i.id === id);
  if (!intent) throw new UsageError(msg('reviewNoIntent', { intent: id }));
  const dir = join(bundle, config.okf.bundle.folders.Request ?? ''), requests = existsSync(dir) ? readdirSync(dir).filter((f) => list(intent.fm.request).some((q) => f.startsWith(`${q}-`))) : [];
  const file = packageFile(cwd, 'templates', S.intentReviewTemplate), reqs = plan.requirements.filter((r) => intent.requirements.includes(r.id)).map((r) => relPath(cwd, r.file));
  // After an earlier review, the next one reads what changed since and answers its findings, so rounds converge.
  const last = readJson(runtimeFile(cwd, 'intentReview', id));
  const again = last?.commit && last.hash !== reviewedHash(intent, plan.requirements) ? [{ since: last.commit, files: [relPath(cwd, intent.file), ...reqs].join(' '), prior: last.findings.map((f) => ({ id: f.id, claim: f.claim ?? '' })) }] : [];
  return render(readFileSync(file, 'utf8'), { intent: id, file: relPath(cwd, intent.file), requests: requests.map((f) => relPath(cwd, join(dir, f))), requirements: reqs, again }, file);
}

export const commands = {
  // The owner's disposition of a finding: an intent's design review, or a bolt's latest review round.
  dispose(args, { cwd }) {
    const [id, fid, disposition, reason, flag, until] = args;
    if (!id || !new RegExp(config.ids.findingId).test(fid ?? '') || !config.state.dispositions.includes(disposition) || !reason || (flag && (flag !== S.until || !DATE.test(until ?? '')))) usage('disposeUsage');
    const design = new RegExp(config.ids.intent).test(id), file = runtimeFile(cwd, design ? 'design' : 'reviews', id), data = readJson(file);
    // A bolt's findings are those of its latest security round, which hold the merge (REVIEW-SECURITY), else of its latest round.
    const security = roundsOf(data, S.contentFocus).at(-1), round = security?.findings?.length ? security : data?.rounds?.at(-1);
    const list = design ? data?.findings : round?.findings, k = Number(fid.slice(2)) - 1;
    if (!list?.[k]) usage('disposeUsage');
    list[k] = { ...list[k], disposition, reason, by: tryGit(cwd, 'config', 'user.email'), at: new Date().toISOString(), until };
    writeJson(file, data);
    return done(msg('disposed', { id, finding: fid, disposition, reason }));
  },

  report(args, ctx) {
    const unit = args[0];
    if (!unit) throw new UsageError(msg('noDoc', { name: '' }));
    const data = args[1] ? parseObject(readFileSync(resolve(ctx.cwd, args[1]), 'utf8'), args[1]) : parseObject(readStdin(ctx), 'report');
    const { profile } = loadProfile(ctx.cwd);
    const problems = data.status === S.stopped ? [] : mutationProblems(ctx.cwd, profile, unit, data.mutations);
    if (problems.length) throw new UsageError(msg(problems.wired ? 'reportMutationsWired' : 'reportMutations', { problems: problems.join('; ') }));
    // A changed manifest names each version's source: the registry, not memory (docs/design/dependencies.md).
    // Only an added line that looks like a pin counts: a Makefile or workflow edited for other reasons needs no source (U124).
    const pin = new RegExp(profile.deps?.pin ?? config.deps.pin);
    const pinned = (f) => gitLines(ctx.cwd, 'diff', '-U0', `${baseOf(profile)}...${branchOf(unit)}`, '--', f).some((l) => l.startsWith('+') && !l.startsWith('+++') && pin.test(l));
    const pins = data.status === S.stopped ? [] : unitPaths(ctx.cwd, baseOf(profile), unit).filter((f) => list(profile.deps?.manifests).some((g) => inside('/' + f, g)) && pinned(f));
    const sourced = [data.deps ?? []].flat().filter((d) => d?.name && d.version && d.source);
    if (pins.length && (!sourced.length || sourced.length < [data.deps].flat().length)) throw new UsageError(msg('reportDeps', { unit, files: pins.join(', ') }));
    writeJson(runtimeFile(ctx.cwd, 'reports', unit), { ...data, unit, at: new Date().toISOString() });
    if (data.status === S.stopped) {
      bump(ctx.cwd, config.retro.escalations, config.retro.reasons.stopped);
      bump(ctx.cwd, config.retro.stops, { unit, reason: String(data.stop ?? data.summary ?? ''), at: new Date().toISOString() }); // a restart's report replaces this one
    }
    return done(msg('recorded', { what: 'report', unit }));
  },

  review(args, ctx) {
    const { cwd } = ctx, [sub, unit, file] = args;
    if (new RegExp(config.ids.intent).test(sub ?? '')) return done(intentBrief(cwd, sub));
    if (sub !== 'record' || !unit || !file) throw new UsageError(msg('reviewUsage', {}));
    if (file !== S.stdin && !existsSync(resolve(cwd, file))) throw new UsageError(msg('noSuchPath', { name: file }));
    const data = parseObject(file === S.stdin ? readStdin(ctx) : readFileSync(resolve(cwd, file), 'utf8'), file);
    // An intent review: advice for the owner, kept with the hash of the docs it read (docs/design/intake.md#review-before-approval).
    if (new RegExp(config.ids.intent).test(unit) && data.focus === S.intentFocus) {
      const plan = readPlan(bundleOf(cwd, loadProfile(cwd).profile)), intent = plan.intents.find((i) => i.id === unit);
      if (!intent) throw new UsageError(msg('reviewNoIntent', { intent: unit }));
      const findings = (data.findings ?? []).map((f, k) => ({ ...f, id: render(config.ids.finding, { k: k + 1 }) }));
      writeJson(runtimeFile(cwd, 'intentReview', unit), { intent: unit, verdict: data.verdict, findings, hash: reviewedHash(intent, plan.requirements), commit: tryGit(cwd, 'rev-parse', '--short', 'HEAD'), at: new Date().toISOString() });
      return done(msg('recordedIntentReview', { intent: unit, count: findings.length }));
    }
    // An intent's design review: the architecture pass over its decision set, each finding numbered (docs/design/inception.md#approval).
    if (new RegExp(config.ids.intent).test(unit)) {
      const findings = (data.findings ?? []).map((f, k) => ({ ...f, id: render(config.ids.finding, { k: k + 1 }) }));
      writeJson(runtimeFile(cwd, 'design', unit), { intent: unit, findings, at: new Date().toISOString() });
      return done(msg('recordedDesign', { intent: unit, count: findings.length, confirmed: findings.filter((f) => f.confidence === S.confirmed).length }));
    }
    if (!Object.values(VERDICT).includes(data.verdict)) throw new UsageError(msg('badVerdict', { verdicts: Object.values(VERDICT).join(', ') }));
    const { profile } = loadProfile(cwd);
    if (!tryGit(cwd, 'rev-parse', '-q', '--verify', branchOf(unit))) throw new UsageError(msg('noBranch', { branch: branchOf(unit) }));
    const target = runtimeFile(cwd, 'reviews', unit), focus = data.focus ?? S.focus, hash = diffHash(cwd, baseOf(profile), unit);
    // The same verdict sent again for the same diff is a retry: it replaces its round instead of counting one more (U133).
    const sent = sha256(JSON.stringify({ verdict: data.verdict, findings: data.findings ?? [] }));
    const stored = readJson(target)?.rounds ?? [], last = roundsOf({ rounds: stored }, focus).at(-1);
    const retry = Boolean(last && verdictCurrent(last, hash, readJson(runtimeFile(cwd, 'reports', unit))) && last.sent === sent), prior = stored.filter((r) => !(retry && r === last));
    // Findings keep their ids per focus: each one the last fix round left open is answered, listed again with its id or named in `fixed`.
    const before = roundsOf({ rounds: prior }, focus), open = before.at(-1)?.verdict === VERDICT.fix ? (before.at(-1).findings ?? []).map((f) => f.id).filter(Boolean) : [];
    const relisted = new Set((data.findings ?? []).map((f) => f.id).filter(Boolean)), unanswered = data.verdict === VERDICT.pass ? [] : open.filter((id) => !list(data.fixed).includes(id) && !relisted.has(id)); // a pass answers them all
    if (unanswered.length) throw new UsageError(msg('reviewUnanswered', { unit, focus, ids: unanswered.join(', ') }));
    let numbered = Math.max(0, ...before.flatMap((r) => (r.findings ?? []).map((f) => Number(String(f.id ?? '').slice(2)) || 0)));
    const keep = (f) => (f.id && open.includes(f.id) ? f : { ...f, id: render(config.ids.finding, { k: ++numbered }) });
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
    if (missing.length && !retry) bump(cwd, config.retro.sendBacks, { unit, tags: missing.join(', '), at: new Date().toISOString() });
    // A reviewer's own escalate is a fix round first, until the limit (U38).
    const verdict = [VERDICT.fix, VERDICT.escalate].includes(data.verdict) ? (round > limit ? VERDICT.escalate : VERDICT.fix) : data.verdict;
    const card = readJson(runtimeFile(cwd, 'cards', unit))?.hash ?? null, commit = git(cwd, 'rev-parse', branchOf(unit)); // a kept pass is measured from the commit (U34)
    writeJson(target, { unit, rounds: [...prior, { ...data, findings: (data.findings ?? []).map(keep), focus, verdict, card, diffHash: hash, commit, sent, at: new Date().toISOString() }] });
    if (verdict === VERDICT.escalate && !retry) bump(cwd, config.retro.escalations, config.retro.reasons.review);
    // This review is no longer in flight; reviewers of other focuses still are (U125).
    const flight = join(aidlcDir(cwd), S.reviewing, unit);
    const left = existsSync(flight) ? readFileSync(flight, 'utf8').split(S.reviewerLine).length - 2 : 0;
    if (left > 0) writeFileSync(flight, S.reviewerLine.repeat(left), { flag: 'w' }); else rmSync(flight, { force: true });
    const why = verdict === VERDICT.escalate ? 'recordedEscalate' : data.verdict === VERDICT.escalate ? 'recordedEscalateFix' : missing.length ? 'recordedUntagged' : confirmed ? 'recordedConfirmed' : verdict === VERDICT.fix ? 'recordedFix' : 'recorded';
    return done(msg(why, { what: verdict, unit, focus, tags: missing.join(', '), round, limit, confirmed })); // the reviewer learns why
  },
};
