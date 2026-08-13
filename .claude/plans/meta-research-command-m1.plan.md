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
- **DD8 — `aliases.js`에 빈 spec으로 등재한다(선례가 갈리므로 판단을 남긴다).** santa R1에서 Claude·Codex 두 리뷰어가 **독립적으로** 미등재를 지적했다. 다만 저장소 선례는 실제로 두 갈래다 — `mccp:plan-prd`는 receipt를 안 쓰면서도 등재돼 있고([aliases.js:14-21](../../plugins/mccp/scripts/receipt/aliases.js), 전용 test가 *"must be registered so hooks recognize it explicitly"* 를 단언), 반면 `archive-complete`·`dashboard-audit`·`milestone-close`·`trace`·`work`·`resume`는 **전부 미등재**다. 즉 "receipt 없는 커맨드는 등재한다"는 규칙은 존재하지 않는다.
  - 그럼에도 등재를 택하는 이유는 비용/위험 비대칭이다. 등재는 `produces: []` · `requires_preceding: []` 이므로 **게이트 의미가 0**이고(UI1 무손상 — `GATE_IDS`는 그대로다), 얻는 것은 hook이 이 커맨드를 "unknown command, allow" fall-through가 아니라 **명시 인식**하는 것 하나다. 미등재의 유일한 이점은 파일을 안 건드리는 것뿐이다.
  - **이 결정이 UI1을 침범하지 않는다는 근거**: `aliases.js`는 `GATE_IDS`도 receipt schema도 아니다. `produces`가 비면 어떤 receipt도 발행되지 않으며, `requires_preceding`이 비면 어떤 선행 게이트도 요구하지 않는다 — `plan-prd`와 정확히 같은 형태다.
- **DD7 — register는 단일 형식만 파싱한다.** legacy 5종의 blockquote 서두까지 받는 다형 파서를 만들면, 형식이 둘이 되어 어느 쪽이 정본인지 사라지고 Task 1↔Task 2 결합의 검증 대상도 흐려진다. legacy는 Task 0이 한 번 손으로 백필하면 끝이고(5행, 1회), 이후 생기는 문서는 전부 scaffold 산출물이다.

### 리뷰에서 기각한 지적 (R10) — 루프 종료 지점

R10에서 test 관점이 HIGH 3건을 냈고 셋 다 기각했다. **이 라운드로 흡수 루프를 종료**한다(운영자 결정: HIGH 수준만 수용). 기각 사유:

- **"순서를 뒤집으면 실패하는 test가 없다"** — 있다. 커맨드 골격 계약 test가 세 호출의 **등장 index 오름차순**을 단언하므로, 순서를 뒤집으면 그 단언이 그대로 깨진다. 지적이 근거로 든 "API 수준 강제가 아니라 문서 수준"이라는 문장은 R9 architect MEDIUM을 흡수해 **과대 주장을 내가 낮춘 결과**다. 정직하게 낮춘 문구를 결함의 증거로 되읽으면, 다음 라운드에서 표현을 다시 올리는 것이 합리적 대응이 되어 버린다 — 그 유인은 받지 않는다.
- **"`## 색인` 없는 상태의 scaffold 부정 케이스가 없다"** — 대상을 혼동했다. Phase 0 preflight가 보는 것은 `## 색인`이고 scaffold가 보는 것은 `_meta/` 존재다. 후자의 부정 케이스는 이번에 추가했다(scaffold 6). 전자는 register 부정 2번째(`## 색인` 절 부재)가 이미 같은 실패를 lib 층에서 덮는다.
- **"test 파일이 아직 없어 25개 케이스 구현을 확인할 수 없다"** — 구조적으로 성립 불가한 요구다. plan은 구현 **이전** 문서이고 그 파일은 `Files to Change`에 CREATE로 선언된 산출물이다(Task 4 서두가 이미 명시). 이 지적을 결함으로 받으면 어떤 plan도 게이트를 통과할 수 없다 — 통과 조건이 "plan이 기술한 코드가 이미 존재할 것"이 되기 때문이다.

MEDIUM 5건(테스트 위치 3중 기재의 정본 모호 · `--pre-register` 전용 test 부재 · L4가 면제 문서에도 도는지의 명시 단언 · 순서 회귀가 `code`를 보는지 · Validation이 Task 0에 순차 의존)은 **backlog 이연**한다. 전부 test 보강 축이고 차단 심각도가 아니며(`quorum.js:33` 기준 HIGH/CRITICAL만 차단), 구현 단계에서 실제 test 파일을 보며 판단하는 편이 정확하다.

### 리뷰에서 기각한 지적 (R8)

패널 지적 중 다음 3건은 결함이 아니라 **이미 내린 설계 판단**이라 흡수하지 않았다. 기각을 적어 두는 이유는, 적지 않으면 다음 라운드가 같은 지적을 다시 올리고 판단이 매번 처음부터 서기 때문이다.

- **"면제가 2단 검증을 만든다"(invariant MEDIUM)** — 의도된 성질이다. legacy 문서는 규격 이전에 쓰였고 소급 개작 금지가 Task 0의 전제다(파일명 변경 = 인바운드 링크 6개 파손). L4가 전수로 남아 발견 가능성은 보전되고, 면제는 `exempt[]`에 열거되므로 조용하지 않다. R8 test HIGH 흡수로 그 집합이 **파일명 단위로 봉인**되기까지 했다.
- **"Validate 절이 서술이라 실행 강제가 아니다"(test MEDIUM)** — 범주 오류다. plan의 `Validate`는 실행 스크립트가 아니라 **Task 4가 무엇을 단언해야 하는지의 명세**이며, 지적 본문이 스스로 "Task 4는 두 축을 모두 덮는다"고 인정한다. 실행 강제는 Task 4의 test가 담당한다.
- **"`detail` 필드 형식이 L3 외에는 미명세"(test LOW)** — 미명세가 아니라 **비계약**이다. `detail`은 사람이 읽는 필드이고 test가 여기 단언하지 않는 것이 명시적 선택이다(Task 3의 `code` enum 문단) — 메시지 문자열 단언은 회귀에 취약해 `code`를 계약으로 삼았다. `detail` 형식을 계약으로 올리면 그 취약성을 도로 들여온다.

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
| `plugins/mccp/scripts/receipt/aliases.js` | UPDATE | `mccp:meta-research`를 빈 spec(`produces: []`)으로 등재 — hook 명시 인식 (DD8) |
| `plugins/mccp/scripts/receipt/tests/aliases.test.js` | UPDATE | 등재 회귀 1건 — `plan-prd` 케이스와 같은 형태로 `produces`/`requires_preceding`이 **빈 배열**임까지 단언(등재만 확인하면 나중에 게이트가 실려도 green) |
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
  1. `sed -n '/^## 색인$/,/^## /p' .claude/_meta/README.md | grep -c '^| \['` → **5** (백필 행 수). **README 전체를 세면 안 된다** — 기존 주제별 표가 이미 `| [` 로 시작하는 행 5개를 갖고 있어(실측) 전역 grep은 백필 전에도 5를 반환하고 백필 후 10이 된다. 즉 전역 형태의 단언은 통과·실패 어느 쪽도 표 생성을 증명하지 못한다. `## 색인` 절로 스코프해야 이 수가 백필 행 수를 뜻한다.
  2. `grep -n '^| 문서 | 날짜 | 상태 | 한 줄 |$' .claude/_meta/README.md` → 1건 (헤더행 형식)
  3. `node plugins/mccp/scripts/lib/meta-research.js lint --all --json` → `ok:true` · `exempt[].doc` 집합이 legacy 5종 파일명과 정확히 일치(개수가 아니라 집합 — Task 4 실 repo 회귀와 같은 단언)

