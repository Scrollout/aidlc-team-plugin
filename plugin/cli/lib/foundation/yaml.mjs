// A YAML subset: block and flow collections, plain, quoted and block scalars, comments (docs/design/okf-validation.md).
import { msg } from './text.mjs';

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

