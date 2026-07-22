# Plan: Multi-Session Work Loop — M1 (측정 설계)

**Source PRD**: `.claude/prds/multi-session-work-loop.prd.md`
**Selected Milestone**: M1 — 측정 설계
**Complexity**: Medium

## Summary

M1은 PRD의 7개 milestone 중 **유일한 무변경 단계**다. 산출물은 설계 문서와 라벨 규약뿐이며 데이터 수집 0을 수용 조건으로 갖는다. 목적은 지표를 계산하는 것이 아니라 **이후의 측정이 반박 가능해지도록 분모·결함 정의·관측 창·표본 유효 범위를 사전에 고정**하는 것이다.

GROUND 실측이 PRD Evidence의 전제 하나를 뒤집었다. PRD는 *"데이터는 있는데 판정을 안 한다"* 고 적었으나, 실제로는 **C계열 지표가 필요로 하는 구조화 필드가 채워진 적이 없다**(receipt 121건 중 findings 보유 1건, `resolution.accepted`/`rejected` 빈 배열 120건, `codex_verdict` 부재 90건). 다만 **구조화 필드의 부재가 곧 소급 불가는 아니다**(Codex R1 F1) — findings는 PR body 산문으로 97/108건 존재한다. 따라서 M1은 소급을 *선언으로 닫지 않고* **recoverability 프로토콜과 임계를 정의**한 뒤, 그 프로토콜이 임계에 미달할 때만 불가로 판정한다.

두 번째 실측이 결함 정의의 형태를 바꿨다. 파일 겹침 기준 후속수정 지연은 **p50 0.23일 · 30일 내 100%**다(101 pair). 즉 이 저장소에서 *"창 W 안의 같은 파일 재수정"* 은 결함이 아니라 **정상 순차 작업의 기본 상태**이며, W를 아무리 잘 골라도 판별력이 생기지 않는다. 결함 정의는 W가 아니라 **판별 기준**(revert / fix-type / finding 귀속)이 담당해야 하고, W는 단일 숫자가 아니라 **민감도 밴드**로 보고해야 한다(Codex R1 F3).

> Phase 2.5 fan-out은 발화했으나(`ok-run`, fleet 4 예약) 워크플로가 `fleetKeys` 미전달을 감지해 runaway cap 우회 방지를 위해 **1개로 fail-closed 강등**했고, 그 1개 결과는 본 milestone이 아닌 orchestration 내부를 분석해 사용 불가였다. Phase 2.5.3 fail-open 계약대로 인라인 Pattern Grounding으로 대체하고 결과는 주입하지 않는다. 예약은 `--actual 1`로 정정 완료(`delta -3`).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 측정 프로토콜 문서 | `docs/v1.4.0-multi-session/m3-friction-metric.md` | 스키마 → 이벤트 taxonomy → 집계 규칙 → dogfood 프로토콜 → retention 순의 절 구성. 지표 1개를 문서 1건으로 단일 목적화 |
| 스키마 명세 문서 | `docs/v1.4.0-multi-session/session-ledger-schema.md:1-45` | 번호 절 + `Field / Type / Required / Producer / Notes` 5열 표 + 상대경로 cross-link. canonical 이름을 *not X* 형태로 못박음 |
| freeze 레지스트리 | `.claude/plans/codex-findings-backlog.md:8` | append-only 표. 흡수돼도 행을 지우지 않고 **ABSORBED** 주석으로 audit trail 보존 |
| 문서 내 재현 명령 | `docs/v1.4.0-multi-session/m3-friction-metric.md:62-68` | 집계 수치를 산문으로 주장하지 않고 bash 블록으로 재현 경로를 함께 제시 |
| 한계의 정직한 기록 | `.claude/prds/multi-session-work-loop.prd.md:37-47` | "측정 가능성의 한계" 절처럼 반증 요인을 별도 절로 분리해 명시 |
| Naming | `docs/v1.3.0-observability/schema-surface.md` | `docs/<cycle-name>/<single-purpose>.md` — cycle 디렉토리 하위 단일 목적 파일 |
| version bump | CLAUDE.md §3.7 | 단일 milestone ship = patch 자리. `plugin.json` + user-visible footer 동기 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `docs/multi-session-work-loop/measurement-design.md` | CREATE | M1 핵심 산출물. 지표 10개(A1-A4/B1-B3/C1-C3)의 분모·분자·소스·산출식·무결성 검사·소급 가부를 확정 |
| `docs/multi-session-work-loop/measurement-feasibility.md` | CREATE | 소급 판정의 **근거 부록**. 실측치 + 재현 명령 + recoverability 프로토콜과 임계 |
| `docs/multi-session-work-loop/label-protocol.md` | CREATE | 라벨 규약 — 결함(C3)·실질 수정(C2)·해소 유형(C1) 판별 기준과 사람 감사 표본 절차 |
| `docs/multi-session-work-loop/large-cohort-registry.md` | CREATE | 대형 작업 코호트 **선정 규칙** + 사전 지정 freeze + 검정력·커버리지 게이트 |
| `.claude/prds/multi-session-work-loop.prd.md` | UPDATE | M1 행 `pending → in-progress` + Plan 셀 · Open Question 4건 closure · Evidence 전제 정정 |
| `.claude/plans/multi-session-work-loop-m1.plan.md` | CREATE | 본 plan (Codex 게이트 산출물 포함) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `→ 1.22.5` — §3.7 milestone 의무 (Codex R1 F2). **1.22.4가 아닌 이유**: `durable-evidence-substrate` chore가 1.22.4를 선점하고 그쪽이 선행이다(§순서). §3.7 forward-only reconcile |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 문자열 동기 (§3.7 footer drift 회피) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived version 줄 동기 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | **네 번째 version surface** — footer 버전을 assert하는 회귀 테스트. 하드코딩된 `v1.22.3`을 `plugin.json` 파생으로 교체 (PR-Codex R1 F1) |
| `CHANGELOG.md` | UPDATE | M1 행 추가 |

**"코드 변경 0"의 해석 (Codex R1 F2 흡수)** — PRD 제약은 *동작 코드* 0을 뜻하며 릴리스 메타데이터를 면제하지 않는다. §3.7은 milestone PR에 `plugin.json` bump를 의무로 걸고, 이를 건너뛰면 M2의 bump가 두 milestone 상태를 한 버전에 뭉갠다. 따라서 `plugins/mccp/**` 변경을 **version surface 파일로 allowlist**하고, 그 diff가 버전 문자열 외 라인을 포함하지 않음을 Validation에서 기계 검증한다. 계약을 어기지도, 조용히 개정하지도 않는 유일한 경로다.

**allowlist는 3개가 아니라 4개다 (PR-Codex R1 F1 흡수)** — 초판은 version surface를 `plugin.json` + renderer 2종으로 셌고, 그게 틀렸다. `renderer/tests/i18n-surface.test.js`가 그 footer 문자열을 `v1.22.3`으로 **하드코딩 assert**하고 있어서, bump가 그 테스트를 빨갛게 만든다. 실측: main에서 renderer 스위트는 667개 중 1개 실패(선재), bump 후 **3개 실패**. 즉 이 milestone은 자기가 만든 회귀를 안은 채 ship될 뻔했다.

이게 통과한 이유는 CHECK 10의 glob(`lib/tests/*.test.js`)이 **`lib/renderer/tests/`를 아예 스캔하지 않기** 때문이다 — 유일한 기계적 강제 수단에 디렉토리 크기의 사각이 있었다. 흡수는 두 겹이다:

- 테스트를 `plugin.json`에서 **파생**시킨다(값 교체가 아니라 — 교체는 다음 bump에 같은 실패를 되돌려 놓는다). 이로써 version-surface drift 계열이 구조적으로 닫힌다
- **CHECK 11**을 신설해 renderer 스위트를 회귀 대상에 포함시킨다(알려진 선재 실패 1건 외 0). 사각을 만든 것이 검사 부재였으므로 흡수도 검사여야 한다

이 테스트 파일은 **순수 버전 치환이 아니므로 CHECK 2c의 전문 대조 대상이 아니다**(하드코딩 리터럴을 require 파생으로 바꾸는 구조 변경이다). CHECK 2c가 지키는 명제는 "*렌더 출력*이 버전 외에 안 바뀌었다"이고, 테스트 파일은 렌더 출력이 아니다. 대신 CHECK 11이 그 파일의 정당성을 검증한다 — 스위트가 초록이면 파생이 옳고, 빨가면 틀렸다.

## Tasks

### Task 1: 측정 가능성 실측 부록 (`measurement-feasibility.md` CREATE)

