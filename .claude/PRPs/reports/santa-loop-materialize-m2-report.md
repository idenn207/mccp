# Implementation Report: santa-loop-materialize M2 — receipt 편입 + 소유권 표

**Plan**: [.claude/PRPs/plans/archived/santa-loop-materialize-m2.plan.md](../plans/archived/santa-loop-materialize-m2.plan.md)
(`plan_hash=sha256:c0a43a59…`, R9 `converged` 승인)
**구현 노트**: [.claude/notes/santa-loop-materialize-m2.md](../../notes/santa-loop-materialize-m2.md) — Codex/security 리뷰 기록 + 이탈 6건
**Branch**: `santa-loop-materialize`

## Summary

M1이 원장에 기록만 하던 라운드·집계를 receipt에 봉인했다. produces-only GATE_ID
`mccp-santa-review`(phase=`review`)를 신설하고, `/mccp:santa-loop`의 **두 종료 경로**
— NICE(push 직전) 와 캡 도달(`begin-round` exit 12 분기 안) — 에서 `seal`이 집계 리포트를
렌더해 그것을 subject로 receipt를 쓴다. 함께 `docs/santa-loop/ownership.md`가 P1·P2·P3의
파일 경계(교집합 ∅)와 M1 동결 시그니처를 확정해 세 자식 PRD의 병렬 착수 전제를 만들었다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 설계는 plan대로였고, 비용은 리뷰가 지목한 2건(단일 스냅샷·proof 경로 봉인)의 흡수에서 나왔다 |
| Files Changed | 13 (Files to Change) | 18 — plan 표 13 + 이탈 3(`ledger.js`·`schema.test.js`·`santa-loop-cap.test.js`) + 노트/리포트 2 |
| Tasks | 8 | 8 완료 |
| Test 항목 | 16 | 17 (plan 16 + `[17]` 스냅샷 일관성 — Codex F1 흡수) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | GATE_ID + phase 등록 | 완료 | `GATE_IDS` additive, `PHASE_FROM_GATE`=`review`, `ALIAS_MATRIX` 무변경 |
| 2 | `meta.santa_*` + `review_source` 불변식 | 완료 | 검사를 `reviewPresent` 가드 **바깥**에 배치. 잘못된 중첩으로 실증해 항목 5만 red가 되는 것을 확인 후 원복 |
| 3 | `santa/seal.js` | 완료 | 순수 3 + I/O 1. 원장 **1회 read** 스냅샷에서 전부 파생(Codex F1 흡수) |
| 4 | CLI `seal` subcommand | 완료 | dispatch 1줄 + `cmdSeal` + usage. 신규 exit code 0개 |
| 5 | `santa-loop.md` 배선 | 완료 | 봉인 2지점. `BEGIN_EXIT` 분기를 산문→실행 가능 bash로 전환 |
| 6 | 회귀 test 확정 + 커버리지 감사 | 완료 | 항목 4·6 추가, `[N]` 규약 + 감사 16/16 |
| 7 | 소유권 문서 | 완료 | 9경로 교집합 ∅ · 3부 구성 · heading ≤ 3 |
| 8 | 릴리스 표면 동기 | 완료 | 최종 `1.25.2 → 1.26.0` (plugin.json · html.js · markdown.js · CHANGELOG note). 착지 직전 §3.7 forward-only 상향으로 재번호 — 아래 D7 참조. PR 직전 main이 `1.25.1`을 M6에 발행해 M1을 `1.25.2`로 한 칸 더 밀었다. i18n test는 manifest 파생이라 무변경 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 1 gate 등록 | 통과 | `gate: true · phase: review · invasive: false` |
| 2 신규 test 2종 | 통과 | `santa-review-gate` 12 · `santa-seal` 10, fail 0 |
| 2b 기존 회귀 | 통과(주의) | receipt 567(566 pass·0 fail) · lib 1553(1544 pass·**3 fail — 전부 선재**) |
| 2c `santa-loop.md` 배선 5축 | 통과 | exit 0 — a~e 전부 true |
| 2d 커버리지 감사 | 통과 | 16/16 + 추가 `[17]`, exit 0 |
| 3 receipt corpus 전수 | 통과 | **receipts=48 · invalid=0** |
| 4 seal 왕복(실 원장) | 통과 | 아래 별도 절 |
| 5 소유권 구조 검사 | 통과 | exit 0 — heading ≤ 3 · 3부 앵커 · 교집합 ∅(P1 4·P2 3·P3 2) |

