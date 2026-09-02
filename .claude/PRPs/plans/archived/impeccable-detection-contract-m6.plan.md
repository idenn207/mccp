# Plan: impeccable 탐지 계약 M6 — 이연 정리와 질문 종결

**Source PRD**: .claude/prds/impeccable-detection-contract.prd.md
**Selected Milestone**: 6 — 이연 정리와 질문 종결
**Complexity**: Medium

## Summary

M1~M5는 탐지·판정·이름·발화·문서를 고쳤고, 그 과정에서 **자기 축의** 이연 항목을 backlog에 쌓았다.
M6은 그중 이 PRD가 소유한 것만 닫는다 — M4가 남긴 receipt 입력 경로 2건과 **증명 가능하게 죽은**
분기 1건, M5가 자기 코드에 남긴 결함 4건, impeccable 축 문서 드리프트 1건, 그리고 state·릴리스 정합.
더불어 PRD가 연 채로 둔 질문 3건을 **측정**으로 답한다.

새 능력은 없다. 게이트가 발화하는 대상도, 판정 결과도 바뀌지 않는다 — 바뀌는 것은 **잘못된 입력을
거부하는 자리**와 **거짓으로 적혀 있던 주장**뿐이다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | backlog과 fix-task 및 추가 분석된 수정사항을 적용하는 마일스톤을 추가한다 | direction |
| UI2 | 마일스톤은 하나만 추가한다 | constraint |
| UI3 | 이 PRD가 소유한 축만 담는다 — sibling PRD env-contract-integrity가 소유를 주장하는 항목은 제외한다 | exclusion |
| UI4 | 비-impeccable EVIDENCE_DEBT 29건 상환은 하지 않는다 | exclusion |
| UI5 | docs 소비처 행과 registry evidence를 대조하는 신규 lint는 넣지 않는다 | exclusion |
| UI6 | MCCP_GATE_ROUND_CAP 문서와 설정의 불일치는 건드리지 않는다 | exclusion |
| UI7 | PRD Open Questions 3건을 측정으로 닫는다 | direction |

## Design Decisions

### DD1 — 이 milestone의 판별 기준은 "누가 그 코드를 썼는가"다

backlog은 이연 항목마다 소유 축을 적어 두었고, 그중 다섯은 `env-contract` 또는
`environment-doc-uniformity`를 가리킨다. 그러나 그 태그는 **파일이 사는 디렉토리**를 뜻하지
집필자를 뜻하지 않는다. `evidence-debt.js` · `measure-evidence.js` · `evidence-name.js` ·
L10은 **M5가 이번 브랜치에서 만든 파일**이고, 그 안에 남은 결함은 다른 축의 부채가 아니라
이 축이 자기 코드에 남긴 것이다. 그래서 M6에 들어온다.

반대로 `EVIDENCE_DEBT` 29건 · L11(docs↔registry 대조) · `MCCP_GATE_ROUND_CAP` 불일치는
**다른 축이 쓴 코드와 문서**를 만져야 한다. `env-contract-integrity` PRD가 milestone 6개를
전부 `pending`으로 들고 있고 그 M1(계약 대조 + 설정 진단) · M3(라운드 캡 기계 강제) ·
M4(문서 생성 자동화 + 착지 게이트)가 정면으로 겹친다. 두 브랜치가 같은 파일을 각자 고치면
§3.5.1이 경계하는 머지 사고의 조건이 그대로 갖춰진다. 그래서 들어오지 않는다(UI3~UI6).

### DD2 — fix-task는 별도 태스크가 아니라 이 milestone 전체다

`.claude/state/fix-task-applied.md`가 요구하는 것은 "Codex divergent — 미해소 지적을 다뤄라"다.
M5의 Codex R1 HIGH 2건은 그 사이클에서 전건 흡수됐고, 남은 것은 §3.14대로 backlog로 이연된
MEDIUM 2건(`measure-evidence` 창/매처 중복 · 래칫 단방향)이다. 두 건 모두 아래 T5·T4다.
즉 **M6을 완주하는 것이 fix-task를 적용하는 것**이고, 별도의 "fix-task 처리" 태스크를 두면
같은 일을 두 번 세게 된다. 남는 것은 state 아티팩트의 정합뿐이라 T10이 그것만 맡는다.

### DD3 — 죽은 분기는 되살리지 않고 지운다

`plugins/mccp/commands/prp-implement.md`의 `isSurface`가 `.claude/cache/` 아래 `STATUS.md`·`status.html`을 표면으로
인정하지만, 파일 집합이 `git diff --name-only HEAD` ∪ `git ls-files --others --exclude-standard`라
`.gitignore:131`의 `.claude/cache/`가 그 경로를 양쪽 모두에서 배제한다. 실측으로 봉인된다:
`git ls-files .claude/cache/`는 빈 출력이고 `git check-ignore -v`는 두 경로 모두 `:131`을
지목한다. 이 분기는 **어떤 입력으로도 참이 될 수 없다.**

되살리는 선택지를 검토하고 기각했다. (a) `fs.existsSync`로 두 파일을 직접 보면 대시보드를
렌더한 적 있는 모든 저장소에서 `renderingSurface`가 **항상 1**이 된다 — 렌더러를 건드리지
않은 사이클에서도 디자인 라우팅이 발화한다. (b) 진짜 신호는 렌더러 **소스**
(`plugins/mccp/scripts/lib/renderer/*.js`)이지만 그것은 `.js`라 `ui` 정규식에 걸리지 않으므로,
넣으려면 표면 정의 자체를 바꿔야 한다 — M4가 정합화한 발화 대상을 이 milestone이 넓히는 것이고
그 변경은 자기 증거를 따로 갖춰야 한다. 그래서 M6은 **지우고, 남는 공백을 적는다**:
오늘 대시보드 작업은 `renderingSurface=0`이며 그것이 정직한 현재 상태다.

