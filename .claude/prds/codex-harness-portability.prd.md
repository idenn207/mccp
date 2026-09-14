# codex-harness-portability — 한도에 걸린 자리에서 하네스를 바꿔 이어간다

> 우산 PRD `harness-wiring-integrity`의 자식이 **아니다.** 그 우산은 단일 하네스 안의
> 배선 정합을 다룬다. 이것은 하네스를 하나 더 여는 **새 축**이다.
>
> **용어 고정**: `Codex reviewer` = 기존 축(Claude가 작성, Codex가 리뷰 — CLAUDE.md §1.2·§3.3).
> `Codex host` = 이 PRD의 축(Codex CLI가 mccp를 호스팅). 이름이 겹치므로 섞어 쓰지 않는다.
>
> 근거 조사: [2026-09-09-codex-harness-portability.md](../_meta/2026-09-09-codex-harness-portability.md)
> 재측정·교차검증: 2026-09-09 워크플로 `wf_aed0bebf-1a6` (측정 7축 + 반증 12건, 전부 high confidence)

## Problem

Claude 사용량 한도에 도달하면 작업이 그 자리에서 멈춘다. mccp의 게이트·receipt chain은 진행
중인 decision의 유일한 상태인데, 그것이 Claude Code 하네스에 묶여 있어 다른 하네스로 옮겨
이어갈 수단이 없다. 비용 축만의 문제도 아니다 — 운영자는 Claude 계열 모델이 파이프라인을
구동할 때와 Codex 계열이 구동할 때 **결과가 다를 것**으로 보고 있으며, 지금은 그 차이를
관측할 방법 자체가 없다.

그리고 오늘 Codex에 mccp를 설치하면 상태가 나빠지는 방향으로 특이하다: **설치는 성공하는데
receipt 게이트는 한 번도 발화하지 않는다.** 게이트의 두 ingress가 구조적으로 모두 죽기
때문이다(아래 Evidence). 즉 "돌아가는 것처럼 보이지만 아무것도 강제하지 않는" 상태 —
이 저장소가 §3.1에서 일관되게 거부해 온 바로 그 실패 모드가 **기본값으로** 성립한다.

## Evidence

전부 2026-09-09 실측이며 신뢰도를 구분해 표기한다. `[실측]` = 명령을 돌리고 출력을 본 것,
`[정황]` = Codex 바이너리 문자열, `[미측정]` = 아직 확인하지 않은 것.

- **설치·배포 표면은 고치지 않아도 이미 작동한다** `[실측]`. manifest 3중 fallback
  (`.codex-plugin/` → `.claude-plugin/` → `.cursor-plugin/`), marketplace 인식,
  `ref: release` 존중까지 전부 확인. ~~재설치·원복 후 `~/.codex/config.toml` sha256 일치
  (`da2344ed…`), 잔여 캐시 0.~~ `codex features list` → `hooks stable true`.
  **정정(2026-09-09 재측정).** 인용된 sha256은 현행이 아니다 — 실측값은 `9a03a94f…`이고, 애초에
  whole-file 대조는 유효한 지표가 아니다(Codex가 통상 운용 중 `[tui.model_availability_nux]`·
  `[projects…] trust_level`을 스스로 쓴다). "잔여 캐시 0"도 거짓이었다 —
  `~/.codex/plugins/cache/mccp/`가 **빈 디렉토리로 잔존**하며, 이는 M1 측정 시작 **전부터** 그랬다.
  낡은 문장을 지우지 않는 이유는 무엇이 왜 달라졌는지가 함께 남아야 하기 때문이다(§3.7 형태).
- **receipt 게이트의 ingress는 하나로 주는 것이 아니라 0이다** `[실측+정황]`. 이것이 조사의
  전제 3(“`PreToolUse` 2차 ingress가 남는다”)을 무너뜨린다.
  - 1차: Codex에 슬래시 명령 확장이 없다. `user_prompt_submit`은 serde variant 목록에
    실재하나 의미가 **프롬프트 제출**이라 `hooks.json`의 `^mccp:.*` matcher가 성립하지 않는다.
  - 2차: `receipt-skill.js:152`가 `event.tool_name === 'Skill'`을 요구한다. Codex의 skill
    도구는 `ext/skills/src/tools/{list,read}.rs` 계열이고 `Skill`이라는 이름의 도구는 없다.
