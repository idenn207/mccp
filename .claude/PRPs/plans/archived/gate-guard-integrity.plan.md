# Plan: Gate Guard Integrity — 가드 복원 (M1)

**Source PRD**: `.claude/prds/gate-guard-integrity.prd.md`
**Selected Milestone**: 1 — 가드 복원
**Complexity**: Medium

## 착수 전 요약

세 가드가 각각 다른 파일·다른 실패 조건으로 무력화돼 있고, 셋 다 "fail-closed여야 할 자리가 fail-open"이라는 같은 형태다. 본 plan은 **부정 케이스에서 실제로 발화하도록** 각 가드를 복원한다. green을 만드는 것이 목적이 아니라 **신호를 복원**하는 것이 목적이므로, 어떤 task도 테스트를 skip/삭제/완화하지 않는다.

GROUND 단계에서 PRD 대비 **세 가지가 달라졌다**. 아래 세 항목이 이 plan의 실질적 기여다.

1. **가드 1의 무방비 require는 2곳이 아니라 4곳이다.** PRD는 `extract-plan-path`만 지목했으나 `receipt-mode`도 동일하게 무방비 top-level require다(`receipt-prompt.js:22`, `receipt-skill.js:18`). 게다가 현재 테스트는 broken-root fixture에 `receipt-mode.js`를 **일부러 복사해 넣어**(`g1-patch.test.js:34-37`) 이 결함을 우회한다 — 즉 `extract-plan-path`만 고치면 테스트는 green이 되지만 무방비 require는 살아남는다.
2. **Open Question 3(가드 2 이행 경로)은 측정으로 닫혔다 — 이행 경로 불필요.** `validate-cmd.js:223`이 `readReceipt(repoRoot, gateId, decisionId)`로 **현재 decision 하나만** 읽으므로, 과거 ship receipt는 이 두 callsite가 애초에 재검증하지 않는다. 추가로 plan 경로는 `markdownHashStructural`로 해시되어 체크박스/status 토큰 변경은 이미 무시된다.
3. **Open Question 2(가드 3)는 프로덕션 결함이 실재하므로 테스트만 고쳐선 지표를 못 채운다.** 성공 지표가 "env를 인위적으로 제거하지 않은 상태에서 유효"를 요구하는데, 현재 프로덕션 의미론에서는 env가 켜져 있으면 unproven skip이 **항상** 증거를 얻으므로 어떤 테스트도 그 조건에서 통과할 수 없다.

## 실측 근거 (2026-08-09, 이 worktree)

| 가드 | 실측 | 명령 |
|---|---|---|
| G1 hook fail-open | 3 fail | `node --test .../hooks/tests/g1-patch.test.js` |
| G2 staleness | 1 fail — `pr.md:202`, `pr.md:856` missing `--plan` | `node --test .../lint/tests/validate-callsite-lint.test.js` |
| G3 ship-gate | env=1 → **24/26** · env 제거 → **26/26** | `node --test .../pr-phase-helpers/finalize-receipt.test.js` |

`MCCP_CODEX_DISABLED=1`은 사용자 전역 `~/.claude/settings.json:6`에 실재한다 — 가드 3이 무력화되는 조건이 이 환경에서 이미 성립 중이다.

G3의 두 실패는 서로 다른 원인이다:

- `not ok 19 — skipped WITH audited reason → exit 0` : `write.js:219`가 **명시 `--codex-skip-reason`을 env 유래 canonical 값(`'codex_disabled'`, 14자)으로 덮어써** strict validator(≥30자)에 걸린다.
- `not ok 21 — skipped WITHOUT reason (unproven) → exit 12` : `write.js:236`이 env로 `meta.codex_disabled=true`를 찍고, 그 필드가 `pr-ship-gate.js:58`의 `SKIP_PROOF_META_KEYS` 원소라 **증거 없는 skip이 증거를 얻어 ship**된다(exit 0).

핵심은 생산자 쪽 판정이 이미 옳다는 것이다. `finalize-receipt.js#deriveCodexFlags`는 `{codex_outcome:'skipped'}`(사유 없음)에 대해 proof 플래그를 **의도적으로 withhold**한다. `write.js`가 ambient env로 그 판정을 뒤집는다.

## Open Questions — 판정

### OQ1. 모듈 부재 시 ALLOW(fail-open) vs 보수적 강등 → **ALLOW, 단 loud**

근거: `receipt-prompt.js:11-12`가 파일 자신의 불변식으로 *"any error in this hook itself (parse, missing module, etc.) MUST allow the command through. A buggy gate is worse than no gate."* 를 명문화한다. G1 테스트도 이 기대를 인코딩한다. PRD Risk 1의 완화("조용히 통과"가 아니라 "메시지 + 통과")와도 일치한다.

**중요한 단서 — 이웃의 `catch → null` 패턴을 그대로 복제하면 안 된다.** `blockFormat`(`:35`)은 실패 시 조용히 null로 떨어지지만, `extract-plan-path`가 null이 되면 `--plan` 전달이 **조용히** 사라진다 — 그건 정확히 가드 2의 실패 모드를 hook 안에 재생산하는 것이다. 따라서 이 두 모듈의 로드 실패는 null fallback이 아니라 **기존 G1 경로(`g1Allow` / systemMessage + exit 0)** 로 라우팅한다.

### OQ2. 가드 3의 근본 해법 → **proof 집합의 축 오염을 제거한다 (write.js env-stamp은 건드리지 않는다)**

> **R1 재설계.** 초안은 "write.js가 ambient env로 `meta.codex_disabled`를 찍지 못하게 한다"였다. 두 리뷰어가 그 범위를 문제 삼았고, 검증해보니 **코드베이스에 이미 정답 축이 존재**한다. 초안은 필요보다 넓었고, 공유 writer의 의미론을 plan/implement 게이트까지 바꿨을 것이다.

**결함의 실제 위치는 `plugins/mccp/scripts/lib/pr-ship-gate.js:55-60`이다.** 이 저장소는 이미 두 필드를 **다른 축**으로 설계해 두었다:

| 필드 | 축 | 누가 정하나 |
|---|---|---|
| `meta.codex_disabled` | ambient env 정책의 **정직한 주석** (Codex가 실제로 꺼져 있었다) | `write.js:236` env 추론 |
| `meta.codex_disabled_at_pr` | **PR-step audit 축** | 명시 플래그만 (caller 결정) |