### DD4 — 래칫의 증가 방향은 막을 수 없고, 보이게 만들 수는 있다

`evidence-debt.js` 헤더와 `docs/gate-design.md:1216`이 "래칫은 줄어들기만 한다"고 적지만
`assertShape`가 거부하는 것은 `^(MCCP_)?IMPECCABLE_` 축 이름뿐이다. L10이 붉어질 때
목록에 한 줄 append하면 green이 된다 — 축소 방향만 기계화돼 있다.

목록이 코드인 이상 증가를 **불가능**하게 만들 수는 없다. 만들 수 있는 것은 "한 곳만 고쳐서는
안 되게" 하는 것이다: 파일에 `EVIDENCE_DEBT_CEILING` 상수를 두고 로드 시점에
`length <= CEILING`을 강제하며, test가 `CEILING === length`를 단언한다. 그러면 이름을 추가하려면
**상수를 올리는 커밋**이 필요하고, 그 커밋의 diff에는 래칫이 느슨해졌다는 사실이 숫자로 남는다.
M5 DD3의 "숫자가 아니라 이름" 원칙과 충돌하지 않는다 — 이름 목록이 신원을 계속 갖고, 숫자는
**상한이지 정원이 아니다**. 동시에 헤더와 gate-design의 문장을 "무엇이 기계이고 무엇이 규약인가"로
정정한다. 기계가 아닌 것을 기계라고 적는 것이 이 milestone이 닫는 결함이다.

### DD5 — 재는 자와 강제하는 자가 갈라져 있으면 창 조정이 조용한 우회가 된다

`measure-evidence.js:32,41`의 `WINDOW`/`hasName`은 `evidence-name.js:37,43`의
`EVIDENCE_WINDOW`/`nameAppears`와 구현이 같다. `lint.js:486`이 이미 둘 다 re-export하고
`measure-evidence.js`는 그 `lint`를 require하므로 통합은 한 줄이다. 지금 갈라 두면 창을
넓히는 사람이 한 쪽만 고쳐도 아무 test가 붉지 않고, 그 결과 A/B/C 계측이 L10의 판정과
다른 답을 낸다 — 계측이 강제를 감사하지 못하게 된다.

### DD6 — 역방향의 범위는 좁히되, 주장은 여전히 범위째로 적는다

`scan.js:36-41`의 `isExcluded`가 `rel.indexOf('env-contract') !== -1`로 **경로 substring**을 본다.
디렉토리가 아니라 substring이라 `docs/env-contract-notes.md`나 미래의
`lib/gates/env-contract-bridge.js` 같은 것도 조용히 면제된다. 오늘 그런 파일은 **0건**이므로
(실측: `git ls-files | grep env-contract`가 그 디렉토리 밖에서 아무것도 내지 않는다) 지금
얻는 것은 없고, 얻는 것은 **미래의 조용한 면제를 막는 것**이다. 그 사실을 그대로 적는다 —
"오늘 0건을 고친다"가 이 태스크의 정직한 크기다.

추가로 역방향 표면에 `env-contract/value.js`를 포함시킨다. 그 디렉토리에서 유일하게
**런타임에 env를 읽는** 파일이고, `IMPECCABLE_*`를 그리로 배선하는 순간 "mccp는 읽지 않는다"가
거짓이 되는 정확한 지점이다. 오늘 그 파일에 `IMPECCABLE_` 리터럴은 없다(실측: 주석의 `MCCP_*`
4건뿐)이라 위양성 0건으로 들어온다. 나머지 제외분(registry·lint·evidence-*·scan·measure)은
**이름으로 열거하고 각각 사유를 적는다** — `state/toggle-snapshot.js`의 `TOGGLE_EXCLUSIONS`
규약 그대로다. `walkSurfaces`의 다른 소비처(L1·L4·L9)의 입력은 **바뀌지 않는다**: 그들의 범위를
넓히면 이 milestone이 검증하지 않은 축이 붉어진다.

### DD7 — Open Questions는 안전하게 측정 가능한 방법으로만 닫는다

hook 이중 등록의 라이브 재현은 npm CLI 3.6.0을 임시 설치해야 하고, 그것은 M3가 제거한
섀도잉을 되살린다(그리고 측정 후 제거가 필요하다). 대신 **정적 증거**로 답한다: plugin
4.1.1의 hook 선언과 CLI 배포본의 hook 설치 지점을 각각 읽어 "같은 이벤트에 두 항목이
등록되는가"를 구성으로 판정하고, impeccable 세션 종료 hook의 선언을 mccp Stop-loop 계약과
대조한다. 라이브 이중 발화 관측은 **잔여로 남기고 그렇게 적는다** — 정적 판정을 라이브
측정이라 부르지 않는다.

Node 하한은 **올리지 않는다**. mccp 자신은 20+에서 완주하고, 22+를 요구하는 것은 서드파티
hook 하나다. 하한을 올리면 mccp 전체 사용자가 impeccable hook 때문에 Node를 올려야 하고,
그것은 §1.1이 세운 "impeccable은 번들하지 않는 선택적 의존" 계약과 어긋난다. 정상 degraded로
문서화하는 쪽을 택하고 그 근거를 적는다.

### DD8 — 이 milestone이 고치지 않는 것

- `EVIDENCE_DEBT` 29건(B 24 + C 5). M5 DD3 유지 — 각 축이 자기 evidence 행을 실제 read
  site로 옮기고 목록에서 자기 이름을 지운다. 그중 3건(`MCCP_PLAN_REVIEW_` ·
  `MCCP_IGNORE_ENTRIES` · `MCCP_JOURNAL_DEGRADED_UNRECORDED`)은 환경변수가 아닌 스캔 오탐이라
  애초에 상환 대상이 아니다.
