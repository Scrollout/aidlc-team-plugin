// The naming registry: tokens, domains, closed vocabularies and banned words, from the CLI's defaults under the
// profile's own, and the domain docs' codes (docs/design/naming.md).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundleOf, config, done, isMap, UsageError } from './config.mjs';
import { msg, render } from './template.mjs';
import { loadProfile } from './profile.mjs';

const N = config.naming;
const DOMAIN = config.okf.bundle.folders.Domain;

// The registry a project names by: the defaults, then the profile's naming, then each domain doc's code.
export function registry(profile, bundle) {
  const own = isMap(profile.naming) ? profile.naming : {};
  const vocabularies = { ...N.vocabularies, ...(own.vocabularies ?? {}) };
  const domains = { ...(own.domains ?? {}) };
  const dir = bundle && join(bundle, DOMAIN);
  for (const f of dir && existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith('.md')) : []) {
    const code = readFileSync(join(dir, f), 'utf8').match(/^code:\s*["']?([^"'\s]+)/m)?.[1];
    if (code && !domains[code]) domains[code] = {};
  }
  return { tokens: { ...(own.tokens ?? {}) }, domains, vocabularies, banned: [...new Set([...N.banned, ...(own.banned ?? [])])] };
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

const words = (text) => String(text).replace(/['’]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const pascal = (ws) => ws.map(cap).join('');
const camel = (ws) => ws.map((w, k) => (k ? cap(w) : w)).join('');
const singular = (ws) => [...ws.slice(0, -1), ws.at(-1).replace(/ies$/, 'y').replace(/([^s])s$/, '$1')];

// The name of `kind` for the given flags, checked against the registry and the kind's regex.
export function nameOf(kind, flags, reg) {
  const spec = N.grammar[kind];
  if (!spec) throw new UsageError(msg('nameUsage', { kinds: Object.keys(N.grammar).join(', ') }));
  const known = (what, value, list, where) => { if (value !== undefined && !list.includes(value)) throw new UsageError(msg('nameUnregistered', { what, value, where, known: list.join(', ') || '-' })); return value; };
  const v = { ...reg.tokens, tag: flags.tag ?? '<semver>', previewSuffix: flags.preview ? '-preview' : '', date: flags.date, section: flags.section, unit: known('unit', flags.unit, N.metricUnits, 'naming.metricUnits') };
  if (flags.domain !== undefined) {
    known('domain', flags.domain, Object.keys(reg.domains), 'naming.domains or a domain doc');
    const entry = reg.domains[flags.domain] ?? {}, ws = entry.name ? words(entry.name) : [flags.domain], one = entry.singular ? words(entry.singular) : singular(ws);
    Object.assign(v, { domain: flags.domain, part: flags.domain, typeCamel: camel(ws), TypePascal: pascal(ws), singularCompact: one.join(''), singularCamel: camel(one), SingularPascal: pascal(one) });
  }
  if (flags.stage !== undefined) v.part = known('stage', flags.stage, reg.vocabularies.pipeline, 'naming.vocabularies.pipeline');
  if (flags.verb !== undefined) Object.assign(v, { verb: known('verb', flags.verb, reg.vocabularies.verb, 'naming.vocabularies.verb'), OperationVerb: N.operationVerbs[flags.verb] ?? cap(flags.verb), PastVerb: N.pastTense[flags.verb] ?? `${cap(flags.verb)}ed` });
  v.role = known('role', flags.role, reg.vocabularies.role, 'naming.vocabularies.role');
  v.roleSuffix = flags.role ? `-${flags.role}` : '';
  v.env = known('env', flags.env, reg.vocabularies.env, 'naming.vocabularies.env');
  v.action = known('action', flags.action, N.actions, 'naming.actions');
  if (v.org && v.system) v.Namespace = `${pascal(words(v.org))}.${pascal(words(v.system))}`;
  for (const [flag, key] of [['table', 'tableSnake'], ['object', 'objectSnake'], ['metric', 'metricSnake']]) if (flags[flag] !== undefined) v[key] = words(flags[flag]).join('_');
  if (flags.key !== undefined) v.keyCamel = camel(words(flags.key));
  if (flags.number !== undefined) v.number4 = String(Number(flags.number)).padStart(4, '0');
  const derived = { number: 'number4', table: 'tableSnake', object: 'objectSnake', metric: 'metricSnake', key: 'keyCamel' }; // a flag the grammar reads in another form
  const missing = spec.needs.filter((n) => v[derived[n] ?? n] === undefined || v[derived[n] ?? n] === null);
  if (missing.length) throw new UsageError(msg('nameMissing', { kind, missing: missing.join(', '), flags: missing.map((n) => (reg.tokens[n] === undefined && N.tokens[n] ? `naming.tokens.${n}` : `--${n === 'part' ? 'domain or --stage' : n}`)).join(', ') }));
  const name = render(spec.template, v, `cli.json naming.grammar.${kind}`);
  if (!new RegExp(spec.regex).test(name)) throw new UsageError(msg('nameMissing', { kind, missing: name, flags: spec.regex }));
  return name;
}

const flagsOf = (args, cmd) => {
  const out = { _: [] };
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    if (!cmd.flags.includes(a)) throw new UsageError(msg('unknownFlag', { name: a }));
    if (cmd.usage.includes(`[${a}]`)) out[a.slice(2)] = true;
    else if (args[k + 1] === undefined || args[k + 1].startsWith('--')) throw new UsageError(msg('badFlag', { name: a }));
    else out[a.slice(2)] = args[++k];
  }
  return out;
};

export const commands = {
  name(args, { cwd }) {
    const flags = flagsOf(args, config.commands.find((c) => c.name === 'name'));
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
  if (domains.length) out.push({ id: 'migration', ...G.migration, pattern: `migrations/(?:${alt(domains)})/\\d{4}_[a-z]+_[a-z0-9_]+\\.sql` });
  if (t.registry && t.org && t.system) out.push({ id: 'image', ...G.image, pattern: `${alt([t.registry])}/${alt([t.org])}/${alt([t.system])}-(?:${alt([...domains, ...reg.vocabularies.pipeline])})-(?:${alt(reg.vocabularies.role)}):[A-Za-z0-9._-]+` });
  if (t.system) out.push({ id: 'namespace', ...G.namespace, pattern: `${alt([t.system])}-(?:${alt(reg.vocabularies.env)})` });
  out.push({ id: 'banned', ...G.banned, pattern: `(?!(?:.*/)?(?:${alt(reg.banned)})(?:[./_-][^/]*)?(?:/|$)).*` });
  return out;
}

// Modules whose id the registry does not hold for their kind: a domain's code, a pipeline stage, a foundation kit.
export function moduleProblems(profile, bundle) {
  if (!isMap(profile.naming)) return [];
  const reg = registry(profile, bundle), lists = { domain: [Object.keys(reg.domains), 'naming.domains or a domain doc'], pipeline: [reg.vocabularies.pipeline, 'naming.vocabularies.pipeline'], foundation: [reg.vocabularies.foundation, 'naming.vocabularies.foundation'] };
  return (profile.modules ?? []).filter((m) => lists[m.kind] && !lists[m.kind][0].includes(String(m.id ?? m.name))).map((m) => ['namingModule', { module: String(m.id ?? m.name), kind: m.kind, where: lists[m.kind][1] }]);
}
