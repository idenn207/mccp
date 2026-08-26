# Implementation Report: impeccable 탐지 계약 M2 — setup·경고 정합

**Plan**: `.claude/plans/impeccable-detection-contract-m2.plan.md` (`plan_hash sha256:e9775b74…1142a5`, 봉인)
**Notes / 게이트 산출물**: `.claude/notes/impeccable-detection-contract-m2.md`
**Branch**: `impeccable-detection-contract` · **Version**: `1.31.1 → 1.31.2` (patch)

## Summary

M1이 만든 `resolveImpeccable()` 오라클을 소비처 셋에 실제로 연결했다 — `dep-check`,
SessionStart 배너, `/mccp:setup` Phase 3 — 그리고 같은 커밋에서 `.impeccable/` 무시 규칙의
극성을 공식 계약에 맞췄다. 판정 로직을 새로 만들지 않았다: `checkImpeccableCli`가 각자 답하던
두 번째 사실을 없애는 대신 **판정 권한만 뺏고** telemetry로 남겼다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 코드는 작고 문서·계약면이 넓다 |
| Files Changed | 21 | 21 계획분 전부 + 게이트 산출물 5 |
| 라운드 | R1 (cap 1 고정) | R1 — Plan-Codex/L2 패널/Implement-Codex/security 각 1회 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 라이브 사전 측정 | 완료 | (a)(b)(c) + **(d) 추가** — `config.json` 커밋 적격성을 1차 자료로 검증(리뷰어 2명이 같은 지점을 지적) |
| 1 | `checkImpeccable()` | 완료 | 지연 require + **fail-closed sentinel**(계획 밖 흡수 C5) + **라벨 소독**(C4) |
| 2 | SessionStart 배너 이전 | 완료 | 판정 필드 교체 + `repoRoot` 전달 |
| 3 | `.impeccable/` 극성 교체 | 완료 | canonical + repo `.gitignore` 한 단위. 주석이 검증된 1차 근거를 인용(C7) |
| 4 | `/mccp:setup` Phase 3 재작성 | 완료 | 6자리 + **설치 후 재-`dep-check` 의무화**(C2) + **npx 권한 축소**(C6) |
| 5 | 문서 4면 정정 | 완료 | 삭제 대상 명령 활성 표면 0건 |
| 6 | 계약 문서 | 완료 | §3.17 확장 · gate-design `#### setup·경고 정합 (M2)` · ledger 행 |
| 7 | test 4종 | 완료 | 신규 2파일 + 기존 2파일 확장. **C1 케이스는 변이 검사로 반증 가능성 확인** |
| 8 | version 4면 + CHANGELOG | 완료 | target 재계산 후 `1.31.2` (경쟁 브랜치 최고 `1.30.3`) |
| 9 | 라이브 완주 | 완료(제약 명시) | (a)(c)는 실물 완주, (b)(d)는 판정 로직 실행 — 사유는 아래 D6 |
| 10 | PRD M2 행 | 완료 | 행 1개 + Open Question 1개, 그 외 diff 0 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | pass | 변경 `.js` 9개 전부 `node --check` 통과 · `plugin.json` JSON 유효 |
| Unit Tests | pass | 16 suite · **302 tests · 296 pass · 0 fail · 6 skip** (부수 영향 suite 포함) |
| Build | N/A | 이 저장소는 build 단계가 없다(`package.json` 부재, `node --test` 기반) |
| Integration | N/A | 서버 없음 |
| Edge Cases | pass | 순환 양쪽 로드 순서 · 4채널 매트릭스 · shadowed · 무소스 · hostile options |

계약 lint: `instruction-contract` **pass(C1~C4)**.
`env-contract`는 **L1만 red이고 M2가 만든 것이 아니다** — `MCCP_PLAN_REVIEW_TEST_INVOKE`는
`plan-review/cli.js:538,541`에만 존재하고 그 파일은 이 사이클의 diff에 없다.
M1 사이클이 이미 "main 승계 선재 red"로 backlog에 등재했다. L2~L9는 전부 pass.

### Design Grounding

**N/A (no design trigger).** implement 모드 detector가 `design_signal=false`(rendered surface
0건)를 냈고 — control-plane 전용 변경이라 정직한 결과다 — 따라서 2.5.5c 캡처가 없고
Phase 3.6·3.7은 규정대로 no-op이다. receipt에는 `impeccable_silent_skip=true (no-signal)`가
정보성으로 봉인됐고 `impeccable_skipped`는 **false**다.

## Files Changed