- **Action**: GROUND 실측치를 문서로 고정하고 각 수치마다 재현 bash 블록을 병기한다. 최소 항목:
  - receipt 코퍼스 121건의 **구조화 필드** 공백 — findings 보유 1건 / `accepted`·`rejected` 빈 배열 120건 / `codex_verdict` 부재 90건
  - 시간축 anchor — receipt에 timestamp 필드 부재, `head_sha` 121/121 **unreachable**(squash-merge가 feature 커밋 폐기), `base_sha` 121/121 reachable(하한 anchor, 2026-06-03~07-15)
  - findings 실소재지 — PR body 산문. `## Codex Review` 97/108, YAGNI Triage 46건, **canonical 표 형식 파싱 가능 2행**
  - 후속수정 지연 분포 — 101 pair, p50 0.23d / p90 1.71d / p95 3.80d / ≤7d 99% / ≤30d 100%
  - 판별 신호 base rate — PR title `fix(` 15/108, `revert` 0/108
  - backlog 6행 / PR 108건(`mergedAt`+files 완비)
  - **completion-ledger 29건 — "완비"가 아니다** (본 plan 작성 후 별도 조사에서 드러남, 2026-07-22):
    - `completed_at`·`commit_sha`·`plan_basename` 링크 필드는 완비 → A1의 *연결* 용도로는 유효
    - 그러나 판정 필드 `verdict`는 **29/29 전부 `converged`** — 값이 하나뿐이라 **판별력이 0**이다. 어떤 품질 지표의 입력도 될 수 없다
    - ship receipt와 대조 가능한 것은 **10건뿐**이고 그중 **3건이 거짓 양성**(receipt는 `codex_verdict` divergent/skipped인데 ledger는 converged). 나머지 19건은 receipt가 gitignore로 소실돼 **감사 자체가 불가능**
    - 역방향 누락도 있다 — ship receipt 33건 중 **23건은 대응 ledger 엔트리가 없다**. 즉 ledger는 ship의 완전한 기록이 아니다
    - 근본 원인은 `completion-ledger/index.js:96`이 `resolution.converged`(v1.20.3이 이미 신뢰 불가로 판정한 always-true 필드)를 보고 `codex_verdict`를 안 보는 것. 수정은 본 milestone 밖(§순서)
  - **이것이 본 PRD 최초의 *측정된* 게이트 실효 사례다** — PRD는 C계열을 두고 *"검사가 실제로 맞았는지 한 번도 측정된 적이 없다"* 고 적었는데, 여기 하나가 있다: ship 승인 술어가 **100% 통과**를 찍으면서 대조 가능한 것 중 **30%가 거짓**이었다. 측정 설계가 왜 필요한지의 실증이므로 부록에 사례로 등재한다
  - 토글 96(코드) / 55(CLAUDE.md) / 38(ENVIRONMENT.md)
  - A2 소스 부재 — `context-current.json` 미존재, session ledger 0건
- **Mirror**: `m3-friction-metric.md:62-68`의 "주장 대신 재현 명령" 형식
- **Validate**: 문서 내 모든 bash 블록이 문서에 병기된 기대값과 일치. 불일치 시 exit 1

### Task 2: 소급 recoverability 프로토콜 + 임계 (`measurement-feasibility.md` 계속) — Codex R1 F1 흡수

- **Action**: 소급 가부를 **선언하지 않는다**. 대신 계열별 recoverability 프로토콜과 사전 임계를 정의하고, 임계 미달일 때만 불가 판정이 성립하도록 한다.
  - **프로토콜 정의** — (1) PR body의 `## Codex Review` / YAGNI 산문을 층화 표집, (2) finding을 후속 PR·revert 창에 연결 시도, (3) 모호 행은 사람이 판정, (4) **커버리지와 검정력을 기록**, (5) 사전 임계 미달 시에만 해당 지표를 소급 불가로 확정
  - **사전 임계를 숫자로 고정** — 표집 크기, 파싱 성공률 하한, 사람 판정 일치율 하한, 셀당 최소 표본. 임계는 프로토콜 **실행 전에** 적힌다(사후 조정 금지)
  - **실행 경계** — 프로토콜 *정의*는 M1, *실행*은 M2. M1은 기존 아티팩트를 읽는 **커버리지 probe**까지만 허용하며 신규 레코드를 쓰지 않는다(PRD "데이터 수집 0" 준수)
  - **현 시점 판정** — C1·C2·C3은 "불가"가 아니라 **`recoverability-undetermined`**. A2·A4·B2는 텔레메트리 자체가 없어 프로토콜 대상이 아니므로 불가. B3 가능, **A1은 forward-only(소급 baseline 없음)**, B1 부분
  - **A1은 forward-only로 확정한다 (Codex R3 F2, 운영자 결정 2026-07-22)** — 원래는 "completion-ledger가 완비라서 부분 가능"이었으나, 위 실측대로 ledger는 ship의 완전한 기록이 아니고(33건 중 23건 미기록) `verdict`가 단일값이라 신호 0이라 **대조 소스로 쓸 수 없다**. §4 recoverability 프로토콜은 C1 전용이라 A1 recovery 절차를 정의하지 않는다. 따라서 A1은 소급 상한을 프로토콜에 맡기지 않고 **소급 baseline을 아예 만들지 않으며**, M2가 착수·종료 이벤트로 전향 수립한다(A2·A4와 동일). ledger를 A1 소급 대조에 재사용하는 것은 손상된 술어 재사용이라 금지한다
  - 시간축 층화는 `base_sha` commit date만 유효함을 명시
- **Mirror**: PRD `측정 가능성의 한계` 절(`.claude/prds/multi-session-work-loop.prd.md:37-47`)의 교란 요인 열거 형식
- **Validate**: 어떤 C계열 지표도 프로토콜 없이 불가로 선언되지 않음. 임계 4종이 전부 숫자로 존재

### Task 3: 지표 명세 본문 (`measurement-design.md` CREATE)

- **Action**: 지표 10개를 각각 **6항목 고정 라벨**(`분모` / `분자` / `소스` / `산출식` / `무결성 검사` / `소급 가부`)로 명세한다. 라벨은 Validation이 기계 검증하므로 문자열을 임의 변경하지 않는다.
  - PRD anti-gaming 표(`prd.md:105-116`)를 **산출 시점 실행 검사**로 번역 — 예: B1은 두 소스 독립성을 산출 시점에 검증하고 동일 소스 파생이면 지표 무효, B2는 동시 세션 쌍 수를 분모로 함께 보고하고 분모 0이면 무효
  - 작업 단위 정의(PRD freeze)를 첫 절에 재기재하고 변경 금지를 명시
  - C2·C3은 **관측 전용**이며 라벨 프로토콜 확립 전 의사결정 사용 금지를 명세 안에 못박음
  - **A3의 `산출식`은 실제 tokenizer를 지정한다** — PRD의 "약 46,000 토큰"은 측정 방법이 적혀 있지 않고, 바이트 기반 교차확인(139,335B)은 한국어 UTF-8에서 신뢰할 수 없다(4B/tok 가정 시 ~35k로 24% 괴리). A3 목표가 *"절반 이하로 감축"* 이라 baseline이 방법과 함께 고정되지 않으면 **목표 자체가 반증 불가**다
  - M2가 전향 기록해야 할 이벤트 목록을 지표에서 역산(착수·종료, 인계 항목, 충돌, finding 생성·해소) — **M2 착수 입력이지 M1이 구현하지 않음**
- **Mirror**: `session-ledger-schema.md`의 필드표 + canonical 이름 못박기
- **Validate**: 지표 10개 각각에 6개 라벨 전부 존재(누락 1개라도 exit 1)

### Task 4: 라벨 규약 (`label-protocol.md` CREATE) — Codex R1 F3 흡수

- **Action**: 결함·실질수정·해소의 판별 기준을 확정한다. **핵심 변경: 판별력은 창 W가 아니라 판별 기준이 담당한다.**
  - **파일 겹침은 결함 신호가 아님을 실측으로 명시** — 101 pair의 후속수정 지연 p50 0.23d, 30일 내 100%. `창 W 안 같은 파일 재수정 = 결함`으로 정의하면 **전 이력이 결함으로 분류**된다. 이 반례를 규약 본문에 기록
  - **결함 정의(C3)** — 파일 겹침 **AND** 판별 기준 충족. 판별 기준 후보와 base rate를 함께 고정: revert(0/108), fix-type PR(15/108), 명시적 finding 귀속. 유형별 분리 계수
  - **W는 단일 숫자가 아니라 민감도 밴드** — {1, 3, 7, 14, 30}일 전 구간을 함께 보고하고, 결론이 밴드 선택에 따라 뒤집히면 그 사실 자체를 결과로 보고한다. 밴드 집합을 freeze하고 사후 변경 금지
  - **"실질 수정"의 기계 판별(C2)** — 판별식을 정의하되 입력(구조화 finding + 귀속 diff)이 현재 미기록임을 명시하고, M2 전향 계측 전 C2 산출 금지를 규약으로 건다
  - **해소 유형 분리(C1)** — 강등·기각은 해소로 계상 금지(PRD anti-gaming C1)
  - **감사 표본 절차** — 표본 수, 추출 방법, 불일치 시 지표 무효화 규칙
- **Mirror**: `m3-friction-metric.md:40-56`의 taxonomy 번호 열거
- **Validate**: 밴드 5개 전부 명시. 결함 정의가 파일 겹침 단독이 아님. 반례 실측치 인용 존재

### Task 5: 대형 코호트 선정 규칙 + freeze (`large-cohort-registry.md` CREATE) — Codex R1 F3 흡수