이 구분은 추측이 아니라 `plugins/mccp/scripts/receipt/tests/pr-codex-dedupe.test.js:113-118`이 주석으로 명문화하고 단언까지 한다 — *"codex_disabled_at_pr is NOT auto-set — only the explicit flag controls the PR-step audit axis (caller decides)."* `schema.js:374-382`의 3-way mutex(`dedupe ∩ skipped ∩ disabled_at_pr = ∅`)도 `_at_pr` 변종만 원소로 갖는다.

`SKIP_PROOF_META_KEYS`가 **두 필드를 모두** 넣으면서 그 구분이 무너졌다. ambient 주석이 PR ship proof로 승격되고, 그래서 표준 설치(env=1)에서는 증거 없는 skip이 예외 없이 증거를 얻는다 — **위조 탐지 분기(F2)가 구조적으로 도달 불가**가 된다.

**세 수정 (A와 C는 단일 커밋 불변식)**

- **A** — `pr-ship-gate.js`의 `SKIP_PROOF_META_KEYS`에서 `'codex_disabled'`를 **제거**한다. `'codex_disabled_at_pr'`는 남긴다. ship proof는 caller가 주장한 것만 인정한다.
- **B** — `write.js:215-220` precedence: 명시 `--codex-skip-reason`이 있으면 그것을 쓴다. env canonical(`'codex_disabled'`)은 인자 부재 시 fallback으로만. (test 19의 원인 — 14자 canonical이 audited 장문 사유를 덮어 strict validator에 걸린다.)
- **C** — `finalize-receipt.js#deriveCodexFlags`가 `codex_outcome === 'disabled'`일 때 **`--codex-disabled-at-pr`** 를 forward한다. 기존 두 분기가 forward하는 것이 `--codex-skipped-at-pr` / `--codex-dedupe-at-pr`인 것과 같은 꼴이다.

**`write.js`의 env-stamp은 그대로 둔다.** 따라서 plan/implement receipt 의미론 무변경, `pr-codex-dedupe.test.js` 무변경(그 테스트는 버그가 아니라 **옳은 계약**을 인코딩하고 있다), 공유 writer의 blast radius 0.

**규칙 (계층 구분이 핵심)**

관찰하는 계층은 env를 써도 된다. 기록하는 계층이 자기 생산자의 판정을 뒤집으면 안 된다.

`codex-runner.js:234-238`은 *"env-derived MCCP_CODEX_DISABLED takes precedence over explicit --skip-reason. Rationale: env policy is canonical operator intent"* 라고 **의도적으로** 반대 방향을 택한다. 이건 모순이 아니다 — runner는 *무슨 일이 일어났는지 관찰*하므로 env 우선이 옳다. 초안이 이 규칙을 전역으로 서술한 것은 틀렸다.

**검증된 전제 (R1에서 확인)**

- `codex-runner.js:243-245`가 env=1에서 실제로 `codex_outcome='disabled'` + `codex_skip_reason='codex_disabled'`를 emit한다 → 수정 C의 표적 분기는 실존한다.
- 현재 `deriveCodexFlags`(`:103-108`)에는 `'disabled'` 분기가 **없다** → 오늘의 실 ship 경로는 오직 ambient `codex_disabled`로만 proof를 얻는다. **A를 C 없이 넣으면 운영자 경로가 끊긴다.** 단일 커밋 불변식의 근거가 이것이다.

### OQ3. 가드 2 복원의 blast radius → **기존 receipt 즉시 stale 0건. 단 두 callsite의 효력은 서로 다르다**

> **R1 정정.** 초안은 두 callsite가 똑같이 staleness를 복원한다고 함의했다. 그건 틀렸다.

- `plugins/mccp/scripts/receipt/validate-cmd.js:224` `readReceipt(repoRoot, gateId, result.decisionId)` — **현재 decision 1건만** 조회. 과거 ship receipt는 두 callsite의 사정거리 밖이다. (초안의 `:223`은 오기 — 실제 224.)
- 참고 측정(전 receipt 38건): plan 해석 가능 27건 중 13건이 이미 hash drift. **위 스코핑 때문에 재검증 대상이 아니다.** 이 수치는 zero-migration 주장의 반증이 아니라 "과거 산출물은 원래 이 경로가 안 본다"의 방증이다.
- `plugins/mccp/scripts/receipt/hash.js:174-176` `planAwareMarkdownHash` → plan 경로는 `markdownHashStructural`. 체크박스/status 토큰 변동은 정규화되어 stale을 유발하지 않는다.

**두 callsite의 효력 차이 (Task 3의 정직한 범위)**

| Callsite | 위치 | plan 경로 가용? | 무엇을 gate하나 | `--plan` 추가의 실효 |
|---|---|---|---|---|
| `pr.md:203` | Phase 1.6 (`:192`) — **Phase 2 DISCOVER(`:266`) 이전** | **아니오** — 아직 발견 전 | `blocking` 중 `design_critique_chain_divergent` **한 종류만** | validator **스코핑 교정**만. staleness는 여기서 강제되지 않는다 |
| `pr.md:857` | 2.5.9 ship-gate read-back — Phase 2 이후 | 예 (Phase 2 산출) | aggregate `ok===false` | **실제 staleness 강제** |

즉 가드 2의 실질 복원 locus는 **2.5.9**다. Phase 1.6은 lint 계약을 정직하게 충족하되 staleness를 강제하지 않는다 — Phase 1.6을 aggregate `ok` gate로 넓히는 것은 매우 이른 단계에서 무관한 사유로 PR을 막는 동작 변경이라 PRD 범위 밖이다. 이 비대칭을 plan에 명시하지 않고 "두 곳 복원"이라 적는 것은 부정직하다.

### OQ3. 가드 2 복원의 blast radius → **측정 완료. 이행 경로 불필요**

- `validate-cmd.js:223` `readReceipt(repoRoot, gateId, result.decisionId)` — **현재 decision 1건만** 조회. 과거 ship receipt는 이 callsite의 사정거리 밖이다.
- 참고 측정(전 receipt 38건 대상): plan 파일 해석 가능 27건 중 13건이 이미 hash drift. **그러나 위 스코핑 때문에 그 13건은 이 두 callsite로 재검증되지 않는다.**
- `hash.js:174` `planAwareMarkdownHash` → plan 경로는 `markdownHashStructural`. 체크박스/status 토큰 변동은 이미 정규화되어 stale을 유발하지 않는다.

