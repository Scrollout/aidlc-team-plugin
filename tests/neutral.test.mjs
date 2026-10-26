// U136: the public docs name no vendor or product; only what the plugin calls (Claude Code, GitHub and its Actions and Dependabot, git, Node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const NAMES = /\b(AWS|Amazon|awslabs|Azure|Google[A-Za-z]*|Microsoft|Kubernetes|SPIFFE|knowledge-catalog|Argo ?CD|Playwright|Keycloak|Kiro|Cursor|Windsurf|Copilot|Trivy|Semgrep|Gitleaks|Snyk)\b/;
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : join(dir, f)));

test('U136/AC-1 the docs, README and templates name no vendor or product, source URLs included', () => {
  const files = [join(ROOT, 'README.md'), join(ROOT, 'AGENTS.md'), ...walk(join(ROOT, 'docs')), ...walk(join(ROOT, 'plugin'))].filter((f) => /\.(md|json)$/.test(f));
  const hits = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').map((line, k) => [k + 1, line]).filter(([, l]) => NAMES.test(l)).map(([k, l]) => `${f.slice(ROOT.length + 1)}:${k}: ${l.trim().slice(0, 80)}`));
  assert.deepEqual(hits, []);
});