| File | Action | 요지 |
|---|---|---|
| `plugins/mccp/scripts/lib/dep-check.js` | UPDATE | `checkImpeccable` + sentinel + `checkAll` 상위집합 + printer 행 + `safeLabel` |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | 배너 판정 필드 교체 + `repoRoot` 전달 |
| `plugins/mccp/scripts/lib/gitignore-provision.js` | UPDATE | canonical 극성 + 근거 주석 |
| `.gitignore` | UPDATE | 같은 극성(양방향 drift lint) |
| `plugins/mccp/commands/setup.md` | UPDATE | frontmatter · Phase 1 표 · Phase 3 전면 재작성 · Phase 6 정정 |
| `plugins/mccp/scripts/lib/tests/dep-check.test.js` | UPDATE | +11 tests |
| `plugins/mccp/scripts/lib/tests/gitignore-provision.test.js` | UPDATE | +2 tests |
| `plugins/mccp/scripts/lib/tests/setup-command-body.test.js` | CREATE | 6 tests |
| `plugins/mccp/scripts/hooks/tests/session-start-dep-check.test.js` | CREATE | 4 tests |
| `docs/gate-design.md` | UPDATE | 설치 서술 + `#### setup·경고 정합 (M2)` |
| `README.md` · `NOTICE` · `CLAUDE.md` | UPDATE | 채널 중립 서술 · §3.17 소비처 문단 |
| `docs/multi-session-work-loop/instruction-contract.md` | UPDATE | S3.17 행 |
| `plugins/mccp/.claude-plugin/plugin.json` · `renderer/html.js` · `renderer/markdown.js` · `CHANGELOG.md` | UPDATE | version 4면 |
| `.claude/prds/impeccable-detection-contract.prd.md` | UPDATE | M2 행 + Open Question 결정 |
| `.claude/notes/impeccable-detection-contract-m2.md` | CREATE | 게이트 기록 · Task 0 · Task 9 |
| `.claude/PRPs/reports/…-m2-report.md` | CREATE | 이 파일 |

게이트 산출물 5건(`codex-findings-backlog.md` · plan 자신 · 리뷰 레코드 2 · `STATE.md` ·
`fix-task-applied.md`)은 `Files to Change` 밖이며 구현 범위 확장이 아니다.

## Deviations from Plan

각 항목은 WHAT / WHY다. 전부 리뷰 흡수 또는 실측 결과이며 임의 판단이 아니다.

- **D1 — `Bash(npx:*)` → `Bash(npx impeccable:*)`** (Task 4 Step 1, Task 7 필수 리터럴).
  security-reviewer S3(CRITICAL): 와일드카드는 임의 원격 패키지 실행을 허용하는데 본문이
  실제로 쓰는 명령은 하나다. 다단어 prefix는 지원 형식이고, 형태가 틀려도 실패 모드가 권한
  프롬프트라 안전한 방향이다.
- **D2 — Task 4에 "설치 후 재-`dep-check` + Phase 1 표 갱신" 의무 추가**, 정적 test 필수
  리터럴에 `dep-check` 추가. Implement-Codex R1a-F2와 L2 invariant `id=3df115cd`가 독립적으로
  같은 지점을 지적했다: 재작성이 그 단계를 조용히 떨어뜨리면 setup이 설치 직후 stale 상태를
  보고한다.
- **D3 — Task 7에 env를 쓰지 않는 hook-spawn 케이스 추가**. Implement-Codex R1a-F1:
  `MCCP_IMPECCABLE_SKILL`은 오라클 최우선 축이라 파일시스템·`repoRoot` 경로를 통째로
  단락시키므로, 계획된 env 양방향 test만으로는 `repoRoot` 전달 누락을 잡지 못한다.
  추가 케이스는 중첩 cwd + redirect된 HOME으로 project 채널만 답할 수 있게 만든다.
  **변이 검사로 확인**: `repoRoot` 전달을 제거하면 그 test가 red가 되고, 복원하면 green이다.
- **D4 — `checkImpeccable`에 try/catch sentinel + `typeof` 가드**. security-reviewer S2
  (CRITICAL): plan Task 1의 "반환을 그대로 돌려준다"를 문자 그대로 구현하면
  `dep-check.js:8`이 선언한 "Never throws" 계약을 깬다. fail-closed(`available:false`)로
  고정했다 — 관대한 실패는 깨진 require를 조용한 디자인 리뷰 skip으로 만든다.
- **D5 — printer/표 진입 전 라벨 소독(`safeLabel`)**. security-reviewer S1(CRITICAL):
  SKILL.md frontmatter version은 사용자가 설치한 파일에서 오고 터미널에 도달한다.
  `impeccable-detect.js`는 `Files to Change` 밖이므로 **새로 만드는 렌더 경계**에서만 막았다.
- **D6 — Task 9 (b)(d)를 슬래시 명령이 아니라 판정 로직 실행으로 관측**. 명령 레지스트리가
  plugin **cache 1.31.0**을 서빙하는데(`mccp:setup` 설명이 아직 "impeccable CLI") 이 사이클의
  setup.md 재작성은 worktree에만 있다. `/mccp:setup --dry-run`을 부르면 구버전 본문이 돌아
  관측이 이 milestone의 것이 아니게 된다. 슬래시 경로 완주는 머지 + `claude plugin update`
  이후에 성립한다.
