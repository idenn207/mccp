# Plan: /mccp:setup gitignore 프로비저닝 (M1)

**Source PRD**: `.claude/prds/setup-gitignore.prd.md`
**Selected Milestone**: 1 — gitignore 프로비저닝 Phase
**Complexity**: Small

## Summary

`/mccp:setup`에 Phase 5를 신설해 mccp 런타임 산출물의 무시 규칙을 대상 저장소 `.gitignore`에 멱등 병합한다. 규칙 블록은 marker로 감싸고, marker 바깥의 사용자 줄은 인덱스까지 보존한다. 정본 목록은 `gitignore-provision.js` 상수가 단독 소유하며, 이 repo `.gitignore`와 **양방향 대조하는 drift lint**를 CI 필수 게이트로 걸어 새 런타임 경로가 정본에 누락되면 red가 된다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | `/mccp:setup`이 mccp 런타임 무시 규칙을 대상 저장소 `.gitignore`에 멱등적으로 병합한다 | direction |
| UI2 | 사용자의 기존 `.gitignore` 줄은 절대 변경하거나 삭제하지 않는다 | constraint |
| UI3 | 사용자 기존 규칙의 정리나 중복 제거는 하지 않는다 | exclusion |
| UI4 | `.git/info/exclude`와 global gitignore는 대상이 아니다 | exclusion |
| UI5 | git 저장소가 아니면 skip하고 보고한다 | constraint |
| UI6 | 런타임 경로를 코드 스캔으로 자동 도출하지 않고 정본 목록을 명시 관리한다 | exclusion |
| UI7 | 이미 커밋된 오염 파일을 untrack하지 않는다, 감지되면 안내만 한다 | exclusion |
| UI8 | ship receipt `mccp-pr-codex`는 추적 대상으로 남아야 한다 | constraint |
| UI9 | `--dry-run`은 추가될 줄을 보여주고 파일에 쓰지 않는다 | constraint |
| UI10 | 산출물의 가치는 다른 프로젝트에 mccp를 설치할 때이며 이 repo 자신이 아니다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/lib/dep-check.js:1-9` | `lib/<kebab>.js` + 상단 계약 주석 + `module.exports` 하단 + `require.main === module` CLI |
| CLI 인자 | `plugins/mccp/scripts/lib/settings-writer.js:123-161` | 위치 인자 `cmd` + `flag(name)` 헬퍼 + `--dry-run` 불리언 + `--path` override, usage는 exit 2 |
| 오류 계약 (**채택**) | `plugins/mccp/scripts/lib/settings-writer.js:139-161` | 라이브러리 함수는 throw, `require.main` 블록이 try/catch로 감싸 stderr 출력 + **exit 1** |
| 원자 쓰기 + 백업 | `plugins/mccp/scripts/lib/settings-writer.js:36-57` | `.tmp` write → 기존 파일 `.bak` 회전 → rename, rename 실패 시 copy+unlink fallback |
| 탐지(비-오류) 반환 | `plugins/mccp/scripts/lib/dep-check.js:19-32` | **탐지 함수에만** 적용: 없음/불량을 sentinel로 반환하고 throw하지 않음 |
| Tests | `plugins/mccp/scripts/lib/tests/dep-check.test.js:1-20` | `node:test` + `node:assert` + `mkdtempSync` 임시 디렉토리 + `finally` rmSync |
| 정본 대조 lint | `plugins/mccp/scripts/lib/instruction-contract/lint.js` (MSW M4) | 명명된 제외 목록 + fail-closed 등식, 분류 안 된 신규 항목은 red |
| 커맨드 Phase | `plugins/mccp/commands/setup.md:98-126` | `## Phase N — <제목>` + skip 조건 + fenced bash + 결과 보고 문단 |
| CI 등록 | `.github/workflows/axis-k-m2-cross-platform.yml` (기존 `node --test` 스텝 블록) | `- name: … / run: node --test <test file>` 스텝 1개 추가 |

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

