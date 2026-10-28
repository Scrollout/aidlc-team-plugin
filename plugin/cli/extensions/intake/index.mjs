// Intake: the owner's request kept word for word, each sentence with its id, and the pathway, stack and lane it
// proposes from a band per factor, never from one summed score (docs/design/intake.md).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { approval, bundleOf, CLI_DIR, config, docSlug, done, git, gitLines, globRegex, list, loadProfile, msg, nameOf, parseDoc, plug, questionsOf, readJson, readPlan, registry, relPath, render, seam, sectionOf, UsageError, withDefaults } from '../../lib/index.mjs';

const ST = config.state.names; // the lifecycle states, by name

const K = config.intake, F = config.okf.bundle.folders;
const WHY = { greenfield: 'intakeGreenfield', feature: 'intakeFeature', brownfield: 'intakeBrownfield' }; // why the project has its pathway
const rank = (band) => K.bands.indexOf(band);
const highest = (bands) => bands.reduce((a, b) => (rank(b) > rank(a) ? b : a), K.bands[0]);
const flow = (map) => `{ ${Object.entries(map).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`).join(', ')} }`;

// The prose as paragraphs of sentences: a blank line ends a paragraph, a list item or a sentence's end mark ends a
// sentence, and the spaces inside one and a list item's marker drop. The words stay as written.
function paragraphs(prose) {
  return prose.replace(/\r\n?/g, '\n').split(/\n\s*\n/)
    .map((p) => p.split(/\n(?=\s*(?:[-*•]|\d+[.)])\s)|(?<=[.!?…]["')\]]?)\s+/).map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim()).filter(Boolean))
    .filter((p) => p.length);
}

// A request's sentences as written in its doc: [{ id, text }].
const sentencesOf = (doc) => doc.lines.map((l) => l.match(new RegExp(K.ids.sentenceLine))).filter(Boolean).map((m) => ({ id: m[1], text: m[2] }));

// The risk words of each sentence, as { risk, band, ids } per risk the request touches.
function riskWords(sentences) {
  return K.riskWords.map((r) => ({ ...r, ids: sentences.filter((s) => r.words.some((w) => new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`, 'i').test(s.text))).map((s) => s.id) })).filter((r) => r.ids.length);
}

// The architecture models whose fit words the request holds (docs/design/models.md#applying-a-model).
const fitsOf = (cwd, profile, sentences) => seam('modelFit', profile).flatMap((fit) => fit(git(cwd, 'rev-parse', '--show-toplevel'), sentences));

// What the CLI reads from the project itself: the pathway, the stack, and the verification band.
function measure(cwd, profile, bundle) {
  const top = git(cwd, 'rev-parse', '--show-toplevel'), docs = relPath(top, bundle);
  const notCode = [...K.notCode, `${docs}/**`].map(globRegex);
  const code = gitLines(cwd, 'ls-files').some((f) => !notCode.some((g) => g.test(f)));
  const approved = readPlan(bundle).intents.some((i) => approval(i.doc) !== ST.draft);
  const pathway = !code ? 'greenfield' : approved ? 'feature' : 'brownfield';
  const tests = Object.values(withDefaults(profile).levels).some((l) => l?.run), ci = K.ci.some((p) => existsSync(join(top, p)));
  const stack = seam('stack', profile).map((fn) => fn(top)).find(Boolean) ?? K.noStack;
  return { pathway, stack, tests, ci, verification: K.bands[2 - Number(tests) - Number(ci)] };
}

// Bands, their cited sentences and the proposal for a request's sentences and the lead's scores (`lead`: { factor: { band, ids } }).
function propose(m, sentences, lead) {
  const words = riskWords(sentences), floor = highest(words.map((w) => w.band));
  const bands = { verification: m.verification, risk: highest([floor, lead.risk?.band ?? floor]) }, cites = {};
  if (words.length) cites.risk = [...new Set(words.flatMap((w) => w.ids))];
  for (const [c, s] of Object.entries(lead)) { bands[c] = highest([bands[c] ?? K.bands[0], s.band]); if (s.ids.length) cites[c] = s.ids; }
  const lane = K.fullWhen.some((c) => bands[c] === K.bands[2]) ? config.gate.lanes[2] : config.gate.lanes[1];
  return { bands, cites, words, floor, proposal: { pathway: m.pathway, stack: m.stack, lane } };
}