- **결합 표면은 셋이 아니라 넷 이상이다** `[실측]`. 조사가 "코어는 손댈 것이 거의 없다"고
  판정한 계층 안에서 결합이 나왔다 — 반증 12건 전부가 이 지점을 지목했다.
  `agents/*.md` 58개가 Claude 도구명(`Read`·`Grep`·`Bash`…)과 Claude 모델명
  (haiku 1 · sonnet 45 · opus 12)을 선언 · `cost-estimate.js:9-12` RATE_TABLE이 그 셋만 앎 ·
  `session-identity.js:53-58`에 `CODEX_SESSION_ID` 부재 · `hooks/bootstrap.js`가 `~/.claude/`만
  탐색 · `evidence-lock.js:76-80`이 `CLAUDE_PID`를 읽음 · `codex-invoke.js`의 레지스트리 경로 고정.
- **명령 6/22 자동 변환 재확인, 규칙은 여전히 미상** `[실측]`. 크기가 원인이 **아니다** —
  미변환 `prp-commit`(3153B)이 변환된 `review-pr`(3474B)·`receipt-write`(3704B)보다 작다.
  frontmatter 키·행수로도 갈리지 않는다. 규칙은 Codex 비공개 소스(`command_migration/render.rs`)에
  있다. 변환된 SKILL.md는 `${CLAUDE_PLUGIN_ROOT}`를 치환하지 않고 그대로 싣는다(6파일 15건).
  게이트 파이프라인 핵심 6개(`plan`·`prp-implement`·`pr`·`work`·`plan-prd`·`code-review`)가
  전부 미변환 쪽이다.
- **`Stop` 모순은 해소되지 않았다** `[정황]`. 런타임 경로는 실재한다
  (`Stop hook exited with code 2…`, `invalid stop hook JSON output`). 그러나 설정 enum
  `HookEventsToml`은 CamelCase 10종·snake_case 11종 **어느 표기에도 `stop`을 갖지 않는다.**
  즉 엔진에는 있고 `config.toml`로 바인딩 가능한지가 미지수다. 재측정 에이전트가 "지원된다"고
  단정했으나 그것은 과대 판독이며, 이 PRD는 채택하지 않는다.
- **Codex가 호스트이면 dual-review가 단일 모델 자기검토로 붕괴한다** `[실측]`. 세 게이트
  (`mccp-plan-codex`·`mccp-implement-codex`·`mccp-pr-codex`)가 전부 Codex 리뷰어를 부르므로,
  Codex가 작성까지 하면 교차성이 0이 된다. `santa-loop.md`의 Reviewer A(Claude Agent)도 같이
  사라진다. CLAUDE.md §1.2가 "mccp의 차별점"이라 선언한 축이 그대로 소멸한다.
- **receipt chain의 핵심 식별자는 이미 하네스 중립이다** `[실측]`. `deriveDecisionId`
  (`decision.js:199-280`)·`receiptHash`(`hash.js:200-210`)·`normalizeReceiptCwd`
  (`write.js:117-135`)에 하네스 의존이 없다. **그러나 어느 하네스가 그 receipt를 만들었는지
  기록하는 필드가 0개다**(스켈레톤 72키에 `harness`/`produced_by` 없음). completion-ledger는
  `<decision_id>__<receipt_hash[0:12]>`로만 키가 잡혀 하네스 구분이 없다.

## Users

- **Primary**: skypark207 — 단일 운영자. Claude 한도에 도달했을 때 진행 중인 decision을 버리지
  않고 이어가야 하고, 두 모델 계열의 구동 결과 차이를 관측하려 한다. dogfood가 1급이다.
