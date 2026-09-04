'use strict';

// env-contract/registry.js — 전 환경변수 토글의 단일 선언 지점 (v1.29.1).
//
// 이 파일이 없던 시절, 같은 사실이 세 곳에 흩어져 있었다: 코드의 파싱 리터럴,
// `state/toggle-snapshot.js`의 `TOGGLE_DEFAULTS`, 그리고 `docs/ENVIRONMENT.md`의 표.
// 셋은 서로를 모르므로 조용히 갈라졌다 — 실측 결과 문서 미등재 22개, 문서에만 있는
// 이름 10개, defaults 모순 1건. 여기서는 선언이 하나이고 나머지는 그 **투영**이다:
//   - `state/toggle-snapshot.js`의 TOGGLE_DEFAULTS는 이 표에서 파생된다 (Task 3).
//   - `docs/ENVIRONMENT.md` 색인은 이 표와 양방향으로 대조된다 (lint L2).
//   - `value.js`는 kind와 default를 여기서만 읽는다 (DD2).
//
// **필드 계약**
//   name      토글 이름. ASCII 대문자·숫자·밑줄만 — homoglyph와 zero-width를
//             표현 불가능하게 만드는 구조적 방어다.
//   kind      'bool' | 'bypass-flag' | 'enum' | 'int' | 'list' | 'string'
//   values    문서에 적히는 **canonical 어휘**. 파서가 받는 별칭 집합보다 좁다 —
//             DD1대로 bool의 문서 표기는 예외 없이 `on | off`이고, `true`/`yes`는
//             받아주되 가르치지는 않는다. enum은 열거 전체, 그 외는 null.
//   default   미설정 시의 값. `bool`/`bypass-flag`는 **반드시 구체값**을 갖는다
//             (DD2 — null이면 "안전 쪽으로 되돌린다"가 가리킬 대상이 없다).
//             비-boolean kind만 `null` + status 'undocumented-default'가 허용된다.
//   polarity  'enable-by-default' | 'disable-by-default' — boolean 전용. 극성을
//             레지스트리가 선언하고 파서는 읽기만 한다(DD2). 호출부가 default를
//             인라인으로 넘기면 같은 토글이 두 파일에서 다른 default를 갖는
//             오늘의 상태가 재생산된다.
//   status    'active' | 'internal' | 'test-only' | 'undocumented-default'
//             | 'retired' | 'absent-by-design' | 'scan-artifact' | 'comment-only'
//             | 'not-consumed'
//
//             `not-consumed` — **mccp가 읽지 않는 서드파티 변수.** impeccable 자신의
//             스크립트가 읽고 이 저장소에는 read site가 존재하지 않는다. 그래서 위
//             `evidence` 계약이 이 부류에 대해 **만족 불가능**하다: read site를 가리키라
//             요구하는데 가리킬 곳이 없고, v1.31.3부터 벤더 사본도 없어 impeccable
//             본문을 가리킬 수도 없다. 필드를 비울 수 없으니 과거에는 무관한 한 줄
//             (`impeccable-detect.js:135`)을 19번 적었다 — 부주의가 아니라 **표현할 수 없는
//             사실을 표현하라고 요구한 스키마**가 만든 결과다. 이 status는 그 사실을 말할
//             수 있게 하고, `evidence`는 read site 대신 **그 계약을 문서화한 앵커**
//             (`docs/environment/*.md`)를 가리킨다. 선례: 아래 `MCCP_PLAN_REVIEW_L1`의
//             `absent-by-design` + `retired.md:1`.
//
//             lint L10이 이 status를 **역방향으로** 검사한다 — 런타임 표면에 그 이름이
//             나타나면 red다. 주장이 «읽지 않는다»이므로 읽기 시작하면 붉어야 한다.
//
//             **L7(사용 예시) 대상에서는 빠지지 않는다.** L7은 status로 분기하지 않고
//             `docs/environment/*.md`의 `### NAME` 앵커를 전수 순회하므로 이 19종은
//             여전히 실행 가능한 사용 예시를 요구받는다. 조용히 검사 밖으로 나가지
//             않게 하려는 **명시적 결정**이다(M5 Task 2).
//   domain    상세 문서 8장 중 하나의 이름.
//   evidence  이 토글을 실제로 읽는 지점의 `path:line`. **default 리터럴이 아니라
//             read site**를 가리킨다 — read site는 모든 토글에 존재하지만 default
//             리터럴은 그렇지 않아서(`process.env.X === '1'`에는 default가 코드로
//             적혀 있지 않다), evidence를 "default를 읽어낸 줄"로 정의하면
//             `undocumented-default` 항목이 만족시킬 수 없는 요구가 된다.
//             **repo-root 상대 경로여야 한다** — git-tracked 소스에 절대경로를 적으면
//             작성자의 홈 디렉토리와 사용자명이 저장소에 영구 기록된다(CLAUDE.md §3.12).
//   summary   색인의 «한 줄 설명». 1문장을 넘기지 않는다.
//   doc       `environment/<domain>.md#<anchor>` 형태의 상세 앵커. domain과 name에서
//             파생되며 수기로 적지 않는다. lint L3이 파일뿐 아니라 앵커까지 해석한다.
//   vocabulary  `values`가 결속되는 **코드 쪽 어휘**. 3형태다(M1 DD2):
//               (a) `'path/to/file.js#CONST'` 배열 리터럴 정적 추출
//               (b) `{ derive: '<name>' }`     명명된 파생자 (`vocabulary.js` DERIVERS)
//               (c) `null` + `vocabularyGap`   읽을 수 없음의 명시 열거
//               `values`가 의미를 갖는 kind(enum·list)는 셋 중 하나를 **반드시** 갖고,
//               사유 없는 `null`은 `build()`가 throw한다. 이 열이 없던 시절 L1~L9는
//               전부 계약 내부의 정합만 봐서, 존재하지 않는 값이 세 표면에 일관되게
//               복제된 뒤 green으로 보고됐다 — 그 구멍을 닫는 것이 이 열의 전부다.
//   vocabularyGap  어휘를 읽을 수 없는 이유. 10자 이상. `vocabulary`와 동시 지정 불가.
//
// mirror: state/toggle-snapshot.js:13 `TOGGLE_DEFAULTS`의 Object.freeze 상수 관례 +
//         같은 파일 `TOGGLE_EXCLUSIONS`의 "제외는 정규식이 아니라 이름이고, 각
//         이름에는 실파일 근거가 붙는다" 규약.

const KINDS = Object.freeze(['bool', 'bypass-flag', 'enum', 'int', 'list', 'string']);
const POLARITIES = Object.freeze(['enable-by-default', 'disable-by-default']);
const STATUSES = Object.freeze([
  'active', 'internal', 'test-only', 'undocumented-default',
  'retired', 'absent-by-design', 'scan-artifact', 'comment-only',
  'not-consumed',
]);
const DOMAINS = Object.freeze([
  'gates', 'review', 'orchestration', 'cost', 'hooks', 'observability', 'external', 'retired',
]);

