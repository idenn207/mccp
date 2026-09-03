# Implementation Report: release-channel-separation M2 — dogfood-install

> **STATUS: COMPLETE — 1순위 기제(`--plugin-dir`)가 양성 대조를 통과했고 후퇴선은 타지 않았다.**
> 이 마일스톤의 간판 주장은 "핵심 산출물은 문서가 아니라 문서를 쓰기 전에 끝낸 실측"이다.
> 아래 `## 실측 원문`이 그 실측이며, 문서와 CLAUDE.md 정정은 그 뒤에 쓰였다.

경로는 전부 `<WORKTREE>` · `<HOME>` · `<PLUGINS>` 치환형이다(H4). `version` ·
`gitCommitSha` · exit code · CLI 출력 문구는 원문 그대로다 — 치환은 경로에만 적용한다.

## Summary

M1이 배포 채널을 `release`로 옮기면서 main을 실제로 써 보는 경로가 함께 사라졌다. M2는
그 dogfood 표면을 릴리스 좌표를 하나도 건드리지 않고 되돌려 놓는다. 확정된 기제는
`claude --plugin-dir <WORKTREE>/plugins/mccp`이고, 저장소에 파일을 하나도 더하지 않으며
전역 설치 상태를 바꾸지 않는다.

계획이 1순위로 지목한 기제가 그대로 이겼으므로 조건부 산출물 `marketplace.dev.json`은
생기지 않았다. 그 대신 계획이 미리 답을 정해 두지 않았던 축 하나가 실측으로 닫혔다 —
**설치된 릴리스 사본과의 충돌은 일어나지 않는다.** CLI가 plugin 이름 수준에서 스스로
해소하므로 절차에 "채널 재우기" 선행 단계가 없다.

## 실측 원문

측정 환경: Windows 11 · `claude` 2.1.259 · scratch 프로젝트는 저장소 밖
(`<HOME>/mccp-m2-scratch`).

- mechanism: plugin-dir
- marker_nonce: 9f8a5f7cc76a
- marker_observed: true
- marker_absent_without_mechanism: true
- installed_plugins_version: 1.33.6
- installed_plugins_git_commit_sha: 647dfecba75eecd9287ee538ca5f7056c7ba71da
- cache_dirs_added: 0
- manual_cache_copies: 0
- round_ledger_resets: 3
- l2_dispatch_rounds: 8

### 실행 순서

1. **백업(Task 2)** — `<HOME>/.claude/backup/mccp-m2-20260903-041927/`에 세 파일
   (`settings.json` · `installed_plugins.json` · `known_marketplaces.json`)을 복사하고
   원본과 sha256 동일함을 대조했다. 저장소 트리 안에는 어떤 백업물도 두지 않았다.
2. **판별 marker 심기(Task 3)** — worktree의
   `plugins/mccp/scripts/hooks/session-start.js` 최상단에 marker 파일 1개를 쓰는 임시
   변경을 넣었다. 파일명에 nonce `9f8a5f7cc76a`가 들어가 이전 실행의 잔존물과 구별된다.
   marker는 `try/catch`로 감싸 hook의 fail-open 계약을 깨지 않는다.
3. **음성 대조** — scratch 프로젝트에서 플래그 **없이** 1회 실행. marker 파일이 생기지
   않았다.
4. **양성 관측** — 같은 프로젝트에서 `--plugin-dir <WORKTREE>/plugins/mccp`로 1회 실행.
   marker 파일이 생겼다.
5. **충돌 실측(Task 4)** — `--debug-file`로 같은 실행을 다시 돌려 플러그인 로드 경로를
   직접 읽었다.
6. **회피 후보 2종 실측(Task 4)** — 프로젝트 범위 disable을 걸고 전역 3파일을 대조한 뒤
   같은 관측을 반복했다.
7. **되돌리기(Task 3 (iv))** — 임시 변경을 `git checkout`으로 되돌리고 `plugins/` 하위
   변경이 0건임을 확인했다. 종료 조건은 `## Validation` 검사 12다.

### marker 원문 (양성 실행)