- **Not for**: 이번 사이클의 marketplace 공개 사용자. 설계가 타 사용자를 **막지는 않아야**
  하지만 설치 UX·문서·채널은 이 PRD의 판정 대상이 아니다.

## Hypothesis

We believe **Codex CLI 하네스에서 mccp 게이트가 실제로 발화하는 것**이
**한도 도달 시 작업이 멈추는 문제**를 해소하고 **모델 계열이 다른 두 운용 경로**를 열 것이다.
We'll know we're right when **Codex 단독으로 한 decision이 plan → implement → pr을 완주하고,
그 receipt chain이 Claude Code가 만든 것과 동일한 검증을 통과하며, 그 과정에서 게이트가
최소 1회 실제로 차단한 기록이 남을 때** — 세 조건이 모두 성립할 때만이다.

**이 가설이 주장하지 않는 것**: MVP는 동기를 **직접** 검증하지 않는다. 운영자가 고른 MVP는
"Codex 단독 완주"이고 동기는 "하네스 교차 이어달리기"다. 전자는 후자의 **전제**이지 후자가
아니다. 교차 이어달리기의 실증은 명시 이연이며 그 사실을 여기 적어 둔다.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| Codex 단독 체인 완주 | 1 decision | `mccp-plan-codex`·`mccp-implement-codex`·`mccp-pr-codex` receipt 3건 + `evidence-audit --json`이 `state≠blind` |
| 게이트 실차단 실증 | ≥1회 | ~~선행 receipt 부재 상태에서 Codex 게이트가 **비영점 종료**하고 진행을 막은 로그~~ → **정정(2026-09-09 M2 실측)**: 전제가 틀렸다. Codex가 존중하는 형식은 stdout `{"decision":"block"}` + **exit 0**이고, `exit 2 + stderr`도 차단하지만 채택하지 않았다(전자가 `receipt-prompt.js`가 이미 내는 형식이라 코어에 두 번째 직렬화기가 필요 없다). 따라서 판정 기준은 종료 코드가 아니라 **보호 대상 연산의 미발생**이다 — 프롬프트가 모델에 도달하지 못했음을 음성 대조와 짝지어 관측한다. 달성: `runs[id=gate-block-live].pair_ok=true` |
| 리뷰어 교차성 보존 | 3/3 게이트 | 각 receipt의 리뷰어 모델 계열이 호스트 계열과 다름 |
| 하네스 결합 지점 열거 완전성 | 미열거 잔여 0 | 결합 지점 전수 목록과 각 처분(수정·additive·이연)이 대조 가능 |
| 원복 무결성 | diff 0 | ~~측정 전후 `~/.codex/config.toml` sha256 일치 + 잔여 캐시 0~~ → **정정(2026-09-09)**: mccp 귀속 키 부재 + 캐시 엔트리 전후 동일. whole-file sha256은 informational. 프로브가 한 줄도 안 남으면 이 축은 `unmeasured`이지 통과가 아니다 |

## Scope

**MVP** — Codex CLI 단독으로 한 decision이 plan → implement → pr을 완주하고, 그 과정에서
게이트가 최소 1회 실제로 차단하며, 리뷰어는 Claude 계열이다.

### 이 PRD가 못박는 결정 5건

