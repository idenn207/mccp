# 관측 · 대시보드 · 증거

> `docs/ENVIRONMENT.md`의 **observability** 도메인 상세. 색인은 값과 기본값만 싣고 서사는 여기 있다.

대시보드 렌더, 저널, 증거 claim 가드, 세션 프로세스 회수, worktree 스캔을 지배한다. 판정을 바꾸지 않고 «무엇이 보이는가»만 바꾸는 축이다.

## 읽는 법

각 토글은 자기 이름의 앵커를 갖고, 그 아래에 값·기본값·소비처·사용 예시가 온다. `값` 열의 어휘는 **문서가 가르치는 표기**이고, 파서가 실제로 받아 주는 별칭 집합은 그보다 넓다 — 정확한 집합은 색인의 «값 규약»에 있다.

**사용 예시**는 전부 `.claude/settings.json`의 `env` 블록에 그대로 붙여 넣을 수 있는 형태다. 1회성으로만 쓰는 토글은 셸 예시를 함께 둔다.

## 토글

### MCCP_RENDER_TRIGGER_DEBOUNCE_MS

**종류** `int` — **값** 자유 문자열 — **기본값** `5000`

**한 줄** 재렌더 debounce.

**소비처** `plugins/mccp/scripts/lib/renderer/trigger.js:233`

**사용 예시**

```json
{
  "env": {
    "MCCP_RENDER_TRIGGER_DEBOUNCE_MS": "5000"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_RENDER_TRIGGER_DEBOUNCE_MS=5000     # default. Content debounce window in ms for `triggerRender`. 짧추면 burst trigger가 render thrash 위험, 길게 두면 STATUS.md가 늦게 따라옴. ─ live (M4)
```

### MCCP_RENDER_LOCK_LEASE_MS

**종류** `int` — **값** 자유 문자열 — **기본값** `90000`

**한 줄** 렌더 lock lease.

**소비처** `plugins/mccp/scripts/lib/renderer/trigger.js:235`

**사용 예시**

```json
{
  "env": {
    "MCCP_RENDER_LOCK_LEASE_MS": "90000"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_RENDER_LOCK_LEASE_MS=90000          # default. `.claude/cache/.render.lock` 의 lease 길이. host-aware tri-state reclaim(§3.6) — same-host live PID는 lease 만료해도 NEVER reclaim. 단일 render는 ~200-500ms이므로 90s는 generous safety margin. ─ live (M4)
```

### MCCP_DASHBOARD_STALE_DAYS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** plan stale 판정 일수.

