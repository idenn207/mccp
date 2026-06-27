# Dashboard Interactivity + 드로어 상세화 + impeccable 워크플로 강화

## Problem

mccp 진행현황 대시보드(`.claude/cache/status.html` + `STATUS.md`)는 PM-모드 dogfood의 단일 현황 표면이지만, "현황 파악 → 판단 → 처리"의 마지막 단계가 대시보드 밖에 있다. 사용자가 드로어에서 위험을 보고 "이건 이미 완화됐다/무관하다"고 판단해도, 지금은 별도로 `/mccp:dashboard-audit`를 돌리거나 소스 `.md`를 직접 편집해야 한다 — 대시보드에서 한 번에 처리·기록·확인하는 닫힌 루프가 없다. 또 (1) 우측 드로어가 *요약* 위주라 "왜/어떻게 완화됐는지" 맥락이 잘리고, (2) 진행중 마일스톤이 worktree별로 개요에 보이지 않아 멀티-worktree 현황을 한눈에 못 본다. 같은 맥락에서 (3) 디자인 surface를 건드리는 게이트의 impeccable 검증이 critique 단일 단계에 머물러 audit·정리(clarify/distill) 단계가 빠져 있다.

## Evidence

- 사용자 직접 backlog(항목 10~14) — 본 PRD는 사용자가 유지하는 번호 매긴 요청 목록의 5개 항목을 정의한다. 사용자가 명시적으로 작업 지시.
- 사용자 직접 관찰(dogfood): 9차례 대시보드 PRD(`dashboard-*.prd.md`)를 거치며 누적된 "드로어가 요약만 보여줘 맥락 부족", "진행중 마일스톤·worktree가 개요에 없음", "위험 처리를 대시보드에서 못 함" 반복 지적.
- 구조적 증거: `/mccp:dashboard-audit` + `stale-audit/apply.js`가 이미 비파괴 해결 마커(`<!--mccp:resolved reason="…" at="…"-->`)를 소스 `.md`에 쓰는 검증된 경로를 가짐 — 항목 10은 이 메커니즘을 대시보드 버튼으로 노출하는 wiring이지 신규 발명이 아니다.
- 구조적 증거: 드로어 detail 빌더(`drawer-detail.js`)가 이미 위험 `완화책`(Mitigation prose)·receipt `요약`을 section으로 surface — 항목 12·13은 이 section을 truncation 없이 markdown 전문으로 재구성하는 변경.
- 구조적 증거: `multi-session.js`(worktree 진행 집계) + `milestone-history.js`(완료 이력)가 이미 존재 — 항목 11은 "진행중" 마일스톤을 개요에 추가하는 확장.

## Users

- **Primary**: skypark207 (mccp 단독 개발자, PM-모드 dogfood). 임의 mccp-installed 프로젝트·멀티 worktree에 진입해 대시보드로 "지금 어느 마일스톤이 진행/차단인지, 어떤 위험이 살아있고 어떻게 완화됐는지"를 훑고, 항목을 클릭해 상세를 드로어로 확인하고, (후속) 무관한 위험을 그 자리에서 제외하려는 상황에서 트리거됨.
- **Not for**: 외부 배포/공유 대상, 멀티유저, 모바일, 원격 접근. 로컬 데스크톱(127.0.0.1) dogfood 전용 불변.

## Hypothesis

