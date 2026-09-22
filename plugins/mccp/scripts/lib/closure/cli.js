'use strict';

/**
 * closure report CLI — thin wrapper around the oracle
 *
 * Usage: closure report [--json] [--repo-root <path>]
 * Exit code: 0 always (this is an instrument, not a gate)
 *           2 for unknown subcommand
 *
 * Mirror: plugins/mccp/scripts/lib/env-contract/cli.js:290 (CLI pattern)
 */

const report = require('./report');

// closure-accounting M3 — one line per producer channel, under the registry row
// it qualifies. A reader who sees `Closed 21 / 1280 · 1.64%` alone reads a debt
// closure rate; these lines say which channels could ever move that numerator.
function producerLine(p) {
  const counts = p.observed
    ? 'open ' + p.observed.open + ' / total ' + p.observed.total + ' · accepted ' + p.observed.accepted
    : 'not counted';
  // A channel that registers nothing still shows its counts — without them the
  // human output cannot be summed against the ledger row it annotates.
  if (p.registers === false) return counts + ' · not registered in the findings registry';
  // `unattributed` is a bucket, not a producer: it has counts but nothing is
  // declared about what it can reach.
  if (!p.reachable) return counts + ' · not a declared producer';
  const types = p.reachable.closure_types.length ? p.reachable.closure_types.join(', ') : 'none';
  const owner = p.pending_owner ? ' (owner: ' + p.pending_owner + ')' : '';
  return counts
    + ' · closures reachable: ' + types
    + ' · adjudication: ' + (p.reachable.adjudicated ? 'reachable' : 'unreachable')
    + owner;
}

function isCount(v) { return typeof v === 'number' && Number.isFinite(v); }

// Never the text `null` (M4 L1) — an unknown number is `n/a`.
function na(v) { return isCount(v) ? String(v) : 'n/a'; }

// closure-accounting M5 (MF2) — the disposed part is the one worth reading: those
// judgments are what the next re-seal reports as dropped.
function sealedNotLiveText(gap) {
  if (!isCount(gap.sealed_not_live)) return 'n/a';
  const d = gap.sealed_not_live_disposed;
  if (!isCount(d)) return gap.sealed_not_live + ' (dispositions among them: n/a)';
  if (d === 0) return gap.sealed_not_live + ' (none with a disposition)';
  return gap.sealed_not_live + ' (' + d + ' with a disposition — dropped at the next re-seal)';
}

