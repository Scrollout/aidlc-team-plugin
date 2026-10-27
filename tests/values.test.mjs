// M26: values are data (principle 11, docs/design/values.md). A literal in the CLI's code is a key into the data, a
// message key, a check code, syntax, or listed tool protocol; anything else is a value that belongs in data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { config } from '../plugin/cli/lib/index.mjs';

const ROOT = join(import.meta.dirname, '..');
const PROTOCOL = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/protocol.json'), 'utf8'));
const allowed = new Set(Object.values(PROTOCOL).filter(Array.isArray).flat());
// Every key at any depth of the merged data, and every message key and check code.
const keys = new Set();
const walk = (v) => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); } };
walk(config);
// The profile's keys and the docs' front matter keys the data declares are keys too.
const fields = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : v && typeof v === 'object' ? Object.values(v).flatMap(fields) : []);
// The variables the data's templates name, {{part}}, are keys too.
const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
for (const s of strings(config)) for (const m of s.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) keys.add(m[1]);
for (const k of [...fields(config.okf.profileKeys), ...fields(config.okf.bundle.schemas), ...config.state.hashExclude, ...config.state.stampFields]) keys.add(k);

// The string, template and regex literals and the bare numbers of a module, with their lines: a scanner that follows
// nested templates, so `${a ? `x` : 'y'}` yields its parts. Imports, the shebang and comments hold no values.
export function literals(source) {
  const text = source.split('\n').map((l) => (/^\s*(#!|import |export \{[^}]*\} from)/.test(l) ? '' : l)).join('\n');
  const out = [];
  let i = 0, line = 1, prev = '';
  const regexMay = () => !prev || /[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /\b(return|typeof|case|in|of|void)$/.test(prev);
  const quoted = (end) => { let s = ''; i++; while (i < text.length && text[i] !== end) { if (text[i] === '\\') { s += text[i] + text[i + 1]; i += 2; } else s += text[i++]; } i++; return s; };
  function template() {
    const at = line;
    let s = '';
    i++;
    while (i < text.length && text[i] !== '`') {
      if (text[i] === '\\') { s += text[i] + text[i + 1]; i += 2; continue; }
      if (text[i] === '$' && text[i + 1] === '{') { out.push([at, s]); s = ''; i += 2; code(true); continue; }
      if (text[i] === '\n') line++;
      s += text[i++];
    }
    i++;
    out.push([at, s]);
  }
  function code(inside) {
    let depth = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
      if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { if (text[i] === '\n') line++; i++; } i += 2; continue; }
      if (c === "'" || c === '"') { const at = line; out.push([at, quoted(c)]); prev = 'x'; continue; }
      if (c === '`') { template(); prev = 'x'; continue; }
      if (c === '/' && regexMay()) {
        const at = line;
        let s = '', cls = false;
        i++;
        while (i < text.length && (cls || text[i] !== '/') && text[i] !== '\n') { if (text[i] === '\\') { s += text[i] + text[i + 1]; i += 2; continue; } if (text[i] === '[') cls = true; if (text[i] === ']') cls = false; s += text[i++]; }
        i++;
        while (/[dgimsuy]/.test(text[i] ?? '')) i++;
        out.push([at, `/${s}/`]);
        prev = 'x';
        continue;
      }
      if (/[0-9]/.test(c) && /[\w$)\]] ?\[$/.test(prev) && /^\d+\]/.test(text.slice(i))) { i += text.slice(i).match(/^\d+/)[0].length; continue; } // an index, m[3]
      if (/[0-9]/.test(c) && !/[\w$.]$/.test(prev)) { const m = text.slice(i).match(/^\d+(?:\.\d+)?/)[0]; out.push([line, Number(m) * (prev.endsWith('-') && /[(,=:[?&|!]-$/.test(prev) ? -1 : 1)]); i += m.length; prev = 'x'; continue; }
      if (inside) { if (c === '{') depth++; if (c === '}') { if (depth === 0) { i++; prev = 'x'; return; } depth--; } }
      const w = text.slice(i).match(/^[\w$]+/);
      if (w) { prev = (prev + ' ' + w[0]).slice(-40); i += w[0].length; continue; }
      prev = (prev + c).slice(-40);
      i++;
    }
  }
  code(false);
  return out;
}
const syntax = (s) => /^[\s\p{P}\p{S}\d]*$/u.test(s.replace(/\\+[nrtsSdDwWbB]/g, ''));
// Text whose every word is a data key or protocol word, `status: ` or /\nverified:\n/, is grammar around keys.
const keyWords = (s) => { const words = s.replace(/\\[nrtsSdDwWbB]/g, ' ').match(/[A-Za-z_][\w-]*/g) ?? []; return words.length > 0 && words.every((w) => keys.has(w) || allowed.has(w)); };
export const isValue = (s) => (typeof s === 'number' ? !PROTOCOL.numbers.includes(s) : s.trim() !== '' && !syntax(s) && !keys.has(s.trim()) && !allowed.has(s.trim()) && !keyWords(s));

const files = (dir) => readdirSync(join(ROOT, dir), { recursive: true }).filter((f) => f.endsWith('.mjs')).map((f) => `${dir}/${f.split(sep).join('/')}`);
const offenders = (list) => list.filter((f) => !(f in PROTOCOL.files)).flatMap((f) => literals(readFileSync(join(ROOT, f), 'utf8')).filter(([, s]) => isValue(s)).map(([n, s]) => `${f}:${n} ${s}`));

test('B235/AC-1 the core holds no value: every literal of aidlc.mjs and lib/ is a key, syntax or listed protocol', () => {
  assert.deepEqual(offenders(['plugin/cli/aidlc.mjs', ...files('plugin/cli/lib')]), []);
});
