# v1.4.2 Status Dashboard UX/i18n/Content Overhaul

## Problem
mccp status dashboard(`.claude/cache/status.html`)는 v1.3.0-m3에서 ship됐으나
실제 운용에서 한 번도 사용되지 않은 채 m4/m5까지 surface 결함 8건이 누적됐다.
PRD writer가 첫 사용한 본 cycle에서 *읽을 수 없음*에 가까운 상태로 판명 —
i18n 표면 영어 비중, internal jargon expand 부재, 항목 중복, history 부재,
의도(why) 누락, status hoist 부재, 그리고 가장 결정적으로 `next: v0-3-5-...`
같은 *stale-plan surface*가 dashboard 신뢰도를 근본부터 무너뜨림. 추가로
Open Questions/Risks가 *읽기 surface*에 그쳐 사용자가 항목을 봐도 *다음에
어떤 prompt로 Claude/Codex에 위임할지* 모르는 actionability 결함도 발견.

## Evidence
- 첨부 캡처 `.worktrees/v1.3.0-prd-status-roll/.claude/cache/status.html` —
  최초 사용 시점 전체 markup (header / verdict / timeline / OQ / Risks).
- 식별 결함 9축 — §Problem + §Hypothesis 참조.
- m3 ship 시점 dogfood 부재 — *PRD writer가 첫 사용한 본 cycle*까지 surface
  defect 검증 path 없음. (8) next 오표시는 m3 시점부터 잠재.
- Actionability 부재 관찰 — Open Questions/Risks 모두 *어떤 prompt로 다음 행동을
  Claude/Codex에 위임할지* 표면화 안 됨 (사용자 명시 추가 axis).

## Users
- **Primary**: PRD writer — mccp dev workflow의 단독 cockpit 사용자, 한국어 native
- **Not for**: 외부 reviewer/PR participant, LLM-only consumer (이 dashboard는
  human surface — LLM이 SessionStart로 inject받는 STATE.md와 별개)

## Hypothesis
We believe **dashboard renderer의 i18n surface 정제 + plan-body parser 확장
(intent/goal/staleness validation) + status hoist + cross-section dedupe +
milestone history + actionability prompt template + meta-cue + jargon normalize**가
**"한국인 단독 사용자가 dashboard를 첫 사용에서 *읽을 수 없다*고 판단하는 문제 +
Open Questions/Risks를 보고도 *다음 행동을 못 잡는* 문제"**를
**PRD writer 본인의 dev cockpit**에서 해결한다고 본다.

We'll know we're right when:
- **a.** status.html 첫 로드 시 사용자가 *어느 surface도* "무슨 말인지 모르겠다"는
  반응 없이 *현재 진행 cycle + next milestone + 차단 risk + 최근 이벤트*를
  5초 안에 파악
- **b.** 9 axis 모두 axis별 acceptance criterion 통과
- **c.** main에 merge 후 사용자가 자발적으로 *주 1회 이상* dashboard surface를 호출
- **d.** Open Question 또는 Risk 1건마다 *복사 가능한 action prompt*가 동반되어
  사용자가 dashboard에서 prompt copy → Claude/Codex에 paste만으로 다음 단계 진입
- **e.** Open Question은 *meta-cue*가 동반 — 왜 이게 미해결인지 / plan body 어느
  section에서 왔는지 1줄 context

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| First-use comprehension | 5초 내 *현재 진행 + next + 차단 + 최근* 파악 | dogfood 시 self-report |
| Stale surface 0건 | next/audit-timeline에 cycle mismatch 0 | render fixture × stale plan injection test |
| Actionable OQ/Risks | 1건마다 copy-paste prompt 동반 | renderer integration test |
| Self-invocation rate | 주 1회 이상 dashboard 호출 | post-merge 1개월 자기 보고 |

## Scope
**MVP (Phase C — 2-step split)**

- M1: layout/i18n/staleness — (8) next-step staleness guard + (2) i18n surface label
  + (7) status hoist + (1) UX 시각 위계
- M2: 콘텐츠 정제 + actionability — (3) jargon expand + (4) cross-section dedupe
  + (5) milestone history + (6) intent(why) extraction + **(9) actionability prompt
  template + meta-cue**

