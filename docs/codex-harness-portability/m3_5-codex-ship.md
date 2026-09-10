# M3.5 — codex-ship: Codex에서 mccp를 설치하고 발화시킨다

> 측정 대상 `codex-cli 0.153.4` 하나. 다른 버전에 대해서는 아무 말도 하지 않는다.
> 이 milestone은 관측이 아니라 **배포**다 — M1~M3가 만든 것을 Codex에 **닿게** 한다.

## 왜 hotfix인가

M3까지 착지한 시점에 M4·M5를 이 하네스에서 완주할 Claude 예산이 남지 않았다. 운영자가 남은
두 축을 **Codex 하네스에서 이어가기로** 결정했고, 그 결정이 PRD의 순서를 바꾼다 — 원래 M4·M5는
Codex 도달을 전제로 하는 축이었는데 이제 그 전제 자체가 다음에 할 일이 된다.

이것은 PRD Problem이 기술한 실패 모드의 실물이다. "한도에 도달하면 작업이 그 자리에서 멈춘다"가
이 PRD 자신에게 일어났다.

## 사전에 못박은 판정 규칙

측정 전에 정한 것을 측정 후에 고치지 않았다.

1. **성공 조건은 발화 축에 결속한다.** 파일이 해소된다는 사실은 hook이 발화한다는 사실이 아니다.
2. **승인 대상 0건은 성공이 아니다.** trust가 0건이면 발화 축이 성립할 수 없으므로 비영점이다.
3. **관측할 수 없었던 것은 `missing`이 아니라 `unmeasured`다.** 통제 없는 미발화는 부재의 증거가 아니다.
4. **`--apply` 없이는 한 바이트도 쓰지 않는다.** 운영자 홈의 config를 고치는 것은 되돌리기 어렵다.

## 검증이 두 축인 이유 — 리뷰가 잡고 실측이 확증했다

초안은 성공 조건을 `command-reach.js verify()`의 `resolved:true` 하나에 걸었다. plan 게이트의
네 리뷰어(architect·security·test·invariant)와 L3 Codex가 **독립적으로 같은 것**을 지목했고,
실측이 그것을 확증했다.

2026-09-10, mccp가 Codex에 **설치되지 않은** 상태에서 잰 값:

```json
"reach": {
  "axis": "missing",
  "detail": "resolved via R-d:claude-cache, not the Codex plugin cache — this does NOT prove Codex reach",
  "root_source": "R-d:claude-cache"
}
```

`verify()`는 root 후보를 순서대로 시도하다 **codex 캐시가 비면 claude 캐시로 폴백**한다
(`command-reach.js:82-90`). 즉 초안대로였다면 Codex 설치가 0건인 이 상태에서 `resolved:true`가
나오고 `bootstrap --apply`가 **exit 0**을 냈을 것이다 — PRD Problem이 지목한 "설치는 되는데
발화하지 않는다"를 제품이 그대로 재현하는 것이다.

세 가지가 함께 틀린다:

| 축 | 왜 |
|---|---|
| 캐시 폴백 | codex-cache가 0건이면 `R-d:claude-cache`가 승자가 된다 |
| env 우선순위 | `ROOT_ENV_NAMES`(`MCCP_PLUGIN_ROOT`·`CLAUDE_PLUGIN_ROOT`·`CODEX_PLUGIN_ROOT`)와 `MCCP_PLUGIN_ROOT_HINT`가 캐시 후보보다 **먼저** 온다 — 개발 셸이면 워크트리가 승자다 |
| harness 단락 | `harness==='claude'`면 `verify()`가 즉시 단락되어 `resolved:true`를 낼 수 없다(`:152-157`) |

그래서 검증은 둘이다.

- **축 (i) 발화 (1차)** — `hooks/list`가 mccp hook을 `trustStatus === 'trusted'`로 보고하는가.
  M1이 실제로 통제를 세운 축이고, **음성 대조가 성립하는 유일한 축**이다: hash를 한 바이트 틀리면
  `modified`가 되고 발화가 0이 된다.
- **축 (ii) 해소 (2차)** — `verify()`의 `rootSource`가 `R-d:codex-cache`인가. `resolved:true`만
  보지 않는다. 이 호출은 위 네 env를 **지운 자식 프로세스**에서 `MCCP_HARNESS=codex`로 돈다.

## 승인 대상은 세 조건을 모두 만족하는 hook뿐이다

프로브(`scripts/codex-probe/cli.js#grantHookTrust`)는 `hooks/list` 반환 **전량**에
`enabled = true`를 append한다. 매 실행 새로 만드는 스크래치 home에서만 안전한 동작이고,
실사용 `~/.codex/config.toml`에 같은 짓을 하면 운영자의 **서드파티 hook 전부**를 무차별 승인하는
권한 상승이다.

