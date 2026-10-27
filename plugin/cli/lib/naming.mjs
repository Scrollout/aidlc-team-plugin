// The naming registry: tokens, domains, closed vocabularies and banned words, from the CLI's defaults under the
// profile's own, and the domain docs' codes (docs/design/naming.md).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, isMap } from './config.mjs';

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
