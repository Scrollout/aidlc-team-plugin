// OKF v0.2 validator and index generator (docs/design/okf.md). Settings, codes and messages come from cli.json.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { at as dataAt, bundleOf, config, done, isMap, list, slug, UsageError, relPath } from '../foundation/data.mjs';
import { escapeRe, finding as codeFinding, msg, render } from '../foundation/text.mjs';
import { loadProfile, stageProblem } from '../foundation/profile.mjs';
import { parseYaml, YamlError } from '../foundation/yaml.mjs';
import { kindProblems } from './method.mjs';
import { generatedRules, moduleProblems, namingProblems } from './naming.mjs';
import { inside as inGlob } from '../foundation/glob.mjs';
import { gitLines } from '../foundation/git.mjs';
import { execFileSync } from 'node:child_process';
import { seam } from '../foundation/seams.mjs';

const OKF = config.okf;
const PROFILE = config.layers.find((l) => l.from === 'project').path; // findings about the profile point at it

// ---- Documents ----

const truthy = (v) => !(v === null || v === undefined || v === false || v === 0 || v === '' || (Array.isArray(v) && !v.length) || (isMap(v) && !Object.keys(v).length));
const pyStr = (v) => (v === true ? 'True' : v === false ? 'False' : String(v));

// Splits a file like the reference OKFDocument.parse: { fm, lines, body } or { error, detail, line }.
export function parseDoc(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { fm: null, lines, body: 0 };
  const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---');
  if (end < 0) return { error: 'fmUnterminated', line: 1, lines };
  let fm;
  try {
    fm = parseYaml(lines.slice(1, end).join('\n'), 2);
  } catch (e) {
    if (!(e instanceof YamlError)) throw e;
    return { error: 'fmYaml', detail: e.message, line: e.line, lines };
  }
  if (!truthy(fm)) fm = {};
  if (!isMap(fm)) return { error: 'fmMapping', line: 1, lines };
  return { fm, lines, body: end + 1, fmLines: lines.slice(0, end + 1) };
}

const read = (file) => readFileSync(file, 'utf8');
const readIf = (file) => (existsSync(file) ? read(file) : '');
const sortNames = (dir) => readdirSync(dir).sort();

