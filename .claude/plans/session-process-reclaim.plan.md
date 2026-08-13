# Plan: 세션 프로세스 레지스트리 + SessionEnd 회수 (session-process-reclaim M1+M2)

**Source PRD**: `.claude/prds/session-process-reclaim.prd.md`
**Selected Milestone**: 1 + 2 (통합 — §D0)
**Complexity**: Large

## Summary

mccp가 띄우는 장수 프로세스가 부팅 시 `{pid, host, session_id, session_pid, started_at, proc_started_at_ms, exec_path, repo_root, kind, lifetime, role}`을 세션 키 디렉토리에 등록하고, `SessionEnd`에서 **자기 세션 소유분만** 회수한다. 회수하지 못한 것은 사유와 함께 레코드로 남는다.

M1(레지스트리)과 M2(회수)를 **한 plan으로 묶는다**(§D0). 레지스트리만 있는 plan은 자기 가치를 기계적으로 증명할 수 없다 — PRD의 핵심 지표 **오살 0**은 kill 경로가 있어야만 test가 된다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | MVP는 자기 세션이 띄운 프로세스만 회수 대상으로 삼는다. 다른 세션·과거 세션의 고아는 감지와 보고까지만 한다 | exclusion |
| UI2 | 오살 0 — 다른 세션이나 다른 사용자의 프로세스를 죽이지 않는다 | constraint |
| UI3 | mccp가 직접 spawn한 자식까지가 범위이고, 그 자식이 만든 손자 프로세스는 범위 밖이다 | exclusion |
| UI4 | `.end` 마커 누락의 근본 원인 해결은 이 작업의 성과로 주장하지 않는다 | exclusion |
| UI5 | Windows/POSIX 프로세스 그룹 차이를 통일하려 들지 말고 Windows 11에서 동작하는 것을 우선한다 | direction |
| UI6 | 회수 실패가 조용히 넘어가지 않고 표면화되어야 한다 | constraint |
| UI7 | dashboard 서버가 세션 종료 후에도 살아야 하는지는 미결 제품 결정이므로 답을 가정하지 않는다 | constraint |
| UI8 | 회수 완료를 세션 종료의 차단 조건으로 삼지 않는다 | direction |
| UI9 | 회수를 best-effort로 설계하고 미완료를 남겨 다음 SessionStart가 처리하게 한다 | direction |
| UI10 | 마커 write를 회수보다 먼저 수행해 회수 실패가 마커를 막지 않게 한다 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 세션 정체 | `plugins/mccp/scripts/receipt/evidence-lock.js:69-95` | `resolveSessionId(env)` · `resolveSessionPid(env)`(`CLAUDE_PID`) · `isPidAlive(pid)`(EPERM=alive). 재구현 금지 |
| **세션** 정체 3원소 | `plugins/mccp/scripts/state/evidence-claim.js:74-107` | `{session_id, host, session_pid}` + `sameHolder()`; 부재/사망 시 그 축만 빼고 강등. **세션 정체 전용이다** — `session_pid`는 Claude 세션의 pid라 spawn된 자식의 수명과 직교하므로, **프로세스** 정체는 §D15가 별도 축으로 다룬다 |
| slug traversal 방어 | `plugins/mccp/scripts/state/evidence-claim.js:56-64` `assertSafeSlug` · `plugins/mccp/scripts/hooks/session-end-trace.js:24-31` `SESSION_ID_RE` | 단일 path segment 강제 |
| owner-only 원자 write | `plugins/mccp/scripts/lib/plan-codex-runner.js:75-79` `writePrivate` | `writeFileSync(tmp, text, {mode: 0o600})` → `renameSync`. **`evidence-lock.writeFileAtomic`은 mode 옵션이 없다**(:233-258) |
| write 전 mkdir | `plugins/mccp/scripts/lib/dashboard-server.js:82` | `fs.mkdirSync(dir, {recursive: true})` — `writePrivate`에는 없다(§D8) |
| 경로 비-누출 | `plugins/mccp/scripts/receipt/write.js:52` `normalizeReceiptCwd` (+ `plugins/mccp/scripts/receipt/tests/cwd-normalization.test.js:45-58`) | repo 안 → relative, 밖 → `<outside-repo>`, root 미상 → `.` |
| PID 파일 다중 AND 검증 | `plugins/mccp/scripts/lib/dashboard-server.js:68-121` `isReusablePid` | host AND alive AND repoRoot AND statusPath AND mode |
| 프로세스 종료 | `plugins/mccp/scripts/lib/observer-sessions.js:172-198` `stopObserverForContext` | `kill(pid,0)` liveness → `kill(pid,'SIGTERM')` → 상태 파일 정리. **force 2단계 없음** |
| 마커 우선 + fail-loud-open | `plugins/mccp/scripts/hooks/session-end-marker.js:24-58` · `session-end-trace.js:8-9` | 마커를 먼저 쓰고, 이후 단계 실패는 loud하게 알리되 마커를 막지 않는다 |
| 세션 키 디렉토리 | `.claude/state/hook-trace/<sid>/`(`.gitignore:67`) · `.claude/state/evidence-claims/`(`.gitignore:57`) | 세션별 하위 디렉토리 + gitignore |
| 판정표 전수 test | `plugins/mccp/scripts/migrations/tests/host-aware-reclaim.test.js` | tri-state reclaim 판정을 행 단위로 전수 |
| 테스트 | `plugins/mccp/scripts/lib/tests/*.test.js`(`node --test`) · `plugins/mccp/scripts/state/tests/session-spawner.test.js:19-28` · `plugins/mccp/scripts/hooks/tests/session-end-trace.test.js:12-17` | `mkdtempSync` 임시 repo + 의존성 주입 recorder |

## Design Decisions

### D0 — M1과 M2를 한 plan으로 묶는다

이 plan의 이전 두 판(M1 단독)은 리뷰 패널에서 연속 divergent로 막혔고, 두 라운드의 **blocking finding 중 가장 무거운 것들이 전부 M1↔M2 seam**이었다:

- "M2가 `isReclaimableBy`를 안 부르고 자기 로직을 짜면 그만" (architect/invariant, HIGH ×2)
- "sibling 확인과 kill 사이 TOCTOU" (security, MED ×2)
- "M2가 `incomplete` 플래그를 무시할 수 있다" (invariant, MED)

이건 plan의 서술 결함이 아니라 **분할의 결과**다. 존재하지 않는 코드에 대해 M1이 증명할 수 있는 것은 없다. 통합하면 셋 다 소멸한다 — 호출을 test가 강제하고(§Task 8), 재확인 시점을 kill 코드가 소유하며(§D9), `incomplete` 처리가 회수 함수 안에 있다.

결정적 근거는 **PRD의 지표 자체**다. "오살 0 — 다른 세션·다른 사용자의 프로세스를 죽이지 않음 / 소유권 검증 test"는 kill 경로가 있어야만 test가 된다. 레지스트리 단독 plan은 자기 핵심 지표를 검증할 수 없다.

PRD의 milestone 2행은 유지한다(전달 단위). plan만 하나다.

### D1 — PRD의 "detached spawn 지점 3곳"은 실측과 어긋난다

`grep -rn "detached" plugins/mccp/scripts --include=*.js` 결과 JS의 `detached:true`는 **2곳**뿐이다.

| PRD가 지목한 곳 | 실측 | 처리 |
|---|---|---|
| `dashboard-server.js:510-514` | `openBrowser()` — `cmd /c start "" <url>`. 브라우저를 띄우고 **밀리초 안에 종료**하는 런처. dashboard 서버가 아니다 | **등록 제외.** SessionEnd 전에 이미 죽어 있고 PID는 재사용됐을 수 있다 — 회수 대상으로 두면 UI2를 정면으로 위협한다. 비등록을 test로 고정 |
| `session-spawner.js:163-171` | `powershell.exe -NoExit -Command claude` — handoff 세션. **세션보다 오래 사는 것이 존재 이유** | 등록하되 `lifetime:'outlives-session'` |
| `plan-codex-runner.js` | JS spawn이 **아니다**. `plugins/mccp/commands/plan.md:1339`의 Bash `nohup … &` | 자기등록 |
| (목록에 없음) | **dashboard 서버 본체** — `dashboard-server.js:610`. 문제 서술의 "포트를 계속 점유"하는 당사자 | 자기등록 |

목록은 양방향으로 틀렸다. PRD Success Metric "3곳"은 실측 집합으로 대체한다(§Acceptance).

### D2 — spawn 래퍼가 아니라 자기등록

`spawn()` 래퍼는 `plan-codex-runner`(Bash `nohup`)와 dashboard 서버(Bash 백그라운드)를 **구조적으로 못 본다**. 자기등록은 프로세스당 1회이고 등록 주체가 자기 `process.pid`·`exec_path`를 정확히 안다.

`session-spawner`만 예외다 — 대상이 새 `claude` 세션(mccp 코드 아님)이라 자기등록 불가. 여기만 부모가 자식 PID를 등록한다.

### D3 — 프로세스당 파일 1개. purge에서 교차-PID unlink를 하지 않는다

`.claude/state/session-processes/<session_id>/<pid>.json`. 등록은 서로 다른 파일을 쓰므로 read-modify-write가 없고 **락이 필요 없다**.

`register()` 시점의 `purgeDead()`(죽은 PID 레코드 unlink)는 `readdir`→`isPidAlive`→`unlink` 다단계라 동시 등록과 경쟁한다. 해결은 락이 아니라 **제거**다: unlink는 (a) 자기 PID 레코드(`unregister`, 정상 종료)와 (b) 세션 디렉토리를 단독 소유하는 SessionEnd 회수(§D9)에서만 일어난다. 등록 경로에는 교차-PID unlink가 없다.

증가량은 유계다 — 세션당 장수 프로세스는 한 자릿수이고 디렉토리는 gitignored다.

### D4 — 소유권 판정 술어 `isReclaimableBy`

fail-closed, 첫 매치 승:

| 조건 | 결과 | 왜 |
|---|---|---|
| 스키마 무효 / 파싱 실패 | `false` `'record_invalid'` | 손상 레코드로 kill 하지 않는다 |
| `record.host !== host` | `false` `'cross_host'` | PID 의미가 호스트마다 다르다 |
| `canonical(record.repo_root) !== canonical(repoRoot)` | `false` `'cross_repo'` | `exec_path`가 이 repo 기준 상대경로다. 비교는 **`fs.realpathSync.native` 정규화 후** — symlink 경유 경로가 오탐으로 `cross_repo`를 내면 회수가 조용히 전멸한다 |
| `record.session_id !== sessionId` | `false` `'cross_session'` | UI1·UI2 |
| `!isPidAlive(record.pid)` | `false` `'already_dead'` | 죽일 게 없다 |
| **live 형제 세션의 `role:'reuse'` 레코드가 같은 `(pid, host, repo_root)`를 가리킴** | `false` `'in_use_by_live_session'` | §D7 |
| `record.lifetime === 'outlives-session'` ∧ `!allowOutlives` | `false` `'lifetime_outlives_session'` | §D10 |
| `record.kind === 'handoff-session'` | `false` `'handoff_never_reclaimed'` | handoff의 존재 이유가 이 세션보다 오래 사는 것이다. `allowOutlives`로도 뒤집지 않는다(§D10). **표 안에 둔다** — `reclaimSession`에만 두면 술어를 재사용하는 다른 호출자가 이 제외를 놓친다 |
| **프로세스 정체 미검증** (§D15) | `false` `'identity_unverifiable'` | PID 재사용 방어. 이 줄이 없으면 아래 전부가 무의미하다 |
| **프로세스 정체 불일치** (§D15) | `false` `'identity_mismatch'` | 그 PID는 우리가 등록한 프로세스가 아니다 |
| 그 외 | `true` `'owned_session_scoped'` | |

