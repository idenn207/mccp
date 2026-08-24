# Implementation Report: impeccable 탐지 계약 M1 — 정직한 탐지

**Plan**: `.claude/plans/impeccable-detection-contract-m1.plan.md` (봉인 `sha256:17f9208e…`, 무편집)
**Source PRD**: `.claude/prds/impeccable-detection-contract.prd.md` (M1 행 → `complete`)
**Branch**: `impeccable-detection-contract` · **Version**: `1.31.0 → 1.31.1` (§3.7 patch — PRD 단일 milestone)
**게이트 산출물·라이브 실측**: `.claude/notes/impeccable-detection-contract-m1.md`

## Summary

`probeSkillAvailable`가 돌려주던 boolean 하나를 `resolveImpeccable()` 오라클로 대체했다. 설치원을
전부 열거하고, 각 설치원의 `version`을 SKILL.md frontmatter에서 실제로 판독하고, `Skill(...)`
호출이 실제로 열게 될 본문 하나를 지목한다. `probeSkillAvailable`는 `available` 필드를 돌려주는
얇은 래퍼로 남아 **호출부 4곳이 무변경**이고, `detect()`는 기존 키의 의미를 그대로 둔 채 6필드를
얹는 **엄격한 상위집합**이다 — 게이트의 분기는 한 줄도 바뀌지 않고 **분기의 입력만** 참이 된다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 오라클 1개 · 신규 test 22건 · 문서 3면 |
| Files Changed | 14 (plan 표) | 13 수정/신규 (`.claude/PRPs/reports/…`는 이 파일) |
| 라운드 | Codex R1 종료 | R1 종료 (§3.16) — findings 3, escalate 없음 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 라이브 사전 측정 | 완료 | (a) 네임스페이스 확정 · (b) 도구 권한 **양성**(권한 축 추가 불필요) · (c) 기준선 `false` 재현 |
| 1 | `resolveImpeccable()` 오라클 | 완료 | 4소스 열거 · 접두어 매칭 · 모호성 처리 |
| 2 | frontmatter version 유계 판독 | 완료 | 선두 8KB · 실패 전부 `null` · throw 없음 |
| 3 | 배선(`probeSkillAvailable`·`detect`·CLI) | 완료 | 상위집합 확인 · `resolve` 서브커맨드 2형태 |
| 4 | test 채널 조합 매트릭스 | 완료 | 22건 (매트릭스 11 + version 4 + security 3 + 경로 1 + 계약 1 + 래퍼 1 + 접두어 반례 1) |
| 5 | fixture 교정 + registry 앵커 | 완료 | 실측 키 + 실재 install tree + **격리** · 앵커 `:135 → :301` (1줄) |
| 6 | 문서 | 완료 | `gate-design.md#impeccable-detection` · `CLAUDE.md §3.17` · ledger row S3.17 |
| 7 | version 4면 + PRD 행 | 완료 | `1.31.1` 4면 동기 · CHANGELOG 신규 항목 · PRD M1 `complete` |
| 8 | 라이브 완주 | **부분 미달** | 오라클 축 충족, 게이트 표면 축은 미달 — 아래 참조 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 단위 test | Pass | 88건 전량 (resolve 22 · detect 24 · design-surface 15 · guard 9 · dep-check 8 · i18n-surface 10) |
| 계약 lint | Pass (1 승계 red) | instruction-contract C1~C4 pass (rows 31→32) · env-contract L2~L9 pass, **L1은 main 승계** |
| 오라클 실측 | Pass | `resolve --json`이 2소스 열거 + 이긴 줄 지목 |
| 광역 회귀 | Pass | `receipt/tests/` 51파일 · 668건 — 665 pass · 1 skip · 2 fail은 **env 오염**(아래) |
| plan-conflict | `conflict:false` | plan↔구현 괴리 없음 |

env-contract L1(`MCCP_PLAN_REVIEW_TEST_INVOKE` 미등재)은 `plan-review/cli.js`에서 오는 승계
red이고 그 파일은 이 브랜치 diff 밖이다. backlog에 근거와 함께 적재했다.

