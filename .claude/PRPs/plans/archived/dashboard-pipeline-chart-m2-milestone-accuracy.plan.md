# Plan: Dashboard Milestone-Record Accuracy + Terminology Unification (M2 잔여)

**Source PRD**: .claude/prds/dashboard-pipeline-chart.prd.md
**Selected Milestone**: 2 (잔여 절반) — "마일스톤 기록 정확성·용어 통일". M2의 activity step-chart 절반은 commit `6cf75b6`로 이미 완료. 본 plan은 M2의 나머지: (1) "이정표"→"마일스톤" 용어 전면 통일, (2) "날짜 미상" ship-receipt 매칭 버그 수정으로 완료 시점 표시율 100%.
**Complexity**: Medium

## Summary

대시보드 "이정표 기록" 섹션의 두 결함을 닫는다. **용어**: markdown.js/html.js의 섹션 제목·앵커를 "이정표"→"마일스톤"으로 통일(고유명사 단일화). **정확성**: 현재 완료 마일스톤 10건이 전부 "날짜 미상"으로 표시되는 근본 원인 4개를 수정 — (A) derive plans.js의 `Source PRD` 추출 regex가 마크다운-링크 형태만 매칭해 평문-경로 PRD가 discovery 누락, (B) `parseDeliveryMilestonesComplete`가 Plan 셀의 첫 괄호 `(report: …)`를 잡아 plan 대신 report basename 추출, (C) receipt는 working-tree 전용(gitignored)이라 과거 사이클 마일스톤은 ship receipt가 존재하지 않아 `pickShipReceipt`가 영원히 null → completedAt=null. **C는 git commit 시점 fallback**으로 닫는다(receipt 우선, 없으면 plan 파일의 최종 commit 시점). 모두 read-side 렌더링·상관 로직만 — **receipt/derive 스키마 변경 없음**(PRD scope 카브아웃 준수, `source_prd` 필드는 기존, git fallback은 milestone-history 상관 로직 내부에 격리).

## Root Cause Evidence (조사 완료)

실제 렌더 `node plugins/mccp/scripts/derive/cli.js render` 결과 `.claude/cache/STATUS.md`에 `날짜 미상` 10건. 디버그로 확인한 4개 결함:

