// Board: a one-way projection of derived state onto GitHub issues and a Project, through `gh api` only
// (docs/design/board.md). No other command reads the board; it writes only what differs. Also reads the base's
// CI runs (docs/design/base-ci.md).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { at, config, done, list, readJson, relPath, UsageError } from '../../lib/foundation/data.mjs';
import { git, tryGit } from '../../lib/foundation/git.mjs';
import { msg, render } from '../../lib/foundation/text.mjs';
import { templateFile } from '../../lib/domains/card.mjs';
import { readState } from '../../lib/domains/flow.mjs';
import { aidlcDir, ciFile, writeJson } from '../../lib/foundation/store.mjs';
import { bindingName } from '../../lib/domains/construction.mjs';
import { plug } from '../../lib/foundation/seams.mjs';

const B = config.board;
let ghCommand = [B.gh]; // `github.gh` overrides it (docs/design/board.md)

function api(args, body) {
  let out;
  try {
    const opts = { input: body ? JSON.stringify(body) : '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
    out = execFileSync(ghCommand[0], [...ghCommand.slice(1), 'api', ...args, ...(body ? ['--input', '-'] : [])], opts);
  } catch (e) {
    // gh's own message (stderr, or the API's error body) says what failed; the command line does not.
    throw new Error(`${args.slice(0, 3).join(' ')}: ${(e.stderr || e.stdout || e.message).trim().split('\n').join(' ')}`);
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

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const github = (profile) => {
  if (!profile.github?.repo) throw new UsageError(msg('boardOff', {}));
  ghCommand = list(profile.github.gh ?? B.gh);
  return profile.github;
};

// The issue each intent and unit should have: title, body, labels, open or closed, Project fields, parent.
function wanted(cwd, st, gh) {
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  const status = { ...B.status, ...(gh.status ?? {}) };
  const file = templateFile(cwd, B.template);
  const template = readFileSync(file, 'utf8');
  const types = { ...B.types, ...(gh.types ?? {}) };
  const waves = new Map();
  const wave = (u) => { // 1 + the highest wave among its dependencies in its intent
    if (waves.has(u.id)) return waves.get(u.id);
    waves.set(u.id, 1); // a dependency cycle (PLAN-DAG) stops here
    const deps = u.depends.map((id) => st.units.find((x) => x.id === id && x.fm.intent === u.fm.intent)).filter(Boolean);
    waves.set(u.id, 1 + Math.max(0, ...deps.map(wave)));
    return waves.get(u.id);
  };
  const one = (d, kind, state, parent) => {
    const derived = { [B.wave]: () => wave(d), [B.binding]: () => bindingName(d, st.profile) }; // a value in the doc wins
    const value = (path) => at(d.fm, path) ?? (kind === 'unit' && derived[path] ? derived[path]() : undefined);
    const done = B.done.includes(state);
    const acs = (d.acs ?? []).map((a) => ({ box: done ? 'x' : ' ', text: d.doc.lines[a.line - 1].replace(/^\s*[-*]\s+/, '') }));
    const marker = msg('boardMarker', { kind, id: d.id });
    const data = { description: String(d.fm.description ?? ''), link: msg('boardLink', { repo: gh.repo, base: st.base, path: relPath(top, d.file) }), marker };
    let body;
    do body = render(template, { ...data, acs }, file); while (body.length > B.maxBody && acs.pop());
    const fields = Object.fromEntries(Object.entries(gh.fields ?? {}).map(([name, spec]) => {
      const raw = value(typeof spec === 'string' ? spec : spec.from);
      return [name, raw === undefined || raw === null ? undefined : spec.map ? spec.map[String(raw)] : raw];
    }));
    const labels = [...d.requirements, ...(kind === 'unit' ? [d.lane, ...d.modules] : [])].map(String);
    const title = `${d.id} ${d.fm.title ?? ''}`.trim();
    return { key: `${kind}:${d.id}`, marker, title, body, labels, open: !done, type: types[kind === 'unit' && !d.fm.intent ? 'fix' : kind],
      fields: { [gh.statusField ?? B.statusField]: status[state], ...fields }, parent, issue: at(d.fm, B.issue),
      group: kind === 'intent' ? `${kind}:${d.id}` : parent, milestone: kind === 'intent' ? { title, due: at(d.fm, B.target) } : null };
  };
  return [
    // An approved intent is under way once one of its units is past approval (docs/design/board.md).
    ...st.intents.map((i) => one(i, 'intent', i.state === 'approved' && st.units.some((u) => u.fm.intent === i.id && !B.unstarted.includes(u.state)) ? B.started : i.state, null)),
    ...st.units.map((u) => one(u, 'unit', u.held && B.holdable.includes(u.state) ? B.held : u.state, u.fm.intent ? `intent:${u.fm.intent}` : null)),
  ];
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
    } else if (due && (m.due_on ?? '').slice(0, 10) !== String(due)) {
      rest('PATCH', `${repo}/milestones/${m.number}`, { due_on });
      out.push(msg('boardMilestoneDue', { title, due }));
    }
    return [key, m.number];
  }));
}

