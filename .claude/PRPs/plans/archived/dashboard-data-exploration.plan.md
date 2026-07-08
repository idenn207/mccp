# Plan: Dashboard Data Exploration — M1 (PRD-수준 그룹핑 + PE 토대)

**Source PRD**: `.claude/prds/dashboard-data-exploration.prd.md`
**Selected Milestone**: M1 — PRD-수준 그룹핑 + PE 토대
**Complexity**: Medium

## Summary

대시보드의 고-volume 항목 리스트(위험·미해결 질문)를 **소속 PRD별 접힘 그룹**으로 묶어 표시한다. 그룹은 native `<details>`로 렌더되어 JS 없이도 동작(graceful degrade가 구조적으로 보장) — 항목당 `data-prd` 속성을 박아 M2(필터/정렬)·M3(검색)이 소비할 **PE 토대**를 깐다. 동시에 DESIGN.md의 "JS 0" invariant를 *routing은 CSS-only 유지, 데이터 탐색은 progressive-enhancement JS 허용*으로 개정해 H-invariant 충돌을 정리한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Section module | `plugins/mccp/scripts/lib/renderer/sections/risks.js:16` | `render<Name>(model, formatUtils, planBody)` → `{ md, html, foot, details, activeCount }` 반환 |
| Pure parser helper | `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js:345` | `parsers/` 모듈은 부수효과 없는 순수 함수, `module.exports` 명시 |
| Fail-open | `plugins/mccp/scripts/lib/renderer/index.js:20` | `safeSection` 패턴 — 섹션 throw 시 fallback `{md, html}`, 절대 전체 render 중단 안 함 |
| Stable detail key | `plugins/mccp/scripts/lib/renderer/sections/risks.js:71` | `data-detail-id` = `risk:<planPath>#r<ordinal>` 안정 키(정렬 무관) |
| Vendored-inline JS | `plugins/mccp/scripts/lib/renderer/html.js:12` | `fs.readFileSync(vendor/…)` 모듈-로드 1회 + inline `<script>`(외부 fetch 0 — H13) |
| Inline bespoke script | `plugins/mccp/scripts/lib/renderer/html.js:626` | `STALE_SCRIPT`/`COPY_SCRIPT`/`DRAWER_SCRIPT` — IIFE 문자열 상수, body 끝 `<script>` emit |
| Native `<details>` PE | `plugins/mccp/scripts/lib/renderer/html.js:352` (`.card-expand`) · `risks.js:148` (md `<details>`) | 접힘/펼침은 native — JS 없이 동작, JS는 부가 |
| Tests | `plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js` | `node --test`, 순수 함수 assertion, minimalModel 픽스처 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE | `parsePlanBody` 반환에 `planPrd` 맵(plan basename → `{ prdPath, prdLabel }`) 추가. 이미 로드하는 `prdBodies`에서 PRD H1 제목을 라벨로 추출. |
| `plugins/mccp/scripts/lib/renderer/parsers/prd-group.js` | CREATE | 순수 그룹핑 헬퍼 — `groupByPrd(items, planPrd)` → 결정적 순서의 `[{ prdKey, prdLabel, items }]` + `prdSlug(label)`(data-prd 값). STATE.md/미상은 "프로젝트 전역" 버킷. |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | active 패널 inner를 단일 `.stack-list` → PRD별 `<details class="prd-group">` 그룹으로. 각 `.li-item`에 `data-prd`. md는 PRD 라벨 줄로 그룹핑. |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATE | 동일 그룹핑. STATE.md OQ → "프로젝트 전역" 그룹. `data-prd` 속성 + md 그룹핑. |
| `plugins/mccp/scripts/lib/renderer/client/explore.js` | CREATE | PE 토대 client 스크립트 — `<html>`에 `data-js="on"` 마커(M2/M3 control 노출 hook) + 그룹 "모두 펼치기/접기" 토글(native `<details>` 위 부가). |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | `client/explore.js` 모듈-로드 read+inline(jQuery 미러), 그룹 존재 시 `<script>` emit. `.prd-group`/`> summary` CSS(neutral 토큰) + `[data-js="on"]` reveal hook. footer `v1.18.14 → 1.18.15`. |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATE | **H19** 추가 — 렌더된 inline `<script>` 본문의 network primitive(`fetch`/XHR/WebSocket/EventSource/`sendBeacon`/remote `import`/외부 URL 리터럴) 검출(Codex F1). H13(외부 src)과 직교. |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer `v1.18.14 → 1.18.15` 동기화(3.7 footer drift 방지). 그룹핑은 섹션 md가 이미 처리. |
| `DESIGN.md` | UPDATE | "Routing … JS 0" invariant 개정 + Progressive Enhancement 절 추가 + stale "3 route" → "5 route" 정정. |
| `docs/v1.3.0-observability/DESIGN.md` | UPDATE | H-contract canonical 문서 — 같은 invariant 텍스트 보유 시 미러 개정(grep 확인). |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `version` `1.18.14 → 1.18.15`(patch — PRD ③의 단일 마일스톤, §3.7). |
| `plugins/mccp/scripts/lib/renderer/tests/prd-grouping.test.js` | CREATE | 그룹 함수 + 섹션 그룹핑 + md 동등 + no-JS degrade + data-prd 속성 회귀 테스트. |
| `CHANGELOG.md` | UPDATE | v1.18.15 row 추가. |

