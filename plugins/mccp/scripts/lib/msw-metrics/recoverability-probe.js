/**
 * C1 recoverability probe — read-only retrospective audit of PR findings
 *
 * Stratified sample of PR body prose (## Codex Review / YAGNI sections)
 * by gate × commit-month. Apply 4 pre-registered thresholds to verdict.
 *
 * READ-ONLY: This probe emits diagnostics but writes NO new records.
 * Purpose: Determine if C1 (feedback closure rate) can be recovered retrospectively.
 *
 * Pre-registered thresholds (frozen, measurement-feasibility.md §4.2):
 * 1. Minimum positives per cell: 5 (to ensure CI ≤±0.4)
 * 2. Sample size: ≥40 (88% of available YAGNI corpus = 46)
 * 3. Parse success rate: ≥60% (self-assisted parsing target)
 * 4. Inter-rater agreement: ≥75% (kappa minimum for validity)
 */

const fs = require('fs');
const path = require('path');

/**
 * Run recoverability probe on PR corpus
 * @param {Object} opts
 * @param {string} [opts.repoPath] - repo root (inferred from cwd if not provided)
 * @param {boolean} [opts.dryRun] - if true, only analyze; emit no side effects
 * @returns {Object} probe result with verdict and coverage metrics
 */
async function probeRecoverability(opts = {}) {
  const repoPath = opts.repoPath || process.cwd();
  const receiptDir = path.join(repoPath, '.claude', 'receipts', 'mccp-pr-codex');

  const result = {
    verdict: null,
    status: 'pending',
    thresholds: {
      min_positives_per_cell: 5,
      min_sample_size: 40,
      min_parse_rate: 0.60,
      min_inter_rater_agreement: 0.75,
    },
    coverage: {
      total_pr_codex_receipts: 0,
      receipts_with_yagni: 0,
      sample_attempted: 0,
      sample_parsed: 0,
      sample_with_findings: 0,
      inter_rater_samples: 0,
      inter_rater_agreement_rate: null,
      cells_below_threshold: [],
      insufficient_axes: [],
    },
    thresholds_met: {},
    findings: {
      summary: '',
      details: [],
    },
    dryRun: opts.dryRun === true,
  };

  try {
    // Step 1: Enumerate receipts and identify those with YAGNI markers
    if (!fs.existsSync(receiptDir)) {
      result.status = 'corpus-unavailable';
      result.findings.summary = 'PR-Codex receipt directory not found';
      return result;
    }

    const receipts = fs.readdirSync(receiptDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(receiptDir, f);
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          return { id: f.replace('.json', ''), path: filePath, receipt: content };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);

    result.coverage.total_pr_codex_receipts = receipts.length;

    // Step 2: Sample receipts with YAGNI markers (these indicate gate findings)
    const withYagni = receipts.filter(r => {
      if (!r.receipt.findings || !Array.isArray(r.receipt.findings)) return false;
      // Check if any finding mentions YAGNI or gate decision context
      return r.receipt.findings.some(f =>
        (f.body || f.title || '').toLowerCase().includes('yagni')
      );
    });

    result.coverage.receipts_with_yagni = withYagni.length;

    // Step 3: Stratified sample by gate + commit-month
    // For now, simulate 0-rater agreement (since human audit is manual, not automated)
    // The probe structure is here; actual inter-rater data would come from human audit
    const stratifiedSample = selectStratifiedSample(receipts, result.thresholds);
    result.coverage.sample_attempted = stratifiedSample.length;

    // Step 4: Attempt parsing of each sample
    for (const sample of stratifiedSample) {
      try {
        const parsed = parseFindings(sample.receipt);
        if (parsed && parsed.findings && parsed.findings.length > 0) {
          result.coverage.sample_parsed++;
          result.coverage.sample_with_findings++;
        }
      } catch (e) {
        // Parsing error is a parse failure
      }
    }

    const parseRate = result.coverage.sample_attempted > 0
      ? result.coverage.sample_parsed / result.coverage.sample_attempted
      : 0;

    // Step 5: Check thresholds
    result.thresholds_met = {
      min_positives_per_cell: checkCellThreshold(receipts, 5),
      min_sample_size: result.coverage.sample_attempted >= result.thresholds.min_sample_size,
      min_parse_rate: parseRate >= result.thresholds.min_parse_rate,
      min_inter_rater_agreement: result.coverage.inter_rater_agreement_rate === null
        ? false  // Not enough data for inter-rater; fail closed
        : result.coverage.inter_rater_agreement_rate >= result.thresholds.min_inter_rater_agreement,
    };

    // Step 6: Determine verdict
    const allThresholdsMet = Object.values(result.thresholds_met).every(Boolean);
    const failingThresholds = Object.entries(result.thresholds_met)
      .filter(([_, met]) => !met)
      .map(([name, _]) => name);

    if (allThresholdsMet) {
      result.verdict = 'recoverable';
      result.status = 'complete';
      result.findings.summary = 'C1 recoverability: All thresholds met. Retrospective baseline recoverable.';
    } else {
      result.verdict = `insufficient-${failingThresholds.join('+')}`;
      result.status = 'incomplete';
      result.findings.summary = `C1 recoverability: FAILED thresholds: ${failingThresholds.join(', ')}`;
    }

    result.findings.details = [
      `Total PR-Codex receipts: ${result.coverage.total_pr_codex_receipts}`,
      `Receipts with YAGNI: ${result.coverage.receipts_with_yagni}`,
      `Stratified sample: ${result.coverage.sample_attempted}`,
      `Successfully parsed: ${result.coverage.sample_parsed} (${(parseRate * 100).toFixed(1)}%)`,
      `Threshold: min_parse_rate ${result.thresholds.min_parse_rate * 100}% — ${result.thresholds_met.min_parse_rate ? 'PASS' : 'FAIL'}`,
      `Threshold: min_sample_size ${result.thresholds.min_sample_size} — ${result.thresholds_met.min_sample_size ? 'PASS' : 'FAIL'}`,
      `Threshold: inter_rater_agreement — insufficient data (manual audit required)`,
    ];

  } catch (e) {
    result.status = 'error';
    result.findings.summary = `Probe error: ${e.message}`;
  }

  return result;
}

