// Approvals: the owner's stamps and their hash, delegation and run mode, and the approve command (docs/design/approvals.md).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { bundleOf, config, QUICK, done, isMap, isoDay, lapsed, list, readJson, UsageError, relPath } from '../foundation/data.mjs';
import { tryGit } from '../foundation/git.mjs';
import { escapeRe, finding as codeFinding, msg } from '../foundation/text.mjs';
import { loadProfile, withDefaults } from '../foundation/profile.mjs';
import { approvedText, hashDoc, hashHolds, parseDoc, RAW, sizeCap, supersededId } from './bundle.mjs';
import { acsOf, computeLane, inForce, lintPlan, readPlan, reqId as reqIdOf, withIntents } from './plan.mjs';
import { aidlcDir, mergedUnits, runtimeFile, sha256, writeJson } from '../foundation/store.mjs';

const ST = config.state.names; // the lifecycle states, by name


const S = config.state;
const DATE = /^\d{4}-\d{2}-\d{2}$/; // an escape hatch's until

export const events = (fm) => (isMap(fm.verified) ? [fm.verified] : Array.isArray(fm.verified) ? fm.verified.filter(isMap) : []);

// approved: a human `verified` event and a matching hash; stale: approved once, changed since.
export function approval(doc) {
  const human = events(doc.fm).some((e) => S.approvers.some((a) => String(e.by ?? '').startsWith(a)));
  if (!human) return ST.draft;
  return hashHolds(doc) ? ST.approved : ST.stale;
}

// The docs an intent review reads, as one hash: the intent and the requirements it cites (docs/design/intake.md#review-before-approval).
export function reviewedHash(intent, requirements) {
  return sha256([intent, ...requirements.filter((r) => intent.requirements.includes(r.id))].map((d) => hashDoc(d.doc, RAW)).join('\n'));
}
// A v2 intent judged by method 9 whose current docs no intent review has read.
export function reviewDue(cwd, profile, plan, intent) {
  if (!profile.system || !inForce(intent, 'approveReview')) return false;
  return readJson(runtimeFile(cwd, 'intentReview', intent.id))?.hash !== reviewedHash(intent, plan.requirements);
}

// Approval classes the owner delegated to the lead; only the untracked personal layer counts (decision 0008).
const personal = (cwd) => join(cwd, config.layers.find((l) => l.name === 'personal').path);
export const delegation = (cwd) => readJson(personal(cwd))?.approvals ?? {};
export const delegated = (cwd) => (lapsed(delegation(cwd).until) ? [] : list(delegation(cwd).auto)); // a delegation past its until lapses

// The owner's run mode and the last owner prompt, as status shows them (docs/design/approvals.md#owner-prompts).
export function ownerLines(cwd) {
  const run = readJson(personal(cwd))?.run;
  const prompt = readJson(join(aidlcDir(cwd), config.hooks.prompts))?.at(-1);
  return (run ? msg('statusRun', { run: msg('runLine', { mode: run.mode, stop: list(run.stop), report: list(run.report) }) }) : '')
    + (prompt ? msg('statusPrompt', { command: prompt.command, state: config.hooks.promptStates[prompt.ran ? 1 : prompt.refused ? 2 : 0], at: prompt.ran ?? prompt.refused ?? prompt.at }) : '');
}

const acLines = (doc) => acsOf(doc).map((a) => a.text.trim()).join('\n');
// A stale unit's ACs read as last approved: a delegated re-approval keeps them, as what done means is the owner's.
export const acsKept = (cwd, file, doc) => { const before = approvedText(file, doc.fm.verified_hash); return before !== null && acLines(parseDoc(before)) === acLines(doc); };

