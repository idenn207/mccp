# Plan: Dashboard Truthfulness M4 — 메인 표현 정리 (타임라인 더보기 · 위험/질문 복사 대칭)

**Source PRD**: `.claude/prds/dashboard-truthfulness.prd.md`
**Selected Milestone**: M4 — 메인 표현 정리
**Complexity**: Small

## Summary

대시보드 메인 흐름의 *표현*을 정리한다(데이터는 M1~M3에서 이미 truthful). 세 가지 비대칭/잡음을 닫는다:

1. **타임라인 더보기** — `audit-timeline.js`는 상위 20행만 렌더하고 나머지는 `+N older` 카운트(muted 각주)로만 노출 → 접근 불가. risks/OQ 의 `top-N + <details class="more">+N 더보기` 패턴을 타임라인에도 적용해 나머지 행을 *접힘으로 접근 가능*하게 한다.
2. **미해결 질문 = 복사 버튼만** — OQ 메인 항목이 `inline-prompt` 안에 `<code>{전체 명령}</code>` + 복사 버튼을 둘 다 노출(verbose). 전체 명령 텍스트는 이미 드로어 detail(`detail.action`)에 있으므로 **메인에서는 복사 버튼만** 남기고 상세는 드로어로 위임.
3. **위험에 복사 버튼 추가** — risk 메인 항목엔 복사 버튼이 없다(드로어 action엔 이미 존재). OQ와 대칭이 되도록 메인에 복사 버튼을 추가한다. 결과: 위험/질문 메인이 동일 affordance(severity badge → 본문 → meta-cue → 복사 버튼, 상세는 드로어).

