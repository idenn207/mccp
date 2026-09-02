# Plan: impeccable 탐지 계약 M2 — setup·경고 정합

**Source PRD**: `.claude/prds/impeccable-detection-contract.prd.md`
**Selected Milestone**: M2 — setup·경고 정합
**Complexity**: Medium

## Summary

M1이 만든 `resolveImpeccable()` 오라클을 **소비처 세 곳에 실제로 연결한다** —
`dep-check.js`(PATH 단일 채널 → 다채널) · SessionStart 배너(정상 설치자에게 24시간마다
발화하던 오탐) · `/mccp:setup` Phase 3(문서에 없는 명령으로 구버전을 심던 경로). 같은
사이클에 `gitignore-provision.js`의 `.impeccable/` 무시 규칙 극성을 공식 계약에 맞춘다 —
그 블록은 setup이 **모든 사용자 저장소에** provision하므로 오답이 전파되는 유일한 표면이다.

M1이 오라클을 만들고 아무도 부르지 않게 둔 자리가 정확히 여기다. M2는 새 판정 로직을
만들지 않는다 — `checkImpeccableCli`가 각자 판정하던 두 번째 답을 없애고 오라클 하나에
합류시킨다.

`dep-check.js` ↔ `impeccable-detect.js`는 **순환 참조**다(후자가 전자의
`readInstalledPlugins`를 top-level로 require한다). 순환은 지연 require로 끊는다 —
`dep-check`는 top-level에서 `impeccable-detect`를 부르지 않고 함수 안에서 부른다.
방향이 하나뿐이라 어느 쪽이 먼저 로드돼도 부분 export를 잡지 않는다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 공식 채널로 default 설치한 사용자에게 환경변수 설정을 요구하지 않는다 | constraint |
| UI2 | 기존 npm CLI 3.x 사용자는 강제 마이그레이션 대상이 아니며 계속 동작해야 한다 | exclusion |
| UI3 | setup이 권하는 설치 명령은 impeccable 공식 문서에 실재하는 것이어야 한다 | constraint |
| UI4 | 이미 설치된 사용자에게 더 이상 설치를 권하지 않는다 | constraint |
| UI5 | 저장소에 심는 무시 규칙이 공식 commit/ignore 구분과 일치해야 한다 | constraint |
| UI6 | setup은 plugin 채널을 기본 권장으로 제시한다 | direction |
| UI7 | 이미 추적 중인 `.impeccable/design.json`은 추적 해제하지 않는다 | exclusion |
| UI8 | 디자인 축이 없는 백엔드 전용 작업에서는 무동작이어야 하며 없는 도구의 설치를 압박하지 않는다 | exclusion |
| UI9 | 게이트의 lenient/strict 비대칭 재설계는 이번 범위 밖이다 | exclusion |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 지연 require로 순환 차단 | `plugins/mccp/scripts/lib/auto-chain.js:109` | 함수 본문 안에서 `require()` — 호출 시점엔 양쪽이 이미 캐시돼 있다 |
| sentinel 반환 | `plugins/mccp/scripts/lib/dep-check.js:20` | 절대 throw하지 않고 객체를 돌려준다 — 호출부가 try/catch 없이 분기 |
| 엄격한 상위집합 확장 | `plugins/mccp/scripts/lib/impeccable-detect.js:445` | 기존 키 의미를 그대로 두고 새 필드만 얹는다(`resolutionFields` 한 자리 조립) |
| 두 사실을 두 필드로 | `.claude/audit/v1.0.0-baseline.md` (F-W1-2 항) | 그 감사의 자체 처방 — PATH probe와 skill probe를 하나로 뭉치지 않고 각각 낸다 |
| 명령 본문 정적 단언 | `plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js` | 마크다운 본문을 읽어 금지 리터럴 부재·필수 리터럴 존재를 test로 고정 |
| gitignore 양방향 drift lint | `plugins/mccp/scripts/lib/tests/gitignore-provision.test.js:1266` | canonical ⊆ repo · repo ⊆ (canonical ∪ REPO_ONLY) 두 방향 모두 |
| 무시 규칙 주석에 근거 | `plugins/mccp/scripts/lib/gitignore-provision.js:104` | 왜 canonical인지를 블록 주석이 직접 말한다 |
| loud stderr | `plugins/mccp/scripts/lib/impeccable-detect.js:308` | 강등·비정상은 조용히 넘기지 않고 `[mccp:<axis>]` 접두 stderr |
| 4면 version 동기 | `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:94` | 기대값을 `plugin.json`에서 파생 — footer를 빠뜨리면 그 test가 red |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/dep-check.js` | UPDATE | `checkImpeccable()` 신설(지연 require) · `checkAll()` 상위집합 + `repoRoot` 전달 · CLI printer 행 추가 |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | `missing` 판정을 `impeccable.available`로 이전 + `injectorRepoRoot` 전달 |
| `plugins/mccp/scripts/lib/gitignore-provision.js` | UPDATE | `.impeccable/` 블록 극성 교체(`!design.json` → `!config.json`) + 주석 정정 |
| `.gitignore` | UPDATE | drift lint 양방향 parity — canonical 교체와 같은 커밋이어야 red가 안 난다 |
| `plugins/mccp/commands/setup.md` | UPDATE | frontmatter allowed-tools · Phase 1 표 · Phase 3 전면 재작성 · Phase 6 거짓 문장 정정 · `--skip-impeccable` 설명 |
| `plugins/mccp/scripts/lib/tests/dep-check.test.js` | UPDATE | `checkImpeccable` 채널 매트릭스 + 양쪽 로드 순서 순환 회귀 |
| `plugins/mccp/scripts/lib/tests/gitignore-provision.test.js` | UPDATE | 극성 단언(`config.json` 미무시 · `design.json` 무시) |
| `plugins/mccp/scripts/lib/tests/setup-command-body.test.js` | CREATE | 금지 리터럴 부재 + 필수 리터럴 존재 정적 단언 |
| `plugins/mccp/scripts/hooks/tests/session-start-dep-check.test.js` | CREATE | 해소되는 환경에서 배너 침묵 · 미설치에서 발화 |
| `docs/gate-design.md` | UPDATE | L94-95 설치 명령 서술 + `### impeccable-detection`에 `#### setup·경고 정합` 추가 |
| `README.md` | UPDATE | L34 서술 · L43 수동 설치 블록 |
| `NOTICE` | UPDATE | L40-43 배포 채널 서술 |
| `CLAUDE.md` | UPDATE | §4 cheat sheet L845 setup 한 줄 + §3.17에 소비처 문단 1개 |
| `docs/multi-session-work-loop/instruction-contract.md` | UPDATE | S3.17 행 설명 갱신(절 내용이 늘어남) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (§3.7 patch — PRD 진행 중) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | 신규 heading + `currently` 노트 |
| `.claude/prds/impeccable-detection-contract.prd.md` | UPDATE | M2 행 status와 Plan 셀 + Open Question 결정 기록 |
| `.claude/notes/impeccable-detection-contract-m2.md` | CREATE | Task 0 사전 측정 · 라이브 증거 · 게이트 기록 (plan 본문은 봉인되므로) |
| `.claude/PRPs/reports/impeccable-detection-contract-m2-report.md` | CREATE | `/mccp:prp-implement` 산출 report |

