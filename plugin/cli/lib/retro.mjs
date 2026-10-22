// The retro: what fired, escalated and needed the owner during an intent, and at most three changes to propose
// (docs/design/steering.md#3-across-intents-the-retro). Proposals and messages come from cli.json.
import { config, done, readJson, UsageError } from './config.mjs';
import { msg } from './template.mjs';
import { readState, runtimeFile, statsFile, writeJson } from './state.mjs';

const R = config.retro;

export const commands = {
  retro(args, { cwd }) {
    const st = readState(cwd);
    const intent = st.intents.find((i) => i.id === args[0]);
    if (!intent) throw new UsageError(msg('retroUsage', {}));
    const stats = readJson(statsFile(cwd)) ?? {};
    const byCount = (m, min) => Object.entries(m ?? {}).filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const codes = byCount(stats.codes, R.min);
    const reasons = byCount(stats.escalations, 1);

    let out = msg('retroHead', { intent: intent.id, since: stats.since ?? msg('retroNever', {}) });
    out += msg('retroCodes', {}) + (codes.map(([code, count]) => msg('retroCount', { key: code, count })).join('') || msg('retroNone', {}));
    // Each escalation of the intent's units, from the verdicts and reports on disk.
    const escalations = intent.units.flatMap((u) => [
      ...(readJson(runtimeFile(cwd, 'reviews', u.id))?.rounds ?? []).filter((r) => r.verdict === config.state.verdicts[2])
        .map((r) => msg('retroReview', { unit: u.id, focus: r.focus ?? config.state.focus, findings: (r.findings ?? []).length, at: r.at })),
      ...(u.report?.status === config.state.stopped ? [msg('retroStopped', { unit: u.id, reason: String(u.report.stop ?? u.report.summary ?? ''), at: u.report.at })] : []),
    ]);
    const denials = stats.escalations?.[R.reasons.denials];
    if (denials) escalations.push(msg('retroDenials', { count: denials }));
    out += msg('retroEscalations', {}) + (escalations.join('') || msg('retroNone', {}));
    const owner = stats[R.interventions] ?? [];
    out += msg('retroInterventions', {}) + (owner.map((i) => msg('retroIntervention', i)).join('') || msg('retroNone', {}));

    // One proposal per most frequent code or escalation reason, from the first matching entry of the map.
    const proposals = [...codes, ...reasons].slice(0, R.max).map(([key, count]) => {
      const p = R.proposals.find((x) => key.startsWith(x.match)) ?? R.proposals.at(-1);
      return msg('retroProposal', { kind: p.kind, text: msg(p.text, { key, count }) });
    });
    out += msg('retroProposals', {}) + (proposals.join('') || msg('retroNone', {}));
    writeJson(statsFile(cwd), { since: new Date().toISOString() }); // the retro resets the counters
    return done(out + msg('retroReset', {}));
  },
};
