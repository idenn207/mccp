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
| 3 | 섀도잉 해소 | 같은 skill의 다중 사본이 사용자에게 **보이고**, setup이 승인을 받아 정리를 제안하며, 이 저장소의 구버전 사본이 사라진다 | complete | .claude/plans/impeccable-detection-contract-m3.plan.md |
| 4 | 게이트 발화 정합 | auto 모드가 발화하는 명령이 비대화형 게이트에서 실제로 완주하고, 발화가 0인 라이프사이클 단계는 `{discovery, system}` 둘뿐이며 각각 근거가 기록·test 봉인된다 | complete | .claude/plans/impeccable-detection-contract-m4.plan.md |
| 5 | 문서·계약 드리프트 정리 | 환경변수 계약과 프로젝트 문서가 실제 코드·공식 채널과 일치한다 | complete | .claude/plans/impeccable-detection-contract-m5.plan.md |
| 6 | 이연 정리와 질문 종결 | 이 축이 스스로 남긴 이연 항목이 닫히고, PRD가 연 채로 둔 질문 3건이 측정으로 답을 얻는다 | complete | .claude/plans/impeccable-detection-contract-m6.plan.md |

M1~M3이 MVP다. M4·M5는 MVP 착지 후 재평가한다 — M4는 탐지가 고쳐져야 라이브로 관측 가능하고, M5는 게이트를 막지 않는다.

**v1.32.1 정정 — M6이 추가되며 PRD가 다시 열렸다.** 1.32.0의 CHANGELOG 노트는 «M5가 마지막 milestone이고 PRD 전체가 종료된다»고 적었고 그것이 그 시점의 사실이었다. M6은 새 능력을 추가하지 않고 M1~M5가 **자기 축에 남긴** 이연분과 이 PRD가 연 질문 3건만 닫으므로, 범위 확장이 아니라 종결의 완성이다. 다른 축으로 라우팅된 이연분(`env-contract` · `environment-doc-uniformity` · 비-impeccable `EVIDENCE_DEBT` 29건)은 M6에 **들어오지 않는다** — 그것들은 sibling PRD `env-contract-integrity`와 각 축이 소유한다.

## Open Questions

- [x] **프로젝트 로컬 skill이 해소 순서 어디에 끼는가.** 사용자 레벨이 plugin을 이긴다는 것은 실측됐으나, 공식 CLI의 기본 설치 위치인 프로젝트 로컬은 미확인이었다.
  → **M3 실측(2026-08-23): 두 채널은 애초에 경쟁하지 않는다.** project 3.5.0과 plugin 4.1.1이
  공존하는 상태에서 `Skill(impeccable:impeccable, ...)` 를 1회 호출했더니 런타임이 보고한 base
  directory가 `~/.claude/plugins/cache/impeccable/impeccable/4.1.1/skills/impeccable` 였다 — 즉
  namespaced 이름은 project 사본이 있어도 plugin 본문을 연다. bare 이름과 namespaced 이름이
  **서로 다른 두 질문**이라는 오라클의 규칙이 라이브에서 확인됐고, "우선순위"라는 질문 자체가
  잘못된 틀이었다. 남는 미측정은 bare 소스가 **둘**일 때(project + user)의 순서뿐이며, 오라클은
  그 경우 답하지 않는다(`shadowed:true`). 증거: `.claude/notes/impeccable-detection-contract-m3.md`
  Task 0 (a).
- [~] **impeccable 4.x SKILL이 plugin 설치 환경에서 도구 권한을 통과하는가.** SKILL이 선언한 도구 경로와 plugin의 실제 base가 다르다.
  → **M3 부분 실측(2026-08-23) — 전제는 참이나 영향은 없다.** 4.1.1의 `allowed-tools`가
  `Bash(node .claude/skills/impeccable/scripts/*)` 라는 **project 상대 glob**을 선언하는 것은
  확인됐고(3.5.0은 그 glob 자체가 없다), plugin base는 cache 절대경로라 매치하지 않는다. 그러나
  `node <cache-abs>/scripts/context.mjs` 는 exit 0으로 완주했다. **이 관측만으로는 판정할 수
  없다** — 측정 세션이 bypass-permissions 모드라 프롬프트가 뜰 자리가 없었다.
  대신 ambient 권한을 직접 대조해 공백을 좁혔다: `~/.claude/settings.json` allow에는 ECC receipt
  CLI 2행뿐이고 프로젝트 `.claude/settings.json` 에는 `permissions` 키가 없다. 즉 이 공백은
  **impeccable 고유가 아니라 mccp 게이트 전체가 공유하는 baseline**이며(`node ${CLAUDE_PLUGIN_ROOT}/scripts/*`
  도 덮이지 않는다), impeccable 경로만 골라 권한 축을 추가하면 나머지 게이트가 같은 공백에 있는
  채로 한 축만 특별대우하게 된다. UI10의 발동 조건("권한 때문에 게이트가 멎으면")이 성립하지
  않아 M3는 권한 축을 추가하지 않았다. **남는 잔여: 비-bypass 모드에서의 실측.** 그 측정을
  하려면 권한 모드를 바꾼 세션이 필요하다. 증거:
  `.claude/notes/impeccable-detection-contract-m3.md` Task 0 (b).
