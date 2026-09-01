# Plan: 라운드 캡 기계 강제

**Source PRD**: .claude/prds/env-contract-integrity.prd.md
**Selected Milestone**: M3 — 라운드 캡 기계 강제
**Complexity**: Large

## Summary

라운드 캡은 오늘 **판정만 있고 강제가 없다.** `effectiveRoundCap`은 정확히 `cap=1, pinned=true`를 돌려주고 세 게이트 본문이 그 오라클을 실제로 호출하지만, 라운드를 여는 것은 LLM이 읽는 산문이라 초과를 막는 장치가 없다 — 실측으로 15+ 라운드가 관측됐고 그 receipt는 `rounds: 1`을 봉인했다(`write.js:394`가 리터럴 `1`이다).

M3은 캡을 **리뷰어 발화 지점**에서 강제한다. 캡을 게이트 진입 시 봉인하고(`codex-policy.js`가 v1.32.6에 확립한 패턴), 라운드 수의 단일 출처인 원장을 두고(`santa/ledger.js` 미러), Codex spawn 직전과 L2 패널 launch 직전 두 chokepoint가 원장을 읽어 캡 초과를 거부한다. 그리고 receipt의 `resolution.rounds`를 원장에서 파생시켜 저자 서술과 분리한다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | PRD 파일 `.claude/prds/env-contract-integrity.prd.md`의 다음 마일스톤을 계획한다 | direction |
| UI2 | 계획을 작성하기 전에 main 기준으로 pull을 먼저 진행한다 | direction |
| UI3 | 명령이 요구하지 않는 선택적 workflow 와 deep-research 와 subagent fan-out 은 쓰지 않는다 | exclusion |

## Grounding

실측은 전부 이 워크트리의 머지 후 HEAD 기준이다.

