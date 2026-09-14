# M2 gate-ingress — Codex에서 receipt 게이트를 0회 발화에서 1회 발화로

측정 대상은 `codex-cli 0.153.4` 하나다. 다른 버전에 대해서는 아무 말도 하지 않는다(UI13).
원자료는 [`.claude/_meta/data/2026-09-09-codex-harness-truth.json`](../../.claude/_meta/data/2026-09-09-codex-harness-truth.json)
의 `runs[id=block-protocol]` · `runs[id=gate-block-live]`이다.

## 사전에 선언한 판정 규칙

M1과 같다. verdict는 `measured` / `unmeasured` 둘뿐이고 "아마 된다"에 해당하는 값이 없다.
승격은 **값 · 증거 · 버전** 셋이 다 있을 때만 일어난다.

여기에 M2가 하나를 더한다 — **양성 관측은 음성 대조 없이 승격하지 않는다.** 어떤 프로토콜이
차단했다는 관측은 같은 hook이 ALLOW를 낼 때 보호 대상 연산이 **실제로 일어났다**는 통제가
성립할 때만 프로토콜에 귀속된다. 통제가 없으면 crash·인증 실패·타임아웃이 차단과 같은 모양이다.

## 4축 판정

| 축 | verdict | 값 |
|---|---|---|
| B1 차단 프로토콜 | `measured` | `stdout-json-block` · `exit-nonzero-stderr`가 `UserPromptSubmit`에서 차단. `hook-specific-deny`는 존중되지 않음 |
| B2 음성 대조 | `measured` | `UserPromptSubmit` allow-control이 보호 대상 연산에 도달 |
| B3 `${CLAUDE_PLUGIN_ROOT}` 치환 | `unmeasured` | 스윕이 절대경로로 hook을 등록하므로 이 축은 발화하지 않았다 |
| B4 하네스 판별자 | `measured` | Codex가 주입하는 env는 **없다**. 어떤 환경변수도 Codex 호스트를 양성으로 지목하지 못한다 |

Metric 2(실차단)는 별도 레코드다 — `runs[id=gate-block-live]`의 `pair_ok: true`.

## 측정 → ingress 선택

### B1 — 이 저장소가 이미 내는 형식이 그대로 차단한다

세 후보를 `UserPromptSubmit`에서 각각 방출하고, 같은 이벤트의 ALLOW 통제와 짝지어 관측했다.
보호 대상 연산은 "프롬프트가 모델에 도달했는가"이고, 도달 여부는 모델만이 낼 수 있는 표식이
codex stdout에 나타나는지로 잰다.

| 프로토콜 | hook 발화 | 보호 연산 발생 | 판정 |
|---|---|---|---|
| allow-control | ✓ | ✓ | `not-blocked` (통제 성립) |
| `stdout-json-block` | ✓ | ✗ | **`blocked`** |
| `exit-nonzero-stderr` | ✓ | ✗ | **`blocked`** |
| `hook-specific-deny` | ✓ | ✓ | `not-blocked` |

**채택은 `stdout-json`이다.** 그것이 `receipt-prompt.js`가 이미 내는 형식이기 때문이다.
그 결과 plan DD4가 요구한 "동작 변경 0"과 Task 6이 요구한 "차단 형식으로 방출"이 실제로
양립한다 — 게이트 코어는 같은 payload를 내고 이벤트 이름만 주입받는다. 리뷰어 셋이 이 둘을
양립 불가로 지목했는데, 그 지적은 **측정 전 상태에서 옳았다**: 형식이 코어에 리터럴로 박혀
있어 다른 형식을 고를 자리가 없었다. M2는 자리를 만들었고(방출 seam), 측정은 그 자리에 넣을
값이 기존 값과 같음을 보였다.

`PreToolUse`는 **측정하지 않았다.** 그 이벤트의 ALLOW 통제가 보호 대상 연산에 도달하지
못했고(모델이 도구를 쓰지 않았다), 통제 없는 차단 관측은 프로토콜에 귀속되지 않는다. 그래서
차단 시도 자체를 실행하지 않았다.

### B4 — 판별자는 env로 성립하지 않는다. 그것이 이 마일스톤의 가장 큰 정정이다

plan DD3은 `CODEX_HOME`이 값을 갖고 `CLAUDE_PLUGIN_ROOT`가 없으면 codex로 보려 했다.
M1 자신의 원자료가 그것을 반증한다:

```
runs[id=env-projection-clean].result.injected_by_codex === []
runs[id=env-projection-clean].result.CLAUDE_PLUGIN_ROOT_injected === false
```

