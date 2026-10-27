// Intake: the owner's request kept word for word, each sentence with its id, and the pathway, stack and lane it
// proposes from a band per factor, never from one summed score (docs/design/intake.md).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { approval, bundleOf, CLI_DIR, config, docSlug, done, git, gitLines, globRegex, list, loadProfile, msg, parseDoc, plug, questionsOf, readJson, readPlan, relPath, seam, sectionOf, UsageError, withDefaults } from '../../lib/index.mjs';

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
const sentencesOf = (doc) => doc.lines.map((l) => l.match(/^- (Q-\d+\.\d+) (.*)$/)).filter(Boolean).map((m) => ({ id: m[1], text: m[2] }));

// The risk words of each sentence, as { risk, band, ids } per risk the request touches.
function riskWords(sentences) {
  return K.riskWords.map((r) => ({ ...r, ids: sentences.filter((s) => r.words.some((w) => new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`, 'i').test(s.text))).map((s) => s.id) })).filter((r) => r.ids.length);
}

// What the CLI reads from the project itself: the pathway, the stack, and the verification band.
function measure(cwd, profile, bundle) {
  const top = git(cwd, 'rev-parse', '--show-toplevel'), docs = relPath(top, bundle);
  const notCode = [...K.notCode, `${docs}/**`].map(globRegex);
  const code = gitLines(cwd, 'ls-files').some((f) => !notCode.some((g) => g.test(f)));
  const approved = readPlan(bundle).intents.some((i) => approval(i.doc) !== 'draft');
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
function report(id, m, p, lead) {
  const yes = (v) => msg(v ? 'intakeYes' : 'intakeNo', {});
  const why = {
    verification: msg('intakeVerification', { tests: yes(m.tests), ci: yes(m.ci) }),
    risk: lead.risk ? msg('intakeLead', { ids: lead.risk.ids.join(', ') || '-' }) : p.words.length ? p.words.map((w) => msg('intakeWord', { risk: w.risk, ids: w.ids.join(', ') })).join('; ') : msg('intakeNoWords', {}),
  };
  const lines = Object.entries(p.bands).map(([c, band]) => msg('intakeLine', { factor: c, band, why: why[c] ?? msg('intakeLead', { ids: (lead[c]?.ids ?? []).join(', ') || '-' }) }));
  const unscored = K.scored.filter((c) => !lead[c] && c !== 'risk');
  return msg('intakeProposal', { ...p.proposal, pathwayWhy: msg(WHY[p.proposal.pathway], {}) }) + lines.join('')
    + (unscored.length ? msg('intakeUnscored', { factors: unscored.join(', '), id }) : '') + msg('intakeTell', { id });
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
  const digest = createHash('sha256').update(body).digest('hex').slice(0, 16);
  writeFileSync(file, msg('intakeDoc', { ...fm, digest, body }));
};
const version = () => readJson(join(CLI_DIR, config.map.manifest))?.version ?? config.init.devVersion;

export const commands = {
  intake(args, { cwd }) {
    const { profile } = loadProfile(cwd), bundle = bundleOf(cwd, profile), dir = join(bundle, F.Request);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(K.prefix)) : [];
    const m = measure(cwd, profile, bundle);
    // A request already kept: the lead scores it, and only the front matter changes.
    if (/^Q-\d+$/.test(args[0] ?? '')) {
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
      return done(msg('intakeScored', { path: relPath(cwd, file) }) + report(id, m, p, lead));
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
    const p = propose(m, sentences, {}), file = join(dir, `${id}-${docSlug(title)}.md`);
    mkdirSync(dir, { recursive: true });
    write(file, { title: JSON.stringify(title), bands: flow(p.bands), cites: flow(p.cites), proposal: flow(p.proposal), producer: msg('producer', { version: version() }), at: new Date().toISOString().replace(/\.\d+Z$/, 'Z') }, body);
    return done(msg('intakeWrote', { path: relPath(cwd, file), count: sentences.length, first: sentences[0].id, last: sentences.at(-1).id }) + report(id, m, p, {}));
  },
};

// Sources and coverage over the intents judged by method 6 in a v2 project: each goal line, story and draft
// requirement statement cites a source that resolves, and each sentence of its requests is cited (docs/design/intake.md).
const REF = /^(?:Q-\d+\.\d+|Q\d+|A\d+|F-\d+)$/;
const refsIn = (line) => [...line.matchAll(/\[([^\]]+)\]/g)].flatMap((m) => m[1].split(/\s*,\s*/)).filter((r) => REF.test(r));
const cut = (text) => (text.length > K.textMax ? `${text.slice(0, K.textMax).replace(/\s+\S*$/, '')}…` : text);
const docsIn = (dir, pattern) => (existsSync(dir) ? readdirSync(dir).filter((f) => pattern.test(f)) : []);
// A section's lines as written, blank ones and sub-headings left out.
const linesOf = (doc, heading) => sectionOf(doc, heading).map(([n]) => [n, doc.lines[n - 1]]).filter(([, t]) => t.trim() && !/^#/.test(t));

function lintSources({ bundle, profile, intents, requirements, add, inForce, keyLine }) {
  if (!profile.system) return;
  const dir = join(bundle, F.Request), requests = new Map(docsIn(dir, /^Q-\d+-.*\.md$/).map((f) => [f.match(/^Q-\d+/)[0], sentencesOf(parseDoc(readFileSync(join(dir, f), 'utf8')))]));
  const facts = new Set(docsIn(join(bundle, F.Fact), /^F-\d+/).map((f) => f.match(/^F-\d+/)[0]));
  for (const i of intents.filter((x) => x.fm.status !== config.grid.dropped && inForce(x, 'claimSource'))) {
    const named = list(i.fm.request);
    if (!named.length) { add('CLAIM-SOURCE', i, 1, 'claimNoRequest', {}); continue; }
    for (const ref of named.filter((r) => !requests.has(r))) add('CLAIM-SOURCE', i, keyLine(i, 'request'), 'claimNoSuchRequest', { ref, dir: relPath(bundle, dir) });
    const sentences = new Set(named.flatMap((r) => requests.get(r) ?? []).map((s) => s.id));
    const answered = new Set(questionsOf(i.doc).filter((q) => q.answer).map((q) => q.id));
    const assumed = new Set(linesOf(i.doc, K.claims.assumptions).map(([, t]) => t.match(/^\s*[-*]\s+(A\d+)\b/)?.[1]).filter(Boolean));
    const unresolved = (r) => (r.startsWith('Q-') ? !sentences.has(r) && 'claimSentence' : r.startsWith('Q') ? !answered.has(r) && 'claimQuestion' : r.startsWith('A') ? !assumed.has(r) && 'claimAssumption' : !facts.has(r) && 'claimFact');
    const cited = requirements.filter((r) => i.requirements.includes(r.id));
    const claims = [
      ...[K.claims.goal, K.claims.stories].flatMap((h) => linesOf(i.doc, h).map(([n, t]) => [i, h, n, t])),
      ...cited.filter((r) => approval(r.doc) === 'draft').flatMap((r) => linesOf(r.doc, config.grid.requirementSection).map(([n, t]) => [r, config.grid.requirementSection, n, t])),
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

plug('planRules', lintSources);
