# Notes: leadtime-observability M3 — Implement-Codex gate record

> Plan: `.claude/plans/leadtime-observability-m3.plan.md` (본문은 plan-codex receipt가
> `plan_hash`로 봉인했으므로 **편집하지 않는다** — §3.12 no-rehash. 게이트 기록은
> `/mccp:prp-implement` Phase 2.5.4가 허용하는 대체 위치인 이 노트에 둔다. M2와 같은
> 처리.)

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- classification: `disabled` — `MCCP_CODEX_DISABLED=1` 영구 운영자 정책(§3.3 · §4). spawn 직전 short-circuit, `durationMs=0`, `blocking=false`. 게이트는 이 값을 해제·override하지 않는다.
- 라운드 수: 0 (Codex 미발화). 라운드 캡은 `review-rounds/cli.js seal`이 `cap=1 pinned-by=codex-disabled`로 봉인.
- `CODEX_VERDICT`: `skipped`
- 합치 결론: Implement-Codex는 발화하지 않았다. 이 사이클에서 흡수한 것은 **plan 게이트 L2 패널이 남긴 blocking finding**이며(`.claude/reviews/plan-review-leadtime-observability-m3.md`, verdict=`divergent`, quorum 2/4 pass, `MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion`로 진행), plan 본문은 봉인돼 고칠 수 없으므로 **구현에서** 닫는다. §3.14대로 HIGH만 즉시 흡수하고 나머지는 backlog.

### Implement-time decisions (2.5.2)

plan이 사전 확정하지 않았고 구현이 정해야 하는 것 — 그리고 그 대부분이 L2 blocking finding과 같은 축이다.

| ID | 결정 | 근거 |
|---|---|---|
| D1 | 한 줄은 `sections` 배열이 아니라 **`opts.leadtimeLine` → `renderStatusGrid` → `grid`** 채널로 두 composer에 도달한다. `sections`에 11번째 원소를 추가하지 **않는다** | `markdown.js:8`·`html.js:1230`이 정확히 10개 위치로 구조분해하므로 append한 원소는 어느 composer도 읽지 않는다. `grid`는 `renderHeroPanel(verdict, grid, …)`에 이미 전달되므로 md·html 양면이 **하나의** 산출을 공유한다 (DD1) |
| D2 | 커버리지 인접 규칙은 **모든** 값 토큰에 예외 없이 적용한다. 통계 이름(`p50`)은 헤드에서 한 번 선언하고, 패널 값도 자기 커버리지 `(observed/measurable)`를 단다 | plan의 예시 문자열은 `패널 p50 7.6min`에 짝이 없어 DD14 규칙과 자기모순이었다. 예외를 하드코딩하면 falsifier가 무력해진다 |
| D3 | `plugins/mccp/scripts/derive/tests/leadtime-source.test.js`를 **생성한다** (Files to Change 추가) | Validation 2d·6이 이 파일을 실행하는데 어떤 Task도 만들지 않았다. plan이 지목한 HIGH 리스크 2건(sentinel 경로 유출 · `leadtimeScan:false` 예산)의 **유일한** falsifier다 |
| D4 | `renderHuman`의 100칼럼 초과 줄은 Task 6b가 지목한 2줄뿐이 아니다 — 실측 5줄이다. 나머지 3줄(`coverage:` 114 · `post_panel_span coverage` 129 · 두 `unmatched` 112)도 함께 줄인다 | Validation 6b는 *모든* 줄에 ≤100을 요구한다. 지목된 2줄만 고치면 plan 자신의 게이트가 통과 불가다 |
| D5 | distribution writer의 tmp는 `<target>.<pid>-<rand>.tmp`이고 rename 실패 시 unlink한다 (`trigger.js#atomicWriteUnique` 형태) | §3.6 — 목적지가 **git-tracked**다. `derive/cli.js#writeAtomic`의 고정 이름은 목적지가 gitignored `.claude/cache/`라서 안전했던 것이고, DD5가 의도적으로 그 밖으로 나간다 |
| D6 | 한 줄의 hide 술어는 `'leadtime' in model === false` **또는** `model.leadtime === null` | DD3 1행은 "키 부재"라고 적었지만 Task 3.2가 `emptyModel`에 키를 항상 선언하고 Task 3.1이 `leadtimeScan:false`에서 `null`을 돌려준다 — 두 경우 다 "이 축은 측정되지 않았다"이고, 여기에 `미산출`을 찍으면 UI10이 금지한 소급 부재 주장이 된다 |
| D7 | `validateShape`의 present-only 검사는 선언된 `null`을 **허용**한다 | `emptyModel`이 `leadtime: null`을 선언하므로, 인용 선례(`host_version`)의 "present but not an object" 형태를 그대로 쓰면 빈 모델이 자기 스키마에 걸린다 |
| D8 | DD17의 발행 경계는 `/mccp:dashboard-refresh` 하나가 아니라 **`cli.js render`를 부르는 human-gate 4종**이다. 문서에 그대로 적는다 | 실측: `dashboard.md:19` · `dashboard-audit.md:90` · `dashboard-refresh.md:18` · `archive-complete.md:97`. 넷 다 human-gate라 "ambient hook 0개" 불변식은 살지만, plan의 서술은 좁았다 |
| D9 | `fmtMin`/`fmtDay`는 `leadtime-surface.js`가 소유하고 `leadtime.js`가 require한다 | Task 2가 지시한 방향. 반대로 하면 `leadtime.js ↔ leadtime-surface.js` 순환 + 미완성 `module.exports` |

