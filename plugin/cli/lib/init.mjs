// Init and upgrade: render a project's files from templates, pin the CLI, adopt an existing bundle
// (docs/design/profile.md, docs/design/paths.md). Settings, file list and messages come from cli.json.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { CLI_DIR, PLUGIN_DIR, config, done, isMap, UsageError, relPath } from './config.mjs';
import { msg, render, renderFile } from './template.mjs';
import { DEFAULTS } from './profile.mjs';
import { checkBundle, parseDoc } from './okf.mjs';
import { git, tryGit } from './state.mjs';

const I = config.init;

// Two folders are the same one, short names and symlinks aside (Windows `RUNNER~1`, macOS `/var`).
const sameDir = (a, b) => existsSync(a) && existsSync(b) && realpathSync.native(a) === realpathSync.native(b);

function parseFlags(args, known) {
  const out = { overwrite: [] };
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (!known.includes(a)) throw new UsageError(msg('unknownFlag', { name: a }));
    if (['--adopt', '--downgrade', '--dirty'].includes(a)) { out[a.slice(2)] = true; continue; }
    const v = args[++k];
    if (v === undefined || v.startsWith('--')) throw new UsageError(msg('badFlag', { name: a }));
    if (a === '--overwrite') out.overwrite.push(v);
    else out[a.slice(2)] = v;
  }
  return out;
}

function projectRoot(cwd) {
  const top = tryGit(cwd, 'rev-parse', '--show-toplevel');
  if (!top) throw new UsageError(msg('initNeedsRepo', {}));
  return top;
}

// The version of the installed plugin; refuses to run from a pinned copy.
function pluginVersion(root) {
  const manifest = join(PLUGIN_DIR, I.manifest);
  if (!existsSync(manifest) || sameDir(CLI_DIR, resolve(root, I.bin))) throw new UsageError(msg('initNotPlugin', { path: CLI_DIR }));
  return JSON.parse(readFileSync(manifest, 'utf8')).version;
}

function vendor(root, version) {
  const bin = join(root, I.bin);
  rmSync(bin, { recursive: true, force: true });
  cpSync(CLI_DIR, bin, { recursive: true });
  writeFileSync(join(bin, I.version), version + '\n');
  return msg('initVendored', { version, path: I.bin });
}

// The shallowest folder whose index.md declares okf_version.
function findBundle(root) {
  const queue = [[root, 0]];
  while (queue.length) {
    const [dir, depth] = queue.shift();
    const index = join(dir, config.okf.index);
    if (existsSync(index)) {
      const doc = parseDoc(readFileSync(index, 'utf8'));
      if (doc.fm && I.okfMarker in doc.fm) return dir;
    }
    if (depth >= I.searchDepth) continue;
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (!name.startsWith('.') && statSync(p).isDirectory()) queue.push([p, depth + 1]);
    }
  }
  return null;
}

// Adds keys the settings file lacks; never changes a key the project already set.
function mergeSettings(target, wanted, path, out) {
  let changed = false;
  for (const [key, value] of Object.entries(wanted)) {
    const at = [...path, key].join('.');
    if (!(key in target)) { target[key] = value; changed = true; out.push(msg('initAdded', { what: at, path: I.settings })); }
    else if (isMap(target[key]) && isMap(value)) changed = mergeSettings(target[key], value, [...path, key], out) || changed;
    else if (JSON.stringify(target[key]) !== JSON.stringify(value)) out.push(msg('initSettingKept', { key: at, path: I.settings, value: JSON.stringify(target[key]) }));
  }
  return changed;
}

