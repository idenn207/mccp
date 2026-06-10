# Plan: v0.3.5 — Codex Disabled Honor (wrapper-level first-class skip)

**Source PRD**: [.claude/prds/v0-3-5-codex-disabled-honor.prd.md](../prds/v0-3-5-codex-disabled-honor.prd.md)
**Selected Milestone**: v0.3.5 ship — single milestone (#1 in PRD `Delivery Milestones`)
**Complexity**: Medium

## Summary

codex-invoke.js wrapper에 `MCCP_CODEX_DISABLED=1` short-circuit 분기(classification `disabled`, `verdict='skipped'`, `reason='codex_disabled'`)를 추가해 bridge ↔ wrapper의 disabled-honor 갭을 닫는다. caller fanout(codex-runner / 명령 본문 Bash 블록 / pr.md Phase 0 preflight)에서 새 classification을 `ok`-equivalent로 흡수해, `MCCP_ALLOW_CODEX_UNAVAILABLE` / `MCCP_PR_SKIP_CODEX_REVIEW` 수동 env 주입 없이 chain이 PR 생성까지 도달한다. receipt schema에 `meta.codex_disabled` 추가 + mutex 확장으로 audit trail을 일관 보존.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Wrapper return shape | [codex-invoke.js:110-121](../../plugins/mccp/scripts/lib/codex-invoke.js#L110-L121) `makeFail()` | 동일 envelope 구조 — `{ ok, stdout, stderr, durationMs, classification, blocking, advisory }`. disabled는 `ok:true + classification:'disabled'`. |
| Bridge disabled honor | [codex-bridge.js:117-138](../../plugins/mccp/scripts/lib/codex-bridge.js#L117-L138) `isDisabled() + parseCodexResult` | wrapper 측 short-circuit이 동일 `verdict='skipped' + reason='codex_disabled'` 의미론 유지 → 두 layer의 enum이 align. |
| Test env snapshot/restore | [codex-bridge.test.js:143-152](../../plugins/mccp/scripts/lib/tests/codex-bridge.test.js#L143-L152) (v0.3.4 canonical) | `const prev = process.env.X; delete ...; try { ... } finally { if (prev === undefined) delete ...; else process.env.X = prev; }` inline. |
| Caller codex_outcome enum | [codex-runner.js:117-180](../../plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js#L117-L180) | `{invoked|skipped|deduped}` enum + summary 분기. disabled는 4번째 enum 또는 skipped로 자동 매핑(env-derived reason). |
| Receipt schema additive field | [schema.js:217-243](../../plugins/mccp/scripts/receipt/schema.js#L217-L243) `codex_skipped_at_pr` validators + mutex | 신규 `meta.codex_disabled` / `codex_disabled_at_pr` boolean field + 3-way mutex(dedupe ∩ skipped ∩ disabled = ∅). |
| Receipt write CLI integration | [schema.js:303-307](../../plugins/mccp/scripts/receipt/schema.js#L303-L307) default field block | default false + writer가 env 감지 시 auto-stamp. |
| Plugin version bump pattern | v0.3.4 ship (commit 730396a) | plugin.json만 단순 0.3.4→0.3.5 + CLAUDE.md §1.4 표 행 추가. |

## Files to Change

| File | Action | Why |
|---|---|---|
| [plugins/mccp/scripts/lib/codex-invoke.js](../../plugins/mccp/scripts/lib/codex-invoke.js) | UPDATE | invokeAdversarialReview 진입 직후 `MCCP_CODEX_DISABLED==='1'` short-circuit + classification enum 11→12. |
| [plugins/mccp/scripts/lib/tests/codex-invoke.test.js](../../plugins/mccp/scripts/lib/tests/codex-invoke.test.js) | UPDATE | disabled-honor 진입 케이스 + env unset regression 케이스(11 enum 동작 동일) 추가. canonical snapshot/restore 적용. |
| [plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js](../../plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js) | UPDATE | CLI exit code 검증 — disabled short-circuit 시 exit 0 + JSON `classification:'disabled'`. |
| [plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js](../../plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js) | UPDATE | step 2 codex_outcome 분기에 disabled 추가 — codex-invoke result `classification==='disabled'`이면 codex_outcome='disabled' + codex_skip_reason='codex_disabled' 자동 설정 + lock release 정상 경로. |
| [plugins/mccp/scripts/lib/tests/pr-phase-helpers/codex-runner.test.js](../../plugins/mccp/scripts/lib/tests/pr-phase-helpers/codex-runner.test.js) | UPDATE | env=disabled 시 codex_outcome='disabled' + spawn 미호출 검증. fake codex-invoke 주입. |
| [plugins/mccp/scripts/receipt/schema.js](../../plugins/mccp/scripts/receipt/schema.js) | UPDATE | `meta.codex_disabled` + `meta.codex_disabled_at_pr` boolean field 추가. dedupe/skipped/disabled 3-way mutex invariant. disabled_at_pr=true 일 때 codex_skip_reason 유효성 검증을 bypass(자동 'codex_disabled' 인정). default block에 false 두 entry 추가. |
| [plugins/mccp/scripts/receipt/tests/schema.test.js](../../plugins/mccp/scripts/receipt/tests/schema.test.js) | UPDATE | disabled field 타입 검증 + 3-way mutex 위반 케이스 + default 값 검증. |
| [plugins/mccp/scripts/receipt/write.js](../../plugins/mccp/scripts/receipt/write.js) | UPDATE | write 시점에 `process.env.MCCP_CODEX_DISABLED==='1'` 감지 → `meta.codex_disabled=true` + `meta.codex_skip_reason='codex_disabled'` 자동 stamp. CLI `--codex-disabled` flag도 명시 지원. |
| [plugins/mccp/scripts/receipt/tests/pr-codex-skip-env.test.js](../../plugins/mccp/scripts/receipt/tests/pr-codex-skip-env.test.js) | UPDATE | disabled vs skipped vs dedupe 3-way mutex 시나리오 추가. |
| [plugins/mccp/commands/plan.md](../../plugins/mccp/commands/plan.md) | UPDATE | Phase 5.2 Bash 블록의 `CODEX_CLASS != "ok"` 조건을 `CODEX_CLASS != "ok" && CODEX_CLASS != "disabled"` 로 확장 — disabled는 advisory mode env 불필요한 success path. |
| [plugins/mccp/commands/prp-implement.md](../../plugins/mccp/commands/prp-implement.md) | UPDATE | Phase 2.5 동일 패턴 적용. |
| [plugins/mccp/commands/pr.md](../../plugins/mccp/commands/pr.md) | UPDATE | Phase 0 preflight의 `MCCP_ALLOW_CODEX_UNAVAILABLE=1` 거부 룰에 `MCCP_CODEX_DISABLED=1` 예외 등록(disabled는 unavailable이 아닌 intentional). Phase 3.5 codex-runner 호출에 disabled outcome 자연 흡수 — 별도 --skip-reason 강제 불필요. |
| [plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js](../../plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js) | UPDATE | disabled 경로에서 PR phase guard 동작 검증(write-tool block 동일 유지 — disabled여도 lock 생명주기는 변경 없음). |
| [plugins/mccp/.claude-plugin/plugin.json](../../plugins/mccp/.claude-plugin/plugin.json) | UPDATE | `"version": "0.3.4"` → `"0.3.5"`. |
| [CLAUDE.md](../../CLAUDE.md) | UPDATE | §1.2 classification enum 표 11→12 행(`disabled` 추가). §3.3 fail-closed matrix에 `disabled` row(block n/a — intentional skip). §4 운영 토글에 `MCCP_CODEX_DISABLED=1` first-class disabled honor 명시(현재는 "Codex 호출 영구 skip"만 — wrapper에서 honor한다는 의미 추가). §1.4 ship 표 행 추가. |
| [.claude/state/STATE.md](../state/STATE.md) | UPDATE | `task_fingerprint: v0-3-5-codex-disabled-honor` flip + Goal/Done/Next-Step/Open-Questions 갱신. v0.3.4 fingerprint sync는 이미 commit 9190f3a로 분리 처리 — 이번 갱신은 v0.3.5 ship 시점 단일 commit. |
| [plugins/mccp/scripts/lib/tests/dep-check.test.js](../../plugins/mccp/scripts/lib/tests/dep-check.test.js) | (optional) | dep-check가 MCCP_CODEX_DISABLED 영구 설정 사용자에게 dep_check_missing='impeccable'만 surface하는 동작은 변경 없음 — regression test로 cross-check만. |

## Tasks

> 순서는 의존성을 따른다 (wrapper → caller → schema → command body → housekeeping). 각 task는 단일 PR 안의 별도 commit으로 끊을 수 있다(audit trail). `MCCP_CODEX_DISABLED=1` 영구 환경에서 test 실행 시 `MCCP_CODEX_DISABLED` snapshot/restore 패턴을 inline 적용해 cross-test 오염 방지.

### Task 1: codex-invoke.js wrapper short-circuit

- **Action**: `invokeAdversarialReview(focus, opts)` 진입 직후, `resolveCodexInstallPath` 호출 *직전*에 다음 분기 삽입:
  ```javascript
  if ((env.MCCP_CODEX_DISABLED || '') === '1') {
    return {
      ok: true,
      stdout: '',
      stderr: '',
      durationMs: Date.now() - t0,
      classification: 'disabled',
      blocking: false,
      advisory: false,
    };
  }
  ```
  파일 상단 classification enum 주석 11→12로 확장 (`disabled` 항목 추가). `runCli`는 envelope의 `blocking` 값으로 exit 분기(이미 0/12 분기 존재 — 변경 불필요).
- **Mirror**: [codex-invoke.js:110-121](../../plugins/mccp/scripts/lib/codex-invoke.js#L110-L121) `makeFail()` return shape.
- **Validate**: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review --focus test --json` (MCCP_CODEX_DISABLED=1 시 exit 0 + stdout JSON.classification='disabled'). 추가 invoke 호출 0회를 회피 — short-circuit이 spawn 이전에 fire.

### Task 2: codex-invoke.js unit + CLI tests

- **Action**: codex-invoke.test.js와 codex-invoke-json.test.js에 각각 다음 추가:
  - **positive**: `process.env.MCCP_CODEX_DISABLED='1'` 설정 후 `invokeAdversarialReview('focus')` 호출 → 결과 envelope `{ok:true, classification:'disabled', blocking:false, advisory:false, stdout:''}`. CLI는 exit 0.
  - **negative regression**: env unset 시 11개 기존 classification 매트릭스 그대로 — 임의 한 케이스(`registry-missing`) 회귀 확인.
  - **spawn-not-invoked invariant**: positive 경로에서 `spawnSync` mock(또는 fake registry)이 미호출되었는지 검증(테스트가 fake registry를 미생성한 채 disabled=1만 설정 — 통과해야 정상).
  - 모두 [codex-bridge.test.js:143-152](../../plugins/mccp/scripts/lib/tests/codex-bridge.test.js#L143-L152) snapshot/restore 패턴 inline 적용.
- **Mirror**: 동일 위 ref.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js` PASS. `MCCP_CODEX_DISABLED=1` shell + `MCCP_CODEX_DISABLED` unset shell 양쪽 동일 결과.

### Task 3: codex-runner.js (PR helper) integration

- **Action**: [codex-runner.js step 2 "Determine codex outcome"](../../plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js#L116-L124) 분기에 다음 추가:
  ```javascript
  // env-derived disabled precedes explicit --skip-reason — env policy is canonical.
  if (process.env.MCCP_CODEX_DISABLED === '1') {
    codexOutcome = 'disabled';
    codexSkipReason = 'codex_disabled';
  } else if (args['skip-reason'] && args['skip-reason'] !== true) { ... }
  ```
  step 4 "Invoke Codex (or short-circuit)" 분기에 `disabled` 케이스 추가:
  ```javascript
  } else if (codexOutcome === 'disabled') {
    codexSummary = 'Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy).';
  } else { /* invoke */ }
  ```
  emit() 반환 객체에 `codex_outcome` 그대로 전달 — pr.md body builder가 분기 인식.
- **Mirror**: 동일 codex-runner.js의 'skipped' / 'deduped' 처리 구조.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/pr-phase-helpers/codex-runner.test.js` PASS. 새 테스트: env=disabled + fake codex-invoke 주입 → codex_outcome='disabled', codex_skip_reason='codex_disabled', spawnSync(NODE, [codexInvoke, ...]) 미호출 (sentinel으로 검증).

### Task 4: receipt schema additive fields + 3-way mutex

- **Action**: [schema.js](../../plugins/mccp/scripts/receipt/schema.js) 변경:
  - `meta` field block default에 추가:
    ```javascript
    codex_disabled: false,
    codex_disabled_at_pr: false,
    ```
  - 새 validator 분기 추가:
    ```javascript
    if (m.codex_disabled !== undefined) {
      req(typeof m.codex_disabled === 'boolean', 'meta.codex_disabled must be a boolean if present');
    }
    if (m.codex_disabled_at_pr !== undefined) {
      req(typeof m.codex_disabled_at_pr === 'boolean', 'meta.codex_disabled_at_pr must be a boolean if present');
    }
    ```
  - mutex 확장:
    ```javascript
    const flags = [m.codex_dedupe_at_pr, m.codex_skipped_at_pr, m.codex_disabled_at_pr].filter(v => v === true);
    if (flags.length > 1) err('meta.codex_dedupe_at_pr + codex_skipped_at_pr + codex_disabled_at_pr are mutually exclusive — pick one (dedupe = cross-gate convergence, skipped = MCCP_PR_SKIP_CODEX_REVIEW audited escape, disabled = MCCP_CODEX_DISABLED env policy)');
    ```
  - `codex_disabled_at_pr === true` 시 `codex_skip_reason` 유효성 검증 bypass — `codex_skip_reason='codex_disabled'` 자동 인정(`validateReason`을 강한 룰에서 제외하되 string type만 검증). 다른 audited escape (skipped_at_pr) 룰은 그대로.
- **Mirror**: [schema.js:217-250](../../plugins/mccp/scripts/receipt/schema.js#L217-L250) 기존 dedupe/skipped 분기.
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/schema.test.js` PASS. 새 케이스: (a) disabled=true + reason='codex_disabled' PASS, (b) disabled=true + skipped_at_pr=true → mutex error, (c) disabled=true + dedupe=true → mutex error, (d) 모두 false → default 그대로 PASS.

### Task 5: receipt write.js auto-stamp + CLI flag

- **Action**: write.js 시점에 `process.env.MCCP_CODEX_DISABLED === '1'` 감지 → meta default에 `codex_disabled=true` + `codex_skip_reason='codex_disabled'`(미설정 시) 자동 stamp. `--codex-disabled` CLI flag 신설(명시 stamp 경로, 테스트 친화). pr.md Phase 3.5에서 codex-runner의 codex_outcome='disabled' result를 받으면 receipt write 호출에 `--codex-disabled` flag 추가하여 receipt 측에 audit 박힘.
- **Mirror**: 기존 `--codex-skip` flag 처리 (있다면) — 없으면 새 flag를 dedupe flag 패턴으로.
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/pr-codex-skip-env.test.js plugins/mccp/scripts/receipt/tests/state-matrix.test.js` PASS. 새 케이스: `MCCP_CODEX_DISABLED=1` shell에서 write CLI 호출 시 receipt JSON에 `meta.codex_disabled=true` 자동 stamp.

### Task 6: command body Bash gate 블록 확장 (plan / prp-implement)

- **Action**: 두 명령의 Codex gate Bash 블록에서 `[ "$CODEX_CLASS" != "ok" ]` 조건을 `[ "$CODEX_CLASS" != "ok" ] && [ "$CODEX_CLASS" != "disabled" ]`로 확장. disabled는 `MCCP_ALLOW_CODEX_UNAVAILABLE` 요구 없이 advisory mode equivalent로 그대로 진입(receipt는 verdict=skipped + meta.codex_disabled=true 자동 기록). 본문 텍스트: "MCCP_CODEX_DISABLED=1 환경에서는 spawn 우회 + receipt에 disabled 표시 — advisory env 불필요" 명시.
- **Mirror**: 기존 advisory mode 분기.
- **Validate**: 본 chain의 self-validation 자체 — `/mccp:work F1 ...` (현재 진행 중인 chain) 가 MCCP_CODEX_DISABLED=1 환경에서 어떤 우회 env 주입 없이 plan-codex / implement-codex 게이트 통과해야 한다.

### Task 7: pr.md Phase 0 preflight + Phase 3.5 통합

- **Action**: pr.md Phase 0 preflight에서 `MCCP_ALLOW_CODEX_UNAVAILABLE=1` 거부 룰 직전에 `if MCCP_CODEX_DISABLED=1: bypass rejection; advance to chain` 분기 추가. F9 mutex preflight (`MCCP_PR_SKIP_CODEX_REVIEW` ↔ `CODEX_DEDUPE_AT_PR`) 룰을 3-way mutex로 확장 — `MCCP_CODEX_DISABLED=1`이 active이면 `MCCP_PR_SKIP_CODEX_REVIEW`는 redundant(env이 우선) 또는 mutex 위반으로 거부(설계 선택 — recommended: env disabled가 우선, skip-env는 무시되며 stderr warn). Phase 3.5 codex-runner 호출 후 codex_outcome='disabled' 결과를 PR body builder가 "## Codex Review (skipped)" 섹션으로 inline 인식.
- **Mirror**: 기존 Phase 0 preflight reject 분기.
- **Validate**: `/mccp:work` chain 종단까지 PR 생성 검증 — PR body에 "## Codex Review (skipped)" 섹션 + receipt JSON `meta.codex_disabled=true` + `meta.codex_disabled_at_pr=true` 동시 기록.

### Task 8: 버전 bump + 문서 sync + STATE.md flip (housekeeping bundle)

- **Action**:
  - [plugin.json](../../plugins/mccp/.claude-plugin/plugin.json) 0.3.4 → 0.3.5.
  - [CLAUDE.md](../../CLAUDE.md) §1.2 classification matrix에 12번째 enum `disabled` 추가(설명: intentional skip via MCCP_CODEX_DISABLED=1, Default 동작은 advisory mode와 동일 통과). §3.3 fail-closed matrix에 row 추가(`disabled | intentional skip via env | 통과 (blocking=false) | n/a`). §4 운영 토글의 `MCCP_CODEX_DISABLED=1` 설명을 "wrapper-level first-class honor + receipt에 disabled stamp"로 확장. §1.4 ship 표(v0.3.0~0.3.4)에 v0.3.5 행 추가.
  - [STATE.md](../state/STATE.md) `task_fingerprint: v0-3-5-codex-disabled-honor` + Goal/Done/Next-Step 갱신 + Open Questions에서 F1 제거 후 다음 carry로 demote.
- **Mirror**: v0.3.4 ship cycle (commit 730396a) 의 housekeeping commit pattern.
- **Validate**: `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"` → `0.3.5`. grep `MCCP_CODEX_DISABLED` in CLAUDE.md → 새 첫-등급 honor 문구 hit. STATE.md fingerprint grep PASS.

## Validation

```bash
# Per-task validation은 위 Tasks 섹션에 inline 적용. 종합:

# 1. wrapper + bridge unit tests (env-set/unset 양쪽)
node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js \
                plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js \
                plugins/mccp/scripts/lib/tests/codex-bridge.test.js

# 2. caller integration tests
node --test plugins/mccp/scripts/lib/tests/pr-phase-helpers/codex-runner.test.js \
                plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js

# 3. receipt schema + write integration
node --test plugins/mccp/scripts/receipt/tests/schema.test.js \
                plugins/mccp/scripts/receipt/tests/pr-codex-skip-env.test.js \
                plugins/mccp/scripts/receipt/tests/state-matrix.test.js

# 4. full suite delta (env-set vs env-unset must be 0 — v0.3.4 hygiene invariant 유지)
$env:MCCP_CODEX_DISABLED='1'; node --test plugins/mccp/scripts/**/tests/*.test.js; Remove-Item env:MCCP_CODEX_DISABLED

# 5. self-dogfood — /mccp:work F1 chain 자체가 우회 env 주입 없이 종단 도달
echo $env:MCCP_ALLOW_CODEX_UNAVAILABLE  # → empty
echo $env:MCCP_PR_SKIP_CODEX_REVIEW     # → empty
echo $env:MCCP_CODEX_DISABLED            # → 1 (영구)
# 위 상태에서 /mccp:work chain 종단까지 도달 + receipt M2 일관 검증

# 6. plugin version + CLAUDE.md drift 0
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # → 0.3.5
Select-String -Path CLAUDE.md -Pattern 'MCCP_CODEX_DISABLED=1' | Measure-Object  # → ≥2 hits
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task 1 short-circuit이 너무 일찍 발생해 caller receipt write 흐름을 우회 | Low | wrapper는 envelope return만 — caller가 받아서 receipt write 호출하는 흐름은 변경 없음. Task 2의 invariant test로 caller receipt write call이 정상 발생함 검증. |
| classification enum 확장(11→12)이 codex-bridge.js AUTO_FALLBACK_PATTERNS와 의미 중첩 | Low | bridge는 already `verdict='skipped'` 분기 — wrapper의 `disabled`는 bridge의 `'skipped' + codex_disabled` 의미와 일관. cross-layer integration test (Task 2의 plus integration)로 검증. |
| receipt schema 3-way mutex가 기존 dedupe/skipped 테스트 회귀 발생 | Medium | Task 4의 mutex validator는 기존 invariant 보강 — 같은 케이스의 false positive 없는지 schema.test.js 회귀 케이스 추가. |
| Task 7의 MCCP_PR_SKIP_CODEX_REVIEW ↔ MCCP_CODEX_DISABLED 우선순위 결정이 사용자 mental model과 충돌 | Medium | "env disabled가 우선, skip-env는 무시되며 stderr warn" 선택 — 사용자 memory [feedback-codex-runner-disabled-blind] 의 auto-apply 패턴이 redundant해지지만 deprecation 안내로 부드럽게 전환. PR body audit section에 명시. |
| MCCP_CODEX_DISABLED=1 영구 환경 + receipt-gate-off 상태로 chain cross-validation 약화 | Low | 사용자 영구 합의([feedback-codex-permanent-bypass](../../../../C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-codex-permanent-bypass.md)). Codex 정상 사용자 영향 zero를 Task 2의 negative regression case로 mechanical 검증. |
| 자기 참조성(self-referential): 본 milestone 자체가 chain을 통해 MCCP_CODEX_DISABLED를 honor — 변경 *적용 전* chain 통과는 advisory mode 의존 | Inherent | 의도된 부트스트랩 paradox. Task 6/7 적용 *전* phase 6 ship 자체는 기존 advisory mode 우회로 통과(이번 chain), *적용 후* 차기 v0.3.6 cycle부터 우회 env zero가 정상. PR body에 명시. |
| Task 8 STATE.md flip이 hook-managed 영역 + 본 milestone scope 둘 다 동시 갱신 → fingerprint sync commit과 ship commit이 섞일 위험 | Low | STATE.md fingerprint sync(commit 9190f3a)는 이미 v0.3.5 chain 시작 전 단독 처리 완료. 이번 Task 8의 STATE.md 갱신은 v0.3.5 ship 시점의 의도적 변경만. |

## Acceptance

- [ ] Task 1-8 모두 완료
- [ ] Validation 6개 블록 모두 PASS
- [ ] Patterns mirrored — codex-bridge.js 의 `verdict='skipped' + reason='codex_disabled'` 와 의미론 일치. test snapshot/restore 패턴 v0.3.4 canonical 그대로
- [ ] Self-dogfood: 본 chain의 다음 /mccp:work 호출(v0.3.6 cycle)이 어떤 우회 env 주입 없이 PR까지 도달 — M1 metric 0회 달성
- [ ] STATE.md fingerprint = `v0-3-5-codex-disabled-honor`, v0.3.4 ship 행이 Done 표에 추가, F1 항목이 Open Questions에서 제거
- [ ] plugin.json version = 0.3.5

## Design Critique

> impeccable unavailable, skipped (auto-fallback): skill-missing

(impeccable Skill 미설치 — CLAUDE.md §1.1 fork-lineage 결정대로 별도 user-level 설치 대상. 본 plan은 wrapper short-circuit + receipt schema field + caller integration으로 UI/visual surface 없음. plan-codex는 lenient gate라 skip → `meta.impeccable_skipped=true` warning만.)

## Codex Adversarial Review

> Codex unavailable, skipped (auto-fallback): exit-nonzero (advisory mode)

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.3.4/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0 (Codex 자체가 spawn-fail — 본 milestone이 정확히 이 패턴을 wrapper-level로 흡수하는 자기참조 부트스트랩)
- 합치 결론: advisory mode demote (`blocking=false`, `advisory=true`). receipt는 non-approving으로 기록되며 chain-of-custody는 영구 bypass 정책(feedback-codex-permanent-bypass) 하에 의도된 broken 상태.
- YAGNI Triage: n/a — Codex 미가용으로 finding 미수집. backlog append 없음.
- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: none from Codex (사용자 PRD 7개 Open Question은 task별 Action에 inline 흡수됨)
- Codex session 참조: skipped (exit-nonzero — 영구 bypass 정책)

Note: 본 plan의 self-referential nature(MCCP_CODEX_DISABLED honor를 design하는 plan 자체가 MCCP_CODEX_DISABLED 환경에서 작성) 때문에 Codex review는 의도된 부트스트랩 paradox로 advisory path 통과. 차기 v0.3.6 cycle부터 우회 env zero가 정상 — 이는 본 plan의 Acceptance criteria 중 하나로 명시.

## Codex Implementation Review

> Codex unavailable, skipped (auto-fallback): exit-nonzero (advisory mode)

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.3.4/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0 — Codex 자체가 spawn-fail (영구 bypass 정책)
- 합치 결론: implement-time decisions advisory path 통과. (a)~(d) 결정은 Claude self-attest:
  - (a) short-circuit 위치: `invokeAdversarialReview()` 진입 직후, `t0` 캡처 후 `resolveCodexInstallPath` 호출 전. makeFail wrap 미사용(spawn-fail이 아니라 first-class success path). 이유: makeFail의 `blocking` 계산은 `advisoryAllowed` 기반인데 disabled는 advisoryAllowed와 무관하게 항상 `blocking=false`.
  - (b) 3-way mutex error message: 기존 dedupe/skipped error message 구조 그대로 `dedupe = cross-gate convergence, skipped = MCCP_PR_SKIP_CODEX_REVIEW audited escape, disabled = MCCP_CODEX_DISABLED env policy`로 확장.
  - (c) write.js auto-stamp 우선순위: env 감지 시 default false → true overwrite. CLI `--codex-disabled` flag는 명시 명령(test 친화). 둘 다 동일 결과지만 명시 flag 우선(다른 audited escape flag와 일관).
  - (d) codex-runner outcome: 4번째 enum 'disabled' 신설(skipped와 의미 분리 — skipped는 user audited escape, disabled는 env policy). codex_summary 문구도 다름.
- YAGNI Triage: n/a (Codex 미가용)
- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: none from Codex
- Codex session 참조: skipped (exit-nonzero)

### Security Reviewer

본 implementation은 `auth / crypto / secrets / input validation / SQL/cmd injection / SSRF / path traversal / privilege escalation` 카테고리 어디에도 해당 안 됨 — silent skip. wrapper 변경은 spawn 직전 short-circuit으로 attack surface 감소, receipt schema 추가 field는 additive boolean(default false)로 backward-compat 100%, 새 env var 추가 없음.

### Design Review

> impeccable unavailable, skipped (auto-fallback): skill-missing

(impeccable Skill 미설치 — CLAUDE.md §1.1 fork-lineage 결정. mccp-implement-codex는 strict gate라 `meta.impeccable_skipped=true` 가 PR step에 BLOCK으로 작용하지만, 사용자 영구 bypass 정책 + 본 implementation의 non-UI surface 특성상 의도된 advisory 통과.)