> 기존 5문서는 `## Premises` 등 규격 섹션이 없고, 그중 3종은 날짜 접두 파일명도 아니다. **소급 개작하지 않는다**(파일명 변경은 인바운드 링크 6개를 깬다) — `lint --all`이 전수 적용하는 것은 `## 색인` 등재(**L4**) 하나뿐이고, L1/L2/L3는 **템플릿으로 생성된 문서**(헤더에 `**Status**` 필드 보유)에만 적용한다. 이 분기는 lint 출력에 명시된다 — 조용한 면제가 아니다. 근거는 Task 3의 「적용 범위 분기」.

### Task 1: `meta-research.js` — scaffold

- **Action**: `scaffold --topic "<주제>" [--slug <slug>] [--date YYYY-MM-DD] [--json]`.
  - **`repoRoot`는 CLI 표면을 갖지 않는다 — `--repo-root` 플래그는 0건이다 (santa R2 security HIGH 흡수, Codex).** 앞선 판은 test 주입 편의를 위해 `--repo-root <path>`를 열어 뒀는데, 그러면 이후의 모든 봉쇄가 **호출자가 고른 루트에 상대적**이 되어 `metaDir`·README·`assertContained`가 지키는 대상 자체를 인자로 이동시킬 수 있다. 즉 2층 봉쇄가 무의미해지는 경로가 봉쇄 안이 아니라 **CLI 인자에** 있었다.
    - **해소 형태는 저장소에 선례가 있다** — CLAUDE.md §3.13의 `intentDecision`은 "`cli.js parseFlags`가 임의 `--*`를 전달하므로 플래그를 만들면 아무 셸 호출자나 게이트를 우회한다"는 이유로 **프로그래매틱 전용**이고 `--intent-*` 플래그가 0건이다. 여기도 같다: `repoRoot`는 **export된 함수의 매개변수**(test가 주입)이고, **CLI 진입점은 그것을 인자에서 읽지 않고** `process.cwd()`에서 상향 탐색한 git 루트로만 파생한다(선례: `impeccable-detect.js`·`archive-complete/scan.js`).
    - 이 구분이 fixture 능력을 잃지 않는다 — Task 4는 어차피 lib을 `require`해 함수로 호출하므로 주입 경로가 그대로 살아 있고, 셸에서 루트를 바꾸는 경로만 사라진다.
  - 거기서 **`metaDir = path.join(repoRoot, '.claude', '_meta')`**, **README = `path.join(metaDir, 'README.md')`** 로 고정 파생한다. `_meta` 위치와 README 위치를 인자로 열지 않는 것이 봉쇄의 전제다 — 열리면 allowlist와 `assertContained`가 지키는 대상 자체가 호출자 통제가 되어 2층이 동시에 무의미해진다. 앞선 판은 이 셋의 출처를 적지 않아, 봉쇄가 성립하는지를 구현자 재량에 맡기고 있었다.
  - **`_meta/` 부재 시 앵커 이전에 exit 1** (자동 생성하지 않는다). `assertContained`는 `fs.realpathSync(metaDir)`를 먼저 부르므로 미존재 디렉토리에서는 `PATH_ESCAPES_GATE`로 죽는데, 그 메시지는 "디렉토리가 없다"를 뜻하지 않아 원인을 가린다. 자동 생성하지 않는 이유는 Task 0(README 백필) 미완료 상태를 조용히 통과시키지 않기 위해서다.
  - **`--date`도 slug와 같은 강도로 봉쇄한다 (R3 architect HIGH 흡수).** 파일명은 `<date>-<slug>.md`이므로 date 역시 경로 성분이다. `^\d{4}-\d{2}-\d{2}$` 불일치면 write 전 exit 1 — 이 정규식에는 `/`·`\`·`.`가 표현 불가하므로 `--date 2026-08-13/../../etc/passwd` 류가 `path.join` 정규화 이전에 죽는다. 미지정 시 오늘 날짜를 같은 형식으로 생성한다(항상 통과).
  - **slug 도출과 봉쇄 (2중, fail-closed)** — `--slug` 미지정 시 `--topic`을 kebab-case로 정규화하되, 결과가 allowlist `^[a-z0-9][a-z0-9-]{0,63}$`에 **불일치하면 즉시 exit 1**로 `--slug` 명시를 요구한다(한국어 주제는 정규화 결과가 비므로 항상 이 경로). `--slug`가 주어져도 **같은 allowlist로 재검증**한다 — `.`·`/`·`\`·`..`가 문법적으로 표현 불가하므로 traversal이 정규식 단계에서 죽는다.
  - **2중의 두 번째 — 대상 파일이 아니라 `_meta` 디렉토리를 앵커한다.** allowlist 통과 후 `assertContained(metaDir, repoRoot)`로 `_meta/`가 repo 밖으로 symlink되지 않았음을 확인하고, `fs.realpathSync(metaDir)`에 basename만 `path.join`해서 write한다. 정규식은 symlink를 못 보고, realpath 앵커는 정규식이 이미 죽인 `..`를 다시 볼 필요가 없다 — 두 층이 서로 다른 것을 본다.
  - **`assertContained` 호출 규약 2건 (Codex-panel R2 CRITICAL 흡수)**:
    - **3번째 인자 `repoRoot`를 넘기지 않는다.** [path-containment.js:50-66](../../plugins/mccp/scripts/lib/path-containment.js)은 그 인자가 truthy면 `expectedParentDir`가 `<repoRoot>/.claude/receipts` 하위임을 추가로 요구한다. `_meta/`는 receipts 트리가 아니므로 3-arg 호출은 **항상** `gate dir escapes receipts root`로 throw한다. 헤더 주석 L15-18이 "receipts 트리 밖 caller는 `repoRoot`를 생략해야 한다"고 명시한다. 선례는 두 형태로 갈리지만 효과는 같다 — `instruction-contract/lint.js:250`은 인자를 아예 2개만 넘기고, `pr-phase-lock.js:466`·`state/session-spawner.js:82`는 3번째를 **명시적 `null`**로 넘긴다. 판정 기준은 인자 개수가 아니라 truthy 여부이므로(`if (repoRoot)`), 둘 다 receipts-root 검사를 끈다. 이 축은 어느 쪽을 써도 되고, 금지되는 것은 **truthy한 `repoRoot`를 넘기는 것** 하나다.
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
- **Validate**: `scaffold --topic x --slug demo --date 2026-08-13 --json` → 경로 출력 · 재실행 exit 1 · **allowlist 2축 각각** — `--slug ../../etc/x` exit 1 · `--date 2026-08-13/../x` exit 1(둘 다 write 전, `_meta/`에 잔여 파일 없음) · `--topic "한국어 주제"`(slug 미지정) exit 1.
  - R7 test MEDIUM 흡수 — 이전 판은 slug 축만 검사해, 봉쇄 2층 중 나머지가 이 Task 수준에서 미검증으로 남았다.
  - **2층째(`assertContained`)는 이 Validate로 검사하지 않고 Task 4에 위임한다** — symlink된 `_meta/`가 필요해 실 repo 한 줄로는 재현 불가하다. 담당 케이스는 **scaffold 축의 짝 2개** — 「API 규약 회귀 1건」(정상 경로에서 `PATH_ESCAPES_GATE`가 **발생하지 않음**)과 **scaffold 부정 5번째**(symlink된 `_meta/`에서 **발생함**) — 이며, 둘이 짝이라야 그 층의 존재가 증명된다. Task 4의 「symlink escape 부정」은 **L3 참조 검증**이라 이 축이 아니다(R8 security HIGH — 앞선 판이 그 케이스를 여기 끌어다 쓴 것은 과대 주장이었다). 위임을 여기 명시하는 이유는, 적지 않으면 "2중 봉쇄" 주장에 대응하는 검사가 어디에도 없는 것과 구분되지 않기 때문이다.

### Task 2: `meta-research.js` — register (README 색인 등재)

- **Action**: `register --doc <path>`. 색인 행 `| [<파일명>](<파일명>) | <날짜> | <상태> | <주제> |`를 README `## 색인` 표에 append. **대상 README는 Task 1과 동일하게 `path.join(repoRoot, '.claude', '_meta', 'README.md')`로 파생하며 인자로 받지 않는다** (R9 security MEDIUM 흡수 — 위치가 인자면 잘못된 README를 훼손할 수 있고, 어느 파일이 정본인지가 호출자마다 달라진다).
- **메타데이터 출처는 문서 헤더 블록 하나뿐이다 — 추가 인자 없음.** `--doc`을 읽어 Task 1이 고정한 문법으로 파싱한다:

  | 열 | 출처 | 추출 규칙 |
  |---|---|---|
  | 문서 | `--doc`의 basename | 경로가 아니라 파일명. 링크 target도 같은 문자열(README와 같은 디렉토리) |
  | 날짜 | `**Date**: <v>` | 정규식 `^\*\*Date\*\*:[ \t]*(\S+)[ \t]*$` (multiline) |
  | 상태 | `**Status**: <v>` | 정규식 `^\*\*Status\*\*:[ \t]*(.+?)[ \t]*$` |
  | 한 줄 | `**Topic**: <v>` | 정규식 `^\*\*Topic\*\*:[ \t]*(.+?)[ \t]*$` |

  셋 중 **하나라도 부재/빈 값이면 exit 1** (fail-closed — 빈 셀로 색인을 채우지 않는다). 값의 `|`는 `\|`로 escape해 표를 깨뜨리지 않는다.
