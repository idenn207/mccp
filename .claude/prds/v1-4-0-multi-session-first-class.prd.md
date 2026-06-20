# v1.4.0 Multi-Session First-Class Support

> Co-created with skypark207 on 2026-06-19. Status: **DRAFT** — requirements only. Implementation planning pending via `/mccp:plan`.
>
> **Related PRDs** (cycle context — see §"Relation to prior PRDs"):
>
> - [.claude/prds/v0-4-0-orchestrator.prd.md](v0-4-0-orchestrator.prd.md) (2026-06-11) — earlier framing. v1.2.0 dispatch-controller M1이 그 PRD의 IPC axis 일부를 흡수했지만 STATE.md continuity primitive 자체는 미해결.
> - [.claude/prds/v1-4-0-automation-modernization.prd.md](v1-4-0-automation-modernization.prd.md) (2026-06-18) — 같은 v1.4.0 working label이지만 orthogonal axis. 본 PRD는 *coordination* axis, 그쪽은 *content* axis.

## Problem

mccp의 세션 연속성 모델(STATE.md)은 단일 활성 세션 가정으로 설계됐다. 실제 운영은 2~5개 worktree에서 Claude 세션이 동시에 돌아가는 multi-session 패턴 — weekly token quota를 단일 세션으로 소화 못 하기 때문에 multi-session이 quota 활용의 핵심 메커니즘. git-tracked STATE.md가 worktree별로 갈라지지만 PR merge가 last-write-wins로 main의 STATE.md를 덮어쓰면서 다른 worktree의 작업 컨텍스트가 손실된다. 추가로 새 worktree에서 Claude 세션을 시작하면 다른 활성 worktree의 작업이 보이지 않아, 매 세션 진입마다 Claude가 STATE.md ↔ 실제 코드 상태를 대조해 사용자에게 "어떤 작업을 진행하시겠어요?" 라고 묻는 manual reconciliation friction이 발생한다.

해결하지 않으면: STATE.md가 신뢰 가능한 source가 아니게 되어 세션 진입 비용이 매번 발생. 결국 STATE.md를 무시하고 git log / receipts / fix-task만 보게 되는 — 즉 본래 STATE.md 도입 의도(세션 간 컨텍스트 보존)가 무너지는 — 상황으로 귀결.

## Evidence

- **PR#38 vs PR#39 incident (2026-06-18)**: PR#39 (v1.3.0-m4 observability surface II — refresh trigger + privacy guard)가 worktree A에서 진행 중인 동안 worktree B에서 PR#38 (명칭상 v1.4.1, 실제로는 v1.3.0 hotfix)가 먼저 완료. STATE.md가 한쪽 worktree만 반영해 PR#38을 main에 반영하는 결정이 지연됨. 부수 증상: PR#38이 정확한 버전 매핑 부재로 인해 *"명칭만 v1.4.1, 실제로는 v1.3.0 hotfix"* 라는 임시 회피 명명을 채택 — 본 PRD가 직접 해결하는 문제는 아니지만 같은 STATE drift의 부산물.
- **세션 진입 reconciliation friction (관찰)**: 매 세션 진입 시 Claude가 STATE.md와 실제 git 상태(branch HEAD, receipt chain, fix-task)를 대조해 사용자에게 "STATE.md와 진행사항이 다른데 어떤 걸 진행할까요?" 라고 묻는 패턴이 일상적. 이는 multi-session 환경의 자연스러운 결과 — 다른 worktree에서 STATE.md를 갱신/merge한 흔적이 잡힘.
- **운영 패턴 정착**: v1.3.0 진행 도중 발견된 개선 사항(v1.3.0 hotfix 등)을 즉각 처리하는 흐름이 일상화. multi-session은 가설이 아니라 현재 운영의 default.

## Users

- **Primary**: skypark207 (mccp 단독 운영자). Pro 구독 + Windows 11 + 2~5 worktree 병렬 작업 환경. weekly token quota를 단일 세션으로 소화 못 함 → multi-session이 quota 활용의 핵심 메커니즘.
- **Not for**:
  - 단일 세션 운영자 — STATE.md는 현재 모델 그대로도 충분
  - CI 환경의 mccp — multi-session 운영은 인간 운영자 전제. CI는 단일 ephemeral 세션
  - 일반화된 mccp adopter — Primary 외 운영 패턴이 확인되지 않은 상태에서 generalization 시도 안 함. Primary가 검증 후 일반화 여부 재평가.

