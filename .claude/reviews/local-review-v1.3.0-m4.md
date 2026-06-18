# Local Review: v1.3.0-m4 Refresh Trigger + Privacy Guard

**Reviewed**: 2026-06-19
**Branch**: v1-3-0-observability-m4-refresh-guard (worktree)
**Mode**: Local Review Mode (advisory pre-commit)
**Decision**: REQUEST CHANGES (1 HIGH 발견, 머지 가능하나 commit 전 권고)

## Summary

M4 surface는 spec(`docs/v1.3.0-observability/dashboard-surface.md §10`)에 정확히 매핑됩니다 — 4 trigger paths, 5s debounce, 90s lock(host-aware tri-state), 5 secret 패턴 catalogue, verdict step 1.5 red banner, audit-timeline 통계 footnote, was_stale stamp 모두 동작합니다. 새 테스트 27/27 + 인접 회귀(envelope/watcher/receipt/derive/renderer) 165+ 통과. Loud fail-open invariant + privacy F2/F3 absorption은 mask-secrets path h/i + envelopes-mask F3 테스트가 실증합니다.

HIGH 발견 1건은 `dispatch-envelope.write` / `dispatch-watcher`가 trigger 호출 시 `repoRoot`를 명시 전달하지 않아 worker 프로세스의 cwd 기준으로 fallback한다는 점입니다 — 이번 worktree 내 테스트 실행이 실제 `.claude/cache/STATUS.md`를 덮어쓰는 부작용으로 재현됐습니다.

## Findings

### CRITICAL

None.

### HIGH

#### H1. `dispatch-envelope.write` + `dispatch-watcher`가 trigger에 `repoRoot` 전달 누락 → 잘못된 repo의 cache 덮어쓰기 가능

**파일**: `plugins/mccp/scripts/lib/dispatch-envelope.js:250`, `plugins/mccp/scripts/lib/dispatch-watcher.js:122`

```js
// dispatch-envelope.js:248-254
try {
  require('./renderer/trigger').triggerRender('envelope-write');
} catch (err) { ... }

// dispatch-watcher.js:120-126
try {
  require('./renderer/trigger').triggerRender('envelope-move');
} catch (err) { ... }
```

`triggerRender(reason)`이 opts 없이 호출되면 `trigger.js:230-231`이 `process.cwd()` → `findRepoRoot` fallback하여 16단계 위로 `.git`을 검색합니다. 실제 발현 경로:

1. dispatch worker가 controller cwd와 다른 디렉토리에서 spawn된 경우 → 잘못된 repo의 `.claude/cache/`에 STATUS.md 작성.
2. **이번 worktree에서 즉시 재현**: `dispatch-fullcycle-smoke.test.js` 실행 후 `.claude/cache/.trigger-dirty`에 `envelope-write` 10여 줄이 append되고 `STATUS.md` / `status.html` / `.last-render.json`이 02:11 갱신됨. 테스트 fixture는 `tmpdir`이지만 worker process cwd가 worktree root여서 fallback이 worktree의 `.claude/cache/`에 부산물을 만듦.

**Fix (권장)**:

`envelope.parent_cwd`는 envelope 본문에 이미 들어있으므로 명시 전달:

```js
// dispatch-envelope.js#write
try {
  require('./renderer/trigger').triggerRender('envelope-write', {
    repoRoot: envelope.parent_cwd,
  });
} catch (err) { ... }
```

watcher 쪽도 envelopeDir grandparent에서 도출:

```js
// dispatch-watcher.js#scan
try {
  const repoRoot = path.resolve(envelopeDir, '..', '..', '..');
  require('./renderer/trigger').triggerRender('envelope-move', { repoRoot });
} catch (err) { ... }
```

receipt-write 경로는 이미 `built.repoRoot`를 전달하므로 (write.js:340-342) 모범 사례입니다.