function issues(gh, docs, out, backoff) {
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
      const extra = { assignees, milestone: stones.get(d.group), ...(typed && d.type ? { type: d.type } : {}) };
      issue = rest('POST', `${repo}/issues`, { title: d.title, body: d.body, labels: d.labels, ...extra });
      if (!d.open) issue = rest('PATCH', `${repo}/issues/${issue.number}`, { state });
      out.push(msg('boardCreated', { number: issue.number, title: d.title }));
    } else {
      const names = issue.labels.map((l) => l.name);
      const change = {};
      if (issue.title !== d.title) change.title = d.title;
      if ((issue.body ?? '') !== d.body) change.body = d.body;
      if (issue.state !== state) change.state = state;
      if (d.labels.some((l) => !names.includes(l))) change.labels = [...new Set([...names, ...d.labels])];
      const people = (issue.assignees ?? []).map((a) => a.login);
      if (assignees.some((a) => !people.includes(a))) change.assignees = [...new Set([...people, ...assignees])];
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

// Every planned value must be an option the Project has, checked before any write: a missing one stopped the
// first migration's sync halfway. The options are kept for plan lint (PLAN-BOARD).
function checkOptions(proj, docs) {
  const options = Object.fromEntries(proj.fields.nodes.filter((f) => f.name && f.options).map((f) => [f.name, f.options.map((o) => o.name)]));
  const missing = [...new Set(docs.flatMap((d) => Object.entries(d.fields)
    .filter(([name, value]) => value !== undefined && options[name] && !options[name].includes(String(value)))
    .map(([name, value]) => msg('boardMissingOption', { name, value, options: options[name].join(', ') }))))];
  return { options, missing };
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
    const current = Object.fromEntries(item.fieldValues.nodes.filter((v) => v.field).map((v) => [v.field.name, String(v.name ?? v.number ?? v.date ?? v.text)]));
    for (const [name, value] of Object.entries(d.fields)) {
      if (value === undefined || current[name] === String(value)) continue;
      const f = fields.get(name);
      if (!f) throw new UsageError(msg('boardNoField', { name }));
      const option = f.options?.find((o) => o.name === String(value));
      if (f.options && !option) throw new UsageError(msg('boardNoOption', { name, value }));
      const v = option ? { singleSelectOptionId: option.id } : f.dataType === 'NUMBER' ? { number: Number(value) } : f.dataType === 'DATE' ? { date: String(value) } : { text: String(value) };
      graphql(B.queries.setField, { project: proj.id, item: item.id, field: f.id, value: v });
      out.push(msg('boardSet', { field: name, number: d.found.number, value }));
    }
  }
}

// What sync last wrote, as a hash of the issues it wanted: `next` and `status` name sync once the plan moved past it.
const boardFile = (cwd) => join(aidlcDir(cwd), config.state.board);
const hashOf = (docs) => createHash('sha256').update(JSON.stringify(docs)).digest('hex');
export function boardBehind(st) { // a board that cannot be planned offline is sync's error to report, not next's
  try { return st.profile.github?.repo && readJson(boardFile(st.cwd))?.hash !== hashOf(wanted(st.cwd, st, st.profile.github)) ? msg('boardBehind', {}) : ''; } catch { return ''; }
}

// Syncs every intent and live unit; returns the writes it made, one line each.
export function sync(cwd) {
  const st = readState(cwd);
  const gh = github(st.profile);
  const docs = wanted(cwd, st, gh);
  const hash = hashOf(docs);
  const out = [];
  const read = gh.project && projectReader(gh);
  const { options, missing } = read ? checkOptions(read().proj, docs) : { options: {}, missing: [] };
  const last = readJson(boardFile(cwd)) ?? {};
  if (missing.length) {
    writeJson(boardFile(cwd), { ...last, options });
    throw new UsageError(msg('boardNoOptions', { missing }));
  }
  issues(gh, docs, out, st.profile.board.backoff);
  if (read) project(gh, docs, out, st.profile.board.backoff, read);
  writeJson(boardFile(cwd), { hash, options, at: new Date().toISOString() });
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
  return done(msg('ciResult', { base: st.base, sha: sha.slice(0, 12), state, runs }) + logs, state === 'red' ? config.exit.findings : config.exit.ok);
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