**소비처** `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js:20`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_DASHBOARD_STALE_DAYS": "1"
  }
}
```

### MCCP_STATE_JOURNAL

**종류** `enum` — **값** `enforce` · `shadow` · `off` — **기본값** `enforce`

**한 줄** STATE.md 저널 기록.

**소비처** `plugins/mccp/scripts/lib/state-journal/index.js:29`

**값별 결과**

- `enforce` — STATE.md 쓰기를 저널 경로로 강제한다.
- `shadow` — 저널을 기록하되 직접 경로도 함께 쓴다 (관측 전용).
- `off` — 저널을 끈다. loud warn이 나간다.

**제거된 값** — `on`은 코드에 없다. 같은 의도의 값은 `enforce`이며, 코드의 3상태를 문서가 boolean으로 축약한 것이 어긋남의 원인이었다. 수동 전용 축이라 자동 강등 경로는 없고, `.degraded` 마커가 있으면 값과 무관하게 직접 경로를 탄다(마커 > 토글).

**사용 예시**

```json
{
  "env": {
    "MCCP_STATE_JOURNAL": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_STATE_JOURNAL=enforce|shadow|off  # v1.23.10 default: enforce. STATE.md를 append-only 저널의 **파생 투영물**로 두는 축. enforce = `state-writer.update()`가 레코드 append → 재투영 → 기존 `renderState` 경로로 STATE.md를 쓴다(렌더 바이트·공개 시그니처 불변) / shadow = 저널 append는 **계속하되** STATE.md 쓰기만 M5 이전 직접 경로로 되돌린다(회귀 진단 데이터를 남기는 것이 이 값의 목적 — 회귀 test가 "shadow 산출 == M5 이전 산출 byte-identical" ∧ "저널 레코드 수 == enforce" 두 축을 단언한다) / off = 저널 비활성 + loud warn. 미지정·오타 → enforce + loud warn. **운영 계약**: ① 발동은 **수동 전용**(자동 강등 경로 없음 — 그쪽은 `.degraded` 마커의 일이고 append 실패라는 관측 사실에 매인다) ② 지속은 **프로세스 수명**(env를 지우면 다음 프로세스는 enforce로 복귀, 상태 파일에 기록하지 않으므로 sticky하지 않다) ③ 우선순위는 **마커 > 토글**(`.degraded`가 있으면 enforce여도 직접 경로이며, 토글은 마커를 지우지 못한다 — 지우는 것은 `journal checkpoint --reseed` 하나뿐) ④ `shadow`가 되돌리는 것은 STATE.md **쓰기 경로만**이다. 이 토글이 M5가 추가하는 **유일한** 신규 축이다(UI11 — 보존 기간·용량 상한·세그먼트 회전 임계는 전부 상수이고 test 주입만 허용). 진단: `node plugins/mccp/scripts/state/cli.js journal verify --json`(content_hash 전수 · 투영↔디스크 일치 · degraded 마커 · malformed 라인 · ledger seed 무결성 5축, 하나라도 실패 시 비영점 exit).
```

> 위 원문 보존 블록은 원 숫자(U+2460 계열)를 v1.23.10 문서 그대로 둔다 — Validation 3의 고아 대조가 정규화 없이 일치를 요구한다. 그 글자는 터미널에서 빈 칸으로 보이므로 운영 계약 4항을 평문으로 적는다: (1) 발동은 수동 전용 (2) 지속은 프로세스 수명 (3) 우선순위는 마커 > 토글 (4) `shadow`가 되돌리는 것은 STATE.md 쓰기 경로뿐.

### MCCP_EVIDENCE_CONFLICT_GUARD

**종류** `enum` — **값** `enforce` · `warn` · `off` — **기본값** `enforce`

**한 줄** 중복 claim 가드 모드.

**소비처** `plugins/mccp/scripts/receipt/evidence-lock.js:104`

**값별 결과**

- `enforce` — fail-closed lock과 fence를 건다. 중복 claim이 감지되면 쓰기를 막는다.
- `warn` — 관측과 이벤트는 유지하되 차단하지 않는다 (복구용 kill switch).
- `off` — guard 전체를 끈다. loud warn이 나간다.

미설정과 열거 밖 값은 `enforce`로 되돌아간다.

**사용 예시**

```json
{
  "env": {
    "MCCP_EVIDENCE_CONFLICT_GUARD": "warn"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_EVIDENCE_CONFLICT_GUARD=enforce|warn|off  # v1.23.1 default: enforce (fail-closed). 모든 receipt write(store.writeReceipt/updateReceipt · briefing/completion-ledger 메타 stamp)와 claim mutation을 감싸는 evidence write lock의 동작 축. enforce = lock 미획득·claim fence 거부·덮어쓰기 관측이 전부 throw(단 hash-carved 메타 stamper 2건은 fail-open + loud skip — 의도적 비대칭) / warn = 관측과 이벤트 기록은 그대로 두되 **차단하지 않음**(정체된 receipt 복구용 kill switch, race window 개방) / off = guard 전체 비활성(lock·fence·덮어쓰기 검출 모두 없음, loud stderr warn). 미지정·오타 → enforce. 이 토글이 M3이 추가하는 **유일한** 신규 축이다(B3 토글 증가 억제) — lease(5s)·claim TTL(15분)·retry 예산은 상수이고 test 주입만 허용한다. 복구 절차: `EVIDENCE_LOCK_UNAVAILABLE` 에러가 lock 절대경로 + 잔여 lease + 재시도 지침을 포함하므로, 정지한 holder는 lease 만료 후 자동 reclaim되고 재실행이 1차 복구다.
```

### MCCP_EVIDENCE_STAGE_ROOT

**종류** `list` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 증거 스테이징 루트.

**소비처** `plugins/mccp/scripts/lib/evidence-stage-guard.js:154`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**멤버 어휘**

**허용 토큰** — 열거 없음. 멤버가 디렉토리 경로라 열거 어휘가 존재하지 않는다.

**미상 멤버** — 멤버 분리가 일어나지 않는다 — 파서는 값 전체를 단일 디렉토리 경로로 쓰고 미설정이면 cwd로 되돌린다 (evidence-stage-guard.js:154). kind가 list인 것은 오기이며 그 정정은 별도 축으로 이연한다

**사용 예시**

```json
{
  "env": {
    "MCCP_EVIDENCE_STAGE_ROOT": "a,b"
  }
}
```

### MCCP_SESSION_LEDGER_SCOPE

**종류** `enum` — **값** `global` · `repo` · `hybrid` — **기본값** `global`

**한 줄** 세션 원장 조회 범위.

**소비처** `plugins/mccp/scripts/state/session-ledger.js:210`

**값별 결과**

- `global` — 프로젝트 디렉토리 하나만 읽고 쓴다.
- `repo` — 저장소의 .claude/state/session-ledgers만 본다. 저장소 밖이면 global로 되돌아간다.
- `hybrid` — global과 repo를 함께 읽고 쓰기는 global을 primary로 쓴다.

**제거된 값** — `host`는 `VALID_SCOPES`에 없다. 여러 위치를 함께 보려던 것이라면 오늘의 값은 `hybrid`다.

**사용 예시**

```json
{
  "env": {
    "MCCP_SESSION_LEDGER_SCOPE": "repo"
  }
}
```

### MCCP_RECLAIM_OUTLIVES

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** 잔존 프로세스 회수.

**소비처** `plugins/mccp/scripts/lib/session-processes.js:1118`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_RECLAIM_OUTLIVES": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_RECLAIM_OUTLIVES=0|1                # default: 0. **알려진 한계 — 켜기 전에 읽을 것**: 다른 세션이 이 dashboard를 빌려 쓰고 있다는 사실은 그 세션이 남기는 `role:'reuse'` 레코드로만 소유자에게 전달된다. 빌리는 세션에 **해결 가능한 세션 식별자가 없으면 그 레코드를 쓸 수 없고**(어느 디렉토리에 쓸지 정할 수 없다), 소유자는 사용 중임을 알 방법 없이 서버를 SIGTERM한다. 빌리는 쪽은 loud stderr로 경고하지만 **복구하지는 못한다** — 소유자는 다른 프로세스다. 합성 식별자로 우회할 수도 없다: reuse 레코드의 liveness는 `session_pid`가 정하는데, 재사용 경로에서 살아있는 주체는 Claude 세션(=`CLAUDE_PID`)이고 그것이야말로 지금 식별 불가능한 대상이며, 대신 CLI 프로세스의 pid를 쓰면 즉시 죽어 가드가 되지 못한다. 즉 이 토글은 **"세션보다 오래 사는 것을 거두겠다"는 선언이고, 공유 dashboard가 죽을 수 있다는 뜻을 포함한다**(PRD OQ1이 미해소로 열어둔 제품 질문). 기본값 0이 오늘의 동작이다. =1이면 SessionEnd 회수가 `lifetime:'outlives-session'` 레코드(현재 dashboard 서버)까지 대상에 넣는다. 기본이 off인 이유는 "dashboard 서버가 세션보다 오래 살아야 하는가"가 미해소 제품 질문(PRD OQ1)이라 기본값이 오늘의 동작을 보존하기 때문 — 이 토글이 운영자 opt-in이다. **`kind:'handoff-session'`에는 도달하지 않는다**: 세션보다 오래 사는 것이 handoff의 존재 이유라 §D4가 무조건 제외하며 이 토글로 뒤집히지 않는다. 나머지 차단 행(cross-session/cross-host/cross-repo/live-reuse/정체 검증)도 전부 그대로 유효하다. ─ live (M2)
```

### MCCP_RECLAIM_BUDGET_MS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 회수 시간 예산.

**소비처** `plugins/mccp/scripts/lib/session-processes.js:1104`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_RECLAIM_BUDGET_MS": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_RECLAIM_BUDGET_MS=6000              # default: 6000. **무엇을 묶는가(정확히)**: (1) 레코드 루프는 각 레코드 처리 **직전에** 경과를 검사해 초과분을 전부 `budget_exceeded`로 넘긴다, (2) probe의 worst case를 미리 예약해 감당 못 할 probe는 시작하지 않는다 — v1.27.0(M3)부터 그 예약은 **레코드마다가 아니라 sweep당 1회**다, (3) 형제 스윕(§D11 때문에 memoize 불가 — 레코드마다 전 형제 디렉토리를 다시 읽는다)은 같은 deadline을 물려받아 초과 시 `incomplete`로 끊는다 → fail-closed(kill 안 함). **묶이지 않는 것**: 루프 진입 전 자기 세션 디렉토리 1회 `list()`. 그 크기는 자기가 등록한 프로세스 수(현재 최대 3종)라 실질 상수다. 즉 hard wall-clock cap이 아니라 **레코드 단위 granularity의 예산**이다. SessionEnd hook timeout이 10s이고 회수는 마커·observer **뒤에** 돌므로 그 안에 여유를 남긴다. 초과분은 조용히 버려지지 않고 `<pid>.unreclaimed.json` + `budgetExceeded=true` + stderr로 표면화된다(UI6). probe의 worst case를 미리 예약하므로, 예산이 probe 타임아웃보다 작으면 정체 검증이 아예 시작되지 않고 전부 `budget_exceeded`가 된다. **v1.27.0(M3) 이전에는 그 예약이 레코드마다 걸려 처리량 천장이 됐다** — win32 probe는 `Get-CimInstance Win32_Process`라 유휴 머신에서도 3.2~3.7s가 걸리는데(측정), 예약 규칙이 probe 시작 창을 `6000 − 5000 = 1000ms`로 좁혀 두 번째 레코드부터 굶었다. 실측: 자식 3개 등록 시 기본 예산으로 1개만 회수하고 2개 누수, 상한 9000으로 올려도 2개가 천장. M3이 probe를 **배치**(sweep당 1회 호출로 전 pid 조회)로 바꿔 그 천장을 없앴다 — 비용이 pid 수가 아니라 호출 횟수에 붙기 때문이다(1 pid 3.4s vs 3 pid 3.9s). 같은 조건 재측정: 3개 → 3개 회수·0 누수, 6개 → 6개 회수·0 누수(4.1s). **상한 9000ms로 clamp된다** — hook timeout(10s)을 넘는 값을 주면 loud warn 후 9000으로 깎인다. 넘기면 sweep이 hook timeout에서 중도 사살되는데, 그때 사라지는 것이 바로 부분 sweep의 유일한 증거인 `.unreclaimed.json`이라 예산 상향이 감사 가능성을 없앤다. 하향은 자유다(회수가 덜 될 뿐 오살 위험이 없다). ─ live (M2)
```

### MCCP_RECLAIM_IDENTITY_TOLERANCE_MS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 동일성 판정 허용 오차.

**소비처** `plugins/mccp/scripts/lib/session-processes.js:946`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_RECLAIM_IDENTITY_TOLERANCE_MS": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_RECLAIM_IDENTITY_TOLERANCE_MS=<int> # default: win32 500 / POSIX 1500 (플랫폼 분기). §D15 정체 검증에서 "레코드에 적힌 프로세스 시작 시각"과 "지금 그 PID의 실제 시작 시각"의 허용 오차. **상향만 반영한다** — 하향·비정수는 loud stderr warn 후 무시된다. 하향을 허용하면 POSIX `ps -o etimes=`의 초 단위 양자화만으로 정상 프로세스가 전부 `identity_mismatch`가 되어 회수가 env 한 줄로 조용히 전멸하기 때문이다. 상향은 지원되는 완화 경로다(예: 시계 점프로 오탐이 잦은 환경). ─ live (M2)
```

### MCCP_WORKTREE_SCAN_CAP

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** worktree 스캔 상한.

**소비처** `plugins/mccp/scripts/derive/sources/worktrees.js:280`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_WORKTREE_SCAN_CAP": "1"
  }
}
```

### MCCP_WORKTREE_ACTIVE_DAYS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** worktree active 일수.

**소비처** `plugins/mccp/scripts/derive/sources/worktrees.js:290`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_WORKTREE_ACTIVE_DAYS": "1"
  }
}
```

### MCCP_LEADTIME_GIT

**종류** `bool` — **값** `on` · `off` — **기본값** `on`

**한 줄** 리드타임 git 증인 spawn.

**소비처** `plugins/mccp/scripts/lib/leadtime-derive.js:96`

**극성** 미설정이면 **켜져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**끄면 사라지는 것은 축이 아니라 증인이다.** `off` 는 리드타임 축을 끄지 않는다. 백분위(`panel_span` · `post_panel_span`)와 커버리지는 **그대로** 산출되고, 빠지는 것은 미짝 레코드를 *분류*할 때만 쓰이는 git 증인뿐이다. 대가는 `not_shipped` 가 도달 불가가 되어 그 행이 `unclassified` 로 떨어지는 것이다. 축 자체를 끄는 토글이 아니라는 점이 요점이다 — 축을 끄면 "커버리지 없는 값을 내지 않는다"가 지키려는 관측 자체를 잃는다.

**끈 것은 조용히 꺼지지 않는다.** `off` 로 돈 산출물의 `degradations` 에 `git-disabled` 가 실린다. `.claude/state/leadtime/distribution.json` 이나 `--json` 출력에서 그 값을 보면, `unclassified` 증가는 코퍼스의 성질이 아니라 **이 토글의 결과**로 읽어야 한다. 그 신호가 없는데 `unclassified` 가 늘었다면 그것은 진짜 코퍼스 변화다.

**표면에도 뜬다.** 파일에만 실으면 약속이 절반만 참이다 — 대시보드를 보는 운영자는 레버를 당긴 사실을 볼 수 없다. STATUS.md · status.html · `leadtime.js` 사람 출력의 한 줄 **바로 아래 문단**에 `관측 축소: git-disabled` 가 붙는다(`손상` 이 아니다 — 운영자가 줄인 관측을 손상으로 적으면 반대 방향의 거짓이 된다). 한 줄 자체는 토글 양쪽에서 동일하다: 꺼진 것은 증인이지 분포가 아니기 때문이다.

**언제 끄는가** 렌더 경로의 git spawn 비용이 문제일 때다. 실측(이 저장소): `derive(worktreeScan:true)` 2371ms 대 `audit()` 371ms 로 렌더 경로에 약 16% 추가된다. M3 까지는 `allowGit: true` 가 하드코딩돼 이 레버 자체가 없었고, 되돌릴 수단이 없다는 것이 M4 가 고친 결함이다.

**사용 예시**

```json
{
  "env": {
    "MCCP_LEADTIME_GIT": "off"
  }
}
```