광역 회귀의 실패 2건(`review-single-pass-fields.test.js`의 "without the toggle the keys do not
exist at all" · "negative: the bypass flag alone is rejected")은 **회귀가 아니라 이 세션이 만든
env 오염**이다. `/mccp:plan` 재실행을 위해 `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`를
`.claude/settings.json`에 잠깐 넣었다 되돌렸는데, 하네스가 그 값을 뒤늦게 `process.env`에
주입했고 revert는 아직 전파되지 않았다. 백그라운드 test 실행이 그것을 상속받아 `write.js:869`가
`review_single_pass_reason`을 stamp했고, "토글 없으면 키가 없어야 한다"는 단언이 깨졌다.

`unset MCCP_REVIEW_SINGLE_PASS` 후 두 test만 재실행해 **둘 다 pass**함을 확인했다. 의존
그래프로도 무관함이 확정된다 — 이 test는 `write.js` · `schema.js` · `hash.js` ·
`validate-cmd.js` · `review-verdict.js` · `receipt-convergence.js` · `derive/sources/receipts.js`를
쓰는데 이번 diff에는 그중 어느 것도 없다.

**부수 관측**: STATE.md가 "(main 승계) 선재 red: review-single-pass-fields.test.js:162"로
기록한 항목이 같은 파일이다. 그 세션도 single-pass 토글을 사용했으므로 **그 red 역시 같은 env
인공물이었을 가능성이 높다.** 다음 세션이 유령을 쫓지 않도록 backlog에 적재했다.
### Design Grounding

N/A — design trigger 미발동(`skill_available=false`, 설치본 기준). capture 아티팩트 부재로
Phase 3.7은 완전 no-op.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/impeccable-detect.js` | UPDATED | +378 / -63 |
| `plugins/mccp/scripts/lib/tests/impeccable-resolve.test.js` | CREATED | +487 |
| `plugins/mccp/scripts/lib/tests/impeccable-detect.test.js` | UPDATED | +69 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATED | +1 / -1 |
| `docs/gate-design.md` | UPDATED | +97 |
| `CLAUDE.md` | UPDATED | +25 |
| `docs/multi-session-work-loop/instruction-contract.md` | UPDATED | +1 |
| `CHANGELOG.md` | UPDATED | +56 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | version |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | footer version |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | derived version |
| `.claude/prds/impeccable-detection-contract.prd.md` | UPDATED | M1 행 |
| `.claude/notes/impeccable-detection-contract-m1.md` | CREATED | +189 |

## Deviations from Plan

**1. 모호한 bare 충돌에서 `source`·`path`도 `null`이다** (Implement-Codex F3 흡수). plan은
`shadowed:true` + `version:null`만 정하고 `source`·`path`를 정하지 않고 남겼다. 둘 중 하나를
보고하면 "실제로 열릴 본문을 지목한다"는 약속을 정면으로 어긴다. plan과 충돌이 아니라 공백을
메운 것이며 test가 그 셋의 `null`을 고정한다.

**2. 보고되는 `path`를 정규화한다**(repo 내부 → repo-relative, 밖 → 홈 축약). plan-review L2
security finding(245eaa14·6965d02b)의 §3.14 판정이 "구현 제약으로 수용"으로 backlog에 기록돼
있었다. M1 자신은 `path`를 receipt에 쓰지 않지만 M2·M3가 이 오라클을 소비한다.

**3. Task 5의 fixture 작업이 plan 서술보다 넓다.** plan은 "`impeccable@anthropics` 리터럴을
실측 키로 교정"만 지시했다. 실제로는 (a) install tree를 실재하게 만들고(stale installPath는 이제
미계수), (b) `repoRoot`·`projectSkillDir`을 주입해 격리해야 했다 — 신설 project 채널이
`<repoRoot>/.claude/skills/impeccable`을 기본값으로 삼는데 **이 저장소에 실제 사본이 있어서**
격리 없이는 fixture 대신 개발자의 checkout을 읽는다. plan-review L2 test finding(39019cde)이
이 축을 CRITICAL로 지적했고 §3.14 판정에서 구현 제약으로 수용했다. 지적의 기전은 달랐다 —
리뷰어는 "기존 test가 붉어진다"고 했는데 실제로는 **2건이 그 누출 덕에 통과하고 있었다**(격리하니
비로소 붉어졌고, 그때 고쳤다).

**4. security-reviewer MEDIUM/LOW 3건을 흡수했다**(§3.14는 흡수 대상에서 뺀다). 1A 디렉토리명
whitelist · 1B symlink `lstat` 거부 · 2B `isFile()` 사전검사. 셋 다 지금 작성하는 함수 안의
1~3줄이고 2B는 FIFO에서 게이트가 무한 정지하는 경로다. 이연한 2A·3·4를 포함해 판정은 전부
backlog에 적재했다.

## Issues Encountered

**`split().join()`이 무관한 행 16개를 함께 바꿨다.** registry.js 앵커를 `:135 → :301`로 고치면서
blunt string replace를 써 `IMPECCABLE_*` external 행 16개가 딸려갔다. 그 변수들은 impeccable
자신의 env이고 `:301`에서 소비되지 않는다. `git diff --stat`이 "1줄 고쳤는데 34줄 변경"으로
드러내 되돌렸고(최종 1줄), 그 16행이 애초에 placeholder 앵커를 쓴다는 관측은 backlog에 남겼다
(M5 계열).

**heredoc이 인용부호·백틱 조합에서 깨졌다.** Windows Git-Bash에서 JS 본문을 heredoc으로 넘기다
`unexpected EOF`가 났다. 본문을 별도 파일로 쓰고 스플라이스하는 방식으로 우회했다
(memory: `bash-tool-backslash-collapse`와 같은 계열).

**Codex는 foreground로 돌리면 안 된다.** `codex-invoke`의 자체 timeout 900s가 Bash 도구 상한
600s를 넘는다. `run_in_background`로 띄워 294초에 정상 반환했다
(memory: `codex-invoke-exceeds-bash-timeout`).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/impeccable-resolve.test.js` | 22 | 채널 조합 매트릭스 · version 유계 판독 · security 흡수 3축 · 경로 정규화 · invocation 계약 · 래퍼 등가 |
| `plugins/mccp/scripts/lib/tests/impeccable-detect.test.js` | 24 (기존 유지 + 격리) | boolean 계약 회귀 — 삭제하지 않았다 |

가장 중요한 단언은 **"the bare invocation equals the literal name mccp command bodies call"**이다.
`plugins/mccp/commands/*.md`에서 `Skill(...)` 호출 이름을 grep으로 읽어 오라클 출력과 대조하므로,
M3가 재배선 없이 project-local 사본을 지우면 그 순간 red가 된다.

## Acceptance

- [x] All tasks complete (Task 8은 부분 — 아래)
- [x] Validation passes (env-contract L1 승계 red 제외)
- [x] Patterns mirrored, not reinvented — `dep-check.js` sentinel · `codex-invoke.js` 원인별 분류 · `agent-compress.js` frontmatter 정규식 · 기존 test 하네스 이름
- [ ] **게이트/경로를 실제로 1회 완주 — 부분 미달**

명시된 3개 산출물의 판정:

1. **Task 0 사전 측정 3건이 코드 수정 이전 시점으로 기록** — 충족. 노트 §Task 0.
2. **`resolve --json`이 두 소스를 모두 열거하고 이긴 줄과 invocation을 지목** — 충족.
   `project 3.5.0 (impeccable)` 이 이기고 `plugin 4.1.1 (impeccable:impeccable)` 동반.
3. **`MCCP_IMPECCABLE_SKILL` 미설정 상태에서 게이트가 `SKILL_AVAIL=1`로 진입** — **미달**.

3번의 사유는 반올림하지 않고 기록한다: **게이트는 worktree가 아니라 설치된 plugin cache를
호출한다.** 명령 본문의 node 호출이 전부 `~/.claude/plugins/cache/mccp/mccp/<version>/`로
해소되므로, 이번 사이클의 세 게이트가 `skill-missing`을 낸 것은 그들이 **고쳐지기 전의 코드를
실행했기 때문**이다. 실측으로 양쪽을 분리했다 — worktree 오라클 `reason=ok · skill_available:true`,
설치본 1.31.0 `reason=skill-missing · false`. 게이트 표면의 뒤집힘은 머지 후
`claude plugin update`가 `1.31.1` cache를 만든 다음에 성립한다.

## Next Steps

- [ ] `/mccp:pr` — **현재 차단됨**. `validate --command mccp:pr`이 exit 2로 막는다:
      implement receipt의 `meta.impeccable_skipped=true`(strict 게이트). 원인이 이 PR이 고치는
      결함 자체이므로(설치본 탐지기가 skill-missing을 반환) 선택지는 둘이다 —
      (a) 문서화된 audited escape `MCCP_FORCE_PR_WITHOUT_IMPECCABLE`을 사유와 함께 사용(§3.16),
      (b) 머지 → `claude plugin update` → 다음 사이클부터 정상.
- [ ] 머지 후 `claude plugin update` → `~/.claude/plugins/cache/mccp/mccp/1.31.1/` 생성 확인 →
      Acceptance 3 재측정(`detect --mode plan`이 `reason=ok`를 내는지).
- [ ] worktree cleanup: `git worktree remove .worktrees/impeccable-detection-contract`
      (§3.8 — squash 직후 같은 cycle 안에서).
- [ ] M2 착수 시 backlog의 이연 항목 소비 — 특히 Implement-Codex F2(호출부 재배선, M3 전제)와
      L2 invariant(receipt present-only 3필드, M2 조건).
