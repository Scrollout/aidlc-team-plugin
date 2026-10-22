// Board: a one-way projection of derived state onto GitHub issues and a Project, through `gh api` only
// (docs/design/board.md). No other command reads the board; it writes only what differs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { at, config, UsageError } from './config.mjs';
import { msg, render } from './template.mjs';
import { templateFile } from './card.mjs';
import { git, readState } from './state.mjs';

const B = config.board;

function api(args, body) {
  let out;
  try {
    const opts = { input: body ? JSON.stringify(body) : '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
    out = execFileSync(B.gh, ['api', ...args, ...(body ? ['--input', '-'] : [])], opts);
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

const github = (profile) => {
  if (!profile.github?.repo) throw new UsageError(msg('boardOff', {}));
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
    const value = (path) => at(d.fm, path) ?? (kind === 'unit' && path === B.wave ? wave(d) : undefined);
    const done = B.done.includes(state);
    const acs = (d.acs ?? []).map((a) => ({ box: done ? 'x' : ' ', text: d.doc.lines[a.line - 1].replace(/^\s*[-*]\s+/, '') }));
    const marker = msg('boardMarker', { kind, id: d.id });
    const data = { description: String(d.fm.description ?? ''), link: `https://github.com/${gh.repo}/blob/${st.base}/${relative(top, d.file).split('\\').join('/')}`, marker };
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
    ...st.intents.map((i) => one(i, 'intent', i.state, null)),
    ...st.units.map((u) => one(u, 'unit', u.fm.hold && B.holdable.includes(u.state) ? B.held : u.state, u.fm.intent ? `intent:${u.fm.intent}` : null)),
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

function issues(gh, docs, out) {
  const repo = `repos/${gh.repo}`;
  const assignees = gh.assignees ?? [rest('GET', 'user').login];
  const typed = rest('GET', repo).owner?.type === B.typedOwner; // issue types exist on organisation repositories only
  const stones = milestones(repo, docs, out);
  const list = () => pages(`${repo}/issues?state=all`).filter((i) => !i.pull_request).sort((a, b) => a.number - b.number); // the oldest copy wins
  let [all, relisted] = [list(), false];
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

function project(gh, docs, out) {
  const m = String(gh.project).match(new RegExp(B.project));
  if (!m) throw new UsageError(msg('boardProject', { project: gh.project }));
  const owner = B.owners[m[1]];
  const query = render(B.queries.project, { owner }, 'board.queries.project');
  const items = [];
  let proj;
  let cursor = null;
  do {
    proj = graphql(query, { login: m[2], number: Number(m[3]), cursor })[owner].projectV2;
    items.push(...proj.items.nodes);
    cursor = proj.items.pageInfo.hasNextPage ? proj.items.pageInfo.endCursor : null;
  } while (cursor);
  const fields = new Map(proj.fields.nodes.filter((f) => f.name).map((f) => [f.name, f]));
  for (const d of docs) {
    let item = items.find((i) => i.content?.number === d.found.number && i.content?.repository?.nameWithOwner === gh.repo);
    if (!item) {
      item = { id: graphql(B.queries.addItem, { project: proj.id, content: d.found.node_id }).addProjectV2ItemById.item.id, fieldValues: { nodes: [] } };
      out.push(msg('boardAdded', { number: d.found.number }));
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

// Syncs every intent and live unit; returns the writes it made, one line each.
export function sync(cwd) {
  const st = readState(cwd);
  const gh = github(st.profile);
  const docs = wanted(cwd, st, gh);
  const out = [];
  issues(gh, docs, out);
  if (gh.project) project(gh, docs, out);
  return out.join('') || msg('boardInSync', {});
}

export const issueTitle = (profile, number) => rest('GET', `repos/${github(profile).repo}/issues/${number}`).title;

export const commands = {
  sync(args, { cwd }) {
    return { code: config.exit.ok, findings: [], output: sync(cwd) };
  },
};
