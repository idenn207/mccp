# Plan: /mccp:setup gitignore 프로비저닝 (M1)

**Source PRD**: `.claude/prds/setup-gitignore.prd.md`
**Selected Milestone**: 1 — gitignore 프로비저닝 Phase
**Complexity**: Small

## Summary

`/mccp:setup`에 Phase 5를 신설해 mccp 런타임 산출물의 무시 규칙을 대상 저장소 `.gitignore`에 멱등 병합한다. 규칙 블록은 marker로 감싸고, marker 바깥의 사용자 줄은 인덱스까지 보존한다. 정본 목록은 `gitignore-provision.js` 상수가 단독 소유하며, 이 repo `.gitignore`와 **양방향 대조하는 drift lint**를 전용 CI 워크플로로 걸어 한쪽에만 등록된 항목이 다른 쪽에 분류되지 않으면 red가 된다(양쪽 모두에 없는 경로는 이 대조로 잡히지 않는다 — DD3의 탐지 경계표 참조). 그 red를 **머지 차단으로 만드는 것은 저장소 설정**이며 repo 파일 밖이다 — 본 M1은 자동 실행까지를 보증하고, required check 등록은 명시된 배포 전제(Task 5)로 남긴다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | `/mccp:setup`이 mccp 런타임 무시 규칙을 대상 저장소 `.gitignore`에 멱등적으로 병합한다 | direction |
| UI2 | marker 블록 바깥의 사용자 `.gitignore` 줄은 절대 변경하거나 삭제하지 않는다. marker 사이는 도구 소유 구간이며 매 실행에서 통째로 교체된다 | constraint |
| UI3 | 사용자 기존 규칙의 정리나 중복 제거는 하지 않는다 | exclusion |
| UI4 | `.git/info/exclude`와 global gitignore는 대상이 아니다 | exclusion |
| UI5 | git 저장소가 아니면 skip하고 보고한다 | constraint |
| UI6 | 런타임 경로를 코드 스캔으로 자동 도출하지 않고 정본 목록을 명시 관리한다 | exclusion |
| UI7 | 이미 커밋된 오염 파일을 untrack하지 않는다, 감지되면 안내만 한다 | exclusion |
| UI8 | ship receipt `mccp-pr-codex`는 추적 대상으로 남아야 한다 | constraint |
| UI9 | `--dry-run`은 추가될 줄을 보여주고 파일에 쓰지 않는다 | constraint |
| UI10 | 산출물의 가치는 다른 프로젝트에 mccp를 설치할 때이며 이 repo 자신이 아니다 | direction |

> **UI2 개정 기록 (PR-Codex R3·R5, 사용자 승인).** 원문은 "사용자의 기존 `.gitignore` 줄은 절대 변경하거나 삭제하지 않는다"였고 **marker 바깥이라는 단서가 없었다**. PR-Codex가 두 라운드에 걸쳐 같은 축을 제기했다: 사용자가 marker 안에 직접 쓴 줄도 문자 그대로 "사용자의 줄"이므로 `update`의 전체 교체는 UI2 위반이다. 구현 쪽 해석("블록 안은 도구 소유")은 **원문에 없는 예외를 끼워 넣은 것**이었고, 그 판정은 옳았다.
>
> 사용자 제약이므로 재해석하지 않고 **사용자에게 물어 UI2를 좁혔다**. 근거: managed block은 dotfile 관리자·`ssh` known-hosts 등에서 확립된 계약이고, 임의 in-block 줄을 보존하는 대안은 **정본에서 은퇴시킨 규칙까지 영구히 남긴다**(런타임에 이전 정본을 알 수 없어 사용자 줄과 구분 불가). 가시성과 복구는 블록 안 경고 2줄 + `.bak`이 담당한다.
>
> 이 개정은 UI2를 **좁힌다** — 실질 보호 범위가 줄었으므로 숨기지 않고 여기 남긴다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/lib/dep-check.js:1-9` | `lib/<kebab>.js` + 상단 계약 주석 + `module.exports` 하단 + `require.main === module` CLI |
| CLI 인자 | `plugins/mccp/scripts/lib/settings-writer.js:123-161` | 위치 인자 `cmd` + `flag(name)` 헬퍼 + `--dry-run` 불리언 + `--path` override, usage는 exit 2 |
| 오류 계약 (**채택**) | `plugins/mccp/scripts/lib/settings-writer.js:139-161` | 라이브러리 함수는 throw, `require.main` 블록이 try/catch로 감싸 stderr 출력 + **exit 1** |
| 원자 쓰기 + 백업 | `plugins/mccp/scripts/lib/settings-writer.js:36-57` | `.tmp` write → 기존 파일 `.bak` 회전 → rename, rename 실패 시 copy+unlink fallback |
| lock + tmp 명명 | CLAUDE.md §3.6 evidence write lock 규약 | lock은 `<target>.lock`(owner token + lease reclaim), tmp는 `<target>.<pid>.<rand>.tmp`. 고정 tmp 이름은 병렬 writer끼리 충돌하므로 pid + nonce가 필수 |
| 탐지(비-오류) 반환 | `plugins/mccp/scripts/lib/dep-check.js:19-32` | **탐지 함수에만** 적용: 없음/불량을 sentinel로 반환하고 throw하지 않음 |
| Tests | `plugins/mccp/scripts/lib/tests/dep-check.test.js:1-20` | `node:test` + `node:assert` + `mkdtempSync` 임시 디렉토리 + `finally` rmSync |
| 정본 대조 lint | `plugins/mccp/scripts/lib/instruction-contract/lint.js` (MSW M4) | 명명된 제외 목록 + fail-closed 등식, 분류 안 된 신규 항목은 red |
| 커맨드 Phase | `plugins/mccp/commands/setup.md:98-126` | `## Phase N — <제목>` + skip 조건 + fenced bash + 결과 보고 문단 |
| CI 워크플로 골격 | `.github/workflows/axis-k-m2-cross-platform.yml` (파일 전체) | `on.pull_request.paths` + `workflow_dispatch` + `strategy.matrix.os` + `checkout@v4` → `setup-node@v4` → `node --test` 스텝. **스텝만 얹지 않고 이 골격으로 전용 파일을 만든다**(Task 5) |

## Design Decisions

### DD1 — 오류 계약은 **단일**: 라이브러리는 throw, CLI가 catch해 exit 1

`settings-writer.js`(throw + exit 1)와 `dep-check.js`(never-throw + 항상 exit 0)는 서로 다른 역할의 모델이며 한 모듈에 섞으면 fail-open이 생긴다. 여기서 소유 관계를 못박는다:

| 계층 | 계약 |
|---|---|
| `planMerge` / `applyMerge` | 실패 시 **throw** (`settings-writer.js:36-57` writeAtomic과 동일) |
| `resolveRepoRoot` / `detectTrackedPollution` | **탐지** 함수이므로 throw 금지, sentinel 반환 (`dep-check.js` 모델) |
| CLI `require.main` 블록 | 전체를 try/catch. 성공 → `{ok:true,…}` + exit 0. 실패 → stderr + `{ok:false,reason}` stdout + **exit 1** |
| `setup.md` Phase 5 | exit≠0이면 **stderr를 그대로 보여주고 setup을 halt**. `{ok:false}`를 성공으로 보고하는 경로 없음 |

`resolveRepoRoot`가 `{ok:false,reason:'not-a-git-repo'}`를 반환하는 것은 **오류가 아니라 정상 skip**이다(UI5) — CLI는 이 경우 `{ok:true,action:'skip',reason:'not-a-git-repo'}` + **exit 0**을 낸다. 오류(exit 1)와 skip(exit 0)을 exit code로 구분한다.

### DD2 — 정본 목록 소유처 (PRD Open Q1)

`gitignore-provision.js`의 `MCCP_IGNORE_ENTRIES` 상수. 이 repo `.gitignore`에서 런타임 추출하지 않는다(repo 고유 규칙 유출 위험 — PRD가 지적). 동기화는 **양방향 drift lint + 전용 CI 워크플로**가 강제한다(DD3).

### DD3 — drift의 실제 강제 지점

lint는 **선언된 두 집합 사이의 불일치**를 잡는다:

- `정본 − repo ≠ ∅` → red: 제품이 dogfood되지 않은 규칙을 배포하려 함
- `repo − 정본 − REPO_ONLY ≠ ∅` → red: 신규 경로가 분류되지 않음 (**PRD의 High risk를 잡는 방향**)

**탐지 경계를 정확히 적는다 (Plan-Codex 재실행 R1 HIGH).** 위 두 등식은 집합 *비교*이므로, 어떤 경로가 **양쪽 모두에 없으면** 두 집합이 그대로여서 lint는 초록이다. 즉 이 lint가 강제하는 것은 "한쪽에 들어온 항목이 다른 쪽에도 분류될 것"이지 "코드가 쓰는 모든 런타임 경로가 어딘가에 선언될 것"이 아니다.

초안은 그 빈틈을 **개발자 행동에 대한 가정**으로 메우고 있었다 — "새 경로는 언제나 이 repo에서 먼저 생기고, `.gitignore`에 없으면 `git status`가 즉시 오염되니 저자가 먼저 `.gitignore`를 고친다". 그건 관찰적 압력이지 기계적 불변식이 아니다. 저자가 양쪽 다 건드리지 않으면 아무것도 red가 되지 않고, 게다가 워크플로 `paths` 필터는 **런타임 산출물을 쓰는 코드 일반**을 포함하지 않으므로 그런 PR은 lint를 실행조차 하지 않을 수 있다.

| 실패 시나리오 | 이 lint가 잡나 |
|---|---|
| 정본에 있는데 repo `.gitignore`에 없음 | **예** |
| repo `.gitignore`에 있는데 정본에도 `REPO_ONLY`에도 분류 안 됨 | **예** |
| 코드가 새 런타임 경로를 쓰는데 **양쪽 모두 미등록** | **아니오** |

세 번째 줄을 닫으려면 "이 코드가 쓰는 런타임 경로" 인벤토리를 producer 쪽에서 선언하게 하고 그 producer 변경을 트리거에 넣어야 한다 — 별도 축이며 **M1 범위 밖으로 명시 이연**한다. M1은 세 번째 줄을 잡는다고 주장하지 않는다.

이 test를 **전용 워크플로 `.github/workflows/gitignore-drift.yml`**로 등록한다(Task 5). 자동 실행이 없으면 lint는 권고에 불과하다. 등록이 없애는 것은 **위 두 등식을 사람이 돌려야 한다는 의존**이며, "런타임 경로를 선언해야 한다는 것 자체를 기억할 의존"은 남는다 — 후자는 아래 탐지 경계표 3행이고 lint의 사거리 밖이다.

**강제는 두 층이고 M1은 그중 하나만 저장소 파일로 보증할 수 있다**(Plan-Codex R1 F2):

| 층 | 무엇 | M1이 보증하나 |
|---|---|---|
| 실행 | 대상 파일이 바뀐 PR에서 워크플로가 자동으로 돌고 drift면 red | **예** — `paths` 필터가 lint의 판정 입력과 같은 집합 |
| 차단 | 그 red가 머지를 막음 | **아니오** — branch protection / ruleset은 저장소 설정이라 repo 파일로 표현 불가 |

두 번째 층 없이 "필수 게이트"라고 부르면 거짓이다: required check로 등록되지 않은 워크플로는 red여도 권한 있는 사용자가 머지할 수 있다. 게다가 **워크플로를 신설했으므로 check 이름 자체가 새것**이라, 기존 branch protection이 이미 요구하고 있을 수도 없다 — 등록은 반드시 사람이 한 번 해야 하는 별도 행위다. 그래서 본 plan은 그것을 숨은 가정이 아니라 **명시된 배포 전제**로 Task 5와 Acceptance에 올린다.

강제가 성립하려면 **스텝 등록만으로는 부족하고 트리거가 걸려야 한다**(R6 architect HIGH). GitHub Actions의 `paths` 필터는 매칭되지 않는 PR에서 워크플로를 **아예 실행하지 않으므로**, 필터에 없는 파일만 바뀐 변경에서는 스텝이 존재해도 죽은 코드다. 그래서 `paths`를 lint의 **판정 입력과 같은 집합**으로 둔다 — drift는 정본 상수 또는 repo `.gitignore` 중 하나가 바뀔 때만 발생하므로 그 둘(+ 계약 lint가 읽는 `setup.md`, + test 파일 자신)이 트리거의 필요충분이다.

### DD4 — 나머지 PRD Open Questions

