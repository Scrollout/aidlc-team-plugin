// Board: a one-way projection of derived state onto GitHub issues and a Project, through `gh api` only
// (docs/design/board.md). No other command reads the board; it writes only what differs. Also reads the base's
// CI runs (docs/design/base-ci.md).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { aidlcDir, at, bindingName, ciFile, config, done, fieldPaths, git, isMap, list, msg, plug, readJson, readState, relPath, render, templateFile, tryGit, UsageError, writeJson } from '../../lib/index.mjs';

const B = config.board;
let ghCommand = [B.gh]; // `github.gh` overrides it (docs/design/board.md)

function api(args, body) {
  let out;
  try {
    const opts = { input: body ? JSON.stringify(body) : '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
    out = execFileSync(ghCommand[0], [...ghCommand.slice(1), 'api', ...args, ...(body ? ['--input', '-'] : [])], opts);
  } catch (e) {
    // gh's own message (stderr, or the API's error body) says what failed; the command line does not.
    throw new Error(`${args.slice(0, B.errorArgs).join(' ')}: ${(e.stderr || e.stdout || e.message).trim().split('\n').join(' ')}`);
  }
  return out.trim() ? JSON.parse(out) : null;
}
const rest = (method, path, body) => api(['-X', method, path], body);
const graphql = (query, variables) => api(['graphql'], { query, variables }).data;
function pages(path) {
  const all = [];
  for (let page = 1; ; page++) {
    const got = rest('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=${B.perPage}&page=${page}`);
    all.push(...got);
    if (got.length < B.perPage) return all;
  }
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)), 0, 0, ms);

const github = (profile) => {
  if (!profile.github?.repo) throw new UsageError(msg('boardOff', {}));
  ghCommand = list(profile.github.gh ?? B.gh);
  return profile.github;
};

// The board template: the shipped one, a project's merged over it, and the profile's github maps over both
// (docs/design/board.md#shape). A map merges key by key; any other value replaces.
const over = (a, b) => (isMap(a) && isMap(b) ? Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, k in b ? over(a[k], b[k]) : a[k]])) : b);
function templateOf(cwd, gh) {
  const own = readJson(join(cwd, config.packages.templates.override, B.file)) ?? {};
  const legacy = { kinds: Object.fromEntries(Object.entries(gh.types ?? {}).map(([k, type]) => [k, { type }])),
    fields: { [B.statusField]: { map: gh.status ?? {} }, ...Object.fromEntries(Object.entries(gh.fields ?? {}).map(([n, s]) => [n, typeof s === 'string' ? { from: s } : s])) } };
  const t = over(over(readJson(join(import.meta.dirname, B.file)), own), legacy);
  if (gh.statusField) { t.fields[gh.statusField] = over(t.fields[B.statusField], t.fields[gh.statusField] ?? {}); delete t.fields[B.statusField]; }
  return t;
}

