// The plugin's diagrams, drawn from the data the CLI enforces (docs/design/diagrams/). `node tests/diagrams.mjs` rewrites
// them; tests/diagrams.test.mjs fails on any difference (DOC-DIAGRAM).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../plugin/cli/lib/index.mjs';

export const DIR = join(import.meta.dirname, '..', 'docs/design/diagrams');
const V = config.vocabulary, S = config.state;
const page = (title, description, body) => `---\ntype: Design\ntitle: ${title}\ndescription: ${description}\nstatus: stable\ngenerated: { by: tests/diagrams.mjs }\n---\n\n${body}`;
const mermaid = (lines) => ['```mermaid', ...lines, '```', ''].join('\n');
const id = (text) => text.replace(/[^A-Za-z0-9]/g, '_');
const mdTable = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`), ''].join('\n');

// The CLI's files and each static relative import between them, file to file (the self-check reads the same graph).
const CLI = 'plugin/cli', ROOT = join(import.meta.dirname, '..');
export const cliFiles = () => readdirSync(join(ROOT, CLI), { recursive: true }).filter((f) => f.endsWith('.mjs')).map((f) => `${CLI}/${f}`);
export const cliEdges = () => cliFiles().flatMap((f) => [...readFileSync(join(ROOT, f), 'utf8').matchAll(/^(?:import|export) .* from '(\.[^']+)';$/gm)]
  .map((m) => [f, relative(ROOT, join(ROOT, dirname(f), m[1])).split('\\').join('/')]));
// Each file's part in the C4 component view: its layer, and its name (an extension is its folder).
const partOf = (f) => (f.includes('/extensions/') ? ['extensions', f.split('/')[3]] : f.includes('/lib/foundation/') ? ['foundation', basename(f, '.mjs')]
  : f.includes('/lib/domains/') ? ['domains', basename(f, '.mjs')] : f.endsWith('/lib/index.mjs') ? ['entry', 'index'] : ['runtime', basename(f, '.mjs')]);
function components() {
  const parts = Object.groupBy([...new Set(cliFiles().map((f) => partOf(f).join(':')))].map((x) => x.split(':')), ([layer]) => layer);
  const links = [...new Set(cliEdges().map(([a, b]) => [partOf(a)[0], partOf(b)[0]]).filter(([a, b]) => a !== b).map((e) => e.join(' --> ')))].sort();
  return mermaid(['flowchart TB', ...['runtime', 'extensions', 'entry', 'domains', 'foundation'].flatMap((layer) => [`  subgraph ${layer}`, `    ${(parts[layer] ?? []).map(([, n]) => `${layer}_${id(n)}[${n}]`).join('\n    ')}`, '  end']), ...links.map((l) => `  ${l}`)]);
}

// The code tables, each on its page.
export const CODES = [['bundle', 'Docs check codes', 'okf', 'the docs check'], ['plan', 'Plan lint codes', 'grid', 'plan lint'], ['gate', 'Gate codes', 'gate', 'the merge gate'], ['hooks', 'Hook codes', 'hooks', 'the hooks']];
// A code two checks share is documented where it first appears.
const firstPage = (code, table) => CODES.find(([, , t]) => code in config[t].codes)[2] === table;
const codeTable = (table) => mdTable(['Code', 'Fix'], Object.entries(config[table].codes).filter(([code]) => firstPage(code, table)).map(([code, c]) => [`\`${code}\`${c.level && c.level !== 'error' ? ` (${c.level})` : ''}`, c.fix.replace(/\|/g, '\\|')]));
// A state diagram: each transition with its cause, and every state nothing leaves as an end.
const states = (rows) => mermaid(['stateDiagram-v2', '  direction LR', `  [*] --> ${rows[0][0]}`, ...rows.map(([a, b, why]) => `  ${a} --> ${b}: ${why}`),
  ...[...new Set(rows.map((r) => r[1]))].filter((x) => !rows.some((r) => r[0] === x)).map((x) => `  ${x} --> [*]`)]);
// The shortest run of transitions from one state to another.
function path(rows, from, to) {
  const seen = new Map([[from, []]]), queue = [from];
  while (queue.length) {
    const at = queue.shift();
    for (const r of rows.filter((x) => x[0] === at && !seen.has(x[1]))) { seen.set(r[1], [...seen.get(at), r]); queue.push(r[1]); }
  }
  return seen.get(to) ?? [];
}

