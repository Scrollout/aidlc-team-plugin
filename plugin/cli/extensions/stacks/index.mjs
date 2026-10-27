// Stack packs: each language's layout, scaffold templates, reference domain and the dependency graph the plugin
// reads from source, with no toolchain run (docs/design/stack-packs.md).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { bundleOf, config, domainForms, done, graphOf, list, loadProfile, msg, nameOf, plug, posix, registry, render, shippedDir, UsageError } from '../../lib/index.mjs';

const K = config.packs;
const packsDir = () => shippedDir('packs');

// The pack whose detect file the project has, as { stack, dir, manifest }, or null.
function packFor(root) {
  if (!existsSync(packsDir())) return null;
  for (const stack of readdirSync(packsDir()).sort()) {
    const file = join(packsDir(), stack, K.manifest);
    const manifest = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    if (manifest && list(manifest.detect).some((d) => existsSync(join(root, d)))) return { stack, dir: join(packsDir(), stack), manifest };
  }
  return null;
}
plug('stack', (root) => packFor(root)?.stack ?? null); // for the intake proposal

// The project's source files a pack reads: its extensions, outside the skipped folders and the tests.
function sources(root, manifest) {
  const out = [], src = new RegExp(manifest.sources), test = new RegExp(K.tests);
  const walk = (dir) => {
    for (const name of readdirSync(join(root, dir))) {
      const rel = dir ? `${dir}/${name}` : name;
      if (K.skip.includes(name) || name.startsWith('.')) continue;
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (src.test(name) && !test.test(name)) out.push(rel);
    }
  };
  walk('');
  return out.sort();
}

