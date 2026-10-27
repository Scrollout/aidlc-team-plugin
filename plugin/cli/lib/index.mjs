// The library's public entry: loads the core, whose domains plug their rules into its seams, and exports the
// functions other tools and the tests use (docs/design/library.md#library-entry).
export { config, list, readJson } from './foundation/data.mjs';
export { git, tryGit } from './foundation/git.mjs';
export { msg, render } from './foundation/text.mjs';
export { loadProfile, withDefaults } from './foundation/profile.mjs';
export { globRegex, inside, overlaps } from './foundation/glob.mjs';
export { parseYaml } from './foundation/yaml.mjs';
export { plug, seam } from './foundation/seams.mjs';
export { aidlcDir, runtimeFile, writeJson } from './foundation/store.mjs';
export { buildIndexes, checkBundle, docSlug, hashDoc, parseDoc, sectionOf, writeIndexes } from './domains/bundle.mjs';
export { glossary, withBlock } from './domains/method.mjs';
export { computeLane, inForce, incrementLines, lintPlan, methodOf, readPlan } from './domains/plan.mjs';
export { lintInception, questionsOf } from './domains/inception.mjs';
export { bindingName, bindingOf, hatchesOf, traceOf } from './domains/construction.mjs';
export { approval, branchOf, readState } from './domains/flow.mjs';
export { boundaryFindings, graphOf, kindFindings, layerFindings, moduleFindings, reachFindings } from './domains/architecture.mjs';
export { generatedRules, nameOf, registry } from './domains/naming.mjs';
