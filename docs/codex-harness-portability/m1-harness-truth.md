# M1 harness-truth — Codex CLI 0.153.4에서 mccp hook이 실제로 무엇을 하는가

> 측정일 2026-09-09(A1·A4 재측정 동일자) · `codex-cli 0.153.4` · 단일 운영자 dogfood(UI14).
> 모든 수치는 [`.claude/_meta/data/2026-09-09-codex-harness-truth.json`](../../.claude/_meta/data/2026-09-09-codex-harness-truth.json)에서 인용 가능하다.
> 이 문서는 그 원자료를 해석할 뿐 숫자를 새로 만들지 않는다. 버전 없는 측정치는 인용하지 않는다(UI13).

## 사전에 선언한 판정 규칙

측정 **전에** 못박은 규칙이고 측정 후에 바꾸지 않았다.

- verdict는 `measured` / `unmeasured` **둘뿐**이다. "아마 된다"에 해당하는 값이 없다(DD7).
- 축이 `measured`이려면 셋이 다 있어야 한다 — 값 · 증거(로그 줄 인덱스) · 증거 줄과 두 스냅샷의 `codex_version` 일치.
- **bypass로 얻은 발화는 A1을 승격시키지 않는다.** "신뢰 절차를 지나 발화한다"와 "신뢰 절차를 껐다"는 다른 사실이다.
- 원복 판정은 whole-file sha256이 **아니라** mccp 귀속 키 부재 + 캐시 엔트리 대조다(DD3-b). 프로브가 한 줄도 안 남으면 이 축은 `measured/clean`이 아니라 `unmeasured`다.

## 7축 판정

| 축 | verdict | 값 |
|---|---|---|
| A1 hook 발화 | **measured** | 신뢰 절차를 **지나** 6종 10건 발화. bypass 플래그 미사용 |
| A2 이벤트 enum | measured | config가 받는 필드 10종, 그중 **실제 발화 6종** |
| A3 자동 발견 | measured | 설치만으로 **발견됨**. 그러나 파싱 실패 → 0 발화 |
| A4 trust 절차 | measured | trust가 관문. 미승인 시 **조용히 0 발화**. 비대화형 승인 경로 **발견** |
| A5 env 주입 | measured | **Codex는 아무 env도 주입하지 않는다** |
| A6 payload shape | measured | Claude Code hook 프로토콜과 동형 |
| 원복 무결성 | measured | 실제 홈 mccp 귀속 투영 전후 동일 |

측정된 축 **7/7**. `milestone_closeable = true` — 근거는 A1이고, 그 판정은 산문이 아니라 `report.js`가 낸다.

> **A1은 한 번 접혔다가 같은 날 열렸다.** 첫 측정은 발화 6건을 보고도 이 축을 `unmeasured`로
> 뒀다 — 전부 `--dangerously-bypass-hook-trust`였고, 규칙이 그것을 승격시키지 않기 때문이다.
> 그때 적은 것은 "비대화형 승인 경로가 **없다**"가 아니라 "**찾지 못했다**"였고, 그 구분이
> 이 재측정을 가능하게 했다. 낡은 문장을 지우지 않고 남기는 이유는 §3.7과 같다 — 무엇이 왜
> 달라졌는지가 함께 남아야 한다.

## 축별 상세

### A2 — 이벤트 enum: 존재하는 것과 발화하는 것은 다르다

`[hooks]`는 named-field struct이고 **미지 필드를 조용히 무시한다.** 그래서 이름을 틀려도 오류가 없다.
필드 존재는 `<Event> = [ 5 ]`로 가른다 — 실재하면 타입 오류가 나고, 아니면 통과한다.

- **config가 받는 10종**: `UserPromptSubmit` · `PreToolUse` · `PostToolUse` · `SessionStart` · `SessionEnd` · `Stop` · `PreCompact` · `PostCompact` · `SubagentStart` · `SubagentStop`
- **29종을 시험해 없다고 확인**: `UserPromptExpansion` · `PostToolUseFailure` · `Notification` · `TurnStart` · `TurnEnd` 등
- **실제 발화 6종**(도구를 쓴 `codex exec` 한 턴): `SessionStart` → `UserPromptSubmit` → `PreToolUse` → `PostToolUse` → `Stop` → `SessionEnd`

**`Stop`은 실재하고 실제로 발화한다.** PRD OQ2가 "런타임 경로는 있고 설정 enum에는 없다"로 열어 둔 미지수가 닫혔다 —
stop-loop · auto-handoff · STATE.md 갱신 7건의 처분을 다시 정할 필요가 **없다**.

