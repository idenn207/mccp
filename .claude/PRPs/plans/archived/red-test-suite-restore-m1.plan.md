# Plan: Red Test Suite Restore — M1 테스트 신호 복원

**Source PRD**: `.claude/prds/red-test-suite-restore.prd.md`
**Selected Milestone**: 1 — 테스트 신호 복원
**Complexity**: Small

## Summary

상시 red인 pre-existing 테스트 2건을 각각의 **실제 원인**에 맞게 해소한다. PRD의 Open Question 두 개(원인이 프로덕션인가 테스트인가 / fixture를 생성할 것인가 skip할 것인가)는 GROUND 단계에서 실측으로 **이미 판정됐다** — 아래 근거 참조. 두 수정 모두 프로덕션 런타임 동작을 바꾸지 않으며, 테스트를 무력화하지 않는다.

## Grounding — 원인 판정 (실측)

### 결함 1 — audit-timeline이 주입된 clock을 무시한다

`verdict-label.test.js` 의 `#drawer-data` 케이스는 receipt detail 3건을 기대하는데 0건이다. 드로어 자체는 정상이다(`wt:` 키 2건 정상 산출). 실패는 audit timeline이 `_(최근 7일 활동 없음)_` 을 렌더해 receipt 행이 아예 생성되지 않기 때문이다.

기준 시각만 바꾼 A/B가 원인을 확정한다:

| `renderStatus` 에 넘긴 `now` | drawer-data `receipt:` 키 |
|---|---|
| 픽스처 고정값 `Date.UTC(2026, 6, 1)` (=2026-07-01) | **0** |
| 실제 `Date.now()` (=2026-08-05) | **3** |

locus는 [plugins/mccp/scripts/lib/renderer/index.js:131](plugins/mccp/scripts/lib/renderer/index.js) 이다:

```js
const timeline = safeSection('audit-timeline',
  () => renderAuditTimeline(m, formatUtils, undefined, { snapshotsDir: snapshotsDir }));
```

`renderAuditTimeline(model, formatUtils, now, opts)` 의 3번째 인자 `now` 에 **`undefined` 가 하드코딩**돼 있어, 함수 내부 `if (typeof now !== 'number') now = Date.now();` 폴백이 항상 발동한다. 같은 파일의 다른 섹션들은 모두 `opts` 를 받는데 audit-timeline만 caller의 clock을 못 본다. 그 결과 7일 창 필터(`(now - t) <= SEVEN_DAYS_MS`, [audit-timeline.js:88](plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js))가 실제 벽시계로 비교되어, 2026-07-01 기준으로 만든 픽스처 receipt(NOW-1h/2h/3h)가 실시각과 ~35일 벌어져 전부 탈락한다.

**즉 시한폭탄 테스트다** — 2026-07-08경까지는 통과했고 그 이후 red가 됐다. 테스트 기대가 낡은 게 아니라, 프로덕션 코드가 결정론 계약을 어긴 것이다.

**프로덕션 영향 0**: 프로덕션 렌더 호출부는 **둘**이며 **둘 다 `now` 를 넘기지 않는다**.

| 호출부 | 전달 opts |
|---|---|
| [derive/cli.js:146](plugins/mccp/scripts/derive/cli.js) | `{ snapshotsDir }` |
| [renderer/trigger.js:293,298](plugins/mccp/scripts/lib/renderer/trigger.js) | `renderImpl(model, { snapshotsDir })` — auto-refresh 경로 |

따라서 `opts.now` 를 전달하도록 고쳐도 두 경로 모두 `opts.now === undefined` → 기존과 동일한 `Date.now()` 폴백이다. 결정론은 테스트에서만 복원된다.

> **Plan-Codex R1 next_step 3 흡수**: 초안은 `derive/cli.js:146` 을 *"유일한"* 프로덕션 호출부라고 적었다. 이는 **사실오류**였다 — `trigger.js` 의 auto-refresh 경로가 두 번째 호출부다. 결론(프로덕션 delta 0)은 살아남지만, 그 근거는 *모든* 호출부를 열거해야 성립한다. 향후 세 번째 호출부가 `now` 를 넘기며 추가되면 이 판정은 무효가 되므로, Task 1은 호출부 열거를 재확인한 뒤 수정한다.

