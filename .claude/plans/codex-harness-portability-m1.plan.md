# Plan: codex-harness-portability M1 — harness-truth

**Source PRD**: `.claude/prds/codex-harness-portability.prd.md`
**Selected Milestone**: 1 — harness-truth
**Complexity**: Medium

## Summary

Codex CLI 0.153.4에서 mccp hook이 **실제로 발화하는지**를 실행으로 확인하고, PRD가 열어 둔
미지수 넷(`Stop` 바인딩 · `hooks.json` 자동 발견 · hook trust 승인 · hook 자식 프로세스 env)에
측정값을 채워 넣는다. 구현이 아니라 관측이며, 이 값이 나오기 전에는 M2~M5의 범위를 확정하지
않는다(UI12).

계측은 **`CODEX_HOME` 격리** 위에 세운다 — 본 세션 실측에서 `CODEX_HOME=<scratch>`가 실제
`~/.codex/`를 한 바이트도 건드리지 않음을 확인했다(config.toml sha256 전후 동일). 그래서 원복
무결성은 사후 복원이 아니라 **구조적으로** 성립하고, PRD Metric 5의 "전후 sha256 일치"는
그보다 강한 기준으로 대체된다 — 그 기준 자체가 whole-file로는 성립하지 않음도 함께 실측됐다
(Codex가 통상 운용 중 `config.toml`을 갱신한다).

산출은 셋이다: 재현 가능한 계측 하네스(`scripts/codex-probe/`) · 판정 문서 · 원자료 JSON.
한 번 보고 끝나는 관측은 다음 Codex 버전에서 처음부터 다시 재야 하므로, 관측 절차를 코드로
남기는 것이 이 milestone의 실질 산출이다.

## User Intent

<!-- USER-STATED만. 저자 정당화는 ## Design Decisions로. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | `.claude-plugin/`을 옮기지 않고 추가만 한다 | constraint |
| UI2 | mccp를 fork하지 않는다 — 단일 트리로 양 하네스를 지탱한다 | exclusion |
| UI3 | Codex가 호스트일 때 리뷰어는 Claude 계열이다 | constraint |
| UI4 | 브랜치는 `plugin.json` version을 선언하지 않는다 | exclusion |
| UI5 | `Codex reviewer`와 `Codex host`를 문서·코드·receipt에서 분리한다 | constraint |
| UI6 | command 본문 감량(C8)에 이 축을 얹지 않는다 | exclusion |
| UI7 | 하네스별 `release` 채널을 분리하지 않고 단일 채널로 시작한다 | exclusion |
| UI8 | 타 사용자 설치 UX와 marketplace 공개는 이번 사이클의 판정 대상이 아니다 | exclusion |
| UI9 | impeccable 탐지 재정렬은 이 축에서 다루지 않는다 | exclusion |
| UI10 | 하네스 교차 이어달리기의 실증은 후속 PRD가 소유한다 | exclusion |
| UI11 | 비용·모델 테이블의 Codex 확장은 열거만 하고 이연한다 | exclusion |
| UI12 | Milestone 1은 구현이 아니라 관측이며 이 값 전에 나머지 범위를 확정하지 않는다 | constraint |
| UI13 | 모든 측정에 CLI 버전을 함께 기록하고 버전 없는 측정치는 인용하지 않는다 | constraint |
| UI14 | dogfood가 1급이며 단일 운영자 기준으로 판단한다 | direction |
| UI15 | 게이트가 설치되나 발화하지 않는 "껍데기" 상태를 허용하지 않는다 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수/실행 2층 분리 | `scripts/test-suite/enumerate.js` · `scripts/test-suite/run.js` | 판정은 순수 함수, spawn·파싱은 실행층. 합성 입력으로 부정 케이스를 결정적으로 단언 |
| 배포 표면 밖 도구 | `scripts/version-declaration-guard.js` · `scripts/test-suite/` | marketplace `source`가 `./plugins/mccp`이므로 `scripts/`·`docs/`·`.claude/`는 사용자에게 가지 않는다 (UI8) |
| 측정 기록 문서 | `docs/codex-intent-context/reviewer-contract-compliance.md` | 하네스 표 · 사전 선언한 판정 규칙 · 원자료 인용 · **한계 명시**. 수치를 문서 안에만 두지 않는다 |
| 측정 원자료 컨테이너 | `.claude/_meta/data/2026-09-01-suite-baseline.json` | `{schema, runs:[…]}` — 실행 산출을 원소로 누적, 판정 문서는 그 위의 해석 |
| 선언 목록 + 상한 상수 | `plugins/mccp/scripts/lib/env-contract/evidence-debt.js` (§3.17 M6) | 목록을 늘리려면 상수를 올리는 **별도 편집**이 필요하고 그 사실이 diff에 숫자로 남는다 |
| 경계 일치 스캔 | `plugins/mccp/scripts/lib/env-contract/measure-evidence.js` | 부분 문자열 일치는 접두사 충돌로 드리프트를 감춘다 — 이름은 경계 일치로 센다 |
| 이름 체인 단일 함수 | `plugins/mccp/scripts/lib/session-identity.js:53-60` (§3.18) | 해소 체인은 함수 하나 + 이름 목록 상수, 부재는 스캔 test가 단언 |
| Tests | `scripts/tests/test-suite.test.js` | `node --test`, 합성 입력, 자기 포함 단언 |

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~28k.

### Findings (severity-ranked)

