# closure-accounting M3 — Implement-Codex 게이트 기록

> **왜 plan 본문이 아니라 여기인가.** `/mccp:prp-implement` 2.5.4는 이 섹션을 plan 본문에
> 주입하라고 지시하지만, 이 저장소에서 그 편집은 plan 게이트가 봉인한
> `mccp-plan-codex/closure-accounting-m3.json`의 `plan_hash`를 즉시 어긋나게 한다(실측:
> `4d712e…` → `ca14537…`, `validate --command mccp:prp-implement` exit 2 · `stale:[mccp-plan-codex]`).
> `planAwareMarkdownHash`는 frontmatter 키·체크박스·PR 자리표시자·표 status 토큰만 정규화할 뿐
> **뒤에 덧붙인 절을 carve-out하지 않는다**. 선례도 같다 — M2 plan은 게이트 이후 편집되지
> 않았고 그 구조적 해시가 receipt와 정확히 일치한다(`d22035…` 양측 동일). 그래서 명령 본문이
> 함께 허용하는 대체 표면(`.claude/notes/<topic>.md`)에 적고, plan 본문은 게이트가 본 상태
> 그대로 둔다. receipt의 `plan_hash`는 그 pristine plan을 가리킨다.

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed
  Bash wrapper, v0.2.2) · `classification=ok` · `blocking=false` · target `working tree diff`
- 라운드 수: 1 (cap 1/1 — `MCCP_GATE_ROUND_CAP=1`, §3.16 · `review-rounds` 봉인
  `mccp-implement-codex__closure-accounting-m3`)
- 합치 결론: 제시한 구현 시점 결정 7건 중 6건 — 선언 위치(`findings-registry.js` 안,
  `CLOSURE_FROM_ADJUDICATION` 옆) · fold된 레코드 기반 귀속 + `unattributed` **계수** ·
  `producers[]`의 static(`reachable`)/observed 분리와 degraded 시 null · `report.test.js`
  mock의 실제 모듈 spread 교체 · `collectFindings`의 `state !== 'closed'` 확대 · 텍스트 한 행 —
  에 이견이 없다. 남은 1건은 falsifier가 **무엇을 증명하는가**에 대한 지적이고, 같은 지적을
  이 plan의 게이트에서 hybrid L3 Codex가 먼저 냈다(독립 2회 재현).

### YAGNI Triage

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 — 소스 스캔은 emitter가 *호출되는지*를 증명하지 못한다. `plan-codex-runner.js:599`의 `emitAdjudicationOutcomes(...)` 호출을 지워도 함수 본문(`:875~`)의 `kind: 'finding_adjudicated'`·`CLOSURE_FROM_ADJUDICATION[`·`appendFindings(`가 남아 R2~R6 신호가 전부 불변이다 | MEDIUM | DEFER_TO_BACKLOG | §3.14상 MEDIUM은 흡수 대상이 아니고, 권고(각 producer를 운영 caller 경유로 구동하는 동작 test)는 runner를 실제로 구동해야 해 M3(종결 도달성 **표기**) 범위 밖의 별도 축이다. 이 사이클에서 흡수하는 것은 **주장의 축소**다 — Task 6의 "M3가 주장하지 않는 것"에 이 사각을 명시해 `reachable`이 "길이 코드에 존재한다"이지 "지금 발화한다"가 아님을 문서가 말하게 한다 |

- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md` (2026-09-14 MEDIUM 행)
- Open Questions: falsifier의 도달성 주장 한계(연결 끊긴 emitter) — severity MEDIUM
- Codex session 참조: threadId `01a09e87-0214-7c41-b815-43268790b98c`
- receipt verdict: `resolution.codex_verdict='divergent'` (structured `needs-attention`) —
  converged로 위장하지 않으므로 cross-gate dedupe는 닫힌 채로 남고 `/mccp:pr`에서 PR-Codex가
  실제로 발화한다

## Design gate (2.5.5b)

`impeccable-detect --mode implement` → `skill_available=true` · `design_signal=false` ·
`silent_skip_reason=no-signal`. 렌더링 표면 0이라 critique retry loop·stage routing·
design-grounding capture 모두 미발화(plan의 Design Critique 절과 같은 판정). receipt에
`--impeccable-silent-skip --impeccable-silent-skip-reason no-signal`로 정직하게 기록.
