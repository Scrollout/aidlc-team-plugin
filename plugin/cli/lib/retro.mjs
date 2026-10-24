// The retro: what fired, escalated and needed the owner during an intent, and at most three changes to propose
// (docs/design/steering.md#3-across-intents-the-retro). Proposals and messages come from cli.json.
import { config, done, readJson, UsageError } from './config.mjs';
import { msg } from './template.mjs';
import { basename } from 'node:path';
import { decisionsOf, events, readState, runtimeFile, statsFile, writeJson } from './state.mjs';

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
    const units = [...intent.units, ...st.units.filter((u) => u.fm.after === intent.id)]; // and the fix units after its release
    const escalations = units.flatMap((u) => [
      ...(readJson(runtimeFile(cwd, 'reviews', u.id))?.rounds ?? []).filter((r) => r.verdict === config.state.verdicts[2])
        .map((r) => msg('retroReview', { unit: u.id, focus: r.focus ?? config.state.focus, findings: (r.findings ?? []).length, at: r.at })),
    ]);
    const mine = new Set(units.map((u) => u.id));
    escalations.push(...(stats[R.stops] ?? []).filter((s) => mine.has(s.unit)).map((s) => msg('retroStopped', s)));
    escalations.push(...(stats[R.sendBacks] ?? []).filter((s) => mine.has(s.unit)).map((s) => msg('retroSentBack', s)));
    const denials = stats.escalations?.[R.reasons.denials];
    if (denials) escalations.push(msg('retroDenials', { count: denials }));
    out += msg('retroEscalations', {}) + (escalations.join('') || msg('retroNone', {}));
    // Owner approvals from the stamps of the intent's docs, however they ran; other owner commands; auto mode refusals.
    const since = Date.parse(stats.since ?? 0) || 0;
    const docs = [intent, ...units, ...st.requirements.filter((r) => units.some((u) => u.requirements.includes(r.id)) || intent.requirements.includes(r.id))];
    docs.push(...decisionsOf(st, docs).map((d) => ({ id: basename(d.file, config.okf.ext), fm: d.doc.fm }))); // and the decisions they cite
    const owner = [
      ...docs.flatMap((d) => events(d.fm).filter((e) => String(e.by).startsWith(config.state.human) && Date.parse(e.at) >= since)
        .map((e) => ({ at: String(e.at), line: msg('retroApproval', { at: e.at, doc: d.id, by: String(e.by).slice(config.state.human.length) }) }))),
      ...(stats[R.interventions] ?? []).filter((i) => !/\bapprove\b/.test(i.command)).map((i) => ({ at: i.at, line: msg('retroIntervention', i) })),
      ...(stats[R.hostDenied] ?? []).map((d) => ({ at: d.at, line: msg('retroHostDenied', d) })),
      ...(stats[R.ownerRefused] ?? []).map((d) => ({ at: d.at, line: msg('retroOwnerRefused', d) })),
    ].sort((a, b) => (a.at < b.at ? -1 : 1));
    out += msg('retroInterventions', {}) + (owner.map((o) => o.line).join('') || msg('retroNone', {}));
    // What production taught: each failed deploy step and the fix units it started (docs/design/operations.md).
    const fixes = units.filter((u) => u.fm.after === intent.id).map((u) => u.id);
    const failed = (stats[R.deployFailures] ?? []).filter((d) => d.intent === intent.id).map((d) => msg('retroDeploy', d)).join('');
    out += msg('retroDeploys', {}) + (failed + (fixes.length ? msg('retroDeployFixes', { intent: intent.id, units: fixes.join(', ') }) : '') || msg('retroNone', {}));

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
