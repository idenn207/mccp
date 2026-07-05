# Plan: Dashboard Interactivity — M1.2 prose 렌더 시각 다듬기 + 리스트 강조 혼란 제거

**Source PRD**: `.claude/prds/dashboard-interactivity.prd.md`
**Selected Milestone**: M1.2 — prose 렌더 시각 다듬기 + 리스트 강조 혼란 제거 (M1이 깐 block 렌더 위에서 시각 완성도를 올린다)
**Complexity**: Small

## Summary

M1은 드로어 prose를 inline-only → block-level(`renderProseBlockHtml`)로 확장했지만, 두 시각 결함이 남았다: (1) heading(`## …`)이 `<p class="d-h"><strong>`로 평면 강등돼 본문 문단과 시각 위계가 약하고, (2) 문단 내 단일 줄바꿈(soft break)이 공백으로 합쳐져 의도된 줄 구조가 사라진다. 또 (3) 드로어 **밖** 위험/질문 리스트의 `**bold**`가 흰색 `<strong>`(`--ink`) vs 회색 본문(`--ink-2`) 대비를 만들어 '확인/미확인' 상태 토글로 오인된다. M1.2는 (a) `.d-h`를 styled heading carve-out으로 올리고(H15 literal h4+ 회피), (b) soft break를 `<br>`로 보존하고(HTML≡STATUS.md md 동등 유지), (c) 리스트 강조는 중립화하고 강조 렌더는 drawer(loud-on-demand)로 집중한다. 전부 read-only 렌더/CSS 변경 — 신규 저장소·서버 mutation·마커 cap 확장 없음.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `format-utils.js:210` `renderProseBlockHtml` | block 렌더 SSoT. heading/문단 분기만 수정, escape-then-render 경계·`renderInline` 종단 불변 |
| Injection boundary | `format-utils.js:137-167` `renderInline`, `:300-318` | 모든 텍스트 경로는 `esc()` 후 마커 렌더로 종단. soft-break는 **per-line `renderInline` 후** 우리가 제어하는 `<br>`로 join — raw `\n`/`<br>` passthrough 0 |
| CSS 토큰 | `html.js:709-721` `.d-prose` 블록, `:535` `.li-q strong` | near-monochrome 토큰만(`--ink`/`--ink-2`/`--muted`/`--border`). 신규 강조색·tint 0. heading carve-out은 size/weight/margin/color로만 위계 |
| Errors | `format-utils.js:212,323-325` | fail-open — block 렌더러 throw 금지, catch 시 `esc(text)` 평문 degrade |
| Tests | `tests/format-utils.test.js:84-126`, `markdown-equivalence.test.js`, `escaping.test.js` | `node --test`. heading/문단 케이스 2곳 갱신 + soft-break/heading-styled 신규 케이스 |
| Design-lint | `output-constraints.js` H15(h4+ 금지)/H16(raw 마커)/H10(em-dash)/H3(carve-out) | `.d-h`는 styled `<p>`라 H15 무발화, `<br>`는 마커 아니라 H16 무관 |
| Version | `plugin.json` `1.18.18`, `html.js:1332` + `markdown.js:127` footer | §3.7 — patch bump(M1.2 단일 milestone) + footer 2곳 동기 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/format-utils.js` | UPDATE | `renderProseBlockHtml`: heading 분기(`.d-h`에서 내부 `<strong>` 제거) + 문단 분기(soft break per-line `renderInline` + `<br>` join) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | CSS: `.d-prose p.d-h` styled heading 위계 / `.li-q strong` 중립화 / `.d-prose strong` loud 추가 / footer `1.18.18→1.18.19` |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer 버전 `1.18.18→1.18.19` 동기 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `version` `1.18.18 → 1.18.19` (patch) |
| `plugins/mccp/scripts/lib/renderer/tests/format-utils.test.js` | UPDATE | heading(line 124-126)·문단 soft-join(line 84-88) 계약 갱신 + soft-break `<br>` / heading-styled 신규 단언 |
| `CHANGELOG.md` | UPDATE | v1.18.19 row |

## Design Decisions (M1.2 Open Questions 확정)

**OQ "heading 시각 위계" → styled `.d-h` carve-out, 내부 `<strong>` 제거. (Critique F1 흡수 — 사이징으로 위계 역전 금지.)**
`<p class="d-h">` 래퍼 유지(literal h4+ 미사용 = H15 무발화). 렌더는 내부 `<strong>`을 **제거**(`.d-h`가 weight를 CSS로 보유 — 이중 인코딩 해소) → `<p class="d-h">{renderInline(text)}</p>`.
**불변(F1)**: `.d-h` font-size는 같은 드로어의 섹션 라벨 `.d-sec h3`(현 0.8rem)를 **초과하지 않는다**. prose 안 `##`이 자기 섹션 헤더보다 커지는 위계 역전을 차단. 차별화 축은 **size가 아니라 weight + color + margin-top** — `font-size: 0.8rem`(≤ `.d-sec h3`, 본문 0.855 미만) + `font-weight: 650` + `color: var(--ink)`(본문 --ink-2 대비) + `margin-top: 0.9rem`/`margin-bottom: 0.25rem` + 약한 `letter-spacing`. 결과 위계: `.d-title`(1.05) > `.d-sec h3`(섹션 라벨) ≥ `.d-h`(prose 헤딩, weight/color로 구분) > 본문(--ink-2). 구현 시 섹션 라벨 우위가 모호하면 `.d-sec h3`를 ~0.9rem로 상향하는 대안 가능(시각 확인으로 택일) — 단 `.d-h ≤ .d-sec h3` 불변은 유지.