## Tasks

### Task 0: 라이브 사전 측정 — plugin 채널을 setup이 실제로 실행할 수 있는가

UI6이 plugin을 기본 권장으로 정했으므로 setup은 그 채널을 **실행**하거나, 실행할 수
없다면 그 사실을 근거와 함께 말해야 한다. 코드를 쓰기 전에 측정한다.

- **Action**:
  - (a) `claude` 실행 파일 가용성. mccp 자신의 probe가 이 머신에서 `ENOENT`로 실패했으나
    (`[mccp] claude --version probe failed`) bash `which claude`는 `/c/Program Files/nodejs/claude`를
    찾는다. `claude --version`과 `claude plugin --help`를 직접 실행해 서브커맨드 실물을 기록한다.
  - (b) marketplace 이름과 설치 키. impeccable은 **이미 설치돼 있으므로 설치하지 않는다** —
    `claude plugin marketplace list`(또는 등가)와 `~/.claude/plugins/installed_plugins.json`을
    읽어 `pbakaus/impeccable` → marketplace `impeccable` → 키 `impeccable@impeccable`의
    사슬을 관측으로 확정한다. 확정되지 않으면 setup은 CLI 형태를 **주장하지 않는다**.
  - (c) plugin 단독 환경의 실제 귀결. `MCCP_IMPECCABLE_SKILL` 미설정 · 임시 repoRoot(project
    사본 없음) · `userSkillDir` 부재로 `resolveImpeccable`을 호출해
    `invocation:'impeccable:impeccable'`을 확인하고, 그 이름이 mccp 명령 본문 4곳이 부르는
    이름과 **다르다**는 것을 grep 수치로 기록한다. 이것이 Phase 3이 사용자에게 출력할
    정직성 문구의 근거다.
