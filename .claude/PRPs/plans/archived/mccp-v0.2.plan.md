# Plan: mccp v0.2 — Stop-loop 자동화 + 연속성 + 단일 entry

**Source**: 사용자 발화 (`/plan v0.2 구현을 위해 계획을 세우자. codex와 dual reviewer 방식으로 진행할게.`) + 메모리 두 건([mccp-bootstrap-progress.md](../../memory/mccp-bootstrap-progress.md), [mccp-direction-decision.md](../../memory/mccp-direction-decision.md)).
**Selected Phase**: v0.2 첫 사이클 — brainstorming §6 권장 아키텍처의 _claude-review-loop 도입 → STATE.md 연속성 → 단일 entry → dual-reviewer escalation_ 순서로 4 모듈 전체 합의.
**Complexity**: **Large** (신규 hook 1, 신규 명령 1, 신규 script 6개 영역, 기존 hooks.json/receipt 시스템 비파괴 통합, dual-reviewer escalation 경로 신설).
**Verification mode**: Codex adversarial review + santa-loop dual reviewer convergence (사용자 명시 요청).

---

## 1. Summary

v0.1은 receipt chain으로 "게이트 통과 증명"만 자동화했다. 사용자가 brainstorming(§3)에서 적은 진짜 통증 — _"사람이 감시해야만 다음으로 넘어가는 지점"_ — 은 그대로 남아 있다. v0.2는 그 지점을 5개 모듈로 끊는다:

1. **Stop-loop**: Claude가 응답을 끝내려는 순간을 hook으로 가로채 **lint/typecheck/test/e2e fail-fast 게이트** → 실패 시 `fix-task.md`로 변환해 다음 응답에 자동 진입. 최대 2회 bounded. Codex 결과물 diff 검토는 **opt-in**(`MCCP_STOP_LOOP_CODEX=1` 명시 시에만) — Codex 1라운드 AUTO-CRITICAL "external destination" 권고 + 사용자 결정 옵션 B 반영.
2. **STATE.md 연속성**: PreCompact/SessionStart hook 한 쌍으로 컨텍스트·세션 경계를 가로질러 task 상태를 자동 인계. brainstorming §2 통증("세션 중단 후 떠넘김") 직격.
3. **Auto-handoff (사용자 추가 요구 + Codex F3 hard ceiling 통합)**: 누적 비용 임계값 도달 시 자동 세션 전환. **$50 notice** → stderr inject만 / **$80 soft** → 다음 safe event(Stop-loop pass / receipt write / PR 생성 직후)에서 handoff / **$100 hard ceiling** → safe event 없어도 PreCompact 직전 강제 handoff(STATE.md에 `unsafe_checkpoint=true` 표기). fix-task-first 정책은 _같은 세션에서_ 유지(사용자 결정 — Codex F4 권고 reject). compact 대신 새 세션 spawn으로 환각·품질 저하 회피.
4. **단일 entry `/mccp:work` (v0.2는 orchestration shell)**: "feature X 구현해" 한 줄로 PRD co-creation → plan → implement → Stop-loop → PR까지 inline 위임. **v0.2에서는 명령 wrapper 수준**으로 한정 — 진정한 single-flow automation(human-in-the-loop chokepoint 0건)은 v0.3 commit. Reviewer B B5 권고 반영 — README + Summary에 명시.
5. **dual-reviewer escalation**: Codex 합치 실패 또는 CRITICAL Open Question 시 santa-loop(adversarial dual-review) 진입 권고 표시. 사용자 명시 요청 사항.

v0.1 receipt chain은 **변경 없이 보존**한다. Stop-loop은 implement-codex receipt _다음에_ 한 번 추가로 도는 "결과물 검토" 단계로 정의한다 — plan-codex 가정 검토 vs Stop-loop 결과물 검토는 brainstorming §3 통증 "검토 시점 오류"를 동시에 잡는다.

도입 순서는 brainstorming §6 ordering 권장을 따른다: **Stop-loop 1주 안정화 → 그 다음 STATE.md** (둘 다 동시에 짓다가 ECC처럼 "동작 흐름 미이해 설계" 함정 재발 방지). 본 plan은 그 1주를 **두 sprint 묶음(S8 + S9)으로 명시 분리**한다.

---

## 2. Phase Map

| Sprint | Module | Why now |
|---|---|---|
| **S8** | Stop-loop 토대(Codex bridge + quality runner + bounded counter + fix-task generator) | 가장 큰 통증 직격, 단독 검증 가능 |
| **S9** | Stop-loop 안정화 (1주 dogfooding) | brainstorming §6 ordering 권장 — 위에 layer 얹기 전 안정화 강제 |
| **S10a** | STATE.md 연속성 (PreCompact + SessionStart writer/injector) | S8/S9 안정화 후만 진입. Codex F1 modify 반영 — auto-handoff와 분리 |
| **S10b** | **Auto-handoff** (breakpoint detector + session spawner + Stop-loop handoff 통합) | S10a STATE.md 안정화 + dogfood canary 통과 후만 진입. Codex F1 권고 |
| **S11** | 단일 entry `/mccp:work` | S8-S10b 모두 도입된 뒤에야 의미 있음 |
| **S12** | dual-reviewer escalation (santa-loop 통합) | 모든 hook이 escalate 트리거를 알아야 함 |

**S9 canary 정책** (Codex F2 modify + Reviewer A A1 강화 반영): 기본 `MCCP_STOP_LOOP=observe` 유지, 단 S9 후반 1주 중 최소 1개 worktree는 `MCCP_STOP_LOOP=enforce` canary로 운영. **S10a 진입 조건** = `enforce` 통과 receipt **5건 누적 AND 그 중 ≥1건은 fail+fix-task cycle 완료** (단순 5회 무사고 통과는 design fitness 미증명 — Reviewer A A1 권고). 카운터는 §5 Task 10에 정의한 metrics subcommand로 측정.

S9는 **별도 작업 sprint가 아니라 "코드 동결 + dogfood + 회귀 수집"** 기간이다. 본 plan에서는 S9에 진입할 검증 체크리스트만 정의하고, S10 진입 조건도 명시한다.

---