기존 복사 인프라(`data-copy` 글로벌 핸들러 + `#ic-copy` 심볼 + 드로어 `.copy-btn` 제외 가드)와 드로어 detail SSoT(`buildRiskDetail`/`buildOQDetail` 가 이미 `detail.action` 세팅)를 **재사용**한다. 신규 시각 시스템·신규 색 토큰 0. 콘솔 셸 계약(PR #57~#63: oklch 토큰·드로어·비-색 마커·카드 비중첩) 불변.

> **PRD 정합**: PRD M4 row("타임라인 '더보기' + 미해결질문은 메인에 복사 버튼만(상세는 드로어) + 위험에 복사 버튼 추가")와 1:1. 이 milestone이 dashboard-truthfulness PRD의 **마지막 milestone** — 종료 시 plugin.json minor 정리(§3.7).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| top-N + `<details>` 더보기 (html+md) | `sections/risks.js:84-96, 124-128` + `open-questions.js:127-138, 162-166` | active top-3 → `<details class="more"><summary>+N 더보기</summary>` + md `<details>` 매핑 |
| 메인 복사 버튼 (icon + data-copy) | `open-questions.js:93-97` (현 inline-prompt) + `html.js:694-695, 715-716` (next-action 복사) | `<button class="copy-btn" data-copy="{cleaned}" aria-label="…"><svg><use href="#ic-copy"/></svg>` |
| 글로벌 클립보드 핸들러 | `html.js:570` (`COPY_SCRIPT`) + `:594` (드로어 `.copy-btn` 제외 가드) | `[data-copy]` delegate copy + `data-copied=1` 1.5s. 드로어 trigger 는 `.copy-btn` closest 시 skip |
| action 텍스트 SSoT | `parsers/action-prompt.js#buildActionPrompt` + `drawer-detail.js#buildRiskDetail/buildOQDetail` (`detail.action`) | `cleanArg`(마커/em-dash 강등) → `fullText`, 드로어 action 행 + md `다음 액션` |
| 타임라인 행 렌더 + detailMap | `sections/audit-timeline.js:134-220` (`renderRow`, `auditRows.forEach`) | 행별 `data-detail-id` + `audit-line` connector(`isLast`) + footnote(audit-note) |
| md plain-text 동등 (drawer SSoT) | `risks.js:117-134` + `open-questions.js:156-172` + `drawer-detail.js#renderDetailMd` | 미해결 본문 + `<details>` 접힘, action 은 `renderDetailMd` 의 `다음 액션` 행 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | UPDATE | 상위 N행 expanded + 나머지(cap 내)를 `<details class="more">+N 더보기` 접힘(html+md). `+N older`(cap 초과)·archived 각주·detailMap·rail connector 보존. **+ (시각-검토 후속 진실성) `decision_id` 전체 보존 — 이전 `tail(…,24)`는 공유 prefix 를 잘라 단어 중간이 깨졌다(`dashboard-truthfulness-` → "lness-…"). html 은 CSS ellipsis(`.audit-dec` prefix-truncate, `.pipe-id` 동형) + `title` 툴팁, md/드로어는 full id** |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATE | 메인 항목에서 `inline-prompt`의 `<code>{fullText}</code>` 제거 → 복사 버튼만. 전체 텍스트는 드로어 `detail.action`(불변)·md `renderDetailMd`(불변) |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | 메인 항목에 복사 버튼(`data-copy={ap.fullText}`) 추가 — OQ와 대칭. `ap` 는 이미 빌드됨(drawer action 용) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | 위험/질문 메인 복사-affordance CSS(필요 시 `.li-action`/기존 `.copy-btn` 재사용) + footer 버전 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer 버전 동기화 |
| `plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` | UPDATE | OQ 메인=복사버튼만(`<code>` 미노출) + Risk 메인=복사 버튼 present + 타임라인 더보기 |
| `plugins/mccp/scripts/lib/renderer/tests/a11y-aria-labels.test.js` | UPDATE | risk 복사-btn aria-label 추가 + OQ "복사 버튼만" 단언 갱신(주석 "risks no longer carry…" 반전) |
| `plugins/mccp/scripts/lib/renderer/tests/section-fidelity.test.js` | UPDATE | OQ anatomy 에서 `inline-prompt`(verbose) → 복사-affordance class 로 교체 |
| `plugins/mccp/scripts/lib/renderer/tests/audit-timeline-snapshot.test.js` | UPDATE | 타임라인 더보기(top-N + `<details>` + cap 초과 `+N older`) 회귀 |
| `plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js` | UPDATE | 타임라인 더보기 html↔md 동등 + OQ/risk md 불변(action 보존) |
| `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` | UPDATE | 신규 타임라인 `<details>` 항목 상한(Constraint 4) + 강조색 ≤1(복사 버튼 neutral) |
| `plugins/mccp/scripts/lib/renderer/sections/pipeline.js` | UPDATE | (시각-검토 후속 진실성) active stage 가 receipt 없는 frontier(missing)면 "PR 대기"/"구현 대기", in-progress receipt(active)면 "PR 검토 중"/"구현 중" — PR 미생성인데 "PR 검토 중" 거짓 표기 제거 |
| `plugins/mccp/scripts/lib/renderer/tests/pipeline.test.js` | UPDATE | active-stage 대기/중 구분 회귀 3건 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.18.6 → 1.18.7` (단일 milestone patch — §3.7 conservative default. Codex R1 F2: PRD 미완 상태에서 minor 는 시기상조) |
| `CHANGELOG.md` | UPDATE | 신규 row |
| `.claude/prds/dashboard-truthfulness.prd.md` | UPDATE | M4 `pending → in-progress`(plan 시작) + Plan cell, ship 시 `complete`. **+ M3 row `in-progress → complete`(Codex R1 F2 — #63 squash `ab0c6ce`로 이미 ship, PRD Status 가 stale. dashboard lifecycle 토글이 이 Status 를 읽으므로 truthfulness 직결)** |
| `docs/v1.3.0-observability/dashboard-surface.md` | UPDATE | 타임라인 더보기 + 위험/질문 복사-대칭 surface 문서화 |

## Tasks

### Task 1: 타임라인 더보기 (audit-timeline.js) — global-isLast 보존 (Codex R1 F1)
- **Action**: `renderAuditTimeline` 에 `TIMELINE_EXPANDED`(default 8, 결정은 impeccable layout) 도입. 렌더 순서(`liveShown` + `archivedShown` 합친 `auditRows`)에서 상위 `TIMELINE_EXPANDED`는 메인 `<ol class="timeline">`, 나머지(현 `MAX_ROWS` cap 이내)는 `<details class="more"><summary>+N 더보기</summary><ol class="timeline">…</ol></details>`로 접힘.
- **불변 보존 (Codex R1 F1 흡수 — connector + footnote 컨테이너)**:
  1. **`isLast` 는 *전체 capped 시퀀스* 기준 단일 계산** — 두 컨테이너로 쪼개도 `.audit-line` connector 는 *진짜 글로벌 마지막 행* 1개만 생략한다. 마지막 expanded 행은 (collapsed 행이 남아 있으면) connector 를 **유지**해 rail 이 접힘으로 이어지는 시각 연속성을 보존. `audit-timeline.js:202`(`railLine = isLast ? '' : connector`)를 그룹-로컬이 아니라 `i === auditRows.length - 1`(현 글로벌 인덱스, `:220`)에 묶인 채로 둔다. expanded 마지막 행 ≠ 글로벌 마지막.
  2. **footnote 컨테이너 재정의** — 현 archived/`+N older`/mask/was_stale/gap 각주는 단일 `<ol>` 안 `<li class="audit-note">` 였다(`:225-285`). 2분할 시 이들을 메인 `<ol>` *안*에 두면 collapsed 행보다 *앞*에 와 순서가 깨진다(F1). → 각주를 **두 `<ol>`(expanded + collapsed) 모두 끝난 뒤** 별도 `<ul class="audit-notes">` 컨테이너로 이동(`<ol>` 밖, valid list 구조). md 각주도 collapsed `<details>` 뒤로. 순서: expanded `<ol>` → collapsed `<details><ol>` → 각주 `<ul>`.
  3. `MAX_ROWS`(30) cap 초과분은 기존대로 `+N older` muted 각주(접힘 안에서도 도달 불가한 진짜 older).
  4. **detailMap 은 모든 렌더 행에 적재**(접힘 여부 무관) — 드로어 trigger==detail 등식(H18) 보존.
  - md: 상위 N 본문 + `<details>\n<summary>+N 더보기</summary>` 접힘 + 각주는 접힘 뒤(risks md 패턴 동일).
- **Mirror**: `risks.js:84-96`(html 더보기) + `:124-128`(md 더보기) + `audit-timeline.js:202`(railLine) + `:218-236`(현 forEach + older 각주).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/audit-timeline-snapshot.test.js` (8 expanded + `<details class="more">` + **boundary connector**: 마지막 expanded 행 connector 유지·글로벌 마지막 행만 생략 + **각주 순서**: archived/older/mask 가 collapsed 행 *뒤* + cap 초과 `+N older` 공존).

### Task 2: OQ 메인 = 복사 버튼만 (open-questions.js)
- **Action**: `renderItem` 의 `promptHtml` 에서 `<code>{escapeHtml(ap.fullText)}</code>` 노출을 제거하고 복사 버튼만 남긴다. wrapper class 는 `inline-prompt`(verbose 명령 동반 의미) 대신 경량 `li-action`(복사 affordance 전용)로 교체 — `<div class="li-action"><button class="copy-btn" data-copy="{escapeHtml(ap.fullText)}" aria-label="다음 액션 복사"><svg…#ic-copy></button></div>`. drawer detail(`detail.action`)·md(`renderDetailMd` 의 `다음 액션`)는 **무변경** → 전체 명령은 드로어/STATUS.md 에서 그대로 접근. `data-copy` 는 `escapeHtml`만(escapeAttr URL-encode 회피, 기존 규약).
- **Mirror**: `open-questions.js:92-97`(현 inline-prompt) + `html.js:694-695`(copy-btn markup).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js section-fidelity.test.js` (OQ html 에 `<code>` 명령 미노출 + `copy-btn`/`data-copy` present + 드로어 action 불변).

### Task 3: 위험 메인 복사 버튼 추가 (risks.js)
- **Action**: `renderItem` 에서 이미 빌드한 `ap`(buildActionPrompt, drawer action 용)를 메인 복사 버튼으로도 노출. `li-main` 끝(meta-cue 뒤)에 OQ와 **동일 markup**(`<div class="li-action"><button class="copy-btn" data-copy="{escapeHtml(ap.fullText)}" aria-label="…">…</button></div>`). aria-label 은 위험 톤("다음 액션 복사" 통일 — OQ와 동일 고정 문자열로 대칭). md 무변경(drawer SSoT 의 `다음 액션`이 이미 md 노출). active/collapsed/resolved 항목 모두 동일 경로(renderItem) → 일관.
- **Mirror**: Task 2 OQ markup + `risks.js:41-78`(renderItem).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js a11y-aria-labels.test.js` (risk html 에 `copy-btn`/`data-copy`/aria-label present).

### Task 4: 복사 버튼 클릭이 드로어를 열지 않음 (회귀 가드)
- **Action**: 드로어 wiring(`html.js:594`)의 `if(e.target.closest('.copy-btn'))return` 가드는 이미 risk/OQ `li`(data-detail-id) 내부 복사 버튼을 커버한다 — **신규 코드 불필요**, 단 테스트로 명시 고정. 위험/질문 `li` 가 `data-detail-id`(드로어 trigger)이면서 내부 `.copy-btn`을 가지는 케이스에서 (1) li 클릭=드로어 open, (2) 복사 버튼 클릭=드로어 미open(copy만)을 단언.
- **Mirror**: `html.js:588`(드로어 action 복사 버튼 — 동일 패턴이 이미 작동) + `:594`(가드).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/drawer.test.js` (구조 단언; 클립보드는 jsdom-free 환경이라 markup-level 가드 단언).

### Task 5: html.js / markdown.js — CSS + footer
- **Action**: `.li-action`(복사 affordance 전용, 우측 정렬·여백 quiet) CSS 추가 또는 기존 `.inline-prompt .copy-btn` 규칙 재사용(neutral, 강조색 0 — Constraint 2). **`.audit-notes`(타임라인 각주 `<ul>` 컨테이너, Codex R1 F1) 최소 CSS** — 기존 `.audit-note` muted 행 톤 재사용(노드 없음). footer `v1.18.6 → v1.18.7`(html.js:929 + markdown.js:112). 복사 버튼은 기존 `.copy-btn` 토큰(hover/focus-visible/copied) 그대로 — 신규 시각 토큰 0.
- **Mirror**: `html.js:294-305`(.copy-btn) + `:396-400`(.inline-prompt).
- **Validate**: render smoke + footer grep.

### Task 6: 테스트 전체 + 디자인 lint
- **Action**: 갱신(four-part-rendering, a11y-aria-labels, section-fidelity, audit-timeline-snapshot, markdown-equivalence, output-constraints) + 신규 단언. **headline 회귀**:
  - (a) 타임라인 상위 N expanded + 나머지 `<details class="more">+N 더보기` 접힘 + cap 초과는 `+N older` (둘 공존) + 드로어 detail 은 접힘 행에도 적재 + **(Codex R1 F1)** 마지막 expanded 행 connector 유지·글로벌 마지막 행만 생략 + 각주(archived/older/mask/was_stale)가 collapsed 행 *뒤* `<ul class="audit-notes">`(valid list 구조).
  - (b) OQ 메인 = 복사 버튼만(전체 명령 `<code>` 미노출), 전체 텍스트는 드로어 action + STATUS.md md 에 보존.
  - (c) 위험 메인 = 복사 버튼 present(OQ와 대칭, aria-label 동일).
  - (d) 복사 버튼 클릭 ≠ 드로어 open (가드 단언).
  - (e) md 동등 — 타임라인 더보기 html↔md, OQ/risk md(action) 불변.
  - (f) Output Constraints 4종 — 타임라인 항목 상한(더보기), 복사 버튼 neutral(강조색 ≤1), raw marker 0(data-copy 는 cleanArg), 정보 위계 신규 heading 0.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/*.test.js plugins/mccp/scripts/derive/tests/*.test.js plugins/mccp/scripts/lib/stale-audit/tests/*.test.js` (557 baseline + 신규, 0 회귀).

### Task 7: impeccable audit/polish + 문서 + version + PRD
- **Action**: 메인 복사-affordance·타임라인 더보기를 impeccable `layout`(메인 행 내 복사 버튼 배치·우측 정렬) → `critique`(§3.9 retry loop) → `audit`/`polish`(a11y: 복사 버튼 focus/aria, 타임라인 접힘 키보드 도달, 반응형). `dashboard-surface.md` 갱신. plugin.json `1.18.6 → 1.18.7` + 양 footer(html.js:929 + markdown.js:112). CHANGELOG row. PRD M4 `pending→in-progress`(+ship 시 complete) + Plan cell + **M3 row `in-progress→complete`(Codex R1 F2 stale-status 정리)**.
- **Mirror**: §3.7 (단일 milestone patch, conservative default) + §3.10 (implement 단계 stage-aware routing).
- **Validate**: critique CONVERGED + output-constraints lint 0 신규 위반 + version/footer grep(`1.18.7`) + render 후 `grep -c "더보기" .claude/cache/status.html`.

## Validation

```bash
# 개별 모듈 (Node 24 — 디렉토리 인자 금지, glob 필수: node --test <dir> 는 MODULE_NOT_FOUND)
node --test plugins/mccp/scripts/lib/renderer/tests/audit-timeline-snapshot.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/a11y-aria-labels.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/section-fidelity.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/drawer.test.js

# 동등 + 제약
node --test plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js

# 전체 스위트 (557 baseline, glob 형식 — 디렉토리 인자 X)
node --test plugins/mccp/scripts/lib/renderer/tests/*.test.js plugins/mccp/scripts/derive/tests/*.test.js plugins/mccp/scripts/lib/stale-audit/tests/*.test.js

# end-to-end — 더보기/복사 노출 확인
node plugins/mccp/scripts/derive/cli.js render
grep -c "더보기" .claude/cache/status.html
grep -c "data-copy" .claude/cache/status.html

# version/footer
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"   # 1.18.7
grep -n "v1.18.7" plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 타임라인 `<ol>` 2분할이 rail connector(`audit-line`)·detailMap·각주 순서 깨뜨림 | 중 | connector 는 *접힘 그룹별* `isLast` 재계산 + detailMap 은 forEach 전 항목 적재(접힘 무관) + 각주(archived/mask/older)는 메인 `<ol>` 뒤 유지 + snapshot 테스트 회귀 |
| OQ `<code>` 제거가 STATUS.md/드로어에서 전체 명령 유실 | 저 | md 는 `renderDetailMd` 의 `다음 액션` 행(불변)·드로어는 `detail.action`(불변) — html 메인만 변경. md-equivalence 테스트로 보증 |
| 복사 버튼 클릭이 드로어 open 유발(이중 동작) | 저 | 기존 `.copy-btn` 제외 가드(`html.js:594`)가 이미 커버 — Task 4 가 테스트로 고정(신규 코드 0) |
| `inline-prompt`→`li-action` class 교체가 기존 anatomy 테스트 대량 회귀 | 중 | section-fidelity/four-part 의 깨지는 단언 동반 갱신(Task 6) + class 명만 변경, 복사 인프라(data-copy/ic-copy/COPY_SCRIPT) 불변 |
| 복사 버튼 추가가 강조색 경쟁(Constraint 2) / 항목 잡음(Constraint 4) | 저 | 기존 `.copy-btn` neutral 토큰 재사용(신규 색 0) + icon-only(텍스트 라벨 없음, aria-label만) + impeccable audit 검증 |
| plugin.json minor(1.19.0) vs patch(1.18.7) 판단 — Codex R1 F2 | 저 | **patch 1.18.7 확정** — §3.7 conservative default(애매하면 patch) + M1~M3 모두 1.18.x patch 일관 + PRD 미완(M4 in-progress) 상태에서 minor 는 "PRD 완료" cache-visible 신호를 조기 발행. PRD 완전 종료 시 minor 정리는 별도 hot-fix 후보 |
| Node 24 `node --test <dir>` MODULE_NOT_FOUND (기존 plan 검증 명령 stale) | 중 | 본 plan Validation 은 glob(`*.test.js`) 형식 사용 — 디렉토리 인자 금지를 명시 |

## Acceptance
- [ ] 모든 task 완료
- [ ] Validation 전부 통과 (557 baseline + 신규, 0 회귀)
- [ ] **headline(타임라인)**: 상위 N expanded + 나머지 `<details class="more">+N 더보기` 접힘으로 접근 가능 + cap 초과는 `+N older` + 드로어 detail 접힘 행에도 적재(H18)
- [ ] **headline(질문)**: OQ 메인 = 복사 버튼만(전체 명령 `<code>` 메인 미노출), 전체 텍스트는 드로어 + STATUS.md 보존
- [ ] **headline(위험)**: 위험 메인 = 복사 버튼 추가 → 위험/질문 메인 affordance 대칭(severity → 본문 → meta-cue → 복사 버튼)
- [ ] 복사 버튼 클릭 ≠ 드로어 open (가드 테스트)
- [ ] STATUS.md plain-text 동등본 — 타임라인 더보기 + OQ/risk action 보존
- [ ] SKILL Output Constraints 4종 + 콘솔 셸 계약 불변(신규 색 토큰 0, 복사 인프라 재사용)
- [ ] plugin.json + 양 footer v1.18.7 + PRD M4 row 갱신 + M3 row stale-status 정리(complete) + CHANGELOG

## Open Questions

- [x] 타임라인 `TIMELINE_EXPANDED` 상위 N 값(8 default 제안) — 활동 피드 특성상 risks/OQ 의 3보다 큼이 자연스러움. impeccable layout 단계 결정. <!--mccp:resolved reason="RESOLVED: 값 8로 결정, v1.18.7 M4 audit-timeline.js TIMELINE_EXPANDED=8 구현 + snapshot 테스트(8 고정). impeccable layout 단계 결정 반영." at="2026-06-30T07:31:16.863Z"-->
- [x] OQ/위험 메인 복사 버튼 — icon-only(aria-label) vs `복사` 텍스트 라벨 동반. 메인 잡음 최소화(Constraint 4) 위해 icon-only default 제안(드로어 action 은 `복사` 라벨 유지). <!--mccp:resolved reason="RESOLVED: 메인 복사 버튼 icon-only(aria-label) ship, 드로어 action은 복사 텍스트 라벨 유지. v1.18.7 M4 risks.js/open-questions.js li-action 구현." at="2026-06-30T07:31:16.863Z"-->
- [x] plugin.json 1.19.0(PRD 종료 minor) vs 1.18.7(patch) — **결정: 1.18.7 patch**(Codex R1 F2 흡수). §3.7 conservative default + PRD 미완 상태 minor 조기발행 회피. PRD 완전 종료 시 minor 정리는 별도 hot-fix 후보.

## Design Critique

- 트리거: detector `design_signal=true` (Files to Change 에 `audit-timeline.js`/`open-questions.js`/`risks.js`/`html.js`/`markdown.js` rendered surface 다수 → whitelist hit). SKILL first-step Read 완료(`skills/frontend-design-direction/SKILL.md` `## Output Constraints`).
- verdict: **CONVERGED** (round 1/cap 2, `decideCritique` oracle). 승인된 콘솔 셸(PR #57~#63) 위 content/affordance 정리(타임라인 더보기·복사 버튼 대칭) — 신규 시각 시스템·신규 색 토큰 0. 4 Output Constraints anchor 평가:
  1. **정보 위계 3단계** — 복사 버튼(primary action) → severity/meta-cue(status) → 드로어 detail(L3). 타임라인 더보기는 L2 `<details>`. 신규 heading depth 0. ✓
  2. **강조색 ≤1** — 복사 버튼은 기존 `.copy-btn` neutral 토큰 재사용(신규 accent 0). 더보기 quiet(접힘). severity 마커만 색(비-색 이중표기 계승). ✓
  3. **raw marker 금지** — `data-copy` 는 `cleanArg`(백틱/볼드/em-dash/MD0xx 강등)된 `fullText`. 메인 prose 는 `renderProseHtml` 경유. OQ `<code>` 제거는 오히려 raw marker 누출 위험 감소. ✓
  4. **한 화면 항목 상한** — 타임라인 더보기(top-N + `<details>`)가 Constraint 4 를 *직접 충족*(현 cap-only 각주 → 접힘 접근). risks/OQ top-3 불변. OQ verbose `<code>` 제거로 메인 잡음 추가 감소. ✓
- HIGH/CRITICAL/UNKNOWN finding 0 → R1 종료. 실측 rendered surface 검증(복사 버튼 a11y/focus, 타임라인 접힘 키보드 도달, 반응형)은 implement 단계 impeccable `audit`/`polish`.

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

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.18.6/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` design-scope preamble)
- 라운드 수: 1 (R1 에서 2건 전부 ACCEPT_NOW 흡수 — 미해소 ACCEPT_NOW HIGH/CRITICAL 0 → R2 미발동, cap=1)
- 합치 결론: Codex verdict=`needs-attention` (non-blocking, classification=ok). 타임라인 2분할의 connector/footnote 순서 안전성(F1) + PRD 미완 상태 minor bump 시기상조(F2) 2건 지적 — 둘 다 타당. R1 흡수.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 타임라인 `<ol>` 2분할 — 그룹-로컬 `isLast` 재계산이 마지막 expanded 행을 terminal 로 표시해 rail connector 단절 + 단일 `<ol>` 안 `<li>` footnote 가 collapsed 행보다 앞에 와 순서 깨짐/invalid list | MEDIUM (0.86) | ACCEPT_NOW | `isLast` 를 *전체 capped 시퀀스* 기준 단일 계산(글로벌 마지막만 connector 생략) + 각주를 두 `<ol>` 뒤 별도 `<ul class="audit-notes">` 로 이동 + boundary connector·각주 순서 snapshot 테스트. **Task 1/5/6 개정** |
  | F2 plugin.json `1.19.0` minor 가 PRD 미완(M4 in-progress, PRD M3 row 가 stale `in-progress`) 상태에서 "PRD 완료" cache-visible 신호를 조기 발행 | MEDIUM (0.95) | ACCEPT_NOW | §3.7 conservative default 따라 **`1.18.7` patch** 로 정정(M1~M3 1.18.x 일관) + 부수적으로 stale 한 PRD M3 Status 를 `complete` 로 정리(#63 ship 반영, dashboard lifecycle 토글이 읽는 truthfulness 직결). **Files-to-Change/Task 7/Risks/Open Questions 개정** |
- Deferred to backlog: 0
- Open Questions: 없음 (2건 모두 R1 흡수, severity MEDIUM — auto-CRITICAL catalog 해당 0)
- Codex session 참조: threadId `019efb0a-7469-7793-8051-46b6084eb416`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
