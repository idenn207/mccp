# Implementation Report: `/mccp:setup` gitignore 프로비저닝 (M1)

**Plan**: [.claude/plans/setup-gitignore-m1.plan.md](../plans/archived/setup-gitignore-m1.plan.md)
**Source PRD**: [.claude/prds/setup-gitignore.prd.md](../../prds/archived/setup-gitignore.prd.md) — M1이 유일 milestone이므로 PRD 종료
**Branch**: `setup-gitignore` · **Version**: 1.24.0 → **1.25.0** (§3.7 PRD 전체 완료 = minor · 병렬 브랜치 충돌 7번째 재발로 forward-only 한 칸 상향 — main이 meta-research-command M1에 `1.24.0`을 먼저 발행)

## Summary

`/mccp:setup`에 **Phase 5**를 신설해 mccp 런타임 무시 규칙 30줄을 대상 저장소 `.gitignore`에
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
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.25.0 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | page-foot 버전 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | derived 줄 버전 |
| `CHANGELOG.md` | UPDATED | `## [1.25.0]` + `currently` 정정 |
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

## Santa-loop 흡수 (`/mccp:santa-loop` R1, 2026-08-14)

implement receipt가 `codex_divergent`라 escalate된 건을 dual-review로 받았다. Reviewer A = Claude Opus(`code-reviewer`), Reviewer B = codex CLI `gpt-5.4` — 컨텍스트 격리 + 실제 모델 다양성이 성립했다. **양쪽 모두 FAIL**, 루브릭 10축 중 A는 1축(Security), B는 5축을 FAIL로 판정했다.

수렴한 지적은 하나다. **`assertNotSymlink`가 대상 `.gitignore`에만 걸려 있고 `.bak`에는 걸려 있지 않았다.** 이 모듈은 "`.gitignore`가 symlink일 정당한 형태는 없으므로 안전 경계를 계산하지 않고 거부한다"를 명시하는데, 그 논리가 똑같이 결정적이고 똑같이 사전 배치 가능한 `.bak`에는 적용되지 않았다. `.bak`은 기본 `'w'`로 쓰여 링크를 따라가므로, `--force-update` 시 사용자 `.gitignore`가 링크 대상에 얹힌다 — 저장소 쓰기 권한이 저장소 밖 임의 경로 쓰기로 확대되는 경로다. 두 리뷰어가 독립적으로 같은 줄을 지목했다.

**두 리뷰어가 갈린 지점은 실측으로 갈랐다.** A는 lock 경로도 같은 노출이라며 `'wx'`가 심링크를 따른다고 주장했고 B는 lock을 PASS로 봤다. 임시 저장소에서 직접 재현한 결과 `'wx'`는 EEXIST로 **거부**(victim 무손상), `'w'`는 링크를 **따라가 victim을 덮어씀**이었다 — A의 메커니즘 주장은 틀렸고 B의 `.bak` 지적이 맞다. lock 가드는 그래서 쓰기 노출이 아니라 **오류 계약** 때문에 추가했다: EEXIST가 이 루프에서는 "점유 중" 신호라, 가드가 없으면 존재하지 않는 live writer를 탓하며 lease를 소진한다.

B 단독 지적인 **빈 `.gitignore`의 선행 빈 줄**도 실측으로 확인해 흡수했다(없는 파일 → `create`는 블록으로 시작, 빈 파일 → `append`는 `\n`으로 시작). 데이터 유실은 없고 멱등성도 깨지지 않아 B가 매긴 HIGH보다 실질 심각도는 낮지만, 같은 종료 상태를 서술하는 두 경로가 관리 블록 바깥 줄에서 갈리는 것은 실재하는 결함이라 고쳤다.

양쪽이 공통으로 지적한 **테스트 공백**(`.bak`/lock symlink 미검증, 빈 파일 미검증)은 회귀 테스트 3건으로 닫았고, 셋 다 **가드를 제거하면 red가 됨을 변이 검증으로 실측**했다(가드 있음 `pass 1/fail 0` → 제거 후 `pass 0/fail 1`, 3건 모두). 79 → 82 tests, fail 0.

### R2 (fresh reviewer 2쌍, 앵커링 제거)

A = PASS, B = FAIL. **어느 한쪽이라도 FAIL이면 NAUGHTY**이므로 R1 지적의 재발 없음과 무관하게 라운드를 하나 더 돌았다. R2에서 갈린 축은 R1과 반대다 — 이번엔 A가 10축 전부 PASS를 줬고 그중 "symlink 가드가 모든 write 대상을 덮는다"와 "CI paths 필터 완비"는 **둘 다 사실이 아니었다**. B가 낸 3건을 실측으로 갈라 2건을 흡수했다.

