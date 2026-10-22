// Board: a one-way projection of derived state onto GitHub issues and a Project, through `gh api` only
// (docs/design/board.md). No other command reads the board; it writes only what differs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { config, UsageError } from './config.mjs';
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

const at = (obj, path) => path.split('.').reduce((v, k) => (v !== null && typeof v === 'object' ? v[k] : undefined), obj);
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
  const one = (d, kind, state, parent) => {
    const done = B.done.includes(state);
    const acs = (d.acs ?? []).map((a) => ({ box: done ? 'x' : ' ', text: d.doc.lines[a.line - 1].replace(/^\s*[-*]\s+/, '') }));
    const marker = msg('boardMarker', { kind, id: d.id });
    const data = { description: String(d.fm.description ?? ''), link: `https://github.com/${gh.repo}/blob/${st.base}/${relative(top, d.file).split('\\').join('/')}`, marker };
    let body;
    do body = render(template, { ...data, acs }, file); while (body.length > B.maxBody && acs.pop());
    const fields = Object.fromEntries(Object.entries(gh.fields ?? {}).map(([name, spec]) => {
      const raw = at(d.fm, typeof spec === 'string' ? spec : spec.from);
      return [name, raw === undefined || raw === null ? undefined : spec.map ? spec.map[String(raw)] : raw];
    }));
    const labels = [...d.requirements, ...(kind === 'unit' ? [d.lane, ...d.modules] : [])].map(String);
    return { key: `${kind}:${d.id}`, marker, title: `${d.id} ${d.fm.title ?? ''}`.trim(), body, labels, open: !done,
      fields: { [gh.statusField ?? B.statusField]: status[state], ...fields }, parent, issue: at(d.fm, B.issue) };
  };
  return [
    ...st.intents.map((i) => one(i, 'intent', i.state, null)),
    ...st.units.map((u) => one(u, 'unit', u.fm.hold && B.holdable.includes(u.state) ? B.held : u.state, u.fm.intent ? `intent:${u.fm.intent}` : null)),
  ];
}

function issues(gh, docs, out) {
  const repo = `repos/${gh.repo}`;
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
      issue = rest('POST', `${repo}/issues`, { title: d.title, body: d.body, labels: d.labels });
      if (!d.open) issue = rest('PATCH', `${repo}/issues/${issue.number}`, { state });
      out.push(msg('boardCreated', { number: issue.number, title: d.title }));
    } else {
      const names = issue.labels.map((l) => l.name);
      const change = {};
      if (issue.title !== d.title) change.title = d.title;
      if ((issue.body ?? '') !== d.body) change.body = d.body;
      if (issue.state !== state) change.state = state;
      if (d.labels.some((l) => !names.includes(l))) change.labels = [...new Set([...names, ...d.labels])];
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
