// Unit card: rendered from the base commit, refused for unapproved or stale units, recorded for `start`
// and the model hook (docs/design/unit-card.md). Model routing follows docs/design/team.md.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bundleOf, CLI_DIR, config, QUICK, STANDARD, VERDICT, done, git, gitLines, list, readJson, slug, tryGit, UsageError, relPath } from './config.mjs';
import { msg, render } from './template.mjs';
import { loadProfile, withDefaults } from './profile.mjs';
import { linksOf, MD_LINK, nameProblem, parseDoc, sectionOf } from './okf.mjs';
import { computeLane, overlaps, readPlan, reqId, unitFields } from './grid.mjs';
import { aidlcDir, approval, baseOf, branchOf, diffHash, hashDoc, readReview, readState, heldDoc, researchOf, roundsOf, runtimeFile, sha256, worktrees, writeJson } from './state.mjs';

const C = config.card;

// Model for a unit: lane default, escalated for size or complex globs, and for a fix round after a CONFIRMED finding.
export function routeModel(unit, lane, profile = {}, review = null) {
  const m = withDefaults(profile).models;
  let model = m[lane];
  let reason = msg('laneModel', { lane });
  if (lane === STANDARD) {
    const complex = (m.complex ?? []).find((g) => unit.scope.some((s) => overlaps(s, g)));
    const why = unit.modules.length >= m.modules ? msg('modelModules', { count: unit.modules.length })
      : unit.acs.length >= m.acs ? msg('modelAcs', { count: unit.acs.length })
      : complex ? msg('modelComplex', { glob: complex }) : null;
    if (why) [model, reason] = [m.escalate, msg('modelEscalated', { reason: why })];
  }
  const last = roundsOf(review).at(-1);
  if (last?.verdict === VERDICT.fix && model !== m.escalate && (last.findings ?? []).some((f) => f.confidence === config.state.confirmed)) {
    [model, reason] = [m.escalate, msg('modelFix', {})];
  }
  return { model, reason };
}

export function templateFile(cwd, name) {
  const own = join(cwd, config.templates.find((t) => t.from === 'project').path, name);
  return existsSync(own) ? own : join(CLI_DIR, name);
}

// The non-blank lines of a section, as written.
const section = (doc, heading) => sectionOf(doc, heading).filter(([, t]) => t.trim()).map(([n]) => doc.lines[n - 1]);

// The project's rules, but those a review focus reads (docs/design/unit-card.md); `at` reads one, from the base or the disk.
function projectRules(names, profile, at) {
  const { dir, ext } = config.rules;
  return names.filter((f) => f.endsWith(ext) && !Object.hasOwn(profile.focus ?? {}, f.slice(0, -ext.length))).sort()
    .map((f) => ({ name: `${dir}/${f}`, text: at(`${dir}/${f}`).replace(/\n*$/, '\n') }));
}