1. **append 경로 symlink TOCTOU (사실)** — `assertNotSymlink` 이후 `appendFileSync` 사이에 대상이 교체될 수 있고 `'a'`는 링크를 따른다. `O_NOFOLLOW`를 태운 `openSync`로 open 자체가 거부하게 바꿨다. 단 **이 플랫폼에서는 실증되지 않는다** — win32는 `O_NOFOLLOW`가 `undefined`라 테스트가 skip된다(84 tests 중 skip 3). 실증은 CI `ubuntu-latest`가 소유하며, 그 사실을 테스트의 skip 사유에 적어 두었다.
2. **`.gitattributes`가 CI `paths`에 없음 (사실)** — 그 파일만 바꾸는 PR이 게이트를 통째로 건너뛰어, LF 보증을 지키는 단언이 실행되지 않은 채 그 보증을 은퇴시킬 수 있었다. 필터 + 트리거 lint 양쪽에 추가했다.
3. **`yarn-debug.log*`가 stale (거짓)** — 21개 REPO_ONLY 전부가 실제 `.gitignore`에 존재한다(실측 missing = `[]`). B가 `.gitignore` 앞부분만 보고 낸 오판이라 흡수하지 않았다. 다만 그 지적이 드러낸 **역방향 단언 부재**는 실재하므로, 현재 위반 0인 상태를 단언으로 고정했다.

R2 추가분 중 로컬에서 검증 가능한 2건도 변이로 red를 확인했다. **82 → 84 tests, fail 0.**

### R3 (3라운드 상한 소진 → 사용자 판단으로 종료)

A = PASS, B = FAIL. 상한에 걸려 loop 규정대로 **push하지 않고** escalate했고, 사용자가 "2건 수정 후 push"를 선택해 리뷰 라운드 없이 흡수했다.

1. **`setup.md` 계약 위반 (사실, 수정)** — dry run은 실제 실행과 같은 action을 반환하므로 action만 보고 분기하면 하지 않은 쓰기를 보고한다. 실측으로 확인했다(빈 저장소 `--dry-run` → `action=create`·`dryRun=true`·`addedLines=59`, 파일 미생성, 본문은 "갱신됨" 출력). 동시에 계약이 요구한 `addedLines` 보고를 본문이 아예 이행하지 않았고, dry run의 `pollution=null`을 "검사 실패" WARNING으로 오인했다. 셋을 `dryRun` 분기 + `addedLines` 소비로 닫고, 계약 lint를 16항목으로 늘려 고정했다.
2. **`--force-update` rename 경쟁 (사실이나 제거 불가, 축소)** — B는 CRITICAL로 봤지만 "변경되지 않았을 때만 교체"하는 원자적 rename이 portable하게 없으므로 **어떤 구현도 이 창을 닫지 못한다**. B가 제안한 두 번째 barrier도 좁힐 뿐이다. 그 축소는 실질적이라(창이 "파일 쓰기 두 번" → "syscall 몇 개") 채택하되, 주석과 CHANGELOG에 **닫지 못한다는 사실을 명시**했다. 차단 사유로 인정하지 않은 근거다.

lint 항목 16은 처음에 `/dryRun/` 단순 매칭으로 썼다가 **변이가 red가 되지 않아** 결함을 발견했다 — bash fence의 주석이 그 단어를 담고 있어 본문이 아무것도 읽지 않아도 초록이었다. 속성 접근(`\.dryRun\b`)으로 앵커링해 재검증했다. 새 lint 2건 모두 주석을 남긴 채 코드만 지웠을 때 red다.

**최종: 84 tests, pass 81, fail 0, skipped 3**(POSIX mode 2 + O_NOFOLLOW 1, 전부 Windows 한정 skip이며 CI ubuntu가 실증 소유).

## PR-Codex 게이트 흡수 (`/mccp:pr` Phase 2.5, 2026-08-14)

dedupe는 `skip_safe=false`(residual 120)라 PR-Codex가 실제로 발화했다. 3라운드에 걸쳐 6건.

| # | Severity | Verdict | 처리 |
|---|---|---|---|
| F1 | HIGH | ACCEPT_NOW | `--force-update` 동의 게이트 철회 → `update` 기본 적용. 블록에 버전이 박혀 있어 bump마다 전 설치가 낡은 규칙에 고정되고 setup은 성공을 보고했다(UI1 붕괴). 게이트 범위가 어긋나 있었다 — 동의가 보호하려던 건 사용자 줄인데 `update`가 치환하는 건 도구 소유 구간뿐 |
| F2 | MEDIUM | ACCEPT_NOW | 오염 스캔을 `-X` 임시 exclude 파일로 정본 패턴에 한정. `--exclude-standard`는 사용자 기존 규칙·`info/exclude`·global까지 평가해 무관한 파일의 untrack을 권했다 |
| F3 | HIGH | ACCEPT_NOW | `update`가 블록 **바깥** 줄의 개행까지 정규화했다(split+join). 원문 오프셋 스플라이스로 각 줄의 원래 terminator 보존. F1로 기본 실행이 되면서 실질 위험이 된 축 |
| F4 | MEDIUM | ACCEPT_NOW | dry-run이 줄 수만 보고. `update`가 기본이 된 이상 dry-run이 변경 내용을 볼 유일한 수단이라 실제 줄을 출력 |
| F5 | HIGH | **REJECTED_BY_DESIGN (재확인)** | "블록 안 사용자 줄이 지워진다". 같은 축이 Plan-Codex 이력 F15에서 이미 기각됐다 — marker 구간의 줄은 mccp가 쓴 mccp의 줄이고, 보존하면 관리 블록 개념이 성립하지 않는다. 다만 **F1로 실질 위험이 커진 것은 사실**이라 블록 안에 "이 사이 줄은 다음 실행에서 교체된다 · 사용자 규칙은 marker 바깥에" 경고 2줄을 넣어 실제 피해를 닫았다(`.bak`이 복구 수단) |
| F6 | MEDIUM | ACCEPT_NOW | `addedLines`는 update에서 *전체 교체 블록*인데 setup.md가 "추가할 예정"으로 보고했다. action별 문구 분리(추가 vs 교체 + `.bak` 안내) |

