# Plan: Dashboard Console Redesign — M4 (STATUS.md plain-text 동등본 재구성)

**Source PRD**: `.claude/prds/dashboard-console-redesign.prd.md`
**Selected Milestone**: M4 — STATUS.md plain-text 동등본 재구성
**Complexity**: Medium

## Summary

M1~M3가 `status.html`을 승인된 콘솔 샘플로 이식하고 드로어 상세(OQ 전문·위험 완화·receipt 판정/briefing/hash·마일스톤 요약)를 derive 실데이터로 채웠다. 그러나 그 상세는 `drawer-detail` SSoT의 `details` Map에만 살아 있고 `markdown.js`는 `section.md`(요약형)만 직렬화해 STATUS.md plain-text 소비자(SSH/스크린리더)는 드로어 상세를 전혀 못 본다. M4는 `drawer-detail` SSoT에서 detail 객체를 plain-text markdown으로 렌더하는 단일 함수를 추가하고, 각 섹션 md가 항목 바로 아래에 그 상세를 **인라인 중첩**해, HTML 드로어와 정보 동등한 STATUS.md를 만든다. 새 anchor·정보 구조에 맞춰 STATUS.md 헤더/anchor 줄을 재구성하고, plain-text 동등 노출을 회귀 가드 테스트로 고정한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `parsers/drawer-detail.js:174` `serializeDetails` | detail SSoT 변환 함수는 drawer-detail.js에 두고 `render*`/`serialize*` 동사로 export |
| 상세 SSoT | `parsers/drawer-detail.js:85-166` `buildOQDetail`/`buildRiskDetail`/`buildReceiptDetail`/`buildMilestoneDetail` | detail shape `{title, tags, rows:[[dt,dd,mono?]], sections:[[h3,proseHtml]], action?}` — M4는 이 동일 객체를 md로 렌더(이중 소스 금지) |
| 섹션 md 인라인 | `sections/open-questions.js:100-107`, `sections/risks.js:59-64` | 항목 md는 `- {icon} **{sev}** · {textMd}` + 2-space 중첩 `\n  - {dt}: {dd}` 패턴 — detail 행도 동일 중첩 들여쓰기로 append |
| prose 평면화 | `format-utils.js` `renderProseMd`/`normalizeProse` | md 경로는 `renderProseMd`(inline-markdown 보존, HTML 태그 없음)·`normalizeProse`(H10 em-dash·CRLF normalize). HTML 전용 `renderProseHtml`/`escapeHtml`는 md에서 금지 |
| 진보적 공개 | `sections/open-questions.js:122-126` | `<details><summary>+N 더보기</summary>` HTML-in-md collapse — 인라인 상세는 이 블록 안/밖 모두 항목 단위로 유지 |
| 회귀 가드 | `tests/four-part-rendering.test.js`, `tests/integration.test.js`, `tests/drawer.test.js` | md 동등본은 전용 test 파일 + 기존 integration md assertion 갱신으로 고정 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/drawer-detail.js` | UPDATE | `renderDetailMd(detail, formatUtils)` 추가 — detail 객체(SSoT) → plain-text markdown 중첩 블록. title의 안전-HTML은 md용으로 strip(태그 제거→텍스트). export 확장 |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATE | renderItem md에 detail 인라인 append (관련 결정 등 md 누락 행 surface). `details` Map은 이미 보유 |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | renderItem md에 detail 인라인 append (영향·가능성·관련 결정 등 md 누락 행) |
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | UPDATE | receipt md row에 detail 인라인 append (receipt hash·round 등 md 누락 행). 기존 briefing md 줄과 중복 회피 |
| `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js` | UPDATE | 마일스톤 md에 detail 인라인 append (plan·ship·PR·요약). 요약(plan Summary)이 md엔 부재 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | anchor 줄·섹션 헤더를 새 정보 구조에 맞게 정리(필요 시) + foot version 줄 동기. detail 인라인은 섹션 md가 이미 포함하므로 조립부는 최소 변경 |
| `plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js` | CREATE | STATUS.md가 OQ 전문/위험 완화·영향/receipt 판정·hash/마일스톤 요약을 plain-text로 담는지 + HTML drawer 상세와 정보 동등 + placeholder/더미 0건 회귀 가드 |
| `plugins/mccp/scripts/lib/renderer/tests/integration.test.js` | UPDATE | 새 md 구조 assertion 동기(중첩 detail 행 존재) |
| `plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` | UPDATE | md/html 동등 검사에 detail 인라인 반영 |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATE (조건부) | md 경로 신규 lint(H10 em-dash·H16 raw marker)가 detail 인라인에서 깨지지 않게 — 충돌 시에만 carve-out/조정 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.18.1 → 1.18.2` patch bump (PRD 단일 milestone) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` (foot) + `html.js` (page-foot) | UPDATE | user-visible version 줄을 1.18.2로 동기(§3.7 surface drift 방지) |
| `.claude/prds/dashboard-console-redesign.prd.md` | UPDATE | M3 row complete 정정 + M4 row pending→in-progress + Plan cell 채움 |
| `docs/.../DESIGN.md` 또는 plan 본문 | UPDATE | STATUS.md 상세 평면화 결정(OQ #4)·정보 동등 계약 기록 |

## 핵심 설계 결정 (PRD Open Questions 응답)

- **OQ #4 — 드로어 상세 평면화 형태**: **항목별 인라인 중첩**(섹션 말미 수집 appendix 아님). 근거: plain-text 소비자는 hyperlink·:target 점프가 불가하므로, 안정 키 appendix는 키 매칭 부담만 준다. 드로어의 plain-text 등가물 = "그 항목 바로 아래에 상세를 펼친 것". 기존 섹션 md의 2-space 중첩 bullet 관례를 그대로 확장한다.
- **상세 SSoT 단일화**: detail→md 렌더는 `drawer-detail.js`의 `renderDetailMd` 하나만. 섹션 md가 자체적으로 detail 행을 재구성하면 HTML 드로어와 drift 위험 → SSoT 위반. 섹션은 `renderDetailMd(detail)` 호출 결과를 항목 md에 붙이기만 한다.
- **중복 회피**: 항목 요약 md가 이미 가진 행(OQ 출처/섹션/action, risk 완화, timeline briefing)은 `renderDetailMd`가 중복 출력하지 않도록, detail 렌더에 `omit` 집합(이미 요약에 표기된 dt 라벨)을 넘기거나 섹션이 요약 줄을 detail로 일원화한다. **권장: 섹션 요약 md의 중복 행을 제거하고 detail 인라인으로 일원화**(요약+상세 이중 표기 제거, 정보 손실 0).
- **모든 prose 필드 raw 보존 (Codex F1 흡수)**: detail의 prose 필드는 `title`만이 아니라 `sections[][1]`(완화책·요약·briefing)도 전부 `renderProseHtml` 결과(안전 HTML)다. md 렌더가 proseHtml만 받으면 HTML strip/decode 휴리스틱이 강제돼 mitigation/briefing/요약 내용이 손상·유실될 수 있다. **결정: 빌더가 모든 markdown-렌더 prose 필드의 raw normalized 텍스트를 detail에 함께 stamp**한다 — `title`/`titleText` 쌍처럼 sections도 `[h3, proseHtml, proseText]` triple로 확장(또는 raw 필드만 보존하고 HTML/md를 둘 다 raw에서 파생). `renderDetailMd`는 절대 proseHtml을 strip하지 않고 `proseText`에 `renderProseMd`를 적용한다. strip 정규식 0. 검증: code span·링크·엔티티·한국어 요약 텍스트 케이스 테스트.
- **section-only md 필드 인벤토리 + 무손실 (Codex F2 흡수)**: 요약 행을 detail 인라인으로 일원화하기 **전에**, 각 섹션 md가 가진 모든 행을 인벤토리한다. 현재 확인된 section-only 필드: risks.js `relatedOpenQuestion`(동일 질문 참조 — `buildRiskDetail` detail에 부재). 이런 필드는 (a) detail SSoT에 추가하거나, (b) detail 밖 인라인으로 유지한다 — **둘 중 무엇이든 STATUS.md에서 사라지지 않게** 한다. `relatedOpenQuestion`은 detail SSoT(`buildRiskDetail`)에 raw 보존 필드로 추가한다.
- **dedup은 label이 아닌 field-key + value 동등 (Codex F2 흡수)**: omit 집합을 표시 라벨 기준으로 두면 같은 라벨 다른 의미를 잘못 제거하거나 미세 차이를 못 잡는다. **결정: omit을 항목 블록 단위로 field-key(안정 식별자) + rendered-value 동등 검사**로 한다 — 요약과 detail이 같은 field-key에서 같은 렌더 값일 때만 한 쪽을 생략. 값이 다르면(요약 truncate vs detail 전문 등) 둘 다 보존. 테스트가 `relatedOpenQuestion` 및 모든 detail row/section이 올바른 항목 옆에 생존함을 assert.
- **graceful degrade**: detail에 부재한 필드(rows/sections 생략)는 md에서도 그 행을 안 찍는다(placeholder 금지, PRD 데이터 추출 원칙). 0건 섹션은 기존 `_미해결 위험 없음_`류 빈 상태 메시지 유지.

## Tasks

### Task 1: `renderDetailMd` SSoT 추가
- **Action**: `drawer-detail.js`에 `renderDetailMd(detail, formatUtils, opts)` 추가. detail의 `{titleText|title, tags, rows, sections, action}`을 2-space 중첩 markdown bullet 블록으로 렌더. `opts.omit`(이미 요약에 표기된 dt 라벨 Set)·`opts.indent`(기본 2-space) 지원. tags는 `[sev]`처럼 압축, rows는 `- {dt}: {dd}`(mono면 backtick), sections는 `- {h3}: {proseMd}`, action은 `- 다음 액션: \`{action}\``.
- **Mirror**: `serializeDetails`(같은 파일 SSoT 변환 함수 자리) + open-questions.js 중첩 bullet 관례
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js` (renderDetailMd 단위 케이스)

### Task 2: 빌더가 모든 prose 필드 raw 텍스트 보존 (Codex F1+F2 흡수)
- **Action**: `buildOQDetail`/`buildRiskDetail`/`buildReceiptDetail`/`buildMilestoneDetail`이 `title`(renderProseHtml)과 함께 `titleText`(normalizeProse 원본 평문)를, 그리고 `sections`를 `[h3, proseHtml, proseText]` triple(또는 raw 필드 보존 + 양 surface 파생)로 확장 — md 경로가 HTML을 strip하지 않고 `proseText`를 직접 쓰게. `buildRiskDetail`에 `relatedOpenQuestion` raw 필드 추가(F2 — section-only 필드 SSoT 흡수). HTML 드로어 경로는 `title`/`proseHtml` 그대로 사용(무영향).
- **Mirror**: `drawer-detail.js:95-166` 빌더 반환 shape + `:118-119`(sections triple로 확장)
- **Validate**: `tests/drawer.test.js` 기존 13 케이스 green + `titleText`/`proseText`/`relatedOpenQuestion` 존재 + code span·링크·엔티티·한국어 요약 케이스 assertion 추가

### Task 3: OQ·Risk 섹션 md를 detail 인라인으로 일원화 (field-key dedup)
- **Action**: 먼저 OQ/Risk 섹션 md의 모든 행을 인벤토리(출처/섹션/line/action/완화/관련질문 등) → 각 행이 detail SSoT에 있는지 확인, 부재 시 Task 2에서 SSoT에 추가됨을 전제. open-questions.js / risks.js renderItem의 md를 `- {icon} **{sev}** · {titleText}` 헤더 + `renderDetailMd(detail, {omit})` 중첩으로 재구성하되, **omit은 field-key + rendered-value 동등 검사**(label 아님) — 요약·detail이 같은 field-key·같은 값일 때만 한 쪽 생략, 값 다르면 둘 다 보존. `relatedOpenQuestion` 포함 모든 section-only 필드가 STATUS.md에 생존.
- **Mirror**: 현행 `sections/open-questions.js:105-107`, `sections/risks.js:59-64`
- **Validate**: `node --test .../tests/sections.test.js .../tests/markdown-equivalence.test.js` — `relatedOpenQuestion` + 모든 detail row/section이 올바른 항목 옆 생존 assert

### Task 4: 마일스톤·receipt 섹션 md에 detail 인라인
- **Action**: milestone-history.js — 마일스톤 md에 `renderDetailMd`(plan/ship/PR/요약) append, 요약(plan Summary)이 plain-text로 새로 노출되게. audit-timeline.js — receipt row md에 `renderDetailMd`(round/hash 등 md 누락 행) append, 기존 briefing md 줄과 중복 안 나게 omit 적용.
- **Mirror**: `sections/milestone-history.js:185-192`, `sections/audit-timeline.js:176-206`
- **Validate**: `node --test .../tests/milestone-history.test.js .../tests/audit-timeline-snapshot.test.js`

### Task 5: markdown.js anchor/구조 정리 + version 동기
- **Action**: 필요 시 anchor 줄·섹션 순서를 새 정보 구조에 맞게 점검(현행 구조 유지 가능하면 최소 변경). foot `_derived from .claude/ · v1.18.2_`로 동기. html.js page-foot도 1.18.2.
- **Mirror**: `markdown.js:29-37`(anchor), `markdown.js:112`(foot)
- **Validate**: `node --test .../tests/integration.test.js`

### Task 6: 회귀 가드 테스트 + 동등본 계약
- **Action**: `tests/markdown-equivalence.test.js` CREATE — (a) STATUS.md가 OQ 전문/위험 완화·영향·가능성/receipt 판정·hash/마일스톤 요약을 담음, (b) HTML `DETAILS` JSON의 각 detail이 md에도 정보 동등 표현(키별 rows/sections 텍스트 존재), (c) production render에 placeholder/"임의 예시" 문자열 0건, (d) 0건 섹션 graceful degrade. integration.test.js·four-part-rendering.test.js 갱신.
- **Mirror**: `tests/drawer.test.js` 구조 + `tests/four-part-rendering.test.js` md/html 대조
- **Validate**: 전체 renderer suite green

### Task 7: lint·plugin bump·PRD/문서 동기
- **Action**: output-constraints.js의 md 경로 lint(H10/H16)가 detail 인라인에서 통과하는지 확인, 충돌 시 carve-out. plugin.json 1.18.1→1.18.2. PRD 테이블 M3 complete·M4 in-progress+Plan cell. 평면화 결정·동등 계약을 plan/DESIGN.md에 기록.
- **Mirror**: §3.7 version bump 체크리스트, M3 report의 PRD 정정 패턴
- **Validate**: `node --test .../tests/output-constraints.test.js` + 전체 suite

## Validation

```bash
# 전체 renderer + derive suite (회귀 0 확인)
node --test plugins/mccp/scripts/lib/renderer/tests/
node --test plugins/mccp/scripts/derive/tests/ 2>/dev/null || true

