# mccp plugin을 Codex CLI 하네스에서도 사용하기 위한 수정 범위 사전 조사

**Status**: active
**Date**: 2026-09-09
**Topic**: mccp plugin을 Codex CLI 하네스에서도 사용하기 위한 수정 범위 사전 조사

> 아래 실측 transcript의 홈 경로는 `~`로 접었다. 계정명은 증거값을 갖지 않고, 그것을
> git 이력에 남기는 것은 되돌릴 수 없다(§3.12가 `meta.cwd`로 이미 한 번 갚은 축).
> 검증: `node scripts/codex-probe/redact-gate.js --check <이 파일>`.

## Premises

| # | 참조 | 시점 | 무엇을 전제하는가 |
|---|---|---|---|
| 1 | `plugins/mccp/hooks/hooks.json` | 93c2ebd | hook entry 29건이 Claude Code 이벤트 8종에 걸려 있고 분포가 `Stop` 7 · `PreToolUse` 9 · `PostToolUse` 6 · `SessionStart` 2 · `PostToolUseFailure` 2 · `UserPromptExpansion` 1 · `PreCompact` 1 · `SessionEnd` 1 이다 |
| 2 | `plugins/mccp/scripts/hooks/receipt-prompt.js` | 93c2ebd | receipt 게이트의 1차 ingress가 `UserPromptExpansion`이며 `^mccp:.*` matcher로 **슬래시 명령 확장 시점**에 발화한다 |
| 3 | `plugins/mccp/scripts/hooks/receipt-skill.js` | 93c2ebd | 같은 게이트에 `PreToolUse`/`Skill` 2차 ingress가 이미 존재해, 슬래시 표면이 없어도 도달 경로가 하나 남는다 |
| 4 | `plugins/mccp/.claude-plugin/plugin.json` | 93c2ebd | manifest가 `name`/`version`/`description`/`author`/`license`만 선언하고 컴포넌트 경로 키(`skills`·`commands`·`hooks`)를 갖지 않는다 — 발견을 디렉토리 관례에 의존한다 |
| 5 | `.claude-plugin/marketplace.json` | 93c2ebd | 배포원이 `git-subdir` + `ref: release` 단일 항목이다 |
| 6 | `plugins/mccp/scripts/derive/index.js` | 93c2ebd | derive 계층 23파일의 `CLAUDE_*` 참조가 0건이다 — 관측 코어가 이미 하네스 중립이다 |
| 7 | `plugins/mccp/scripts/lib/session-identity.js` | 93c2ebd | 세션 id 해소 체인이 `MCCP_SESSION_ID` → `CLAUDE_CODE_SESSION_ID` → `CLAUDE_SESSION_ID` 3단이고 Codex 쪽 이름이 없다 |
| 8 | `plugins/mccp/scripts/hooks/bootstrap.js` | 93c2ebd | hook 진입점이 `CLAUDE_PLUGIN_ROOT`로 plugin root를 잡되 파일 위치 상대 경로 fallback을 갖는다 |
| 9 | `plugins/mccp/commands/plan.md` | 93c2ebd | 단일 명령 본문이 187KB(3083행)이며, 명령군 전체가 실행 로직을 산문으로 싣는다 |
| 10 | `plugins/mccp/scripts/lib/codex-invoke.js` | 93c2ebd | 기존 Codex 결합은 **반대 방향**이다 — Claude가 Codex를 리뷰어로 spawn하며, Codex가 mccp를 호스팅하는 경로는 없다 |
| 11 | `docs/release-channel.md` | 93c2ebd | 사용자가 여는 본문은 `main`이 아니라 `release` 브랜치다 — 하네스가 늘면 채널 축도 함께 늘어난다 |

## Evidence

### 0. 이 조사가 실제로 무엇을 했는가

