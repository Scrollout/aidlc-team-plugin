// The canonical words' kinds and the method's versions (docs/design/canonical-model.md).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, done, packageFile, shippedDir, UsageError } from '../foundation/data.mjs';
import { msg } from '../foundation/text.mjs';

const V = config.vocabulary;

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

// A role persona and its knowledge, as the lead reads them before an elaborate step (decision 0019).
export const commands = {
  persona([role], { cwd }) {
    const ext = config.okf.ext, dir = shippedDir('personas'), file = packageFile(cwd, 'personas', role + ext);
    if (!role || !existsSync(file)) throw new UsageError(msg('personaUsage', { roles: readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)).join(', ') }));
    const knowledge = existsSync(join(dir, role)) ? readdirSync(join(dir, role)).sort().map((f) => join(dir, role, f)) : [];
    return done(readFileSync(file, 'utf8') + msg('personaKnowledge', { files: knowledge.map((f) => `- ${f.slice(cwd.length + 1) || f}`).join('\n') }));
  },
};