## Tasks

### Task 1: PRD provenance 배선 (plan-body) — canonical-path 키 (Codex F2)
- **Action**: `parsePlanBody`가 이미 만든 `prdBodies` Map(prdAbs → body)에서 각 PRD의 `# H1` 제목을 추출(`findSection`/정규식)해 `prdLabelByPath`를 만들고, plans를 재순회해 `planPrd: Map(canonicalPlanPath → { prdPath, prdLabel, prdKey })`를 구성, 반환 객체에 `planPrd` 추가. **키는 canonical normalized plan path**(repo-root-relative + `/` 정규화 — basename 아님: archive/worktree 간 동명 plan 충돌 회피, Codex F2). `prdKey`는 normalized `prdPath`에서 파생한 **안정 식별자**(`data-prd` 값 — 라벨 slug 아님: 동일 H1 라벨 충돌 회피). `prdLabel`은 H1 **표시 텍스트 전용**, H1 부재 시 PRD 파일 stem(kebab) fail-open.
- **Mirror**: `plan-body.js:375` (prdBodies 루프), `extractPlanSummary`(섹션 추출 정규식), `extractCyclePrefix`(stable-id 파생 스타일).
- **Validate**: `node -e` 로 minimal model에 plan+source_prd 픽스처 주입 → `parsePlanBody(m).planPrd.get(<canonicalPath>).prdKey/prdLabel` 검증.

### Task 2: 순수 그룹핑 헬퍼 (prd-group.js) — path-keyed (Codex F2)
- **Action**: `groupByPrd(items, planPrd)` — 각 item의 `source`를 **canonical normalized path로 정규화**(Task 1과 동일 함수 공유)해 planPrd 조회, 그룹 버킷에 분배. 그룹 `data-prd`는 `entry.prdKey`(prdPath 파생 안정 식별자), 표시명은 `entry.prdLabel`. 미상/STATE.md는 "프로젝트 전역"(prdKey=`__global__`) 버킷, source-매핑 실패는 "출처 미상"(prdKey=`__unknown__`) 버킷. 그룹 순서 결정적(prdKey 기준 안정 정렬, `__global__`·`__unknown__`은 끝). 빈 입력/null planPrd는 단일 fallback 그룹(fail-open, 항목 누락 0 — 오귀속보다 단일 그룹이 안전).
- **Mirror**: `parsers/cross-section-dedupe.js`(순수 변환 모듈), `module.exports` 스타일.
- **Validate**: `node --test`로 그룹 순서/버킷 분배/fail-open + **충돌 케이스**(동명 basename 다른 디렉토리·동일 H1 라벨 두 PRD·source_prd 부재·PRD unreadable·STATE.md OQ) 단위 테스트(Codex F2).

### Task 3: 위험·질문 섹션 그룹핑 렌더
- **Action**: risks.js·open-questions.js의 active 패널 inner를 `groupByPrd`로 분할 → 각 그룹을 `<details class="prd-group" open data-prd="<slug>"><summary><span>PRD 라벨</span><span class="prd-count">N</span></summary><ul class="stack-list">…</ul></details>` 로 렌더. 각 `.li-item`에 `data-prd` 부여. md는 그룹마다 `**PRD 라벨 · N**` 평문 줄 + 항목(heading depth 증가 0 → H15 안전). resolved/historical 탭은 M1 범위 외(flat 유지). active 0이면 기존 empty-state.
- **Mirror**: `risks.js:113` (activeInner 구성), `risks.js:146` (md 빌드).
- **Validate**: `node plugins/mccp/scripts/derive/cli.js render` 후 `.claude/cache/status.html`에서 `.prd-group` 그룹 + `data-prd` 확인, STATUS.md에서 PRD 라벨 그룹 평문 확인.

