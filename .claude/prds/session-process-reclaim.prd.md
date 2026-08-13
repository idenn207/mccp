# 세션 종료 시 프로세스 회수 (H3)

> 우산: [review-loop-trust.prd.md](review-loop-trust.prd.md) — day 0 병렬. 리뷰 루프 축과 의존 없음.
> 원 제기: 운영자 항목 5

## Problem

mccp가 백그라운드로 띄운 자식 프로세스가 **세션 종료 후에도 회수되지 않는다.** `SessionEnd` 훅은 마커만 쓰고 프로세스를 죽이지 않으며, detached + `unref()`로 분리된 자식은 부모가 사라져도 계속 산다.

방치 비용: 세션을 반복할수록 고아 프로세스가 누적된다. dashboard 서버는 포트를 계속 점유하고, detached codex runner는 15분(900s) 타임아웃까지 살아 있으며, spawn된 세션은 자체 수명을 갖는다. 사용자가 이를 인지할 채널도 없다.

## Evidence

- **`SessionEnd`에 훅이 하나뿐이고 회수 로직이 없다** — [hooks.json:344-356](../../plugins/mccp/hooks/hooks.json)에 `session-end-marker.js` 단독(`async: true`, timeout 10). 해당 스크립트에 `process.kill` 호출 **0건** — observer cleanup만 수행.
- **detached 생성 지점 실측**:
  - [dashboard-server.js:510-514](../../plugins/mccp/scripts/lib/dashboard-server.js) — `spawn(cmd, args, {stdio:'ignore', detached:true})` + `child.unref()`
  - [session-spawner.js:163-171](../../plugins/mccp/scripts/state/session-spawner.js) — `{cwd, detached:true, stdio:'ignore'}` + `unref()`
  - [plan-codex-runner.js](../../plugins/mccp/scripts/lib/plan-codex-runner.js) — codex 900s > Bash 600s 회피용 detached runner + marker poll(CLAUDE.md §3.13)
- **`unref()`는 자식을 죽이지 않는다** — 부모가 자식을 기다리지 않게 할 뿐. 운영자 관찰이 정확하다.
- **회수에 필요한 인프라는 이미 있다** — dashboard는 `.dashboard-server.pid` + `pidAlive()`로 재기동 시 중복을 감지하고, plan-codex-runner는 lease lock + `pidAlive`로 orphan을 판정한다. **PID 추적은 존재하고 SessionEnd에 연결만 안 돼 있다.**
- **인접 신호** — 본 세션 SessionStart가 `.end` 마커 없이 끝난 prior session **3건**을 보고했다. 마커 누락과 회수 부재가 같은 SessionEnd 경로에 있다.

## Users

- **Primary**: mccp 세션을 하루에 여러 번 여닫는 운영자 — 포트 충돌, 정체 불명 node 프로세스, 예상치 못한 파일 변경을 겪는 시점.
- **Not for**: 의도적으로 세션보다 오래 살아야 하는 프로세스 — 있다면 회수 대상에서 명시적으로 제외해야 한다(Open Question).

## Hypothesis

We believe **mccp가 띄운 detached 자식의 PID를 세션 단위로 등록하고 `SessionEnd`에서 회수하는 것**이 **고아 프로세스 누적을 막는 데** 유효하다 — for **mccp 운영자**.
We'll know we're right when **세션 종료 후 그 세션이 띄운 mccp 자식 프로세스가 남지 않고, 회수하지 못한 경우 그 사실이 조용히 넘어가지 않고 표면화될 때**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| **[primary] 회수율** | 세션이 띄운 detached 자식 중 종료 시 회수되는 비율 (미회수는 사유와 함께 기록) | 세션 레지스트리 + 종료 후 `pidAlive` 확인 |
| 등록 누락 0 | detached spawn 지점 3곳이 전부 레지스트리를 경유 | spawn 경로 회귀 test |
| **오살(誤殺) 0** | 다른 세션·다른 사용자의 프로세스를 죽이지 않음 | 소유권 검증 test |
| 미회수 가시화 | 회수 실패가 loud하게 표면화(조용한 실패 0) | 실패 경로 test |
| `.end` 마커 신뢰도 | 마커 누락 세션 수 감소 | SessionStart crash alert 빈도 |

## Scope

