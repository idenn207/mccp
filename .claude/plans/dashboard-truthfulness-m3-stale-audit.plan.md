# Plan: Dashboard Truthfulness M3 — stale 평가 + 소스 최신화(해결 마커)

**Source PRD**: `.claude/prds/dashboard-truthfulness.prd.md`
**Selected Milestone**: M3 — 위험·질문 은퇴 + 마일스톤 lifecycle (재해석: 평가 기반 소스 최신화)
**Complexity**: Large

## Summary

M3 의 본질을 *render-side 숨김 휴리스틱*에서 **평가 기반 소스 최신화**로 재설계한다(사용자 결정 2026-06-24). 목적: "구조가 바뀌어 더 이상 필요 없어진 위험/질문을 *평가*해서 대시보드에 노출되지 않게". 세 부분:

1. **해결 마커 컨벤션 + 결정적 render**(foundation) — 위험/OQ 에 **비파괴 해결 마커**(OQ=`- [x]` + `<!--mccp:resolved …-->`, 위험=행에 `<!--mccp:resolved …-->`)를 단다. render 는 마커를 읽어 해결 항목을 메인에서 빼고 "해결됨" 접힘으로만 노출(되돌리기 가능). status/ledger *추정* 은퇴는 폐기 — 명시적 마커가 곧 Codex F1 이 인정한 "explicit row-level closed marker"라 추정 오판 0.
2. **`/mccp:dashboard-audit` 재사용 명령**(capability) — agent 가 active(미마커) 위험/OQ/마일스톤을 *현재 구조와 대조*해 `live | resolved | obsolete` 평가(증거 인용 필수), 제안 테이블을 사용자에게 제시(human-gate), 승인 시 결정적 applier 가 소스 `.md` 에 마커를 단다. 언제든 재실행 가능.
3. **마일스톤 lifecycle** — `VALID_STATUSES` 에 `dropped` 추가 + pending/dropped 를 마일스톤 패널 default-off 토글로 노출 + audit 가 stale in-progress 마일스톤 status 도 최신화("진행중=실제 1건").

평가(추론)는 agent 명령에만, render 는 결정적 마커 reader 로 분리 — 대시보드 derive/render 의 read-only·LLM-free·결정성 불변. 이번 cycle 에 명령을 현재 문서에 1회 dogfood 실행해 누적 항목을 정리한다.

