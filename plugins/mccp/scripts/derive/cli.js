#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { MODEL_VERSION } = require('./model');
const { derive } = require('./index');
const { renderStatus } = require('../lib/renderer');

function showHelp() {
  process.stdout.write([
    'mccp-derive ' + MODEL_VERSION,
    '',
    'Usage: node plugins/mccp/scripts/derive/cli.js <subcommand> [options]',
    '',
    'Subcommands:',
    '  run [--json] [--summary] [--raw] [--strict]',
    '       --json     Emit JSON to stdout (default if no other format flag).',
    '       --summary  Emit a one-line-per-source text summary (debug only).',
    '       --raw      Emit unmasked model (absolute paths preserved). Stderr WARNING.',
    '       --strict   Exit 1 if M0 capability check reports contract_present=false.',
    '  render [--md] [--html] [--out <dir>] [--raw] [--strict]',
    '       --md       Emit STATUS.md only (default emits both).',
    '       --html     Emit status.html only.',
    '       --out <dir>  Output directory (default .claude/cache/).',
    '       --raw      Pass through to derive() — model.masked=false. HTML output gets a red ribbon. Stderr WARNING.',
    '       --strict   Exit 1 if M0 capability check reports contract_present=false.',
    '  version          Print derive model version and exit 0.',
    '  --help, -h       Show this help.',
    '',
    'Notes:',
    '  - Default emits masked, share-safe JSON. --raw is opt-in for internal tools.',
    '  - Does not write to disk. Does not call any LLM. Reads `.claude/` only.',
    '',
  ].join('\n'));
}

function parseFlags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        out[a.slice(2)] = args[i + 1];
        i += 1;
      } else {
        out[a.slice(2)] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function emitSummary(model) {
  const s = model.sources;
  const degraded = [];
  for (const [k, v] of Object.entries(s)) {
    if (v && v.degraded) degraded.push(k);
  }
  const lines = [
    'mccp-derive ' + MODEL_VERSION,
    'derived_at: ' + model.derived_at,
    'masked: ' + model.masked,
    'm0_capability.contract_present: ' + model.m0_capability.contract_present,
    'plans: ' + (s.plans.count || 0),
    'receipts: ' + (s.receipts.count || 0),
    'state: ' + (s.state.item ? 'present (' + s.state.item.resume_state + ')' : 'absent'),
    'backlog: ' + (s.backlog.count || 0),
    'fix_task: ' + (s.fix_task.item ? 'present' : 'absent'),
    'pr: ' + (s.pr.item ? 'present' : 'absent'),
    'envelopes: ' + (s.envelopes.count || 0),
    'correlations: ' + (model.correlations || []).length,
    'warnings: ' + (model.warnings || []).length,
    'degraded sources: ' + (degraded.length === 0 ? '(none)' : degraded.join(', ')),
  ];
  return lines.join('\n') + '\n';
}

function cmdRun(rest) {
  const cwd = process.cwd();
  const wantRaw = !!rest.raw;
  if (wantRaw) {
    process.stderr.write('[mccp:derive] --raw emits absolute paths; do NOT pipe to LLM/log/share\n');
  }
  let model;
  try {
    model = derive(cwd, { raw: wantRaw, strict: !!rest.strict });
  } catch (err) {
    process.stderr.write('[mccp:derive] ERROR: ' + err.message + '\n');
    return 1;
  }
  if (rest.summary && !rest.json) {
    process.stdout.write(emitSummary(model));
  } else {
    process.stdout.write(JSON.stringify(model, null, 2) + '\n');
  }
  if (rest.strict && model.m0_capability && model.m0_capability.contract_present === false) {
    return 1;
  }
  return 0;
}

function writeAtomic(target, content) {
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, target);
}

function cmdRender(rest) {
  const cwd = process.cwd();
  const wantRaw = !!rest.raw;
  if (wantRaw) {
    process.stderr.write('[mccp:derive:render] --raw emits unmasked HTML; do NOT share\n');
  }
  let model;
  try {
    model = derive(cwd, { raw: wantRaw, strict: !!rest.strict });
  } catch (err) {
    process.stderr.write('[mccp:derive:render] ERROR derive failed: ' + err.message + '\n');
    return 1;
  }
  let rendered;
  try {
    // v1.3.0-m5 — pass the resolved snapshotsDir explicitly. derive() masked
    // model.repo_root to '<repo>', so the renderer's auto-resolution would
    // fall back to null; the CLI knows the real cwd and can supply the path.
    rendered = renderStatus(model, {
      snapshotsDir: path.join(cwd, '.claude', 'cache', 'snapshots'),
    });
  } catch (err) {
    process.stderr.write('[mccp:derive:render] ERROR render failed: ' + err.message + '\n');
    return 1;
  }
  const outDir = path.resolve(cwd, rest.out || path.join('.claude', 'cache'));
  try { fs.mkdirSync(outDir, { recursive: true }); }
  catch (err) {
    process.stderr.write('[mccp:derive:render] ERROR mkdir ' + outDir + ': ' + err.message + '\n');
    return 1;
  }
  const wantMd = !!rest.md;
  const wantHtml = !!rest.html;
  const emitMd = wantMd || (!wantMd && !wantHtml);
  const emitHtml = wantHtml || (!wantMd && !wantHtml);
  if (emitMd) writeAtomic(path.join(outDir, 'STATUS.md'), rendered.md);
  if (emitHtml) writeAtomic(path.join(outDir, 'status.html'), rendered.html);
  // v1.3.0-m5 — piggyback the daily snapshot writer on the CLI render path.
  // Lazy require + try/catch so a missing snapshot module never breaks render.
  try {
    require('../lib/snapshot').writeSnapshotIfNeeded(model, {
      trigger: 'cli-render',
      repoRoot: cwd,
    });
  } catch (err) {
    process.stderr.write('[mccp:derive:render] snapshot failed (allow): '
      + (err && err.message) + '\n');
  }
  if (rest.strict && model.m0_capability && model.m0_capability.contract_present === false) {
    return 1;
  }
  return 0;
}

function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    return 0;
  }
  const sub = args[0];
  const rest = parseFlags(args.slice(1));
  switch (sub) {
    case 'version':
      process.stdout.write(MODEL_VERSION + '\n');
      return 0;
    case 'run':
      return cmdRun(rest);
    case 'render':
      return cmdRender(rest);
    default:
      process.stderr.write('mccp-derive: unknown subcommand "' + sub + '"\n');
      showHelp();
      return 1;
  }
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { main };