- **Mirror**: `.claude/notes/impeccable-detection-contract-m1.md` Task 0 — 명령·출력·판정
  3단 기록 형식.
- **Validate**: 노트에 (a)(b)(c)가 각각 명령·출력·판정으로 남고, (b)가 음성이면 "setup은
  slash 명령 안내로 강등한다"가 명시될 것. **어떤 설치도 수행하지 않았을 것.**

### Task 1: `checkImpeccable()` — dep-check를 오라클에 합류시킨다

- **Action**: `dep-check.js`에 `checkImpeccable(options)`를 신설한다. 본문 **안에서**
  `require('./impeccable-detect')`를 부르고(top-level 금지 — 순환), `resolveImpeccable`의
  반환을 **그대로** 돌려준다.

  - **`installed` 별칭을 만들지 않는다.** 이 milestone이 없애는 것이 "같은 사실을 두 함수가
    각자 판정하는 구조"인데, 같은 사실에 두 이름을 주면 그 구조를 필드 층위에 다시 만든다.
    `codex_plugin.installed`와 `impeccable.available`이 다른 이름인 것은 다른 질문에
    답하기 때문이다 — 전자는 "레지스트리에 있는가", 후자는 "우리가 부르는 이름이 해소되는가".
  - **`checkImpeccableCli`는 그대로 둔다.** PATH의 `impeccable` 바이너리는 실재하는 별개
    사실이고(npm 전역 설치의 산물), v1.0.0 baseline 감사(`.claude/audit/v1.0.0-baseline.md` F-W1-2)의 자체 처방이 "하나의
    모호한 필드 대신 두 필드"다. 다만 **판정 권한은 없다** — 배너도 setup 분기도 이 값을
    읽지 않는다.
  - `checkAll(options)`는 `impeccable` 키를 얹는 **엄격한 상위집합**이 되고 `repoRoot`를
    `checkImpeccable`로 전달한다. `repoRoot`가 없으면 `resolveImpeccable`의 기존 기본값
    (`process.cwd()`)이 적용된다 — 새 기본값을 만들지 않는다.
  - CLI printer에 `impeccable skill` 행을 추가한다: `available (source vN, invocation)` /
    `missing`. `shadowed`면 source·version이 `null`이므로 `ambiguous (N sources)`로 적는다.

- **Mirror**: `auto-chain.js:109` 지연 require · `dep-check.js:20` sentinel 계약 ·
  `impeccable-detect.js:445` 한 자리 조립.
- **Validate**: `node -e "require('./plugins/mccp/scripts/lib/dep-check')"` 와
  `node -e "require('./plugins/mccp/scripts/lib/impeccable-detect')"` 가 **양쪽 순서 모두**
  throw 없이 로드되고, `node plugins/mccp/scripts/lib/dep-check.js --json`이 이 저장소에서
  `impeccable.available=true` · `source="project"` · `version="3.5.0"` 을 낼 것.

### Task 2: SessionStart 배너를 다채널 판정으로 이전

- **Action**: `session-start.js:1070`의 `if (!result.impeccable_cli.installed) missing.push('impeccable')`를
  `if (!result.impeccable.available) missing.push('impeccable')`로 바꾸고, 같은 블록의
  `depCheck.checkAll()` 호출에 `{ repoRoot: injectorRepoRoot || undefined }`를 전달한다.

  `injectorRepoRoot`는 바로 위 블록이 계산하지만 그 블록이 throw하면 `null`로 남는다.
  `undefined`로 접어 넘겨야 오라클의 기본값이 살아난다 — `null`을 그대로 넘기면
  `opts.repoRoot || process.cwd()`가 우연히 같은 답을 내지만 그 우연에 기대지 않는다.

  `dep_check_missing` dedupe 키는 무변경이다. 정상 설치 머신에서 집합이 `impeccable`에서
  빈 집합으로 바뀌면 `missing.length > 0`이 거짓이 되어 발화하지 않고, state는 `null`로
  갱신된다 — 기존 로직 그대로다.

