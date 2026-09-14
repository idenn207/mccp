# Plan: release-channel-separation M1 — channel-pin

**Source PRD**: .claude/prds/release-channel-separation.prd.md
**Selected Milestone**: M1 channel-pin
**Complexity**: Medium

## Summary

`.claude-plugin/marketplace.json`의 plugin `source`를 상대 경로에서 `git-subdir` +
`ref: release`로 바꾸고, `release` 브랜치를 **사용자가 이미 설치해 둔 커밋**(`647dfec` =
v1.33.6)에 세운다. 그 결과 main 머지가 **plugin 본문을** 배포하는 일은 끝나고, 릴리스는
`release`를 움직이는 별도 행위가 된다. 이 마일스톤은 채널만 만들며 릴리스 컷(2.0.0)은 만들지
않는다.

**닫는 표면은 하나지 둘이 아니다** (L2 invariant HIGH 흡수). `known_marketplaces.json`의 mccp
항목에는 `ref`가 없어 marketplace clone은 계속 main을 추종한다(PRD Evidence 2번째 항목의
실측값 그대로). 따라서 M1이 닫는 것은 **plugin 본문 표면**이고, `marketplace.json` 자체의
편집(`source` · `ref` · PRD Open Question 2가 말하는 marketplace-entry `version`)은 여전히
main 머지 즉시 사용자에게 도달한다. 성공 지표 3은 그 한정 아래에서만 참이다 — 이 잔여를
Risks에 적고 M3으로 넘기며, "main 머지는 더 이상 배포가 아니다"라고 넓게 주장하지 않는다.

핵심 산출물은 manifest 한 줄이 아니라 **라이브 검증 1회**다 — (a) source 타입 변경이 운영자
자신의 설치를 깨지 않고, (b) main이 앞으로 나가도 설치 version이 변하지 않으며, (c) `release`를
되돌리면 이전 version이 실제로 설치되는지를 실측한다. (c)는 PRD Open Question 1(버전 하향을
CLI가 수용하는가)에 대한 답이기도 하다. **(a)와 (c)는 둘 다 머지 전에, 아직 어떤 사용자도
`release`를 해소하지 않는 창에서 수행한다** — 머지 후에 `release`를 되감으면 그것은 실험이
아니라 실제 강등 배포이기 때문이다(L2 architect·invariant HIGH 흡수).

