'use strict';

// DEP0190 regression guard.
//
// Node 22+ emits a DeprecationWarning (DEP0190) when spawn / spawnSync is
// called with a NON-EMPTY args array AND { shell: true }. The fix in
// fix/stop-hook-dep0190 converts the affected Windows .cmd launches to
// execFileSync (shell:false), which Node 16+ handles for .cmd / .bat
// transparently. This test prevents the pattern from coming back.
//
// Allowed forms:
//   - spawnSync(cmdString, { shell: true })            // no args array
//   - spawnSync(cmdString, [], { shell: true })        // empty array, no concat risk
//   - spawnSync(bin, args, { shell: false })           // explicit, safe
//   - execFileSync(bin, args, { ... })                 // shell defaults to false
//
// Forbidden:
//   - spawnSync(bin, [arg1, arg2], { shell: true })    // DEP0190 trigger
//   - spawn(bin, ['x'], { ... shell: true ... })       // same family

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCAN_DIRS = [
  path.join(PLUGIN_ROOT, 'scripts', 'hooks'),
  path.join(PLUGIN_ROOT, 'scripts', 'quality'),
  path.join(PLUGIN_ROOT, 'scripts', 'lib'),
  path.join(PLUGIN_ROOT, 'scripts', 'state'),
  path.join(PLUGIN_ROOT, 'scripts', 'receipt'),
];

function listJsFiles(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'tests' || entry.name === 'node_modules') continue;
      listJsFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
}

// Match a spawn / spawnSync / spawn call with an args list literal as the
// second argument (`spawnSync(cmd, [ ... ], options)`). Captures the array
// body so the test can check non-emptiness.
const SPAWN_ARRAY_RE = /\bspawn(?:Sync)?\s*\(\s*[^,\n)]+,\s*(\[[^\]]*\])\s*,\s*(\{[\s\S]*?\})\s*\)/g;

function findOffenders(source) {
  const offenders = [];
  let m;
  while ((m = SPAWN_ARRAY_RE.exec(source)) !== null) {
    const argsLiteral = m[1].trim();
    const optionsLiteral = m[2];
    if (argsLiteral === '[]') continue; // empty array, safe
    if (!/shell\s*:\s*true/.test(optionsLiteral)) continue; // shell defaults to false
    offenders.push({
      snippet: m[0].split('\n').slice(0, 2).join(' \\ '),
      argsLiteral,
    });
  }
  return offenders;
}

test('no spawn(*, [non-empty], { shell: true }) anywhere in scripts (DEP0190 guard)', () => {
  const files = [];
  for (const dir of SCAN_DIRS) listJsFiles(dir, files);
  assert.ok(files.length > 10, 'expected to scan more than 10 files; listing logic broken?');

  const report = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const offenders = findOffenders(source);
    if (offenders.length > 0) {
      report.push({ file: path.relative(PLUGIN_ROOT, file), offenders });
    }
  }

  if (report.length > 0) {
    const lines = report.flatMap(r => [
      'FILE: ' + r.file,
      ...r.offenders.map(o => '  args=' + o.argsLiteral + ' :: ' + o.snippet),
    ]);
    assert.fail('DEP0190-triggering spawn calls found:\n' + lines.join('\n'));
  }
});

test('guard regex itself catches a synthetic offender (test of the test)', () => {
  const synthetic = `
    const r = spawnSync(bin, [arg1, arg2], { cwd: x, shell: true });
  `;
  const offenders = findOffenders(synthetic);
  assert.strictEqual(offenders.length, 1, 'guard regex must detect non-empty args + shell:true');
});

test('guard regex ignores safe forms', () => {
  const safe = [
    "spawnSync('cmd', [], { shell: true })",          // empty args
    "spawnSync(bin, args, { shell: false })",         // explicit safe
    "execFileSync(bin, args, { stdio: 'pipe' })",     // execFile family
    "spawnSync(cmdString, { shell: true })",          // no args literal
  ].join('\n');
  const offenders = findOffenders(safe);
  assert.strictEqual(offenders.length, 0, 'guard must not false-positive on safe forms');
});