- **`--doc`도 `_meta/` 안으로 봉쇄한다 (R11 security HIGH 흡수).** README 경로를 인자에서 뺀 것과 같은 이유가 `--doc`에도 그대로 적용된다 — 이 인자가 자유롭다면 `_meta/` 밖 파일의 헤더를 읽어 색인에 등재할 수 있고, 그 행의 링크 target은 basename이므로 **README와 같은 디렉토리에 없는 파일을 가리키는 깨진 링크**가 된다(L4는 색인에 있는지만 보므로 이 어긋남을 잡지 못한다). 앞선 판은 README 축만 닫고 `--doc` 축을 열어 둬 내부적으로 일관되지 않았다. 검사는 Task 3 L3의 3단계와 같은 순서다: lexical screen → `fs.existsSync` → `assertContained(docPath, metaDir)`(2-arg). 불일치면 write 이전 exit 1. 기존 `_meta/` 5종은 `> 상태:` blockquote 등 다른 서두를 쓰며 이 파서는 그 형식을 **읽지 않는다**(다형 파싱 미도입 — Task 0이 손으로 한 번 백필하고 끝이다). 즉 register가 다루는 문서 = scaffold가 만든 문서.
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
- **동시 writer 완화 — lock + 고유 tmp 이름. "봉쇄"가 아니다 (santa R2 HIGH 흡수, Codex).** 앞선 판은 이 절을 "봉쇄"라 불렀는데, 같은 절이 실패 정책을 **fail-open**으로 정하고 있어 제목이 본문을 넘어섰다. 정확한 보증은 아래 「무엇을 보증하는가」다.
  - **무엇을 보증하는가 / 하지 않는가** — lock을 **획득한** 경로에서는 lost update가 발생하지 않는다. lock을 **획득하지 못한** 경로에서는 경고 후 진행하므로 lost update가 **여전히 가능하다**. 즉 이 설계는 경합 창을 좁히고 그 사실을 시끄럽게 알릴 뿐, 제거하지 않는다.
  - **그럼에도 fail-open이 옳은 이유(정책 선택이지 누락이 아니다)** — CLAUDE.md §3.6은 lock 실패 정책을 대상의 성격으로 가른다: evidence write lock은 **감사 corpus**라 fail-closed, `session-ledger`는 아니라 fail-open이다. `_meta/README.md` 색인은 UI1대로 receipt가 아니고 감사 대조 대상도 아닌 **발견 보조물**이므로 후자에 속한다. 여기서 fail-closed로 서면 stale lock 하나가 조사 작업 자체를 멈춘다.
  - **유실이 조용하지 않다는 것이 이 선택의 전제다** — 유실된 행은 다음 `lint --all`에서 그 문서가 `NOT_INDEXED`로 나타나 **자기 검출**된다. 이 자기 검출은 산문이 아니라 L4 검사 자체이며 Task 4의 L4 부정 fixture가 그것을 red로 잡는다.
  - register는 README를 **read-modify-write** 하므로 rename의 원자성만으로는 부족하다. 두 프로세스가 각각 README를 읽고 서로 다른 행을 더한 뒤 차례로 rename하면 **나중 것이 먼저 것의 행을 조용히 지운다**. mccp는 이 문제를 이미 겪었고 해법이 두 축으로 나뉜다 —
  - **lock**: `completion-ledger/store.js#withLedgerLock`([:190-213](../../plugins/mccp/scripts/lib/completion-ledger/store.js)) 형태를 그대로 쓴다 — `<README>.lock` O_EXCL 획득 · 재시도 · stale(mtime 초과) reclaim. 임계구역은 **읽기부터 rename까지 전체**다(읽기만 감싸면 같은 race가 남는다).
  - **tmp 이름은 고유해야 한다**: 같은 파일의 `writeFileAtomic`이 tmp를 `target + '.tmp'` **고정**으로 쓰는데, 이 이름이 고정이면 동시 writer가 tmp 단계에서 충돌한다(CLAUDE.md §3.6이 evidence write lock에 `<target>.<pid>.<rand>.tmp`를 강제하는 것과 같은 이유). register는 `<README>.<pid>.<rand>.tmp`를 쓴다.
  - **실패 정책은 fail-open + loud warn**(선례 동일) — 색인은 감사 corpus가 아니라 발견 보조물이고, 유실은 다음 `lint --all`이 `NOT_INDEXED`로 **자기 검출**한다. lock 미획득에 fail-closed로 서면 조사 작업이 lock 하나로 멈춘다. 다만 경고를 삼키지는 않는다.
- **Mirror**: `markdown-table.js#parseTableRows` / `splitTableRow`로 기존 행 파싱.
- **Validate**: 같은 doc으로 2회 register → 행 1개, 두 번째가 값 갱신 · `**Date**` 삭제한 doc → exit 1.

### Task 3: `meta-research.js` — lint (4검사 fail-closed)