- L11 — `docs/environment/*.md`의 소비처 행과 registry `evidence`를 대조하는 검사.
- `CLAUDE.md` §3.16의 `MCCP_GATE_ROUND_CAP=1` 서술과 `.claude/settings.json`의 `"3"` 불일치.
- 사유 템플릿 오염 비-impeccable 7종.
- PRD Open Question 2번(비-bypass 모드 도구 권한 실측) — 권한 모드를 바꾼 세션이 필요해
  이 세션에서 측정 불가. `[~]` 상태를 유지한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 여분 키 거부 | `plugins/mccp/scripts/receipt/write.js:1145-1162` | `ROUTED_ENTRY_KEYS` + `canonicalRoutedEntry` — 정확히 세 키가 아니면 `null`, 호출자가 거부. 조용한 정규화 금지 |
| 경로 정규화 | `plugins/mccp/scripts/receipt/write.js:494` | `--*-file` 인자는 `path.resolve(cwd, ...)`를 거친 뒤 읽는다 |
| schema 열거 검증 | `plugins/mccp/scripts/receipt/schema.js:921-934` | `req(...)`로 필드별 메시지 누적, present-only(`null`/`undefined`는 무검사) |
| 로드 시점 throw | `plugins/mccp/scripts/lib/env-contract/evidence-debt.js:86-108` `assertShape` | 불변식 위반은 test가 아니라 모듈 로드에서 throw. lint가 그것을 잡아 problem으로 적는다 |
| 검사 범위 위임 | `plugins/mccp/scripts/lib/env-contract/lint.js:458` | 자체 walk를 갖지 않고 `scan.walkSurfaces`를 부른다 |
| 이름으로 된 제외 | `plugins/mccp/scripts/state/toggle-snapshot.js` `TOGGLE_EXCLUSIONS` | 제외는 정규식이 아니라 이름이고, 각 이름에 실파일 근거가 붙는다 |
| 문서 정정 표기 | `CLAUDE.md` §3.7 "v1.23.12 정정:" | 원문을 지우지 않고 정정 줄을 덧붙인다 |
| 짝 단언 | `plugins/mccp/scripts/lib/tests/impeccable-guard.test.js` (M3) | 두 표면이 같은 값이어야 한다는 쌍방 단언 |
| 도달불가 고정 | `plugins/mccp/scripts/lib/tests/impeccable-cleanup.test.js` (M3) | "이 오라클이 만들 수 있는 어떤 구성도 X를 만들지 못한다"를 test로 고정 |
| 측정 노트 | `.claude/notes/impeccable-detection-contract-m5.md` | 착수 전 실측을 재현 명령과 함께 기록 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `.claude/notes/impeccable-detection-contract-m6.md` | CREATE | 착수 전 실측(죽은 분기 봉인 · 여분 키 legacy 0건 · Open Questions 3건 측정) 기록 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `impeccable_commands_routed[]` 항목의 여분 키 거부 (security-reviewer F1) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | 최초 write 경로의 `--impeccable-commands-routed-file` cwd resolve + `canonicalRoutedEntry` 재사용 (F2) |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | `.claude/cache/` 죽은 surface 분기 2곳 제거 (`:471` · `:1218`) + 공백 명시 |
| `plugins/mccp/scripts/lib/env-contract/evidence-debt.js` | UPDATE | `EVIDENCE_DEBT_CEILING` + 로드 시점 강제, 헤더의 래칫 주장 정정, `MCCP_PLAN_REVIEW_` 거짓 주석 정정 |
| `plugins/mccp/scripts/lib/env-contract/measure-evidence.js` | UPDATE | 창/매처를 `evidence-name.js`에서 가져오도록 통합, 거짓 주석 정정 |
| `plugins/mccp/scripts/lib/env-contract/scan.js` | UPDATE | `isExcluded`를 substring에서 디렉토리 prefix 앵커로, 제외분을 이름으로 열거 |
| `plugins/mccp/scripts/lib/env-contract/lint.js` | UPDATE | L10 역방향 표면에 `env-contract/value.js` 포함 |
| `docs/ENVIRONMENT.md` | UPDATE | `IMPECCABLE_NO_UPDATE_CHECK` 기본값 표기를 상세 절과 일치시킴 (`:214`) |
| `docs/environment/external.md` | UPDATE | 같은 축의 반대 면 정합 (`:317`) + Node 하한 degraded 서술 |
| `plugins/mccp/scripts/receipt/tests/impeccable-routing-fields.test.js` | UPDATE | 여분 키 거부 · 경로 정규화 회귀 단언 추가 |
| `plugins/mccp/scripts/lib/env-contract/tests/evidence-debt.test.js` | UPDATE | ceiling ≡ length 짝 단언 + 증가 방향 회귀 |
| `plugins/mccp/scripts/lib/env-contract/tests/lint.test.js` | UPDATE | 역방향 표면 확장 · 제외 앵커 회귀 |
| `plugins/mccp/scripts/lib/tests/impeccable-guard.test.js` | UPDATE | `.claude/cache/` 리터럴 부재 짝 단언 |
| `.claude/state/fix-task-applied.md` | UPDATE | `task_fingerprint` 드리프트 정정 |
| `.claude/prds/impeccable-detection-contract.prd.md` | UPDATE | milestone 6 status · Open Questions 3건 판정 기록 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 흡수된 항목에 해소 표기 · 미흡수분 이연 append |
| `docs/gate-design.md` | UPDATE | `#impeccable-detection` — 래칫 주장 정정 · L10 범위 갱신 · M6 절 |
| `CLAUDE.md` | UPDATE | §3.17 — 래칫/범위 서술 정합 (상주 불변식만) |
| `CHANGELOG.md` | UPDATE | `1.32.1` 항목 + `1.32.0` 노트의 PRD 종료 서술 정정 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.32.0` → `1.32.1` |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (`:1419`) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 (`:163`) |

## Tasks

### Task 0: 착수 전 실측 기록

- **Action**: `.claude/notes/impeccable-detection-contract-m6.md`를 만들고 아래를 재현 명령과 함께 적는다.
  (a) 죽은 분기 봉인 — `git ls-files .claude/cache/`(빈 출력) + `git check-ignore -v`로 두 경로가 모두 `.gitignore:131`에 걸림.
  (b) 여분 키 legacy 위험 — 저장소 전 receipt를 훑어 `impeccable_commands_routed` 항목의 키 집합을 센다. 착수 시점 실측: receipt 1건 · entry 5건 · 비정규 키 **0건**. 즉 whitelist 도입의 소급 거부 위험이 0이다.
  (c) A/B/C 기준선 — `measure-evidence.js --json` 출력(A 115 · B 24 · C 5 · not-consumed 19).
  (d) 현재 탐지 상태 — `impeccable-detect.js resolve --json`(available:true · plugin 4.1.1 · `impeccable:impeccable` · shadowed:false)과 `dep-check.js` 출력.
  (e) **STATE.md `dep_check_missing: impeccable`이 stale하다** — 위 (d)가 반증한다. 설치된 plugin cache가 `1.31.0`(pre-M1)이라 SessionStart hook이 M1 이전 탐지기로 그 값을 썼다. 머지 + `claude plugin update` 전에는 PRD Success Metric "SessionStart 오탐 0건"을 이 머신에서 확정할 수 없다는 사실을 그대로 적는다.
- **Mirror**: `.claude/notes/impeccable-detection-contract-m5.md`
- **Validate**: 노트의 모든 수치가 적힌 명령의 실제 출력과 일치한다.

### Task 1: `impeccable_commands_routed[]` 여분 키를 schema가 거부한다

- **Action**: `schema.js:921-934`의 항목 검증에 키 whitelist를 추가한다 — `command`/`call_form`/`status` **정확히 셋**이 아니면 `err(at + ...)`. 정규화하지 않고 거부한다: 여분 키는 producer와 consumer가 어긋났다는 신호이고, 조용히 버리면 caller가 기록했다고 믿는 것과 다른 receipt가 봉인된다. present-only 계약은 유지한다(`null`/`undefined`는 무검사). Task 0 (b)가 소급 거부 0건임을 이미 봉인했으므로 legacy 예외는 두지 않는다 — 예외를 두면 위조된 entries 파일이 그 예외로 들어온다.
- **Mirror**: `write.js:1145-1162` `canonicalRoutedEntry`의 "정확히 세 키" 규칙, `schema.js:921-934`의 `req(...)` 메시지 형식
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/impeccable-routing-fields.test.js` — 여분 키 1개를 실은 receipt가 invalid, 정규 3키는 valid