# 실제 render 산출 후 STATUS.md 육안 + 더미/placeholder grep
node plugins/mccp/scripts/derive/cli.js render
grep -nE "임의 예시|placeholder|dummy|TODO|샘플 데이터" .claude/cache/STATUS.md && echo "FAIL: dummy 잔존" || echo "OK: 더미 0건"

# STATUS.md가 드로어 상세를 plain-text로 담는지(완화/hash/요약 키워드 존재)
grep -qE "완화|receipt|요약" .claude/cache/STATUS.md && echo "OK: 상세 surface" || echo "FAIL: 상세 누락"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 섹션 md 재구성이 기존 integration/snapshot 테스트 대량 회귀 | 고 | detail 인라인을 SSoT 단일 함수로 격리 + 섹션별 단위 테스트 동기 + 단계별(Task 3→4) ship. snapshot은 의도적 갱신 |
| 요약+상세 이중 표기로 정보 중복/노이즈 | 중 | `omit` 집합으로 중복 행 제거, 요약-only 행을 detail로 일원화(이중 소스 제거) |
| HTML drawer ↔ md 정보 drift(SSoT 두 갈래) | 중 | detail→md는 `renderDetailMd` 하나만 통과 + four-part-rendering 동등 테스트로 mechanical 가드 |
| md detail에서 raw `**bold**`/em-dash 누출(H16/H10) | 중 | `renderProseMd`/`normalizeProse` 경유 강제(HTML escape 함수 md 금지) + output-constraints md 경로 lint |
| proseHtml strip 휴리스틱이 mitigation/briefing/요약 내용 손상 (Codex F1) | 고 | 빌더가 모든 prose 필드 raw 텍스트(`proseText`) 보존 → md가 strip 없이 `renderProseMd(raw)` — strip 정규식 0. code span·링크·엔티티·한국어 케이스 테스트 |
| 요약 행 제거가 section-only 필드(relatedOpenQuestion 등) 유실 (Codex F2) | 고 | 제거 전 인벤토리 + SSoT 추가/인라인 유지 + omit을 field-key+value 동등으로 — 모든 section-only 필드 생존 assert |
| plain-text 소비자 정보 손실(스크린리더/SSH) | 중 | 동등본 테스트가 각 HTML detail 키의 md 표현 존재를 assert — 손실 시 FAIL |
| receipt hash 등 식별자 노출이 mask 정책 위반 | 낮 | derive mask 경로 그대로 통과(렌더는 mask된 model 소비), 신규 raw 노출 없음 |

