# Implementation Report: Review Loop Bypass — M2 미흡수 지적 회수

## Summary

M1의 단일통과 토글이 떨어뜨리는 `quorum.blockingFindings`를 `.claude/plans/codex-findings-backlog.md`에 기계적으로 적재하고, 그 적재를 완화의 **전제조건**으로 만들었다. 적재할 수 없으면 완화하지 않는다(`5.2g2` → `EX_BLOCK`).

소비 경로는 새로 만들지 않았다 — `derive/sources/backlog.js`가 이미 이 표를 파싱하고 대시보드가 '이월 finding'으로 표면화한다. M2가 채운 것은 그 파이프의 비어 있던 입구다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 13 | 15 (+2: `review-single-pass.js` export, `.claude/notes/` 게이트 산출물) |
| 신규 test | 미명시 | 33 (단위 + CLI spawn) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | backlog-append 오라클 신설 | Complete | 서명에 `repoRoot` 추가 — plan 서명은 순수 함수가 `path.relative`를 계산할 수 없는 자기모순이었다 |
| 2 | CLI subcommand 두 개 배선 | Complete | `--l2` 계열 플래그 0건 유지. `--plan`은 CLI 진입부에서 검증·정규화 |
| 3 | record.js Measurement 2축 확장 | Complete | 부재의 **결손 여부**를 완화 여부로 판정하도록 조정 (아래 D1) |
| 4 | plan.md 5.2g2 배선 | Complete | mode 표·HALT 카탈로그·5.2 진입 purge 목록까지 함께 갱신 |
| 5 | command-body 정적 단언 확장 | Complete | 요구된 3개 + 위치 검증 + 카탈로그 등재 = 5개 |
| 6 | 문서·버전 4면 동기 | Complete | 1.28.1 → 1.29.0 (main 확인 결과 상향 불필요 — §3.7 14번째) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 신규 단위 + CLI test | Pass | 33/33 (`plan-review-backlog-append.test.js`) |
| 인접 test 3종 | Pass | command-body 15 · single-pass 31 · single-pass-gate 10 |
| version 4면 동기 | Pass | `i18n-surface.test.js` 10/10 |
| 소비자 왕복 | Pass | raw = parsed = 51 (파서가 버린 행 0건) |
| 전수 회귀 — lib | Pass (직렬) | **2310/2310 fail 0** (`--test-concurrency=1`). 병렬 실행은 아래 참조 |
| 전수 회귀 — receipt | Pass | 644 (fail 0) |
| 전수 회귀 — derive | Pass | 127/127 |
| 전수 회귀 — renderer | Pass | 672/672 |
| evidence-audit | 무손상 | `false_positive: 0` · `ok: 21` · state `incomplete`(선재 커버리지 갭, 본 변경 무관) |
| plan-conflict-detector | `conflict: false` | |
| receipt chain (`mccp:pr`) | `ok: true` | missing/stale/blocking/open_critical 전부 0 |

### 전수 회귀의 정직한 단서 — 병렬 실행 1건 실패

`node --test plugins/mccp/scripts/lib/tests/*.test.js`(병렬 기본값)는 `a3-instruction-cost.test.js`를 **파일 레벨**로 실패시킨다:

```
Error: Unable to deserialize cloned data due to invalid or unsupported version.
    at #processRawBuffer (node:internal/test_runner/runner:375:20)
```

개별 단언은 전부 통과한다 — 단독 실행 14/14, 직렬 전수 2310/2310 fail 0. 병렬에서만 runner IPC 프레임이 깨지고 보고 수가 2310에서 2300~2302로 줄어 **subtest 보고 자체가 유실**된다.

방아쇠는 부하 변화다: CLAUDE.md에 1809바이트를 더하자 3회 연속 재현했고 되돌리자 2회 연속 통과했다. 그러나 인과는 CLAUDE.md 내용이 아니다 — 그 test는 모든 케이스에서 fixture `claudePath`를 명시해 실제 저장소 CLAUDE.md를 읽지 않으며, 인과는 그 파일의 python subprocess 3종 spawn과 runner IPC의 경합이다(stdio는 전부 pipe라 출력 누수도 아니다). 선재 취약이며 M2 변경과 무관하다. backlog에 1줄 기록했다.

### Design Grounding

