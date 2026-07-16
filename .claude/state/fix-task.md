# Fix Task — 흡수 완료 (PR-Codex 6R + Implement-Codex 7R)

- **Status**: **ABSORBED** — 4건 전부 ACCEPT_NOW 반영, backlog 이연 0. 다음은 `/mccp:pr`(7라운드).
- **Decision**: `live-activation-m3-pr-codex-absorption` (유령 슬러그 `v1-22-3-live-activation-m3`에 receipt 미작성 — 아래 참조)
- **Gate 경로**: `/mccp:prp-implement --apply-fix-task` → Implement-Codex R1 = **CRITICAL** → 2.5.5 GATE-STOP → 사용자 설계 결정(A + debt decay) → Phase 3 EXECUTE.

## 무엇이 문제였나 (한 줄)

**cap은 병렬 fleet worker만 세고 있었다.** 예약이 `resolveFleet` 안에서만 일어나는데
`resolveFleet`은 work.md의 4중 가드 뒤에서만 실행되고, Step 3.route는 **무조건** 돌며
`task`/`workflow-single`로 worker를 띄웠다 — 예약 없이. default 단일 worker 구성에서
`launched`는 **영원히 0**이었고, "모든 agent launch는 기록된다"는 한 번도 참이 아니었다.

A/B 실측 (cap=4, `/mccp:work` 9회):

| | agents spawned | `counter.launched` | 결과 |
|---|---|---|---|
| BEFORE | 9 | **0** (카운터 불변) | cap 5 초과 |
| AFTER | 4 | 4 | cap 유지 |

## 적용한 수정

| # | 축 | 내용 |
|---|---|---|
| 6R F1 | `work.md` · `plan.md` | 리터럴 `= "lock-exhausted"` → 구조적 술어 `run===false ∧ runawayReason != null`(이유-비특정). 세 번째 zero-grant 이유가 생겨도 안 열린다. |
| 7R F1 | `work.md` Step 3.route · `route.js` | **예약을 공통 pre-launch 경계로 이동**. fleet 예약 부재 ∧ `requiresReservation($ROUTE)` → `reserve --n 1` → `granted:0`이면 `ROUTE=inline`, 아니면 `--actual 1` 즉시 commit. commit 실패는 HALT(pre-launch라 un-spawn할 게 없음). |
| 7R F2 | `plan.md` 2.5.2 | **Workflow 호출 직전 debt pin**(신규 `mark-debt` CLI). pin 실패 → Workflow 미호출 → 인라인 Pattern Grounding. "started 마커" 초안은 폐기(`readCounter`가 debt만 존중하므로 사후 핸들러를 놓치면 무의미). Codex 대안 `actual=granted` commit도 거부(commit은 영구 → 영구 유령 재도입). |
| decay | `orchestration-runaway.js` | `MCCP_ORCHESTRATION_DEBT_DECAY_HOURS`(default 6, `cost-state#decayIfStale` 미러). pin이 만든 영구 자기중독을 시간축으로 해소. `readCounter`/`reconcileReservation` 동일 판정 공유. `=0`은 유효 kill switch(lease의 0과 대조 — debt의 0은 보수적). |
| preview | `orchestration-preview.js` | route가 런타임에 inline으로 강등될 수 있게 됐으므로 preview도 **순수** `clampForRunaway(1)`로 투영 → `single_reserve_denied` 노출. 안 했으면 cap 소진 세션에 "task가 뜬다"는 **false green-light**(M2 F1이 막으려던 유형). |

## 검증

- **blast radius 전수**: 변경 모듈 importer를 기계적으로 색출(테스트 3 + 비-테스트 소비처 4 `auto-chain`/`budget`×2/`preview`) → 9개 파일 **313/313 pass**.
- 신규 테스트 16개: debt decay 6 · `reserve` CLI 3 · `mark-debt` 2 · `requiresReservation` 4(**ROUTES enum 전수** — "새 enum + 미갱신 소비처" 재발 방지) · preview 투영 3.
- `work.md`/`plan.md` 편집 블록 `bash -n` 정상.
- A/B 실측(위 표) + preview↔발화 일치 실측(cap 소진 → 양쪽 모두 inline).
- **전체 스위트는 미완주** — 이 환경에서 1133개가 600s를 초과한다(일부 테스트가 실 프로세스 + 60s briefing timeout을 태움; `evaluateForDedupe` 하나가 5–8초). 제 변경과 무관한 환경 제약이라 blast radius 전수로 대체했다. 정직하게 기록한다.
- pre-existing 실패 2건 불변·무관: `verdict-label metric (F1)`, `design-critique-loop-e2e F) fixture` — 둘 다 diff에 없고 변경 모듈을 import하지 않는다.

## 주의 — 유령 슬러그 (다음 `/mccp:pr` 진입 시)

hook이 `--apply-fix-task`에 대해 decisionId를 브랜치명 `v1-22-3-live-activation-m3`로 파생하고
"`mccp-plan-codex` 없음"을 보고했다. **실제 chain은 green**(`live-activation-m3-pr-codex-absorption`
validate `ok:true`). 그 유령 슬러그에 receipt를 쓰면 다음 `/mccp:pr`의 derive-decision이
"브랜치 슬러그에 receipt 있음"으로 판정해 기존 3개 receipt를 orphan시키고 dedupe를 다른 결정으로
재라우팅한다 → **쓰지 않았다.** 전 구간 실제 슬러그를 명시했다.

## 남은 것

- `/mccp:pr` 7라운드 → PR-Codex 재판정. dedupe는 여전히 fail-closed(양 게이트 `divergent`)라 PR-Codex 실발화 예상.
- plugin.json은 `1.22.3` 유지 — 같은 milestone 안의 흡수 follow-up(4·5라운드 선례와 동일).
