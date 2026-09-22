# Implementation Report: review-record-linkage M7 ship 구간 (`-m7c`) — T3 implement gate

## Summary

plan의 Task 3(implement 게이트)만 수행했다. 이 사이클의 새 코드는 **0줄**이다 — M7 구현
(`--check-live-linkage` 강제 뷰)은 `202d49b` · `5b3935c`, M5 구현(install-skew)은 `65bbbc5` ·
`ea1a4f4`에서 이미 착지했다. Phase 3은 어떤 Task도 실행하지 않았고 `claude -p` 하위 세션도 띄우지
않았다(plan의 Task 1~6은 전부 오케스트레이터 작업이다). 산출물은 implement 리뷰 기록 ·
`mccp-implement-codex` receipt · 이 보고서 셋이다. 커밋은 하지 않았다(Task 4가 명시 경로로 커밋한다).

- plan 파일: 무변경 — `planAwareMarkdownHash` = `sha256:e603253f…` = plan receipt = implement receipt
- implement 리뷰 절: `.claude/notes/review-record-linkage-m7c-implement-review.md` (K2 — plan 동결)
- receipt: `.claude/receipts/mccp-implement-codex/review-record-linkage-m7c.json` · `codex_verdict=converged` · `round_cap=1` · `head_sha=a26e680`

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small |
| Confidence | — | 게이트 산출물 3건 전부 디스크에서 확인 |
| Files Changed (이 단계) | notes 1 · report 1 · receipt 1 (+ backlog 적재) | 동일 — 신규 2, 갱신 1(`codex-findings-backlog.md` 1줄), receipt 1(working-tree only) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 브랜치와 산출물 준비 | 이 단계 범위 밖 | 오케스트레이터 (앞 단계에서 완료) |
| 2 | plan 게이트 1라운드 | 이 단계 범위 밖 | 앞 단계에서 완료 — plan receipt `review_verdict=divergent`(single-pass 봉인) |
| 3 | implement 게이트 | [done] Complete | 이 보고서의 대상 |
| 4 | ship 전 체인 확인 | 미실행 (오케스트레이터) | 검사 4는 Phase 4에서 read-only로 미리 돌려 통과 |
| 5 | ship | 미실행 (하위 세션) | — |
| 6 | acceptance | 미실행 (오케스트레이터) | ship 뒤에만 성립 |

## Implement-Codex gate

| 항목 | 값 |
|---|---|
| Codex | `classification=ok` · 구조화 verdict `approve` · finding 0건 · 67s · threadId `01a0c7da-fe7c-7712-99bd-32a386b46257` |
| 리뷰 대상 | `branch diff against origin/main` (`--base origin/main` — 아래 Deviations 1) |
| 라운드 | 1 / cap 1 (봉인 `enforce`, 원장 `rounds_so_far=1`) |
| security-reviewer | CRITICAL/HIGH 0건 · LOW 1건 backlog 이연 (매핑된 네트워크 드라이브 문자가 UNC 검사 통과) |
| impeccable | `skill_available=true` · `design_signal=false` → silent-skip(`no-signal`) |
| 2.5.7 validate | exit 0 — missing/stale/blocking/open_critical 전부 0 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | 저장소에 `package.json`·type-check 스크립트 없음, 새 코드 0줄 |
| Unit Tests | [done] Pass | 착지 코드 6파일 190 pass / 0 fail (`MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2`) |
| Build | N/A | 빌드 단계 없음 |
| Integration | N/A | |
| Edge Cases | 아래 plan `## Validation` 검사표 | |

plan `## Validation` (Phase 4가 돌리는 검사 1·2·3·4·7):

| 검사 | 결과 | Notes |
|---|---|---|
| 1 정체성 | 부분 — branch·plan slug 통과, **L1 `divergent`** | 위반 2건 모두 `C3_CREATE_EXISTS` — T2가 만든 `.claude/reviews/plan-review-review-record-linkage-m7c.md`·`.claude/state/findings/review-record-linkage-m7c.jsonl`이 이제 존재한다. 검사 1은 Task 1(T2 이전) 검사라 T2 이후엔 구조적으로 이 두 건이 난다. plan receipt의 `review_proof.layers.l1`은 봉인 시점 `converged`. 회귀 아님 (Deviations 2) |
| 2 plan receipt | [done] Pass | `plan_path`·`record`·`source=multi-agent`·`hash` 전부 true · plan 원장 `rounds_so_far=1` |
| 3 동결 | [done] Pass | plan 해시 = plan receipt = implement receipt, 리뷰 절은 notes에만 |
| 4 ship 전 체인 | [done] Pass | `validate --command mccp:pr` stale 0 · blocking 0 · missing 0 · ship 슬러그 = `review-record-linkage-m7c` |
| 7 version·삭제 | [done] Pass | `version-declaration-guard` ok(선언 없음) · `--diff-filter=D` 0건 |

