# dogfood-install — main 본문을 로컬에서 여는 절차

M1이 배포 채널을 `release`로 옮기면서 **main을 실제로 써 보는 경로가 함께 사라졌다.**
그 전에는 `.claude-plugin/marketplace.json`의 plugin `source`가 상대 경로였으므로 저장소를
로컬 marketplace로 등록하면 그 트리의 본문이 그대로 열렸지만, 지금 같은 등록은
`git-subdir` + `ref: release`를 해소해 **GitHub의 릴리스 커밋**을 가져온다. 이 문서는 그
dogfood 표면을 릴리스 채널을 건드리지 않고 되돌려 놓는다.

이 문서가 소유하는 것은 **절차와 하나의 금지**다. 릴리스 컷과 롤백은 이 문서가 다루지
않는다 — `docs/release-channel.md`(M3 소유)가 그 축을 갖는다.

## 절차

### 1. worktree를 준비한다

저장소 관례대로 `.worktrees/` 하위에 만든다(CLAUDE.md §3.8). sibling 디렉토리는
`.gitignore` 보호 밖이라 쓰지 않는다.

```bash
git worktree add .worktrees/<name> <branch>
```

### 2. 채널을 재울 필요는 없다

설치된 `mccp@mccp`(release 채널)를 끄지 않아도 된다. CLI가 plugin **이름** 수준에서
`--plugin-dir` 쪽을 우선하기 때문이다. 실측에서 CLI는 두 `hooks.json`을 모두 읽은 뒤

```
Plugin "mccp" from --plugin-dir overrides installed version
```

을 남기고 hook을 한 번만 등록했다 — `Registered 32 hooks from 2 plugins`이고, 그 32는
worktree mccp의 29개와 codex의 3개다. 설치된 사본의 hook은 등록되지 않는다.

명시적으로 재우고 싶으면 프로젝트 범위로만 끈다. 이것은 **필수 단계가 아니다.**

```bash
claude plugin disable mccp@mccp --scope project
```

이 명령은 그 프로젝트의 `.claude/settings.json`에 `{"enabledPlugins": {"mccp@mccp": false}}`를
쓴다. 사용자 전역 `settings.json`은 바뀌지 않는다(실측). 끈 상태에서도 위 override 동작과
로드 결과는 같았다.

### 3. 세션을 띄운다

```bash
cd <다른-프로젝트>
claude --plugin-dir <worktree>/plugins/mccp
```

플래그는 반복 가능하고, 인자는 디렉토리 또는 `.zip`이다.

### 4. worktree 본문이 열렸는지 확인한다

두 가지를 본다.

- **`CLAUDE_PLUGIN_ROOT`가 worktree를 가리킨다.** 실측값은 `<worktree>/plugins/mccp`였고
  캐시 경로가 아니었다. 이 값이 캐시를 가리키면 기제가 무의미하다 — 본문이 캐시에서 왔다는
  뜻이다.
- **표면이 전부 로드된다.** 실측에서 명령 22 · 에이전트 58 · skill 47 · hook 29가 전부
  worktree 경로에서 로드됐다. hook이 빠지면 "main을 시험한다"가 성립하지 않는다 — mccp의
  게이트가 SessionStart·Stop·PreCompact hook 위에 있기 때문이다.

디버그 로그로 직접 보려면:

```bash
claude -p "ping" --debug-file dbg.log --plugin-dir <worktree>/plugins/mccp
grep -E 'overrides installed|from plugin mccp|Registered .* hooks' dbg.log
```

## 캐시를 직접 고치는 것은 금지다

`~/.claude/plugins/cache/mccp/mccp/<version>/`에 파일을 복사해 넣지 않는다. 캐시
디렉토리는 **version으로 키가 잡히므로** 내용만 바꾸면 `installed_plugins.json`의
`version`·`gitCommitSha`가 디스크 내용과 어긋난 거짓이 된다. 그 상태에서
`claude plugin update`는 무엇을 고쳐야 할지 모른다.

위 절차는 그 복사를 대체한다. 실측에서 `--plugin-dir` 실행은 설치 상태를 한 바이트도
바꾸지 않았다 — `installed_plugins.json`의 sha256이 실행 전후 동일했고
`~/.claude/plugins/cache/mccp/mccp/` 하위에 새 디렉토리가 0개 생겼다.