**그 검증은 양성 대조(positive control)를 갖는다** (L2 architect·test·invariant HIGH 흡수,
round 0). 변경 전 설치 상태가 이미 `version: 1.33.6` · `gitCommitSha: 647dfec…` ·
`installPath: <PLUGINS>/cache/mccp/mccp/1.33.6`이므로(2026-09-01 실측), 그 값들을 기대값으로
삼는 관측은 "채널이 해소됐다"와 "update가 조용히 no-op이었다"를 구별하지 못한다 — 실패할 수
없는 검사다. 그래서 (a)는 `release` tip을 clone HEAD와 **다른 커밋**으로 옮긴 뒤 설치가 따라
움직이는 것으로만 증명하고(Task 9-6a, 필수), (b)는 설치 무변화와 clone 전진의 **쌍**으로만
판정한다(Task 10-2 ∧ 10-3). (c)는 OQ1의 답을 기록하되 (a)의 증명을 대신하지 않는다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | C0는 선행조건이 없는 group 0이므로 우산 PRD의 첫 착수 지점으로 진행한다 | direction |
| UI2 | M1은 사용자 가시 변화 0으로 착지한다 — 안전 장치를 켜는 일이 새 노출을 만들면 자기모순이다 | constraint |
| UI3 | 라이브 검증 1회를 포함한다. 검증 없이 롤백이 생겼다고 주장하지 않는다 | constraint |
| UI4 | 단일 릴리스 라인만 둔다. v1 유지 라인은 만들지 않는다 | exclusion |
| UI5 | `sha`를 쓰지 않고 `ref`만 둔다. 릴리스는 `release`를 fast-forward하는 행위다 | constraint |
| UI6 | 다음 릴리스 컷 번호는 2.0.0이지만 M1의 산출물이 아니다. M1은 release를 1.33.6에 두고 끝난다 | exclusion |
| UI7 | M1 단독이 MVP다. M2(dogfood 설치 문서화)와 M3(릴리스 런북)은 채널이 켜진 뒤에 쓴다 | exclusion |
| UI8 | §3.7 버전 체계 자체는 바꾸지 않는다. 번호의 소유자만 브랜치에서 릴리스 컷으로 옮긴다 | constraint |
| UI9 | 각 구현의 실측 테스트는 marketplace 배포가 아니라 별도 설치 경로로 진행한다 | direction |
| UI10 | 30분에서 4시간이 된 회귀의 근인은 규명하지 않는다. 그 회귀가 즉시 도달하는 경로만 닫는다 | exclusion |
| UI11 | in-flight worktree 5개가 이미 선언한 version은 회수하지 않는다 | exclusion |
| UI12 | 릴리스 자동화는 하지 않는다. 수동 절차가 먼저 한 번 돌아야 자동화 대상이 생긴다 | exclusion |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/lib/renderer/html.js:1419` | version 리터럴이 사는 4면 중 하나 — bump 시 함께 움직인다 |
| Errors | `plugins/mccp/scripts/lib/plan-review/l1-check.js:229` | 읽기 실패를 silent no-op이 아니라 명시 blocking으로 표면화 |
| Tests | `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:94` | 기대 version을 리터럴로 pin하지 않고 manifest에서 파생 |
| Docs | `docs/gate-design.md` | 배경 산문은 docs/가 소유하고 CLAUDE.md에는 포인터만 상주 |
| Rollback | `.claude/prds/release-channel-separation.prd.md` | 되돌릴 좌표를 먼저 만들고 나서 되돌릴 수 있는 변경을 한다 |

**공식 marketplace 코퍼스 실측 (2026-09-01)** — `~/.claude/plugins/marketplaces/claude-plugins-official/`
291개 항목 중 `ref`를 쓰는 것은 84건이고, **그 84건 전부가 `sha`를 함께 갖는다. `ref`만 두고
`sha`가 없는 항목은 0건이다.** 즉 UI5가 고른 형태는 스키마가 허용하지만 이 코퍼스 안에 선례가
없다. 가장 가까운 선례는 `oracle/netsuite-suitecloud-sdk`의 전용 배포 브랜치
`ref: "ai-plugins-dist"`(3건)이며 그것도 `sha`를 함께 pin한다. PRD Evidence의 "84건이 `ref`를
쓴다"는 참이지만 "`ref`만" 쓰는 선례가 있다는 뜻은 아니다 — 이 차이가 라이브 검증의 무게를
PRD가 상정한 것보다 크게 만든다.

**스키마 수용은 이미 확인했다** — `claude plugin validate`에 `{source: "git-subdir", url, path,
ref}`(sha 없음) manifest를 넣으면 exit 0으로 통과한다(2026-09-01 실측). 남은 미지는 스키마가
아니라 **이미 설치된 plugin의 source 타입이 바뀔 때의 fetch 동작**이다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `.claude-plugin/marketplace.json` | UPDATE | plugin `source`를 `./plugins/mccp`에서 `git-subdir` + `url` + `path` + `ref: release`로 전환 — 이 PRD의 유일한 기능 변경 |
| `README.md` | UPDATE | 설치가 받는 것이 main이 아니라 `release` 채널임을 명시. 채널이 생겼는데 README가 침묵하면 문서가 거짓이 된다 |
| `CLAUDE.md` | UPDATE | §3.7의 전제(version bump가 사용자에게 도달한다)가 이 변경으로 거짓이 된다. 번호의 **소유자**가 옮겨졌음을 그 절에 기록 (UI8 — 판정 기준은 불변) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | §3.7 patch bump. 동시에 이 bump가 성공 지표 3의 **계측 도구**가 된다 — main이 앞으로 나갔는데 설치 version이 안 변하는 것이 채널 분리의 증거다 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | §3.7 4면 동기 — page-foot version |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | §3.7 4면 동기 — derived 줄 version |
| `CHANGELOG.md` | UPDATE | §3.7 4면 동기 — 새 항목 + `currently` 노트 |
| `.claude/prds/release-channel-separation.prd.md` | UPDATE | M1 행을 `pending`에서 `in-progress`로 바꾸고 `Plan` 셀에 이 파일 경로 기입 |
| `.claude/PRPs/reports/release-channel-separation-m1-report.md` | CREATE | 라이브 검증 3건의 원문 증거를 담는다. Acceptance가 이 파일을 요구하는데 표에 없으면 착지 vehicle이 정의되지 않고 §1.2 dedupe 매칭에서 residual로 떨어진다 (L2 architect MEDIUM 흡수 — H4 유출 규칙이 적용되는 표면이라 함께 처리) |

`docs/release-channel.md`는 **여기서 만들지 않는다** — PRD가 M3 소유로 못박았고(UI7), M1의
라이브 검증이 실제로 무엇을 했는지 본 다음에 써야 상상이 아니라 기록이 된다. M1은 그 원재료를
구현 보고서에 남긴다(Task 11).

## Tasks

### Task 1: origin/main을 이 브랜치에 병합하고 삭제 사고를 검사한다
- **Action**: 이 브랜치의 base는 `d1db647`이고 origin/main(`647dfec`)은 조상이 아니다 —
  plugin.json이 1.33.1로 main의 1.33.6보다 뒤에 있다. `git merge origin/main`으로 따라잡는다.
  충돌은 파일 단위로 해소하고 **반대편이 새로 추가한 파일은 보존이 기본**이다.
- **Mirror**: CLAUDE.md §3.5.1 — PR #110이 intervening PR의 신규 파일 9개를 조용히 삭제한 선례
- **Validate**: `git diff --diff-filter=D --name-only origin/main...HEAD` 출력에 의도적으로
  지운 파일이 0건. 1건이라도 있으면 멈추고 조사한다. **추가 축도 함께 본다** —
  `git status --porcelain --untracked-files=all`에 Task 2의 백업 산출물이나
  `installed_plugins.json` 류 사본이 0건이어야 한다. `--diff-filter=D`는 삭제만 보므로
  신규 유입은 이 검사가 아니면 커밋 직전까지 아무도 보지 않는다 (L2 security HIGH 흡수)

### Task 2: 라이브 설치 상태의 복구 지점을 만든다
- **Action**: 이 마일스톤은 운영자 자신의 유일한 mccp 설치를 실험 대상으로 삼는다. 검증 전에
  `~/.claude/plugins/`의 `installed_plugins.json` · `known_marketplaces.json` ·
  `plugin-catalog-cache.json` 3개를 타임스탬프 붙여 백업하고, `marketplaces/mccp`의 현재
  HEAD SHA를 기록한다.

  **포인터만 백업하는 것으로는 복구가 성립하지 않는다** (L2 invariant HIGH 흡수). PRD가
  인용한 공식 문서는 `there is no rollback mechanism — the old cache entry is superseded`라고
  적는다. 즉 update가 캐시 엔트리를 파기할 수 있으므로, 포인터 JSON을 되돌려도 가리킬 본문이
  없을 수 있다. 따라서 `cache/mccp/mccp/1.33.6/` 디렉토리를 **목록이 아니라 내용째로**
  복사해 둔다. 복구 순서는 (1) `release`를 정상 tip으로 되돌리고 재-fetch → (2) 그래도
  본문이 없으면 백업 캐시를 되돌려 붙이고 포인터 JSON 3종을 복원, 이다. 캐시 복원이
  최후 수단이라는 사실 자체를 보고서에 적는다.

  **백업 목적지는 저장소 밖으로 고정한다: `$HOME/.claude/backup/mccp-m1-<timestamp>/`**
  (L2 security HIGH 흡수). 목적지를 비워 두면 구현자가 cwd(= 이 worktree)에 떨어뜨릴 수 있고,
  그 산출물은 `.gitignore`가 덮지 않아(`.gitignore`에 `*.bak` 일반 규칙 없음 — `.gitignore.bak`
  단건뿐) 그대로 staged될 수 있다. 그 파일들은 H4가 보고서에 대해 막으려는 데이터를 **원문으로**
  담는다 — 절대 `installPath`와 설치된 전 plugin 목록이다. H4는 보고서 한 파일만 다루므로 이
  경로를 덮지 않는다. **저장소 트리(worktree 포함) 안에는 어떤 백업물도 두지 않는다.**
  `~/.claude/plugins/` 하위도 피한다 — CLI가 스캔하는 트리다.

  백업 위치는 보고서에 **절대 경로가 아니라 `<HOME>` 치환형**으로 적는다(H4 참조).
- **Mirror**: PRD Risks 1행 — 검증 실패 시 manifest를 되돌리는 것이 곧 롤백이라는 구조
- **Validate**: 백업 3개 파일이 존재하고 원본과 sha256 동일. `cache/mccp/mccp/1.33.6/`
  백업본의 파일 수가 원본과 일치. **그리고 저장소 트리가 오염되지 않았다** —
  `git status --porcelain --untracked-files=all`이 백업 산출물을 한 건도 보이지 않는다
  (삭제만 보는 Task 1의 `--diff-filter=D`는 이 축을 못 본다 — L2 security HIGH 흡수)

### Task 3: `release` 브랜치와 롤백 좌표를 origin에 만든다
- **Action**: `git push origin 647dfecba75eecd9287ee538ca5f7056c7ba71da:refs/heads/release`.
  이어서 그 커밋에 `mccp--v1.33.6` 태그를 찍어 push한다(`claude plugin tag`가 만드는 이름
  규약과 같은 형태). **manifest 변경보다 먼저 해야 한다** — `ref: release`가 main에
  도달했는데 origin에 그 ref가 없으면 사용자의 다음 marketplace update가 해소에 실패한다.
  태그는 UI5가 `sha`를 포기한 대가를 갚는 좌표다: 브랜치가 움직여도 되돌릴 지점이 남는다.
  브랜치와 태그 push는 사용자 노출을 만들지 않는다 — manifest가 아직 그것을 가리키지 않기
  때문이다(UI2).
- **Mirror**: PRD Risks 2행 — 릴리스 컷마다 태그를 함께 찍는다
- **Validate**: `git ls-remote origin refs/heads/release refs/tags/mccp--v1.33.6`가 두 ref를
  모두 반환하고 `release`의 SHA가 `647dfec` 로 시작

### Task 4: marketplace.json을 git-subdir + ref로 전환한다
- **Action**: `plugins[0].source`를 문자열 `"./plugins/mccp"`에서
  `{"source": "git-subdir", "url": "https://github.com/idenn207/mccp.git", "path": "plugins/mccp", "ref": "release"}`
  로 바꾼다. **`sha`는 넣지 않는다**(UI5) — 넣으면 `sha`가 유효 핀이 되어 릴리스마다 manifest
  편집이 필요해지고, `release` 이동만으로 릴리스가 성립한다는 설계가 무너진다. 다른 필드
  (`name` · `description` · marketplace `owner`)는 건드리지 않는다.
- **Mirror**: `oracle/netsuite-suitecloud-sdk`의 `ai-plugins-dist` 전용 배포 브랜치 형태 —
  단 그쪽은 `sha`도 pin하고 이쪽은 하지 않는다는 차이를 CHANGELOG에 적는다
- **Validate**: `claude plugin validate .` exit 0 — 단 **이것만으로는 통과가 아니다**
  (L2 test HIGH 흡수). 그 두 명령은 변경 전 manifest(`"source": "./plugins/mccp"`)에서도
  똑같이 exit 0이므로 판별력이 0이고, 저장소 어디에도 `marketplace.json`을 읽는 JS 소비처나
  test가 없어 태스크 누락·반쪽 적용·후일 되돌림을 잡을 것이 없다. 결과 **형태를 직접 단언**한다:

  ```bash
  node -e "
  const s=JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8')).plugins[0].source;
  const bad=[];
  if (typeof s!=='object'||s===null) bad.push('source is not an object (still the relative-path string?)');
  else {
    if (s.source!=='git-subdir') bad.push('source.source='+JSON.stringify(s.source));
    if (s.ref!=='release')       bad.push('source.ref='+JSON.stringify(s.ref));
    if (s.path!=='plugins/mccp') bad.push('source.path='+JSON.stringify(s.path));
    if (!s.url)                  bad.push('source.url missing');
    if ('sha' in s)              bad.push('source.sha present — UI5 forbids pinning a sha');
  }
  if (bad.length) { console.error('FAIL: '+bad.join(' · ')); process.exit(1); }
  console.log('ok: git-subdir + ref:release, no sha');
  "
  ```

  이 단언은 변경 전 트리에서 **실패한다** — 그것이 이 검사가 존재하는 이유다.

### Task 5: README에 채널 사실을 기록한다
- **Action**: `## 설치` 절에 3~4줄을 더한다 — 설치가 추종하는 것은 `release` ref이고 main은
  dogfood trunk이며, 릴리스는 PRD 단위로 잘린다는 사실. 설치 명령 자체
  (`/plugin marketplace add` · `/plugin install mccp@mccp`)는 **바뀌지 않으므로 그대로 둔다**.
  로컬 dogfood 설치 절차는 여기 쓰지 않는다 — M2 소유다(UI7).