// The issue each intent and unit should have, rendered from the template: title, body, labels, assignees, type,
// milestone, parent, blockers, open or closed, and Project fields.
function wanted(cwd, st, gh) {
  const top = git(cwd, 'rev-parse', '--show-toplevel'), T = templateOf(cwd, gh), bodies = new Map();
  const body = (name) => { const file = templateFile(cwd, name, import.meta.dirname); if (!bodies.has(file)) bodies.set(file, readFileSync(file, 'utf8')); return [bodies.get(file), file]; };
  const waves = new Map();
  const wave = (u) => { // 1 + the highest wave among its dependencies in its intent
    if (waves.has(u.id)) return waves.get(u.id);
    waves.set(u.id, 1); // a dependency cycle (PLAN-DAG) stops here
    const deps = u.depends.map((id) => st.units.find((x) => x.id === id && x.fm.intent === u.fm.intent)).filter(Boolean);
    waves.set(u.id, 1 + Math.max(0, ...deps.map(wave)));
    return waves.get(u.id);
  };
  const one = (d, kind, state) => {
    const K = T.kinds[kind === 'unit' && !d.fm.intent ? B.fix : kind];
    const derived = { [B.wave]: () => wave(d), [B.binding]: () => bindingName(d, st.profile) }; // a value in the doc wins
    const own = { id: d.id, title: d.fm.title ?? '', requirements: d.requirements, lane: d.lane, modules: d.modules, depends: d.depends, status: state };
    const value = (path) => path && (at(own, path) ?? at(d.fm, path) ?? (kind === 'unit' && derived[path] ? derived[path]() : undefined));
    const done = B.done.includes(state);
    const acs = (d.acs ?? []).map((a) => ({ box: done ? B.box.done : B.box.open, text: d.doc.lines[a.line - 1].replace(/^\s*[-*]\s+/, '') }));
    const marker = msg('boardMarker', { kind, id: d.id });
    const data = { description: String(d.fm.description ?? ''), link: msg('boardLink', { repo: gh.repo, base: st.base, path: relPath(top, d.file) }), marker };
    const [template, file] = body(K.body);
    let text;
    do text = render(template, { ...data, acs }, file); while (text.length > B.maxBody && acs.pop());
    const fields = Object.fromEntries(Object.entries(T.fields).map(([name, spec]) => {
      const raw = value(spec.from);
      return [name, raw === undefined || raw === null ? undefined : spec.map ? spec.map[String(raw)] : raw];
    }));
    const title = render(K.title, { ...d.fm, ...own }).trim(), parent = K.parent && value(K.parent.from) ? `${K.parent.kind}:${value(K.parent.from)}` : null;
    return { key: `${kind}:${d.id}`, id: d.id, marker, title, body: text, labels: [...new Set(list(K.labels).flatMap((p) => list(value(p))))].filter(Boolean), assignees: list(value(K.assignees)),
      open: !done, type: K.type, fields, parent, issue: at(d.fm, B.issue), blockedBy: K.blockedBy ? list(value(K.blockedBy)) : null,
      group: isMap(K.milestone) ? `${kind}:${d.id}` : parent, milestone: isMap(K.milestone) ? { title: render(K.milestone.title, { ...d.fm, ...own }).trim(), due: value(K.milestone.due) } : null };
  };
  return { T, docs: [
    // An approved intent is under way once one of its units is past approval (docs/design/board.md).
    ...st.intents.map((i) => one(i, 'intent', i.state === 'approved' && st.units.some((u) => u.fm.intent === i.id && !B.unstarted.includes(u.state)) ? B.started : i.state)),
    ...st.units.map((u) => one(u, 'unit', u.held && B.holdable.includes(u.state) ? B.held : u.state)),
  ] };
}

// One milestone per intent, due on its target; returns intent key → milestone number.
function milestones(repo, docs, out) {
  const have = pages(`${repo}/milestones?state=all`);
  return new Map(docs.filter((d) => d.milestone).map(({ key, milestone: { title, due } }) => {
    let m = have.find((x) => x.title === title);
    const due_on = due ? `${due}${B.dueTime}` : null;
    if (!m) {
      m = rest('POST', `${repo}/milestones`, due ? { title, due_on } : { title }); // GitHub refuses a null due_on
      out.push(msg('boardMilestoneCreated', { title }));
    } else if (due && (m.due_on ?? '').slice(0, String(due).length) !== String(due)) {
      rest('PATCH', `${repo}/milestones/${m.number}`, { due_on });
      out.push(msg('boardMilestoneDue', { title, due }));
    }
    return [key, m.number];
  }));
}

