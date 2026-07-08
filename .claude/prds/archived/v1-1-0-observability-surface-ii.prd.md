# v1.1.0 — Observability Surface II

## Problem

mccp는 PRD/PLAN/PRP/REVIEW/REPORT/RECEIPT/AUDIT/NOTE 등 8종+ 산출물을 `.claude/` 하위에 분산 저장하면서, PM 역할을 자처하는 단일 사용자가 한 프로젝트에 진입했을 때 *지금 어디까지 왔는가 / 무엇이 막혔는가 / 다음 무엇을 봐야 하는가 / 어떤 risk가 있는가* 를 1분 안에 식별할 수 없는 상태다. `/mccp:receipt-status`와 `/mccp:trace` 등 기존 도구는 terminal text 단일 상태만 제공하며 visualize·interaction·cross-state correlation이 부재하다. 이를 해결하지 못하면 mccp가 표방하는 "AI 시대의 통일 SDLC 표준" 가치 자체가 무너진다.

## Evidence

- 현재 mccp repo `.claude/plans/*.plan.md` 18개, `.claude/PRPs/reports/*.md` 20개+ 존재 (사용자 직접 관찰).
- 각 .md 파일에 요약·중요도·핵심 마커 부재 → 전문 읽기 필요 (사용자 직접 관찰).
- 파일 간 cross-reference 추적이 grep 의존 (사용자 직접 관찰).
- 신규 진입 시 "어디부터 시작해야 할지" 식별 불가 — 매 프로젝트마다 README 학습 필요 (사용자 직접 관찰).
- `/mccp:receipt-status`는 단일 receipt만 출력, 어떤 slug를 호출할지 사용자가 미리 알아야 함 → 범용성 낮음 (사용자 직접 관찰).
- `/mccp:trace`는 사용자가 단 한 번도 사용한 적 없음 — 발견되지 않은 기능 (사용자 직접 관찰).
- 사용자는 `.md` 파일을 plan 생성 직후 1회만 읽고, 이후 변경되어도 다시 읽지 않으며 구현 결과로만 판단 → 현재의 .md-centric 통신은 사용자 실제 패턴과 mismatch (사용자 직접 관찰).
- AskUser signal의 `Q1`, `Q2` reference가 plan/code-review/prd 간 namespace 충돌하여 사용자가 어느 문서의 질문인지 식별 불가 (사용자 직접 관찰).

## Users

**Primary**: 자신을 PM으로 정의한 solo developer. AI가 작성한 코드는 보지 않고 PR 단위로 outcome만 검토·승인하는 주체. mccp-installed 임의 프로젝트 진입 시 1분 안에 in-progress / blocked / next-step / risk 식별을 목표로 한다.

**Hard invariant — "no direct .md edit"**: 사용자는 `.md` 파일을 *직접* 수정하지 않는다. 이 정의는 정밀하게 분리한다.

- ❌ **Banned (direct edit)**: 사용자가 에디터로 `.md` 파일을 열어 타이핑·수정·저장하는 행위. mccp의 어떤 명령도 사용자에게 *수동 .md 편집을 작업 과정의 일부로* 요구하지 않는다. (예: `## Notes` 섹션에 dogfood 기록을 직접 적어달라는 요구, 특정 위치에 항목을 끼워달라는 요구 등.)
- ✅ **Allowed (co-create via Q&A)**: AI가 구조화된 질문을 출제 → 사용자가 자연어/chat으로 답변 → AI가 답변을 종합해 `.md`를 자동 작성/갱신하는 패턴. `/mccp:plan-prd`, `/mccp:plan`, `/impeccable init`, AskUser signal 등 mccp/skill 표준 패턴은 모두 이 카테고리에 속한다.

핵심 차이: **사용자의 손이 파일을 만지는가**, 아니면 **AI가 파일을 만지고 사용자는 답변만 하는가**. 후자는 invariant 위반이 아니다.

v1.1 scope 내 도입 모듈은 (1)을 강제하지 않아야 한다. 기존 mccp 명령 중 (1) 위반 사례는 본 PRD scope 밖 — 별도 milestone에서 정리.