// 이름의 구조적 형태. ASCII만 허용하므로 homoglyph(키릴 `о`)와 zero-width는
// 애초에 표현할 수 없다 — 별도 정규화 검사를 두지 않아도 되는 이유다.
const NAME_RE = /^[A-Z][A-Z0-9_]*$/;

// bool의 문서 어휘. 파서의 별칭 상위집합은 value.js가 소유한다.
const BOOL_VALUES = Object.freeze(['on', 'off']);
// bypass-flag의 어휘. 활성화 리터럴은 정확히 하나이고 그 밖은 전부 미설정과 같다.
const BYPASS_VALUES = Object.freeze(['1']);

const B = BOOL_VALUES;
const BY = BYPASS_VALUES;
const ON = 'enable-by-default';
const OFF = 'disable-by-default';

// ─────────────────────────────────────────────────────────────────────────────
// 선언표. 열: name, kind, values, default, polarity, status, domain, evidence, summary,
//        vocabulary, vocabularyGap (M1 — 뒤 둘은 가산적이며 enum·list만 채운다)
// ─────────────────────────────────────────────────────────────────────────────
const RAW = [
  // ── gates — receipt · Codex · stop-loop · auto-chain · audited escape ──────
  ['MCCP_RECEIPT_GATE_MODE', 'enum', ['hard', 'soft', 'off'], 'hard', null, 'active', 'gates', 'plugins/mccp/scripts/hooks/receipt-prompt.js:354', 'receipt 게이트 강도.', 'plugins/mccp/scripts/lib/receipt-mode.js#VALID_MODES'],
  ['MCCP_SKIP_RECEIPT', 'bypass-flag', BY, 'off', OFF, 'active', 'gates', 'plugins/mccp/scripts/hooks/receipt-prompt.js:335', 'receipt 게이트 1회 우회.'],
  ['MCCP_RECEIPT_DEBUG', 'bool', B, 'off', OFF, 'active', 'gates', 'plugins/mccp/scripts/hooks/goal-phase-guard.js:196', 'receipt 디버그 출력.'],
  ['MCCP_RECEIPT_DEBUG_LEGACY_INLINE', 'bool', B, 'on', ON, 'active', 'gates', 'plugins/mccp/scripts/hooks/receipt-prompt.js:125', '구형 inline 디버그 유지.'],
  ['MCCP_ALLOW_CODEX_UNAVAILABLE', 'bypass-flag', BY, 'off', OFF, 'active', 'gates', 'plugins/mccp/scripts/lib/codex-invoke.js:176', 'Codex 미가용 시 advisory.'],
  ['MCCP_CODEX_DISABLED', 'bypass-flag', BY, 'off', OFF, 'active', 'gates', 'plugins/mccp/scripts/lib/codex-bridge.js:135', 'Codex 호출 영구 skip.'],
  ['MCCP_CODEX_DESIGN_SCOPE_HONOR', 'bool', B, 'on', ON, 'active', 'gates', 'plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js:275', 'Codex design-scope preamble.'],
  ['MCCP_STOP_LOOP', 'enum', ['off', 'observe', 'enforce'], 'observe', null, 'active', 'gates', 'plugins/mccp/scripts/hooks/stop-review-loop.js:54', 'Stop-loop 게이트 모드.', 'plugins/mccp/scripts/hooks/stop-review-loop.js#STOP_LOOP_VALUES'],
  ['MCCP_STOP_LOOP_CODEX', 'bool', B, 'off', OFF, 'active', 'gates', 'plugins/mccp/scripts/hooks/stop-review-loop.js:59', 'Stop-loop에 Codex 병행.'],
  ['MCCP_AUTO_CHAIN_DISABLE', 'bool', B, 'off', OFF, 'active', 'gates', 'plugins/mccp/scripts/lib/auto-chain.js:141', 'auto-chain 자동 진행 중단.'],
  ['MCCP_AUTO_CHAIN_SKIP_PR', 'bypass-flag', BY, 'off', OFF, 'active', 'gates', 'plugins/mccp/commands/prp-implement.md:1615', 'commit까지만, PR 생략 — LLM이 읽고 판단하며 기계 강제가 없다.'],
  ['MCCP_GATE_ROUND_CAP', 'int', null, '1', null, 'active', 'gates', 'plugins/mccp/scripts/lib/review-single-pass.js:42', '게이트 라운드 상한.'],
  // M3 — 캡의 «강제» 축. 캡 자체는 위 토글이 정하고, 이것은 그 캡을 넘긴 호출을
  // 거부할지(`enforce`) 기록만 할지(`observe`)를 정한다. `off`가 없는 것이 설계다
  // (DD7 — 끄는 것은 M3 이전 동작을 요청하는 것이고 그것이 결함 자체다).
  ['MCCP_ROUND_LEDGER', 'enum', ['enforce', 'observe'], 'enforce', null, 'active', 'gates', 'plugins/mccp/scripts/lib/review-rounds/seal.js:49', '라운드 원장 강제 모드.', 'plugins/mccp/scripts/lib/review-rounds/seal.js#LEDGER_MODES'],
  ['MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE', 'string', null, null, null, 'active', 'gates', 'plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js:318', '비수렴 ship override.'],
  ['MCCP_FORCE_PR_WITHOUT_IMPECCABLE', 'string', null, null, null, 'active', 'gates', 'plugins/mccp/commands/pr.md:79', 'impeccable 미가용 override.'],
  ['MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER', 'string', null, null, null, 'active', 'gates', 'plugins/mccp/commands/pr.md:659', 'security 미가용 override.'],
  ['MCCP_PR_SKIP_CODEX_REVIEW', 'string', null, null, null, 'active', 'gates', 'plugins/mccp/commands/pr.md:105', 'PR-Codex skip escape.'],
  ['MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN', 'string', null, null, null, 'active', 'gates', 'plugins/mccp/commands/pr.md:846', 'design chain 차단 1회 우회.'],
  ['MCCP_GATEGUARD', 'enum', ['on', 'off'], 'on', null, 'active', 'gates', 'plugins/mccp/scripts/hooks/gateguard-fact-force.js:438', 'gateguard hook 활성.', null, '판정이 canonical enum이 아니라 disable 별칭 집합이다 — gateguard-fact-force.js:48 `MCCP_DISABLE_VALUES`의 원소면 off, 그 밖은 전부 on이라 수용 어휘가 열거로 존재하지 않는다'],
  // 운영자가 설정하는 토글이 아니라 게이트 사이에서 전달되는 신호다. 이름에
  // MCCP_ prefix가 없어 런타임 스캐너가 보지 못하므로 여기 명시로 올린다.
  //
  // kind가 `bypass-flag`가 **아닌** 이유: 그 kind는 DD1이 이름까지 3개로 못 박았고
  // registry test가 집합 동일성을 단언한다. 이 신호는 운영자의 escape가 아니라
  // 게이트가 스스로 도출해 자식 프로세스에 넘기는 값이며, 파싱도 JS가 아니라
  // 셸 비교(`[ "${CODEX_DEDUPE_AT_PR:-0}" = "1" ]`)라 공유 파서를 지나지 않는다.
  // `values: ['1']`은 그 셸 비교가 인정하는 유일한 값을 그대로 적은 것이다.
  ['CODEX_DEDUPE_AT_PR', 'string', ['1'], null, null, 'internal', 'gates', 'plugins/mccp/commands/pr.md:135', 'cross-gate dedupe 전달 신호.'],
  // 두 detector는 boolean이 아니라 **가용성 3상태**를 받는다. 미설정이면 settings
  // 신호를 실제로 probe하므로 정적 default가 없다 — `default: null`은 "확정 불가"가
  // 아니라 "리터럴 default가 존재하지 않는다"는 사실이다.
  ['MCCP_GOAL_FEATURE', 'enum', ['available', 'missing', 'unknown'], null, null, 'active', 'gates', 'plugins/mccp/scripts/lib/goal-detect.js:62', 'native /goal 가용성 강제.', 'plugins/mccp/scripts/lib/goal-detect.js#FEATURE_VALUES'],
  ['MCCP_ULTRACODE_FEATURE', 'enum', ['available', 'missing', 'unknown'], null, null, 'active', 'gates', 'plugins/mccp/scripts/lib/ultracode-detect.js:52', 'ultracode 가용성 강제.', 'plugins/mccp/scripts/lib/ultracode-detect.js#FEATURE_VALUES'],

  // ── review — plan-review L1/L2/L3 · santa · 단일통과 · intent · design ─────
  ['MCCP_PLAN_REVIEW', 'enum', ['multi-agent', 'codex', 'hybrid'], 'multi-agent', null, 'active', 'review', 'plugins/mccp/scripts/lib/plan-review/decide.js:50', 'plan 승인 리뷰 소스.', 'plugins/mccp/scripts/lib/plan-review/decide.js#MODES'],
  ['MCCP_PLAN_REVIEW_L3', 'bool', B, 'off', OFF, 'active', 'review', 'plugins/mccp/scripts/lib/plan-review/decide.js:51', 'hybrid에서 L3 요구.'],
  ['MCCP_PLAN_REVIEW_BUDGET', 'int', null, null, null, 'undocumented-default', 'review', 'plugins/mccp/scripts/lib/plan-review/budget.js:26', '리뷰어 1인 최소 예산.'],
  ['MCCP_PLAN_REVIEW_QUORUM', 'string', null, '3of4', null, 'active', 'review', 'plugins/mccp/scripts/lib/plan-review/quorum.js:22', '수렴에 필요한 승인 수 — 3of4 형식.'],
  ['MCCP_PLAN_REVIEW_ROLES_MIN', 'int', null, null, null, 'undocumented-default', 'review', 'plugins/mccp/scripts/lib/plan-review/quorum.js:23', '최소 역할 수.'],
  ['MCCP_REVIEW_SINGLE_PASS', 'enum', ['scope_too_small', 'deadline_pressure', 'deferred_to_prd_completion'], null, null, 'active', 'review', 'plugins/mccp/scripts/lib/review-single-pass.js:21', '리뷰 단일통과 + 사유.', 'plugins/mccp/scripts/lib/review-single-pass.js#REASONS'],
  ['MCCP_SANTA_ROUND_CAP', 'int', null, null, null, 'undocumented-default', 'review', 'plugins/mccp/scripts/lib/santa/counter.js:13', 'santa 라운드 상한.'],
  ['MCCP_SANTA_SEVERITY_GATE', 'enum', ['enforce', 'off'], 'enforce', null, 'active', 'review', 'plugins/mccp/scripts/lib/santa/gate.js:81', 'santa 차단 최소 severity.', 'plugins/mccp/scripts/lib/santa/gate.js#SEVERITY_GATE_VALUES'],
  ['MCCP_SANTA_TERMINATOR', 'enum', ['enforce', 'off'], 'enforce', null, 'active', 'review', 'plugins/mccp/scripts/lib/santa/terminator.js:18', 'santa 종료 판정기.', 'plugins/mccp/scripts/lib/santa/terminator.js#TERMINATOR_VALUES'],
  ['MCCP_SANTA_ADJUDICATION_GATE', 'enum', ['enforce', 'off'], 'enforce', null, 'active', 'review', 'plugins/mccp/scripts/lib/santa/adjudication.js:40', 'santa 심판 게이트 모드.', 'plugins/mccp/scripts/lib/santa/adjudication.js#GATE_VALUES'],
  ['MCCP_SANTA_LEDGER_SUPPRESSION', 'enum', ['enforce', 'off'], 'enforce', null, 'active', 'review', 'plugins/mccp/scripts/lib/santa/adjudication.js:41', 'santa 원장 억제.', 'plugins/mccp/scripts/lib/santa/adjudication.js#GATE_VALUES'],
  ['MCCP_SANTA_BLIND_LANE', 'enum', ['a', 'b', 'off'], 'a', null, 'active', 'review', 'plugins/mccp/scripts/lib/santa/lanes.js:32', 'santa 증거 레인 배정.', 'plugins/mccp/scripts/lib/santa/lanes.js#BLIND_LANE_VALUES'],
  ['MCCP_SANTA_ALWAYS_SCOPE', 'enum', ['enforce', 'off'], 'enforce', null, 'active', 'review', 'plugins/mccp/scripts/lib/santa/scope-always.js:27', 'santa 상시 스코프 + 정합 rubric.', 'plugins/mccp/scripts/lib/santa/scope-always.js#ALWAYS_SCOPE_VALUES'],
  ['MCCP_SANTA_DELTA_SCOPE', 'enum', ['enforce', 'off'], 'off', null, 'active', 'review', 'plugins/mccp/scripts/lib/santa/scope-delta.js:19', 'santa 델타 스코프 축소 (default가 형제와 반대 — off).', 'plugins/mccp/scripts/lib/santa/scope-delta.js#DELTA_SCOPE_VALUES'],
  ['MCCP_SANTA_DEGRADE_GATE', 'enum', ['enforce', 'off'], 'enforce', null, 'active', 'review', 'plugins/mccp/scripts/lib/santa/model-diversity.js:28', 'santa 모델 계열 degrade 강등.', 'plugins/mccp/scripts/lib/santa/model-diversity.js#DEGRADE_GATE_VALUES'],
  ['MCCP_SANTA_DEGRADE_ACK', 'string', null, null, null, 'active', 'review', 'plugins/mccp/scripts/lib/santa/model-diversity.js:33', 'santa degrade audited override 사유.'],
  ['MCCP_INTENT_MISLABEL', 'enum', ['enforce', 'warn', 'off'], 'enforce', null, 'active', 'review', 'plugins/mccp/scripts/lib/intent-context.js:878', '오심 대조 모드.', 'plugins/mccp/scripts/lib/intent-context.js#MISLABEL_MODES'],
  ['MCCP_SKIP_INTENT_GATE', 'string', null, null, null, 'active', 'review', 'plugins/mccp/scripts/lib/intent-context.js:868', 'intent 게이트 override.'],
  ['MCCP_INTENT_ADJUDICATION_TIMEOUT_MS', 'int', null, null, null, 'undocumented-default', 'review', 'plugins/mccp/scripts/lib/plan-codex-runner.js:471', '판정 대기 상한.'],
  ['MCCP_INTENT_ARBITER', 'enum', ['subagent', 'author'], 'subagent', null, 'active', 'review', 'plugins/mccp/scripts/lib/intent-arbiter.js:116', '판정 주체(심판 분리).', 'plugins/mccp/scripts/lib/intent-arbiter.js#ARBITER_MODES'],
  ['MCCP_DESIGN_CRITIQUE_MAX_RETRY', 'int', null, '2', null, 'active', 'review', 'plugins/mccp/scripts/lib/design-critique-decide.js:26', 'critique 재시도 상한.'],
  ['MCCP_DESIGN_GROUNDING', 'enum', ['enforce', 'warn', 'off'], 'enforce', null, 'active', 'review', 'plugins/mccp/scripts/lib/design-grounding.js:31', 'grounding lint 모드.', 'plugins/mccp/scripts/lib/design-grounding.js#GROUNDING_MODES'],
  ['MCCP_DESIGN_INTENT_REASON', 'string', null, null, null, 'active', 'review', 'plugins/mccp/commands/plan-prd.md:187', 'critique 강제 override.'],
  ['MCCP_IMPECCABLE_ROUTING_MODE', 'enum', ['auto', 'hybrid', 'recommend'], 'auto', null, 'active', 'review', 'plugins/mccp/scripts/lib/impeccable-routing.js:164', 'impeccable 라우팅 모드.', 'plugins/mccp/scripts/lib/impeccable-routing.js#ROUTING_MODES'],
  ['MCCP_IMPECCABLE_INTENT_COMMANDS', 'list', null, null, null, 'undocumented-default', 'review', 'plugins/mccp/scripts/lib/impeccable-routing.js:173', '추가 라우팅 명령 목록.', 'plugins/mccp/scripts/lib/impeccable-routing.js#MOOD_COMMANDS'],
  // 값은 «skill 이름»이 아니라 **탐지 결과 강제 override**다. `impeccable-detect.js:322-330`이
  // `available`/`missing` 밖의 값을 stderr WARNING과 함께 버리므로, 이름을 넣으라는 옛
  // 설명대로 쓰면 아무 일도 일어나지 않는다.
  ['MCCP_IMPECCABLE_SKILL', 'enum', ['available', 'missing'], null, null, 'active', 'review', 'plugins/mccp/scripts/lib/impeccable-detect.js:319', 'impeccable 탐지 결과 강제 override.', null, '두 값이 resolveImpeccable 안의 인라인 리터럴 비교로만 존재하고 export된 어휘 상수가 없다 — 상수 승격은 impeccable-detection-contract PRD 소유 파일의 변경이라 이 머지 범위 밖이다'],
  ['MCCP_A11Y_AUTO_INVOKE', 'bool', B, 'on', ON, 'active', 'review', 'plugins/mccp/commands/pr.md:759', 'PR에서 a11y 자동 호출.'],
  ['MCCP_DEEP_RESEARCH_SKILL', 'string', null, null, null, 'active', 'review', 'plugins/mccp/scripts/lib/deep-research-detect.js:45', 'deep-research skill 이름.'],

  // ── orchestration — work 격리/병렬/merge · plan fan-out · runaway · dispatch ─
  ['MCCP_WORK_ISOLATE_IMPLEMENT', 'bool', B, 'on', ON, 'active', 'orchestration', 'plugins/mccp/scripts/lib/orchestration-preview.js:78', 'implement worktree 격리.'],
  ['MCCP_WORK_IMPLEMENT_WORKFLOW', 'bool', B, 'off', OFF, 'active', 'orchestration', 'plugins/mccp/scripts/lib/implement-dispatch/route.js:68', 'Workflow 런타임 사용.'],
  ['MCCP_WORK_IMPLEMENT_PARALLEL', 'bool', B, 'on', ON, 'active', 'orchestration', 'plugins/mccp/commands/work.md:322', '병렬 implement 허용.'],
  ['MCCP_WORK_PARALLEL_MAX', 'int', null, '4', null, 'active', 'orchestration', 'plugins/mccp/scripts/lib/implement-dispatch/budget.js:120', '동시 worker 상한.'],
  ['MCCP_WORK_PARALLEL_BUDGET', 'int', null, '150000', null, 'active', 'orchestration', 'plugins/mccp/scripts/lib/implement-dispatch/budget.js:121', '병렬 최소 토큰 예산.'],
  ['MCCP_WORK_PARALLEL_AUTODISABLE_TIER', 'list', null, '', null, 'active', 'orchestration', 'plugins/mccp/scripts/lib/implement-dispatch/budget.js:122', '병렬 자동 해제 tier.', 'plugins/mccp/scripts/lib/implement-dispatch/budget.js#allowed'],
  ['MCCP_WORK_MERGE_STRATEGY', 'enum', ['worktree-merge', 'sequential'], 'worktree-merge', null, 'active', 'orchestration', 'plugins/mccp/scripts/lib/orchestration-preview.js:70', 'worker 산출물 병합 전략.', null, '정본 판정이 plugins/mccp/commands/work.md:334의 셸 문자열 비교이고 orchestration-preview.js:71 resolveMergeStrategy는 스스로를 그 mirror로 선언한다 — JS 쪽에만 어휘 상수를 두면 오타 입력에서 두 경로가 갈려(preview는 warn 후 default 복귀, live는 worktree-merge가 아니므로 병렬 해제) mirror가 깨진다. 양쪽을 함께 고치는 것은 파서 이원화 축이다'],
  ['MCCP_WORK_MERGED_VERIFY', 'enum', ['enforce', 'warn', 'off'], 'enforce', null, 'active', 'orchestration', 'plugins/mccp/scripts/lib/implement-dispatch/verify.js:38', '병합 후 verify 모드.', 'plugins/mccp/scripts/lib/implement-dispatch/verify.js#MERGED_VERIFY_MODES'],
  ['MCCP_PLAN_FANOUT', 'bool', B, 'on', ON, 'active', 'orchestration', 'plugins/mccp/scripts/lib/plan-fanout/budget.js:83', 'plan 다관점 fan-out.'],
  ['MCCP_PLAN_FANOUT_BUDGET', 'int', null, '150000', null, 'active', 'orchestration', 'plugins/mccp/scripts/lib/plan-fanout/budget.js:84', 'fan-out 최소 예산.'],
  ['MCCP_PLAN_FANOUT_AUTODISABLE_TIER', 'list', null, '', null, 'active', 'orchestration', 'plugins/mccp/scripts/lib/plan-fanout/budget.js:85', 'fan-out 자동 해제 tier.', 'plugins/mccp/scripts/lib/plan-fanout/budget.js#allowed'],
  ['MCCP_ORCHESTRATION_MAX_AGENTS', 'int', null, '24', null, 'active', 'orchestration', 'plugins/mccp/scripts/lib/orchestration-runaway.js:100', 'agent 수 상한.'],
  ['MCCP_ORCHESTRATION_CATASTROPHIC_USD', 'int', null, '500', null, 'active', 'orchestration', 'plugins/mccp/scripts/lib/orchestration-runaway.js:115', 'catastrophic 판정 USD.'],
  ['MCCP_ORCHESTRATION_USD_BOMB', 'bool', B, 'off', OFF, 'active', 'orchestration', 'plugins/mccp/scripts/lib/orchestration-runaway.js:112', 'USD bomb 강제 판정.'],
  ['MCCP_ORCHESTRATION_COST_FAIL_OPEN', 'bool', B, 'on', ON, 'active', 'orchestration', 'plugins/mccp/scripts/lib/orchestration-preview.js:61', '비용 신호 부재 시 진행.'],
  ['MCCP_ORCHESTRATION_RESERVATION_LEASE_MS', 'int', null, '600000', null, 'active', 'orchestration', 'plugins/mccp/scripts/lib/orchestration-runaway.js:108', '예약 lease 유효 시간.'],
  ['MCCP_ORCHESTRATOR_POLL_MS', 'int', null, '500', null, 'active', 'orchestration', 'plugins/mccp/scripts/lib/dispatch-watcher.js:63', 'watcher 폴링 간격.'],
  ['MCCP_DISPATCH_CONTEXT', 'bool', B, 'off', OFF, 'active', 'orchestration', 'plugins/mccp/scripts/receipt/write.js:131', 'dispatch worker 선언.'],
  ['MCCP_AUTO_HANDOFF', 'enum', ['off', 'notify', 'spawn'], 'notify', null, 'active', 'orchestration', 'plugins/mccp/scripts/derive/sources/toggle-usage.js:173', '핸드오프 신호 처리.', 'plugins/mccp/scripts/state/session-spawner.js#MODES'],
  ['MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN', 'bool', B, 'off', OFF, 'active', 'orchestration', 'plugins/mccp/scripts/state/session-spawner.js:282', '실험적 세션 spawn.'],
  ['MCCP_MULTI_SESSION_SCAN', 'bool', B, 'off', OFF, 'active', 'orchestration', 'plugins/mccp/scripts/derive/sources/worktrees.js:316', '다중 세션 스캔.'],
  ['MCCP_MSW_EVENTS_SHARED', 'bool', B, 'on', ON, 'active', 'orchestration', 'plugins/mccp/scripts/state/msw-events.js:255', 'A1 축 이벤트를 git common dir에 모은다.'],

  // ── cost — cost-state · subscription · handoff · briefing · context monitor ─
  ['MCCP_COST_STATE_DECAY_HOURS', 'int', null, '6', null, 'active', 'cost', 'plugins/mccp/scripts/lib/cost-state.js:42', 'cost 마커 decay 시간.'],
  ['MCCP_HANDOFF_THRESHOLDS_USD', 'list', null, '50,80,100', null, 'active', 'cost', 'plugins/mccp/scripts/lib/cost-thresholds.js:23', '핸드오프 임계 USD 3단계.', null, '멤버가 USD 임계 숫자 3단계라 열거 어휘가 존재하지 않는다'],
  ['MCCP_SUBSCRIPTION', 'bool', B, 'off', OFF, 'active', 'cost', 'plugins/mccp/scripts/lib/subscription.js:18', '구독 비용 모델.'],
  ['MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_WARN_PCT', 'int', null, '35', null, 'active', 'cost', 'plugins/mccp/scripts/lib/subscription.js:19', '컨텍스트 경고 임계.'],
  ['MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_CRITICAL_PCT', 'int', null, '25', null, 'active', 'cost', 'plugins/mccp/scripts/lib/subscription.js:20', '컨텍스트 critical 임계.'],
  ['MCCP_SUBSCRIPTION_OVERFLOW_TOOL_WARN', 'int', null, '0', null, 'active', 'cost', 'plugins/mccp/scripts/lib/subscription.js:21', '도구 호출 경고 임계.'],
  ['MCCP_SUBSCRIPTION_OVERFLOW_TOOL_CRITICAL', 'int', null, '0', null, 'active', 'cost', 'plugins/mccp/scripts/lib/subscription.js:22', '도구 호출 critical 임계.'],
  ['MCCP_BRIEFING', 'enum', ['auto', 'off'], 'auto', null, 'active', 'cost', 'plugins/mccp/scripts/lib/briefing/cost-guard.js:90', 'briefing stamp 정책.', 'plugins/mccp/scripts/lib/briefing/cost-guard.js#BRIEFING_VALUES'],
  ['MCCP_BRIEFING_AUTODISABLE_TIER', 'list', null, 'notice,warning,critical', null, 'active', 'cost', 'plugins/mccp/scripts/lib/briefing/cost-guard.js:135', 'briefing 자동 해제 tier.', 'plugins/mccp/scripts/lib/briefing/cost-guard.js#allowed'],
  ['MCCP_CONTEXT_MONITOR_COST_MODE', 'enum', ['directive', 'notify'], 'directive', null, 'active', 'cost', 'plugins/mccp/scripts/hooks/ecc-context-monitor.js:79', '비용 메시지 어조 모드.', 'plugins/mccp/scripts/hooks/ecc-context-monitor.js#COST_MODE_VALUES'],
  ['MCCP_CONTEXT_MONITOR_COST_WARNINGS', 'bool', B, 'on', ON, 'active', 'cost', 'plugins/mccp/scripts/hooks/ecc-context-monitor.js:52', '비용 경고 출력.'],

  // ── hooks — hook profile/disable · session · governance · MCP · installer ───
  ['MCCP_HOOK_PROFILE', 'enum', ['minimal', 'standard', 'strict'], 'standard', null, 'active', 'hooks', 'plugins/mccp/scripts/lib/hook-flags.js:19', 'hook 무게 프로파일.', 'plugins/mccp/scripts/lib/hook-flags.js#VALID_PROFILES'],
  ['MCCP_DISABLED_HOOKS', 'list', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/lib/hook-flags.js:24', '비활성 hook id 목록.', { derive: 'hook-ids' }],
  ['MCCP_HOOK_ID', 'string', null, null, null, 'internal', 'hooks', 'plugins/mccp/scripts/hooks/observe-runner.js:73', '실행 중 hook id.'],
  ['MCCP_HOOK_INPUT_MAX_BYTES', 'int', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/hooks/config-protection.js:157', 'hook 입력 바이트 상한.'],
  ['MCCP_HOOK_INPUT_TRUNCATED', 'bool', B, 'off', OFF, 'internal', 'hooks', 'plugins/mccp/scripts/hooks/config-protection.js:142', '입력 절단 신호.'],
  ['MCCP_PLUGIN_ROOT', 'string', null, null, null, 'internal', 'hooks', 'plugins/mccp/scripts/hooks/bootstrap.js:68', '플러그인 루트 경로.'],
  ['MCCP_SESSION_ID', 'string', null, null, null, 'internal', 'hooks', 'plugins/mccp/scripts/lib/session-identity.js:55', '현재 세션 id — 체인 1순위(M8 DD1: 해소는 session-identity 단독).'],
  ['MCCP_SESSION_START_CONTEXT', 'enum', ['off', 'on'], null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/hooks/session-start.js:168', 'STATE.md 주입 여부.', null, '판정이 canonical enum이 아니라 disable 별칭 집합이다 — session-start.js:168이 0/false/off/none/disabled에 들면 off로 보고 그 밖은 전부 on이라, MCCP_GATEGUARD와 같은 형태로 수용 어휘가 열거로 존재하지 않는다. 상수로 승격하면 없는 열거를 만들어 내는 셈이며, 이 형태를 다루는 것은 파서 이원화 축이다'],
  ['MCCP_SESSION_START_MAX_CHARS', 'int', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/hooks/session-start.js:172', '주입 블록 문자 상한.'],
  ['MCCP_SESSION_RETENTION_DAYS', 'int', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/hooks/session-start.js:160', '세션 산출물 보존 일수.'],
  ['MCCP_SESSION_RECORDING_DIR', 'string', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/lib/session-adapters/canonical-session.js:264', '세션 기록 디렉토리.'],
  ['MCCP_GOVERNANCE_CAPTURE', 'bool', B, 'off', OFF, 'active', 'hooks', 'plugins/mccp/scripts/hooks/governance-capture.js:255', 'governance hook 활성.'],
  ['MCCP_OBSERVE_RUNNER_TIMEOUT_MS', 'int', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/hooks/observe-runner.js:78', 'observe runner 상한.'],
  ['MCCP_MCP_CONFIG_PATH', 'list', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/hooks/mcp-health-check.js:55', 'MCP 설정 경로 목록.', null, '멤버가 파일 경로라 열거 어휘가 존재하지 않는다'],
  ['MCCP_MCP_HEALTH_FAIL_OPEN', 'bool', B, 'on', ON, 'active', 'hooks', 'plugins/mccp/scripts/hooks/mcp-health-check.js:558', 'MCP 검사 실패 시 진행.'],
  ['MCCP_MCP_HEALTH_STATE_PATH', 'string', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/hooks/mcp-health-check.js:48', 'MCP 상태 파일 경로.'],
  ['MCCP_MCP_HEALTH_TTL_MS', 'int', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/hooks/mcp-health-check.js:203', 'MCP 캐시 TTL.'],
  ['MCCP_MCP_HEALTH_TIMEOUT_MS', 'int', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/hooks/mcp-health-check.js:305', 'MCP probe 상한.'],
  ['MCCP_MCP_HEALTH_BACKOFF_MS', 'int', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/hooks/mcp-health-check.js:216', 'MCP 재시도 backoff.'],
  ['MCCP_MCP_RECONNECT_COMMAND', 'string', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/hooks/mcp-health-check.js:518', 'MCP 재연결 명령.'],
  ['MCCP_MCP_RECONNECT_TIMEOUT_MS', 'int', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/hooks/mcp-health-check.js:539', '재연결 명령 상한.'],
  ['MCCP_GH_SHIM', 'string', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/lib/github-discussions.js:38', 'gh CLI 대체 경로.'],
  ['MCCP_CODE_CLI', 'string', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/lib/find-code-cli.js:70', 'claude CLI 경로.'],
  ['MCCP_GITIGNORE_LOCK_WAIT_MS', 'int', null, null, null, 'undocumented-default', 'hooks', 'plugins/mccp/scripts/lib/gitignore-provision.js:509', 'gitignore lock 대기 상한.'],
  ['MCCP_A3_READ_USER_MEMORY', 'bool', B, 'off', OFF, 'active', 'hooks', 'plugins/mccp/scripts/derive/cli.js:374', 'derive의 메모리 읽기 허용.'],

  // ── observability — renderer/dashboard · journal · evidence · session ───────
  ['MCCP_RENDER_TRIGGER_DEBOUNCE_MS', 'int', null, '5000', null, 'active', 'observability', 'plugins/mccp/scripts/lib/renderer/trigger.js:233', '재렌더 debounce.'],
  ['MCCP_RENDER_LOCK_LEASE_MS', 'int', null, '90000', null, 'active', 'observability', 'plugins/mccp/scripts/lib/renderer/trigger.js:235', '렌더 lock lease.'],
  ['MCCP_DASHBOARD_STALE_DAYS', 'int', null, null, null, 'undocumented-default', 'observability', 'plugins/mccp/scripts/lib/renderer/parsers/plan-body.js:20', 'plan stale 판정 일수.'],
  ['MCCP_STATE_JOURNAL', 'enum', ['enforce', 'shadow', 'off'], 'enforce', null, 'active', 'observability', 'plugins/mccp/scripts/lib/state-journal/index.js:29', 'STATE.md 저널 기록.', 'plugins/mccp/scripts/lib/state-journal/index.js#JOURNAL_MODES'],
  ['MCCP_EVIDENCE_CONFLICT_GUARD', 'enum', ['enforce', 'warn', 'off'], 'enforce', null, 'active', 'observability', 'plugins/mccp/scripts/receipt/evidence-lock.js:104', '중복 claim 가드 모드.', 'plugins/mccp/scripts/receipt/evidence-lock.js#GUARD_MODE_VALUES'],
  ['MCCP_EVIDENCE_STAGE_ROOT', 'list', null, null, null, 'undocumented-default', 'observability', 'plugins/mccp/scripts/lib/evidence-stage-guard.js:154', '증거 스테이징 루트.', null, '멤버가 디렉토리 경로라 열거 어휘가 존재하지 않는다'],
  ['MCCP_SESSION_LEDGER_SCOPE', 'enum', ['global', 'repo', 'hybrid'], 'global', null, 'active', 'observability', 'plugins/mccp/scripts/state/session-ledger.js:210', '세션 원장 조회 범위.', 'plugins/mccp/scripts/state/session-ledger.js#VALID_SCOPES'],
  ['MCCP_RECLAIM_OUTLIVES', 'bool', B, 'off', OFF, 'active', 'observability', 'plugins/mccp/scripts/lib/session-processes.js:1118', '잔존 프로세스 회수.'],
  ['MCCP_RECLAIM_BUDGET_MS', 'int', null, null, null, 'undocumented-default', 'observability', 'plugins/mccp/scripts/lib/session-processes.js:1104', '회수 시간 예산.'],
  ['MCCP_RECLAIM_IDENTITY_TOLERANCE_MS', 'int', null, null, null, 'undocumented-default', 'observability', 'plugins/mccp/scripts/lib/session-processes.js:946', '동일성 판정 허용 오차.'],
  ['MCCP_WORKTREE_SCAN_CAP', 'int', null, null, null, 'undocumented-default', 'observability', 'plugins/mccp/scripts/derive/sources/worktrees.js:280', 'worktree 스캔 상한.'],
  ['MCCP_WORKTREE_ACTIVE_DAYS', 'int', null, null, null, 'undocumented-default', 'observability', 'plugins/mccp/scripts/derive/sources/worktrees.js:290', 'worktree active 일수.'],

  // ── external — mccp가 정의하지 않지만 mccp 경로가 읽는 이름 ─────────────────
  ['CLAUDE_PLUGIN_ROOT', 'string', null, null, null, 'internal', 'external', 'plugins/mccp/scripts/hooks/bootstrap.js:68', '주입된 플러그인 루트.'],
  ['CLAUDE_SESSION_ID', 'string', null, null, null, 'internal', 'external', 'plugins/mccp/scripts/lib/session-identity.js:57', 'legacy 세션 id — 이 CLI는 설정하지 않는다. 체인 3순위(M8 DD1).'],
  ['CLAUDE_PID', 'string', null, null, null, 'internal', 'external', 'plugins/mccp/scripts/lib/session-processes.js:946', 'Claude Code PID.'],
  ['CLAUDE_RULES_DIR', 'string', null, null, null, 'undocumented-default', 'external', 'plugins/mccp/scripts/hooks/bootstrap.js:68', 'ECC rule 디렉토리.'],
  ['CLAUDE_PACKAGE_MANAGER', 'string', null, null, null, 'undocumented-default', 'external', 'plugins/mccp/scripts/hooks/bootstrap.js:68', 'installer 패키지 매니저.'],
  ['GITHUB_TOKEN', 'string', null, null, null, 'undocumented-default', 'external', 'plugins/mccp/scripts/lib/github-discussions.js:38', 'gh 인증 토큰.'],
  ['ECC_DISABLED_MCPS', 'list', null, null, null, 'undocumented-default', 'external', 'plugins/mccp/scripts/hooks/mcp-health-check.js:55', 'ECC 비활성 MCP 목록.', null, 'mccp가 정의하지 않는 외부 MCP 서버 이름이라 이 계약이 어휘를 소유하지 않는다 (UI6)'],
  ['CLV2_HOMUNCULUS_DIR', 'string', null, null, null, 'undocumented-default', 'external', 'plugins/mccp/scripts/hooks/observe-runner.js:73', 'CLv2 instinct 디렉토리.'],
  ['IMPECCABLE_FORCE_OVERRIDE_REASON', 'string', null, null, null, 'active', 'external', 'plugins/mccp/commands/prp-implement.md:741', 'impeccable 게이트 override.'],
  ['IMPECCABLE_VERSION', 'string', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:283', 'impeccable 버전 문자열.'],
  ['IMPECCABLE_NO_UPDATE_CHECK', 'bool', B, 'off', OFF, 'not-consumed', 'external', 'docs/environment/external.md:321', '업데이트 확인 끔.'],
  ['IMPECCABLE_UPDATE_HOST', 'string', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:351', '업데이트 확인 호스트.'],
  ['IMPECCABLE_UPDATE_CACHE', 'string', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:382', '업데이트 캐시 경로.'],
  ['IMPECCABLE_CONTEXT_DIR', 'string', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:413', '컨텍스트 해석 디렉토리.'],
  ['IMPECCABLE_CRITIQUE_META', 'string', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:446', 'critique 메타 경로.'],
  ['IMPECCABLE_LIVE_CONFIG', 'string', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:477', 'live mode 설정 경로.'],
  ['IMPECCABLE_LIVE_DEBUG_EVENTS', 'bool', B, 'off', OFF, 'not-consumed', 'external', 'docs/environment/external.md:510', 'live 이벤트 디버그.'],
  ['IMPECCABLE_LIVE_APPLY_EVENT_SOFT_DEADLINE_MS', 'int', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:540', 'apply soft deadline.'],
  ['IMPECCABLE_LIVE_APPLY_EVENT_HARD_TIMEOUT_MS', 'int', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:568', 'apply hard timeout.'],
  ['IMPECCABLE_LIVE_MANUAL_EDIT_REPAIR_ATTEMPTS', 'int', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:596', '수동 편집 복구 횟수.'],
  ['IMPECCABLE_LIVE_COPY_AGENT', 'string', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:624', 'copy-edit agent 이름.'],
  ['IMPECCABLE_LIVE_COPY_AGENT_MODEL', 'string', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:655', 'copy-edit agent 모델.'],
  ['IMPECCABLE_LIVE_COPY_AGENT_EFFORT', 'string', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:686', 'copy-edit agent effort.'],
  ['IMPECCABLE_LIVE_COPY_AGENT_TIMEOUT_MS', 'int', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:717', 'copy-edit agent 상한.'],
  ['IMPECCABLE_LIVE_COPY_AGENT_MOCK_RESULT', 'string', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:745', 'agent 결과 mock.'],
  ['IMPECCABLE_LIVE_COPY_AGENT_MOCK_WRITES', 'string', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:776', 'agent write mock.'],
  ['IMPECCABLE_LIVE_COPY_AGENT_MOCK_DELAY_MS', 'int', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:807', 'agent mock 지연.'],
  ['IMPECCABLE_PALETTE_SEED', 'string', null, null, null, 'not-consumed', 'external', 'docs/environment/external.md:835', '팔레트 생성 시드.'],

  // ── retired · 부재 · scan artifact — 전부 retired.md가 소유하고 예시가 면제된다 ─
  ['MCCP_SKIP_OBSERVE', 'string', null, null, null, 'retired', 'retired', 'docs/environment/retired.md:1', '은퇴 — MCCP_DISABLED_HOOKS로.'],
  ['MCCP_QUALITY_GATE_FIX', 'string', null, null, null, 'retired', 'retired', 'docs/environment/retired.md:1', '은퇴 — Stop-loop enforce로.'],
  ['MCCP_QUALITY_GATE_STRICT', 'string', null, null, null, 'retired', 'retired', 'docs/environment/retired.md:1', '은퇴 — Stop-loop enforce로.'],
  ['MCCP_STOP_LOOP_QUALITY_CWD', 'string', null, null, null, 'retired', 'retired', 'docs/environment/retired.md:1', '은퇴 — worktree 규약으로.'],
  ['MCCP_SANTA_MAX_ROUNDS', 'string', null, null, null, 'retired', 'retired', 'docs/environment/retired.md:1', '은퇴 — ROUND_CAP으로 개명.'],
  ['MCCP_COST_HARD_CEILING_HIT', 'string', null, null, null, 'retired', 'retired', 'docs/environment/retired.md:1', '은퇴 — chain_aborted로.'],
  ['MCCP_ORCHESTRATION_DEBT_DECAY_HOURS', 'string', null, null, null, 'retired', 'retired', 'docs/environment/retired.md:1', '은퇴 — COST_STATE_DECAY로.'],
  // 축 밖 1행(M5 Task 3.3): origin/main `b111dca`(codex-intent-context M3)가 도입했으나
  // 미등재라 L1이 red였다. 런타임 동작 변경 0이며, 이 줄이 없으면 M5는 자기가 확장하는
  // lint를 green으로 검증할 수 없다.
  ['MCCP_PLAN_REVIEW_TEST_INVOKE', 'bypass-flag', BY, 'off', OFF, 'test-only', 'review', 'plugins/mccp/scripts/lib/plan-review/cli.js:699', 'test 전용 — `--invoke-module` 허용.'],
  ['MCCP_PLAN_REVIEW_L1', 'string', null, null, null, 'absent-by-design', 'retired', 'docs/environment/retired.md:1', '의도적 부재 — 끌 수 없다.'],
  ['MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL', 'bool', B, 'off', OFF, 'test-only', 'retired', 'plugins/mccp/commands/plan.md:687', 'test 전용 — critique 강제 실패.'],
  ['MCCP_PERF_INJECT_QUADRATIC', 'string', null, null, null, 'test-only', 'retired', 'docs/environment/retired.md:1', 'test 전용, 표면 밖.'],
  ['MCCP_TEST_SESSION_START_PATH', 'string', null, null, null, 'test-only', 'retired', 'docs/environment/retired.md:1', 'test 전용, 표면 밖.'],
  ['MCCP_EXPLORE_CONTROL_PLACEMENT', 'string', null, null, null, 'comment-only', 'retired', 'plugins/mccp/scripts/lib/renderer/html.js:1109', '제거됨 — 주석만 잔존.'],
  ['MCCP_PLAN_REVIEW_', 'string', null, null, null, 'scan-artifact', 'retired', 'plugins/mccp/scripts/lib/plan-review/budget.js:26', '환경변수 아님 — 접두사 오탐.'],
  ['MCCP_DISABLE_VALUES', 'string', null, null, null, 'scan-artifact', 'retired', 'plugins/mccp/scripts/hooks/gateguard-fact-force.js:48', '환경변수 아님 — JS 상수.'],
  ['MCCP_IGNORE_BLOCK', 'string', null, null, null, 'scan-artifact', 'retired', 'plugins/mccp/scripts/lib/gitignore-provision.js:60', '환경변수 아님 — JS 상수.'],
  ['MCCP_IGNORE_ENTRIES', 'string', null, null, null, 'scan-artifact', 'retired', 'plugins/mccp/scripts/lib/gitignore-provision.js:192', '환경변수 아님 — JS 상수.'],
  ['MCCP_JOURNAL_DEGRADED_UNRECORDED', 'string', null, null, null, 'scan-artifact', 'retired', 'plugins/mccp/scripts/state/state-writer.js:675', '환경변수 아님 — 에러 코드.'],
];

function anchorOf(name) {
  return name.toLowerCase();
}

function build() {
  const entries = [];
  const seen = new Set();
  RAW.forEach(function (row) {
    const name = row[0];
    if (!NAME_RE.test(name)) {
      throw new Error('env-contract/registry: name must be ASCII [A-Z][A-Z0-9_]*, got ' + JSON.stringify(name));
    }
    if (seen.has(name)) {
      throw new Error('env-contract/registry: duplicate entry ' + name);
    }
    seen.add(name);
    const domain = row[6];
    const kind = row[1];
    const vocabulary = row[9] === undefined ? null : row[9];
    const vocabularyGap = row[10] === undefined ? null : row[10];

    // 어휘 필드의 형태 계약. **의미** 검사(ref가 실재하는가, 집합이 같은가)는 L11이
    // 소유하고 여기서는 형태만 본다 — 레지스트리가 자기를 읽는 소비처를 부팅하면
    // DD1이 막으려던 «감사 대상을 감사자가 켜는» 구조가 된다.
    if (vocabulary !== null && typeof vocabulary !== 'string'
        && !(typeof vocabulary === 'object' && typeof vocabulary.derive === 'string')) {
      throw new Error('env-contract/registry: ' + name
        + ' vocabulary must be a "path#CONST" string, { derive }, or null');
    }
    // 조용한 미지정을 코드 수준에서 닫는다. `values`가 의미를 갖는 kind는 enum과
    // list뿐이고(bool/bypass-flag의 어휘는 value.js 소유, int/string은 values가 null),
    // 그 둘은 3형태 중 하나를 반드시 갖는다 — 사유 없는 null은 "읽을 수 없음"이
    // 아니라 "아직 안 적음"이며, 후자를 통과시키면 격리표가 아니라 침묵이 된다(UI5).
    if ((kind === 'enum' || kind === 'list') && vocabulary === null) {
      if (typeof vocabularyGap !== 'string' || vocabularyGap.trim().length < 10) {
        throw new Error('env-contract/registry: ' + name
          + ' has no vocabulary; a substantive vocabularyGap reason (>=10 chars) is required');
      }
    }
    if (vocabulary !== null && vocabularyGap !== null) {
      throw new Error('env-contract/registry: ' + name
        + ' declares both vocabulary and vocabularyGap — a gap is the absence of a vocabulary');
    }

    const entry = Object.freeze({
      name: name,
      kind: kind,
      values: row[2] ? Object.freeze(row[2].slice()) : null,
      default: row[3] === undefined ? null : row[3],
      polarity: row[4] || null,
      status: row[5],
      domain: domain,
      doc: 'environment/' + domain + '.md#' + anchorOf(name),
      evidence: row[7],
      summary: row[8],
      vocabulary: typeof vocabulary === 'object' && vocabulary !== null
        ? Object.freeze({ derive: vocabulary.derive })
        : vocabulary,
      vocabularyGap: vocabularyGap,
    });
    entries.push(entry);
  });
  return Object.freeze(entries);
}

// ENTRIES와 각 항목은 freeze된다. 소비처가 런타임에 `kind`를 바꿔 `bypass-flag`를
// `bool`로 강등시키는 경로를 코드 수준에서 닫는다 — 그런 강등은 우회 토글의
// 수용 집합을 조용히 넓히는 것과 같다.
const ENTRIES = build();

const BY_NAME = new Map();
ENTRIES.forEach(function (e) { BY_NAME.set(e.name, e); });

function names() {
  return ENTRIES.map(function (e) { return e.name; });
}

// `Map`을 쓰는 것은 prototype 오염 회피이기도 하다 — 평범한 객체를 index로 쓰면
// `get('__proto__')`나 `get('constructor')`가 상속 멤버를 돌려준다.
function get(name) {
  return BY_NAME.get(name) || null;
}

function byKind(kind) {
  return ENTRIES.filter(function (e) { return e.kind === kind; });
}

function byDomain(domain) {
  return ENTRIES.filter(function (e) { return e.domain === domain; });
}

module.exports = {
  ENTRIES: ENTRIES,
  names: names,
  get: get,
  byKind: byKind,
  byDomain: byDomain,
  KINDS: KINDS,
  POLARITIES: POLARITIES,
  STATUSES: STATUSES,
  DOMAINS: DOMAINS,
  BOOL_VALUES: BOOL_VALUES,
  BYPASS_VALUES: BYPASS_VALUES,
  NAME_RE: NAME_RE,
};