// The latest approval of a doc by one of `by`, in epoch ms (0 when none). Answering an escalation takes the
// owner (human: only); a delegated re-approval of a fixed spec is enough to restart a stopped builder.
export const approvedAt = (doc, by = S.approvers) => Math.max(0, ...events(doc.fm).filter((e) => by.some((b) => String(e.by ?? '').startsWith(b))).map((e) => Date.parse(String(e.at)) || 0));
export const beforeApproval = (round, at) => Date.parse(round.at) < at;

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
    if (key) skipping = [...S.stampFields, ...Object.keys(S.stamped[doc.fm.type] ?? {})].includes(key);
    else if (!/^(\s|-)/.test(line) && line.trim()) skipping = false;
    if (!skipping) kept.push(line);
  }
  const all = [...events(doc.fm).filter((e) => e.by !== by), { by, at }]; // one stamp per approver: git keeps the rest
  const body = doc.lines.slice(doc.body).join('\n');
  // An intent is pinned to the method it is approved under: its bolts are judged by that method's rules (docs/design/canonical-model.md).
  const pin = doc.fm.type === S.intentType ? [`method: ${config.method.version}`] : [];
  // A decision is stamped as MADR has it: accepted, with the date (docs/design/standards.md).
  const madr = Object.entries(S.stamped[doc.fm.type] ?? {}).map(([k, v]) => `${k}: ${v === S.today ? isoDay(at) : v}`);
  // And who decided, when the doc names no one: the approver, as their approval names them.
  const who = S.approvers.reduce((name, p) => (name.startsWith(p) ? name.slice(p.length) : name), by);
  madr.push(...Object.entries(S.filled[doc.fm.type] ?? {}).filter(([k]) => doc.fm[k] === undefined || doc.fm[k] === null || doc.fm[k] === '').map(([k, v]) => `${k}: ${v === S.approver ? who : v}`));
  const draft = ['---', ...kept, ...pin, ...(madr.length ? madr : [`status: ${S.stable}`]), 'verified:', ...all.map((e) => `  - ${flowMap(e)}`), '---', body].join('\n');
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
    if (doc.error || !S.approvable.includes(String(doc.fm?.type)) || approval(doc) === ST.approved) continue;
    if ([...text].length > sizeCap(String(doc.fm.type), profile.docs?.caps)) continue; // the docs check reports it already
    const over = stampOver(stamp(text, S.human + by, new Date().toISOString()), doc, profile);
    const level = config.okf.levels.includes(profile.docs?.rules?.['HOUSE-SIZE']) ? profile.docs.rules['HOUSE-SIZE'] : config.okf.codes['HOUSE-SIZE'].level;
    if (over) out.push(codeFinding(config.okf.codes, 'HOUSE-SIZE', relPath(cwd, file), 1, 'stampOver', over, level));
  }
  return out;
}

// A doc by path, ID, decision number or file name, as the owner names it.
export function findDoc(cwd, bundle, name) {
  const path = resolve(cwd, name);
  if (existsSync(path)) return path;
  const plan = readPlan(bundle);
  const hit = [...plan.units, ...plan.intents, ...plan.requirements].find((d) => reqIdOf(d.id) === reqIdOf(name));
  if (hit) return hit.file;
  // A decision by its number, as the owner types it: `approve 0010` (docs/design/cli.md).
  const files = readdirSync(bundle, { recursive: true }).map(String);
  const decision = /^\d+$/.test(name) && files
    .filter((f) => Number(basename(f).match(new RegExp(config.ids.decisionFile + escapeRe(config.okf.ext) + '$'))?.[1]) === Number(name)).map((f) => join(bundle, f))
    .find((f) => parseDoc(readFileSync(f, 'utf8')).fm?.type === config.grid.decisionType);
  if (decision) return decision;
  // Any other doc by its file name, as `next` names a held one: `aidlc research reputation`.
  const named = files.filter((f) => basename(f) === `${name}${config.okf.ext}`);
  if (named.length !== 1) throw new UsageError(msg('noDoc', { name }));
  return join(bundle, named[0]);
}

const usage = (key) => { throw new UsageError(msg(key, {})); };

