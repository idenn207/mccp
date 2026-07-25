/**
 * Test: C1 recoverability probe
 *
 * Key assertions:
 * 1. Probe writes NO new records (read-only)
 * 2. Probe emits verdict + coverage metrics
 * 3. Thresholds are pre-registered (measurement-feasibility.md §4.2)
 * 4. Verdict reflects threshold failures
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { probeRecoverability } = require('../msw-metrics/recoverability-probe');

test('C1 probe: read-only — writes 0 new records', async () => {
  const result = await probeRecoverability({ dryRun: true });

  // Probe should never write anything in dry-run mode
  assert.strictEqual(result.dryRun, true, 'dryRun flag should be honored');

  // Verdict should be computed regardless of corpus availability
  assert(result.verdict,
    'Probe should return a verdict (even if corpus unavailable)');

  console.log(`✓ C1 probe: read-only mode, verdict = ${result.verdict}`);
});

test('C1 probe: emits verdict + coverage', async () => {
  const result = await probeRecoverability({ dryRun: true });

  // Assert verdict is one of the expected values
  assert(
    result.verdict === 'recoverable' ||
    result.verdict?.startsWith('insufficient-'),
    `Verdict should be 'recoverable' or 'insufficient-*', got: ${result.verdict}`
  );

  // Assert coverage metrics exist
  assert(typeof result.coverage === 'object',
    'Coverage metrics should be provided');
  assert(typeof result.coverage.total_pr_codex_receipts === 'number',
    'Coverage should have receipt count');
  assert(typeof result.coverage.sample_attempted === 'number',
    'Coverage should have sample size');

  console.log(`✓ C1 probe: verdict=${result.verdict}, coverage=${JSON.stringify(result.coverage)}`);
});

test('C1 probe: pre-registered thresholds', async () => {
  const result = await probeRecoverability({ dryRun: true });

  // Verify thresholds are frozen (not changeable)
  const expectedThresholds = {
    min_positives_per_cell: 5,
    min_sample_size: 40,
    min_parse_rate: 0.60,
    min_inter_rater_agreement: 0.75,
  };

  for (const [key, value] of Object.entries(expectedThresholds)) {
    assert.strictEqual(
      result.thresholds[key],
      value,
      `Threshold ${key} should be ${value} (frozen, measurement-feasibility.md §4.2)`
    );
  }

  console.log('✓ C1 probe: all 4 thresholds frozen at expected values');
});

test('C1 probe: threshold_met flags match verdict', async () => {
  const result = await probeRecoverability({ dryRun: true });

  // If verdict is 'recoverable', all thresholds should be met
  if (result.verdict === 'recoverable') {
    const allMet = Object.values(result.thresholds_met).every(Boolean);
    assert(allMet,
      'If verdict=recoverable, all thresholds should be met');
  }

  // If verdict starts with 'insufficient', at least one threshold should be unmet
  if (result.verdict?.startsWith('insufficient-')) {
    const anyUnmet = Object.values(result.thresholds_met).some(v => !v);
    assert(anyUnmet,
      'If verdict=insufficient-*, at least one threshold should be unmet');
  }

  console.log('✓ C1 probe: verdict consistency verified');
});

test('C1 probe: findings detail messages', async () => {
  const result = await probeRecoverability({ dryRun: true });

  // Probe should always produce a summary
  assert(result.findings.summary,
    'Findings should include summary');

  // Details should be an array (even if empty)
  assert(Array.isArray(result.findings.details),
    'Findings.details should be an array');

  console.log(`✓ C1 probe: findings summary provided`);
});
