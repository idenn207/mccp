#!/usr/bin/env node
// axis-k-m2-windows-regression.mjs — v1.0.1 axis K M2 Windows escape-path
// regression fixture. Static-only check (no runtime invocation, no spawn).
//
// Invariant: pr-phase-guard hook MUST NOT add PowerShell to its PreToolUse
// matcher. Windows users keep an out-of-band escape (PowerShell is not hooked
// → bypasses guard when guard fails-open on Bash). axis K is intentionally
// Linux/macOS-scoped — M1 added reclaim path, M2 verifies cross-platform +
// asserts Windows surface unchanged.
//
// Asserts:
//   (1) hooks.json parses
//   (2) NO PreToolUse matcher contains "PowerShell" substring (case-insensitive)
//   (3) at least one PreToolUse matcher contains "Bash" (sanity — hook system
//       is actually wired)
//
// Exit codes:
//   0 — invariants hold
//   1 — assertion failed (CI red)
//
// Stdout (single line JSON):
//   { "os", "fixture", "hooks_json_path", "powershell_matched", "bash_matched",
//     "pretool_count" }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_NAME = 'axis-k-m2-windows-regression';
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const HOOKS_JSON_PATH = path.join(PLUGIN_ROOT, 'hooks', 'hooks.json');

let failure = null;
let parsed = null;
let powershellMatched = null;
let bashMatched = null;
let pretoolCount = 0;

try {
  const raw = fs.readFileSync(HOOKS_JSON_PATH, 'utf8');
  parsed = JSON.parse(raw);
} catch (err) {
  failure = `hooks.json read/parse failed: ${err.message}`;
}

if (!failure) {
  const pretool = (parsed && parsed.hooks && parsed.hooks.PreToolUse) || [];
  pretoolCount = pretool.length;
  if (pretoolCount === 0) {
    failure = 'hooks.json has zero PreToolUse entries (sanity probe failed)';
  } else {
    powershellMatched = false;
    bashMatched = false;
    for (const h of pretool) {
      const matcher = (h && typeof h.matcher === 'string') ? h.matcher : '';
      if (/PowerShell/i.test(matcher)) {
        powershellMatched = true;
        failure = `PreToolUse entry id="${h.id || '<unknown>'}" matcher contains PowerShell: ${matcher}`;
        break;
      }
      if (/\bBash\b/.test(matcher)) bashMatched = true;
    }
    if (!failure && !bashMatched) {
      failure = 'no PreToolUse matcher contains "Bash" — hook system appears unwired (sanity)';
    }
  }
}

const output = {
  os: process.platform,
  fixture: FIXTURE_NAME,
  hooks_json_path: HOOKS_JSON_PATH,
  powershell_matched: powershellMatched,
  bash_matched: bashMatched,
  pretool_count: pretoolCount,
};

process.stdout.write(JSON.stringify(output) + '\n');

if (failure) {
  process.stderr.write(`[${FIXTURE_NAME}] FAIL: ${failure}\n`);
  process.exit(1);
}

process.exit(0);