- **G1 — `resolution.rounds`는 리터럴이다.** `plugins/mccp/scripts/receipt/write.js:394`의 `defaultResolution`이 `rounds: 1`이고, `--rounds` CLI 플래그는 **0건**이다. 유일한 override 경로 `--resolution-file`은 `receipt-write.md`에만 문서화돼 있고 세 게이트 본문 중 어느 것도 넘기지 않는다. 즉 R13을 돌아도 receipt는 반드시 `1`을 봉인한다 — PRD Open Question이 기록한 그 상충이다.
- **G2 — 캡은 세 게이트에서 오라클로만 소비된다.** `effectiveRoundCap` 호출부는 정확히 3곳이고 전부 명령 본문의 셸 블록이다: `plugins/mccp/commands/plan.md:2231` · `plugins/mccp/commands/prp-implement.md:353` · `plugins/mccp/commands/pr.md:575`. 세 곳 모두 값을 `$ROUND_CAP`에 담고 그 다음 줄은 "Repeat up to `$ROUND_CAP` rounds"라는 **산문**이다(`plugins/mccp/commands/prp-implement.md:367`). 강제 지점이 존재하지 않는다.
- **G3 — 같은 계열 결함을 main이 v1.32.6에 이미 닫았고 그 처방이 정본이다.** `MCCP_CODEX_DISABLED`가 라운드마다 무시되던 결함을 `codex-policy.js`(게이트 진입 시 `<git-dir>/mccp/tmp/codex-policy.json`에 봉인 → "봉인 OR env"로 판정)와 `codex-invoke.js:201 resolveDisabledPolicy`(spawn 직전 short-circuit)로 해결했다. `review-single-pass.js:26-32`가 그 층을 "2차 방어"라 부르며 "정책의 기계적 강제는 codex-policy를 읽는 codex-invoke.js의 spawn 직전 short-circuit이 맡는다"고 명시한다. M3은 **같은 자리에 같은 모양으로** 라운드 축을 얹는다.
- **G4 — 기계적 라운드 강제의 완성된 선례가 저장소 안에 있다.** santa는 원장(`santa/ledger.js` — 라운드 수의 단일 출처, evidence-lock guarded, repo-root 앵커, `0o600`, gitignored)과 순수 오라클(`santa/counter.js:47 decideRound({roundsSoFar, cap})`)과 거부 exit(`cap_reached` ↔ exit 12)로 이미 기계 강제다. `decideRound`는 santa를 전혀 모르는 순수 함수라 그대로 재사용 가능하다.
- **G5 — L2 패널에는 원장이 있으나 차단이 없다.** `plugins/mccp/commands/plan.md` 5.2c가 `.claude/state/plan-review/dispatch-log-<slug>.jsonl`에 dispatch 1건당 1줄을 append하고 `review-single-pass.js:180 assertSingleRound`가 그것을 읽어 "같은 본문이 두 번 이상 심사받았다"를 반증한다. 그러나 그것은 **사후 측정 도구**이고 어떤 게이트도 그것을 호출하지 않는다. 반면 그 직전의 `emit-workflow-args`는 이미 exit 12 → 5.2c HALT로 배선된 **필수 chokepoint**다(`--granted`가 quorum을 못 채우면 거부).
- **G6 — `resolution.rounds >= 1`은 schema가 강제한다.** `receipt/schema.js:152`가 `Number.isInteger(r.rounds) && r.rounds >= 1`을 요구한다. 따라서 "원장이 비었을 때 0을 쓴다"는 선택지는 schema 완화를 동반해야 하고, 그것은 별개 축이다.
- **G7 — CLAUDE.md §3.16의 사실 주장이 오늘 거짓이다.** "캡 1 고정(프로젝트 기본, 이미 `.claude/settings.json`에 설정)"이라 적혀 있으나 실제 값은 `"MCCP_GATE_ROUND_CAP": "3"`이다. M3이 캡을 강제하는 순간 이 드리프트는 무해한 오기가 아니라 **운영자가 기대하는 캡과 강제되는 캡의 불일치**가 된다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 봉인 | `plugins/mccp/scripts/lib/codex-policy.js:110` | 게이트 진입 1회 `sealPolicy` — 지우고-쓰기 순서 · `0o600` · write 후 read-back 검증 · `resolveGitDir`로 worktree-safe 앵커 |
| 봉인 판정 | `plugins/mccp/scripts/lib/codex-policy.js:138` | `readPolicy`는 판정이 아니라 **관측** — 부재·만료·판독불가를 구분해 보고하고 판정 함수가 셋을 다르게 다룬다 |
| 원장 | `plugins/mccp/scripts/lib/santa/ledger.js:20` | `<repoRoot>/.claude/state/<축>/<decision-slug>.json` · gitignored · `0o600` · `guardedReadModifyWrite`로 mutation · `assertContained` 2차 방어 |
| 경로 주입 금지 | `plugins/mccp/scripts/lib/santa/ledger.js:26` | `statePath`/`stateDir`는 프로그래매틱 전용 — CLI는 `--cwd`(탐색 기점)만 받아 탈출면이 구조적으로 없다 (§3.13 선례) |
| 순수 캡 오라클 | `plugins/mccp/scripts/lib/santa/counter.js:47` | `decideRound({roundsSoFar, cap})` → `{allowed, roundIndex, exitReason}` · 거부 시 `roundIndex: null`(오용면 축소) |
| spawn 직전 short-circuit | `plugins/mccp/scripts/lib/codex-invoke.js:201` | `resolveDisabledPolicy` — 정책 모듈 로드 실패는 **fail-open**(env로 강등), 판독 불가 봉인은 정책 쪽으로 접음 |
| 공유 표 단일 소유 | `plugins/mccp/scripts/lib/env-contract/doctor.js:47` | 재-export가 아니라 `require`로 읽어 "두 소비처가 같은 표를 본다"가 import 그래프에 남는다 |
| env 어휘 상수 | `plugins/mccp/scripts/lib/design-grounding.js:31` | 모드 열거를 export하고 registry `vocabulary` ref가 그것을 가리켜 lint L11이 집합 대조 |
| 불량값 방향 | `plugins/mccp/scripts/lib/review-single-pass.js:74` | `parseRoundCap` — 불량값은 **기본 캡**(fail-open). 오타가 라운드를 무한히 열면 안 된다 |
| 테스트 | `plugins/mccp/scripts/lib/tests/review-single-pass.test.js` | 순수 오라클은 단위 test, 명령 본문 배선은 `*-command-body.test.js`의 정적 단언 |