Codex는 자기 존재를 알리는 환경변수를 **하나도 주입하지 않는다.** 그 레코드에 `CODEX_HOME`이
값과 함께 찍힌 것은 프로브가 자식 env에 직접 넣었기 때문이고, 기본 운용에서 운영자는 그 이름을
export하지 않는다. 즉 DD3의 연언은 양성 조건을 잃고 항상 접혀, **게이트가 설치돼도 발화하지
않는다**. UI15가 금지한 껍데기가 판별자 자체에서 나온다.

부재를 근거로 삼는 대안(`CLAUDE_PLUGIN_ROOT`가 없으면 codex)은 더 나쁘다 — 그 이름이 어떤
이유로든 빠진 Claude Code 세션이 곧바로 이중 게이트가 된다.

그래서 판별은 **양성 신호로만** 성립한다:

1. `MCCP_HARNESS ∈ {claude, codex}` — launcher-owned 명시 designation
2. `CLAUDE_PLUGIN_ROOT`가 값을 가지면 `claude`
3. 그 밖에는 전부 `unknown`, 그리고 `unknown`은 아무 일도 하지 않는다

payload 형태는 **보강으로만** 쓴다. Codex의 `UserPromptSubmit`이 `turn_id`·`prompt`를 갖는
것은 측정됐지만 **Claude Code의 같은 payload는 측정되지 않았다.** 그것을 모른 채 "turn_id가
있으면 codex"라고 적으면 DD3가 저지른 오류(미측정 값의 판별 근거 승격)를 형태만 바꿔 반복하는
것이다. 그래서 payload는 지목을 codex 쪽으로 **올리는 데 쓰지 않고**, 이미 codex로 지목된
실행이 codex가 아닌 형태를 보이면 `unknown`으로 **내리는** 데만 쓴다.

## 차단 실증 (Metric 2)

`gate-demo`는 합성 payload가 아니라 **출하되는 `receipt-prompt-submit.js`**를 스크래치
`CODEX_HOME`에 등록하고, 그 hook이 `runGate`를 불러 낸 출력으로 관측한다. 그 구분이 없으면
"형식은 차단하는데 우리 payload는 무효"인 상태가 B1 `measured`와 로컬 test green을 모두
통과해 도착한다.

| phase | 프롬프트가 모델에 도달 | 판정 |
|---|---|---|
| `missing` (선행 receipt 부재) | ✗ | **`blocked`** |
| `receipt-present` (음성 대조) | ✓ | `passed` |

차단 payload는 `hookSpecificOutput.hookEventName: "UserPromptSubmit"`을 실었다 — 주입된
이벤트 이름이 실제로 wire까지 도달했다는 증거이고, 합성 payload 프로브로는 보일 수 없는 값이다.

**픽스처가 두 번 틀렸고 그 이력을 남긴다.** 첫 시도는 `/mccp:prp-implement`를 썼고 차단되지
않았다. 결함이 아니라 설계다 — 비-terminal 게이트의 **missing-only** upstream receipt는
v1.3.1 informational ALLOW 경로다(CLAUDE.md §1.3). 두 번째 문제는 스크래치 저장소가
`master` 브랜치라 decision slug가 generic으로 접혀 v0.2.8 하드블록이 먼저 걸린 것이다.
그것도 차단이지만 **우리가 재려는 차단이 아니다**. terminal `/mccp:pr` + feature 브랜치로
고쳤다. 두 실패 모두 "게이트가 작동하지 않는다"가 아니라 "픽스처가 게이트의 차단 파티션에
있지 않았다"였다.

## 발화 범위 — 이 게이트가 덮는 것과 덮지 않는 것

**덮는 것은 사람이 리터럴 슬래시 명령으로 시작한 턴 하나다.** 정규화는 프롬프트의 **첫 줄**만
보고 `^/?mccp:[a-z0-9][a-z0-9-]*`에 맞을 때만 명령으로 인식한다. 따라서:

- `"please run /mccp:pr for me"` — 인식하지 않는다(ALLOW)
- 둘째 줄 이후의 `--plan` · `--decision` — args가 되지 않는다
- 모델이 자율적으로 수행하는 작업 — `UserPromptSubmit`은 발화하지 않는다(그 축은 `PreToolUse`이고 B1에서 미측정이다)

Codex에는 슬래시 명령 확장이 없으므로 이 게이트가 보는 것은 **확장된 명령이 아니라 사용자가
친 텍스트 그 자체**다. 명령이 실제로 실행 가능해지는 축은 M3(command-reach) 소유다.

## `$schema` 제거의 실제 사거리

