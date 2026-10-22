// Hook entry points: `aidlc hook <name>` reads the hook JSON on stdin and prints the decision JSON
// (docs/design/hooks.md). Deny lists, patterns, codes and messages come from cli.json.
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { config, UsageError } from './config.mjs';
import { msg } from './template.mjs';
import { loadProfile, withDefaults } from './profile.mjs';
import { checkBundle, parseDoc, writeIndexes } from './okf.mjs';
import { inside, readPlan } from './grid.mjs';
import { aidlcDir, baseOf, bundleOf, git, nextAction, readState, runtimeFile, tryGit, writeJson } from './state.mjs';
import { directAllowed, mergeWritten } from './gate.mjs';

const H = config.hooks;
const S = config.state;

// ---- Shell parsing: argv per segment, enough for a deny list, not a shell model ----

export function segments(command) {
  const out = [[]];
  let word = null;
  let quote = null;
  const push = () => { if (word !== null) out[out.length - 1].push(word); word = null; };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += c;
    } else if (c === '"' || c === "'") { word = word ?? ''; quote = c; }
    else if (c === '\\' && i + 1 < command.length) word = (word ?? '') + command[++i];
    else if (/\s/.test(c) && c !== '\n') push();
    else if (/[;&|\n()]/.test(c)) { push(); if (out[out.length - 1].length) out.push([]); }
    else word = (word ?? '') + c;
  }
  push();
  return out.filter((s) => s.length).map((s) => {
    let k = 0;
    while (k < s.length && /^[A-Za-z_]\w*=/.test(s[k])) k++;
    if (['sudo', 'env', 'command', 'exec'].includes(s[k])) k++;
    return s.slice(k);
  });
}

// `git [global options] <sub> <args>` → { sub, args }, or null.
function gitCall(argv) {
  if (!argv.length || argv[0].split('/').pop() !== 'git') return null;
  let k = 1;
  while (k < argv.length && argv[k].startsWith('-')) k += H.git.globalWithValue.includes(argv[k]) ? 2 : 1;
  return { sub: argv[k], args: argv.slice(k + 1) };
}

const isCli = (argv) => argv.some((a, k) => H.cli.some((c) => a === c || a.endsWith('/' + c)) && argv[k + 1] === 'approve');

// ---- Decisions ----

const allow = () => '{}';
function deny(cwd, input, code, key, data, decision = 'deny') {
  const message = msg(key, data);
  let reason = msg('hookDeny', { code, message, fix: H.codes[code].fix });
  if (decision === 'deny' && input.session_id) {
    const file = join(aidlcDir(cwd), H.denials);
    const all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    const key2 = `${code} ${message}`;
    const counts = (all[input.session_id] ??= {});
    counts[key2] = (counts[key2] ?? 0) + 1;
    writeJson(file, all);
    if (counts[key2] >= H.escalateAt) reason = msg('hookEscalate', { reason, count: counts[key2] });
  }
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } });
}