## Acceptance

- [ ] 모든 Task 완료, 전체 renderer suite green (회귀 0)
- [ ] STATUS.md가 OQ 전문·위험 완화/영향/가능성·receipt 판정/round/hash·마일스톤 요약을 plain-text로 담음 (HTML drawer와 정보 동등)
- [ ] detail→md 렌더는 `renderDetailMd` SSoT 단일 경로 (섹션 자체 재구성 없음)
- [ ] 빌더가 모든 prose 필드 raw 텍스트 보존, `renderDetailMd`에 HTML strip 정규식 0 (Codex F1)
- [ ] `relatedOpenQuestion` 등 모든 section-only md 필드 STATUS.md 생존, omit은 field-key+value 동등 (Codex F2)
- [ ] production render STATUS.md에 placeholder/더미/"임의 예시" 0건
- [ ] 0건 섹션 graceful degrade (빈 상태 메시지, placeholder 금지)
- [ ] em-dash·raw marker 누출 0 (H10/H16 md 경로 통과)
- [ ] plugin.json + 양 surface foot version 1.18.2 동기
- [ ] PRD 테이블 M3 complete·M4 in-progress 갱신, 평면화 결정 plan/DESIGN.md 기록
- [ ] Patterns mirrored, not reinvented

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available`)
- 라운드 수: 1 (R1 absorption으로 두 HIGH 완전 해소 — ACCEPT_NOW HIGH 잔존 0이므로 R2 미escalate, cap=1)
- 합치 결론: 초기 verdict `needs-attention`(2 HIGH) — 두 finding 모두 plan 본문 R1 편집으로 흡수. 정보 무손실·SSoT 단일화 보강.
- Codex session 참조: threadId `019ef6e9-165f-7b22-a8cd-2428e6d47c4f`
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 renderDetailMd가 drawer sections의 raw prose 부재 — proseHtml strip 휴리스틱이 mitigation/briefing/요약 손상 위험 | HIGH | ACCEPT_NOW | M4 핵심(정보 동등) 직접 위협. Task 2를 "모든 prose 필드 raw 보존(sections triple)"으로 개정 + strip 정규식 0 계약 |
  | F2 인라인 collapse가 section-only 필드(relatedOpenQuestion) 유실 + label 기반 omit 취약 | HIGH | ACCEPT_NOW | plain-text 손실 = M4 acceptance 위반. Task 2/3을 인벤토리 + SSoT 흡수 + field-key·value 동등 omit으로 개정 |

- Deferred to backlog: 0
- Open Questions: 없음 (두 HIGH 모두 R1 resolved — DIVERGENT_UNRESOLVED 아님)

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
