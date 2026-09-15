# Implementation Report: orchestrator-step-wiring M4 — live-integrity-repair

## Summary

M3 머지 뒤 라이브에서 다시 드러난 네 가지 결함을 고쳤다.

1. **test가 실 공유 corpus를 오염시키던 문제**: test를 격리했고(Task 1), 이미 들어간 6줄은 격리 디렉토리로 옮겼다(Task 2).
2. **위치마다 A1 값이 갈리는데 아무 신호가 없던 문제**: 사적 데이터를 가진 위치의 `a1` 배너가 조건부 둘째 줄로 그 사실과 수렴 방법을 알린다(Task 3).
3. **`record-halt`의 `work_unit` 절대경로 누출**: 쓰기 전에 좁힌다(Task 4).
4. **`a1` 실패 경로의 절대경로 누출**: 메시지에서 경로를 좁힌다(Task 5).

이 PRD 축의 backlog 잔여는 근거와 함께 처분했다(Task 6).

## Gate 경위

| 게이트 | 결과 | 비고 |
|---|---|---|
| plan (`mccp-plan-codex`) | **divergent · audited override** | hybrid 캡 1/1에서 L3 Codex가 divergent. 리뷰 뒤 plan 편집으로 해시가 바뀌어(`4284fe…` → `352e84…`) DD13 가드가 hybrid proof 봉인을 거부했다. 사용자 결정으로 `MCCP_SKIP_INTENT_GATE` + `--codex-verdict divergent`로 봉인했다(override만 쓰면 `isConvergedVerdict=true`로 읽혀 converged 위장이 된다 — 실측) |
| implement (`mccp-implement-codex`) | **divergent · R1 흡수** | Codex R1 `needs-attention` HIGH 1(격리가 기존 격리본을 덮어씀) → ACCEPT_NOW, Task 2에서 no-clobber로 흡수 |
| security-reviewer | HIGH/CRITICAL 0 | MEDIUM 1은 Codex F1과 동일(흡수), LOW 2는 backlog |
| design (impeccable) | silent-skip `no-signal` | 렌더링 표면 없음. Phase 3.6 skip, 3.7 no-op |

두 receipt 모두 `codex_verdict=divergent`라서 cross-gate dedupe가 닫혀 있다. `/mccp:pr`에서 PR-Codex는 반드시 발화한다. 게이트 기록 원문은 `.claude/notes/orchestrator-step-wiring-m4.md`에 있다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small (게이트 복구에 시간이 더 들었다) |
| Confidence | — | 높음 — 새 test 8건 전부 수정 전 red를 확인했다 |
| Files Changed | 9 | 코드·test 7 + backlog + PRD 행 (+ 게이트 notes · report 신규) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | test가 실 공유 corpus에 쓰지 않게 한다 | [done] Complete | 반증: 사본에서 `cwd`만 되돌리면 red(`test-*.jsonl` 생성 → 확인 후 정리) |
| 2 | 이미 들어간 오염을 격리한다 | [done] Complete | Deviated — `renameSync` → `link(2)` + unlink(no-clobber) + regular-file 검사. 6줄 이동, sha 일치 |
| 3 | 이 위치에서만 보이는 A1 이벤트를 배너가 말하게 한다 | [done] Complete | Deviated — 키 구분자를 NUL 대신 `id:`/`legacy:` 접두로 바꿨다(동일성 판정은 마이그레이션 `keyOf`와 같다) |
| 4 | `record-halt`가 `work_unit`을 좁혀서 쓴다 | [done] Complete | 라이브: `--work-unit "/home/x/leak"` → `<outside-repo:leak>` |
| 5 | `a1` 실패 경로가 절대경로를 흘리지 않는다 | [done] Complete | |
| 6 | 처분을 기록한다 | [done] Complete | 기존 행 7개에 표식, 신규 행 4개(+ security LOW 1행). PRD 행에 report 링크 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | type-check·lint 스크립트 없음(루트 `package.json` 없음). 구문은 아래 test가 모듈을 로드하며 확인 |
| Unit Tests | [done] Pass | Validation 1 8파일 **197 pass / 0 fail** (`MCCP_CODEX_DISABLED=1 --test-concurrency=2`) |
| Build | N/A | 빌드 단계 없음 |
| Integration | [done] Pass | 라이브 Validation 3을 세 시점에 측정(아래) |
| Edge Cases | [done] Pass | no-clobber 반증(임시 디렉토리) · record-halt 라이브 · test 실행 후 `test-*.jsonl` 0개 |