- **Action**: `lint [--doc <path> | --all] [--json]`. 검사:
  - **L1 파일명** — `^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$` (README 제외). **규격 문서에만 적용** (아래 적용 범위 분기).
  - **L2 필수 구성요소 7개, 검사 지점은 9개** — 헤더 블록을 **1개 구성요소**로 세지만 검사는 3키(`**Status**` · `**Date**` · `**Topic**`, Task 1 문법) **각각**에 대해 한다. 하나라도 없으면 그 키 이름을 담은 `MISSING_COMPONENT` 1건(블록 존재 여부만 보면 `**Topic**` 누락 문서가 통과한다 — R5 test MEDIUM 흡수). `##` 섹션 6개(`Premises` · `Evidence` · `Prior Art` · `Precedent` · `Verdict` · `Open Questions`)는 각 1개. Task 1 템플릿이 정확히 이 9개 지점을 전부 채우므로 scaffold 직후 L2는 통과한다(L3는 아래대로 의도적 실패).
  - **L3 전제 명시** — `## Premises` 표 데이터 행 **≥1** · 시점 셀이 형식 검증을 통과 · 참조 셀이 실존 경로.
    - **시점 셀 형식** (Codex-panel R2 MEDIUM 흡수): `^[0-9a-f]{7,40}$`(commit sha) **또는** `^\d{4}-\d{2}-\d{2}$`(ISO date) 둘 중 하나. "비어있지 않음"만 요구하면 `sometime in August` 같은 값이 통과해 UI6("어느 시점 코드를 보고")가 형식적으로만 채워진다. 이 정규식은 값의 **파싱 가능성**만 보증하고 정확성은 보증하지 않는다 — PRD Risk 3의 잔여는 그대로 남으며, 그 이상을 주장하지 않는다.
    - 참조 셀 정규화: 백틱·앞뒤 공백 제거 → **`:<line>` / `:<start>-<end>` suffix를 `String.replace(/:\d+(?:-\d+)?$/, '')`로 제거** → 남은 문자열이 검사 대상 경로. strip이 없으면 `path-containment.js:29` 같은 정상 인용조차 실존 판정에서 false가 되어 L3가 전건 실패한다.
    - 경로 판정 3단계 (순서 고정):
      1. **lexical screen (5축)** — `\0` 포함 · 절대경로 · 드라이브 문자 · UNC · `..` 포함이면 그 자리에서 위반(`REF_OUTSIDE_REPO`). 이 단계가 먼저여야 escape가 "파일 없음"이라는 무해한 사유로 보고되지 않는다(`instruction-contract/lint.js` 헤더의 S3 흡수와 같은 이유). **NUL 축은 그 mirror가 실제로 갖고 있는 검사다** — 빼면 `src/x.js\0../etc` 류가 lexical을 통과해 `existsSync`에서 죽고, 위반 사유가 "경로 없음"으로 잘못 분류된다(R5 security MEDIUM 흡수).
      2. **`fs.existsSync(path.join(repoRoot, ref))`** — 미존재면 위반(`참조 경로 부재`).
      3. **`assertContained(joined, repoRoot)` — 2-arg, `repoRoot`를 3번째로 넘기지 않는다.** 위 Task 1과 같은 이유이며(receipts-root 검사가 켜져 무조건 throw), 존재가 2단계에서 이미 확인됐으므로 `realpathSync`도 안전하다. 이 단계가 잡는 것은 lexical screen이 볼 수 없는 **symlink escape** 하나뿐이다.
  - **L4 색인 1홉** — README `## 색인` 표에 그 파일명 링크 존재. 전수 적용.
  - **적용 범위 분기 — 면제 술어는 하나뿐이다.** **L1·L2·L3는 헤더 블록에 `**Status**` 행이 있는 문서**(= scaffold 산출물)에만 적용하고, **L4만 `_meta/`의 모든 `.md`(README 제외)에 전수 적용**한다. 면제된 문서는 `--json`의 `exempt[]`와 사람 출력 양쪽에 파일명 + 사유(`no-status-header`)를 **명시 출력**한다(조용한 면제 금지).
    - **L1을 전수 적용하면 plan이 자기 Acceptance와 모순된다 (실측).** legacy 5종 중 `converged-redefinition-design.md` · `diverse-agent-review-analysis.md` · `verification-layer-design.md` 3종은 날짜 접두가 없어 L1 정규식에 **불일치**한다(나머지 2종 `2026-08-12-*`는 일치). 전수 적용이면 `lint --all`이 `BAD_FILENAME` 3건으로 영구 red이고, Acceptance의 `ok:true`는 legacy 파일명을 소급 개작해야만(= 인바운드 링크 6개 파손) 달성된다. Task 0 주석이 이미 "소급 개작하지 않는다"고 못박았으므로, 모순을 해소하는 유일한 길은 L1의 적용 범위를 규격 문서로 좁히는 것이다.
    - **좁혀도 보증은 줄지 않는다.** 앞으로 생기는 `_meta/` 문서는 전부 scaffold 산출물(= `**Status**` 보유)이므로 L1은 그 전부를 검사한다. legacy에 대해 L1이 보증하던 것은 애초에 없었다(이미 위반 상태였다). 반면 **L4는 전수로 남으므로 legacy를 포함한 모든 문서가 색인 1홉 도달을 검사받는다** — PRD "발견 가능성" 지표는 무손상이다.
    - 면제 술어를 L1·L2·L3에 공통으로 쓰면 legacy 문서 1건당 `exempt[]` 항목이 정확히 1개가 되어 "`exempt[]` 길이 5"가 문서 수와 1:1로 읽힌다(검사별로 쪼개면 같은 문서가 3번 열거되어 길이 15가 되고, 그 수가 무엇을 세는지 모호해진다).
  - **`--pre-register` — L4만 빼고 L1/L2/L3를 돌리는 모드 (R8 invariant HIGH 흡수).** 등재 *이전*의 문서는 L4를 정의상 만족할 수 없으므로(아직 색인에 없다), 등재 전 형식 검사 수단이 없으면 Task 5 Phase 4는 `register`를 먼저 하고 `lint`를 나중에 할 수밖에 없다. 그 순서에서 lint가 실패하면 **색인에 무효 문서를 가리키는 고아 항목이 남고**, `register`는 원자 치환이라 되돌릴 지점도 없다 — 커맨드가 "형식 미달 산출물을 남기지 않는다"고 주장하는 바로 그 상태다. 이 모드는 그 창을 없애기 위해 존재하며, 그래서 Phase 4 순서가 `lint --pre-register` → `register` → `lint`(전체)로 고정된다.
    - `--pre-register`는 `--doc` 전용이다. `--all`과 동시 지정 시 exit 2 — 전수 스캔에는 "등재 전 문서"라는 개념이 없다.
    - 면제 술어는 **그대로** 적용한다. 등재 전이라는 사실이 규격 검사를 면제하지 않는다.
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
  - **디렉토리 링크는 `tryCreateDirLink` 헬퍼로 만든다 — raw `fs.symlinkSync`가 아니다 (santa R1 흡수: Claude+Codex 양 리뷰어 공통 지적).** 이 파일은 저장소에 이미 두 벌 존재하는 형태를 그대로 복제한다:

    ```js
    // 선례: migrations/tests/path-containment.test.js:33-47
    //       receipt/tests/store-readreceipt-symlink.test.js:27-35
    function tryCreateDirLink(targetDir, linkPath) {
      try {
        if (process.platform === 'win32') fs.symlinkSync(targetDir, linkPath, 'junction');
        else fs.symlinkSync(targetDir, linkPath, 'dir');
        return true;
      } catch (_) { return false; }
    }
    ```

    **왜 이것이 형식 문제가 아니라 증명의 존폐인가** — 앞선 판은 두 symlink 부정 케이스를 raw `fs.symlinkSync` + "`EPERM`이면 loud skip"으로 적었다. 대상 플랫폼이 win32이므로 그 문장은 *두 케이스가 이 환경에서 항상 skip된다*는 뜻으로 읽혔고, 그러면 `assertContained` 두 층은 "발생하지 않음" 쪽 단언만 남아 **호출을 통째로 지워도 전부 green**이 된다. Windows의 **디렉토리 junction은 권한 상승이 필요 없으므로**(NTFS junction ≠ symlink) 이 헬퍼를 쓰면 그 skip 자체가 사라진다.
    - **실측(2026-08-13, 이 워크트리 · win32 Windows 11 Home · node v24.19.0)**: `fs.symlinkSync(outside, link, 'junction')` **성공** · `fs.realpathSync(link)`가 repoRoot 밖으로 해석됨 확인. 따라서 아래 두 케이스는 이 플랫폼에서 **실행된다** — 스킵을 전제로 Acceptance를 낮출 이유가 없다.
    - **두 컨테인먼트 fixture는 skip하지 않는다 — 링크 생성 실패는 red다 (santa R2 HIGH 흡수, Codex).** 선례 2벌은 `if (!linked) t.skip(...)` 형태인데, 그 형태를 그대로 베끼면 *심각도만 낮춘 F1*이 된다: 헬퍼가 `false`를 반환하는 순간 두 층의 "발생함" 단언이 사라지고 `assertContained` 호출을 지워도 green이 된다. 그래서 이 두 케이스는

      ```js
      assert.ok(tryCreateDirLink(outsideDir, linkPath),
        'directory link must be creatable (win32=junction, POSIX=dir) — ' +
        'the containment proof may not be skipped');
      ```

      로 단언한다. **선례에서 skip이 정당했던 이유가 여기엔 없다** — 선례는 파일 symlink(권한 상승 필요)를 포함한 일반 헬퍼이고, 이 두 케이스는 **디렉토리 링크 전용**이라 win32에서 junction으로, POSIX에서 dir symlink로 각각 권한 없이 만들어진다. 만들어지지 않는 환경은 "이 플랫폼은 원래 그래"가 아니라 조사가 필요한 상태이므로 red가 정답이다.
    - **이 단언이 곧 실측의 실행 가능한 형태다 (Codex 제안 흡수).** 위 실측은 산문이고 산문은 회귀하지 않는다. `assert.ok(...)`로 바꾸면 같은 사실이 **매 실행 검증**되며, junction이 안 되는 환경으로 옮겨가면 조용한 커버리지 상실이 아니라 red로 드러난다.
  - **T0 왕복(핵심)** — 이 케이스가 PRD "절차 재현성" 지표의 유일한 기계 증거다.
    **전제**: fixture는 tmp repo(`git init` 불필요, `repoRoot`는 주입)에 셋을 만든다 —
    (a) `_meta/` 디렉토리,
    (b) Task 2가 고정한 **`## 색인` + `| 문서 | 날짜 | 상태 | 한 줄 |` 헤더행 + separator**를 담은 README.md(데이터 행 0). 그 절이 없으면 Task 2가 exit 1이라 3단계에서 왕복이 끊긴다,
    (c) **참조 대상 더미 파일 `src/target.js`** — 2단계가 Premises에 넣을 행은 정확히 `| 1 | src/target.js | 2026-08-13 | fixture |`다(줄 번호 suffix 없는 형태; suffix 있는 형태는 아래 긍정 fixture가 따로 덮는다). 참조 대상을 명시하지 않으면 L3가 2단계에서 먼저 실패해 L4(3단계)에 도달하지 못하고, 왕복 증명이 성립하지 않는다.
    1. `scaffold` → 산출 파일 존재 · `lint --doc`이 **L3로 red**(Premises 0행) · L2는 green
    2. Premises에 실존 경로 1행 추가 → `lint --doc`이 여전히 **L4로 red**(미등재)
    3. `register --doc` → `lint --doc` **exit 0**
    4. 문서의 `**Status**`를 `active` → `superseded`로 바꾼 뒤 `register --doc` 재실행 → 색인 행 수 불변(1) **그리고 그 행의 상태 셀이 `superseded`로 갱신**(R9 test MEDIUM 흡수 — 행 수만 보면 헤더를 다시 읽지 않고 옛 값을 그대로 쓰는 구현도 통과한다. 값 갱신이 idempotent의 실질이다)
  - **커맨드 골격 계약 lint 1건 (R5 test HIGH 흡수 · R8 invariant HIGH로 순서 축 추가)** — PRD "절차 재현성" 지표는 *lib 왕복*이 아니라 **커맨드가 조사 골격을 구성함**을 요구한다. T0는 lib만 증명하므로 그 지표를 덮지 못한다. `commands/meta-research.md`를 읽어 **Phase 0~4 heading 5개가 정의된 순서대로 존재**하고, **Phase 4 블록이 `lint --doc --pre-register` → `register --doc` → 전체 `lint --doc`을 그 순서로 호출**함을 정적 단언한다. 골격이 빠지거나 순서가 뒤집히면 red — 특히 `register`가 `--pre-register` 검사보다 앞서면 고아 색인 항목의 창이 다시 열리므로, 존재만이 아니라 **등장 index 오름차순**을 단언한다.
    - **이 test가 증명하는 것과 못 하는 것**: Phase 1~3의 실제 조사는 LLM 작업이라 단위 test로 강제 불가하다. 이 단언은 **골격의 존재와 순서**만 증명하며, 조사 품질은 PRD Risk 1이 이미 강제 불가로 인정한 축이다. 그 이상을 주장하지 않는다.
  - **부정 fixture (총 27, 전부 `code` 단언)**:
    - **scaffold 6** — `--slug ../../x` · `--date 2026-08-13/../x` · 한국어 `--topic` + slug 미지정 · 덮어쓰기 · **`_meta/` 디렉토리 부재 → 명시 사유로 exit 1**(R10 test 흡수 — 자동 생성하지 않는다는 계약에 대응하는 부정 케이스가 없으면 그 계약이 미검증이다) · **링크된 `_meta/` — win32=junction / POSIX=dir symlink (R8 security HIGH 흡수)**. 마지막 건은 tmp repo의 `_meta/`를 repo 밖 디렉토리로 링크해 두고 `scaffold`가 `PATH_ESCAPES_GATE`로 **거부**하는지 단언한다. 앞선 판은 이 층에 대해 "발생하지 않음"(아래 API 규약 회귀)만 갖고 있었고, 「symlink escape 부정」은 **L3 참조 검증** 케이스라 scaffold의 디렉토리 앵커를 덮지 못한다 — 즉 scaffold의 `assertContained` 호출을 통째로 지워도 test가 전부 green이었다. 두 층은 대상이 다르므로 부정 케이스도 **각각** 필요하다. 링크 생성은 위 `tryCreateDirLink`(win32=junction)를 쓰고 그 성공을 `assert.ok`로 단언한다 — **skip 분기 없음**
    - register 3 — `**Date**` 부재 · `## 색인` 절 부재 · **`--doc`가 `_meta/` 밖 경로 → exit 1**(R11 security HIGH 흡수, 등재 이전에 죽는지)
    - **L1 1 — `BAD_FILENAME`.** fixture 문서는 **`**Status**` 헤더를 가진** 채로 파일명만 규격 위반이어야 한다. 헤더 없는 문서를 쓰면 면제 술어에 걸려 L1이 아예 안 돌고, test는 "위반 없음"을 통과로 읽어 **L1 구현이 통째로 비어 있어도 green**이 된다
    - **L2 9 — 검사 지점별 1건.** 헤더 3키 각각 삭제 3 + `##` 섹션 6개 각각 삭제 6. "`## Verdict` 하나만 지워 본다"로는 L2가 일부만 검사하는 구현 결함을 못 잡고, 헤더를 블록 단위로만 지워 보면 `**Topic**` 단독 누락을 놓친다(R4·R5 test MEDIUM 흡수)
    - **L3 7 — lexical 5축 각각 1건씩** (R6 architect MEDIUM 흡수 — 드라이브와 UNC를 한 건으로 묶으면 두 공격 벡터 중 하나가 미검증으로 남는다). lexical 5: `..` → `REF_OUTSIDE_REPO`(순서 회귀 — `REF_NOT_FOUND`로 오면 실패) · 절대경로 · **드라이브 문자 단독** · **UNC 단독** · `\0` 포함 → 전부 `REF_OUTSIDE_REPO`. existsSync 1: 미존재 → `REF_NOT_FOUND`. 시점 1: `sometime in August` → `BAD_TIMESTAMP`
    - L4 1 — `NOT_INDEXED`
  - **긍정 fixture 3** — 평범한 repo-relative 참조 1행이 L3를 통과 · 참조 셀 `<path>:98-102`(범위 suffix)가 strip 후 실존 판정(정규식 회귀) · **백틱으로 감싼 참조 셀이 strip 후 통과**(Task 3의 정규화 1단계 — 감싸는 백틱을 안 벗기면 정상 인용이 전건 `REF_NOT_FOUND`가 된다, R6 test MEDIUM 흡수).
  - **API 규약 회귀 1건** — scaffold를 실 `_meta/` 구조를 흉내낸 tmp에서 돌려 `PATH_ESCAPES_GATE`가 **발생하지 않음**을 단언한다. 3-arg `assertContained` 또는 미생성 파일 앵커로 되돌리면 red가 된다(R2 CRITICAL 회귀 잠금).
  - **symlink escape 부정 1건 — L3 참조 축 (R6 architect HIGH 흡수)** — 지금까지 `assertContained`는 "발생하지 않음"만 단언했다. 그 층이 존재한다고 주장하는 유일한 위협(lexical screen이 못 보는 symlink escape)에 대해 **발생함**을 단언하는 케이스가 없으면, 호출을 통째로 지워도 test는 전부 green이다. tmp fixture에서 repo 밖을 가리키는 링크를 만들고 그 경유 **Premises 참조**가 `REF_OUTSIDE_REPO`로 보고되는지 확인한다.
    - **탈출 경로는 파일 symlink가 아니라 `tryCreateDirLink`로 만든 디렉토리 링크를 경유한다.** repo 안에 `_meta/outside → <repo 밖 디렉토리>` 링크를 만들고, Premises 참조 셀을 그 링크 **하위 파일**(예 `.claude/_meta/outside/target.js`)로 둔다. 이 경로는 lexical screen 5축을 전부 통과하고(절대경로·드라이브·UNC·`..`·NUL 없음) `existsSync`도 true이므로, 3단계 `assertContained`만이 잡을 수 있는 **정확히 그 위협**이 된다. 파일 symlink는 Windows에서 개발자 모드를 요구할 수 있지만 디렉토리 junction은 요구하지 않으므로, 이 형태라야 win32에서 실행된다.
    - 링크 생성은 `assert.ok`로 단언한다 — **skip 분기 없음**(위 Action의 「skip하지 않는다」 참조). (scaffold의 디렉토리 앵커는 **다른 층**이며 위 scaffold 부정 5번째가 담당한다.)
  - **실 repo 회귀 1건 (R4 test MEDIUM 흡수 · R8 test HIGH로 동일성 축 추가)** — tmp fixture만으로는 실제 `_meta/`의 인코딩·legacy markdown 변형에 대한 동작을 증명하지 못하고, Validation §3 스모크는 수동이라 이후 파일이 바뀌어도 안 잡힌다. 그래서 test 안에서 **실 repo root를 `repoRoot`로 주입해 `lint --all`을 돌리고 `ok:true`를 단언**한다(읽기 전용, 쓰기 없음).
    - **선행조건은 Task 0이다 (santa R1 흡수).** `## 색인` 백필 이전에는 legacy 5종이 전부 `NOT_INDEXED`라 이 단언이 red이고, 그 red는 lib 결함이 아니라 순서 위반이다. Validation §3이 같은 의존을 `grep -q '^## 색인$' … || SKIP`으로 표면화하듯, 이 test도 `## 색인` 절 부재를 감지하면 **loud skip**한다(조용한 green도, 오독되는 red도 만들지 않는다).
    - **면제 집합은 개수가 아니라 파일명 집합으로 단언한다.** `exempt[]` 길이 5만 보면 legacy 1종이 사라지고 규격 미달 신규 문서 1종이 들어와도 수가 5로 유지되어 **엉뚱한 문서가 면제된 채 green**이 된다. 단언 대상은 `exempt[].doc`의 정렬된 집합이 정확히 `{converged-redefinition-design.md, diverse-agent-review-analysis.md, verification-layer-design.md, 2026-08-12-prd-decomposition-addendum.md, 2026-08-12-review-loop-meta-analysis.md}`와 같다는 것이다. 이 5종은 PRD Evidence가 이름으로 열거한 바로 그 집합이고, 늘어나야 할 이유가 없다(신규 문서는 전부 scaffold 산출물 = 면제 대상 아님). 집합이 달라지면 red가 정답이다 — 그때 필요한 것은 단언 완화가 아니라 사람의 확인이다.
  - **동시 register 회귀 1건 (R10 invariant CRITICAL 흡수)** — tmp fixture에서 register를 **두 문서에 대해 교차 실행**하되, 두 번째 호출을 첫 번째의 임계구역 안에서 일어나게 모사한다(lock 파일을 미리 생성해 두고 재시도·stale reclaim 경로를 태우는 형태로 충분하다 — 실제 병렬 프로세스는 test에서 불안정하다). 단언은 **최종 README에 두 행이 모두 존재**함이다. lock을 지우거나 tmp 이름을 고정으로 되돌리면 한 행이 사라져 red가 된다.
  - **면제 1건** — `**Status**` 없는 legacy 형식 문서가 L1·L2·L3 면제 + `exempt[]`에 **열거**되는지(조용한 면제 회귀). fixture 파일명은 **날짜 접두가 없는 형태**(실 repo의 `verification-layer-design.md`를 모사)로 둔다 — 그래야 L1 면제까지 한 케이스로 덮이고, 면제 술어가 L1에 배선되지 않은 구현이 red로 잡힌다. 같은 문서가 검사별로 3번 열거되지 않고 **정확히 1개 항목**으로 나오는지도 함께 단언한다(`exempt[]` 길이가 문서 수를 뜻한다는 계약).
