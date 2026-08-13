# Plan: 메타 조사 커맨드 (`/mccp:meta-research`)

**Source PRD**: `.claude/prds/meta-research-command.prd.md`
**Selected Milestone**: 1 — `/mccp:meta-research` + 규격 형식
**Complexity**: Medium

## Summary

`.claude/_meta/` 산출물 5종을 손으로 재구성해 온 절차를 커맨드 하나로 고정한다. 커맨드는 조사 골격(코드 근거 → 외부 문헌 → 저장소 선례 → 판정)을 phase로 강제하고, 산출물을 `.claude/_meta/<date>-<slug>.md` 규격 형식으로 기록하며, `_meta/README.md` 색인에 자동 등재한다. 형식·전제 명시·색인 도달은 결정적 lint(`meta-research.js lint`)가 fail-closed로 검사한다 — 조사 *품질*은 강제하지 않는다(PRD Risk 1이 이미 인정한 한계).

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 조사는 게이트가 아니므로 receipt를 발행하지 않는다 (`GATE_IDS` 미등재) | exclusion |
| UI2 | 인용한 코드의 변경을 감지해 문서를 자동 갱신하는 자동 재검증은 만들지 않는다 | exclusion |
| UI3 | `_meta/`를 대시보드 derive source로 추가하지 않는다 | exclusion |
| UI4 | 외부 문헌 조사는 자동화하지 않고 기존 `/deep-research` 결과를 받아 배치만 한다 | constraint |
| UI5 | 조사 결과로부터 PRD를 자동 생성하지 않는다 | exclusion |
| UI6 | 산출물은 무엇을 근거로 어느 시점 코드를 보고 판정했는지 반드시 기재한다 | constraint |
| UI7 | 산출물은 `.claude/_meta/<date>-<slug>.md` 규격 형식으로 기록하고 README 색인에 자동 등재한다 | direction |
| UI8 | `.claude/meta/` → `_meta/` 이관은 완료됐고 잔여 범위는 커맨드 신설뿐이다 | exclusion |
| UI9 | 이 커맨드는 선택적이며 단일 기능 요구는 `/mccp:plan-prd` 직행 경로가 그대로 남는다 | constraint |
| UI10 | 조사 골격을 phase로 고정한다 — 코드 근거 수집, 외부 문헌, 저장소 내 선례 대조, 판정 | direction |
| UI11 | 커맨드 이름은 `/mccp:meta-research`로 한다 | direction |

## Design Decisions

> 저자 근거 — 리뷰어 focus에 주입되지 않는다(`## User Intent`와 분리).

