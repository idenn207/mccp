# Plan: codex-harness-portability M2 — gate-ingress

**Source PRD**: `.claude/prds/codex-harness-portability.prd.md`
**Selected Milestone**: 2 — gate-ingress
**Complexity**: Large

## Summary

Codex에서 mccp receipt 게이트를 **0회 발화에서 1회 발화로** 올리고, 선행 receipt가 없을 때
**실제로 차단하는 것**을 실측으로 고정한다. M1이 남긴 값 셋이 이 마일스톤의 전제다 —
`hooks.json`이 `$schema` 한 줄 때문에 파싱조차 안 되고, receipt 게이트의 진입점
(`UserPromptExpansion`)이 Codex에 아예 없으며, hook 자식이 `CLAUDE_PLUGIN_ROOT`를 받지 못한다.

M2는 그 셋을 닫되 **측정을 앞에 둔다.** 차단 프로토콜(Codex가 hook의 차단을 존중하는가, 어떤
형식으로)은 M1이 재지 않았고 바이너리 문자열 `[정황]`밖에 없다. 그것이 M2 Outcome의 전부이므로
배선보다 먼저 잰다. 재보고 나서 ingress를 **오라클로 고른다** — 하드코딩한 추측은
`receipt-skill.js:152`의 `tool_name === 'Skill'`이 이미 한 번 죽은 방식이다.

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
| UI15 | 게이트가 설치되나 발화하지 않는 "껍데기" 상태를 허용하지 않는다 | constraint |
| UI16 | Milestone 2는 ingress를 0에서 1로 올리는 것이며 하나로 줄이는 것이 아니다 | direction |
| UI17 | 게이트 실차단은 통과 관측이 아니라 실제 차단 기록으로만 충족된다 | constraint |
| UI18 | 하네스 출처 필드를 receipt에 넣는 판단은 Milestone 5가 소유한다 | exclusion |
| UI19 | 리뷰어 반전 경로는 Milestone 4가 소유하며 M2에서 선반영하지 않는다 | exclusion |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 오라클 | `plugins/mccp/scripts/lib/impeccable-detect.js` | 설치원을 **열거**한 뒤 실제로 열릴 하나를 지목하고, 모호하면 `null`로 답한다 — 추측하지 않는다 (§3.17) |
| 단일 체인 | `plugins/mccp/scripts/lib/session-identity.js:53-58` | 이름 해소는 chokepoint 한 곳이고 소비처는 `process.env`를 직접 읽지 않는다 (§3.18) |
| fail-open hook | `plugins/mccp/scripts/hooks/receipt-skill.js:19-33` | 모듈 스코프 `require`를 가드로 감싸 로드 실패가 throw가 아니라 `main()`의 ALLOW 경로로 흐르게 한다 |
| 차단 프로토콜 | `plugins/mccp/scripts/hooks/receipt-skill.js` (`return 2`) · `receipt-prompt.js:304-311` (stdout JSON) | 같은 저장소가 **두 형식**을 쓴다. 어느 쪽을 Codex가 존중하는지는 측정 대상이지 선택 대상이 아니다 |
| 진입점 분리 | `plugins/mccp/scripts/hooks/session-end-marker.js` 외 10건 | `require.main === module` 로 CLI shim과 export를 가른다 |
| 측정 판정 | `scripts/codex-probe/report.js` | verdict는 `measured`/`unmeasured` 둘뿐이고, 값·증거·버전 일치 셋이 다 있어야 승격 |
| 음성 대조 | M1 A4 (`trusted_hash` 1바이트 오류 → 발화 0) | 양성 관측만으로는 배선의 실재를 고정하지 못한다 |
| test 배치 | `scripts/tests/codex-probe.test.js` (node native `--test`) | 하네스 인접 test는 `scripts/tests/` 단일 파일 관례 |
| 축 분리 명명 | `codex_disabled` vs `codex_disabled_at_pr` (§1.2 v1.23.5) | 이름이 겹치는 두 축은 접미/접두로 갈라 둔다 — UI5가 요구하는 바로 그 형태 |

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). coverage 4/4, spent ~43k. -->

fan-out 4관점이 plan 초안 부재 상태에서 PRD·코드를 훑었다. CRITICAL 4건 중 3건이 "plan 파일이
없다"는 절차적 관측이라 이 문서의 존재로 해소된다. 나머지 실질 지적과 처분은 아래와 같다.

### 흡수한 것 (HIGH 이상, §3.14)

- **[HIGH][architect] ingress 선택이 미확정이면 두 번째 bespoke 경로가 생긴다** → DD2가 오라클로 닫는다.
- **[HIGH][test] 음성 대조 없이는 차단 주장이 고정되지 않는다** → Task 8이 양성/음성 쌍으로 잰다. Acceptance에 명시.
- **[HIGH][test] `$schema` 파싱 실패 자체가 무테스트다** → Task 1이 상위키 가드 test를 함께 낸다.
- **[HIGH][test] 잘못된 ingress 선택은 로컬 test를 전부 통과하면서 실제로는 한 번도 게이트하지 않는다** → 그래서 Acceptance의 마지막 줄이 라이브 완주다.
- **[HIGH][explorer] `receipt-skill.js`의 block/fail-open/shard-log를 복제하지 말고 재사용하라** → DD4가 `require.main` 분리로 코어를 공유한다.
- **[HIGH][explorer] 세션 id는 `session-identity.js` 단일 chokepoint를 거쳐야 한다** → M5 소유(UI18). M2는 payload `session_id`를 **그 자리에서만** 쓰고 체인에 손대지 않는다.
- **[HIGH][explorer] 신규 식별자에 bare `codex_*`를 쓰지 마라** → DD7이 `harness_*` 접두로 못박는다.
- **[HIGH][security] 비대화형 trust 자동화는 인간 동의 관문을 기계로 만족 가능하게 바꾼다** → DD6: 자동 승인은 **계측 하네스에만** 두고 제품 경로로 내보내지 않는다.
- **[HIGH][security] M2가 하네스 출처 없는 live receipt를 처음으로 생산한다** → 사실이다. UI18이 필드를 M5로 미뤘으므로 M2는 그 공백을 **문서에 명시**하고 감사 도구를 바꾸지 않는다. 아래 「주장하지 않는 것」 참조.

### 이연·기각한 것 (증거 첨부)

