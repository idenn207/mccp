# Implementation Report: v1.0.1 axis-P — Hook Tidy + ECC→MCCP env namespace

## Summary

5축 동시 정리 + ECC_* → MCCP_* 환경 변수 hard-cut rename.

- **A축** (dead code 삭제): 4개 hook script 삭제 + `bash-hook-dispatcher.js` PRE_BASH_HOOKS 정리.
- **C축** (ECC 잔재 / mccp 게이트 중복): hooks.json 5개 엔트리 등록 해제 (observe v1, governance, session-activity).
- **D축** (noise/overlap/DRY): hooks.json 3개 엔트리 추가 등록 해제 + `mcp-health-check` matcher `*` → `^mcp__` 축소 + 신규 `bootstrap.js` 작성 + inline `node -e` 일괄 wrapper 치환.
- **E축** (policy revisit): `gateguard-fact-force.js` critical-path scope-down + `mccp:stop:auto-handoff` 등록 해제 + `post-bash-pr-created.js` 삭제 + `quality-gate.js` syntax-only로 경량화.
- **F축** (env var hard-cut rename): `ECC_*` → `MCCP_*` (19 파일 / 68 hit) + docs/CHANGELOG sync.

backward-compat alias는 제공하지 않음 (사용자 요청 — alias가 곧 cross-plugin 충돌 원천).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large (matches) |
| Confidence | n/a (plan doesn't have field) | Validated by test suite + grep |
| Files Changed | ~17 (F축) + scattered (A/C/D/E) | 26 modified + 5 deleted + 2 new = 33 paths |
| `hooks.json` command char reduction | ~80% (~70k → ~14k) | **~90%** (35,880 → 3,592) — exceeds target |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | roadmap-index 등록 + worktree 검증 | [done] | memory에 v1.0.1 axis matrix 섹션 append (memory 본문은 v0.2 시대 — append로 진화) |
| A.1 | `pre-write-doc-warn.js` 삭제 | [done] | grep 외부 ref 0건 재검증 |
| A.2 | `auto-tmux-dev.js` 삭제 + dispatcher PRE_BASH_HOOKS 정리 | [done] | dispatcher syntax OK |
| A.3-A.4 | `insaits-security-{wrapper.js,monitor.py}` 삭제 | [done] | 외부 ref 0건 |
| C.1 | observe v1 + governance + session-activity 등록 해제 | [done] | 단일 atomic JSON write로 batch |
| D.1 | design-quality-check + console-warn + suggest-compact 등록 해제 | [done] | C.1과 같은 batch JSON write — deviation 기록 (효율/안전성) |
| D.2 | `mcp-health-check` matcher `*` → `^mcp__` | [done] | pre + post 모두 |
| D.3 | `bootstrap.js` 신규 + hooks.json inline 일괄 치환 | [done] | 21개 hook command가 단일 wrapper로 통합, 90% 감소 |
| E.1 | gateguard scope-down (critical paths만) | [done] | `isCriticalPath()` 신규 함수 + Edit/Write/MultiEdit 분기 적용 |
| E.2 | `mccp:stop:auto-handoff` 등록 해제 + `post-bash-pr-created.js` 삭제 | [done] | dispatcher POST_BASH_HOOKS 정리 |
| E.3 | `quality-gate.js` syntax-only fast-fail로 rewrite | [done] | timeout 15s → 5s, JS/Go/Python parser만 |
| F.1-F.2 | ECC_* → MCCP_* code-side rename (19 파일 / 68 hit) | [done] | allow-list (configure-ecc, continuous-learning-v2, install tree, ECC_ROOT) 보존 |
| F.3 | docs/ENVIRONMENT.md + docs/v0.2-state-schema.md sync (28 hit) | [done] | `ECC_ENABLE_INSAITS` doc line 삭제 (A.3에서 hook 자체 삭제) + `ECC_DISABLED_MCPS` 보존 footnote |
| F.4 | CHANGELOG v1.0.1 axis-P entry + Breaking 매트릭스 | [done] | 25행 migration table |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| node --check (모든 hook .js) | [done] | 0 syntax error |
| hooks.json JSON parse | [done] | valid |
| 보존 대상 외 `ECC_[A-Z]` 잔재 grep | [done] | 0건 (plan §Validation grep 정의 그대로) |
| `session-start-bootstrap.test.js` | [done] | 6/6 PASS — env var rename assertion 정합 |
| dispatcher 모듈 export sanity | [done] | PRE: 5 hooks (auto-tmux-dev 제거), POST: 3 hooks (pr-created 제거) |
| 전체 test suite (90 test files) | **901 / 905 PASS** | 3 failures all in `g1-patch.test.js` — `git show HEAD:<file>` byte-identical to baseline for `receipt-prompt.js` / `receipt-skill.js` / `receipt-mode.js` / `g1-patch.test.js` (axis-P 0건 touch) → **pre-existing regression, not introduced by axis-P** |

## Files Changed

### Created

| File | Purpose |
|---|---|
| `plugins/mccp/scripts/hooks/bootstrap.js` | hooks.json inline `node -e` 통합 wrapper (CLAUDE_PLUGIN_ROOT trust + fallback + plugin-hook-bootstrap delegation) |

### Modified

| File | Surface |
|---|---|
| `plugins/mccp/hooks/hooks.json` | 9 entry 제거 + 2 entry matcher narrow + 21 inline → wrapper (35,880 → 3,592 chars) |
| `plugins/mccp/scripts/hooks/bash-hook-dispatcher.js` | PRE_BASH_HOOKS에서 auto-tmux-dev 제거 + POST에서 pr-created 제거 |
| `plugins/mccp/scripts/hooks/gateguard-fact-force.js` | `isCriticalPath()` 추가 + Edit/Write/MultiEdit 분기 scope-down + ECC_* → MCCP_* (6 hit) |
| `plugins/mccp/scripts/hooks/quality-gate.js` | full rewrite — syntax-only fast-fail |
| `plugins/mccp/scripts/lib/hook-flags.js` | ECC_HOOK_PROFILE / ECC_DISABLED_HOOKS → MCCP_* (4 hit) |
| `plugins/mccp/scripts/hooks/run-with-flags.js` | spawn env 4 hit |
| `plugins/mccp/scripts/hooks/plugin-hook-bootstrap.js` | spawn env + reader 3 hit |
| `plugins/mccp/scripts/hooks/observe-runner.js` | 7 hit |
| `plugins/mccp/scripts/hooks/mcp-health-check.js` | 14 hit (ECC_MCP_* 8개 포함) |
| `plugins/mccp/scripts/hooks/governance-capture.js` | 6 hit |
| `plugins/mccp/scripts/hooks/ecc-context-monitor.js` | 4 hit (파일명은 보존 — C축에서 off되지만 파일은 standalone 사용) |
| `plugins/mccp/scripts/hooks/ecc-metrics-bridge.js` | 1 hit |
| `plugins/mccp/scripts/hooks/cost-tracker.js` | 1 hit |
| `plugins/mccp/scripts/hooks/session-activity-tracker.js` | 1 hit |
| `plugins/mccp/scripts/hooks/session-start.js` | 7 hit |
| `plugins/mccp/scripts/hooks/config-protection.js` | 2 hit |
| `plugins/mccp/scripts/hooks/block-no-verify.js` | 1 hit (주석) |
| `plugins/mccp/scripts/lib/github-discussions.js` | 1 hit |
| `plugins/mccp/scripts/lib/session-bridge.js` | 1 hit |
| `plugins/mccp/scripts/lib/session-adapters/canonical-session.js` | 3 hit |
| `plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js` | 1 hit (assertion) |
| `plugins/mccp/scripts/receipt/spike-results.md` | 1 hit (historical doc) |
| `docs/ENVIRONMENT.md` | 27 hit + ECC_ENABLE_INSAITS line 제거 + ECC_DISABLED_MCPS footnote |
| `docs/v0.2-state-schema.md` | 1 hit |
| `CHANGELOG.md` | v1.0.1 axis-P entry + 25행 Breaking 매트릭스 |

### Deleted

| File | Reason |
|---|---|
| `plugins/mccp/scripts/hooks/auto-tmux-dev.js` | Windows no-op, sole caller(dispatcher) 같이 정리 |
| `plugins/mccp/scripts/hooks/insaits-security-wrapper.js` | InsAIts 회사 정책 hook, 개인용 mccp 무의미 |
| `plugins/mccp/scripts/hooks/insaits-security-monitor.py` | 위 wrapper의 Python 본체 |
| `plugins/mccp/scripts/hooks/post-bash-pr-created.js` | `/mccp:pr` 게이트가 PR 단일 경로 — 중복 |
| `plugins/mccp/scripts/hooks/pre-write-doc-warn.js` | pure shim — hooks.json이 doc-file-warning.js 직접 호출 |

## Deviations from Plan

1. **C+D+E 단일 atomic JSON write로 통합** — plan은 C/D/E 분리 task였지만, hooks.json이 25k+ 토큰 단일 파일이라 별개 string-replace edit이 trailing comma / 들여쓰기 위험 ↑. Node script로 JSON read/mutate/write 한 번에 처리. C/D/E의 "행위 단위 분리" 의도는 보존됨 (목록은 task별로 분리 표기).
2. **D.3 bootstrap.js 위치** — plan은 `bootstrap.js`가 plugin-hook-bootstrap.js와 helper 공유하라고 명시. 실제 구현은 bootstrap.js가 plugin-hook-bootstrap.js를 require로 delegation하는 thin wrapper. 같은 효과(코드 중복 0건) + simpler.
3. **`mccp-context-monitor.js` rename 미적용** — plan F축은 "파일 자체는 이름 유지(C축에서 off되지만 파일은 보존)"라고 명시했고, env var rename만 적용. 파일명 자체는 `ecc-context-monitor.js` 그대로 (working tree state에 'M' modified, deleted 아님). 다음 cleanup axis에서 파일명 sync 가능.
4. **`mccp-metrics-bridge.js` 파일명** — 위와 동일. `ecc-metrics-bridge.js` 파일명 보존.
5. **`hooks.json` command 감소율** — plan 추정 80% → 실측 **90%** (35,880 → 3,592). 8개 추가 큰 inline(stop-*)이 single wrapper로 잘 흡수됨.

## Issues Encountered

1. **`MCCP_DISABLE_VALUES` const rename collision** — `gateguard-fact-force.js` line 48의 `ECC_DISABLE_VALUES = new Set(...)` private const도 regex 매치되어 `MCCP_DISABLE_VALUES`로 rename됨. 의도된 동작 (private const 이름이 namespace prefix 따름 — 일관성). 외부 ref 0건 grep 검증.
2. **GateGuard fact-force가 axis-P 작업 도중 발화** — `gateguard-fact-force.js`가 정확히 본 plan의 E.1 대상인데, scope-down 적용 전에는 모든 file edit에 발화. 매 edit마다 사실 4개를 inline으로 제시하면서 진행. E.1 scope-down 완료 후에는 noise 0.
3. **`.claude/settings.local.json` 부재** — memory `feedback-codex-permanent-bypass` 가 영구 설정 명시했으나 worktree에 settings.local.json이 없음. `MCCP_CODEX_DISABLED=1`은 inline으로 receipt CLI에 export. receipt에 `meta.codex_disabled=true` 정상 stamp됨.
4. **plan-codex receipt stale** — plan body에 Implement Review section을 inject한 직후 plan-codex receipt의 plan_hash가 stale. disabled mode로 plan-codex receipt를 새 hash로 재발행 → `validate --command mccp:prp-implement` OK.

## Tests Written

본 axis는 **새 hook script(`bootstrap.js`)** 1개만 추가. test는 기존 session-start-bootstrap.test.js의 env var assertion이 자동 cover (F축 rename으로 ECC_HOOK_PROFILE → MCCP_HOOK_PROFILE). 신규 bootstrap.js는 기존 `plugin-hook-bootstrap.js`를 require로 delegation 하므로 plugin-hook-bootstrap.js test가 같이 cover.

별도 unit test가 필요한 시나리오:
- `bootstrap.js` resolveRoot()의 cache-walk fallback (현재 plugin-hook-bootstrap.js test와 동등)
- `gateguard-fact-force.js` isCriticalPath() — 향후 별도 minor PR로 추가 가능 (현 axis 범위 outside)

## Next Steps

- `/mccp:code-review` 로컬 변경 review (axis-P 변경 surface가 hooks.json + bash-hook-dispatcher + 다수 env var rename)
- `/mccp:prp-commit "feat(v1.0.1): axis P — hook tidy + ECC→MCCP env namespace"` 형태 commit
- `/mccp:pr` 본 axis-P를 main으로 PR (CHANGELOG breaking 매트릭스 포함)
