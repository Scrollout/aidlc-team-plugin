// M26 B238: no hard-coded data in projects. VALUE-LITERAL at the merge gate reads the string literals a bolt adds to
// source files, by the stack pack's syntax, outside tests and the project's data (docs/design/values.md#in-projects).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seam } from '../plugin/cli/lib/index.mjs';
import { valueFindings } from '../plugin/cli/extensions/stacks/index.mjs';
import { makeRepo } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const added = (file, ...texts) => texts.map((text, k) => ({ file, line: k + 1, text }));
const values = (fs) => fs.map((f) => `${f.path}:${f.line} ${f.data.value}`);

test('B238/AC-2 a string literal on an added line of a Go source file is VALUE-LITERAL; imports, tags, format verbs, tests and data are not', () => {
  const dir = makeRepo({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n' });
  const profile = { values: { data: ['internal/config/**'] } };
  const lines = [
    ...added('internal/orders/place.go', 'import "fmt"', '\t"example.com/shop/internal/model"', 'type Order struct { ID string `json:"id"` }', 'return fmt.Errorf("%w: %d", err, n)', 'if region == "eu-west" {', '// "a comment"'),
    ...added('internal/orders/place_test.go', 'want := "a test value"'),
    ...added('internal/config/values.go', 'const Region = "eu-west"'),
  ];
  assert.deepEqual(values(valueFindings(dir, profile, [], lines)), ['internal/orders/place.go:5 eu-west']);
  assert.deepEqual(values(valueFindings(dir, { values: { allow: ['^eu-'] } }, [], added('internal/orders/place.go', 'if region == "eu-west" {'))), [], 'values.allow lists protocol');
});

test('B238/AC-2 the TypeScript pack names its literals; a project without a pack or a literal pattern has no check; the gate passes the added lines', () => {
  const dir = makeRepo({ 'tsconfig.json': '{}' });
  const lines = added('src/orders/place.ts', "import { x } from './model';", "const msg = 'Order placed';", 'const key = `orders`;');
  assert.deepEqual(values(valueFindings(dir, {}, [], lines)), ['src/orders/place.ts:2 Order placed', 'src/orders/place.ts:3 orders']);
  assert.deepEqual(valueFindings(makeRepo({}), {}, [], lines), [], 'no pack, no syntax to read');
  const gate = seam('gateChecks', {}).flatMap((check) => check(dir, {}, ['src/orders/place.ts'], lines)).filter((f) => f.code === 'VALUE-LITERAL');
  assert.deepEqual(gate.map((f) => f.line), [2, 3]);
});

test('B238/AC-1 the project constitution holds the rule, the builder keeps values in data and the reviewer reports a literal', () => {
  assert.match(readFileSync(join(ROOT, 'plugin/templates/bundle/constitution.md'), 'utf8'), /\*\*Values in data\.\*\*.*Checked by `VALUE-LITERAL`/);
  assert.match(readFileSync(join(ROOT, 'plugin/agents/builder.md'), 'utf8'), /values\.data/);
  assert.match(readFileSync(join(ROOT, 'plugin/agents/reviewer.md'), 'utf8'), /values\.data/);
});
