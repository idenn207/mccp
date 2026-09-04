#!/usr/bin/env node
'use strict';

// **DD3 판정 순서의 유일한 소비처**이자 DD9 삭제 래칫의 소유자.
//
// ── 이 모듈이 없으면 게이트가 red를 통과시킨다 ──────────────────────────────
// 러너의 CLI 종료코드는 `ok`(**측정이 성립했는가**)이지 `exit_code`(스위트 green)가
// 아니다 — `run.js:10-12`가 그것을 계약으로 못박고 `:725`가 `return result.ok ? 0 : 1`로
// 구현한다. 그 계약은 결함이 아니라 M1이 의도한 것이다(측정 도구가 red로 죽으면 실패
// 목록을 담은 artifact가 안 올라온다). 그래서 러너는 손대지 않고 **판정을 여기로
// 옮긴다**.
//
// 순서를 workflow의 셸 단계 셋으로 흩지 않는 이유는 둘이다 — (a) 흩으면 그중 하나를
// 지워도 아무 test가 붉어지지 않고(축 D의 절단 오라클은 지목한 줄만 본다), (b) 순서
// 자체가 DD3의 논증이므로 순서를 잃으면 "유출 판정이 red의 하류일 수 있다"는 구조적
// 배제가 성립하지 않는다.
//
// ── 판별자는 `stage`가 아니라 `reasons` 코드다 ──────────────────────────────
// 2단계 하나에 커버리지 실패와 삭제 래칫이 **함께** 들어가므로, `stage=2`만 보고
// "삭제 래칫이 막았다"고 말하면 래칫이 죽어 있어도 다른 커버리지 실패가 같은 값을
// 낸다(L2 R9). 그래서 `reasons`는 닫힌 코드 열거이고 축 D의 수용 증거는 그 코드를
// 단언한다.
//
// ── 단계 사이는 단락하고, 한 단계 안에서는 누적한다 ────────────────────────
// 0→1→2→3은 앞 단계에서 막히면 뒤를 평가하지 않는다. 그러나 **2단계 안의 네 축은
// 전부 평가해 모은다** — floor가 경계값이면 파일 1개 삭제가 `below_floor`와
// `deleted_without_allowance`를 동시에 성립시키는데, 단락 구현이면 앞의 것만 실려
// 축 D 절단 B의 단언이 래칫이 살아 있어도 거짓 red가 된다(L2 R10 test).

const { computeCoverage } = require('./coverage.js');

// 닫힌 코드 열거. 판정 코드 열하나 + 입력 검증(fail-closed) 코드 열둘.
//
// **"닫혔다"는 것은 기계가 재는 사실이어야 한다.** 앞선 판본은 이 둘을 "닫힌 코드
// 열거"라고 선언하고 export까지 했는데 **소비처가 0건**이었고, 그래서 이미 불완전한
// 채로 통과하고 있었다 — `stage 2`가 `computeCoverage`의 사유를 그대로 싣는데
// `per_file_absent`·`tracked_empty`가 아래 목록 어디에도 없었다(2026-09-04
// code-review가 `judge()` 호출로 재현). 우산이 서명 실패 모드로 지목한 형태
// ("기계는 만들어지고 그것을 부르는 한 줄이 빠진다")가 이 파일 안에서 재현된 것이다.
//
// 이제 둘은 두 방향으로 강제된다: (a) CLI가 미선언 코드를 `reasons_undeclared`로
// **산출물에 실어** 런타임 소비처를 만들고, (b) `test-suite-coverage.test.js`가
// 선언 ↔ 실제 방출을 양방향으로 대조한다(미선언 방출 0 · 죽은 선언 0).
const JUDGE_REASONS = [
  'measurement_invalid',
  'measurement_tree_mismatch',
  'suite_red',
  'unexplained',
  'excluded_over_cap',
  'digest_mismatch',
  'below_floor',
  'deleted_without_allowance',
  'redaction',
  // stage 2는 `computeCoverage`의 사유를 **그대로** 싣는다. 아래 둘은 CI 경로에서는
  // stage 0이 먼저 막아 도달하지 않지만(`run.js`는 `ok:true`일 때만 per_file 배열을
  // 싣는다), 도달 불가와 미선언은 다른 사실이다 — 손으로 만든 measurement나
  // producer drift가 그 경로를 열면 판별자가 열거 밖 값을 내게 된다.
  'per_file_absent',
  'tracked_empty',
];

