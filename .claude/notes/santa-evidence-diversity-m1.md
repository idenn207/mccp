# santa-evidence-diversity M1 — 게이트 산출물 · 실측 노트

> plan 본문(`.claude/plans/santa-evidence-diversity-m1.plan.md`)은 `mccp-plan-codex`
> receipt가 `plan_hash`로 봉인했으므로 **편집하지 않는다**(§3.11 guard 2). 게이트
> 산출물은 M1·M2 선례대로 이 파일이 소유한다.

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- classification: `ok` · blocking: `false` · structured `result.verdict`: `needs-attention`
- 라운드 수: 1 (`MCCP_GATE_ROUND_CAP=1`, CLAUDE.md §3.15 — 1라운드 기본)
- 합치 결론: 유일한 finding이 게이트 순서에 대한 범주 오류다. 구현 결정에 대한 반박은 0건이라 설계를 바꾸지 않는다.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 "계획된 lane 구현이 워킹트리 diff에 전혀 없다" | HIGH | REJECTED_BY_DESIGN | 이 게이트는 Phase 2.5로 **Phase 3 EXECUTE 이전**에 돈다. 리뷰 대상은 산출 코드가 아니라 *구현 시점 결정*이다. 코드 부재는 관측 사실이지 결함이 아니며, 리뷰어의 처방("구현하고 diff로 제시하라")은 이 게이트가 끝난 뒤 곧바로 수행되는 작업 그 자체다 |
- Deferred to backlog: 1 (F1) → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음
- 구현 결정 4축(laneCoverageFrom legacy 안전성 · buildBlindPrompt 인자 부재 + 절삭 고지 · cmdLanes 필수 인자와 부분 JSON 금지 · present-only 정수 2종)에 대한 반박: **0건**

### Security Reviewer

> security-reviewer 서브에이전트 미호출 (auto-fallback). receipt에 `security_skipped=true`로 정직하게 기록한다.

- 사유: 이 세션은 운영 제약상 Agent/Task 도구를 사용자 요청 없이 호출하지 않는다. 따라서 implement 단계의 security-reviewer 재검토는 수행되지 않았다.
- **다만 같은 축의 리뷰는 plan 게이트에서 이미 수행됐다.** `.claude/reviews/plan-review-santa-evidence-diversity.md`의 `security` 관점이 verdict `pass`(findings 0)를 냈고, 공격 대상으로 명시한 축에 본 변경의 보안면이 그대로 포함된다 — `targetPaths` path traversal(containment 검사 + git diff 기원 + 프롬프트 전용 사용), `--lane` 검증 우회, env 파서 fallback, 신규 meta 필드로 인한 receipt hash 변조, `lanes`↔`record` 사이 TOCTOU. 결론은 "No hostile scenario reached consequence"였다.
- 하류 영향: `security_skipped=true`는 `/mccp:pr` validator에서 blocking이다. 그 시점에 (a) security-reviewer를 실제로 돌리거나 (b) 문서화된 감사 우회를 사유와 함께 쓰는 선택이 필요하다.

### Design Review

- `impeccable-detect --mode implement` → `skill_available=true` · `design_signal=false` · `silent_skip=true` (`reason=no-signal`).
- 구현 diff에 렌더 표면(`.tsx/.css/.html` · `.claude/cache/{STATUS.md,status.html}`)이 0건이므로 critique retry loop 미발화. receipt에 `impeccable_silent_skip=true`로 기록.
- plan 모드에서는 `design_signal=true`였는데(그 판정은 plan 본문이 언급한 `renderer/*.js` version 리터럴을 본 것) implement 모드는 실제 diff를 보므로 값이 갈리는 것이 정상이다.

## Task 7 — 실경로 완주 실측 (2026-08-18)

`/mccp:santa-loop`의 **CLI 경로 전량**을 임시 저장소에서 1라운드 완주했다. 관측:

| 축 | 결과 |
|---|---|
| (a) 블라인드 프롬프트에 파일 내용 부재 | **충족** — 프롬프트 본문에 `const x=1` / `const y=2` / `# doc` 어느 것도 없다. 실린 것은 저장소 루트 · `files under review: 1` · `- src/a.js` · UI5 고정 문구뿐 |
| (b) Reviewer A가 그 프롬프트로 기동 | **미실측** — 아래 참조 |
| (c) `--lane` 대조 | **충족** — 배정과 일치(`A:blind`/`B:bundled`)는 통과해 `reviewersInRound` 1→2, 불일치(`A --lane bundled`)는 **exit 2 + `SANTA_LANE_MISMATCH` + 원장 append 0건** |
| (d) receipt stamp + schema | **충족** — `santa_rounds=1` · `santa_blind_records=1` · `santa_blind_rounds=1` · `blind_rounds === rounds` **true** · `validate().ok === true` |
| (e) 리포트 레인 열 | **충족** — `\| # \| started \| verdict \| reviewers \| lanes \|` 헤더 + `A:blind · B:bundled` 셀 |

### (b)를 실측하지 못한 이유와 그 의미

리뷰어 기동은 Agent/Task 도구 호출이고, 이 세션은 사용자 요청 없이 그것을 호출하지 않는
운영 제약 아래 있다. 따라서 **오케스트레이터가 조립한 프롬프트가 실제 LLM 컨텍스트에
들어가는 마지막 한 홉**은 관측되지 않았다.

이것을 축소해 적지 않는다. 다만 그 홉이 M1이 애초에 **기계적으로 보증하지 않는다고 명시한
구간**과 정확히 겹친다는 점은 기록해 둔다 — DD4가 "블라인드로 선언된 리뷰어의 프롬프트에
실제로 번들이 없었는지는 검증하지 않는다"고 적었고, 셸에서 LLM이 무엇을 받았는지 확인할
방법이 없다는 것이 그 근거다. 즉 (b)를 사람이 한 번 눈으로 보는 것은 *가치가 있지만*
그것으로 계약이 성립하는 것은 아니며, PRD는 그 검증을 결과 분포(두 레인이 동시에 놓친
항목 비율)에 맡겼다(UI7).

**남은 검증 부채**: 실제 `/mccp:santa-loop` 1회 완주(리뷰어 2인 기동 포함). 위 (a)(c)(d)(e)가
CLI 계층에서 충족됐으므로 남는 것은 커맨드 본문의 `$BLIND_ID` 분기가 프롬프트를 실제로
갈아끼우는지 한 가지다. 그 분기는 두 리뷰어 절이 **같은 문장**을 쓰도록 작성됐고 단위
test가 `blindId` 값 계약을 고정하지만, 산문↔실행의 일치는 라이브 실행만 증명한다.

### 토큰 비용 (UI20)

**미실측.** 같은 스코프에서 blind와 bundled를 비교하려면 리뷰어를 실제로 두 번 기동해야
하므로 (b)와 같은 제약에 걸린다. 수치를 추정해 적지 않는다 — PRD Open Question("블라인드
레인의 토큰 비용")은 열린 채로 둔다.