- **Mirror**: `archive-complete/tests/scan.test.js`의 tmp fixture 구성.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/meta-research.test.js`.

### Task 5: 커맨드 본문 `meta-research.md`

- **Action**: 5 phase 고정 (UI10).
  - **Phase 0 SCAFFOLD** — 주제/slug 확정 후 `scaffold` 호출. 산출 경로 확보.
    - **선행 preflight (R8 invariant MEDIUM 흡수)**: `scaffold` 이전에 README의 `## 색인` 절 존재를 확인하고 없으면 그 자리에서 실패한다(Task 0 미완료 안내 포함). 없는 채로 진행해도 Phase 4의 `register` preflight가 결국 막지만, 그때는 이미 문서를 만들고 사용자가 Phase 1~3에 시간을 쓴 뒤다. 같은 fail-closed를 **가장 싼 시점**으로 옮기는 것이며, 새 게이트를 추가하는 것이 아니다.
  - **Phase 1 EVIDENCE** — 저장소 코드 근거 수집. **각 근거는 `path:line` + 확인 시점(현재 HEAD sha)을 Premises 표에 즉시 기록**(UI6).
  - **Phase 2 PRIOR ART** — 외부 문헌. 자동화하지 않음 — 사용자가 `/deep-research` 등으로 얻은 결과를 붙여넣으면 배치, 없으면 "미조사"로 명시(UI4).
  - **Phase 3 PRECEDENT** — `.claude/_meta/` 기존 산출물 · `docs/` · `.claude/prds/`와 대조. 선행 문서의 전제가 무효화됐는지 확인하고 무효 발견 시 그 문서의 `**Status**`를 갱신 제안.
  - **Phase 4 VERDICT + REGISTER** — 판정 기록 → `lint --doc --pre-register` → `register` → `lint --doc`(전체). **셋 중 하나라도 실패하면 커맨드는 실패로 끝난다.**
    - **stop-at-first-failure를 본문에 명시한다 (santa R1 test MEDIUM 흡수 — Codex).** 세 호출은 **순차**이며 각 호출의 exit code를 확인해 **0이 아니면 즉시 중단하고 뒤 단계를 실행하지 않는다**. 지금까지 이 성질은 순서 서술에서 *유추*될 뿐이었는데, 유추로 두면 구현자가 세 호출을 모두 돌린 뒤 마지막 결과만 보는 형태를 써도 본문에 위배되지 않는다 — 그 형태는 `lint --pre-register` 실패에도 `register`가 실행되어 고아 색인 항목이라는 **이 순서가 없애려던 상태를 정확히 되살린다**. 실패 시 출력은 미충족 `code` + 문서 경로이며, 그 뒤 단계는 실행되지 않았음을 함께 알린다.
    - **순서가 계약이다 (R8 invariant HIGH ×2 흡수).** `register`가 먼저면 lint 실패 시 색인에 무효 문서를 가리키는 고아 항목이 남는다. 등재 전 검사를 앞에 두면 **`register`에 도달한 문서는 이미 L1/L2/L3 green**이므로 고아 창이 존재하지 않는다. 마지막 전체 lint는 L4까지 닫혔음을 확인하는 read-only 확인이다.
    - **실패 시 남는 것 — rollback이 필요 없는 이유.** 조사 문서 파일은 **남긴다**(사용자의 조사 내용이므로 지우면 작업이 소실된다). 색인은 **건드리지 않는다**. 즉 "형식 미달 산출물을 남기지 않는다"의 정확한 의미는 *색인에 등재하지 않는다*이며, 되돌릴 write를 애초에 하지 않으므로 rollback 기구가 없는 것이 결함이 아니다. 실패 메시지는 미충족 `code`와 문서 경로를 출력해 사람이 고쳐 재실행하게 한다(재실행은 idempotent — Task 2).
  - 종료 출력: 산출물 경로 + `/mccp:plan-prd` 핸드오프 한 줄(DD5). PRD 자동 생성 안 함(UI5).
