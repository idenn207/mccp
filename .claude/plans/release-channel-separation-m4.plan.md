# Plan: release-channel-separation M4 — residual-closure

**Source PRD**: `.claude/prds/release-channel-separation.prd.md`
**Selected Milestone**: 4 — residual-closure (신설)
**Complexity**: Medium

## Summary

M1~M3이 채널을 만들고 dogfood 경로를 열고 런북을 썼다. 그 셋이 남긴 것은 **이 PRD가
자기 산출물 안에 명시로 이연한 부채**다 — 릴리스 좌표 파일의 형태 단언이 상시 검사가
아니고, 렌더러 두 면이 번호를 manifest에서 파생하지 않아 컷이 다섯 면을 움직여야 하며,
M1의 santa escalation이 아직 STATE.md에 열려 있다.

M4는 그 셋을 닫는다. 새 기능은 없고 **채널의 강제 표면만 넓힌다** — 좌표 파일에 상시
가드를 붙이고(Axis A), 번호의 얼굴 둘을 리터럴에서 파생으로 바꾸고(Axis B), 남은
관측·기록 부채를 정리한다(Axis C·D). 첫 릴리스 컷은 여전히 일어나지 않았고 M4는 그것을
일으키지 않는다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | backlog · fix-task · open question · 의도대로 동작하지 않는 기능의 수정을 하나의 plan으로 묶는다 | direction |
| UI2 | 그 plan을 이 PRD에 새 마일스톤으로 추가한다 | direction |
| UI3 | 범위는 이 PRD가 소유한 부채로 한정한다 — 저장소 전반 부채는 이번에 다루지 않는다 | exclusion |
| UI4 | release 브랜치 보호 축은 읽기 전용으로만 다룬다 — 원격 채널 ref를 움직이지 않는다 | constraint |
| UI5 | 릴리스 컷 절차의 강제기(스크립트·CI)는 이번에 만들지 않는다 | exclusion |

## 무엇이 남아 있는가 (실측 2026-09-04)

| # | 잔여 | 출처 | 상태 |
|---|---|---|---|
| R1 | 좌표 파일 형태 단언이 **사이클 단위**라 아무도 부르지 않는 사이클엔 아무것도 재지 않는다 | backlog 2026-09-04 · 런북 6절 | 열림 |
| R2 | `html.js:1422`·`markdown.js:163`이 `v1.34.4`를 **리터럴로 박고 있다** | OQ2 답이 지목한 축 | 열림 |
| R3 | 두 footer의 **정보 비대칭** — markdown에 `derive-only`·`LLM-free` 부재 | backlog 2026-09-03 HIGH | 열림 |
| R4 | release 브랜치 보호 미측정 (보호 API가 404) | backlog 2026-09-04 · 런북 7절 | 열림 (UI4로 읽기 전용) |
| R5 | STATE.md `escalate_pending: true` (decision `release-channel-separation-m1`) | STATE.md frontmatter | 열림 |
| R6 | `known_marketplaces` 잔여가 4개 shipped 문서에서 M3 소유로 지정됐으나 **PRD엔 항목이 없다** | backlog 2026-09-02 santa R2 | 런북 6절이 실질을 답함 · PRD 흔적 없음 |
| — | 컷 절차 강제기 | backlog 2026-09-04 | **범위 밖 (UI5)** — 첫 수동 컷이 전제 |
| — | `ship-gate-stale-head`(m1) · findings registry close 경로 · Validation 커밋-전 무력화 | backlog | **범위 밖 (UI3)** — 소유 축이 다른 곳 |

