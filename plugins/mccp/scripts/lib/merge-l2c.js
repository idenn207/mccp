'use strict';

// L2c output merger — pure function called from session-start-bootstrap.js.
//
// Why a separate file: bootstrap reads stdin at module load (script entry
// point), so requiring bootstrap from a test would hang. Extracting the merge
// logic here lets us unit-test the JSON-vs-text decision tree directly.

/**
 * Combine the child session-start.js stdout with the L2c blocks.
 *
 * Cases (with `extra` present):
 *   1. Child emitted a JSON object (hook response document) — merge `extra`
 *      into `hookSpecificOutput.additionalContext`, re-serialize. Single
 *      valid JSON document.
 *   2. Child emitted plain text — append `extra` as a separate paragraph.
 *      Text + text is valid (Claude Code treats text-only stdout as
 *      additionalContext directly).
 *   3. Child emitted nothing — synthesize a fresh SessionStart hook response
 *      with `extra` as the only additionalContext. We do NOT pass `raw`
 *      (the input SessionStart event) through here: the event is the hook's
 *      INPUT, not its response, and concatenating reminder text after an
 *      event JSON recreates the invalid `{json}\n<system-reminder>` shape
 *      that Codex Round 1 (and again Round 2 F#2) flagged.
 *
 * Pure function — no I/O. JSON.parse errors fall through to text-append.
 *
 * @param {string} stdout — child session-start.js stdout
 * @param {string} raw — original SessionStart event JSON (passthrough fallback)
 * @param {string} extra — L2c reminder blocks (may be empty)
 * @returns {string}
 */
function mergeL2c(stdout, raw, extra) {
  if (!extra) return stdout || raw || '';
  const parsed = tryParseObject(stdout);
  if (parsed) {
    return mergeIntoHookResponse(parsed, extra);
  }
  if (stdout) {
    // Plain-text stdout — append as paragraph. Text + text never produces
    // the {json}\n<text> failure mode.
    const needsSep = !stdout.endsWith('\n');
    return stdout + (needsSep ? '\n' : '') + '\n' + extra + '\n';
  }
  // Empty stdout — synthesize a fresh single-document hook response.
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: extra,
    },
  });
}

function tryParseObject(s) {
  if (!s) return null;
  let v;
  try { v = JSON.parse(s); }
  catch (_) { return null; }
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
}

function mergeIntoHookResponse(parsed, extra) {
  const slot = parsed.hookSpecificOutput;
  const hookOut = (slot && typeof slot === 'object' && !Array.isArray(slot))
    ? slot
    : (parsed.hookSpecificOutput = {});
  const existing = typeof hookOut.additionalContext === 'string'
    ? hookOut.additionalContext
    : '';
  hookOut.additionalContext = existing ? existing + '\n\n' + extra : extra;
  return JSON.stringify(parsed);
}

module.exports = { mergeL2c: mergeL2c };
