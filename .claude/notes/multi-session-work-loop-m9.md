# multi-session-work-loop M9 — 게이트 산출물 · 라이브 증거

> plan(`.claude/plans/multi-session-work-loop-m9.plan.md`)은 `mccp-plan-codex` receipt에
> `sha256:bc41d001…`로 결속돼 있다. 게이트 기록을 plan 본문에 주입하면 그 결속이 깨져
> `/mccp:pr`의 staleness 가드(§3.11 guard 2)가 이 사이클의 PR을 막는다. 그래서 기록은
> 여기에 둔다 — `prp-implement` 2.5.6 Step A가 "plan **or notes** path"를 허용하고,
> M8도 같은 자리를 썼다.

## Plan-Codex / Plan-Review 게이트 (2026-08-27)

- mode: `multi-agent` (`MCCP_PLAN_REVIEW`), L3 미발화
- L1: `converged`, violations 0
- L2 패널: 4/4 응답 — architect `pass` · security `fail` · test `fail` · invariant `fail`
- quorum: required 3, passed **false**
- verdict: **`divergent`** — `MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion`으로 진행
- receipt: `.claude/receipts/mccp-plan-codex/multi-session-work-loop-m9.json`
  (`review_verdict=divergent` 봉인 · `review_single_pass_bypassed_verdict=true` ·
  `intent_gate_verdict=skipped` proof `codex_not_invoked`)
- 리뷰 기록: `.claude/reviews/plan-review-multi-session-work-loop-m9.md`
- backlog 적재: blocking 10건 (비blocking 5건 제외) — 완화의 전제조건, exit 0
- dispatch: `round_index:0` (개정본 `bc41d001`의 첫 라운드 — 재발화 아님)

### 패널 CRITICAL 판정

| 축 | 판정 | 근거 |
|---|---|---|
| security F1·F2·F3 | **기각** | `cmdMswEventEmit`은 `findings-registry`가 아니라 `mswEvents.appendEvent`를 호출한다(`state/cli.js:445`). `state/msw-events.js:79`가 `pr_number`를, `:86`이 조인 키 `finding_id`를 이미 허용한다. 서로 다른 두 레지스트리이고 그 분리는 M8이 의도한 것이다 |
| invariant F1·F2·F3 | **인정** | `archive-complete/scan.js --json` 실측이 `inProgress:1`(M9 자기 행)을 보고한다. M4/M5/M8만 정본화해도 §3.11 C3 등식이 거짓이라 아카이브가 거부되는데, PRD 9행은 M9의 완료를 그 아카이브 성공으로 *정의*한다 |

## Codex Implementation Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0
- 합치 결론: **Codex는 발화하지 않았다.** `MCCP_CODEX_DISABLED=1`이 영구 운영자 정책으로
  봉인돼 있어(`codex-policy read` → `codexDisabled:true`) `codex-invoke`가 spawn 직전
  short-circuit했다 — `classification=disabled`, `blocking=false`, `durationMs=4`.
  이는 실패가 아니라 의도된 skip이며(§3.3), R2는 존재하지 않는다.

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, first-class)

- YAGNI Triage: 해당 없음 (finding 0건 — Codex 미발화)
- Deferred to backlog: 0
- Open Questions: 없음 (Codex 축). 단, **plan-review 패널이 낸 미해소 CRITICAL 1축**이
  구현 중 결정을 요구한다 — 아래 "구현 시점 deviation" 참조.
- Codex session 참조: 해당 없음

### Security Reviewer

security-reviewer는 이 사이클에서 별도 호출하지 않았다. 근거: M9의 변경 표면에
auth·crypto·secret·입력검증·SQL/cmd injection·SSRF·path traversal·권한상승이 없다.
Task 4가 유일하게 외부 입력(PR 번호·finding id)을 다루는데, 그 경로의 형태 검증은
이미 `state/cli.js`의 `^[0-9]+$` · `SLUG_RE`와 `findings-registry.js#validateAttributionFields`가
소유하고 있고 M9는 그 validator를 **약화시키지 않는다**. 또한 L2 패널의 `security` 관점이
이 plan을 전면 공격해 3건을 냈고(전부 기각, 위 표), 그 기각 근거가 정확히 이 데이터 경로의
추적이다. 새 공격면이 생기면 그 시점에 호출한다.

## 구현 시점 deviation (선언 범위 안)

