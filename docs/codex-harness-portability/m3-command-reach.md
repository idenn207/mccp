# M3 — command-reach: Codex에서 mccp 명령 본문에 도달한다

> 측정 대상 `codex-cli 0.153.4` 하나. 다른 버전에 대해서는 아무 말도 하지 않는다(UI13).
> 원자료: [`.claude/_meta/data/2026-09-09-codex-harness-truth.json`](../../.claude/_meta/data/2026-09-09-codex-harness-truth.json)
> `runs[id=reach-sweep]` · `runs[id=reach-install-path]`.

## 사전에 못박은 판정 규칙

측정 전에 정한 것을 측정 후에 고치지 않았다.

1. **verdict는 `measured` / `unmeasured` 둘뿐이다.** "아마 된다"에 해당하는 값이 없다.
2. **양성 관측은 음성 대조가 성립할 때만 승격한다.** 통제가 실패하면 그 축은 해석 불가이고,
   해석 불가는 `unmeasured`다 — 부재의 증거가 아니다.
3. **root 해소 기법은 성립하는 것 중 가장 기계적인 것을 고른다**: R-a > R-b > R-d > R-c.
   R-c(모델 추론)는 자동 선택 후보에서 아예 제외한다.
4. 성립하는 것이 하나도 없으면 M3는 **닫지 않는다**. 없는 도달을 도달로 반올림하는 것이
   UI15가 금지한 껍데기다.

## 축별 판정

| 축 | verdict | 값 | 통제 |
|---|---|---|---|
| C1 skill 호출 가능 | `measured` | true | 양 arm에서 skill이 실제로 발화 |
| C3 명령 본문 도달 | `measured` | true | **성립** — 존재하지 않는 이름에서는 표식 미출현 |
| C4 미지 이름 구별 | `measured` | `unknown-command: … is not among the 22 installed commands` | 라이브 세션이 ENOENT가 아닌 구별된 사유를 냈다 |
| C5 이름 충돌 | `measured` | 충돌 없음 | `commands/run-command.md` 부재 · 기존 skill 부재 |
| C2 `${CLAUDE_PLUGIN_ROOT}` 치환 | **`unmeasured`** | — | **실패** — 아래 참조 |

### C3 실증 (Acceptance)

실제 Codex 세션에서 dispatcher를 통해 `plan-prd` 본문을 요청했고, stdout에 나온 것은:

```
## Phase 0 — CO-CREATION REQUIRED (Autonomy Contract Exception)
```

이 문자열은 저장소 전체에서 `commands/plan-prd.md` **한 파일에만** 있다. 모델이 지어낼 수
있는 일반적 표현이 아니라는 것이 이 표식을 고른 이유다.

음성 대조는 같은 절차를 존재하지 않는 이름으로 돌린 것이고, 표식은 나오지 않았으며 대신
resolver의 사유가 그대로 나왔다:

```
Resolver failed with exit code 1:
`unknown-command: plan-prd-does-not-exist is not among the 22 installed commands`
Stopped.
```

즉 양성은 배선에 귀속된다.

## 경로 선택 근거

DD1이 고른 것은 발명이 아니라 **선택**이었다 — Codex의 네이티브 명령 표면이 skill이므로
skill을 하나 실으면 된다. 실제로 착지한 형태는 DD2의 (b)다: 22개 shim이 아니라 dispatcher
하나. 그 하나가 `commands/`에 실재하는 것 전부에 도달하므로 도달 가능 집합이 "우리가 shim을
쓴 것"이 아니라 "설치된 것"이 된다.

**해소는 R-d(설치원 열거)로 성립했다.** R-a는 측정되지 않았고(C2), R-b는 필요하지 않았다.
`command-reach.js`는 후보를 전부 열거한 뒤 `commands/`를 실제로 가진 하나를 지목하며,
**둘 이상이면 지목하지 않는다**(§3.17 shadowed 규칙과 같은 형태 — 어느 사본이 열릴지
측정된 바 없으므로 추측하지 않는다).

### 검증과 소비를 구조로 결속했다

Plan-Codex가 지적한 것은 계획 자체의 구멍이었다 — Task 3이 "미지 이름을 거부한다"고 적어도
Task 4가 root를 따로 구해 경로를 조립하면 그 거부는 구속력이 없고, 그런 구현이 계획을
만족했다. 그래서 산문이 아니라 형태로 닫았다:

- `resolveCandidate()`는 **순수**하고 `resolved`를 절대 주장하지 않는다.
- `verify()`만 fs를 만지고 거기서만 `resolved:true`가 나온다.
- CLI shim은 `verify()`까지 마친 뒤에만 **exit 0**을 낸다.
- `SKILL.md`는 경로를 조립하지 않고 그 stdout만 소비한다.

조립할 경로가 본문에 없으므로 검증을 우회하는 구현이 존재할 수 없다.

### 열거는 디스크에서 온다

DD3가 금지한 것은 **하드코딩 사본**이다(갈라질 원본이 있으므로). `readdirSync`로 얻은
집합은 원본 그 자체라 갈라질 것이 없다. 그래서 셋을 동시에 얻었다 — 미지 이름을 구별해
거부하고, 짝 단언은 여전히 "본문 리터럴 ↔ 하드코딩 열거"를 재며 둘 다 거짓이고, 명령이
추가돼도 무변경이다.

## 측정하지 못한 것과 그 이유

### C2 — `${CLAUDE_PLUGIN_ROOT}` 치환

**네 번 쟀고 네 번 다 통제가 성립하지 않았다.** 순서대로:

1. `config.toml`의 `[hooks]`에 등록 — 치환형 미발화, 절대경로 통제 발화. 그러나 이것은
   **틀린 표면**이다. `config.toml`에는 plugin 문맥이 없으니 치환할 root 자체가 없다.
   DD5가 묻는 것은 출하되는 `hooks/hooks.json`이다.
2. `hooks.json` + 디렉토리 사본 설치 — 양 arm 미발화(통제 포함).
3. `hooks.json` + `.codex-plugin/plugin.json` 합성 — 양 arm 미발화.
4. `hooks.json` + **공식 설치**(`codex plugin add`, `install_ok=true`) — 양 arm 미발화.

통제가 발화하지 않으면 치환형의 미발화는 치환 실패인지 hook 배선 실패인지 구분되지 않는다.
그래서 이 축은 `unmeasured`다. **이것은 "치환되지 않는다"의 증거가 아니고 "치환된다"의
증거도 아니다.**

그 결과 **Task 6은 `hooks.json`을 바꾸지 않았다.** 미측정 축 위에서 출하 표면을 고치는
것은 DD4가 금지한 반올림이고, M2 배선을 회귀시킬 위험만 남는다. 이 축은 다음 milestone의
입력으로 남긴다.

### 부수 발견 — 설치 경로

디렉토리를 놓는 것만으로는 발견되지 않는다(3회 실측). Codex는 설치를 레지스트리로 관리하며
공식 경로는 `codex plugin marketplace add` → `codex plugin add`다.

그리고 **저장소의 `marketplace.json`은 `ref: release`라 로컬 워크트리가 아니라 릴리스
브랜치를 설치한다**(§3.7 release-channel-separation M1). 즉 Codex 쪽 dogfood 측정에는
로컬 소스를 가리키는 스크래치 marketplace가 따로 필요하다. 로컬 소스의 `source`는
marketplace 루트 **상대 경로 문자열**이고, 객체형(`{source:'local'|'directory'|'path'}`)은
0.153.4가 목록에 싣지 않는다.

## 주장하지 않는 것

- **실행 가능성을 주장하지 않는다.** M3가 보인 것은 본문이 **도착한다**는 것이다. 도착한
  `plan.md` 본문은 `Task`·`Workflow`·`AskUserQuestion`을 지시하고 Codex에는 그 도구 어휘가
  없다(결합 열거 `agent-tool-declaration`, 18곳). 그 처분은 M4가 소유한다.
- **핵심 6개 전부의 도달을 실증하지 않았다.** 라이브로 확인한 것은 `plan-prd` 하나다.
  `command-reach.js`가 22개 전부를 해소하는 것은 단위 test로 고정했지만, 그것은 경로 해소이지
  본문 로드가 아니다. `plan.md`(190KB)의 크기 상한은 재지 않았다.
- **`${CLAUDE_PLUGIN_ROOT}` 축에 대해 아무것도 주장하지 않는다**(위 참조).
- **다른 Codex 버전에 대해 주장하지 않는다.** 전부 0.153.4 하나의 관측이다.
- **타 사용자 설치 UX를 주장하지 않는다**(UI8). 측정은 단일 운영자 dogfood 기준이다.