정적 독해만으로 판정하지 않았다. **Codex CLI 0.153.4에 mccp를 실제로 설치하고 모델에게
보이는 프롬프트를 덤프한 뒤 원복**했다. 아래 A/B/C는 그 실측이고, D는 바이너리 문자열
추출(간접 근거), E는 저장소 정량이다. 셋의 신뢰도가 다르므로 표시를 붙인다.

- **[실측]** 이 세션에서 명령을 돌리고 출력을 본 것
- **[정황]** Codex 바이너리(`~/.codex/packages/standalone/releases/0.153.4-x86_64-unknown-linux-musl/bin/codex`)의 문자열에서 읽은 것. 저장소 밖이라 Premises에 넣지 않았다
- **[미측정]** 아직 확인하지 않은 것

### A. 배포·설치 표면은 이미 호환된다 — [실측]

Codex CLI는 plugin manifest를 **3중 fallback**으로 찾는다 — `.codex-plugin/plugin.json`
→ `.claude-plugin/plugin.json` → `.cursor-plugin/plugin.json`. marketplace도 같다
(`.claude-plugin/marketplace.json`이 지원 목록에 포함). 공통 스키마는
`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`으로, 세 하네스가 공유하는
표준이 존재한다 [정황].

이 저장소를 **고치지 않고** 그대로 등록·설치했다:

```
$ codex plugin marketplace add ~/work/mccp
Added marketplace `mccp` from ~/work/mccp.

$ codex plugin list
Marketplace `mccp`
~/work/mccp/.claude-plugin/marketplace.json
PLUGIN     STATUS         VERSION  SOURCE
mccp@mccp  not installed           https://github.com/idenn207/mccp.git, path `plugins/mccp`, ref `release`

$ codex plugin add mccp@mccp
Added plugin `mccp` from marketplace `mccp`.
Installed plugin root: ~/.codex/plugins/cache/mccp/mccp/1.33.6
```

즉 전제 4·5가 기술하는 manifest는 **수정 대상이 아니다.** 설치 후 config.toml에는
`[marketplaces.mccp]` + `[plugins."mccp@mccp"] enabled = true` 두 블록만 추가됐고,
조사 종료 후 `codex plugin remove` + `marketplace remove`로 원복해 백업과 diff 0을
확인했다.

### B. skills는 그대로 로드되고, commands는 6/22만 자동 변환된다 — [실측]

`codex debug prompt-input`으로 모델이 실제로 보는 developer 메시지를 덤프했다. skill
root가 셋 잡혔다:

```
- `r0` = ~/.codex/skills/.system
- `r1` = ~/.codex/plugins/cache/mccp/mccp/1.33.6/.codex-plugin/migrated-command-skills
- `r2` = ~/.codex/plugins/cache/mccp/mccp/1.33.6/skills
```

`r2`(skills 47개)는 `mccp:` 접두로 그대로 등재됐다. `r1`은 Codex가 **설치 시점에 자동
생성한 디렉토리**로, `commands/*.md`를 `source-command-<name>/SKILL.md`로 변환해 넣는다
(`core-plugins/src/command_migration/render.rs` [정황]). 변환된 본문은 원본 명령을
`## Command Template` 아래에 그대로 싣고 `${CLAUDE_PLUGIN_ROOT}`도 **치환하지 않고
남긴다.**

문제는 변환율이다. 22개 중 **6개만** 변환됐다:

| 변환됨 | 크기 | 변환 안 됨(일부) | 크기 |
|---|---|---|---|
| `dashboard-refresh` | 1.2KB | `prp-commit` | 3.1KB |
| `receipt-status` | 1.7KB | `prp-pr` | 4.0KB |
| `receipt-validate` | 1.8KB | `meta-research` | 7.4KB |
| `trace` | 2.9KB | `work` | 64KB |
| `review-pr` | 3.5KB | `pr` | 95KB |
| `receipt-write` | 3.7KB | `plan` | 187KB |

**크기 단조가 아니다** — 미변환 최소(`prp-commit` 3.1KB)가 변환된 둘(3.5KB·3.7KB)보다
작다. frontmatter 키 조합으로도 갈리지 않는다(`dashboard-refresh`는 변환, 같은 키셋의
`archive-complete`는 미변환). 즉 **규칙을 아직 모른다**(→ Open Questions 1).

