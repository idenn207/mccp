# PR Review: #39 — feat(v1.3.0-m4): observability surface II — refresh trigger + privacy guard

**Reviewed**: 2026-06-19
**Author**: 박동민 (@idenn207)
**Branch**: v1-3-0-observability-m4-refresh-guard → main
**Decision**: APPROVE with comments

## Summary

v1.3.0-m4 milestone surface가 PRD `docs/v1.3.0-observability/dashboard-surface.md §10` spec과 정확히 매핑됩니다. 4 trigger paths(SessionStart hook / receipt-write epilogue / envelope write / envelope-move watcher) + 5s content debounce + 90s host-aware tri-state render lock + 5종 secret 패턴 catalogue + verdict step 1.5 severe-only red banner + audit-timeline per-kind 통계 footnote + was_stale stamp가 모두 동작합니다. Loud fail-open invariant는 trigger.js 외부 try/catch + 모든 caller belt-and-suspenders로 belt-and-suspenders 이중 보호. Privacy F2/F3 absorption은 envelope source-scan-time scan + raw payload non-storage + `applySecretMask` unconditional 실행으로 enforce됩니다.

Cross-gate dedupe: mccp-pr-codex receipt converged round 1 0 findings(meta.codex_design_scope_excluded=true). PR body의 `### Security Reviewer` 섹션은 secret 패턴 ReDoS 안전(`{20,}`/`{16}`/`{8,}` 길이 제약), atomic fs(`fs.openSync wx 0o600` + unique `<target>.<pid>-<random>.tmp` names), host-aware tri-state reclaim(same-host live PID NEVER reclaim), external dep 0(built-in Node만)을 확인 후 APPROVE.

Local-review의 H1(`dispatch-envelope.js:250` + `dispatch-watcher.js:122` repoRoot 미전달)은 PR body의 "Known Follow-up Axes"에 explicit acknowledge + security-reviewer가 privacy/isolation concern(non-security)으로 격하 + .gitignore `.claude/cache/` commit 보호 + 1-line × 2 mechanical fix가 보장됩니다. 이번 PR의 surface freeze 의도와 분리해 follow-up patch PR로 처리하는 것이 옳습니다.

## Findings

### CRITICAL

None.

### HIGH

None (local-review의 H1은 cross-gate dedupe 후 MEDIUM으로 격하 — 아래 참조).

### MEDIUM

#### M1. `dispatch-envelope.write` + `dispatch-watcher.scan`의 `repoRoot` 명시 전달 누락 (Pattern Compliance)

**파일**: `plugins/mccp/scripts/lib/dispatch-envelope.js:250`, `plugins/mccp/scripts/lib/dispatch-watcher.js:122`

`receipt/write.js:340-342`는 `triggerRender('receipt-write', { repoRoot: built.repoRoot })`로 명시 전달하지만, envelope/watcher 양쪽은 opts 없이 호출 → `trigger.js:230-231`이 `process.cwd()` → `findRepoRoot` fallback(`.git` 16단계 상승 검색). multi-worktree dispatch(§3.8) 환경에서 worker cwd ≠ envelope.parent_cwd 시 잘못된 repo의 `.claude/cache/`에 STATUS.md 작성 위험.

**현재 PR에서 deferred 사유**:
- PR body "Known Follow-up Axes H1"에 explicit acknowledge + 1-line × 2 fix scope 명시
- security-reviewer(reused from PR body): "privilege escalation/credential leak/RCE 벡터 없음, `.gitignore`가 `.claude/cache/`를 보호하므로 commit 위험 없음"으로 non-security 격하
- M4 surface freeze 의도 — fix를 분리해 audit trail 명확화

**Fix 패턴**(follow-up PR용 참고):

```js
// dispatch-envelope.js#write — envelope.parent_cwd 이미 본문에 존재
require('./renderer/trigger').triggerRender('envelope-write', {
  repoRoot: envelope.parent_cwd,
});

// dispatch-watcher.js#scan — envelopeDir grandparent에서 도출
const repoRoot = path.resolve(envelopeDir, '..', '..', '..');
require('./renderer/trigger').triggerRender('envelope-move', { repoRoot });
```