## 3. Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Hook script 구조 | [receipt-prompt.js:1](../../plugins/mccp/scripts/hooks/receipt-prompt.js) | stdin JSON 파싱 + `MCCP_SKIP_RECEIPT` 우회 + 결정 JSON stdout |
| Hook script flag awareness | [run-with-flags.js](../../plugins/mccp/scripts/hooks/run-with-flags.js) | `minimal,standard,strict` profile 게이팅. v0.2 Stop hook도 `MCCP_STOP_LOOP=off/observe/enforce` 3단 |
| Subcommand CLI dispatcher | [receipt/cli.js](../../plugins/mccp/scripts/receipt/cli.js) | `quality run lint`, `quality run all`, `state write`, `state read` 패턴 |
| Inline command Phase 구조 | [commands/plan.md](../../plugins/mccp/commands/plan.md) | Phase 1-5 + 끝에 게이트 phase (v0.2의 `/mccp:work`도 동일 패턴) |
| hooks.json `${CLAUDE_PLUGIN_ROOT}` resolver | [hooks.json:30-40](../../plugins/mccp/hooks/hooks.json) | 새 hook entry도 동일 inline node bootstrap 재사용 |
| Test 스타일 | [receipt/tests/decision.test.js](../../plugins/mccp/scripts/receipt/tests/decision.test.js) | `node --test`, 결정론적 fixture, helpers.js 공유 |
| Atomic file write | [receipt/pr-body.js:writeBody](../../plugins/mccp/scripts/receipt/pr-body.js) | staging → rename. STATE.md / fix-task.md / loop-counter.json 모두 동일 |
| Deterministic 도출 | [receipt/decision.js](../../plugins/mccp/scripts/receipt/decision.js) | task fingerprint hash 계산 시 같은 결정론 원칙 적용 |
| Cross-gate dedupe 참조 | [receipt/dedupe.js](../../plugins/mccp/scripts/receipt/dedupe.js) | Stop-loop이 implement-codex receipt와 합치된 결정 재검토 skip하는 데 동일 기법 |
| 누적 토큰·비용 측정 | [scripts/hooks/ecc-metrics-bridge.js](../../plugins/mccp/scripts/hooks/ecc-metrics-bridge.js) | breakpoint-detector가 동일 bridge 파일 read해 200k 초과 판정 |
| 컨텍스트 임계값 패턴 | [scripts/hooks/ecc-context-monitor.js](../../plugins/mccp/scripts/hooks/ecc-context-monitor.js) | 35%/25% 임계 + debounce 패턴. v0.2는 누적 토큰 임계 + breakpoint AND 조건으로 확장 |
| tmux 자동 spawn | [scripts/hooks/auto-tmux-dev.js](../../plugins/mccp/scripts/hooks/auto-tmux-dev.js) | session-spawner.js가 동일 send-keys 패턴 재사용 + Windows `Start-Process` 분기 추가 |

---

## 4. Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/hooks/stop-review-loop.js` | CREATE | Stop hook 본체 — Codex diff 검토 + quality runner 호출 + fix-task 작성 + 종료 차단/허용 결정 |
| `plugins/mccp/scripts/quality/runner.js` | CREATE | lint→typecheck→test→e2e fail-fast chain. Subcommand `run all/lint/typecheck/test/e2e` |
| `plugins/mccp/scripts/quality/detect.js` | CREATE | package.json scripts / tsconfig.json / playwright.config.* 감지. 없으면 graceful skip |
| `plugins/mccp/scripts/quality/cli.js` | CREATE | `node ... quality/cli.js run <stage>` entry. receipt/cli.js 미러 |
| `plugins/mccp/scripts/quality/tests/runner.test.js` | CREATE | runner 단위 테스트 |
| `plugins/mccp/scripts/quality/tests/detect.test.js` | CREATE | detect 단위 테스트 |
| `plugins/mccp/scripts/state/state-writer.js` | CREATE | PreCompact용. 현재 task 상태(Goal/Plan/Done/InProgress/Next/Decisions/Questions) → STATE.md |
| `plugins/mccp/scripts/state/state-injector.js` | CREATE | SessionStart용. STATE.md 있으면 첫 prompt에 inject |
| `plugins/mccp/scripts/state/fix-task.js` | CREATE | Stop-loop의 review 실패 결과 → fix-task.md 변환 + SessionStart inject 큐에 추가 |
| `plugins/mccp/scripts/state/loop-counter.js` | CREATE | per-task bounded counter (task fingerprint hash 기준). atomic rename. max 2 |
| `plugins/mccp/scripts/state/breakpoint-detector.js` | CREATE | **신규**. 입력: 누적 비용(USD, `ecc-metrics-bridge` read) + 최근 lifecycle 이벤트 (stop_loop_pass / receipt_write / pr_created). 출력: `{tier: notice\|soft\|hard\|none, shouldHandoff, reason, unsafeCheckpoint, nextChunk?}`. 규칙: `$50 = notice`(stderr만), `$80 = soft`(safe event AND within 60s = handoff), `$100 = hard ceiling`(safe event 없어도 handoff, `unsafe_checkpoint=true`). |
| `plugins/mccp/scripts/state/session-spawner.js` | CREATE | **신규**. tmux 환경 감지 시 **격리 명령** `tmux new-window -t <current-session> -c <repo-root> -n mccp-<repoHash> -- 'claude'` 사용 (Codex F5 reject 반영 — send-keys panel 라우팅 금지). Windows 시 `Start-Process powershell -ArgumentList "-NoExit","-Command","claude" -WorkingDirectory <repo-root>`. 둘 다 안 되면 notification fallback. `MCCP_AUTO_HANDOFF=spawn\|notify\|off` 토글. `<repoHash>` = repo path sha256 12자로 worktree 격리. |
| `plugins/mccp/scripts/hooks/ecc-context-monitor.js` | UPDATE | **사용자 결정 반영** — COST_NOTICE_USD 5→50, COST_WARNING_USD 10→80, COST_CRITICAL_USD 50→100. breakpoint-detector가 동일 상수 read해 일관 임계값 유지. **Reviewer A A2 권고 부분 수용**: 기존 `ecc-context-monitor` warning 동작 의미가 동시 상향됨(breaking change). §7 Risks에 명시. breakpoint-detector는 신규 named export(`getHandoffCostThresholds()`)로 import해 silent rebase 표면화. |
| `plugins/mccp/scripts/state/dedupe-key.js` | CREATE | **Reviewer A A5 권고**. cross-gate dedupe key 단일 source — `decision_id` 형식(`work-<fingerprint>` vs `BRANCH_BASED`)과 무관하게 plan path SHA12 + decision slug normalization으로 매칭. docs/v0.2-state-schema.md가 본 함수를 정식 진실원으로 참조. |
| `plugins/mccp/scripts/state/cli.js` | CREATE | `state write/read/clear/counter/breakpoint/spawn` subcommand |
| `plugins/mccp/scripts/state/tests/*.test.js` | CREATE | state 모듈 6개 단위 테스트 (writer/injector/fix-task/loop-counter/breakpoint-detector/session-spawner) |
| `plugins/mccp/scripts/lib/codex-bridge.js` | CREATE | `Skill(codex:adversarial-review)` 결과 파싱 helper. convergence/divergent/auto-fallback 분류. receipt-prompt.js 재사용 |
| `plugins/mccp/scripts/lib/tests/codex-bridge.test.js` | CREATE | bridge 단위 테스트 (fixture: Codex 응답 stub) |
| `plugins/mccp/hooks/hooks.json` | UPDATE | Stop entries 맨 앞에 `mccp:stop:review-loop` 추가. Stop entries 두 번째에 `mccp:stop:auto-handoff` 추가 (review-loop pass 후 발화). PreCompact 맨 뒤에 `mccp:pre-compact:state-writer` 추가. SessionStart 맨 앞에 `mccp:session-start:state-injector` 추가 |
| `plugins/mccp/commands/work.md` | CREATE | 단일 entry. PRD co-creation → plan → prp-implement → Stop-loop dogfood → pr까지 inline 본문 |
| `plugins/mccp/commands/work.md` Phase 6 | INLINE | dual-reviewer escalation 절차 (santa-loop 호출 조건/방법) |
| `plugins/mccp/scripts/receipt/aliases.js` | UPDATE | `mccp:work` alias 등록 (produces/requires/design 빈 배열 — orchestrator는 receipt chain 진입 안 함) |
| `plugins/mccp/scripts/receipt/decision.js` | UPDATE | `mccp:work`는 BRANCH_BASED도 PLAN_PATH_BASED도 아닌 ORCHESTRATOR_COMMANDS 신규 그룹 |
| `plugins/mccp/scripts/receipt/tests/aliases.test.js` | UPDATE | `mccp:work` 케이스 추가 |
| `docs/v0.2-architecture.md` | CREATE | 진실원 디자인 문서 — 사용자 통증 → 모듈 매핑 표, Stop-loop sequence diagram, STATE.md 스키마, fix-task.md 스키마, **auto-handoff sequence diagram + 우선순위 정책 (fix-task > handoff)**, dual-reviewer escalation 트리거 |
| `docs/v0.2-state-schema.md` | CREATE | STATE.md / fix-task.md / loop-counter.json / **next-chunk frontmatter** 정식 스키마 (Claude가 매번 형식 일관 유지하도록). **Reviewer A A5 필수 추가 섹션**: cross-gate dedupe key 정의 — `scripts/state/dedupe-key.js` 함수 시그니처 + 매칭 규칙 + plan-codex/implement-codex/stop-loop-codex 3종 receipt 사이 어떻게 같은 결정으로 정합되는지 explicit |
| `README.md` | UPDATE | v0.2 섹션 추가 — Stop-loop on/off/observe 토글, MCCP_STOP_LOOP env var, **MCCP_STOP_LOOP_CODEX=1 (opt-in Codex 호출)**, **MCCP_AUTO_HANDOFF=spawn\|notify\|off**, **cost 임계값은 ecc-context-monitor.js COST_*_USD 상수에 일원화 (50/80/100)**, /mccp:work 사용법 |
| `.gitignore` | UPDATE | `.claude/state/loop-counter.json` 제외 (fix-task.md/STATE.md는 git 추적 — brainstorming §6 STATE.md 위치 안) |

