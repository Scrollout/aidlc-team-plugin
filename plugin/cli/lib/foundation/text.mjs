// Template engine: `{{a.b}}` and `{{#each list}}…{{/each}}`, nothing more (docs/design/profile.md).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, packageFile } from './data.mjs';

export class TemplateError extends Error {}

const fail = (key, data) => new TemplateError(msg(key, data));

const TAG = /\{\{\s*(#each\s+[\w.]+|\/each|[\w.]+)\s*\}\}/g;

function lookup(scopes, name) {
  for (const scope of scopes) {
    if (name === 'this') return scope;
    let v = scope;
    for (const part of name.split('.')) {
      v = v !== null && typeof v === 'object' ? v[part] : undefined;
      if (v === undefined) break;
    }
    if (v !== undefined) return v;
  }
  return undefined;
}

// Splits text into a tree of text, var and each nodes.
function parse(text, file) {
  const root = [];
  const stack = [{ body: root }];
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.body.push({ text: text.slice(last, m.index) });
    last = m.index + m[0].length;
    const tag = m[1];
    if (tag.startsWith('#each')) {
      const node = { each: tag.slice('#each'.length).trim(), body: [] };
      top.body.push(node);
      stack.push(node);
    } else if (tag === '/each') {
      if (stack.length === 1) throw fail('strayEnd', { file });
      stack.pop();
    } else top.body.push({ name: tag });
  }
  if (stack.length > 1) throw fail('unclosedEach', { file, name: stack[stack.length - 1].each });
  if (last < text.length) root.push({ text: text.slice(last) });
  return root;
}

function emit(nodes, scopes, file) {
  let out = '';
  for (const n of nodes) {
    if ('text' in n) {
      out += n.text;
    } else if ('each' in n) {
      const list = lookup(scopes, n.each);
      if (list === undefined || list === null) throw fail('missingVariable', { file, name: n.each });
      if (!Array.isArray(list)) throw fail('notList', { file, name: n.each });
      for (const item of list) out += emit(n.body, [item, ...scopes], file);
    } else {
      const v = lookup(scopes, n.name);
      if (v === undefined || v === null) throw fail('missingVariable', { file, name: n.name });
      if (typeof v === 'object') throw fail('notScalar', { file, name: n.name });
      out += String(v);
    }
  }
  return out;
}

// A string as a pattern that matches it literally.
export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const render = (text, data, file = config.text.anonymous) => emit(parse(text, file), [data], file);

// Renders a message template from cli.json.
export const msg = (key, data) => render(config.messages[key], data, config.text.messageSource + key);

// A finding of `code` from a cli.json code table, whose fix and level (error unless the table sets one) it carries.
export const finding = (codes, code, path, line, key, data = {}, level = codes[code].level ?? config.okf.levels[0]) => ({ code, level, path, line, message: msg(key, data), fix: codes[code].fix });

// A template: the project's own under its override folder, else the shipped one (`pluginDir` for a plugin checkout).
function resolveTemplate(rel, { root, pluginDir }) {
  const file = packageFile(root, 'templates', rel, pluginDir && join(pluginDir, config.packages.templates.dir));
  if (existsSync(file)) return file;
  throw fail('templateNotFound', { name: rel });
}

export function renderFile(rel, data, opts) {
  const file = resolveTemplate(rel, opts);
  return render(readFileSync(file, 'utf8'), data, file);
}