- **Mirror**: 같은 파일의 `codex_plugin.installed` 분기 — 형태를 바꾸지 않고 읽는 필드만 바꾼다.
- **Validate**: 이 저장소에서 SessionStart hook을 직접 실행해 `Missing dependencies`에
  `impeccable`이 **없을** 것. Task 7의 단위 test가 양방향(해소/미설치)을 고정.

### Task 3: `.impeccable/` 무시 규칙 극성 교체

- **Action**: `gitignore-provision.js`의 3줄을 교체한다. 새 블록은 공식 `/docs/config`를
  근거로 `config.json`만 예외로 둔다 — 그것이 "team-wide detector ignores representing
  shared project intent"이고, `design.json`은 detector가 다시 만드는 생성 sidecar다.

  ```
  # impeccable tool byproducts (impeccable.style/docs/config).
  # config.json is the shared, committed config; design.json is a GENERATED
  # sidecar the detector rebuilds, so it is a byproduct like the rest.
  .impeccable/*
  !.impeccable/config.json
  ```

  같은 커밋에서 이 저장소 `.gitignore`의 L133-138을 같은 entry 집합으로 맞춘다. drift lint가
  **양방향**이라 한쪽만 고치면 두 test가 동시에 붉어진다 — canonical에 없는
  `!.impeccable/design.json`이 `unclassified`가 되고, repo에 없는 `!.impeccable/config.json`이
  `not dogfooded`가 된다. `REPO_ONLY`로 넘기지 **않는다**: 이 규칙은 사용자 저장소에도
  가야 하는 canonical이다.

  `.impeccable/design.json`은 이 저장소에서 **tracked로 남긴다**(UI7). 결과로 provisioner의
  pollution 스캔이 이 파일 1건을 보고하게 되며, 그것이 정상 동작이다 — provisioner는
  자동 untrack하지 않는다는 기존 계약 그대로다. 노트에 관측값으로 기록한다.