```json
{"at":"2026-09-03T04:21:08.477Z","plugin_root":"<WORKTREE>/plugins/mccp","hook_dirname":"<WORKTREE>/plugins/mccp/scripts/hooks","cwd":"<HOME>/mccp-m2-scratch"}
```

`plugin_root`가 캐시가 아니라 worktree를 가리킨다 — 본문이 worktree에서 왔다는 직접
증거다. 음성 실행에서는 이 파일 자체가 존재하지 않았다.

### 디버그 로그 원문 (충돌 축)

```
[DEBUG] Read hooks.json for plugin mccp (enabled=true): <WORKTREE>/plugins/mccp/hooks/hooks.json
[DEBUG] Read hooks.json for plugin mccp (enabled=true): <PLUGINS>/cache/mccp/mccp/1.33.6/hooks/hooks.json
[DEBUG] Loaded inline plugin from path: mccp
[DEBUG] Plugin "mccp" from --plugin-dir overrides installed version
[DEBUG] Registered 32 hooks from 2 plugins
[DEBUG] Loaded 22 commands from plugin mccp default directory
[DEBUG] Loaded 58 agents from plugin mccp default directory
[DEBUG] Loaded 47 skills from plugin mccp default directory
```

CLI는 두 `hooks.json`을 모두 **읽지만** 등록은 한 번만 한다. 그 32는 worktree mccp의
29개와 codex의 3개이고(각 `hooks.json`을 직접 세어 대조), 설치된 릴리스 사본의 hook은
등록되지 않는다. 즉 동시 로드로 hook이 두 번 도는 사고는 **일어나지 않으며**, 그것은
운영자가 밟아야 하는 절차가 아니라 CLI의 동작이다.

SessionStart dispatch는 1회였다(`Hook SessionStart:startup ... success` 1건).

### 회피 후보 2종

- 후보 (a) scratch 프로젝트의 `.claude/settings.json`에 `enabledPlugins` false
- 후보 (b) `claude plugin disable mccp@mccp --scope project`

**둘은 같은 기제다.** (b)를 실행하면 CLI가 (a)의 파일을 그대로 쓴다:

```json
{"enabledPlugins": {"mccp@mccp": false}}
```

사용자 전역 `settings.json`의 `enabledPlugins`는 바뀌지 않았다(백업본과 대조). 끈
상태에서 같은 관측을 반복했을 때 override 문구와 로드 결과는 동일했다 — 즉 이 단계는
**필요하지 않다**. 절차에는 필수로 넣지 않고 선택지로만 적었다.

### 전역 상태 무손상 (Task 4 step 3)

- `<HOME>/.claude/settings.json` — `enabledPlugins`의 `mccp@mccp`가 `true`. 무변동.
- `<PLUGINS>/installed_plugins.json` — 실행 전후 sha256 동일
  (`f0960fd8d15e65a0…`). `version`·`gitCommitSha`·`lastUpdated` 3필드 무변화.
- `<PLUGINS>/known_marketplaces.json` — **이름 집합 동일**
  (`claude-plugins-official` · `mccp` · `openai-codex`), `mccp-dev` 잔존 0건.
  파일 해시는 달라졌고 그 차이는 `lastUpdated` 두 줄뿐이다 — CLI가 실행마다 갱신한다.

마지막 항목은 계획의 설계 판단을 실측으로 입증한다. `## Validation` 검사 14가 sha256이
아니라 **이름 집합**을 비교하도록 쓰인 이유가 "`lastUpdated` 류까지 묶으면 정상 운영에서도
발화해 판별력이 0이 된다"였는데, 실제로 정상 운영만으로 그 필드가 움직였다. 해시 비교였다면
이 자리에서 거짓 HALT가 났다.

- `<PLUGINS>/cache/mccp/mccp/` — 실행 전후 디렉토리 10개로 동일
  (`1.29.0` `1.30.0` `1.32.2` `1.32.6` `1.33.1` `1.33.2` `1.33.4` `1.33.5` `1.33.6`
  `1.33.7`). 신규 0개.

### 부수 관측 — hook 모듈이 세션당 두 번 로드된다