function guard(input, cwd) {
  const { profile } = loadProfile(cwd);
  const base = baseOf(profile);
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  const bundleRel = relative(top, bundleOf(top, profile)).split('\\').join('/');
  const branch = tryGit(cwd, 'rev-parse', '--abbrev-ref', 'HEAD');
  for (const argv of segments(String(input.tool_input?.command ?? ''))) {
    if (isCli(argv)) return deny(cwd, input, 'GUARD-APPROVE', 'guardApprove', {});
    for (const [tool, sub] of H.ask) if (argv[0]?.split('/').pop() === tool && argv.includes(sub)) return deny(cwd, input, 'GUARD-RELEASE', 'guardRelease', { what: `${tool} ${sub}` }, 'ask');
    const g = gitCall(argv);
    if (!g) continue;
    const { sub, args } = g;
    const refs = args.filter((a) => !a.startsWith('-'));
    if (sub === 'push') {
      if (args.some((a) => H.force.includes(a)) || refs.some((r) => r.startsWith('+'))) return deny(cwd, input, 'GUARD-FORCE', 'guardForce', {});
      const specs = refs.slice(1);
      const hitsBase = specs.some((r) => r === base || r.endsWith(`:${base}`) || r.endsWith(`/${base}`)) || (!specs.length && branch === base);
      if (args.some((a) => H.deleteFlags.includes(a)) && hitsBase || specs.some((r) => r === `:${base}`)) return deny(cwd, input, 'GUARD-BASE-DELETE', 'guardDelete', { base });
      if (hitsBase) return deny(cwd, input, 'GUARD-PUSH', 'guardPush', { base });
    }
    if (sub === 'branch' && args.some((a) => H.deleteFlags.includes(a)) && refs.includes(base)) return deny(cwd, input, 'GUARD-BASE-DELETE', 'guardDelete', { base });
    if (sub === 'commit') {
      if (args.some((a) => H.noVerify.includes(a) || (/^-[^-]/.test(a) && a.slice(1).includes(H.noVerifyShort)))) return deny(cwd, input, 'GUARD-NOVERIFY', 'guardNoVerify', {});
      if (branch === base) {
        const all = args.some((a) => a === '--all' || /^-[^-]*a/.test(a));
        const staged = [git(cwd, 'diff', '--cached', '--name-only'), all ? git(cwd, 'diff', '--name-only') : ''].join('\n').split('\n').filter(Boolean);
        const bad = staged.find((p) => !directAllowed(p, bundleRel));
        if (bad) return deny(cwd, input, 'GUARD-BASE-COMMIT', 'guardBaseCommit', { base, path: bad });
      }
    }
    if (sub === 'merge') {
      const unitBranch = refs.find((r) => r.startsWith(S.branchPrefix));
      if (unitBranch) return deny(cwd, input, 'GUARD-MERGE', 'guardMerge', { branch: unitBranch });
    }
  }
  return allow();
}

// The text a Write or Edit would leave in the file.
function resulting(input, file) {
  const t = input.tool_input ?? {};
  if (typeof t.content === 'string') return t.content;
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const edits = Array.isArray(t.edits) ? t.edits : [t];
  return edits.reduce((text, e) => (typeof e.old_string === 'string' ? (e.replace_all ? text.split(e.old_string).join(e.new_string ?? '') : text.replace(e.old_string, e.new_string ?? '')) : text), current);
}

const approvalPart = (text) => {
  const fm = parseDoc(text).fm ?? {};
  const events = [fm.verified].flat().filter((e) => e && String(e.by ?? '').startsWith(S.human));
  return JSON.stringify([events, fm.verified_hash ?? null]);
};

const unitOfBranch = (cwd) => {
  const b = tryGit(cwd, 'rev-parse', '--abbrev-ref', 'HEAD') ?? '';
  return b.startsWith(S.branchPrefix) ? b.slice(S.branchPrefix.length) : null;
};

function scope(input, cwd) {
  const file = resolve(cwd, String(input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? ''));
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  const path = relative(top, file).split('\\').join('/');
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (file.endsWith(config.okf.ext) && approvalPart(before) !== approvalPart(resulting(input, file))) return deny(cwd, input, 'SCOPE-APPROVAL', 'scopeApproval', { path });
  const unit = unitOfBranch(cwd);
  if (!unit || path.startsWith('..')) return allow();
  const { profile } = loadProfile(top);
  const bundleRel = relative(top, bundleOf(top, profile)).split('\\').join('/');
  if (mergeWritten(path, bundleRel, profile)) return deny(cwd, input, 'SCOPE-SHARED', 'scopeShared', { path });
  const doc = readPlan(bundleOf(top, profile)).units.find((u) => u.id === unit);
  if (!doc || !doc.scope.some((g) => inside('/' + path, g))) return deny(cwd, input, 'SCOPE-OUT', 'scopeOut', { path, unit });
  return allow();
}

function secrets(input, cwd) {
  const file = resolve(cwd, String(input.tool_input?.file_path ?? ''));
  const t = input.tool_input ?? {};
  const added = [t.content, t.new_string, ...(Array.isArray(t.edits) ? t.edits.map((e) => e.new_string) : [])].filter((x) => typeof x === 'string').join('\n');
  const { profile } = loadProfile(cwd);
  const patterns = [...H.secrets, ...(profile.security?.secrets ?? [])].map((p) => new RegExp(p, 'i'));
  if (patterns.some((re) => re.test(added))) return deny(cwd, input, 'SECRET', 'secretFound', { path: relative(cwd, file) });
  return allow();
}

