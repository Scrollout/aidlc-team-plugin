// The canonical words, and the generated blocks drawn from them (docs/design/canonical-model.md).
import { config } from '../foundation/data.mjs';
import { render } from '../foundation/text.mjs';

const V = config.vocabulary;
const BLOCK = (name) => new RegExp(`(<!-- generated: ${name} -->\\n)[\\s\\S]*?(<!-- /generated -->)`);

// The glossary table: every word with its scale and AI-DLC term, then the retired words and what replaces them.
export function glossary() {
  const rows = V.words.map((w) => render(V.row, w));
  const retired = render(V.retiredLine, { list: V.retired.map((r) => render(V.retiredItem, r)).join('; ') });
  return [V.heading, ...rows, '', retired].join('\n');
}

// A doc with its generated block rewritten; null when the doc holds no such block.
export function withBlock(text, name, body) {
  return BLOCK(name).test(text) ? text.replace(BLOCK(name), (_, open, close) => `${open}${body}\n${close}`) : null;
}

// What a profile gets wrong about kinds, surfaces and the system, as [message key, data] pairs (docs/design/architecture-model.md).
export function kindProblems(profile) {
  const show = (xs) => xs.join(', ');
  const out = [];
  for (const m of profile.modules ?? []) {
    const module = m.id ?? m.name;
    if (!m.kind) out.push(['kindMissing', { module, kinds: show(V.kinds) }]);
    else if (!V.kinds.includes(m.kind)) out.push(['kindUnknown', { module, kind: m.kind, kinds: show(V.kinds) }]);
    for (const surface of Object.keys(m.surfaces ?? {}).filter((s) => !V.surfaces.includes(s))) out.push(['surfaceUnknown', { module, surface, surfaces: show(V.surfaces) }]);
  }
  const system = profile.system;
  if (system !== undefined) for (const key of Object.keys(system ?? { system: 1 }).filter((k) => !V.systemKeys.includes(k) || !Array.isArray(system[k]))) out.push(['systemShape', { key }]);
  return out;
}

// The kind a module most likely has, from its id and paths: the first hint that matches, else domain.
export const proposeKind = (m) => V.kindHints.find((h) => [m.id ?? m.name, ...(m.paths ?? [])].some((p) => new RegExp(h.match).test(String(p))))?.kind ?? 'domain';