**Not for**:
- dev observability를 원하는 engineer (commit/branch/file-level diff 요구는 GitHub UI에서 처리).
- 다중 사용자 / 팀 협업 (multi-session orchestrator — v1.2 defer).
- 외부 SaaS dashboard 사용자.

## Hypothesis

We believe a **PM-oriented executive dashboard — auto-generated from `.claude/` artifacts, presenting analysis · verdict · risk per milestone with cross-state correlation, never requiring user `.md` editing** — will allow the primary user (and any mccp-installed project owner) to **enter any project and identify in-progress / blocked / next-step / risk in under 60 seconds, without grep**.

We'll know we're right when **subjective comprehension confidence on project entry reaches 8/10 (currently estimated ~3/10), measured 4 weeks after MVP ship via single-question retrospective**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| 진입 시 4축(in-progress / blocked / next / risk) 식별 시간 | < 60초 | binary self-report after MVP ship |
| 주관 이해 confidence on project entry | 8/10 (현재 ~3/10) | single-question retrospective at 4주차 |
| `.md` 직접 수정 요구 발생 횟수 (mccp 명령 + dashboard 통합) | 0 | hook trace + 사용자 보고 |
| dashboard 진입 후 `.md` 파일 직접 열람 빈도 (fallback signal) | < 주 1회 | 사용자 주관 보고 |
| AskUser signal cross-doc reference 혼동 발생 횟수 | 0 | 사용자 주관 보고 |

## Scope

**MVP** — "Briefing + LLM summary" derive-only dashboard:

- `.claude/cache/STATUS.md` + `.claude/cache/status.html` 두 산출물 (둘 다 derive cache, gitignore).
- 5섹션 구조: ① 1줄 verdict (현재 milestone 상태) ② in-progress / blocked / next-step ③ 최근 7일 audit timeline ④ open questions ⑤ risks.
- `receipt-write` hook에서 LLM 1회 호출 → receipt JSON에 `meta.briefing_summary` 1줄 stamp (~200 tokens 예상).
- Cross-state correlation 6+ source: plan ↔ receipt ↔ PR ↔ codex-findings-backlog ↔ STATE.md ↔ fix-task ↔ code-review finding.
- Generic `.claude/` 스캔 인터페이스 (Hybrid scope — mccp-repo가 reference impl).
- 사용자에게 .md 직접 수정 요구하는 코드 경로 0.
- AskUser cross-doc reference 충돌은 dashboard 렌더링 시점에 `{doc-id}:Q{n}` unique prefix 자동 부여로 우회 (근본 해결은 별도 v1.x).
- Daily snapshot `.claude/cache/snapshots/YYYY-MM-DD.json` archive (30일 retention).
- Privacy guard: 절대 경로 정규화, `meta.cwd` mask 옵션, `sk-` / `Bearer` / `password=` 패턴 검출 시 빨간 경고 (실제 값 미표시).
- 새 npm 의존성 0 (Node 내장 + 기존 mccp 유틸).

**Out of scope**

- commit / branch view — PR에서 확인 (사용자 명시).
- Multi-session aware — v1.2 multi-session orchestrator와 함께.
- Receipt schema bump v1 → v1.1 (derive only, extension field `meta.briefing_summary`는 unknown-field-permissive validator 가정으로 우회).
- 사용자에게 .md 수정 요구하는 어떤 기능 — forever out (hard invariant).
- Stable cross-doc reference ID 시스템 (Q1/Q2 namespace 근본 해결) — 별도 v1.x.
- On-demand "ask the dashboard" LLM (사용자 질문 → LLM이 .claude/ 검색해 답) — v1.2.
- 새 npm 의존성 — 0.
- DB / sidecar state / 외부 SaaS.

## Delivery Milestones