**부수 효과**: `.gitignore`가 `.claude/cache/`를 막아주므로 commit 위험은 없습니다. 그러나 (a) 테스트 격리 위반 — 다음 사용자가 `STATUS.md`를 열었을 때 테스트 stub 모델이 노출될 수 있고, (b) production worker 환경에서 controller repo와 worker cwd가 다른 multi-worktree 시나리오(§3.8)에서 fanout이 잘못된 dashboard를 그릴 위험이 있습니다.

### MEDIUM

#### M1. `render-trigger-session-start.js` hook 테스트가 `CLAUDE_PLUGIN_ROOT`를 검증하지 못함

**파일**: `plugins/mccp/scripts/hooks/tests/render-trigger-session-start.test.js:36-51`

테스트가 `CLAUDE_PLUGIN_ROOT=<bogus>`를 env로 주입하지만, hook source(`render-trigger-session-start.js:24`)는 `require('../lib/renderer/trigger')`로 `__dirname` 기반 상대 경로를 씁니다. 즉 `CLAUDE_PLUGIN_ROOT`는 require 해상도에 전혀 영향을 안 줍니다 — 테스트가 "missing renderer lib does not crash"를 주장하지만 실제로는 그 경로를 통과하지 않습니다.

**Fix**: 두 가지 옵션.
1. 테스트 의도가 *"staged install missing lib/renderer/"* 라면 fixtures를 만들어 hook 파일을 fakePlugin에 복사 + `process.execPath` cwd로 spawn해야 합니다.
2. 또는 코멘트를 정확히 수정: `"hook never throws unhandled exception regardless of env"` 로 격하.

(코드 자체는 무해 — try/catch 안에 있으므로 require가 실패해도 exit 0.)

#### M2. CLAUDE.md 한국어 오타 "짧추면"

**파일**: `CLAUDE.md` (env 토글 섹션, MCCP_RENDER_TRIGGER_DEBOUNCE_MS 줄)

```
짧추면 burst trigger가 render thrash 위험, 길게 두면 STATUS.md가 늦게 따라옴.
```

"짧추면" → "짧게 잡으면" 또는 "줄이면". 다른 entry들의 한국어 톤과 일관성 유지.

### LOW

#### L1. `trigger.js` reason 인자 0-length 처리 약화

**파일**: `plugins/mccp/scripts/lib/renderer/trigger.js:223`

```js
reason = typeof reason === 'string' && reason.length > 0 ? reason : 'unknown';
```

`reason='unknown'`이 들어가면 audit 추적 가치가 사라지는데, 4개 trigger path 모두 명시적 reason을 넘기므로 실제 발현은 거의 없습니다. 호출자 실수 방어용으로는 충분 — 정보용 LOW.

#### L2. `_injectRenderThrow` test hook이 production 코드에 남음

**파일**: `plugins/mccp/scripts/lib/renderer/trigger.js:276-278`

```js
if (opts._injectRenderThrow === true) {
  throw new Error('injected render throw');
}
```

테스트 fault-injection을 production 함수에 남기는 패턴 — 일반적으로 fine(`_` prefix가 internal contract 표시) 이지만, M4 같은 fail-open critical path에서는 test-only 분기 자체가 의도치 않은 호출 가능성을 만듭니다. 이미 trigger.test path c 가 커버하므로 향후 trigger.js를 외부 plugin에 노출할 때 제거 후보로 등록.

#### L3. `verdict.js:37` source_id slice(0, 16)이 UUID 식별성 깨뜨릴 수 있음

```js
const idSuffix = firstId ? ' · ' + String(firstId).slice(0, 16) + ' 확인' : '';
```

16자는 UUID 첫 8자 + `-` + 4자 + `-` + 첫 2자만 노출 → 식별 정밀도가 떨어집니다. envelope dispatch_id가 UUID v4면 첫 8자 prefix(`12345678`)가 보통 충분하지만, slice 길이를 (a) 8자(UUID prefix) 또는 (b) 36자 전체로 통일하는 게 일관성 있습니다. 단, impeccable의 telegraphic 길이 제약과 충돌하므로 의도된 trade-off일 가능성 높음 — 정보용 LOW.