- **[CRITICAL][security] 리뷰어 반전 신뢰 경계 설계 부재** — 사실이나 **M4 소유**(UI19). M2는 리뷰어를 부르지 않는다. backlog 이연.
- **[MEDIUM][explorer] `.claude/scripts/hooks/receipt-skill.js` 이중 사본** — **기각.** 그 트리는 `hooks.json` 미등록 레거시 ECC scatter이고 마지막 커밋이 `bc18572`(2026-06-03)다. 어떤 hook 매니페스트도 그것을 가리키지 않으므로 살아 있는 결합이 아니다. 근거: `.claude/settings.json`에 `hooks` 키 부재 · `docs/multi-session-work-loop/m9-after.json:9059`가 같은 트리를 "레거시 ECC scatter, hooks.json 미등록"으로 이미 판정.
- **[MEDIUM][security] 두 하네스 동시 실행 lock 경합** — PRD Risks가 이미 M5 소유로 배정. MVP는 단독 실행.
- **[MEDIUM][test] `codex-probe/tests/` 관례 신설 여부** — 신설하지 않는다. `scripts/tests/codex-probe.test.js` 단일 파일 관례를 유지하고 M2 추가분도 거기 얹는다(파편화 회피).
- **[MEDIUM][*] harness-adapter 추상 계층 부재** — M2가 만드는 것이 그 seam의 첫 조각(`harness-ingress.js`)이다. 전면 어댑터 계층은 결합 5개 처분이 다 나온 뒤에야 형태가 정해지므로 지금 만들지 않는다(YAGNI).

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/hooks/hooks.json` | UPDATE | `$schema` 제거(Codex plugin hooks struct는 `deny_unknown_fields`) + Codex ingress hook 1건 등록 |
| `plugins/mccp/scripts/lib/harness-ingress.js` | CREATE | 하네스 판별 + ingress 지목 오라클(순수). 모호하면 `unknown` → no-op |
| `plugins/mccp/scripts/lib/tests/harness-ingress.test.js` | CREATE | 오라클 단위 test(판별표 전수 + `unknown` no-op 고정) |
| `plugins/mccp/scripts/hooks/receipt-prompt.js` | UPDATE | `require.main === module` 분리 — 코어를 `runGate(event)`로 export. 동작 무변경 |
| `plugins/mccp/scripts/hooks/receipt-prompt-submit.js` | CREATE | Codex `UserPromptSubmit` ingress. 오라클이 지목하지 않으면 즉시 exit 0 |
| `plugins/mccp/scripts/hooks/tests/receipt-prompt-submit.test.js` | CREATE | 정규화·no-op·차단 형식 회귀 |
| `plugins/mccp/scripts/hooks/bootstrap.js` | UPDATE | `resolveRoot()`에 `__dirname` 상대 폴백 추가(하네스 중립). **Task 4 측정 결과에 따라 형태 확정** |
| `plugins/mccp/scripts/hooks/tests/bootstrap-resolve.test.js` | CREATE | 폴백 회귀 + Claude 경로 무변경 |
| `scripts/codex-probe/block-probe.js` | CREATE | 차단 프로토콜 계측(후보 형식별 hook 생성 + 관측) |
| `scripts/codex-probe/cli.js` | UPDATE | `block` 서브커맨드 배선 + teardown 포함 |
| `scripts/codex-probe/report.js` | UPDATE | B축(B1~B4) verdict 승격 규칙 추가 |
| `scripts/codex-probe/coupling-inventory.js` | UPDATE | M2 소유 5항목의 disposition을 측정 결과로 갱신 |
| `scripts/tests/codex-probe.test.js` | UPDATE | B축 회귀 + 상위키 가드 + `EVENT_CANDIDATES` 정합 |
| `.claude/_meta/data/2026-09-09-codex-harness-truth.json` | UPDATE | B축 원자료 추가(UI13 — 버전 동반) |
| `docs/codex-harness-portability/m2-gate-ingress.md` | CREATE | 판정 문서(측정 → ingress 선택 근거 → 차단 실증) |
| `.claude/prds/codex-harness-portability.prd.md` | UPDATE | M2 status·Plan 셀 · OQ 갱신 |
| `.claude/PRPs/reports/codex-harness-portability-m2-report.md` | CREATE | 구현 보고 |
| `CHANGELOG.md` | UPDATE | `## [Unreleased]` 아래 누적(§3.7 — 번호 미선언) |

## Design Decisions

### DD1 — `$schema` 제거가 fork보다 싸고, 그것이 UI2를 지키는 유일한 형태다

Codex의 plugin `hooks.json` 구조체는 `deny_unknown_fields`라 `$schema` 한 줄이 **전체 파싱을
죽인다**(M1 A3 실측: `unknown field '$schema', expected 'description' or 'hooks'`). 그리고 그
실패가 error가 아니라 **warning**이라 실행은 그대로 진행된다 — 설치는 성공으로 보이고 26개
hook이 전부 사라진다. UI15가 금지한 껍데기의 교과서적 사례다.

대안은 `.codex-plugin/`에 Codex 전용 hooks 트리를 두는 것이었다. 기각한다: 그것은 hook 매니페스트
사본이 둘이 되는 것이고, §3.17이 impeccable에서 이미 값을 치른 실패 형태다(탐지가 지목한 본문과
실제로 열리는 본문이 갈린다). `$schema`는 **에디터 힌트일 뿐 어느 런타임도 읽지 않으며**, 저장소
전체에서 이 파일에만 있고(`grep -rn '"\$schema"' plugins/` → 1건) 어떤 test도 그것을 고정하지
않는다. 한 줄을 지우면 양 하네스가 같은 파일을 읽는다.

재유입은 산문이 아니라 test가 막는다: 상위키가 `{description, hooks}`의 부분집합인지를 단언한다.
그 집합은 우리가 정한 것이 아니라 **Codex가 오류 메시지로 알려 준 수용 집합**이다.

### DD2 — ingress는 고르는 것이 아니라 오라클이 지목한다

`receipt-skill.js:152`의 `tool_name === 'Skill'`은 하드코딩된 추측이었고 Codex에서 죽었다.
같은 실수를 반복하지 않기 위해 `harness-ingress.js`가 후보를 **열거**하고 이 호스트에서 실제로
성립하는 하나를 지목한다. 형태는 §3.17 `resolveImpeccable()`과 같다.

후보는 둘이다.