- **D7 — 게이트 기록을 plan 본문이 아니라 노트 파일에** (`## Codex Implementation Review`).
  plan은 `mccp-plan-codex` receipt에 `plan_hash`로 결속돼 있어 편집하면 stale이 되고
  §3.11 guard 2가 이 사이클의 PR을 막는다. plan 자신의 `Files to Change`가 노트 파일을
  이 용도로 지정하고 있다(M1·M3 선례).
- **D8 — Task 3 주석이 plan이 적은 URL 대신 검증된 1차 자료를 인용**. plan은
  "공식 `/docs/config`를 근거로"라고 적었으나 그 출처는 검증되지 않았고, L2 test HIGH와
  security S6이 바로 그 점을 지적했다. 설치된 impeccable v4.1.1의 `reference/hooks.md`로
  검증해 그 인용을 주석에 넣었다.
- **D9 — 실측이 plan 예측과 다른 2건(결함 아님)**: provision dry-run의 `action`은
  `"update"`가 아니라 `"append"`다(이 저장소에 managed 블록이 아직 없다).
  Acceptance (b)의 기대 문자열 `available (project 3.5.0, impeccable)`은 `v`를 빠뜨렸고,
  Task 1이 정한 포맷(`available (source vN, invocation)`)이 정본이라 구현은 후자를 따랐다 —
  plan 내부 불일치다.

## Issues Encountered

- **실제 `.gitignore`가 test로 provision됐다 → 되돌림.** 새 test가 `provision({repoRoot: dir})`를
  넘겼는데 실제 옵션명은 `repo`다. 인식되지 않은 키는 `process.cwd()`로 falls back하므로
  fixture가 아니라 **이 저장소**에 managed 블록 80줄이 실렸다. `git checkout HEAD -- .gitignore`로
  복원하고 Task 3 편집만 다시 적용했으며, test에 `samePath(res.repoRoot, dir)` 단언과 그 사유를
  주석으로 붙여 재발을 막았다.
- **`String.replace`의 `$` 치환이 노트 파일을 손상시켰다.** 삽입할 텍스트에 정규식
  `^[A-Za-z0-9._+-]{1,64}$` 뒤 백틱이 있어 `` $` ``(매치 앞부분 전체)로 해석돼 파일 앞부분이
  중복 삽입됐다. 조각 concat 방식으로 다시 조립했다.
- **Write 도구가 raw ESC 바이트(0x1b)를 소스에 넣었다.** `String.fromCharCode(27)` 구성
  형태로 교체하고 제어문자 부재를 확인했다.
- **대용량 heredoc이 두 번 파싱 실패했다**(`unexpected EOF`). 조각을 Write로 만들고 `cat`으로
  이어붙이는 경로로 전환했다.
- **Codex 1차 호출의 envelope를 파일로 저장하지 않아 유실했다.** 동일 focus로 1회 재호출해
  기록을 확보했고, 두 응답 모두 같은 working-tree diff에 대한 R1이라 triage에서 합쳤다.
- **`plan-conflict-detector`의 `file-expansion`이 오탐이다(선재 결함).** `parseFilesToChange`가
  표 셀의 backtick을 벗기지 않아 어떤 계획 파일도 diff 경로와 일치하지 않는다. 백틱을 벗기면
  진짜 미계획은 6건이고 전부 게이트 산출물이다. backlog 등재(HIGH) — `Files to Change` 밖이라 이연.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `lib/tests/dep-check.test.js` | +11 (18 total) | 순환 양쪽 로드 순서 · 4채널 매트릭스 · shadowed · 무소스 · hostile options sentinel · `checkAll` 상위집합 · 라벨 2종 · `safeLabel` 소독 |
| `lib/tests/gitignore-provision.test.js` | +2 (94 total) | canonical 극성 · 실제 repo provision 후 `check-ignore --no-index` 4경로(`design`/`config`/`config.local`/`live/config`) |
| `lib/tests/setup-command-body.test.js` | 6 (신규) | 금지 6 리터럴 부재 · 필수 5 리터럴 존재 · npx 권한 범위 · Phase 3 skip 조건 · invocation gap 출력 · Phase 6 lenient/strict |
| `hooks/tests/session-start-dep-check.test.js` | 4 (신규) | env 양방향 배선 · **env 없는 repoRoot 전달**(변이 검사 통과) · 무채널 대조군 |

## Next Steps

- [ ] `/mccp:prp-commit` — 21 계획 파일 + 게이트 산출물
- [ ] `/mccp:pr` — **진입 직전 §3.7 version 재계산 필수**(두 번째 시점)
- [ ] 머지 후 `claude plugin update` → cache가 1.31.2를 서빙하면 `/mccp:setup --dry-run`
      슬래시 완주로 Task 9 (b)(d)를 재확인
- [ ] M3 — 호출부 재배선 + project-local 사본 제거를 **단일 커밋**으로
