# Plan: codex-harness-portability M3 — command-reach

**Source PRD**: `.claude/prds/codex-harness-portability.prd.md`
**Selected Milestone**: 3 — command-reach
**Complexity**: Large

## Summary

게이트 파이프라인 핵심 명령이 Codex에서 **호출 가능**해지게 한다 — Codex의 비공개 변환 규칙
(`command_migration/render.rs`)에 의존하지 않는 경로로. M1·M2와 같은 순서를 지킨다: **측정을
앞에 두고**, 배선은 측정이 고른다.

측정 전에 이미 아는 것 셋이 이 마일스톤의 전제다. 1) Codex의 **네이티브 명령 표면은 skill**이다
— 이 머신에 설치된 curated plugin 셋 전부가 `<plugin>/skills/<name>/SKILL.md` 하나만 갖고
`commands/`가 아예 없다. 2) mccp의 `skills/` 47개는 이미 `mccp:` 접두로 **등재됐다**(M1 실측
r2). 3) 자동 변환본(r1)은 Codex가 설치 시점에 생성하며 6/22만 덮고 핵심 6개가 전부 미변환이다.

즉 규칙 비의존 경로는 **발명이 아니라 선택**이다: 우리가 skill을 하나 실으면 된다. 남은 미지수는
"skill이 등재를 넘어 **호출**되는가"와 "호출된 본문이 **plugin root를 어떻게 알아내는가**"이고,
후자는 M2가 `unmeasured`로 남긴 `${CLAUDE_PLUGIN_ROOT}` 치환 축과 같은 축이다. 그 축은 이
마일스톤에서 두 번 값을 한다 — skill의 해소 기법을 정하고, **출하되는 `hooks.json`이 실제
설치에서 작동하는지**를 함께 판정한다.

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
| UI13 | 모든 측정에 CLI 버전을 함께 기록하고 버전 없는 측정치는 인용하지 않는다 | constraint |
| UI14 | dogfood가 1급이며 단일 운영자 기준으로 판단한다 | direction |
| UI15 | 게이트가 설치되나 발화하지 않는 껍데기 상태를 허용하지 않는다 | constraint |
| UI18 | 하네스 출처 필드를 receipt에 넣는 판단은 Milestone 5가 소유한다 | exclusion |
| UI19 | 리뷰어 반전 경로는 Milestone 4가 소유하며 여기서 선반영하지 않는다 | exclusion |
| UI20 | Milestone 3의 acceptance는 변환율 개선이 아니라 핵심 명령이 호출되는 것이다 | direction |
| UI21 | 변환 규칙에 의존하지 않는 경로로 도달한다 | constraint |
| UI22 | 마지막 리뷰 라운드에서 수렴하지 못하면 backlog에 기록하고 divergent로 receipt를 쓴다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 오라클 | `plugins/mccp/scripts/lib/harness-ingress.js` | 양성 신호로만 지목하고 모호하면 `unknown` — 오작동이 "안 켜짐"으로 접힌다 |
| 설치원 열거 | `plugins/mccp/scripts/lib/impeccable-detect.js#resolveImpeccable` | 후보를 **전부 열거**한 뒤 실제로 열릴 하나를 지목한다. 추측하지 않는다 (§3.17) |
| 측정 판정 | `scripts/codex-probe/report.js` | verdict는 `measured`/`unmeasured` 둘뿐. 값·증거·버전 셋이 다 있을 때만 승격 |
| 음성 대조 | M2 B2 (`block-probe.js`) | 양성 관측은 통제가 성립할 때만 배선에 귀속된다 |
| 짝 단언 | §3.17 `impeccable-guard.test.js` | 두 표면(디스크 사본 ↔ 본문 리터럴)이 **같은 값**임을 test가 고정한다 |
| 진입점 분리 | `plugins/mccp/scripts/hooks/session-end-marker.js` 외 | `require.main === module`로 CLI shim과 export를 가른다 |
| 파생 표면 가드 | `scripts/version-declaration-guard.js` (§3.7) | 파생물이 원본과 갈라지면 fail-closed로 붉어진다 |
| 결합 열거 | `scripts/codex-probe/coupling-inventory.js` | 항목 증가는 ceiling 상수 편집을 요구해 diff에 숫자로 남는다 |
| Codex skill 형태 | `~/.codex/plugins/cache/openai-curated-remote/plugin-management/0.1.0/skills/plugin-management/SKILL.md` | frontmatter는 `name` + `description` 둘뿐. 본문은 산문 |
| test 배치 | `scripts/tests/codex-probe.test.js` | 하네스 인접 test는 이 단일 파일 관례 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `scripts/codex-probe/reach-probe.js` | CREATE | C축 계측 — skill 호출·root 해소 후보 스윕·본문 도달·인자 전달·이름 충돌 |
| `scripts/codex-probe/cli.js` | UPDATE | `reach` 서브커맨드 배선 + `try/finally` teardown(기존 관례) |
| `scripts/codex-probe/report.js` | UPDATE | C1~C5 승격 규칙. `milestone_closeable`은 M3 하한을 별도로 갖는다 |
| `scripts/codex-probe/coupling-inventory.js` | UPDATE | `install-surface-env` · `agent-tool-declaration` 두 항목의 M3 처분 확정 |
| `scripts/tests/codex-probe.test.js` | UPDATE | C축 회귀 + 스윕 후보 집합 정합 |
| `plugins/mccp/scripts/lib/command-reach.js` | CREATE | 명령 이름 → 본문 경로 해소 오라클(순수) + `require.main` CLI shim |
| `plugins/mccp/scripts/lib/tests/command-reach.test.js` | CREATE | 해소표 전수 · 미지 이름 거부 · 경로 탈출 거부 · 사본 금지 짝 단언 |
| `plugins/mccp/skills/run-command/SKILL.md` | CREATE | 단일 dispatcher skill. **포인터만 싣고 본문을 복사하지 않는다** |
| `plugins/mccp/hooks/hooks.json` | UPDATE | C2 결과에 따라 command 문자열을 하네스 중립으로 — 미치환이면 M2 배선이 실제 설치에서 죽는다 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | 신규 토글이 생길 경우에만. **기본은 무변경**(DD7) |
| `.claude/_meta/data/2026-09-09-codex-harness-truth.json` | UPDATE | C축 원자료(UI13 — 버전 동반) |
| `docs/codex-harness-portability/m3-command-reach.md` | CREATE | 판정 문서(측정 → 경로 선택 근거 → 도달 실증 → 주장하지 않는 것) |
| `.claude/prds/codex-harness-portability.prd.md` | UPDATE | M3 status·Plan 셀 · OQ1/OQ(`${CLAUDE_PLUGIN_ROOT}`) 갱신 |
| `.claude/PRPs/reports/codex-harness-portability-m3-report.md` | CREATE | 구현 보고 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 이연 항목 등재(§3.14) |
| `CHANGELOG.md` | UPDATE | `## [Unreleased]` 아래 누적 (§3.7 — 번호 미선언) |