---

## 5. Tasks

### Sprint 8 — Stop-loop 토대 (S8 끝나면 1주 dogfood 진입)

#### Task 1: `docs/v0.2-architecture.md` 작성
- **Action**: brainstorming §6 권장 아키텍처를 mccp 어휘로 리포팅. Stop-loop sequence diagram(ASCII), 모듈별 책임 경계, 기존 receipt chain과의 교차점, `MCCP_STOP_LOOP=off/observe/enforce` 의미.
- **Mirror**: [docs/gate-design.md](../../docs/gate-design.md) (학습 노트 스타일)
- **Validate**: 사용자 review (Phase 6 Codex review 이후)

#### Task 2: `scripts/quality/detect.js` + tests
- **Action**: package.json scripts에서 lint/typecheck/test/e2e 명령 후보 감지. tsconfig.json 존재 시 typecheck enabled. playwright.config.* 존재 시 e2e enabled. 결과는 `{lint?, typecheck?, test?, e2e?}` 객체.
- **Mirror**: [scripts/receipt/decision.js](../../plugins/mccp/scripts/receipt/decision.js) 의 결정론적 도출.
- **Validate**: `node --test plugins/mccp/scripts/quality/tests/detect.test.js`. 4가지 프로젝트 fixture(빈 dir / package.json only / TS+test only / 전부).

#### Task 3: `scripts/quality/runner.js` + cli.js + tests
- **Action**: detect 결과 받아 lint → typecheck → unit test → e2e 순차 실행. 각 단계 fail-fast. stdout JSON: `{stages: [{name, status, exitCode, durationMs, output}], passed: bool}`. e2e는 default skip (env `MCCP_STOP_LOOP_E2E=1`일 때만).
- **Mirror**: [scripts/receipt/cli.js](../../plugins/mccp/scripts/receipt/cli.js) subcommand dispatcher
- **Validate**: tests + manual: `node plugins/mccp/scripts/quality/cli.js run all` → 본 repo에서 정상 동작 (현재 repo는 lint/typecheck 후보 없음 → 모든 stage `skipped`)

#### Task 4: `scripts/state/loop-counter.js` + tests
- **Action**: `.claude/state/loop-counter.json` = `{task_fingerprint: {count, lastAt, fixTaskHash}}`. task_fingerprint = first user prompt 첫 200자 sha256. atomic rename write. max=2.
- **Mirror**: [scripts/receipt/pr-body.js writeBody](../../plugins/mccp/scripts/receipt/pr-body.js)
- **Validate**: tests (concurrent write 시뮬레이션 포함), `node plugins/mccp/scripts/state/cli.js counter --task <hash> --bump`

#### Task 5: `scripts/lib/codex-bridge.js` + tests
- **Action**: `Skill(codex:adversarial-review)` 결과 파싱. 입력: skill response 문자열 + focus text. 출력: `{verdict: converged|divergent|critical|unavailable, rounds, openQuestions, summary}`. auto-fallback 트리거 4종(error: setup_required / not authenticated / 60s timeout / rate_limit) 인식. CRITICAL 카탈로그(secret/data loss/auth bypass/external destination/crypto key) 패턴 감지.
- **Mirror**: 기존 receipt-prompt.js의 분류 패턴 + ecc-command-gates.md §0 카탈로그
- **Validate**: 5종 fixture(converged / divergent / critical-secret / timeout / rate-limit) — tests

#### Task 6: `scripts/state/fix-task.js` + tests
- **Action**: 입력: Codex review summary + quality runner failed stage. 출력: `<repo>/.claude/state/fix-task.md` (스키마 § Title / Why / Failures / Next Actions / Originating decisions). atomic rename. SessionStart inject 큐에 fingerprint 등록.
- **Mirror**: 위 atomic write
- **Validate**: tests + 수동 검수

