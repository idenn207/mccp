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
        return {
          readAll: () => ({
            findings: fixture.findings,
          }),
        };
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
  const result = report.buildClosureReport(process.cwd());
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
    const result = testReport.buildClosureReport(process.cwd());
    const keys = Object.keys(result).sort();
    const expectedKeys = ['degraded', 'denominator_gap', 'dispositions', 'ledgers', 'live', 'reseal_warning', 'seal'].sort();
    assert.deepStrictEqual(keys, expectedKeys, 'degraded path has different keys');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
}));

test('invariant (b): disposed >= resolved >= fixed', withFixtures((t, report, fixture) => {
  const result = report.buildClosureReport(process.cwd());
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
  const result = report.buildClosureReport(process.cwd());

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
  const result = report.buildClosureReport(process.cwd());
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
  const result = report.buildClosureReport(process.cwd());

  // Load baseline for comparison (just check structure, not values)
  // C1: Correct path from repo root, not from test file
  const fs = require('fs');
  const repoRoot = process.cwd();
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
  const repoRoot = process.cwd();
  const baselinePath = path.join(repoRoot, '.claude/_meta/data/2026-09-08-closure-baseline.json');
  assert.ok(fs.existsSync(baselinePath), 'baseline file must exist at ' + baselinePath);

  const content = fs.readFileSync(baselinePath, 'utf8');
  assert.ok(content, 'baseline file must not be empty');
  const baseline = JSON.parse(content);
  assert.ok(baseline.debt_inventory, 'baseline must have debt_inventory section');
});

test('invariant (f): no absolute paths in output', withFixtures((t, report, fixture) => {
  const result = report.buildClosureReport(process.cwd());
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
      return {
        readAll: () => ({ findings: [] }),
      };
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(process.cwd());

    assert.strictEqual(result.denominator_gap.count, 0, 'gap should be 0');
    assert.strictEqual(result.reseal_warning, null, 'reseal_warning should be null when gap === 0');
  } finally {
    Module.prototype.require = originalRequire;
    delete require.cache[require.resolve('../report.js')];
  }
}));

test('invariant (c2): denominator_gap.pct divides by live.items, not seal.items (C2)', withFixtures((t, report, fixture) => {
  const result = report.buildClosureReport(process.cwd());

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
      return {
        readAll: () => ({ findings: [] }),
      };
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(process.cwd());

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
      return {
        readAll: () => ({
          findings: [
            // Mix of states
            { finding_id: 'f0', state: 'open', severity: 'MEDIUM', claim_digest: 'dig0' },
            { finding_id: 'f1', state: 'closed', severity: 'MEDIUM', claim_digest: 'dig1' },
            { finding_id: 'f2', state: 'finding_adjudicated', severity: 'MEDIUM', claim_digest: 'dig2' },
            { finding_id: 'f3', state: 'accepted', severity: 'MEDIUM', claim_digest: 'dig3' },
          ],
        }),
      };
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(process.cwd());

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

test('invariant (c9): negative gap reports negative pct (not clamped to 0) (C9)', withFixtures((t, report, fixture) => {
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
      return { readAll: () => ({ findings: [] }) };
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(process.cwd());

    // gap = 50 - 100 = -50
    // pct = -50 / 50 * 100 = -100%
    assert.strictEqual(result.denominator_gap.count, -50, 'gap should be negative (-50)');
    const expectedPct = parseFloat((-50 * 100 / 50).toFixed(2));
    assert.strictEqual(result.denominator_gap.pct, expectedPct, 'gap pct should be negative (' + expectedPct + '), not clamped to 0');
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
      return {
        readAll: () => {
          const err = new Error('Registry file /root/.claude/state/findings-registry.json corrupted');
          throw err;
        },
      };
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    // Should NOT throw; should return with degraded entries
    const result = testReport.buildClosureReport(process.cwd());

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
        return { readAll: () => ({ findings: [] }) };
      }
      return originalRequire.apply(this, arguments);
    };

    try {
      delete require.cache[require.resolve('../report.js')];
      const testReport = require('../report.js');
      const result = testReport.buildClosureReport(process.cwd());

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
      return { readAll: () => ({ findings: [] }) };
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../report.js')];
    const testReport = require('../report.js');
    const result = testReport.buildClosureReport(process.cwd());

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
    const result = testReport.buildClosureReport(process.cwd());

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
    const result = testReport.buildClosureReport(process.cwd());

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
    const result = testReport.buildClosureReport(process.cwd());

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
  const SHA = 'sha256:right';
  const realDebt = require('../../msw-metrics/debt-inventory');

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
          items: Array.from({ length: 10 }, (_, i) => ({ item_id: 'a' + i, source: 'backlog' })),
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
    const result = require('../report.js').buildClosureReport(process.cwd());
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

    // The warning has to carry both anchors: the count tells the operator what a
    // re-seal would unbind, the sha says which seal they are bound to.
    assert.match(result.reseal_warning, /\b6\b/, 'reseal_warning must quote the disposition count');
    assert.ok(result.reseal_warning.indexOf(SHA) !== -1, 'reseal_warning must quote inventory_sha256');
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
      const result = require('../report.js').buildClosureReport(process.cwd());
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
    const result = require('../report.js').buildClosureReport(process.cwd());
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
    const result = require('../report.js').buildClosureReport(process.cwd());

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