| # | 결정 | 근거 |
|---|---|---|
| 1 | **`.claude-plugin/`을 옮기지 않는다. 추가만 한다.** | Codex가 `.claude-plugin/`을 읽는 것이 실측됐다. 옮기면 Claude Code 쪽이 죽는다. 3중 fallback은 `.codex-plugin/`을 **우선**하므로 추가는 additive다 |
| 2 | **fork하지 않는다. 단, 근거를 교체한다.** | 조사의 근거("fork하면 receipt chain이 쪼개져 §3.12가 무너진다")는 반증됐다 — receipt는 대상 저장소에 살지 plugin 트리에 살지 않는다. 유지되는 근거는 **코어 식별자가 실제로 중립임이 측정됐고**, 넷째 표면도 additive로 닫히기 때문이다 |
| 3 | **Codex가 호스트일 때 리뷰어는 Claude 계열이다.** | 단일 모델 자기검토를 허용하면 세 게이트가 의례가 된다. 교차성 소멸은 §1.2 차별점의 소멸이다 |
| 4 | **브랜치는 `plugin.json` version을 선언하지 않는다.** | §3.7 우산 결정 1. 이 축도 예외가 아니다 |
| 5 | **`Codex reviewer`와 `Codex host`를 문서·코드·receipt에서 분리한다.** | 섞이면 §3.3 fail-closed matrix를 읽는 사람이 두 축을 같은 것으로 오해한다 |

### Out of scope

- **command 본문 감량(C8)** — 우산의 자식이고 착수 금지 상태다. **그리고 얹어도 문제가 풀리지
  않는다**: 변환 규칙은 크기가 아님이 측정됐고, C8이 소유한 파일은 `plan.md` 하나뿐이라
  미변환 16개 중 15개를 덮지 못한다. 조사의 "가장 값싼 결합" 판정은 여기서 철회한다.
- **채널 분리(하네스별 `release` 브랜치)** — Codex가 `ref: release`를 그대로 존중했으므로
  단일 채널로 시작한다. 분리 압력이 실제로 관측되면 그때 판정한다.
- **타 사용자 설치 UX** — `/mccp:setup`의 Codex 분기, 설치 문서, marketplace 공개.
- **impeccable 탐지 재정렬(§3.17)** — 디자인 축이고 게이트 강제와 무관하다.
- **하네스 교차 이어달리기** — Claude에서 plan → Codex에서 implement. 동기 그 자체이지만
  MVP가 아니다. Milestone 5가 전제를 놓고, 실증은 후속 PRD가 소유한다.
- **비용·모델 테이블의 Codex 확장** — `cost-estimate.js` RATE_TABLE 등. 결합 지점으로
  **열거는 하되**(Metric 4) 이번 MVP의 완주를 막지 않으면 이연한다.

## Delivery Milestones

<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | harness-truth | Codex에서 mccp hook이 **실제로 발화하는 것**을 본다. `Stop` 바인딩 가능 여부 · `hooks.json` 자동 발견 · hook trust 승인 절차 · hook 자식 프로세스의 env(플러그인 루트·세션 id)가 측정으로 닫힌다. 구현이 아니라 관측이며, 이 값이 나오기 전에는 아래 넷의 범위를 확정하지 않는다 | complete | [codex-harness-portability-m1](../plans/codex-harness-portability-m1.plan.md) |
| 2 | gate-ingress | receipt 게이트가 Codex에서 최소 하나의 ingress로 발화하고, 선행 receipt가 없을 때 **실제로 차단한다**. 조사의 "ingress가 하나로 준다"가 아니라 "0에서 1로 올린다" | complete | [codex-harness-portability-m2](../plans/codex-harness-portability-m2.plan.md) |
| 3 | command-reach | 게이트 파이프라인 핵심 명령이 Codex에서 호출 가능해진다 — Codex의 비공개 변환 규칙에 **의존하지 않는 경로**로 | complete | [codex-harness-portability-m3](../plans/codex-harness-portability-m3.plan.md) |
| 3.5 | codex-ship (hotfix) | Codex 하네스에서 mccp가 **설치되고 발화하는 상태**가 운영자 한 번의 명령으로 성립한다 — 비대화형 trust 승인을 프로브에서 제품 표면으로 승격하고, 그 산출물이 `release` 채널에 도달한다. 관측이 아니라 **배포**이며, 이 저장소의 첫 릴리스 컷을 동반한다 | in-progress | [codex-harness-portability-m3_5](../plans/codex-harness-portability-m3_5.plan.md) |
| 4 | reviewer-inversion | Codex 호스트에서 리뷰어가 Claude 계열이 되어 세 게이트의 cross-model 불변식이 보존된다. 리뷰어를 부를 수 없으면 게이트는 통과가 아니라 **fail-closed** | pending | — |
| 5 | chain-parity | Codex가 만든 receipt chain이 Claude가 만든 것과 동일한 검증을 통과하고, **어느 하네스가 만들었는지 감사로 판별 가능**해진다 | pending | — |