| 조건 | 위반 시 | 왜 |
|---|---|---|
| 선언원이 `mccp@<marketplace>` | `not-declared-by-mccp` | 타 plugin과 `config.toml` 선언 hook은 우리 소유가 아니다 |
| `trustStatus !== 'modified'` | `trust-status-modified` | `modified`는 승인 후 본문이 바뀌었다는 신호다. 덮는 것은 승인이 아니라 은폐다 |
| 운영자가 `enabled = false`로 끄지 않음 | `operator-disabled` | 명시적으로 끈 것을 켜는 것은 부트스트랩의 권한 밖이다 |

거른 것은 조용히 버리지 않고 사유와 함께 보고한다 — 조용히 거르면 운영자는 왜 발화가 0인지 알 수 없다.

## 런북

### 순서는 `컷 → 설치 → trust → 검증`이다

`trusted_hash`는 hook **본문**의 해시다. 릴리스 컷이 `release`를 옮겨 사용자가 새 본문을 설치하는
순간 기존 승인은 `trustStatus=modified`가 되고 발화가 0으로 돌아간다. 그래서 설치·승인은 컷
**뒤**다. 부트스트랩이 멱등인 것이 여기서 값을 한다 — 컷 뒤에 같은 명령을 다시 돌리면 된다.

```bash
# 0. 지금 상태를 본다. exit 0이면 이미 끝난 것이다.
node plugins/mccp/scripts/lib/codex-bootstrap.js status --json

# 1. 무엇을 할지만 본다 — 한 바이트도 쓰지 않는다.
node plugins/mccp/scripts/lib/codex-bootstrap.js bootstrap

# 2. 실제로 수행한다. config.toml은 먼저 wx/0600 백업된다.
node plugins/mccp/scripts/lib/codex-bootstrap.js bootstrap --apply \
  --marketplace <marketplace-ref>

# 3. 두 축이 모두 성립했는지 다시 본다.
node plugins/mccp/scripts/lib/codex-bootstrap.js status --json
```

`--apply`의 exit 0은 축 (i)과 축 (ii)가 **모두** 성립할 때만 나온다. 한쪽이라도 어긋나면
어느 축이 왜 깨졌는지 지목하며 비영점으로 끝난다.

### Codex 자신의 명령은 감싸되 재해석하지 않는다

`codex plugin marketplace add` · `codex plugin add`의 종료 코드와 stderr는 그대로 표면화한다.
우리가 성공/실패를 다시 판정하면 그 판정이 Codex의 것과 어긋나는 날 조용히 틀린다.

## 산출물은 redact 관문을 지나서만 문서에 들어간다

`codex-bootstrap.js`는 신규 producer다. 그 출력은 정의상 절대경로를 담는다 — hook key의 첫 구간이
선언원 경로이고, `verify()`의 `root`·`commandPath`는 realpath 절대경로다. 그 값을 git-tracked
문서에 붙여 넣는 것이 이 milestone의 acceptance이므로 `redact-gate.js`를 거치지 않으면 §3.12가
`meta.cwd`로 이미 한 번 갚은 유출을 새 표면에서 다시 연다. 관문이 producer마다가 아니라
**하나**인 것이 그 파일의 설계 이유다. 통과하지 못하면 값을 조용히 치환하지 않고 producer를
고친다 — 관문은 판정만 한다.

## 주장하지 않는 것

- **명령 본문의 실행 가능성을 주장하지 않는다.** M3가 이미 그 경계를 그었다 — 도착한 `plan.md`
  본문은 `Task`·`Workflow`·`AskUserQuestion`을 지시하고 Codex에는 그 도구 어휘가 없다(결합 열거
  `agent-tool-declaration`, 18곳). M3.5는 그 경계를 옮기지 않는다. 여는 것은 **설치와 발화**뿐이다.
- **리뷰어 교차성(M4)도 chain 동등성(M5)도 열지 않는다.**
- **`${CLAUDE_PLUGIN_ROOT}` 치환 축에 대해 아무것도 주장하지 않는다.** M2·M3에서 `unmeasured`로
  남았고 M3.5도 재지 않았다. 부트스트랩은 그 축에 의존하지 않지만(`bootstrap.js#resolveRoot()`의
  `__dirname` 폴백), 축 (i)이 실패하면 그 원인 후보 중 하나다.
- **다른 Codex 버전에 대해 주장하지 않는다.** 전부 0.153.4 하나의 관측이다.
- **타 사용자 설치 UX를 주장하지 않는다.** 측정은 단일 운영자 dogfood 기준이고 `/mccp:setup`의
  Codex 분기는 PRD가 out of scope로 둔 채 남아 있다.