- [x] **hook 이중 등록의 실제 영향.** CLI와 plugin이 각각 별도 경로로 같은 hook을 등록한다. 양쪽 설치 시 편집마다 2회 도는지, 그리고 impeccable의 세션 종료 hook이 mccp Stop-loop과 어떻게 상호작용하는지 미측정이다.
  → **M6 구성 판정(2026-08-23): 현재 구성에서 이중 발화는 없고, Stop 상호작용은 가산적이다.**
  세 표면의 선언을 각각 읽었다 — plugin 4.1.1은 `PostToolUse`(matcher `Edit|Write`)와 `Stop`에
  등록하고, 사용자 `~/.claude/settings.json`의 impeccable 항목 둘은 `PreToolUse`(`Write|Edit|MultiEdit`)와
  `PostToolUse`(matcher **`Skill`**)이라 **어느 것도 같은 이벤트+matcher를 공유하지 않는다**.
  PRD가 우려한 이중 등록은 plugin과 npm CLI가 **동시에** 설치된 경우에만 성립하는데 CLI는 미설치다.
  Stop 축은 mccp 7그룹 + impeccable 1그룹이며, mccp Stop-loop은 자기 상태 파일로만 판정하므로 교차
  오염이 없고 남는 영향은 지연뿐이다. **잔여: CLI 동시 설치 환경의 라이브 이중 발화 관측.** 그
  측정은 M3가 닫은 섀도잉을 되살려야 해서 하지 않았다(DD7) — 위는 라이브 측정이 아니라 구성
  판정이다. 증거: `.claude/notes/impeccable-detection-contract-m6.md` Task 9 (a).
- [x] **Node 하한 불일치를 어느 쪽에 맞출 것인가.** impeccable hook은 22+를 요구하고 mccp는 20+를 명시한다. 하한을 올릴지, hook 미동작을 정상 degraded로 문서화할지.
  → **M6 결정(2026-08-23): 올리지 않는다 — 벤더가 이미 degraded를 설계했다.** 4.1.1의 hook
  command는 본문 실행 **전에** `process.versions.node` major가 22 미만이면 hook을 돌리지 않고
  `exit 0`한 뒤 `~/.impeccable/node-unsupported` marker를 한 번만 만들고 systemMessage를 한 번만
  낸다. 실패가 아니라 **자기 비활성화**다. 하한을 올리면 mccp 전 사용자가 선택적 의존 하나 때문에
  런타임을 올려야 하고 §1.1의 "번들하지 않는 선택적 의존" 계약과 어긋난다. 정상 degraded로
  문서화한다(`docs/environment/external.md` impeccable 절). 이 머신은 Node v24.11.1이라 hook이
  실제로 돌고 marker는 부재다. 증거: `.claude/notes/impeccable-detection-contract-m6.md` Task 9 (b).
- [x] **`impeccable@anthropics`라는 리터럴은 어디서 왔는가.** 과거 실재한 채널인지 추정값인지에 따라 하위 호환 부담이 달라진다.
  → **M6 판정(2026-08-23): mccp 자신이 쓴 추정값이다. 하위 호환 부담 0.** `git log -S`가 도입
  커밋을 `6da66bc feat(v0.2.6): Milestone 1 — impeccable design-review wiring`으로 지목하고, 그
  커밋은 `impeccable-detect.js`를 신규 생성하면서 `const IMPECCABLE_PLUGIN_KEY = 'impeccable@anthropics'`를
  처음 썼다 — 어떤 레지스트리에서 관측된 값이 아니다. 실제 키는 `impeccable@impeccable`이며 그
  하드코드는 아무것도 매치하지 못해 설치된 plugin을 모든 게이트에서 보이지 않게 만들었다(M1이
  반증). 과거에 실재한 채널이 아니므로 그 키로 설치된 사용자는 존재할 수 없다. **그럼에도 M6은
  리터럴을 제거하지 않는다** — `impeccable-resolve.test.js`가 legacy 정확 일치 케이스로 봉인하고
  있고 탐지 동작 변경은 M1 계약의 재개봉이다. 판정만 기록한다. 증거:
  `.claude/notes/impeccable-detection-contract-m6.md` Task 9 (c).
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