양성 실행에서 marker가 **2줄** 기록됐다. 원인을 추적한 결과 `--plugin-dir`와 무관한
mccp 자신의 선재 동작이다.

`plugins/mccp/scripts/hooks/run-with-flags.js`는 hook이 `run()`을 export하는지를
**본문 텍스트로** 판정한다 — `module.exports`라는 문자열과 `run`이라는 낱말이 둘 다
본문에 있으면 참이다. `session-start.js`는 그 둘을 모두 가지므로 판정을 통과해
`require(scriptPath)`가 실행되고 — 그 시점에 module-scope 부작용이 일어난다 — 이어서
`typeof hookModule.run !== "function"`이라 legacy `spawnSync` 경로로 떨어져 **같은 모듈이
한 번 더** 실행된다. 그 파일의 주석이 스스로 경고하는 "double execution"이 텍스트 판정의
거짓 양성으로 실제 발생한 것이다.

CLI를 거치지 않고 `session-start-bootstrap.js`를 직접 호출해도 marker가 2줄 기록되므로,
이 축은 dogfood 경로가 만든 것이 아니다. M2의 `Files to Change` 밖이라 여기서 고치지 않고
`.claude/plans/codex-findings-backlog.md`에 file:line 증거와 함께 적재했다.

## 채택한 기제와 탈락 사유

| 기제 | 판정 | 근거 |
|---|---|---|
| `--plugin-dir` (1순위) | **채택** | 양성 대조 통과 · 표면 4종 전부 로드 · 전역 상태 무개입 · 저장소에 파일 0개 추가 |
| dev marketplace manifest (후퇴선) | **타지 않음** | 후퇴선의 발동 조건은 "Task 3 또는 4가 부정했을 때"인데 둘 다 통과했다. Task 3은 hook을 포함한 표면 전체 로드를 관측했고, Task 4는 충돌 자체가 없음을 관측했다. 조건이 성립하지 않은 경로를 실행하면 운영자 전역 `known_marketplaces.json`에 worktree를 가리키는 영구 항목이 이유 없이 남는다 |

후퇴선을 타지 않았으므로 `marketplace.dev.json`은 만들지 않았고 `mccp-dev` marketplace
등록도 존재한 적이 없다. `## Validation`의 dev manifest 형태 단언은 파일 부재로 skip되며,
그 skip의 짝이 이 절이다.

## 복구가 필요했는가

필요하지 않았다. 전역 3파일 판정이 전건 통과했고 백업에서 되돌린 것은 없다. 백업은
`<HOME>/.claude/backup/mccp-m2-20260903-041927/`에 그대로 있다.

## 게이트 상태 — 이 마일스톤은 승인 receipt 없이 왔다

plan 게이트는 L2 패널 9라운드 뒤 `divergent`로 닫혔고 승인 `mccp-plan-codex` receipt가
**없다**. `review_proof`가 `null`이고 verdict가 `divergent`인 상태에서 승인 receipt를 쓰는
것은 위조뿐이라 쓰지 않았다. 라운드를 더 여는 것도 선택지가 아니었다 — 캡이 기계적으로
거부하고(§3.16), 재진입은 `record.js`가 R9 findings 표를 덮어써 유일한 패널 감사 근거를
지운다.

receipt 부재는 cross-gate dedupe를 열지 않는다. 따라서 terminal `/mccp:pr`에서 PR-Codex가
실제로 발화한다 — 이 종료는 리뷰를 없앤 것이 아니라 plan 라운드를 끝낸 것이다.

라운드 계측값은 `## 실측 원문`의 `round_ledger_resets: 3` · `l2_dispatch_rounds: 8`이고,
전자의 정본은 `.claude/state/review-rounds/archive/`의 파일 수, 후자의 정본은
append-only dispatch log의 항목 수다. 원장은 세 번 리셋됐으므로 원장 값은 라운드 수가
아니다.

## 다음

M3(release-runbook)이 `docs/release-channel.md`를 소유하고 이 문서를 링크한다. 릴리스
컷·롤백은 그쪽 축이며 M2는 배포 좌표를 하나도 움직이지 않았다.