- **Mirror**: README 기존 설치 절의 톤 — 명령 블록 뒤에 한 문단 산문
- **Validate**: `grep -n "release" README.md`가 새 문단을 반환하고, 설치 명령 2줄의 diff가 0

### Task 6: CLAUDE.md §3.7에 번호 소유자 이전을 기록한다
- **Action**: §3.7 서두의 "왜 중요한가"는 `claude plugin update`가 main의 version을 보고
  사용자 캐시 경로를 정한다는 전제 위에 서 있다. 이 마일스톤 이후 그 전제는 거짓이다 —
  사용자가 읽는 `plugin.json`은 `release`의 것이다. 절을 옮기거나 지우지 않고 **한 문단을
  추가**해 (a) 배포 표면이 `release`로 옮겨졌고 (b) 브랜치의 bump는 dogfood 빌드 번호이며
  (c) major/minor/patch 판정 기준은 그대로임을 적는다(UI8).
- **Mirror**: §3.17이 v1.32.0 정정을 원문 옆에 병기한 방식 — 낡은 문장을 지우지 않고 무엇이
  왜 달라졌는지 함께 남긴다
- **Validate**: `node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md` exit 0

### Task 7: version을 bump하고 4면을 동기화한다
- **Action**: §3.7 patch bump(PRD 내 단일 milestone). Task 1의 병합 직후와 `/mccp:pr` 진입
  직전에 **각각 재계산**한다 — sibling worktree 5개가 1.32.x~1.33.x를 이미 선언했고 병합
  중에도 origin/main이 새 번호를 발행할 수 있다(§3.7 forward-only, 실측 4회). 대상 4면:
  `plugins/mccp/.claude-plugin/plugin.json` · `plugins/mccp/scripts/lib/renderer/html.js`
  page-foot · `plugins/mccp/scripts/lib/renderer/markdown.js` derived 줄 · `CHANGELOG.md`의
  새 항목과 `currently` 노트.