- **Q2 기존 오염 감지** → git 내장 `git ls-files -i -c --exclude-standard` 한 줄. 자체 로직 없음, 파괴적 동작 없음, 보고만(UI7). 이 명령이 실패하면(git PATH 부재·권한) **skip + 경고**하고 setup은 계속한다 — 오염 감지는 부가 정보이지 프로비저닝의 전제가 아니다. 실제 write 실패(DD1)와 달리 halt하지 않는다.
- **Q3 ship receipt opt-out** → M1에서 두지 않는다(YAGNI). marker 구분이 있어 원치 않는 사용자는 4줄을 지우면 되고, 재실행 시 되살아난다는 점을 setup.md에 명시한다.
- **Q4 버전 간 재실행 유도** → 새 채널을 만들지 않는다. 블록 첫 줄 `# managed by /mccp:setup (mccp <version>)`이 갱신 시 diff와 보고에 드러난다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/gitignore-provision.js` | CREATE | 정본 블록 + 순수 merge 오라클 + apply + CLI (DD1 오류 계약, DD2 소유처) |
| `plugins/mccp/scripts/lib/tests/gitignore-provision.test.js` | CREATE | merge 의미론 + 줄 순서 단언 + 멱등성 + 실제 write E2E + skip/오류 경로 + drift lint |
| `plugins/mccp/commands/setup.md` | UPDATE | Phase 5 신설(gitignore 프로비저닝), 기존 최종 보고를 Phase 6으로 이동 |
| `.github/workflows/gitignore-drift.yml` | CREATE | drift lint 전용 CI 게이트 — 자체 `paths` 필터 + Windows 포함 matrix (DD3, R6 architect HIGH) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.7` → `1.24.0` (PRD 전체 종료 = minor, §3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot 버전 동기 (i18n-surface.test.js가 plugin.json 파생으로 단언) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 버전 동기 (동일 단언) |
| `CHANGELOG.md` | UPDATE | `## [1.24.0]` 항목 + 상단 note의 `currently` 값 |
| `.claude/prds/setup-gitignore.prd.md` | UPDATE | M1 status `complete`, Plan 셀, Open Questions 4건 결정 기록 |
| `.gitignore` | UPDATE | 프로비저너 자기 부산물 3줄(`.gitignore.lock`·`.bak`·`*.tmp`) — 정본과 dogfood 동기 |

### 브랜치가 함께 싣는 M1 밖 커밋 (Implement-Codex 재실행 MEDIUM)

위 표는 **M1 구현의 경계**이고, 브랜치 `main...HEAD`의 diff는 그보다 넓다. 차이는 두 무리이며 어느 쪽에도 M1 밖 **코드** 변경은 없다.

**(1) M1 이전의 문서 전용 커밋 `1c5220a`** ("docs: add review-loop meta-analysis and 8 decomposed PRDs", 16 파일). 그중 `.claude/prds/setup-gitignore.prd.md`만 M1 소관이고 나머지는 후속 축의 PRD·메타 분석이다:

- `.claude/_meta/` — review-loop 메타 분석 2건 + README + 기존 `meta/` → `_meta/` 이동 3건
- `.claude/prds/` — `meta-research-command` · `review-loop-trust` · `santa-adjudication` · `santa-delta-review` · `santa-evidence-diversity` · `santa-loop-materialize` · `session-process-reclaim` (7건, 전부 신규 문서)
- `.claude/plans/diverse-agent-review-m1.plan.md` · `.claude/prds/diverse-agent-review.prd.md` — 상태 줄 정정

**(2) M1 사이클이 남긴 산출물·기록 8개.** 표는 *구현* 파일만 열거하므로 이들은 표에 없지만 전부 이 사이클의 것이다 — `git diff --name-only origin/main...HEAD`에서 표와 `1c5220a`를 빼면 정확히 다음이 남는다:

| 파일 | 무엇 |
|---|---|
| `.claude/plans/setup-gitignore-m1.plan.md` | 이 plan 자신 |
| `.claude/PRPs/reports/setup-gitignore-m1-report.md` | 구현 보고서 |
| `.claude/plans/codex-findings-backlog.md` | `DEFER_TO_BACKLOG` 항목 누적 (§1.3의 단일 파일) — **`1c5220a`가 아니라 M1 커밋 `9c02673`이 바꿨다** |
| `.claude/reviews/plan-review-setup-gitignore.md` · `-m1.md` | plan 승인 패널 기록 |
| `.claude/notes/setup-gitignore-m1-implement-review.md` | implement 리뷰 노트 |
| `.claude/state/STATE.md` · `fix-task-applied.md` | 게이트 파이프라인이 남기는 세션 연속성 상태 (§3.2, git-tracked) |

리뷰어가 "plan 경계 밖"을 놀라움으로 만나지 않도록 **선언되지 않은 스코프를 여기서 선언한다**. (1)의 문서들을 M1에서 떼어내려면 브랜치 히스토리 재작성이 필요하고, 순수 문서 추가라 M1 코드의 판정에 영향을 주지 않으므로 **분리하지 않고 명시하는 쪽**을 택했다.

## 정본 목록 (전수 — 구현자는 이 표를 그대로 옮긴다)

이 repo `.gitignore`의 비-주석·비-공백 항목은 **정확히 50개**이며, 아래 분류가 그 전수를 덮는다: `MCCP_IGNORE_ENTRIES` **29** + `REPO_ONLY` **21** = 50. lint가 이 분류를 집합 단언으로 검증한다(합계 등식은 아래 J1 사유로 폐기).

### `MCCP_IGNORE_ENTRIES` — 29개 (순서 유지, 주석 포함해 블록에 기록)

```gitignore
# Receipt chain — plan/implement receipts are session diagnostics (working-tree
# only); ship receipts (mccp-pr-codex) are the audit corpus and stay tracked.
# ORDER IS LOAD-BEARING: the negation must follow the ignore, and the lock/tmp
# re-ignores must follow the negation.
.claude/receipts/*
!.claude/receipts/mccp-pr-codex/
.claude/receipts/mccp-pr-codex/*.lock
.claude/receipts/mccp-pr-codex/*.tmp

# Session-local counters and advisory locks. STATE.md / fix-task.md stay tracked.
.claude/state/loop-counter.json
.claude/state/orchestration-runaway.json
.claude/state/*.lock

# completion-ledger entries ARE tracked; only the per-entry lock/tmp are local.
# The single-level glob above does not reach this subdir.
.claude/state/completion-ledger/*.lock
.claude/state/completion-ledger/*.tmp

# Per-session runtime state — never committed.
.claude/state/evidence-claims/
.claude/state/dispatches/
.claude/state/plan-review/
.claude/state/session-ledgers/
.claude/state/msw-events/
.claude/state/codex-stop-loop-input.txt
.claude/state/auto-handoff-log.jsonl
.claude/state/m3-friction-events.jsonl
.claude/state/hook-caps.json
.claude/state/*.env-snapshot.json
.claude/state/*.handoff-items.json

# hook-trace shards. NOT root-anchored: a hook whose cwd is a nested package
# writes its shards under that package's own .claude/.
**/.claude/state/hook-trace/

# derive cache — per-session/per-machine.
.claude/cache/

# ultracode delegation sidecar journal (per-task local audit).
*.delegations.jsonl

# impeccable tool byproducts. design.json is the shared design-direction config.
.impeccable/*
!.impeccable/design.json

# mccp worktree convention (CLAUDE.md §3.8).
.worktrees/

# This provisioner's own byproducts. The advisory lock and the atomic tmp are
# transient, but a crash leaves them behind; the .bak persists by
# design and is a verbatim copy of the pre-run file. A tool whose purpose is to
# keep runtime artifacts out of git must not exempt its own.
.gitignore.lock
.gitignore.bak
.gitignore.*.tmp
```

### `REPO_ONLY` — 21개 (제품 블록에 넣지 않는 이유를 각각 명시)

| Entry | 제외 사유 |
|---|---|
| `node_modules/` `*.log` `npm-debug.log*` `yarn-debug.log*` `yarn-error.log*` | 일반 Node 규칙 — mccp 런타임 아님 |
| `Thumbs.db` `.DS_Store` `Desktop.ini` `*.stackdump` | OS 산출물 — mccp 무관 |
| `.vscode/` `.idea/` `*.swp` `*.swo` | IDE — mccp 무관 |
| `dist/` `build/` `*.tsbuildinfo` | 빌드 산출물 — mccp는 빌드 단계 없음 |
| `.env` `.env.local` | 일반 비밀 — 대상 repo의 정책이지 mccp가 정할 것 아님 |
| `.claude/settings.local.json` | Claude Code 일반 파일 — mccp 런타임 산출물 아님 |
| `ECC/` | 이 repo의 fork seed 체크아웃 — 고유 |
| `.claude/state/dogfood-*/` | 이 repo의 test fixture/sandbox — 고유 |

## Tasks

### Task 1: `gitignore-provision.js` — 정본 + merge 오라클 + CLI

- **Action**:
  - `BEGIN_MARKER = '# >>> mccp runtime artifacts — managed by /mccp:setup >>>'` / `END_MARKER = '# <<< mccp runtime artifacts — managed by /mccp:setup <<<'`.
  - `MCCP_IGNORE_ENTRIES` / `REPO_ONLY` — 위 "정본 목록" 절의 전수를 그대로 옮긴다. `REPO_ONLY`는 `[{ entry, reason }]` 형태로 사유를 코드에 남긴다.
  - `buildBlock(version)` → `BEGIN_MARKER` + `# managed by /mccp:setup (mccp <version>)` + entries + `END_MARKER`. **version 출처**: `require('../../.claude-plugin/plugin.json').version` (모듈 로드 시 1회). CLI 플래그로 받지 않는다 — 호출자가 임의 문자열을 주면 marker의 버전 주석이 실제 배포 버전과 어긋나 DD4-Q4의 "갱신이 diff에 드러난다"가 거짓이 된다. plugin.json 읽기 실패는 throw(DD1) — 버전을 모르는 채 블록을 쓰지 않는다.
  - `locateManagedBlock(lines)` → **`stripManagedBlock`과 `planMerge`가 공유하는 단일 판정기**. marker 상태를 3갈래로 확정한다(R6 invariant MEDIUM — 두 함수가 손상 입력을 각자 다르게 해석하던 것을 하나로 합친다):

    | 상태 | 조건 | 반환 |
    |---|---|---|
    | `absent` | BEGIN 0개 **및** END 0개 | `{ state:'absent' }` |
    | `wellFormed` | BEGIN **정확히 1개** ∧ END **정확히 1개** ∧ `endIdx > beginIdx` | `{ state:'wellFormed', beginIdx, endIdx }` |
    | `damaged` | 그 외 전부 (한쪽만 · 개수 2 이상 · 역순) | `{ state:'damaged', detail }` |

    **"첫 BEGIN + 그 뒤 첫 END"로 느슨하게 매칭하지 않는다.** 그 규칙은 손상 상태에서 사용자 줄을 삼킨다: `.gitignore`가 `[BEGIN(고아), ...사용자 줄..., BEGIN, 블록, END]`가 되면 첫 BEGIN과 첫 END 사이에 **사용자 줄이 통째로 들어가고**, 그 구간을 치환하는 순간 UI2가 깨진다. 개수까지 세는 엄격 판정이 그 경로를 없앤다.
  - `stripManagedBlock(text)` → `wellFormed`면 그 구간(marker 줄 포함)을 제거한 문자열, `absent`·`damaged`면 **원문 그대로**. 읽기 전용이므로 보수적으로 남긴다 — 손상 상태에서 줄을 지우면 lint가 실제보다 적은 집합을 보고 조용히 통과한다. drift lint가 provision 전후로 **같은 집합**을 보게 하는 유일한 장치다(R5 architect CRITICAL).
  - `parseEntries(text)` → drift lint와 merge가 **공유**하는 단일 파서. 규칙: `split(/\r?\n/)` → 각 줄 `trim()` → 빈 줄 제거 → `startsWith('#')` 줄 제거. **inline `#` 주석은 처리하지 않는다** — gitignore 스펙상 `#`는 줄 첫 문자일 때만 주석이고 그 외에는 리터럴이므로, inline 제거는 유효한 패턴을 훼손한다.
  - `planMerge({ content, version })` → **순수 함수**. 반환 `{ action:'create'|'append'|'update'|'noop', nextContent, addedLines, eol, sourceHash }`. `sourceHash`는 계획의 입력이 된 `content`의 sha256(파일 부재면 `null`)이며, 아래 `applyMerge`의 **선행 조건**으로만 쓰인다. EOL은 첫 `\r\n` 존재로 판정해 보존(기본 `\n`). `locateManagedBlock` 상태별 동작:

    | 상태 | 동작 |
    |---|---|
    | 파일 부재 | `create` — 블록만 |
    | `absent` | `append` — 끝에 빈 줄 하나 두고 블록 추가. 기존 줄 인덱스 불변(UI2) |
    | `wellFormed` | `update` — 그 구간만 치환. 바깥 줄 인덱스 불변(UI2). 결과가 기존과 동일하면 `noop` |
    | `damaged` | **throw** → CLI `{ok:false, reason:'marker-damaged'}` + **exit 1**, 파일 무변경 |

    **손상 marker에서 append로 강등하지 않는다**(R6 invariant MEDIUM에서 설계 변경). 초안은 "파괴 금지"를 이유로 append했는데, 그것이 오히려 파괴로 가는 경로였다: append하면 고아 BEGIN이 남은 채 블록이 하나 더 생겨 **다음 실행의 입력이 `damaged`로 굳고**, 느슨한 매칭과 결합하면 사용자 줄을 삼킨다. 매 실행마다 블록이 하나씩 늘어 멱등성도 함께 잃는다. 손상은 사람이 marker 줄을 손댔다는 뜻이므로 **읽고 멈추는 것**이 유일하게 안전한 응답이다. stderr는 어느 marker가 몇 개인지와 복구 방법(고아 marker 줄 삭제 후 재실행)을 적는다. 그 외 실패도 **throw**(DD1).
  - `applyMerge(target, plan)` → `settings-writer.js:36-57` writeAtomic 골격(`.tmp` write → 기존 파일 `.bak` 회전 → rename, fallback copy+unlink)에 **lost-update 방어 3종을 얹는다**(Plan-Codex R5 F1). 실패는 전부 **throw**(DD1).

    **marker 바깥 줄을 구조적으로 보존하는 것이 이 설계의 핵심이다.** (초안은 여기에 "동의 없는 전체 파일 교체 경로를 하나도 남기지 않는다"고 적었고 그것이 R8 F1 → R9 F1의 결론이었다. 그 결론은 아래 "동의 게이트는 철회됐다" 절에서 뒤집혔다 — 현행 근거는 동의의 부재가 아니라 보존의 구조다.)

    | 경로 | 쓰기 방식 | UI2 |
    |---|---|---|
    | `create` | **`'wx'` 배타 생성** — 파일이 없어야만 성공 | 기존 줄이 없으므로 자명 |
    | `append` | **append-only** (`'a'`) — 블록만 덧붙임 | 기존 바이트를 읽고 다시 쓰지 않으므로 **유실될 대상 자체가 없다**. 방어의 결과가 아니라 구조적 성질 |
    | `update` | **marker 구간만 치환** — `.bak` + `sourceHash` 재검사 + tmp+rename. 별도 동의 플래그 없음 | 블록 바깥 줄은 구조적으로 보존(인덱스 부등식 test) |

    #### `--force-update` 동의 게이트는 철회됐다 (PR-Codex F1 HIGH 흡수)

    **이 절의 이전 결정은 그 반대였다** — `update`를 기본적으로 쓰지 않고 `action:'update-required'`만 보고하며, 실제 재작성은 `--force-update`를 준 경우에만 하도록 했다. 근거는 "동의 없는 전체 교체 경로를 하나도 남기지 않는다"였다(R9 F1).

    PR-Codex가 그 결정의 대가를 지적했고, 대가가 이득을 넘었다. **블록에는 plugin version이 박혀 있다.** 따라서 버전 bump만으로도 기존 설치 전부가 영구히 `update-required`가 되고, `/mccp:setup`은 그 플래그를 스스로 주지 않으므로 사용자가 수동으로 CLI를 돌리기 전까지 낡은 규칙에 머문다 — 그동안 setup은 **성공을 보고한다**. 즉 UI1("정본 규칙을 멱등 병합한다")이 첫 업그레이드 이후 조용히 성립하지 않게 된다.

    되짚어 보면 게이트의 **범위가 어긋나 있었다**. 동의가 보호하려던 것은 *사용자의 줄*인데, `update`가 치환하는 것은 *도구가 소유한 marker 구간*뿐이고 바깥 줄은 `planMerge`가 구조적으로 그대로 옮긴다(인덱스 부등식 test가 이미 단언). 보호할 사용자 내용이 그 경로에 없으므로 동의를 요구할 대상도 없었다 — "도구 자신의 블록 교체"를 "사용자 파일 재작성"과 같은 것으로 취급한 혼동이다.

    따라서 `--force-update` 플래그와 `update-required` action은 **제거**한다. 남는 방어(`.bak` · `sourceHash` 재검사 · tmp+rename · lock)는 그대로 `update` 경로에 적용된다 — 철회한 것은 동의 요구이지 복구 수단이 아니다. UI2는 여전히 성립한다: 근거가 "쓰지 않으므로 안전"에서 "블록 바깥을 구조적으로 보존하므로 안전"으로 바뀌었을 뿐이고, 후자가 원래 실제로 성립하던 성질이다.

    아래 3종 방어는 `update` 경로에 적용된다.

    **append-only가 만드는 별도 위험 3종도 함께 닫는다**(R9 F2). `create`는 `sourceHash`가 `null`이라 재검사에서 빠지는데 `'a'` 모드는 파일이 생겨 있어도 성공하므로, 계획 후 다른 프로세스가 `.gitignore`를 만들면 빈 파일 기준 블록이 그 끝에 붙는다:

    - `create`는 `'a'`가 아니라 **`'wx'`**로 연다. 파일이 생겨 있으면 `EEXIST` → `concurrent-modification` exit 1.
    - 블록 페이로드는 **항상 개행으로 시작**한다. 선행 바이트가 무엇이든 `BEGIN_MARKER`가 자기 줄에서 시작하며, 상대의 미종결 마지막 줄에 이어붙는 경로가 사라진다(`.gitignore`에서 선행 빈 줄은 무해).
    - append 후 **재read해 marker 쌍이 정확히 1개**인지 확인한다. 아니면(상대가 이미 블록을 갖고 있었다) 경고 + exit 1로 재실행을 안내한다. append-only는 파괴하지 않으므로 이 실패 모드는 **중복 블록**이고 재실행이 `update`/`damaged` 경로로 복구한다.

    **lock은 모든 쓰기 경로에 적용된다**(Plan-Codex R10 F1). 직전 개정이 방어 3종을 당시의 `--force-update` 전용으로 국한하면서 lock까지 함께 옮겼는데, lock은 전체 교체를 보호하는 장치가 아니라 **mccp writer를 직렬화하는** 장치다. `append`에서 lock이 빠지면 두 프로세스가 모두 `absent`를 관측하고 각자 블록을 붙여 managed 블록이 둘이 되고, 이후 실행은 `damaged`로 떨어져 **영구 파손**이 된다 — append-only는 파괴하지 않지만 중복은 만든다. 사후 marker 개수 검사는 이미 둘 다 쓴 뒤에야 탐지할 뿐 롤백하지 못한다. 이는 병렬 writer test의 불변식(양쪽 exit 0, 후행 `noop`)과도 정면으로 모순된다 — 그 불변식은 직렬화를 전제하기 때문이다.

    | 방어 | 적용 범위 |
    |---|---|
    | `<target>.lock` 직렬화 | **`create`/`append`/`update` 모든 쓰기 경로**의 read-plan-write 구간 전체 |
    | 해시 재검사 + `.bak` + tmp+rename 전체 교체 | **`update` 경로 전용** |
    | append 후 marker 쌍 1개 재확인 | 모든 경로 — lock에 협력하지 않는 **외부** writer에 대한 이중 안전장치 |

    | 세부 방어 (`update` 경로) | 내용 |
    |---|---|
    | 선행 조건 재검사 | 쓰기 직전 `target`을 **다시 읽어** sha256이 `plan.sourceHash`와 같은지 확인. 다르면 `reason:'concurrent-modification'`으로 **throw → exit 1**, 파일 무변경. 재계획을 자동으로 하지 않는다 — 사용자가 그 사이 무엇을 했는지 모르는 채 다시 덮어쓰는 것이 정확히 이 결함이다 |
    | 저장소별 lock (**전 쓰기 경로 공통**) | `<target>.lock` 획득 후에만 read-plan-write 구간 진입. owner token 대조 + **60초 lease + PID 생존 기반 tri-state**(same-host이고 PID가 살아 있으면 **절대 회수하지 않음**) + 장기 구간 heartbeat. §3.6의 `pr-phase.lock`/`quarantine.lock` 모델을 미러하며, **evidence write lock의 5초 lease는 쓰지 않는다** — 그 값은 ms 단위 임계구역 전용이고, 여기서는 느린 디스크나 백신 검사로 정지한 live writer의 lock을 두 번째 writer가 회수해 둘 다 백업·rename 경로에 진입하게 만든다(Plan-Codex R6 F2) |
    | 실행별 고유 tmp | `<target>.<pid>.<rand>.tmp`. 고정 이름이면 병렬 setup 두 개가 **같은 임시 파일에서 충돌**한다(§3.6이 같은 이유로 pid + nonce를 강제) |

    **원자적 rename은 lost update를 막지 못한다.** rename이 보장하는 것은 "부분적으로 쓰인 파일이 보이지 않는다"까지이고, `nextContent`가 이미 낡았다면 그 낡은 전체 내용이 원자적으로 착지할 뿐이다. 사용자가 read 이후 `.gitignore`의 **marker 바깥에** 줄을 추가했다면 그 줄은 **조용히 사라진다** — 현행 UI2("marker 블록 바깥의 사용자 줄은 절대 변경하거나 삭제하지 않는다")의 정면 위반이고, 순차 재실행만 다루는 test로는 영원히 보이지 않는다. (블록 **안쪽**은 UI2 개정 이후 도구 소유 구간이므로 이 위반 판정의 대상이 아니다.)

    **남는 창의 범위 (PR-Codex F1 이후 재서술).** `<target>.lock`은 mccp writer끼리만 협력시키고 임의 편집기의 쓰기를 막지 못하며, 그것을 막는 이식 가능한 배타 잠금 원시가 Node에 없다(Windows와 POSIX에서 의미가 다르다). 따라서 재검사와 rename 사이의 창 자체는 제거되지 않는다.

    동의 게이트를 철회했으므로 **"그 창에 들어가려면 사용자가 명시 요청해야 한다"는 이전 서술은 더 이상 성립하지 않는다** — `update`는 이제 일반 실행에서 일어난다. 대신 UI2의 근거가 바뀌었다:

    - 재검사는 **rename 직전에 배치**해 창을 최소화하고, `.bak`이 직전 상태를 보존한다.
    - `update`가 치환하는 것은 **marker 구간뿐**이고 바깥 줄은 `planMerge`가 그대로 옮긴다. 창 안에서 유실될 수 있는 것은 그 마이크로초 사이에 비협조 writer가 넣은 줄이지, 이 도구가 읽어서 버리는 사용자 줄이 아니다.
    - 즉 UI2는 "동의 없는 경로가 없어서"가 아니라 **"블록 바깥을 구조적으로 보존해서"** 충족된다. 잔여 창은 남으며 이 plan은 그것을 제거했다고 주장하지 않는다.
  - `resolveRepoRoot(cwd)` → **`spawnSync('git', ['rev-parse','--show-toplevel'], { cwd: cwd, encoding: 'utf8' })`**. `cwd` 옵션은 **필수**다 — 빼면 `--repo`가 무시되고 프로세스의 현재 디렉토리가 대상이 되어 **엉뚱한 저장소의 `.gitignore`를 쓴다`**(R2 security HIGH). 인자 `cwd`는 `--repo` 값 또는 `process.cwd()`. **throw 금지**, 대신 **실패 사유를 두 갈래로 나눈다**(R4 invariant HIGH):

    spawn 시 **locale을 고정한다**: `env: { ...process.env, LC_ALL:'C', LANG:'C' }`. 아래 3번이 git의 진단 메시지를 읽으므로, 번역된 메시지가 오면 판정이 무너진다.

    조건은 **위에서부터 순서대로 평가하고 첫 일치에서 확정한다**(R6 invariant MEDIUM — 조건이 겹칠 때 어느 쪽이 이기는지가 명세에 없었다):

    | # | 조건 | 반환 | CLI |
    |---|---|---|---|
    | 1 | `result.error` truthy | `{ ok:false, reason:'git-unavailable' }` | **exit 1** |
    | 2 | `result.status === null` (시그널 종료) | `{ ok:false, reason:'git-unavailable' }` | **exit 1** |
    | 3 | `status !== 0` ∧ stderr가 `/not a git repository/i`에 매칭 | `{ ok:false, reason:'not-a-git-repo' }` | `action:'skip'` + exit 0 |
    | 4 | `status !== 0` (그 외 전부) | `{ ok:false, reason:'git-error', stderr }` | **exit 1** |
    | 5 | `status === 0` | `{ ok:true, root: stdout.trim() }` | 정상 진행 |

    **1과 2는 실제로 동시에 참이 된다** — Node `spawnSync`가 ENOENT로 실패하면 `error`를 채우면서 `status`도 `null`로 둔다. 둘 다 `git-unavailable`로 가므로 겹침 자체는 무해하지만, 명세가 순서를 말하지 않으면 구현자가 `status` 분기를 먼저 써서 `status !== 0`을 만족시키는 `null`을 **오분류**할 수 있다(`null !== 0`은 참이다). 순서는 서술이 아니라 계약이다.

    **3과 4를 가르는 것이 이 표의 핵심이다**(Plan-Codex R1 F1). 초안은 "nonzero = git이 저장소가 아니라고 답한 것"으로 뭉갰는데, `git rev-parse`는 그 외에도 **저장소 손상 · unsafe ownership(`detected dubious ownership`) · 권한 실패 · 잘못된 호출**에서 nonzero를 낸다. 그 전부가 `not-a-git-repo`가 되면 **exit 0 skip → setup이 성공을 보고 → 규칙은 하나도 설치되지 않음**이라는, DD1이 막겠다고 한 바로 그 fail-open이 된다. `result.error`/`status===null` 검사는 **프로세스 spawn 실패**를 가를 뿐 **git의 진단 실패**를 가르지 못한다. 그래서 `not-a-git-repo`는 **좁게 확인된 부정 결과에서만** 내주고, 나머지 nonzero는 전부 오류(exit 1)로 fail-closed 처리한다. Task 2의 스텁 test가 이 5행 전부를 고정한다.

    **사유를 한 sentinel로 뭉개면 fail-open이다**: git이 PATH에 없거나 저장소가 손상됐거나 ownership이 거부된 환경에서 "저장소가 아니다"로 읽혀 조용히 skip하고 setup은 성공을 보고한다 — 실제로는 무시 규칙이 하나도 설치되지 않았는데도. **"git이 저장소가 아니라고 답한 것"(skip)** · **"git에게 묻지 못한 것"(`git-unavailable`)** · **"git이 다른 이유로 실패한 것"(`git-error`)** 은 서로 다른 사실이고, UI5의 정상 skip은 첫 번째뿐이다.
  - `detectTrackedPollution(root)` → **`spawnSync('git', ['ls-files','-i','-c','--exclude-standard'], { cwd: root, encoding: 'utf8' })`**. `cwd` 필수(같은 이유). **throw 금지**, 실패 시 `{ ok:false, reason:'git-unavailable', files:[] }` (DD4-Q2).
  - CLI: `node gitignore-provision.js provision [--dry-run] [--repo <path>] [--json]`. **`--repo` 값(없으면 `process.cwd()`)을 `resolveRepoRoot`의 `cwd` 인자로 그대로 전달한다** — 이 배선이 `--repo`가 실제로 대상을 바꾸는 유일한 경로다(R5 architect MEDIUM: 배선을 산문 밖에 두지 않는다). `require.main` 블록 전체 try/catch → 성공 exit 0 / 오류 stderr + exit 1 / **`not-a-git-repo`만** `action:'skip'` + exit 0 / `git-unavailable`·`git-error`·`marker-damaged`는 exit 1 (DD1). `--dry-run`은 `addedLines`를 출력하고 쓰지 않는다(UI9). 쓰기 대상 경로는 **항상 `resolveRepoRoot`의 반환값**이며 `--repo` 원문이 아니다(worktree/하위 디렉토리에서 호출해도 repo 루트에 쓰기 위함).
  - **stdout JSON 스키마** (Task 3이 파싱하므로 명시 고정):

    | 필드 | 타입 | 설명 |
    |---|---|---|
    | `ok` | boolean | 성공 여부. `false`는 exit 1과 항상 동반 |
    | `action` | `'create'｜'append'｜'update'｜'noop'｜'skip'` | null | `skip`은 not-a-git-repo (exit 0). `update`는 정본이 바뀌어 marker 구간을 치환했음(exit 0). 오류 경로(`ok:false`)에서는 **null** |
    | `reason` | string \| null | `skip`/오류일 때만 non-null. 값: `not-a-git-repo`(skip, exit 0) · `git-unavailable` · `git-error` · `marker-damaged` · `concurrent-modification` · 그 외 throw 메시지 (뒤 5개는 exit 1) |
    | `repoRoot` | string \| null | `resolveRepoRoot` 결과. 사용자가 대상 저장소를 눈으로 확인하는 축 |
    | `addedLines` | string[] | 추가·갱신될 줄. `--dry-run`에서 그대로 표시 |
    | `backupPath` | string | null | `.bak` 경로. **`update` 블록 교체에서만 non-null**이며 `create`/`append`/`dryRun`/`noop`/`skip`은 모두 null (R12 F1) |
    | `dryRun` | boolean | 쓰기 수행 여부 |
    | `version` | string | 블록에 기록된 mccp 버전 |

    `nextContent`는 stdout에 **싣지 않는다**(파일 전체를 stdout에 복제할 이유 없음). `planMerge`의 내부 반환에만 존재.
- **Mirror**: `settings-writer.js:36-57,139-161` (writeAtomic + CLI try/catch/exit 1), `dep-check.js:19-32` (탐지 sentinel), `dep-check.js:50-69` (`spawnSync` + 옵션 객체 전달 형태).
- **Validate**:
  ```bash
  node plugins/mccp/scripts/lib/gitignore-provision.js provision --dry-run --json   # exit 0, action 필드 존재
  git diff --exit-code .gitignore
  # --repo가 실제로 대상을 바꾸는지 — 다른 cwd에서 실행해 repoRoot가 --repo를 가리키는지 확인
  TMP=$(mktemp -d); git -C "$TMP" init -q
  (cd /tmp && node "$OLDPWD/plugins/mccp/scripts/lib/gitignore-provision.js" provision --repo "$TMP" --dry-run --json) \
    | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));if(!j.repoRoot||j.repoRoot.indexOf(process.argv[1])===-1)process.exit(1)" "$(basename "$TMP")"
  rm -rf "$TMP"
  ```

### Task 2: 테스트 — merge 의미론 + 오류/skip 경로 + 실제 write + drift lint

- **Action**: `gitignore-provision.test.js`에 다음 케이스. 전부 `mkdtempSync` 격리 디렉토리에서.
  - **merge 의미론**
    - `create`: 파일 부재 → 블록만 생성.
    - `append`: 기존 내용 뒤 append + **기존 줄 배열이 결과의 prefix로 완전 보존**(UI2).
    - `noop`: 같은 버전 재실행 → `action:'noop'` + content 바이트 동일(멱등성).
    - `update`: 정본이 바뀌면 marker 구간만 치환, marker 바깥 앞뒤 줄이 **인덱스까지** 동일.
    - **순서 단언**: 결과에서 `indexOf('.claude/receipts/*') < indexOf('!.claude/receipts/mccp-pr-codex/') < indexOf('…/*.lock')` 및 `< indexOf('…/*.tmp')`. 순서가 뒤바뀌면 negation이 무력화되므로 부등식으로 못박는다(PRD Critical risk).
    - CRLF 입력 → CRLF 출력, LF 입력 → LF 출력.
    - **손상 marker는 거부한다**(R6 invariant MEDIUM). `locateManagedBlock`이 `damaged`로 판정하는 4가지 입력 — (a) BEGIN만, (b) END만, (c) BEGIN 2개 + END 1개, (d) END가 BEGIN보다 앞 — 각각에 대해 `planMerge`가 **throw**하고 CLI가 **exit 1 + `reason:'marker-damaged'`**를 내며 **파일이 바이트 단위로 무변경**임을 단언한다. 특히 (c)는 "손상 입력에 append했을 때 만들어지는 바로 그 상태"이므로, append 강등이 되살아나면 이 케이스가 red가 된다.
    - **두 함수가 같은 판정을 쓴다**: 위 4개 입력 각각에서 `stripManagedBlock`이 **원문을 그대로** 반환함을 단언(읽기는 보수적으로 남기고, 쓰기는 멈춘다 — 서로 다른 방향이되 같은 `locateManagedBlock` 판정에서 나온다). `wellFormed` 입력에서는 `stripManagedBlock` 결과에 marker 줄이 하나도 남지 않음을 단언.
    - **inline `#` 보존**: 입력에 `foo#bar` / `*.log #keep` 같은 줄이 있을 때 `parseEntries`가 그 줄을 **원문 그대로** 반환(제거·절단 0). gitignore 스펙상 줄 첫 문자일 때만 주석이므로 inline 절단은 유효 패턴 훼손이다.
  - **실제 write E2E** (dry-run만으로는 검증 안 되는 축)
    - 임시 repo에 `git init` → `provision` 실행 → 파일에 블록 존재 확인 → **재실행** → `action:'noop'` + 파일 mtime/내용 불변. **`.bak`을 단언하지 않는다** — `create`/`append`는 전체 교체를 하지 않으므로 백업 대상이 없다(R11 F2). `.bak` 단언은 `update` 경로 test 전용이다.
    - **git이 실제로 무엇을 무시하는지 `git check-ignore`로 단언한다**(R6 invariant HIGH). 줄 순서 부등식(위 merge 그룹)은 *문자열 배치*를 볼 뿐 **git의 판정**을 보지 않는다 — negation 규칙이 순서는 맞는데 패턴 문법이 틀렸거나(`!` 뒤 경로 오타, 디렉토리 재포함의 상위 디렉토리 제외 규칙에 걸림) 하면 순서 단언은 통과하면서 receipt는 무시된다. PRD Success Metrics의 "ship receipt 보존 / 동일 시나리오에서 tracked 확인"은 이 검사가 유일한 근거다. provision된 임시 repo에서 파일을 실제로 만들고:

      | 경로 | 기대 | 검사 |
      |---|---|---|
      | `.claude/receipts/mccp-pr-codex/x.json` | **추적 가능** | `git add` 후 `git ls-files --stage`에 **존재** |
      | `.claude/receipts/mccp-pr-codex/x.lock` | 무시됨 | `check-ignore` exit 0 |
      | `.claude/receipts/mccp-pr-codex/x.tmp` | 무시됨 | `check-ignore` exit 0 |
      | `.claude/receipts/mccp-plan-codex/x.json` | 무시됨 | `check-ignore` exit 0 |
      | `.claude/state/foo.lock` · `.claude/cache/x` | 무시됨 | `check-ignore` exit 0 |

      **첫 행만 `check-ignore`로 검사하지 않는 것이 핵심이다**(Plan-Codex R3 F4). `git check-ignore -q <path>`는 무시 대상일 때 exit 0, 아닐 때 exit 1이므로 `! check-ignore`는 **"무시되지 않는다"까지만** 증명한다. PRD Success Metric이 요구하는 것은 **"tracked 확인"**이고, 그 둘은 같지 않다 — 파일이 무시되지 않으면서도 add되지 않아 전달 저장소에 존재하지 않을 수 있고, 그 상태에서 이 test는 green이다. 그래서 ship receipt만은 실제로 `git add -- .claude/receipts/mccp-pr-codex/x.json` 한 뒤 `git ls-files --stage`에 나타남을 단언한다. 부정 케이스(무시되어야 하는 4행)는 `check-ignore`가 정확한 도구이므로 그대로 둔다.

      선례: `durable-evidence-substrate.plan.md:324-328`이 `! git check-ignore -q .claude/receipts/mccp-pr-codex/x.json`을 쓴다 — 이 repo는 §3.12 증거 내구성 계약을 이미 test로 고정해 왔다. 여기서는 그것을 **설치 산출물에 대해** 재현하되, 위 이유로 긍정 케이스를 한 칸 더 강한 단언으로 올린다.
    - **`.gitignore` 외 무시 채널은 건드리지 않는다**(UI4, R6 test MEDIUM). provision 전에 `<root>/.git/info/exclude`에 sentinel 줄을 써 두고 실행 후 **바이트 동일**함을 단언하고, `git config --local core.excludesFile`이 실행 전후로 **미설정 상태 그대로**임을 단언한다. UI4는 Out of scope 문장으로만 존재해 반증 불가능한 주장이었다 — 부정 제약은 test가 없으면 지켜지는지 알 수 없다.
    - **이미 정본 규칙을 marker 없이 갖고 있는 repo**(= 이 repo의 현재 상태, R5 architect HIGH): 29개 정본 줄을 marker 없이 담은 `.gitignore`로 시작 → provision → (a) 기존 줄은 **하나도 삭제·변형되지 않고**(UI2/UI3), (b) marked 블록이 append되며, (c) `stripManagedBlock` 후 파싱한 집합이 provision 전과 **동일**함을 단언. 중복 줄이 생기는 것은 PRD Out-of-scope가 명시한 허용 동작이다("중복이 생겨도 git이 무해하게 처리한다") — 이 test는 중복을 없애라는 것이 아니라 **중복이 lint를 깨지 않음**을 고정한다.
    - **`--repo`가 대상을 실제로 결정한다**(R2 security HIGH): 임시 repo A와 B를 만들고, **cwd를 B로 둔 채** `--repo A`로 실행 → `A/.gitignore`에만 블록이 생기고 **`B/.gitignore`는 생성조차 되지 않음**을 단언. `spawnSync`에 `{cwd}`를 빠뜨리면 이 test가 red가 된다. `resolveRepoRoot`를 직접 호출해 반환 경로가 A임도 단언.
    - 기존 `.gitignore`가 있는 임시 repo에서 실행 후 **기존 줄 전부 보존**(append-only이므로 prefix 완전 일치). `.bak`은 생성되지 않음을 단언한다 — 전체 교체가 없었기 때문이다.
    - **`update` 경로 전용**: 정본이 바뀐 상태를 만들고 기본 실행 → 블록 교체가 일어나며 이때만 `.bak`이 생기고 **실행 전 파일과 바이트 동일**함을 단언(R3 test HIGH의 요구를 이 경로로 이관).
    - **경쟁 조건에서 사용자 줄이 유실되지 않는다**(Plan-Codex R5 F1). 순차 재실행만 보는 test는 이 축을 영원히 놓치므로 read-plan-write 사이에 변경을 **주입**한다:
      - *중간 사용자 편집*: `planMerge`까지 진행한 뒤(계획의 `sourceHash` 확보) 대상 `.gitignore`에 `late-user-rule/` 한 줄을 추가하고 그제서야 `applyMerge` 호출 → **throw + CLI exit 1 + `reason:'concurrent-modification'`**, 그리고 **`late-user-rule/`이 파일에 그대로 남아 있음**을 단언. 이 단언이 UI2를 실제로 지키는 유일한 기계 장치다.
      - *두 writer 병렬*: 같은 repo를 대상으로 `provision`을 2개 동시 실행 → **양쪽 모두 exit 0**. lock이 read-plan-write 구간 **앞에서** 획득되므로 후행 writer는 대기 후 선행이 완성한 내용을 읽고 그것으로 계획한다 — `sourceHash`는 방금 읽은 내용의 해시라 불일치가 생길 이유가 없고 결과는 `noop`이다(선행은 `create`/`append`). **후행에 exit 1을 기대하지 않는다**: 통상적인 동시 setup을 오류로 만들면 멱등성 주장과 어긋나고 타이밍 의존 실패를 낳는다. `concurrent-modification`은 lock에 협력하지 않는 **외부 편집기 경로 전용**이지 직렬화된 mccp writer 사이의 기대값이 아니다. 단언은 **기존 사용자 줄 유실 0** + marker 블록 **정확히 1개** + 두 exit code가 모두 0.
      - *tmp 충돌*: 병렬 실행 중 생성되는 tmp 경로가 서로 다름을 단언(`<target>.<pid>.<rand>.tmp` 규약). 고정 이름 구현이면 red.
      - *lease 만료 정지 시나리오*(Plan-Codex R6 F2): 단순 병렬 test는 이 축을 검출하지 못한다. writer A가 lock을 쥔 채 lease(60초)를 **넘겨 정지**한 상태를 만들고(lock 파일 mtime을 과거로 조작 + A의 PID는 살아 있음), writer B가 진입 → **B가 lock을 회수하지 못하고 exit 1**임을 단언. same-host이고 PID가 살아 있으면 회수 금지가 tri-state의 핵심이며, 5초 lease 모델을 그대로 가져오면 이 test가 red가 된다.
  - **skip / 오류 경로** (DD1)
    - non-git 디렉토리에서 CLI 실행 → **exit 0** + `action:'skip'` + `reason:'not-a-git-repo'` (UI5).
    - **nonzero의 의미를 갈라 단언한다**(R4 invariant HIGH + Plan-Codex R1 F1). `resolveRepoRoot`에 `spawnSync` 스텁을 주입해 5행 판정표 전부를 고정한다. **오직 1행만이 exit 0**이고 나머지는 전부 exit 1임을 단언한다 — 이 test가 red면 fail-open이 되살아난 것이다:

      | 스텁 | 기대 `reason` | 기대 exit |
      |---|---|---|
      | `{status:128, stderr:'fatal: not a git repository (or any of the parent directories): .git'}` | `not-a-git-repo` | **0** (`action:'skip'`) |
      | `{error: Object.assign(new Error('spawn git ENOENT'),{code:'ENOENT'}), status:null}` | `git-unavailable` | 1 |
      | `{status:null, signal:'SIGKILL'}` | `git-unavailable` | 1 |
      | `{status:128, stderr:"fatal: detected dubious ownership in repository at '/repo'"}` | **`git-error`** | 1 |
      | `{status:128, stderr:'fatal: not a git repository: .git/modules/x (broken)'}`— 손상 | **`git-error`** | 1 |
      | `{status:129, stderr:'usage: git rev-parse ...'}` — 잘못된 호출 | **`git-error`** | 1 |

      4~6행이 `not-a-git-repo`로 떨어지면 red다. 특히 5행은 **`not a git repository` 문자열을 포함하면서도 손상 상태**인 대비군으로, 패턴 매칭이 stderr 전체를 느슨하게 훑지 않고 git의 표준 부정 진단만 인정하는지 가른다(구현은 `/^fatal: not a git repository \(or any of the parent directories\)/m` 처럼 앵커를 좁힌다).
    - **locale 고정**: 스텁 호출 시 전달된 `env`에 `LC_ALL==='C'`가 포함됨을 단언. 빠지면 번역된 stderr에서 3행 매칭이 실패해 정상 non-git 디렉토리가 `git-error`(exit 1)로 오분류된다.
    - 대상 `.gitignore`를 읽기 전용/쓰기 불가로 만든 뒤 CLI 실행 → **exit 1** + stderr 비어있지 않음. (플랫폼별 권한 조작이 불안정하면 `applyMerge`에 주입한 실패 fs stub으로 대체하되, **CLI가 exit 1을 내는 것**을 반드시 단언한다.)
    - `detectTrackedPollution`이 실패 sentinel을 반환해도 `provision` 자체는 exit 0 (DD4-Q2 — 감지는 부가 정보).
    - **`plugin.json` 판독 실패는 throw → CLI exit 1**(R5 test MEDIUM): 존재하지 않는 경로 / 깨진 JSON을 주입해 `buildBlock`이 throw하고 CLI가 exit 1을 냄을 단언. 버전을 모르는 채로 블록을 쓰면 marker의 버전 주석이 거짓이 되어 DD4-Q4가 무너진다.
    - **정본 블록의 주석 보존**(R5 architect MEDIUM): `buildBlock` 산출물에 `ORDER IS LOAD-BEARING` 문자열이 존재함을 단언. 이 주석이 receipt 4줄의 순서 불변식을 후임 유지자에게 전달하는 유일한 채널이므로, 주석을 떨어뜨린 구현은 red가 되어야 한다.
    - `--dry-run`이 파일을 **쓰지 않음**: 실행 전후 파일 존재/내용 동일 단언.
  - **drift lint** (DD3)
    - repo root `.gitignore`를 `parseEntries`로 파싱하되 **managed 블록(marker 구간) 안의 줄은 제외**한다(`stripManagedBlock(content)` → `parseEntries`). 이 repo가 언젠가 provision되면 같은 26줄이 블록 안에 한 벌 더 생기는데, 그때도 lint는 **provision 전과 동일한 집합**을 봐야 한다. 파서는 Task 1의 공유 함수이며 test가 자체 구현하지 않는다.
    - **집합** 단언 2개: `정본 − repo === ∅` · `repo − 정본 − REPO_ONLY === ∅`. 위반 시 어긋난 항목명을 메시지에 포함. 집합 연산이라 중복 줄에 영향받지 않는다.
    - `정본 ∩ REPO_ONLY === ∅` 단언(이중 분류 검출). **합계 등식(`29 + 21 === 50`)은 쓰지 않는다** — provision된 repo나 사용자가 같은 줄을 두 번 적은 repo에서 개수가 어긋나 red가 되는데, 그 red는 실제 결함이 아니라 계수 방식의 취약함이다(R5 architect CRITICAL). 교집합 검사가 합계 등식이 잡으려던 이중 분류를 중복에 면역인 방식으로 잡는다.
    - `.gitignore` 부재는 **skip이 아니라 red** — 조용한 skip은 MSW M4가 이미 고친 결함군. 이 test는 repo 체크아웃에서만 도는 것이 정상이며, 파일이 없으면 그 사실 자체가 신호다.
  - **`setup.md` 계약 lint** — 이 검사의 **단일 소유처**다(R2 invariant CRITICAL + R3 test MEDIUM)
    - `plugins/mccp/commands/setup.md`를 읽어 Task 3 Validate 표의 **14개 항목**을 단언. 그 표가 항목 정의이고 여기가 실행 지점이며, Task 5가 이 test 파일을 CI에 등록한다 — 세 계층이 같은 검사를 중복 소유하지 않는다.
    - 이 test가 red면 exit-code 전파 계약이 본문에서 사라졌거나(6~8), 정의 없는 `MCCP_TMP` 리디렉션이 되살아났다(9)는 뜻이다.
  - **marker 블록 버전 표기** (R3 test HIGH): `create` 후 파일에 `# managed by /mccp:setup (mccp <plugin.json의 version>)` 줄이 **정확히 그 버전 문자열로** 존재함을 단언. 버전을 marker에 넣는 것이 DD4-Q4의 유일한 근거이므로, 표기 자체가 검증되지 않으면 그 결정은 주장에 그친다.
  - **`.bak` 내용 동일성** (R3 test HIGH → R12 F1로 경로 한정): **`update` 실행에서만** `.bak`이 생기며, 그때 **실행 전 파일과 바이트 동일**함을 단언한다(존재만이 아니라 내용까지). `.bak`은 전체 교체 시 사용자 파일 복구의 유일한 수단이므로 존재 확인만으로는 부족하다. **`create`/`append`에서는 `.bak` 미생성을 단언한다** — 전체 교체를 하지 않으므로 백업 대상이 없고, 여기서 `.bak`을 요구하면 쓰기 계약과 모순되어 구현이 불가능해진다.