따라서 즉시 stale 판정되는 기존 receipt는 **0건**이며 마이그레이션이 필요 없다. 실효 blast radius는 "이번 cycle에서 plan이 게이트 이후 **구조적으로** 바뀐 경우"뿐 — 그건 정확히 의도된 발화다.

### OQ4. 비결정적 2건 → **본 milestone 범위 밖** (PRD가 Milestone 2로 배정)

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 방어적 module require | `plugins/mccp/scripts/hooks/receipt-prompt.js:27-30` | `const x = (function(){ try { return require(...) } catch(_) { return null } })()` — module-scope IIFE. 주석이 이유("a failed require during a catch block can't itself throw")까지 명시 |
| loud fail-open 라우팅 | `plugins/mccp/scripts/hooks/receipt-skill.js:58-74` `g1Allow` | systemMessage + `hookSpecificOutput.additionalContext` + exit 0. 조용한 통과 아님 |
| validate callsite 계약 | `plugins/mccp/commands/pr.md:829-832` | `validate --command X --decision ${DECISION_SLUG} --plan <plan path>` — 값은 placeholder 허용, **플래그 존재**만 lint 대상 |
| env vs 명시 인자 precedence | `plugins/mccp/scripts/receipt/write.js:214` `codex_skipped_at_pr: args[...] === true` | 명시 인자만 읽는 필드가 이미 바로 옆에 존재 — 같은 파일 안에 올바른 형태가 있다 |
| present-only meta 필드 | `plugins/mccp/scripts/lib/pr-ship-gate.js:55-58` `SKIP_PROOF_META_KEYS` | 배열 상수로 proof 키 집합을 한 곳에 모음 |
| hook 부정 케이스 테스트 | `plugins/mccp/scripts/hooks/tests/g1-patch.test.js:23-40` | broken plugin root fixture를 만들어 spawn — 실제 프로세스 경계로 검증 |

## Files to Change

repo-root 상대 full 경로 (CLAUDE.md §1.2 dedupe matcher 요구사항).

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/hooks/receipt-prompt.js` | UPDATE | G1 — `receipt-mode`(:22)·`extract-plan-path`(:70) 무방비 require를 방어 IIFE + G1 라우팅으로 |
| `plugins/mccp/scripts/hooks/receipt-skill.js` | UPDATE | G1 — 동일 (`:18`, `:105`) |
| `plugins/mccp/scripts/hooks/tests/g1-patch.test.js` | UPDATE | G1 부정 케이스 정직화 — fixture의 `receipt-mode.js` 복사 우회 제거 + 모듈별 부재 케이스 추가 |
| `plugins/mccp/commands/pr.md` | UPDATE | G2 — `:203` preflight(스코핑 교정) · `:857` ship-gate read-back(실 staleness 강제)에 `--plan` forward |
| `plugins/mccp/scripts/lib/pr-ship-gate.js` | UPDATE | G3 **수정 A** — `SKIP_PROOF_META_KEYS`에서 `'codex_disabled'` 제거 (ambient 주석의 proof 승격 차단) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | G3 **수정 B** — `:215-220` 명시 `--codex-skip-reason` > env canonical precedence. **env-stamp 로직(`:236`)은 무변경** |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATE | G3 **수정 C** — `codex_outcome==='disabled'` 시 `--codex-disabled-at-pr` 명시 forward (운영자 ship 경로 보존) |
| `plugins/mccp/scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js` | UPDATE | G3 — env 존재 상태의 부정 케이스 + `outcome='disabled'` ship 케이스 추가 (env 중화 **안 함**) |
| `plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js` | UPDATE | G3 수정 A 회귀 — ambient `codex_disabled`만으로는 proof 불성립, `codex_disabled_at_pr`는 성립 |
| `plugins/mccp/scripts/receipt/tests/codex-disabled-precedence.test.js` | CREATE | G3 수정 B 단위 회귀 — 명시 reason이 env canonical에 덮이지 않음 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | §3.7 patch bump `1.23.3 → 1.23.4` (단일 milestone) |
| `CHANGELOG.md` | UPDATE | 릴리스 기록. **forward-only** — PR 직전 `origin/main` 재확인 |
| `CLAUDE.md` | UPDATE | §3.3 / §4 — PR ship proof가 `codex_disabled_at_pr`(명시) 축임을 문서화 |

> **미포함 (의도적)**: `plugins/mccp/scripts/receipt/tests/pr-codex-dedupe.test.js`는 건드리지 않는다. R1에서 Reviewer B가 이 테스트를 "버그를 정답으로 고정한 것"으로 지목했으나, 검증 결과 그 반대다 — 이 테스트는 두 축의 **옳은 계약**을 지키고 있고, 그것을 무너뜨린 쪽이 `pr-ship-gate.js`다. 수정 A는 이 테스트를 통과시킨 채 성립한다.
> `.claude/prds/gate-guard-integrity.prd.md`의 Milestone 1 행 갱신은 plan 작성 시점에 **이미 적용됨** — Task 7에서 제외.

## Tasks

### Task 0: 소비처 열거 (선행, 파괴 없음)
- **Action**: `meta.codex_disabled` / `codex_disabled_at_pr` / `codex_skip_reason`의 **생산자와 소비처를 모두** 열거하고 영향을 표로 기록한다. 초안은 `grep -v tests/`로 테스트를 제외했는데, **그 제외가 정확히 R1에서 문제가 된 지점**이다 — 기존 테스트가 현재 동작을 계약으로 고정하고 있으면 그것이 설계 판단의 1차 증거다. 명령 본문(`.md`)도 생산자이므로 포함한다.
- **Mirror**: CLAUDE.md §3.12의 "resolution.converged를 완료 판정 키로 쓰지 마라" 선례 — 필드 의미 변경 전 전수 확인
- **Validate**: 아래 3개 sweep 결과가 plan/report에 표로 남는다
  ```bash
  grep -rn "codex_disabled\|codex_skip_reason" plugins/mccp/scripts --include=*.js
  grep -rn "codex_disabled\|codex_skip_reason" plugins/mccp/commands --include=*.md
  grep -rn "SKIP_PROOF_META_KEYS" plugins/mccp/scripts --include=*.js
  ```
- **Gate**: 이 필드를 **완료·승인 판정 키**로 읽는 소비처가 하나라도 발견되면 Task 4를 중단하고 설계를 재검토한다(조용한 의미 변경 금지). **단순 passthrough는 gate 대상이 아니다** — 아래 사전 조사 결과가 그 구분의 기준선이다.

**사전 조사 (design-critique R0에서 확정, 2026-08-09)**

| 소비처/생산자 | 성격 | 영향 |
|---|---|---|
| `plugins/mccp/scripts/lib/pr-ship-gate.js:55-60` | **판정 키** (`SKIP_PROOF_META_KEYS`) | **수정 A의 표적.** `'codex_disabled'` 제거, `'codex_disabled_at_pr'` 유지 |
| `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js:243-245` | 생산자 — env=1 시 `outcome='disabled'` + `reason='codex_disabled'` emit | 무변경. 수정 C의 입력 |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js:103-108` | 생산자 — `'disabled'` 분기 **부재** | **수정 C의 표적.** `--codex-disabled-at-pr` forward 추가 |
| `plugins/mccp/scripts/receipt/write.js:215-220` | env가 명시 reason을 덮음 | **수정 B의 표적** |
| `plugins/mccp/scripts/receipt/write.js:236` | env → `codex_disabled` 주석 | **무변경** (정직한 주석이며 proof가 아니게 됨) |
| `plugins/mccp/scripts/receipt/tests/pr-codex-dedupe.test.js:96-119` | **계약 테스트** — 두 축 구분을 단언 | **무변경.** 이 테스트가 옳고, 수정 A는 이것을 통과시킨 채 성립 |
| `plugins/mccp/scripts/receipt/schema.js:365-382` | 타입 검증 + 3-way mutex(`_at_pr` 변종만) | 무변경. 수정 C가 mutex를 위반하지 않는지만 확인 |
| `plugins/mccp/scripts/derive/sources/receipts.js:63-66` | passthrough (`pick`) | 무변경. **어떤 renderer section도 `codex_*`를 소비하지 않음**(실측: `plugins/mccp/scripts/lib/renderer/sections/` grep 0건) |
| `plugins/mccp/scripts/lib/dep-check.js:75` | env 직접 조회, receipt meta 미사용 | 영향 없음 |
| `plugins/mccp/scripts/lib/codex-bridge.js:153` | canonical reason 문자열 | 영향 없음 |