- **(A) source_prd 평문-경로 누락** — `derive/sources/plans.js:8` `SOURCE_PRD_RE = /\*\*Source PRD\*\*:\s*\[([^\]]+)\]\(([^)]+)\)/`는 `[label](path)` 링크만 매칭. dashboard plan은 평문 `**Source PRD**: .claude/prds/dashboard-pipeline-chart.prd.md` → `source_prd=null` → dashboard PRD가 milestone-history source로 discovery 안 됨(자기 M1조차 미표시). v1-3-0 plan은 링크 형태라 매칭됨(그래서 그 마일스톤만 렌더되며 모두 날짜 미상).
- **(B) planBasename = report 경로** — `renderer/parsers/plan-body.js:109` `planCell.match(/\(([^)]+)\)/)`가 `… .plan.md (report: …-report.md)`에서 첫 괄호 `(report: …)`를 잡아 basename = `…-report.md`(plan 아님). 이로써 후속 git-log/receipt 대상 경로가 어긋남.
- **(C) receipt working-tree 전용** — `.claude/receipts/`는 gitignored. 과거 사이클(v1-3-0/v1-4-2) 마일스톤의 `mccp-pr-codex` receipt가 이 worktree에 없음 → `pickShipReceipt`가 null → `milestone-history.js:72` completedAt=null → `:101` `날짜 미상` 폴백. derive는 `meta.created_at`을 top-level `created_at`로 lift하므로 receipt가 *있을 때*는 정상(현재 cycle dashboard receipt 2건은 created_at 보유).
- **용어** — `이정표` 4곳: `markdown.js:32`(앵커 label+target), `markdown.js:87`(heading), `html.js:315`(h2), `tests/four-part-rendering.test.js:150`(assertion). html `id`는 이미 영어 `milestone-history` → HTML jump-nav/anchor 불변.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Section module IO | `renderer/sections/milestone-history.js:57` | `opts.fsRead` 주입 + 기본 `fs.readFileSync` — 외부 IO를 opts로 주입해 테스트 가능. git resolver도 동일 패턴(`opts.gitCommitTime`) |
| Fail-open 상관 | `renderer/sections/milestone-history.js:64-65` | `try { body = fsRead(prdAbs); } catch (_) { continue; }` — source IO 실패는 조용히 skip, 렌더 계속 |
| Derive source regex | `derive/sources/plans.js:8-10` | 모듈 상단 `const X_RE = /…/` 명명 + `raw.match(RE)` |
| Cycle-prefix 매칭 | `renderer/parsers/plan-body.js:151-155` `extractCyclePrefix` | `^(v\d+-\d+-\d+)` 추출 — 기존 상관 로직 재사용 |
| Native test runner | `renderer/tests/*.test.js` | `node:test` + `node:assert/strict`, 순수 함수에 fixture 주입 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | 앵커 `[이정표-기록](#이정표-기록)`(:32) + heading `## 이정표 기록`(:87) → 마일스톤. 앵커 target은 heading에서 생성되므로 label·target 동시 변경(정합) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | h2 `이정표 기록`(:315) → `마일스톤 기록`. id `milestone-history` 불변 |
| `plugins/mccp/scripts/derive/sources/plans.js` | UPDATE | (A) `SOURCE_PRD_RE`를 링크 OR 평문-경로 둘 다 매칭하도록 확장. 기존 필드 `source_prd` 유지(스키마 불변) |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE | (B) `parseDeliveryMilestonesComplete`가 Plan 셀에서 `.plan.md` 경로를 우선 추출(report 괄호 무시) |
| `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js` | UPDATE | (C) `pickShipReceipt` null 시 `opts.gitCommitTime('.claude/plans/<basename>')` fallback. fail-open → null이면 기존 `날짜 미상` 유지 |
| `plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` | UPDATE | assertion `이정표 기록` → `마일스톤 기록` |
| `plugins/mccp/scripts/lib/renderer/tests/milestone-history.test.js` | CREATE | 신규 — pickShipReceipt 상관, git fallback(주입 resolver), planBasename(.plan.md) 추출, 용어 커버. 현재 전용 테스트 부재 |
| `plugins/mccp/scripts/derive/tests/plans.test.js` | UPDATE/CREATE | (A) 평문-경로 `Source PRD`도 `source_prd` 추출 검증(기존 테스트 있으면 case 추가, 없으면 최소 신규) |

## Tasks

### Task 1: 용어 통일 "이정표" → "마일스톤"
- **Action**: `markdown.js:32` `[이정표-기록](#이정표-기록)` → `[마일스톤-기록](#마일스톤-기록)`; `markdown.js:87` `## 이정표 기록` → `## 마일스톤 기록`; `html.js:315` `<h2>이정표 기록</h2>` → `<h2>마일스톤 기록</h2>`. id·class(`milestone-history`/`milestone-item`)는 영어이므로 불변.
- **Mirror**: 기존 markdown anchor 패턴(`[현황](#현황)` 등 한글 label=target 정합).
- **Validate**: `! grep -rn "이정표" plugins/mccp/scripts/lib/renderer/` (0건). 렌더 후 `grep -c "마일스톤 기록" .claude/cache/STATUS.md` ≥ 1.

