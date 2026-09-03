'use strict';

// Task 9 — wrapper --json forward contract test.
//
// v0.2.4 absorbs R2 finding #4. The wrapper previously discarded `--json`
// without forwarding it to the codex-companion subprocess, leaving callers
// (plan.md, pr.md, prp-implement.md) unable to receive structured verdict
// payload. This test asserts the forward:
//
//   1. wrapper invoked with --json → companion receives --json in argv
//   2. wrapper invoked without --json → companion argv does NOT contain --json
//   3. fake companion returns structured JSON verdict — wrapper stdout is JSON
//      parsable end-to-end
//   4. argument ordering: --json sits before the focus positional, mirroring
//      how the companion's flag parser distinguishes flags from positionals
//
// Strategy mirrors codex-invoke.test.js — per-test temporary plugin tree, a
// JS fake companion that captures argv to stdout.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const codexInvoke = require('../codex-invoke');
const { invokeAdversarialReview } = codexInvoke;

function makeTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-codex-json-' + prefix + '-'));
}

function writeRegistry(tmpDir, plugins) {
  const reg = { version: 2, plugins: plugins };
  const file = path.join(tmpDir, 'installed_plugins.json');
  fs.writeFileSync(file, JSON.stringify(reg, null, 2), 'utf8');
  return file;
}

// Fake companion that captures its argv to stdout as JSON. The wrapper's
// `result.stdout` then contains a JSON payload we can parse and inspect.
function buildArgvCapturePlugin(tmpDir) {
  const installPath = path.join(tmpDir, 'plugin-install');
  fs.mkdirSync(path.join(installPath, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(installPath, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(installPath, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'codex', version: '1.0.4' }),
    'utf8',
  );
  const script = [
    "const argv = process.argv.slice(2);",
    "const payload = { verdict: 'fake', argv };",
    "process.stdout.write(JSON.stringify(payload) + '\\n');",
    "process.exit(0);",
  ].join('\n');
  fs.writeFileSync(path.join(installPath, 'scripts', 'codex-companion.mjs'), script, 'utf8');
  return installPath;
}

function setupRegistry(prefix) {
  const tmp = makeTmpDir(prefix);
  const installPath = buildArgvCapturePlugin(tmp);
  const file = writeRegistry(tmp, {
    'codex@openai-codex': [{ installPath: installPath, version: '1.0.4' }],
  });
  return { tmp, installPath, registryPath: file };
}

test('wrapper with json:true forwards --json to companion argv', () => {
  const { registryPath } = setupRegistry('with-json');
  const r = invokeAdversarialReview('focus text', {
    gitDir: null,   // ci-full-suite M2 갈래 H — ambient 봉인을 읽지 않는다
    registryPath,
    timeoutMs: 10_000,
    env: {},
    json: true,
  });
  assert.strictEqual(r.ok, true, `expected ok=true, got ${r.classification}: ${r.stderr}`);
  const payload = JSON.parse(r.stdout);
  assert.ok(
    payload.argv.includes('--json'),
    `expected --json in companion argv; got: ${JSON.stringify(payload.argv)}`,
  );
});

test('wrapper without json forwards no --json to companion argv (regression guard)', () => {
  const { registryPath } = setupRegistry('no-json');
  const r = invokeAdversarialReview('focus text', {
    gitDir: null,   // ci-full-suite M2 갈래 H — ambient 봉인을 읽지 않는다
    registryPath,
    timeoutMs: 10_000,
    env: {},
  });
  assert.strictEqual(r.ok, true);
  const payload = JSON.parse(r.stdout);
  assert.ok(
    !payload.argv.includes('--json'),
    `expected --json absent when wrapper not given json; got: ${JSON.stringify(payload.argv)}`,
  );
});

test('--json appears before the focus positional in argv', () => {
  const { registryPath } = setupRegistry('order');
  const r = invokeAdversarialReview('focus-marker-XYZ', {
    gitDir: null,   // ci-full-suite M2 갈래 H — ambient 봉인을 읽지 않는다
    registryPath,
    timeoutMs: 10_000,
    env: {},
    json: true,
  });
  assert.strictEqual(r.ok, true);
  const payload = JSON.parse(r.stdout);
  const jsonIdx = payload.argv.indexOf('--json');
  const focusIdx = payload.argv.indexOf('focus-marker-XYZ');
  assert.ok(jsonIdx >= 0 && focusIdx >= 0, 'both --json and focus must be present');
  assert.ok(
    jsonIdx < focusIdx,
    `--json (idx=${jsonIdx}) must precede focus positional (idx=${focusIdx})`,
  );
});

test('runCli accepts --json without parser crash (line 223 contract)', () => {
  // Smoke: the args parser at line 223 used to do `if (a === '--json') continue;`
  // which silently dropped the flag. The v0.2.4 fix flips it to set opts.json.
  // We don't control the real registry here, so all we assert is:
  //   - runCli does NOT throw
  //   - stdout is valid JSON
  //   - classification is a non-empty string from the documented enum
  const { runCli } = codexInvoke;
  // ci-full-suite M2 갈래 D — 이 목록은 손으로 쓰지 않는다. 손으로 쓰인 동안 그것은
  // 14종에 멈춰 있었고, v1.33.5가 15번째(`round-cap-reached`)를 넣자 이 test는 그
  // 정상 분류를 "unexpected classification"으로 보고했다. 여기서 검증하려는 것은
  // "enum 안의 값인가"이지 "내가 아는 14개 중 하나인가"가 아니므로, enum을 소유한
  // 오라클에서 파생한다. 그 오라클과 codex-invoke 주석 헤더의 1:1은
  // codex-reachability.test.js (d)/(d2)가 별도로 고정한다.
  const validClassifications = new Set(
    require('../codex-reachability').KNOWN_CLASSIFICATIONS);
  const captured = { out: '' };
  const origOut = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { captured.out += String(s); return true; };
  try {
    runCli(['adversarial-review', '--json', '--timeout-ms', '500', '--focus', 'x']);
  } finally {
    process.stdout.write = origOut;
  }
  const obj = JSON.parse(captured.out);
  assert.strictEqual(typeof obj.classification, 'string');
  assert.ok(
    validClassifications.has(obj.classification),
    `unexpected classification: ${obj.classification}`,
  );
});

test('fake companion structured JSON verdict round-trips through wrapper unchanged', () => {
  const { registryPath } = setupRegistry('roundtrip');
  const r = invokeAdversarialReview('challenge X', {
    gitDir: null,   // ci-full-suite M2 갈래 H — ambient 봉인을 읽지 않는다
    registryPath,
    timeoutMs: 10_000,
    env: {},
    json: true,
  });
  assert.strictEqual(r.ok, true);
  const payload = JSON.parse(r.stdout);
  assert.strictEqual(payload.verdict, 'fake');
  assert.deepStrictEqual(
    payload.argv.slice(0, 3),
    ['adversarial-review', '--wait', '--json'],
    'wrapper should pass the canonical argument prefix',
  );
});