function leftovers(root) {
  const out = [];
  for (const name of readdirSync(root).sort()) {
    if (name.startsWith('.') && !I.knownDirs.includes(name) && statSync(join(root, name)).isDirectory()) out.push(msg('initLeftoverDir', { path: name }));
  }
  const counts = new Map();
  const log = tryGit(root, 'log', '-n', String(I.trailerDepth), '--format=%(trailers:only,unfold)%x1e') ?? '';
  for (const rec of log.split('\x1e')) {
    for (const key of new Set(rec.split('\n').map((l) => l.match(/^([\w-]+):/)?.[1]).filter(Boolean))) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const known = I.knownTrailers.map((k) => k.toLowerCase());
  for (const [key, count] of [...counts].sort()) if (!known.includes(key.toLowerCase())) out.push(msg('initLeftoverTrailer', { key, count }));
  return out;
}


export const commands = {
  init(args, { cwd }) {
    const flags = parseFlags(args, config.commands.find((c) => c.name === 'init').flags);
    const root = projectRoot(cwd);
    const version = pluginVersion(root);
    let bundle = flags.bundle ?? DEFAULTS.docs.bundle;
    let adopted = null;
    const report = [];
    if (flags.adopt) {
      const found = findBundle(root);
      if (!found) throw new UsageError(msg('initNoBundle', {}));
      bundle = relPath(root, found);
      adopted = git(root, 'rev-parse', 'HEAD');
    }
    const name = flags.name ?? basename(root);
    const base = flags.base ?? tryGit(root, 'symbolic-ref', '--short', 'HEAD') ?? DEFAULTS.base;
    const text = { name, bundle, date: new Date().toISOString().slice(0, 10) };
    const json = {
      name: JSON.stringify(name),
      base: JSON.stringify(base),
      bundle: JSON.stringify(bundle),
      quick: I.quick.map((q) => JSON.stringify(render(q, { bundle }))).join(', '),
      extra: adopted ? [{ key: 'adopted', value: JSON.stringify(adopted) }] : [],
    };

    let kept = 0;
    for (const f of I.files) {
      if (flags.adopt && f.bundle) continue;
      const to = render(f.to, { bundle });
      const abs = join(root, to);
      if (existsSync(abs) && !flags.overwrite.includes(to)) {
        report.push(msg('initKept', { path: to }));
        kept++;
        continue;
      }
      const out = renderFile(f.template, f.template.endsWith('.json') ? json : text, { root, pluginDir: PLUGIN_DIR });
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, out);
      report.push(msg('initWrote', { path: to }));
    }

    const ignore = join(root, I.gitignore);
    const have = existsSync(ignore) ? readFileSync(ignore, 'utf8') : '';
    const missing = I.ignoreLines.filter((l) => !have.split('\n').includes(l));
    if (missing.length) {
      writeFileSync(ignore, have + (have && !have.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n');
      report.push(msg('initAdded', { what: missing.join(' '), path: I.gitignore }));
    }

    const settingsFile = join(root, I.settings);
    const settings = existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, 'utf8')) : {};
    if (mergeSettings(settings, I.settingsKeys, [], report)) {
      mkdirSync(dirname(settingsFile), { recursive: true });
      writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
    }

    report.push(vendor(root, version));
    if (flags.adopt) {
      const findings = checkBundle(join(root, bundle), { base: root });
      report.push(msg('initAdopted', { bundle, commit: adopted }));
      const count = (level) => findings.filter((f) => f.level === level).length;
      report.push(msg('initFindings', { errors: count('error'), warnings: count('warning'), bundle }));
      report.push(...leftovers(root));
    }
    return done(report.join(''), kept ? config.exit.blocked : config.exit.ok);
  },

  // Replaces the pinned CLI with the installed plugin's, and nothing else; never with an older one by accident.
  upgrade(args, { cwd }) {
    const root = projectRoot(cwd);
    const version = pluginVersion(root);
    const pinned = existsSync(join(root, I.bin, I.version)) ? readFileSync(join(root, I.bin, I.version), 'utf8').trim() : '';
    const flags = parseFlags(args, config.commands.find((c) => c.name === 'upgrade').flags);
    if (pinned.localeCompare(version, 'en', { numeric: true }) > 0 && !flags.downgrade) throw new UsageError(msg('upgradeOlder', { version, pinned }));
    // A release, not work in progress: a plugin checkout must have nothing uncommitted under the plugin folder.
    const tracked = tryGit(PLUGIN_DIR, 'ls-files', '--error-unmatch', I.manifest) !== null;
    if (tracked && tryGit(PLUGIN_DIR, 'status', '--porcelain', '--', '.') !== '' && !flags.dirty) throw new UsageError(msg('upgradeDirty', { path: PLUGIN_DIR }));
    return done(vendor(root, version));
  },
};
