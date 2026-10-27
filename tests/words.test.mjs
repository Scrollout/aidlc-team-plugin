// M20 B193: the old words are gone from what the plugin ships (docs/design/canonical-model.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../plugin/cli/lib/index.mjs';

const ROOT = join(import.meta.dirname, '..');
const files = (dir) => readdirSync(join(ROOT, dir), { recursive: true }).filter((f) => f.endsWith('.md')).map((f) => [`${dir}/${f}`, readFileSync(join(ROOT, dir, f), 'utf8')]);
// What may stay: template variables, unit as a test level, the v1 aliases (units/, unit/, U-<n>), code and quoted words.
const KEPT = /\{\{[^}]*\}\}|\bunits?\/|\bunit=|\bunit and e2e\b|\bunit tests?\b|\(unit\)|\bunit\b(?= level)|U-<n>|`[^`]*`|"[^"]*"|\bC4 components? (view|level)\b/g;
// A slice is a vertical slice now (decision 0024); its retired senses read as other words. 0023's internal layer is a horizontal layer.
const RETIRED = /\b(units?|components?|internal layers?)\b/gi;
const found = ([where, text]) => [...text.replace(KEPT, '').matchAll(RETIRED)].map((m) => `${where}: ${m[0]}`);

test('B193/AC-1 B244/AC-2 no retired word in its old sense in the messages, fixes, usage, skill, agents or templates', () => {
  const tables = ['okf', 'grid', 'gate', 'hooks'].flatMap((t) => Object.entries(config[t].codes).map(([code, c]) => [code, c.fix]));
  const commands = config.commands.flatMap((c) => [[c.name, c.usage], [c.name, c.does]]);
  const shipped = [...Object.entries(config.messages), ...tables, ...commands, ...files('plugin/skills'), ...files('plugin/agents'), ...files('plugin/templates'), ...files('plugin/personas')];
  assert.deepEqual(shipped.flatMap(found), []);
});
