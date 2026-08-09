'use strict';

// derive source: toggle-usage
// 관측: env-snapshot 읽어 토글 non-default 사용 이력(B3 분자) + 분모 99 재스캔
// Emits: { used_toggle_count, denominator, operation_branch_count, ... }
// degraded fail-open per-source.

const fs = require('fs');
const path = require('path');

const toggleSnapshot = require('../../state/toggle-snapshot');

// 계약(measurement-design.md §B3): 토글 식별자는 정규식 MCCP_[A-Z0-9_]+에 매치하고,
// 분모 범위는 plugins/mccp/scripts/**/*.js (`*/tests/*` 경로와 `*.test.js` 파일 제외)
// ∪ plugins/mccp/commands/*.md 이며, 제외는 **명명된 분류표**에만 유효하다.
//
// M4 Task 5 — 스캐너를 toggle-snapshot.js 하나로 통일했다. 이전에는 이 파일이
// 자체 스캐너 + 자체 EXCLUDE_TOKENS를 들고 있어 producer와 reader가 서로 다른
// 분모를 볼 수 있었고, 실제로 `*.test.js` 제외 여부가 두 구현에서 달랐다.

function scanToggleUsage(repoRoot) {
  const result = {
    ok: true,
    used_toggle_count: 0,
    denominator: 0,
    raw_surface_count: 0,
    excluded_count: 0,
    operation_branch_count: 0,
    operation_branch_method: BRANCH_METHOD,
    snapshot_corpus_present: false,
    snapshot_files_read: 0,
    snapshot_files_parsed: 0,
    producer_coverage: 'toggle-usage',
    degraded: false,
    invalid_count: 0,
    error: null,
  };

  try {
    // 1. 런타임 표면 스캔 — 제외 전/후 두 분모를 함께 보고한다(G3).
    //    하나만 내면 "제외했더니 줄었다"가 감축으로 오독된다.
    const surface = toggleSnapshot.scanSurfaceDetailed(repoRoot);
    result.raw_surface_count = surface.raw_surface_count;
    result.denominator = surface.toggle_count;
    result.excluded_count = surface.excluded.length;

    // measurement-design.md §B3의 "이름을 규범 문서에 적을 때만 유효"는 대조가
    // 소비처까지 닿아야 규칙이다. drift를 계산만 하고 버리면 코드만 고쳐 분모를
    // 바꾸는 경로가 그대로 열려 있고 test 하나만 빨개진다 — 그 test를 지우면
    // 아무 신호도 남지 않는다. 분모를 내는 바로 이 자리에서 degrade시킨다.
    const doc = surface.exclusion_doc;
    result.exclusion_doc_ok = doc ? doc.ok : null;
    result.exclusion_doc_drift = doc && doc.drift ? doc.drift : [];
    if (doc && !doc.ok) {
      result.degraded = true;
      result.error = 'exclusion table drift — the denominator is not the one the normative ' +
        'document names: ' + result.exclusion_doc_drift.join('; ');
    }

    // 2. env-snapshot을 읽어 non-default 사용 이력(분자)을 센다.
    const snapDir = path.join(repoRoot, '.claude', 'state');
    const usedToggles = new Set();

    if (fs.existsSync(snapDir)) {
      const files = fs.readdirSync(snapDir);
      for (const file of files) {
        if (!file.endsWith('.env-snapshot.json')) continue;
        const filePath = path.join(snapDir, file);
        result.snapshot_files_read++;

        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          result.snapshot_files_parsed++;
          if (content.toggles && typeof content.toggles === 'object') {
            for (const toggleName of Object.keys(content.toggles)) {
              const toggleData = content.toggles[toggleName];
              // Only count non-default usage
              if (toggleData && toggleData.is_set === true) {
                usedToggles.add(toggleName);
              }
            }
          }
        } catch (snapErr) {
          result.invalid_count++;
        }
      }
    }

    // producer 존재 여부는 사용 건수와 **직교**다. 스냅샷 파일이 하나도 없으면
    // "토글을 아무도 안 썼다"가 아니라 "이력이 수집된 적 없다"이고, 둘을 같은
    // `0`으로 내보내면 빈 corpus 위에서 confidently-wrong 0%가 나온다(M2가
    // A1·A2·A4·B2에 대해 이미 강등시킨 패턴).
    //
    // 존재 판정의 기준은 **파싱에 성공한** 스냅샷이다. `files_read`로 세면 전부
    // 손상된 corpus가 "이력이 수집됐다"로 통과해 바로 위 문단이 막으려는
    // confidently-wrong 0%를 그대로 산출한다(읽기는 됐고 해석은 실패한 파일은
    // 이력이 아니다). files_read와 invalid_count는 진단용으로 둘 다 남긴다.
    result.snapshot_corpus_present = result.snapshot_files_parsed > 0;
    result.used_toggle_count = usedToggles.size;

    // 파일은 있는데 하나도 파싱되지 않았다면 정상 상태가 아니다 — corpus 부재와
    // 구분되도록 degraded로 표면화한다.
    if (result.snapshot_files_read > 0 && result.snapshot_files_parsed === 0) {
      result.degraded = true;
      result.error = 'all ' + result.snapshot_files_read +
        ' env-snapshot file(s) failed to parse; treating the corpus as absent';
    }

    // 3. 동작 분기 수 — **분모 표면 전체** 위에서 센다.
    //    measurement-design.md §B3의 병기 목적은 "토글 수를 줄였다 ≠ 동작 분기를
    //    줄였다"를 드러내는 것이다. 분자(사용 이력) 위에서 세면 토글을 은퇴시켜도
    //    값이 안 움직여 그 목적을 달성하지 못하고, 이력이 비면 그냥 0이 된다.
    result.operation_branch_count = countOperationBranches(surface.toggles);

  } catch (err) {
    result.ok = false;
    result.error = err.message;
    result.degraded = true;
  }

  return result;
}