// The workflow, also drawn in the README.
export const workflow = () => mermaid(['flowchart LR', '  subgraph Inception',
      ...Object.entries(config.inception.pathways).map(([name, steps]) => `    ${[name, ...steps, 'approved'].map((x) => (x === name ? `${id(name)}([${name}])` : id(x))).join(' --> ')}`),
      '  end', '  subgraph Construction', ...path(S.transitions, 'approved', 'merged').map(([a, b, why]) => `    b_${a}[${a}] -->|${why}| b_${b}[${b}]`), '  end',
      '  subgraph Operations', ...path(S.intentTransitions, 'merged', 'checked').concat(path(S.intentTransitions, 'checked', 'released')).map(([a, b, why]) => `    i_${a}[${a}] -->|${why}| i_${b}[${b}]`), '  end',
      '  approved --> b_approved', '  b_merged --> i_merged']);

export const pages = () => ({
  'canonical-model.md': page('Words by scale', 'The canonical words, one per concept, grouped by the scale they name; drawn from the vocabulary in cli.json.',
    mermaid(['flowchart LR', ...Object.entries(Object.groupBy(V.words, (w) => w.scale)).flatMap(([scale, words]) => [`  subgraph ${id(scale)}["${scale}"]`, ...words.map((w) => `    ${id(`${scale}_${w.word}`)}["${w.word}"]`), '  end'])])),
  'workflow.md': page('Workflow', 'The pathways into an approved intent with the steps each requires, then a bolt from approval to merge and an intent from merge to release; drawn from the pathways and state transitions in cli.json.',
    workflow()),
  'cli-components.md': page('CLI components', "A C4 component view of the CLI, with its runtime, extensions, public entry, domains and foundation kits, and which uses which; drawn from the CLI's own imports.", components()),
  'bolt-states.md': page('Bolt states', "A bolt's derived states and what moves it between them; drawn from state.transitions in cli.json.", states(S.transitions)),
  'intent-states.md': page('Intent states', "An intent's derived states, from approval to release; drawn from state.intentTransitions in cli.json.", states(S.intentTransitions)),
  'kinds.md': page('Kinds and layers', 'What each module kind may depend on, and the layers inside a domain pointing inward; drawn from vocabulary.kindRules and layerRules in cli.json.',
    mdTable(['from \\ to', ...V.kinds], V.kinds.map((a) => [a, ...V.kinds.map((b) => (V.kindRules[a].includes(b) ? 'yes' : V.kindRules[a].includes(`${b}:surface`) ? 'surface' : ''))])) + '\n'
    + mermaid(['flowchart LR', ...Object.entries(V.layerRules).flatMap(([a, bs]) => bs.map((b) => `  ${a} --> ${b}`))])),
  'bundle-types.md': page('Bundle types', "The bundle's doc types, the folder each lives in and the keys its schema requires; drawn from the bundle settings in cli.json.",
    mdTable(['Type', 'Folder', 'Required keys'], [['Intent', config.grid.intents], ['Requirement', config.grid.requirements], ['Decision', config.grid.decisions], ...Object.entries(config.okf.bundle.folders)]
      .map(([type, folder]) => [type, `\`${folder}/\``, (config.okf.bundle.schemas[type]?.required ?? []).map((k) => `\`${k}\``).join(', ') || '-']))),
  'naming-grammar.md': page('Naming grammar', 'Each kind of name, the template it is composed from and the tokens it needs; drawn from naming.grammar in cli.json.',
    mdTable(['Kind', 'Template', 'Needs'], Object.entries(config.naming.grammar).map(([k, g]) => [k, `\`${g.template}\``, g.needs.join(', ')]))),
  // Every check code, each on exactly one page, with its level and fix (DOC-CODE).
  ...Object.fromEntries(CODES.map(([name, title, table, who]) => [`codes-${name}.md`, page(title, `Every code ${who} reports, with its fix (a warning is marked); drawn from ${table}.codes in cli.json and the extensions' data.`,
    codeTable(table))])),
});

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  mkdirSync(DIR, { recursive: true });
  for (const [name, text] of Object.entries(pages())) writeFileSync(join(DIR, name), text);
  const readme = join(ROOT, 'README.md'), [head, rest] = readFileSync(readme, 'utf8').split('<!-- generated: workflow -->\n');
  writeFileSync(readme, `${head}<!-- generated: workflow -->\n${workflow()}<!-- /generated -->${rest.split('<!-- /generated -->')[1]}`);
}