- **Mirror**: `archive-complete.md`의 frontmatter + Phase 절 구조.
- **Validate**: Task 4의 커맨드 골격 계약 lint — `commands/meta-research.md`를 문자열로 읽어 `^## Phase [0-4] — ` heading 5개를 정규식으로 뽑고 (a) 5개 전부 존재 (b) 등장 index가 0~4 오름차순 (c) Phase 4 heading부터 다음 `^## ` 또는 EOF까지의 구간에서 `lint --doc --pre-register` · `register --doc` · 전체 `lint --doc` 세 호출이 **그 순서로** 등장함을 단언한다(존재만이 아니라 등장 index 오름차순 — 순서가 고아 창을 없애는 유일한 장치이므로 순서를 안 보면 계약을 안 보는 것이다). `ls` + frontmatter 파싱만으로는 골격 누락을 못 잡는다.

### Task 6: 릴리스 동기

- **Action**: `plugin.json` 1.24.0 · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · `CHANGELOG.md` · `CLAUDE.md` §4 한 줄 · PRD M1 status.
- **Action(2) — `aliases.js` 등재 (DD8)**: `ALIAS_MATRIX`에 `'mccp:meta-research': { produces: [], requires_preceding: [], design_optional: [] }`를 `plan-prd` 항목과 같은 형태로 추가하고, 그 자리에 *왜 빈 spec인지*를 `plan-prd` 주석과 같은 톤으로 한 줄 남긴다. `aliases.test.js`에 등재 회귀 1건 추가 — `getCommandSpec('/mccp:meta-research')`가 truthy이고 `produces`·`requires_preceding`이 **각각 빈 배열**임을 `deepStrictEqual`로 단언한다(UI1이 기계적으로 고정된다 — 나중에 누가 이 커맨드에 게이트를 실으면 red).
- **Validate**: `git grep -n "1\.23\.7" -- plugins/mccp | grep -v CHANGELOG` 가 비어야 한다. `renderer/tests/i18n-surface.test.js`가 plugin.json 파생인지 확인(M4에서 통합됨) — 하드코딩이면 함께 수정. `node --test plugins/mccp/scripts/receipt/tests/aliases.test.js` green.

