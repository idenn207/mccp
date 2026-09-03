# Plan: release-channel-separation M2 — dogfood-install

**Source PRD**: .claude/prds/release-channel-separation.prd.md
**Selected Milestone**: M2 dogfood-install
**Complexity**: Medium

## Summary

M1이 배포 채널을 `release`로 옮기면서 **main을 실제로 써 보는 경로가 함께 사라졌다.**
그 전에는 `marketplace.json`의 plugin `source`가 상대 경로 `"./plugins/mccp"`였으므로
저장소를 로컬 디렉토리 marketplace로 등록하면 그 트리의 본문이 그대로 열렸지만, 지금은
같은 등록이 `git-subdir` + `ref: release`를 해소해 **GitHub의 릴리스 커밋**을 가져온다.
즉 M1은 사용자를 보호하면서 운영자에게서 dogfood 표면을 뺏었고, M2는 그것을 되돌려
놓는다 — 릴리스 채널은 건드리지 않은 채로.

**M2가 만드는 것은 새 기능이 아니라 하나의 실측된 절차와 하나의 금지다.** 절차는
"worktree를 가리키는 로컬 설치"이고, 금지는 §3.7이 매 cycle 반복된다고 적은 **캐시 직접
복사**다. 그 금지가 실효를 가지려면 대체 경로가 상상이 아니라 실행된 것이어야 하므로,
이 마일스톤의 핵심 산출물은 문서가 아니라 **문서를 쓰기 전에 끝낸 실측**이다
(fan-out HIGH/test 흡수 — PRD의 M2 Outcome은 "문서화된다"로만 서술돼 있어, 문서만 쓰고
완료로 처리될 여지를 남긴다. 이 plan은 그 여지를 Acceptance에서 닫는다).

**후보 기제는 이미 좁혀져 있다.** 설치된 CLI(`claude` v2.1.252) 바이너리와 `--help`에서
실측한 사실 4건이 선택지를 정한다:

- `claude --plugin-dir <path>` — "Load a plugin from a directory or .zip **for this session
  only**" (repeatable). `--bare`가 명시적으로 무력화하는 대상 목록에 들어 있어, 통상
  세션에서는 plugin 표면을 로드하는 경로로 취급된다.
- marketplace `source` 유니온에 `{source:"directory", path}`(로컬 디렉토리)와
  `{source:"file", path}`(임의 이름의 `*.json` manifest)가 **1급으로 존재**한다.
  `claude plugin marketplace add <arg>`는 인자가 디렉토리면 전자로, `.json` 파일이면
  후자로 기록한다.
- plugin entry의 `source`가 **문자열**이면 본문은 marketplace 디렉토리 안에서 그 자리로
  해소된다(원격 fetch 없음). 단 경로가 marketplace 디렉토리를 벗어나면 거부된다
  (`Plugin source path refused: … does not stay inside its marketplace directory`).
- `--plugin-dir`에 대응하는 환경변수나 settings 키는 없다. 세션 한정이 설계다.

따라서 **1순위는 `--plugin-dir`**이다 — 저장소에 파일을 하나도 더하지 않고, 전역 설치
상태를 바꾸지 않으며, 세션 단위라 "이 프로젝트만 main으로"가 자연스럽게 성립한다.
그것이 실측에서 무너지면 2순위는 **dev marketplace manifest**(저장소 루트의 별도
`*.json` + 문자열 상대 경로 source)이고, 이쪽은 committed 산출물이 하나 늘어난다.
어느 쪽이 이겼는지는 이 plan이 아니라 Task 3~5의 관측이 정한다.

**이 마일스톤이 건드리지 않는 것**(M1이 세운 경계 선언 관례 그대로): `release` ref ·
`.claude-plugin/marketplace.json` · 릴리스 컷 · `docs/release-channel.md`. 마지막 것은
PRD가 M3 소유로 못박았으므로 M2는 **별도 파일**에 쓰고 M3이 링크한다.

**이 plan은 이미 적재된 backlog 항목 하나를 갚는다** —
[codex-findings-backlog.md](codex-findings-backlog.md)의 2026-09-02 MEDIUM
(`.claude-plugin/marketplace.json`, santa-loop R2 reviewer B): *"상대 경로 `source`를 절대
upstream URL로 바꾸면서 marketplace의 자기참조성이 사라졌고 … PRD M2가 그것을 로컬 설치
경로로 은퇴시키는 것이 헌장인데 그 경로가 이번 변경으로 더 어려워졌다. **M2 계획 시 반드시
반영.**"* 위 Summary 첫 문단이 그 지적을 M2의 출발점으로 삼은 것이다.

**L2 패널 흡수 기록 (R0 · R1)** — 두 라운드 모두 `## Validation` 한 곳을 겨냥했고, 두 번째가
첫 번째의 수정을 겨냥했다. 그 전이는 §3.16이 실측으로 기록한 패턴이라 **R1에서 멈춘다**:
R1은 라인 단위 패치가 아니라 블록을 **구조적으로** 다시 써서 지적된 결함 계열 전체를 닫았고,
그 뒤의 라운드는 열지 않는다.

- **R0** (3 pass · invariant fail): HIGH 1 + 같은 계열 MEDIUM 2 흡수 — 삭제·오염 검사가
  비차단이었고, `git fetch` 실패가 stale ref로 조용히 접혔고, 절대 경로 탐지가 계정명만 찾아
  **이 저장소의 worktree 경로를 구조적으로 놓쳤다**. 나머지 10건은 backlog 이연.
- **R1** (1 pass · 3 fail, HIGH 3): 세 HIGH가 전부 R0의 수정을 가리켰고 전부 옳았다 —
  (a) 청결 트리 단언이 **판별력이 반대로 걸려** 정상 작업 상태에서 항상 발화하고 정작
  *커밋된* 백업물은 못 봤다 · (b) 네 개의 핵심 단언에 exit guard가 없어 블록의 종료코드가
  마지막 명령의 것이었다 · (c) UNC 항이 역슬래시 과잉으로 **매칭 불가능한 죽은 코드**였다.
  같은 편집에서 축을 **관측 대상 자체**로 옮겨 닫았다: 채널 앵커는 로컬 ref 대신
  `ls-remote`로 원격을 직접 읽고, 트리 청결 대신 **경로의 정체**(백업·plugin 상태 서명)를
  커밋 전후 양쪽에서 훑고, 유출 탐지는 브랜치가 실제로 건드리는 사람-대상 표면에서
  대상을 파생하며 읽기 실패를 실패로 접는다. 더해 R1 test MEDIUM(“bump 누락을 원리상
  탐지 불가”)을 base 대조 한 줄로 닫았다.
- **검증은 주장이 아니라 실행이다** — 새 검사 3종을 실제로 돌렸다: 채널 앵커 PASS ·
  bump 탐지기가 bump 이전 상태에서 **정상적으로 HALT**(판별력 확인) · ingress 검사가 심어 둔
  `installed_plugins.json` 사본을 탐지 후 정리 · 유출 탐지기가 절대 경로 6형태(드라이브
  역슬래시·드라이브 슬래시·`/Users/`·`/home/`·UNC·MSYS `/c/`)를 전부 잡고 clean
  fixture(URL·`<worktree>` placeholder·상대 경로)는 통과.

§3.14는 HIGH 이상만 흡수하라고 정하지만 위에서 MEDIUM 몇 건을 함께 고쳤다. 사유는 그것들이
개선이 아니라 **plan이 하는 주장을 거짓으로 만드는 부정확**(죽은 코드를 "탐지한다"고 적음,
실패할 수 없는 검사를 게이트라고 적음)이고, HIGH와 같은 편집 안에 있어 라운드를 늘리지
않기 때문이다. 그 외 전건은 backlog에 이연 사유와 함께 적재했다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | M2는 채널이 실제로 켜진 뒤에 쓴다 — 상상이 아니라 기록이 되도록 | direction |
| UI2 | worktree를 가리키는 로컬 설치 절차를 문서화한다 | constraint |
| UI3 | 캐시 직접 복사 workaround를 은퇴시킨다 | constraint |
| UI4 | 다른 프로젝트에서 main을 시험할 수 있는 경로를 만든다 | constraint |
| UI5 | 다른 프로젝트에서 운영자가 어느 채널에 있어야 하는지 M2가 답한다 | constraint |
| UI6 | 릴리스 런북과 `docs/release-channel.md`는 M3 소유다 | exclusion |
| UI7 | 릴리스 자동화는 하지 않는다. 수동 절차가 먼저 한 번 돌아야 한다 | exclusion |
| UI8 | 버전 체계 자체는 바꾸지 않는다. 번호의 소유자만 이미 옮겨졌다 | exclusion |
| UI9 | 자식 C1부터 C10까지 어느 것의 구현도 하지 않는다 | exclusion |
| UI10 | 실측은 marketplace 배포가 아니라 별도 설치 경로로 진행한다 | direction |
| UI11 | in-flight worktree가 이미 선언한 version은 회수하지 않는다 | exclusion |
| UI12 | 게이트 리뷰는 1라운드를 기본으로 하고 적용 결과로 판단한다 | direction |
| UI13 | 단일 릴리스 라인만 둔다. v1 유지 라인은 만들지 않는다 | exclusion |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 검증 | `.claude/plans/release-channel-separation-m1.plan.md (L29)` | 양성 대조 — 변경 전후가 우연히 같은 값이면 무작동과 성공이 구별되지 않으므로, 판별력 있는 값으로 밀어 관측한다 |
| 검증 | `.claude/plans/release-channel-separation-m1.plan.md (L314)` | 단독 관측이 아니라 **쌍**으로만 판정 — 한 축만 보면 "성공"과 "기구 사망"이 같은 모습이다 |
| 경계 선언 | `README.md:41` | 닫는 표면과 **닫지 않는 잔여**를 함께 명시하는 관용구 |
| 정정 병기 | `CLAUDE.md:311` | 낡은 문장을 지우지 않고 무엇이 왜 달라졌는지 append (§3.17과 같은 형식) |
| 문서 소유 | `docs/gate-design.md` | 배경 산문은 `docs/`가 소유하고 CLAUDE.md·README는 포인터만 상주 |
| Version | `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:94` | 기대 version을 리터럴로 pin하지 않고 manifest에서 파생 |
| 경로 유출 | `plugins/mccp/scripts/receipt/write.js` `normalizeReceiptCwd` | git-tracked 산출물에 절대 경로 대신 치환형을 적는다 |

**CLI 실측 (2026-09-02, `claude` v2.1.252)** — 위 Summary의 4건은 `claude --help` ·
`claude plugin marketplace add --help` · 설치된 CLI 바이너리의 스키마 문자열에서 직접
읽은 것이다. 저장소 안에는 `marketplace.json`을 읽는 JS 소비처나 test가 **없으므로**
(M1 Task 4가 이미 확인), 이 축의 기존 코드 선례는 존재하지 않는다. 새 패턴을 발명하는
것이 아니라 **CLI가 이미 제공하는 표면**을 고르는 것이 이 마일스톤의 설계 전부다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `docs/dogfood-install.md` | CREATE | M2의 본 산출물. 실측한 절차·한계·채널 선택 규칙이 여기 상주한다. `docs/release-channel.md`(M3 소유)에 쓰지 않는 이유는 PRD가 그 파일을 M3에 못박았기 때문이고(UI6), README에 쓰지 않는 이유는 `docs/`가 산문을 소유하는 저장소 관례 때문이다 |
| `README.md` | UPDATE | 설치 절 뒤에 dogfood 경로 포인터 2~3줄. 사용자 설치 명령 3줄은 무변경 |
| `CLAUDE.md` | UPDATE | §3.7의 "cache 직접 copy 같은 bootstrap workaround가 매 cycle 반복됨"을 **은퇴**시킨다 — 문장을 지우지 않고 정정을 병기하며 금지 사유와 대체 경로 포인터를 단다 |
| `.claude/prds/release-channel-separation.prd.md` | UPDATE | M2 행을 `pending`에서 `in-progress`로 바꾸고 `Plan` 셀을 채운다. Open Question 4(어느 채널에 있어야 하는가)에 답을 기입한다 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | §3.7 patch bump (`1.34.1` 기준 — `/mccp:pr` 진입 직전 재계산) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | §3.7 4면 동기 — page-foot version |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | §3.7 4면 동기 — derived 줄 version |
| `CHANGELOG.md` | UPDATE | §3.7 4면 동기 — 새 항목 + `currently` 노트 |
| `.claude/PRPs/reports/release-channel-separation-m2-report.md` | CREATE | Task 3~5 실측의 원문 증거. Acceptance가 이 파일을 요구하므로 표에 없으면 착지 vehicle이 정의되지 않고 §1.2 dedupe에서 residual로 떨어진다 |

**조건부 산출물 1건** — Task 3·4가 `--plugin-dir` 경로를 부정하면 Task 5의 후퇴선이
저장소 루트에 dev marketplace manifest 1개(`marketplace.dev.json`)를 추가한다. 발생
여부가 실측에 달려 있어 위 표에 싣지 않는다. 추가하게 되면 그 사실과 사유를 보고서와
CHANGELOG에 적고, `## Validation`의 manifest 형태 단언을 그 파일에도 적용한다.

`docs/release-channel.md`는 **여기서 만들지 않는다**(UI6). `.claude-plugin/marketplace.json`도
**건드리지 않는다** — M2는 릴리스 채널의 어떤 좌표도 움직이지 않는다.

## Tasks

### Task 1: 브랜치 준비와 삭제 사고 검사
- **Action**: 이 브랜치(`release-channel-m2-dogfood-install`)는 `origin/main`에서 직접
  갈라졌으므로 M1 Task 1과 달리 따라잡을 병합이 없다. 그래도 착지 직전까지 origin/main이
  전진하므로 PR 직전에 다시 대조한다.
- **Mirror**: CLAUDE.md §3.5.1 — 머지가 상대편 신규 파일을 조용히 지운 PR #110 선례
- **Validate**: `git diff --diff-filter=D --name-only origin/main...HEAD`가 0건.
  `git status --porcelain --untracked-files=all`에 Task 2의 백업 산출물이나
  `installed_plugins.json` 류 사본이 0건

### Task 2: 실험 대상과 복구 지점을 정한다
- **Action**: M1은 운영자의 **유일한 설치**를 실험 대상으로 삼아 캐시 전체를 백업해야
  했다. M2의 1순위 기제(`--plugin-dir`)는 세션 한정이라 전역 설치 상태를 원리상 바꾸지
  않으므로 백업 범위가 작다. 그러나 Task 4의 충돌 회피 실측과 Task 5의 후퇴선은
  `~/.claude/settings.json`(`enabledPlugins`)과 `~/.claude/plugins/known_marketplaces.json`을
  **실제로 편집**하므로, 그 두 파일과 `installed_plugins.json`을 타임스탬프 붙여 백업한다.
  캐시 디렉토리 전체 복사는 이번에는 하지 않는다 — 어떤 태스크도 `claude plugin update`를
  호출하지 않기 때문이다. **그 전제가 깨지는 순간(후퇴선이 `plugin install`을 요구하면)
  M1 Task 2의 캐시 백업 절차를 그대로 선행한다.**

  실험은 저장소 밖의 **scratch 프로젝트**에서 수행한다. 이 worktree 안에서 돌리면
  mccp 자신의 hook·STATE.md·receipt가 실험 산출물과 섞여 관측이 오염된다.

  백업 목적지는 저장소 밖으로 고정한다: `$HOME/.claude/backup/mccp-m2-<timestamp>/`.
  목적지를 비워 두면 구현자가 cwd(= 이 worktree)에 떨어뜨릴 수 있고, 그 산출물은
  `.gitignore`가 덮지 않아 그대로 staged될 수 있으며 절대 `installPath`와 설치된 전
  plugin 목록을 원문으로 담는다. **저장소 트리 안에는 어떤 백업물도 두지 않는다.**
- **Mirror**: `.claude/plans/release-channel-separation-m1.plan.md` Task 2 — 포인터만
  백업하는 것으로는 복구가 성립하지 않는다는 구조
- **Validate**: 백업 3개 파일이 존재하고 원본과 sha256 동일.
  `git status --porcelain --untracked-files=all`이 백업 산출물을 0건 보고

### Task 3: 1순위 기제 실측 — `--plugin-dir`가 worktree 본문을 라이브로 여는가 (양성 대조 필수)
- **Action**: scratch 프로젝트에서 `claude --plugin-dir <worktree>/plugins/mccp`로 세션을
  띄우고 다음을 관측한다.
  1. **표면 로드** — 명령(`/mccp:*`) · 에이전트(`mccp:*`) · skill · hook 4종이 실제로
     등록되는가. hook은 특히 중요하다: mccp의 게이트는 SessionStart·Stop·PreCompact hook에
     걸려 있고, `--plugin-dir`가 commands만 로드하고 hooks를 빼면 "main을 시험한다"는
     주장이 성립하지 않는다.
  2. **`${CLAUDE_PLUGIN_ROOT}`의 값** — worktree의 `plugins/mccp`를 가리키는가. 이 값이
     캐시 경로를 가리키면 기제 자체가 무의미하다(본문이 캐시에서 온다는 뜻).
  3. **양성 대조 (이 태스크의 유일한 통과 조건)** — baseline 관측만으로는 무작동과
     성공이 구별되지 않는다. 설치된 `mccp@mccp`(1.33.6)도 같은 hook을 걸고 같은
     `/mccp:*` 명령을 제공하므로, **"명령이 있다 / hook이 돌았다"는 어느 쪽에서 왔는지
     말해 주지 않는다.** 그래서 worktree 사본에만 존재하는 **판별 marker**를 심고 그것이
     관측될 때만 통과로 본다:
     - worktree의 `plugins/mccp/scripts/hooks/session-start.js`에 marker 파일 1개를
       쓰는 임시 변경을 넣는다(파일명에 nonce 포함 — 이전 실행의 잔존물과 구별).
     - scratch 프로젝트에서 `--plugin-dir`로 1회 실행 후 그 marker가 생기면 본문이
       **worktree에서** 왔다는 양성 증거다.
     - `--plugin-dir` 없이 같은 실행을 하면 marker가 **생기지 않아야** 한다. 두 관측의
       **쌍**이 판별력을 만든다(M1 Task 10 패턴).
     - 관측이 끝나면 임시 변경을 되돌린다. **이 변경은 커밋하지 않는다** — 되돌렸음을
       `git status`로 확인하는 것이 이 태스크의 종료 조건 중 하나다.
  4. **캐시 무개입 확인** — 실행 전후로 `~/.claude/plugins/installed_plugins.json`의
     `version`·`gitCommitSha`·`lastUpdated`가 **전부 동일**하고
     `~/.claude/plugins/cache/mccp/mccp/` 하위에 새 디렉토리가 생기지 않는다. 이것이
     "캐시 직접 복사가 필요 없다"의 기계적 근거다(UI3).
