// Jira: the board's items written onto a Jira project through acli, Atlassian's CLI, which owns the login
// (docs/design/board-jira.md). The board extension derives the items; this one reads the project first and writes
// only what differs. No other command reads the board.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config, list, msg, plug, readJson, readState, render, seam, writeJson } from '../../lib/index.mjs';

const J = config.jira;
const KEY = 'jira'; // the profile section this extension serves
let acliCommand = [J.acli]; // `jira.acli` overrides it

function acli(args) {
  let out;
  try {
    out = execFileSync(acliCommand[0], [...acliCommand.slice(1), 'jira', 'workitem', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: Infinity });
  } catch (e) {
    // acli's own message says what failed; the command line does not.
    throw new Error(`${args.slice(0, J.errorArgs).join(' ')}: ${(e.stderr || e.stdout || e.message).trim().split('\n').join(' ')}`);
  }
  return args.includes('--json') && out.trim() ? JSON.parse(out) : null;
}

// A body as ADF: each AC a task item, each other `- ` line a bullet, any other line a paragraph.
function adf(body) {
  const content = [], text = (t) => [{ type: 'text', text: t }];
  let id = 0;
  const into = (type, node) => {
    if (content.at(-1)?.type !== type) content.push({ type, ...(type === 'taskList' ? { attrs: { localId: String(++id) } } : {}), content: [] });
    content.at(-1).content.push(node);
  };
  for (const line of body.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const task = line.match(new RegExp(J.task)), bullet = line.match(new RegExp(J.bullet));
    if (task) into('taskList', { type: 'taskItem', attrs: { localId: String(++id), state: J.taskState[task[1]] }, content: text(task[2]) });
    else if (bullet) into('bulletList', { type: 'listItem', content: [{ type: 'paragraph', content: text(bullet[1]) }] });
    else content.push({ type: 'paragraph', content: text(line) });
  }
  return { type: 'doc', version: 1, content };
}

// A description read back as the lines adf() wrote, whatever Jira keeps around them; plain text reads as itself.
const box = Object.fromEntries(Object.entries(J.taskState).map(([b, s]) => [s, b]));
function lines(node) {
  if (!node) return [];
  if (typeof node === 'string') return node.split('\n');
  const inline = (n) => (n.content ?? []).map((c) => (c.type === 'text' ? c.text : c.type === 'hardBreak' ? '\n' : inline(c))).join('');
  if (node.type === 'paragraph') return inline(node).split('\n');
  if (node.type === 'taskItem') return [`- [${box[node.attrs?.state]}] ${inline(node)}`];
  if (node.type === 'listItem') return (node.content ?? []).flatMap(lines).map((l, k) => (k ? l : `- ${l}`));
  return (node.content ?? []).flatMap(lines);
}
const same = (a, b) => a.map((l) => l.trim()).filter(Boolean).join('\n') === b.map((l) => l.trim()).filter(Boolean).join('\n');