// Renders the card for `unitId` from the base commit, or a refusal.
function renderCard(cwd, unitId) {
  const { profile } = loadProfile(cwd);
  const base = baseOf(profile);
  const baseSha = tryGit(cwd, 'rev-parse', '-q', '--verify', `${base}^{commit}`);
  if (!baseSha) throw new UsageError(msg('noBase', { base }));
  const bundle = bundleOf(cwd, profile);
  const plan = readPlan(bundle);
  const unit = plan.units.find((u) => u.id === unitId);
  if (!unit) throw new UsageError(msg('unknownUnit', { name: unitId, dir: relPath(cwd, join(bundle, config.grid.units)) }));

  const top = git(cwd, 'rev-parse', '--show-toplevel');
  const docText = tryGit(cwd, 'show', `${baseSha}:${relPath(top, unit.file)}`);
  const doc = docText === null ? null : parseDoc(docText + '\n');
  const atBase = doc && !doc.error && doc.fm ? { ...unit, ...unitFields(doc) } : null; // as written at the base commit
  const lane = atBase ? computeLane(atBase.scope, profile) : null;
  const state = !atBase ? 'draft' : atBase.fm.intent || lane.lane !== QUICK ? approval(doc) : 'approved';
  if (state !== 'approved') return done(msg('cardRefused', { unit: unitId, state }), config.exit.blocked);

  const review = readReview(cwd, unitId, doc);
  const hashNow = review && tryGit(cwd, 'rev-parse', '-q', '--verify', branchOf(unitId)) ? diffHash(cwd, base, unitId) : null;
  const current = hashNow !== null && roundsOf(review).at(-1)?.diffHash === hashNow;
  const { model, reason } = routeModel(atBase, lane.lane, profile, current ? review : null);
  // A fix round lists the findings of every focus whose last verdict for the current diff is `fix`; answered ones follow.
  const focuses = [...new Set((review?.rounds ?? []).map((r) => r.focus ?? config.state.focus))];
  const listed = (verdict) => focuses.map((f) => roundsOf(review, f).at(-1)).filter((r) => hashNow !== null && r.diffHash === hashNow && r.verdict === verdict)
    .flatMap((r) => (r.findings ?? []).map((f) => msg('cardFinding', { path: '', line: '', claim: '', scenario: '', confidence: '', ...f, focus: r.focus ?? config.state.focus })));
  const fixes = listed(VERDICT.fix);
  const answered = listed(config.state.answered); // an escalation the owner's re-approval answered
  const modules = new Set(atBase.modules);
  const data = {
    id: unitId,
    title: String(atBase.fm.title ?? ''),
    goal: String(atBase.fm.description ?? ''),
    lane: lane.lane,
    laneReason: lane.reason,
    model,
    modelReason: reason,
    reviewModel: withDefaults(profile).models.review,
    base: baseSha,
    acs: atBase.acs.map((a) => doc.lines[a.line - 1].trim()),
    scope: atBase.scope,
    // Interface links resolved from the unit doc's folder to repo paths, as `git show <base>:<path>` takes them.
    interfaces: [...new Set([...section(doc, config.grid.interfaces).filter((l) => !l.match(MD_LINK)).map((l) => l.trim().replace(/^[-*]\s+/, '')),
      ...linksOf({ doc, file: unit.file }, bundle).map((f) => relPath(top, f))])], // plain lines as written
    reserves: atBase.reserves,
    requirements: list(doc.fm.requirements).map(reqId).flatMap((id) => plan.requirements.filter((r) => reqId(r.id) === id)
      .map((r) => msg('cardRequirement', { id: r.id, path: relPath(top, r.file) }))), // as the file names it
    // A back-fill unit's reported mutations, for the reviewer to judge (docs/design/backfill.md).
    mutations: [[readJson(runtimeFile(cwd, 'reports', unitId))?.mutations ?? []].flat().filter((m) => m?.ac).map((m) => msg('cardMutation', { path: '', breaks: '', ...m, find: JSON.stringify(m.find), replace: JSON.stringify(m.replace) })).join('')]
      .map((l) => (l ? msg('cardMutations', { list: l }) : '')).join(''),
    fixes: [fixes.length ? msg('cardFixes', { list: fixes.join('') }) : '', answered.length ? msg('cardAnswered', { list: answered.join('') }) : ''].join(''),
    proof: [Object.entries(withDefaults(profile).levels).filter(([, l]) => l?.run && list(l.paths).length).map(([level]) => level).join(', ')].filter(Boolean),
    runs: Object.entries(withDefaults(profile).levels).filter(([, l]) => l?.run).map(([level, l]) => ({ level, run: l.run })),
    checks: (profile.modules ?? []).filter((m) => modules.has(m.id ?? m.name) && m.check).map((m) => ({ module: m.id ?? m.name, check: m.check })),
    // The data the unit's modules own; any other through its owner (docs/design/data-ownership.md).
    data: profile.architecture?.data?.prefix ? [(profile.modules ?? []).filter((m) => modules.has(m.id ?? m.name) && list(m.data).length).map((m) => msg('cardDataOwned', { module: m.id ?? m.name, data: list(m.data).join(', ') })).join('') + msg('cardDataRest', { shared: list(profile.architecture.data.shared).join(', ') || '-' })] : [],
    // The naming rules for the files the unit may write (docs/design/names.md).
    names: [[profile.names ?? []].flat().filter((r) => !nameProblem(r) && list(r.files).some((g) => atBase.scope.some((s) => overlaps(s, g))))
      .map((r) => msg(r.find ? 'cardName' : 'cardNamePath', { id: r.id, files: list(r.files).join(', '), pattern: r.pattern, why: r.why ?? '-' })).join('')].filter(Boolean),
    // Versions from the registry, never from memory (docs/design/dependencies.md).
    deps: list(profile.deps?.manifests).some((g) => atBase.scope.some((s) => overlaps(s, g))) ? [msg('cardDeps', { manifests: list(profile.deps.manifests).join(', '), checks: list(profile.deps.check).join('; ') || '-' })] : [],
    // Where the deploy target is already defined, so a unit builds on it (docs/design/operations.md).
    platform: list(profile.deploy?.platform).length ? [msg('cardPlatform', { refs: list(profile.deploy.platform).join(', ') })] : [],
    outOfScope: section(doc, config.grid.outOfScope),
    // The design rows the builder builds to and every review checks (docs/design/design-rows.md).
    design: [Object.values(config.grid.designRows).flat().filter((h, k, all) => all.indexOf(h) === k && section(doc, h).length).join(', ')]
      .filter(Boolean).map((sections) => msg('cardDesign', { sections, path: relPath(top, unit.file) })),
    rules: projectRules(gitLines(cwd, 'ls-tree', '--name-only', `${baseSha}:${config.rules.dir}`), profile, (p) => git(cwd, 'show', `${baseSha}:${p}`)),
  };
  const file = templateFile(cwd, lane.lane === QUICK ? C.quickTemplate : C.template);
  const template = readFileSync(file, 'utf8');
  // The base is left out, so a base that moved for other units does not make a recorded review stale.
  const hash = sha256(hashDoc(doc) + '\n' + render(template, { ...data, base: '', hash: '' }, file)).slice(0, C.hashLength);
  const card = render(template, { ...data, hash }, file);
  // Findings and mutations come from review rounds: outside the cap, so a fix round never needs a re-approval (docs/design/unit-card.md).
  const size = render(template, { ...data, hash, fixes: '', mutations: '' }, file).length;
  if (size > C.max) return done(msg('cardTooLong', { unit: unitId, size, max: C.max, rules: data.rules.reduce((n, r) => n + r.text.length, 0) }), config.exit.findings);
  writeJson(runtimeFile(cwd, 'cards', unitId), { unit: unitId, hash, base: baseSha, lane: lane.lane, model, scope: atBase.scope });
  return done(card);
}