## Design Decisions

### DD1 — 도달 경로는 발명이 아니라 선택이다: Codex의 네이티브 명령 표면이 skill이다

이 머신에 설치된 Codex 공식 plugin 셋(`plugin-management` · `openai-templates` ·
`deep-research-work`)은 전부 `<plugin>/skills/<name>/SKILL.md` + `.codex-plugin/plugin.json`
구조이고 `commands/` 디렉토리가 **없다**. 그리고 mccp의 `skills/` 47개는 M1이 이미 `mccp:`
접두로 등재되는 것을 봤다(r2). 즉 skill은 우회가 아니라 **그 하네스가 명령을 표현하는 방식**이다.

자동 변환(r1)에 기대는 대안은 세 축에서 진다. 규칙이 비공개라 버전마다 깨질 수 있고(Risks),
현재 핵심 6개를 하나도 덮지 못하며, 변환본은 `${CLAUDE_PLUGIN_ROOT}`를 치환하지 않고 실어
도달해도 작동하지 않는다. UI21이 요구한 "규칙 비의존"은 그 셋 전부를 사거리 밖으로 낸다.

### DD2 — 22개 skill이 아니라 **dispatcher 하나**다

후보는 둘이었다. (a) 핵심 6개(혹은 22개) 각각에 shim skill, (b) 명령 이름을 인자로 받는
dispatcher 하나.

(a)를 기각하는 이유는 **이름 충돌**이다. skill은 디렉토리 이름으로 등재되므로
`skills/plan/SKILL.md`는 `mccp:plan`이 되는데, Claude Code에서 그 이름은 이미 `/mccp:plan`
명령이 차지하고 있다. §3.17이 값을 치르고 세운 계약 — "탐지가 지목한 본문과 실제로 열리는
본문이 일치한다" — 을 정면으로 깨는 형태다. 이름을 비틀어 피할 수는 있지만(`command-plan` 등)
그러면 **Claude Code 세션마다 6~22개의 죽은 항목**이 skill 목록에 실린다.

(b)는 신규 등재가 **하나**이고, 그 하나가 22개 전부에 도달한다. 그래서 M3의 acceptance
(핵심 6개)를 구조적으로 초과한다 — 도달 가능 집합이 "우리가 shim을 쓴 것"이 아니라
"`commands/`에 실재하는 것"이 되기 때문이다.

### DD3 — dispatcher는 **열거하지 않는다**. 그래서 드리프트 가드가 필요 없다

SKILL.md가 명령 목록을 싣는 순간 그것은 `commands/`의 사본이 되고, 명령이 하나 추가되면
조용히 갈라진다. 그래서 본문은 목록 대신 **경로 규칙**만 싣는다: "`<root>/commands/<name>.md`를
읽어 그 지시를 그대로 수행하라." 집합에 대해 아무 주장도 하지 않으므로 갈라질 것이 없다.

같은 이유로 **본문을 인라인하지 않는다**. Codex 자신의 변환본은 명령 본문을 `## Command
Template` 아래에 통째로 싣는데, `plan.md`는 190KB다. 사본이면 §3.17 위반이고, 사본이 아니어도
설치 시점에 고정된 스냅샷이라 갱신을 못 따라간다.

이 결정이 test로 강제되는 지점이 Task 5의 **짝 단언**이다: SKILL.md가 명령 이름 리터럴을
갖는가와 `command-reach.js`가 열거를 갖는가가 **같은 값**이어야 한다. 지금 값은 둘 다 거짓이고,
한쪽만 참이 되면 붉어진다.

