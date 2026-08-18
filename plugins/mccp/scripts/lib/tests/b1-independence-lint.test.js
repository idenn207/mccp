'use strict';

// b1-independence-lint.js 의 **음성 대조** — 잡지 못하는 lint 는 통과 사실 자체가
// 무의미하다. 4축에 1:1 대응하는 위반 fixture 를 tmpdir 에 만들어 각각 비영점 exit
// 임을 단언하고, 원본에서는 exit 0 임을 단언한다.
//
// CLI 로도 한 번 돌린다 — Validation §2 가 test runner 가 아니라 **이 파일을 직접**
// 부르므로, API 만 test 하면 CLI 종료 코드 경로가 미검증으로 남는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const lintModule = require('../msw-metrics/b1-independence-lint');
const { lintIndependence, ORACLE, BUILDER, SOURCE, SCAN } = lintModule;

const LINT_CLI = path.resolve(__dirname, '..', 'msw-metrics', 'b1-independence-lint.js');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

const TARGETS = [ORACLE, BUILDER, SOURCE, SCAN];

// 4개 판정 경로 파일을 tmpdir 에 같은 상대 경로로 복제한다.
function mkFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-b1-lint-'));
  for (const rel of TARGETS) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, rel), dest);
  }
  return root;
}

function fixtureOpts(root) {
  return { repoRoot: root, scanRoots: [path.join(root, 'plugins', 'mccp', 'scripts')] };
}

// 파일 맨 아래에 위반 줄을 덧붙인다(주석이 아니라 **코드** 면에 심어야 한다 —
// lint 는 주석을 보지 않는다).
function inject(root, rel, line) {
  const p = path.join(root, rel);
  fs.appendFileSync(p, '\n' + line + '\n', 'utf8');
}

function runCli(root) {
  return spawnSync(process.execPath, [LINT_CLI, '--repo-root', root], { encoding: 'utf8' });
}

function axes(result) {
  return result.violations.map((v) => v.axis);
}

// --- 양성 대조 ---------------------------------------------------------------

test('lint — 원본 판정 경로는 4축 전부 clean (exit 0)', () => {
  const root = mkFixture();
  const r = lintIndependence(fixtureOpts(root));
  assert.equal(r.ok, true, 'pristine copies must pass; got ' + JSON.stringify(r.violations, null, 1));
  assert.equal(runCli(root).status, 0);
});

test('lint — 실제 repo 트리에서도 clean', () => {
  const r = lintIndependence({});
  assert.equal(r.ok, true, 'real tree must pass; got ' + JSON.stringify(r.violations, null, 1));
});

// --- 음성 대조 4축 -----------------------------------------------------------

test('B1-LINT-NEG-LEDGER: a completion-ledger require on the adjudication path fails the lint', () => {
  const root = mkFixture();
  inject(root, ORACLE, "const { readLedger } = require('../completion-ledger/store');");
  const r = lintIndependence(fixtureOpts(root));
  assert.equal(r.ok, false);
  assert.ok(axes(r).includes('i-ledger-require'), 'axes=' + axes(r).join(','));
  assert.equal(runCli(root).status, 1);
});

test('B1-LINT-NEG-FS: an fs require inside the oracle fails the lint', () => {
  const root = mkFixture();
  inject(root, ORACLE, "const fs = require('fs');");
  const r = lintIndependence(fixtureOpts(root));
  assert.equal(r.ok, false);
  assert.ok(axes(r).includes('ii-oracle-purity'), 'axes=' + axes(r).join(','));
  assert.equal(runCli(root).status, 1);

  // builder 는 이 축의 대상이 **아니다** — I/O 가 본업이라 묶으면 존재할 수 없다.
  const root2 = mkFixture();
  inject(root2, BUILDER, "const fs = require('fs');");
  const r2 = lintIndependence(fixtureOpts(root2));
  assert.ok(!axes(r2).includes('ii-oracle-purity'), 'builder must not be held to the purity axis');
});

test('B1-LINT-NEG-STATUS: a document status literal inside the oracle fails the lint', () => {
  const root = mkFixture();
  inject(root, ORACLE, "function leak(status) { if (status === 'complete') return true; return false; }");
  const r = lintIndependence(fixtureOpts(root));
  assert.equal(r.ok, false);
  assert.ok(axes(r).includes('iii-oracle-status-literal'), 'axes=' + axes(r).join(','));
  assert.equal(runCli(root).status, 1);
});