const INPUT_REASONS = [
  'git_failed',
  'tracked_empty',
  'measurement_unreadable',
  'floor_unreadable',
  'floor_key_missing',
  'floor_value_type',
  'exclusions_unreadable',
  'exclusions_invalid',
  'base_unresolved',
  'base_set_empty',
  'floor_entry_shape',
  'duplicate_flag',
];

/** 선언 밖 사유 코드. 비어 있지 않다면 그 자체가 producer drift의 신호다. */
function undeclaredReasons(reasons) {
  const declared = new Set(JUDGE_REASONS.concat(INPUT_REASONS));
  return (Array.isArray(reasons) ? reasons : []).filter(function (r) { return !declared.has(r); });
}

/**
 * DD3의 4축(0~3)을 순서대로 평가한다. **순수 함수** — I/O도 git 호출도 없다.
 *
 * `deletions`가 인자인 것이 이 서명의 핵심이다: 인자로 받지 않으면 삭제 판정이 judge
 * **밖**에 남고 최종 blocked/stage/reasons를 CLI가 사후 합성하게 되어 "gate.js가 DD3
 * 판정 순서의 유일한 소비처"라는 계약이 깨진다(L2 R16 architect). 불순한 계산은 밖에서
 * 하고 **판정만** 안에서 한다 — `coverage`와 완전히 같은 형태다.
 *
 * @param {{measurement: object,
 *          coverage: {tracked:string[], exclusions:Array, floor:object|null},
 *          deletions: {base_resolved:boolean, base_ref:string|null,
 *                      missing:string[], allowed:string[]}}} opts
 */
