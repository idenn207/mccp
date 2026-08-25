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

const fs = require('fs');
const path = require('path');

const registry = require('../../state/findings-registry');

// msw-events의 `remediation_pr` 레코드에서 finding_id를 모은다 (local review H3).
//
// **읽기 전용 · per-line 격리 · fail-open**: 이 디렉토리는 append-only sidecar라
// 손상 줄이 섞일 수 있고, 그 한 줄 때문에 findings 소스 전체가 degrade되면 C1이
// 무관한 이유로 죽는다. 파싱 실패는 그 줄만 버린다(`session-activity.js`와 같은 규약).
//
// 형태 검증을 여기서도 하는 이유: CLI 초크 포인트가 이미 `FINDING_ID_RE`를
// 강제하지만 그것은 **한 ingress의 방어**이고, 이 파일은 디스크에 이미 있는
// 것을 읽는다. 손으로 편집된 줄이 임의 문자열을 실어도 커버리지 분자가
// 오염되지 않아야 한다.
function readRemediationFindingIds(repoRoot) {
  const ids = new Set();
  const dir = path.join(repoRoot, '.claude', 'state', 'msw-events');
  let files = [];
  try { files = fs.readdirSync(dir); } catch (_e) { return ids; }

  files.forEach(function (f) {
    if (!f.endsWith('.jsonl')) return;
    let text = '';
    try { text = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (_e) { return; }
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      let o = null;
      try { o = JSON.parse(line); } catch (_e) { return; }
      if (!o || o.kind !== 'remediation_pr') return;
      if (!o.finding_id || !registry.FINDING_ID_RE.test(String(o.finding_id))) return;
      ids.add(String(o.finding_id));
    });
  });
  return ids;
}

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
    // M8 Task 7 (DD8) — 귀속 커버리지. 값이 아니라 "삼각이 기록되고 있는가"다.
    with_gate_decision: 0,
    with_remediation_pr: 0,
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

    // ── C2/C3 귀속 커버리지 (M8 Task 7 · DD8) ──────────────────────────────
    //
    // **값이 아니라 커버리지다.** C2·C3의 status는 `forward-only`로 유지되고
    // 여기서 세는 것은 "삼각의 좌변·우변이 실제로 기록되고 있는가"뿐이다.
    // 이 수치가 0이 아니라는 것은 귀속 레코드가 라이브에서 생성됐다는 뜻이지
    // 지표가 산출됐다는 뜻이 아니다 — 산출은 label-protocol 개정을 거쳐야 한다.
    //
    // 분모는 finding 전수(`count`)이고 분자는 **distinct finding_id** 기준이다.
    // 이벤트 수로 세면 같은 finding에 달린 여러 레코드가 커버리지를 부풀린다.
    const withGate = new Set();
    const withPr = new Set();
    (all.shards || []).forEach(function (shard) {
      (shard.events || []).forEach(function (e) {
        if (!e || !e.finding_id) return;
        if (e.gate_decision_id) withGate.add(String(e.finding_id));
        if (e.remediation_pr) withPr.add(String(e.finding_id));
      });
    });

    // 삼각의 **우변은 다른 저장소에 산다** (local review H3).
    //
    // 좌변(`gate_decision_id`)은 리뷰 시점에 알 수 있어 finding과 같은 샤드에
    // 실린다. 우변은 PR 번호가 있어야 성립하고 그 번호는 `gh pr create` 이후에만
    // 존재하는데, 그 시점의 writer는 명령 본문이고 레지스트리에 append하려면
    // `finding_closed`를 써야 한다 — 그러면 `closure_type` enum을 통과해 C1의
    // **해소 계상을 오염**시킨다. 그래서 우변은 msw-events의 `remediation_pr`
    // 레코드로 남기고, 조인은 여기서 `finding_id`로 한다.
    //
    // 이 union이 없던 동안 `with_remediation_pr`은 producer가 0개라 구조적으로
    // 0이었다 — 대시보드는 `해소 PR 연결 0건`을 "아직 해소 주기가 없다"로 읽히게
    // 표시했지만 실제로는 **어떤 주기로도 0을 벗어날 수 없는** 상태였다.
    readRemediationFindingIds(repoRoot).forEach(function (fid) { withPr.add(fid); });

    result.with_gate_decision = withGate.size;
    result.with_remediation_pr = withPr.size;

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