`gitignore-provision.js`의 `MCCP_IGNORE_ENTRIES` 상수. 이 repo `.gitignore`에서 런타임 추출하지 않는다(repo 고유 규칙 유출 위험 — PRD가 지적). 동기화는 **양방향 drift lint + CI 필수 게이트**가 강제한다(DD3).

### DD3 — drift의 실제 강제 지점

새 런타임 경로는 **언제나 이 repo에서 먼저 생긴다** — 그 경로를 쓰는 코드가 여기서 개발되고, 여기 `.gitignore`에 등록하지 않으면 이 repo의 `git status`가 즉시 오염되기 때문이다. 따라서 순서 불변식은 항상 `repo .gitignore` 갱신 → 정본 갱신이다. lint가 그 두 번째 단계를 강제한다:

- `정본 − repo ≠ ∅` → red: 제품이 dogfood되지 않은 규칙을 배포하려 함
- `repo − 정본 − REPO_ONLY ≠ ∅` → red: 신규 경로가 분류되지 않음 (**PRD의 High risk를 잡는 방향**)

"사람이 기억해야 작동"을 없애기 위해 이 test를 `axis-k-m2-cross-platform.yml`에 스텝으로 등록한다(Task 5). CI 게이트가 없으면 lint는 권고에 불과하다.

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
| `.github/workflows/axis-k-m2-cross-platform.yml` | UPDATE | drift lint를 CI 필수 스텝으로 등록 (DD3) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.7` → `1.24.0` (PRD 전체 종료 = minor, §3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot 버전 동기 (i18n-surface.test.js가 plugin.json 파생으로 단언) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 버전 동기 (동일 단언) |
| `CHANGELOG.md` | UPDATE | `## [1.24.0]` 항목 + 상단 note의 `currently` 값 |
| `.claude/prds/setup-gitignore.prd.md` | UPDATE | M1 status `complete`, Plan 셀, Open Questions 4건 결정 기록 |

## 정본 목록 (전수 — 구현자는 이 표를 그대로 옮긴다)

이 repo `.gitignore`의 비-주석·비-공백 항목은 **정확히 47개**이며, 아래 분류가 그 전수를 덮는다: `MCCP_IGNORE_ENTRIES` **26** + `REPO_ONLY` **21** = 47. lint가 이 등식을 검증한다.