export const commands = {
  approve(args, { cwd }) {
    const by = tryGit(cwd, 'config', 'user.email');
    if (!by) throw new UsageError(msg('noEmail', {}));
    const { profile } = loadProfile(cwd);
    const bundle = bundleOf(cwd, profile);
    const at = new Date().toISOString(); // to the millisecond: review rounds are compared with it
    const auto = args.includes(S.autoFlag) && delegated(cwd);
    let out = '';
    // Not approved: a door without its decision, or an increment finding on the doc or its intent (docs/design/plan-lint.md).
    const errors = lintPlan(bundle, profile, { base: cwd, skip: [...mergedUnits(cwd, withDefaults(profile).base).keys()] }).filter((f) => S.approveBlocks.includes(f.code));
    const named = args.filter((a) => a !== S.autoFlag).map((name) => ({ name, file: findDoc(cwd, bundle, name) }))
      .map((d) => ({ ...d, text: readFileSync(d.file, 'utf8') })).map((d) => ({ ...d, doc: parseDoc(d.text) }));
    for (const { file } of named) {
      const wanted = new Set([...withIntents(bundle, [file])].map((f) => relPath(cwd, f)));
      const error = errors.find((f) => wanted.has(f.path));
      if (error) throw new UsageError(msg('approveLint', error));
    }
    // One-way doors one at a time, and none while its intent's design review has an open confirmed finding (decision 0015).
    const doors = named.filter(({ doc }) => doc.fm?.oneWayDoor === true).map(({ name }) => name);
    if (doors.length > 1) throw new UsageError(msg('approveBulk', { docs: doors.join(', ') }));
    for (const { name, file: f, doc: d } of named) {
      const intents = d.fm?.type === S.intentType ? [d.fm.id ?? basename(f).match(new RegExp(config.grid.intentFile))?.[1]] : d.fm?.oneWayDoor === true ? readPlan(bundle).intents.filter((i) => i.doc.lines.some((l) => l.includes(basename(f)))).map((i) => i.id) : [];
      const plan = d.fm?.type === S.intentType ? readPlan(bundle) : null, own = plan?.intents.find((i) => i.file === f);
      if (own && approval(d) === ST.draft && reviewDue(cwd, profile, plan, own)) throw new UsageError(msg('approveReview', { doc: name, intent: own.id }));
      for (const intent of intents.filter(Boolean)) {
        const open = (readJson(runtimeFile(cwd, 'design', intent))?.findings ?? []).filter((x) => x.confidence === S.confirmed && (!x.disposition || lapsed(x.until)));
        if (open.length) throw new UsageError(msg('approveOpen', { doc: name, intent, findings: open.map((x) => x.id).join(', ') }));
      }
    }
    // All or nothing: every doc is checked before any is written; a doc named twice is stamped once.
    const writes = new Map();
    for (const { name, file, text, doc } of named) {
      if (writes.has(file)) continue;
      if (!S.approvable.includes(String(doc.fm?.type))) throw new UsageError(msg('notApprovable', { name }));
      const floor = readPlan(bundle).units.find((u) => u.file === file)?.floor;
      const quick = S.workTypes.includes(doc.fm.type) && approval(doc) === ST.draft && computeLane(list(doc.fm.scope), profile, { floor }).lane === QUICK;
      const cls = approval(doc) === ST.stale ? S.auto[0] : quick ? S.auto[1] : null;
      if (auto && !auto.includes(cls)) throw new UsageError(msg('notDelegated', { name }));
      if (auto && cls === S.auto[0] && S.workTypes.includes(doc.fm.type) && !acsKept(cwd, file, doc)) throw new UsageError(msg('notDelegatedAcs', { name })); // a bolt, or a v1 unit
      // The stamps count toward the doc's cap: an approved doc must still pass the docs check (docs/design/approvals.md).
      const stamped = stamp(text, auto ? S.agent : S.human + by, at);
      const over = stampOver(stamped, doc, profile);
      if (over) throw new UsageError(msg('approveSize', { doc: relPath(cwd, file), ...over }));
      writes.set(file, stamped);
    }
    for (const [file, stamped] of writes) {
      writeFileSync(file, stamped);
      out += msg('approvedDoc', { doc: relPath(cwd, file) });
      // Approving a decision that supersedes another marks the older one superseded, never edits its content (decision 0013).
      const sup = supersededId(parseDoc(stamped)), old = sup && readdirSync(dirname(file)).find((f) => f.startsWith(`${sup}-`));
      if (old) {
        const path = join(dirname(file), old);
        writeFileSync(path, readFileSync(path, 'utf8').replace(/^status: .*$/m, `status: ${msg('supersededStatus', { n: basename(file).slice(0, config.ids.decisionDigits) })}`));
        out += msg('supersededBy', { old: relPath(cwd, path), doc: relPath(cwd, file) });
      }
    }
    return done(out);
  },

  delegate(args, { cwd }) {
    const k = args.indexOf(S.until), until = k >= 0 ? args[k + 1] : undefined, classes = k >= 0 ? args.slice(0, k) : args;
    if (!classes.length || classes.some((a) => ![...S.auto, S.off].includes(a)) || (k >= 0 && (!DATE.test(until ?? '') || args.length > k + 2))) usage('delegateUsage');
    const data = readJson(personal(cwd)) ?? {};
    const auto = classes.includes(S.off) ? [] : classes;
    writeJson(personal(cwd), { ...data, approvals: { ...data.approvals, auto, until } }); // a delegation with an until lapses then
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
    if (!S.modes.includes(mode) || (stop !== undefined && !S.stops[stop]) || rest.length % 2 || flags.some((f) => !config.commands.find((c) => c.name === config.fields.mode).flags.includes(f))) usage('modeUsage');
    const run = { mode, stop, report: opt('--report') };
    writeJson(personal(cwd), { ...data, run });
    return done(msg('modeSet', { run: msg('runLine', { mode, stop: list(stop), report: list(run.report) }) }));
  },
};
