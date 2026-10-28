// A generated project at scale: intents, each with a chain of bolts, for the time budgets (docs/design/overview.md).
import { makeRepo, run } from './state-repo.mjs';

// A v2 project of `intents` intents with `bolts` bolts each, every bolt depending on the one before it.
export function scaleRepo(intents = 200, bolts = 10) {
  const files = {};
  for (let i = 1; i <= intents; i++) {
    files[`docs/intents/I-${i}-area${i}.md`] = `---\ntype: Intent\ntitle: Area ${i}\ndescription: Area ${i} for more regions.\npathway: feature\n---\n\n# Goal\nSell in area ${i}.\n`;
    for (let k = 1; k <= bolts; k++) {
      const n = (i - 1) * bolts + k;
      files[`docs/bolts/B-${n}-step${n}.md`] = `---\ntype: Bolt\ntitle: Step ${n}\ndescription: Step ${n} goal.\nintent: I-${i}\nmodules: [orders]\nscope: ["internal/domains/orders/**"]\n${k > 1 ? `depends: [B-${n - 1}]\n` : ''}---\n\n# Why\nStep ${n}.\n\n# Acceptance criteria\n- AC-1 (unit): step ${n} works.\n`;
    }
  }
  return makeRepo(files, { system: { core: ['internal/**'] }, modules: [{ id: 'orders', kind: 'domain', paths: ['internal/domains/orders/**'] }] });
}

// The median run time of an aidlc command in `dir`, in milliseconds, over `runs` runs.
export function medianMs(dir, args, runs = 3) {
  const times = Array.from({ length: runs }, () => { const start = performance.now(); run(dir, args); return performance.now() - start; }).sort((a, b) => a - b);
  return Math.round(times[Math.floor(runs / 2)]);
}