### `MCCP_IGNORE_ENTRIES` — 26개 (순서 유지, 주석 포함해 블록에 기록)

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
  - `stripManagedBlock(text)` → marker 쌍 사이(marker 줄 포함)를 제거한 문자열 반환. marker가 없거나 한쪽만 있으면 원문 그대로. drift lint가 provision 전후로 **같은 집합**을 보게 하는 유일한 장치다(R5 architect CRITICAL).
  - `parseEntries(text)` → drift lint와 merge가 **공유**하는 단일 파서. 규칙: `split(/\r?\n/)` → 각 줄 `trim()` → 빈 줄 제거 → `startsWith('#')` 줄 제거. **inline `#` 주석은 처리하지 않는다** — gitignore 스펙상 `#`는 줄 첫 문자일 때만 주석이고 그 외에는 리터럴이므로, inline 제거는 유효한 패턴을 훼손한다.
  - `planMerge({ content, version })` → **순수 함수**. 반환 `{ action:'create'|'append'|'update'|'noop', nextContent, addedLines, eol }`. EOL은 첫 `\r\n` 존재로 판정해 보존(기본 `\n`). marker 쌍이 모두 있으면 그 구간만 치환(바깥 줄 인덱스 불변 — UI2), 한쪽만 있거나 없으면 끝에 빈 줄 하나 두고 append(파괴 금지). 결과가 기존과 동일하면 `noop`. 실패는 **throw**(DD1).
  - `applyMerge(target, plan)` → `settings-writer.js:36-57` writeAtomic 형태 그대로: `.tmp` write → 기존 파일 `.bak` 회전 → rename, fallback copy+unlink. 실패는 **throw**(DD1).
  - `resolveRepoRoot(cwd)` → **`spawnSync('git', ['rev-parse','--show-toplevel'], { cwd: cwd, encoding: 'utf8' })`**. `cwd` 옵션은 **필수**다 — 빼면 `--repo`가 무시되고 프로세스의 현재 디렉토리가 대상이 되어 **엉뚱한 저장소의 `.gitignore`를 쓴다`**(R2 security HIGH). 인자 `cwd`는 `--repo` 값 또는 `process.cwd()`. **throw 금지**, 대신 **실패 사유를 두 갈래로 나눈다**(R4 invariant HIGH):

    | 조건 | 반환 | CLI |
    |---|---|---|
    | `status === 0` | `{ ok:true, root: stdout.trim() }` | 정상 진행 |
    | `result.error` 존재 **또는** `status === null`(시그널) | `{ ok:false, reason:'git-unavailable' }` | **exit 1** |
    | `status !== 0` (git이 답했고 "저장소 아님") | `{ ok:false, reason:'not-a-git-repo' }` | `action:'skip'` + exit 0 |

    **두 사유를 한 sentinel로 뭉개면 fail-open이다**: git이 PATH에 없는 환경에서 "저장소가 아니다"로 읽혀 조용히 skip하고 setup은 성공을 보고한다 — 실제로는 무시 규칙이 하나도 설치되지 않았는데도. "git이 저장소가 아니라고 **답한 것**"과 "git에게 **묻지 못한 것**"은 다른 사실이고, 후자는 UI5의 정상 skip이 아니다.
  - `detectTrackedPollution(root)` → **`spawnSync('git', ['ls-files','-i','-c','--exclude-standard'], { cwd: root, encoding: 'utf8' })`**. `cwd` 필수(같은 이유). **throw 금지**, 실패 시 `{ ok:false, reason:'git-unavailable', files:[] }` (DD4-Q2).
  - CLI: `node gitignore-provision.js provision [--dry-run] [--repo <path>] [--json]`. **`--repo` 값(없으면 `process.cwd()`)을 `resolveRepoRoot`의 `cwd` 인자로 그대로 전달한다** — 이 배선이 `--repo`가 실제로 대상을 바꾸는 유일한 경로다(R5 architect MEDIUM: 배선을 산문 밖에 두지 않는다). `require.main` 블록 전체 try/catch → 성공 exit 0 / 오류 stderr + exit 1 / not-a-git-repo는 `action:'skip'` + exit 0 / git-unavailable은 exit 1 (DD1). `--dry-run`은 `addedLines`를 출력하고 쓰지 않는다(UI9). 쓰기 대상 경로는 **항상 `resolveRepoRoot`의 반환값**이며 `--repo` 원문이 아니다(worktree/하위 디렉토리에서 호출해도 repo 루트에 쓰기 위함).
  - **stdout JSON 스키마** (Task 3이 파싱하므로 명시 고정):

    | 필드 | 타입 | 설명 |
    |---|---|---|
    | `ok` | boolean | 성공 여부. `false`는 exit 1과 항상 동반 |
    | `action` | `'create'｜'append'｜'update'｜'noop'｜'skip'` | `skip`은 not-a-git-repo (exit 0) |
    | `reason` | string \| null | `skip`/오류일 때만 non-null |
    | `repoRoot` | string \| null | `resolveRepoRoot` 결과. 사용자가 대상 저장소를 눈으로 확인하는 축 |
    | `addedLines` | string[] | 추가·갱신될 줄. `--dry-run`에서 그대로 표시 |
    | `backupPath` | string \| null | `.bak` 경로. `dryRun`/`noop`/`skip`이면 null |
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
    - marker 한쪽만 존재하는 손상 입력 → 기존 줄 삭제 0 + append로 강등.
    - **inline `#` 보존**: 입력에 `foo#bar` / `*.log #keep` 같은 줄이 있을 때 `parseEntries`가 그 줄을 **원문 그대로** 반환(제거·절단 0). gitignore 스펙상 줄 첫 문자일 때만 주석이므로 inline 절단은 유효 패턴 훼손이다.
  - **실제 write E2E** (dry-run만으로는 검증 안 되는 축)
    - 임시 repo에 `git init` → `provision` 실행 → 파일에 블록 존재 확인 → **재실행** → `action:'noop'` + 파일 mtime/내용 불변 → `.bak` 존재 확인.
    - **이미 정본 규칙을 marker 없이 갖고 있는 repo**(= 이 repo의 현재 상태, R5 architect HIGH): 26개 정본 줄을 marker 없이 담은 `.gitignore`로 시작 → provision → (a) 기존 줄은 **하나도 삭제·변형되지 않고**(UI2/UI3), (b) marked 블록이 append되며, (c) `stripManagedBlock` 후 파싱한 집합이 provision 전과 **동일**함을 단언. 중복 줄이 생기는 것은 PRD Out-of-scope가 명시한 허용 동작이다("중복이 생겨도 git이 무해하게 처리한다") — 이 test는 중복을 없애라는 것이 아니라 **중복이 lint를 깨지 않음**을 고정한다.
    - **`--repo`가 대상을 실제로 결정한다**(R2 security HIGH): 임시 repo A와 B를 만들고, **cwd를 B로 둔 채** `--repo A`로 실행 → `A/.gitignore`에만 블록이 생기고 **`B/.gitignore`는 생성조차 되지 않음**을 단언. `spawnSync`에 `{cwd}`를 빠뜨리면 이 test가 red가 된다. `resolveRepoRoot`를 직접 호출해 반환 경로가 A임도 단언.
    - 기존 `.gitignore`가 있는 임시 repo에서 실행 후 **기존 줄 전부 보존** + `.bak`이 실행 전 내용과 바이트 동일.
  - **skip / 오류 경로** (DD1)
    - non-git 디렉토리에서 CLI 실행 → **exit 0** + `action:'skip'` + `reason:'not-a-git-repo'` (UI5).
    - **git 자체가 없을 때는 skip이 아니라 오류**(R4 invariant HIGH): `resolveRepoRoot`에 `spawnSync` 스텁을 주입해 (a) `{error: Object.assign(new Error('spawn git ENOENT'),{code:'ENOENT'})}` (b) `{status:null, signal:'SIGKILL'}` 두 경우 모두 `reason:'git-unavailable'`을 반환함을 단언하고, 그 결과로 **CLI가 exit 1**임을 단언. `status:128`(git이 "not a repository"로 답함)은 대비군으로 `not-a-git-repo` + exit 0. 두 사유가 같은 값으로 뭉개지면 red.
    - 대상 `.gitignore`를 읽기 전용/쓰기 불가로 만든 뒤 CLI 실행 → **exit 1** + stderr 비어있지 않음. (플랫폼별 권한 조작이 불안정하면 `applyMerge`에 주입한 실패 fs stub으로 대체하되, **CLI가 exit 1을 내는 것**을 반드시 단언한다.)
    - `detectTrackedPollution`이 실패 sentinel을 반환해도 `provision` 자체는 exit 0 (DD4-Q2 — 감지는 부가 정보).
    - **`plugin.json` 판독 실패는 throw → CLI exit 1**(R5 test MEDIUM): 존재하지 않는 경로 / 깨진 JSON을 주입해 `buildBlock`이 throw하고 CLI가 exit 1을 냄을 단언. 버전을 모르는 채로 블록을 쓰면 marker의 버전 주석이 거짓이 되어 DD4-Q4가 무너진다.
    - **정본 블록의 주석 보존**(R5 architect MEDIUM): `buildBlock` 산출물에 `ORDER IS LOAD-BEARING` 문자열이 존재함을 단언. 이 주석이 receipt 4줄의 순서 불변식을 후임 유지자에게 전달하는 유일한 채널이므로, 주석을 떨어뜨린 구현은 red가 되어야 한다.
    - `--dry-run`이 파일을 **쓰지 않음**: 실행 전후 파일 존재/내용 동일 단언.
  - **drift lint** (DD3)
    - repo root `.gitignore`를 `parseEntries`로 파싱하되 **managed 블록(marker 구간) 안의 줄은 제외**한다(`stripManagedBlock(content)` → `parseEntries`). 이 repo가 언젠가 provision되면 같은 26줄이 블록 안에 한 벌 더 생기는데, 그때도 lint는 **provision 전과 동일한 집합**을 봐야 한다. 파서는 Task 1의 공유 함수이며 test가 자체 구현하지 않는다.
    - **집합** 단언 2개: `정본 − repo === ∅` · `repo − 정본 − REPO_ONLY === ∅`. 위반 시 어긋난 항목명을 메시지에 포함. 집합 연산이라 중복 줄에 영향받지 않는다.
    - `정본 ∩ REPO_ONLY === ∅` 단언(이중 분류 검출). **합계 등식(`26 + 21 === 47`)은 쓰지 않는다** — provision된 repo나 사용자가 같은 줄을 두 번 적은 repo에서 개수가 어긋나 red가 되는데, 그 red는 실제 결함이 아니라 계수 방식의 취약함이다(R5 architect CRITICAL). 교집합 검사가 합계 등식이 잡으려던 이중 분류를 중복에 면역인 방식으로 잡는다.
    - `.gitignore` 부재는 **skip이 아니라 red** — 조용한 skip은 MSW M4가 이미 고친 결함군. 이 test는 repo 체크아웃에서만 도는 것이 정상이며, 파일이 없으면 그 사실 자체가 신호다.
  - **`setup.md` 계약 lint** — 이 검사의 **단일 소유처**다(R2 invariant CRITICAL + R3 test MEDIUM)
    - `plugins/mccp/commands/setup.md`를 읽어 Task 3 Validate 표의 **11개 항목**을 단언. 그 표가 항목 정의이고 여기가 실행 지점이며, Task 5가 이 test 파일을 CI에 등록한다 — 세 계층이 같은 검사를 중복 소유하지 않는다.
    - 이 test가 red면 exit-code 전파 계약이 본문에서 사라졌거나(6~8), 정의 없는 `MCCP_TMP` 리디렉션이 되살아났다(9)는 뜻이다.
  - **marker 블록 버전 표기** (R3 test HIGH): `create` 후 파일에 `# managed by /mccp:setup (mccp <plugin.json의 version>)` 줄이 **정확히 그 버전 문자열로** 존재함을 단언. 버전을 marker에 넣는 것이 DD4-Q4의 유일한 근거이므로, 표기 자체가 검증되지 않으면 그 결정은 주장에 그친다.
  - **`.bak` 내용 동일성** (R3 test HIGH): 기존 `.gitignore`가 있는 repo에서 write 후 `.bak`이 **실행 전 파일과 바이트 동일**함을 단언(존재만이 아니라 내용까지). `.bak`은 사용자 파일 복구의 유일한 수단이므로 존재 확인만으로는 부족하다.
