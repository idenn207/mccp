# santa-delta-review M1 — Implement-Codex 게이트 산출물

> plan 본문(`.claude/plans/santa-delta-review-m1.plan.md`)은 `mccp-plan-codex`가
> `sha256:523d272c…`로 봉인했으므로 **편집하지 않는다**(편집하면 stale → §3.11 guard 2가
> `/mccp:pr`을 막는다). 게이트 산출물은 이 자리에 둔다 — santa-evidence-diversity
> M1/M2 · santa-adjudication M1~M3 선례.

## Codex Implementation Review

- 호출: `MCCP_CODEX_DISABLED=1` — v0.3.5 first-class skip (spawn 직전 short-circuit,
  `durationMs=0`). advisory env 불필요.
- 라운드 수: 0 (Codex 미발화)
- `CODEX_VERDICT`: `skipped`
- 합치 결론: Codex는 env 정책으로 발화하지 않았다. 이 게이트의 실질 심사는 아래
  **Security Reviewer** 패널이 수행했고, 그 결과가 구현에 흡수됐다.
- YAGNI Triage: 아래 Security Reviewer 표가 이 자리를 대신한다(Codex finding 0건).
- Deferred to backlog: 4건 → `.claude/plans/codex-findings-backlog.md`
  (HIGH 1 증거 기각 + MEDIUM 3)
- Open Questions: 없음 (auto-CRITICAL 0건)
- 라운드 캡: `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`로 1에 고정
  (`effectiveRoundCap` → `{"cap":1,"pinned":true}`)

### Security Reviewer

발화함 — `Task(mccp:security-reviewer)`, "review proposed implementation". skip 아님
(`security_skipped` 미전달). 대상 축: 프롬프트 조립 주입면 · 경로 열거 · JSON 파싱 ·
subprocess · 정수 경계 · 정규식 비용.

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| CRITICAL-1 `--ranges-file` prototype pollution | CRITICAL | ACCEPT_NOW | `readRangesFile`가 `assertSafeGraph`를 파싱 직후·값 읽기 **전에** 건다. `FORBIDDEN_KEYS` 3종 + 깊이 32 + 배열 1000 |
| CRITICAL-2 `renderScopeLines` throw = DoS | CRITICAL | ACCEPT_NOW (부분) | 리뷰어의 기전 서술("fail-open for injection")은 오인이지만 **오탐 절반은 실재**했고 D1이 그것을 닫았다. 나머지(키 사전 검증)는 `toRepoRelative`로 흡수 |
| HIGH-1 두 패턴 목록 ReDoS | HIGH | **REJECT_YAGNI (증거)** | 중첩 수량자·겹치는 교대 없음. 리뷰어가 서술한 그대로의 1.2M자 입력에서 전체 스캔 20회 = 43.9ms(1회 2.2ms), 실측 200-경로 프롬프트 1회 = 6µs. 선형. 제안된 atomic group은 JS 정규식 미지원 |
| HIGH-2 `patchRanges` 키 미검증 → 프롬프트 구조 주입 | HIGH | ACCEPT_NOW | 키를 `scopeAlways.toRepoRelative`로 접고 드롭을 loud stderr로 보고. 개행/절대경로/`..` 키가 프롬프트에 못 닿는다 |
| HIGH-3 크기·깊이 상한 부재 | HIGH | ACCEPT_NOW | `readJsonStringArray` 구조 미러 — `MAX_REVIEWER_BYTES`(100KB) + `assertSafeGraph` + 키 1000 |
| MEDIUM-1 정수 경계 | MEDIUM | DEFER_TO_BACKLOG | 부분 흡수됨(`Number.isSafeInteger` · `/^\d+$/` · `after <= before`). 도메인 상한(`MAX_LINE_NUMBER`)은 값의 근거를 댈 수 없고 초과 시 손실 방향이 안전한 쪽 |
| MEDIUM-2 `--scope-reason` 자유 문자열 | MEDIUM | DEFER_TO_BACKLOG | 설계로 이미 닫힘 — `NO_NARROW`는 4원소 닫힌 enum이고 `parseScopeFlags`가 열거 밖을 거부. 리뷰어가 enum 값을 못 본 상태에서 가정했다 |
| MEDIUM-3 tmp 디렉토리 symlink/containment | MEDIUM | DEFER_TO_BACKLOG | `decisionId`가 `SLUG_RE`를 이미 통과해 경로 성분 이탈이 불가. `assertContained`는 `realpathSync` 실패를 `PATH_ESCAPES_GATE`로 던져 **라운드 1의 정상 부재**를 exit 2로 만든다 |

CRITICAL/HIGH 중 흡수 4건 · 증거 기각 1건. §3.14대로 MEDIUM 3건은 backlog append.
CRITICAL/HIGH 잔여 미해소 **0건** → MCCP-GATE-STOP 불발동.

### Design Review

`impeccable-detect --mode implement` → `skill_available=true` · `design_signal=false` ·
`silent_skip=true` · `silent_skip_reason="no-signal"`.

게이트 진입 시점의 diff에 렌더 표면이 없어 detector가 negative다. `--impeccable-silent-skip
--impeccable-silent-skip-reason "no-signal"`을 receipt에 forward한다(M1 규약 —
informational warning). `IMPECCABLE_FORCE_OVERRIDE_REASON` 미설정이라 mutex 충돌 없음.

이 milestone은 렌더 표면에 항목·색·위계를 추가하지 않는다 — Task 9의 version 문자열
4면 동기가 `renderer/html.js`·`renderer/markdown.js`를 건드리지만 그것은 footer의 버전
문자열뿐이다. plan의 `## Design Critique` 절이 이 시점 gap을 이미 `CONVERGED`로 판정했다
(round=0/2, HIGH/CRITICAL 잔여 0건).

## 게이트 순서에 대한 정직한 기록

이 세션은 Phase 2.5의 하위 단계를 **명세 순서대로 수행하지 않았다**. 2.5.3(Codex 판정) ·
2.5.5(security-reviewer) · 2.5.5b(impeccable detect)는 Phase 3 EXECUTE **이전**에
수행됐고 그 결과가 구현에 흡수됐지만, 2.5.4(리뷰 섹션 주입)와 2.5.6(receipt write) ·
2.5.7(read-back validate)은 **구현 이후**에 수행됐다.

실질(리뷰가 구현 전에 일어났고 CRITICAL/HIGH가 코드에 흡수됐다)은 보존됐으나 순서는
어긋났다. 이 문단이 그 기록이다 — 순서 이탈을 적지 않으면 receipt만 보고는 구별되지 않는다.
