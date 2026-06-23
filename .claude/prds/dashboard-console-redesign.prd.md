# Dashboard Console Redesign + Derive Data Extraction

## Problem

mccp 진행 현황 대시보드(`.claude/cache/status.html` + `STATUS.md`)는 여러 차례 점진 개편을 거쳤지만, 사용자가 "이게 디자인이냐"고 반려할 만큼 미감·정보압축이 약했다. 이번 세션에서 impeccable craft로 **Vercel 콘솔 결의 기준 샘플**(`.claude/cache/dashboard-sample.html`)을 만들어 사용자가 명시적으로 승인("좋아. 잘만들었어")했다. 그러나 (1) 실 렌더러(`html.js` + 섹션 모듈)는 이 샘플과 다른 구형 디자인을 출력하고, (2) 샘플은 전부 **더미 데이터**로 채워져 있어 실제 `.claude/` source에서 데이터를 뽑아 채우는 추출 과정이 없으며, (3) 샘플의 핵심인 우측 상세 드로어가 보여주는 항목별 상세(OQ 전문, 위험 완화책, receipt 상세, 마일스톤 요약)는 현재 derive 모델이 surface하지 않는다. 승인된 디자인과 실제 산출물 사이의 간극을 닫지 않으면, 샘플은 캐시 안의 목업으로 남고 사용자는 계속 구형 대시보드를 본다.

## Evidence

- 사용자 직접 승인: 2026-06-23 impeccable craft 세션에서 `dashboard-sample.html`을 보고 "좋아. 잘만들었어"로 기준 디자인 confirm. 폰트(Pretendard)·아이콘(Lucide)·near-monochrome 절제·우측 드로어까지 반복 피드백 후 수렴.
- 사용자 직접 관찰(반려): redesign-1/2 시도가 "Vercel 색감만 빌린 새 디자인", "이게 디자인이야?(레이아웃 깨짐)", "ai slop이 여전히 많이 보임"으로 연속 반려 — 승인된 단일 기준이 없으면 재작업이 반복됨을 입증.
- 구조적 증거: 샘플은 self-contained 단일 HTML(CSS :target 라우팅 JS 0, native `<dialog>` 드로어, symbol 기반 Lucide)로 동작 확인됨 — 렌더러 이식 가능.
- 구조적 증거: 샘플의 드로어 상세(OQ 선택지 A/B, 위험 시나리오/완화/잔여, receipt 판정·briefing·hash, 마일스톤 요약)는 현재 derive `sources/*`가 read-side로 노출하지 않는 필드를 포함 — 추출 과정 신규 필요.
- 기존 자산: derive 엔진(`scripts/derive/*`, 7 source + 6 correlation)과 섹션 모듈(`renderer/sections/*`)이 이미 존재 — 데이터 파이프라인 기반은 재사용, 추출은 그 위에 얹음.

## Users

- **Primary**: skypark207 (mccp 단독 개발자, PM-모드). 임의 mccp-installed 프로젝트에 진입해 "지금 어느 마일스톤이 진행/차단이고 다음 행동이 뭔지"를 60초 안에 훑고, 항목을 클릭해 상세만 우측 드로어로 확인하려는 상황에서 트리거됨.
- **Not for**: 외부 배포/공유 대상, 멀티유저, 모바일. 로컬 데스크톱 dogfood 전용 불변.

## Hypothesis

We believe **실 렌더러(`html.js` + 섹션 모듈 + STATUS.md)를 승인된 샘플 콘솔로 이식하고, 샘플의 모든 더미 자리(판정·4축·OQ·위험·파이프라인·타임라인·마일스톤·드로어 상세)를 derive 엔진이 실제 `.claude/` source에서 추출한 데이터로 채우면**
will **사용자가 승인한 Vercel-grade 콘솔에서 현황을 형태·색으로 즉시 파악하고 상세는 드로어로만 펼쳐 보게** for **mccp 단독 개발자**.
We'll know we're right when **`node derive/cli.js render` 산출 `status.html`이 샘플과 시각적으로 일치하고, 모든 섹션·드로어가 더미가 아닌 실 derive 데이터를 표시하며(production render에 임의 예시 데이터 0건), STATUS.md가 동등 정보를 plain-text로 담고, 렌더러 테스트가 green**.

## Success Metrics

| Metric | Target | How measured |
| --- | --- | --- |
| 시각 일치 | 샘플과 셸·토큰·아이콘·패널·드로어 일치 | 렌더 산출 `status.html`을 `dashboard-sample.html`과 육안 대조(사용자 확인) |
| 실데이터 추출 | production render 더미 0건 | 모든 섹션·드로어 값이 derive source 유래 — "임의 예시 데이터" 문자열·placeholder 부재 grep |
| 드로어 상세 추출 | 항목 클릭 시 derive 유래 상세 표시 | OQ 전문/위험 완화/receipt 상세/마일스톤 요약이 derive(필요 시 스키마 확장)에서 채워짐 |
| STATUS.md 동등본 | 새 정보 구조를 plain-text로 재구성 | STATUS.md가 판정·4축·OQ·위험·파이프라인·타임라인·마일스톤(+드로어 상세 인라인)을 담음 |
| 폰트/레이아웃 invariant | 샘플 기준 개정 + 산출물 green | H-invariant lint 계약을 샘플에 맞게 개정 후 테스트 통과 |
| 접근성 | 색+아이콘 이중표기·드로어 키보드·reduced-motion 유지 | a11y 테스트 + 드로어 focus 관리·Esc·backdrop 닫힘 + plain-text fallback |

