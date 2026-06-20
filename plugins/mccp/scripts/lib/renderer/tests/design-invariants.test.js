'use strict';

// v1.3.0-m3 end-to-end DESIGN.md H1-H14 sanity.
// Goal: assert that the renderer's actual output (HTML + CSS literal +
// markdown composer) satisfies all 14 lint rules. Plus Codex F2/F3
// absorption dry-runs.

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStatus } = require('../index');

function minimalModel() {
  const now = Date.now();
  return {
    derived_at: new Date(now).toISOString(),
    masked: true,
    m0_capability: { contract_present: true },
    warnings: [],
    sources: {
      plans: { count: 0, items: [] },
      receipts: { count: 0, items: [] },
      state: { item: { resume_state: 'idle', body: {}, frontmatter: {} } },
      backlog: { count: 0, items: [] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: { count: 0, items: [] },
    },
    correlations: [],
  };
}

test('design-invariants — current renderer output passes all 14 H rules', () => {
  const r = renderStatus(minimalModel(), { snapshotsDir: null });
  if (r.design_constraint_violations.length > 0) {
    // Print detail to stderr so the failure is debuggable in CI.
    process.stderr.write('design-lint violations: '
      + JSON.stringify(r.design_constraint_violations) + '\n');
  }
  assert.deepEqual(r.design_constraint_violations, []);
});

test('design-invariants — lint subsystem is not degraded on healthy render (F2 absorption)', () => {
  const r = renderStatus(minimalModel(), { snapshotsDir: null });
  assert.equal(r.design_lint_degraded, false,
    'design_lint_degraded must be false on healthy render; otherwise a broken '
    + 'lint subsystem would be indistinguishable from a clean pass');
});

test('design-invariants F2 dry-run — broken lint surfaces via degraded flag, not silent pass', () => {
  const r = renderStatus(minimalModel(), { snapshotsDir: null, _injectLintThrow: true });
  assert.equal(r.design_lint_degraded, true);
  assert.deepEqual(r.design_constraint_violations, []);
  const lintWarnings = (r.warnings || []).filter((w) => w.source === 'renderer.design-lint');
  assert.equal(lintWarnings.length, 1);
  assert.match(lintWarnings[0].message, /degraded/);
});

test('design-invariants F3 dry-run — violations push into warnings array for verdict chain', () => {
  // Patch the lint module just for this test so we can verify the warnings
  // wiring works without injecting a real CSS drift.
  const lintModule = require('../output-constraints');
  const original = lintModule.runOutputConstraints;
  let restored = false;
  try {
    lintModule.runOutputConstraints = function () {
      return {
        violations: ['H4', 'H7'],
        details: [
          { rule: 'H4', evidence: '1 side-stripe hit', severity: 'absolute-ban' },
          { rule: 'H7', evidence: '1 glassmorphism hit', severity: 'absolute-ban' },
        ],
      };
    };
    // Clear require cache for renderer/index so it picks up the patched module.
    const indexPath = require.resolve('../index');
    delete require.cache[indexPath];
    const { renderStatus: rs2 } = require('../index');
    const r = rs2(minimalModel(), { snapshotsDir: null });
    assert.deepEqual(r.design_constraint_violations, ['H4', 'H7']);
    assert.equal(r.design_lint_degraded, false);
    const lintWarnings = (r.warnings || []).filter((w) => w.source === 'renderer.design-lint');
    assert.equal(lintWarnings.length, 1);
    assert.match(lintWarnings[0].message, /H4,H7/);
  } finally {
    lintModule.runOutputConstraints = original;
    // Reset require cache so subsequent tests get fresh renderer/index.
    const indexPath = require.resolve('../index');
    delete require.cache[indexPath];
    restored = true;
  }
  assert.ok(restored);
});
