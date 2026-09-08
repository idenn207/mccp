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
    lines.push('DENOMINATOR GAP');
    lines.push('  Count:           ' + obj.denominator_gap.count);
    lines.push('  Percentage:      ' + obj.denominator_gap.pct + '%');
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
      lines.push('    Closed:        ' + ledger.closed + ' / ' + ledger.total);
      lines.push('    Pct:           ' + ledger.pct + '%');
      lines.push('    Denominator:   ' + ledger.denominator_note);
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

module.exports = { main };
