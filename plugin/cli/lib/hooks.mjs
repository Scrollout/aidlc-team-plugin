// Hook entry points: `aidlc hook <name>` reads the hook JSON on stdin and prints the decision JSON
// (docs/design/hooks.md). Deny lists, patterns, codes and messages come from cli.json.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { bundleOf, config, done, git, gitLines, readJson, readStdin, tryGit, UsageError, relPath } from './config.mjs';
import { msg } from './template.mjs';
import { loadProfile, withDefaults } from './profile.mjs';
import { checkBundle, parseDoc, writeIndexes } from './okf.mjs';
import { inside, readPlan } from './grid.mjs';
import { aidlcDir, baseOf, bump, commands as owner, delegated, heartbeatFresh, hostDeniedFile, nextAction, readState, runtimeFile, statusText, writeJson } from './state.mjs';
import { directAllowed, mergeWritten, secretIn } from './gate.mjs';

const H = config.hooks;
const S = config.state;

// ---- Shell parsing: argv per segment, enough for a deny list, not a shell model ----

export function segments(command) {
  const out = [[]];
  let word = null;
  let quote = null;
  let target = false; // the next word is a redirect's target, no part of the argv
  const push = () => { if (word !== null && !target) out[out.length - 1].push(word); else if (word !== null) target = false; word = null; };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += c;
    } else if (c === '"' || c === "'") { word = word ?? ''; quote = c; }
    else if (c === '\\' && i + 1 < command.length) word = (word ?? '') + command[++i];
    else if (c === '#' && word === null) while (i + 1 < command.length && command[i + 1] !== '\n') i++; // a comment
    else if (/[<>]/.test(c)) { if (/^\d+$/.test(word ?? '')) word = null; push(); while (/[<>&|]/.test(command[i + 1] ?? '')) i++; target = command[i + 1] !== '('; }
    else if (/\s/.test(c) && c !== '\n') push();
    else if (/[;&|\n()]/.test(c)) { push(); target = false; if (out[out.length - 1].length) out.push([]); }
    else word = (word ?? '') + c;
  }
  push();
  return out.filter((s) => s.length).map((s) => {
    let k = 0;
    while (k < s.length && /^[A-Za-z_]\w*=/.test(s[k])) k++;
    if (H.wrappers.includes(s[k])) k++;
    return s.slice(k);
  });
}

// `git [global options] <sub> <args>` → { sub, args, configs } (the `-c` settings), or null.
function gitCall(argv) {
  if (!argv.length || argv[0].split('/').pop() !== 'git') return null;
  let k = 1;
  const configs = [];
  for (; k < argv.length && argv[k].startsWith('-'); k += H.git.globalWithValue.includes(argv[k]) ? 2 : 1) {
    const value = ['-c', '--config-env'].includes(argv[k]) ? argv[k + 1] : argv[k].match(/^(?:-c|--config-env=)(.+)/)?.[1];
    if (value) configs.push(value.replace('=', ' ')); // as `git config --get-regexp` prints it
  }
  return { sub: argv[k], args: argv.slice(k + 1), configs };
}

// An option as git reads it: exact, or a long option by an unambiguous prefix (`--no-verif`), `--x=v` by its name.
const opt = (a, names) => names.some((o) => a === o || (o.startsWith('--') && /^--[^=]{2}/.test(a) && o.startsWith(a.split('=')[0])));
// Any path ending in the CLI's name, with `/` or `\\` or none left after the shell's unescaping: a Windows path must not slip past (U81).
const isCli = (a) => H.cli.some((c) => a.endsWith(c));
// A ref that names a unit branch: `unit/U-1`, `refs/heads/unit/U-1`, `origin/unit/U-1`, or a range end.
const unitRef = (r) => r.split(/\.{2,3}/).some((p) => new RegExp(`^(?:refs/(?:heads|remotes/[^/]+)/|heads/|[^/]+/)?${S.branchPrefix}`).test(p));
// The files a commit takes: the index, plus its pathspecs' changes (`-m x a.md`, `--only`, `--include`), plus `--all`'s.
function committed(cwd, args) {
  const specs = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') { specs.push(...args.slice(k + 1)); break; }
    if (!a.startsWith('-')) specs.push(a);
    // A value follows: `-m`, `-am` (the first short option that takes one ends the cluster), `--message` without `=`.
    else if (/^-[^-]/.test(a) ? [...a.slice(1)].findIndex((c) => H.git.commitWithValue.includes(`-${c}`)) === a.length - 2 : !a.includes('=') && opt(a, H.git.commitWithValue.filter((o) => o.startsWith('--')))) k++;
  }
  const all = args.some((a) => opt(a, H.commitAll) || new RegExp(`^-[^-]*${H.commitAllShort}`).test(a));
  const paths = specs.length ? tryGit(cwd, 'diff', '--name-only', 'HEAD', '--', ...specs) ?? specs.join('\n') : '';
  return [git(cwd, 'diff', '--cached', '--name-only'), all ? git(cwd, 'diff', '--name-only') : '', paths].join('\n').split('\n').filter(Boolean);
}