**"live 형제 세션"의 정의.** 아래 pseudocode가 정본이다 — 이전 판은 산문과 pseudocode가 **서로 반대**였다(산문은 "null·cross-host를 live로 간주", pseudocode는 그 경우 `false`를 반환). fail-closed 방향은 "판별 불가 = live"다. 판별 불가를 "죽었다"로 읽으면 곧바로 오살이기 때문이다.

```
isSiblingLive(r) =
  r.host !== os.hostname()              -> true    // 타 호스트의 PID 생존은 알 수 없다
  r.session_pid === null                -> true    // 강등된 정체 — 판별 불가
  otherwise                             -> isPidAlive(r.session_pid)
```

### D15 — PID 재사용 방어: 프로세스 정체 검증 (CRITICAL 축)

이전 판의 §Rejected Findings는 "재사용된 PID로 새 레코드가 써지는 것은 의도된 동작 — 새 `started_at`·`exec_path`로 D4가 판정한다"고 적었는데, **D4 판정표에는 그 두 필드를 비교하는 줄이 없었다.** 자기모순이고, 실제 결과는 PRD가 Critical로 지목한 바로 그 시나리오다:

> 세션 A가 pid 1234에 dashboard를 등록 → 그 프로세스가 죽음 → OS가 pid 1234를 무관한 프로세스 B에 재할당 → SessionEnd에서 `isPidAlive(1234)=true`, host·repo·session_id 전부 일치 → **B를 죽인다.** UI2 위반.

`session_id`/`host`/`repo_root`는 *세션* 정체이지 *프로세스* 정체가 아니다(architect 지적대로 `session_pid`는 Claude 세션의 pid라 spawn된 자식의 수명과 직교한다). 프로세스 정체는 별도 축으로 확인해야 한다.

**등록 측**: 레코드에 `proc_started_at_ms`를 추가한다. 자기등록은 `Math.round(Date.now() - process.uptime() * 1000)` — **OS 질의 없이** Node가 자기 시작 시각을 안다. handoff 자식(§Task 5)은 spawn 직후 `Date.now()`(오차는 아래 허용치가 흡수).

**회수 측**: `probeProcess(pid)` → `{ startedAtMs, commandLine } | null`.

두 분기 모두 **epoch ms 정수**를 직접 뱉게 해 locale/DST/시각 포맷 파싱을 아예 없앤다(R4 test 지적 — `lstart`는 locale 의존, CIM `CreationDate`는 JSON 직렬화 형태가 환경마다 다르다):

- win32: `powershell -NoProfile -NonInteractive -Command "$p=Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'; if($p){[long]($p.CreationDate.ToUniversalTime()-[datetime]'1970-01-01').TotalMilliseconds; $p.CommandLine}"` — 1행 epoch ms, 2행 commandLine
- POSIX: `ps -o etimes=,args= -p <pid>` — `etimes`는 **경과 초**(locale 무관). `startedAtMs = Date.now() - etimes*1000`. 경과 기반이라 시계 조정·DST에 영향받지 않는다

둘 다 파싱 실패·빈 출력·비-정수는 `null`(→ `identity_unverifiable`)로 접는다.

일치 판정: `|probe.startedAtMs - record.proc_started_at_ms| <= IDENTITY_TOLERANCE_MS`(기본 2000 — 시계 해상도·spawn 지연 흡수) **AND** `probe.commandLine`이 `path.basename(record.exec_path)`를 포함.

- `probe`가 `null`(미지원 플랫폼·spawn 실패·타임아웃) → `identity_unverifiable` → **죽이지 않는다**. 검증 불가에서 kill로 기우는 것은 UI2와 정반대다.
- 비용은 유계다: probe는 **앞의 7개 싼 게이트를 전부 통과한 record에만** 돈다(세션당 보통 1~2건). probe 자체에 2s 타임아웃을 걸고 남은 예산을 초과하면 `budget_exceeded`로 떨어뜨린다.

### D5 — `isReclaimableBy` 호출은 test가 강제한다 (D0의 이익)

이전 판은 "술어가 M1에 있으니 M2가 우회하려면 M1 test를 깨야 한다"고 적었다. **거짓이었다** — M1 test는 M2 코드를 실행하지 않는다. 통합으로 실제 강제가 가능해졌다:

- `reclaimSession()`은 `kill`을 **주입**받는다. test가 killer를 주입해 **어떤 pid가 죽었는지 정확히 단언**한다(§Task 8). 이것이 PRD "오살 0"의 실체다.
- 소스 스캔 test가 `session-processes.js` 안에서 `process.kill(` 호출 지점이 **정확히 1곳**(회수 경로)이고 그 함수가 `isReclaimableBy`를 거치는지 단언한다(§Task 9c).

### D6 — 실패는 stdio가 아니라 레코드로 표면화한다

stderr는 detached 자식에서 관측 채널이 아니다 — `plugins/mccp/commands/plan.md:1339-1351`은 runner stderr를 파일로 리다이렉트하고 `dashboard-server.js:510`은 `stdio:'ignore'`다.

- 등록 실패 → `<pid>.failed.json`
- 회수 실패 → `<pid>.unreclaimed.json` (`reason` + `attempted_at`)

`list()`는 `{records, failures, unreclaimed, incomplete}`를 돌려준다. `incomplete`가 참이면 **"레코드 부재 = 회수 완료"로 읽는 것이 금지**되고, 그 금지는 문서가 아니라 `reclaimSession()`의 반환값이 강제한다(§D9의 `complete:false`).

**명시 잔여**: `no_session_identity`(= `session_id` 미해석)면 쓸 디렉토리가 없어 stderr만 남는다. 세션 밖 직접 CLI 실행에서만 발생하는 **문서화된 관측 불가 구간**이다.

### D7 — reuse는 별도 레코드 (공유 상태 변경 없음)

세션 B가 세션 A의 dashboard 서버를 재사용하면 B는 **자기 세션 디렉토리에** `role:'reuse'` 레코드를 같은 `pid`로 쓴다. A의 레코드를 건드리지 않으므로 락이 없다(D3 유지). `collectSiblingReuse(repoRoot, selfSid)`가 형제 세션 디렉토리를 **읽기만** 해서 목록을 만든다 — 런타임 **수집자**가 명시적으로 존재하고(생산자는 각 세션 자신이다), `isReclaimableBy`는 `siblingReuse` 미주입 시 이 함수를 호출한다(주입은 test 편의일 뿐 유일 경로가 아니다).

### D8 — write 전 `mkdirSync(recursive:true)`

`writePrivate`(`plan-codex-runner.js:75-79`)는 tmp write + rename만 하고 **mkdir을 하지 않는다**. 세션 디렉토리가 없으면 `<pid>.json`과 `<pid>.failed.json`이 **둘 다** ENOENT로 실패해 성공도 실패도 남지 않는다. 모든 write 앞에 `fs.mkdirSync(dir, {recursive:true})`를 둔다(`dashboard-server.js:82` 선례). `recursive:true`는 EEXIST-safe라 동시 최초 등록 경쟁도 함께 닫힌다.

### D9 — 회수는 마커 뒤, best-effort, 예산 안에서

`session-end-marker.js run()`의 **가장 마지막**에 붙인다 — hook-trace 마커 write(:24-58)와 observer cleanup(:68-84) 이후. UI10대로 회수가 마커를 막을 수 없다. `hooks.json`은 **변경하지 않는다**(SessionEnd 항목 `async:true, timeout:10` 그대로).

```
reclaimSession({ repoRoot, sessionId, env, now, kill, isAlive, probeProcess, collectSiblingReuse, budgetMs }) ->
  { attempted, reclaimed, skipped, unreclaimed, complete, budgetExceeded }
```

1. `list()` → `incomplete`면 반환값 `complete:false`(회수는 계속 진행)
2. 각 record마다 **kill 직전에** `siblingReuse`를 재수집하고 `isReclaimableBy`를 다시 평가한다 — 스냅샷 1회가 아니다(§D11)
3. `kill(pid, 'SIGTERM')` 1회. **force 2단계 없음**(§D12)
4. 예산(`budgetMs`, default 6000 — hook `timeout:10`s 아래 여유) 초과 시 남은 record를 `unreclaimed`(`reason:'budget_exceeded'`)로 기록하고 중단. UI8·UI9
5. 죽은 것으로 확인된 record는 unlink, 못 죽인 것은 `<pid>.unreclaimed.json`
6. 세션 디렉토리는 **비었을 때만** `rmdir`. 남은 레코드가 있으면 다음 SessionStart가 본다

`ESRCH`(이미 죽음) → `reclaimed`. `EPERM`(권한 없음) → `unreclaimed(reason:'eperm')`. **둘을 같은 성공으로 뭉개지 않는다.**

### D10 — UI7은 토글로 남긴다 (정책 결정 아님)

`lifetime:'outlives-session'`(dashboard 서버, handoff 세션)은 **기본 회수 대상이 아니다**. `MCCP_RECLAIM_OUTLIVES=1`이면 `allowOutlives:true`가 되어 회수한다.

기본값이 "죽이지 않음"인 이유는 그것이 **현재 동작의 보존**이기 때문이다 — UI7의 답을 고르지 않으면서 운영자가 정하면 켤 자리를 남긴다. handoff 세션은 이 토글을 켜도 죽여선 안 되는데, 그건 `kind:'handoff-session'`을 회수 대상에서 **무조건 제외**해 별도로 보장한다(handoff의 존재 이유가 이 세션보다 오래 사는 것이다 — 토글로 뒤집을 대상이 아니다).

### D11 — TOCTOU 잔여를 축소하고 명시한다

kill 직전 재평가(§D9-2)로 창을 ms 단위로 줄이지만 **전역 락 없이 0으로 만들 수는 없다**.

§D15가 이 잔여를 크게 좁힌다: 정체 검증을 통과해야 kill에 도달하므로, 죽을 수 있는 대상은 **우리가 등록한 바로 그 프로세스**뿐이다. 무관한 프로세스가 죽는 경로는 없다. 남는 최악은 정확히 하나 — "형제 세션이 방금 재사용 등록한 dashboard 서버를 죽인다"이고, 피해는 **복구 가능**하다(`/mccp:dashboard` 재실행). 데이터 손실 경로가 아니다.

전역 락은 SessionEnd 10s 예산과 상충하므로 채택하지 않는다. 이 교환은 §Acceptance의 "오살 0" 문구에도 그대로 반영한다 — 검증된 축과 명시 잔여를 섞어 적지 않는다.

### D12 — force 2단계를 두지 않는다 (UI5 근거)

PRD OQ3은 graceful→force 2단계가 10s 예산을 넘길 위험을 지적한다. 이 환경(Windows 11, UI5)에서 Node의 `process.kill(pid,'SIGTERM')`은 신호가 아니라 `TerminateProcess`로 매핑되어 **이미 무조건 종료**다 — 2단계가 의미를 갖지 않는다. POSIX에서 SIGTERM을 무시하는 프로세스는 `unreclaimed`로 기록된다(UI6). 즉 설계는 위 플랫폼 주장에 **의존하지 않는다**: 참이면 죽고, 거짓이면 정직하게 미회수로 남는다. `observer-sessions.js:189-193`도 force 단계 없이 SIGTERM만 쓴다.

### D13 — PRD OQ2(codex runner)는 회수한다