> **M1 종료 (2026-09-09).** 7축 **전부** `measured`이고 `report.js`의 `milestone_closeable`이
> `ok:true`를 낸다. 판정은 [docs/codex-harness-portability/m1-harness-truth.md](../../docs/codex-harness-portability/m1-harness-truth.md),
> 원자료는 [.claude/_meta/data/2026-09-09-codex-harness-truth.json](../_meta/data/2026-09-09-codex-harness-truth.json)에 있다.
>
> ~~닫지 않은 이유는 **A1(hook 발화)이 `unmeasured`**이기 때문이다 — 발화는 6건 관측됐으나 전부
> `--dangerously-bypass-hook-trust` 하였고, 비대화형 trust 승인 경로는 발견되지 않았다.~~
> **같은 날 그 경로를 찾아 A1을 닫았다.** 승인 기록은 `config.toml`의
> `[hooks.state."<key>"] { enabled, trusted_hash }`이고, `<key>`와 기대 hash는 app-server의
> `hooks/list`가 준다. 그 승인을 프로브에 배선해 **bypass 플래그 없이** 6종 10건을 발화시켰다.
> 음성 대조(hash 1바이트 오류 → `trustStatus=modified` → 발화 0)가 이 경로의 실재를 고정한다.
> 낡은 문장을 지우지 않는 이유는 §3.7과 같다 — 무엇이 왜 달라졌는지가 함께 남아야 한다.
>
> 그 재측정이 M1의 원래 판정 규칙을 완화한 것이 **아님**을 밝힌다. `report.js`의 승격 규칙
> (`trust_mode==='trusted'` 줄만 A1을 승격)은 **한 글자도 바뀌지 않았고**, 바뀐 것은 그 규칙을
> 만족하는 실행이 실재하게 됐다는 사실뿐이다.

> **M3.5를 여는 사유 (2026-09-10) — 예산이 정한 순서 변경.**
>
> M3까지 착지한 시점에 **M4·M5를 이 하네스에서 완주할 Claude 예산이 남지 않았다.** 그래서
> 운영자가 남은 두 축을 **Codex 하네스에서 이어가기로** 결정했다. 그 결정이 이 PRD의 순서를
> 바꾼다 — 원래 M4·M5는 Codex 도달을 **전제로** 하는 축이었는데, 이제 그 전제 자체가 다음에
> 해야 할 일이 된다.
>
> **이것은 Problem이 말한 실패 모드의 실물이다.** "한도에 도달하면 작업이 그 자리에서 멈춘다"가
> 이 PRD 자신에게 일어났다. M3.5는 그 자리에서 하네스를 바꿔 이어가기 위한 최소 수정이고,
> 그래서 새 축이 아니라 **hotfix**다.
>
> **왜 배포가 범위 안인가.** M1~M3의 산출물(`run-command` skill · `command-reach.js` ·
> M2 ingress)은 이 저장소에만 있고 Codex에는 도달할 경로가 없다. `marketplace.json`의
> plugin `source`가 `ref: release`이므로(§3.7 release-channel-separation M1) `codex plugin add`가
> 여는 본문은 `release` 브랜치의 것이고, 그 브랜치는 이 작업들을 모른다. 실측(2026-09-10):
> `~/.codex/plugins/cache/mccp/`는 **빈 디렉토리**이고 `~/.codex/config.toml`에 mccp hook
> trust 기록이 **0건**이다. 즉 도구를 아무리 잘 만들어도 배포하지 않으면 Codex 쪽에서는
> 아무 일도 일어나지 않는다. **배포가 이 milestone의 acceptance에 포함되는 이유가 그것이다.**
>
> **컷 시점은 PR 머지 뒤다.** 릴리스 컷은 `origin/main`을 `release`로 fast-forward하는
> 행위이므로([docs/release-channel.md](../../docs/release-channel.md) §2.1) 이 브랜치가 main에
> 머지되기 전에는 선행조건이 성립하지 않는다. 순서는 고정이다 — 구현 → PR → main 머지 →
> 컷. 브랜치는 여전히 번호를 선언하지 않으며(결정 4 · §3.7 우산 결정 1) 번호는 컷이 정한다.
> 그 컷이 이 저장소의 **첫 컷**이라 `docs/release-channel.md` §2의 라벨이 `미측정`에서
> 바뀌는 시점이기도 하다.
>
> **M3.5가 주장하지 않는 것.** 리뷰어 교차성(M4)도 chain 동등성(M5)도 열지 않는다. 명령
> 본문이 Codex에서 **실행 가능**하다고도 주장하지 않는다 — M3가 이미 그 경계를 그었고
> (`Task`·`Workflow`·`AskUserQuestion` 도구 어휘 부재, 결합 열거 `agent-tool-declaration`),
> M3.5는 그 경계를 옮기지 않는다. 여는 것은 **설치와 발화**뿐이다.