- **DD1 — 단일 파일 lib + subcommand.** `archive-complete/`(scan.js + apply.js 디렉토리)와 `impeccable-detect.js`(단일 파일 + subcommand) 두 선례 중 후자를 택한다. 이 축은 파괴적 트랜잭션이 없어 scan/apply 분리가 살 이유가 없다. 파일 1개 + test 1개.
- **DD2 — 인용 경로 실존까지 검사(Open Question 3 해소).** 형식 검증만으로는 PRD Risk 3("전제 명시가 형식적으로만 채워진다")이 그대로 남는다. 경로 실존 검사는 `fs.existsSync` + 기존 `path-containment.assertContained` 재사용으로 싸다. 내용 정확성은 여전히 강제 불가 — 그렇게 주장하지 않는다.
- **DD3 — README에 기계 파싱 가능한 `## 색인` 표를 신설하고 기존 주제별 섹션은 그대로 둔다.** 기존 README는 날짜/주제로 묶인 서술이라 idempotent 등재의 앵커가 없다. 표를 새로 얹는 편이 서술을 재구조화하는 것보다 diff가 작고, 주제별 서술의 가치(무엇을 다뤘는지)를 보존한다.
- **DD4 — 무효화는 삭제가 아니라 `**Status**` 필드로 표시(Open Question 5 해소).** `archived/` 관례를 `_meta/`에 복제하면 `/mccp:archive-complete`의 discovery 계약(§3.11 C1)과 무관한 두 번째 아카이브 축이 생긴다. 산출물 헤더의 상태 필드 + 색인 표의 상태 열로 충분하고, 소실 위험이 0이다.
- **DD5 — `/mccp:plan-prd` 접속은 핸드오프 한 줄만(Open Question 2 해소).** 인자 전달을 만들면 UI5(자동 생성 금지)와 `plan-prd` Phase 0 co-creation 계약에 압력이 간다. 커맨드 종료 시 산출물 경로를 출력하고 사람이 인용한다.
- **DD6 — scaffold 산출물은 태어날 때 lint red다(L3).** "빈 Premises를 허용하고 나중에 채운다"는 곧 안 채운다는 뜻이다. red를 기본값으로 두면 Phase 4의 `lint --doc`가 통과할 유일한 길이 전제를 실제로 적는 것이 되고, PRD primary 지표(전제 명시 100%)가 소망이 아니라 기계 조건이 된다. L2는 scaffold 직후에도 green이므로 red 사유가 항상 "전제 미기재" 하나로 특정된다.
- **DD7 — register는 단일 형식만 파싱한다.** legacy 5종의 blockquote 서두까지 받는 다형 파서를 만들면, 형식이 둘이 되어 어느 쪽이 정본인지 사라지고 Task 1↔Task 2 결합의 검증 대상도 흐려진다. legacy는 Task 0이 한 번 손으로 백필하면 끝이고(5행, 1회), 이후 생기는 문서는 전부 scaffold 산출물이다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 커맨드 파일 형식 | `plugins/mccp/commands/archive-complete.md:1-4` | frontmatter `description` + `argument-hint`, 본문 상단 `> If I disappear silently…` 한 줄, Phase 번호 절 |
| 결정적 lib + subcommand | `plugins/mccp/scripts/lib/impeccable-detect.js` | 단일 파일, `node <file> <subcommand> --json`, 순수 함수 export + CLI 진입점 |
| fail-closed 문서 lint | `plugins/mccp/scripts/lib/instruction-contract/lint.js:1-50` | 번호 붙은 검사(C1~C4) 헤더 주석, 각 검사 fail-closed, 위반 시 non-zero exit |
| 문서 경로 봉쇄 | `plugins/mccp/scripts/lib/path-containment.js:29` | `assertContained(target, expectedParent, repoRoot)` — 문서가 준 경로를 열기 전에 lexical screen |
| markdown 표 파싱 | `plugins/mccp/scripts/lib/markdown-table.js:98-102` | `parseTableRows` / `splitTableRow` — 색인 표와 Premises 표 양쪽에 재사용 |
| 테스트 | `plugins/mccp/scripts/lib/archive-complete/tests/scan.test.js` | `node --test`, tmp 디렉토리 fixture, 부정 fixture 포함 |
| 커맨드 색인 | `CLAUDE.md` §4 Cheat Sheet | `/mccp:*` 한 줄 등재 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/meta-research.js` | CREATE | scaffold / register / lint 3 subcommand. 결정적 로직 전부 |
| `plugins/mccp/scripts/lib/tests/meta-research.test.js` | CREATE | 긍정 + 부정 fixture. lint 4검사 각각의 위반 케이스 |
| `plugins/mccp/commands/meta-research.md` | CREATE | 조사 골격 5 phase 커맨드 본문 |
| `.claude/_meta/README.md` | UPDATE | `## 색인` 표 신설 + 기존 5문서 백필 (DD3) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.7` → `1.24.0` (PRD 전 milestone 완료 = minor, §3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (§3.7 5면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | `## [1.24.0]` 항목 |
| `CLAUDE.md` | UPDATE | §4 cheat sheet에 `/mccp:meta-research` 한 줄 |
| `.claude/prds/meta-research-command.prd.md` | UPDATE | M1 status `pending` → `in-progress`, Plan 셀 채움 |

> `plugins/mccp/scripts/receipt/schema.js`는 **손대지 않는다** — UI1(receipt 미발행).

## Tasks

### Task 0: README 색인 백필 (선행 — 다른 모든 Task보다 먼저)

- **왜 Task 0인가 (R6 invariant HIGH×2 흡수)** — register(Task 2)·L4(Task 3)·Task 4의 실 repo 회귀 단언이 전부 이 표의 존재에 의존한다. 표가 없으면 legacy 5종이 전부 `NOT_INDEXED`라 `lint --all`이 red이고, 그 red가 lib 결함으로 오독된다. 의존이 문서상의 권고로 남으면 순서를 어길 수 있으므로 **번호 자체를 0으로 두어 구조적으로 먼저 오게 한다**. 이 Task 하나가 나머지 전부의 전제다.
- **Action**: `.claude/_meta/README.md` 최상단에 Task 2가 고정한 형식의 `## 색인` 표 추가, 기존 5문서 등재(상태 열: `diverse-agent-review-analysis.md`는 §1.3 무효화 반영해 `부분 무효`). 기존 주제별 섹션·유효기간 주의 문단은 **그대로 둔다**(DD3).
- **Validate**: 아래 3단 전부 (exit 0만으로는 표 생성 자체를 증명하지 못한다)
  1. `grep -c '^| \[' .claude/_meta/README.md` → **5** (백필 행 수)
  2. `grep -n '^| 문서 | 날짜 | 상태 | 한 줄 |$' .claude/_meta/README.md` → 1건 (헤더행 형식)
  3. `node plugins/mccp/scripts/lib/meta-research.js lint --all --json` → `ok:true` · `exempt[]` 길이 5

> 기존 5문서는 `## Premises` 등 규격 섹션이 없다. **소급 개작하지 않는다** — `lint --all`은 기본적으로 `## 색인` 등재(L4)와 파일명(L1)만 전수 적용하고, L2/L3(규격 섹션 + 전제)는 **템플릿으로 생성된 문서**(헤더에 `**Status**` 필드 보유)에만 적용한다. 이 분기는 lint 출력에 명시된다 — 조용한 면제가 아니다.