function walk(dir, out = []) {
  for (const name of sortNames(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ---- Indexes, as the reference index.py ----

// Entry lines of an existing index: link → description text.
function existingEntries(indexFile) {
  const out = new Map();
  for (const line of readIf(indexFile).split('\n')) {
    const m = line.match(/^\* \[[^\]]*\]\(([^)]+)\)(?: - (.*))?$/);
    if (m) out.set(m[1], m[2] ?? '');
  }
  return out;
}

// House addition: a hint written after the description (`… Load when …`) survives regeneration.
function withHint(desc, old) {
  if (!desc || !old || old === desc) return desc;
  if (old.startsWith(desc)) return old;
  const at = OKF.hints.map((h) => old.indexOf(h)).filter((k) => k > 0).sort((a, b) => a - b)[0];
  return at === undefined ? desc : `${desc} ${old.slice(at)}`;
}

// Only the root index may carry front matter, and only these keys.
const rootKeys = (fm) => Object.keys(fm).every((k) => OKF.rootIndexKeys.includes(k));

function rootFrontmatter(indexFile) {
  const doc = parseDoc(readIf(indexFile));
  return doc.fmLines && rootKeys(doc.fm) ? doc.fmLines.join('\n') + '\n\n' : '';
}

// Prose paragraphs of an existing index, keyed by the heading they sit under ('' before any heading).
function existingProse(indexFile) {
  const out = new Map();
  const doc = parseDoc(readIf(indexFile));
  if (doc.error) return out;
  let heading = '';
  let gap = false;
  for (const line of doc.lines.slice(doc.body)) {
    const h = line.match(/^# (.+)$/);
    if (h) [heading, gap] = [h[1], false];
    else if (!line.trim()) gap = true;
    else if (!/^\s*[*+-]\s/.test(line)) {
      const block = out.get(heading) ?? [];
      if (gap && block.length) block.push('');
      block.push(line);
      out.set(heading, block);
      gap = false;
    }
  }
  return out;
}

function indexText(entries, prose = new Map()) {
  const groups = Map.groupBy(entries, (e) => e.type || OKF.otherType);
  return [...groups.keys()].sort().map((type) => {
    const lines = groups.get(type).sort((a, b) => cmp(a.title.toLowerCase(), b.title.toLowerCase()))
      .map((e) => `* [${e.title}](${e.link})${e.desc ? ` - ${e.desc}` : ''}`);
    const kept = prose.get(type);
    return [`# ${type}`, '', ...(kept ? [...kept, ''] : []), ...lines].join('\n');
  }).join('\n\n') + '\n';
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Returns Map(dir → index text) for every directory the generator writes.
export function buildIndexes(root) {
  root = resolve(root);
  const dirs = new Set();
  for (const f of walk(root).filter((f) => f.endsWith(OKF.ext))) {
    for (let d = dirname(f); ; d = dirname(d)) {
      dirs.add(d);
      if (d === root) break;
    }
  }
  const depth = (d) => (d === root ? 0 : relative(root, d).split(sep).length);
  const order = [...dirs].sort((a, b) => depth(b) - depth(a) || cmp(a, b));
  const descs = new Map();
  const out = new Map();
  for (const dir of order) {
    const entries = [];
    const old = existingEntries(join(dir, OKF.index));
    for (const name of sortNames(dir)) {
      const p = join(dir, name);
      if (name === OKF.index || name === OKF.log) continue;
      if (statSync(p).isDirectory()) {
        entries.push({ type: OKF.subdirType, title: name, link: `${name}/${OKF.index}`, desc: descs.get(p) ?? '' });
      } else if (name.endsWith(OKF.ext)) {
        const doc = parseDoc(read(p));
        if (doc.error) continue;
        const fm = doc.fm ?? {};
        entries.push({
          type: truthy(fm.type) ? pyStr(fm.type) : '',
          title: truthy(fm.title) ? pyStr(fm.title) : name.slice(0, -OKF.ext.length),
          link: name,
          desc: withHint(truthy(fm.description) ? pyStr(fm.description) : '', old.get(name)),
        });
      }
    }
    if (!entries.length) continue;
    const prefix = dir === root ? rootFrontmatter(join(dir, OKF.index)) : '';
    const prose = existingProse(join(dir, OKF.index));
    // Prose under a heading the new index no longer has moves to the top, so none is lost.
    const types = new Set(entries.map((e) => e.type || OKF.otherType));
    const top = [...prose].filter(([h]) => h === '' || !types.has(h)).flatMap(([h, block], k) => (k && h !== '' ? ['', ...block] : block));
    out.set(dir, prefix + (top.length ? top.join('\n') + '\n\n' : '') + indexText(entries, prose));
    if (dir === root) continue;
    // The parent's existing line, written by hand where the reference asks an LLM; else one entry's description, as the reference.
    const line = existingEntries(join(dirname(dir), OKF.index)).get(`${relative(dirname(dir), dir)}/${OKF.index}`);
    descs.set(dir, line || (entries.length === 1 ? entries[0].desc : ''));
  }
  return out;
}

// Writes changed indexes; returns the files written.
export function writeIndexes(root) {
  const written = [];
  for (const [dir, text] of buildIndexes(root)) {
    const file = join(dir, OKF.index);
    if (existsSync(file) && read(file) === text) continue;
    writeFileSync(file, text);
    written.push(file);
  }
  return written;
}

// ---- Validation ----

const DATE = /^## (\d{4})-(\d{2})-(\d{2})\s*$/;
const ENTRY = /^\* \[([^\]]+)\]\(([^)\s]+)\)( - .*)?$/;
const MD_LINK = new RegExp(render(config.okf.mdLink, { ext: escapeRe(config.okf.ext) }), 'g');
const LINK = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

const validDate = (y, m, d) => {
  const t = new Date(Date.UTC(+y, +m - 1, +d));
  return t.getUTCFullYear() === +y && t.getUTCMonth() === +m - 1 && t.getUTCDate() === +d;
};

// Body lines outside code fences, with inline code removed: [lineNumber, text].
export function proseLines(lines, from) {
  const out = [];
  let fence = null;
  for (let k = from; k < lines.length; k++) {
    const m = lines[k].match(/^\s*(```|~~~)/);
    if (m) fence = fence === m[1] ? null : fence ?? m[1];
    else if (!fence) out.push([k + 1, lines[k].replace(/`[^`]*`/g, '')]);
  }
  return out;
}

// The body lines outside code fences as [lineNumber, text]; with a heading, only those of its section.
export function sectionOf(doc, heading) {
  let on = !heading;
  return proseLines(doc.lines, doc.body).filter(([, text]) => (/^#{1,6}\s/.test(text) ? ((on = !heading || new RegExp(`^#{1,6}\\s+${heading}\\s*$`, 'i').test(text)), false) : on));
}

// The .md files a doc's body (or one section) links to, resolved from its folder or, for a `/` link, the bundle root.
export const linksOf = (d, bundle, heading) => sectionOf(d.doc, heading).flatMap(([n]) => [...d.doc.lines[n - 1].matchAll(MD_LINK)])
  .map((m) => (m[1].startsWith('/') ? join(bundle, m[1]) : resolve(dirname(d.file), m[1])));

function checkLinks(root, file, lines, from, add) {
  for (const [n, text] of proseLines(lines, from)) {
    for (const m of text.matchAll(LINK)) {
      const target = m[1];
      if (/^([a-z][a-z0-9+.-]*:|#|<)/i.test(target)) continue;
      let path = target.split('#')[0].split('?')[0];
      try { path = decodeURI(path); } catch { /* keep as written */ }
      if (!path) continue;
      const abs = path.startsWith('/') ? join(root, path) : join(dirname(file), path);
      if (!existsSync(abs)) add(file, n, 'HOUSE-LINK', 'linkBroken', { target });
    }
  }
}

function checkIndex(file, doc, isRoot, add) {
  if (doc.error || (doc.fm && (!isRoot || !rootKeys(doc.fm)))) {
    add(file, doc.line ?? 1, 'OKF-INDEX', 'indexFrontmatter', { keys: OKF.rootIndexKeys.join(', ') });
    if (doc.error) return;
  }
  let headed = false;
  for (let k = doc.body; k < doc.lines.length; k++) {
    const line = doc.lines[k];
    if (/^#{1,6} \S/.test(line)) headed = true;
    else if (ENTRY.test(line)) { if (!headed) add(file, k + 1, 'OKF-INDEX', 'indexUnheaded'); }
    else if (/^\s*[*+-]\s/.test(line)) add(file, k + 1, 'OKF-INDEX', 'indexLine'); // prose paragraphs are allowed
  }
}

function checkLog(file, doc, add) {
  if (doc.error) return add(file, doc.line, 'OKF-LOG', 'logFrontmatter');
  for (const [n, line] of proseLines(doc.lines, doc.body)) {
    if (!line.startsWith('## ')) continue;
    const m = line.match(DATE);
    if (!m || !validDate(m[1], m[2], m[3])) add(file, n, 'OKF-LOG', 'logHeading');
  }
}

// A type's size cap: the project's `docs.caps` first, then the plugin's (docs/design/okf-validation.md).
export const sizeCap = (type, caps = {}) => caps[type] ?? caps.default ?? OKF.sizeCaps[type] ?? OKF.sizeCapDefault;

// The file name a title gives: lower case words without apostrophes or the commas inside numbers, at most
// slugMax characters, cut at a word, never in one (docs/design/bundle.md).
export function docSlug(title) {
  const words = slug(String(title).replace(/['’]/g, '').replace(/(\d),(?=\d)/g, '$1'), OKF.bundle.slugWords);
  return words.length > OKF.bundle.slugMax ? words.slice(0, OKF.bundle.slugMax + 1).replace(/-[^-]*$/, '') : words;
}

// A doc's approval hash: its front matter without the stamp and plan fields, keys sorted, and its body (docs/design/approvals.md).
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : isMap(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
// The approval hash: front matter without the stamp, plan and provenance fields (`generated`, which the docs hook
// restamps on every edit), and the body without link targets, so a doc renamed and its links rewritten keeps every
// approval. Earlier stamps used other forms, still accepted: `links` (0.216.0, provenance kept) and `raw` (before
// it, link targets kept too), which reviews and cards still use.
const linkBlind = (body) => body.replace(/\]\([^)\s]*\)/g, ']()');
const FORMS = config.state.hashForms;
export const RAW = FORMS.at(-1);
export function hashDoc(doc, form = FORMS[0]) {
  const skip = form === FORMS[0] ? [...config.state.hashExclude, ...config.state.hashProvenance] : config.state.hashExclude;
  const fm = Object.fromEntries(Object.entries(doc.fm ?? {}).filter(([k]) => !skip.includes(k))), body = doc.lines.slice(doc.body).join('\n');
  return createHash('sha256').update(JSON.stringify(sortKeys(fm)) + '\n' + (form === RAW ? body : linkBlind(body))).digest('hex');
}
// Whether a doc's approval still holds: its hash in any form a stamp was written in, or, for a doc in git, an
// approved text that differs from it only in link targets and provenance.
const held = new Map();
export function hashHolds(doc, file = doc?.file) {
  const hash = doc.fm?.verified_hash;
  if (FORMS.some((f) => hashDoc(doc, f) === hash)) return true;
  if (!file || !hash) return false;
  const key = `${file}\n${hash}\n${hashDoc(doc)}`;
  if (!held.has(key)) held.set(key, linksOnly(file, doc));
  return held.get(key);
}

// The text of a doc as last approved: the newest commit of it whose content matches its verified_hash.
export function approvedText(file, hash) {
  // Through renames: each commit with the path the doc had then, from the repository's root.
  // A merge not yet committed (the gate's) holds a renamed doc that HEAD's history lacks: then every branch's.
  const cwd = dirname(file), log = (...from) => gitLines(cwd, 'log', ...from, '--follow', '--format=%H', '--name-only', '--', basename(file)).filter(Boolean);
  const head = log(), lines = head.length ? head : log('--all');
  for (let k = 0; k + 1 < lines.length; k += 2) {
    const text = execFileSync('git', ['show', `${lines[k]}:${lines[k + 1]}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); // untrimmed: the hash covers the last newline
    const doc = parseDoc(text);
    if (FORMS.some((f) => hashDoc(doc, f) === hash)) return text;
  }
  return null;
}
// A doc approved before link targets were left out, changed since in link targets only: still approved, as nothing it says changed.
const linksOnly = (file, doc) => { const before = doc.fm?.verified_hash && approvedText(file, doc.fm.verified_hash); return Boolean(before) && hashDoc(parseDoc(before)) === hashDoc(doc); };

// A generated doc's digest: its body's, so a hand edit shows (docs/design/bundle.md).
export const digestOf = (body) => createHash('sha256').update(body).digest('hex').slice(0, config.text.digest);

// Bundle v2: each type's required keys and allowed values, its folder in a v2 project, and generated docs left to the CLI.
function checkSchema(root, file, doc, type, add, v2) {
  const B = OKF.bundle, schema = B.schemas[type] ?? {};
  for (const key of schema.required ?? []) if (!truthy(doc.fm[key])) add(file, 1, 'DOC-SCHEMA', 'docSchemaKey', { type, key });
  for (const [key, from] of Object.entries(schema.enums ?? {})) {
    const values = config.vocabulary[from] ?? dataAt(config, from), value = doc.fm[key]; // a vocabulary list, or a path in the data
    if (truthy(value) && !values.includes(String(value))) add(file, 1, 'DOC-SCHEMA', 'docSchemaEnum', { type, key, value: String(value), values: values.join(', ') });
  }
  // A draft keeps the sections its standard requires; an approved doc is never edited (docs/design/standards.md).
  const sections = [...list(schema.sections), ...Object.entries(schema.sectionsWhen ?? {}).flatMap(([key, more]) => (doc.fm[key] === true ? more : []))];
  // A draft's values in its standard's form, such as a decision's MADR status.
  for (const [key, p] of doc.fm.verified_hash || !v2 ? [] : Object.entries(schema.patterns ?? {})) {
    if (truthy(doc.fm[key]) && !new RegExp(p.pattern).test(String(doc.fm[key]))) add(file, 1, 'DOC-SCHEMA', 'docSchemaPattern', { type, key, value: String(doc.fm[key]), says: p.says, standard: schema.standard });
  }
  // A superseded decision is history: never edited into a newer form.
  const history = String(doc.fm.status ?? '').startsWith(config.inception.superseded);
  for (const section of doc.fm.verified_hash || !v2 || history ? [] : sections) {
    if (!doc.lines.some((l) => new RegExp(`^#{1,6}\\s+${section}\\s*$`, 'i').test(l))) add(file, 1, 'DOC-SCHEMA', 'docSchemaSection', { type, section, standard: schema.standard });
  }
  const folder = B.folders[type], at = relative(root, dirname(file)).split(sep)[0] || '.';
  if (v2 && folder && at !== folder) add(file, 1, 'DOC-SCHEMA', 'docFolder', { type, folder, at: `${at}/` });
  if (!B.generated.includes(type)) return;
  const gen = isMap(doc.fm.generated) ? doc.fm.generated : {}, by = String(gen.by ?? '');
  if (!by.startsWith(B.producer)) add(file, 1, 'DOC-GENERATED', 'docGeneratedBy', { type, by: by || '-' });
  else if (gen.digest && String(gen.digest) !== digestOf(doc.lines.slice(doc.body).join('\n'))) add(file, 1, 'DOC-GENERATED', 'docGeneratedHand', { type });
}

function checkConcept(file, text, doc, add, caps, root, v2) {
  if (doc.error) return add(file, doc.line, 'OKF-FM', doc.error, { error: doc.detail ?? '' });
  if (!doc.fm) return add(file, 1, 'OKF-FM', 'fmMissing');
  const fm = doc.fm;
  if (!truthy(fm.type)) add(file, 1, 'OKF-TYPE', 'typeMissing');
  const type = truthy(fm.type) ? pyStr(fm.type) : '';
  if (type === OKF.attested.type && !truthy(fm[OKF.attested.field])) add(file, 1, 'OKF-RUNTIME', 'runtimeMissing', OKF.attested);
  const missing = OKF.descFields.filter((k) => !truthy(fm[k]));
  if (missing.length) add(file, 1, 'HOUSE-DESC', 'descMissing', { fields: missing.join(', ') });
  if (!truthy(fm.generated)) add(file, 1, 'HOUSE-GENERATED', 'generatedMissing');
  const cap = sizeCap(type, caps);
  const size = [...text].length;
  if (size > cap) add(file, 1, 'HOUSE-SIZE', 'sizeOver', { size, cap, type: type || OKF.otherType });
  if (type) checkSchema(root, file, doc, type, add, v2);
  // A file named by an id carries the slug of its title after it, the id dropped from the title (DOC-SLUG).
  const named = basename(file).match(OKF.bundle.idFile), title = String(fm.title ?? '').replace(new RegExp(`^${named?.[1]}\\s+`), '');
  if (named && title && named[2] !== docSlug(title)) add(file, 1, 'DOC-SLUG', 'docSlug', { file: basename(file), expected: `${named[1]}-${docSlug(title)}${config.okf.ext}` }, v2 ? 'error' : 'warning');
}

// Findings for `profile.docs.rules`, reported against the project profile.
function lintRules(rules = {}, file = PROFILE) {
  const out = [];
  for (const [code, level] of Object.entries(rules)) {
    const key = !OKF.codes[code] ? 'ruleUnknown' : !OKF.codes[code].house ? 'ruleFixed' : !OKF.levels.includes(level) ? 'ruleLevel' : null;
    if (key) out.push(finding('PROFILE-RULE', 'error', file, 1, key, { code }));
  }
  return out;
}

// The decision a doc's `supersedes` names, as its zero-padded id, or null; read from the raw line, since YAML 1.1
// reads an unquoted 0022 as the octal 18 (docs/design/inception.md).
export function supersededId(doc) {
  const key = config.fields.supersedes, at = (doc?.lines ?? []).slice(1, Math.max(1, (doc?.body ?? 1) - 1)).map((l) => l.match(new RegExp(`^${key}:\\s*(.*?)\\s*(?:#.*)?$`))).find(Boolean);
  return at && at[1] ? at[1].replace(/^(["'])(.*)\1$/, '$2').padStart(config.ids.decisionDigits, '0') : null;
}

// A naming rule's problem, or null (docs/design/naming.md); the gate skips a rule with one.
export function nameProblem(r) {
  if (!isMap(r) || !r.id || !list(r.files).length || !r.pattern) return 'namesShape';
  try { new RegExp(r.find ?? ''); new RegExp(r.pattern); } catch { return 'namesRegex'; }
  return null;
}
// The rules that name paths: the project's sound ones and the registry's generated ones (docs/design/naming.md).
export const nameRules = (profile, bundle, root) => [...[profile.names ?? []].flat().filter((r) => !nameProblem(r)), ...generatedRules(profile, bundle, root)];
// Each name a rule with `find` finds on the lines ({ file, line, text }) whose pattern it breaks; the gate's added lines, check's tracked ones.
export const misnamedLines = (rules, lines) => lines.flatMap(({ file, line, text }) => rules.filter((r) => r.find && list(r.files).some((g) => inGlob('/' + file, g))).flatMap((r) => [...text.matchAll(new RegExp(r.find, 'g'))].map((m) => m[1] ?? m[0]).filter((name) => !new RegExp(`^(?:${r.pattern})$`).test(name)).map((name) => ({ path: file, line, rule: r.id, name, pattern: r.pattern, why: r.why ?? '-' }))));
// Each path a rule without `find` covers whose pattern it breaks, as { path, rule }; a `fresh` rule judges only what `fresh` says the path adds.
export const misnamedPaths = (rules, paths, fresh = (p) => p) => paths.flatMap((path) => rules.filter((r) => !r.find && list(r.files).some((g) => inGlob('/' + path, g)) && !new RegExp(`^(?:${r.pattern})$`).test(r.fresh ? fresh(path) : path)).map((rule) => ({ path, rule })));
const lintStages = (checks, file = PROFILE) => [checks ?? []].flat().filter(isMap)
  .map((s) => [s, stageProblem(s)]).filter(([, key]) => key).map(([s, key]) => finding('PROFILE-STAGE', 'error', file, 1, key, { id: s.id ?? '-', after: s.after ?? '-' }));
const lintNames = (names, file = PROFILE) => [names ?? []].flat()
  .map((r) => [r, nameProblem(r)]).filter(([, key]) => key).map(([r, key]) => finding('PROFILE-NAMES', 'error', file, 1, key, { id: r?.id ?? '-' }));

// PROFILE-KEY: a top-level or `security` key in a project layer that the plugin reads nowhere (docs/design/profile.md).
function lintKeys(sources) {
  const K = config.okf.profileKeys;
  return sources.flatMap(({ path, data }) => [
    ...Object.keys(data).filter((k) => !K.top.includes(k)),
    ...(isMap(data.security) ? Object.keys(data.security).filter((k) => !K.security.includes(k)).map((k) => `security.${k}`) : []),
  ].map((key) => finding('PROFILE-KEY', 'warning', path, 1, 'profileKey', { key })));
}

const finding = (code, level, path, line, key, data) => codeFinding(OKF.codes, code, path, line, key, data, level);

// Validates a bundle; returns findings with paths relative to `base`. `rules` maps house codes to levels.
export function checkBundle(root, { rules = {}, caps, base = process.cwd(), v2 = false, strict = false } = {}) {
  root = resolve(root);
  const findings = [];
  // `as`: a level a v1 bundle softens to; `strict`, on the base (check --ci, the gate): a stale index or a broken link is an error unless the profile says otherwise.
  const add = (file, line, code, key, data, as) => {
    const level = (OKF.codes[code].house && OKF.levels.includes(rules[code]) ? rules[code] : null) ?? as ?? (strict && OKF.bundle.baseErrors.includes(code) ? 'error' : OKF.codes[code].level);
    if (level !== 'off') findings.push(finding(code, level, relPath(base, file), line, key, data));
  };
  for (const file of walk(root).filter((f) => f.endsWith(OKF.ext))) {
    const name = basename(file), text = read(file), doc = parseDoc(text);
    if (name === OKF.index) checkIndex(file, doc, dirname(file) === root, add);
    else if (name === OKF.log) checkLog(file, doc, add);
    else checkConcept(file, text, doc, add, caps, root, v2);
    if (!doc.error) checkLinks(root, file, doc.lines, doc.body, add);
  }
  for (const [dir, text] of buildIndexes(root)) {
    const file = join(dir, OKF.index);
    if (!existsSync(file) || read(file) !== text) add(file, 1, 'HOUSE-INDEX-STALE', 'indexStale');
    // A subfolder of several docs takes no description from them: its line is written once and then kept.
    // (A doc's own missing description is HOUSE-DESC on the doc.)
    text.split('\n').forEach((line, k) => { const [, title, link, described] = line.match(ENTRY) ?? []; if (link?.endsWith(`/${OKF.index}`) && !described) add(file, k + 1, 'HOUSE-INDEX-DESC', 'indexDesc', { entry: title }); });
  }
  return findings;
}

// ---- Commands ----

const inside = (dir, file) => file === dir || file.startsWith(dir + sep);

export const commands = {
  index(args, { cwd }) {
    const root = args[0] ? resolve(cwd, args[0]) : bundleOf(cwd, loadProfile(cwd).profile);
    if (!existsSync(root)) throw new UsageError(msg('noSuchPath', { name: relPath(cwd, root) }));
    const written = writeIndexes(root).map((f) => relPath(cwd, f));
    return done(written.map((f) => f + '\n').join(''));
  },

  check(args, { cwd }) {
    const known = config.commands.find((c) => c.name === 'check').flags;
    for (const flag of args.filter((a) => a.startsWith('--') && !known.includes(a))) throw new UsageError(msg('unknownFlag', { name: flag }));
    const { profile, sources } = loadProfile(cwd);
    const rules = profile.docs?.rules ?? {};
    const bundle = bundleOf(cwd, profile);
    const findings = [...lintRules(rules), ...lintNames(profile.names), ...lintStages(profile.checks), ...lintKeys(sources)];
    // A codebase in modules grows names from the first unit: without a rule nothing holds them (docs/design/naming.md).
    // Domains own their data: critical, so an error once the project is past adoption (docs/design/architecture-model.md).
    const arch = profile.architecture ?? {}, mods = profile.modules ?? [], at = PROFILE;
    if (mods.length && !arch.data) findings.push(finding('PROFILE-ARCH', profile.adopted ? 'warning' : 'error', at, 1, 'archNoData', {}));
    if (mods.length && !arch.acyclic) findings.push(finding('PROFILE-ARCH', 'warning', at, 1, 'archNoAcyclic', {}));
    const open = mods.filter((m) => !m.api).map((m) => m.id ?? m.name);
    if (open.length) findings.push(finding('PROFILE-ARCH', 'warning', at, 1, 'archNoApi', { modules: open.join(', ') }));
    // Every module has a kind: an error on a v2 profile (it has system), a warning on a v1 one until it migrates (docs/design/architecture-model.md).
    for (const [key, data] of kindProblems(profile)) findings.push(finding('PROFILE-KIND', profile.system ? 'error' : 'warning', at, 1, key, data));
    for (const [key, data, level] of [...namingProblems(profile), ...moduleProblems(profile, bundle)]) findings.push(finding('PROFILE-NAMING', level ?? 'error', at, 1, key, data)); // the registry names everything (docs/design/naming.md)
    if (profile.system && !profile.naming?.tokens?.system) findings.push(finding('PROFILE-NAMING', 'error', at, 1, 'namingV2', {}));
    // The extensions' checks: the published API and events speak the grammar, a project's graph sees what its pack sees.
    for (const f of seam('docChecks', profile).flatMap((check) => check(cwd, profile))) findings.push(finding(f.code, 'error', f.path ?? at, 1, f.key, f.data));
    if (mods.length && !profile.naming && ![profile.names ?? []].flat().length) findings.push(finding('PROFILE-NAMING', 'warning', at, 1, 'namesNone', {}));
    // --tree: the gate's names (path rules on every tracked path, find rules on its lines) and the extensions' whole-tree
    // checks, so a name left from before a rule is reported, not only one a bolt adds (docs/design/naming.md#checks).
    if (args.includes('--tree')) {
      const gate = (code, path, line, key, data) => codeFinding(config.gate.codes, code, path, line, key, data, 'error'); // the gate's codes
      const names = nameRules(profile, bundle, cwd), tracked = gitLines(cwd, 'ls-files'), found = (p) => names.some((r) => r.find && list(r.files).some((g) => inGlob('/' + p, g))) && existsSync(join(cwd, p));
      for (const { path, rule: r } of misnamedPaths(names, tracked)) findings.push(gate('GATE-NAME', path, 1, 'gateNamePath', { path, rule: r.id, pattern: r.pattern, why: r.why ?? '-' }));
      for (const f of misnamedLines(names, tracked.filter(found).flatMap((file) => readFileSync(join(cwd, file), 'utf8').split('\n').map((text, k) => ({ file, line: k + 1, text }))))) findings.push(gate('GATE-NAME', f.path, f.line, 'gateName', f));
      for (const f of seam('treeChecks', profile).flatMap((check) => check(cwd, profile))) findings.push(gate(f.code, f.path ?? at, f.line ?? 1, f.key, f.data));
    }
    const given = args.filter((a) => !a.startsWith('--'));
    const paths = given.length ? given.map((a) => resolve(cwd, a)) : [bundle];
    const opts = { rules, caps: profile.docs?.caps, base: cwd, v2: Boolean(profile.system), strict: args.includes('--ci') };
    for (const p of paths) {
      if (!existsSync(p)) throw new UsageError(msg('noSuchPath', { name: relPath(cwd, p) }));
      // A folder or file inside the bundle is checked within the bundle, so bundle-root links resolve from the root.
      if (statSync(p).isDirectory() && (p === bundle || !inside(bundle, p))) findings.push(...checkBundle(p, opts));
      else if (inside(bundle, p)) findings.push(...checkBundle(bundle, opts).filter((f) => inside(p, resolve(cwd, f.path))));
    }
    return done('', findings.some((f) => f.level === 'error') ? config.exit.findings : config.exit.ok, findings);
  },
};