### 결함 2 — 테스트가 gitignore된 경로의 커밋 산출물을 요구한다

`design-critique-loop-e2e.test.js` 의 케이스 F 는 `.claude/cache/test-fixture-status.html` 가 repo에 존재하기를 assert하며, 주석이 그 의도를 *"Verify it's present in the repo so future cycles can rely on it"* 이라고 밝힌다.

그런데 [.gitignore:82](.gitignore) 가 `.claude/cache/` 를 무시한다(`git check-ignore` 로 확인). `git ls-files .claude/cache/` 는 공집합이다. **이 경로의 파일은 커밋될 수 없으므로 assert는 구조적으로 충족 불가능하다.**

CLAUDE.md §3.9 도 같은 판정을 명문화하고 있다 — 이 fixture는 *"커밋물이 아니라 필요 시 test-time에만 쓰이는 임시 합성 파일이며 현재 tracked 상태가 아니다 — dogfood는 env 경로만으로 성립하므로 fixture 존재에 의존하지 않는다"*. 즉 테스트 전제가 프로젝트 계약과 정면으로 어긋난다.

PRD Open Question("생성할 것인가 skip할 것인가")의 답: **둘 다 아니다 — 실제 메커니즘을 테스트하도록 교체한다.** skip은 PRD가 out-of-scope로 금지한 은폐에 가깝고, repo 존재 assert는 영구히 불가능하다. 대신 test-time에 fixture를 **합성**해 detector가 그 위에서 positive를 내는지 검증하면, §3.9가 서술한 실제 계약을 테스트하게 된다.

### fan-out 결과 (기록)