**WHAT** — Task 7에 M9 자기 행의 술어와 flip을 추가하고, PRD 9행 Outcome의 완료 판정 문장을
개정한다. 개정 방향은 완료 판정을 "행별 술어 통과 ∧ PRD status 정본화"로 옮기고
`/mccp:archive-complete` 라이브 완주를 그 *검증*으로 격하하는 것이다.

**WHY** — plan의 Task 7a 술어표는 M5·M8·M4 세 행만 다룬다. 그 셋을 전부 닫아도
`scan.js` 실측 `inProgress:1`(M9 자기 행)이 남아 §3.11 C3의
`rawRowCount === complete + dropped`가 거짓이므로 Task 8의 archive-complete가 거부하고,
plan `## Acceptance`의 "PRD + plan 9건이 이동"이 달성 불가가 된다. 동시에 PRD 9행 Outcome이
M9의 완료를 archive-complete 성공으로 정의하므로 순환이 닫히지 않는다.

**범위** — 이 편집은 plan의 `## Files to Change`가 이미 선언한
`.claude/prds/multi-session-work-loop.prd.md | UPDATE | M9 행 추가 · M4/M5/M8 status 정본화 ·
**인정 조건 개정** · PRD:167 갱신` 안에 있다. 따라서 plan-conflict가 아니라 선언 범위 안의
문서화된 deviation이며, plan 본문은 봉인 상태로 둔다(§3.16 — 고치고 재리뷰하지 않는다).

## 착수 시점 실측 baseline (2026-08-27)

| 지표 | status | 값 |
|---|---|---|
| A1 | computed | 1/1 |
| A2 | forward-only | producer 부재 |
| A3 | **insufficient** | `cli.js a3 --print`가 `Error: write EOF`로 크래시 |
| A4 | computed | 0/42 |
| B1 | computed | 0/26 |
| B3 | computed | 20/117 |
| C1 | computed | 0/66 (open 66) |
| C2 | forward-only | `with_gate_decision=30` |
| C3 | forward-only | `with_remediation_pr=0` |

`archive-complete/scan.js --json` → `rawRowCount:9 complete:5 inProgress:1 nonCanonical:3`,
`archivable:false`, reason `"not all rows complete/dropped (in-progress=1, non-canonical=3)"`.

## Task 3 — M7 미판정 12건 판정 (2026-08-27)

대상은 `.claude/state/findings/multi-session-work-loop-m7.jsonl`의 open 12건이고, 전부
**이미 ship된 M7 계획**에 대한 지적이다. 따라서 판정은 "그 우려가 실제로 실현됐는가"를
현재 코드에서 확인하는 것이다. §3.14대로 CRITICAL·HIGH만 그 자리에서 흡수하고 나머지는
증거와 함께 backlog로 이연했다.

| # | Sev | 관점 | 판정 | 근거 |
|---|---|---|---|---|
| 1 | HIGH | security | `fixed` | sanitizer 3함수가 export됨 · `state-injector.js:185-192`가 셋 다 호출 |
| 2 | HIGH | security | `fixed` | `sanitizeForInjection`(`:185`)이 decode→escape→trim 적용, `:213`이 `cited_path`를 그 경로로 |
| 3 | HIGH | security | `fixed` | `c1-coverage-gate.js:35/47`이 두 writer 목록을 갖고 `:163-164`가 양 표면 lint · gate `ok:true` |
| 7 | CRITICAL | invariant | `invalidated` | 전제 "M8 pending"이 무너짐 — M8이 `d2d7117`로 ship, C1이 `computed` |
| 8 | HIGH | invariant | `fixed` | gate `contract_copresence` 축 `ok:true`(3개 하위 단언 전부) |
| 4·5·6 | MEDIUM | security | `deferred` | backlog 이연(각 행에 증거 동봉) |
| 9·10·12 | MEDIUM | invariant | `deferred` | backlog 이연 |
| 11 | LOW | invariant | `deferred` | backlog 이연 — Task 5가 실제로 ship돼 조건절 불성립 |

결과: shard `total=12 resolved=5 open=0 fixed=4 invalidated=1 deferred=7`.
전역 C1은 **0/66 → 5/66**(이 PRD 최초의 비영점 폐쇄율), `open_count` 59 → 47,
`type_separation` true 유지.

> 종결 유형이 (perspective, severity) 조합으로 완전히 결정되므로 위치 기반 추정을 쓰지
> 않았다 — HIGH는 전부 `fixed`, 유일한 CRITICAL은 `invalidated`, MEDIUM·LOW는 전부
> `deferred`다.