- **Mirror**: `dep-check.test.js:11-20`의 `mkdtempSync` + `finally rmSync` 헬퍼.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/gitignore-provision.test.js`

### Task 3: `setup.md` Phase 5 신설

- **Action**: Phase 4 뒤에 `## Phase 5 — Provision .gitignore` 삽입, 기존 최종 보고를 `## Phase 6 — Final report`로 이동.
  - 상단 Flags 목록에 `--skip-gitignore` 추가(Phase 5 noop).
  - 본문 계약(DD1을 명령 본문에 그대로 씀):
    - `provision --json` 실행. **exit≠0이면 stderr를 그대로 보여주고 setup을 halt** — `{ok:false}`를 성공으로 보고하지 않는다.
    - `action:'skip'`(`not-a-git-repo`)이면 한 줄 보고 후 Phase 6으로(UI5).
    - `noop` → "이미 최신" / `create`·`append`·`update` → 추가·갱신 줄 수 + `.bak` 경로.
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
        echo "[mccp:setup] .gitignore 갱신됨 (action=$PROVISION_ACTION). 백업: $(printf '%s' "$PROVISION_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).backupPath||"(none)")}catch{process.stdout.write("(none)")}')"
        # 이미 추적 중인 오염 파일 안내 — untrack하지 않는다(UI7).
        # 실패해도 setup을 막지 않는다: 감지는 부가 정보이고 프로비저닝의 전제가 아니다(DD4-Q2).
        POLLUTED=$(git ls-files -i -c --exclude-standard 2>/dev/null) || POLLUTED=""
        if [ -n "$POLLUTED" ]; then
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
  | 3 | `git ls-files -i -c --exclude-standard` 존재 |
  | 4 | `--skip-gitignore` 존재 |
  | 5 | `not-a-git-repo` 존재 |
  | 6 | `PROVISION_EXIT=$?` 존재 |
  | 7 | `if [ "$PROVISION_EXIT" -ne 0 ]` 존재 |
  | 8 | `exit "$PROVISION_EXIT"` 존재 |
  | 9 | **`MCCP_TMP` 문자열 부재** — 정의 없는 변수로 리디렉션하는 초안 회귀를 막는다 |
  | 10 | `case "$PROVISION_ACTION" in` 존재 **및** `skip`/`noop`/`create`/`append`/`update` 5개 action 이름이 모두 등장 — 방어 구조만 남고 보고 분기가 사라지는 경우를 잡는다(R5 invariant MEDIUM) |
  | 11 | `git rm --cached` 안내 문자열 존재 — 오염 감지가 **안내만** 하고 untrack하지 않는다는 UI7 계약의 고정 |

  6~9가 없으면 fail-open 구현이 통과한다. 9는 "쓰려면 먼저 정의하라"가 아니라 "이 Phase는 임시 파일을 쓰지 않는다"는 설계 결정의 고정이다. 3·10·11은 검사 대상 문자열이 실제로 위 bash 블록 안에 존재하도록 맞춘 것이다 — R5 invariant HIGH는 lint가 `git ls-files -i -c --exclude-standard`를 요구하는데 정작 블록에 그 줄이 없어 "그대로 쓰라"는 지시와 lint가 어긋나 있었음을 지적했다.

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