- **Mirror**: `dep-check.test.js:11-20`의 `mkdtempSync` + `finally rmSync` 헬퍼.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/gitignore-provision.test.js`

### Task 3: `setup.md` Phase 5 신설

- **Action**: Phase 4 뒤에 `## Phase 5 — Provision .gitignore` 삽입, 기존 최종 보고를 `## Phase 6 — Final report`로 이동.
  - 상단 Flags 목록에 `--skip-gitignore` 추가(Phase 5 noop).
  - 본문 계약(DD1을 명령 본문에 그대로 씀):
    - `provision --json` 실행. **exit≠0이면 stderr를 그대로 보여주고 setup을 halt** — `{ok:false}`를 성공으로 보고하지 않는다.
    - `action:'skip'`(`not-a-git-repo`)이면 한 줄 보고 후 Phase 6으로(UI5).
    - `noop` → "이미 최신" / `create`·`append` → 추가된 줄 수(**`.bak` 없음** — 전체 교체를 하지 않는다) / `update` → 갱신된 줄 수 + `.bak` 경로.
    - `--dry-run`이면 `addedLines`만 출력하고 쓰지 않는다(UI9).
  - 오염 감지: `git ls-files -i -c --exclude-standard` 결과가 비지 않으면 목록 표시 + **untrack하지 않는다** 명시(UI7). 이 명령이 실패하면 경고 한 줄 후 계속(DD4-Q2).
  - marker 블록을 지우면 다음 재실행에서 되살아난다는 점 1줄 명시(DD4-Q3).
  - frontmatter `allowed-tools`에 `Bash(git:*)` 추가.
  - **Phase 5의 bash 블록은 아래를 그대로 쓴다.** exit-code 전파를 산문으로만 요구하면 "provision을 호출은 하되 exit status를 무시하는" 구현이 통과한다(R2 invariant CRITICAL). 계약을 실행 가능한 코드로 못박는다:

    ```bash
    # /mccp:setup Phase 5 — provision .gitignore (mccp gitignore-provision)
    # stderr는 리디렉션하지 않는다. 명령 stderr는 그대로 사용자에게 표시되므로
    # "stderr를 보여준다"는 요구가 이미 충족되고, 임시 파일이 없으니 그 파일
    # 경로가 미정의라 조용히 유실되는 경로 자체가 생기지 않는다.
    PROVISION_JSON=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/gitignore-provision.js" provision --json ${DRY_RUN:+--dry-run})
    PROVISION_EXIT=$?
    if [ "$PROVISION_EXIT" -ne 0 ]; then
      echo "[MCCP-SETUP-STOP] gitignore provisioning failed (exit=$PROVISION_EXIT). 위 stderr 참조." 1>&2
      exit "$PROVISION_EXIT"
    fi
    PROVISION_ACTION=$(printf '%s' "$PROVISION_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).action||"")}catch{process.stdout.write("")}')
    if [ -z "$PROVISION_ACTION" ]; then
      echo "[MCCP-SETUP-STOP] provision exited 0 but emitted no parsable action — refusing to report success." 1>&2
      exit 1
    fi

    case "$PROVISION_ACTION" in
      skip)   echo "[mccp:setup] git 저장소가 아님 — .gitignore 프로비저닝을 건너뜁니다." ;;
      noop)   echo "[mccp:setup] .gitignore 무시 규칙이 이미 최신입니다." ;;
      create|append|update)
        # backupPath는 `update` 블록 교체에서만 non-null이다. create/append는
        # append-only라 백업 대상이 없고 (none)으로 표시된다 — 이 분기를 합쳐 두되
        # 값 자체가 경로를 구분하므로 거짓 보고가 생기지 않는다(R12 F1).
        echo "[mccp:setup] .gitignore 갱신됨 (action=$PROVISION_ACTION). 백업: $(printf '%s' "$PROVISION_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).backupPath||"(none — 전체 교체 없음)")}catch{process.stdout.write("(none)")}')"
        # 이미 추적 중인 오염 파일 안내 — untrack하지 않는다(UI7).
        # 실패해도 setup을 막지 않는다: 감지는 부가 정보이고 프로비저닝의 전제가 아니다(DD4-Q2).
        # 실패(권한·손상·git 오류)와 "오염 없음"을 구분한다. 실패를 빈 결과로 접으면
        # 사용자는 둘을 구별할 수 없고 UI7 안내가 누락된 채 setup이 성공을 보고한다.
        POLLUTED=$(git ls-files -i -c --exclude-standard)
        POLLUTED_EXIT=$?
        if [ "$POLLUTED_EXIT" -ne 0 ]; then
          echo "[mccp:setup] WARNING: 오염 파일 검사를 수행하지 못했습니다 (git ls-files exit=$POLLUTED_EXIT). 위 stderr 참조. 이미 추적 중인 런타임 파일이 있는지는 확인되지 않았습니다 — 프로비저닝 자체는 완료됐습니다." 1>&2
        elif [ -n "$POLLUTED" ]; then
          echo "[mccp:setup] 이미 추적 중인데 이제 무시 대상이 된 파일이 있습니다. 자동으로 untrack하지 않습니다:"
          printf '%s\n' "$POLLUTED"
          echo "  제거하려면 직접: git rm --cached <path>"
        fi
        ;;
    esac
    ```

    `exit 0` + 판독 불가 stdout을 성공으로 읽지 않는 두 번째 분기까지 포함한다 — DD1의 fail-closed는 "exit≠0"만이 아니라 "성공을 확인하지 못한 모든 경우"다.

    **`$MCCP_TMP`를 쓰지 않는 것이 이 블록의 설계 선택이다**(R3 invariant CRITICAL). 초안은 stderr를 `"$MCCP_TMP/provision.err"`로 받았는데, `setup.md`에는 다른 커맨드(`plan.md` / `pr.md` / `resume.md`)가 갖는 `MCCP_TMP="$(git rev-parse --git-dir)/mccp/tmp"` + `mkdir -p` 정의가 **없다**. 미정의 변수로 리디렉션하면 오류 출력이 유실돼 DD1이 요구한 "stderr를 보여주고 halt"가 절반만 성립한다. 변수를 새로 정의하는 대신 **임시 파일을 없애는 쪽**을 택했다 — 이 Phase가 stderr를 파일로 붙잡을 이유가 애초에 없다.