- **Mirror**: `CHANGELOG.md`의 1.33.1 항목 — §3.7 재상향 사유를 항목 안에 적는 형식
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` 전건 통과

### Task 8: PRD의 M1 행을 in-progress로 바꾼다
- **Action**: `.claude/prds/release-channel-separation.prd.md`의 `Delivery Milestones` 표에서
  **1행만** `pending`에서 `in-progress`로 바꾸고 `Plan` 셀을
  `.claude/plans/release-channel-separation-m1.plan.md`로 채운다. M2·M3 행은 손대지 않는다.
- **Mirror**: `/mccp:plan` PRD artifact mode 규약 — 선택한 행만 갱신
- **Validate**: `grep -n "channel-pin" .claude/prds/release-channel-separation.prd.md`가
  `in-progress`와 plan 경로를 함께 보여주고, 표의 `pending` 잔여가 정확히 2건(M2·M3)

### Task 9: 병합 전 리허설 — source 타입 변경과 롤백 왕복을 노출 0 창에서 실측한다 (검증 a·c)
- **Action**: PRD의 미검증 1건은 "이미 설치된 plugin의 source **타입** 변경을
  `/plugin marketplace update`가 어떻게 처리하는가"다. 이것은 origin/main에 밀어 넣기 **전에**
  답할 수 있다 — marketplace clone(`~/.claude/plugins/marketplaces/mccp`)이 읽는 브랜치를
  일시적으로 이 feature 브랜치로 바꾸면 된다.
  1. 이 브랜치를 origin에 push한다(feature 브랜치 push는 사용자 노출 0).
  2. `known_marketplaces.json`의 `mccp.autoUpdate`를 일시적으로 `false`로 둔다 — 켜져 있으면
     검증 도중 clone이 main에서 다시 당겨져 실험이 조용히 무효가 된다.
  3. clone에서 `git fetch origin release-channel-separation` 후 그 ref를 체크아웃한다.
     manifest를 손으로 고치지 않고 브랜치를 그대로 쓰는 이유는, **머지 후 main에 실제로 있을
     바이트와 동일한 것**을 시험하기 위해서다.
  4. `claude plugin update mccp@mccp -y` 실행. clone 교체를 CLI가 못 보면
     `plugin-catalog-cache.json`을 지우고 1회 재시도한다. **재시도 후에도 update가 비영점으로
     끝나거나 `lastUpdated`가 갱신되지 않으면 거기서 멈춘다** — 그 실패 경로의 관측값은
     5단계 기대값과 정확히 같으므로, 분기를 적지 않으면 실패가 성공으로 기록된다
     (L2 invariant HIGH 흡수).
  5. `installed_plugins.json`을 읽어 `version` · `gitCommitSha` · `installPath` ·
     `lastUpdated`를 기록한다. **이 단계는 baseline이며 그 자체로는 증거가 아니다**
     (L2 architect·test·invariant HIGH 흡수). 기대값 `1.33.6` · `647dfec…` ·
     `<PLUGINS>/cache/mccp/mccp/1.33.6`은 2026-09-01 실측한 **변경 전 상태와 바이트 동일**
     하므로 무작동과 구별되지 않는다. `installPath`도 판별자가 아니다 — 상대경로 source에서도
     이미 같은 형태다(실측). 엔트리에 `source` 필드가 **존재하지 않으므로**(실측: `scope` ·
     `installPath` · `version` · `installedAt` · `lastUpdated` · `gitCommitSha` 6개뿐) source
     타입 전환을 엔트리에서 직접 단언할 수도 없다. 따라서 (a)의 성립은 6a로만 증명된다.
  6. **양성 대조와 롤백 왕복을 여기서 한다** (L2 architect·invariant·security HIGH 흡수).
     이 창에서는 origin/main의 manifest가 아직 상대 경로이므로 **`release`를 해소하는 소비자가
     이 리허설 clone 하나뿐**이다 — 즉 브랜치를 어느 방향으로 움직여도 제3자 노출이 0이다.
     머지 후에 같은 일을 하면 그것은 실험이 아니라 실제 배포가 되고 UI2를 M1 자신이 깨뜨린다.
     - `git fetch origin release` 로 `refs/remotes/origin/release`를 만든다. 이 추적 ref가
       없으면 인자 없는 `--force-with-lease`가 기대값을 갖지 못한다(Task 3은 SHA 직접
       push라 추적 ref를 만들지 않는다 — L2 invariant LOW 흡수).
     - **6a — 상향 대조 (필수, (a)의 유일한 양성 증거).** `release`를 이 feature 브랜치
       tip(1단계에서 이미 push했고 Task 7이 새 번호를 올린 커밋)으로 force-push한 뒤
       `claude plugin update mccp@mccp -y`. `version`이 **Task 7의 새 번호**로,
       `gitCommitSha`가 그 커밋으로 **바뀌면** git-subdir source가 실제로 fetch했다는 양성
       증거다. 상향을 고른 이유는 하향과 달리 CLI의 다운그레이드 수용 여부에 걸리지 않아
       (a)의 증명이 OQ1의 답과 독립하기 때문이다. 바뀌지 않으면 (a)는 성립하지 않으며 여기서
       멈춘다 — Task 4의 `source`에 `sha`를 추가하는 것이 첫 후퇴선이다.
     - **6b — 하향 왕복 (PRD Open Question 1).**
       `git merge-base --is-ancestor ab6bcaa 647dfec`로 조상임을 확인한 뒤
       `git push --force-with-lease origin ab6bcaa:refs/heads/release` (v1.33.4).
       `claude plugin update mccp@mccp -y` 후 `1.33.4`가 보이면 버전 하향을 CLI가 수용한다는
       답이고, 거부하면 그 출력 자체가 답이다(PRD 결정 3의 번호 정책 재검토 대상 — 보고서에
       명시). **어느 쪽이든 (a)의 증명은 6a가 이미 끝냈으므로 M1의 완료 판정은 6b의 결과에
       걸리지 않는다** — 반대로 6a 없이 6b의 '거부'만으로는 완료가 아니다
       (L2 architect HIGH 흡수).
     - **6c — 복원, 그리고 복원이 하향에 의존한다는 순환을 끊는다** (L2 invariant HIGH 흡수).
       `git push --force-with-lease origin 647dfec:refs/heads/release` 후
       `claude plugin update mccp@mccp -y`로 `1.33.6` 복귀를 확인한다.
       **여기에 순환이 있다**: 6a가 설치를 feature tip(Task 7의 새 번호 — 1.33.6보다
       높다)으로 올려 두므로 6b도 6c도 그 지점에서 보면 **하향**이다. CLI가 하향을
       거부한다면 — 그것이 6b가 검증하려는 명제 그 자체다 — 6c도 거부되어 운영자
       설치가 **미리뷰 브랜치 코드에 남는다**. 복원 절차가 자기가 검증하려는 가설을
       전제하는 순환이다. 그래서 복원은 **하향 수용에 의존하지 않는 경로를 반드시
       갖는다**: (1) update가 `1.33.6`을 보이면 끝. (2) 아니면
       `claude plugin uninstall mccp@mccp` 후 재설치 — 재설치는 하향이 아니라 신규
       해소라 버전 비교를 거치지 않는다. (3) 그래도 안 되면 Task 2의 캐시 백업 +
       포인터 JSON 3종 복원(최후 수단).
       **어느 경로로 복원했는지와 소요 시간을 보고서에 적는다** — 성공 지표 2(롤백
       소요)가 측정되는 유일한 지점이고, 6b가 거부로 끝났다면 지표 2를 만족시킨 것은
       하향 롤백이 아니라 그 대체 경로다. 그 사실을 지표 2 옆에 명시하지 않으면 PRD가
       가설로 세운 "되돌리면 이전 버전이 실제로 설치된다"가 반증됐는데도 지표가
       통과한 것처럼 읽힌다 (L2 invariant HIGH 흡수).
  7. clone을 `main`으로 되돌리고 `autoUpdate`를 복원한 뒤
     `claude plugin marketplace update mccp` + `claude plugin update mccp@mccp -y`로 원상복구.
  8. **채널 좌표 게이트 — 이 태스크를 떠나기 전 마지막 관문** (L2 invariant HIGH 흡수).
     `git fetch origin release && git rev-parse origin/release`가
     `647dfecba75eecd9287ee538ca5f7056c7ba71da`와 **정확히 일치**함을 확인한다. 아니면
     `git push --force-with-lease origin 647dfec:refs/heads/release`로 맞추고 다시 확인한다.
     6a·6b가 `release`를 feature tip과 `ab6bcaa`로 옮겨 놓았으므로, 세션이 중간에 끊기거나
     6c의 push가 실패한 채 PR이 머지되면 manifest의 `ref: release`가 **미리뷰 브랜치
     코드를 가리킨 채 사용자에게 즉시 배포된다** — M1이 자기 제약 UI2를 스스로 깨는
     경로다. Task 10의 전후 비교는 자기참조적이라(어떤 값이든 같기만 하면 통과) 이 축을
     막지 못한다. 기대값을 리터럴로 갖는 단언은 여기와 `## Validation`뿐이다.

  실패하면 Task 2의 복구 순서(먼저 재-fetch, 최후에 캐시 복원)를 따르고 **Task 4의 `source`에
  `sha`를 추가하는 것이 첫 후퇴선**이다(PRD 결정 2가 사고 대응용으로 이미 열어 둔 문). 후퇴했다면
  UI5가 성립하지 않으므로 그 사실을 보고서에 적고 PRD 결정 2의 재검토를 M3으로 넘긴다.
- **Mirror**: PRD Risks 1행 — 검증 실패 시의 복구가 곧 롤백이라는 구조
- **Validate**: **6a의 상향 대조가 이 태스크의 통과 조건이다** — `version`이 Task 7의 새
  번호로, `gitCommitSha`가 feature 브랜치 tip으로 **바뀐** 것을 관측한다. 5단계 baseline만
  으로는 통과가 아니다(변경 전 상태와 동일하므로). 6b는 결과를 기록하되 통과 조건이 아니며,
  그 뒤 `1.33.6` 복귀를 확인한다. 7단계 복원 후 `installed_plugins.json`이 Task 2
  백업과 의미상 동일(`version` · `gitCommitSha` 일치)이고 **`known_marketplaces.json`의
  `mccp.autoUpdate`가 `true`로 돌아와 있다** — 이 항목은 별도로 단언한다. 중간 실패로
  세션이 끊기면 자동 갱신이 꺼진 채 조용히 남기 때문이다(L2 invariant MEDIUM 흡수).
  **그리고 8단계의 채널 좌표 게이트** — `git rev-parse origin/release` ==
  `647dfecba75eecd9287ee538ca5f7056c7ba71da`. 이 단언이 통과하지 않으면 **PR을 열지
  않는다** — 머지되는 순간 미리뷰 코드가 배포된다 (L2 invariant HIGH 흡수). 6c의
  복원 경로((1) update · (2) uninstall+재설치 · (3) 캐시 백업)와 소요 시간이 보고서에
  기록돼 있다