| 후보 | 근거 | 위험 |
|---|---|---|
| `user_prompt_submit` | M1 A2가 실재·발화를 실측했고 payload에 `prompt`가 있다(A6) | Codex의 비공개 변환 규칙에 **의존하지 않는다** — OQ1과 무관하다 |
| `pre_tool_use` | 실재·발화 실측. `tool_name` 있음(A6) | Codex의 skill 도구 이름이 미측정. 이름을 틀리면 조용히 0 발화 |

**기본 선택은 `user_prompt_submit`이다.** PRD Risks의 최고 위험이 "변환 규칙이 비공개라 핵심
명령이 도달하지 못한다"인데, prompt 텍스트 경로는 그 규칙을 지나지 않는다. `pre_tool_use`는
Task 3이 Codex의 도구 이름을 실측한 뒤에만 후보로 남는다.

**오라클이 지목하지 못하면(`unknown`) 새 hook은 아무 일도 하지 않는다.** 추측해서 발화하는 것보다
낫다 — Claude Code에는 `UserPromptExpansion` ingress가 이미 살아 있으므로 `unknown`의 비용은
"새 경로가 안 켜진다"뿐이고, 반대 방향의 비용은 이중 게이트다(아래 DD3).

### DD3 — 이중 게이트를 막는 것은 관례가 아니라 판별자다

새 hook을 `UserPromptSubmit`에 등록하면 **Claude Code에서도 발화한다.** 그러면 `/mccp:plan` 한
번에 `UserPromptExpansion`과 `UserPromptSubmit`이 같은 decision을 두 번 게이트한다. 판정은
같으므로 안전은 깨지지 않지만 `emitTaskStarted`가 msw-events에 착수를 두 번 적는다 — 감사 표면의
조용한 오염이다.

판별자는 env 두 이름의 **연언**이다: `CODEX_HOME`이 값을 갖고 `CLAUDE_PLUGIN_ROOT`가 없으면
`codex`. 단독 부정(`!CLAUDE_PLUGIN_ROOT`)으로는 부족하다 — 그 이름이 어떤 이유로든 빠진 Claude
Code 환경이 곧바로 이중 게이트가 된다.

**이 판별자는 가정이 아니라 Task 3의 측정 대상이다.** M1 A5가 Codex 쪽(`CODEX_HOME` 있음,
`CLAUDE_PLUGIN_ROOT` 없음)은 이미 쟀다. 반대쪽 — Claude Code hook 자식이 정말
`CLAUDE_PLUGIN_ROOT`를 받는지 — 는 아직 실행으로 확인되지 않았고, 그 값이 틀리면 배선은 로컬
test를 전부 통과하면서 두 하네스 중 하나에서 오작동한다.

### DD4 — 게이트 코어는 하나다. 복제하지 않는다

`receipt-prompt.js`는 526줄이고 그 안에 decision 해소 · soft/hard 모드 · L1 shard · tamper
guidance · fail-open이 다 들어 있다. 새 ingress가 그것을 복제하면 두 본문이 서로 다른 속도로
낡는다.

`require.main === module`로 CLI shim만 가르고 코어를 `runGate(event)`로 export한다. 저장소에
이미 10건 이상의 선례가 있다(`session-end-marker.js` 등). 새 hook은 payload를
`{command_name, command_args, session_id, cwd, …}`로 정규화한 뒤 그 함수를 부른다. **동작 변경 0** —
`main()`이 하던 일을 함수 이름 뒤로 옮길 뿐이고, test가 기존 경로의 바이트 동일성을 단언한다.

자식 프로세스 spawn으로 재사용하는 안은 기각했다. 프롬프트마다 node 하나가 더 뜨고, 그
비용은 게이트가 no-op인 경우에도 붙는다.

### DD5 — 차단 프로토콜은 선택이 아니라 측정이다

이 저장소는 차단을 **두 형식**으로 낸다: `receipt-prompt.js`는 stdout에
`{"decision":"block"}` + exit 0, `receipt-skill.js`는 exit 2 + stderr. Codex가 어느 쪽을 존중하는지
M1은 재지 않았고 남은 것은 바이너리 문자열(`Stop hook exited with code 2…`,
`invalid stop hook JSON output`)뿐이다 — PRD가 `[정황]`으로 분류한 등급이다.

**M2 Outcome 전체가 이 값에 걸려 있으므로 배선보다 먼저 잰다.** Task 2가 후보 형식을 하나씩
내보내고 turn이 실제로 멈추는지를 관측한다. 음성 대조는 같은 hook이 ALLOW를 낼 때 turn이
진행되는 것이다.

**어느 형식도 차단하지 않으면 그것을 그대로 보고한다.** 그 경우 M2 Outcome은 도달 불가이고,
PRD Risks의 "게이트가 설치되나 발화하지 않아 껍데기가 된다"가 현실화한 것이다. 통과 관측을
차단 실증으로 반올림하는 것은 UI17이 금지한 바로 그 행위다.

### DD6 — 자동 trust 승인은 계측 하네스에 남고 제품으로 나가지 않는다

M1이 찾은 비대화형 승인 경로(`config.toml`의 `[hooks.state."<key>"]`)는 **인간 동의 관문을
기계로 만족시킬 수 있게** 만든다. `hooks/list`로 `currentHash`를 얻을 수 있는 주체는 누구든 자기
hook을 자기 승인할 수 있다.

그래서 그 코드는 `scripts/codex-probe/`(계측 전용, 배포 트리 밖)에 머문다. `plugins/mccp/` 어디에도
trust 기록을 쓰는 경로를 만들지 않는다. 운영자가 Codex에서 mccp를 쓰려면 승인은 **본인이** 한다.
문서는 그 절차를 적고, 자동화하지 않는다.

이것이 위협모델을 바꾸지는 않는다 — 같은 권한으로 파일을 쓸 수 있는 주체는 어차피 `config.toml`을
직접 쓸 수 있다. 바뀌는 것은 **mccp가 그 버튼을 제공하는가**이고, 제공하지 않는다.

### DD7 — 신규 식별자는 `harness_*`이고 bare `codex_*`가 아니다

PRD 결정 5가 `Codex reviewer`(리뷰 축)와 `Codex host`(호스팅 축)의 분리를 요구한다. 기존
`codex_verdict` · `codex_disabled` · `codex_dedupe_at_pr`는 전부 **리뷰 축**이다. 호스팅 축이 그
어휘에 끼어들면 §3.3 fail-closed matrix를 읽는 사람이 두 축을 같은 것으로 읽는다.

