// The naming registry: tokens, domains, closed vocabularies and banned words, from the CLI's defaults under the
// profile's own, and the domain docs' codes (docs/design/naming.md).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundleOf, config, done, isMap, list, UsageError } from '../foundation/data.mjs';
import { msg, render, TemplateError } from '../foundation/text.mjs';
import { seam } from '../foundation/seams.mjs';
import { loadProfile } from '../foundation/profile.mjs';

const N = config.naming;
const DOMAIN = config.okf.bundle.folders.Domain;

// The registry a project names by: the defaults, the stack pack's for a root, the profile's naming, each domain doc's code.
export function registry(profile, bundle, root) {
  const own = isMap(profile.naming) ? profile.naming : {};
  const vocabularies = { ...N.vocabularies, ...(own.vocabularies ?? {}) }, domains = { ...(own.domains ?? {}) };
  const dir = bundle && join(bundle, DOMAIN);
  for (const f of dir && existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(config.okf.ext)) : []) {
    const code = readFileSync(join(dir, f), 'utf8').match(/^code:\s*["']?([^"'\s]+)/m)?.[1];
    if (code && !domains[code]) domains[code] = {};
  }
  // Each kind field by field: the plugin's spec, the stack pack's, the chosen architecture model's (`model.grammar`,
  // which only `aidlc models apply` writes), then the project's own override (decision 0021); any layer adds a kind.
  const layers = [N.grammar, (root ? seam('namingLayer', profile).map((f) => f(root)).find(isMap) : null)?.grammar, profile.model?.grammar, own.grammar].map((g) => (isMap(g) ? g : {}));
  const grammar = Object.fromEntries([...new Set(layers.flatMap(Object.keys))].map((k) => [k, Object.assign({ needs: [] }, ...layers.map((g) => (isMap(g[k]) ? g[k] : {})))]));
  return { tokens: { ...(own.tokens ?? {}) }, domains, vocabularies, grammar, classes: { ...N.classes, ...(own.classes ?? {}) }, banned: [...new Set([...N.banned, ...(own.banned ?? [])])] };
}

// What the profile's naming gets wrong, as [message key, data, level?]: a kind with no template or regex, an unknown
// class or scope, a global kind no project token makes unique (docs/design/naming-coordinates.md#constraints).
export function namingProblems(profile) {
  const own = isMap(profile.naming) ? profile.naming : null;
  if (!own) return [];
  const reg = registry(profile), word = new RegExp(N.word), out = [];
  for (const [token, value] of Object.entries(reg.tokens)) {
    const spec = N.tokens[token];
    if (spec && !new RegExp(spec.pattern).test(String(value))) out.push(['namingToken', { token, value: String(value), rule: spec.rule }]);
  }
  for (const code of Object.keys(own.domains ?? {})) {
    if (!word.test(code)) out.push(['namingDomain', { code }]);
    else if (reg.banned.includes(code)) out.push(['namingBanned', { where: 'domain', word: code }]);
  }
  for (const [list, words] of Object.entries(own.vocabularies ?? {})) {
    for (const w of [words].flat().map(String)) {
      if (!word.test(w)) out.push(['namingWord', { list, word: w }]);
      else if (reg.banned.includes(w)) out.push(['namingBanned', { where: `vocabulary ${list}`, word: w }]);
    }
  }
  for (const [kind, spec] of Object.entries(reg.grammar)) {
    if (!spec.template || !spec.regex) out.push(['namingKind', { kind }]);
    if (spec.class !== undefined && !reg.classes[spec.class]) out.push(['namingClass', { kind, class: spec.class, known: Object.keys(reg.classes).join(', ') }]);
    if (spec.scope !== undefined && !N.scope.values.includes(spec.scope)) out.push(['namingScope', { kind, scope: spec.scope, known: N.scope.values.join(', ') }]);
    else if (spec.scope === N.scope.global && !N.scope.unique.some((t) => String(spec.template).includes(`{{${t}}}`) || list(spec.needs).includes(t))) out.push(['namingGlobal', { kind, tokens: N.scope.unique.join(', ') }, config.okf.levels[1]]);
  }
  return out;
}

// ---- Names from the grammar (docs/design/naming.md#grammar) ----

const words = (text) => String(text).replace(/['’]/g, '').split(new RegExp(N.wordSplit)).filter(Boolean).map((w) => w.toLowerCase());
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const pascal = (ws) => ws.map(cap).join('');
const camel = (ws) => ws.map((w, k) => (k ? cap(w) : w)).join('');
const namespaceOf = (t) => (t.org && t.system ? `${pascal(words(t.org))}.${pascal(words(t.system))}` : undefined);
const pastOf = (verb, rule = N.pastRules.find(([from]) => new RegExp(from).test(verb))) => N.pastTense[verb] ?? cap(rule ? verb.replace(new RegExp(rule[0]), rule[1]) : verb + N.pastSuffix); // irregular, a spelling rule, the suffix
const singular = (ws) => [...ws.slice(0, -1), N.singular.reduce((w, [from, to]) => w.replace(new RegExp(from), to), ws.at(-1))];

// A registered domain's word forms, from its registered name (or its code) and singular: the API's type in camel
// and Pascal case, and the singular as one lower-case word, in camel and in Pascal case.
export function domainForms(code, reg) {
  const entry = reg.domains[code] ?? {}, ws = entry.name ? words(entry.name) : [code], one = entry.singular ? words(entry.singular) : singular(ws);
  return { typeCamel: camel(ws), TypePascal: pascal(ws), singularCompact: one.join(''), singularCamel: camel(one), SingularPascal: pascal(one) };
}

// The name of `kind` for the given flags, checked against the registry and the kind's regex.
export function nameOf(kind, flags, reg) {
  const grammar = reg.grammar ?? N.grammar, spec = grammar[kind]; // a registry built by hand has the plugin's grammar
  if (!spec?.template || !spec.regex) throw new UsageError(msg('nameUsage', { kinds: Object.keys(grammar).join(', ') }));
  const known = (what, value, list, where) => { if (value !== undefined && !list.includes(value)) throw new UsageError(msg('nameUnregistered', { what, value, where, known: list.join(', ') || '-' })); return value; };
  const v = { ...reg.tokens, Namespace: namespaceOf(reg.tokens), tag: flags.tag ?? N.tagPlaceholder, previewSuffix: flags.preview ? N.previewSuffix : '', date: flags.date, section: flags.section, unit: known('unit', flags.unit, N.metricUnits, N.where.unit) };
  if (flags.domain !== undefined) {
    known('domain', flags.domain, Object.keys(reg.domains), N.where.domain);
    Object.assign(v, { domain: flags.domain, part: flags.domain, ...domainForms(flags.domain, reg) });
  }
  if (flags.stage !== undefined) v.part = known('stage', flags.stage, reg.vocabularies.pipeline, N.where.pipeline);
  if (flags.verb !== undefined) Object.assign(v, { verb: known('verb', flags.verb, reg.vocabularies.verb, N.where.verb), OperationVerb: N.operationVerbs[flags.verb] ?? cap(flags.verb), PastVerb: pastOf(flags.verb) });
  v.role = known('role', flags.role, reg.vocabularies.role, N.where.role);
  v.roleSuffix = flags.role ? `-${flags.role}` : '';
  v.env = known('env', flags.env, reg.vocabularies.env, N.where.env);
  v.action = known('action', flags.action, N.actions, N.where.action);
  for (const flag of ['table', 'object', 'metric']) if (flags[flag] !== undefined) v[N.forms[flag]] = words(flags[flag]).join('_');
  if (flags.key !== undefined) v[N.forms.key] = camel(words(flags.key));
  if (flags.number !== undefined) v[N.forms.number] = String(Number(flags.number)).padStart(N.numberDigits, '0');
  const derived = N.forms; // a flag the grammar reads in another form
  const missing = spec.needs.filter((n) => v[derived[n] ?? n] === undefined || v[derived[n] ?? n] === null);
  if (missing.length) throw new UsageError(msg('nameMissing', { kind, missing: missing.join(', '), flags: missing.map((n) => (reg.tokens[n] === undefined && N.tokens[n] ? N.where.token + n : `--${n === 'part' ? N.partFlags : n}`)).join(', ') }));
  const name = render(spec.template, v, N.grammarSource + kind);
  if (!new RegExp(spec.regex).test(name)) throw new UsageError(msg('nameMissing', { kind, missing: name, flags: spec.regex }));
  if (spec.max && name.length > spec.max) throw new UsageError(msg('nameMax', { kind, name, length: name.length, max: spec.max }));
  const cls = (reg.classes ?? N.classes)[spec.class]; if (cls && !new RegExp(cls).test(name)) throw new UsageError(msg('nameClass', { kind, name, class: spec.class, pattern: cls }));
  return name;
}

// A command's flags as cli.json declares them; a usage naming a `<positional>` collects the rest under `_`,
// and a flag its usage marks `…` collects each value it is given.
export function parseFlags(args, name, cmd = config.commands.find((c) => c.name === name)) {
  const out = { _: [] };
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (!a.startsWith('--') && cmd.usage.includes('<')) { out._.push(a); continue; }
    if (!cmd.flags.includes(a)) throw new UsageError(msg('unknownFlag', { name: a }));
    if (cmd.usage.includes(`[${a}]`)) { out[a.slice(2)] = true; continue; }
    const v = args[++k];
    if (v === undefined || v.startsWith('--')) throw new UsageError(msg('badFlag', { name: a }));
    if (new RegExp(`${a} [^\\s\\]]+\\]?…`).test(cmd.usage)) (out[a.slice(2)] ??= []).push(v);
    else out[a.slice(2)] = v;
  }
  return out;
}

export const commands = {
  name(args, { cwd }) {
    const flags = parseFlags(args, 'name');
    const { profile } = loadProfile(cwd);
    return done(`${nameOf(flags._[0], flags, registry(profile, bundleOf(cwd, profile), cwd))}\n`);
  },
};

// ---- Rules generated from the registry, read by the gate's GATE-NAME like the project's own (docs/design/naming.md#checks) ----

const alt = (xs) => xs.map((x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
// Every name of `kind` the registry composes, as { flags, name }; none when a token it needs is in no closed list.
function composed(kind, spec, reg, lists) {
  const free = spec.needs.filter((n) => reg.tokens[n] === undefined);
  if (free.some((n) => !lists[n])) return [];
  return free.reduce((all, n) => all.flatMap((c) => lists[n].map((x) => ({ ...c, [n]: x }))), [{}]).flatMap((flags) => { try { return [{ flags, name: nameOf(kind, flags, reg) }]; } catch { return []; } });
}

// The generated names rules, none without a registry: migrations under a registered domain, images and namespaces
// from the tokens, no path segment a banned word, and one per kind that has `files` (docs/design/naming-coordinates.md).
export function generatedRules(profile, bundle, root) {
  if (!isMap(profile.naming)) return [];
  const reg = registry(profile, bundle, root), t = reg.tokens, G = N.generated, domains = Object.keys(reg.domains), out = [];
  if (domains.length) out.push({ id: 'migration', ...G.migration, pattern: render(N.patterns.migration, { domains: alt(domains) }) });
  if (t.registry && t.org && t.system) out.push({ id: 'image', ...G.image, pattern: render(N.patterns.image, { registry: alt([t.registry]), org: alt([t.org]), system: alt([t.system]), parts: alt([...domains, ...reg.vocabularies.pipeline]), roles: alt(reg.vocabularies.role) }) });
  if (t.system) out.push({ id: 'namespace', ...G.namespace, pattern: render(N.patterns.namespace, { system: alt([t.system]), envs: alt(reg.vocabularies.env) }) });
  out.push({ id: 'banned', ...G.banned, pattern: render(N.patterns.banned, { banned: alt(reg.banned) }) });
  const lists = { domain: domains, action: N.actions, unit: N.metricUnits, ...reg.vocabularies }, esc = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined).map(([k, x]) => [k, alt([x])]));
  for (const [kind, spec] of Object.entries(reg.grammar).filter(([, s]) => list(s.files).length && s.template && s.regex)) {
    const names = composed(kind, spec, reg, lists), at = new Map(); // a path rule: each path, with the names it takes
    try {
      for (const n of spec.path ? names : []) { const p = render(spec.path, { ...esc(t), ...esc(n.flags), name: '\0' }); at.set(p, [...(at.get(p) ?? []), n.name]); }
      // A kind's `nest` lets child segments in before its last `at`; another namespace is judged by the kind's regex.
      const shape = spec.regex.replace(/^\^|\$$/g, ''), own = namespaceOf(t), nested = (n) => (spec.nest ? alt([n.slice(0, n.lastIndexOf(spec.nest.at))]) + spec.nest.pattern + alt([n.slice(n.lastIndexOf(spec.nest.at))]) : alt([n]));
      const exact = names.map((n) => nested(n.name)).join('|'), ns = `{{${N.namespaceToken}}}`, others = spec.find?.includes(ns) && own ? `|${render(N.patterns.otherNamespace, { own: alt([own]), shape })}` : '';
      const pattern = spec.path ? [...at].map(([p, ns]) => p.replace('\0', `(?:${alt(ns)})`)).join('|') : names.length ? exact + others : shape;
      if (pattern) out.push({ id: kind, files: list(spec.files), ...(spec.find && { find: render(spec.find.replaceAll(ns, '\0'), esc(t), N.grammarSource + kind).replaceAll('\0', N.patterns.anyNamespace) }), pattern, why: spec.why ?? N.ruleWhy });
    } catch (e) { if (!(e instanceof TemplateError)) throw e; } // a token the registry lacks: no rule yet
  }
  return out;
}

// Modules whose id the registry does not hold for their kind: a domain's code, a pipeline stage, a foundation kit.
export function moduleProblems(profile, bundle) {
  if (!isMap(profile.naming)) return [];
  const reg = registry(profile, bundle), lists = { domain: [Object.keys(reg.domains), N.where.domain], pipeline: [reg.vocabularies.pipeline, N.where.pipeline], foundation: [reg.vocabularies.foundation, N.where.foundation] };
  return (profile.modules ?? []).filter((m) => lists[m.kind] && !lists[m.kind][0].includes(String(m.id ?? m.name))).map((m) => ['namingModule', { module: String(m.id ?? m.name), kind: m.kind, where: lists[m.kind][1] }]);
}

// ---- The glossary: the domains' terms, their one meaning and the synonyms to avoid (docs/design/naming.md#checks) ----

// Every glossary entry of the domain docs: `- **term** (not: a, b): meaning` under # Glossary.
export function glossaryOf(bundle) {
  const dir = bundle && join(bundle, DOMAIN), entry = new RegExp(N.glossary.entry), out = [];
  for (const f of dir && existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(config.okf.ext)).sort() : []) {
    const text = readFileSync(join(dir, f), 'utf8'), domain = text.match(/^code:\s*["']?([^"'\s]+)/m)?.[1] ?? f.slice(0, -config.okf.ext.length);
    let on = false;
    for (const line of text.split('\n')) {
      if (/^#{1,6}\s/.test(line)) on = new RegExp(`^#{1,6}\\s+${N.glossary.section}\\s*$`).test(line);
      const m = on && line.match(entry);
      if (m && !/^</.test(m[1])) out.push({ domain, term: m[1].trim(), synonyms: (m[2] ?? '').split(',').map((s) => s.trim()).filter(Boolean), meaning: m[3].trim() });
    }
  }
  return out;
}