// The proposal as the lead reads it: the pathway and why, each band and why, the factors still unscored.
function report(id, m, p, lead, fits = []) {
  const yes = (v) => msg(v ? 'intakeYes' : 'intakeNo', {});
  const why = {
    verification: msg('intakeVerification', { tests: yes(m.tests), ci: yes(m.ci) }),
    risk: lead.risk ? msg('intakeLead', { ids: lead.risk.ids.join(', ') || '-' }) : p.words.length ? p.words.map((w) => msg('intakeWord', { risk: w.risk, ids: w.ids.join(', ') })).join('; ') : msg('intakeNoWords', {}),
  };
  const lines = Object.entries(p.bands).map(([c, band]) => msg('intakeLine', { factor: c, band, why: why[c] ?? msg('intakeLead', { ids: (lead[c]?.ids ?? []).join(', ') || '-' }) }));
  const unscored = K.scored.filter((c) => !lead[c] && c !== 'risk');
  return msg('intakeProposal', { ...p.proposal, pathwayWhy: msg(WHY[p.proposal.pathway], {}) }) + lines.join('')
    + (unscored.length ? msg('intakeUnscored', { factors: unscored.join(', '), id }) : '')
    + (fits.length ? msg('intakeModels', { models: fits.map((f) => msg('intakeModel', { ...f, ids: f.ids.join(', '), slices: f.slices?.length ? [f.slices.map((s) => msg('intakeSlice', s)).join(', ')] : [] })).join(', ') }) : '') + msg('intakeTell', { id });
}

// The lead's scores from `--<factor> <band>:<ids>` flags, each checked against the request's sentences.
function scores(args, id, sentences, kept) {
  const lead = { ...kept };
  for (let k = 0; k < args.length; k++) {
    const factor = args[k].replace(/^--/, '');
    if (!args[k].startsWith('--') || !K.scored.includes(factor) || args[k + 1] === undefined) throw new UsageError(msg('intakeUsage', {}));
    const [band, refs = ''] = args[++k].split(':'), ids = refs.split(',').map((r) => r.trim()).filter(Boolean);
    if (rank(band) < 0) throw new UsageError(msg('intakeBand', { factor, value: args[k], bands: K.bands.join(', ') }));
    if (rank(band) > 0 && !ids.length) throw new UsageError(msg('intakeNoIds', { factor, band }));
    const bad = ids.find((r) => !sentences.some((s) => s.id === r));
    if (bad) throw new UsageError(msg('intakeBadId', { factor, ref: bad, id }));
    lead[factor] = { band, ids };
  }
  return lead;
}

const write = (file, fm, body) => {
  const digest = createHash('sha256').update(body).digest('hex').slice(0, config.text.digest);
  writeFileSync(file, msg('intakeDoc', { ...fm, digest, body }));
};
const version = () => readJson(join(CLI_DIR, config.map.manifest))?.version ?? config.init.devVersion;