CLAUDE.md §3.7이 "cache 직접 copy 같은 bootstrap workaround가 매 cycle 반복됨"이라고 적은
것은 M2 이전의 관측이다. 그 workaround는 은퇴했다.

## 어느 채널에 있어야 하는가

**기본은 모든 프로젝트에서 `release`다.** main을 시험하려는 프로젝트만 위 절차로
**세션 단위 opt-in**한다.

안정과 검증 표면을 둘 다 갖는 방법은 "어느 한쪽에 상주"가 아니다. `--plugin-dir`가
세션 한정인 것이 설계이므로, 상주 설치는 릴리스에 두고 시험은 플래그로 그때그때 여는
것이 두 요구를 동시에 만족시키는 유일한 배치다.

## 배선 마일스톤의 라이브 acceptance는 이 경로 아래에서만 성립한다

> review-record-linkage M5 (Task 9). 이 절은 편의 안내가 아니라 **acceptance 절차**다.

`${CLAUDE_PLUGIN_ROOT}`가 설치 캐시를 가리키는 한, in-flight 브랜치의 명령 본문은
**실행되지 않는다.** `marketplace.json`의 plugin source가 `ref: release`이므로
`claude plugin update`로도 그 격차는 좁혀지지 않는다 — 캐시가 뒤처지는 것은 사고가
아니라 릴리스 채널 분리 이후의 **항구적 기본 상태**다.

그 결과가 이 저장소에서 두 번 실측됐다. review-record-linkage M3·M4는 링크 배선을
전부 구현하고 게이트를 완주했는데, 그 사이클들이 **자기 ship receipt에** 링크 필드를
남기지 못했다 — 게이트가 실행한 본문이 그 배선을 모르는 판본의 것이었기 때문이다.
단위 test는 전부 green이었다. 즉 **test 통과는 배선이 발화했다는 증거가 아니다.**

따라서:

- **라이브 실값을 acceptance로 갖는 마일스톤은 `--plugin-dir` 아래에서 완주해야 한다.**
  그 밖의 경로에서 얻은 `0`은 결함의 증거가 아니라 **측정하지 않았다는 뜻**이다.
- **보고서가 어느 경로에서 완주했는지 명시해야 한다.** 명시가 없으면 그 사이클의 라이브
  수치는 해석 불가다.
- **완주 전후로 `installed_plugins.json`의 sha256이 불변임을 확인한다.** 이 절차는 설치
  상태를 바꾸지 않는 것이 계약이다(아래 "캐시를 직접 고치는 것은 금지다" 참조).

### 링크를 봉인하는 마일스톤은 ship 이 아니라 **plan 게이트부터** 이 경로여야 한다

> review-record-linkage M7. 위 세 항목은 ship 만 말하는데, 그것으로는 부족하다.

ship receipt 의 링크 필드에는 **재생성 분기가 없다.** `finalize-receipt.js:308-318` 이
상류 `mccp-plan-codex` receipt 의 `meta.review_record_path` 를 읽어 그대로 forward 하고,
`:321-330` 이 그 receipt 의 `resolution.review_source` 로 `plan_review_expected` 를
파생한다. 즉 **carry-forward 가 유일 경로**다. 그리고 그 필드를 애초에 찍는 것은
`commands/plan.md` 이다.

그래서 ship 만 `--plugin-dir` 아래에서 돌리면 **carry-forward 할 값이 없다.** 실측:
캐시 판본 `1.33.6` 의 `commands/plan.md` 에는 `review-record-path` 가 **0 건**이고
(워크트리 본문에는 실재한다), 같은 캐시의 `commands/pr.md` 에는 back-patch 블록이
**0 건**이다. 그 조합에서 ship 은 정상 종료하면서 링크만 미봉인으로 남는다 — 결함처럼
보이지 않는 결손이다.

