// Hook entry points: `aidlc hook <name>` reads the hook JSON on stdin and prints the decision JSON
// (docs/design/hooks.md). Deny lists, patterns, codes and messages come from cli.json.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, utimesSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { config, readJson, UsageError, relPath } from './config.mjs';
import { msg } from './template.mjs';
import { loadProfile, withDefaults } from './profile.mjs';
import { checkBundle, parseDoc, writeIndexes } from './okf.mjs';
import { inside, readPlan } from './grid.mjs';
import { aidlcDir, baseOf, bump, bundleOf, commands as owner, git, heartbeatFresh, hostDeniedFile, nextAction, ownerLines, readState, runtimeFile, tryGit, writeJson } from './state.mjs';
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

// The owner command an argv runs (approve without --auto, upgrade, delegate), or undefined.
const ownerCommand = (argv) => H.owner.find((o) => argv.some((a, k) => H.cli.some((c) => a === c || a.endsWith('/' + c)) && argv[k + 1] === o) && !argv.includes(S.autoFlag));

// ---- Decisions ----

// Owner prompts the guard raised; the PostToolUse hook marks one `ran` when its call completes (docs/design/approvals.md).
const promptsFile = (cwd) => join(aidlcDir(cwd), H.prompts);
function recordPrompt(cwd, input, command) {
  const all = readJson(promptsFile(cwd)) ?? [];
  writeJson(promptsFile(cwd), [...all, { id: input.tool_use_id ?? null, command, at: new Date().toISOString() }].slice(-H.promptsKept));
}

const allow = () => '{}';
const approveWords = (text) => String(text ?? '').trim().match(new RegExp(H.approveWords, 'i'))?.[1].trim().split(/\s+/);
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
    bump(cwd, 'codes', code);
    if (counts[key2] >= H.escalateAt) {
      reason = msg('hookEscalate', { reason, count: counts[key2] });
      bump(cwd, 'escalations', config.retro.reasons.denials);
    }
  }
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } });
}

