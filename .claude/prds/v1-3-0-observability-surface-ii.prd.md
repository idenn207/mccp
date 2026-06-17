# v1.3.0 — Observability Surface II (Refresh)

> 본 PRD는 [v1-1-0-observability-surface-ii.prd.md](v1-1-0-observability-surface-ii.prd.md)의 v1.3.0 retarget refresh입니다. v1.0.0~v1.2.0 ship 결과(특히 orchestrator Stage 1+M1)를 반영해 scope·hypothesis·milestone·risk를 갱신했습니다. 원 PRD는 시점 audit를 위해 보존됩니다.

## Problem

mccp는 PRD/PLAN/PRP/REVIEW/REPORT/RECEIPT/AUDIT/NOTE 등 8종+ 산출물을 `.claude/` 하위에 분산 저장하고, v1.2.0-m1부터는 `.claude/state/dispatches/<uuid>.envelope.json`라는 multi-worker IPC envelope까지 추가됐다. PM 역할을 자처하는 단일 사용자가 mccp-installed 프로젝트에 진입했을 때 *지금 어디까지 왔는가 / 무엇이 막혔는가 / 다음 무엇을 봐야 하는가 / 어떤 risk가 있는가 / 어떤 worker가 살아있는가* 5축을 1분 안에 식별할 수 없는 상태다. `/mccp:receipt-status` + `/mccp:trace`(v0.2.7)는 terminal text 단일 상태만 제공하고, visualize·interaction·cross-state correlation·multi-worker view가 부재하다. v1.1.0 `/mccp:resume`로 handoff_spawn 신호는 정합화됐지만 신호 자체를 *사람이 읽는* 표면이 없다. 이를 해결하지 못하면 mccp가 표방하는 "AI 시대의 통일 SDLC 표준" 가치 자체가 무너진다.

## Evidence

- 현재 mccp repo `.claude/plans/*.plan.md` 20개+, `.claude/PRPs/reports/*.md` 22개+ 존재(사용자 직접 관찰).
- v1.2.0-m1 ship 후 `.claude/state/dispatches/*.envelope.json` schema는 라이브지만, parent session에서 worker 상태를 *읽는* 인터페이스 없음(2026-06-17 grep 확인).
- v1.1.0 `/mccp:resume`가 STATE.md `handoff_spawn` 신호를 읽지만, 신호의 *전후 맥락*(왜 dispatch됐는지, 어떤 task로 이어지는지)을 사람이 한눈에 보는 surface 없음(사용자 직접 관찰).
- 각 .md 파일에 요약·중요도·핵심 마커 부재 → 전문 읽기 필요(사용자 직접 관찰).
- 파일 간 cross-reference 추적이 grep 의존(사용자 직접 관찰).
- 신규 진입 시 "어디부터 시작해야 할지" 식별 불가 — 매 프로젝트마다 README 학습 필요(사용자 직접 관찰).
- `/mccp:receipt-status`는 단일 receipt만 출력, 어떤 slug를 호출할지 사용자가 미리 알아야 함(사용자 직접 관찰).
- `/mccp:trace`는 사용자가 단 한 번도 사용한 적 없음 — 발견되지 않은 기능(사용자 직접 관찰).
- 사용자는 `.md` 파일을 plan 생성 직후 1회만 읽고, 이후 변경되어도 다시 읽지 않으며 구현 결과로만 판단 → 현재의 .md-centric 통신은 사용자 실제 패턴과 mismatch(사용자 직접 관찰).
- AskUser signal의 `Q1`, `Q2` reference가 plan/code-review/prd 간 namespace 충돌 — v1.0.1/v1.1.0/v1.2.0 사이 작업 흔적 없음(2026-06-17 grep 확인). 그대로 미해결.
- v1.0.1 axis P가 ECC_* → MCCP_* env namespace 이전 → hook trace 표면의 env 변수 명칭이 달라짐. PRD가 가정한 receipt schema 명칭과 정합 필요.
- v1.2.0-m1이 receipt에 4 new `meta.*` 필드 추가(`meta.ipc_envelope_path`, `meta.dispatched_by_controller_session`, `meta.worker_dispatch_id`, `meta.codex_dedupe_at_pr` 등) → derive engine의 'unknown-field permissive' 가정을 사전 검증해야 함.

## Users

