// OKF v0.2 validator and index generator (docs/design/okf.md). Settings, codes and messages come from cli.json.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { config, UsageError } from './config.mjs';
import { msg } from './template.mjs';
import { loadProfile } from './profile.mjs';

const OKF = config.okf;

// ---- YAML subset (block and flow collections, plain/quoted/block scalars, comments) ----

export class YamlError extends Error {}
const yerr = (key, data) => Object.assign(new YamlError(msg(key, data)), { line: data.line });

// YAML 1.1 core resolution as PyYAML's SafeLoader, minus timestamps (kept as text, like the reference loader).
const NULLS = new Set(['', '~', 'null', 'Null', 'NULL']);
const TRUES = new Set(['true', 'True', 'TRUE', 'yes', 'Yes', 'YES', 'on', 'On', 'ON']);
const FALSES = new Set(['false', 'False', 'FALSE', 'no', 'No', 'NO', 'off', 'Off', 'OFF']);
const INT = /^([-+]?)(0b[01_]+|0x[0-9a-fA-F_]+|0[0-7_]+|0|[1-9][0-9_]*)$/;
const RADIX = { '0b': 2, '0x': 16 };
const FLOAT = /^[-+]?([0-9][0-9_]*)?\.[0-9_]*([eE][-+][0-9]+)?$/;
const RESERVED = /^([@`%&*!|>]|[-?:](\s|$))/;
const ESCAPES = { 0: '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0', L: ' ', P: ' ' };
const HEX = { x: 2, u: 4, U: 8 };

function resolvePlain(s, line) {
  if (RESERVED.test(s)) throw yerr('yamlUnsupported', { line, char: s[0] });
  if (/:(\s|$)/.test(s)) throw yerr('yamlColon', { line });
  if (NULLS.has(s)) return null;
  if (TRUES.has(s)) return true;
  if (FALSES.has(s)) return false;
  const int = s.match(INT);
  if (int) {
    const body = int[2].replace(/_/g, '');
    const radix = RADIX[body.slice(0, 2)] ?? (body.length > 1 && body[0] === '0' ? 8 : 10);
    return (int[1] === '-' ? -1 : 1) * parseInt(radix === 8 || radix === 10 ? body : body.slice(2), radix);
  }
  if (FLOAT.test(s) && /\d/.test(s)) return Number(s.replace(/_/g, ''));
  return s;
}

// Reads a quoted scalar starting at s[i]; returns { value, end } or null when it is not terminated.
function readQuoted(s, i, line) {
  const q = s[i];
  let out = '';
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (q === "'" && c === "'") {
      if (s[j + 1] === "'") { out += "'"; j++; continue; }
      return { value: out, end: j + 1 };
    }
    if (q === '"' && c === '"') return { value: out, end: j + 1 };
    if (q === '"' && c === '\\') {
      const e = s[++j];
      if (e in HEX) {
        const hex = s.slice(j + 1, j + 1 + HEX[e]);
        if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== HEX[e]) throw yerr('yamlEscape', { line, char: e });
        out += String.fromCodePoint(parseInt(hex, 16));
        j += HEX[e];
      } else if (e in ESCAPES) out += ESCAPES[e];
      else throw yerr('yamlEscape', { line, char: e ?? '' });
      continue;
    }
    out += c;
  }
  return null;
}

const skipWs = (s, i) => { while (s[i] === ' ' || s[i] === '\t') i++; return i; };

function flowItem(s, i, line) {
  if (s[i] === '[' || s[i] === '{') return flow(s, i, line);
  if (s[i] === '"' || s[i] === "'") {
    const q = readQuoted(s, i, line);
    if (!q) throw yerr('yamlQuote', { line });
    return q;
  }
  let j = i;
  while (j < s.length && !',[]{}'.includes(s[j]) && !(s[j] === ':' && /[\s,[\]{}]|^$/.test(s[j + 1] ?? '')) && !(s[j] === '#' && /\s/.test(s[j - 1]))) j++;
  return { value: resolvePlain(s.slice(i, j).trim(), line), end: j };
}

function flow(s, i, line) {
  const isMap = s[i] === '{';
  const close = isMap ? '}' : ']';
  const out = isMap ? {} : [];
  for (i = skipWs(s, i + 1); ; i = skipWs(s, i + 1)) {
    if (s[i] === close && (isMap ? !Object.keys(out).length : !out.length)) return { value: out, end: i + 1 };
    if (i >= s.length) throw yerr('yamlFlow', { line });
    const item = flowItem(s, i, line);
    i = skipWs(s, item.end);
    if (s[i] === ':') {
      if (!isMap) throw yerr('yamlUnsupported', { line, char: ':' });
      i = skipWs(s, i + 1);
      let value = null;
      if (s[i] !== ',' && s[i] !== close) {
        const v = flowItem(s, i, line);
        value = v.value;
        i = skipWs(s, v.end);
      }
      out[String(item.value)] = value;
    } else if (isMap) out[String(item.value)] = null;
    else out.push(item.value);
    if (s[i] === close) return { value: out, end: i + 1 };
    if (s[i] !== ',') throw yerr('yamlFlow', { line });
  }
}

const significant = (l) => l.text !== '' && !l.text.startsWith('#');
const isSeqItem = (t) => t === '-' || t.startsWith('- ');

// Splits `key: rest` at the first colon followed by a space or the end; null when the line is not a pair.
function splitKey(text, line) {
  if (text[0] === '"' || text[0] === "'") {
    const q = readQuoted(text, 0, line);
    const m = q && text.slice(q.end).match(/^\s*:(\s+|$)/);
    return m ? { key: q.value, rest: text.slice(q.end + m[0].length) } : null;
  }
  if (/^[[{#]/.test(text) || RESERVED.test(text)) return null;
  for (let i = text.indexOf(':'); i > 0; i = text.indexOf(':', i + 1)) {
    if (/\s#/.test(text.slice(0, i))) return null;
    if (i + 1 === text.length || /\s/.test(text[i + 1])) return { key: String(resolvePlain(text.slice(0, i).trim(), line)), rest: text.slice(i + 1).trim() };
  }
  return null;
}

class YamlParser {
  constructor(text, first) {
    this.i = 0;
    this.lines = text.split('\n').map((raw, k) => {
      const ind = raw.match(/^ */)[0].length;
      const text = raw.slice(ind).replace(/\s+$/, '');
      if (text && /^\t/.test(text) ) throw yerr('yamlTab', { line: first + k });
      return { n: first + k, ind, text, raw };
    });
  }

  peek() {
    while (this.i < this.lines.length && !significant(this.lines[this.i])) this.i++;
    return this.lines[this.i];
  }

  node(parentInd) {
    const l = this.peek();
    return l && l.ind > parentInd ? this.nodeAt(l, parentInd) : null;
  }

  nodeAt(l, parentInd) {
    if (isSeqItem(l.text)) return this.seq(l.ind);
    if (splitKey(l.text, l.n)) return this.map(l.ind);
    this.i++;
    return this.inline(l.text, l, parentInd);
  }

  seq(ind) {
    const out = [];
    for (let l = this.peek(); l && l.ind === ind && isSeqItem(l.text); l = this.peek()) {
      const rest = l.text.slice(1).replace(/^ +/, '');
      if (!rest || rest.startsWith('#')) {
        this.i++;
        out.push(this.node(ind));
        continue;
      }
      // `- key: v` and `- - x` open a nested node at the column after the dash.
      this.lines[this.i] = { ...l, ind: ind + l.text.length - rest.length, text: rest };
      out.push(this.nodeAt(this.lines[this.i], ind));
    }
    return this.end(out, ind);
  }

  map(ind) {
    const out = {};
    for (let l = this.peek(); l && l.ind === ind && !isSeqItem(l.text); l = this.peek()) {
      const kv = splitKey(l.text, l.n);
      if (!kv) throw yerr('yamlKey', { line: l.n });
      this.i++;
      out[kv.key] = this.value(kv.rest, l, ind);
    }
    return this.end(out, ind);
  }

  end(value, ind) {
    const l = this.peek();
    if (l && l.ind > ind) throw yerr('yamlIndent', { line: l.n });
    return value;
  }

  value(rest, l, ind) {
    if (!rest || rest.startsWith('#')) {
      const next = this.peek();
      return next && next.ind === ind && isSeqItem(next.text) ? this.seq(ind) : this.node(ind);
    }
    if (/^[|>]/.test(rest)) return this.block(rest, l, ind);
    return this.inline(rest, l, ind);
  }

  // A scalar or flow collection, possibly continued on more-indented lines.
  inline(first, l, ind) {
    const parts = [first];
    let j = this.i;
    for (let blanks = 0; j < this.lines.length; j++) {
      const c = this.lines[j];
      if (!c.text) { blanks++; continue; }
      if (c.ind <= ind || c.text.startsWith('#')) { j -= blanks; break; }
      for (; blanks; blanks--) parts.push('');
      parts.push(c.text);
    }
    this.i = Math.min(j, this.lines.length);
    let folded = parts[0];
    for (let k = 1; k < parts.length; k++) folded += parts[k] === '' ? '\n' : (parts[k - 1] === '' ? '' : ' ') + parts[k];
    let v;
    if ('"\'[{'.includes(first[0])) {
      v = first[0] === '"' || first[0] === "'" ? readQuoted(folded, 0, l.n) : flow(folded, 0, l.n);
      if (!v) throw yerr('yamlQuote', { line: l.n });
      const tail = folded.slice(v.end).trim();
      if (tail && !tail.startsWith('#')) throw yerr('yamlTrailing', { line: l.n });
      return v.value;
    }
    return resolvePlain(folded.split('\n').map((p) => p.replace(/\s+#.*$/, '')).join('\n').trim(), l.n);
  }

  // `|` literal and `>` folded scalars with clip, strip (-) and keep (+) chomping.
  block(header, l, ind) {
    const m = header.match(/^([|>])([+-]?)([1-9]?)([+-]?)\s*(#.*)?$/);
    if (!m) throw yerr('yamlBlock', { line: l.n });
    const chomp = m[2] || m[4];
    let j = this.i;
    while (j < this.lines.length && (!this.lines[j].text || this.lines[j].ind > ind)) j++;
    const raw = this.lines.slice(this.i, j);
    this.i = j;
    const firstText = raw.find((r) => r.text);
    const contentInd = m[3] ? ind + Number(m[3]) : firstText?.ind ?? ind + 1;
    const ls = raw.map((r) => (r.text ? r.raw.slice(contentInd) : ''));
    let trailing = 0;
    while (ls.length && ls[ls.length - 1] === '') { ls.pop(); trailing++; }
    let text = ls[0] ?? '';
    for (let k = 1; k < ls.length; k++) {
      const [prev, cur] = [ls[k - 1], ls[k]];
      if (m[1] === '|' || cur.startsWith(' ') || prev.startsWith(' ')) text += '\n' + cur;
      else if (!cur) text += '\n';
      else text += (prev ? ' ' : '') + cur;
    }
    if (chomp === '-' || !ls.length) return chomp === '+' ? '\n'.repeat(trailing) : text;
    return text + '\n' + (chomp === '+' ? '\n'.repeat(trailing) : '');
  }
}

// Parses YAML text whose first line is line `first` of its file.
export function parseYaml(text, first = 1) {
  const p = new YamlParser(text, first);
  const l = p.peek();
  if (!l) return null;
  if (l.text.startsWith('%') || l.text === '---') throw yerr('yamlUnsupported', { line: l.n, char: l.text[0] });
  const value = p.nodeAt(l, -1);
  const rest = p.peek();
  if (rest) throw yerr('yamlIndent', { line: rest.n });
  return value;
}

// ---- Documents ----

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
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

function existingSubdirLines(indexFile) {
  const out = new Map();
  if (!existsSync(indexFile)) return out;
  for (const line of read(indexFile).split('\n')) {
    const m = line.match(/^\* \[[^\]]*\]\(([^)]+)\/index\.md\)(?: - (.*))?$/);
    if (m) out.set(m[1], m[2] ?? '');
  }
  return out;
}

function rootFrontmatter(indexFile) {
  if (!existsSync(indexFile)) return '';
  const doc = parseDoc(read(indexFile));
  return doc.fmLines && Object.keys(doc.fm).every((k) => OKF.rootIndexKeys.includes(k)) ? doc.fmLines.join('\n') + '\n\n' : '';
}

// Prose paragraphs of an existing index, keyed by the heading they sit under ('' before any heading).
function existingProse(indexFile) {
  const out = new Map();
  if (!existsSync(indexFile)) return out;
  const doc = parseDoc(read(indexFile));
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
  const groups = new Map();
  for (const e of entries) {
    const type = e.type || OKF.otherType;
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(e);
  }
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
          desc: truthy(fm.description) ? pyStr(fm.description) : '',
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
    // One entry: its description, as the reference. Otherwise keep the parent's existing line instead of an LLM.
    descs.set(dir, entries.length === 1 && entries[0].desc
      ? entries[0].desc
      : existingSubdirLines(join(dirname(dir), OKF.index)).get(relative(dirname(dir), dir)) ?? '');
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
const ENTRY = /^\* \[[^\]]+\]\([^)\s]+\)( - .*)?$/;
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

function checkIndex(file, isRoot, add) {
  const doc = parseDoc(read(file));
  if (doc.error || (doc.fm && (!isRoot || !Object.keys(doc.fm).every((k) => OKF.rootIndexKeys.includes(k))))) {
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

function checkLog(file, add) {
  const doc = parseDoc(read(file));
  if (doc.error) return add(file, doc.line, 'OKF-LOG', 'logFrontmatter');
  for (const [n, line] of proseLines(doc.lines, doc.body)) {
    if (!line.startsWith('## ')) continue;
    const m = line.match(DATE);
    if (!m || !validDate(m[1], m[2], m[3])) add(file, n, 'OKF-LOG', 'logHeading');
  }
}

function checkConcept(file, add) {
  const text = read(file);
  const doc = parseDoc(text);
  if (doc.error) return add(file, doc.line, 'OKF-FM', doc.error, { error: doc.detail ?? '' });
  if (!doc.fm) return add(file, 1, 'OKF-FM', 'fmMissing');
  const fm = doc.fm;
  if (!truthy(fm.type)) add(file, 1, 'OKF-TYPE', 'typeMissing');
  const type = truthy(fm.type) ? pyStr(fm.type) : '';
  if (type === OKF.attested.type && !truthy(fm[OKF.attested.field])) add(file, 1, 'OKF-RUNTIME', 'runtimeMissing', OKF.attested);
  const missing = ['title', 'description'].filter((k) => !truthy(fm[k]));
  if (missing.length) add(file, 1, 'HOUSE-DESC', 'descMissing', { fields: missing.join(', ') });
  if (!truthy(fm.generated)) add(file, 1, 'HOUSE-GENERATED', 'generatedMissing');
  const cap = OKF.sizeCaps[type] ?? OKF.sizeCapDefault;
  const size = [...text].length;
  if (size > cap) add(file, 1, 'HOUSE-SIZE', 'sizeOver', { size, cap, type: type || OKF.otherType });
  return doc;
}

// Findings for `profile.docs.rules`, reported against the project profile.
export function lintRules(rules = {}, file = config.layers.find((l) => l.from === 'project').path) {
  const out = [];
  for (const [code, level] of Object.entries(rules)) {
    const key = !OKF.codes[code] ? 'ruleUnknown' : !OKF.codes[code].house ? 'ruleFixed' : !OKF.levels.includes(level) ? 'ruleLevel' : null;
    if (key) out.push(finding('PROFILE-RULE', 'error', file, 1, key, { code }));
  }
  return out;
}

function finding(code, level, path, line, key, data = {}) {
  return { code, level, path, line, message: msg(key, data), fix: OKF.codes[code].fix };
}

// Validates a bundle; returns findings with paths relative to `base`. `rules` maps house codes to levels.
export function checkBundle(root, { rules = {}, base = process.cwd() } = {}) {
  root = resolve(root);
  const findings = [];
  const add = (file, line, code, key, data) => {
    const level = (OKF.codes[code].house && OKF.levels.includes(rules[code]) ? rules[code] : null) ?? OKF.codes[code].level;
    if (level !== 'off') findings.push(finding(code, level, relative(base, file), line, key, data));
  };
  for (const file of walk(root).filter((f) => f.endsWith(OKF.ext))) {
    const name = file.slice(dirname(file).length + 1);
    let doc;
    if (name === OKF.index) checkIndex(file, dirname(file) === root, add);
    else if (name === OKF.log) checkLog(file, add);
    else doc = checkConcept(file, add);
    const parsed = doc ?? parseDoc(read(file));
    if (!parsed.error) checkLinks(root, file, parsed.lines, parsed.body, add);
  }
  for (const [dir, text] of buildIndexes(root)) {
    const file = join(dir, OKF.index);
    if (!existsSync(file) || read(file) !== text) add(file, 1, 'HOUSE-INDEX-STALE', 'indexStale');
  }
  return findings;
}

// ---- Commands ----

const bundleOf = (cwd, profile) => resolve(cwd, profile.docs.bundle);
const hasErrors = (findings) => findings.some((f) => f.level === 'error');
const inside = (dir, file) => file === dir || file.startsWith(dir + sep);

export const commands = {
  index(args, { cwd }) {
    const root = args[0] ? resolve(cwd, args[0]) : bundleOf(cwd, loadProfile(cwd).profile);
    if (!existsSync(root)) throw new UsageError(msg('noSuchPath', { name: relative(cwd, root) }));
    const written = writeIndexes(root).map((f) => relative(cwd, f));
    return { code: config.exit.ok, findings: [], output: written.map((f) => f + '\n').join('') };
  },

  check(args, { cwd }) {
    const known = config.commands.find((c) => c.name === 'check').flags;
    for (const flag of args.filter((a) => a.startsWith('--'))) {
      if (!known.includes(flag)) throw new UsageError(msg('unknownFlag', { name: flag }));
      // `--ci` is OKF validation plus plan lint until the gate adds its merge-commit checks.
      if (flag !== '--ci') throw new Error(msg('flagNotBuilt', { name: flag }));
    }
    const { profile } = loadProfile(cwd);
    const rules = profile.docs?.rules ?? {};
    const bundle = bundleOf(cwd, profile);
    const findings = lintRules(rules);
    const given = args.filter((a) => !a.startsWith('--'));
    const paths = given.length ? given.map((a) => resolve(cwd, a)) : [bundle];
    for (const p of paths) {
      if (!existsSync(p)) throw new UsageError(msg('noSuchPath', { name: relative(cwd, p) }));
      if (statSync(p).isDirectory()) findings.push(...checkBundle(p, { rules, base: cwd }));
      else if (inside(bundle, p)) findings.push(...checkBundle(bundle, { rules, base: cwd }).filter((f) => f.path === relative(cwd, p)));
    }
    return { code: hasErrors(findings) ? config.exit.findings : config.exit.ok, findings, output: '' };
  },
};