- **Mirror**: Phase 서술 구조(제목 → skip 조건 → fenced bash → 결과 보고)는 `plugins/mccp/commands/setup.md:98-126`(Phase 4). 다만 **bash 블록의 형태는 Phase 4를 mirror하지 않는다** — Phase 4는 `Skill(codex:setup)` 호출이라 셸 오류 전파 선례가 아니다(R3 invariant HIGH). exit-code 검사 형태는 `plugins/mccp/commands/plan.md`의 `[MCCP-GATE-STOP]` 분기를 mirror한다.
- **Validate**: 명령 본문은 markdown이라 실행 E2E가 불가능하다 — **그 한계를 인정하고 계약의 구조를 정적으로 단언**한다.

  **이 계약 검사의 단일 소유처는 Task 2의 `setup.md` 계약 lint(test 파일 안)이며, Task 5가 그 test 파일을 CI에 등록한다**(R3 test MEDIUM — 세 곳에 흩어져 어디가 정본인지 모호했던 것을 여기서 확정). 아래 목록은 그 lint가 검사할 **항목의 정의**이고, 수동 실행용 사본이 아니다:

  | # | 검사 |
  |---|---|
  | 1 | `^## Phase` 개수 == 6 |
  | 2 | `gitignore-provision.js` 언급 존재 |
  | 3 | 오염 스캔을 **setup.md가 직접 실행하지 않음**(주석 언급은 허용) **및** `.pollution` 판독 존재 — 스캔의 소유처가 프로비저너(repo root 스코프)임을 고정한다. 셸이 다시 실행하면 호출자 cwd 스코프로 돌아가, 하위 디렉토리 실행이 부분 결과를 깨끗한 결과와 같은 모양으로 보고한다 |
  | 4 | `--skip-gitignore` 존재 |
  | 5 | `not-a-git-repo` 존재 |
  | 6 | `PROVISION_EXIT=$?` 존재 |
  | 7 | `if [ "$PROVISION_EXIT" -ne 0 ]` 존재 |
  | 8 | `exit "$PROVISION_EXIT"` 존재 |
  | 9 | **`MCCP_TMP` 문자열 부재** — 정의 없는 변수로 리디렉션하는 초안 회귀를 막는다 |
  | 10 | `case "$PROVISION_ACTION" in` 존재 **및** `skip`/`noop`/`create`/`append`/`update` 5개 action 이름이 모두 등장 — 방어 구조만 남고 보고 분기가 사라지는 경우를 잡는다(R5 invariant MEDIUM) |
  | 11 | `git rm --cached` 안내 문자열 존재 — 오염 감지가 **안내만** 하고 untrack하지 않는다는 UI7 계약의 고정 |
  | 12 | `POLLUTED_OK` 분기 존재 — 검사 실패를 "오염 없음"으로 접지 않고 명시 경고를 내는 DD4-Q2 계약의 고정(Plan-Codex R8 F2). 이것이 없으면 권한·손상 상황에서 사용자가 "검사됨"과 "검사 불가"를 구분할 수 없다 |
  | 13 | **bash fence가 보간하는 변수는 같은 파일에서 대입될 것**(`${CLAUDE_PLUGIN_ROOT}` 제외) — 9번의 일반화. 미대입 `${DRY_RUN:+--dry-run}`은 빈 문자열로 전개돼 "탐지 전용" 실행이 실제 write가 된다. 단항 문자열 금지로는 이 방향을 못 막는다 |
  | 14 | `case`에 `*)` 기본 분기 존재 — 폐쇄 집합 밖 action이 조용히 성공으로 흘러가지 않는다 |

  6~9·13이 없으면 fail-open 구현이 통과한다. 9는 "쓰려면 먼저 정의하라"가 아니라 "이 Phase는 임시 파일을 쓰지 않는다"는 설계 결정의 고정이다. 10·11·14는 검사 대상 문자열이 실제로 위 bash 블록 안에 존재하도록 맞춘 것이다 — R5 invariant HIGH는 lint가 요구하는 줄이 정작 블록에 없어 "그대로 쓰라"는 지시와 lint가 어긋나 있었음을 지적했다. 3은 9와 함께 **부재**를 요구하는 항목이다.

  **이 정적 검사가 무엇을 보증하지 않는지**: 커맨드 본문을 해석하는 것은 LLM이므로, 위 구조가 존재한다는 사실이 LLM이 그 분기를 실제로 밟는다는 보장은 아니다. 보증되는 것은 "계약 코드가 본문에서 삭제되거나 조용히 약화되면 red"까지다. 그 이상은 M1 범위 밖이며 주장하지 않는다.

