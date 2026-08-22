# impeccable 탐지 계약 (Detection Contract)

## Problem

mccp는 impeccable이 설치됐는지를 **하나의 boolean**으로 판정하고, 그 값에 디자인 게이트 발화 · Codex 리뷰 범위 분할 · `/mccp:setup` 설치 권유 · SessionStart 경고가 모두 매달려 있다. 그런데 그 판정이 impeccable의 실제 배포 채널과 어긋나 있다 — 공식 채널이 넷인데 mccp는 두 개의 잘못된 리터럴과 하나의 잘못된 경로만 본다.

결과는 **정상 설치자에게 디자인 축이 조용히 꺼지는 것**이다. plan 단계는 "impeccable 없음"을 적고 통과하고, PR 단계에 가서야 차단된다. 그때 사용자가 받는 진단은 거짓이므로(실제로는 설치돼 있다) 취할 수 있는 올바른 행동이 없고, 남는 선택지는 감사 부채를 남기는 env 우회뿐이다. 방치하면 mccp의 dual-review 중 디자인 축이 발화하지 않는 상태가 사용자 전원의 기본값으로 굳는다 — `/mccp:setup`이 권하는 경로가 그 상태를 직접 생산하기 때문이다.

## Evidence

- **실측 (2026-08-22, 이 저장소)** — impeccable 4.1.1 plugin이 정상 설치된 상태에서 `probeSkillAvailable() = false`, 탐지 결과 `reason: "skill-missing"`. 같은 세션의 SessionStart 배너가 `[mccp] Missing dependencies: impeccable`을 그대로 출력했다.
- **라이브 관측 (운영자, 다른 프로젝트)** — plan 단계의 GATE-A가 발화하지 않았고, 원인이 사용자 레벨에 남은 구버전 사본이 plugin 4.1.1보다 **우선 해소**된 것이었다. 실행으로 확인됨. 그 사본을 지우면 이번에는 mccp 디자인 게이트가 조용히 꺼진다 — 양쪽 모두 실패인 상태.
- **채널별 버전 격차 (실측)** — npm registry `impeccable` latest = **3.6.0**(최종 수정 2026-08-14), Claude Code plugin = **4.1.1**. 동일 저장소(`github.com/pbakaus/impeccable`)의 두 채널이 major 하나만큼 벌어져 있다. 운영자가 다른 프로젝트에서 "3.x로 구현할 것인가"를 되묻는 상황을 겪었다.
- **`/mccp:setup`이 문서에 없는 명령을 권한다** — 공식 설치 경로는 `npx impeccable install` 하나인데, setup은 `npm install -g impeccable` + `impeccable skills install`을 실행한다. 후자는 공식 문서 어디에도 없고, 그것이 배포하는 자리가 구버전 섀도잉을 만든다.
- **공식 계약과 극성이 반대인 무시 규칙** — `/mccp:setup`이 모든 사용자 저장소에 심는 `.impeccable/` 규칙이 공식이 commit하라는 파일을 무시하고, 생성물이라는 파일을 추적한다.
- 전체 근거·전제·판정: [`.claude/_meta/2026-08-22-impeccable-plugin-channel-migration.md`](../_meta/2026-08-22-impeccable-plugin-channel-migration.md) (전제 27건 · 공식 문서 대조 완료).

## Users

- **Primary — mccp를 새로 설치하는 사용자.** `/mccp:setup`을 그대로 따르므로 **전원이 자동으로 이 경로에 들어온다.** 본인이 선택한 것이 아니라 도구가 안내한 결과라는 점에서 가장 무방비하다.
- **Primary — 기존 npm CLI(3.x) 사용자.** 지금은 우연히 동작한다(구버전 경로가 mccp가 보는 유일한 fallback이므로). 강제 마이그레이션 대상이 아니며 **계속 동작해야 한다.**
- **Primary — CLI에서 plugin(4.x)으로 이행하는 사용자.** 이행하는 순간 탐지가 깨지고, 구버전 잔재를 지우면 게이트가 꺼진다. 운영자 본인이 이 분절이다.
- **Not for** — impeccable을 쓰지 않는 사용자. 디자인 축이 없는 백엔드 전용 작업에서 이 계약은 무동작이어야 하며, 없는 도구를 설치하라고 압박하지 않는다.

## Hypothesis

우리는 **채널-무관 다중소스 탐지**(설치원을 전부 열거하고 · 실제 `version`을 판독하고 · 실제로 해소될 본문 하나를 지목하는 것)가 **"설치했는데 게이트가 조용히 꺼진다"** 를 해소할 것이라 믿는다 — mccp 사용자 3분절(신규 · 기존 CLI · 이행자) 모두에게.

