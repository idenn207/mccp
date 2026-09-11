'use strict';

// required check drift 진단의 파서와 판정 순수층 (M3 Task 8 · DD6).
//
// **판정 순수층만 단언하면 부족하다.** 앞 라운드의 셋은 전부 `diffChecks`라 실제
// producer(workflow의 job 이름 파서)가 무엇을 내는지 재는 단언이 0건이었고,
// Acceptance 4는 workflow를 제대로 읽지 못하는 구현으로도 만족됐다 — 이 계획이
// gate·Task 4에서 "순수층만 단언하면 부르는 한 줄이 빠진다"며 seam을 명시한 규율이
// 이 Task에만 빠져 있었다(L2 R21 test). 그래서 파서 2분기는 **실재 파일**에 대해 돈다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const GATE_WF = path.join(REPO, '.github', 'workflows', 'test-suite.yml');
const BASELINE_WF = path.join(REPO, '.github', 'workflows', 'test-suite-baseline.yml');

const { parseJobNames, diffChecks } = require('../ci-required-checks.js');

// ─────────────────────────────────────────────────────────────────────────────
// 판정 순수층 — 3분기
// ─────────────────────────────────────────────────────────────────────────────

test('diffChecks (1): the gate being required is ok', () => {
  const v = diffChecks({ declared: ['full test suite gate'], required: ['full test suite gate'], protected: true });
  assert.strictEqual(v.ok, true);
  assert.deepStrictEqual(v.missing, []);
  assert.deepStrictEqual(v.unrelated, []);
});

test('diffChecks (2): an UNRELATED required check does not drop ok', () => {
  // 선언은 test-suite.yml 한 파일에서만 읽는다. 저장소의 다른 workflow 가 required 로
  // 걸리면(version-declaration-gate 가 모든 PR 에서 돈다) 동등성 비교는 정상 설정을
  // drift 로 오보한다 — 포함 검사가 그것을 닫는다(PR-Codex R1 F2).
  const v = diffChecks({
    declared: ['full test suite gate'],
    required: ['full test suite gate', 'version-declaration-gate'],
    protected: true,
  });
  assert.strictEqual(v.ok, true, 'an unrelated required check must not be reported as drift');
  assert.deepStrictEqual(v.unrelated, ['version-declaration-gate']);
  assert.deepStrictEqual(v.reasons, []);
});

test('diffChecks (3): a historical gate name left in required is additive drift', () => {
  // 개명 자체는 이 목록 없이도 missing 으로 잡힌다. 이 사유가 더하는 유일한 정보는
  // "required 에 남은 그 이름이 우리 게이트의 옛 이름" 이라는 것이다.
  const v = diffChecks({
    declared: ['full test suite gate'],
    required: ['old gate name'],
    protected: true,
    historical: ['old gate name'],
  });
  assert.strictEqual(v.ok, false);
  assert.deepStrictEqual(v.missing, ['full test suite gate']);
  assert.ok(v.reasons.includes('declared_not_required'), 'the declared gate is still not required');
  assert.ok(v.reasons.includes('renamed_gate'), 'renamed_gate must ride ALONG WITH declared_not_required');

  // 같은 입력에서 목록만 비우면 renamed_gate 만 사라진다 — 이 사유의 판별력이 그것이다.
  const bare = diffChecks({ declared: ['full test suite gate'], required: ['old gate name'], protected: true, historical: [] });
  assert.deepStrictEqual(bare.reasons, ['declared_not_required']);
});

test('diffChecks (4): an unreadable channel is NOT the same as absent protection', () => {
  // 접으면 "보호가 없다" 와 "권한이 없어 안 보인다" 가 같은 값이 되고, 그것이
  // 이 milestone 이 판독 채널을 바꾼 이유 자체다(E1x).
  const absent = diffChecks({ declared: ['full test suite gate'], required: [], protected: false });
  assert.deepStrictEqual(absent.reasons, ['protection_absent']);

  const hidden = diffChecks({ declared: ['full test suite gate'], required: null, protected: true });
  assert.deepStrictEqual(hidden.reasons, ['protection_unreadable']);

  // protected 를 아예 넘기지 않은 것(인자 미전달·API 실패)도 fail-closed 다. 이 행이
  // 없으면 3분화가 undefined 를 protection_absent 로 되접는다.
  const unknown = diffChecks({ declared: ['full test suite gate'], required: ['full test suite gate'] });
  assert.deepStrictEqual(unknown.reasons, ['protection_unreadable']);
  assert.strictEqual(unknown.ok, false);
});