### Task 1: `meta-research.js` — scaffold

- **Action**: `scaffold --topic "<주제>" [--slug <slug>] [--date YYYY-MM-DD] [--json]`.
  - **`--date`도 slug와 같은 강도로 봉쇄한다 (R3 architect HIGH 흡수).** 파일명은 `<date>-<slug>.md`이므로 date 역시 경로 성분이다. `^\d{4}-\d{2}-\d{2}$` 불일치면 write 전 exit 1 — 이 정규식에는 `/`·`\`·`.`가 표현 불가하므로 `--date 2026-08-13/../../etc/passwd` 류가 `path.join` 정규화 이전에 죽는다. 미지정 시 오늘 날짜를 같은 형식으로 생성한다(항상 통과).
  - **slug 도출과 봉쇄 (2중, fail-closed)** — `--slug` 미지정 시 `--topic`을 kebab-case로 정규화하되, 결과가 allowlist `^[a-z0-9][a-z0-9-]{0,63}$`에 **불일치하면 즉시 exit 1**로 `--slug` 명시를 요구한다(한국어 주제는 정규화 결과가 비므로 항상 이 경로). `--slug`가 주어져도 **같은 allowlist로 재검증**한다 — `.`·`/`·`\`·`..`가 문법적으로 표현 불가하므로 traversal이 정규식 단계에서 죽는다.
  - **2중의 두 번째 — 대상 파일이 아니라 `_meta` 디렉토리를 앵커한다.** allowlist 통과 후 `assertContained(metaDir, repoRoot)`로 `_meta/`가 repo 밖으로 symlink되지 않았음을 확인하고, `fs.realpathSync(metaDir)`에 basename만 `path.join`해서 write한다. 정규식은 symlink를 못 보고, realpath 앵커는 정규식이 이미 죽인 `..`를 다시 볼 필요가 없다 — 두 층이 서로 다른 것을 본다.
  - **`assertContained` 호출 규약 2건 (Codex-panel R2 CRITICAL 흡수)**:
    - **3번째 인자 `repoRoot`를 넘기지 않는다.** [path-containment.js:50-66](../../plugins/mccp/scripts/lib/path-containment.js)은 그 인자가 truthy면 `expectedParentDir`가 `<repoRoot>/.claude/receipts` 하위임을 추가로 요구한다. `_meta/`는 receipts 트리가 아니므로 3-arg 호출은 **항상** `gate dir escapes receipts root`로 throw한다. 헤더 주석 L15-18이 "receipts 트리 밖 caller는 `repoRoot`를 생략해야 한다"고 명시하고, `pr-phase-lock.js`·`instruction-contract/lint.js`가 그 2-arg 형태를 쓴다.
    - **아직 존재하지 않는 파일에 걸지 않는다.** 같은 함수 L31-36이 `fs.realpathSync(targetPath)`를 먼저 부르므로 미생성 경로는 `cannot realpath receipt`로 throw한다. scaffold의 write 대상은 정의상 미존재이므로, 앵커 대상은 파일이 아니라 **이미 존재하는 `_meta` 디렉토리**여야 한다.
  - 경로 `.claude/_meta/<date>-<slug>.md`. **이미 존재하면 exit 1** (덮어쓰기 금지).
  - **템플릿 = 헤더 블록 1개 + `##` 섹션 6개** (총 7개 필수 구성요소 — L2가 검사하는 수와 같다):

    ```markdown
    # <Topic>

    **Status**: active
    **Date**: <YYYY-MM-DD>
    **Topic**: <원 주제 문자열>

    ## Premises

    | # | 참조 | 시점 | 무엇을 전제하는가 |
    |---|---|---|---|

    ## Evidence

    ## Prior Art

    ## Precedent

    ## Verdict

    ## Open Questions
    ```

  - **헤더 블록 문법은 고정이다** — `**Key**: value` 한 줄, 키당 1행, 값은 같은 줄. register가 이 문법을 파싱하므로(Task 2) 개행 분리형·blockquote형은 생성하지도 허용하지도 않는다.
  - **`## Premises` 표는 헤더행 + separator만 있고 데이터 행이 0개다.** 갓 scaffold된 문서는 L3(≥1행)에 의해 **의도적으로 lint red**다 — 전제를 안 적으면 커맨드가 끝나지 않게 만드는 강제 장치이며, PRD primary 지표(전제 명시 100%)의 기계적 근거다.
- **Mirror**: `impeccable-detect.js`의 subcommand + `--json` 진입점, `path-containment.js:29`의 봉쇄.
- **Validate**: `scaffold --topic x --slug demo --date 2026-08-13 --json` → 경로 출력 · 재실행 exit 1 · `--slug ../../etc/x` exit 1 · `--topic "한국어 주제"`(slug 미지정) exit 1.

### Task 2: `meta-research.js` — register (README 색인 등재)

