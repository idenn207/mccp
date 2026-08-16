# Plan: Gate Guard Integrity — 잔여 종료 (M3)

**Source PRD**: `.claude/prds/gate-guard-integrity.prd.md`
**Selected Milestone**: 3 — 잔여 종료
**Complexity**: Medium

## Summary

M1·M2가 ship된 뒤 저장소에 남은 이 PRD의 잔여물을 실측으로 확인했고, 세 층으로 갈렸다 — **물리적 잔여 4건**(미커밋 증거·미정리 worktree·미아카이브 PRD) · **문서 드리프트 5건**(닫힌 OQ가 열린 채 표기 · CHANGELOG 순서 붕괴 · 미등재 env · PRD Evidence 행 인용 드리프트 · CLAUDE.md §3.7의 sync 목록 stale) · **경계된 결함 6건**.

여섯 번째 결함은 L2 반증 패널이 찾았다: **가드 2가 `plugins/mccp/commands/pr.md`의 세 validate callsite 중 두 곳에서만 복원됐고, 남은 한 곳의 주석은 복원됐다고 말한다.** 이 PRD가 정의한 문제("fail-closed여야 할 지점이 fail-open이고, 알려줄 장치가 무력화된 그 가드 자신")와 같은 형태이므로 M3이 닫는다.

**닫지 않는 것은 OQ5의 근본 원인**이다 — M2가 유입시킨 비결정 2건(각 ≈10%/run)의 메커니즘은 재현 시도 3종이 전부 실패했고, PRD Scope가 "테스트 병렬 실행 구조 재설계"를 범위 밖으로 못박았다. M3은 그 원인을 **관측할 수 있게 만드는 계측**(C4)까지만 하고 원인 지목은 하지 않는다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | PRD의 두 milestone은 모두 complete로 간주한다 | direction |
| UI2 | 남아있는 잔여물의 실재 여부를 실측으로 확인한다 | constraint |
| UI3 | 그 작업에서 파생된 backlog와 문제점을 plan 산출물로 남긴다 | direction |
| UI4 | 잔여를 Milestone 3으로 신설해 한 단위로 묶는다 | direction |
| UI5 | OQ5 근본 원인 확정은 계측 확보까지로 제한한다 | exclusion |
| UI6 | PRD 아카이브는 M3 완료 후에 수행한다 | constraint |
| UI7 | 게이트가 찾은 2.5.8 축을 별건으로 빼지 않고 M3에서 함께 닫는다 | direction |

## 확인된 잔여물 (UI2의 산출 — 2026-08-14~15 실측)

전부 읽기 전용 재현으로 확인했다. 추정 항목은 그 사실을 열에 적었다.

### A. 물리적 잔여 (4건)

| # | 잔여 | 실측 근거 | 판정 |
|---|---|---|---|
| A1 | M2 completion-ledger 엔트리 미커밋 | `.claude/state/completion-ledger/gate-guard-integrity-m2__1559548cadb7.json`이 untracked. 같은 디렉토리의 M1 2건(`gate-guard-integrity__40e73a0851d1` · `gate-guard-integrity-m1-completion__b62f18c36731`)은 `origin/main`에 tracked | 실재 — §3.12 위반 |
| A2 | Stop-loop 상태 파일 미커밋 | `git diff --stat -- .claude/state/` → `fix-task-applied.md` +6/-6, `fix-task.md` 31줄 삭제. §3.2가 둘 다 git-tracked로 규정 | 실재 |
| A3 | worktree 미정리 | `git rev-list --left-right --count origin/main...HEAD` = `1 0` → 브랜치는 완전 머지됨. §3.8은 "PR squash 직후 같은 cycle 안에서 cleanup까지가 한 단위" | 실재 |
| A4 | PRD·plan 미아카이브 | `archive-complete/scan.js` → `archivable: true`, `reason: "all 2 milestone rows complete/dropped"`. M1·M2 리포트가 각각 §3.11 C2("PRD 전체 완료 시에만")를 근거로 미룬 조건이 **최초로 성립** | 실재 — 단 UI6대로 M3 완료 후 |

`evidence-audit --json` → `state: "incomplete"`, `coverage: 0.457`, `unverifiable: 19`. **A1이 그 19건 전부의 원인이라고 주장하지 않는다** — 19건은 저장소 전체 ledger의 누적 격차이고 A1은 그중 1건이다. 이 수치는 A1 해소 전후의 대조값으로만 쓴다.

### B. 문서 드리프트 (5건)

| # | 드리프트 | 실측 근거 | 판정 |
|---|---|---|---|
| B1 | PRD Open Questions 1~3이 `[ ]`인 채 남음 | 셋 다 `.claude/plans/gate-guard-integrity.plan.md`의 `## Open Questions — 판정` 절(`:34-93`)에서 근거와 함께 닫혔다 — OQ1 `ALLOW, 단 loud` · OQ2 `proof 집합의 축 오염 제거` · OQ3 `기존 receipt 즉시 stale 0건, 이행 경로 불필요`. PRD만 읽는 사람은 미해결로 읽는다 | 실재 |
| B2 | CHANGELOG 항목 순서 붕괴 | `grep -n '^## \[' CHANGELOG.md` → `1.23.11(7) · 1.23.10(31) · 1.23.8(92) · 1.23.7(128) · 1.23.6(205) · 1.23.5(229) · **1.23.9(356)** · 1.23.4(384)`. `[1.23.9]`가 `[1.23.5]` 아래에 놓임 | 실재 — main 선재 |
| B3 | test-only env 2종 미등재 | `MCCP_PERF_INJECT_QUADRATIC` · `MCCP_TEST_SESSION_START_PATH` 모두 `docs/ENVIRONMENT.md` grep 0건. **선례 존재** — `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL`이 `:363`에 등재돼 있어 "test 전용은 등재 대상이 아니다"라는 판단은 성립하지 않는다 | 실재 |
| B4 | PRD Evidence의 `plugins/mccp/commands/pr.md` 행 인용이 드리프트 | PRD `:21`이 `plugins/mccp/commands/pr.md:202`(preflight)·`plugins/mccp/commands/pr.md:856`(ship-gate read-back)을 지목하나, 현 파일의 `:202`는 `DECISION_SLUG=$(… derive-decision …)`이고 실제 staleness validate는 `:939-945`다. M1 수정이 행을 밀었다 | 실재 — L2 architect가 지목. **역사적 기록의 행 드리프트이지 Evidence 자체의 오류는 아니다** |
| B5 | CLAUDE.md §3.7의 "동기 대상 5면"이 stale | §3.7이 `renderer/tests/i18n-surface.test.js` **단언 2개**를 sync 대상으로 적으나, 그 파일 `:88-94`는 `MANIFEST_VERSION = require('plugin.json').version`으로 **파생**하며 버전 리터럴을 갖지 않는다(주석이 그 의도를 명시: "hardcoded [version] … §3.7 calls version bumps a frequently-missed axis"). §3.7을 문자대로 따르면 존재하지 않는 리터럴을 찾게 된다. 실제 리터럴은 `plugin.json` · `html.js:1419` · `markdown.js:163` **3곳**뿐이고 test가 셋의 일치를 자동 검증한다 | 실재 — L2 architect MEDIUM에서 파생, 저자 실측으로 확정 |

### C. 경계된 결함 (6건)