검사 5·6은 plan의 `## 오케스트레이터 검사` 소관이라 돌리지 않았다.
plan-conflict 검출(`plan-conflict-detector.js`): `conflict=false` · ship diff 40파일 전부 `Files to Change` 표 안.

### Design Grounding

Design Grounding: N/A (no design trigger — silent-skip `no-signal`, capture 산출물 없음)

## Files Changed (이 단계)

| File | Action | Lines |
|---|---|---|
| `.claude/notes/review-record-linkage-m7c-implement-review.md` | CREATED | +54 |
| `.claude/PRPs/reports/review-record-linkage-m7c-report.md` | CREATED | 이 파일 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | +1 (security LOW) |
| `.claude/receipts/mccp-implement-codex/review-record-linkage-m7c.json` | CREATED | working-tree only (git 미추적 경로) |

작업 트리에는 이 단계가 만들지 않은 변경이 둘 더 있다 — `.claude/state/STATE.md`(SessionStart·receipt 훅의 갱신)와
`.claude/state/fix-task-applied.md`(Stop hook 산출물). 둘 다 손대지 않았다.

## Deviations from Plan

1. **Codex 호출에 `--base origin/main`을 붙였다.** 명령 본문 2.5.3의 호출에는 `--base`가 없고 companion의 기본
   스코프는 `auto`다. 작업 트리가 dirty(`fix-task-applied.md`)라 `auto`는 working-tree diff — 훅 상태 파일 하나 — 만
   리뷰하게 된다. cap 1인 유일한 라운드를 ship diff에 쓰려고 wrapper의 문서화된 옵션을 붙였고, companion이
   `target.mode=branch · explicit=true`로 그것을 확인했다.
2. **검사 1의 L1 다리가 `divergent`다.** 원인은 `C3_CREATE_EXISTS` 2건이고 둘 다 T2 산출물이다. 검사 1은 Task 1의
   Validate이므로 이 단계의 실패 신호가 아니다. plan은 동결돼 있어 검사를 고치지 않았다.

## Issues Encountered

- `installed_plugins.json` sha256 현재값 `a3d22d5f0425da43dd00c4e7eb94b19f3507ffd507ed72d6154765a6ca555a46`.
  Task 1이 **새로** 기록한 값은 이 워크트리 디스크에서 찾지 못했다(M7 보고서의 `26925fd8…`는 M7 Task 0 값이다).
  UI3 대조는 Task 6(오케스트레이터)이 자기가 기록한 값으로 한다.
- receipt write가 `[mccp:single-pass] chain drift` 경고를 냈다 — 이 게이트는 토글 OFF로 돌았고 plan receipt는
  `scope_too_small`을 봉인했다. DD8대로 차단하지 않으며 각 receipt가 자기 시점 상태를 봉인한다.
- Stop hook이 주입한 fix-task(plan-codex divergent → santa-loop 요구)는 지시대로 기록만 하고 처리하지 않았다.

## Tests Written

없음 — 새 코드 0줄. 착지 코드의 테스트는 `-m7b`·M5 사이클이 소유한다.

## Next Steps

- [ ] Task 4 (오케스트레이터): T3 산출물을 명시 경로로 커밋하고 체인을 다시 읽는다
- [ ] Task 5: `/mccp:pr` (FREEZE 포함) — plan receipt가 `divergent`라 cross-gate dedupe는 닫혀 있고 PR-Codex가 발화한다
- [ ] Task 6: `linkage-audit.js --check-live-linkage --decision review-record-linkage-m7c` exit 0 확인 + sha256 대조

## T5 1라운드 — PR-Codex 비승인과 R-PR (2026-09-22 · 오케스트레이터)

- **첫 시도 중단**: 하위 세션이 codex-runner를 백그라운드로 띄운 채 턴을 끝냈다. `-p`는 턴 종료가 곧 세션 종료라 runner가
  함께 죽었다(`codex-result.json` 0바이트 · 라운드 원장 미생성 → 예산 미소모). 잔존 `pr-phase.lock`은
  `detect-stale`(`same-host-dead-pid`)로 회수했다. 이 시도에서 `pr-phase-guard`가 `/tmp` 쓰기 Bash 1건을
  거부했다 — plan 검사 5 기준 deny 목록 밖이다(`t5-pr-attempt1`).
- **재시도 = 1라운드**: runner 포그라운드 · `--base "main"`(로컬 main이 origin/main보다 134커밋 뒤 — 범위 부풂).
  PR-Codex `needs-attention` · HIGH 1건 **F1**: `judgeShipLinkage`가 ship receipt digest를 재계산하지 않아 봉인 뒤
  편집된 receipt가 옛 hash와 backlink로 acceptance를 통과한다. 원장 1/1.
