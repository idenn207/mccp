# Implementation Report: design-grounding (advisory → mechanical)

## Summary

impeccable 디자인 방향을 produced diff에 **mechanical하게** 강제하는 3-step
게이트(방향 캡처 → EXECUTE 소비 → LLM-free grounding lint)를 `/mccp:prp-implement`에
추가했다. critique loop(Phase 2.5.5b)은 EXECUTE *이전*에 plan/방향만 보고 produced
diff는 절대 보지 못하는 구조적 gap이 있었고, "신규 LLM 호출 0" 제약상 critique을
post-EXECUTE 재실행할 수 없었다. 신규 순수 lib `design-grounding.js` + 신규 Phase 3.6
게이트가 그 gap을 결정적으로 닫는다. critique의 divergent-block(§3.9)은 그대로 두고
그 위에 **별도 locus**(produced-diff H15 anchor)의 mechanical 게이트를 얹었다.

plugin.json `1.18.20 → 1.18.21` (patch — 단일 axis, §3.7).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (예측대로) |
| Files Changed | 11 (plan Files to Change) | 13 변경 + 3 신규 (test 2 + lib 1) |
| 신규 LLM 호출 | 0 (설계상) | 0 (capture=I/O, verify=순수함수) |
| Codex Implement-R1 | — | needs-attention, 4 findings 전부 흡수 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | output-constraints.js `runRules` 추출 + GROUNDING 서브셋 | [done] Complete | `GROUNDING_RULE_IDS=['H15']` (F1: H17 제외). behavior-preserving. |
| 2 | design-grounding.js 신규 순수 lib | [done] Complete | capture/read/extract/subtract/lint/decide/parseMode. LLM-free. |
| 3 | prp-implement.md capture(2.5.5c) + consume(Phase 3) wiring | [done] Complete | git-path artifact(F1) + `--design-grounding-captured` forward. |
| 4 | prp-implement.md Phase 3.6 VERIFY 게이트 | [done] Complete | baseline+tracked+untracked(F2), lint+decide, enforce block→fix-task+retry, pass→restamp. |
| 5 | receipt schema/write/cli + restamp helper | [done] Complete | 2-field present-only + `restampGroundingVerdict`(F3) + `restamp-grounding` verb. |
| 6 | SKILL.md anchor + version/footer/CHANGELOG | [done] Complete | plugin.json 1.18.21 + 양 footer + i18n test 단언 동기화. |

## Codex Implement-R1 Findings (4, all ACCEPT_NOW)

| F | Sev | Absorption |
|---|---|---|
| F1 | HIGH | H17 added-line 버킷에서 enforce 불가 → `GROUNDING_RULE_IDS=['H15']`(line-local-safe). H17은 renderer full-HTML lint 소유. |
| F2 | HIGH | worktree dirty → capture 시 pre-EXECUTE rendered 버킷 스냅샷 + verify per-bucket line-set 차감. |
| F3 | MED | write.js fresh-skeleton overwrite 확인 → `restampGroundingVerdict` field-preserving helper(verdict만 mutate, 양 hash 재계산). |
| F4 | MED | readDirection null fail-open → `decideGrounding({readFailed})`가 enforce에서 `inconclusive` block + atomic write. |

추가 흡수(Codex 미지적): bare `.md` rendered 포함이 command-doc(`####`)에 H15 오발화 →
rendered md는 `.claude/cache/*.md`만 scope (plan Risk "오발화 회피" 정합 refinement).

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | [done] Pass | `node -c` 5개 편집 lib OK, plugin.json valid |
| Unit Tests (신규) | [done] Pass | design-grounding 25/25 · design-grounding-fields 9/9 · output-constraints 86/86 · critique-decide 9/9 |
| Renderer suite | [done] Pass | 642/642 (footer 회귀 clean) |
| Receipt suite | [done] Pass | 406/407 (1 pre-existing Windows symlink skip) |
| lib/tests suite | [warn] 664/668 (1 fail, 3 skip) | **1 fail = pre-existing, 내 변경 무관** — `design-critique-loop-e2e.test.js:206 "F) fixture file exists in .claude/cache/"`. `.claude/cache/`는 gitignored(.gitignore:69) + 해당 fixture(`test-fixture-status.html`)는 branch/origin-main/base(1978a25) 어디에도 git-tracked 안 됨 → 모든 fresh worktree에서 사전 실패. v1.3.0-m2 design-critique fixture로 design-grounding과 별개 mechanism. |
| Build | [done] N/A | Node 프로젝트, build 없음 |
| Self-apply dogfood | [done] Pass | 실제 produced diff(17파일) → 렌더표면 0 → `anchor_clean` no-op (command-doc `####` H15 오발화 0 확인) |