**OQ "문단 내 줄바꿈" → soft break를 `<br>`로 보존(단 marker-balance gate). (Critique F2 흡수 — raw 마커 누출 0 보장.)**
문단 분기에서 `para.join(' ')` → 조건부 `<br>` join. 근거: (1) 드로어는 loud-on-demand 전문 표면이라 의도된 줄 구조(완화 단계·OQ 하위 라인) 보존이 가치, (2) md 경로(`renderProseBlockMd`)는 `\n`을 그대로 유지 → HTML `<br>` ≡ md `\n` plain-text 동등 보존(markdown-equivalence 불변).
**불변(F2 + Codex F-C1) — render-then-validate gate (parity 휴리스틱 폐기)**: `esc`는 `*`/`` ` ``를 escape하지 않으므로, inline 마커가 soft break를 가로지르면 라인별 `renderInline`이 페어링에 실패해 **literal/entity 마커가 렌더 표면에 잔존**(Constraint 3 위반 + H16 FIRE). 단순 parity 검사(`**`/`__`/single-backtick 짝수)는 **불충분** — `PROSE_TOKEN`(format-utils.js:132)은 **double-backtick code span**(양 라인 backtick 2개씩 → even 통과하지만 per-line 렌더가 `<br>` 주변 entity backtick 배출)과 **markdown link**(`[..](..)` — bracket/paren 미추적)도 토큰화하기 때문(Codex F-C1). **차단 = 출력 검증**: 문단을 (a) 후보 `para.map(p => renderInline(p, esc)).join('<br>')`로 렌더한 뒤, 결과 HTML에 **잔존 마커 스캔**(H16 카탈로그 5종 정합: `**`/`__` bold, single backtick, **double→entity `&#96;`**, `[..](..)` md-link). 잔존이 0이면 후보 채택, 한 개라도 있으면 **기존 space-join baseline으로 fallback**(`renderInline(para.join(' '), esc)` — 현행 페어링·known-good). space-join은 이미 신뢰된 경로이므로, "`<br>` 경로가 baseline보다 마커를 더 만들면 fallback" = raw 마커 누출 **구조적 0**(PROSE_TOKEN 문법 전체 커버, parity 재구현 회피).