### DD4 — plugin root 해소 기법은 **측정이 고른다**. 후보를 미리 열거하고 판정 규칙을 먼저 못박는다

skill 본문은 자기 경로를 모른다. 후보는 넷이고, 각각 다른 곳에서 값을 얻는다:

| 후보 | 기법 | 성립 조건 |
|---|---|---|
| R-a | `${CLAUDE_PLUGIN_ROOT}`(및 `${CODEX_PLUGIN_ROOT}` 등 다른 철자) 문자열 치환 | Codex가 skill 본문/hook command에서 치환한다 |
| R-b | `SessionStart` hook이 해소한 절대경로를 세션 컨텍스트로 주입 | Codex가 hook의 컨텍스트 주입을 수용한다. 해소 자체는 `bootstrap.js#resolveRoot()`의 `__dirname` 폴백이 이미 한다 |
| R-c | 모델이 developer 메시지에서 보는 skill root의 부모 | M1이 skill root 3개가 그 메시지에 실리는 것을 봤다. LLM 유도에 기댄다 |
| R-d | 후보 경로 열거 one-liner (`${CODEX_HOME:-$HOME/.codex}/plugins/cache/*/mccp/*/`) | 항상 성립하되 marketplace 레이아웃을 가정한다 |

**판정 규칙을 측정 전에 못박는다: 성립하는 것 중 가장 기계적인 것을 고른다 — R-a > R-b > R-d > R-c.**
R-c가 최후인 이유는 그것만이 실행 주체의 추론에 기대기 때문이고, 그런 경로는 조용히 틀린다.
성립하는 것이 하나도 없으면 M3는 **닫히지 않는다** — 없는 도달을 도달로 반올림하는 것이
UI15가 금지한 껍데기다.

### DD5 — C2는 두 번 값을 한다. 미치환이면 M2의 출하 배선이 실제 설치에서 죽는다

M2의 `gate-demo`는 hook을 **절대경로로** 등록해 이 축을 우회했고, 그래서 B3를 `unmeasured`로
남겼다. 그러나 출하되는 `plugins/mccp/hooks/hooks.json`의 command 문자열은 여전히
`${CLAUDE_PLUGIN_ROOT}`를 쓴다. 치환되지 않으면 실제 설치에서 hook은 **시작조차 못 한다** —
M2가 세운 "0에서 1로"가 프로브 안에서만 참이 된다.

그래서 C2 스윕은 skill 본문뿐 아니라 **hook command 문자열**도 함께 잰다(같은 축, 두 표면).
미치환으로 판정되면 `hooks.json`을 하네스 중립으로 고치는 것이 M3의 일이고, 이것은 범위
확대가 아니라 PRD가 이 OQ를 "M3의 착수 조건 후보"로 배정한 대로다.

### DD6 — Claude Code 표면 오염은 오라클의 첫 단계가 스스로 막는다

dispatcher는 `plugins/mccp/skills/` 아래 살므로 **Claude Code 세션에도 등재된다.** 그 세션은
진짜 명령을 갖고 있으므로 이 skill을 써야 할 이유가 없고, 쓰면 한 단계 더 도는 손해다.

그래서 skill의 첫 지시가 자기 차단이다: `CLAUDE_PLUGIN_ROOT`가 값을 가지면(= M2 오라클의
Claude 양성 신호) "`/mccp:<name>`을 직접 쓰라"고 답하고 끝낸다. 판별을 새로 만들지 않고
`harness-ingress.js`가 이미 세운 **양성 신호 규칙**을 그대로 쓴다 — 부재를 근거로 삼지 않는다는
그 오라클의 성질이 여기서도 필요하기 때문이다.

`.codex-plugin/`에 별도 skills 루트를 두어 Codex에만 실리게 하는 대안이 있다(UI1이 추가를
명시 허용한다). 기각이 아니라 **이연**이다: mccp의 `.claude-plugin/plugin.json`에는 `skills`
키가 없는데도 r2가 잡혔으므로 그것은 관례 기본값이고, `.codex-plugin/`에 명시 `skills` 포인터를
두면 47개의 로드가 어떻게 되는지 **측정된 바 없다**. 47개를 잃는 회귀가 dispatcher 한 줄의
소음보다 크다. 그 축은 C5가 관측만 하고 판단은 하지 않는다.

### DD7 — 새 환경 토글을 만들지 않는다

M2가 `MCCP_HARNESS`(명시 designation)와 `MCCP_HARNESS_INGRESS`(kill switch)를 이미 세웠다.
dispatcher는 모델이 부를 때만 도는 skill이라 상시 발화 표면이 없고, 끄고 싶으면 부르지 않으면
된다. 토글을 더하면 registry·문서·lint 세 표면에 값을 치르면서 끄는 능력은 늘지 않는다.
`registry.js`가 Files to Change에 있는 것은 **측정 결과 토글이 불가피해질 경우에만** 열리는
자리이고, 기본 계획은 무변경이다.

### DD8 — M3는 **도달**을 주장하고 **실행**을 주장하지 않는다

도달한 `plan.md` 본문은 `Task`·`Workflow`·`AskUserQuestion`을 지시하고, Codex에는 그 도구
어휘가 없다(결합 열거의 `agent-tool-declaration`, 18곳). 그러니 본문이 도착해도 그대로
완주하지는 않는다.

