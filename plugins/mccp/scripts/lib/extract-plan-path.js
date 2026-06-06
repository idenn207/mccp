'use strict';

// v0.2.8 Task 2.6.5b R6-F3 — shared --plan extractor for the receipt
// hooks (UserPromptExpansion + Skill PreToolUse). Both hooks receive raw
// command-argument strings from the harness; without extracting --plan
// before calling validateCommand the gate's generic-slug reject would
// fire even for legitimate `--plan <path>` invocations on `main` or
// `default`.
//
// Accepts either a raw string (typical for command_args) or a
// pre-tokenized array (Skill arguments may already be split). Returns
// null when no --plan token is present; the caller treats that as
// "no plan" and validate-cmd applies its bare-slug policy normally.

function extractPlanPath(args) {
  if (args === undefined || args === null) return null;
  const tokens = Array.isArray(args)
    ? args.slice()
    : String(args).trim().split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--plan' && i + 1 < tokens.length) {
      const next = tokens[i + 1];
      return next && next.length > 0 ? next : null;
    }
    if (typeof t === 'string' && t.indexOf('--plan=') === 0) {
      const v = t.slice('--plan='.length);
      return v.length > 0 ? v : null;
    }
  }
  return null;
}

module.exports = { extractPlanPath: extractPlanPath };