- **Action**: `register --doc <path>`. 색인 행 `| [<파일명>](<파일명>) | <날짜> | <상태> | <주제> |`를 README `## 색인` 표에 append.
- **메타데이터 출처는 문서 헤더 블록 하나뿐이다 — 추가 인자 없음.** `--doc`을 읽어 Task 1이 고정한 문법으로 파싱한다:

  | 열 | 출처 | 추출 규칙 |
  |---|---|---|
  | 문서 | `--doc`의 basename | 경로가 아니라 파일명. 링크 target도 같은 문자열(README와 같은 디렉토리) |
  | 날짜 | `**Date**: <v>` | 정규식 `^\*\*Date\*\*:[ \t]*(\S+)[ \t]*$` (multiline) |
  | 상태 | `**Status**: <v>` | 정규식 `^\*\*Status\*\*:[ \t]*(.+?)[ \t]*$` |
  | 한 줄 | `**Topic**: <v>` | 정규식 `^\*\*Topic\*\*:[ \t]*(.+?)[ \t]*$` |

  셋 중 **하나라도 부재/빈 값이면 exit 1** (fail-closed — 빈 셀로 색인을 채우지 않는다). 값의 `|`는 `\|`로 escape해 표를 깨뜨리지 않는다.
- **legacy 문서는 register 대상이 아니다.** 기존 `_meta/` 5종은 `> 상태:` blockquote 등 다른 서두를 쓰며 이 파서는 그 형식을 **읽지 않는다**(다형 파싱 미도입 — Task 0이 손으로 한 번 백필하고 끝이다). 즉 register가 다루는 문서 = scaffold가 만든 문서.
- **색인 표 형식은 고정이다** (Task 0이 만들고 register가 유지한다):

  ```markdown
  ## 색인

  | 문서 | 날짜 | 상태 | 한 줄 |
  |---|---|---|---|
  ```

  헤더행 텍스트와 4열 순서가 계약이다. register는 `## 색인` 직후 첫 표를 찾아 그 표에만 쓴다.
- **idempotent** — 첫 열 링크 target이 같은 행이 있으면 그 행의 날짜/상태/한 줄을 **덮어쓰고** 새 행을 추가하지 않는다. `## 색인` 절 또는 그 표가 없으면 exit 1(Task 0 백필이 선행 조건).
- **preflight → write 순서 (R6 invariant MEDIUM 흡수)** — README를 읽어 `## 색인` 절과 헤더행 존재를 **먼저** 확인하고, 없으면 그 자리에서 exit 1한다. tmp 파일도 만들지 않는다. 구조 검사를 write 시도 이후로 미루면 실패가 "쓰다가 죽었다"로 보이고, 원인이 문서 구조라는 사실이 가려진다.
- **write 실패 처리** — 검사 통과 후에만 tmp write + `fs.renameSync` 원자 치환. rename 실패 시 non-zero exit + tmp 정리, README 원본 무손상(부분 기록된 색인이 남지 않는다).
- **Mirror**: `markdown-table.js#parseTableRows` / `splitTableRow`로 기존 행 파싱.
- **Validate**: 같은 doc으로 2회 register → 행 1개, 두 번째가 값 갱신 · `**Date**` 삭제한 doc → exit 1.

### Task 3: `meta-research.js` — lint (4검사 fail-closed)