## Validation Results

| Check | Result |
|---|---|
| Type check | Skipped (no TS) |
| Lint | Skipped (no package.json / linter config) |
| Tests (new M4 tests) | Pass — 27/27 |
| Tests (regression: envelope/watcher/dispatch) | Pass — 54+31/85 |
| Tests (regression: receipt/derive/renderer) | Pass — 12+27+77/116 |
| Build | n/a (no build step) |

## Files Reviewed

### Modified
- `CLAUDE.md` — env vars 섹션 추가 (M2: 한국어 오타)
- `.claude/prds/v1-3-0-observability-surface-ii.prd.md` — milestone 4 in-progress 전환
- `docs/v1.3.0-observability/dashboard-surface.md` — §10 M4 spec 추가
- `plugins/mccp/hooks/hooks.json` — SessionStart hook 등록
- `plugins/mccp/scripts/derive/index.js` — `applySecretMask` 무조건 실행 + `last_render_meta` surface
- `plugins/mccp/scripts/derive/mask.js` — 5 secret 패턴 catalogue + `applySecretMask` / `applyPathMask` 분리
- `plugins/mccp/scripts/derive/sources/envelopes.js` — payload secret scan + `masked_payload_signal` 부가 필드
- `plugins/mccp/scripts/lib/dispatch-envelope.js` — write 후 envelope-write trigger (H1)
- `plugins/mccp/scripts/lib/dispatch-watcher.js` — onEvent 후 envelope-move trigger (H1)
- `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` — mask 통계 + was_stale footnote
- `plugins/mccp/scripts/lib/renderer/verdict.js` — step 1.5 severe-only red banner
- `plugins/mccp/scripts/receipt/write.js` — write 후 receipt-write trigger

### Added
- `plugins/mccp/scripts/lib/renderer/trigger.js` — debounce + lock + render facade
- `plugins/mccp/scripts/hooks/render-trigger-session-start.js` — SessionStart trigger hook
- `plugins/mccp/scripts/derive/tests/mask-secrets.test.js` — 11 tests
- `plugins/mccp/scripts/derive/tests/envelopes-mask.test.js` — 1 test (F3 absorption)
- `plugins/mccp/scripts/lib/renderer/tests/trigger.test.js` — 10 tests
- `plugins/mccp/scripts/lib/renderer/tests/verdict-secret-banner.test.js` — 4 tests
- `plugins/mccp/scripts/hooks/tests/render-trigger-session-start.test.js` — 2 tests
- `.claude/PRPs/plans/completed/v1-3-0-observability-m4-refresh-failure-privacy-guard.plan.md` — plan archive
- `.claude/PRPs/reports/v1-3-0-observability-m4-refresh-failure-privacy-guard-report.md` — implementation report

## Decision Rationale

H1은 commit 전 1-line fix로 해결 가능하고 fix가 작으므로 REQUEST CHANGES. M2 오타도 같은 commit에 묶기 권장. M1은 follow-up axis로 가능. LOW 3건은 정보용.

## Next Steps

1. H1 fix: `dispatch-envelope.js` + `dispatch-watcher.js`에 `repoRoot` 명시 전달 + worktree의 `.claude/cache/` 부산물(`STATUS.md`, `status.html`, `.last-render.json`, `.trigger-dirty`, `.trigger-pending`) 삭제.
2. M2 fix: `CLAUDE.md` "짧추면" → "줄이면".
3. M1: 별도 axis 또는 same-commit 결정.
4. (옵션) `plugin.json` version bump (1.3.0 → 1.4.0) — CLAUDE.md §3.7에 따라 minor milestone PR이므로 잊지 않을 것.
