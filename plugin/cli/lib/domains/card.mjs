// Unit card: rendered from the base commit, refused for unapproved or stale units, recorded for `start`
// and the model hook (docs/design/bolt-card.md). Model routing follows docs/design/team.md.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { bundleOf, CLI_DIR, config, QUICK, STANDARD, VERDICT, done, list, readJson, slug, UsageError, relPath } from '../foundation/data.mjs';
import { branchSha, git, gitLines, tryGit } from '../foundation/git.mjs';
import { msg, render } from '../foundation/text.mjs';
import { loadProfile, withDefaults } from '../foundation/profile.mjs';
import { nameProblem, parseDoc, sectionOf, sizeCap, hashDoc } from './bundle.mjs';
import { generatedRules, nameOf, registry } from './naming.mjs';
import { seam } from '../foundation/seams.mjs';
import { computeLane, readPlan, reqId, unitFields } from './plan.mjs';
import { overlaps } from '../foundation/glob.mjs';
import { readState, heldDoc, researchOf } from './flow.mjs';
import { baseOf, branchOf, worktrees, aidlcDir, runtimeFile, sha256, writeJson } from '../foundation/store.mjs';
import { diffHash, readReview, roundsOf } from './review.mjs';
import { approval } from './approval.mjs';

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

// The project's rules, but those a review focus reads (docs/design/bolt-card.md); `at` reads one, from the base or the disk.
function projectRules(names, profile, at) {
  const { dir, ext } = config.rules;
  return names.filter((f) => f.endsWith(ext) && !Object.hasOwn(profile.focus ?? {}, f.slice(0, -ext.length))).sort()
    .map((f) => ({ name: `${dir}/${f}`, text: at(`${dir}/${f}`).replace(/\n*$/, '\n') }));
}

// The names a bolt will create for each registered domain module it names, printed in advance from the grammar;
// a kind the registry cannot compose yet (a token unset) is left out (docs/design/naming.md#checks).
function namesCreated(unit, profile, bundle) {
  if (!profile.naming) return '';
  const reg = registry(profile, bundle), domains = (profile.modules ?? []).filter((m) => m.kind === 'domain').map((m) => String(m.id ?? m.name));
  return domains.filter((d) => unit.modules.includes(d) && reg.domains[d]).map((domain) => {
    const names = config.naming.cardKinds.flatMap((k) => { try { return [`${k.label} ${nameOf(k.kind, { domain, ...(k.flags ?? {}) }, reg)}`]; } catch { return []; } });
    return names.length ? msg('cardNamesOf', { module: domain, names: names.join(', ') }) : '';
  }).join('');
}

// Each intent, unit, requirement or decision the text names, with its path, but those the card lists already.
function referencesOf(texts, plan, cwd, sha, top, shown) {
  const docs = new Map([...plan.intents, ...plan.units, ...plan.requirements].map((d) => [d.id, relPath(top, d.file)]));
  const files = gitLines(cwd, 'ls-tree', '-r', '--name-only', sha);
  const ids = [...new Set(texts.flatMap((t) => [...t.matchAll(new RegExp(C.refs, 'g'))].map((m) => m[1])))];
  return ids.map((id) => [id, docs.get(id) ?? (/^0/.test(id) ? files.find((f) => f.split('/').pop().startsWith(id + '-') && f.endsWith('.md')) : undefined)])
    .filter(([id, path]) => !shown.some((x) => x === id || (path && x.includes(path))))
    .map(([id, path]) => msg(path ? 'cardRef' : 'cardRefMissing', { id, path })).join('');
}

// An interface line as written, each link replaced by its text and the path it resolves to.
const resolveLinks = (line, file, bundle, top) => line.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (all, text, href) =>
  /^[a-z][a-z0-9+.-]*:/i.test(href) ? `${text} (${href})` : `${text} (${relPath(top, href.startsWith('/') ? join(bundle, href) : resolve(dirname(file), href))})`);