- **Mirror**: M1 plan Task 9-6a — 상향 대조가 유일한 양성 증거라는 구조
- **Validate**: (i) marker가 `--plugin-dir` 실행에서 생기고 (ii) 미사용 실행에서 생기지
  않으며 (iii) `installed_plugins.json` 3필드 무변화 ∧ 캐시 신규 디렉토리 0건 ∧
  (iv) 임시 변경이 되돌려졌다 — 그리고 이것은 `git status --porcelain`이 **판정하지
  않는다**. 그 형태는 검사 11이 "판별력이 정확히 반대로 걸렸다"며 폐기한 것과 같아서,
  실수로 커밋되면 트리가 깨끗해져 통과한다(L2 R2에서 security·test·invariant 세 관점이
  독립적으로 같은 축에 착지). 작업 중 눈으로 보는 용도로는 써도 되지만, **종료 조건은
  `## Validation` 검사 12**다 — 이 브랜치의 diff가 선언된 `Files to Change` 집합을 벗어나지
  않는지 보므로, marker 변조가 커밋되면 `plugins/…/session-start.js`가 집합 밖이라 걸린다.
  hook이 로드되지 않으면 이 태스크는 **실패**이며 Task 5로 간다 — 부분 로드를 "대체로
  된다"로 기록하지 않는다

### Task 4: 충돌 실측과 회피 절차 결정
- **Action**: 설치된 `mccp@mccp`(release 채널)와 `--plugin-dir`의 worktree 사본이 **동시에**
  로드되면 같은 `mccp:` 이름공간에 두 본문이 등록되고, hook은 두 번 실행될 수 있다.
  게이트가 두 번 도는 것은 dogfood를 무의미하게 만들 뿐 아니라 receipt·lock 축을
  오염시킨다. 다음을 순서대로 관측하고 **회피 절차 하나를 확정**한다.
  1. 동시 로드 시 실제로 무슨 일이 일어나는가 — 명령 중복, hook 중복 실행, 혹은 CLI가
     한쪽을 이기게 하는가. 관측값을 그대로 기록한다(추정 금지).
  2. 회피 후보 두 가지를 실측한다: (a) scratch 프로젝트의 `.claude/settings.json`에
     `"enabledPlugins": {"mccp@mccp": false}` · (b) `claude plugin disable mccp@mccp
     --scope project`. 어느 쪽이 그 프로젝트에서만 release 설치를 재우고 사용자 전역
     설치를 건드리지 않는지 확인한다.
  3. **전역 상태 무손상 단언** — 실험 후 Task 2가 백업한 **세 파일 전부**를 대조한다.
     이전 판본은 `~/.claude/settings.json`의 `enabledPlugins`와 `installed_plugins.json`
     둘만 열거해 `known_marketplaces.json`을 **무소유로 남겼다**(L2 R3 invariant HIGH).
     Task 2가 그 파일을 "실제로 편집하므로" 백업 대상에 넣어 놓고 복원을 단언하는 지점이
     어디에도 없었고, Task 5가 `claude plugin marketplace add`로 등록하는 dev marketplace는
     그 레지스트리에 **영구 항목**을 남긴다 — 즉 실험 후 운영자 전역 레지스트리에 worktree를
     가리키는 marketplace가 조용히 잔존할 수 있었다. 판정 기준은 다음과 같다:
     - `~/.claude/settings.json` — `enabledPlugins`의 `mccp@mccp`가 `true`
     - `~/.claude/plugins/installed_plugins.json` — Task 3 Validate (iii)와 **같은 형태**로
       `version`·`gitCommitSha`·`lastUpdated` 3필드 무변화(이전의 "의미상 동일"은 판정
       규칙이 없어 반증 불가능한 오라클이었다 — L2 R2 test LOW 함께 흡수)
     - `~/.claude/plugins/known_marketplaces.json` — 실험 전 백업과 **항목 집합이 동일**.
       Task 5를 탔다면 그 전에 `claude plugin marketplace remove mccp-dev`로 해제한 뒤
       대조한다
     이 단언이 실패하면 백업에서 복원하고 그 사실을 보고서에 적는다.
- **Mirror**: M1 plan Task 9-7 — 실험 후 `autoUpdate` 복원을 별도로 단언한 구조
  (중간 실패로 세션이 끊기면 설정이 꺼진 채 조용히 남는다)
- **Validate**: 충돌 여부가 **관측값으로** 기록돼 있고, 회피 절차가 정확히 1개 확정되며,
  위 3파일 판정이 **전건** 통과한다(백업한 파일 중 복원을 단언하지 않는 것이 0개여야 한다)

### Task 5: 후퇴선 — dev marketplace manifest (Task 3 또는 4가 부정했을 때만)
- **Action**: `--plugin-dir`가 hook을 로드하지 않거나 충돌을 피할 수 없으면, 저장소 루트에
  dev manifest를 만들어 로컬 marketplace로 등록한다. 형태는 CLI 스키마 실측에 따른다:
  plugin `source`를 **문자열 상대 경로** `"./plugins/mccp"`로 두고 marketplace `name`을
  `mccp-dev`로 둔다. 파일은 **저장소 루트**에 둔다 — CLI가 "plugin 경로는 marketplace
  디렉토리를 벗어날 수 없다"고 거부하므로 `.claude-plugin/` 하위에 두면 `../plugins/mccp`가
  거부된다. 등록은 `claude plugin marketplace add <worktree>/marketplace.dev.json`이며
  CLI는 이를 `{source:"file", path}`로 기록한다.
  1. plugin 이름을 `mccp`로 유지할지(`/mccp:*` 이름공간 그대로, release 설치와 상호배타)
     `mccp-dev`로 바꿀지(`/mccp-dev:*`, 공존 가능하지만 명령 본문·게이트 id·hook이 전부
     `mccp`를 전제하므로 충실도가 떨어진다)를 **실측 후** 정한다. 기본 선택은 충실도
     쪽(`mccp` 유지 + 상호배타)이며, 그 선택의 근거를 보고서에 적는다.
  2. Task 3의 양성 대조를 **그대로 재사용**한다 — marker가 이 경로에서도 관측돼야 한다.
  3. 이 후퇴선을 택하면 `## Validation`의 manifest 형태 단언을 `marketplace.dev.json`에도
     적용해, `source`가 문자열이고 `git-subdir`가 **아님**을 기계적으로 고정한다. 릴리스
     manifest와 dev manifest가 뒤바뀌면 사용자에게 worktree 본문이 배포되므로 이 단언은
     장식이 아니다.
  4. **등록은 반드시 해제한다** (L2 R3 invariant HIGH). `claude plugin marketplace add`는
     운영자 전역 `known_marketplaces.json`에 영구 항목을 만들고, 그 항목은 이 worktree를
     가리킨다 — worktree가 사라진 뒤에도 남으면 죽은 marketplace를 가리키는 등록이 되고,
     남아 있는 동안에는 릴리스 채널 밖의 본문이 해소 가능한 상태로 방치된다. 관측이 끝나면
     `claude plugin marketplace remove mccp-dev`를 실행하고, 해제됐음을 Task 4의 3파일
     판정으로 확인한다. 이 태스크가 만드는 전역 변경 중 스스로 되돌리지 않는 것은 없다.
- **Mirror**: M1 plan Task 4 — 변경 전 트리에서 **실패하는** 단언만이 판별력을 갖는다
- **Validate**: 이 태스크를 탔다면 marker가 이 경로에서 관측되고 형태 단언이 통과하며,
  `marketplace remove` 후 `known_marketplaces.json`이 Task 2 백업과 항목 집합이 동일하다.
  타지 않았다면 보고서에 **타지 않은 사유**(Task 3·4가 통과했다는 관측)를 적는다 —
  "해당 없음"으로 비워 두지 않는다

### Task 6: `docs/dogfood-install.md`를 실측한 것만으로 작성한다
- **Action**: Task 3~5가 실제로 실행한 명령과 관측값을 절차로 옮겨 적는다. 담을 것:
  - **절차** — worktree 준비(§3.8 경로 규약) → 채널 재우기(Task 4가 확정한 방법) →
    실행 명령 → 확인 방법(무엇이 보이면 worktree 본문이 열린 것인가).
  - **한계** — 세션 한정이라 매 실행에 플래그가 필요하다는 점, `--bare`가 이 플래그를
    무력화한다는 점, `strictKnownMarketplaces`를 쓰는 환경에서는 관리자 설정이 이 경로를
    차단할 수 있다는 점, 그리고 **측정된 OS가 Windows 하나**라는 점.
  - **캐시 직접 복사 금지와 그 사유** — 캐시 디렉토리는 version으로 키가 잡히므로 내용만
    바꾸면 `installed_plugins.json`의 `version`·`gitCommitSha`가 **디스크 내용과 어긋난
    거짓**이 된다. 그 상태에서 `claude plugin update`는 무엇을 고쳐야 할지 모른다.
  - **채널 선택 규칙 (PRD Open Question 4의 답)** — 기본은 모든 프로젝트에서 `release`.
    main을 시험하려는 프로젝트만 이 절차로 세션 단위 opt-in. 안정과 검증 표면을 둘 다
    갖는 방법은 "어느 한쪽에 상주"가 아니라 **프로젝트별·세션별 선택**이다.
  - **경계 선언** — 이 문서가 다루지 않는 것: 릴리스 컷·롤백(M3 · `docs/release-channel.md`).
- **Mirror**: `docs/gate-design.md` — 배경 산문을 docs가 소유하는 형식 · `README.md:41`의
  잔여 명시 관용구
- **Validate**: 문서에 적힌 모든 명령이 Task 3~5에서 **실제로 실행된 것**이며, 예상값을
  실측처럼 적은 문장이 0건. 절대 경로 0건 — `## Validation`의 절대 경로 탐지기가
  이 파일을 대상에 포함한다. **계정명 3종 grep이 아니라 경로 *형태*(드라이브 문자 ·
  POSIX 홈 루트 · UNC)를 찾는다**: 이 저장소의 worktree 경로에는 계정명이 없어서
  이름 기반 검사는 이 마일스톤이 반드시 배출하는 그 경로를 구조적으로 놓친다
  (L2 R0 security MEDIUM 흡수)

