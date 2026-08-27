# santa-delta-review M2 — Implement-Codex 게이트 산출물

> plan 본문(`.claude/plans/santa-delta-review-m2.plan.md`)은 `mccp-plan-codex`가
> `sha256:60931158…`로 봉인했으므로 **편집하지 않는다**(편집하면 stale → §3.11 guard 2가
> `/mccp:pr`을 막는다). 게이트 산출물은 이 자리에 둔다 — M1 · santa-evidence-diversity
> M1/M2 · santa-adjudication M1~M3 선례.

> **decision slug은 `santa-delta-review`다**(`-m2` 아님). 게이트 진입 시 hook이 plan
> basename 축으로 `santa-delta-review-m2`를 파생해 "receipt 없음"을 보고했으나, 실제
> `mccp-plan-codex/santa-delta-review.json`의 `reviewed_plan_hash`가 M2 plan 해시와
> **정확히 일치**한다(`sha256:60931158…`). 즉 게이트 누락이 아니라 슬러그 축 불일치이고,
> 복구는 receipt 위조가 아니라 `--decision santa-delta-review` 명시 override(precedence
> 1위)다 — M1과 같은 처리. `validate --command mccp:prp-implement --decision
> santa-delta-review --plan <M2 plan>` → `ok:true`.

## Codex Implementation Review

- 호출: `MCCP_CODEX_DISABLED=1` (user `settings.json`) — v0.3.5 first-class skip
  (spawn 직전 short-circuit, `durationMs=0`). advisory env 불필요.
- 라운드 수: 0 (Codex 미발화)
- `CODEX_VERDICT`: `skipped`
- 라운드 캡: `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`로 1에 고정
- Cross-gate dedupe: **미적용**. plan 본문의 `## Codex Adversarial Review`가 placeholder라
  `합치 결론` 줄이 없다(2.5.1 전제 미충족). 어차피 Codex가 env 정책으로 미발화이므로
  dedupe 여부와 무관하게 PR-Codex도 열리지 않는다 — fail-closed 유지.
- 합치 결론: Codex는 env 정책으로 발화하지 않았다. 이 게이트에서 실제로 심사된 것은
  아래 **구현 시점 결정** 목록이고, 그 판단 근거는 각 항목에 인라인으로 남긴다.
- Deferred to backlog: 아래 표 참조
- Open Questions: 없음 (§0 auto-CRITICAL 카탈로그 0건 — 보안 경계 변경 없음, atomic
  state 변경 없음, schema breakage 없음)

### 구현 시점 결정 (plan이 사전 확정하지 않은 것)

| ID | 결정 | 근거 |
|---|---|---|
| ID1 | `coverageOf`의 `reason`을 닫힌 토큰 5종으로 둔다 (`in-range` · `path-kept-out-of-range` · `path-dropped` · `not-in-diff` · `unknown`) | DD5가 계층 enum에 요구한 것과 같은 근거를 판정 사유에도 적용. 자유 문자열이면 노트·report가 무엇이든 받는 필드를 갖고, DD3의 합산 규칙이 오타 계층을 조용히 빠뜨린다 |
| ID2 | Class D(상시 스코프)는 corpus manifest에 `expectRestoredByAlwaysScope`로만 표기하고 `coverageOf`는 `scope-always` 병합 **결과**를 스코프로 받는다 | oracle이 `scope-always`를 require하면 순수 경계가 깨진다(DD4). 병합은 test가 CLI 두 개를 순서대로 불러서 만든다 — 실제 santa-loop.md Step 1의 순서(델타 → 상시)와 동형 |
| ID3 | corpus 결함은 **실행 가능한 취약 페이로드를 쓰지 않는다.** 논리 결함(경계 누락 · 삼킨 예외 · off-by-one · 계약 위반)으로 구성한다 | 탐지율 측정에 필요한 것은 "리뷰어가 이 줄을 보는가"이지 페이로드의 실효성이 아니다. 저장소에 의도적 취약 코드를 심으면 secret/SAST 스캐너의 상시 오탐이 되고, fixture가 temp에만 쓰인다는 사실이 그 비용을 상쇄하지 못한다 |
| ID4 | Layer 1 fixture는 `git init` 실제 저장소 + 실제 `runCli(['scope-delta',...])`를 지난다. `narrowScope`를 직접 부르지 않는다 | plan Patterns의 `santa-delta-instrumentation.test.js:29-63` 규약. 내부 함수 직접 호출은 `cmdScopeDelta`의 anchor 열거·`git show`·`patchRangesFrom` 이음매를 통째로 우회하고, M1이 실측한 결함은 전부 그 이음매에 있었다 |
| ID5 | Layer 2(라이브 리뷰어 비교)는 **이번 사이클에서 미실행**으로 남기고 그 사실을 노트·report·PRD에 명시한다 | 아래 별도 항목 |

### ID5 상세 — Layer 2를 돌리지 않는 판단과 그 대가

plan Task 3은 fixture 저장소에서 실제 리뷰어 레인을 off·enforce 두 번 완주하라고
적었다. 이 세션의 운영 지시는 **명시 요청 없는 서브에이전트·Workflow 발화를 금지**하고,
리뷰어 레인은 그 발화 없이는 성립하지 않는다(`lanes.js`가 조립한 프롬프트를 실제 리뷰
에이전트가 받아야 한다). 따라서 Task 3은 이 사이클에서 실행 불가다.