## Hypothesis

We believe **각 Claude 세션이 자기 작업 컨텍스트를 잃지 않고 다른 worktree의 활성 세션을 발견할 수 있는 메커니즘** will solve **multi-worktree 병렬 작업 시 PR merge로 인한 last-write-wins 컨텍스트 손실 + 세션 진입 reconciliation friction** for **skypark207 1인 운영자**.

구현 수단은 PRD가 결정하지 않는다 — 기존 STATE.md를 분리하든, 다른 primitive로 대체하든, 하이브리드로 가든 `/mccp:plan` 단계의 architectural decision. **관성으로 STATE.md 유지를 가정하지 않음** (user directive: "관성처럼 기존 코드를 유지해야 된다고 생각하진 말아줘. 전면 수정도 고려해야돼.").

We'll know we're right when **M1+M2 metric 충족**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| **M1 — continuity** | 한 worktree의 PR merge가 다른 worktree의 작업 컨텍스트를 0건 손실 | dogfood: 2개 이상 worktree 병렬 cycle 1회 후 PR#38↔#39 패턴 재발 여부 정성 평가 (Primary 운영자의 incident log) |
| **M2 — discovery** | 새 worktree에서 Claude 세션 시작 후 첫 5턴 동안 Claude의 "어느 작업을 진행할까요" 류 manual reconciliation 질문 0회 | session transcript 정성 grep + Primary 운영자의 정성 평가 |
| **M3** | 한 cycle 내 2~5 worktree 병렬 작업의 reconciliation friction 0회 | γ(full) milestone — **2026-06-20 promoted to active cycle**(M1+M2 ship 직후 사용자 결정). measurement + polish + dogfood 단위. |