## Open Questions

- [ ] **변환 규칙이 비공개인데, 그것에 의존하지 않고 핵심 명령을 Codex에 도달시킬 수 있는가.**
      Milestone 3의 착수 조건이자 MVP 전체의 최대 미지수다. 규칙 역추적은 값이 비싸고
      Codex 버전마다 깨질 수 있으므로 의존하지 않는 경로가 있는지를 먼저 묻는다.
- [x] **`Stop`을 `config.toml`로 바인딩할 수 있는가.** ~~런타임 경로는 있고 설정 enum에는 없다.~~
      **닫힘(2026-09-09 실측).** `Stop`은 `HooksToml`의 실재하는 필드이고 `codex exec` 한 턴에서
      **실제로 발화했다**(`SessionStart → UserPromptSubmit → PreToolUse → PostToolUse → Stop → SessionEnd`).
      따라서 stop-loop · auto-handoff · STATE.md 갱신 7건의 처분을 다시 정할 필요가 **없다**.
      낡은 문장("설정 enum에는 없다")은 바이너리 문자열 `[정황]`에 기댄 것이었고 실행이 그것을 뒤집었다.
- [x] **hook은 어떻게 trusted가 되는가.** `HookStateToml{enabled, trusted_hash}` +
      `--dangerously-bypass-hook-trust`가 있다. 승인 절차가 수동이면 Milestone 2의 실증
      비용과 후속 운영 비용이 함께 오른다.
      ~~**절반 닫힘(2026-09-09 실측).**~~ **닫힘(2026-09-09 재측정).** trust가 관문임은 확인됐다 —
      미승인 상태에서 `codex exec`는 **exit 0으로 정상 종료하고 오류도 경고도 없이 발화가 0**이며,
      `codex plugin add`도 trust 기록을 쓰지 않는다. ~~비대화형 승인 경로는 발견되지 않았다.~~
      **비대화형 경로는 실재한다**: `config.toml`에 `[hooks.state."<key>"] { enabled = true,
      trusted_hash = "<currentHash>" }`를 쓰면 된다. `<key>`·`currentHash`·`trustStatus`
      (`managed|untrusted|trusted|modified`)는 app-server의 `hooks/list`가 준다. `-c` dotted-path
      override로는 **안 된다** — key가 경로를 담아 점을 포함하므로 파서가 쪼갠다.
      승인 비용이 수동이 아니므로 Milestone 2의 실증 비용과 후속 운영 비용은 **오르지 않는다**.
- [ ] **Codex 안에서 Claude 계열 리뷰어를 부르는 경로가 실재하는가.** 결정 3이 요구하지만
      기존 `codex-invoke.js`는 방향이 반대라 재사용이 아니다. 부를 수 없으면 결정 3은
      "게이트가 항상 fail-closed"를 뜻하게 되고 MVP가 성립하지 않는다.
