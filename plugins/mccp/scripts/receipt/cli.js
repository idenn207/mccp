#!/usr/bin/env node
'use strict';

const VERSION = '1.0.0';

function showHelp() {
  process.stdout.write([
    'mccp-receipt v' + VERSION,
    '',
    'Usage: mccp-receipt <subcommand> [options]',
    '',
    'Foundation subcommands:',
    '  version                       Print version and exit',
    '  schema-version                Print receipt schema version',
    '  hash-markdown <file>          Print SHA-256 of canonicalized markdown',
    '  canonicalize-markdown <file>  Print canonical form (debug)',
    '  canonicalize-json [<file>]    Print RFC 8785 JCS canonical form (stdin if no file)',
    '  git-refs [<base-ref>]         Print {baseSha, headSha, baseRef} as JSON',
    '',
    'Receipt core subcommands:',
    '  write            --gate <id> --decision <slug> --plan <path> [--design-doc <p>] [--findings-file <p>] [--resolution-file <p>] [--auto-round] [--codex-skipped] [--advisory] [--security-skipped] [--security-skip-reason <text>] [--security-force-override] [--security-force-override-reason <text>] [--impeccable-skipped] [--impeccable-skip-reason <text>] [--impeccable-force-override] [--impeccable-force-override-reason <text>] [--quiet]',
    '  validate         --command <slug> [--decision <slug>] [--plan <path>]',
    '  preflight        --command <slug> [--decision <slug>] [--plan <path>]',
    '  status           [--gate <id>] [--json]',
    '  derive-decision  --command <name> [--args "<raw args>"] [--cwd <path>]',
    '  dedupe           --plan <path> --base <ref> --decision <slug> [--cwd <path>]',
    '  pr-body          --decision <slug> --head <sha> --action write|path|delete|sweep [--content <text>] [--content-file <path>] [--cwd <path>]',
    '',
    'Subcommands not yet implemented (Phase 5 — fallback):',
    '  diff        --plan <path> --against <receipt.json>',
    '  backfill    --from-pr <num>',
    '',
    'Environment:',
    '  MCCP_SKIP_RECEIPT=1            User-explicit bypass (logged into receipt meta)',
    '  MCCP_RECEIPT_DEBUG=1           Verbose debug output to stderr',
    '',
  ].join('\n'));
}