N/A — 디자인 트리거 미발화(`design_signal: false`, `silent_skip_reason: no-signal`). Phase 2.5.5c capture 미실행 → Phase 3.6 DESIGN FINISH · Phase 3.7 GROUNDING VERIFY 모두 no-op.

## Acceptance

| 항목 | 결과 | 증거 |
|---|---|---|
| All tasks complete | 충족 | 위 표 6/6 |
| Validation passes | 충족 | 위 표 (병렬 단서는 명시) |
| Patterns mirrored | 충족 | `decide.js:229` 순수 오라클 경계 · `cli.js:40` 종료코드 · `fix-task.js:52` 한 줄 정규화 · `review-single-pass.js:151` fail-open 금지 |
| 게이트/경로 1회 완주 | 충족 | 아래 라이브 발화 |
| **라이브 완주 산출물** | 충족 | 실제 `decision.json`(blockingFindings 10건)으로 5.2g2 블록 발화 → (a) backlog에 `id=` 태그 신규 **10행** (N = blockingFindings 길이) · (b) Measurement `backlog_appended: 10` · (c) `assert-backlog-parity` **exit 0** |
| **멱등 확인** | 충족 | 같은 본문 재실행 → `appended: 0` · `skipped_duplicate: 10` · 행 수 51 불변 |
| **실패 경로 실제 발화** | 충족 | 헤더 지운 원장 사본 + 토글 ON → `append exit 12` · 5.2g2에서 HALT · 원장 무변경 · record `halt_stage="5.2g2"` · **plan receipt 미작성** |
| **기본 경로 무변경** | 충족 | 토글 OFF → 5.2g2 no-op · 신규 행 0 · `backlog_appended: null`(0 아님) · `halt_stage: null` |
| **M1 이월 acceptance (a) 소진** | **부분 충족 — 아래 D3** | `review_verdict: divergent` ✓ · `review_single_pass_bypassed_verdict: true` ✓ · `review_single_pass_reason`는 `deferred_to_prd_completion`(plan이 예상한 `deadline_pressure`와 다름) |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/backlog-append.js` | CREATED | +281 |
| `plugins/mccp/scripts/lib/tests/plan-review-backlog-append.test.js` | CREATED | +432 |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATED | +236 |
| `plugins/mccp/scripts/lib/plan-review/record.js` | UPDATED | +36 |
| `plugins/mccp/scripts/lib/review-single-pass.js` | UPDATED | +5 (계획 외 — D2) |
| `plugins/mccp/commands/plan.md` | UPDATED | +62 / -6 |
| `plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js` | UPDATED | +73 |
| `docs/gate-design.md` | UPDATED | +38 / -3 |
| `CLAUDE.md` | UPDATED | +17 / -6 |
| `CHANGELOG.md` | UPDATED | +12 / -1 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.28.1 → 1.29.0 |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` | UPDATED | footer version 2면 |
| `.claude/prds/review-loop-bypass.prd.md` | UPDATED | M2 Outcome 문구 정정 + Risk 정정 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | 이연 5건 + 라이브 적재 10행 |
| `.claude/notes/review-loop-bypass-m2-implement-review.md` | CREATED | 게이트 산출물 (D4) |

## Deviations from Plan

**D1 — Measurement 결손 조건을 완화 여부로 게이팅했다.** plan Task 3은 "아티팩트 부재는 null로 기록하고 `### Recording degradations`에 사유를 남긴다"고 했으나, 조건 없이 남기면 토글이 꺼진 **모든** 실행이 degraded로 읽혀 "기본 경로 무변경" acceptance와 충돌하고 진짜 결손이 그 노이즈에 묻힌다. 기존 test `pass path — full artifacts ... a complete run degrades nothing`이 이를 red로 잡았다. `decision.single_pass_reason`이 있는 실행에서만 결손으로 기록하도록 좁혔고, 값은 두 경우 모두 `null`이다. 양방향을 test로 고정했다.

**D2 — `review-single-pass.js`에 `extractMeasurement`를 export했다** (plan Files to Change 밖, additive 5줄). `assert-backlog-parity`가 `assert-single-round`와 **같은** Measurement 블록을 읽어야 하는데, 두 번째 파서를 두면 한쪽이 읽는 형식을 다른 쪽이 못 읽는 순간 두 단언이 서로 다른 기록을 검사하게 된다.