// The owner command an argv runs, or undefined; `--auto` exempts only `approve`, for what the owner delegated.
const ownerCommand = (argv) => H.owner.find((o) => argv.some((a, k) => isCli(a) && argv[k + 1] === o) && !(o === H.autoOwner && argv.includes(S.autoFlag)));

// ---- Decisions ----

// Owner prompts the guard raised; the PostToolUse hook marks one `ran` when its call completes (docs/design/approvals.md).
const promptsFile = (cwd) => join(aidlcDir(cwd), H.prompts);
function recordPrompt(cwd, input, command) {
  const all = readJson(promptsFile(cwd)) ?? [];
  writeJson(promptsFile(cwd), [...all, { id: input.tool_use_id ?? null, command, at: new Date().toISOString() }].slice(-H.promptsKept));
}

// The CLI refused an owner command: its prompt is `refused`, so a call that still ends well is not counted as run.
export function ownerRefused(cwd, command) {
  if (!existsSync(promptsFile(cwd))) return;
  const prompts = readJson(promptsFile(cwd));
  const asked = prompts.findLast((p) => p.command === command && !p.ran && !p.refused);
  if (!asked) return;
  const refused = new Date().toISOString();
  writeJson(promptsFile(cwd), prompts.map((p) => (p === asked ? { ...p, refused } : p)));
  bump(cwd, config.retro.ownerRefused, { command, at: refused });
}