`.claude/state/fix-task.md`는 **존재하지 않는다.** `fix-task-applied.md`는 `ci-full-suite-m2`
소유라 UI3 밖이다. 즉 UI1의 "fix-task" 축에 대해 이 PRD가 가진 것은 R5 하나다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 가드 스크립트 | `scripts/version-declaration-guard.js:1-38` | repo-root `scripts/` 배치 + 헤더에 "무엇을 재는가" 열거 + `--json`/`--base` 플래그 + 기구 실패는 **통과가 아니라 HALT** |
| 가드 실패 표면 | `scripts/version-declaration-guard.js:193-230` | `violations[]`에 `{rule, detail}`을 쌓고 `ok = violations.length === 0` · JSON 리포트와 사람용 stderr를 분리 |
| 워크플로 | `.github/workflows/version-declaration-gate.yml:39-71` | matrix `[ubuntu, windows]` · **test를 가드보다 먼저** ("가드가 초록인데 가드 자체가 고장 나 있으면 초록의 의미가 없다") |
| 워크플로 주석 | `.github/workflows/gitignore-drift.yml:5-16` | `paths` 필터가 곧 판정 입력이며 하나라도 빠지면 게이트가 dead code가 된다는 경고를 파일에 남긴다 |
| 파생 단언 | `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:88-107` | 기대값을 `require('.../plugin.json').version`으로 **파생**하고 `<footer>` 태그에 앵커 — "리터럴 pin은 drift 가드를 하나 더 기억할 일로 만든다" |
| fail-open sentinel | `plugins/mccp/scripts/derive/host-version.js:11-19` | 미상은 throw가 아니라 `{version:null, source:'unknown'}` + `source` 라벨 표면화 |
| 사유가 곧 값인 escape | `scripts/version-declaration-guard.js:126-140` | `≥30자 ∧ ≥3단어` · `throw`하고 `main`이 잡는다(`process.exit`를 헬퍼에서 부르면 test 프로세스가 죽어 면제 경로가 검증 불가) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `scripts/release-manifest-guard.js` | CREATE | R1 — 좌표 파일 형태 단언의 상시 소유자 |
| `scripts/tests/release-manifest-guard.test.js` | CREATE | R1 — 판별력 test. 위반 6종이 실제로 붉어지는지 |
| `.github/workflows/release-manifest-gate.yml` | CREATE | R1 — 모든 PR에서 돌린다(backlog 처방의 문자 그대로) |
| `plugins/mccp/scripts/lib/renderer/plugin-version.js` | CREATE | R2 — 두 면이 공유하는 단일 파생원 |
| `plugins/mccp/scripts/lib/renderer/tests/plugin-version.test.js` | CREATE | R2 — 강등 경로가 throw하지 않고 sentinel을 내는지 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | R2 — footer 리터럴 → 파생 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | R2·R3 — 파생 + `derive-only`·`LLM-free` 정보 동등화 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | R3 — markdown footer의 정보 동등을 단언으로 고정 |
| `scripts/version-declaration-guard.js` | UPDATE | R2 — 4면 → 2면. 두 footer는 **리터럴 부재**의 역방향 단언으로 전환 |
| `scripts/tests/version-declaration-guard.test.js` | UPDATE | R2 — 역방향 단언의 판별력 |
| `.github/workflows/version-declaration-gate.yml` | UPDATE | R2 — 주석 + **renderer test 2종을 test 단계에 추가**(L2 invariant HIGH: 보상 검사가 어느 CI에도 없었다). `paths`는 유지하되 renderer 두 면을 더한다(그 검사의 판정 입력이므로) |
| `docs/release-channel.md` | UPDATE | R1·R4·R6 — 6절의 "CI화는 backlog 축" 문장 은퇴 · 7절 관측 갱신 |
| `.claude/prds/release-channel-separation.prd.md` | UPDATE | UI2 — M4 행 추가 + OQ6 신설(R6) + 소유 파일 목록 정정 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 닫힌 행 표시 + 미흡수 이연 적재(§3.14 의무) |
| `.claude/state/STATE.md` | UPDATE | R5 — `state-writer.js` API 경유 |
| `CHANGELOG.md` | UPDATE | `## [Unreleased]` 아래에만 적재 — 번호 헤딩 신설 금지(우산 결정 1) |
| `.claude/PRPs/reports/release-channel-separation-m4-report.md` | CREATE | 실측 전사 |

**`plugins/mccp/.claude-plugin/plugin.json`은 이 표에 없다.** 우산 결정 1 —
브랜치는 번호를 선언하지 않는다. `scripts/version-declaration-guard.js`가 기계로 막는다.

## Tasks

### Task 1: 좌표 가드 스크립트를 만든다 (R1)

- **Action**: `scripts/release-manifest-guard.js`. `.claude-plugin/marketplace.json`을 읽어
  mccp plugin 엔트리의 `source`에 대해 넷을 단언한다 —
  `source.source === 'git-subdir'` · `source.ref === 'release'` ·
  `source.path === 'plugins/mccp'` · **`sha` 키 부재** · `source.url ===
  'https://github.com/idenn207/mccp.git'`.
- **`url`은 존재가 아니라 값으로 단언한다** (L2 security HIGH 흡수). 존재만 보면 이
  가드가 가장 결과가 큰 축을 비운 채 성립한다 — `url`은 이 파일에서 유일하게 "코드를
  어디서 가져오는가"를 정하고, `known_marketplaces.json`에 `ref`가 없어 이 파일의
  편집은 릴리스 컷을 거치지 않고 사용자 clone에 즉시 도달한다(런북 6절 실측). 병합
  사고(§3.5.1 선례)가 `url`을 다른 저장소로 바꾸면 `ref`·`path`·`sha` 단언은 전부
  통과하고 `version-declaration-guard`는 이 파일을 아예 보지 않으므로, 다른 출처의
  plugin 본문이 fetch되는 경로가 어떤 검사에도 걸리지 않는다.
  읽기·파싱·엔트리 탐색 실패는 전부 **HALT**(exit 1)이며 통과가 아니다.
  `--json`으로 `{ok, entry, violations:[{rule,detail}]}`를 낸다.
- **Mirror**: `version-declaration-guard.js`의 헤더 주석 형식 · `violations[]` 누적 ·
  `fail()` 조기 종료 · 기구 실패가 청결이 아니라는 규칙.
- **`sha` escape는 두지 않는다.** backlog가 요구한 것은 "그 *일시*를 지키는 기계"인데,
  env escape는 그 일시를 **연장하는** 방향으로만 작동한다. 대신 `sha`가 있으면 가드가
  붉어지고 그 red가 타이머 역할을 한다 — 핀이 빠질 때까지 계속 붉다. 이것이 성립하려면
  워크플로에 `paths` 필터가 없어야 하고, Task 3이 그렇게 만든다.
- **Validate**: `node scripts/release-manifest-guard.js --json` → `ok:true`, violations 0

### Task 2: 판별력 test (R1)

- **Action**: `scripts/tests/release-manifest-guard.test.js`. 순수 함수
  `evaluateManifest(obj)`를 export해 fixture로 검사한다 — (a) 현행 형태 → `ok:true`,
  (b) `source`가 문자열(M1 이전 상대경로) → `ok:false`, (c) `ref`가 `main` → `ok:false`,
  (d) `sha` 추가 → `ok:false`, (e) `path` 오타 → `ok:false`, (f) 엔트리 부재 → `ok:false`,
  **(g) `url`이 다른 저장소 → `ok:false`**.
  **(b)가 핵심이다** — 변경 전 트리에서 실제로 실패하는 검사여야 이 가드가 무언가를 잰다.
  **(g)는 L2 security HIGH가 연 축이다** — 값 단언이 없으면 그 케이스가 통과하고, 통과하는
  순간 Task 1의 `url` 단언은 있으나 마나가 된다.