export const commands = {
  intake(args, { cwd }) {
    const { profile } = loadProfile(cwd), bundle = bundleOf(cwd, profile), dir = join(bundle, F.Request);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(K.prefix)) : [];
    const m = measure(cwd, profile, bundle);
    // A request already kept: the lead scores it, and only the front matter changes.
    if (new RegExp(K.ids.request).test(args[0] ?? '')) {
      const id = args[0], name = files.find((f) => f.startsWith(`${id}-`));
      if (!name) throw new UsageError(msg('intakeUnknown', { id, dir: relPath(cwd, dir) }));
      const file = join(dir, name), text = readFileSync(file, 'utf8'), doc = parseDoc(text), sentences = sentencesOf(doc);
      // The lead's earlier scores stay: ambiguity and assumptions as recorded, risk where it is above the words'.
      const floor = highest(riskWords(sentences).map((w) => w.band));
      const kept = Object.fromEntries(K.scored.filter((c) => doc.fm.bands?.[c] && (c !== 'risk' || rank(doc.fm.bands[c]) > rank(floor))).map((c) => [c, { band: doc.fm.bands[c], ids: list(doc.fm.cites?.[c]) }]));
      const lead = scores(args.slice(1), id, sentences, kept), p = propose(m, sentences, lead);
      if (lead.risk && rank(lead.risk.band) < rank(p.floor)) throw new UsageError(msg('intakeRiskFloor', { band: lead.risk.band, floor: p.floor }));
      const body = doc.lines.slice(doc.body).join('\n');
      write(file, { title: JSON.stringify(doc.fm.title), bands: flow(p.bands), cites: flow(p.cites), proposal: flow(p.proposal), producer: msg('producer', { version: version() }), at: doc.fm.generated?.at }, body);
      return done(msg('intakeScored', { path: relPath(cwd, file) }) + report(id, m, p, lead, fitsOf(cwd, profile, sentences)));
    }
    const fileArg = args[0] === '--file' ? args[1] : null;
    const prose = fileArg ? readFileSync(resolve(cwd, fileArg), 'utf8') : args.join(' ');
    if (!args.length || (args[0] === '--file' && !fileArg)) throw new UsageError(msg('intakeUsage', {}));
    const n = Math.max(0, ...files.map((f) => Number(f.slice(K.prefix.length).match(/^\d+/)?.[0] ?? 0))) + 1, id = `${K.prefix}${n}`;
    let k = 0;
    const paras = paragraphs(prose).map((p) => p.map((text) => ({ id: `${id}.${++k}`, text })));
    const sentences = paras.flat();
    if (!sentences.length) throw new UsageError(msg('intakeEmpty', {}));
    const title = sentences[0].text.split(' ').slice(0, K.titleWords).join(' ').replace(/[.!?…:;,]+$/, '');
    const body = `\n# ${K.heading}\n${paras.map((p) => p.map((s) => `- ${s.id} ${s.text}`).join('\n')).join('\n\n')}\n`;
    const p = propose(m, sentences, {}), file = join(dir, `${id}-${docSlug(title)}${config.okf.ext}`);
    mkdirSync(dir, { recursive: true });
    write(file, { title: JSON.stringify(title), bands: flow(p.bands), cites: flow(p.cites), proposal: flow(p.proposal), producer: msg('producer', { version: version() }), at: new Date().toISOString().replace(/\.\d+Z$/, 'Z') }, body);
    return done(msg('intakeWrote', { path: relPath(cwd, file), count: sentences.length, first: sentences[0].id, last: sentences.at(-1).id }) + report(id, m, p, {}, fitsOf(cwd, profile, sentences)));
  },
};

