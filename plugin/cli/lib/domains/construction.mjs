// Construction by proof: bindings, the walking skeleton, fix bolts and escape hatches as plan lint findings, and the
// traceability page that says which requirements are delivered (docs/design/construction.md).
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { bundleOf, config, lapsed, list, readJson, relPath } from '../foundation/data.mjs';
import { git, tryGit } from '../foundation/git.mjs';
import { msg, render } from '../foundation/text.mjs';
import { parseDoc } from './bundle.mjs';
import { exceptDocs } from './architecture.mjs';
import { inForce, incrementLines, readPlan, topLevel } from './plan.mjs';
import { overlaps } from '../foundation/glob.mjs';
import { writePage } from './map.mjs';
import { mergedUnits, runtimeFile } from '../foundation/store.mjs';
import { delegation } from './approval.mjs';
import { plug, seam } from '../foundation/seams.mjs';

const ST = config.state.names; // the lifecycle states, by name

const C = config.construction, GRID = config.grid;
const idOf = (m) => String(m.id ?? m.name);

// A bolt's binding: the modules it names, split by kind into domains and horizontal modules.
export function bindingOf(u, profile) {
  const kinds = new Map((profile.modules ?? []).map((m) => [idOf(m), m.kind]));
  const domains = u.modules.filter((m) => C.vertical.includes(kinds.get(m)));
  return { domains, horizontal: u.modules.filter((m) => kinds.has(m) && !domains.includes(m)), kinds };
}

// What the board shows for a bolt: its domain, its horizontal module's kind, fix, or span.
export function bindingName(u, profile) {
  if (!u.fm.intent) return C.fix;
  const { domains, horizontal, kinds } = bindingOf(u, profile);
  if (domains.length === 1 && !horizontal.length) return domains[0];
  return !domains.length && horizontal.length === 1 ? kinds.get(horizontal[0]) : C.span;
}

// One bolt outside increment 1: one domain, or one horizontal module a domain bolt of its increment needs.
function bindFindings(u, line, own, profile, add, keyLine) {
  const { domains, horizontal } = bindingOf(u, profile);
  const other = (profile.modules ?? []).filter((m) => C.vertical.includes(m.kind) && !u.modules.includes(idOf(m)));
  const reach = other.map((m) => [idOf(m), u.scope.find((g) => list(m.paths).some((p) => overlaps(g, p)))]).find(([, g]) => g);
  if (domains.length > 1) return add('BOLT-SPAN', u, keyLine(u, 'modules'), 'boltSpan', { domains: domains.join(', ') });
  if (reach) add('BOLT-SPAN', u, keyLine(u, 'scope'), 'boltReach', { module: reach[0], glob: reach[1] });
  if (domains.length ? horizontal.length : horizontal.length !== 1) return add('BOLT-BIND', u, keyLine(u, 'modules'), 'boltBind', { modules: u.modules.join(', ') || '-' });
  const needer = own.find((x) => x.id === String(u.fm[C.neededBy]) && line.ids.includes(x.id));
  if (!domains.length && !(needer && bindingOf(needer, profile).domains.length === 1)) {
    add('BOLT-BIND', u, keyLine(u, C.neededBy), 'boltNeeded', { module: horizontal[0], increment: line.id ?? '' });
  }
}

// The escape hatches the bundle and profile hold: live fix bolts, waivers and boundary exceptions, each with its until.
function docHatches(profile, intents, units, root) {
  const H = C.hatches;
  const excepts = [...new Set(exceptDocs(profile.architecture ?? {}))].filter((d) => existsSync(join(root, d)))
    .map((d) => ({ doc: { file: join(root, d), id: d }, hatch: H.except, until: parseDoc(readFileSync(join(root, d), 'utf8')).fm?.until }));
  return [
    ...units.filter((u) => !u.fm.intent && u.id.startsWith(GRID.boltPrefix)).map((u) => ({ doc: u, hatch: H.fix, until: u.fm.until })),
    ...intents.filter((i) => GRID.endToEnd.some((k) => i.fm[k])).map((i) => ({ doc: i, hatch: H.waiver, until: i.fm.until })),
    ...excepts,
  ];
}

// The findings, through plan lint's `add(code, doc, line, key, data)`; `units` are the live ones, `all` every bolt.
function lintConstruction({ profile, live: intents, units, all, add, keyLine, bundleRel, base }) {
  if (!profile.system) return;
  const top = topLevel(profile), fresh = (u) => !u.fm.verified_hash;
  const kindOf = (id) => (profile.modules ?? []).find((m) => idOf(m) === id)?.kind;
  for (const i of intents.filter((x) => inForce(x, 'boltBind'))) {
    const own = all.filter((u) => u.fm.intent === i.id), lines = incrementLines(i);
    // Increment 1 is the walking skeleton: end to end, on its target (an intent without the section is one increment).
    const first = lines.length ? own.filter((u) => lines[0].ids.includes(u.id)) : own;
    if (profile.deploy && first.length && !first.some((u) => u.acs.some((a) => a.level === top))) add('INCR-SKELETON', i, 1, 'incrSkeletonAc', { level: top });
    if (profile.deploy && first.length && !first.some((u) => u.modules.some((m) => kindOf(m) === C.delivery))) add('INCR-SKELETON', i, 1, 'incrSkeletonDelivery', {});
    for (const line of lines.slice(1)) {
      for (const u of units.filter((x) => line.ids.includes(x.id) && fresh(x))) bindFindings(u, line, own, profile, add, keyLine);
    }
  }
  // A fix bolt fixes one thing: one AC, and no decision or one-way door.
  const doors = [`${bundleRel}/${GRID.decisions}/**`, ...list(profile.decisions?.paths ?? profile.lanes?.full)];
  for (const u of units.filter((x) => !x.fm.intent && x.id.startsWith(GRID.boltPrefix) && fresh(x))) {
    if (u.acs.length !== 1) add('FIX-SHAPE', u, 1, 'fixAcs', { count: u.acs.length });
    const hit = doors.map((d) => [d, u.scope.find((g) => overlaps(g, d))]).find(([, g]) => g);
    if (hit) add('FIX-SHAPE', u, keyLine(u, 'scope'), 'fixDecision', { area: hit[0], glob: hit[1] });
  }
  for (const h of docHatches(profile, intents, units, base).filter((x) => lapsed(x.until))) add('HATCH-EXPIRED', h.doc, 1, 'hatchExpired', { hatch: h.hatch, until: h.until });
}

