'use strict';

/**
 * Invariant tests for closure report
 *
 * (a) all return paths have the same top-level keys (EMPTY pattern)
 * (b) disposed >= resolved >= fixed
 * (c) injected fixtures produce known values (not tautology)
 * (d) ledgers exactly 2 rows with denominator_note
 * (e) baseline JSON structure as subset (not equality)
 * (f) no absolute paths in output (/home/, /Users/, C:\\)
 * (g) reseal_warning null when denominator_gap.count === 0
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

// B17 — the suite used `REPO_ROOT` as the repo root in 29 places, so every
// one of them silently depended on which directory the runner was launched from.
// `node --test` from `plugins/mccp/` made those calls read a tree with no
// `.claude/`, and the assertions still passed because the fixtures are mocked —
// a test that cannot fail on the axis it names. Resolved from `__dirname`, and
// checked, so a wrong answer is loud rather than invisible.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
require('assert').ok(
  require('fs').existsSync(path.join(REPO_ROOT, '.git')),
  'REPO_ROOT must resolve to the repository, not the launch directory: ' + REPO_ROOT);

// Inject fixtures by mocking the requires inside the report module.
// We'll use a test-specific wrapper that resets the require cache.

function createMockRepoFixture() {
  // Sealed inventory
  const sealedDoc = {
    meta: {
      sealed_at: '2026-09-01T01:21:41.049Z',
      sealed_at_commit: '9093b08f9f136849b42c5f70617d8c31368e2614',
      stats: {
        by_source: {
          backlog: 936,
          findings: 178,
          'fix-task': 1,
        },
      },
    },
    inventory_sha256: 'sha256:f171a42e2c344849b988f613e827b11e3515dfcd777ad1d997645d917e71dfba',
    items: Array(1115).fill(null).map((_, i) => ({
      item_id: 'backlog:' + i,
      source: 'backlog',
      severity: 'MEDIUM',
    })),
  };

  // Dispositions
  const dispositions = [];
  // Add 934 disposed (fixed=1, obsolete=0, superseded=111, duplicate=19, deferred=803)
  for (let i = 0; i < 1; i++) {
    dispositions.push({
      item_id: 'backlog:' + i,
      disposition: 'fixed',
      inventory_sha256: sealedDoc.inventory_sha256,
    });
  }
  for (let i = 1; i < 112; i++) {
    dispositions.push({
      item_id: 'backlog:' + i,
      disposition: 'superseded',
      inventory_sha256: sealedDoc.inventory_sha256,
    });
  }
  for (let i = 112; i < 131; i++) {
    dispositions.push({
      item_id: 'backlog:' + i,
      disposition: 'duplicate',
      inventory_sha256: sealedDoc.inventory_sha256,
    });
  }
  for (let i = 131; i < 1115; i++) {
    dispositions.push({
      item_id: 'backlog:' + i,
      disposition: 'deferred',
      inventory_sha256: sealedDoc.inventory_sha256,
    });
  }

  // Live inventory (more items = gap)
  const liveItems = Array(1389).fill(null).map((_, i) => ({
    item_id: i < 1115 ? 'backlog:' + i : ('new:' + (i - 1115)),
    source: i < 1115 ? 'backlog' : 'findings',
    severity: 'MEDIUM',
  }));

  // Findings
  const findings = Array(976).fill(null).map((_, i) => ({
    finding_id: 'f' + i,
    state: 'open',
    severity: 'MEDIUM',
    claim_digest: 'digest' + i,
  }));

  return {
    sealedDoc,
    dispositions,
    liveItems,
    findings,
  };
}

function withFixtures(testFn) {
  return function(t) {
    const fixture = createMockRepoFixture();
    const Module = require('node:module');
    const originalRequire = Module.prototype.require;

    // Override require to inject our mocks
    Module.prototype.require = function(id) {
      if (id === '../msw-metrics/debt-inventory') {
        return {
          readInventory: () => fixture.sealedDoc,
          buildInventory: () => ({
            items: fixture.liveItems,
            stats: {
              by_source: {
                backlog: 1510,
                findings: fixture.findings.length,
                'fix-task': 1,
              },
            },
          }),
          readDispositions: () => ({
            ok: true,
            lines: fixture.dispositions,
          }),
          SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
          foldDispositions: (lines) => {
            const m = new Map();
            for (const l of lines) m.set(l.item_id, l);
            return m;
          },
        };
      } else if (id === '../../state/findings-registry') {
        return Object.assign({}, require('../../../state/findings-registry'), {
          readAll: () => ({
            findings: fixture.findings,
          }),
        });
      }
      return originalRequire.apply(this, arguments);
    };

    try {
      // Clear the module cache for report.js so it re-requires
      delete require.cache[require.resolve('../report.js')];
      const testReport = require('../report.js');
      return testFn(t, testReport, fixture);
    } finally {
      Module.prototype.require = originalRequire;
      delete require.cache[require.resolve('../report.js')];
    }
  };
}

test('invariant (a): all return paths have same top-level keys', withFixtures((t, report, fixture) => {
  const result = report.buildClosureReport(REPO_ROOT);
  const keys = Object.keys(result).sort();
  const expectedKeys = ['degraded', 'denominator_gap', 'dispositions', 'ledgers', 'live', 'reseal_warning', 'seal'].sort();
  assert.deepStrictEqual(keys, expectedKeys, 'missing or extra keys in return object');
}));

test('invariant (a): return path with degraded error has same keys', withFixtures((t, report, fixture) => {
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;

  Module.prototype.require = function(id) {
    if (id === '../msw-metrics/debt-inventory') {
      return {
        readInventory: () => null,
        buildInventory: () => ({ items: [], stats: {} }),
        readDispositions: () => ({ ok: true, lines: [] }),
      };
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(REPO_ROOT);
    const keys = Object.keys(result).sort();
    const expectedKeys = ['degraded', 'denominator_gap', 'dispositions', 'ledgers', 'live', 'reseal_warning', 'seal'].sort();
    assert.deepStrictEqual(keys, expectedKeys, 'degraded path has different keys');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
}));

test('invariant (b): disposed >= resolved >= fixed', withFixtures((t, report, fixture) => {
  const result = report.buildClosureReport(REPO_ROOT);
  assert.ok(
    result.dispositions.disposed >= result.dispositions.resolved,
    'disposed (' + result.dispositions.disposed + ') should be >= resolved (' + result.dispositions.resolved + ')'
  );
  assert.ok(
    result.dispositions.resolved >= result.dispositions.fixed,
    'resolved (' + result.dispositions.resolved + ') should be >= fixed (' + result.dispositions.fixed + ')'
  );
}));

test('invariant (c): injected fixtures produce known values', withFixtures((t, report, fixture) => {
  const result = report.buildClosureReport(REPO_ROOT);

  // Seal.items should be 1115
  assert.strictEqual(result.seal.items, 1115, 'seal.items should be 1115');

  // Live.items should be 1389
  assert.strictEqual(result.live.items, 1389, 'live.items should be 1389');

  // Dispositions.total should equal seal.items
  assert.strictEqual(result.dispositions.total, result.seal.items, 'dispositions.total should equal seal.items');

  // Gap.count should be live.items - seal.items
  const expectedGap = result.live.items - result.seal.items;
  assert.strictEqual(result.denominator_gap.count, expectedGap,
    'denominator_gap.count (' + result.denominator_gap.count + ') should equal ' + expectedGap);

  // Not a tautology: verify both are actually different
  assert.notStrictEqual(result.seal.items, result.live.items,
    'seal and live must be different to avoid tautology');
}));

test('invariant (d): ledgers exactly 2 rows with denominator_note', withFixtures((t, report, fixture) => {
  const result = report.buildClosureReport(REPO_ROOT);
  assert.strictEqual(result.ledgers.length, 2, 'ledgers must have exactly 2 rows');

  for (let i = 0; i < result.ledgers.length; i++) {
    const ledger = result.ledgers[i];
    assert.ok(ledger.name, 'ledger[' + i + '] must have name');
    assert.ok(typeof ledger.closed === 'number', 'ledger[' + i + '] must have closed (number)');
    assert.ok(typeof ledger.total === 'number', 'ledger[' + i + '] must have total (number)');
    assert.ok(typeof ledger.pct === 'number', 'ledger[' + i + '] must have pct (number)');
    assert.ok(ledger.denominator_note, 'ledger[' + i + '] must have denominator_note');
  }
}));

test('invariant (e): baseline JSON structure as subset (C1 fix: fail if baseline missing)', withFixtures((t, report, fixture) => {
  const result = report.buildClosureReport(REPO_ROOT);

  // Load baseline for comparison (just check structure, not values)
  // C1: Correct path from repo root, not from test file
  const fs = require('fs');
  const repoRoot = REPO_ROOT;
  const baselinePath = path.join(repoRoot, '.claude/_meta/data/2026-09-08-closure-baseline.json');

  let baseline = null;
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch (err) {
    // C1: Missing baseline is a TEST FAILURE, not a silent pass
    assert.fail('baseline not found at ' + baselinePath + ': ' + err.message);
  }

  assert.ok(baseline, 'baseline must be valid JSON');
  assert.ok(baseline.debt_inventory, 'baseline must have debt_inventory section');

  const bi = baseline.debt_inventory;

  // Check seal section (should not be null)
  assert.ok(result.seal, 'result.seal must not be null');
  if (bi.seal) {
    for (const key of Object.keys(bi.seal)) {
      assert.ok(key in result.seal, 'seal.' + key + ' missing from result');
    }
  }

  // Check live section (should not be null in normal case)
  assert.ok(result.live, 'result.live must not be null (no degradation in this test)');
  if (bi.live) {
    for (const key of Object.keys(bi.live)) {
      assert.ok(key in result.live, 'live.' + key + ' missing from result');
    }
  }

  // Check denominator_gap section (should not be null in normal case)
  assert.ok(result.denominator_gap, 'result.denominator_gap must not be null (no degradation in this test)');
  if (bi.denominator_gap) {
    for (const key of Object.keys(bi.denominator_gap)) {
      assert.ok(key in result.denominator_gap, 'denominator_gap.' + key + ' missing from result');
    }
  }

  // Check dispositions section (should not be null in normal case)
  assert.ok(result.dispositions, 'result.dispositions must not be null (no degradation in this test)');
  if (bi.dispositions) {
    for (const key of Object.keys(bi.dispositions)) {
      assert.ok(key in result.dispositions, 'dispositions.' + key + ' missing from result');
    }
  }
}));

test('invariant (e-guard): baseline file must exist and be readable (C1)', (t) => {
  const fs = require('fs');
  const repoRoot = REPO_ROOT;
  const baselinePath = path.join(repoRoot, '.claude/_meta/data/2026-09-08-closure-baseline.json');
  assert.ok(fs.existsSync(baselinePath), 'baseline file must exist at ' + baselinePath);

  const content = fs.readFileSync(baselinePath, 'utf8');
  assert.ok(content, 'baseline file must not be empty');
  const baseline = JSON.parse(content);
  assert.ok(baseline.debt_inventory, 'baseline must have debt_inventory section');
});

test('invariant (f): no absolute paths in output', withFixtures((t, report, fixture) => {
  const result = report.buildClosureReport(REPO_ROOT);
  const serialized = JSON.stringify(result);

  // Check for /home/ paths
  const homeMatch = serialized.match(/\/home\/[^\s"\\]+/);
  assert.ok(!homeMatch, 'output contains /home/ absolute path: ' + (homeMatch ? homeMatch[0] : ''));

  // Check for /Users/ paths
  const usersMatch = serialized.match(/\/Users\/[^\s"\\]+/);
  assert.ok(!usersMatch, 'output contains /Users/ absolute path: ' + (usersMatch ? usersMatch[0] : ''));

  // Check for Windows drive letters
  const winMatch = serialized.match(/[A-Z]:\\/);
  assert.ok(!winMatch, 'output contains Windows path: ' + (winMatch ? winMatch[0] : ''));
}));

test('invariant (g): reseal_warning null when denominator_gap.count === 0', withFixtures((t, report, fixture) => {
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;

  // Create fixture where live equals seal (gap = 0)
  const sealedDoc = {
    meta: {
      sealed_at: '2026-09-01T01:21:41.049Z',
      sealed_at_commit: '9093b08',
      stats: {
        by_source: { backlog: 10, findings: 5, 'fix-task': 0 },
      },
    },
    inventory_sha256: 'sha256:test',
    items: Array(15).fill({ item_id: 'test', source: 'backlog' }),
  };

  Module.prototype.require = function(id) {
    if (id === '../msw-metrics/debt-inventory') {
      return {
        readInventory: () => sealedDoc,
        buildInventory: () => ({
          items: Array(15).fill({ item_id: 'test', source: 'backlog' }),
          stats: { by_source: { backlog: 10, findings: 5, 'fix-task': 0 } },
        }),
        readDispositions: () => ({
          ok: true,
          lines: [
            { item_id: 'test', disposition: 'deferred', inventory_sha256: 'sha256:test' },
          ],
        }),
        SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
        foldDispositions: (lines) => {
          const m = new Map();
          for (const l of lines) m.set(l.item_id, l);
          return m;
        },
      };
    } else if (id === '../../state/findings-registry') {
      return Object.assign({}, require('../../../state/findings-registry'), {
        readAll: () => ({ findings: [] }),
      });
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(REPO_ROOT);

    assert.strictEqual(result.denominator_gap.count, 0, 'gap should be 0');
    assert.strictEqual(result.reseal_warning, null, 'reseal_warning should be null when gap === 0');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
}));

test('invariant (c2): denominator_gap.pct divides by live.items, not seal.items (C2)', withFixtures((t, report, fixture) => {
  const result = report.buildClosureReport(REPO_ROOT);

  // Fixture: seal.items = 1115, live.items = 1389
  // gap = 1389 - 1115 = 274
  // pct should be: 274 / 1389 * 100 = 19.73%
  // NOT 274 / 1115 * 100 = 24.57%
  const expectedGap = result.live.items - result.seal.items; // Should be 274
  const expectedPct = parseFloat((expectedGap * 100 / result.live.items).toFixed(2));
  assert.strictEqual(result.denominator_gap.pct, expectedPct,
    'gap pct (' + result.denominator_gap.pct + ') should be ' + expectedPct + ' (divide by live=' + result.live.items + ', not seal=' + result.seal.items + ')');
}));

test('invariant (c3): disposition count uses folded records, not line count (C3)', withFixtures((t, report, fixture) => {
  // This test injects a fixture with two lines for one item_id (deferred then fixed)
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;

  const sealedDoc = {
    meta: {
      sealed_at: '2026-09-01T01:21:41.049Z',
      sealed_at_commit: '9093b08',
      stats: {
        by_source: { backlog: 1, findings: 1, 'fix-task': 0 },
      },
    },
    inventory_sha256: 'sha256:test',
    items: [
      { item_id: 'backlog:1', source: 'backlog', severity: 'MEDIUM' },
      { item_id: 'backlog:2', source: 'backlog', severity: 'MEDIUM' },
    ],
  };

  Module.prototype.require = function(id) {
    if (id === '../msw-metrics/debt-inventory') {
      return {
        readInventory: () => sealedDoc,
        buildInventory: () => ({
          items: Array(2).fill({ item_id: 'test', source: 'backlog' }),
          stats: { by_source: { backlog: 2, findings: 0, 'fix-task': 0 } },
        }),
        readDispositions: () => ({
          ok: true,
          lines: [
            // Two lines for the same item_id: deferred first, then fixed
            { item_id: 'backlog:1', disposition: 'deferred', inventory_sha256: 'sha256:test' },
            { item_id: 'backlog:1', disposition: 'fixed', inventory_sha256: 'sha256:test' },
            // And one other item
            { item_id: 'backlog:2', disposition: 'deferred', inventory_sha256: 'sha256:test' },
          ],
        }),
        SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
        foldDispositions: (lines) => {
          const m = new Map();
          for (const l of lines) m.set(l.item_id, l);
          return m;
        },
      };
    } else if (id === '../../state/findings-registry') {
      return Object.assign({}, require('../../../state/findings-registry'), {
        readAll: () => ({ findings: [] }),
      });
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(REPO_ROOT);

    // After folding:
    // - backlog:1 has disposition 'fixed' (last line wins)
    // - backlog:2 has disposition 'deferred'
    // disposed should count unique items with dispositions: 2
    // resolved should count fixed + obsolete + superseded + duplicate: just 'fixed' for backlog:1 = 1
    // fixed should count just 'fixed': 1
    assert.strictEqual(result.dispositions.disposed, 2, 'disposed should count unique items after fold (2)');
    assert.strictEqual(result.dispositions.fixed, 1, 'fixed should count items with disposition=fixed (1)');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
}));

test('invariant (c8): findings with state != closed are counted as open (C8)', withFixtures((t, report, fixture) => {
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;

  Module.prototype.require = function(id) {
    if (id === '../msw-metrics/debt-inventory') {
      return {
        readInventory: () => fixture.sealedDoc,
        buildInventory: () => ({
          items: fixture.liveItems,
          stats: { by_source: { backlog: 1510, findings: 976, 'fix-task': 1 } },
        }),
        readDispositions: () => ({
          ok: true,
          lines: fixture.dispositions,
        }),
        SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
        foldDispositions: (lines) => {
          const m = new Map();
          for (const l of lines) m.set(l.item_id, l);
          return m;
        },
      };
    } else if (id === '../../state/findings-registry') {
      return Object.assign({}, require('../../../state/findings-registry'), {
        readAll: () => ({
          findings: [
            // Mix of states
            { finding_id: 'f0', state: 'open', severity: 'MEDIUM', claim_digest: 'dig0' },
            { finding_id: 'f1', state: 'closed', severity: 'MEDIUM', claim_digest: 'dig1' },
            { finding_id: 'f2', state: 'finding_adjudicated', severity: 'MEDIUM', claim_digest: 'dig2' },
            { finding_id: 'f3', state: 'accepted', severity: 'MEDIUM', claim_digest: 'dig3' },
          ],
        }),
      });
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(REPO_ROOT);

    // Expected: open (f0, f2, f3), closed (f1)
    // opened should be 3, closed should be 1, total 4
    const ledgers = result.ledgers.find(l => l.name === 'findings-registry');
    assert.ok(ledgers, 'findings-registry ledger should exist');
    assert.strictEqual(ledgers.total, 4, 'total findings should be 4');
    assert.strictEqual(ledgers.closed, 1, 'closed findings should be 1 (only state=closed)');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
}));

function sealDigestFixture(storedSha, hashFn) {
  const sealedDoc = {
    meta: {
      sealed_at: '2026-09-01T01:21:41.049Z',
      sealed_at_commit: '9093b08',
      stats: { by_source: { backlog: 3 } },
    },
    inventory_sha256: storedSha,
    items: Array(3).fill(null).map((_, i) => ({ item_id: 'old:' + i, source: 'backlog' })),
  };
  return function (id, originalRequire, self, args) {
    if (id === '../msw-metrics/debt-inventory') {
      return {
        readInventory: () => sealedDoc,
        buildInventory: () => ({
          items: Array(3).fill(null).map((_, i) => ({ item_id: 'old:' + i, source: 'backlog' })),
          stats: { by_source: { backlog: 3 } },
        }),
        readDispositions: () => ({
          ok: true,
          lines: sealedDoc.items.map((it) => ({
            item_id: it.item_id, disposition: 'deferred', inventory_sha256: storedSha,
          })),
        }),
        SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
        foldDispositions: (lines) => {
          const m = new Map();
          for (const l of lines) m.set(l.item_id, l);
          return m;
        },
        inventoryHash: hashFn,
      };
    } else if (id === '../../state/findings-registry') {
      return Object.assign({}, require('../../../state/findings-registry'), { readAll: () => ({ findings: [] }) });
    }
    return originalRequire.apply(self, args);
  };
}

test('invariant (i): a seal whose digest does not match its items is NOT counted (PR-Codex R2 F1)', withFixtures((t, report, fixture) => {
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;

  // The falsifying case for trusting inventory_sha256 without recomputing it.
  // The seal keeps its ORIGINAL digest but its items[] no longer hash to it --
  // a parseable truncation or a merge that preserved the label. Before the fix
  // the report returned closed/total/pct = 1/1/100% with degraded: [], i.e. a
  // corrupt seal produced a perfect closure score.
  const resolver = sealDigestFixture('sha256:stale-label', function (items) {
    return 'sha256:actually-' + items.length;
  });
  Module.prototype.require = function (id) { return resolver(id, originalRequire, this, arguments); };

  try {
    delete require.cache[require.resolve('../report.js')];
    const result = require('../report.js').buildClosureReport(REPO_ROOT);

    const hit = (result.degraded || []).find((d) => d.name === 'seal-digest');
    assert.ok(hit, 'degraded[] must carry a seal-digest entry');
    assert.strictEqual(result.dispositions, null, 'dispositions must be unavailable on a corrupt seal');
    assert.strictEqual(result.denominator_gap, null, 'the gap is computed against the sealed id set, so it is unknown too');
    assert.strictEqual(result.reseal_warning, null, 'no reseal advice from a denominator we cannot trust');
    const row = result.ledgers.find((l) => l.name === 'disposition-ledger');
    assert.strictEqual(row.closed, null, 'closure count must not be reported');
    assert.strictEqual(row.pct, null, 'and above all NOT 100');
    assert.ok(/seal digest does not match its items/.test(row.denominator_note),
      'the note must name the seal, not the ledger — a reader told the wrong reason looks in the wrong place');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
}));

test('invariant (i2): a seal whose digest DOES match is counted normally (positive control)', withFixtures((t, report, fixture) => {
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;

  // Without this control, invariant (i) would still pass if the verification
  // degraded EVERY seal — which would be a different way of reporting nothing.
  const resolver = sealDigestFixture('sha256:actually-3', function (items) {
    return 'sha256:actually-' + items.length;
  });
  Module.prototype.require = function (id) { return resolver(id, originalRequire, this, arguments); };

  try {
    delete require.cache[require.resolve('../report.js')];
    const result = require('../report.js').buildClosureReport(REPO_ROOT);

    assert.strictEqual((result.degraded || []).find((d) => d.name === 'seal-digest'), undefined,
      'a matching digest must not degrade');
    assert.ok(result.dispositions, 'dispositions are reported when the seal verifies');
    assert.ok(result.denominator_gap, 'and so is the gap');
    const row = result.ledgers.find((l) => l.name === 'disposition-ledger');
    assert.strictEqual(row.total, 3, 'the verified seal is the denominator');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
}));

test('invariant (h): equal-sized inventories with DIFFERENT identities report the full unsealed count and still warn (PR-Codex R1 F1)', withFixtures((t, report, fixture) => {
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;

  // The falsifying case for the length-subtraction bug. Seal and live are the
  // SAME SIZE (10 each) but share NO item_id: every live item is unsealed debt.
  //
  // Under the old `live.length - seal.length` form this is 0 -> reseal_warning
  // suppressed -> the instrument reports "nothing outside the seal" while the
  // entire live pile is outside it. That is the comfortable-false-number this
  // milestone exists to remove, so it must be mechanically impossible.
  const sealedDoc = {
    meta: {
      sealed_at: '2026-09-01T01:21:41.049Z',
      sealed_at_commit: '9093b08',
      stats: { by_source: { backlog: 10 } },
    },
    inventory_sha256: 'sha256:test',
    items: Array(10).fill(null).map((_, i) => ({ item_id: 'old:' + i, source: 'backlog' })),
  };

  Module.prototype.require = function(id) {
    if (id === '../msw-metrics/debt-inventory') {
      return {
        readInventory: () => sealedDoc,
        buildInventory: () => ({
          items: Array(10).fill(null).map((_, i) => ({ item_id: 'new:' + i, source: 'backlog' })),
          stats: { by_source: { backlog: 10 } },
        }),
        readDispositions: () => ({
          ok: true,
          lines: [
            { item_id: 'old:0', disposition: 'deferred', inventory_sha256: 'sha256:test' },
          ],
        }),
        SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
        foldDispositions: (lines) => {
          const m = new Map();
          for (const l of lines) m.set(l.item_id, l);
          return m;
        },
      };
    } else if (id === '../../state/findings-registry') {
      return Object.assign({}, require('../../../state/findings-registry'), { readAll: () => ({ findings: [] }) });
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(REPO_ROOT);

    assert.strictEqual(result.denominator_gap.count, 10,
      'all 10 live items are outside the seal (identity-based), not 0');
    assert.strictEqual(result.denominator_gap.net_change, 0,
      'net_change is 0 here — which is exactly why it cannot be the gap');
    assert.strictEqual(result.denominator_gap.sealed_not_live, 10,
      'all 10 sealed items left the live pile');
    assert.ok(result.reseal_warning,
      'reseal_warning MUST fire: unsealed debt exists even though the sizes match');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
}));

test('invariant (c9): a shrinking pile reports a negative net_change (not clamped to 0) (C9)', withFixtures((t, report, fixture) => {
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;

  // Fixture: live < seal (seal=100, live=50, gap=-50)
  const sealedDoc = {
    meta: {
      sealed_at: '2026-09-01T01:21:41.049Z',
      sealed_at_commit: '9093b08',
      stats: { by_source: { backlog: 100 } },
    },
    inventory_sha256: 'sha256:test',
    items: Array(100).fill({ item_id: 'test', source: 'backlog' }),
  };

  Module.prototype.require = function(id) {
    if (id === '../msw-metrics/debt-inventory') {
      return {
        readInventory: () => sealedDoc,
        buildInventory: () => ({
          items: Array(50).fill({ item_id: 'test', source: 'backlog' }),
          stats: { by_source: { backlog: 50 } },
        }),
        readDispositions: () => ({ ok: true, lines: [] }),
        SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
        foldDispositions: (lines) => new Map(),
      };
    } else if (id === '../../state/findings-registry') {
      return Object.assign({}, require('../../../state/findings-registry'), { readAll: () => ({ findings: [] }) });
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(REPO_ROOT);

    // PR-Codex R1 F1 — the negative case moved fields, not meanings. `count` is
    // now |live \\ sealed| and cannot be negative; the "did the pile shrink?"
    // question this test was written for is `net_change`, which still must report
    // the negative rather than clamp to 0 (the plan's row-deletion requirement).
    //
    // Both inventories here carry the SAME item_id ('test'), so every live item
    // is sealed: unsealed count is 0 while net_change is -50. Asserting both is
    // the point — it pins that the two fields answer different questions.
    assert.strictEqual(result.denominator_gap.net_change, -50,
      'net_change should be negative (-50), not clamped to 0');
    assert.strictEqual(result.denominator_gap.count, 0,
      'unsealed count is |live \\ sealed| and cannot go negative (all live ids are sealed here)');
    assert.strictEqual(result.denominator_gap.sealed_not_live, 0,
      'the sealed id is still live, so nothing left the seal');
    assert.strictEqual(result.denominator_gap.pct, 0,
      'pct follows count (0/50), not net_change');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
}));

test('invariant (c7): throws in readers are caught and reported in degraded (C7)', withFixtures((t, report, fixture) => {
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;

  const sealedDoc = {
    meta: { sealed_at: '2026-09-01T01:21:41.049Z', sealed_at_commit: '9093b08', stats: { by_source: {} } },
    inventory_sha256: 'sha256:test',
    items: [],
  };

  Module.prototype.require = function(id) {
    if (id === '../msw-metrics/debt-inventory') {
      return {
        readInventory: () => sealedDoc,
        // Throw a SyntaxError with an absolute path in the message (should be scrubbed)
        readDispositions: () => {
          const err = new Error('SyntaxError in /tmp/corrupted-ledger.jsonl');
          throw err;
        },
        buildInventory: () => {
          const err = new Error('Source /var/lib/jenkins/workspace/job/file.txt unreadable');
          throw err;
        },
        SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
        foldDispositions: (lines) => new Map(),
      };
    } else if (id === '../../state/findings-registry') {
      return Object.assign({}, require('../../../state/findings-registry'), {
        readAll: () => {
          const err = new Error('Registry file /root/.claude/state/findings-registry.json corrupted');
          throw err;
        },
      });
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    // Should NOT throw; should return with degraded entries
    const result = testReport.buildClosureReport(REPO_ROOT);

    assert.ok(result.degraded && result.degraded.length > 0, 'should have degraded entries');

    // Check that absolute paths were scrubbed
    const serialized = JSON.stringify(result);
    const hasTmpPath = /\/tmp\//.test(serialized);
    const hasVarPath = /\/var\/lib\//.test(serialized);
    const hasRootPath = /\/root\//.test(serialized);
    assert.ok(!hasTmpPath, 'output should not contain /tmp/ paths');
    assert.ok(!hasVarPath, 'output should not contain /var/lib/ paths');
    assert.ok(!hasRootPath, 'output should not contain /root/ paths');

    // Basenames should remain
    assert.ok(serialized.includes('corrupted-ledger.jsonl'), 'output should scrub path but keep basename');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
}));

test('invariant (c4): scrubPathsFromMessage handles diverse paths (C4)', (t) => {
  // We need to test the scrubPathsFromMessage function directly, but it's not exported.
  // We'll test it indirectly through the degraded error messages by triggering throws
  // with various path formats.
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;

  const sealedDoc = {
    meta: { sealed_at: '2026-09-01T01:21:41.049Z', sealed_at_commit: '9093b08', stats: { by_source: {} } },
    inventory_sha256: 'sha256:test',
    items: [],
  };

  const testCases = [
    { path: '/tmp/file.js', should_not_have: '/tmp/' },
    { path: '/var/lib/jenkins/workspace/file.txt', should_not_have: '/var/lib/' },
    { path: '/private/var/db/file.log', should_not_have: '/private/var/' },
    { path: 'c:\\Windows\\System32\\file.dll', should_not_have: 'c:\\' },  // lowercase drive
    { path: 'D:\\Users\\name\\file.txt', should_not_have: 'D:\\' },         // uppercase drive
  ];

  for (const tc of testCases) {
    Module.prototype.require = function(id) {
      if (id === '../msw-metrics/debt-inventory') {
        return {
          readInventory: () => { throw new Error('Failed at ' + tc.path); },
          buildInventory: () => ({ items: [], stats: {} }),
          readDispositions: () => ({ ok: true, lines: [] }),
          SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
          foldDispositions: (lines) => new Map(),
        };
      } else if (id === '../../state/findings-registry') {
        return Object.assign({}, require('../../../state/findings-registry'), { readAll: () => ({ findings: [] }) });
      }
      return originalRequire.apply(this, arguments);
    };

    try {
      delete require.cache[require.resolve('../report.js')];
      const testReport = require('../report.js');
      const result = testReport.buildClosureReport(REPO_ROOT);

      const serialized = JSON.stringify(result);
      assert.ok(!serialized.includes(tc.should_not_have), 'output should not contain ' + tc.should_not_have);
    } finally {
      Module.prototype.require = originalRequire;
      delete require.cache[require.resolve('../report.js')];
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// The three below freeze corrections that a reviewer disproved BY EXECUTION
// after an earlier round of this milestone had declared them landed by reading
// the source. Each asserts the behaviour that was wrong before the fix, so a
// regression turns this suite red instead of leaving a reassuring green.
// ─────────────────────────────────────────────────────────────────────────────

test('invariant (c3b): disposition lines whose item is not in the seal are excluded (C3)', (t) => {
  // A line may carry the right inventory_sha256 and still name an item that is
  // not in the sealed set. Upstream verifyDispositions drops those with
  // `index.has(r.item_id)` (debt-inventory.js:606-608). Counting them made
  // `disposed` exceed `total` — measured 3/1, i.e. 300% closure. An instrument
  // that can report more than 100% closed is worse than no instrument.
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;
  const SHA = 'sha256:test';

  Module.prototype.require = function (id) {
    if (id === '../msw-metrics/debt-inventory') {
      return {
        readInventory: () => ({
          meta: { sealed_at: '2026-09-01T01:21:41.049Z', sealed_at_commit: 'abc' },
          inventory_sha256: SHA,
          items: [{ item_id: 'backlog:0', source: 'backlog' }],
        }),
        buildInventory: () => ({
          items: [{ item_id: 'backlog:0' }, { item_id: 'backlog:1' }],
          stats: { by_source: { backlog: 2 } },
        }),
        readDispositions: () => ({
          ok: true,
          malformed: 0,
          lines: [
            { item_id: 'backlog:0', disposition: 'deferred', inventory_sha256: SHA },
            // Both of these carry the right sha and name items the seal never had.
            { item_id: 'ghost:1', disposition: 'fixed', inventory_sha256: SHA },
            { item_id: 'ghost:2', disposition: 'fixed', inventory_sha256: SHA },
          ],
        }),
        SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
        foldDispositions: (lines) => {
          const m = new Map();
          for (const l of lines) m.set(l.item_id, l);
          return m;
        },
      };
    } else if (id === '../../state/findings-registry') {
      return Object.assign({}, require('../../../state/findings-registry'), { readAll: () => ({ findings: [] }) });
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(REPO_ROOT);

    assert.strictEqual(result.dispositions.disposed, 1,
      'only the sealed item may be counted as disposed');
    assert.strictEqual(result.dispositions.fixed, 0,
      'the two ghost `fixed` lines must not be counted');
    assert.ok(result.dispositions.disposed <= result.dispositions.total,
      'disposed (' + result.dispositions.disposed + ') must never exceed total ('
      + result.dispositions.total + ')');
    const ledger = result.ledgers.find((l) => l.name === 'disposition-ledger');
    assert.ok(ledger.pct <= 100, 'closure pct must never exceed 100, got ' + ledger.pct);
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
});

test('invariant (c4): scrubbing folds absolute paths without mangling anything else (C4)', (t) => {
  // Task 4(f) calls the no-absolute-path rule the only falsifiable assertion in
  // this milestone, and it cannot be falsified through buildClosureReport: a
  // degraded reason only carries a path when a reader throws, so well-formed
  // fixtures can never produce one. Testing the rule directly is what makes the
  // claim checkable at all.
  //
  // The second half of the table matters as much as the first. An earlier
  // implementation ran three replaces in sequence, so each pass re-scanned the
  // previous one's output: a repo-internal path collapsed to `pluginsreport.js`,
  // `1115/1115` became `11151115`, and a URL lost everything after the colon.
  const report = require('../report.js');
  const scrub = report.scrubPathsFromMessage;
  assert.strictEqual(typeof scrub, 'function', 'scrubPathsFromMessage must be exported for this test');

  const ROOT = '/repo/root';
  const cases = [
    [ROOT + '/plugins/mccp/scripts/lib/closure/report.js', 'plugins/mccp/scripts/lib/closure/report.js'],
    ['/tmp/x/repo/f.md', 'f.md'],
    ['/var/lib/jenkins/w/f.jsonl', 'f.jsonl'],
    ['/private/var/folders/xy/T/f', 'f'],
    ['/root/.claude/plugins/cache/mccp/debt-inventory.js', 'debt-inventory.js'],
    ['c:\\users\\a\\secret.json', 'secret.json'],
    ['C:\\Users\\A\\secret.json', 'secret.json'],
    ['disposed 1115/1115 open 0', 'disposed 1115/1115 open 0'],
    ['https://github.com/x/y/issues/1', 'https://github.com/x/y/issues/1'],
  ];
  for (const [input, want] of cases) {
    assert.strictEqual(scrub(input, ROOT), want, 'scrub(' + JSON.stringify(input) + ')');
  }

  const stack = "Cannot find module 'x'\nRequire stack:\n- " + ROOT
    + '/plugins/mccp/scripts/lib/closure/cli.js\n- /root/.claude/index.js';
  const got = scrub(stack, ROOT);
  assert.ok(!/\/home\/|\/Users\/|\/root\/|\/tmp\/|\/var\//.test(got),
    'a multi-line Require stack must leave no absolute path: ' + JSON.stringify(got));
  assert.ok(got.indexOf('plugins/mccp/scripts/lib/closure/cli.js') !== -1,
    'the repo-internal frame must survive as a repo-relative path: ' + JSON.stringify(got));
});

test('invariant (c5): a degraded findings registry nulls its counts instead of reporting short (C5)', (t) => {
  // readAll().degraded is a BOOLEAN and its reasons are strings in
  // degraded_reasons (findings-registry.js:698-701). An earlier version tested
  // Array.isArray on that boolean, so registry degradation could never surface
  // and a partially-read ledger was published as a complete count — the
  // success-direction default this whole PRD exists to remove, reproduced
  // inside the instrument.
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;

  // Override readAll only. buildInventory reaches into this same module for
  // other helpers (claimDigestOf), so replacing it wholesale breaks the live
  // inventory read and the assertion below would fail for the wrong reason.
  const realRegistry = require('../../../state/findings-registry');
  Module.prototype.require = function (id) {
    if (id === '../../state/findings-registry') {
      return Object.assign({}, realRegistry, {
        readAll: () => ({
          findings: [{ state: 'open' }, { state: 'closed' }],
          degraded: true,
          degraded_reasons: ['wu1: seq gap(s): 3'],
          malformed: 1,
        }),
      });
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(REPO_ROOT);

    assert.ok(result.degraded.some((d) => d.name === 'findings-registry'),
      'a degraded registry must name itself in degraded[]: ' + JSON.stringify(result.degraded));
    const row = result.ledgers.find((l) => l.name === 'findings-registry');
    assert.strictEqual(row.total, null, 'an incomplete read reports null, not a short total');
    assert.strictEqual(row.closed, null, 'an incomplete read reports null, not a short closed count');
    assert.match(row.denominator_note, /NOT COUNTED/,
      'the denominator note must say the axis was not counted');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
});

// The existing (c7) test throws from all three readers at once, so only the
// FIRST one reached ever fires — readDispositions short-circuits before
// buildInventory is called, and the assertions about /var/ and /root/ passed
// vacuously. Each reader gets its own single-fault test below, which is the
// only way the buildInventory and readAll catch blocks are executed at all.

test('invariant (c7-build): a buildInventory throw is caught and its path scrubbed (C7)', (t) => {
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;
  const realDebt = require('../../msw-metrics/debt-inventory');

  Module.prototype.require = function (id) {
    if (id === '../msw-metrics/debt-inventory') {
      return Object.assign({}, realDebt, {
        buildInventory: () => {
          const e = new Error(
            "source unreadable: backlog: ENOENT: no such file or directory, open "
            + "'/var/lib/jenkins/workspace/mccp/.claude/plans/codex-findings-backlog.md'");
          e.code = 'SOURCE_UNREADABLE';
          throw e;
        },
      });
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(REPO_ROOT);

    assert.ok(result && typeof result === 'object', 'the oracle must return, never throw');
    assert.ok(result.degraded.length > 0, 'the failure must appear in degraded[]');
    const blob = JSON.stringify(result);
    assert.ok(!/\/var\/lib\//.test(blob),
      'the absolute path in the exception must not reach the output: ' + blob.slice(0, 300));
    assert.ok(/codex-findings-backlog\.md/.test(blob),
      'the basename must survive so the reason stays diagnostic');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
});

test('invariant (c7-registry): a findings-registry throw is caught and its path scrubbed (C7)', (t) => {
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;
  const realRegistry = require('../../../state/findings-registry');

  Module.prototype.require = function (id) {
    if (id === '../../state/findings-registry') {
      return Object.assign({}, realRegistry, {
        readAll: () => {
          throw new Error("EACCES: permission denied, open '/root/.claude/state/findings/x.jsonl'");
        },
      });
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(REPO_ROOT);

    assert.ok(result && typeof result === 'object', 'the oracle must return, never throw');
    assert.ok(result.degraded.some((d) => d.name === 'findings-registry'),
      'the registry failure must name itself: ' + JSON.stringify(result.degraded));
    const row = result.ledgers.find((l) => l.name === 'findings-registry');
    assert.strictEqual(row.total, null, 'an unreadable registry reports null, not 0');
    const blob = JSON.stringify(result);
    assert.ok(!/\/root\//.test(blob), 'the absolute path must not reach the output');
    assert.ok(/x\.jsonl/.test(blob), 'the basename must survive');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Round 3: mutation coverage. A reviewer mutated the oracle twenty ways and the
// suite stayed green for fifteen of them — `resolved := disposed`,
// `fixed := resolved`, `disposed := sealItems` (a permanent 100%), dropping the
// inventory_sha256 binding, sourcing the ledger total from live instead of the
// seal. The tests were not vacuous in the round-1 sense (they executed); they
// were vacuous in a subtler one: every fixture disposed ALL sealed items with
// well-formed lines, so the three counts coincided and any rule that conflates
// them still produced the expected numbers.
//
// The fixture below exists to break that coincidence. disposed (6), resolved (3)
// and fixed (1) are pairwise different and all below total (10), and the ledger
// carries one line that must be excluded for each of the two reasons the code
// filters on. That single shape kills the whole family.
// ─────────────────────────────────────────────────────────────────────────────

test('invariant (m1): disposed, resolved and fixed are three different numbers (PRD decision 2)', (t) => {
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;
  const realDebt = require('../../msw-metrics/debt-inventory');
  // PR-Codex R2 F1 — the seal digest is now VERIFIED, so this fixture must be
  // self-consistent: SHA is derived from the very items[] it labels. A hardcoded
  // literal made this a corrupt seal, which the new check correctly degrades.
  // The dispositions below bind to the same SHA.
  const SEAL_ITEMS = Array.from({ length: 10 }, (_, i) => ({ item_id: 'a' + i, source: 'backlog' }));
  const SHA = realDebt.inventoryHash(SEAL_ITEMS);

  Module.prototype.require = function (id) {
    if (id === '../msw-metrics/debt-inventory') {
      return Object.assign({}, realDebt, {
        readInventory: () => ({
          meta: {
            sealed_at: '2026-09-01T00:00:00.000Z',
            sealed_at_commit: 'abc1234',
            // Deliberately disagrees with items.length: a seal count taken from
            // `stats` instead of the array would read 999 and this test dies.
            stats: { by_source: { backlog: 999 } },
          },
          inventory_sha256: SHA,
          items: SEAL_ITEMS,
        }),
        buildInventory: () => ({
          // 25 live items, so any ledger total sourced from live rather than the
          // seal reads 25 and this test dies.
          items: Array.from({ length: 25 }, (_, i) => ({ item_id: 'L' + i })),
          stats: { by_source: { backlog: 25 } },
        }),
        readDispositions: () => ({
          ok: true,
          malformed: 0,
          lines: [
            { item_id: 'a0', disposition: 'fixed', inventory_sha256: SHA },
            { item_id: 'a1', disposition: 'superseded', inventory_sha256: SHA },
            { item_id: 'a2', disposition: 'duplicate', inventory_sha256: SHA },
            { item_id: 'a3', disposition: 'deferred', inventory_sha256: SHA },
            { item_id: 'a4', disposition: 'deferred', inventory_sha256: SHA },
            { item_id: 'a5', disposition: 'deferred', inventory_sha256: SHA },
            // Excluded: right seal, but this item was never sealed.
            { item_id: 'ghost', disposition: 'fixed', inventory_sha256: SHA },
            // Excluded: sealed item, but bound to a different seal. Dropping the
            // sha binding is dropping the forgery check the PRD pinned first.
            { item_id: 'a6', disposition: 'fixed', inventory_sha256: 'sha256:wrong' },
          ],
        }),
      });
    } else if (id === '../../state/findings-registry') {
      return Object.assign({}, require('../../../state/findings-registry'), {
        readAll: () => ({ findings: [], degraded: false, degraded_reasons: [], malformed: 0 }),
      });
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const result = require('../report.js').buildClosureReport(REPO_ROOT);
    const d = result.dispositions;

    assert.strictEqual(d.total, 10, 'total is the sealed item count, not stats and not live');
    assert.strictEqual(d.disposed, 6, 'six sealed items carry a bound disposition');
    assert.strictEqual(d.resolved, 3, 'fixed + superseded + duplicate — deferred is judged, not resolved');
    assert.strictEqual(d.fixed, 1, 'only `fixed` is fixed');

    // State the separation as its own assertion. The PRD pins it because the
    // real values are ~1115 / 132 / 1: folding them overstates by 1000x.
    assert.notStrictEqual(d.disposed, d.resolved, 'disposed must not equal resolved');
    assert.notStrictEqual(d.resolved, d.fixed, 'resolved must not equal fixed');
    assert.ok(d.disposed < d.total, 'disposed must be strictly below total in this fixture');

    const row = result.ledgers.find((l) => l.name === 'disposition-ledger');
    assert.strictEqual(row.total, 10, 'the ledger denominator is the seal, not the live inventory');
    assert.strictEqual(row.closed, 6, 'the ledger closed count is the folded disposed count');
    assert.strictEqual(row.pct, 60, '6/10 = 60%');

    assert.strictEqual(result.seal.items, 10, 'seal.items comes from items.length');
    assert.strictEqual(typeof result.seal.age_days, 'number', 'age_days must be present and numeric');
    assert.ok(result.seal.age_days >= 0, 'age_days must not be negative');

    // The warning has to carry both anchors: the count tells the operator how many
    // judgments are at stake, and the path tells them where the succession lives.
    //
    // It used to quote the inventory sha instead of the path, because the only
    // thing it could say was "re-sealing would unbind these". Now there is a tool
    // that carries them forward, so the useful anchor is the tool — and quoting
    // the digest here is what made every committed report JSON a candidate
    // successor under the old substring rule.
    assert.match(result.reseal_warning, /\b6\b/, 'reseal_warning must quote the disposition count');
    assert.match(result.reseal_warning, /msw-metrics\/reseal\.js/,
      'reseal_warning must name the succession path');
    assert.doesNotMatch(result.reseal_warning, /\bM2\b/,
      'the warning must not still call re-sealing a future milestone');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
});

test('invariant (m2): each degradation signal alone is enough to mark the registry unknown (C5)', (t) => {
  // The (c5) fixture sets degraded, degraded_reasons and malformed together, so
  // two of the three conditions can be deleted and it stays green. Each signal
  // gets its own case here.
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;
  const realRegistry = require('../../../state/findings-registry');

  const cases = [
    ['degraded flag only', { findings: [{ state: 'open' }], degraded: true, degraded_reasons: [], malformed: 0 }],
    ['reasons only', { findings: [{ state: 'open' }], degraded: false, degraded_reasons: ['wu: gap'], malformed: 0 }],
    ['malformed only', { findings: [{ state: 'open' }], degraded: false, degraded_reasons: [], malformed: 2 }],
  ];

  for (const [label, payload] of cases) {
    Module.prototype.require = function (id) {
      if (id === '../../state/findings-registry') {
        return Object.assign({}, realRegistry, { readAll: () => payload });
      }
      return originalRequire.apply(this, arguments);
    };
    try {
      delete require.cache[require.resolve('../report.js')];
      const result = require('../report.js').buildClosureReport(REPO_ROOT);
      const row = result.ledgers.find((l) => l.name === 'findings-registry');
      assert.strictEqual(row.total, null, label + ': counts must be null');
      assert.ok(result.degraded.some((x) => x.name === 'findings-registry'),
        label + ': must appear in degraded[]');
    } finally {
      Module.prototype.require = originalRequire;
      delete require.cache[require.resolve('../report.js')];
    }
  }
});

test('invariant (m3): a degraded live inventory is reported, not absorbed (C5)', (t) => {
  // `stats.findings_degraded` is set by buildInventory when a source read only
  // partially succeeded. No test touched it, so ignoring it entirely survived.
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;
  const realDebt = require('../../msw-metrics/debt-inventory');

  Module.prototype.require = function (id) {
    if (id === '../msw-metrics/debt-inventory') {
      return Object.assign({}, realDebt, {
        readInventory: () => ({
          meta: { sealed_at: '2026-09-01T00:00:00.000Z', sealed_at_commit: 'abc' },
          inventory_sha256: 'sha256:x',
          items: [{ item_id: 'a0' }],
        }),
        readDispositions: () => ({ ok: true, malformed: 0, lines: [] }),
        buildInventory: () => ({
          items: [{ item_id: 'a0' }, { item_id: 'a1' }],
          stats: { by_source: { backlog: 2 }, findings_degraded: true },
        }),
      });
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const result = require('../report.js').buildClosureReport(REPO_ROOT);
    assert.ok(result.degraded.some((d) => /live-inventory|findings/.test(d.name)),
      'a degraded live inventory must be named in degraded[]: ' + JSON.stringify(result.degraded));
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
});

test('invariant (m4): a malformed disposition ledger nulls its row and suppresses the warning', (t) => {
  // Nulling `dispositions` while the ledger row kept publishing a definitive
  // closure rate said two different things about one measurement, and the
  // confident one is the one a reader quotes. Both reviewers flagged it, and a
  // mutation reverting only the row survived the suite — so it is pinned here.
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;
  const SHA = 'sha256:x';
  const realDebt = require('../../msw-metrics/debt-inventory');

  Module.prototype.require = function (id) {
    if (id === '../msw-metrics/debt-inventory') {
      return Object.assign({}, realDebt, {
        readInventory: () => ({
          meta: { sealed_at: '2026-09-01T00:00:00.000Z', sealed_at_commit: 'abc' },
          inventory_sha256: SHA,
          items: [{ item_id: 'a' }, { item_id: 'b' }],
        }),
        readDispositions: () => ({
          ok: true,
          malformed: 3,
          lines: [{ item_id: 'a', disposition: 'fixed', inventory_sha256: SHA }],
        }),
        buildInventory: () => ({
          items: [{ item_id: 'a' }, { item_id: 'b' }, { item_id: 'c' }],
          stats: { by_source: { backlog: 3 } },
        }),
      });
    } else if (id === '../../state/findings-registry') {
      return Object.assign({}, require('../../../state/findings-registry'), {
        readAll: () => ({ findings: [], degraded: false, degraded_reasons: [], malformed: 0 }),
      });
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const result = require('../report.js').buildClosureReport(REPO_ROOT);

    assert.strictEqual(result.dispositions, null, 'a malformed ledger nulls the dispositions block');
    const row = result.ledgers.find((l) => l.name === 'disposition-ledger');
    assert.strictEqual(row.closed, null, 'and the ledger row must be nulled by the same condition');
    assert.strictEqual(row.total, null, 'the row total must be nulled too');
    assert.strictEqual(row.pct, null, 'a rate over an uncounted ledger is not a rate');
    assert.match(row.denominator_note, /NOT COUNTED/, 'the note must say the axis was not counted');
    assert.strictEqual(result.reseal_warning, null,
      'the warning quotes a disposition count, so it must be suppressed with it');
    assert.ok(result.degraded.some((d) => d.name === 'disposition-ledger'),
      'the malformed ledger must name itself in degraded[]');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
});

test('invariant (m5): seal.ancestry_depth is present and null-on-unjudgeable, never 0-on-unknown', (t) => {
  // A re-sealed denominator descends from something, and the report has to be able
  // to say how deep that chain is. The rule is the same one the rest of this file
  // follows: a chain that cannot be judged is `null`, not `0`. Reporting 0 for an
  // unreadable ancestry would claim "this seal is original" about a seal nobody
  // could check — the success-direction default this instrument exists to remove.
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;
  const fixture = createMockRepoFixture();

  const withAncestry = function (ancestryResult) {
    Module.prototype.require = function (id) {
      if (id === '../msw-metrics/debt-inventory') {
        return {
          readInventory: () => fixture.sealedDoc,
          buildInventory: () => ({ items: fixture.liveItems, stats: { by_source: {} } }),
          readDispositions: () => ({ ok: true, lines: fixture.dispositions }),
          SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
          foldDispositions: (lines) => {
            const m = new Map();
            for (const l of lines) m.set(l.item_id, l);
            return m;
          },
          sealAncestry: () => ancestryResult,
        };
      } else if (id === '../../state/findings-registry') {
        return Object.assign({}, require('../../../state/findings-registry'), { readAll: () => ({ findings: fixture.findings }) });
      }
      return originalRequire.apply(this, arguments);
    };
    try {
      delete require.cache[require.resolve('../report.js')];
      return require('../report.js').buildClosureReport(REPO_ROOT);
    } finally {
      Module.prototype.require = originalRequire;
      delete require.cache[require.resolve('../report.js')];
    }
  };

  assert.strictEqual(withAncestry({ verified: [], unverified: [] }).seal.ancestry_depth, 0,
    'an original seal has depth 0');
  assert.strictEqual(withAncestry({ verified: ['a', 'b'], unverified: [] }).seal.ancestry_depth, 2,
    'depth counts VERIFIED ancestors only');
  assert.strictEqual(withAncestry(null).seal.ancestry_depth, null,
    'an unjudgeable chain is null, never 0');
});

// ── producers[] — closure-accounting M3 (DD4/DD5) ────────────────────────────
//
// What these pin is that the registry row carries its own reachability and that
// the per-channel counts are a PARTITION of it. A channel table that does not
// add up to the ledger it annotates is worse than no table: it invites the
// reader to subtract and find a residue nobody can explain.

const M3_FINDINGS = [
  { finding_id: 'a1', gate_id: 'mccp-plan-codex', perspective: 'architect', state: 'open' },
  { finding_id: 'a2', gate_id: 'mccp-plan-codex', perspective: 'test', state: 'closed', closure_type: 'deferred' },
  { finding_id: 'a3', gate_id: 'mccp-plan-codex', perspective: 'codex', state: 'accepted' },
  { finding_id: 'a4', gate_id: 'mccp-plan-codex', perspective: 'codex', state: 'closed', closure_type: 'rejected' },
  { finding_id: 'a5', gate_id: 'mccp-santa-loop', perspective: 'santa-A', state: 'open' },
  { finding_id: 'a6', gate_id: null, perspective: null, state: 'open' },
];

// `readAllResult` may be a function (e.g. one that throws); `registryOverrides`
// replaces other exports of the real module.
function withRegistry(readAllResult, fn, registryOverrides) {
  const fixture = createMockRepoFixture();
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function(id) {
    if (id === '../msw-metrics/debt-inventory') {
      return {
        readInventory: () => fixture.sealedDoc,
        buildInventory: () => ({
          items: fixture.liveItems,
          stats: { by_source: { backlog: 1510, findings: 976, 'fix-task': 1 } },
        }),
        readDispositions: () => ({ ok: true, lines: fixture.dispositions }),
        SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
        foldDispositions: (lines) => {
          const m = new Map();
          for (const l of lines) m.set(l.item_id, l);
          return m;
        },
      };
    } else if (id === '../../state/findings-registry') {
      return Object.assign({}, require('../../../state/findings-registry'), {
        readAll: typeof readAllResult === 'function' ? readAllResult : () => readAllResult,
      }, registryOverrides || {});
    }
    return originalRequire.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(REPO_ROOT);
    return fn(result, result.ledgers.find((l) => l.name === 'findings-registry'));
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
}

const healthyRegistry = (findings) => ({
  findings, degraded: false, degraded_reasons: [], malformed: 0,
});

test('invariant (p1): producers lists the declared channels in order, then unattributed', () => {
  const declared = require('../../../state/findings-registry').PRODUCER_CHANNELS
    .map((c) => c.channel);
  withRegistry(healthyRegistry(M3_FINDINGS), (result, row) => {
    assert.deepStrictEqual(row.producers.map((p) => p.channel), declared.concat(['unattributed']));
    const panel = row.producers.find((p) => p.channel === 'plan-review-panel');
    assert.strictEqual(panel.reachable.adjudicated, false,
      'the default review path cannot adjudicate — that is the whole point of the row');
    assert.deepStrictEqual(panel.reachable.closure_types, ['deferred']);
    assert.ok(panel.pending_owner, 'a channel that cannot close must name who owns wiring it');
  });
});

test('invariant (p2): channel counts partition the ledger they annotate', () => {
  withRegistry(healthyRegistry(M3_FINDINGS), (result, row) => {
    const sum = (k) => row.producers.reduce((a, p) => a + p.observed[k], 0);
    assert.strictEqual(sum('total'), row.total, 'channel totals must sum to the ledger total');
    assert.strictEqual(sum('closed'), row.closed, 'channel closures must sum to the ledger closures');
    // The fixture exercises all four classifications, so the sums above are not
    // vacuously satisfied by a single bucket holding everything.
    for (const ch of ['plan-codex-runner', 'plan-review-panel', 'santa-loop', 'unattributed']) {
      assert.ok(row.producers.find((p) => p.channel === ch).observed.total > 0,
        ch + ' must be exercised or this partition proves nothing');
    }
  });
});

test('invariant (p3): a degraded registry nulls every observed count and keeps reachability', () => {
  withRegistry({
    findings: M3_FINDINGS, degraded: true,
    degraded_reasons: ['unit: truncated line'], malformed: 1,
  }, (result, row) => {
    assert.strictEqual(row.total, null, 'precondition: the row itself is NOT COUNTED');
    for (const p of row.producers) {
      assert.strictEqual(p.observed, null, p.channel + ': a partial read is not a count');
    }
    const panel = row.producers.find((p) => p.channel === 'plan-review-panel');
    assert.deepStrictEqual(panel.reachable.closure_types, ['deferred'],
      'reachability is declaration data — an unreadable ledger does not unmake it');
  });
});

test('invariant (p4): accepted is counted as open AND named, and closed is neither', () => {
  withRegistry(healthyRegistry(M3_FINDINGS), (result, row) => {
    const codex = row.producers.find((p) => p.channel === 'plan-codex-runner');
    // a3 accepted + a4 closed(rejected)
    assert.strictEqual(codex.observed.total, 2);
    assert.strictEqual(codex.observed.open, 1, 'accepted is still open — the debt did not go away');
    assert.strictEqual(codex.observed.accepted, 1, 'and it is named, not folded into open (UI2)');
    assert.strictEqual(codex.observed.closed, 1);
    assert.deepStrictEqual(codex.observed.by_closure_type, { rejected: 1 });
    const panel = row.producers.find((p) => p.channel === 'plan-review-panel');
    assert.strictEqual(panel.observed.accepted, 0, 'the panel channel cannot produce an accepted state');
    assert.deepStrictEqual(panel.observed.by_closure_type, { deferred: 1 });
  });
});

test('invariant (p5): a registry that throws on read keeps reachability and nulls observed', () => {
  withRegistry(() => { throw new Error('unit: registry unreadable'); }, (result, row) => {
    assert.strictEqual(row.total, null, 'precondition: the row itself is NOT COUNTED');
    assert.ok(Array.isArray(row.producers), 'a read failure must not erase the declaration');
    for (const p of row.producers) {
      assert.strictEqual(p.observed, null, p.channel + ': nothing was read, so nothing is counted');
    }
    const panel = row.producers.find((p) => p.channel === 'plan-review-panel');
    assert.deepStrictEqual(panel.reachable.closure_types, ['deferred']);
  });
});

test('invariant (p6): a registry without channel exports degrades loudly instead of reading as empty', () => {
  withRegistry(healthyRegistry(M3_FINDINGS), (result, row) => {
    assert.strictEqual(row.producers, null);
    const hit = (result.degraded || []).find((d) => d.name === 'findings-producers');
    assert.ok(hit, 'a missing channel table must surface in degraded, not as a silent null');
    assert.match(hit.reason, /exports no PRODUCER_CHANNELS/);
  }, { PRODUCER_CHANNELS: undefined });
});

// ── M4 Task 4: the report stops counting judgments it never validated ────────
//
// These use the REAL debt-inventory against a synthetic repo, because the whole
// finding is that the mocked module has no `validateDisposition` to skip.

const fs = require('fs');
const os = require('os');
const di = require('../../msw-metrics/debt-inventory');

function synthRepo(rows) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-closure-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'state', 'findings'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'plans', 'codex-findings-backlog.md'),
    ['# Backlog', '', '| Date | Severity | Source plan | Finding |', '| --- | --- | --- | --- |']
      .concat(rows).join('\n') + '\n', 'utf8');
  return root;
}

function appendRawDisposition(root, rec) {
  fs.appendFileSync(path.join(root, di.DISPOSITIONS_REL),
    JSON.stringify(rec) + '\n', 'utf8');
}

test('(v1) a judgment the validator rejects nulls the row instead of counting it', () => {
  const root = synthRepo(['| 2026-09-01 | LOW | a.md | one |', '| 2026-09-01 | LOW | a.md | two |']);
  const doc = di.sealInventory(root);
  // Straight into the ledger, past `appendDispositions` — which is exactly how a
  // bad line gets there in the first place (a hand edit, a merge, an older
  // writer). Reproduced against the live seal before the fix: every judgment
  // rewritten to this value still reported closed 1115 · pct 100 · degraded [].
  appendRawDisposition(root, {
    item_id: doc.items[0].item_id,
    disposition: 'NOT_A_REAL_ENUM',
    inventory_sha256: doc.inventory_sha256,
    disposed_at: '2026-09-14T00:00:00.000Z',
  });

  delete require.cache[require.resolve('../report.js')];
  const report = require('../report.js');
  const out = report.buildClosureReport(root);
  const row = out.ledgers.find((l) => l.name === 'disposition-ledger');

  assert.strictEqual(row.closed, null);
  assert.strictEqual(row.total, null);
  assert.strictEqual(row.pct, null);
  assert.strictEqual(row.resolved, null);
  assert.strictEqual(row.fixed, null);
  assert.strictEqual(out.dispositions, null);
  assert.ok(out.degraded.some((d) => d.name === 'disposition-validity'),
    'the reason names the validity axis, not the ledger or the seal');
  assert.match(row.denominator_note, /invalid dispositions/);
  assert.strictEqual(out.reseal_warning, null,
    'a warning must not quote a count the row above just declared uncountable');
});

test('(v2) a `fixed` with no evidence is the same failure as a bogus enum', () => {
  const root = synthRepo(['| 2026-09-01 | LOW | a.md | one |']);
  const doc = di.sealInventory(root);
  appendRawDisposition(root, {
    item_id: doc.items[0].item_id,
    disposition: 'fixed',          // real enum, but `fixed` requires evidence
    inventory_sha256: doc.inventory_sha256,
    disposed_at: '2026-09-14T00:00:00.000Z',
  });

  delete require.cache[require.resolve('../report.js')];
  const out = require('../report.js').buildClosureReport(root);
  const row = out.ledgers.find((l) => l.name === 'disposition-ledger');
  assert.strictEqual(row.closed, null);
  assert.ok(out.degraded.some((d) => d.name === 'disposition-validity'));
});

test('(v3) positive control — valid judgments still produce numbers', () => {
  const root = synthRepo(['| 2026-09-01 | LOW | a.md | one |', '| 2026-09-01 | LOW | a.md | two |']);
  const doc = di.sealInventory(root);
  const res = di.appendDispositions(root, [
    { item_id: doc.items[0].item_id, disposition: 'fixed', evidence: '#1' },
  ]);
  assert.strictEqual(res.ok, true, JSON.stringify(res.rejected || []));

  delete require.cache[require.resolve('../report.js')];
  const out = require('../report.js').buildClosureReport(root);
  const row = out.ledgers.find((l) => l.name === 'disposition-ledger');
  assert.strictEqual(row.closed, 1, 'the null above is caused by invalidity, not by this path');
  assert.strictEqual(row.total, 2);
  assert.strictEqual(row.resolved, 1);
  assert.strictEqual(row.fixed, 1);
  assert.ok(!out.degraded.some((d) => d.name === 'disposition-validity'));
});

test('(o1) B15 — a later build failure does not erase an earlier one', () => {
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;
  const sealed = {
    meta: { sealed_at: '2026-09-01T00:00:00.000Z', sealed_at_commit: 'abc', stats: {} },
    inventory_sha256: 'sha256:' + '0'.repeat(64),
    items: [{ item_id: 'backlog:0', source: 'backlog', severity: 'LOW' }],
  };
  Module.prototype.require = function (id) {
    if (id === '../msw-metrics/debt-inventory') {
      return {
        readInventory: () => sealed,
        // The seal's digest does not recompute, AND the ledger is malformed, AND
        // the live build throws. Order of discovery must not decide the report.
        inventoryHash: () => 'sha256:' + 'f'.repeat(64),
        readDispositions: () => ({ ok: true, lines: [], malformed: 3 }),
        buildInventory: () => { throw new Error('live collector exploded'); },
        SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
        foldDispositions: () => new Map(),
      };
    }
    return originalRequire.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve('../report.js')];
    const out = require('../report.js').buildClosureReport(REPO_ROOT);
    const names = out.degraded.map((d) => d.name).sort();
    assert.ok(names.includes('live-inventory'), 'the build error is reported');
    assert.ok(names.includes('seal-digest'), 'and so is the corruption seen before it');
    assert.ok(names.includes('disposition-ledger'), 'and the malformed ledger');
    assert.strictEqual(out.dispositions, null,
      'a blocked disposition axis stays blocked on the early-return path too');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
});

test('(n1) B18 — a registry with no findings array is unknown, not zero', () => {
  const Module = require('node:module');
  // Captured BEFORE the override: resolved relative to THIS file. Resolving it
  // inside the hook would use report.js as the base and throw, which lands in the
  // catch path and tests a different branch than the one named here.
  const realRegistry = require('../../../state/findings-registry');
  const originalRequire = Module.prototype.require;
  const fixture = createMockRepoFixture();
  Module.prototype.require = function (id) {
    if (id === '../msw-metrics/debt-inventory') {
      return {
        readInventory: () => fixture.sealedDoc,
        buildInventory: () => ({ items: fixture.liveItems, stats: { by_source: {} } }),
        readDispositions: () => ({ ok: true, lines: fixture.dispositions }),
        SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
        foldDispositions: (lines) => {
          const m = new Map();
          for (const l of lines) m.set(l.item_id, l);
          return m;
        },
      };
    }
    if (id === '../../state/findings-registry') {
      return Object.assign({}, realRegistry, {
        readAll: () => ({ findings: {} }),      // truthy, not an array
      });
    }
    return originalRequire.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve('../report.js')];
    const out = require('../report.js').buildClosureReport(REPO_ROOT);
    const row = out.ledgers.find((l) => l.name === 'findings-registry');
    assert.strictEqual(row.closed, null, '0/0 would be a claim; null is the honest answer');
    assert.strictEqual(row.total, null);
    assert.ok(out.degraded.some((d) => d.name === 'findings-registry'
      && /no findings array/.test(d.reason)));
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
});

test('(r1) DD4 — fixed <= resolved <= closed on the row, and all three null together',
  withFixtures((t, report) => {
    const out = report.buildClosureReport(REPO_ROOT);
    const row = out.ledgers.find((l) => l.name === 'disposition-ledger');
    assert.ok(Object.prototype.hasOwnProperty.call(row, 'resolved'));
    assert.ok(Object.prototype.hasOwnProperty.call(row, 'fixed'));
    assert.ok(row.fixed <= row.resolved && row.resolved <= row.closed,
      'fixed ' + row.fixed + ' <= resolved ' + row.resolved + ' <= closed ' + row.closed);
    // And the registry row, which counts closures rather than dispositions, must
    // NOT carry them — the renderer keys its label off the key's presence.
    const reg = out.ledgers.find((l) => l.name === 'findings-registry');
    assert.ok(!Object.prototype.hasOwnProperty.call(reg, 'resolved'));
  }));

test('(v4) an unanswerable validity check is unknown, not clean', () => {
  const Module = require('node:module');
  const originalRequire = Module.prototype.require;
  const fixture = createMockRepoFixture();
  const base = {
    readInventory: () => fixture.sealedDoc,
    buildInventory: () => ({ items: fixture.liveItems, stats: { by_source: {} } }),
    readDispositions: () => ({ ok: true, lines: fixture.dispositions }),
    SUPPRESSING_DISPOSITIONS: ['fixed', 'obsolete', 'superseded', 'duplicate'],
    foldDispositions: (lines) => {
      const m = new Map();
      for (const l of lines) m.set(l.item_id, l);
      return m;
    },
  };

  // `verifyDispositions` has early returns (no seal, unreadable ledger) whose
  // shape omits the count entirely. `undefined > 0` is false, so a bare `> 0`
  // test reads "not invalid" — a success-direction default, which is the exact
  // pathology this PRD names. Both unanswerable shapes must degrade.
  const shapes = [
    { label: 'no count reported', verifyDispositions: () => ({ ok: false }) },
    { label: 'validator threw', verifyDispositions: () => { throw new Error('boom'); } },
  ];
  for (const shape of shapes) {
    Module.prototype.require = function (id) {
      if (id === '../msw-metrics/debt-inventory') {
        return Object.assign({}, base, { verifyDispositions: shape.verifyDispositions });
      }
      return originalRequire.apply(this, arguments);
    };
    try {
      delete require.cache[require.resolve('../report.js')];
      const out = require('../report.js').buildClosureReport(REPO_ROOT);
      const row = out.ledgers.find((l) => l.name === 'disposition-ledger');
      assert.strictEqual(row.closed, null, shape.label + ': must not report a count');
      assert.strictEqual(out.dispositions, null, shape.label);
      assert.ok(out.degraded.some((d) => d.name === 'disposition-validity'), shape.label);
    } finally {
      Module.prototype.require = originalRequire;
      delete require.cache[require.resolve('../report.js')];
    }
  }

  // Positive control: a validator that answers 0 lets the row report numbers, so
  // the nulls above come from unanswerability and not from the mock's presence.
  Module.prototype.require = function (id) {
    if (id === '../msw-metrics/debt-inventory') {
      return Object.assign({}, base, { verifyDispositions: () => ({ invalid_dispositions: 0 }) });
    }
    return originalRequire.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve('../report.js')];
    const out = require('../report.js').buildClosureReport(REPO_ROOT);
    const row = out.ledgers.find((l) => l.name === 'disposition-ledger');
    assert.ok(typeof row.closed === 'number');
    assert.ok(!out.degraded.some((d) => d.name === 'disposition-validity'));
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
});