## Design Decisions

- **DD1 — 라운드 수의 단일 출처는 원장이고, 오라클은 그 수를 인자로 받는다.** `santa/ledger.js` DD1을 그대로 따른다. `review-rounds/ledger.js`만 디스크를 알고, 판정은 `santa/counter.js#decideRound`를 **재사용**한다(복제하지 않는다 — 8줄짜리 순수 함수라도 두 벌이 되면 드리프트하고, 그 드리프트가 곧 이 PRD가 다루는 결함 계열이다). 재사용은 `require`로 하며 그 사실이 import 그래프에 남는다.
- **DD2 — 캡은 게이트 진입 시 봉인한다.** 강제 지점(`codex-invoke.js`)은 **자식 프로세스**이고, 이 PRD의 Evidence 세 번째 항목이 정확히 "값이 프로세스에 도달하지 않았다"는 사건이다. env만 읽으면 M3은 자기가 고치려는 결함에 스스로 물린다. 봉인은 `<git-dir>/mccp/tmp/review-rounds-seal.json`에 두고 `codex-policy.js`와 **별도 파일**로 한다 — 방금 ship된 스키마를 확장하면 두 축의 실패가 서로 묶이고, 별도 파일이면 `resolveGitDir`만 재사용해 결합을 최소로 유지한다.
- **DD3 — 라운드는 "리뷰어가 답했을 때" 계상한다. 물었을 때가 아니다.** transport 실패(`timeout`·`spawn-enoent`·`exit-nonzero`)는 triage할 findings를 생산하지 않았으므로 예산을 소모하면 안 된다. 그리고 그 실패는 이미 `blocking=true`라 게이트가 그 자리에서 멈추므로 계상하지 않아도 폭주하지 않는다. 반대로 "물었을 때" 계상하면 캡 1 과 일시적 Codex 장애의 조합이 그 decision의 게이트를 **영구 차단**한다.
- **DD4 — 캡 초과는 차단이 아니라 "수렴 실패"다.** 세 본문의 산문이 이미 "Beyond the cap, annotate as `Open Questions: DIVERGENT_UNRESOLVED` and proceed"라고 규정한다. 따라서 새 classification `round-cap-reached`는 `blocking=false` · `advisory=false` · `durationMs=0`이고, 호출부는 `CODEX_VERDICT="divergent"`로 매핑한다. `blocking=true`로 잡으면 캡에 도달한 정상 종료가 환경 장애처럼 보고되고, 운영자는 "게이트가 고장났다"로 읽는다. divergent는 cross-gate dedupe를 열지 않으므로(§3.12) 이 경로가 dual-review를 우회시키지 않는다.
- **DD5 — 강제 chokepoint는 정확히 둘이고, 둘 다 이미 fail-closed로 배선된 자리다.** Codex 채널은 `codex-invoke.js` spawn 직전(세 게이트 전부가 이 한 지점을 지난다), 패널 채널은 `plan-review/cli.js emit-workflow-args`(5.2c가 그 exit 비영점에서 이미 HALT 와 예약 반환 과 record를 한다). 새 chokepoint를 만들지 않는 것이 핵심이다 — 산문이 "호출하라"고 지시해야만 작동하는 지점을 하나 더 두면 M3은 같은 결함을 이름만 바꿔 재생산한다.
- **DD6 — 원장은 decision slug로 keying하고 plan hash로 하지 않는다.** dispatch-log는 plan hash로 keying하지만(본문이 바뀌면 새 그룹) 그 목적은 "같은 본문 재심사" 탐지다. 캡의 목적은 반대다 — escalation 라운드는 **본문을 고친 뒤** 도는 것이므로 hash로 keying하면 캡이 영원히 발화하지 않는다. santa와 같이 decision slug 단위로 누적한다.
- **DD7 — `MCCP_ROUND_LEDGER`는 `enforce` 와 `observe` 2값이고 `off`가 없다.** `observe`는 원장을 기록하되 거부하지 않는다 — 단계적 배포와 "이 저장소에서 실제로 몇 라운드가 도는가"의 계측용이다. `off`를 두지 않는 이유는 `MCCP_PLAN_REVIEW`에서 `off`를 **제거한** M2의 판단과 같다: 끄는 것은 M3 이전 동작을 요청하는 것이고 그것이 결함 자체다. `observe`가 이미 비차단 과 전량 기록을 주므로 `off`가 사는 것은 침묵뿐이다.
- **DD8 — `resolution.rounds`는 원장 count가 1 이상일 때만 파생하고, 0이면 legacy `1`을 유지한다.** G6대로 schema가 1 이상을 요구하므로 0을 쓰려면 schema 완화가 필요하고 그것은 별개 축이다. 그리고 "Codex가 disabled라 아무도 답하지 않았다"는 사실은 이미 `resolution.codex_verdict='skipped'`가 나르므로 `rounds`가 그것을 두 번 말할 필요가 없다. 진짜 count(0 포함)는 present-only `meta.round_ledger_count`가 봉인한다.
- **DD9 — 명시 `--resolution-file`이 원장과 다른 수를 실으면 fail-closed다.** PRD Open Question의 축 (c)다. 조용히 원장 쪽을 채택하면 "저자 서술과 분리"라는 목적은 달성되지만 저자가 다른 수를 믿고 있다는 사실이 사라진다. 불일치는 관측 가능한 사건이므로 보고한다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/review-rounds/ledger.js` | CREATE | 라운드 수의 단일 출처 (DD1). `santa/ledger.js` 미러 |
| `plugins/mccp/scripts/lib/review-rounds/seal.js` | CREATE | 게이트 진입 시 캡 봉인 (DD2). `codex-policy.js` 미러 |
| `plugins/mccp/scripts/lib/review-rounds/cli.js` | CREATE | `seal` 과 `status` 과 `clear` — 명령 본문이 부르는 표면 |
| `plugins/mccp/scripts/lib/codex-invoke.js` | UPDATE | spawn 직전 라운드 예산 판정 과 `round-cap-reached` classification 추가 (DD4·DD5) |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | `emit-workflow-args`에 같은 판정 (DD5 패널 채널) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | `resolution.rounds` 원장 파생 과 불일치 fail-closed 과 present-only 3필드 (DD8·DD9) |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | present-only 3필드 형태 계약 |
| `plugins/mccp/commands/plan.md` | UPDATE | 진입 봉인 과 `round-cap-reached` 처리 과 5.2c 패널 거부 사유 문구 |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | 진입 봉인 과 `round-cap-reached` 처리 |
| `plugins/mccp/commands/pr.md` | UPDATE | 진입 봉인 과 `round-cap-reached` 처리 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | `MCCP_ROUND_LEDGER` 등재 과 `vocabulary` ref |
| `docs/ENVIRONMENT.md` | UPDATE | 색인 행 1건 |
| `docs/environment/gates.md` | UPDATE | 상세 절 과 `**값별 결과**` 블록 (lint L12) |
| `docs/gate-design.md` | UPDATE | `#round-cap-enforcement` 앵커 — 두 chokepoint 와 원장 수명 |
| `CLAUDE.md` | UPDATE | §3.15의 "주장하지 않는 것" 정정 과 §3.16의 캡 값 사실 정정 (G7) |
| `.claude/settings.json` | UPDATE | G7 — 문서와 설정 중 어느 쪽이 정본인지 정하고 맞춘다 |
| `.gitignore` | UPDATE | `.claude/state/review-rounds/` |
| `plugins/mccp/scripts/lib/review-rounds/tests/ledger.test.js` | CREATE | 원장 단위 test |
| `plugins/mccp/scripts/lib/review-rounds/tests/seal.test.js` | CREATE | 봉인 단위 test |
| `plugins/mccp/scripts/lib/review-rounds/tests/enforcement.test.js` | CREATE | 두 chokepoint의 거부 과 DD3 계상 시점 |
| `plugins/mccp/scripts/lib/tests/round-cap-command-body.test.js` | CREATE | 세 본문의 배선 정적 단언 |
| `plugins/mccp/scripts/receipt/tests/round-ledger-fields.test.js` | CREATE | 파생 과 불일치 fail-closed 과 present-only |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (§3.7 — `/mccp:pr` 진입 직전 재계산) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | 항목 과 `currently` 노트 |
| `.claude/prds/env-contract-integrity.prd.md` | UPDATE | M3 status 과 라운드 캡 Open Question 판정 기록 |

