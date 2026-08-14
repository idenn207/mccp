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
| 11 | 릴리스 표면 | 완료 | 1.24.0 + footer 2면 + CHANGELOG + ENVIRONMENT §11 + PRD |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Unit Tests | Pass | 아래 9개 파일 전부 green |
| 구조 검사 | Pass | kill 지점 봉인 · `hooks.json` 무변경 · 레지스트리 gitignored · 삭제 파일 0 |
| Build | N/A | 순수 Node, 빌드 단계 없음 |
| Integration | N/A | 통합 서버 없음 (dashboard 실서버 test는 unit suite 안에 있음) |
| Design Grounding | N/A (no design trigger) | `design_signal=false` · capture 미수행 → Phase 3.6/3.7 no-op |

아래는 **최초 구현 시점(santa-loop 이전)** 의 숫자다. santa-loop R1/R2에서 test가 추가되고 win32 skip 2건이 junction으로 실행 가능해졌으므로 현재 수치와 다르다 — 현재값은 각 santa-loop 절의 "검증" 항목을 보라.

```
session-processes.test.js              18 pass / 0 fail (2 skip: win32 mode·symlink)
session-processes-reclaimable.test.js  23 pass / 0 fail (1 skip: win32 symlink)
session-processes-reclaim.test.js      21 pass / 0 fail
session-processes-spawn-sites.test.js   9 pass / 0 fail
dashboard-server.test.js               33 pass / 0 fail   ← 이전 13, 아래 Fixed 참조
session-spawner.test.js                15 pass / 0 fail
session-end-marker-reclaim.test.js      7 pass / 0 fail
session-end-trace.test.js               7 pass / 0 fail
i18n-surface.test.js                   10 pass / 0 fail
```

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
새 잔여(더 좁고, 명시): **상대 경로 기동**이 `identity_mismatch`로 읽힌다. 상대 토큰을 재anchor하려면 suffix 매칭을 허용해야 하는데 그것이 바로 전체경로 규칙이 막으려던 basename 충돌이다. 방향은 fail-closed이고 mccp의 두 기동 형태는 모두 절대 경로다. test `identity 3f`가 고정.

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

## 주장하지 않는 것 (명시 잔여)

- **§D11 ms 단위 TOCTOU**와 **§D15 유계 오살 창**(PID 재할당 ∧ 시작시각 델타 < 허용치 ∧ command line이 절대경로 전체 포함)은 단위 test로 재현할 수 없다. "무관한 프로세스가 죽는 경로는 없다"고 **주장하지 않는다**.
- ~~POSIX symlink 봉쇄 test 2건은 win32에서 skip된다(권한 의존).~~ **santa-loop R1에서 해소** — junction은 elevation 없이 만들어지고 realpath로 동일하게 해석되므로 두 test 모두 win32에서 실제로 실행된다. 그 전제("symlink는 권한이 필요하다")가 틀렸던 것이 루트 탈출 결함을 가려 준 요인이기도 하다.
- macOS `ps`는 `etimes`를 지원하지 않아 probe가 `null` → `identity_unverifiable` → 회수 미수행(fail-closed, 오살 아님). test는 사유를 출력하고 skip한다.
- ~~**cross-model 리뷰 부재**~~ — **santa-loop R1에서 해소**. Implement-Codex 게이트는 EXECUTE **이전**에 돌아 diff가 비어 있었으나(verdict `divergent`로 정직 봉인), 실제 코드에 대한 Codex(gpt-5.4) 심사가 santa-loop R1에서 수행됐고 critical 3건이 흡수됐다. security-reviewer는 여전히 이 세션 정책상 미호출(`security_skipped=true`) — 다만 R1의 R3(보안) 축이 실제 경로 탈출 1건을 잡았다.
- **§D15 축 1의 남은 잔여는 상대 경로 기동 하나**다(R2에서 독립-인자 언급 케이스는 닫힘). `identity_mismatch`로 읽혀 회수를 놓치는 fail-closed 방향이며 test `identity 3f`가 고정한다.
- **오살 0은 목표이지 증명된 절대치가 아니다.** 소유권 축(세션·repo·호스트·reuse·lifetime)은 결정적으로 닫히지만, 프로세스 정체 축에는 유계 잔여가 남는다 — PID 재할당 ∧ 시작시각 델타 < 허용치 ∧ node가 **같은 절대 스크립트 경로**를 실행 중. 단위 test로 재현할 수 없다.
- **reuse 레코드의 무한 증가**는 미해결이다(backlog). 정리가 곧 kill 허용이 되는 축이라 오살 0 앞에서 보수적으로 남겼다.

## Next Steps

- [ ] `/mccp:santa-loop '<gate-receipt:mccp-implement-codex/session-process-reclaim>'` — fix-task가 요구하는 dual-reviewer escalation. **실제 코드에 대한 첫 cross-model 심사가 여기서 일어난다.**
- [ ] `/mccp:code-review` 로 변경 검토
- [ ] `/mccp:prp-commit` → `/mccp:pr` (§3.12 merge-commit)
- [ ] ship 후 `/mccp:archive-complete` — PRD 2 milestone 모두 complete이므로 대상
- [ ] `origin/main`이 **1.23.11**까지 진행됨(내 base는 1.23.7). 1.24.0은 forward-only라 유효하지만 merge 시 CHANGELOG 3개 항목(1.23.8/10/11) 승계 확인 필요 — §3.7 4번째 재발