### Task 10: 병합 후 비파괴 라이브 검증 (검증 b)
- **Action**: PR이 main에 머지된 **뒤에** 수행한다. 이 태스크가 끝나지 않으면 M1은 완료가
  아니다(UI3). **이 태스크는 `release`를 움직이지 않는다** — 머지 이후의 `release`는 사용자가
  실제로 해소하는 라이브 채널이고, 그것을 되감는 것은 실험이 아니라 강등 배포다. 롤백 왕복은
  Task 9 6단계가 노출 0 창에서 이미 끝냈다(L2 architect·invariant·security HIGH 흡수).
  1. `claude plugin marketplace update mccp` 후 `claude plugin update mccp@mccp -y`.
  2. **검증 b — 단독 관측이 아니라 3단계와의 쌍으로만 판별력을 갖는다** (L2 test HIGH 흡수).
     `installed_plugins.json`의 `version`이 여전히 `1.33.6`이고 `gitCommitSha`가 `647dfec`로
     시작함을 확인한다. 같은 시점 origin/main의 `plugin.json`은 Task 7이 올린 새 번호다.
     이 값만 보면 "채널이 분리됐다"와 "update 기구가 죽었다"가 같은 모습이므로, 아래 3단계의
     **clone이 main의 새 커밋으로 전진했다**는 관측과 반드시 함께 읽는다 — update가 죽었다면
     clone도 전진하지 않는다. 두 관측의 **쌍**이 성공 지표 3의 실측값이다.
  3. 잔여 표면도 함께 관측한다: 이 update로 marketplace clone은 main의 새 커밋으로 갱신됐다.
     즉 manifest 표면은 여전히 즉시 도달한다는 것이 같은 실행에서 확인되며, 그것이 요약과
     Risks가 적은 한정의 실측 근거다.
  4. 각 단계의 명령·출력·`installed_plugins.json` 발췌를 그대로 옮겨 적되, 절대 경로는
     치환형으로 적는다(H4 — Task 11 참조).
- **Mirror**: PRD Success Metrics 3의 측정 방법란 — 지표를 주장하지 않고 실측한다
- **Validate**: **쌍으로 단언한다** — (i) `installed_plugins.json`의 `version`·`gitCommitSha`
  무변화 **그리고** (ii) 이 실행을 마친 시점에 marketplace clone의 HEAD가 `origin/main`과
  **일치**(clone에서 `git rev-parse HEAD` == `git rev-parse origin/main`). (ii)를 "전후로
  달라진다"로 적지 않는 이유는 Task 9-7이 `autoUpdate`를 `true`로 되돌려 놓아 세션 부팅의
  자동 갱신이 이미 clone을 전진시켜 두었을 수 있고, 그러면 성공한 실행이 미완료로 판정되기
  때문이다 — 목적은 델타가 아니라 "갱신 기구가 살아 있다"이다 (L2 architect MEDIUM —
  직전 흡수가 만든 결함이라 함께 처리). 둘 중 하나만으로는 통과가 아니다. 더해
  `git rev-parse origin/release` == `647dfecba75eecd9287ee538ca5f7056c7ba71da` · `claude plugin list`가 `mccp@mccp`를 정상 보고 ·
  이 태스크 실행 전후로 `git rev-parse origin/release`가 **동일**(채널을 건드리지 않았다는
  기계적 증거)

### Task 11: M3이 옮겨 적을 원재료를 보고서에 남긴다
- **Action**: `.claude/PRPs/reports/release-channel-separation-m1-report.md`에 Task 9·10이
  실제로 실행한 명령 순서, 관측값, 복원 절차, 그리고 실패했을 때 무엇을 했는지를 기록한다.
  이것이 M3 런북의 원재료다 — M3은 상상해서 쓰지 않고 여기서 옮겨 적는다(UI7).
  **런북 자체를 여기서 쓰지 않는다.**

  **H4 — 절대 경로를 그대로 옮겨 적지 않는다** (L2 security HIGH 흡수).
  `.claude/PRPs/reports/`는 `.gitignore`가 무시하지 않는 **git-tracked** 표면이고,
  `installed_plugins.json`의 `installPath`와 백업 경로는 머신·계정명을 담은 절대 경로다.
  §3.12가 `meta.cwd`에서 이미 치른 유출 유형이며 처방도 같다(`write.js`의
  `normalizeReceiptCwd`). 발췌를 옮길 때 홈 디렉토리 접두를 `<PLUGINS>`로 치환해
  `<PLUGINS>/cache/mccp/mccp/1.33.6` 형태로 적는다. `version` · `gitCommitSha` · exit code는
  그대로 두며, 치환은 경로에만 적용한다 — 증거를 흐리는 것이 아니라 증거가 아닌 부분만
  지우는 것이다. 이 plan 자신의 `## Validation` 블록도 같은 이유로 절대 경로를 쓰지 않는다.
- **Mirror**: `plugins/mccp/scripts/receipt/write.js`의 `normalizeReceiptCwd` — 절대 cwd 대신
  repo-relative를 봉인한 선례
- **Validate**: 보고서가 존재하고 Task 9·10의 모든 관측값(version · gitCommitSha · exit code)을
  포함하며, 예상값을 실측처럼 적은 문장이 0건.
  `grep -nE "C:\\\\+Users|/Users/|Administrator" .claude/PRPs/reports/release-channel-separation-m1-report.md`
  가 **0건**

## Validation