- **Mirror**: `scripts/tests/version-declaration-guard.test.js`.
- **Validate**: `node --test scripts/tests/release-manifest-guard.test.js`

### Task 3: 워크플로 등재 — `paths` 필터 없이 (R1)

- **Action**: `.github/workflows/release-manifest-gate.yml`. `pull_request: branches:[main]`
  에 **`paths` 필터를 두지 않는다.** 두 선례(`version-declaration-gate` ·
  `gitignore-drift`)는 *PR 안의 파일들 사이 drift*를 재므로 입력을 좁히는 것이 맞지만,
  이 가드는 *릴리스 좌표의 상시 불변식*을 재므로 좁히면 Task 1의 "red가 타이머"가 한 번만
  발화하고 죽는다(핀 PR 다음 PR부터 워크플로가 건너뛴다). 그 차이를 파일 주석에 남긴다.
  jobs는 test → 가드 순서(가드 자체의 고장을 먼저 잡는다). matrix는 `ubuntu-latest` 단일 —
  이 가드는 JSON 형태만 보고 경로·개행·권한을 만지지 않아 OS 축이 없다.
- **Mirror**: `.github/workflows/version-declaration-gate.yml:39-71` 구조,
  `.github/workflows/gitignore-drift.yml:5-16`의 `paths` 경고 주석 형식(여기서는
  **없는 이유**를 적는다).
- **Validate**: 아래 `## Validation` 검사 3.

### Task 4: 렌더러 버전 파생원 (R2)

- **Action**: `plugins/mccp/scripts/lib/renderer/plugin-version.js`.
  `readPluginVersion()` → `{version, degraded, reason}`. manifest를
  `../../../.claude-plugin/plugin.json` 상대 require로 읽되 try/catch로 감싸고 semver
  형태를 검사한다. 실패는 `{version:null, degraded:true, reason}`이며 **절대 throw하지
  않는다** — 렌더러가 대시보드를 못 그리게 만드는 것이 버전 문자열의 권한이 아니다.
  `degraded`면 stderr로 loud warn. `footerVersionLabel()` → `v1.34.4` 또는 `v미상`.
- **왜 require가 안전한가 (실측)**: 설치 캐시 `~/.claude/plugins/cache/mccp/mccp/<ver>/`가
  `.claude-plugin/plugin.json`을 실제로 포함한다(2026-09-04 확인). 그 상대 경로는
  worktree와 설치 캐시 양쪽에서 해소된다.
- **`host-version.js`와 혼동하지 말 것**: 그 모듈이 manifest를 **의도적으로 읽지 않는** 것은
  *호스트 프로젝트*의 버전 신호 축이고("plugin self-version stay invisible"), 여기서 파생하는
  것은 *이 플러그인 자신*의 렌더 출처 스탬프다. 축이 다르다.
