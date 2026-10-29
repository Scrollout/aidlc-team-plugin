// A deterministic Inception: pathways, a sized intent with real answers, domains, platform facts and decisions that
// cohere, as plan lint findings (docs/design/inception.md).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundleOf, CLI_DIR, config, done, isMap, list, readJson, relPath, UsageError } from '../foundation/data.mjs';
import { sh } from '../foundation/git.mjs';
import { msg, render } from '../foundation/text.mjs';
import { loadProfile, withDefaults } from '../foundation/profile.mjs';
import { docSlug, hashHolds, parseDoc, sectionOf, supersededId } from './bundle.mjs';
import { glossaryOf } from './naming.mjs';
import { reqId } from './plan.mjs';
import { plug, seam } from '../foundation/seams.mjs';

const P = config.inception, F = config.okf.bundle.folders, FD = config.fields, Q = config.ids.question;
const superseded = (d) => String(d.fm.status ?? '').startsWith(P.superseded); // MADR's superseded by ADR-<NNNN>, or v1's superseded
const docsIn = (bundle, dir) => (existsSync(join(bundle, dir)) ? readdirSync(join(bundle, dir)).filter((f) => f.endsWith(config.okf.ext) && f !== config.okf.index).sort() : [])
  .map((f) => ({ file: join(bundle, dir, f), name: f, doc: parseDoc(readFileSync(join(bundle, dir, f), 'utf8')) })).filter((d) => d.doc.fm);
// A section's bullet lines as written: the prose view drops inline code, where table names sit.
const bullets = (doc, heading) => sectionOf(doc, heading).map(([n]) => [n, doc.lines[n - 1]]).filter(([, t]) => /^\s*[-*]\s/.test(t));

// An intent's questions, each with its options and its answer, from # Questions.
export function questionsOf(doc) {
  const out = [];
  for (const [n, t] of sectionOf(doc, P.questions)) {
    const q = t.match(new RegExp(Q.line)), opt = t.match(new RegExp(Q.option)), ans = t.match(new RegExp(Q.answer, 'i'));
    if (q) out.push({ n, id: q[1], text: q[2], options: [], labels: [], answer: null });
    else if (opt && out.length) { out.at(-1).options.push(opt[1]); out.at(-1).labels.push(opt[2].trim()); }
    else if (ans && out.length) out.at(-1).answer = ans[1].trim();
  }
  return out;
}
// An answer names one of its question's option letters; "not decided" leaves the question open.
const undecided = (q) => q.answer && P.undecided.some((w) => q.answer.toLowerCase().includes(w));
const answered = (q) => q.answer && !undecided(q) && q.options.includes(q.answer.match(new RegExp(Q.letter))?.[1]);
// The words of an answer after its option letter, where a vague term would hide (docs/design/elaboration.md).
const vagueIn = (q) => P.vague.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(q.answer.replace(new RegExp(Q.lead), '')));

