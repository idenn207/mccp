'use strict';

// v1.3.0-m4 — SessionStart hook entrypoint for STATUS.md/status.html
// re-render at session boot. Separate from session-start-bootstrap.js
// (which handles STATE.md injection); this hook only fires the render
// trigger, never blocks, never throws.
//
// Hook protocol:
//   - Reads stdin to EOF and discards (Claude Code passes JSON; we don't
//     need anything from it).
//   - Always exits 0. trigger.js is loud fail-open; we add an additional
//     belt-and-suspenders try/catch so a defective install (missing
//     lib/renderer/) does not break SessionStart.

function readStdinToEnd() {
  try {
    require('fs').readFileSync(0);
  } catch (_) { /* stdin EOF is fine */ }
}

function main() {
  readStdinToEnd();
  try {
    const trigger = require('../lib/renderer/trigger');
    trigger.triggerRender('session-start');
  } catch (err) {
    process.stderr.write('[mccp:render-trigger:session-start] '
      + 'trigger load/exec failed: '
      + ((err && err.message) || 'unknown') + ' (allow)\n');
  }
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main: main };
