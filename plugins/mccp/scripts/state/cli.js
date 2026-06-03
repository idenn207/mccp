#!/usr/bin/env node
'use strict';

// mccp-state CLI — manage v0.2 state files (loop-counter, fix-task, dedupe-key).
//
// S10a/S10b will extend this with `state write/read/clear` and breakpoint /
// spawn subcommands. S8 ships only the foundations.

const path = require('path');

const VERSION = '1.0.0';

function showHelp() {
  process.stdout.write([
    'mccp-state v' + VERSION,
    '',
    'Usage:',
    '  mccp-state counter --task <fingerprint> [--bump | --reset | --read] [--cwd <path>] [--fix-task-hash <hex>]',
    '  mccp-state fingerprint --prompt <first-200-chars>',
    '  mccp-state fix-task   --read | --clear | --mark-applied | --sweep-applied [--cwd <path>]',
    '  mccp-state dedupe-key --plan <path> --decision <slug> [--cwd <path>]',
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

function resolveCwd(flags) {
  return flags.cwd ? path.resolve(flags.cwd) : process.cwd();
}

function cmdCounter(flags) {
  const lc = require('./loop-counter');
  const cwd = resolveCwd(flags);
  const fp = flags.task;
  if (!fp) {
    process.stderr.write('mccp-state counter: --task <fingerprint> required\n');
    return 1;
  }
  if (flags.bump) {
    const next = lc.bump(cwd, fp, flags['fix-task-hash'] || null);
    process.stdout.write(JSON.stringify(next, null, 2) + '\n');
    return 0;
  }
  if (flags.reset) {
    lc.reset(cwd, fp);
    process.stdout.write(JSON.stringify({ ok: true, fingerprint: fp, reset: true }, null, 2) + '\n');
    return 0;
  }
  const got = lc.get(cwd, fp);
  process.stdout.write(JSON.stringify(got, null, 2) + '\n');
  return 0;
}

function cmdFingerprint(flags) {
  const lc = require('./loop-counter');
  const prompt = flags.prompt;
  if (prompt === undefined || prompt === true) {
    process.stderr.write('mccp-state fingerprint: --prompt <text> required\n');
    return 1;
  }
  process.stdout.write(lc.fingerprintFromPrompt(String(prompt)) + '\n');
  return 0;
}

function cmdFixTask(flags) {
  const ft = require('./fix-task');
  const cwd = resolveCwd(flags);
  if (flags.read) {
    const body = ft.read(cwd);
    if (body === null) {
      process.stderr.write('mccp-state fix-task: no fix-task.md present\n');
      return 2;
    }
    process.stdout.write(body);
    return 0;
  }
  if (flags.clear) {
    ft.clear(cwd);
    process.stdout.write(JSON.stringify({ ok: true, cleared: true }, null, 2) + '\n');
    return 0;
  }
  if (flags['mark-applied']) {
    const moved = ft.markApplied(cwd);
    process.stdout.write(JSON.stringify({ ok: moved, marked_applied: moved }, null, 2) + '\n');
    return 0;
  }
  if (flags['sweep-applied']) {
    const swept = ft.sweepStaleApplied(cwd);
    process.stdout.write(JSON.stringify({ ok: true, swept: swept }, null, 2) + '\n');
    return 0;
  }
  process.stderr.write('mccp-state fix-task: pick one of --read | --clear | --mark-applied | --sweep-applied\n');
  return 1;
}

function cmdDedupeKey(flags) {
  const dk = require('./dedupe-key');
  const planPath = flags.plan === undefined || flags.plan === true ? '' : String(flags.plan);
  const decision = flags.decision === undefined || flags.decision === true ? '' : String(flags.decision);
  if (!decision) {
    process.stderr.write('mccp-state dedupe-key: --decision <slug> required\n');
    return 1;
  }
  const key = dk.dedupeKey(planPath, decision, { cwd: resolveCwd(flags) });
  process.stdout.write(key + '\n');
  return 0;
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
    case 'counter':
      return cmdCounter(flags);
    case 'fingerprint':
      return cmdFingerprint(flags);
    case 'fix-task':
      return cmdFixTask(flags);
    case 'dedupe-key':
      return cmdDedupeKey(flags);
    default:
      process.stderr.write('mccp-state: unknown subcommand "' + sub + '"\n');
      showHelp();
      return 1;
  }
}

if (require.main === module) {
  try {
    process.exit(main(process.argv));
  } catch (err) {
    process.stderr.write('mccp-state: fatal: ' + (err && err.stack || err) + '\n');
    process.exit(1);
  }
}

module.exports = { main: main, VERSION: VERSION };