// Sources and coverage over the intents judged by method 6 in a v2 project: each goal line, story and draft
// requirement statement cites a source that resolves, and each sentence of its requests is cited (docs/design/intake.md).
const REF = new RegExp(K.ids.ref);
const refsIn = (line) => [...line.matchAll(/\[([^\]]+)\]/g)].flatMap((m) => m[1].split(/\s*,\s*/)).filter((r) => REF.test(r));
const cut = (text) => (text.length > K.textMax ? `${text.slice(0, K.textMax).replace(/\s+\S*$/, '')}…` : text);
const docsIn = (dir, pattern) => (existsSync(dir) ? readdirSync(dir).filter((f) => pattern.test(f)) : []);
// A section's lines as written, blank ones and sub-headings left out.
const linesOf = (doc, heading) => sectionOf(doc, heading).map(([n]) => [n, doc.lines[n - 1]]).filter(([, t]) => t.trim() && !/^#/.test(t));

function lintSources({ bundle, profile, intents, units, requirements, add, inForce, keyLine, base }) {
  if (!profile.system) return;
  const dir = join(bundle, F.Request), requests = new Map(docsIn(dir, new RegExp(K.ids.requestFile)).map((f) => [f.match(new RegExp(K.ids.requestFile))[1], sentencesOf(parseDoc(readFileSync(join(dir, f), 'utf8')))]));
  const facts = new Set(docsIn(join(bundle, F.Fact), new RegExp(K.ids.factFile)).map((f) => f.match(new RegExp(K.ids.factFile))[1]));
  for (const i of intents.filter((x) => x.fm.status !== config.grid.dropped && inForce(x, 'claimSource'))) {
    if (inForce(i, 'elabCorner')) { corners(i, add); readBack(i, add); }
    if (inForce(i, 'unitsOfWork')) unitsOfWork(i, profile, units.filter((b) => b.fm.intent === i.id && b.fm.status !== config.grid.dropped), add, inForce(i, 'unitSlices'), bundle, inForce(i, 'sliceCuts'), base);
    const named = list(i.fm.request);
    if (!named.length) { add('CLAIM-SOURCE', i, 1, 'claimNoRequest', {}); continue; }
    for (const ref of named.filter((r) => !requests.has(r))) add('CLAIM-SOURCE', i, keyLine(i, 'request'), 'claimNoSuchRequest', { ref, dir: relPath(bundle, dir) });
    const sentences = new Set(named.flatMap((r) => requests.get(r) ?? []).map((s) => s.id));
    const answered = new Set(questionsOf(i.doc).filter((q) => q.answer).map((q) => q.id));
    const assumed = new Set(linesOf(i.doc, K.claims.assumptions).map(([, t]) => t.match(new RegExp(K.ids.assumptionLine))?.[1]).filter(Boolean));
    const known = { claimSentence: sentences, claimQuestion: answered, claimAssumption: assumed, claimFact: facts };
    const unresolved = (r) => { const { message } = K.ids.refKinds.find((k) => r.startsWith(k.prefix)); return !known[message].has(r) && message; };
    const cited = requirements.filter((r) => i.requirements.includes(r.id));
    // A corner's source is checked like a claim's, though n/a with a reason needs none.
    for (const [n, t] of linesOf(i.doc, K.claims.corners)) for (const ref of refsIn(t)) { const key = unresolved(ref); if (key) add('CLAIM-SOURCE', i, n, key, { ref, intent: i.id, requests: named.join(', ') }); }
    if (inForce(i, 'elabPersona')) personas(i, named.flatMap((r) => requests.get(r) ?? []), cited, add);
    const claims = [
      ...[K.claims.goal, K.claims.stories, ...(inForce(i, 'elabPersona') ? [K.claims.personas] : [])].flatMap((h) => linesOf(i.doc, h).map(([n, t]) => [i, h, n, t])),
      ...cited.filter((r) => approval(r.doc) === ST.draft).flatMap((r) => linesOf(r.doc, config.grid.requirementSection).map(([n, t]) => [r, config.grid.requirementSection, n, t])),
    ];
    for (const [doc, section, n, text] of claims) {
      const refs = refsIn(text);
      if (!refs.length) add('CLAIM-SOURCE', doc, n, 'claimUnsourced', { section, text: cut(text.trim()) });
      for (const ref of refs) { const key = unresolved(ref); if (key) add('CLAIM-SOURCE', doc, n, key, { ref, intent: i.id, requests: named.join(', ') }); }
    }
    const covered = new Set([i, ...cited].flatMap((d) => d.doc.lines.flatMap(refsIn)));
    for (const r of named.filter((x) => requests.has(x))) {
      const open = requests.get(r).map((s) => s.id).filter((id) => !covered.has(id));
      if (open.length) add('REQUEST-COVERAGE', i, keyLine(i, 'request'), 'requestUncovered', { ids: open.join(', '), request: r });
    }
  }
}

// Method 7: a line under # Corners for each surface of the checklist, each settled (docs/design/elaboration.md#corners-and-answers).
const WAIVED = new RegExp(`^(?:${K.waivers.join('|')})\\s*[:,]\\s*\\S+\\s+\\S+`, 'i');
function corners(i, add) {
  const lines = new Map(linesOf(i.doc, K.claims.corners).map(([n, t]) => [t.match(/^\s*[-*]\s+\**([^:*]+?)\**:\s*(.*)$/), n]).filter(([m]) => m).map(([m, n]) => [m[1].trim().toLowerCase(), { n, rest: m[2].trim() }]));
  const missing = K.corners.map((c) => c.surface).filter((s) => !lines.has(s.toLowerCase()));
  if (missing.length) add('ELAB-CORNER', i, sectionOf(i.doc, K.claims.corners)[0]?.[0] - 1 || 1, 'cornerMissing', { surfaces: missing.join(', ') });
  for (const c of K.corners.filter((x) => lines.has(x.surface.toLowerCase()))) {
    const { n, rest } = lines.get(c.surface.toLowerCase());
    if (!refsIn(rest).length && !new RegExp(K.ids.settled).test(rest) && !WAIVED.test(rest)) add('ELAB-CORNER', i, n, 'cornerUnsettled', { surface: c.surface });
  }
}
// Method 7: the last question reads back the summary, and the owner picked looks correct.
function readBack(i, add) {
  const q = questionsOf(i.doc).at(-1);
  if (!q?.text.startsWith(K.readBack.prefix)) return add('ELAB-OPEN', i, q?.n ?? 1, 'readBackMissing', {});
  const picked = q.labels[q.options.indexOf(q.answer?.match(new RegExp(config.ids.question.letter))?.[1])];
  if (picked !== undefined && picked.toLowerCase() !== K.readBack.yes) add('ELAB-OPEN', i, q.n, 'readBackChanges', { q: q.id });
}

// Method 8: two or more kinds of user in the request get a persona each, and each persona a story citing a requirement
// (docs/design/elaboration.md#personas-and-stories).
function personas(i, sentences, cited, add) {
  const roles = K.roles.map((r) => [r, sentences.filter((s) => new RegExp(`\\b${r}s?\\b`, 'i').test(s.text)).map((s) => s.id)]).filter(([, ids]) => ids.length);
  const listed = linesOf(i.doc, K.claims.personas).map(([n, t]) => [n, t.match(/^\s*[-*]\s+\**([^:*]+?)\**\s*:/)?.[1].trim()]).filter(([, p]) => p);
  if (roles.length > 1 && listed.length < 2 && !i.fm.onePersona) add('ELAB-PERSONA', i, 1, 'personaMissing', { roles: roles.map(([r]) => r).join(', '), ids: [...new Set(roles.flatMap(([, ids]) => ids))].join(', '), count: listed.length });
  if (listed.length < 2) return;
  const reqs = new Set(cited.map((r) => r.id)), told = new Set(), names = listed.map(([, p]) => p);
  for (const [n, t] of linesOf(i.doc, K.claims.stories)) {
    const m = t.match(STORY), who = m && names.find((p) => p.toLowerCase() === m[1].trim().toLowerCase());
    if (!m) add('ELAB-STORY', i, n, 'storyForm', { text: cut(t.trim()) });
    else if (!who) add('ELAB-STORY', i, n, 'storyPersona', { persona: m[1].trim(), personas: names.join(', ') });
    else {
      told.add(who);
      if (!idsOf(t, U.requirement).some((r) => reqs.has(r))) add('ELAB-STORY', i, n, 'storyNoRequirement', { persona: who, reqs: [...reqs].join(', ') || '-' });
    }
  }
  for (const [n, p] of listed.filter(([, p]) => !told.has(p))) add('ELAB-STORY', i, n, 'storyNone', { persona: p });
}

// Method 11: the intent's Units of work, as the method's Mob Elaboration and Units Generation give them
// (docs/design/units-of-work.md). A Unit is a level-two heading under # Units with one `- <Part>: <value>` line per part.
const U = K.units, STORY = new RegExp(render(U.storyLine, { story: U.story }), 'i');
const idsOf = (text, pattern) => [...(text ?? '').matchAll(new RegExp(`\\b${pattern}\\b`, 'g'))].map((m) => m[0]);
const namesIn = (text) => (text ?? '').split(/\s*,\s*/).filter(Boolean);
function unitBlocks(doc) {
  const out = [];
  let on = false, unit = null;
  doc.lines.slice(doc.body).forEach((t, k) => {
    if (/^#\s/.test(t)) { on = new RegExp(`^#\\s+${U.heading}\\s*$`, 'i').test(t); unit = null; return; }
    const n = doc.body + k + 1, h = on && t.match(/^##\s+(.+?)\s*$/), p = unit && !h && t.match(/^\s*[-*]\s+([^:]+):\s*(.*)$/);
    if (h) out.push((unit = { name: h[1], n, parts: {} }));
    else if (p) unit.parts[p[1].trim().toLowerCase()] = p[2].trim();
  });
  return out;
}
// The first circle in a dependency map, as its names in order, or null.
function cycleOf(deps) {
  const state = new Map();
  const visit = (name, path) => {
    if (state.get(name) === 'done') return null;
    if (path.includes(name)) return [...path.slice(path.indexOf(name)), name];
    for (const d of deps.get(name) ?? []) { const c = visit(d, [...path, name]); if (c) return c; }
    state.set(name, 'done');
    return null;
  };
  for (const name of deps.keys()) { const c = visit(name, []); if (c) return c; }
  return null;
}
// Method 12: the slices that serve a Unit's stories, in the slice checks' grammar; with a naming registry, each a name it
// composes from one of its verbs and a domain of the Unit's modules (docs/design/vertical-slices.md#planned-before-built).
function unitSlices(i, u, listed, profile, bundle, add, declared, root) {
  const value = u.parts[U.slices.part.toLowerCase()];
  if (value === undefined) return add('UNIT-WORK', i, u.n, 'unitPart', { name: u.name, part: U.slices.part });
  const slices = [...value.matchAll(new RegExp(U.slices.entry, 'g'))].map((m) => ({ kind: m[1], slice: m[2], decl: m[3], stories: idsOf(m[4], U.story) }));
  const reg = profile.naming && registry(profile, bundle), domains = namesIn(u.parts[U.parts.modules.toLowerCase()]).filter((d) => (profile.modules ?? []).some((m) => String(m.id ?? m.name) === d && m.kind === U.slices.domainKind));
  const names = reg && domains.flatMap((d) => reg.vocabularies.verb.map((verb) => nameOf(U.slices.grammar, { domain: d, verb }, { ...reg, domains: { [d]: {}, ...reg.domains } })));
  for (const s of slices) {
    const at = { name: u.name, slice: s.slice };
    if (!config.slices.kinds.includes(s.kind)) add('UNIT-WORK', i, u.n, 'unitSliceKind', { ...at, kind: s.kind, kinds: config.slices.kinds.join(', ') });
    if (!s.stories.length) add('UNIT-WORK', i, u.n, 'unitSliceNoStory', at);
    for (const story of s.stories.filter((x) => !listed.includes(x))) add('UNIT-WORK', i, u.n, 'unitSliceStory', { ...at, story });
    if (names && !names.includes(s.slice)) add('UNIT-WORK', i, u.n, 'unitSliceName', { ...at, names: names.join(', ') || '-' });
    // Method 13: the slice declares the layers it cuts and what it reaches, checked as its # Surface line is (docs/design/slice-method.md).
    for (const d of declared ? seam('sliceDeclaration', profile) : []) for (const [key, data] of d.problems(d.parse(s.decl), { root, profile, bundle, slice: s.slice, domains, ui: u.parts[U.parts.kind.toLowerCase()] === U.slices.ui })) add('UNIT-WORK', i, u.n, 'unitSliceDecl', { name: u.name, problem: msg(key, data) });
  }
  for (const story of listed.filter((x) => !slices.some((s) => s.stories.includes(x)))) add('UNIT-WORK', i, u.n, 'unitStorySlice', { name: u.name, story });
}

function unitsOfWork(i, profile, bolts, add, sliced, bundle, declared, root) {
  const units = unitBlocks(i.doc), P = U.parts, of = (u, k) => u.parts[P[k].toLowerCase()];
  if (!units.length) return add('UNIT-WORK', i, 1, 'unitsNone', {});
  const modules = new Set((profile.modules ?? []).map((m) => String(m.id ?? m.name))), names = units.map((u) => u.name), seen = new Set();
  const measures = new Set(linesOf(i.doc, U.measures).flatMap(([, t]) => idsOf(t.match(/^\s*[-*]\s+(\S+)/)?.[1], U.measure)));
  const stories = linesOf(i.doc, K.claims.stories).map(([n, t]) => [n, t, t.match(new RegExp(`^\\s*[-*]\\s+(${U.story})\\s`))?.[1]]);
  for (const [n, t] of stories.filter(([, , id]) => !id)) add('UNIT-WORK', i, n, 'storyNoId', { text: cut(t.trim()) });
  for (const u of units) {
    const { name, n } = u;
    if (!new RegExp(U.name).test(name)) add('UNIT-WORK', i, n, 'unitName', { name });
    if (seen.has(name)) add('UNIT-WORK', i, n, 'unitTwice', { name });
    seen.add(name);
    for (const k of Object.keys(P).filter((k) => of(u, k) === undefined)) add('UNIT-WORK', i, n, 'unitPart', { name, part: P[k] });
    if (of(u, 'kind') && !U.kinds.includes(of(u, 'kind'))) add('UNIT-WORK', i, n, 'unitKind', { name, kind: of(u, 'kind'), kinds: U.kinds.join(', ') });
    for (const module of namesIn(of(u, 'modules')).filter((m) => !modules.has(m))) add('UNIT-WORK', i, n, 'unitModule', { name, module });
    for (const req of idsOf(of(u, 'requirements'), U.requirement).filter((r) => !i.requirements.includes(r))) add('UNIT-WORK', i, n, 'unitRequirement', { name, req });
    if (of(u, 'measures') !== undefined && !idsOf(of(u, 'measures'), U.measure).some((m) => measures.has(m))) add('UNIT-WORK', i, n, 'unitMeasure', { name, text: cut(of(u, 'measures')) });
    const listed = idsOf(of(u, 'stories'), U.story);
    if (of(u, 'stories') !== undefined && !listed.length) add('UNIT-WORK', i, n, 'unitNoStory', { name });
    for (const story of listed.filter((s) => !stories.some(([, , id]) => id === s))) add('UNIT-WORK', i, n, 'unitStory', { name, story });
    if (sliced) unitSlices(i, u, listed, profile, bundle, add, declared, root);
    for (const other of namesIn(of(u, 'depends')).filter((d) => d !== U.none && !names.includes(d))) add('UNIT-WORK', i, n, 'unitDepends', { name, other });
  }
  const inUnits = new Set(units.flatMap((u) => idsOf(of(u, 'stories'), U.story)));
  for (const [n, , story] of stories.filter(([, , id]) => id && !inUnits.has(id))) add('UNIT-WORK', i, n, 'storyNoUnit', { story });
  const cycle = cycleOf(new Map(units.map((u) => [u.name, namesIn(of(u, 'depends')).filter((d) => names.includes(d))])));
  if (cycle) add('UNIT-WORK', i, units[0].n, 'unitCycle', { cycle: cycle.join(config.gate.edge) });
  const covered = new Set(units.flatMap((u) => namesIn(of(u, 'modules'))));
  for (const b of bolts) { const out = list(b.fm.modules).filter((m) => !covered.has(m)); if (out.length) add('UNIT-WORK', i, units[0].n, 'boltNoUnit', { bolt: b.id, modules: out.join(', ') }); }
}

// An intent's stories with the modules of the units of work that hold them, for the slice checks.
plug('intentStories', (i) => {
  const units = unitBlocks(i.doc), of = (u) => u.parts[U.parts.modules.toLowerCase()];
  return linesOf(i.doc, K.claims.stories).map(([, t]) => t.match(new RegExp(`^\\s*[-*]\\s+(${U.story})\\s`))?.[1]).filter(Boolean)
    .map((story) => ({ story, modules: units.filter((u) => idsOf(u.parts[U.parts.stories.toLowerCase()], U.story).includes(story)).flatMap((u) => namesIn(of(u))) }));
});

plug('planRules', lintSources);