### Task 2: (A) source_prd 평문-경로 매칭 + 경로 정규화 (Codex F1 absorption)
**2a — regex 확장 + wrapper strip (derive plans.js)**
- **Action**: `SOURCE_PRD_RE`를 링크 OR 평문 매칭으로 확장 후 **추출값을 정규화** — 마크다운 링크 `[..](path)`, inline-code 백틱 `` `path` ``, 따옴표 래퍼를 모두 strip. 평문 regex는 백틱/대괄호 leading char를 허용하되 strip 단계에서 제거(예: 추출 후 `.replace(/^[\s`'"\[]+|[\s`'"\]]+$/g,'')`). `source_prd`는 `{ label, path }` 유지 — 평문일 땐 `label=path`.
- **Mirror**: `derive/sources/plans.js:8` 명명 regex.

**2b — PRD 경로 해석 dual-path (milestone-history.js + plan-body.js) — F1 핵심**
- **근거(검증됨)**: 렌더러는 `source_prd.path`를 `path.resolve(path.dirname(planAbs), ref)` = **plan 디렉토리 기준**으로 resolve한다. 링크 `../prds/x.prd.md`는 정상이지만 평문 repo-root `.claude/prds/x.prd.md`는 `.claude/plans/.claude/prds/...`로 **이중화**돼 파일 미존재 → fail-open skip → discovery 실패. regex만 고치면 `source_prd.path`는 non-null이 되지만 discovery는 여전히 실패(validation false-pass).
- **Action**: PRD 경로 해석을 **dual-path**로 — plan-dir-relative(`path.dirname(planAbs)`) 시도 후 파일 미존재 시 repo-root-relative(`cwd`) 시도, 존재하는 쪽 채택. 둘 다 미존재 → fail-open skip(기존). `milestone-history.js:19` `findPrdSourcesFromPlans` + `plan-body.js:191` `parsePlanBody` 두 동일 패턴 모두 적용(공용 helper로 추출 권장).
- **Validate**: dashboard PRD가 *실제로 읽혀* M1이 렌더에 등장(단순 `source_prd.path` non-null 아님 — F1 권고). 링크-형태 v1-3-0 plan 회귀 0.

### Task 3: (B) planBasename + 정규화된 planPath 반환 — plan-body.js (Codex F2 absorption)
- **Action**: `parseDeliveryMilestonesComplete`가 `.plan.md`로 끝나는 첫 경로 토큰을 추출(마크다운 링크 target 또는 평문, `(report: …)` 괄호 무시) 후 **`{ name, planBasename, planPath }`** 반환 — `planPath`는 셀에 적힌 정규화 경로(wrapper strip, 디렉토리 정보 보존). 미발견 시 기존 첫-괄호 폴백.
- **근거(F2)**: basename만 보존하면 후속 git-log가 `.claude/PRPs/plans/completed/...` archived plan을 못 찾음(검증됨 — 해당 디렉토리에 archived plan 다수). 디렉토리 정보를 보존해야 git-log가 정확한 경로를 가리킴.
- **Mirror**: 동일 파일 `parseDeliveryMilestones:46-50` 링크 추출 + basename split.
- **Validate**: dashboard M1 `planBasename === 'dashboard-pipeline-chart.plan.md'` + `planPath === '.claude/plans/dashboard-pipeline-chart.plan.md'`(report 아님). 신규 테스트로 고정.

### Task 4: (C) git commit 시점 fallback — 정확한 planPath 해석 (Codex F2 absorption)
- **Action**: `opts.gitCommitTime` resolver 주입(기본 = `git log -1 --format=%cI -- <relPath>` via `child_process.execFileSync`, `cwd`=repo root, 모든 예외 → null). 행 루프에서 `pickShipReceipt` null이면 **Task 3의 `planPath`를 PRD-dir/repo-root dual 해석으로 resolve**(`.claude/plans/`, `.claude/PRPs/plans/completed/`, `../plans/` 모두 커버)한 뒤 그 정확한 경로로 git-log. **`'.claude/plans/' + basename` 재구성 금지**(F2). resolve 실패/미커밋 → null → 기존 `날짜 미상`(graceful floor).
- **Mirror**: 동일 파일 `opts.fsRead` 주입 + try/catch-continue fail-open(`:57`, `:64-65`).
- **Validate**: 렌더 후 `grep -c "날짜 미상" .claude/cache/STATUS.md` === 0(완료 plan 커밋 + planPath 해석 성공 기준). 주입 resolver 단위 테스트(receipt-우선, git-fallback, 둘 다 null→날짜 미상, completed/ 디렉토리 경로).

### Task 5: 테스트 — 신규 milestone-history.test.js + 회귀
- **Action**: `tests/milestone-history.test.js` 생성 — (a) receipt 존재 시 created_at 사용, (b) receipt 부재 + git resolver 반환 시 git 시점 사용, (c) 둘 다 null → `날짜 미상`, (d) planBasename = `.plan.md`(report 무시), (e) 출력에 "마일스톤"(섹션 제목은 markdown.js 책임이므로 여기선 item 렌더 확인). `four-part-rendering.test.js:150` assertion 갱신. plans.test.js에 평문-경로 case.
- **Mirror**: `renderer/tests/sections.test.js` fixture 주입 스타일.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/ plugins/mccp/scripts/derive/tests/` 전건 PASS.

## Validation

```bash
# 단위 + 통합 테스트 전건
node --test plugins/mccp/scripts/lib/renderer/tests/
node --test plugins/mccp/scripts/derive/tests/ 2>/dev/null || true

# 용어 통일 — 렌더 코드에 "이정표" 0건
grep -rn "이정표" plugins/mccp/scripts/lib/renderer/ && echo "FAIL: 이정표 잔존" || echo "OK: 이정표 0"

# 정확성 — 렌더 산출물에 "날짜 미상" 0건
node plugins/mccp/scripts/derive/cli.js render
grep -c "날짜 미상" .claude/cache/STATUS.md   # expect 0
grep -c "마일스톤 기록" .claude/cache/STATUS.md # expect >= 1

# source_prd 평문-경로 discovery 회복 (regex)
node plugins/mccp/scripts/derive/cli.js run --json | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));const p=(j.sources.plans.items||[]).find(x=>x.path&&x.path.includes("dashboard-pipeline-chart.plan.md"));console.log("source_prd:",p&&p.source_prd);'