function issues(gh, docs, out, backoff, last) {
  const repo = `repos/${gh.repo}`;
  const assignees = gh.assignees ?? [rest('GET', 'user').login];
  const typed = rest('GET', repo).owner?.type === B.typedOwner; // issue types exist on organisation repositories only
  const [owner, name] = gh.repo.split('/');
  // A list shorter than the repository's issue count is a lagging read: list again after a wait, and never create from it.
  const list = () => {
    for (let k = 0; ; k++) {
      const got = pages(`${repo}/issues?state=all`).filter((i) => !i.pull_request).sort((a, b) => a.number - b.number); // the oldest copy wins
      const count = graphql(B.queries.issueCount, { owner, name }).repository.issues.totalCount;
      if (got.length >= count) return got;
      if (k === backoff.length) throw new Error(msg('boardShort', { got: got.length, count }));
      sleep(backoff[k]);
    }
  };
  let [all, relisted] = [list(), false];
  const stones = milestones(repo, docs, out);
  const have = new Set(pages(`${repo}/labels`).map((l) => l.name));
  for (const name of [...new Set(docs.flatMap((d) => d.labels))].filter((n) => !have.has(n))) {
    rest('POST', `${repo}/labels`, { name });
    out.push(msg('boardLabel', { name }));
  }
  for (const d of docs) {
    const state = d.open ? 'open' : 'closed';
    const find = () => all.find((i) => d.issue !== undefined && i.number === Number(d.issue)) ?? all.find((i) => (i.body ?? '').includes(d.marker));
    let issue = find() ?? (relisted ? undefined : ((relisted = true), (all = list()), find())); // a lagging list must not duplicate
    if (!issue) {
      const extra = { assignees: d.assignees.length ? d.assignees : assignees, milestone: stones.get(d.group), ...(typed && d.type ? { type: d.type } : {}) };
      issue = rest('POST', `${repo}/issues`, { title: d.title, body: d.body, labels: d.labels, ...extra });
      if (!d.open) issue = rest('PATCH', `${repo}/issues/${issue.number}`, { state });
      out.push(msg('boardCreated', { number: issue.number, title: d.title }));
    } else {
      const names = issue.labels.map((l) => l.name);
      const change = {};
      if (issue.title !== d.title) change.title = d.title;
      if ((issue.body ?? '') !== d.body) change.body = d.body;
      if (issue.state !== state) change.state = state;
      // What the plugin set and the plan no longer gives goes; what people added stays.
      const keep = (now, part, want) => [...new Set([...now.filter((x) => want.includes(x) || !(last[d.key]?.[part] ?? []).includes(x)), ...want])];
      const differs = (a, b) => a.length !== b.length || a.some((x) => !b.includes(x));
      const labels = keep(names, 'labels', d.labels), people = (issue.assignees ?? []).map((a) => a.login), wantPeople = keep(people, 'assignees', d.assignees.length ? d.assignees : assignees);
      if (differs(labels, names)) change.labels = labels;
      if (differs(wantPeople, people)) change.assignees = wantPeople;
      if (stones.get(d.group) && issue.milestone?.number !== stones.get(d.group)) change.milestone = stones.get(d.group);
      if (typed && d.type && issue.type?.name !== d.type) change.type = d.type;
      if (Object.keys(change).length) {
        rest('PATCH', `${repo}/issues/${issue.number}`, change);
        out.push(msg('boardUpdated', { number: issue.number, what: Object.keys(change).join(', ') }));
      }
    }
    d.found = issue;
  }
  for (const parent of docs.filter((p) => docs.some((c) => c.parent === p.key))) {
    const subs = new Set(pages(`${repo}/issues/${parent.found.number}/sub_issues`).map((i) => i.number));
    for (const child of docs.filter((c) => c.parent === parent.key && !subs.has(c.found.number))) {
      rest('POST', `${repo}/issues/${parent.found.number}/sub_issues`, { sub_issue_id: child.found.id, replace_parent: true });
      out.push(msg('boardLinked', { child: child.found.number, parent: parent.found.number }));
    }
  }
  // Blocked-by links match the plan's dependencies; a link to an issue off the board stays.
  const onBoard = new Set(docs.map((d) => d.found.id));
  for (const d of docs.filter((x) => x.blockedBy)) {
    const path = `${repo}/issues/${d.found.number}/dependencies/blocked_by`, have = pages(path);
    const want = d.blockedBy.map((id) => docs.find((x) => x.id === id)?.found).filter(Boolean);
    for (const b of want.filter((w) => !have.some((h) => h.id === w.id))) { rest('POST', path, { issue_id: b.id }); out.push(msg('boardBlocked', { number: d.found.number, by: b.number })); }
    for (const h of have.filter((x) => onBoard.has(x.id) && !want.some((w) => w.id === x.id))) { rest('DELETE', `${path}/${h.id}`); out.push(msg('boardUnblocked', { number: d.found.number, by: h.number })); }
  }
  return Object.fromEntries(docs.map((d) => [d.key, { labels: d.labels, assignees: d.assignees.length ? d.assignees : assignees }]));
}