선례는 같은 파일 안에 있다 — `codex_disabled`(env 정책의 정직한 주석)와
`codex_disabled_at_pr`(PR-step audit 축)은 이름으로 갈라져 있고, §1.2가 그 구분을 명시한다.

M2가 만드는 이름은 `harness_ingress` · `resolveHarness` · `MCCP_HARNESS_INGRESS`다. receipt 필드는
**하나도 만들지 않는다**(UI18 — M5 소유).

### DD8 — 이 마일스톤은 receipt 스키마를 건드리지 않는다

fan-out security가 정확히 지적했다: M2는 하네스 출처가 없는 live Codex receipt를 처음으로
생산한다. 사실이고, 고치지 않는다. UI18이 그 필드를 M5에 배정했고, §3.12는 tracked ship corpus에
새 필드를 더하는 판단을 가볍게 하지 말라고 요구한다. M2가 선반영하면 M5는 이미 발행된 receipt를
가진 채 스키마를 정하게 된다.

대신 **공백을 명시**한다. `docs/codex-harness-portability/m2-gate-ingress.md`가 "이 시점 이후의
receipt 중 어느 것이 Codex 호스트에서 나왔는지는 receipt만으로는 판별되지 않는다"를 적고,
그 문장이 M5의 착수 근거가 된다. 감사 도구(`evidence-audit.js`)는 건드리지 않는다 — 판별할 수
없는 것을 판별한다고 주장하게 만드는 변경이기 때문이다.

## Tasks

### Task 1: `$schema` 제거 + 상위키 가드
- **Action**: `plugins/mccp/hooks/hooks.json`의 `$schema` 1행 제거. `scripts/tests/codex-probe.test.js`에 상위키가 `{description, hooks}`의 부분집합임을 단언하는 test 추가. 등록된 이벤트 이름 중 Codex enum에 없는 것(`UserPromptExpansion`·`PostToolUseFailure`)을 **열거된 예외**로만 허용하고, 목록 밖의 새 이름이 들어오면 red.
- **Mirror**: `scripts/tests/codex-probe.test.js` M2 test — 기대값을 원자료(`runs[id=event-enum].result.fields_present`)에서 파생해 두 표면이 조용히 갈라지지 못하게 하는 형태.
- **Validate**: `node --test scripts/tests/codex-probe.test.js` · `git diff --stat plugins/mccp/hooks/hooks.json`이 1행 삭제

### Task 2: 차단 프로토콜 계측 (B1·B2)
- **Action**: `scripts/codex-probe/block-probe.js` 신설. 후보 형식 3종(stdout `{"decision":"block"}`+exit 0 · exit 2+stderr · `hookSpecificOutput.permissionDecision`)을 `UserPromptSubmit`과 `PreToolUse`에서 각각 방출하고 turn이 멈추는지 관측. 각 양성 관측마다 **같은 hook의 ALLOW 형식**으로 음성 대조.
- **Mirror**: `scripts/codex-probe/cli.js`의 argv 배열 + `shell:false` spawn · `try/finally` teardown · `MCCP_PROBE_TRUST_MODE` 단일 소유.
- **Validate**: `node scripts/codex-probe/cli.js block --clean-env --out <json>` → B1·B2에 값·증거·`codex_version` 셋이 모두 실림

### Task 3: 판별자·플러그인 루트 계측 (B3·B4)
- **Action**: (a) Codex hook 자식이 `${CLAUDE_PLUGIN_ROOT}`를 **command 문자열에서 치환받는지**를 실측 — 치환되면 스크립트가 뜨고, 안 되면 파일을 못 찾는다. (b) Claude Code hook 자식이 `CLAUDE_PLUGIN_ROOT`를 env로 받는지 실측(판별자의 반대쪽). (c) Codex의 도구 이름 집합 수집(`pre_tool_use` 후보 판정용).
- **Mirror**: M1 A5의 `--clean-env` 최소 env 측정 — 부모 env 오염을 배제하지 않으면 값이 인용 불가가 된다.
- **Validate**: B3·B4 verdict `measured` · 판별자 표가 두 하네스 양쪽 값을 가짐

### Task 4: ingress 오라클
- **Action**: `plugins/mccp/scripts/lib/harness-ingress.js` 신설 — `resolveHarness(env)` → `claude|codex|unknown`, `resolveIngress({env})` → `{harness, ingress, event, blockProtocol, reason}`. 순수 함수, I/O 없음. Task 2·3의 측정값을 상수로 못박되 **출처 주석**으로 원자료 경로를 남긴다. `MCCP_HARNESS_INGRESS=off` kill switch.
- **Mirror**: `impeccable-detect.js` `resolveImpeccable()` — 열거 후 지목, 모호하면 `null`.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/harness-ingress.test.js`

### Task 5: 게이트 코어 분리
- **Action**: `receipt-prompt.js`에 `require.main === module` 가드를 넣고 코어를 `runGate(event)`로 export. 기존 CLI 동작은 바이트 동일.
- **Mirror**: `plugins/mccp/scripts/hooks/session-end-marker.js`의 shim/export 분리.
- **Validate**: 기존 receipt hook test 전량 green · `node -e "require('./plugins/mccp/scripts/hooks/receipt-prompt.js')"`가 stdin을 기다리지 않고 즉시 반환

### Task 6: Codex ingress hook 배선
- **Action**: `receipt-prompt-submit.js` 신설 — stdin 파싱 → 오라클 → 지목되지 않으면 exit 0 → 지목되면 `prompt`를 `{command_name, command_args}`로 정규화 → `runGate()` 위임 → Task 2가 고른 차단 형식으로 방출. 정규화는 엄격: trim 후 `^/?mccp:[a-z0-9][a-z0-9-]*`만 인식하고 그 밖은 `null`(=ALLOW). `hooks.json`에 `UserPromptSubmit` 항목 1건 등록(id `mccp:receipt-prompt-submit`).
- **Mirror**: `receipt-skill.js:19-33`의 가드된 모듈 스코프 require + `main()` fail-open.
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/receipt-prompt-submit.test.js` · Claude Code 판별 시 exit 0 + stdout 무출력