> M3는 hypothesis의 stretch target — MVP β는 M1+M2까지. **2026-06-20 update**: M1(#43) + M2(#46) ship 직후 사용자가 별도 PRD를 만들지 않고 본 PRD의 마지막 milestone(M3)을 정식 cycle로 승격. polish(self/other 구분 + stale backlog 정리) + measurement primitive + 2-worktree dogfood로 한 PR 단위 ship 예정.

## Scope

**MVP** — **β (medium)**: per-session continuity primitive + cross-session discovery via SessionStart hook.

M1+M2 metric 검증 가능한 최소 단위. 구현 메커니즘은 `/mccp:plan` 단계에서 4개 Open Questions 답에 따라 결정.

**Out of scope** (이번 cycle 한정 — 사용자가 `skip`으로 PRD 작성자 판단 위임. `Assumption — needs validation via dogfood` 마커 적용)

- **Inter-process IPC** (Claude 세션끼리 직접 메시지) — v1.2.0 dispatch-controller는 single-session 내부 fanout이라 의미가 다름. 본 PRD는 file-system + git + hook 기반 indirect coordination만 다룸.
- **자동 conflict resolution** (두 worktree가 같은 receipt slug에 동시 쓰면 자동 merge) — 충돌 *detection*은 MVP 범위, *resolution*은 사용자 수동 결정으로 남김.
- **PR번호 ↔ 버전명 매핑 자동화** (PR#38 명칭 혼선의 근원) — 별도 이슈. 본 PRD evidence이지만 해결책은 아님.
- **γ(full) 실시간 status board (deferred to post-M3 follow-up)** — STATUS.md "Active Sessions" 섹션(v1.4.0-m2 ship)이 정적 표면이고 M3는 self/other 구분 polish + measurement까지만. 실시간 push surface(websocket/polling daemon, dashboard live update)는 본 PRD 후속 또는 별도 v1.5.x cycle.
- **단일 세션 운영자를 위한 backward-compat layer** — Primary 외 사용자 케이스를 일반화하지 않음. 추후 일반화 시 별도 PRD.

## Delivery Milestones

<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | M1 — continuity primitive | 한 worktree의 PR merge가 다른 worktree의 작업 컨텍스트를 손실시키지 않는다 (storage + write semantics 신설 또는 STATE.md 대체) | complete | `.claude/plans/v1-4-0-multi-session-m1-continuity-primitive.plan.md` (PR #43, squash c071a54) |
| 2 | M2 — cross-session discovery | 새 worktree의 SessionStart hook이 다른 활성 세션을 자동으로 표면화한다 (registry + injection 경로) | in-progress | `.claude/plans/v1-4-0-multi-session-m2-discovery.plan.md` |
| 3 | M3 — friction 0 | 2~5 worktree 병렬 cycle을 reconciliation 질문 없이 완주 | in-progress | `.claude/plans/v1-4-0-multi-session-m3-friction-zero.plan.md` |

## Open Questions

- [ ] **Q-mechanism**: STATE.md 유지(분리) vs 새 primitive 대체 vs 하이브리드 — `/mccp:plan` 단계의 핵심 architectural decision. **사용자 directive**: "관성처럼 기존 코드를 유지하지 말 것". v1.3.0 derive engine + STATUS.md renderer + briefing stamp가 STATE.md를 source로 사용 중이므로 대체 시 adapter 또는 full migration 필요.
- [ ] **Q-storage-trigger**: 하이브리드 storage에서 `<repo>/.claude` opt-in trigger는 무엇인가? (env var? `.claude/settings.json` flag? CLI flag?) 마이그레이션 경로? — **사용자 결정**: 하이브리드 + `~/.claude` default + `<repo>/.claude` opt-in. trigger 정의는 plan으로 이월.
- [ ] **Q-session-vs-work**: Claude `session_id` (per-session UUID)와 logical work_id의 분리가 필요한가? compaction/auto-handoff 가로질러 같은 작업이 이어질 때 어떻게 chain? — **사용자 결정**: session_id = Claude UUID. logical work_id 분리 필요 여부는 plan에서 결정.
- [ ] **Q-envelope-reuse**: v1.2.0 envelope schema 재사용 범위 — schema bump해서 inter-session도 흡수 vs 새 schema로 분리? — **사용자 결정**: envelope schema 재사용 + 새 session 레이어. 구체적 schema bump 패턴은 plan에서 결정.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| STATE.md 전면 교체 시 v1.3.0 derive engine + STATUS.md renderer + briefing stamp가 새 source 모델로 재배선 필요 | High | Medium | M1에서 derive engine adapter만 추가, full migration은 M2 또는 v1.5.0으로 분리 |
| `~/.claude` 글로벌 storage가 cross-repo contamination (다른 repo도 같은 storage에 쓰면) | Medium | High | repo-hash로 namespace 분리 + cross-repo discovery는 사용자 명시적 opt-in 시에만 활성화 |
| Hybrid storage의 opt-in trigger 불명확 → 사용자가 어디 저장됐는지 추적 못함 | Medium | Medium | `/mccp:work` 진입 시 storage source를 명시적으로 표면화 (stderr banner) |
| Multi-session 진정한 IPC 미지원 → 두 worktree가 동시에 같은 receipt slug에 쓰면 race | Low | Medium | git-tracked receipt 파일은 mtime + ownership_token_hash 비교로 detection. 자동 resolution은 out of scope, 사용자 표면화만 |
| v0.4.0 orchestrator PRD와의 scope 중복 | Medium | Low | 본 PRD §"Relation to prior PRDs" 명시. v0.4.0 PRD는 historical reference로 보존. 충돌 시 본 PRD가 가장 최신 framing |

## Relation to prior PRDs

본 PRD는 동일 cycle 또는 인접 cycle의 다른 PRD들과 명시적 관계를 가짐:

- **[.claude/prds/v0-4-0-orchestrator.prd.md](v0-4-0-orchestrator.prd.md)** (2026-06-11): 5-worktree multi-session orchestrator 첫 framing. cost-stop 자동화, Windows headless spawn, 공유 decision ledger 등 7개 axis 포함. 그 PRD의 일부 axis(IPC primitive)는 v1.2.0 dispatch-controller M1으로 흡수됐지만, **STATE.md continuity 자체는 미해결**. 본 PRD는 그 미해결 axis만 좁게 다룸 — *cost-stop 자동화 / Pro-tier metric pivot은 본 PRD에서 다루지 않음*. 본 PRD가 ship되면 v0.4.0 orchestrator PRD의 STATE.md 관련 axis는 closed로 마킹 권장 (roadmap audit).
- **[.claude/prds/v1-4-0-automation-modernization.prd.md](v1-4-0-automation-modernization.prd.md)** (2026-06-18): 같은 v1.4.0 working label이지만 *content* axis (Claude Code native deep-research/ultracode/goal 통합). 본 PRD는 *coordination* axis. 같은 cycle에서 병렬 진행 가능하며 plugin.json bump는 ship 순서에 따라 조정 (둘 다 v1.4.0 / v1.4.1 / v1.5.0 후보).

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-06-19.*