## Scope

**MVP** — 승인된 `dashboard-sample.html`을 단일 기준으로 삼아 실 렌더러(`html.js` 토큰/레이아웃 + 섹션 모듈 + STATUS.md)를 이식하고, 샘플의 더미 자리를 derive 엔진이 추출한 실데이터로 채운다. 추출은 read-side를 우선하되, 드로어 상세 등 기존 source가 surface하지 않는 정보는 **derive/receipt 스키마 확장을 허용**한다(사용자 승인). 우측 상세 드로어(native dialog, 항목 클릭→derive 상세)를 추가하고, STATUS.md plain-text 동등본을 새 정보 구조에 맞게 재구성하며, 충돌하는 H-invariant lint 계약을 샘플 기준으로 개정한다.

**Out of scope**

- 대시보드 서빙·갱신 경로(localhost serve, live-reload, refresh trigger) — 본 작업은 렌더 산출물의 시각 surface + 데이터 추출만. 갱신 트리거는 기존 M4 trigger 계층 불변.
- 인증/원격 접근/멀티유저/모바일 — 로컬 데스크톱 dogfood 전용 불변.
- 필터링·검색·페이지네이션 — 본 redesign 범위 밖(후속 가능). 샘플도 미포함.
- derive correlation 알고리즘 전면 재설계 — 기존 7 source/6 correlation 재사용. 확장은 드로어 상세에 필요한 read-side surface + 최소 스키마 필드 추가에 한정.

## Delivery Milestones

<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
| --- | --- | --- | --- | --- |
| 1 | 콘솔 셸 + 토큰 이식 | 샘플의 앱 셸(좌측 사이드바: 프로젝트 스위처·검색·page nav·차단 alert / 상단바 중앙 페이지 타이틀 / near-monochrome 토큰 / Pretendard self-contained / Lucide symbol 아이콘 / CSS `:target` 라우팅 / 패널 head·body·foot anatomy)을 `html.js`+섹션 모듈에 이식. 기존 derive 데이터로 정적 렌더. 충돌 H-invariant 개정. | in-progress | `.claude/plans/dashboard-console-redesign.plan.md` |
| 2 | 섹션 콘텐츠 + derive 실데이터 추출 | hero 판정·4축 legend·미해결질문·위험·게이트 파이프라인 스테퍼·타임라인·마일스톤 기록을 샘플 마크업으로 렌더하고, 각 더미 자리를 derive 엔진이 `.claude/` source에서 추출한 실데이터로 채움. 추출에 필요한 read-side surface(+ 최소 스키마 확장) 추가. | pending | — |
| 3 | 우측 상세 드로어 + 드로어 derive 추출 | 항목(미해결질문/위험/타임라인/마일스톤) 클릭→native `<dialog>` 우측 overlay 드로어로 상세 표시(Esc·backdrop·키보드). OQ 선택지·위험 시나리오/완화/잔여·receipt 판정/briefing/hash·마일스톤 요약을 derive에서 추출(스키마 확장 허용). 상세 부재 시 graceful degrade. | pending | — |
| 4 | STATUS.md plain-text 동등본 재구성 | STATUS.md를 새 정보 구조(판정·4축·OQ·위험·파이프라인·타임라인·마일스톤 + 드로어 상세 인라인)에 맞게 재작성 — HTML 전용 인터랙션(드로어·라우팅) 외 전 정보를 plain-text로 동등 노출(SSH/스크린리더 fallback 불변). | pending | — |

## Design Direction