function parseFlags(args) {
  const out = { _: [] };
  function setOrPush(key, val) {
    if (out[key] === undefined) {
      out[key] = val;
    } else if (Array.isArray(out[key])) {
      out[key].push(val);
    } else {
      out[key] = [out[key], val];
    }
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        setOrPush(a.slice(2, eq), a.slice(eq + 1));
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        setOrPush(a.slice(2), args[i + 1]);
        i += 1;
      } else {
        setOrPush(a.slice(2), true);
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function cmdVersion() {
  process.stdout.write(VERSION + '\n');
  return 0;
}

function cmdSchemaVersion() {
  const { SCHEMA_VERSION } = require('./schema');
  process.stdout.write(SCHEMA_VERSION + '\n');
  return 0;
}

function cmdHashMarkdown(rest) {
  const { markdownHash } = require('./hash');
  const file = rest._[0];
  if (!file) {
    process.stderr.write('mccp-receipt hash-markdown: <file> argument required\n');
    return 1;
  }
  try {
    process.stdout.write(markdownHash(file) + '\n');
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt hash-markdown: ' + err.message + '\n');
    return 1;
  }
}

function cmdCanonicalizeMarkdown(rest) {
  const fs = require('fs');
  const { canonicalizeMarkdown } = require('./hash');
  const file = rest._[0];
  if (!file) {
    process.stderr.write('mccp-receipt canonicalize-markdown: <file> argument required\n');
    return 1;
  }
  try {
    const raw = fs.readFileSync(file, 'utf8');
    process.stdout.write(canonicalizeMarkdown(raw));
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt canonicalize-markdown: ' + err.message + '\n');
    return 1;
  }
}

function readStdin() {
  return new Promise(function (resolve, reject) {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (chunk) { buf += chunk; });
    process.stdin.on('end', function () { resolve(buf); });
    process.stdin.on('error', reject);
  });
}

async function cmdCanonicalizeJson(rest) {
  const fs = require('fs');
  const { canonicalize } = require('./jcs');
  const file = rest._[0];
  let raw;
  if (file) {
    raw = fs.readFileSync(file, 'utf8');
  } else {
    raw = await readStdin();
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    process.stderr.write('mccp-receipt canonicalize-json: invalid JSON: ' + err.message + '\n');
    return 1;
  }
  try {
    process.stdout.write(canonicalize(parsed));
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt canonicalize-json: ' + err.message + '\n');
    return 1;
  }
}

function cmdGitRefs(rest) {
  const { gitRefs } = require('./hash');
  try {
    const refs = gitRefs({ base: rest._[0] });
    process.stdout.write(JSON.stringify(refs, null, 2) + '\n');
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt git-refs: ' + err.message + '\n');
    return 2;
  }
}

function cmdWrite(args) {
  const { write } = require('./write');
  try {
    const result = write(args);
    if (args.quiet) {
      process.stdout.write(result.path + '\n');
    } else {
      process.stdout.write(JSON.stringify({
        path: result.path,
        gate_id: result.receipt.gate_id,
        decision_id: result.receipt.decision_id,
        round: result.receipt.round,
        subject_hash: result.receipt.subject_hash,
        receipt_hash: result.receipt.receipt_hash,
      }, null, 2) + '\n');
    }
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt write: ' + err.message + '\n');
    return err.code === 'SCHEMA_INVALID' ? 2 : 1;
  }
}

function cmdValidate(args) {
  const { validateCommand } = require('./validate-cmd');
  try {
    const result = validateCommand(args.command || (args._ && args._[0]), {
      decisionId: args.decision || 'default',
      planPath: args.plan,
      cwd: args.cwd,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.ok ? 0 : 2;
  } catch (err) {
    process.stderr.write('mccp-receipt validate: ' + err.message + '\n');
    return 1;
  }
}

function cmdPreflight(args) {
  const { preflight } = require('./preflight');
  return preflight(args);
}

function cmdStatus(args) {
  const { status } = require('./status');
  return status(args);
}

function cmdPrBody(args) {
  const prBody = require('./pr-body');
  const action = args.action;
  if (!action) {
    process.stderr.write('mccp-receipt pr-body: --action <write|path|delete|sweep> required\n');
    return 1;
  }
  let repoRoot;
  try {
    repoRoot = prBody.resolveRepoRoot(args.cwd);
  } catch (err) {
    process.stderr.write('mccp-receipt pr-body: ' + err.message + '\n');
    return 1;
  }
  if (action === 'sweep') {
    const maxAgeMs = args['max-age-ms'] !== undefined ? parseInt(args['max-age-ms'], 10) : undefined;
    const removed = prBody.sweepStale(repoRoot, maxAgeMs);
    process.stdout.write(JSON.stringify({ removed: removed }, null, 2) + '\n');
    return 0;
  }
  const decision = args.decision;
  const head = args.head;
  if (!decision) {
    process.stderr.write('mccp-receipt pr-body: --decision <slug> required\n');
    return 1;
  }
  if (!head) {
    process.stderr.write('mccp-receipt pr-body: --head <sha> required\n');
    return 1;
  }
  if (action === 'path') {
    process.stdout.write(prBody.bodyPath(repoRoot, decision, head) + '\n');
    return 0;
  }
  if (action === 'write') {
    let content;
    if (args['content-file']) {
      const fs = require('fs');
      try {
        content = fs.readFileSync(args['content-file'], 'utf8');
      } catch (err) {
        process.stderr.write('mccp-receipt pr-body: cannot read --content-file: ' + err.message + '\n');
        return 1;
      }
    } else if (args.content !== undefined && args.content !== true) {
      content = String(args.content);
    } else {
      process.stderr.write('mccp-receipt pr-body: --content <text> or --content-file <path> required for write\n');
      return 1;
    }
    const written = prBody.writeBody(repoRoot, decision, head, content);
    process.stdout.write(written + '\n');
    return 0;
  }
  if (action === 'delete') {
    const removed = prBody.deleteBody(repoRoot, decision, head);
    process.stdout.write(JSON.stringify({ removed: removed, path: prBody.bodyPath(repoRoot, decision, head) }, null, 2) + '\n');
    return 0;
  }
  process.stderr.write('mccp-receipt pr-body: unknown --action "' + action + '"\n');
  return 1;
}

function cmdDedupe(args) {
  const { evaluateForDedupe } = require('./dedupe');
  const planPath = args.plan;
  const baseRef = args.base;
  const decisionId = args.decision;
  if (!planPath) {
    process.stderr.write('mccp-receipt dedupe: --plan <path> required\n');
    return 1;
  }
  if (!baseRef) {
    process.stderr.write('mccp-receipt dedupe: --base <ref> required\n');
    return 1;
  }
  if (!decisionId) {
    process.stderr.write('mccp-receipt dedupe: --decision <slug> required\n');
    return 1;
  }
  try {
    const result = evaluateForDedupe({
      cwd: args.cwd,
      planPath: planPath,
      baseRef: baseRef,
      decisionId: decisionId,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!result.ok) return 2;
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt dedupe: ' + err.message + '\n');
    return 1;
  }
}

function cmdDeriveDecision(args) {
  const { deriveDecisionId } = require('./decision');
  const commandName = args.command || (args._ && args._[0]);
  if (!commandName) {
    process.stderr.write('mccp-receipt derive-decision: --command <name> required\n');
    return 1;
  }
  const commandArgs = (args.args === true || args.args === undefined) ? '' : String(args.args);
  try {
    const slug = deriveDecisionId(commandName, commandArgs, { cwd: args.cwd });
    process.stdout.write(slug + '\n');
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt derive-decision: ' + err.message + '\n');
    return 1;
  }
}

async function main(argv) {
  const subcommand = argv[2];
  const rest = parseFlags(argv.slice(3));

  switch (subcommand) {
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      showHelp();
      return 0;
    case '-v':
    case '--version':
    case 'version':
      return cmdVersion();
    case 'schema-version':
      return cmdSchemaVersion();
    case 'hash-markdown':
      return cmdHashMarkdown(rest);
    case 'canonicalize-markdown':
      return cmdCanonicalizeMarkdown(rest);
    case 'canonicalize-json':
      return await cmdCanonicalizeJson(rest);
    case 'git-refs':
      return cmdGitRefs(rest);
    case 'write':
      return cmdWrite(rest);
    case 'validate':
      return cmdValidate(rest);
    case 'preflight':
      return cmdPreflight(rest);
    case 'status':
      return cmdStatus(rest);
    case 'derive-decision':
      return cmdDeriveDecision(rest);
    case 'dedupe':
      return cmdDedupe(rest);
    case 'pr-body':
      return cmdPrBody(rest);
    case 'diff':
    case 'backfill':
      process.stderr.write('mccp-receipt ' + subcommand + ': not implemented yet (Phase 5)\n');
      return 99;
    default:
      process.stderr.write('mccp-receipt: unknown subcommand "' + subcommand + '"\n');
      showHelp();
      return 1;
  }
}

if (require.main === module) {
  main(process.argv).then(function (code) {
    process.exit(code);
  }).catch(function (err) {
    process.stderr.write('mccp-receipt: fatal: ' + (err && err.stack || err) + '\n');
    process.exit(1);
  });
}

module.exports = { main: main, VERSION: VERSION };