`plan-codex-runner`는 `lifetime:'session'`이라 기본 회수 대상이다. 근거: SessionEnd 시점에 runner는 **이 세션이 쓸 `$ADJUDICATION` 파일을 기다리며 블록**돼 있다(`plugins/mccp/commands/plan.md` 5.5a). 세션이 사라졌으므로 그 파일은 영영 오지 않는다 — 살려 두면 900s 동안 확정적으로 무의미하게 대기한다. 죽여도 §3.13의 marker 기반 복구(`crashed` 분기)가 상태를 정직하게 보고한다. 재실행 비용은 실재하나 대기 비용이 더 크다.

### D14 — 과거 고아는 감지·보고만 (UI1)

SessionStart에서 `session-processes/` 하위의 **죽은 세션** 디렉토리를 훑어 live PID 수를 세고 한 줄로 보고한다. 회수하지 않는다 — 소유권이 불확실하다는 PRD 판단을 그대로 따른다. 기존 crash-alert 주입 경로(`session-start-trace-injector.js`)에 붙여 새 hook 등록 없이 처리한다.

## Rejected Findings (검토 후 기각 — 재제기 방지)

| 지적 | 판정 | 근거 |
|---|---|---|
| `purgeDead`→write TOCTOU로 거짓 소유권 기록 (security/HIGH, R1) | **기각 (전제 소멸)** | D3에서 등록 경로의 purge-unlink를 제거해 시퀀스가 없어졌다. 재사용된 PID로 새 레코드가 써지는 것 자체는 의도된 동작이고, **stale 레코드가 남은 채 PID가 재사용되는 경우는 §D15의 정체 검증이 닫는다**(이 판에서 신설 — 이전 판은 D4에 그 비교가 없으면서 있다고 적어 자기모순이었다) |
| `lifetime` 자기주장 위조로 회수 회피 (security/HIGH, R1) | **부분 기각** | 세팅 주체는 mccp 자신의 코드 3곳뿐이고 적대적 프로세스는 위협모델 밖이다(PRD Users/Scope 어디에도 없다). 다만 스키마가 닫힌 enum을 강제하고 Task 9c가 3곳의 리터럴을 고정한다 |
| `repo_root`가 중복·미명세 필드 (invariant/MEDIUM, R1) | **기각 (계약 명시)** | `exec_path`가 repo-relative라 없으면 해석 불가다. D4가 `cross_repo`를 판정 축에 정식 편입했다 |
| `repo_root` 절대경로가 `receipt/write.js` 정규화 선례 위반 (security/LOW, R2) | **기각 (선례 오적용)** | 그 선례는 **git-tracked audit corpus**(receipt)의 누출을 막는 것이다. 이 레지스트리는 gitignored·working-tree-only이고, `repo_root`는 판정 키라 정규화하면 기능이 사라진다 |
| `list()`가 파일 mode를 읽기 측에서 검증하지 않는다 (architect/MEDIUM, R2) | **기각** | 코드베이스에 read-side chmod 검증 선례가 없다(리뷰어도 그렇게 적었다). 파일을 world-readable로 만들 수 있는 주체는 이미 그 파일을 읽을 수 있다 — 검증이 막는 것이 없다 |
| 같은 세션에 pid 중복 레코드가 생길 수 있다 (architect/MEDIUM, R3) | **기각 (구성상 불가)** | 파일명이 `<pid>.json`이라 한 세션 디렉토리에 같은 pid의 레코드는 **최대 1개**다. 두 번째 등록은 같은 파일을 원자적으로 덮어쓴다. 시나리오가 성립하지 않는다 |
| `EXPECTED_SPAWN_SITES` 목록이 stale해질 수 있다 (invariant/LOW, R3) | **기각 (역할 오독)** | 그 상수는 **live 소스 스캔 결과와 대조되는 기대값**이다 — 스캔이 목록과 어긋나면 test가 실패한다. 목록을 안 고치면 통과가 아니라 **실패**한다. 그것이 강제 장치다 |
| Validate가 지목한 test 파일이 존재하지 않는다 (test/HIGH, R1·R2·R3) | **기각 (plan의 정의)** | 그 파일들은 이 plan의 **산출물**이다(Task 1·2·6·8·9). 실행 전에 존재하면 plan이 아니라 완료 보고다. 대신 각 test의 단언 목록을 행 단위로 명세해 반증 가능하게 만들었다 |
| `collectSiblingReuse`가 "유일 생산자"라는 서술이 부정확하다 (architect/MEDIUM, R3) | **수용 (문구 정정)** | 지적이 옳다 — reuse 레코드의 **생산자는 각 세션**이고 이 함수는 **유일 수집자**다. §D7의 문구를 "런타임 수집자"로 고쳤다 |
| `plan_hash`가 PRD를 포함하지 않아 PRD 갱신 시 receipt가 stale PRD에 묶인다 (invariant/CRITICAL, R4) | **기각 (범위 밖 — 게이트 소관)** | `planAwareMarkdownHash`(`receipt/hash.js:174`)는 mccp **receipt 계층**의 설계이고 이 plan이 바꿀 대상이 아니다. PRD drift 결속은 별도 축(`## External Research Provenance`, `plan.md` Phase 4.5)이 이미 다루며 이 PRD에는 `## References`가 없어 no-op이다. 관찰 자체는 유효하므로 [backlog](codex-findings-backlog.md) 후보로 남긴다 |
| record별 sibling 재수집이 결정 시점을 파편화한다 (invariant/HIGH, R4) | **기각 (의도된 교환)** | 대안은 1회 스냅샷인데, 그러면 **모든** record가 낡은 상태로 판정된다. 파편화는 각 record가 **가장 신선한** 상태로 판정된다는 뜻이고 엄격히 더 낫다. 비대칭 판정(N은 `{}`, N+1은 `{B}`)은 결함이 아니라 실제 세계가 그 사이에 바뀌었다는 정직한 반영이다 |
| `exec_path`를 `normalizeReceiptCwd`로 정규화 (security/HIGH, R2) | **철회 (R4에서 뒤집음)** | R2에서 수용했으나 R4 security가 그 결과 §D15 정체 대조가 항상 실패함을 지적했고 옳다. 정규화 선례는 git-tracked corpus 전용이며 이 레지스트리는 gitignored다 — `repo_root`에 이미 적용한 논리를 `exec_path`에는 반대로 적용한 비일관이었다. `exec_path`는 절대경로로 되돌린다 |
| `SESSION_ID_RE`가 점(`.`)을 허용한다 (security/MEDIUM, R5) | **기각 (선례 정합 우선)** | `session-end-trace.js:24-31`과 **동일 패턴**을 쓰는 것이 요점이다 — 세션 id는 `hook-trace/<sid>/`와 같은 값이라 패턴이 갈리면 두 디렉토리 레이아웃이 어긋난다. `.`/`..`는 명시 거부하므로 traversal은 닫혀 있고, 내부 점은 실제 세션 id(UUID) 형태에 나타나지 않는다 |
| `list()`의 readdir→`isPidAlive` 사이 TOCTOU (security/MEDIUM, R5) | **기각 (스냅샷의 정의)** | `alive`는 **관측 시점의 스냅샷**이고 그 이상을 주장하지 않는다. kill 판정은 `list()`가 아니라 §D9-2의 kill 직전 재평가 + §D15 정체 검증이 내린다 — 그 사이에 죽은 프로세스는 `ESRCH`로 `reclaimed` 처리된다 |
| `writePrivate`에 mkdir이 없어 등록이 조용히 실패한다 (security/HIGH, R5) | **기각 (지적이 곧 이 plan의 Task)** | 그것이 §D8이 진단한 결함이고 Task 1이 모든 write 앞에 `mkdirSync(recursive:true)`를 넣어 고친다. "아직 구현 안 됐다"는 plan에 대한 지적이 될 수 없다 |
| M1 롤백 시 stale 레코드 잔존 (invariant/MEDIUM, R1·R2) | **수용하되 비-작업** | gitignored이므로 VCS 롤백이 건드리지 않는 것은 맞다. `rm -rf .claude/state/session-processes/` 한 줄을 모듈 헤더와 CHANGELOG에 적는다 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/session-processes.js` | CREATE | 레지스트리 + 판정 술어 + **회수** — `register`/`registerFailure`/`list`/`unregister`/`collectSiblingReuse`/`isReclaimableBy`/`reclaimSession`/`scanForeignOrphans`/`SEMANTICS` |
| `plugins/mccp/scripts/lib/tests/session-processes.test.js` | CREATE | 스키마·mkdir·mode·경로 비-누출·강등·실패 레코드 |
| `plugins/mccp/scripts/lib/tests/session-processes-reclaimable.test.js` | CREATE | `isReclaimableBy` 판정표 8행 전수 + sibling liveness |
| `plugins/mccp/scripts/lib/tests/session-processes-reclaim.test.js` | CREATE | **오살 0** — 주입 killer로 죽은 pid 집합 단언 · 예산 · ESRCH/EPERM · 재평가 |
| `plugins/mccp/scripts/lib/tests/session-processes-spawn-sites.test.js` | CREATE | 등록 누락 0 · `openBrowser` 비등록 · `lifetime` 리터럴 · kill 지점 1곳 |
| `plugins/mccp/scripts/lib/dashboard-server.js` | UPDATE | 부팅 자기등록 + `reused` 분기 `role:'reuse'` + `close` unregister |
| `plugins/mccp/scripts/lib/tests/dashboard-server.test.js` | UPDATE | Task 3 단언 3건 추가 (R4 test HIGH — Validate가 지목하는데 표에 없었다) |
| `plugins/mccp/scripts/state/tests/session-spawner.test.js` | UPDATE | Task 5 단언 추가 |
| `plugins/mccp/scripts/lib/plan-codex-runner.js` | UPDATE | 부팅 자기등록 + 기존 `finally` unregister |
| `plugins/mccp/scripts/state/session-spawner.js` | UPDATE | win32 분기에서 자식 PID 등록 |
| `plugins/mccp/scripts/hooks/session-end-marker.js` | UPDATE | `run()` 말미에 `reclaimSession` 호출 (마커·observer 이후) |
| `plugins/mccp/scripts/hooks/tests/session-end-marker-reclaim.test.js` | CREATE | 마커 우선 순서 + 회수 throw가 마커/반환을 깨지 않음 |
| `plugins/mccp/scripts/hooks/session-start-trace-injector.js` | UPDATE | 과거 고아 1줄 보고 (D14) |
| `.gitignore` | UPDATE | `.claude/state/session-processes/` |
| `docs/ENVIRONMENT.md` | UPDATE | §11에 `MCCP_RECLAIM_OUTLIVES` · `MCCP_RECLAIM_BUDGET_MS` |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 1.23.7 → **1.24.0** (PRD 전 milestone 완료 = minor, §3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | `## [1.24.0]` |
| `.claude/prds/session-process-reclaim.prd.md` | UPDATE | M1·M2 행 in-progress + Plan 셀(동일 경로), OQ 해소 기록 |

## Tasks

### Task 1: 레지스트리 코어 (`session-processes.js` — 등록/조회)