- **같은 실행의 lock 회수** — `.claude/state/pr-phase-lock-stale-reclaimed.json` 원문(06:59 판독):
  `{"reclaimed_at":"2026-09-22T06:55:21.979Z","former_run_id":"74a075ad-cd41-4b98-bf9c-55122b3480bb","former_pid":35809,"former_host":"devbox","reason":"same-host-stale-imposter"}`.
  이 마커는 이후 오케스트레이터가 돌린 test 실행 중 사라졌다 — `finalize-receipt.js`의 `consumeStaleReclaimMarker`가
  `args.cwd || process.cwd()`로 경로를 정하므로, `--cwd` 없이 finalize를 부르는 test가 실제 워크트리의 마커를 소비한 것으로
  추정한다(미검증 · backlog). 결과적으로 2라운드 receipt에는 1라운드 회수가 찍히지 않는다.
- **R-PR**(HSR — `docs/review-record-linkage/hsr-decisions.jsonl`): Fable `halt` · Codex `halt` → **`halt`**. 둘 다 F1
  흡수안은 옳다고 봤고, lock heartbeat 결함이 마지막 라운드를 receipt 없이 소진시킬 공산이 크다는 것이 이유였다.
- **사람 판정 (2026-09-22)**: heartbeat를 먼저 고치고 → `--base origin/main` → F1 흡수 → pr 게이트 캡 2로 재실행.
  heartbeat 수정은 어떤 HSR 선택지에도 없던 것이라 이 판정이 허용한다.

### heartbeat 근본 원인 — 한 번도 박동하지 않았다

`codex-runner.js` 진입부가 `process.exit(main(argv))`였다. heartbeat 모드의 `main`은 `setInterval`만 걸고
`undefined`를 돌려주므로 자식이 **첫 박동 전에 exit 0**했다. 임시 저장소 재현: 자식 즉시 종료 · lock mtime 갱신 0ms ·
stderr 없음. lock CLI의 heartbeat를 직접 부르면 정상이다 — 결함은 자식의 진입부다. 그래서 60s lease를 넘는 모든
리뷰가 `pr-phase-guard`의 stale 회수를 맞았다(backlog 2026-09-14~15 `same-host-stale-imposter` 4행 + 이번 1건).
수정: `undefined`면 exit하지 않는다 · spawn timeout throw가 자식을 같은 방식으로 죽이지 않게 틱 단위로 삼킨다.
회귀 test는 lock mtime을 과거로 민 뒤 자식이 살아서 되돌리는지를 본다 — 수정을 빼면 `heartbeat child exited before
beating`으로 붉어진다.

### F1 흡수

`judgeShipLinkage` 맨 앞에 봉인 검사(`check:'seal'` · `reason:'receipt_digest_mismatch'` — 레코드 쪽
`receipt_hash_mismatch`와 다른 값). fixture는 실제 digest로 봉인하고 의도적 미봉인·불일치만 명시한다(두 리뷰어의
MEDIUM). S1의 레코드 null 축은 별도 test로 보존했다. 봉인 검사를 빼면 F1 test와 S1 test가 붉어진다. tracked ship
receipt 104건 전부 `receiptHash(body) === receipt_hash`라 기존 ship을 오판하지 않는다.

### Validation (2026-09-22)

- `linkage-audit.test.js` 73/73 · runner·lock·guard 214/214 · linkage·install-skew·state-writer 214/214
- `installed_plugins.json` sha256 (Task 1 기록값) `a3d22d5f0425da43dd00c4e7eb94b19f3507ffd507ed72d6154765a6ca555a46`

## T5 2라운드 — 비승인, cap 2/2 소진 (2026-09-22)

- 캡 2 · runner 포그라운드 · `--base origin/main`(명령 본문 이탈 1건, 하위 세션이 기록). 07:18:14Z → 07:20:24Z · runner exit 1.
- PR-Codex `needs-attention` · HIGH 1건 **F2**(새 축): `--check-live-linkage --decision <slug>`가 ship receipt를 **파일명으로만**
  고른다(`linkage-audit.js:1061`). 링크된 receipt를 `target.json`으로 복사하면 digest·backlink가 유효한 채 `ok`가 난다.
  권고: 봉인된 `decision_id`가 슬러그와 같고 `gate_id`가 `mccp-pr-codex`인지 검사 + 복사 회귀 test.
- lock이 **다시** 회수됐다(07:19:16Z · 시작 62s 뒤). e5f6d80의 진입부 수정만으로는 부족했다 — 두 번째 원인은 token EOF
  대기였고(backlog 같은 날 HIGH 행), R2 뒤에 고쳤다. **그 수정은 PR-Codex가 보지 않았다.**
- 원장 `mccp-pr-codex__review-record-linkage-m7c` = 2/2. DD11 규칙 3상 같은 슬러그의 3라운드째는 HSR 권한 밖이다.
- 전역 규칙(cap 도달)대로: 미해소 finding을 backlog에 적재했고(하위 세션 2행 + 오케스트레이터 1행), **receipt 없음 —
  cap 도달, 반영분 미재검증.** M7은 complete가 아니다(`--check-live-linkage --decision review-record-linkage-m7c` → exit 3).