**D3 — 라이브 게이트의 토글 사유가 plan 예상과 다르다.** plan Acceptance와 UI6은 `deadline_pressure`를 명시했으나 실제 게이트는 `deferred_to_prd_completion`으로 돌았다(이전 세션 판단). 세 필드 중 둘(`divergent` · `bypassed_verdict=true`)은 그대로 충족되고, 검증의 실질 — 토글이 적용되고 사유가 봉인됐다 — 도 충족된다(enum 3종 어느 값이든 봉인 메커니즘은 동일하다). **다만 plan이 적은 문자열과 다른 값이므로 충족을 주장하지 않고 부분 충족으로 기록한다.**

**D4 — Codex 리뷰 섹션을 plan 본문이 아니라 `.claude/notes/`에 썼다.** `## Codex Implementation Review`를 plan에 주입하면 `planAwareMarkdownHash`가 바뀐다(`hash.js:93`의 structural strip은 frontmatter `status`/`pr`/`completed_at`만 벗긴다). 그러면 봉인된 `mccp-plan-codex` receipt가 stale이 되어 `/mccp:pr` 2.5.8/2.5.9의 staleness 가드에 **이번 cycle의 PR이 스스로 막힌다**(§3.11 "가드 2 자기차단"의 재현). 명령 본문 2.5.4가 허용하는 sibling 경로를 택했고, 실측 결과 두 receipt의 `plan_hash`가 현재 파일과 MATCH를 유지한다.

## Issues Encountered

- **`'\0'` 리터럴이 소스에 실제 NUL 바이트로 기록됐다** (memory `literal-escape-becomes-nul` 재현) — 파일이 git에서 binary로 취급됐다. `String.fromCharCode(0)` 상수로 교체.
- **Bash 툴에서 백슬래시가 붕괴해 정규식이 `/\s+/` → `/s+/`로 망가졌다** (memory `bash-tool-backslash-collapse` 재현) — Bash 인라인 패치를 버리고 scratchpad 스크립트 파일 + Edit 툴로 복구.
- **`backlog.json`이 5.2 진입 purge 목록에 없었다** — 기존 test `R5: every artifact the recorder reads is reset at Phase 5.2 entry`가 잡았다. 이전 실행의 적재 결과가 새 record에 새는 실제 결함이었고 purge 목록에 추가했다.

## Security Review

`Task(mccp:security-reviewer)` 실행 — CRITICAL 4 · HIGH 8 · MEDIUM 3. §3.14대로 CRITICAL/HIGH를 흡수하고 기각분은 증거와 함께 backlog에 기록했다. 판정 표는 `.claude/notes/review-loop-bypass-m2-implement-review.md` 참조.

- **흡수**: 절대경로 유출(E7) → `repoRoot` 정규화 · 동시 append overwrite → 전체 rewrite 폐기, `appendFileSync` 단일 호출 · bare CR · 절단 경계(엔티티/서로게이트) · claim 안의 `id=` 무력화 · 마지막 개행 · Windows 백슬래시 · repo 밖 경로 · 헤더 fail-closed.
- **기각(증거 있음)**: CRITICAL "`&#124;`가 소비자 split을 깨뜨린다" — `&#124;`에는 리터럴 파이프가 없고 `backlog.js:37`은 리터럴 파이프에만 반응한다. 리뷰어가 엔티티를 `&#` + 파이프 + `24;`로 오독했다.
- **강등**: digest8 생일 충돌 CRITICAL → MEDIUM (50% 임계는 65k행, 현재 51행). 대신 "silent" 축을 닫아 중복 skip을 loud stderr + 카운트로 표면화했다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plan-review-backlog-append.test.js` | 33 | 순수 오라클(파생·이스케이프·digest·경로) · 소비자 왕복 · CLI `spawnSync` 6종 · parity 5종 · record 3종 |
| `review-single-pass-command-body.test.js` | +5 (총 15) | 5.2g2 배선 존재 · 게이팅 소스 · 실패 분기 exit · 문서 위치 · HALT 카탈로그 |

## Next Steps

- [ ] `/mccp:pr` (PR 제목에 **v1.29.0** 명시 — §3.7 체크리스트 4)
- [ ] 머지 후 PRD M2 행을 `complete`로 마감하고 `/mccp:archive-complete` 검토 (PRD 전 milestone 완료 → §3.11 C2)
- [ ] worktree 정리 (§3.8)