/**
 * Select stratified sample from receipts
 * Strata: gate type × base_sha commit-month
 * Target: ~40 samples (frozen threshold from measurement-feasibility.md)
 */
function selectStratifiedSample(receipts, thresholds) {
  // Group by (gate, month)
  const strata = new Map();

  for (const receipt of receipts) {
    if (!receipt.receipt.base_sha) continue;

    // Use receipt id or base_sha as strata key (simplified)
    const key = receipt.receipt.base_sha.substring(0, 7); // First 7 chars as proxy
    if (!strata.has(key)) {
      strata.set(key, []);
    }
    strata.get(key).push(receipt);
  }

  // Sample proportionally from each stratum
  const targetSize = thresholds.min_sample_size;
  const samples = [];

  for (const [_, stratumReceipts] of strata) {
    const samplesFromStratum = Math.max(1, Math.ceil(
      (stratumReceipts.length / receipts.length) * targetSize
    ));

    // Random sample from this stratum
    const shuffled = stratumReceipts.sort(() => Math.random() - 0.5);
    samples.push(...shuffled.slice(0, samplesFromStratum));
  }

  return samples.slice(0, targetSize);
}

/**
 * Parse findings from receipt
 * Attempts canonical format (TABLE) + fallback to prose parsing
 */
function parseFindings(receipt) {
  const findings = [];

  if (!receipt.findings || !Array.isArray(receipt.findings)) {
    return { findings, parsed: false };
  }

  for (const finding of receipt.findings) {
    if (finding.title || finding.body) {
      findings.push({
        title: finding.title || '',
        body: finding.body || '',
        severity: finding.severity || 'unknown',
      });
    }
  }

  return {
    findings,
    parsed: findings.length > 0,
  };
}

/**
 * Check if each cell (gate × month × finding-type) has ≥5 positives
 * Simplified: just count receipt cells
 */
function checkCellThreshold(receipts, minPerCell) {
  const cellCounts = new Map();

  for (const receipt of receipts) {
    // Simplified cell key (in production would use gate + month + type)
    const key = receipt.receipt.base_sha?.substring(0, 7) || 'unknown';
    cellCounts.set(key, (cellCounts.get(key) || 0) + 1);
  }

  // All cells must have ≥ minPerCell
  for (const count of cellCounts.values()) {
    if (count < minPerCell) {
      return false;
    }
  }

  return cellCounts.size > 0;
}

module.exports = { probeRecoverability };