**Gate**: 위 표가 틀렸음이 드러나면 그 자체가 gate 발동이다. 특히 `codex_disabled`(ambient)를 **완료·승인 판정 키**로 읽는 소비처가 `pr-ship-gate.js` 외에 발견되면 수정 A를 중단하고 재설계한다. implement 단계는 이 표를 재확인하되 재작성하지 않는다.

### Task 1: G1 — 무방비 require 4곳 방어화
- **Action**: `receipt-prompt.js:22,70` · `receipt-skill.js:18,105`의 top-level require를 방어 IIFE로 감싼다. 로드 실패 시 **null fallback으로 조용히 진행하지 않고** 기존 G1 경로(systemMessage + exit 0)로 라우팅한다. `receipt-mode` 부재 시에도 동일.
- **Mirror**: `receipt-prompt.js:27-30` hookTrace IIFE + `receipt-skill.js:58-74` `g1Allow`
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/g1-patch.test.js` → 3/3 pass
- **주의**: `g1Allow`가 `receipt-mode` 등에 의존하면 순환이 생긴다 — G1 경로는 core 모듈만 사용해야 한다

### Task 2: G1 — 부정 케이스 정직화
- **Action**: `g1-patch.test.js`의 `makeBrokenPluginRoot`에서 `receipt-mode.js` 복사(`:34-37`)를 **제거**한다. 추가로 "`extract-plan-path`만 부재" / "`receipt-mode`만 부재" 두 케이스를 각각 spawn 검증한다(각각 exit 0 + systemMessage 존재 단언).
- **Mirror**: 같은 파일의 기존 spawn fixture 패턴
- **Validate**: 위 테스트가 Task 1 **이전** 코드에서는 fail, 이후에는 pass (부정 케이스 실효성 증명)
- **금지**: fixture에 모듈을 더 복사해 green을 만드는 것 — 그건 PRD Out of scope의 "red를 숨기는 형태의 해소"다

### Task 3: G2 — validate callsite 2곳 복원 (효력이 서로 다름)
- **Action**: 두 callsite를 **다르게** 다룬다(OQ3 표 참조).
  - `pr.md:857` (2.5.9 ship-gate read-back) — Phase 2 DISCOVER 이후라 plan 경로가 실재하고, 이미 aggregate `ok`로 gate한다. `--plan`을 여기 추가하는 것이 **가드 2의 실질 복원**이다. 값은 Phase 2가 발견한 동일 plan 경로(`pr.md:384`의 `<plan-path>`와 같은 것)여야 한다.
  - `pr.md:203` (Phase 1.6 preflight) — Phase 2 **이전**이라 발견된 plan 경로가 없다. `DECISION_SLUG`에서 결정적으로 파생한 경로(`.claude/plans/<slug>.plan.md` — `/mccp:plan`의 산출 규약)를 넘겨 validator 스코핑을 교정한다. 이 지점은 `design_critique_chain_divergent` 한 종류만 보므로 **staleness를 강제하지 않는다**. 파일이 없으면 validator는 `stale`에 넣지만 이 preflight는 `blocking`만 읽으므로 오탐 차단이 발생하지 않는다(fail-safe).
- **Mirror**: `pr.md:829-832` (플래그 형태) · `pr.md:200-202` (`DECISION_SLUG` 파생 패턴)
- **Validate**: `node --test plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js` → violations 0
- **금지**: Phase 1.6을 aggregate `ok` gate로 넓히지 말 것 — 매우 이른 단계에서 무관한 사유로 PR을 막는 동작 변경이며 PRD 범위 밖이다.
- **필수 추가 검증 (lint만으로 불충분)**: `validate-callsite-lint`는 **플래그 존재만** 검사한다. 치환된 경로가 비었거나 틀려도 lint는 green이다. 따라서 Task 3은 lint 통과에 더해 **2.5.9에서 `--plan`이 실제 경로를 받아 stale 판정이 동작함**을 직접 확인해야 한다: 게이트 후 plan을 구조적으로 수정한 뒤 validate가 `stale`을 내는지 1회 재현.

### Task 4: G3 수정 A — proof 집합에서 ambient 축 제거
- **Action**: `plugins/mccp/scripts/lib/pr-ship-gate.js`의 `SKIP_PROOF_META_KEYS`에서 `'codex_disabled'`를 제거한다. `'codex_disabled_at_pr'`는 유지. 주석에 축 구분 근거(`pr-codex-dedupe.test.js:113-118`의 계약)를 남긴다.
- **Mirror**: 같은 배열의 `codex_skipped_at_pr` / `codex_dedupe_at_pr` — 둘 다 caller가 명시 주장하는 PR-step 축이다. `codex_disabled`만 ambient였고 그것이 이질적이었다.
- **Validate**: `MCCP_CODEX_DISABLED=1` 상태에서 unproven skip이 exit 12
- **선행 조건**: Task 0의 gate 통과
- **불변식**: Task 5와 **같은 커밋**

### Task 4b: G3 수정 B — write.js reason precedence
- **Action**: `plugins/mccp/scripts/receipt/write.js:215-220`에서 명시 `--codex-skip-reason`이 공급되면 그것을 보존한다. env canonical(`'codex_disabled'`)은 명시 인자 **부재 시에만** fallback. `:236`의 `codex_disabled` env-stamp은 **건드리지 않는다**.
- **Mirror**: 같은 파일 `:214` `codex_skipped_at_pr: args['codex-skipped-at-pr'] === true`
- **Validate**: test 19(`skipped WITH audited reason → exit 0`)가 env=1에서 통과
- **독립성**: Task 4/5와 달리 단독 착지 가능(다른 결함)

### Task 5: G3 수정 C — finalize의 명시 증거 주장
- **Action**: `finalize-receipt.js#deriveCodexFlags`가 `codexResult.codex_outcome === 'disabled'`일 때 **`--codex-disabled-at-pr`** 를 forward한다. `--codex-disabled`가 아니다 — PR-step 축은 `_at_pr` 변종이고(schema 3-way mutex 원소), 기존 두 분기도 `--codex-skipped-at-pr`/`--codex-dedupe-at-pr`를 forward한다.
- **Mirror**: 같은 함수의 `'deduped' → '--codex-dedupe-at-pr'` 분기(`:107-108`)
- **Validate**: `codex_outcome:'disabled'` fixture → `meta.codex_disabled_at_pr=true` → exit 0(ship). 3-way mutex 위반 없음(`codex_skipped_at_pr`/`codex_dedupe_at_pr`는 false 유지).
- **불변식**: Task 4와 **같은 커밋**. Task 4가 옛 proof를 없애고 Task 5가 새 proof를 공급하므로, 4만 들어가면 운영자의 `MCCP_CODEX_DISABLED` ship 경로가 **조용히** 끊긴다(receipt는 써지고 gate만 막힘).