| # | 결함 | 실측 근거 | 귀속 |
|---|---|---|---|
| C1 | 저장소 트리 안 고정경로 fixture 2곳 | `plugins/mccp/scripts/lib/tests/msw-events.test.js:13` → `<scripts>/.test-msw-events/<testName>` (sessionId도 고정) · `plugins/mccp/scripts/lib/tests/toggle-snapshot.test.js:61` → `<scripts>/.test-toggle-snapshot` (sessionId 고정). **둘 다 `git check-ignore` → NOT IGNORED**이며 `.test-msw-events/`는 지금 트리에 실재한다(빈 디렉토리라 `git status`에 안 보임) | PRD OQ6. M2 리포트가 1곳만 지목 — **2곳째는 이번 스캔의 신규 발견** |
| C2 | `prp-implement` Phase 5 아카이브 지시가 자기 chain을 차단 | `plugins/mccp/commands/prp-implement.md:1469-1470`이 무조건 `mv "$ARGUMENTS" .claude/PRPs/plans/completed/`. (a) §3.11 C2 위반(미완료 PRD의 plan 소실) (b) M1이 2.5.9에서 복원한 가드 2 때문에 `--plan` 경로가 사라지면 `stale` → **자기 PR이 방금 복원한 가드에 막힌다**(M1 리포트 실측: 부재 경로 → stale 2건) (c) 목적지가 `completed/`인데 §3.11·`apply.js`·`milestone-history.js`는 `archived/`만 본다 → 어느 스캔에도 안 잡힘. 보고 문구 3곳(`:1484` `:1506` `:1609`)도 같은 오류 | backlog 2026-08-09(M1 자체 발견) + 2026-08-13(M1.5 santa-loop)이 **같은 Phase 5의 다른 축**을 각각 지목 |
| C3 | `parsePlanFiles`가 제목-표 사이 프로즈 1줄에 깨짐 | `plugins/mccp/scripts/receipt/dedupe.js:104-124` — 제목 뒤 공백만 skip하고 첫 비어있지 않은 줄을 헤더로 읽는다. `parseRow(:55-62)`는 `|` 없는 줄도 1-cell 배열로 돌려주므로 프로즈가 헤더가 되고 다음 줄에서 `table separator missing`. **A/B 실측**(backlog 2026-08-09): 설명 줄 1개 제거 → `ok:false → ok:true, files=13` | backlog. fail-closed라 안전하되 dedupe가 조용히 불발 |
| C4 | harness가 per-run 실패 이름을 버린다 | `plugins/mccp/scripts/lib/suite-determinism.js:198`이 `runs.push({pass, fail, skipped, failing})`로 이름을 **이미 갖고 있는데** `:209`의 `per_run` 매핑이 `{pass, fail, skipped}`만 남기고 `failing`을 떨어뜨린다. 어느 실행에서 어느 이름이 갈렸는지 사후 조회 불가 | M2 리포트가 한계 L1로 명시 기록. **OQ5를 진단할 수 없는 직접 원인** |
| C5 | b2-coverage-gate backlog 항목이 해소 후에도 open 표기 | `plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js:57`에 `{file: 'receipt/store.js', fn: 'quarantineReceipt'}`가 등재돼 있고 M2 harness 10회에서 `alwaysFailing: []` — **축 C는 닫혔다**. 그러나 backlog 2026-08-09 HIGH 항목에 해소 표기가 없다 | backlog 위생 |
| C6 | **가드 2가 `plugins/mccp/commands/pr.md`의 세 callsite 중 두 곳에서만 복원됐고, 남은 한 곳의 주석이 복원됐다고 말한다** | `--plan` 실행 경로 3곳 대조: `:238`(2.5.7 precheck) `"$PRECHECK_PLAN"` 실변수 · `:943`(2.5.9 ship-gate) `"$SHIP_PLAN_PATH"` 실변수 · **`:883`(2.5.8 code-review chain-check) 리터럴 `<plan path>`**. 그런데 `:914` 주석은 *"2.5.8's code-review chain-check **also passes** `--plan` and can stale-block before Phase 3"* 라고 주장한다. `validate-cmd.js:363-384`는 staleness 전체를 `if (opts.planPath)` 안에 두므로 인자 부재 시 error도 warning도 없이 skip된다 | **L2 invariant 패널이 발견**. M1 리포트가 2.5.9 수정만 기록하고 2.5.8을 언급하지 않는다 |

**C6의 실패 모드는 정확히 서술한다.** `:916-925` 주석이 이미 적어 둔 대로 미치환 `<plan-path>`는 "bad argument가 아니라 bash **SYNTAX ERROR**(`<`가 리다이렉션을 연다)"다. 따라서 치환 실패가 곧바로 조용한 통과가 되지는 않는다 — 조용해지는 경로는 **본문을 실행하는 LLM이 깨진 bash를 내는 대신 `--plan` 줄을 통째로 빠뜨릴 때**이고, 그때 `validate-cmd.js:363`이 staleness를 통째로 건너뛴다. 어느 쪽이든 이 게이트는 모델의 치환에 의존하며 기계적이지 않고, 그것이 M1이 2.5.9에서 self-derivation으로 옮긴 이유 그 자체다. 같은 주석이 그 이전 수정을 "an inconsistency between the two edits"라 부르는데, 세 번째 callsite에 같은 비대칭이 남아 있다.

### D. 이관만 하고 손대지 않는 것

| 항목 | 왜 M3이 닫지 않는가 |
|---|---|
| OQ5 — M2 유입 비결정 2건의 메커니즘 | 재현 시도 3종(16× 동시 · 3배 부하 · 15× 순차) **전부 실패**. PRD Scope가 "테스트 병렬 실행 구조 재설계"를 범위 밖으로 명시. UI5가 계측까지로 제한. M3은 C4로 **관측 수단만** 만든다 |
| backlog 2026-08-09 MEDIUM — #118 free-form plan 문서 정렬 | `codex-intent-context` PRD 소관. 이 브랜치 diff에 있는 것은 main reconcile 때문이지 변경했기 때문이 아님 |
| cross-model 미확증 | M1·M2 둘 다 `MCCP_CODEX_DISABLED=1`로 Codex 미발화. env는 사용자 전역 설정. M3도 같은 공백을 승계하며 **획득했다고 주장하지 않는다** — 다만 M3은 L2 반증 패널 4인의 실발화를 받았고 그 패널이 C6·B5를 찾았다(모델 다양성은 아니나 컨텍스트 격리는 확보) |
| 10회 관측의 약함 | p≈0.10에서 미포착 확률 ≈35%. 회차를 늘리는 것은 1회 ≈50분의 비용 축이고 UI5 밖 |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| fixture root | `plugins/mccp/scripts/lib/tests/a3-instruction-cost.test.js:31` | `fs.mkdtempSync(path.join(os.tmpdir(), '<prefix>-'))` — M2 D8이 같은 이유(전수 병렬 중 저장소 트리 쓰기 제거)로 확립한 선례 |
| validate callsite self-derivation | `plugins/mccp/commands/pr.md:939` | `SHIP_PLAN_PATH="${PR_PLAN_PATH:-.claude/plans/${DECISION_SLUG}.plan.md}"` — placeholder 대신 실변수. C6이 그대로 따른다 |
| fail-closed 반환 | `plugins/mccp/scripts/receipt/dedupe.js:95-130` | 예외가 아니라 `{ok:false, error:'<무엇이 왜>', files:[]}` |
| 순수 오라클 분리 | `plugins/mccp/scripts/lib/suite-determinism.js:73-120` | 판정층은 I/O 없이 합성 입력으로 결정적 단언 가능 |
| test env 등재 | `docs/ENVIRONMENT.md:363` | test 전용 env도 한 줄로 `# v<ver> test env (<목적>)` 형식 등재 |
| 파생형 version 단언 | `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:88-94` | 기대값을 리터럴로 박지 않고 `plugin.json`에서 파생 — B5가 §3.7을 이 실제 형태로 정정한다 |

## Files to Change
| File | Action | Why |
|---|---|---|
| `.claude/prds/gate-guard-integrity.prd.md` | UPDATE | M3 행 추가 · OQ1~3을 근거와 함께 `[x]` 정정(B1) · Evidence 행 인용 정정(B4) · OQ5/OQ6 이관처 명시 |
| `plugins/mccp/commands/pr.md` | UPDATE | C6 — 2.5.8의 리터럴 `--plan <plan path>`(`:883`)를 2.5.9와 같은 self-derived 실변수로 |
| `plugins/mccp/scripts/lib/tests/msw-events.test.js` | UPDATE | C1 — `getTempDir`를 `os.tmpdir()` mkdtemp로, 고정 sessionId를 실행별 고유값으로 |
| `plugins/mccp/scripts/lib/tests/toggle-snapshot.test.js` | UPDATE | C1 — 동일(신규 발견 2곳째) |
| `.gitignore` | UPDATE | C1 재발 안전망 — `plugins/mccp/scripts/.test-*/` |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | C2 — Phase 5 아카이브 지시를 `/mccp:archive-complete` 위임으로 교체(`:1469-1470` + 보고 문구 `:1484` `:1506` `:1609`) |
| `plugins/mccp/scripts/receipt/dedupe.js` | UPDATE | C3 — `parsePlanFiles`가 제목과 표 사이 비-표 줄을 skip |
| `plugins/mccp/scripts/receipt/tests/dedupe.test.js` | UPDATE | C3 부정 케이스 — 프로즈 줄 존재 시 파싱 성공 + 표 부재 시 여전히 fail-closed |
| `plugins/mccp/scripts/lib/suite-determinism.js` | UPDATE | C4 — `per_run`이 `failing` 이름 배열을 보존 |
| `plugins/mccp/scripts/lib/tests/suite-determinism.test.js` | UPDATE | C4 단언 — per-run 이름이 실제로 실린다 |
| `plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js` | UPDATE | C6 회귀 — 이 lint가 **자기 주석으로 인정한 공백**("The flag values may be variables, **placeholders**, or literals — only flag presence is asserted")을 닫는다. ship/chain을 게이팅하는 validate callsite의 `--plan` 값이 shell 변수임을 단언 |
| `docs/ENVIRONMENT.md` | UPDATE | B3 — test-only env 2종 등재 |
| `CHANGELOG.md` | UPDATE | B2 — `## [1.23.9]` 재배치 + `## [1.23.12]` 신규 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | §3.7 — 1.23.11 → 1.23.12 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | §3.7 version 리터럴 (`:1419`) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | §3.7 version 리터럴 (`:163`) |
| `CLAUDE.md` | UPDATE | §3.11에 아카이브 소유권 명문화(C2) + §3.7의 sync 대상을 실제 3리터럴 + 파생 test로 정정(B5) |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | C5 해소 표기 + C2/C3 흡수 표기 + OQ5 이관 행 |
| `.claude/state/completion-ledger/gate-guard-integrity-m2__1559548cadb7.json` | UPDATE | A1 — 미커밋 증거를 tracked로 (§3.12) |
| `.claude/state/fix-task-applied.md` | UPDATE | A2 — 적용 기록 커밋. 같은 커밋에 `.claude/state/fix-task.md`의 삭제(이미 워킹트리에 반영돼 파일 부재)를 함께 stage |
| `.claude/state/STATE.md` | UPDATE | Goal/Next Step을 M3으로 이동 (state-writer API 경유) |

