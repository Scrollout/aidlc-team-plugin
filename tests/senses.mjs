// The words agents and readers could misread, each kept to one sense by a word before it naming the sense, or a code
// span (docs/design/canonical-model.md). `node tests/senses.mjs [file…]` lists each bare use in the files, or in every
// tracked text file the rule covers.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(import.meta.dirname, '..');
const { config } = await import(pathToFileURL(join(ROOT, 'plugin/cli/lib/index.mjs')).href);

// Prose only: front matter, headings, code, placeholders, link targets, a word named in italics, a bold defined term,
// the Events line and commands are syntax.
const blank = (m) => m.replace(/[^\n]/g, ''); // keeps the line numbers
const prose = (raw) => raw.replace(/^---\n[\s\S]*?\n---\n/, blank).replace(/^#+ .*$/gm, '').replace(/^\s*- Events:.*$/gm, '').replace(/```[\s\S]*?```/g, blank)
  .replace(/`[^`\n]*`/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/<[^>\n]*>/g, '').replace(/\]\([^)]*\)/g, ']').replace(/(?<![*\w])\*(?!\*)[^*\n]+\*(?![*\w])/g, '').replace(/\*\*[^*\n]+:\*\*/g, '').replace(/\baidlc [a-z]+/g, '');

const norm = (w) => w.replace(/[^\w']/g, '').toLowerCase();
// Each bare use in `text`, as { word, line, found }.
export function bareUses(text) {
  const { about, proper = [], ...senses } = config.vocabulary.senses, out = [];
  const word = new RegExp(`(?:(\\S+)\\s+)?(?<![.\\w-])(${Object.keys(senses).join('|')})s?\\b(?!\\.\\w|[\\w-])`, 'gi');
  prose(text).split('\n').forEach((l, k) => {
    for (const m of l.matchAll(word)) {
      if (!proper.includes(m[2]) && !senses[m[2].toLowerCase()].some((q) => norm(m[1] ?? '') === norm(q))) out.push({ word: m[2].toLowerCase(), line: k + 1, found: m[0].trim() });
    }
  });
  return out;
}

// The tracked text the rule covers: the docs, README and AGENTS.md, and what ships, but generated logs and indexes.
export const covered = () => execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
  .filter((f) => /^(docs\/|plugin\/(templates|agents|personas|skills)\/|README\.md$|AGENTS\.md$)/.test(f) && f.endsWith('.md') && !/(^|\/)index\.md$|^docs\/log\.md$/.test(f));

// The CLI's own text: messages and each check's fix.
export const cliTexts = () => [...Object.entries(config.messages).map(([k, v]) => [`messages.${k}`, v]),
  ...Object.entries(config).flatMap(([t, sec]) => Object.entries(sec?.codes ?? {}).map(([c, x]) => [`${t}.codes.${c}`, x.fix ?? '']))];

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : covered();
  const found = [...files.flatMap((f) => bareUses(readFileSync(join(ROOT, f), 'utf8')).map((u) => `${f}:${u.line} ${u.found}`)),
    ...(process.argv.slice(2).length ? [] : cliTexts().flatMap(([where, t]) => bareUses(t).map((u) => `${where} ${u.found}`)))];
  console.log(found.join('\n'));
  console.error(`${found.length} bare uses`);
  process.exitCode = found.length ? 1 : 0;
}
