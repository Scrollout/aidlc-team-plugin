// The words agents and readers could misread, each kept to one sense by a phrase naming it, or a code span, from
// `vocabulary.senses` (docs/design/canonical-model.md). `node tests/senses.mjs [file…]` lists each bare use in the files, or in every
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

const escape = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// One entry per word of `vocabulary.senses`: the word's pattern and the phrases that name its sense, each `{w}` the word,
// singular or plural; `shipped` when it holds only in what the plugin ships and the CLI's own text.
const table = () => {
  const { about, proper = [], ...words } = config.vocabulary.senses;
  const pattern = (w) => `${w.split(' ').map(escape).join('\\s+')}s?`;
  return { proper, words: Object.entries(words).map(([w, e]) => ({
    word: new RegExp(`(?<![.\\w-])${pattern(w)}\\b(?!\\.\\w|[\\w-])`, 'gi'), shipped: !Array.isArray(e) && e.in === 'shipped',
    allow: (Array.isArray(e) ? e : e.allow ?? []).map((phrase) => new RegExp(phrase.split('{w}').map((x) => escape(x).replace(/ /g, '\\s+')).join(pattern(w)), 'gi')),
  })) };
};

// Each bare use in `text`, as { word, line, found }: a use no allowed phrase covers; `shipped` applies the words that
// hold only in what ships.
export function bareUses(text, { shipped = true } = {}) {
  const { proper, words } = table(), out = [];
  prose(text).split('\n').forEach((l, k) => {
    for (const w of words.filter((x) => shipped || !x.shipped)) {
      const covered = w.allow.flatMap((a) => [...l.matchAll(a)].map((m) => [m.index, m.index + m[0].length]));
      for (const m of l.matchAll(w.word)) {
        if (proper.includes(m[0]) || covered.some(([a, b]) => a <= m.index && m.index + m[0].length <= b)) continue;
        out.push({ word: m[0].toLowerCase(), line: k + 1, found: `${l.slice(0, m.index).match(/(\S+)\s*$/)?.[1] ?? ''} ${m[0]}`.trim() });
      }
    }
  });
  return out;
}

// The tracked text the rule covers: the docs, README and AGENTS.md, and what ships, but generated logs and indexes.
export const covered = () => execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
  .filter((f) => /^(docs\/|plugin\/(templates|agents|personas|skills)\/|README\.md$|AGENTS\.md$)/.test(f) && f.endsWith('.md') && !/(^|\/)index\.md$|^docs\/log\.md$/.test(f));

// The CLI's own text: messages, each check's fix and each command's usage and summary.
export const cliTexts = () => [...Object.entries(config.messages).map(([k, v]) => [`messages.${k}`, v]),
  ...Object.entries(config).flatMap(([t, sec]) => Object.entries(sec?.codes ?? {}).map(([c, x]) => [`${t}.codes.${c}`, x.fix ?? ''])),
  ...config.commands.flatMap((c) => [[`commands.${c.name}.usage`, `aidlc ${c.usage}`], [`commands.${c.name}.does`, c.does]])];

// Each bare use in the files, or in every covered file and the CLI's own text, as `<where> <found>`.
export const allBareUses = (files = null) => [...(files ?? covered()).flatMap((f) => bareUses(readFileSync(join(ROOT, f), 'utf8'), { shipped: f.startsWith('plugin/') }).map((u) => `${f}:${u.line} ${u.found}`)),
  ...(files ? [] : cliTexts().flatMap(([where, t]) => bareUses(t).map((u) => `${where} ${u.found}`)))];

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), found = allBareUses(args.length ? args : null);
  console.log(found.join('\n'));
  console.error(`${found.length} bare uses`);
  process.exitCode = found.length ? 1 : 0;
}