### Task 4: 릴리스 동기

- **Action**: `plugin.json` `1.24.0`, `html.js` page-foot + `markdown.js` derived 줄 `v1.24.0`, `CHANGELOG.md` 상단 note의 `currently` 값 + `## [1.24.0]` 항목, PRD M1 status `complete` + Plan 셀 + Open Questions 4건 결정 기록.
- **Mirror**: CLAUDE.md §3.7 동기 대상(i18n 단언은 plugin.json 파생이라 별도 편집 불필요).
- **Validate**: i18n test는 renderer 2면만 덮으므로 나머지 3면을 명시 검사한다(R2 test MEDIUM).
  ```bash
  node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
  V=$(node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)")   # → 1.24.0
  grep -q "^## \[$V\]" CHANGELOG.md
  grep -qF "currently \`$V\`" CHANGELOG.md
  grep -c "^## \[$V\]" CHANGELOG.md                                          # → 1 (§3.7 헤딩 중복 금지)
  grep -q "| 1 | gitignore 프로비저닝 Phase |.*| complete |" .claude/prds/setup-gitignore.prd.md
  ```

### Task 5: drift lint를 CI 게이트로 등록 — **전용 워크플로 신설**

기존 `axis-k-m2-cross-platform.yml`에 스텝만 얹는 초안은 **작동하지 않는다**(R6 architect HIGH). 그 워크플로는 `on.pull_request.paths`로 트리거를 좁혀 두었고(L20-27) 필터에 `gitignore-provision.js`·`.gitignore`·새 test 파일이 없다 — 스텝을 추가해도 이 파일들만 바뀐 PR에서는 **워크플로 자체가 실행되지 않아** 스텝이 죽은 코드가 된다. DD3의 자동 실행 근거가 무너진다(그 자동 실행이 강제하는 범위는 DD3 탐지 경계표가 정하며, 양쪽 모두 미등록인 경로는 그 범위 밖이다).

같은 워크플로에 `paths`만 추가하는 것도 택하지 않는다. 두 가지 이유가 겹친다:

1. **Windows가 matrix에 없다.** `axis-k-m2`의 matrix는 `[ubuntu-latest, macos-latest]`이고, 파일 상단 주석(L12-13)이 Windows 제외를 명시적 설계로 선언한다. 이 plan의 CRLF/EOL 완화는 "CI가 Windows에서도 돈다"에 기대고 있었으므로, 그 워크플로에 얹는 한 그 완화는 **거짓 주장**이다.
2. axis-k-m2는 `pr-phase-guard` orphan-lock 검증이라는 별개 축의 공개 감사 기록이다. 무관한 경로를 그 트리거에 섞으면 게이트의 소유 축이 흐려지고, 그 워크플로가 은퇴할 때 이 게이트가 **조용히 함께 사라진다**.

- **Action**: `.github/workflows/gitignore-drift.yml` 신설.
  ```yaml
  name: gitignore canonical drift gate

  # DD3 강제 지점. MCCP_IGNORE_ENTRIES(정본)와 repo .gitignore가 어긋나면 red.
  # paths 필터는 lint의 판정 입력과 정확히 같은 집합이다 — drift는 정본 또는
  # .gitignore 중 하나가 바뀔 때만 발생하므로, 그 둘(+ 계약 lint가 읽는
  # setup.md, + test 파일 자신)이 트리거의 필요충분이다.
  on:
    pull_request:
      branches: [main]
      paths:
        - 'plugins/mccp/scripts/lib/gitignore-provision.js'
        - 'plugins/mccp/scripts/lib/tests/gitignore-provision.test.js'
        - 'plugins/mccp/commands/setup.md'
        - '.gitignore'
        - '.github/workflows/gitignore-drift.yml'
    workflow_dispatch:

  jobs:
    drift:
      name: ${{ matrix.os }} — canonical drift + EOL
      strategy:
        fail-fast: false
        matrix:
          os: [ubuntu-latest, windows-latest]
      runs-on: ${{ matrix.os }}
      steps:
        - uses: actions/checkout@v4
          with:
            # CRLF 케이스를 실측하려면 git의 EOL 변환이 없어야 한다. autocrlf가
            # 켜진 Windows 러너에서 체크아웃이 .gitignore를 CRLF로 바꿔 버리면
            # test가 검증하는 것이 코드가 아니라 러너 설정이 된다.
            fetch-depth: 1
        - uses: actions/setup-node@v4
          with:
            node-version: '20'
        - name: Run gitignore-provision tests (canonical drift gate)
          run: node --test plugins/mccp/scripts/lib/tests/gitignore-provision.test.js
  ```
  Windows를 matrix에 넣는 것이 CRLF 완화가 주장이 아니라 사실이 되는 유일한 조건이다.
- **Mirror**: `.github/workflows/axis-k-m2-cross-platform.yml`의 전체 골격(`on.pull_request.paths` + `workflow_dispatch` + matrix + `actions/checkout@v4` → `setup-node@v4` → `node --test` 스텝 순서). 파일을 새로 만들되 구조는 이 선례를 그대로 따른다.
- **Validate**:
  ```bash
  # 스텝 존재
  grep -c "gitignore-provision.test.js" .github/workflows/gitignore-drift.yml    # → 2 (paths + run)
  # 트리거가 실제로 걸리는지 — 이것이 R6 architect HIGH의 회귀 지점
  for p in 'plugins/mccp/scripts/lib/gitignore-provision.js' '.gitignore' 'plugins/mccp/commands/setup.md'; do
    grep -qF "- '$p'" .github/workflows/gitignore-drift.yml || { echo "MISSING PATH: $p"; exit 1; }
  done
  # Windows가 matrix에 있는지 — CRLF 완화의 근거
  grep -qF 'windows-latest' .github/workflows/gitignore-drift.yml
  ```
- **보증 범위와 배포 전제**(Plan-Codex R1 F2): 이 Task가 저장소 파일로 보증하는 것은 "해당 파일이 바뀐 PR에서 lint가 **실행되고 drift면 red**"까지다. 그 red가 **머지를 막는 것**은 branch protection / repository ruleset 설정이며 repo 파일로 표현할 수 없다.

  검토한 대안 2가지를 채택하지 않은 이유:

  | 대안 | 기각 사유 |
  |---|---|
  | 이미 required인 check에 lint를 붙인다 | 어떤 check가 현재 required인지는 저장소 설정이라 **plan 작성 시점에 확인할 수 없다**. 확인 못 한 전제 위에 강제를 세우면 F2가 지적한 거짓 주장을 형태만 바꿔 반복하는 것이다 |
  | ruleset 등록까지 Task에 포함 | API 호출은 가능하나 결과가 repo diff에 남지 않아 이 plan의 다른 acceptance처럼 **재현 가능한 검증이 불가능**하다. 검증할 수 없는 항목을 완료로 체크하는 것이 이 plan이 6라운드 동안 없애 온 패턴이다 |

  따라서 **미해결 배포 전제로 명시**한다 — ship 후 사람이 한 번 수행하고, 수행 전까지 이 게이트는 "실행되지만 차단하지는 않는" 상태임을 plan이 스스로 기록한다:

  > **ROLLOUT-1 (blocking, 저장소 설정)**: merge 후 `gitignore-drift` check를 main branch protection의 required check로 등록한다. 등록 전까지 DD3의 강제는 절반만 성립한다.

## Validation