// The researcher's brief: the held question and the project's own context, never a plugin source list (decision 0010).
function researchBrief(cwd, id) {
  const st = readState(cwd);
  const doc = id ? heldDoc(st, id) : null;
  const question = doc && researchOf(doc);
  if (!question) throw new UsageError(msg('researchNone', { doc: id ?? '' }));
  const file = templateFile(cwd, C.researchTemplate);
  return render(readFileSync(file, 'utf8'), {
    doc: doc.id, question, questionYaml: JSON.stringify(question), file: relPath(cwd, doc.file), model: st.profile.models.research,
    index: relPath(cwd, join(st.bundle, config.okf.index)), stack: C.stack.filter((f) => existsSync(join(cwd, f))),
    rules: projectRules(existsSync(join(cwd, config.rules.dir)) ? readdirSync(join(cwd, config.rules.dir)) : [], st.profile, (p) => readFileSync(join(cwd, p), 'utf8')),
    sources: list(st.profile.research?.sources), max: st.profile.research.max, cap: config.okf.sizeCaps.Research ?? config.okf.sizeCapDefault, out: relPath(cwd, join(st.bundle, config.grid.research, `${doc.id}-${slug(question, 6)}.md`)),
  }, file);
}

export const commands = {
  research: (args, { cwd }) => done(researchBrief(cwd, args[0])),

  card(args, { cwd }) {
    if (!args[0]) throw new UsageError(msg('noDoc', { name: '' }));
    return renderCard(cwd, args[0]);
  },

  // In a builder's worktree: name the branch unit/U-<n> and refuse when the base differs from the card's.
  start(args, { cwd }) {
    const unit = args[0];
    if (!unit) throw new UsageError(msg('noDoc', { name: '' }));
    const gitDir = resolve(cwd, git(cwd, 'rev-parse', '--git-dir'));
    if (gitDir === resolve(aidlcDir(cwd), '..')) throw new UsageError(msg('notWorktree', {}));
    const record = readJson(runtimeFile(cwd, 'cards', unit));
    if (!record) return done(msg('noCard', { unit }), config.exit.findings);
    const branch = branchOf(unit);
    const current = git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD');
    if (current !== branch) {
      const head = git(cwd, 'rev-parse', 'HEAD');
      if (head !== record.base) return done(msg('baseMismatch', { unit, head, base: record.base }), config.exit.findings);
      if (tryGit(cwd, 'rev-parse', '-q', '--verify', `refs/heads/${branch}`)) {
        const path = worktrees(cwd).get(branch);
        if (path) { // an earlier builder's worktree is taken over only when it is clean; next never runs two builders for a unit
          if (tryGit(path, 'status', '--porcelain') !== '') return done(msg('branchTaken', { branch, path }), config.exit.findings);
          git(cwd, 'worktree', 'remove', '--force', '--force', path); // the host's lock lasts as long as the lead session
        }
        git(cwd, 'switch', '-q', branch);
      } else git(cwd, 'branch', '-m', branch);
    }
    // A restarted builder sees what was merged since: the card's base goes into an older branch first.
    if (tryGit(cwd, 'merge-base', '--is-ancestor', record.base, 'HEAD') === null) {
      if (tryGit(cwd, 'merge', '-q', '--no-edit', '-m', msg('startMergeMessage', { base: record.base.slice(0, 12), branch }), record.base) === null) {
        const files = gitLines(cwd, 'diff', '--name-only', '--diff-filter=U');
        return done(msg('startConflict', { branch, base: record.base, files: files.join(', ') }), config.exit.findings);
      }
      return done(msg('startMerged', { branch, base: record.base }));
    }
    return done(msg('started', { branch, base: record.base }));
  },
};
