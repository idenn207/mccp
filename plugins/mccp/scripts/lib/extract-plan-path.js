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

// R6-R2 F3 — POSIX-ish shell tokenizer with quote support. The original
// `String(args).split(/\s+/)` split a quoted path with spaces (`--plan
// ".claude/plans/foo bar.md"`) at the space — the hook then passed a
// truncated path to validateCommand and the file-existence rehash failed
// silently. Supports double and single quotes; backslash inside quotes
// escapes the same quote or another backslash. Outside quotes, all
// other backslashes are treated literally (closer to user intuition than
// a strict POSIX parser).
function tokenize(s) {
  const tokens = [];
  let current = '';
  let inToken = false;
  let quote = null; // '"' or "'" or null
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote !== null) {
      if (c === '\\' && i + 1 < s.length && (s[i + 1] === quote || s[i + 1] === '\\')) {
        current += s[i + 1];
        i++;
        inToken = true;
        continue;
      }
      if (c === quote) { quote = null; inToken = true; continue; }
      current += c;
      inToken = true;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; inToken = true; continue; }
    if (/\s/.test(c)) {
      if (inToken) { tokens.push(current); current = ''; inToken = false; }
      continue;
    }
    current += c;
    inToken = true;
  }
  if (inToken) tokens.push(current);
  return tokens;
}

function extractPlanPath(args) {
  if (args === undefined || args === null) return null;
  const tokens = Array.isArray(args)
    ? args.slice()
    : tokenize(String(args));
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

module.exports = { extractPlanPath: extractPlanPath, tokenize: tokenize };