test('B1-LINT-NEG-EVIDENCE-SOURCE: creating receiptPresent outside the builder fails the lint', () => {
  // 오라클은 순수 함수라 주입된 boolean 의 **출처를 볼 수 없다**. 생산자 유일성만이
  // §3.12 git-tracked 불변식을 지키는 기계 장치이므로, 이 축이 빠지면 그 불변식은
  // 다음 편집자가 되돌릴 수 있는 관례로 강등된다.
  const root = mkFixture();
  inject(root, SCAN, "function sneak(p) { return { receiptPresent: require('fs').existsSync(p) }; }");
  const r = lintIndependence(fixtureOpts(root));
  assert.equal(r.ok, false);
  assert.ok(axes(r).includes('iv-evidence-producer'), 'axes=' + axes(r).join(','));
  assert.equal(runCli(root).status, 1);
});

// --- builder 의 수단 고정 (출력이 아니라 명령) --------------------------------

test('lint — builder 가 cat-file 을 잃거나 existsSync/ls-files 를 쓰면 실패', () => {
  // test 는 출력을, lint 는 수단을 본다. staged-uncommitted stub test 는 출력(false)만
  // 보므로 하드코딩 목록 같은 제3의 구현도 통과시킨다 — 그 간극을 이 축이 닫는다.
  const noCatFile = mkFixture();
  const p = path.join(noCatFile, BUILDER);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').split("'cat-file'").join("'rev-list'"), 'utf8');
  const r1 = lintIndependence(fixtureOpts(noCatFile));
  assert.equal(r1.ok, false);
  assert.ok(axes(r1).includes('iv-evidence-producer'));

  const withExists = mkFixture();
  inject(withExists, BUILDER, 'function bad(p) { return fs.existsSync(p); }');
  const r2 = lintIndependence(fixtureOpts(withExists));
  assert.equal(r2.ok, false);
  assert.ok(axes(r2).includes('iv-evidence-producer'));

  const withLsFiles = mkFixture();
  inject(withLsFiles, BUILDER, "function bad2(q) { return q(['ls-files', '--error-unmatch']); }");
  const r3 = lintIndependence(fixtureOpts(withLsFiles));
  assert.equal(r3.ok, false);
  assert.ok(axes(r3).includes('iv-evidence-producer'));
});

test('lint — scan.js 의 구간 마커가 사라지면 실패 (구간 미선언 = 위반)', () => {
  const root = mkFixture();
  const p = path.join(root, SCAN);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').split(lintModule.REGION_START).join('region-removed'), 'utf8');
  const r = lintIndependence(fixtureOpts(root));
  assert.equal(r.ok, false);
  assert.ok(axes(r).includes('i-ledger-require'));
});

test('lint — 정규식 안의 `//` 가 감사자를 눈멀게 하지 않는다 (local review L1)', () => {
  // 이전 stripComments 는 정규식 리터럴을 추적하지 않아, `/https?:\/\//` 의 `\/\/` 를
  // 줄 주석 시작으로 읽고 **그 줄의 나머지를 통째로 지웠다**. 같은 줄 뒤에 오는 위반이
  // 조용히 사라지므로 lint 는 통과를 보고한다 — 감사자가 눈머는 실패는 성공처럼 보인다.
  const root = mkFixture();
  inject(root, ORACLE, "const URL_RE = /https?:\\/\\//; const fs = require('fs');");
  const r = lintIndependence(fixtureOpts(root));
  assert.equal(r.ok, false, 'the require after the regex must still be seen');
  assert.ok(axes(r).includes('ii-oracle-purity'), 'axes=' + axes(r).join(','));
  assert.equal(runCli(root).status, 1);

  // 나눗셈은 정규식이 아니다 — 뒤따르는 줄 주석이 계속 제거돼야 한다(과잉 보존 회귀).
  const root2 = mkFixture();
  inject(root2, ORACLE, "const ratio = (a, b) => a / b; // require('fs') 는 여기서 주석이다");
  const r2 = lintIndependence(fixtureOpts(root2));
  assert.equal(r2.ok, true, 'division must not swallow the rest as a regex; got '
    + JSON.stringify(r2.violations, null, 1));
});

test('lint — 주석에 든 금지 패턴은 위반이 아니다 (문서화를 벌하지 않는다)', () => {
  const root = mkFixture();
  inject(root, ORACLE, "// 예시: require('fs') 와 status === 'complete' 는 금지된다");
  inject(root, ORACLE, "/* receiptPresent: fs.existsSync(p) 같은 형태를 막는다 */");
  const r = lintIndependence(fixtureOpts(root));
  assert.equal(r.ok, true, 'comments must not trip the lint; got ' + JSON.stringify(r.violations, null, 1));
});