> **`plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`는 의도적으로 제외한다** — `:88-94`가 기대 버전을 `plugin.json`에서 파생하므로 편집할 리터럴이 없다. §3.7이 이 파일을 sync 대상으로 적은 것이 B5의 드리프트다.

## Tasks

### Task 0: 잔여물 게이트 — 위 표의 15건을 재확인
- **Action**: A1~A4 · B1~B5 · C1~C6의 실측 근거 명령을 그대로 재실행해 **착수 시점에도 성립함**을 확인한다. 하나라도 이미 해소돼 있으면 그 행을 표에서 제거하고 사유를 리포트에 남긴다(이미 없는 것을 고쳤다고 적지 않기 위해).
- **Mirror**: M1 리포트 `Task 0 — 3-sweep 소비처 열거`의 gate 형태 — 표적이 실재하는지를 먼저 증명하고 진행 승인
- **Validate**: 15행 각각에 대해 명령 1개와 그 출력. 해소된 행이 있으면 `제거 사유` 열이 채워짐

### Task 1: A1·A2 증거·상태 커밋 (커밋 **전** 무결성 확인 포함)
- **Action**: 커밋 **전에** `evidence-audit`의 `hash_bound`/`state`를 먼저 읽어 기준값을 잡는다. `.claude/state/completion-ledger/gate-guard-integrity-m2__*.json` · `fix-task-applied.md`(+ `fix-task.md` 삭제)를 커밋한다. ledger 파일은 **재봉인하지 않는다** — §3.12 no-rehash invariant상 `receipt_hash` 재계산은 `v1.22.4-cwd-rebind.js` 외에는 금지이고, 여기서 필요한 것은 `git add`뿐이다.
- **Mirror**: `chore(evidence): persist mccp-pr-codex ship receipts for …` 커밋 형태(`fffa166` · `5f8b1ae`)
- **Validate**: `git status --short -- .claude/state/` 공백 · `evidence-audit --json`의 **`state`가 `inconsistent`가 아니고** `hash_bound === comparable`이 커밋 전후 모두 성립(`evidence-audit.js:283`이 `hashBound < comparable`을 `inconsistent`로 승격하므로, 이 등식이 A1 엔트리의 `receipt_hash`가 디스크 receipt와 실제로 결속됐다는 직접 증거다) · `unverifiable`이 착수 대비 1 감소
- **왜 `unverifiable`만으로 부족한가**: `unverifiable`은 "짝이 없다"만 세고, 위조된 body가 ledger와 같은 stale hash를 들고 있는 경우는 `hash_bound` 쪽에서만 잡힌다(`evidence-audit.js:185-196` `receiptIntegrityOk`가 재계산 + schema 검증까지 한다). L2 security 패널(R1)의 지적.
- **대응 ship receipt는 이미 tracked이므로 커밋 대상이 아니다** (R2 security CRITICAL 반증): `.gitignore:31-32`가 `.claude/receipts/*` 다음 줄에 `!.claude/receipts/mccp-pr-codex/` **부정 패턴**을 두므로 ship receipt는 ignore되지 않는다. `git ls-files --error-unmatch .claude/receipts/mccp-pr-codex/gate-guard-integrity-m2.json` 성공 · `git ls-tree origin/main`에도 존재(커밋 `fffa166`). 따라서 `hash_bound === comparable`은 clone에서도 성립하며, A1의 미커밋 대상은 **ledger 엔트리 한 건뿐**이다.

### Task 2: C1 — 저장소 트리 안 fixture 2곳 이전
- **Action**: `msw-events.test.js:12-14`의 `getTempDir`와 `toggle-snapshot.test.js:61`의 `tmpDir`를 `fs.mkdtempSync(path.join(os.tmpdir(), '<prefix>-'))`로 바꾸고, 두 파일의 **고정 sessionId도 실행별 고유값**으로 바꾼다(경로만 옮기고 sessionId를 두면 같은 tmp 밖에서 여전히 충돌한다). `.gitignore`에 `plugins/mccp/scripts/.test-*/`를 안전망으로 추가하고, 트리에 실재하는 빈 `.test-msw-events/`를 제거한다.
- **Mirror**: `a3-instruction-cost.test.js:31`
- **Validate**: 아래 §Validation의 `[C1]` 블록 — 개별 실행 · `git check-ignore` IGNORED · 실행 후 `git status --short` 공백 · **동시 3개 실행 간섭 0**

### Task 3: C2 — Phase 5 아카이브 지시를 `/mccp:archive-complete`에 위임
- **Action**: `plugins/mccp/commands/prp-implement.md:1469-1470`의 `mkdir -p` + `mv`를 제거하고, 그 자리에 "plan은 이동하지 않는다 — 아카이브는 PRD 전체 완료 시 `/mccp:archive-complete`가 원자 트랜잭션으로 수행한다"는 지시와 **왜 그런지**(§3.11 C2 데이터 손실 + 가드 2가 `--plan` 경로 부재를 stale로 잡는 자기차단)를 적는다. 보고 문구 3곳(`:1484` `:1506` `:1609`)의 `completed/` 서술을 정정한다. `CLAUDE.md` §3.11에 소유권을 명문화한다.
- **Mirror**: §3.11의 `/mccp:archive-complete` 소유권 서술 + `apply.js`의 C2 재검증
- **Validate**: 아래 §Validation의 `[C2]` + `[G2]` 블록 — `PRPs/plans/completed` 0건 · `archive-complete` 언급 ≥1 · 부재 경로 → `stale` · **hash 불일치 경로에서도 stale 발화**
- **`[G2]`는 이미 실측했다** (2026-08-15, 이 plan 작성 중): `gate-guard-integrity-m2.plan.md` 사본에 주석 1줄을 덧붙여 `validate --command mccp:prp-implement --decision gate-guard-integrity-m2 --plan <사본>`을 돌리면 `ok:false` + `stale[0].reason = "plan file hash differs from receipt (plan changed since gate)"`(`9fd9fd66… → a3777717…`)가 나오고, **원본 경로는 `ok:true`** 다. 즉 가드 2는 hash 경로에서 살아 있으며 오탐도 없다. 부재 경로만 재현하면 "읽을 수 없음"만 증명되고 "게이트 이후 변경"은 증명되지 않는다 — L2 test 패널(R2)의 지적.

### Task 4: C6 — 2.5.8 validate callsite를 self-derived 실변수로
- **Action**: `plugins/mccp/commands/pr.md:883`의 `--plan <plan path>`를 2.5.9와 동형으로 바꾼다 — 2.5.8 블록 안에서 `CHAIN_PLAN_PATH="${PR_PLAN_PATH:-.claude/plans/${DECISION_SLUG}.plan.md}"`를 먼저 도출하고 `--plan "$CHAIN_PLAN_PATH"`를 넘긴다(`DECISION_SLUG`은 2.5.7에서 이미 도출됨). `:914` 주석의 주장이 이제 코드와 일치하므로 문구는 유지하되, 세 callsite 전부가 실변수임을 한 줄로 못박는다. `plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js`에 정적 회귀를 건다 — ship/chain을 게이팅하는 validate callsite의 `--plan` 값이 `<`로 시작하지 않고 `"$`로 시작함을 단언한다.
- **좁히는 기계 (L2 architect R4 HIGH 흡수)**: 손으로 관리하는 행 번호 목록을 쓰지 않는다. 기존 `findValidateCallsites`(`:73-96`)가 이미 `cli.js validate`만 매칭하므로 1차 경계는 공짜로 얻고, 2차 경계는 **파일 단위**다 — 신규 단언은 `basename(file) === 'pr.md'`인 callsite에만 적용하고 나머지 command는 기존 "flag presence" 규칙 그대로 둔다. 이 경계가 정확한 이유는 실측됐다: lint 매처로 센 `plugins/mccp/commands/pr.md`의 validate callsite는 **정확히 3개**(`:235` precheck · `:880` chain-check · `:940` ship-gate)이고 그 셋이 곧 게이팅 3곳이라, "pr.md의 validate callsite"와 "게이팅 callsite"가 외연이 같다. 파일 단위로 좁히는 것이 필수인 이유도 실측됐다 — `plugins/mccp/commands/plan.md`에는 정당한 placeholder validate callsite가 2곳(`:95` `--plan <mccp_receipt_gate.planPath>` · `:2319` `--plan <plan path>`) 실재하므로, 전 command에 단언을 걸면 그 둘이 즉시 red가 된다.
- **왜 이 lint가 집인가**: 그 파일의 헤더 주석(`:16`)이 *"The flag values may be variables, **placeholders**, or literals — only flag presence is asserted"* 라고 **자기 공백을 명시**한다. C6은 정확히 그 공백을 통과한 결함이다. 이것은 PRD Evidence가 지목한 G2의 성질과 같은 종이다 — "lint가 플래그 존재만 봐서 가드가 죽은 채로도 통과". 따라서 정정 지점은 **계약을 적어 둔 그 파일**이지 다른 test 파일이 아니다. 헤더의 "What it does NOT check" 목록도 같이 갱신한다.
- **범위 한정**: 전 command의 모든 callsite에 실변수를 강요하지 않는다. 단언 대상은 **결과에 게이팅이 걸린 곳**(`plugins/mccp/commands/pr.md`의 2.5.7 precheck `:235` · 2.5.8 chain-check `:880` · 2.5.9 ship-gate `:940`) 셋이다. 그대로 두는 것은 두 종류이고, 둘 다 실측으로 확정했다:
  - **lint 도메인 밖** — `plugins/mccp/commands/pr.md:418-421`의 `cli.js dedupe`(`--plan <plan-path>`). 매처가 `validate`만 잡으므로 이 호출은 애초에 보이지 않는다. `plugins/mccp/commands/pr.md:806`(`--plan "<plan path or PR title>"`)도 validate가 아니라 `finalize-receipt` 플래그 목록이다.
  - **lint 도메인 안이지만 비게이팅** — `plugins/mccp/commands/plan.md:95`·`:2319`의 placeholder validate callsite 2곳. 파일 단위 경계가 이 둘을 지킨다.
  - 오탐 시 test가 즉시 red이므로 조용히 넘어가지 않는다.
  - **R4 정정 기록**: 이 항목은 R4 이전에 `plugins/mccp/commands/plan.md:419`·`plugins/mccp/commands/pr.md:806`을 예시로 들었는데 **둘 다 오인용**이었다 — 전자는 lease 관련 주석 블록이고 후자는 위와 같이 finalize 플래그다. 그 오인용이 §Validation `[C6]`의 무차별 `grep -- "--plan <"`(파일 전체 0건 요구)를 낳았고, 그 grep은 dedupe callsite를 함께 잡아 **구현이 옳을 때 실패**했다. L2 architect·test 패널(R4)이 같은 지점을 지목했다.