**mccp가 쓰는 8종 중 둘이 없다**: `UserPromptExpansion`과 `PostToolUseFailure`.
전자는 `receipt-prompt.js`가 붙는 자리, 즉 **receipt 게이트의 진입점 그 자체**다. M2의 문제가 이것이다.

### A3 — 자동 발견은 되고, 파싱이 안 된다

설치만으로 `plugins/mccp/hooks/hooks.json`이 **발견된다**. 그런데 파싱이 실패한다:

```
warning: failed to parse plugin hooks config .../hooks/hooks.json:
  unknown field `$schema`, expected `description` or `hooks` at line 2 column 11
```

세 가지가 동시에 참이다. 발견은 된다 · 파싱은 실패한다 · **그 실패가 error가 아니라 warning이라 실행은 그대로 진행된다.**
즉 설치는 성공으로 보이고 게이트는 하나도 발화하지 않는다 — UI15가 금지한 "껍데기" 상태의 교과서적 사례다.

캐시 사본에서 `$schema` 한 줄만 지우자 mccp hook이 실제로 돌았고 `.claude/state/STATE.md` · `hook-caps.json` ·
`journal/records.jsonl` · `msw-events/` · `hook-trace/<codex-session-id>/` · `.claude/cache/STATUS.md`가 생성됐다.
**저장소 사본은 건드리지 않았다**(UI12 — M1은 관측이다). 고치는 것은 M2의 첫 작업이다.

Codex 고유 런타임 차이도 같이 나왔다: `clamping SessionEnd hook timeout to 3s` · `running async SessionEnd hook synchronously`.

### A4 — trust는 관문이고, 거부는 침묵이다. 그리고 그 관문은 비대화형으로 열린다

같은 구성으로 bypass 유무만 바꿔 실행했다. 미승인 상태에서 `codex exec`는 **exit 0**으로 정상 종료하고
**오류도 경고도 없이** 발화가 0이다. `codex plugin add`도 trust 기록을 쓰지 않는다 — CLI 설치는
성공하는데 hook은 여전히 `untrusted`다.

승인 경로는 셋이 맞물린 형태로 실재한다.

1. 기록은 `config.toml`의 `[hooks.state."<key>"]`이고 스키마는 `HookStateToml { enabled: bool, trusted_hash: string }`이다.
   타입 오류 역추적으로 확정했다(`hooks.state=5` → `expected a map`, `…foo=5` → `expected struct HookStateToml`).
2. `<key>`와 기대 hash를 **계산하지 않는다.** app-server의 `hooks/list`가 hook마다
   `key` · `currentHash` · `trustStatus`를 그대로 준다. `trustStatus` enum은 `managed|untrusted|trusted|modified`다.
   key 형태는 선언원에 따라 갈린다 — user hook은 `<config.toml 경로>:<event_snake>:<i>:<j>`,
   plugin hook은 `<plugin>@<marketplace>:hooks/hooks.json:<event_snake>:<i>:<j>`.
3. **CLI override로는 안 된다.** `-c hooks.state."<key>"=…`는 key가 경로를 담아 점을 포함하므로
   dotted-path 파서가 그것을 쪼갠다. 기록은 파일에 써야 한다.

**음성 대조가 이 경로의 실재를 고정한다**: hash를 한 바이트 틀리면 `trustStatus`는 `modified`가 되고
발화는 0이다. 즉 승인이 실제로 일어나야만 hook이 돈다 — 우연히 도는 경로가 아니다.

이 값이 A1을 열었다. 프로브는 이제 실행 직전 `hooks/list`로 승인을 기록하고, bypass 플래그 없이
6종 10건을 발화시켰다. `trust_mode`는 그래서 **주장이 아니라 결과**다 — 승인이 기록되지 못하면
`untrusted`로 적히고 A1은 접힌다.

### A5 — Codex는 env를 주입하지 않는다

첫 측정은 부모 env를 물려받아 `CLAUDE_*` 13개가 섞였다. 그 값은 **인용하지 않는다** — Codex가 준 것과
Claude Code 부모가 갖고 있던 것을 구분할 수 없기 때문이다. 최소 env로 다시 재자 hook 자식이 받는 것은
우리가 넘긴 것뿐이었다.

- `CLAUDE_PLUGIN_ROOT` **미주입** (OQ4 = 아니오)
- 세션 id를 나르는 env 이름 **없음** (OQ5 = 없음). 세션 id는 **payload의 `session_id` 필드**로 온다