**Out of scope** (명시적으로 본 cycle 미포함)
- `plugins/mccp/scripts/derive/*` 수정 (M1 derive surface immutable)
- `plugins/mccp/commands/*.md` 변경 (renderer scope 외)
- React/Vue 전환 (vanilla JS만)
- 새 file format (STATUS.md 동반 update OK, 새 산출물 없음)
- Codex/impeccable critique cycle 자체 변경
- status.html 자동 새로고침/polling (M4 trigger surface scope 외)
- ~~a11y WCAG 2.2 full pass (다음 cycle)~~ → M3로 흡수
- a11y WCAG 2.2 AAA (M3는 AA만, AAA는 다음 cycle)
- screen reader live-region (예: aria-live="polite" 동적 announce — M3 scope 외, 정적 markup만)

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | layout/i18n/staleness | 첫 사용 5초 내 *현재 진행 + next + 차단* 파악, stale surface 0건, 한글 surface label, status header hoist | in-progress | [v1-4-2-dashboard-overhaul-m1.plan.md](../plans/v1-4-2-dashboard-overhaul-m1.plan.md) |
| 2 | content + actionability | jargon expand, OQ/Risks dedupe + meta-cue + copy-paste action prompt, milestone history surface, intent(why) extraction | in-progress | [v1-4-2-dashboard-overhaul-m2.plan.md](../plans/v1-4-2-dashboard-overhaul-m2.plan.md) |
| 3 | a11y WCAG 2.2 AA + 잔여 OQ 명문화 | semantic landmark + skip-link + focus-visible 일관성 + ARIA label + 색 contrast lint, OQ-a~g 7건 결정 PRD에 본문화, color-only severity 금지 lint | complete | [v1-4-2-dashboard-overhaul-m3.plan.md](../plans/v1-4-2-dashboard-overhaul-m3.plan.md) |

## Open Questions
- [x] **OQ-a.** Stale plan 판정 기준 — (i) plan path basename cycle ID와 STATE.md
  `task_fingerprint` 일치, (ii) plan file mtime, (iii) PRD `## Delivery Milestones`
  status column — 셋 중 어느 조합?
  - **결정 (v1.4.2-M3)**: M1 `plan-body.js#staleness-guard` 채택 = **(i) plan path basename cycle ID와 STATE.md `task_fingerprint` 일치** + **(ii) plan file mtime** 둘 다. **(iii) PRD status column**은 보조 신호 (mismatch 시 i+ii 우선).
- [x] **OQ-b.** Korean i18n 시 영어 식별자(`mccp-plan-codex`, `MCCP_GATE_ROUND_CAP`
  등 env var/gate name) 정제 범위 — 코드/식별자는 영어 유지, 산문/label만 한글?
  - **결정 (v1.4.2-M3)**: gate name(`mccp-plan-codex`), env var(`MCCP_GATE_ROUND_CAP`), command(`/mccp:plan`), file path는 **영어 그대로**. `<abbr title="…">` 한글 풀이는 jargon-dictionary whitelist에 등록된 37 entry만 적용. 산문/label/section heading은 한글.
- [x] **OQ-c.** 인터랙션 깊이 — Hover 강조 / 섹션 fold-expand / filter+search
  중 어디까지?
  - **결정 (v1.4.2-M3)**: **hover background-color shift + native `<details>` expand만**. filter/search/sort는 v1.4.3+ defer (impeccable Acceptable register 정합 — "차분, 산만 최소").
- [x] **OQ-d.** milestone history surface 데이터 source — (i) git log + plugin.json
  version bump commits parse, (ii) PRD `## Delivery Milestones` complete row
  aggregation, (iii) receipt `mccp-pr-codex/*` ship 이벤트
  - **결정 (v1.4.2-M3)**: M2 `milestone-history.js` 채택 = **(ii) PRD `## Delivery Milestones` complete row** + **(iii) receipt `mccp-pr-codex/*` ship 이벤트** 결합. (i) git log parse는 secondary verification만 (`<time datetime>` 정확도 보강).
