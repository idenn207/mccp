# Plan: Audit Remediation P3 — atomic-lock PID-reuse race

**Source PRD**: `.claude/prds/audit-remediation-followup.prd.md`
**Selected Milestone**: P3 — atomic-lock PID-reuse race (버전 1.20.6)
**Complexity**: Medium

## Summary

holder crash 후 OS가 그 PID를 무관한 프로세스에 재사용하면 `tryReclaimStaleLock`의 same-host 분기가 `isPidAlive`만 검사해 재사용 PID를 live holder로 오판 → mtime과 무관하게 `return false`(NEVER reclaim) → lock이 재사용 프로세스 종료까지 stuck(B#2, HIGH). 동일 버그가 **5개 lock 구현에 복제**되어 있다. 수정은 same-host 분기에 mtime-freshness를 tiebreaker로 결합한다: `alive PID + fresh mtime`만 보호하고 `alive PID + stale mtime`은 재사용 imposter로 간주해 reclaim. live holder는 문서화된 heartbeat(§3.6 in-loop/background)로 mtime을 fresh하게 유지하므로 계속 보호된다. 이 변경은 R6-F2가 도입한 "same-host+alive → mtime 무관 보호" 계약을 **의도적으로 뒤집으며**, 동시에 CLAUDE.md §3.6이 이미 문서화한 `(PID dead) OR (mtime > TTL)` 정책에 코드를 **재정합**시킨다.

## R6-F2 ↔ B#2 계약 충돌 (핵심 설계 결정)

`migrations/tests/host-aware-reclaim.test.js` (a)는 현 동작을 명시 테스트한다:

```javascript
// (a) Same-host live PID + mtime stale → NEVER reclaim.
assert.strictEqual(reclaimed, false,
  'must not reclaim live same-host holder even when mtime is stale');
```

이는 버그가 아니라 **R6-F2(PR-Codex R6 Finding 2)의 의도적 방어** — "진짜 holder가 lease TTL보다 긴 sync 구간(느린 FS/대량 rename)에 있으면 mtime stale해도 reclaim 금지(진행 중 mutation 훼손 방지)". 두 위협이 동일 관측(same-host + alive + stale)으로 나타난다:

| 위협 | 시나리오 | 원하는 동작 | tiebreaker 결과 |
|---|---|---|---|
| **R6-F2** | 진짜 holder가 느린 sync 구간 | 보호 | heartbeat가 mtime을 fresh 유지 → **계속 보호** |
| **B#2** | crashed holder PID 재사용 | reclaim | 재사용 프로세스는 이 lock을 heartbeat 안 함 → mtime stale → **reclaim** |

**해소 논리**: `isPidAlive`는 "이 PID가 살아있다"이지 "holder가 살아있다"가 아니다. holder의 liveness proxy는 heartbeat가 갱신하는 **mtime**이다. 따라서 "holder alive ≡ (PID alive AND mtime fresh)". R6-F2가 우려한 corruption(느린 holder를 reclaim)은 heartbeat가 mtime을 fresh하게 유지하는 한 발생하지 않는다 — 정상 작동하는 holder는 계속 보호된다. 유일한 잔여 위험은 **단일 uninterruptible syscall이 lease TTL을 초과**하는 극히 드문 경우인데, R6-F2 자신의 주석("The in-loop heartbeat keeps mtime fresh in practice")이 이를 낮은 확률로 인정한다. B#2(무한 stuck)이 이 잔여 위험보다 확률·영향 모두 높으므로 순 개선이다.

**doc 정합 보너스**: CLAUDE.md §3.6은 이미 `orphan 판정 = (recorded PID is dead) OR (file mtime > 60s)`로 문서화한다. 현 코드(same-host+alive→mtime 무관 보호)는 이 문서보다 보수적이다. tiebreaker는 코드를 §3.6 문서 정책에 **재정합**시킨다.

## Lock heartbeat 분류 (Codex F1/F3 흡수 — tiebreaker 안전성 gating)

Codex R1 F1이 정확히 지적: tiebreaker는 "stale mtime ⟹ not a live holder"에 의존하는데, 이는 **holder가 lease TTL 내에 mtime을 갱신할 heartbeat가 있을 때만** 성립한다. heartbeat 없는 lock에 blanket 적용하면 느린-정상 holder를 imposter로 오인해 reclaim → mid-mutation 훼손(F1의 renderer 케이스). 따라서 각 lock을 heartbeat 유무로 **분류하고 그에 따라 처리**한다(uniform 적용 금지):

| Lock | Heartbeat | Holder 최대 지속 | tiebreaker 처리 |
|---|---|---|---|
| `pr-phase-lock` | ✅ 외부 background loop (pr.md, spawnSync window 감쌈) | Codex 호출(분 단위) but heartbeat 독립 | **tiebreaker 적용** — heartbeat가 mtime fresh 유지 |
| `quarantine` (v0.2.8 migration) | ✅ in-loop (25 rename마다 utimesSync) | 대량 rename but heartbeat in-loop | **tiebreaker 적용** — 단, 단일 rename > TTL 잔여 위험은 Task 5에서 검증 |
| `renderer/trigger` | ❌ 없음 (1회 획득 후 derive/render/snapshot hold) | ~200-500ms (§ MCCP_RENDER_LOCK_LEASE_MS 90s) | **Task 5 gating** — holder≪lease라 stale(>90s)=hung/imposter면 tiebreaker 적용 + live+fresh→protect 테스트; 90s 초과 정상 render 가능성 있으면 heartbeat 추가 or **제외+backlog** |
| `goal-phase-lock` | ⏳ 미확인 | ⏳ 미확인 | **Task 5 gating** — heartbeat·TTL·holder 검증 후 결정 |
| `ultracode-phase-lock` | ⏳ 미확인 | ⏳ 미확인 | **Task 5 gating** — 동일 |

**원칙**: heartbeat-backed lock은 tiebreaker 적용. heartbeat 없는 lock은 "holder 최대 지속 ≪ lease TTL"이 입증될 때만(정상 holder의 mtime이 stale될 수 없음 → stale=hung/imposter) 적용하고 live+fresh→protect 회귀 테스트를 필수 첨부. 어느 것도 입증 못 하면 그 lock은 **제외**하고 backlog에 기록(부분 수정이 latent-copy를 남기지만, 잘못된 reclaim으로 데이터 훼손하는 것보다 안전 — fail-closed).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Reclaim logic | `plugins/mccp/scripts/lib/pr-phase-lock.js:286-317` | `tryReclaimStaleLock` host-aware tri-state — 수정 대상 canonical impl |
| Mirror sites | `migrations/v0.2.8-generic-receipt-quarantine.js:178`, `lib/goal-phase-lock.js:159`, `lib/ultracode-phase-lock.js:164`, `lib/renderer/trigger.js:123` | 동일 `if (isPidAlive(body.pid)) return false;` 복제 |
| Reclaim tests | `plugins/mccp/scripts/migrations/tests/host-aware-reclaim.test.js:38-118` | `writeLock(repo, body, mtimeOffsetMs)` + `fs.utimesSync` mtime backdating, pid=process.pid(alive)/999999(dead), host=os.hostname()/foreign |
| Version sync | P2 커밋 `8587022` (plugin.json + html.js/markdown.js footer + i18n-surface.test.js) | patch bump 4-surface 동기(§3.7) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/pr-phase-lock.js` | UPDATE | same-host 분기(309) tiebreaker + 주석 정정 + cmdDetectStale 리포팅(602-624)·legacy reclaim(421-427) 일관성 |
| `plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js` | UPDATE | same-host 분기(178) tiebreaker + 주석 정정 |
| `plugins/mccp/scripts/lib/goal-phase-lock.js` | UPDATE | same-host 분기(159) tiebreaker + 주석 |
| `plugins/mccp/scripts/lib/ultracode-phase-lock.js` | UPDATE | same-host 분기(164) tiebreaker + 주석 |
| `plugins/mccp/scripts/lib/renderer/trigger.js` | UPDATE | same-host 분기(123) tiebreaker + 주석 |
| `plugins/mccp/scripts/hooks/pr-phase-guard.js` | UPDATE (조건부) | 378-383 pre-check `sameHost && !isPidAlive`가 alive+stale imposter를 tryReclaimStaleLock에 안 넘김 — 새 계약과 일관되게 조정 or cmdEnter 직접경로 의존 명시 |
| `plugins/mccp/scripts/migrations/tests/host-aware-reclaim.test.js` | UPDATE | test (a) 계약 갱신(alive+stale→reclaim) + reused-PID 케이스 추가 |
| `plugins/mccp/scripts/lib/tests/pr-phase-lock-boundary.test.js` | UPDATE | reused-PID+stale→reclaim / alive+fresh→protect 케이스 |
| `plugins/mccp/scripts/lib/tests/goal-phase-lock.test.js` | UPDATE | 동일 회귀 케이스 |
| `plugins/mccp/scripts/lib/tests/ultracode-phase-lock.test.js` | UPDATE | 동일 회귀 케이스 |
| `plugins/mccp/scripts/lib/renderer/tests/trigger.test.js` | UPDATE | 동일 회귀 케이스 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version 1.20.5 → 1.20.6 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer v1.20.5 → v1.20.6 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer v1.20.5 → v1.20.6 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer 버전 assertion 1.20.6 동기 |
| `CHANGELOG.md` | UPDATE | 1.20.6 row 추가 |
| `.claude/prds/audit-remediation-followup.prd.md` | UPDATE | P3 row pending → in-progress + Plan cell (plan write 시 반영) |

## Tasks

### Task 1: canonical fix — pr-phase-lock.js tiebreaker
- **Action**: line 308-311 same-host 분기를 `if (isPidAlive(body.pid) && !mtimeStale) return false;`로 변경. 상단 주석 블록(281-285)의 "same-host + pid-alive → false (NEVER reclaim)"를 "same-host + pid-alive + mtime-fresh → false; alive + stale → reclaim (PID-reuse imposter, B#2)"로 정정. `mtimeStale`(293)이 분기 이전에 이미 계산됨 확인.
- **Mirror**: 기존 tri-state 구조 유지, `mtimeStale` 변수 재사용.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/pr-phase-lock-boundary.test.js`

### Task 2: mirror site 적용 (heartbeat 분류 gating — Codex F1)
- **Action**: **Task 5 분류 확정 후 실행**. heartbeat-backed(quarantine:178) + Task 5에서 "holder≪lease 입증 + live+fresh→protect 테스트" 통과한 lock(goal:159/ultracode:164/trigger:123 중 통과분)에만 same-host 분기에 `&& !mtimeStale` 결합 + 주석 정정. 입증 실패 lock은 **제외**하고 Task 7 backlog 기록(잘못된 reclaim으로 데이터 훼손보다 latent-copy가 안전 — fail-closed). 각 파일에서 `mtimeStale`이 same-host 분기 이전 계산되는지 확인 — 미계산 시 추가(pr-phase-lock:291-293 패턴).
- **Mirror**: Task 1과 동일 1-line 패턴.
- **Validate**: 적용된 각 lock 테스트 파일 `node --test`.

### Task 3: caller pre-check 제거 (MANDATORY — Codex F2)
- **Action**: `tryReclaimStaleLock` caller의 `isPidAlive` pre-gate가 새 tiebreaker를 우회하지 않도록 **필수 제거/위임**(문서화 도피 금지). (a) `pr-phase-guard.js:378-383`의 `if (sameHost && !isPidAlive)` pre-gate 제거 → alive 여부 무관 tryReclaimStaleLock에 위임(tiebreaker가 alive+stale imposter reclaim). (b) `cmdDetectStale`(pr-phase-lock:602-624)의 `same-host-live-pid` early-return을 alive+mtime 조합으로 교체(alive+stale → `stale:true` + reclaim 시도). (c) goal/ultracode/renderer의 동형 caller 전수 grep·조정. hook-path 회귀 필수: alive PID + stale mtime → guard가 reclaim.
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` + 각 lock guard 테스트

### Task 4: R6-F2 test 계약 갱신 + reused-PID 회귀
- **Action**: `host-aware-reclaim.test.js` test (a)를 새 계약으로 갱신(same-host live PID + stale mtime → **reclaim**, 주석의 threat model도 B#2 반영). 신규 케이스 추가: (a') same-host alive PID + **fresh** mtime → no reclaim(정상 holder 보호), (a'') reused-PID(=process.pid alive) + stale mtime → reclaim(B#2 imposter). 5개 lock 각 테스트 파일에 alive+fresh→protect / alive+stale→reclaim / dead→reclaim / cross-host mtime-only 4케이스 커버.
- **Mirror**: `writeLock` + `fs.utimesSync` mtime backdating 패턴(host-aware-reclaim.test.js:38-47).
- **Validate**: `node --test` 5개 lock 테스트 all green.

### Task 5: heartbeat 분류 검증 (GATING — Codex F1/F3 흡수, Task 2 선행)
- **Action**: Task 2 **이전에** "Lock heartbeat 분류" 표의 ⏳(goal/ultracode/renderer)를 코드 근거로 ✅/❌ 확정. 각 lock의 lease TTL(STALE_MS_DEFAULT / LEASE_TTL_MS / MCCP_RENDER_LOCK_LEASE_MS)·heartbeat 존재·cadence·holder 최대 지속을 grep 입증. 판정 기준: (i) heartbeat-backed & cadence < holder 최장 blocking → 적용. (ii) heartbeat 없으나 holder 최대 지속 ≪ lease TTL(정상 holder는 절대 stale 못 됨 → stale=hung/imposter) → 적용 + live+fresh→protect 회귀 필수. (iii) 둘 다 아님 → **제외** + Task 7 backlog. quarantine "단일 rename > TTL" 잔여도 여기서 판정(rename 통상 ms → (ii) 충족).
- **Validate**: 분류 표 전 행 ✅/❌ 확정 + 각 판정 file:line 근거.

### Task 7: 제외 lock backlog 기록 (Codex F1 흡수)
- **Action**: Task 5에서 (iii)로 제외된 lock이 있으면 `.claude/plans/codex-findings-backlog.md`에 `YYYY-MM-DD | HIGH | <plan> | <lock> heartbeat 부재로 tiebreaker 미적용 — heartbeat 추가 후 재검토` 형식으로 append. 제외 0건이면 no-op.
- **Validate**: backlog 파일 확인 or no-op 명시.

### Task 6: 버전 4-surface 동기 + CHANGELOG
- **Action**: plugin.json 1.20.5→1.20.6, html.js/markdown.js footer, i18n-surface.test.js assertion 동기(§3.7). CHANGELOG 1.20.6 row.
- **Mirror**: P2 커밋 `8587022` 동기 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 5개 lock 소스 + 회귀 테스트
node --test plugins/mccp/scripts/lib/tests/pr-phase-lock-boundary.test.js \
  plugins/mccp/scripts/lib/tests/pr-phase-lock-f11.test.js \
  plugins/mccp/scripts/migrations/tests/host-aware-reclaim.test.js \
  plugins/mccp/scripts/lib/tests/goal-phase-lock.test.js \
  plugins/mccp/scripts/lib/tests/ultracode-phase-lock.test.js \
  plugins/mccp/scripts/lib/renderer/tests/trigger.test.js
# caller 감사
node --test plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js
# 버전 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
# 회귀 없음 확인 (lock 인접 스위트)
node --test plugins/mccp/scripts/lib/tests/dispatch-controller.test.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **heartbeat 없는 lock(renderer/trigger 등)에 tiebreaker 적용 → 느린-정상 holder를 imposter로 오인 reclaim → mid-mutation 훼손 (Codex F1, HIGH)** | Medium | Task 5 GATING 분류가 heartbeat-backed vs 아닌 lock을 분리. heartbeat 없는 lock은 holder≪lease 입증 + live+fresh→protect 테스트 통과 시에만 적용, 아니면 제외+backlog(Task 7). blanket 적용 금지. |
| tiebreaker가 heartbeat-backed lock에서도 단일 uninterruptible syscall > TTL 시 조기 reclaim | Low | pr-phase-lock 외부 background heartbeat + quarantine in-loop heartbeat가 mtime fresh 유지(§3.6). quarantine 단일 rename은 ms 단위(Task 5 (ii) 충족). |
| caller pre-gate(pr-phase-guard/cmdDetectStale) 미제거 시 imposter가 hook 경로에서 여전히 우회 (Codex F2, HIGH) | Medium | Task 3이 pre-gate **필수 제거**(문서화 도피 금지) + hook-path 회귀 테스트. |
| mtimeStale 미계산 site에서 런타임 오류 | Low | Task 2가 각 적용 site 변수 존재 확인, 미계산 시 계산 라인 추가. |
| 기존 lock 테스트가 old 계약을 다른 파일에서도 assert | Medium | Task 4가 적용 lock 테스트 전수 감사·갱신. `node --test` 전체 green이 게이트. |
| stale plugin cache(1.20.0)의 pre-P1 dedupe가 PR-Codex를 잘못 skip | Medium | PR step 전 `claude plugin update`(1.20.0→1.20.6)로 P1 fail-closed dedupe 활성화. plan handoff에서 사용자에게 명시. |
| 버전 reconcile 누락 → cache stuck | Low | Task 6 4-surface 동기를 acceptance에 포함(§3.7). |

## Acceptance
- [ ] Task 5 heartbeat 분류 표 전 행 ✅/❌ 확정(코드 근거 첨부)
- [ ] 적용 lock 모두 `alive PID + stale mtime → reclaim`, `alive PID + fresh mtime → protect`, `dead → reclaim`, `cross-host → mtime-only` 계약 준수
- [ ] heartbeat 없는 lock은 holder≪lease 입증 + live+fresh→protect 테스트, 미입증 시 제외+backlog(Task 7)
- [ ] caller pre-gate(pr-phase-guard/cmdDetectStale) **필수 제거** + hook-path 회귀 (Codex F2)
- [ ] R6-F2 test (a) 새 계약으로 갱신 + 각 적용 lock reused-PID 회귀 green
- [ ] lock 주석 블록이 새 tiebreaker 정책 반영(§3.6 정합)
- [ ] plugin.json 1.20.6 + footer 2곳 + i18n 테스트 동기
- [ ] 인접 스위트 회귀 0
- [ ] Patterns mirrored, not reinvented

## Design Critique

- detect: SKILL_AVAIL=1, SIGNAL=1 (`impeccable-detect.js --mode plan`)
- signal 출처: Files to Change의 `renderer/trigger.js`·`html.js`·`markdown.js`·`i18n-surface.test.js` 경로 heuristic hit
- 실제 변경: `trigger.js`는 **lock reclaim 로직**(rendered surface 아님), `html.js`/`markdown.js`는 **footer 버전 문자열**(control-plane/version-sync). 신규 rendered-surface(layout/hierarchy/color/typography/markdown marker) delta **없음** — P2 동형.
- SKILL.md `## Output Constraints` Read 완료(first-step). 4 제약(정보위계·강조색·raw marker·항목수)은 lock-logic plan에 미적용.
- verdict: **converged** (0 design findings, rounds=1) — 신규 design surface 미도입.

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.20.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` scope narrow)
- 라운드 수: 1 (R1 흡수로 종결 — MCCP_GATE_ROUND_CAP=1)
- Codex verdict: **needs-attention** (3 findings) → R1 전면 흡수 후 plan 개정
- 합치 결론: Codex가 blanket "5개 uniform" 가정의 실제 구멍(heartbeat 없는 lock)을 정확히 지적. plan을 heartbeat-tier 분류 + mandatory pre-gate 제거로 개정하여 흡수. 개정 후 dual-review 수렴.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 renderer/trigger heartbeat 부재 → 정상 holder reclaim 위험 | HIGH | ACCEPT_NOW | "Lock heartbeat 분류" 표 + Task 5 GATING 신설로 흡수. blanket 적용 금지, heartbeat-tier별 처리. |
  | F2 pr-phase-guard/cmdDetectStale pre-gate가 tiebreaker 우회 | HIGH | ACCEPT_NOW | Task 3을 "필수 제거"로 강화(문서화 도피 제거) + hook-path 회귀 필수. |
  | F3 heartbeat 독립성 미증명 상태로 R6-F2 위험 격하 | MEDIUM | ACCEPT_NOW | Task 5 분류가 per-lock heartbeat-독립성을 gating 전제로 요구(F1과 통합). |
- Deferred to backlog: 0 (전 findings R1 흡수, 제외 lock 발생 시 Task 7이 런타임 backlog)
- Open Questions: 없음 (auto-CRITICAL 해당 없음 — 모두 correctness/race, secret/data-loss/auth 아님)
- Codex session 참조: threadId `019f3ab1-9f87-7c21-8af3-ceec80444dfb`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

- 구현 결정 = plan의 tiebreaker + heartbeat-tier 분류(Task 5) + mandatory pre-gate 제거(Task 3). Codex Adversarial Review 합치 결론이 이 3개 결정을 이미 커버(R1 전면 흡수).
- 신규 implement-time 결정: 없음 (헬퍼 추상화·라이브러리·동시성 primitive 도입 없음 — `mtimeStale` 기존 변수 재사용).
- `git diff --name-only origin/main..HEAD` = ∅ ⊆ Files to Change (게이트 진입 시점 커밋 없음).
- ### Design Review
  - `> impeccable silent-skip (auto-fallback): no-signal` — implement diff에 rendered surface(UI ext / .claude/cache/*.md) 없음. 변경은 lock-logic(.js) + footer version 문자열. SKILL_AVAIL=1 SIGNAL=0 → silent-skip 정보성 기록, critique loop 미실행.
  - ### Security Reviewer: N/A — lock reclaim은 correctness/race, secret/data-loss/auth 경계 아님(plan Codex review Open Questions 정합).