### Task 4: PE 토대 client 스크립트 (explore.js) + html.js 배선
- **Action**: `client/explore.js` 생성 — IIFE: (1) `document.documentElement.setAttribute('data-js','on')`(M2/M3 JS-only control 노출 hook), (2) 그룹 "모두 펼치기/접기" 토글(`.prd-group` 일괄 `open` 제어). html.js가 모듈-로드 시 read+inline(jQuery 패턴 미러), `<details class="prd-group">` 존재 시 `<script>` emit. `.prd-group`/`.prd-group > summary`/`.prd-count` CSS + `[data-js="on"]`만 노출되는 control 컨테이너 reveal 규칙 추가(M2/M3 hook). reduced-motion 가드 준수.
- **Design constraint (critique LOW)**: `.prd-group > summary`·`.prd-count` 는 **neutral 토큰만**(`--muted`/`--border`/`--panel-2`) — accent/status 색 금지(강조색 viewport당 ≤1 보존). 그룹 chrome 은 hairline + muted 텍스트로 절제(PRODUCT.md "quiet by default").
- **Mirror**: `html.js:12` (JQUERY_SLIM read), `html.js:1061` (조건부 `<script>` emit), `html.js:626` (IIFE 상수).
- **Validate**: status.html에 `client/explore.js` 인라인 + `<script src>` 부재(H13) 확인. JS 제거(스크립트 strip) 시 모든 그룹/항목 가시 확인.

### Task 5: invariant 개정 (DESIGN.md)
- **Action**: DESIGN.md "Routing: … JS 0" 줄을 개정 — *routing은 CSS-only(`:target`+`:has()`) 유지, 데이터 탐색(그룹핑·필터·정렬·검색)은 progressive-enhancement JS(vendored-inline, 외부 fetch 0 — H13 보존), JS-off 시 전체 항목 노출(그룹은 native `<details>`)*. stale "3 route" → 실제 5 route(overview/pipeline/risks/questions/activity) 정정. `docs/v1.3.0-observability/DESIGN.md`에 동일 invariant 있으면 미러.
- **Mirror**: DESIGN.md:217 (Routing), :211 (drawer PE 서술 톤).
- **Validate**: `grep -n "JS 0\|3 route" DESIGN.md docs/v1.3.0-observability/DESIGN.md` → 잔존 0.

### Task 6: 버전 bump + footer 동기화 + CHANGELOG
- **Action**: plugin.json `1.18.14 → 1.18.15`. html.js page-foot(`v1.18.14`) + markdown.js(`· v1.18.14`) 2곳 → `1.18.15`. CHANGELOG.md row 추가.
- **Mirror**: §3.7 (footer-version drift 방지), 직전 마일스톤 CHANGELOG row.
- **Validate**: `grep -rn "1.18.14" plugins/mccp/scripts/lib/renderer/ plugins/mccp/.claude-plugin/` → 잔존 0.

### Task 7: inline-script network-primitive 가드 (Codex F1 — HIGH)
- **Action**: 신규 `client/explore.js`(및 모든 렌더된 inline `<script>` 본문)가 **런타임 network primitive를 포함하지 않음**을 mechanical 검증. H13은 외부 URL *surface*(`<script src=//>`)만 막고 스크립트 *본문*의 `fetch(`/`XMLHttpRequest`/`WebSocket`/`EventSource`/`navigator.sendBeacon`/remote `import(`/외부 URL 리터럴(`https?://`·`//host`)은 못 막는다 — raw-mode status.html 데이터 유출 경로. (1) `client/explore.js` 소스 자체를 스캔하는 단위 테스트 + (2) `output-constraints.js`에 **H19**(렌더된 HTML의 inline `<script>` 본문에서 network primitive 검출 시 violation) 추가 — `runOutputConstraints`가 이미 composed html을 받으므로 자연 확장. H19는 `<script src>`(H13) 와 직교. design-invariants 테스트가 H19 clean + drift fixture로 발화 검증.
- **Mirror**: `output-constraints.js:262` (H13 외부-fetch 룰 구조), `output-constraints.js:338` (H16 본문 스캔 + `<code>`/attr carve-out 스타일), `tests/design-invariants.test.js`(drift fixture 발화 패턴).
- **Validate**: explore.js에 `fetch('https://…')` 주입 시 H19 발화 + 테스트 RED, 제거 시 GREEN. 정상 explore.js(DOM-only)는 H19 clean.