// 동작 분기 수 (measurement-design.md §B3 "동작 분기 수").
//
// "토글 하나가 몇 개의 서로 다른 값으로 분기하는지의 합. 예를 들어
// MCCP_STOP_LOOP(off/observe/enforce 3분기)은 분기 3, 불리언 토글은 분기 2."
//
// 열거형은 이름을 적어 고정하고 나머지는 불리언 2로 센다. 임계값 토글(숫자·
// 리스트)도 2로 세는데, 이는 "기본값 대 override" 두 갈래라는 **하한**이지 정확한
// 값이 아니다 — 그래서 산출 방법을 함께 내보내고(`operation_branch_method`) 값을
// 정밀도가 있는 것처럼 쓰지 않는다. 하한이어도 목적은 달성된다: 토글을 설정 blob
// 안으로 접어 개수만 줄이면 이 합이 따라 줄지 않는다.
const BRANCH_VALUES = Object.freeze({
  MCCP_STOP_LOOP: 3,                    // off | observe | enforce
  MCCP_RECEIPT_GATE_MODE: 3,            // soft | hard | off
  MCCP_IMPECCABLE_ROUTING_MODE: 3,      // auto | hybrid | recommend
  MCCP_DESIGN_GROUNDING: 3,             // off | warn | enforce
  MCCP_WORK_MERGED_VERIFY: 3,           // off | warn | enforce
  MCCP_EVIDENCE_CONFLICT_GUARD: 3,      // enforce | warn | off
  MCCP_BRIEFING: 3,                     // on | off | auto
  MCCP_AUTO_HANDOFF: 3,                 // off | notify | spawn(deprecated alias)
  MCCP_GATE_ROUND_CAP: 3,               // 1 | 2 | 3
  MCCP_DESIGN_CRITIQUE_MAX_RETRY: 4,    // 0 | 1 | 2 | 3
  MCCP_WORK_MERGE_STRATEGY: 2,          // disable-parallel | worktree-merge
});

const DEFAULT_BRANCHES = 2;
const BRANCH_METHOD = 'enum-table+boolean-floor (lower bound)';

function branchesForToggle(name) {
  return Object.prototype.hasOwnProperty.call(BRANCH_VALUES, name)
    ? BRANCH_VALUES[name]
    : DEFAULT_BRANCHES;
}

function countOperationBranches(toggles) {
  return (toggles || []).reduce((sum, name) => sum + branchesForToggle(name), 0);
}

module.exports = {
  scanToggleUsage,
  countOperationBranches,
  branchesForToggle,
  BRANCH_VALUES,
  BRANCH_METHOD,
};