- **기준(canonical)**: `.claude/cache/dashboard-sample.html`이 이번 redesign의 **단일 시각 명세**다. 셸 구조·토큰·아이콘·패널 anatomy·드로어·copy 톤은 샘플을 계약으로 따른다. 미감 방향 재탐색은 종료 — 샘플이 그 결론이다.
- **미감 리드**: Vercel 콘솔 결 — 순수 중립 near-black(chroma 0, 상태색만 채도), hairline border 중심(그림자 최소), 비중첩 패널, 좌측 앱-셸 사이드바 라우팅 + 상단바 중앙 페이지 타이틀. PRODUCT.md anti-refs(hero-metric / AI-cream / Bloomberg 형광) 유지.
- **타이포그래피**: Pretendard(본문/제목, weight 계층 400/500/600) + 시스템 mono(식별자). **외부 폰트 self-contained 전략(vendored subset vs 로컬 번들)은 plan 결정** — offline·번들 크기 tradeoff를 plan/PR에 기록.
- **아이콘**: Lucide(symbol viewBox 기반, 16px 정확 스케일). 필수 affordance에만(사이드바/패널 헤더/버튼) — 장식 아이콘 금지.
- **인터랙션**: CSS `:target` 멀티-route(JS 0, no-JS 시 개요 default) + native `<dialog>` 우측 드로어(overlay-top, slide-in, reduced-motion 시 즉시) + copy 버튼(progressive enhancement).
- **데이터 추출 원칙(이번 PRD 핵심 신규 축)**: 샘플의 모든 더미 값은 derive 엔진이 실제 source에서 뽑은 값으로 대체된다. read-side surface 우선, 기존 source가 없는 상세(드로어)는 derive/receipt 스키마를 확장해 채운다. 추출 불가 데이터는 placeholder가 아니라 graceful degrade(드로어는 가용 정보만, 섹션은 빈 상태 메시지). 항목↔derive 데이터 매핑은 인덱스가 아닌 **안정 키**(decision_id, receipt id 등)로 한다.
- **접근성**: 색 단독 의미 전달 금지(아이콘/형태 병행) + 드로어 키보드 조작(Enter/Space 열기, Esc 닫기, focus 관리) + `prefers-reduced-motion` 대안 + STATUS.md plain-text 동등본. 기존 v1.4.2 M3 비-색 severity 마커 패턴 계승.
- **invariant 개정**: 샘플은 기존 lint 계약(H13 웹폰트 금지·H2 content-max 880px·H6 등)과 충돌한다. 충돌 룰을 샘플 기준으로 개정/폐기/신설(예: H13 → Pretendard self-contained 허용, H2 → 폭 상향, 드로어 비중첩 carve-out)하고, 개정 근거를 plan/DESIGN.md에 기록한다.
- **디자인 워크플로**: M1~M3는 impeccable 워크플로(`craft`로 이식·구현 → `audit`/`polish`로 a11y·반응형 검증)로 진행. 샘플이 이미 craft 산출물이므로 plan은 "샘플 → 렌더러 이식"의 충실도(fidelity)를 계약으로 삼는다.

## Open Questions

- [ ] Pretendard self-contained 전달 방식 — vendored subset 번들 vs 동적 subset, offline 보장과 번들 크기 tradeoff (plan 결정).
- [ ] 드로어 상세를 위한 추출 경계 — 어떤 필드가 기존 source에서 read-side로 가능하고(OQ/risk는 plan body, receipt 상세는 receipt JSON), 어떤 것이 신규 stamp(예: 마일스톤 요약)를 요구하는가 (plan 결정).
- [ ] 스키마 확장이 chain-of-custody에 미치는 영향 — receipt에 필드 추가 시 `receipt_hash` tamper-detect carve-out 패턴(v1.3.0-m2 briefing 선례) 적용 범위 (plan 결정).
- [ ] STATUS.md에서 드로어 상세 평면화 형태 — 항목별 상세를 인라인 블록으로 펼칠지, 섹션 말미에 모을지 (plan 결정).
- [ ] 기존 H1~H17 lint 계약 중 개정/폐기/신설 목록 — 샘플과의 정확한 충돌 인벤토리 (plan 결정).
- [ ] 항목↔derive 데이터 안정 키 — 샘플의 인덱스 매핑을 실데이터에서 무엇으로 대체할지(decision_id/receipt id) + 항목 수 가변 시 정렬·상한 (plan 결정).

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| 스키마 확장이 receipt chain-of-custody(hash/tamper) 훼손 | 중 | 고 | read-side surface 우선, stamp 추가 시 `receipt_hash` carve-out(deep-clone) 패턴 계승 + 마이그레이션 dry-run |
| Pretendard 외부 로드가 self-contained/offline 위반 | 중 | 중 | vendored subset 우선 검토, 실패 시 system 스택 graceful fallback — plan 정책 확정 |
| 드로어 derive 상세가 일부 source에 부재 | 중 | 중 | graceful degrade(가용 정보만 드로어 표시) + 빈 상태 메시지, placeholder 금지 |
| 대규모 렌더러 이식이 기존 섹션 테스트 대량 회귀 | 고 | 중 | 섹션별 단위 테스트 유지 + invariant 개정과 테스트 갱신 동기화 + 단계별 ship |
| H-invariant 개정이 design-gate 자기검증을 약화 | 중 | 중 | 개정 근거를 DESIGN.md/plan에 명문화 + 폐기 대신 carve-out 우선, 신설 룰로 샘플 계약 보강 |
| STATUS.md 재구성이 plain-text 소비자(스크린리더/SSH) 정보 손실 | 중 | 중 | 전 정보 plain-text 동등 노출 불변 유지 + 동등본 테스트로 회귀 가드 |

---

_Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan._
_Co-created with user on 2026-06-23 (predecessor `dashboard-pipeline-chart.prd.md` Problem·Users·Evidence 승계 + 본 세션 샘플 승인 기반)._