### Task 8: 테스트 + 회귀 0
- **Action**: `tests/prd-grouping.test.js` 작성 — (a) groupByPrd 순서/버킷/fail-open + 충돌 케이스(Task 2), (b) 위험·질문 섹션 html에 `.prd-group`+`data-prd`(prdKey) 존재, (c) STATUS.md md에 모든 항목이 그룹 라벨 아래 평문 노출(no-JS 동등), (d) design-invariants(H1-H19) clean + H19 drift fixture 발화. 전체 렌더 스위트 회귀 0.
- **Mirror**: `tests/sections.test.js`, `tests/design-invariants.test.js`, `tests/markdown-equivalence.test.js`.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/` 전부 PASS, `design_constraint_violations` 빈 배열.

## Validation

```bash
# 1. 렌더러 전체 테스트(회귀 0)
node --test plugins/mccp/scripts/lib/renderer/tests/

# 2. 실제 산출물 렌더 후 그룹핑·data-prd·PE 확인
node plugins/mccp/scripts/derive/cli.js render
grep -c "prd-group" .claude/cache/status.html        # > 0
grep -c "data-prd" .claude/cache/status.html         # > 0
grep -c "<script src" .claude/cache/status.html      # 0 (H13 외부 src 0)
grep -cE "fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon" .claude/cache/status.html  # 0 (H19 network primitive 0)

# 3. no-JS degrade — script 블록 제거 후에도 전체 항목 가시(STATUS.md 평문 동등)
grep -c "프로젝트 전역\|위험\|질문" .claude/cache/STATUS.md  # 항목 그룹 평문 노출

# 4. invariant 잔재 0
grep -n "JS 0" DESIGN.md docs/v1.3.0-observability/DESIGN.md   # 개정 후 0 (또는 PE 문맥)

# 5. 버전 drift 0
grep -rn "1.18.14" plugins/mccp/scripts/lib/renderer/ plugins/mccp/.claude-plugin/plugin.json  # 0
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 새 그룹 마크업이 H15(heading ≤3)/H17(카드중첩) lint 위반 | 중 | `<summary>`+span(h4 미사용), `.prd-group`은 `.panel` 아님 → H17 무관. design-invariants 테스트로 mechanical 검증. |
| inline explore.js 후속 편집이 외부 fetch/exfiltration 도입(raw-mode 데이터 유출) | 중 | **Codex F1** — H13(외부 src)만으론 부족 → Task 7 H19가 inline `<script>` 본문의 network primitive를 mechanical 차단. |
| PRD provenance 충돌(동명 basename·동일 H1 라벨)로 *오귀속* | 중 | **Codex F2** — canonical plan path 키 + prdPath 파생 prdKey(라벨 slug 아님). 충돌 테스트(Task 2). |
| PRD provenance 부재(archived plan·STATE.md OQ·source_prd 없는 plan) | 중 | fail-open — "프로젝트 전역"/"출처 미상" 버킷, 항목 절대 누락 0(truthfulness 불변). |
| no-JS degrade 미검증 | 저 | 그룹핑이 native `<details>` → JS 0으로 동작(구조적 보장) + script-strip 회귀 테스트. |
| M1에 M2/M3 control(필터/정렬/검색) 과조기 도입 | 중 | M1 = 그룹핑 + 토대만. control은 `[data-js="on"]` reveal hook만 깔고 실제 UI는 M2/M3. |
| 버전/footer drift(plugin.json만 bump) | 저 | Task 6이 footer 2곳 동시 동기화 + grep 검증. |
| 병렬 cycle version 경쟁(main이 1.18.15 선점) | 저 | PR 직전 main pull 후 forward-only reconcile(직전 cycle 재발 부채 인지). |