### Task 5: drift lint를 CI 필수 게이트로 등록

- **Action**: `.github/workflows/axis-k-m2-cross-platform.yml`의 기존 `node --test` 스텝 뒤에 스텝 1개 추가:
  ```yaml
  - name: Run gitignore-provision tests (canonical drift gate)
    run: node --test plugins/mccp/scripts/lib/tests/gitignore-provision.test.js
  ```
  이 워크플로는 cross-platform matrix라 Windows/Linux 양쪽에서 EOL 케이스까지 돈다.
- **Mirror**: `.github/workflows/axis-k-m2-cross-platform.yml`의 기존 `node --test` 스텝 블록(현재 2개 — pr-phase-guard / pr-phase-lock-f11).
- **Validate**: `grep -c "gitignore-provision.test.js" .github/workflows/axis-k-m2-cross-platform.yml` → 1.

## Validation

```bash
# 1. 단위 + E2E + drift lint
node --test plugins/mccp/scripts/lib/tests/gitignore-provision.test.js

# 2. dry-run이 이 repo를 건드리지 않음
node plugins/mccp/scripts/lib/gitignore-provision.js provision --dry-run --json; echo "exit=$?"   # exit=0
git diff --exit-code .gitignore

# 3. 실제 write E2E — 임시 repo에서 create → noop 멱등, 버전 표기 + .bak 내용까지
TMP=$(mktemp -d); git -C "$TMP" init -q
printf 'my-own-rule/\n' > "$TMP/.gitignore"; cp "$TMP/.gitignore" "$TMP/.before"
node plugins/mccp/scripts/lib/gitignore-provision.js provision --repo "$TMP" --json   # action=append
node plugins/mccp/scripts/lib/gitignore-provision.js provision --repo "$TMP" --json   # action=noop
grep -c "mccp runtime artifacts" "$TMP/.gitignore"                                     # → 2 (begin+end marker)
V=$(node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)")
grep -qF "# managed by /mccp:setup (mccp $V)" "$TMP/.gitignore"                        # 버전 표기 존재 (DD4-Q4)
cmp -s "$TMP/.before" "$TMP/.gitignore.bak"                                            # .bak == 실행 전 내용
grep -q "my-own-rule/" "$TMP/.gitignore"                                               # 사용자 줄 보존 (UI2)
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

# 6. CI 등록 — setup.md 계약 9항목은 §1의 test가 소유하므로 여기서 중복 검사하지 않는다
grep -c "gitignore-provision.test.js" .github/workflows/axis-k-m2-cross-platform.yml   # → 1

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
| 사용자 `.gitignore` 손상 | Low | marker 구간만 치환 + 바깥 줄 인덱스 보존을 test로 단언 + 쓰기 전 `.bak`(내용 동일성까지 단언) |
| ship receipt까지 무시돼 증거 corpus 소실 | Low (**Critical**) | receipt 4줄 인덱스 순서를 test에서 부등식으로 단언 |
| 정본이 코드와 드리프트(새 경로 누락) | High | 양방향 drift lint + 합계 등식 + **CI 필수 게이트 등록(Task 5)**. 순서 불변식(repo 먼저, 정본 다음)은 DD3에 명문화 |
| mccp-runtime ↔ REPO_ONLY 오분류 | Medium | 47개 전수를 plan에서 분류 완료 + `REPO_ONLY`에 사유를 코드로 보존 + 합계 등식이 중복·누락 양쪽을 잡음 |
| CRLF 환경에서 줄 섞임 | Medium | EOL 감지·보존 + 양쪽 EOL test + CI matrix가 Windows/Linux 양쪽 실행 |
| `git ls-files` 실패가 setup을 막음 | Low | DD4-Q2 — 감지 실패는 경고 후 계속(부가 정보). write 실패와 명시적으로 구분 |
| 병렬 브랜치와 버전 충돌 (day-0 병렬 PRD 8건) | Medium | §3.7 forward-only 상향 — merge 시 `## [1.24.0]` 중복이면 한 칸 올리고 동기 대상 전면 갱신 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation 7개 블록 전부 통과
- [ ] `--repo A`를 cwd=B에서 실행해도 A에만 쓰임이 test로 확인됨 (`{cwd}` 누락 회귀)
- [ ] `setup.md`의 exit-code 전파 3줄이 CI 계약 lint로 단언됨
- [ ] `parseEntries`가 inline `#`를 절단하지 않음이 test로 확인됨
- [ ] marker 블록의 `mccp <version>` 표기가 `plugin.json` 값과 일치함이 test로 확인됨 (DD4-Q4)
- [ ] `.bak`이 실행 전 파일과 **바이트 동일**함이 test로 확인됨 (존재 확인만으로 부족)
- [ ] `setup.md`에 `MCCP_TMP` 문자열이 없음이 계약 lint 9번으로 확인됨
- [ ] CHANGELOG `## [1.24.0]` 유일성 + PRD status `complete`가 Task 4 Validate로 확인됨
- [ ] 임시 repo에서 `create` → 재실행 `noop`이 **실제 write 경로**로 확인됨 (dry-run 아님)
- [ ] receipt 4줄 순서가 test에서 인덱스 부등식으로 단언됨
- [ ] `.gitignore` 47개 항목이 `MCCP_IGNORE_ENTRIES`(26) 또는 `REPO_ONLY`(21)로 분류되고 **집합 단언 2개 + 교집합 공집합**이 test로 확인됨 (합계 등식 미사용 — 중복에 취약)
- [ ] 정본 규칙을 marker 없이 이미 가진 repo에 provision해도 lint가 통과함이 test로 확인됨 (`stripManagedBlock`)
- [ ] git 미설치(`git-unavailable`)가 skip이 아니라 **exit 1**임이 spawnSync 스텁 test로 확인됨
- [ ] `plugin.json` 판독 실패가 exit 1임이 test로 확인됨
- [ ] non-git-repo가 **exit 0 + `action:'skip'`**임이 test로 확인됨 (UI5)
- [ ] write 실패 시 CLI가 **exit 1**을 냄이 test로 확인됨 (DD1)
- [ ] `--dry-run`이 파일을 쓰지 않음이 test로 확인됨 (UI9)
- [ ] drift lint가 CI 워크플로 스텝으로 등록됨 (DD3)
- [ ] Patterns mirrored, not reinvented

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