- **Action**: `lint [--doc <path> | --all] [--json]`. 검사:
  - **L1 파일명** — `^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$` (README 제외). 전수 적용.
  - **L2 필수 구성요소 7개, 검사 지점은 9개** — 헤더 블록을 **1개 구성요소**로 세지만 검사는 3키(`**Status**` · `**Date**` · `**Topic**`, Task 1 문법) **각각**에 대해 한다. 하나라도 없으면 그 키 이름을 담은 `MISSING_COMPONENT` 1건(블록 존재 여부만 보면 `**Topic**` 누락 문서가 통과한다 — R5 test MEDIUM 흡수). `##` 섹션 6개(`Premises` · `Evidence` · `Prior Art` · `Precedent` · `Verdict` · `Open Questions`)는 각 1개. Task 1 템플릿이 정확히 이 9개 지점을 전부 채우므로 scaffold 직후 L2는 통과한다(L3는 아래대로 의도적 실패).
  - **L3 전제 명시** — `## Premises` 표 데이터 행 **≥1** · 시점 셀이 형식 검증을 통과 · 참조 셀이 실존 경로.
    - **시점 셀 형식** (Codex-panel R2 MEDIUM 흡수): `^[0-9a-f]{7,40}$`(commit sha) **또는** `^\d{4}-\d{2}-\d{2}$`(ISO date) 둘 중 하나. "비어있지 않음"만 요구하면 `sometime in August` 같은 값이 통과해 UI6("어느 시점 코드를 보고")가 형식적으로만 채워진다. 이 정규식은 값의 **파싱 가능성**만 보증하고 정확성은 보증하지 않는다 — PRD Risk 3의 잔여는 그대로 남으며, 그 이상을 주장하지 않는다.
    - 참조 셀 정규화: 백틱·앞뒤 공백 제거 → **`:<line>` / `:<start>-<end>` suffix를 `String.replace(/:\d+(?:-\d+)?$/, '')`로 제거** → 남은 문자열이 검사 대상 경로. strip이 없으면 `path-containment.js:29` 같은 정상 인용조차 실존 판정에서 false가 되어 L3가 전건 실패한다.
    - 경로 판정 3단계 (순서 고정):
      1. **lexical screen (5축)** — `\0` 포함 · 절대경로 · 드라이브 문자 · UNC · `..` 포함이면 그 자리에서 위반(`REF_OUTSIDE_REPO`). 이 단계가 먼저여야 escape가 "파일 없음"이라는 무해한 사유로 보고되지 않는다(`instruction-contract/lint.js` 헤더의 S3 흡수와 같은 이유). **NUL 축은 그 mirror가 실제로 갖고 있는 검사다** — 빼면 `src/x.js\0../etc` 류가 lexical을 통과해 `existsSync`에서 죽고, 위반 사유가 "경로 없음"으로 잘못 분류된다(R5 security MEDIUM 흡수).
      2. **`fs.existsSync(path.join(repoRoot, ref))`** — 미존재면 위반(`참조 경로 부재`).
      3. **`assertContained(joined, repoRoot)` — 2-arg, `repoRoot`를 3번째로 넘기지 않는다.** 위 Task 1과 같은 이유이며(receipts-root 검사가 켜져 무조건 throw), 존재가 2단계에서 이미 확인됐으므로 `realpathSync`도 안전하다. 이 단계가 잡는 것은 lexical screen이 볼 수 없는 **symlink escape** 하나뿐이다.
  - **L4 색인 1홉** — README `## 색인` 표에 그 파일명 링크 존재. 전수 적용.
  - **적용 범위 분기** — L1·L4는 `_meta/`의 모든 `.md`(README 제외)에 적용. **L2·L3는 헤더 블록에 `**Status**` 행이 있는 문서**(= scaffold 산출물)에만 적용하고, 면제된 문서는 `--json`의 `exempt[]`와 사람 출력 양쪽에 파일명 + 사유를 **명시 출력**한다(조용한 면제 금지).
  - 위반 1건이라도 있으면 exit 1.
- **`--json` 출력 스키마 (고정 — test가 여기에 단언한다)**:

  ```json
  {
    "ok": false,
    "scanned": 6,
    "violations": [
      { "doc": "2026-08-13-x.md", "check": "L3", "code": "REF_OUTSIDE_REPO", "detail": "../etc/passwd" }
    ],
    "exempt": [
      { "doc": "diverse-agent-review-analysis.md", "reason": "no-status-header" }
    ]
  }
  ```

  `code` enum: `BAD_FILENAME`(L1) · `MISSING_COMPONENT`(L2) · `PREMISES_EMPTY` · `BAD_TIMESTAMP` · `REF_OUTSIDE_REPO` · `REF_NOT_FOUND`(L3) · `NOT_INDEXED`(L4). **test는 `code`에 단언하고 메시지 문자열에 단언하지 않는다** — 순서 회귀(L3 lexical-screen-first)는 `..` 참조가 `REF_NOT_FOUND`가 아니라 `REF_OUTSIDE_REPO`로 오는지로 기계 판정된다.
- **Mirror**: `instruction-contract/lint.js`의 번호 검사 + fail-closed 헤더 주석 + lexical-screen-first 순서.
- **Validate**: Task 0 백필 후 `lint --all` exit 0 (legacy 5종은 `exempt[]`에 열거되어 출력됨).

### Task 4: 테스트

> 이 파일은 아직 디스크에 없다 — `Files to Change` 표에서 **CREATE**로 표시된 신규 산출물이며, 이 절은 그 파일이 무엇을 단언해야 하는지의 명세다. plan은 구현 이전 문서이므로 "파일이 존재하지 않는다"는 결함이 아니라 이 Task의 전제다.