#### Task 7: `scripts/hooks/stop-review-loop.js`
- **Action**: Stop hook 본체. 순서: ① raw stdin 통과 그대로 보존 → ② `MCCP_STOP_LOOP` 값 확인 (`off` → 그대로 통과, `observe` → 검토만 stdout에 print, `enforce` → 차단/허용) → ③ git diff(working tree + HEAD)가 비어 있으면 즉시 통과 → ④ loop-counter 확인 max 도달 시 사람 개입 메시지 + 통과 → ⑤ **quality runner 먼저** 호출 (lint→typecheck→test→e2e) → ⑥ **`MCCP_STOP_LOOP_CODEX=1`인 경우만** Codex bridge 호출(사용자 결정 — opt-in 강등). 미설정 시 Codex skip → ⑦ pass면 통과 + counter reset, fail면 fix-task.md 작성 + counter++ + `{"decision": "block", "reason": "<one line>"}` JSON stdout으로 차단.
- **Mirror**: 기존 Stop hook entries([hooks.json:285-360](../../plugins/mccp/hooks/hooks.json))의 inline node bootstrap + stdin pass-through 패턴.
- **Validate**: stub-input 7 path: ① off → pass, ② enforce + no diff → pass, ③ enforce + quality pass (codex opt-out) → pass + counter reset, ④ enforce + quality fail → block + fix-task + counter=1, ⑤ enforce + STOP_LOOP_CODEX=1 + codex converged → pass, ⑥ enforce + counter=2 → human-takeover meta + pass, ⑦ enforce + STOP_LOOP_CODEX=1 + codex CRITICAL → block + dual-reviewer escalation 트리거 메시지

#### Task 8: `hooks.json` 통합
- **Action**: Stop entries 맨 앞 (`mccp:stop:review-loop`) — 다른 6 Stop entry보다 먼저 발화 (차단 시 그 이후는 의미 X). 기존 `stop:format-typecheck`/`stop:check-console-log`가 review-loop 안에 batch 흡수되는지 검토 — 결론: 별도 보존 (관심사 분리, review-loop은 Codex 검토 + quality chain만 책임).
- **Mirror**: [hooks.json:285-296](../../plugins/mccp/hooks/hooks.json) (Stop entry 형식)
- **Validate**: `node -e` bootstrap + raw stdin 통과 확인. JSON 파싱 OK.

#### Task 9: S8 통합 회귀 테스트
- **Action**: 153/153 receipt tests + 신규 4 모듈 tests 통과. `MCCP_STOP_LOOP=enforce`로 본 repo에서 dummy edit 시뮬레이션.
- **Validate**: `node --test plugins/mccp/scripts/{receipt,quality,state,lib}/tests/*.test.js`

### Sprint 9 — Stop-loop 1주 dogfood (코드 동결, 회귀 수집)

#### Task 10: dogfood 진입 체크리스트 작성 + metrics emit subcommand
- **Action**: `docs/v0.2-dogfood-checklist.md` + `scripts/state/cli.js metrics --since <ts> [--gate <id>]` 신규 subcommand (Reviewer B B1+B4 권고 — aspirational 메트릭 → 측정 가능 메트릭으로 격상).
- **측정 지표**:
  - Stop-loop 발화 빈도 (per session) — `node scripts/state/cli.js metrics --since <ts> --gate stop-review-loop`
  - Codex bridge auto-fallback 비율 — bridge 호출 결과 로그 집계
  - quality runner stage별 fail rate
  - bounded counter max 도달 빈도
  - false positive 사례 (사용자 수동 override 횟수, `MCCP_STOP_LOOP=off` 토글 카운트로 proxy)
  - fix-task.md content quality 만족도 (수동 평가 1-5)
  - **(Reviewer A A3 신규)** Codex가 잡았을 quality-pass-but-bad-diff 사례 % — canary worktree에서 `MCCP_STOP_LOOP_CODEX=1` 운영 시 측정. 0%면 opt-in 강등 결정이 적절했음을 confirm, >10%면 enforce default로 환원 검토
  - **(Reviewer A A1 신규)** S10a 진입 게이트 직접 측정: `scripts/state/cli.js metrics --gate stop-review-loop --mode enforce --include-fix-task-cycle`로 fail+fix 사이클 receipt 카운트
- **Validate**: 1주 후 회귀 정리. **S10a 진입 조건** (강화): 누적 enforce receipt ≥5건 AND fail+fix cycle ≥1건 AND counter max 도달 < 10% AND auto-fallback < 30% AND false positive < 20%.

#### Task 11: S9 회귀 사례 반영
- **Action**: dogfood 중 발견한 버그/오작동 surgical fix. 새 기능 추가 금지. 구조 변경 시 본 plan에 follow-up amendment로 표기.

### Sprint 10 — STATE.md 연속성

#### Task 12: STATE.md 스키마 확정 + `docs/v0.2-state-schema.md`
- **Action**: 섹션 Goal / Plan (paths) / Done / In Progress / Next Step / Last Decision / Open Questions / Last Updated. 각 섹션 line-bounded (Goal ≤ 3 lines 등). Markdown front-matter `state_version: 1` 강제로 parser 안정성.
- **Mirror**: brainstorming §6 STATE.md 원안 + ECC-receipt JSON schema의 versioning 규율

#### Task 13: `scripts/state/state-writer.js` + tests
- **Action**: PreCompact stdin에서 transcript_path 받아 마지막 N turn(default 50) 요약 후 STATE.md 작성. Claude가 자유서술 안 하도록 강제 템플릿 + diff merge (기존 STATE.md 덮어쓰기 X, sections merge).
- **Mirror**: atomic write + 기존 [pre-compact.js](../../plugins/mccp/scripts/hooks/pre-compact.js) 입력 형식
- **Validate**: tests + 수동: 대화 turn 3개 fixture로 STATE.md generate 확인

#### Task 14: `scripts/state/state-injector.js` + tests
- **Action**: SessionStart에서 STATE.md 존재 시 첫 user prompt 직전에 `<system-reminder>STATE.md (from previous session)...</system-reminder>` 형태로 inject. fix-task.md 큐도 함께 inject.
- **Mirror**: [session-start-bootstrap.js](../../plugins/mccp/scripts/hooks/session-start-bootstrap.js)
- **Validate**: stub-input 3 path: ① STATE.md 없음 → 통과, ② STATE.md only → inject, ③ STATE.md + fix-task.md → 둘 다 inject

#### Task 14b (S10b): `scripts/state/breakpoint-detector.js` + tests
- **Action**: 입력: `ecc-metrics-bridge`의 누적 비용(USD) + 최근 lifecycle 이벤트(stop_loop_pass / receipt_write / pr_created / fix_task_applied)의 timestamp. 출력: `{tier: notice|soft|hard|none, shouldHandoff, reason, unsafeCheckpoint, nextChunk?}`. 임계값은 [ecc-context-monitor.js](../../plugins/mccp/scripts/hooks/ecc-context-monitor.js)의 `COST_NOTICE_USD=50` / `COST_WARNING_USD=80` / `COST_CRITICAL_USD=100` 상수 재사용 (단일 소스). 규칙:
  - `< $50` → `tier=none, shouldHandoff=false`
  - `$50 ≤ x < $80` → `tier=notice, shouldHandoff=false` (stderr inject만)
  - `$80 ≤ x < $100` → `tier=soft`, `last_event in [stop_loop_pass, receipt_write, pr_created] AND within 60s`면 `shouldHandoff=true`, `unsafeCheckpoint=false` (Codex F3 권고 + 사용자 결정 통합)
  - `x ≥ $100` → `tier=hard`, `shouldHandoff=true`, `unsafeCheckpoint=true` (safe event 없어도 강제, STATE.md에 표기)
  - **fix-task pending**: 사용자 결정대로 `tier=soft`에서만 `shouldHandoff=false`로 deferred (같은 세션에서 fix 완료까지). `tier=hard`는 fix-task pending과 무관하게 강제 handoff (Codex F4 권고는 reject, 단 hard ceiling은 안전 wrapper).