게이트 파이프라인의 핵심 6개(`plan` · `prp-implement` · `pr` · `work` · `plan-prd` ·
`code-review`)가 전부 미변환 쪽이다. 전제 9의 본문 비대화가 여기서 비용으로 돌아온다.

### C. hook은 지원되고 프로토콜도 같다 — [실측 + 정황]

`codex features list`에서 `hooks  stable  true` [실측]. 그리고 hook wire protocol이
Claude Code와 **사실상 동일**하다 [정황] — 바이너리에서 관측된 필드:

```
hookEventName · hookSpecificOutput · permissionDecision · permissionDecisionReason
additionalContext · systemMessage · suppressOutput · stopReason · reason
continue · decision · matcher
```

차단 규약도 같다: `PreToolUse hook exited with code 2 but did not write a blocking
reason to stderr`. handler 종류는 `Command`(command · commandWindows · timeout · async ·
statusMessage · additionalContextLimit) · `McpTool` · `Prompt` · `agent` 넷.

**그러나 이벤트 집합이 다르다.** config enum(`HookEventsToml`)에서 관측된 리터럴은:

```
PreToolUse · PermissionRequest · PostToolUse · PreCompact · PostCompact
SessionStart · SessionEnd · SubagentStart · SubagentStop · Interrupt
```

전제 1의 mccp 29개 entry를 이 집합에 대조하면:

| mccp 이벤트 | entry 수 | Codex 대응 | 처분 |
|---|---|---|---|
| `PreToolUse` | 9 | `PreToolUse` | 그대로 |
| `PostToolUse` | 6 | `PostToolUse` | 그대로 |
| `SessionStart` | 2 | `SessionStart` | 그대로 |
| `PreCompact` | 1 | `PreCompact` | 그대로 |
| `SessionEnd` | 1 | `SessionEnd` | 그대로 |
| `Stop` | **7** | enum 나열에 **없음** | 재배선 |
| `PostToolUseFailure` | 2 | **없음** | 재배선 |
| `UserPromptExpansion` | 1 | **없음** | 구조적 부재 |

19/29는 이름조차 같아 그대로 옮겨진다. 남는 10건이 수정 대상이고, 성격이 셋 다 다르다.

- **`Stop` 7건** — 소스 파일 `hooks/src/events/stop.rs`는 존재하고 `stopReason` 필드도
  있는데 config enum 나열에는 `SubagentStop`만 보인다. 지원 여부가 **모순 상태**라
  실행으로 확정해야 한다(→ Open Questions 2). mccp의 stop-loop · auto-handoff ·
  STATE.md 갱신이 전부 여기 달려 있어 축의 무게가 가장 크다.
- **`PostToolUseFailure` 2건** — Codex에는 성공/실패 구분 이벤트가 없다. `PostToolUse`
  안에서 실패를 판별하는 재배선이면 족하다(난이도 낮음).
- **`UserPromptExpansion` 1건** — Codex에 **슬래시 명령 확장이라는 개념 자체가 없다.**
  skill은 `$skill-name`으로 호출된다. 이 1건이 전제 2의 receipt 게이트 1차 ingress라
  entry 수와 중요도가 반비례한다. 다만 전제 3대로 `PreToolUse` 2차 ingress가 이미
  있으므로 **게이트가 소멸하는 것이 아니라 ingress가 하나로 준다.**

hook 신뢰 모델은 다르다 [정황] — Codex는 `HookStateToml { enabled, trusted_hash }`로
hook 소스를 해시로 신뢰해야 발화하며 `--dangerously-bypass-hook-trust`가 그 우회다.
Claude Code에는 이 층이 없다. 또 plugin이 hook을 실을 수 있다는 신호는 있으나
(`RemotePluginCapabilities { has_hooks, has_skills }`), mccp의 `hooks/hooks.json`이
설치만으로 발견되는지는 확인하지 못했다(→ Open Questions 3).

