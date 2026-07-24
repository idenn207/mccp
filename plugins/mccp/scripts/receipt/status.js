'use strict';

const { listReceipts, readReceipt } = require('./store');
const { gitRepoRoot } = require('./hash');
const { isConvergedVerdict } = require('../lib/receipt-convergence');

function status(args, io) {
  const stdout = (io && io.stdout) || process.stdout;
  const stderr = (io && io.stderr) || process.stderr;
  const cwd = args.cwd || process.cwd();

  let repoRoot;
  try {
    repoRoot = gitRepoRoot(cwd);
  } catch (err) {
    stderr.write('mccp-receipt status: ' + err.message + '\n');
    return 1;
  }

  const entries = listReceipts(repoRoot, args.gate || null);
  const summary = [];
  for (const e of entries) {
    try {
      const rec = readReceipt(repoRoot, e.gate_id, e.decision_id);
      summary.push({
        gate_id: e.gate_id,
        decision_id: e.decision_id,
        phase: rec.phase,
        round: rec.round,
        // M1 — codex_verdict-first: never label a divergent/critical ship "converged".
        converged: isConvergedVerdict(rec.resolution),
        open_questions: ((rec.resolution || {}).open_questions || []).length,
        base_sha: (rec.base_sha || '').slice(0, 8),
        head_sha: (rec.head_sha || '').slice(0, 8),
        created_at: rec.meta && rec.meta.created_at,
        skipped: !!(rec.meta && rec.meta.skipped),
        path: e.path,
      });
    } catch (err) {
      summary.push({
        gate_id: e.gate_id,
        decision_id: e.decision_id,
        path: e.path,
        error: err.message,
      });
    }
  }

  if (args.format === 'json' || args.json) {
    stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    if (summary.length === 0) {
      stdout.write('(no receipts found at ' + repoRoot + '/.claude/receipts/' + (args.gate ? args.gate + '/' : '') + ')\n');
    } else {
      for (const s of summary) {
        const conv = s.converged ? 'converged' : 'open';
        const oq = s.open_questions ? ' [' + s.open_questions + ' open]' : '';
        const skip = s.skipped ? ' SKIPPED' : '';
        stdout.write([
          s.gate_id, '/', s.decision_id,
          '  round=' + s.round,
          '  base=' + s.base_sha,
          '  ' + conv + oq + skip,
          '  at ' + s.created_at,
          '\n',
        ].join(''));
      }
    }
  }
  return 0;
}

module.exports = { status: status };