```bash
# 1. 단위 + E2E + drift lint
node --test plugins/mccp/scripts/lib/tests/gitignore-provision.test.js

# 2. dry-run이 이 repo를 건드리지 않음
#    HEAD 대비 diff가 아니라 실행 전후 스냅샷 비교다. `git diff --exit-code`는
#    같은 사이클이 .gitignore를 (정당하게) 수정한 상태에서 무조건 red가 되어,
#    dry-run의 무해함이 아니라 워킹트리의 청결함을 측정한다.
BEFORE=$(mktemp); cp .gitignore "$BEFORE"
node plugins/mccp/scripts/lib/gitignore-provision.js provision --dry-run --json; echo "exit=$?"   # exit=0
cmp -s "$BEFORE" .gitignore || { echo "FAIL: dry-run wrote to .gitignore"; exit 1; }
rm -f "$BEFORE"

# 3. 실제 write E2E — 임시 repo에서 create → noop 멱등, 버전 표기 + .bak 내용까지
TMP=$(mktemp -d); git -C "$TMP" init -q
printf 'my-own-rule/\n' > "$TMP/.gitignore"; cp "$TMP/.gitignore" "$TMP/.before"
printf '# user sentinel\n' > "$TMP/.git/info/exclude"; cp "$TMP/.git/info/exclude" "$TMP/.exclude-before"
node plugins/mccp/scripts/lib/gitignore-provision.js provision --repo "$TMP" --json   # action=append
node plugins/mccp/scripts/lib/gitignore-provision.js provision --repo "$TMP" --json   # action=noop
grep -c "mccp runtime artifacts" "$TMP/.gitignore"                                     # → 2 (begin+end marker)
V=$(node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)")
grep -qF "# managed by /mccp:setup (mccp $V)" "$TMP/.gitignore"                        # 버전 표기 존재 (DD4-Q4)
test ! -f "$TMP/.gitignore.bak"                                                        # append 경로는 전체 교체가 없으므로 .bak 미생성 (R11 F2)
grep -q "my-own-rule/" "$TMP/.gitignore"                                               # 사용자 줄 보존 (UI2)

# 3b. git이 실제로 무엇을 무시하는가 — PRD Success Metric "ship receipt 보존"의 유일한 근거
#     (줄 순서 부등식은 문자열 배치만 본다. 여기서만 git의 판정을 본다.)
mkdir -p "$TMP/.claude/receipts/mccp-pr-codex" "$TMP/.claude/receipts/mccp-plan-codex" "$TMP/.claude/cache"
: > "$TMP/.claude/receipts/mccp-pr-codex/x.json"
: > "$TMP/.claude/receipts/mccp-pr-codex/x.lock"
: > "$TMP/.claude/receipts/mccp-plan-codex/x.json"
#     check-ignore는 "무시되지 않음"까지만 증명하므로 ship receipt는 실제 staging으로 확인한다.
git -C "$TMP" add -- .claude/receipts/mccp-pr-codex/x.json
git -C "$TMP" ls-files --stage -- .claude/receipts/mccp-pr-codex/x.json | grep -q . \
  || { echo "FAIL: ship receipt not tracked"; exit 1; }
git -C "$TMP" check-ignore -q .claude/receipts/mccp-pr-codex/x.lock   # 무시되어야 함 (exit 0)
git -C "$TMP" check-ignore -q .claude/receipts/mccp-plan-codex/x.json # 무시되어야 함 (exit 0)

# 3c. .gitignore 외 무시 채널 무손상 (UI4)
cmp -s "$TMP/.exclude-before" "$TMP/.git/info/exclude"                                 # .git/info/exclude 무변경
test -z "$(git -C "$TMP" config --local --get core.excludesFile || true)"              # global 채널 미설정 유지
rm -rf "$TMP"

# 4. non-git skip은 exit 0, 오류가 아님
TMP2=$(mktemp -d)
node plugins/mccp/scripts/lib/gitignore-provision.js provision --repo "$TMP2" --json; echo "exit=$?"   # action=skip, exit=0
rm -rf "$TMP2"

# 5. --repo가 대상을 결정 — 다른 cwd에서 실행해도 --repo 저장소에만 쓴다
A=$(mktemp -d); B=$(mktemp -d); git -C "$A" init -q; git -C "$B" init -q
( cd "$B" && node "$OLDPWD/plugins/mccp/scripts/lib/gitignore-provision.js" provision --repo "$A" --json )
test -f "$A/.gitignore" && test ! -f "$B/.gitignore"                                   # A에만 생성
rm -rf "$A" "$B"

# 6. CI 등록 — setup.md 계약 14항목은 §1의 test가 소유하므로 여기서 중복 검사하지 않는다.
#    스텝 존재만으로는 부족하다: paths 필터에 대상이 없으면 워크플로가 아예 안 돈다(R6 architect HIGH).
#    `-e`가 필수다: 패턴이 `-`로 시작하면 grep이 옵션으로 파싱해 exit 2로 죽는다.
grep -c "gitignore-provision.test.js" .github/workflows/gitignore-drift.yml            # → 2 (paths + run)
grep -qF -e "- '.gitignore'" .github/workflows/gitignore-drift.yml
grep -qF -e "- 'plugins/mccp/scripts/lib/gitignore-provision.js'" .github/workflows/gitignore-drift.yml
grep -qF 'windows-latest' .github/workflows/gitignore-drift.yml                        # write/lock/symlink 플랫폼 동등성의 근거
                                                                                       # (checkout EOL은 .gitattributes가 정한다 — 러너 설정이 아니다)

# 7. 버전 5면 동기 (Task 4 Validate 블록 전체)
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| write 실패가 setup 성공으로 보고됨 (fail-open) | Medium | DD1 단일 오류 계약 — 라이브러리 throw, CLI exit 1, Phase 5 halt. CLI가 exit 1을 내는 것을 test로 단언 + Phase 5의 exit-code 전파 코드를 `setup.md` 계약 lint가 CI에서 정적 단언 |
| **엉뚱한 저장소의 `.gitignore`를 씀** (`spawnSync`에 `{cwd}` 누락) | Medium (**High impact**) | Task 1이 `{cwd}`를 필수로 명시 + Task 2가 repo A/B 분리 test로 단언(누락 시 red). 대상은 항상 `resolveRepoRoot` 반환값 |
| `provision`이 exit 0 + 판독 불가 stdout | Low | Phase 5가 `action` 파싱 실패도 halt로 처리(성공 미확인은 실패) |
| **git 미설치가 정상 skip으로 읽혀 규칙 미설치인 채 성공 보고** | Medium (**High impact**) | `git-unavailable`(exit 1)과 `not-a-git-repo`(exit 0)를 분리하고 spawnSync 스텁 test로 고정 |
| 이미 정본 규칙을 marker 없이 가진 repo에서 drift lint가 오탐 | Medium | `stripManagedBlock` + 집합/교집합 단언(개수 무관). 중복 줄 자체는 PRD가 허용한 동작이라 제거하지 않음 |
| 사용자 `.gitignore` 손상 | Low | `create`/`append`는 전체 교체를 하지 않아 손상 경로가 없다. `update`만 marker 구간을 치환하며 바깥 줄 인덱스 보존을 test로 단언하고 쓰기 전 `.bak`을 남긴다(내용 동일성까지 단언) |
| **read-plan-write 사이 동시 변경으로 사용자 줄 유실**(lost update) | Low (**High impact**) | `create`는 `'wx'`, `append`는 append-only라 읽고 다시 쓰는 구간이 없다. `update`는 marker 구간만 치환하므로 유실 위험은 **비협조 writer가 재검사~rename 사이에 넣은 줄**로 한정된다(동의 게이트는 PR-Codex F1로 철회 — 그 게이트는 버전 bump마다 기능을 자기-비활성화시켰다). **`<target>.lock` 직렬화는 `create`/`append`/`update` 전 쓰기 경로에 적용**되며(빠지면 병렬 append가 블록을 중복시켜 영구 파손 — R10 F1), `sourceHash` 재검사 + `.bak` + `<target>.<pid>.<rand>.tmp`는 `update` 경로에 적용된다. 원자적 rename은 부분 파일만 막고 lost update는 못 막는다(R5 F1) |
| ship receipt까지 무시돼 증거 corpus 소실 | Low (**Critical**) | 3층으로 단언한다 — (1) receipt 4줄 인덱스 순서 부등식, (2) 무시되어야 하는 경로는 `git check-ignore`, (3) **ship receipt는 `git add` + `git ls-files --stage`로 실제 추적 확인**. (1)만으로는 패턴 문법 오류를 놓치고, (2)만으로는 "무시되지 않음"에 그쳐 PRD의 "tracked 확인"에 미달한다 |
| 정본이 코드와 드리프트(새 경로 누락) | High | **부분 완화 — 잔여 위험 존재.** 양방향 drift lint(집합 2 + 교집합) + 전용 CI 워크플로(Task 5, `paths` 필터가 정본·`.gitignore`·`setup.md`·`.gitattributes` 변경에서 반드시 실행)가 잡는 것은 **한쪽 집합에 들어온 항목이 다른 쪽에 분류되지 않은 경우**뿐이다. 새 런타임 경로가 정본과 repo `.gitignore` **양쪽 모두에 없으면 잡히지 않는다**(DD3 탐지 경계표 3행). 초안은 이 칸을 "repo 먼저, 정본 다음" 순서 불변식으로 메웠으나 그것은 개발자 행동에 대한 관찰적 가정이지 기계적 강제가 아니어서 DD3에서 폐기했다 — 따라서 이 위험은 M1에서 **완전 완화되지 않으며**, producer 쪽 인벤토리는 별도 축으로 이연 |
| red가 나도 머지돼 drift가 ship됨 (required check 미등록) | **Medium** | repo 파일로 닫을 수 없는 축 — **ROLLOUT-1**로 명시하고 Acceptance에 미완료 항목으로 남긴다. 등록 전까지 DD3 강제는 "실행되지만 차단 안 함"임을 plan이 스스로 기록(Plan-Codex R1 F2) |
| mccp-runtime ↔ REPO_ONLY 오분류 | Medium | 50개 전수를 plan에서 분류 완료 + `REPO_ONLY`에 사유를 코드로 보존 + **`정본 ∩ REPO_ONLY === ∅`** 교집합 단언이 이중 분류를 중복에 면역인 방식으로 잡음(합계 등식은 R5에서 폐기 — 중복에 취약) |
| CRLF 환경에서 줄 섞임 | Medium | EOL 감지·보존 + 양쪽 EOL test + **전용 워크플로 matrix에 `windows-latest` 포함**. 기존 `axis-k-m2`는 matrix가 `[ubuntu, macos]`라 Windows를 돌지 않는다(그 파일 L12-13이 제외를 명시) — 그쪽에 얹었다면 이 완화는 거짓 주장이었다 |
| 사용자가 marker 줄을 손대 손상 상태가 됨 | Low | `locateManagedBlock` 엄격 판정(개수까지) + `damaged` → **exit 1 무변경**. 느슨한 매칭이나 append 강등은 사용자 줄을 삼키거나 블록을 무한 증식시키므로 둘 다 채택하지 않음 |
| `git ls-files` 실패가 setup을 막음 | Low | DD4-Q2 — 감지 실패는 경고 후 계속(부가 정보). write 실패와 명시적으로 구분 |
| 병렬 브랜치와 버전 충돌 (day-0 병렬 PRD 8건) | Medium | §3.7 forward-only 상향 — merge 시 `## [1.24.0]` 중복이면 한 칸 올리고 동기 대상 전면 갱신 |

## Acceptance

- [x] Validation 7개 블록 전부 통과
- [x] `--repo A`를 cwd=B에서 실행해도 A에만 쓰임이 test로 확인됨 (`{cwd}` 누락 회귀)
- [x] `setup.md`의 exit-code 전파 3줄이 CI 계약 lint로 단언됨
- [x] `parseEntries`가 inline `#`를 절단하지 않음이 test로 확인됨
- [x] marker 블록의 `mccp <version>` 표기가 `plugin.json` 값과 일치함이 test로 확인됨 (DD4-Q4)
- [x] `.bak`은 **`update` 경로에서만** 생기며 그때 실행 전 파일과 **바이트 동일**함이 test로 확인됨. `create`/`append`에서는 **미생성**임을 단언 (R3 test HIGH → R11 F2로 경로 이관)
- [x] `setup.md`에 `MCCP_TMP` 문자열이 없음이 계약 lint 9번으로 확인됨
- [x] CHANGELOG `## [1.24.0]` 유일성 + PRD status `complete`가 Task 4 Validate로 확인됨
- [x] 임시 repo에서 `create` → 재실행 `noop`이 **실제 write 경로**로 확인됨 (dry-run 아님)
- [x] receipt 4줄 순서가 test에서 인덱스 부등식으로 단언됨
- [x] `.gitignore` 50개 항목이 `MCCP_IGNORE_ENTRIES`(29) 또는 `REPO_ONLY`(21)로 분류되고 **집합 단언 2개 + 교집합 공집합**이 test로 확인됨 (합계 등식 미사용 — 중복에 취약)
- [x] 정본 규칙을 marker 없이 이미 가진 repo에 provision해도 lint가 통과함이 test로 확인됨 (`stripManagedBlock`)
- [x] git 미설치(`git-unavailable`)가 skip이 아니라 **exit 1**임이 spawnSync 스텁 test로 확인됨
- [x] `plugin.json` 판독 실패가 exit 1임이 test로 확인됨
- [x] non-git-repo가 **exit 0 + `action:'skip'`**임이 test로 확인됨 (UI5)
- [x] write 실패 시 CLI가 **exit 1**을 냄이 test로 확인됨 (DD1)
- [x] `--dry-run`이 파일을 쓰지 않음이 test로 확인됨 (UI9)
- [x] **ship receipt가 실제로 추적됨**이 `git add` + `git ls-files --stage`로 확인됨 — `check-ignore`는 "무시되지 않음"까지만 증명하므로 PRD의 "tracked 확인"에 미달 (R6 invariant HIGH + Plan-Codex R3 F4)
- [x] `*.lock`/`*.tmp`/타 게이트 receipt는 `check-ignore`로 무시됨이 확인됨 (부정 케이스는 이 도구가 정확)
- [x] **`.git/info/exclude` 바이트 무변경 + `core.excludesFile` 미설정 유지**가 확인됨 (UI4, R6 test MEDIUM)
- [x] drift lint가 **전용 워크플로**로 등록되고, 그 `paths` 필터가 `gitignore-provision.js`·`.gitignore`·`setup.md`를 포함함이 확인됨 — 스텝 존재만으로는 트리거되지 않음 (DD3, R6 architect HIGH)
- [x] 그 워크플로 matrix에 `windows-latest`가 포함됨 — **write/lock/symlink 경로의 플랫폼 동등성**이 주장이 아니라 실행임. checkout 바이트가 LF인 것은 `.gitattributes`(`* text=auto eol=lf`)가 정하는 것이지 러너 EOL 설정으로 얻는 보증이 아니며, 그 사실 자체를 test가 단언한다 (R6 부수 발견 + code-review L1)
- [x] `locateManagedBlock`의 `damaged` 4케이스가 **exit 1 + 파일 무변경**임이 test로 확인됨, 그리고 같은 입력에서 `stripManagedBlock`이 원문을 반환함 (R6 invariant MEDIUM)
- [x] **중간 사용자 편집을 주입해도 그 줄이 유실되지 않음**이 test로 확인됨 — `concurrent-modification` exit 1 + 주입한 줄 잔존 (Plan-Codex R5 F1, UI2의 실효 보증)
- [x] **두 writer 병렬 실행에서 양쪽 모두 exit 0**(후행은 `noop`) + 기존 줄 유실 0 + marker 블록 정확히 1개가 test로 확인됨 — 직렬화된 mccp writer 사이에서 `concurrent-modification`을 기대하지 않는다 (Plan-Codex R7 F1)
- [x] 병렬 실행의 tmp 경로가 서로 다름(`<target>.<pid>.<rand>.tmp`)이 test로 확인됨 — 고정 이름이면 red
- [x] **lease를 넘겨 정지한 live writer의 lock을 두 번째 writer가 회수하지 못함**이 test로 확인됨 (60초 lease + PID 생존 tri-state, Plan-Codex R6 F2)
- [x] **`create`는 `'wx'` 배타 생성, `append`는 append-only**로 구현됨이 test로 확인됨 — 계획 후 파일이 생기면 `EEXIST` → `concurrent-modification` exit 1 (Plan-Codex R8 F1 · R9 F2)
- [x] **정본이 바뀌면 기본 실행이 블록을 교체하고, 블록 바깥 줄은 그대로 남는다**가 test로 확인됨 — `action:'update'` + `.bak` 바이트 동일 + 바깥 줄 보존 + 재실행 `noop`. 이전 기준("`--force-update` 없이는 교체가 일어나지 않음")은 **PR-Codex F1 HIGH로 철회**됐다: 블록에 버전이 박혀 있어 버전 bump마다 전 설치가 낡은 규칙에 고정되면서 UI1이 무너졌다
- [x] 블록 페이로드가 **항상 개행으로 시작**해 미종결 마지막 줄에 이어붙지 않음이 test로 확인됨 (R9 F2)
- [x] append 후 **marker 쌍이 정확히 1개**임을 재확인하고 아니면 exit 1임이 test로 확인됨 (중복 블록 검출, R9 F2)
- [x] **`<target>.lock`이 `create`/`append`/`update` 전 쓰기 경로에 적용됨**이 test로 확인됨 — `append`에서 빠지면 병렬 실행이 블록을 중복시켜 영구 파손되고 병렬 test 불변식과 모순된다 (Plan-Codex R10 F1)
- [x] **오염 감지 실패가 "오염 없음"과 구분됨** — `POLLUTED_OK` 분기 + 명시 경고가 계약 lint 12번으로 확인됨 (Plan-Codex R8 F2)
- [x] `spawnSync` 6행 판정표가 스텁 test로 고정됨 — **`not-a-git-repo`는 stderr가 git의 표준 부정 진단에 매칭될 때만**이고, dubious-ownership·손상·`status:129`는 `git-error`(exit 1) (Plan-Codex R1 F1)
- [x] 스텁에 전달된 `env`에 `LC_ALL='C'`가 포함됨이 단언됨 — 번역 stderr에서 판정이 무너지지 않음 (Plan-Codex R1 F1)
- [x] "CI 필수 게이트" 표현이 plan 전체에서 **실제 보증 범위**(자동 실행 + red)로 정정됨 (Plan-Codex R1 F2)
- [x] **ROLLOUT-1 미완료로 명시** — `gitignore-drift`를 required check로 등록하는 것은 저장소 설정이며 이 PR의 diff로 검증 불가. 등록 전까지 DD3 강제는 절반만 성립함이 plan에 기록됨

> **제거된 기준 2개 (Plan-Codex 재실행 R1 MEDIUM).** `All tasks complete`와
> `Patterns mirrored, not reinvented`는 관측 가능한 실패 조건이 없는 메타 기준이라
> 삭제했다. 전자는 위 열거 항목에서 *도출*되는 것이지 그 자신이 기준일 수 없고,
> 후자의 "mirrored"는 정성 판단이라 동작이 어긋나도 체크된 채 남는다 — 실제 대조는
> 위 Existing Patterns 표의 각 행이 소유한다.

### `/mccp:code-review` 흡수 (구현 후 로컬 리뷰 1라운드, HIGH 1 · MEDIUM 8 · LOW 7)

