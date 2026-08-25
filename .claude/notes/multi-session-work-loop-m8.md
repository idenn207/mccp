# multi-session-work-loop M8 — 게이트 산출물 · 라이브 완주 증거 · 한계

**plan**: `.claude/plans/multi-session-work-loop-m8.plan.md`
**version**: 1.33.0 (§3.7 — PRD 전 milestone 종료이므로 minor)
**작성**: 2026-08-25

---

## 게이트 산출물

| 게이트 | 결과 |
|---|---|
| Plan-Codex (`mccp-plan-codex`) | **슬러그 드리프트**로 `-m8` 아래에는 부재. `mccp-plan-codex/multi-session-work-loop.json`이 이 plan의 `plan_hash`(`sha256:3b5b0470…`)와 바이트 일치하므로 게이트는 **실제로 실행됐다**. `review_verdict='divergent'`(L2 패널 quorum 3-of-4 미충족)가 `MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion` 아래 정직하게 봉인돼 있다 |
| Implement-Codex (`mccp-implement-codex/multi-session-work-loop-m8.json`) | 작성 완료. `codex_verdict='skipped'`(`MCCP_CODEX_DISABLED=1` first-class skip) · `impeccable_silent_skip=true` (`reason=no-signal`) · `security_skipped=false` |
| security-reviewer | 실행됨. **BLOCK**(HIGH 1 · MEDIUM 4 · LOW 1) → R1에서 전건 흡수, 미해소 CRITICAL/HIGH **0건** |
| impeccable | `design_signal=false` (게이트 시점 diff에 렌더 표면 없음 — EXECUTE 전). plan 시점 critique 루프가 2라운드 CONVERGED로 DD11을 이미 고정 |

### 슬러그 드리프트에 대해

`/mccp:plan`이 PRD 경로로 실행돼 receipt가 `multi-session-work-loop`로 발행됐는데,
`/mccp:prp-implement`는 plan 경로에서 `multi-session-work-loop-m8`을 도출한다. 형제
milestone(M2·M4·M5·M6·M7)이 전부 `-mN` 슬러그를 쓰므로 `-m8`이 옳은 목표다.

CLAUDE.md §3.16이 이 경우를 명시한다 — "슬러그가 안 맞는다고 파일명을 바꾸지 않는다
… 우회가 필요하면 우회를 쓰고 사유를 남긴다". receipt 파일명 변경도 blind write도
하지 않았다(blind write는 divergent를 converged로 위장하게 된다). 프로젝트 설정의
`MCCP_RECEIPT_GATE_MODE=soft`가 missing-only를 통과시키는 정책이라 hook은 정보성
ALLOW를 냈다.

**`/mccp:pr`에서 같은 우회가 한 번 더 필요하다** — terminal 게이트는 hard-block이다.

---

## 라이브 완주 증거 (DD10 — 워크트리 hook 직접 실행)

실 세션의 hook은 `~/.claude/plugins/cache/mccp/mccp/<version>/`에서 도는데 캐시 최고
버전이 **1.30.0**이라 이 코드가 들어 있지 않다. 그래서 DD10이 규정한 대로 워크트리
스크립트를 **실제 payload로 직접 실행**해 증명했다.

| 산출물 | 이전 | 이후 |
|---|---|---|
| `msw-events` kind 집합 | `evidence_guard_active` **한 종류뿐**(트리 전체 116건) | `evidence_guard_active` · `session_start` · `session_end` · `task_started` |
| `*.env-snapshot.json` | 트리 전체 **0건** | 1건 |
| B3 | `forward-only` | **`computed` 20/116** |
| A1 분모 | 세션 수(계약 위반) · producer 부재 | distinct work_unit · producer 발화 확인(`startups_producer_present=true`) |

차단 경로가 emit하지 않는다는 불변식도 우연히 실증됐다 — POSIX cwd로 hook을 돌렸을
때 validate가 `blocking`을 내 BLOCK 경로로 갔고, 그 실행은 `task_started`를 남기지
않았다.

### PR 생성 후 재실행 (POST)

`task_completed`·`task_ship_sealed`는 이 milestone 자신의 `/mccp:pr`에서 처음
발화한다. **아래는 PR 생성 직후 1회 실행해 채운다.**