따라서 **plan 게이트도 같은 세션에서 돈다.** 그리고 이 순서는 되돌릴 수 없다:
`plan-review/cli.js` 의 `emit-workflow-args` 가 라운드 원장을 읽어 초과 호출을 거부하고
(`MCCP_GATE_ROUND_CAP`, `review-single-pass.js` 의 `MAX_ROUND_CAP=3` 상한), 한 결정
슬러그의 예산이 소진되면 그 슬러그로는 캡을 올려도 라운드가 열리지 않는다. "ship 을
먼저 돌려 보고 안 되면 plan 을 다시 돌린다" 는 경로가 **존재하지 않는다** — 그때는
새 결정 슬러그가 유일한 남은 수단이고, 그것은 브랜치 이름·plan 파일명·receipt 파일명이
함께 움직이는 일이라 사이클 중간에 치를 비용이 아니다.

확인:

```bash
# 상류 plan receipt 가 필드를 실제로 봉인했는가 (파일명을 가정하지 말고 훑는다)
node -e 'const fs=require("fs"),d=".claude/receipts/mccp-plan-codex";
for (const f of fs.readdirSync(d)) { const r=JSON.parse(fs.readFileSync(d+"/"+f,"utf8"));
  console.log(f, r.meta.review_record_path, r.resolution && r.resolution.review_source); }'

# ship 이 그것을 물려받아 네 사실을 자기가 충족하는가 (exit 0 만이 통과다)
node plugins/mccp/scripts/lib/linkage-audit.js --check-live-linkage --decision <slug>
```

두 번째 명령의 종료코드 셋(1 violations · 2 degraded · 3 unresolved)은 **전부 미통과**다.
특히 `3` 은 결함이 아니라 "판정할 대상이 HEAD 트리에 없다" 이고, ship 이 아직
커밋되지 않은 정상적인 진행 중 상태가 여기 해당한다.

지금 어느 판본이 실행 중인지는 추측하지 말고 물어라:

```bash
node plugins/mccp/scripts/lib/dep-check.js          # `install skew` 행
node plugins/mccp/scripts/lib/install-skew.js       # 판정 JSON 원문
```

`state`가 `behind`/`diverged`면 이 저장소의 브랜치 본문은 실행되고 있지 않다.
`[plugin-dir override]`가 붙으면 이 절차가 적용된 상태이고, 그때 `state`는
override 디렉토리의 HEAD 기준으로 다시 판정된다 — override 라고 침묵하지 않는다.
낡은 sibling 워크트리를 `--plugin-dir`로 가리키는 것이 바로 그 판정이 잡아야 할
상태이기 때문이다.

## 한계

측정하지 못한 것과 이 절차가 닫지 않는 것을 함께 적는다.

- **매 실행에 플래그가 필요하다.** `--plugin-dir`에 대응하는 환경변수나 settings 키는
  없다. 세션 한정이 설계다.
- **`--bare`가 이 플래그를 무력화한다.** `--bare`는 hook·LSP·plugin을 건너뛰는 최소 모드이고
  그 무력화 대상 목록에 `--plugin-dir`가 명시돼 있다.
- **`strictKnownMarketplaces`를 쓰는 환경에서는 관리자 설정이 이 경로를 차단할 수 있다.**
  이 저장소의 측정 환경은 그 설정을 쓰지 않으므로 차단 동작 자체는 관측하지 못했다.
- **측정된 OS는 하나다** — Windows 11, `claude` 2.1.259. 다른 OS·다른 CLI 버전은
  측정하지 못했다.
- **override는 plugin 이름 수준에서 관측됐다.** CLI가 남긴 문구가 plugin을 이름으로
  지목한다. 이름이 다른 사본이 공존할 때의 동작은 측정하지 못했다.
- **hook 모듈이 세션당 두 번 로드된다.** 이것은 이 절차의 부작용이 아니라 mccp 자신의
  `run-with-flags.js`가 갖는 선재 동작이며, CLI를 거치지 않은 직접 호출에서도 같게
  재현된다. `.claude/plans/codex-findings-backlog.md`에 적재했다.

## 이 문서가 다루지 않는 것

릴리스 컷, 롤백, `release` ref의 이동 — 전부 M3 소유이고 `docs/release-channel.md`가
그 축을 갖는다. 이 문서는 배포 좌표를 하나도 움직이지 않는다.