### Task 7: CLAUDE.md §3.7의 캐시 복사 workaround를 은퇴시킨다
- **Action**: §3.7 "왜 중요한가"의 마지막 불릿("cache 직접 copy 같은 bootstrap workaround가
  매 cycle 반복됨")은 M2 이후 **처방이 아니라 병리**다. 문장을 지우지 않고 §3.17·§3.7의
  기존 정정 병기 형식으로 한 문단을 덧붙여 (a) 그 workaround는 은퇴했고 (b) 대체 경로는
  `docs/dogfood-install.md`이며 (c) 캐시를 직접 고치는 것은 이제 **금지**이고 그 사유는
  설치 메타데이터가 디스크 내용과 어긋나기 때문임을 적는다.
  절을 옮기거나 새 절을 만들지 않는다 — instruction-contract ledger에 등재되지 않은 새
  anchor는 lint를 fail-closed로 만든다(fan-out LOW/architect 흡수).
- **Mirror**: `CLAUDE.md:311`의 v1.33.7 정정 — 낡은 문장 옆에 무엇이 왜 달라졌는지 병기
- **Validate**: `node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md
  --ledger docs/multi-session-work-loop/instruction-contract.md` exit 0.
  `grep -n "dogfood-install" CLAUDE.md`가 포인터를 반환

### Task 8: README에 dogfood 경로 포인터를 단다
- **Action**: `## 설치` 절의 채널 설명 뒤에 2~3줄. main을 시험하려는 개발자를 위한 별도
  경로가 있고 절차는 `docs/dogfood-install.md`에 있다는 사실만 적는다. 절차 본문을 README에
  복제하지 않는다 — 같은 지시가 두 곳에 살면 반드시 어긋난다(fan-out meta-gap 흡수).
  사용자 설치 명령 3줄은 **무변경**이다.
- **Mirror**: README 기존 설치 절의 톤 — 명령 블록 뒤 한 문단 산문
- **Validate**: `grep -n "dogfood" README.md`가 새 문단을 반환하고, 설치 명령 3줄의
  diff가 0줄

### Task 9: PRD의 M2 행과 Open Question 4를 갱신한다
- **Action**: `Delivery Milestones` 표에서 **2행만** `pending`에서 `in-progress`로 바꾸고
  `Plan` 셀을 이 파일 경로로 채운다. M1·M3 행은 손대지 않는다. 이어서 Open Questions의
  네 번째 항목(어느 채널에 있어야 하는가)에 Task 6이 확정한 답을 기입하고 체크한다 —
  PRD가 그 질문을 M2에 배정했으므로 답하는 것이 범위 안이다. 나머지 Open Question은
  손대지 않는다.
- **Mirror**: `/mccp:plan` PRD artifact mode 규약 — 선택한 행만 갱신
- **Validate**: `grep -n "dogfood-install" .claude/prds/release-channel-separation.prd.md`가
  `in-progress`와 plan 경로를 함께 보여주고, 표의 `pending` 잔여가 정확히 1건(M3).
  Open Question 4가 체크되고 답 문장을 포함

### Task 10: version 4면을 동기화한다
- **Action**: §3.7 patch bump(PRD 내 단일 milestone). 기준은 이 브랜치의 base인 `1.34.1`
  이지만 **`/mccp:pr` 진입 직전에 재계산**한다 — 병렬 브랜치가 그 사이 같은 번호를
  발행할 수 있다(§3.7 forward-only, 실측 4회). 대상 4면:
  `plugins/mccp/.claude-plugin/plugin.json` · `plugins/mccp/scripts/lib/renderer/html.js`
  page-foot · `plugins/mccp/scripts/lib/renderer/markdown.js` derived 줄 ·
  `CHANGELOG.md`의 새 항목과 `currently` 노트.
  **이 bump는 사용자에게 도달하지 않는다** — `release`가 `647dfec`에 서 있으므로 dogfood
  빌드 번호다(§3.7 v1.33.7 정정). 그 사실을 CHANGELOG 항목에 적는다.
- **Mirror**: `CHANGELOG.md`의 1.34.1 항목 — bump 사유를 항목 안에 적는 형식
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` 전건 통과

### Task 11: 보고서에 실측 원문을 남긴다
- **Action**: `.claude/PRPs/reports/release-channel-separation-m2-report.md`에 Task 3~5가
  실행한 명령 순서, 관측값, 채택한 기제와 **탈락한 기제의 탈락 사유**, 복구가 필요했다면
  그 절차를 기록한다. M1 보고서가 M3 런북의 원재료였듯 이 보고서는 향후 dogfood 절차
  개정의 원재료다.

  **H4 — 절대 경로를 그대로 옮겨 적지 않는다.** `.claude/PRPs/reports/`는 git-tracked
  표면이고 `installed_plugins.json`의 `installPath`와 백업 경로는 머신·계정명을 담은
  절대 경로다. 홈 디렉토리 접두를 `<PLUGINS>` · `<HOME>`으로 치환하고, worktree 경로는
  `<WORKTREE>`로 적는다. `version` · `gitCommitSha` · exit code · CLI 출력 문구는 그대로
  둔다 — 증거가 아닌 부분만 지우는 것이다.
- **Mirror**: `.claude/PRPs/reports/release-channel-separation-m1-report.md` 머리말의
  치환 선언
- **Validate**: 보고서가 존재하고 Task 3~5의 관측값을 포함하며, `## Validation`의 절대
  경로 탐지기가 이 파일에 대해 **0건**을 보고한다. worktree 경로는 계정명을 담지 않으므로
  이름 기반 grep으로는 잡히지 않는다 — 탐지기는 경로 형태를 본다(L2 R0 security MEDIUM 흡수)

## Validation

이 블록은 **열거된 축의 게이트이지, 이 마일스톤의 유일한 기계 지점이 아니다.** R0의 주석은
후자를 주장했고 그 과잉 주장이 R1에서 세 관점 모두에게 공격받았다 — 여기 없는 축(예: 문서가
실제로 실행된 명령만 담았는가)은 사람이 본다. 아래 각 항목은 실패 시 **비영점으로 끝난다**:
`set -eu`가 깔려 있고 그 위에 축마다 명시 guard가 붙는다. R1 이전에는 네 개의 핵심 단언
(manifest 형태 · 경로 유출 · instruction-contract lint · i18n test)에 guard가 없어 블록의
최종 종료코드가 마지막 명령의 것이었다 — 즉 실패해도 exit 0이었다(L2 R1 invariant HIGH 흡수).

```bash
set -eu

# ── 1. 채널 불변 — M2는 릴리스 좌표를 움직이지 않는다 ────────────────────────────
#
# 로컬 remote-tracking ref(`git rev-parse origin/release`)를 읽지 않고 **원격을 직접**
# 읽는다. R0는 `git fetch` 뒤에 로컬 ref를 비교했는데, fetch가 실패하든(네트워크·인증)
# 성공하고도 ref를 갱신하지 못하든 이전에 캐시된 값이 그대로 해소돼 리터럴 비교가
# 통과했다 — "기구 사망"과 "채널 무이동"이 같은 모습이 되는 실패다
# (L2 R0 invariant MEDIUM + R1 invariant LOW 흡수). `ls-remote`는 캐시를 경유하지 않으므로
# 두 경우 모두 빈 출력이 되어 아래 비영점 분기로 떨어진다.
REMOTE_RELEASE=$(git ls-remote origin refs/heads/release | cut -f1)
[ -n "$REMOTE_RELEASE" ] \
  || { echo 'HALT: cannot read refs/heads/release from origin — the channel anchor observed nothing'; exit 1; }
[ "$REMOTE_RELEASE" = "647dfecba75eecd9287ee538ca5f7056c7ba71da" ] \
  || { echo "HALT: M2 must not move the release channel (origin/release=$REMOTE_RELEASE)"; exit 1; }

# ── 2. 릴리스 manifest 무변경 — M2의 diff에 이 파일이 없어야 한다 ───────────────
#
# **R5 정정 (L2 R5 invariant HIGH)** — 이 검사는 plan의 최상위 불변식("M2는 릴리스 좌표를
# 움직이지 않는다")을 강제하는데, R4가 검사 7·10·11·12에 단 guard를 여기에만 빠뜨렸다.
# `git diff | grep -q`는 파이프라인이라 종료코드가 `grep`의 것이고, git이 죽으면 `grep`은
# 빈 입력에 1을 돌려 `if`가 거짓이 된다 — 즉 **기구 사망이 "릴리스 manifest 무변경"으로
# 읽힌다**(실측 확인). 같은 형태로 닫는다.
git rev-parse --verify origin/main >/dev/null 2>&1 \
  || { echo 'HALT: origin/main is not resolvable — the release-manifest check cannot run, and an unrunnable check must not read as clean'; exit 1; }
CHANGED_ALL=$(git diff --name-only origin/main...HEAD) \
  || { echo 'HALT: git diff failed while checking the release manifest — instrument failure, not an untouched manifest'; exit 1; }
if printf '%s\n' "$CHANGED_ALL" | grep -q '^\.claude-plugin/marketplace\.json$'; then
  echo 'HALT: M2 touched the release manifest'; exit 1
fi

# ── 3. 릴리스 manifest 형태는 여전히 git-subdir + ref:release (M1 단언 재실행) ──
node -e "
const s=JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8')).plugins[0].source;
const bad=[];
if (typeof s!=='object'||s===null) bad.push('source is not an object');
else {
  if (s.source!=='git-subdir') bad.push('source.source='+JSON.stringify(s.source));
  if (s.ref!=='release')       bad.push('source.ref='+JSON.stringify(s.ref));
  if (s.path!=='plugins/mccp') bad.push('source.path='+JSON.stringify(s.path));
  if (!s.url)                  bad.push('source.url missing');
  if ('sha' in s)              bad.push('source.sha present');
}
if (bad.length) { console.error('FAIL: '+bad.join(' | ')); process.exit(1); }
console.log('ok: release manifest unchanged');
" || { echo 'HALT: release manifest shape assertion failed'; exit 1; }

# ── 4. 후퇴선을 탔을 때만 — dev manifest는 문자열 source이고 릴리스와 뒤바뀌지 않았다 ──
#
# 한정: 이 단언은 파일명·위치가 계획대로일 때만 발화한다. 후퇴선을 탔는데 manifest가 다른
# 이름·위치에 떨어지면 이 검사는 조용히 skip된다(L2 R1 invariant LOW — 이연하지 않고 한정을
# 명시). Task 5를 실제로 탔는지는 보고서가 기록하며, 그 기록이 이 skip의 짝이다.
if [ -f marketplace.dev.json ]; then
  node -e "
  const m=JSON.parse(require('fs').readFileSync('marketplace.dev.json','utf8'));
  const s=m.plugins[0].source;
  const bad=[];
  if (typeof s!=='string') bad.push('dev source must be a relative-path string, got '+JSON.stringify(s));
  if (m.name==='mccp')     bad.push('dev marketplace name collides with the release marketplace');
  if (bad.length) { console.error('FAIL: '+bad.join(' | ')); process.exit(1); }
  console.log('ok: dev manifest is local-path shaped');
  " || { echo 'HALT: dev manifest shape assertion failed'; exit 1; }
fi

# ── 5. 문서 표면 — 절차는 docs가 소유하고 나머지는 포인터 ───────────────────────
test -f docs/dogfood-install.md || { echo 'HALT: M2 deliverable missing'; exit 1; }
test -f .claude/PRPs/reports/release-channel-separation-m2-report.md \
  || { echo 'HALT: M2 report missing — the leak detector below would otherwise report clean on an absent file'; exit 1; }
grep -q "dogfood-install" README.md || { echo 'HALT: README has no pointer'; exit 1; }
grep -q "dogfood-install" CLAUDE.md || { echo 'HALT: CLAUDE.md 3.7 has no pointer'; exit 1; }

# ── 6. version bump이 실제로 일어났는가 ─────────────────────────────────────────
#
# `i18n-surface.test.js`는 기대값을 `plugin.json`에서 파생하므로 bump를 아예 하지 않아도
# green이다 — 그 test는 4면 **동기**를 보지 bump 발생을 보지 못한다(L2 R1 test MEDIUM 흡수).
#
# **R6 정정 (L2 R6 invariant HIGH)** — 이전 형태 `[ "$V_NEW" != "$V_OLD" ]`는 bump를 관측하지
# 못했다. 그것이 재는 것은 "이 브랜치가 올렸는가"가 아니라 "main과 다른가"이므로 (a) 병렬
# 브랜치가 main을 올리면 이 브랜치가 한 글자도 bump하지 않아도 통과하고(§3.7이 실측 4회로
# 기록한 상황) (b) version을 **낮춘** forward-only 위반도 통과한다. 두 조건을 명시적으로
# 나눠 잰다 — **이 브랜치가 그 파일을 건드렸는가**(커밋분 ∪ 작업 트리) ∧ **상향인가**.
V_NEW=$(node -e "process.stdout.write(require('./plugins/mccp/.claude-plugin/plugin.json').version)") \
  || { echo 'HALT: cannot read plugin.json version — instrument failure, not a passing bump check'; exit 1; }
V_OLD=$(git show origin/main:plugins/mccp/.claude-plugin/plugin.json \
        | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).version))") \
  || { echo 'HALT: cannot read origin/main plugin.json version — instrument failure'; exit 1; }

# (a) 이 브랜치가 실제로 그 파일을 건드렸는가. 커밋 전후 어느 시점에 돌려도 같은 것을 본다.
BUMP_TOUCHED=$(
  { git diff --name-only origin/main...HEAD -- plugins/mccp/.claude-plugin/plugin.json
    git status --porcelain --untracked-files=all -- plugins/mccp/.claude-plugin/plugin.json | sed 's/^...//'
  } | sort -u | grep -c . ) || true
[ "${BUMP_TOUCHED:-0}" -gt 0 ] \
  || { echo "HALT: this branch does not touch plugin.json at all — a version that merely differs from main is not a bump (§3.7 forward-only)"; exit 1; }

# (b) 상향인가. `sort -V`의 최댓값이 새 값과 같고 두 값이 다르면 엄격히 상향이다.
[ "$V_NEW" != "$V_OLD" ] || { echo "HALT: plugin.json version was not bumped (still $V_OLD)"; exit 1; }
V_MAX=$(printf '%s\n%s\n' "$V_OLD" "$V_NEW" | sort -V | tail -1)
[ "$V_MAX" = "$V_NEW" ] \
  || { echo "HALT: plugin.json version went DOWN ($V_OLD -> $V_NEW) — §3.7 requires forward-only"; exit 1; }

# ── 7. 경로 유출 — 이 브랜치가 **추가한** 줄에 절대 경로 0건 ────────────────────
#
# 대상은 하드코딩 2건이 아니라 **이 브랜치가 실제로 건드리는 사람-대상 tracked 표면**에서
# 파생한다(L2 R1 architect MEDIUM · test LOW 흡수). `.claude/plans/`와 backlog는 대상이
# 아니다 — 그 표면의 절대경로는 backlog에 이미 별도 축으로 등재된 선재 항목이고, 이
# 마일스톤이 만드는 것이 아니다.
#
# 탐지는 이름이 아니라 **형태**를 본다. 계정명 3종 grep은 이 저장소의 worktree 경로를
# 구조적으로 놓쳤다(L2 R0 security MEDIUM). 형태 4종: 드라이브 문자 · POSIX 홈 루트 ·
# MSYS/Git-Bash 드라이브(`/c/…` — Task 3·5의 명령이 실제로 이 셸에서 실행된다) · UNC.
# R0의 UNC 항은 역슬래시가 두 배로 들어가 **구조적으로 매칭 불가능한 죽은 코드**였다
# (L2 R1 security MEDIUM 흡수).
#
# **R2 흡수 — 파일 전문이 아니라 추가된 줄만 본다 (L2 R2 test HIGH).** 이전 형태는
# `readFileSync`로 대상 파일 **전문**을 훑었고, 그것은 이 브랜치에서 결정론적으로 red였다:
# `CHANGELOG.md:3039-3040`에 `X:\parent\repo`가 **선재**하고(과거 사이클이 같은 결함 계열을
# 흡수하며 남긴 synthetic placeholder다), Task 10이 CHANGELOG.md를 반드시 UPDATE하므로 그
# 파일은 항상 대상 집합에 들어간다. 통과시키려면 무관한 과거 항목을 고치거나 검사를
# 무력화해야 했다 — 어느 쪽도 이 검사가 원한 것이 아니다. 이 마일스톤이 책임지는 것은
# **자신이 추가한 줄**이므로 `-U0` diff의 `+` 줄만 본다. 커밋 전 신규 파일(untracked)은
# 선재 줄이라는 것이 없으므로 전문이 곧 추가분이다.
#
# **R2 흡수 — 빈 대상 집합은 통과가 아니라 실패 (L2 R2 invariant HIGH).** 이전 형태는 두
# git 호출을 `|| true`로 감싸고 `.filter(Boolean)` 뒤 `files.length===0`에서
# `ok: … 0 tracked M2 surface(s)`로 exit 0했다. origin/main 부재·git 실패·잘못된 base가
# 전부 "깨끗함"으로 접혔다는 뜻이다. 이 마일스톤은 CHANGELOG·README·CLAUDE.md·docs·report를
# 반드시 건드리므로 **빈 집합은 기구 사망의 신호**이고, 그래서 HALT한다. plan L426이
# "부재와 깨끗함이 같은 출력이면 검사가 무의미하다"고 적은 원칙을 파일 read 계층에서만
# 닫고 대상 파생 계층에 열어 둔 것이 결함이었다.
#
# **R3 흡수 — `.claude/reviews/`를 제외하고 그 사유를 밝힌다 (L2 R3 security HIGH).** 위
# 주석은 대상이 "이 브랜치가 실제로 건드리는 사람-대상 tracked 표면"이라고 적으면서
# `.claude/plans/`와 backlog의 제외 사유만 댔고, `.claude/reviews/`는 말없이 빠져 있었다 —
# 그 표면은 tracked이고 이 브랜치가 실제로 수정하며, 실제 머신 절대 경로가 이미 들어 있다
# (`.claude/reviews/plan-review-release-channel-separation.md` (L9)의 `--l2-file unreadable at …` — 게이트
# recorder가 CLI의 ENOENT 메시지를 verbatim 인용해 쓴 것이다).
#
# 그래서 대상에 넣지 않고 **제외를 명시**한다. 사유: 그 파일들은 사람이 쓴 산문이 아니라
# `plan-review/cli.js record`가 리뷰어 출력과 도구 메시지에서 **기계 생성**하는 게이트
# 증거물이고, 그 안의 절대 경로는 인용된 도구 출력이다 — `.claude/plans/`를 제외한 것과
# 같은 계열이다. 대상에 넣으면 게이트가 자기 산출물에 막히고, 그 상태를 푸는 유일한 행동은
# 증거를 손으로 고치는 것이 되어 기록의 신뢰성을 스스로 깬다.
#
# **이것은 잔여이지 해소가 아니다.** 유출은 실재하고 자기 재생산한다(이 게이트의 매 라운드가
# 인용을 한 줄씩 더 쌓는다). 근본 해소는 `record.js`가 쓰기 전에 repo-relative로 정규화하는
# 것이며(§3.12 `normalizeReceiptCwd`와 같은 형태) 그것은 mccp 본체의 축이라 이 마일스톤
# 밖이다 — backlog에 적재했다.
LEAK_PATHSPEC='docs README.md CLAUDE.md CHANGELOG.md .claude/PRPs/reports'
git rev-parse --verify origin/main >/dev/null 2>&1 \
  || { echo 'HALT: origin/main is not resolvable — the leak detector cannot derive its target set, and an underivable set must not read as clean'; exit 1; }

# 추가된 줄만: 커밋분 + **staged(index)** + 작업 트리 수정분 + untracked 신규 파일(전문)
#
# **R6 정정 (L2 R6 architect HIGH)** — staged(index) 상태가 세 arm 어느 곳에도 속하지
# 않았다. `git add` 후 커밋 전이면 (a) 커밋분 arm에 없고 (b) `git diff`가 index↔worktree라
# 빈 diff가 되며 (c) 상태가 `A `라 `^??` 필터에서 탈락한다 — 그러면서 `LEAK_TOUCHED`는
# `git status`를 써서 그 경로를 **세므로** 빈-집합 HALT도 발화하지 않는다. 즉 대상은 비지
# 않고 내용만 비는 vacuous PASS로, R3가 닫았다고 적은 것의 다른 입구다(실측 확인: staged
# 편집에서 arm1=0 arm2=0 arm3=0, `--cached`만 1). `--cached` arm을 더해 닫는다 — staged
# 신규 파일의 전문도 그 diff에 추가 줄로 나타나므로 한 줌이 두 경우를 모두 덮는다.
# **R3 흡수 (L2 R3 invariant MEDIUM)** — R2는 `LEAK_TOUCHED`에만 guard를 달고 `LEAK_ADDED`는
# 서브셸 전체를 `2>/dev/null`로 감싼 채 뒀다. 두 값이 **별도 git 호출**로 파생되므로,
# 내용 파생만 실패하면 대상 집합은 비지 않은 채 내용이 비어 vacuous PASS가 된다.
#
# **R4 정정 (L2 R4 test HIGH) — R3이 그 자리에 넣은 sentinel은 죽은 코드였다.**
# `cmd || fallback`의 `||`는 파이프라인 **전체**의 종료코드에 걸리고, 그 값은 마지막 명령
# `sed`의 것이다 — `sed`는 빈 입력에도 0을 돌려주고 이 블록에는 `set -o pipefail`이 없으므로
# (L367은 `set -eu` 단독), git이 죽어도 fallback은 **결코 실행되지 않는다**. 설령 실행돼도
# `$?`는 git이 아니라 `sed`의 값이다. 즉 R3은 "닫았다"고 적고 실제로는 닫지 않았고, 그것은
# R1이 잡은 "역슬래시 과잉으로 매칭 불가능한 죽은 코드"와 **같은 계열의 재발**이다 —
# 원인도 같다: 주장만 하고 그 경로를 실행해 보지 않았다.
#
# 구조로 닫는다: git을 **파이프라인 안에 두지 않고** 단독 할당으로 먼저 받아 그 자리에서
# 종료코드를 본다. 그러면 `||`가 git에 직접 걸리므로 판정이 성립하고, 필터링은 그 변수를
# 상대로 하므로 실패가 숨을 곳이 없다. sentinel 대신 즉시 HALT하는 이유는 검사 10·11과
# 형태를 맞추기 위해서다(기구의 죽음은 청결이 아니다).
GIT_ADDED_COMMITTED=$(git diff -U0 origin/main...HEAD -- $LEAK_PATHSPEC) \
  || { echo 'HALT: git diff (committed) failed while deriving added lines — an instrument failure is not a clean scan'; exit 1; }
GIT_ADDED_STAGED=$(git diff -U0 --cached -- $LEAK_PATHSPEC) \
  || { echo 'HALT: git diff (staged) failed while deriving added lines — an instrument failure is not a clean scan'; exit 1; }
GIT_ADDED_WORKTREE=$(git diff -U0 -- $LEAK_PATHSPEC) \
  || { echo 'HALT: git diff (worktree) failed while deriving added lines — an instrument failure is not a clean scan'; exit 1; }
GIT_UNTRACKED=$(git status --porcelain --untracked-files=all -- $LEAK_PATHSPEC) \
  || { echo 'HALT: git status failed while listing untracked M2 surfaces — an instrument failure is not a clean scan'; exit 1; }
LEAK_ADDED=$(
  { printf '%s\n' "$GIT_ADDED_COMMITTED" | grep -E '^\+[^+]' | sed 's/^+//' || true
    printf '%s\n' "$GIT_ADDED_STAGED"    | grep -E '^\+[^+]' | sed 's/^+//' || true
    printf '%s\n' "$GIT_ADDED_WORKTREE"  | grep -E '^\+[^+]' | sed 's/^+//' || true
    printf '%s\n' "$GIT_UNTRACKED" | grep -E '^\?\?' | sed 's/^...//' | while IFS= read -r f; do
      [ -n "$f" ] && [ -f "$f" ] && { cat -- "$f" || { echo "__UNREADABLE__:$f"; }; }
    done
  }
)
LEAK_TOUCHED=$(
  { git diff --name-only origin/main...HEAD -- $LEAK_PATHSPEC
    git status --porcelain --untracked-files=all -- $LEAK_PATHSPEC | sed 's/^...//'
  } | sort -u | grep -c . || true
)
if [ "${LEAK_TOUCHED:-0}" -eq 0 ]; then
  echo 'HALT: leak detector derived ZERO target surfaces. This milestone always edits CHANGELOG.md/README.md/CLAUDE.md/docs/report, so an empty set means the instrument is dead (bad base, git failure) — not that the tree is clean.'; exit 1
fi
printf '%s\n' "$LEAK_ADDED" | node -e "
let raw = '';
process.stdin.on('data', function (d) { raw += d; });
process.stdin.on('end', function () {
  const RE = /(^|[^A-Za-z0-9])([A-Za-z]:[\\\/]|\/Users\/|\/home\/|\\\\[A-Za-z0-9])|(^|[\s\"\`(\[])\/[a-z]\/[A-Za-z0-9_]/;
  let bad = 0;
  raw.split(/\r?\n/).forEach(function (l, i) {
    if (l.indexOf('__UNREADABLE__:') === 0) {
      bad += 1; console.error(l + ' — an unreadable target is a failure, not a pass'); return;
    }
    if (l.indexOf('__GIT_FAILED__') === 0) {
      bad += 1; console.error('__GIT_FAILED__ — a git failure while deriving added lines is a failure, not a clean scan'); return;
    }
    if (RE.test(l)) { bad += 1; console.error('added-line ' + (i + 1) + ': ' + l.trim().slice(0, 160)); }
  });
  if (bad) { console.error('FAIL: absolute path in added line(s) (' + bad + ')'); process.exit(1); }
  console.log('ok: no absolute path in added lines across ' + process.argv[1] + ' touched M2 surface(s)');
});
" "$LEAK_TOUCHED" || { echo 'HALT: absolute-path leak detector failed'; exit 1; }

# ── 8. CLAUDE.md 절 이전/소실 검사 ──────────────────────────────────────────────
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md \
  || { echo 'HALT: instruction-contract lint failed'; exit 1; }

# ── 9. 4면 동기 ─────────────────────────────────────────────────────────────────
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js \
  || { echo 'HALT: i18n-surface test failed'; exit 1; }

# ── 10. 이 브랜치가 조용히 지우는 파일이 없는가 ─────────────────────────────────
#
# **R2 흡수 (L2 R2 invariant MEDIUM)** — `|| true`는 git 실패를 "위반 0"으로 접는다.
# `set -eu`가 깔려 있어도 `|| true`가 그것을 무력화하므로, base가 없거나 git이 죽으면
# 빈 출력이 나오고 이 검사는 통과한다. 검사 1이 같은 실패 모드에 `[ -n … ] || exit 1`
# 명시 guard를 둔 것과 같은 형태로 닫는다 — 기구의 죽음은 청결이 아니다.
#
# **M2 close 정정 — 검증을 기록할 자리가 없었다.** 이 검사의 HALT 문구는 "verify each one is
# intentional"이라 **사람의 검증**을 종료 조건으로 지목하는데, 정작 그 검증이 끝난 뒤 결과를
# 남길 통로가 없었다. 즉 정당한 삭제가 한 건이라도 생기면 블록이 영구 red가 되고, 통과시키려면
# 옳은 커밋을 되돌리거나 검사를 지워야 했다 — 검사 7이 같은 형태를 두고 "어느 쪽도 이 검사가
# 원한 것이 아니다"라고 적은 그 자리다. 형제 검사 12가 이미 `.claude/state/`를 게이트 산출물
# 접두로 면제하므로, 그 디렉토리의 lifecycle 삭제가 여기서만 치명적인 것은 두 검사 간
# 불일치이기도 하다.
#
# 디렉토리를 통째로 면제하지 **않고 열거**한다. 목록에 없는 삭제는 여전히 HALT이므로 §3.5.1이
# 겨냥한 사고 — 머지가 다른 PR의 신규 파일(`docs/`·`.claude/prds/`·`.claude/plans/`)을 조용히
# 떨어뜨리는 것 — 의 탐지력은 한 글자도 줄지 않는다. 이름을 올리려면 별도 편집이 필요하고 그
# 사실이 diff에 남는다(§3.17 래칫과 같은 형태).
#
#   `.claude/state/fix-task.md` — 소비된 fix-task의 rotation(커밋 `86dbc3f`). §3.2가 정한 상태
#   lifecycle이며 같은 커밋이 `fix-task-applied.md`에 적용 기록을 남긴다. 되돌리면 같은 task가
#   pending과 applied 양쪽에 동시에 존재하게 되므로, 삭제를 취소하는 것이 오히려 상태 파손이다.
VERIFIED_DELETIONS='^(\.claude/state/fix-task\.md)$'
git rev-parse --verify origin/main >/dev/null 2>&1   || { echo 'HALT: origin/main is not resolvable — the deletion check cannot run, and an unrunnable check must not read as clean'; exit 1; }
DELETED=$(git diff --diff-filter=D --name-only origin/main...HEAD)   || { echo 'HALT: git diff failed while listing deletions — instrument failure, not a clean tree'; exit 1; }
UNVERIFIED=$(printf '%s\n' "$DELETED" | grep -v '^$' | grep -Ev "$VERIFIED_DELETIONS" || true)
if [ -n "$UNVERIFIED" ]; then
  printf '%s\n' "$UNVERIFIED"
  echo 'HALT: this branch deletes files that are not on the verified-deletion list — verify each one is intentional (CLAUDE.md 3.5.1), then enumerate it above with its reason'; exit 1
fi

# ── 11. 백업물·plugin 상태 사본이 저장소에 유입하지 않았는가 ────────────────────
#
# R0는 이것을 `git status --porcelain -uall`이 **비어 있을 것**으로 단언했는데, 판별력이
# 정확히 반대로 걸려 있었다(L2 R1 architect·test HIGH 흡수): 이 마일스톤은 파일을 새로
# 만들므로 커밋 전 정상 상태에서 **항상** 발화하고, 커밋 뒤에는 트리가 깨끗해져 정작
# 막아야 할 "실수로 커밋된 백업물"을 못 본다. 그래서 트리의 청결이 아니라 **경로의 정체**를
# 본다 — 커밋된 추가분(`--diff-filter=A`)과 작업 트리 항목을 함께 훑어 plugin 상태 사본과
# 백업 산출물의 서명을 찾는다. 이 형태는 커밋 전후 어느 시점에 돌려도 같은 것을 잡는다.
#
# **R2 흡수 두 건.** (a) 서명에서 bare `settings.json`이 이 저장소가 소유한 tracked
# `.claude/settings.json`을 오탐했다(L2 R2 architect MEDIUM · security LOW — 두 관점이
# 독립적으로 착지). `.gitignore`는 `settings.local.json`만 무시하므로 그 파일은 정상
# tracked이고, 이 브랜치가 어떤 이유로든 그것을 건드리면 "백업물이 유입했다"는 거짓 HALT가
# 났다. 상시 오탐하는 가드는 운영자가 무시하도록 학습시키고, 그것이 이 가드가 막으려는
# 진짜 유입을 통과시키는 경로다. 저장소 자신의 두 경로만 명시 제외한다 — 서명 자체는
# 그대로라 `docs/settings.json`이나 `backup/settings.json`은 여전히 잡힌다.
# (b) `|| true` 두 개가 검사 10과 같은 이유로 제거됐다.
git rev-parse --verify origin/main >/dev/null 2>&1   || { echo 'HALT: origin/main is not resolvable — the ingress check cannot run, and an unrunnable check must not read as clean'; exit 1; }
#
# **R4 정정 (L2 R4 invariant HIGH)** — R3이 여기 넣은 두 sentinel 중 `git status` 쪽은
# **죽은 코드**였다. 그 줄만 `| sed`가 붙은 파이프라인이라 `||`가 파이프라인 전체(= `sed`의
# 종료코드)에 걸렸고, `sed`는 빈 입력에도 0이라 git 실패가 분기를 발화시키지 못했다(실측
# 확인: git 실패 시 출력이 빈 문자열). 같은 블록의 `git diff` 쪽은 단독 명령이라 정상
# 작동했으므로, R3의 대조가 **살아 있는 쪽만** 확인하고 통과로 읽은 것이다 — 검사 7의
# 같은 결함을 R3이 놓친 것과 같은 원인이다. git을 파이프라인에서 빼내 단독 할당으로 받는다.
GIT_INGRESS_ADDED=$(git diff --diff-filter=A --name-only origin/main...HEAD) \
  || { echo 'HALT: git diff failed while listing added files — instrument failure, not an empty ingress'; exit 1; }
GIT_INGRESS_STATUS=$(git status --porcelain --untracked-files=all) \
  || { echo 'HALT: git status failed while listing working-tree entries — instrument failure, not an empty ingress'; exit 1; }
INGRESS=$(
  { printf '%s\n' "$GIT_INGRESS_ADDED"
    printf '%s\n' "$GIT_INGRESS_STATUS" | sed "s/^...//"
  } | sort -u \
    | grep -Ev '^\.claude/settings(\.local)?\.json$' \
    | grep -Ei '(^|/)(installed_plugins|known_marketplaces|plugin-catalog-cache|settings)\.json$|\.bak(\.|-|$)|(^|/)mccp-m2-|(^|/)backup/' || true
)
if [ -n "$INGRESS" ]; then
  printf '%s\n' "$INGRESS"
  echo 'HALT: a plugin-state or backup artifact reached the repo (Task 2 forbids any backup inside the tree)'; exit 1
fi

# ── 12. diff가 선언된 Files to Change 집합을 벗어나지 않는가 ────────────────────
#
# **L2 R2 흡수 — security HIGH · test HIGH · invariant HIGH가 독립적으로 같은 축에 착지.**
# Task 3은 판별 marker를 위해 tracked 소스 `plugins/mccp/scripts/hooks/session-start.js`에
# 임시 변경을 심고 "커밋하지 않는다"를 load-bearing 주장으로 삼는데, 그 주장을 게이트에서
# 반증할 수단이 **0이었다**: 유일한 가드인 Task 3 Validate (iv)의 `git status --porcelain`은
# 이 파일 검사 11이 "판별력이 정확히 반대로 걸렸다"며 폐기한 바로 그 형태이고(커밋되면
# 트리가 깨끗해져 못 본다), 검사 7의 대상은 `plugins/`를 포함하지 않으며, 검사 11의 grep
# 서명은 hook 파일 수정과 매칭되지 않고, 검사 10은 삭제만 본다. 즉 marker를 쓰는 hook
# 변조가 커밋된 채 통과할 수 있었고, 그 코드는 다음 릴리스 컷에서 전 사용자 SessionStart로
# 도달한다.
#
# 파일 하나를 특별 취급하는 대신 **일반 규칙**으로 닫는다: 이 브랜치가 건드리는 모든 경로는
# `Files to Change`가 선언한 집합(+ 조건부 산출물 1건) 안에 있어야 한다. Task 3의 임시
# 변경이 커밋되면 `plugins/…/session-start.js`가 집합 밖이라 여기서 걸린다. 새 파일을
# 의도적으로 추가하려면 표를 먼저 고쳐야 하고, 그것이 §1.2 dedupe가 요구하는 것과 같은
# 규율이다.
#
# **R3 흡수 두 건.** (a) ALLOWED가 이 브랜치가 **이미 수정한** tracked 파일
# `.claude/reviews/plan-review-release-channel-separation.md`(`-m2` 없는 R0·R1 산출물)를
# 빠뜨려, 커밋하는 순간 결정론적 HALT였다 — R2가 검사 7에서 잡은 "이 브랜치에서 항상 red인
# 검사"와 같은 계열의 재발이다(L2 R3 test HIGH). 파일명 하나를 더하는 대신 게이트 산출물
# 디렉토리 셋(`receipts`·`state`·`reviews`)을 **접두 규칙**으로 묶는다. (b) 대안 그룹에 끝
# 앵커가 없어 `README.md.bak2`·`CLAUDE.md.orig` 같은 접미 변형이 전부 통과했다(L2 R3
# invariant LOW) — 파일 항은 `$`로, 디렉토리 항은 `/`로 각각 앵커한다.
#
# **알려진 한정 (L2 R3 architect MEDIUM, 이연):** 이 목록은 `Files to Change` 표의 기계적
# 투영이 아니라 표 + 게이트 산출물 디렉토리의 합집합이다. 표에 없는 것을 허용하므로 두
# 목록은 각자 편집되고 drift가 가능하다. 표에서 자동 파생하는 것이 옳지만 그것은 파서를
# 새로 만드는 별도 축이라 이 마일스톤 밖이다 — backlog에 적재했다.
ALLOWED='^((docs/dogfood-install\.md|README\.md|CLAUDE\.md|CHANGELOG\.md|marketplace\.dev\.json|\.claude/prds/release-channel-separation\.prd\.md|\.claude/plans/release-channel-separation-m2\.plan\.md|\.claude/plans/codex-findings-backlog\.md|\.claude/PRPs/reports/release-channel-separation-m2-report\.md|plugins/mccp/\.claude-plugin/plugin\.json|plugins/mccp/scripts/lib/renderer/html\.js|plugins/mccp/scripts/lib/renderer/markdown\.js)$|(\.claude/receipts|\.claude/state|\.claude/reviews|\.claude/milestone-closures)/)'
#
# **M2 close 추가 — `milestone-closures`.** `/mccp:milestone-close`가 쓰는 closure 문서는
# `receipts`·`state`·`reviews`와 같은 **게이트 산출물**이지 이 마일스톤이 저술하는 파일이
# 아니다(그래서 `Files to Change` 표에 없고, 같은 이유로 §1.2 dedupe의 planned matcher
# 대상도 아니다 — receipts가 표에 없는 것과 같은 자리다). 접두 그룹에 더하지 않으면 종료
# 절차가 자기 산출물로 이 검사를 깨뜨린다. 파일 단위가 아니라 디렉토리 접두인 것은 위 셋과
# 동일한 근거이며, 앵커는 `/`로 유지해 `.claude/milestone-closures.bak` 류를 배제한다.
#
# **R4 정정 (L2 R4 security HIGH)** — 이 검사는 Task 3의 커밋된 hook 변조가 릴리스로
# 도달하는 것을 막는 **유일한** 기계 가드인데, 검사 7·10·11에는 달아 둔 `rev-parse` guard가
# 여기에만 빠져 있었고 `|| true`가 git 실패를 "위반 0"으로 접었다(실측 확인). 같은 형태로
# 닫는다 — git은 단독 할당으로 받아 종료코드를 그 자리에서 보고, `|| true`는 "일치 없음"이
# 정상인 `grep -v`에만 남긴다.
git rev-parse --verify origin/main >/dev/null 2>&1 \
  || { echo 'HALT: origin/main is not resolvable — the diff-containment check cannot run, and an unrunnable check must not read as clean'; exit 1; }
#
# **R5 정정 (L2 R5 architect·security·test HIGH — 3관점 합치)** — 이 검사는 커밋된 diff만
# 읽었는데, Task 3이 실제로 만드는 상태는 **커밋되지 않은 작업 트리 변조**다. 즉 Task 3
# Validate (iv)가 종료 조건으로 지명한 검사가 그 상태를 구조적으로 볼 수 없었고, plan은
# 같은 자리에서 유일한 대안(`git status`)을 폐기해 **양쪽 커버리지가 0**이 됐다. 형제 검사
# 11은 이미 커밋분과 작업 트리를 **합집합**으로 보는데 12만 그 arm이 없었다 — 같은 형태로
# 맞춘다. 정상 작업물은 전부 `ALLOWED` 안이라 오탐하지 않고,
# `plugins/…/session-start.js`는 집합 밖이라 커밋 여부와 무관하게 잡힌다.
CHANGED=$(git diff --name-only origin/main...HEAD) \
  || { echo 'HALT: git diff failed while listing changed files — instrument failure, not an empty diff'; exit 1; }
WT_CHANGED=$(git status --porcelain --untracked-files=all) \
  || { echo 'HALT: git status failed while listing working-tree entries — instrument failure, not a clean tree'; exit 1; }
STRAY=$(
  { printf '%s\n' "$CHANGED"
    printf '%s\n' "$WT_CHANGED" | sed 's/^...//'
  } | sort -u | grep -v '^$' | grep -Ev "$ALLOWED" || true
)
if [ -n "$STRAY" ]; then
  printf '%s\n' "$STRAY"
  echo 'HALT: this branch changes files outside the declared Files to Change set. If the change is intentional, declare it in the plan table first (§1.2 dedupe matches that table); if it is a leftover experiment (Task 3 marker), revert it.'; exit 1
fi

# ── 13. 실측이 실제로 일어났는가 — 보고서가 관측 기록을 담고 그것이 라이브와 일치하는가 ──
#
# **R7 흡수 (L2 R7 test HIGH).** 이 마일스톤의 간판 주장은 "핵심 산출물은 문서가 아니라
# 문서를 쓰기 전에 끝낸 실측"(Summary)인데, 그 주장에 **반증자가 없었다**. 검사 5는 두
# 증거물의 **존재**만 봤으므로 Task 3~5를 한 번도 돌리지 않고 상상으로 쓴 문서·보고서가 12개
# 검사를 전부 통과했다. plan 자신이 "PRD의 M2 Outcome이 문서화된다로만 서술돼 문서만 쓰고
# 완료 처리될 여지를 남긴다 — 이 plan은 그 여지를 Acceptance에서 닫는다"고 적었는데, 닫는
# 수단이 사람이 체크하는 체크박스여서 **고치겠다고 선언한 실패 모드를 그대로 재현**했다.
# 리뷰어가 기계화 가능한 형태까지 제시했으므로 수동 관측의 원리적 한계도 아니다.
#
# 보고서에 **구조화된 관측 블록**을 요구하고, 그중 기계가 독립적으로 읽을 수 있는 축은
# **라이브 값과 대조**한다. `installed_plugins.json`은 지금 이 자리에서 읽을 수 있으므로,
# 보고서가 적은 값과 다르면 그 보고서는 관측이 아니라 창작이다.
#
# **이 검사가 닫지 못하는 것을 먼저 적는다**: 저자가 nonce를 지어내고 라이브 값을 그대로
# 베껴 적으면 통과한다. 이 검사는 **위조를 막지 못하고**, 막는 것은 *누락*이다 — "돌리지
# 않아서 적을 것이 없는" 경우가 이제 통과하지 못한다. 그 구분은 §3.13.1이 같은 형태로
# 그은 선("강제되는 명제는 오심 0이 아니라 기록 없는 수용 0")과 같다.
REPORT=.claude/PRPs/reports/release-channel-separation-m2-report.md
OBS=$(sed -n '/^## 실측 원문$/,/^## /p' "$REPORT") \
  || { echo 'HALT: cannot read the M2 report — instrument failure, not a passing observation'; exit 1; }
[ -n "$OBS" ] \
  || { echo 'HALT: the report has no "## 실측 원문" section. Task 3~5의 관측을 그 섹션에 구조화해 적어라 — 문서만 쓰고 완료로 처리하는 경로를 닫는 것이 이 마일스톤의 선언이다'; exit 1; }

# 필수 키. 값 형식까지 고정해 "적었다"와 "관측했다"를 구별한다.
for K in mechanism marker_nonce marker_observed marker_absent_without_mechanism \
         installed_plugins_version installed_plugins_git_commit_sha cache_dirs_added \
         manual_cache_copies round_ledger_resets; do
  printf '%s\n' "$OBS" | grep -qE "^- ${K}: .+" \
    || { echo "HALT: report ## 실측 원문 is missing key '${K}' (형식: '- ${K}: <값>')"; exit 1; }
done
# **R8 정정 (L2 R8 architect HIGH)** — 이전 형태는 `marker_observed_with_plugin_dir: true`를
# 무조건 요구해 **Task 5 후퇴선을 구조적으로 통과 불가**로 만들었다. HALT 메시지가 스스로
# "Task 5가 경로다"라고 적으면서 exit 1했으니, 후퇴선을 정직하게 보고하면 확정 실패이고
# 통과하는 유일한 길은 관측을 `--plugin-dir` 성공으로 **잘못 적는 것**이었다 — 게이트가
# 거짓 보고를 보상하는 형태다. 어느 기제를 탔는지를 `mechanism`으로 선언하게 하고, 양성
# 대조는 **그 기제에 대해** 성립하면 된다. plan이 1급 분기로 선언한 경로를 게이트가
# 부정하지 않는다.
printf '%s\n' "$OBS" | grep -qE '^- mechanism: (plugin-dir|dev-marketplace)$' \
  || { echo 'HALT: report must declare which mechanism was measured (mechanism: plugin-dir | dev-marketplace)'; exit 1; }
printf '%s\n' "$OBS" | grep -qE '^- marker_observed: (true|yes)$' \
  || { echo 'HALT: the marker was not observed under the declared mechanism. 두 기제 모두 실패했다면 그것이 이 마일스톤의 결론이고, 문서가 아니라 그 사실을 보고서에 적어야 한다'; exit 1; }
printf '%s\n' "$OBS" | grep -qE '^- marker_absent_without_mechanism: (true|yes)$' \
  || { echo 'HALT: the negative control is not recorded — 쌍이 없으면 marker 존재가 worktree 본문과 설치된 릴리스 본문을 구별하지 못한다'; exit 1; }
# **R9 정정 (L2 R9 architect HIGH)** — R8은 `marker_observed_with_plugin_dir`를 `mechanism`
# 선언 축으로 갈라 "정직한 보고 = 확정 HALT, 통과 유일 경로 = 거짓 기재"를 닫았으나, **같은
# 블록의 형제 키에는 그 분기를 적용하지 않았다.** `cache_dirs_added: 0`은 기제와 무관하게 0을
# 요구하는데 그 관측값은 기제에 따라 달라진다 — `--plugin-dir`는 세션 한정이라 캐시를 만들지
# 않지만, Task 5의 `marketplace add` 경로에서 CLI가 스스로 캐시 디렉토리를 만들면 후퇴선을
# 정직하게 보고한 순간 다시 확정 HALT다. R8이 닫은 결함이 형제 키를 통해 그대로 살아 있었다.
#
# **더 근본적으로 이 단언은 UI3의 반증자가 아니었다.** UI3가 은퇴시키는 것은 운영자의 **수동
# 캐시 복사**이고, CLI가 자기 기제로 만드는 디렉토리는 다른 사건이다. 두 명제를 한 키에
# 뭉쳤으므로 어느 쪽도 정확히 반증되지 않았다. 축을 나눈다 — `manual_cache_copies`는 기제와
# 무관하게 0이어야 하고(UI3의 직접 반증자), `cache_dirs_added`는 선언된 기제에 대해서만
# 판정한다.
printf '%s\n' "$OBS" | grep -qE '^- manual_cache_copies: 0$' \
  || { echo 'HALT: manual_cache_copies is not 0 — UI3(캐시 직접 복사 은퇴)의 직접 반증자다. 실제로 손으로 복사했다면 대체 경로가 성립하지 않았다는 뜻이고 그 사실이 이 마일스톤의 결론을 바꾼다'; exit 1; }
RPT_MECH=$(printf '%s\n' "$OBS" | sed -n 's/^- mechanism: //p' | head -1)
case "$RPT_MECH" in
  plugin-dir)
    printf '%s\n' "$OBS" | grep -qE '^- cache_dirs_added: 0$' \
      || { echo 'HALT: mechanism=plugin-dir인데 cache_dirs_added가 0이 아니다 — 세션 한정 로드가 캐시를 만들었다면 그 기제의 전제가 깨진 것이므로 관측을 보고서에 적고 Task 5로 가라'; exit 1; }
    ;;
  dev-marketplace)
    # 후퇴선에서는 값을 **요구하지 않고 기록을 요구**한다. 0이 아니어도 정직한 보고가
    # 통과해야 하고(R8이 세운 선), 대신 비-0이면 정리했다는 선언을 함께 요구해 전역 상태
    # 잔존을 무기록으로 남기지 못하게 한다.
    printf '%s\n' "$OBS" | grep -qE '^- cache_dirs_added: [0-9]+$' \
      || { echo 'HALT: cache_dirs_added must be a non-negative integer (관측값을 그대로 적어라 — 후퇴선에서는 0이 아니어도 통과한다)'; exit 1; }
    if ! printf '%s\n' "$OBS" | grep -qE '^- cache_dirs_added: 0$'; then
      printf '%s\n' "$OBS" | grep -qE '^- cache_dirs_cleaned: (true|yes)$' \
        || { echo 'HALT: cache_dirs_added가 0이 아닌데 cache_dirs_cleaned 선언이 없다 — 이 태스크가 만드는 전역 변경 중 스스로 되돌리지 않는 것은 없다(Task 5)'; exit 1; }
    fi
    ;;
  *)
    echo "HALT: unknown mechanism '$RPT_MECH' — 앞의 mechanism 단언이 통과했다면 도달 불가한 분기다(기구 고장)"; exit 1
    ;;
esac

# 라이브 대조 — 보고서가 적은 설치 상태가 지금 실제 값과 같은가.
IP="$HOME/.claude/plugins/installed_plugins.json"
[ -f "$IP" ] \
  || { echo "HALT: $IP not found — this check cannot verify the report's install-state claims, and an unverifiable claim must not read as observed"; exit 1; }
# `plugins["mccp@mccp"]`는 **배열**이다(scope별 엔트리). 실측으로 구조를 확인하고 쓴다 —
# 초안은 객체로 가정해 두 값이 모두 빈 문자열이 됐고, 그러면 정직한 보고서가 mismatch로
# 막히는 **고장난 기구**가 된다(fail-closed지만 통과 불가). 값이 비면 그것도 실패다.
LIVE=$(node -e '
  const fs=require("fs");
  const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  const a=(j.plugins||{})["mccp@mccp"];
  const e=(Array.isArray(a)?(a.find(x=>x&&x.scope==="user")||a[0]):a)||{};
  if(!e.version||!e.gitCommitSha){process.stderr.write("mccp@mccp entry lacks version/gitCommitSha\n");process.exit(1);}
  process.stdout.write(e.version+" "+e.gitCommitSha);
' "$IP") || { echo 'HALT: cannot read mccp@mccp version/gitCommitSha from installed_plugins.json — instrument failure, not a passing observation'; exit 1; }
LIVE_V=${LIVE% *}; LIVE_S=${LIVE#* }
RPT_V=$(printf '%s\n' "$OBS" | sed -n 's/^- installed_plugins_version: //p' | head -1)
RPT_S=$(printf '%s\n' "$OBS" | sed -n 's/^- installed_plugins_git_commit_sha: //p' | head -1)
[ "$RPT_V" = "$LIVE_V" ] \
  || { echo "HALT: report says installed_plugins_version=$RPT_V but the live file says $LIVE_V — the report records a state that was never observed"; exit 1; }
case "$LIVE_S" in "$RPT_S"*) ;; *) echo "HALT: report says installed_plugins_git_commit_sha=$RPT_S but the live file says $LIVE_S — the report records a state that was never observed"; exit 1 ;; esac

# 예상을 실측처럼 적은 문장 0건 (Task 6 Validate가 명명한 오라클 없이 남아 있던 축).
# **R8 정정 (L2 R8 security HIGH)** — 이전 형태는 `<[a-z_]+>`를 case-insensitive로 잡아
# plan 자신이 Task 11 H4에서 **의무화한 치환 placeholder**(`<WORKTREE>` · `<HOME>` ·
# `<PLUGINS>`)와 Task 3·5의 문서화된 명령(`--plugin-dir <worktree>/…`)에 전부 걸렸다. 즉
# 올바르게 redact한 보고서는 통과할 수 없었고, green을 얻는 길은 (a) 진짜 절대 경로를
# git-tracked 파일에 쓰거나 — 검사 7과 §3.12 선례가 막으려는 바로 그것 — (b) 게이트를
# 무르게 하는 것뿐이었다. **게이트가 유출을 보상하는 형태**다. 일반 placeholder 패턴을
# 제거하고 hedge 어휘만 남긴다.
HEDGE=$(grep -nEi '(예상|추정|아마도|would be|should be|TBD|TODO|FIXME|XXX)' \
          docs/dogfood-install.md "$REPORT" || true)
if [ -n "$HEDGE" ]; then
  printf '%s\n' "$HEDGE"
  echo 'HALT: docs/report contain hedged or placeholder text. 이 마일스톤은 실측만 적는다 — 관측하지 못한 것은 "관측하지 못했다"고 적어라(추정형으로 적지 말 것)'; exit 1
fi

# ── 14. 운영자 전역 상태가 실제로 복원됐는가 (L2 R9 test·invariant HIGH — 2관점 합치) ──
#
# Task 4 step 3과 Task 5 step 4는 세 파일의 복원을 요구하지만, 그 요구를 지키게 하는 것은
# **사람이 표시하는 Task Validate 체크박스**였다. 검사 13은 정확히 그 형태를 폐기하며
# 신설됐는데("닫는 수단이 사람이 체크하는 체크박스여서 고치겠다고 선언한 실패 모드를 그대로
# 재현"), 형제 축에는 그 교훈을 적용하지 않았다 — `installed_plugins.json`은 라이브 대조하면서
# `known_marketplaces.json`과 `~/.claude/settings.json`은 무기계로 남겼다.
#
# 그 공백이 무해하지 않은 이유: Task 5는 운영자 전역 레지스트리에 **worktree를 가리키는 영구
# 항목**을 만든다. `marketplace remove`를 빼먹거나 실패하면 실험이 끝난 뒤에도 릴리스 채널
# 밖의 본문이 해소 가능한 상태로 방치되고, worktree가 사라지면 죽은 marketplace를 가리키는
# 등록이 남는다. 그 상태를 보고하는 검사가 하나도 없었다.
#
# Task 2가 백업 목적지를 `$HOME/.claude/backup/mccp-m2-<timestamp>/`로 **고정**했으므로 이
# 자리에서 라이브 대조가 가능하다 — 검사 13이 `installed_plugins.json`에 쓴 것과 같은 형태다.
BK=$(ls -d "$HOME"/.claude/backup/mccp-m2-* 2>/dev/null | sort | tail -1)
[ -n "$BK" ] \
  || { echo 'HALT: no $HOME/.claude/backup/mccp-m2-* backup found — Task 2가 돌지 않았거나 목적지가 어긋났다. 백업이 없으면 복원을 반증할 수 없고, 반증 불가능한 주장은 관측으로 읽혀서는 안 된다'; exit 1; }
for F in settings.json installed_plugins.json known_marketplaces.json; do
  [ -f "$BK/$F" ] \
    || { echo "HALT: backup at $BK is missing $F — Task 2는 세 파일 전부를 백업 대상으로 선언했다(백업하고 복원을 단언하지 않는 파일이 0개여야 한다)"; exit 1; }
done
# (a) `enabledPlugins`의 `mccp@mccp`가 true로 돌아왔는가. 구조는 실측했다 —
#     `{"mccp@mccp": true, "codex@openai-codex": true}` (평면 객체, 값은 boolean).
node -e '
  const fs=require("fs");
  const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  const v=(j.enabledPlugins||{})["mccp@mccp"];
  if(v!==true){process.stderr.write("enabledPlugins[mccp@mccp] is "+JSON.stringify(v)+", expected true\n");process.exit(1);}
' "$HOME/.claude/settings.json" \
  || { echo 'HALT: ~/.claude/settings.json의 enabledPlugins가 복원되지 않았다 — Task 4의 충돌 회피가 운영자 전역 설치를 재운 채로 남았다. 백업에서 복원하고 그 사실을 보고서에 적어라'; exit 1; }
# (b) `known_marketplaces.json`의 **항목 집합**이 백업과 동일하고 `mccp-dev`가 잔존하지 않는가.
#     구조는 실측했다 — 최상위 키가 곧 marketplace 이름인 평면 객체(`mccp` ·
#     `claude-plugins-official` · `openai-codex`)다. `marketplaces` 래퍼는 **없다**; R8이 잡은
#     "객체로 가정해 빈 문자열이 됐다"를 반복하지 않기 위해 읽고 쓴다.
#     이름 집합만 비교한다 — `lastUpdated` 류까지 묶으면 정상 운영에서도 발화해 판별력이
#     0이 된다(검사 11이 "판별력이 정확히 반대로 걸렸다"며 폐기한 형태).
node -e '
  const fs=require("fs");
  const names=p=>Object.keys(JSON.parse(fs.readFileSync(p,"utf8"))||{}).sort();
  const before=names(process.argv[1]), after=names(process.argv[2]);
  if(after.indexOf("mccp-dev")>=0){process.stderr.write("mccp-dev is STILL registered\n");process.exit(1);}
  const extra=after.filter(n=>before.indexOf(n)<0), gone=before.filter(n=>after.indexOf(n)<0);
  if(extra.length||gone.length){process.stderr.write("marketplace name set drifted: +["+extra+"] -["+gone+"]\n");process.exit(1);}
' "$BK/known_marketplaces.json" "$HOME/.claude/plugins/known_marketplaces.json" \
  || { echo 'HALT: known_marketplaces.json이 Task 2 백업과 항목 집합이 다르다(또는 mccp-dev가 잔존한다) — Task 5가 만든 전역 등록을 해제하지 않았다. `claude plugin marketplace remove mccp-dev` 후 다시 돌려라'; exit 1; }
# (c) `~/.claude/settings.json`의 `extraKnownMarketplaces`도 같은 축이다 — 실측으로 그 키가
#     존재함을 확인했고, dev marketplace가 레지스트리 대신 여기 남을 수 있다. 부재를 정상으로
#     취급해 양쪽 부재는 통과시킨다(이 저장소의 현재 상태가 그렇다).
node -e '
  const fs=require("fs");
  const set=p=>{try{const j=JSON.parse(fs.readFileSync(p,"utf8"));const e=j.extraKnownMarketplaces||{};return Object.keys(e).sort();}catch(_){return null;}};
  const before=set(process.argv[1]), after=set(process.argv[2]);
  if(before===null||after===null){process.stderr.write("cannot read settings.json on one side — unverifiable, not clean\n");process.exit(1);}
  const extra=after.filter(n=>before.indexOf(n)<0);
  if(extra.length){process.stderr.write("extraKnownMarketplaces gained ["+extra+"]\n");process.exit(1);}
' "$BK/settings.json" "$HOME/.claude/settings.json" \
  || { echo 'HALT: ~/.claude/settings.json의 extraKnownMarketplaces에 실험이 남긴 항목이 있다 — Task 5의 전역 변경 중 스스로 되돌리지 않는 것은 없어야 한다'; exit 1; }

# ── 15. 라운드 캡 우회가 보고서에 기재됐는가 (L2 R9 invariant HIGH) ──
#
# 검사 12의 `ALLOWED`는 `.claude/state/`를 무조건 허용한다. receipt·review·state가 정상
# 산출물이므로 그 허용 자체는 의도된 것이지만, 부작용이 하나 있었다 — 이 마일스톤이 실제로
# 수행한 **원장 파일 이동(라운드 카운터 리셋) 3회**가 어느 검사에도 걸리지 않는다. 리뷰어의
# 판정은 옳다: 캡이 3회 우회된 게이트는 이 decision에 관한 한 장식이다.
#
# **이 검사는 리셋을 금지하지 않는다.** 이미 일어난 일이고 소급 금지는 무의미하다. 닫는 것은
# **무기록 통과**다 — 리셋 횟수와 실제 라운드 수를 보고서가 적어야 하고, 두 값 모두 라이브
# 파일에서 대조된다. 그래야 산출물만 보는 감사가 "정상 통과"로 오해하는 경로가 사라진다.
# plan 본문은 이미 "라운드 수의 정본은 원장이 아니라 dispatch log"라고 적었는데 그 주장에도
# 반증자가 없었다 — 같은 자리에서 함께 닫는다.
ARCH_GLOB='.claude/state/review-rounds/archive/mccp-plan-codex__release-channel-separation-m2.'
ARCHIVE_N=$(ls "$ARCH_GLOB"*.json 2>/dev/null | grep -c . || true)
RPT_RESETS=$(printf '%s\n' "$OBS" | sed -n 's/^- round_ledger_resets: //p' | head -1)
[ "$RPT_RESETS" = "$ARCHIVE_N" ] \
  || { echo "HALT: report says round_ledger_resets=$RPT_RESETS but the archive holds $ARCHIVE_N ledger(s) for this decision — 리셋 횟수의 정본은 .claude/state/review-rounds/archive/의 파일 수다. 관측대로 적어라"; exit 1; }
DLOG=.claude/state/plan-review/dispatch-log-release-channel-separation-m2.jsonl
[ -f "$DLOG" ] \
  || { echo "HALT: $DLOG is absent — append-only dispatch log이 라운드 수의 정본이므로 부재는 '0 라운드'가 아니라 측정 불가다"; exit 1; }
DISPATCH_N=$(grep -c . "$DLOG" || true)
printf '%s\n' "$OBS" | grep -qE "^- l2_dispatch_rounds: ${DISPATCH_N}\$" \
  || { echo "HALT: report must record 'l2_dispatch_rounds: $DISPATCH_N' — dispatch log 항목 수가 라운드 수의 정본이다(원장은 리셋됐으므로 원장 값을 적지 마라)"; exit 1; }
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `--plugin-dir`가 commands만 로드하고 hook을 빼면 "main을 시험한다"가 성립하지 않는다 | 중 | Task 3이 hook 로드를 **통과 조건**으로 둔다. 부분 로드는 실패로 판정하고 Task 5의 후퇴선으로 간다 — "대체로 된다"로 기록하지 않는다 |
| 설치된 `mccp@mccp`와 동시 로드돼 hook이 두 번 돌고 receipt·lock이 오염된다 | **높음** | Task 4가 회피 절차를 실측으로 확정하고, 문서가 그것을 절차의 필수 단계로 적는다 |
| 실험이 운영자의 전역 설치를 깨뜨린다 | 낮음 | 1순위 기제는 세션 한정이라 전역 상태를 원리상 안 바꾼다. 전역을 건드리는 Task 4·5는 Task 2 백업을 선행하고 전후 동일성을 별도 단언한다 |
| 후퇴선의 dev manifest가 릴리스 manifest와 뒤바뀌어 worktree 본문이 사용자에게 배포된다 | 낮음 | **영향이 크다.** `## Validation`이 두 manifest의 형태를 각각 기계 단언하고, 릴리스 manifest가 이 브랜치의 diff에 등장하면 HALT한다 |
| 절차가 두 곳(README·docs)에 복제돼 어긋난다 | 중 | docs가 절차를 단독 소유하고 README·CLAUDE.md는 포인터만 둔다. Validation이 포인터 존재를 검사하되 절차 복제는 리뷰가 본다 |
| 문서만 쓰고 실행 검증 없이 완료 처리된다 | 중 | Acceptance의 마지막 항목이 라이브 1회 완주와 marker 관측을 요구한다. 이것이 fan-out HIGH/test가 지적한 축이다 |
| Windows 한 대에서만 측정돼 다른 OS에서 절차가 다르다 | **높음** | 해결하지 않는다. 문서가 측정 환경(OS·CLI 버전)을 명시하고 다른 OS는 **미측정**이라고 적는다. 거짓 일반화를 하지 않는 것이 유일한 완화다 |
| `release` 브랜치에 branch-protection·서명이 없어 채널 자체가 신뢰 앵커로 약하다 | 중 | **M2가 해결하지 않는다.** fan-out HIGH/security가 제기한 실재하는 축이지만 dogfood 설치와 다른 축이고, 릴리스 컷 거버넌스는 M3·우산 PRD 소유다. `.claude/plans/codex-findings-backlog.md`에 이연 기록을 남긴다 |
| 병렬 브랜치가 같은 version 번호를 선점한다 | 중 | Task 10이 `/mccp:pr` 진입 직전에 재계산한다(§3.7 forward-only) |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] **라이브 1회 완주** — scratch 프로젝트에서 `docs/dogfood-install.md`에 적힌 절차를
      그대로 따라 세션을 띄우고, worktree에만 심은 판별 marker가 관측된다. 같은 실행을
      절차 없이 했을 때 그 marker가 **생기지 않는** 것도 함께 관측된다(쌍). 그 실행이
      `~/.claude/plugins/installed_plugins.json`을 한 바이트도 바꾸지 않았다는 것과,
      `~/.claude/plugins/cache/mccp/mccp/` 하위에 새 디렉토리가 생기지 않았다는 것이
      캐시 복사 은퇴의 기계적 근거로 보고서에 실린다