### Task 7: bootstrap 플러그인 루트 폴백
- **Action**: Task 3(a) 결과에 따라 분기. 치환이 **되면** `bootstrap.js#resolveRoot()`에 `__dirname` 상대 폴백을 마지막 후보로 추가(`receipt-prompt.js:20` 형태). 치환이 **안 되면** `hooks.json`의 command 경로 형태를 고치는 것이 답이고 이 태스크는 그쪽으로 바뀐다. 측정 전에 형태를 확정하지 않는다.
- **Mirror**: `receipt-prompt.js:20` — `process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..')`.
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/bootstrap-resolve.test.js` · Claude Code 해소 경로 무변경 단언

### Task 8: 실차단 실증 (라이브, Metric 2)
- **Action**: 격리 홈에서 mccp 설치 → trust 승인 → 선행 receipt **부재** 상태로 `/mccp:*` 상당 프롬프트를 `codex exec`에 넣어 게이트가 차단하는 것을 관측·기록. 이어서 receipt를 갖춘 상태로 같은 프롬프트를 넣어 **통과**하는 음성 대조. 두 관측 모두 `codex_version` 동반.
- **Mirror**: M1 A4의 음성 대조 — 양성 하나로는 배선의 실재가 고정되지 않는다.
- **Validate**: 원자료에 차단·통과 두 레코드 + 각각의 증거 줄 인덱스

### Task 9: 판정 문서 · PRD · 인벤토리 · 보고
- **Action**: `docs/codex-harness-portability/m2-gate-ingress.md` 작성(측정 → ingress 선택 근거 → 차단 실증 → 주장하지 않는 것). `coupling-inventory.js`의 `owner_milestone:2` 5항목 disposition을 측정 결과로 갱신하고 `COUPLING_INVENTORY_CEILING` 짝을 맞춘다. PRD의 M2 행 status·Plan 셀 갱신 + OQ 갱신. report + CHANGELOG `## [Unreleased]`.
- **Mirror**: `docs/codex-harness-portability/m1-harness-truth.md`의 "사전 선언한 판정 규칙 → 축별 상세 → 주장하지 않는 것" 골격.
- **Validate**: `node --test scripts/tests/codex-probe.test.js`(ceiling 짝) · `node scripts/version-declaration-guard.js`

## Validation

> **이 절은 구현 중 정정됐다.** 원본의 검사 넷이 구조적으로 무효였고(L2-7·L2-8 + 실측 2건),
> 무효인 검사는 통과해도 아무것도 보증하지 않으므로 문구가 아니라 명령을 고쳤다. 무엇이
> 왜 틀렸는지는 각 항목에 남긴다.

