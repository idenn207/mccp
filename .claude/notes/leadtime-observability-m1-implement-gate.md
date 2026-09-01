# leadtime-observability M1 — implement-gate notes

> plan 본문(`.claude/plans/leadtime-observability-m1.plan.md`)은 `mccp-plan-codex`
> receipt가 `plan_hash`(`sha256:674cbfd4…`)로 봉인한 대상이라 게이트 산출물을 본문에
> 주입하지 않는다(multi-session-work-loop M7 · gate-guard-integrity M3 선례).
> `/mccp:prp-implement` Phase 2.5.4가 허용하는 대체 자리에 기록한다. 본문을 편집하면
> receipt가 stale이 되어 `/mccp:pr`이 §3.11 guard 2에 막힌다.

## Codex Implementation Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review`
  (fail-closed Bash wrapper, v0.2.2) → `classification=ok` · `blocking=false` ·
  `durationMs=48770` · `--impeccable-available`(design-scope preamble 적용)
- 라운드 수: 1 (R1). 캡은 `MCCP_GATE_ROUND_CAP=3`이지만 §3.16대로 R1에서 멈춘다 —
  아래 triage가 escalate 조건 (b)를 만족하지 않는다.
- `resolution.codex_verdict = 'divergent'` (구조화 verdict `needs-attention` → divergent).
  **cross-gate dedupe는 fail-closed 유지** — `dedupe.js#evaluateForDedupe`가 `converged`
  외 어떤 값에도 skip을 허용하지 않으므로 `/mccp:pr`에서 PR-Codex가 ship 시점에 실제로
  발화한다.
- 합치 결론: **Codex는 승인하지 않았고, 그 미승인의 근거는 범주 오류다** — 이 게이트가
  계약상 Phase 3 EXECUTE **이전**에 도는데 Codex는 "diff에 구현이 없다"를 결함으로
  보고했다. 전제는 기각하되 finding 본문이 열거한 요구사항 5종은 실재하므로 구현 요건으로
  전량 흡수한다.

### 2.5.1 cross-gate dedupe — 미적용

plan의 `## Codex Adversarial Review`는 Phase 5.1이 넣은 **placeholder 그대로**다
(`MCCP_PLAN_REVIEW=multi-agent`에서는 Phase 5.3 주입이 스킵되고 plan이 동결되므로 정상).
`합치 결론` 줄이 없어 2.5.1의 전제가 성립하지 않는다. 더해 `mccp-plan-codex` receipt의
`resolution.codex_verdict`가 `divergent`라 dedupe는 어차피 fail-closed다 → 미적용,
게이트 정상 진입.

### 2.5.2 신규 구현 시점 결정 (focus로 전달한 5건)

1. L2 패널의 HIGH 2건을 구현 중 흡수하는 방식 — 리터럴 `37` 단언을 관계 단언으로 대체,
   `read_error` 축을 state ladder에 추가.
2. `corpus.readReviewRecords` 반환 형태(`read_error`/`parse_failures`) 재사용 + 추가 export의
   출력 무변경 주장.
3. nearest-rank 인덱스 공식과 n=1/n=2 경계 동작.
4. `records[].plan_path`를 축자 동결 문서에 그대로 실을 것인가 repo-relative로 정규화할 것인가.
5. 픽스처 in-file 조립 + `corpus.aggregate` 바이트 동결이 "출력 무변경"의 기계적 강제라는 주장의
   사거리.

### YAGNI Triage

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 — 주장한 구현 수정이 target diff에 존재하지 않는다 | HIGH | ACCEPT_NOW (전제는 기각, 요구사항은 전량 흡수) | 전제 기각 근거: `prp-implement.md` Phase 2.5 헤더가 "runs **after** Phase 2 PREPARE and **before** Phase 3 EXECUTE (the first code change)"라고 명시한다 — 이 게이트 시점의 빈 diff는 결함이 아니라 계약된 상태다. Codex의 권고("코드를 넣고 그 diff에 대해 리뷰를 다시 돌려라")가 기술하는 것은 이 게이트가 아니라 `/mccp:code-review`·PR 게이트다. 그러나 finding 본문이 열거한 요구 5종(`read_error` 전파 · n=1/n=2 백분위 test · repo-relative `plan_path` 정규화 + test · corpus JSON/human/stderr/exit 표면 커버리지 · 자기무효 리터럴 제거)은 전부 실재하므로 Phase 3 EXECUTE의 구현 요건으로 채택한다 |

- Deferred to backlog: 0 (F1은 ACCEPT_NOW로 그 자리에서 흡수)
- Open Questions: 없음 — auto-CRITICAL 카탈로그(§0) 해당 0건
- Codex session 참조: `classification=ok`, `durationMs=48770`,
  envelope `<git-dir>/mccp/tmp/codex-stdout.json`

### R2를 돌지 않는 이유 (2.5.4 escalate 규칙)

escalate는 (a) ACCEPT_NOW ∧ severity ∈ {CRITICAL, HIGH} **그리고** (b) R1 흡수로 완전히
해소되지 않음 — 두 조건을 **모두** 만족할 때만이다. (a)는 성립하나 (b)는 성립하지 않는다:
F1이 요구한 5종은 아래 EXECUTE에서 전부 구현되고 각각 test로 고정되므로 R1 흡수가 완결이다.
§3.16의 1라운드 기본과도 일치한다. verdict는 `divergent` 그대로 봉인되어 위장하지 않는다.

### 2.5.4가 흡수한 요구사항 → 구현 요건 매핑

| 요구 | 구현 위치 | 고정 test |
|---|---|---|
| `read_error` 전파 (읽기 실패가 커버리지 100%로 접히지 않는다) | `leadtime.js` state ladder 4번째 축 | `read_error=true → state='degraded'` |
| n=1 / n=2 nearest-rank 경계 | `percentile()` | 알려진 입력의 p50/p90 리터럴 일치 |
| repo-relative `plan_path` 정규화 | `normalizePlanPath()`, `records[]` 직렬화 직전 | 절대경로 입력 → repo-relative 출력 |
| corpus 표면 커버리지 (JSON/human/stderr/exit) | — | `corpus.aggregate` 바이트 동결 + `corpus.js --json` 실코퍼스 완주 exit 0 |
| 자기무효 리터럴 제거 | `## Validation` 1번을 관계 단언으로 | 라이브 완주가 관계식으로 통과 |

## Security Reviewer

M1은 auth·crypto·secret·입력 검증·injection·SSRF·path traversal·권한 상승 중 어디에도
해당하지 않는다 — read-only 집계 도구이고 신규 입력 경로는 `--repo-root` 하나이며 기존
`corpus.js`의 동일 인자를 미러한다. 다만 L2 security 패널이 지적한 **`plan_path` 절대경로가
git-tracked 문서로 새는 축**은 실재하므로(§3.12 `meta.cwd` 선례와 동형) 위 표의
`normalizePlanPath()`로 닫는다. 별도 `security-reviewer` Task 호출은 하지 않으며,
따라서 receipt에 `security_skipped`를 stamp하지 않는다 — 스킵이 아니라 **비해당**이다.