function guard(input, cwd) {
  const { profile } = loadProfile(cwd);
  const base = baseOf(profile);
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  const bundleRel = relPath(top, bundleOf(top, profile));
  const branch = tryGit(cwd, 'rev-parse', '--abbrev-ref', 'HEAD');
  // A scheduled prompt reaches the prompt hook as if typed: the lead may not schedule an approval (decision 0011).
  if (H.scheduled.includes(input.tool_name)) return approveWords(input.tool_input?.prompt) ? deny(cwd, input, 'GUARD-SCHEDULE', 'guardSchedule', {}) : allow();
  for (const argv of segments(String(input.tool_input?.command ?? ''))) {
    // The owner answers a permission prompt for an owner command; without prompts (bypass) it stays a `!` command (decision 0009).
    const owner = ownerCommand(argv);
    if (owner) {
      const command = argv.slice(argv.indexOf(owner)).join(' ');
      if (input.permission_mode === H.noPrompt) return deny(cwd, input, 'GUARD-OWNER', 'guardOwner', { command });
      recordPrompt(cwd, input, command);
      return deny(cwd, input, 'GUARD-OWNER', 'guardOwner', { command }, 'ask');
    }
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

const personalProfile = config.layers.find((l) => l.name === 'personal').path;
const approvalPart = (text) => {
  const fm = parseDoc(text).fm ?? {};
  const events = [fm.verified].flat().filter((e) => e && S.approvers.some((a) => String(e.by ?? '').startsWith(a)));
  return JSON.stringify([events, fm.verified_hash ?? null]);
};

const unitOfBranch = (cwd) => {
  const b = tryGit(cwd, 'rev-parse', '--abbrev-ref', 'HEAD') ?? '';
  return b.startsWith(S.branchPrefix) ? b.slice(S.branchPrefix.length) : null;
};

const real = (p) => (existsSync(p) ? realpathSync.native(p) : join(real(dirname(p)), basename(p))); // as git's top level: no symlink escape
function scope(input, cwd) {
  const file = real(resolve(cwd, String(input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? '')));
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  const path = relPath(top, file);
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (file.endsWith(config.okf.ext) && approvalPart(before) !== approvalPart(resulting(input, file))) return deny(cwd, input, 'SCOPE-APPROVAL', 'scopeApproval', { path });
  if (path === personalProfile) return deny(cwd, input, 'SCOPE-APPROVAL', 'scopeApproval', { path });
  const unit = unitOfBranch(cwd);
  if (!unit || path.startsWith('..')) return allow();
  const { profile } = loadProfile(top);
  const bundleRel = relPath(top, bundleOf(top, profile));
  if (mergeWritten(path, bundleRel, profile)) return deny(cwd, input, 'SCOPE-SHARED', 'scopeShared', { path });
  const scope = readJson(runtimeFile(cwd, 'cards', unit))?.scope ?? readPlan(bundleOf(top, profile)).units.find((u) => u.id === unit)?.scope ?? [];
  if (!scope.some((g) => inside('/' + path, g))) return deny(cwd, input, 'SCOPE-OUT', 'scopeOut', { path, unit });
  return allow();
}

function secrets(input, cwd) {
  const file = resolve(cwd, String(input.tool_input?.file_path ?? ''));
  const t = input.tool_input ?? {};
  const added = [t.content, t.new_string, ...(Array.isArray(t.edits) ? t.edits.map((e) => e.new_string) : [])].filter((x) => typeof x === 'string').join('\n');
  const { profile } = loadProfile(cwd);
  const patterns = [...H.secrets, ...(profile.security?.secrets ?? [])].map((p) => new RegExp(p, 'i'));
  if (patterns.some((re) => re.test(added))) return deny(cwd, input, 'SECRET', 'secretFound', { path: relPath(cwd, real(file)) });
  return allow();
}

function model(input, cwd) {
  const t = input.tool_input ?? {};
  const agent = String(t.subagent_type ?? '');
  if (agent.endsWith(H.researcher)) {
    const expected = withDefaults(loadProfile(cwd).profile).models.research;
    return t.model === expected ? allow() : deny(cwd, input, 'MODEL-MISMATCH', 'modelMismatch', { agent, unit: msg('researchFor', {}), model: t.model ?? 'none', expected, source: msg('modelSourceResearch', {}) });
  }
  const role = H.agents.find((a) => agent.endsWith(a));
  if (!role) return allow();
  const unit = String(t.prompt ?? '').match(new RegExp(H.unitPattern))?.[0];
  if (!unit) return deny(cwd, input, 'MODEL-UNIT', 'modelUnit', { agent });
  const card = existsSync(runtimeFile(cwd, 'cards', unit)) ? JSON.parse(readFileSync(runtimeFile(cwd, 'cards', unit), 'utf8')) : null;
  const expected = role === H.agents[0] ? card?.model : withDefaults(loadProfile(cwd).profile).models.review;
  if (!expected) return deny(cwd, input, 'MODEL-UNIT', 'modelUnit', { agent });
  const source = msg(role === H.agents[0] ? 'modelSourceCard' : 'modelSourceReview', {});
  if (t.model !== expected) return deny(cwd, input, 'MODEL-MISMATCH', 'modelMismatch', { agent, unit, model: t.model ?? 'none', expected, source });
  touch(join(aidlcDir(cwd), role === H.agents[1] ? S.reviewing : S.heartbeats, unit)); // in flight from launch: next waits for it
  return allow();
}

// A `generated.at` the edit wrote far from the current UTC time (a local time marked Z) becomes the current UTC second.
function restamp(input, file) {
  const t = input.tool_input ?? {};
  const written = [t.content, t.new_string, ...(Array.isArray(t.edits) ? t.edits.map((e) => e.new_string) : [])].filter((x) => typeof x === 'string').join('\n');
  const doc = parseDoc(readFileSync(file, 'utf8'));
  const at = doc.fm?.generated?.at;
  if (typeof at !== 'string' || !written.includes(at) || Number.isNaN(Date.parse(at)) || Math.abs(Date.parse(at) - Date.now()) <= config.okf.stampSkew * 1000) return null;
  const to = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const k = doc.lines.slice(0, doc.body).findIndex((l) => l.includes(at));
  if (k < 0) return null;
  doc.lines[k] = doc.lines[k].replace(at, to);
  writeFileSync(file, doc.lines.join('\n'));
  return msg('docsRestamped', { from: at, to });
}

function docs(input, cwd) {
  const top = real(git(cwd, 'rev-parse', '--show-toplevel'));
  const { profile } = loadProfile(top);
  const bundle = bundleOf(top, profile);
  const file = real(resolve(cwd, String(input.tool_input?.file_path ?? '')));
  if (!file.startsWith(bundle + sep)) return allow();
  const stamped = existsSync(file) ? restamp(input, file) : null;
  if (!unitOfBranch(cwd)) writeIndexes(bundle);
  const errors = checkBundle(bundle, { rules: profile.docs?.rules ?? {}, base: top }).filter((f) => f.level === 'error' && f.path === relPath(top, file));
  if (errors.length) return JSON.stringify({ decision: 'block', reason: (stamped ?? '') + msg('docsErrors', { errors: errors.map((f) => msg('finding', f).trim()).join('\n') }) });
  return stamped ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: stamped } }) : allow();
}