**OQ "리스트 강조 중립화" → 색 대비 제거(option i) + 강조는 drawer로 집중.**
`.li-q strong`(html.js:535) `font-weight: 650; color: var(--ink)` → `font-weight: 600; color: var(--ink-2)`(본문과 동색 — 흰/회 상태-신호 대비 제거, 미세 weight만). 강조 렌더는 drawer로: `.d-prose strong { font-weight: 650; color: var(--ink); }` 신규(드로어 본문 bold가 loud). 결과: 리스트=quiet, drawer 본문/title=loud. `--ink`는 primary text 토큰(accent 아님)이라 "강조색 viewport당 ≤1"(severity pill) 불변. widget-card `<li>`(html.js:846)에 별도 white-strong 규칙 없음 확인 후 동일 정책 적용(있으면 동반 중립화).
**Critique F3 (LOW) 흡수 — 드로어 --ink bold 누적 억제**: 같은 드로어에 `.d-sec h3`·`.d-h`·`.d-prose strong`이 모두 `--ink`라 bold가 과누적되면 "loud on demand" 신호가 희석될 수 있다. F1 사이징(`.d-h ≤ h3`, weight/margin으로 구분)이 이미 위계를 분리하므로 추가 토큰은 불필요 — `.d-prose strong`은 본문 강조(inline)로만, 섹션/heading 위계는 size/margin이 담당. polish(Task 5)에서 육안으로 bold 밀도 확인.

## Tasks

### Task 1: heading styled `.d-h` 위계 (F1 흡수)
- **Action**: `format-utils.js` heading 분기(line 302-307)에서 `<p class="d-h"><strong>…</strong></p>` → `<p class="d-h">{renderInline(heading[1].trim())}</p>`. `html.js` `.d-prose p.d-h`(line 713)에 `font-size: 0.8rem`(≤ `.d-sec h3`) + weight 650 + `margin-top: 0.9rem` + color --ink + letter-spacing — **size로 위계 만들지 않음**(F1: `.d-h ≤ .d-sec h3` 불변).
- **Mirror**: `format-utils.js:300-307` 분기 형태 + `html.js:703,709-721` `.d-sec h3`/`.d-prose` 토큰·사이즈.
- **Validate**: `node --test …/format-utils.test.js` — heading 단언을 `<p class="d-h">헤딩은 강등</p>`로 갱신, `<strong>` 부재 확인. H15 무발화(`output-constraints.test.js`). 육안: prose `##`이 섹션 라벨보다 크지 않음.

### Task 2: 문단 soft break `<br>` 보존 (F2 + Codex F-C1 render-then-validate gate 흡수)
- **Action**: `format-utils.js` 문단 분기(line 311-318) — 후보 `para.map(p => renderInline(p, esc)).join('<br>')`를 만든 뒤 **잔존 마커 스캔**(`**`/`__`/single backtick/`&#96;` entity/`[..](..)` md-link, PROSE_TOKEN 5종 정합). 잔존 0이면 후보 채택, 아니면 `renderInline(para.join(' '), esc)` space-join fallback. md 경로(`renderProseBlockMd`)는 변경 없음(이미 `\n` 보존).
- **Mirror**: `renderInline`/`PROSE_TOKEN` SSoT(line 132-167) — 잔존 스캔은 PROSE_TOKEN 토큰 셋과 1:1 / fallback은 현행 space-join 페어링(known-good) 보존.
- **Validate**: `format-utils.test.js` — (1) soft-join 케이스(line 84-88)를 `<br>` 기대로 갱신, (2) **신규: bold `**` straddle → fallback, 잔존 0**, (3) **신규: double-backtick `` `` `` span straddle → fallback, entity `&#96;` 미잔존**(Codex F-C1), (4) **신규: markdown link `[..](..)` straddle → fallback, raw fragment 미잔존**(Codex F-C1), (5) 신규 multi-line balanced `<br>` 채택 단언. `markdown-equivalence.test.js` + `output-constraints.test.js`(H16) green.