이것을 껍데기(UI15)라고 부르지 않는 이유는 주장의 범위가 다르기 때문이다. M3가 주장하는 것은
"핵심 명령이 호출 가능해진다"이고 그것이 PRD의 Milestone 3 Outcome 그대로다. 강제를 주장하는
것은 M2(이미 닫힘)이고, 체인 완주를 주장하는 것은 MVP 전체다. **판정 문서가 이 경계를 명시하고,
도구 어휘의 처분은 M4로 배정한다** — 리뷰어 반전이 어차피 agent 표면을 다시 여는 축이라
같은 자리에서 처분하는 것이 싸다.

### DD9 — 변환 규칙의 corpus 상관은 기록하되 **규칙으로 승격하지 않는다**

22개 전수에서 하나의 2-술어 모델이 완벽히 분리한다: **`$ARGUMENTS`를 본문에 쓰지 않고 &&
바이트가 3704 이하이면 변환된다.** 변환된 6개는 전부 `$ARGUMENTS` 0회이고 최대 3704B
(`receipt-write`)이며, 미변환 중 `$ARGUMENTS` 0회인 넷(`prp-pr` 3981 · `archive-complete` 9333
· `milestone-close` 11525 · `resume` 12153)은 전부 3981B 이상이다. 임계는 (3704, 3981] 구간에
있고 4096이 자연스러운 후보다.

n=22에 자유 파라미터 2개라 우연일 수 있으므로 **`[정황]`으로만 적는다.** 그러나 우연이든
아니든 M3의 설계를 바꾸지 않고, 오히려 굳힌다 — 핵심 6개는 `$ARGUMENTS`를 각각
19·16·10·4·3·3회 쓰므로 **크기를 아무리 줄여도 자동 변환 대상이 되지 못한다.** 조사가
"가장 값싼 결합"으로 지목했다가 PRD가 철회한 C8 결합(본문 감량)은 이 관측으로 한 번 더
닫힌다(UI6).

## Tasks

### Task 1: C축 계측 하네스

- **Action**: `scripts/codex-probe/reach-probe.js`를 만들고 `cli.js`에 `reach` 서브커맨드를
  배선한다. 스크래치 `CODEX_HOME`에 mccp를 설치하고 `codex exec` 한 턴으로 관측한다.
  스윕 대상은 DD4의 R-a~R-d 넷과 C1·C3·C4·C5다. 실행층(spawn·파일 IO)과 판정층(순수)을
  가른다.
- **Mirror**: `scripts/codex-probe/block-probe.js`의 스윕 구조 + `cli.js`의 `try/finally`
  teardown 3요건(argv 배열 spawn · 모든 종료 경로 회수 · 남의 실행 미파괴).
- **Validate**: `MCCP_CODEX_DISABLED=1 node --test scripts/tests/codex-probe.test.js` —
  스윕 후보 집합과 TOML 생성 형태를 실제 spawn 없이 단언.

### Task 2: C1~C5 스윕 실행과 원자료 기록

- **Action**: 스윕을 돌려 `.claude/_meta/data/2026-09-09-codex-harness-truth.json`의 `runs`에
  `reach-sweep` 레코드를 더한다. CLI 버전을 함께 기록한다(UI13). 각 축의 verdict는
  `measured`/`unmeasured` 둘뿐이고, **양성 관측은 음성 대조와 짝지어질 때만** 승격한다 —
  C1은 "존재하지 않는 skill 이름을 부르면 도달하지 않는다"가 통제이고, C3은 "본문에 없는
  표식은 나오지 않는다"가 통제다.
- **Mirror**: M1 A4(`trusted_hash` 1바이트 오류 → 발화 0)와 M2 B2의 통제 설계.
- **Validate**: `node scripts/codex-probe/cli.js reach --json`이 축별 verdict와 증거 인덱스를
  낸다. `unmeasured` 축은 이유를 갖는다.

### Task 3: `command-reach.js` 해소 오라클

- **Action**: 순수 오라클을 쓴다. 입력은 `{ env, name, rootHint }`, 출력은
  `{ harness, root, commandPath, reason }`이고 **모호하면 `root: null`**이다. 해소 기법은
  Task 2가 고른 것 하나를 1차로 쓰고 나머지는 열거로 남긴다. `require.main === module`
  shim으로 `resolve <name> [--json]` CLI를 낸다.