function touch(file) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, '', { flag: 'a' }); // creates it, never truncates
  utimesSync(file, new Date(), new Date());
}

// A builder's tool call keeps its unit's heartbeat fresh; a reviewer's keeps the reviews in flight fresh.
function heartbeat(input, cwd) {
  const prompts = readJson(promptsFile(cwd));
  const asked = input.tool_use_id && prompts?.find((p) => p.id === input.tool_use_id && !p.ran);
  if (asked) {
    const ran = new Date().toISOString();
    writeJson(promptsFile(cwd), prompts.map((p) => (p === asked ? { ...p, ran } : p)));
    bump(cwd, config.retro.interventions, { command: asked.command, at: ran }); // the owner's command ran
  }
  if (String(input.agent_type ?? '').endsWith(H.agents[1])) {
    const dir = join(aidlcDir(cwd), S.reviewing);
    for (const unit of existsSync(dir) ? readdirSync(dir) : []) if (heartbeatFresh(cwd, unit, Date.now(), S.reviewing)) touch(join(dir, unit));
    return allow(); // a reviewer reading a builder's worktree must not keep that builder alive
  }
  const unit = unitOfBranch(cwd);
  if (unit) touch(join(aidlcDir(cwd), S.heartbeats, unit));
  return allow();
}

function steer(input, cwd) {
  const file = join(aidlcDir(cwd), H.denials);
  const all = readJson(file);
  if (all && input.session_id) writeJson(file, { ...all, [input.session_id]: undefined });
  // A question to the owner anywhere in the last message (often followed by its options) lets the turn end.
  const asked = String(input.last_assistant_message ?? '').split('\n').some((l) => /\?[*_`)\s]*$/.test(l));
  if (input.stop_hook_active || asked) return allow();
  const next = nextAction(readState(cwd));
  const stop = readJson(join(cwd, personalProfile))?.run?.stop; // the owner's stopping point (aidlc mode --stop)
  return next.kind === 'act' && S.stops[stop] !== next.key ? JSON.stringify({ decision: 'block', reason: next.line }) : allow();
}

function status(input, cwd) {
  const st = readState(cwd);
  const resume = msg('statusResume', {});
  const lines = [...st.intents.map((i) => msg('statusIntent', { id: i.id, state: i.state, title: i.fm.title ?? '' })),
    ...st.units.filter((u) => u.state !== 'merged').map((u) => msg('statusUnit', { id: u.id, state: u.state, title: u.fm.title ?? '' }))];
  const tail = msg('statusNext', { line: nextAction(st).line }) + resume;
  let out = ownerLines(cwd);
  for (let k = 0; k < lines.length; k++) {
    const more = msg('statusMore', { count: lines.length - k });
    if ((out + lines[k] + more + tail).length > S.statusMax) { out += more; break; }
    out += lines[k];
  }
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: out + tail } });
}

// Auto mode refused a command: kept with the commit it was refused at, so next hands it to the owner.
function denied(input, cwd) {
  const command = String(input.tool_input?.command ?? '');
  if (!command) return allow();
  const kept = [...(readJson(hostDeniedFile(cwd)) ?? []), { command, head: tryGit(cwd, 'rev-parse', 'HEAD'), at: new Date().toISOString() }];
  writeJson(hostDeniedFile(cwd), kept.slice(-S.hostDeniedKept));
  bump(cwd, config.retro.hostDenied, { command, at: kept.at(-1).at });
  return allow();
}

// The owner typed exactly `approve <doc>…`: stamped as the owner before the lead reads the prompt (decision 0011).
function prompt(input, cwd) {
  const docs = approveWords(input.prompt);
  if (!docs) return allow();
  let context;
  try { context = msg('promptApproved', { out: owner.approve(docs, { cwd }).output }); } catch (e) { context = msg('promptApproveFailed', { error: e.message }); }
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } });
}

const HOOKS = { guard, prompt, scope, secrets, model, docs, heartbeat, steer, status, denied };

export const commands = {
  hook(args, ctx) {
    const run = HOOKS[args[0]];
    if (!run) throw new UsageError(msg('unknownCommand', { name: args[0] ?? '' }));
    const input = JSON.parse(ctx.stdin ? ctx.stdin() : readFileSync(0, 'utf8'));
    const cwd = input.cwd && tryGit(input.cwd, 'rev-parse', '--show-toplevel') ? real(input.cwd) : ctx.cwd; // .git/aidlc is no work tree
    return { code: config.exit.ok, findings: [], output: run(input, cwd) + '\n' };
  },
};