> 셸·토큰·드로어·copy 톤은 이미 ship 된 콘솔 재설계(PR #57~#60) 계약을 따른다(미감 재탐색 없음).
>
> **PRD 정합**: PRD Risks "은퇴는 제거 아닌 접힘(되돌리기 가능)" 과 일치 — 마커는 비파괴(소스 행 보존, 주석/체크박스만 추가) + render 는 collapse(제거 아님). 단 PRD MVP 문구가 "ledger 스냅샷 기준 은퇴"라 **PRD 본문도 본 cycle 에 이 재설계 반영해 갱신**(아래 Task 9).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 비파괴 소스 편집(surgical, 검증) | `lib/completion-ledger/store.js:193-203` (`writeFileAtomic`) + `state/state-writer.js` (atomic + lock) | tmp+rename atomic, 편집 후 재-parse 검증, lock |
| 슬래시 명령 본문 구조(Phase + 게이트) | `commands/code-review.md` + `commands/milestone-close.md` | Phase map, 결정적 스크립트 + agent 추론 혼합, human-gate |
| agent 평가(증거 인용 review) | `agents/code-reviewer` (read+grep+증거) + skill `santa-method`(adversarial verify) | 항목별 verdict + 파일/근거 인용, 보수적 |
| 위험/OQ 본문 파서(fail-open) | `parsers/plan-body.js:96-134` (`parseOpenQuestions` 체크박스 정규식) + `:154-180` (`parseRisks`) | 정규식 섹션 추출, 체크박스 `[ xX]?`, fail-open |
| 항목 상한 — top-N + `<details>` 접힘 | `sections/risks.js:73-85` + `milestone-history.js:248-259` | 상위 N + `+N 더보기`/토글 접힘, html/md |
| 비-색 severity/상태 마커 | `parsers/severity-meta.js` (`severityMeta().icon` + `sevBadgeHtml`) | 색+아이콘 이중표기 |
| Delivery Milestones 표 파서 | `parsers/plan-body.js:75-94` + `:136-152` | `parseTableRows` + status 소문자 |
| planBody 후처리(섹션 전, fail-open) | `index.js:84-92` (`dedupOQAndRisks` wiring) | parsePlanBody 직후 mutate, 섹션은 결과 소비 |
| 순수 마커 파서 + 단위 테스트 | `parsers/decision-state.js`/`next-action.js` (read-side 순수) | model-only 순수 함수, 다중 export |

## Files to Change

### Foundation — 해결 마커 + 결정적 render
| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/resolution-marker.js` | CREATE | 순수 마커 컨벤션: `RESOLVED_RE`(`<!--mccp:resolved( reason="…")?( at="…")?-->`) + `isResolved(text)` + `stripMarker(text)`(display 용) + `extractMeta(text)`(reason/at). OQ 체크박스 `[x]` 도 resolved 로 간주 |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE | `parseOpenQuestions` 가 `resolved`(체크박스 `[x]` OR 마커) 반환 + `parseRisks` 가 행 마커 감지해 `resolved` 반환·display 텍스트는 `stripMarker`. `VALID_STATUSES` 에 `'dropped'` + `parseDeliveryMilestonesLifecycle` 신설(pending/dropped, 링크 무관) |
| `plugins/mccp/scripts/lib/renderer/parsers/resolution-classify.js` | CREATE | `annotateResolution(planBody)` — risk/OQ 각 항목에 `resolved:boolean` 전파(마커 기준, status/ledger *추정* 폐기). 순수·fail-open |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE | dedupe 직후 `annotateResolution(planBody)` wiring(try/catch fail-open) |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | active(미해결) 메인 + resolved 트레일링 `<details>`("해결됨 N건", 드로어 유지). panel count=active. 마커는 `stripMarker` 후 표기 |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATE | plan-OQ resolved 전파(STATE.md OQ 는 항상 active) + active 메인 + resolved 접힘 |
| `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js` | UPDATE | lifecycle(pending/dropped) 행을 완료-기록 early-return *앞*에서 수집 → default-off `<details>` 토글(비-색 상태 마커) |

### Capability — `/mccp:dashboard-audit` 재사용 명령
| File | Action | Why |
|---|---|---|
| `plugins/mccp/commands/dashboard-audit.md` | CREATE | 슬래시 명령 본문 — Phase: enumerate(script) → evaluate(agent, 증거 인용) → propose+human-gate → apply(script) → render. 평가 rubric(live/resolved/obsolete) + 보수 default(증거 없으면 live) |
| `plugins/mccp/scripts/lib/stale-audit/enumerate.js` | CREATE | 결정적 — active(미마커) 위험/OQ/마일스톤 목록 + 안정 ref(source plan + ordinal/lineNumber + 텍스트) `--json`. `parsePlanBody`/`extractRisksAndOpenQuestions` 재사용, 마커 항목 제외 |
| `plugins/mccp/scripts/lib/stale-audit/apply.js` | CREATE | 결정적 비파괴 applier — ref+reason 받아 소스 `.md` 에 마커 삽입(OQ=`[ ]`→`[x]`+주석, 위험=행 끝 주석, 마일스톤=PRD status flip+사유 주석). idempotent(`isResolved` 가드) + atomic + **편집 후 재-parse 검증**(표 무손상) |
| `plugins/mccp/scripts/lib/stale-audit/index.js` | CREATE | facade — enumerate/apply + ref↔소스 위치 resolve. loud fail-open |
| `plugins/mccp/scripts/lib/stale-audit/tests/enumerate.test.js` | CREATE | active 추출·마커 제외·source ref 안정성·fail-open |
| `plugins/mccp/scripts/lib/stale-audit/tests/apply.test.js` | CREATE | OQ 체크/위험 행 주석/마일스톤 flip + idempotency + 표 재-parse 무손상 + 오매칭 skip |

### Tests / docs / version
| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/tests/resolution-marker.test.js` | CREATE | 마커 정규식·isResolved·stripMarker·extractMeta·체크박스 |
| `plugins/mccp/scripts/lib/renderer/tests/resolution-classify.test.js` | CREATE | 마커 항목 resolved·미마커 active·STATE.md OQ active·fail-open |
| `plugins/mccp/scripts/lib/renderer/tests/milestone-lifecycle.test.js` | CREATE | lifecycle 파서(pending/dropped/링크없음)+토글 default-collapsed+비-색 마커+완료0 케이스 |
| `plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js` | UPDATE | dropped status + 체크박스 resolved + 위험 행 마커 parse |
| `plugins/mccp/scripts/lib/renderer/tests/sections.test.js` | UPDATE | risks/OQ active·resolved 분할(해결 항목 메인 미노출·접힘) |
| `plugins/mccp/scripts/lib/renderer/tests/milestone-history.test.js` | UPDATE | lifecycle 토글 렌더(완료+pending/dropped 공존, 완료0) |
| `plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js` | UPDATE | 해결 접힘 + lifecycle 토글 html↔md 동등 |
| `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` | UPDATE | 신규 `<details>` 항목 상한·raw marker·강조색 ≤1 |
| `docs/v1.3.0-observability/dashboard-surface.md` | UPDATE | 해결 마커 컨벤션 + audit 명령 surface + lifecycle 토글 문서화 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.18.4 → 1.18.5` |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer `v1.18.4 → v1.18.5` (line 895) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer `v1.18.4 → v1.18.5` (line 112) |
| `CHANGELOG.md` | UPDATE | 신규 row |
| `.claude/prds/dashboard-truthfulness.prd.md` | UPDATE | M2 `in-progress→complete` + M3 `pending→in-progress` + Plan cell + MVP/메트릭 문구를 "평가 기반 소스 최신화(해결 마커)"로 갱신(재설계 반영) |

## Tasks

### Task 1: 해결 마커 컨벤션 (resolution-marker.js) — table-safe (Codex F1/F2)
- **Action**: 순수 모듈. `RESOLVED_RE = /<!--\s*mccp:resolved(?:\s+reason="([^"]*)")?(?:\s+at="([^"]*)")?\s*-->/`. 함수:
  - `isResolved(rawLine)` — **`<!--mccp:resolved-->` 마커 존재만**(Codex F1: bare `[x]` 는 resolved 아님 — 일반 체크박스가 평가·증거·승인 없이 live OQ 숨기는 것 차단).
  - `stripLineMarker(rawLine) → { line, resolved, meta }` (Codex F2 핵심) — **표 셀 split 이전 raw 라인 단위**로 trailing 마커를 추출·제거해 cleaned line 반환. 마커가 `|` 뒤에 와도 phantom 셀이 되지 않음. `meta={reason, at}`.
  - `stripMarker(text)` — display 용 마커 제거 + 공백 정리(rendered surface 누출 0, Constraint 3).
  - `escapeMarkerReason(s)` (Codex F2) — applier 가 reason 쓰기 전 `|`→`/`, `"`→`'`, `-->`→`- >`, 개행 제거 + 길이 cap. 마커 속성이 표/주석 파싱을 깨지 않음을 보장.
  - throw 안 함.
- **Mirror**: `parsers/severity-meta.js`(순수 read-side) + `action-prompt.js#cleanArg`(마커 정리).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/resolution-marker.test.js` (마커 정규식 + bare `[x]` 미인정 + 행끝 마커 strip + reason 에 `|`/`"`/`-->` 포함 케이스).

### Task 2: plan-body 파서 확장 (resolved + dropped + lifecycle) — marker-only (Codex F1/F2)
- **Action**:
  - `parseOpenQuestions`: 각 라인을 `stripLineMarker` 로 전처리 → cleaned line 에서 텍스트 파싱 + `resolved = isResolved(rawLine)`(**마커만**, bare `[x]` 미인정 — Codex F1). 체크박스 상태는 표기용으로만 보존(resolved 신호 아님).
  - `parseRisks`: `## Risks` 섹션 각 표 라인을 **`parseTableRows` 호출 *이전*** `stripLineMarker` 로 전처리(Codex F2 — 행끝 마커가 phantom 셀 안 되게) → cleaned line 으로 셀 split + row 별 `resolved` flag + `risk` 텍스트는 이미 마커 제거됨.
  - `VALID_STATUSES` 에 `'dropped'` 추가. `parseDeliveryMilestonesLifecycle(prdBody)` 신설(`{name, outcome, status, planPath, planBasename}`, 링크 무요구). 기존 반환 키 불변(additive).
- **Mirror**: `plan-body.js:55-73`(`parseTableRows` — 전처리 라인 주입) + `:96-180`(파서들) + `:136-152`(complete 구조).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js` (dropped + 마커 resolved + **bare `[x]` 미인정** + 행끝 마커가 셀 깨지 않음).

### Task 3: resolution-classify + index wiring
- **Action**: `resolution-classify.js#annotateResolution(planBody)` — risk/OQ 항목 `resolved` flag 전파(마커 기준만, status/ledger 추정 없음). STATE.md OQ(source 없음)는 섹션에서 항상 active. `index.js` dedupe 직후 try/catch wiring.
- **Mirror**: `index.js:83-92`(dedupe wiring) + `decision-state.js`(순수).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/resolution-classify.test.js`

### Task 4: risks.js / open-questions.js active·resolved 분할
- **Action**: 각 섹션을 `resolved` 로 분할 — active 메인(기존 정렬·top-3·접힘) + resolved 트레일링 `<details class="more">`("해결됨 N건"). 항목 텍스트는 `stripMarker` 적용(raw marker 미노출, Constraint 3). 드로어 detail 유지. panel count=active. md 동등. active 0 이면 "미해결 없음" + resolved 접힘.
- **Mirror**: `risks.js:70-91` + `open-questions.js:110-126`.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/sections.test.js`

### Task 5: milestone-history lifecycle 토글 (early-return 앞 파싱)
- **Action**: lifecycle(pending/dropped) 수집을 완료-기록 `return null` *앞*으로 + early-return 조건 `merged.length===0 && lifecycleRows.length===0`. lifecycle 비면 생략, 아니면 완료 기록 뒤 default-off `<details>`("미진행 마일스톤 N건 · 표시", pending=◌ 예정 / dropped=⊘ 폐기, 비-색 이중표기). md 동등.
- **Mirror**: `milestone-history.js:199`(early return) + `:247-259`(`<details>` md+html).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/milestone-history.test.js milestone-lifecycle.test.js`

### Task 6: stale-audit lib (enumerate + apply, 결정적)
- **Action**:
  - `enumerate.js`: `parsePlanBody` 로 위험/OQ + `parseDeliveryMilestones`(+lifecycle) 로 마일스톤 수집, **미마커(active)만** + 안정 ref `{kind:'risk'|'oq'|'milestone', source, ordinal|lineNumber, text, status?}`. `--json`. complete/dropped 마일스톤 항목 우선 정렬(가장 stale 후보) + `--limit` cap.
  - `apply.js`: ref+reason 받아 비파괴 마커 삽입. **마커 placement = 행/항목 라인 끝, 단일 컨벤션**(Codex F2): OQ 라인 끝 `<!--mccp:resolved reason="…" at="ISO"-->`(체크박스 `[x]` 는 표기용 부수, **resolved 신호는 마커**), 위험 표 행 끝(최종 `|` 뒤) 마커, 마일스톤 PRD status flip(`in-progress`→`complete`/`dropped`) + 사유 주석. reason 은 `escapeMarkerReason` 통과(`|`/`"`/`-->` 제거).
    - **lost-update 방지(Codex F3)**: per-file lock(`withLedgerLock` 패턴) + **content-hash compare-and-swap** — 파일 read 시 hash 캡처, rename 직전 재-read 해 hash 불일치 시 abort. **파일당 모든 승인 마커를 1 트랜잭션**(read once → 전 마커 apply → 검증 → write once)으로 batch.
    - **idempotent**(`isResolved` 시 skip) + atomic(tmp+rename) + **편집 후 `parseRisks`/`parseOpenQuestions`/`parseDeliveryMilestones` 재-parse 로 표 무손상 검증**(실패 시 rollback+에러). ref 오매칭(`stripLineMarker` 후 정규화 텍스트 불일치) 시 skip+경고.
  - `index.js` facade.
- **Mirror**: `completion-ledger/store.js:168-232`(`withLedgerLock`+atomic+검증+fail-open) + `plan-body.js`(파서 재사용).
- **Validate**: `node --test plugins/mccp/scripts/lib/stale-audit/tests/` (idempotency + 표 재-parse 무손상 + 행끝 마커·reason 특수문자 + **hash-mismatch abort** + 오매칭 skip).

### Task 7: `/mccp:dashboard-audit` 명령
- **Action**: `commands/dashboard-audit.md` 작성. Phase: (0) enumerate script 로 active 항목 로드. (1) **evaluate** — 항목별 `live|resolved|obsolete` 판정, **증거 인용 필수**(해결=mitigation 구현/결정/commit 인용, obsolete=참조 구조 소멸 인용, 미확실=live 보수 default). complete/dropped 마일스톤 항목 우선 + per-run cap. (2) **propose+human-gate** — 제안 테이블(item·verdict·reason·evidence) 제시 후 사용자 승인 대기(파괴적 아님이나 소스 편집이므로 게이트). (3) **apply** — 승인 항목만 `apply.js`. (4) **render** — `derive/cli.js render` 재실행. 비-승인·live 는 무변경.
- **Mirror**: `commands/milestone-close.md`(게이트형 명령) + `code-review.md`(증거 review).
- **Validate**: 명령 본문 dry-run 일관성 + enumerate→apply→render 통합 smoke(fixture).

### Task 8: 테스트 전체 + 디자인 lint
- **Action**: 신규 테스트(resolution-marker/classify, milestone-lifecycle, stale-audit enumerate/apply) + 갱신(plan-body-parser, sections, milestone-history, markdown-equivalence, output-constraints). **headline 회귀**:
  - (a) 마커 단 위험/OQ 가 메인 미노출·"해결됨" 접힘 + 마커가 rendered surface 에 누출 안 됨(`stripMarker`).
  - (b) 마커 *없는* 항목은 milestone status 가 complete 여도 active 유지(추정 은퇴 0).
  - (c) **Codex(재설계) F1**: `- [x] 질문`(mccp:resolved 마커 없음)이 active 유지(bare 체크박스 미인정).
  - (d) **Codex(재설계) F2**: 행끝 마커가 표 셀 안 깨뜨림 + reason 에 `|`/`"`/`-->` 포함해도 parse·extract 정상.
  - (e) **Codex(재설계) F3**: apply hash-mismatch(read 후 파일 변경) 시 abort + 파일당 batch 트랜잭션 + idempotency + 표 재-parse 무손상 + 오매칭 skip.
  - (f) STATE.md OQ 항상 active.
  - (g) dropped 마일스톤 토글 안에서만(default 숨김) + 완료0·lifecycle만 PRD 렌더.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/` + `…/stale-audit/tests/` (전체 0 회귀).

### Task 9: dogfood + 문서 + version + PRD 갱신
- **Action**: 본 cycle 에 `/mccp:dashboard-audit` 를 **현재 문서에 1회 실행**(human-gate 승인)해 누적 stale 위험/OQ 정리(230 해소 dogfood). `dashboard-surface.md` 에 마커 컨벤션·audit 명령·lifecycle 문서화. plugin.json `1.18.4→1.18.5` + 양 footer. CHANGELOG. PRD: M2→complete, M3→in-progress+Plan cell, **MVP/Success-Metrics 문구를 "평가 기반 소스 최신화(해결 마커)"로 갱신**(ledger-스냅샷-은퇴 → 마커-기반-은퇴 재설계 반영).
- **Mirror**: §3.7 milestone patch bump.
- **Validate**: `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"`===`1.18.5` + footer grep + render 후 `grep -c "해결됨" .claude/cache/status.html`.

## Validation

```bash
# 신규 모듈 단위
node --test plugins/mccp/scripts/lib/renderer/tests/resolution-marker.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/resolution-classify.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/milestone-lifecycle.test.js
node --test plugins/mccp/scripts/lib/stale-audit/tests/

# 분할/lifecycle/파서 회귀
node --test plugins/mccp/scripts/lib/renderer/tests/sections.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/milestone-history.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js

# 동등본 + 디자인 제약
node --test plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js

# 전체 렌더러/derive 스위트 (0 회귀)
node --test plugins/mccp/scripts/lib/renderer/tests/
node --test plugins/mccp/scripts/derive/tests/

# end-to-end — audit dogfood 후 render 노출 확인
node plugins/mccp/scripts/lib/stale-audit/enumerate.js --json | head -c 400
node plugins/mccp/scripts/derive/cli.js render
grep -c "해결됨" .claude/cache/status.html
grep -c "미진행 마일스톤" .claude/cache/status.html

# version/footer
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"
grep -n "v1.18.5" plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| agent 평가 오판(live 를 resolved 로 마킹) | 중 | **human-gate**(제안 테이블 사용자 승인 필수) + **증거 인용 강제**(해결/obsolete 근거 없으면 live) + **비파괴 마커**(소스 행 보존, 마커 제거로 되돌리기) + render 는 collapse(제거 아님) |
| status 추정으로 미해결 위험 은닉(Codex F1 재발) | 저 | **status/ledger 추정 은퇴 완전 폐기** — render 는 *명시적 마커*만 본다. 마커 부재=무조건 active. F1 의 "explicit row-level closed marker" 직접 채택 |
| bare `[x]` 체크박스가 평가/승인 없이 OQ 숨김 — **Codex(재설계) F1** | 중 | resolved 신호는 **`<!--mccp:resolved-->` 마커만** — bare `[x]` 미인정. `- [x] 질문`(마커 없음)이 active 유지함을 테스트로 보증 |
| apply 가 markdown 표를 깨뜨림 / 마커 누출 — **Codex(재설계) F2** | 중 | **셀 split 이전 라인 단위 `stripLineMarker`**(phantom 셀 0) + 단일 placement(행 끝) + `escapeMarkerReason`(`|`/`"`/`-->` 제거) + 편집 후 재-parse 검증(실패 시 rollback) + reason 특수문자 테스트 |
| 동시 apply/사용자 편집으로 lost-update — **Codex(재설계) F3** | 중 | per-file lock + **content-hash compare-and-swap**(rename 직전 재-read, 불일치 abort) + **파일당 1 트랜잭션 batch**. atomic rename 단독 의존 폐기 |
| ref 오매칭(텍스트 drift 로 엉뚱한 행 마킹) | 중 | enumerate↔apply 동일 파서 + `stripLineMarker` 후 정규화 텍스트 exact 매칭 + 불일치 시 skip+경고(편집 안 함) |
| 평가 비용(항목 다수 × LLM) | 중 | complete/dropped 마일스톤 항목 우선 + per-run `--limit` cap + 재사용 명령이라 분할 실행 가능 |
| render 가 LLM-free 결정성 위반 | 저 | 평가는 **명령(agent)에만**, render 는 마커 reader(결정적). 두 레이어 분리 — derive/render 무-LLM 불변 |
| lifecycle-only PRD early-return 으로 미렌더(Codex F3) | 중 | lifecycle 파싱을 early-return 앞 + `merged===0 && lifecycle===0` 만 null. zero-completed 테스트 |
| 기존 render 테스트 대량 회귀 | 중 | 섹션 return 키 불변(additive) + 깨지는 assert 동반 갱신(Task 8) + 전체 0 회귀 게이트 |

## Acceptance
- [ ] 모든 task 완료
- [ ] Validation 전부 통과 (신규 + 전체 회귀 0)
- [ ] **headline**: 해결 마커 단 위험/OQ 가 메인에서 사라지고 "해결됨" 접힘으로만 노출(비파괴·되돌리기 가능)
- [ ] **headline(F1)**: resolved 신호는 `<!--mccp:resolved-->` 마커만 — bare `[x]`·milestone status 는 은퇴 안 함(마커 없으면 active)
- [ ] **headline(F2)**: 행끝 마커가 셀 split 이전 strip 되어 표 무손상 + reason 의 `|`/`"`/`-->` escape + 마커 rendered surface 비누출
- [ ] **headline(F3)**: apply 가 per-file lock + content-hash CAS + 파일당 batch 로 lost-update 방지 + idempotent + 재-parse 무손상 + 오매칭 skip
- [ ] **headline**: `/mccp:dashboard-audit` 가 active 항목 평가(증거 인용)→human-gate→비파괴 마커 적용, 재실행 가능
- [ ] **headline(lifecycle)**: dropped 수용 + pending/dropped default-off 토글 + stale in-progress 마일스톤 status 최신화로 진행중=실제
- [ ] dogfood — 현재 문서 1회 실행해 누적 stale 정리(230 해소)
- [ ] STATE.md OQ 는 항상 active(마커 미적용)
- [ ] STATUS.md plain-text 동등본 — 해결 접힘·lifecycle 토글 동등 노출
- [ ] SKILL Output Constraints 4종 + 평가/render 레이어 분리(LLM-free render 불변)
- [ ] plugin.json + 양 footer v1.18.5 + PRD 재설계 반영 갱신

## Open Questions

> Codex R1 검토 완료(아래 ## Codex Adversarial Review). 3 findings(HIGH×2/MEDIUM×1) 전부 R1 흡수.

- **(결정) 평가 vs render 분리**: 추론(평가)은 `/mccp:dashboard-audit` agent 명령에만, render 는 결정적 마커 reader. derive/render 의 read-only·LLM-free 불변 보존 — "각 항목 실제 구현 확인"은 본질상 추론이라 render 파이프라인 부적합. <!--mccp:resolved reason="설계 결정 확정 — 평가는 dashboard-audit 명령에만, render는 결정적 마커 reader (M3-a 구현 완료)" at="2026-06-24T18:19:29.030Z"-->
- **(해소·F1) 마커가 유일 진실원**: resolved 신호는 **`<!--mccp:resolved …-->` 마커만**. bare `- [x]` 는 resolved 아님(일반 체크박스가 평가·승인 없이 OQ 숨기는 것 차단). 체크박스는 applier 가 부수적으로만 설정. <!--mccp:resolved reason="Codex 재설계 R1 F1 흡수 — resolved 신호는 마커만이며 bare 체크박스 미인정 (resolution-marker.js isResolved 구현+테스트)" at="2026-06-24T18:19:29.030Z"-->
- **(해소·F2) table-safe 마커**: **셀 split 이전 라인 단위 `stripLineMarker`** 로 마커 추출·제거(phantom 셀 0) + 단일 placement(행/항목 라인 끝) + `escapeMarkerReason`(`|`/`"`/`-->` 제거). raw markdown 렌더 비노출(`stripMarker`) + 삭제로 되돌리기. <!--mccp:resolved reason="Codex 재설계 R1 F2 흡수 — 셀 split 이전 stripLineMarker + escapeMarkerReason로 table-safe (plan-body/apply 구현+테스트)" at="2026-06-24T18:19:29.030Z"-->
- **(해소·F3) lost-update 방지**: atomic rename 단독 의존 폐기 → per-file lock + content-hash compare-and-swap(rename 직전 재-read, 불일치 abort) + 파일당 1 트랜잭션 batch. <!--mccp:resolved reason="Codex 재설계 R1 F3 흡수 — per-file lock + content-hash CAS + 파일당 batch로 lost-update 방지 (apply.js 구현+테스트)" at="2026-06-24T18:19:29.030Z"-->
- **(결정) 빌드 형태**: 재사용 `/mccp:*` 명령(표준 capability) + 이번 cycle dogfood 1회. 일회성 스크립트 아님 — truthfulness 지속. <!--mccp:resolved reason="설계 결정 확정 — 재사용 /mccp:dashboard-audit 표준 명령으로 빌드 (commands/dashboard-audit.md 구현)" at="2026-06-24T18:19:29.030Z"-->
- **(결정) human-gate**: 소스 편집이라(파괴적 아니어도) 평가 제안→사용자 승인→적용. 자동 적용 안 함. <!--mccp:resolved reason="설계 결정 확정 — 소스 편집 human-gate 채택, 자동 적용 안 함 (dashboard-audit Phase 2 human-gate 구현)" at="2026-06-24T18:19:29.030Z"-->
- **(결정) lifecycle 배치**: 마일스톤 패널 내 default-off `<details>`(positional churn 회피) + early-return 앞 파싱. <!--mccp:resolved reason="설계 결정 확정 — 마일스톤 lifecycle를 패널 내 default-off 토글로 배치 (milestone-history.js 구현)" at="2026-06-24T18:19:29.030Z"-->
- **(defer) `⚠ Ledger mismatch` 전역 배너(PRD OQ #6)**: M4/후속. 마커-기반 은퇴엔 ledger drift 무관(마커가 SSoT).

## Design Critique

- 트리거: detector `design_signal=true` (Files to Change 에 `risks.js`/`open-questions.js`/`milestone-history.js`/`html.js`/`markdown.js` rendered surface 경로 다수 → whitelist hit). SKILL first-step Read 완료(`skills/frontend-design-direction/SKILL.md` `## Output Constraints`).
- verdict: **CONVERGED** (round 1/cap 2, `decideCritique` oracle). 승인된 콘솔 셸 위 content/data 변경(해결 접힘·lifecycle 토글) — 신규 시각 시스템 없음. 4 Output Constraints anchor 평가:
  1. **정보 위계 3단계** — active(L1 stack-list) → 해결 접힘·lifecycle 토글(L2 `<details>`) → 드로어 detail(L3). 신규 heading depth 0. ✓
  2. **강조색 ≤1** — 해결/lifecycle 은 quiet(접힘·neutral). 상태 마커는 비-색 아이콘+텍스트(◌ 예정 / ⊘ 폐기). loud accent 미추가. ✓
  3. **raw marker 금지** — **해결 마커는 HTML 주석(`<!--mccp:resolved-->`)이라 `stripMarker` 로 display 전 반드시 제거** + prose 는 `renderProseHtml` 경유. 마커가 rendered surface 에 절대 누출 안 됨(Constraint 3 직접 가드 — 누출 시 critique fail). ✓
  4. **한 화면 항목 상한** — 해결 위험/OQ·pending/dropped 모두 default-off `<details>` + active top-3 불변. ✓
- HIGH/CRITICAL/UNKNOWN finding 0 → R1 종료. 실제 rendered surface 검증(a11y·반응형·마커 비누출 실측)은 implement 단계 impeccable `audit`/`polish`.

## Design Routing Guide

routing mode: auto (effective at implement stage). 본 plan 은 rendered UI 가 아직 없어 plan 단계에서 impeccable 명령을 invoke 하지 않는다 — 아래는 implement 단계 design surface 작업용 체크리스트. content-detectable refine 은 diff signal positive 시만 auto invoke; mood 는 recommend 기본.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## 후속 스코프 (M3-b) — 위험·질문 진실성 표현 (탭·전용 사이드바·뱃지)

> 추가 2026-06-25 (사용자 피드백). M3-a(해결 마커 + 결정적 render)는 *데이터*를 truthful하게 만들었으나 *표현*이 여전히 오해를 유발한다. 본 스코프는 그 표현 gap을 닫는다. 디자인 결정은 impeccable로 진행(아래 Design Routing).

### 진단 (관측된 사실)

- **위험 "250개" 착시**: 위험 패널이 active 41건 위에 트레일링 `<details>`로 **"해결됨 243건"** 큰 숫자를 메인 흐름에 그대로 노출 → 서비스가 250개 위험을 안은 것처럼 보임(불안). 실제 active=41, resolved=243(enumerate 검증). active 41 중 일부는 이미 ship된 plan(`v1-4-0-multi-session-m1`[PR #43], `v1-0-1-axis-k-pr-phase-guard`) 잔여 위험 → dogfood 누락분.
- **미해결 질문 "40개" 착시 + 오노출**: OQ 패널이 active 8 + "해결됨 30건"을 함께 노출 → ~40 미해결로 보임. 그런데 **active 8건 전부가 본 M3 plan 자신의 *결정 로그***(`dashboard-truthfulness-m3-stale-audit.plan.md:209-216`, 7건 `(결정)`/`(해소·F1/F2/F3)`, 1건 `(defer)`) — 진짜 미해결 질문은 사실상 0. `## Open Questions` 헤딩 아래 결정 로그가 "미해결 질문"으로 parse되는 게 근본 원인.

### 목표

미해결(active)만 기본 노출 + 완화/해결 이력은 GitHub PR 페이지식 **탭** 뒤로 + 빈 상태 문구 + OQ 진실성(결정 로그 ≠ 미해결) + 좌측 nav에 **미해결 질문 전용 entry** + 각 섹션 **카운트 뱃지**. 콘솔 셸 계약(PR #57~#60: oklch 토큰·드로어·비-색 마커·카드 비중첩)은 불변.

### Files to Change (후속)

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | 트레일링 `해결됨 N건 <details>` → active/resolved **탭** split. empty state 문구. resolved 카운트는 탭 label로만(메인 흐름 비노출) |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATE | risks.js와 동형 탭 + empty state. 결정 로그 인식(아래 Task 13) |
| `plugins/mccp/scripts/lib/renderer/parsers/tabs.js` | CREATE | CSS-only 탭 빌더(순수 함수) — radio+label, 패널당 unique name, a11y(role=tablist/tab/tabpanel 또는 radio+label 패턴), html+md 동등. 단일 SSoT로 risks/OQ 공유 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | (1) nav-rail `위험·질문` 단일 entry → `위험` + `미해결 질문` 2 entry split + 각 nav-link **count 뱃지**(비-색 neutral). (2) `route-attention` → `route-risks` + `route-questions` 분리(CSS :target routing + topbar title). (3) 탭 CSS(`.tabs`/`.tab`/`.tabpanel`). footer 버전 |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | (변경 없음) | 접근 A 확정으로 render-side 접두 인식 미채택 — parser 무변경(marker-only 원칙 유지) |
| `plugins/mccp/scripts/lib/stale-audit/apply.js` | UPDATE | (Codex M3-b F4) `withFileLock` lock 획득 실패 시 fail-closed(편집 폐기·aborted 반환). 현 fail-open(경고 후 진행)이 lost-update 구멍 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | 탭 → md 동등(미해결 본문 + "완화됨 N건" 접힘). footer 버전 |
| `plugins/mccp/scripts/lib/renderer/tests/*` | UPDATE/CREATE | tabs.test.js 신규 + sections/markdown-equivalence/output-constraints/i18n 갱신 |
| `plugins/mccp/.claude-plugin/plugin.json` + 양 footer | UPDATE | `1.18.5 → 1.18.6` |
| `CHANGELOG.md` + `.claude/prds/dashboard-truthfulness.prd.md` | UPDATE | M3 outcome 확장 + OQ 결정-로그 finding 반영 |

### Tasks (후속)

#### Task 10: active/resolved 탭 빌더 + 위험 패널 적용 (impeccable layout)
- **Action**: `parsers/tabs.js` 순수 빌더 신설 — CSS-only(hidden radio + `:checked` 형제 선택자, JS 의존 0; static/SSH 서빙 견고). 패널당 unique `name`(섹션 키 기반). `risks.js`의 트레일링 `해결됨 N건 <details>`를 폐기하고 패널 head에 탭 스트립(`미해결 N` default-checked · `완화됨 M`) + 두 tabpanel(active top-3+더보기 / resolved). resolved 큰 숫자는 탭 label에만 노출(메인 흐름 제거). 색 토큰 신규 0(Constraint 2).
- **Mirror**: `risks.js:84-115`(현 분할) + `severity-meta.js`(순수) + 셸 `html.js` CSS 블록.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/tabs.test.js sections.test.js`

#### Task 11: empty state 문구
- **Action**: active=0 시 미해결 탭에 `발견된 위험이 없습니다.` / `미해결 질문이 없습니다.`(현 "미해결 위험 없음" 대체, 톤 정중). resolved 탭은 그대로 접근 가능. active 0 & resolved 0 시 단일 빈 문구.
- **Mirror**: `risks.js:25-30, 86-88`.
- **Validate**: sections.test.js (empty 케이스).

#### Task 12: nav 전용 질문 entry + 위험/질문 route 분리 + 섹션 뱃지 (impeccable shape/layout)
- **Action**: `html.js` nav-rail `위험 · 질문` 단일 링크 → `위험`(→`#route-risks`) + `미해결 질문`(→`#route-questions`) 2 링크. 각 nav-link에 active count **뱃지**(neutral/비-색, 0이면 미표시 또는 `0`). `route-attention` 분리: `route-risks`(위험 패널) + `route-questions`(OQ 패널). CSS :target routing 규칙·topbar title·default-route(`:not(:has(.route:target)) #route-overview`) 동반 갱신. 모바일 반응형 nav 유지.
- **Mirror**: `html.js:255-272`(routing CSS) + `:831-836`(nav-rail) + `:849-860`(topbar title) + `:884-887`(route section).
- **Validate**: render → `grep "route-questions"` + nav 뱃지 count + 기존 routing 테스트 갱신.

#### Task 13: OQ 진실성 — 결정 로그 ≠ 미해결 질문 (접근 A 확정, 사용자 2026-06-25)
- **Action**: **접근 A — audit 마커(marker-only 원칙 유지)**. `/mccp:dashboard-audit`를 OQ에 재실행해 `(결정)`/`(해소)` 접두 7건을 증거(접두사 + plan 수렴 + 본문 인용)와 함께 human-gate 승인 후 resolved 마커링. 진짜 `(defer)` 1건은 active 유지. resolved 신호는 명시 마커뿐 — M3-a Codex F1 원칙 불변(render-side 접두 휴리스틱 미도입). 추가로 이미 ship된 plan(`v1-4-0-multi-session-m1`[PR #43]·`v1-0-1-axis-k-pr-phase-guard`) 잔여 active 위험도 같은 audit 재실행으로 정리(잔여 dogfood). **render-side parser 변경 없음** — `plan-body.js`의 `(결정)`/`(해소)` 접두 인식(접근 B)은 채택 안 함(원칙 보존).
- **Mirror**: M3-a `resolution-classify.js` + `stale-audit/{enumerate,apply}.js` + `commands/dashboard-audit.md`(human-gate).
- **Validate**: audit 후 render → 미해결 질문 탭에 결정 로그 미노출(active OQ ≈ defer 1건) + 위험 active 축소. `node --test …/stale-audit/tests/` 회귀 0.

#### Task 13b: stale-audit apply.js lock fail-closed (Codex M3-b F4 흡수)
- **Action**: `apply.js#withFileLock`가 lock 획득 실패(`!acquired`) 시 **현재처럼 경고 후 편집 진행하던 것을 폐기** → aborted file result 반환 + `fn()`(applyFile) 미호출(fail-closed). content-hash CAS는 2차 방어, lock 보유가 1차 — Task 13 audit 재실행이 같은 경로를 다시 타므로 동시 audit/사용자 편집 lost-update를 실제로 차단. caller(command/index)는 aborted를 skip+경고로 surface.
- **Mirror**: `apply.js:59-73`(현 fail-open 분기) + `completion-ledger/store.js`(lock 패턴).
- **Validate**: `node --test plugins/mccp/scripts/lib/stale-audit/tests/apply.test.js` — lock 선점 상태에서 apply 호출 시 **write 0**(파일 무변경) + aborted result 회귀 테스트 추가.

#### Task 14: STATUS.md 동등본 + 테스트 전체
- **Action**: 탭 → md 동등(미해결 본문 + `완화됨 N건` 접힘, drawer-detail SSoT 불변). markdown-equivalence/output-constraints/i18n/sections 갱신 + tabs.test.js. 0 회귀.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/*.test.js` + `derive/tests/`.

#### Task 15: impeccable audit/polish + design critique
- **Action**: 탭/뱃지/사이드바/empty-state를 impeccable `shape`(탭 패턴) → `layout`(패널 내 배치) → `critique`(§3.9 retry loop) → `audit`/`polish`(a11y: 탭 키보드 네비·focus·role, 반응형). SKILL Output Constraints 4종 충족 검증.
- **Validate**: critique CONVERGED + output-constraints lint 0 신규 위반.

#### Task 16: version + 문서
- **Action**: plugin.json `1.18.5 → 1.18.6` + 양 footer + CHANGELOG row + PRD(M3 outcome 확장 + OQ 결정-로그 finding).
- **Validate**: version grep + footer grep + 렌더 후 `grep -c "완화됨" .claude/cache/status.html`.

### Risks (후속)

| Risk | Likelihood | Mitigation |
|---|---|---|
| CSS-only 탭 a11y(키보드/스크린리더) 미흡 | 중 | radio+label 패턴 + 적절한 ARIA(role=tab/tabpanel 또는 label-as-tab) + impeccable audit 검증 + STATUS.md plain-text fallback 동등 |
| route 추가가 기존 CSS :target routing 회귀 | 중 | default-route/active-state/topbar-title 규칙 동반 갱신 + render smoke + 기존 routing 테스트 갱신 |
| 탭 → md 동등 깨짐 | 중 | md는 `완화됨 N건 <details>`로 매핑(기존 패턴 재사용) + markdown-equivalence 테스트 |
| OQ 접두 인식이 marker-only 원칙(Codex F1) 약화 | 중 | **Open Question으로 명시** — 접근 A(audit 마커, 원칙 유지)를 default 추천, B(접두 인식)는 Codex 승인 시만 |
| 섹션 뱃지 카운트가 색 경쟁(Constraint 2 위반) | 저 | neutral 뱃지(강조색 0) + 색은 severity 마커만 |
| (Codex M3-b F4) audit apply가 lock 미보유로 lost-update | 중 | `withFileLock` fail-closed(Task 13b) — 획득 실패 시 편집 폐기·aborted 반환 + 동시성 회귀 테스트(write 0) |

### Open Questions (후속)

- **(결정·2026-06-25) OQ 진실성 접근 = A (audit 마커)**: `/mccp:dashboard-audit`로 결정-로그를 증거+human-gate로 resolved 마커링. marker-only 원칙(Codex F1) 유지 — render-side 접두 인식(B) 미채택. render parser 무변경.
- **route 분리 vs 단일 route 내 2 패널**: nav를 `위험`+`질문` 2 entry로 쪼갤지(사용자 요청 "전용 사이드바"), 아니면 단일 `위험·질문` route 유지하고 패널 뱃지만 추가할지. 사용자 요청은 전용 entry → route 분리를 default.
- **탭 구현**: CSS-only radio(JS 0, 권장) vs 최소 JS. static/SSH 서빙·견고성 위해 CSS-only default.

### Design Routing Guide (후속, implement 단계 invoke)

routing mode: auto. 본 후속 스코프는 rendered surface(risks.js/open-questions.js/html.js/markdown.js) 직접 변경 → implement 단계에서 impeccable 실제 invoke. discovery `shape`(탭 패턴) → refine `layout`/`typeset` → evaluate `critique`(§3.9 loop)·`audit` → polish `polish`. a11y는 PR 단계 a11y-architect auto-invoke(rendering_surface=true).

### Design Critique (후속, plan 단계 텍스트 평가)

- 트리거: detector `design_signal=true`(risks.js/open-questions.js/html.js/markdown.js rendered surface). SKILL first-step Read 완료(`## Output Constraints`). 실제 impeccable invoke는 implement(Task 15).
- verdict: **CONVERGED** (텍스트 평가, M3-a 선례). 승인된 콘솔 셸 위 content 재배치(탭·뱃지·route 분리) — 신규 시각 시스템 없음. 4 Output Constraints anchor:
  1. **정보 위계 3단계** — 미해결(L1) → 탭 전환 완화됨(L2) → 드로어 detail(L3). 신규 heading 0. ✓
  2. **강조색 ≤1** — 탭/뱃지 neutral(강조색 미추가). resolved 카운트는 quiet label. severity 마커만 색. ✓
  3. **raw marker 금지** — 탭 label/뱃지는 escapeHtml 평문 + 본문 prose는 renderProseHtml. `<!--mccp:resolved-->`는 stripMarker. ✓
  4. **한 화면 항목 상한** — 미해결 탭 top-3 + 더보기 불변. 완화됨은 탭 뒤(default 미노출). ✓
- HIGH/CRITICAL/UNKNOWN 0 → 종료. 실측 a11y(탭 키보드 네비)·반응형은 implement impeccable `audit`/`polish`.

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.18.2/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` design-scope preamble)
- 라운드 수: 1 (R1에서 3건 전부 ACCEPT_NOW 흡수 — plan 개정으로 미해소 ACCEPT_NOW HIGH/CRITICAL 0 → R2 미발동)
- 합치 결론: Codex verdict=`needs-attention` (non-blocking, classification=ok). 재설계의 marker·source-edit 안전성 gap 3건 지적 — 전부 타당. R1 흡수.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 bare `- [x]` OQ 를 resolved 로 보면 마커 계약 우회 — 일반 체크박스가 평가·증거·승인 없이 live OQ 숨김 | HIGH (0.96) | ACCEPT_NOW | resolved 신호를 **`<!--mccp:resolved-->` 마커로 한정**, bare `[x]` 미인정. `- [x] 질문`(마커 없음) active 유지 회귀. Task 1/2/8 개정 |
  | F2 위험/마일스톤 마커가 table-unsafe — 행끝 주석이 phantom 셀, reason 의 `|`/`"`/`-->` 가 파싱·추출 깨뜨림 → 행 소멸/마커 누출 | HIGH (0.88) | ACCEPT_NOW | **셀 split 이전 라인 단위 `stripLineMarker`** + 단일 placement + `escapeMarkerReason` + 특수문자 테스트. Task 1/2/6/8 개정 |
  | F3 atomic rename 은 lost-update 미방지 — 동시 apply/사용자 편집이 서로 덮어씀 | MEDIUM (0.84) | ACCEPT_NOW | per-file lock + **content-hash compare-and-swap**(rename 직전 재-read) + 파일당 1 트랜잭션 batch. Task 6/8 개정 |
- Deferred to backlog: 0
- Open Questions: 없음 (3건 모두 R1 흡수, severity HIGH/MEDIUM — auto-CRITICAL 없음)
- Codex session 참조: threadId `019ef8be-3884-73d1-aedc-8c4ac416feb9`

## Codex Adversarial Review (M3-b, 2026-06-25)

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed wrapper, v0.2.2, `--impeccable-available` design-scope preamble)
- 라운드 수: 1 (R1에서 actionable F4 흡수 — 미해소 ACCEPT_NOW HIGH/CRITICAL 0 → R2 미발동, cap=1)
- 합치 결론: Codex verdict=`needs-attention` (non-blocking, classification=ok). Codex가 **working-tree diff**를 리뷰(plan 본문 아님) → F1/F2/F3/F5는 "코드가 아직 M3-b 미구현"을 결함으로 보고했으나 **plan 단계라 미구현이 정상**(각 Task 10/12/13/16이 implement 단계 구현 예정). F4는 기존 M3-a `apply.js`의 진짜 lost-update 구멍 → R1 흡수(Task 13b).
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 tabs 미구현(트레일링 `<details>` 잔존) | HIGH (0.96) | REJECT_YAGNI | plan 결함 아님 — Task 10이 구현 예정. Codex가 working-tree(미구현)를 결함으로 오인. |
  | F2 route split·뱃지 미구현 | HIGH (0.97) | REJECT_YAGNI | plan 결함 아님 — Task 12가 구현 예정. 동일. |
  | F3 approach A 미적용(결정-로그 OQ 마커 없음) | HIGH (0.92) | REJECT_YAGNI | plan 결함 아님 — Task 13이 implement 단계 human-gate audit로 적용. plan 단계엔 미적용이 정상. |
  | F4 `apply.js#withFileLock` lock 획득 실패 시 경고만+편집 진행 → lost-update | HIGH (0.86) | **ACCEPT_NOW** | 기존 M3-a 코드 진짜 버그(`apply.js:68-71`). fail-closed(abort)로 수정 + 동시성 회귀 테스트. **Task 13b 신설**. |
  | F5 version 1.18.5→1.18.6 미반영 | MEDIUM (0.99) | REJECT_YAGNI | plan 결함 아님 — Task 16이 implement 단계 bump 예정. plan 단계엔 미bump 정상. |
- Deferred to backlog: 0
- Open Questions: 없음 (F4 R1 흡수, severity HIGH — auto-CRITICAL catalog 해당 0). F1/F2/F3/F5는 plan이 기술한 *미구현 작업 자체*이지 결함이 아님(Codex target=working-tree quirk).
- Codex session 참조: threadId `019efaad-1022-75f3-9e6e-c573b42e7cc4`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