<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Derive engine | `.claude/` 스캔이 plan / receipt / STATE / backlog / fix-task / PR 6 소스를 단일 정규화 model로 통합. mccp 외 임의 repo에서도 graceful fallback. | pending | — |
| 2 | LLM briefing stamp | `receipt-write` hook에서 1회 LLM 호출 → `meta.briefing_summary` 자동 stamp. receipt validator unknown-field 허용 사전 검증 포함. | pending | — |
| 3 | STATUS.md + HTML renderer | derive model → `.claude/cache/STATUS.md` + `.claude/cache/status.html` 2 포맷. 5섹션 + cross-link badge + "Last refreshed" 상단 표시. | pending | — |
| 4 | Refresh · failure · privacy guard | SessionStart + receipt-write trigger. loud fail-open. secret / 경로 마스킹. 60초 초과 시 노란 경고. | pending | — |
| 5 | Daily snapshot + decision log | `.claude/cache/snapshots/YYYY-MM-DD.json` 30일 archive + audit timeline derive (최근 7일). | pending | — |
| 6 | Generic interface 검증 | mccp 외 임의 repo `.claude/`에서 graceful fallback 동작 검증 + reference impl로서 mccp-repo dogfood. | pending | — |

## Open Questions

- [ ] LLM 호출 비용 모델 — receipt-write당 ~200 tokens × 월간 호출 회수 추정 필요. cost-tier handoff ($50/$80/$100 threshold)와의 충돌 가능성.
- [ ] LLM briefing이 추론 실패 / hallucination 했을 때 사용자가 어떻게 인지? — confidence flag, raw finding 병기, fallback to derive-only 모드 중 어느 정책?
- [ ] "비개발자 영역" 톤 깊이 — 기술 용어(receipt, hash, gate)를 그대로 둘지, 일반어(승인 기록, 검증, 관문)로 풀지.
- [ ] AI 자기 평가(briefing의 verdict)가 PM 결정에 과도 영향 미칠 risk — neutral 톤 강제 또는 raw evidence 병기 정책 필요성.
- [ ] mccp-installed 다른 프로젝트의 `.claude/` 구조가 표준과 다르면 fallback 동작 정의 (Milestone 6에서 결정).
- [ ] dashboard 자체의 audit 누가 하나? — briefing 신뢰성 검증 메커니즘 (self-audit 가능 여부).
- [ ] receipt validator의 unknown-field 정책 사전 검증 — Milestone 2 첫 task로 schema extension 호환성 확인 (PRD 가정).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM briefing hallucination → PM이 잘못된 verdict 신뢰 | Medium | High | raw finding link 항상 병기, confidence flag, derive-only fallback 모드 옵션, briefing이 raw data를 *대체*하지 않고 *요약*만 한다는 invariant 명시 |
| `.md` 수정 invariant 위반 — mccp 다른 명령이 사용자에게 수동 편집 요구 | High | Medium | v1.1 PRD에 hard invariant 박고, v1.x에 별도 audit milestone로 검토. v1.1 신규 모듈은 invariant 위반 0 강제. |
| Receipt schema 변경 없이 6 소스 통합 시도 → derive 누락 / 부정확 | Medium | Medium | generic interface 검증(Milestone 6)에서 mccp 외 repo로 cross-validate. extension field `meta.briefing_summary` validator 호환성 사전 확인. |
| Dashboard scope creep — "ask the dashboard" 요구 / commit view 요구 등 | High | Low | PRD out-of-scope 명시 + plan 단계 Codex finding에서 차단 + santa-loop convergence 조건에 scope-creep finding을 hard reject 룰로 포함 |
| dashboard cache stale 채로 PM이 의사결정 → outdated verdict | Medium | High | "Last refreshed" 상단 표시 + 60s 초과 시 노란 경고 + receipt-write write-through trigger + SessionStart cold view |
| 비용 — receipt-write당 LLM 호출이 cost-tier handoff ($50/$80/$100)와 충돌 | Low | Medium | briefing 호출 회수 telemetry + cost projection (Open Question 1), critical threshold 초과 시 briefing 자동 disable + raw-only 모드 fallback |
| Generic scope의 추상화 비용 — mccp-repo dogfood 외 검증 부족 → 다른 repo에서 깨짐 | Medium | Medium | Milestone 6 명시. 최소 mccp 외 1개 repo에서 smoke 검증 후에야 milestone complete 판정. |