## Validation

```bash
# 1. 단위 — T0 왕복 + 커맨드 골격 계약 + 부정 27 + 긍정 3 + 회귀 4 + 면제
node --test plugins/mccp/scripts/lib/tests/meta-research.test.js

# 2. 실 repo 전수 lint — legacy 5종은 exempt[]로 열거되어야 하고, 조용히 빠지면 안 된다
node plugins/mccp/scripts/lib/meta-research.js lint --all --json

# 3. 실 repo 왕복 스모크 — T0의 4단계를 실제 _meta/ + README에 대해 그대로 재현한다.
#    (T0는 tmp fixture에서 돌므로, 이 스모크만이 실 repo 배선을 증명한다)
#    PRECONDITION: Task 0이 먼저 완료돼야 한다 — README에 `## 색인` 표가 없으면
#    step3의 register가 exit 1이고, 실패 원인이 lib 결함으로 오독된다.
grep -q '^## 색인$' .claude/_meta/README.md || { echo "SKIP: Task 0 미완료 (## 색인 부재)"; exit 1; }
M=plugins/mccp/scripts/lib/meta-research.js
# 스냅샷 — 정리는 git이 아니라 이 사본에서 복원한다 (R7 test HIGH 흡수).
#   `git checkout -- README.md`는 스모크가 추가한 행뿐 아니라 Task 0의 **미커밋 백필까지**
#   HEAD로 되돌린다. 그 결과 (a) 정리 직후 `lint --all`이 legacy 5종 NOT_INDEXED로 red가 되어
#   Acceptance 항목들 사이에 실행 순서 의존이 생기고, (b) "git status 빈 출력" 단언이 Task 0
#   성공 여부와 무관하게 통과한다(false positive). 사본 복원은 커밋 여부와 독립적으로 정확하다.
#   저장 위치는 워킹트리 밖(`git rev-parse --git-path`)이라 `git status .claude/_meta/`를 오염시키지 않는다.
SNAP="$(git rev-parse --git-path mccp/tmp)"; mkdir -p "$SNAP"
cp .claude/_meta/README.md "$SNAP/README.pre-smoke"
ROWS_BEFORE=$(sed -n '/^## 색인$/,/^## /p' .claude/_meta/README.md | grep -c '^| \[')
node $M scaffold --topic smoke --slug lint-smoke --date 2026-08-13
node $M lint --doc .claude/_meta/2026-08-13-lint-smoke.md --json | grep -q PREMISES_EMPTY; echo "step1 L3 red: $?"
# Premises에 실존 참조 1행 삽입 (참조=이 lib 자신, 시점=오늘)
node -e 'const f=".claude/_meta/2026-08-13-lint-smoke.md",fs=require("fs");fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/(\|---\|---\|---\|---\|\n)/,"$1| 1 | plugins/mccp/scripts/lib/meta-research.js:1 | 2026-08-13 | smoke |\n"))'
node $M lint --doc .claude/_meta/2026-08-13-lint-smoke.md --json | grep -q NOT_INDEXED; echo "step2 L4 red: $?"
node $M register --doc .claude/_meta/2026-08-13-lint-smoke.md
node $M lint --doc .claude/_meta/2026-08-13-lint-smoke.md; echo "step3 expect 0: $?"
# step4 — idempotency를 **실 repo에서** 확인한다 (R7 test MEDIUM 흡수).
#   T0는 tmp fixture(색인 표만 있는 최소 README)에서만 증명한다. 기존 서술 + 주제별 표가
#   함께 있는 실제 README에서 register가 append가 아니라 갱신으로 동작하는지는 여기서만 드러난다.
ROWS_1=$(sed -n '/^## 색인$/,/^## /p' .claude/_meta/README.md | grep -c '^| \[')
node $M register --doc .claude/_meta/2026-08-13-lint-smoke.md
ROWS_2=$(sed -n '/^## 색인$/,/^## /p' .claude/_meta/README.md | grep -c '^| \[')
[ "$ROWS_1" = "$ROWS_2" ]; echo "step4 idempotent (rows $ROWS_1 == $ROWS_2): $?"
# CLEANUP — 무조건 실행(&&가 아니라 ;). 앞 단계가 죽어도 _meta/ 오염을 남기지 않는다.
cp "$SNAP/README.pre-smoke" .claude/_meta/README.md; rm -f .claude/_meta/2026-08-13-lint-smoke.md
# 정리 검증 3단 — 셋 다 Task 0의 커밋 여부와 **무관하게** 성립해야 한다.
cmp -s "$SNAP/README.pre-smoke" .claude/_meta/README.md; echo "cleanup byte-identical: $?"
ROWS_AFTER=$(sed -n '/^## 색인$/,/^## /p' .claude/_meta/README.md | grep -c '^| \[')
[ "$ROWS_AFTER" = "$ROWS_BEFORE" ]; echo "cleanup rows preserved ($ROWS_BEFORE): $?"
# 잔여 산출물 없음. `??` 행이 있으면 정리 실패다. "빈 출력"은 요구하지 않는다 —
# Task 0이 미커밋이면 ` M README.md`가 정상이고, 그것까지 금지하면 단언에 커밋 여부가 섞인다.
git status --porcelain .claude/_meta/ | grep '^??' && echo "CLEANUP FAILED (untracked leftover)" || echo "no untracked leftover"
rm -f "$SNAP/README.pre-smoke"

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

