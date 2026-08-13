'use strict';

// multi-session-work-loop M5 — 저널 → STATE.md 상태 객체 투영 (순수 reduce, G1·G3).
//
// 설계: docs/multi-session-work-loop/state-truth-source-design.md
//
// **이 파일은 I/O를 갖지 않는다** (DD4). `fs`·`child_process`·`net`·`os`를
// import하지 않으며, 그 사실은 선언이 아니라 검사다 — single-writer-lint.js 축 5가
// 정적으로 확인하고, Task 3 Validate 7(b)가 fs write 메서드를 throw 스텁으로
// 바꾼 상태에서 `project()`가 정상 반환함을 동적으로 확인한다.
//
// **`mergeState`를 재구현하지 않는다**는 것이 G3이 순환 논증이 아닌 이유다.
// 검증 기준은 `renderState`의 출력 자체가 아니라 "동일 patch 시퀀스에 대해 M5
// 전후 산출 바이트가 같은가"이고, 그 기준은 병합 의미론을 베끼지 않았을 때만
// 성립한다. 그래서 여기서는 state-writer의 함수를 **호출만** 한다.

const { mergeState, emptyState } = require('../../state/state-writer');
const { classifyAll, ADMISSION } = require('./order');

// 스냅샷을 담은 레코드 kind — patch를 접는 대신 상태를 **교체**한다.
const SNAPSHOT_KINDS = new Set(['genesis', 'checkpoint', 'reseed']);

function cloneState(state) {
  const base = emptyState();
  if (!state || typeof state !== 'object') return base;
  return {
    frontmatter: Object.assign({}, base.frontmatter, state.frontmatter || {}),
    body: Object.assign({}, base.body, state.body || {}),
  };
}

// project(records, base) → { frontmatter, body }
//
// `base`는 **호출자가 주입한다**. checkpoint를 디스크에서 읽는 것은
// journal-store.js의 일이고, 이 함수는 받은 것을 접기만 한다 — 그 분리가 없으면
// "I/O를 갖지 않는다"가 거짓이 된다.
//
// 반환은 정확히 `records.filter(admit).sort(by seq).reduce(mergeState, base)`이며,
// 스냅샷 레코드를 만나면 그 시점부터 상태를 갈아끼운다(genesis 부트스트랩과
// checkpoint 압축이 같은 경로를 탄다).
function project(records, base, opts) {
  opts = opts || {};
  // opts는 `{seededTombstones, baseIndex}`를 그대로 통과시킨다 — baseIndex는
  // 압축이 봉인한 순서 메타로, 없으면 압축 이후 지연 레코드가 admit된다(D1).
  const classified = classifyAll(records || [], opts);

  let state = base ? cloneState(base) : emptyState();

  // `created_at`은 **접기로 재파생하면 안 되는 유일한 필드**다.
  //
  // `mergeState`는 `created_at`이 비어 있으면 그 자리에서 `now`를 찍는다. 투영은
  // 매 변형마다 checkpoint 이후 레코드를 **다시** 접으므로, 그대로 두면 두 번째
  // 호출이 첫 레코드를 재생하면서 `created_at`을 replay 시각으로 덮어쓴다 —
  // "이 상태가 처음 만들어진 시각"이 매번 미래로 밀린다(회귀 test
  // `read-modify-write preserves unspecified fields`가 이것을 잡았다).
  //
  // 결정론적 앵커는 **레코드의 `ts`** 다: 디스크에 봉인돼 있고 재생과 무관하며,
  // 의미도 정확히 같다(그 상태를 처음 만든 변형의 시각). `updated_at` /
  // `last_event_at`은 반대로 "지금"이 맞으므로 손대지 않는다 — M5 이전 경로도
  // 매 update마다 now를 찍었고 최종값은 마지막 update의 now로 동일하다.
  let createdAtAnchor = (base && base.frontmatter && base.frontmatter.created_at) || null;

  for (const entry of classified) {
    if (entry.decision.verdict !== ADMISSION.ADMIT) continue;
    const record = entry.record;

    if (SNAPSHOT_KINDS.has(record.kind)) {
      const snap = record.checkpoint_of;
      if (snap && snap.state) {
        state = cloneState(snap.state);
        createdAtAnchor = (state.frontmatter && state.frontmatter.created_at) || null;
      }
      continue;
    }
    // tombstone은 순서 축의 표식일 뿐 상태를 바꾸지 않는다.
    if (record.kind === 'tombstone') continue;
    if (!record.patch || typeof record.patch !== 'object') continue;

    const hadCreatedAt = !!(state.frontmatter && state.frontmatter.created_at);
    state = mergeState(state, record.patch);
    if (!hadCreatedAt && !createdAtAnchor) createdAtAnchor = record.ts;
    if (createdAtAnchor) state.frontmatter.created_at = createdAtAnchor;
  }

  return state;
}

// 투영에서 배제된 레코드의 진단 목록. `journal verify`와 보고서가 소비한다 —
// "무엇이 왜 무시됐는가"를 답할 수 없으면 DD3의 "질의 가능한 이력"이 성립하지
// 않는다.
function projectionDiagnostics(records, opts) {
  const classified = classifyAll(records || [], opts || {});
  const excluded = [];
  let admitted = 0;
  for (const entry of classified) {
    if (entry.decision.verdict === ADMISSION.ADMIT) { admitted++; continue; }
    excluded.push({
      record_id: entry.record.record_id,
      work_unit: entry.record.work_unit,
      seq: entry.record.seq,
      verdict: entry.decision.verdict,
      reason: entry.decision.reason,
      superseded_by: entry.decision.supersededBy || null,
    });
  }
  return { admitted_count: admitted, excluded: excluded };
}

module.exports = {
  project: project,
  projectionDiagnostics: projectionDiagnostics,
  cloneState: cloneState,
  SNAPSHOT_KINDS: SNAPSHOT_KINDS,
};