# F1 강화 — source_prd.path non-null이 아니라 *PRD가 실제로 읽혀 렌더에 등장*하는지 확인
node plugins/mccp/scripts/derive/cli.js render
grep -c "게이트 스테이지 파이프라인 chart" .claude/cache/STATUS.md  # dashboard M1이 마일스톤 기록에 등장 (expect >= 1, 실제 날짜 동반)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| git fallback이 미커밋 worktree-local plan에서 빈 결과 → 여전히 날짜 미상 | 중 | graceful floor(기존 표시) 유지. dogfood repo의 완료 plan은 모두 커밋됨 → 실질 표시율 100%. 표시 자체가 loud(사용자가 날짜 미상 봄) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| `execFileSync` git 호출이 렌더 경로에 child_process 도입(현 dep-free 원칙) | 중 | milestone-history.js는 이미 fs IO 수행(순수 아님). resolver 주입 + fail-open으로 격리. derive 스키마/순수 source는 불변 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| source_prd regex 확장이 기존 링크-형태 매칭 회귀 | 저 | 링크 우선 시도 → 평문 폴백 순서. 기존 v1-3-0 plan 매칭 회귀 테스트로 가드 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| planBasename 추출 변경이 다른 셀 포맷(순수 링크) 회귀 | 저 | `.plan.md` 우선 + 기존 첫-괄호 폴백 유지. 마크다운 링크/평문/annotation 3 포맷 테스트 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| design-lint(H1-H16) 회귀 — 섹션 텍스트 변경 | 저 | 용어만 변경(구조 불변), accent/heading depth 영향 없음. 기존 design-invariants.test.js로 가드 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->

## Acceptance
- [ ] 모든 task 완료
- [ ] `node --test` renderer + derive 전건 PASS
- [ ] `grep "이정표" plugins/mccp/scripts/lib/renderer/` 0건
- [ ] 렌더 산출물 `날짜 미상` 0건 + "마일스톤 기록" 섹션 존재
- [ ] dashboard plan `source_prd.path` non-null(평문-경로 discovery 회복)
- [ ] 패턴 재사용(opts 주입 fail-open) — 새 추상화 미발명
- [ ] receipt/derive 스키마 불변(PRD scope 카브아웃 준수)