- **Mirror**: `gitignore-provision.js:104` — 왜 canonical인지를 블록 주석이 직접 말하는 형식.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/gitignore-provision.test.js` 전량 green.
  `node plugins/mccp/scripts/lib/gitignore-provision.js provision --json --dry-run`이
  `action:"update"`와 함께 새 2줄을 `addedLines`에 실을 것.

### Task 4: `/mccp:setup` Phase 3 재작성 — 설치된 사용자에게 묻지 않고, 공식 명령만 권한다

- **Action**: 여섯 자리를 고친다.

  1. **frontmatter `allowed-tools`** — `Bash(impeccable:*)`와 `Bash(npm:*)`를 제거하고
     `Bash(npx:*)`를 추가한다. 두 제거 대상은 삭제되는 두 명령 전용이었다.
  2. **Phase 1 표** — `impeccable skill` 행을 추가한다(source · version · invocation).
     기존 `impeccable CLI` 행은 **남기되 telemetry로 명시**한다. 두 행이 서로 다른 답을
     내는 것이 정상이며, 그것이 v1.0.0 F-W1-2가 요구한 형태다.
  3. **Phase 3 진입 조건** — `checkImpeccable().available === true`면 **Phase 전체를 skip**하고
     한 줄만 보고한다(UI4). 지금은 `checkImpeccableCli().installed`를 읽어 정상 설치자에게도
     매번 물었다.
  4. **Phase 3 설치 분기** — `AskUserQuestion` 1회, 선택지 셋:
     - `Install impeccable plugin (Recommended)` — plugin 채널. Task 0 (b)가 CLI 형태를
       확정했으면 그 명령을 실행하고, 확정하지 못했으면 공식 slash 명령
       (`/plugin marketplace add pbakaus/impeccable` → `/plugin install impeccable@impeccable`)을
       사용자가 실행하도록 안내한다. 후자는 "수동 실행 금지" 조항에 걸리지 않는다 —
       그 조항의 단서가 "this command can perform itself"이고 slash 명령은 명령 본문이
       수행할 수 없다. README L41-42가 codex에 대해 같은 형태를 이미 쓴다.
     - `Install via npx CLI` — `npx impeccable install` (프로젝트 루트에서 실행, 공식 기본 경로).
     - `Skip`.
  5. **정직성 출력(양 분기 공통)** — plugin 채널의 invocation이 `impeccable:impeccable`인 반면
     mccp 명령 본문 4곳은 bare `Skill(impeccable, ...)`를 부르므로, plugin 단독 설치에서는
     디자인 게이트가 `unknown_skill` → `impeccable_skipped`로 떨어진다. 이 사실을 설치
     직후 stderr 한 줄로 출력하고, 오늘 게이트를 발화시키려면 bare 이름을 배포하는
     `npx impeccable install`이 필요함을 함께 적는다. 재배선은 M3 소유다.
  6. **Phase 6 거짓 문장 정정** — 현재 "impeccable missing → `/mccp:impeccable` will refuse"인데
     **`/mccp:impeccable` 명령은 존재하지 않는다**(`commands/` 실측 22개에 없음). 실제 귀결로
     교체한다: plan은 lenient라 통과하고 implement·pr은 `impeccable_skipped`로 차단되며
     탈출은 `MCCP_FORCE_PR_WITHOUT_IMPECCABLE`이다.

- **Mirror**: 같은 파일 Phase 2(codex) — `AskUserQuestion` 1회 + 설치 후 재-dep-check + stderr
  verbatim 보고. Phase 5의 fail-closed 분기 형식.
- **Validate**: Task 7의 정적 test가 금지/필수 리터럴을 고정. 육안으로 Phase 3이
  `available===true`에서 AskUserQuestion에 도달할 경로가 없음을 확인.

### Task 5: 같은 명령을 서술하는 문서 4면 정정

setup만 고치고 문서를 두면 저장소가 스스로와 모순된다 — 삭제 대상 명령이 README·NOTICE·
gate-design에 그대로 남는다.

- **Action**:
  - `docs/gate-design.md:94-95` — `npm install -g impeccable` + `impeccable skills install`
    서술을 4채널과 plugin 우선 권장으로 교체.
  - `README.md:34` — "impeccable CLI 미설치 시" → skill 미해소 시. `README.md:43` — 수동
    설치 블록의 impeccable 행을 `/plugin marketplace add pbakaus/impeccable` +
    `/plugin install impeccable@impeccable`로 교체하고 npx 대안을 병기.
  - `NOTICE:40-43` — "currently distributed as an npm CLI"를 4채널 서술로 교체
    (`npm install -g` · `impeccable skills install` 리터럴 제거).
  - `CLAUDE.md:845` — cheat sheet의 "impeccable CLI 자동 설치"를 채널 중립 표현으로.
- **범위 밖(M5)**: `docs/environment/external.md:301`의 `IMPECCABLE_VERSION` 거짓 서술과
  `registry.js:223-227`의 소비처 일괄 오귀속. 같은 F8이지만 setup 명령과 무관하고
  게이트를 막지 않는다.
- **Mirror**: README L41-42 — 이 저장소가 이미 쓰는 slash 형태 수동 설치 블록.
- **Validate**: `grep -rn "npm install -g impeccable\|impeccable skills install"`가
  `README.md` · `NOTICE` · `CLAUDE.md` · `docs/` · `plugins/` 범위에서 0건일 것
  (`.claude/`의 과거 산출물·감사·PRD·archived plan은 이력이라 대상 아님).

### Task 6: 계약 문서 — §3.17 확장과 gate-design 앵커

- **Action**: `CLAUDE.md` §3.17에 소비처 문단 하나를 추가한다(새 절이 아니라 기존 절 확장 —
  ledger 목적지가 이미 S3.17로 존재한다). 상주시킬 사실은 둘:
  - 오라클의 판정 권한은 `available` 하나이고 `checkImpeccableCli`는 telemetry라 어떤
    게이트 분기도 읽지 않는다.
  - `.impeccable/` 무시 규칙의 canonical 극성 — `config.json`은 commit, `design.json`은 생성물.
    provision 블록이라 오답이 사용자 저장소로 전파되므로 이 사실은 상주해야 한다.

  `docs/gate-design.md`의 `### impeccable-detection`에 `#### setup·경고 정합 (M2)` 절을 만들어
  4채널 표·plugin 권장의 근거와 그 채널이 오늘 발화하지 않는 이유·pollution 보고가 정상인
  이유를 소유하게 한다. 같은 앵커의 "주장하지 않는 것"에서 M2 항목을 소진 처리한다.

  `docs/multi-session-work-loop/instruction-contract.md`의 S3.17 행 설명을 갱신한다.