```bash
# manifest — 스키마와 파싱
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'))"
claude plugin validate .

# ref가 origin에 실재하는지 (manifest가 가리키는 대상)
git ls-remote origin refs/heads/release refs/tags/mccp--v1.33.6

# manifest가 실제로 전환됐는가 — 변경 전 트리에서 **실패해야** 하는 단언
node -e "
const s=JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8')).plugins[0].source;
const bad=[];
if (typeof s!=='object'||s===null) bad.push('source is not an object');
else {
  if (s.source!=='git-subdir') bad.push('source.source='+JSON.stringify(s.source));
  if (s.ref!=='release')       bad.push('source.ref='+JSON.stringify(s.ref));
  if (s.path!=='plugins/mccp') bad.push('source.path='+JSON.stringify(s.path));
  if (!s.url)                  bad.push('source.url missing');
  if ('sha' in s)              bad.push('source.sha present - UI5 forbids it');
}
if (bad.length) { console.error('FAIL: '+bad.join(' | ')); process.exit(1); }
console.log('ok');
"

# 채널 좌표 게이트 — PR을 열기 전 반드시 통과해야 한다(기대값을 리터럴로 갖는 두 지점 중 하나)
git fetch origin release
[ "$(git rev-parse origin/release)" = "647dfecba75eecd9287ee538ca5f7056c7ba71da" ] \n  || { echo 'HALT: origin/release is not at the release coordinate'; exit 1; }

# 저장소 오염 — Task 2 백업물이 트리에 유입하지 않았는가(삭제만 보는 검사는 이 축을 못 본다)
git status --porcelain --untracked-files=all

# 4면 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# CLAUDE.md 절 이전/소실 검사
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# 이 브랜치가 조용히 지우는 파일이 없는가
git diff --diff-filter=D --name-only origin/main...HEAD

# 라이브 상태 (Task 9·10에서 실측) — 절대 경로를 리터럴로 쓰지 않는다(H4).
# 홈은 os.homedir()로 얻고, 출력의 installPath는 <PLUGINS> 치환형으로 찍는다.
node -e "
const os=require('os'),p=require('path');
const root=p.join(os.homedir(),'.claude','plugins');
const e=require(p.join(root,'installed_plugins.json')).plugins['mccp@mccp'];
console.log(JSON.stringify(e.map(x=>Object.assign({},x,{installPath:String(x.installPath).split(/plugins[\\\\/]/).pop()?'<PLUGINS>/'+p.relative(root,x.installPath).split(p.sep).join('/'):null})),null,2));
"
claude plugin list

# 채널을 건드리지 않았다는 기계적 증거 (Task 10 전후로 동일해야 한다)
git fetch origin release && git rev-parse origin/release
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| source 타입 변경이 운영자의 유일한 설치를 깨뜨린다 — 깨지면 다른 프로젝트의 게이트가 함께 멈춘다 | 중 | Task 2의 백업 3종이 복구 지점이고, Task 9가 **머지 전에** 같은 경로를 리허설한다. 후퇴선은 `sha` 추가(PRD 결정 2가 열어 둔 문) |
| `ref`만 두고 `sha`가 없는 형태의 선례가 공식 코퍼스 291건 중 **0건**이다 | 중 | 스키마 수용은 `claude plugin validate` exit 0으로 이미 확인했다. 남은 미지는 fetch 동작이고 그것이 Task 9의 존재 이유다. 실패 시 `sha` 추가로 후퇴하되 UI5 미성립을 보고서에 명시 |
| `autoUpdate: true`가 리허설 도중 clone을 main에서 다시 당겨 실험을 조용히 무효화한다 | 중 | Task 9 2단계에서 `autoUpdate`를 일시 `false`로 두고, 각 update 호출 직전에 clone의 HEAD를 확인한다 |
| manifest가 `ref: release`를 가리키는데 origin에 그 ref가 없어 해소가 실패한다 | 낮음 | Task 3이 Task 4보다 **먼저** 실행되도록 순서를 고정했다. Validation의 `git ls-remote`가 그 순서를 기계적으로 확인한다 |
| 하향 왕복(Task 9-6)이 실패해 운영자가 1.33.4에 남는다 | 낮음 | 복원은 force-push 1회와 update 1회이고 `mccp--v1.33.6` 태그가 복원 좌표다. **캐시가 남아 있다고 가정하지 않는다** — PRD:113이 인용한 문서는 `the old cache entry is superseded`라 적으므로, 복구는 재-fetch가 1차이고 Task 2가 내용째 떠 둔 캐시 백업이 최후 수단이다 (L2 invariant HIGH 흡수) |
| **manifest 표면은 닫히지 않는다** — `known_marketplaces.json`에 `ref`가 없어 marketplace clone은 계속 main을 추종하므로, `marketplace.json` 자체(및 PRD OQ2의 marketplace-entry `version`) 편집은 머지 즉시 사용자에게 도달한다 | 확실(설계상) | M1이 닫는 것은 plugin 본문 표면뿐임을 요약·Acceptance에 명시하고 성공 지표 3을 그 한정으로 읽는다. Task 10-3이 같은 실행에서 이 잔여를 관측한다. 이 표면까지 닫으려면 marketplace 등록 자체에 `ref`를 붙여야 하고 그것은 사용자의 재등록을 요구하므로 **M3 소유**다 (L2 invariant HIGH 흡수) |
| 라이브 검증이 운영자의 유일한 설치에 미리뷰 브랜치 코드를 설치한다 | 중 | Task 9는 자기 브랜치 코드를 대상으로 하므로 의도된 dogfood다. 7단계 복원과 `autoUpdate=true` 복귀를 Validate가 별도로 단언한다 |
| origin/main 병합이 intervening PR의 신규 파일을 조용히 삭제한다 (§3.5.1 PR #110 선례) | 중 | Task 1의 `--diff-filter=D` 검사가 커밋 전 의무 게이트 |
| sibling worktree와 version 번호가 충돌한다 (§3.7 forward-only, 실측 4회) | 높음 | Task 7이 병합 직후와 `/mccp:pr` 직전 **두 번** 재계산한다. 재상향 시 4면과 PR title을 다시 맞춘다 |
| 채널을 나눈 뒤 릴리스 컷을 잊어 사용자가 몇 달째 1.33.6에 머문다 | 높음 | **M1이 해결하지 않는다.** PRD가 명시한 대로 컷 트리거 결속은 M3 런북 소유다. 노출 감소의 실패 모드가 노출 0이라는 사실을 보고서에 남긴다 |
| 라이브 검증이 실패할 수 없는 형태로 기록되어 채널이 죽었는데 완료 판정된다 | 중 | 변경 전 설치 상태가 이미 `1.33.6`/`647dfec`라 baseline 관측은 무작동과 구별되지 않는다(실측). Task 9-6a 상향 대조를 통과 조건으로 두고, Task 10은 무변화와 clone 전진의 쌍으로만 판정한다. Acceptance 1·3이 그 형태를 요구한다 (L2 architect·test·invariant HIGH 흡수) |
| **6a·6b가 `release`를 옮긴 채 PR이 머지되어 미리뷰 코드가 사용자에게 배포된다** | 중 | Task 9-8 채널 좌표 게이트(`origin/release` == `647dfec…` 리터럴)가 PR 직전 관문이고 `## Validation`이 같은 단언을 갖는다. Task 10의 전후 비교는 자기참조적이라 이 축을 못 막는다 (L2 invariant HIGH 흡수) |
| 복원이 자기가 검증하려는 가설(하향 수용)을 전제해 6b 거부 시 운영자가 미리뷰 코드에 남는다 | 중 | 6c가 하향 무관 경로를 명시한다 — uninstall+재설치(버전 비교 미경유), 최후에 캐시 백업 복원. 지표 2를 만족시킨 경로가 하향 롤백인지 대체 경로인지를 보고서에 구분해 적는다 (L2 invariant HIGH 흡수) |
| Task 2 백업물(절대 `installPath` · 설치 plugin 전체 목록)이 저장소에 커밋된다 | 중 | 목적지를 `$HOME/.claude/backup/mccp-m1-<ts>/`로 고정하고 저장소 트리 내 배치를 금지. Task 1·Task 2 Validate와 `## Validation`이 `git status --porcelain --untracked-files=all`로 추가 축을 본다 — `--diff-filter=D`는 삭제만 본다 (L2 security HIGH 흡수) |
| 병합 후 설치 version이 바뀌어 이 세션의 명령 경로(1.33.6 캐시)가 어긋난다 | 낮음 | `claude plugin update`는 restart 이후에 적용되므로 실행 중 세션에 즉시 반영되지 않는다. Task 10의 관측은 동작이 아니라 `installed_plugins.json` 읽기로 한다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)

