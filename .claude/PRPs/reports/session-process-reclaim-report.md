# Implementation Report: session-process-reclaim M1+M2

## Summary

mccp가 띄운 장수 프로세스(dashboard 서버 · detached plan-codex-runner · win32 handoff `claude` 세션)를 세션 키와 함께 기록하는 레지스트리(M1)와, SessionEnd에서 **자기 소유만** 거두는 회수 경로(M2)를 구현했다.

설계 전체를 지배한 단일 지표는 PRD의 **오살 0**이다. 그래서 모든 판정이 fail-closed이고, 그 성질이 산문이 아니라 test다 — 주입한 killer가 받은 pid 집합을 기대 집합과 **정확히 일치** 단언한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Tasks | 11 | 11 완료 |
| Files Changed | 20 | 19 modified + 6 created (25) |
| 신규 test | 5 파일 | 4 신규 파일 + 기존 2 파일 확장 (신규 단언 60건) |
| Validation | 9 파일 + 4 구조 검사 | 전 항목 통과 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 레지스트리 코어 | 완료 | `.gitignore`가 실제로 첫 편집 — Validate 단언 (0)이 강제 |
| 2 | `isReclaimableBy` + `probeProcess` | 완료 | 판정표 **12행**(계획 11행 + 편차 1행, 아래 참조). santa-loop R3에서 `sibling_evidence_unreadable`이 추가돼 현재 **13행** |
| 3 | dashboard 자기등록 + reuse | 완료 | reuse 등록을 **두 분기 모두**에 배치(계획은 1곳만 지명) |
| 4 | plan-codex-runner 자기등록 | 완료 | lock 획득 직후 등록, 기존 `finally`에서 unregister |
| 5 | session-spawner handoff 등록 | 완료 | tmux 분기는 미등록 + 사유 주석 |
| 6 | `reclaimSession` | 완료 | probe memoize 추가(계획 외 — 아래 참조) |
| 7 | SessionEnd 결선 | 완료 | 반환값 소비 + 빈 catch 금지가 stderr 단언으로 잠김 |
| 8 | 오살 0 test | 완료 | 21건 — 실물 OS probe 포함 |
| 9 | 회귀 스캔 | 완료 | (a3) 그물 설계 변경(아래 참조) |
| 10 | 과거 고아 감지·보고 | 완료 | kill 없음 — Task 9(d)가 기계적으로 고정 |
| 11 | 릴리스 표면 | 완료 | 버전 상향(당시 목표 번호) + footer 2면 + CHANGELOG + ENVIRONMENT §11 + PRD. 실제 출하 번호는 M3에서 `1.27.0`으로 다시 밀렸다 — §3.7 forward-only |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Unit Tests | Pass | 아래 9개 파일 전부 green |
| 구조 검사 | Pass | kill 지점 봉인 · `hooks.json` 무변경 · 레지스트리 gitignored · 삭제 파일 0 |
| Build | N/A | 순수 Node, 빌드 단계 없음 |
| Integration | N/A | 통합 서버 없음 (dashboard 실서버 test는 unit suite 안에 있음) |
| Design Grounding | N/A (no design trigger) | `design_signal=false` · capture 미수행 → Phase 3.6/3.7 no-op |

**아래 블록은 최초 구현 시점(santa-loop 이전)의 기록이며 현재 상태가 아니다.** 특히 "win32 symlink skip"은 santa-loop R1에서 junction으로 **실제 실행되도록 바뀌어 더 이상 존재하지 않는다**. 현재 수치는 각 santa-loop 절의 "검증" 항목이 소유한다.

```
[HISTORICAL — santa-loop 이전]
session-processes.test.js              18 pass / 0 fail (2 skip: win32 mode·symlink)  ← symlink skip은 R1에서 제거됨
session-processes-reclaimable.test.js  23 pass / 0 fail (1 skip: win32 symlink)       ← R1에서 제거됨
session-processes-reclaim.test.js      21 pass / 0 fail
session-processes-spawn-sites.test.js   9 pass / 0 fail
dashboard-server.test.js               33 pass / 0 fail   ← 이전 13, 아래 Fixed 참조
session-spawner.test.js                15 pass / 0 fail
session-end-marker-reclaim.test.js      7 pass / 0 fail
session-end-trace.test.js               7 pass / 0 fail
i18n-surface.test.js                   10 pass / 0 fail
```

현재 남은 skip은 **1건뿐**이다 — `(3) file mode is 0600 …`, win32에서 POSIX mode bit이 의미를 갖지 않기 때문. 그 축의 보안 주장이 win32에서 test로 뒷받침되지 않는다는 지적(R5 suggestion)은 유효하며 backlog로 이연했다.

전체 suite에서 남은 실패 4건은 **전부 선재**다. merge-base(`3eabab2`)에 임시 worktree를 만들어 동일 실패를 실측 확인했다:

| 실패 | 판정 |
|---|---|
| `b2-coverage-gate` 2건 (`plan-codex-runner.js` 직접 rename vs PR #116 lint) | 선재 — merge-base에서 동일. 내 편집이 라인 번호만 248→249로 밀었다 |
| `perf-budget: 100 receipts …` | flake — 단독 실행 시 통과, 병렬 부하에서만 흔들림 |
| `ecc-context-monitor: Axis B (f)` | 선재 — merge-base에서 동일. require 체인에 내 변경 파일 0개 |

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/lib/session-processes.js` | CREATED |
| `plugins/mccp/scripts/lib/tests/session-processes.test.js` | CREATED |
| `plugins/mccp/scripts/lib/tests/session-processes-reclaimable.test.js` | CREATED |
| `plugins/mccp/scripts/lib/tests/session-processes-reclaim.test.js` | CREATED |
| `plugins/mccp/scripts/lib/tests/session-processes-spawn-sites.test.js` | CREATED |
| `plugins/mccp/scripts/hooks/tests/session-end-marker-reclaim.test.js` | CREATED |
| `.gitignore` · `plugins/mccp/scripts/lib/dashboard-server.js` · `plan-codex-runner.js` · `scripts/state/session-spawner.js` · `scripts/hooks/session-end-marker.js` · `session-start-trace-injector.js` | UPDATED |
| `plugins/mccp/scripts/lib/tests/dashboard-server.test.js` · `scripts/state/tests/session-spawner.test.js` | UPDATED |
| `plugin.json` · `renderer/html.js` · `renderer/markdown.js` · `CHANGELOG.md` · `docs/ENVIRONMENT.md` · PRD | UPDATED |

## Deviations from Plan

정직하게 다섯 건이다. 넷은 계획대로 구현하면 **기능이 조용히 죽거나 test가 유지 불가**해서 바꿨고, 하나는 계획이 못 본 오살 경로다.

### 1. 판정표에 12번째 행 `reuse_not_owner` 추가 (계획 11행)

계획의 표에는 `role`을 보는 행이 없다. 그런데 `MCCP_RECLAIM_OUTLIVES=1`이면 `lifetime_outlives_session`이 열리고, 형제 스윕은 `role:'reuse'` 레코드만 모으므로 **live 형제 세션이 들고 있는 `role:'owner'` 레코드는 아무도 대변하지 않는다.** 결과: dashboard 서버를 *빌려 쓰던* 세션 B가 종료하면서 소유자 A의 서버를 죽일 수 있었다 — UI2가 금지하는 바로 그 오살이다. 계획의 letter보다 **"오살 0"이라는 지표**를 택했다.

### 2. win32 probe 타임아웃 2000 → 5000ms (플랫폼 분기)

계획은 probe당 2s를 못박았다. 실측: `powershell.exe -Command Get-CimInstance`는 웜 ~1.0s, **콜드 ~2.9s**. 2s 상한은 §D15를 win32에서 **비결정적으로** 실패시키고, 실패는 전부 `identity_unverifiable`로 접혀 **회수가 조용히 전멸**한다. UI5가 우선으로 지정한 플랫폼에서 그렇다.

더 싼 `Get-Process`는 대안이 아니다 — `.Path`(= `node.exe`)만 주고 command line을 주지 않아 §D15 축 1의 전체경로 대조가 **구조적으로 불가능**하다. POSIX는 `ps`가 네이티브라 2000ms 유지.

### 3. `reclaimSession` 안에서 probe memoize (계획 외)

프로세스 시작 시각은 변하지 않으므로 재-probe는 새 정보 없이 예산만 태운다(win32에서 1건당 ~1s). **형제 스윕은 memoize하지 않았다** — §D11이 요구하는 kill 직전 재평가가 정확히 그 반대이기 때문이다. 두 축을 분리한 것이 요점이다.

### 4. Task 9 (a3)의 그물을 재설계

계획은 `spawn|spawnSync|execFile|execFileSync|exec|fork` 전 호출부를 `{file, line, disposition}`으로 전수 등재하라고 했다. 실측하니 **81파일 143 호출부**이고 대부분 동기 `git` 호출이다. 라인 번호를 박으면 그 위 어떤 편집에도 red가 되는데, 이는 **같은 계획이 (a)에서 라인 번호를 뺀 이유와 정면 충돌**한다.

대신 `detached:` 프로퍼티 + `.unref(` 로 그물을 좁혔다 — 7파일 + MD 1건. 볼륨은 작지만 (a)의 리터럴 `detached: true`보다 **넓고**, (a3)가 닫으려던 변수 간접 형태(`const opts={detached:true}`)를 정확히 포착한다. false positive 4건은 `not-a-process`로 사유와 함께 명시 등재했다(암묵 무시 없음).

### 5. dashboard reuse 등록을 두 분기 모두에

계획은 `bound.reused`(EADDRINUSE) 한 곳만 지명했으나, 실제 test가 구동하는 경로는 **PID 파일 재사용 분기**다. 둘 다 reuse를 반환하므로 양쪽에 등록했다.

### 부수: 계획이 요구한 plan 아카이브는 **하지 않았다**

command body는 `.claude/PRPs/plans/completed/`로 옮기라고 하지만, CLAUDE.md §3.11이 아카이브를 소유하며 목적지는 `archived/`이고 도구는 `/mccp:archive-complete`다. 게다가 지금 옮기면 receipt가 anchor하는 `--plan` 경로가 끊겨 PR 게이트가 깨진다. **ship 이후** `/mccp:archive-complete` 소관으로 남긴다.

## Issues Encountered

구현 중 test가 잡은 실결함 2건 — 둘 다 fail-**open** 방향이라 조용히 통과했을 것이다.

1. **`list()`가 record를 오염시켜 회수가 전멸했다.** `rec.alive = …`가 엄격 allowlist를 깨뜨려 모든 레코드가 `unknown_field:alive` → `record_invalid` → **전부 skip인데 `complete:true`로 성공 보고**. non-enumerable 프로퍼티로 고쳤고, 회귀 단언을 Task 1 (10)에 붙였다.

2. **`dashboard-server.test.js`가 19개 test를 조용히 안 돌리고 있었다(선재).** `tmpRepo()`가 `os.tmpdir()`의 8.3 단축명(`…\ADMINI~1\…`)을 그대로 써서 `attachWatch`의 `fs.watch`가 libuv assertion(`!_wcsnicmp`, `src/win/fs-event.c`)으로 **test 프로세스를 abort**시켰다. 리포터는 "13 tests, 12 pass"만 보여줘 나머지가 존재조차 하지 않는 것처럼 보였다. `realpathSync.native` 한 줄로 13 → **33 test**가 실제로 돈다. 계획이 이 파일에 단언을 추가하라고 지시했는데 그 단언이 win32에서 실행될 수 없었으므로 범위 안이다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `session-processes.test.js` | 20 | 스키마 12필드 · gitignore 선행 · mkdir/mode · symlink 봉쇄 · 강등 · 손상 JSON · 고아 스윕 5축 |
| `session-processes-reclaimable.test.js` | 24 | 판정표 전수 + 형제 liveness 3케이스 + §D15 정체 7케이스 (santa-loop에서 확장 — 현재 수치는 각 라운드 "검증" 항목 참조) |
| `session-processes-reclaim.test.js` | 21 | 오살 0 전 축 · 재평가 비-스냅샷 · 예산 · ESRCH/EPERM · **실물 OS probe** |
| `session-processes-spawn-sites.test.js` | 9 | 등록 누락 0 · `openBrowser` 비등록 · lifetime 리터럴 · kill 유일성 · 반환값 소비 강제 |
| `session-end-marker-reclaim.test.js` | 7 | 마커 → observer → 회수 순서 · 빈 catch 금지 · `complete:false` 소비 |
| `dashboard-server.test.js` (확장) | +1 | 자기등록 · reuse 레코드 · 소유자 레코드 바이트 불변 · close unregister |
| `session-spawner.test.js` (확장) | +3 | handoff 등록 · pid 부재 skip · tmux 미등록 |

## santa-loop Round 1 — cross-model 심사 흡수

Reviewer A(Claude Opus)는 11개 기준 전부 PASS·critical 0으로 판정했고, Reviewer B(Codex gpt-5.4)는 전부 FAIL·critical 4건으로 판정했다. **모델 다양성이 값을 했다** — B가 잡은 레지스트리 루트 탈출은 A가 놓쳤고, 실측으로 재현됐다.

각 지적을 코드로 검증한 뒤 3건을 수정하고 2건은 근거를 들어 거부했다.

### 수정 1 — 레지스트리 **루트** symlink 탈출 (B critical 3, 실측 재현)

`sealedSessionDir`은 세션 디렉토리를 레지스트리 루트에 대해서만 봉인했다. 루트 **자체**가 탈출이면 그 검사는 공허하게 통과한다: `realpathNearest(reg)`가 외부 타깃이 되므로 그 아래 모든 세션 디렉토리는 자명하게 "레지스트리 안"이다.

재현(수정 전): `.claude/state/session-processes`를 junction으로 만들고 `register()` → `{ok:true}`, 레코드가 repo 밖에 기록됨. **win32에서 junction은 elevation이 필요 없다** — 원 코드 주석이 상정한 "symlink는 권한이 필요하니 어렵다"는 전제가 틀렸다.

봉인을 repo 경계까지 끌어올렸다(`sealedRegistryDir` + read-only `containedRegistryDir`). 방향이 중요해서 세 소비처를 각각 다르게 처리했다:

| 소비처 | 처리 | 이유 |
|---|---|---|
| `reclaimSession` | 전체 거부 + `complete:false` | 소유권을 추론할 수 없는 레지스트리면 **아무것도 죽이지 않는 것**이 정답 |
| `list` | 빈 레코드 + `incomplete:true` | 심층 방어. 레코드 0 → kill 0 (fail-closed) |
| `scanForeignOrphans` | 거부 + 세션 디렉토리별 재검사 | 이 함수는 **unlink**한다 — 탈출을 따라가면 repo 밖 파일을 지운다 |

`collectSiblingReuse`만 막았다면 **fail-open**이 됐을 것이다(형제가 안 보임 = "사용 중" 레코드 감소 = kill 증가). 그래서 `list`가 먼저 거부하도록 순서를 잡았고, 그 근거를 코드 주석에 남겼다.

### 수정 2 — `MCCP_RECLAIM_BUDGET_MS` 무제한 (B critical 4)

hook은 `async:true, timeout:10`이라 세션 종료를 막지는 않는다. 하지만 예산이 10s를 넘으면 sweep이 hook timeout에서 중도 사살되고, **그때 사라지는 것이 부분 sweep의 유일한 증거인 `.unreclaimed.json`**이다. 상한 9000ms clamp + loud warn을 넣었다. 하향은 그대로 자유다 — 같은 파일의 `resolveIdentityToleranceMs`가 이미 쓰는 "안전한 방향으로만 움직인다" 패턴과 동형.

### 수정 3 — reuse 등록 실패가 조용했다 (B critical 1)

`registerServerReuse`의 반환값을 두 분기 모두 버렸다. 실패하면(가장 싸게는 세션 식별자 부재) 소유자의 `in_use_by_live_session` 가드가 **사라지고**, `MCCP_RECLAIM_OUTLIVES=1`에서 소유자가 사용 중인 서버를 SIGTERM한다. 빌리는 쪽에서 고칠 수 없는 상황(소유자는 다른 프로세스)이므로, **가드가 사라지는 순간 그 사실과 결과를 명시**하도록 했다. Task 9(f)와 같은 모양의 소스 스캔 `(g)`로 잠갔다.

### 부수 — R9 module-scope require

`dashboard-server.js`가 `session-processes`를 module scope에서 require했다. 그 바로 아래 주석은 "등록이 서버 부팅을 막을 수 없어야 한다"고 적혀 있는데, loader 단계에서는 그 주장이 거짓이었다. try 안으로 lazy화해 주장을 참으로 만들었다. `plan-codex-runner.js`도 같은 계열이라 함께 고쳤다(같은 결함을 옆에 두는 것이 더 나쁘다).

### 거부 1 — "주입 가능한 의존성이 소유권을 위조한다" (B critical 2, R2/R7)

`reclaimSession({kill, isAlive, probeProcess, sessionId, repoRoot})`를 호출할 수 있는 in-process 호출자는 **이미 `process.kill`을 직접 부를 수 있다.** 권한 상승이 아니므로 취약점이 아니다 — test seam이다. 프로덕션 유일 호출자인 SessionEnd hook은 `sessionId`를 env에서, `repoRoot`를 hook stdin(Claude Code가 주는 신뢰 입력)에서 얻고 나머지는 주입하지 않는다.

이 FAIL은 내가 쓴 루브릭 R2의 문구("어떤 주입도 판정을 약화시킬 수 없어야 한다")가 과도했던 결과다. 리뷰어는 루브릭을 정확히 적용했고, 루브릭이 틀렸다.

### 거부 2 — reuse 레코드 무한 증가 (B R5)

죽은 세션의 reuse 레코드를 지우면 `isSiblingLive`가 **fail-closed로 true를 반환하던 케이스**(`session_pid === null`, cross-host)의 차단이 풀린다. 즉 정리가 곧 **kill 허용**이다. 오살 0이 지배 지표인 이상 리뷰 수정 사이클에서 건드릴 축이 아니다. Codex도 이것만은 critical이 아니라 suggestion으로 분류했다. backlog 이연.

### R11 — R1에서 좁히고, R2에서 닫았다

R1에서는 경계 anchoring만 넣어 `<path>.bak` 류(**더 긴 토큰 안에 우리 경로가 들어앉는** 케이스)를 제거하고, 독립 인자 언급은 잔여로 선언했다. 근거는 "닫으려면 flag 뒤 경로를 거부해야 하는데 그러면 `node --enable-source-maps <path>`도 거부된다"였다. **그 근거가 틀렸다** — 거부 규칙을 flag 기준으로 세울 필요가 없었다. R2 절 참조.

139 tests / 138 pass / 0 fail. skip은 3 → **1**로 줄었다 — win32에서 skip되던 symlink test 2건을 **junction**으로 실제 실행시켰다(R10이 지적한 "priority 플랫폼에서 미검증"을 닫음). 남은 1건은 POSIX mode bit test로, win32에서 의미 자체가 없다.

## santa-loop Round 2 — 신규 리뷰어 2명

Reviewer A(Claude Opus) PASS·critical 0, Reviewer B(Codex gpt-5.4) FAIL·critical 2. 두 라운드 모두 B만 결함을 냈다. 루브릭의 R2/R7은 위협 모델을 명시하도록 교정했고(주입 가능한 의존성 = test seam), 그 결과 R1에서 나왔던 오탐 FAIL은 재발하지 않았다.

### 수정 4 — §D15 축 1을 실제로 닫았다 (B critical 1, R1/R11/R10)

B의 지적이 정확했다. 그리고 **내가 R1에서 붙인 test `identity 3d`가 그 결함을 "기대 동작"으로 못박고 있었다** — 고치면 red가 되는 test라, suite가 결함을 방어하는 모양이었다. 그 지적도 맞다.

R1의 판단 착오는 규칙의 축을 잘못 잡은 것이다. "flag 뒤 경로를 거부"가 아니라 **"우리 경로가 첫 script 토큰이고 node에 넘겨졌는가"**로 물으면 된다. 실제 기동 형태를 확인하니 둘 다 그 조건을 만족한다:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dashboard-server.js" $ARGUMENTS
nohup node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-codex-runner.js" …
```

`containsPathToken`(포함 검사) → `isExecutedScript`(**등가** 비교)로 교체했다. 세 조건: (1) 인용부호를 아는 tokenizer, (2) flag 모양 토큰을 건너뛴 **첫** script 토큰이 우리 경로와 **정확히 같을 것**, (3) 그 앞에 node 인터프리터 토큰이 있을 것.

(3)은 구현 중 test가 잡았다. (1)+(2)만으로는 `tail -f <ourpath>`가 통과한다 — 거기서도 우리 경로가 첫 script 토큰이기 때문이다. 정체 검증에 도달하는 프로세스는 구조상 전부 node 스크립트이므로(비-node인 `handoff-session`은 그 전에 제외됨) 인터프리터를 요구하는 것이 정당하다.

닫힌 것: `node other.js <path>` · `node other.js --input <path>` · `tail -f <path>` · `<path>.bak` · `/evil<path>`.

> **이 절의 "새 잔여" 서술은 R8에서 거짓으로 판명됐다 — 아래 수정 5로 대체됐다.** 당시 이 절은 잔여가 상대 경로 기동 하나뿐이라고 적었으나, 조건 (3)이 토큰 검사라 `grep node <path>`도 만족시킨다는 사실을 R7이 발견하고도 주석으로만 남겼고 이 절은 갱신되지 않았다. 아래 원문은 기록으로 보존한다.

~~새 잔여(더 좁고, 명시): **상대 경로 기동**이 `identity_mismatch`로 읽힌다.~~ 상대 토큰을 재anchor하려면 suffix 매칭을 허용해야 하는데 그것이 바로 전체경로 규칙이 막으려던 basename 충돌이다. 방향은 fail-closed이고 mccp의 두 기동 형태는 모두 절대 경로다. test `identity 3f`가 고정.

### 수정 5 — 고아 스윕의 침묵 (B R4)

`scanForeignOrphans`가 JSON parse 실패와 unlink 실패를 조용히 넘겼고, SessionStart 래퍼는 통째로 silent catch였다. **처리하지 못한 sweep이 처리할 것이 없던 sweep과 구별되지 않았다** — 그런데 그 구별이 정확히 PRD `:78`(무한 증가)이 돌아오는 경로다. 반환값에 `unreadable` · `purgeFailures`를 추가하고 각각 stderr에 이름을 남긴다. SessionStart catch도 stderr로 표면화한다(여전히 non-fatal).

### 수정 6 — tmp 이름 CSPRNG (B R3)

`writePrivate`의 nonce가 `Math.random()`이었다. 접미사의 존재 이유가 "미리 그 경로를 만들어 둘 수 있는 자에게 추측 불가"인데 `Math.random`은 그 주장을 지지하지 않는다. `crypto.randomUUID()`로 교체했다. `dashboard-server.js`의 pid 파일 tmp도 같은 형태라(선재) 함께 고쳤다 — 지적된 항목이고 한 줄이다.

### 수정 7 — 문서가 절대치를 주장했다 (B critical 2, R8)

CHANGELOG가 "다른 세션·…의 프로세스는 **절대** 죽이지 않는다"라고 달성 사실처럼 적어 놓고, 같은 문서 아래에서 유계 오살 창을 인정하고 있었다. 운영자가 회수를 켤 때 근거로 삼을 문장이므로 정정했다: 오살 0은 **목표**이고, 소유권 축은 결정적으로 닫히지만 프로세스 정체 축에 유계 잔여가 있다고 명시한다. PRD 지표 행에도 같은 단서를 달았다.

### 수정 8 — R5(레지스트리 무한 증가)를 안전한 만큼 닫았다

두 라운드 연속 지적된 축이다. R1에서는 "정리가 곧 kill 허용"이라며 통째로 이연했는데, 다시 보니 **안전한 부분집합이 있었다**.

소유 세션이 죽었음이 증명된 reuse 레코드(같은 호스트 ∧ 정수 `session_pid` ∧ 그 pid 죽음)는 `isSiblingLive`가 **이미** false를 반환하는 바로 그 분기다. 따라서 지워도 **어떤 회수 판정도 바뀌지 않는다** — 정책 변경이 아니라 garbage collection이고, 그 등가성이 안전성의 근거 전부다. Codex가 든 시나리오(장수 dashboard를 빌려 쓴 짧은 세션이 디렉토리를 하나씩 남김)가 정확히 이 집합이다.

`session_pid`가 null이거나 다른 호스트인 레코드는 **그대로 둔다**. 그것들이야말로 degraded 환경에서 쌓이는 것들이지만, 지우면 "쓰고 있는지 알 수 없다"가 "아무도 안 쓴다"로 바뀌어 kill을 승인한다. 유계 증가가 그보다 싸다. test (21)/(22)가 두 방향을 각각 고정한다.

R1의 이연 판단이 틀렸다기보다 **거칠었다** — "이 축은 위험하다"에서 멈추고 "위험하지 않은 부분이 있는가"를 묻지 않았다. R11과 같은 종류의 실수다.

### 검증 (R2 이후)

146 tests / 145 pass / 0 fail / 1 skip.

## santa-loop Round 3 — 상한 도달, 사용자 승인 하에 수정

Reviewer A PASS·critical 0, Reviewer B FAIL·critical 2. **세 라운드 내내 A는 PASS였고 B만 결함을 냈다.** A는 이 코드를 쓴 것과 같은 모델 계열이다 — 이 프로젝트가 cross-model dual review를 강제하는 이유가 그대로 드러난 결과다.

3라운드는 santa-loop의 상한이라 사양대로 push 없이 에스컬레이션했고, 두 결함을 **재현 스크립트로 확정**한 뒤 사용자 승인을 받아 수정 + 4라운드 검증으로 진행했다. (최초 재현 시도는 `node -e`에서 `__filename`이 `[eval]`이라 identity가 인위적으로 어긋나 둘 다 "재현 안 됨"으로 나왔다. 스크립트를 파일로 옮겨 다시 돌리자 둘 다 재현됐다 — 재현 실패를 그대로 믿었다면 실결함 2건을 반증으로 오판할 뻔했다.)

### 수정 9 — 읽기/삭제 경로의 session 디렉토리 봉인 (B critical 2)

`reclaimSession`은 레지스트리 **루트**만 검사하고, 이후 `list`·`dropRecord`·`markUnreclaimed`는 `sessionDir()`를 그대로 썼다. 등록 후 그 디렉토리가 repo 밖 junction으로 바뀌면 실측 결과 **pid를 kill하고 repo 밖 파일을 unlink**했다.

R1에서 `scanForeignOrphans`에는 디렉토리 단위 검사를 넣어 놓고 회수 경로에는 넣지 않은 **내 비일관성**이다. `containedSessionDir`로 두 층(루트 + 세션 디렉토리)을 함께 검사하고, `list`·`reclaimSession` 양쪽에서 쓴다.

TOCTOU는 **좁혔을 뿐 닫지 않았다**: 진입 시 1회가 아니라 **매 write/unlink 직전에 재검증**한다. Node의 동기 fs에는 이 창을 원천 차단할 fd-상대 API가 없으므로, 남는 창은 검사와 syscall 사이다. 실패 방향은 "아무것도 건드리지 않음"이다.

### 수정 10 — 읽을 수 없는 형제 증거가 가드를 지웠다 (B critical 1)

`collectSiblingReuse`가 읽기/파싱 실패를 조용히 건너뛰었다. 살아있는 borrower의 reuse 레코드가 손상되면 `MCCP_RECLAIM_OUTLIVES=1`에서 소유자가 공유 dashboard를 **SIGTERM**하고 `complete:true`로 보고했다.

R1에서 고친 것은 *쓰는 쪽*(등록 실패 표면화)이었고 *읽는 쪽*은 같은 fail-open으로 남아 있었다. 한 축의 양쪽을 다 보지 않은 것이다.

반환 배열에 non-enumerable `incomplete`를 달고(기존 호출부·test는 그대로 배열로 취급), 판정표에 13번째 행 `sibling_evidence_unreadable`을 추가했다 — `in_use_by_live_session` **앞**이다. 형제 증거를 읽었는지 모르는 상태에서 "형제가 안 잡고 있다"를 물을 수 없기 때문이다.

**분할이 요점**: 파싱은 되지만 스키마가 깨진 레코드는 `role`을 여전히 읽을 수 있고, `role !== 'reuse'`인 것은 애초에 가드가 아니므로 무시해도 안전하다. 이 구분이 없으면 훗날 스키마 bump 한 번에 legacy owner 레코드 전부가 `incomplete`가 되어 **회수가 통째로 얼어붙는다**. test (14c)가 두 방향을 고정한다.

### 검증 (R3 이후)

151 tests / 150 pass / 0 fail / 1 skip. 두 재현 스크립트 모두 차단 확인.

## santa-loop Round 4 — 사용자 승인 하의 검증 라운드

A PASS·critical 0, B FAIL·critical 2. 네 라운드 내내 같은 분포다.

### 수정 11 — SessionEnd hook에 **내가 넣은 회귀** (B critical 2)

`reclaimOwnedProcesses`의 `require('../lib/session-processes')`가 `try` **밖**에 있었다. 모듈 로드가 실패하면 `run()` 밖으로 그대로 throw되어, `async:true / timeout:10`으로 **non-blocking을 계약한 hook에 새 blocking 실패 모드**를 만들고, 그것을 보고하려고 쓴 stderr surfacing까지 건너뛴다. 실측: 로드를 throw하게 stub하니 `run()`이 throw했다.

**R1에서 정확히 이 계열을 `dashboard-server.js`와 `plan-codex-runner.js` 두 곳에 고쳐 놓고 hook 한 곳을 빠뜨린 것이다.** 기존 test 전부가 `deps.reclaimSession`을 주입해 require를 단락시키므로 **구조적으로 못 잡는 사각**이었다 — 새 test는 실제 모듈 로드를 깨뜨린다.

### 수정 12 — env-only 세션 id 게이트가 회수를 통째로 건너뛰었다 (B R5)

`run()`은 `event.session_id`를 파싱해 놓고도 회수를 env-only `resolveSessionId()`에 걸어 조기 반환했다. env가 비면 페이로드에 종료 세션 id가 있는데도 그 세션의 프로세스가 **영구 등록 상태로 남는다**. observer cleanup은 env 키에 묶여 있으니 그대로 두고, 회수만 페이로드로 fallback시켰다.

기존 test `(c)`가 "세션 id 없으면 회수 skip"을 단언하면서 **정작 페이로드에는 session_id를 담아 넘기고 있었다** — 구멍을 규칙으로 고정한 test다. `(c)`(양쪽 다 없음)와 `(c2)`(env 없음 + 페이로드 있음)로 쪼갰다.

### 수정 13 — `safeRequire` 침묵 (B R8)

R2에서 "이제 어떤 실패도 조용하지 않다"고 주석을 달아 놓고, 모듈 로드 실패는 `safeRequire`가 `null`을 반환해 조용히 넘어갔다. 내 주석이 거짓이었다. null을 stderr로 명명한다.

### 남은 critical 1건 — 메커니즘으로 닫을 수 없다 (B critical 1)

빌리는 세션이 reuse 레코드를 쓰지 못하면(가장 싸게는 세션 식별자 부재) 소유자의 가드가 사라지고 `MCCP_RECLAIM_OUTLIVES=1`에서 사용 중인 dashboard가 죽는다. R1에서 표면화는 넣었지만 Codex는 "경고만 하고 그대로 진행하니 여전히 fail-open"이라고 지적했고, 그 말이 맞다.

합성 세션 id로 우회하려다 접었다 — **reuse 레코드의 liveness는 `session_pid`가 정하는데, 재사용 경로에서 살아있는 주체는 Claude 세션(`CLAUDE_PID`)이고 그것이 바로 지금 식별 불가능한 대상이다.** 대신 CLI 프로세스의 pid를 쓰면 그 프로세스는 URL을 찍고 즉시 종료하므로 가드가 되지 못한다(오히려 fail-open). `null`을 쓰면 `isSiblingLive`가 영구 true가 되어 dashboard가 영영 회수 불가가 된다.

그래서 이건 결함이 아니라 **토글의 의미**다: `MCCP_RECLAIM_OUTLIVES=1`은 "세션보다 오래 사는 것을 거두겠다"는 선언이고 공유 dashboard가 죽을 수 있다는 뜻을 포함한다(PRD OQ1이 열어둔 제품 질문). 기본값 0이 오늘의 동작이다. `docs/ENVIRONMENT.md`의 토글 설명에 이 한계를 — 왜 우회가 불가능한지까지 — 적었다.

### 검증 (R4 이후)

161 tests / 160 pass / 0 fail / 1 skip.

## santa-loop Round 5 — R1·R2가 처음으로 PASS

A PASS·critical 0(다섯 라운드 연속), B FAIL·critical 2. 다만 B의 **R1(오살 안전성)과 R2(소유권 판정)가 처음으로 PASS**다 — 지배 지표 축은 다섯 라운드 만에 두 모델이 합의했다. 남은 지적은 그 주변(경로 봉인의 마지막 구멍, 예산의 경계, 문서 정확도)이다.

이 라운드부터 리뷰어 지시에 **"한 호출부에 적용한 가드가 같은 종류의 모든 호출부에 적용됐는지 특히 보라 — 이 코드베이스가 반복적으로 보인 실패 모드다"**를 넣었다. 그 지시가 곧바로 값을 했다.

### 수정 14 — `unregister`가 마지막까지 봉인되지 않은 mutating 경로였다 (B critical 1)

`register`는 봉인, `list`도, `reclaimSession`도(매 write 전 재검증까지), `scanForeignOrphans`도 — 그런데 **정상 종료가 지나가는 `unregister`만 무방비**였다. 등록 후 `<registry>/<sid>`가 repo 밖 링크로 바뀌면 dashboard를 닫거나 runner가 끝나는 것만으로 repo 밖 파일이 삭제된다. 두 곳 다 프로덕션 경로다.

**같은 실패 모드의 네 번째 사례다.** 한 축의 모든 호출부를 세지 않는 것.

### 수정 15 — 예산이 묶지 않던 부분 (B critical 2)

예산은 probe만 예약했다. 형제 스윕은 §D11 때문에 memoize가 금지돼 **레코드마다 전 형제 디렉토리를 다시 읽는데**, 루프의 경과 검사는 레코드 **사이**에서만 일어나므로 한 번의 스윕이 혼자 hook timeout을 넘길 수 있었다. 스윕에 deadline을 물렸고, 초과 시 `incomplete` → kill 차단이다(시간이 모자라 "아무도 안 쓴다"를 확인 못 한 것은 죽여도 된다는 뜻이 아니다).

문서도 정정했다: `MCCP_RECLAIM_BUDGET_MS`는 hard wall-clock cap이 **아니라** 레코드 단위 granularity의 예산이고, 루프 진입 전 자기 디렉토리 `list()` 1회는 예산 밖이다. 무엇이 묶이고 무엇이 안 묶이는지 `docs/ENVIRONMENT.md`에 열거했다.

### 수정 16 — teardown 실패의 침묵 (B R4)

`unregisterServerProcess`와 runner의 `finally`가 `unregister` 결과를 버렸다. 남은 레코드는 SessionEnd가 **이미 종료된 프로세스를 대상으로 회수를 시도하게** 만드는데, 운영자가 그 사실을 알 다른 경로가 없다. 둘 다 읽고 표면화한다. `scanForeignOrphans`의 세션 디렉토리 `readdir` 실패도 같은 규칙으로 계상·명명한다(bare `continue`였다).

### 인정 — 레지스트리는 실패 건수만큼 자란다 (B R5)

`.failed.json`·`.unreclaimed.json`은 영구 보존이고, 그 둘만 남은 디렉토리는 지워지지 않는다. 감사 표면을 없애는 것이 "다음 SessionStart가 처리한다"를 증거 인멸로 바꾸기 때문에 **의도한 선택**이다. 다만 그렇다면 "무제한 증가를 막았다"는 주장은 성립하지 않는다 — 그 문장을 CHANGELOG에서 내렸다.

### 검증 (R5 이후)

154 tests / 153 pass / 0 fail / 1 skip (신규 3건: `unregister` 탈출 · 스윕 deadline · 읽을 수 없는 세션 디렉토리).

## santa-loop Round 6 — 같은 패턴의 5·6번째 사례, 그리고 R4가 만든 오살 경로

A PASS·critical 0(여섯 라운드 연속), B FAIL·critical 2. 이 라운드는 리뷰어 지시를 **"각 불변식에 대해 그것을 가져야 할 모든 호출부를 열거하고 하나씩 확인하라"**로 승격했고, 그 지시가 세 건을 찾았다.

### 수정 17 — R4에서 **내가 만든** 오살 경로 (B critical 1)

R4에서 payload 세션 id fallback을 넣으면서 **env를 우선**으로 뒀다: `sessionId || event.session_id`. payload의 `session_id`는 Claude Code가 "지금 끝나는 세션"을 지목한 값이고 env는 ambient라 stale하거나 상속될 수 있다. 둘이 어긋나면 회수가 **끝나지도 않은 세션**을 대상으로 돌아 그 세션의 프로세스를 죽인다.

권위 있는 출처는 실제 질문("어느 세션이 끝났는가")에 답하는 쪽이어야 한다 — payload 우선으로 뒤집고 불일치를 stderr로 명명한다. test `(c3)`이 고정.

### 수정 18 — 형제 스윕에 디렉토리별 containment가 없었다 (B critical 2)

`scanForeignOrphans`는 R1부터 세션 디렉토리마다 containment를 검사해 왔는데, **kill 증거로 쓰이는 레코드를 읽는** 형제 스윕은 안 했다. 루트가 깨끗하다고 그 아래 모든 디렉토리가 깨끗한 것은 아니다. 형제 디렉토리 하나가 repo 밖 링크면 외부 JSON이 회수 증거가 된다.

**같은 패턴의 여섯 번째 사례.** 방향 자체는 fail-closed(가짜 reuse 레코드는 kill을 *막는다*)라 오살로 이어지진 않지만, 봉인 불변식이 뚫린 것이고 `continue`가 아니라 `incomplete`로 처리해야 맞다 — 읽기를 거부한 형제는 *확인하지 않은* 형제다.

### 수정 19 — `incomplete` 플래그를 우회하는 exit (A suggestion)

A가 이번에 유일하게 낸 지적이자 정확한 지적. `collectSiblingReuse`의 path_escape exit이 `done()`을 거치지 않고 bare `[]`를 반환해, **가장 안전에 민감한 exit에서** `.incomplete`가 `undefined`(falsy = "확인했고 아무도 안 쓴다")로 읽혔다. 현재 호출자가 전부 containment를 먼저 검사해서 무해했을 뿐인데, 그건 **이 함수의 성질이 아니라 호출자의 성질**이다.

**같은 패턴의 다섯 번째 사례이고, 그것도 그 패턴을 고치려고 내가 만든 메커니즘 안에서 나왔다.** 모든 exit이 `done()`을 지나도록 scaffolding을 첫 return 앞으로 옮겼다.

### 검증 (R6 이후)

167 tests / 166 pass / 0 fail / 1 skip.

## santa-loop Round 8 — 두 리뷰어가 독립적으로 R7의 미봉을 다시 잡았다

R8은 Reviewer A(Opus)와 Reviewer B(Codex gpt-5.4)가 서로를 보지 못한 채 **같은 파일·같은 함수·같은 시나리오**에 수렴했다. 양쪽 다 FAIL.

### 수정 20 — §D15 축 1을 **실행 이미지**로 닫았다 (A critical 1 · B critical 1)

R7의 Reviewer B가 이미 critical로 잡았던 결함인데, R7의 대응은 **고치는 대신 코드에 `KNOWN DEFECT` 주석을 다는 것**이었다. 그 주석은 자신이 §D15가 선언한 잔여보다 **넓다**고 스스로 적었으나, 같은 라운드에 함께 커밋된 security review는 이 축을 `PASS — no mis-kill path found`로 적었고 본 리포트 수정 4와 CHANGELOG의 잔여 절도 갱신되지 않았다. **결함을 아는 상태로 세 산출물이 반대로 말하고 있었다.**

결함: `isExecutedScript`의 `.some()`은 "script 토큰 **앞 어딘가에** node 토큰이 있는가"를 물었다. 그래서 node를 **데이터로 언급만 하는** 명령줄이 통과한다 — `grep node <exec_path>` · `echo node <exec_path>`. PID 재할당 ∧ 시작시각이 허용치 안이면 `owned_session_scoped`에 도달해 **무관한 프로세스에 SIGTERM**을 보낸다.

토큰 규칙으로는 닫을 수 없다. `nohup node <path>`(반드시 매치해야 함, test `identity 3e`)와 `grep node <path>`는 **같은 토큰 열**이다. 판별자는 **실행 이미지**뿐이다.

- `probeProcess`가 `execImage`를 함께 반환한다. win32는 `Win32_Process.ExecutablePath`, POSIX는 `ps -o comm=`이고 Linux에서는 더 정확한 `/proc/<pid>/exe` readlink가 이를 덮어쓴다(`comm`은 `prctl`로 바꿀 수 있고 15자에서 잘린다).
- win32 출력 형식을 **`|` 구분 단일 라인**으로 바꿨다. 필드마다 한 줄씩 찍으면 `ExecutablePath`나 `CommandLine`이 비었을 때(access-denied·커널 프로세스에서 실제로 발생) 뒤 필드가 **한 줄씩 밀려**, 파서가 이미지 자리에서 command line을 읽는다.
- `isReclaimableBy`가 이미지를 요구한다: **부재 → `identity_unverifiable`**(fail-closed — command line 단독 판정으로 흘러내리지 않는다), **비-node 이미지 → `identity_mismatch`**.
- `isExecutedScript`는 이제 토큰 축만 답한다(첫 script 토큰 등가 비교). 인터프리터 질문은 이미지 축으로 분리했다. `.some()`을 남겨 둘 이유가 없다 — 이미지가 답한 뒤에는 무용하고, shebang 기동처럼 command line에 node 토큰이 없는 형태를 **false negative로 만들 뿐**이다.

**실물 검증**(mock 아님): 살아 있는 `cmd.exe`를 `cmd /c ping -n 20 127.0.0.1 & rem node <exec_path>`로 띄워 실제 pid를 probe했다. `execImage=C:\WINDOWS\system32\cmd.exe`, command line에는 우리 절대경로가 첫 script 토큰으로 들어간다. **옛 규칙은 MATCH(=이 cmd.exe를 죽인다), 새 규칙은 mismatch.**

**회귀 test가 결함을 실제로 잡는지 확인했다.** HEAD(수정 전) worktree에 새 test 파일을 얹어 실행: `identity 3g`는 `owned_session_scoped`를, `identity 3h`는 fall-through를 그대로 드러내며 **fail**한다. `identity 3i`(실제 launch shape 6종)는 양쪽에서 pass — 오조임으로 회수를 죽이지 않았다는 뜻이다.

### 검증 (R8)

5개 reclaim suite 111 → **115 tests / 114 pass / 0 fail / 1 skip**(신규 4건, 손실 0). 실물 OS test `9d`는 이제 `execImage`가 non-null이고 node 인터프리터로 읽히는지까지 단언하며, POSIX 사전점검의 `ps` 필드 목록을 probe와 **동일하게** 맞췄다(짧은 목록으로 사전점검하면 `comm` 미지원 플랫폼을 green으로 통과시킨 뒤 probe에서 실패한다).

## santa-loop Round 9 — 두 리뷰어가 정반대로 갈렸다

R8과 달리 R9는 **수렴하지 않았다**. Reviewer A(Opus) `PASS` 12/12 · critical 0, Reviewer B(Codex gpt-5.4) `FAIL` 6개 축.

### 합의 — R8이 닫은 축은 양쪽 다 PASS

두 리뷰어 모두 criterion 2(정체 probe)를 PASS로 냈다. B의 문장: *"null/partial probe data becomes `identity_unverifiable`, non-node images become `identity_mismatch`, and argv parsing is designed to avoid **field-shift fallback into 'assume ours'**."* A는 test까지 지목했다 — *"test 3g explicitly tests the R7 critical"*, 그리고 R8에서 고친 mock 문제도 독립 확인했다(*"No mock contains an abstract 'command line' that cannot exist"*).

### 수정 21 — win32 구분자를 탭에서 `|`로 (A suggestion, 실질)

A의 지적: NTFS는 파일명에 탭(0x09)을 **허용**하므로, 탭이 든 디렉토리 아래의 바이너리는 파싱이 어긋난다. 방향은 fail-closed(회수를 놓칠 뿐)이나 공짜로 없앨 수 있는 취약성이었다. `|`는 Windows 파일명 **금지 문자**라 `ExecutablePath`에 구조적으로 나타날 수 없고, command line은 마지막 필드라 그 안의 `|`는 앞의 두 구분자만 읽는 파서에 무해하다. test 9g에 탭 경로·파이프 포함 command line 케이스를 추가했다.

### `MCCP_RECLAIM_OUTLIVES` 축 — B의 critical을 **수용하지 않았다** (운영자 판단)

B는 "식별자 없는 borrower가 reuse 레코드를 못 쓰면 소유자가 사용 중인 dashboard를 SIGTERM한다"를 critical로, 그리고 criterion 7·10·11·12를 FAIL로 냈다. **사실관계는 정확하다.** 수용하지 않은 근거 셋:

1. **성격 규정이 틀렸다.** B는 이것을 `Reachable non-owned kill`이라 불렀으나, 그 dashboard는 세션 A가 **소유한** 프로세스이고 B는 `role:'reuse'` 빌린 쪽이다. 위반되는 성질은 UI2("남의 프로세스를 죽이지 않는다")가 아니라 "사용 중인 것을 죽이지 않는다"이다. R8이 닫은 결함(무관한 `grep`을 죽임)과 층위가 다르다.
2. **R7의 `KNOWN DEFECT`와 정반대 상태다.** 기본값 0이고, `docs/ENVIRONMENT.md`가 시나리오·합성 id가 왜 불가능한지·PRD OQ1 미해소까지 적었으며, 빌리는 순간 `announceReuseRegistration`이 결과와 복구법을 담아 loud 경고한다. 문서·경고·기본값·코드가 서로를 부정하지 않는다.
3. **명백한 수정이 없다.** "레코드를 못 쓰면 재사용하지 말고 자기 서버를 띄운다"가 자연스러워 보이지만, `resolveSessionId`가 null이면 **소유자 등록도 불가**하므로(Task 1 단언 (6)) 그 새 서버는 아무도 회수할 수 없는 미등록 프로세스가 된다. 중단 대신 누수를 택하는 트레이드일 뿐이고, 이 축이 PRD OQ1로 열려 있는 이유가 그것이다.

**R9 rubric이 이 FAIL을 부분적으로 유도했다는 점은 기록해 둔다.** criterion 12에 "방치된 known defect는 잔여가 아니라 FAIL"을 넣으면서(R7 재발 방지 목적) 예외 잔여 목록에 이 항목을 열거하지 않았다. B는 지시대로 적용했다. R10 rubric은 이 잔여를 명시 열거해 리뷰어가 catch-all이 아니라 실질로 판정하게 한다.

### 검증 (R9)

reclaim 5 suite **117 tests / 116 pass / 0 fail / 1 skip**(구분자 교체 후 재실행). 실물 OS probe가 새 구분자로 정상 동작함을 자기 pid로 확인했다.

## santa-loop Round 10 — 마지막 라운드 (운영자 종료 결정)

운영자가 **R10을 마지막 라운드로 지정**하고 "HIGH 이상만 수정, 나머지는 backlog"를 지시했다. 아래는 그 기준으로 내린 triage이며, **loop이 수렴해서가 아니라 종료 결정으로 끝났다는 사실을 그대로 기록한다.**

Reviewer A(Opus) `PASS` 12/12 · critical 0 · suggestion 0. Reviewer B(Codex gpt-5.4) `FAIL` 6개 축 · critical 1. R9에 이어 **두 라운드 연속으로 두 모델이 갈렸다.**

### Reviewer B critical — MEDIUM으로 판정해 이연

`isNodeInterpreterImage`가 basename만 본다. `/tmp/node`·`C:\temp\node.exe`도 통과한다 — **실측 확인했다.** 재할당된 pid가 그런 이미지로 우리 절대경로를 첫 script 토큰에 두고 뜨면 `owned_session_scoped`에 도달한다.

HIGH로 올리지 않은 근거: **§D15가 이미 선언한 유계 창의 네 조건을 그대로 요구한다.** 결속 조건인 시작시각 델타는 우리 프로세스가 *죽은* 시각이 아니라 *시작한* 시각 기준이므로, 재할당 프로세스가 우리 원본 시작 후 500ms(win32)/1500ms(POSIX) 안에 떠야 한다 — 즉 우리 프로세스가 그 안에 죽고 OS가 즉시 pid를 재활용해야 한다. B의 시나리오도 같은 조건을 전제한다("If the reused PID lands within the time tolerance"). 새 창이 아니라 기존 창의 **세 번째 조건이 문서 표현보다 넓다**는 지적이다.

**다만 그 지적 자체는 옳고, 문서를 고쳤다.** 잔여 문구가 "이미지가 node"라고 적어 "진짜 node"로 읽히게 했다 — 이번 사이클이 R7에서 정확히 그 실패(문서가 코드보다 좁게 말함)를 겪었으므로 표현을 "이미지의 **basename**이 `node`/`nodejs`"로 정정하고 `/tmp/node` 사례를 명시했다. 코드 주석에도 같은 범위를 적었다. 진짜 runtime으로 좁히는 수정(등록 시 `process.execPath` 봉인 후 대조)은 **13번째 필드 = schema 변경 + migration**이라 ship 범위 밖이며 backlog에 수정안까지 적어 이연했다.

### Reviewer B suggestion 4 — MEDIUM, 이연

`node -r ./bootstrap.js <우리경로>` / `node --require ./bootstrap.js <우리경로>`가 `identity_mismatch`가 된다 — 실측 확인. 플래그의 **값**이 첫 script 토큰 자리를 차지하기 때문이다(결합형 `--require=./p.js`는 정상). 방향은 fail-closed이고 mccp의 두 기동 형태는 분리형 플래그를 쓰지 않아 **오늘 영향 0**이다. 수정하려면 값-소비 플래그 화이트리스트가 필요하고 그 목록이 틀리면 반대 방향(과다 skip)으로 오살 위험이 생기므로 backlog.

### 이연 2건은 backlog에 등재됐다

`.claude/plans/codex-findings-backlog.md` 2026-08-14 MEDIUM 2건 — 각각 재현 조건·수정안·test 요구사항까지 적었다. **R7의 실패(이연처가 이미 닫힌 항목이었다)를 반복하지 않도록 실재하는 열린 항목으로 만들었다.**

## PRD 1차 지표 — 회수율 첫 실측 (M3 Task 12, 2026-08-17)

M1+M2의 검증은 **전량 단위 test**였다. 그 test들은 주입한 killer가 받은 pid 집합을 기대 집합과
대조하므로 *판정 로직*은 증명하지만 *실제로 프로세스가 죽는지*는 증명하지 않는다. 그래서 PRD가
`[primary]`로 지목한 회수율은 M1+M2 종료 시점까지 **한 번도 관측된 적이 없었다.** 아래가 그 첫 관측이다.

실행: `node plugins/mccp/scripts/lib/tests/manual/session-process-reclaim-smoke.js` (exit 0)

| 항목 | 값 |
|---|---|
| 시도 (`attempted`) | 1 |
| 회수 성공 (`reclaimed`) | 1 |
| 종료 확인 (`pid_alive_after`) | `false` — bounded poll(50ms 간격, 상한 5s) |
| 미회수 / skip / unverified | 각 0 |
| `complete` | `true` (budget 초과 없음) |
| 플랫폼 | win32 |

**표본 1건의 관측이다.** 1/1이라고 해서 회수율 100%라고 적지 않는다 — 이 값이 말하는 것은
"회수 경로가 실물 프로세스에 대해 최소 한 번은 끝까지 작동했다"이지 비율이 아니다.

검증은 스크립트의 자기 보고를 믿지 않는다. 관측 줄이 싣는 자식 pid를 Validation 9가 받아
**스크립트 밖에서** `evidence-lock.js#isPidAlive`로 다시 확인한다 — 아무 일도 하지 않고 기대 JSON만
찍는 구현은 pid를 싣지 못하거나 살아 있는 pid를 싣게 되고 둘 다 거기서 걸린다.

두 가지를 하네스가 의도적으로 조정했고, 그것이 결과의 해석 범위를 좁힌다:

- 자식을 `node -e`가 아니라 **파일**로 띄운다. `-e`는 `__filename`이 `[eval]`이라 명령줄에 스크립트
  경로가 없고 §D15 축 1이 인위적으로 어긋난다 — 회수 실패가 구현 결함이 아니라 하네스 결함이 되는
  형태이며, santa-loop R3 절이 기록한 실측 함정이 정확히 이것이다.
- `MCCP_RECLAIM_IDENTITY_TOLERANCE_MS`를 `10000`으로 **상향**했다(토글은 상향만 반영). 기본값
  (win32 500 / POSIX 1500)은 spawn 직후 시각 지터를 흡수하기에 빠듯한데, 이 관측이 재려는 것은
  그 지터가 아니라 회수 경로다. 따라서 **이 관측은 기본 허용치에서의 정체 판정 정확도를 말하지 않는다.**

## 주장하지 않는 것 (명시 잔여)

- **§D11 ms 단위 TOCTOU**와 **§D15 유계 오살 창**(PID 재할당 ∧ 시작시각 델타 < 허용치 ∧ **이미지의 basename이 `node`/`nodejs`** ∧ command line의 첫 script 토큰이 우리 절대경로)은 단위 test로 재현할 수 없다. "무관한 프로세스가 죽는 경로는 없다"고 **주장하지 않는다**.
  - **세 번째 조건은 "진짜 node인가"가 아니라 "이름이 node인가"다**(santa-loop R10 Reviewer B). `/tmp/node`·`C:\temp\node.exe`처럼 basename만 맞는 임의 바이너리도 통과한다 — 실측 확인. 이 문서가 이전에 "이미지가 node"라고 적은 것은 그 구분을 흐렸다. 다만 이것이 새 창을 여는 것은 아니다: 결속 조건인 **시작시각 델타**는 그대로다. 그 델타는 우리 프로세스가 *죽은* 시각이 아니라 *시작한* 시각 기준이므로, 재할당된 프로세스가 우리 원본 시작 후 500ms(win32)/1500ms(POSIX) 안에 떠야 한다. 진짜 node로 좁히려면 등록 시 spawn한 `process.execPath`를 레코드에 봉인해 대조해야 하고 이는 schema 변경이라 backlog로 이연했다.
- ~~POSIX symlink 봉쇄 test 2건은 win32에서 skip된다(권한 의존).~~ **santa-loop R1에서 해소** — junction은 elevation 없이 만들어지고 realpath로 동일하게 해석되므로 두 test 모두 win32에서 실제로 실행된다. 그 전제("symlink는 권한이 필요하다")가 틀렸던 것이 루트 탈출 결함을 가려 준 요인이기도 하다.
- macOS `ps`는 `etimes`를 지원하지 않아 probe가 `null` → `identity_unverifiable` → 회수 미수행(fail-closed, 오살 아님). test는 사유를 출력하고 skip한다.
- ~~**cross-model 리뷰 부재**~~ — **santa-loop R1에서 해소**. Implement-Codex 게이트는 EXECUTE **이전**에 돌아 diff가 비어 있었으나(verdict `divergent`로 정직 봉인), 실제 코드에 대한 Codex(gpt-5.4) 심사가 santa-loop R1에서 수행됐고 critical 3건이 흡수됐다. security-reviewer는 여전히 이 세션 정책상 미호출(`security_skipped=true`) — 다만 R1의 R3(보안) 축이 실제 경로 탈출 1건을 잡았다.
- **§D15 축 1의 남은 잔여는 상대 경로 기동 하나**다 — R2에서 독립-인자 언급 케이스가, **R8에서 `grep node <path>` 부류가 실행 이미지 축으로** 닫혔다. `identity_mismatch`로 읽혀 회수를 놓치는 fail-closed 방향이며 test `identity 3f`가 고정한다. (R2~R7 동안 이 줄은 잔여가 상대 경로뿐이라고 적었으나 그때는 거짓이었다 — 수정 20 참조.)
- **실행 이미지를 주지 않는 플랫폼에서는 회수가 통째로 멈춘다.** `identity_unverifiable`이므로 오살 방향은 아니지만, 회수 커버리지가 0이 되는 것을 "안전하다"는 말로 덮지 않는다. win32(`ExecutablePath`)와 Linux(`/proc/<pid>/exe`)는 실측 확인했고, macOS는 `etimes` 부재로 이미 probe가 `null`이라 변화 없다. 그 외 POSIX는 `ps -o comm=`에 의존하며 이 저장소에서 검증되지 않았다.
- **오살 0은 목표이지 증명된 절대치가 아니다.** 소유권 축(세션·repo·호스트·reuse·lifetime)은 결정적으로 닫히지만, 프로세스 정체 축에는 유계 잔여가 남는다 — PID 재할당 ∧ 시작시각 델타 < 허용치 ∧ node가 **같은 절대 스크립트 경로**를 실행 중. 단위 test로 재현할 수 없다.
- **reuse 레코드의 무한 증가**는 미해결이다(backlog). 정리가 곧 kill 허용이 되는 축이라 오살 0 앞에서 보수적으로 남겼다.

## Next Steps

> **2026-08-17 갱신 (M3).** 아래 항목의 소관은 `.claude/plans/session-process-reclaim-followup.plan.md`(M3 — 출하 + 잔여 정리)로 넘어갔다. 완료 표기는 이 문서가 쓰인 뒤 실제로 일어난 것만 붙였다.

- [x] santa-loop — R1~R10 완주. R10은 수렴이 아니라 **운영자 종료 결정**으로 끝났고 근거는 이 문서의 라운드별 절이 갖는다. escalation이 지목했던 대상은 `mccp-implement-codex/session-process-reclaim` 게이트인데, 그 receipt는 (working-tree only · 소실됨) — §3.12상 세션 진단용이라 worktree 정리를 넘겨 살아남지 않으며 손으로 다시 쓰는 것은 증거 복원이 아니라 위조다(§3.13)
- [ ] 출하 — M3 Task 11이 `/mccp:prp-commit` → `/mccp:pr`로 수행한다 (§3.12 merge-commit, squash 금지)
- [ ] 이 작업의 cross-model 감사 anchor는 아직 없다 — `ANCHOR-PENDING(Task 11)`. 출하 게이트를 완주해 ship receipt가 실제로 생성되면 그때 이 자리에 그 경로를 기입한다. 그 전에는 경로를 적지 않는다 — 아직 없는 파일을 가리키는 git-tracked 참조를 만들지 않기 위해서다
- [ ] ship 후 `/mccp:archive-complete` — M3까지 complete가 된 **뒤에야** 대상이다(§3.11 C2: 미완료 PRD의 plan을 옮기면 어느 스캔에도 안 잡혀 소실된다)
- [x] base drift — M3 Task 1이 `origin/main` 머지(149 커밋)로 닫았다. 머지 도중에도 main이 계속 전진해 버전 target이 또 밀렸고, forward-only로 `1.27.0`에 착지했다 — §3.7 7번째 실측 재발