### D. 명령 본문의 도구 어휘 — [실측]

명령·에이전트 본문이 부르는 Claude Code 전용 표면:

```
Task tool        8   (subagent_type 7)
AskUserQuestion  8
Workflow tool    2
```

`Skill(` · `SlashCommand` bare 리터럴은 0건이다(§3.17 M3 재배선의 결과). Codex에도
subagent 개념은 있으나(`.codex/agents`, `SubagentStart`/`SubagentStop`, skill 안의
`agents/openai.yaml`) 호출 어휘와 정의 형식이 다르다. `AskUserQuestion`의 Codex 대응은
`request_user_input`으로 보인다 [정황].

### E. 코어는 이미 하네스 중립이다 — [실측]

| 계층 | 파일 수(test 제외) | `CLAUDE_*` 참조 파일 |
|---|---|---|
| `scripts/lib` | 265 | 11 |
| `scripts/receipt` | 17 | 2 |
| `scripts/state` | 15 | 2 |
| `scripts/derive` | 23 | **0** |
| `scripts/hooks` | 53 | (진입점이므로 다수) |

즉 receipt chain · derive · renderer · lock · evidence 같은 **실질 로직은 손댈 것이
거의 없다.** 결합은 세 표면(`commands/` · `hooks/hooks.json` · 명령 본문의 도구 어휘)에
집중돼 있다. `CLAUDE_PLUGIN_ROOT`는 Codex 바이너리에도 `CLAUDE_PLUGIN_DATA`와 나란히
등장하나 [정황], 실제로 hook 자식 프로세스에 주입되는지는 미측정이다(전제 8의 fallback이
있어 최악의 경우에도 치명적이지 않다 → Open Questions 4).

## Prior Art

**미조사.** 외부 문헌(Codex plugin 공식 문서 · agent-plugins.org 스펙 · 타 plugin의
cross-harness 이식 사례)은 이번 조사에서 열지 않았다. 근거는 전부 로컬 실측과 바이너리
문자열이다. `agent-plugins.org/schemas/1.0.0/`가 실재하는 공개 스펙이라면 C절의 이벤트
집합·wire 필드를 **1차 자료로 교차검증**할 수 있고, 그것이 이 조사에서 가장 값싼 다음
한 걸음이다. `/deep-research`로 얻은 결과가 있으면 이 절에 배치하면 된다.

## Precedent

- **`docs/release-channel.md`(전제 11)** — 사용자가 여는 본문은 `release` 브랜치다.
  Codex 지원이 실체가 되면 채널 축이 하나 더 생긴다(같은 `release`를 두 하네스가 읽는가,
  아니면 하네스별로 나누는가). 이 조사는 그 결정을 내리지 않는다. 다만 A절 실측에서
  Codex가 marketplace의 `ref: release`를 **그대로 존중**했으므로, 단일 채널로 시작하는
  선택지가 열려 있다.
- **`.claude/_meta/2026-08-22-impeccable-plugin-channel-migration.md`** — 배포 채널이
  바뀔 때 탐지·setup·게이트에 생기는 결함을 전수 조사한 선례다. 이번 축과 **형태가 같다**
  (외부 하네스의 설치 표면 변화 → mccp 내부 탐지·분기 재정렬). 그 문서가 세운
  "탐지가 지목한 본문과 실제로 열리는 본문이 일치한다"는 계약(CLAUDE.md §3.17 M3)은
  하네스가 둘이 되면 **다시 검사해야 한다** — `impeccable-detect.js`의 소스 열거는
  Claude Code 설치 경로만 안다.