가드: `version-declaration-guard` ok(선언 없음) · `env-contract/lint.js` L1~L12 ok · backlog 파서 `invalid_count: 0`(1751행).

### Design Grounding

Design Grounding: N/A (디자인 trigger 없음 — `design_signal=false`, capture artifact 없음).

### 라이브 A1 배너 (Validation 3)

| 시점 | cwd | main | c2 | c3 |
|---|---|---|---|---|
| 코드 전 | c2 | 3/16 | 3/16 | 3/15 |
| Task 3 후 · Task 2 전 | c2 | 3/16 · **이 위치에만 15건** | 3/16 · **15건** | 3/15 · **11건** |
| Task 3 후 · Task 2 전 | /tmp | 2/14 · 한 줄 | 3/16 · **15건** | 3/15 · **11건** |
| Task 2 후 | /tmp | 2/14 · 한 줄 | 3/16 · **15건** | 3/15 · **11건** |
| 마이그레이션 후 | /tmp | **5/24 · 한 줄** | **5/24 · 한 줄** | **5/24 · 한 줄** |

- **cwd 의존성 발견**: `.worktrees/<wt>`는 main root 경로 안에 있다. 그래서 cwd=c2에서 `--repo-root main`을 돌리면 CL-5 back-compat(`cwdInsideRepo`)이 c2의 local corpus를 main 스캔에 넣는다. plan의 스니펫 그대로(cwd=worktree) 재면 main이 c2와 같은 값을 낸다. 그래서 중립 cwd로 다시 쟀다. 이 문제는 원래 있던 결함이라 backlog에 올렸다.
- **Task 2 후 분모 감소는 0이었다.** Acceptance는 감소를 기대했지만 실측은 달랐다. 원인을 조사하니 test가 쓴 work_unit(`c3-ci-full-suite` · `ci-full-suite-m4`)이 실 세션의 슬러그와 같았다. 실 세션 이벤트가 shared 5 · c2 local 3 · c3 local 12건이라 distinct 작업 단위 집합이 늘지 않았다. 오염은 이벤트 수에만 있었고, test가 다른 브랜치에서 돌았다면 유령 단위가 됐을 것이다.
- **마이그레이션**: dry-run은 43줄이었고 실행 시 44줄이 추가됐다(그 사이 이 세션 활동으로 1건이 늘었다). 재실행 dry-run은 `new_lines=0`이다. 마이그레이션 직후 세 위치가 같은 값으로 수렴하고 둘째 줄이 사라진 것은 DD3의 동형 검증이다. 마이그레이션이 옮기는 키와 신호가 세는 키가 같다는 뜻이다.
- **구조적 한계(DD2)**: 사적 데이터가 없는 위치(마이그레이션 전 main)는 신호를 띄우지 않는다. 설치 cache(`1.33.6`)가 여전히 local에 쓰므로 이벤트가 쌓이면 값은 다시 갈린다. 그때는 사적 잔여를 가진 위치의 배너가 이를 말하고, 근본 해소는 C0 릴리스 컷이다.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/hooks/tests/receipt-prompt-submit.test.js` | UPDATED | +26 / -8 |
| `plugins/mccp/scripts/derive/sources/session-activity.js` | UPDATED | +24 |
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATED | +9 / -4 |
| `plugins/mccp/scripts/lib/msw-metrics/cli.js` | UPDATED | +15 / -3 |
| `plugins/mccp/scripts/lib/work-orchestrator.js` | UPDATED | +4 / -2 |
| `plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js` | UPDATED | +130 |
| `plugins/mccp/scripts/lib/tests/work-halt-record.test.js` | UPDATED | +21 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | 표식 7 · 신규 행 5 |
| `.claude/prds/orchestrator-step-wiring.prd.md` | UPDATED | M4 행 report 링크 |
| `.claude/notes/orchestrator-step-wiring-m4.md` | CREATED | +44 (게이트 기록) |

데이터 작업(git 밖): `<git-common-dir>/mccp/msw-events/s1.jsonl` → `.quarantine/s1-2026-09-14.jsonl`, 마이그레이션 44줄.

## Deviations from Plan

1. **Codex Implementation Review를 plan이 아니라 notes에 썼다.** `receipt/hash.js`에 섹션 carve-out이 없어서, plan에 쓰면 방금 봉인한 plan receipt가 stale이 되고 2.5.7이 막힌다. plan 이연 표의 "prp-implement 2.5.4 stale화"와 같은 축이다.
2. **실행 순서를 Task 1 → 3·4·5 → 2로 바꿨다.** Acceptance의 "Task 2 전 둘째 줄"은 Task 3 코드가 있어야 관측되기 때문이다.
3. **Task 2 스니펫에 no-clobber를 넣었다**(Codex F1 · security MEDIUM). 임시 디렉토리에서 반증했다: 대상이 있으면 exit 1이고 두 파일 sha가 불변이다.
4. **Task 3의 키 구분자.** 도구 인자에서 `'\0'` 이스케이프가 실제 NUL로 바뀌어 편집이 실패했다. 그래서 `id:`/`legacy:` 접두를 썼다. 첫 글자가 달라 충돌하지 않고, 무엇을 같은 이벤트로 보는지는 같다.
5. **Validation 3을 중립 cwd로도 측정했다.** 이유는 위의 cwd 의존성이다.
6. **(f) test를 `strictEqual`로 좁혔다.** 느슨한 `equal`이면 필드가 없는 수정 전 코드도 통과해 반증력이 없었다.
7. **PRD M4 status는 `in-progress`로 두었다.** 이 저장소 관례상 머지 뒤 `/mccp:milestone-close`로 닫는다(M3 선례 `e7f1855`). 명령 본문의 "complete로 갱신"과는 다르다.

## Issues Encountered

- **plan receipt 복구**: 위 Gate 경위 참조. 사용자 판단이 필요했다.
- **`derive/cli.js run --json`의 stdout이 순수 JSON이 아니었다.** `scanBacklog`를 직접 호출해 확인했다.
- **무관한 findings state가 리뷰 도중 사라졌다 (미해결).** 세션 시작 시점에 워킹트리에는
  2026-09-11 registry closure sweep의 산출물이 있었다 — tracked shard 19개에 `finding_closed`
  append(`closed_fixed: 8` · `closed_deferred: 69` · `kept_open: 1333` · `backlog_join.joined: 118`),
  그리고 미추적 marker `.claude/state/findings/.m4-legacy-close.json`. 리뷰 중간(파일 mtime
  2026-09-14 15:15:46)에 19개가 전부 HEAD 내용으로 되돌아갔고 marker는 삭제됐다. 이 사이클은
  그 디렉토리에 쓰거나 되돌린 적이 없다(커밋 diff가 그것을 보인다). 같은 event_id가 저장소
  전체(main + 전 worktree)의 어느 `.jsonl`에도 없으므로 **그 sweep 기록은 디스크에서 소실**됐다 —
  커밋되지 않은 변경이라 git objects에도 없다. marker를 만든 도구는 저장소 코드에 존재하지
  않는다(`m4-legacy-close` grep 0건). 복구가 필요하면 그 sweep을 다시 돌려야 한다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js` | 7 (신규) | Task 3 (a)~(f) · Task 5 — 전부 수정 전 red 확인 |