// Syncs every intent and live bolt the board derives; returns the writes it made, one line each.
function syncJira(cwd, st = readState(cwd)) {
  const P = st.profile[KEY];
  acliCommand = list(P.acli ?? J.acli);
  const { docs, hash, file } = seam('boardItems', st.profile)[0](cwd, st, KEY);
  const last = readJson(file)?.set ?? {}, out = [];
  const label = (l) => l.replace(new RegExp(J.label.pattern, 'g'), J.label.with); // Jira's label rule
  const items = docs.map((d) => {
    const marker = render(J.marker, { id: d.id });
    return { ...d, marker, labels: [...new Set([...d.labels.map(label), marker])], status: d.fields[J.statusField], named: new RegExp(J.key).test(String(d.issue ?? '')) ? String(d.issue) : null };
  });
  const number = (key) => Number(String(key).split('-').pop());
  const search = () => {
    if (!items.length) return [];
    const labels = items.map((d) => render(J.jqlLabel, { name: d.marker })).join(', ');
    const got = acli(['search', '--jql', render(J.jql, { project: P.project, labels }), '--limit', String(J.limit), '--paginate', '--json', '--fields', J.fields]);
    return (Array.isArray(got) ? got : got?.issues ?? []).sort((a, b) => number(a.key) - number(b.key)); // the oldest copy wins
  };
  const view = (key) => acli(['view', key, '--json', '--fields', J.viewFields]); // the default view leaves out labels, parent and links
  let all = search(), again = false;
  // board.issue names the item; else its marker label finds it.
  const find = (d) => (d.named ? all.find((i) => i.key === d.named) ?? view(d.named) : all.find((i) => list(i.fields?.labels).includes(d.marker)));
  const tmp = mkdtempSync(join(tmpdir(), J.tmp));
  try {
    const describe = (d) => { const f = join(tmp, J.descriptionFile); writeFileSync(f, JSON.stringify(adf(d.body))); return f; };
    for (const d of items) {
      let item = find(d) ?? (again ? undefined : ((again = true), (all = search()), find(d))); // a lagging search must not duplicate
      if (!item) {
        const parent = d.parent && items.find((p) => p.key === d.parent)?.found?.key;
        const made = acli(['create', '--project', P.project, '--type', d.type, '--summary', d.title, '--description-file', describe(d), '--label', d.labels.join(','), ...(parent ? ['--parent', parent] : []), '--json']);
        item = view(made.key);
        out.push(msg('jiraCreated', { key: made.key, type: d.type, title: d.title, under: parent ? msg('jiraUnder', { parent }) : '' }));
      } else {
        // What the plugin set and the plan no longer gives goes; what people added stays.
        const now = list(item.fields?.labels), set = last[d.key]?.labels ?? [];
        const keep = [...new Set([...now.filter((x) => d.labels.includes(x) || !set.includes(x)), ...d.labels])], drop = now.filter((x) => !keep.includes(x));
        const change = [
          ...(item.fields?.summary !== d.title ? [['--summary', d.title]] : []),
          ...(same(lines(item.fields?.description), d.body.split('\n')) ? [] : [['--description-file', describe(d)]]),
          ...(keep.some((x) => !now.includes(x)) || drop.length ? [['--labels', keep.join(',')]] : []),
          ...(drop.length ? [['--remove-labels', drop.join(',')]] : []),
        ];
        if (change.length) {
          acli(['edit', '--key', item.key, ...change.flat(), '--yes', '--json']);
          out.push(msg('jiraUpdated', { key: item.key, what: [...new Set(change.map(([flag]) => J.what[flag]))].join(', ') }));
        }
      }
      if (d.status && item.fields?.status?.name !== d.status) {
        acli(['transition', '--key', item.key, '--status', d.status, '--yes', '--json']);
        out.push(msg('jiraMoved', { key: item.key, status: d.status }));
      }
      d.found = item;
    }
    // Each dependency blocks the bolt; a link the plan drops stays for people to remove.
    for (const d of items.filter((x) => x.blockedBy)) {
      const links = d.found.fields?.issuelinks ?? view(d.found.key).fields?.issuelinks ?? []; // a search returns no links: view them
      const have = links.filter((l) => l.type?.name === J.link.type).map((l) => l[J.link.side]?.key);
      for (const by of d.blockedBy.map((id) => items.find((x) => x.id === id)?.found?.key).filter((k) => k && !have.includes(k))) {
        acli(['link', 'create', J.link.blocker, by, J.link.blocked, d.found.key, '--type', J.link.type, '--yes']);
        out.push(msg('jiraBlocked', { key: d.found.key, by }));
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  writeJson(file, { hash, set: Object.fromEntries(items.map((d) => [d.key, { labels: d.labels }])), at: new Date().toISOString() });
  return out.join('') || msg('jiraInSync', { project: P.project });
}

// The board's `sync` runs it, and a merge follows it, best effort: it never fails one (docs/design/board-jira.md#when).
const on = (profile) => Boolean(profile[KEY]?.project);
plug('boardSync', syncJira, on);
plug('afterMerge', (cwd, st) => { try { return syncJira(cwd); } catch (e) { return msg('jiraFailed', { project: st.profile[KEY].project, error: e.message.split('\n')[0] }); } }, on);