- [ ] **하네스 출처 필드를 receipt에 넣는 것이 §3.12 hash 안정성과 충돌하는가.**
      present-only + `makeSkeleton` 미포함이 선례이나(§3.13), tracked ship corpus에
      새 필드를 더하는 판단은 Milestone 5가 소유한다.
- [ ] **공개 스펙(`agent-plugins.org/schemas/1.0.0/`)이 hook wire 계약을 1차 자료로 확증하는가.**
      본 PRD의 hook 이벤트·wire 필드·핸들러 종류는 바이너리 문자열 `[정황]`에 의존한다.
      공개 스펙이 실재하면 값싸게 교차검증되고, Codex 버전 상승에 대한 내성도 함께 오른다.
      조사의 Prior Art가 "가장 값싼 다음 한 걸음"으로 지목한 항목이며 아직 열지 않았다.
      **사거리 축소(2026-09-09).** hook 이벤트 enum과 payload 필드는 M1이 **실행으로** 직접 쟀으므로
      더는 `[정황]`이 아니다(config struct 필드 10종 · 실제 발화 6종 · payload 키 집합).
      공개 스펙의 남은 값은 교차검증과 버전 내성이지 1차 확증이 아니다.
- [x] **Codex가 hook의 차단을 존중하는가, 어떤 형식으로.** ~~M1은 재지 않았고 바이너리 문자열
      `[정황]`뿐이었다.~~ **닫힘(2026-09-09 M2 실측).** `UserPromptSubmit`에서 음성 대조가
      성립한 상태로 `stdout {"decision":"block"} + exit 0`과 `exit 2 + stderr`가 **둘 다
      차단**했고, `hookSpecificOutput.permissionDecision=deny`는 **존중되지 않았다**.
      `PreToolUse`는 ALLOW 통제가 성립하지 않아 미측정으로 남는다.
      상세: [m2-gate-ingress.md](../../docs/codex-harness-portability/m2-gate-ingress.md)
- [ ] **`hooks.json`의 `${CLAUDE_PLUGIN_ROOT}`가 Codex에서 문자열 치환되는가.** M2가
      **열지 못한 축**이고(B3 `unmeasured`) **M3도 열지 못했다**(C2 `unmeasured`).
      `gate-demo`는 절대경로로 hook을 등록해 우회했고, `bootstrap.js#resolveRoot()`의
      `__dirname` 폴백이 그 값과 무관하게 성립하므로 배선은 이 측정에 의존하지 않는다.
      그러나 **출하되는 `hooks.json`은 여전히 그 변수를 쓰므로**, 치환되지 않으면 Codex
      사용자의 hook은 시작조차 못 한다.
      M3는 네 번 쟀고 **네 번 다 음성 대조가 성립하지 않았다** — 틀린 표면(`config.toml`) ·
      디렉토리 사본 · `.codex-plugin` 합성 · **공식 설치**(`install_ok=true`)까지 갔는데도
      절대경로 통제조차 발화하지 않았다. 통제 없는 미발화는 치환 실패와 hook 배선 실패를
      구분하지 못하므로 축은 `unmeasured`로 남고, 그래서 M3는 `hooks.json`을 **바꾸지
      않았다**(미측정 축 위의 편집은 DD4가 금지한 반올림이다).
      다음에 열 사람이 먼저 볼 것: plugin `hooks.json` 경로의 hook이 `codex exec`
      비대화형에서 애초에 발화하는가(M1 `plugin-autodiscovery`는 `SessionStart`·`Stop`
      발화를 봤으나 그 실행의 모드가 이 프로브와 같은지 확인되지 않았다).
      상세: [m3-command-reach.md](../../docs/codex-harness-portability/m3-command-reach.md)