- **Action**: 코호트를 **고르는 것이 아니라 규칙으로 유도**한다. 규칙을 먼저 고정하고 그 규칙의 출력이 코호트가 된다.
  - **선정 규칙은 착수 전 불변 메타데이터만 사용** — 사후에 알 수 있는 값(실제 소요 세션 수, 실제 파일 수, 완주 여부)은 입력에서 배제한다. 허용 입력: PRD milestone이 선언한 산출물 수, 선언된 Open Question 수, 소스 PRD의 Risk 수 등 **착수 시점에 이미 문서에 적혀 있는 값**
  - **입력 스냅샷을 고정한다 (R2-F3 흡수)** — "불변 메타데이터"라는 말만으로는 불변이 되지 않는다. 실제로 **본 plan의 Task 6이 같은 변경 안에서 그 PRD를 편집**하므로(milestone status·Open Question·Evidence), 규칙의 입력이 규칙을 쓰는 도중에 움직인다. 이는 R1-F3이 지적한 선택 편향이 더 형식적인 옷을 입고 살아남은 것이다. 따라서:
    - 코호트 도출에 **사용한 PRD 내용의 sha256을 레지스트리에 기록**하고, 그 스냅샷을 `docs/multi-session-work-loop/cohort-input-snapshot.md`로 **복사 보존**한다
    - 도출은 **스냅샷만 보고 재현 가능**해야 한다 — 레지스트리 각 행에 규칙 입력값(선언 산출물 수·OQ 수·Risk 수)을 함께 싣는다
    - **Task 5는 Task 6보다 먼저 실행한다**(PRD 편집 전 스냅샷 확보). 순서가 뒤집히면 스냅샷이 편집 후 상태를 담아 무의미해진다
  - **임계와 함께 규칙을 freeze**하고, 규칙을 적용해 나온 코호트를 **3개 이상** 등록. 규칙이 3개 미만을 산출하면 임계를 낮추는 것이 아니라 **반증 조건 미충족으로 기록**한다
  - **수용 게이트** — 코호트 등록 전 커버리지·검정력 최소 조건을 검사하고 미달 시 레지스트리를 accept하지 않는다
  - freeze 규칙 — 사후 교체·재정의 불가. 코호트 축소는 반증 조건 실패로 계상
- **Mirror**: `codex-findings-backlog.md:8`의 append-only + 행 보존 audit trail
- **Validate**: 코호트 = 임계 규칙 출력(rank 규칙 회귀 금지). 미달 시 PRD 충족 불가 명시 기록(IF3). 각 행에 규칙 입력값·지정 시점 존재. 사후 메타데이터 컬럼 부재

### Task 6: PRD 갱신 + version surface + CHANGELOG

- **Action**:
  - Delivery Milestones M1 행 `pending → in-progress`, Plan 셀에 본 plan 경로
  - Open Questions 4건(`결함의 정의` / `실질 수정의 기계 판별` / `소급 감사의 유효 범위` / `대형 작업 코호트의 기준`) 체크 + 해소 문서 링크
  - **Evidence 정정** — "데이터는 있는데 판정을 안 한다"를 실측에 맞게 수정하고 `measurement-feasibility.md` 링크. 정정 이력을 남겨 원문 주장이 언제 왜 바뀌었는지 추적 가능하게 함
  - **PRD 수치 baseline 정정** (재검토 실측 대조) — receipt `125 → 124`(파싱가능 121), PR `105 → 108`, CLAUDE.md `777줄 → 782줄`, B3 문서화 `76 → 82`(코드 전용은 `20 → 14`). 각 정정에 재현 명령을 병기
  - **M1 milestone 문구 정정** — PRD의 `코드 변경 0`을 **`동작 코드 변경 0`**으로 수정한다. 현행 문구 그대로 두면 §3.7 의무 bump를 수행하는 본 plan과 PRD가 표면상 모순이며, 재검토자가 어느 쪽이 맞는지 판정할 수 없다. 해석을 plan에만 적고 PRD를 안 고치는 것은 계약을 조용히 개정하는 것과 같다(F2의 재발)
  - 나머지 Open Question 4건(이력 보존 / 점유 만료 / 최소 지시 계약 / 피드백 승격 경계)은 M4·M5·M7 소유임을 명시하고 **M1에서 미변경**
  - **M2 진입 조건 신설 (R2-F4)** — PRD Delivery Milestones의 M2 행에 `measurement-feasibility.md` re-freeze를 진입 조건으로 기록한다. 두 선행 chore 착지 전 M2를 착수하면 부패한 corpus 기준 판정을 물려받는다
  - `plugin.json` `→ 1.22.5` + `html.js`/`markdown.js` footer 동기 + CHANGELOG 행 (1.22.4는 `durable-evidence-substrate` chore가 선점 — §순서 참조)
- **Mirror**: `.claude/prds/workflow-orchestration-live-activation.prd.md`의 milestone status 갱신 관행 + CLAUDE.md §3.7
- **Validate**: PRD 표에 M1 in-progress + plan 경로. 체크된 Open Question 4건 전부 링크 보유. 3개 version surface가 동일 문자열

## Validation

Codex R1 F4 흡수 — M1은 실행 코드 경로가 없어 **이 블록이 유일한 강제 수단**이다. 모든 검사는 실패 시 종료하며 fallback echo·마스킹 파이프를 두지 않는다.

> **자체 검증 이력**: 본 블록은 작성 후 실제 실행해 양방향 검증했다. 초판의 검사 6·7·8은 *"아직 정하지 않았다 / TBD / 0"* 로만 채운 공허한 문서를 **전부 통과**시켰고(F4가 지적한 실패가 대체 검사에 재현), 검사 10은 Node 24에서 `MODULE_NOT_FOUND`로 아예 실행 불가였다. 아래는 그 두 결함을 닫은 판이며, 불량 stub 거부 · 정상 stub 수용을 모두 실측했다.

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
DOC=docs/multi-session-work-loop

# 0. placeholder 금지 — freeze 아티팩트에 미확정 토큰이 남으면 실패.
#    검사 6·7·8이 공허한 문서를 통과시키던 경로를 정면으로 차단한다.
#    scope는 신규 4문서뿐 — PRD의 정당한 "TBD (M2)" 항목은 대상 아님.
#    예외: cohort-input-snapshot.md 는 PRD **원문 archive**다(저작물 아님).
#    PRD에는 정당한 "TBD (M2)" 항목이 있고 스냅샷은 그것을 그대로 보존해야 한다 —
#    스냅샷을 손대면 pin의 의미가 사라진다.
if grep -rniE '\b(TBD|TODO|FIXME|XXX)\b|미정|추후 (결정|선택|확정)' "$DOC"/ \
     --exclude=cohort-input-snapshot.md; then
  echo "FAIL: placeholder token in frozen artifact"; exit 1
fi

# 1. version surface 3종이 전부 정확히 1.22.5 인가 (R2-F1)
#    diff 기반 검사는 "bump을 아예 안 한 경우"를 통과시킨다 — 실측 확인됨.
#    따라서 diff가 아니라 **파일을 직접 읽어 값을 단정**한다.
v=$(node -e 'process.stdout.write(require("./plugins/mccp/.claude-plugin/plugin.json").version)')
[ "$v" = "1.22.5" ] || { echo "FAIL: plugin.json=$v (want 1.22.5)"; exit 1; }
grep -q 'v1[.]22[.]5' plugins/mccp/scripts/lib/renderer/html.js \
  || { echo "FAIL: html.js footer not at 1.22.5"; exit 1; }
grep -q 'v1[.]22[.]5' plugins/mccp/scripts/lib/renderer/markdown.js \
  || { echo "FAIL: markdown.js footer not at 1.22.5"; exit 1; }

# 2. 동작 코드 무변경 — 커밋 + 워킹트리 + 인덱스 전부 (R2-F1: main...HEAD만 보면 미커밋 변경을 놓친다)
changed=$( { git diff --name-only main...HEAD -- plugins/
             git diff --name-only -- plugins/
             git diff --cached --name-only -- plugins/; } | sort -u )
#     allowlist는 4개다 — 네 번째는 footer 버전을 assert하는 회귀 테스트다.
#     bump가 그 테스트를 깨뜨리므로 같은 변경 안에서 따라가야 한다(PR-Codex R1 F1).
allowed=$(printf '%s\n' \
  plugins/mccp/.claude-plugin/plugin.json \
  plugins/mccp/scripts/lib/renderer/html.js \
  plugins/mccp/scripts/lib/renderer/markdown.js \
  plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js | sort -u)
extra=$(comm -23 <(printf '%s\n' "$changed" | grep -v '^$') <(printf '%s\n' "$allowed"))
[ -z "$extra" ] || { echo "FAIL: behavioral code changed: $extra"; exit 1; }

# 2c. Renderer + plugin.json 순수 치환 검증 (Codex R3 F1 · Implement-Codex R1 F3 · R2 F1)
#     이 검사는 두 번 다시 쓰였다. 이력을 남기는 이유는 두 실패가 서로 다른 교훈이라서다.
#
#     (i) 최초판은 "버전 토큰을 포함하는가"만 봐서, 같은 footer 라인에 동작 코드를
#         얹어도 토큰이 남으면 통과했다(R3 F1).
#     (ii) 그 흡수판은 diff의 +/- 라인에서 부호를 떼고 버전 토큰을 중화한 뒤 "모든
#         content 라인이 짝수 번 나타나야 한다"고 단정했다(Implement-Codex R1 F3).
#         이것도 뚫린다 — Implement-Codex R2 F1이 지적했고 합성 입력으로 재현했다:
#           · 부호를 떼기 때문에 **동일한 추가 라인 2개**는 count 2(짝수)로 통과한다.
#             (추가 1개는 홀수라 잡히지만, 2개는 안 잡힌다. 실측 확인)
#           · plugin.json 필터는 라인 단위라 `"version": "…", "otherField": …` 처럼
#             **한 라인에 버전과 다른 필드를 같이** 넣으면 통과한다. (실측 확인)
#
#     교훈: diff 라인을 세는 한 부호·중복·동일 라인 결합이라는 우회로가 계속 남는다.
#     그래서 diff 파싱을 **버리고**, Acceptance가 실제로 주장하는 명제를 그대로 단정한다 —
#     "main 기준 파일 내용이 버전 문자열을 빼면 동일하다". 커밋·워킹트리·인덱스를
#     따로 합칠 필요도 없어진다(작업본 내용이 곧 최종 상태이므로).
#       · renderer 2종: v1.22.x 토큰 중화 후 **파일 전문 일치**를 요구
#       · plugin.json: 양쪽을 파싱해 `version` 키를 제거한 뒤 **구조 비교**(키 정렬 정규화)
#     백슬래시 리터럴을 쓰지 않는다 — 이 저장소에서 셸·JS 경계의 백슬래시 붕괴가
#     이미 두 검사를 무력화한 전력이 있다(위 검사 3·7 주석).
node -e '
const fs=require("fs"), cp=require("child_process");
const CR=String.fromCharCode(13);
const norm=s=>s.split(CR).join("").replace(/v1[.]22[.][0-9]+/g,"vXXX");
const base=f=>cp.execSync("git show main:"+f,{encoding:"utf8",maxBuffer:67108864});
const sortKeys=v=>Array.isArray(v)?v.map(sortKeys)
  :(v&&typeof v==="object"?Object.keys(v).sort().reduce((a,k)=>(a[k]=sortKeys(v[k]),a),{}):v);
