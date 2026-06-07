'use strict';

// F11 R3-F2 — stdout-pipe-ipc unit tests. Verifies anonymous-pipe contract:
// no FS state, token never in argv/env, stdin pipe delivers token cleanly.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { spawnAndCaptureToken, spawnAndPipeToken } =
  require('../../pr-phase-helpers/stdout-pipe-ipc');

const NODE = process.execPath;

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-stdpipe-test-'));
}

function writeScript(dir, name, body) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, body, 'utf8');
  return p;
}

test('spawnAndCaptureToken: parses JSON + extracts ownership_token', () => {
  const tmp = mkTmpDir();
  const s = writeScript(tmp, 'emit.js',
    'const tok = "11111111-2222-3333-4444-555555555555";\n' +
    'process.stdout.write(JSON.stringify({ ok: true, ownership_token: tok, extra: 42 }));\n');
  const r = spawnAndCaptureToken([NODE, s]);
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.rawToken, '11111111-2222-3333-4444-555555555555');
  assert.strictEqual(r.stdoutJSON.extra, 42);
  assert.strictEqual(r.parseError, null);
});

test('spawnAndCaptureToken: malformed JSON sets parseError, rawToken null', () => {
  const tmp = mkTmpDir();
  const s = writeScript(tmp, 'bad.js', 'process.stdout.write("not-json{");\n');
  const r = spawnAndCaptureToken([NODE, s]);
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.rawToken, null);
  assert.ok(r.parseError, 'parseError set');
});

test('spawnAndCaptureToken: missing ownership_token field → rawToken null', () => {
  const tmp = mkTmpDir();
  const s = writeScript(tmp, 'no-tok.js',
    'process.stdout.write(JSON.stringify({ ok: true, other: 1 }));\n');
  const r = spawnAndCaptureToken([NODE, s]);
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.rawToken, null);
  assert.deepStrictEqual(r.stdoutJSON, { ok: true, other: 1 });
});

test('spawnAndCaptureToken: non-zero child exit propagates', () => {
  const tmp = mkTmpDir();
  const s = writeScript(tmp, 'fail.js',
    'process.stdout.write("{}"); process.exit(11);\n');
  const r = spawnAndCaptureToken([NODE, s]);
  assert.strictEqual(r.exitCode, 11);
});

test('spawnAndCaptureToken: no FS files written to cwd during capture (anonymous pipe)', () => {
  const tmp = mkTmpDir();
  const s = writeScript(tmp, 'emit2.js',
    'process.stdout.write(JSON.stringify({ ownership_token: "abc-123" }));\n');
  const before = fs.readdirSync(tmp).sort();
  spawnAndCaptureToken([NODE, s], { cwd: tmp });
  const after = fs.readdirSync(tmp).sort();
  assert.deepStrictEqual(after, before, 'IPC must not write to FS');
});

test('spawnAndPipeToken: token delivered via stdin, not argv or env', () => {
  const tmp = mkTmpDir();
  const s = writeScript(tmp, 'read-stdin.js',
    'const buf = require("fs").readFileSync(0);\n' +
    'process.stdout.write(JSON.stringify({\n' +
    '  stdin: buf.toString("utf8").trim(),\n' +
    '  argv_joined: process.argv.slice(2).join(" "),\n' +
    '  env_had_token: !!process.env.OWNERSHIP_TOKEN,\n' +
    '}));\n');
  const tok = 'deadbeef-cafe-babe-1234-feedface5678';
  const r = spawnAndPipeToken([NODE, s, '--flag', 'value'], tok);
  assert.strictEqual(r.exitCode, 0);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.stdin, tok, 'stdin delivers token verbatim');
  assert.strictEqual(parsed.argv_joined, '--flag value');
  assert.ok(!parsed.argv_joined.includes(tok), 'token NOT in argv');
  assert.strictEqual(parsed.env_had_token, false, 'token NOT in env');
});

test('spawnAndPipeToken: rejects empty rawToken', () => {
  assert.throws(() => spawnAndPipeToken([NODE, '-e', '1'], ''), /must be non-empty/);
});

test('spawnAndPipeToken: rejects empty cmdArgs', () => {
  assert.throws(() => spawnAndPipeToken([], 'tok'), /non-empty array/);
});

test('spawnAndPipeToken: trailing newline preserved (caller trims if needed)', () => {
  const tmp = mkTmpDir();
  const s = writeScript(tmp, 'raw-stdin.js',
    'const buf = require("fs").readFileSync(0);\n' +
    'process.stdout.write(JSON.stringify({ raw_len: buf.length, last_char: buf[buf.length - 1] }));\n');
  const tok = 'tok-abc';
  const r = spawnAndPipeToken([NODE, s], tok);
  assert.strictEqual(r.exitCode, 0);
  const parsed = JSON.parse(r.stdout);
  // Token (7 chars) + '\n' = 8 bytes; last char = 0x0A
  assert.strictEqual(parsed.raw_len, tok.length + 1);
  assert.strictEqual(parsed.last_char, 10);
});

test('spawnAndCaptureToken: token never appears in spawned cmdArgs', () => {
  // Smoke check that caller cannot pass token in argv via this helper
  // by accident — captureToken doesn't accept a token at all.
  const tmp = mkTmpDir();
  const s = writeScript(tmp, 'argv-leak.js',
    'process.stdout.write(JSON.stringify({ argv: process.argv.slice(2) }));\n');
  const r = spawnAndCaptureToken([NODE, s, '--harmless']);
  assert.strictEqual(r.exitCode, 0);
  const parsed = r.stdoutJSON;
  assert.deepStrictEqual(parsed.argv, ['--harmless']);
});