function judge(opts) {
  const o = opts || {};
  const m = o.measurement;
  const covIn = o.coverage || {};
  const del = o.deletions || { base_resolved: false, missing: [], allowed: [] };

  // ── stage 0 — 측정이 성립했는가 ────────────────────────────────────────────
  // 이것이 없으면 1단계가 거짓말을 한다: chunk의 spawn이 실패하면 그 chunk는
  // `{exit_code: null}`을 내고(`run.js:489-505`) foldChunks가 `Number(x) || 0`으로
  // 접으므로(`:179-183`) null이 **0으로** 바뀐다. 즉 `ok:false ∧ exit_code:0 ∧
  // redaction_ok:true`인 measurement가 실재하며, 스위트가 **한 번도 돌지 않았는데**
  // 1·3단계를 통과한다.
  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    return blocked(0, ['measurement_invalid'],
      'measurement is absent or not an object - the measurement did not complete, ' +
      'which is a different fact from suite greenness.');
  }
  // 부재는 통과가 아니다. 세 키 중 하나라도 없으면 판정할 자격이 없다.
  const requiredKeys = ['ok', 'exit_code', 'redaction_ok'];
  const missingKeys = requiredKeys.filter(function (k) {
    return !Object.prototype.hasOwnProperty.call(m, k);
  });
  if (missingKeys.length) {
    return blocked(0, ['measurement_invalid'],
      'measurement is missing key(s): ' + missingKeys.join(', ') +
      ' - absence is not a pass. The measurement did not complete; this says nothing about suite greenness.');
  }
  if (m.ok !== true) {
    return blocked(0, ['measurement_invalid'],
      'measurement did not complete (ok=' + JSON.stringify(m.ok) + ')' +
      (m.reason ? ': ' + m.reason : '') +
      ' - the MEASUREMENT failed. That is a different fact from suite greenness, ' +
      'and this verdict makes no claim about it.');
  }

  // stage 0의 두 번째 축 — measurement가 이 트리의 것인가.
  // 측정에는 있는데 지금 트리에는 없는 파일은 그 measurement가 **다른 트리의 것**이라는
  // 뜻이다. `unexplained`(반대 방향: 트리에 있는데 측정에 없다)와 짝을 이룬다.
  const trackedList = Array.isArray(covIn.tracked) ? covIn.tracked : [];
  const trackedSet = new Set(trackedList);
  const measuredFiles = Array.isArray(m.per_file)
    ? m.per_file.map(function (e) { return e && e.file != null ? String(e.file) : null; })
      .filter(function (f) { return f !== null; })
    : [];
  const strays = measuredFiles.filter(function (f) { return !trackedSet.has(f); }).sort();
  if (strays.length) {
    return blocked(0, ['measurement_tree_mismatch'],
      'measurement carries ' + strays.length + ' file(s) that are not tracked in this tree ' +
      '(e.g. ' + strays.slice(0, 3).join(', ') + ') - the measurement is not this tree\'s.');
  }

  // ── stage 1 — 스위트 green ────────────────────────────────────────────────
  if (Number(m.exit_code) !== 0) {
    const failing = Array.isArray(m.failing) ? m.failing : [];
    return blocked(1, ['suite_red'],
      'suite is RED (exit_code=' + m.exit_code + '), ' + failing.length + ' failing file(s): ' +
      (failing.length ? failing.join(', ') : '(the runner listed none)') +
      ' | NOTE: any redaction verdict below may be DOWNSTREAM of this red - ' +
      'a failing assertion diff can carry path-shaped fixtures.');
  }

  // ── stage 2 — 커버리지(DD2 3조건) + 삭제 래칫(DD9) ────────────────────────
  // 이 단계 안에서는 **누적**한다. 겹치는 실패를 하나만 싣는 단락 구현이면 축 D
  // 절단 B의 단언이 래칫이 살아 있어도 거짓 red가 된다.
  const cov = computeCoverage({
    tracked: trackedList,
    measurement: m,
    exclusions: Array.isArray(covIn.exclusions) ? covIn.exclusions : [],
    floor: covIn.floor ? covIn.floor.tracked : null,
    maxExcludedFiles: covIn.floor ? covIn.floor.max_excluded_files : null,
  });

  const stage2 = cov.reasons.slice();

  // 블록 밖에서 선언한다. 앞선 판본은 블록 안 `var`의 호이스팅에 기대어 아래 읽기
  // 지점에 닿았는데, 이 파일의 나머지가 전부 const/let이라 그 한 줄만 다른 스코프
  // 규칙을 따랐다 — `let`으로 옮기면 사유 push와 읽기가 같은 스코프에 놓인다.
  let unallowedList = [];

  if (del.base_resolved) {
    const allowedSet = new Set(Array.isArray(del.allowed) ? del.allowed : []);
    unallowedList = (Array.isArray(del.missing) ? del.missing : [])
      .filter(function (f) { return !allowedSet.has(f); });
    if (unallowedList.length) stage2.push('deleted_without_allowance');
  }

  if (stage2.length) {
    const parts = ['gate BLOCKED at stage 2: ' + stage2.join(', ')];
    if (cov.unexplained.length) {
      parts.push('unexplained (tracked but neither executed nor excluded): ' +
        cov.unexplained.slice(0, 10).join(', ') +
        (cov.unexplained.length > 10 ? ' (+' + (cov.unexplained.length - 10) + ' more)' : ''));
    }
    if (stage2.indexOf('excluded_over_cap') >= 0) {
      parts.push('exclusions cover ' + cov.excluded.length + ' file(s), cap is ' +
        (covIn.floor ? covIn.floor.max_excluded_files : 'n/a') +
        ' - raising the cap is a separate, reviewable edit');
    }
    if (stage2.indexOf('below_floor') >= 0) {
      parts.push('tracked=' + cov.tracked + ' is below floor=' + (covIn.floor ? covIn.floor.tracked : 'n/a'));
    }
    if (stage2.indexOf('deleted_without_allowance') >= 0) {
      parts.push('deleted without an allow_deletions entry: ' + unallowedList.join(', '));
    }
    const out = blocked(2, stage2, parts.join(' | '));
    out.coverage = publicCoverage(cov, del);
    return out;
  }

  // ── stage 3 — redaction ───────────────────────────────────────────────────
  // 여기 도달했다는 것은 1이 통과했다는 뜻이므로 **green인데 유출**이다 — 하류
  // 가능성이 구조적으로 배제된다. 그래서 이 메시지에는 그 단서를 붙이지 않는다.
  if (m.redaction_ok !== true) {
    const out = blocked(3, ['redaction'],
      'the suite is GREEN but the measurement carries residual path leakage ' +
      '(redaction_ok=' + JSON.stringify(m.redaction_ok) + '). Stage 1 already passed, so no ' +
      'failing assertion diff exists to explain it - this is a real leak in a green run.');
    out.coverage = publicCoverage(cov, del);
    return out;
  }

  return {
    blocked: false,
    stage: null,
    reasons: [],
    message: 'gate PASSED: measurement complete, suite green, coverage accounted, no residual leakage.',
    coverage: publicCoverage(cov, del),
  };
}