이 마일스톤에서 마지막 항목이 요구하는 **구체적 산출물**은 다음 셋이고, 셋 다
`.claude/PRPs/reports/release-channel-separation-m1-report.md`에 원문으로 실려야 한다.

1. **Task 9-6a 상향 대조 발췌 — 검증 (a)의 유일한 양성 증거다.** `release`를 feature 브랜치
   tip으로 옮긴 뒤 설치 `version`이 Task 7의 새 번호로, `gitCommitSha`가 그 커밋으로 **바뀐**
   관측. Task 9-5의 baseline 발췌는 그 옆에 함께 싣되 **그것만으로는 이 항목을 충족하지
   않는다** — 변경 전 상태와 바이트 동일하기 때문이다(2026-09-01 실측).
2. Task 9-6b 하향 왕복 발췌 — `1.33.4` 관측과 `1.33.6` 복귀, 또는 거부됐다면 그 출력
   (PRD Open Question 1). **이 항목은 OQ1의 답을 기록하는 것이지 (a)를 증명하지 않는다.**
   **노출 0 창에서 수행됐다는 증거**로 그 시점 origin/main의 `marketplace.json`이 아직
   상대 경로였음을 함께 적는다.
3. **Task 9-8 채널 좌표 게이트의 출력** — PR을 열기 직전 `git rev-parse origin/release`가
   `647dfecba75eecd9287ee538ca5f7056c7ba71da`임을 보인 실측값. 이것이 없으면 6a·6b가 옮겨
   놓은 `release`가 그대로 머지되어 미리뷰 코드가 배포될 수 있다(UI2 자기파괴).
4. **6c의 복원 경로와 소요 시간** — (1) update · (2) uninstall+재설치 · (3) 캐시 백업
   중 어느 것으로 `1.33.6`에 돌아왔는지와 그 시간. **지표 2를 만족시킨 것이 하향
   롤백인지 대체 경로인지를 명시한다** — 구분하지 않으면 PRD의 가설이 반증됐는데도
   지표가 통과한 것처럼 읽힌다.
5. **Task 10-2와 10-3의 쌍** — origin/main의 `plugin.json`이 Task 7의 새 번호인 시점에 설치
   `version`이 **여전히** `1.33.6`이고, **같은 실행에서 marketplace clone의 HEAD가 main의 새
   커밋으로 전진**했다(검증 b). 전진 관측이 없으면 무변화는 update 기구 사망과 구별되지
   않는다. 그리고 Task 10 전후의 `origin/release` SHA 동일.

다섯 중 하나라도 없으면 M1은 완료가 아니다. 지표 2(롤백 소요)와 지표 3(main 머지의 사용자
도달 0)은 이 세 발췌 말고는 측정할 방법이 없고, 측정 없이 주장하는 것이 UI3이 금지한 바다.
모든 발췌의 경로는 `<PLUGINS>`·`<HOME>` 치환형으로 적는다(H4).

**지표 3이 측정하는 것은 plugin 본문 표면에 한정된다.** manifest 표면은 M1이 닫지 않으며
그 사실은 요약과 Risks에 기록돼 있다 — "도달 0"을 저장소 전체에 대해 주장하지 않는다.

## External Research Provenance