- **[HIGH][architect]** 넷째 결합 표면(agents/*.md 58개의 Claude 도구명·모델명 선언, cost-estimate.js RATE_TABLE, session-identity.js, bootstrap.js, evidence-lock.js, codex-invoke.js 레지스트리 경로)이 어느 Milestone에도 명시적으로 배정되지 않았다. Metric 4('하네스 결합 지점 열거 완전성')는 열거만 요구하고 각 항목의 처분(수정/additive/이연)을 어느 milestone이 실행하는지는 plan 단계로 미뤄져 있다. — PRD L93 'Metric: 하네스 결합 지점 열거 완전성 | 미열거 잔여 0 | 결합 지점 전수 목록과 각 처분(수정·additive·이연)이 대조 가능' — 열거는 metric이지만 실행 milestone 배정이 Delivery Milestones 표(M1~M5)에 명시적 매핑 없음
- **[HIGH][security]** Cross-harness reviewer-inversion (decision 3 / Milestone 4) requires Codex-host to invoke a Claude-model reviewer, but no such call path exists — codex-invoke.js is directionally the reverse (Claude host calling Codex). Any implementation would need new outbound credentials/auth (Claude API/CLI token) reachable from inside a Codex-hosted process. The plan must specify how that credential is scoped, stored, and prevented from leaking into receipts/logs — PRD's Open Questions flags the capability gap but not the credential-handling surface. — PRD lines 147-149: '기존 codex-invoke.js는 방향이 반대라 재사용이 아니다' + plugins/mccp/scripts/lib/codex-invoke.js:6 'resolve codex@openai-codex via ~/.claude/plugins/installed_plugins.json'
- **[HIGH][security]** The plan's decision 1 (add .codex-plugin/ manifest fallback, additive-only) plus decision 2 (no fork) means the SAME plugin tree, SAME scripts, and SAME hooks now execute under two different process-trust models (Claude Code hook trust vs Codex HookStateToml{trusted_hash} + --dangerously-bypass-hook-trust). The PRD's own Open Questions flags that hook-trust approval may be manual (line 144-146) but does not address what happens if a Codex operator bypasses trust with --dangerously-bypass-hook-trust — this would let any script under plugins/mccp/scripts/hooks/ execute without the approval gate CLAUDE.md assumes exists for Claude Code hooks. — PRD line 144-146: 'HookStateToml{enabled, trusted_hash} + --dangerously-bypass-hook-trust가 있다. 승인 절차가 수동이면 Milestone 2의 실증 비용과 후속 운영 비용이 함께 오른다.'
- **[HIGH][security]** Milestone 2 acceptance requires the gate to 'actually block' (실제 차단) when no prior receipt exists — but the PRD does not specify which of the two known ingress mechanisms (user_prompt_submit misuse or a new Skill-tool-equivalent hook) will carry the block decision, nor whether that new ingress inherits the existing fail-closed default. If gate-ingress wiring is built ad hoc for Codex without reusing scripts/receipt/classify.js dispatch and the fail-closed matrix (§3.3), a parallel, weaker enforcement path could be created that silently diverges from the audited 15-classification fail-closed table. — PRD Evidence section: 'receipt-skill.js:152가 event.tool_name === \'Skill\'을 요구한다. Codex의 skill 도구는 ext/skills/src/tools/{list,read}.rs 계열이고 Skill이라는 이름의 도구는 없다.' + Metric 2 target '게이트가 실제로 차단'
- **[HIGH][test]** 모든 Success Metrics가 Codex CLI 라이브 설치·실행이라는 수동 실측에 의존하고, node --test로 재현 가능한 자동화된 오라클이 하나도 없다 — 회귀 방지 수단이 없다 — PRD Success Metrics 표: 'evidence-audit --json이 state≠blind', '선행 receipt 부재 상태에서 Codex 게이트가 비영점 종료하고 진행을 막은 로그' 등 전부 라이브 Codex CLI 세션에서 사람이 관찰해야 하는 항목. CI 워크플로(.github/workflows/)에 Codex CLI 설치·구동 스텝은 존재하지 않을 가능성이 높음
- **[HIGH][test]** Milestone 1(harness-truth)이 '관측'이라고 명시했지만 관측 결과를 코드화된 assertion(test)으로 고정할 계획이 PRD에 없다 — 다음 세션/버전에서 같은 실측을 반복해야 함 — PRD L131: 'pending | — … 구현이 아니라 관측이며' — 근거 문서도 Open Questions로 Stop 바인딩 가능여부·hook trust 절차를 '실행으로 확정해야 한다'고만 적고 그 결과를 assert하는 test 파일 경로를 지정하지 않음
- **[HIGH][explorer]** receipt-skill.js's hard dependency on event.tool_name === 'Skill' is the exact same shape of prior breakage documented in the impeccable channel-migration precedent the PRD itself cites — the plan should mirror that precedent's remediation pattern (oracle-based resolution + call-form emission, §3.17 M3) rather than a bespoke fix for the Codex skill-tool-name gap. — PRD Evidence: 'receipt-skill.js:152가 event.tool_name === Skill을 요구한다. Codex의 skill 도구는 ... Skill이라는 이름의 도구는 없다.' PRD References cites 2026-08-22-impeccable-plugin-channel-migration.md as '형태가 같다' precedent, and CLAUDE.md §3.17 M3 describes the oracle+carrier-line remediation pattern already used once.
- **[MEDIUM][architect]** PRD 데이터 모델은 hook 이벤트 매핑을 1:1 rename(예: `Stop`→?)으로 취급하지만, `hooks.json` 29 entry가 소비하는 semantics(예: stop-loop 반복 판정, auto-handoff, STATE.md 갱신)는 이벤트 존재만이 아니라 페이로드 필드(`stopReason` 등)와 재진입 횟수에 의존한다. Milestone 1은 '바인딩 가능 여부'만 측정 항목으로 잡아, 바인딩되더라도 페이로드 shape가 mccp 소비 코드와 일치하는지는 acceptance에 없다 — 이는 Milestone 2 이후에 숨은 재작업을 만들 구조적 위험이다. — PRD L131 'Stop 바인딩 가능 여부 · hooks.json 자동 발견 · hook trust 승인 절차 · hook 자식 프로세스의 env … 값이 나오기 전에는 아래 넷의 범위를 확정하지 않는다' — payload-shape parity가 명시적으로 검증 항목에 없음
- **[MEDIUM][architect]** 결정 3('Codex가 호스트일 때 리뷰어는 Claude 계열')은 실행 메커니즘이 미정이다 — 기존 codex-invoke.js는 '반대 방향'(Claude→Codex)이라 재사용 불가로 명시됐는데, PRD는 이 역방향 호출자를 만들 새 모듈의 경계(누가 소유하는가, codex-invoke.js와 병존하는가 대체하는가)를 구조적으로 정하지 않았다. 두 방향 모듈이 같은 파일에 공존하면 향후 이름 충돌(§1.2 Codex reviewer vs Codex host 혼동)이 코드 레벨에서도 재현될 수 있다. — PRD L147-149 'Codex 안에서 Claude 계열 리뷰어를 부르는 경로가 실재하는가 … 기존 codex-invoke.js는 방향이 반대라 재사용이 아니다' — 신규 모듈의 이름/위치 결정이 Open Question으로만 남고 Decision 5(용어 분리)는 문서·receipt 표기만 다룸, 코드 모듈 경계는 다루지 않음
- **[MEDIUM][architect]** '.claude-plugin/을 옮기지 않고 추가만 한다'는 additive 원칙이 결정 1에 명시됐지만, 넷째 표면(agents/*.md의 도구명 선언, bootstrap.js의 ~/.claude/ 탐색 등)에 대해서는 같은 additive-vs-branch 원칙이 코드 구조 차원에서 정해지지 않았다 — 예컨대 agents/*.md에 Codex 전용 도구명 변형을 얹을 때 단일 파일에 조건부 분기를 넣을지, 하네스별 별도 파일(예: `agents/*.codex.md`)을 둘지에 따라 유지보수 결합도가 크게 달라지는데 PRD/조사 어디에도 이 구조적 선택지가 논의되지 않았다. — PRD L105 '.claude-plugin/을 옮기지 않는다. 추가만 한다' (매니페스트 레벨 결정)만 있고, agents/*.md 58개·session-identity.js·cost-estimate.js 등 코드 레벨 additive 전략은 미기술; CLAUDE.md §3.18 session-identity.js는 이미 단일 체인 함수로 확장 지점을 열어뒀으나(resolveRawSessionId) 이 패턴이 다른 5개 결합 지점(agents/*.md, RATE_TABLE, bootstrap.js, evidence-lock.js, codex-invoke.js)에 일반화될 것인지 PRD가 언급 안 함
- **[MEDIUM][security]** registry-path trust boundary is currently anchored to ~/.claude/plugins/installed_plugins.json (a fixed, harness-specific location). A Codex-host reviewer-invocation path will need an analogous registry/credential resolution rooted in a different home/config dir; if the plan reuses REGISTRY_PATH_DEFAULT unmodified or hardcodes a parallel path without validating ownership/permissions, a malicious or stale entry (installPath spoofing) could redirect the reviewer call to an attacker-controlled binary — same class of risk as existing install-path-stale/companion-not-found classifications but now inverted (Codex trusting an external Claude-side binary). — plugins/mccp/scripts/lib/codex-invoke.js:43 REGISTRY_PATH_DEFAULT = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'); lines 139-147 installPath existence check has no permission/ownership check
- **[MEDIUM][security]** session-identity.js resolveRawSessionId is explicitly documented as NOT sanitizing its output, and callers are responsible for path-safety at each choke point. Adding a new CODEX_SESSION_ID source (flagged as a fourth coupling surface, PRD line 44) must go through the same non-sanitizing resolver — if Milestone 1/5 wiring introduces a new consumer of that raw session id (e.g. a new lock/ledger filename) without routing through sanitizeSessionId, it reopens the path-injection choke point that CLAUDE.md §3.18 says is only closed at two specific call sites. — plugins/mccp/scripts/lib/session-identity.js:27 'resolveRawSessionId는 sanitize하지 않는다'; CLAUDE.md §3.18: 'evidence-lock.js:76-80이 CLAUDE_PID를 읽음' listed as a coupling surface but no sanitize call site audited for a Codex-origin PID/session value
- **[MEDIUM][security]** Decision 5 (separate 'Codex reviewer' vs 'Codex host' in docs/code/receipts) implies new receipt fields distinguishing harness origin (Open Question: 'harness/produced_by' field absent from the 72-key skeleton). Adding such a field risks violating the no-rehash / tracked-receipt-hash-stability invariant (§3.12) if done as anything other than present-only + excluded from makeSkeleton — the PRD flags this as an open question for Milestone 5 but the security-relevant failure mode (a harness field becoming part of the hashed body, breaking existing tracked receipt corpus integrity or enabling hash-mismatch spoofing) is not called out. — PRD line 150-152: '하네스 출처 필드를 receipt에 넣는 것이 §3.12 hash 안정성과 충돌하는가... tracked ship corpus에 새 필드를 더하는 판단은 Milestone 5가 소유한다.'; CLAUDE.md §3.12 no-rehash invariant
- **[MEDIUM][test]** decision 5(Codex reviewer/host 용어 분리)의 코드 강제 수단이 없다 — 두 개념이 다시 혼동돼도 잡아낼 테스트가 지정되지 않음 — PRD 결정 5: '문서·코드·receipt에서 분리한다'만 서술, 실제 field naming 검증(예: schema.js의 harness_role enum lint)이나 lint test 계획 부재
- **[MEDIUM][test]** Metric '리뷰어 교차성 보존 3/3 게이트'의 오라클 정의가 모호 — '리뷰어 모델 계열이 호스트 계열과 다름'을 receiptのどのfield로 어떻게 자동 검증할지 미정 — PRD Success Metrics 표 3행: 'How measured: 각 receipt의 리뷰어 모델 계열이 호스트 계열과 다름' — 수동 대조로 읽힘. Milestone 4는 '리뷰어를 부를 수 없으면 게이트는 fail-closed'라고만 서술하고 fail-closed 경로의 negative test(리뷰어 호출 실패 시 진짜로 exit 12/block 하는지)를 명시하지 않음
- **[MEDIUM][test]** §3.12 no-rehash 불변식과 충돌 가능한 '하네스 출처 필드' 추가(Open Question)가 스키마 회귀 테스트 계획 없이 Milestone 5로 이연됨 — schema.js의 기존 hash-stability test와의 상호작용이 명시 안 됨 — PRD Open Questions: '하네스 출처 필드를 receipt에 넣는 것이 §3.12 hash 안정성과 충돌하는가... Milestone 5가 소유한다' — present-only 패턴 선례(§3.13)는 언급되나 실제 schema.js 검증 함수·test 파일 지정 없음
- **[MEDIUM][test]** 게이트 실차단(fail-closed) 증명 방법이 '로그를 본다'로만 정의되어 있어 오라클이 재현 불가능(비결정적 CLI 출력에 의존) — exit code·receipt 필드 기반의 결정적 assertion으로 전환 필요성이 명시 안 됨 — Success Metrics 표: '선행 receipt 부재 상태에서 Codex 게이트가 비영점 종료하고 진행을 막은 로그' — 대안으로 receipt JSON의 blocking/verdict 필드를 assert하는 절차가 없음
- **[MEDIUM][explorer]** session-identity.js already implements exactly the single-chain-resolver pattern the PRD needs for adding a fourth env candidate (CODEX_SESSION_ID) — this is direct prior art from §3.18 (MSW M8 DD1), not a new pattern to invent. — plugins/mccp/scripts/lib/session-identity.js:53-60 `resolveRawSessionId` chains MCCP_SESSION_ID → CLAUDE_CODE_SESSION_ID → CLAUDE_SESSION_ID, with SESSION_ID_ENV_NAMES exported and a test (session-identity.test.js) that scans for stray direct env reads. PRD Evidence section names session-identity.js:53-58 CODEX_SESSION_ID 부재 as a coupling surface.
- **[MEDIUM][explorer]** agents/*.md (58 files) declare Claude-specific tool names (Read/Grep/Bash) and Claude model aliases (haiku/sonnet/opus) as YAML frontmatter — any Milestone 4 (reviewer-inversion) design must reuse this exact frontmatter schema/convention when it defines how a Codex host invokes a Claude subagent reviewer, rather than inventing a parallel agent-declaration format. — e.g. plugins/mccp/agents/go-reviewer.md:4-5 tools: ["Read", "Grep", "Glob", "Bash"] / model: sonnet; cost-estimate.js:9-12 RATE_TABLE keys off these same three model names.
- **[LOW][architect]** Milestone 4(reviewer-inversion)가 Milestone 2(gate-ingress)·3(command-reach)에 강하게 결합되어 있다 — '리뷰어를 부를 수 없으면 게이트는 fail-closed'인데, 이 fail-closed 판정이 성립하는 순간 Milestone 2의 acceptance('게이트가 실제로 차단한다')와 Milestone 4의 acceptance가 동일 이벤트를 관측하는 것인지, 서로 다른 관측인지 구분이 안 된다. 두 milestone이 같은 증거를 이중으로 요구할 위험(같은 차단 로그 1건이 두 metric을 동시에 만족시키는지 불명). — PRD L134 'reviewer-inversion … 리뷰어를 부를 수 없으면 게이트는 통과가 아니라 fail-closed' + Metric 표 L91 '게이트 실차단 실증 ≥1회'
- **[LOW][architect]** Milestone 5(chain-parity)의 '어느 하네스가 만들었는지 감사로 판별 가능'은 §3.12 no-rehash invariant·hash 안정성과 잠재 충돌하는데, Open Question으로만 남고 스키마 확장의 소유 경계(신규 필드가 receipt schema.js 어디에 추가되는지, present-only인지)가 계획 단계로 완전히 미뤄져 M5 자체가 사실상 별도 mini-PRD 수준의 결정을 내부에 숨기고 있다. — PRD L150-152 '하네스 출처 필드를 receipt에 넣는 것이 §3.12 hash 안정성과 충돌하는가 … present-only + makeSkeleton 미포함이 선례이나 … 판단은 Milestone 5가 소유한다'
- **[LOW][security]** Risk table item 'two harnesses running concurrently — lock/ledger conflict' is explicitly deferred to Milestone 5 and declared out of MVP blocking, but the PRD's own Evidence section already shows Claude-specific trust assumptions baked into lock/ledger code (CLAUDE_PID read by evidence-lock.js, host-aware tri-state in pr-phase-lock). If a dogfood operator runs Codex-host and Claude-host against the SAME repo/worktree during MVP development (plausible given single-operator dogfood usage pattern), the deferred risk could manifest during MVP work itself, not just post-MVP — the PRD scopes this away without a guard against accidental concurrent dual-harness runs in the same repo. — PRD Risks table row: '두 하네스 동시 실행 시 lock 경합·ledger 충돌 | 낮음 | 중 | ... Milestone 5가 소유. MVP는 단독 실행이라 이번 완주는 막지 않는다'
- **[LOW][test]** 원복 무결성(config.toml sha256 diff 0) 검증이 반복 가능한 자동 스크립트가 아니라 1회성 수동 절차로만 기술됨 — Milestone 진행 중 반복 측정 시 사람이 매번 sha256을 손으로 비교해야 함 — 근거 문서 A절: '조사 종료 후 codex plugin remove + marketplace remove로 원복해 백업과 diff 0을 확인' — 스크립트화된 pre/post snapshot diff 도구 언급 없음
- **[LOW][explorer]** codex-invoke.js is architecturally the wrong direction for Decision 3 (Codex-host calling a Claude reviewer) — it is a Claude→Codex wrapper, not reusable, confirming the PRD's own Open Question rather than a hidden reuse opportunity. Any plan proposing to 'extend codex-invoke.js' for the reviewer-inversion milestone would be building on the wrong module. — plugins/mccp/scripts/lib/codex-invoke.js:1-12 header: 'fail-closed wrapper around codex-companion.mjs adversarial-review' — resolves codex@openai-codex plugin registry and spawns the Codex CLI companion. PRD Open Questions: '기존 codex-invoke.js는 방향이 반대라 재사용이 아니다.'
- **[LOW][explorer]** The env-contract registry/lint machinery (env-contract/registry.js, lint.js L1-L10) is the established convention for documenting any new env var this PRD would introduce (e.g. a Codex-host detection flag or CODEX_SESSION_ID); the plan should register new toggles there rather than adding undocumented ad hoc env reads. — plugins/mccp/scripts/lib/env-contract/registry.js:260-261 already has entries for CLAUDE_SESSION_ID and CLAUDE_PID with axis/klass/evidence columns.
- **[LOW][explorer]** receipt schema present-only field convention (§3.12/§3.13 pattern: additive fields excluded from makeSkeleton to preserve tracked-receipt hash stability) is the established mechanism the plan must reuse for the PRD's proposed 'harness/produced_by' provenance field — not a new schema mechanism. — PRD Open Questions: '하네스 출처 필드를 receipt에 넣는 것이 §3.12 hash 안정성과 충돌하는가... present-only + makeSkeleton 미포함이 선례이나(§3.13)'. CLAUDE.md §3.13 lists precedent fields (e.g. intent_arbiter) excluded from makeSkeleton for the same reason.

### Meta-gaps

- PRD가 넷째 표면(agents/*.md, cost-estimate.js, bootstrap.js, evidence-lock.js, codex-invoke.js, session-identity.js)의 각 항목을 5개 Milestone 중 어디가 처리하는지 명시적 매핑 표가 없다 — draft plan은 이 매핑을 Files-to-Change 표에서 명시적으로 milestone별로 귀속시켜야 한다(§1.2 dedupe matcher가 repo-root full path를 요구하므로 이 매핑 부재는 후속 dedupe 불발로도 이어질 수 있음).  _(architect)_
- hook payload shape parity(단순 이벤트 이름 대응이 아니라 필드 단위 소비 계약)를 검증하는 acceptance 기준이 어느 milestone에도 명시되지 않았다.  _(architect)_
- Claude reviewer를 Codex 하네스 내부에서 호출하는 신규 모듈의 소유 경계(파일 위치, codex-invoke.js와의 관계)가 정해지지 않았다 — plan이 이 구조적 결정을 명시하지 않으면 M4 구현이 임시방편으로 기존 codex-invoke.js를 오염시킬 위험.  _(architect)_
- 넷째 표면에 대한 '수정 vs additive vs 이연' 처분 원칙(결정 1과 같은 급의 명시 규칙)이 매니페스트 레벨에만 있고 코드 레벨에는 없다.  _(architect)_
- No draft plan exists yet (plan file not written) — this review is PRD-only; a second security pass is needed once Milestone 1-5 plans specify concrete file changes and command bodies.  _(security)_
- PRD does not enumerate what new environment variables / secrets (if any) a Codex-hosted reviewer-invocation path would require, nor where they'd be stored (settings.json env block vs Codex-native config.toml) — settings.json env values are typically not secret-safe (plaintext, git-adjacent).  _(security)_
- No mention of whether Codex hook stdout/stderr or receipt files could leak host-specific paths (~/.codex/ vs ~/.claude/) into git-tracked ship receipts, which is a data-handling concern parallel to the existing meta.cwd redaction work in §3.12.  _(security)_
- PRD's 'harness결합 지점' (4th coupling surface) enumeration doesn't include an explicit audit of Codex CLI's own trust/sandbox model (approval-mode, exec sandboxing) — whether mccp hooks running under Codex inherit a different (possibly broader) filesystem/network capability than under Claude Code hooks is unaddressed.  _(security)_
- PRD/조사 어디에도 이 milestone들이 어떤 test 파일 위치(예: plugins/mccp/scripts/lib/tests/*)에 assertion을 남길지 규정하지 않음 — 라이브 Codex CLI 실행은 CI에서 반복 불가능하므로 mock/stub 기반 단위 테스트(예: Codex hook event payload를 흉내낸 fixture)로 이벤트 재배선을 검증하는 전략이 빠져 있음  _(test)_
- 각 milestone의 'Acceptance'/'Validation' 절이 아직 없다(plan 미작성) — 5개 milestone 각각에 대해 재현 가능한 pass/fail 오라클(단위 테스트 vs 수동 실측 vs 라이브 dogfood)을 구분해 명시해야 함  _(test)_
- hook 재배선(Stop 등) 회귀 시 기존 Claude Code 경로가 깨지지 않는지 지키는 회귀 스위트가 언급되지 않음 — hooks.json 변경은 공유 표면이라 Claude Code용 hook 테스트가 그대로 green이어야 한다는 가드가 빠짐  _(test)_
- '미열거 잔여 0' 메트릭(Metric 4)을 어떻게 기계적으로 재검증할지(체크리스트 대조 스크립트 등) 불명 — 사람의 성실성에 의존하지 않는다고 선언했지만 그 대조를 자동화하는 수단이 PRD에 없음  _(test)_
- PRD names several coupling surfaces (agents/*.md, cost-estimate.js, session-identity.js, hooks/bootstrap.js, evidence-lock.js, codex-invoke.js) as Evidence but the draft plan does not yet exist, so there is no confirmation the eventual plan will actually enumerate each with a concrete file:line-level reuse-vs-extend decision per Milestone — this fan-out cannot verify plan-to-code fidelity since 'draft plan not yet written'.  _(explorer)_
- No investigation yet of hooks/bootstrap.js's '~/.claude/만 탐색' claim against actual code — could not verify whether that module has a single chokepoint (like session-identity.js) worth mirroring, or is scattered across multiple call sites (higher risk / bigger reuse opportunity).  _(explorer)_
- PRD does not name which specific commands/skills already have harness-neutral scaffolding (e.g. env-contract's internal/external klass distinction) that Milestone 1 (harness-truth) observation work could reuse as a measurement template, rather than building bespoke probes.  _(explorer)_

### Patterns to mirror

- CLAUDE.md §3.18 / plugins/mccp/scripts/lib/session-identity.js — 세션 id 해소를 단일 체인 함수(resolveRawSessionId)로 못박은 패턴은 넷째 표면의 나머지 하네스 결합 지점(모델명·도구명 등)에도 '단일 resolver + 하네스별 fallback' 구조로 그대로 재사용 가능한 선례다.  _(architect)_
- CLAUDE.md 결정 1 additive-manifest 패턴(.codex-plugin/ 추가, .claude-plugin/ 유지)을 코드 레벨(agents/*.md, RATE_TABLE 등)에도 '추가만 하고 기존을 안 건드리는' 형태로 확장해 리스크를 낮출 수 있다.  _(architect)_
- §3.12 no-rehash invariant + present-only 필드 선례(§3.13 intent 필드들)는 harness provenance 필드를 receipt에 추가할 때 그대로 적용 가능한 안전한 구조적 패턴이다.  _(architect)_
- plugins/mccp/scripts/lib/codex-invoke.js:114-147 resolveCodexInstallPath — fail-closed classification enum (registry-missing/malformed/plugin-not-installed/install-path-stale) is the existing pattern for validating an external harness's install-path claim before trusting it; any new Codex-to-Claude reviewer resolver should mirror this rather than inventing a new less-strict check.  _(security)_
- CLAUDE.md §3.12 present-only + makeSkeleton-exclusion pattern for adding audit fields without perturbing tracked receipt hashes — directly applicable to the proposed harness/produced_by field.  _(security)_
- plugins/mccp/scripts/lib/session-identity.js:27 explicit non-sanitizing resolver + two documented sanitize choke points (msw-events SESSION_ID_RE, observer-sessions sanitize) — the correct model for adding a CODEX_SESSION_ID source: extend the priority chain, but audit every consumer for its own sanitize call rather than sanitizing centrally.  _(security)_
- CLAUDE.md §3.3 fail-closed classification matrix (15 classifications, exactly 2 non-failure) — the gate-ingress milestone should produce an equivalently exhaustive, enumerated classification table for the new Codex ingress rather than an ad hoc boolean allow/block.  _(security)_
- plugins/mccp/scripts/lib/tests/*.test.js — node --test 컨벤션, Codex 관련 test는 MCCP_CODEX_DISABLED=1 하에 실행 (CLAUDE.md §3.4)  _(test)_
- schema.js의 present-only field + makeSkeleton 미포함 패턴(§3.13, §3.13.2) — 하네스 출처 필드 추가 시 hash-stability를 지키는 선례로 재사용 가능  _(test)_
- env-contract/lint.js L1~L10 — 새 env 토글(예: 하네스 판별용)을 추가할 때 evidence-debt·역방향 스캔 패턴을 그대로 적용 가능  _(test)_
- impeccable-detect.js의 '오라클이 실제로 열릴 이름을 지목' + shadowed/eclipsed 모호성 처리 패턴(§3.17) — Codex/Claude 이중 하네스 탐지 오라클 설계 시 직접 참고할 선례  _(test)_
- plugins/mccp/scripts/lib/session-identity.js — single resolver function + exported name-list constant + scan-based absence test; template for any new cross-harness identity/env chain (e.g. CODEX_SESSION_ID).  _(explorer)_
- plugins/mccp/scripts/lib/env-contract/registry.js + lint.js (L1-L10) — canonical place to register and validate any new env toggle this PRD introduces; avoid ad hoc process.env reads.  _(explorer)_
- CLAUDE.md §3.12/§3.13 present-only field + makeSkeleton-exclusion convention — reuse verbatim for any new receipt provenance field (harness/produced_by) instead of inventing a new schema-safety mechanism.  _(explorer)_
- §3.17 M3 'oracle resolves the callable name, carrier line communicates it across tool-call boundaries' pattern (impeccable-detect.js / impeccable_invocation stderr line) — directly analogous shape to the Codex skill-tool-name resolution problem in receipt-skill.js.  _(explorer)_

## Files to Change

| File | Action | Why |
|---|---|---|
| `scripts/codex-probe/snapshot.js` | CREATE | 순수층 — Codex 홈 상태를 `{config_sha256, mccp_keys, plugin_cache, codex_version}`로 투영하고 두 스냅샷을 대조한다. 원복 판정의 자 |
| `scripts/codex-probe/probe-hook.js` | CREATE | 계측기 — hook 자식 프로세스로 실행돼 stdin 이벤트 전문과 env 투영을 JSONL로 append하고 exit 0. A1·A5·A6이 한 아티팩트에서 나온다 |
| `scripts/codex-probe/report.js` | CREATE | 순수층 — 프로브 로그 + 스냅샷 2건 → 측정 레코드. 축별 verdict를 `measured` / `unmeasured` 둘로만 낸다 |
| `scripts/codex-probe/cli.js` | CREATE | 실행층 — `snapshot`/`report`/`teardown`/`run` 서브커맨드. `codex` spawn(argv 배열·no-shell) · 무조건 teardown · DD10 pre-write gate의 호출 지점 |
| `scripts/codex-probe/redact-gate.js` | CREATE | DD10 — git-tracked 산출물을 직렬화 직전에 `scanResidual`로 검사하고 hit이 하나라도 있으면 **쓰기를 거부**하는 단일 chokepoint |
| `scripts/codex-probe/coupling-inventory.js` | CREATE | 하네스 결합 지점 **선언 목록** + `COUPLING_INVENTORY_CEILING`. Metric 4의 "미열거 잔여 0"이 사람의 성실성에 걸리지 않게 한다 |
| `scripts/codex-probe/scan-coupling.js` | CREATE | 스캐너 — 선언 목록과 실제 표면을 경계 일치로 대조해 미열거·화석 양방향을 보고 |
| `scripts/tests/codex-probe.test.js` | CREATE | `node --test` — 순수층 부정 케이스 + 스캐너 양방향 래칫 + 상한 짝 단언 |
| `docs/codex-harness-portability/m1-harness-truth.md` | CREATE | 판정 문서 — 7축 측정값 · 미측정으로 남은 것 · M2~M5가 물려받는 값 |
| `.claude/_meta/data/2026-09-09-codex-harness-truth.json` | CREATE | 측정 원자료 컨테이너 |
| `.claude/prds/codex-harness-portability.prd.md` | UPDATE | milestone 1 행 status + Plan 경로 · Open Questions 2~5 갱신 · Evidence 중 본 측정과 어긋나는 항목 정정 |
| `.claude/PRPs/reports/codex-harness-portability-m1-report.md` | CREATE | 구현 보고 |

배포 표면 밖임의 근거: `.claude-plugin/marketplace.json`의 `source`가 `./plugins/mccp`이므로
위 파일 중 사용자에게 전달되는 것은 **0개**다. `plugins/mccp/` 아래를 한 파일도 건드리지
않는다 — M1은 관측이고, 관측이 배선을 바꾸면 그 다음 측정은 자기가 바꾼 것을 재게 된다(UI12).

## Design Decisions

<!-- 저자 정당화. 리뷰어 focus에는 주입되지 않는다. -->

**DD1 — 계측은 `CODEX_HOME` 격리 위에 세운다.** 본 세션 실측: `CODEX_HOME=<scratch> codex
plugin marketplace add …`가 scratch에 `config.toml`을 만들고 실제 `~/.codex/config.toml`
sha256은 전후 동일(`9a03a94f…`)했다. 대안이었던 "실제 홈을 쓰고 나중에 복원"은 두 축에서
열등하다 — 복원 실패가 곧 운영자 환경 손상이고, Codex가 통상 운용 중 같은 파일을 갱신하므로
복원 성공 여부를 whole-file 대조로 판정할 수 없다. 격리는 그 판정 자체를 불필요하게 만든다.

**DD2 — scratch home은 `/tmp` 밖, git-dir tmp 아래에 둔다.** `/tmp` 하위에서
`Refusing to create helper binaries under temporary dir "/tmp"` 경고가 실측됐다(진행은 됨).
`$(git rev-parse --git-path mccp/tmp)/codex-probe-home`은 worktree 밖이라 tracked 표면을
오염시키지 않고, mccp가 이미 쓰는 관례라 새 경로 규약을 만들지 않는다.

**DD3 — PRD Metric 5의 기준을 정정한다.** PRD는 "측정 전후 `~/.codex/config.toml` sha256
일치 + 잔여 캐시 0"을 요구하고 근거로 `da2344ed…`를 인용한다. 실측값은 `9a03a94f…`이며
파일에는 `[tui.model_availability_nux]`·`[projects…] trust_level`처럼 **Codex가 스스로 쓰는**
블록이 있다. 즉 그 지표는 mccp와 무관한 이유로 붉어진다. 대체 기준은 둘이다 — (a) 격리
하에 실제 홈이 **접근조차 되지 않음**, (b) 잔여 판정을 "mccp 귀속 키 부재 + 캐시 엔트리 0"로
정의. (b)가 필요한 이유도 실측이다: 이전 조사의 uninstall 후에도
`~/.codex/plugins/cache/mccp/`가 **빈 디렉토리로 잔존**한다. "잔여 캐시 0"이 디렉토리 부재를
뜻했다면 그 문장은 이미 거짓이었다.

**DD4 — 바이너리 문자열은 계측기로 쓰지 않는다.** 정확 일치 grep이 `Stop`·`Interrupt`·`stop`
3건만 냈고 그것도 serde 리터럴이 인접 blob으로 묶여 있어 enum 열거를 지지하지 못한다. PRD가
`[정황]`이라 표시한 이유가 이것이며, M1은 그 표시를 `[실측]`으로 **올리는** milestone이므로
같은 도구를 다시 쓰면 아무것도 올라가지 않는다. 판정은 실행 결과로만 낸다.

**DD5 — 프로브 hook과 mccp 실제 hook을 둘 다 돌린다.** 프로브는 우리가 쓴 것이라 이벤트
전문·env·발화 시각을 전부 남길 수 있어 A1·A2·A5·A6의 결정적 계측기다. 그러나 A3(플러그인의
`hooks/hooks.json`이 설치만으로 발견되는가)는 프로브로 답할 수 없다 — 그 질문의 주어가
mccp 자신이기 때문이다. 그래서 run은 둘이고 답하는 축이 다르다.

**DD6 — `plugin_hooks removed false`를 신호로 취급하되 판정으로 쓰지 않는다.**
`codex features list` 실측에서 `hooks stable true`와 나란히 `plugin_hooks removed false`가
나왔다. 이름과 상태가 A3에 정확히 겹치지만 `removed`가 "기능이 제거됨"인지 "플래그가
은퇴함"인지는 어휘가 확정되지 않았다 — 같은 목록의 `recommended_plugins stable false`가
"stable인데 기본 off"이므로 상태어와 값이 독립임은 보이나 `removed`의 뜻은 그로부터
따라오지 않는다. 그래서 이것은 A3의 **가설**이고, 판정은 설치 후 발화 관측이 한다.

**DD7 — 측정 결과가 "불가"여도 그것이 정상 산출이다.** hook을 바인딩할 수 없다는 결론은
실패가 아니라 M2의 범위를 정하는 값이다(PRD Risks 2행이 이미 그 처분을 요구한다). 반올림
금지를 문서 안의 다짐이 아니라 `report.js`의 구조로 강제한다 — verdict enum이
`measured`/`unmeasured` 둘뿐이고 "아마 된다"에 해당하는 값이 **없다**.

**DD8 — 결합 지점 열거를 M1이 소유한다.** PRD Metric 4에 소유 milestone이 없다. 열거는
관측이므로 M1이 맞고, 각 항목의 **처분 실행**은 M2~M5가 소유한다 — 목록의 각 행이 자기
소유 milestone을 이름으로 갖는다. 스캐너를 붙이는 이유는 PRD가 "사람의 성실성이 아니라
대조 가능한 목록"을 요구했기 때문이고, 목록만 두면 다음 사이클에 조용히 낡는다.

**DD9 — 인증 사본은 계측의 일부이므로 계측처럼 다룬다.** 격리된 home에는 `auth.json`이 없어
모델 호출 경로가 필요한 이벤트를 관측하려면 운영자 자신의 자격증명 사본이 필요하다. 사본은
`0600`으로 git-dir tmp 안에만 두고 teardown에서 지우며, 측정 레코드·판정 문서·로그 어디에도
그 내용을 싣지 않는다(`probe-hook.js`의 env 투영이 **allowlist**인 이유). 모델 호출 없이
도달 가능한 이벤트가 있으면 그쪽을 우선한다 — Task 2-0이 그것을 먼저 묻는다.

사본을 만드는 방법은 **명시한다**(security R1 M1 흡수). `fs.copyFileSync`의 mode 보존은 이 호스트에서 실측으로 성립했지만(`0600` → `0600`) 그것은 libuv 복사 경로의 구현 세부이지 Node 공개 API의 보장이 아니며, 파일시스템에 따라 갈릴 수 있다. 이 저장소는 비밀을 담는 파일마다 이미 원자적 생성 관용구를 쓴다 — `fs.openSync(p, "wx", 0o600)`(`pr-phase-lock.js:470-473` · `goal-phase-lock.js:252` · `ultracode-phase-lock.js:268`) 또는 `fs.writeFileSync(p, data, {flag:"wx", mode:0o600})`(`gitignore-provision.js:897` · `codex-policy.js:123`). auth 사본도 그 관용구로 만든다.

`trust_mode`는 **자기 보고이지 관측이 아니다**(security R1 M2 흡수). `probe-hook.js`는 hook 자식이라 부모 `codex`가 `--dangerously-bypass-hook-trust`로 떴는지 볼 수 없다. 그래서 그 값이 진실이려면 **플래그를 세우는 자리와 값을 세우는 자리가 하나**여야 한다 — `cli.js run`이 유일한 소유 지점이고, 거기서 CLI 플래그와 `MCCP_PROBE_TRUST_MODE`를 **같은 분기에서 함께** 설정한다. 두 곳에서 따로 설정하면 M1.5가 리뷰어 계약에서 겪은 것과 같은 드리프트가 열린다. 이 결속은 test가 단언한다.

**DD10 — redaction은 producer의 한 단계가 아니라 쓰기 전 단일 관문이다.** (security R1 C1 흡수.)
초안은 redaction을 `probe-hook.js`의 env·event 두 필드에만 걸었다. 그러면 **git-tracked 산출물에**
절대경로를 싣는 다른 두 생산자가 그대로 남는다 — `snapshot.js`의 `plugin_cache_entries[]`(DD3-b가
보고하려는 잔여물이 곧 `~/.codex/plugins/cache/mccp/...` 절대경로다)와 `probe-hook.js` 자신의
`argv`(매 줄 `argv[0]` node 경로 · `argv[1]` worktree 절대경로). 즉 "tracked 산출물에 절대경로 0"이라는
선언이 두 생산자에 대해 검사되지 않은 채였고, 이 저장소가 `meta.cwd` sanctioned re-seal로 이미 한 번
갚은 유출을 새 필드에서 재개방한다(§3.12).

그래서 관문은 **직렬화 직전 한 곳**이다. `redact-gate.js`가 tracked 두 산출물
(`.claude/_meta/data/2026-09-09-codex-harness-truth.json` · `docs/codex-harness-portability/m1-harness-truth.md`)을
쓰는 유일한 통로가 되고, 직렬화된 객체 전체에 `scanResidual`(`scripts/test-suite/redact.js`)을 돌려
`hits.length === 0 && !truncated`가 아니면 **쓰지 않는다**. 빈 배열 하나로 "깨끗함"과 "상한에 걸려 못 봤음"을
같이 표현하지 않는 것이 그 모듈의 계약이므로 두 조건을 함께 본다.

**fail-open이 아니라 fail-closed인 이유**: 유출을 못 쓰게 막는 것과 유출을 쓰고 경고하는 것은 다르고,
후자는 git 이력에 남아 되돌릴 수 없다. 다만 관문은 **판정만** 하고 값을 고치지 않는다 — 조용한 치환은
무엇이 새려 했는지를 지운다. 고치는 것은 각 생산자의 책임이고 관문은 그것이 됐는지를 잰다.

## Tasks

### Task 1: 계측 하네스 골격

- **Action**: `scripts/codex-probe/`에 네 파일을 만든다.
  - `snapshot.js` — `capture({codexHome})` → `{schema, at, codex_version, config_sha256, config_mccp_keys[], plugin_cache_entries[]}`; `diff(before, after)` → `{clean:boolean, added[], removed[], changed[]}`. `config_mccp_keys`는 TOML 최상위 테이블 중 `marketplaces.mccp`·`plugins."mccp@mccp"`처럼 **mccp 귀속**인 것만 뽑는다(DD3-b). `plugin_cache_entries[]`는 **실제 홈**을 잴 때 `~/.codex/plugins/cache/mccp/...` 절대경로를 담으므로 반환 전에 DD10의 redaction을 통과한다 — DD3-b가 보고하려는 잔여물이 정확히 그 경로이므로 이 필드는 설계상 비지 않는다(security R1 C1).
  - `probe-hook.js` — stdin 전문을 JSON으로 읽고, `PROBE_LOG` 경로에 `{at, argv, event, env, run}` 한 줄을 append한 뒤 **항상 exit 0**.
    - `env` 투영은 **와일드카드 없는 닫힌 정확 이름 집합**이다(security R1 H1 흡수). 값을 싣는 이름은 정확히 이 여덟이다 — `CLAUDE_PLUGIN_ROOT` · `CLAUDE_PLUGIN_DATA` · `MCCP_PLUGIN_ROOT` · `CODEX_HOME` · `CODEX_SESSION_ID` · `CODEX_THREAD_ID` · `PWD` · `CWD`. **접두·접미 와일드카드(`CODEX_*` · `*_SESSION_ID` · `*_PID`)를 쓰지 않는다** — 이름을 미리 알 수 없는 미래의 `CODEX_API_KEY`/`CODEX_AUTH_TOKEN`이 값째로 실린다. 이 규칙은 plan 자신이 `## Patterns to Mirror`에 선언한 "이름은 경계 일치로 센다"의 적용이다.
    - 그 밖의 모든 env 이름은 **이름만** 기록한다(`names_only[]`, 값 없음). A5는 "세션 id를 나르는 이름이 무엇인가"를 묻는 축이므로 이름 발견은 보존되고 값은 절대 나가지 않는다.
    - **2차 방어**: `/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH/i`에 걸리는 이름은 위 여덟에 들어 있더라도 값을 싣지 않는다. 목록 편집 실수가 곧 유출이 되지 않게 한다.
    - `argv`는 각 원소를 `path.basename()`으로 접는다(security R1 C1 흡수). A6가 필요로 하는 진단값은 "어느 스크립트가 어떤 플래그로 불렸나"이지 "디스크 어디에 있나"가 아니며, `argv[0]`(nvm/asdf node 경로)과 `argv[1]`(worktree 절대경로)은 매 줄마다 계정명을 나른다.
    - `run`은 provenance다 — `{run_id, trust_mode, codex_version, entrypoint}`. `trust_mode`는 `trusted` / `bypassed` / `unknown` 셋이고 **A1 승격의 필수 입력**이다(Task 3-2).
  - `report.js` — 로그와 스냅샷을 읽어 축별 레코드를 만든다. verdict enum은 `measured` / `unmeasured` 둘뿐(DD7). 축이 `measured`이면 `value` + `evidence`(로그 줄 인덱스)를 함께 요구하고, 하나라도 없으면 `unmeasured`로 접는다.
  - `cli.js` — `snapshot` / `report` / `teardown` / `run` 서브커맨드. spawn·파일 IO만 하고 판정은 위 세 모듈이 한다. 안전 요건 셋(security R1 H2 흡수):
    - `codex` 바이너리는 **argv 배열 + `shell:false`** 로만 spawn한다. 셸 문자열 보간 금지 — 선례는 `plugins/mccp/scripts/lib/codex-invoke.js:492-497`(`spawnSync(process.execPath, args, {...})`)이고 같은 파일 헤더가 PATH 해소 node에 기대지 말라고 적는다.
    - `run`은 Task 2·3 시퀀스 전체를 감싸고 **모든 종료 경로에서 `teardown`을 강제 호출**한다(`try/finally`). 크래시·인증 정지는 plan Risks가 이미 개연으로 적은 경로이고, 그때 `0600` auth 사본이 git-dir tmp에 무기한 남는다. 성공 경로만 지우는 것은 teardown이 아니다.
    - `teardown`은 **이전 실행의 잔재도** 지운다 — 진입 시 scratch home과 auth 사본의 존재를 PID+mtime으로 검사해 stale이면 회수한다(§3.6의 lock 관용구 형태). 직전 호출 직후의 부재만 단언하면 중단된 과거 실행은 영원히 안 보인다.
- **Mirror**: `scripts/test-suite/{enumerate,run}.js`의 순수/실행 2층 분리.
- **Validate**: `node --test scripts/tests/codex-probe.test.js` — 합성 입력으로 다음을 단언한다.
  - (a) 증거 없는 `measured` 승격이 거부된다.
  - (b) 빈 로그가 전 축 `unmeasured`가 된다.
  - (c) env 투영에서 **와일드카드 매칭이 일어나지 않는다** — `CODEX_API_KEY=secret`은 값 없는 `names_only` 항목이 되고 어떤 필드에도 `secret`이 나타나지 않는다.
  - (d) 닫힌 목록에 들어 있더라도 secret 형태 이름(`CODEX_AUTH_TOKEN`)은 2차 방어로 값이 억제된다.
  - (e) `argv`가 basename으로 접혀 절대경로를 담지 않는다.
  - (f) `trust_mode=bypassed` 줄은 A1을 `measured`로 승격시키지 못한다.
  - (g) DD10 pre-write gate가 잔여 절대경로를 담은 객체에 대해 **쓰기를 거부**한다(fail-closed).
  - (h) producer→consumer e2e — `probe-hook.js`를 실제 자식 프로세스로 spawn해 만든 JSONL을 `report.js`가 파싱해 축으로 승격시킨다(합성 로그만 쓰는 단위 test는 producer 키 이름 변경을 못 잡는다).

### Task 2: 격리 계측 실행 — A1~A6

- **Action**: `CODEX_HOME=$(git rev-parse --git-path mccp/tmp)/codex-probe-home` 아래에서 실행한다.
  - **2-0 진입점 선별** — `[hooks]`를 **실제로 파싱하는** Codex 진입점을 찾는다. 본 세션 실측에서 `codex doctor`와 `codex plugin list`는 잘못된 이벤트 이름·타입에도 exit 0이라 파싱하지 않는다. 모델 호출 없이 hook dispatch에 도달하는 경로가 있으면 그것을 쓰고, 없으면 `codex exec`에 최단 프롬프트를 쓴다(DD9).
  - **2-1 A1 발화** — 프로브 hook을 `config.toml [hooks]`에 등록하고 진입점을 돌려 로그가 생기는지 본다. 생기면 `hook_fires=measured/true`.
  - **2-2 A2 이벤트 enum** — mccp가 쓰는 8종(`UserPromptExpansion` · `PreToolUse` · `PostToolUse` · `PostToolUseFailure` · `SessionStart` · `SessionEnd` · `PreCompact` · `Stop`)을 하나씩 등록해 수용/거부를 가른다. **`Stop`이 이 축의 핵심**(PRD OQ2)이며, 수용되더라도 실제 발화까지 봐야 `measured`다 — 설정이 받는 것과 엔진이 부르는 것은 별개 사실이다.
  - **2-3 A5 env** — 로그의 `env` 투영에서 `CLAUDE_PLUGIN_ROOT` 주입 여부(OQ4)와 세션 id를 나르는 이름(OQ5)을 읽는다. 이름이 무엇이든 **관측된 그대로** 적는다 — `CODEX_SESSION_ID`일 것이라 가정하지 않는다.
  - **2-4 A6 payload shape** — 이벤트 JSON의 키 집합을 `plugins/mccp/scripts/hooks/`의 소비 지점과 대조한다. 최소한 `receipt-skill.js:152`가 요구하는 `tool_name`과 `Stop` 소비 7건이 읽는 필드를 확인한다. 이름이 같아도 필드가 다르면 M2는 재배선이 아니라 재작성이다.
- **Mirror**: `docs/codex-intent-context/reviewer-contract-compliance.md`의 "production 경로로 측정한다" 원칙 — 합성 이벤트가 아니라 Codex가 실제로 보내는 것을 받는다.
- **Validate**: `.claude/_meta/data/2026-09-09-codex-harness-truth.json`에 run 원소가 쌓이고, `report.js`가 A1·A2·A5·A6에 `measured` 또는 사유가 붙은 `unmeasured`를 낸다. 축이 하나도 비어 있지 않다.

### Task 3: A3 자동 발견 + A4 trust

- **Action**: 같은 격리 home에서 mccp 자체를 설치한다(`codex plugin marketplace add` → `codex plugin add mccp@mccp`).
  - **3-1 A3** — 설치만으로 `plugins/mccp/hooks/hooks.json`의 entry가 발견돼 발화하는지 본다. 발화하지 않으면 `config.toml [hooks]` 수동 등록이 유일 경로라는 뜻이고, 그 사실은 M2의 범위이자 `/mccp:setup` Codex 분기의 근거가 된다(그 분기 구현 자체는 UI8로 out of scope).
  - **3-2 A4 trust** — hook이 `trusted`가 되는 절차를 관측한다. `HookStateToml{enabled, trusted_hash}`가 어떤 입력에서 채워지는지, 승인이 대화형인지, `--dangerously-bypass-hook-trust` 없이 성립하는지. **bypass 플래그로 성립시킨 발화는 A1의 증거로 쓰지 않는다** — 그것은 "신뢰 절차를 지나 발화한다"가 아니라 "신뢰 절차를 껐다"이므로 다른 사실이다.
  - **3-3** DD6의 `plugin_hooks removed false` 가설을 3-1 결과와 대조해 판정 문서에 결론을 적는다.
- **Mirror**: `plugins/mccp/scripts/lib/impeccable-detect.js`(§3.17) — 모호하면 답하지 않는다. 발견 경로가 둘 이상으로 갈리면 `shadowed` 형태로 "판정 불가"를 적고 추정하지 않는다.
- **Validate**: A3·A4가 `measured`이고, A1의 증거 줄이 bypass 플래그 없이 얻어진 것임이 레코드에서 구분된다.

### Task 4: 결합 지점 열거 + 스캐너 (Metric 4)

- **Action**: `coupling-inventory.js`에 결합 지점을 `{name, file, axis, disposition, owner_milestone}`로 선언하고 `COUPLING_INVENTORY_CEILING`을 짝으로 둔다. PRD Evidence가 이미 지목한 여섯을 최소 원소로 갖는다 — `plugins/mccp/agents/*.md`(도구명·모델명) · `plugins/mccp/scripts/lib/cost-estimate.js:9-12` · `plugins/mccp/scripts/lib/session-identity.js:53-60` · `plugins/mccp/scripts/hooks/bootstrap.js` · `plugins/mccp/scripts/receipt/evidence-lock.js:78` · `plugins/mccp/scripts/lib/codex-invoke.js:43`. `scan-coupling.js`는 양방향으로 검사한다 — 선언에 없는 결합 표면이 나타나면 **미열거**, 선언에 있는데 표면에서 사라졌으면 **화석**.
- **Mirror**: `plugins/mccp/scripts/lib/env-contract/evidence-debt.js`의 상한 상수 + 짝 단언(§3.17 M6), `measure-evidence.js`의 경계 일치.
- **Validate**: `node scripts/codex-probe/scan-coupling.js --json`이 `unlisted:0`을 내고, test가 `CEILING === inventory.length`를 단언한다. 목록을 늘리려면 상수를 올리는 별도 편집이 필요하다.

### Task 5: 판정 문서 + 원자료

- **Action**: `docs/codex-harness-portability/m1-harness-truth.md`를 쓴다. 축별 측정값 · 사전에 선언한 판정 규칙 · **미측정으로 남은 것과 그 이유** · M2~M5가 물려받는 값 · CLI 버전(0.153.4, UI13). 원자료는 `.claude/_meta/data/2026-09-09-codex-harness-truth.json`에 `{schema, runs:[…]}`로 쌓는다. 문서는 원자료를 해석할 뿐 숫자를 새로 만들지 않는다.
- **Mirror**: `docs/codex-intent-context/reviewer-contract-compliance.md` — 특히 "이 측정이 주장하지 않는 것" 절을 반드시 갖는다.
- **Validate**: 문서의 모든 수치가 원자료 JSON에서 인용 가능하고, 축 7개(A1~A6 + 원복) 전부에 verdict가 있다.

### Task 6: PRD 갱신

- **Action**: `.claude/prds/codex-harness-portability.prd.md`에서 — milestone 1 행의 status를
  **`report.js`의 `milestone_closeable`에 따라** 정하고(`ok:true`면 `complete`, 아니면 `in-progress`와 그 사유)
  `Plan` 셀에 이 plan 경로를 넣는다 (리뷰 R1 invariant-HIGH 흡수 — 관측을 하나도 못 얻은 실행이 PRD 표에서
  완료로 읽히면 M2~M5는 UI12가 금지한 "값 없이 확정된 범위" 위에 선다. 하한은 A1이다) · Open Questions 2·3·4·5를 측정값으로 갱신(닫힌 것은 닫고, 열린 채면 왜 열려 있는지) · Evidence와 Success Metrics 중 본 측정과 어긋나는 항목을 정정한다. 정정 대상은 최소 둘로 이미 확인됐다: config.toml sha256 `da2344ed…`(현행 `9a03a94f…`, 그리고 whole-file 대조가 애초에 유효한 지표가 아님) · "잔여 캐시 0"(빈 디렉토리 잔존). **낡은 문장을 지우지 말고 무엇이 왜 달라졌는지를 함께 남긴다**(§3.7·§3.17 형태).
- **Mirror**: `.claude/_meta/2026-09-09-codex-harness-portability.md`의 "Addendum — 철회된 판정 4건" 절 형태.
- **Validate**: milestone 1 행의 status 셀이 `report.js`의 `milestone_closeable.ok`와 일치하고,
  Open Questions의 각 항목이 `[x]`이거나 열린 사유를 갖는다.
  (초안의 `grep -c 'pending' == 4`는 **산술적으로 통과 불가능**했다 — PRD에는 milestone 표 밖에도
  `pending`이 2건 있어 표가 5행에서 4행으로 줄어도 총계는 7에서 6이 될 뿐이다. 실측으로 확인했다:
  갱신 후 6. 통과할 수 없는 검사는 무시되거나 재작성되므로 검사가 아니다. 리뷰 R1 test-MEDIUM 흡수.)

### Task 7: 구현 보고

- **Action**: `.claude/PRPs/reports/codex-harness-portability-m1-report.md` — 무엇을 측정했고 무엇이 미충족이며 어떤 이탈이 있었는지. 라이브 완주 산출물의 경로를 명시한다.
- **Mirror**: 기존 `.claude/PRPs/reports/` 형식.
- **Validate**: 미충족 항목이 있으면 반올림 없이 `## 미충족`에 열거된다.

## Validation

```bash
# 1. 순수층 단위 test (Codex 미호출)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 scripts/tests/codex-probe.test.js

# 2. 결합 지점 열거 대조 — 미열거 0 (Metric 4)
node scripts/codex-probe/scan-coupling.js --json

# 3. 격리 계측 (라이브) — 실행 전후로 실제 홈이 접근조차 되지 않음을 확인
sha256sum ~/.codex/config.toml            # BEFORE
CODEX_HOME="$(git rev-parse --git-path mccp/tmp)/codex-probe-home" \
  node scripts/codex-probe/cli.js snapshot --out /tmp/before.json
#   … Task 2·3의 측정 실행 …
CODEX_HOME="$(git rev-parse --git-path mccp/tmp)/codex-probe-home" \
  node scripts/codex-probe/cli.js snapshot --out /tmp/after.json
sha256sum ~/.codex/config.toml            # AFTER — BEFORE와 동일해야 한다

# 4. 측정 레코드 산출 — 축 7개 전부에 verdict가 있는지
node scripts/codex-probe/cli.js report \
  --log "$(git rev-parse --git-path mccp/tmp)/codex-probe.jsonl" \
  --before /tmp/before.json --after /tmp/after.json --json

# 5. 버전 동반 기록 (UI13)
codex --version

# 6. 배포 표면 무변경 — plugins/mccp/ 아래 변경 0
git diff --name-only origin/main...HEAD -- plugins/mccp | wc -l   # 0이어야 한다

# 7. version 미선언 (UI4 · §3.7)
node scripts/version-declaration-guard.js

# 8. 머지 사고 검증 (§3.5.1)
git diff --diff-filter=D --name-only origin/main...HEAD

# 9. DD10 pre-write gate — tracked 산출물에 잔여 절대경로 0 (security R1 C1)
node scripts/codex-probe/redact-gate.js --check .claude/_meta/data/2026-09-09-codex-harness-truth.json
node scripts/codex-probe/redact-gate.js --check docs/codex-harness-portability/m1-harness-truth.md

# 10. teardown 잔재 부재 (security R1 H2) — scratch home + auth 사본
test ! -e "$(git rev-parse --git-path mccp/tmp)/codex-probe-home"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `[hooks]`를 파싱하는 진입점이 모델 호출 경로뿐이라 계측에 Codex 쿼터·비용이 든다 | 중 | Task 2-0이 비모델 경로를 **먼저** 찾는다. 없으면 최단 프롬프트 1회로 제한하고 비용을 레코드에 적는다 |
| 격리 home에 `auth.json`이 없어 진입점이 인증에서 멎는다 | 중 | 운영자 자신의 사본을 `0600`으로 git-dir tmp 안에만 두고 teardown에서 삭제(DD9). 로그·문서에 내용을 싣지 않는다 |
| `Stop`이 설정에서 수용되지만 실제로 발화하지 않는다 | 중 | A2의 `measured` 조건이 "수용"이 아니라 "발화 관측"이다. 수용만 확인된 상태는 `unmeasured`로 남는다 |
| bypass 플래그로 얻은 발화를 A1의 증거로 오인한다 | 중 | Task 3-2가 두 사실을 레코드에서 분리한다. bypass 하 발화는 A1을 승격시키지 않는다 |
| 프로브 env 투영이 자격증명을 로그로 옮긴다 | 낮음 | allowlist 투영(Task 1). 전체 env 덤프를 만들지 않는다 |
| 계측이 이 worktree의 `.claude/state`·`.claude/receipts`에 실제 쓰기를 유발한다 | 중 | 계측 cwd를 폐기 가능한 scratch git 저장소로 두고, `plugins/mccp/` 아래를 한 파일도 고치지 않는다 |
| 측정 결과가 "hook 바인딩 불가"로 나와 M2~M5가 흔들린다 | 중 | 그것이 정상 산출이다(DD7). PRD Risks 2행이 이미 7건의 처분을 명시 결정으로 요구한다 — 조용한 소실만 금지된다 |
| Codex 0.153.4에서만 참인 값을 버전 없이 인용한다 | 중 | 모든 레코드에 `codex_version`이 필수 키다(UI13). 없으면 `report.js`가 축을 `unmeasured`로 접는다 |
| 두 하네스가 같은 저장소에서 동시에 돌아 lock·ledger가 경합한다 | 낮음 | 계측은 격리 home + scratch cwd라 이 worktree의 lock을 잡지 않는다. 동시 실행은 하지 않는다 |

## Acceptance

- [x] All tasks complete
- [x] Validation passes
- [x] Patterns mirrored, not reinvented
- [x] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)

라이브 완주가 반드시 내야 하는 산출물:

1. `$(git rev-parse --git-path mccp/tmp)/codex-probe.jsonl` — **비어 있지 않은** 프로브 로그.
   한 줄 이상이 Codex가 실제로 보낸 이벤트 전문을 담는다. 이 파일이 비면 A1은 `unmeasured`이고
   M1은 "hook이 발화하는 것을 보았다"를 주장하지 않는다.
2. `.claude/_meta/data/2026-09-09-codex-harness-truth.json` — `runs` 배열에 원소 ≥1,
   각 원소에 `codex_version` 존재.
3. `docs/codex-harness-portability/m1-harness-truth.md` — A1~A6 + 원복 7축 전부에 verdict가
   있고, `unmeasured` 축마다 사유가 붙어 있다.
4. 측정 전후 `sha256sum ~/.codex/config.toml` 동일 — 격리가 실제로 성립했다는 증거.
5. `node scripts/codex-probe/scan-coupling.js --json`의 `unlisted:0`.
6. tracked 두 산출물이 DD10 관문을 통과 — `scanResidual`의 `hits.length === 0 && !truncated`.
   관문이 거부하면 산출물이 **존재하지 않는다**(쓰지 않으므로). 즉 이 항목은 산출물의 존재 자체가 증거다.
7. teardown 후 scratch `CODEX_HOME`과 auth 사본이 **부재**한다.

`unmeasured`가 남은 채로 이 milestone을 닫는 것은 허용되지만, **그 사실이 판정 문서와 PRD
Open Questions 양쪽에 적혀 있어야** 한다. 닫히지 않은 미지수를 닫힌 것처럼 적는 것이 이
milestone이 막으려는 유일한 실패 모드다(UI15).

## Design Critique

- 트리거: axis b (narrow whitelist) — `impeccable-detect.js`가 plan 본문에서 **참조**되어
  `design_signal=true`가 됐다. `Files to Change`에는 그 파일이 없다(자기 참조 오탐).
- 호출: `Skill(impeccable:impeccable, "critique …")` — 오라클이 해소한 call form
  (source=plugin, version=4.3.0, shadowed=false).
- 라운드: 1 (round=0/cap=2), verdict **CONVERGED**.
- 판정 근거 — 이 plan의 `Files to Change` 산출물은 `.js`·`.md`·`.json`뿐이고
  렌더 surface 확장자(`.html`/`.jsx`/`.tsx`/`.css`)가 **0개**다. 네 Output Constraint 중
  뷰포트를 전제하는 셋(강조색 1개 · raw marker · 항목 수 상한)은 적용 대상이 없고,
  적용 가능한 H15(heading depth ≤ 3)는 실측 통과(`#`/`##`/`###`만 존재, `####` 0건).
- findings: `[]`.

## Design Routing Guide

routing mode: auto (effective at implement stage). At implement the design gate routes these
stage-appropriate impeccable commands; here they are a checklist only. 본 milestone은 렌더
surface를 만들지 않으므로 implement 단계에서도 대부분 강등될 것으로 예상된다.

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


## Codex Implementation Review

- 호출: `node <plugin-root>/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (cap=1, pinnedBy=single-pass — `MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion`)
- classification: `ok` · blocking=false · durationMs=32747 · structured verdict `needs-attention` → `divergent`
- 합치 결론: **미수렴.** 리뷰어는 working tree를 보고 "주장된 8개 구현이 부재하므로 승인할 수 없다"고 답했다.
  이는 결정 자체에 대한 반론이 아니라 **게이트 위치에 대한 관측**이다 — 이 게이트는 command body상
  Phase 3 EXECUTE **앞**에서 돌고, companion은 focus 텍스트가 아니라 working-tree diff를 리뷰한다.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 이 tree에 probe 구현이 없어 8개 안전장치를 검증할 수 없다 | HIGH | DEFER_TO_BACKLOG | 실재하는 지적이나 **이 게이트에서 해소 불가**다. 해소하려면 게이트를 EXECUTE 뒤로 옮겨야 하는데 그것은 command body의 순서 계약을 바꾸는 일이라 이 사이클의 범위가 아니다. 리뷰어가 요구한 "실제 diff 리뷰"는 verdict를 `divergent`로 봉인함으로써 **보장된다** — cross-gate dedupe가 닫힌 채 남아 `/mccp:pr`에서 PR-Codex가 실제 diff에 대해 반드시 발화한다(§3.12) |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: F1 — severity HIGH, PR-Codex가 실제 diff에 대해 답한다 (이 사이클 내 미해소)
- Codex session 참조: threadId `01a083f6-2930-70b2-98af-8f29ee21b90e`

### Security Reviewer

- 호출: `Task(security-reviewer, "review proposed implementation: …")` — 설계 리뷰(구현 전). 리뷰어가 `fs.copyFileSync` mode 보존 · `git rev-parse --git-path`의 worktree-private 해소 · `.claude/_meta/data/`의 gitignore 미적용을 **이 호스트에서 실측**해 확인했다.
- 결과: CRITICAL 1 · HIGH 2 · MEDIUM 2. **전부 흡수**(§3.14 — CRITICAL·HIGH는 그 자리에서). MEDIUM 둘도 같은 코드 지점이라 이연이 더 비싸다.

| # | Severity | Finding | Verdict | 흡수 위치 |
|---|---|---|---|---|
| C1 | CRITICAL | redaction이 `probe-hook.js`의 두 필드에만 걸려 있어, tracked 산출물에 절대경로를 싣는 다른 두 생산자(`snapshot.js`의 `plugin_cache_entries` · `argv`)가 무검사로 남는다. 결정 2가 오라클을 실제 홈으로 옮기면서 그 유출이 **재개방**된다 | ACCEPT_NOW | **DD10** 신설(쓰기 전 단일 fail-closed 관문 + `redact-gate.js`) · Task 1 `snapshot.js`/`argv` 문구 · Validation 9 · Acceptance 6 |
| H1 | HIGH | Task 1 본문이 여전히 와일드카드 allowlist(`CODEX_*` 등)를 지시한다 — 결정 3은 plan 밖 산문일 뿐이라, plan을 기계적으로 읽는 구현자는 고쳐지기 전 동작을 만든다 | ACCEPT_NOW | Task 1 `probe-hook.js` 불릿을 **닫힌 정확 이름 8개 + names_only + regex 2차 방어**로 재작성 · Validate (c)(d) |
| H2 | HIGH | `cli.js`가 `Files to Change`에 없는데 spawn·teardown 등 안전 요건이 전부 그 파일에 걸린다. spawn 형태 무규정 · teardown이 성공 경로에서만 · 과거 중단 실행의 auth 사본이 탐지 불가 | ACCEPT_NOW | `cli.js`·`redact-gate.js` 표에 추가 · argv 배열/no-shell 명시(`codex-invoke.js:492-497` 선례) · `run`의 `try/finally` 무조건 teardown · stale 회수 · Validation 10 · Acceptance 7 |
| M1 | MEDIUM | auth 사본 생성 수단 무규정. `fs.copyFileSync`의 mode 보존은 실측되나 공개 API 보장이 아니다 | ACCEPT_NOW | DD9에 `{flag:"wx", mode:0o600}` 관용구 명시 |
| M2 | MEDIUM | `trust_mode`는 hook 자식이 관측할 수 없어 자기 보고다. 설정 지점이 갈리면 플래그와 값이 드리프트한다 | ACCEPT_NOW | DD9에 **단일 소유 지점**(`cli.js run`이 CLI 플래그와 `MCCP_PROBE_TRUST_MODE`를 같은 분기에서) 명시 + test 단언 |

- 수용된 잔여 위험(리뷰어가 "고칠 필요 없음"으로 명시): sibling worktree 간 scratch home 충돌 없음(`--git-path`가 worktree-private로 해소됨을 실측) · `.git/` 하위 저장은 gitignore 정확성과 무관하게 성립 · CLI 플래그 경로 traversal은 단일 운영자 모델(UI14)에서 수용. 마지막 항목은 **M2+로 이월되는 가드**를 남긴다 — Codex에서 *관측된* 값(예 세션 id 이름)이 파일명·lock 경로에 닿으면 그 지점에 sanitizer가 필요하다(§3.18).
- CRITICAL/HIGH가 **미해소로 남지 않았으므로** MCCP-GATE-STOP 조건에 해당하지 않는다. 다섯 건 모두 이 라운드에서 plan 본문에 흡수됐고, 그 흡수가 곧 구현 지시다.

### Design Review

- `impeccable-detect.js detect --mode implement` → `skill_available=true` · `design_signal=false` · `reason=no-signal` · `silent_skip=true`.
- 해소된 call form: `impeccable:impeccable`(plugin 채널). 즉 skill은 열리지만 **이 diff에 디자인 표면이 없다**.
- 결과: critique retry loop 미발화 · stage-aware routing 미발화 · 2.5.5c grounding capture 미수행 → Phase 3.7은 완전 no-op.
- receipt에 `--impeccable-silent-skip --impeccable-silent-skip-reason "no-signal"`을 forward한다.
- 이는 plan의 `## Design Critique` 절이 예측한 그대로다 — 산출물 확장자가 `.js`·`.md`·`.json`뿐이고 렌더 surface(`.html`/`.jsx`/`.tsx`/`.css`)가 0개다.

## External Research Provenance

- Source PRD: .claude/prds/codex-harness-portability.prd.md
- References section sha256: 418212b71a4c1719a2686c561b4ccfa35258753ea632cf71be75fe0fc9d96efa
- Stamped at: 2026-09-09T01:57:35.679Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Milestone Closure Provenance

- Milestone : 1-harness-truth
- Verdict   : done
- Closure   : .claude/milestone-closures/1-harness-truth.md
- sha256    : sha256:3e7ed5be7bfcee8a4ff7982f18f7ecf7f5c202308175c0fd0d27c80916fb749e
- Stamped at: 2026-09-09T05:40:14Z
