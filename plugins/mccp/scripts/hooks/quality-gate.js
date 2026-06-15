#!/usr/bin/env node
/**
 * Quality Gate Hook — axis-P (v1.0.1) lightweight rewrite
 *
 * Runs syntax-only fast-fail checks after a single file edit. Heavy work
 * (typecheck, lint, formatter rewrite) is owned by Stop hooks
 * (stop-format-typecheck.js, check-console-log.js, etc.) where it can be
 * batched per session. PostEdit must stay sub-500ms.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MAX_STDIN = 1024 * 1024;
const SYNTAX_TIMEOUT_MS = 5000;

function exec(command, args, cwd = process.cwd()) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    timeout: SYNTAX_TIMEOUT_MS,
    windowsHide: true,
  });
}

function log(msg) {
  process.stderr.write(`${msg}\n`);
}

function syntaxCheckJs(filePath) {
  const r = exec(process.execPath, ['--check', filePath]);
  if (r.status !== 0 && (r.stderr || '').trim()) {
    log(`[QualityGate] node --check failed for ${filePath}`);
    log(r.stderr.trim());
  }
}

function syntaxCheckGo(filePath) {
  const r = exec('gofmt', ['-l', filePath]);
  if (r.stderr && r.stderr.trim()) {
    log(`[QualityGate] gofmt parse failed for ${filePath}`);
  }
}

function syntaxCheckPython(filePath) {
  const code = `import ast,sys\nast.parse(open(sys.argv[1],'rb').read())`;
  const r = exec('python', ['-c', code, filePath]);
  if (r.status !== 0 && (r.stderr || '').trim()) {
    log(`[QualityGate] python ast.parse failed for ${filePath}`);
  }
}

function maybeRunQualityGate(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;

  const absolute = path.resolve(filePath);
  const ext = path.extname(absolute).toLowerCase();

  if (['.js', '.mjs', '.cjs'].includes(ext)) {
    syntaxCheckJs(absolute);
    return;
  }
  if (ext === '.go') {
    syntaxCheckGo(absolute);
    return;
  }
  if (ext === '.py') {
    syntaxCheckPython(absolute);
    return;
  }
  // .ts/.tsx/.jsx/.json/.md/etc — Stop hook owns these via batch checks.
}

function run(rawInput) {
  try {
    const input = JSON.parse(rawInput);
    const filePath = String(input.tool_input?.file_path || '');
    maybeRunQualityGate(filePath);
  } catch {
    // ignore parse errors
  }
  return rawInput;
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) {
      const remaining = MAX_STDIN - raw.length;
      raw += chunk.substring(0, remaining);
    }
  });

  process.stdin.on('end', () => {
    const result = run(raw);
    process.stdout.write(result);
  });
}

module.exports = { run };