- **Action**: `node --test`, tmp 디렉토리 fixture(실 repo `_meta/` 미오염). 단언은 전부 `--json`의 `code`/`exempt` 필드 대상 — 사람 출력 문자열에 단언하지 않는다.
  - **T0 왕복(핵심)** — 이 케이스가 PRD "절차 재현성" 지표의 유일한 기계 증거다.
    **전제**: fixture는 tmp repo(`git init` 불필요, `repoRoot`는 주입)에 셋을 만든다 —
    (a) `_meta/` 디렉토리,
    (b) Task 2가 고정한 **`## 색인` + `| 문서 | 날짜 | 상태 | 한 줄 |` 헤더행 + separator**를 담은 README.md(데이터 행 0). 그 절이 없으면 Task 2가 exit 1이라 3단계에서 왕복이 끊긴다,
    (c) **참조 대상 더미 파일 `src/target.js`** — 2단계가 Premises에 넣을 행은 정확히 `| 1 | src/target.js | 2026-08-13 | fixture |`다(줄 번호 suffix 없는 형태; suffix 있는 형태는 아래 긍정 fixture가 따로 덮는다). 참조 대상을 명시하지 않으면 L3가 2단계에서 먼저 실패해 L4(3단계)에 도달하지 못하고, 왕복 증명이 성립하지 않는다.
    1. `scaffold` → 산출 파일 존재 · `lint --doc`이 **L3로 red**(Premises 0행) · L2는 green
    2. Premises에 실존 경로 1행 추가 → `lint --doc`이 여전히 **L4로 red**(미등재)
    3. `register --doc` → `lint --doc` **exit 0**
    4. `register --doc` 재실행 → 색인 행 수 불변(1), 값만 갱신
  - **커맨드 골격 계약 lint 1건 (R5 test HIGH 흡수)** — PRD "절차 재현성" 지표는 *lib 왕복*이 아니라 **커맨드가 조사 골격을 구성함**을 요구한다. T0는 lib만 증명하므로 그 지표를 덮지 못한다. `commands/meta-research.md`를 읽어 **Phase 0~4 heading 5개가 정의된 순서대로 존재**하고 **Phase 4 블록이 `register --doc`와 `lint --doc`을 둘 다 호출**함을 정적 단언한다. 골격이 빠지거나 순서가 뒤집히면 red.
    - **이 test가 증명하는 것과 못 하는 것**: Phase 1~3의 실제 조사는 LLM 작업이라 단위 test로 강제 불가하다. 이 단언은 **골격의 존재와 순서**만 증명하며, 조사 품질은 PRD Risk 1이 이미 강제 불가로 인정한 축이다. 그 이상을 주장하지 않는다.
  - **부정 fixture (총 24, 전부 `code` 단언)**:
    - scaffold 4 — `--slug ../../x` · `--date 2026-08-13/../x` · 한국어 `--topic` + slug 미지정 · 덮어쓰기
    - register 2 — `**Date**` 부재 · `## 색인` 절 부재
    - L1 1 — `BAD_FILENAME`
    - **L2 9 — 검사 지점별 1건.** 헤더 3키 각각 삭제 3 + `##` 섹션 6개 각각 삭제 6. "`## Verdict` 하나만 지워 본다"로는 L2가 일부만 검사하는 구현 결함을 못 잡고, 헤더를 블록 단위로만 지워 보면 `**Topic**` 단독 누락을 놓친다(R4·R5 test MEDIUM 흡수)
    - **L3 7 — lexical 5축 각각 1건씩** (R6 architect MEDIUM 흡수 — 드라이브와 UNC를 한 건으로 묶으면 두 공격 벡터 중 하나가 미검증으로 남는다). lexical 5: `..` → `REF_OUTSIDE_REPO`(순서 회귀 — `REF_NOT_FOUND`로 오면 실패) · 절대경로 · **드라이브 문자 단독** · **UNC 단독** · `\0` 포함 → 전부 `REF_OUTSIDE_REPO`. existsSync 1: 미존재 → `REF_NOT_FOUND`. 시점 1: `sometime in August` → `BAD_TIMESTAMP`
    - L4 1 — `NOT_INDEXED`
  - **긍정 fixture 3** — 평범한 repo-relative 참조 1행이 L3를 통과 · 참조 셀 `<path>:98-102`(범위 suffix)가 strip 후 실존 판정(정규식 회귀) · **백틱으로 감싼 참조 셀이 strip 후 통과**(Task 3의 정규화 1단계 — 감싸는 백틱을 안 벗기면 정상 인용이 전건 `REF_NOT_FOUND`가 된다, R6 test MEDIUM 흡수).
  - **API 규약 회귀 1건** — scaffold를 실 `_meta/` 구조를 흉내낸 tmp에서 돌려 `PATH_ESCAPES_GATE`가 **발생하지 않음**을 단언한다. 3-arg `assertContained` 또는 미생성 파일 앵커로 되돌리면 red가 된다(R2 CRITICAL 회귀 잠금).
  - **symlink escape 부정 1건 (R6 architect HIGH 흡수)** — 지금까지 `assertContained`는 "발생하지 않음"만 단언했다. 그 층이 존재한다고 주장하는 유일한 위협(lexical screen이 못 보는 symlink escape)에 대해 **발생함**을 단언하는 케이스가 없으면, 호출을 통째로 지워도 test는 전부 green이다. tmp fixture에서 repo 밖을 가리키는 symlink를 만들고 그 경유 참조가 `REF_OUTSIDE_REPO`로 보고되는지 확인한다. `fs.symlinkSync`가 `EPERM`(Windows 비-개발자 모드)이면 **loud skip** — 조용히 통과시키지 않는다.
  - **실 repo 회귀 1건 (R4 test MEDIUM 흡수)** — tmp fixture만으로는 실제 `_meta/`의 인코딩·legacy markdown 변형에 대한 동작을 증명하지 못하고, Validation §3 스모크는 수동이라 이후 파일이 바뀌어도 안 잡힌다. 그래서 test 안에서 **실 repo root를 `repoRoot`로 주입해 `lint --all`을 돌리고 `ok:true` · `exempt` 길이 5를 단언**한다(읽기 전용, 쓰기 없음). `_meta/`에 규격 문서가 추가되면 이 단언이 자동으로 그 문서까지 검사한다.
  - **면제 1건** — `**Status**` 없는 legacy 형식 문서가 L2/L3 면제 + `exempt[]`에 **열거**되는지(조용한 면제 회귀).
