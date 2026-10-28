// The naming registry: tokens, domains, closed vocabularies and banned words, from the CLI's defaults under the
// profile's own, and the domain docs' codes (docs/design/naming.md).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundleOf, config, done, isMap, UsageError } from '../foundation/data.mjs';
import { msg, render } from '../foundation/text.mjs';
import { loadProfile } from '../foundation/profile.mjs';

const N = config.naming;
const DOMAIN = config.okf.bundle.folders.Domain;

// The registry a project names by: the defaults, then the profile's naming, then each domain doc's code.
export function registry(profile, bundle) {
  const own = isMap(profile.naming) ? profile.naming : {};
  const vocabularies = { ...N.vocabularies, ...(own.vocabularies ?? {}) };
  const domains = { ...(own.domains ?? {}) };
  const dir = bundle && join(bundle, DOMAIN);
  for (const f of dir && existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(config.okf.ext)) : []) {
    const code = readFileSync(join(dir, f), 'utf8').match(/^code:\s*["']?([^"'\s]+)/m)?.[1];
    if (code && !domains[code]) domains[code] = {};
  }
  // A kind the profile overrides keeps the plugin's spec for what the override leaves out (decision 0021).
  const grammar = Object.fromEntries(Object.entries(N.grammar).map(([k, spec]) => [k, { ...spec, ...(isMap(own.grammar?.[k]) ? own.grammar[k] : {}) }]));
  return { tokens: { ...(own.tokens ?? {}) }, domains, vocabularies, grammar, banned: [...new Set([...N.banned, ...(own.banned ?? [])])] };
}

// What the profile's naming gets wrong, as [message key, data] pairs.
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
  return out;
}

// ---- Names from the grammar (docs/design/naming.md#grammar) ----

const words = (text) => String(text).replace(/['’]/g, '').split(new RegExp(N.wordSplit)).filter(Boolean).map((w) => w.toLowerCase());
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const pascal = (ws) => ws.map(cap).join('');
const camel = (ws) => ws.map((w, k) => (k ? cap(w) : w)).join('');
const singular = (ws) => [...ws.slice(0, -1), N.singular.reduce((w, [from, to]) => w.replace(new RegExp(from), to), ws.at(-1))];

// A registered domain's word forms, from its registered name (or its code) and singular: the API's type in camel
// and Pascal case, and the singular as one lower-case word, in camel and in Pascal case.
export function domainForms(code, reg) {
  const entry = reg.domains[code] ?? {}, ws = entry.name ? words(entry.name) : [code], one = entry.singular ? words(entry.singular) : singular(ws);
  return { typeCamel: camel(ws), TypePascal: pascal(ws), singularCompact: one.join(''), singularCamel: camel(one), SingularPascal: pascal(one) };
}

// The name of `kind` for the given flags, checked against the registry and the kind's regex.
export function nameOf(kind, flags, reg) {
  const spec = reg.grammar[kind];
  if (!spec) throw new UsageError(msg('nameUsage', { kinds: Object.keys(N.grammar).join(', ') }));
  const known = (what, value, list, where) => { if (value !== undefined && !list.includes(value)) throw new UsageError(msg('nameUnregistered', { what, value, where, known: list.join(', ') || '-' })); return value; };
  const v = { ...reg.tokens, tag: flags.tag ?? N.tagPlaceholder, previewSuffix: flags.preview ? N.previewSuffix : '', date: flags.date, section: flags.section, unit: known('unit', flags.unit, N.metricUnits, N.where.unit) };
  if (flags.domain !== undefined) {
    known('domain', flags.domain, Object.keys(reg.domains), N.where.domain);
    Object.assign(v, { domain: flags.domain, part: flags.domain, ...domainForms(flags.domain, reg) });
  }
  if (flags.stage !== undefined) v.part = known('stage', flags.stage, reg.vocabularies.pipeline, N.where.pipeline);
  if (flags.verb !== undefined) Object.assign(v, { verb: known('verb', flags.verb, reg.vocabularies.verb, N.where.verb), OperationVerb: N.operationVerbs[flags.verb] ?? cap(flags.verb), PastVerb: N.pastTense[flags.verb] ?? cap(flags.verb) + N.pastSuffix });
  v.role = known('role', flags.role, reg.vocabularies.role, N.where.role);
  v.roleSuffix = flags.role ? `-${flags.role}` : '';
  v.env = known('env', flags.env, reg.vocabularies.env, N.where.env);
  v.action = known('action', flags.action, N.actions, N.where.action);
  if (v.org && v.system) v.Namespace = `${pascal(words(v.org))}.${pascal(words(v.system))}`;
  for (const flag of ['table', 'object', 'metric']) if (flags[flag] !== undefined) v[N.forms[flag]] = words(flags[flag]).join('_');
  if (flags.key !== undefined) v[N.forms.key] = camel(words(flags.key));
  if (flags.number !== undefined) v[N.forms.number] = String(Number(flags.number)).padStart(N.numberDigits, '0');
  const derived = N.forms; // a flag the grammar reads in another form
  const missing = spec.needs.filter((n) => v[derived[n] ?? n] === undefined || v[derived[n] ?? n] === null);
  if (missing.length) throw new UsageError(msg('nameMissing', { kind, missing: missing.join(', '), flags: missing.map((n) => (reg.tokens[n] === undefined && N.tokens[n] ? N.where.token + n : `--${n === 'part' ? N.partFlags : n}`)).join(', ') }));
  const name = render(spec.template, v, N.grammarSource + kind);
  if (!new RegExp(spec.regex).test(name)) throw new UsageError(msg('nameMissing', { kind, missing: name, flags: spec.regex }));
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
    return done(`${nameOf(flags._[0], flags, registry(profile, bundleOf(cwd, profile)))}\n`);
  },
};

// ---- Rules generated from the registry, read by the gate's GATE-NAME like the project's own (docs/design/naming.md#checks) ----

const alt = (xs) => xs.map((x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

// The generated names rules: migrations under a registered domain, images and namespaces composed from the tokens,
// and no path segment a banned word. None without a registry.
export function generatedRules(profile, bundle) {
  if (!isMap(profile.naming)) return [];
  const reg = registry(profile, bundle), t = reg.tokens, G = N.generated, domains = Object.keys(reg.domains), out = [];
  if (domains.length) out.push({ id: 'migration', ...G.migration, pattern: render(N.patterns.migration, { domains: alt(domains) }) });
  if (t.registry && t.org && t.system) out.push({ id: 'image', ...G.image, pattern: render(N.patterns.image, { registry: alt([t.registry]), org: alt([t.org]), system: alt([t.system]), parts: alt([...domains, ...reg.vocabularies.pipeline]), roles: alt(reg.vocabularies.role) }) });
  if (t.system) out.push({ id: 'namespace', ...G.namespace, pattern: render(N.patterns.namespace, { system: alt([t.system]), envs: alt(reg.vocabularies.env) }) });
  out.push({ id: 'banned', ...G.banned, pattern: render(N.patterns.banned, { banned: alt(reg.banned) }) });
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