## Tasks

### Task 1: 라운드 원장

- **Action**: `review-rounds/ledger.js`. 상태 파일 `<repoRoot>/.claude/state/review-rounds/<gate-id>__<decision-slug>.json`, `0o600`, `{ schema_version: 1, gate_id, decision_id, rounds: [{ index, at, channel, classification }] }`. API는 `read(opts)` 과 `recordRound(opts)` 과 `count(opts)` 셋. mutation은 `guardedReadModifyWrite`, 경로는 `gitRepoRoot` 앵커 과 `assertContained`, slug은 `receipt/decision.js`의 `SLUG_RE` 재사용. `statePath` 와 `stateDir`는 프로그래매틱 전용.
- **Mirror**: `plugins/mccp/scripts/lib/santa/ledger.js:20-32`
- **Validate**: `node --test plugins/mccp/scripts/lib/review-rounds/tests/ledger.test.js` — 신규 slug count 0 과 3회 record 후 count 3 과 traversal slug 거부 과 동시 record 2건이 유실 없이 2가 되는지

### Task 2: 캡 봉인

- **Action**: `review-rounds/seal.js`. `sealCap({gitDir, env, now})`가 `effectiveRoundCap(env)` 결과(`cap`·`pinned`·`pinnedBy`)와 `sealed_at`을 `<git-dir>/mccp/tmp/review-rounds-seal.json`에 `0o600`으로 봉인(지우고-쓰기 과 read-back 검증). `readCap({gitDir})`는 관측(`present`·`absent`·`expired`·`unreadable` 구분). `resolveCap({gitDir, env})`는 판정: 봉인이 읽히면 그 값, 아니면 `effectiveRoundCap(env)`로 강등하되 loud warn. 만료는 `codex-policy.MAX_SEAL_AGE_MS`를 **require해서** 같은 값을 쓴다.
- **Mirror**: `plugins/mccp/scripts/lib/codex-policy.js:110` 과 `:138` 과 `:182`
- **Validate**: `node --test plugins/mccp/scripts/lib/review-rounds/tests/seal.test.js` — 봉인 후 env를 비워도 `resolveCap`이 봉인값 과 봉인 부재 시 env 강등 및 warn 과 만료 봉인은 강등 과 read-back mismatch throw