- [x] **OQ-e.** "한 화면 항목수 상한"(design direction anchor 4)의 *N* — OQ/Risks
  각각 상위 몇 개 expanded, 나머지 `<details>+N more</summary>` collapse?
  - **결정 (v1.4.2-M3)**: **3 expanded + 나머지 `<details>+N 더보기`** (OQ, Risks 동일).
- [x] **OQ-f.** OQ/Risk actionability prompt template 생성 source — (i) item text
  → static template (e.g., `/mccp:plan 또는 /codex:rescue 'item'`), (ii) LLM-derived
  (briefing infra 재활용), (iii) plan body 명시 anchor (e.g., `> action:` 라인)
  - **결정 (v1.4.2-M3)**: **(i) static template whitelist** (`/mccp:plan`, `/mccp:plan-prd`, `/codex:rescue`). LLM-derived 및 plan body anchor parse는 v1.4.3+.
- [x] **OQ-g.** Open Question meta-cue 데이터 source — (i) parse 시점에 plan body
  헤딩 path + 항목 위치 추출 (예: "v1-3-0-m6.plan.md §Open Questions, line 102"),
  (ii) OQ 항목 인접 산문 1-2줄 추출 ("이 항목은 ... 때문에 미해결")
  - **결정 (v1.4.2-M3)**: **(i) plan body 헤딩 path + 항목 위치 추출** — `basename §section, line N` 형식. (ii) 인접 산문 1-2줄 추출은 v1.4.3+ defer.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| stale plan 판정 기준이 false-positive로 *정상* in-progress plan을 stale 표시 | medium | high | OQ-a 결정 후 fixture 3종(현 cycle / cycle 다른 / 동일 cycle minor 진행) 테스트 추가 |