**Primary**: 자신을 PM으로 정의한 solo developer. AI가 작성한 코드는 보지 않고 PR 단위로 outcome만 검토·승인하는 주체. mccp-installed 임의 프로젝트 진입 시 1분 안에 in-progress / blocked / next-step / risk / **live-worker** 5축 식별을 목표로 한다.

**Hard invariant — "no direct .md edit"**: 사용자는 `.md` 파일을 *직접* 수정하지 않는다. 이 정의는 정밀하게 분리한다.

- ❌ **Banned (direct edit)**: 사용자가 에디터로 `.md` 파일을 열어 타이핑·수정·저장하는 행위. mccp의 어떤 명령도 사용자에게 *수동 .md 편집을 작업 과정의 일부로* 요구하지 않는다.
- ✅ **Allowed (co-create via Q&A)**: AI가 구조화된 질문을 출제 → 사용자가 자연어/chat으로 답변 → AI가 답변을 종합해 `.md`를 자동 작성/갱신하는 패턴. `/mccp:plan-prd`, `/mccp:plan`, `/impeccable init`, AskUser signal 등 mccp/skill 표준 패턴은 모두 이 카테고리에 속한다.

핵심 차이: **사용자의 손이 파일을 만지는가**, 아니면 **AI가 파일을 만지고 사용자는 답변만 하는가**. 후자는 invariant 위반이 아니다.

v1.3 scope 내 도입 모듈은 (1)을 강제하지 않아야 한다. 기존 mccp 명령 중 (1) 위반 사례는 본 PRD scope 밖 — 별도 milestone에서 정리.

**Not for**:

- dev observability를 원하는 engineer (commit/branch/file-level diff 요구는 GitHub UI에서 처리).
- 다중 사용자 / 팀 협업.
- 외부 SaaS dashboard 사용자.
- multi-session orchestrator Stage 2 M2(pilot worker fanout) / M3(6-case lifecycle) *implementation* — v1.3은 dashboard가 envelope schema를 *읽기*만 하며 dispatch/spawn 동작은 별도 milestone.

## Hypothesis

We believe a **PM-oriented executive dashboard — auto-generated from `.claude/` artifacts (now including `dispatches/*.envelope.json`), presenting analysis · verdict · risk per milestone with cross-state correlation that spans parent session + worker fanout, never requiring user `.md` editing** — will allow the primary user (and any mccp-installed project owner) to **enter any session and identify in-progress / blocked / next-step / risk / live-worker in under 60 seconds, without grep**.

We'll know we're right when **subjective comprehension confidence on session entry reaches 8/10 (currently estimated ~3/10), measured 4 weeks after MVP ship via single-question retrospective, AND parent-session PM identifies "which workers are alive" with zero context-switch into individual envelope JSON**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| 진입 시 5축(in-progress / blocked / next / risk / live-worker) 식별 시간 | < 60초 | binary self-report after MVP ship |
| 주관 이해 confidence on session entry | 8/10 (현재 ~3/10) | single-question retrospective at 4주차 |
| `.md` 직접 수정 요구 발생 횟수 (mccp 명령 + dashboard 통합) | 0 | hook trace + 사용자 보고 |
| dashboard 진입 후 `.md` 파일 직접 열람 빈도 (fallback signal) | < 주 1회 | 사용자 주관 보고 |
| dashboard 진입 후 `envelope.json` 직접 열람 빈도 (fallback signal) | < 주 1회 | 사용자 주관 보고 |
| AskUser signal cross-doc reference 혼동 발생 횟수 | 0 | 사용자 주관 보고 |
| LLM briefing 월간 호출 비용 | ≤ $5 / month / project | receipt meta.briefing_summary 호출 telemetry |
| cost-tier $50 notice 도달 시 briefing 자동 disable 동작 | binary OK | 운영 dogfood |

## Scope

**MVP** — "Briefing + LLM summary + worker fanout" derive-only dashboard:

