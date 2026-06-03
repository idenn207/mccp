#!/usr/bin/env node
'use strict';

// mccp-quality CLI — subcommand dispatcher mirroring receipt/cli.js.
//
// Usage:
//   node cli.js detect [--cwd <path>]
//   node cli.js run <stage>  (stage = lint | typecheck | test | e2e | all)
//                            [--cwd <path>] [--timeout-ms <int>]

const path = require('path');

const VERSION = '1.0.0';

function showHelp() {
  process.stdout.write([
    'mccp-quality v' + VERSION,
    '',
    'Usage:',
    '  mccp-quality detect [--cwd <path>]',
    '  mccp-quality run    <stage> [--cwd <path>] [--timeout-ms <int>]',
    '',
    'Stages: lint | typecheck | test | e2e | all',
    '',
    'Environment:',
    '  MCCP_STOP_LOOP_E2E=1   Enable e2e stage (default skipped)',
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

function cmdDetect(flags) {
  const { detect } = require('./detect');
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  process.stdout.write(JSON.stringify(detect(cwd), null, 2) + '\n');
  return 0;
}

function cmdRun(flags) {
  const stage = flags._[0] || 'all';
  if (!['all', 'lint', 'typecheck', 'test', 'e2e'].includes(stage)) {
    process.stderr.write('mccp-quality run: unknown stage "' + stage + '"\n');
    return 1;
  }
  const { run } = require('./runner');
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  const opts = {
    cwd: cwd,
    stage: stage,
  };
  if (flags['timeout-ms'] !== undefined) {
    const n = parseInt(flags['timeout-ms'], 10);
    if (Number.isFinite(n) && n > 0) opts.timeoutMs = n;
  }
  const result = run(opts);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result.passed ? 0 : 2;
}

function main(argv) {
  const sub = argv[2];
  const flags = parseFlags(argv.slice(3));
  switch (sub) {
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      showHelp();
      return 0;
    case '-v':
    case '--version':
    case 'version':
      process.stdout.write(VERSION + '\n');
      return 0;
    case 'detect':
      return cmdDetect(flags);
    case 'run':
      return cmdRun(flags);
    default:
      process.stderr.write('mccp-quality: unknown subcommand "' + sub + '"\n');
      showHelp();
      return 1;
  }
}

if (require.main === module) {
  try {
    process.exit(main(process.argv));
  } catch (err) {
    process.stderr.write('mccp-quality: fatal: ' + (err && err.stack || err) + '\n');
    process.exit(1);
  }
}

module.exports = { main: main, VERSION: VERSION };