| Actionability prompt template이 *작동 안 하는* command를 잘못 제시 | medium | medium | static template 화이트리스트(`/mccp:plan`, `/mccp:plan-prd`, `/codex:rescue`)로 시작, LLM-derived는 OQ-f 결정 후 |
| Content 정제(jargon expand)가 *내용을 왜곡* | low | medium | normalize는 *append-only*(원문 + expansion), 원문 손상 금지. 테스트 fixture 3종 |
| design direction anchor 4 위반 (정보 위계 3단계 / 강조색 1개 / raw markdown 금지 / 항목수 상한) | high | medium | impeccable critique loop을 plan/implement 양 게이트 모두에서 활성 + M3가 lint 4종(landmark/aria-labels/contrast/severity-non-color)으로 mechanize |
| 9 axis 묶음이 큰 PR → review 부담 + Codex finding 다수 | high | medium | 2 milestone split, 각 milestone은 별도 plan + 별도 receipt |
| M3 renderer 본문 변경이 v1.3.0-m4/m5 trigger/snapshot 산출과 conflict | low | high | sections/* 인터페이스 보존(`render*` API 1:1), tests/integration.test.js + renderer-generic.test.js 회귀 0 |
| 본 cycle 직후 또 다른 사용자 unsurfaced defect 발견 | high | low | post-merge dogfood log를 OQ로 backlog에 기록, v1.4.3+ cycle로 routing |

## Design Direction

PRODUCT.md(2026-06-13)가 정한 register=product + Calm/Decisive/Compact 시스템 위에서,
v1.4.2 surface 특화 overrides + acceptance specs를 정리한다.

### Visual lane (assert)
- **Color strategy**: Restrained (PRODUCT.md default 유지). accent 1개 (현재 oklch
  220-240° blue 유지), severity는 red(blocked)/amber(stale/warn/secret) — 예외 신호
  로만 등장. 그 외 모든 surface는 ink/muted 2축으로 정렬.
- **Theme scene**: "PM-mode solo developer가 새 Claude Code 세션에서 cmd+click으로
  status.html을 열고, 60초 안에 *지금 어디 / 다음 뭐 / 막힌 것 / 행동* 4축을 훑는다.
  데스크탑 단일 모니터, 차분한 조명, 의사결정 직전." → light + dark prefers-color-
  scheme 양쪽 유지 (사용자 OS 토글에 위임).
- **Anchor refs**: Linear (status row 밀도 + 평정심 voice) / Plain editor
  (텔레그래픽 verdict 한 줄) / Raycast (item → action prompt routing).
- **Anti-refs (반복)**: Bloomberg/Datadog/SaaS-hero metric · cream/sand warm-minimal
  · gradient card · 균일 카드 그리드 · 작은 caps eyebrow.

### Information hierarchy (L1/L2/L3)
| Level | 위치 | 내용 | 목적 |
|---|---|---|---|
| L1 | sticky header | verdict tone + 4축 status strip (진행/차단/다음/최근) | 5초 skim |
| L2 | main 상단 | timeline (최근 7일 receipt + 30일 archive) | 최근 활동 흐름 |
| L3 | main 하단 | OQ / Risks / Workers (항목별 action prompt + meta-cue) | skim → act 진입점 |

3-level 위계는 design direction anchor 1 (정보 위계 3단계). 헤딩 depth ≤ 3.

### Layout
- 단일 720px column. 데스크탑 단일 환경 가정 (PRODUCT.md), 모바일 1축 fallback만.
- L1 header는 **status hoist** 적용 — verdict + 4축 strip + 상대 시각이 sticky
  영역에 항상 보임. 사용자가 어디로 스크롤해도 *현재 위치* 파악 가능.
- L3 섹션 항목은 **상위 3개 expanded + 나머지 `<details><summary>+N more`** —
  design direction anchor 4 (한 화면 항목수 상한).

### Color tokens (OKLCH, light/dark dual — 기존 토큰 유지)
| Token | Light | Dark | 용도 |
|---|---|---|---|
| `--bg` | 0.99 0 0 | 0.16 0.008 250 | 본문 배경 |
| `--surface` | 0.97 0.003 250 | 0.20 0.010 250 | 카드 / strip 배경 |
| `--ink` | 0.20 0.005 250 | 0.95 0.005 250 | 본문 텍스트 (대비 ≥ 7:1) |
| `--ink-2` | 0.32 0.006 250 | 0.82 0.008 250 | 항목 텍스트 |
| `--muted` | 0.48 0.008 250 | 0.66 0.012 250 | meta / 보조 텍스트 (≥ 4.5:1) |
| `--accent` | 0.55 0.18 230 | 0.72 0.16 230 | 1/viewport — 진행/링크 |
| `--signal` | 0.55 0.18 25 | 0.70 0.20 25 | 빨강 — blocked / 시크릿 |
| `--warn` | 0.60 0.15 80 | 0.78 0.16 80 | 노랑 — stale / warning |
| `--ok` | 0.50 0.14 145 | 0.68 0.16 145 | 초록 — 수렴 / OK |

**Accent 1개/viewport invariant** — L1 strip 또는 L2 timeline에 accent가 등장하면
L3 항목에는 accent 미사용 (회색 항목 + severity tag만). design direction anchor 2.

### Typography (1 family)
- `font-family`: `ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable",
  "Apple SD Gothic Neo", "Noto Sans KR", sans-serif` — 단일 sans, display/body 통합.
- 고정 rem 스케일 (clamp 미사용):
  - `1.5rem` (verdict L1) · `1rem` (body L2/L3) · `0.875rem` (item tag)
  - `0.75rem` (meta + footnote)
- `line-height: 1.55` (default), `text-wrap: balance` (verdict h1만).
- 텔레그래픽 voice — "12 plans active · 2 blocked · next: v1-4-2-…"

### Interaction model
- **Hover**: header strip 셀 + L3 item — `background-color` 1단계 shift (transform 금지).
- **Focus visible**: 2px `--accent` outline, offset 2px.
- **Expand**: L3 항목 = `<details>` native — JS 의존 없음, 키보드 navigable.
- **Copy prompt**: action prompt block의 `<button class="copy">` — `navigator.clipboard.writeText()`.
  성공 시 inline `✓ 복사됨` 1.5s 표시.
- **No modal** — 모든 detail은 inline expand. PRODUCT.md anti-pattern 정합.

### Motion
- 150-250ms `ease-out-quart`만 — hover bg / details expand / copy feedback.
- `prefers-reduced-motion: reduce` → 모든 transition `none`, 즉시 전환.
- 페이지 로드 orchestration 없음 (Product register motion ban).

### OQ / Risk 항목 surface treatment (v1.4.2 신규 axis)
4-part 컴포넌트 구조 — 사용자 명시 acceptance criterion:

1. **Tag**: severity (low/medium/high/critical) — color + 텍스트 (color-only 금지)
2. **Item text**: 본문 1-2 문장. raw `**bold**` MD0xx 금지 — parser가 markdown 정제 후 surface
3. **Meta-cue (왜?)**: `> 왜:` 한 줄 — 항목이 왜 미해결인지 + plan body 출처 anchor
4. **Action prompt block**: 코드 톤 박스 + `[Copy]` 버튼 + slash command template

### ASCII mockup

**L1 header strip (sticky)**

```
┌──────────────────────────────────────────────────────────────┐
│  mccp 상태  ·  ◐ 진행 2  ·  🚫 차단 1  ·  → 다음 m1 layout  │
│                                  · 마지막 갱신 3분 전 · stale │
└──────────────────────────────────────────────────────────────┘
```

전체가 1개 sticky strip — verdict tone(`◐` neutral) + 4축 status grid + 갱신 메타.
스크롤 시 항상 보임. accent 사용은 *다음* 셀 1군데만.

**L3 OQ 항목 1건 (4-part)**

```
┌──────────────────────────────────────────────────────────────┐
│  [medium]  Stale plan 판정 기준 — (i) basename×fingerprint   │
│            / (ii) mtime / (iii) PRD status 셋 중 어느 조합?  │
│                                                              │
│  > 왜:  같은 cycle 다중 plan일 때 next에 잘못 표시. 출처:    │
│         v1-4-2-dashboard-overhaul-m1.plan.md §Open Questions │
│                                                              │
│  ▾ 다음 액션                                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ /codex:rescue "OQ-a 결정: stale plan 판정 기준 후보    │ │
│  │ (i)/(ii)/(iii) 비교 + 권고"                            │ │
│  │                                          [Copy] ✓복사됨 │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

같은 4-part 구조가 Risks에도 동일 적용 — likelihood/impact tag + risk text +
"왜" cue + 해당 risk를 줄이는 prompt template.

### Acceptance criteria (impeccable Output Constraints anchor 정합)
- [x] **위계 3단계**: 헤딩 depth ≤ 3 (h1 verdict / h2 section / h3 item이 끝)
- [ ] **accent 1/viewport**: 한 화면당 `--accent` 사용 ≤ 1 surface
- [ ] **raw markdown 금지**: `**bold**`, MD0xx, raw inline code, `> bare blockquote` 없음
- [x] **항목 수 상한**: OQ 3 expanded + 나머지 `<details>`, Risks 3 expanded + 나머지 동일
- [x] **WCAG 2.2 AA**: 본문 4.5:1 / 큰 글자 3:1 / placeholder 4.5:1 (PRODUCT.md 정합) — M3 a11y-contrast.test.js 8 case strict ≥ 통과
- [x] **color+icon 이중 표기**: severity는 색 + 텍스트 + 아이콘 3중 — color-only 금지 — M3 a11y-severity-non-color.test.js lint
- [x] **prefers-reduced-motion**: 모든 motion 대안 + 모션 부재 시 동작 동일 — html.js LAYOUT @media query 유지
- [x] **OQ/Risk 4-part**: tag + item text + meta-cue + action prompt + Copy button

### Open design decisions (PRD §Open Questions로 routing)
- OQ-c (interaction 깊이) — recommend: **hover bg + native `<details>` expand만**, filter/search는 v1.4.3+ defer
- OQ-e (한 화면 항목수 상한 N) — recommend: **3 expanded + collapse**
- OQ-f (action prompt source) — recommend: **(i) static template whitelist 우선**, LLM-derived는 v1.4.3+

위 3개는 plan 단계 진입 시 default로 채택 (사용자 override 가능).

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-06-20.*