// Reads the Project with all its items; called again when GitHub's own workflows race an add.
function projectReader(gh) {
  const m = String(gh.project).match(new RegExp(B.project));
  if (!m) throw new UsageError(msg('boardProject', { project: gh.project }));
  const owner = B.owners[m[1]];
  const query = render(B.queries.project, { owner }, 'board.queries.project');
  return () => {
    const items = [];
    let proj;
    let cursor = null;
    do {
      proj = graphql(query, { login: m[2], number: Number(m[3]), cursor })[owner].projectV2;
      items.push(...proj.items.nodes);
      cursor = proj.items.pageInfo.hasNextPage ? proj.items.pageInfo.endCursor : null;
    } while (cursor);
    return { proj, items };
  };
}

// An iteration field's iterations, current and completed; a value names one by its title or start date.
const iterations = (f) => [...(f?.configuration?.iterations ?? []), ...(f?.configuration?.completedIterations ?? [])];
const choices = (f) => (f?.options ? f.options.map((o) => o.name) : f?.configuration ? iterations(f).flatMap((i) => [i.title, i.startDate]) : null);

// Checked before any write, so a sync never stops halfway: each field the template names has its type, a missing
// one can be created, and every planned value is a choice the Project has or the template declares. The choices
// are kept for plan lint (PLAN-BOARD); returns the fields and options to create.
function checkProject(proj, T, docs) {
  const fields = new Map(proj.fields.nodes.filter((f) => f.name).map((f) => [f.name, f]));
  const problems = [], missing = [], options = {}, create = [];
  for (const [name, spec] of Object.entries(T.fields)) {
    const f = fields.get(name), used = [...new Set(docs.map((d) => d.fields[name]).filter((v) => v !== undefined).map(String))];
    if (f && spec.type && f.dataType !== spec.type) { problems.push(msg('boardFieldType', { name, type: f.dataType, want: spec.type })); continue; }
    if (!f && !used.length) continue;
    if (!f && !spec.type) { problems.push(msg('boardNoField', { name })); continue; }
    if (!f && spec.type === B.iteration && !(spec.start && spec.duration)) { problems.push(msg('boardNoIterations', { name })); continue; }
    const have = choices(f) ?? (B.choiceTypes.includes(spec.type) ? [] : null);
    if (!have) continue;
    const add = list(spec.options).filter((o) => !have.includes(o)), known = [...have, ...add];
    options[name] = known;
    missing.push(...used.filter((v) => !known.includes(v)).map((value) => msg('boardMissingOption', { name, value, options: known.join(', ') })));
    if (!f || add.length) create.push({ name, spec, f, add });
  }
  return { options, missing, problems, create };
}

// Creates the missing fields and declared options; GitHub keeps an existing option when its id is sent back.
function createFields(proj, create, out) {
  const option = (name) => ({ name, color: B.optionColor, description: '' });
  for (const { name, spec, f, add } of create) {
    if (f) graphql(B.queries.updateField, { field: f.id, options: [...f.options.map(({ id, name: n, color, description }) => ({ id, name: n, color, description })), ...add.map(option)] });
    else graphql(B.queries.createField, { project: proj.id, type: spec.type, name, options: spec.type === B.select ? add.map(option) : null,
      iterations: spec.type === B.iteration ? { startDate: String(spec.start), duration: Number(spec.duration), iterations: [] } : null });
    out.push(msg(f ? 'boardOptionsAdded' : 'boardFieldCreated', { name, options: add.join(', ') }));
  }
}