R1 패널(architect / security / test / invariant) 판정 `divergent`, blocking 8건. 전문은 [`.claude/reviews/plan-review-setup-gitignore.md`](../reviews/plan-review-setup-gitignore.md). 흡수 내역:

| # | Perspective | Severity | 흡수 |
|---|---|---|---|
| F1 | invariant | CRITICAL | exit-code 계약 모순 → **DD1**로 계층별 소유 확정(라이브러리 throw / 탐지 sentinel / CLI exit 1 / Phase 5 halt), skip과 오류를 exit code로 분리 |
| F2 | invariant | HIGH | 같은 뿌리 — DD1 표가 `applyMerge` vs CLI wrapper 소유를 명시. Patterns 표의 mirror 대상도 역할별로 분리 |
| F3 | invariant | HIGH | Validation에 **실제 write E2E**(§3·§4) + Task 2 "실제 write E2E" 그룹 + Acceptance 항목 추가 |
| F4 | test | HIGH | non-git-repo case를 Task 2 skip/오류 그룹 + Validation §4 + Acceptance에 등재 |
| F5 | architect | HIGH | drift 강제 지점을 **DD3**로 명문화(순서 불변식 + 합계 등식) + **Task 5 CI 등록**으로 "기억 의존" 제거 |
| F6 | architect | MEDIUM | 정본 26 + REPO_ONLY 21 = 47 **전수를 plan 본문에 열거**(「정본 목록」 절) |
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