#### M2. `render-trigger-session-start.js` hook 테스트 검증 path 불일치 (Completeness)

**파일**: `plugins/mccp/scripts/hooks/tests/render-trigger-session-start.test.js:36-51`

테스트가 `CLAUDE_PLUGIN_ROOT=<bogus>`를 env로 주입해 "missing renderer lib does not crash" 시나리오를 검증한다고 주장하지만, hook source(`render-trigger-session-start.js:24`)는 `require('../lib/renderer/trigger')`로 `__dirname` 기반 상대 require — `CLAUDE_PLUGIN_ROOT`는 require 해상도에 영향을 주지 않습니다. 코드 자체는 무해(try/catch로 보호) 이지만 테스트 의도와 실제 검증 path가 불일치.

**Fix 옵션**:
1. fixture로 hook 파일을 fakePlugin 디렉토리에 복사 + `process.execPath` cwd로 spawn해 실제 staged-install 시나리오 재현
2. 또는 테스트 코멘트를 `"hook never throws unhandled exception regardless of env"`로 격하해 의도/구현 align

#### M3. CLAUDE.md 한국어 오타 `짧추면` (Maintainability)

**파일**: `CLAUDE.md` (env 토글 섹션, `MCCP_RENDER_TRIGGER_DEBOUNCE_MS` 줄)

```
짧추면 burst trigger가 render thrash 위험, 길게 두면 STATUS.md가 늦게 따라옴.
```

`짧추면` → `줄이면` 또는 `짧게 잡으면`. 다른 env 토글 entry의 톤과 일관성 유지.

#### M4. plugin.json version bump 누락 검토 필요 (Completeness)

**파일**: `plugins/mccp/.claude-plugin/plugin.json`

현재 `version=1.4.0`이지만 origin/main 대비 변경 없음 — M3 PR #37이 이미 1.3.1 → 1.4.0 jump한 상태에서 M4가 동일 버전 위에 ship됩니다. CLAUDE.md §3.7 ("Minor — milestone ship") 기준 M4는 별도 milestone이므로 `1.4.0 → 1.5.0` bump 후보입니다. 다만 cycle 운영 정책(M3/M4를 같은 minor 안에 묶을 의도가 있었는지)은 author 판단 영역. follow-up hot-fix PR로 처리 가능(`chore(release): bump plugin.json to v1.5.0` 패턴).

### LOW

#### L1. `trigger.js:223` reason 인자 0-length fallback (Maintainability)

```js
reason = typeof reason === 'string' && reason.length > 0 ? reason : 'unknown';
```

4개 trigger path 모두 명시 reason을 넘기므로 실제 발현은 없으나 audit 추적성이 떨어집니다. 호출자 방어용으로는 충분.

#### L2. `_injectRenderThrow` test fault-injection이 production 함수에 잔존 (Maintainability)

`trigger.js:276-278`. underscore prefix가 internal contract 표시고 `trigger.test path c`가 커버하므로 일반적으로 fine. 향후 trigger.js를 외부 plugin에 노출할 때 제거 후보.

#### L3. `verdict.js:37` `source_id.slice(0, 16)` UUID 식별성 (Maintainability)

UUID v4의 첫 16자(`12345678-1234-12`)는 prefix 식별성이 낮습니다. telegraphic 길이 제약(impeccable F1 absorption)과의 trade-off로 의도된 선택 — 정보용 LOW.

## Cross-gate dedupe trace

| Gate | 상태 | 비고 |
|---|---|---|
| `mccp-pr-codex` (receipt) | round 1 converged, 0 findings | meta.codex_design_scope_excluded=true (v0.3.6 axis honor) |
| Security Reviewer (PR body reuse) | APPROVE with advisories | ReDoS 안전, atomic fs, host-aware tri-state, dep 0. H1 → non-security |
| Impeccable | skipped silent | design_signal=false (impeccable-detect helper) |
| Code Reviewer (이번 게이트) | APPROVE with comments | 0 CRITICAL/HIGH, 4 MEDIUM(follow-up axes), 3 LOW |