We believe **(a) 드로어를 요약 대신 완화방법·맥락 전문(markdown)으로 재구성하고, (b) 개요에 worktree별 진행중 마일스톤을 노출하고, (c) impeccable 검증을 audit·layout·clarify/distill로 강화하고, (d) 후속으로 대시보드에서 위험을 직접 obsolete 처리하는 닫힌 루프를 추가하면**
will **PM-모드 dogfood에서 "현황 파악 → 판단 → 처리"를 대시보드 한 곳에서 끝내게** for **mccp 단독 개발자**.
We'll know we're right when **드로어가 위험 완화 *방법*을 truncation 없이 markdown 전문으로 보여주고, 개요에 worktree별 진행중 마일스톤이 뜨고, code-review·pr·prp-implement 세 명령이 강화된 impeccable 워크플로를 따르며, (M4) 대시보드 버튼 클릭이 소스 `.md`에 obsolete 마커를 비파괴 기록하고 렌더가 그 항목을 collapse하며, 렌더러 테스트가 green**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| 드로어 전문성 | 위험 완화책·맥락이 잘리지 않고 전문 표시 | 렌더 산출 드로어에 완화 prose 전문 + markdown(목록/강조/code) 렌더 확인, "요약" 절단 부재 |
| 개요 진행중 마일스톤 | worktree별 진행중 마일스톤 노출 | 개요(기본 라우트)에 진행중 마일스톤 + worktree 식별자 표시, 멀티-worktree dogfood에서 육안 확인 |
| 명령 워크플로 | 세 명령이 강화 워크플로 반영 | code-review.md·pr.md에 audit 단계, prp-implement.md에 layout 선행 + clarify·distill 마무리가 본문에 존재 |
| (M4) 닫힌 루프 | 버튼 클릭→소스 마커 기록→렌더 collapse | 로컬 서버 버튼으로 위험 obsolete 처리 시 소스 `.md`에 `<!--mccp:resolved-->` 마커 비파괴 기록 + 재렌더 시 collapse |
| 접근성·plain-text 동등 | 색+아이콘 이중표기·드로어 키보드·STATUS.md 동등본 유지 | a11y 테스트 + STATUS.md가 드로어 전문 상세를 plain-text로 동등 노출 |
| 회귀 0 | 기존 렌더러 테스트 green | `node --test` 렌더러 스위트 통과 |

## Scope

**MVP** — M1·M2·M3. 즉 (1) 우측 드로어의 "요약" 섹션을 신규 저장소·마커 cap 확장 없이 소스(위험 완화책 prose + 해결 사유, receipt briefing, OQ 전문 등)를 truncation 없이 markdown 전문으로 재구성하고(항목 12·13), (2) 개요(기본 라우트)에 worktree별 진행중 마일스톤을 기존 `multi-session.js`/`milestone-history.js` 위에 노출하고(항목 11), (3) impeccable 검증 워크플로를 세 명령 본문에 반영한다(항목 14: code-review·pr에 audit 추가 / prp-implement에 layout 선행 + clarify·distill 마무리). 전부 read-only 렌더·명령 본문 변경 — 서버 mutation 없음.

**Out of scope**

- (M4로 이연) 대시보드 액션 버튼 + 서버 POST mutation — MVP는 read-only. M4에서 다룸.
- claude CLI spawn — 항목 10은 서버가 직접 `stale-audit/apply.js`로 마커를 쓰며 claude를 실행하지 않는다(현 환경 claude ENOENT 무관). 터미널 spawn 방식은 영구 제외.
- force-mitigate(resolved) 버튼 — M4 버튼은 **obsolete(위험에서 제외)** 만(사용자 Q2 선택). resolved 버튼은 제외(Open Question으로 재확정 여지).
- 인증·원격 접근·멀티유저·모바일 — 로컬 데스크톱 dogfood 전용 불변.
- URL-hash 필터·검색 영속 — 본 PRD 범위 밖.
- derive correlation 알고리즘 전면 재설계 — 기존 7 source/6 correlation 재사용.

## Delivery Milestones

<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | 드로어 요약→상세화 | 위험·질문·receipt·마일스톤 클릭 시 요약이 아닌 완화방법·맥락 전문을 truncation 없이 markdown(목록/강조/code/표)으로 본다. STATUS.md plain-text 동등본 동기. | complete | `.claude/plans/dashboard-interactivity.plan.md` |
| 1.2 | prose 렌더 시각 다듬기 + 리스트 강조 혼란 제거 | (a) 드로어 요약/상세가 단순 bold를 넘어 **의미 있는 줄바꿈과 heading 시각 위계**로 보기 좋게 렌더된다 — 문단 내 줄바꿈 보존(현재 공백 합침), heading은 bold 강등이 아니라 styled `.d-h`(크기/간격/색으로 위계, H15 literal h4+ 회피하되 시각은 heading답게). near-monochrome·강조색 viewport당 ≤1 불변. (b) 위험/질문 **리스트(드로어 밖)** 항목의 inline 강조(`**bold**`→흰색 `<strong>` vs 회색 `--ink-2`)가 **'확인/미확인' 같은 상태 토글로 오인**되지 않도록 정리 — 리스트 레벨 emphasis를 중립화하거나 흰색/회색 대비를 상태-신호로 안 읽히게. | complete | `.claude/plans/dashboard-interactivity-m1-2.plan.md` |
| 2 | 개요 진행중 마일스톤 + worktree | 개요(기본 라우트)에서 worktree별 진행중 마일스톤을 한눈에 본다(진행중 판정 소스·정렬·상한 plan 결정). | pending | — |
| 3 | impeccable 검증 워크플로 강화 | code-review·pr가 critique에 더해 audit까지 돌고, prp-implement가 `/impeccable layout` 선행 + `/impeccable clarify`·`/impeccable distill` 마무리를 따른다. | pending | — |
| 4 | 대시보드 액션 버튼 (후속) | 대시보드에서 위험 '제외(obsolete)'를 same-origin POST→소스 `.md` 마커로 비파괴 기록하고 렌더가 collapse한다. claude 미실행. | pending | — |

