# Implementation Report: `/mccp:setup` gitignore 프로비저닝 (M1)

**Plan**: [.claude/plans/setup-gitignore-m1.plan.md](../../plans/setup-gitignore-m1.plan.md)
**Source PRD**: [.claude/prds/setup-gitignore.prd.md](../../prds/setup-gitignore.prd.md) — M1이 유일 milestone이므로 PRD 종료
**Branch**: `setup-gitignore` · **Version**: 1.23.7 → **1.24.0** (§3.7 PRD 전체 완료 = minor)

## Summary

`/mccp:setup`에 **Phase 5**를 신설해 mccp 런타임 무시 규칙 29줄을 대상 저장소 `.gitignore`에
marker 블록으로 멱등 병합한다. ship receipt(`mccp-pr-codex`)는 negation 규칙으로 **추적 대상에 남는다**.
정본은 `gitignore-provision.js` 상수가 단독 소유하고, 이 repo `.gitignore`와의 양방향 drift lint를
전용 CI 워크플로가 강제한다.

설계의 중심은 **동의 없는 전체 파일 교체 경로를 하나도 남기지 않는 것**이다 — `create`는 `'wx'`
배타 생성, `append`는 append-only, `update`는 `--force-update` 없이는 쓰지 않는다(`action:'update-required'`
+ 파일 무변경). 그래서 UI2("사용자 줄을 절대 변경·삭제하지 않는다")가 방어의 결과가 아니라 **구조적 성질**이다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | **Medium** — 동시성·오류 분류·보안 축이 코드보다 test에서 더 무거웠다 |
| Files Changed | 9 | 9 (계획과 일치, 추가/누락 0) |
| Tests | 미명시 | 79 (77 pass · 0 fail · 2 POSIX-only skip) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `gitignore-provision.js` | 완료 | 게이트 흡수로 `reason`을 폐쇄 enum 8종으로 확정 + symlink 거부 추가 |
| 2 | `gitignore-provision.test.js` | 완료 | 79 tests. drift lint · `setup.md` 계약 14항목 · 워크플로 트리거 lint의 단일 소유처 |
| 3 | `setup.md` Phase 5 | 완료 | 기존 최종 보고를 Phase 6으로 이동. Phase 수 6 확인 |
| 4 | 릴리스 동기 5면 | 완료 | `currently` note가 `1.23.6`에 멈춰 있던 선재 drift도 함께 정정 |
| 5 | `gitignore-drift.yml` | 완료 | `paths`를 lint 판정 입력과 같은 집합으로. matrix에 `windows-latest` |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static analysis | Pass | `node --check` 2파일. 이 repo는 `package.json`이 없어 lint/type-check 스크립트가 존재하지 않음 |
| Unit + E2E | Pass | 79 tests / 0 fail / 2 skip |
| Build | N/A | mccp는 빌드 단계가 없음 |
| Integration | Pass | 실제 임시 repo write E2E — `git add` + `ls-files --stage` + `check-ignore`까지 |
| Edge cases | Pass | 손상 marker 4케이스 · `spawnSync` 6행 · 동시성 4종 · symlink |
| Regression | Pass | 버전 민감 스위트 4개 + renderer 52파일 전부 green |

### Plan Validation 7블록

| # | 검사 | 결과 |
|---|---|---|
| 1 | 단위 + E2E + drift lint | pass 66 / fail 0 |
| 2 | dry-run이 이 repo를 건드리지 않음 | exit 0 · `.gitignore` 무변경 |
| 3 | 실제 write: append → 재실행 noop · 버전 표기 · `.bak` 미생성 · 사용자 줄 보존 | 전부 OK |
| 3b | ship receipt **tracked** · lock/tmp/타 게이트 receipt ignored | 전부 OK |
| 3c | `.git/info/exclude` 바이트 무변경 · `core.excludesFile` 미설정 (UI4) | 전부 OK |
| 4 | non-git = `action:'skip'` + **exit 0** | OK |
| 5 | cwd=B에서 `--repo A` → A에만 생성 | OK |
| 6 | 워크플로 `paths` 4항목 + `windows-latest` | OK |
| 7 | 버전 5면 동기 (i18n test 10 pass) | OK |

### Design Grounding