// Every live escape hatch, for status and the retro: the docs' and the owner's delegation and accepted findings.
export function hatchesOf(st) {
  const live = (x) => ![ST.merged, ST.released].includes(x.state);
  const out = docHatches(st.profile, st.intents.filter(live), st.units.filter(live), st.cwd).map((h) => ({ ...h, id: h.doc.id }));
  const d = delegation(st.cwd);
  if (list(d.auto).length && !lapsed(d.until)) out.push({ id: list(d.auto).join(', '), hatch: C.hatches.delegate, until: d.until });
  const findings = [...st.units.flatMap((u) => (u.review?.rounds ?? []).flatMap((r) => (r.findings ?? []).map((f, k) => ({ f, id: `${u.id} ${render(config.ids.finding, { k: k + 1 })}` })))),
    ...st.intents.flatMap((i) => (readJson(runtimeFile(st.cwd, 'design', i.id))?.findings ?? []).map((f) => ({ f, id: `${i.id} ${f.id}` })))];
  for (const { f, id } of findings.filter((x) => x.f.disposition === config.state.dispositions[1] && !lapsed(x.f.until))) out.push({ id, hatch: C.hatches.accepted, until: f.until });
  return out;
}
export const hatchLine = (hatches) => hatches.map((h) => msg('hatchItem', { ...h, until: list(h.until) })).join(', ');

// Each intent's ACs from requirement to release: the bolt's merge, the release (or tag) holding it, and the tagged
// test files there. A requirement is delivered when every AC of every bolt citing it has a test in a release.
export function traceOf(cwd, profile) {
  const bundle = bundleOf(cwd, profile), plan = readPlan(bundle), merged = mergedUnits(cwd, profile.base);
  // Real paths on both sides: git names the top through a resolved symlink (macOS /var is /private/var), the bundle may not.
  const top = git(cwd, 'rev-parse', '--show-toplevel'), bundleRel = relPath(realpathSync.native(top), existsSync(bundle) ? realpathSync.native(bundle) : bundle);
  return plan.intents.map((i) => {
    const deploy = readJson(runtimeFile(cwd, 'deploys', i.id)) ?? {};
    const smoked = !profile.deploy?.smoke || (deploy.smoke?.ok && deploy.smoke.at >= deploy.release.at);
    const release = deploy.release?.ok && smoked ? deploy.release.base : null;
    const shippedAt = (sha) => (!sha ? null : release ? (tryGit(cwd, 'merge-base', '--is-ancestor', sha, release) !== null ? release : null)
      : (tryGit(cwd, 'tag', '--contains', sha) ?? '').split('\n')[0] || null);
    const rows = plan.units.filter((u) => u.fm.intent === i.id).flatMap((u) => u.acs.map((a) => {
      const tag = `${u.id}/${a.id}`, sha = merged.get(u.id), ref = shippedAt(sha);
      // At the commit that shipped or merged it, else in the tree as it stands (the gate's merge result).
      const at = ref ?? sha, found = tryGit(cwd, 'grep', '-l', '-F', tag, ...(at ? [at] : []), '--', '.', `:(exclude)${bundleRel}/**`) ?? '';
      const files = found.split('\n').filter(Boolean).map((f) => (at ? f.slice(at.length + 1) : f));
      return { reqs: u.requirements, tag, tests: files, merge: sha?.slice(0, config.text.sha.short), release: ref && files.length ? ref.slice(0, config.text.sha.long) : null };
    }));
    const cited = [...new Set(rows.flatMap((r) => r.reqs))];
    return { intent: i, rows, delivered: cited.filter((r) => rows.filter((x) => x.reqs.includes(r)).every((x) => x.release)) };
  });
}

// One traceability page per intent with bolts, at every merge of a v2 project.
export function writeTrace(cwd, profile) {
  if (!profile.system) return [];
  return traceOf(cwd, profile).filter((t) => t.rows.length).flatMap((t) => {
    const rows = t.rows.map((r) => msg('traceRow', { reqs: r.reqs.join(', ') || '-', tag: r.tag, tests: r.tests.join(', ') || '-', merge: r.merge ?? '-', release: r.release ?? '-' })).join('');
    const file = join(bundleOf(cwd, profile), render(C.trace, { id: t.intent.id.toLowerCase() }));
    return writePage(file, msg('traceBody', { rows, delivered: t.delivered.join(', ') || '-' }) + seam('traceSections', profile).map((section) => section(cwd, profile, t.intent)).join(''), 'traceDoc', { intent: t.intent.id });
  });
}

plug('planRules', lintConstruction);
// A v2 requirement is delivered by released tests; status lists the live escape hatches.
plug('delivered', (st) => (st.profile.system ? traceOf(st.cwd, st.profile).flatMap((t) => t.delivered) : null));
plug('statusLines', (st) => { const hatches = st.profile.system ? hatchesOf(st) : []; return hatches.length ? msg('statusHatches', { hatches: hatchLine(hatches) }) : ''; });