## Design Direction

본 PRD는 디자인 surface(우측 드로어·개요 레이아웃)를 건드린다. 기준은 직전 `dashboard-console-redesign.prd.md`가 확정한 **승인 콘솔 디자인**(`.claude/cache/dashboard-sample.html`)을 계약으로 따른다 — near-monochrome 토큰, hairline border, Pretendard + Lucide, native `<dialog>` 드로어, CSS `:target` 라우팅(JS 0 baseline). 본 PRD는 그 위에서:

- **드로어 전문 렌더(M1)**: 기존 `drawer-detail.js`의 `renderProseHtml` 주입 경계(escape + inline-markdown, innerHTML sink 단일)를 **반드시 보존**한 채, section을 truncation 없이 block-level markdown(목록·강조·code·표)까지 렌더로 확장. raw derive 값이 innerHTML로 새는 경로 0 유지. 강조색은 viewport당 ≤1, 정보 위계 3단계(primary→status→detail) 유지(§3.9 Output Constraints).
- **prose 렌더 시각 다듬기(M1-2)**: M1이 깐 block 렌더(`renderProseBlockHtml`) 위에서 시각 완성도를 올린다 — heading은 `<strong>` 평면 강등 대신 styled `.d-h`(크기/weight/상단 간격)로 위계를 주되 literal h4+(H15)는 회피, 문단 내 줄바꿈 정책 확정. **리스트(드로어 밖) 표면은 quiet** — 위험/질문 항목 title의 흰색 `<strong>`/회색 본문 대비가 '확인 상태'로 오인되지 않게 emphasis를 중립화(강조 렌더는 drawer = loud-on-demand 표면에 집중). near-monochrome·강조색 viewport당 ≤1·정보 위계 3단계 불변.
- **개요 진행중 마일스톤(M2)**: 기존 worker-fanout/multi-session 시각 언어 재사용. 색 단독 의미 금지(아이콘/형태 병행). worktree path는 mask 규약(`<outside-repo:basename>`) 준수.
- **(M4) 버튼 affordance**: 필수 affordance에만 Lucide 아이콘, progressive enhancement(no-JS 시 정적). 파괴적이지 않음을 시각적으로 명시(obsolete = collapse, 되돌리기 가능).
- **디자인 워크플로**: M1·M2는 impeccable 워크플로(layout → 구현 → audit/polish)로 진행 — 본 PRD 항목 14가 정의하는 강화 워크플로를 자기-적용(dogfood).
- **접근성**: 드로어 키보드 조작(Enter/Space 열기, Esc·backdrop 닫힘, focus 관리) + `prefers-reduced-motion` 대안 + STATUS.md plain-text 동등본 불변.

## Open Questions