### YAGNI Triage — L2 패널 blocking finding 흡수

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| architect: 섹션이 어느 composer도 읽지 않는 슬롯에 배선된다 (10-위치 구조분해) | HIGH | ACCEPT_NOW | 실재한다. 실측 확인: `markdown.js:8` · `html.js:1230` 둘 다 정확히 10개. D1으로 해소 |
| test: `derive/tests/leadtime-source.test.js`를 아무 Task도 만들지 않는다 | HIGH | ACCEPT_NOW | 실재한다. Validation 2d·6이 그 경로를 실행한다. D3으로 해소 |
| test: DD14 인접 규칙과 plan의 예시 문자열이 자기모순 (`패널 p50 7.6min`에 짝 없음) | HIGH | ACCEPT_NOW | 실재한다. 규칙 그대로 구현하면 정답이 붉어지고, 예외를 두면 falsifier가 무력해진다. D2로 해소 |
| architect: Validation 6b가 요구하는 ≤100칼럼을 어느 Task도 만족시키지 않는다 | MEDIUM | ACCEPT_NOW | MEDIUM이지만 **plan 자신의 게이트를 통과 불가로 만든다** — 이연하면 Validation이 붉은 채로 남는다. D4로 해소 |
| security: 고정 이름 `.tmp`가 git-tracked 목적지에 고아를 남긴다 | MEDIUM | ACCEPT_NOW | §3.6이 tracked 목적지에 대해 명문화한 규칙이고 수정 비용이 3줄이다. D5로 해소 |
| security/invariant: DD3 hide 술어(키 부재)가 `leadtime: null` 배선과 어긋난다 | MEDIUM | ACCEPT_NOW | 미지 입력이 `safeSection` ⚠ 또는 거짓 `미산출`로 떨어진다 — 둘 다 DD3이 명시적으로 금지한 방향. D6으로 해소 |
| architect: DD3 1행이 도달 불가 + `validateShape`가 선언된 `null`을 거부 | LOW | ACCEPT_NOW | D6·D7과 같은 코드 지점이라 분리 이연이 더 비싸다 |
| invariant: DD17 발행 주체 열거가 좁다 (`cli.js render` 호출자 4종) | MEDIUM | ACCEPT_NOW | 문서 한 줄. D8로 해소 |
| invariant: `leadtimeScan`이 env 토글이 아니라 호출부 리터럴이라 Risks의 "즉효 완화"가 코드 편집이다 | MEDIUM | DEFER_TO_BACKLOG | 실재하지만 새 env 토글 도입은 `env-contract` 레지스트리 등재 + L1~L10 lint를 함께 요구한다 — M3 사거리 밖. Risks 서술의 부정확이 남는다는 사실을 backlog에 적는다 |
| test: Validation 6b의 ≤100칼럼이 라이브 코퍼스에 걸려 다음 게이트 실행에 썩는다 | MEDIUM | DEFER_TO_BACKLOG | 실재한다. D4가 오늘 여유를 만들지만 코퍼스가 자라면 다시 붉어진다. 근본 해소는 Validation을 관계 단언으로 바꾸는 것이고 그것은 plan 본문 편집이라 이 사이클에서 불가 |
| test: Validation 3의 UI8 앵커 단언이 라이브 코퍼스 상태에 의존한다 | LOW | DEFER_TO_BACKLOG | blind/한쪽-앵커 상태에서 라벨이 어떻게 되는지는 test가 픽스처로 덮는다. Validation의 성질 자체는 이연 |
| invariant: Validation 4의 DD1 동치가 3b가 덮어쓴 STATUS.md에 대해 단언된다 | LOW | DEFER_TO_BACKLOG | 같은 코퍼스 시점이면 성립하고, 다르면 붉어지는 방향(안전)이다 |
| invariant: Validation 4b의 `git check-ignore`가 exit 128을 통과로 접는다 | LOW | DEFER_TO_BACKLOG | Validation 문구는 plan 소유라 이 사이클에서 못 고친다 |
| security: DD3 hide 술어 미도달 + 값 부재 표기 미명세 | MEDIUM | ACCEPT_NOW | D6과 동일 축(중복 계상 아님 — 같은 결정으로 함께 닫힌다) |