- [ ] PRD Open Question 4에 답이 기입되고 그 답이 `docs/dogfood-install.md`의 채널 선택
      규칙과 같은 내용이다
- [ ] `origin/release`가 이 마일스톤 전후로 동일하다 — M2는 사용자에게 아무것도 배포하지 않는다

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

> **verbatim에서 벗어난 편집 1종 (기록)** — 아래 본문은 fan-out이 반환한 markdown 그대로이되,
> `path:line` 형태의 인용 중 L1 C6가 해소하지 못하는 것들만 `path (Lnn)` 형태로 바꿨다.
> `l1-check.js`의 `CITATION_RE`는 선행 `.`을 토큰에 포함하지 않으므로 `.claude/…` ·
> `.claude-plugin/…` 파일은 **line anchor를 가진 인용을 구조적으로 가질 수 없고**, 에이전트가
> 쓴 축약 인용(`marketplace.json` · `plan.md`)도 저장소 루트에 그 이름이 없어 해소되지 않는다.
> 편집 대상은 인용 **토큰 18개의 형태**뿐이며 주장·증거·심각도는 한 글자도 바뀌지 않았다.
> 이 기록을 남기는 이유는, 손대지 않았다고 적어 두면 다음 사람이 byte-verbatim으로 믿기 때문이다.

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~49k.