- **`.claude/_meta/2026-08-31-final-harness-assessment-and-umbrella-prd.md`** — 우산 PRD
  `harness-wiring-integrity`로 C0~C10을 분해한 판정. 이번 축은 그 우산의 자식이 아니라
  **새 축**이다(그 우산은 단일 하네스 안의 배선 정합을 다룬다). 다만 §3.7 결정 1(브랜치가
  version을 선언하지 않는다)은 그대로 적용되므로, 이 조사에서 파생될 어떤 작업도
  `plugin.json` version을 건드리지 않는다.
- **전제 10 (`codex-invoke.js`)** — 저장소에 이미 있는 Codex 결합은 **방향이 반대**다.
  기존은 "Claude가 Codex를 리뷰어로 부른다"이고, 이번은 "Codex가 mccp를 호스팅한다"다.
  이름이 겹치므로 PRD를 쓸 때 **용어를 분리**해야 한다 — 전자는 `Codex reviewer`,
  후자는 `Codex host` 또는 `Codex harness`. 섞이면 §3.3의 fail-closed matrix를 읽는
  사람이 두 축을 같은 것으로 오해한다.

## Verdict

**이것은 포팅이 아니라 호환 격차 메꾸기다. 그리고 격차는 세 표면에만 있다.**

A·E절이 함께 보여주는 것: mccp의 실질(코어 265파일, receipt chain, derive, renderer)은
**한 줄도 고칠 필요가 없고**, 배포·설치 표면도 이미 작동한다. 고칠 것은 셋뿐이다.

착수 순서를 이렇게 판정한다 — 앞의 것이 뒤의 것의 **전제**라서 순서가 임의가 아니다.

**1) hook 이벤트 재배선 (10/29건).** 여기가 먼저인 이유는 hook이 mccp의 강제
메커니즘이기 때문이다. 게이트가 발화하지 않는 상태에서 명령을 옮기면 "돌아가는 것처럼
보이지만 아무것도 강제하지 않는" 껍데기가 되고, 그것이 이 저장소가 일관되게 거부해 온
실패 모드다(§3.1). 하위 순서는 값이 싼 것부터: `PostToolUseFailure` 2건(`PostToolUse`
안 판별) → `UserPromptExpansion` 1건(전제 3의 `PreToolUse` ingress로 단일화) →
`Stop` 7건(Open Questions 2가 먼저 닫혀야 착수 가능).

**2) command 표면.** 6/22 자동 변환의 규칙을 먼저 알아야 한다(Open Questions 1).
규칙이 크기·구조 중 무엇이든, 전제 9(본문 187KB)가 원인 쪽이라면 이 축은 이미 저장소에
있는 `command-body-diet` 브랜치와 **같은 목표를 공유한다** — 그렇다면 새 작업을 만들지
말고 그쪽에 Codex 변환율을 acceptance로 얹는 것이 옳다. 이것이 이 조사가 발견한 가장
값싼 결합이다.

**3) 도구 어휘.** `Task`/`Workflow`/`AskUserQuestion` 18곳. 양이 적고 기계적이지만,
1)·2)가 닫히기 전에는 검증할 무대가 없으므로 마지막이다.

**하지 말아야 할 것 둘.** 첫째, `.claude-plugin/`을 `.codex-plugin/`으로 **바꾸지
마라** — A절대로 Codex가 전자를 읽고, 바꾸면 Claude Code 쪽이 죽는다. 둘 다 필요하면
추가하는 것이지 옮기는 것이 아니다. 둘째, **fork하지 마라.** 결합이 세 표면에 국한되고
코어가 중립인 이상 단일 트리로 양 하네스를 지탱할 수 있으며, fork는 receipt chain을
둘로 쪼개 §3.12 증거 내구성 계약을 무너뜨린다.

**이 판정이 주장하지 않는 것.** hook이 Codex에서 실제로 발화하는 것을 보지 못했다.
따라서 "재배선하면 작동한다"가 아니라 **"재배선 없이는 작동할 수 없다"**만 주장한다.
발화 실증은 PRD의 첫 milestone이 지불해야 할 비용이며, 그 전에 이 조사를 근거로
구현 범위를 확정하면 미측정 가정 위에 계획을 세우게 된다.

