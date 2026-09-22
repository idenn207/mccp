'use strict';

// `container-check.js`의 3축 판정 (M3 Task 9).
//
// 이 milestone이 만드는 다른 스크립트는 전부 짝 test를 갖는데 이것만 없었다 —
// 그리고 원소를 하나도 검사하지 않는 구현(빈 루프 · 키 오타)도 exit 0을 내므로
// "전 원소가 3축 만족"이라는 판정이 **반증 불가**였다(L2 R4). Acceptance 산출물
// 1번의 충족/미충족 전환이 그 출력에 걸린다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const CLI = path.join(REPO, 'scripts', 'test-suite', 'container-check.js');

const { checkContainer } = require('../test-suite/container-check.js');

function okElement(over) {
  return Object.assign({ label: 'ci-m3-node20', ok: true, attribution: 'complete', redaction_ok: true }, over || {});
}

function runCli(container) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m3-container-'));
  const p = path.join(dir, 'container.json');
  fs.writeFileSync(p, JSON.stringify(container, null, 2) + '\n');
  return spawnSync(process.execPath, [CLI, p, '--json'], { cwd: REPO, encoding: 'utf8' });
}

test('(a) one element with ok:false is non-zero', () => {
  const r = runCli({ runs: [okElement(), okElement({ label: 'bad', ok: false })] });
  assert.notStrictEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.ok(parsed.failures.some(function (f) { return f.axis === 'ok' && f.label === 'bad'; }));
});

test('(b) attribution other than "complete" is non-zero', () => {
  const r = runCli({ runs: [okElement({ attribution: 'unavailable' })] });
  assert.notStrictEqual(r.status, 0);
  assert.ok(JSON.parse(r.stdout).failures.some(function (f) { return f.axis === 'attribution'; }));
});

test('(c) redaction_ok other than true is non-zero', () => {
  // `--merge-into`가 `redaction_ok !== true`인 원소를 거부하므로(`run.js:321-326`)
  // 컨테이너에 그런 원소가 있다는 것은 병합 경로 밖에서 들어왔다는 뜻이다.
  const r = runCli({ runs: [okElement({ redaction_ok: false })] });
  assert.notStrictEqual(r.status, 0);
  assert.ok(JSON.parse(r.stdout).failures.some(function (f) { return f.axis === 'redaction_ok'; }));
});

test('(d) an EMPTY container is non-zero — checking nothing is not passing', () => {
  const r = runCli({ runs: [] });
  assert.notStrictEqual(r.status, 0, 'a script that inspects zero elements must not report success');
  assert.deepStrictEqual(JSON.parse(r.stdout).reasons, ['container_empty']);
});

test('(d2) a container with no runs array at all is non-zero', () => {
  const r = runCli({});
  assert.notStrictEqual(r.status, 0);
  assert.deepStrictEqual(JSON.parse(r.stdout).reasons, ['runs_missing']);
});

test('(e) only elements satisfying all three axes yield exit 0', () => {
  const r = runCli({ runs: [okElement(), okElement({ label: 'ci-m3-node24' })] });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.checked, 2);
  assert.deepStrictEqual(parsed.labels, ['ci-m3-node20', 'ci-m3-node24']);
});

test('nested {label, element} shape is read too, and a missing axis there still fails', () => {
  // 컨테이너 원소는 평면일 수도 중첩일 수도 있다. 둘 다 받되 **추측하지 않는다** —
  // 두 자리 모두에 축이 없으면 부재로 판정한다.
  const good = checkContainer({ runs: [{ label: 'x', element: { ok: true, attribution: 'complete', redaction_ok: true } }] });
  assert.strictEqual(good.ok, true);
  const bad = checkContainer({ runs: [{ label: 'x', element: { ok: true, attribution: 'complete' } }] });
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.failures.some(function (f) { return f.axis === 'redaction_ok'; }));
});