```bash
# 1. 신규·수정 단위 test (Codex 미호출)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  scripts/tests/codex-probe.test.js \
  plugins/mccp/scripts/lib/tests/harness-ingress.test.js \
  plugins/mccp/scripts/hooks/tests/receipt-prompt-submit.test.js \
  plugins/mccp/scripts/hooks/tests/bootstrap-resolve.test.js

# 2. 게이트 코어 분리가 기존 경로를 깨지 않았는지 (Task 5 회귀)
#    정정: Node 22의 `--test`는 **디렉토리 인자를 모듈 경로로 해석**한다
#    (`Cannot find module '.../tests'`). 원본은 디렉토리를 넘겨 항상 실패했다.
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  $(ls plugins/mccp/scripts/hooks/tests/*.test.js plugins/mccp/scripts/receipt/tests/*.test.js)

# 3. hooks.json이 두 하네스 모두에서 파싱 가능한 형태인지 (Task 1 가드)
node -e '
  const j=require("./plugins/mccp/hooks/hooks.json");
  const bad=Object.keys(j).filter(k=>k!=="description"&&k!=="hooks");
  if(bad.length){console.error("unknown top-level key(s):",bad);process.exit(1)}
  console.log("hooks.json top-level OK; events:",Object.keys(j.hooks).length)'

# 4. 차단 프로토콜 계측 (라이브 — Task 2)
#    정정: `report --in`은 **존재한 적 없는 플래그**다. `cmdReport`는 무시하고
#    `flag(args,'--log',defaultLog())`로 기본 로그를 읽어, 검사가 조용히 아무것도
#    검사하지 않았다. B축 입력 둘을 각각 받는 플래그를 신설했다.
node scripts/codex-probe/cli.js block --out /tmp/m2-block.json
node scripts/codex-probe/cli.js report \
  --block /tmp/m2-block.json \
  --truth .claude/_meta/data/2026-09-09-codex-harness-truth.json

# 5. 실차단 실증 (라이브 — Task 8). 양성·음성 쌍이 모두 있어야 통과
#    `gate-demo`는 pair_ok가 아니면 비영점으로 끝난다.
node scripts/codex-probe/cli.js gate-demo --out /tmp/m2-gate-demo.json

# 5b. B축 승격 확인 (음성 대조가 성립해야 B1이 measured가 된다)
node scripts/codex-probe/cli.js report --block /tmp/m2-block.json \
  --truth .claude/_meta/data/2026-09-09-codex-harness-truth.json \
  | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
      const need=["B1_block_protocol","B2_block_negative_control"];
      const miss=need.filter(k=>!j.axes[k]||j.axes[k].verdict!=="measured");
      if(miss.length){console.error("unmeasured:",miss);process.exit(1)}
      console.log("block axes measured")'

# 6. 버전 동반 기록 (UI13)
node -e '
  const j=require("./.claude/_meta/data/2026-09-09-codex-harness-truth.json");
  const bad=j.runs.filter(r=>!r.codex_version);
  if(bad.length){console.error("runs without codex_version:",bad.map(r=>r.id));process.exit(1)}
  console.log("all runs carry codex_version")'

# 7. 결합 인벤토리 — 미열거 잔여 0 (Metric 4)
#    정정: `scan-coupling.js:172`가 내는 `unlisted`는 **수**다. 원본의
#    `j.unlisted && j.unlisted.length`는 수에 `.length`를 물어 항상 undefined(=falsy)라
#    **어떤 입력에도 실패할 수 없는 no-op**이었다. 배열은 `unlisted_items`다.
node scripts/codex-probe/scan-coupling.js --json \
  | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
      if(j.unlisted>0){console.error("unlisted:",JSON.stringify(j.unlisted_items));process.exit(1)}
      if(j.fossil>0){console.error("fossil:",JSON.stringify(j.fossil_items));process.exit(1)}
      console.log("coupling unlisted=0 fossil=0")'

# 8. version 미선언 (UI4 · §3.7)
node scripts/version-declaration-guard.js --base origin/main

# 9. 머지 사고 검증 (§3.5.1) — 의도치 않은 삭제 0
git diff --diff-filter=D --name-only origin/main...HEAD

# 10. 격리 잔재 부재 — read-only 검사
#     정정: `--verify`는 구현된 적이 없었고 `main()`은 `--force`만 알았다. 즉 이 줄은
#     "잔재 확인" 대신 **파괴적 teardown**을 실행했고, 남의 live run이 lock을 쥐면
#     exit 1(=잔재 있음)로 읽혔다. read-only 서브커맨드로 구현했다.
node scripts/codex-probe/cli.js teardown --verify

# 11. 환경변수 계약 (security M3 — 신규 토글 2건 등재)
node plugins/mccp/scripts/lib/env-contract/lint.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **어느 차단 형식도 Codex에서 차단하지 않는다** — M2 Outcome 도달 불가 | 중 | Task 2가 배선 **전에** 잰다. 불가로 판명되면 통과 관측을 차단으로 반올림하지 않고 그대로 보고하며, PRD Risks의 "껍데기" 행이 현실화한 것으로 기록한다(UI17) |
| 판별자가 틀려 Claude Code에서 **이중 게이트**가 된다 | 중 | DD3 — 연언 판별자 + Task 3이 양쪽 하네스에서 실측. `unknown`은 no-op이라 오작동 방향이 "안 켜짐"으로 접힌다 |
| `$schema` 제거가 Claude Code 파싱을 깬다 | 낮음 | 에디터 힌트일 뿐이고 어떤 test도 고정하지 않음을 실측(`grep` 1건). Validate 2·3이 회귀를 잡는다 |
| `receipt-prompt.js` 코어 분리가 기존 게이트 동작을 바꾼다 | 중 | Task 5는 **동작 변경 0**을 목표로 하고 Validate 2가 기존 hook·receipt test 전량으로 회귀를 잡는다 |
| 새 `UserPromptSubmit` hook이 전 사용자 세션마다 발화해 지연을 더한다 | 중 | 오라클 판정이 첫 분기이고 `claude`/`unknown`이면 파싱 직후 exit 0. `MCCP_HARNESS_INGRESS=off` kill switch |
| prompt 텍스트가 신뢰 불가 입력인데 decision 해소에 들어간다 | 중 | 정규화가 `^/?mccp:[a-z0-9][a-z0-9-]*`만 인식하고 나머지는 `null`(ALLOW). decision slug는 기존 `deriveDecisionId`가 이미 정규화하며 M2는 그 체인을 바꾸지 않는다 |
| M2가 하네스 출처 없는 live receipt를 생산해 감사 대조가 모호해진다 | 중 | DD8 — 필드는 M5 소유(UI18). 공백을 판정 문서에 **명시**하고 감사 도구는 건드리지 않는다 |
| Codex 버전 상승으로 측정값이 낡는다 | 중 | 전 레코드에 `codex_version` 동반(UI13). Validate 6이 누락을 red로 잡는다 |
| 라이브 계측이 실제 `~/.codex`를 오염시킨다 | 낮음 | M1의 `CODEX_HOME` 격리 + `try/finally` teardown 재사용. Validate 10 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] `plugins/mccp/hooks/hooks.json`이 Codex에서 **파싱되고** hook이 0이 아닌 개수로 materialize된다(현재 0)
- [ ] ingress 오라클이 Codex에서 후보 하나를 **지목**하고, Claude Code에서는 새 경로를 켜지 않는다(이중 게이트 0)
- [ ] **차단 프로토콜 B1이 `measured`** — 어느 형식이 차단하는지(또는 어느 것도 차단하지 않는지)가 값·증거·버전과 함께 기록된다
- [ ] **선행 receipt 부재 상태에서 Codex 게이트가 실제로 차단한 로그가 있다**(Metric 2 — 통과 관측은 충족이 아니다)
- [ ] **음성 대조**: receipt를 갖춘 같은 프롬프트가 통과한다(양성 하나로는 배선의 실재가 고정되지 않는다)
- [ ] `coupling-inventory.js`의 `owner_milestone:2` 5항목이 전부 측정 기반 disposition을 갖고 `unlisted=0`
- [ ] `plugin.json` version 미선언(UI4 · §3.7) — `version-declaration-guard` exit 0
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동) — 구체적으로: 격리 홈에서 `codex exec` 한 턴이 mccp hook을 발화시키고, 그 턴의 receipt 게이트가 차단 또는 통과를 **기록**한 원자료 레코드가 존재할 것

## 이 마일스톤이 주장하지 않는 것

- **"mccp가 Codex에서 작동한다"를 주장하지 않는다.** 주장하는 것은 "receipt 게이트가 최소 하나의 ingress로 발화하고 차단한다"까지다. 명령 도달(M3) · 리뷰어 교차성(M4) · chain 동등성(M5)은 각각의 소유다.
- **ingress가 최선임을 주장하지 않는다.** 오라클이 지목한 것은 *이 버전에서 성립하는* 후보이고, `pre_tool_use` 쪽이 더 나을 가능성은 Task 3의 도구 이름 측정 결과에 열려 있다.
- **하네스 출처를 판별할 수 있다고 주장하지 않는다.** M2 이후의 receipt는 어느 하네스가 만들었는지 receipt만으로 판별되지 않는다(DD8 · UI18).
- **다른 Codex 버전에 대해 아무것도 주장하지 않는다.** 전부 `0.153.4` 한 버전의 값이다(UI13).
- **trust 승인을 자동화하지 않는다.** 그 경로는 계측 하네스에만 있고 운영자가 직접 승인한다(DD6).

## Design Critique

- 트리거: axis b (narrow whitelist) — `impeccable-detect.js`가 plan 본문의 `Patterns to Mirror`에서
  **참조**되어 `design_signal=true`가 됐다. `Files to Change`에는 그 파일이 없다(자기 참조 오탐, M1과 동형).
- 호출: `Skill(impeccable:impeccable, "critique …")` — 오라클이 해소한 call form
  (source=plugin, version=4.3.1, shadowed=false, eclipsed 0).
- 라운드: 1 (round=0/cap=2), verdict **CONVERGED**.
- 판정 근거 — 이 plan의 `Files to Change` 산출물 확장자는 `.js`·`.json`·`.md` 셋뿐이고
  렌더 surface 확장자(`.html`/`.jsx`/`.tsx`/`.css`)가 **0개**다. 네 Output Constraint 중
  뷰포트를 전제하는 셋(강조색 1개 · raw marker · 항목 수 상한)은 적용 대상이 없고,
  적용 가능한 H15(heading depth ≤ 3)는 실측 통과(`####` 0건).
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

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (`MCCP_GATE_ROUND_CAP=1` · `MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion`)
- classification: `ok` · blocking `false` · durationMs 378221 · structured verdict **`needs-attention`** → `CODEX_VERDICT=divergent`
- 합치 결론: **DD3 판별자가 M1 자신의 원자료에 의해 반증됐고, `$schema` 제거의 사거리가 1건이 아니라 29건이다.** 배선을 그대로 구현하면 게이트는 기본 운용에서 발화하지 않고(껍데기), Codex 쪽에서는 미측정 hook 29건이 한꺼번에 materialize된다.