## Open Questions

1. **command 자동 변환 6/22의 규칙은 무엇인가.** 크기 단조가 아니고 frontmatter 키로도
   갈리지 않는다. `core-plugins/src/command_migration/render.rs`의 동작을 실험으로
   역추적해야 한다(명령 하나를 점진적으로 줄이며 변환 임계를 이분 탐색). Verdict 2)의
   착수 조건이다.
2. **Codex는 `Stop`을 지원하는가.** 소스 파일 `hooks/src/events/stop.rs`와 `stopReason`
   필드는 있으나 config enum 나열에는 `SubagentStop`만 보인다. mccp의 최대 축(7건)이
   여기 달려 있어 **가장 비싼 미지수**다. 실제 hook을 하나 등록해 발화를 관측하면 닫힌다.
3. **plugin의 `hooks/hooks.json`이 설치만으로 발견되는가.** `RemotePluginCapabilities`에
   `has_hooks`가 있으나, 발견 경로가 plugin 디렉토리 관례인지 `config.toml [hooks]`
   수동 등록인지 미확인이다. 후자면 설치 UX에 수동 단계가 생기고 `/mccp:setup`의 범위가
   늘어난다. `trusted_hash` 신뢰 모델도 같은 축이다.
4. **`CLAUDE_PLUGIN_ROOT`가 Codex hook 자식 프로세스에 주입되는가.** 바이너리 문자열에
   `CLAUDE_PLUGIN_DATA`와 나란히 등장하나 정황일 뿐이다. 주입되지 않아도 전제 8의
   파일 위치 상대 fallback이 받으므로 치명적이지 않지만, 변환된 SKILL.md는
   `${CLAUDE_PLUGIN_ROOT}`를 **치환하지 않고 그대로 싣기 때문에**(B절) 명령 표면에서는
   문제가 될 수 있다.
5. **세션 id를 어떻게 잇는가.** 전제 7의 3단 체인에 Codex 이름이 없다. §3.18이 체인을
   단일 함수로 못박아 두었으므로 수정 지점은 한 곳이지만, Codex가 무슨 이름으로 세션을
   노출하는지 실측이 필요하다. hook-trace · evidence lock · observer-sessions가 이 값에
   의존한다.
6. **채널을 나누는가 합치는가.** A절에서 Codex가 `ref: release`를 존중했으므로 단일
   채널로 시작할 수 있으나, 하네스별 호환 격차가 벌어지면 분리 압력이 생긴다. 지금
   결정할 필요는 없고, PRD 작성 시 명시적으로 **이연**하면 된다.

---

## Addendum — 2026-09-09 재측정으로 철회된 판정 4건

이 문서는 `.claude/prds/codex-harness-portability.prd.md`의 근거 corpus다. PRD 작성 과정에서
같은 날 재측정(워크플로 `wf_aed0bebf-1a6` — 측정 7축 + 반증 12건, 4주장 × 3렌즈, 전부
`refuted / high`)을 돌렸고, 위 Verdict의 네 판정이 무너졌다. **본문을 지우지 않는 이유는
무엇이 왜 달라졌는지가 함께 남아야 하기 때문**이다(CLAUDE.md §3.7·§3.17과 같은 형태).
아래가 현행이고, 위 Verdict의 해당 문장은 더는 따르지 마라.

1. **"고칠 것은 세 표면뿐"은 거짓이다 — 넷째 표면이 있다.** E절이 "실질 로직은 손댈 것이
   거의 없다"고 판정한 계층 안에서 결합이 나왔다: `agents/*.md` 58개가 Claude 도구명과
   모델명(haiku 1 · sonnet 45 · opus 12)을 선언 · `cost-estimate.js:9-12` RATE_TABLE ·
   `session-identity.js:53-58`(`CODEX_SESSION_ID` 부재) · `hooks/bootstrap.js`(`~/.claude/`만
   탐색) · `evidence-lock.js:76-80`(`CLAUDE_PID`) · `codex-invoke.js` 레지스트리 경로 고정.
   반증 3렌즈가 독립적으로 같은 지점을 지목했다.