**MVP** — (1) mccp가 detached로 띄우는 자식의 PID를 **세션 키 기반 레지스트리**에 등록, (2) `SessionEnd`에서 그 세션 소유분만 회수, (3) 회수 실패를 조용히 넘기지 않고 표면화. 소유권 검증(세션 ID + 호스트 + 시작 시각)이 필수 — PID 재사용으로 무관한 프로세스를 죽이면 회수보다 큰 피해다.

**Out of scope**

- **다른 세션·과거 세션의 고아 회수** — 소유권이 불확실하다. MVP는 **자기 세션이 띄운 것만**. 과거 고아는 감지·보고까지.
- **codex/claude CLI 등 외부 프로세스 트리 전체 회수** — mccp가 직접 spawn한 자식까지. 그 자식이 만든 손자는 범위 밖(플랫폼별 프로세스 그룹 처리가 필요).
- **`.end` 마커 누락 근본 원인** — 인접하지만 다른 축. 회수 작업이 마커 경로를 건드리므로 개선될 수 있으나 **주장하지 않는다**.
- **의도적 장수 프로세스 정책** — dashboard 서버를 세션 종료 후에도 유지할지는 제품 결정. Open Question.
- **Windows/POSIX 프로세스 그룹 통일** — 플랫폼 차이를 흡수하려 들지 않고, 이 환경(Windows 11)에서 동작하는 것을 우선.

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | 세션 프로세스 레지스트리 | mccp가 띄운 detached 자식이 세션 키와 함께 기록되어, 누가 무엇을 띄웠는지 알 수 있음 | pending | — |
| 2 | SessionEnd 회수 + 실패 표면화 | 세션 종료 시 자기 소유 자식이 회수되고, 못 죽인 것은 조용히 넘어가지 않음 | pending | — |

## Open Questions

- [ ] **dashboard 서버는 회수 대상인가** — `/mccp:dashboard`는 사용자가 브라우저로 보라고 띄운 것이다. 세션이 끝나면 죽는 게 맞는지, 명시적 stop까지 살아야 하는지. 후자면 레지스트리에 "장수" 표시가 필요.
- [ ] **detached codex runner 회수 시점** — 900s 타임아웃 중 세션이 끝나면 죽일지, 완료를 기다릴지. 죽이면 진행 중 리뷰가 유실되고, 두면 15분간 고아다. marker 기반 복구가 있으므로(§3.13) 죽이는 쪽이 가능하나 재실행 비용이 크다.
- [ ] **`SessionEnd`의 `async: true` + timeout 10s** — 회수가 이 예산 안에 끝나야 한다. graceful → force 2단계를 넣으면 초과 위험.
- [ ] **레지스트리 저장 위치** — `.claude/state/` 하위가 자연스러우나 gitignore 필요. `hook-caps.json`(per-machine, gitignored) 선례가 가깝다.
- [ ] **과거 고아 감지를 어디서 보고할지** — SessionStart가 이미 `.end` 마커 누락을 보고한다. 같은 채널에 붙일지.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **PID 재사용으로 무관한 프로세스를 죽인다** | Medium | **Critical** | 소유권 검증을 PID 단독이 아니라 **(session_id, host, start_time, 실행 경로)** 조합으로. 하나라도 불일치면 회수하지 않고 기록만. 기존 lock 계층이 이미 host-aware tri-state 선례를 갖고 있다(§3.6) |
| 진행 중인 codex 리뷰를 죽여 작업이 유실된다 | Medium | High | Open Question으로 정책 결정 후 구현. marker 기반 복구 경로(§3.13)가 있어 유실이 치명적이진 않으나 재실행 비용은 실재 |
| `SessionEnd` 10s 예산 초과로 회수가 잘린다 | Medium | Medium | 회수를 best-effort로 설계하고 미완료를 레지스트리에 남겨 다음 SessionStart가 처리. 완료를 세션 종료의 차단 조건으로 삼지 않는다 |
| 회수 로직 자체가 SessionEnd를 깨뜨려 `.end` 마커가 더 자주 누락된다 | Medium | High | 마커 write를 회수보다 **먼저** 수행. 기존 `writeDegradedEndMarker` fail-loud-open 패턴(§3.2)을 따라 회수 실패가 마커를 막지 않게 |
| 레지스트리가 stale PID로 채워져 커진다 | Medium | Low | 등록 시 세션 키를 붙이고 SessionStart에서 종료된 세션분을 정리 |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-08-12.*
