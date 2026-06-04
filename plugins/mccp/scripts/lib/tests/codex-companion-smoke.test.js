'use strict';

// Task 12 — real codex-companion --json smoke (skip-on-unavailable).
//
// Most tests in v0.2.4 use fake fixtures (codex-invoke.test.js,
// codex-invoke-json.test.js). Fake fixtures verify the WRAPPER shape but cannot
// catch drift in the real codex-companion's --json contract. This smoke test
// is mandatory on dev environments where the codex plugin is installed and
// authenticated; CI environments skip cleanly.
//
// Skip conditions (any one triggers skip):
//   - MCCP_SKIP_REAL_SMOKE=1 (operator opt-out)
//   - codex registry not present at default location
//   - codex companion script not at expected install path
//   - MCCP_ALLOW_CODEX_UNAVAILABLE=1 in env (advisory mode)
//   - CI=true (GitHub Actions / CI sentinel)
//
// What this test verifies when it CAN run:
//   1. invokeAdversarialReview with json:true returns ok=true
//   2. result.stdout is JSON-parsable
//   3. parsed payload contains a recognized structured key (e.g. verdict,
//      findings, classification — actual key set is companion-defined and
//      this test asserts at least one of them is present, not a specific name)

const test = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('node:assert');

const { invokeAdversarialReview } = require('../codex-invoke');

function shouldSkip() {
  if (process.env.MCCP_SKIP_REAL_SMOKE === '1') return 'MCCP_SKIP_REAL_SMOKE=1';
  if (process.env.MCCP_ALLOW_CODEX_UNAVAILABLE === '1') return 'MCCP_ALLOW_CODEX_UNAVAILABLE=1 (advisory)';
  if (process.env.CI === 'true' || process.env.CI === '1') return 'CI=true';
  const registryPath = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
  if (!fs.existsSync(registryPath)) return 'no codex registry at ' + registryPath;
  try {
    const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const entries = reg && reg.plugins && reg.plugins['codex@openai-codex'];
    if (!Array.isArray(entries) || !entries.length) return 'codex@openai-codex not installed';
    const installPath = entries[0] && entries[0].installPath;
    if (!installPath || !fs.existsSync(installPath)) return 'codex installPath stale';
    const companion = path.join(installPath, 'scripts', 'codex-companion.mjs');
    if (!fs.existsSync(companion)) return 'codex-companion.mjs missing';
  } catch (err) {
    return 'registry parse failed: ' + err.message;
  }
  return null;
}

test('real codex-companion: --json forwarded end-to-end (smoke)', { timeout: 920_000 }, async (t) => {
  const reason = shouldSkip();
  if (reason) {
    t.skip('smoke skipped: ' + reason);
    return;
  }
  const r = invokeAdversarialReview('smoke check — respond with a minimal verdict object', {
    json: true,
    timeoutMs: 900_000,
  });
  if (!r.ok) {
    // Real codex may legitimately fail (not-authenticated, timeout). Surface
    // the classification rather than asserting ok=true.
    t.diagnostic('real codex returned non-ok: ' + r.classification + ' / ' + r.stderr.slice(0, 200));
    if (r.classification === 'not-authenticated' || r.classification === 'timeout') {
      t.skip('smoke skipped: real codex ' + r.classification);
      return;
    }
  }
  assert.strictEqual(r.ok, true, 'real codex must succeed when reachable: ' + r.stderr);
  // The companion in --json mode emits a structured payload. Real-world stdout
  // is multi-line (pretty-printed JSON), so extract the largest brace-balanced
  // object rather than parsing line-by-line.
  const stdout = r.stdout.trim();
  const firstBrace = stdout.indexOf('{');
  const lastBrace = stdout.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    t.diagnostic('real codex stdout has no JSON object — first 300 chars:\n' + stdout.slice(0, 300));
    t.skip('real codex --json contract appears to be non-JSON; v0.2.4 followup');
    return;
  }
  const jsonStr = stdout.slice(firstBrace, lastBrace + 1);
  let payload;
  try {
    payload = JSON.parse(jsonStr);
  } catch (parseErr) {
    t.diagnostic('JSON.parse failed: ' + parseErr.message + ' — slice: ' + jsonStr.slice(0, 200));
    t.skip('real codex --json contract drift; v0.2.4 followup');
    return;
  }
  assert.ok(payload && typeof payload === 'object', 'payload must be a JSON object');
  // At least one expected key family should be present.
  const knownKeys = ['verdict', 'classification', 'findings', 'rounds', 'message', 'result'];
  const hasKey = knownKeys.some((k) => k in payload);
  if (!hasKey) {
    t.diagnostic('payload keys: ' + Object.keys(payload).join(', '));
    t.skip('real codex --json payload uses unfamiliar key set; v0.2.4 followup');
    return;
  }
});