우리가 옳았다는 것은 **어느 공식 채널로 설치했든 환경변수 우회 없이 디자인 게이트가 발화하고, 탐지가 보고한 본문과 실제로 열리는 본문이 일치할 때** 안다.

> 설계 제약 (운영자 확정): env 우회는 **외부에 따로 설치한 경우를 위한 장치**다. 공식 채널로 default 설치한 사용자에게 env 설정을 요구하는 것은 의도된 사용법이 아니라 결함이다.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| env 우회 사용 | **0건** — `MCCP_IMPECCABLE_SKILL` · `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` 없이 plan→PR 완주 | 정상 설치 환경에서 라이브 완주 1회 |
| 탐지 ↔ 실제 발화 일치 | **100%** — 탐지가 지목한 본문과 게이트가 실제로 여는 본문이 동일 | 채널 조합 매트릭스: plugin 단독 · CLI 단독 · 양쪽 공존 · 프로젝트 로컬 포함 |
| SessionStart 오탐 | **0건** — 설치된 환경에서 "Missing dependencies: impeccable" 미발화 | 배너 관측 |
| 무시 규칙 정합 | **일치** — provision 블록이 공식 commit/ignore 구분과 어긋나지 않음 | 공식 문서 대조 |
| *(M4)* 라우팅 완주 가능성 | auto 모드가 실제 발화하는 명령이 전부 **비대화형으로 완주 가능** | 라우팅 오라클 출력 × 명령별 차단 조건 대조 |

두 번째가 핵심이다. 운영자가 실측한 "구버전이 신버전을 이긴다"가 정확히 이 축의 실패이고, **`available: true` 하나로는 그 실패를 표현할 수 없다.**

## Scope

**MVP** — 탐지가 실제 설치 상태를 정직하게 보고하고, `/mccp:setup`이 그 상태를 망가뜨리지 않으며, 섀도잉이 보이는 것. 즉 아래 M1·M2·M3.

**Out of scope**

- **라우팅 카탈로그 확장** — 명령 추가·삭제가 **0건**임이 SKILL.md 대조와 공식 분류 대조 양쪽으로 확인됐다. 고칠 것이 없다.
- **a11y-architect 자동 발화** — 트리거가 이 계약과 독립이라 영향받지 않음이 확인됐다.
- **게이트 lenient/strict 비대칭 재설계** — 기준(write action)이 명시적이고 방어 가능하다. 입력이 참이 되면 의도대로 작동한다. **MVP 이전에 완화하면 진짜 미설치까지 통과시킨다.**
- **강제 마이그레이션** — 어느 채널도 공식적으로 폐기되지 않았고, 운영자가 명시적으로 배제했다.
- **impeccable 자체의 결함** — detector 위양성 등은 별개 축이다.
- **Node 하한 상향 결정** — 미해결 질문으로 남긴다(아래).
- **impeccable 4.x가 도입한 프로토콜 채택** — Modes(Persuade/Operate/Read/Experience) · `craft-floor` 편집 전 로드 · surface brief. mccp 문서·skill이 아직 구 `register` 개념을 전제하지만, **탐지가 고쳐지기 전에는 검증할 수 없다.**

## Delivery Milestones

<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | 정직한 탐지 | 어느 공식 채널로 설치했든 mccp가 "설치됨"으로 인식하고, **버전과 설치원과 실제로 열릴 본문**을 함께 보고한다 | complete | .claude/plans/impeccable-detection-contract-m1.plan.md |
| 2 | setup·경고 정합 | `/mccp:setup`이 공식 명령을 권하고, 설치된 사용자에게 더 이상 설치를 권하지 않으며, 저장소에 심는 무시 규칙이 공식 계약과 일치한다 | complete | .claude/plans/impeccable-detection-contract-m2.plan.md |
| 3 | 섀도잉 해소 | 같은 skill의 다중 사본이 사용자에게 **보이고**, setup이 승인을 받아 정리를 제안하며, 이 저장소의 구버전 사본이 사라진다 | pending | — |
| 4 | 게이트 발화 정합 | auto 모드가 발화하는 명령이 비대화형 게이트에서 실제로 완주하고, 발화가 0인 라이프사이클 단계가 없다 | pending | — |
| 5 | 문서·계약 드리프트 정리 | 환경변수 계약과 프로젝트 문서가 실제 코드·공식 채널과 일치한다 | pending | — |

M1~M3이 MVP다. M4·M5는 MVP 착지 후 재평가한다 — M4는 탐지가 고쳐져야 라이브로 관측 가능하고, M5는 게이트를 막지 않는다.

## Open Questions