| `plugins/mccp/scripts/lib/tests/work-halt-record.test.js` | 1 (신규) | Task 4 — 수정 전 red(`/home/someone/...` 누출) |
| `plugins/mccp/scripts/hooks/tests/receipt-prompt-submit.test.js` | 1 (수정) | Task 1 — cwd 되돌린 사본에서 red |

## Acceptance

- [x] All tasks complete
- [x] Validation passes
- [x] Patterns mirrored, not reinvented
- [x] 게이트/경로를 실제로 1회 완주하고 산출물을 확인
  - [x] Validation 3을 Task 2 전 · Task 2 후 · 마이그레이션 후 세 번 측정(위 표)
  - [x] Task 2 후 분모 변화를 수치로 기록 — **0**, 원인 규명
  - [x] Task 1 test 실행 뒤 실 공유 디렉토리 `test-*.jsonl` 0개
  - [x] `record-halt --work-unit "/home/x/leak"` → STATE.md에 `/home/x` 0건

## Post-review absorption (`/mccp:code-review` local mode)

커밋 직전 로컬 리뷰에서 나온 7건을 **전부 그 자리에서 수용**했다(§3.14의 MEDIUM·LOW 이연 대신
사용자 지시로 전건 흡수). CRITICAL·HIGH는 0건이었다.