- Deferred to backlog: 5 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 (§0 auto-CRITICAL catalog 해당 없음 — 보안 경계 변경 0 · atomic state lock 변경 0 · schema는 additive present-only)
- Codex session 참조: 해당 없음 (`classification=disabled`)

### Security Reviewer

- 미호출. §0 catalog(auth · crypto · secrets · input validation · SQL/cmd injection · SSRF · path traversal · privilege escalation) 해당 축 없음 — 이 milestone은 read-only 관측 표면 + 파일 write 1건이다. 유일한 데이터-핸들링 축(실패 sentinel의 절대경로 유출)은 plan-review L2의 `security` 관점이 이미 검토해 `pass`를 냈고, DD12/H2가 닫힌 `error_kind` 열거형으로 **구조적으로** 제거하며 Validation 2c·2d가 강제한다.
- 따라서 `security_skipped` 플래그는 세우지 않는다 (그 플래그는 Task 도구 호출이 **시도됐다가 실패**했을 때의 축이지 "해당 없음"의 축이 아니다).

### Design Review

- `impeccable-detect.js detect --mode implement` → `skill_available=true` · `design_signal=false` · `reason=no-signal` · `silent_skip=true`.
- 즉 SKILL_AVAIL=1 / SIGNAL=0 / DESIGN_INTENT_ACTIVE=0 행 — 문서화된 pre-EXECUTE 맹점이다(diff가 아직 비어 있어 detector가 렌더 표면을 못 본다). receipt에 `--impeccable-silent-skip --impeccable-silent-skip-reason no-signal`을 forward한다.
- critique loop은 **plan 단계에서 이미 돌았고 CONVERGED**다(plan `## Design Critique`, R0→R1, cap=2). 그 산출인 제약 4종은 DD7(신규 heading·강조색 0) · DD15(Output Constraint 1·4 흡수)로 이 plan 본문에 이미 흡수돼 있고, 이 사이클의 구현이 그것을 실행한다.
- routing / Phase 3.6 finish pass / Phase 3.7 grounding lint는 트리거 미발화로 no-op이다.