- **Mirror**: `archive-complete/tests/scan.test.js`의 tmp fixture 구성.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/meta-research.test.js`.

### Task 5: 커맨드 본문 `meta-research.md`

- **Action**: 5 phase 고정 (UI10).
  - **Phase 0 SCAFFOLD** — 주제/slug 확정 후 `scaffold` 호출. 산출 경로 확보.
  - **Phase 1 EVIDENCE** — 저장소 코드 근거 수집. **각 근거는 `path:line` + 확인 시점(현재 HEAD sha)을 Premises 표에 즉시 기록**(UI6).
  - **Phase 2 PRIOR ART** — 외부 문헌. 자동화하지 않음 — 사용자가 `/deep-research` 등으로 얻은 결과를 붙여넣으면 배치, 없으면 "미조사"로 명시(UI4).
  - **Phase 3 PRECEDENT** — `.claude/_meta/` 기존 산출물 · `docs/` · `.claude/prds/`와 대조. 선행 문서의 전제가 무효화됐는지 확인하고 무효 발견 시 그 문서의 `**Status**`를 갱신 제안.
  - **Phase 4 VERDICT + REGISTER** — 판정 기록 → `register` → `lint --doc`. **lint 실패면 커맨드는 실패로 끝난다**(형식 미달 산출물을 남기지 않음).
  - 종료 출력: 산출물 경로 + `/mccp:plan-prd` 핸드오프 한 줄(DD5). PRD 자동 생성 안 함(UI5).
- **Mirror**: `archive-complete.md`의 frontmatter + Phase 절 구조.
- **Validate**: Task 4의 커맨드 골격 계약 lint — `commands/meta-research.md`를 문자열로 읽어 `^## Phase [0-4] — ` heading 5개를 정규식으로 뽑고 (a) 5개 전부 존재 (b) 등장 index가 0~4 오름차순 (c) Phase 4 heading부터 다음 `^## ` 또는 EOF까지의 구간에 `register --doc`과 `lint --doc` 문자열이 둘 다 존재를 단언한다. `ls` + frontmatter 파싱만으로는 골격 누락을 못 잡는다.

### Task 7: 릴리스 동기

- **Action**: `plugin.json` 1.24.0 · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · `CHANGELOG.md` · `CLAUDE.md` §4 한 줄 · PRD M1 status.
- **Validate**: `git grep -n "1\.23\.7" -- plugins/mccp | grep -v CHANGELOG` 가 비어야 한다. `renderer/tests/i18n-surface.test.js`가 plugin.json 파생인지 확인(M4에서 통합됨) — 하드코딩이면 함께 수정.

## Validation

```bash
# 1. 단위 — T0 왕복 + 커맨드 골격 계약 + 부정 24 + 긍정 3 + 회귀 3 + 면제
node --test plugins/mccp/scripts/lib/tests/meta-research.test.js

# 2. 실 repo 전수 lint — legacy 5종은 exempt[]로 열거되어야 하고, 조용히 빠지면 안 된다
node plugins/mccp/scripts/lib/meta-research.js lint --all --json

# 3. 실 repo 왕복 스모크 — T0의 4단계를 실제 _meta/ + README에 대해 그대로 재현한다.
#    (T0는 tmp fixture에서 돌므로, 이 스모크만이 실 repo 배선을 증명한다)
#    PRECONDITION: Task 0이 먼저 완료돼야 한다 — README에 `## 색인` 표가 없으면
#    step3의 register가 exit 1이고, 실패 원인이 lib 결함으로 오독된다.
grep -q '^## 색인$' .claude/_meta/README.md || { echo "SKIP: Task 0 미완료 (## 색인 부재)"; exit 1; }
M=plugins/mccp/scripts/lib/meta-research.js
node $M scaffold --topic smoke --slug lint-smoke --date 2026-08-13
node $M lint --doc .claude/_meta/2026-08-13-lint-smoke.md --json | grep -q PREMISES_EMPTY; echo "step1 L3 red: $?"
# Premises에 실존 참조 1행 삽입 (참조=이 lib 자신, 시점=오늘)
node -e 'const f=".claude/_meta/2026-08-13-lint-smoke.md",fs=require("fs");fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/(\|---\|---\|---\|---\|\n)/,"$1| 1 | plugins/mccp/scripts/lib/meta-research.js:1 | 2026-08-13 | smoke |\n"))'
node $M lint --doc .claude/_meta/2026-08-13-lint-smoke.md --json | grep -q NOT_INDEXED; echo "step2 L4 red: $?"
node $M register --doc .claude/_meta/2026-08-13-lint-smoke.md
node $M lint --doc .claude/_meta/2026-08-13-lint-smoke.md; echo "step3 expect 0: $?"
# CLEANUP — 무조건 실행(&&가 아니라 ;). 앞 단계가 죽어도 _meta/ 오염을 남기지 않는다.
git checkout -- .claude/_meta/README.md; rm -f .claude/_meta/2026-08-13-lint-smoke.md
# 정리 검증 — 비어야 한다. 비지 않으면 다음 실행이 오염된 상태를 본다.
git status --porcelain .claude/_meta/