// The import edges, folder to folder: Go imports inside the module, TypeScript relative imports.
function importEdges(root, manifest, files) {
  const edges = new Set();
  if (manifest.imports === 'go') {
    const mod = readFileSync(join(root, manifest.module.file), 'utf8').match(new RegExp(manifest.module.pattern, 'm'))?.[1];
    for (const f of files) {
      const text = readFileSync(join(root, f), 'utf8'), block = text.match(/^import\s*\(([\s\S]*?)\)/m)?.[1] ?? '';
      const paths = [...block.matchAll(/"([^"]+)"/g), ...text.matchAll(/^import\s+(?:[\w.]+\s+)?"([^"]+)"/gm)].map((m) => m[1]);
      for (const p of paths.filter((x) => mod && x.startsWith(`${mod}/`))) edges.add(`${dirname(f)}${config.gate.edge}${p.slice(mod.length + 1)}`);
    }
  } else {
    for (const f of files) {
      const text = readFileSync(join(root, f), 'utf8');
      for (const m of text.matchAll(/(?:from\s+|require\(\s*|import\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) edges.add(`${dirname(f)}${config.gate.edge}${posix(relative(root, dirname(resolve(root, dirname(f), m[1]))))}`);
    }
  }
  return [...edges].map((e) => e.split(config.gate.edge)).filter(([a, b]) => a !== b);
}

// The data edges: a domain's infrastructure to the tables its migrations create, and any code naming another
// domain's table schema-qualified (<domain>.<table>, the grammar's form) to that table.
function dataEdges(root, manifest, profile, files) {
  const prefix = profile.architecture?.data?.prefix ?? K.dataPrefix, out = [];
  const domains = (profile.modules ?? []).filter((m) => m.kind === 'domain').map((m) => String(m.id ?? m.name));
  for (const d of domains) {
    const dir = render(manifest.migrations, { domain: d }), infra = `${render(manifest.folders.domain, { domain: d })}/${manifest.layers.infrastructure}`;
    for (const f of existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((x) => x.endsWith('.sql')) : []) {
      for (const m of readFileSync(join(root, dir, f), 'utf8').matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:\w+\.)?(\w+)/gi)) out.push([infra, `${prefix}${d}/${m[1]}`]);
    }
  }
  if (domains.length) {
    // Only inside string literals, where SQL lives: `notes.save(x)` in code is a call, not a table.
    const qualified = new RegExp(`\\b(${domains.join('|')})\\.([a-z_][a-z0-9_]*)\\b`, 'g'), literal = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/gs;
    for (const f of files) for (const s of readFileSync(join(root, f), 'utf8').matchAll(literal)) for (const m of s[2].matchAll(qualified)) out.push([dirname(f), `${prefix}${m[1]}/${m[2]}`]);
  }
  return out;
}

// The graph `aidlc graph` prints and the architecture checks read: imports, then data.
export function packGraph(root, profile) {
  const pack = packFor(root);
  if (!pack) return null;
  const files = sources(root, pack.manifest);
  const seen = new Set();
  return [...importEdges(root, pack.manifest, files), ...dataEdges(root, pack.manifest, profile, files)].filter(([a, b]) => !seen.has(`${a} ${b}`) && seen.add(`${a} ${b}`));
}

// Event types in a domain's events surface that break the grammar, as [file, message key, data] (decision 0014).
function eventFindings(root, profile) {
  const pack = packFor(root);
  if (!pack?.manifest.eventType || !profile.naming) return [];
  const grammar = new RegExp(config.naming.grammar.event.regex), past = Object.values(config.naming.pastTense), out = [];
  for (const m of (profile.modules ?? []).filter((x) => x.kind === 'domain')) {
    const dir = `${render(pack.manifest.folders.domain, { domain: String(m.id ?? m.name) })}/${pack.manifest.surfaces.events}`;
    for (const f of existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((x) => new RegExp(pack.manifest.sources).test(x)) : []) {
      for (const e of readFileSync(join(root, dir, f), 'utf8').matchAll(new RegExp(pack.manifest.eventType, 'g'))) {
        const type = e[1], last = type.split('.').at(-1);
        if (!grammar.test(type) || /\.V\d+$|v\d+$/i.test(type) || !(past.some((p) => last.endsWith(p)) || /ed$/.test(last))) out.push([`${dir}/${f}`, 'contractEvent', { type }]);
      }
    }
  }
  return out;
}

// The reference slices a card points a builder at, as paths from the project root.
const referenceOf = (root) => { const p = packFor(root); return p ? Object.fromEntries(Object.entries(p.manifest.reference ?? {}).map(([k, v]) => [k, posix(relative(root, join(p.dir, v)))])) : null; };

export const commands = {
  graph(args, { cwd }) {
    const edges = packGraph(cwd, loadProfile(cwd).profile);
    if (!edges) throw new UsageError(msg('packNone', { detect: readdirSync(packsDir()).join(', ') }));
    return done(edges.map((e) => `${e.join(config.gate.edge)}\n`).join(''));
  },

  // Writes a kind's templates at its folder with names from the registry; never overwrites (docs/design/stack-packs.md#scaffold).
  scaffold(args, { cwd }) {
    const [kind, name] = args.filter((a) => !a.startsWith('--')), flag = (f) => { const k = args.indexOf(`--${f}`); return k >= 0 ? args[k + 1] : undefined; };
    const pack = packFor(cwd);
    if (!pack) throw new UsageError(msg('packNone', { detect: readdirSync(packsDir()).join(', ') }));
    const { profile } = loadProfile(cwd), reg = registry(profile, bundleOf(cwd, profile));
    if (!pack.manifest.scaffold[kind] || !name) throw new UsageError(msg('scaffoldUsage', { kinds: Object.keys(pack.manifest.scaffold).join(', ') }));
    const domain = kind === 'domain' ? name : flag('domain');
    const v = { domain, stage: name, kit: name, system: name, deployable: name };
    if (domain !== undefined) { const f = domainForms(nameOf('domain', { domain }, reg), reg); Object.assign(v, { domain, singular: f.singularCompact, Singular: f.SingularPascal }); }
    if (kind === 'slice') v.operation = nameOf('slice', { domain, verb: name }, reg);
    const what = { foundation: 'kit', pipeline: 'stage' }[kind], known = reg.vocabularies[kind]; // registered, never invented
    if (what && !known.includes(name)) throw new UsageError(msg('nameUnregistered', { what, value: name, where: `naming.vocabularies.${kind}`, known: known.join(', ') }));
    if (kind === 'runtime') { // a deployable is <system>-<domain or stage>-<role>, composed, never invented
      const [part, role] = [name.split('-').slice(1, -1).join('-'), name.split('-').at(-1)];
      const composed = nameOf('deployable', { [reg.domains[part] ? 'domain' : 'stage']: part, role }, reg);
      if (composed !== name) throw new UsageError(msg('nameUnregistered', { what: 'deployable', value: name, where: 'naming.grammar.deployable', known: composed }));
    }
    if (kind === 'adapter' && (!new RegExp(config.naming.word).test(name) || reg.banned.includes(name))) throw new UsageError(msg('nameUnregistered', { what: 'system', value: name, where: 'a lower-case word, not banned', known: '-' }));
    v.dir = render(pack.manifest.folders[kind === 'slice' ? 'domain' : kind], v);
    const out = [];
    for (const [template, to] of pack.manifest.scaffold[kind]) {
      const path = render(to, v), file = join(cwd, path);
      if (existsSync(file)) { out.push(msg('scaffoldKept', { path })); continue; }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, render(readFileSync(join(pack.dir, K.templates, template), 'utf8'), v, template));
      out.push(msg('scaffoldWrote', { path }));
    }
    return done(out.join(''));
  },
};

// A project's own graph must hold every edge the pack reads from source (GRAPH-SELFTEST); none with no pack or no graph.
function selftestFindings(root, profile) {
  const command = profile.architecture?.graph, edges = command && packGraph(root, profile);
  if (!edges || /\baidlc(\.mjs)?\s+graph\b/.test(command)) return [];
  const own = new Set(graphOf(root, command).edges.map(([a, b]) => `${a}${config.gate.edge}${b}`));
  const missing = edges.map(([a, b]) => `${a}${config.gate.edge}${b}`).filter((e) => !own.has(e));
  return missing.length ? [['graphSelftest', { command, count: missing.length, edges: missing.slice(0, 3).join('; ') }]] : [];
}

// Event types speak the grammar; a project's graph sees what its pack sees (docs/design/stack-packs.md).
const events = (root, profile) => eventFindings(root, profile).map(([path, key, data]) => ({ code: 'CONTRACT-NAME', path, key, data }));
plug('docChecks', (root, profile) => [...events(root, profile), ...selftestFindings(root, profile).map(([key, data]) => ({ code: 'GRAPH-SELFTEST', key, data }))]);
plug('gateChecks', events);
plug('proofPatterns', (root) => packFor(root)?.manifest.compileError);
// The card of a bolt that names a domain links the reference slices to copy.
plug('cardSections', (top, bolt, profile) => {
  const ref = referenceOf(top), named = (profile.modules ?? []).some((m) => m.kind === 'domain' && bolt.modules.includes(String(m.id ?? m.name)));
  return ref && named ? [msg('cardReference', ref)] : [];
});