function project(gh, docs, out, backoff, read) {
  let { proj, items } = read();
  const fields = new Map(proj.fields.nodes.filter((f) => f.name).map((f) => [f.name, f]));
  for (const d of docs) {
    const find = () => items.find((i) => i.content?.number === d.found.number && i.content?.repository?.nameWithOwner === gh.repo);
    let item = find();
    if (!item) {
      try {
        item = { id: graphql(B.queries.addItem, { project: proj.id, content: d.found.node_id }).addProjectV2ItemById.item.id, fieldValues: { nodes: [] } };
        out.push(msg('boardAdded', { number: d.found.number }));
      } catch (e) {
        // GitHub's own Project workflows (auto-add of sub-issues) added it after the read: read again, never add twice.
        if (!e.message.includes(B.itemExists)) throw e;
        for (let k = 0; !item; k++) {
          if (k === backoff.length) throw new Error(msg('boardItemHidden', { number: d.found.number }));
          sleep(backoff[k]);
          ({ items } = read());
          item = find();
        }
      }
    }
    const current = Object.fromEntries(item.fieldValues.nodes.filter((v) => v.field).map((v) => [v.field.name, list([v.name, v.number, v.date, v.text, v.title, v.startDate].filter((x) => x !== undefined && x !== null))]));
    for (const [name, value] of Object.entries(d.fields)) {
      if (value === undefined || current[name]?.includes(String(value))) continue;
      const f = fields.get(name), option = f.options?.find((o) => o.name === String(value)), step = iterations(f).find((i) => i.title === String(value) || i.startDate === String(value));
      const v = option ? { singleSelectOptionId: option.id } : step ? { iterationId: step.id } : f.dataType === 'NUMBER' ? { number: Number(value) } : f.dataType === 'DATE' ? { date: String(value) } : { text: String(value) };
      graphql(B.queries.setField, { project: proj.id, item: item.id, field: f.id, value: v });
      out.push(msg('boardSet', { field: name, number: d.found.number, value }));
    }
  }
}

// What sync last wrote, as a hash of the issues it wanted: `next` and `status` name sync once the plan moved past it.
const boardFile = (cwd) => join(aidlcDir(cwd), config.state.board);
const hashOf = (docs) => createHash('sha256').update(JSON.stringify(docs)).digest('hex');
function boardBehind(st) { // a board that cannot be planned offline is sync's error to report, not next's
  try { return st.profile.github?.repo && readJson(boardFile(st.cwd))?.hash !== hashOf(wanted(st.cwd, st, st.profile.github).docs) ? msg('boardBehind', {}) : ''; } catch { return ''; }
}

// Syncs every intent and live unit; returns the writes it made, one line each.
export function sync(cwd) {
  const st = readState(cwd);
  const gh = github(st.profile);
  const { T, docs } = wanted(cwd, st, gh);
  const hash = hashOf(docs);
  const out = [];
  const read = gh.project && projectReader(gh);
  const proj = read && read().proj;
  const { options, missing, problems, create } = proj ? checkProject(proj, T, docs) : { options: {}, missing: [], problems: [], create: [] };
  const last = readJson(boardFile(cwd)) ?? {};
  if (missing.length || problems.length) {
    writeJson(boardFile(cwd), { ...last, options });
    throw new UsageError(missing.length ? msg('boardNoOptions', { missing }) : msg('boardRefused', { problems }));
  }
  if (create.length) createFields(proj, create, out);
  const set = issues(gh, docs, out, st.profile.board.backoff, last.set ?? {});
  if (read) project(gh, docs, out, st.profile.board.backoff, read);
  writeJson(boardFile(cwd), { hash, options, set, at: new Date().toISOString() });
  return out.join('') || msg('boardInSync', {});
}

export const issueTitle = (profile, number) => rest('GET', `repos/${github(profile).repo}/issues/${number}`).title;