- **Mirror**: `harness-ingress.js`(양성 신호만) + `impeccable-detect.js#resolveImpeccable`
  (전부 열거 후 하나 지목).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/command-reach.test.js` —
  22개 명령 전수 해소 · 미지 이름 거부 · `../` 경로 탈출 거부 · Claude 하네스에서 자기 차단.

### Task 4: `run-command` dispatcher skill

- **Action**: `plugins/mccp/skills/run-command/SKILL.md`를 쓴다. frontmatter는 `name` +
  `description` 둘(Codex 네이티브 형태). 본문은 4단계 산문이다 — 1) Claude 하네스면 즉시
  `/mccp:<name>`을 쓰라고 답하고 종료 2) Task 2가 고른 기법으로 root 해소 3)
  `<root>/commands/<name>.md`를 읽는다 4) 그 지시를 그대로 수행하고 인자를 `$ARGUMENTS`
  자리에 놓는다. **명령 목록도 본문 사본도 싣지 않는다**(DD3).
- **Mirror**: `plugin-management/SKILL.md`의 frontmatter 형태 + `prp-pr.md`의 "본문을 verbatim
  실행하라" 위임 관례.
- **Validate**: skill이 4KB 미만이고 명령 이름 리터럴을 갖지 않는다(Task 5 test).

### Task 5: 사본 금지 짝 단언

- **Action**: `command-reach.test.js`에 짝 단언을 넣는다 — *SKILL.md가 명령 이름 리터럴을
  갖는다*와 *`command-reach.js`가 명령 열거를 갖는다*가 **같은 값**이어야 한다. 그리고
  SKILL.md가 `${CLAUDE_PLUGIN_ROOT}`를 갖는지와 Task 2의 R-a verdict가 정합해야 한다 —
  치환되지 않는 것으로 측정됐는데 본문이 그것을 쓰면 붉어진다.
- **Mirror**: §3.17 `impeccable-guard.test.js`의 짝 단언. 그 절이 기록한 실패 —
  "배선이 아니라 산문을 검사하고 있었다" — 를 반복하지 않기 위해 단언 대상은 **오라클이 내는
  값과 본문이 읽는 값**이지 본문의 서술이 아니다.
- **Validate**: 한쪽만 바꾸면 test가 red.

### Task 6: `hooks.json` 하네스 중립화 (C2 결과 조건부)

- **Action**: Task 2의 R-a가 `${CLAUDE_PLUGIN_ROOT}` 미치환으로 나오면 command 문자열을
  치환에 의존하지 않는 형태로 바꾼다. 후보는 스윕이 함께 잰다 — 다른 철자의 변수 · plugin
  root 상대 경로 · 절대경로 주입. 치환되는 것으로 나오면 **무변경**이고 그 사실을 문서가 적는다.
- **Mirror**: M2 Task 1의 `$schema` 제거 — Codex가 실제로 받는 형태로 맞추되 Claude 쪽 동작을
  바꾸지 않는다.
- **Validate**: `node -e 'JSON.parse(require("fs").readFileSync("plugins/mccp/hooks/hooks.json","utf8"))'`
  + 기존 hook test 전량 green + 스크래치 설치에서 hook 1건 발화 관측.

### Task 7: 결합 열거 두 항목 처분 확정

- **Action**: `coupling-inventory.js`의 `install-surface-env`와 `agent-tool-declaration`
  (둘 다 `owner_milestone: 3`)의 처분을 측정 결과로 갱신한다. 전자는 UI8이 설치 UX를 사거리
  밖에 두므로 `defer` 유지하되 **왜 M3가 그것을 열지 않는지**를 note에 적는다. 후자는 M4로
  재배정하고 근거(리뷰어 반전이 같은 agent 표면을 연다)를 적는다. `owner_milestone`을 바꾸면
  ceiling 상수는 건드리지 않는다(항목 수 불변).
- **Mirror**: 그 파일 헤더의 "`owner_milestone`은 후보 귀속이고 구속이 아니다 — 실제 배정은
  각 milestone 진입 시".
- **Validate**: `node --test scripts/tests/codex-probe.test.js`의 inventory 회귀.

### Task 8: 라이브 도달 실증

- **Action**: 실제 Codex 세션에서 dispatcher를 불러 **핵심 명령 하나**의 본문이 도착하는 것을
  관측한다. 1차 대상은 `plan-prd`(19.8KB — 핵심 6개 중 최소)이고, 2차로 `plan`(190KB)을
  시도해 크기 상한을 관측한다. `plan`이 도달하지 못하면 그것은 실패가 아니라 **측정값**이며
  판정 문서와 backlog에 그대로 적는다.
- **Mirror**: M2의 `gate-demo` — 합성 payload가 아니라 **출하되는 본문**을 등록해 관측한다.
  그 구분이 없으면 "형식은 되는데 우리 것은 안 되는" 상태가 로컬 green을 통과해 도착한다.
- **Validate**: 도착 판정은 명령 본문에만 있는 표식(예: `plan-prd.md`의 고유 섹션 제목)이
  codex stdout에 나타나는지로 잰다. 음성 대조는 존재하지 않는 명령 이름으로 같은 절차를 돌려
  그 표식이 **나오지 않는 것**이다.

### Task 9: 판정 문서 · PRD · report · CHANGELOG

- **Action**: `docs/codex-harness-portability/m3-command-reach.md`에 축별 verdict, 경로 선택
  근거, 도달 실증, **주장하지 않는 것**(DD8), 미측정으로 남은 것과 그 이유를 쓴다. DD9의 corpus
  상관을 `[정황]`으로 싣는다. PRD의 M3 행을 갱신하고 OQ1과 `${CLAUDE_PLUGIN_ROOT}` OQ의 상태를
  고친다. report와 CHANGELOG(`## [Unreleased]`)를 쓴다.
- **Mirror**: `docs/codex-harness-portability/m2-gate-ingress.md`의 구조(사전 판정 규칙 →
  축 표 → 선택 근거 → 실증 → 미측정 → 주장하지 않는 것).
- **Validate**: `node scripts/version-declaration-guard.js` exit 0 (§3.7 — 번호 미선언).

## Validation