- **Mirror**: [ecc-context-monitor.js](../../plugins/mccp/scripts/hooks/ecc-context-monitor.js) debounce 패턴 + session-bridge read
- **Validate**: tests 10 path (under 50 / 50-80 notice / 80-100 soft+safe / 80-100 soft+unsafe / 80-100 soft+fix-pending / >= 100 hard / >= 100 hard+fix-pending / stale safe event / **(Reviewer B B3 신규)** concurrent Stop-loop fires while handoff-lock held / **(Reviewer B B3 신규)** stale `ecc-metrics-bridge` mid-write read)

#### Task 14c (S10b): `scripts/state/session-spawner.js` + tests
- **Action**: 입력: nextChunk 문자열 + STATE.md path + handoff reason + `unsafeCheckpoint` 플래그. 동작 분기:
  - `MCCP_AUTO_HANDOFF=off` → no-op + 한 줄 로그
  - `=notify` (default) → desktop notification + stdout meta `"다음 세션 시작 권장 (claude 입력)"`. 새 spawn 안 함.
  - `=spawn` 또한 tmux 환경(`TMUX` env 존재)이면 **격리 명령** `tmux new-window -t <current-session> -c <repo-root> -n mccp-<repoHash> -- 'claude'` 사용 (Codex F5 reject 반영 — send-keys 절대 금지). Windows + `=spawn`이면 `Start-Process powershell -ArgumentList "-NoExit","-Command","claude" -WorkingDirectory <repo-root>`. 둘 다 안 되면 notify graceful fallback.
  - `<repoHash>` = repo root path sha256 12자. 다중 worktree 격리 보장.
  - **race lock**: spawn 직전 `.claude/state/handoff-lock-<repoHash>.lock` atomic create (PID + ts 기록, 5분 TTL). lock 존재 시 spawn skip + notify로 fallback.
- **Mirror**: [auto-tmux-dev.js](../../plugins/mccp/scripts/hooks/auto-tmux-dev.js) Windows 분기 패턴 (단 tmux는 send-keys 대신 new-window 사용)
- **Validate**: tests 7 path (off / notify / spawn-tmux-isolated / spawn-win32-with-cwd / spawn-lock-held / spawn-fallback-to-notify / **(Reviewer B B3 신규)** tmux env present but `claude` not on PATH → graceful fallback to notify) — child_process mock + 격리 명령 인자 정확성 assert

#### Task 14d (S10b): Stop-loop hook 확장 — handoff 통합
- **Action**: stop-review-loop.js의 review pass 직후(counter reset 후) breakpoint-detector 호출. `tier=soft AND shouldHandoff=true`면 STATE.md에 `next_chunk` frontmatter 주입 + session-spawner 호출. `tier=hard`면 fix-task.md를 _다음 세션 first task_로 next_chunk에 포함 + `unsafe_checkpoint=true` 표기 + 강제 spawn.
- **Validate**: stop-review-loop tests 신규 4 path 추가 (under $80 pass / $80-100 + safe → soft handoff / $80-100 + fix-pending → no handoff / >= $100 → hard handoff + fix-task in next_chunk)

#### Task 15: hooks.json 통합 (PreCompact + SessionStart entry 추가)
- **Action**: PreCompact 기존 `pre:compact`(`pre-compact.js`) 뒤에 `mccp:pre-compact:state-writer`. SessionStart 기존 `session:start`(`session-start-bootstrap.js`) 뒤에 `mccp:session-start:state-injector` (STATE.md `next_chunk` 있으면 첫 turn에서 그 chunk를 자동 user prompt로 inject).
- **Validate**: JSON parse OK, hook 발화 순서 OK, STATE.md `next_chunk` inject 시뮬레이션 1회

### Sprint 11 — 단일 entry `/mccp:work`

#### Task 16: `commands/work.md` 본문 작성
- **Action**: Phase 0 (PRD co-creation, plan-prd.md 패턴 차용) → Phase 1 (plan 호출, inline 위임) → Phase 2 (prp-implement 호출, inline 위임) → Phase 3 (Stop-loop 자동 발화 안내 — 본문 안에 명령 없이 hook이 발화함을 명시) → Phase 4 (pr 호출, inline 위임) → Phase 5 (handoff). 다른 mccp 명령 본문 verbatim 참조 패턴 사용 (Sprint 7의 prp-pr.md / review-pr.md alias 패턴).
- **Mirror**: [commands/plan.md](../../plugins/mccp/commands/plan.md) Phase 구조 + [commands/plan-prd.md](../../plugins/mccp/commands/plan-prd.md) Phase 0 강제 패턴 + Sprint 7 verbatim 참조 alias
- **Validate**: 본문 길이 < 600 lines, MD lint warning은 기존 명령과 동급, hook 발화 chain 시뮬레이션 (mccp:work 발화 → receipt-prompt.js skip → 본문 진행)

#### Task 17: `scripts/receipt/aliases.js` + `decision.js` 확장
- **Action**: `mccp:work` 추가 — alias produces=[], requires=[], design=[] (orchestrator라 chain 외부). decision.js에 `ORCHESTRATOR_COMMANDS = ['work']` 신규 그룹, decision_id = `work-<task_fingerprint_short>`.
- **Mirror**: Sprint 7 plan-prd 등록 패턴
- **Validate**: `aliases.test.js` 신규 케이스 3개 (mccp:work 등록 / decision_id 도출 / chain 외부 confirm)

### Sprint 12 — dual-reviewer escalation (santa-loop 통합)

#### Task 18: escalation trigger 정의 + `codex-bridge.js` 확장
- **Action**: bridge 결과의 `verdict === 'divergent'` AND `rounds >= 3` OR `verdict === 'critical'`일 때 `escalate: true` 플래그. Stop-loop hook이 이 플래그 보면 fix-task.md 본문 끝에 "## Dual Reviewer Escalation Required" 섹션 추가 + 메시지 `Next: run /santa-loop "<original prompt>"`.
- **Mirror**: ecc-command-gates.md §5 escalation 절차 (Codex 3R 합치 실패 시 santa-loop)
- **Validate**: bridge tests 2 path 추가 (3R divergent → escalate / CRITICAL → escalate)

#### Task 19: `/mccp:work` 본문에 escalation 안내
- **Action**: Phase 5 handoff에 "Stop-loop이 escalation 권고하면 santa-loop 진입 권장" 한 줄.

#### Task 20: 통합 E2E 검증
- **Action**: 실제 `claude --plugin-dir <repo>/plugins/mccp` 세션에서 더미 feature 한 개 (예: "scripts/lib/utils.js에 noop 함수 추가") 입력 → /mccp:work 자동 진입 → Stop-loop 발화 → pass — 끝까지 한 흐름.
- **Validate**: 사용자 수동 검증 단계 1회 (별도 Claude Code 세션 필요, 본 plan으로는 지시만)