- **Mirror**: `plugins/mccp/commands/pr.md:939` (`SHIP_PLAN_PATH` 도출) + `plugins/mccp/commands/pr.md:916-925`의 근거 주석
- **한 규칙, 두 자리** (L2 test R5 HIGH 흡수): `[C6]` Validation의 node 한 줄과 lint test의 신규 단언은 **같은 규칙**이며 매처(`/cli\.js"?\s+validate\s+(--command|\\$)/`)와 판정(`--plan` 값이 `"$`로 시작)을 공유한다. 기계적 게이트는 **lint test 쪽**이고(CI가 돌린다), Validation의 한 줄은 사람이 즉시 읽을 수 있는 거울이다. 둘이 갈라지면 lint test가 정본이다.
- **A/B의 순서**: A/B는 Task 4가 lint test를 갱신한 **뒤에** 돈다. 갱신 전 test는 헤더(`:15-16`)가 밝히듯 flag **존재**만 보므로, `plugins/mccp/commands/pr.md`를 stash해 placeholder를 되돌려도 green이다 — 그 green은 "결함 없음"이 아니라 **"이 test가 아직 값을 보지 않는다"**는 뜻이고, 그것이 C6이 통과한 공백 자체다. 따라서 A/B의 비공허성은 test 갱신 이후에만 성립한다.
- **Validate**: 아래 §Validation의 `[C6]` 블록 — validate-scoped 검사(callsite 3 · non-variable 0) · 신규 회귀 test가 **수정 전 `plugins/mccp/commands/pr.md`에서 red**임을 A/B로 확인(비공허성)
- **주장하지 않는 것**: 이 수정은 "LLM이 `--plan` 줄을 통째로 빠뜨리는 경로"를 닫지 않는다. 그것은 `validate-cmd.js:363`의 조건부 staleness가 만드는 구조이며, 인자 필수화는 다른 callsite(preflight 등)의 의도된 선택적 사용을 깨뜨리므로 **범위 밖**이다. M3이 닫는 것은 "치환에 의존하는 callsite"이고, 남는 축은 backlog로 이관한다.

### Task 5: C3 — `parsePlanFiles` 프로즈줄 내성
- **Action**: `dedupe.js:104` 이후의 전진 루프를 "공백만 skip"에서 "**첫 `|` 시작 줄까지 전진**(단 `HEADING_RE` 만나면 중단)"으로 바꾼다. 표 자체는 여전히 명시적으로 요구되므로 fail-closed 성질은 유지된다 — 표가 없으면 헤딩/EOF에서 멈춰 기존 에러를 그대로 낸다.
- **Mirror**: 같은 함수의 기존 fail-closed 반환 형태(`:95-130`)
- **신규 test 이름은 계약이다** (L2 test R5 CRITICAL 흡수): `[C3]` Validation이 test **이름 문자열**을 grep하므로, 이름이 자유이면 그 검증은 구현자의 작명에 걸려 비결정이 된다. 따라서 두 케이스의 `test(...)` 이름을 여기서 못박는다 — 긍정 케이스 `parsePlanFiles tolerates a prose line between heading and table`, 부정 케이스 `parsePlanFiles fails closed when the table is absent entirely`. Validation의 grep 문자열(`prose line between heading and table`)은 전자의 부분문자열이다.
- **Validate**: 아래 §Validation의 `[C3]` 블록 — 신규 2케이스 존재를 **위에서 못박은 이름으로 grep 확인** · A/B(수정 전 코드에서 red) · **격리 15회 전후 대조**
- **주의**: 이 함수의 기존 테스트 `parsePlanFiles fails closed when table separator is missing`(`plugins/mccp/scripts/receipt/tests/dedupe.test.js:123`)이 **OQ5의 비결정 2건 중 하나**다(≈10%/run, 격리 15회는 전부 통과). red가 났을 때 "내 변경"과 "flake 발화"를 혼동하지 않기 위해 격리 대조를 쓴다.

### Task 6: C4 — harness가 per-run 실패 이름을 보존
- **Action**: `suite-determinism.js:209`의 `per_run` 매핑에 `failing: r.failing`을 추가한다. 이름은 `:198`에서 **이미 수집돼 있으므로** 수집 로직 변경은 없다. 순수 판정층(`diffRuns`)은 손대지 않는다 — 판정은 무변경이고 진단 정보만 늘린다.
- **Mirror**: `suite-determinism.js:73-120`의 순수층/실행층 분리 — 이 변경은 실행층에만 닿는다
- **Validate**: 아래 §Validation의 `[C4]` 블록 — 단위 test · **CLI 스모크로 실제 출력에 `failing` 키 존재** · `stable`/`alwaysFailing`/`sometimesFailing`이 변경 전후 동일(판정 무영향의 직접 증거)

### Task 7: B1·B2·B3·B4·B5 문서 드리프트
- **Action**: (B1) PRD OQ1~3을 `[x]`로 바꾸고 각 행에 M1 plan `## Open Questions — 판정`의 결론 한 줄과 근거 경로를 덧붙인다. **판정 내용을 재작성하지 않고 인용**한다. (B2) `## [1.23.9]` 블록을 `## [1.23.10]`과 `## [1.23.8]` 사이로 옮긴다 — **본문 무변경, 이동만**. (B3) `docs/ENVIRONMENT.md`에 두 env를 `:363` 형식으로 등재. (B4) PRD Evidence `:21`의 `plugins/mccp/commands/pr.md:202`·`:856` 인용에 "M1 수정 이후 행 이동 — 현재 위치는 `:238`·`:943`" 각주를 단다(원문은 과거 실측이므로 **덮어쓰지 않고 각주**). (B5) CLAUDE.md §3.7의 sync 대상을 실제 형태로 정정 — 리터럴 3곳 + 파생 test 1곳.
- **Mirror**: `docs/ENVIRONMENT.md:363` · `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:88-94`의 파생 주석
- **Validate**: 아래 §Validation의 `[B]` 블록 — PRD 미해결 `- [ ]`가 OQ5·OQ6 2건뿐 · CHANGELOG 헤딩 내림차순 단조 · env 2종 각 1건 · **B2 무손실**(이동 전후 블록 sha256 동일)

### Task 8: C5·backlog 위생
- **Action**: backlog의 b2-coverage-gate 행(2026-08-09 HIGH)에 **행을 지우지 않고** 해소 표기를 덧붙인다(`**RESOLVED in gate-guard-integrity M2**` — `quarantineReceipt` 등재 + harness 10회 `alwaysFailing:[]`). C2·C3 행에도 M3 흡수 표기. OQ5와 Task 4의 잔여 축(조건부 staleness)을 각 1행 추가하되 **원인을 지목하지 않고** 관측 사실만 적는다.
- **Mirror**: backlog의 기존 흡수 표기 형식(`**ABSORBED in v1.4.0-m2 (PR #46)** … row 보존(audit trail)`)
- **Validate**: `git diff -- .claude/plans/codex-findings-backlog.md`에 `-` 시작 줄 0건(append-only 유지)