### Task 6: G3 — 표준 설치 환경 부정 케이스
- **Action**: `finalize-receipt.test.js`에 `MCCP_CODEX_DISABLED: '1'`을 **명시적으로 켠 채** unproven skip이 exit 12임을 단언하는 케이스를 추가한다. 기존 `runFinalize`의 ambient 상속은 **그대로 둔다** — env를 중화하지 않는 것이 지표의 요구다.
- **Mirror**: 같은 파일 `runFinalize`의 `opts.env` 병합 경로(`:217-221`)
- **Validate**: env 유·무 양쪽에서 26+ / all pass

### Task 7: 회귀 대조 + 버전·문서
- **Action**: 수정 전후 전수 실행을 **동일 조건**으로 대조한다(`node --test "plugins/mccp/scripts/**/*.test.js"`). pass 수 **비감소**를 확인한다. `plugin.json` 1.23.3 → 1.23.4, CHANGELOG(forward-only, `origin/main` 재확인), CLAUDE.md §3.3/§4에 "PR ship proof는 `codex_disabled_at_pr`(명시) 축" 반영. PRD Milestone 1 행은 **이미 갱신됨** — 재편집 금지.
- **Mirror**: CLAUDE.md §3.7 milestone PR 의무 체크리스트
- **Validate**: 아래 Validation 블록

## Validation

```bash
# 가드별 부정 케이스 (각각 독립 실행)
node --test plugins/mccp/scripts/hooks/tests/g1-patch.test.js
node --test plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js
MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js
MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js
node --test plugins/mccp/scripts/receipt/tests/codex-disabled-precedence.test.js

# 두 축 계약이 무손상인지 — 이 테스트는 수정 대상이 아니라 보존 대상
node --test plugins/mccp/scripts/receipt/tests/pr-codex-dedupe.test.js

# 표준 설치 환경 유효성 — env를 인위적으로 제거하지 않은 상태
MCCP_CODEX_DISABLED=1 node --test --test-reporter=tap \
  plugins/mccp/scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js 2>/dev/null \
  | grep -aE "^# (tests|pass|fail)"

# 전수 회귀 대조 — before/after 동일 조건. pass 비감소가 합격선
node --test --test-reporter=tap "plugins/mccp/scripts/**/*.test.js" 2>/dev/null \
  | grep -aE "^# (tests|pass|fail)"

# 삭제 사고 검증 (CLAUDE.md §3.5.1)
git diff --diff-filter=D --name-only origin/main...HEAD
```