```bash
# 단위 — codex 경로를 타는 test가 실제 Codex를 부르지 않도록 반드시 disable을 붙인다 (§3.4)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/command-reach.test.js \
  plugins/mccp/scripts/lib/tests/harness-ingress.test.js \
  plugins/mccp/scripts/hooks/tests/receipt-prompt-submit.test.js \
  plugins/mccp/scripts/hooks/tests/bootstrap-resolve.test.js \
  scripts/tests/codex-probe.test.js

# 계측 — C축 verdict
node scripts/codex-probe/cli.js reach --json

# 오라클 CLI 왕복
node plugins/mccp/scripts/lib/command-reach.js resolve plan-prd --json

# hooks.json 파싱 (Task 6 이후)
node -e 'JSON.parse(require("fs").readFileSync("plugins/mccp/hooks/hooks.json","utf8")); console.log("ok")'

# 계약 정합
node plugins/mccp/scripts/lib/env-contract/lint.js
node scripts/version-declaration-guard.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| R-a~R-d 넷이 전부 불성립해 root를 해소할 수 없다 | 낮음 | R-d는 marketplace 레이아웃만 가정하므로 사실상 항상 성립한다. 그래도 전부 불성립이면 M3를 **닫지 않는다**(DD4) — 없는 도달을 반올림하지 않는다 |
| `plan.md` 190KB가 Codex 컨텍스트에 실리지 않는다 | 중 | Task 8이 이것을 **측정값으로** 다룬다. 실패해도 M3의 acceptance(`plan-prd` 도달)는 성립하고, 상한은 backlog + M4/M5 입력이 된다 |
| dispatcher가 Claude Code 세션에서 잘못 호출된다 | 중 | DD6의 자기 차단. 첫 지시가 `/mccp:<name>`으로 돌려보낸다. 잔여 위험은 목록 소음 하나 |
| C2가 미치환으로 나와 `hooks.json` 수정이 M2 회귀를 낸다 | 중 | Task 6의 validate가 Claude 쪽 hook test 전량 green을 요구한다. 형태 변경은 Codex 쪽만 여는 additive여야 한다 |
| `codex exec` 턴 비용이 누적된다(M1 실측 ~3.1k/턴, 본문 로드는 훨씬 큼) | 높음 | 스윕을 축당 1턴으로 설계하고, 190KB 시도는 **1회**로 제한한다. 반복 실행은 캐시된 원자료를 읽는다 |
| 도달했으나 실행 불가라는 사실이 "작동한다"로 읽힌다 | 중 | DD8 + 판정 문서의 「주장하지 않는 것」. report의 Acceptance에 실행 불가를 명시 기재 |
| 이 사이클의 리뷰가 마지막 cap에서 수렴하지 않는다 | 중 | UI22 — backlog에 기록하고 divergent로 receipt를 쓴다. 위조하지 않고 라운드를 늘리지 않는다(§3.16) |

## Acceptance

- [ ] 모든 task 완료
- [ ] Validation 통과
- [ ] 패턴을 재발명하지 않고 미러했다 — 오라클은 `harness-ingress.js` 형태, 판정은
      `report.js`의 measured/unmeasured 둘, 짝 단언은 §3.17 형태
- [ ] C1~C5 각 축이 `measured` 또는 **이유가 붙은** `unmeasured`이고, 양성 승격에는 음성 대조가 짝지어져 있다
- [ ] `command-reach.js`가 `commands/` 22개 전부를 해소하고 미지 이름·경로 탈출을 거부한다
- [ ] SKILL.md가 명령 목록도 본문 사본도 갖지 않으며, 그 사실이 짝 단언 test로 고정된다
- [ ] **라이브 1회 완주**: 실제 Codex 세션에서 dispatcher를 통해 핵심 명령(`plan-prd`)의
      본문 고유 표식이 stdout에 나타나고, 존재하지 않는 이름으로는 나타나지 않는다
- [ ] `${CLAUDE_PLUGIN_ROOT}` 축의 판정이 `hooks.json`에 반영됐거나(미치환), 무변경 근거가
      문서에 적혔다(치환)
- [ ] 판정 문서에 「주장하지 않는 것」이 있고 거기에 "실행 가능성을 주장하지 않는다"가 포함된다

## External Research Provenance

- Source PRD: .claude/prds/codex-harness-portability.prd.md
- References section sha256: 418212b71a4c1719a2686c561b4ccfa35258753ea632cf71be75fe0fc9d96efa
- Stamped at: 2026-09-09T07:48:38.138Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

impeccable `impeccable:impeccable` v4.3.1 (plugin channel) · critique R0/2 · verdict **CONVERGED**.

detector가 `design_signal=true`를 낸 근거는 `signal_files: ["<keyword:design>"]` — 본문의
`## Design Decisions` 표제어 한 건이다. 실제 표면은 없다. 네 anchor를 기계로 대조한 결과:

| Anchor | 관측 | 판정 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | 최대 깊이 3 (`#` 1 · `##` 10 · `###` 18) | pass |
| 강조색 화면당 1개 | 렌더 표면 없음 | n/a |
| raw markdown marker 금지 | 렌더 표면 없음 — 이 파일은 마크다운 **소스**이지 렌더 결과가 아니다 | n/a |
| 한 화면 항목 수 상한 | 렌더 표면 없음 | n/a |