### 선재 실패 3건 (제 변경과 무관)

| 실패 | 근거 |
|---|---|
| `static lint passes on the real repo (approved writers only)` | 위반 지점이 `plugins/mccp/scripts/lib/plan-codex-runner.js:248` — 이번 브랜치가 **건드리지 않은 파일**이다. `seal.js`는 위반 목록에 없다 |
| `full gate: covered observation on the real repo passes every axis` | 위와 동일 근본 원인(같은 static-lint 축) |
| `dashboard-server.test.js` | Windows libuv 네이티브 abort (`src\win\fs-event.c:72`). 13개 중 12개 통과, 스위트 레벨 실패다 |

STATE.md가 main 승계 선재 red로 이미 기록한 항목들과 일치한다.

### Validation 4 — 실 원장 왕복 (캡 도달 경로)

`santa-loop-materialize-m1` 원장은 실데이터다(3라운드 전부 NAUGHTY, cap 3 소진).
이 봉인이 M2의 목적을 그대로 재현한다 — 캡에서 멈춘 실제 loop이 처음으로 receipt를 얻었다.

| 항목 | 값 |
|---|---|
| verdict | `divergent` (캡 소진은 NICE 미도달) |
| `meta.santa_*` | rounds 3 · entries 0 · cap 3 · exit_reason `cap_reached` — `aggregate()` 출력과 일치 |
| `review_proof.layers.l1` | `divergent` — `begin-round`가 거부했으므로 승인하지 않은 게이트를 승인했다고 적지 않는다 |
| schema | ok |
| 리뷰어 raw | 리포트·receipt 어디에도 없음 |

## Files Changed