- **Mirror**: M1이 §3.17 ↔ `gate-design#impeccable-detection`으로 나눈 그 분업 — 절은 불변식만,
  표와 근거는 gate-design.
- **Validate**: `node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md`
  exit 0.

### Task 7: test — 배선과 극성과 명령 본문을 각각 고정

- **Action**:
  - `dep-check.test.js` UPDATE — (a) 두 로드 순서 각각에서 `checkImpeccable()`이 throw 없이
    답한다(순환 회귀 — 지연 require가 top-level로 되돌아가면 red). (b) plugin 전용 manifest에서
    `invocation==='impeccable:impeccable'`. (c) project 사본만 있을 때 bare. (d) 둘 다 bare면
    `shadowed:true` + `available:true`. (e) 아무것도 없으면 `available:false`. (f) `checkAll()`이
    기존 4키를 전부 보존하는 상위집합이다.
  - `gitignore-provision.test.js` UPDATE — canonical에 `!.impeccable/config.json`이 있고
    `!.impeccable/design.json`이 **없다**. 임시 repo에 두 파일을 만들고 provision 후
    `git check-ignore`로 `design.json`은 무시·`config.json`은 미무시임을 확인.
  - `setup-command-body.test.js` CREATE — 금지 리터럴(`npm install -g impeccable`,
    `impeccable skills install`, `/mccp:impeccable`) 부재 + 필수 리터럴
    (`npx impeccable install`, `pbakaus/impeccable`, `checkImpeccable`) 존재 +
    frontmatter `allowed-tools`에 `Bash(npx:*)` 존재.
  - `session-start-dep-check.test.js` CREATE — `missing` 합성 로직만 떼어내 test하면 배선을
    검증하지 못하므로 **hook을 실제로 spawn**해 두 환경(`MCCP_IMPECCABLE_SKILL=available` /
    `=missing`)에서 배너 유무를 확인한다. env override는 오라클의 최우선 축이라 파일시스템
    조작 없이 양방향을 만들 수 있다.
- **Mirror**: `plan-review-command-body.test.js`(정적 리터럴 단언) ·
  `impeccable-resolve.test.js`(채널 매트릭스 · `withTempDir`/`withEnv` 헬퍼).
- **Validate**: 아래 Validation 블록 전량 green.

### Task 8: version 4면 + CHANGELOG

- **Action**: §3.7 — PRD가 아직 in-progress이므로 **patch**. `1.31.1 → 1.31.2`. 4면
  (`plugin.json` · `html.js` page-foot · `markdown.js` derived 줄 · `CHANGELOG.md`의
  `currently` 노트 + 항목 본문의 `A → B` 서술)을 함께 맞춘다.
  **`/mccp:pr` 진입 직전에 target을 재계산한다**(§3.7 실측 4회 재발 — 미머지
  `diverse-agent-review-m7`이 1.30.2, `multi-session-work-loop-m7`·`santa-delta-review`
  미확인).