`Files to Change` 16행 중 `.html`·`.jsx`·`.tsx`·`.css` 확장자 0건이고,
`renderer/`·`status.html`·`STATUS.md` 참조도 0건이며, `DESIGN_SURFACE_PATHS` 10개 중
교집합이 없다. 따라서 findings는 빈 배열이고 재편집 라운드는 열리지 않았다.

## Design Routing Guide

routing mode: auto (implement 단계에서 유효). plan 단계는 렌더 표면이 없어 어떤 impeccable
명령도 **호출하지 않는다** — 아래는 체크리스트다. 이 plan은 렌더 표면을 만들지 않으므로
implement 단계에서도 대부분 발화하지 않을 것으로 예상되나, 그 판정은 그 게이트가 한다.

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

> **이 게이트는 M3에 대해 실행되지 않았다.** `mccp-plan-codex/codex-harness-portability-m3`
> receipt는 부재이고, 이 plan은 어떤 plan-review 패널이나 Plan-Codex 라운드도 거치지 않았다.
> `/mccp:prp-implement` 진입은 §1.3 informational allow-path(missing-only partition ·
> `MCCP_RECEIPT_GATE_MODE=soft`)와 운영자의 감사 우회
> (`MCCP_SKIP_INTENT_GATE="구현이 먼저 필요. 흡수 필요한 검증 건은 구현하면서 수정 가능."`)로
> 이뤄졌다. 그 override 자체는 이 경우 기계적 효력이 0이었다 — 뒤집을 intent verdict가 애초에
> 없었기 때문이다.
>
> 부모 decision `codex-harness-portability`의 plan 게이트는 별도로 존재하며 **divergent**로
> 끝났다(L2 4/4 fail · L3 Codex divergent · finding 20건 backlog 등재). 그 미해소 항목은 이
> receipt가 승인으로 읽히지 않게 `resolution.codex_verdict='divergent'`로 봉인돼 있다.
>
> 아래 `## Codex Implementation Review`는 **implement 게이트**의 산출이며 plan 게이트를
> 대체하지 않는다.

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (`MCCP_GATE_ROUND_CAP=1`, §3.16 — 1라운드 기본)
- classification: `ok` · blocking: `false` · durationMs: 347375 · verdict: `needs-attention`
- 합치 결론: 리뷰어가 D1~D6 여섯 결정 중 **넷을 반박**했다. 핵심은 두 가지다 — 1) 내가 D1의
  해소로 제안한 "주입된 존재 probe"는 순수성 보존이 아니라 **의존성 분리일 뿐**이고, 계획의
  Task 3(검증)과 Task 4(dispatcher)가 결속되어 있지 않아 검증 결과를 우회하는 구현이 계획을
  만족한다. 2) M2가 남긴 계측 코드가 **실패를 성공으로 승격**하는 경로를 갖고 있고, M3의 C축이
  그 구조를 미러하면 같은 결함을 물려받는다.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 D5 — 따옴표로 `--plan` 검증 우회 (`receipt-prompt-submit.js:67-70`) | HIGH | ACCEPT_NOW | 재현됨. `"--plan" /dev/zero`가 sanitizer를 `dropped:null`로 통과하고 `extractPlanPath`는 `/dev/zero`로 해석 → `validate-cmd.js:378` 무제한 동기 read. DD8로 범위 밖에 둘 수 없다 |
  | F2 D2 — lstat이 부모 디렉토리 symlink 탈출을 못 막음 (동 파일 `:95-100`) | MEDIUM | ACCEPT_NOW | §3.14 기본은 backlog이나 **F1과 동일 함수 영역**이라 분리 수리가 부분 수정을 남긴다. canonical containment는 F1의 bounded read와 한 편집이다 |
  | F3 D1·D6 — dispatcher가 검증된 resolver 결과를 우회 (plan `:242-246`) | HIGH | ACCEPT_NOW | 계획 자체의 결함. Task 4가 root를 따로 구해 경로를 조립하므로 Task 3의 거부가 구속력이 없다. 해소: dispatcher는 **CLI가 검증한 `commandPath`만** 소비한다 |
  | F4 — 모델 요청 실패를 hook 차단 성공으로 판정 (`block-probe.js:248-253`) | HIGH | ACCEPT_NOW | 재현됨(status:1·signal:null·occurred:false → `blocked`). M2 종료 증거의 거짓 양성이고, M3 C축이 같은 classify 형태를 미러할 예정이라 지금 고친다 |
  | F5 — 미결정 스윕을 measured 음성으로 승격 (`report.js:256-261`) | MEDIUM | DEFER_TO_BACKLOG | 실재하나 B축 소유. M3는 **C축을 그 형태로 쓰지 않는 것**으로 전파를 끊고(음성 결론은 유효 관측에서만), B축 수리는 이연한다 |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 — ACCEPT_NOW 4건은 이 사이클에서 흡수한다
- Codex session 참조: threadId `01a08548-7d7c-7d22-a17f-67f45ab893de`

### Security Reviewer

`Task(security-reviewer)` 정상 완주(skip 없음). Codex의 두 주장을 **독립 재현**했고 범위를
정정했다. 결과는 Codex보다 강하다.