**이것을 우회하지 않는다.** 대안으로 "Layer 1 결과를 Layer 2로 부르기"나 "합산 탐지율을
Layer 1에서 추정하기"는 전부 UI5(과대 주장 금지)의 위반이다 — DD2가 두 층이 서로를
대신하지 않는다고 명시했다.

귀결은 **DD3 규칙의 기계적 적용**이다. 규칙은 "델타의 Layer 2 발견 수가 full 대비 단
1건이라도 적으면 default를 뒤집지 않는다. 같거나 크면 뒤집는다"이고, Layer 2가 없으면
**"같거나 크다"가 성립하지 않는다.** 따라서 default는 `off`로 남는다. 이는 규칙을
결과에 맞춰 고친 것이 아니라 규칙을 그대로 적용한 것이며, plan DD3이 스스로 "가장
가능성 높은 결론은 default off 유지"라고 예측한 분기와 같은 자리다(Class C가 산술적으로
델타 밖이므로 Layer 2를 돌렸어도 flip은 성립하기 어렵다).

배송물은 flip이 아니라 **어디서 잃는지의 계측**이다(plan Risks 4행이 미리 그렇게 적었다).
Layer 1은 CI에 상주해 계층 커버리지가 바뀌면 붉어진다 — M1이 갖지 못한 안전망이고, 그것이
이 사이클의 실제 산출물이다. Layer 2는 PRD Open Question으로 이연한다.

### Security Reviewer

**패널 미발화 — 카탈로그 트리거 미해당.** 2.5.5의 트리거 조건은 auth · crypto · secrets ·
input validation · SQL/cmd injection · SSRF · path traversal · privilege escalation이다.
이 사이클의 변경 표면은 (1) 순수 데이터/판정 oracle 1개(fs·git·시각 미접촉) (2) 자기
소유 temp 디렉토리에만 쓰는 test 1개 (3) 문서 4면 + version 4면이다. 카탈로그의 어느
항목도 해당하지 않는다.

ID3이 이 판단을 지탱한다 — corpus에 실행 가능한 취약 페이로드를 심지 않으므로, 이
변경이 저장소에 남기는 "보안적으로 흥미로운 것"은 0건이다.

이것은 **fallback skip이 아니다.** 패널을 부르려다 실패한 것이 아니라 트리거가 발화하지
않은 것이므로 `--security-skipped`를 forward하지 않는다(그 플래그는 시도 후 실패 전용이고,
붙이면 `/mccp:pr` validator가 fail-closed로 막는다 — 일어나지 않은 실패를 기록하는 셈).

### Design Review

**silent-skip.** `impeccable-detect.js detect --mode implement` →
`{skill_available:true, design_signal:false, silent_skip:true, reason:"no-signal"}`.
따라서 SKILL first-step Read도 critique retry loop도 발화하지 않고, 2.5.5c 방향 캡처와
Phase 3.6/3.7도 진입하지 않는다(전부 트리거 발화를 전제로 한다).

**다만 이 `no-signal`은 타이밍 산물이다 — 그 사실을 숨기지 않는다.** 검출기는 Phase 3
EXECUTE **이전**의 diff를 읽는데 그 시점의 diff는 비어 있다. 이 사이클의 Files to Change는
`plugins/mccp/scripts/lib/renderer/html.js`와 `renderer/markdown.js`를 포함하고,
`plugins/mccp/scripts/lib/renderer/`는 `DESIGN_SURFACE_PATHS` 화이트리스트 원소다
(`impeccable-detect.js:84`). 즉 EXECUTE 후에 같은 검출기를 돌리면 `design_signal=true`가
나온다.

`MCCP_DESIGN_INTENT_REASON`(axis c)으로 강제 발화시키지 않은 이유: 그 두 파일의 변경은
footer의 **version 리터럴 동기**이고 렌더 산출물의 의미를 바꾸지 않는다. 정보 위계·강조색·
raw marker·항목 수 상한 어느 축도 움직이지 않으므로 critique loop이 판정할 대상이 없다.
비용만 지불하고 판정 대상이 없는 호출을 강제하는 대신, 검출기의 구조적 사각(사전 실행)을
여기 기록으로 남긴다. 이 사각을 닫는 것(검출기를 post-EXECUTE에도 돌리기)은 이 plan의
축이 아니라 별도 축이므로 backlog에 등재한다.

`--impeccable-silent-skip --impeccable-silent-skip-reason "no-signal"`을 receipt에
forward한다(v1.3.0 M1 규약 — 관측 전용, 비차단).

### Deferred to backlog

| Severity | 항목 |
|---|---|
| HIGH | Layer 2 라이브 리뷰어 비교 미실행 — PRD Open Question으로 이연. 세션 운영 지시가 서브에이전트 발화를 금지해 구조적으로 불가 |
| MEDIUM | `impeccable-detect.js`가 Phase 3 EXECUTE 이전 diff만 읽어, 이번 사이클처럼 화이트리스트 경로를 EXECUTE에서 처음 건드리는 변경이 구조적으로 silent-skip된다 |