- **Mirror**: `CHANGELOG.md` L9-14 — M1이 쓴 §3.7 충돌 점검 노트 형식.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` green.

### Task 9: 라이브 완주 — 배너 침묵과 setup 무동작을 실물로 관측

단위 test 통과는 경로 작동이 아니다. 세 관측을 노트에 남긴다.

- **Action**:
  - (a) SessionStart hook 실물 실행 → `Missing dependencies`에 impeccable 부재.
  - (b) `/mccp:setup --dry-run` 실물 실행 → Phase 3이 "이미 해소됨"으로 skip하고 설치를
    권하지 않으며, Phase 1 표에 `impeccable skill: available (project 3.5.0, impeccable)`이
    출력될 것. **설치를 수행하지 않는다.**
  - (c) `gitignore-provision provision --json --dry-run` → 새 극성 2줄이 `addedLines`에 있고
    `pollution`은 dry-run에서 `null`. 이어서 실제 provision 없이 임시 사본에 새 규칙을
    적용해 `git check-ignore -v .impeccable/design.json .impeccable/config.json`으로 극성 확인.
- **Mirror**: `.claude/notes/impeccable-detection-contract-m1.md` Task 8 라이브 증거 절.
- **Validate**: 세 관측이 명령·출력·판정으로 노트에 기록될 것. (b)가 여전히 설치를 물으면
  Task 4가 미완이다.

### Task 10: PRD M2 행 갱신

- **Action**: `Delivery Milestones` 표의 2행 status를 `complete`로, Plan 셀을
  `.claude/plans/impeccable-detection-contract-m2.plan.md`로. **다른 행은 건드리지 않는다.**
  Open Questions의 "이미 커밋된 `.impeccable/design.json`" 항목에 결정(tracked 유지)을 기록한다.
- **Mirror**: M1이 1행에 한 편집.
- **Validate**: `git diff .claude/prds/impeccable-detection-contract.prd.md`가 해당 행 + 해당
  Open Question 외 변경 0.

## Validation

```bash
node --test plugins/mccp/scripts/lib/tests/dep-check.test.js
node --test plugins/mccp/scripts/lib/tests/gitignore-provision.test.js
node --test plugins/mccp/scripts/lib/tests/impeccable-resolve.test.js
node --test plugins/mccp/scripts/lib/tests/impeccable-detect.test.js
node --test plugins/mccp/scripts/lib/tests/setup-command-body.test.js
node --test plugins/mccp/scripts/hooks/tests/session-start-dep-check.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 순환 참조 회귀 — 양쪽 로드 순서 모두
node -e "require('./plugins/mccp/scripts/lib/dep-check').checkImpeccable({})" && echo OK1
node -e "require('./plugins/mccp/scripts/lib/impeccable-detect');require('./plugins/mccp/scripts/lib/dep-check').checkImpeccable({})" && echo OK2

# 다채널 판정 실물
node plugins/mccp/scripts/lib/dep-check.js --json
node plugins/mccp/scripts/lib/impeccable-detect.js resolve --json

# provision 미리보기 (쓰기 없음)
node plugins/mccp/scripts/lib/gitignore-provision.js provision --json --dry-run

# 계약 lint
node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md
node plugins/mccp/scripts/lib/env-contract/lint.js

# 삭제 대상 명령이 활성 표면에 남아 있지 않은가
grep -rn "npm install -g impeccable" README.md NOTICE CLAUDE.md docs/ plugins/ || echo "clean-1"
grep -rn "impeccable skills install" README.md NOTICE CLAUDE.md docs/ plugins/ || echo "clean-2"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `dep-check` ↔ `impeccable-detect` 순환이 top-level require로 되돌아가 한쪽이 빈 객체를 잡는다 | 중 | 지연 require를 강제하는 **양쪽 로드 순서 test**를 Task 7에 둔다. 조용히 깨지는 종류라 test 없이는 못 본다 |
| canonical 블록만 고치고 저장소 `.gitignore`를 빠뜨려 drift lint 2건이 붉어진다 | **높음** | Task 3이 두 파일을 한 단위로 다룬다. lint가 양방향이라 누락이 반드시 red로 나온다 |
| plugin 채널 설치 CLI 형태를 관측 없이 setup에 적어 존재하지 않는 명령을 권한다 | 중 | Task 0 (b)가 **설치 없이** 기존 레지스트리에서 사슬을 확정한다. 미확정이면 slash 안내로 강등 |
| plugin 기본 권장이 "설치했는데 게이트가 꺼지는" 상태를 계속 생산한다 | **높음** — 구조적 | 운영자 결정(UI6). Task 4-5가 그 사실을 설치 시점에 **명시 출력**하고 bare 채널 대안을 병기한다. 실제 해소는 M3의 호출부 재배선 |
| SessionStart가 잘못된 repoRoot로 project 채널을 놓쳐 오탐이 남는다 | 낮 | Task 2가 `injectorRepoRoot`를 전달하고, Task 9 (a)가 실물로 확인 |
| `design.json`이 tracked인 채 ignore돼 pollution 보고가 매 provision마다 뜬다 | **높음** — 의도됨 | UI7. provisioner는 자동 untrack하지 않는다는 기존 계약 그대로이며, 노트와 gate-design이 "정상"임을 기록 |
| 문서 4면 중 하나를 빠뜨려 저장소가 스스로와 모순된다 | 중 | Validation의 grep 2줄이 활성 표면 전체를 훑는다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
  - 라이브 실물 산출물 셋: **(a)** SessionStart hook 실행 출력에 `Missing dependencies`가
    없거나, 있어도 `impeccable`을 포함하지 않을 것 · **(b)** `/mccp:setup --dry-run` 출력에
    Phase 3 skip 한 줄과 `impeccable skill: available (project 3.5.0, impeccable)` 행이
    있을 것(AskUserQuestion 미발화) · **(c)** `gitignore-provision --dry-run` JSON의
    `addedLines`에 `!.impeccable/config.json`이 있고 `!.impeccable/design.json`이 없을 것.
    셋 다 `.claude/notes/impeccable-detection-contract-m2.md`에 명령·출력·판정으로 기록.