### Task 2: 최초 write 경로가 restamp 경로와 같은 규율을 쓴다

- **Action**: `write.js:710-714`를 고친다. (1) `path.resolve(cwd, p)`로 정규화한 뒤 읽는다 — 같은 파일 `:494`의 `--review-proof-file`과 `:1211`의 restamp 경로가 이미 그렇게 한다. (2) 읽은 배열의 각 항목을 `canonicalRoutedEntry`로 통과시키고, `null`이면 **throw**한다(restamp의 `:1223-1231`과 같은 문형). Task 1이 검증자 쪽을, 이것이 작성자 쪽을 닫아 두 겹이 된다.
- **Mirror**: `plugins/mccp/scripts/receipt/write.js:494` · `:1211` · `:1223-1231`
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/impeccable-routing-fields.test.js` — 상대 경로 entries 파일이 cwd 기준으로 해소되고, 여분 키 파일은 write가 거부

### Task 3: 죽은 `.claude/cache/` 분기를 제거하고 남는 공백을 적는다

- **Action**: `plugins/mccp/commands/prp-implement.md:471`과 `:1218`의 `cache` 정규식과 `isSurface`의 그 항을 제거한다. 같은 블록 바로 위 주석에 **왜 지웠는지**와 **무엇이 남는지**를 적는다: 파일 집합이 tracked diff ∪ non-ignored untracked라 `.gitignore:131`이 그 경로를 양쪽에서 배제하므로 분기가 참이 될 수 없었고, 그 결과 오늘 대시보드 작업은 `renderingSurface=0`이며 그것이 현재의 정직한 상태다. 되살리는 두 선택지와 기각 근거는 DD3에 있다.
- **Mirror**: `plugins/mccp/commands/prp-implement.md:1161`의 "renderingSurface는 게이트 조건이 아니라 입력이다" 주석 문형
- **Validate**: `grep -n "claude/cache" plugins/mccp/commands/prp-implement.md` → `isSurface` 안의 hit 0. 라우팅 오라클 출력이 변경 전후로 동일(T13 라이브에서 재확인)

### Task 4: 래칫의 증가 방향을 보이게 만들고, 주장을 사실로 정정한다

- **Action**: `evidence-debt.js`에 `EVIDENCE_DEBT_CEILING`(착수 시점 값 `29`)을 두고 `assertShape`가 `list.length <= CEILING`을 **로드 시점에 throw**로 강제한다(`:86-108` 안, 기존 검사와 같은 자리). 헤더의 "래칫은 양방향이다 … 목록이 줄어들기만 하고"를 정정해 무엇이 기계인지 정확히 적는다: 축소 방향은 `evidence-name.js:124-127`이 기계로 강제하고, 증가 방향은 **상수를 올리는 별도 편집을 요구**할 뿐 금지되지 않는다. `AXIS_FORBIDDEN_RE`가 impeccable 축만 막는다는 사실도 명시한다.
- **Mirror**: `evidence-debt.js:86-108` `assertShape`의 throw 문형, `CLAUDE.md` §3.7 정정 표기
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/evidence-debt.test.js` — ceiling ≡ length 짝 단언, 상수를 넘는 fixture가 로드에서 throw