## Design Critique

- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` Output Constraints (4) Read 완료
- Trigger: detector positive (design_signal=true, html.js/markdown.js/STATUS.md whitelist hit)
- 라운드: 1 (R0)
- Verdict: **converged**
- 판정 근거: 본 plan의 design surface 델타는 (1) 섹션 제목·앵커 용어 통일(이정표→마일스톤 — Consistency 개선), (2) "날짜 미상"→git commit 시점(Visibility of System Status 개선, Design Principle 1 "Derive, don't author" 정합)뿐. 4 Output Constraints 위반 0 — 정보 위계(heading depth ## 불변), 강조색(신규 accent 0), raw marker(미도입), 항목 수(MAX_EXPANDED=5는 pre-existing flow/record log, 본 plan scope 밖, LOW 관찰만).

## Codex Adversarial Review

- 호출: `node …/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` design-scope split 활성)
- 라운드 수: 1 (R1, cap=1)
- classification: `ok` · verdict: `needs-attention` · blocking=0
- 합치 결론: Codex가 본 plan의 두 정확성 fix(A·C)에 **잠복 경로-해석 버그 2건**을 적발 — regex/basename만 고치면 validation은 통과하나 실제 discovery·날짜 복원은 여전히 실패. 두 finding 모두 검증 후 R1 absorption.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — 평문 source_prd가 렌더러의 plan-dir 기준 resolve로 이중 경로(`.claude/plans/.claude/prds/…`) → discovery false-pass | HIGH | ACCEPT_NOW | 검증됨(이중화 재현). Task 2b dual-path 해석 + wrapper strip + 렌더 등장 validation으로 absorb |
  | F2 — git fallback `'.claude/plans/'+basename`가 archived `.claude/PRPs/plans/completed/…` plan 미발견 → 날짜 미상 잔존 | HIGH | ACCEPT_NOW | 검증됨(completed/ 디렉토리 plan 다수). Task 3 `planPath` 반환 + Task 4 정확 경로 git-log로 absorb |

- Deferred to backlog: 0
- R2 escalation: 불필요 — 두 ACCEPT_NOW HIGH 모두 R1 plan 수정으로 완전 해소(escalate 조건 b 미충족)
- Open Questions: 없음 (auto-CRITICAL 0 — secret/data-loss/irreversible-migration/auth-bypass/external-dest/crypto 카테고리 해당 없음)
- Codex session 참조: threadId `019eefdc-977e-7280-a397-c747245ebdea`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (same session, 2 HIGH absorbed: F1 dual-path PRD resolution, F2 directory-preserving planPath + completed/ archive fallback). No new implement-time architectural decisions detected — 구현이 plan Tasks 2/3/4를 충실 이행, 외부 dep 0, files ⊆ Files to Change. Cross-gate dedupe applied.

### Design Review (impeccable, implement-mode)
- detect --mode implement: SKILL_AVAIL=1 SIGNAL=1 (html.js/markdown.js whitelist hit)
- 라운드: 1 (R0) · verdict: **converged**
- 근거: diff의 디자인 surface 델타 = `<h2>`/anchor 용어 "이정표→마일스톤" rename뿐. 신규 시각 surface·accent·정보 위계·항목 수 변경 0 → 4 Output Constraints 위반 0. plan-stage critique(converged)와 동일 델타.

### Security Reviewer
- N/A — read-side 렌더링/상관. `execFileSync('git', [array])` (shell 미경유, command injection 불가), 파일 write·user input·secret·auth surface 없음. path는 git log read-only + path.resolve(repo 내부)에만 사용.

- Deferred to backlog: 0
- Validation: renderer 312 + derive 68 = 380 test PASS · 마일스톤 섹션 날짜 미상 0건 · dashboard M1 표시 복원
