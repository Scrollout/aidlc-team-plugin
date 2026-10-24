#!/usr/bin/env node
// A stand-in for `gh api` serving the Actions runs of a commit: each call returns the next poll of
// $GH_STUB's `polls` (the last one repeats) and counts the calls.
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.env.GH_STUB;
const s = JSON.parse(readFileSync(file, 'utf8'));
const path = process.argv[process.argv.indexOf('-X') + 2];
s.paths = [...(s.paths ?? []), path];
const runs = s.polls[Math.min(s.paths.length, s.polls.length) - 1];
writeFileSync(file, JSON.stringify(s));
process.stdout.write(JSON.stringify({ total_count: runs.length, workflow_runs: runs }));
