#!/usr/bin/env node
// A recorded stand-in for `gh api`: serves the REST and GraphQL calls the board makes from a JSON
// state file ($GH_STUB) and logs every call, so tests can count writes.
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.env.GH_STUB;
const s = JSON.parse(readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const body = args.includes('--input') ? JSON.parse(readFileSync(0, 'utf8') || 'null') : null;
const reply = (data) => { writeFileSync(file, JSON.stringify(s, null, 2)); process.stdout.write(JSON.stringify(data)); };
const issue = (n) => s.issues.find((i) => i.number === Number(n));
const labels = (names) => names.map((name) => ({ name }));

if (args[1] === 'graphql') {
  const q = body.query;
  const v = body.variables;
  const p = s.project;
  if (q.includes('projectV2(number')) {
    s.calls.push({ op: 'project' });
    const owner = q.includes('organization(') ? 'organization' : 'user';
    const start = Number(v.cursor ?? 0);
    const page = p.items.slice(start, start + 2); // tiny pages exercise the cursor
    const value = (f, x) => {
      const field = { name: f.name };
      if (f.options) return { name: x, field };
      return f.dataType === 'NUMBER' ? { number: x, field } : f.dataType === 'DATE' ? { date: x, field } : { text: x, field };
    };
    const nodes = page.map((i) => ({ id: i.id, content: { number: i.number, repository: { nameWithOwner: i.repo } },
      fieldValues: { nodes: Object.entries(i.values).map(([n, x]) => value(p.fields.find((f) => f.name === n), x)).concat([{}]) } }));
    const more = start + 2 < p.items.length;
    reply({ data: { [owner]: { projectV2: { id: p.id, fields: { nodes: p.fields.concat([{}]) },
      items: { pageInfo: { hasNextPage: more, endCursor: more ? String(start + 2) : null }, nodes } } } } });
  } else if (q.includes('addProjectV2ItemById')) {
    const i = s.issues.find((x) => x.node_id === v.content);
    const item = { id: `PVTI_${i.number}`, number: i.number, repo: s.repo, values: {} };
    p.items.push(item);
    s.calls.push({ op: 'addItem', write: true });
    reply({ data: { addProjectV2ItemById: { item: { id: item.id } } } });
  } else if (q.includes('updateProjectV2ItemFieldValue')) {
    const f = p.fields.find((x) => x.id === v.field);
    const x = v.value;
    p.items.find((i) => i.id === v.item).values[f.name] = x.singleSelectOptionId ? f.options.find((o) => o.id === x.singleSelectOptionId).name : x.number ?? x.date ?? x.text;
    s.calls.push({ op: 'setField', field: f.name, write: true });
    reply({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: v.item } } } });
  } else process.exit(1);
} else {
  const method = args[args.indexOf('-X') + 1];
  const [path, query = ''] = args[args.indexOf('-X') + 2].split('?');
  const page = Number(new URLSearchParams(query).get('page') ?? 1);
  const per = Number(new URLSearchParams(query).get('per_page') ?? 100);
  const slice = (list) => list.slice((page - 1) * per, page * per);
  const parts = path.replace(`repos/${s.repo}/`, '').split('/');
  s.calls.push({ method, path, write: method !== 'GET' });
  if (parts[0] === 'labels') {
    if (method === 'POST') { s.labels.push(body.name); reply({ name: body.name }); } else reply(slice(labels(s.labels)));
  } else if (parts.length === 1) {
    if (method === 'GET') reply(slice(s.issues.map((i) => ({ ...i, labels: labels(i.labels) }))));
    else {
      const number = Math.max(0, ...s.issues.map((i) => i.number)) + 1;
      const created = { number, id: 1000 + number, node_id: `I_${number}`, title: body.title, body: body.body, state: 'open', labels: body.labels ?? [], parent: null };
      s.issues.push(created);
      reply({ ...created, labels: labels(created.labels) });
    }
  } else if (parts.length === 2) {
    const i = issue(parts[1]);
    if (method === 'PATCH') Object.assign(i, body);
    reply({ ...i, labels: labels(i.labels) });
  } else if (parts[2] === 'sub_issues') {
    if (method === 'POST') { s.issues.find((i) => i.id === body.sub_issue_id).parent = Number(parts[1]); reply({}); }
    else reply(slice(s.issues.filter((i) => i.parent === Number(parts[1]))));
  } else process.exit(1);
}
