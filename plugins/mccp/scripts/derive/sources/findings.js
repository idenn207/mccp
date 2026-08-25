'use strict';

// derive source: findings (C1 substrate) — multi-session-work-loop M7 Task 3.
//
// 관측: `.claude/state/findings/*.jsonl` 레지스트리 **전 샤드** → 발견된 finding
//       전수(분모)와 유형별 종결 수(분자 + 비해소 축).
// Emits: { count, closed_count, deferred_count, downgraded_count, rejected_count,
//          open_count, type_separation, producer_coverage, degraded, invalid_count }
// read-only · degraded fail-open per-source.
//
// 이 source가 없던 동안 `computeC1`은 `forward-only` +
// `invalid_reason: 'no live findings derive source wired'`를 반환했다 — fixture만
// findings를 주입했으므로 fixture gate는 통과하나 실 derive는 절대 C1을 산출하지
// 못하는 masquerade 상태였다. 이 파일이 그 producer다.
//
// **전 샤드 스캔이 명시 계약이다**(DD4). 특정 slug만 조회하도록 좁히면 그 순간
// 분모가 조용히 줄어 폐쇄율을 **부풀리는** 방향이 열린다 — DD2가 막는 조작 경로와
// 결과가 같다. `C1-SOURCE-WIRED`가 둘 이상의 샤드를 놓고 합산을 단언한다.

const registry = require('../../state/findings-registry');

function scanFindings(repoRoot) {
  const result = {
    ok: true,
    count: 0,
    closed_count: 0,
    deferred_count: 0,
    downgraded_count: 0,
    rejected_count: 0,
    open_count: 0,
    // **리터럴 true 가 아니라 스캔 결과에서 파생한다**(DD5 말미). 하드코딩하면
    // Task 2의 계약 검사가 findings 소스에 대해 항진명제가 되어 손상 샤드·구
    // 포맷 유입을 영원히 통과시킨다 — DD5가 정정하려던 상태를 방향만 바꿔
    // 재도입하는 것이다.
    type_separation: false,
    producer_coverage: 'findings-registry',
    degraded: false,
    invalid_count: 0,
    work_units: 0,
    error: null,
  };

  try {
    const all = registry.readAll({ repoRoot: repoRoot });
    const c = all.counts;

    result.count = c.total;
    // 해소는 `fixed`·`invalidated` 둘뿐이다. 이연·강등·기각은 분자가 아니다(UI5).
    result.closed_count = c.resolved;
    result.deferred_count = c.deferred;
    result.downgraded_count = c.downgraded;
    result.rejected_count = c.rejected;
    result.open_count = c.open;
    result.work_units = all.work_units.length;
    result.invalid_count = all.malformed;

    // 종결된 항목이 전부 5종 enum 안의 `closure_type`을 가질 때만 참이다.
    // enum 밖 값이나 `closure_type` 없는 종결이 하나라도 있으면 즉시 뒤집힌다.
    result.type_separation = (c.closed_untyped === 0 && c.closed_unknown_type === 0);

    if (all.degraded) {
      result.degraded = true;
      // 유실이 있었던 주기의 C1은 **유실 있음이 표시된 값**이지 깨끗한 값이
      // 아니다(DD8). 그 사실이 computeC1의 `coverage`로 올라간다.
      result.producer_coverage = 'findings-registry-degraded';
      result.degraded_reasons = all.degraded_reasons;
    }
  } catch (err) {
    // per-source degraded fail-open — derive 전체를 멈추지 않는다.
    result.ok = false;
    result.error = err.message;
    result.degraded = true;
    result.producer_coverage = 'findings-registry-degraded';
  }

  return result;
}

module.exports = {
  scanFindings: scanFindings,
};