| # | Severity | 흡수 |
|---|---|---|
| 1 | MEDIUM | 둘째 줄이 가리키던 `scripts/migrations/…`는 저장소 루트에서 ENOENT다 → `node plugins/mccp/scripts/migrations/msw-events-common-dir.js`로 정정. test도 basename 매칭에서 전체 경로 매칭으로 좁혔다(`msw-a1-boundary.test.js:1029`) |
| 2 | MEDIUM | DD3 키 동형이 주석으로만 있었다 → 마이그레이션 `keyOf`와 신호의 **동치관계**를 4케이스로 대조하는 test 추가 (Task 3g) |
| 3 | MEDIUM | 무관한 tracked state를 M4 커밋에서 제외했다. 단 **분리 과정은 내 손을 거치지 않았다** — 리뷰 도중(2026-09-14 15:15:46) findings shard 19개의 2026-09-11 closure append와 미추적 marker `.m4-legacy-close.json`이 워킹트리에서 사라졌다(HEAD 상태로 복귀). 이 사이클이 되돌린 것이 아니고 원인 미상이다. 아래 Issues 참조. `plan-review-ci-full-suite.md`는 남아 있으며 **커밋하지 않았다** |
| 4 | LOW | `cli.js` 실패 경로의 scrub root가 `process.cwd()`였다(cwd가 스캔 대상의 조상이면 상대화만 되어 구조가 노출) → `scanRoot`를 try 밖으로 올려 스캔 대상 root로 좁힌다 |
| 5 | LOW | `a1KeyOf`가 `legacyKeyOf`보다 먼저 선언돼 있었다 → 루프 직전으로 이동. TDZ 오류가 per-line catch에 삼켜지는 경로를 없앴다 |
| 6 | LOW | Task 3f test가 임시 디렉토리를 남겼다 → `finally` 정리 + "tmpdir이 git 저장소 안이 아니다" 전제 단언 추가 |
| 7 | LOW | `receipt-prompt-submit.test.js`가 러너 cwd에서 `git rev-parse`를 무조건 실행했다 → 해소 실패는 대조 대상 부재로 접고 단언만 건너뛴다 |

재검증: `msw-a1-boundary` · `work-halt-record` · `receipt-prompt-submit` · `msw-metrics` **전부 pass**
(신규 Task 3g 포함). 함께 돌린 `derive/tests/mask.test.js` 1 fail은 **선재 실패**로 M3 사이클에
이미 귀속 기록돼 있다(이 변경 이전 HEAD에서도 동일).

한 가지는 의도적으로 **바꾸지 않았다**: 둘째 줄의 "이 위치에만" 문구. cwd 의존성 때문에 실제로는
"이 스캔 범위에만"이 더 정확하지만, 그 축은 backlog(`:1786`)가 소유하고 문구를 지금 바꾸면 봉인된
plan L206·Acceptance와 어긋난다.

## Next Steps

- [ ] Code review via `/mccp:code-review`
- [ ] Create PR via `/mccp:pr` (PR-Codex 발화 — dedupe 닫힘)
- [ ] 머지 후 `/mccp:milestone-close`로 M4 종료
