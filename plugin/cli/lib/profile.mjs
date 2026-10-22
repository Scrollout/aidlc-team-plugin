// Profile loader: reads the rule layers named in cli.json and merges them (docs/design/profile.md).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config, PLUGIN_DIR } from './config.mjs';
import { msg } from './template.mjs';

export class ProfileError extends Error {}

const UNION = config.unionKey;
const fail = (key, data) => new ProfileError(msg(key, { union: UNION, ...data }));
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function hasUnion(v) {
  if (!isObject(v)) return false;
  return Object.entries(v).some(([k, x]) => k === UNION || hasUnion(x));
}

// Merges `next` over `base`. Later wins, except that union-key arrays (`deny`) are unions and cannot be removed.
export function mergeLayer(base, next, layer, path = []) {
  const out = { ...base };
  for (const [key, value] of Object.entries(next)) {
    const at = [...path, key].join('.');
    const prev = out[key];
    if (key === UNION) {
      if (!Array.isArray(value)) throw fail('unionNotList', { layer, key: at });
      const union = Array.isArray(prev) ? [...prev] : [];
      for (const v of value) if (!union.some((u) => JSON.stringify(u) === JSON.stringify(v))) union.push(v);
      out[key] = union;
    } else if (isObject(prev) && isObject(value)) {
      out[key] = mergeLayer(prev, value, layer, [...path, key]);
    } else if (hasUnion(prev)) {
      throw fail('unionReplaced', { layer, key: at });
    } else {
      out[key] = value;
    }
  }
  return out;
}

// layers: [{ name, data }] in merge order.
export function mergeLayers(layers) {
  return layers.reduce((acc, l) => mergeLayer(acc, l.data, l.name), {});
}

function readLayer(file) {
  if (!existsSync(file)) return null;
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw fail('invalidJson', { file, error: e.message });
  }
  if (!isObject(data)) throw fail('notObject', { file });
  return data;
}

export function layerFiles(root, pluginDir = PLUGIN_DIR) {
  return config.layers.map((l) => ({ name: l.name, file: join(l.from === 'plugin' ? pluginDir : root, l.path) }));
}

// Returns the merged profile, the layers that were found and the project rule files.
export function loadProfile(root, { pluginDir = PLUGIN_DIR } = {}) {
  const layers = [];
  for (const l of layerFiles(root, pluginDir)) {
    const data = readLayer(l.file);
    if (data) layers.push({ ...l, data });
  }
  const rulesDir = join(root, config.rules.dir);
  const rules = existsSync(rulesDir)
    ? readdirSync(rulesDir).filter((f) => f.endsWith(config.rules.ext)).sort().map((f) => join(rulesDir, f))
    : [];
  return { profile: mergeLayers(layers), layers: layers.map((l) => l.name), rules };
}