| ID | Severity | 내용 | 처분 |
|---|---|---|---|
| S1 | HIGH | **범위 정정** — `receipt-prompt.js:455` · `receipt-skill.js:231`은 sanitizer 없이 원문에 `extractPlanPath`를 호출한다. 두 파일 어디에도 `checkPlanPath`·`isFile`·`lstatSync`가 없다. 즉 따옴표 우회 없이 **평문 `--plan /dev/zero`** 로 이미 무제한 read에 도달한다. `receipt/cli.js`의 `validate --plan`도 무검증 | ACCEPT_NOW |
| S2 | HIGH (MEDIUM에서 상향) | F2는 F1과 합성되면 "작업영역 탈출"이 아니라 **프로세스가 읽을 수 있는 임의 파일 읽기**다. 같은 `readFileSync` 싱크로 간다 | ACCEPT_NOW |
| S3 | HIGH | 수정 위치가 틀렸다 — ingress 1곳만 고치면 더 쉽게 도달하는 기존 경로 셋이 남는다. **공유 초크포인트(`hash.js`)** 에 걸어야 네 진입점이 한 번에 닫힌다 | ACCEPT_NOW |
| S4 | HIGH | `/dev/zero`는 `size`를 **0으로 보고**하므로 크기 상한만으로는 통과한다. 실효 가드는 `isFile()`이고 상한은 심층 방어다. 순서도 `open()` → `fstatSync(fd)`여야 한다(`statSync(path)` 선행은 check-then-open 경합) | ACCEPT_NOW |
| S5 | MEDIUM | **실측**: `spawnSync`가 이벤트 루프를 막아 `codex exec` 진행 중 SIGINT/SIGTERM 핸들러가 **돌지 않는다**(재현됨 — 5s 자식에 1s 시점 SIGINT, 핸들러 미발화). `block-probe.js`의 주석이 주장하는 보호는 그 창에서 성립하지 않으며, 핸들러 등록이 기본 처분을 덮어 Ctrl+C가 무반응이 된다 | ACCEPT_NOW(정직화) |
| S6 | MEDIUM | shape 정규식만으로는 plan Task 3의 "미지 이름 거부"와 Task 5의 짝 단언을 **만족하지 못한다** — 열거가 없으면 짝지을 대상이 없고 ENOENT와 "없는 명령"을 구별할 수 없다 | ACCEPT_NOW |
| S7 | MEDIUM | redact 관문은 "부르면 하나"이지 구조적 강제가 아니다. 신규 producer가 `fs.writeFileSync`로 우회해도 잡는 것이 없다 | ACCEPT_NOW |
| S8 | LOW | realpath 검증 후 별도 `open`이면 check-then-open TOCTOU 잔여(로컬 동시 쓰기 권한 필요). scratch home이 `umask` 기본 모드 | 기록 |

#### S6이 F3(D1·D6)의 해소를 바꾼다 — 열거는 **디스크에서** 온다

리뷰어가 지적한 모순의 출구는 "정규식이냐 열거냐"가 아니었다. **`fs.readdirSync(<root>/commands)`
로 얻은 집합은 하드코딩 사본이 아니다** — 드리프트할 원본이 없으므로 DD3가 금지한 것에
해당하지 않는다. 그래서 셋을 동시에 얻는다: 미지 이름을 ENOENT가 아니라 `unknown-command`로
**구별해** 거부하고, 짝 단언은 여전히 "본문 리터럴 ↔ 하드코딩 열거"를 재고 둘 다 거짓으로
남으며, 명령이 추가돼도 갈라질 것이 없다.

#### 수정 위치 (S3 — 이것이 이번 흡수의 형태를 정한다)

`hash.js#markdownHash` 하나에 `open` → `fstatSync(fd)` → `isFile()` → 상한 → bounded read를
건다. 그러면 네 진입점(`receipt-prompt.js` · `receipt-skill.js` · `receipt-prompt-submit.js` ·
`receipt/cli.js`)이 **한 자리에서** 닫힌다. ingress의 tokenizer·realpath 수정은 그 위에 얹는
심층 방어이지 유일 방어가 아니다.

**이것은 M3 계획의 범위 밖이다**(`Files to Change`에 `hash.js`가 없다). 그럼에도 흡수하는
근거는 셋이다 — §3.14가 HIGH를 그 자리에서 흡수하라고 정하고, 리뷰어가 단일 초크포인트 수정이
ingress 4곳 수정보다 **작고 안전함**을 보였으며, 남기면 재현된 도달 가능 결함을 알고도 출하하게
된다. 이탈로 report에 명시한다.

### 흡수가 계획을 바꾸는 지점 (F3)

Task 3·4의 결속을 산문이 아니라 **구조**로 만든다. `command-reach.js`는 순수 후보 계산
(`resolveCandidate`)과 검증(`verify`, fs 접촉)을 **다른 함수**로 가르고, CLI shim `resolve`가
검증까지 마친 뒤에만 exit 0 + `{resolved:true, commandPath}`를 낸다. 미해소·미지 이름·root
모호는 전부 **비영점 종료**다. SKILL.md는 경로를 조립하지 않고 그 CLI를 부른 뒤 **stdout이 준
경로만** 읽으며, 비영점이면 즉시 중단하고 경로를 추측하지 않는다. 그러면 "검증을 우회하는
구현"이 계획을 만족할 수 없다 — 조립할 경로가 본문에 없기 때문이다.