## Design Direction

> 본 섹션은 `/mccp:plan-prd` Phase 4.0이 호출한 impeccable Quick shape 결과를 PRD 본문에 append한 것입니다. 전략(PRODUCT.md) + 본 PRD + AskUser anti-refs 3축을 종합한 컴팩트 가이드. 정밀한 OKLCH 토큰 / 타이포 ramp / 컴포넌트 분해는 v1.1 implement Milestone 3 (HTML renderer) 시작 시 DESIGN.md로 별도 캡처합니다.

### Color strategy — Restrained

- **Commitment axis**: Restrained (tinted neutrals + 1 accent ≤10%). product 카테고리 디폴트, Calm·Compact 정합.
- **Color mode**: light mode 디폴트 + `prefers-color-scheme: dark` opt-in. 다크는 옵션이지 디폴트 아님 — 디폴트 다크는 dev-tool 미감 쪽으로 기울어 PM-voice를 약화. 사용자가 OS 설정으로 다크 선호 시에만 활성.
- **Hue**: cool-neutral (OKLCH hue 230~250) 미세 chroma. warm-neutral cream/sand는 anti-ref 2 (AI-cream landing) hard reject 룰.
- **OKLCH 토큰 초안** (DESIGN.md에서 확정):
  - `bg`: oklch(0.99 0 0) — 진짜 off-white, chroma 0 (warm tint 금지)
  - `surface`: oklch(0.97 0.003 250) — 배경에서 미세 elevation
  - `border`: oklch(0.92 0.005 250)
  - `ink`: oklch(0.20 0.005 250) — 본문, 4.5:1 대비 확보
  - `muted`: oklch(0.45 0.008 250) — 보조 텍스트, 4.5:1 검증 필수
  - `accent`: oklch(0.55 0.18 230) — 단일 signal blue (링크 + active state)
  - `status-blocked`: oklch(0.55 0.18 25) — warm red + 🚫/⛔ icon + text 3중
  - `status-stale`: oklch(0.75 0.15 80) — warm amber + ⏱ icon + text 3중
  - `status-secret`: oklch(0.50 0.22 25) — saturated red + ⚠ icon + text 3중
- **Status는 색 단독 금지 — color + icon + text 3중 표기**. WCAG AA + color blindness 동시 만족.

### Typography — One family, weight contrast

- **Family count: 1 (system stack) + 1 mono**. 3개 family 금지(impeccable 룰), display font 미사용.
- **Body**: `ui-sans-serif, system-ui, -apple-system, Segoe UI Variable, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`. 한국어 weight 보장.
- **Mono**: `ui-monospace, "SF Mono", Consolas, "Liberation Mono", monospace`. receipt id, hash prefix, decision_id, gate name 같은 *식별자만* mono. 본문은 mono 금지 (Bloomberg 미감 회피).
- **Scale**: modest, 1.25 ratio. base 15~16px, compact 우선.
  - h1 (verdict): 1.5rem ~ 1.75rem (clamp), weight 600
  - h2 (section): 1.125rem ~ 1.25rem, weight 600
  - body: 0.9375rem ~ 1rem, weight 400
  - meta/timestamp: 0.8125rem, weight 400, muted color
- **Line length**: body 65~75ch. h1~h3는 `text-wrap: balance`. 본문 prose는 `text-wrap: pretty`.
- **Letter-spacing**: 표준 (절대 -0.04em 이하 금지 per absolute ban).
- **ALL CAPS body 금지**. eyebrow `01 · ABOUT` 패턴 금지 (anti-ref 2 absolute ban).

### Layout — Single column, no cards