- [x] **HIGH — `--dry-run`이 프로비저너에 도달함**. `${DRY_RUN:+--dry-run}`이 미정의 변수라 빈 문자열로 전개돼, "탐지 전용"으로 요청한 실행이 실제 write를 하고 있었다. Phase 5가 `DRY_RUN=`을 **명시 대입**하고, 계약 lint 13번이 "bash fence가 보간하는 변수는 같은 파일에서 대입될 것"으로 결함군 전체를 고정한다(대입을 지우면 red가 됨을 실측). Phase 1의 "`--dry-run`이면 여기서 멈춤"과의 모순도 함께 해소 — Phase 5/6은 dry-run에서 아무것도 쓰지 않으므로 진행한다
- [x] **프로비저너 자신의 부산물이 정본에 포함됨** — `.gitignore.lock`·`.gitignore.bak`·`.gitignore.*.tmp`. `.bak`은 실행 직전 파일의 축자 사본이고 설계상 존속하므로, 무시하지 않으면 도구가 자기 목적(`git status` 청결)을 스스로 깬다. `git check-ignore` E2E로 단언
- [x] **오염 스캔이 repo root 스코프로 고정됨** — `provision()`이 스스로 실행하고 `pollution:{ok,files}`로 반환한다. 하위 디렉토리에서 CLI를 실행해도 root의 tracked-ignored 파일이 보고됨을 test로 단언(셸이 실행하던 시절엔 cwd 스코프라 부분 결과가 깨끗한 결과와 구별되지 않았다). `detectTrackedPollution`의 미사용 이중 구현도 함께 해소
- [x] **lock 회수 경쟁 차단** — 판정 시점의 신원 `(token, mtimeMs)`을 unlink 직전 재검증. 신원이 바뀐 lock을 지우지 않음 + 안 바뀐 stale lock은 여전히 회수됨(무조건 거부가 아님)을 test 2개로 단언
- [x] **lock 대기의 busy-wait 제거** — `Atomics.wait` 동기 sleep. 기존 spin은 대기 전체(기본 10초) 동안 코어 하나를 100% 점유했다
- [x] `MCCP_GITIGNORE_LOCK_WAIT_MS=0`이 즉시 실패로 해석됨(10초 기본값 복귀 아님)이 소요시간 단언으로 확인됨
- [x] `--repo`가 값 없이/다른 플래그와 함께 주어지면 usage 오류(exit 2) — 조용한 cwd 폴백과 `--json`이라는 이름의 디렉토리 대상화 둘 다 제거
- [x] non-git 디렉토리에서 손상 `plugin.json`이 있어도 skip(exit 0)임 — version 판독을 repo 해석 뒤로 이동
- [x] `applyMerge`가 미인식 action을 whole-file rewrite로 흘리지 않음(명시 거부 + 파일 무변경)이 test로 확인됨
- [x] `case`에 `*)` 기본 분기 — 폐쇄 집합 밖 action이 성공으로 보고되지 않음(계약 lint 14번)
- [x] 워크플로의 무효한 `core.autocrlf` 스텝 제거 + 근거를 `.gitattributes`로 정정. 재도입되면 checkout보다 앞서야 함을 lint가 단언하고, `.gitattributes`가 실제로 `eol=lf`를 고정하고 있음도 test가 단언
- [x] Validation 블록 2가 `git diff --exit-code` 대신 실행 전후 스냅샷 비교 — 같은 사이클이 `.gitignore`를 정당하게 수정한 상태에서 무조건 red가 되던 선재 결함(dry-run의 무해함이 아니라 워킹트리 청결함을 측정하고 있었다)
- [x] Validation 블록 6의 `grep -qF "- '...'"`에 `-e` 추가 — 패턴이 `-`로 시작해 grep이 옵션으로 파싱, exit 2로 죽던 선재 결함. 이 때문에 블록 6·7이 **한 번도 실행되지 않았다**
- [x] backlog의 "Broad stderr matching …" HIGH 항목 해소 표시 — `NOT_A_REPO_RE` 앵커링 + 판정표 5행으로 이미 닫혀 있었는데 미해결로 남아 신호를 죽이고 있었다

## Design Critique

- rounds: 1 (R0) / cap 2 · verdict: **CONVERGED**
- trigger: axis (a) detector positive — `impeccable-detect.js`가 `renderer/html.js` · `renderer/markdown.js` · `renderer/tests/i18n-surface.test.js`를 signal_files로 잡음.
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` 4 anchor를 읽고 이 plan의 **design-surface delta**에 대조함.
- 대조 결과 — 이 plan이 두 renderer 파일에 가하는 변경은 **버전 리터럴 `v1.23.7` → `v1.24.0` 뿐**이며 새 design surface를 도입하지 않는다.
  - 정보 위계 3단계 — plan 본문 heading depth 최대 3(`###`). 위반 없음. renderer 산출물 heading 구조 무변경.
  - 강조색 화면당 1개 — accent token 추가·변경 0.
  - raw markdown marker 금지 — 렌더 파이프라인 무변경. footer 문자열은 이미 렌더된 텍스트.
  - 한 화면 항목 수 상한 — 이 anchor는 **렌더 surface(STATUS.md / status.html)** 소관이며 plan 문서는 그 대상이 아니다. plan 표를 `<details>`로 접으면 `receipt/dedupe.js`의 planned matcher가 `Files to Change` 첫 열을 읽지 못해 cross-gate dedupe가 깨지므로, 접기는 개선이 아니라 회귀다. 비적용으로 판정.
- HIGH/CRITICAL finding: 0건 → R0에서 수렴.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없어 어떤 impeccable 명령도 **호출하지 않으며**, 아래는 구현자를 위한 체크리스트다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

이번 M1의 렌더 surface 변경은 버전 리터럴뿐이라 위 명령 중 실제로 발화할 축은 없다.

## Plan Review — R1 흡수 기록

R1 패널(architect / security / test / invariant) 판정 `divergent`, blocking 8건. 전문은 [`.claude/reviews/plan-review-setup-gitignore.md`](../../../reviews/plan-review-setup-gitignore.md). 흡수 내역:

| # | Perspective | Severity | 흡수 |
|---|---|---|---|
| F1 | invariant | CRITICAL | exit-code 계약 모순 → **DD1**로 계층별 소유 확정(라이브러리 throw / 탐지 sentinel / CLI exit 1 / Phase 5 halt), skip과 오류를 exit code로 분리 |
| F2 | invariant | HIGH | 같은 뿌리 — DD1 표가 `applyMerge` vs CLI wrapper 소유를 명시. Patterns 표의 mirror 대상도 역할별로 분리 |
| F3 | invariant | HIGH | Validation에 **실제 write E2E**(§3·§4) + Task 2 "실제 write E2E" 그룹 + Acceptance 항목 추가 |
| F4 | test | HIGH | non-git-repo case를 Task 2 skip/오류 그룹 + Validation §4 + Acceptance에 등재 |
| F5 | architect | HIGH | drift 강제 지점을 **DD3**로 명문화(순서 불변식 + 합계 등식) + **Task 5 CI 등록**으로 "기억 의존" 제거 — **이후 두 축 모두 폐기됨**: 합계 등식은 J1(R5)에서 중복 취약으로 집합 단언에 자리를 내줬고, 순서 불변식은 Plan-Codex 재실행 R1 HIGH에서 기계적 강제가 아닌 관찰적 가정으로 판정돼 DD3에서 삭제됐다. 이 행은 그때의 판단을 남긴 이력이며 현재 DD3의 서술이 아니다 |
| F6 | architect | MEDIUM | 정본 29 + REPO_ONLY 21 = 50 **전수를 plan 본문에 열거**(「정본 목록」 절) |
| F7 | architect | MEDIUM | lint 비-hermetic → `.gitignore` 부재는 red로 명시하고 이 test가 repo 체크아웃 전용임을 계약으로 씀 |
| F8 | architect | MEDIUM | 경계 규칙 → `REPO_ONLY`를 `[{entry,reason}]`로 코드에 사유 보존 + 합계 등식이 중복·누락을 기계 검출 |
| F9 | test | MEDIUM | `parseEntries` 파싱 규칙 확정(줄 trim / 빈 줄·선두 `#`만 제거 / **inline `#` 미처리** — gitignore 스펙) + merge와 lint가 **같은 파서** 공유 |
| F10 | test | MEDIUM | Task 3 validation을 `grep -c` 1개에서 5개 계약 검사로 교체 |
| F11 | invariant | MEDIUM | `git ls-files` 실패 경로를 **DD4-Q2**에 확정(경고 후 계속) + write 실패(halt)와 명시 구분 |

security는 R1에서 pass — 지적 없음.

## Plan Review — R2 흡수 기록

R2 패널 판정 `divergent`, blocking 6건(architect **pass**로 전환). 흡수 내역:

| # | Perspective | Severity | 흡수 |
|---|---|---|---|
| G1 | invariant | CRITICAL | Phase 5의 bash 계약을 **실제 코드로 plan에 기입**(`PROVISION_EXIT` 검사 + `exit "$PROVISION_EXIT"` + 판독불가 stdout halt) + 그 3줄을 Task 2 `setup.md` 계약 lint가 **CI에서 정적 단언**. 동시에 markdown 본문은 실행 E2E가 불가능함을 명시하고 보증 범위를 "계약 코드가 삭제·약화되면 red"로 한정 |
| G2 | security | HIGH | `resolveRepoRoot`/`detectTrackedPollution`의 `spawnSync`에 **`{cwd}` 필수** 명시(누락 시 엉뚱한 저장소를 씀) + repo A/B 분리 test + Validation §5 + Risks 행 추가. 대상은 항상 `resolveRepoRoot` 반환값 |
| G3 | invariant | HIGH | G1과 동근 — Validation §6이 grep 언급이 아니라 **전파 구조 3줄**을 검사 |
| G4 | architect | MEDIUM | `buildBlock` version 출처를 `plugin.json`으로 확정. CLI 플래그로 받지 않음(임의 값이면 DD4-Q4가 거짓이 됨) |
| G5 | architect | MEDIUM | **stdout JSON 스키마 8필드 표**로 명시. `nextContent`는 stdout 미포함 |
| G6 | test | MEDIUM | Task 4 Validate를 i18n test 1개에서 CHANGELOG 헤딩 유일성 + `currently` 값 + PRD status까지 5개 검사로 확장 |
| G7 | test | LOW | `parseEntries` inline `#` 보존 test 케이스 추가 |

R2에서 architect는 pass로 전환(전수 대조·DD1·DD3를 실측 확인). test 패널은 MEDIUM/LOW만 내고 `verdict=fail`을 반환해 자기 계약(HIGH/CRITICAL만 fail)을 어겼으나, 지적 자체는 유효하므로 그대로 흡수했다.

## Plan Review — R3 흡수 기록

R3 패널 판정 `divergent`, blocking 4건(architect·security 모두 **pass**). 흡수 내역:

| # | Perspective | Severity | 흡수 |
|---|---|---|---|
| H1 | invariant | CRITICAL | **R2 흡수가 만든 실제 결함**. Phase 5 초안이 `2>"$MCCP_TMP/provision.err"`를 썼는데 `setup.md`에는 `MCCP_TMP` 정의가 없다(`plan.md`·`pr.md`·`resume.md`는 모두 정의 후 사용). 변수를 새로 정의하는 대신 **임시 파일을 제거** — stderr는 터미널로 그대로 흐르므로 DD1의 "stderr를 보여주고 halt"가 그대로 성립하고, 유실 경로 자체가 사라진다. 계약 lint 9번(`MCCP_TMP` 문자열 **부재**)이 회귀를 고정 |
| H2 | invariant | HIGH | Mirror 오지정 정정. Phase 4는 `Skill(codex:setup)` 호출이라 셸 오류 전파의 선례가 아니다 — 서술 구조만 Phase 4를 따르고, exit-code 검사 형태는 `plan.md`의 `[MCCP-GATE-STOP]` 분기를 mirror한다고 명시 |
| H3 | test | HIGH | marker의 `mccp <version>` 표기를 test·Validation §3에서 `plugin.json` 값과 대조. 버전 표기는 DD4-Q4의 유일한 근거인데 검증이 없어 주장에 그치고 있었다 |
| H4 | test | HIGH | `.bak` 검증을 **존재 → 바이트 동일**로 승격. Validation §3도 `cmp -s`로 실측하고 사용자 줄 보존까지 같은 블록에서 확인 |
| H5 | test | MEDIUM | 계약 검사의 **단일 소유처 확정** — 항목 정의는 Task 3 Validate 표, 실행은 Task 2 계약 lint, CI 등록은 Task 5. Validation §6에서 중복 grep 제거 |

R3에서 architect·security 모두 pass. security는 R2의 `{cwd}` 지적이 닫혔음을 실측 확인했다.

## Plan Review — R4·R5 흡수 기록

R4 판정 `divergent`, blocking 2건(architect·security·**test 모두 pass**). R5 판정 `divergent`, blocking 6건(security 워커가 StructuredOutput 미호출로 무응답 — coverage 3/4).

| # | Round | Perspective | Severity | 흡수 |
|---|---|---|---|---|
| I1 | R4 | invariant | HIGH | `resolveRepoRoot`가 **"git이 없음"과 "저장소가 아님"을 같은 sentinel로 뭉갬** → `git-unavailable`(exit 1) / `not-a-git-repo`(exit 0 skip) 2갈래로 분리 + `result.error`·`status===null`·`status!==0` 판정표 명시 + spawnSync 스텁 test 3종(ENOENT · signal-kill · `status:128` 대비군). git 미설치 환경에서 조용히 skip하고 setup이 성공을 보고하던 fail-open을 닫는다 |
| J1 | R5 | architect | CRITICAL | **이 repo는 정본 줄을 marker 없이 이미 갖고 있다.** provision하면 같은 줄이 블록 안에 한 벌 더 생기고, R2에서 도입한 합계 등식이 깨진다. `stripManagedBlock`을 신설해 lint가 **managed 블록을 제외하고** 파싱하게 하고, 합계 등식을 **폐기**한 뒤 `정본 ∩ REPO_ONLY === ∅`(중복 면역)로 대체. 중복 줄 자체는 PRD Out-of-scope가 허용한 동작이므로 제거하지 않는다 |
| J2 | R5 | architect | HIGH | 그 상태(정본을 marker 없이 보유)에 대한 test 부재 → 마이그레이션 케이스 신설: 기존 줄 무손상 + 블록 append + `stripManagedBlock` 후 집합이 provision 전과 동일 |
| J3 | R5 | invariant | HIGH | lint 항목 3이 `git ls-files -i -c --exclude-standard`를 요구하는데 **bash 블록에 그 줄이 없었다** — "그대로 쓰라"는 지시와 lint가 모순. 오염 감지 + action별 보고를 블록에 실제로 기입 |
| J4 | R5 | invariant | MEDIUM | lint가 방어 구조만 보고 action 분기는 안 봄 → 항목 10(`case` + 5개 action 이름) · 항목 11(`git rm --cached` 안내 = UI7 계약) 추가 |
| J5 | R5 | architect | MEDIUM | `--repo` → `resolveRepoRoot(cwd)` 배선을 Task 1 action 본문에 명시(산문 밖에 두지 않음) |
| J6 | R5 | architect | MEDIUM | 정본 블록의 `ORDER IS LOAD-BEARING` 주석 보존을 test로 고정 — 순서 불변식을 후임에게 전달하는 유일한 채널 |
| J7 | R5 | test | MEDIUM | `plugin.json` 판독 실패 → throw → CLI exit 1 test 추가 |

R5에서 `security` 워커가 StructuredOutput을 호출하지 않고 종료해 응답이 3/4다. quorum(3) 자체는 충족했고 판정은 blocking finding으로 갈렸으므로 결과 해석에 영향은 없으나, **security 축이 이번 라운드에서는 실제로 검토되지 않았다**는 사실은 기록해 둔다(R3·R4에서 연속 pass).

## Plan Review — R6 흡수 기록

R6 패널 판정 `divergent`, blocking 4건(architect HIGH+fail · invariant HIGH+fail). security·test는 **pass**. 전문은 [`.claude/reviews/plan-review-setup-gitignore-m1.md`](../../../reviews/plan-review-setup-gitignore-m1.md).

R1~R5는 plan **내부 모순**이었으나 R6의 2건은 **plan ↔ 실제 파일의 불일치**다 — plan이 인용한 워크플로와 자매 plan을 실제로 열어 대조해야 보이는 축이다.

| # | Perspective | Severity | 흡수 |
|---|---|---|---|
| K1 | architect | HIGH | Task 5가 `axis-k-m2-cross-platform.yml`에 스텝만 추가하는데, 그 워크플로의 `on.pull_request.paths`(L20-27)에 `gitignore-provision.js`·`.gitignore`가 없어 **해당 변경에서 워크플로가 아예 안 돈다** → 스텝은 죽은 코드. **전용 워크플로 `gitignore-drift.yml` 신설**로 전환하고 `paths`를 lint의 판정 입력(정본·`.gitignore`·`setup.md`·test 자신)과 일치시킴. Validate가 스텝 존재가 아니라 **`paths` 항목 존재**를 검사 |
| K2 | invariant | HIGH | Validation §3이 marker·버전·`.bak`만 보고 **git의 실제 무시 판정을 한 번도 묻지 않음**. 줄 순서 부등식은 문자열 배치만 보므로 패턴 문법 오류에 무력. `git check-ignore` 5경로 표(ship receipt는 미무시 / `*.lock`·`*.tmp`·타 게이트는 무시)를 Task 2 E2E + Validation §3b에 추가. 선례 `durable-evidence-substrate.plan.md:324-328` |
| K3 | invariant | MEDIUM | `spawnSync` 판정 조건이 겹칠 때 우선순위 미명세. ENOENT는 `error`와 `status:null`을 **동시에** 세우고 `null !== 0`이 참이라 구현자가 `status` 분기를 먼저 쓰면 `not-a-git-repo`로 **오분류**된다(= I1이 닫은 fail-open의 재발). 4행 순서표 + 첫 일치 확정으로 계약화 |
| K4 | invariant | MEDIUM | `stripManagedBlock`↔`planMerge`의 손상 marker 복구 전략 불일치. **검토 중 실제 데이터 손실 경로 확인** — append 강등이 만든 `[고아 BEGIN, 사용자 줄…, BEGIN, 블록, END]` 상태에서 "첫 BEGIN + 첫 END" 매칭은 사용자 줄을 구간에 포함시켜 다음 실행에 삼킨다(UI2 파괴). 공유 `locateManagedBlock` 3상태 판정(개수까지 세는 엄격 매칭) 신설 + `damaged` → **exit 1 무변경**으로 설계 변경. append 강등은 폐기 |
| K5 | test | MEDIUM | UI4(`.git/info/exclude`·global gitignore 미대상)가 Out of scope 문장으로만 존재해 반증 불가능. sentinel 바이트 동일성 + `core.excludesFile` 미설정 단언을 Task 2 E2E + Validation §3c에 추가 |