function formatTable(obj) {
  // Simple human-readable table format
  const lines = [];

  // Print degraded section FIRST (C6) so errors are visible when numbers are unavailable
  if (obj.degraded && obj.degraded.length) {
    lines.push('ERRORS');
    for (const deg of obj.degraded) {
      lines.push('  ' + deg.name + ': ' + deg.reason);
    }
    lines.push('');
  }

  // Seal section (always available per EMPTY pattern)
  if (obj.seal) {
    lines.push('SEALED INVENTORY');
    lines.push('  Sealed at:       ' + (obj.seal.sealed_at || 'unknown'));
    lines.push('  Sealed commit:   ' + (obj.seal.sealed_at_commit || 'unknown'));
    lines.push('  Items:           ' + obj.seal.items);
    lines.push('  Age (days):      ' + (obj.seal.age_days !== null ? obj.seal.age_days : 'unknown'));
    if (obj.seal.by_source) {
      Object.keys(obj.seal.by_source).forEach(function(src) {
        lines.push('    ' + src + ': ' + obj.seal.by_source[src]);
      });
    }
    lines.push('');
  }

  // Live section (C6: null when degraded)
  if (obj.live) {
    lines.push('LIVE INVENTORY');
    lines.push('  Items:           ' + obj.live.items);
    if (obj.live.by_source) {
      Object.keys(obj.live.by_source).forEach(function(src) {
        lines.push('    ' + src + ': ' + obj.live.by_source[src]);
      });
    }
    lines.push('');
  } else if (obj.degraded && obj.degraded.length) {
    lines.push('LIVE INVENTORY');
    lines.push('  (unavailable — see ERRORS above)');
    lines.push('');
  }

  // Gap section (C6: null when degraded)
  if (obj.denominator_gap) {
    const gap = obj.denominator_gap;
    lines.push('DENOMINATOR GAP');
    lines.push('  Count:           ' + na(gap.count));
    lines.push('  Percentage:      ' + (isCount(gap.pct) ? gap.pct + '%' : 'n/a'));
    // `Count` is a set difference and never negative; this is a length
    // difference and can be. Two similar-sized numbers side by side read as a
    // duplicate or a contradiction unless the line says which question it answers.
    lines.push('  Net change:      ' + (isCount(gap.net_change)
      ? gap.net_change + ' (live − sealed; may be negative)' : 'n/a'));
    lines.push('  Sealed not live: ' + sealedNotLiveText(gap));
    lines.push('');
  } else if (obj.degraded && obj.degraded.length) {
    lines.push('DENOMINATOR GAP');
    lines.push('  (unavailable — see ERRORS above)');
    lines.push('');
  }

  // Dispositions section (C6: null when degraded)
  if (obj.dispositions) {
    lines.push('DISPOSITIONS (sealed)');
    lines.push('  Total:           ' + obj.dispositions.total);
    lines.push('  Disposed:        ' + obj.dispositions.disposed);
    lines.push('  Resolved:        ' + obj.dispositions.resolved);
    lines.push('  Fixed:           ' + obj.dispositions.fixed);
    if (obj.dispositions.by_disposition) {
      Object.keys(obj.dispositions.by_disposition).sort().forEach(function(disp) {
        lines.push('    ' + disp + ': ' + obj.dispositions.by_disposition[disp]);
      });
    }
    lines.push('');
  } else if (obj.degraded && obj.degraded.length) {
    lines.push('DISPOSITIONS (sealed)');
    lines.push('  (unavailable — see ERRORS above)');
    lines.push('');
  }

  // Ledgers section
  if (obj.ledgers && obj.ledgers.length) {
    lines.push('LEDGER CLOSURE RATES');
    for (const ledger of obj.ledgers) {
      lines.push('  ' + ledger.name);
      // DD4 — a row that carries `resolved` is counting DISPOSITIONS, not
      // closures: 1101 of 2841 with 970 of them `deferred` is not "38.75% closed".
      // The label change and the extra line travel together, and the branch keys
      // off the KEY's presence, never the row's name — a row is what it carries.
      const disposed = Object.prototype.hasOwnProperty.call(ledger, 'resolved');
      // A null count is "not counted", never the text `null / null` — the reason
      // lives in Denominator, so that is where the reader is sent.
      const counted = ledger.closed !== null && ledger.closed !== undefined;
      lines.push('    ' + (disposed ? 'Disposed:      ' : 'Closed:        ')
        + (counted ? ledger.closed + ' / ' + ledger.total : 'not counted (see Denominator)'));
      if (disposed && counted) {
        lines.push('    Resolved:      ' + ledger.resolved
          + ' (fixed ' + ledger.fixed + ')');
      }
      lines.push('    Pct:           '
        + (ledger.pct === null || ledger.pct === undefined ? 'n/a' : ledger.pct + '%'));
      lines.push('    Denominator:   ' + ledger.denominator_note);
      if (Array.isArray(ledger.producers)) {
        lines.push('    Producers:');
        for (const p of ledger.producers) {
          lines.push('      ' + p.channel + '  ' + producerLine(p));
        }
      }
    }
    lines.push('');
  }

  // Warning section
  if (obj.reseal_warning) {
    lines.push('WARNING');
    lines.push('  ' + obj.reseal_warning);
    lines.push('');
  }

  return lines.join('\n');
}

function main(argv) {
  // Parse arguments
  let isJson = false;
  let repoRoot = process.cwd();
  let subcommand = null;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--json') {
      isJson = true;
      i += 1;
    } else if (arg === '--repo-root') {
      if (i + 1 >= argv.length) {
        console.error('--repo-root requires a path argument');
        return 2;
      }
      repoRoot = argv[i + 1];
      i += 2;
    } else if (!subcommand && !arg.startsWith('-')) {
      subcommand = arg;
      i += 1;
    } else {
      i += 1;
    }
  }

  // Only 'report' subcommand is supported
  if (!subcommand || subcommand === 'report') {
    try {
      const result = report.buildClosureReport(repoRoot);
      if (isJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatTable(result));
      }
      return 0;
    } catch (err) {
      console.error('error:', err.message);
      return 0; // Even errors return 0 per PRD decision 4
    }
  } else {
    console.error('unknown subcommand: ' + subcommand);
    return 2;
  }
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { main, formatTable };