- [ ] `node --test plugins/mccp/scripts/lib/tests/meta-research.test.js` green (T0 왕복 + 커맨드 골격 계약 1 + 부정 27 + 긍정 3 + API 규약 회귀 1 + symlink escape 부정 1(L3 참조 축) + 동시 register 회귀 1 + 실 repo 회귀 1 + 면제 1)
- [ ] **고아 색인 항목이 발생할 수 없는 순서로 고정** — Phase 4가 `lint --pre-register` → `register` → `lint`(전체)이고, 커맨드 골격 계약 test가 그 **등장 순서**를 단언한다. `register`를 앞으로 되돌리면 red. **"구조적으로 불가능"이라고는 주장하지 않는다** (R9 architect MEDIUM 흡수) — 강제 수단은 커맨드 본문에 대한 정적 계약 test이지 타입/API 수준 불변식이 아니며, 커맨드 본문을 벗어나 lib을 직접 호출하는 경로는 이 순서를 강제받지 않는다
- [ ] scaffold의 `assertContained` 층이 **짝으로** 검증 — 정상 경로에서 미발화(API 규약 회귀) + 링크된 `_meta/`에서 발화(scaffold 부정 5번째). 한쪽만 있으면 호출을 지워도 green이 된다. **두 케이스 모두 win32에서 실행된다** — 링크는 `tryCreateDirLink`(win32=junction, 권한 상승 불요)로 만들고 그 성공을 `assert.ok`로 단언한다. **skip 분기가 없다** — 링크 생성 실패는 skip이 아니라 red이므로, "실행된다"가 산문이 아니라 suite가 강제하는 조건이다
- [ ] Validation §3 정리가 3단 전부 통과 — README가 스모크 직전과 **byte-identical** · `## 색인` 행 수가 스모크 전과 동일 · `git status --porcelain .claude/_meta/`에 `??` 행 없음. **"빈 출력"을 요구하지 않는다**: 그 형태는 Task 0이 커밋됐을 때만 성립하므로 Task 0 성공 여부를 구분하지 못하고, 정리에 `git checkout`을 쓰면 Task 0의 미커밋 백필까지 지워져 어느 쪽이든 통과한다(R7 test HIGH)
- [ ] `lint --all --json` → `ok:true` · `exempt[].doc` 집합이 legacy **5종 파일명과 정확히 일치**(개수만 세면 1종이 빠지고 다른 문서가 들어와도 통과한다 — R8 test HIGH). **Validation §3 정리 이후에 실행해도 같은 결과**여야 한다 — 스모크가 Task 0의 백필을 건드리지 않았다는 증거다
- [ ] Validation §3 실 repo 왕복 스모크가 step1 red → step2 red → step3 exit 0 → **step4 idempotent(행 수 불변)** 으로 통과
- [ ] T0 왕복이 test로 존재 — scaffold 직후 L3 red → Premises 채움 → register → exit 0 (절차 재현성 지표)
- [ ] scaffold의 **`--slug`와 `--date` 양쪽** allowlist가 불일치 시 write 전에 exit 1 (Task 1 Validate) · 2층째 `assertContained`는 Task 4의 「API 규약 회귀」 + 「symlink escape 부정」 두 케이스가 짝으로 증명
- [ ] 템플릿 생성 문서의 `## Premises` 참조 경로 실존 100% (primary 지표 — L3가 기계 검증). **L3 3단계가 전부 실행됨을 포함한다** — lexical screen(부정 5)·`existsSync`(부정 1)·`assertContained` realpath(symlink escape 부정 1)이며, 마지막 건은 디렉토리 junction 경유 + `assert.ok` 단언이라 **skip 분기 자체가 없다**. 이 항목은 플랫폼 단서를 달지 않는다 — 단서가 필요했던 원인(raw `fs.symlinkSync` EPERM)이 헬퍼 교체로 제거됐고, 남아 있던 skip 경로도 red로 바뀌었기 때문이다
- [ ] **register 동시성은 "봉쇄"가 아니라 "완화"로 기재** — lock 획득 경로에서만 lost update가 없고 미획득 경로에서는 여전히 가능하다는 사실이 Task 2에 명시되며, 유실은 `lint --all`의 `NOT_INDEXED`가 자기 검출한다(그 검출 자체는 L4 부정 fixture가 red로 잡는다). 이 항목은 fail-closed를 요구하지 않는다 — 색인은 감사 corpus가 아니므로 CLAUDE.md §3.6의 fail-open 쪽에 속한다
- [ ] `_meta/` 전 산출물이 README 색인에서 1홉 도달 (발견 가능성 지표 — L4가 기계 검증)
- [ ] `GATE_IDS` 무변경 (UI1)
- [ ] `aliases.js`에 `mccp:meta-research`가 **빈 spec**으로 등재되고 회귀 test가 `produces`·`requires_preceding` 양쪽의 **빈 배열**을 단언 (DD8) — 등재 사실만 단언하면 나중에 게이트가 실려도 green이므로, UI1을 지키는 것은 등재가 아니라 *빈 배열* 단언 쪽이다
- [ ] version 5면 동기 + PRD M1 status 갱신

## Design Critique

- 트리거: `impeccable-detect.js` `design_signal=true` (signal_files: `renderer/html.js` · `renderer/markdown.js` · `impeccable-detect.js` · `skills/frontend-design-direction/SKILL.md` — 앞 둘만 실제 변경 대상(§3.7 version 5면 동기)이고, 뒤 둘은 plan 본문이 그 경로를 **인용**한 데 따른 매칭이다)
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료
- 라운드: 1 (R0) · cap=2 · verdict **CONVERGED** — L2 패널 R1~R6(2026-08-13, 최종 R6 8 findings) 흡수 후 재판정에서도 동일
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