결과적으로 `bootstrap.js`(플러그인 루트)와 `session-identity.js`의 이름 체인(§3.18)은 Codex에서 **둘 다 빈 값**이 된다.

### A6 — payload는 Claude 프로토콜과 동형이다

공통 키 `session_id` · `transcript_path` · `cwd` · `hook_event_name` · `model` · `permission_mode`.
`PreToolUse`가 `tool_name` · `tool_input` · `tool_use_id`를, `PostToolUse`가 `tool_response`를,
`Stop`이 `stop_hook_active` · `last_assistant_message`를 더한다.
`receipt-skill.js:152`가 요구하는 `tool_name`이 **있다**. 이름이 같고 필드도 같으므로 M2는 재작성이 아니라 재배선이다.

### 원복 무결성 — 격리는 구조적으로 성립했다

`CODEX_HOME` 격리 하에서 실제 홈의 mccp 귀속 투영이 전후 동일했다. `config.toml` sha256도 우연히 동일했지만
그것은 **판정 근거가 아니다**(DD3).

PRD가 인용한 값 둘이 틀렸음을 재확인했다 — sha256은 `da2344ed…`가 아니라 `9a03a94f…`이고,
"잔여 캐시 0"은 `~/.codex/plugins/cache/mccp/`가 **빈 디렉토리로 잔존**하므로 측정 시작 전부터 거짓이었다.

## 미측정으로 남은 것과 그 이유

- ~~**A1 hook 발화**~~ — **닫힘(같은 날 재측정).** 비대화형 승인 경로를 찾아 bypass 없이 발화시켰다.
  이 줄을 지우지 않는 이유는 축이 한 번 접혔다는 사실 자체가 기록이기 때문이다.
- **발화하지 않은 4종**(`PreCompact` · `PostCompact` · `SubagentStart` · `SubagentStop`) — config는 받지만
  한 턴짜리 `exec`에서는 도달하지 않는 경로다. 수용은 확인, 발화는 미확인.
- **대화형 세션의 거동** — 전 측정이 `codex exec`(비대화형)다. TTY 세션의 trust 프롬프트와 hook 거동은 미측정.
- **`plugin_hooks removed false`의 뜻**(DD6) — `features list`에 그대로 있으나 A3가 발화 관측으로 답했으므로
  이 플래그의 어휘를 확정할 필요가 없어졌다. 가설로 남기고 판정에 쓰지 않는다.

## M2~M5가 물려받는 값

| 물려받는 것 | 값 | 귀속 |
|---|---|---|
| receipt 게이트 진입점 | `UserPromptExpansion`이 **없다**. 대체 ingress를 골라야 한다 | M2 |
| `hooks.json` 1행 수정 | `$schema` 키 제거 — 이것 없이는 모든 게이트가 껍데기 | M2 |
| trust 승인 절차 | **닫힘** — `[hooks.state."<key>"]` + `hooks/list`. M2의 실증은 bypass 위에 서지 않아도 된다 | M2 |
| 플러그인 루트 해소 | `CLAUDE_PLUGIN_ROOT` 미주입 → `bootstrap.js` 재배선 | M2 |
| 세션 id 해소 | env 아님, payload `session_id`. §3.18 체인에 소스 추가 | M5 |
| `Stop` 처분 | **재정의 불필요** — 실재하고 발화한다 | M2 |
| payload 소비 | 재작성 아님, 재배선 | M2 |
| SessionEnd 3s clamp | 비동기 hook이 동기로 강등된다. `session-end-trace.js`의 예산 재검토 | M2 |

## 이 측정이 주장하지 않는 것

- **"mccp가 Codex에서 작동한다"를 주장하지 않는다.** 주장하는 것은 "hook 계층이 발화할 수 있고, 그 조건이 무엇인지"까지다.
- **A1을 주장하지 않는다.** 발화를 보았지만 신뢰 절차를 지나서는 아니다. 그 구분을 지우면 M1이 막으려던 실패 모드가 그대로 남는다.
- **enum이 완전하다고 주장하지 않는다.** 29개 이름을 시험해 없다고 확인했을 뿐, 시험하지 않은 이름이 있을 수 있다.
- **다른 버전에 대해 아무것도 주장하지 않는다.** 전부 `0.153.4` 한 버전의 값이다(UI13).
- **결합 지점 열거의 완전성을 주장하지 않는다.** `scan-coupling.js`의 `unlisted:0`은 그 파일의 닫힌 규칙 집합
  **안에서** 참이다. 아무도 열거하지 않은 형태의 결합은 여전히 보이지 않는다.
