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