### YAGNI Triage — Implement-Codex R1 (4건)

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 (D4) probe run-lock의 60s lease가 살아 있는 소유자를 회수한다 (codex 호출은 180s) | HIGH | ACCEPT_NOW | 실측 확인 — `cli.js` `live = pidAlive(pid) && age <= STALE_MS(60s)`. 180s 호출이 61s에 stale 판정되어 남의 home·auth 사본이 삭제된다. §3.6 `pr-phase-lock` tri-state로 교정 |
| F2 (D3) "turn이 멈췄다"는 두 이벤트에 공용될 수 없는 술어 | HIGH | ACCEPT_NOW | crash·timeout·auth 실패가 차단과 같은 모양이 된다. 이벤트별 술어 + `inconclusive` 3값으로 교정 |
| F4 (D6) Task 3(b)가 음성이면 두 하네스의 판별 입력이 동일해진다 | HIGH | ACCEPT_NOW | L2-2와 같은 축을 반대편에서 지목. 아래 DD3 이탈로 흡수 |
| F3 (D1) block-only emitter는 recovery/TEMPFAIL 출력 경로를 번역하지 않는다 | MEDIUM | ACCEPT_NOW | §3.14 기준으로는 backlog이나, **L2 패널이 같은 축을 HIGH로 두 번(L2-1·L2-10) 지목**했으므로 그 등급을 따라 흡수한다. seam을 outcome 전체로 낸다 |

### YAGNI Triage — 선행 L2 패널 미흡수분 (backlog에서 회수, 8건)

`MCCP_REVIEW_SINGLE_PASS`가 떨어뜨려 `.claude/plans/codex-findings-backlog.md`에 적재됐던 항목이다.
사용자 override 사유(`MCCP_SKIP_INTENT_GATE="구현하면서 흡수 진행"`)에 따라 구현 시점에 회수한다.
bare `verdict=fail` 4행은 §3.14 해제조건이 지목한 `quorum.js` 합성 산물이라 finding으로 세지 않는다.

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| L2-1·L2-10 DD4(동작 변경 0)와 Task 6(다른 차단 형식)은 양립 불가 | HIGH | ACCEPT_NOW | 실측 확인 — `block()`이 스스로 stdout에 쓰고 0을 반환해 seam이 없다. outcome 전체를 emitter 뒤로 |
| L2-2 DD3의 양성 조건 `CODEX_HOME`은 **프로브가 스스로 설정한 값**이다 | HIGH | ACCEPT_NOW | 원자료 `runs[id=env-projection-clean].result.injected_by_codex = []`가 이를 확정한다. DD3 이탈로 흡수 |
| L2-11 `$schema` 제거의 사거리는 29 핸들러 전부(exit-2 가드 5종 포함) | HIGH | ACCEPT_NOW | 실측 확인 — `receipt-skill` · `pr-phase-guard`(2 이벤트) · `ultracode-phase-guard` · `goal-phase-guard`. 하네스 가드 없이 제거하지 않는다 |
| L2-7 Validation #7은 구조적으로 실패 불가한 no-op | HIGH | ACCEPT_NOW | 실측 확인 — `scan-coupling.js:172`가 `unlisted`를 **수**로 낸다. `j.unlisted && j.unlisted.length`는 항상 falsy. 배열은 `unlisted_items` |
| L2-8 Validation #4·#5의 `report --in`은 존재하지 않는 플래그 | HIGH | ACCEPT_NOW | 실측 확인 — `cmdReport`는 `--log/--before/--after/--observations/--out`만 읽는다 |
| L2-4 `block-probe.js`가 redact 관문을 상속한다는 보장이 plan에 없다 | HIGH | ACCEPT_NOW | 신규 산출은 전부 `makeGate`/`emitGuarded` 경유로 못박는다 |
| L2-5 `^/?mccp:` 정규화는 Codex에 슬래시 확장이 없으므로 실제 호출 경로에서 발화하지 않는다 | HIGH | ACCEPT_NOW(범위 정정) | 부분 수용 — 게이트는 **확장된 명령이 아니라 리터럴 프롬프트 텍스트**를 키로 삼는다. 그 사실을 판정 문서에 명시하고, 명령 도달 자체는 M3 소유임을 재확인한다 |

- Deferred to backlog: 0 (전건 흡수). 기존 12행은 회수 대상이므로 그대로 두고 본 섹션이 처분을 기록한다.
- Open Questions: **SECURITY-HIGH (H1·H2·H3)** — 2.5.5에서 MCCP-GATE-STOP 후 사용자 재확인으로 착수 전 흡수 완료(각 항목의 처분은 위 `착수 전 최소 요구` 참조) · DD3 판별자 이탈은 `구현 시점 이탈` 절이 소유
### Security Reviewer

`Task(security-reviewer)` — 기준 커밋 `53f4b65`. 편집 없음. **HIGH 3 · MEDIUM 7 · LOW 3.**
HIGH가 존재하므로 Phase 2.5.5 규칙에 따라 **MCCP-GATE-STOP** — Phase 3 미진입, receipt 미작성.

| ID | Severity | 요지 | 증거 |
|---|---|---|---|
| H1 | HIGH | Codex가 승인한 것은 저장소 `hooks.json` 해시인데, 실제로 실행되는 본문은 `~/.claude/plugins/cache/mccp/mccp/<ver>/`다 — trust 해시가 덮지 않는 트리 | `bootstrap.js:11-12`(env 무검증) · `:17-45`(home 스캔) · `:71-77`(require) · M1 `plugin-autodiscovery`의 `artifacts_written` 7건 |
| H2 | HIGH | `CLAUDE_PLUGIN_ROOT` 하나가 게이트 kill switch와 코드 로딩 리다이렉트를 겸하며 무음·무감사다 | `MCCP_SKIP_RECEIPT`(`receipt-skill.js:165` loud) · `warnIfOff` 대비. 하네스 소유 이름이라 env-contract registry 밖 |
| H3 | HIGH | 프롬프트 자유 텍스트 → `--plan` → 상한 없는 임의 파일 read, 그 오류 문자열이 `additionalContext`로 모델에 재주입 | `extract-plan-path.js:59-70` · `hash.js:174` `readFileSync`(상한/lstat 없음) · `validate-cmd.js:386-390` · `receipt-context-schema.js:69` |