test('diffChecks (5): an EMPTY declared list fails closed, it does not pass vacuously', () => {
  // declared 는 parseJobNames 의 resolved 다. job name: 을 matrix 템플릿으로 바꾸면
  // 그것이 unresolved 로 가고 declared 가 빈다 — 포함 검사는 공허하게 참이 되어
  // 진단이 조용히 green 이 된다. runbook 이 exit 0 을 완료의 증거로 삼으므로
  // 그것은 loud red 를 silent green 으로 바꾸는 회귀다.
  const v = diffChecks({ declared: [], required: ['full test suite gate'], protected: true });
  assert.strictEqual(v.ok, false, 'an empty declared list must never be ok');
  assert.deepStrictEqual(v.reasons, ['declared_unresolved']);
});

// ─────────────────────────────────────────────────────────────────────────────
// 파서 2분기 — **실재 파일**에 대해 돈다
// ─────────────────────────────────────────────────────────────────────────────

test('parser: the enforcement workflow yields its literal job name', () => {
  // 강제 workflow의 job 이름을 **안정 리터럴**로 고정한 Task 5의 요구가 이 계약의 짝이다.
  const parsed = parseJobNames(fs.readFileSync(GATE_WF, 'utf8'));
  assert.deepStrictEqual(parsed.resolved, ['full test suite gate']);
  assert.deepStrictEqual(parsed.unresolved, []);
});

test('parser: a matrix-template job name is reported as unresolved, never as a check name', () => {
  // 템플릿 문자열을 그대로 check 이름으로 내면 **어떤 실제 체크와도 영원히 일치하지
  // 않아** drift를 상시 보고한다. 이 milestone 자신이 같은 사이클에서 baseline의 job
  // name을 matrix 템플릿으로 만들므로 이 분기는 가설이 아니다.
  const parsed = parseJobNames(fs.readFileSync(BASELINE_WF, 'utf8'));
  assert.deepStrictEqual(parsed.resolved, [], 'a templated name must not be emitted as a check name');
  assert.strictEqual(parsed.unresolved.length, 1);
  assert.ok(parsed.unresolved[0].indexOf('${{') >= 0);
});

test('parser: step-level and commented name: lines are not mistaken for job names', () => {
  // 주석 안의 `name:`이 check 이름으로 잡히면 이 진단이 산문을 검사하게 된다
  // (§3.17 선례). step의 `name:`은 job보다 깊으므로 들여쓰기로 갈린다.
  const yaml = [
    'jobs:',
    '  gate:',
    '    # name: a commented job name that must be ignored',
    '    name: real job name',
    '    steps:',
    '      - name: a step name that is not a check name',
    '        run: echo hi',
    '',
  ].join('\n');
  const parsed = parseJobNames(yaml);
  assert.deepStrictEqual(parsed.resolved, ['real job name']);
});

test('parser: quoted job names are unquoted', () => {
  const parsed = parseJobNames('jobs:\n  gate:\n    name: "quoted gate"\n    runs-on: x\n');
  assert.deepStrictEqual(parsed.resolved, ['quoted gate']);
});

// ─────────────────────────────────────────────────────────────────────────────
// spawn seam — `readRequiredChecks` 를 **실제로 호출한다** (M4 Task 2 · L2 test HIGH)
//
// 이 milestone 이 실제로 바꾸는 함수가 이것인데 이 파일은 그것을 import 조차 하지
// 않았다. 그래서 판독 채널 교체가 반증 불가였다.
//
// **오늘 트리에서 `protection_absent` 를 재현하는 것은 회귀 test 가 아니다** — main 이
// `protected:false` 라 구·신 채널이 둘 다 absent 계열을 내므로 두 채널을 구분하지
// 못한다. 판별자는 (i) 호출된 엔드포인트가 world-readable 경로라는 것과 (ii) 보호-켜짐
// 응답에서 `contexts` 가 파싱된다는 것, (iii) 빈 응답과 오류 응답이 서로 다른 사유로
// 갈린다는 것이다.
//
// PATH 변조는 **같은 파일 안에서 누출된다** — 복원 전 단언이 실패하면 다음 test 가
// 오염된 PATH 를 본다(security-reviewer S4, 실측). 그래서 복원을 `finally` 에 둔다.
// ─────────────────────────────────────────────────────────────────────────────

const os = require('node:os');
const { readRequiredChecks } = require('../ci-required-checks.js');