**패널이 지적하지 않았으나 같은 대조에서 드러난 2건**(흡수 중 실측 발견):

| # | 흡수 |
|---|---|
| K6 | Risks의 CRLF 완화가 "CI matrix가 Windows/Linux 양쪽 실행"이라 적었으나, `axis-k-m2`의 matrix는 `[ubuntu-latest, macos-latest]`이고 그 파일 L12-13이 **Windows 제외를 명시적 설계로 선언**한다 — 완화가 거짓이었다. 신설 워크플로 matrix에 `windows-latest`를 넣어 주장을 사실로 만듦 |
| K7 | R5(J1)에서 **폐기한 "합계 등식"이 Risks 2개 행에 잔존**해 본문(교집합 검사)과 모순. 두 행을 교집합 기준으로 정정 |

R6에서 security는 3연속(R3·R4·R6) pass — R5의 무응답 공백이 이번에 메워졌다.

## Codex Adversarial Review

- 호출: `plan-codex-runner.js` (detached) → `codex-invoke.js adversarial-review` (fail-closed wrapper, v0.2.2). `MCCP_PLAN_REVIEW=codex`, `--impeccable-available` (design-scope preamble 적용).
- **이 절은 라운드 수도 run_nonce도 적지 않는다**(Plan-Codex R3 F1). 봉인된 값의 정본은 `.claude/receipts/mccp-plan-codex/setup-gitignore-m1.json`이고 `meta.intent_run_nonce` · `plan_hash` · `resolution.codex_verdict`가 그 자리에 있다. 여기에 그 값을 복제하면 **고정점 모순**이 생긴다 — 봉인하는 라운드의 nonce를 본문에 쓰는 순간 본문 digest가 바뀌어 바로 그 라운드가 봉인할 수 없고, 직전 라운드 값을 남기면 receipt와 어긋난다. R3 F1이 실측한 것이 후자다.
- receipt의 `round`는 **runner 호출 내부의 값**이지 게이트 재진입 횟수가 아니다. 두 축을 같은 것으로 읽으면 없는 모순이 보인다. 아래 triage는 **누적 기록**이며 근거는 이 문서와 `intent-marker-*.json`이다.
- 본문 흡수는 언제나 **다음 라운드**에서 리뷰된다. codex 경로의 runner는 리뷰 시점 본문에 digest를 묶고 흡수 편집을 감지하면 `exit 12`로 봉인을 거부한다(marker: *plan body changed outside the gate-injected review record between review and write*) — 실제로 첫 라운드가 그렇게 멈췄다. 순서는 선택이 아니라 runner의 계약이다.
- 합치 결론: HIGH 2건 모두 **plan이 스스로 주장한 fail-closed 성질이 실제로는 성립하지 않는 지점**을 짚었다. 둘 다 국소 수정이 아니라 **판정 규칙·보증 문구의 정정**으로 흡수했다.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — `git rev-parse`의 모든 nonzero를 non-repo skip으로 오분류 | HIGH | **ACCEPT_NOW** | 손상·dubious ownership·권한 실패가 exit 0 skip으로 읽혀 "규칙 미설치인데 성공 보고"가 된다. I1이 닫으려던 fail-open의 잔여 구멍이라 이연 불가 |
  | F2 — 전용 워크플로는 merge-enforced 게이트가 아님 | HIGH | **ACCEPT_NOW** | required check 미등록 워크플로는 red여도 머지 가능하고, 신설이라 기존 branch protection이 요구하고 있을 수도 없다. DD3의 "강제" 주장이 근거 없이 서 있었다 |
  | F3 — 라운드 기록이 봉인된 receipt와 모순 | HIGH | **ACCEPT_NOW** | 본문이 인용한 nonce와 receipt의 nonce가 어긋났다. 근본 원인은 **고정점** — 봉인 라운드의 식별자는 원리상 본문에 적을 수 없다. 값 복제를 없애고 receipt를 가리키는 구조로 전환 |
  | F4 — `check-ignore`는 tracked를 증명하지 않음 | MEDIUM | **ACCEPT_NOW** | `!check-ignore`는 "무시되지 않음"까지만 말한다. ship receipt가 무시되지 않으면서 add되지 않아 전달 저장소에 없을 수 있고, 그러면 PRD Success Metric("tracked 확인")이 미충족인 채 green이 된다. MEDIUM이지만 지표 자체가 무력화되므로 즉시 흡수 |
  | F17 — `.bak` 공통 단언과 보고 계약이 여전히 create/append와 충돌 | MEDIUM | **ACCEPT_NOW** | 직전 정정이 E2E 두 곳만 고치고 같은 계약을 참조하는 나머지를 남겼다. Task 2 공통 단언 · Phase 5 보고 계약 · stdout `backupPath` 스키마 · Risks 행 **네 곳을 모두 경로별로 한정**해 쓰기 계약과 test와 보고가 같은 것을 말하게 함 |
  | F15 — `--force-update`도 UI2를 위반한다 | HIGH | **REJECTED_BY_DESIGN** | 전제 불성립. marker 구간의 줄은 **mccp가 쓴 mccp의 줄**이지 사용자의 줄이 아니며, 같은 PRD의 UI3(사용자 규칙을 정리하지 말 것)이 그 구분의 근거다. 자기 블록 갱신을 사용자 줄 변경으로 읽으면 PRD가 요구한 멱등 병합 자체가 정의상 불가능해진다. 남은 절반인 TOCTOU 잔여는 실재하나 OS 수준 배타 잠금 부재로 이 계층에서 닫히지 않아 backlog 이관 **(이력)** 이 행이 서술하는 `--force-update` 경로는 이후 PR-Codex F1에서 철회됐다 — 그 방어들은 이제 `update` 기본 경로에 적용된다. 현행 서술은 DD 절의 "동의 게이트는 철회됐다" 참조 |
  | F16 — `.bak` 단언이 create/append 쓰기 계약과 모순되어 구현 불가 | MEDIUM | **ACCEPT_NOW** | 직전 흡수가 만든 모순. `.bak`을 `--force-update` 전용으로 옮겨 놓고 create/append E2E는 여전히 `.bak`을 단언해, 계약대로 구현하면 test가 실패하고 test를 맞추면 명세에 없는 백업·전체 교체를 추가해야 했다. `.bak` 단언을 `--force-update` 경로로 이관하고 create/append는 **미생성**을 단언하도록 정정 **(이력)** 이 행이 서술하는 `--force-update` 경로는 이후 PR-Codex F1에서 철회됐다 — 그 방어들은 이제 `update` 기본 경로에 적용된다. 현행 서술은 DD 절의 "동의 게이트는 철회됐다" 참조 |
  | F14 — 병렬 append가 managed 블록을 영구 중복시킴 | HIGH | **ACCEPT_NOW** | 직전 흡수가 만든 회귀. 방어를 `--force-update` 전용으로 국한하며 **lock까지 함께 옮긴 것**이 원인이다. lock은 전체 교체를 보호하는 장치가 아니라 mccp writer를 직렬화하는 장치이므로 `create`/`append`/`update` 전 경로에 있어야 한다. 없으면 두 writer가 각자 블록을 붙여 이후 실행이 `damaged`로 영구 파손되고, 병렬 test 불변식(양쪽 exit 0 · 후행 `noop`)과도 모순된다. lock을 전 경로로 되돌리고, `--force-update` 전용은 해시 재검사와 전체 교체만으로 국한 **(이력)** 이 행이 서술하는 `--force-update` 경로는 이후 PR-Codex F1에서 철회됐다 — 그 방어들은 이제 `update` 기본 경로에 적용된다. 현행 서술은 DD 절의 "동의 게이트는 철회됐다" 참조 |
  | F12 — 모든 managed-block update에서 UI2가 미충족으로 남음 | HIGH | **ACCEPT_NOW → 이후 철회** | 당시 판단: 드묾은 충족이 아니라는 지적을 받아들여 잔여를 설명하는 대신 **제거**했다. `update`를 명시 동의(`--force-update`) 경로로 돌려 동의 없는 전체 교체가 존재하지 않게 하고, 기본 실행은 `action:'update-required'` 보고 + 파일 무변경으로 두었다. **이 해법은 PR-Codex F1(HIGH)에서 철회됐다** — 블록에 plugin version이 박혀 있어 버전 bump만으로 전 설치가 영구 `update-required`가 되고 setup은 성공을 보고하므로, UI1(멱등 병합)이 첫 업그레이드 이후 성립하지 않았다. 게이트의 범위 자체가 어긋나 있었다: 동의가 보호하려던 것은 사용자 줄인데 `update`가 치환하는 것은 도구 소유 구간뿐이다. 현행 결정은 DD 절의 "동의 게이트는 철회됐다" 참조 |
  | F13 — append-only `create`가 계획 후 생긴 파일을 안전하게 다루지 못함 | MEDIUM | **ACCEPT_NOW** | append-only 전환이 만든 새 구멍. `'a'`는 파일이 생겨 있어도 성공해 빈 파일 기준 블록이 이어붙고, 선행 개행이 없어 미종결 줄에 붙거나 두 번째 블록이 생겨 멱등성이 깨진다. `'wx'` 배타 생성 + 페이로드 선행 개행 + append 후 marker 쌍 1개 재확인 3종으로 폐쇄 |
  | F10 — 잔여 창을 인정한 채로는 UI2 충족을 주장할 수 없음 | HIGH | **ACCEPT_NOW** (intent_conflict: **UI2**, R9에서 해소) | 직전 라운드의 "주장 축소"는 요구사항을 낮춘 것이지 충족한 것이 아니라는 지적이 맞다. 따라서 설계를 고쳤다 — `create`/`append`를 **append-only 쓰기**로 전환해 기존 바이트를 읽고 다시 쓰지 않게 하니 그 두 경로에서는 유실될 대상 자체가 없다(UI2가 구조적 성질). 잔여는 전체 교체가 불가피한 `update`로 국한되고, 그 판단과 근거는 adjudication의 `intent_override_reason`에 봉인 |
  | F11 — 오염 감지 실패가 "오염 없음"으로 접힘 | MEDIUM | **ACCEPT_NOW** | Task 3 산문은 DD4-Q2에 따라 경고 후 계속이라 적었는데 bash는 `2>/dev/null` + `|| POLLUTED=""`로 실패를 삼켜 아무 경고도 내지 않았다. 계약과 코드의 불일치이자 조용한 실패. `POLLUTED_EXIT` 분기 + 명시 경고로 고치고 계약 lint 12번으로 고정 |
  | F9 — 병렬 writer test가 올바른 직렬화를 오답 처리 | HIGH | **ACCEPT_NOW** | 직전 흡수가 만든 **내부 모순**. lock을 구간 앞에서 잡으므로 후행 writer는 선행의 완성본을 읽고 계획해 `noop` 성공이 정상인데, test가 exit 1을 요구해 통상적 동시 setup을 오류로 만들도록 압박하고 멱등성 주장과 어긋났다. 기대를 양쪽 exit 0으로 정정하고 불변식(유실 0 · 블록 1개)만 남김. exit 1을 기대하는 것은 lease 만료 정지 시나리오뿐 |
  | F7 — 재검사~rename 잔여 창은 남고, 따라서 UI2를 닫았다는 보증은 미성립 | HIGH | **ACCEPT_NOW** | 결론이 맞다. 이 창은 user-space에서 제거 불가(임의 편집기의 쓰기를 막는 이식 가능한 배타 잠금 원시 부재)이므로 **방어 유지 + 주장 축소**로 흡수 — 재검사를 rename 직전에 두어 창을 최소화하고, 닫히는 두 경로를 명시하며, 남는 창을 알려진 한계와 위협 모델로 기록. 근거 없는 보증을 남기지 않는 것이 이 plan의 일관된 기준 |
  | F8 — lease 회수가 살아 있는 writer를 선점 | MEDIUM | **ACCEPT_NOW** | evidence write lock의 5초 lease를 잘못 미러했다. §3.6이 lock마다 lease와 정책이 다르다고 명시하며, 여기 맞는 모델은 `pr-phase.lock`/`quarantine.lock`의 **60초 lease + PID 생존 tri-state + heartbeat**다. lease 만료 정지 시나리오 test를 함께 추가 |
  | F6 — read-plan-write 사이 동시 변경이 사용자 줄을 유실시킴 | HIGH | **ACCEPT_NOW** | UI2의 정면 위반이고 순차 재실행 test로는 영원히 안 보인다. 원자적 rename은 부분 파일만 막을 뿐 낡은 `nextContent`가 원자적으로 착지하는 것을 막지 못한다. 쓰기 직전 `sourceHash` 재검사(불일치 → `concurrent-modification` exit 1 무변경) + 저장소별 lock + 실행별 고유 tmp로 닫고, 중간 편집 주입·두 writer 병렬 test를 추가 |
  | F5 — escalation state가 잘못된 task fingerprint에 붙음 | HIGH | **DEFER_TO_BACKLOG** | 사실이나 **이 plan의 축이 아니다**. `.claude/state/STATE.md`(`task_fingerprint: multi-session-work-loop-m4`)와 `fix-task.md`(`decision_id: setup-gitignore-m1`)의 신원 불일치로, 직전 라운드의 divergent receipt에 stop-review-loop 게이트가 반응해 남긴 것이다. 이 milestone이 만들거나 바꾸는 파일이 아니고, 제안된 STATE 재생성은 MSW M4 연속성 기록을 덮어쓰는 파괴적 행위라 게이트가 단독 수행할 사안이 아니다(CLAUDE.md §3.2는 state-writer API 경유를 요구). backlog 이연 후 운영자 판단 |

- 흡수 내역:
  - **F1** → `resolveRepoRoot` 판정을 4행에서 **5행**으로 확장. `not-a-git-repo`는 `status!==0` **∧ stderr가 git의 표준 부정 진단에 매칭**될 때만 내주고, 나머지 nonzero는 신규 사유 **`git-error`(exit 1)** 로 fail-closed. spawn 시 `LC_ALL=C`로 locale 고정(번역 stderr가 판정을 깨뜨리는 경로 차단). Task 2에 6행 스텁 표 추가 — dubious-ownership · 손상(`not a git repository` 문자열을 포함하지만 손상인 대비군) · `status:129` 오호출이 `git-error`로 떨어지는지, `LC_ALL` 전달 여부까지 단언.
  - **F2** → "CI 필수 게이트"를 plan 전역에서 **실제 보증 범위**로 정정(Summary · DD2 · DD3 · Task 5). 강제를 **실행 층**(M1이 보증)과 **차단 층**(저장소 설정, 보증 불가)으로 분리한 표를 DD3에 추가하고, 검토한 대안 2가지(이미 required인 check에 붙이기 / ruleset 등록을 Task에 포함)를 기각 사유와 함께 기록. 미해결 부분은 **ROLLOUT-1(blocking, 저장소 설정)** 으로 명시하고 Acceptance에 미완료 항목으로 올림 — 숨은 가정을 검증 가능한 미완료로 승격.
- Deferred to backlog: **개수를 여기 적지 않는다**(위 고정점 사유 — 봉인 라운드의 이연은 원리상 이 문서에 실릴 수 없다). 이연 항목은 `.claude/plans/codex-findings-backlog.md`에 누적되며, 이 plan 경로(`setup-gitignore-m1.plan.md`)로 grep하면 전수가 나온다.
- Open Questions: 없음 (CRITICAL 0건). ROLLOUT-1은 질문이 아니라 **기록된 미완료 배포 전제**다.
- Codex session 참조: **값을 여기 복제하지 않는다**(위 고정점 사유). `.claude/receipts/mccp-plan-codex/setup-gitignore-m1.json`의 `meta.intent_run_nonce` · `plan_hash` · `resolution.codex_verdict`가 정본이고, 라운드별 원본 payload는 `.git/worktrees/setup-gitignore/mccp/tmp/intent-{awaiting,marker}-<nonce>.json`에 남는다.
