// CONTRACT-NAME: each published OpenAPI document against the API grammar: the plugin's generic rules, and the chosen
// model's contract (decision 0021; docs/design/naming.md#checks).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, gitLines, globRegex, isMap, list, parseYaml, plug, seam } from '../../lib/index.mjs';

const BASE = config.naming.contract;
const re = (k) => new RegExp(BASE.patterns[k]);
// The grammar a project's contracts follow: the generic one, and what its chosen model's contract adds.
const grammarOf = (root, profile) => ({ ...BASE, ...Object.assign({}, ...seam('modelContract', profile).map((f) => f(root, profile) ?? {})) });

// Every schema object in a document, with where it sits: components and inline ones alike.
function schemasOf(node, at, out = []) {
  if (Array.isArray(node)) node.forEach((x, k) => schemasOf(x, `${at}[${k}]`, out));
  else if (isMap(node)) {
    if (isMap(node.properties) || node.enum) out.push([at, node]);
    for (const [k, v] of Object.entries(node)) schemasOf(v, at ? `${at}.${k}` : k, out);
  }
  return out;
}

// The [message key, data] problems of one parsed document.
export function contractProblems(doc, C = BASE) {
  const out = [], add = (key, data) => out.push([key, data]);
  if (doc.info?.version !== undefined && !re('apiVersion').test(String(doc.info.version))) add('contractVersion', { version: String(doc.info.version) });
  for (const [path, item] of Object.entries(isMap(doc.paths) ? doc.paths : {})) {
    const segments = path.split('/').filter(Boolean);
    segments.forEach((s, k) => {
      const param = s.match(/^\{(.+)\}$/)?.[1];
      if (param !== undefined) { if (!re('param').test(param) && !C.params.includes(param)) add('contractParam', { path, param }); }
      else if (C.providers && segments[k - 1] === C.providers) { if (!re('namespace').test(s)) add('contractSegment', { path, segment: s, rule: C.rules.namespace }); }
      else if (!list(C.segments).includes(s) && !re('segment').test(s)) add('contractSegment', { path, segment: s, rule: C.rules.segment });
    });
    for (const [method, op] of Object.entries(isMap(item) ? item : {}).filter(([m]) => C.methods.includes(m))) {
      if (method === 'put' && segments.length % 2) add('contractPut', { path });
      if (op?.operationId !== undefined && !re('operationId').test(String(op.operationId))) add('contractOperationId', { path, method, id: String(op.operationId) });
    }
  }
  for (const [at, s] of schemasOf(doc, '')) {
    const props = isMap(s.properties) ? s.properties : {};
    for (const [name, p] of Object.entries(props)) {
      if (!re('property').test(name)) add('contractProperty', { at, name });
      else if (p?.type === 'boolean' && re('booleanPrefix').test(name)) add('contractBoolean', { at, name });
    }
    if (s.type === 'string' && Array.isArray(s.enum)) for (const v of s.enum.filter((x) => !re('enum').test(String(x)))) add('contractEnum', { at, value: String(v) });
    if (list(C.resource).length && C.systemData && C.resource.every((k) => k in props) && !(C.systemData in props)) add('contractSystemData', { at, field: C.systemData });
    if (C.list && C.nextLink && props[C.list]?.type === 'array' && !(C.nextLink in props)) add('contractNextLink', { at, field: C.nextLink });
  }
  return out;
}

// The contract findings of a tree, as [file, message key, data]: none without a naming registry.
function contractFindings(root, profile) {
  if (!isMap(profile.naming)) return [];
  const C = grammarOf(root, profile), globs = (profile.naming.contracts ?? C.files).map((g) => globRegex(`/${g}`)); // anchored at the repo root
  const files = gitLines(root, 'ls-files', '--cached', '--others', '--exclude-standard').filter((f) => globs.some((g) => g.test(f)));
  return files.flatMap((f) => {
    const text = readFileSync(join(root, f), 'utf8');
    let doc;
    try { doc = f.endsWith('.json') ? JSON.parse(text) : parseYaml(text); } catch (e) { return [[f, 'contractUnreadable', { error: e.message }]]; }
    return contractProblems(doc ?? {}, C).map(([key, data]) => [f, key, data]);
  });
}

// The published API speaks the grammar (decision 0021), in check and on the merge result.
const named = (root, profile) => contractFindings(root, profile).map(([path, key, data]) => ({ code: 'CONTRACT-NAME', path, key, data }));
plug('docChecks', named);
plug('gateChecks', named);