### Task 3: 리스트 강조 중립화 + drawer loud
- **Action**: `html.js:535` `.li-q strong` 색 `--ink`→`--ink-2`·weight 650→600. `.d-prose strong { font-weight: 650; color: var(--ink); }` 신규(`.d-prose` 블록 내, line 712 인근). widget-card `<li> strong` white 규칙 부재 확인.
- **Mirror**: `html.js:533-538` `.li-q`/`.meta-cue b`(이미 `--ink-2` quiet) 톤.
- **Validate**: `a11y-contrast.test.js`(--ink-2 대비 토큰 통과) + `design-invariants.test.js` green. 육안: 리스트 bold가 상태 토글로 안 읽힘 / 드로어 bold loud.

### Task 4: version bump + footer + CHANGELOG
- **Action**: `plugin.json` `1.18.18→1.18.19`. `html.js:1332` + `markdown.js:127` footer `v1.18.18→v1.18.19`. `CHANGELOG.md` v1.18.19 row.
- **Mirror**: §3.7 patch bump + footer 동기 컨벤션.
- **Validate**: `grep -rn "1\.18\.19" plugins/mccp/scripts/lib/renderer/{html,markdown}.js plugins/mccp/.claude-plugin/plugin.json` 3-surface 일치.

### Task 5: impeccable audit/polish 자기-적용 + 전체 회귀
- **Action**: PRD §Design Direction "M1·M2는 impeccable 워크플로로 진행" 자기-적용 — 구현 후 `/impeccable audit`(a11y·반응형) + `/impeccable polish`로 시각 완성 점검. divergent 발견 시 명시 섹션만 보정.
- **Mirror**: §3.10 stage-aware routing(evaluate=audit).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/` 전체 green(회귀 0).

## Validation

```bash
# 전체 렌더러 스위트
node --test plugins/mccp/scripts/lib/renderer/tests/

# M1.2 직접 영향 스위트
node --test plugins/mccp/scripts/lib/renderer/tests/format-utils.test.js \
  plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js \
  plugins/mccp/scripts/lib/renderer/tests/escaping.test.js \
  plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js \
  plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js \
  plugins/mccp/scripts/lib/renderer/tests/a11y-contrast.test.js \
  plugins/mccp/scripts/lib/renderer/tests/drawer.test.js

# 렌더 산출 육안(드로어 heading 위계 + soft-break + 리스트 quiet bold)
node plugins/mccp/scripts/derive/cli.js render

# 버전 3-surface 동기
grep -rn "1\.18\.19" plugins/mccp/.claude-plugin/plugin.json \
  plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| soft break `<br>` join이 inline 마커(bold/single+double backtick/md-link)를 orphan → literal/entity 마커 잔존(Constraint 3/H16) | 중 | **render-then-validate gate**(F2 + Codex F-C1 흡수): 후보 `<br>` 출력을 PROSE_TOKEN 5종 잔존 스캔 — 0 아니면 space-join baseline fallback(known-good 페어링) → raw 마커 누출 **구조적 0**. parity 휴리스틱(double-backtick/link miss)은 폐기. 4종 straddle test + H16 무발화 |
| `.d-prose strong` loud 추가가 near-monochrome·강조색 ≤1 불변 약화 | 낮 | `--ink`는 primary text 토큰(accent 아님). severity pill만 accent — viewport 강조색 ≤1 유지. `design-invariants.test.js` 가드 |
| heading `<strong>` 제거가 기존 드로어/section-fidelity 테스트 회귀 | 중 | 영향 단언 2곳(format-utils.test.js)만 — 동반 갱신. 전체 스위트로 회귀 0 확인 |
| STATUS.md plain-text 동등본 손실(`<br>` vs `\n`) | 낮 | md 경로 무변경(`\n` 보존) — HTML `<br>` ≡ md `\n`. markdown-equivalence 테스트 가드 |
| `.li-q strong` 중립화가 다른 리스트 표면(widget-card 등)에 미적용 | 낮 | Task 3에서 widget-card `<li> strong` white 규칙 부재 확인 — 있으면 동반 중립화 |