const bad=[];
for(const f of ["plugins/mccp/scripts/lib/renderer/html.js",
                "plugins/mccp/scripts/lib/renderer/markdown.js"]){
  let b; try{ b=base(f); }catch(e){ bad.push(f+" : main 기준본을 읽을 수 없음 (신규/삭제 = 동작 변경)"); continue; }
  if(norm(b)!==norm(fs.readFileSync(f,"utf8"))) bad.push(f+" : 버전 토큰 외의 차이가 있음 (동작 코드 변경)");
}
const P="plugins/mccp/.claude-plugin/plugin.json";
try{
  const a=JSON.parse(base(P)), c=JSON.parse(fs.readFileSync(P,"utf8"));
  delete a.version; delete c.version;
  if(JSON.stringify(sortKeys(a))!==JSON.stringify(sortKeys(c)))
    bad.push(P+" : version 외 매니페스트 필드가 변경됨");
}catch(e){ bad.push(P+" : 파싱/기준본 실패 "+e.message); }
if(bad.length){ console.log("FAIL: 순수 버전 치환이 아님:"); bad.forEach(x=>console.log("  "+x)); process.exit(1); }
console.log("OK: renderer 2종 파일 전문이 버전 토큰 외 동일 · plugin.json은 version 필드만 상이");'

# 2d. feasibility 산문 표 ↔ evidence-snapshot.json 일치 (PR-Codex R1 F2)
#     §1.5는 "산문과 스냅샷이 어긋나면 스냅샷이 정답"이라 선언했지만, 선언은
#     어긋남을 막지 못한다 — 실제로 §2.1이 121/120으로 굳어 있는 동안 스냅샷은
#     122/121이었고, §2의 제목은 그 표가 "스냅샷의 관측값"이라고 주장하고 있었다.
#     M2가 이 표를 보고 분모를 freeze하면 틀린 분모를 물려받는다. 선언을 강제로 바꾼다.
#     CHECK 7과 동일한 컬럼 분해 방식 — 문자열 생성 정규식을 쓰지 않는다.
node -e '
const fs=require("fs");
const D="docs/multi-session-work-loop";
const snap=JSON.parse(fs.readFileSync(D+"/evidence-snapshot.json","utf8"));
const body=fs.readFileSync(D+"/measurement-feasibility.md","utf8");
const rows=body.split(/\r?\n/).filter(x=>x.trim().startsWith("|"));
// [산문 표의 1열 접두, 스냅샷 값]. 값 셀에서 정수를 모두 뽑아 기대값 포함을 요구한다
// — 굵게/"건"/"0 / 122" 같은 표기 차이는 허용하되 낡은 숫자는 못 넘어간다.
const pairs=[
  ["파싱 가능 receipt", snap.receipts.parsed],
  ["`resolution.accepted`", snap.receipts.empty_resolution],
  ["`resolution.codex_verdict` 부재", snap.receipts.no_codex_verdict],
  ["`head_sha`", snap.receipts.head_sha_unreachable],
  ["`base_sha`", snap.receipts.base_sha_reachable],
];
const bad=[];
for(const [label,want] of pairs){
  const row=rows.find(x=>{ const c=x.split("|"); return c[1]!==undefined && c[1].trim().startsWith(label); });
  if(!row){ bad.push(label+" : 행 없음"); continue; }
  const nums=((row.split("|")[2]||"").match(/[0-9]+/g)||[]).map(Number);
  if(!nums.includes(want)) bad.push(label+" : 산문 "+JSON.stringify(nums)+" 에 스냅샷 값 "+want+" 없음");
}
if(bad.length){ console.log("FAIL: 산문 표가 evidence-snapshot.json 과 어긋남:"); bad.forEach(x=>console.log("  "+x)); process.exit(1); }
console.log("OK: feasibility 산문 표 "+pairs.length+"행이 스냅샷과 일치");'