- Source PRD: .claude/prds/release-channel-separation.prd.md
- References section sha256: 53a925d7dee3c6675e30dd695f7deb1d82e5e496b092c060a609975356528d3b
- Stamped at: 2026-09-01T05:47:48.245Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt`s plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

- 트리거: 축 (a) detector positive — `impeccable-detect.js`가 plan 산문의 renderer 파일
  인용(`plugins/mccp/scripts/lib/renderer/html.js:1419` · `markdown.js` ·
  `renderer/tests/i18n-surface.test.js:94`)을 design surface로 잡았다.
- 호출: `Skill(impeccable, "critique …")` — call form은 `impeccable-detect.js`가 해소
  (`source=user` · `v4.0.4` · `~/.claude/skills/impeccable/SKILL.md`).
- 라운드: 1 (R0) · cap 2 · verdict **CONVERGED**
- 판정 근거: 이 plan이 렌더 표면에 만드는 변경은 `html.js:1419`의 `<footer>` 문자열과
  `markdown.js:163`의 derived 줄에 들어 있는 **version 토큰 1개씩**이 전부다. 4개 Output
  Constraints 각각에 대해 delta가 0이다 — heading이 추가되지 않으므로 위계 깊이 불변,
  accent/highlight token 사용 수 불변, 렌더 문자열에 raw markdown marker 유입 없음,
  `list-of-N` 섹션 신설·확장 없음. HIGH/CRITICAL 0건, 전체 findings 0건.
- 남는 축: produced-diff는 critique이 구조적으로 못 본다(EXECUTE 이전 실행). 그 gap은
  `/mccp:prp-implement` Phase 3.7의 H15 grounding lint가 닫는다 — version 리터럴 교체는
  heading을 만들지 않으므로 no-op으로 통과할 것으로 예상되며, 예상이지 실측이 아니다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 아직 없으므로 어떤
impeccable 명령도 호출하지 않는다 — 아래는 구현자를 위한 체크리스트다. 이 마일스톤은 렌더
표면을 만들지 않으므로 대부분의 행은 실제로는 해당 없음이며, `renderingSurface=0`이면
implement 게이트가 refine/discovery 계열을 recommend로 강등한다.

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

## L2 Panel Absorption (round 0)

게이트는 `MCCP_PLAN_REVIEW=multi-agent`로 L2 반박 패널 4명을 1라운드 발화했고 **quorum 미충족**
으로 `divergent` 판정했다(pass 1 / 4, required 3). 판정 기록:
`.claude/reviews/plan-review-release-channel-separation.md` (halt_stage 5.2e · wall clock 322s ·
reviewed hash `sha256:ff0b4df4…`).

§3.14대로 **HIGH만 그 자리에서 흡수**했고 MEDIUM·LOW 5건은 증거와 함께
[codex-findings-backlog.md](codex-findings-backlog.md)에 이연했다(2026-09-01 행 5건).

| # | 리뷰어 | 지적 | 흡수 결과 |
|---|---|---|---|
| H1 | architect · invariant · security | Task 10 c가 머지 후 라이브 `release`를 force-push해 실사용자를 1.33.4로 강등시킨다 — M1이 UI2를 스스로 깬다 | 롤백 왕복을 **Task 9-6(머지 전, `release`를 해소하는 소비자가 리허설 clone뿐인 창)**으로 이동. Task 10은 비파괴 관측만 하고 전후 `origin/release` SHA 동일을 Validate로 단언 |
| H2 | invariant | `known_marketplaces.json`에 `ref`가 없어 marketplace clone은 계속 main 추종 — manifest 표면은 안 닫히는데 요약이 넓게 주장했다 | 요약을 `plugin 본문 표면`으로 한정하고 잔여를 Risks에 신설(확실·설계상). Acceptance에 지표 3의 한정 명시. 그 표면을 닫는 것은 사용자 재등록을 요구하므로 M3 소유 |
| H3 | invariant | 캐시 supersede 인용과 충돌 — 포인터 3종 백업만으로는 복구가 성립하지 않는다 | Task 2가 `cache/mccp/mccp/1.33.6/`을 **내용째** 백업. 복구 순서를 재-fetch 1차 · 캐시 복원 최후로 명시. Risks의 `캐시가 남아 있다` 주장 삭제 |
| H4 | security | `installPath`·백업 경로의 절대 경로가 git-tracked 보고서로 유출 — §3.12 `meta.cwd`와 동형 | Task 11에 `<PLUGINS>` 치환 규칙 + `grep` 기계 검사 신설. plan 자신의 Validation 블록에서 하드코딩 절대 경로 제거(`os.homedir()` 파생) |

부수 흡수(위 텍스트를 다시 쓰는 김에 함께 처리): 보고서 파일을 `Files to Change`에 추가
(architect MEDIUM — 착지 vehicle 부재) · Task 9의 `autoUpdate` 복원을 Validate에 단언
(invariant MEDIUM) · `--force-with-lease` 앞에 `git fetch origin release` 선행
(invariant LOW — Task 3의 SHA 직접 push는 추적 ref를 만들지 않는다).

**흡수로 plan 본문이 바뀌어 `plan_hash`가 패널이 본 것과 달라졌다.** 따라서 위 패널 판정은
이 문서의 현재 내용에 대한 승인이 아니며, 그 사실을 숨기지 않는다. §3.16대로 라운드를 늘리지
않았다 — 재리뷰 여부는 이 plan을 소비하는 다음 게이트에서 운영자가 정한다.

## L2 Panel Absorption (decision `release-channel-separation-m1`, round 0)

이전 절의 패널은 decision slug `release-channel-separation`(PRD 경로 인자) 아래에서 돌았다.
`/mccp:prp-implement <plan-path>`가 검증하는 slug는 `release-channel-separation-m1`이라
이 본문에 대해 패널을 다시 돌렸고(dispatch log `round_index=0`), 판정 기록은
`.claude/reviews/plan-review-release-channel-separation-m1.md`다
(verdict `divergent` · pass 1/4 · required 3 · wall clock 452s · reviewed hash `sha256:9ca1352e…`).

§3.14대로 **HIGH만 흡수**했다. 세 리뷰어가 서로 다른 렌즈로 지목한 것은 **같은 결함 하나**다.

| # | 리뷰어 | 지적 | 흡수 결과 |
|---|---|---|---|
| H5 | architect · test · invariant | 검증 (a)·(b)의 기대값이 변경 전 상태와 동일해 **실패할 수 없는 검사**다. 유일한 판별자인 하향 왕복은 '거부' 분기가 Acceptance를 충족하도록 허용돼 있어, git-subdir가 실제로 fetch했다는 양성 증거 0인 채로 완료 판정될 수 있다 | Task 9-6을 **6a 상향 대조(필수)** 와 **6b 하향 왕복(OQ1 기록용)** 으로 분리. 6a가 (a)의 유일한 통과 조건이고 CLI의 다운그레이드 수용 여부와 독립한다. Task 10은 무변화(10-2)와 clone 전진(10-3)의 **쌍**으로만 판정. Summary·Task 9 Validate·Task 10 Validate·Acceptance 1·3·Risks 신설행에 결속 |
| H6 | invariant | Task 9-4의 재시도 이후 실패 분기가 없다 — 그 실패 경로의 관측값이 통과 기준과 같아 실패가 성공으로 기록된다 | 4단계에 명시 HALT 추가(비영점 종료 또는 `lastUpdated` 미갱신) |

**리뷰어의 처방 하나는 실측으로 기각했다** — test가 판별자로 제시한 `installPath`는 변경 전에도
이미 `<PLUGINS>/cache/mccp/mccp/1.33.6`이라 판별력이 없고(2026-09-01 실측), invariant가 제안한
엔트리 `source` 필드 단언은 그 필드가 **존재하지 않아** 불가능하다(엔트리 키 6개 실측). 지적
자체는 참이므로 흡수했고, 처방만 다른 판별자로 교체했다. 근거는 backlog 2026-09-01 행에 동봉.

MEDIUM·LOW 11건은 §3.14대로 [codex-findings-backlog.md](codex-findings-backlog.md)에 이연했다.

## L2 Panel Absorption (decision `release-channel-separation-m1`, round 1)

round 0의 흡수 뒤 같은 패널을 새 본문(`sha256:c5a27143…`)에 대해 다시 돌렸다.
**architect가 pass로 전환**해 H5·H6 흡수가 성립함이 확인됐고(그 리뷰어는 이 plan이 리뷰어 처방을
실측으로 기각한 근거도 직접 대조해 참임을 확인했다), 다른 축에서 HIGH 4건이 나왔다.
pass 1 / 4 · required 3 · 판정 기록 `.claude/reviews/plan-review-release-channel-separation-m1.md`.

| # | 리뷰어 | 지적 | 흡수 결과 |
|---|---|---|---|
| H7 | invariant | `origin/release == 647dfec`를 요구하는 머지 게이트가 없다. 6a·6b가 `release`를 옮긴 채 세션이 끊기면 머지 순간 **미리뷰 코드가 배포**된다 — M1이 UI2를 스스로 깨는다 | Task 9에 **8단계 채널 좌표 게이트** 신설(기대값 리터럴). Task 9 Validate가 "통과 안 하면 PR을 열지 않는다"로 결속하고 `## Validation`·Acceptance 3·Risks에 동일 단언. **이 구멍은 round 0의 6a 흡수가 만든 것**이라 같은 사이클에서 닫는다 |
| H8 | invariant | 복원이 순환 논증이다 — 6a가 설치를 feature tip으로 올렸으므로 6c의 복원도 **하향**이고, CLI가 하향을 거부하면(= 6b가 검증하려는 명제) 복원도 거부된다. 더욱이 지표 2(롤백 소요)가 측정 없이 통과한다 | 6c에 **하향 무관 복원 경로** 명시 — (1) update · (2) uninstall+재설치(버전 비교 미경유) · (3) 캐시 백업. Acceptance 4가 지표 2를 만족시킨 것이 하향 롤백인지 대체 경로인지를 **구분해 적기**를 요구 |
| H9 | security | Task 2 백업의 **목적지가 미지정**이고 `.gitignore`가 덤지 않아, 절대 `installPath`와 설치 plugin 전체 목록이 커밋될 수 있다. H4는 보고서 한 파일만 덤는다 | 목적지를 `$HOME/.claude/backup/mccp-m1-<ts>/`로 **고정**하고 저장소 트리 내 배치 금지. Task 1·Task 2 Validate와 `## Validation`에 `git status --porcelain --untracked-files=all` 추가 — `--diff-filter=D`는 삭제만 본다 |
| H10 | test | Task 4(PRD의 유일한 기능 변경)의 Validate가 **실패할 수 없다** — 두 명령이 변경 전 manifest에서도 exit 0이고, `marketplace.json`을 읽는 JS 소비처나 test가 저장소에 없다 | Task 4 Validate에 **형태 직접 단언** 추가(`source.source==='git-subdir'` · `ref==='release'` · `path` · `url` 존재 · `sha` 부재). 변경 전 트리에서 **실패하는** 검사고, `## Validation`에도 같은 블록을 둔다 |

부수 흡수 — architect MEDIUM(Task 10 (ii)가 "전후로 달라진다"로 적혀 `autoUpdate` 재가동 시
성공한 실행을 미완료로 판정)는 **직전 흡수가 만든 결함**이라 같이 고쳤다 — 조건을 델타가
아니라 "clone HEAD == `origin/main`"으로 바꿔 목적을 직접 적었다. 나머지 MEDIUM·LOW는 §3.14대로
[codex-findings-backlog.md](codex-findings-backlog.md)에 이연했다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