Phase 2.5 fan-out은 **발화했다**(`run=true reason=ok-run fleetSize=4`, 2회). 그러나 두 번 모두 `coverage 1/4`(`agent_count=1`)로 강등됐고, 반환된 findings는 본 PRD가 아니라 mccp 전반의 dispatch/receipt 아키텍처에 관한 것이라 이 plan의 GROUND로 쓸 수 없다. 워크플로의 fail-safe(“검증되지 않은 fleet이 cap을 우회하지 않도록 4개를 조용히 띄우는 대신 1개로 강등”)는 **설계대로 작동했다**. 2.5.3 계약대로 fail-open하여 위 인라인 Pattern Grounding을 GROUND 원천으로 삼는다. 이 관찰(발화는 되나 fleet이 전달되지 않음)은 live-activation M2 관찰 ledger에 별도 기록한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 섹션 clock 전달 | `plugins/mccp/scripts/lib/renderer/index.js:125-137` | 모든 섹션이 `opts` 를 받아 caller의 컨텍스트를 따른다. audit-timeline만 예외인 것을 바로잡는다 |
| 폴백 유지 | `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js:77-78` | `if (typeof now !== 'number') now = Date.now();` — 인자 부재 시 폴백은 그대로 둔다(프로덕션 경로 보존) |
| 픽스처 합성 | `plugins/mccp/scripts/lib/tests/design-critique-loop-e2e.test.js` 내 기존 temp-repo 생성부 | 테스트가 필요한 산출물을 스스로 만들고 정리하는 기존 관행을 따른다 |
| 테스트 명명 | `plugins/mccp/scripts/lib/renderer/tests/verdict-label.test.js:137` | `'<주제> (F1) — <구체 단언>'` 형식 유지 |
| 회귀 가드 | `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:88-92` | 실패를 겪은 단언은 *왜 이렇게 anchor하는지* 주석으로 남긴다 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE | audit-timeline에 `opts.now` 전달 — 하드코딩된 `undefined` 제거 (결함 1의 근본원인) |
| `plugins/mccp/scripts/lib/renderer/tests/verdict-label.test.js` | UPDATE | 시한폭탄 재발 방지 회귀 가드 추가 (주입 clock을 따르는지 직접 단언) |
| `plugins/mccp/scripts/lib/tests/design-critique-loop-e2e.test.js` | UPDATE | 케이스 F를 repo-존재 assert에서 test-time 합성 + detector 검증으로 교체 (결함 2) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.1 → 1.23.2` patch bump (§3.7 — bug fix/axis close) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version `v1.23.1 → v1.23.2` (§3.7 footer 동기 — Codex R1 F1) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version `v1.23.1 → v1.23.2` (동상) |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer anchor 2건을 1.23.2로 갱신 |
| `CHANGELOG.md` | UPDATE | 1.23.2 row 추가 |

> **Plan-Codex R1 F1 흡수 (초안 정정)**: 초안은 footer 동기를 다음 minor로 유예하며 *"patch마다 갱신하면 i18n 테스트가 매번 흔들린다"* 고 적었다. 이는 거꾸로 된 논증이었다 — [CLAUDE.md:341](CLAUDE.md) 이 *"user-visible footer(`html.js` page-foot + `markdown.js` derived 줄)도 같은 version으로 동기화하세요 — plugin.json만 bump하고 footer를 빠뜨리면 surface 간 version drift가 생깁니다"* 라고 명문으로 요구하고, i18n anchor는 그 동기화를 **강제하는 장치**이지 회피할 마찰이 아니다. 유예하면 대시보드 footer가 `v1.23.1` 을 표시하는 동안 설치 cache key는 `1.23.2` 가 되어 update 검증과 버그 리포트가 모호해진다. 문자열 3곳 변경이므로 비용도 사소하다. **유예를 철회하고 본 cycle에서 동기한다.**

## Tasks

### Task 1: audit-timeline clock 주입 복원

- **Action**: `renderer/index.js:131-132` 의 `renderAuditTimeline(m, formatUtils, undefined, {...})` 를 `renderAuditTimeline(m, formatUtils, opts && opts.now, {...})` 로 바꾼다. `audit-timeline.js` 의 `Date.now()` 폴백은 **손대지 않는다** — 프로덕션 호출부가 `now` 를 안 넘기므로 폴백이 프로덕션 동작을 그대로 보존한다.
- **Mirror**: 같은 파일 125-137행의 다른 섹션들이 `opts` 를 받는 방식.
- **Validate**: `node --test "plugins/mccp/scripts/lib/renderer/tests/*.test.js"` → `verdict-label` 실패 소멸, 나머지 pass 수 비감소.

### Task 2: 시한폭탄 재발 방지 회귀 가드 (경계 단언)

- **Action**: `verdict-label.test.js` 에 **7일 경계 단언** 케이스를 추가한다. 하나의 receipt 타임스탬프 `T` 를 기준으로:
  - 주입 `now = T + 6d23h` → 그 receipt가 drawer-data에 **포함**됨을 단언
  - 주입 `now = T + 7d1h` → **배제**됨을 단언

  이 쌍은 "주입된 clock이 7일 창을 실제로 지배한다"를 직접 증명한다. 깨진 구현(`undefined` → `Date.now()`)은 두 경우 모두 실제 시각으로 판정하므로 둘 중 하나가 반드시 어긋나 **실패**한다.

- **왜 초안을 버렸는가 (Codex R1 F2 흡수)**: 초안은 *"동일 모델을 두 고정 시각으로 렌더해 `receipt:` 키 수가 같음"* 을 단언하려 했다. 이는 정확히 반대로 작동한다 — 픽스처 타임스탬프가 **절대값**(`iso(NOW - 3600000)`, 모듈 로드 시 1회 계산)이므로, 두 시각이 충분히 벌어지면 **올바른** 구현이 서로 다른 개수를 내어 등식이 깨지고, 두 시각이 가까우면 **깨진** 구현도 등식을 통과한다. 즉 초안 가드는 잡아야 할 회귀를 못 잡고 고쳐진 코드를 오히려 실패시킨다.
- **Mirror**: `i18n-surface.test.js:88-92` — 왜 이 anchor인지 주석으로 남기는 관행.
- **Validate**: Task 1을 임시로 되돌린 상태에서 이 새 케이스가 **실패**함을 A/B로 확인한다(가드가 공허하지 않음의 증명). 확인 후 Task 1을 복원한다.

### Task 3: fixture 전제 교체

- **Action**: `design-critique-loop-e2e.test.js` 케이스 F를 교체한다. repo 존재 assert를 제거하고, 대신 test-time에 임시 디렉터리에 합성 fixture를 쓰고 `impeccable-detect` 가 그 경로에서 positive를 내는지 단언한다. 테스트 이름에 "합성"을 드러내 은폐가 아님을 명시한다. **skip/삭제로 처리하지 않는다**(PRD out-of-scope).
- **Mirror**: 같은 파일의 기존 temp-repo 생성/정리 패턴.
- **Validate**: `node --test "plugins/mccp/scripts/lib/tests/design-critique*.test.js"` → fail 0.

### Task 4: 전수 baseline 확정 + 버전/CHANGELOG

- **Action**: 전 테스트 경로를 1회 전수 실행해 PRD Open Question 3(다른 red 잔존 여부)에 답하고 결과를 기록한다. 잔존 red가 있으면 **고치지 말고 목록만 남긴다**(본 milestone 범위 밖 — 별건 판단은 사용자 몫). 이어서 §3.7 version 동기를 **한 단위로** 수행한다:
  - `plugin.json` `1.23.1 → 1.23.2`
  - `renderer/html.js` page-foot `v1.23.1 → v1.23.2`
  - `renderer/markdown.js` derived 줄 `v1.23.1 → v1.23.2`
  - `renderer/tests/i18n-surface.test.js` footer anchor 2건 동반 갱신
  - `CHANGELOG.md` 1.23.2 row 추가
- **Mirror**: CLAUDE.md §3.7 bump 기준(단일 plan/milestone ship = patch) + footer 동기 요구(CLAUDE.md:341).
- **Validate**: `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"` → `1.23.2`, 그리고 `grep -rn "v1\.23\.1" plugins/mccp/scripts/lib/renderer/` 가 **공집합**(footer drift 0).