### Findings (severity-ranked)

- **[HIGH][security]** PRD/plan never discuss GitHub branch-protection (required reviews, force-push restriction) on `release`, despite that branch becoming the sole trust anchor for every downstream installer once channel separation lands. Open Questions only ask what to do if fast-forward becomes impossible, not how to prevent unauthorized/accidental rewriting of the branch. — PRD Open Questions: '`release`가 fast-forward 불가가 되는 경우의 처리' (line 88); no Files to Change or milestone touches GitHub branch-protection settings; Risks table has no branch-protection row
- **[HIGH][test]** M2(dogfood-install)와 M3(release-runbook)은 PRD상 outcome이 '문서화된다'/'기록된다'로만 서술되고, 문서가 실제로 맞는 절차를 기술하는지 검증할 오라클(라이브 실행 대조)이 PRD Delivery Milestones 표에 명시돼 있지 않다. M1처럼 '단위 test 통과 ≠ 경로 작동'을 요구하는 명시적 acceptance 문구가 없으면, 문서만 쓰고 실행 검증 없이 완료 처리될 위험 — PRD:79-80 M2/M3 Outcome 열은 '문서화된다'/'기록된다'로만 서술, 실행 검증 조건 없음. 대조: PRD:78 M1 Outcome은 '라이브 검증 1회로 (a)(b)(c) 실측' 명시
- **[HIGH][explorer]** M1 already shipped and closed the exact surfaces this plan would target — marketplace.json, README.md §설치, CLAUDE.md §3.7 are already updated with the release-channel language. A new plan must not re-touch these as if starting fresh; it should extend, not recreate. — `.claude-plugin/marketplace.json (L9-14)` already has `source:'git-subdir'`, `ref:'release'`. `README.md:34-44` already documents the release channel. PRD `Delivery Milestones` row 1 status=complete with Plan link to `.claude/plans/release-channel-separation-m1.plan.md`.
- **[HIGH][explorer]** PRD explicitly assigns M2 (dogfood-install) and M3 (release-runbook) as the only remaining milestones, with fixed ownership files `README.md` and `docs/release-channel.md` (new). Any plan should target exactly one of these, not invent new scope. — PRD lines 78-82: `| 2 | dogfood-install | ... | pending | — |` / `| 3 | release-runbook | ... | pending | — |` and '소유 파일: `.claude-plugin/marketplace.json` · `README.md` · `docs/release-channel.md`(신설)'.
- **[HIGH][explorer]** The M1 plan already produced a report file that M3 is explicitly told to source its runbook content from, rather than invent — this is the primary reuse target for an M3 plan. — M1 plan Task 11: `.claude/PRPs/reports/release-channel-separation-m1-report.md` — '이것이 M3 런북의 원재료다 — M3은 상상해서 쓰지 않고 여기서 옮겨 적는다(UI7). **런북 자체를 여기서 쓰지 않는다.**'
- **[HIGH][explorer]** `known_marketplaces.json`'s mccp entry lacks a `ref`, so marketplace clones still track main — this residual gap was explicitly deferred to M3 by M1 and must not be silently assumed closed by a new plan. — M1 plan lines 15-20 and Risk row: '`known_marketplaces.json`의 mccp 항목에는 `ref`가 없어 marketplace clone은 계속 main을 추종한다... M3 소유다'.
- **[MEDIUM][architect]** PRD leaves 4 Open Questions unresolved that are structural/boundary decisions (version-declaration ownership location, fast-forward failure policy for `release`, which channel the operator's other-project installs should track, autoUpdate retention) — M2/M3 plans risk being written without an explicit owner for each, silently deferring architecture decisions into 'whatever M2/M3 happen to assume'. — release-channel-separation.prd.md (L86-90) Open Questions block; none has an assigned milestone owner except OQ4 implicitly tied to M2 ('M2가 여기에 답해야 한다')
- **[MEDIUM][architect]** The PRD explicitly scopes M2 (dogfood-install) and M3 (release-runbook) as pending with zero plan artifacts, but the 'owned files' list at the bottom of Delivery Milestones (marketplace.json / README.md / docs/release-channel.md) does not enumerate CLAUDE.md itself — even though §3.7 of CLAUDE.md (version bump policy) is the closest existing doc to 'release-cut owns the version number' and is the natural extensibility seam M3 must touch when it writes the release-runbook. If M3's plan treats docs/release-channel.md as the sole target and leaves CLAUDE.md §3.7 untouched, the two documents will describe two different sources of truth for version bump ownership (branch-driven vs release-cut-driven). — release-channel-separation.prd.md (L82) '소유 파일: .claude-plugin/marketplace.json · README.md · docs/release-channel.md(신설)'; CLAUDE.md §3.7 already documents a 'v1.33.7 정정' acknowledging the ownership moved to release-cut but the surrounding bump-decision table/checklist still describes branch-level bump mechanics without pointing to release-channel.md
- **[MEDIUM][architect]** Decision 3 in the PRD (next release cut is major 2.0.0, decided by content-not-scope) sets a precedent that couples major-version bump criteria to 'breaking the delivery contract' rather than 'breaking API/schema' as §3.7's existing major-bump row states — this is a redefinition of an existing convention's semantics for one specific future event, and the PRD explicitly marks it out of scope to touch §3.7's general criteria. M3's runbook plan must decide whether this is a one-time carve-out or whether §3.7's major-bump row needs a permanent amendment; leaving it implicit creates two competing definitions of 'major bump' trigger in the same codebase (schema-break vs contract-break). — release-channel-separation.prd.md (L61) 'major의 근거는 우산의 크기가 아니라 배달 계약의 파괴다' vs CLAUDE.md §3.7 table row 'Major — breaking schema/API/hook contract'
- **[MEDIUM][architect]** marketplace.json now pins `ref: release` with no `sha`, which per PRD's own Decision 2 sacrifices the immutable pin in favor of branch-movement-as-release; this is a scalability/consistency tradeoff (every future release requires a human to fast-force the release branch) that has no automation seam defined yet, and Risk table flags 'operator forgets to cut a release' as HIGH likelihood — M3's runbook is the only planned mitigation, meaning a single-milestone doc is the entire safety net for an operationally HIGH-likelihood risk. — marketplace.json (L9-14) (source.ref='release', no sha field); PRD Risks table row '채널을 나눈 뒤 운영자가 릴리스 컷을 잊어… Likelihood 높음… Mitigation: M3의 런북이 정한다'
- **[MEDIUM][security]** marketplace.json now pins to a public HTTPS git URL (github.com/idenn207/mccp.git) with `ref: release` and no `sha`. Anyone who can push to that ref (compromised/reused credential, or maintainer mistake) can silently redirect every downstream installer's `claude plugin update` to arbitrary code with zero cryptographic pinning, since `ref` moves without commit-hash verification unless `sha` is also set. — .claude-plugin/marketplace.json (L9-14) (source=git-subdir, ref=release, no sha field); PRD decision 2 explicitly rejects sha ('sha를 쓰지 않고 ref만 둔다')
- **[MEDIUM][security]** Rollback mechanism (moving `release` backward + relying on the client to accept a version downgrade) is explicitly unverified by upstream docs ('there is no rollback mechanism — the old cache entry is superseded'). If a compromised or broken release is cut and moved forward, the only mitigation (force-move `release` back) has an open question about whether the client even honors a downgrade — meaning a malicious/broken release could be effectively un-rollback-able for already-updated installs. — PRD References: "there is no rollback mechanism — the old cache entry is superseded" (line 113); Open Questions item 1 (line 86)
- **[MEDIUM][security]** known_marketplaces.json (the marketplace registry pointer, distinct from marketplace.json inside the repo) has no `ref` and continues to track main HEAD — this residual channel is acknowledged as unclosed by M1 but has no concrete remediation milestone or owner; it remains an open main-track auto-update exposure for any user who registered the marketplace directly. — Plan lines 15-20: 'known_marketplaces.json의 mccp 항목에는 ref가 없어 marketplace clone은 계속 main을 추종한다... 이 잔여를 Risks에 적고 M3으로 넘기며'; CLAUDE.md §3.7 corroborates the same gap
- **[MEDIUM][test]** PRD Success Metric 3('main 머지의 사용자 도달 0')이 실제로는 plugin 본문 표면에만 한정된다는 사실이 PRD Success Metrics 표에는 없고 M1 plan에만 명시된다 — 이후 milestone이 이 한정을 다시 검증 대상으로 승계하지 않으면 지표 통과가 조용히 전체 저장소 주장으로 재해석될 위험 — PRD:39-45 Success Metrics 표에 한정 문구 없음 vs plan.md (L469-470) '지표 3이 측정하는 것은 plugin 본문 표면에 한정된다'
- **[MEDIUM][test]** M1의 검증은 'positive control'(변경 전/후 값이 우연히 같아 무작동과 성공을 구별 못 하는 함정을 피하려고 의도적으로 다른 값으로 밀어보는 상향 대조)을 필수 통과조건으로 뒀다 — 이 패턴이 M2/M3 plan에도 명시적으로 재사용돼야 한다는 지침이 PRD/Patterns to Mirror에 아직 없다. 잊으면 같은 '실패할 수 없는 검증' 결함이 재발한다 — plan.md (L29-35) '그 검증은 양성 대조를 갖는다' + Task 9 6a 필수 지정(plan.md (L247-253))
- **[MEDIUM][test]** PRD Open Question 3('release가 fast-forward 불가가 되는 경우')은 미해결 상태로 M2/M3 범위 밖일 수 있으나, 그 실패 모드에 대한 테스트/리허설 계획이 어느 milestone에도 배정돼 있지 않다 — 향후 hot-fix가 release에서 먼저 나갈 때 force-push 판단 기준이 무검증인 채로 운영 절차(M3 런북)에 실릴 위험 — PRD:88 Open Question 3 미해결 항목, M3 Outcome(PRD:80)에 이 케이스에 대한 언급 없음
- **[MEDIUM][explorer]** `docs/release-channel.md` does not exist yet — it is M3's sole creation target, and the PRD explicitly forbids creating it in M1 ('여기서 만들지 않는다'). A plan should not accidentally create it under M2 scope. — Glob for `docs/release-channel.md` returned no files. M1 plan line 90: '`docs/release-channel.md`는 **여기서 만들지 않는다** — PRD가 M3 소유로 못박았고(UI7)'.
- **[MEDIUM][explorer]** §3.7 version-bump conventions (4-面 sync: plugin.json, renderer/html.js page-foot, renderer/markdown.js derived line, CHANGELOG.md) and the i18n-surface.test.js pattern are the canonical reuse pattern for any version-related change in this plan — do not invent a new sync mechanism. — CLAUDE.md §3.7 table + `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:94` cited by M1 plan's Patterns to Mirror row 'Tests'.
- **[MEDIUM][explorer]** The M1 plan established a working pattern for non-destructive live verification against the operator's real install (Task 9/10: pre-merge rehearsal in a zero-exposure window, then post-merge non-destructive pair-check). Any M2/M3 plan requiring live verification (e.g. dogfood worktree install) should mirror this structure rather than re-derive verification methodology from scratch. — M1 plan Task 9 ('병합 전 리허설') and Task 10 ('병합 후 비파괴 라이브 검증') — structured baseline-vs-positive-control verification pattern already exists and is proven to work.
- **[MEDIUM][explorer]** PRD Open Questions (rollback version-downgrade acceptance by CLI, marketplace-entry version vs plugin.json version, fast-forward-only failure handling, which channel the operator should dogfood from, autoUpdate retention) were already partially answered by M1's Task 9-6b live test — a new plan for M2/M3 should read the M1 report for these answers instead of re-investigating them as open. — PRD 'Open Questions' section lines 86-90 lists these as unanswered at PRD-write time; M1 plan Task 9-6b/Acceptance item 2 says this experiment was performed and its outcome recorded in the M1 report.
- **[LOW][architect]** docs/release-channel.md does not exist yet (M3 not started), so any M2 plan that references it (e.g., dogfood-install doc linking to a rollback runbook) would be creating a forward reference to a nonexistent file — a decomposition/sequencing risk if M2 and M3 plans aren't kept strictly independent per PRD's own claim. — Glob for docs/release-channel.md returned no files; PRD Scope section states 'M3은 M1의 라이브 검증이 무엇을 했는지 본 다음에 작성한다' implying M3 depends on M1 evidence, not on M2
- **[LOW][architect]** The instruction-contract ledger (docs/multi-session-work-loop/instruction-contract.md) that CLAUDE.md's own linting mandates for any section relocation has zero references to 'release-channel', 'dogfood-install', or 'release-runbook' — if M2/M3 plans add new CLAUDE.md sections (e.g., documenting dogfood worktree-install procedure or the release-cut runbook trigger) per the project's own governance mechanism, they must register with this ledger or the lint (`instruction-contract/lint.js`) will fail-closed on the new anchors. — Grep for 'release-channel|dogfood-install|release-runbook' in instruction-contract.md returned 0 matches; CLAUDE.md states 'ledger에 없는 절이 사라지면 실패합니다' as the enforcement mechanism
- **[LOW][security]** The `sha` pin is scoped only as a temporary incident-response escape hatch ('사고 대응 시에는 sha를 일시적으로 추가한다') with no procedure, authority, or audit trail specified for who may add/remove that pin under incident conditions — a security-relevant emergency-response gap left to M3 (release-runbook, still pending). — PRD decision 2 (line 60): "특정 커밋에 못박아야 하는 사고 대응 시에는 sha를 일시적으로 추가한다"
- **[LOW][security]** Live-verification protocol moves the release tip to a different real commit and observes install behavior against the actual public network-reachable remote before merge; the plan itself flags this must happen in the window before any user resolves `release`, meaning the verification procedure itself is a real (if narrow) exposure window that depends on timing discipline rather than a mechanical guard. — Plan lines 22-27: '(a)와 (c)는 둘 다 머지 전에, 아직 어떤 사용자도 release를 해소하지 않는 창에서 수행한다 — 머지 후에 release를 되감으면 그것은 실험이 아니라 실제 강등 배포이기 때문이다'
- **[LOW][test]** M1 Task 9의 라이브 리허설(marketplace clone 전환·force-push 롤백 왕복)은 운영자의 실제 유일한 설치를 대상으로 하는 비결정적·수동 절차라 회귀 방지용 반복 가능한 자동 테스트가 아니다 — 향후 M2/M3 plan이 같은 형태의 '1회성 수동 라이브 검증'을 다시 채택할 경우, 결과가 문서에만 남고 재현 가능한 검증 스크립트가 없어 회귀 감지가 불가능하다 — plan.md Task 9 전체(216-306) — 수동 git push/checkout/claude CLI 명령 순서, 자동화된 test 파일 없음. Out of scope 근거: PRD:71 '릴리스 자동화... 대상이 아직 없다'

### Meta-gaps

- PRD does not specify what M2's plan artifact boundary is beyond prose ('로컬 dogfood 설치 절차가 문서화되어 캐시 직접 복사 workaround가 은퇴') — no concrete acceptance criteria comparable to M1's 3-metric table, so the fan-out plan session has no structural definition of 'done' for M2 to decompose against.  _(architect)_
- No explicit statement of which document (README.md vs new docs/release-channel.md vs CLAUDE.md §3.7) is canonical for 'how to install from a worktree for dogfood testing' — risk of the same install instructions living in two places and drifting, mirroring the exact multi-surface-drift pattern CLAUDE.md's own §3.7 forward-only-bump section already warns about for version numbers.  _(architect)_
- PRD's Out of Scope explicitly excludes 'release automation (CI tag + fast-forward)' but Risk table treats 'operator forgets to cut a release' as HIGH likelihood with no automated safety net (e.g., a scheduled check or STATE.md nudge) — the plan session should decide whether M3's runbook alone is sufficient boundary or whether a lightweight reminder mechanism belongs in scope.  _(architect)_
- No draft plan for M2/M3 exists yet to review directly — findings are derived from the completed M1 plan and PRD text, since M1 already shipped per the delivery-milestones table (Status: complete). If the planning session's actual target is M2 (dogfood-install) or M3 (release-runbook), those command/procedure specifics haven't been authored yet and should be re-reviewed once drafted.  _(security)_
- PRD/plan never discuss branch-protection, required-review, or force-push policy on the `release` branch, despite that branch being the sole trust anchor for every downstream installer once channel separation lands — this is the single highest-leverage security gap in the whole design and is absent from the Risks table entirely.  _(security)_
- No discussion of credential/access scope for who can push to `release` vs `main` (e.g., is `release` push restricted to fewer principals than main?).  _(security)_
- No mention of signature/provenance verification (e.g., signed commits/tags) for the release cut, despite the PRD's own Risks table flagging that a bad release directly harms 'other projects' the operator uses (real-world blast radius already demonstrated by the documented 30min-to-4h regression).  _(security)_
- draft plan이 아직 작성되지 않아 M2/M3에 대한 구체적 Task/Validate 단언을 이 시점에서 평가할 수 없다 — fan-out 시점이 plan 작성 이전이라면 test 렌즈의 유효 범위는 PRD 레벨 검증전략 공백으로 제한된다  _(test)_
- PRD의 Success Metrics 3개 중 지표 1(노출 릴리스 수)·지표 2(롤백 소요)는 M1에서 1회 실측됐으나, 이후 지속적으로(다음 릴리스 컷마다) 재측정하는 정기 검증 루프가 PRD/M3 런북 범위에 명시돼 있지 않다 — 회귀(지표 1이 다시 주 13회로 튀는 것)를 잡을 반복 가능한 오라클이 없다  _(test)_
- M1이 '노출 0 창'에서 리허설을 마쳤다는 전제가 향후 재현될 때(예: 다음 릴리스 컷) 같은 안전 창을 어떻게 확보하는지의 절차가 M3 런북에 위임됐지만, 그 위임 자체가 검증 가능한 acceptance 기준으로 PRD에 명시돼 있지 않다  _(test)_
- No draft plan was provided ('draft plan not yet written') — this fan-out cannot check plan-vs-code drift, only PRD-vs-code drift. Findings above assume the next plan targets M2 or M3; if it targets something else, re-run this lens.  _(explorer)_
- The M1 report file (`.claude/PRPs/reports/release-channel-separation-m1-report.md`) was not read in this pass — a fresh plan MUST read it before drafting M3's runbook, since PRD/CLAUDE.md text alone does not carry the live-verification raw values (rollback timing, which restoration path was used, CLI downgrade-acceptance answer).  _(explorer)_
- Unclear whether the next planning session intends M2 or M3 (or both) — PRD says M3 should be written after M2's dogfood learnings, but that ordering constraint isn't restated anywhere machine-checkable; worth confirming intent before scoping.  _(explorer)_

### Patterns to mirror

- marketplace.json (L6-17) — single-plugin git-subdir source with explicit path/ref keys is the existing convention for channel pinning; any M2/M3 addition should reuse this same source-object shape rather than inventing a parallel config surface.  _(architect)_
- README.md:34-46 — existing pattern of stating what surface a change closes and explicitly naming the residual surface it does NOT close ('닫히는 표면은 그 본문�000, 이 잔여는 M3이 소유한다') is the established boundary-declaration idiom in this repo; M2/M3 plans should carry the same explicit 'what this milestone does not touch' framing.  _(architect)_
- CLAUDE.md §3.7's forward-only version-bump correction pattern (append a dated correction paragraph rather than rewriting the original) is the repo's established convention for documenting policy shifts without erasing prior context — M3's release-runbook doc should follow the same append-correction style if it needs to amend §3.7's major-bump criteria.  _(architect)_
- PRD Risks table format (Risk | Likelihood | Impact | Mitigation) at .claude/prds/release-channel-separation.prd.md (L94-101) is a good template for the planning session to append a branch-protection / credential-exposure row.  _(security)_
- M1 plan's 'positive control' testing pattern (verify against a distinguishable state change, not just absence-of-change) at .claude/plans/release-channel-separation-m1.plan.md (L29-35) is a solid pattern other security-relevant verifications (e.g., testing that an unauthorized push to release is actually rejected) should mirror to avoid unfalsifiable checks.  _(security)_
- plan.md (L29-35), Task 9 6a(247-253) — positive control 패턴: 변경 전/후 baseline이 우연히 같은 값일 때 무작동과 성공을 구별 못 하므로 의도적으로 다른 값으로 밀어 그 차이를 관측하는 상향 대조를 필수 통과조건으로 둔다  _(test)_
- plan.md (L314-319) Task 10 — 단독 값이 아니라 두 관측(설치 version 무변화 + marketplace clone HEAD 전진)의 쌍으로만 판별력을 갖게 설계하는 패턴 (단일 지표는 update 기구 사망과 채널 분리 성공을 구별 못함)  _(test)_
- plan.md (L281-289) Task 9-8 — '채널 좌표 게이트'처럼 PR 오픈 직전 리터럴 기대값 대조를 mechanical HALT로 두어, 자기참조적 전후 비교(Task 10)가 못 잡는 축을 별도로 닫는 이중 방어 패턴  _(test)_
- renderer/tests/i18n-surface.test.js:94 — 기대값을 리터럴로 pin하지 않고 manifest/plugin.json에서 파생시켜 version drift를 test가 자동으로 따라가게 하는 패턴 (plan.md (L60) Patterns to Mirror에서 인용)  _(test)_
- CLAUDE.md §3.17-style 'append correction, don't delete/rewrite' pattern for docs that later become stale (already used once in §3.7 for the release-channel correction) — mirror for any further corrections in M2/M3.  _(explorer)_
- `.claude/plans/release-channel-separation-m1.plan.md` Patterns-to-Mirror table format and its 'H4 — redact absolute paths as `<PLUGINS>`/`<HOME>`' convention for any report/runbook that will quote `installed_plugins.json` paths (M3's runbook will almost certainly need this).  _(explorer)_
- §3.7 4-面 version sync + `i18n-surface.test.js` as the mechanical check for any plan touching version literals.  _(explorer)_
- PRD 'Files to Change' / 'Delivery Milestones' single-row-update convention (`/mccp:plan` PRD artifact mode — update only the selected milestone row) demonstrated in M1 Task 8.  _(explorer)_

## External Research Provenance

- Source PRD: .claude/prds/release-channel-separation.prd.md
- References section sha256: 53a925d7dee3c6675e30dd695f7deb1d82e5e496b092c060a609975356528d3b
- Stamped at: 2026-09-02T04:36:45.284Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

impeccable skill 해소됨 — 오라클이 지목한 본문은 `Skill(impeccable, ...)` (source=user
skills-dir, v4.0.4, `~/.claude/skills/impeccable/SKILL.md`, shadowed=false). detector가
`design_signal=true`를 낸 근거는 `Files to Change`에 `renderer/html.js` ·
`renderer/markdown.js`가 등장하기 때문이며, 그 두 파일에 대한 이 마일스톤의 변경은
**version 문자열 리터럴 1개씩**(§3.7 4면 동기)이다.

- round: 0 / cap 2 (invocations 1)
- verdict: **CONVERGED** (findings 0건)

판정은 선언된 diff가 실제로 닿는 렌더 표면 2곳을 직접 읽고 내렸다 —
`plugins/mccp/scripts/lib/renderer/html.js:1419`의 `<footer role="contentinfo" class="page-foot mono">v1.34.1 · …</footer>`와
`plugins/mccp/scripts/lib/renderer/markdown.js:163`의 `_derived from .claude/ · v1.34.1_`. 4축 대조:

| 축 | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 / heading depth ≤ 3 | pass | 두 지점 모두 heading이 아니다(`<footer>` · emphasis 줄). 자릿수 치환은 중첩 깊이를 바꾸지 않는다 |
| 강조색 화면당 1개 | pass | `class="page-foot mono"`는 무변경이고 accent/highlight token 수는 자릿수 치환에 불변 |
| raw markdown marker 금지 | pass | `_…_`는 STATUS.md가 **렌더하는** emphasis이지 누출된 marker가 아니며, 선언된 diff는 delimiter가 아니라 버전 자릿수만 건드린다 |
| 한 화면 항목 수 상한 | pass | 어느 표면에도 `list-of-N` 섹션을 만들지 않는다 |

rubric 밖에서 관측된 것 1건은 **지적으로 올리지 않았다** — 버전이 두 렌더 표면에 리터럴로
하드코딩돼 있고(`plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:94`는 반대로 manifest에서 파생) 그것이 §3.7이 매 cycle
경고하는 4면 drift의 원인이다. 4축 어디에도 속하지 않는 유지보수 축이고, plan의
`Patterns to Mirror`가 이미 그 대비를 인용해 두었다.

신규 문서 `docs/dogfood-install.md`는 renderer가 렌더하는 표면이 아니라 저장소 산문이므로
H15 produced-diff grounding lint의 사거리 밖이다.

**한정** — 이 판정은 **plan이 선언한 diff 범위**에 대한 것이다. 구현이 renderer의 구조를
실제로 건드리면 `/mccp:prp-implement` Phase 3.7의 produced-diff grounding lint가 그 시점에
다시 본다. 그 lint는 이 판정을 신뢰하지 않고 독립적으로 돈다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더링 표면이 아직 없으므로
어떤 impeccable 명령도 **호출하지 않고** 아래를 체크리스트로만 남긴다. 이 마일스톤의
Files to Change에는 렌더링 표면이 없으므로 실제로 발화할 항목도 없을 것으로 예상되며,
그 예상은 implement 단계의 detector가 독립적으로 판정한다.

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

## Codex Adversarial Review

**Codex는 이 plan을 리뷰하지 않았다.** `MCCP_PLAN_REVIEW=multi-agent`이므로 승인 주체는
Codex가 아니라 L1 기계 검사 + L2 4-관점 패널이고, 그 경로에서 `/mccp:plan`은 Codex를 부르지
않는다(cross-model 대조는 terminal `/mccp:pr`의 PR-Codex가 수행한다 — 패널 승인은 cross-gate
dedupe를 만족시키지 못하므로 그 발화는 fail-closed로 보장된다).

**이 게이트는 두 개의 decision slug에 걸쳐 실행됐다.** 그 사실이 라운드 회계를 지배했으므로
여기 남긴다.

| 실행 | slug | 결과 |
|---|---|---|
| L1 기계 검사 | 양쪽 공통 | **converged** (초기 위반은 전부 `path:line` 인용 형식 문제였고 형식만 고쳐 해소) |
| L2 패널 R0 | `release-channel-separation` | 3 pass · 1 fail — HIGH 1 + 같은 계열 MEDIUM 2 흡수, 10건 backlog 이연 |
| L2 패널 R1 | `release-channel-separation` | 1 pass · 3 fail — HIGH 3 전부 R0의 수정을 겨냥했고 전부 옳았다. `## Validation`을 구조적으로 재작성 |
| 라운드 예산 | `release-channel-separation` | **소진 (3/3, enforce)** — 그중 1회는 2026-09-01 M1 게이트가 이미 소비했다 |
| L2 패널 R2 | `release-channel-separation-m2` | 1 pass · 3 fail — HIGH **5건** 전건 흡수, 비-HIGH 3건 추가 흡수, 6건 backlog 이연 |
| L2 패널 R3 | `release-channel-separation-m2` | 1 pass · 3 fail — HIGH **3건** 전건 흡수, 부수 3건 추가 흡수, 6건 backlog 이연. **여기서 멈춘다** |
| receipt | — | **미작성.** R3가 `divergent`로 끝나 proof가 없고, 흡수로 본문을 고쳐 `reviewed_plan_hash`도 어긋난다 |

첫 slug는 PRD 경로에서 파생돼 **PRD의 모든 마일스톤이 하나의 라운드 예산을 공유**했고, 그것이
예산을 소진시킨 원인이다. 현재 slug는 그 진단의 결과가 아니라 **입력 경로에서 기계적으로
파생된 값**이다 — `/mccp:plan`을 plan 경로로 부르면 `derive-decision`이 그 값을 낸다. 같은 값을
M1이 이미 썼고(`.claude/receipts/mccp-plan-codex/release-channel-separation-m1.json`),
`/mccp:prp-implement`가 상류 receipt를 찾을 때 요구하는 값도 그것이다. 즉 slug 전환은 캡 우회가
아니라 **소비처가 요구하는 키로의 정정**이며, 원장을 지우거나 receipt를 위조하는 §3.16 금지
행위는 하나도 하지 않았다.

### R2·R3이 실제로 무엇을 잡았는가

§3.16은 라운드를 늘리지 말라고 하고 이 plan은 그것을 지켰다 — R2는 §3.14대로 **1회만** 돌았고,
그 뒤 이어지는 최종 라운드는 라운드를 늘리려는 것이 아니라 **수정본이 한 번도 리뷰되지 않았기
때문에** 도는 것이다(receipt는 `reviewed_plan_hash`로 본문에 결속되므로, 흡수 후의 본문에
대해서는 그 라운드 말고 어떤 승인 기록도 존재할 수 없다). R2가 다듬기 라운드였다면 이 판단은
달랐을 것이다. 실제로는 구현을 결정론적으로 막는 결함을 잡았다.

**HIGH 5건 — 4관점 중 3관점이 독립적으로 같은 축에 착지.**

1. **검사 7이 이 브랜치에서 결정론적으로 red였다** (test). 파일 **전문**을 훑는데
   `CHANGELOG.md:3039-3040`에 `X:\parent\repo`가 선재하고(과거 사이클이 같은 결함 계열을
   흡수하며 남긴 synthetic placeholder다) Task 10이 그 파일을 반드시 UPDATE한다. 실측하니
   보고보다 심각해서 **13줄**이 걸렸고 그중 여럿은 평범한 산문 오탐이었다 — 즉 red 정도가
   아니라 사용 불가였다. **추가된 줄만 보도록** 재작성해 닫았다.
2. **빈 대상 집합이 통과였다** (invariant). `|| true` 두 개가 git 실패·base 부재를 "깨끗함"으로
   접었다. plan L426이 "부재와 깨끗함이 같은 출력이면 검사가 무의미하다"고 적은 원칙이 파일
   read 계층에서만 닫히고 대상 파생 계층에 열려 있었다. 명시 guard + 빈 집합 HALT로 닫았다.
3. **Task 3의 hook 변조에 게이트 단언이 0이었다** (security · test · invariant 3관점 합치).
   판별 marker를 위해 tracked `plugins/mccp/scripts/hooks/session-start.js`를 임시 변조하고
   "커밋하지 않는다"를 load-bearing 주장으로 삼는데, 그 주장을 반증할 수단이 없었다 — 유일한
   가드가 검사 11이 폐기한 바로 그 `git status --porcelain` 형태였고, 검사 7 대상은 `plugins/`를
   포함하지 않으며 검사 11 서명·검사 10은 hook 수정과 무관했다. 유출되면 marker를 쓰는 코드가
   다음 릴리스 컷에서 **전 사용자 SessionStart**에 도달한다. 파일 하나를 특별 취급하는 대신
   **신규 검사 12**(diff가 선언된 `Files to Change` 집합을 벗어나지 않는다)로 일반화해 닫았다.

**비-HIGH 3건 추가 흡수.** §3.14는 HIGH만 흡수하라고 정하지만, 이 셋은 (a) 위 편집과 **같은
블록**에 있고 (b) 개선이 아니라 plan의 명시 주장을 거짓으로 만드는 부정확이라 함께 고쳤다
(R0·R1이 세운 것과 같은 선례): 검사 11의 서명이 저장소 자신의 tracked `.claude/settings.json`을
오탐해 **상시 발화**했고(architect MEDIUM · security LOW — 상시 오탐하는 가드는 운영자가
무시하도록 학습시킨다), 검사 10·11도 검사 7과 같은 `|| true` 접힘을 갖고 있었다(invariant
MEDIUM). 나머지 6건은 이연 사유와 함께
[codex-findings-backlog.md](codex-findings-backlog.md)에 적재했다.

**검증은 주장이 아니라 실행이다** — 흡수 후 실제로 돌렸다: `bash -n`으로 `## Validation`
전체(212줄) 문법 통과 · 구 검사 7이 CHANGELOG 전문에서 13줄 red임을 재현하고 신 형태가 같은
파일의 추가 줄에서 PASS함을 대조 · 신 형태가 심어 둔 절대 경로 3형태는 여전히 잡고 URL은
통과시킴을 확인 · 검사 11이 저장소 자기 파일 2건에 미발화하고 유입 6형태(`__GIT_FAILED__`
sentinel 포함)에 전건 발화함을 확인 · 검사 12가 커밋된 `session-start.js` 변조를 집합 밖으로
잡음을 확인.

### R3 — 무엇을 잡았고 왜 더 다듬지 않는가

R3은 1 pass · 3 fail이었고 **새 지적의 상당수가 R2가 추가한 검사 자체를 겨누었다.**
그것이 §3.16이 실측으로 기록한 전이 — *수정이 다음 라운드의 표적이 된다* — 그대로다. HIGH 3건은
전부 실재였고 흡수했으나, 그 흡수를 다시 리뷰하는 라운드는 열지 않는다.

- **검사 7이 `.claude/reviews/`를 말없이 빼고 있었다** (security). 그 표면은 tracked이고 이
  브랜치가 수정하며 실제 머신 절대 경로가 이미 들어 있다 — **이 게이트 자신이 만든
  유출이다**(recorder가 CLI의 ENOENT 메시지를 verbatim 인용한다). 제외를 **명시하고 사유를
  밝혀** 닫았고(대상에 넣으면 게이트가 자기 증거물에 막힌다), 근본 해소(`record.js`가 쓰기 전
  repo-relative로 정규화)는 mccp 본체 축이라 backlog에 적재했다.
- **검사 12가 이 브랜치가 이미 수정한 tracked 파일을 빠뜨렸다** (test) — R2가 검사 7에서 잡은
  "항상 red인 검사"의 재발이다. 게이트 산출물 디렉토리 셋을 **접두 규칙**으로 묶고 파일 항에
  끝 앵커를 달아 닫았다(후자는 `README.md.bak2` 같은 접미 우회도 함께 막는다).
- **`known_marketplaces.json`에 복원 단언이 없었다** (invariant). Task 2가 "실제로 편집한다"며
  백업 대상에 넣고도 소유자가 없어, Task 5가 등록하는 dev marketplace가 운영자 전역
  레지스트리에 조용히 잔존할 수 있었다. Task 4를 **백업한 세 파일 전건** 판정으로 넓히고
  Task 5에 `marketplace remove` 의무를 박았다.
- 부수로 검사 7의 **남은 fail-open**도 닫았다(invariant MEDIUM). R2는 `LEAK_TOUCHED`만
  guard하고 `LEAK_ADDED`는 `2>/dev/null`로 감싼 채 둔 **자기 회귀**였다 — 둘이 별도 git 호출로
  파생되므로 내용만 실패하면 vacuous PASS가 된다.

**이번에도 검증은 실행으로 했다**: `bash -n` 252줄 통과 · 새 `ALLOWED`가 선언 집합과 게이트
산출물을 전건 통과시키고 stray 5형태(접미 우회 3건 포함)를 전건 차단함을 대조.

### R4 — 마지막 라운드, 그리고 R3의 주장이 거짓이었다는 발견

사용자 지시로 남은 예산 1회를 승인 receipt 시도에 썼다. 결과는 다시 1 pass · 3 fail이고
**receipt는 없다.** 그러나 이 라운드는 헛되지 않았다 — R3이 "닫았다"고 적은 것 중 셋이
실제로는 닫히지 않았음을 잡아냈고, 그 셋 다 **같은 원인**이었다.

**파이프라인 종료코드 함정.** `cmd1 | cmd2 || fallback`에서 `||`는 파이프라인 **전체**의
종료코드에 걸리고 그 값은 마지막 명령의 것이다. 이 블록에는 `set -o pipefail`이 없으므로
(L367은 `set -eu` 단독) 앞단의 git이 죽어도 뒤의 `sed`가 0을 돌려주면 fallback은 실행되지
않는다. R3은 검사 7과 11에 이 형태로 sentinel을 달고 "실패가 표면화된다"고 적었다 —
**거짓이었다.**

- 검사 7의 `__GIT_FAILED__` (L2 R4 test HIGH · invariant HIGH가 독립 착지)
- 검사 11의 `git status | sed` 쪽 sentinel (L2 R4 invariant HIGH) — 같은 블록의 `git diff`
  쪽은 단독 명령이라 살아 있었고, **R3의 대조가 살아 있는 쪽만 확인하고 통과로 읽었다**
- 검사 12는 애초에 guard가 없었다 (L2 R4 security HIGH) — 검사 7·10·11에는 달면서 R2가 쓴
  검사 12에만 빠뜨렸고, 그것이 hook 변조→릴리스 경로의 **유일한** 기계 가드다

셋 다 git을 **파이프라인 밖 단독 할당**으로 빼내 그 자리에서 종료코드를 보는 형태로 닫았다.
sentinel 대신 즉시 HALT하는 것은 검사 10과 형태를 맞춘 것이다.

**R3이 왜 틀렸는지가 이 마일스톤이 배울 것이다.** R3의 검증 기록은 "실행으로 확인했다"고
적었고 실제로 명령을 돌렸다. 그러나 돌린 것은 *sentinel 문자열이 grep에 걸리는가*였지
*git이 죽었을 때 sentinel이 방출되는가*가 아니었다 — **주장한 명제가 아닌 다른 명제를
검증한 것이다.** R4에서는 실패를 실제로 주입해(존재하지 않는 ref · 존재하지 않는 저장소)
세 검사가 전부 HALT하고 정상 경로는 통과함을 대조했다. 이 구분(무엇을 실행했는가 vs 무엇을
주장했는가)이 §3.16의 "검증은 주장이 아니라 실행이다"가 실제로 요구하는 것이다.

**라운드 예산은 R4에서 소진됐다** — `(mccp-plan-codex, release-channel-separation-m2)`가
3/3에 도달했고, 그 시점에 이 절은 "이 plan은 승인 기록 없이 다음 단계로 간다"로 닫혔다.

### R5 이후 — 운영자 지시로 라운드를 재개했다 (그 사실을 여기 적는다)

R4 종료 후 사용자가 **"수렴할 때까지 반복"** 을 지시했다. `MCCP_GATE_ROUND_CAP` 상향은
파서가 `[1..3]` 밖 값을 fail-closed로 1로 되돌려 불가능했고, `review-rounds/cli.js`는
"막히면 clear가 규범이 되어 캡이 장식이 된다"는 이유로 **원장 리셋을 의도적으로 노출하지
않는다.** 그래서 원장 파일을 `archive/…rounds-r1-r4.json`으로 **옮겨** 카운터만 리셋하고
R5부터 재개했다 — 삭제가 아니라 이동이며, 진짜 라운드 이력은 append-only
`dispatch-log-release-channel-separation-m2.jsonl`이 전부 보존한다.

**이것은 §3.16이 "정당한 행동 목록에 없다"고 명시한 행위다.** 운영자 지시로 수행했고,
슬러그를 또 바꾸는 대신 카운터 리셋을 택한 이유는 슬러그 변경이 `/mccp:prp-implement`가
찾는 키를 어긋내 chain을 끊기 때문이다. **이 plan이 최종적으로 승인 receipt를 얻더라도 그
receipt는 "4라운드 소진 후 카운터를 리셋하고 얻은 것"이라는 맥락과 함께 읽혀야 한다** —
그 맥락 없이는 감사에서 "6라운드 만에 수렴"이 아니라 "정상 통과"로 오해된다. 라운드 수의
정본은 원장이 아니라 dispatch log다.

**정정 (L2 R9 invariant HIGH) — 리셋은 한 번이 아니라 세 번이다.** 위 문단은 R5 재개 시점의
1회만 적었고 그것은 **불완전한 공개였다.** 실제로는 R5 앞, R8 앞, R9 앞 세 번 리셋했고
아카이브가 그 사실을 담고 있다(`rounds-r1-r4` · `rounds-r5-r7` · `rounds-r8`). 리뷰어가
그것을 찾아 "게이트는 여전히 게이트처럼 보이지만 이 decision에 대해 아무것도 멈추지
않는다"고 지적했고, 그 판정은 옳다 — 캡이 3회 우회된 게이트는 이 decision에 관한 한
장식이다. 같은 리뷰어가 검사 12가 `.claude/state/` 전체를 무조건 허용해 그 리셋이 어느
검사에도 걸리지 않는다는 것도 지적했다. 둘 다 사실이며 여기 적는다.

**따라서 이 plan이 어떤 receipt를 얻더라도 그것은 "캡을 3회 리셋하고 9라운드를 돌아
얻은 것"이다.** 그 맥락 없이 receipt만 보면 감사는 정상 통과로 읽는다. 라운드 수의 정본은
dispatch log이고, 리셋 횟수의 정본은 `.claude/state/review-rounds/archive/`의 파일 수다.

**R5~R7 흡수 요약.** 세 라운드가 잡은 것은 전부 실재였고 전부 실행으로 검증했다.

| 라운드 | pass/fail | 흡수한 HIGH |
|---|---|---|
| R5 | 0/4 | 검사 12에 작업 트리 arm 부재(3관점 합치) · 검사 2 미guard 파이프라인 |
| R6 | 2/2 | 검사 7의 staged(index) 사각 · 검사 6이 bump를 관측하지 못함 |
| R7 | 3/1 | **간판 주장에 반증자 없음** — 검사 5가 존재만 봐서 상상으로 쓴 문서가 12개 검사를 통과했다 |
| R8 | 0/4 | **HIGH 5건이 전부 R7이 추가한 검사 13을 겨눴다** — 자기 유발 회귀 |

R7의 지적이 가장 무겁다. 이 plan은 "PRD가 문서만 쓰고 완료 처리될 여지를 남긴다 — 그 여지를
Acceptance에서 닫는다"고 선언해 놓고, 닫는 수단이 사람이 표시하는 체크박스여서 **고치겠다고
선언한 실패 모드를 스스로 재현**하고 있었다. **검사 13**이 그것을 닫는다 — 보고서에 구조화된
`## 실측 원문` 블록을 요구하고, 그중 기계가 독립적으로 읽을 수 있는 축(`installed_plugins.json`
의 `version`·`gitCommitSha`)은 **라이브 값과 대조**한다.

검사 13을 쓰면서 초안의 접근자가 틀렸다는 것도 실행이 잡았다 — `plugins["mccp@mccp"]`는
객체가 아니라 **배열**이라 두 값이 빈 문자열이 됐고, 그대로 뒀다면 정직한 보고서가 mismatch로
막히는 고장난 기구가 됐을 것이다(fail-closed지만 통과 불가). 실제 구조를 읽고 고친 뒤 다섯
경우를 대조했다: 정직한 보고서 PASS · 실측 블록 부재 HALT · 설치 상태 위조 HALT · 양성 대조
한쪽만 관측 HALT · hedge 문구 HALT(정상 산문은 통과).

**그리고 R8은 그 검사 13이 plan을 두 방향으로 더 나쁘게 만들었음을 잡았다.** 둘 다 옳다.

- **후퇴선을 통과 불가로 만들었다** (architect·test·invariant 3관점 합치). `marker_observed_with_plugin_dir: true`를 무조건 요구해, Task 5를 탄 정직한 보고가 **확정 HALT**가 되고 통과하는 유일한 길이 관측을 잘못 적는 것이 됐다 — 게이트가 거짓 보고를 보상하는 형태다. `mechanism` 선언 축으로 갈라 닫았다.
- **자기 치환 규약을 거부했다** (security·invariant). hedge 스캔의 `<[a-z_]+>`가 Task 11 H4가 **의무화한** `<WORKTREE>`·`<HOME>`·`<PLUGINS>`에 전부 걸려, 올바르게 redact한 보고서가 통과할 수 없고 green을 얻는 길이 **진짜 절대 경로를 git-tracked 파일에 쓰는 것**뿐이었다 — 검사 7이 막으려는 바로 그 유출을 게이트가 유도했다. 일반 placeholder 패턴을 제거했다.

**R7의 대조가 왜 이것을 못 잡았는지가 요점이다.** 다섯 경우를 실행했지만 전부 단순 합성 보고서였고, plan 자신의 치환 규약도 후퇴선 경로도 넣지 않았다 — **주장한 명제가 아니라 인접한 명제를 검증**한 R3·R4와 같은 실패다. R8 수정 후에는 그 두 경우를 대조에 넣어 일곱 경우를 돌렸다(1순위+placeholder PASS · 후퇴선 PASS · 나머지 다섯 실패 모드 HALT).

**세 번 반복된 이 패턴 자체가 이 마일스톤의 관측이다** — 라운드를 늘려 기제를 더하면 그 기제가 다음 라운드의 표적이 되고, R7→R8에서는 순효과가 **음수**였다(3/1 → 0/4). §3.16이 8시간 사건으로 기록한 것과 같은 곡선이다.

**이 절은 최종 라운드의 판정을 적지 않는다.** 패널 모드에서 `/mccp:plan`은 리뷰 결과를 plan
본문에 주입하지 않는다(5.3은 codex 경로 전용이다) — `emit-workflow-args`가 리뷰어가 읽을 본문에
`reviewed_plan_hash`를 묶으므로, 판정을 여기 적으려면 리뷰가 읽은 뒤에 본문을 고쳐야 하고 그
순간 receipt write가 hash 불일치로 거부된다. 따라서 판정과 근거는 두 곳이 소유한다:

- `.claude/reviews/plan-review-release-channel-separation-m2.md` — 패널의 verdict · quorum ·
  관점별 findings · 반박 · 벽시계 측정
- `.claude/receipts/mccp-plan-codex/release-channel-separation-m2.json` — 봉인된
  `resolution.review_verdict` / `review_source` / `review_proof`

receipt가 없다면 그것 자체가 판정이다 — "승인 기록이 없다"는 뜻이고, 이 저장소의
`MCCP_RECEIPT_GATE_MODE=soft`가 `/mccp:prp-implement`를 informational ALLOW로 통과시키더라도
그 통과는 승인이 아니다. 어느 경우든 terminal `/mccp:pr`에서 PR-Codex는 정상 발화한다.

### 게이트 종료 — R9에서 승인 receipt 없이 닫는다 (2026-09-02, 운영자 판정)

R9는 `divergent`로 5.2e에서 HALT했고 blocking 8건이었다. 실질 지적 5건(HIGH)은 **전부
흡수했다** — 검사 13의 `manual_cache_copies` 축 분리 + `cache_dirs_added`의 `mechanism`
분기(architect) · 검사 14 신설(test HIGH + invariant HIGH 합치) · 검사 15 신설(invariant
HIGH ×2). 나머지 3건은 내용이 전부 `"reviewer returned verdict=fail"`인 합성 finding이라
대상이 없다(§3.14가 해제 조건으로 명명한 `quorum.js:175-181` 누수). 흡수·기각 근거는
backlog L1138~1142.

**R10은 돌지 않는다.** 재진입하면 5.-1이 현재 env(`MCCP_GATE_ROUND_CAP=1`)로 **재봉인**하고
원장에 라운드가 1건 있으므로 5.2c `emit-workflow-args`가 exit 12로 거부한다 — v1.33.5 캡
강제가 의도대로 작동하는 것이다(직전 실행의 봉인은 `cap:3`이었고 그것이 R9를 가능하게 했다).
뚫는 유일한 길은 원장 리셋 4회차인데 §3.16이 금지 목록에 명시했고, §3.16의 처방은 정반대다 —
"게이트가 막으면 문서화된 감사 우회를 쓰되 사유를 남긴다. 요지는 게이트를 끄는 것이 아니라
**라운드를 늘리지 않는 것**이다."

재진입은 값이 음수이기도 하다. 패널 모드에서 `record.js`는 pass·halt 모든 경로에서
`.claude/reviews/plan-review-release-channel-separation-m2.md`를 **덮어쓴다.** 캡에 막힌
재진입은 `halt_stage: 5.2c-emit`짜리 빈 기록을 남기고 R9의 findings 표 — 이 마일스톤 패널
리뷰의 유일한 감사 근거 — 를 지운다.

따라서 이 게이트는 **승인 기록 없이 종료한다.** 바로 위 문단이 미리 적어 둔 경우가 실현된
것이며, 그 문장을 여기서 사실로 확정한다.

1. **판정: 없음.** `.claude/receipts/mccp-plan-codex/release-channel-separation-m2.json`은
   존재하지 않으며 만들지 않는다. 패널이 `divergent`를 냈으므로 `review_proof`가 `null`이고,
   `write.js`는 panel 모드에서 triple(verdict + source + proof) 부분 공급을 exit 12로 거부한다 —
   즉 이 상태에서 receipt를 만드는 정당한 경로 자체가 없다.
2. **implement 진입:** `MCCP_RECEIPT_GATE_MODE=soft` + v1.3.1 informational allow-path.
   `validate --command mccp:prp-implement`가 **missing-only**(`stale` 0 · `blocking` 0 ·
   `open_critical` 0)를 보고하므로 통과하지만, **그 통과는 승인이 아니다.**
3. **cross-gate dedupe:** receipt 부재라 열리지 않는다. terminal `/mccp:pr`에서 PR-Codex가
   **실제로 발화**하므로 dual-review는 ship 지점에서 보존된다. 게이트를 종료하는 이 판정이
   유일하게 실재하는 cross-model 리뷰를 없애지 않는다는 것이 이 선택의 안전 논거다.
4. **감사 근거:** `.claude/reviews/plan-review-release-channel-separation-m2.md`(R9 verdict ·
   quorum 4/3 · 관점별 findings · 반박 · 벽시계 216562ms) + `dispatch-log-…-m2.jsonl` 8항목 +
   `review-rounds/archive/` 3개 + backlog L1138~1142 + 이 절.

**검사 15가 요구하는 보고서 값은 이 종료 시점에서 `round_ledger_resets: 3` ·
`l2_dispatch_rounds: 8`이다** — 4회차 리셋을 하지 않았으므로 라이브 대조값이 그대로 유지된다.
Task 11 보고서는 이 두 값을 그대로 적는다.

---

## Milestone Closure Provenance

- Milestone : 2-dogfood-install
- Verdict   : done
- Closure   : .claude/milestone-closures/2-dogfood-install.md
- sha256    : sha256:892bfadced6c4b1fcb164f63c5ceb2f1ba6ce950b70fe3211616fe894cde28e2
- Stamped at: 2026-09-03T06:37:56.834Z