MEDIUM 7건 — M1 `hookEventName` 하드코딩 5곳(`receipt-prompt.js:133,252,307,446,494`) · M2 `$schema` 제거가 26건 동시 활성 ·
M3 `MCCP_HARNESS_INGRESS`가 env-contract registry 밖(L1 red) · M4 프로브 lock/자격증명이 스윕에서 깨짐(SIGINT 핸들러 0건 ·
`--verify` 미구현) · M5 redact 관문은 **경로만** 보고 토큰·계정 식별자 규칙이 0건이며 `probe-hook.js:51`은 slice→redact 역순 ·
M6 `grantHookTrust`가 대상 home 미검증 + project hook 무차별 승인 + `appendFileSync` 중복 테이블 ·
M7 DD6 confinement은 성립하나 저장소가 PUBLIC이라 레시피가 공개돼 있다.

LOW 3건 — L1 커버리지는 "사람이 리터럴 슬래시 명령을 타이핑한 턴"뿐 · L2 Codex payload에 `tool_use_id`가 없어 G1 fail-open이 hook-trace에 안 남음 ·
L3 `--clean-env`가 기본값이 아니라 운영자 env 이름 전량이 tracked 파일에 실릴 수 있음.

**결함이 아니라고 확인된 것** — 제안 정규식은 앵커드·비선형성 없음(ReDoS 없음) · `deriveDecisionId`는 `SLUG_RE`로 전 경로 정규화(경로 주입 없음) ·
DD6 파일 confinement은 `Files to Change` 기준 성립 · 프로브 spawn은 argv 배열 + `shell:false`로 견고.

### 착수 전 최소 요구 (리뷰어 판단, 이 게이트가 채택)

1. **H1** — `resolveRoot()`를 `env(+MARKER 검증) → __dirname 상대 → home 스캔` 순으로. Task 7이 적은 "마지막 후보" 위치는 도달하지 않는다. test에 "env 부재 + home cache 존재" 픽스처 추가.
2. **H2** — payload 형태를 1차 판별자로(`이탈 1`과 합류). `claude`/`unknown` 접힘에 loud stderr 1줄 — 무음 skip은 껍데기와 구분되지 않는다.
3. **H3** — `command_args`를 첫 줄 + 길이 상한으로 제한. `planPath`에 repo-root containment + `lstat` regular-file + 크기 상한. 오류 메시지는 `err.code`만, 경로는 접어서.
4. **M1** — `runGate(event, {hookEventName})`로 이름 주입 가능화(기본값 유지 시 동작 변경 0). Task 8 실증은 합성 payload가 아니라 실제 `runGate` 출력으로.
5. **M3** — `Files to Change`에 env-contract registry 3면 추가 + Validation에 `env-contract/lint.js`.


- Codex session 참조: threadId `01a084ce-46f6-7a91-99d3-d8381e9c0088`

## 구현 시점 이탈 (Deviations absorbed at implement time)

### 이탈 1 — DD3의 판별자를 폐기하고 "양성 신호 없으면 `unknown`"으로 바꾼다

**plan이 말한 것**: `CODEX_HOME`이 값을 갖고 `CLAUDE_PLUGIN_ROOT`가 없으면 `codex`.

**반증**: M1 원자료 `runs[id=env-projection-clean].result`가 `injected_by_codex: []`이고
`value_carrying_observed: ["CODEX_HOME","PWD"]`인데, 그 `CODEX_HOME`은 `cli.js`가 자식 env에
**직접 넣은 값**이다. 즉 M1은 "Codex가 `CODEX_HOME`을 주입한다"를 잰 적이 없다. 기본 운용에서
운영자는 그 이름을 export하지 않으므로(Codex는 `~/.codex`를 기본으로 쓴다) 연언의 양성 조건이
성립하지 않고, 오라클은 항상 `unknown`으로 접혀 **게이트가 발화하지 않는다**. UI15가 금지한
껍데기가 판별자 자체에서 나온다. 두 리뷰어가 독립적으로 같은 곳을 지목했다(L2-2 · Codex D6).

**대체 규칙** — 부재가 아니라 **양성 신호**로만 지목한다:

1. `MCCP_HARNESS ∈ {claude, codex}` — launcher-owned 명시 designation. 있으면 그 값.
2. 없고 `CLAUDE_PLUGIN_ROOT`가 값을 가지면 `claude` (Task 3(b)가 이 주입을 양성으로 재기 전에는
   `unknown`과 같은 결과를 내므로 안전 방향으로만 작동한다).
3. 그 밖에는 전부 `unknown` → **새 ingress는 아무 일도 하지 않는다**.

**대가를 숨기지 않는다**: 이 규칙에서 Codex 게이트는 `MCCP_HARNESS=codex`를 켠 운영자에게만
발화한다. DD6이 trust 승인을 이미 수동 절차로 못박았으므로 설치 절차에 env 한 줄을 더하는 것은
같은 성질의 단계이고, 그 한 줄은 **문서화된 설치 단계**이지 우회가 아니다. 그러나 "설치만 하면
켜진다"는 아니며, 판정 문서가 그 사실을 그대로 적는다.

### 이탈 2 — `$schema` 제거를 29 핸들러 materialize와 함께 판정한다

DD1은 사거리를 "한 줄"로 적었으나 실측은 핸들러 29건이고 그중 exit-2 fail-closed 가드가 5종이다.
Codex에서 hooks.json이 파싱되는 순간 그 전부가 살아나며, 어느 것도 Codex에서 측정된 적이 없다.
따라서 제거는 **하네스 가드가 선다는 조건에서만** 착지시키고, 가드가 서기 전에는 제거하지 않는다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## External Research Provenance

- Source PRD: .claude/prds/codex-harness-portability.prd.md
- References section sha256: 418212b71a4c1719a2686c561b4ccfa35258753ea632cf71be75fe0fc9d96efa
- Stamped at: 2026-09-09T05:53:51.240Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.