// The findings, through `add(code, doc, line, key, data)` and `inForce(intent, key)` from plan lint.
export function lintInception({ bundle, profile, intents, requirements, merged, add, inForce, incrementLines, keyLine, base }) {
  const v2 = Boolean(profile.system);
  const decisions = docsIn(bundle, config.grid.decisions).map((d) => ({ ...d, id: d.name.slice(0, config.ids.decisionDigits), fm: d.doc.fm, stale: Boolean(d.doc.fm.verified_hash) && !hashHolds(d.doc, d.file) }));
  const domains = docsIn(bundle, F.Domain).map((d) => ({ ...d, code: String(d.doc.fm.code ?? d.name.slice(0, -config.okf.ext.length)) })).map((d) => ({ ...d, id: d.code, owns: bullets(d.doc, P.owns).map(([, t]) => t.match(/`([^`]+)`/)?.[1]).filter(Boolean) }));
  const facts = new Map(docsIn(bundle, F.Fact).map((d) => [d.name.match(new RegExp(config.ids.factNumber))?.[0], d]));
  const stale = (fact) => (Date.now() - Date.parse(fact.doc.fm.at)) / 86400000 > Number(profile.facts?.maxAgeDays ?? P.maxAgeDays);
  const owners = new Map();
  for (const d of domains) for (const t of d.owns) owners.set(t, [...(owners.get(t) ?? []), d.code]);
  for (const [t, codes] of [...owners].filter(([, c]) => c.length > 1)) add('DOMAIN-DATA', domains.find((d) => d.code === codes[1]), 1, 'domainData', { table: t, owners: codes.join(', ') });
  const terms = new Map();
  for (const e of glossaryOf(bundle)) terms.set(e.term.toLowerCase(), [...(terms.get(e.term.toLowerCase()) ?? []), e]);
  for (const [term, es] of [...terms].filter(([, es]) => new Set(es.map((e) => e.meaning)).size > 1)) add('DOMAIN-TERM', domains.find((d) => d.code === es[1].domain) ?? domains[0], 1, 'domainTerm', { term, domains: es.map((e) => e.domain).join(', ') });

  // Decisions: references, facts, amendment, horizon and coherence.
  const factProblems = (d) => (isMap(d.fm.affects) && d.fm.affects.platform && !list(d.fm.facts).length ? ['factMissing'] : []);
  for (const d of decisions) {
    for (const ref of list(d.fm.facts).filter((r) => !facts.has(r))) add('DOC-REF', d, keyLine(d, 'facts'), 'docRef', { ref, key: 'facts', type: 'Fact' });
    const sup = supersededId(d.doc);
    if (sup && !decisions.some((x) => x.id === sup)) add('DOC-REF', d, keyLine(d, FD.supersedes), 'docRef', { ref: sup, key: FD.supersedes, type: config.grid.decisionType });
    if (!v2) continue;
    if (factProblems(d).length) add('FACT-MISSING', d, keyLine(d, FD.affects), 'factMissing', {});
    for (const ref of list(d.fm.facts).filter((r) => facts.has(r) && stale(facts.get(r)))) add('FACT-STALE', d, keyLine(d, 'facts'), 'factStale', { fact: ref, days: profile.facts?.maxAgeDays ?? P.maxAgeDays });
    if (d.fm.verified_hash && !superseded(d) && d.stale) add('DOC-AMEND', d, 1, 'docAmend', {});
    const serves = list(d.fm.serves).map((s) => s.match(new RegExp(config.ids.serves))).filter(Boolean);
    if (!d.fm.verified_hash && serves.length) {
      const intent = intents.find((i) => i.id === serves[0][1]), done = intent ? incrementLines(intent).filter((l) => l.ids.length && l.ids.every((id) => merged.has(id))).length : 0;
      if (serves.every((m) => Number(m[2]) > done + P.horizon)) add('DECISION-HORIZON', d, keyLine(d, FD.serves), 'decisionHorizon', { serves: list(d.fm.serves).join(', '), horizon: P.horizon, next: done + 1 });
    }
  }
  if (v2) coherence(decisions.filter((d) => !superseded(d)), domains, profile, add, keyLine);

  // The names a business transaction may cross, and the test runs a baseline proves.
  const known = [...(profile.modules ?? []).map((m) => String(m.id ?? m.name)), ...domains.map((d) => d.code)].filter(Boolean).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const runs = Object.values(withDefaults(profile).levels).map((l) => l?.run).filter(Boolean).map(String);
  // Intents: size, questions, pathway steps, requirements without a domain.
  for (const i of intents.filter((x) => x.fm.status !== config.grid.dropped)) {
    const qs = questionsOf(i.doc);
    for (const q of qs.filter((x) => !x.answer)) add('ELAB-OPEN', i, q.n, 'elabOpen', { q: q.id });
    for (const q of qs.filter(undecided)) add('ELAB-OPEN', i, q.n, 'elabUndecided', { q: q.id });
    for (const q of qs.filter((x) => x.answer && !undecided(x) && !answered(x))) add('ELAB-BARE', i, q.n, 'elabBare', { q: q.id, answer: q.answer, options: q.options.join(', ') || '-' });
    for (const q of v2 && inForce(i, 'elabVague') ? qs.filter((x) => answered(x) && vagueIn(x)) : []) add('ELAB-VAGUE', i, q.n, 'elabVague', { q: q.id, word: vagueIn(q) });
    if (!v2 || !inForce(i, 'pathwaySkip')) continue; // a v1 project keeps its intents until it migrates (decision 0013)
    const incs = incrementLines(i).length, doms = list(i.fm.domains);
    if (incs > P.maxIncrements || doms.length > P.maxDomains) add('INTENT-SIZE', i, 1, 'intentSize', { increments: incs, domains: doms.length, maxIncrements: P.maxIncrements, maxDomains: P.maxDomains });
    for (const r of requirements.filter((x) => list(i.fm.requirements).some((c) => reqId(c) === x.id) && !list(x.fm.domains).length)) add('DOMAIN-REQ', i, keyLine(i, 'requirements'), 'domainReq', { req: r.id });
    const pathway = i.fm.pathway;
    if (!P.pathways[pathway]) { add('PATHWAY-SKIP', i, 1, 'pathwayNone', { pathways: Object.keys(P.pathways).join(', ') }); continue; }
    const cited = decisions.filter((d) => i.doc.lines.some((l) => l.includes(d.name)));
    const steps = {
      questions: () => qs.every(answered),
      domains: () => doms.every((c) => domains.some((d) => d.code === c)),
      facts: () => cited.every((d) => !factProblems(d).length),
      map: () => [config.map.file, config.map.fileV2].some((f) => existsSync(join(bundle, f))),
      kinds: () => (profile.modules ?? []).every((m) => m.kind),
      // Method 10 (docs/design/intake.md#brownfield): what the code serves, and the suite passing on the base with its debt.
      business: () => bullets(i.doc, P.business).some(([, t]) => known.some((k) => new RegExp(`(^|[^\\w-])${k}([^\\w-]|$)`, 'i').test(t.replace(/^[^:]*:/, '')))),
      baseline: () => runs.every((run) => list(i.fm.baseline).some((f) => String(facts.get(f)?.doc.fm.command ?? '') === run)) && bullets(i.doc, P.debt).length > 0,
      ...Object.assign({}, ...seam('pathwaySteps', profile).map((steps) => steps(i, { bundle, profile, base }))), // an extension's steps (docs/design/library.md#seams)
    };
    const due = (s) => !P.stepsSince[s] || inForce(i, P.stepsSince[s]);
    for (const step of P.pathways[pathway].filter((s) => due(s) && !steps[s]())) add('PATHWAY-SKIP', i, keyLine(i, FD.pathway), 'pathwaySkip', { pathway, step, why: P.steps[step] });
  }
}

// DESIGN-COHERENCE over the decisions' affects: transactions across domains, dependencies the kind table forbids,
// a table owned twice or by a horizontal module, and one key given two values without a supersedes.
function coherence(decisions, domains, profile, add, keyLine) {
  const kinds = new Map((profile.modules ?? []).map((m) => [String(m.id ?? m.name), m.kind])), rules = config.vocabulary.kindRules, owner = new Map();
  for (const d of domains) for (const t of d.owns) owner.set(t, [d.code, d]);
  for (const d of decisions) {
    const a = isMap(d.fm.affects) ? d.fm.affects : {}, at = keyLine(d, FD.affects);
    for (const tx of list(a.transactions).map((x) => String(x).split(/\s*[+,]\s*/))) if (new Set(tx).size > 1) add('DESIGN-COHERENCE', d, at, 'coherenceTx', { domains: tx.join(' + ') });
    for (const dep of list(a.dependencies)) {
      const [from, to] = dep.split(config.gate.edge).map((s) => s.trim()), [fk, tk] = [kinds.get(from), kinds.get(to)];
      if (fk && tk && ![...list(rules[fk]?.any), ...list(rules[fk]?.surface)].includes(tk)) add('DESIGN-COHERENCE', d, at, 'coherenceDep', { dep, fromKind: fk, toKind: tk });
    }
    for (const [table, who] of Object.entries(isMap(a.data) ? a.data : {})) {
      if (kinds.get(who) && kinds.get(who) !== 'domain') add('DESIGN-COHERENCE', d, at, 'coherenceHorizontal', { table, owner: who, kind: kinds.get(who) });
      const prior = owner.get(table);
      if (prior && prior[0] !== who && supersededId(prior[1].doc) !== d.id && supersededId(d.doc) !== prior[1].id) add('DESIGN-COHERENCE', d, at, 'coherenceTwice', { table, owners: `${prior[0]}, ${who}`, other: prior[1].id ?? prior[1].code });
      else owner.set(table, [who, d]);
    }
  }
}

// `aidlc fact "<title>" --env <environment> -- <command>`: a read-only probe on the target, its output recorded as
// platform/F-<n>-<slug>.md (docs/design/inception.md#platform-facts).
export const commands = {
  fact(args, { cwd }) {
    const cut = args.indexOf('--'), head = cut < 0 ? args : args.slice(0, cut), command = cut < 0 ? '' : args.slice(cut + 1).join(' ');
    const title = head.find((a, k) => !a.startsWith('--') && head[k - 1] !== '--env'), environment = head[head.indexOf('--env') + 1];
    if (!title || !command || head.indexOf('--env') < 0 || !environment) throw new UsageError(msg('factUsage', {}));
    const r = sh(cwd, command), output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd();
    if (r.status !== 0) throw new UsageError(msg('factFailed', { exit: r.status, output: output.split('\n').slice(-P.outputLines).join('\n') }));
    const { profile } = loadProfile(cwd), dir = join(bundleOf(cwd, profile), F.Fact);
    const n = Math.max(0, ...(existsSync(dir) ? readdirSync(dir) : []).map((f) => Number(f.match(new RegExp(config.ids.factNumber))?.[1] ?? 0))) + 1, id = render(config.ids.fact, { n });
    const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z'), version = readJson(join(CLI_DIR, config.map.manifest))?.version ?? config.init.devVersion;
    const file = join(dir, `${id}-${docSlug(title)}${config.okf.ext}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, msg('factDoc', { title: JSON.stringify(title), description: JSON.stringify(msg('factDescription', { title, environment })), command: JSON.stringify(command), environment: JSON.stringify(environment), digest: createHash('sha256').update(output).digest('hex').slice(0, config.text.digest), at, producer: msg('producer', { version }), output: output.split('\n').slice(-P.outputLines).join('\n') }));
    return done(msg('factWrote', { path: relPath(cwd, file), id }));
  },
};

plug('planRules', lintInception);
