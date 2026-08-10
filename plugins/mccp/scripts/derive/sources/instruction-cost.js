'use strict';

// derive source: instruction-cost (A3)
//
// Reads the committed A3 artifact (docs/multi-session-work-loop/a3-baseline.json)
// and re-hashes CLAUDE.md to decide whether that recorded measurement still
// describes the current tree.
//
// Why read an artifact instead of measuring here: A3's numerator requires a
// tiktoken subprocess (~1s with the Python start-up). derive runs on every
// render trigger under a ~1s budget, so tokenizing inline would blow it on
// every SessionStart. The split is deliberate —
// `msw-metrics/cli.js a3 --emit|--emit-after` runs the tokenizer, this source
// only reads. A stale artifact is reported as stale rather than silently
// serving an old number as current.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ARTIFACT_REL = path.join('docs', 'multi-session-work-loop', 'a3-baseline.json');

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function scanInstructionCost(repoRoot) {
  const result = {
    ok: true,
    artifact_present: false,
    artifact_path: ARTIFACT_REL,
    status: null,
    baseline_tokens: null,
    current_tokens: null,
    denominator_tokens: null,
    reduction_ratio: null,
    claude_md_reduction_ratio: null,
    measured_at: null,
    tokenizer_version: null,
    tokenizer_version_source: null,
    stale: false,
    stale_reason: null,
    producer_coverage: 'instruction-cost',
    degraded: false,
    invalid_count: 0,
    error: null,
  };

  try {
    const artifactPath = path.join(repoRoot, ARTIFACT_REL);
    if (!fs.existsSync(artifactPath)) return result;

    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    } catch (parseErr) {
      result.invalid_count = 1;
      result.degraded = true;
      result.error = 'a3 artifact unparsable: ' + parseErr.message;
      return result;
    }

    result.artifact_present = true;

    // `after` is the post-reduction measurement when one has been recorded;
    // otherwise the baseline IS the current value.
    const current = (doc.after && doc.after.status) ? doc.after : doc;

    result.status = current.status || null;
    result.baseline_tokens = Number.isFinite(doc.numerator_tokens) ? doc.numerator_tokens : null;
    result.current_tokens = Number.isFinite(current.numerator_tokens) ? current.numerator_tokens : null;
    result.denominator_tokens = Number.isFinite(current.denominator_tokens)
      ? current.denominator_tokens : null;
    result.measured_at = current.measured_at || null;
    result.tokenizer_version = (current.tokenizer && current.tokenizer.version) || null;
    result.tokenizer_version_source = (current.tokenizer && current.tokenizer.version_source) || null;

    if (doc.reduction && Number.isFinite(doc.reduction.total_ratio)) {
      result.reduction_ratio = doc.reduction.total_ratio;
      result.claude_md_reduction_ratio = Number.isFinite(doc.reduction.claude_md_ratio)
        ? doc.reduction.claude_md_ratio : null;
    }

    // Freshness — only the repo-tracked component can be verified here. The
    // user-level memory digest is intentionally never committed (S5) and the
    // STATE.md block is session-volatile, so neither is a usable staleness
    // signal; CLAUDE.md is, and it is the component M4 actually moves.
    // The numerator has three components but only one of them can be checked
    // here, so the metric publishes WHICH one -- a freshness claim whose scope
    // is invisible reads as if it covered the whole number.
    result.freshness_scope = 'claude_md';
    result.numerator_components = current.components ? Object.keys(current.components) : [];

    const recordedHash = current.components
      && current.components.claude_md
      && current.components.claude_md.hash;
    const claudePath = path.join(repoRoot, 'CLAUDE.md');
    if (recordedHash && fs.existsSync(claudePath)) {
      const actual = sha256(fs.readFileSync(claudePath, 'utf8'));
      if (actual !== recordedHash) {
        result.stale = true;
        result.stale_reason = 'CLAUDE.md changed since the A3 measurement (re-run: msw-metrics/cli.js a3 --emit-after)';
      }
    } else if (!recordedHash) {
      result.stale = true;
      result.stale_reason = 'artifact records no CLAUDE.md digest, so freshness cannot be verified';
    }
  } catch (err) {
    result.ok = false;
    result.degraded = true;
    result.error = err.message;
  }

  return result;
}

module.exports = { scanInstructionCost, ARTIFACT_REL };