- **Action**:
  - 경로: `registryDir(repoRoot)` = `<repoRoot>/.claude/state/session-processes`, `sessionDir(repoRoot, sid)`. `sid`는 `session-end-trace.js:24-31` `SESSION_ID_RE` 동일 패턴 + `.`/`..` 거부. **추가로 최종 경로 봉쇄**: `fs.realpathSync.native(path.dirname(target))`(부재 시 상위로 거슬러 올라가 존재하는 조상)가 `realpath(registryDir)` 하위인지 확인하고 아니면 throw — 세션 디렉토리 자체가 symlink로 심어져 경로가 밖으로 새는 경우를 닫는다(R5 security).
  - **스키마**(`SCHEMA_VERSION = 1`) — allowlist + 값 검증을 모듈이 소유:

    | 필드 | 규칙 |
    |---|---|
    | `schema` | `=== 1` |
    | `pid` | 정수 > 0 |
    | `host` | 비어있지 않은 문자열 |
    | `session_id` | `SESSION_ID_RE` 통과 |
    | `session_pid` | 정수 > 0 **또는** `null`(강등) |
    | `started_at` | `Date.parse` 유한한 ISO 8601 (**등록** 시각) |
    | `proc_started_at_ms` | 정수 > 0 — **프로세스 자신의** 시작 시각(§D15). `started_at`과 다른 축이다 |
    | `exec_path` | 비어있지 않은 문자열 |
    | `repo_root` | `path.isAbsolute` |
    | `kind` | `'dashboard-server' \| 'plan-codex-runner' \| 'handoff-session'` |
    | `lifetime` | `'session' \| 'outlives-session'` |
    | `role` | `'owner' \| 'reuse'` |

    하나라도 어긋나면 **write 거부(fail-closed)** + `registerFailure`.
  - `register(repoRoot, {kind, lifetime, role, pid, execPath, env})`:
    - 정체는 `evidence-lock.resolveSessionId/resolveSessionPid`. `session_id` 부재 → `{ok:false, reason:'no_session_identity'}` + stderr (§D6 잔여).
    - `session_pid` 부재/사망 → `null` 강등 + warn (`evidence-claim.js:80-87`).
    - `exec_path`는 **절대경로를 그대로** 넣는다. 이전 판은 `normalizeReceiptCwd`로 정규화해 repo 밖을 `<outside-repo>`로 바꿨는데, 그러면 §D15의 `basename(exec_path)` 대조가 **구조적으로 항상 실패**한다(`basename('<outside-repo>')`는 어떤 commandLine에도 없다) — handoff(`powershell.exe`)와 repo 밖 실행 전부. 그 정규화 선례는 **git-tracked audit corpus**(receipt)의 누출을 막는 것이고, 이 레지스트리는 gitignored·working-tree-only다. `repo_root`를 정규화하지 않는 것과 **같은 근거**이며, 이전 판은 그 논리를 `repo_root`에만 적용하고 `exec_path`에는 반대로 적용한 비일관이었다.
    - **`mkdirSync(sessionDir, {recursive:true})` 후** `writePrivate` 패턴(`mode: 0o600` → rename). §D8
    - throw 하지 않는다.
  - `registerFailure(repoRoot, sid, pid, reason)` → `<pid>.failed.json` (같은 mkdir/mode/원자성).
  - `list(repoRoot, sid)` → `{records, failures, unreclaimed, incomplete}`; 각 record에 `alive` 부착. 파싱 실패는 `failures`에 넣고 `incomplete=true`. throw 없음.
  - `unregister(repoRoot, sid, pid)` → best-effort unlink, 멱등.
  - `collectSiblingReuse(repoRoot, selfSid)` → 형제 세션 디렉토리의 `role:'reuse'` 레코드 배열. 읽기 전용, 디렉토리 부재/불가독은 빈 배열 + warn.
  - 모듈 헤더: 롤백 `rm -rf .claude/state/session-processes/`, `SEMANTICS` 상수(레코드 부재는 회수 완료의 증거가 아니다).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/session-processes.test.js`

  단언: (1) 정상 등록 시 12필드 온전(`proc_started_at_ms` 포함, `Date.now()-process.uptime()*1000` 근사 일치) · (2) **세션 디렉토리 부재 상태에서 등록 → 성공**(D8 회귀) · (3) POSIX에서 mode `0o600`(win32는 skip + 사유 출력) · (4) **`exec_path`가 절대경로 그대로 보존**되고 `<outside-repo>`로 치환되지 않음(§D15 대조가 성립해야 한다 — R4 회귀) · (5) `basename(exec_path)`가 실제 실행 파일명과 일치 · (6) session id 부재 → `{ok:false}` + 파일 미생성 · (7) `CLAUDE_PID` 부재 → `session_pid:null`, 등록 성공 · (8) enum 밖 `kind`/`lifetime`/`role` → 거부 + `.failed.json` · (9) `started_at` 파손 → 거부 · (10) 손상 JSON 심기 → `incomplete=true` + `failures` 1건, throw 없음 · (11) `unregister` 멱등 · (12) 서로 다른 3 pid 동시 등록 → 유실 0 · (13) `sid`에 `../` → throw, 디렉토리 밖 파일 미생성 · (14) `collectSiblingReuse`가 자기 세션은 제외하고 `role:'reuse'`만 반환

### Task 2: `isReclaimableBy` + `collectSiblingReuse` 결선

- **Action**: §D4 판정표(정체 검증 2줄 포함)를 순수 함수로 구현. `repo_root` 비교는 `fs.realpathSync.native` 정규화 후(실패 시 `path.resolve` fallback + warn). `isSiblingLive`는 §D4 pseudocode **그대로** — `session_pid:null`·cross-host는 `true`(live). 정체 검증은 `probeProcess`를 **주입**받는다(default는 §D15의 플랫폼 분기); `null` 반환은 `identity_unverifiable`로 fail-closed.

  **`siblingReuse` 목록을 인자로 받지 않는다.** 대신 `collectSiblingReuse` **함수**를 받아 호출부마다 스스로 부른다(R3 architect HIGH — 목록을 받으면 호출자가 1회 스냅샷을 캐시해 §D11 재평가 보장을 시그니처 위반 없이 무력화할 수 있다). 함수 주입은 캐싱을 구조적으로 불가능하게 만든다.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/session-processes-reclaimable.test.js`

  단언: 판정표 **10행** 각각 최소 1케이스 + 기대 `reason` 정확 일치 · reuse 시나리오(A owner outlives + B live reuse 같은 pid → `in_use_by_live_session`) · `session_pid:null` reuse → 여전히 차단 · cross-host reuse → 차단 · `allowOutlives:true`가 `lifetime_outlives_session`만 통과시키고 나머지 9행은 **여전히 차단** · symlink 경유 `repo_root`가 `cross_repo`로 오탐되지 않음(POSIX만; win32 skip) · **정체 축 3케이스**: probe가 `null` → `identity_unverifiable` / probe 시작시각이 허용치 밖 → `identity_mismatch` / probe commandLine에 `basename(exec_path)` 부재 → `identity_mismatch` · 허용치 경계(±2000ms 안) → 통과

### Task 3: dashboard 서버 자기등록 + reuse 레코드

- **Action**: `startServer`의 `writeServerPid(...)` 직후(:610) `register({kind:'dashboard-server', lifetime:'outlives-session', role:'owner', pid: process.pid, execPath: __filename})`. `server.on('close')`(:611)에 `unregister`. `bound.reused` 분기(:603-607)는 `readServerPid(repoRoot).pid`로 `role:'reuse'` 등록 — 소유자 레코드는 건드리지 않는다(D7). 등록 실패가 서버 부팅을 막지 않는다.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/dashboard-server.test.js`

  `bound.reused` 분기 구동 방법(R2 test HIGH — 이전 판은 미명세): `startServer`가 `probeIdentity`를 주입받게 하거나, ephemeral port(`--port 0`)로 **실서버를 띄운 뒤** 같은 port로 두 번째 호출한다. 후자를 기본으로 하고 CI 불안정 시 전자로 강등한다.
  단언: (a) 신규 기동 → `role:'owner'` 1건 · (b) 두 번째 세션 호출 → 그 세션 디렉토리에 `role:'reuse'`, 첫 세션 레코드 **바이트 불변** · (c) `close()` → 소유자 레코드 제거

### Task 4: plan-codex-runner 자기등록

- **Action**: lock 획득 직후 `register({kind:'plan-codex-runner', lifetime:'session', role:'owner', pid: process.pid, execPath: __filename})`, 기존 `finally`(:548-559, `releaseLock` 옆)에서 `unregister`. `nohup` detach여도 env는 상속된다(이 세션에서 `resolveSessionId`/`resolveSessionPid` 둘 다 해석됨을 실측 확인).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/session-processes-spawn-sites.test.js`

### Task 5: session-spawner handoff 세션 등록

- **Action**: `platformSpawn` win32 분기(:160-166)에서 `child.pid`를 `register({kind:'handoff-session', lifetime:'outlives-session', role:'owner', execPath:'powershell.exe', procStartedAtMs: Date.now()})`로 기록 후 `unref()`. 자식은 자기등록을 못 하므로 `proc_started_at_ms`를 부모가 spawn 직후 시각으로 넣는다(§D15 허용치 2s가 spawn 지연을 흡수). tmux 분기(:167-173)는 `detached:true`가 아니고 tmux 서버가 수명을 소유하므로 미등록 — 주석으로 남긴다. `child.pid` 부재면 skip + warn.
- **Validate**: `node --test plugins/mccp/scripts/state/tests/session-spawner.test.js` — `spawnImpl` recorder로 `{pid:4242}` 주입 후 `pid`/`kind`/`lifetime` 단언

### Task 6: `reclaimSession` — 회수 코어

- **Action**: §D9 시퀀스 구현. `kill`·`isAlive`·`now`·`budgetMs`·**`probeProcess`**·**`collectSiblingReuse`**가 전부 주입 가능(default: `process.kill`, `evidence-lock.isPidAlive`, `Date.now`, `parseInt(env.MCCP_RECLAIM_BUDGET_MS) || 6000`, §D15 플랫폼 분기, 모듈의 `collectSiblingReuse`).

  **`probeProcess` 주입은 선택이 아니라 필수 요건이다**(R5 test HIGH ×4): 없으면 Task 8 케이스 9(재사용된 PID)를 실제 PID 재사용 없이는 test할 수 없고, PRD가 Critical로 지목한 방어가 **반증 불가능**해진다. `reclaimSession`은 record마다 주입된 `probeProcess`를 `isReclaimableBy`에 그대로 전달한다.
  - `kind === 'handoff-session'` → 무조건 skip(`reason:'handoff_never_reclaimed'`), `allowOutlives` 무관(§D10)
  - **kill 직전 재평가**: record별로 `collectSiblingReuse`를 **재호출**하고 `isReclaimableBy`를 재평가(§D11). 목록이 아니라 함수를 넘기므로 캐시 스냅샷이 구조적으로 불가능하다
  - **프로세스 정체 검증**(§D15)은 앞 게이트를 통과한 record에만, probe당 2s 타임아웃. 남은 예산 < probe 타임아웃이면 probe를 돌리지 않고 `budget_exceeded`
  - **fs 오류를 삼키지 않는다**: `unlink`/`writeFileSync` 실패는 내부에서 catch해 stderr + 반환값 `writeFailures[]`에 넣는다. `.unreclaimed.json` write가 실패하면 그 사실 자체가 `writeFailures`로 드러난다 — 조용한 소실 없음(UI6)
  - `ESRCH`→`reclaimed`, `EPERM`→`unreclaimed('eperm')`, 그 외 throw→`unreclaimed(err.code)`
  - 예산 초과 → 잔여를 `unreclaimed('budget_exceeded')` + `budgetExceeded:true`
  - `list().incomplete` → 반환 `complete:false` (회수는 계속)
  - 죽은 record unlink, 못 죽인 것 `<pid>.unreclaimed.json`, 디렉토리는 **비었을 때만** rmdir
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/session-processes-reclaim.test.js`

### Task 7: SessionEnd 결선

- **Action**: `session-end-marker.js` `run()`의 **마지막**(observer cleanup 이후, `return output` 직전)에 `reclaimSession` 호출을 `try/catch`로 감싼다. 실패는 stderr + `output` 무변경. `hooks.json`은 건드리지 않는다.
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/session-end-marker-reclaim.test.js`

  단언: (a) `reclaimSession`이 throw해도 `run()`이 입력을 그대로 반환하고 hook-trace 마커가 이미 존재 · (b) 호출 순서가 마커 → observer → 회수 (spy 순서 단언, UI10) · (c) `CLAUDE_CODE_SESSION_ID` 부재 시 회수 skip