F1·F3·F4·F6은 **연쇄**다 — F1이 `update`를 기본 경로로 올리면서, 명시 동의 뒤에 숨어 있던 동작(개행 정규화·미흡한 preview·오해를 부르는 문구)이 전부 일반 실행의 표면으로 올라왔다. 라운드가 늘어난 이유이자, 한 번에 다 보이지 않았던 이유다.

### 이 loop에서 얻은 것

3라운드 내내 A는 R2·R3에서 PASS를 냈지만, 그 PASS의 근거로 든 "symlink 가드가 모든 write 대상을 덮는다"(R2) · "CI paths 필터 완비"(R2) · "Phase 5 bash가 provisioner JSON 계약과 일치"(R3)는 **모두 실측으로 거짓이었다**. B는 8건 중 7건이 사실이었다(오판 1건: `yarn-debug.log*`). 판정을 리뷰어 합의가 아니라 실측에 건 것이 매 라운드 결론을 갈랐고, "리뷰어 두 명이 PASS면 통과"였다면 R2 시점에 append TOCTOU와 dry-run 오보고를 안은 채 ship했을 것이다. 두 라운드에서 리뷰어가 각각 한 번씩 틀린 메커니즘 주장을 냈다(R1: A의 `'wx'`가 symlink를 따른다, R2: A의 "가드 완비"). 판정을 리뷰어 합의가 아니라 실측에 걸어 둔 것이 두 번 다 결론을 갈랐다.

## origin/main 병합 흡수 (PR #136 conflict 해소, 2026-08-14)

PR #136이 `CONFLICTING`(23 ahead / 87 behind)이라 `origin/main`을 merge로 흡수했다. rebase를
쓰지 않은 것은 §3.12 — 87 커밋 재작성이 evidence receipt가 참조하는 SHA 도달성을 깬다.

충돌 4건과 해소 근거:

| 파일 | 해소 | 근거 |
|---|---|---|
| `CHANGELOG.md` | 양쪽 보존 + 버전 상향 | main이 `[1.24.0]`을 meta-research-command M1에 발행. §3.7 forward-only — 발행된 번호는 불가침이고 이 항목은 PRD 전체 완료라 minor 축이므로 한 칸 위는 `1.25.0` |
| `.claude/state/STATE.md` | ours | 이 worktree의 live 세션 상태. main 쪽은 이미 ship된 MSW M5 세션 기록 |
| `.claude/state/fix-task-applied.md` | ours | 같음 — 이 브랜치의 live escalation은 `setup-gitignore-m1` |
| `.claude/plans/codex-findings-backlog.md` | 양쪽 보존 | append-only 로그. 양쪽이 서로 다른 항목을 같은 위치에 추가했을 뿐이라 손실 없이 병치 |

**병합이 정본 drift를 하나 유입시켰고 drift lint가 그것을 잡았다.** main의 MSW M5가 이 repo
`.gitignore`에 `.claude/state/journal/`을 넣었는데 정본·`REPO_ONLY` 어느 쪽에도 분류가 없어
"모든 repo 항목은 둘 중 하나로 분류될 것" 등식이 red가 됐다 — DD3이 존재하는 이유 그대로의
발화다. 저널은 `state-writer.update()`가 모든 mccp 세션에서 만드는 per-session 산출물이므로
정본에 넣었다(정본 29 → 30). plan 문서의 `29개` 표기는 계획 시점 기록이라 소급 편집하지 않았다.

§3.5.1 삭제 검증: `git diff --diff-filter=D --name-only origin/main` 공집합 · `origin/main`
트리에 있는데 인덱스에 없는 파일 0건 — 이 머지는 어느 파일도 드롭하지 않았다.

병합 후 실측: `gitignore-provision.test.js` 92 tests / 0 fail (6 skip = win32 symlink 게이트) ·
`renderer/tests/*` 672 tests / 0 fail.
