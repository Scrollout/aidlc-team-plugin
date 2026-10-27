// The plugin's diagrams, drawn from the data the CLI enforces (docs/design/diagrams/). `node tests/diagrams.mjs` rewrites
// them; tests/diagrams.test.mjs fails on any difference (DOC-DIAGRAM).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../plugin/cli/lib/index.mjs';

export const DIR = join(import.meta.dirname, '..', 'docs/design/diagrams');
const V = config.vocabulary, S = config.state;
const page = (title, description, body) => `---\ntype: Design\ntitle: ${title}\ndescription: ${description}\nstatus: stable\ngenerated: { by: tests/diagrams.mjs }\n---\n\n${body}`;
const mermaid = (lines) => ['```mermaid', ...lines, '```', ''].join('\n');
const id = (text) => text.replace(/[^A-Za-z0-9]/g, '_');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`), ''].join('\n');

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

export const pages = () => ({
  'canonical-model.md': page('Words by scale', 'The canonical words, one per concept, grouped by the scale they name; drawn from the vocabulary in cli.json.',
    mermaid(['flowchart LR', ...Object.entries(Object.groupBy(V.words, (w) => w.scale)).flatMap(([scale, words]) => [`  subgraph ${id(scale)}["${scale}"]`, ...words.map((w) => `    ${id(`${scale}_${w.word}`)}["${w.word}"]`), '  end'])])),
  'workflow.md': page('Workflow', 'The pathways into an approved intent with the steps each requires, then a bolt from approval to merge and an intent from merge to release; drawn from the pathways and state transitions in cli.json.',
    mermaid(['flowchart LR', '  subgraph Inception',
      ...Object.entries(config.inception.pathways).map(([name, steps]) => `    ${[name, ...steps, 'approved'].map((x) => (x === name ? `${id(name)}([${name}])` : id(x))).join(' --> ')}`),
      '  end', '  subgraph Construction', ...path(S.transitions, 'approved', 'merged').map(([a, b, why]) => `    b_${a}[${a}] -->|${why}| b_${b}[${b}]`), '  end',
      '  subgraph Operations', ...path(S.intentTransitions, 'merged', 'checked').concat(path(S.intentTransitions, 'checked', 'released')).map(([a, b, why]) => `    i_${a}[${a}] -->|${why}| i_${b}[${b}]`), '  end',
      '  approved --> b_approved', '  b_merged --> i_merged'])),
  'bolt-states.md': page('Bolt states', "A bolt's derived states and what moves it between them; drawn from state.transitions in cli.json.", states(S.transitions)),
  'intent-states.md': page('Intent states', "An intent's derived states, from approval to release; drawn from state.intentTransitions in cli.json.", states(S.intentTransitions)),
  'kinds.md': page('Kinds and layers', 'What each module kind may depend on, and the layers inside a domain pointing inward; drawn from vocabulary.kindRules and layerRules in cli.json.',
    table(['from \\ to', ...V.kinds], V.kinds.map((a) => [a, ...V.kinds.map((b) => (V.kindRules[a].includes(b) ? 'yes' : V.kindRules[a].includes(`${b}:surface`) ? 'surface' : ''))])) + '\n'
    + mermaid(['flowchart LR', ...Object.entries(V.layerRules).flatMap(([a, bs]) => bs.map((b) => `  ${a} --> ${b}`))])),
  'bundle-types.md': page('Bundle types', "The bundle's doc types, the folder each lives in and the keys its schema requires; drawn from the bundle settings in cli.json.",
    table(['Type', 'Folder', 'Required keys'], [['Intent', config.grid.intents], ['Requirement', config.grid.requirements], ['Decision', config.grid.decisions], ...Object.entries(config.okf.bundle.folders)]
      .map(([type, folder]) => [type, `\`${folder}/\``, (config.okf.bundle.schemas[type]?.required ?? []).map((k) => `\`${k}\``).join(', ') || '-']))),
  'naming-grammar.md': page('Naming grammar', 'Each kind of name, the template it is composed from and the tokens it needs; drawn from naming.grammar in cli.json.',
    table(['Kind', 'Template', 'Needs'], Object.entries(config.naming.grammar).map(([k, g]) => [k, `\`${g.template}\``, g.needs.join(', ')]))),
  'gate-checks.md': page('Gate checks', 'The codes the merge gate can refuse with, as cli.json declares them, each with its fix.',
    table(['Code', 'Fix'], Object.entries(config.gate.codes).map(([code, c]) => [`\`${code}\``, c.fix.replace(/\|/g, '\\|')]))),
});

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  mkdirSync(DIR, { recursive: true });
  for (const [name, text] of Object.entries(pages())) writeFileSync(join(DIR, name), text);
}