// Polls the pushed base head's Actions runs until each completed, one is red, or ci.wait seconds passed; records them.
const C = config.ci;
function ciWait(cwd) {
  const st = readState(cwd);
  const wait = Number(st.profile.ci?.wait);
  if (!wait || !st.profile.github?.repo) throw new UsageError(msg('ciUsage', {}));
  const gh = github(st.profile);
  const sha = git(cwd, 'rev-parse', st.base);
  if (tryGit(cwd, 'rev-parse', '-q', '--verify', `${config.gate.remote}/${st.base}`) !== sha) throw new UsageError(msg('ciNotPushed', { base: st.base }));
  const until = Date.now() + wait * 1000;
  const red = (r) => C.red.includes(r.conclusion);
  let runs;
  for (;;) {
    runs = rest('GET', `repos/${gh.repo}/actions/runs?head_sha=${sha}&per_page=${B.perPage}`).workflow_runs
      .map((r) => ({ id: r.id, name: r.name, status: r.status, conclusion: r.conclusion ?? '', url: r.html_url }));
    const finished = runs.length > 0 && runs.every((r) => r.status === C.completed);
    if (finished || runs.some(red) || Date.now() >= until) break;
    sleep(Math.min(Number(st.profile.ci.interval) * 1000, until - Date.now()));
  }
  // No run when the wait ended: no workflow runs for this commit, which counts as green.
  const state = !runs.length ? 'none' : runs.some(red) ? 'red' : runs.every((r) => r.status === C.completed) ? 'green' : 'pending';
  writeJson(ciFile(cwd), { sha, state, runs, at: new Date().toISOString() });
  const logs = runs.filter(red).map((r) => msg('ciLog', { log: render(C.log, r, 'ci.log') })).join('');
  return done(msg('ciResult', { base: st.base, sha: sha.slice(0, config.text.sha.long), state, runs }) + logs, state === 'red' ? config.exit.findings : config.exit.ok);
}

export const commands = {
  sync(args, { cwd }) {
    return done(sync(cwd));
  },
  ci([sub, ...more], { cwd }) {
    if (sub !== 'wait' || more.length) throw new UsageError(msg('ciUsage', {}));
    return ciWait(cwd);
  },
};

// The board follows a merge, best effort: it never fails one (docs/design/board.md).
plug('afterMerge', (cwd) => { try { return sync(cwd); } catch (e) { return msg('boardFailed', { error: e.message.split('\n')[0] }); } }, (profile) => Boolean(profile.github));
plug('statusTail', boardBehind);
plug('issueTitle', issueTitle);

// With a board, each live unit carries the values it maps, except the derived ones (docs/design/board.md). The
// example uses the profile's own map, so the lead writes a value the board knows (PLAN-BOARD).
function lintBoard({ profile, units, add, base }) {
  const planned = Object.entries(profile.github?.fields ?? {}).map(([field, spec]) => ({ field, path: fieldPaths({ field: spec })[0], map: spec.map }))
    .filter((f) => ![config.board.wave, config.board.binding].includes(f.path));
  for (const u of units) {
    for (const { field, path, map } of planned.filter((f) => at(u.fm, f.path) === undefined)) {
      const value = map ? Object.keys(map)[0] : msg('planBoardAny', {});
      const example = path.split('.').reduceRight((inner, key, k) => (k ? `{ ${key}: ${inner} }` : `${key}: ${inner}`), value);
      const mapping = map ? msg('planBoardMap', { pairs: Object.entries(map).map(([from, to]) => msg('planBoardPair', { from, to })).join(', ') }) : '';
      add('PLAN-BOARD', u, 1, 'planBoard', { path, field, example, mapping });
    }
  }
  // A value must be an option the Project has, as the last sync read them; no sync yet, no check.
  const common = tryGit(base, 'rev-parse', '--git-common-dir');
  const options = (common && readJson(join(resolve(base, common), config.state.dir, config.state.board))?.options) ?? {};
  for (const u of units) {
    for (const { field, path, map } of planned.filter((f) => options[f.field] && at(u.fm, f.path) !== undefined)) {
      const value = map ? map[String(at(u.fm, path))] : at(u.fm, path);
      if (value !== undefined && !options[field].includes(String(value))) add('PLAN-BOARD', u, 1, 'planBoardOption', { path, value, field, options: options[field].join(', ') });
    }
  }
}
plug('planRules', lintBoard);
