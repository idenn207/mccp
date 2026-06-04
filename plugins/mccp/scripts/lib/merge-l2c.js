'use strict';

// L2c output merger — pure function called from session-start-bootstrap.js.
//
// Why a separate file: bootstrap reads stdin at module load (script entry
// point), so requiring bootstrap from a test would hang. Extracting the merge
// logic here lets us unit-test the JSON-vs-text decision tree directly.

/**
 * Combine the child session-start.js stdout with the L2c blocks.
 *
 * Three branches:
 *   1. Child emitted a JSON object — parse it, merge `extra` into
 *      `hookSpecificOutput.additionalContext`, re-serialize. Single valid JSON
 *      document, accepted by Claude Code's hook protocol.
 *   2. Child emitted text — append `extra` as a separate paragraph.
 *   3. Child emitted nothing — passthrough `raw` (original SessionStart event)
 *      followed by `extra` if present.
 *
 * The Codex Round 1 finding this fixes: the previous code unconditionally
 * appended `\n<system-reminder>...` after stdout. When stdout was JSON the
 * result was `{...}\n<system-reminder>` — invalid combined output that
 * Claude Code silently drops, defeating the very L2c surface that's meant
 * to make crashes/version mismatches visible.
 *
 * Pure function — no I/O. JSON.parse errors fall through to text-append.
 *
 * @param {string} stdout — child session-start.js stdout
 * @param {string} raw — original SessionStart event JSON (passthrough)
 * @param {string} extra — L2c reminder blocks (may be empty)
 * @returns {string}
 */
function mergeL2c(stdout, raw, extra) {
  if (!extra) return stdout || raw || '';
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch (_) {
    parsed = null;
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const hookOut = (parsed.hookSpecificOutput && typeof parsed.hookSpecificOutput === 'object')
      ? parsed.hookSpecificOutput
      : (parsed.hookSpecificOutput = {});
    const existing = typeof hookOut.additionalContext === 'string'
      ? hookOut.additionalContext
      : '';
    hookOut.additionalContext = existing
      ? existing + '\n\n' + extra
      : extra;
    return JSON.stringify(parsed);
  }
  const base = stdout || raw || '';
  const needsSep = base && !base.endsWith('\n');
  return base + (needsSep ? '\n' : '') + (base ? '\n' : '') + extra + '\n';
}

module.exports = { mergeL2c: mergeL2c };