### Task 5: 재는 자와 강제하는 자를 하나로 만든다

- **Action**: `measure-evidence.js:32`의 `WINDOW`와 `:41`의 `hasName`을 지우고 `lint`가 이미 re-export하는 `EVIDENCE_WINDOW`/`nameAppears`를 쓴다(`lint.js:486` 인접). 그 파일은 이미 `require('./lint')`한다. 헤더의 "두 번째 구현이 생기면 그 둘이 갈라진다"는 주석은 **자기 파일에 대한 예언이었으므로**, 통합됐다는 사실로 갱신한다.
- **Mirror**: `plugins/mccp/scripts/lib/env-contract/lint.js:483-487`의 "판정 코어는 evidence-name.js가 소유한다" 재-export 규약
- **Validate**: `measure-evidence.js --json`이 통합 전후로 동일한 A/B/C를 낸다(Task 0 (c) 기준선). `grep -c "function hasName\|const WINDOW" measure-evidence.js` → 0

### Task 6: 역방향의 범위를 좁히고, 남는 제외를 이름으로 적는다

- **Action**: (1) `scan.js:36-41`의 `rel.indexOf('env-contract') !== -1`를 실제 디렉토리 prefix(`plugins/mccp/scripts/lib/env-contract/`) 앵커로 바꾼다. 오늘 얻는 것이 0건이라는 사실을 주석에 적는다 — 막는 것은 **미래의 조용한 면제**다. (2) `lint.js:458`의 L10 역방향 표면 구성에 `plugins/mccp/scripts/lib/env-contract/value.js`를 추가한다. 그 디렉토리에서 유일하게 런타임에 env를 읽는 파일이므로 "mccp는 읽지 않는다"가 거짓이 되는 지점이다. (3) 나머지 제외 파일을 **이름으로 열거하고 각각 사유를 적는다**. `walkSurfaces`의 다른 소비처(L1 `:283` · L4 · L9 `:413`)의 입력은 **바꾸지 않는다**.
- **Mirror**: `state/toggle-snapshot.js` `TOGGLE_EXCLUSIONS`(이름 + 실파일 근거), `lint.js:456`의 "범위는 scan.walkSurfaces가 소유한다" 계약
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` → L1~L10 전부 ok(범위 확장이 기존 검사를 붉히지 않음). `node --test .../tests/lint.test.js` — `value.js`에 not-consumed 이름을 심은 fixture가 역방향에서 붉어진다

### Task 7: 거짓 주석 2건을 정정한다

- **Action**: `measure-evidence.js:16-21`과 `evidence-debt.js:72-74`가 `MCCP_PLAN_REVIEW_`(끝이 밑줄)에 대해 "경계 일치로는 원리상/절대 A가 될 수 없다"고 적는다. 실행이 반증한다 — `nameAppears`에 그 이름과 뒤에 공백이 오는 문자열을 주면 `true`다(뒤에 **word 문자**가 못 올 뿐 공백·문장부호는 매치한다). 참인 문장으로 바꾼다: 그 이름은 코드에서 **항상 다른 이름의 접두사로만** 나타나므로 실제 표면에서 A가 되지 않으며, 그것은 정규식의 원리가 아니라 **관측된 성질**이다. `docs/gate-design.md`의 같은 주장(실측 A/B/C 절)도 함께 고친다.
- **Mirror**: `CLAUDE.md` §3.7 "v1.23.12 정정:" — 원문을 지우지 않고 정정 줄을 덧붙인다
- **Validate**: 세 표면에 "원리상"/"절대" 형태의 주장이 남지 않는다. Task 5의 A/B/C 기준선 불변

### Task 8: `IMPECCABLE_NO_UPDATE_CHECK` 기본값 두 면을 일치시킨다

- **Action**: `docs/ENVIRONMENT.md:214`가 기본값을 `off`로, `docs/environment/external.md:317`이 "미설정 (원문도 unset)"으로 적는다. 사실은 후자다 — 벤더는 그 변수를 설정하지 않고 truthy일 때만 본다. 색인의 `kind=bool`이 극성 선언을 요구해 생긴 구조적 결과이므로, 색인 쪽 표기를 상세 절과 같은 사실로 맞추되 `bool` 종류는 유지한다. 같은 절의 다른 `IMPECCABLE_*` 행도 두 면이 어긋나지 않는지 함께 확인한다.
- **Mirror**: `docs/environment/external.md:317`의 "원문도 unset" 표기
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` L2·L3 ok. 두 면의 기본값 문자열이 일치

### Task 9: PRD Open Questions 3건을 측정으로 답한다