## Validation

```bash
# 대상 두 스위트
node --test "plugins/mccp/scripts/lib/renderer/tests/*.test.js"
node --test "plugins/mccp/scripts/lib/tests/design-critique*.test.js"

# 전수 baseline (Task 4)
node --test "plugins/mccp/scripts/**/*.test.js"

# 성공 기준: fail 0 AND pass 수 비감소 (무력화 탐지)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `undefined` 하드코딩이 의도적이었고(예: 스냅샷 경로가 실시각을 요구) `opts.now` 전달이 다른 동작을 깨뜨린다 | Low | 프로덕션 호출부가 `now` 를 안 넘김을 실측 확인함 → 프로덕션 경로는 폴백으로 불변. 전 renderer 스위트(667건)로 회귀 확인 |
| Task 2 가드가 공허한 테스트가 된다(항상 통과) | Medium | Task 1을 임시로 되돌려 가드가 실제로 실패하는지 A/B 확인을 Validate에 명시 |
| Task 3 교체가 원래 의도한 커버리지를 잃는다 | Medium | repo 존재 assert는 애초에 구조적으로 불가능해 커버리지가 아니라 상시 실패였다. 합성+detector 검증이 §3.9가 서술한 실제 계약을 처음으로 검증한다 |
| 전수 실행에서 다른 red가 대량 발견돼 범위가 번진다 | Medium | Task 4는 **기록만** 한다고 명시. 수정은 별건 |

## Design Critique

- 검출: `impeccable-detect --mode plan` → `skill_available=true`, `design_signal=true` (신호원: `renderer/index.js`, `renderer/tests/*`, plan 본문이 인용한 `.claude/cache/test-fixture-status.html`)
- 라운드: 1 / cap 2
- verdict: **CONVERGED** (findings 0)
- 판정 근거: 본 변경의 **프로덕션 렌더 표면 delta가 0**이다. 유일한 프로덕션 호출부 `derive/cli.js:146` 이 `now` 를 넘기지 않으므로 `opts.now === undefined` → `renderAuditTimeline` 의 기존 `Date.now()` 폴백이 그대로 발동한다. 4개 Output Constraints 대조: heading 추가 0(정보 위계 불변) · 색/토큰 변경 0(강조색 수 불변) · 신규 렌더 문자열 0(raw marker 없음) · **타임라인 행 수 불변**(유일하게 검토가 필요한 축이나, 프로덕션 clock이 동일해 행 집합이 동일).
- 한계 명시: 전체 impeccable critique 플로우(register reference 정독 등)는 밟지 않았다. 렌더 delta가 0인 변경에 비례하지 않는다고 판단했다. Task 1이 프로덕션 clock 경로까지 바꾸는 방향으로 확대되면 이 판정은 무효이며 critique을 재실행해야 한다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). 아래는 체크리스트일 뿐 plan 단계는 아무것도 invoke하지 않는다. 본 변경은 렌더 delta가 0이므로 실제로 해당하는 명령이 없다 — implement 단계의 `renderingSurface` selector가 control-plane-only로 판단해 refine/discovery를 recommend로 강등할 것으로 예상된다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |

## Codex Adversarial Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 · `--impeccable-available` design-scope preamble 적용)
- 라운드 수: 1 (cap=1, `MCCP_GATE_ROUND_CAP` default)
- classification: `ok` · blocking: `false` · durationMs: 545897 (~9분 — Bash 도구 600초 상한을 넘어 background+exit-marker로 실행)
- Codex verdict (structured `.result.verdict`): **`needs-attention`** → 게이트 verdict **`divergent`** (`codex-review-payload#deriveGateVerdict`, source=`structured`)
- 합치 결론: **No-ship (R1)** — plan이 (a) 릴리스 version 정합성 버그를 알면서 만들고, (b) 제안한 회귀 가드가 지키려는 clock 계약을 실제로 증명하지 못한다. **findings 2건 전부 ACCEPT_NOW로 흡수 후 plan 개정 완료.**

### YAGNI Triage

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 — footer/manifest version skew | MEDIUM | **ACCEPT_NOW** | 재현 확인. `CLAUDE.md:341` 이 footer 동기를 명문 요구하며, 초안의 유예 근거("i18n 테스트가 흔들린다")는 인과가 거꾸로였다 — anchor가 곧 동기 강제 장치다. 문자열 3곳 수정으로 해소 |
| F2 — 회귀 가드가 잘못된 이유로 통과/실패 | MEDIUM | **ACCEPT_NOW** | 재현 확인. 픽스처 타임스탬프가 절대값이라 "두 시각 키 수 동일" 등식은 올바른 구현에서 깨지고 깨진 구현에서 통과한다. 경계 단언(±7일)으로 교체 |
| next_step 3 — `trigger.js` 도 프로덕션 렌더 호출부 | (next_step) | **ACCEPT_NOW** | 재현 확인 (`trigger.js:293` `require('./index').renderStatus` → `:298` 호출). 초안의 "유일한 호출부"는 사실오류. 결론(프로덕션 delta 0)은 유지되나 근거를 전 호출부 열거로 교체 |

- Deferred to backlog: **0**
- Open Questions: 없음 (auto-CRITICAL 해당 없음 — secret 노출·데이터 손실·비가역 마이그레이션·auth 우회·외부 목적지 변경·crypto key 취급 모두 무관)
- R2 escalate 조건(`ACCEPT_NOW` × {HIGH, CRITICAL}) **미충족** — 3건 모두 MEDIUM 이하이므로 R1에서 종료
- Codex thread 참조: `019fd28e-3277-7882-b674-f514fc9266f9`

> **receipt verdict 봉인 주의**: 본 게이트 receipt의 `resolution.codex_verdict` 는 흡수 여부와 무관하게 Codex가 **실제로 말한 값**(`divergent`)으로 봉인된다. 이를 `converged` 로 세탁하면 cross-gate dedupe가 `/mccp:pr` 의 PR-Codex를 통째로 skip해 dual-review가 조용히 우회된다(v1.20.3 · v1.22.3 M3 F5가 닫은 결함). 따라서 PR 단계에서 PR-Codex가 **실제로 발화**하는 것이 정상 동작이다.

## Acceptance

- [ ] Task 1-4 완료
- [ ] `verdict-label.test.js` · `design-critique-loop-e2e.test.js` 모두 fail 0
- [ ] renderer 스위트 pass 수가 수정 전(666) 이상
- [ ] Task 2 가드가 Task 1 되돌림 시 실패함을 A/B로 확인
- [ ] 전수 baseline 결과 기록 (잔존 red 목록 또는 "없음")
- [ ] `plugin.json` 1.23.2 + CHANGELOG row
- [ ] **footer drift 0** — `grep -rn "v1\.23\.1" plugins/mccp/scripts/lib/renderer/` 공집합 (Codex R1 F1)
- [ ] Task 2 가드가 **경계 단언** 형태이며, Task 1 되돌림 시 실패함이 확인됨 (Codex R1 F2)
- [ ] 테스트를 skip·삭제·주석 처리한 곳이 없음 (PRD out-of-scope 준수)