- [ ] **Claude Code의 `UserPromptSubmit` payload 형태는 무엇인가.** 재지 않았다. 그래서 M2의
      payload 판별자는 한 방향(codex 지목을 내리는 쪽)으로만 작동한다. 재면 판별자를 env
      의존에서 더 떼어낼 수 있다.
- [ ] **교차 이어달리기를 언제 측정하는가.** MVP가 동기를 직접 검증하지 않는다는 사실은
      기록됐다. 미룬 것을 잊지 않기 위한 항목이다.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 변환 규칙이 비공개라 핵심 명령이 Codex에 도달하지 못한다 | 높음 | **최고** — MVP 불성립 | Milestone 1·3을 규칙 역추적이 아니라 **규칙 비의존 경로**로 설계. Milestone 3의 acceptance를 "6/22가 개선됐다"가 아니라 "핵심 명령이 호출된다"로 잡는다 |
| `Stop` 바인딩 불가로 stop-loop·auto-handoff·STATE.md 갱신이 조용히 사라진다 | 중 | 높음 | Milestone 1이 이 값을 **먼저** 닫는다. 불가로 판명되면 7건의 처분을 명시 결정하고, 조용한 소실은 허용하지 않는다 |
| 게이트가 설치되나 발화하지 않아 "껍데기"가 된다 | 중 | **최고** — §3.1 위반 | Metric 2를 "게이트가 실제로 **차단**한 기록"으로 잡는다. 통과 관측만으로는 충족되지 않는다 |
| 리뷰어를 부르지 못해 세 게이트가 단일 모델 자기검토로 붕괴 | 중 | 높음 | 결정 3 + Milestone 4. 부를 수 없을 때의 기본값은 통과가 아니라 fail-closed |
| 넷째 표면 열거가 또 불완전하다 — 조사가 셋이라 했는데 넷이었다 | 높음 | 중 | Metric 4를 "미열거 잔여 0"으로 잡고, 열거를 사람의 성실성이 아니라 대조 가능한 목록으로 남긴다 |
| 두 하네스 동시 실행 시 lock 경합·ledger 충돌 | 낮음 | 중 | 측정됐고(evidence-lock·pr-phase-lock의 host-aware tri-state, ledger 파일명 무구분) Milestone 5가 소유. MVP는 단독 실행이라 이번 완주는 막지 않는다 |
| Codex 버전이 오르며 hook/skill/migration 표면이 바뀐다 | 중 | 중 | 모든 측정에 CLI 버전을 함께 기록한다(현재 0.153.4). 버전 없는 측정치는 인용하지 않는다 |

## References

- [.claude/_meta/2026-09-09-codex-harness-portability.md](../_meta/2026-09-09-codex-harness-portability.md) — 근거 조사.
  본 PRD가 **철회한 판정 넷**: 결합 3표면 · fork 금지의 근거 · hook 우선 순서의 근거 · C8 결합 권고.
- 2026-09-09 재측정 워크플로 `wf_aed0bebf-1a6` — 측정 7축(CLI 표면 · hook 이벤트 · env 주입 ·
  명령 변환 · 넷째 표면 · 모델 이식성 · chain 연속성) + 반증 12건(4주장 × 3렌즈: Codex 교차모델 ·
  fable 독립 · 회의론자), 전부 `refuted / high`. 원자료는 세션 subagent journal.
- [.claude/_meta/2026-08-22-impeccable-plugin-channel-migration.md](../_meta/2026-08-22-impeccable-plugin-channel-migration.md) —
  배포 채널 변화가 탐지·setup·게이트에 만드는 결함의 선례. 형태가 같다.
- [.claude/prds/harness-wiring-integrity.prd.md](harness-wiring-integrity.prd.md) — 우산.
  이 PRD는 그 자식이 **아니지만** §3.7 결정 1은 그대로 적용된다.
- CLAUDE.md §1.2(dual-review) · §3.1(게이트 우회 금지) · §3.3(fail-closed matrix) ·
  §3.12(증거 내구성) · §3.17(탐지 계약) · §3.18(세션 식별)

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-09-09.*