- **구조**: single column, max-width ~720px. 5섹션 vertically stacked + anchor nav (Compact 원칙).
- **Cards 금지 디폴트** — section을 카드로 감싸지 않음. 구분은 여백 + 1px 하단 border (`oklch(0.92 0.005 250)`). 카드는 status badge 같은 *진짜 atomic affordance*에만.
- **Side-stripe border 금지** (absolute ban).
- **Identical card grids 금지** (absolute ban — anti-ref 1 SaaS dashboards).
- **Grid vs Flex**: 5섹션 vertical은 flex. status 4축 표시는 `repeat(auto-fit, minmax(180px, 1fr))` grid 1줄.
- **Sticky header**: "Last refreshed: <ISO> · <Ns> ago" 상단 sticky. 60s 초과 시 amber 배경 + 텍스트 변경 (Quiet→Loud 전환의 첫 진입점).
- **No glassmorphism, no gradient bg, no hero-metric** (anti-ref 1 + absolute bans).

### Motion — Almost none

- **디폴트 모션 부재**. 새로고침 시 instant render.
- **허용 모션 3개만**:
  1. stale 진입 시 sticky header bg color crossfade (240ms ease-out-quart)
  2. status 변화 시 해당 셀 inline fade (160ms)
  3. detail expand/collapse (해당 시) height transition (200ms)
- **prefers-reduced-motion: reduce → 모두 instant**. `transition: none`.
- **No bounce, no elastic, no animated badges**. anti-ref 3 (Bloomberg tick blink) hard reject.
- **Reveal animation 금지** — class-triggered transition으로 콘텐츠 가시성 게이트 금지. 정적 페이지가 디폴트 (impeccable rule).

### Copy — Telegraphic, verb+object

- **Verdict 1줄 예시**: `"12 plans active · 2 blocked · next: PR review for v0.3.6"`. 형용사 부재, 동사+명사.
- **No em dashes** (absolute ban) — comma/colon/period/parens 사용.
- **No aphoristic cadence**. "Quiet, but not silent" 같은 punchy negation 반복 금지.
- **No marketing buzzwords** — streamline/empower/leverage/seamless 류 금지.
- **Button labels**: verb + object. "View v0.3.6 receipts" not "Click here". "Resolve open question" not "OK".
- **Link text standalone**. "View latest audit timeline" not "details here".
- **언어**: 한국어 primary, 영어는 식별자만 (receipt id, gate name, decision_id, "v0.3.6", "STATE.md", etc.).

### 5-section priority (Compact 원칙)

위에서 아래로 *중요도 내림차순*. 진입 1분 안에 첫 1~2섹션만 보고 의사결정 가능해야 함:

1. **Verdict** (largest, top) — 1줄. 전체 milestone 현황을 PM 톤으로. "ON TRACK", "BLOCKED", "AWAITING REVIEW" 같은 status 단어 + 보조 1줄.
2. **In-progress / Blocked / Next-step** — 4축 grid 1줄. color+icon+text 3중 표기.
3. **Audit timeline** (최근 7일) — 1줄 events. 각 줄: 날짜 · gate · 결과 + receipt id link. *분석 + 의견* (LLM briefing 1줄 stamp from `meta.briefing_summary`).
4. **Open questions** — checkbox list. PM이 결정 필요한 것만. 비어있으면 섹션 숨김.
5. **Risks** — table from PRD Risks. impact/likelihood badge + mitigation 1줄. 가장 아래 — PM이 *알아야 하지만 처음 보지 않아도 되는* 정보.

### AI slop check

- **First-order**: "AI dev observability dashboard" 추측 — Bloomberg-dark or cream-minimal or Linear-clone. 우리는 *light + cool chroma + true off-white + 카드 부재 + verdict 우선 hierarchy* → 세 reflex 모두 회피.
- **Second-order**: "AI dev tool dashboard, NOT Bloomberg, NOT cream" → editorial-typographic 또는 terminal-native. 우리는 둘 다 아님 (verbose typography도, terminal mono도 아님 — 본문은 sans, mono는 *식별자만*). 두 saturated lane 모두 회피.
- **Category-reflex 통과**.

---

*Status: DRAFT — requirements only. Implementation planning pending via `/mccp:plan`.*
*Co-created with user on 2026-06-13.*