- **Mirror**: `derive/host-version.js:11-19`의 fail-open sentinel + `source` 라벨 표면화.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/plugin-version.test.js`

### Task 5: 두 footer를 파생으로 바꾸고 정보를 동등하게 만든다 (R2·R3)

- **Action**:
  - `html.js:1422` — 버전 리터럴을 `footerVersionLabel()`로 교체. 나머지 문구 무변경.
  - `markdown.js:163` — 파생으로 교체하고 **`derive-only`·`LLM-free`를 추가**한다.
    두 면이 같은 정보를 다른 표현으로 담아야 한다는 PRODUCT.md Design Principle 4를
    지금은 위반하고 있고, 그 두 문구가 나르는 신뢰 신호("이 콘솔은 자동 derive 산출물이지
    사람이 편집한 문서가 아니다")를 가장 필요로 하는 환경이 plain-text 표면이다.
- **Mirror**: `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:94`가 이미
  확립한 파생 원칙.
- **Validate**: 아래 검사 4·5.

### Task 6: i18n-surface test에 markdown 정보 동등을 고정한다 (R3)

- **Action**: 기존 html footer 단언 옆에 markdown footer 단언을 추가한다 —
  버전은 `MANIFEST_VERSION` 파생 대조, 문구는 `derive-only`·`LLM-free` 두 토큰의 존재.
  html 단언과 **같은 토큰 집합**을 상수로 뽑아 둘이 갈라지지 못하게 한다.
- **Mirror**: 같은 파일의 앵커 방식(`<footer[^>]*>` 태그 앵커 — bare 버전 정규식이
  모델의 milestone 라벨에 오매칭한 선례가 그 파일 주석에 남아 있다).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

### Task 7: version-declaration-guard를 4면 → 2면으로 재배선한다 (R2)

- **Action**: Task 5가 리터럴을 없애면 `htmlFooterVersion`/`markdownFooterVersion`이
  `undefined`를 내고 가드가 **모든 PR에서** `version-face-unreadable`로 HALT한다. 가드
  자신의 주석이 "Fix the matcher in this guard together with the format change"라고 적은
  그 지점이다. 같은 커밋에서 고친다:
  - 두 면의 판정을 **역방향**으로 뒤집는다 — 버전 리터럴이 **있으면** 위반
    (`version-face-literal-reintroduced`), 없으면 `faces.<face> = 'derived'`.
  - **단, 부재는 여전히 위반이다** (L2 invariant HIGH 흡수). 역방향 단언만 두면
    footer 형식 변경·footer 삭제·파일 이름 변경이 전부 `derived`(통과)로 읽혀,
    `version-face-unreadable`이 오늘 **CI에서 차단하는** unknown이 내일은 통과가 된다.
    그래서 판정을 두 단계로 나눈다 — 먼저 face **앵커**(`<footer …page-foot` ·
    `derived from .claude/`)를 찾고, 못 찾으면 `version-face-missing`으로 위반이다.
    앵커를 찾은 뒤에야 그 줄에 리터럴이 있는지를 본다. unknown은 계속 막힌다.
  - 리터럴 대조가 남는 면은 `plugin_json`과 `changelog_note` **둘**이다. 컷이 움직이는
    면이 다섯에서 셋(manifest · CHANGELOG 노트 · CHANGELOG 항목)으로 준다 — OQ2의 답이
    예고한 그대로다.
  - 헤더 주석의 "무엇을 재는가" 열거를 함께 갱신한다. 열거와 코드가 어긋나면 다음 독자가
    코드가 아니라 열거를 믿는다.
- **약화되지 않는가**: 초안은 "footer 부재 축은 `i18n-surface.test.js`가 렌더 **출력**에서
  잡는다"고 답했는데, L2 invariant가 그 보상 검사를 **어떤 CI도 돌리지 않는다**는 것을
  실측했다 — workflow 5개 중 `i18n-surface.test.js`를 부르는 것은 0개이고
  (`.github/workflows/version-declaration-gate.yml:64-68`은 가드 test만 돈다), `test-suite-baseline.yml`은
  `continue-on-error: true` 측정 전용인 데다 `paths`가 `scripts/**`라 renderer 변경에
  발화조차 하지 않는다. 즉 "CI가 막는 unknown"이 "로컬에서만 보이는 unknown"이 된다.
  그래서 답을 둘로 나눈다: (1) 가드 자신이 앵커 부재를 위반으로 유지하고(위 항목),
  (2) `version-declaration-gate.yml`의 test 단계에
  `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`와
  `plugins/mccp/scripts/lib/renderer/tests/plugin-version.test.js`를 **추가**해 보상
  검사를 실제로 CI에 올린다. 두 검사의 분담을 가드 주석에 명시한다.
- **Validate**: 아래 검사 6.

### Task 8: 역방향 단언의 판별력 test (R2)

- **Action**: `scripts/tests/version-declaration-guard.test.js`에 세 케이스 추가 —
  (a) 파생 형태 소스 → `derived`, (b) 리터럴이 되돌아온 소스 →
  `version-face-literal-reintroduced`, **(c) 앵커 자체가 사라진 소스 →
  `version-face-missing`**. (b)가 없으면 역방향 단언이 "항상 통과하는 검사"이고,
  (c)가 없으면 Task 7이 닫기로 한 fail-open이 test에 남지 않는다.
- **기존 단언을 함께 회수한다** (L2 test HIGH 흡수). 추가만으로는 부족하다 — 현행 test는
  바꾸려는 동작을 **정답으로 고정**하고 있다. `seed()`(`:36-39`)가 모든 fixture에 리터럴
  footer를 심고, `'a face whose literal shape moved is reported, not silently skipped'`
  (`:106-113`)는 MD에 리터럴이 없을 때 `version-face-unreadable` + status 1을 단언한다.
  극성을 뒤집으면 그 케이스와 `:68`·`:76`·`:86`·`:115`가 전부
  `version-face-literal-reintroduced`로 붉어진다. 그러므로 `seed()`를 **파생 형태**로
  바꾸고 `:106-113`은 `version-face-missing`을 단언하도록 재키잉한다. 이 회수를 같은
  커밋에서 하지 않으면 Task 7은 red test 위에 착지한다.
- **Validate**: `node --test scripts/tests/version-declaration-guard.test.js`

### Task 9: 브랜치 보호 축 — 읽기 전용 재측정 (R4, UI4)

- **Action**: 보호 API를 1회 조회해 결과와 시각을 보고서에 전사한다. **원격 채널 ref를
  움직이지 않는다.** 런북 7절의 관측 문장에 재측정 시각을 반영하되 **결론은 바꾸지
  않는다** — 보호를 켜기 전에 롤백 왕복을 측정해야 한다는 순서 규칙(backlog 2026-09-04)이
  그대로 유효하고, 그 측정은 UI4로 이번 범위 밖이다. backlog 행은 **열린 채로 둔다.**
- **Validate**: 아래 검사 9(작업 전후 채널 좌표 동일).

### Task 10: R5 — M1 santa escalation을 종결한다

- **Action**: 두 단계다.
  1. **확인**: `.claude/receipts/mccp-santa-review/release-channel-separation-m1.json`의
     `review_proof`가 담은 각 지적이 backlog에 행을 갖는지 대조한다(현재 확인된 것:
     2026-09-01 santa R0 4행 · 2026-09-01 R1 2행 · 2026-09-02 R2 3행).
  2. **분기**: 전건이 적재됐으면 `state-writer.js` API로 `escalate_pending`을 해소하고
     사유를 STATE.md 본문에 남긴다. 하나라도 미적재면 **해소하지 않고** 무엇이 빠졌는지
     보고서에 적는다.
- **santa-loop를 다시 돌리지 않는다.** §3.16 — 라운드를 늘리는 것이 아니라 1라운드 결과를
  triage하고 진행하는 것이 이 저장소의 규칙이고, escalation의 실질(지적 9건)은 이미
  backlog가 소유한다. 해소는 "리뷰를 통과했다"가 아니라 "지적이 원장으로 옮겨졌다"는
  기록이며, 그 구분을 STATE.md 본문에 그대로 적는다.
- **STATE.md를 직접 편집하지 않는다** — §3.2. frontmatter 스키마·advisory lock·CRLF
  정규화·schema version guard가 writer API에 묶여 있다.
- **Validate**: 아래 검사 12.

### Task 11: R6 — PRD에 M4와 OQ6를 착지시킨다 (UI2)

- **Action**:
  - `## Delivery Milestones`에 4행 추가: `residual-closure` · Outcome · `in-progress` ·
    이 계획서 경로. **M1~M3 행은 손대지 않는다.**
  - `## Open Questions`에 6번째 항목을 **닫힌 상태로** 추가한다 —
    "`known_marketplaces.json`에 `ref`가 없어 `marketplace.json` 편집이 머지 즉시 도달하는
    잔여를 어디가 소유하는가". 답: 런북 6절이 그 표면을 릴리스 표면으로 규정했고, M4의
    Axis A가 그 형태를 상시 가드로 만든다. backlog 2026-09-02 santa R2가 요구한
    "PRD에 6번째 Open Question으로 추가하거나" 처방의 이행이다.
  - `## Scope`의 "소유 파일" 문장에 M4가 새로 소유하는 파일을 더한다. 같은 문장의
    "어느 in-flight 브랜치도 이 파일들을 소유하지 않는다"는 주장은 renderer 두 면과
    `version-declaration-guard.js`가 병렬 충돌 축임을 감안해 **범위를 명시**하도록 좁힌다
    (backlog 2026-09-01 santa R1이 지적한 그 문장이다).
  - `## Scope` 서두 "MVP — M1 단독" 문단에 M4가 무엇이고 무엇이 아닌지 한 문장.
    **`Out of scope`의 "릴리스 자동화(CI에서 tag + fast-forward)"와 구별한다** — Axis A는
    태그도 fast-forward도 하지 않고 좌표 파일의 형태만 잰다.
- **Validate**: 아래 검사 10.

### Task 12: 런북 6절의 "backlog 축" 문장을 은퇴시킨다 (R1)

- **Action**: `docs/release-channel.md` 6절 말미의 "이 탐지기의 약점을 명시한다: 사이클마다
  실행돼야만 작동한다 … CI화는 backlog 축이다"를 **닫힌 형태로 고쳐 쓴다** — 무엇이
  약점이었고 무엇이 그것을 닫았는지(가드 경로 · 워크플로 이름 · `paths` 필터 부재의 이유)를
  남긴다. 문장을 지우지 않는 이유는 §3.7·§3.17과 같다: 무엇이 왜 달라졌는지가 함께 남아야
  한다. 절 라벨은 **측정됨**을 유지한다(관측은 그대로고 강제만 넓어졌다).
- **편집 도구 주의**: M3이 같은 파일을 `String.replace`로 고치다 치환 패턴(`$'`)에 걸려
  문서를 2.4배로 부풀렸다. 치환 패턴을 해석하지 않는 `split`/`join`을 쓰거나 편집 도구로
  직접 고칠 것.
- **Validate**: 아래 검사 11.

### Task 13: backlog 정리와 §3.14 이연 적재

- **Action**: M4가 닫은 backlog 행 3건(2026-09-04 marketplace CI화 · 2026-09-03 renderer
  footer 비대칭 HIGH · 2026-09-02 santa R2 PRD 항목 부재)에 닫힘 표시와 근거 파일을
  덧붙인다. **행을 삭제하지 않는다** — 원장은 append-only다. 이번 사이클의 리뷰가 내는
  MEDIUM·LOW와 기각한 HIGH는 §3.14대로 증거와 함께 새 행으로 적재한다.
- **Validate**: 아래 검사 13(4열 헤더 무손상 — 5번째 열은 기존 행 전부를 파서에서
  사라지게 한다).

## Validation

```bash
# 1. 새 가드가 현행 좌표를 통과한다
node scripts/release-manifest-guard.js --json

# 2. 새 가드의 판별력 — 위반 6종이 실제로 붉어진다
node --test scripts/tests/release-manifest-guard.test.js

# 3. 상시성 — paths 필터가 없고 test와 가드를 둘 다 돈다
node -e "const y=require('fs').readFileSync('.github/workflows/release-manifest-gate.yml','utf8'); if(/^\s+paths:/m.test(y)) throw new Error('paths filter present'); if(!/release-manifest-guard\.js/.test(y)) throw new Error('guard not invoked'); if(!/release-manifest-guard\.test\.js/.test(y)) throw new Error('discriminating test not invoked'); console.log('ok: standing gate, test-before-guard');"

# 4. 렌더러 두 면의 FOOTER에 버전 리터럴이 0건 (앵커 기반 — 파일 전수 아님)
#    L2 3인(architect·test·invariant)이 같은 결함을 짚었다: 파일 전수 정규식은
#    html.js의 이력 주석 9건(:7 :44 :64 :70 :77 :540 :614 :795 :1425)을 함께 잡아
#    **어떤 상태에서도 붉다** — 올바른 상태를 포함해서. 그러면 판별력이 0이고, 예측
#    가능한 수리는 matcher 완화이며 그것이 게이트가 게이트이기를 그만두는 방식이다.
#    앵커는 plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:98-100 이
#    같은 오탐을 겪고 채택한 <footer> 태그
#    앵커를 따른다. 앵커 줄이 정확히 1개가 아니면(삭제·중복) 그것도 실패다.
node -e "const fs=require('fs'); const FACES=[['plugins/mccp/scripts/lib/renderer/html.js',/<footer[^>]*page-foot/],['plugins/mccp/scripts/lib/renderer/markdown.js',/derived from \.claude\//]]; FACES.forEach(function(p){var f=p[0],a=p[1]; var lines=fs.readFileSync(f,'utf8').split('\n').filter(function(l){return a.test(l);}); if(lines.length!==1) throw new Error(f+': expected exactly 1 footer anchor line, found '+lines.length); var m=lines[0].match(/v[0-9]+\.[0-9]+\.[0-9]+/g); if(m) throw new Error(f+' footer still carries a version literal: '+m.join(','));}); console.log('ok: both renderer footers derive (anchored)');"

# 5. 렌더 출력이 manifest와 일치하고 두 면의 정보가 동등하다
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js plugins/mccp/scripts/lib/renderer/tests/plugin-version.test.js

# 6. 재배선된 version 가드가 통과하고 두 면이 derived다
node scripts/version-declaration-guard.js --json
node --test scripts/tests/version-declaration-guard.test.js

# 7. 우산 결정 1 — 이 브랜치는 번호를 선언하지 않는다
node scripts/version-declaration-guard.js --base origin/main

# 8. 렌더러가 실제로 돈다 (파생 require가 런타임에 해소되는가)
node plugins/mccp/scripts/derive/cli.js render

# 9. 채널 좌표가 움직이지 않았다 (UI4)
git ls-remote origin refs/heads/release

# 10. PRD 구조 — 마일스톤 4행 · 미체크 OQ 0건
#    L2 2인(architect·test)이 짚었다: 전역 행 정규식은 Success Metrics 표(3행)와
#    '못박는 결정 3건' 표(3행)까지 세어 현재 이미 9행이므로 확정 HALT였다.
#    마일스톤 표 하나로 범위를 좁힌다(현재 3행 → M4 추가 후 4행).
node -e "const b=require('fs').readFileSync('.claude/prds/release-channel-separation.prd.md','utf8'); const i=b.indexOf('## Delivery Milestones'); if(i<0) throw new Error('Delivery Milestones section absent'); const rest=b.slice(i+1); const e=rest.indexOf('\n## '); const sec=e<0?rest:rest.slice(0,e); const rows=sec.split('\n').filter(function(l){return /^\|\s*[0-9]+\s*\|/.test(l);}); if(rows.length!==4) throw new Error('milestone rows='+rows.length); const u=(b.match(/^- \[ \]/gm)||[]).length; if(u!==0) throw new Error('unchecked OQ='+u); console.log('ok: 4 milestone rows, 0 unchecked');"

# 11. 런북의 은퇴 문장이 사라지고 새 경로가 인용됐다
node -e "const b=require('fs').readFileSync('docs/release-channel.md','utf8'); if(/CI화는 backlog 축이다/.test(b)) throw new Error('retired sentence present'); if(!/release-manifest-gate/.test(b)) throw new Error('runbook does not cite the new gate'); console.log('ok');"

# 12. escalation 상태
node -e "const s=require('fs').readFileSync('.claude/state/STATE.md','utf8'); const m=s.match(/^escalate_pending:\s*(\S+)/m); console.log('escalate_pending =', m?m[1]:'(absent)');"

# 13. backlog 4열 헤더 무손상
node -e "const b=require('fs').readFileSync('.claude/plans/codex-findings-backlog.md','utf8'); const h=b.split('\n').find(function(l){return /^\|\s*Date\s*\|/.test(l);}); if((h.match(/\|/g)||[]).length!==5) throw new Error('not 4-column'); console.log('ok');"
```

**아래 셋은 커밋 이후에만 의미가 있다** (backlog 2026-09-04 code-review H1). 커밋이 0개면
diff가 비어 대상 0건으로 자동 통과하고, 그중 15는 이 저장소의 유일한 절대경로 유출
탐지기다. 커밋 후 재실행하고 **그 결과를 보고서에 전사한다.**

```bash
git rev-list --count origin/main..HEAD   # 0이면 아래 셋은 아직 아무것도 재지 않는다

# 14. 삭제 0건 (§3.5.1)
git diff --diff-filter=D --name-only origin/main...HEAD

# 15. 절대경로 유출 0건
git diff --name-only origin/main...HEAD | grep -E '\.(md|json|js|yml)$' | xargs -r grep -nE 'C:\\+Users|/Users/|_project|\.worktrees|nvm4w' || echo "ok: 0건"

# 16. 브랜치가 번호를 선언하지 않았다
git diff --name-only origin/main...HEAD | grep -x "plugins/mccp/.claude-plugin/plugin.json" && { echo "HALT: 번호 선언"; exit 1; } || echo "ok: plugin.json 무변경"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task 5(리터럴 제거)와 Task 7(가드 재배선)이 분리 착지하면 **모든 PR이 붉어진다** — 가드가 `version-face-unreadable`로 HALT한다 | 높음 | 둘을 **단일 커밋 불변식**으로 다룬다. 검사 4와 6을 같은 Validation 블록에 두어 한쪽만 착지한 상태가 green이 될 수 없게 한다. 가드 헤더 주석에도 그 결속을 적는다. **L2 invariant HIGH 흡수**: 이 완화는 검사 4가 판별력을 가질 때만 성립하는데 초안의 검사 4는 모든 상태에서 붉어 공허하게 만족됐다 — 앵커 기반으로 고쳐 올바른 상태에서만 green이 되게 했다 |
| 파생 require가 어떤 설치 형태에서 해소되지 않아 렌더러가 죽는다 | 낮음 | Task 4가 try/catch + sentinel. **throw하지 않는다.** 검사 8이 실제 렌더를 1회 돌려 확인한다. 설치 캐시가 manifest를 담는 것은 2026-09-04 실측 |
| 역방향 단언이 "footer 삭제"를 통과시켜 가드가 약해진다 | 중 | 그 축은 가드가 아니라 `i18n-surface.test.js`가 렌더 **출력**에서 잡는다(footer 부재 → 미매치 → red). 분담을 가드 주석에 명시하고, 검사 5·6을 함께 돌린다 |
| `paths` 필터 없는 워크플로가 모든 PR에 job 하나를 더한다 | 높음 | 의도된 비용이다. 가드는 JSON 하나를 읽는 수 ms 스크립트이고, 필터를 두면 Task 1의 "red가 타이머" 설계가 성립하지 않는다. matrix를 단일 OS로 두어 비용을 절반으로 |
| Task 10이 escalation을 근거 없이 해소해 감사 기록이 거짓이 된다 | 중 | 해소는 **분기의 한쪽**이다. 지적 전건이 backlog 행을 갖는지 먼저 대조하고, 하나라도 없으면 해소하지 않는다. 해소하는 경우에도 STATE.md 본문이 "리뷰 통과"가 아니라 "지적이 원장으로 이관"이라고 적는다 |
| PRD에 M4를 추가해 `/mccp:archive-complete`가 이 PRD를 더는 아카이브하지 못한다 | 높음 | 의도된 결과다(UI2). §3.11 C2대로 전 milestone이 닫혀야 아카이브가 성립하고, M4가 열린 동안은 열려 있는 것이 맞다 |
| 이 사이클도 M3처럼 승인 receipt 없이 착지한다 — `mccp-plan-codex__release-channel-separation` 원장이 **이미 3라운드**이고 봉인 캡은 1이다 | **높음** | 예측된 상태다. L2 패널 emit이 `round-cap`으로 거절되면 위조하지 않고 **부재를 택한다**(M3 D4 선례). cross-gate dedupe는 `converged` 외 전부 fail-closed라 `/mccp:pr`에서 PR-Codex가 실제로 발화한다 — 진입은 승인이 아니다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation 1~13 전건 exit 0, 그리고 **커밋 후** 14~16 재실행 결과를 보고서에 전사
- [ ] Patterns mirrored, not reinvented — 새 가드가 `version-declaration-guard.js`의 구조를
      따르고, 파생이 `i18n-surface.test.js`가 이미 세운 원칙을 확장한다
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동):
      **`node plugins/mccp/scripts/derive/cli.js render`를 1회 돌려 `.claude/cache/status.html`의
      footer가 `plugin.json`의 번호를 실제로 담고, `.claude/cache/STATUS.md`의 마지막 줄이
      같은 번호와 `derive-only`·`LLM-free`를 함께 담는 것을 확인한다.** 두 파일의 해당
      줄을 보고서에 전사한다 — test는 stub 모델로 돌므로 실제 derive 산출물에서 require가
      해소되는지는 그것만 증명한다
- [ ] 채널 좌표가 시작 시점과 동일 (UI4 — 원격 ref 무이동)
- [ ] `plugins/mccp/.claude-plugin/plugin.json` diff 0줄 (우산 결정 1)

## Design Critique

`impeccable-detect detect --mode plan` → `skill_available=true` · `design_signal=true`
(`reason=ok`). 신호원은 renderer 두 면과 그 산출물(`.claude/cache/status.html` ·
`.claude/cache/STATUS.md`)이다. 해소된 call form은 `Skill(impeccable, …)`
(`source=user` · `4.0.4`).

**round 0/2 → `CONVERGED`** (`decideCritique`, HIGH/CRITICAL/severity-미상 0건).
이 계획서가 도입하는 렌더 표면 델타는 **footer 문자열 둘**이 전부다 — 하나는 리터럴이
파생으로 바뀌고(값 불변), 다른 하나는 같은 이탤릭 구분자 안에서 토큰 둘을 얻는다.

| Output Constraint | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | pass | 렌더 표면에 heading을 추가하지 않는다. `<footer>`는 heading이 아니고, 계획서 본문도 `##`/`###`까지만 쓴다 |
| 강조색 화면당 1개 | pass | `class="page-foot mono"` 무변경. accent/highlight 토큰 신규 0건이고, markdown 면은 이탤릭 텍스트 그대로다 |
| raw markdown marker 금지 | pass | 새 마커를 도입하지 않는다. 기존 `_…_`는 STATUS.md의 **네이티브 렌더**에서 이탤릭이지 raw가 아니다 |
| 한 화면 항목 수 상한 | pass | footer는 `list-of-N` 섹션이 아니고, 어떤 목록 섹션도 건드리지 않는다 |

**범위 밖 관찰 (finding 아님, 고칠 계획서 섹션이 없다)**: `STATUS.md`를 *plain text로*
읽을 때 `_…_`의 밑줄이 그대로 보인다. 선재이며 이 계획서가 도입하는 것이 아니고
(`.claude/PRPs/plans/archived/session-process-reclaim-followup.plan.md:757`이 같은 관찰을
이미 남겼다), anchor는
*렌더된* 표면을 기준으로 하므로 위반이 아니다. Task 5가 그 줄을 건드리므로 여기 적어 둔다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 아직 없으므로
**어떤 impeccable 명령도 호출하지 않는다** — 아래는 구현자를 위한 체크리스트다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

이 델타에 실제로 걸릴 가능성이 있는 것은 `evaluate`뿐이고, implement 단계 탐지기는 diff를
보므로 렌더 표면 변경(footer 2줄)이 diff에 실재해 M3의 `design_signal=false`와 달리
발화할 수 있다. Phase 3.7 produced-diff grounding lint(H15, heading depth ≤ 3)는 footer가
heading을 만들지 않으므로 no-op이 예상된다.

## External Research Provenance

- Source PRD: .claude/prds/release-channel-separation.prd.md
- References section sha256: 53a925d7dee3c6675e30dd695f7deb1d82e5e496b092c060a609975356528d3b
- Stamped at: 2026-09-04T05:25:36.456Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Gate Deviation

**Plan-review 패널은 승인하지 않았다.** `/mccp:plan`(2026-09-04) L2 패널 4명이 전원
`verdict=fail`을 냈고 quorum(3/4) 미충족으로 verdict는 `divergent`로 봉인됐다.
`MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion`이 **라운드 반복만** 완화했고
verdict는 위장되지 않았다 — receipt
(`.claude/receipts/mccp-plan-codex/release-channel-separation-m4.json`)의
`resolution.review_verdict`가 `divergent`다.

| 축 | 상태 |
|---|---|
| L1 | `converged` (violations 0) |
| L2 | `divergent` — 4/4 응답, 4 role, quorum 미충족 |
| L3 | 미발화 (`MCCP_PLAN_REVIEW=multi-agent`) |
| Codex | `skipped` — `MCCP_CODEX_DISABLED=1` 영구 운영자 정책 |
| 라운드 | 1/1 소진. `cap=1`이 `single-pass+codex-disabled`로 pin돼 **2라운드는 기계가 거부**한다 |

**findings 처리 (§3.14 · §3.16).** 15건(HIGH 8 · MEDIUM 6 · LOW 1 · CRITICAL 0) 중
**HIGH 8건을 전건 흡수**했다 — 각 흡수 지점에 `L2 <perspective> HIGH 흡수`로 표시했고,
모든 주장을 실측으로 재확인한 뒤 반영했다(리터럴 9건 · PRD 9행 · test pin `:106-113` ·
workflow 5개 중 0개 · `marketplace.json` url). blocking 12행은 게이트가
`.claude/plans/codex-findings-backlog.md`에 기계로 적재했고, MEDIUM·LOW는 같은 원장에
이연했다. 원문은 `.claude/reviews/plan-review-release-channel-separation-m4.md`.

**흡수 후 재리뷰는 하지 않는다** (§3.16). 라운드 캡이 기계로 닫혀 있고, 그 규칙의 근거는
"계획을 오류 없이 만들어도 다른 마일스톤이 진행되면 어차피 수정된다"이다.

**흡수의 비용은 측정됐다.** 흡수가 receipt의 `plan_hash`를 어긋나게 한다:

```
receipt_plan_hash  sha256:342f47cf9a575be88f10ee6f5b1765f4251126a81ae9d4917fc8d288b342001c
validate --command mccp:prp-implement  ->  ok:false, stale 1, blocking 0, missing 0
```

`receipt_plan_hash`만 적는다. `current_plan_hash`는 **이 파일 안에 적을 수 없다** — 적는
행위가 곧 그 값을 바꾸므로 어떤 리터럴도 쓰는 순간 거짓이 된다. 현재 값은 위 validate
명령이 그때그때 보고한다.

`blocking`이 **비어 있다**는 것이 핵심이다 — ship-verdict 축은 전부 통과했고 `ok=false`의
유일한 사유가 staleness다. 이 상태는 이 저장소에서 **구조적**이며(2.5.4의 섹션 주입이 모든
사이클에서 같은 상태를 만든다), 처방은 receipt 재봉인이 **아니다**: 패널이 읽지 않은 본문에
승인을 다시 봉인하는 것이고, `write.js`의 DD13 바인드가 그것을 거부한다(§3.12 no-rehash ·
§3.16 receipt 위조 금지). 정당한 경로는 둘뿐이다 — (1) `/mccp:prp-implement` 진입 시
`MCCP_SKIP_RECEIPT=1`을 **사유와 함께** 1회 사용하고(§3.16이 열거한 audited escape),
(2) `/mccp:pr` 본문의 `## Gate Deviation`에 이 절을 인용해 receipt가 덮지 못하는 델타가
무엇인지 명시한다.

**남은 미흡수**: MEDIUM 6 · LOW 1. 그중 셋은 이 계획서가 의도적으로 유지하는 설계다 —
`sha` audited escape 부재(Task 1의 "red가 타이머" 설계), PRD 결정 표 미정정,
`escalate_pending` 해소의 기계 대조 부재. 앞의 둘은 backlog에 남고, 셋째는 아래 R5 주석이
이어받는다.

**R5 대상 이동 (게이트 부수효과)**: 이 게이트의 `divergent`가 escalation을 새로 열어
`STATE.md`의 `escalate_pending_decision_id`가 `release-channel-separation-m1` →
`release-channel-separation-m4`로 덮였다. Task 10이 겨냥한 M1 escalation은 실체
(santa-review receipt의 divergent 봉인)로 남아 있지만 frontmatter가 더는 그 이름을
가리키지 않는다. Task 10은 두 escalation을 구분해 처리해야 한다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