- [ ] M4 버튼 액션 범위 — obsolete(위험에서 제외)만인가, force-mitigate(resolved)도 포함인가. 원 요청(항목 10)은 둘 다 언급, 공동작성 시 obsolete만 선택. plan 단계 재확정.
- [ ] M4 POST 액션의 CSRF/위조 방어 — same-origin 토큰 / `Origin`·`Referer` 검사 / 1회용 nonce 중 무엇. dashboard-server의 GET-only·고정 라우트·traversal-free 불변을 깨지 않는 mutation 라우트 설계.
- [ ] M4 마커 기록 경계 — 버튼이 `stale-audit/apply.js`를 in-process 호출하나 별도 spawn하나. human-gate(dashboard-audit의 증거 인용 불변)를 우회하는 force 처리의 audit trail(누가/언제/사유) 기록 형태.
- [ ] M1 드로어 markdown 렌더 범위 — inline만(현재)에서 block-level(목록·표·code-fence)까지 확장 시 주입 안전 + STATUS.md 평면화 형태. block 렌더가 기존 `renderProseHtml`/`renderProseMd` SSoT를 어떻게 확장하나.
- [ ] M1-2 heading 시각 위계 — H15(literal h4+ 금지)를 지키면서 heading을 어떻게 시각적으로 구분하나. styled `.d-h`(font-size/weight/margin-top) carve-out인가, 아니면 `<strong>` 유지하고 간격만 주나. 드로어 정보 위계 3단계(title→status→detail)와 충돌 없이.
- [ ] M1-2 문단 내 줄바꿈 정책 — 소스의 단일 줄바꿈(soft line break)을 `<br>`로 보존할지, 현행대로 공백 합침 유지할지. plan `## Summary`는 보통 흐르는 문단이라 공백 합침이 자연스럽지만, 의도된 줄 구조(주소/목록-유사 라인)는 보존이 나음. md plain-text 동등본(`renderProseBlockMd`)과의 정합.
- [ ] M1-2 리스트 강조 중립화 방식 — 위험/질문 리스트 title의 inline `**bold**`를 (i) `<strong>` 색을 본문과 동일 톤으로 낮춰 흰/회 대비 제거, (ii) 리스트 레벨에서 bold 마커를 평문화(드로어에서만 강조 렌더), (iii) 흰색을 '강조'가 아닌 다른 의미로 재배정 중 무엇. 드로어(loud-on-demand)와 리스트(quiet) 표면의 강조 정책 분리.
- [ ] M2 "진행중" 마일스톤 판정 소스 — STATE.md `milestone_hint` vs PRD body `status: in-progress` row vs 활성 worktree 게이트. 진행중 항목 정렬(worktree별/시간순)·상한.
- [ ] M3 audit가 critique retry loop(§3.9 divergent blocking)과 공존 방식 — audit는 advisory인가 게이트 blocking인가. layout 선행 + clarify·distill 마무리가 prp-implement의 기존 stage-aware routing(§3.10)과 어떻게 합쳐지나(중복 호출 회피).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| (M4) 서버 mutation 라우트가 GET-only·traversal-free 불변·CSRF 안전을 훼손 | 중 | 고 | 고정 액션 라우트 + same-origin/토큰 검사 + path-allowlist(소스 `.md`만) + 127.0.0.1 바인딩 유지. read-only MVP(M1~M3) 우선 ship으로 위험 격리. |
| M1 block-level markdown 렌더가 innerHTML 주입 경계를 약화(XSS-유사) | 중 | 고 | 기존 `renderProseHtml` escape-then-markdown SSoT 보존 + block 렌더도 동일 sink 통과 + escaping.test.js류 self-injection 페이로드 테스트 확장. |
| 드로어/개요 변경이 기존 렌더러 테스트 대량 회귀 | 고 | 중 | 섹션별 단위 테스트 유지 + 변경과 테스트 갱신 동기화 + 마일스톤별 단계 ship + section-fidelity/markdown-equivalence 테스트로 가드. |
| M3 워크플로 변경이 critique divergent blocking·dual-review 불변 약화 | 중 | 중 | audit는 critique loop(§3.9)을 대체하지 않고 보강 — divergent blocking 보존. pr/code-review는 review-only invariant(Edit/Write 없음) 유지, prp-implement만 layout/clarify/distill 적용(사용자 명시 분리). |
| M2 "진행중" 오판정(완료/폐기를 진행중으로 표시) | 중 | 중 | 판정 소스 단일화 + 불확실 시 표시 보수(거짓 진행중 회피) + milestone-history.js 완료 신호와 cross-check. |
| STATUS.md 재구성이 plain-text 소비자(스크린리더/SSH) 정보 손실 | 중 | 중 | 드로어 전문 상세를 plain-text로 동등 노출 불변 + markdown-equivalence 테스트로 회귀 가드. |
| claude ENOENT 환경 가정이 M4 설계에 새어듦 | 낮 | 중 | M4는 서버가 `stale-audit/apply.js`를 직접 호출 — claude 실행 의존 0(Out of scope에 명문화). |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-06-26.*