- **Action**: 세 질문을 각각 닫고 **근거를 노트에 적은 뒤** PRD의 항목을 갱신한다.
  (a) **hook 이중 등록** — plugin 4.1.1의 hook 선언(`~/.claude/plugins/cache/impeccable/impeccable/4.1.1/`의 hooks 매니페스트)과 npm CLI 3.6.0이 설치하는 지점을 각각 읽어, 같은 이벤트에 두 항목이 등록되는지 **구성으로** 판정한다. impeccable 세션 종료 hook의 선언을 mccp Stop-loop 계약(§3.2 `session-end-trace.js`)과 대조한다. CLI를 임시 설치하지 않는다(DD7) — **라이브 이중 발화 관측은 잔여로 남기고 그렇게 적는다.**
  (b) **Node 하한** — impeccable 4.1.1이 요구하는 버전과 mccp의 선언 20+를 실물로 확인한 뒤 **하한을 올리지 않는다**고 결정하고 근거를 적는다(DD7). impeccable hook 미동작은 정상 degraded이며, 그 사실을 `docs/environment/external.md`의 impeccable 절에 한 줄로 남긴다.
  (c) **`impeccable@anthropics` 출처** — `git log -S` 로 도입 커밋을 찾아 과거 실재 채널인지 추정값인지 판정한다. 추정값이면 하위 호환 부담이 없다는 결론을 적고, 리터럴 제거 여부는 **판정만 하고 이 milestone에서 제거하지 않는다**(탐지 동작 변경은 M1 계약 재개봉이다).
- **Mirror**: `.claude/notes/impeccable-detection-contract-m3.md` Task 0 — 측정 방법 · 관측 · **판정할 수 없는 것**을 나눠 적는 형식
- **Validate**: PRD Open Questions의 세 항목이 각각 근거 링크와 함께 갱신되고, 잔여가 남는 항목은 잔여를 명시

### Task 10: state 아티팩트를 정합화한다

- **Action**: `.claude/state/fix-task-applied.md`의 `task_fingerprint`가 `impeccable-detection-contract-m4`인데 `decision_id`는 `-m5`다. STATE.md는 이미 `-m5`로 정정돼 있으므로 이 파일만 어긋나 있다. fingerprint를 실제 소유 결정에 맞춘다. STATE.md의 escalation pending은 **직접 편집하지 않는다**(§3.2 — `state-writer.js` API 소유): M6의 게이트 완주가 receipt를 갱신하면 자동 해제되는 경로를 따르고, 해제되지 않으면 그 사실을 Task 12에서 관측으로 적는다. `dep_check_missing`도 손대지 않는다 — 그 값은 SessionStart hook이 소유하며 Task 0 (e)가 stale 사유를 이미 기록했다.
- **Mirror**: `plugins/mccp/scripts/state/fix-task.js`의 frontmatter 스키마
- **Validate**: `fix-task-applied.md`의 fingerprint와 decision_id가 같은 milestone을 가리킨다. `node --test plugins/mccp/scripts/state/tests/fix-task.test.js`

### Task 11: test — 짝 단언과 도달불가 고정

- **Action**: 아래를 추가한다. (1) `impeccable-routing-fields.test.js` — 여분 키 receipt invalid · 정규 3키 valid · 상대 경로 entries 파일의 cwd 해소. (2) `evidence-debt.test.js` — `CEILING === EVIDENCE_DEBT.length` **짝 단언**(둘 중 하나만 고치면 붉다) · ceiling 초과 fixture가 로드에서 throw. (3) `lint.test.js` — `value.js`에 not-consumed 이름을 심은 fixture가 역방향에서 붉어짐 · 제외 앵커가 디렉토리 밖 `env-contract` substring 경로를 더는 면제하지 않음. (4) `impeccable-guard.test.js` — `plugins/mccp/commands/prp-implement.md`의 `isSurface`에 `.claude/cache/` 리터럴이 **없다**는 단언(M3의 짝 단언 형식). 이 test들은 **어떤 CI도 돌리지 않으므로**(§3.17) 강제 지점은 아래 `## Validation`이다.
- **Mirror**: `impeccable-guard.test.js`(짝 단언) · `impeccable-cleanup.test.js`(도달불가 고정)
- **Validate**: 아래 `## Validation` 전건 통과

### Task 12: 문서·릴리스 정합

- **Action**: (1) `docs/gate-design.md#impeccable-detection`에 M6 절을 추가하고 래칫 주장(`:1216`) · L10 범위 문단 · A/B/C 절의 원리상 문장을 정정한다. (2) `CLAUDE.md` §3.17에는 **상주 불변식만** — 래칫의 두 방향이 각각 기계인지 규약인지 한 문장, 나머지는 gate-design 링크. (3) `CHANGELOG.md`에 `1.32.1` 항목을 추가하고 `1.32.0` 노트의 "M5는 마지막 milestone이고 PRD 전체가 종료된다"에 "v1.32.1 정정:" 줄을 덧붙인다(원문 유지). (4) version 4면 동기 — `plugin.json` `1.32.0` → `1.32.1` · `renderer/html.js:1419` · `renderer/markdown.js:163` · CHANGELOG의 currently 노트. (5) PRD milestone 6을 complete로. (6) backlog에서 흡수된 항목(533·548·550·551·559·565·566·567·568)에 해소 표기를 붙이고, 미흡수분은 이연 사유와 함께 append한다.
- **Mirror**: `CHANGELOG.md`의 `## [1.32.0]` §3.7 노트 형식(bump 근거 + 병렬 브랜치 충돌 점검), `CLAUDE.md` §3.7 정정 표기
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`(manifest에서 기대값 파생 — 4면 중 하나라도 빠지면 붉다). `node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md`

> **§3.7 병렬 브랜치 충돌 — PR 진입 직전 재계산 필수.** 착수 시점 `origin/main`은 `1.31.0`이고
> 이 브랜치가 `1.32.0`까지 썼다. sibling worktree `env-contract-integrity`는 `1.30.0`에 머문
> 문서 전용 브랜치라 `1.32.1` 자리가 비어 있다. 그러나 §3.7이 실측 4회로 경고하듯 충돌은
> **머지와 PR 사이에도 열려 있으므로**, target은 (a) base 머지 시점과 (b) `/mccp:pr` 진입
> 직전 두 번 재계산한다. 재상향하면 4면과 CHANGELOG 헤딩이 다시 어긋나므로 동기 검증을
> **전부 다시** 돌린다.

### Task 13: 라이브 완주

- **Action**: `/mccp:prp-implement` 게이트를 실제로 완주해 아래를 관측한다. (1) 2.5.5b `phase:"pre"` 라우팅 오라클 출력이 Task 3 이전과 **동일**(죽은 분기 제거가 발화를 바꾸지 않음). (2) Phase 3.6 `phase:"finish"` 5종이 `impeccable:impeccable`로 발화하고 `restamp-routed`가 착지. (3) receipt의 `impeccable_commands_routed` 항목이 전부 정규 3키(Task 1·2가 발화 경로를 막지 않음). (4) `impeccable_skipped`가 참이 아니고 env 우회 0건 — PRD Success Metric 1. 관측을 노트에 적는다.
- **Mirror**: `.claude/notes/impeccable-detection-contract-m4.md` Task 8 — 라이브 관측 기록 형식
- **Validate**: receipt 실물에서 위 넷을 확인. 어느 하나라도 어긋나면 그 사실을 노트에 적고 원인을 닫는다

## Validation

```bash
# V1 — receipt 축 (Task 1·2·11)
node --test plugins/mccp/scripts/receipt/tests/impeccable-routing-fields.test.js \
            plugins/mccp/scripts/receipt/tests/impeccable-skipped.test.js \
            plugins/mccp/scripts/receipt/tests/impeccable-force-override.test.js \
            plugins/mccp/scripts/receipt/tests/pr-codex-dedupe.test.js