```bash
node -e "const fs=require('fs');const d='.claude/state/msw-events';const k={};fs.readdirSync(d).forEach(f=>fs.readFileSync(d+'/'+f,'utf8').split(/\r?\n/).filter(Boolean).forEach(l=>{try{k[JSON.parse(l).kind]=1}catch(_){}}));for(const need of ['task_completed','task_ship_sealed'])if(!k[need]){console.error('POST producer missing: '+need);process.exit(1)}console.log('POST live kinds:',Object.keys(k).join(','))"
node plugins/mccp/scripts/derive/cli.js run --json   # A1 numerator 전환 확인
```

**결과**: (PR 생성 후 기록)

---

## 한계 (정직히 기록)

1. **A1은 이 주기 안에 `computed`에 도달하지 못한다.** 완주 신호의 첫 데이터가 이
   milestone 자신의 PR 생성 시점에만 생기는 구조적 순환이다. 소급 backfill은 §A1이
   금지하므로 하지 않았다. `m8-after.json`은 커밋 시점 상태를 그대로 박제한다.

2. **A2는 표본 0건이고 원인은 M8 밖이다.** 배선은 완료됐고 게이팅 오라클의 4경로
   (일치 · 불일치 · 신선도 초과 · legacy 스냅샷)는 unit test가 단언한다. 그러나
   라이브 표본이 없다:
   - `session-bridge`의 `context_remaining_pct` 자체가 `null`이다(하네스 텔레메트리).
   - 전역 `context-current.json`은 11일 전 다른 세션의 `tool_count=900`이라
     out-of-order 가드가 이후 write를 건너뛴다.

   **표본을 지어내지 않았다.** `writeState`를 직접 불러 값을 심으면 배선이 아니라
   측정 자체를 위조하는 것이고, 그것이 UI2가 금지하는 바다.

3. **설치 캐시가 1.30.0이다.** 머지 후 `claude plugin update`가 필요하다. 그 전까지
   실 세션에서는 이 producer들이 자동 발화하지 않는다.

4. **A3는 `insufficient`로 남는다.** M8이 CLAUDE.md를 편집하므로 재측정해도 다시
   낡는다. M4 축이라 손대지 않았다.

5. **C2/C3 귀속 커버리지는 0/0이다.** 기존 12건의 finding은 M8 이전에 기록돼
   `gate_decision_id`가 없다. 배선은 신규 emit부터 적용된다. status는 `forward-only`를
   유지하며 값을 만들지 않는다(DD8 · UI8).

6. **`Axis B (f)` test가 이 셸에서 붉다.** `MCCP_CONTEXT_MONITOR_COST_WARNINGS=0`이
   경고를 억제하는데 그 test가 토글을 격리하지 않는다. **M8 변경과 무관**함을
   `env -u`로 확인했고 backlog에 이연했다.

---

## plan과 다른 점

| # | plan | 실제 | 근거 |
|---|---|---|---|
| 1 | Task 9 승인 emit 지점 "정확히 5개" | **7개** | 실측 호출자가 7이다. plan이 선재하는 정당한 두 지점(`receipt/evidence-lock.js` M3 · `state/handoff-items.js` M2)을 빠뜨렸다. 5로 두면 gate가 착지 즉시 붉어진다. `plan-conflict-detector` 판정 `conflict:false`(minor deviation) |
| 2 | Task 2 (c) "4개 해소기의 반환값이 변환 전후 **동일**" | 축을 둘로 나눔 | 문자 그대로면 `observer-sessions`·`session-bridge`의 **깨진 체인을 보존하라**는 요구가 된다(그 수정이 milestone 자체다). 완전한 체인을 갖고 있던 둘은 8조합 전수 등가를, 깨져 있던 둘은 (정규화 불변 + 죽은 후보 부활)을 단언한다 |
| 3 | Task 8 test를 `toggle-snapshot.test.js`에 추가 | `msw-m8-producers.test.js`에 배치 | 집합 등식·제외 1:1·은퇴 0건 세 단언이 전부 M8 축이라 M8 회귀 파일에 모았다. 검사 내용은 동일 |
| 4 | `assertion-manifest-check.js`는 무변경 전제 | `TITLE_PREFIX`에 `M8` 추가 + `REQUIRED_IDS`에 M8 20건 추가 | 그 검사기의 접두사 allowlist가 `B1|C1`만 허용해 M8 id가 통과 불가였다. 하한 하드코딩은 그 파일의 기존 패턴이다 |