const allow = () => '{}';
const context = (hookEventName, additionalContext) => JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext } });
// The text a Write or Edit adds.
const added = (t) => [t.content, t.new_string, t.new_source, ...(Array.isArray(t.edits) ? t.edits.map((e) => e.new_string) : [])].filter((x) => typeof x === 'string').join('\n');
// Typed words as the owner ends a sentence: a trailing period or exclamation mark is no part of them.
const typed = (text) => String(text ?? '').trim().replace(/[.!]+$/, '');
const approveWords = (text) => typed(text).match(new RegExp(H.approveWords, 'i'))?.[1].trim().split(/\s+/);
const ownerWords = (text) => approveWords(text) || new RegExp(H.goWords, 'i').test(typed(text)); // the prompt hook's approve or go
function deny(cwd, input, code, key, data, decision = 'deny') {
  const message = msg(key, data);
  let reason = msg('hookDeny', { code, message, fix: H.codes[code].fix });
  if (decision === 'deny' && input.session_id) {
    const file = join(aidlcDir(cwd), H.denials);
    const all = readJson(file) ?? {};
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
  if (H.scheduled.includes(input.tool_name)) return ownerWords(input.tool_input?.prompt) ? deny(cwd, input, 'GUARD-SCHEDULE', 'guardSchedule', {}) : allow();
  for (const argv of segments(String(input.tool_input?.command ?? ''))) {
    // The owner answers a permission prompt for an owner command; without prompts (bypass) it stays a `!` command (decision 0009).
    const owner = ownerCommand(argv);
    if (owner) {
      const command = argv.slice(argv.indexOf(owner)).join(' ');
      if (useGo(cwd, command)) return allow(); // the owner typed it (docs/design/operations.md#details)
      // A delegated upgrade copies the installed release; a downgrade or a dirty checkout stays the owner's (decision 0008).
      if (owner === S.auto[2] && delegated(cwd).includes(owner) && !argv.some((a) => S.upgradeOwnerFlags.includes(a))) return allow();
      if (input.permission_mode === H.noPrompt) return deny(cwd, input, 'GUARD-OWNER', 'guardOwner', { command });
      recordPrompt(cwd, input, command);
      return deny(cwd, input, 'GUARD-OWNER', 'guardOwner', { command }, 'ask');
    }
    // Claude Code runs the hooks; one run by hand could stamp an approval or record a go (U70).
    if (argv.some((a, k) => (isCli(a) && argv[k + 1] === H.hookCommand) || a.endsWith(H.runner))) return deny(cwd, input, 'GUARD-HOOK', 'guardHook', {});
    // A nested `claude -p` sends its prompt through the prompt hook as if the owner typed it.
    if (argv[0]?.split('/').pop() === H.claude.bin && argv.some((a) => H.claude.print.includes(a)) && argv.slice(1).some((a) => !a.startsWith('-') && ownerWords(a))) return deny(cwd, input, 'GUARD-SCHEDULE', 'guardSchedule', {});
    for (const [tool, sub] of H.ask) if (argv[0]?.split('/').pop() === tool && argv.includes(sub)) return deny(cwd, input, 'GUARD-RELEASE', 'guardRelease', { what: `${tool} ${sub}` }, 'ask');
    const g = gitCall(argv);
    if (!g) continue;
    const { sub, args, configs } = g;
    const refs = args.filter((a) => !a.startsWith('-'));
    const isBase = (r) => [base, `refs/heads/${base}`, `heads/${base}`].includes(r);
    if (configs.some((c) => c.toLowerCase().startsWith(H.git.alias)) || (sub === 'config' && refs.some((r) => r.toLowerCase().startsWith(H.git.alias)))) return deny(cwd, input, 'GUARD-ALIAS', 'guardAlias', {});
    if (sub === 'push') {
      if (args.some((a) => opt(a, H.force)) || refs.some((r) => r.startsWith('+'))) return deny(cwd, input, 'GUARD-FORCE', 'guardForce', {});
      const specs = refs.slice(1);
      // A bare push follows remote.<name>.push or push.default=matching, which can name the base.
      const configured = () => [...configs, ...gitLines(cwd, 'config', '--get-regexp', '^(remote\\..*\\.push|push\\.default)$')].some((c) => /^remote\..+\.push /i.test(c) || /^push\.default matching$/i.test(c));
      const hitsBase = specs.some((r) => r === base || r.endsWith(`:${base}`) || r.endsWith(`/${base}`) || r.includes('*') || (r === 'HEAD' && branch === base)) || args.some((a) => opt(a, H.git.pushAll)) || (!specs.length && (branch === base || configured()));
      if (args.some((a) => opt(a, H.deleteFlags)) && hitsBase || specs.some((r) => r === `:${base}`)) return deny(cwd, input, 'GUARD-BASE-DELETE', 'guardDelete', { base });
      if (hitsBase) return deny(cwd, input, 'GUARD-PUSH', 'guardPush', { base });
      // A tag push can publish a release, as `git tag` and `gh release` can: the owner answers (docs/design/hook-checks.md).
      const tag = (r) => r.replace(/^\+/, '').split(':').some((x) => x.startsWith(H.git.tagRef) || (x && tryGit(cwd, 'rev-parse', '-q', '--verify', H.git.tagRef + x) !== null));
      const follow = () => [...configs, ...gitLines(cwd, 'config', '--get-regexp', '^push\\.followtags$')].some((c) => new RegExp(H.git.followTags, 'i').test(c.replace('=', ' ')));
      if (args.some((a) => opt(a, H.git.pushTags)) || specs.some(tag) || follow()) return deny(cwd, input, 'GUARD-RELEASE', 'guardRelease', { what: `git push ${specs.join(' ')}`.trim() }, 'ask');
    }
    if (sub === 'branch' && args.some((a) => opt(a, H.deleteFlags)) && refs.includes(base)) return deny(cwd, input, 'GUARD-BASE-DELETE', 'guardDelete', { base });
    const move = H.git.move[sub];
    if (move && (!move.length || args.some((a) => opt(a, move))) && (move.length ? refs.slice(0, 1) : refs).some(isBase)) return deny(cwd, input, 'GUARD-BASE-MOVE', 'guardMove', { base, what: sub });
    if (sub === 'commit') {
      if (args.some((a) => opt(a, H.noVerify) || (/^-[^-]/.test(a) && a.slice(1).includes(H.noVerifyShort)))) return deny(cwd, input, 'GUARD-NOVERIFY', 'guardNoVerify', {});
      const bad = branch === base && committed(cwd, args).find((p) => !directAllowed(p, bundleRel));
      if (bad) return deny(cwd, input, 'GUARD-BASE-COMMIT', 'guardBaseCommit', { base, path: bad });
    }
    // A merge shape: merge or pull anywhere; on the base also cherry-pick, rebase or reset onto a unit branch.
    const unitBranch = (H.git.mergeLike.includes(sub) || (branch === base && H.git.onBase.includes(sub))) && refs.find(unitRef);
    if (unitBranch) return deny(cwd, input, 'GUARD-MERGE', 'guardMerge', { branch: unitBranch });
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

const unitOfBranch = (cwd) => { const b = tryGit(cwd, 'rev-parse', '--abbrev-ref', 'HEAD') ?? ''; return b.startsWith(S.branchPrefix) ? b.slice(S.branchPrefix.length) : null; };

const real = (p) => (existsSync(p) ? realpathSync.native(p) : join(real(dirname(p)), basename(p))); // as git's top level: no symlink escape
function scope(input, cwd) {
  const file = real(resolve(cwd, String(input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? '')));
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  const path = relPath(top, file);
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (file.endsWith(config.okf.ext) && approvalPart(before) !== approvalPart(resulting(input, file))) return deny(cwd, input, 'SCOPE-APPROVAL', 'scopeApproval', { path });
  // From any worktree: the main checkout's personal profile and the CLI's state under the git common dir.
  const common = real(resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir')));
  if (path === personalProfile || file === join(dirname(common), personalProfile)) return deny(cwd, input, 'SCOPE-APPROVAL', 'scopeApproval', { path });
  if ((file + sep).startsWith(join(common, S.dir) + sep)) return deny(cwd, input, 'SCOPE-STATE', 'scopeState', { path });
  const unit = unitOfBranch(cwd);
  if (!unit) return allow();
  // The system temp folder, outside every checkout of the repo, holds a builder's report file (docs/design/hook-checks.md).
  const under = (dir) => (file + sep).startsWith(real(dir) + sep);
  const trees = gitLines(cwd, 'worktree', 'list', '--porcelain').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9));
  if (under(tmpdir()) && !trees.some(under)) return allow();
  if (path.startsWith('..') || isAbsolute(path)) return deny(cwd, input, 'SCOPE-OUT', 'scopeOut', { path, unit }); // outside the worktree
  const { profile } = loadProfile(top);
  const bundleRel = relPath(top, bundleOf(top, profile));
  if (mergeWritten(path, bundleRel, profile)) return deny(cwd, input, 'SCOPE-SHARED', 'scopeShared', { path });
  const scope = readJson(runtimeFile(cwd, 'cards', unit))?.scope ?? readPlan(bundleOf(top, profile)).units.find((u) => u.id === unit)?.scope ?? [];
  if (!scope.some((g) => inside('/' + path, g))) return deny(cwd, input, 'SCOPE-OUT', 'scopeOut', { path, unit });
  return allow();
}

function secrets(input, cwd) {
  const file = resolve(cwd, String(input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? ''));
  if (secretIn(added(input.tool_input ?? {}), loadProfile(cwd).profile)) return deny(cwd, input, 'SECRET', 'secretFound', { path: relPath(cwd, real(file)) });
  return allow();
}

function model(input, cwd) {
  const t = input.tool_input ?? {};
  const agent = String(t.subagent_type ?? '');
  if (agent.endsWith(H.researcher)) {
    const expected = withDefaults(loadProfile(cwd).profile).models.research;
    const doc = String(t.prompt ?? '').match(new RegExp(H.researchFor, 'm'))?.[1];
    if (t.model === expected && doc) touch(join(aidlcDir(cwd), S.researching, doc)); // in flight from launch, as a builder
    return t.model === expected ? allow() : deny(cwd, input, 'MODEL-MISMATCH', 'modelMismatch', { agent, unit: msg('researchFor', {}), model: t.model ?? 'none', expected, source: msg('modelSourceResearch', {}) });
  }
  const role = H.agents.find((a) => agent.endsWith(a));
  if (!role) return allow();
  const unit = String(t.prompt ?? '').match(new RegExp(H.unitPattern))?.[0];
  if (!unit) return deny(cwd, input, 'MODEL-UNIT', 'modelUnit', { agent });
  const card = readJson(runtimeFile(cwd, 'cards', unit));
  const expected = role === H.agents[0] ? card?.model : withDefaults(loadProfile(cwd).profile).models.review;
  if (!expected) return deny(cwd, input, 'MODEL-UNIT', 'modelUnit', { agent });
  const source = msg(role === H.agents[0] ? 'modelSourceCard' : 'modelSourceReview', {});
  if (t.model !== expected) return deny(cwd, input, 'MODEL-MISMATCH', 'modelMismatch', { agent, unit, model: t.model ?? 'none', expected, source });
  touch(join(aidlcDir(cwd), role === H.agents[1] ? S.reviewing : S.heartbeats, unit)); // in flight from launch: next waits for it
  if (role === H.agents[0]) touch(join(aidlcDir(cwd), S.launches, unit)); // takes over a stopped builder's unit
  return allow();
}

// A `generated.at` the edit wrote far from the current UTC time (a local time marked Z) becomes the current UTC second.
function restamp(input, file) {
  const written = added(input.tool_input ?? {});
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
  return stamped ? context('PostToolUse', stamped) : allow();
}

function touch(file) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, '', { flag: 'a' }); // creates it, never truncates
  utimesSync(file, new Date(), new Date());
}