## Validation Results

| Check | Result |
|---|---|
| Type check | Skipped (no TS in project) |
| Lint | Skipped (no linter config in project) |
| Tests (M4 신규) | Pass — 27/27 (mask-secrets + envelopes-mask + trigger + verdict-banner + hook) |
| Tests (renderer + derive regression) | Pass — 111/111 |
| Tests (envelope + watcher + receipt regression) | Pass — 67/67 |
| Build | n/a (no build step) |

## Files Reviewed

### Added (7 — 신규 surface + 5 test files)
- `plugins/mccp/scripts/lib/renderer/trigger.js` — debounce + lock + render facade
- `plugins/mccp/scripts/hooks/render-trigger-session-start.js` — SessionStart hook
- `plugins/mccp/scripts/derive/tests/mask-secrets.test.js` (11 tests)
- `plugins/mccp/scripts/derive/tests/envelopes-mask.test.js` (1 test — F3 absorption)
- `plugins/mccp/scripts/lib/renderer/tests/trigger.test.js` (10 tests — paths a~i + isPidAlive)
- `plugins/mccp/scripts/lib/renderer/tests/verdict-secret-banner.test.js` (4 tests)
- `plugins/mccp/scripts/hooks/tests/render-trigger-session-start.test.js` (2 tests)

### Added (plan/report/review artifacts)
- `.claude/PRPs/plans/completed/v1-3-0-observability-m4-refresh-failure-privacy-guard.plan.md`
- `.claude/PRPs/reports/v1-3-0-observability-m4-refresh-failure-privacy-guard-report.md`
- `.claude/reviews/local-review-v1.3.0-m4.md`

### Modified (12)
- `plugins/mccp/scripts/derive/mask.js` — 5 secret 패턴 catalogue + `applySecretMask`/`applyPathMask` 분리
- `plugins/mccp/scripts/derive/sources/envelopes.js` — payload secret scan + `masked_payload_signal` 부가 필드
- `plugins/mccp/scripts/derive/index.js` — `applySecretMask` unconditional + `last_render_meta` surface
- `plugins/mccp/scripts/lib/renderer/verdict.js` — step 1.5 severe-only red banner
- `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` — mask 통계 + was_stale footnote
- `plugins/mccp/scripts/lib/dispatch-envelope.js` — envelope-write trigger (M1)
- `plugins/mccp/scripts/lib/dispatch-watcher.js` — envelope-move trigger (M1)
- `plugins/mccp/scripts/receipt/write.js` — receipt-write trigger
- `plugins/mccp/hooks/hooks.json` — SessionStart hook 등록
- `docs/v1.3.0-observability/dashboard-surface.md` — §10 M4 spec
- `CLAUDE.md` — v1.3.0-m4 row + env 토글 doc (M3 typo)
- `.claude/prds/v1-3-0-observability-surface-ii.prd.md` — milestone 4 → in-progress

## Decision Rationale

0 CRITICAL/HIGH(cross-gate dedupe 후), validation 100% green(205 tests pass), PR-Codex round 1 converged, security-reviewer 명시 APPROVE, impeccable design_signal=false silent skip — decision matrix상 **APPROVE**. 다만 M1(H1 follow-up)/M2(test path)/M3(typo)/M4(plugin.json bump) 4 MEDIUM은 comments로 surface해 다음 patch PR에 묶기 권장.

## Next Steps

1. **M1 follow-up patch PR** (권장 우선순위 1): `dispatch-envelope.js:250` + `dispatch-watcher.js:122`에 `repoRoot` 명시 전달. envelope.parent_cwd 직접 사용 + watcher grandparent 도출. 1-line × 2.
2. **M4 plugin.json bump** (검토): cycle 운영 정책 확인 후 1.4.0 → 1.5.0 또는 1.4.1. hot-fix PR 패턴.
3. **M3 CLAUDE.md typo**: 같은 follow-up PR에 묶기 가능.
4. **M2 test 의도 align**: 별도 axis 또는 follow-up PR scope에 묶기.
5. LOW 3건은 v1.4.x cycle backlog에 등록 후 우선순위 부여.