function blocked(stage, reasons, message) {
  return { blocked: true, stage: stage, reasons: reasons, message: message, coverage: null };
}

function publicCoverage(cov, del) {
  return {
    coverage_pct: cov.coverage_pct,
    denominator: cov.denominator,
    numerator: cov.numerator,
    excluded: cov.excluded,
    unexplained: cov.unexplained,
    tracked: cov.tracked,
    base: del && del.base_resolved ? del.base_ref : 'absent',
    missing: del && del.base_resolved ? del.missing : [],
  };
}

module.exports = { judge, undeclaredReasons, JUDGE_REASONS, INPUT_REASONS };

// ─────────────────────────────────────────────────────────────────────────────
// CLI — **강제 workflow가 부르는 유일한 판정 명령**이다.
// ─────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const inputs = require('./inputs.js');
  const { createRedactor } = require('./redact.js');

  const emit = function (record, wantJson) {
    // DD4는 "업로드되는 artifact 내용은 redact를 이미 통과한 산출"이라고 적는데,
    // `gate.json`은 이 모듈이 조립하는 것이라 그 계약 밖에 있었다 — fail-closed
    // 진단 문자열은 git stderr나 파일 경로를 담고 `if: always()`라 조건 없이
    // 발행되므로, 미검열 절대경로가 매 PR 공개 artifact에 실린다(L2 R19·R20 security).
    // 계약을 넓히는 대신 새 산출물을 계약 안으로 들인다.
    const redactor = createRedactor({ repoRoot: process.cwd() });
    const safe = Object.assign({}, record, { message: redactor.redactText(record.message) });
    // 선언된 열거를 **런타임에 실제로 읽는** 유일한 자리. 없으면 두 상수는 export만
    // 되고 아무도 부르지 않는 장식이고, 그 상태를 이 milestone이 이미 한 번 겪었다.
    // 판정은 바꾸지 않는다 — drift는 차단 사유가 아니라 보고 대상이다.
    const undeclared = undeclaredReasons(record.reasons);
    if (undeclared.length) safe.reasons_undeclared = undeclared;
    // **blocked에서도 `--json` 산출을 stdout에 실제로 기록한다.** 진단을 stderr로만
    // 내고 죽는 구현은 종료코드 단언까지 만족하면서 CI red run의 gate.json을 빈 파일로
    // 만들고, 축 D 증거 전체가 그 미명시 동작에 매달린다(L2 R17 invariant).
    if (wantJson) process.stdout.write(JSON.stringify(safe, null, 2) + '\n');
    else process.stdout.write(safe.message + '\n');
    return safe;
  };

  try {
    const flags = inputs.parseFlags(process.argv.slice(2));
    const wantJson = flags.json === true;
    const resolved = inputs.resolveInputs(flags, { cwd: process.cwd(), requireFloor: true });

    if (resolved.reasons.length) {
      // 이 아홉 범주는 `judge` **호출 전에** 발생하므로 정의상 judge 밖에서 조립된다.
      // R16이 닫은 규칙("판정을 CLI로 흘리지 마라")과 충돌하지 않는다: 여기서 CLI가
      // 조립하는 것은 **판정할 자격이 없다**는 사실이고, 그것은 judge의 입력을 만들 수
      // 없다는 뜻이므로 judge에 넘길 것 자체가 없다. stage:0 고정과 coverage:null이
      // 그 구분을 형태로 남긴다.
      const rec = {
        blocked: true,
        stage: 0,
        reasons: resolved.reasons,
        message: 'gate cannot judge: ' + resolved.reasons.join(', ') + ' | ' + resolved.messages.join(' | '),
        coverage: null,
      };
      emit(rec, wantJson);
      process.exitCode = 1;
    } else {
      const verdict = judge({
        measurement: resolved.measurement,
        coverage: {
          tracked: resolved.tracked,
          exclusions: resolved.exclusions,
          floor: resolved.floor,
        },
        deletions: resolved.deletions,
      });
      emit(verdict, wantJson);
      // `blocked`가 종료코드에 도달한다 — stage 0·1·2·3 **모든** 분기에서.
      process.exitCode = verdict.blocked ? 1 : 0;
    }
  } catch (err) {
    const redactor = createRedactor({ repoRoot: process.cwd() });
    process.stderr.write('[gate] ' + redactor.redactText(String((err && err.stack) || err)) + '\n');
    process.exitCode = 1;
  }
}
