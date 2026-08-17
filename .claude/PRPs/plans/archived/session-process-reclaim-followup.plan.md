# Plan: session-process-reclaim 출하 + 잔여 정리 (M3)

**Source PRD**: `.claude/prds/session-process-reclaim.prd.md`
**Selected Milestone**: 3 — 출하 + 잔여 정리
**Complexity**: Medium

## Summary

PRD의 M1·M2는 **구현이 끝났고 출하되지 않았다.** `origin/main`에 `session-processes.js`가 없고(`git ls-tree origin/main -- …` 빈 출력), 이 브랜치에 대한 PR은 0건이다(`gh pr list --head session-process-reclaim --state all` 빈 출력). 즉 milestone 표의 `complete`는 *구현* 완료를 뜻하며, PRD의 Hypothesis("고아 프로세스 누적을 막는 데 유효하다")는 main에 없는 코드로는 검증될 수 없다. **잔여물의 압도적 다수는 backlog 항목이 아니라 출하 그 자체다.**

이 plan은 세 갈래다. **Phase A(Task 1~4)는 출하 차단 해제** — base 동기화·버전 충돌·stale 상태 서술을 닫는다. **Phase B(Task 5~7)는 값싼 backlog 소화** — 코드 구조를 건드리지 않고 닫히는 3건만 가져온다. **Phase C(Task 8~12)는 기록·출하·지표 관측** — PRD 행·backlog 등재·`CLAUDE.md` 정정, 실제 PR, 그리고 PRD 1차 지표(회수율)의 첫 실측. 판정 구조나 schema를 바꿔야 하는 항목은 **명시적으로 이연**하며 사유를 각각 적고(§Out of Scope), 등재는 Task 9가, 개방 상태 단언은 Validation 7이 맡는다.

