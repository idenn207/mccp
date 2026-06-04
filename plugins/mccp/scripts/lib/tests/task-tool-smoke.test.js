'use strict';

// Task 12 — real Task tool dispatch smoke (skip-when-harness-absent).
//
// The Claude Code runtime exposes the Task tool, which dispatches subagents
// like security-reviewer via `{ subagent_type, prompt }`. From within node
// --test, the Task tool is NOT available — there is no in-process harness
// reachable from a standalone test runner. This test therefore always skips
// in node --test environments and exists as a placeholder so the v0.2.4
// dogfood suite can be extended once a harness binding becomes available
// (e.g. via a CLI shim that proxies to Claude Code).
//
// The wrapper-shape contract is fully exercised by
// security-reviewer-dogfood.test.js (extractContract + fakeTaskTool); this
// file is the real-harness counterpart that the plan body Task 12 commits to.

const test = require('node:test');

function hasTaskHarness() {
  // A future binding would expose something like
  // process.env.MCCP_TASK_HARNESS_BIN or a require-able module. Until then,
  // always returns false.
  if (process.env.MCCP_TASK_HARNESS_BIN) return true;
  return false;
}

test('real Task tool: security-reviewer dispatch contract smoke', (t) => {
  if (!hasTaskHarness()) {
    t.skip(
      'Task tool harness not reachable from node --test; covered by ' +
      'security-reviewer-dogfood.test.js fake harness. ' +
      'Set MCCP_TASK_HARNESS_BIN=<path> to enable real dispatch in dev.',
    );
    return;
  }
  // Real-harness branch placeholder. If MCCP_TASK_HARNESS_BIN is set in the
  // future, this is where the smoke would live: spawn the harness with
  // `{ subagent_type: "security-reviewer", prompt: "smoke check" }` and assert
  // the harness returns a structured response.
  t.diagnostic('MCCP_TASK_HARNESS_BIN=' + process.env.MCCP_TASK_HARNESS_BIN);
});
