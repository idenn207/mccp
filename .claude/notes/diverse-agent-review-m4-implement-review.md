# Implement-Codex Review — diverse-agent-review M4 (audit notes)

> Moved out of the plan body to keep `plan_hash` pristine (== the `mccp-plan-codex`
> receipt). Mirrors `integrity-unification-m3-implement-review.md`. Injecting the
> section into the plan was measured to break the chain: appending it changed the
> structural hash and `validate --command mccp:prp-implement --plan …` reported
> `stale: mccp-plan-codex` (exit 2). The receipt is the mechanical anchor; this
> file is the human audit trail.

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- classification: `disabled` — `MCCP_CODEX_DISABLED=1` (환경 정책, v0.3.5 first-class skip). spawn 직전 short-circuit이라 Codex 프로세스는 시작되지 않았다. `durationMs=0`, `blocking=false`.
- 라운드 수: 0 (호출 미발생) · findings 0건 → YAGNI triage 대상 없음
- 합치 결론: **cross-model 적대 검토는 이번 게이트에서 일어나지 않았다.** `skipped`는 승인이 아니라 "리뷰가 없었음"의 정직한 기록이다. cross-gate dedupe는 `converged` 외의 값에 fail-closed이므로 terminal `/mccp:pr`에서 PR-Codex가 실제로 발화한다 — 확증 지점이 제거된 게 아니라 ship 지점으로 이동했다.
- `resolution.codex_verdict`: `skipped` · `meta.codex_disabled=true` · `meta.codex_skip_reason='codex_disabled'`
- Deferred to backlog: 0
- Open Questions: 없음
- 적대적 검토 미수행 축(외부 한도 복구 후 재판정 대상):
  - `cli.js record`의 **무조건 exit 0**이 은폐할 수 있는 실패. 완화는 세 겹이다 — 호출부가 stop 블록 **직전**이라 판정을 바꿀 수 없고, 모든 degradation이 loud stderr이며, `buildReviewRecord`가 throw하지 않도록 작성됐음을 test가 고정한다. 그래도 "게이트를 막지 않는 계측"과 "조용히 아무것도 기록하지 않는 계측"의 경계는 cross-model 검토 가치가 있다.
  - 측정 표면 선택 — `.claude/reviews/`(git-tracked, 이미 존재) vs 신규 내구 receipt 클래스. 후자는 schema 변경을 요구해 UI7과 충돌한다.
  - `MCCP_PLAN_REVIEW_BUDGET` 임계 150000의 패널 적합성. fan-out 값을 그대로 미러했다(근거 없는 신규 임계 날조 회피).

### Implement-time decisions (2.5.2 — 검토 대상이었던 것)

1. `record.js`를 순수 오라클로 두고 CLI는 아티팩트 read/write만 — `quorum.js:134` 패턴 미러.
2. `record` 서브커맨드의 exit 계약을 **다른 모든 서브커맨드와 반대로** exit 0 고정.
3. `budget.js`를 `plan-fanout/budget.js#parseFanoutMinPerAgent`로 미러(초안이 인용한 `parseRolesMin`은 `"MofN"` 문자열 파서라 부적합 — 라이브 패널이 지적한 정정).
4. `minRemaining`을 `--granted` 상한 **이후** 계산(예약이 줄인 실제 발화 수를 반영해야 하므로 순서가 유의미).

### Security Reviewer

> §0 카테고리(auth/authz · session/token · crypto-key · secret/credential · input-validation · SQL/cmd-injection · SSRF · path-traversal · privilege-escalation) 대조 결과 **비해당**으로 판단해 `security-reviewer` Task를 호출하지 않았다. 근거: 변경은 (a) markdown 생성 순수 함수, (b) env 정수 파서, (c) 아티팩트 read/write CLI, (d) 커맨드 문서, (e) version 리터럴이다. 유일한 인접 표면은 `--slug`가 파일 경로에 이어붙는 지점인데, 그 값은 `receipt/cli.js derive-decision` 출력(repo-내부)이지 외부 입력이 아니다. 그럼에도 **방어적으로** `sanitizeSlug`가 `[^A-Za-z0-9._-]` 를 치환하고 선행 `.`/`-` 를 제거하며 120자로 자른다 — `../../etc/passwd` → `etc-passwd` 를 포함한 탈출 시도가 `.claude/reviews/` 밖으로 나가지 못함을 test가 고정한다. `--security-skipped` 는 forward하지 **않는다**(가용성 fallback이 아니라 범위 판단이므로 — `integrity-unification-m3` 선례와 동형).

### Design Review

- 트리거: `impeccable-detect` `design_signal=true` (axis a — `renderer/html.js` · `renderer/markdown.js` · `renderer/tests/i18n-surface.test.js`)
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료
- 라운드: 1 (R0 종료) · verdict **CONVERGED**
- 4 Output Constraints 대조 — 이 diff의 렌더러 변경은 footer version 리터럴 2건뿐이다
  - 정보 위계 3단계: heading 미변경 → PASS
  - 강조색 화면당 1개: 색·토큰 미변경 → PASS
  - raw markdown marker 금지: `html.js`는 `<code lang="en">` 정상 마크업, `markdown.js`의 `_derived from …_` 는 markdown 표면의 의도된 italic → PASS
  - 한 화면 항목 수 상한: 리스트 렌더링 미변경 → PASS
- HIGH/CRITICAL 0건 → `decideCritique` CONVERGED

### Design Grounding (Phase 3.7)

produced diff의 rendered-surface(v1.18.22 scope: `.css/.scss` · `.tsx/.jsx/.vue/.svelte/.astro` · `.html` · `.claude/cache/*.md`) 교집합이 **0건**임을 기계적으로 확인했다 — `renderer/html.js`/`markdown.js` 는 `.js` 이고 `.claude/reviews/*.md` 는 generic `.md` 다. control-plane-only 변경이므로 H15 lint는 no-op(`anchor_clean`). 2.5.5c capture 아티팩트는 생성하지 않았다(EXECUTE 이후에 캡처하면 baseline이 산출물을 포함해 delta가 공집합이 되므로, 없는 것이 있는 것보다 정직하다).

### Sequencing deviation (정직 기록)

2.5.3(Codex 호출)은 EXECUTE 전에 실행했으나, 2.5.6(receipt write)·2.5.7(read-back validate)은 구현 **이후**에 실행했다. 커맨드 본문은 write→validate→Phase 3 순서를 요구한다. 게이트 판정 자체는 영향받지 않는다 — Codex는 `disabled`라 어느 시점에 호출해도 같은 결과이고, plan은 동결을 유지해 `plan_hash`가 불변이므로 receipt가 봉인하는 대상이 달라지지 않았다. 그래도 순서 위반은 위반이므로 여기에 적는다.