---

## 6. Validation

```bash
# 단위 테스트 (S8-S12 누적)
node --test plugins/mccp/scripts/receipt/tests/*.test.js   # 기존 153 + 신규 alias 3 = 156
node --test plugins/mccp/scripts/quality/tests/*.test.js   # 신규
node --test plugins/mccp/scripts/state/tests/*.test.js     # 신규
node --test plugins/mccp/scripts/lib/tests/*.test.js       # 신규

# stub-input 통합 (S8 Task 7, S10 Task 14)
node plugins/mccp/scripts/hooks/stop-review-loop.js < tests/fixtures/stop-input-off.json
node plugins/mccp/scripts/hooks/stop-review-loop.js < tests/fixtures/stop-input-enforce-pass.json
node plugins/mccp/scripts/hooks/stop-review-loop.js < tests/fixtures/stop-input-enforce-block.json
node plugins/mccp/scripts/hooks/stop-review-loop.js < tests/fixtures/stop-input-counter-max.json
node plugins/mccp/scripts/hooks/stop-review-loop.js < tests/fixtures/stop-input-codex-critical.json

# hooks.json 구조 검증
node -e "JSON.parse(require('fs').readFileSync('plugins/mccp/hooks/hooks.json','utf8'))"

# S11 alias 등록 확인
node plugins/mccp/scripts/receipt/cli.js derive-decision --command mccp:work --args "feature X 구현"

# E2E (S12 Task 20, 사용자 별도 세션)
# 1) claude --plugin-dir C:\_project\my\my-claude-code-plugin\plugins\mccp
# 2) /mccp:work "scripts/lib/utils.js에 noop() 함수 추가"
# 3) Stop-loop 발화 + dummy lint/typecheck pass + PR 작성까지 확인
```

---

## 7. Risks

| # | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | Stop hook이 Codex 호출로 30분+ blocking | HIGH | HIGH | Codex bridge에 timeout 1200초 hard cap. 초과 시 auto-fallback으로 `verdict='unavailable'` 처리, fix-task.md 생성 안 하고 통과 + warning. |
| 2 | bounded loop counter race (병렬 Stop hook fire) | HIGH | MEDIUM | atomic rename + file lock(file size 0 sentinel). counter 파일 corrupt 시 reset to 0 + warning. |
| 3 | STATE.md 형식 drift (Claude가 매번 다른 sections) | HIGH | MEDIUM | docs/v0.2-state-schema.md + `state_version: 1` frontmatter + state-writer가 template enforce. injector는 schema 어긋난 STATE.md는 skip + warning. |
| 4 | 기존 plan-codex/implement-codex receipt와 Stop-loop Codex 호출 중복 (비용 2배) | MEDIUM | HIGH | Stop-loop은 **결과물 diff** 검토, plan-codex/implement-codex는 **결정** 검토 — 검토 시점이 다름. Stop-loop bridge에 cross-gate dedupe 적용 (implement-codex receipt가 같은 decision_id로 합치된 경우 Stop-loop은 quality runner만 돌리고 Codex skip). |
| 5 | 자동 게이트 chain이 프로젝트마다 다른 명령 (npm vs pnpm vs yarn vs bun) | MEDIUM | HIGH | detect.js가 lockfile 우선순위로 pkg manager 감지. package.json scripts에 `lint`/`typecheck`/`test`/`e2e` 키 없으면 graceful skip + Codex review만 발화. |
| 6 | fix-task.md inject 타이밍 (SessionStart vs UserPromptExpansion) | MEDIUM | MEDIUM | SessionStart inject 채택 (가장 일관). UserPromptExpansion은 stale fix-task 중복 inject 위험. injector가 inject 후 fix-task.md를 `.claude/state/fix-task-applied.md`로 rename → 같은 task 재발 시만 재사용. |
| 7 | `/mccp:work` PRD co-creation을 매번 강제하면 trivial task에 마찰 | MEDIUM | HIGH | work.md Phase 0에 "task complexity 판단" 분기 — args 길이 + 키워드(refactor/fix/typo) 휴리스틱으로 PRD skip 가능. complexity=Trivial 시 plan-prd skip, plan은 inline mini. |
| 8 | dual-reviewer escalation이 santa-loop 사용자 명시 동의 없이 자동 진입 | MEDIUM | LOW | escalation은 **권고**까지만 — fix-task.md에 "Next: /santa-loop ..." 한 줄로 안내, 자동 호출은 안 함. ecc-command-gates §5 정책과 정합. |
| 9 | hooks.json 구조 변경 시 v0.1 게이트 동작 회귀 | HIGH | LOW | 기존 entry 0건 수정. 신규 entry만 prepend/append. JSON 파싱 회귀 테스트 1회 + 시뮬레이션 |
| 10 | brainstorming §6 ordering 위반 (S8/S10 동시 진행) 함정 재발 | HIGH | MEDIUM | 본 plan에서 S9를 명시적으로 별도 sprint로 분리. S10 진입 조건(Task 11) gating 강제. |
| 11 | Auto-handoff session-spawner가 race condition으로 두 claude 프로세스 동시 spawn | HIGH | MEDIUM | spawn 직전 `.claude/state/handoff-lock-<pid>.lock` atomic create. 5분 TTL. lock 존재 시 spawn skip + notify. |
| 12 | 누적 토큰 측정값(`ecc-metrics-bridge`)이 실제 사용량과 drift | HIGH | LOW | breakpoint-detector가 200k 도달 시 _즉시_ 발화하지 않고 60s 내 안전 이벤트와의 AND 조건 강제. 측정 오류 시에도 안전 지점에서만 spawn. |
| 13 | tmux send-keys가 의도치 않은 panel(작업 중인 다른 worktree 등)로 라우팅 | HIGH | MEDIUM | spawn target은 무조건 새 window(`tmux new-window -n mccp-handoff`). 기존 panel send-keys 금지. Windows는 `Start-Process`라 분리 보장. |
| 14 | `next_chunk` 자동 inject로 사용자 의도와 다른 task가 다음 세션에서 시작 | MEDIUM | MEDIUM | injector가 inject 전에 STATE.md frontmatter `confirm_required: true` 옵션 지원. 기본은 false (마찰 최소 사용자 선택 반영). 사용자가 켜면 첫 turn에서 "이어가시겠습니까?" 한 줄 확인. |
| 15 | dogfood 기간(S9) 중 handoff 너무 자주 발화로 작업 흐름 끊김 | MEDIUM | MEDIUM | S9 회귀 지표에 "handoff per hour" 추가. > 1/hour면 threshold 상향 또는 휴리스틱 조정. |
| 16 | **(Reviewer A A2)** `COST_NOTICE/WARNING/CRITICAL_USD` 상수 의미 silent rebase — 기존 `ecc-context-monitor.js` warning 발화 임계값이 5/10/50 → 50/80/100로 동시 상향. v0.1 cost warning 의존 사용자 영향 | HIGH | MEDIUM | breaking change로 §1 Summary + README v0.2 섹션에 명시. breakpoint-detector는 신규 named export `getHandoffCostThresholds()`로만 import해 silent 의존 표면화. 마이그레이션 노트: v0.1 사용자가 cost warning 빈도 감소를 본다는 점을 README에 적시 |
| 17 | **(Reviewer A A3)** Stop-loop의 quality-first + Codex opt-in 디폴트로 `MCCP_STOP_LOOP_CODEX=1` 토글이 영구 0%로 굳어져 brainstorming §6 "Codex diff 검토" 설계 의도가 사실상 사문화 | HIGH | MEDIUM | §5 Task 10 metrics emit에 "Codex가 잡았을 quality-pass-but-bad-diff %" 항목 강제. S9 후반 canary worktree에서 `MCCP_STOP_LOOP_CODEX=1` 의무 운영. 측정값 > 10%면 v0.3에서 enforce-by-default 환원 검토 |
| 18 | **(Reviewer A A5)** cross-gate dedupe key 미정의 시 구현 단계에서 plan-codex / implement-codex / stop-loop-codex 사이 매칭 실패해 중복 호출 또는 skip 누락 | HIGH | LOW | S8 시작 전 `docs/v0.2-state-schema.md`에 dedupe key 정식 정의 + `scripts/state/dedupe-key.js` 함수 시그니처 확정 필수. S8 Task 1 docs 작성 시점에 gating |