**N/A (no design trigger)**. `impeccable-detect` 결과 `design_signal=false` (`silent_skip_reason=no-signal`) —
이번 변경의 렌더 surface 접촉은 `html.js`/`markdown.js`의 **버전 리터럴 한 개씩**뿐이다. 따라서
Phase 2.5.5c 캡처가 일어나지 않았고 Phase 3.6(clarify/distill/polish) · Phase 3.7(H15 grounding lint)은
완전한 no-op이다. receipt에 `impeccable_silent_skip=true`로 정직하게 기록했다.

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/gitignore-provision.js` | CREATED | ~590줄 |
| `plugins/mccp/scripts/lib/tests/gitignore-provision.test.js` | CREATED | 79 tests |
| `.github/workflows/gitignore-drift.yml` | CREATED | drift 전용 게이트 |
| `plugins/mccp/commands/setup.md` | UPDATED | Phase 5 신설 + Phase 6 이동 + 플래그/권한 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.24.0 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | page-foot 버전 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | derived 줄 버전 |
| `CHANGELOG.md` | UPDATED | `## [1.24.0]` + `currently` 정정 |
| `.claude/prds/setup-gitignore.prd.md` | UPDATED | M1 complete + Open Questions 4건 결정 + ROLLOUT-1 |

게이트 산출물(계획 밖, 정상): `.claude/notes/setup-gitignore-m1-implement-review.md` ·
`.claude/receipts/mccp-implement-codex/setup-gitignore-m1.json` · `.claude/state/fix-task.md`.

## Deviations from Plan

**D1 — plan을 `completed/`로 옮기지 않았다** (command Phase 5의 archive 단계 미수행).
plan 경로는 두 receipt(`mccp-plan-codex` · `mccp-implement-codex`)가 앵커로 삼고 있어, 지금 옮기면
`/mccp:pr`의 chain validate가 plan을 찾지 못한다. 또한 CLAUDE.md §3.11(v1.20.15)은 완료 plan의
목적지를 `completed/`가 아니라 `.claude/PRPs/plans/archived/`로 정하고 그 이동을 human-gate
`/mccp:archive-complete`가 소유한다고 명시한다. **PR 머지 후 `/mccp:archive-complete`로 처리**하는 것이
두 계약을 모두 지키는 경로다.

**D2 — Implement-Codex 리뷰 기록을 plan 본문이 아니라 sibling 파일에 썼다**.
command 2.5.4는 plan 본문 append를 지시하지만, 그렇게 하면 plan hash가 바뀌어 상류
`mccp-plan-codex` 봉인이 stale이 되고 2.5.7이 자기 게이트에서 exit 2로 막힌다(실측 — 진입 시
validate는 exit 0이었으므로 원인은 이 명령의 주입 자체다). 이는 STATE.md backlog에 이미 기록된
구조 결함이며 plan 본문도 같은 "고정점 모순"을 자기 축에서 서술하고 있다. 2.5.6 Step A가
검증 대상을 `<plan or notes path>`로 명시하므로 계약 안이고, 두 봉인이 모두 보존된다.
기록 위치: `.claude/notes/setup-gitignore-m1-implement-review.md`.

**D3 — plan의 stdout `reason` 스키마를 좁혔다** (Implement-Codex F1 흡수). plan은
`reason`에 "그 외 throw 메시지"를 허용했는데, 그러면 `plugin.json` 파싱·fs 권한 오류가
OS/Node별 문자열로 프로토콜에 샌다. **폐쇄 enum 8종**으로 확정하고 비-`ProvisionError`는
`internal-error`로 매핑했다. exit code 계약(비-skip은 전부 exit 1)은 불변이므로 **좁히는 방향**이다.
신설 값 2개: `lock-timeout`(F2) · `symlink-target`(security S1).

**D4 — lock 획득 대기 계약을 신설했다** (F2 흡수). plan은 후행 writer가 "기다렸다 noop exit 0"을
요구하면서 최대 대기·재시도 간격·timeout 사유를 정하지 않아 구현이 즉시 실패든 무한 대기든
계약을 만족한다고 읽혔다. **최대 10초 · poll 50ms · 초과 시 `lock-timeout` exit 1**로 확정했고,
env `MCCP_GITIGNORE_LOCK_WAIT_MS`로 test가 결정론적으로 이 경로를 밟는다.

**D5 — 보안 흡수 3건이 plan에 없던 방어를 추가했다**: symlink 대상 거부(S1) ·
lock/tmp/`.bak` `0o600`(S2) · `.bak` 덮어쓰기 의미 명시(S3). 전부 plan과 모순되지 않는 추가다.

## Issues Encountered

1. **`withTempRepo`가 async 자식보다 먼저 임시 repo를 삭제** — 병렬 writer test 2건이
   `git-unavailable`로 오탐 실패했다. 동기 helper의 `finally`가 콜백 반환 즉시 도는데, 콜백이
   자식을 띄우고 바로 반환했기 때문. `withTempRepoAsync`를 분리해 해소.