### Task 9: §3.7 version bump + 전수 회귀 대조
- **Action**: `1.23.11 → 1.23.12`(단일 milestone ship = patch). 리터럴 3곳(`plugin.json` · `html.js:1419` · `markdown.js:163`) + `CHANGELOG.md`. **`plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`는 건드리지 않는다**(B5). 착수 직전 `git fetch` + 병렬 worktree 3개(`codex-intent-context` · `diverse-agent-review-m6` · `v1.24.0-multi-session-m6`)의 선언 버전 확인 후 충돌 시 forward-only 상향.
- **Mirror**: `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:88-94`가 세 리터럴의 일치를 자동 검증하므로, test가 green이면 sync가 성립한 것이다
- **Validate**: 아래 §Validation의 `[V]` 블록 — i18n test green · CHANGELOG 헤딩 중복 0 · **전수 1회**로 `fail` 비증가 + `pass` 비감소

### Task 10: A3·A4 — worktree 정리와 아카이브 (**PR 머지 후, 별도 호출**)
- **Action**: PR 머지 후 `git worktree remove .worktrees/gate-guard-integrity` + `git worktree prune`. 그 다음 `/mccp:archive-complete`로 PRD와 3개 plan을 이동한다.
- **왜 이 PR 안에서 하지 않는가**: `archive-complete`는 PRD와 **그 모든 활성 plan을 하나의 원자 단위로** 옮긴다(C2). 이 plan 자신이 그 집합에 속하므로, PR 전에 실행하면 2.5.9가 넘기는 `--plan` 경로가 사라져 **가드 2가 자기 PR을 막는다** — Task 3이 방금 문서화한 그 자기차단이다. 또한 M3 행이 `in-progress`인 동안은 `scan.js`가 `archivable:false`를 내므로 도구 자체가 거부한다.
- **강제 수단이 없다는 사실을 명시한다** (L2 architect HIGH): 머지 후 사람이 이 두 명령을 실행하도록 **기계적으로 강제하는 게이트는 없다.** 있는 척하지 않는다. 대신 미실행이 **관측 가능**하도록 세 지점에 흔적을 남긴다 — (i) PRD M3 행을 `complete`로 바꾸는 순간 `archive-complete/scan.js`가 `archivable:true`를 내고 이것이 상시 탐지기다, (ii) backlog에 "M3 post-merge 잔여: worktree 정리 + 아카이브" 1행, (iii) 리포트 Next Steps의 미체크 항목. 미실행의 결과는 데이터 손실이 아니라 **아카이브 지연**이며(파일은 활성 경로에 그대로 남는다), 그 비대칭이 이 순서를 정당화한다.
- **Validate**: 머지 후 `scan.js --json`의 gate-guard 항목이 `archivable:true` · 이동 후 `.claude/prds/archived/`와 `.claude/PRPs/plans/archived/`에 4개 파일 · `milestone-history.js`가 여전히 타임라인에 노출 · `git worktree list`에 해당 항목 부재

## Validation

> 이 블록은 **Task 완료 후** 실행하는 사후 단언이다 — Task가 만들 산출물(신규 test 이름 등)을 grep으로 확인하므로 착수 전에는 당연히 실패한다. 착수 **전** 상태(결함 실재)를 재는 것은 `[T0]` 게이트와 각 `git stash` A/B 쌍이며, 그 둘이 비공허성을 담당한다.