### Task 3: `MCCP_ROUND_LEDGER` 어휘와 등재

- **Action**: `review-rounds/seal.js`에 `LEDGER_MODES = Object.freeze(['enforce', 'observe'])` 과 `parseLedgerMode(env)`를 export. 불량값은 **기본값 `enforce`로 fail-closed**(캡을 지키는 쪽이 권한을 늘리지 않는 방향이다 — `parseSinglePass`의 방향과 같다). registry에 kind `enum` 과 values `['enforce','observe']` 과 default `enforce` 과 domain `gates` 과 evidence(파서가 실제로 그 이름을 읽는 줄) 과 `vocabulary` ref로 등재.
- **Mirror**: `plugins/mccp/scripts/lib/env-contract/registry.js`의 `MCCP_DESIGN_GROUNDING` 행(enum 과 vocabulary ref)
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` — L1(런타임 스캔 포함) 과 L10(evidence가 그 이름을 가리킴) 과 L11(어휘 집합 동일) 과 L12(값별 결과 블록) 전부 green

### Task 4: Codex 채널 강제

- **Action**: `codex-invoke.js`에 `resolveRoundBudget`을 `resolveDisabledPolicy` 바로 옆에 추가. spawn 직전 순서는 `disabled` short-circuit **다음**이다(Codex가 꺼져 있으면 라운드 개념 자체가 없다). `mode === 'enforce'`이고 `count >= cap`이면 spawn 없이 `{ classification: 'round-cap-reached', blocking: false, advisory: false, durationMs: 0, roundsSoFar, cap, pinnedBy }` 반환. spawn 후 `classification === 'ok'`일 때만 `recordRound`(DD3). 정책 과 원장 모듈 로드 실패는 `resolveDisabledPolicy`와 같이 **fail-open** 과 loud stderr.
- **Mirror**: `plugins/mccp/scripts/lib/codex-invoke.js:201-232`(로드 실패 fail-open) 과 `:275`(disabled의 비차단 반환 형태)
- **Validate**: `node --test plugins/mccp/scripts/lib/review-rounds/tests/enforcement.test.js` — cap 1 과 원장 1건에서 spawn 0회 과 classification `round-cap-reached` 과 `ok` 응답 1회 후 count 1 과 `timeout` 응답 후 count 0(DD3) 과 `observe`에서 거부 없이 기록만

### Task 5: 패널 채널 강제

- **Action**: `plan-review/cli.js`의 `emit-workflow-args`가 args를 쓰기 **전에** 같은 판정을 한다. `enforce` 과 초과면 exit 12 과 사유를 stderr에 명시. 성공 emit 시 `recordRound({channel: 'panel'})`. 5.2c의 기존 `EMIT_EXIT` 비영점 분기가 이미 예약 반환 과 `record --halt-stage 5.2c-emit` 과 exit 12을 하므로 **본문 변경은 사유 문구 한 줄뿐**이다.
- **Mirror**: `plugins/mccp/commands/plan.md` 5.2c의 `EMIT_EXIT` 분기
- **Validate**: `node --test plugins/mccp/scripts/lib/plan-review/tests/*.test.js` 과 신규 enforcement test — cap 도달 시 `workflow-args.json` **미생성** 과 exit 12

### Task 6: receipt가 진짜 라운드 수를 봉인

- **Action**: `write.js`가 `(gate, decision)` 원장 count를 읽어 count가 1 이상이면 `resolution.rounds = count`(DD8), 0이면 legacy `1`. `--resolution-file`이 명시 `rounds`를 실었고 원장 count와 다르면 **exit 12 과 두 수를 모두 출력**(DD9). present-only 3필드 stamp: `meta.round_ledger_count`(0 포함 진짜 수) 과 `meta.round_cap` 과 `meta.round_cap_pinned_by`. `makeSkeleton` **미포함**(§3.12 tracked ship corpus hash 안정성).
- **Mirror**: `plugins/mccp/scripts/receipt/write.js`의 `codex_verdict` present-only 처리 과 `plugins/mccp/scripts/receipt/schema.js`의 present-only 형태 계약
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/round-ledger-fields.test.js` 과 `node --test plugins/mccp/scripts/receipt/tests/*.test.js` 전량 green(기존 receipt test가 `rounds: 1`을 단언하는 곳은 원장 부재 경로라 불변임을 확인)

### Task 7: 세 명령 본문 배선

- **Action**: 각 게이트의 **가장 이른 지점**(plan은 Phase 5.0 이전, prp-implement는 Phase 2.5 진입, pr은 Phase 0)에서 `review-rounds/cli.js seal`을 1회 호출. `codex-invoke` 응답 처리 분기에 `round-cap-reached`를 추가해 `CODEX_VERDICT="divergent"` 과 `Open Questions: DIVERGENT_UNRESOLVED` 주석으로 매핑. 기존 "Repeat up to `$ROUND_CAP` rounds" 산문은 **남기되** 그 아래에 "이 캡은 이제 산문이 아니다 — 초과 호출은 `round-cap-reached`로 반환되고 Codex는 발화하지 않는다"를 명시.
- **Mirror**: `plugins/mccp/commands/pr.md:560-578`(자식 프로세스 export 지점) 과 `plugins/mccp/commands/plan.md` 5.2z의 `CODEX_CLASS` 분기
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/round-cap-command-body.test.js` — 세 본문 각각에 seal 호출 1건 과 `round-cap-reached` 분기 1건 과 seal이 첫 `codex-invoke` 호출보다 **앞선 위치**에 있는지(정적 위치 단언, `review-single-pass-command-body.test.js` 방식)

### Task 8: 문서와 사실 정정

- **Action**: `docs/environment/gates.md`에 `MCCP_ROUND_LEDGER` 절 과 `**값별 결과**` 블록(L12 대상) 과 `docs/ENVIRONMENT.md` 색인 행 과 `docs/gate-design.md#round-cap-enforcement` 앵커 과 `.gitignore`. CLAUDE.md는 두 곳: §3.15 "주장하지 않는 것"에서 "캡 계산만 기계화됐다"를 M3 이후 사실로 정정하고, §3.16의 "캡 1 고정, 이미 settings.json에 설정"을 G7 실측에 맞춘다 — **문서를 값에 맞출지 값을 문서에 맞출지는 사람이 정한다**(둘 다 정당하고, 정하지 않고 넘어가면 M3이 강제하는 캡과 문서가 어긋난 채로 착지한다).
- **Mirror**: M2가 만든 상세 문서 블록 형식 — `docs/environment/review.md`의 `MCCP_PLAN_REVIEW` 절
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` L1~L12 green 과 `node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md`

### Task 9: 버전 4면 동기 과 PRD 종결 기록

- **Action**: §3.7대로 `plugin.json` 과 `html.js` page-foot 과 `markdown.js` derived 줄 과 `CHANGELOG.md`(`currently` 노트 과 항목 본문의 bump 서술). **target은 `/mccp:pr` 진입 직전에 재계산한다** — 이 브랜치는 이번 머지에서만 이미 두 항목을 상향했다(M1 1.30.2 에서 1.32.7 과 M2 1.32.3 에서 1.32.8). PRD의 M3 행을 `complete`로, 라운드 캡 Open Question에 실측 결과를 append.
- **Mirror**: 이 브랜치 `CHANGELOG.md`의 M1 과 M2 항목 §3.7 노트
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 순수 오라클 과 원장 과 강제
node --test plugins/mccp/scripts/lib/review-rounds/tests/*.test.js
node --test plugins/mccp/scripts/lib/tests/review-single-pass.test.js
node --test plugins/mccp/scripts/lib/tests/round-cap-command-body.test.js

# receipt 축
node --test plugins/mccp/scripts/receipt/tests/*.test.js

# 계약 정합 (M1 과 M2가 세운 L1~L12)
node plugins/mccp/scripts/lib/env-contract/lint.js
node plugins/mccp/scripts/lib/env-contract/cli.js doctor --json

# 회귀
node --test plugins/mccp/scripts/lib/env-contract/tests/*.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
node --test plugins/mccp/scripts/lib/plan-review/tests/*.test.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 원장 버그가 저장소의 **모든** 게이트를 차단한다 | 중간 | `MCCP_ROUND_LEDGER=observe`로 기록만 하는 단계적 배포 경로를 같은 milestone에 함께 넣는다(DD7). 그리고 모듈 로드 실패는 fail-open으로 강등(Task 4) |
| 일시적 Codex 장애가 라운드를 소모해 그 decision이 영구 차단된다 | 중간 | DD3 — `classification === 'ok'`일 때만 계상. transport 실패는 이미 `blocking=true`라 폭주 위험이 없다. `enforcement.test.js`가 `timeout` 응답 후 count 0을 단언 |
| `round-cap-reached`를 `blocking=true`로 잡으면 정상 종료가 장애로 보고된다 | 낮음 | DD4 — 비차단 과 divergent 매핑. divergent는 cross-gate dedupe를 열지 않으므로 dual-review는 보존 |
| 봉인이 자식 프로세스에 안 닿아 M3이 자기 결함에 물린다 | 중간 | DD2 — env가 아니라 `<git-dir>` 봉인을 읽는다. `seal.test.js`가 "env를 비워도 봉인값"을 단언 |
| `resolution.rounds` 파생이 기존 receipt test를 붉힌다 | 중간 | DD8 — 원장 부재(count 0) 경로는 legacy `1`로 불변. 기존 test는 원장 없는 fixture이므로 그대로 통과할 것으로 예상하되, Task 6 Validate가 receipt test **전량**을 돌려 확인 |
| decision slug 단위 누적이라 정당한 재실행이 캡에 걸린다 | 중간 | 그것이 M3의 목적이다(DD6). 회복 경로는 `MCCP_GATE_ROUND_CAP` 상향(최대 3) 또는 divergent 수용 후 진행이며, 둘 다 문서화된 감사 가능 행동이다. 캡 소진 메시지가 두 경로를 모두 명시한다 |
| 원장이 gitignored라 다른 워크트리에서 count가 0부터 시작한다 | 낮음 | 의도된 동작이다 — 워크트리는 독립 시도다. `gate-design.md` 앵커에 명시 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] `MCCP_GATE_ROUND_CAP=1`로 고정한 상태에서 같은 decision에 대해 `codex-invoke adversarial-review`를 **2회** 호출하면 2회차는 spawn 없이 `round-cap-reached`를 반환한다 (`durationMs=0` 실측)
- [ ] 같은 조건에서 `emit-workflow-args` 2회차가 `workflow-args.json`을 만들지 않고 exit 12로 끝난다
- [ ] 게이트와 경로를 실제로 1회 완주하고 산출물을 확인 — **라이브 `/mccp:plan` 1회를 완주해** (a) `.claude/state/review-rounds/mccp-plan-codex__<slug>.json`이 실제로 생성되고 (b) 그 receipt의 `resolution.rounds`가 원장 count와 같으며 (c) `meta.round_ledger_count` 과 `meta.round_cap` 과 `meta.round_cap_pinned_by` 3필드가 stamp된다. 단위 test 통과만으로 이 항목을 체크하지 않는다
- [ ] `MCCP_ROUND_LEDGER=observe`에서 같은 2회 호출이 **둘 다 spawn**하고 원장에는 2건이 기록된다 (kill switch가 실재함을 실증)
- [ ] CLAUDE.md §3.16의 캡 값 서술과 `.claude/settings.json`의 실제 값이 일치한다 (G7 종결)

## Design Critique

- 트리거: axis (a) 탐지기 positive — `impeccable-detect.js detect --mode plan`이 `design_signal=true`, `signal_files`에 `plugins/mccp/scripts/lib/renderer/html.js` 와 `plugins/mccp/scripts/lib/renderer/markdown.js`
- 해소된 call form: `Skill(impeccable, ...)` (source `user`, v4.0.4, `~/.claude/skills/impeccable/SKILL.md`, shadowed=false)
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료
- 라운드: 1 (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` cap=2, R0에서 종료)
- verdict: `CONVERGED`

이 plan이 도입하는 디자인 표면은 하나뿐이다 — 대시보드 렌더러 두 곳의 version
리터럴(`html.js:1419` page-foot 과 `markdown.js:163` derived 줄)을 `plugin.json`
bump에 맞추는 Task 9의 동기. 새 컴포넌트·레이아웃·색·타이포그래피는 없다.

| Output Constraint | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | 위반 없음 | 두 표면 모두 heading을 도입하지 않는다 — `<footer role="contentinfo">` 1줄 과 markdown emphasized 1줄 |
| 강조색 화면당 1개 | 위반 없음 | `.page-foot`는 `var(--faint)` 전용(`html.js:641`). `--accent`는 `:focus-visible` outline(`:645`)에만 쓰이며 이 변경이 accent를 추가하지 않는다 |
| raw markdown marker 금지 | 위반 없음 | HTML 쪽은 렌더되는 `<code lang="en">`, markdown 쪽 `_..._`는 뷰어가 렌더하는 소스다. version 리터럴 교체가 marker를 도입할 경로가 없다 |
| 한 화면 항목 수 상한 | 해당 없음 | footer는 `list-of-N` 섹션이 아니다 |

version 리터럴이 두 곳에 하드코딩돼 있다는 사실 자체는 Output Constraints 축이
아니라 §3.7의 surface drift 축이며, 이미 `renderer/tests/i18n-surface.test.js`가
기대값을 `plugin.json`에서 파생해(`:94`) 붉게 잡는다 — Task 9 Validate가 그
test다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 아직 없으므로
어떤 impeccable 명령도 **호출하지 않는다** — 아래는 구현자를 위한 체크리스트다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