## Acceptance

- [ ] 드로어 heading이 styled `.d-h`(weight/color/margin)로 본문과 시각 구분 — literal h4+ 0(H15) + `.d-h ≤ .d-sec h3`(F1: 위계 역전 0)
- [ ] 문단 내 soft break가 `<br>`로 보존 + md plain-text `\n` 동등 + **마커(bold/single+double backtick/md-link) soft-break 가로지름 시 raw/entity 마커 누출 0**(F2 + Codex F-C1 render-then-validate gate, 4종 straddle test)
- [ ] 위험/질문 리스트 bold가 흰/회 상태-신호 대비 제거(quiet) / 드로어 본문 bold loud
- [ ] `plugin.json`+footer 2곳 `1.18.19` 동기
- [ ] `node --test` 렌더러 스위트 전체 green(회귀 0)
- [ ] 주입 경계(escape-then-render) 보존 — raw 마커/`<br>` passthrough 0
- [ ] Patterns mirrored, not reinvented

## Codex Adversarial Review

- 호출: `node …/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, background ~4.4분)
- 라운드 수: 1 (R1 absorption으로 완전 해소 — R2 불요)
- classification: `ok` · wrapper blocking: `false` · content verdict: `needs-attention` → **R1 흡수 후 resolved**
- 합치 결론: marker-balance gate가 렌더러 문법보다 약해 raw 마커 누출 가능 → **render-then-validate gate로 교체(PROSE_TOKEN 5종 전체 커버)**
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F-C1 line-balance gate가 double-backtick span·markdown link straddle를 miss(parity check로 H16 누출 가능) | HIGH | ACCEPT_NOW | 정확 — parity 휴리스틱은 PROSE_TOKEN(double-backtick/link) 미커버. 결정 B/Task 2/Risks/Acceptance를 **render-then-validate + space-join fallback**으로 교체, double-backtick·md-link straddle 2종 test 추가. self-attest: 출력 검증은 토큰 종류 무관 잔존 0 보장이라 완전 해소 |
- Deferred to backlog: 0
- Open Questions: 없음 (HIGH 1건 ACCEPT_NOW resolved, CRITICAL 0)
- Codex thread 참조: `019f07b4-2447-7152-9f6d-7eab0ee35106`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

## Design Critique

- SKILL first-step: `frontend-design-direction/SKILL.md ## Output Constraints`(4 anchors) Read 후 critique loop 진입.
- 라운드: R0 ESCALATE → R1 CONVERGED (2 invocations, cap 2).
- 합치 결론: **converged** — 4 Output Constraints(정보 위계 3단계 / 강조색 ≤1 / raw 마커 금지 / 항목 수 상한) 모두 충족.
- 흡수 내역:
  | Finding | Severity | Constraint | 흡수 |
  |---|---|---|---|
  | F1 `.d-h` 사이징 위계 역전 | HIGH | 정보 위계 | 결정 A + Task 1 — `.d-h ≤ .d-sec h3` 불변, size 대신 weight/color/margin 차별화 |
  | F2 `<br>` soft-break가 inline 마커 orphan → raw 마커 잔존 | HIGH | raw 마커 금지 | 결정 B + Task 2 + Risks — marker-balance gate(orphan 시 space-join fallback) → 누출 구조적 0 |
  | F3 드로어 --ink bold 누적 | LOW | 정보 위계(인접) | 결정 C 기록 — size/margin이 위계 담당, polish(Task 5) 육안 |
- 강조색 ≤1: near-monochrome 토큰만(severity pill 단일 accent) — 위반 0.

## Design Routing Guide

routing mode: auto (effective at implement stage). plan 단계는 렌더 UI가 없어 invoke하지 않음 — 아래는 implement 단계 체크리스트(전부 recommend). M1.2는 evaluate(critique 완료 + audit)·refine(layout/typeset) 위주.

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