| File | Action | 규모 |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/seal.js` | CREATE | 357줄 |
| `plugins/mccp/scripts/lib/tests/santa-seal.test.js` | CREATE | 407줄 |
| `plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js` | CREATE | 268줄 |
| `docs/santa-loop/ownership.md` | CREATE | 92줄 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | +51 |
| `plugins/mccp/commands/santa-loop.md` | UPDATE | +42/-1 |
| `plugins/mccp/scripts/lib/santa/ledger.js` | UPDATE | +41/-11 (이탈) |
| `plugins/mccp/scripts/receipt/tests/schema.test.js` | UPDATE | +35 (이탈) |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | UPDATE | +33/-11 (이탈) |
| `CHANGELOG.md` | UPDATE | +26 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | +19 |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATE | +12 |
| `plugins/mccp/scripts/receipt/aliases.js` | UPDATE | +4 |
| `plugins/mccp/.claude-plugin/plugin.json` · `renderer/html.js` · `renderer/markdown.js` | UPDATE | 각 1줄 (version) |
| `.claude/prds/santa-loop-materialize.prd.md` | UPDATE | M2 행 (선세션 반영분) |

## Deviations from Plan

plan 본문은 `mccp-plan-codex` receipt의 `plan_hash`에 바인딩돼 있어 구현 중 수정이 불가능했다
(`validate-cmd.js:304`가 재해시로 대조해 stale로 떨어뜨린다). 따라서 모든 이탈은
[구현 노트](../../notes/santa-loop-materialize-m2.md)와 여기에 기록한다.

| # | 이탈 | 근거 |
|---|---|---|
| D1 | plan의 `node --test <디렉토리>`가 Node 24.19에서 `MODULE_NOT_FOUND`로 죽는다 | glob 형태(`.../tests/*.test.js`)로 대체 실행 |
| D2 | `review_proof.reviewed_plan_hash`는 plan 표현("있으면")보다 강한 **필수** 계약 | `seal`이 항상 `planAwareMarkdownHash(리포트)`를 채운다 |
| D3 | `schema.test.js`의 generic gate 순회가 새 gate와 충돌 | fixture를 gate별로 보강 + 보강을 빼면 거부되는지 별도 단언으로 고정 |
| D4 | `ledger.js`가 Files to Change 밖 | Codex F1(HIGH) 흡수의 정공법. 순수 함수 2개 **추가**이고 기존 함수는 위임만 하므로 M1 동결 시그니처 무변경 |
| D5 | M1 test 2건이 "M2 미착륙"을 단언 | 지우지 않고 경계 이동 — "receipt 배선은 `seal.js`에만" + 의존 allowlist에 M2의 2개 명시 |
| D6 | `assertContained`가 realpath 기반이라 미존재 파일·`target===gate`에 못 건다 | 디렉토리를 대상으로, 부모를 gate로(`ensureStateDir` 동형). 파일명 안전성은 SLUG_RE가 경로 조립 이전에 담당 |

## Issues Encountered

- **Codex Implement-Codex R1 = `needs-attention` (HIGH 1)**: `seal`이 원장을 lock 없이
  N+2회 읽어 동시에 존재한 적 없는 상태를 봉인할 수 있다는 지적. 정확했고 R1 내에서 전량
  흡수했다 — `ledger.read()` 1회 스냅샷 + 순수 파생 2종. `codex_verdict`는 실제 라운드
  결과대로 `divergent`로 봉인했고(cap=1이라 재판정 없음), 그 결과 cross-gate dedupe가
  fail-closed로 남아 `/mccp:pr`에서 PR-Codex가 실제로 발화한다.
- **security-reviewer**: CRITICAL/HIGH 0건. MEDIUM 3 중 신규 실행 항목은 proof 경로
  미봉인(S1) 하나였고 흡수했다. 나머지 둘은 설계가 이미 정정한 축(cap 출처·검사 위치)으로,
  구현 충실도 문제라 별도 변경 없이 그대로 구현했다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js` | 12 | 항목 1·2·3·4·5·6·7 — gate 등록 · 왕복 · present-only 키 부재 · 비침습 · `review_source` 참칭 4케이스 · cross-model 미인정(+대조군) · hash 커버리지 |
| `plugins/mccp/scripts/lib/tests/santa-seal.test.js` | 10 | 항목 8~17 — proof 구조 · A-twice · raw canary · 읽기전용 3축 · NAUGHTY divergent · slug 거부 2종 · 원장 부재/손상 · 캡 도달 · cap 출처 · 스냅샷 일관성 |

**red 실증 2건** — 단언이 실제로 결함을 잡는지 확인했다.

1. `review_source` 검사를 `reviewPresent` 가드 **안**으로 옮기자 항목 5만 red가 됐다.
   위치 계약의 유일한 강제라는 plan의 주장이 실측으로 확인됐다.
2. `santa-loop.md` 배선 검사를 행 순서 비교로 두면 `fi` 바깥의 seal이 통과한다.
   `if`/`fi` 깊이 추적으로 바꾼 뒤 합성 fixture에서 그 우회가 `d=false`로 잡혔다.

## 후속 사이클 — PR-Codex finding 흡수 (2026-08-16)

M2 본 구현 이후 `/mccp:pr`이 M3 ship gate에서 PR-Codex `divergent`로 HALT했고, finding
2건이 남았다. 본 사이클은 그중 HIGH 1건을 흡수했다.

| Finding | Severity | 처리 | 근거 |
|---|---|---|---|
| F1 — 마지막 허용 라운드의 NICE가 divergent로 오봉인되고 그대로 push된다 | HIGH | **흡수** | §3.14 — CRITICAL·HIGH만 그 자리 흡수 |
| F2 — santa receipt가 원장 집계 없이 유효하다 | MEDIUM | **backlog 이연** | §3.14 — MEDIUM은 backlog 1줄 append |

### F1 — 무엇이 틀렸고 무엇을 고쳤나

`aggregateFrom`이 `rounds.length >= cap` **산술**로 종료를 되짚었다. 그 술어는 캡
*도달*(마지막 허용 라운드가 열린 상태)과 다음 `begin-round`의 *거부*를 구분하지 못한다.
그래서 캡을 정확히 채운 라운드가 NICE로 수렴해도 `exitReason='cap_reached'`가 서고,
`seal.js`가 이를 무조건 `divergent`로 굳혔으며, `santa-loop.md` Step 5.5는 `SEAL_EXIT`
(=0)만 보므로 그 receipt 위에서 push까지 갔다.

세 축을 함께 닫았다.

1. `ledger.js` — `beginRound` 거부 시 `state.terminated = {reason, at}`을 영속화한다
   (additive, `schema_version` 1 유지). 같은 사유의 재거부는 멱등이라 최초 거부 시각이
   보존된다.
2. `ledger.js#aggregateFrom` — `exitReason`을 그 마커에서만 파생한다. 마커 부재는
   "거부가 관측된 적 없음"이다. **구멍이 생기지 않는 근거**: 진짜 캡 소진은 반드시
   non-NICE 최종 라운드로 끝나므로 `deriveVerdict`의 `fin.verdict !== 'NICE'` 절이
   이미 잡는다.
3. `santa-loop.md` Step 5.5 — `$SEAL_JSON.verdict != converged`면 `exit 1`. 봉인은
   exit 0으로 성공하면서 divergent를 기록할 수 있으므로 종료 코드 분기만으로는 부족하다.

### 회귀 test는 반증력을 실증했다

`[18]`(마지막 허용 라운드 NICE → converged)을 **옛 산술 파생으로 되돌려 실행해 실패를
확인**한 뒤 복원했다. 이 repo에서 "미작성/무반증 test"가 반복 지적된 축이라, 통과만이
아니라 실패도 관측했다.

| Test | 파일 | 무엇을 강제하나 |
|---|---|---|
| `[18]` | `santa-seal.test.js` | 마지막 허용 라운드 NICE가 converged + `l1=converged` + exit reason 부재 |
| 종료 마커 (2건) | `santa-loop-cap.test.js` | 거부가 마커를 기록한다(라운드는 불변) · 재거부 멱등(`at` 불변, byte 불변) |
| Step 5.5 배선 | `santa-loop-cap.test.js` | slice 안에서 verdict 파생 → 분기 → 종료문이 존재하고 push보다 앞선다 |

기존 `[15]`는 fixture가 거부를 **명시**하도록, `[16]`은 종료가 라운드 수·env 어느
쪽으로도 만들어지지 않음을 단언하도록 갱신했다. `[15]`↔`[18]`은 라운드 수·cap이 같고
**마커 유무와 최종 verdict만** 다른 짝이라, 파생이 산술로 회귀하면 둘이 갈리지 않는다.

### 본 사이클의 Validation

| 검사 | 결과 |
|---|---|
| santa 4파일 (`node --test`) | 79 tests · pass 76 · **fail 0** · skip 3 (POSIX 전용) |
| receipt 스위트 전체 (`receipt/tests/*.test.js`) | 614 tests · pass 613 · **fail 0** · skip 1 |
| plan 2c 배선 5축 | a~e 전부 true · exit 0 |
| plan 2d 커버리지 | **16/16** · extra `[17]`·`[18]` |
| plan 3 receipt corpus 전수 | receipts=51 · **invalid 0** |
| plan 5 소유권 문서 구조 | heading≤3 · 3부 · 교집합 ∅ 전부 true |
| plan 4 실 원장 왕복 | **미실행** — 아래 참조 |

### 이번 사이클의 이탈 (의도된 것)

- **plan 4(실 원장 왕복) 미실행**: 원장은 UI4대로 gitignored인데 워크트리가 갱신되며
  소실됐다. `status`는 `{rounds:0,...}`로 정상 응답한다. 없는 원장에 `seal`을 돌리면
  이 decision에 divergent를 주장하는 실 receipt가 생기므로 **일부러 돌리지 않았다** —
  해당 경로는 test `[14]`(missing ledger → empty-but-honest divergent)가 덮는다.
- **plan 미아카이브**: command Phase 5는 `completed/`로 이동을 지시하지만, 그러면
  `--plan` 경로가 사라져 `/mccp:pr`의 chain 재해시가 "cannot read plan to re-hash"로
  stale이 된다. 아카이브는 §3.11대로 PRD 종료 후 `/mccp:archive-complete` 몫이다.
- **Codex Implementation Review 섹션을 plan이 아니라 `.claude/notes/`에 작성**: plan
  본문 편집은 `plan_hash`를 바꿔 `mccp-plan-codex` receipt를 stale로 만든다
  (`validate-cmd.js:365-373`, blocking). command 2.5.4가 허용하는 대체 목적지를 썼다.
- **version 무변경(`1.26.0`)**: PR이 아직 생성되지 않아 1.26.0은 미출시다. 같은
  milestone의 미출시 교정이므로 새 번호가 아니라 그 CHANGELOG 항목에 접었다.

### 후속 — `/mccp:code-review` 흡수 (같은 사이클)

F1 교정을 커밋하기 전 로컬 리뷰를 돌렸고, **그 교정이 도입한 결함**을 잡았다. 마커
기반 파생이 산술 파생의 오봉인을 다른 형태로 재현한 것이라 같은 자리에서 닫았다.

| Finding | Severity | 처리 |
|---|---|---|
| H1 — 거부 마커가 판정을 영구 낙인으로 만든다 | HIGH | 흡수 |
| M1 — 거부가 원장 `cap`을 env 값으로 덮어쓴다 | MEDIUM | 흡수(같은 코드 경로) |
| M2 — implement 노트가 untracked | MEDIUM | 흡수(커밋 포함) |
| L1 — `terminated` 미검증 · L2 — 없는 린터 참조 | LOW | 흡수 |

H1의 재현 경로는 둘이고 **둘 다 실측**했다. ① 이미 수렴해 봉인된 slug에
`/mccp:santa-loop`를 재진입하면 Step 3의 정상 캡 거부가 마커를 써서, 재봉인이
converged receipt를 divergent로 덮었다(`1차=converged → 2차=divergent`). ② 캡을
상향해 루프를 재개하면 그 뒤의 수렴까지 종료로 읽혔다. 같은 스크립트를 교정 후
재실행해 `2차=converged`로 뒤집히는 것을 확인했다.

교정은 세 층이다 — `deriveVerdict`가 마커를 **입력으로 받지 않고**(라운드에서만
판정), `beginRound`가 라운드를 열 때 마커를 **지우며**, `aggregateFrom`이 현재 라운드
수에 **결속된** 마커만 종료로 읽는다. 마커의 몫은 판정이 아니라 "왜 끝났는지"이고,
그 투영(수렴 = 캡이 끝낸 것이 아니다)은 `seal()`이 한다.

MEDIUM 2건을 §3.14의 backlog 이연이 아니라 그 자리에서 고친 이유: M1은 H1과
**같은 함수·같은 커밋이 만든 결함**이고(거부 분기가 write를 하게 되면서 열렸다),
M2는 코드가 아니라 커밋 범위 문제다. 새 축을 여는 것이 아니라 이번 교정의 잔해를
치우는 것이라 backlog로 미루면 부채가 아니라 미완성이 된다.

Validation: santa 3파일 73 tests · pass 70 · **fail 0** · skip 3(POSIX 전용) ·
santa 연관 receipt 4스위트 121 tests · **fail 0**.

## Next Steps

- [ ] `/mccp:prp-commit` → `/mccp:pr` 재실행
- [ ] PR 시 PR-Codex가 실제로 발화한다 (santa/multi-agent 어느 쪽도 cross-model 미인정)
- [ ] 잔여: F2(MEDIUM)는 backlog 이연 · 승인 라운드 MEDIUM 2건 중
      `/mccp:santa-loop` end-to-end test 부재는 미해소 — STATE.md Open Questions 참조