- [ ] **프로젝트 로컬 skill이 해소 순서 어디에 끼는가.** 사용자 레벨이 plugin을 이긴다는 것은 실측됐으나, 공식 CLI의 기본 설치 위치인 프로젝트 로컬은 미확인이다. **M1의 정확도를 직접 좌우한다.**
- [ ] **impeccable 4.x SKILL이 plugin 설치 환경에서 도구 권한을 통과하는가.** SKILL이 선언한 도구 경로와 plugin의 실제 base가 다르다. 권한 프롬프트가 실제로 뜨면 **탐지를 고쳐도 비대화형 게이트에서 멎는다** — MVP 성공 여부를 뒤집을 수 있는 유일한 항목이다.
- [ ] **hook 이중 등록의 실제 영향.** CLI와 plugin이 각각 별도 경로로 같은 hook을 등록한다. 양쪽 설치 시 편집마다 2회 도는지, 그리고 impeccable의 세션 종료 hook이 mccp Stop-loop과 어떻게 상호작용하는지 미측정이다.
- [ ] **Node 하한 불일치를 어느 쪽에 맞출 것인가.** impeccable hook은 22+를 요구하고 mccp는 20+를 명시한다. 하한을 올릴지, hook 미동작을 정상 degraded로 문서화할지.
- [ ] **`impeccable@anthropics`라는 리터럴은 어디서 왔는가.** 과거 실재한 채널인지 추정값인지에 따라 하위 호환 부담이 달라진다.
- [x] **이미 커밋된 `.impeccable/design.json`을 어떻게 할 것인가.** 규칙을 바꿔도 기존 추적 파일은 남는다. untrack 여부는 사용자 결정 영역이다.
  → **M2 결정: tracked로 남긴다(UI7). untrack하지 않는다.** 근거는 셋이다. (1) provisioner는
  자동 untrack하지 않는다는 기존 계약이 있고 `setup.md` Phase 5가 그것을 명시한다. (2) untrack
  커밋은 팀원의 체크아웃에서 파일을 삭제하므로 사용자 결정 영역이라는 이 질문의 전제 그대로다.
  (3) 그 결과 provisioner의 pollution 스캔이 이 파일 1건을 매번 보고하게 되는데, 그것은 결함이
  아니라 "규칙과 이력이 어긋나 있다"는 정직한 관측이다. 반복 보고의 노이즈를 줄이는 축(예외
  목록 또는 grandfathered 표기)은 `codex-findings-backlog.md`로 이연했다. 상세는
  `docs/gate-design.md#impeccable-detection`의 `#### setup·경고 정합 (M2)`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 탐지를 고쳐도 도구 권한 때문에 게이트가 멎는다 | 중 | **높음** — MVP가 목표를 달성하지 못함 | M1 착수 **전에** 라이브 발화 1회로 확인. 실패 시 MVP 범위에 권한 축을 추가 |
| 회귀 test가 잘못된 리터럴을 고정하고 있어 수정이 붉게 나온다 | **높음** — 이미 확인됨 | 중 | 코드와 fixture를 같은 단위로 다룬다 |
| 다중소스를 인정하면 "무엇이 실제로 열리는가"를 mccp가 추정하게 된다 | 중 | 중 | 추정하지 않는다 — 열거하고 **관측된 우선순위만** 보고한다. 모르면 모른다고 보고 |
| 구버전 사본 제거가 문서 링크를 깨뜨린다 | **높음** — 6곳 이상 확인됨 | 낮음 | M3 안에서 함께 정정. 되돌리려면 공식 설치 한 줄이면 된다 |
| 무시 규칙 극성을 바꾸면 기존 저장소의 커밋 이력과 어긋난다 | 중 | 낮음 | 규칙만 교체하고 이미 추적된 파일은 건드리지 않는다(기존 provision 관례와 동일) |
| 공식 문서에 없는 동작(명령별 차단 분기)에 M4가 의존한다 | 중 | 중 | M4 착수 전 재확인. 근거가 실물뿐임을 PRD에 명시했고, 실물이 바뀌면 함께 무효화된다 |

## Design Direction

> impeccable unavailable, skipped (auto-fallback): skill-missing

이 PRD가 다루는 결함이 이 PRD 자신에게 그대로 적용됐다. impeccable 4.1.1은 이 머신에 정상 설치돼 있으나 탐지가 `skill-missing`을 반환해 PRD 단계 디자인 방향 수립이 건너뛰어졌다. plan-prd는 receipt를 쓰지 않으므로 게이트를 막지는 않는다 — 다만 **이 줄 자체가 Problem 절의 실측 증거**다.

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-08-22.*
*Problem · Users · Hypothesis(제약 포함) · MVP 경계 · CLI 대우 · 섀도잉 처리 강도 · 구버전 사본 거취는 사용자 답변. Success Metrics · Milestone 분해 · Out of scope · Risks는 운영자 위임에 따른 assistant 판단 — 검토 대상.*