- `.claude/cache/STATUS.md` + `.claude/cache/status.html` 두 산출물(둘 다 derive cache, gitignore).
- **6섹션 구조**(원 5섹션에 worker fanout 행 추가): ① 1줄 verdict ② in-progress / blocked / next-step ③ **live worker fanout**(parent + active envelope rows) ④ 최근 7일 audit timeline ⑤ open questions ⑥ risks.
- `receipt-write` hook에서 LLM 1회 호출 → receipt JSON에 `meta.briefing_summary` 1줄 stamp(~200 tokens 예상). **호출 telemetry**(누적 token / 호출 count)를 같이 stamp.
- **Cost-tier 연계**: auto-handoff `notify` 임계($50)에 도달하면 briefing 호출 자동 disable + raw-only fallback. cost telemetry는 STATE.md 갱신 시 1회 evaluate.
- Cross-state correlation **7+ source**: plan ↔ receipt ↔ PR ↔ codex-findings-backlog ↔ STATE.md ↔ fix-task ↔ code-review finding ↔ **dispatch envelope**.
- Generic `.claude/` 스캔 인터페이스(Hybrid scope — mccp-repo가 reference impl). envelope.json 미존재 시 worker fanout 섹션은 graceful hide.
- 사용자에게 .md 직접 수정 요구하는 코드 경로 0.
- AskUser cross-doc reference 충돌은 dashboard 렌더링 시점에 `{doc-id}:Q{n}` unique prefix 자동 부여로 우회(근본 해결은 별도 v1.x).
- Daily snapshot `.claude/cache/snapshots/YYYY-MM-DD.json` archive(30일 retention). snapshot에 envelope 상태 freeze 포함.
- Privacy guard: 절대 경로 정규화, `meta.cwd` mask 옵션, `sk-` / `Bearer` / `password=` 패턴 검출 시 빨간 경고(실제 값 미표시). envelope.json에 stash된 prompt/output fragment도 동일 마스킹.
- 새 npm 의존성 0(Node 내장 + 기존 mccp 유틸).

**Out of scope**

- commit / branch view — PR에서 확인(사용자 명시).
- multi-session orchestrator Stage 2 M2(pilot fanout) / M3(6-case lifecycle) *implementation* — v1.3은 envelope schema *reader only*.
- worker prompt/output 전문 표시 — dashboard는 envelope의 status/timestamp/error 요약만. raw payload 열람은 envelope.json 직접 접근.
- Receipt schema bump v1 → v1.1 (derive only). `meta.briefing_summary` 같은 신규 필드는 M2 진입 전 schema.js에 명시적으로 추가하는 것이 prerequisite (Errata + docs/v1.3.0-observability/schema-surface.md §6.1 참조). M0는 이 prerequisite를 본문화만 하고 실제 schema 변경은 M2에서.
- 사용자에게 .md 수정 요구하는 어떤 기능 — forever out(hard invariant).
- Stable cross-doc reference ID 시스템(Q1/Q2 namespace 근본 해결) — 별도 v1.x.
- On-demand "ask the dashboard" LLM(사용자 질문 → LLM이 .claude/ 검색해 답) — v1.4 후보.
- 새 npm 의존성 — 0.
- DB / sidecar state / 외부 SaaS.

## Delivery Milestones

<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 0 | **Schema baseline alignment** | receipt validator의 unknown-field 정책을 v1.2.0-m1 4개 `meta.*` 필드 + STATE.md 2-phase dispatch frontmatter + envelope.json schema에 대해 사전 검증. derive engine이 *어떤 필드 set을 안정적으로 가정하는지* 본문화. v1.0.1 ECC→MCCP env namespace 변경 영향 정리. | complete | [v1-3-0-observability-m0-schema-baseline.plan.md](../PRPs/plans/completed/v1-3-0-observability-m0-schema-baseline.plan.md) · [report](../PRPs/reports/v1-3-0-observability-m0-schema-baseline-report.md) |
| 1 | Derive engine | `.claude/` 스캔이 plan / receipt / STATE / backlog / fix-task / PR / **dispatch envelope** 7 소스를 단일 정규화 model로 통합. mccp 외 임의 repo에서도 graceful fallback (envelope 미존재 OK). | in-progress | [v1-3-0-observability-m1-derive-engine.plan.md](../plans/v1-3-0-observability-m1-derive-engine.plan.md) |
| 2 | LLM briefing stamp + cost telemetry | `receipt-write` hook에서 1회 LLM 호출 → `meta.briefing_summary` 자동 stamp. **호출 telemetry(token count + invocation count)** 같이 stamp. cost-tier $50 notice 도달 시 briefing 자동 disable + raw-only fallback. | pending | — |
| 3 | STATUS.md + HTML renderer | derive model → `.claude/cache/STATUS.md` + `.claude/cache/status.html` 2 포맷. **6섹션**(worker fanout 추가) + cross-link badge + "Last refreshed" 상단 표시. envelope 미존재 시 fanout 섹션 graceful hide. | pending | — |
| 4 | Refresh · failure · privacy guard | SessionStart + receipt-write + **envelope write/move** trigger. loud fail-open. secret / 경로 마스킹(envelope payload 포함). 60초 초과 시 노란 경고. | pending | — |
| 5 | Daily snapshot + decision log | `.claude/cache/snapshots/YYYY-MM-DD.json` 30일 archive + audit timeline derive(최근 7일). snapshot에 envelope 상태 freeze 포함. | pending | — |
| 6 | Generic interface 검증 | mccp 외 임의 repo `.claude/`에서 graceful fallback 동작 검증(envelope 없는 repo 포함) + reference impl로서 mccp-repo dogfood. | pending | — |