## Acceptance
- [ ] 위험·질문 항목이 소속 PRD별 접힘 그룹(`<details class="prd-group">`)으로 묶여 표시
- [ ] 각 항목에 `data-prd` 속성(M2/M3 토대) + `data-js="on"` 마커 hook
- [ ] JS 제거 시 전체 항목 손실 없이 가시(native `<details>` degrade) + STATUS.md 평문 그룹 동등
- [ ] DESIGN.md JS-0 invariant가 routing-한정 + PE 허용으로 개정, stale route 수 정정
- [ ] plugin.json + footer 2곳 `1.18.15` 동기화
- [ ] inline `<script>` 본문 network primitive 0 — H19 mechanical 가드(Codex F1)
- [ ] PRD provenance 키 = canonical plan path, `data-prd` = prdPath 파생 prdKey, 충돌 테스트 GREEN(Codex F2)
- [ ] `node --test` 렌더 스위트 전부 PASS, design-lint H1-H19 clean(회귀 0)
- [ ] Patterns mirrored, not reinvented

## Design Critique

- 호출: `Skill(impeccable, "critique ...")` — plan-stage critique(마크다운 plan; 라이브 UI 부재 → Assessment B detector 비적용, Assessment A 설계 검토를 4개 Output Constraints에 한정)
- 라운드 수: 1 (R0)
- Verdict: **CONVERGED** (HIGH/CRITICAL 설계 결함 0)
- 4개 Output Constraints 평가:
  | Constraint | 판정 | 근거 |
  |---|---|---|
  | 정보 위계 3단계 (heading ≤3) | PASS | 그룹은 `<summary>`+span(h4 아님). 라우트 heading h2→h3 유지. `.prd-group`은 disclosure 레이어. |
  | 강조색 ≤1 | PASS (LOW note) | 그룹 헤더·`.prd-count` neutral 토큰 — accent 예산 무증가. Task 4에 neutral-token 명시 반영. |
  | raw markdown 금지 | PASS | HTML 라벨 escapeHtml, md `**bold**`는 정당한 markdown(누출 아님). |
  | 항목 수 상한 (top-3 + collapse) | PASS (MEDIUM defer) | 라우트는 기존 full-view(shipped). 그룹핑이 `<details>` collapse를 *추가*해 제약 방향 개선. 대형 그룹 default-collapse 휴리스틱은 M2 고려. |
- Findings: LOW(neutral 토큰 — Task 4 반영) · MEDIUM(default-open vs default-collapse — M2 defer). 둘 다 non-blocking(오라클 HIGH/CRITICAL만 fail).

## Design Routing Guide

routing mode: auto (effective at implement stage). plan 단계는 렌더 UI 부재 → 호출 없이 체크리스트만. implement 단계에서 design 게이트가 stage-appropriate impeccable 명령을 라우팅한다(content-detectable refine 명령은 diff signal positive 시에만 invoke).

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

> ship 전 `/impeccable audit`(a11y·반응형)·`/impeccable polish`(최종 품질)를 PR 단계에서 권장(PRD Design Direction "전 마일스톤 UI → ship 전 impeccable audit/polish").

## Codex Adversarial Review

- 호출: `node …/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 · `--impeccable-available` design-scope preamble)
- 라운드 수: 1 (R1; classification=ok, blocking=false)
- 합치 결론: Codex verdict=`needs-attention` — 2 findings 모두 plan 흡수로 해소. HIGH 1건은 mechanical 가드(H19) task 추가로 완전 해결 → R2 escalation 불필요(cap=1).
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 inline 스크립트 외부-fetch invariant 미가드(런타임 network primitive) | HIGH | ACCEPT_NOW | raw-mode status.html 데이터 유출 경로 — Task 7 H19(inline `<script>` 본문 network primitive 차단) 추가로 mechanical 해결. plan 흡수 완료 → R2 불필요. |
  | F2 그룹핑 키(basename + 라벨 slug) 충돌 시 *오귀속* | MEDIUM | ACCEPT_NOW | truthfulness 위반(조용한 오분류) — Task 1·2를 canonical plan path 키 + prdPath 파생 prdKey로 개정 + 충돌 테스트 추가. |
- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 0 — 두 finding 모두 plan 흡수)
- Codex session 참조: threadId `019f012e-7029-7ca3-83ee-238a2da0cbfe`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