2. **전제 3이 무너졌다 — Codex에서 게이트 ingress는 하나로 주는 것이 아니라 0이다.**
   1차(`UserPromptExpansion`)는 Codex에 슬래시 확장이 없어 `^mccp:.*` matcher가 성립하지
   않는다(`user_prompt_submit`은 실재하나 의미가 프롬프트 제출이다). 2차(`receipt-skill.js:152`)는
   `event.tool_name === 'Skill'`을 요구하는데 Codex의 skill 도구는 `ext/skills/src/tools/{list,read}.rs`
   계열이고 `Skill`이라는 이름의 도구가 없다. 따라서 "게이트가 소멸하는 것이 아니라 ingress가
   하나로 준다"는 문장은 거짓이다. **Verdict 1)의 순서 판정(hook 먼저)은 살아남되 근거가
   바뀐다** — "껍데기가 된다"가 아니라 "지금 이미 0이다".

3. **Verdict 2)의 C8 결합 권고를 철회한다.** 원인 가설(본문 크기)이 corpus와 직접 충돌한다 —
   미변환 `prp-commit`(3153B)이 변환된 `review-pr`(3474B)·`receipt-write`(3704B)보다 작다(재확인).
   게다가 C8이 소유한 파일은 `plan.md` 하나뿐이라 미변환 16개 중 15개를 덮지 못하고, C8은
   착수 게이트(C5 머지 + 선행조건 2건)가 열리지 않았다. 세 결함 중 하나만으로도 권고가 깨진다.

4. **"fork하지 마라"의 결론은 유지하되 근거를 교체한다.** 제시된 근거("fork하면 receipt chain이
   둘로 쪼개져 §3.12가 무너진다")는 범주 오류다 — receipt와 completion-ledger는 **대상 저장소**에
   살지 plugin 소스 트리에 살지 않는다(`store.js`가 `repoRoot`로만 주소를 잡는다). 유지되는
   근거는 코어 식별자(`deriveDecisionId`·`receiptHash`·`normalizeReceiptCwd`)가 실제로 하네스
   중립임이 측정됐고 넷째 표면도 additive로 닫히기 때문이다.

### 재측정이 새로 연 것

- **`Stop` 모순은 해소되지 않았다.** 런타임 경로(`Stop hook exited with code 2…`)는 실재하나
  설정 enum `HookEventsToml`은 CamelCase 10종·snake_case 11종 **어느 표기에도 `stop`이 없다.**
  재측정 에이전트가 "지원된다"고 단정했으나 과대 판독이며 채택하지 않는다. Open Question 2는 열려 있다.
- **Codex 호스트는 dual-review를 단일 모델 자기검토로 붕괴시킨다.** 세 게이트가 전부 Codex
  리뷰어를 부르므로 Codex가 작성까지 하면 교차성이 0이 된다. `santa-loop`의 Reviewer A도 사라진다.
  조사가 다루지 않은 축이며 PRD의 못박는 결정 3이 이를 닫는다.
- **receipt에 하네스 출처 필드가 0개다**(스켈레톤 72키). completion-ledger는
  `<decision_id>__<receipt_hash[0:12]>`로만 키가 잡혀 하네스 구분이 없다.
- **원복 무결성 재확인** — 설치·덤프 후 `~/.codex/config.toml` sha256 `da2344ed…` 일치, 잔여 캐시 0.

### 여전히 유효한 것

A절(배포·설치 표면 이미 호환) · B절의 6/22 수치(재확인) · `${CLAUDE_PLUGIN_ROOT}` 미치환 ·
E절의 derive 계층 `CLAUDE_*` 0건 · "`.claude-plugin/`을 `.codex-plugin/`으로 옮기지 마라" ·
"발화 실증 없이는 구현 범위를 확정하지 마라"(PRD Milestone 1이 이를 이행한다).