---

## 8. Out of Scope (의도적 제외)

- **Paperclip / Ruflo / Agent Teams**: brainstorming §6 결론대로 본 사이클 외. v0.3 이후 평가.
- **`codex-plugin-cc` 채택 여부**: 본 plan은 현재 `Skill(codex:adversarial-review)` 인터페이스를 그대로 사용. codex-plugin-cc로의 전환은 S8 codex-bridge 안정화 이후 별도 검토.
- **Worktree 5개 관리**: brainstorming §2 통증 ⑥. v0.2 본 사이클에서 다루지 않음.
- **plan 단계 사전가정 축소**: brainstorming §3 통증 부분. plan-codex 그대로 유지 — Stop-loop이 결과물 검토를 메우면 plan-codex의 가정 검토는 보완 역할로 충분.
- **Cost dashboard**: brainstorming §3 "비용 자체는 문제 아님" 인용. 측정만 (Task 10 dogfood metric).

---

## 9. 사용자 결정 사항 (2026-06-03 합의 완료)

본 plan 갱신 시점(2026-06-03)에 사용자가 직접 답변한 결정 사항:

| # | 항목 | 결정 |
|---|---|---|
| Q1 | STATE.md 위치 | `<repo>/.claude/state/STATE.md` (gitignore). `.claude/state/loop-counter.json`, `fix-task.md`, `fix-task-applied.md`도 동일 경로 |
| Q2 | `MCCP_STOP_LOOP` 기본값 | `observe` (S9 dogfood 동안 비차단). 사용자가 `enforce`로 명시 onboarding |
| Q3 | `/mccp:work` Trivial 휴리스틱 | args ≤ 30자 또는 `[fix, typo, rename, comment, format]` 키워드 매치 시 Trivial → PRD skip + inline mini plan |
| Q4 | fix-task.md 만료 | 7일. `fix-task-applied.md` sweep도 동일 |
| **Q5 (신규)** | 임계값 200-300k 의미 | **사용자 갱신 결정** — 토큰 대신 **누적 비용 USD** 채택. `ecc-context-monitor.js`의 `COST_NOTICE/WARNING/CRITICAL_USD = 50 / 80 / 100`으로 수정. 단일 소스 |
| **Q6 (신규)** | Auto-handoff breakpoint 판단 | **휴리스틱만** — `last_event in [stop_loop_pass, receipt_write, pr_created] AND within 60s`. Codex AI 판단 없음(비용·latency 회피) |
| **Q7 (신규)** | Auto-handoff 세션 spawn 방식 | **마찰 최소: tmux 격리 new-window + Windows Start-Process** — Codex F5 reject 반영. `tmux new-window -c <repo-root> -n mccp-<repoHash> -- claude` (send-keys 절대 금지). `MCCP_AUTO_HANDOFF=spawn\|notify\|off` |
| **Q8 (신규)** | fix-task vs handoff 충돌 | **fix-task-first 같은 세션 유지** (사용자 결정, Codex F4 권고 reject). 단 hard ceiling($100)은 안전 wrapper로 fix-task를 next session first task로 강제 이전 |
| **Q9 (Codex R1)** | Secret exposure 처리 | **무시** — 사용자 판단: `.env`/secret이 gitignore면 git diff에 안 보임. gitignore 누락이 더 근본 문제. preflight redaction task 추가 안 함 |
| **Q10 (Codex R1)** | External destination(Codex 전송) 처리 | **옵션 B — opt-in 강등**. `MCCP_STOP_LOOP_CODEX=1` 명시 시에만 Codex 호출. default는 quality runner만. Stop-loop의 외부 전송 빈도 0으로 회귀 |
| **Q11 (Codex R1)** | S10 sprint 분리 | **F1 modify 수용** — S10a(STATE.md) + S10b(auto-handoff). S10b 진입 조건은 S10a 안정화 + dogfood canary enforce 통과 5건 |
| **Q12 (Codex R1)** | observe 기본값 vs canary | **F2 modify 수용** — 기본 `observe` 유지 + S9 후반 canary worktree 1개 `enforce` 의무 |

---

## 10. Acceptance Criteria

- [ ] Stop-loop hook (`stop-review-loop.js`)이 `MCCP_STOP_LOOP=enforce` 모드에서 Codex review + quality runner 자동 호출
- [ ] quality runner 4단계(lint/typecheck/test/e2e) fail-fast 동작 검증 (단위 + stub-input)
- [ ] bounded counter 2회 도달 시 사람 개입 메시지 + 자동 통과 (무한 루프 방지)
- [ ] PreCompact hook이 STATE.md 자동 작성, SessionStart hook이 자동 inject
- [ ] fix-task.md 형식이 docs/v0.2-state-schema.md 스키마 준수
- [ ] `/mccp:work` 한 명령으로 PRD → plan → implement → Stop-loop → pr 흐름 진입 (단일 entry)
- [ ] dual-reviewer escalation 권고가 fix-task.md에 정확히 표시됨 (3R divergent 또는 CRITICAL 시)
- [ ] 기존 v0.1 receipt 테스트 153/153 + 신규 모듈 테스트 모두 통과
- [ ] hooks.json JSON 파싱 OK + 기존 entry 0건 수정
- [ ] S9 dogfood 진입 체크리스트 통과 후에야 S10 시작 (ordering 강제)
- [ ] Codex adversarial review converged + santa-loop dual-reviewer convergence 둘 다 plan에 반영 (사용자 명시 요청)
- [ ] **Auto-handoff (신규)**: 누적 토큰 200k 초과 + 안전 breakpoint(stop_loop_pass/receipt_write/pr_created) AND 조건에서만 발화
- [ ] **Auto-handoff fix-task 우선**: fix-task.md 미적용 상태면 임계값 도달해도 handoff skip 검증 (stub-input)
- [ ] **Auto-handoff spawn**: tmux 환경에서 `tmux new-window`로 격리 spawn (기존 panel 건드림 X), Windows에서 `Start-Process` 정상 동작
- [ ] **Auto-handoff race lock**: 동시 spawn 시도 시 `handoff-lock-*.lock` 파일로 한 번만 발화
- [ ] `MCCP_HANDOFF_TOKEN_THRESHOLD` env var로 임계값 조정 가능 (default 200000)

