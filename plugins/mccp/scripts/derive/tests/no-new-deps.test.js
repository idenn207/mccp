'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function toPosix(p) {
  return String(p).split(path.sep).join('/');
}

test('no-new-deps: derive/index.js loads using only built-ins + plugins/mccp/scripts/**', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const allowedScriptsRoot = path.resolve(repoRoot, 'plugins', 'mccp', 'scripts');
  const allowedPosix = toPosix(allowedScriptsRoot);
  const deriveEntry = path.join(allowedScriptsRoot, 'derive', 'index.js');

  const shimPath = path.join(os.tmpdir(),
    'mccp-derive-deps-shim-' + process.pid + '-' + Date.now() + '.js');
  const shim = [
    "'use strict';",
    "const Module = require('module');",
    "const path = require('path');",
    "const orig = Module._resolveFilename;",
    "const BUILTINS = new Set([",
    "  'fs','path','crypto','os','url','child_process','module','util','events',",
    "  'stream','buffer','assert','string_decoder','timers','tty','process',",
    "  'node:test','node:assert','node:fs','node:path','node:crypto','node:os',",
    "]);",
    "const ALLOWED = " + JSON.stringify(allowedPosix) + ";",
    "function toPosix(p) { return String(p).split(path.sep).join('/'); }",
    "Module._resolveFilename = function (req, parent, isMain, opts) {",
    "  if (BUILTINS.has(req)) return orig.call(this, req, parent, isMain, opts);",
    "  if (req.startsWith && req.startsWith('node:')) return orig.call(this, req, parent, isMain, opts);",
    "  const resolved = orig.call(this, req, parent, isMain, opts);",
    "  const norm = toPosix(resolved);",
    "  if (norm.startsWith(ALLOWED)) return resolved;",
    "  if (BUILTINS.has(req)) return resolved;",
    "  throw new Error('[mccp:no-new-deps] forbidden require: ' + req + ' -> ' + resolved);",
    "};",
    "const derive = require(" + JSON.stringify(deriveEntry) + ");",
    "const fs = require('fs');",
    "const os = require('os');",
    "const tmp = fs.mkdtempSync(require('path').join(os.tmpdir(), 'no-deps-'));",
    "try { derive.derive(tmp, { raw: true }); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }",
    "console.log('no-new-deps: OK');",
    '',
  ].join('\n');
  fs.writeFileSync(shimPath, shim, 'utf8');
  try {
    const out = execFileSync(process.execPath, [shimPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.ok(out.toString().indexOf('no-new-deps: OK') !== -1,
      'shim output: ' + out.toString());
  } finally {
    try { fs.unlinkSync(shimPath); } catch (_e) { /* ignore */ }
  }
});