**합격 기준**: 전수 `fail 8 → 2`(잔여 2는 Milestone 2 소관) **이면서** `pass` 수 비감소.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task 4가 Task 5 없이 착지해 운영자의 `MCCP_CODEX_DISABLED` ship 경로가 **조용히** 끊긴다 | Medium | 두 task를 **단일 커밋** 불변식으로 묶음. Task 5의 `outcome='disabled'` ship 케이스 테스트가 회귀를 기계적으로 잡음 |
| `meta.codex_disabled`를 승인 신호로 읽는 미확인 소비처가 있다 | Low | Task 0의 3-sweep(스크립트 + **명령 본문** + **테스트**)이 선행 gate. R1에서 이미 1차 열거 완료 |
| **lint가 green이 됐는데 가드는 여전히 죽어 있다** — `validate-callsite-lint`는 플래그 **존재만** 검사하므로 치환 경로가 비거나 틀려도 통과 | **High** | Task 3에 lint와 **별개**의 재현 검증 의무 부과(게이트 후 plan 구조 수정 → 2.5.9가 stale 판정하는지 1회 확인). 이것 없이 lint green만으로 "가드 2 복원"이라 주장하면 PRD가 금지한 *red 숨기기*의 변종이다 |
| G1 방어 경로가 `receipt-mode`에 의존해 순환 실패 | Low | G1 경로는 core 모듈만 사용. Task 2의 "receipt-mode만 부재" 케이스가 이를 직접 검증 |
| G2 복원이 이번 cycle 자신의 `/mccp:pr`을 stale로 막는다 | Low | OQ3 측정상 구조적 변경만 발화하며 체크박스류는 정규화됨. dogfood로 관측하고, 발화하면 그것이 정상 동작 |
| `extract-plan-path` 로드 실패를 null fallback으로 처리해 `--plan`이 조용히 사라진다 | Medium | OQ1에서 명시 금지. 로드 실패는 loud G1 경로로만 |
| CHANGELOG 헤딩 중복 (병렬 브랜치 3회 재발) | Medium | forward-only 상향 + PR 직전 `origin/main` 재확인 |
| green 압력으로 fixture에 모듈을 더 복사해 우회 | Medium | Task 2에 명시 금지. 지표를 "fail 감소 **이면서** pass 비감소"로 고정 |

## Acceptance

- [ ] Task 0의 **3-sweep**(스크립트·명령 본문·테스트) 표가 report에 기록되고 gate 판정이 남았다
- [ ] 무방비 top-level require 4곳이 전부 방어화됐다 (2곳이 아님)
- [ ] `g1-patch.test.js` fixture의 `receipt-mode.js` 우회 복사가 제거됐다
- [ ] `validate-callsite-lint` violations 0
- [ ] **lint와 별개로**, 게이트 후 plan을 구조적으로 바꿨을 때 2.5.9가 `stale`을 낸다는 것이 1회 재현됐다
- [ ] `MCCP_CODEX_DISABLED=1`을 **켠 채로** unproven skip이 exit 12로 막힌다
- [ ] `codex_outcome:'disabled'` → `meta.codex_disabled_at_pr=true` → exit 0 (ship 경로 보존)
- [ ] `pr-codex-dedupe.test.js`가 **수정 없이** 통과한다 (두 축 계약 무손상)
- [ ] 전수 실행 fail 8 → 2, pass 수 비감소
- [ ] `plugin.json` 1.23.4 + CHANGELOG + CLAUDE.md 갱신 (PRD 행은 기적용)
- [ ] 어떤 테스트도 skip/삭제/완화되지 않았다

## Codex Adversarial Review

> Codex skipped per `MCCP_CODEX_DISABLED=1` (env-level policy)

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` → `classification=disabled`, `blocking=false`, `durationMs=0` (spawn 직전 short-circuit)
- 라운드 수: 0
- `resolution.codex_verdict`: `skipped`
- **이 plan은 cross-model adversarial review를 받지 않았다.** `MCCP_CODEX_DISABLED=1`은 사용자 전역 `~/.claude/settings.json:6`에 설정돼 있고, Codex 사용 한도가 2026-08-13까지 소진된 상태다. §3.3상 `disabled`는 실패가 아니라 의도된 skip이지만, dual-review의 실제 가치는 이 cycle에서 **획득되지 않았다**.
- 대안: `/mccp:santa-loop`(Claude Opus + Codex 독립 2인 수렴)이 가용하면 그쪽에서 적대 검토를 받는 것이 선례다. 미수행 시 이 plan의 설계 판정(특히 OQ2의 프로덕션 의미론 변경)은 **단일 모델 판단**으로 남는다.
- Open Questions: 없음 (OQ1~OQ3은 위 `## Open Questions — 판정`에서 근거와 함께 닫았고, OQ4는 PRD가 Milestone 2로 배정)

## Santa-Loop Dual Review

Codex가 `MCCP_CODEX_DISABLED=1`로 skip돼 plan-codex 게이트에서 cross-model 검토를 못 받았으므로, 그 공백을 `/mccp:santa-loop`(컨텍스트 격리 2인)로 메웠다.

### Round 1 — NAUGHTY (Reviewer A: FAIL · Reviewer B: FAIL)

- Reviewer A: Claude Opus (`code-reviewer` 에이전트)
- Reviewer B: Codex GPT-5.4 (`codex exec --sandbox read-only`)

| # | 지적 | 포착 | 판정 | 조치 |
|---|---|---|---|---|
| 1 | `write.js` 공유 writer 의미론 변경은 필요보다 넓다 — plan/implement receipt까지 바뀐다 | **B만** | **수용** | OQ2 전면 재설계. 결함 위치를 `pr-ship-gate.js:55-60`으로 재귀속, `write.js:236` env-stamp 무변경 |
| 2 | Task 5가 `--codex-disabled`를 지목 — PR-step 축은 `_at_pr` 변종 | 자체 발견 | 수용 | Task 5를 `--codex-disabled-at-pr`로 정정 |
| 3 | `pr.md:203`은 Phase 2 DISCOVER 이전이라 plan 경로가 없고, `design_critique_chain_divergent` 한 종류만 본다 → `--plan` 추가로 staleness가 복원되지 않음 | **B만** | **수용** | OQ3에 두 callsite 효력 차이 표 추가. 실질 복원 locus는 2.5.9로 명시 |
| 4 | Task 0의 consumer sweep이 미완 | A·B 공통 | 수용 | 3-sweep(스크립트 + 명령 본문 + **테스트**)으로 확대. 초안의 `grep -v tests/`가 구조적 맹점이었다 |
| 5 | `validate-cmd.js:223` 오기 (실제 224) | **B만** | 수용 | 정정. A는 223을 PASS로 확인했다 — **A의 오검증** |
| 6 | PRD Milestone 행 갱신 task가 이미 적용된 상태 | **B만** | 수용 | Task 7·Files to Change에서 제거 |
| 7 | `pr-codex-dedupe.test.js:96-119`가 버그를 정답으로 고정 → 테스트를 갱신하라 | B | **기각(반증)** | 검증 결과 그 반대다. 이 테스트는 `codex_disabled`(ambient) ↔ `codex_disabled_at_pr`(명시 PR 축) **구분을 지키는 계약**이며 주석(`:113-118`)이 그 의도를 명시한다. 무너뜨린 쪽은 `pr-ship-gate.js`다. 테스트 **무변경**으로 수정 A가 성립 |
| 8 | `outcome='disabled'` 케이스가 실존하는지 미검증 | A | **기각(반증)** | `codex-runner.js:243-245`가 실제로 emit한다. 다만 단일 커밋 불변식의 필요성은 오히려 확증됐다 |

