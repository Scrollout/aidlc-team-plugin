// Template engine: `{{a.b}}` and `{{#each list}}…{{/each}}`, nothing more (docs/design/profile.md).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_DIR } from './profile.mjs';

export class TemplateError extends Error {}

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
      const node = { each: tag.slice(5).trim(), body: [] };
      top.body.push(node);
      stack.push(node);
    } else if (tag === '/each') {
      if (stack.length === 1) throw new TemplateError(`${file}: {{/each}} without {{#each}}`);
      stack.pop();
    } else {
      top.body.push({ name: tag });
    }
  }
  if (stack.length > 1) throw new TemplateError(`${file}: {{#each ${stack[stack.length - 1].each}}} is not closed`);
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
      if (list === undefined || list === null) throw new TemplateError(`${file}: missing variable ${n.each}`);
      if (!Array.isArray(list)) throw new TemplateError(`${file}: ${n.each} is not a list`);
      for (const item of list) out += emit(n.body, [item, ...scopes], file);
    } else {
      const v = lookup(scopes, n.name);
      if (v === undefined || v === null) throw new TemplateError(`${file}: missing variable ${n.name}`);
      if (typeof v === 'object') throw new TemplateError(`${file}: ${n.name} is not a scalar`);
      out += String(v);
    }
  }
  return out;
}

export function render(text, data, file = '<template>') {
  return emit(parse(text, file), [data], file);
}

// A project file `.aidlc/templates/<rel>` overrides the plugin's `templates/<rel>`.
export function resolveTemplate(rel, { root, pluginDir = PLUGIN_DIR }) {
  for (const file of [join(root, '.aidlc', 'templates', rel), join(pluginDir, 'templates', rel)]) {
    if (existsSync(file)) return file;
  }
  throw new TemplateError(`template not found: ${rel}`);
}

export function renderFile(rel, data, opts) {
  const file = resolveTemplate(rel, opts);
  return render(readFileSync(file, 'utf8'), data, file);
}