# V2 — env-contract 축 (Task 4·5·6·7·11)
node --test plugins/mccp/scripts/lib/env-contract/tests/*.test.js
node plugins/mccp/scripts/lib/env-contract/lint.js            # L1~L10 전부 ok, exit 0
node plugins/mccp/scripts/lib/env-contract/measure-evidence.js --json   # Task 0 (c) 기준선과 동일

# V3 — impeccable 오라클·가드 (Task 3·11)
node --test plugins/mccp/scripts/lib/tests/impeccable-*.test.js

# V4 — 탐지 실물 (회귀 없음)
node plugins/mccp/scripts/lib/impeccable-detect.js resolve --json
node plugins/mccp/scripts/lib/dep-check.js

# V5 — 전체 회귀 (M5 기준선: 682 중 0 fail)
node --test plugins/mccp/scripts/lib/tests/*.test.js \
            plugins/mccp/scripts/receipt/tests/*.test.js \
            plugins/mccp/scripts/state/tests/*.test.js

# V6 — 문서·릴리스 (Task 8·12)
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
     --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# V7 — 죽은 분기 봉인 (Task 3)
git ls-files .claude/cache/                                    # 빈 출력이어야 한다
grep -n "claude/cache" plugins/mccp/commands/prp-implement.md  # isSurface 안에 hit 0

# V8 — 머지 삭제 검증 (§3.5.1)
git diff --diff-filter=D --name-only origin/main...HEAD
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| schema whitelist가 사용자 워킹트리의 legacy receipt를 소급 거부한다 | 낮음 | Task 0 (b)가 이 저장소에서 0건임을 봉인. present-only라 필드 부재는 무검사이고, 값이 있는 receipt는 v1.13.0 이후 오라클 출력뿐이라 항상 3키다. 예외를 두지 **않는 것**이 위조 경로를 막는 이유(DD1) |
| L10 역방향 표면 확장이 기존 검사를 붉힌다 | 중 | `value.js`에 `IMPECCABLE_` 리터럴 0건임을 실측으로 확인했고, `walkSurfaces`의 다른 소비처(L1·L4·L9) 입력은 **바꾸지 않는다**. V2가 L1~L10 전건을 돌린다 |
| 죽은 분기 제거가 라우팅 발화를 바꾼다 | 낮음 | 분기가 참이 될 수 없음이 V7로 봉인. Task 13이 제거 전후 오라클 출력 동일성을 라이브로 확인 |
| ceiling 상수가 "숫자 상한" 안티패턴으로 읽힌다 | 중 | 이름 목록은 그대로 남고 숫자는 **상한이지 정원이 아니다**. 헤더에 그 구분과 무엇이 기계이고 무엇이 규약인가를 명시(DD4). 짝 단언이 상수와 목록을 함께 묶는다 |
| sibling `env-contract-integrity`와 같은 파일이 겹친다 | 중 | UI3~UI6이 그 PRD 소유분을 배제. 이 milestone이 만지는 env-contract 파일은 **M5가 이번 브랜치에서 만든 것**(evidence-debt · measure-evidence)과 그 인접 2줄뿐이다. §3.5.1 삭제 검증(V8)을 머지·PR 양쪽에서 돌린다 |
| version이 머지 전에 밀린다 | **높음** — 실측 4회 | §3.7대로 base 머지 시점과 `/mccp:pr` 직전 **두 번** 재계산. 재상향 시 4면 + CHANGELOG 헤딩 동기 검증 전건 재실행(Task 12 노트) |
| Open Question (a)를 정적 증거로 닫고 측정했다고 과대주장한다 | 중 | DD7이 라이브 잔여를 명시하도록 못 박고, Task 9가 판정할 수 없는 것을 따로 적는 M3 Task 0 형식을 미러 |
| PRD Success Metric "SessionStart 오탐 0건"이 이 머신에서 확정 불가 | **높음** — 이미 관측 | 설치 cache가 `1.31.0`(pre-M1)이라 hook이 옛 탐지기를 쓴다. Task 0 (e)가 사유를 기록하고, 확정은 머지 + `claude plugin update` 이후로 명시 이연 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes (V1~V8)
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
      — 라이브 `/mccp:prp-implement` 완주가 남겨야 할 산출물: `mccp-implement-codex` receipt에
      `impeccable_commands_routed`의 finish 5건이 **정규 3키로** 실리고, `impeccable_skipped`가
      참이 아니며, `impeccable_routing_mode`가 기록될 것. Task 3 전후로 2.5.5b 오라클 출력이
      동일할 것. 이 넷은 receipt 실물에서 확인 가능하며, 하나라도 어긋나면 milestone은 미완이다.
- [ ] backlog의 흡수 대상 9건에 해소 표기가 붙고, 미흡수분은 이연 사유와 함께 남았다
- [ ] PRD Open Questions 3건이 근거와 함께 갱신됐고, 잔여가 있는 항목은 잔여를 명시했다
- [ ] version 4면(plugin.json · html.js · markdown.js · CHANGELOG)이 동기이고 PR 직전 재계산했다

## Design Critique

impeccable `impeccable:impeccable` v4.1.1 (source=plugin) · round 0/2 · verdict **CONVERGED**.

탐지: `skill_available=1` · `design_signal=1` · `reason=ok` · `invocation=impeccable:impeccable`.
신호원은 이 plan이 만지는 렌더러 표면(`renderer/html.js` · `renderer/markdown.js` · `status.html` ·
`i18n-surface.test.js`)이다 — version 4면 동기(Task 12)가 그 파일들을 건드리기 때문이다.

4개 Output Constraint 판정:

| Anchor | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | **PASS** | `^####` 0건. 최대 깊이 3 |
| 강조색 화면당 1개 | MEDIUM — 미흡수 | `**bold**` 110건. 관측은 참이나 anchor가 상정한 독자는 60초 스캔하는 PM이고 이 문서의 독자는 전문을 읽는 적대적 리뷰어다. 굵은 글씨가 표시하는 것이 대부분 불변식·거부 조건이라 감축이 리뷰 가치를 직접 떨어뜨린다. §3.14대로 backlog 이연 (M4 선례와 동일 축) |
| raw markdown marker 금지 | **N/A** | 이 문서는 렌더 표면이 아니라 파서 입력이다. 누출될 렌더 표면이 존재하지 않는다 |
| 한 화면 항목 수 상한 (list-of-N top-3) | LOW — 비적용 | 4개 표가 3행 초과(User Intent 6 · Patterns 9 · Files to Change 22 · Risks 7). `plan-review/l1-check.js:278`이 이 표들을 **행 단위로** 읽고, §1.2가 `Files to Change` 첫 열을 git diff 경로와 리터럴 매칭하도록 요구한다 — `<details>` 래핑은 C2·C3 검사와 cross-gate dedupe를 함께 깨뜨린다. 범주 불일치 (M3 backlog 508 · M4 backlog 532 선례) |

HIGH·CRITICAL 0건이므로 `decideCritique`가 round 0에서 `CONVERGED`를 낸다. MEDIUM·LOW 2건은
§3.14대로 그 자리에서 고치지 않고 `codex-findings-backlog.md`에 증거와 함께 append한다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없어 **어떤 명령도 호출하지 않는다** — 아래는 구현자를 위한 체크리스트다.

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

<!-- placeholder: will be replaced by Phase 7.3 -->

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0 — 리뷰어가 발화하지 못했다
- 합치 결론: **미수렴.** Codex 쿼터 소진으로 companion이 exit 1 + 빈 stdout을 반환했고 wrapper가 `classification=exit-nonzero`(blocking, exit 12)로 분류했다. 사유는 wrapper 봉투에서 지워지므로 companion을 직접 호출해 확인했다 — `parseError: "You've hit your usage limit … try again at Aug 30th, 2026 1:37 AM."` 그 날짜는 확정 시각이 아니다(실측 선례: 3일 조기 복구). `MCCP_ALLOW_CODEX_UNAVAILABLE=1` advisory 모드로 진행하며 receipt는 `codex_verdict='unavailable'` + `advisory=true`로 **비승인** 상태를 사실대로 봉인한다.

> Codex unavailable, skipped (auto-fallback): exit-nonzero (quota exhausted)

- YAGNI Triage: 해당 없음 — finding 0건이므로 triage 대상이 없다
- Deferred to backlog: 0
- Open Questions: 구현시점 결정 8건(D1~D8: schema whitelist · write 경로 정규화/throw · 죽은 분기 제거 · ceiling 로드시점 throw · 창/매처 통합 · 제외 앵커 · L10 범위 · version 4면)이 **cross-model 검토 없이** 남는다 — severity MEDIUM. plan 축은 L2 패널 4/4 수렴으로 이미 심사됐고(`.claude/reviews/plan-review-impeccable-detection-contract.md`), 미검토분은 구현시점 결정뿐이다. 쿼터 복구 후 회수한다.
- Codex session 참조: 없음 (thread 미생성)

### Security Reviewer

> security-reviewer unavailable, skipped (auto-fallback): 이 세션의 운영 지침이 사용자 요청 없는 AgentTool 호출을 금지한다. Task 1(schema 입력 검증)·Task 2(경로 해소)가 본래 대상이므로 `security_skipped=true`를 봉인해 `/mccp:pr`에서 blocking 축으로 남긴다.

### Design Review

> impeccable silent-skip: `design_signal=false` (reason=`no-signal`). SKILL은 available(plugin 4.1.1 · `impeccable:impeccable` · shadowed=false)이나 2.5.5b는 **EXECUTE 이전 diff**를 평가하므로, M6이 고칠 `plugins/mccp/scripts/receipt/write.js`와 `plugins/mccp/scripts/lib/renderer/*.js`(둘 다 `DESIGN_SURFACE_PATHS` 소속)가 그 시점 diff에 없다. 탐지 실패가 아니라 **평가 시점의 구조적 blind**이며 Task 13이 관측으로 기록한다.