## Open Questions

- [ ] LLM 호출 비용 모델 — receipt-write당 ~200 tokens × 월간 호출 회수 추정. cost-tier handoff($50/$80/$100 threshold)와의 충돌 가능성. **Milestone 2 task로 telemetry + auto-disable 검증**.
- [ ] LLM briefing이 추론 실패 / hallucination 했을 때 사용자가 어떻게 인지? — confidence flag, raw finding 병기, fallback to derive-only 모드 중 어느 정책?
- [ ] "비개발자 영역" 톤 깊이 — 기술 용어(receipt, hash, gate, envelope)를 그대로 둘지, 일반어(승인 기록, 검증, 관문, 작업봉투)로 풀지.
- [ ] AI 자기 평가(briefing의 verdict)가 PM 결정에 과도 영향 미칠 risk — neutral 톤 강제 또는 raw evidence 병기 정책 필요성.
- [ ] mccp-installed 다른 프로젝트의 `.claude/` 구조가 표준과 다르면 fallback 동작 정의(Milestone 6에서 결정).
- [ ] dashboard 자체의 audit 누가 하나? — briefing 신뢰성 검증 메커니즘(self-audit 가능 여부).
- [ ] envelope schema가 Stage 2 M2/M3 진행 중 **further evolve**할 가능성 — 어떤 schema version까지 derive가 안정적인지 본문화 정책(Milestone 0 task).
- [ ] STATE.md 2-phase resume dispatch tracking (frontmatter `dispatch_id` / `dispatch_id_completed` / `dispatch_attempt_count` + VALID_EVENTS markers `resume_dispatching` / `resume_dispatched`) 의 tri-state(미설정/in-flight/completed) 해석 표시 톤 — '진행 중'을 어떻게 시각화할지. controller layer (`controller_session_id` / `active_dispatch_count`, v1.2.0-m1)도 같은 surface에 합쳐 표시. 자세한 매핑: docs/v1.3.0-observability/state-md-naming-reconciliation.md.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM briefing hallucination → PM이 잘못된 verdict 신뢰 | Medium | High | raw finding link 항상 병기, confidence flag, derive-only fallback 모드 옵션, briefing이 raw data를 *대체*하지 않고 *요약*만 한다는 invariant 명시 |
| `.md` 수정 invariant 위반 — mccp 다른 명령이 사용자에게 수동 편집 요구 | High | Medium | v1.3 PRD에 hard invariant 박고, v1.x에 별도 audit milestone로 검토. v1.3 신규 모듈은 invariant 위반 0 강제. |
| Receipt schema 변경 없이 7 소스 통합 시도 → derive 누락 / 부정확 | Medium | Medium | Milestone 0이 schema baseline 사전 검증. generic interface 검증(Milestone 6)에서 mccp 외 repo로 cross-validate. extension field `meta.briefing_summary` + `meta.ipc_envelope_path` validator 호환성 사전 확인. |
| Dashboard scope creep — "ask the dashboard" 요구 / commit view 요구 등 | High | Low | PRD out-of-scope 명시 + plan 단계 Codex finding에서 차단 + santa-loop convergence 조건에 scope-creep finding을 hard reject 룰로 포함 |
| dashboard cache stale 채로 PM이 의사결정 → outdated verdict | Medium | High | "Last refreshed" 상단 표시 + 60s 초과 시 노란 경고 + receipt-write + envelope write/move write-through trigger + SessionStart cold view |
| 비용 — receipt-write당 LLM 호출이 cost-tier handoff($50/$80/$100)와 충돌 | Low | Medium | briefing 호출 회수 telemetry(Milestone 2) + cost projection, $50 notice 도달 시 briefing 자동 disable + raw-only 모드 fallback |
| Generic scope의 추상화 비용 — mccp-repo dogfood 외 검증 부족 → 다른 repo에서 깨짐 | Medium | Medium | Milestone 6 명시. 최소 mccp 외 1개 repo에서 smoke 검증 후에야 milestone complete 판정. |
| **envelope schema drift** — Stage 2 M2/M3 진행 중 envelope.json 필드 추가/변경 → derive가 깨짐 | High | Medium | envelope에 `schema_version` 필드를 *읽기 시점*에 stamp 가정 + derive unknown-field permissive + 미지원 version 검출 시 fanout 섹션에 amber 경고 표시. Milestone 0이 *현 시점* envelope schema를 본문화. |
| **STATE.md dispatch signal 오해석** — resume 2-phase atomic tracking(`dispatch_id` set + `dispatch_id_completed` null = phase-2 pending; v1.1.0 layer) 또는 controller 2-phase tracking(`controller_session_id` + `active_dispatch_count>0` = in-flight; v1.2.0-m1 layer) 중간 crash 상태를 'completed'로 잘못 표시 | Medium | High | 두 layer 모두 조회 + tri-state 해석(미설정 / in-flight / completed). mid-dispatch crash 시 'unknown — manual check' 라벨. v1.1.0 `/mccp:resume` 로직과 동일 invariant. 매핑: docs/v1.3.0-observability/state-md-naming-reconciliation.md. |
| **Codex/impeccable scope split 영향**(v0.3.6) — scope-excluded finding drop이 dashboard timeline에서 '조용함' 오해 일으킴 | Low | Low | `dropped_findings_digest`(receipt meta)도 timeline에 명시. drop reason(design vs a11y)를 1줄 footnote로 표시. |
| **quarantine receipt drift**(v0.2.8 generic-receipt + v1.1.0 handoff quarantine) — quarantine marker 누적 시 derive가 stale entry를 live로 읽음 | Medium | High | quarantine marker(`.claude/receipts/.migrations/*.json`) honor + age guard(`mtime > 90일`인 receipt는 archive zone 표시). Milestone 0이 quarantine 인식 본문화. |