R2에서 architect는 pass로 전환(47개 전수 대조·DD1·DD3를 실측 확인). test 패널은 MEDIUM/LOW만 내고 `verdict=fail`을 반환해 자기 계약(HIGH/CRITICAL만 fail)을 어겼으나, 지적 자체는 유효하므로 그대로 흡수했다.

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
| J1 | R5 | architect | CRITICAL | **이 repo는 정본 26줄을 marker 없이 이미 갖고 있다.** provision하면 같은 줄이 블록 안에 한 벌 더 생기고, R2에서 도입한 합계 등식(`26+21===47`)이 73에서 깨진다. `stripManagedBlock`을 신설해 lint가 **managed 블록을 제외하고** 파싱하게 하고, 합계 등식을 **폐기**한 뒤 `정본 ∩ REPO_ONLY === ∅`(중복 면역)로 대체. 중복 줄 자체는 PRD Out-of-scope가 허용한 동작이므로 제거하지 않는다 |
| J2 | R5 | architect | HIGH | 그 상태(정본을 marker 없이 보유)에 대한 test 부재 → 마이그레이션 케이스 신설: 기존 줄 무손상 + 블록 append + `stripManagedBlock` 후 집합이 provision 전과 동일 |
| J3 | R5 | invariant | HIGH | lint 항목 3이 `git ls-files -i -c --exclude-standard`를 요구하는데 **bash 블록에 그 줄이 없었다** — "그대로 쓰라"는 지시와 lint가 모순. 오염 감지 + action별 보고를 블록에 실제로 기입 |
| J4 | R5 | invariant | MEDIUM | lint가 방어 구조만 보고 action 분기는 안 봄 → 항목 10(`case` + 5개 action 이름) · 항목 11(`git rm --cached` 안내 = UI7 계약) 추가 |
| J5 | R5 | architect | MEDIUM | `--repo` → `resolveRepoRoot(cwd)` 배선을 Task 1 action 본문에 명시(산문 밖에 두지 않음) |
| J6 | R5 | architect | MEDIUM | 정본 블록의 `ORDER IS LOAD-BEARING` 주석 보존을 test로 고정 — 순서 불변식을 후임에게 전달하는 유일한 채널 |
| J7 | R5 | test | MEDIUM | `plugin.json` 판독 실패 → throw → CLI exit 1 test 추가 |

R5에서 `security` 워커가 StructuredOutput을 호출하지 않고 종료해 응답이 3/4다. quorum(3) 자체는 충족했고 판정은 blocking finding으로 갈렸으므로 결과 해석에 영향은 없으나, **security 축이 이번 라운드에서는 실제로 검토되지 않았다**는 사실은 기록해 둔다(R3·R4에서 연속 pass).

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