### Design Grounding (this cycle)

| Field | Value |
|---|---|
| Verdict | `anchor_clean` (receipt restamped) |
| Mode | enforce (default) |
| Rendered delta | no — control-plane-only(.js/.md command-doc/.json) |
| Advisories | "no rendered-surface added lines in EXECUTE delta (gate no-op)" |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `scripts/lib/design-grounding.js` | CREATED | 신규 순수 lib (~270 LOC) |
| `scripts/lib/tests/design-grounding.test.js` | CREATED | 25 test |
| `scripts/receipt/tests/design-grounding-fields.test.js` | CREATED | 9 test (restamp F3 핵심) |
| `scripts/lib/renderer/output-constraints.js` | UPDATED | runRules 추출 + GROUNDING export |
| `scripts/lib/renderer/tests/output-constraints.test.js` | UPDATED | 동등성/subset 단언 3 |
| `scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | footer 단언 1.18.21 |
| `scripts/receipt/{schema,write,cli}.js` | UPDATED | grounding 2-field + restamp + verb |
| `commands/prp-implement.md` | UPDATED | 2.5.5c capture + Phase3 consume + Phase 3.6 + REPORT surface |
| `skills/frontend-design-direction/SKILL.md` | UPDATED | produced-diff H15 grounding 명문화 |
| `scripts/lib/renderer/{html,markdown}.js` | UPDATED | footer v1.18.21 |
| `.claude-plugin/plugin.json` | UPDATED | 1.18.20 → 1.18.21 |
| `CHANGELOG.md` | UPDATED | [1.18.21] row + note bump |

## Deviations from Plan

1. **`GROUNDING_RULE_IDS = ['H15']`** (plan draft: `['H15','H17']`) — Codex Implement-R1
   F1 absorption. H17은 added-line 버킷에서 DOM-aware enforce 불가 → blocking 서브셋
   에서 제외, renderer full-HTML lint이 계속 소유.
2. **rendered md scope = `.claude/cache/*.md`만** (plan draft regex: bare `.md`) — bare
   `.md`는 command-doc/plan/CHANGELOG의 `####`에 H15 오발화. plan Risk "임의 비-디자인
   diff 오발화 회피"와 정합한 refinement.
3. **plan을 `completed/`로 archive하지 않음** (command 일반 Phase 5는 archive 지시) —
   receipt chain(plan_hash 경로)이 plan을 참조하므로 이동 시 downstream pr 게이트
   validate가 깨진다. mccp 관행(plan은 PR 산출물로 commit, merge 후 fold)과 정합.
4. **cross-gate dedupe 미적용** — origin/main stale로 `diff ⊆ Files to Change` mechanical
   guard 충족 불가 → fail-closed로 실제 Implement-Codex review 수행(결과적으로 4 findings
   포착 — 옳은 선택).

## Issues Encountered

- **plan-codex receipt stale** — implement 게이트가 plan에 `## Codex Implementation
  Review` 섹션을 추가하면서 plan 구조 해시 변경 → plan-codex receipt stale. 결정 내용은
  불변(additive audit 섹션)이므로 §3.1 sanctioned 경로로 plan-codex receipt를 design
  필드 보존하며 refresh. 구조적 재발 부채(implement 게이트가 plan을 mutate하는 한 발생).

## Next Steps

- [ ] `/mccp:code-review` 또는 `/mccp:pr` (PR 게이트 — critique chain-check + PR-Codex)
- [ ] PR merge 후 worktree cleanup (§3.8) + STATE.md roll