// Renders the card for `unitId` from the base commit, or a refusal; `preview` renders the doc on disk, whatever its
// approval, and returns only the size `card` would count (PLAN-CARD, docs/design/bolt-card.md).
function renderCard(cwd, unitId, { preview = false } = {}) {
  const { profile } = loadProfile(cwd);
  const base = baseOf(profile);
  const baseSha = tryGit(cwd, 'rev-parse', '-q', '--verify', `${base}^{commit}`);
  if (!baseSha) throw new UsageError(msg('noBase', { base }));
  const bundle = bundleOf(cwd, profile);
  const plan = readPlan(bundle);
  const unit = plan.units.find((u) => u.id === unitId);
  if (!unit) throw new UsageError(msg('unknownUnit', { name: unitId, dir: relPath(cwd, join(bundle, config.grid.units)) }));

  const top = git(cwd, 'rev-parse', '--show-toplevel');
  const docText = preview ? readFileSync(unit.file, 'utf8') : tryGit(cwd, 'show', `${baseSha}:${relPath(top, unit.file)}`);
  const doc = docText === null ? null : parseDoc(docText + '\n');
  const atBase = doc && !doc.error && doc.fm ? { ...unit, ...unitFields(doc) } : null; // as written at the base commit
  const lane = atBase ? computeLane(atBase.scope, profile, { floor: atBase.floor }) : null;
  const state = !atBase ? 'draft' : atBase.fm.intent || lane.lane !== QUICK ? approval(doc) : 'approved';
  if (state !== 'approved' && !preview) return done(msg('cardRefused', { unit: unitId, state }), config.exit.blocked);

  const review = preview ? null : readReview(cwd, unitId, doc);
  const hashNow = review && tryGit(cwd, 'rev-parse', '-q', '--verify', branchOf(unitId)) ? diffHash(cwd, base, unitId) : null;
  const current = hashNow !== null && roundsOf(review).at(-1)?.diffHash === hashNow;
  const { model, reason } = routeModel(atBase, lane.lane, profile, current ? review : null);
  // A fix round lists the findings of every focus whose last verdict for the current diff is `fix`; answered ones follow.
  const focuses = [...new Set((review?.rounds ?? []).map((r) => r.focus ?? config.state.focus))];
  const listed = (verdict) => focuses.map((f) => roundsOf(review, f).at(-1)).filter((r) => hashNow !== null && r.diffHash === hashNow && r.verdict === verdict)
    .flatMap((r) => (r.findings ?? []).map((f) => msg('cardFinding', { id: '-', path: '', line: '', claim: '', scenario: '', confidence: '', ...f, focus: r.focus ?? config.state.focus })));
  const fixes = listed(VERDICT.fix);
  const answered = listed(config.state.answered); // an escalation the owner's re-approval answered
  const modules = new Set(atBase.modules);
  const data = {
    id: unitId, title: String(atBase.fm.title ?? ''), goal: String(atBase.fm.description ?? ''),
    lane: lane.lane, laneReason: lane.reason, model, modelReason: reason,
    reviewModel: withDefaults(profile).models.review,
    base: baseSha,
    acs: atBase.acs.map((a) => doc.lines[a.line - 1].trim()),
    scope: atBase.scope,
    // Interface lines as written, each link with the repo path it resolves to (U128).
    interfaces: section(doc, config.grid.interfaces).map((l) => resolveLinks(l.trim().replace(/^[-*]\s+/, ''), unit.file, bundle, top)),
    why: [section(doc, config.grid.why).map((l) => l.trim() + '\n').join('')].filter(Boolean),
    reserves: atBase.reserves,
    requirements: list(doc.fm.requirements).map(reqId).flatMap((id) => plan.requirements.filter((r) => reqId(r.id) === id)
      .map((r) => msg('cardRequirement', { id: r.id, path: relPath(top, r.file) }))), // as the file names it
    // A back-fill unit's reported mutations, for the reviewer to judge (docs/design/backfill.md).
    mutations: [[readJson(runtimeFile(cwd, 'reports', unitId))?.mutations ?? []].flat().filter((m) => m?.ac).map((m) => msg('cardMutation', { path: '', breaks: '', ...m, find: JSON.stringify(m.find), replace: JSON.stringify(m.replace) })).join('')]
      .map((l) => (l ? msg('cardMutations', { list: l }) : '')).join(''),
    fixes: [fixes.length ? msg('cardFixes', { list: fixes.join('') }) : '', answered.length ? msg('cardAnswered', { list: answered.join('') }) : ''].join(''),
    proof: [Object.entries(withDefaults(profile).levels).filter(([, l]) => l?.run && list(l.paths).length).map(([level]) => level).join(', ')].filter(Boolean),
    runs: Object.entries(withDefaults(profile).levels).filter(([, l]) => l?.run).map(([level, l]) => ({ level, run: l.run })),
    checks: [...(profile.modules ?? []).filter((m) => modules.has(m.id ?? m.name) && m.check).map((m) => ({ module: m.id ?? m.name, check: m.check })), ...list(profile.checks).map((check) => ({ module: C.everyMerge, check }))],
    // The data the unit's modules own; any other through its owner (docs/design/data-ownership.md).
    data: profile.architecture?.data?.prefix ? [(profile.modules ?? []).filter((m) => modules.has(m.id ?? m.name) && list(m.data).length).map((m) => msg('cardDataOwned', { module: m.id ?? m.name, data: list(m.data).join(', ') })).join('') + msg('cardDataRest', { shared: list(profile.architecture.data.shared).join(', ') || '-' })] : [],
    // The naming rules for the files the unit may write (docs/design/naming.md).
    names: [[...[profile.names ?? []].flat(), ...generatedRules(profile, bundle)].filter((r) => !nameProblem(r) && list(r.files).some((g) => atBase.scope.some((s) => overlaps(s, g))))
      // a rule shows what it finds too: a pattern nothing matches bans each found word (U127)
      .map((r) => msg(!r.find ? 'cardNamePath' : r.pattern === C.bannedPattern ? 'cardNameBanned' : 'cardName', { id: r.id, files: list(r.files).join(', '), find: r.find, pattern: r.pattern, why: r.why ?? '-' })).join('') + namesCreated(atBase, profile, bundle)].filter(Boolean),
    // The stack pack's reference slices, for a bolt that names a domain (docs/design/stack-packs.md).
    reference: seam('cardSections', profile).flatMap((section) => section(top, atBase, profile)), // the stack pack's reference slices
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
  const shown = [unitId, ...data.requirements, ...data.interfaces];
  data.references = [referencesOf([data.goal, ...data.why, ...data.acs, ...data.outOfScope], plan, cwd, baseSha, top, shown)].filter(Boolean);
  const file = templateFile(cwd, lane.lane === QUICK ? C.quickTemplate : C.template);
  const template = readFileSync(file, 'utf8');
  // The base is left out, so a base that moved for other units does not make a recorded review stale.
  const hash = sha256(hashDoc(doc) + '\n' + render(template, { ...data, base: '', hash: '' }, file)).slice(0, C.hashLength);
  const card = render(template, { ...data, hash }, file);
  // Findings and mutations come from review rounds: outside the cap, so a fix round never needs a re-approval; the
  // profile's sections grow with the project, not the unit, so they are outside it too (docs/design/bolt-card.md).
  const lines = (t) => t.replace(/\n$/, '').split('\n').length;
  const size = lines(render(template, { ...data, hash, fixes: '', mutations: '', data: [], names: [], deps: [], platform: [] }, file));
  const rules = data.rules.reduce((n, r) => n + lines(r.text), 0);
  if (preview) return atBase ? { size, max: C.max, rules } : null;
  if (size > C.max) return done(msg('cardTooLong', { unit: unitId, size, max: C.max, rules }), config.exit.findings);
  writeJson(runtimeFile(cwd, 'cards', unitId), { unit: unitId, hash, base: baseSha, lane: lane.lane, model, scope: atBase.scope, key: cardKey(cwd, unitId, baseSha), text: card });
  return done(card);
}

// What a card is drawn from, as one hash: the base (the doc, its references and the rules as of it), the bolt's
// branch, its review and report, the profile layers and the card templates. The same key means the same card.
function cardKey(cwd, unitId, baseSha) {
  const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  const files = [...config.layers.filter((l) => l.from === 'project').map((l) => join(cwd, l.path)), runtimeFile(cwd, 'reviews', unitId), runtimeFile(cwd, 'reports', unitId),
    ...[C.template, C.quickTemplate].map((t) => templateFile(cwd, t)), join(CLI_DIR, config.init.version)];
  return sha256(JSON.stringify([baseSha, branchSha(cwd, branchOf(unitId)), ...files.map(read)]));
}
// The card `aidlc card` last rendered for a bolt, while nothing it is drawn from changed; else null.
export function cachedCard(cwd, unitId) {
  const record = readJson(runtimeFile(cwd, 'cards', unitId)), { profile } = loadProfile(cwd);
  return record?.text && record.key === cardKey(cwd, unitId, branchSha(cwd, baseOf(profile))) ? record.text : null;
}

// PLAN-CARD: the card size in lines of each unit in `ids` over the cap, from the doc on disk; none without a base commit.
export function cardsOver(cwd, ids) {
  const { profile } = loadProfile(cwd);
  if (!tryGit(cwd, 'rev-parse', '-q', '--verify', `${baseOf(profile)}^{commit}`)) return [];
  return ids.map((id) => ({ id, ...renderCard(cwd, id, { preview: true }) })).filter((c) => c.size > c.max);
}

// The researcher's brief: the held question and the project's own context, never a plugin source list (decision 0010).
export function researchBrief(cwd, id) {
  const st = readState(cwd);
  const doc = id ? heldDoc(st, id) : null;
  const question = doc && researchOf(doc);
  if (!question) throw new UsageError(msg('researchNone', { doc: id ?? '' }));
  const file = templateFile(cwd, C.researchTemplate);
  return render(readFileSync(file, 'utf8'), {
    doc: doc.id, question, questionYaml: JSON.stringify(question), file: relPath(cwd, doc.file), model: st.profile.models.research,
    index: relPath(cwd, join(st.bundle, config.okf.index)), stack: C.stack.filter((f) => existsSync(join(cwd, f))),
    rules: projectRules(existsSync(join(cwd, config.rules.dir)) ? readdirSync(join(cwd, config.rules.dir)) : [], st.profile, (p) => readFileSync(join(cwd, p), 'utf8')),
    sources: list(st.profile.research?.sources), max: st.profile.research.max, cap: sizeCap('Research', st.profile.docs?.caps), out: relPath(cwd, join(st.bundle, config.grid.research, `${doc.id}-${slug(question, 6)}.md`)),
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