---

## 11. Pre-Implementation Verification (사용자 요청)

본 plan은 작성 직후 다음 두 단계 검증을 받는다 (사용자 명시 — _"codex와 dual reviewer 방식으로 진행할게"_):

1. **Codex adversarial review** — focus text (brainstorming §6 권장 + 사용자 추가 요구 통합):
   - "challenge S8 → S9 → S10 ordering: is the 1-week dogfood gate sufficient to catch design flaws before STATE.md + auto-handoff layer is added?"
   - "challenge MCCP_STOP_LOOP default = observe: could enforce-by-default give better dogfood signal?"
   - "challenge auto-handoff heuristic-only breakpoint (no Codex AI judgment): is `cumulative_tokens >= 200k AND last_event in [stop_loop_pass, receipt_write, pr_created] AND within 60s` sound, or does it create blind spots where context bloats between safe events?"
   - "challenge fix-task-first policy vs handoff: could deferring handoff until fix-task applied trap the agent in a degraded-quality fix loop right at the threshold?"
   - "challenge tmux `new-window` spawn isolation: does it actually prevent cross-worktree leakage when user runs multiple `claude` sessions?"
2. **santa-loop dual reviewer convergence** — 두 독립 reviewer 모두 승인할 때까지 본 plan 본문 갱신. 사용자 명시 요청.

검증 결과는 본 plan §12 (생성 예정) `## Codex Adversarial Review` + `## Dual Reviewer Convergence` 섹션에 기록한다.

---

## 12. Codex Adversarial Review

- 호출: `Agent(codex:codex-rescue)` (Agent tool 경유 — Skill 직호출은 재진입 위험으로 우회)
- 라운드 수: **1 (사용자 결정 완료, 추가 라운드 불필요)**
- 합치 결론: 5 focus 중 4 modify + 1 reject + 2 AUTO-CRITICAL → 4 modify 전량 수용, 1 reject 수용, AUTO-CRITICAL 2건은 사용자 결정으로 합치
- **수용한 제안**:
  - F1 (S10 split) → §2 Phase Map에 S10a/S10b 분리 + S10b gating 조건 명시
  - F2 (observe + canary) → §2 Phase Map에 canary 정책 명시
  - F3 (hard ceiling) → §5 Task 14b에 `tier=hard` 강제 handoff 추가 + 사용자 cost 임계값 50/80/100과 통합
  - F5 (tmux 격리) → §4 session-spawner.js / §5 Task 14c에 `tmux new-window -c <repo-root> -n mccp-<repoHash>` 명시, send-keys 금지
  - AUTO-CRITICAL "external destination" → §1 Summary + §5 Task 7에 `MCCP_STOP_LOOP_CODEX=1` opt-in 강등
- **거부한 제안 + 근거**:
  - F4 (fix-task를 next session first task로 redefine) → 사용자 결정으로 reject. 기본은 같은 세션에서 fix-task 우선 유지. 단 hard ceiling($100)은 안전 wrapper로 F4 권고를 부분 적용 (Task 14b·14d에서 hard tier 시 fix-task를 next_chunk로 이전)
  - AUTO-CRITICAL "secret exposure" → 사용자 판단으로 무시. gitignore 운용 정상이면 git diff 노출 0. redaction preflight task 추가 안 함
- **Open Questions**: 없음 (모든 ambiguity 사용자 결정으로 해소). DIVERGENT_UNRESOLVED 없음.
- Codex session 참조: agentId `ac288d92507aca860` (SendMessage to continue)

## 13. Dual Reviewer Convergence

- 호출 방식: santa-loop skill 현재 세션 미등록 → **Agent 도구 합성 (사용자 결정 B안)** — `architect` + `planner` 두 독립 reviewer 병렬 호출
- 라운드 수: **2 (Round 2에서 양측 APPROVE 합치)**
- 종료: **CONVERGED** — 두 reviewer 모두 독립 APPROVE + HIGH confidence + 0 residual blockers

### Round 1 (verdict 일치, residual blockers 6건)
- Reviewer A (architect, MEDIUM): MODIFY — A1 S10a gate fitness 약함, A2 cost 상수 silent rebase, A3 opt-in 영구 0% 위험, A4 tmux hash ACCEPT, A5 dedupe key 미정의
- Reviewer B (planner, MEDIUM): MODIFY — B1+B4 metrics emit 부재, B2 task 정의 ACCEPT, B3 동시성 path 누락, B5 `/mccp:work` orchestration shell 명시 부재

### Plan 반영 (R1-R6 surgical edit)
- R1 (A2) → §4 ecc-context-monitor.js 업데이트 + named export `getHandoffCostThresholds()` + §7 Risks #16 breaking change 명시
- R2 (A5) → §4 신규 `scripts/state/dedupe-key.js` + §4 `docs/v0.2-state-schema.md`에 dedupe key 필수 섹션 + §7 Risks #18 S8 진입 gating
- R3 (A1+A3 ≈ B1+B4) → §5 Task 10 metrics subcommand 신설 + "Codex가 잡았을 quality-pass-but-bad-diff %" 측정 + §7 Risks #17 canary 의무 운영
- R4 (A1) → §2 Phase Map S10a 진입 조건 "≥5 enforce receipts AND ≥1 fail+fix-task cycle"로 강화
- R5 (B3) → §5 Task 14b 10 path / Task 14c 7 path (concurrency + lock + PATH fallback)
- R6 (B5) → §1 Summary 4번에 "v0.2는 orchestration shell, v0.3 commit to true single-flow" 명시

### Round 2 결과
- Reviewer A: **APPROVE / HIGH** — A1/A2/A3/A5 RESOLVED, A4 UNCHANGED-ACCEPT
- Reviewer B: **APPROVE / HIGH** — B1/B3/B4/B5 RESOLVED, B2 UNCHANGED-ACCEPT
- 두 reviewer 모두 0 residual blockers
- 합치 결론: **plan converges**. 양측 모두 "code-level contracts + measurable gating thresholds 도달, aspirational language 제거" 확인

### 부수 산출물
- Reviewer A agentId: `a08d8e1f22d8857ea` (SendMessage로 후속 질의 가능)
- Reviewer B agentId: `a4fad83576180d629` (SendMessage로 후속 질의 가능)
- Codex Round 1 agentId: `ac288d92507aca860`