## Compatibility & Migration Notes (v1.0.0 → v1.3.0 delta)

> 본 섹션은 v1.0.0~v1.2.0 ship 내역이 v1.3.0 dashboard 구현 가정에 미치는 영향을 PM 관점에서 요약한다. plan 단계가 task로 분해할 raw input.

| 변경 | 출처 | dashboard 영향 |
|---|---|---|
| ECC_* → MCCP_* env namespace | v1.0.1 axis P (#25) | hook trace 표면 + receipt meta env 명칭 정렬. derive 가정 명시(Milestone 0). |
| pr-phase-guard PID liveness | v1.0.1 axis K1 (#24) | derive-decision augmentation은 dashboard가 verdict 1줄을 만들 때 직접 활용 가능. |
| Cross-platform 픽스처 + W11 rubric | v1.0.1 axis K2 (#26) | dashboard 자체가 Windows/macOS/Linux 모두에서 동작해야 함. line-ending(CRLF) + path separator 처리 invariant. |
| auto-handoff quarantine + STATE.md `handoff_spawn` 신호 | v1.1.0-s1 (#27) | derive가 STATE.md frontmatter의 resume 2-phase tracking(`dispatch_id` / `dispatch_id_completed` / `dispatch_attempt_count` + VALID_EVENTS `resume_dispatching` / `resume_dispatched`)을 honor. tri-state 표시. |
| `/mccp:resume` 진입점 | v1.1.0-s1 (#27) | dashboard "next-step" 섹션이 resume target task를 자동 인식 가능. |
| dispatch-controller foundation IPC | v1.2.0-m1 (#29) | `dispatches/*.envelope.json` 새 derive source. terminal/nonterminal status 5종 + heartbeat 인식. |
| receipt 4 new `meta.*` 필드 | v1.2.0-m1 (#29) | `meta.ipc_envelope_path`, `meta.dispatched_by_controller_session`, `meta.worker_dispatch_id`, `meta.codex_dedupe_at_pr`. Milestone 0이 unknown-field permissive validator 동작 사전 검증. |
| plugin.json version bump axis | v1.2.0 post-ship (#30) | dashboard PR이 milestone ship일 때 plugin.json version도 같이 bump해야 함을 plan에 명시. |

## Design Direction

> 본 섹션은 원 PRD [v1-1-0-observability-surface-ii.prd.md](v1-1-0-observability-surface-ii.prd.md)의 impeccable Quick shape 결과를 carry-over한 것입니다. 시각적 결정(Restrained color, system stack typography, single column, no cards, almost no motion, telegraphic copy)은 v1.3 retarget에도 그대로 유효하므로 보존합니다. 6번째 섹션(live worker fanout) 추가에 따른 레이아웃 미세조정만 v1.3 implement Milestone 3 시작 시 DESIGN.md로 별도 캡처합니다.

### Color strategy — Restrained

- **Commitment axis**: Restrained (tinted neutrals + 1 accent ≤10%). product 카테고리 디폴트, Calm·Compact 정합.
- **Color mode**: light mode 디폴트 + `prefers-color-scheme: dark` opt-in. 다크는 옵션이지 디폴트 아님.
- **Hue**: cool-neutral (OKLCH hue 230~250) 미세 chroma. warm-neutral cream/sand는 anti-ref 2 hard reject 룰.
- **OKLCH 토큰 초안** (DESIGN.md에서 확정):
  - `bg`: oklch(0.99 0 0) — 진짜 off-white
  - `surface`: oklch(0.97 0.003 250) — 배경에서 미세 elevation
  - `border`: oklch(0.92 0.005 250)
  - `ink`: oklch(0.20 0.005 250) — 본문, 4.5:1 대비 확보
  - `muted`: oklch(0.45 0.008 250) — 보조 텍스트, 4.5:1 검증 필수
  - `accent`: oklch(0.55 0.18 230) — 단일 signal blue (링크 + active state)
  - `status-blocked`: oklch(0.55 0.18 25) — warm red + 🚫/⛔ icon + text 3중
  - `status-stale`: oklch(0.75 0.15 80) — warm amber + ⏱ icon + text 3중
  - `status-secret`: oklch(0.50 0.22 25) — saturated red + ⚠ icon + text 3중
  - `status-worker-alive`: oklch(0.65 0.15 145) — cool green + ● icon + text 3중 (v1.3 추가)
  - `status-worker-stale`: oklch(0.75 0.15 80) — amber, status-stale과 공유
- **Status는 색 단독 금지 — color + icon + text 3중 표기**. WCAG AA + color blindness 동시 만족.

### Typography — One family, weight contrast

- **Family count: 1 (system stack) + 1 mono**.
- **Body**: `ui-sans-serif, system-ui, -apple-system, Segoe UI Variable, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`.
- **Mono**: `ui-monospace, "SF Mono", Consolas, "Liberation Mono", monospace`. receipt id, hash prefix, decision_id, gate name, **envelope uuid**만 mono. 본문은 mono 금지.
- **Scale**: modest, 1.25 ratio. base 15~16px, compact 우선.
  - h1 (verdict): 1.5rem ~ 1.75rem (clamp), weight 600
  - h2 (section): 1.125rem ~ 1.25rem, weight 600
  - body: 0.9375rem ~ 1rem, weight 400
  - meta/timestamp: 0.8125rem, weight 400, muted color
- **Line length**: body 65~75ch. h1~h3는 `text-wrap: balance`. 본문 prose는 `text-wrap: pretty`.
- **Letter-spacing**: 표준 (절대 -0.04em 이하 금지 per absolute ban).
- **ALL CAPS body 금지**. eyebrow `01 · ABOUT` 패턴 금지.

### Layout — Single column, no cards

- **구조**: single column, max-width ~720px. **6섹션** vertically stacked + anchor nav.
- **Cards 금지 디폴트** — section을 카드로 감싸지 않음. 구분은 여백 + 1px 하단 border.
- **Side-stripe border 금지** (absolute ban).
- **Identical card grids 금지** (absolute ban — anti-ref 1 SaaS dashboards).
- **Grid vs Flex**: 6섹션 vertical은 flex. status 4축 표시는 `repeat(auto-fit, minmax(180px, 1fr))` grid 1줄. **worker fanout row**도 같은 grid 컨벤션.
- **Sticky header**: "Last refreshed: <ISO> · <Ns> ago" 상단 sticky. 60s 초과 시 amber 배경 + 텍스트 변경.
- **No glassmorphism, no gradient bg, no hero-metric**.

### Motion — Almost none

- **디폴트 모션 부재**. 새로고침 시 instant render.
- **허용 모션 3개만**:
  1. stale 진입 시 sticky header bg color crossfade (240ms ease-out-quart)
  2. status 변화 시 해당 셀 inline fade (160ms)
  3. detail expand/collapse (해당 시) height transition (200ms)
- **prefers-reduced-motion: reduce → 모두 instant**. `transition: none`.
- **No bounce, no elastic, no animated badges**.
- **Reveal animation 금지** — class-triggered transition으로 콘텐츠 가시성 게이트 금지.

### Copy — Telegraphic, verb+object

- **Verdict 1줄 예시**: `"12 plans active · 2 blocked · 3 workers alive · next: PR review for v1.3.0"`. 형용사 부재, 동사+명사.
- **No em dashes** — comma/colon/period/parens 사용.
- **No aphoristic cadence**.
- **No marketing buzzwords**.
- **Button labels**: verb + object. "View v1.2.0-m1 receipts" not "Click here".
- **Link text standalone**. "View worker fanout snapshot" not "details here".
- **언어**: 한국어 primary, 영어는 식별자만 (receipt id, gate name, decision_id, envelope uuid, "v1.2.0-m1", "STATE.md", etc.).

### 6-section priority (Compact 원칙)

위에서 아래로 *중요도 내림차순*. 진입 1분 안에 첫 1~3섹션만 보고 의사결정 가능해야 함:

1. **Verdict** (largest, top) — 1줄.
2. **In-progress / Blocked / Next-step** — 4축 grid 1줄.
3. **Live worker fanout** (v1.3 신규) — parent session + active envelope rows. terminal/nonterminal 5상태 색+아이콘+텍스트. envelope 없으면 섹션 자체 hide.
4. **Audit timeline** (최근 7일) — 1줄 events. *분석 + 의견* (LLM briefing 1줄 stamp from `meta.briefing_summary`).
5. **Open questions** — checkbox list. 비어있으면 섹션 숨김.
6. **Risks** — table from PRD Risks. impact/likelihood badge + mitigation 1줄.

### AI slop check

- **First-order**: "AI dev observability dashboard" 추측 — Bloomberg-dark or cream-minimal or Linear-clone. 우리는 *light + cool chroma + true off-white + 카드 부재 + verdict 우선 hierarchy* → 세 reflex 모두 회피.
- **Second-order**: "AI dev tool dashboard, NOT Bloomberg, NOT cream" → editorial-typographic 또는 terminal-native. 우리는 둘 다 아님.
- **Category-reflex 통과**.

---

*Status: DRAFT — requirements only. Implementation planning pending via `/mccp:plan`.*
*Refreshed from [v1-1-0-observability-surface-ii.prd.md](v1-1-0-observability-surface-ii.prd.md) on 2026-06-17. Original co-created on 2026-06-13.*

---

## Errata (v1.3.0-m0 schema baseline)

- 2026-06-17: STATE.md handoff field references corrected throughout body. Original PRD body referenced two non-existent frontmatter identifiers as the assumed 2-phase atomic dispatch markers; the actual schema uses a resume-layer triple (`dispatch_id` / `dispatch_id_completed` / `dispatch_attempt_count`, v1.1.0) plus a controller-layer pair (`controller_session_id` / `active_dispatch_count`, v1.2.0-m1) plus two VALID_EVENTS markers. The literal stale-name mapping lives in [docs/v1.3.0-observability/state-md-naming-reconciliation.md](../../docs/v1.3.0-observability/state-md-naming-reconciliation.md) §1; this errata is descriptive on purpose so the PRD body is free of the stale identifiers (audit-clean grep). Amendments applied in Open Questions, Risks, and Compatibility & Migration Notes sections.
- 2026-06-17: "Receipt schema 변경 없이 7 소스 통합 시도" Risks row implicit assumption about an unknown-field-permissive validator was clarified — the validator silently ignores unknown `meta` keys as a backward-compat read property, NOT as a forward-compat writer contract. M2 (briefing stamp) MUST add explicit `meta.briefing_summary` + `meta.briefing_token_count` + `meta.briefing_invocation_count` schema declarations BEFORE write paths stamp them. See [docs/v1.3.0-observability/schema-surface.md](../../docs/v1.3.0-observability/schema-surface.md) §6.1.
- 2026-06-17: envelope schema is **strict** (`additionalProperties: false`), not permissive. v1.3.0-m0 Task 4 closes the hand `validate()` ↔ exported `JSON_SCHEMA` gap so both validators reject unknown top-level keys. Schema bumps require a new `envelope-schema-v2.md` file.