# 3. 지표 10개 × 6 라벨 완비 — 누락 1개라도 실패 (F4)
#    R2-F2 + 자체 발견 2건을 함께 흡수:
#    (a) 라벨 "존재"만 보면 `분모:` 뒤가 비어도 통과한다 → **값의 실질**을 요구한다.
#    (b) `new RegExp("^"+id+"\\b")`는 이 환경에서 백슬래시가 한 겹 붕괴해 `\b`가
#        백스페이스가 되고, 그 결과 검사가 **항상 전 지표 MISSING으로 실패**했다.
#        정규식 리터럴과 startsWith만 쓰고 RegExp 문자열 생성자를 쓰지 않는다.
node -e '
const fs=require("fs");
const body=fs.readFileSync("docs/multi-session-work-loop/measurement-design.md","utf8");
const ids=["A1","A2","A3","A4","B1","B2","B3","C1","C2","C3"];
const labels=["분모","분자","소스","산출식","무결성 검사","소급 가부"];
const secs=body.split(/^###\s+/m);
const bad=[];
for(const id of ids){
  const s=secs.find(x=>x.startsWith(id+" ")||x.startsWith(id+"\n")||x.trim()===id);
  if(!s){ bad.push(id+" : 섹션 없음"); continue; }
  for(const l of labels){
    const strip=x=>x.trim().replace(/^[-*]\s*/,"").replace(/^\*\*/,"").replace(/\*\*/g,"");
    const line=s.split(/\r?\n/).map(strip).find(x=>x.startsWith(l));
    if(!line){ bad.push(id+" / "+l+" : 라벨 없음"); continue; }
    const val=line.slice(line.indexOf(l)+l.length).replace(/^[\s:：|-]+/,"").trim();
    if(val.length<10) bad.push(id+" / "+l+" : 값이 비었거나 형식적 ("+JSON.stringify(val)+")");
  }
}
if(bad.length){ console.log("FAIL:"); bad.forEach(b=>console.log("  "+b)); process.exit(1); }
console.log("OK: 10 metrics x 6 labels, 값 전부 실질");'

# 4. Open Question closure — 중복 계수 방지 위해 정규화 후 distinct (F4)
n=$(grep -E '^- \[x\]' .claude/prds/multi-session-work-loop.prd.md \
  | grep -oE '결함의 정의|실질 수정|소급 감사|대형 작업 코호트' | sort -u | wc -l)
[ "$n" -eq 4 ] || { echo "FAIL: expected 4 distinct closed OQ, got $n"; exit 1; }

# 5b. 코호트 입력 스냅샷이 실제로 고정됐는가 (R2-F3)
#     레지스트리가 기록한 sha256이 보존된 스냅샷 파일과 일치해야 한다.
#     불일치 = 도출 입력이 사후에 움직였다는 뜻이므로 코호트 전체가 무효.
node -e '
const fs=require("fs"),crypto=require("crypto");
const D="docs/multi-session-work-loop";
const snap=D+"/cohort-input-snapshot.md";
if(!fs.existsSync(snap)){ console.log("FAIL: cohort input snapshot missing"); process.exit(1); }
const reg=fs.readFileSync(D+"/large-cohort-registry.md","utf8");
const m=reg.match(/sha256:\s*[`"]?([0-9a-f]{64})/i);
if(!m){ console.log("FAIL: registry records no input sha256"); process.exit(1); }
const actual=crypto.createHash("sha256").update(fs.readFileSync(snap,"utf8"),"utf8").digest("hex");
if(actual!==m[1].toLowerCase()){
  console.log("FAIL: snapshot hash mismatch — cohort inputs moved after derivation");
  console.log("  registry:",m[1].toLowerCase().slice(0,16)+"...");
  console.log("  snapshot:",actual.slice(0,16)+"...");
  process.exit(1);
}
console.log("OK: cohort inputs pinned");'

# 5. 코호트 = 임계 규칙 출력 + 사후 메타데이터 부재 (F3 + Implement-Codex IF3)
#    초판 검사는 "코호트 >= 3"을 요구했는데, 그건 정확히 rank 규칙이 만족시키려던
#    조건이고 IF3가 지적한 편향의 원천이었다. 이제 개수를 고정하지 않고,
#    임계 규칙이 산출한 수와 등록된 수가 일치하는지 + 미달 시 PRD 충족 불가가
#    문서에 기록됐는지를 검증한다.
c=$(grep -E '^\| *[0-9]+ *\|' "$DOC/large-cohort-registry.md" | awk -F'|' '{print $3}' | sort -u | wc -l)
[ "$c" -ge 1 ] || { echo "FAIL: cohort empty (got $c)"; exit 1; }
# 코호트가 PRD 요구(3)에 미달하면, 그 충족 불가가 명시 기록돼 있어야 한다(IF3).
if [ "$c" -lt 3 ]; then
  grep -q '충족 불가' "$DOC/large-cohort-registry.md" \
    || { echo "FAIL: cohort $c < 3 but no '충족 불가' record (IF3)"; exit 1; }
fi
# 선정 규칙이 임계 규칙인지 (IF3 regression 차단).
#    문서에 단일 HTML 마커 `<!-- SELECTION-RULE: threshold -->`를 두고 그것만 검사한다.
#    설명 산문에 "rank 규칙"이 등장해도(기각 논거) 마커는 하나이므로 오탐이 없다.
grep -q '<!-- SELECTION-RULE: threshold -->' "$DOC/large-cohort-registry.md" \
  || { echo "FAIL: selection rule is not threshold (IF3 — rank rule would re-manufacture 3 cohorts)"; exit 1; }
grep -q '<!-- SELECTION-RULE: rank -->' "$DOC/large-cohort-registry.md" \
  && { echo "FAIL: rank rule marker present (IF3 regression)"; exit 1; } || true
if grep -qiE '실제 (소요|세션|파일)|완주 여부' "$DOC/large-cohort-registry.md"; then
  echo "FAIL: post-hoc metadata in cohort rule"; exit 1
fi

# 6. 밴드 freeze 선언 + 판별기준 2종 이상 (F3)
#    초판은 "1일 3일 7일 14일 30일"을 산문에 흩뿌리기만 해도 통과했다.
#    이제 canonical freeze 줄과 명명된 판별기준 개수를 요구한다.
grep -qE '밴드\(freeze\):\s*\{\s*1\s*,\s*3\s*,\s*7\s*,\s*14\s*,\s*30\s*\}' "$DOC/label-protocol.md" \
  || { echo "FAIL: canonical band freeze line missing"; exit 1; }
k=$(grep -oE 'revert|fix-type|finding 귀속' "$DOC/label-protocol.md" | sort -u | wc -l)
[ "$k" -ge 2 ] || { echo "FAIL: discriminating criteria $k < 2"; exit 1; }

# 7. 소급 프로토콜 임계 — canonical 표에서 파싱하고 양수 강제 (F1)
#    초판은 "0" / "미측정 0" 도 통과시켰다.
#    주의: 이 검사의 초판은 `new RegExp("^\\|\\s*"+k+...)` 를 썼는데 백슬래시가
#    한 겹 붕괴해 `\|` 가 `|` 가 되고, 정규식이 `^|...` (빈 대안)이 되어 위치 0에서
#    매치되며 캡처가 undefined → `Number(undefined)=NaN` → `NaN<=0` false → **임계표가
#    아예 없는 문서도 통과**했다(실측). 문자열 생성 정규식을 버리고 컬럼 분해로 바꾼다.
node -e '
const b=require("fs").readFileSync("docs/multi-session-work-loop/measurement-feasibility.md","utf8");
const need=["표집 크기","파싱 성공률 하한","판정자 일치율 하한","최소 양성 사례"];
const rows=b.split(/\r?\n/).filter(x=>x.trim().startsWith("|"));
const bad=[];
for(const k of need){
  const row=rows.find(x=>{ const c=x.split("|"); return c[1]!==undefined && c[1].trim().startsWith(k); });
  if(!row){ bad.push(k+" : 행 없음"); continue; }
  const raw=(row.split("|")[2]||"").trim().replace("%","");
  const n=Number(raw);
  if(!Number.isFinite(n)||n<=0) bad.push(k+" : 값 "+JSON.stringify(raw)+" (양수 아님)");
}
if(bad.length){ console.log("FAIL threshold:"); bad.forEach(x=>console.log("  "+x)); process.exit(1); }
console.log("OK: 4 thresholds parsed, all positive");'

# 8. C계열 각각이 명시적 recoverability 상태를 갖는지 (F1)
for m in C1 C2 C3; do
  grep -qE "$m[^\n]*recoverability-undetermined" "$DOC/measurement-feasibility.md" \
    || { echo "FAIL: $m lacks explicit recoverability status"; exit 1; }
done

# 9. 링크 무결성 — 신규 문서의 상대 링크 전수
node -e '
const fs=require("fs"),path=require("path");
const dir="docs/multi-session-work-loop";
let bad=0;
for(const f of fs.readdirSync(dir)){
  const body=fs.readFileSync(path.join(dir,f),"utf8");
  for(const m of body.matchAll(/\]\((\.[^)#]+)/g)){
    if(!fs.existsSync(path.resolve(dir,m[1]))){ console.log("BROKEN",f,"->",m[1]); bad++; }
  }
}
if(bad) process.exit(1); console.log("OK: links");'

# 10. 회귀 — 신규 실패 0. exit status를 마스킹하지 않는다 (F4)
#
#    주의 1: `node --test <dir>/`(기존 47개 plan의 관행)은 Node 24.11.1에서
#            MODULE_NOT_FOUND로 **실행조차 안 된다** — 디렉토리를 모듈로 해석한다.
#            glob 형태만 동작한다. (repo-wide 선재 문제, M1이 만든 것 아님)
#    주의 2: glob으로 돌려도 선재 실패 1건이 있다 —
#            design-critique-loop-e2e.test.js "fixture file exists in .claude/cache/".
#            CLAUDE.md §3.9가 이 fixture를 "현재 tracked 상태가 아님"으로 명시하므로
#            정상 상태다. 따라서 "실패 0"이 아니라 **"알려진 그 1건 외 실패 0"**을 강제한다.
out=$(node --test "plugins/mccp/scripts/lib/tests/*.test.js" 2>&1 || true)
fails=$(printf '%s\n' "$out" | sed -n 's/^ℹ fail \([0-9]*\)$/\1/p' | tail -1)
[ "$fails" = "1" ] || { echo "FAIL: expected exactly 1 known failure, got ${fails:-?}"; exit 1; }
printf '%s\n' "$out" | grep -q 'design-critique-loop-e2e.test.js' \
  || { echo "FAIL: the single failure is NOT the known fixture case — new regression"; exit 1; }
echo "OK: only the known pre-existing fixture failure"

# 11. renderer 회귀 — CHECK 10이 만든 사각을 닫는다 (PR-Codex R1 F1)
#     CHECK 10의 glob은 `lib/tests/*.test.js` 라서 `lib/renderer/tests/` 를 아예
#     스캔하지 않는다. version bump가 그 디렉토리의 footer assert 2건을 깨뜨렸는데도
#     Validation 전체가 초록이었다 — 유일한 기계적 강제 수단에 디렉토리 크기의
#     구멍이 있었다는 뜻이다. CHECK 10과 같은 형태로 닫는다.
#     실측 기준선: main에서 667개 중 선재 실패 1건(verdict-label metric — 이 milestone
#     과 무관, bump 되돌리면 재현). 그 1건 외 0을 강제한다.
rout=$(node --test "plugins/mccp/scripts/lib/renderer/tests/*.test.js" 2>&1 || true)
rfails=$(printf '%s\n' "$rout" | sed -n 's/^ℹ fail \([0-9]*\)$/\1/p' | tail -1)
[ "$rfails" = "1" ] || { echo "FAIL: renderer suite expected exactly 1 known failure, got ${rfails:-?}"; exit 1; }
printf '%s\n' "$rout" | grep -q 'verdict-label metric' \
  || { echo "FAIL: the single renderer failure is NOT the known verdict-label case — new regression"; exit 1; }
echo "OK: renderer suite — only the known pre-existing verdict-label failure"
```

## 순서 — 선행 chore와의 관계 (2026-07-22 추가)

M1 자체는 설계 문서만 만들므로 **차단되지 않는다**. 지금 진행 가능하다. 다만 두 가지가 M1 *바깥*에서 정리돼야 M1이 설계한 측정이 실제로 성립한다.

| 축 | 소유 | M1과의 관계 |
|---|---|---|
| ship receipt 내구화 + 감사 도구 | `durable-evidence-substrate` chore (Phase A) | M1의 소급 프로토콜이 대조할 **corpus 자체를 복원**한다. 현재 ship receipt는 gitignored라 fresh clone에서 감사가 원리상 불가능하다 |
| ledger 승인 술어 정정 | 별도 plan (미작성, backlog 2026-07-22 CRITICAL) | ledger `verdict`를 신호로 되살린다. 이것 없이는 A1·C계열이 ledger를 대조 소스로 못 쓴다 |

**M1은 이 둘을 기다리지 않는다** — 오히려 반대다. M1이 "무엇을 어떤 분모로 셀지"를 먼저 고정해야 두 chore가 무엇을 복원해야 하는지가 정해진다.

### 산출물을 두 층으로 가른다 (R2-F4 흡수)

초판은 위 문단으로 끝났고, 산출물 4건을 모두 동등하게 "freeze"라 불렀다. **그건 틀렸다.** corpus가 곧 바뀔 것을 알면서 corpus 의존 판정을 freeze하면, M2가 낡은 설계를 물려받으면서도 "사전 등록됐으니 신뢰할 수 있다"고 취급하게 된다 — 사전 등록의 가치를 정확히 무너뜨린다.

| 층 | 산출물 | 성격 | corpus 의존 |
|---|---|---|---|
| **계약층** | `measurement-design.md` · `label-protocol.md` · `large-cohort-registry.md` | **FROZEN** — 분모·산출식·결함 정의·밴드·코호트. 사후 변경 금지 | 없음 — 소스가 무엇이든 정의는 동일 |
| **가용성층** | `measurement-feasibility.md` | **PROVISIONAL** — 어느 소스가 지금 쓸 만한가 | 있음 — 두 chore가 바꾼다 |

사전 등록의 가치는 **계약층**에 있다. 그건 지금 freeze할 수 있고 corpus와 무관하게 유효하다. 가용성층은 관측 기록이지 약속이 아니므로 freeze 대상이 아니다.

**필수 re-freeze 게이트**: `measurement-feasibility.md`는 첫 줄에 `STATUS: PROVISIONAL — corpus 기준일 2026-07-22`를 싣고, 두 chore가 착지한 뒤 **재산출·재기록되기 전에는 M2를 착수하지 않는다**. 이 게이트를 M2의 진입 조건으로 PRD에 기록한다(Task 6). 계약층은 재산출 대상이 아니며, 재산출로 계약층이 바뀌어야 한다면 그건 M1 설계가 틀렸다는 신호이므로 별도로 다룬다.

버전은 forward-only reconcile(§3.7)로 정리한다 — chore가 1.22.4, M1이 **1.22.5**.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **소급 프로토콜이 M1 범위를 넘어 실행으로 번짐** — 정의만 해야 하는데 표집·판정을 M1에서 수행 | 중 | Task 2에 실행 경계를 명시(정의=M1, 실행=M2). M1은 기존 아티팩트 read-only probe까지만, 신규 레코드 write 0. Validation 1번이 코드/데이터 변경을 allowlist로 차단 |
| **판별 기준(fix-type/revert)의 base rate가 너무 낮아 C3이 여전히 산출 불가** — revert 0/108, fix 15/108 | 높음 | 이것 자체가 유효한 결과. 라벨 규약에 "판별 기준이 충분한 표본을 못 만들면 C3은 전향 수집까지 산출 금지"를 명시. 낮은 base rate를 임계 미달로 정직히 보고 |
| **민감도 밴드가 결론을 뒤집을 때 해석 불가** | 중 | 뒤집힘 자체를 결과로 보고하도록 규약에 명시. 단일 W로 결론을 봉인하지 않는 것이 목적 |
| **코호트 선정 규칙이 3개 미만을 산출** | 중 | 임계를 낮추지 않고 반증 조건 미충족으로 기록(Task 5). 규칙을 사후 조정해 코호트를 만들어내는 경로를 차단 |
| **M1이 설계만 하다 길어져 착수 지연** (PRD Risk) | 중 | 산출물을 문서 4건으로 상한. 완벽한 설계가 아니라 **반박 가능한 설계**가 목표임을 Acceptance에 반영 |
| **PRD Evidence 정정이 PRD 신뢰를 흔듦** | 중 | 정정은 PRD 논지를 **강화**함(측정 층 부재라는 결론은 동일, 근거만 강화). 정정 이력을 남겨 추적 가능하게 함 |
| **version bump가 PRD "코드 변경 0"과 충돌** | 중 | §3.7 준수를 택하고 해석을 명문화(동작 코드 0 ≠ 릴리스 메타데이터 0). allowlist + 버전 문자열 전용 diff를 Validation 1·2번이 기계 검증. **PRD 문구 자체도 `동작 코드 변경 0`으로 정정**(Task 6) — plan에만 해석을 적으면 두 문서가 표면상 모순 |
| **코호트가 본 PRD 자신의 M2~M7에서 뽑혀 반증 시험이 자기평가가 됨** | 높음 | 구조적 제거 불가(PRD가 `자기 참조 과적합`을 이미 한계로 기록, 외부 대조군은 후속 축). 완화는 두 겹 — 선정 입력을 **각 milestone 실행 이전에 이미 PRD에 적혀 있던 값**으로 한정(Task 5)하고, 레지스트리에 "본 코호트는 self-hosting 평가이며 외부 타당도를 주장하지 않음"을 명시. 이 한계를 적지 않으면 반증 조건이 실제보다 강해 보임 |
| **선재 테스트 실패가 M1 Acceptance를 영구 차단** | 중 | 실측 확인 — `node --test <dir>/`는 Node 24에서 실행 불가, glob으로 돌리면 선재 실패 1건(design-critique-loop-e2e fixture, §3.9가 미tracked로 명시). Validation 10을 "실패 0"이 아니라 **"알려진 그 1건 외 실패 0"**으로 정의해 신규 회귀만 잡도록 함 |

## Acceptance

- [ ] M1 소유 Open Question 4건(결함 정의 / 실질 수정 판별 / 소급 유효 범위 / 코호트 기준) 전부 closure
- [ ] 지표 10개가 6개 고정 라벨로 명세됨 (Validation 3 통과)
- [ ] C계열이 **프로토콜과 임계 없이 소급 불가로 선언되지 않음** — `recoverability-undetermined` 유지 (F1)
- [ ] 소급 프로토콜 임계 4종이 실행 전에 숫자로 고정됨
- [ ] 결함 정의가 파일 겹침 **단독이 아니며**, p50 0.23d 반례가 규약에 기록됨 (F3)
- [ ] W가 민감도 밴드 5개로 보고되고 밴드 집합이 freeze됨
- [ ] 코호트가 **불변 pre-start 메타데이터 임계 규칙**의 출력으로 등록됨(현 milestone 구성상 2개) + PRD 반증 조건 충족 불가가 명시 기록됨 (F3 + IF3)
- [ ] C2·C3의 관측 전용 지위가 지표 명세와 라벨 규약 양쪽에 명시됨
- [ ] `measurement-feasibility.md`의 모든 수치가 같은 문서의 명령으로 재현됨
- [ ] **동작 코드 변경 0** — `plugins/` diff가 version surface **4파일**로 한정 (F2 + PR-Codex R1 F1); renderer 두 파일이 v1.22.x 토큰 외 main과 전문 동일함을 CHECK 2c가 기계 검증 (Codex R3 F1 · Implement-Codex R2 F1)
- [ ] **version bump가 회귀를 남기지 않음** — `i18n-surface.test.js`가 버전을 `plugin.json`에서 파생(하드코딩 교체가 아님)하고, CHECK 11이 renderer 스위트를 선재 실패 1건 외 0으로 강제 (PR-Codex R1 F1)
- [ ] **산문 표 ↔ 스냅샷 일치가 강제됨** — CHECK 2d가 `measurement-feasibility.md` §2 표 5행을 `evidence-snapshot.json`과 대조 (PR-Codex R1 F2)
- [ ] **A1 forward-only** — A1 소급 baseline을 만들지 않고 M2 전향 수립; measurement-design/feasibility A1 소급 가부가 forward-only + §4.0 A계열 비대상 명시, ledger 소급 재사용 금지 (Codex R3 F2, 운영자 결정)
- [ ] **데이터 수집 0** — 신규 텔레메트리 파일·이벤트 레코드 없음
- [ ] M4·M5·M7 소유 Open Question 4건은 M1에서 미변경
- [ ] 계약층 3문서는 FROZEN, `measurement-feasibility.md`는 첫 줄에 `STATUS: PROVISIONAL` + corpus 기준일 (R2-F4)
- [ ] PRD M2 행에 feasibility re-freeze 진입 조건 기록됨 (R2-F4)
- [ ] 코호트 입력 스냅샷이 보존되고 레지스트리 sha256과 일치 (R2-F3)
- [ ] version surface 3종이 **파일 직접 읽기로** 정확히 1.22.5 (R2-F1 — diff 기반은 무bump를 통과시킴)
- [ ] Validation 검사 전부 통과 — fallback·마스킹 없이, **그리고 공허한 문서를 통과시키지 않음**(placeholder guard + 임계 양수 파싱 + 밴드 freeze 줄)
- [ ] 회귀 검사가 신규 실패만 잡음 — 알려진 fixture 실패 1건 외 0
- [ ] Patterns mirrored, not reinvented

## External Research Provenance

- Source PRD: .claude/prds/multi-session-work-loop.prd.md
- References section sha256: 34ee41f6f936c79b730a8cd0dd377690ff30993a97049d94aac71f9b7a13978a
- Stamped at: 2026-07-21T15:03:05.613Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (worktree 1.22.3 — stale 1.22.2 cache 미사용)
- 라운드 수: **2** (R1 → 4 HIGH 흡수 → R2 재판정 → 4 HIGH 흡수)
- 합치 결론: **미수렴**. R1·R2 모두 verdict `needs-attention`(No ship). 총 8건 전부 ACCEPT_NOW, DEFER_TO_BACKLOG 0건. 두 라운드의 findings는 서로 다른 결함을 가리켰다 — R1은 **설계 공백**, R2는 **그 흡수를 강제한다던 가드가 무력함**. R2 지적 4건 중 2건은 자체 재현으로 확인했다.

### R1 (4 HIGH — 전건 흡수)

| Finding | Verdict | 흡수 |
|---|---|---|
| F1 C계열 소급을 검증 없이 사전 차단 | ACCEPT_NOW | 프로토콜 + 사전 임계로 대체, `recoverability-undetermined` 유지 (Task 2) |
| F2 `plugin.json` 생략이 릴리스 계약 위반 | ACCEPT_NOW | §3.7 준수 + version surface allowlist (Task 6) |
| F3 자의적 W·코호트 freeze가 편향 세탁 | ACCEPT_NOW | 민감도 밴드 5종 + 불변 pre-start 규칙 (Task 4·5) |
| F4 Validation이 미충족에도 통과 | ACCEPT_NOW | `set -euo pipefail` + 실패 종료 검사로 재작성 |

### R2 (4 HIGH — 전건 흡수)

| Finding | Verdict | 자체 검증 | 흡수 |
|---|---|---|---|
| F1 version 가드가 계약을 강제하지 않음 | ACCEPT_NOW | **재현됨** — bump 0(버전이 1.22.3 그대로)인데 검사 1·2가 둘 다 통과 | diff 대신 **파일 직접 읽기**로 3종이 정확히 1.22.5인지 단정 + 워킹트리·인덱스까지 검사 대상에 포함 |
| F2 라벨만 있으면 값이 비어도 통과 | ACCEPT_NOW | **재현됨(다른 형태로)** — 아래 주석 참조 | 정규식 문자열 생성자 제거 + 값 실질(≥10자) 요구. 빈 값/실질 값 양방향 실측 |
| F3 코호트 입력이 같은 변경 안에서 가변 | ACCEPT_NOW | 확인 — Task 6이 같은 PRD를 편집한다 | 입력 스냅샷 sha256 pin + 스냅샷 파일 보존 + Task 5를 Task 6보다 선행 |
| F4 부패한 corpus 기준으로 feasibility freeze | ACCEPT_NOW | 확인 | 산출물을 **계약층(FROZEN) / 가용성층(PROVISIONAL)**으로 분리 + M2 진입 전 re-freeze 게이트 신설 |

> **R2-F2의 실제 형태는 Codex 지적보다 나빴다.** Codex는 "라벨만 있으면 통과"(과대 관대)를 지적했는데, 실측해보니 지표 검사는 정반대로 **항상 실패**하고 있었다 — `new RegExp("^"+id+"\b")`의 백슬래시가 셸·JS 경계에서 한 겹 붕괴해 `\b`가 백스페이스 문자가 되고, 그 결과 어떤 문서를 줘도 전 지표가 MISSING으로 나왔다. 통과할 수 없는 검사는 통과시키는 검사만큼 무용하며, milestone을 영구히 막는다는 점에서 더 나쁘다.

> **부수 발견(자체) — 같은 붕괴가 임계표 검사도 무력화하고 있었다.** `\|`가 `|`로 붕괴해 정규식이 빈 대안(`^|…`)이 되고, 위치 0에서 매치되며 캡처가 `undefined` → `Number(undefined)=NaN` → `NaN<=0`이 false → **임계표가 아예 없는 문서도 통과**했다(실측). 컬럼 분해 방식으로 교체하고 none/zero/good 3케이스로 검증했다. 앞선 라운드에서 이 검사를 "양방향 검증했다"고 기록했으나, 그때 시험한 문자열은 plan 본문과 달랐다 — **검증 방법론의 오류**였고 여기에 정정해 남긴다.

> **잔여 한계(정직한 기록)**: 산문 문서를 문자열 검사로 완전히 검증할 수는 없다. 현재 가드는 빈 값·형식적 값·placeholder·누락 표를 걸러내지만, *내용이 틀린* 문서는 걸러내지 못한다. R2-F2의 완전판 권고(파싱 가능한 canonical 스키마 + negative fixture 세트)는 M1 범위에서 감당 가능한 수준을 넘으므로, 현재 수준을 상한으로 명시하고 사람 리뷰가 그 위를 담당한다.

- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 해당 없음)
- 구조화 verdict: R1·R2 모두 `codex-review-payload.js#deriveGateVerdict` → `divergent` (source=`structured`, raw=`needs-attention`)

### R3 (재검증 라운드 — 2026-07-22, stale receipt 발견 후)

재검증 트리거: 기존 plan-codex receipt(2026-07-21T19:15, `plan_hash=afc0991…`)가 현재 plan(`227cad6…`)과 불일치 = **stale**. R1·R2 리뷰가 현재 plan 본문을 커버하지 않아 fresh Codex adversarial-review를 worktree 컨텍스트에서 재실행(회귀 관점 집중, `MCCP_BRIEFING=off`로 문서화된 briefing hang 회피).

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (worktree 1.22.5, durationMs 458881)
- R3 raw verdict: **`needs-attention` (No ship)**, 3 HIGH. `classification=ok`, `blocking=false`.
- **구조화 verdict 파서 결함 재현** — `codex-review-payload.js#deriveGateVerdict`가 정상 응답에 `{verdict:'unavailable', rawVerdict:null}` 반환(backlog 2026-07-22 MEDIUM 기존 결함). raw verdict는 wrapper `.stdout` → `.result.verdict`를 직접 파싱해 확인(`needs-attention`). fail-closed(unavailable=승인 불가)라 거짓 converged는 없다.

| Finding | Severity | Verdict | 재현 검증 | 흡수 |
|---|---|---|---|---|
| F0 FROZEN/PROVISIONAL 경계 누수 | HIGH→**MEDIUM** | REJECT | measurement-design(FROZEN)은 121/122 코퍼스 수치를 인용하지 않음(freeze 정의·ledger 0건은 구조적). "121 vs 122 drift"는 feasibility가 의도적으로 문서화한 코퍼스 이동성 — 층 혼동 | 기각. PROVISIONAL 내부 표기 정리는 선택적 |
| F1 renderer allowlist가 hunk-scoped 아님 | HIGH | ACCEPT_NOW | 재현됨 — CHECK 2는 파일명만, CHECK 1은 버전 문자열 존재만. hunk 내용 미검증 → Acceptance 주장("버전 문자열 라인으로 한정")을 기계가 증명 못 함 | Validation CHECK 2c 신설 — 두 renderer 파일의 모든 변경 라인이 v1.22.x 토큰 포함인지 단정 |
| F2 A1이 사용 불가 소스에 암묵 의존 | HIGH | ACCEPT_NOW | 재현됨 — feasibility L180 "A1 분자는 §4가 판정"인데 §4(L204-206)는 C1 전용이고 A1 절차 없음. ledger는 대조 소스로 불가(verdict 판별력 0, 3/10 false positive) | **A1 forward-only 확정**(운영자 결정 2026-07-22) — measurement-design/feasibility A1 소급 가부를 forward-only로, §4.0에 A계열 비대상 명시. ledger 소급 재사용 금지 |

- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 해당 없음)
- R3 구조화 verdict: `divergent` (raw `needs-attention`; ACCEPT_NOW 2건 흡수, F0 기각). Codex가 clean 승인을 발급한 적 없으므로 converged 미stamp — receipt는 raw verdict `divergent`로 정직 봉인(dedupe fail-closed)

### Implement-Codex R1 (재검증 — 2026-07-22, R3 doc 편집 후 implement 게이트 재실행)

R3 흡수가 measurement-design/feasibility 문서를 편집해 implement-codex receipt가 stale(`227cad6` → `f435b6`)가 됐다. 바뀐 구현(docs)에 대해 Implement-Codex를 재실행. raw verdict `needs-attention`(No-ship), 4건. **R3 F2 흡수가 불완전했음이 드러남** — docs만 고치고 PRD·A3 label을 놓쳤다.

| Finding | Severity | Verdict | 재현 | 흡수 |
|---|---|---|---|---|
| F0 PRD가 여전히 `A1·B1 부분` | HIGH | ACCEPT_NOW | PRD L167 확인 — docs는 forward-only인데 PRD closure가 "부분" → M2 오독 위험 | PRD를 `A1 forward-only(소급 baseline 없음)·B1 부분`으로 정정 |
| F1 FROZEN label-protocol이 이동 수치 `121` 박제 | HIGH | ACCEPT_NOW | L100 `121건 중 1건` vs snapshot `parsed:122` — FROZEN에 moving count | evidence-snapshot.json `with_findings`/`parsed` 참조로 대체, 하드코딩 수치 제거 |
| F2 A3 six-label `부분` vs 강등 `baseline-unavailable` | MEDIUM | ACCEPT_NOW | L50 label `부분`인데 L67이 `baseline-unavailable`로 강등 — 기계 파싱 시 stale | A3 소급 가부 label을 `baseline-unavailable`로 정정 |
| F3 CHECK 2c가 순수 치환 미증명 | MEDIUM | ACCEPT_NOW | 같은 라인 동작 편집·plugin.json 미검증 | CHECK 2c를 버전 토큰 중화 후 짝수-쌍 단정 + plugin.json version-field-only로 강화 |

- Deferred to backlog: 0
- Implement-Codex R1 구조화 verdict: `divergent` (raw `needs-attention`; 4건 전건 ACCEPT_NOW 흡수). implement-codex receipt는 최종 plan_hash에 re-anchor + `codex_verdict='divergent'` 정직 봉인.

> **부수 발견(자체, 2026-07-22 실행 중) — F3가 신설한 CHECK 2c 자체가 통과 불가였다.** Implement-Codex F3 흡수로 강화한 `pjoff` 필터가 `grep -vE`였는데, 이 검사가 **성공할 때**(plugin.json 변경이 version 필드뿐 → off-version 라인 0개) grep이 exit 1을 반환하고 `set -euo pipefail`이 스크립트를 즉시 죽였다. 실측 결과 CHECK 2c는 아무 메시지도 없이 exit 1이었고, **통과할 수 있는 입력이 존재하지 않았다.** 이것으로 같은 계열(“가드가 가드하지 못함”)의 결함이 이 Validation 블록에서 셋째다 — 앞선 둘은 백슬래시 붕괴로 *항상 실패*(지표 검사)와 *항상 통과*(임계표 검사)였고, 이번 것은 *성공 시에만 실패*다. 셋 다 검사를 실제로 실행해야만 드러났다는 공통점이 있으며, R2-F2 주석의 명제(“통과할 수 없는 검사는 통과시키는 검사만큼 무용하며, milestone을 영구히 막는다는 점에서 더 나쁘다”)가 그 흡수 코드에서 그대로 재현된 사례다. 수정은 필터를 `awk`로 교체한 것 하나뿐이며(매칭 0건에도 exit 0), 판정은 여전히 `[ -z "$pjoff" ]` + hard exit 1이라 마스킹이 아니다. 수정 후 검사 13개 전부 통과 실측.
>
> **잔여(기록만)**: CHECK 6의 `k=$(grep -oE … | sort -u | wc -l)`도 매칭 0건이면 같은 이유로 조용히 abort한다. 다만 그 경우 판정(`k >= 2`)도 실패이므로 결론은 동일(fail-closed)하고, 차이는 명명된 FAIL 메시지 대신 무언의 exit뿐이라 이번 범위에서 고치지 않는다. → Implement-Codex R2 next_steps가 같은 항목을 지목해 backlog로 이연했다(2026-07-22 LOW).

### Implement-Codex R2 (2026-07-22 — CHECK 2c 수정 후 재실행)

위 "부수 발견"이 Validation 블록을 편집해 `plan_hash`가 이동했고, 그 편집 대상이 하필 **milestone의 유일한 기계적 강제 수단**이라 재리뷰가 필요했다. focus를 그 단일 implement-time 결정(grep→awk 교체)에 한정해 재실행.

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (worktree 1.22.5, durationMs 475005, `MCCP_BRIEFING=off`)
- R2 raw verdict: **`needs-attention` (No ship)**, HIGH 1 + MEDIUM 1. `classification=ok`, `blocking=false`
- 구조화 verdict 파서 **정상 동작** — `codex-review-payload.js#deriveGateVerdict` → `{verdict:'divergent', source:'structured', rawVerdict:'needs-attention'}`. R3에서 관측된 `unavailable` 오반환(backlog MEDIUM)은 이번 응답에서 재현되지 않았다

| Finding | Severity | Verdict | 재현 검증 | 흡수 |
|---|---|---|---|---|
| F1 CHECK 2c가 동작 변경을 통과시킴 | HIGH | ACCEPT_NOW | **양 갈래 모두 재현** — (a) 부호를 떼고 세므로 **동일한 추가 라인 2개**는 count 2(짝수)로 통과(1개는 홀수라 잡힘), (b) plugin.json 필터가 라인 단위라 `"version": "…", "otherField": …`처럼 한 라인에 결합하면 통과 | diff 라인 파싱 **폐기**. Acceptance 명제를 그대로 단정하는 **파일 전문 대조**로 교체 — renderer 2종은 v1.22.x 토큰 중화 후 `git show main:<f>` ↔ 작업본 전문 일치, plugin.json은 양쪽 파싱 후 `version` 제거하고 키 정렬 구조 비교. 양방향 실측(정상 통과 · 공격 2종 거부 · 복원 확인) |
| F2 수동 receipt 재anchor가 plan 게이트 재리뷰를 우회 | MEDIUM | ACCEPT_NOW (부분) | 확인 — receipt가 `findings: []`·`codex_raw_verdict: null`로 현재 `plan_hash`에 stamp돼, 신선도(freshness)만으로 preflight를 통과한다. 단 `codex_verdict='divergent'`라 거짓 converged는 없고 dedupe는 fail-closed 유지 | **감사 불투명성만 흡수**한다(아래 provenance 절). "plan 게이트를 재실행하라"는 나머지 절반은 운영자가 이 trade-off를 명시적으로 보고 재anchor 경로를 택했으므로 재론하지 않는다 — 결정을 뒤집는 것이 아니라 그 결정이 무엇이었는지 추적 가능하게 만드는 것이 이 흡수의 범위다 |

#### plan-codex receipt 재anchor provenance (F2 흡수)

본 사이클의 `mccp-plan-codex` receipt는 **fresh Plan-Codex 리뷰의 산출물이 아니다.** `/mccp:prp-implement` 실행 중 Validation 결함이 발견돼 plan을 편집했고, 그로 인해 stale이 된 receipt를 `receipt/cli.js write --codex-verdict divergent`로 **수동 재anchor**했다. 기록해 둘 사실:

- 재anchor 시점의 편집 내용은 **설계 결정 변경이 아니라** Validation 가드의 셸 이식성 수정 + 감사 주석이다. 설계 결정은 R1·R2·R3에서 이미 리뷰됐고 그 이후 변경되지 않았다
- 그럼에도 **가드 자체가 M1의 유일한 기계적 강제 수단**이므로 무검증 통과는 아니어야 했다 — 그 검증은 Plan-Codex가 아니라 **Implement-Codex R2**(위 표)가 수행했고, 실제로 F1을 잡아냈다. 즉 이 사이클에서 가드 편집은 리뷰 없이 통과하지 않았다
- receipt의 `resolution.codex_verdict`는 `divergent`로 봉인돼 있어 cross-gate dedupe가 fail-closed다 — 이 재anchor가 후속 `/mccp:pr`의 PR-Codex를 skip시키는 일은 없다
- 따라서 잔여 gap은 "Plan-Codex가 현재 plan 본문 전체를 다시 읽지 않았다"는 것 하나이며, 그 사실은 여기에 명시적으로 기록된다

- Deferred to backlog: 2 → `.claude/plans/codex-findings-backlog.md` (R2 next_steps의 CHECK 6 항목 + 자체 발견 1건)
- Open Questions: 없음 (auto-CRITICAL 해당 없음)
- Implement-Codex R2 구조화 verdict: `divergent` (raw `needs-attention`; F1 흡수, F2 부분 흡수). Codex가 clean 승인을 발급한 적이 없으므로 receipt는 `divergent`로 정직 봉인

### PR-Codex R1 (2026-07-23 — commit `dbb5180` 대상 PR 게이트)

commit 후 `/mccp:pr` 게이트가 발화했다(cross-gate dedupe는 양쪽 receipt가 `divergent`라 fail-closed → PR-Codex 실발화, 설계대로다). raw verdict **`needs-attention`(No ship)**, `codex_actionable_findings=true`, HIGH 1 + MEDIUM 1. `classification=ok`, `mutations=[]`(review-only 불변식 무손상).

| Finding | Severity | Verdict | 재현 검증 | 흡수 |
|---|---|---|---|---|
| F1 version bump가 renderer 회귀 테스트를 깨뜨림 | HIGH (conf .96) | ACCEPT_NOW | **재현됨, 양방향 실측** — main: 667개 중 실패 1(`verdict-label metric`, 선재) / HEAD: 실패 **3**. 늘어난 2건이 정확히 `i18n-surface.test.js`의 footer assert(`v1.22.3` 하드코딩)다. bump 3파일을 main으로 되돌리자 실패가 1로 복귀 → 인과 확정 | 값 교체가 아니라 **`plugin.json` 파생**으로 전환(다음 bump에 같은 실패를 되돌려 놓지 않기 위해). allowlist를 4파일로 확장 + **CHECK 11 신설**로 renderer 스위트를 회귀 대상에 포함 |
| F2 feasibility 산문 표가 스냅샷과 불일치 | MEDIUM (conf .88) | ACCEPT_NOW | **재현됨** — §2.1 표 `121/120` vs `evidence-snapshot.json` `parsed:122`/`empty_resolution:121`; §2.2 `0/121`·`121/121`·`~2026-07-15` vs 스냅샷 `122`·`122`·`2026-07-21`. §2 제목이 그 표를 "스냅샷의 관측값"이라 주장하는데 사실이 아니었다 | 표를 스냅샷 기준으로 재생성 + **CHECK 2d 신설**로 산문↔스냅샷 5행 대조를 기계 강제. §1.5의 "스냅샷이 정답"이 선언에서 강제로 승격 |

> **F1이 통과한 경로가 finding 자체보다 중요하다.** 이 milestone의 Validation은 "유일한 기계적 강제 수단"으로 설계됐고 13개 검사가 전부 초록이었는데, 그 초록이 거짓이었다 — CHECK 10의 glob `lib/tests/*.test.js`가 `lib/renderer/tests/`를 **스캔조차 하지 않기** 때문이다. 즉 가드가 틀린 답을 준 게 아니라 **묻지 않았다**. 이것으로 "가드가 가드하지 못함" 계열이 본 Validation 블록에서 **넷째**다(앞선 셋: 백슬래시 붕괴로 항상-실패 / 항상-통과, grep 성공-시-실패). 앞선 셋은 검사를 실행해야 드러났고, 이번 것은 실행해도 안 드러난다 — **커버리지 밖이라 실행 자체가 안 됐다**. 검사를 실행해보는 것만으로는 부족하고 무엇이 실행되지 않는지도 봐야 한다는 교훈이며, 그래서 흡수를 검사 추가(CHECK 11)로 했다.
>
> **범위 판단**: F1의 `plugins/` 4번째 파일은 PRD의 `동작 코드 변경 0`을 위반하지 않는다 — 테스트 파일이고, 변경 내용은 자기가 검증하는 version surface를 따라가는 것뿐이다. 다만 초판 allowlist가 3개였던 것은 **plan의 사실 오류**(version surface를 하나 빠뜨림)이므로 plan을 고쳤다. plan에만 예외를 적고 넘어가는 것은 R1 F2가 이미 기각한 "계약을 조용히 개정" 패턴이다.

- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 해당 없음)
- PR-Codex R1 구조화 verdict: `divergent` (raw `needs-attention`; 2건 전건 ACCEPT_NOW 흡수). 흡수가 plan 본문·Validation을 편집했으므로 `plan_hash`가 이동 → plan/implement receipt 재anchor + Implement-Codex 재실행 후 PR-Codex 재발화가 필요하다(본 사이클에서 네 번째 재anchor — 매번 실제 결함을 잡았다)
