'use strict';

// leadtime-observability M3 — derive 진입점의 leadtime 축 스캐너.
//
// **`derive/sources/`가 아니다.** 그 디렉토리는 `SOURCE_SCANNERS`에 등록되어
// `model.sources.<name>` count-source를 채우는 스캐너의 자리이고, 이 축은 top-level
// `model.leadtime`을 채운다. 인용한 선례 `model.metrics`도 `derive/sources/`가 아니라
// `lib/msw-metrics`에 산다.
//
// ── spawn-free 예산은 기본값이 지킨다 (DD16) ─────────────────────────────────
//
// `scanLeadtime`은 `opts.leadtimeScan`이 참일 때만 돈다. 켜는 곳은 **렌더 진입점
// 둘**뿐이다(`derive/cli.js#cmdRender` · `renderer/trigger.js`). bare `derive()`
// (`run` · `validate` · perf-budget)는 `null`을 받아 0을 지불하고, 그 경로는 애초에
// STATUS.md를 만들지 않으므로 사용자가 잃는 것이 없다.
//
// 실측(이 worktree): `derive(worktreeScan:true)` 2371ms · `audit()` 371ms — 렌더
// 경로에 약 16% 추가. 값이 커지면 두 호출부의 `leadtimeScan`을 되돌리는 것이 완화다.
//
// ── 실패는 throw가 아니라 sentinel이다. 그리고 sentinel은 경로를 싣지 않는다 ──
//
// `derive/index.js`가 독립 try/catch로 감싸지만 이 함수는 **스스로도** throw하지
// 않는다. 대신 blind 골격의 한 인스턴스를 돌려준다 — 별도 shape을 쓰면 포매터가
// `coverage.panel_records`·`post_panel_span.by_anchor`를 읽는 바로 그 unknown-input
// 경로에서 DD3의 "관측 부재 vs 렌더 결함" 구분이 무너진다.
//
// `error_kind`는 **닫힌 열거형**이고 `err.message`는 stderr로만 나간다. Node의
// fs/require 에러 메시지는 절대경로를 품으므로(`ENOENT: … open 'C:\_project…'`),
// 그것을 sentinel에 실으면 DD5가 git-tracked로 옮긴 파일에 머신 고유 경로가
// 커밋되고 DD12의 "투영에 경로 없음"이 실패 경로에서 깨진다 — §3.12가 sanctioned
// 재봉인 도구까지 필요했던 그 유출 계열이다.

const ERROR_KINDS = Object.freeze({
  MODULE_LOAD: 'module-load-failed',
  ORACLE_THREW: 'oracle-threw',
  READ_FAILED: 'read-failed',
});

// sentinel 골격은 **의존성 없이** 만든다. `module-load-failed`는 정의상
// `leadtime-surface`조차 못 불렀을 수 있는 상태라, 그 모듈에서 골격을 가져오면
// 실패 경로가 자기 원인에 의존한다. 대신 test가 이 리터럴과
// `leadtime-surface.emptySummary()`의 shape 동일성을 단언해 drift를 잡는다.
function sentinel(errorKind) {
  return {
    tool: 'leadtime',
    state: 'blind',
    coverage: { panel_records: 0, measurable: 0, counts_are_lower_bound: false },
    panel_span: null,
    post_panel_span: {
      by_anchor: { ledger_basename: null, ship_plan_hash: null },
      coverage: {
        eligible: 0, matched_ledger: 0, matched_ship: 0,
        both: 0, only_ledger: 0, only_ship: 0, neither: 0,
      },
      unmatched: {},
      disagreement: null,
      disagreement_note: '',
    },
    degradations: [errorKind],
  };
}

function stderr(msg) {
  try { process.stderr.write(msg + '\n'); } catch (_) { /* stderr 부재도 삼킨다 */ }
}

function scanLeadtime(root, opts) {
  const o = opts || {};
  if (!o.leadtimeScan) return null;

  let lt;
  try {
    lt = require('./leadtime');
  } catch (err) {
    stderr('[mccp:leadtime] module load failed (allow): ' + ((err && err.message) || err));
    return sentinel(ERROR_KINDS.MODULE_LOAD);
  }

  let result;
  try {
    result = lt.audit({ repoRoot: root, allowGit: true });
  } catch (err) {
    stderr('[mccp:leadtime] audit threw (allow): ' + ((err && err.message) || err));
    return sentinel(ERROR_KINDS.READ_FAILED);
  }

  try {
    return lt.summarizeForSurface(result);
  } catch (err) {
    stderr('[mccp:leadtime] projection threw (allow): ' + ((err && err.message) || err));
    return sentinel(ERROR_KINDS.ORACLE_THREW);
  }
}

module.exports = {
  ERROR_KINDS: ERROR_KINDS,
  sentinel: sentinel,
  scanLeadtime: scanLeadtime,
};
