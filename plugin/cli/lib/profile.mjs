// Profile loader: reads the rule layers and merges them (docs/design/profile.md).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export class ProfileError extends Error {}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function hasDeny(v) {
  if (!isObject(v)) return false;
  return Object.entries(v).some(([k, x]) => k === 'deny' || hasDeny(x));
}

// Merges `next` over `base`. Later wins, except that `deny` arrays are unions and cannot be removed.
export function mergeLayer(base, next, layer = 'layer', path = []) {
  const out = { ...base };
  for (const [key, value] of Object.entries(next)) {
    const at = [...path, key].join('.');
    const prev = out[key];
    if (key === 'deny') {
      if (!Array.isArray(value)) throw new ProfileError(`${layer}: ${at} must be a list; a deny from an earlier layer cannot be removed`);
      const union = Array.isArray(prev) ? [...prev] : [];
      for (const v of value) if (!union.some((u) => JSON.stringify(u) === JSON.stringify(v))) union.push(v);
      out[key] = union;
    } else if (isObject(prev) && isObject(value)) {
      out[key] = mergeLayer(prev, value, layer, [...path, key]);
    } else if (hasDeny(prev)) {
      throw new ProfileError(`${layer}: ${at} replaces an object holding a deny from an earlier layer`);
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
    throw new ProfileError(`${file}: invalid JSON: ${e.message}`);
  }
  if (!isObject(data)) throw new ProfileError(`${file}: must be a JSON object`);
  return data;
}

export function layerFiles(root, pluginDir = PLUGIN_DIR) {
  return [
    { name: 'plugin', file: join(pluginDir, 'templates', 'defaults.json') },
    { name: 'project', file: join(root, '.aidlc', 'profile.json') },
    { name: 'personal', file: join(root, '.aidlc', 'local', 'profile.json') },
  ];
}

// Returns the merged profile, the layers that were found and the project rule files.
export function loadProfile(root, { pluginDir = PLUGIN_DIR } = {}) {
  const layers = [];
  for (const l of layerFiles(root, pluginDir)) {
    const data = readLayer(l.file);
    if (data) layers.push({ ...l, data });
  }
  const rulesDir = join(root, '.aidlc', 'rules');
  const rules = existsSync(rulesDir)
    ? readdirSync(rulesDir).filter((f) => f.endsWith('.md')).sort().map((f) => join(rulesDir, f))
    : [];
  return { profile: mergeLayers(layers), layers: layers.map((l) => l.name), rules };
}
