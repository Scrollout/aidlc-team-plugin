#!/usr/bin/env node
// A recorded stand-in for `acli jira workitem`: serves the calls the Jira board makes from a JSON state file
// ($ACLI_STUB) and logs every call, so tests can count writes. Items are kept as Jira's REST API returns them.
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.env.ACLI_STUB;
const s = JSON.parse(readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const [, , command, sub] = args; // jira workitem <command> [sub]
const write = !['search', 'view'].includes(command);
s.calls.push({ args: args.slice(2), write });
const save = () => writeFileSync(file, JSON.stringify(s, null, 2));
const reply = (data) => { save(); process.stdout.write(data === undefined ? 'done\n' : JSON.stringify(data)); };
const fail = (text) => { save(); process.stderr.write(`${text}\n`); process.exit(1); };
const item = (key) => s.items.find((i) => i.key === key);
const csv = (v) => (v ? v.split(',').filter(Boolean) : []);

if (command === 'search') {
  // As the real acli: a search may not ask for parent or issuelinks, and returns neither.
  const asked = String(flag('--fields') ?? '').split(','), refused = asked.filter((f) => ['parent', 'issuelinks'].includes(f));
  if (refused.length) fail(`✗ Error: fields '${refused.join(', ')}' are not allowed`);
  const jql = flag('--jql');
  const labels = [...(jql.match(/labels in \(([^)]*)\)/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const project = jql.match(/project = "([^"]+)"/)[1];
  const hidden = s.lag > 0 ? s.lag-- : 0; // the newest items, not indexed yet
  const found = s.items.filter((i) => i.key.startsWith(`${project}-`) && i.fields.labels.some((l) => labels.includes(l)));
  reply(found.slice(0, found.length - hidden).reverse().map(({ fields: { parent, issuelinks, ...fields }, ...i }) => ({ ...i, fields }))); // newest first, as Jira lists by default
} else if (command === 'view') {
  const i = item(args[3]);
  if (!i) fail(`Error: work item ${args[3]} does not exist or you do not have permission to see it`);
  reply(i);
} else if (command === 'create') {
  const project = flag('--project');
  const key = `${project}-${(s.next = (s.next ?? s.items.length) + 1)}`;
  const parent = flag('--parent');
  s.items.push({ key, fields: { summary: flag('--summary'), status: { name: 'To Do' }, labels: csv(flag('--label')), issuetype: { name: flag('--type') },
    description: JSON.parse(readFileSync(flag('--description-file'), 'utf8')), parent: parent ? { key: parent } : null, issuelinks: [] } });
  reply({ key });
} else if (command === 'edit') {
  const i = item(flag('--key'));
  if (!i) fail(`Error: work item ${flag('--key')} does not exist`);
  if (flag('--summary') !== undefined) i.fields.summary = flag('--summary');
  if (flag('--description-file')) i.fields.description = JSON.parse(readFileSync(flag('--description-file'), 'utf8'));
  i.fields.labels = [...new Set([...i.fields.labels, ...csv(flag('--labels'))])].filter((l) => !csv(flag('--remove-labels')).includes(l));
  reply({ key: i.key });
} else if (command === 'transition') {
  const i = item(flag('--key'));
  if (!s.statuses.includes(flag('--status'))) fail(`Error: no transition to ${flag('--status')}`);
  i.fields.status = { name: flag('--status') };
  reply({ key: i.key });
} else if (command === 'link' && sub === 'create') {
  const [out, inn, type] = [flag('--out'), flag('--in'), flag('--type')];
  // As Jira records `--out X --in Y` (seen on a live project): Y blocks X, so X lists Y inward and Y lists X outward.
  item(out).fields.issuelinks.push({ type: { name: type }, inwardIssue: { key: inn } });
  item(inn).fields.issuelinks.push({ type: { name: type }, outwardIssue: { key: out } });
  reply();
} else fail(`unknown command: ${args.join(' ')}`);
