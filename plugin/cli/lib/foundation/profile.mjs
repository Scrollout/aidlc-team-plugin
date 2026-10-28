// Profile loader: reads the rule layers named in cli.json and merges them (docs/design/profile.md).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CLI_DIR, config, isMap, posix, readJson } from './data.mjs';
import { msg } from './text.mjs';

export class ProfileError extends Error {}

const UNION = config.unionKey;
const fail = (key, data) => new ProfileError(msg(key, { union: UNION, ...data }));

function hasUnion(v) {
  if (!isMap(v)) return false;
  return Object.entries(v).some(([k, x]) => k === UNION || hasUnion(x));
}

// Merges `next` over `base`. Later wins, except that union-key arrays (`deny`) are unions and cannot be removed,
// and a `replaceKeys` object (`levels`) replaces the earlier one whole.
function mergeLayer(base, next, layer, path = []) {
  const out = { ...base };
  for (const [key, value] of Object.entries(next)) {
    const at = [...path, key].join('.');
    const prev = out[key];
    if (key === UNION) {
      if (!Array.isArray(value)) throw fail('unionNotList', { layer, key: at });
      const union = Array.isArray(prev) ? [...prev] : [];
      for (const v of value) if (!union.some((u) => JSON.stringify(u) === JSON.stringify(v))) union.push(v);
      out[key] = union;
    } else if (config.replaceKeys.includes(key) && isMap(value)) {
      out[key] = value;
    } else if (isMap(prev) && isMap(value)) {
      out[key] = mergeLayer(prev, value, layer, [...path, key]);
    } else if (hasUnion(prev)) {
      throw fail('unionReplaced', { layer, key: at });
    } else out[key] = value;
  }
  return out;
}

// layers: [{ name, data }] in merge order.
export const mergeLayers = (layers) => layers.reduce((acc, l) => mergeLayer(acc, l.data, l.name), {});

function readLayer(file) {
  if (!existsSync(file)) return null;
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw fail('invalidJson', { file: posix(file), error: e.message });
  }
  if (!isMap(data)) throw fail('notObject', { file: posix(file) });
  return data;
}

function layerFiles(root, cliDir = CLI_DIR) {
  return config.layers.map((l) => ({ name: l.name, path: l.path, from: l.from, file: join(l.from === 'cli' ? cliDir : root, l.path) }));
}

// A profile gate stage's problem, or null: it needs an id and a command, cannot replace a core stage, runs from the
// trial merge on and fails at error or warning (docs/design/lifecycle.md#pipelines); the gate skips one with a problem.
export function stageProblem(s) {
  const G = config.gate, L = config.okf.level;
  if (!s.id || !s.check) return 'stageShape';
  if (G.stages.includes(s.id)) return 'stageCore';
  if (G.stages.indexOf(s.after ?? G.stageAfter) < G.stages.indexOf(G.treeFrom)) return 'stageAfter';
  return [undefined, L.error, L.warning].includes(s.level) ? null : 'stageLevel';
}

// The plugin defaults, beside the CLI so a project's pinned copy carries them.
export const DEFAULTS = readJson(join(CLI_DIR, config.layers.find((l) => l.from === 'cli').path));
export const withDefaults = (profile = {}) => mergeLayer(DEFAULTS, profile, config.text.defaultsLayer);

// Returns the merged profile, the layers that were found and the project rule files.
export function loadProfile(root, { cliDir = CLI_DIR } = {}) {
  const layers = [];
  for (const l of layerFiles(root, cliDir)) {
    const data = readLayer(l.file);
    if (data) layers.push({ ...l, data });
  }
  const rulesDir = join(root, config.rules.dir);
  const rules = existsSync(rulesDir)
    ? readdirSync(rulesDir).filter((f) => f.endsWith(config.rules.ext)).sort().map((f) => join(rulesDir, f))
    : [];
  return { profile: mergeLayers(layers), layers: layers.map((l) => l.name), rules, sources: layers.filter((l) => l.from !== 'cli') };
}