// `gh` 스텁은 POSIX sh 스크립트다. Windows 는 `gh.cmd` 가 필요하고 그 축은 이
// milestone 의 강제 플랫폼(ubuntu)이 아니므로 건너뛴다 — 건너뛴다는 사실을 남긴다.
const SEAM_SKIP = process.platform === 'win32' ? 'POSIX sh stub is not executable on win32' : false;

function withGhStub(t, apiBody, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-stub-'));
  t.after(function () { fs.rmSync(dir, { recursive: true, force: true }); });
  const log = path.join(dir, 'argv.log');
  const body = path.join(dir, 'api-body');
  fs.writeFileSync(body, apiBody);
  fs.writeFileSync(path.join(dir, 'gh'), [
    '#!/bin/sh',
    'printf "%s\\n" "$*" >> "' + log + '"',
    'case "$1" in',
    '  repo) echo "idenn207/mccp" ;;',
    '  api)  if [ -s "' + body + '" ]; then cat "' + body + '"; else exit 1; fi ;;',
    '  *) exit 1 ;;',
    'esac',
    '',
  ].join('\n'), { mode: 0o755 });

  const prevPath = process.env.PATH;
  try {
    process.env.PATH = dir + path.delimiter + prevPath;
    return run(function () { return fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''; });
  } finally {
    process.env.PATH = prevPath;   // 단언이 실패해도 반드시 되돌린다(S4)
  }
}

test('seam: readRequiredChecks calls the WORLD-READABLE endpoint, not the admin-only one',
  { skip: SEAM_SKIP }, (t) => {
    withGhStub(t, '{"protected":true,"contexts":["full test suite gate"]}\n', function (argv) {
      readRequiredChecks('main');
      const calls = argv();
      assert.ok(/repos\/idenn207\/mccp\/branches\/main(\s|$)/.test(calls),
        'must call GET /repos/{o}/{r}/branches/{b}; got:\n' + calls);
      assert.ok(!/\/protection\/required_status_checks/.test(calls),
        'the admin-only endpoint must not be called — it 404s for non-admins even when protection is ON');
    });
  });

test('seam: a protection-ON response yields parsed contexts', { skip: SEAM_SKIP }, (t) => {
  withGhStub(t, '{"protected":true,"contexts":["full test suite gate","version-declaration-gate"]}\n', function () {
    const state = readRequiredChecks('main');
    assert.strictEqual(state.protected, true);
    assert.deepStrictEqual(state.contexts, ['full test suite gate', 'version-declaration-gate']);
    // 그리고 그 상태가 판정층에서 ok 로 이어진다 — 무관한 체크가 있어도.
    assert.strictEqual(diffChecks({
      declared: ['full test suite gate'], required: state.contexts, protected: state.protected,
    }).ok, true);
  });
});

test('seam: absent protection and an unreadable channel split into DIFFERENT reasons',
  { skip: SEAM_SKIP }, (t) => {
    // 이것이 이 seam 의 판별자다. 오늘 트리(main unprotected)만으로는 두 채널이 같은
    // 값을 내므로 구·신 구현을 구분할 수 없다.
    withGhStub(t, '{"protected":false,"contexts":null}\n', function () {
      const state = readRequiredChecks('main');
      assert.strictEqual(state.protected, false);
      assert.strictEqual(state.contexts, null);
      assert.deepStrictEqual(
        diffChecks({ declared: ['full test suite gate'], required: state.contexts, protected: state.protected }).reasons,
        ['protection_absent']);
    });

    withGhStub(t, '{"protected":true,"contexts":null}\n', function () {
      const state = readRequiredChecks('main');
      assert.deepStrictEqual(
        diffChecks({ declared: ['full test suite gate'], required: state.contexts, protected: state.protected }).reasons,
        ['protection_unreadable'],
        'protected-but-invisible must NOT collapse into protection_absent');
    });
  });

test('seam: a failing gh call throws — it is never folded into "no protection"',
  { skip: SEAM_SKIP }, (t) => {
    withGhStub(t, '', function () {
      assert.throws(function () { readRequiredChecks('main'); },
        'an erroring gh must propagate so the CLI records read_error and reports protection_unreadable');
    });
  });

test('seam: PATH is restored even when an assertion inside the stub scope fails',
  { skip: SEAM_SKIP }, (t) => {
    const before = process.env.PATH;
    assert.throws(function () {
      withGhStub(t, '{"protected":true,"contexts":[]}\n', function () {
        assert.strictEqual(1, 2, 'deliberate failure inside the stub scope');
      });
    });
    assert.strictEqual(process.env.PATH, before, 'the stub directory leaked into PATH for later tests');
  });