// A builder's tool call keeps its unit's heartbeat fresh; a reviewer's keeps the reviews in flight fresh.
// Runs as each call starts and ends, so a mark outlives the longest Bash call (docs/design/in-flight.md).
function heartbeat(input, cwd) {
  const prompts = readJson(promptsFile(cwd));
  const asked = input.hook_event_name !== H.before && input.tool_use_id && prompts?.find((p) => p.id === input.tool_use_id && !p.ran && !p.refused); // the owner may still refuse it
  if (asked) {
    const ran = new Date().toISOString();
    writeJson(promptsFile(cwd), prompts.map((p) => (p === asked ? { ...p, ran } : p)));
    bump(cwd, config.retro.interventions, { command: asked.command, at: ran }); // the owner's command ran
  }
  const kind = String(input.agent_type ?? '').endsWith(H.agents[1]) ? S.reviewing : String(input.agent_type ?? '').endsWith(H.researcher) ? S.researching : null;
  if (kind) {
    const dir = join(aidlcDir(cwd), kind);
    for (const unit of existsSync(dir) ? readdirSync(dir) : []) if (heartbeatFresh(cwd, unit, Date.now(), kind)) touch(join(dir, unit));
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
  if (input.source === H.clearSource) touch(join(aidlcDir(cwd), S.cleared)); // next stops asking for the clear
  const st = readState(cwd);
  return context('SessionStart', statusText(st, nextAction(st), msg('statusResume', {})));
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

// The owner's go for `release I-<n>` or `rollback I-<n>` at a commit: typed as a prompt, used up by the guard.
const goesFile = (cwd) => join(aidlcDir(cwd), H.goes);
function useGo(cwd, command) {
  const goes = readJson(goesFile(cwd)) ?? [];
  const go = goes.find((g) => g.command === command && g.head === tryGit(cwd, 'rev-parse', 'HEAD'));
  if (!go) return false;
  writeJson(goesFile(cwd), goes.filter((g) => g !== go));
  bump(cwd, config.retro.interventions, { command, at: new Date().toISOString() });
  return true;
}

// The owner typed exactly `approve <doc>…`: stamped as the owner before the lead reads the prompt (decision 0011).
// A deploy outlasts the hook, so typed `release I-<n>` only records the go and the lead runs it.
function prompt(input, cwd) {
  const go = typed(input.prompt).match(new RegExp(H.goWords, 'i'));
  if (go) {
    const command = `${go[1].toLowerCase()} ${go[2].toUpperCase()}`;
    writeJson(goesFile(cwd), [...(readJson(goesFile(cwd)) ?? []), { command, head: tryGit(cwd, 'rev-parse', 'HEAD'), at: new Date().toISOString() }].slice(-H.promptsKept));
    return context('UserPromptSubmit', msg('promptGo', { command }));
  }
  const docs = approveWords(input.prompt);
  if (!docs) return allow();
  let text;
  try { text = msg('promptApproved', { out: owner.approve(docs, { cwd }).output }); } catch (e) { text = msg('promptApproveFailed', { error: e.message }); }
  return context('UserPromptSubmit', text);
}

const HOOKS = { guard, prompt, scope, secrets, model, docs, heartbeat, steer, status, denied };

export const commands = {
  hook(args, ctx) {
    const run = HOOKS[args[0]];
    if (!run) throw new UsageError(msg('unknownCommand', { name: args[0] ?? '' }));
    const input = JSON.parse(readStdin(ctx));
    const cwd = input.cwd && tryGit(input.cwd, 'rev-parse', '--show-toplevel') ? real(input.cwd) : ctx.cwd; // .git/aidlc is no work tree
    return done(run(input, cwd) + '\n');
  },
};