```bash
# ── [T0] 잔여물 게이트 ──────────────────────────────────────────────
node plugins/mccp/scripts/lib/archive-complete/scan.js --json
node plugins/mccp/scripts/lib/evidence-audit.js --json
git check-ignore -v plugins/mccp/scripts/.test-msw-events plugins/mccp/scripts/.test-toggle-snapshot
grep -n '^## \[' CHANGELOG.md

# ── [T1] 증거 결속 — unverifiable만이 아니라 state/hash_bound ────────
node plugins/mccp/scripts/lib/evidence-audit.js --json | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
  console.log("state="+j.state,"hash_bound="+j.hash_bound,"comparable="+j.comparable,"unverifiable="+j.unverifiable);
  if(j.state==="inconsistent"||j.hash_bound!==j.comparable){console.error("FAIL: binding broken");process.exit(1)}})'

# ── [C1] fixture 이전 + 동시 실행 간섭 0 ────────────────────────────
node --test plugins/mccp/scripts/lib/tests/msw-events.test.js
node --test plugins/mccp/scripts/lib/tests/toggle-snapshot.test.js
git check-ignore -q plugins/mccp/scripts/.test-msw-events && echo "IGNORED ok"
for i in 1 2 3; do node --test plugins/mccp/scripts/lib/tests/msw-events.test.js > /tmp/msw-$i.log 2>&1 & done; wait
grep -l "not ok" /tmp/msw-*.log && echo "FAIL: 동시 실행 간섭" || echo "동시 3개 간섭 0"
git status --short   # fixture 실행 후 트리 오염 0

# ── [C2] 아카이브 위임 + 가드 2 생존 ────────────────────────────────
grep -c "PRPs/plans/completed" plugins/mccp/commands/prp-implement.md   # 0 이어야 함
grep -c "archive-complete" plugins/mccp/commands/prp-implement.md        # >=1
node plugins/mccp/scripts/receipt/cli.js validate --command mccp:pr \
  --decision gate-guard-integrity-m3 \
  --plan .claude/PRPs/plans/archived/does-not-exist.plan.md   # 부재 경로 → stale

# ── [G2] 가드 2의 실제 메커니즘 재현 — 부재 경로가 아니라 HASH 불일치 ──
#   위 [C2] 명령은 "읽을 수 없음" 경로만 친다(cannot read plan to re-hash).
#   가드 2가 실제로 막아야 하는 것은 "게이트 이후 plan이 바뀐" 경우이므로,
#   봉인된 receipt가 있는 plan을 복사해 한 줄 덧붙이고 그 사본을 넘긴다.
#   기대: stale.reason == "plan file hash differs from receipt (plan changed since gate)"
SCRATCH=$(mktemp -d) && cp .claude/plans/gate-guard-integrity-m2.plan.md "$SCRATCH/m2.plan.md" \
  && printf '\n<!-- mutated for guard-2 reproduction -->\n' >> "$SCRATCH/m2.plan.md" \
  && node plugins/mccp/scripts/receipt/cli.js validate --command mccp:prp-implement \
       --decision gate-guard-integrity-m2 --plan "$SCRATCH/m2.plan.md" 2>&1 \
     | grep -q "plan file hash differs from receipt" \
  && echo "[G2-OK] hash 불일치에서 stale 발화" || echo "[G2-FAIL] 가드 2가 hash 경로에서 발화하지 않음"
#   대조군: 원본 경로는 stale이 아니어야 한다(오탐 아님을 보임)
node plugins/mccp/scripts/receipt/cli.js validate --command mccp:prp-implement \
  --decision gate-guard-integrity-m2 --plan .claude/plans/gate-guard-integrity-m2.plan.md

# ── [C6] 2.5.8 placeholder 제거 + 정적 회귀 ─────────────────────────
# 대상은 **validate callsite 뿐**이다. 파일 전체를 `--plan <`로 훑으면 `cli.js dedupe`
# (`plugins/mccp/commands/pr.md:418-421`, `--plan <plan-path>`)까지 걸리는데, 그것은
# lint 매처(`/cli\.js"?\s+validate\s+--command/`)가 구조적으로 보지 못하는 호출이라
# 범위 밖이다(§Task 4 범위 한정). 아래는 lint와 동일한 매처로 분모를 고정한다.
node -e 'const t=require("fs").readFileSync("plugins/mccp/commands/pr.md","utf8").split(/\r?\n/);
  let n=0,bad=0;
  t.forEach((l,i)=>{ if(!/cli\.js"?\s+validate\s+(--command|\\\s*$)/.test(l)) return; n++;
    for(let j=i;j<t.length;j++){ const m=t[j].match(/--plan\s+(\S+)/);
      if(m){ if(!/^"\$/.test(m[1])){bad++;console.log("BAD "+(j+1)+": "+t[j].trim());} break; }
      if(!/\\\s*$/.test(t[j])) break; } });
  console.log("validate callsites="+n+" (3 이어야) · non-variable --plan="+bad+" (0 이어야)");
  process.exit(n===3&&bad===0?0:1)'
grep -c -- '--plan "\$' plugins/mccp/commands/pr.md          # 3 (2.5.7/2.5.8/2.5.9)
node --test plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js
#   A/B(비공허성): 수정 전 pr.md로 되돌린 뒤 신규 lint 단언이 red인지
git stash push -- plugins/mccp/commands/pr.md \
  && node --test plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js; \
  echo "^ 위가 FAIL이어야 정상(비공허 — 수정 전 pr.md가 placeholder를 갖는다)"; git stash pop

# ── [C3] parsePlanFiles — 신규 케이스 실재 + A/B + 격리 15회 ────────
grep -c "prose line between heading and table" plugins/mccp/scripts/receipt/tests/dedupe.test.js  # >=1
node --test plugins/mccp/scripts/receipt/tests/dedupe.test.js
git stash push -- plugins/mccp/scripts/receipt/dedupe.js \
  && node --test plugins/mccp/scripts/receipt/tests/dedupe.test.js; \
  echo "^ 위가 FAIL이어야 정상(비공허)"; git stash pop
for i in $(seq 1 15); do node --test plugins/mccp/scripts/receipt/tests/dedupe.test.js >/dev/null 2>&1 || echo "FLAKE run $i"; done

# ── [C4] harness per-run 이름 + 판정 불변 ───────────────────────────
node --test plugins/mccp/scripts/lib/tests/suite-determinism.test.js
node plugins/mccp/scripts/lib/suite-determinism.js --runs 2 \
  --pattern "plugins/mccp/scripts/lib/tests/perf-scaling.test.js" --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
    if(!Array.isArray(j.per_run)||!("failing" in j.per_run[0])){console.error("FAIL: per_run.failing 부재");process.exit(1)}
    console.log("per_run.failing 존재 ok · stable="+j.stable+" always="+j.alwaysFailing.length+" sometimes="+j.sometimesFailing.length)})'

# ── [B] 문서 드리프트 ───────────────────────────────────────────────
grep -c '^- \[ \]' .claude/prds/gate-guard-integrity.prd.md    # 2 (OQ5·OQ6)
grep -n '^## \[' CHANGELOG.md                                   # 내림차순 단조
grep -c "MCCP_PERF_INJECT_QUADRATIC\|MCCP_TEST_SESSION_START_PATH" docs/ENVIRONMENT.md  # 2

# ── [V] version + 전수 회귀 ─────────────────────────────────────────
# 아래 전수 실행은 **관측**이지 판정 기준이 아니다(§Acceptance). OQ5의 비결정 2건이
# 각 ≈10%/run이라 1회 전수의 red 하나로는 변경 귀속이 서지 않는다. 판정은 [C3]의
# 격리 15회 대조가 맡고, 전수에 요구하는 것은 "알려진 비결정 2건 밖의 신규 red 0" 뿐이다.
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
node --test --test-reporter=tap "plugins/mccp/scripts/**/*.test.js" | tail -20
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task 5가 건드리는 함수의 테스트가 OQ5의 flake 당사자라 red의 귀속이 흐려진다 | **High** | 변경 전후 각 **격리 15회** 대조(격리에서는 15/15 통과가 이미 실측됨). 전수 결과로 판정하지 않는다 |
| Task 4가 `plugins/mccp/commands/pr.md`를 고치면서 2.5.8의 `DECISION_SLUG` 가용성을 잘못 가정한다 | Medium | `DECISION_SLUG`은 2.5.7에서 도출되고 2.5.8 주석(`:878-879`)이 그 재사용을 명시한다. 2.5.9가 같은 변수로 `:939`에서 도출하는 것이 선례 — 동일 스코프임이 이미 증명돼 있다 |
| Task 4의 lint 확장이 비-게이팅 문맥의 정상 placeholder(`plugins/mccp/commands/plan.md:95`·`:2319`)를 오탐해 무관한 command를 red로 만든다 | Medium | 단언을 `basename === 'pr.md'`인 validate callsite로만 한정한다(Task 4 "좁히는 기계"). lint는 전 `commands/*.md`를 스캔하므로 범위를 넓히면 위 2곳이 즉시 red가 되고, 그 실패는 즉시 보이므로 조용한 오탐은 불가능하다 |
| Task 2의 경로 이전이 다른 테스트의 암묵적 의존을 깨뜨린다 | Low | 두 fixture 디렉토리를 참조하는 곳이 각 테스트 파일 1개뿐임을 grep으로 선확인 후 변경 |
| Task 3이 명령 본문을 바꿔 실제 `/mccp:prp-implement` 흐름을 깨뜨린다 | Medium | 아카이브 **제거**는 동작을 줄이는 방향이라 새 실패 경로를 만들지 않는다. 보고 문구 3곳을 함께 정정해 존재하지 않는 경로 인용을 없앤다 |
| Task 10이 실행되지 않아 아카이브가 지연된다 | **Medium** | **기계적 강제가 없다**(L2 architect HIGH, 수용). 완화는 탐지 3중화(scan 오라클 · backlog 행 · 리포트 미체크 항목)이고, 미실행 결과가 데이터 손실이 아니라 지연이라는 비대칭이 이 순서의 근거다 |
| `archive-complete`가 M3 plan까지 원자 단위로 옮겨 이 cycle의 PR을 막는다 | Medium | Task 10을 PR 머지 후로 분리. M3 `in-progress` 동안 `scan.js`가 `archivable:false`를 내는 것이 기계적 2차 방어 |
| 병렬 worktree 3개가 1.23.12를 선점한다 (§3.7 축의 8번째 재발) | Medium | Task 9 착수 직전 `git fetch` + 3개 worktree 버전 확인 후 forward-only 상향. CHANGELOG 헤딩 중복을 검출 신호로 사용 |
| B2 이동 중 CHANGELOG 본문이 변형된다 | Low | 이동 전후 블록 sha256 대조를 Validate에 고정 |
| M3이 잔여를 닫았다는 판정을 다시 같은 (미확증) 가드에 의존해 내린다 | Medium | 각 항목을 **부정 케이스 직접 재현**으로 검증한다 — PRD Risks 마지막 행의 원칙 승계. C1은 동시 3개 실행, C2·C6은 stale/정적 A/B, C3은 수정 전 코드 A/B, C4는 판정값 불변 |
| cross-model 확증 없이 ship된다 | High | 완화하지 않고 **기록한다**. `MCCP_CODEX_DISABLED=1`은 사용자 전역 설정이다. M3은 모델 다양성을 획득했다고 주장하지 않는다 — 다만 L2 반증 패널 4인이 실발화해 C6·B5를 찾았고, 그 사실이 컨텍스트 격리의 가치를 보인다 |

## Acceptance

- [ ] Task 0의 15행이 각각 명령 1개 + 출력으로 재확인됨 (해소된 행은 사유와 함께 제거)
- [ ] `git status --short` 공백 — A1·A2 잔여 0
- [ ] `evidence-audit --json`의 `state ≠ inconsistent` ∧ `hash_bound === comparable` ∧ `unverifiable` 1 감소
- [ ] 두 fixture 디렉토리가 `os.tmpdir()` 하위이고 `git check-ignore` IGNORED이며, 동시 3개 실행에서 간섭 0
- [ ] `plugins/mccp/commands/prp-implement.md`에 `PRPs/plans/completed` 0건 · `[G2]` 블록이 `[G2-OK]`를 출력(hash 불일치 → stale) **이면서** 원본 대조군이 `ok:true`
- [ ] `plugins/mccp/commands/pr.md`의 `validate` 호출 중 `--plan` 인자가 `<`로 시작하는 것 **0건** · 신규 정적 회귀가 **수정 전 파일에서 red**임이 A/B로 확인됨
- [ ] `parsePlanFiles` 신규 부정 케이스가 이름 grep으로 실재 확인되고 **수정 전 코드에서 red**임이 A/B로 확인됨
- [ ] `per_run[].failing`이 CLI 실출력에 실리고 `stable`/`alwaysFailing`/`sometimesFailing`은 변경 전후 동일
- [ ] PRD 미해결 `- [ ]`가 OQ5·OQ6 2건뿐 · CHANGELOG 헤딩 내림차순 단조 · env 2종 등재 · PRD Evidence 각주(B4) · CLAUDE.md §3.7 정정(B5)
- [ ] backlog에서 삭제된 행 0건 (append-only 유지)
- [ ] `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` green(세 리터럴 일치 자동 검증)
- [ ] **판정은 격리 대조로 한다** — Task 5가 건드리는 `plugins/mccp/scripts/receipt/tests/dedupe.test.js`가 변경 전후 각 **격리 15회에서 15/15**(§Validation `[C3]`). 전수 실행(§Validation `[V]`)은 **관측이며 판정 기준이 아니다**: OQ5의 비결정 2건이 각 ≈10%/run이라 1회 전수의 red 하나로는 "내 변경"과 "flake 발화"를 가를 수 없다. 전수에 요구하는 것은 **알려진 비결정 2건 밖의 신규 red가 0**이라는 한 가지뿐이다
  - R4 정정 기록: 이 항목은 이전에 "전수 실행에서 `fail` 비증가 + `pass` 비감소"를 판정 기준으로 적어, Risks의 "전수 결과로 판정하지 않는다"와 정면 충돌했다. ≈10%/run flake를 인정한 상태에서 전수 카운트를 기준으로 삼으면 Acceptance 자체가 flaky해진다 — L2 invariant 패널(R4) HIGH·MEDIUM 지적
- [ ] Task 10의 **강제 게이트 부재**가 리포트에 기록됨 — 기계 확인: `grep -c "강제하는 게이트는 없다" .claude/PRPs/reports/gate-guard-integrity-m3-report.md` ≥ 1
- [ ] 미주장 2건이 리포트에 기록됨 — 기계 확인: `grep -c "OQ5의 근본 원인을 주장하지 않는다" …m3-report.md` ≥ 1 **및** `grep -c "조건부 staleness는 닫지 않았다" …m3-report.md` ≥ 1
  - 체크박스만으로는 "적었다"를 강제하지 못한다는 L2 invariant(R2) 지적을 받아, 세 항목 모두 **고정 문자열 grep**으로 기계화한다. 리포트가 그 문장을 담지 않으면 Acceptance가 실패한다.

## Review History

### R1 — L2 반증 패널 (2026-08-14) · verdict `divergent`

4/4 응답, 4개 role 전부 `fail`. blocking 10건. 기록: `.claude/reviews/plan-review-gate-guard-integrity.md`

| 지적 | 판정 | 흡수 |
|---|---|---|
| invariant CRITICAL+HIGH×3 — 2.5.8의 리터럴 `--plan <plan path>`, 주석은 복원됐다고 주장 | **수용 — 실측 확인** | 신규 **C6** + Task 4 + 정적 회귀 test |
| architect MEDIUM — version sync 5면의 실재 미확인 | **수용 — 실측 결과 4면도 아닌 3리터럴** | 신규 **B5**, `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`를 Files to Change에서 제거 |
| architect HIGH — Task 10에 기계적 강제 없음 | **수용(완화 아님)** | 강제 부재를 명시하고 탐지 3중화 + 비대칭 근거 기술 |
| security MEDIUM×2 — `unverifiable`만 보고 `hash_bound`/`state` 미확인 | **수용** | Task 1에 커밋 전후 `state`/`hash_bound` 등식 |
| test MEDIUM×4 — Task별 Validate가 통합 `## Validation`에 없어 건너뛰어도 통과 | **수용** | Validation을 블록 태그(`[T0]`…`[V]`)로 재작성, A/B 절차를 `git stash` 명령으로 구체화 |
| architect CRITICAL — PRD Evidence 인용이 현 코드와 불일치 → "가드가 이미 존재할 수 있다" | **부분 수용** | 행 드리프트는 **B4**로 흡수. 다만 추론은 오독 — 본 plan은 가드 2 복원을 주장하지 않고 M1 귀속으로 적었다(C2 행 (b)) |

### R2 — L2 반증 패널 (2026-08-15) · verdict `divergent` (blocking 10 → 5)

architect **pass** · invariant **pass**(MEDIUM 1) · security **fail**(CRITICAL 1) · test **fail**(HIGH 2 + MEDIUM 3).

| 지적 | 판정 | 처리 |
|---|---|---|
| security CRITICAL — ship receipt를 커밋하지 않아 `hash_bound===comparable`이 clone에서 성립 불가 | **반증** | `.gitignore:32`가 `!.claude/receipts/mccp-pr-codex/` **부정 패턴**을 둔다. `git ls-files --error-unmatch` 성공 + `origin/main`에 존재(커밋 `fffa166`). 리뷰어가 negation 줄을 보지 않고 "untracked per gitignore pattern structure"로 추론했다. Task 1에 반증 근거를 명시해 재발을 막는다 |
| test HIGH — `[C2]` 검증이 "읽을 수 없음" 경로만 치고 "게이트 이후 변경" 경로를 안 친다 | **수용** | 신규 `[G2]` 블록. **작성 중 실측 완료** — 변조 사본은 `plan file hash differs from receipt`, 원본 대조군은 `ok:true` |
| test HIGH — `[C6]` 검증이 syntax grep뿐이고 가드 동작을 안 본다 | **수용** | 위 `[G2]`가 동작 축을 담당하고, `[C6]`는 정적 축 + `git stash` A/B(수정 전 red)를 담당하도록 역할을 분리 |
| test MEDIUM — 회귀를 `plan-command-marker-states.test.js`에 넣는 것은 그 파일이 `plugins/mccp/commands/plan.md`만 스캔하므로 부적합 | **수용 — 더 나은 집 발견** | `plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js`로 이전. 그 파일 `:16` 주석이 *"only flag presence is asserted"* 로 **자기 공백을 명시**하고 있고 C6이 정확히 그 공백을 통과했다 — PRD가 지목한 G2("lint가 플래그 존재만 봐서 가드가 죽은 채로도 통과")와 같은 종 |
| test MEDIUM — Validation이 Task 산출물을 grep하므로 자기완결적이지 않다 | **부분 수용** | Validation 블록에 "사후 단언" 헤더를 달아 역할을 명시. 착수 전 상태는 `[T0]` 게이트와 `git stash` A/B 쌍이 담당함을 적시 |
| invariant MEDIUM — "리포트에 명시" Acceptance가 기계적이지 않다 | **수용** | 해당 3개 항목을 리포트 본문의 **고정 문자열 grep**으로 전환 |

### R3 — L2 반증 패널 (2026-08-15) · verdict `converged` (blocking 5 → 0)

4/4 `pass`, findings 0. 기록: `.claude/reviews/plan-review-gate-guard-integrity.md`. **그러나 이 라운드는 receipt를 남기지 못했다** — 5.2h 리뷰 기록(12:45) 직후 receipt write 전에 실행이 죽었다. 승인은 있었으나 chain에 anchoring되지 않았으므로 무효다.

### R4 — L2 반증 패널 (2026-08-16) · verdict `divergent` (blocking 0 → 9)

architect **fail**(HIGH 1 + MEDIUM 2) · security **pass** · test **fail**(HIGH 2 + MEDIUM 2) · invariant **fail**(HIGH 3 + MEDIUM 1). 220s / 382k subagent 토큰. 기록: `.claude/reviews/plan-review-gate-guard-integrity-m3.md`.

**R3(0건) ↔ R4(9건)의 격차 자체가 관측값이다.** 동일 본문·동일 패널 구성에서 blocking이 0과 9로 갈렸다. 이는 `diverse-agent-review` PRD의 리뷰 다양성 축 소관이며, 본 plan은 이 사실을 기록만 하고 원인을 주장하지 않는다.

| 지적 | 판정 | 흡수 |
|---|---|---|
| architect HIGH + test HIGH×2 — `[C6]` Validation의 `grep -- "--plan <"` 파일 전체 0건 요구가 **구현이 옳을 때 실패**한다 | **수용 — 실측 확인** | `plugins/mccp/commands/pr.md`의 `--plan <`는 `:419`(dedupe)와 `:883`(validate) 둘이고, Task 4 범위상 `:419`는 남는다. `[C6]`을 lint와 동일 매처의 validate-scoped 검사로 교체 |
| architect HIGH+MEDIUM×2 — 3 callsite로 좁히는 **기계가 미명시** | **수용** | Task 4에 "좁히는 기계" 추가 — `findValidateCallsites`가 1차 경계(validate만), `basename === 'pr.md'`가 2차. 실측 근거 동봉(`plugins/mccp/commands/pr.md` validate callsite = 정확히 3, `plugins/mccp/commands/plan.md:95`·`:2319`가 파일 경계를 필수로 만듦) |
| test MEDIUM — `plugins/mccp/commands/pr.md:419`가 범위 안인지 밖인지 plan이 말하지 않는다 | **수용** | 범위 한정을 "lint 도메인 밖"·"도메인 안이지만 비게이팅" 2종으로 명시 분류 |
| invariant HIGH + MEDIUM — Acceptance `전수 실행 fail 비증가`가 Risks `전수 결과로 판정하지 않는다`와 충돌 | **수용 — 실재 모순** | 판정을 격리 15회로 일원화하고 전수는 관측으로 강등. 전수 요구는 "알려진 비결정 2건 밖 신규 red 0" 하나로 축소 |
| invariant HIGH — Task 10 강제 게이트 부재 = fail-open | **기각(재제기)** | plan `:173-175`가 이미 명시하고 R1 architect가 "수용(완화 아님)"으로 처리한 항목이다. 새 결함이 아니라 기록된 트레이드오프의 재제기다 |
| invariant HIGH — Acceptance가 아직 없는 리포트를 grep한다 | **기각(자기모순)** | Acceptance는 정의상 사후 검사이고(`:179` "사후 단언" 헤더), 이 grep 기계화는 **R2 invariant가 "체크박스로는 강제 못 한다"고 요구해서 추가한 것**이다. 같은 패널이 자기가 요구한 수정을 공격하고 있다 |

부수 정정(R4가 직접 지적하지 않았으나 위 대조 중 실측된 것): 이전 `범위 한정`의 예시 `plugins/mccp/commands/plan.md:419`는 lease 관련 **주석 블록**이고 `plugins/mccp/commands/pr.md:806`은 validate가 아니라 `finalize-receipt` 플래그 목록이다. 두 오인용이 `[C6]`의 잘못된 grep을 낳은 근원이므로 실측 경로로 교체했다.

### R5 — L2 반증 패널 (2026-08-16) · verdict `divergent` (blocking 9 → 11)

architect **pass**(0) · security **pass**(0) · test **fail**(CRITICAL 1 + HIGH 4 + MEDIUM 1) · invariant **fail**(CRITICAL 2 + HIGH 2 + MEDIUM 2). 265s / 382k 토큰. 기록: `.claude/reviews/plan-review-gate-guard-integrity-m3.md`.

R4가 지적한 architect 축은 해소됐다 — architect가 `refutationAttempted`에서 파일 단위 스코프가 `plugins/mccp/commands/plan.md:95`·`:2319`의 정당한 placeholder 오탐을 막는다고 직접 확인했다.

| 지적 | 판정 | 처리 |
|---|---|---|
| test CRITICAL+HIGH — `[C3]`이 grep하는 test 이름이 아직 없고 plan이 이름을 못박지 않는다 | **수용 — 실재 커널** | Task 5에 두 test 이름을 계약으로 고정. 이름이 자유이면 그 검증은 구현자 작명에 걸려 비결정이 된다 |
| test HIGH×3 — `[C6]`의 node 한 줄과 lint test 단언이 **평행한 두 접근**으로 보인다 | **부분 수용 — 실재 커널** | Task 4에 "한 규칙, 두 자리"와 A/B 순서를 명시. lint test가 정본이고 Validation 한 줄은 거울이며, A/B 비공허성은 test 갱신 이후에만 성립함을 적시 |
| test CRITICAL/HIGH의 나머지 — "구현 산출물이 아직 없다" | **기각(범주 오류)** | Validation은 정의상 사후 단언이다(`## Validation` 헤더). 착수 전 상태는 `[T0]` 게이트와 `git stash` A/B 쌍이 담당한다 |
| invariant HIGH×2 — Task 10 강제 게이트 부재 · Acceptance가 미존재 리포트를 grep | **기각(R4 재제기)** | R4에서 같은 근거로 이미 기각했고 그 판정이 이 표 위에 기록돼 있다 |
| invariant CRITICAL — "C6이 M1의 G2 수정이 불완전했음을 드러낸다" | **기각(plan의 논지 자체)** | 그것이 C6의 정의다(`:61`). plan의 주장을 결함으로 재진술한 것이다 |
| invariant CRITICAL — "M1·M2가 outcome metric 미달인데 complete를 주장한다" | **기각(사용자 제약)** | UI1이 "PRD의 두 milestone은 모두 complete로 간주한다"는 user-stated direction이다. 리뷰어가 제약 자체를 공격하고 있다 |

**수렴 가능성에 관한 기계적 사실 (이 plan의 판단이 아니라 코드가 정한 것)**: [quorum.js](../../plugins/mccp/scripts/lib/plan-review/quorum.js) `:200`은 `passed: reasons.length === 0`이고 blocking finding이 1건이라도 있으면 reason이 추가된다. quorum은 **득표제가 아니라 blocking-zero제**이며 `required`/`rolesMin`은 승인 표수가 아니라 참여 하한이다. 따라서 4인 중 2인이 pass여도 나머지 1인의 HIGH 1건이 전체를 차단하고, Task 10의 강제 부재처럼 **구조적으로 제거 불가능한 항목**(제거하려면 아카이브를 PR 전에 실행해야 하는데 그것이 §Task 10이 설명하는 자기차단이다)을 매 라운드 HIGH로 올리는 리뷰어가 있는 한 수렴은 성립하지 않는다. 이 사실은 `diverse-agent-review` PRD 소관으로 이관하며 본 plan은 기록만 한다.

## Design Critique

`impeccable-detect --mode plan` → `skill_available=true` · `design_signal=true` · `reason=ok`. 검출된 표면은 version 리터럴 2면(`renderer/html.js:1419` page-foot · `renderer/markdown.js:163` derived 줄)이다.

- 라운드: **1** (R0) · 검토 cap: 2 (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` 기본값)
- verdict: **CONVERGED** (`decideCritique({findings: [], round: 0, cap: 2})`)
- Assessment A — 네 Output Constraint 대조: 정보 위계(신규 heading 0, 문서 최대 depth 3) · 강조색(색 토큰 변경 0) · raw markdown marker(버전 리터럴은 평문) · 한 화면 항목 수 상한(PRD Open Questions가 6 → 2로 **감소**, 상한 방향과 일치). 위반 0.
- Assessment B — `detect.mjs --json .claude/cache/status.html` **exit 2**(reference: `0`=clean, `2`=findings), finding 2건. 둘 다 **선재이며 네 앵커 밖**이다: `em-dash-overuse`(warning, 41건)는 영어 마케팅 body copy 기준 규칙인데 이 표면은 `—`를 절 구분자로 쓰는 한국어 기술 산문이고(CLAUDE.md·PRD·기존 plan 전반의 확립된 관례), `numbered-section-markers`(advisory, `06, 08, 09, 10, 11, 12`)는 섹션 라벨이 아니다 — `grep -c 'class="[^"]*(eyebrow|kicker|section-num)'` → **0**으로 반복 스캐폴드 부재를 실측했고, 그 숫자열은 파생 콘텐츠의 날짜 월 성분(`2026-06`×27 · `2026-07`×46 · `2026-08`×18)과 버전·마일스톤 번호다. 이 target에 대해 **false positive**로 판정한다.
- 두 assessment의 대조: A가 놓친 앵커 위반을 B가 잡은 건 **0건**. 이 plan의 delta(footer 문자열 2개)는 `·` 구분자만 쓰므로 em-dash를 **0개** 추가한다.
- 오라클 주의 — raw detector JSON을 그대로 `decideCritique`에 넣으면 `ESCALATE_NEXT_ROUND`가 나온다. `warning`/`advisory`가 `SEVERITY_ALIASES`에 없어 `UNKNOWN`으로 정규화되고 [design-critique-decide.js](../../plugins/mccp/scripts/lib/design-critique-decide.js) `:44`가 UNKNOWN을 fail-closed로 세기 때문이다. 그 기본값은 옳고, 표면 속성과 plan 결함을 가르는 것은 synthesis 단계다(loop 계약: 모든 finding은 편집할 plan 섹션을 지목해야 한다). 오라클이 소비하는 것은 synthesized 집합이다.
- 재검증 2026-08-16 — 게이트 재진입 시 위 두 assessment를 동일 입력으로 재실행해 같은 결과를 얻었다. snapshot: `.impeccable/critique/2026-08-15T17-28-55Z__claude-cache-status-html.md`
- 부수 관측(본 plan의 표적 아님): `derive/cli.js render`가 `design-lint 2 violation(s): H10,H16 (advisory)`와 drawer detail-id 충돌 1건("안정 키 약함")을 낸다. 둘 다 선재이며 손대지 않는다. 기록만 남긴다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 아직 없으므로 어떤 impeccable 명령도 **호출하지 않고** 체크리스트로만 남긴다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy)

- 호출: 없음. `codex-invoke.js`가 spawn 직전 short-circuit하여 `classification=disabled`, `durationMs=0`. receipt에 `meta.codex_disabled=true` + `meta.codex_skip_reason='codex_disabled'`가 자동 stamp되고 `resolution.codex_verdict='skipped'`가 봉인된다.
- 라운드 수: 0
- 합치 결론: **없음 — cross-model 검증을 획득하지 못했다.** 이 milestone은 M1·M2와 동일한 공백을 승계하며, plan 섹션 D가 그 사실을 이미 적어 두었다. `MCCP_CODEX_DISABLED=1`은 사용자 전역 설정이다.
- YAGNI Triage: 해당 없음(finding 0건 — Codex가 발화하지 않았다).
- Deferred to backlog: 0
- Open Questions: 없음
- Codex session 참조: 없음

### 이 게이트가 실제로 받은 리뷰

Codex는 발화하지 않았으나 이 plan은 **L2 반증 패널 3라운드**(R3·R4·R5, 각 4인 read-only)를 실제로 받았고 그 결과가 실재 결함 5건을 냈다 — C6 Validation의 자기모순, 좁히기 기계 미명시, `pr.md:419` 범위 미정의, Acceptance ↔ Risks 전수판정 충돌, `[C3]` test 이름 미고정. 전부 흡수됐고 경과는 `## Review History`와 `.claude/reviews/plan-review-gate-guard-integrity-m3.md`에 있다.

**그러나 그것은 cross-model이 아니다** — 패널 4인은 컨텍스트가 격리됐을 뿐 같은 모델이다. `MCCP_PLAN_REVIEW=codex`로 전환한 이유는 패널이 R4·R5 연속 divergent였고 남은 차단 요인이 편집으로 제거 불가능한 항목(구조적으로 기계화할 수 없는 Task 10의 post-merge 인간 행위, 그리고 UI1이라는 user-stated 제약)이었기 때문이다. [quorum.js](../../plugins/mccp/scripts/lib/plan-review/quorum.js) `:200`의 blocking-zero 규칙 아래에서 그 HIGH 1건이 매 라운드 전체를 차단하며, `blockSeverity`는 env 배선이 없어 조절할 수 없다.

이 receipt는 `review_*` 축을 담지 않는다(codex 경로는 그 필드를 stamp하지 않는다). 따라서 **승인의 실체는 receipt가 아니라 위 문서들**이며, cross-gate dedupe는 `codex_verdict='skipped'`에 대해 fail-closed로 남아 `/mccp:pr`에서 PR-Codex가 실제로 발화한다.