DD1은 사거리를 "한 줄"로 적었다. 실측은 **핸들러 29건**이고 그중 다섯이 exit 2로 도구 호출을
막는 default-deny 가드다(`receipt-skill` · `pr-phase-guard`(두 이벤트) · `ultracode-phase-guard`
· `goal-phase-guard`). Codex에서 `hooks.json`이 파싱되는 순간 그 전부가 살아나며, 어느 것도
Codex에서 측정된 적이 없다. stale lock 하나가 세션 전체를 deny로 만들 수 있다.

UI16이 요구한 것은 "0에서 1로"이지 "0에서 29로"가 아니다. 그래서 `shouldRunClaudeHook`이
**적극적으로 codex로 지목된** 실행에서 Claude 전용 hook을 통과시킨다. `unknown`에서는 돈다 —
판별자가 실패한 Claude 세션에서 게이트를 통째로 지우는 것이 더 큰 손실이기 때문이다.

## 하네스 출처는 receipt만으로 판별되지 않는다

M2 이후 이 저장소는 하네스 출처 필드가 없는 live receipt를 처음으로 생산한다. UI18이 그 필드를
M5에 배정했으므로 M2는 **공백을 명시하고 감사 도구를 바꾸지 않는다** — 판별할 수 없는 것을
판별한다고 주장하게 만드는 변경이기 때문이다. `evidence-audit.js`는 무변경이다.

## 미측정으로 남은 것과 그 이유

- **B3 `${CLAUDE_PLUGIN_ROOT}` 문자열 치환** — 스윕이 절대경로로 hook을 등록해 이 축이 발화하지 않았다. `bootstrap.js#resolveRoot()`의 `__dirname` 폴백이 그 값과 **무관하게** 성립하므로(security H1) M2의 배선은 이 측정에 의존하지 않는다. 그러나 `hooks.json`의 command 문자열은 여전히 그 변수를 쓰므로, 치환되지 않으면 hook이 시작조차 못 한다 — **그 경로는 이번 사이클에 실증되지 않았다.** `gate-demo`는 절대경로로 등록해 우회했다.
- **`PreToolUse` 차단** — ALLOW 통제가 성립하지 않아 시도하지 않았다.
- **Claude Code의 `UserPromptSubmit` payload 형태** — 재지 않았다. 그래서 payload 판별자가 한 방향으로만 작동한다.
- **trust 절차 하의 차단** — B1은 `--dangerously-bypass-hook-trust`로 쟀다. 그것이 재는 것은 "형식을 존중하는가"이고 "신뢰 절차를 지나 발화하는가"는 M1 A1이 이미 trusted 경로로 쟀다.

## 이 마일스톤이 주장하지 않는 것

- **"mccp가 Codex에서 작동한다"를 주장하지 않는다.** 주장하는 것은 "receipt 게이트가 최소 하나의 ingress로 발화하고, 선행 receipt가 없을 때 실제로 차단한다"까지다.
- **"설치하면 켜진다"를 주장하지 않는다.** `MCCP_HARNESS=codex`를 켠 운영자에게만 발화한다. trust 승인이 이미 수동 절차이므로 설치 절차에 줄 하나가 더해지는 것이고, 그 줄은 문서화된 설치 단계이지 우회가 아니다.
- **ingress가 최선임을 주장하지 않는다.** `pre_tool_use` 쪽이 더 나을 가능성은 그 이벤트의 통제가 성립하는 날 다시 열린다.
- **하네스 출처를 판별할 수 있다고 주장하지 않는다** (UI18 · M5 소유).
- **다른 Codex 버전에 대해 아무것도 주장하지 않는다** (UI13).
- **trust 승인을 자동화하지 않는다.** 그 경로는 계측 하네스에만 있고 운영자가 직접 승인한다(DD6). 다만 이 저장소가 공개이므로 그 레시피 자체는 공개돼 있다 — DD6이 통제하는 것은 "제품 트리에 버튼을 두지 않는다"까지이고 "공개 노출을 통제한다"가 아니다.

## M3~M5가 물려받는 값

- 차단 프로토콜은 `stdout-json`이고 Claude와 같다 — 하네스별 직렬화기가 필요 없다.
- 하네스 판별은 **명시 designation** 없이는 성립하지 않는다. M3의 명령 도달 축도 같은 전제 위에 선다.
- `shouldRunClaudeHook`이 Claude 전용 hook 29건의 단일 관문이다. M5가 그중 무엇을 하네스 중립으로 옮길지 정할 때 이 관문이 목록이 된다.
- `tool_use_id` 부재는 `turn_id` 매핑으로 닫혔다. 세션 id 체인 자체는 손대지 않았다(§3.18 · UI18).
