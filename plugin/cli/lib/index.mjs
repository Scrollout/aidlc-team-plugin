// The library's public entry: loads the core, whose domains plug their rules into its seams, and exports the
// functions other tools and the tests use (docs/design/library.md#library-entry).
export { at, bundleOf, CLI_DIR, config, done, fieldPaths, idOf, isMap, list, packageFile, PLUGIN_DIR, posix, readJson, relPath, shippedDir, UsageError, VERDICT } from './foundation/data.mjs';
export { branchSha, git, gitLines, sh, tryGit } from './foundation/git.mjs';
export { msg, render } from './foundation/text.mjs';
export { loadProfile, withDefaults } from './foundation/profile.mjs';
export { globRegex, inside, overlaps } from './foundation/glob.mjs';
export { parseYaml } from './foundation/yaml.mjs';
export { plug, seam } from './foundation/seams.mjs';
export { aidlcDir, bump, ciFile, runtimeFile, statsFile, writeJson } from './foundation/store.mjs';
export { buildIndexes, checkBundle, docSlug, hashDoc, parseDoc, sectionOf, writeIndexes } from './domains/bundle.mjs';
export { computeLane, inForce, incrementLines, lintPlan, methodOf, readPlan } from './domains/plan.mjs';
export { lintInception, questionsOf } from './domains/inception.mjs';
export { bindingName, bindingOf, hatchesOf, hatchLine, traceOf } from './domains/construction.mjs';
export { ciGreen, decisionsOf, readState } from './domains/flow.mjs';
export { branchOf, unitPaths } from './foundation/store.mjs';
export { approval, events } from './domains/approval.mjs';
export { boundaryFindings, graphOf, kindFindings, layerFindings, moduleFindings, reachFindings } from './domains/architecture.mjs';
export { domainForms, generatedRules, nameOf, registry } from './domains/naming.mjs';
export { templateFile } from './domains/card.mjs';