function model(input, cwd) {
  const t = input.tool_input ?? {};
  const agent = String(t.subagent_type ?? '');
  const role = H.agents.find((a) => agent.endsWith(a));
  if (!role) return allow();
  const unit = String(t.prompt ?? '').match(new RegExp(H.unitPattern))?.[0];
  if (!unit) return deny(cwd, input, 'MODEL-UNIT', 'modelUnit', { agent });
  const card = existsSync(runtimeFile(cwd, 'cards', unit)) ? JSON.parse(readFileSync(runtimeFile(cwd, 'cards', unit), 'utf8')) : null;
  const expected = role === H.agents[0] ? card?.model : withDefaults(loadProfile(cwd).profile).models.review;
  if (!expected) return deny(cwd, input, 'MODEL-UNIT', 'modelUnit', { agent });
  if (t.model !== expected) return deny(cwd, input, 'MODEL-MISMATCH', 'modelMismatch', { agent, unit, model: t.model ?? 'none', expected });
  return allow();
}

function docs(input, cwd) {
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  const { profile } = loadProfile(top);
  const bundle = bundleOf(top, profile);
  const file = resolve(cwd, String(input.tool_input?.file_path ?? ''));
  if (!file.startsWith(bundle + '/')) return allow();
  if (!unitOfBranch(cwd)) writeIndexes(bundle);
  const errors = checkBundle(bundle, { rules: profile.docs?.rules ?? {}, base: top }).filter((f) => f.level === 'error' && f.path === relative(top, file));
  if (!errors.length) return allow();
  return JSON.stringify({ decision: 'block', reason: msg('docsErrors', { errors: errors.map((f) => msg('finding', f).trim()).join('\n') }) });
}

function heartbeat(input, cwd) {
  const unit = unitOfBranch(cwd);
  if (!unit) return allow();
  const file = join(aidlcDir(cwd), S.heartbeats, unit);
  mkdirSync(dirname(file), { recursive: true });
  if (!existsSync(file)) writeFileSync(file, '');
  const now = new Date();
  utimesSync(file, now, now);
  return allow();
}

function steer(input, cwd) {
  const file = join(aidlcDir(cwd), H.denials);
  if (existsSync(file) && input.session_id) {
    const all = JSON.parse(readFileSync(file, 'utf8'));
    delete all[input.session_id];
    writeJson(file, all);
  }
  if (input.stop_hook_active || String(input.last_assistant_message ?? '').trim().endsWith('?')) return allow();
  const next = nextAction(readState(cwd));
  return next.kind === 'act' ? JSON.stringify({ decision: 'block', reason: next.line }) : allow();
}

function status(input, cwd) {
  const st = readState(cwd);
  const resume = msg('statusResume', {});
  const lines = [...st.intents.map((i) => msg('statusIntent', { id: i.id, state: i.state, title: i.fm.title ?? '' })),
    ...st.units.filter((u) => u.state !== 'merged').map((u) => msg('statusUnit', { id: u.id, state: u.state, title: u.fm.title ?? '' }))];
  const tail = msg('statusNext', { line: nextAction(st).line }) + resume;
  let out = '';
  for (let k = 0; k < lines.length; k++) {
    const more = msg('statusMore', { count: lines.length - k });
    if ((out + lines[k] + more + tail).length > S.statusMax) { out += more; break; }
    out += lines[k];
  }
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: out + tail } });
}

const HOOKS = { guard, scope, secrets, model, docs, heartbeat, steer, status };

export const commands = {
  hook(args, ctx) {
    const run = HOOKS[args[0]];
    if (!run) throw new UsageError(msg('unknownCommand', { name: args[0] ?? '' }));
    const input = JSON.parse(ctx.stdin ? ctx.stdin() : readFileSync(0, 'utf8'));
    const cwd = input.cwd ?? ctx.cwd;
    return { code: config.exit.ok, findings: [], output: run(input, cwd) + '\n' };
  },
};