출하를 막는 것이 하나 더 있다: `plugin.json`이 `1.26.0`인데 **main이 이미 `1.26.0`을 발행했다**(PR #139 santa-loop-materialize M2). `CHANGELOG.md`에 같은 `## [1.26.0]` 헤딩이 서로 다른 내용으로 둘 존재하게 된다. CLAUDE.md §3.7이 "실측 3회 재발"로 기록한 병렬 브랜치 버전 충돌의 **4번째**이고, 해소는 forward-only 상향이다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | PRD의 M1·M2 작업은 끝난 것으로 본다 — 재구현이 아니라 그 뒤에 남은 것을 다룬다 | direction |
| UI2 | 남아있는 잔여물이 무엇인지 먼저 확인한다 | direction |
| UI3 | 그 작업에서 나온 backlog 항목과 문제점을 plan에 담는다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 버전 상향 | `CLAUDE.md` §3.7 "병렬 브랜치 version 충돌 — forward-only 상향" | 발행된 번호는 불가침. 미머지 브랜치 항목만 한 칸 위로. 날짜 역전은 정상이므로 조작 금지 |
| 머지 안전 | `CLAUDE.md` §3.5.1 (PR #110 실측 사고) | 커밋 직전 `git diff --diff-filter=D --name-only <base>...HEAD`로 의도치 않은 삭제 검출. 디렉토리 통째 `--ours` 금지 |
| 버전 표면 test | `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:94` | 기대 버전을 리터럴로 박지 않고 `plugin.json`에서 파생 — 상향 시 이 파일은 **손대지 않는다** |
| 포트 확보 | `plugins/mccp/scripts/lib/tests/dashboard-server.test.js:588` `freePort()` | 포트 0 bind 후 커널 배정값 회수. pid 산술 추측(`7400 + pid % 100`) 금지 |
| STATE.md 갱신 | `CLAUDE.md` §3.2 | 직접 편집 금지 — `state-writer.js` API 경유(frontmatter schema·lock·CRLF·schema version guard가 묶여 있음) |
| backlog 등재 | `.claude/plans/codex-findings-backlog.md`의 `RESOLVED-BY-IMPL` 행 | 닫힌 항목을 삭제하지 않고 해소 사유와 함께 새 행으로 표기. 이연처는 **실재하고 열린** 항목이어야 한다(santa-loop R7 교훈) |

## 실측한 잔여물 (이 plan의 입력)

아래는 전부 이번 세션에서 명령으로 확인한 것이다. 추정은 없다.

### A. 출하 (blocking)

| # | 잔여 | 증거 |
|---|---|---|
| A1 | **main에 코드가 없다** | `git ls-tree origin/main -- plugins/mccp/scripts/lib/session-processes.js` → 빈 출력 |
| A2 | **PR이 없다** | `gh pr list --head session-process-reclaim --state all` → 빈 출력 |
| A3 | **버전 충돌** | branch `plugin.json`=`1.26.0`, main `plugin.json`=`1.26.0`(PR #139). CHANGELOG `## [1.26.0] — 2026-08-14`가 양쪽에 서로 다른 내용으로 존재 |
| A4 | **base drift + 머지 사고 위험** | merge-base `1c5220a`(2026-08-13). 이후 main이 **파일 102개 추가**. §3.5.1 PR #110 선례와 같은 형태 |
| A5 | **STATE.md 내부 불일치** | Goal은 "cross-model 심사(santa-loop) 대기"인데 git log에 santa-loop R2~R10 커밋과 `docs: triage santa-loop round 10 (loop closed by operator decision)`이 있다. `escalate_pending: true` + next `/mccp:santa-loop`은 이미 완주한 것에 대한 stale 신호. Goal의 버전 서술 `v1.24.0`도 실제 `1.26.0`과 어긋난다 |
| A6 | **소실된 receipt를 영구 증거처럼 참조** | `.claude/receipts/`에 `mccp-plan-codex/`·`mccp-implement-codex/` 디렉토리 자체가 없다(`ls` 결과 `mccp-pr-codex`만). §3.12 계약상 그 둘은 working-tree only라 소실이 **정상**인데, STATE.md는 그것을 "findings 5건 원본 severity 봉인"된 증거로 가리키고 "receipt를 다시 쓰지 말 것"이라 지시한다 — 가리키는 대상이 없다 |

### B. 열린 backlog (이 작업이 낳은 것)

| # | Severity | 대상 | 요지 | 이 plan |
|---|---|---|---|---|
| B1 | MEDIUM | `session-processes.js#isNodeInterpreterImage` | 이미지 검사가 "진짜 node인가"가 아니라 "basename이 node인가". `/tmp/node`도 통과(실측) | **이연** — 13번째 필드 = schema 변경 + migration |
| B2 | MEDIUM | `session-processes.js#isExecutedScript` | 분리형 인터프리터 플래그(`node -r x.js <path>`)가 false negative. fail-closed, 오늘 영향 0 | **이연** — 값-소비 플래그 화이트리스트 필요 |
| B3 | PARTIALLY-RESOLVED | `session-processes.js#scanForeignOrphans` | `session_pid=null`/cross-host reuse 레코드가 purge되지 않고 무한 증가 | **이연** — 정리가 곧 kill 허용이라 §D14 판정 구조를 바꾼다 |
| B4 | LOW | `session-processes.js:172-186` | `DIR_MODE=0o700`/`FILE_MODE=0o600` owner-only 주장이 win32에서 test로 미뒷받침(유일 test `(3)`이 win32 skip) | **Task 7** — 주장을 코드 실제 범위로 좁힘 |
| B5 | LOW | `dashboard-server.test.js:156,173` | 포트를 pid에서 추측(`7400 + pid % 100`). 같은 파일 `7600` 계열이 TCP 7680 충돌로 full-suite 실패 1건 유발(실측) | **Task 6** — `freePort()` 2줄 교체 |
| B6 | MEDIUM | `.claude/plans/session-process-reclaim.plan.md` | Task 2 케이스 7이 Validate 단언 목록에 라벨로 미열거. 구현엔 `identity 7`로 존재하므로 잔여는 문서 표기뿐 | **Task 5** — 라벨화 |

### C. 제품 결정 대기 (PR-Codex R3)

`dashboard-server.js:643-645`(및 같은 형태의 `:693-695`)는 `registerServerReuse` 실패 시 `announceReuseRegistration`이 stderr 경고만 하고 **`reused: true`를 그대로 반환**한다. 메커니즘은 사실이다. 다만 파괴 경로는 세 겹에 걸려 있다:

- dashboard는 `lifetime:'outlives-session'`이라 회수 대상이 되려면 `MCCP_RECLAIM_OUTLIVES=1` **운영자 opt-in**이 필요하고 기본값은 `0`이다(`docs/ENVIRONMENT.md:447`).
- `announceReuseRegistration:199-208`이 조건·결과·복구법("Restart the dashboard from this session to own it outright")을 담아 loud 경고한다.
- santa-loop R1이 같은 축을 이미 판정했고, 보고서가 수용하지 않은 근거 3개를 남겼다 — 그중 결정적인 것은 **명백한 수정이 없다**는 것이다: `resolveSessionId`가 null이면 소유자 등록도 불가하므로, "재사용 대신 자기 서버를 띄운다"는 아무도 회수할 수 없는 미등록 프로세스를 만든다(중단 대신 누수).

Codex R3은 그 판정의 반전을 요구한다. 이는 **사용자 표면 동작 변경**(dashboard 미개방)이므로 이 plan은 임의로 반전하지 않는다. §Out of Scope의 권고 참조.

### D. 주장하지 않는 것 (봉인된 잔여 — 유지)

`.claude/PRPs/reports/session-process-reclaim-report.md`의 "주장하지 않는 것" 절이 정본이며 이 plan은 그것을 **좁히지도 넓히지도 않는다**: §D11 ms TOCTOU와 §D15 유계 오살 창은 단위 test로 재현 불가 · macOS `ps`는 `etimes` 미지원이라 probe null → `identity_unverifiable`(fail-closed) · 실행 이미지를 주지 않는 플랫폼에서는 회수 커버리지가 0이 된다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | A3 — `1.26.0` → `1.27.0` forward-only 상향 |
| `CHANGELOG.md` | UPDATE | A3 — 우리 항목 헤딩 상향 + main의 `1.26.0`(santa-loop-materialize) 승계. 두 항목을 합치지 않는다 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | A3 — `:1419` page-foot 버전 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | A3 — `:163` derived 줄 버전 동기 |
| `.claude/state/STATE.md` | UPDATE | A5·A6 — **Task 3**: santa-loop 완주 반영 + 버전 서술 정정 · **Task 4**: 소실된 receipt 참조 정정 · **Task 9**: `escalate_pending` 해제. 셋 다 `state-writer.js` API 경유. **한 파일을 세 Task가 나눠 고치므로 여기 적어 둔다** — 이 행에 "해제"만 적고 Task를 안 밝히면 Task 3이 그것까지 하는 것으로 읽히는데, Task 3은 명시적으로 건드리지 않고(:139) Task 9가 R3 backlog 행이 생긴 뒤에만 해제한다 |
| `.claude/PRPs/reports/session-process-reclaim-report.md` | UPDATE | A5·A6 — Next Steps의 stale 항목(santa-loop·`1.23.11`/`1.24.0` 서술) 정정 |
| `.claude/state/fix-task-applied.md` | UPDATE | A6 — **git-tracked인데** `mccp-implement-codex/session-process-reclaim.json`을 3곳(`:12`·`:28`·`:31`)에서 실재 증거로 가리킨다. 그 receipt는 소실됐다 |
| `.claude/prds/session-process-reclaim.prd.md` | UPDATE | **Task 8** — M3 행 추가 + 이 plan 연결 (PRD-mode 계약). 이미 Phase 4 WRITE에서 적용됐고 Task 8은 그것을 기계 검증한다 |
| `.claude/plans/session-process-reclaim.plan.md` | UPDATE | Task 5 — B6 Task 2 케이스 7 라벨화 |
| `plugins/mccp/scripts/lib/tests/dashboard-server.test.js` | UPDATE | Task 6 — B5 `:156`·`:173` 포트 추측 2줄을 `freePort()`로 |
| `plugins/mccp/scripts/lib/session-processes.js` | UPDATE | Task 7 — B4 `:172-186` owner-only 주장을 코드 실제 범위로 정정 (주석만, 동작 무변경) |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | **Task 9** — 해소 3건(B4·B5·B6) 표기 + **신규 이연 정확히 10건** 등재. 어느 10건인지는 Task 9가 열거하고 Validation 7이 실재·개방을 단언한다 |
| `CLAUDE.md` | UPDATE | **Task 10** — §3.7 `:325` "동기 대상 5면"이 stale. `renderer/tests/i18n-surface.test.js`(`:94`)가 manifest 파생으로 바뀌어 더 이상 손으로 동기할 면이 아니다 |
| `plugins/mccp/scripts/lib/tests/manual/session-process-reclaim-smoke.js` | CREATE | **Task 12** — 회수율 1차 실측 스크립트. 디렉토리 `…/tests/manual/`도 함께 새로 만든다(현재 부재). `manual/` 하위인 것이 곧 "CI 상시 suite 미편입" 보장이다(글롭 `tests/*.test.js`가 하위 디렉토리를 넘지 않음) |
| `.claude/reviews/plan-review-session-process-reclaim-followup.md` | UPDATE | 이 plan의 L2 패널 기록. `record` CLI가 슬러그 충돌로 원본을 덮어쓰므로(§Out of Scope 참조) 별도 파일명으로 보존한다 |

## Tasks

### Task 1: base 동기화 + 머지 사고 검증

- **Action**: **머지 전에 기대 인벤토리를 먼저 고정한다.** 경로는 리터럴 `.git/…`이 아니라 반드시 아래처럼 해석한다 — 이 작업은 linked worktree에서 도는데 §3.8대로 그곳의 `.git`는 **디렉토리가 아니라 파일**이라 `.git/mccp/tmp/…`로 쓰면 열리지 않는다(`/mccp:plan` 명령 본문도 같은 이유로 `git rev-parse --git-path`를 쓴다):

```bash
MCCP_TMP="$(git rev-parse --git-path mccp/tmp)"   # worktree-safe (§3.8 — .git가 파일이다)
mkdir -p "$MCCP_TMP"
git ls-tree -r --name-only origin/main > "$MCCP_TMP/base-inventory.txt"
# **어느 origin/main에서 떴는지를 함께 봉인한다.** `$MCCP_TMP`는 `.git/mccp/tmp`라 실행 사이에
# 살아남으므로, 이전 시도가 남긴 base-inventory.txt가 그대로 있으면 Action 1단계를 건너뛰어도
# Validation 4의 `test -s` 가드가 **만족된다** — 그러면 대조는 *옛 main* 인벤토리를 정본으로
#삼아 돌고, 그 사이 main이 추가한 파일의 소실을 놓친다. 가드가 막으려던 vacuous 대조가
# 파일 부재가 아니라 **파일 잔존**으로 재현되는 형태다(L2 R14 invariant HIGH).
git rev-parse origin/main > "$MCCP_TMP/base-inventory.sha"
```

그다음 머지하되, **머지가 끝났는지를 판정하고 나서 Validate로 넘어간다.** 충돌이 남으면 `git merge`는 비영점으로 끝나고 트리는 MERGING 상태로 멈추는데, 그대로 아래 대조를 돌리면 *해소 전의 트리*를 정본으로 읽어 "main 파일이 떨어졌다"를 놓치거나 반대로 오탐한다(L2 R9 invariant HIGH):

```bash
git merge origin/main || echo "충돌 발생 — 아래 규칙대로 파일 단위 해소 후 커밋한다"
# 해소·커밋을 마친 뒤, Validate로 넘어가기 **전에** MERGING이 끝났는지 확인한다.
if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  echo "STOP: 아직 MERGING 상태다 — 충돌을 해소하고 커밋한 뒤에 Validate를 돌린다."
  exit 1
fi
```

   충돌은 **파일 단위로** 해소한다. `CHANGELOG.md`는 `## [1.26.0]` 헤딩이 양쪽에 있어 반드시 충돌하며, main의 1.26.0 항목을 **보존**하고 우리 항목은 Task 2에서 상향한다. `.claude/prds/`·`.claude/plans/`·`docs/`의 main 신규 파일(102개)은 **보존이 기본**이다.
- **Mirror**: `CLAUDE.md` §3.5.1 — 디렉토리 통째 `git checkout --ours <dir>` / 무분별한 `git rm -r` 금지.
- **Validate**: 사전 캡처 ∧ 사후 대조 — 사후 검사만으로는 "무엇이 있었어야 하는가"를 모른다.
  - **선행 가드**: `test -s $MCCP_TMP/base-inventory.txt` → 참. 없으면 Action 1단계를 건너뛴 것이므로 **머지를 되돌리고 다시 시작한다**. 사후 대조는 사전 캡처 없이는 성립하지 않는데, 파일이 없으면 `comm`이 빈 입력으로 0줄을 내어 조용히 통과한다 — Validation 7이 vacuous했던 것과 같은 형태다.
  - `comm -23 <(sort $MCCP_TMP/base-inventory.txt) <(git ls-tree -r --name-only HEAD | sort)` → **0줄**. 머지 전에 뜬 main 인벤토리가 정본이므로, 머지가 무엇을 떨어뜨렸는지 사후 추론이 아니라 대조로 판정된다.
  - `git diff --diff-filter=D --name-only origin/main...HEAD` → 이번 브랜치가 삭제하는 파일 목록에 **내가 의도적으로 지운 것이 아닌 파일이 0건**.
  - 두 단언은 **머지 완료 후에 돌린다**. 사전 예방 hook은 없다(§3.5.1도 검출 절차이지 예방 장치가 아니다) — 다만 위 첫 단언이 실패하면 **머지를 커밋하지 말고 되돌린다**: `git merge --abort`(미커밋) 또는 `git reset --hard ORIG_HEAD`(커밋됨). 손상을 남긴 채 진행하지 않는 것이 이 Task의 통과 조건이다.

### Task 2: 버전 forward-only 상향 (1.26.0 → 1.27.0)

- **Action**: 상향 폭은 **minor**다 — §3.7의 기준이 "PRD 전체 완료(모든 milestone 적용) → minor"이고 M1·M2가 이 PRD의 전부이기 때문이다.
  1. **목표 번호를 그때 결정한다**(고정 상수로 두지 않는다). 전체 명령은 다음과 같다 — 이전 판은 `node -e "…"`로 생략해 구현자가 `MAIN_V`에서 `TARGET`을 계산할 수 없었다:
     ```bash
     MAIN_V=$(git show origin/main:plugins/mccp/.claude-plugin/plugin.json \
       | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).version))")
     TARGET=$(node -e "const [a,b]=process.argv[1].split('.').map(Number);console.log(a+'.'+(b+1)+'.0')" "$MAIN_V")
     echo "MAIN_V=$MAIN_V TARGET=$TARGET"   # 실측 시점: MAIN_V=1.26.0 TARGET=1.27.0
     ```
     minor 자리를 한 칸 올리고 patch를 `0`으로 되돌리는 것이 §3.7의 "한 칸 위" 계산이다. 이 plan 작성 시점 실측은 `MAIN_V=1.26.0` → target `1.27.0`이지만, **머지·PR 사이에 main이 또 발행하면 target이 바뀐다**(§3.7 "실측 3회 재발"). 그래서 번호는 Task 11 직전에 한 번 더 재확인한다.
  2. 손으로 동기하는 면은 **4면**: `plugin.json` · `html.js:1419` · `markdown.js:163` · `CHANGELOG.md`(헤딩 + 본문의 `A → B` bump 서술).
  3. **`i18n-surface.test.js`는 손대지 않는다** — `:94`의 `MANIFEST_VERSION`이 `plugin.json`에서 require하므로 자동 추종한다(실측 확인).
- **§3.7과의 불일치는 회피하지 않고 정정한다.** `CLAUDE.md:325`는 여전히 "동기 대상 5면"이라 적고 그 5번째로 `i18n-surface.test.js 단언 2개`를 든다. 그 서술은 test가 리터럴을 박던 시절의 것이고 지금은 틀렸다. plan이 인용한 패턴과 어긋난 채로 두지 않기 위해 **Task 10에서 CLAUDE.md를 고친다** — 4면이 맞다고 주장하려면 그 주장을 문서에 반영하는 것까지가 한 단위다.
- **Mirror**: §3.7 forward-only 상향. 날짜 역전은 정상이므로 `— 2026-08-14`를 조작하지 않는다.
- **Validate**: 아래 `$TARGET`/`$MAIN_V`는 1단계에서 결정된 번호다.
  - `grep -c "^## \[$TARGET\]" CHANGELOG.md` → `1`, 그리고 `grep -c "^## \[$MAIN_V\]" CHANGELOG.md` → `1`(main 것 하나만).
  - `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"` → `$TARGET`.
  - **footer 2면을 직접 단언한다**: `grep -c "v$TARGET" plugins/mccp/scripts/lib/renderer/html.js` → `1` 이고 `grep -c "v$TARGET" plugins/mccp/scripts/lib/renderer/markdown.js` → `1`. `i18n-surface.test.js`가 이미 manifest 대조로 이 둘을 잡지만(그래서 빠뜨리면 test가 붉어진다), 그 사실이 plan을 읽는 사람에게 보이지 않으면 "test만 돌리면 된다"가 근거 없는 신뢰가 된다. 직접 단언을 병기해 둘 다 명시한다.
  - `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` → 0 fail (footer 2면이 manifest와 일치함을 이 test가 단언한다).
  - `grep -rn "$MAIN_V" plugins/mccp/scripts/lib/renderer/` → 우리 footer 줄 0건.

### Task 3: STATE.md 정정 (A5)

- **Action**: `state-writer.js` API로 갱신한다(직접 편집 금지 — §3.2). 고칠 것은 **둘뿐**이다: (a) Goal의 "cross-model 심사(santa-loop) 대기" → santa-loop R1~R10 완주 + R10이 **수렴이 아니라 운영자 종료 결정**으로 끝났다는 사실, (b) Goal의 `v1.24.0` → Task 2가 정한 `$TARGET`.
- **`escalate_pending`은 이 Task에서 건드리지 않는다.** 이전 판은 "santa-loop이 이미 수행됐으니 해제"라고 했는데, 그 근거가 신호의 절반만 본 것이다. STATE.md 자신이 같은 문서에서 **R3이 미결**이라고 적고 있다("R3 처리 방침(수정 vs backlog 이연 후 override ship) 미결"). escalation은 "santa-loop을 돌렸는가"가 아니라 **"열린 escalation이 수렴하여 닫혔는가"**를 가리키는 신호이고, R3이 결정되지 않은 상태에서 그것을 지우면 *열렸으나 수렴 없이 끝난* 사실 자체가 사라진다 — 이 plan이 A5·A6에서 고치겠다고 한 바로 그 종류의 손실을 새로 만드는 것이다.
- 해제는 **Task 9로 옮긴다**. R3이 backlog에 열린 항목으로 등재되는 순간, escalation은 "잊힌 것"이 아니라 "이연으로 처리된 것"이 되고 그 backlog 행이 해제의 증거가 된다. 증거가 생긴 뒤에 지운다.
- **Mirror**: `CLAUDE.md` §3.2 state-writer API.
- **Validate**:
  - `node -e "const sw=require('./plugins/mccp/scripts/state/state-writer'); const s=sw.readState(process.cwd()); console.log(s.frontmatter.escalate_pending)"` → 이 Task 직후에는 **여전히 `true`**. 여기서 `false`가 나오면 Task 3이 범위를 넘은 것이다.
  - `grep -c 'santa-loop' .claude/state/STATE.md` ≥ 1 이고 그 문맥이 "대기"가 아니라 "R1~R10 완주 · 운영자 종료 결정".

### Task 4: 소실 가능한 진단 아티팩트에 대한 서술 정정 (A6)

- **Action**: **git-tracked 파일 3개**가 `mccp-plan-codex`/`mccp-implement-codex` receipt를 **영구 증거**처럼 참조하는 문장을 정정한다 — `.claude/state/STATE.md` · `.claude/PRPs/reports/session-process-reclaim-report.md` · `.claude/state/fix-task-applied.md`(`:12`·`:28`·`:31`). 세 번째는 이전 판이 놓쳤는데, 그것이 정확히 이 Task가 막으려는 실패다: **소실 가능한 진단 아티팩트를 가리키는 참조가 git 이력에 남는 것**. 파일 목록을 좁게 잡으면 같은 결함이 한 파일 건너 살아남는다. §3.12 계약상 그 둘은 세션 진단용 working-tree only이고 실제로 이미 소실됐다(디렉토리 자체가 없다). 감사 대조 corpus는 git-tracked인 `mccp-pr-codex`뿐이며, 이 작업의 그 receipt는 **아직 작성되지 않았다**(PR 게이트 미완주). 보고서의 Next Steps에서 이미 수행된 항목(santa-loop)과 stale 버전 서술(`1.23.11`/`1.24.0`)도 함께 정정한다.
- **소실된 증거는 복구하지 않는다 — 복구가 불가능하기 때문이다.** 문서만 고치는 것이 미흡해 보이지만 대안이 없다: `mccp-plan-codex`는 `plan-codex-runner.js`가 in-process로만 쓰고 **CLI 표면이 존재하지 않으며**(§3.13 — 플래그를 만들면 아무 셸 호출자나 Codex 없이 승인 verdict를 찍을 수 있다), 손으로 재작성한 receipt는 그 심사가 일어났다는 증거가 아니라 **증거의 위조**다. `mccp-implement-codex`도 그 라운드의 payload가 사라진 이상 같다. 그러므로 이 Task의 목표는 증거 복원이 아니라 **없는 증거를 있다고 말하는 문장의 제거**다.
- **YAML frontmatter는 같은-줄 병기의 예외다 — 그 규칙을 그대로 적용하면 파일이 깨진다.** `.claude/state/fix-task-applied.md` 12행의 hit은 산문이 아니라 **frontmatter 안의 리스트 항목**(`originating_receipts:` 아래 `  - .claude/receipts/…`)이다. 여기에 ` (working-tree only · 소실됨)`을 덧붙이면 주석이 아니라 **경로 문자열의 일부**가 되어 값이 오염되고, frontmatter를 읽는 소비자가 존재하지 않는 경로를 얻는다. 그런데 아래 `누락 검출` 단언은 **모든** hit에 그 주석을 요구하므로, 규칙을 문자 그대로 지키면 단언은 통과하고 파일은 망가진다 — 단언이 잘못된 편집을 *강제*하는 형태다(L2 R13 invariant MEDIUM). 그러므로 **판정 범위를 본문으로 한정**하고 frontmatter는 구조적으로 처리한다: 값은 손대지 않고, frontmatter **바로 아래 본문 첫 줄**에 `> 위 originating_receipts는 working-tree only · 소실됨 — §3.12` 한 줄을 둔다. 아래 두 단언(누락 검출 · Validation 10)은 frontmatter 구간(첫 `---`부터 두 번째 `---`까지)을 제외하고 센다.
- **소실된 아티팩트의 *내용*에 대한 단정도 함께 완화한다.** 존재 주장만 지우고 내용 주장을 남기면 절반만 고친 것이다 — `.claude/state/STATE.md` 23행은 "(소실됨)"을 달아도 여전히 `findings 5건 원본 severity 봉인` · `codex_verdict=skipped` 같은 값을 **검증 가능한 사실처럼** 단정하는데, 그 파일이 없는 이상 아무도 대조할 수 없다(L2 R13 invariant HIGH). 형식을 바꾼다: 값을 지우지는 말되 출처를 명시해 `당시 기록에 따르면 …(대조 불가)`로 낮춘다. 이 Task의 목표가 "없는 증거를 있다고 말하는 문장의 제거"이므로 "없는 증거의 내용을 단정하는 문장"도 같은 대상이다.
- **정정문의 형식은 두 요소를 모두 갖춘다(둘 다 Validation 10이 판정한다)**: (i) 소실 주석 `(working-tree only · 소실됨)`을 참조와 **같은 줄에** 병기 — 다른 줄에 두면 총계는 맞아도 어느 참조가 근거 없는지 알 수 없다(frontmatter는 위 예외 규칙을 따른다). (ii) 세 파일 중 최소 한 곳에 **자리표시자** `ANCHOR-PENDING(Task 11)`을 남긴다 — 예: "이 작업의 cross-model 감사 anchor는 아직 없다. `ANCHOR-PENDING(Task 11)` — Task 11이 출하 게이트를 완주해 receipt를 실제로 생성하면 그때 이 자리에 그 경로를 기입한다." (ii)를 빼먹으면 다음 세션이 없는 증거를 처음부터 다시 찾는다.
- **자리표시자는 receipt 경로를 적지 않는다 — 그것이 이 형식의 요점이다.** 이전 판은 여기에 `mccp-pr-codex/<slug>.json`을 **미래형**("출하 시 생성될 … 아직 존재하지 않는다")으로 적게 했다. 그 문장은 존재를 주장하지는 않지만, **git-tracked 파일이 Task 11의 성공에 의존하는 forward reference를 갖게** 만든다 — Task 11이 중단되면 그 줄은 실재하지 않는 경로를 영구히 가리키고, 그것을 막는 기계 장치는 텍스트 검사뿐이다(L2 R8 architect HIGH). 자리표시자는 그 의존을 없앤다: 문장이 말하는 것은 **이 plan의 남은 작업**뿐이고, 그 주장은 Task 11의 성패와 무관하게 참이다.
- **경로 기입은 Task 11이 소유한다.** receipt가 실제로 생성된 *뒤에* 그 Task가 자리표시자를 실제 경로로 치환한다(§Task 11 Action 2). 순서가 이 축의 전부다 — R5는 anchor 명시를 요구했고, R6은 없는 receipt 참조를 막았으며, R8은 forward 결합을 지적했다. 셋은 "anchor를 쓰되 대상이 실재한 뒤에 쓴다"에서 동시에 만족된다. 감사 대조가 가능한 cross-model 기록은 `mccp-pr-codex`가 유일하고 git-tracked이므로 worktree 정리를 넘겨 살아남는다(§3.12).
- **Mirror**: `CLAUDE.md` §3.12 증거 내구성 계약 · §3.13 intent 결정은 CLI 표면을 갖지 않는다.
- **Validate**: 기계 단언 + 사람 대조 2단. "test로 안 잠긴다"고 적고 넘어가면 누락된 참조 하나가 그대로 git에 남는다.
  - **누락 검출**: `grep -rn 'mccp-plan-codex\|mccp-implement-codex' .claude/state/STATE.md .claude/PRPs/reports/session-process-reclaim-report.md .claude/state/fix-task-applied.md` 의 **모든** hit이 소실 가능성을 명시한 문맥 안에 있어야 한다. 정정 방식을 "해당 문자열 제거"가 아니라 **"`(working-tree only · 소실됨)` 주석을 같은 줄에 병기"** 로 고정하면 단언이 기계화된다: 위 grep의 hit 수 == `grep -rn 'working-tree only · 소실됨' <같은 세 파일>` 의 hit 수.
  - **stale 지시 제거**: `grep -c 'receipt를 다시 쓰지 말 것' .claude/state/STATE.md` → `0` (가리키는 대상이 없는 지시).
  - **stale 버전 서술 제거**: `grep -c '1\.23\.11\|1\.24\.0' .claude/PRPs/reports/session-process-reclaim-report.md` → `0`.
  - 사람 대조는 위 3개를 통과한 **뒤**의 최종 확인이지, 그것을 대신하지 않는다.

### Task 5: B6 — plan Task 2 케이스 7 라벨화

- **Action**: `.claude/plans/session-process-reclaim.plan.md`의 Task 2에서 케이스 7(`MCCP_RECLAIM_IDENTITY_TOLERANCE_MS` 하향 거부)을 정체 축 6케이스와 **같은 형식**으로 Validate 단언 목록에 열거하고, 상향(`'5000'`) 반영 단언까지 라벨화한다. 구현에는 이미 `identity 7`로 존재하므로 **코드 변경은 없다**.
- **Mirror**: 같은 Task의 정체 축 1~6 라벨 형식.
- **Validate**: `grep -n "identity 7" plugins/mccp/scripts/lib/tests/session-processes-reclaimable.test.js` → `:425`의 `test('identity 7 — MCCP_RECLAIM_IDENTITY_TOLERANCE_MS moves UP only', …)`를 가리키고, plan의 새 라벨이 그 test 이름과 일치.
  - **파일이 `session-processes-reclaimable.test.js`이지 `session-processes.test.js`가 아니다.** 이전 판이 후자를 인용했고 거기엔 없다 — L2 패널 R4가 그 grep이 빈 결과를 낸다는 것을 정확히 잡았다(그 리뷰어의 결론은 "test 자체가 부재"였는데 그건 틀렸다. 판정 축 test는 `-reclaimable` 파일이 소유한다). 즉 잘못된 것은 test가 아니라 이 plan의 인용이었고, 그 구분을 여기 남긴다 — 다음 사이클이 "없는 test를 만들라"로 읽지 않도록.

### Task 6: B5 — 포트 추측 **4줄 전부**를 `freePort()`로

- **Action**: `dashboard-server.test.js`의 pid 산술 포트 **4줄을 전부** `:588`의 `freePort()`로 교체한다 — `:156`(`7400 + pid%100`) · `:173`(`7500 + pid%100`) · `:557`(`7600 + pid%80`) · `:560`(`7700 + pid%80`). 각 줄이 `async` 컨텍스트인지 확인하고 아니면 test 콜백을 async로 승격한다. `:582`의 주석은 **코드가 아니라 사고 기록**이므로 남긴다(그 줄은 아래 Validate의 정규식이 코드 줄만 세도록 설계해 걸리지 않는다).
- **B5 backlog 서술이 부정확했다.** backlog 2026-08-14 LOW 행은 "이번 사이클이 추가한 두 test(7600/7700 계열)는 새 `freePort()` 헬퍼로 전환해 닫았고, 위 두 줄은 선재라 남겼다"고 적었으나, **실측하면 7600/7700 계열도 여전히 pid 산술**이다(`grep -c 'process\.pid %'` → 5, 그중 코드 4 + 주석 1). Task 9의 해소 표기에 이 정정을 함께 적는다 — 닫혔다고 적힌 것이 안 닫혀 있으면 그 backlog 행은 다음 사이클을 속인다.
- **Mirror**: 같은 파일 `:609`·`:667`의 `const port = await freePort();`.
- **Validate**:
  - `grep -c '^[^/]*process\.pid %' plugins/mccp/scripts/lib/tests/dashboard-server.test.js` → `0` (주석 줄 `:582`는 `//`로 시작하므로 제외된다).
  - `grep -c 'await freePort()' plugins/mccp/scripts/lib/tests/dashboard-server.test.js` → 작업 전보다 **정확히 4 증가**.
  - `node --test plugins/mccp/scripts/lib/tests/dashboard-server.test.js` → 0 fail.

### Task 7: B4 — owner-only 주장 범위 정정

- **Action**: backlog가 제시한 세 처리안 중 **(b)**를 택한다 — 코드/문서의 win32 ACL 함의를 내리고 "POSIX 한정, **생성 시에만** 적용"으로 좁힌다. (a)(win32 ACL test)가 진짜 해소지만 새 플랫폼 probe를 들여야 하므로 이 plan의 범위를 넘고, (c)(기존 디렉토리 `chmod`)는 동작 변경이라 출하 직전에 넣지 않는다. `session-processes.js:172-186`의 주석과 관련 문서 서술을 실제 범위로 맞춘다. **동작은 바뀌지 않는다.**
- **Mirror**: santa-loop R10 수정 방식 — "문서가 코드보다 좁게 말하는" 실패를 표현 정정으로 닫은 선례(`이미지가 node` → `이미지의 basename이 node`).
- **Validate**: `grep -n "0o700\|0o600" plugins/mccp/scripts/lib/session-processes.js` 주변 주석이 win32를 주장하지 않음. `node --test plugins/mccp/scripts/lib/tests/session-processes.test.js` → 0 fail (동작 무변경이므로 기존 단언 그대로 통과해야 한다).

### Task 8: PRD M3 행 (Files to Change 84행의 대응 Task)

- **Action**: `.claude/prds/session-process-reclaim.prd.md`의 `## Delivery Milestones` 표에 M3 행(`in-progress`, Plan 셀 = 이 plan 경로)과 "M1·M2의 complete는 *구현* 완료를 뜻한다"는 주석을 둔다. **이 편집은 Phase 4 WRITE에서 적용됐어야 한다**(PRD-mode 계약상 plan 생성과 같은 단위). 다만 이 Task는 그 사실을 *가정하지 않는다* — 아래 Validate의 grep이 먼저 판정하고, 0이면 **여기서 적용한다**. 멱등이다 — PRD-mode 계약상 plan 생성과 같은 단위이기 때문이다. 따라서 이 Task는 신규 편집이 아니라 **적용 여부의 기계 검증**이며, 미적용이면 그때 적용한다.
- **Mirror**: `/mccp:plan` PRD 아티팩트 모드 — "선택한 milestone 행을 `in-progress`로 바꾸고 Plan 셀에 생성된 plan 경로를 넣는다".
- **Validate**:
  - `grep -c '^| 3 | 출하 + 잔여 정리 .*in-progress.*session-process-reclaim-followup.plan.md' .claude/prds/session-process-reclaim.prd.md` → `1`.
  - `node plugins/mccp/scripts/lib/archive-complete/scan.js` 계열이 이 PRD를 **archivable로 판정하지 않는다** — M3가 열려 있으므로 §3.11 C2(미완료 PRD의 plan을 옮기면 소실)가 지켜진다.

### Task 9: backlog 등재 — 해소 3건 + 신규 이연 **정확히 10건**

- **Action**: `.claude/plans/codex-findings-backlog.md`에 아래를 **열거된 그대로** 추가한다. 개수와 대상을 여기서 못박는 이유는, "신규 이연 N건"이라고만 쓰면 §Out of Scope의 어느 항목이 대상인지 기계 검증이 불가능하기 때문이다.
  - **해소 표기 3건** (`RESOLVED-BY-IMPL` 행, 기존 행은 삭제하지 않는다): B4(owner-only 주장 범위) · B5(포트 추측 2줄) · B6(케이스 7 라벨화).
  - **신규 이연 10건** (전부 `열린` 상태 — 1~5는 이 세션의 실측·게이트 발견, 6~10은 L2 패널 R2가 제기한 구현 하드닝):
    1. `canonicalPath`(`:846-850`)와 `realpathNearest`(`:175-185`)의 정규화 폴백 불일치 — LOW, fail-closed
    2. SIGKILL로 SessionEnd를 건너뛴 세션의 **live pid 레코드**가 SessionStart 스윕에서 purge되지 않고 누적 — MEDIUM, B3와 같은 축
    3. `plan-review/l1-check.js:66` `CITATION_RE`가 dot-prefixed 경로를 잘라 **실재 파일에 `C6_UNRESOLVED_CITATION`** — MEDIUM, diverse-agent-review 소관
    4. `plan-review/cli.js record`가 `DECISION_SLUG`만으로 파일명을 정해 **같은 PRD의 두 번째 plan이 첫 번째의 git-tracked 기록을 덮어씀** — HIGH, 이번 실행에서 실제 발생·복구함
    5. PR-Codex R3(dashboard reuse 실패 시 `reused:true`) — HIGH, 제품 결정 대기. **backlog에 없던 항목이므로 이번에 처음 등재한다**(§C가 그 판단 근거를 갖고 있으나 backlog 행이 없으면 이연처가 실재하지 않는다 — santa-loop R7 교훈).
    6. `register()`에 **런타임 gitignore 가드가 없다** — 커버리지가 test 시점에만 검증된다(`git check-ignore`). MEDIUM, 구현 하드닝
    7. `.unreclaimed.json`/`.failed.json` 감사 레코드의 mode 강제가 **런타임 단언으로 잠기지 않았다** — MEDIUM, 구현 하드닝
    8. `SESSION_ID`의 경로 탈출 검증(`assertSafeSessionId`)이 **모든 경로에서 호출됨을 test가 강제하지 않는다** — MEDIUM, 구현 하드닝
    9. `probeProcess` 플랫폼 출력 **파싱 견고성(손상·특수문자) test 부재** — MEDIUM, 구현 하드닝
    10. `realpathSync.native` 실패 시 POSIX 폴백 경로의 **symlink 봉쇄 동작이 별도로 test되지 않는다** — MEDIUM, 구현 하드닝 (신규 1번과 같은 축)
- **`escalate_pending` 해제도 이 Task의 Action이다** (Task 3에서 옮겨 왔다). 위 5번(R3)이 backlog에 등재된 **뒤에만** 실행한다 — 그 backlog 행이 "escalation이 잊힌 것이 아니라 이연으로 처리됐다"는 증거이고, 증거 없이 지우면 열렸다 수렴 없이 끝난 사실이 사라진다. 순서와 명령을 명시한다:
  ```bash
  # 선행 조건: R3 행이 실재해야 한다. 없으면 해제하지 않는다.
  #
  # **-E를 쓰지 않는다.** 이전 판은 `grep -qE '^[0-9]{4}-… | (HIGH|MEDIUM|LOW) |.*announceReuseRegistration'`
  # 였는데, ERE에서 `|`는 교대(alternation)라 이 패턴이 세 갈래로 갈라진다: (a) 날짜로 시작하는 줄,
  # (b) severity 낱말이 낀 줄, (c) 실제로 찾으려던 키워드. backlog에 **R3와 무관한 날짜 행 하나만
  # 있어도** (a)가 발화해 통과한다(가짜 backlog 1줄로 재현 확인). 즉 escalation 해제를 막는 유일한
  # 기계 장치가 사실상 무조건 통과였다. 찾는 것은 고정 문자열 하나뿐이므로 -F로 못박는다.
  grep -qF 'announceReuseRegistration' .claude/plans/codex-findings-backlog.md \
    || { echo "R3 backlog 행 부재 — escalate_pending을 해제하지 않는다"; exit 1; }
  node -e "
    const sw=require('./plugins/mccp/scripts/state/state-writer');
    sw.update(process.cwd(), { escalate_pending: false, escalate_pending_decision_id: null,
      event: 'escalation_deferred_to_backlog' });
  "
  ```
  이 guard는 **혼자서 충분하지 않다** — 위 블록을 통째로 건너뛰고 손으로 `state-writer`를 부르면 아무것도 막지 못한다. 그래서 Acceptance가 최종 상태(`escalate_pending=false` ∧ R3 행 실재)를 한 번 더 읽는다. guard는 *이 경로로 들어왔을 때* 순서를 강제하고, Acceptance는 *어느 경로로 들어왔든* 결과를 판정한다. 둘 다 필요하다.
- **각 행은 아래 Validate가 찾는 키워드를 그대로 포함해야 한다.** Validation 7이 리터럴 substring으로 실재를 판정하므로, 위 산문 서술만 보고 행을 쓰면 뜻이 같아도 문자열이 어긋나 실재하는 등재가 누락으로 보고된다 — 특히 `record 슬러그 충돌` · `register() 런타임 gitignore` · `unreclaimed.json mode` · `probeProcess 파싱 견고성` · `realpath 폴백 symlink`는 위 1~10번 서술에 그 형태로 등장하지 않는다. 행마다 대응 키워드를 확인하고 쓴다(1→`canonicalPath`, 2→`SIGKILL`, 3→`CITATION_RE`, 4→`record 슬러그 충돌`, 5→`announceReuseRegistration`, 6→`register() 런타임 gitignore`, 7→`unreclaimed.json mode`, 8→`assertSafeSessionId`, 9→`probeProcess 파싱 견고성`, 10→`realpath 폴백 symlink`).
- **Mirror**: 기존 `RESOLVED-BY-IMPL` 행 형식 + `YYYY-MM-DD | <severity> | <source> | <one-line>`.
- **Validate**:
  - `grep -c 'RESOLVED-BY-IMPL' .claude/plans/codex-findings-backlog.md` 가 작업 전보다 **정확히 3 증가**.
  - 신규 10건 각각의 고유 문자열(`canonicalPath` · `SIGKILL` · `CITATION_RE` · `record` 슬러그 충돌 · `announceReuseRegistration` · `register() 런타임 gitignore` · `unreclaimed.json mode` · `assertSafeSessionId` · `probeProcess 파싱 견고성` · `realpath 폴백 symlink`)이 각 1회 이상 존재.
  - **이연은 열린 채로 남는다**: 위 10건이 있는 줄 중 `RESOLVED` 를 포함하는 줄이 **0건**.
  - **해제 순서 단언**: R3 backlog 행이 존재하고(`grep -c 'announceReuseRegistration' … ≥ 1`), 그 **뒤에** `escalate_pending`이 `false`/미출력. 순서가 어긋나면 이 Task는 미완이다.

### Task 10: `CLAUDE.md` §3.7 "동기 대상 5면" 정정

- **Action**: `CLAUDE.md:325`의 5면 목록에서 `renderer/tests/i18n-surface.test.js 단언 2개`를 손동기 대상에서 빼고, 그 test가 `plugin.json`에서 파생하므로 **자동 추종한다**는 사실로 대체한다(4면 + 파생 1면). 목록 자체를 지우지 말고 "왜 4면이 됐는지"를 남긴다 — 그래야 다음 사이클이 다시 5면으로 되돌리지 않는다.
- **Mirror**: 같은 §3.7이 이미 쓰는 방식 — 옛 서술을 지우지 않고 무엇이 바뀌었는지 적는 형태.
- **Validate**:
  - `grep -c '동기 대상 5면' CLAUDE.md` → `0`.
  - `grep -c 'i18n-surface.test.js' CLAUDE.md` → `1` 이상이되, 그 줄이 **manifest 파생**임을 서술.
  - `node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md` → exit 0 (절 이동이 아니라 문장 정정이므로 ledger 영향이 없어야 한다).

### Task 11: 출하 실행 (Acceptance가 요구하는 live 완주)

- **Action 1 — 버전 게이트**: Task 1~10이 끝난 뒤 `/mccp:prp-commit` → `/mccp:pr`로 실제 출하한다. **`/mccp:pr`을 호출하기 전에 아래 블록을 먼저 돌리고, 비영점이면 호출하지 않는다** — 아래 Validate에 같은 조건이 적혀 있지만 Validate는 *사후* 판정이라 그것만으로는 PR이 이미 만들어진 뒤에 붉어질 수 있다. 게이트는 호출 경로 **앞**에 있어야 게이트다:

  ```bash
  # fetch와 read를 **분리**하고 각각 판정한다. `MAIN_V_NOW=$(git fetch … && git show …)` 한 줄로
  # 묶으면 fetch 실패 시 `&&`가 단락되어 변수가 **빈 문자열**이 되고, 아래 비교가
  # `[ "1.27.0" = "" ]` → 거짓 → **게이트 통과**가 된다. 이 블록은 §3.7 재발을 막는 유일한
  # 기계 지점인데 하필 네트워크 실패에 fail-open이 되는 형태였다. 비교 전에 "읽어 온 값이
  # 실제 버전인가"를 먼저 세운다 — 모르는 상태는 통과가 아니라 정지다.
  # **비교의 양쪽 모두에 같은 보호를 건다.** 아래 MAIN_V_NOW의 3단 분리는 "모르는 상태는
  # 통과가 아니라 정지"라는 규칙인데, 이전 판은 그 규칙을 한쪽에만 적용했다. plugin.json이
  # 없거나 파싱에 실패하면 node가 죽고 BRANCH_V는 **빈 문자열**이 되며, 아래 비교가
  # `[ "" = "1.26.0" ]` → 거짓 → **게이트 통과**가 된다. 막으려던 fail-open이 반대편에
  # 그대로 남아 있었다(L2 R9 invariant CRITICAL).
  BRANCH_V=$(node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)") \
    || { echo "STOP: branch의 plugin.json을 읽지 못했다 — 우리 version을 모르는 채로 PR을 만들지 않는다."; exit 1; }
  case "$BRANCH_V" in
    [0-9]*.[0-9]*.[0-9]*) ;;
    *) echo "STOP: branch version이 semver로 읽히지 않는다('$BRANCH_V') — 비교가 성립하지 않는다."; exit 1 ;;
  esac
  git fetch -q origin main || { echo "STOP: origin/main fetch 실패 — main의 현재 version을 모르는 채로 PR을 만들지 않는다."; exit 1; }
  MAIN_V_NOW=$(git show origin/main:plugins/mccp/.claude-plugin/plugin.json \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).version))") \
    || { echo "STOP: origin/main의 plugin.json을 읽지 못했다."; exit 1; }
  case "$MAIN_V_NOW" in
    [0-9]*.[0-9]*.[0-9]*) ;;
    *) echo "STOP: main version이 semver로 읽히지 않는다('$MAIN_V_NOW') — 비교가 성립하지 않는다."; exit 1 ;;
  esac
  if [ "$BRANCH_V" = "$MAIN_V_NOW" ]; then
    echo "STOP: main이 $MAIN_V_NOW 를 선점했다. PR을 만들지 말 것."
    echo "  1) 4면을 forward-only로 다시 상향  2) Task 2 Validate 전체 재실행  3) PR title 갱신(§3.7 #4)"
    exit 1
  fi
  # 판정 결과를 **아티팩트로 남긴다.** Acceptance는 이 블록과 다른 셸에서 돌므로, stdout에만
  # 찍으면 "게이트가 실제로 돌았는가"를 판정할 대상이 없고 사람의 기억이 유일한 증거가 된다
  # (L2 R12 invariant MEDIUM). 5.2a가 started-at을 셸 변수가 아니라 **파일**로 두는 것과 같은
  # 이유이고, 이 plan이 이미 두 번 고친 "검증 블록이 앞 단계의 셸 상태를 물려받는다고 가정"과도
  # 같은 계열이다. 같은 지적의 나머지 절반("`/mccp:pr` Phase 0에 기계 통합하라")은 §Rejected
  # Findings에서 기각한다 — 출하된 command body 변경은 이 plan의 축이 아니다.
  MCCP_TMP="$(git rev-parse --git-path mccp/tmp)"; mkdir -p "$MCCP_TMP"
  echo "version gate OK: branch=$BRANCH_V main=$MAIN_V_NOW" | tee "$MCCP_TMP/version-gate.txt"
  ```

  그 사이 main이 target을 선점했으면 4면을 다시 상향하고 PR title도 맞춘다(§3.7 체크리스트 4번).
- **Action 2 — anchor 기입 (Task 4에서 이관).** `/mccp:pr`이 완주해 `.claude/receipts/mccp-pr-codex/<slug>.json`이 **실재하게 된 뒤에만**, Task 4가 남긴 `ANCHOR-PENDING(Task 11)` 자리표시자를 그 실제 경로로 치환하고 별도 커밋한다. 순서가 이 단계의 전부다 — Task 4 시점에 경로를 적으면 git-tracked 파일이 아직 없는 파일을 가리키고, 출하가 중단되면 그 줄이 영구히 거짓이 된다(L2 R8 architect HIGH). 여기서는 **파일이 이미 존재하므로** 그런 결합이 생기지 않는다. receipt가 만들어지지 않았다면 치환하지 않는다 — 자리표시자가 남는 것이 정확한 상태 표기다.
- **Mirror**: `CLAUDE.md` §1.3 chain — `/mccp:prp-commit` → `/mccp:pr`. §3.12 merge-commit 정책(squash 금지).
- **Validate**:
  - **버전 충돌 기계 게이트** (`/mccp:pr` 진입 직전, PR 생성 **전**): 위 Action 블록이 그 판정이며, **여기서 같은 비교를 다시 적지 않는다.** 이전 판은 `test "$(node -e …)" != "$(git show …)"` 한 줄을 여기 복제했는데, 그 복제본에는 Action이 갖춘 3단 보호(읽기 실패 abort · semver 형태 검사 · fetch 실패 abort)가 없어 node가 죽으면 `"" != "1.26.0"` → 참 → **검증 통과**로 읽혔다(L2 R9 invariant HIGH). 게이트를 두 벌 두면 약한 쪽이 실질 게이트가 된다. 통과 조건은 Action 블록이 `version gate OK: branch=… main=…`을 출력하고 비영점으로 끝나지 않는 것이다. 같으면 **PR을 만들지 않고** 4면을 다시 상향하고, **Task 2의 Validate 전체를 재실행한다** — 재상향은 `plugin.json`을 바꾸므로 footer 2면과 CHANGELOG 헤딩이 다시 어긋나고 `i18n-surface.test.js`가 붉어진다. 재검증 없이 PR로 넘어가면 상향이 drift를 만든 채 출하된다. 이것이 §3.7 재발을 막는 유일한 기계 지점이다 — 나머지는 전부 사람의 기억에 의존한다.
  - `gh pr list --head session-process-reclaim --state all` → **1건 이상**.
  - `ls .claude/receipts/mccp-pr-codex/ | grep session-process-reclaim` → 파일 존재.
  - 그 receipt의 ship 판정이 no-ship이 아님. 두 가지를 **따로** 본다 — 하나가 다른 하나를 대신하지 않는다:
    - (a) **decision 단위 verdict**: `node -e "const r=require('./.claude/receipts/mccp-pr-codex/<slug>.json'); console.log(r.resolution.codex_verdict)"` → `converged` 또는 `skipped`(§3.12의 ship 집합). `divergent`/`critical`/`unavailable`/부재면 미충족이다.
    - (b) **repo 전역 감사**: `node plugins/mccp/scripts/lib/evidence-audit.js --json` 이 `state=blind`를 내지 않는다. **이 도구는 decision 인자를 받지 않는다** — usage가 `[--json] [--repo-root <path>]`뿐이고 ledger↔receipt를 저장소 전체로 대조한다(실측: 인자 없이 정상 동작, 현재 `state=incomplete`). 그러므로 (b)는 "이 decision이 승인됐다"가 아니라 "증거 대조 기반이 무너지지 않았다"를 말하며, decision 단위 판정은 (a)가 소유한다. 이전 판은 (b) 하나에 "그 decision에 대해"라고 적어 도구가 하지 않는 일을 한다고 주장했다.
  - **감사 override 미사용**: 그 receipt에 `pr_codex_force_override` 계열 키가 **없다**. 있으면 ship gate를 통과한 것이 아니라 우회한 것이므로 Acceptance 미충족이다.
  - **anchor 기입 완료 (Action 2)** — 두 단언을 **짝으로** 본다. 하나만 보면 "치환했다"와 "가리키는 대상이 실재한다"가 구별되지 않는다:
    ```bash
    T4_FILES=".claude/state/STATE.md .claude/PRPs/reports/session-process-reclaim-report.md .claude/state/fix-task-applied.md"
    # (1) 자리표시자가 남지 않았다.
    # `grep -rhc … | paste -sd+ | bc`를 쓰지 않는다 — **bc는 이 저장소의 개발 환경(Git Bash)에
    # 없다**(실측: `command -v bc` → MISSING). 그 관용구는 항상 빈 문자열을 내어 정수 비교가
    # `integer expression expected`로 깨지고, 단언은 구현과 무관하게 실패한다. `-h` + `wc -l`은
    # 파일별 카운트를 합칠 필요 자체를 없앤다.
    [ "$(grep -rhF 'ANCHOR-PENDING(Task 11)' $T4_FILES | wc -l)" -eq 0 ] \
      || { echo "Task11 FAILED: ANCHOR-PENDING 자리표시자가 남아 있다 — Action 2 미수행"; exit 1; }
    # (2) 기입된 경로가 **실재하는 파일**이다. 텍스트 검사만으로는 R8이 지적한 결함(존재하지
    #     않는 경로를 가리키는 git-tracked 참조)이 그대로 재현된다.
    grep -rhoE '\.claude/receipts/mccp-pr-codex/[A-Za-z0-9_.-]+\.json' $T4_FILES | sort -u \
      | while read -r p; do
          [ -f "$p" ] || { echo "Task11 FAILED: 기입된 anchor 경로가 실재하지 않는다: $p"; exit 1; }
        done
    ```

### Task 12: PRD 1차 지표(회수율)를 **한 번 실측**한다

- **왜 필요한가**: PRD의 `[primary] 회수율`은 "세션이 띄운 detached 자식 중 종료 시 회수되는 비율"이고 측정 방법을 "세션 레지스트리 + 종료 후 `pidAlive` 확인"으로 못박았다. 그런데 M1+M2의 검증은 전량 **단위 test**였다 — 주입한 killer가 받은 pid 집합을 기대 집합과 대조하는 방식이라 *판정 로직*은 증명하지만 *실제로 프로세스가 죽는지*는 증명하지 않는다. 그 결과 **이 PRD의 1차 지표는 한 번도 관측된 적이 없다.** 이 plan의 존재 이유가 "test는 녹색인데 출하되지 않았다"인데, 같은 자리에 "test는 녹색인데 측정되지 않았다"를 남겨 둘 수 없다.
- **Action**: 스크립트 경로는 **`plugins/mccp/scripts/lib/tests/manual/session-process-reclaim-smoke.js`**다(`manual/` 하위 = `node --test` 글롭 `tests/*.test.js`에 잡히지 않으므로 CI 상시 suite에 편입되지 않는다. 이것이 "새 상시 test를 만들지 않는다"를 **경로로** 보장하는 방법이고, 파일명을 정하지 않으면 그 보장이 산문에만 남는다). 실행은 `node plugins/mccp/scripts/lib/tests/manual/session-process-reclaim-smoke.js`. 내용은 end-to-end 1회 — (1) 임시 repo에 레지스트리를 만들고 실제 자식 프로세스(`node -e "setInterval(()=>{},1e9)"`)를 spawn, (2) 그 pid를 `register()`로 `lifetime:'session'`으로 등록, (3) `reclaimSession()` 호출, (4) 반환값과 `pidAlive(pid)`를 함께 확인. **새 상시 test를 만들지 않는다** — 실물 프로세스를 죽이는 test는 CI에서 불안정하므로 `.claude/PRPs/reports/`에 관측 결과를 기록하는 일회성 실행으로 둔다.
- **스크립트가 반드시 갖춰야 할 계약** (산문 서술만으로는 부족하다 — Validation 9는 exit code만 보므로, 단언을 명세하지 않으면 `pidAlive`를 아예 검사하지 않는 구현도 통과한다):
  1. **성공은 exit 0, 그 외 모든 경우는 비영점**이다. 단언 실패·spawn 실패·타임아웃·예외를 전부 비영점으로 매핑한다. `process.exitCode`를 설정만 하고 끝내지 말 것(비동기 잔여 핸들이 있으면 종료 코드가 뒤집힌다) — 명시적으로 `process.exit(code)`.
  0. **생사 판정 함수의 출처를 못박는다 — `session-processes.js`에는 없다.** 이 계약이 `pidAlive`라고만 적어 두면 구현자가 그 모듈에서 찾다 실패하고 손으로 다시 짠다(L2 R14 test HIGH, 실측 확인: `session-processes.js`의 export 37개에 `pidAlive`/`isPidAlive` 둘 다 없다). 후보는 둘이고 **정본은 전자**다: `plugins/mccp/scripts/receipt/evidence-lock.js`의 `isPidAlive` (export됨, `EPERM`을 alive로 읽는 의미론이 `:82-91`에 있음) · `plugins/mccp/scripts/lib/dashboard-server.js`의 `pidAlive` (export되긴 하나 그 모듈은 서버 기동이 주 관심사다). fan-out 기록도 `evidence-lock.js:82-91`을 "MUST reuse for all three contexts"로 지목한다. 스모크 스크립트는 `require('<repo>/plugins/mccp/scripts/receipt/evidence-lock').isPidAlive`를 쓰고 **재구현하지 않는다**. 아래 Validation 9의 독립 확인도 같은 함수를 쓰므로, 손으로 짠 `EPERM` 분기가 플랫폼별로 갈릴 여지가 사라진다(L2 R14 invariant MEDIUM 4가 지적한 축 — 다만 그 지적이 든 근거는 부정확했다. 인라인 로직의 `EPERM→alive`는 이 저장소의 정본 의미론과 동일하며 win32에서도 libuv가 같은 코드를 낸다. 실제 문제는 플랫폼이 아니라 **정본을 두고 재구현한 것**이었다).
  2. **`isPidAlive(pid) === false`를 실제로 단언한다.** `reclaimSession` 반환값만 보고 통과시키면 R1이 잡았던 결함(신호를 무시한 프로세스를 회수 성공으로 보고)을 그대로 재현한다. kill 직후 즉시 읽으면 OS가 아직 회수 전일 수 있으므로 **bounded poll**(예: 50ms 간격 최대 5초)로 확인하고, 창을 넘기면 **실패**로 처리한다(성공으로 넘기지 않는다).
  3. **관측값을 stdout에 기계 판독 가능한 한 줄로 출력한다** — `RECLAIM_OBSERVATION {"attempted":N,"succeeded":N,"pid":<자식 pid>,"pid_alive_after":bool,"skipped":[...]}`. 이 줄이 Task 12가 보고서에 옮겨 적을 원본이며, 없으면 "관측했다"는 주장에 대조할 대상이 없다. **`pid`(실제 spawn한 자식의 pid)를 반드시 싣는다** — Validation 9가 그 pid를 받아 *스크립트 밖에서 독립적으로* 사망을 확인한다. 이것이 없으면 검증이 스크립트의 자기 보고를 믿는 구조가 되어, 아무 일도 하지 않고 기대 JSON만 찍는 구현이 통과한다.
  4. **정리 책임**: 회수가 실패해 자식이 살아남으면 스크립트가 스스로 kill하고 임시 repo를 지운 뒤 비영점 종료한다. 실패 경로가 좀비를 남기면 이 스크립트 자체가 PRD가 없애려는 문제를 만든다.
  5. **표본 1을 표본 1이라 적는다.** 반환이 1/1이어도 stdout·보고서 어디에도 "회수율 100%"라고 쓰지 않는다.
- **Mirror**: `session-processes-reclaim.test.js`의 주입 killer 패턴을 **실물 kill로 바꾼 것**. 등록 스키마와 호출 순서는 그 test와 동일하게 맞춘다.
- **Validate**:
  - `reclaimSession` 반환의 `complete===true` ∧ 회수 대상 1건.
  - 호출 후 `pidAlive(pid) === false` — **이것이 지표 자체다**. 반환값만 보고 넘어가면 R1이 잡았던 결함("신호를 무시한 프로세스를 회수 성공으로 보고")을 그대로 재현한다.
  - 관측 결과(회수 시도 수 / 성공 수 / 미회수 사유)를 `.claude/PRPs/reports/session-process-reclaim-report.md`에 한 절로 추가. **비율이 1/1이라고 해서 "회수율 100%"라고 쓰지 않는다** — 표본 1의 관측이라고 적는다.

## Validation

> **이 블록은 Task별 Validate를 대체하지 않는다 — 둘 다 돌려야 한다.** 이 plan에는 검증 표면이
> 둘 있다: (a) 각 Task의 `**Validate**` 항목, (b) 아래 전역 블록. 이전 판은 Acceptance가 (b)만
> 가리켜서, Task 3~8·10~11의 단언은 **실행 지점 없이 산문으로만** 존재했다 — 적어 두었을 뿐
> 아무도 돌리지 않는 검증은 검증이 아니다. 아래 **Validation 10**이 그중 기계화 가능한 것
> (grep·node 한 줄짜리)을 모아 실제로 돌리고, Acceptance는 (a)와 (b)를 함께 요구한다.
> Validation 10에 넣지 않은 것은 성격상 사람 판단이 필요한 항목(Task 4의 사람 대조, Task 1의
> "의도적으로 지운 것이 아닌가")뿐이며, 그 사실을 각 Task가 명시한다.

```bash
# 0. 전제 — 임시 경로는 worktree-safe하게 해석하고 먼저 만든다. 리터럴 `.git/…`은
#    linked worktree에서 열리지 않고(§3.8), 디렉토리가 없으면 아래 리다이렉트가
#    실패하는데 그 실패는 조용하다 — 이후 `comm`이 빈 파일을 읽고 0줄을 내어
#    Validation 4와 6이 통과한 것처럼 보인다(Validation 7이 vacuous했던 것과 같은 형태).
set -uo pipefail   # -e는 쓰지 않는다: 아래 단언들은 비영점 exit를 값으로 읽는다
# **불변식: 이 블록은 자립적이다.** 각 Task는 별도 셸에서 돌았으므로 그 변수는 여기 없다.
# 아래에서 쓰는 모든 변수는 이 블록 안에서, **첫 사용보다 앞에서** 정의한다. `set -u` 아래에서
# 이를 어기면 확장이 서브셸을 죽여 단언이 *구현과 무관하게* 실패한다 — 실제로 두 번 발생했다
# ($T4_FILES는 정의 순서, $TARGET/$MAIN_V는 블록 경계). 새 변수를 추가할 때 이 규칙을 지킬 것.
MCCP_TMP="$(git rev-parse --git-path mccp/tmp)"
# 경로 자체가 비면 `mkdir -p ""`가 조용히 지나가고 이후 리다이렉트가 엉뚱한 곳을 향한다 —
# 파일 존재 가드(Validation 4)는 *파일*을 보지 *경로가 옳은지*를 보지 않는다.
[ -n "$MCCP_TMP" ] || { echo "Validation 0 FAILED: git rev-parse --git-path가 빈 값을 냈다 — repo 밖에서 실행 중인지 확인할 것"; exit 1; }
mkdir -p "$MCCP_TMP" || { echo "Validation 0 FAILED: $MCCP_TMP 생성 불가"; exit 1; }

# 1. reclaim 5 suite — 이 plan은 **런타임 제품 동작**을 바꾸지 않으므로 기준선이 유지돼야 한다.
#    (Task 6은 test 하네스의 포트 확보 방식을, Task 7은 주석을 바꾼다 — 둘 다 제품 경로 밖이다.
#     그래서 6a 기준선을 우리 변경 *이전* 상태에서 떠야 비교가 성립한다.)
#    실측 기준선(이 plan 작성 시점): 150 tests / 149 pass / 0 fail / 1 skip
node --test \
  plugins/mccp/scripts/lib/tests/session-processes.test.js \
  plugins/mccp/scripts/lib/tests/session-processes-reclaim.test.js \
  plugins/mccp/scripts/lib/tests/session-processes-reclaimable.test.js \
  plugins/mccp/scripts/lib/tests/session-processes-spawn-sites.test.js \
  plugins/mccp/scripts/lib/tests/dashboard-server.test.js

# 2. SessionEnd 결선 test
node --test plugins/mccp/scripts/hooks/tests/session-end-marker-reclaim.test.js

# 3. 버전 표면 (manifest 파생 단언)
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 4. 머지 사고 검증 (§3.5.1) — 사전 캡처 대조 + 삭제 목록. Task 1 참조.
#    **선행 가드는 여기에도 있어야 한다.** Task 1의 Validate 산문에만 두면 소용이 없다 —
#    Acceptance 2번이 가리키는 것은 이 블록이고, 여기에 가드가 없으면 캡처를 건너뛴 실행이
#    그대로 통과한다. 파일이 없을 때 `sort`는 stderr로 실패하지만 `comm`은 빈 입력에 대해
#    0줄을 내므로, "삭제 0건"과 "대조가 아예 성립하지 않음"이 같은 출력으로 보고된다.
#    위 0번이 `mkdir -p`로 디렉토리를 만들기 때문에 디렉토리 존재는 증거가 되지 못한다 —
#    파일 자체를 봐야 한다.
# **stale 캡처를 부재와 같이 취급한다.** `test -s`만으로는 이전 시도가 남긴 파일이 가드를
# 통과시켜, 대조가 *옛 main*을 정본으로 삼고 그 뒤 main이 추가한 파일의 소실을 놓친다
# (L2 R14 invariant HIGH). 캡처 시점의 origin/main SHA를 함께 봉인했으므로 현재와 대조한다.
if [ -s "$MCCP_TMP/base-inventory.sha" ]; then
  CAP_SHA=$(cat "$MCCP_TMP/base-inventory.sha")
  NOW_SHA=$(git rev-parse origin/main)
  [ "$CAP_SHA" = "$NOW_SHA" ] || {
    echo "Validation 4 FAILED: base-inventory가 stale이다(캡처=$CAP_SHA 현재=$NOW_SHA)."
    echo "  이전 실행이 남긴 파일로 대조하면 그 사이 main이 추가한 파일의 소실을 놓친다."
    echo "  복구: 머지를 되돌리고(git merge --abort 또는 git reset --hard ORIG_HEAD) Task 1을 1단계부터 다시 실행한다."
    exit 1
  }
else
  echo "Validation 4 FAILED: base-inventory.sha 부재 — 캡처 출처를 알 수 없으므로 stale 여부를 판정할 수 없다."
  exit 1
fi
test -s "$MCCP_TMP/base-inventory.txt" || {
  echo "Validation 4 FAILED: base-inventory.txt 부재 — 머지 전 캡처를 건너뛰었으므로 대조가 성립하지 않는다."
  echo "  복구: 머지를 되돌리고(git merge --abort 또는 git reset --hard ORIG_HEAD) Task 1을 1단계부터 다시 실행한다."
  exit 1
}
DROPPED=$(comm -23 <(sort "$MCCP_TMP/base-inventory.txt") <(git ls-tree -r --name-only HEAD | sort))
[ -z "$DROPPED" ] || {
  echo "Validation 4 FAILED: 머지가 main의 파일을 떨어뜨렸다:"; echo "$DROPPED"
  echo "  복구: git reset --hard ORIG_HEAD 후 충돌을 파일 단위로 다시 해소한다(§3.5.1 — 디렉토리 통째 취함 금지)."
  exit 1
}
# 삭제 목록도 **판정**한다. 이전 판은 목록을 stdout에 찍기만 했는데, §3.5.1이 요구하는 것은
# "목록에 의도치 않은 파일이 0건"이고 출력만으로는 그 판정이 사람 눈에 맡겨진다 — PR #110
# 사고가 정확히 그렇게 지나갔다. 의도한 삭제는 이 plan에 **0건**이므로(Files to Change에
# DELETE 행이 없다) 기대값을 0으로 못박을 수 있다. 앞으로 의도적 삭제가 생기면 이 단언이
# 먼저 붉어지고, 그때 그 파일을 명시적으로 예외 목록에 올리는 것이 옳은 순서다.
DELETED=$(git diff --diff-filter=D --name-only origin/main...HEAD)
[ -z "$DELETED" ] || {
  echo "Validation 4 FAILED: 이 브랜치가 삭제하는 파일이 있다(이 plan은 의도적 삭제가 0건이다):"
  echo "$DELETED"
  exit 1
}

# 5. CHANGELOG — 헤딩 유일성 + **두 항목이 각자 살아남았는지**
#
#    **두 버전을 이 블록 안에서 파생한다.** 이전 판은 "$TARGET/$MAIN_V는 Task 2가 결정"이라고
#    주석으로만 적고 값을 받아오지 않았다. 이 블록은 Task 2와 **다른 셸**이라 그 변수들이
#    존재하지 않고, 0번의 `set -u` 아래에서 확장이 서브셸을 죽여 `[ "" -eq 1 ]`이
#    `integer expression expected`로 깨진다 — Validation 5가 **구현이 옳아도 항상 실패**했다
#    ($T4_FILES 결함과 같은 계열, L2 R10 test MEDIUM). 셸 상태에 기대지 말고 디스크에서 읽는다.
#    Task 2가 끝난 뒤라면 branch의 plugin.json이 곧 $TARGET이고 origin/main의 것이 $MAIN_V다.
TARGET=$(node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)") \
  || { echo "Validation 5 FAILED: branch plugin.json을 읽지 못했다 — 버전을 모르는 채로 판정하지 않는다."; exit 1; }
MAIN_V=$(git show origin/main:plugins/mccp/.claude-plugin/plugin.json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).version))") \
  || { echo "Validation 5 FAILED: origin/main plugin.json을 읽지 못했다."; exit 1; }
case "$TARGET" in [0-9]*.[0-9]*.[0-9]*) ;; *) echo "Validation 5 FAILED: TARGET이 semver가 아니다('$TARGET')"; exit 1 ;; esac
case "$MAIN_V" in [0-9]*.[0-9]*.[0-9]*) ;; *) echo "Validation 5 FAILED: MAIN_V가 semver가 아니다('$MAIN_V')"; exit 1 ;; esac
# 상향이 실제로 일어났는지도 여기서 걸린다 — 같으면 Task 2 미수행이고, 그 상태로 아래
# 헤딩 유일성만 보면 "1개 존재"가 우연히 참이 되어 통과한다.
[ "$TARGET" != "$MAIN_V" ] \
  || { echo "Validation 5 FAILED: branch와 main의 version이 같다($TARGET) — Task 2 상향 미수행"; exit 1; }
#    개수만 세면 한쪽을 지우거나 둘을 한 절로 합쳐도 1이 나온다. 본문 고유 문자열까지 본다.
#    **네 줄 다 판정한다.** 이전 판은 `grep -c`로 개수를 stdout에 찍고 기대값을 주석(`# >=1`,
#    `# 1`)으로만 적었다 — Validation 4가 삭제 목록을 찍기만 하던 것과 같은 결함이고, 이 절이
#    막으려는 사고(머지가 한쪽 CHANGELOG 항목을 삼킴)는 정확히 사람이 출력을 안 볼 때 지나간다.
[ "$(grep -c 'santa-loop-materialize M2' CHANGELOG.md)" -ge 1 ] \
  || { echo "Validation 5 FAILED: main의 santa-loop-materialize 항목 본문이 사라졌다(머지가 삼킴)"; exit 1; }
[ "$(grep -c 'session-process-reclaim M1+M2' CHANGELOG.md)" -ge 1 ] \
  || { echo "Validation 5 FAILED: 우리 항목 본문이 사라졌다"; exit 1; }
[ "$(grep -c "^## \[$TARGET\]" CHANGELOG.md)" -eq 1 ] \
  || { echo "Validation 5 FAILED: '## [$TARGET]' 헤딩이 유일하지 않다(0=상향 누락 / 2+=중복 발행)"; exit 1; }
[ "$(grep -c "^## \[$MAIN_V\]" CHANGELOG.md)" -eq 1 ] \
  || { echo "Validation 5 FAILED: '## [$MAIN_V]' 헤딩이 유일하지 않다 — main 항목을 지웠거나 우리 항목과 합쳤다(§3.7: 두 항목을 합치지 않는다)"; exit 1; }

# 6. 전체 suite — 기준선 대조. 절차를 명시한다(아래 산문 참조).
#    6a. 머지 직후, 우리 변경을 얹기 전에 기준선을 파일로 뜬다.
#
#    **`|| true`로 stash 실패를 삼키지 않는다.** 이전 판은 push/pop 양쪽에 `|| true`를 달았는데,
#    stash가 실패하면 기준선을 *우리 변경이 얹힌 상태*에서 뜨게 되고 6b도 같은 상태라 차집합이
#    **항상 0줄**이 된다 — 회귀를 잡으라고 만든 단언이 "같은 상태를 두 번 재고 통과"하는 no-op으로
#    강등된다(fail-open). 아래는 stash가 실제로 만들어졌는지를 확인하고, 아니면 멈춘다.
STASH_BEFORE=$(git rev-parse -q --verify refs/stash || echo none)
git stash push --include-untracked -m mccp-baseline
STASH_AFTER=$(git rev-parse -q --verify refs/stash || echo none)
[ "$STASH_BEFORE" != "$STASH_AFTER" ] || {
  echo "Validation 6 FAILED: stash가 생성되지 않았다 — 기준선이 우리 변경을 포함하므로 6b와의 차집합이 무의미하다."
  echo "  원인 후보: 변경이 이미 커밋됨(그렇다면 기준선은 머지 커밋에서 떠야 한다) · stash 권한/충돌 실패."
  exit 1
}
node --test plugins/mccp/scripts/**/tests/*.test.js 2>&1 \
  | grep -E '^not ok ' | sed 's/[0-9]\+//' | sort > $MCCP_TMP/baseline-fails.txt
git stash pop || {
  echo "Validation 6 FAILED: stash pop 실패 — 우리 변경이 stash에 갇혔다. git stash list로 확인 후 복구할 것."
  exit 1
}
#    6b. 우리 변경을 얹은 뒤 같은 방식으로 뜨고 차집합을 본다.
node --test plugins/mccp/scripts/**/tests/*.test.js 2>&1 \
  | grep -E '^not ok ' | sed 's/[0-9]\+//' | sort > $MCCP_TMP/after-fails.txt
comm -13 $MCCP_TMP/baseline-fails.txt $MCCP_TMP/after-fails.txt   # 0줄 = 신규 실패 없음
[ "$(comm -13 $MCCP_TMP/baseline-fails.txt $MCCP_TMP/after-fails.txt | wc -l)" -eq 0 ] \
  || { echo "Validation 6 FAILED: 기준선에 없던 신규 실패가 있다(위 목록)"; exit 1; }

# 7. 이연 항목이 (a) 실재하고 (b) 열린 채로 남아 있다 (Acceptance 6번의 기계 대응)
#
#    이전 판은 `grep -n "$s" file | grep -c RESOLVED  # 각 0` 이었는데 그것은
#    **vacuous**였다: $s가 파일에 아예 없으면 첫 grep이 빈 출력을 내고 둘째 grep -c가
#    0을 찍어 "통과"로 읽힌다. 즉 "등재됐고 열려 있다"와 "등재조차 안 됐다"가 같은 0으로
#    보고됐다 — 누락을 막으라고 만든 단언이 누락을 정확히 못 보는 형태였다(실측 확인:
#    존재하지 않는 키워드로 돌려도 0). 그래서 존재 단언을 먼저 세우고, 그 다음에
#    미해소를 단언한다. 두 개가 다 필요하다.
#
#    (b)의 전제: **해소 3건(B4·B5·B6)의 `RESOLVED-BY-IMPL` 행은 아래 10개 키워드를 언급하지
#    않는다.** 언급하면 그 줄이 "키워드를 포함하면서 RESOLVED를 포함하는 줄"이 되어, 이연 항목이
#    멀쩡히 열려 있어도 (b)가 붉어진다 — 판정이 등재 내용이 아니라 이웃 행의 문구에 좌우된다.
#    오늘은 충돌이 없다(B4=owner-only 주장 · B5=포트 추측 · B6=케이스 7 라벨화 — 셋 다 10개
#    키워드와 무관). Task 9가 행을 쓸 때 이 분리를 유지해야 한다.
BACKLOG=.claude/plans/codex-findings-backlog.md
FAIL=0
for s in canonicalPath SIGKILL CITATION_RE "record 슬러그 충돌" announceReuseRegistration \
         "register() 런타임 gitignore" "unreclaimed.json mode" assertSafeSessionId \
         "probeProcess 파싱 견고성" "realpath 폴백 symlink"; do
  n=$(grep -c -- "$s" "$BACKLOG" || true)
  [ "$n" -ge 1 ] || { echo "MISSING: $s"; FAIL=1; }                       # (a) 실재
  r=$(grep -- "$s" "$BACKLOG" | grep -c 'RESOLVED' || true)
  [ "$r" -eq 0 ] || { echo "CLOSED-BUT-DEFERRED: $s"; FAIL=1; }           # (b) 열림
done
#    **"정확히 10건"의 개수도 센다.** 위 루프는 10개 키워드가 각각 존재하는지만 보므로 11번째
#    이연이 몰래 끼어도 통과한다 — Task 9가 "정확히 10건"이라고 못박은 이상 그 수도 판정 대상이다.
#    이 날짜의 신규 이연 행(RESOLVED-BY-IMPL이 아닌 것)만 센다.
#    **기준 날짜를 `date +%Y-%m-%d`로 잡지 않는다.** Task 9가 backlog를 쓴 날과 이 블록이 도는
#    날은 같다는 보장이 없다(자정 경계, 하루를 넘긴 작업, 재검증 재실행). 어긋나면 오늘자 행이
#    0건이 되어 **10건이 전부 멀쩡히 있어도 실패**한다 — 방향은 fail-closed지만 구현과 무관한
#    실패라 Acceptance가 성립 불가가 된다($T4_FILES 결함과 같은 계열, L2 R9 invariant MEDIUM).
#    날짜는 Task 9가 **실제로 쓴 행**에서 읽는다: R3 행은 10건 중 하나이므로 그 행의 날짜가
#    이 배치의 날짜다.
BACKLOG_DATE=$(grep -F 'announceReuseRegistration' "$BACKLOG" 2>/dev/null \
  | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
if [ -z "$BACKLOG_DATE" ]; then
  echo "Validation 7 FAILED: R3 행에서 배치 날짜를 읽지 못했다 — Task 9 미수행이거나 행 형식이 'YYYY-MM-DD | …'가 아니다"
  FAIL=1
else
  # **`|| echo 0`이 아니라 `|| true`다.** `grep -c`는 0건일 때 이미 `0`을 출력하고 **동시에**
  # exit 1을 내므로, `|| echo 0`은 그 위에 `0`을 한 줄 더 얹어 값이 `"0\n0"`이 된다. 그러면
  # 아래 `$(( ))`가 `syntax error in expression`으로 깨져 이 단언이 판정 자체를 못 한다(실측).
  # 위 464·466행은 이미 `|| true`를 쓰고 있었다 — 같은 파일 안에서 관용구가 갈렸던 것이다.
  N_NEW=$(grep -c "^$BACKLOG_DATE .*|" "$BACKLOG" 2>/dev/null || true)
  N_RESOLVED=$(grep "^$BACKLOG_DATE .*|" "$BACKLOG" 2>/dev/null | grep -c 'RESOLVED-BY-IMPL' || true)
  [ "$((N_NEW - N_RESOLVED))" -eq 10 ] \
    || { echo "Validation 7 FAILED: $BACKLOG_DATE 자 신규 이연이 $((N_NEW - N_RESOLVED))건 — Task 9가 못박은 10건과 다르다"; FAIL=1; }
fi
[ "$FAIL" -eq 0 ] || { echo "Validation 7 FAILED"; exit 1; }

# 8. 환경 정책은 단언하지 않고 기록한다 (Acceptance 4번 참조)
node -e "console.log('MCCP_CODEX_DISABLED='+(process.env.MCCP_CODEX_DISABLED??'<unset>'))"

# 9. Task 12의 회수율 실측 — **이 자리가 없으면 지표는 관측되지 않는다.**
#    위 1번의 글롭 `tests/*.test.js`는 `tests/manual/…`을 잡지 않는다(POSIX 글롭에서 `*`는
#    디렉토리 구분자를 넘지 않는다). 그것은 "CI 상시 suite에 편입하지 않는다"는 Task 12의
#    의도이지만, 그 결과 **어느 Validation도 이 스크립트를 돌리지 않게 된다** — Acceptance
#    3번이 요구하는 관측이 실행 자리 없이 산문으로만 남는다. 명시적으로 따로 돌린다.
#    exit code만 보면 부족하다 — 스크립트가 `pidAlive`를 검사조차 않아도 0으로 끝날 수 있다.
#    그래서 Task 12 계약 3번이 요구하는 관측 줄의 **존재와 내용**까지 판정한다. 이 두 단언이
#    함께 있어야 "관측됐다"가 "스크립트가 죽지 않았다"와 구별된다.
SMOKE_OUT=$(node plugins/mccp/scripts/lib/tests/manual/session-process-reclaim-smoke.js) \
  || { echo "Validation 9 FAILED: smoke 스크립트가 비영점 종료"; echo "$SMOKE_OUT"; exit 1; }
echo "$SMOKE_OUT"
echo "$SMOKE_OUT" | grep -q '^RECLAIM_OBSERVATION ' \
  || { echo "Validation 9 FAILED: 관측 줄(RECLAIM_OBSERVATION) 부재 — Task 12 계약 3번 미이행이므로 지표는 관측되지 않았다"; exit 1; }
#    **스크립트의 자기 보고를 믿지 않는다.** 아래는 관측 줄에서 pid를 꺼내 이 셸에서 직접
#    `process.kill(pid, 0)`으로 생사를 확인한다 — 아무 일도 안 하고 기대 JSON만 찍는 구현은
#    `pid`가 없거나(형식 위반) 살아 있는 pid를 싣거나(불일치) 이미 죽은 남의 pid를 싣는 수밖에
#    없는데, 앞 둘은 여기서 걸린다. 이것이 "출력 형식 검사"와 "실제 회수 검사"를 가르는 지점이다.
echo "$SMOKE_OUT" | grep '^RECLAIM_OBSERVATION ' | sed 's/^RECLAIM_OBSERVATION //' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);
      if(o.pid_alive_after!==false){console.error("Validation 9 FAILED: pid_alive_after="+o.pid_alive_after+" — 회수되지 않았다");process.exit(1)}
      if(!(o.succeeded>=1)){console.error("Validation 9 FAILED: succeeded="+o.succeeded);process.exit(1)}
      if(!Number.isInteger(o.pid)||o.pid<=0){console.error("Validation 9 FAILED: 관측 줄에 유효한 pid가 없다 — 독립 확인 불가");process.exit(1)}
      const { isPidAlive } = require(process.cwd()+"/plugins/mccp/scripts/receipt/evidence-lock");
      const alive = isPidAlive(o.pid);   // 정본 재사용 — EPERM→alive 의미론을 여기서 다시 짜지 않는다
      if(alive){console.error("Validation 9 FAILED: pid "+o.pid+" 가 아직 살아 있다 — 스크립트 보고와 실제가 어긋난다");process.exit(1)}
      console.log("회수 관측 OK (표본 "+o.attempted+"건, pid "+o.pid+" 독립 확인됨)")})' \
  || exit 1

# 10. Task별 Validate 중 기계화 가능한 것을 실제로 돌린다 (위 서문 참조).
#     Task 3·4·5·6·7·9·10의 단언이 여기 있다. Task 1·2는 1~6번이 이미 덮고,
#     Task 8·11·12는 각각 Validation 7·Acceptance·Validation 9가 덮는다.
V10_FAIL=0
v10() { # v10 <설명> <실제값> <기대값>
  [ "$2" = "$3" ] || { echo "Validation 10 FAILED [$1]: got '$2', want '$3'"; V10_FAIL=1; }
}
# Task 3 — escalate_pending은 Task 9가 해제한다. 여기서는 최종 상태만 본다(Acceptance 8번과 동일 축).
# `grep 'santa-loop' >= 1`은 너무 느슨하다 — 고치기 **전** STATE.md에도 그 낱말이 있으므로
# Task 3을 건너뛰어도 통과한다. 고쳐진 상태에서만 참인 조건을 본다: "대기"가 사라지고
# 완주 서술이 들어왔는가. Task 9의 escalate 해제가 Task 3 없이 일어나면 여기서 잡힌다.
v10 "Task3/santa-loop 대기 서술 제거" "$(grep -c 'santa-loop.*대기\|대기.*santa-loop' .claude/state/STATE.md)" "0"
v10 "Task3/완주 서술 존재" "$([ "$(grep -c 'R1~R10\|운영자 종료' .claude/state/STATE.md)" -ge 1 ] && echo ok)" "ok"
v10 "Task3/stale 버전 서술" "$(grep -c 'v1\.24\.0' .claude/state/STATE.md)" "0"
# Task 4 — 대상 세 파일. **정의가 첫 사용보다 앞서야 한다.** 이전 판은 바로 아래 "anchor
# 미래형 표지" 단언이 $T4_FILES를 쓰고 그 *다음* 줄에서 정의했다. 0번의 `set -u` 아래에서
# 그 확장은 서브셸을 죽이고(실측: `unbound variable`), 단언은 빈 문자열을 받아 **Task 4를
# 옳게 수행해도 항상 실패**한다. 방향은 fail-closed다 — 부모 셸은 살아남아 나머지 단언이
# 정상 실행되고 V10_FAIL=1로 Validation 10이 exit 1하므로 잘못된 것이 통과하지는 않는다.
# 실제 피해는 유출이 아니라 **Acceptance가 성립 불가**라는 것이었다.
T4_FILES=".claude/state/STATE.md .claude/PRPs/reports/session-process-reclaim-report.md .claude/state/fix-task-applied.md"
# Task 4 — anchor 자리표시자. 경로가 아니라 **기입 주체**를 적는다(위 Task 4 Action (ii)).
# **조건부다 — 바로 아래 형제 단언과 같은 이유로.** 이 블록은 출하 후 재실행된다(Acceptance
# "머지 후 재검증"). Task 11 Action 2은 receipt가 실재하게 된 뒤 자리표시자를 실제 경로로
# **치환**하므로 출하 후에는 자리표시자가 0건인 것이 옳은 상태이고, 그 Task의 Validate는 실제로
# `-eq 0`을 요구한다. 무조건 `-ge 1`을 요구하면 Task 11을 **정확히 수행한** 트리에서 이 단언이
# 붉어진다 — 같은 트리를 두 단언이 정반대로 판정한다. 형제 단언은 이미 이 이유로 조건부인데
# (그 주석: "무조건 0을 요구하면 옳은 상태를 붉게 만든다") 그 처방이 자기 자신에게는 적용되지
# 않았다. "구현이 옳아도 항상 실패"의 네 번째 사례다($T4_FILES 정의 순서 · $TARGET 블록 경계 ·
# bc 부재에 이어, L2 R12 security MEDIUM). 판정 축을 receipt 실재 여부로 갈라, 출하 **전**에는
# 자리표시자의 존재를, 출하 **후**에는 그 소멸을 요구한다.
v10 "Task4/anchor 자리표시자" \
  "$(if ls .claude/receipts/mccp-pr-codex/*session-process-reclaim* >/dev/null 2>&1; then \
       [ "$(grep -rhF 'ANCHOR-PENDING(Task 11)' $T4_FILES | wc -l)" -eq 0 ] && echo ok; \
     else [ "$(grep -rhF 'ANCHOR-PENDING(Task 11)' $T4_FILES | wc -l)" -ge 1 ] && echo ok; fi)" "ok"
# Task 4 — 소실 가능 아티팩트 참조는 전부 소실 주석과 짝을 이룬다(hit 수 일치).
# **총계 대조가 아니라 줄 단위로 본다.** 총계만 맞추면 참조는 100행에, 주석은 200행에 두어도
# 통과하고, 독자는 "어느 참조가 근거 없는지"를 여전히 알 수 없다 — 그 구분이 이 Task의 목적이다.
# 그래서 "참조를 담은 줄" 중 "같은 줄에 소실 주석이 없는" 줄이 0건임을 단언한다.
# **frontmatter 구간은 제외한다.** `.claude/state/fix-task-applied.md` 12행의 hit은 YAML 리스트 값이라 같은 줄에
# 주석을 붙이면 값이 오염된다(Task 4 예외 규칙). 제외하지 않으면 이 단언이 파일을 깨는 편집을
# 강제한다 — 단언이 옳은 구현을 막는 것이 아니라 **틀린 구현을 요구하는** 형태다(L2 R13 invariant
# MEDIUM). `awk`로 첫 `---`~두 번째 `---`를 걷어낸 본문만 센다.
body_only() { for f in $T4_FILES; do awk 'NR==1&&/^---$/{fm=1;next} fm&&/^---$/{fm=0;next} !fm' "$f"; done; }
v10 "Task4/참조:주석 같은 줄 짝(본문)" \
  "$(body_only | grep 'mccp-plan-codex\|mccp-implement-codex' | grep -vc 'working-tree only · 소실됨')" "0"
# frontmatter 축은 **별도로** 판정한다 — 제외했다고 방치하면 그 참조가 무표시로 남는다.
v10 "Task4/frontmatter 소실 표기" \
  "$([ "$(grep -c 'originating_receipts는 working-tree only · 소실됨' .claude/state/fix-task-applied.md)" -ge 1 ] && echo ok)" "ok"
# Task 4 — 소실 아티팩트의 **내용 단정**도 완화됐다(L2 R13 invariant HIGH). 존재 주장만 지우고
# 값을 사실처럼 남기면 대조 불가능한 단정이 그대로 산다.
v10 "Task4/내용 단정 완화" \
  "$([ "$(grep -c '대조 불가' .claude/state/STATE.md)" -ge 1 ] && echo ok)" "ok"
# Task 4 — **아직 실재하지 않는 receipt 경로를 가리키지 않는다** (L2 R8 architect HIGH).
# git-tracked 파일이 Task 4 시점에 `mccp-pr-codex/<slug>.json`을 적으면 그 줄은 Task 11의
# 성공에 의존하고, 출하가 중단되면 영구히 거짓 참조로 남는다. 경로 기입은 Task 11 Action 2이
# receipt 생성 **뒤에** 수행하므로 여기서는 그 부재를 단언한다.
# **조건부인 이유**: 이 블록은 출하 후 재실행될 수 있다(Acceptance의 머지 후 재검증). receipt가
# 이미 실재하면 경로 참조는 정상이므로 무조건 0을 요구하면 옳은 상태를 붉게 만든다.
v10 "Task4/미실재 receipt 경로 미참조" \
  "$(if ls .claude/receipts/mccp-pr-codex/*session-process-reclaim* >/dev/null 2>&1; then echo ok; \
     else [ "$(grep -rh 'mccp-pr-codex/' $T4_FILES | wc -l)" -eq 0 ] && echo ok; fi)" "ok"
v10 "Task4/stale 지시 제거" "$(grep -c 'receipt를 다시 쓰지 말 것' .claude/state/STATE.md)" "0"
v10 "Task4/stale 버전 서술" "$(grep -c '1\.23\.11\|1\.24\.0' .claude/PRPs/reports/session-process-reclaim-report.md)" "0"
# Task 5 — 라벨이 실제 test 이름과 일치.
# 두 축을 **모두** 본다. test 파일만 grep하면 그 파일은 이 Task가 만들지 않은 선재 파일이라
# **Task 5를 전혀 수행하지 않아도 통과**한다 — 단언이 자기 Task와 무관한 것을 재고 있었다
# (L2 R13 test LOW). Task 5의 산출물은 *plan 문서의 라벨*이므로 그쪽을 판정 축으로 세우고,
# test 실재는 그 라벨이 가리키는 대상이 있는지 확인하는 보조 축으로 남긴다.
v10 "Task5/identity 7 test 실재" \
  "$([ "$(grep -c 'identity 7' plugins/mccp/scripts/lib/tests/session-processes-reclaimable.test.js)" -ge 1 ] && echo ok)" "ok"
v10 "Task5/plan 라벨 기입" \
  "$([ "$(grep -c 'identity 7' .claude/plans/session-process-reclaim.plan.md)" -ge 1 ] && echo ok)" "ok"
# Task 6 — pid 산술 0건(주석 제외) + freePort 4건 증가는 아래 절대값으로 고정한다.
v10 "Task6/pid 산술 잔존" "$(grep -c '^[^/]*process\.pid %' plugins/mccp/scripts/lib/tests/dashboard-server.test.js)" "0"
# Task 7 — owner-only 주석이 win32를 주장하지 않는다.
v10 "Task7/win32 주장 제거" "$(grep -n '0o700\|0o600' plugins/mccp/scripts/lib/session-processes.js | grep -ci 'win32\|windows\|ACL')" "0"
# Task 9 — 해제는 R3 행이 실재한 뒤에만. 순서가 아니라 **최종 상태**를 본다(순서 강제는 guard 소관).
v10 "Task9/R3 행 실재" \
  "$([ "$(grep -cF 'announceReuseRegistration' .claude/plans/codex-findings-backlog.md)" -ge 1 ] && echo ok)" "ok"
v10 "Task9/escalate 해제" \
  "$(node -e "const sw=require('./plugins/mccp/scripts/state/state-writer');const s=sw.readState(process.cwd());process.stdout.write(String(!!(s.frontmatter&&s.frontmatter.escalate_pending)))")" "false"
# Task 10 — §3.7 정정.
v10 "Task10/5면 서술 제거" "$(grep -c '동기 대상 5면' CLAUDE.md)" "0"
v10 "Task10/i18n 서술 존재" "$([ "$(grep -c 'i18n-surface.test.js' CLAUDE.md)" -ge 1 ] && echo ok)" "ok"
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md \
  || { echo "Validation 10 FAILED [Task10/contract lint]"; V10_FAIL=1; }
[ "$V10_FAIL" -eq 0 ] || { echo "Validation 10 FAILED"; exit 1; }
```

**전체 suite의 선재 실패는 기준선으로 관리하며, 그 절차는 위 6a/6b가 전부다.** 직전 사이클이 임시 worktree(merge-base) 대조로 확정한 선재 4건 — `b2-coverage-gate` 2건 · `ecc-context-monitor` Axis B (f) · `perf-budget` flake — 는 이 plan의 소관이 아니다. Task 1의 머지로 main의 test가 들어오므로 **기준선을 머지 직후에 다시 뜬다**. "머지 후에 다시 뜬다"고 말만 하고 명령을 안 주면 구현자가 매번 다른 방식으로 뜨게 되고, 그러면 차집합이 의미를 잃는다. 6a가 stash로 우리 변경을 잠시 걷어내는 이유가 그것이다 — 기준선과 사후가 **같은 명령·같은 정규화**를 거쳐야 비교가 성립한다. `perf-budget`은 flake라 6b가 한 번 붉으면 재실행으로 판별한다.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **머지가 main 신규 파일 102개 중 일부를 조용히 삭제** | Medium | §3.5.1 실측 사고(PR #110)와 동형. Task 1 Validate 2단(삭제 목록 + base 대조)이 기계적 검출. 충돌은 파일 단위 해소, 디렉토리 통째 취함 금지 |
| 머지 후 전체 suite에 main발 실패가 섞여 회귀 판정이 흐려짐 | High | 머지 **후** 기준선을 다시 뜨고 그 시점 이후만 회귀로 본다. 머지 전 기준선을 재사용하지 않는다 |
| 상향한 target이 ship 전에 main에 또 선점됨 | Medium | §3.7이 "실측 3회 재발"로 기록한 패턴. 완화가 Risks 산문에만 있으면 실행되지 않으므로 **Task 2 1단계(번호를 그때 결정)와 Task 11(진입 직전 재확인)이라는 두 실행 지점에 편입**했다. 선점 시 4면 재상향 + PR title 재확인 |
| `escalate_pending` 해제가 실제로는 미완료 escalation을 지우는 것 | Low | 해제 근거는 git log의 santa-loop R2~R10 커밋 + 보고서의 라운드별 흡수 기록 + 이미 소비돼 삭제된 `fix-task.md`. 셋이 서로를 뒷받침한다. 하나라도 어긋나면 해제하지 않는다 |
| Task 7의 문서 정정이 실제 보호를 약화한 것으로 오독됨 | Low | 코드는 무변경이고 주장만 좁힌다. 커밋 메시지와 backlog 행에 "동작 무변경, 주장 범위 정정"을 명시 |
| PR 게이트의 Codex 경로가 환경에 따라 갈린다 | Medium | **저장소 밖 값에 의존한다.** `MCCP_CODEX_DISABLED=1`은 프로젝트 `.claude/settings.json`이 아니라 **user-level `~/.claude/settings.json`**에 있고(작성 시점 live 환경에서 `1`로 실측), 저장소에는 그 값을 고정할 곳이 없다. 따라서 이 plan은 receipt가 어느 모양이 될지 **단언하지 않는다** — Validation 8이 관측값을 기록만 하고, Acceptance는 env 무관 조건으로 쓴다. 켜져 있으면 §1.2 v1.23.5의 `codex_disabled_at_pr` env-policy ship 경로, 꺼져 있으면 PR-Codex가 실제 발화한다. **둘 다 정상 경로다** |
| receipt로 anchor되지 않은 cross-model 심사를 근거로 삼음 | Medium | santa-loop R1~R10의 증거는 **git log 커밋 + 보고서 서술뿐**이고, 그것을 봉인했을 `mccp-plan-codex`/`mccp-implement-codex` receipt는 §3.12 계약상 working-tree only라 이미 소실됐다(A6). 그러므로 이 plan은 "cross-model 심사가 끝났으니 PR-Codex는 형식"이라고 **주장하지 않는다**. 감사 대조가 가능한 유일한 cross-model 기록은 이번에 처음 쓰이는 `mccp-pr-codex` receipt이며, 그것이 Task 11의 산출물이다 |

## Acceptance

- [ ] Task 1~12 완료
- [ ] **Validation 1~10 통과** — 그리고 **Task 1~12 각각의 `Validate` 항목도 통과**. 둘은 다른 표면이다(§Validation 서문): 전역 블록은 교차 관심사를, Task별 Validate는 그 Task 고유의 단언을 갖는다. Validation 10이 후자 중 기계화 가능한 것을 실제로 돌리므로 "산문으로만 존재하는 단언"은 남지 않는다. 전체 suite는 **6a 기준선** 대비 신규 실패 0(차집합 0줄)
- [ ] **PRD 1차 지표가 관측됐다** — Task 12가 실물 프로세스 1건에 대해 `pidAlive(pid)===false`를 확인하고 그 결과를 보고서에 기록. 표본 1이라고 명시하며, 이 항목이 없으면 PRD의 `[primary] 회수율`은 출하 후에도 여전히 미관측이다
- [ ] **머지 후 재검증**: PR이 main에 머지된 뒤 main에서 reclaim 5 suite를 1회 재실행해 0 fail. 파일 존재(`git ls-tree`)는 존재 확인이지 동작 확인이 아니다 — 충돌 해소가 test를 조용히 퇴행시켰다면 그것은 여기서만 잡힌다
- [ ] 패턴을 재발명하지 않고 미러링 (`freePort()`·state-writer API·§3.7 forward-only)
- [ ] **게이트/경로를 실제로 1회 완주하고 산출물을 확인한다.** 완주 정의는 Task 11의 Validate 3개와 동일하다: (a) `gh pr list --head session-process-reclaim`이 1건 이상, (b) `.claude/receipts/mccp-pr-codex/`에 이 decision의 receipt가 존재, (c) ship 판정이 no-ship이 아님. **단위 test 통과는 이 항목을 대신하지 않는다** — 이 작업의 최대 잔여가 바로 "test는 전부 녹색인데 출하되지 않았다"였다.
  - **receipt의 Codex verdict *값*은 조건에 넣지 않는다.** 이전 판은 `resolution.codex_verdict='skipped'` ∧ `meta.codex_disabled_at_pr=true`를 요구했는데, 그 값은 저장소 밖 user-level 설정(`MCCP_CODEX_DISABLED`)이 결정하고 이 plan은 그것을 수립하지도 검증하지도 않는다. 저장소가 통제하지 않는 값을 acceptance에 박으면, 그 env가 없는 환경에서는 **모든 것이 옳아도 통과할 수 없는 조건**이 된다. 관측은 Validation 8이 한다.
  - **그렇다고 verdict를 통과시키는 것은 아니다.** divergent/critical/unavailable을 막는 것은 이 plan의 acceptance가 아니라 **ship gate 자체**다 — `pr-ship-gate.js#deriveShipDecision`이 no-ship을 내면 finalize가 `exit 12`, validate가 `--check-ship-verdict`로 mechanical HALT한다(§1.2 M3). acceptance가 verdict 값을 재선언할 필요가 없는 이유가 그것이고, 재선언하면 env 의존이 되돌아온다.
  - **닫아야 할 진짜 구멍은 그 게이트의 유일한 우회로다.** 그래서 env 무관 조건 하나를 추가한다: `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`가 **사용되지 않았을 것** — `node -e "…"`로 receipt에 `pr_codex_force_override` 계열 키가 없음을 단언한다. 이것은 저장소가 통제하는 값이고, 이 조건이 있어야 "ship 판정이 no-ship이 아님"이 *게이트를 통과했다*는 뜻이 되지 *게이트를 우회했다*는 뜻이 되지 않는다.
- [ ] `git ls-tree origin/main -- plugins/mccp/scripts/lib/session-processes.js`가 **비어 있지 않다**(= main에 도달) — PR 머지 후 확인
- [ ] **`escalate_pending`이 최종적으로 `false`/미출력이고, 그 앞에 R3 backlog 행이 실재한다.** Task 9의 guard는 실패 시 조용히 넘어갈 수 있으므로(`|| exit 1`은 그 서브셸만 끝낸다) 최종 상태를 Acceptance에서 한 번 더 읽는다 — 해제되지 않았다면 Task 9가 미완이다
- [ ] **버전 충돌 게이트가 실제로 돌았다 — 기억이 아니라 산출물로 판정한다.** Task 11 Action 블록이 `$(git rev-parse --git-path mccp/tmp)/version-gate.txt`에 `version gate OK: branch=<X> main=<Y>`를 남겼고, `<X>`가 **현재** `plugin.json`의 version과 일치하며 `<X> != <Y>`다. 이전 판은 "PR 생성 전에 수행됐고 참이었다"를 사람이 확인하게 했는데, Acceptance는 Task 11과 다른 셸에서 돌아 확인할 대상 자체가 없었다(L2 R12 invariant MEDIUM). branch version 일치까지 보는 이유는 **stale 아티팩트 차단**이다 — 게이트 통과 후 main 선점으로 4면을 재상향했다면 그 파일은 옛 번호를 가리키므로 게이트를 다시 돌려야 한다. 다음 한 줄이 그 판정이다:
  ```bash
  VG="$(git rev-parse --git-path mccp/tmp)/version-gate.txt"
  [ -s "$VG" ] || { echo "Acceptance FAILED: version-gate.txt 부재 — Task 11 게이트가 돌았다는 증거가 없다"; exit 1; }
  VG_BRANCH=$(sed -n 's/^version gate OK: branch=\([^ ]*\) main=\(.*\)$/\1/p' "$VG")
  VG_MAIN=$(sed -n 's/^version gate OK: branch=\([^ ]*\) main=\(.*\)$/\2/p' "$VG")
  NOW_V=$(node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)")
  [ -n "$VG_BRANCH" ] && [ "$VG_BRANCH" = "$NOW_V" ] && [ "$VG_BRANCH" != "$VG_MAIN" ] \
    || { echo "Acceptance FAILED: version-gate.txt가 stale이거나 판정이 성립하지 않는다(gate branch='$VG_BRANCH' main='$VG_MAIN' 현재='$NOW_V')"; exit 1; }
  ```
  이 축을 `/mccp:pr` Phase 0에 기계 통합하는 것은 **범위 밖**이다 — 사유는 §Rejected Findings 참조
- [ ] 이연 항목이 backlog에 **실재하고 열린** 채로 남아 있다 — 사람 확인이 아니라 **Validation 7의 차집합 단언**이 판정한다 (santa-loop R7 교훈: 닫힌 항목을 가리키는 이연은 이연이 아니라 소실)

## Rejected Findings (검토 후 기각 — 재제기 방지)

아래는 L2 패널이 제기했으나 **증거를 대조한 결과 수용하지 않은** 것이다. 기각 사유를 남기는 이유는 다음 라운드가 같은 축을 다시 blocking으로 올리는 것을 막기 위해서다.

- **"Acceptance가 Task 11이 만드는 receipt를 요구하므로 승인 시점에 검증 불가 — 순환 게이트"** (invariant R4, CRITICAL). **기각.** Acceptance는 승인 시점 조건이 아니라 **구현 완료 후 판정 조건**이다. `/mccp:plan` 명령 본문의 산출물 템플릿 자체가 마지막 항목으로 "게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)"을 요구하며, 그 문장은 정의상 plan 승인 이후에만 만족될 수 있다. 이 논리를 받아들이면 **어떤 plan도 출하 산출물을 acceptance에 넣을 수 없고**, 그것은 이 milestone이 존재하는 이유("test는 녹색인데 출하되지 않았다")를 정면으로 되돌린다. plan 승인 게이트는 L1+L2이고 acceptance는 그 뒤의 축이다.
- **"소실된 receipt를 문서화만 하는 것은 게이트를 'receipt 필수'에서 'receipt 없음을 기록'으로 강등한 것"** (invariant R4, CRITICAL). **기각 — 대안이 금지돼 있기 때문이다.** 함의되는 대안은 receipt 복원인데, `mccp-plan-codex`는 §3.13대로 **CLI 표면을 갖지 않는다**(플래그를 만들면 셸 호출자가 Codex 없이 승인 verdict를 찍을 수 있어 구조적으로 차단됐다). 그러므로 손으로 쓴 receipt는 증거 복원이 아니라 **증거 위조**이며, 그것이야말로 §3.12가 no-rehash 불변식으로 막는 대상이다. 게이트가 강등된 것이 아니라 **그 게이트가 보호하던 세션이 이미 끝났고 진단 아티팩트가 계약대로 소멸한 것**이다. 앞으로의 anchor는 Task 11의 git-tracked `mccp-pr-codex` receipt다(Task 4에 명시).
- **"`identity 7` test가 구현에 존재하지 않는다"** (test R4, CRITICAL/HIGH). **기각 — 실측으로 반증됨.** `session-processes-reclaimable.test.js:425`에 `test('identity 7 — MCCP_RECLAIM_IDENTITY_TOLERANCE_MS moves UP only', …)`로 존재한다. 리뷰어의 grep이 빈 결과를 낸 것은 **이 plan이 인용한 파일 경로가 틀렸기 때문**이고(그 지적은 옳아 Task 5에서 수정했다), test 부재의 증거가 아니다. 판정 축 test는 `session-processes.test.js`가 아니라 `-reclaimable` 파일이 소유한다.
- **"Acceptance가 승인 이후에만 만족되므로 이 게이트는 아무것도 막지 못한다 — 게이트가 아니라 사후 문서화"** (invariant R5, CRITICAL). **기각 — 관측으로 반증된다.** 승인 게이트는 Acceptance가 아니라 **L1+L2**이고, 그 게이트는 이 plan을 **실제로 두 번 막았다**: R4가 `876d2a5f…`를 divergent로 세우고(halt 5.2e), R5가 `398d3cb0…`를 다시 divergent로 세웠다(`.claude/reviews/plan-review-session-process-reclaim-followup.md`의 `## Measurement` 블록이 두 halt를 기계 기록으로 갖고 있다). 두 경우 모두 `mccp-plan-codex` receipt가 작성되지 않아 `/mccp:prp-implement`가 진입 불가였다. "차단할 수 없는 게이트"라는 서술은 그 서술을 담은 문서 자체가 차단의 산물이라는 점에서 성립하지 않는다. Acceptance는 **구현 완료 후 판정 조건**이라는 다른 축이며, `/mccp:plan` 명령 본문의 산출물 템플릿이 마지막 항목으로 "게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)"을 **요구**한다 — 정의상 승인 이후에만 만족되는 문장이다. 이 지적을 수용하면 어떤 plan도 출하 산출물을 acceptance에 넣을 수 없고, 그것은 이 milestone이 존재하는 이유("test는 녹색인데 출하되지 않았다")를 정면으로 되돌린다.
- **"Task 11의 `evidence-audit.js --json`은 receipt/decision 인자가 빠져 실행 불가 — vacuous test"** (invariant R6, CRITICAL). **기각 — 실측으로 반증됨.** 그 도구의 usage는 `evidence-audit [--json] [--repo-root <path>]`(`evidence-audit.js:326`)로 **decision 인자를 애초에 받지 않으며**, 인자 없이 돌려 정상 종료했다(exit 0, `state=incomplete`, ledger 34 ↔ ship receipt 43 대조). 저장소 전역 ledger↔receipt 대조가 그 도구의 설계다. 다만 이 지적은 인접한 실제 부정확을 드러냈다 — plan이 그 전역 판정에 "그 decision에 대해"라는 수식을 붙여 도구가 하지 않는 일을 한다고 적고 있었다. Task 11 Validate를 (a) decision 단위 `resolution.codex_verdict` 와 (b) 전역 감사로 **분리**해 정정했다.
- **"Task 4가 참조를 지우지 않고 주석만 다는 것은 git에 거짓 anchor를 영구히 남기는 것"** (invariant R5, HIGH). **기각 — 제안된 대안이 더 큰 소실이다.** 두 가지가 뒤섞여 있다. (1) *git 이력*에 옛 줄이 남는 것은 이 Task가 무엇을 하든 바뀌지 않는다 — 이력은 소급 재작성 대상이 아니고(§3.12 no-rehash), 우리가 통제하는 것은 **현재 트리가 무엇을 주장하는가**뿐이다. (2) 현재 트리에서 문자열을 통째로 지우면 "그 게이트가 돌긴 했다"는 사실까지 사라져, 다음 세션은 심사가 아예 없었던 것으로 읽는다. `(working-tree only · 소실됨)` 병기는 **거짓 주장을 참인 주장으로 바꾸는** 조작이다 — "여기에 증거가 있다"에서 "여기서 돌았고 그 진단 아티팩트는 계약대로 소멸했다"로. 그리고 Task 4는 거기서 끝내지 않고 대체 anchor(Task 11의 git-tracked `mccp-pr-codex`)를 같은 문장에서 가리키도록 요구한다. 삭제가 아니라 **정정 + 대체 anchor 지시**가 이 상황의 옳은 처리다.
- **"버전 충돌 게이트를 `/mccp:pr` Phase 0에 기계 통합하라 — precondition은 게이트가 아니다"** (invariant R12, MEDIUM의 전반부). **절반 수용, 절반 기각.** 지적은 두 부분인데 성격이 다르다. **수용한 절반**은 "Acceptance에 산출물 증거가 없다"이고 사실이었다 — Action 블록이 stdout에만 찍어 다른 셸에서 도는 Acceptance가 대조할 대상이 없었다. `version-gate.txt` 아티팩트 + stale 판정으로 닫았다(Acceptance 해당 항목). **기각한 절반**은 `/mccp:pr` command body 개조다. 세 가지 이유다. (1) 그것은 이 plan이 출하하려는 코드가 아니라 **이미 출하된 게이트 명령**이고, 그 본문을 이 사이클에서 바꾸면 출하 대상이 둘이 된다 — §Out of Scope가 B1·하드닝 5건에서 이미 거부한 교환과 같은 형태다. (2) §3.7 버전 충돌은 **이 저장소의 모든 PR**에 걸린 축이므로 그 자동화는 이 plan이 아니라 §3.7이 스스로 "자동화 후보(v1.2.x cycle 부채)"로 열거한 항목이 소유한다. (3) "구현자가 블록을 건너뛰면 막지 못한다"는 논증 자체는 R11에서 CRITICAL로 제기돼 이미 기각됐다 — plan의 *모든* 지시에 참이고, 수용하면 어떤 plan도 승인될 수 없다. 다만 이번 라운드는 그 논증을 되풀이하는 대신 **증거 부재**라는 검증 가능한 형태로 좁혔고, 그 부분은 위처럼 반영했다.

- **"Task 11의 semver 검사 `case [0-9]*.[0-9]*.[0-9]*`가 `1..3`·`.2.3`·`1.2.`를 통과시킨다 — 손상된 plugin.json이 main에 도달할 수 있다"** (invariant R13, **HIGH**). **기각 — 실행으로 반증됨.** 주장의 전제가 "glob에서 `[0-9]*`는 숫자 0개 이상"인데, 그것은 **정규식 문법이지 glob 문법이 아니다**. glob의 `[0-9]`는 문자 클래스에서 **정확히 한 글자**를 소비하고 `*`는 그 뒤에 붙는 별개 항이다. 실측: `1.27.0` MATCH · `1..3` reject · `.2.3` reject · `1.2.` reject · `''` reject · `abc` reject · `1.2` reject. 지적한 세 케이스가 **전부 정지**한다. (패턴이 `1.2.3-beta`·`12x.3y.4z`를 통과시키는 것은 사실이나 무해하다 — 이 게이트의 판정은 `BRANCH_V != MAIN_V_NOW` 비교이고 양쪽이 같은 파서를 거치므로, 형태가 느슨해도 비교는 성립한다. 애초에 `plugin.json`이 손상되면 `require()`가 먼저 죽고 그 경로는 `|| exit 1`이 잡는다.)
- **"Task 11 Action 2이 slug 발견·치환의 구체 메커니즘(sed? glob? 파일별 검증?)을 명시하지 않는다"** (architect R13, MEDIUM). **기각 — 범주 오류.** plan은 *무엇이 참이어야 하는가*를 명세하고 구현이 *어떻게*를 정한다. 같은 형태의 요구("Task 12의 구현 코드가 plan에 없다")는 R11에서 이미 기각됐다. 더구나 slug는 미지수가 아니다 — `cli.js derive-decision --command mccp:plan --args <plan path>`가 결정론적으로 산출하며 이 plan이 그 명령을 여러 곳에서 쓴다. 그리고 Task 11 Validate는 치환 *절차*가 아니라 **결과**를 짝으로 단언한다: 자리표시자 0건 ∧ 기입된 모든 `mccp-pr-codex/…json` 경로가 **실재하는 파일**. 절차를 적어도 그 단언보다 강해지지 않고, 절차만 적고 결과를 안 보면 약해진다.
- **"Task 9 guard와 Validation 7의 날짜 불일치로 guard는 통과하고 검증은 실패할 수 있다"** (invariant R13, MEDIUM). **기각 — 이미 해소된 결함의 재제기.** 그 축은 R9에서 흡수 18(a)로 닫혔다. Validation 7은 `date +%Y-%m-%d`를 쓰지 않고 **R3 행 자신에서** 배치 날짜를 파생한다(`BACKLOG_DATE=$(grep -F 'announceReuseRegistration' … | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}')`). Task 9가 쓴 행과 검증이 읽는 날짜가 같은 출처이므로 자정 경계·재검증으로 어긋날 여지가 없다. 리뷰어가 근거로 든 "lines 501-506"은 결함이 아니라 **그 결함을 고친 주석 자체**다.

## Out of Scope (명시 이연 — 사유 포함)

이연은 "안 하겠다"가 아니라 "여기서 하면 출하가 더 늦거나 더 위험하다"이다. 각 항목은 `.claude/plans/codex-findings-backlog.md`에 **열린 채로** 남으며, **등재 자체는 Task 9가 수행하고 Validation 7이 개방 상태를 단언한다** — 이 절은 사유를 갖고, 기계 검증은 그 둘이 갖는다.

- **B1 — `isNodeInterpreterImage`가 basename만 본다** (MEDIUM). 진짜 해소는 등록 시 spawn 주체의 `process.execPath`를 레코드에 봉인하고 probe의 `execImage`와 대조하는 것인데, 이는 **13번째 필드 = schema 변경 + migration**이다. 출하 직전에 레지스트리 schema를 바꾸면 기존 레코드가 전부 `record_invalid`가 되고, 그 실패 모드는 이 사이클이 구현 중 이미 한 번 겪었다(allowlist가 깨져 회수 전멸). 별도 cycle.
- **B2 — 분리형 인터프리터 플래그 false negative** (MEDIUM). 방향이 fail-closed(회수를 놓칠 뿐 오살 아님)이고 mccp의 두 기동 형태(`node "<path>"` · `nohup node "<path>"`)는 분리형 플래그를 쓰지 않아 **오늘 영향 0**이다. 수정에는 값-소비 플래그 화이트리스트가 필요하고 그 목록이 틀리면 **반대 방향(과다 skip)으로 오살 위험**이 생기므로, 영향 0인 항목을 위해 오살 위험을 새로 여는 교환이 된다.
- **B3 — reuse 레코드 무한 증가** (PARTIALLY-RESOLVED의 잔여). 남은 집합은 `session_pid=null`·cross-host 레코드인데, `isSiblingLive`가 그 둘을 fail-closed로 "사용 중"으로 읽는다. 즉 **그 레코드를 지우는 것이 곧 kill 허용**이며, 정리 작업이 조용히 오살 방향으로 작동한다. §D14의 판정 구조를 바꿔야 하므로 별도 cycle.
- **C — PR-Codex R3 (dashboard reuse fail-closed)** (HIGH, 제품 결정). **권고: 현재 표면화 설계를 유지하고 이연한다.** 근거는 §C에 적은 세 겹(기본값 `MCCP_RECLAIM_OUTLIVES=0` opt-in · loud 경고에 복구법 포함 · 명백한 수정 부재)이고, 특히 세 번째가 결정적이다 — "재사용 대신 자기 서버를 띄운다"는 `resolveSessionId`가 null일 때 **아무도 회수할 수 없는 미등록 프로세스**를 만들어 중단을 누수로 바꿀 뿐이다. 이 축의 진짜 해소는 PRD OQ1("dashboard 서버가 세션보다 오래 살아야 하는가")을 제품 질문으로 닫는 것이며 그것은 이 plan의 범위가 아니다. **사용자가 반전을 지시하면 이 항목은 Task로 승격되고 게이트를 재실행한다.**
- **fan-out이 새로 제기한 2건** — (i) `canonicalPath`(`:846-850`, ENOENT 시 `abs` 반환)와 `realpathNearest`(`:175-185`, 존재하는 최근접 조상까지 상향)가 **같은 파일 안에서 서로 다른 정규화 폴백**을 쓴다. 방향은 fail-closed(양쪽이 어긋나면 `cross_repo`로 읽혀 kill 안 함)이므로 오살 축은 아니나 일관성 부채다. (ii) SIGKILL로 SessionEnd를 건너뛴 세션의 레코드 중 **pid가 아직 살아 있는 것**은 SessionStart 스윕이 세기만 하고 purge하지 않아 B3와 같은 축으로 누적된다. 둘 다 backlog에 신규 등재한다(Task 없음 — 이 plan에서 고치지 않는다).
- **이 plan을 심사하다 발견한 L1 게이트 결함** (MEDIUM, 이 작업과 무관한 별도 축). `plan-review/l1-check.js:66`의 `CITATION_RE` 첫 문자 클래스가 `[A-Za-z0-9_]`라 **`.`을 포함하지 않는다.** 그래서 `` `.claude/plans/<name>.md:<N>-<M>` `` 형태의 인용에서 선행 점이 잘린 채 `claude/plans/<name>.md`로 캡처되고, 그것이 어느 base에서도 해석되지 않아 **실재하는 파일에 대해 `C6_UNRESOLVED_CITATION`이 발화한다**(재현 확인). 영향 범위는 dot-prefixed 경로를 line-range와 함께 인용하는 모든 plan — `.claude/` · `.github/` 등. 방향은 fail-closed(없는 인용을 통과시키는 것이 아니라 있는 인용을 막는다)라 안전하지만, 저자는 원인을 알 수 없는 게이트 실패를 만나고 회피책으로 line number를 지우게 된다(이 plan이 실제로 그렇게 했다). 수정은 문자 클래스에 `.`을 넣되 문장 끝 마침표를 삼키지 않도록 경계를 유지하는 것. **diverse-agent-review 소관이므로 여기서 고치지 않는다** — backlog에 등재만 한다(Task 9 신규 3번).
- **이 plan을 심사하다 발견한 두 번째 게이트 결함** (HIGH, 실제 발생·복구함). `plan-review/cli.js record`가 쓰는 파일명은 `.claude/reviews/plan-review-<DECISION_SLUG>.md`이고, `DECISION_SLUG`는 명령 args(=PRD 경로)에서 파생된다. 그래서 **같은 PRD 아래 두 번째 plan을 심사하면 첫 번째 plan의 기록을 덮어쓴다.** 이번 실행에서 실제로 원본(`session-process-reclaim`의 R6~R12 이력, 9829B)이 이 followup의 기록으로 교체됐고 `git checkout HEAD --`로 복구했다. `.claude/reviews/`가 git-tracked인 이유가 §3.8 worktree 정리보다 오래 살아남기 위함인데 이 경로가 정확히 그 목적을 파괴한다 — git-tracked가 아니었다면 복구 불가였다. 수정 방향은 파일명에 plan basename 또는 `reviewed_plan_hash` 앞자리를 섞는 것. **diverse-agent-review 소관**이라 여기서 고치지 않고 backlog에 등재하며(Task 9 신규 4번), 이 plan은 회피책으로 기록을 `-followup` 파일명에 둔다.
- **L2 패널 R2가 제기한 구현 하드닝 5건** (MEDIUM ×5 — Task 9 신규 6~10번). security 관점 4건(`.unreclaimed.json` 모드 런타임 단언 · `assertSafeSessionId` 전 경로 호출 강제 · `probeProcess` 파싱 견고성 · realpath 폴백 symlink 봉쇄)과 invariant 관점 1건(`register()` 런타임 gitignore 가드)이다. **지적은 전부 타당하고, 이 plan의 Task로 올리지 않는 이유는 세 가지다.** (1) 대상이 이 plan이 만든 코드가 아니라 **이미 구현·심사된 M1+M2 코드**다 — 이 plan의 범위는 그 코드를 출하하고 그것이 남긴 잔여를 정리하는 것이지, 새 하드닝 층을 얹는 것이 아니다. (2) 다섯 건 모두 **새 test 또는 새 런타임 가드**를 요구하며, 그중 `register()` 가드는 write 경로에 조건을 추가하는 **동작 변경**이다 — 출하 직전에 회수 경로의 동작을 바꾸는 것은 이 사이클이 §Out of Scope B1에서 이미 거부한 교환과 같은 형태다. (3) 방향이 전부 fail-safe다(오살을 새로 만들지 않고, 감사 표면을 덜 잠글 뿐). 그래서 **backlog에 재현 조건까지 적어 열린 채로 남기고**, 다음 cycle이 하드닝 축으로 묶어 처리한다. 이 판단이 틀렸다면 그것은 "backlog가 실재하지 않는다"가 아니라 "우선순위가 틀렸다"는 지적이어야 하고, Task 9 Validate가 실재성은 기계로 보증한다.
- **PRD 아카이브** (§3.11). PRD 전 milestone이 complete가 되는 시점은 이 M3가 닫힌 **뒤**다. 지금 옮기면 receipt의 `--plan` anchor가 끊긴다. ship 이후 `/mccp:archive-complete` 소관.
- **선재 red 4건** — `b2-coverage-gate` 2건 · `ecc-context-monitor` Axis B (f) · `perf-budget` flake. merge-base 대조로 선재 확정됐고 이 작업이 만든 것이 아니다.


## Design Critique

design signal 발화(`impeccable-detect` → `renderer/html.js` · `renderer/markdown.js` · `renderer/tests/i18n-surface.test.js`). SKILL first-step으로 `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints`를 읽고 critique retry loop을 돌렸다.

- round=0/2 · verdict=**CONVERGED** (`decideCritique`, findings 0건)
- 이 plan이 도입하는 렌더 표면 델타는 **버전 리터럴 치환 2줄뿐**이다 — `html.js:1419` page-foot과 `markdown.js:163` derived 줄의 `v1.26.0` → `v1.27.0`. 새 컴포넌트·레이아웃·위계·accent token은 0.

| Anchor | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | PASS | `<footer>`는 heading이 아니며 위계 무변경 |
| 강조색 화면당 1개 | PASS | `page-foot mono` — accent token 미사용, 무변경 |
| raw markdown marker 금지 | PASS | 치환 대상이 버전 리터럴뿐이라 신규 marker 도입 0 |
| 한 화면 항목 수 상한 | PASS | `list-of-N` 섹션 무변경 |

> 범위 밖 관찰(finding 아님, 고칠 plan 섹션이 없으므로 loop에 넣지 않는다): `markdown.js:163`이 출력하는 `_derived from .claude/ · v1.27.0_`은 STATUS.md를 **plain text 동등본**으로 읽을 때 밑줄이 그대로 보인다. 선재이며 이 plan이 도입하는 것이 아니다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 **어떤 impeccable 명령도 호출하지 않는다** — 아래는 구현자용 체크리스트다. 이 plan의 표면 델타가 버전 리터럴뿐이므로 실제로 필요한 행은 없을 가능성이 높다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |


---

## Multi-Perspective Fan-out (출처 주기 — 본문은 이 plan을 심사한 것이 아니다)

Phase 2.5 fan-out은 이 followup plan이 존재하기 **전에** 발화했고, 오라클에 넘어간 planPath는
`.claude/plans/session-process-reclaim.plan.md`(이미 출하 대기 중인 M1+M2 plan)였다. 그래서
findings의 줄 번호·Task 번호·섹션 참조는 **전부 그 문서**를 가리키며 이 plan과는 대조되지
않는다 — 대부분은 이미 구현·심사·흡수된 설계에 대한 것이다.

**이 plan이 실제로 흡수한 신규 항목은 2건이고, 그 소유처는 §Out of Scope의 `fan-out이 새로
제기한 2건`이다** — (i) `canonicalPath`(`:846-850`)와 `realpathNearest`(`:175-185`)의 정규화
폴백 불일치, (ii) SIGKILL로 SessionEnd를 건너뛴 세션의 live pid 레코드 누적. 둘 다 Task 9의
신규 이연 1·2번으로 backlog에 등재되고 Validation 7이 실재·개방을 단언한다.

원문 34건 + Meta-gaps + Patterns to mirror는 `.claude/reviews/archive/fanout-session-process-reclaim.md`에
**그대로 보존**했다. 여기서 뺀 것은 삭제가 아니라 귀속 정정이다 — 다른 문서를 가리키는 앵커를
이 plan 본문에 두면 리뷰어가 실재하지 않는 줄 번호를 대조하게 된다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