### Task 8: 오살 0 test (D0의 핵심 이익)

- **Action**: `session-processes-reclaim.test.js`. 주입 killer가 받은 pid 집합을 기대 집합과 **정확히 일치** 단언. 케이스:
  1. 자기 세션 `lifetime:'session'` owner 1건 → 죽은 pid 집합 = `{그 pid}`
  2. **다른 세션 레코드가 같은 디렉토리 트리에 있음** → 죽은 집합에 **미포함** (UI1·UI2)
  3. cross-host 레코드 → 미포함
  4. cross-repo(realpath 다름) 레코드 → 미포함
  5. `lifetime:'outlives-session'` → 기본 미포함, `MCCP_RECLAIM_OUTLIVES=1`에서 포함
  6. `kind:'handoff-session'` → **토글을 켜도** 미포함
  7. live 형제 reuse 존재 → 미포함
  8. 재평가 회귀: 1차 수집에는 reuse가 없다가 **kill 직전 재수집에서 나타남** → 미포함 (§D11 — 스냅샷 구현이면 실패한다)
  9. **stale 레코드 + 재사용된 PID**(probe 시작시각이 record와 3초 차이) → **미포함** + `identity_mismatch` (§D15 — PRD Critical 시나리오)
  9b. probe가 `null`(미지원/타임아웃) → **미포함** + `identity_unverifiable`
  9d. **실물 probe 1건**: 기본 `probeProcess`로 **이 test 프로세스 자신**(`process.pid`)을 조회해 `startedAtMs`가 `Date.now()-process.uptime()*1000`과 허용치 안이고 `commandLine`이 `node`를 포함함을 단언 — 주입 mock만 돌면 §D15 대조가 실제 OS 출력에서 성립하는지 아무도 모른다(R5 security HIGH)
  9c. 손상 레코드 → 미포함 + `complete:false`
  10. `ESRCH` 던지는 killer → `reclaimed`, `EPERM` → `unreclaimed('eperm')`
  11. `budgetMs:0` → 아무도 안 죽고 전부 `budget_exceeded`, `budgetExceeded:true`
  11b. **실시간 예산 준수**: 각 호출이 200ms 걸리는 killer 12건 + `budgetMs:600` → `reclaimSession`이 **실제 벽시계로** 예산+여유 안에 반환(단위 test지만 주입 타이머가 아니라 실측 — invariant R3 지적)
  11c. collector 호출 횟수 == 후보 record 수 (스냅샷 캐시 회귀)
  12. 회수 후 죽은 record 파일 제거 + `unreclaimed` 파일 생성 확인
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/session-processes-reclaim.test.js`

### Task 9: 회귀 test — 등록 누락 0 · 제외 · 리터럴 · kill 지점

- **Action**: `session-processes-spawn-sites.test.js`.
  - **(a) 커버리지 스캔.** glob `plugins/mccp/scripts/**/*.js` + `plugins/mccp/commands/*.md`, 제외 `**/tests/**`. 패턴: JS `/detached\s*:\s*true/`, MD `/^\s*nohup\s+node\b/m`. 히트 **파일:라인** 집합을 `EXPECTED_SPAWN_SITES`(파일 + 사유 명시)와 정확 비교. 오탐은 `reason:'comment-only'`로 **명시 등재해야만** 통과 — 암묵 무시 없음.
  - **(b) `openBrowser` 비등록 고정.** `dashboard-server.js:503-518` 본문에 `register(` 없음을 소스 검사. test 이름·주석에 D1 사유.
  - **(c) `lifetime` 리터럴 고정.** 3 호출부의 `kind`→`lifetime` 매핑 단언.
  - **(a2) 등록 호출 실존 검증.** (a)의 각 `EXPECTED_SPAWN_SITES` 항목마다 그 파일에 `register(`가 있고 기대 `kind` 리터럴이 함께 나타나는지 소스 검사한다. (a)는 spawn 지점의 **위치**만 보므로 등록이 실제로 붙었는지는 별개 축이다(R4 test 지적).
  - **(e) `list()` 소비자 화이트리스트.** `plugins/mccp/scripts/**/*.js`에서 `sessionProcesses.list(`/`.list(` 호출부를 스캔해 `session-processes.js` 자신과 test를 제외한 소비자가 **0개**임을 단언한다. 새 소비자가 생기면 test가 깨지고, 그때 `incomplete` 처리를 함께 넣도록 강제된다(R4 invariant HIGH — `incomplete`가 문서 아닌 기계 장치가 되는 지점).
  - **(d) kill 지점 유일성.** `session-processes.js` 안의 `process.kill(` 호출 중 liveness probe(`, 0)`)가 아닌 것이 **정확히 1곳**이고, 그것이 `reclaimSession` 함수 본문 안이며 같은 함수가 `isReclaimableBy`를 호출함을 소스 검사로 단언 (§D5).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/session-processes-spawn-sites.test.js`

### Task 10: 과거 고아 감지·보고 (D14)

- **Action**: `scanForeignOrphans(repoRoot, selfSid)` → 죽은 세션 디렉토리의 live PID 수. **"죽은 세션" 판정은 두 축의 OR**: (a) `session_pid`가 숫자인데 `isPidAlive` false, 또는 (b) `session_pid`가 `null`이고 디렉토리 mtime이 `ORPHAN_STALE_MS`(기본 **24시간**)보다 오래됨. 임계값을 상수로 노출하고 test가 경계 양쪽을 단언한다(R5 architect — 이전 판은 "오래됨"을 정량화하지 않았다). `session-start-trace-injector.js`의 기존 crash-alert 주입에 한 줄 추가. **회수하지 않는다**(UI1). 읽기 실패는 조용히 0 — 보고 실패가 SessionStart를 깨선 안 된다.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/session-processes.test.js` (스캔 단언 2건: 자기 세션 제외 · 죽은 세션의 live pid 카운트)

### Task 11: 릴리스 표면

- **Action**: `.gitignore`에 `.claude/state/session-processes/`(`evidence-claims/` 옆, 근거 주석). `docs/ENVIRONMENT.md` §11에 `MCCP_RECLAIM_OUTLIVES`(default off) · `MCCP_RECLAIM_BUDGET_MS`(default 6000). `plugin.json` 1.23.7 → **1.24.0**. `renderer/html.js` page-foot + `renderer/markdown.js` derived 줄 동기. `CHANGELOG.md` `## [1.24.0]` — 머지 전 `origin/main` 헤딩 중복 확인 후 forward-only 상향(§3.7, 이번 사이클 3회 재발). PRD M1·M2 행 in-progress + Plan 셀, OQ1(→D10 토글)·OQ2(→D13)·OQ3(→D12)·OQ4(→D3)·OQ5(→D14) 해소 기록.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
node --test plugins/mccp/scripts/lib/tests/session-processes.test.js
node --test plugins/mccp/scripts/lib/tests/session-processes-reclaimable.test.js
node --test plugins/mccp/scripts/lib/tests/session-processes-reclaim.test.js
node --test plugins/mccp/scripts/lib/tests/session-processes-spawn-sites.test.js
node --test plugins/mccp/scripts/lib/tests/dashboard-server.test.js
node --test plugins/mccp/scripts/state/tests/session-spawner.test.js
node --test plugins/mccp/scripts/hooks/tests/session-end-marker-reclaim.test.js
node --test plugins/mccp/scripts/hooks/tests/session-end-trace.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# kill은 session-processes.js 한 파일에만 있어야 한다.
# 초판 grep(`process\.kill\([^,]+, *['"]?SIG`)은 `process.kill(pid)`·`(pid, 9)`를
# 놓쳤고, 후속 판은 주석까지 잡았다. 규칙: 주석 라인 제거 후, liveness probe가
# 아닌 `process.kill(`가 추가됐다면 그 파일이 session-processes.js여야 한다.
node -e '
  const { execSync } = require("child_process");
  const diff = execSync("git diff origin/main --unified=0 -- plugins/mccp/scripts plugins/mccp/hooks",
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let file = null; const bad = [];
  for (const raw of diff.split(/\r?\n/)) {
    const m = /^\+\+\+ b\/(.+)$/.exec(raw);
    if (m) { file = m[1]; continue; }
    if (!raw.startsWith("+") || raw.startsWith("+++")) continue;
    const code = raw.slice(1).replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (!/process\.kill\s*\(/.test(code)) continue;
    if (/process\.kill\s*\([^)]*,\s*0\s*\)/.test(code)) continue;   // liveness probe
    if (file === "plugins/mccp/scripts/lib/session-processes.js") continue;
    bad.push(file + ": " + raw.slice(1).trim());
  }
  if (bad.length) { console.error("VIOLATION: kill outside session-processes.js:\n" + bad.join("\n")); process.exit(1); }
  console.log("ok: kill confined to session-processes.js");
'

# hooks.json 무변경 (새 hook 등록도, timeout 변경도 없다)
git diff --name-only origin/main -- plugins/mccp/hooks/hooks.json | grep -q . \
  && { echo "VIOLATION: hooks.json changed"; exit 1; } || echo "ok: hooks.json untouched"

# 레지스트리가 커밋물로 새지 않는지
git status --porcelain | grep -q "\.claude/state/session-processes" \
  && { echo "VIOLATION: registry not gitignored"; exit 1; } || echo "ok: gitignored"

# §3.5.1 — 머지가 조용히 지운 파일 없는지
git diff --diff-filter=D --name-only origin/main...HEAD
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 다른 세션·다른 사용자 프로세스를 죽인다 (UI2) | Medium | D4 판정표 + Task 8의 주입 killer 집합 단언 12케이스. **prose가 아니라 test가 지표다** |
| kill 직전 재평가 이후에도 남는 TOCTOU | Low | D11 — 창을 ms로 축소, 최악은 dashboard 서버 1개 종료(복구 가능). 전역 락은 10s 예산과 상충해 미채택 |
| SessionEnd 10s 예산 초과로 마커가 잘린다 | Medium | D9 — 회수를 마커·observer **뒤에** 배치, `budgetMs` 6000 기본, 초과 시 즉시 중단 + 기록. Task 7(b)가 순서를 단언 |
| 진행 중 codex 리뷰 종료로 작업 유실 | Medium | D13 — 세션이 없으면 adjudication도 없으므로 대기가 무의미. §3.13 marker 복구가 상태를 정직 보고. 재실행 비용은 수용 |
| 세션 디렉토리 부재로 등록·실패 기록이 **둘 다** 실패 | Medium | D8 — 모든 write 앞 `mkdirSync(recursive:true)`. Task 1 단언 2가 회귀 고정 |
| 레코드 부재를 "회수 완료"로 오독 | Medium | D6 — `list().incomplete` → `reclaimSession().complete:false`. 문서가 아니라 반환값 |
| SIGTERM 무시 프로세스가 POSIX에 남는다 | Low | D12 — force 단계 없이 `unreclaimed`로 정직 기록(UI6). 설계가 플랫폼 주장에 의존하지 않는다 |
| Windows 시계 점프(>2s)로 `identity_mismatch` 오탐 → 회수 실패 | Low | 방향이 fail-closed다(죽이지 않고 `unreclaimed` 기록). POSIX는 `etimes`(경과 초) 기반이라 무관. 손실은 회수 누락이지 오살이 아니다 |
| 등록이 프로세스 시작보다 크게 늦어 `proc_started_at_ms`가 어긋난다 | Low | 세 호출부 전부 부팅 직후(`writeServerPid` 직후 / lock 획득 직후 / spawn 직후)라 지연이 ms 단위다. 2s 허용치가 흡수하며, 초과해도 fail-closed(미회수)다 |
| `realpathSync` 실패로 `cross_repo` 오탐 → 회수 전멸 | Low | D4 — 실패 시 `path.resolve` fallback + warn. Task 2가 symlink 케이스 단언 |
| 병렬 브랜치와 1.24.0 version 충돌 | Medium | §3.7, 이번 사이클 3회 재발. CHANGELOG 헤딩 중복 확인 후 forward-only 상향 |

## Acceptance

- [ ] Task 1~11 완료 · Validation 전 항목 통과
- [ ] **기존 test 파일 갱신** — `dashboard-server.test.js`·`session-spawner.test.js`에 신규 레지스트리 단언이 실제로 추가됨(Files to Change 표에 UPDATE로 등재)
- [ ] **`exec_path`가 절대경로로 보존** — §D15 대조가 성립함이 Task 1 단언 4로 고정됨
- [ ] **오살 0이 test다 (판정 가능한 전 축)** — Task 8에서 주입 killer가 받은 pid 집합이 기대와 정확히 일치. cross-session · cross-host · cross-repo · live-reuse · handoff · **stale PID 재사용(`identity_mismatch`)** · **정체 미검증(`identity_unverifiable`)** 전부 미포함.
      **명시 잔여 1건**: §D11의 ms 단위 TOCTOU. §D15 이후 이 창으로 죽을 수 있는 대상은 *우리가 등록한 dashboard 서버*뿐이고(무관 프로세스 아님) 복구 가능하다. 단위 test는 타이밍 경쟁을 재현하지 않으므로 **이 한 건은 test가 아니라 문서화된 교환**이다 — 여기 섞어 적지 않는다
- [ ] **kill이 `isReclaimableBy`를 거친다** — Task 9(d)가 kill 지점 유일성과 술어 경유를 소스 검사로 고정
- [ ] **재평가가 스냅샷이 아니다** — Task 8 케이스 8(1차 수집엔 없고 kill 직전에 나타난 reuse)이 통과
- [ ] **마커가 회수보다 먼저** — Task 7(b) 순서 단언 통과 (UI10)
- [ ] **`hooks.json` 무변경** — 새 hook 등록도 timeout 변경도 없음이 Validation으로 확인됨
- [ ] **등록 누락 0** — D1 실측 집합 전부가 레지스트리를 경유하고 Task 9(a)가 새 spawn 지점을 기계적으로 잡는다. 오탐 제외는 명시 등재로만 가능. PRD "3곳"은 §D1로 대체됨을 PRD에 기록
- [ ] **`openBrowser` 비등록** + **3 호출부 `lifetime` 리터럴**이 test로 고정됨
- [ ] **디렉토리 부재에서도 등록이 성공** (Task 1 단언 2 — D8 회귀)
- [ ] **미회수 가시화** — `<pid>.unreclaimed.json` + `complete:false`. `ESRCH`와 `EPERM`이 구분됨. `no_session_identity` 잔여가 문서화됨
- [ ] **`exec_path` 절대경로 보존** — §D15 `basename` 대조가 성립함. (이전 판의 "repo 밖 → `<outside-repo>`" 요구는 §Rejected Findings에서 **철회**됐다 — 정규화는 그 대조를 구조적으로 항상 실패시킨다. R5에서 4명 전원이 이 모순을 지적했고, D15/Task 1은 고쳤는데 이 줄만 stale하게 남아 있었다)
- [ ] PRD Open Question 5건이 전부 해소 기록됨 (OQ1→D10 토글 · OQ2→D13 · OQ3→D12 · OQ4→D3 · OQ5→D14)
- [ ] `.claude/state/session-processes/` gitignored · mode `0o600`(POSIX) · 롤백 한 줄이 모듈 헤더와 CHANGELOG에 있음
- [ ] `MCCP_RECLAIM_OUTLIVES` · `MCCP_RECLAIM_BUDGET_MS`가 `docs/ENVIRONMENT.md` §11에 등재
- [ ] plugin.json **1.24.0** + footer 2면 + CHANGELOG 동기
- [ ] Patterns mirrored, not reinvented

## Out of Scope

- **과거·타 세션 고아의 회수** — 감지·보고까지만 (UI1, D14)
- **손자 프로세스 트리** — mccp가 직접 spawn한 자식까지 (UI3)
- **`.end` 마커 누락 근본 원인** — 회수가 그 경로를 지나가지만 개선을 **주장하지 않는다** (UI4)
- **Windows/POSIX 프로세스 그룹 통일** (UI5)
- **force kill 2단계** (D12)

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~51k.

### Findings (severity-ranked)

- **[CRITICAL][security]** PID reuse attack: killing by PID alone after session end could kill unrelated processes if the PID was recycled by the OS — PRD §Risk 'PID 재사용으로 무관한 프로세스를 죽인다' (Medium likelihood, Critical impact). Mitigation cited: ownership verification with (session_id, host, start_time, 실행경로) combination. Current codebase has pidAlive() in dashboard-server.js:98 which uses process.kill(pid,0), but only checks liveness, not ownership.
- **[HIGH][architect]** Concurrent registration from three independent spawn sites (dashboard-server.js:510, session-spawner.js:163, plugins/mccp/commands/plan.md:1339 nohup) lacks atomic write guarantee. Registry can lose updates or record partial state if two sites register simultaneously. — dashboard-server.js:510 `spawn(...{detached:true})` and session-spawner.js:163 both call `unref()` with no coordination. plugins/mccp/commands/plan.md launches plan-codex-runner detached at line 1339 via nohup. No shared lock or atomic append mechanism shown in scope. PRD Scope §1 bounds recovery to 'own session' but doesn't mandate sync between registration points.
- **[HIGH][architect]** 10-second SessionEnd timeout (plugins/mccp/hooks/hooks.json:352 `timeout: 10`) creates hard upper bound on recovery work. PRD Risks §3 names this risk but MVP design must clarify: best-effort async + marker-first strategy, or fail on recovery timeout? — SessionEnd hook timeout is exactly 10s. PRD Risks §3 says 'graceful → force 2단계를 넣으면 초과 위험' and suggests 'best-effort'. But PRD Success Metrics §2 requires '미회수는 사유와 함께 기록' — surfacing failures loudly (not silently). No design commits: async spawn + mark + return? Or synchronous kill within 10s?
- **[HIGH][security]** Registry file could leak sensitive information: process paths, arguments, PIDs, session IDs, work patterns — Process spawn points (dashboard-server.js:510, session-spawner.js:163-171) store executable and working directory; registry location (.claude/state/) will be readable by local users. Parallel precedent: meta.cwd normalization in receipt/write.js:44-50 exists precisely to avoid leaking working-tree paths into git-tracked corpus. Registry should follow same redaction pattern.
- **[HIGH][security]** TOCTOU race: between registry write and process kill, OS could recycle the PID for a different process if ownership verification is incomplete — dashboard-server.js:98-107 pidAlive() only checks PID liveness with signal 0, not process identity. Registry must capture and validate: (pid, session_id hash, host, start_time, process_kind). Session IDs are trustworthy (utils.js:146 sanitizeSessionId validates them), but start_time window must be precise enough to avoid ambiguity without leaking timing side-channels.
- **[HIGH][test]** Ownership validation oracle for PID reuse is underspecified for testing. The PRD requires ownership via (session_id, host, start_time, 실행 경로) but no test validates a reused PID cannot cause accidental process kill. — PRD line 74 Risk 'PID 재사용으로 무관한 프로세스를 죽인다' (Medium likelihood, Critical impact) requires ownership check. Mitigation states '(session_id, host, start_time, 실행 경로) 조합' but no test oracle exists that validates: (a) stale PID reused by unrelated process is protected, (b) ownership check gates process.kill(), (c) cross-session PIDs are never touched.
- **[HIGH][test]** Atomic marker-write + recovery ordering is not enforced by test. The PRD mitigation 'marker write를 회수보다 먼저' has no test that validates this order or validates recovery failure doesn't prevent marker write. — PRD line 77 Risk mitigation: '마커 write를 회수보다 **먼저** 수행'. No test in session-end-trace.test.js validates this order or the fail-open invariant (marker write succeeds even if recovery fails). Existing pattern: session-end-trace.js line 10 mentions 'Compactor failure never blocks SessionEnd' but test coverage is absent.
- **[HIGH][explorer]** Three detached spawn points already capture PIDs but none register with session; need centralized registration at spawn time — dashboard-server.js:510-514 (browser spawn), session-spawner.js:161-172 (powershell/tmux spawn), plugins/mccp/commands/plan.md:1339-1351 (nohup plan-codex-runner captured as $RUNNER_PID but never tracked to session); all use child.unref() pattern
- **[MEDIUM][architect]** Registry storage location creates boundary ambiguity: session-keyed state (process list per session) vs. global state (all sessions in one file). PRD scope is 'own session only' but registry design doesn't commit to structure. — PRD §3 Open Questions #7 names 'registry 저장 위치' as unresolved. Existing patterns show both: hook-trace uses per-session dirs (`.claude/state/hook-trace/<sid>/`), while orchestration-runaway.json is global (`.claude/state/`). Plan-codex-runner uses per-decision lease files. No design specifies which pattern session-process-reclaim should adopt.
- **[MEDIUM][architect]** Registry growth is unbounded across sessions. SessionStart cleanup (PRD Risks §4 'registry가 stale PID로 채워져') is mentioned but left as a future task, not part of MVP scope. No pruning policy defined (e.g., retention window, max entries per session). — PRD MVP scope lists '(1) register, (2) recover at SessionEnd, (3) surface failures' but **not** cleanup. 'Out of scope' §2 names 'past sessions' recovery. SessionStart could accumulate entries indefinitely if cleanup is post-MVP.
- **[MEDIUM][architect]** Open Questions #1 (dashboard server lifetime) and #2 (detached codex runner recovery timing) directly constrain registry design but are deferred. Registry must not assume answers: e.g., does 'long-lived dashboard' need a 'do-not-kill' marker? Does in-flight codex review death lose work? — PRD Open Questions §1-2 and Scope §3-4. Plan-codex-runner.js §3 documents runner stays alive 900s for adjudication. If SessionEnd kills it, marker-based recovery (§3.13) can restore — but decision is out-of-scope.
- **[MEDIUM][architect]** Host-aware PID ownership verification is required (PRD Risks §1 'PID 재사용으로 무관한 프로세스를 죽인다') but adds complexity. Design must mirror existing host-aware tri-state pattern (pr-phase-lock.js, v0.2.8-generic-receipt-quarantine.js) but extended to detached-process recovery. — plugins/mccp/scripts/migrations/tests/host-aware-reclaim.test.js establishes tri-state: same-host+alive+fresh → never reclaim, same-host+alive+stale → reclaim (PID-reuse), cross-host+stale → reclaim, cross-host+fresh → no reclaim. PRD Risks §1 mitigation names '(session_id, host, start_time, 실행 경로)' — but 'execution path' adds validation surface not covered by existing patterns.
- **[MEDIUM][architect]** SessionEnd marker write must precede process kill. Current fail-loud-open pattern (session-end-marker.js:43-58) writes trace marker even if observer cleanup fails. Registry recovery must maintain same invariant: marker written before kill, so failure to kill doesn't lose the SessionEnd record. — session-end-trace.js:90-104 writeDegradedEndMarker precedes ht.markSessionEnd and guarantees marker write despite module failure (B#4/B#5). PRD Risk §4 '회수 로직 자체가 SessionEnd를 깨뜨려' mitigates this explicitly: 'write marker BEFORE recovery'. Current test coverage is via session-end-marker.js (observer only); registry recovery has no parallel test.
- **[MEDIUM][architect]** Registry interaction with existing session lifecycle (STATE.md, hook-trace, dispatch envelopes) is undocumented. Each creates session-keyed state in `.claude/state/`; merging with registry requires clarifying read/write ordering and cleanup ordering during SessionEnd. — hook-trace (session dirs + leases + LRU), STATE.md (git-tracked persistence), dispatch-controller (envelope heartbeats), observer-sessions.js (project leases). No integration diagram shows process registry in relation to these.
- **[MEDIUM][security]** SessionEnd hook timeout (10s) may be exceeded if process reclamation blocks or involves many children, leaving processes unreclaimed and `.end` marker possibly unwritten due to timeout — plugins/mccp/hooks/hooks.json:352 defines SessionEnd with 'timeout: 10'. PRD §Risks notes 'Medium' likelihood. Mitigation (PRD): make reclamation best-effort, write marker before attempting kills, degrade to async kill attempts. Current session-end-marker.js:39-45 implements fail-loud-open marker pattern that should be reused.
- **[MEDIUM][security]** Registry JSON input validation missing: malformed entries should not crash cleanup code; session_id, pid, host fields need type and format validation — schema.js uses UUID_V4_RE (line 55), typeof checks, and GIT_SHA_RE patterns. No existing registry validator for session-process entries. Must validate: session_id format (sanitized string), pid (positive integer), host (non-empty string), start_time (ISO 8601), process_kind (enum: dashboard|session-spawner|codex-runner).
- **[MEDIUM][security]** Cross-session interference: registry-based cleanup must not kill processes owned by other concurrent sessions or prior orphaned sessions — PRD §Scope explicitly excludes 'other sessions・past sessions' reclamation ('소유권이 불확실하다'). MVP kills 'self-owned' only. Plan must enforce session_id matching at kill time, never cross-session. Session IDs are session-scoped per CLAUDE_SESSION_ID env (observer-sessions.js:127), trustworthy boundary.
- **[MEDIUM][security]** Permission checks on Windows: process.kill() with EPERM (access denied) must be handled gracefully; cannot distinguish 'process inaccessible' from 'process not found' — dashboard-server.js:104-105 pidAlive() correctly treats EPERM as 'process exists'. But when actually killing, EPERM means we lack permissions (cross-user or elevated). Must log EPERM distinctly (failed-to-kill) vs ESRCH (already-dead), not both as 'success'.
- **[MEDIUM][test]** Success Metric 2 (등록 누락 0) lacks a regression test that enforces all 3 spawn points go through a common registry. New spawn sites risk omission without test coverage. — PRD line 38 requires 'spawn 경로 회귀 test' but no such test exists in plugins/mccp/scripts/. The three spawn points (dashboard-server.js:510, session-spawner.js:163, plan-codex-runner detached invocation via nohup in plugins/mccp/commands/plan.md:1339) have no shared test that validates registry.register() is called by each.
- **[MEDIUM][test]** Recovery failure visibility ('loud' failures, line 40) is not validated by test branches. Silent recovery failures and marker-write failures are not distinguished. — PRD line 40 ' 미회수 가시화 — 회수 실패가 loud하게 표면화(조용한 실패 0)'. session-end-trace.test.js (lines 18-102) covers marker write and lease cleanup but has NO test for: (a) recovery-failure stderr output, (b) recovery failure does not prevent marker write, (c) incomplete recovery is logged vs. silent.
- **[MEDIUM][test]** SessionEnd timeout budget (10s) and recovery completion are not validated. No test proves recovery.js stays within timeout or has a documented timeout branch. — PRD line 66 Open Question 'SessionEnd의 async:true + timeout 10s — 회수가 이 예산 안에 끝나야 한다'. Existing pattern in plugins/mccp/scripts/lib/tests/plan-command-marker-states.test.js line 234 validates timeout prose ('the documented timeout state needs an implementation'). No equivalent test for recovery budget exists.
- **[MEDIUM][test]** Edge case: process exits between pidAlive(pid) check and process.kill(pid). No test validates graceful handling of ESRCH or EPERM. — Plan-codex-runner.js line 82-83 defines pidAlive(). Between ownership validation and kill, process could exit naturally or be killed by another session. No test validates error handling: process.kill(pid, 9) throws code 'ESRCH' (process gone) or 'EPERM' (permission, Windows group leak). Session-end-trace.test.js has no ESRCH/EPERM branch.
- **[MEDIUM][test]** Cross-session process protection: test only validates hook-trace lease behavior, not process ownership isolation. — PRD line 39 success metric '오살(誤殺) 0 — 다른 세션·다른 사용자의 프로세스를 죽이지 않음'. session-end-trace.test.js lines 40-56 test session lease isolation (NOT touching other sessions' leases) but do NOT test process recovery does not kill other sessions' PIDs. Ownership validation must include cross-session boundaries.
- **[MEDIUM][explorer]** pidAlive() helper duplicated across codebase; should be centralized in utils.js — dashboard-server.js:98-107 and plan-codex-runner.js:81-83 both implement identical logic (process.kill(pid,0) + EPERM check)
- **[MEDIUM][explorer]** Session tracking infrastructure already established via observer-sessions.js; session-process registry should extend this pattern — observer-sessions.js:123-150 implements getSessionLeaseDir(), writeSessionLease(), removeSessionLease(); session-end-marker.js:61 already resolves CLAUDE_SESSION_ID; registry location matches existing .claude/state/ pattern used by session-spawner.js:45-46
- **[MEDIUM][explorer]** Host-aware tri-state PID reclaim logic already implemented and battle-tested; plan should reuse pr-phase-lock.js pattern — pr-phase-lock.js:100-135 implements same-host+pid-alive (NEVER reclaim) vs same-host+pid-dead (reclaim) vs cross-host (mtime-only); session-spawner.js:110-120 already reuses this exact pattern; protects against PID reuse accidents per PRD risk matrix
- **[MEDIUM][explorer]** Graceful process termination pattern already exists; stopObserverForContext(context) in observer-sessions.js provides SIGTERM → cleanup template — observer-sessions.js:172-198 implements process.kill(pid,0) liveness check, SIGTERM signal, then fs.rmSync cleanup; this matches PRD's need for 'graceful → force 2-stage' and fail-open timeout budget (10s SessionEnd timeout)
- **[MEDIUM][explorer]** SessionEnd hook ready for integration point; session-end-marker.js already calls observer cleanup, can extend with process reaping — plugins/mccp/hooks/hooks.json:344-356 routes SessionEnd to session-end-marker.js with 10s timeout; session-end-marker.js:62-86 already has resolveSessionId() and observer context wired; fail-loud-open pattern established L24-58 for degraded paths when module fails
- **[MEDIUM][explorer]** Ownership token + hash verification pattern exists; pr-phase-lock.js provides hashToken() and verifyTokenAgainstLock() for preventing unauthorized process kills — pr-phase-lock.js:139-146 exports hashToken(raw), L130 verify pattern reused in session-spawner.js:130; aligns with PRD risk mitigation '(session_id, host, start_time, execution_path)' ownership validation
- **[LOW][architect]** State consistency across multiple readers (SessionEnd hook, SessionStart cleanup, manual diagnostics) requires a single source of truth for registry schema. No canonical schema location identified; pattern should mirror hook-trace.js (schema defined in module, enforced at write). — hook-trace.js lines 38-58 define SHARD_ENTRY_FIELDS allowlist + validation. Registry needs equivalent. PRD doesn't name schema (process ID, session key, timestamp, host, pid liveness flag, command/path?). Schema validation is implicitly part of 'owning' state but not explicitly designed.
- **[LOW][architect]** Windows-specific process recovery is out-of-scope (PRD Scope §4) but environment is Windows 11 (CLAUDE.md §3.8). Design must at least document Windows limitations (e.g., `process.kill()` behavior differs; `detached` child process group handling). Parallel platform behavior unspecified. — Scope §4 explicitly excludes 'Windows/POSIX unification'. Environment is 'Windows 11 Pro'. dashboard-server.js:507-510 platform-branches already exist (cmd.exe vs. open vs. xdg-open). Registry recovery via process.kill() will have platform-specific behavior not covered by test on Windows.
- **[LOW][security]** Stale registry accumulation: old session entries will persist in .claude/state/session-processes.json; no cleanup path for terminated session ownership records — PRD §Risk 'registry가 stale PID로 채워져 커진다' (Medium, Low impact). Mitigation: 'SessionStart에서 종료된 세션분을 정리'. No storage format specified. Orphan detection (pidAlive check) exists but cleanup must be explicit; concurrent cleanup must not race with active session's processes.
- **[LOW][security]** Session ID spoofing risk: CLAUDE_SESSION_ID env is trusted but plan must not allow arbitrary registry entries to be created by unprivileged code — observer-sessions.js:127-128 resolves CLAUDE_SESSION_ID via sanitizeSessionId. Registry write must require presence of valid CLAUDE_SESSION_ID at registration time. If registration happens in a spawned child with detached+unref, child's env could be altered. Must capture session_id + verify at registration, not at kill.
- **[LOW][test]** Registry storage atomicity and corruption handling not tested. PRD Open Question (line 67) asks where to store registry, but no test validates atomic writes or stale-state recovery. — PRD line 67 '레지스트리 저장 위치'. Existing pattern in hook-caps.js (lines 38-44, writeCache + ensureDir) shows `.claude/state/` + gitignore pattern, but no test validates registry write is atomic (tmp+rename) or reads handle partial/corrupted state.
- **[LOW][explorer]** Registry location and gitignore pattern already established; hook-caps.json stored in .claude/state/ with gitignore:52-54 protecting .worktrees/ — hook-caps.js:22-23 uses CACHE_DIRNAME = .claude/state/, writeFileSync with atomic tmp+rename L83-85; .gitignore:52-54 has '.worktrees/' gitignored; session-spawner.js:45-46 uses same .claude/state/ directory; PRD Open Question about registry location answered by existing pattern
- **[LOW][explorer]** Session-ledger.js provides lock-and-heartbeat infrastructure (LOCK_STALE_MS, locked write) that could model persistent registry — session-ledger.js:9-31 defines schema versioning (v1→v2 with last_seen_at), heartbeat TTL (DEFAULT_HEARTBEAT_TTL_MS = 5min), lock retry pattern (LOCK_MAX_RETRIES=50); withLedgerLock pattern could template session-process-registry to avoid write races
- **[LOW][explorer]** Receipt write locking patterns already established; evidence-lock.js exists for stamping critical metadata atomically — evidence-lock.js implements withLedgerLock fail-closed semantics and .lock file pattern; this de-risked the 'registry write race' concern in PRD scope; similar fail-closed lock can protect session-process-registry.json writes

### Meta-gaps

- Registry schema design and validation: what fields, format (JSON object, JSONL, per-process file), and allowlist are canonical?  _(architect)_
- Atomic write protocol for concurrent registration from dashboard-server, session-spawner, plan-codex-runner: lock-based, append-only, or lexically-ordered writes?  _(architect)_
- SessionStart cleanup retention policy: how old can a session entry be before SessionStart purges it (7 days? 30 days? per-session grace period)?  _(architect)_
- Async vs. sync recovery within 10s SessionEnd timeout: does recovery spawn detached cleanup processes, or block until done?  _(architect)_
- Failure surfacing contract: what constitutes 'loud' failure? Stderr line, STATE.md entry, hook-trace record, or all three?  _(architect)_
- Integration with marker-based recovery (§3.13 intent-gate recovery): if SessionEnd kills plan-codex-runner mid-flight, what state do markers reach and how does it interact with intent adjudication?  _(architect)_
- Dashboard server lifecycle decision (Open Q#1): does registry *assume* dashboard should be killed, or remain agnostic and let a separate config flag control it?  _(architect)_
- Windows-specific process kill and group semantics: does recovery use process.kill() directly, or platform-conditional logic (Windows job objects vs. POSIX signal groups)?  _(architect)_
- PRD does not specify registry file format/schema (JSON field names, version, structure)  _(security)_
- PRD does not detail Windows vs POSIX signal handling: SIGTERM graceful shutdown vs immediate SIGKILL fallback policy  _(security)_
- PRD does not specify how to validate actual process ownership beyond PID+session_id (e.g., checking /proc/[pid]/cmdline on Linux, or Get-Process on Windows for process start time)  _(security)_
- PRD does not address how to handle processes that refuse SIGTERM (timeout before SIGKILL? how long?)  _(security)_
- PRD does not specify error logging/visibility: should failed kills appear in STATUS.md, hook-trace, or only stderr?  _(security)_
- PRD does not detail registry cleanup: should stale entries be auto-purged, or scanned on SessionStart? What staleness threshold?  _(security)_
- PRD does not specify registry file location or .gitignore coverage (assumes .claude/state/ like hook-caps.json, but not stated)  _(security)_
- PRD does not address process spawning during SessionEnd itself: if a command spawn is in-flight as hook runs, could race conditions create orphans?  _(security)_
- Open Question from PRD: 'dashboard 서버는 회수 대상인가' — security design depends on explicit product policy, cannot be inferred from infrastructure  _(security)_
- Registry write contract (atomicity, corruption recovery) — PRD Open Question §4.7 but no test specification for registry mutation semantics (create, update, query, cleanup, SessionStart purge of stale sessions)  _(test)_
- Recovery budget measurement — no runnable check shows recovery.js stays under 10s; comparison point is plan-command-marker-states.test.js line 234 pattern ('needs an implementation, not just prose')  _(test)_
- Host-aware tri-state ownership logic — PRD references existing pr-phase-lock.js (line 74 cites CLAUDE.md §3.6) but no test demonstrates same pattern applies to process recovery (same-host-pid-alive=never-reclaim, cross-host=mtime-only)  _(test)_
- Platform-specific kill semantics — PRD scope excludes 'Windows/POSIX 프로세스 그룹 통일' (line 53) but tests must validate Windows graceful+force 2-phase kill and POSIX signal handling  _(test)_
- Marker-write precedence enforcement — no test validates session-end-trace.runSync or recovery.js enforces marker-write-first ordering; existing fail-open pattern (line 10) is documented but not unit-tested  _(test)_
- PRD does not specify whether to extend observer-sessions.js module or create new session-process-registry.js module; existing patterns suggest extending observer-sessions (reuse context resolution, lease pattern)  _(explorer)_
- Open Question about dashboard server 'long-lived' flag not addressed in existing code — no existing 'exempt processes from SessionEnd reaping' mechanism exists  _(explorer)_
- PRD does not specify registration trigger — whether each spawn site should register immediately, or a single registration point should be called during SessionStart  _(explorer)_
- No specification of registry schema (fields beyond PID, session_id, host, start_time, path); existing observer-sessions.json and hook-caps.json schemas provide templates but schema design is unspecified  _(explorer)_
- PRD's 'graceful → force 2-stage' process kill policy not defined: SIGTERM wait duration, then SIGKILL; observer-sessions.js does SIGTERM without force stage  _(explorer)_

### Patterns to mirror

- Session-keyed directory structure: `.claude/state/hook-trace/<session_id>/` pattern from hook-trace.js with per-session dirs and session-qualified leases. Apply to process registry: e.g., `.claude/state/session-processes/<session_id>.json` or `.claude/state/session-processes/<session_id>/<pid>.json`.  _(architect)_
- Host-aware tri-state reclaim logic: plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js#tryReclaimStaleLock: {same-host+alive+fresh→never, same-host+alive+stale→reclaim, same-host+dead→reclaim, cross-host+stale→reclaim, cross-host+fresh→no reclaim}. Extend to incorporate command/path validation.  _(architect)_
- Lease + in-loop heartbeat: plan-codex-runner.js#LOCK_LEASE_MS (15min) + periodic utimesSync. Apply to registry: long-lived processes (dashboard, codex-runner) could heartbeat their registry entries if SessionEnd waits for graceful kill.  _(architect)_
- Lock body schema: pr-phase-lock.js uses {pid, host, started_at, token}. Adapt for process registry: {pid, host, session_id, started_at, process_name, token, do_not_kill?}.  _(architect)_
- Fail-loud-open marker write: session-end-trace.js#writeDegradedEndMarker ensures marker despite recovery failure. Ensure process registry kills are post-marker, and failures are stderr-loud.  _(architect)_
- Validation test parallel: plugins/mccp/scripts/migrations/tests/host-aware-reclaim.test.js (7 test cases for reclaim logic). Mirror with registry-specific ownership + concurrent registration + timeout tests.  _(architect)_
- Session cleanup and LRU: hook-trace.js#evictLRU purges stale session dirs. Registry cleanup should attach to the same SessionStart path or explicit cleanup command, not a separate mechanism.  _(architect)_
- dashboard-server.js:98-107 — use pidAlive(pid) pattern for liveness check via process.kill(pid, 0); handle EPERM as 'process exists but inaccessible'  _(security)_
- pr-phase-lock.js:144-146 — use hashToken(uuid) pattern for ownership verification; store hash not raw token  _(security)_
- pr-phase-lock.js:17-21 — use host-aware tri-state reclaim policy: same-host+alive → never reclaim; same-host+dead → reclaim; cross-host → mtime-only  _(security)_
- receipt/schema.js:55, 79, 87 — use UUID_V4_RE regex and typeof+regex patterns for strict input validation; fail-closed on mismatch  _(security)_
- receipt/write.js:44-50 — normalize sensitive paths to repo-relative form (not absolute) when storing in persistent registry to avoid leaking worktree paths  _(security)_
- receipt/write.js:82-85 — use atomic write pattern: tmp file with pid+random suffix, then atomic rename  _(security)_
- session-end-marker.js:24-56 — use fail-loud-open pattern: write marker BEFORE attempting risky operations, degrade gracefully on failure  _(security)_
- observer-sessions.js:127-128 — trust CLAUDE_SESSION_ID from environment after sanitizeSessionId() validation; session IDs are audit-critical  _(security)_
- dashboard-server.js:68-87 writeServerPid() pattern — include host+pid+timestamp in ownership metadata; validate at read time with 4-way AND (host AND pid AND path AND time)  _(security)_
- hook-caps.js:24-40 — store per-machine transient state in .claude/state/<filename>.json, not git-tracked; include staleness markers (mtime, probed_at)  _(security)_
- plugins/mccp/scripts/state/tests/session-spawner.test.js:19-28 — spawn recorder pattern (mock spawnImpl to capture and verify calls)  _(test)_
- plugins/mccp/scripts/lib/tests/plan-command-marker-states.test.js:230-238 — timeout implementation test (validate documented timeout behavior with runnable check, not just prose)  _(test)_
- plugins/mccp/scripts/lib/pr-phase-lock.js:1-42 — host-aware ownership model (os.hostname(), crypto.randomUUID token, tri-state reclaim logic: same-host+pid-alive=never, cross-host=mtime-only)  _(test)_
- plugins/mccp/scripts/hooks/tests/session-end-trace.test.js:12-17 — tmpRepo test fixture pattern (fs.mkdtempSync, cleanup in try-finally)  _(test)_
- plugins/mccp/scripts/lib/hook-caps.js:38-44 — atomic cache write pattern (tmp+rename, ensureDir prior)  _(test)_
- plugins/mccp/scripts/lib/pr-phase-lock.js:139-146 — ownership token hash function (exportable so tests can compute expected values without re-implementing)  _(test)_
- pr-phase-lock.js:100-135 — host-aware tri-state reclaim logic (same-host+pid-alive vs dead vs cross-host mtime)  _(explorer)_
- dashboard-server.js:98-107 — pidAlive() helper (process.kill(pid,0) + EPERM check); should extract to utils.js  _(explorer)_
- dashboard-server.js:68-125 — PID file management: writeServerPid/readServerPid/isReusablePid atomic tmp+rename pattern  _(explorer)_
- observer-sessions.js:137-162 — session lease write/remove with ensureDir; session context resolver already integrated into session-end-marker.js  _(explorer)_
- observer-sessions.js:172-198 — graceful process termination: liveness check → SIGTERM → cleanup; template for SessionEnd reaper  _(explorer)_
- session-spawner.js:85-121 — ownership token + lease-based lock pattern reused from pr-phase-lock  _(explorer)_
- session-end-marker.js:24-58 — fail-loud-open pattern for degraded paths when module load fails; use for registry I/O failures  _(explorer)_
- evidence-lock.js — withLedgerLock fail-closed semantics and .lock file pattern for atomic registry writes  _(explorer)_
- session-ledger.js:9-31 — heartbeat TTL + schema versioning (v1→v2 pattern); model for registry evolution if needed  _(explorer)_
- plugins/mccp/hooks/hooks.json:344-356 + session-end-marker.js:1-20 — SessionEnd hook entry point; existing 10s timeout budget and async:true execution  _(explorer)_

## Design Critique

- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료 (4 anchor)
- 트리거 축: (a) detector positive — `impeccable-detect.js`가 `renderer/html.js` · `renderer/markdown.js`를 design surface로 판정
- 실제 design surface 범위: **version 리터럴 동기 2줄**(§3.7이 요구하는 5면 동기의 일부). 새 UI 표면·컴포넌트·섹션 도입 0
- 4 anchor 대조:
  | Anchor | 이 plan이 rendered surface에 추가하는 것 | 판정 |
  |---|---|---|
  | 정보 위계 3단계 (heading depth ≤ 3) | `status.html`/`STATUS.md`에 heading 추가 0 | 위반 없음 |
  | 강조색 화면당 1개 | accent/highlight token 변경 0 | 위반 없음 |
  | raw markdown marker 금지 | footer는 plain version 문자열 — marker 도입 0 | 위반 없음 |
  | 한 화면 항목 수 상한 | `list-of-N` 섹션 변경 0 | 위반 없음 |
- rounds: 1 (R0에서 수렴) · cap: 2 · verdict: **CONVERGED**
- 남는 gap: produced-diff는 critique이 구조적으로 못 본다. `/mccp:prp-implement` Phase 3.7 grounding lint(H15)가 그 축을 닫는다

## Design Routing Guide

routing mode: `auto` (effective at implement stage). plan 단계는 렌더된 UI가 없으므로 실제 invoke 없이 checklist로만 기록한다. 이 plan의 rendered-surface 변경이 version 리터럴뿐이라, 아래 command 대부분은 implement에서도 content signal 미달로 강등될 것으로 예상된다.

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

<!-- placeholder: will be replaced by Phase 7.3 -->