# 4. 릴리스 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
git grep -n "1\.23\.7" -- plugins/mccp ':!*CHANGELOG*'
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| lint이 형식만 강제하고 조사 품질은 못 올린다 | High | PRD Risk 1이 이미 인정한 설계 목표. 과대 주장하지 않고 커맨드 문서에 명시 |
| 기존 5문서가 규격 섹션이 없어 `lint --all`이 즉시 red | High | Task 0 주석 — L2/L3는 템플릿 생성 문서에만 적용, 분기를 lint 출력에 표시 |
| 한국어 주제에서 slug가 빈 문자열로 무너짐 | Medium | scaffold가 ASCII slug 도출 실패 시 `--slug` 요구하며 exit 1 (fail-closed) |
| `## 색인` 표 신설이 기존 README 서술과 중복 | Medium | 표는 기계 앵커, 서술은 "무엇을 다뤘는지" — 역할이 다르다. 중복 항목명은 허용 |
| receipt 없는 커맨드라 누락돼도 아무도 모른다 | Medium | UI1이 의도한 성질. 발견성은 README 색인 + lint로만 담보 |
| 버전 충돌(§3.7 병렬 브랜치, 이번 사이클 3회 재발) | Medium | PR 직전 `origin/main` 머지 후 `## [1.24.0]` 중복 여부 확인, 중복 시 forward-only 상향 |

## Acceptance

- [ ] `node --test plugins/mccp/scripts/lib/tests/meta-research.test.js` green (T0 왕복 + 커맨드 골격 계약 1 + 부정 24 + 긍정 3 + API 규약 회귀 1 + 실 repo 회귀 1 + 면제 1)
- [ ] Validation §3 스모크가 정리까지 마쳐 `git status --porcelain .claude/_meta/`가 빈 출력
- [ ] `lint --all --json` → `ok:true` · `exempt[]` 길이 5 (legacy 열거, 조용한 면제 아님)
- [ ] Validation §3 실 repo 왕복 스모크가 step1 red → step2 red → step3 exit 0으로 통과
- [ ] T0 왕복이 test로 존재 — scaffold 직후 L3 red → Premises 채움 → register → exit 0 (절차 재현성 지표)
- [ ] scaffold `--slug`가 allowlist + `assertContained` 2중 봉쇄를 통과하지 못하면 write 전에 exit 1
- [ ] 템플릿 생성 문서의 `## Premises` 참조 경로 실존 100% (primary 지표 — L3가 기계 검증)
- [ ] `_meta/` 전 산출물이 README 색인에서 1홉 도달 (발견 가능성 지표 — L4가 기계 검증)
- [ ] `GATE_IDS` 무변경 (UI1)
- [ ] version 5면 동기 + PRD M1 status 갱신

## Design Critique

- 트리거: `impeccable-detect.js` `design_signal=true` (signal_files: `renderer/html.js` · `renderer/markdown.js` · `impeccable-detect.js` · `skills/frontend-design-direction/SKILL.md` — 앞 둘만 실제 변경 대상(§3.7 version 5면 동기)이고, 뒤 둘은 plan 본문이 그 경로를 **인용**한 데 따른 매칭이다)
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료
- 라운드: 1 (R0) · cap=2 · verdict **CONVERGED** — L2 패널 divergent(2026-08-13, 9 findings) 흡수 후 재판정에서도 동일
- 판정 근거 — 이 plan이 도입하는 rendered surface 변경은 기존 footer의 **version 리터럴 1개 교체**뿐이다. 신규 heading·accent token·markdown marker·list-of-N 섹션이 없어 4 Output Constraints 어느 축도 발화하지 않는다. scaffold 템플릿과 `_meta/*.md` 산출물은 `DESIGN_SURFACE_PATHS` 밖이며 UI3(대시보드 derive source 미추가)로 렌더 표면에 도달하지 않는다.

## Design Routing Guide

routing mode: `auto` (effective at implement stage). At implement the design gate routes these stage-appropriate impeccable commands; here they are a checklist only.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Multi-Perspective Fan-out

> Phase 2.5 fan-out 미실행. 세션 지시("Do not use workflows or deep-research unless the user requested it")에 따라 GROUND *enhancement* 축은 opt-out했고, 위 `## Patterns to Mirror`의 인라인 grounding이 근거 소스다. fan-out은 fail-open 설계라 plan을 차단하지 않는다. Phase 5 리뷰 게이트(승인 발행 축)는 커맨드가 mandatory로 규정하므로 그대로 실행한다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