2. **Windows 8.3 단축 경로** — `os.tmpdir()`은 `ADMINI~1`, git은 긴 형식을 반환해 경로 문자열
   비교가 무의미했다. `fs.realpathSync.native` 기반 `samePath()`로 해소.
3. **CHANGELOG `currently` note 선재 drift** — `1.23.6`에 멈춰 있었고 origin/main도 동일. Task 4에서 정정.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/gitignore-provision.test.js` | 79 | merge 의미론 · 손상 marker 4케이스 · `parseEntries` inline `#` · `spawnSync` 6행 판정표 + `LC_ALL` · 실제 write E2E · `git check-ignore`/`ls-files --stage` · UI4 채널 · `--repo` 격리 · 동시성 4종(중간 편집·병렬 writer·lease 만료·tmp 고유성) · symlink 거부 · lock 소유권 · CLI exit 0/1/2 · drift lint 4 · `setup.md` 계약 14 · 워크플로 트리거 · 오염 스코프 · 회수 신원 재검증 |

2건은 POSIX 전용 모드 단언이라 Windows에서 skip되고 CI의 `ubuntu-latest` job에서 실행된다.

## 미해결 (의도적)

- **ROLLOUT-1 (blocking, 저장소 설정)**: `gitignore-drift`를 main branch protection의 required
  check로 등록해야 한다. M1이 repo 파일로 보증하는 것은 "실행되고 red"까지이고, 그 red가
  머지를 막는 것은 repo diff로 검증 불가능해 Acceptance에 미완료로 남겼다.
- **`--force-update` 재검사~rename 사이 마이크로초 창**: 임의 편집기의 쓰기를 막는 이식 가능한
  배타 잠금 원시가 Node에 없어 user-space에서 제거 불가. 기본 실행에는 전체 교체가 **존재하지
  않으므로** 창도 없고, 남는 창은 사용자가 그 순간 명시 요청한 경로뿐이다.

## Next Steps

- [ ] `/mccp:prp-commit` → `/mccp:pr`
- [ ] **머지 후**: `gitignore-drift` required check 등록 (ROLLOUT-1)
- [ ] **머지 후**: `/mccp:archive-complete`로 PRD + plan 아카이브 (D1)

## 구현 후 로컬 리뷰 흡수 (`/mccp:code-review` 1라운드, 2026-08-14)

미커밋 상태에서 로컬 리뷰를 1회 돌려 **HIGH 1 · MEDIUM 8 · LOW 7**을 받았고 전부 흡수했다. 항목별 근거는 plan Acceptance의 "`/mccp:code-review` 흡수" 절이 소유한다. 성격상 세 부류다.

1. **계약과 코드의 불일치 (HIGH 1)** — `${DRY_RUN:+--dry-run}`이 미정의 변수라 "탐지 전용"이 실제 write를 했다. 같은 파일이 `MCCP_TMP`에 대해서는 lint로 막아 둔 결함군인데 한쪽만 열려 있었다. 명시 대입 + 계약 lint 13번(단항 문자열 금지의 일반화)으로 닫았고, 대입을 지우면 lint가 red가 됨을 실측했다.
2. **도구가 자기 목적을 예외로 둔 축 (MEDIUM 2)** — 프로비저너의 `.lock`/`.bak`/tmp가 정본에 없어 `git status`를 오염시켰고, 오염 스캔이 셸에 있어 호출자 cwd 스코프였다(하위 디렉토리 실행 시 부분 결과를 깨끗한 결과와 같은 모양으로 보고). 정본 26 → 29, 스캔 소유처를 `provision()`으로 이관해 repo root 스코프로 고정.
3. **선재 결함이 검사 자체를 무력화한 축 (MEDIUM 2)** — Validation 블록 6의 `grep -qF "- '...'"`은 패턴이 `-`로 시작해 grep이 옵션으로 파싱, exit 2로 죽었다. 즉 **블록 6·7이 한 번도 실행된 적이 없다**. 블록 2의 `git diff --exit-code`도 같은 사이클이 `.gitignore`를 정당하게 수정하면 무조건 red라 dry-run의 무해함이 아니라 워킹트리 청결함을 측정하고 있었다. 둘을 고친 뒤 **Validation 7블록 전체가 exit 0**으로 통과함을 확인했다.

lock 계층(회수 경쟁 · busy-wait · `WAIT_MS=0`)과 CLI 파싱(`--repo` 값 검증) 수정은 CHANGELOG `### Fixed`가 소유한다. 리뷰가 지적한 **STATE.md 연속성 불일치**는 `state-writer.js` API로 이 사이클에서 복구했고, **ROLLOUT-1 소실 위험**은 backlog 이중 등재로 닫았다.