**메타 관찰**: 5건 중 4건을 Codex만 잡았고, Claude는 그중 하나(`:223`)를 PASS로 오검증했다. cross-model 비대칭 포착이 이 저장소에서 4회째 재현됐다. 동시에 B의 원인 귀속 1건(#7)은 코드로 반증됐다 — **지적은 신호이되 처방은 검증 대상**이다.

### Round 2 — 부분 수렴 (Reviewer A: PASS · Reviewer B: 판정 부재)

- **Reviewer A (Opus)**: PASS, `critical_issues` 0건. R1에서 재설계한 세 축을 각각 독립 검증했고, 특히 (a) 무방비 require가 주장한 4곳에 실재하며 **그 외에는 없음**, (b) `pr-codex-dedupe.test.js`가 옳은 계약을 인코딩하므로 R1 Codex의 "테스트를 고쳐라" 처방을 기각한 것이 정당함을 확인했다. 잔여 제안 5건은 전부 MEDIUM 이하 문서 명료성 항목이다.
- **Reviewer B (Codex)**: **두 시도 모두 검토 미수행.** 1차는 Windows sandbox DLL init 실패(`0xc0000142` 12건), 2차는 PowerShell 실행 정책 차단 4건으로 plan/PRD 파일을 **한 번도 읽지 못했다**. 두 출력 모두 `"verdict": "PASS"` 문자열을 포함했으나 **바이트 오프셋 170,832 동일 위치의 프롬프트 템플릿 반향**(`"verdict": "PASS" | "FAIL",`)이었다.

**운영자 판정 (2026-08-09)**: R1의 완주한 Codex 검토를 cross-model 기여로 인정하고 loop 종료. 근거는 R2의 변경이 R1 Codex 지적의 흡수분이고 그 방향을 제시한 것이 Codex 본인이며, Opus가 독립 재검증해 critical 0을 냈다는 것이다.

**명시된 잔여 공백**: **재설계된 plan(R1 이후 상태)을 Codex가 검토한 적 없다.** 특히 OQ2의 3부 수정(A/B/C)과 OQ3의 callsite 비대칭 표는 Opus 단독 검증만 받았다. 구현 단계의 Implement-Codex 게이트가 이 공백을 메울 1차 기회이며, 그때 Codex가 가용하면 위 두 축을 우선 검토 대상으로 지정한다.

> **부수 관찰 — 본 PRD의 실패 형태가 검토 과정에서 재현됐다.** grep이 찾은 `"verdict": "PASS"` 한 건을 그대로 신뢰했다면 "B도 통과"로 읽고 NICE를 선언했을 것이다. 실제로는 검사가 일어나지 않았다. *통과 신호의 존재가 검사가 일어났음을 의미하지 않는다* — PRD Problem 문단 그대로다. 부정 케이스 직접 재현(오프셋·후행 문자 확인)이 이것을 잡았다.

## Codex Implementation Review

> Codex skipped per `MCCP_CODEX_DISABLED=1` (env-level policy)

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` → `classification=disabled`, `blocking=false`, `advisory=false`, `durationMs=0` (spawn 직전 short-circuit)
- 라운드 수: 0
- `resolution.codex_verdict`: `skipped`
- **이 구현도 cross-model adversarial review를 받지 않았다.** plan 단계에서 명시한 잔여 공백("재설계된 plan을 Codex가 검토한 적 없다")을 Implement-Codex 게이트가 메울 1차 기회였으나, `MCCP_CODEX_DISABLED=1`이 사용자 전역 설정에 살아 있고 Codex 한도가 2026-08-13까지 소진돼 있어 이번에도 획득되지 않았다. §3.3상 `disabled`는 실패가 아니라 의도된 skip이지만, **dual-review의 실제 가치는 이 cycle에서도 미획득**이다.
- 대안: `/mccp:santa-loop`(Opus + `codex exec` 직접 호출 — wrapper env policy와 무관)이 가용하다. plan 단계에서 R1이 5건 중 4건을 Codex만 잡은 선례가 있으므로, ship 전에 재실행하는 것이 권장된다.

### Implement-time decisions (2.5.2)

plan이 사전 확약하지 않은 구현 시점 결정 — Codex가 검토했어야 할 표적:

1. **Task 5의 flag forward 형태**: plan은 `--codex-disabled-at-pr` 하나만 지정했으나, `schema.js:397-402`가 `codex_disabled_at_pr=true → codex_skip_reason==='codex_disabled'`를 **강제**한다. finalize가 reason을 forward하지 않으면 write 시점 ambient env에 의존하게 되고, env가 없는 프로세스에서는 **schema invalid**로 receipt write가 실패한다. 따라서 `--codex-skip-reason codex_disabled`를 **함께** forward한다(기존 `'skipped'` 분기의 2-flag forward와 동형). Task 4b의 precedence 변경과 정합 — 명시값이 canonical과 동일하므로 충돌 없음.
2. **Task 4b의 "명시값" 판정 기준**: `args['codex-skip-reason']`가 `true`(값 없는 flag)일 수 있으므로 `typeof === 'string' && length > 0`으로 좁힌다. `|| null` 관용구를 그대로 쓰면 `--codex-skip-reason` 단독 지정이 `true`를 통과시켜 schema type check(`must be a string or null`)에 걸린다.
3. **G1 방어화의 반환 계약 차이**: `receipt-prompt.js`는 exit 0 + stdout JSON, `receipt-skill.js`는 exit 0(허용)/2(차단). 두 파일의 `g1Allow`는 각각 다른 `hookEventName`을 쓰므로 공용화하지 않고 파일별로 유지한다. module-scope에서 로드 실패를 감지하되 **실제 라우팅은 `main()` 안에서** 수행한다 — module-scope에서 `process.exit`하면 stdin을 읽지 못해 event가 null이 되고 shard 로그가 사라진다.
4. **Task 2의 부정 케이스 구성**: 기존 3개 테스트는 `validate-cmd` 부재(receipt/ 트리 없음)로 G1을 유발한다. 신규 2케이스는 `receipt-mode`만 부재 / `extract-plan-path`만 부재를 각각 격리해야 하므로, fixture가 **나머지 모듈은 전부 갖춘 상태**여야 한다. 실제 plugin root를 복사하는 대신 필요한 lib 모듈만 선별 복사하고 `scripts/receipt`는 실제 트리를 심볼릭하지 않고 복사한다 — 그러면 두 모듈 부재가 단독 원인이 된다.

### Security Reviewer

security-reviewer를 **호출하지 않았다**. 판정 근거: 본 변경은 auth/crypto/secrets/input validation/injection/SSRF/path traversal/privilege escalation 어디에도 해당하지 않는다. `pr-ship-gate.js`의 proof 집합은 **내부 워크플로 게이트**(PR 생성 진행 여부)이지 신뢰 경계가 아니며, 공격자 모델·비신뢰 입력·자격증명이 없다. 카탈로그를 "authorization"으로 확대 해석하면 모든 게이트 변경이 보안 리뷰 대상이 되어 트리거가 무의미해진다. 또한 이 변경의 방향은 **fail-open → fail-closed**이므로 권한을 넓히지 않는다.

`--security-skipped`는 forward하지 **않는다** — 그 플래그는 "호출했으나 실패"를 뜻하고, 여기서는 트리거 자체가 미성립이다. 잘못 쓰면 다운스트림 `/mccp:pr`이 실재하지 않는 실패로 차단된다.

### Design Review

`impeccable-detect --mode implement` → `skill_available=true` · `design_signal=false` · `reason=no-signal` · `silent_skip=true`.

**타이밍 gap을 정직하게 기록한다**: implement-mode detector는 **게이트 시점의 git diff**를 읽는데, Phase 2.5는 Phase 3 EXECUTE **이전**이라 worktree가 clean이었다. EXECUTE 후에는 `plugins/mccp/scripts/receipt/write.js`(=`DESIGN_SURFACE_PATHS` 원소, `impeccable-detect.js:88`)가 diff에 들어가므로 같은 detector가 `design_signal=true`를 냈을 것이다. 즉 이 silent-skip은 "디자인 표면 없음"이 아니라 **"게이트 시점에 아직 diff가 없음"**이다.

critique loop을 강제하지 않는 이유: plan 단계 Design Critique이 이미 같은 축을 R0에서 CONVERGED로 닫았고(findings 0), 실측으로 `renderer/sections/`의 `codex_*` 소비 0건 — 렌더 surface 영향이 구조적으로 없음을 확인했다. `MCCP_DESIGN_INTENT_REASON` 우회로 loop을 재발화시키는 것은 같은 판정을 중복 수행할 뿐이다.

receipt에는 `--impeccable-silent-skip --impeccable-silent-skip-reason no-signal`을 forward한다(validator는 warnings-only, `validate-cmd.js:459`). Phase 2.5.5c capture 미발생 → Phase 3.7 grounding lint는 no-op.

### YAGNI Triage

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| — | — | — | Codex 미발화(`disabled`)로 finding 0건. triage 대상 없음 |

- Deferred to backlog: 0
- Open Questions: **cross-model 미검토** — severity HIGH. plan R1 이후 상태(OQ2 3부 수정 A/B/C, OQ3 callsite 비대칭)와 위 4개 구현 시점 결정이 단일 모델 판단으로 남는다. auto-CRITICAL 카탈로그(security boundary / atomic state / schema breakage) 해당 없음 → Phase 3 진입 차단 사유 아님.
- Codex session 참조: 없음 (spawn 미발생)

## Design Critique

`impeccable-detect --mode plan` → `skill_available=true` · `design_signal=true` · `signal_files=["plugins/mccp/scripts/receipt/write.js"]`. PRD 단계(`design_signal=false`)와 달리 발화했다 — Task 4가 `write.js`를 건드리고 그 경로가 `DESIGN_SURFACE_PATHS` 화이트리스트 원소이기 때문이다(briefing 필드 → 대시보드 렌더러 경로). 오탐이 아니라 실 hit이므로 §3.9 critique retry loop을 정상 수행했다.

- rounds: 1 (R0에서 종료)
- verdict: **CONVERGED** (`decideCritique({round:0, cap:2})`)
- Assessment B (`detect.mjs --json`): findings 0
- 렌더 surface 영향: **없음**. `renderer/sections/`에서 `codex_*` 소비 0건(실측) — derive 모델은 필드를 실어 나르지만 어떤 섹션도 렌더하지 않는다.
- 4 Output Constraints: 위반 없음. 본 변경은 렌더 surface를 추가하지 않으며(control-plane only), plan 문서 자체의 heading depth도 3 이하다.

흡수한 finding 1건 (MEDIUM, `## Tasks` / Task 0): gate 문구가 "소비처 발견 시 중단"이라 **passthrough까지 중단 사유로 오독**될 수 있었다. 판정 키(`pr-ship-gate.js:58`)와 passthrough(`derive/sources/receipts.js:63-66`)를 구분하는 사전 조사 표를 Task 0에 추가했다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더 UI가 없어 **호출하지 않고** 체크리스트로만 기록한다. implement에서 `renderingSurface` selector가 control-plane-only diff로 판정하면 refine/discovery는 recommend로 강등된다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Multi-Perspective Fan-out

**skipped** — 이번 세션의 명시 지시("워크플로우는 사용자 요청 시에만")에 따라 Phase 2.5 fan-out을 호출하지 않았다. 커맨드가 규정한 fail-open 경로인 인라인 Pattern Grounding으로 GROUND를 수행했고(위 `## Patterns to Mirror` + `## 실측 근거`), runaway 예약은 발생하지 않았다(reserve 미호출 → 카운터 소비 0).