## 주장하지 않는 것

- **호출부를 재배선하지 않는다.** plugin 단독 설치는 여전히 `unknown_skill`로 떨어진다.
  M2가 바꾸는 것은 그 사실을 **말하는지 여부**이지 그 사실 자체가 아니다. 재배선은
  M1이 선언한 대로 M3가 project-local 사본 제거와 **단일 커밋**으로 수행한다.
- **섀도잉을 사용자에게 표면화하지 않는다.** `shadowed`는 dep-check JSON과 CLI printer에
  나타나지만 배너도 setup 분기도 그것으로 행동을 바꾸지 않는다 — M3 소유.
- **게이트 lenient/strict 비대칭을 건드리지 않는다**(UI9). 입력이 참이 됐으니 비대칭이
  의도대로 작동하는지는 M2 이후에 관측된다.
- **`.impeccable/design.json`을 untrack하지 않는다**(UI7). 규칙만 바뀌고 이력은 그대로다.
- **env-contract 드리프트(F8)를 정리하지 않는다** — `IMPECCABLE_VERSION` 서술과 소비처
  오귀속은 M5다.
- **PRD Success Metric 1(env 우회 0건 plan→PR 완주)을 M2가 달성한다고 주장하지 않는다.**
  이 저장소에서는 project 사본 덕에 이미 참이지만, plugin 단독 설치자에게는 M3까지 거짓이다.

## Design Critique

- 트리거: detector positive (`design_signal=true`, `signal_files` 4건 — 전부 `renderer/*`
  version footer 동기 언급). SKILL first-step Read 수행:
  `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints`.
- 라운드 수: 1 (R0) · cap 2 · verdict **CONVERGED**
- 4 anchor 판정:
  - **정보 위계 3단계** — plan 본문 최대 heading depth 3 (`####` 0건, 실측). PASS.
  - **강조색 화면당 1개** — 이 plan은 rendered surface를 도입하지 않는다. `renderer/html.js` ·
    `renderer/markdown.js` 편집은 version 리터럴 각 1줄이라 accent token을 건드리지 않는다. N/A.
  - **raw markdown marker 금지** — 대상은 rendered surface(`status.html` / `STATUS.md`,
    PRODUCT.md 기준)이고 plan은 source 아티팩트다. 렌더 파이프라인 무변경. N/A.
  - **한 화면 항목 수 상한** — LOW 1건: `Files to Change`가 21행 무collapse. 이 anchor의
    대상 역시 rendered dashboard surface이며 M1 plan이 동일 형태로 같은 게이트를 통과한
    선례가 있다. §3.14에 따라 흡수하지 않고 backlog 축으로 남긴다.
- 미흡수 LOW 1건 — `.claude/plans/codex-findings-backlog.md` 대상.

## Design Routing Guide

routing mode: `auto` (effective at implement stage). At implement the design gate routes
these stage-appropriate impeccable commands; here they are a checklist only. 이 milestone은
rendering surface를 도입하지 않으므로 implement 단계에서 refine/discovery 축은
`renderingSurface=0`으로 강등될 가능성이 높다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
