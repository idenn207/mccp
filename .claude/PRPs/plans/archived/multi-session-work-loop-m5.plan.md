# Plan: Multi-Session Work Loop — M5 (상태 진실원 이전)

**Source PRD**: `.claude/prds/multi-session-work-loop.prd.md`
**Selected Milestone**: M5 — 상태 진실원 이전
**Complexity**: Large

## Summary

M5는 세션 간 진실의 원천을 **되돌릴 수 없는 요약 문서(STATE.md)에서 질의 가능한 append-only 저널로 옮기고**, STATE.md를 그 저널의 **파생 투영물**로 강등한다. 동시에 PRD가 M5의 *차단 요구사항*으로 지목한 축 — 크래시·재개 세션의 지연 기록이 이미 닫힌 작업을 되살리지 못하게 하는 것 — 을 단조 순번 · 세션 epoch · tombstone 우선순위로 닫는다. M3 설계문 §8이 M5에 명시 할당한 네 축(전역 단조 순번 · 파생 상태 재생 순서 · 이력 보존 · TTL 만료 이후의 무기한 replay 방어)이 정확히 이 milestone의 범위다.

GROUND 결과 PRD가 적은 것보다 상황이 한 칸 더 나쁘다.

- **STATE.md는 read-modify-write 전체 덮어쓰기다.** `state-writer.js#update`는 `readState → mergeState → writeStateAtomic`이고, 락은 실패 시 **경고만 남기고 그대로 쓴다**(`state-writer.js:563-567`, last-writer-wins). 저널이 없으므로 덮어쓴 내용은 **복구 경로가 존재하지 않는다**. 이것이 PRD가 "상태 모델의 구조적 취약"이라 부른 것의 실체다.
- **M5가 의존하는 A4의 producer는 프로덕션에서 아티팩트를 한 건도 남긴 적이 없다 (실측).** `*.handoff-items.json`이 **main + worktree 6개 전체에서 0건**이다. 원인은 `session-end.js:382` / `session-start.js:748`이 `handoff-items.js`를 `opts` 없이 호출해 `stateDir`이 **cwd 상대**로 풀리는 것 — M3가 `msw-events`에 대해, M4가 `toggle-snapshot`에 대해 각각 닫은 **CL-5와 동일 결함의 4번째 재발**이고, M4의 수정 주석이 **같은 `try` 블록 8줄 위**에 있다. 게다가 A4는 경로 결함과 **별개로** 계산도 오염돼 있다(`computeA4` 주석 — 스캐너가 자기 세션 sidecar를 교차해 first-session self-credit → 가짜 100%).
- **따라서 M5는 M4와 같은 자리에 서 있다.** PRD Risk 표가 "계측층이 산출하지 못한 채 후속 milestone이 진행돼 각자 producer를 즉석에서 떠안음 — M3·M4에서 이미 **2회** 발생"이라 적은 그 패턴의 3회차다. 다만 M4와 결정적으로 다른 점이 하나 있다: **M5의 산출물인 저널 자체가 A4가 필요로 하는 경계 스코프 기판이다.** 세션 경계 링크(`prev_session_id`)와 작업 단위별 순번이 저널 레코드에 들어 있으면 A4 분자는 파생물로 떨어진다 — 별도 producer를 짓는 것이 아니라 **이미 지어야 하는 것에서 읽는 것**이다.

그래서 M5는 (1) append-only 저널을 SoT로 세우고, (2) STATE.md를 투영으로 강등하되 **바이트 형식과 소비처 18곳을 한 줄도 바꾸지 않고**, (3) 재생 방어를 순수 오라클로 고정하고, (4) 이력 보존 정책을 확정하며(PRD Open Question 직접 응답), (5) A4 분자를 저널에서 파생해 `forward-only → computed`로 뒤집는다.

### 보증 범위 (이 표가 plan 전체의 단일 기준 — M3 G1~G3 · M4 G1~G3 선례)

M5가 보증하는 것은 정확히 다섯이다. 이 목록 밖의 표현은 plan 어디에도 쓰지 않는다.

| # | 보증 | 메커니즘 |
|---|---|---|
| G1 | **정상 모드의 모든 상태 변형이 손실 없이 append된다** — 덮어쓰기로 사라지는 기록이 없다. **degraded 구간은 제외되며(잔여 5) 그 제외는 마커·loud stderr·`journal verify` 비영점 exit로 표면화된다** | `state-writer.update()`가 투영 경유로 재배선. 변형은 저널 append가 먼저이고 STATE.md는 그 결과의 렌더다. 저널 write 실패 시 조용한 직접 쓰기가 아니라 loud degraded 마커 + `journal_degraded` 기록 |
| G2 | **닫힌 작업 단위는 지연·재생 기록으로 되살아나지 않는다 — 저널이 유실된 뒤에도** | `(work_unit, seq)` high-water mark + tombstone + `session_epoch` 우선순위. 지연 레코드는 **저널에는 admit되고 투영에서만 배제**되며 `superseded_by`로 표식(폐기가 아니라 강등 — 이력은 질의 가능해야 하므로). **genesis 부트스트랩은 tombstone을 git-tracked `completion-ledger`에서 재수집**하므로 클론·`git clean` 이후에도 방어가 살아남는다(아래 DD11) |
| G3 | **STATE.md 소비 계약이 불변이다** — 시그니처·렌더 바이트·**소비 목적의 코드 변경 0줄** | `update`/`readState`/`renderState` 시그니처 무변경 + frontmatter 키 순서·8개 섹션 렌더 무변경 + **파서별 M5 전후 파싱 동등성** 회귀 test(두 파서 *상호* 동등이 아님 — 아래 주의). `stateWriter.*`/`state-injector.*` **호출부** 코드 변경 0줄 |
| G4 | **이력이 질의 가능하고, 보존 정책이 투영을 손상시키지 않는다** | `journal query` CLI(work_unit/session/since/kind/include-superseded) + checkpoint 압축. **압축 전후 투영 동등성**을 test가 단언 — 압축이 STATE.md를 바꾸면 실패 |
| G5 | **A4 분자가 경계 스코프로 파생되고, ship 시점 실측으로 `computed` 전환이 확인된다** | 분자를 저널의 `prev_session_id` 경계에서 파생(자기 세션 self-credit 구조적 불가 · genesis 경계는 분모에서 제외) + CL-5 경로 결함 수정. **확인은 배포 후 실측이며 코드 존재는 판정 근거가 아니다**(UI9). 아래 §G5의 조건성 참조 |

> **G3 주의 — "코드 변경 0줄"의 대상은 STATE.md 소비 축이다.** Files to Change는 `session-start.js`·`session-end.js`를 UPDATE하는데, 이 둘은 STATE.md 소비처 목록에도 들어 있다. 그러나 그 편집은 **Task 8의 CL-5 handoff 경로 축**이며 `stateWriter.update`/`readState` 호출부를 건드리지 않는다. 두 축이 한 파일에서 만나므로 G3은 파일 단위가 아니라 **호출부 단위**로 정의하고, Task 7 lint가 그 분리를 기계 검증한다(STATE.md 소비 호출부의 diff가 비어 있어야 한다). 이 구분 없이 "18곳 코드 변경 0"이라 적으면 보증과 Files to Change가 정면 충돌한다 (L2 invariant CRITICAL 흡수).

> **G3 주의 — 두 파서는 오늘도 동일하게 파싱하지 않는다 (실측).** `state-writer.js:293-297`이 렌더하는 `next_chunk: |` 블록 스칼라를 `state-injector.js:59-74`의 독립 파서는 처리하지 못한다. 실측 결과 `state-writer.readState → "line one\n…"` vs `state-injector.readState → "|"`. **선재 비대칭**이며 M5가 만든 것이 아니다. 키 hijack은 없고(정규식이 `^` 앵커라 들여쓴 `  key:` 줄은 매칭되지 않음 — 실측 확인), injector는 `next_chunk`를 소비하지도 않으므로(`REQUIRED_FRONTMATTER_KEYS` 4개 + `escalate_pending` + `confirm_required`만 읽는다) **현재는 잠복**이다. 따라서 G3은 "두 파서 상호 동등"을 주장하지 **않는다** — 주장하는 것은 **파서별 M5 전후 동등**이고, 알려진 divergence는 고정 fixture로 pin해 M5가 조용히 넓히지 못하게 한다 (L2 test CRITICAL 흡수).

> **§G5의 조건성 (L2 architect·test·invariant 3중 지적 흡수 — 운영자 결정: 옵션 (b))**
>
> G5의 확인에는 plan 실행 밖 3단계가 필요하다: `plugin.json` bump(Task 10) → `claude plugin update` → **새 세션 부팅**. 코드가 아무리 옳아도 런타임 hook은 플러그인 캐시에서 로드되므로, 착지 직후에는 아직 아티팩트가 0건이다(M4의 `*.env-snapshot.json`이 지금 정확히 그 상태 — GROUND 참조).
>
> 그래서 G5는 **ship 시점 검증 단계로 명문화**한다: PR 생성 전 implementer가 `claude plugin update` + 새 세션 1회를 수행하고 `*.handoff-items.json` ≥1건 · A4 status `computed`를 **실측**한다. 이것은 acceptance의 일부이며 생략 가능한 후속이 아니다.
>
> **그리고 "실제로 했는가"를 명예 시스템에 맡기지 않는다 (L2 test HIGH + invariant MEDIUM 흡수).** `plugin.json`의 버전이 `~/.claude/plugins/cache/mccp/mccp/<version>/`에 **존재하는지**를 기계 검사한다(Validation §8). 캐시에 그 버전 디렉토리가 없으면 `claude plugin update`가 실행되지 않은 것이고, 따라서 그 뒤의 "실측"은 성립할 수 없으므로 **검사가 실패한다**. 이 검사가 없으면 구현자가 두 단계를 건너뛰어도 acceptance가 조용히 통과한다 — M4의 `*.env-snapshot.json`이 지금 0건인 이유가 정확히 이 미배포이며, 같은 일이 M5에서 반복되는 것을 기계로 막는다.
>
> **미확인 시 처리(고정)**: `computed` 주장을 하지 않고, `docs/multi-session-work-loop/measurement-instrumentation.md`의 A4 행을 `forward-only` 그대로 두며, 보고서에 "분자는 배송, 전환 미확인"으로 기록한다. G5는 그때 **미달**로 계상한다(§대형 코호트 제약대로 분할이 아니라 미달 보고). 이 처리를 사후에 협상하지 않도록 여기서 미리 고정한다.
>
> **그리고 미달은 문서에 **자국을 남긴다** (L2 invariant HIGH 흡수 — "조용한 수용" 우려에 대한 응답).** G5 미확인으로 ship하는 경우 PRD Delivery Milestones의 M5 status를 순정 `complete`로 적지 **않는다** — M4가 `complete (인정 조건 미충족: B1·C1 회귀 검사 산출 불가)`로 남긴 선례를 그대로 따라 미충족을 status 문자열 안에 넣는다. §3.11 C4 기준상 non-canonical이 되어 `/mccp:archive-complete`가 보수적으로 아카이브를 거부하며, **그 거부가 의도된 표식**이다. 즉 미달은 "그냥 통과"가 아니라 대시보드와 아카이브 도구 양쪽에 남는다.

### 보증하지 **않는** 것 (명시 잔여 — 운영자 판단 필요)

> **잔여 1 — 저널은 working-tree 전용이다. 클론 경계를 넘는 이력은 보존되지 않는다.**
>
> STATE.md는 git-tracked로 **유지**하고(CLAUDE.md §3.2 근거 — worktree 리셋·페어 핸드오프에서 컨텍스트 생존), 저널은 `msw-events`·`evidence-claims`와 같은 working-tree 전용으로 둔다. fresh clone은 STATE.md를 **genesis checkpoint**로 저널을 부트스트랩한다. 따라서 클론 밖으로 넘어가는 것은 여전히 요약이다.
>
> 저널을 git-tracked로 만드는 대안은 실행 가능하지만 비용이 크다 — 세션마다 append되는 JSONL이 모든 PR에서 충돌 표면이 된다(§3.12가 ship receipt만 선별 추적한 것과 같은 판단). **본 plan은 working-tree 전용을 전제로 작성됐다.** 뒤집으려면 Task 2·5·10의 구성이 바뀐다.

> **잔여 2 — "요약 문서의 강등"은 소비 계약이 아니라 생성 계약에서만 성립한다.**
>
> M5 이후 STATE.md는 *생성* 측에서 파생물이다(투영만이 쓴다). 그러나 SessionStart가 컨텍스트에 주입하는 것은 여전히 **STATE.md 본문**이다 — LLM이 저널을 질의해 스스로 필요한 이력을 끌어오는 just-in-time 검색은 M5 범위가 아니다(그 축은 컨텍스트 예산·프롬프트 설계 문제로 M4/M7과 얽힌다). 즉 **"다음 세션이 원본에 질의할 수단"은 사람·명령(`journal query`)에게 생기고, 자동 주입 경로에는 생기지 않는다.**

> **잔여 3 — A4를 제외한 지표는 M5가 뒤집지 않는다.**
>
> A1·A2·B1·B2·B3·C1~C3의 producer는 M8 소관 그대로다. M5가 A4만 건드리는 이유는 **저널이 A4의 기판 그 자체이기 때문**이며(다른 지표는 그렇지 않다), 이 경계는 아래 §범위 경계에 명시했다.

> **잔여 5 — degraded 구간의 중간 이력은 복원되지 않는다.**
>
> 저널 append가 실패해 degraded 모드에 들어간 구간(DD6.1)에서는 STATE.md만 갱신되고 저널에는 레코드가 없다. `journal checkpoint --reseed`는 그 구간의 *최종 상태*를 새 genesis로 봉인할 뿐 중간 단계를 되살리지 못한다. 즉 M5는 "덮어쓰기로 인한 손실"은 없앴지만 "저널이 아예 못 쓰인 구간의 이력"까지 보장하지는 않는다.

> **잔여 6 — 무결성은 우발 손상까지다. 적대적 변조는 방어하지 않는다.**
>
> 레코드별 `content_hash`는 부분 write · 인코딩 깨짐 · 편집 실수 · 단건 변조를 검출한다. 그러나 해시를 함께 재계산하는 편집자는 검출하지 못한다(체인·서명 없음 — DD6.3). 단일 운영자 위협 모델이라 M3 §1.1과 같은 판단이며, 팀·다중 사용자 전제가 생기면 재검토 대상이다.

> **잔여 7 — M5는 provisional 스키마 위에서 진행한다.**
>
> PRD가 M2 착수 조건으로 건 *"M1의 `measurement-feasibility.md`가 PROVISIONAL인 동안 착수하지 않는다"* 는 M5에도 상류로 걸린다(M5는 M2의 스키마 위에 얹힌다). M2는 이미 ship됐으므로 되돌리는 것은 이 milestone의 권한 밖이고, M5는 그 사실을 **차단이 아니라 기록**으로 처리한다(Task 0 진입 조건). 재freeze가 스키마를 바꾸면 M5의 저널 레코드 필드가 영향을 받을 수 있다.

> **잔여 8 — 이 plan은 L2 패널의 승인을 받지 못했다.**
>
> **10라운드** 모두 divergent였고 receipt가 없다(위 §L2 Review 최종 상태). 운영자 지시로 HIGH 이상을 흡수한 뒤 진행하는 것이며, **승인된 것이 아니라 미승인 상태로 진행하는 것**이다. 남은 blocking의 다수는 편집으로 닫히지 않는 종류다 — 선언된 잔여(4·6·9·10·11)의 재지적, "아직 구현되지 않았다", 그리고 UI3가 범위 밖으로 못박은 게이트 강도 변경 요구. cross-model 검증은 `/mccp:pr`의 PR-Codex가 담당한다 — **단 조건부다**: `MCCP_CODEX_DISABLED=1`이 user-level `~/.claude/settings.json`에 상시로 켜져 있고(Codex 사용 한도와 무관한 정책 설정), 그 상태로 ship하면 PR-Codex는 발화하지 않고 `codex_verdict='skipped'`가 봉인된다. 즉 **L2 미승인 + PR-Codex skip이 겹치면 이 milestone은 cross-model 검증을 한 번도 받지 않은 채 착지한다.** 그것을 감수할지는 ship 시점의 운영자 결정이며, 받으려면 `/mccp:pr` 실행 시 그 env를 해제해야 한다. 이 조건을 여기 적어 두는 이유는, "PR-Codex가 담당한다"만 적으면 실제로는 비어 있는 안전망을 있는 것처럼 읽게 되기 때문이다.

> **잔여 9 — 정적 lint는 별칭 뒤의 값을 못 본다 (R7 흡수).**
>
> Task 7 축 3은 `enumerateUnfinishedItems(process.cwd())` 리터럴과 **같은 스코프의 1-hop 별칭**(`const f = process.cwd(); …(f)`)까지 잡는다. 그러나 임의 깊이 별칭·재할당·고차 함수 경유, 그리고 **이름은 맞지만 값이 틀린 바인딩**(`…(cwd)`)은 정적으로 판정할 수 없다. 그 축은 `cwd ≠ repoRoot` 런타임 fixture(Task 8)가 답하며, 두 겹이 남기는 사각은 **닫히지 않는다**. 보증은 "세 호출부가 명시 인자를 받고 알려진 cwd 형태가 아니다"까지이지 "인자가 반드시 repoRoot다"가 아니다.

> **잔여 10 — G3은 *동등성*을 증명하지 남은 *정확성*을 증명하지 않는다 (R10 test HIGH 흡수 — 산문에만 있던 한계의 승격).**
>
> Task 3 Validate 2·2b는 (i) M5 전후 산출이 byte-identical (ii) 두 파서가 **미리 고정한 기대값**과 일치 — 두 축을 단언한다. (ii)가 "두 파서가 함께 틀린" 경우를 잡지만 그 커버리지는 **fixture에 리터럴로 박은 필드에 한정**된다. `next_chunk` 같은 **선재 divergence 필드**는 3의 pin이 "격차가 변하지 않았다"만 보증할 뿐, *어느 쪽이 옳은가*는 판정하지 않는다.
>
> 이 한계는 Task 3 Validate 2b 말미에 이미 적혀 있었으나 **잔여 목록에 없었다** — 그래서 R10 리뷰어가 이를 "plan이 G3으로 정확성을 주장한다"는 결함으로 새로 제기했다. G3이 주장하는 것은 처음부터 **"M5가 기존 계약을 바꾸지 않았다"** 이지 **"기존 계약이 옳다"** 가 아니다. 후자는 M5 이전부터 참이 아니었고(선재 divergence), 그것을 바로잡는 것은 두 파서를 통합하는 별도 축이다.

> **잔여 11 — `Validation-SHIP`은 설계상 advisory다. PR 생성을 기계적으로 막지 않는다 (R10 invariant HIGH ×2 흡수 — 산문에만 있던 판정의 승격).**
>
> SHIP-1(배포 확인)·SHIP-2(A4 3-state 판정)은 **비영점 exit로 신호할 뿐 `/mccp:pr`을 차단하지 않는다.** 게이트 강도 변경은 **UI3**가 이번 주기 범위 밖으로 못박았고(Task 7 "범위 밖" 절이 같은 이유로 lint의 PR 게이트 승격도 거절한다), 그래서 M5가 보증하는 것은 *"검사가 존재하고 ship 절차가 호출한다"* 이지 *"우회 불가"* 가 아니다.
>
> **우회의 결과는 그러나 무비용이 아니다.** §G5의 조건성이 미달 처리를 **사전 고정**했고 — `computed` 주장 금지 · `measurement-instrumentation.md` A4 행 `forward-only` 유지 · PRD M5 status를 **non-canonical 문자열**로 기록 — 그 셋은 §3.11 C4 기준상 `/mccp:archive-complete`의 아카이브를 거부하게 만든다. 즉 미달은 대시보드와 아카이브 도구 양쪽에 **자국을 남긴다**. 기계적 차단과 자국 남기기는 다른 강도이며, M5가 선택한 것은 후자다.
>
> SHIP 검사를 `/mccp:pr` Phase 1의 강제 게이트로 승격하는 것은 [backlog](codex-findings-backlog.md)에 기록하고 UI3 제약이 풀리는 주기에 별도 축으로 다룬다.

> **잔여 4 — 락은 여전히 advisory다.**
>
> 저널 append는 `O_APPEND` 단일 버퍼 write라 락 없이도 레코드 단위 원자성을 얻는다(`msw-events.js` 선례). 그러나 투영 → STATE.md rename 구간은 기존 advisory 락을 그대로 쓴다. 락 실패 시 **손실은 사라지지만**(저널에 남으므로 G1) **투영이 잠시 뒤처질 수 있다** — 다음 변형이 재투영하면 수렴한다. 무조건적 상호배제는 주장하지 않는다(M3 §1의 같은 유보).

### 대형 코호트 제약 (반증 조건 — 분할 금지)

M5는 [large-cohort-registry.md](../../docs/multi-session-work-loop/large-cohort-registry.md) §3이 지정한 **대형 작업 코호트**의 일원이다(점수 4 — 참조 지표 1(A4) + Risks 2행 + 코드 변경). PRD 반증 조건상 이 milestone은 **사람의 수동 분할·재정의 없이** 착수부터 PR까지 완주해야 한다.

- M5를 M5a/M5b로 쪼개는 것은 **가설 기각 사유**다. Task가 10개인 것은 범위가 큰 것이지 분할 대상인 것이 아니다.
- 범위를 줄여야 한다면 분할이 아니라 **목표 미달을 정직 보고**한다(M4의 "A3 43.8% — 목표 50% 미달" 선례).

### 범위 경계 (무엇을 건드리지 않는가)

| 축 | 판정 | 근거 |
|---|---|---|
| 게이트 강도 · dual-review 불변식 · receipt chain | **불변** | PRD Out of scope. 저널은 receipt를 대체하지 않는다 — 증거는 `.claude/receipts/`, 상태는 저널로 계속 분리 |
| M3 `evidence-claim.js` 점유 모델 | **불변, 확장만** | M3 §8이 "`claim_epoch`는 M5 모델의 대체물이 아니라 최소 선행 조건"이라 못박았다. M5는 claim을 재작성하지 않고 그 epoch를 저널 순서의 입력으로 **소비**한다 |
| A1·A2·B1·B2·B3·C1~C3 producer | **M8 소관 유지** | 잔여 3 |
| SessionStart 주입 페이로드 | **불변** | 잔여 2 |
| 병렬 워커 · 검증 앙상블 · 팀 동기화 · 네이티브 세션 기능 | **범위 밖** | PRD Out of scope |

## User Intent

<!-- USER-STATED constraints only. 저자 정당화(왜 이 설계를 골랐는가)는 ## Design Decisions 소관. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 작업 단위 하나는 milestone 하나이자 plan 하나이자 PR 하나이며 착수 후 재정의나 세분화를 하지 않는다 | constraint |
| UI2 | M5는 대형 코호트 소속이므로 수동 분할 없이 착수부터 PR 생성까지 완주한다 | constraint |
| UI3 | 게이트 강도 변경은 이번 주기 범위 밖이며 Codex 이중 검사와 증거 chain과 dual-review 불변식을 그대로 유지한다 | exclusion |
| UI4 | 상태 모델 이전은 파생 뷰 유지 방식으로 설계하고 기존 소비처는 변경 없이 동작한다 | constraint |
| UI5 | 지연 재생 기록이 닫힌 작업을 되살리지 못하는 것이 M5의 차단 요구사항이며 단조 순번과 세션 epoch와 해소 tombstone과 점유 만료 의미론과 크래시 재개 재생 테스트를 수용 조건에 넣는다 | direction |
| UI6 | 질의 가능한 이력의 보존 기간과 압축 시점과 용량 상한을 이번 milestone에서 확정한다 | direction |
| UI7 | 점유 만료와 재생 방어에 세션 epoch와 순번과 tombstone 중 무엇을 쓸지 이번 milestone에서 확정한다 | direction |
| UI8 | milestone 착수 시 의존 지표의 producer가 프로덕션에서 산출하는지 GROUND에서 검사하고 아니면 그 사실을 plan 상단에 적는다 | constraint |
| UI9 | 지표가 computed로 뒤집히는 것만 완료 근거로 인정하며 코드가 존재한다는 사실은 판정 근거가 아니다 | constraint |
| UI10 | 병렬 워커 수 확대와 검증 앙상블 도입과 팀 다중 사용자 동기화와 네이티브 세션 기능 대체는 범위 밖이다 | exclusion |
| UI11 | 축의 단조 증가를 억제하며 토글 제거는 삭제가 아니라 default 고정으로 처리한다 | constraint |

## GROUND — 조사 경로 (inline, fail-open)

Phase 2.5 Workflow fan-out 대신 **인라인 Pattern Grounding**으로 수행했다. 세션 지시가 workflow 사용을 명시 요청 시로 제한하며, command body는 fan-out을 GROUND *enhancement*(게이트 아님, fail-open)로 규정한다. 같은 PRD의 M2·M3·M4 plan이 세운 선례를 따른다.

확정된 사실(전부 실행·실파일 대조):

**상태 모델 축**

- `state-writer.js:614-628` `update()` = `withStateLock(readState → mergeState → contentHash 비교 → writeStateAtomic)`. **전체 문서 덮어쓰기**이며 이전 값의 사본이 어디에도 남지 않는다.
- `state-writer.js:563-567` — 락 획득 실패는 `WARNING ... proceeding without lock (race window open)` 후 **그대로 진행**한다. PRD Evidence의 "last-writer-wins" 서술과 코드가 일치한다.
- `mergeState`는 patch 키가 있으면 섹션을 **통째로 교체**한다(`body.done = normalizeBulletList(patch.done)`, L498). 두 세션이 각자 `done`을 patch하면 나중 것만 남는다 — 병합이 아니라 대체다.
- 쓰기 진입점 실측 **8곳**(`grep -c` 기준, tests 제외): `hooks/{pre-compact,session-start,auto-handoff,ecc-context-monitor,goal-phase-guard,stop-review-loop,ultracode-phase-guard}.js` · `lib/{auto-chain,dispatch-envelope,design-grounding}.js` · `receipt/write.js` · `state/{session-spawner,breakpoint-detector}.js`. 읽기 진입점은 `derive/sources/state.js:144` · `hooks/auto-handoff.js:62` · `hooks/ecc-context-monitor.js:391` · `hooks/session-start.js:996` · `receipt/write.js:750,790` · `state-injector.js`(별도 파서).
- **읽기 경로가 둘로 갈라져 있다**: `state-writer.readState`(전체 파싱)와 `state-injector.readState`(독립 frontmatter 파서, `SUPPORTED_STATE_VERSION=1` 자체 상수). 투영이 렌더 형식을 바꾸면 **두 파서 모두** 깨진다 → G3의 회귀가 두 경로를 다 덮어야 한다.
- **그리고 두 파서는 오늘도 같은 답을 주지 않는다 (실측 · L2 test CRITICAL 검증).** `next_chunk`에 다중 라인을 넣고 `renderState` → 두 파서로 각각 읽으면 `state-writer.readState`는 `"line one\ntask_fingerprint: HIJACKED\nline three"`, `state-injector.readState`는 `"|"` 를 반환한다. 원인은 `state-writer.js:223-231`이 `|`/`>` 블록 스칼라를 소비하는 반면 `state-injector.js:63-72`는 줄 단위 `^key: value` 매칭만 하는 것. **영향 범위(실측)**: (a) 키 hijack은 **없다** — 정규식이 `^` 앵커라 들여쓴 `  task_fingerprint: HIJACKED`는 매칭되지 않았다. (b) injector는 `next_chunk`를 **소비하지 않는다**(`REQUIRED_FRONTMATTER_KEYS` 4개 + `escalate_pending` + `confirm_required`만). 따라서 **선재 · 잠복**이며 M5 범위 밖이다. G3의 단언을 "두 파서 상호 동등"이 아니라 **"파서별 M5 전후 동등"** 으로 재정의하고, 이 divergence를 fixture로 pin한다.
- `contentHash` self-bump 억제(`HASH_EXCLUDE_FRONTMATTER_KEYS`, L594)는 STATE.md를 `git status`에서 조용하게 유지하는 장치다. 투영이 매 append마다 파일을 다시 쓰면 이 장치가 무력화된다 → 투영도 같은 해시 비교를 통과해야 한다.

**재생 방어 축**

- M3 `evidence-claim.js`가 이미 갖춘 것: `claim_epoch`(UUID) · TTL 15분 상수 · `superseded[]` bounded 8 · `released_at` tombstone · 5분기 fence(`resurrected-holder` 포함). **그러나 UUID epoch은 순서를 갖지 않는다** — "누가 먼저인가"를 물을 수 없다.
- `evidence-claim.js:39` 주석이 명시: *"tombstone의 superseded 목록은 bounded — 무제한 이력 보존은 M5 소관이다."*
- `evidence-conflict-design.md` §8 M3/M5 경계표가 M5에 배정한 것: **전역 단조 순번 · 파생 상태 재생 순서 · 이력 보존 · TTL 만료 이후의 무기한 replay 방어**. 같은 절: *"`claim_epoch`는 M5 모델의 대체물이 아니다. 그 축의 최소 선행 조건이며, 그것만으로 순서 의미론을 주장하지 않는다."* → M5의 순번은 claim epoch **위에** 얹는 것이지 대체가 아니다.
- `session-ledger.js`는 `created_at` · `last_seen_at` · `pid` · `host` · heartbeat TTL 5분 · host-aware tri-state를 이미 갖췄다(PRD의 "좋은 부품이 이미 있는데 진실의 원천으로 쓰이지 않는다"). **`created_at`이 세션 epoch의 자연스러운 단조 원천**이다 — 저널이 새 epoch 개념을 발명할 필요가 없다.
- `msw-events.js`의 append 계약이 저널의 직접 선례다: `O_APPEND` 단일 버퍼 · bounded allowlist · per-field cap 256 · per-line cap 8KB · malformed per-line skip · `event_id` UUID dedupe 키. **단 `evictLRU`가 global cap 초과 시 오래된 파일의 20%를 unlink한다**(L104-111) — 지표 sidecar에는 타당하나 **SoT에는 그대로 쓸 수 없다**(이력이 조용히 증발). Task 5가 이 지점을 checkpoint 압축으로 대체한다.

**측정 producer 축 (UI8 필수 검사)**

- **`*.handoff-items.json` = 0건.** main + `.worktrees/` 6개 전체 재귀 탐색 결과. A4 producer는 **한 번도 아티팩트를 남기지 못했다.**
- 원인 A(경로): `hooks/session-end.js:382` `handoffItems.writeHandoffItems(sid, unfinished)` — `opts` 미전달 → `handoff-items.js:143` `stateDir = opts.stateDir || path.join('.claude','state')`가 **cwd 상대**. `hooks/session-start.js:748` `handoffItems.restoreAndMatch(observerSessionId)`도 동일. `enumerateUnfinishedItems(process.cwd())`도 cwd 기반.
- **이것은 CL-5의 4번째 발생이며, M4의 수정 주석이 같은 `try` 블록 8줄 위에 있다.** 계수 근거(R8 test MEDIUM 흡수 — 이전 판은 "4번째"라 적고 3건만 인용했다): ① 최초 CL-5 자체(`state-writer`/`msw-events` 경로가 cwd 상대로 풀리던 원 결함, M3 이전) ② `session-start.js:709-712`(M3, msw-events 수정) ③ `:735-741`(M4, toggle-snapshot 수정) ④ `:748` + `session-end.js:381-382`(**미수정** — 이번 milestone 대상). ②③④가 **같은 블록 안에 나란히** 있고 앞의 둘만 고쳐졌다. 넷째를 "재발"이라 부르는 근거는 ①의 결함 형태(경로 인자 미전달 → cwd 상대 해석)가 그대로 반복된다는 것이지 파일이 같다는 것이 아니다.
- 원인 B(계산 오염): `msw-metrics/index.js:278-291` `computeA4` 주석 — 스캐너가 **현재 세션 자신의 sidecar를 포함해** 전부 교차하므로 first session이 자기 handoff를 "복원됨"으로 self-credit → 가짜 100%. 주석이 직접 적었듯 *"The compute is contaminated (not merely a missing producer), so a fixture flag would masquerade an unfixed scanner."* → **경로만 고쳐도 A4는 정직해지지 않는다.** 경계 스코프가 필요하고, 그 경계가 바로 M5 저널의 `prev_session_id`다.
- `*.env-snapshot.json` = **여전히 0건**. M4가 경로를 고쳤으나 런타임 hook은 플러그인 캐시에서 로드되고 설치된 최신 캐시는 **1.23.6**(M4는 1.23.7, 미설치)이다. **M4의 결함이 아니라 미배포 상태**이며, `claude plugin update` 후 재확인이 필요한 미결 항목(STATE.md Open Questions에 이미 기록됨).
- `msw-events` 실 corpus: main에 1파일 4레코드, 전부 `evidence_guard_active`(M3, `evidence-lock.js` — 저장소 소스에서 in-process 실행). **`session_start`/`session_end` 레코드는 0건** — 같은 미배포 원인.
- **결론(UI8 응답)**: M5가 의존하는 A4는 프로덕션에서 산출되지 않으며, 원인이 경로·계산 **양쪽**이다. M5는 이 사실을 숨기지 않고, G5로 **저널 파생 경계 스코프 분자**를 배송해 `computed` 전환을 실측으로 확인한다.

**패턴 선례**

- append-only sidecar 계약 = `state/msw-events.js`(allowlist · cap · malformed 격리 · repoRoot 해석 우선순위).
- 원자 tmp+rename = `state-writer.js:512-523`(pid+rand tmp) · `session-ledger.js:301-311`.
- 순수 오라클 + 얇은 CLI 분리 = `lib/plan-review/cli.js` · `lib/pr-ship-gate.js#deriveShipDecision`.
- 정적 lint로 단일 writer 불변식 강제 = `lib/msw-metrics/b2-coverage-gate.js`(승인 helper 밖 write 검출 → 실패 시 지표를 정직하게 강등). Task 7이 이 구조를 mirror.
- 커밋 아티팩트로 baseline 고정 = `docs/multi-session-work-loop/a3-baseline.json`(M4) · `evidence-snapshot.json`(M1).
- 정직 강등 = `msw-m2-measurement-honesty-downgrade.plan.md`.
- 신규 토글 1개 상한 = M3 `MCCP_EVIDENCE_CONFLICT_GUARD`(설계문 §9 — "신규 토글은 정확히 1개로 제한한다").

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/state/msw-events.js` | `state/<개념>.js` — 상태 기판은 `scripts/state/` 아래, 순수 오라클은 `lib/` 아래 |
| Naming | `plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js` | `<지표>-<역할>.js` — lint/gate는 역할을 파일명 후미에 |
| Errors | `plugins/mccp/scripts/state/msw-events.js:243-245` | append 실패는 throw가 아니라 `{ok:false, reason}` + 호출부 loud warn(fail-open) |
| Errors | `plugins/mccp/scripts/state/evidence-claim.js:192-195` | 판정 불가는 조용한 통과가 아니라 **무엇이 비활성화됐는지 명시한** loud warn |
| Errors | `plugins/mccp/scripts/lib/msw-metrics/index.js:98` | 무결성 위반(`invalid`)을 producer 부재(`forward-only`)보다 **먼저** 판정 |
| Logging | `plugins/mccp/scripts/state/state-writer.js:93-95` | 절단·강등은 침묵하지 않고 `[mccp:<모듈>] WARNING:` 접두로 stderr |
| Data access | `plugins/mccp/scripts/state/state-writer.js:512-523` | 원자 write = `tmp(pid+rand) → rename`, 실패 시 tmp unlink 후 재throw |
| Data access | `plugins/mccp/scripts/state/msw-events.js:192-212` | 경로 해석 우선순위 `opts.dir > opts.repoRoot > walk-up > 레거시` — spawn 없이 statSync walk-up |
| Tests | `plugins/mccp/scripts/state/tests/state-writer.test.js` | `node --test`, 모듈별 1파일, **부재·실패 경로를 명시 assert** |
| Tests | `plugins/mccp/scripts/lib/tests/msw-metrics-b2.test.js` | 지표 강등 조건을 fixture로 고정하고 "고치지 않으면 실패"를 단언 |

## Files to Change

> 경로는 **repo-root 상대 full 경로**다(CLAUDE.md §1.2 — 축약 경로는 cross-gate dedupe matcher를 불발시킨다).

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/state-journal/record.js` | CREATE | 레코드 스키마 + allowlist + 직렬화/파싱 (순수) |
| `plugins/mccp/scripts/lib/state-journal/order.js` | CREATE | 순번·epoch 할당과 **재생 방어 판정 오라클**(순수, 부작용 0) (G2) |
| `plugins/mccp/scripts/lib/state-journal/project.js` | CREATE | 저널 → STATE.md 상태 객체 투영 (순수 reduce) (G1·G3) |
| `plugins/mccp/scripts/lib/state-journal/retention.js` | CREATE | checkpoint 압축 + 세그먼트 회전 + 상한 정책 (순수 판정 + 실행 분리) (G4) |
| `plugins/mccp/scripts/lib/state-journal/index.js` | CREATE | facade — writer/reader 진입점 |
| `plugins/mccp/scripts/state/journal-store.js` | CREATE | append/read/checkpoint I/O (O_APPEND · 원자 rename · 경로 해석) |
| `plugins/mccp/scripts/state/state-writer.js` | UPDATE | `update()`를 저널 append → 투영 경유로 재배선. **공개 시그니처·렌더 출력 불변** (G1·G3) |
| `plugins/mccp/scripts/state/cli.js` | UPDATE | `journal query` / `journal checkpoint` / `journal verify` 서브커맨드 (G4) |
| `plugins/mccp/scripts/lib/msw-metrics/a4-boundary-restore.js` | CREATE | 저널 경계에서 A4 분자 파생 (G5) |
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATE | `computeA4`가 저널 소스를 우선 소비, 부재 시 기존 `forward-only` 유지 (G5) |
| `plugins/mccp/scripts/derive/sources/session-journal.js` | CREATE | derive 소스 — 저널 요약을 통합 모델에 노출 |
| `plugins/mccp/scripts/derive/index.js` | UPDATE | 신규 소스 등록 |
| `plugins/mccp/scripts/state/handoff-items.js` | UPDATE | `resolveHandoffRoot(ctx)` 신규 export — 세 호출부가 공유하는 경로 해석(`ctx.projectRoot` → `discoverRepoRoot` walk-up → skip+마커). **저널을 import하지 않는다**(Task 7 축 4) (G5) |
| `plugins/mccp/scripts/hooks/session-end.js` | UPDATE | CL-5 4번째 재발 수정 — `enumerateUnfinishedItems`/`writeHandoffItems`에 `resolveHandoffRoot` 결과 명시 전달 (G5) |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | CL-5 4번째 재발 수정 — `restoreAndMatch`에 `stateDir`/`cwd` 명시 전달 + 저널 세션 개시 레코드 (G5) |
| `plugins/mccp/scripts/lib/state-journal/single-writer-lint.js` | CREATE | STATE.md를 투영 밖에서 쓰는 경로 0 정적 검사 (b2-coverage-gate mirror) (G1) |
| `plugins/mccp/scripts/state/tests/journal-store.test.js` | CREATE | 부트스트랩 멱등 · malformed 격리 · worktree 경로 교차 0 · ledger tombstone seed (Task 2 Validate가 호출하는데 이전 판은 이 표에 없었다 — R9 architect MEDIUM 흡수) |
| `plugins/mccp/scripts/lib/tests/state-journal-order.test.js` | CREATE | 순번·epoch·tombstone 우선순위 회귀 (G2) |
| `plugins/mccp/scripts/lib/tests/state-journal-projection.test.js` | CREATE | 투영 동등성 + 골든 바이트 회귀(두 파서 경로) (G3) |
| `plugins/mccp/scripts/lib/tests/state-journal-replay.test.js` | CREATE | **크래시·재개 재생 시나리오** — 닫힌 작업 부활 불가 (G2, UI5) |
| `plugins/mccp/scripts/lib/tests/state-journal-retention.test.js` | CREATE | 압축 전후 투영 동등성 + 상한 발화 (G4) |
| `plugins/mccp/scripts/lib/tests/state-journal-single-writer.test.js` | CREATE | lint 부정 fixture(투영 밖 write를 심으면 실패) (G1) |
| `plugins/mccp/scripts/lib/tests/a4-boundary-restore.test.js` | CREATE | self-credit 불가 · 경계 교차만 계상 (G5) |
| `docs/multi-session-work-loop/m5-assertion-manifest.json` | CREATE | Task 0 단언 매니페스트 — 각 Task의 Validate 단언을 `{task, id, title}` 기계 판독 목록으로 고정. **Task 0의 Validate가 이 파일을 읽으므로 없으면 검증 자체가 실행 불가**(R8 test CRITICAL 흡수 — 이전 판은 Task 0이 요구만 하고 어느 Task도 만들지 않았다) |
| `docs/multi-session-work-loop/state-truth-source-design.md` | CREATE | 보증 표 · 위협 모델 · 보존 정책 · M3/M5 경계 확정 (UI6·UI7 응답) |
| `docs/multi-session-work-loop/evidence-conflict-design.md` | UPDATE | §8 경계표에 M5 착지 결과 반영(대체 아닌 확장임을 고정) |
| `docs/multi-session-work-loop/measurement-instrumentation.md` | UPDATE | A4 status `forward-only → computed` + 근거 갱신 (G5) |
| `docs/ENVIRONMENT.md` | UPDATE | §11에 신규 토글 1개 등재 (UI11) |
| `.claude/prds/multi-session-work-loop.prd.md` | UPDATE | M5 status + Open Questions 2건 `[x]` + 근거 기록 |
| `.gitignore` | UPDATE | `.claude/state/journal/` 추가 (잔여 1 — working-tree 전용) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.7 → 1.23.8` (§3.7 patch — M6·M7·M8 미완이므로 minor 아님) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (§3.7 5면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | version 단언 동기 |
| `CHANGELOG.md` | UPDATE | `## [1.23.8]` 신규 항목 |

## Design Decisions

<!-- 저자 정당화. ## User Intent와 분리 — 리뷰어 오라클은 이 절에 도달하지 않는다. -->

**DD1 — 저널은 `msw-events`를 재사용하지 않고 별도 파일군을 쓴다.** `msw-events`는 지표 sidecar이고 `evictLRU`가 global cap 초과 시 오래된 파일을 **unlink**한다(`msw-events.js:104-111`). SoT에 그 정책을 얹으면 이력이 조용히 증발하며, 이는 PRD가 M5로 없애려는 "되돌릴 수 없는 압축" 그 자체다. 대신 append 계약(allowlist·cap·malformed 격리·경로 해석)은 그대로 **모방**한다.

**DD2 — 세션 epoch은 새로 발명하지 않고 `session-ledger.created_at`에서 파생한다.** UUID인 `claim_epoch`은 순서를 갖지 않으므로 "누가 먼저인가"를 답할 수 없다. ledger는 이미 단조 `created_at` + heartbeat + host/pid를 갖췄고 PRD가 직접 "저활용"이라 지목한 부품이다. 축을 늘리지 않고 기존 부품을 진실원 경로에 올리는 것이 UI11과도 정합한다. 동률(같은 밀리초)은 `session_id` 사전순으로 결정론적으로 깬다.

**DD3 — 지연 레코드는 폐기하지 않고 투영에서만 배제한다.** 폐기하면 "질의 가능한 이력"이 깨지고(UI6), 무엇이 왜 무시됐는지 감사할 수 없다. `superseded_by`로 강등만 하면 G2(부활 불가)와 G4(질의 가능)를 동시에 만족한다. `journal query --include-superseded`가 그 기록을 노출한다.

**DD4 — 투영은 순수 reduce이고 I/O를 갖지 않는다.** `project(records) → state` 를 순수 함수로 두면 (a) 압축 전후 동등성을 test가 단언할 수 있고(G4), (b) 크래시 재생 시나리오를 파일 없이 재현할 수 있으며(G2), (c) `state-writer`의 기존 `renderState`를 그대로 재사용해 바이트 형식이 자동으로 보존된다(G3). M3의 `deriveShipDecision`·`decideCritique`가 세운 "판정은 순수, 실행은 얇게" 선례.

**DD5 — `update()`의 시그니처를 바꾸지 않는다.** 쓰기 진입점이 8곳, 읽기가 6곳 + 독립 파서 1개다. API를 바꾸면 소비처 전부를 이번 PR에 끌어들이게 되고 UI4("기존 소비처는 변경 없이 동작")를 위반한다. `update(repoRoot, patch)`는 내부적으로 patch를 레코드로 append한 뒤 재투영해 STATE.md를 쓴다 — 호출자 관점에서 동작이 동일하다.

**DD6 — 저널 write 실패는 조용한 직접 쓰기로 폴백하지 않는다.** 폴백이 조용하면 "SoT는 저널"이라는 주장이 검증 불가가 된다(M2가 이미 한 번 잡아낸 confidently-wrong 패턴). 실패 시 loud stderr + `journal_degraded` 마커를 남기고 **그 세션의 투영은 degraded로 표기**한다. 세션은 계속 진행한다(fail-loud-open — hook을 차단하면 M5가 파이프라인을 멈추는 Risk가 실현된다).

**DD6.1 — abort 의미론과 degraded 모드 (L2 invariant CRITICAL 흡수 — 초안은 데이터 손실 경로를 열어두고 있었다).**

초안은 "append 실패 → STATE.md는 여전히 write"라고만 적었다. 그러면 **다음 `update()`가 불완전한 저널을 투영해 그 degraded write를 덮어쓴다** — G1이 약속한 무손실이 정확히 그 지점에서 깨진다. 마커는 *탐지*이지 *예방*이 아니라는 지적이 옳다. 그래서 degraded는 플래그가 아니라 **모드**다.

| 상황 | 저널 | STATE.md | 이후 동작 |
|---|---|---|---|
| append 성공 · 투영 성공 | 레코드 1건 | 재투영 결과로 write(내용 동일하면 `contentHash` 비교로 skip) | 정상 |
| append 성공 · STATE.md write 실패 | 레코드 **잔존** | 미갱신 | 저널은 **완전**하므로 다음 `update()`의 재투영이 자동 수렴. 손실 없음 |
| **append 실패 ∧ 마커 write 성공** | 없음 | write **한다** | **degraded 모드 진입** — 아래 |
| **append 실패 ∧ STATE.md write 성공 ∧ 마커 write 실패** (R7 invariant CRITICAL ×2 + security HIGH 흡수 — 아래 참조) | 없음 | write **했다**(되돌리지 않는다) | `update()`가 **throw**한다. patch는 디스크에 착지했는데 caller는 실패를 받는다 — 어긋나 보이지만 이쪽이 옳다: **강등이 기록되지 못했으므로** 성공을 반환하면 다음 세션이 불완전한 저널을 온전한 것으로 읽는다. STATE.md를 되돌리지 않는 이유는 rollback이 *또 하나의 실패 가능한 write*이고, 이미 fs가 흔들리는 구간에서 그것을 신뢰할 근거가 없기 때문이다. `journal verify`의 추론 축(아래)이 2차 그물 |
| `decideAdmission` = `reject-malformed` | append 안 함 | 미갱신 | caller에 `{ok:false}` + loud warn. 이 patch는 반영되지 않는다 |
| **append 실패 ∧ STATE.md write 실패** (중첩 — L2 invariant MEDIUM 흡수) | 없음 | 미갱신 | degraded 마커 진입 **시도**. 마커 write까지 실패하면 그 자체가 fs 전면 장애이므로 `update()`가 **throw**한다(조용한 성공 반환 금지). 다음 세션의 `journal verify`가 STATE.md ↔ 저널 불일치로 검출 |

**degraded 모드 (sticky).** append 실패는 `.claude/state/journal/.degraded` 마커를 남기고, **마커가 존재하는 동안 `update()`는 투영을 하지 않는다** — M5 이전의 직접 경로(`readState → mergeState → writeStateAtomic`)로 동작한다. 따라서 불완전한 저널이 STATE.md를 덮어쓰는 경로 자체가 닫힌다. 그 구간 동안 SoT는 저널이 아니라 STATE.md이며, 그 사실이 마커·loud stderr·`journal verify` 비영점 exit 세 곳에 동시에 드러난다.

**마커 검사 위치는 계약이다 (L2 security MEDIUM 흡수).** 마커 확인은 `update()`가 **기존 advisory 락을 잡은 직후 가장 먼저** 수행하는 일이며, 그 뒤 투영/직접 경로 분기가 결정된다. 락 밖에서 보거나 분기 이후에 보면 두 프로세스가 서로 다른 모드로 같은 STATE.md를 쓰는 창이 열린다. 락 자체는 여전히 advisory(잔여 4)이므로 이 배치가 상호배제를 *만들지는* 않지만, **모드 판정과 쓰기가 같은 임계구역 안에 있다**는 것은 보장한다 — 즉 락이 성립한 경우에 모드 혼선이 없다.

**복구**는 자동이 아니다: `journal checkpoint --reseed`가 현재 STATE.md를 새 genesis checkpoint로 봉인하고 마커를 지운다. 이때 degraded 구간의 *중간* 이력은 복원되지 않는다 — 그 손실은 **명시 잔여 5**로 기록하며 숨기지 않는다.

**마커는 "기록"이 아니라 "차단"이어야 한다 (L2 invariant R6 HIGH 흡수 — 내 R3 수정이 남긴 구멍).** 지적이 정확했다: 마커를 남기기만 하면, degraded 세션이 크래시한 뒤 다음 세션의 genesis 부트스트랩이 **불완전하다고 이미 알려진 저널 위에서** 조용히 재개한다. **타협점** — 마커가 있으면 부트스트랩이 **거부**한다:

- `.degraded`가 존재하는 동안 genesis 부트스트랩은 실행되지 않고 `EX_TEMPFAIL`로 멈추며, 진행하려면 운영자가 `journal checkpoint --reseed`를 명시 호출해야 한다. 즉 복구가 *권장*이 아니라 *경로상 필수*가 된다.
- SessionStart가 마커 존재를 `<system-reminder>`로 표면화한다(사용자가 다음 세션에서 즉시 안다).
- 단 이 거부는 **저널 경로에만** 적용된다 — STATE.md 직접 경로는 계속 동작하므로 세션이 막히지 않는다(파이프라인 정지 회피). 막히는 것은 "저널을 SoT로 삼는 것"이고, 그것이 정확히 신뢰할 수 없는 상태다.

**마커 write 실패는 치명으로 처리한다 (L2 security R6 HIGH 흡수 — 같은 결함의 다른 면).** hook의 `update()`가 fail-open이라 예외가 warning으로 삼켜지면, **강등을 기록하지 못한 강등**이 남는다 — 이 milestone이 없애려는 침묵 실패의 정의 그 자체다. 따라서 마커 write 실패는 삼키지 않고 `update()`가 throw한다. 그리고 마커가 유실되는 경로(외부 삭제 등)에 대비해 `journal verify`가 **추론 축**을 하나 더 갖는다: *STATE.md의 `updated_at`이 저널 최신 레코드의 `ts`보다 뒤*면 마커가 없어도 degraded로 판정한다. 마커는 1차 신호이고 이 추론이 2차 그물이다.

**그 처리가 사는 곳을 명시한다 (R7 invariant CRITICAL 흡수 — "약속은 산문에만 있고 Task·Files to Change 어디에도 구현 위치가 없다").** 지적이 정확했다. 위 문단은 R3부터 "throw한다"고 적어 왔지만 그것을 *어느 함수가* 수행하는지는 적힌 적이 없고, 그러면 구현자가 어디에도 넣지 않아도 plan과 모순되지 않는다. 책임을 두 층으로 갈라 고정한다:

| 층 | 함수 | 계약 |
|---|---|---|
| I/O | `journal-store.js#writeDegradedMarker(repoRoot)` (Task 2) | 성공 `{ok:true}` / 실패 `{ok:false, reason}`. **throw하지 않는다** — `msw-events.js:243-245` 계약 그대로 |
| 판정 | `state-writer.js#update()`의 degraded 진입 분기 (Task 3) | `{ok:false}`를 받으면 loud stderr 후 **throw**. 이 한 곳이 유일한 throw 지점이다 |

**그 throw가 무엇을 보증하는지 정확히 적는다 (R8 invariant CRITICAL 흡수).** 지적의 실질은 이렇다 — hook은 fail-open이라 상위 `try/catch`가 이 throw를 warning으로 삼킬 수 있고, 그러면 "throw한다"가 실효를 잃는다. 그 우려는 타당하되 **throw의 목적을 오해하면 과대 요구가 된다**. 보증은 "세션이 시끄럽게 죽는다"가 **아니라** 다음 둘이다:

1. **`update()`는 성공을 반환하지 않는다.** 상위가 삼키더라도 caller는 성공 경로를 타지 못한다 — 강등을 기록하지 못한 변형이 "정상 처리됨"으로 계상되는 일이 없다.
2. **다음 세션이 반드시 알아챈다.** 마커가 없어도 `journal verify`의 추론 축(`STATE.md.updated_at > 최신 레코드.ts`)이 불일치를 잡고 비영점 exit한다.

즉 이 경로에서 M5가 없애는 것은 *침묵*이지 *실패* 자체가 아니다. hook을 죽이는 쪽을 고르면 저널 결함이 곧 파이프라인 정지가 되어 Risk 표의 항목이 실현된다 — 그것이 이 milestone이 명시적으로 피하는 결과다. **남는 것**: 상위가 삼킨 그 세션 안에서는 사용자가 stderr 외의 신호를 받지 못한다(다음 세션에서 검출). 이 지연을 **잔여 5의 일부**로 읽는다.

**이 분리가 DD6의 fail-open 원칙에 대한 유일한 예외이며, 예외인 이유는 대상이 다르기 때문이다.** DD6의 fail-open은 *상태 변형*이 hook을 멈추지 않게 하려는 것이고, 여기서 실패한 것은 변형이 아니라 **변형이 신뢰 불가임을 알리는 통로**다. 그 통로가 끊긴 채로 성공을 반환하면 남는 것은 조용한 강등이고, 그것을 없애는 것이 이 milestone의 목적이다. 예외를 한 함수·한 분기로 좁혀 두는 이유도 같다 — 예외가 넓어지면 M5가 파이프라인을 멈추는 Risk가 실현된다.

**DD6은 "직접 쓰기 금지"가 아니라 "조용한 폴백 금지"다.** degraded 모드는 직접 쓰기지만 마커·경고·비영점 exit·복구 명령을 동반하므로 조용하지 않다. 쓰지 않는 선택지는 저널 결함을 곧바로 파이프라인 정지로 만들어 Risk 표의 "상태 모델 이전 중 파이프라인이 멈춤"을 실현시킨다.

**DD6.2 — 읽기 경로는 replay하지 않는다 (L2 invariant HIGH ×2 흡수).** `readState`/`state-injector.readState`는 M5 전후로 **디스크의 STATE.md만** 읽는다(G3 — 시그니처·동작 무변경). 저널 replay는 **오직 `update()` 안에서만** 일어난다. 그 결과 읽기 N회가 replay N회가 되는 일이 없고, 소비처 14곳의 성능·의미가 그대로다. STATE.md가 저널보다 뒤처질 수 있는 구간은 위 표의 2행(STATE.md write 실패)뿐이고 다음 `update()`가 수렴시킨다. 수렴을 기다리지 않고 즉시 맞추려면 명시 명령 `journal verify --reproject`를 쓴다 — 읽기 경로에 암묵 replay를 넣지 않는 이유는, 넣는 순간 `readState`가 부작용을 갖게 되어 G3의 "동작 무변경"이 거짓이 되기 때문이다.

**투영에 도달하는 enum은 `admit` 하나뿐이다.** `admit-superseded`·`admit-post-tombstone`은 저널에 남되 투영에서 제외되므로 STATE.md를 **바꾸지 않는다**(재투영 결과가 이전과 같아 `contentHash` 비교에서 write가 skip된다 — 지연 레코드는 파일 mtime조차 건드리지 않는다). `reject-malformed`는 저널에도 들어가지 않는다.

**DD6.3 — 무결성은 우발 손상까지만 방어한다 (L2 security HIGH 흡수, 범위 명시).** 저널이 SoT인데 레코드 무결성 검사가 전혀 없으면 `journal verify`는 "디스크와 일치하는가"만 답하고 "저널 자체가 온전한가"는 답하지 못한다. 그래서 각 레코드에 **`content_hash`**(해당 필드를 제외한 정규 직렬화의 sha256)를 싣고 `journal verify`가 전수 재계산한다. 손상 레코드는 **격리**(투영 제외 + 진단 카운트)되며 조용히 통과하지 않는다.
**write 시점에는 무엇이 있는가 (R8 invariant MEDIUM 흡수 — "`content_hash`는 read 이후 검출일 뿐 write 시점 보호가 아니다").** 맞다. write 측 장치는 `O_APPEND` **단일 버퍼 write** 하나이고, 그것이 주는 것은 *레코드 단위 원자성*(다른 writer의 레코드와 뒤섞이지 않음)이지 매체 무결성이 아니다. 섹터 손상·커널 버퍼 손상은 이 층에서 막을 수단이 없으며, 그래서 `content_hash`가 **read 측 그물**로 존재한다. 즉 M5의 구조는 "write에서 섞임을 막고, read에서 손상을 잡는다"이고, 둘 다 **우발** 축이다. 이 배치를 보증으로 적되 write-시점 매체 보호를 주장하지 않는다.

**보증 범위**: 우발 손상(부분 write · 인코딩 깨짐 · 편집 실수)과 단건 변조는 검출한다. **해시 체인은 넣지 않는다** — 해시까지 재계산하는 적대적 편집자는 검출하지 못하며, 그것은 M3 §1.1이 이미 범위 밖으로 선언한 단일 운영자 위협 모델과 같은 판단이다. 이 한계를 **명시 잔여 6**으로 기록한다.

**DD11 — genesis는 tombstone을 git-tracked `completion-ledger`에서 재수집한다 (L2 invariant CRITICAL 흡수).**

초안의 구멍: 저널은 working-tree 전용(잔여 1)이라 클론·`git clean`·worktree 리셋으로 사라진다. 그 뒤 STATE.md만으로 genesis를 부트스트랩하면 **tombstone이 하나도 없는 저널**이 생기고, 그 시점부터 크래시 세션이 되살아나 append하면 **이미 닫힌 작업 단위가 admit된다** — G2가 정확히 막겠다고 한 것이 저널 수명 밖에서 무력해진다.

해법은 새 durable 저장소를 만드는 것이 아니라 **이미 git-tracked인 것을 읽는 것**이다: `.claude/state/completion-ledger/`는 종료된 작업 단위를 `<decision_id>__<receipt_hash[0:12]>.json`으로 기록하며 **추적 대상**이다(§3.12). genesis 부트스트랩은 이 디렉토리를 스캔해 각 엔트리를 **tombstone 레코드로 seed**한다. 클론 직후에도 "무엇이 닫혔는가"를 알 수 있으므로 부활 방어가 유지된다.

- ledger 엔트리는 `seq`를 갖지 않으므로 seed된 tombstone의 high-water는 **`+∞`(해당 work_unit의 모든 후속 레코드를 `admit-post-tombstone`)** 로 둔다. 닫힌 단위에 새 작업이 필요하면 새 slug를 쓰는 것이 mccp의 기존 관례이므로(§3.12 "정당한 재-ship은 새 decision slug") 과차단이 아니다.
- ledger 자체가 없거나 읽기 실패면 **loud warn + tombstone 0으로 진행**한다(부트스트랩을 막으면 클론이 곧 파이프라인 정지가 된다). 그 경우 G2는 저널 수명 안에서만 성립하며 `journal verify`가 그 사실을 보고한다.
- **ledger 엔트리는 검증하고 세며, 손상분을 숨기지 않는다 (L2 security MEDIUM 흡수).** 부트스트랩은 엔트리별로 JSON parse + 필수 필드(`decision_id`) 존재를 확인하고, 실패분을 `seeded` / `corrupt` 두 카운터로 나눠 genesis 레코드에 기록한다. `corrupt > 0`이면 loud stderr + `journal verify` 비영점 exit이다 — **손상된 ledger는 tombstone을 적게 seed하므로 부활 방어에 구멍이 생기는데, 그 구멍이 조용하면 G2가 성립한다고 오독된다.** 다만 M5는 ledger를 *복구*하지 않는다(그것은 §3.12 증거 축의 문제다): 보증하는 것은 **"적게 seed됐다는 사실이 반드시 표면화된다"** 이지 "언제나 완전히 seed된다"가 아니다.
- 이 seed는 M3 `evidence-claim.js`의 점유 모델을 대체하지 않는다 — 점유는 15분 TTL의 *동시성* 축이고, tombstone은 *순서* 축이다(M3 §8 경계 그대로).

**DD12 — 세션 정체성의 취득 경로 (R11 architect CRITICAL ×2 흡수 — 이 축은 plan 어디에도 없었다).**

지적이 정확했다. Task 1은 모든 레코드에 `session_id` · `session_epoch` · `prev_session_id`를 요구하고, DD5는 `update(repoRoot, patch)` 시그니처를 **동결**하며, G5는 A4 분자를 `prev_session_id` 경계에서 파생한다. 그런데 **`update()`가 그 세 값을 어디서 얻는지는 적힌 적이 없다.** DD2는 *순서의 원천*(`created_at`)만 답하고 *취득 경로*는 답하지 않는다. 이 상태로 구현에 들어가면 구현자가 즉석에서 발명하게 되고, 발명마다 A4 의미론이 달라진다 — G5가 "구조적으로 불가능"해질 수 있다는 지적의 실질이 이것이다.

세 값의 출처를 **전부 기존 부품**으로 고정한다(UI11 — 축을 늘리지 않는다). `update()`는 인자를 받지 않고 아래를 **자기 안에서** 해석하므로 시그니처 동결과 충돌하지 않는다.

| 필드 | 출처 | 부재 시 |
|---|---|---|
| `session_id` | [`orchestration-runaway.js#resolveSessionKey(process.env)`](../../plugins/mccp/scripts/lib/orchestration-runaway.js) — `MCCP_SESSION_ID` → `CLAUDE_CODE_SESSION_ID` → `CLAUDE_SESSION_ID` → `'unknown'`. **이 저장소의 canonical resolver**이며 `/mccp:plan` 5.2·fan-out 예약이 같은 함수로 키를 잡는다. 새 resolver를 만들면 그 둘과 키가 갈라진다 | `'unknown'` 문자열 그대로 기록(누락 아님) — 아래 참조 |
| `session_epoch` | `session-ledger.readLedger({sessionId})`의 `created_at`(DD2). 단조 · host/pid 검증 완료된 값 | ledger 부재/읽기 실패 → **레코드의 `ts`를 epoch로 대체** + `epoch_source:'ts-fallback'` 표기. 순서는 여전히 성립하고(둘 다 시각), 어느 쪽 근거인지가 레코드에 남는다 |
| `prev_session_id` | **저널 자신**에서 파생한다 — 현재 저널의 최신 레코드의 `session_id`가 지금 것과 **다르면** 그 값, 같으면 `null`. ledger를 다시 읽지 않는다 | 저널이 비었으면(genesis) `null` → DD10대로 분모에서 제외 |

**`prev_session_id`를 ledger가 아니라 저널에서 파생하는 이유**가 이 DD의 핵심이다. ledger에서 "직전 세션"을 고르면 *시간상 직전*을 얻는데, A4가 물어야 하는 것은 *이 저장소의 상태를 실제로 이어받은* 세션이다 — 다른 worktree에서 동시에 돈 세션이 시간상 더 가까울 수 있고, 그러면 분자가 무관한 경계를 세게 된다. 저널의 최신 레코드는 **정의상 이 저장소 상태를 마지막으로 만진 세션**이므로 경계가 정확하다. 부수 효과로 A4가 ledger 가용성에 의존하지 않는다.

**`'unknown'`은 정상 값이지 결함이 아니다.** hook 밖(수동 CLI 등)에서 `update()`가 불릴 수 있고 그때 세션 id는 실제로 없다. 그러나 `session_id==='unknown'`인 레코드는 **A4 경계에서 제외**한다 — `'unknown'` 두 개를 서로 다른 세션으로 세면 self-credit이 뒷문으로 돌아온다(DD10과 같은 종류의 거짓 값). 즉 기록은 하되 계상하지 않는다. Task 8 Validate 단언 (a)가 이 케이스를 포함한다.

**DD10 — genesis 경계는 A4 분모에서 제외한다 (L2 architect MEDIUM 흡수).** fresh clone은 저널이 없어 STATE.md에서 genesis checkpoint를 부트스트랩하는데, 그 레코드의 `prev_session_id`는 `null`이다. 이를 경계로 세면 "이전 세션이 없는데 복원율을 계산"하게 되어 A4가 정의되지 않는다 — self-credit과 같은 종류의 거짓 값이다. 따라서 경계는 **양쪽이 모두 실 세션일 때만** 성립하고, genesis만 있는 저장소의 A4는 `computed 0%`가 아니라 **`insufficient`(경계 0)** 다. 이는 잔여 1(working-tree 전용)의 직접 귀결이며, 클론 직후 A4가 잠시 `insufficient`로 돌아가는 것은 결함이 아니라 정직한 표기다.

**DD7 — 신규 토글은 정확히 1개(`MCCP_STATE_JOURNAL`).** M3 설계문 §9가 세운 상한을 그대로 따른다(UI11). 값은 `enforce`(default, 투영이 권위) · `shadow`(저널은 쓰되 STATE.md는 기존 직접 경로 — 회귀 시 복구용) · `off`(저널 비활성 + loud warn). 보존 기간·용량 상한은 **상수**로 두고 test 주입만 허용한다(M3 TTL 선례).

**토글의 운영 계약을 못박는다 (R8 invariant HIGH 흡수 — "복구 스위치라고만 적혀 있고 불변식이 정의되지 않았다").** 지적이 정확했다. 세 값의 의미만 있고 *언제 켜지는가·얼마나 지속되는가·무엇을 실제로 되돌리는가*가 없으면 "복구 스위치"는 검증 불가능한 문구다:

| 축 | 계약 |
|---|---|
| 발동 | **수동 전용.** 자동 강등 경로는 **없다** — 자동 강등은 `.degraded` 마커(DD6.1)의 일이고, 그쪽은 append 실패라는 관측 사실에 매인다. 토글이 스스로 값을 바꾸면 "무엇이 SoT인가"를 코드가 런타임에 정하게 되어 G1이 검증 불가가 된다 |
| 지속 | **프로세스 수명.** env를 지우면 다음 프로세스는 `enforce`로 복귀한다. 상태 파일에 기록하지 않으므로 sticky하지 않다 — sticky한 것은 마커뿐이고, 둘을 섞으면 어느 쪽이 이겼는지 물을 수 없다 |
| 우선순위 | **마커 > 토글.** `.degraded`가 있으면 `enforce`여도 직접 경로다(DD6.1). 토글은 마커를 지우지 못한다 — 지우는 것은 `journal checkpoint --reseed` 하나뿐이다 |
| `shadow`가 되돌리는 것 | STATE.md **쓰기 경로만**. 저널 append는 계속하므로 저널은 계속 자란다(회귀 진단용 데이터를 남기는 것이 이 값의 목적이다) |
| 검증 | Task 3 Validate에 **양성 단언**: `shadow`에서 산출된 STATE.md 바이트가 **M5 이전 경로 산출과 byte-identical**이고, 같은 시퀀스의 저널 레코드 수가 `enforce`와 **동일**하다. 이 두 단언이 없으면 "복구된다"는 주장이 test로 존재하지 않는다 |

**DD8 — A4만 뒤집고 나머지 지표는 M8에 남긴다.** 저널은 A4의 기판 *그 자체*라 파생물이 공짜로 떨어지지만(경계 링크가 레코드에 이미 있어야 하므로), A1·B3·C계열은 저널과 무관한 별도 producer를 요구한다. 그것까지 끌어오면 M8을 흡수하게 되고 대형 코호트 완주 판정이 오염된다(M4가 B3 은퇴를 이연한 것과 같은 논리).

**DD9 — CL-5 4번째 재발은 M5가 고친다.** "M8 소관이니 두자"는 선택지가 아니다 — 이 결함이 살아 있으면 M5가 배송하는 A4 분자의 **분모(handoff 열거)가 여전히 cwd 상대**라 저널 파생 분자와 짝이 맞지 않는다. 수정 범위는 호출부 2곳의 인자 전달(약 4줄)이며 새 기능이 아니다.

## Tasks

### Task 0: 진입 조건 확인 + 단언 매니페스트 (선행)
- **Action (진입 조건 — L2 invariant R6 HIGH 흡수)**: PRD가 M2 착수 조건으로 건 *"M1의 `measurement-feasibility.md`가 PROVISIONAL인 동안 착수하지 않는다"* 가 M5에도 상류로 걸린다(M5는 M2의 스키마 위에 얹힌다). 착수 시 그 문서의 상태를 읽어 **PROVISIONAL이면 차단하지 않고 기록**한다 — M2가 이미 ship됐으므로 되돌리는 것은 이 milestone의 권한 밖이고, 침묵하는 것이 문제다. 상태를 `## 진입 조건` 절에 인용하고, PROVISIONAL이면 **명시 잔여 7**("M5는 provisional 스키마 위에서 진행한다")로 등재한다.
- **Action (단언 매니페스트 — L2 test R6 HIGH 흡수)**: 리뷰어의 실질 요구는 *"명세를 구현 전에 검증할 기계 장치가 없다"* 였다. 각 Task의 Validate 단언을 `docs/multi-session-work-loop/m5-assertion-manifest.json`에 **기계 판독 목록**으로 옮기고(`{task, id, title}`), `single-writer-lint.js --assertions`가 매니페스트의 모든 `title`이 실제 test 파일의 `test('...')` 제목으로 **존재하는지** 대조한다. 구현 전에는 "어떤 단언이 아직 없는가"를 목록으로 출력하고, 구현 후에는 누락을 실패로 만든다. 이것이 plan의 단언과 코드의 단언이 갈라지지 않게 하는 유일한 기계 장치다.
- **단, 그 대조는 Task 0의 Validate가 아니다 (R10 test CRITICAL 흡수).** `--assertions` 모드는 `single-writer-lint.js`에 있고 **그 파일은 Task 7이 CREATE한다** — Task 0 시점에는 존재하지 않으므로 Task 0의 Validate가 그것을 호출하면 **Task 0 자체가 실행 불가**다. 이는 R8의 B1(매니페스트를 아무 Task도 만들지 않음)과 **같은 형태의 순환 의존**이며, B1 흡수가 산출물 축만 닫고 **도구 축을 남긴** 것이다. 따라서 책임을 시점으로 가른다:
  - **Task 0 (구현 전)** — 매니페스트가 **잘 형성됐는가**만 본다. 외부 도구 0개, `node -e` 자체 완결 검사(아래 Validate). 이 시점에 test 파일이 없는 것은 정상이므로 대조를 요구하지 않는다.
  - **Task 7 (도구 착지)** — `--assertions` 모드를 구현하고 자기 Validate에서 실행한다.
  - **Validation §11 (전 Task 완료 후)** — `absent 0`을 요구하는 **유일한 강제 지점**. 대조는 원래 *구현 후* 게이트이며, §11이 이미 그 역할을 갖고 있다.
- **Mirror**: `docs/multi-session-work-loop/instruction-contract.md` + `instruction-contract/lint.js`(문서-기계 대조 선례)
- **산출물 (R8 test CRITICAL 흡수)**: 이 Task가 `docs/multi-session-work-loop/m5-assertion-manifest.json`을 **CREATE한다**. 이전 판은 Task 0의 Validate가 이 파일을 읽으면서 어느 Task도 만들지 않았고 Files to Change에도 없었다 — 검증 명령이 존재하지 않는 파일을 열게 되어 **Task 0 자체가 실행 불가**였다. 매니페스트는 Task 1·3·4·5·6·7·8의 Validate 단언을 `{task, id, title}`로 전사하며, `title`은 대응 test의 `test('...')` 제목과 **문자열 동일**해야 한다(그 동일성이 대조의 유일한 근거다).
- **Validate**: 외부 도구 의존 0 (R10 test CRITICAL 흡수) — 매니페스트 **자체 정합성**만 검사한다. Task 7의 lint를 호출하지 않으므로 Task 0이 단독 실행 가능하다.

  ```bash
  node -e '
    const fs=require("fs");
    const p="docs/multi-session-work-loop/m5-assertion-manifest.json";
    if(!fs.existsSync(p)){ console.error("[M5:task0] manifest missing at "+p); process.exit(1); }
    let j=null; try{ j=JSON.parse(fs.readFileSync(p,"utf8")); }catch(e){ console.error("[M5:task0] manifest unparsable: "+e.message); process.exit(1); }
    const a=Array.isArray(j)?j:j.assertions;
    if(!Array.isArray(a)||a.length===0){ console.error("[M5:task0] manifest has 0 assertions — silent empty pass is forbidden"); process.exit(1); }
    const bad=a.filter(x=>!x||typeof x.task!=="string"||typeof x.id!=="string"||typeof x.title!=="string"||!x.title.trim());
    if(bad.length){ console.error("[M5:task0] "+bad.length+" entr(ies) missing {task,id,title}"); process.exit(1); }
    const ids=a.map(x=>x.id), dup=ids.filter((v,i)=>ids.indexOf(v)!==i);
    if(dup.length){ console.error("[M5:task0] duplicate assertion id(s): "+[...new Set(dup)].join(", ")); process.exit(1); }
    const tasks=[...new Set(a.map(x=>x.task))].sort();
    console.log("[M5:task0] manifest OK — "+a.length+" assertions across tasks "+tasks.join(","));
  '
  ```

  단언 4종: (a) 파일 부재 → 비영점 exit(조용한 0건 통과 금지) (b) 항목 수 > 0 (c) 각 항목이 `{task,id,title}` 전부 보유하고 `title`이 비어 있지 않음 (d) `id` 중복 0. **test 파일과의 대조는 여기서 하지 않는다** — 그 시점엔 test가 없는 것이 정상이고, 강제는 Validation §11이 소유한다.

### Task 1: 레코드 스키마 + 순서 오라클 (순수)
- **Action**: `lib/state-journal/record.js`에 bounded allowlist 레코드 스키마 정의 — `record_id`(UUID) · `ts` · `session_id` · `session_epoch` · `epoch_source` · `work_unit` · `seq` · `kind` · `patch` · `prev_session_id` · `superseded_by` · `checkpoint_of`. **세 정체성 필드(`session_id`·`session_epoch`·`prev_session_id`)의 취득 경로는 DD12가 소유한다** — 스키마는 값을 요구할 뿐 어디서 오는지 정하지 않으므로, 그 명세 없이는 구현자가 즉석 발명하게 되고 A4 의미론이 갈라진다(R11 architect CRITICAL 흡수). `resolveIdentity({env, journalTail, ledgerRead})`를 **순수 함수**로 두어 세 값의 산출을 test 가능하게 만든다(I/O는 호출자가 주입 — DD4와 같은 형태). `lib/state-journal/order.js`에 `assignOrder({records, session, workUnit})`(다음 `seq` 산출)와 **`decideAdmission({record, highWater, tombstones, epochOf})`** 를 순수 함수로 구현. 판정 enum 4종: `admit` · `admit-superseded`(지연·역행) · `admit-post-tombstone`(닫힌 단위 이후 도착) · `reject-malformed`.
- **판정 우선순위 (고정 — 이 순서가 계약이다)**: ① 스키마/allowlist 위반 → `reject-malformed` · ② `work_unit`에 tombstone 존재 ∧ `record.seq > tombstone.seq` → `admit-post-tombstone` · ③ `record.seq ≤ highWater[work_unit]` → `admit-superseded` · ④ 같은 `seq`에 이미 다른 레코드가 있으면 `session_epoch`가 큰 쪽이 `admit`, 작은 쪽이 `admit-superseded` · ⑤ 그 외 `admit`. **epoch 비교는 ②③ 이후**다 — tombstone은 epoch보다 강하다(닫힌 작업은 더 새 세션이라도 되살리지 못한다). 동률 epoch는 `session_id` 사전순으로 결정론적으로 깬다(DD2).
- **Mirror**: `msw-events.js` allowlist + cap 계약 · `pr-ship-gate.js#deriveShipDecision`(순수 판정 오라클)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/state-journal-order.test.js` — 위 5분기가 각각 지정 enum을 반환하고, **②가 ④보다 먼저 발화함**(더 새 epoch의 post-tombstone 레코드가 `admit`이 아니라 `admit-post-tombstone`)을 별도 케이스로 단언. **+ `resolveIdentity` 단언 4종 (R11 architect CRITICAL 흡수)**: (f) 세 env 변수 precedence(`MCCP_SESSION_ID` > `CLAUDE_CODE_SESSION_ID` > `CLAUDE_SESSION_ID` > `'unknown'`)가 `resolveSessionKey`와 **동일 결과** (g) ledger 부재 시 `session_epoch === record.ts` ∧ `epoch_source === 'ts-fallback'` (h) `prev_session_id`가 **저널 tail**에서 파생 — tail의 `session_id`가 현재와 다르면 그 값, 같으면 `null`, 빈 저널이면 `null` (i) ledger에 시간상 더 가까운 **타 worktree 세션**이 있어도 (h)의 결과가 바뀌지 않음(DD12의 "ledger가 아니라 저널" 근거를 반증 가능하게 고정)

### Task 2: 저널 store (I/O) + genesis 부트스트랩
- **Action**: `state/journal-store.js` — `appendRecord` (O_APPEND 단일 버퍼, `msw-events.js` 경로 해석 우선순위 이식) · `readRecords` (malformed per-line skip + 진단 카운트) · `writeCheckpoint` (원자 tmp+rename) · **`writeDegradedMarker(repoRoot)`** (`.claude/state/journal/.degraded` 원자 write — **throw하지 않고** `{ok:false, reason}` 반환. throw 판정은 Task 3의 `update()` 소관이다, DD6.1 책임 표). 저널 부재이고 STATE.md가 존재하면 현재 상태를 **genesis checkpoint** 레코드로 1회 부트스트랩(멱등 — 이미 있으면 no-op). **부트스트랩은 동시에 git-tracked `.claude/state/completion-ledger/`를 스캔해 종료된 작업 단위를 tombstone으로 seed한다(DD11)** — 이것이 없으면 클론·`git clean` 이후 G2가 무력해진다. 각 레코드는 `content_hash`를 갖는다(DD6.3).
- **Mirror**: `msw-events.js:192-273`(경로 해석 우선순위 · O_APPEND) · `state-writer.js:512-523`(원자 tmp+rename) · `completion-ledger/index.js`(엔트리 열거)
- **Validate**: `node --test plugins/mccp/scripts/state/tests/journal-store.test.js` — 단언 5종: (a) 부트스트랩 멱등(2회 호출 = 1개 genesis) (b) malformed 라인이 나머지를 오염시키지 않음 (c) worktree 3개 시뮬레이션에서 경로 교차 0 (d) **ledger 엔트리 N개 → tombstone N개 seed**, 그 후 해당 work_unit의 신규 레코드가 `admit-post-tombstone` (e) **ledger 부재/읽기 실패 시 loud warn + tombstone 0으로 진행**(부트스트랩이 막히지 않음)

### Task 3: 투영 + `state-writer` 재배선 (G1·G3)
- **Action**: `lib/state-journal/project.js`에 `project(records) → {frontmatter, body}` 순수 reduce 구현. `state-writer.update()`를 "레코드 append → 재투영 → 기존 `renderState` + `contentHash` 비교 → `writeStateAtomic`"로 재배선. **공개 export 목록·시그니처·렌더 바이트 무변경.** 아울러 **degraded 진입 분기**를 이 함수가 소유한다 — 락 획득 직후 `.degraded` 검사(DD6.1 마커 검사 위치 계약) · append 실패 시 `journalStore.writeDegradedMarker()` 호출 · 그 반환이 `{ok:false}`면 loud stderr 후 **throw**(DD6.1 책임 표의 유일 throw 지점).
- **투영 알고리즘 (명세 — L2 architect MEDIUM 흡수)**: 시그니처는 **`project(records, base)`** 다 — `base`는 **호출자가 주입**한다(L2 architect R5 HIGH 흡수: `project(records)`로 적으면서 "base는 최신 checkpoint"라 서술하면 checkpoint를 디스크에서 읽는다는 뜻이 되어 DD4의 "I/O를 갖지 않는다"와 정면 충돌한다. checkpoint를 **읽는** 것은 `journal-store.js`의 일이고, `project`는 받은 것을 접기만 한다). `state-writer.update()`가 store에서 최신 checkpoint를 읽어 `base`로 넘기며, checkpoint가 없으면 `emptyState()`를 넘긴다. 본체는 정확히 `records.filter(admit).sort(by seq).reduce(mergeState, base)` 이고, `mergeState`는 **기존 `state-writer.mergeState`를 그대로 호출**한다. 즉 오늘의 `readState → mergeState → renderState` 합성과 **의미가 같고 입력만 디스크에서 저널로 바뀐다** — 이것이 G3이 순환 논증이 아닌 이유다: 검증 기준은 `renderState` 출력 자체가 아니라 **"동일 patch 시퀀스에 대해 M5 전후 산출 바이트가 같은가"** 이고, 그 기준은 `mergeState`를 재구현하지 않았을 때만 성립한다. 재구현 금지는 lint(Task 7)가 아니라 코드 형태로 강제한다 — `project.js`는 `mergeState`를 import할 뿐 자체 병합 분기를 갖지 않는다.
- **Mirror**: `state-writer.js:596-628`(contentHash self-bump 억제 유지) · `state-writer.js:375-505`(`mergeState` 그대로 재사용)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/state-journal-projection.test.js` + `node --test plugins/mccp/scripts/state/tests/state-writer.test.js`(기존 전부 green). 단언 3종:
  1. **전후 바이트 동등** — 동일 patch 시퀀스를 (a) M5 이전 경로(`readState→mergeState→renderState`)와 (b) 저널 투영으로 각각 렌더한 결과가 **byte-identical**
  2. **파서별 전후 동등** — 그 산출을 `state-writer.readState`로 읽은 결과가 (a)=(b), `state-injector.readState`로 읽은 결과가 (a)=(b). **두 파서 상호 비교는 하지 않는다**(G3 주의 — 선재 divergence)
  2b. **양쪽 파서의 기대값 단언** (L2 test R5 HIGH + R8 test HIGH 흡수) — 2만으로는 부족하다: 두 파서가 M5 산출에서 **똑같이 실패**해도 (a)=(b)가 성립해 통과한다. 즉 2는 *일관성*을 증명할 뿐 *정확성*을 증명하지 않는다. 그래서 **양쪽 모두**에 대해 별도로 단언한다 — (i) `state-injector.readState(M5 산출)`이 **성공**하고 `REQUIRED_FRONTMATTER_KEYS` 4개(`state_version`·`task_fingerprint`·`created_at`·`updated_at`) + `escalate_pending` + `confirm_required`가 **미리 고정한 기대값과 일치**한다 (ii) `state-writer.readState(M5 산출)`도 같은 필드에 대해 **같은 기대값**을 돌려준다. 기대값은 fixture에 리터럴로 박아 두므로 두 파서가 함께 틀리면 **둘 다 실패**한다 — 이것이 "일관되게 틀린" 경우를 잡는 유일한 장치다. (R8 지적대로 2·2b만으로는 `next_chunk` 같은 *선재 divergence* 필드의 정확성까지 답하지 못하며, 그 축은 3의 pin이 "격차가 변하지 않았다"만 보증한다 — 정확성 판정은 **잔여**로 남는다)
  3. **divergence pin** — `next_chunk` 블록 스칼라에서 두 파서가 각각 `"line one\n…"` / `"|"` 를 반환함을 fixture로 고정. M5가 이 격차를 넓히거나 좁히면 실패하므로 변화가 조용히 지나가지 않는다
  4. **conditional 필드 전수 커버리지** (L2 test MEDIUM 흡수) — `renderFrontmatter`(`state-writer.js:283-341`)의 **조건부 렌더 필드 전부**를 set한 상태로 1·2를 돌린다: `next_chunk` · `chain_progress` · `last_pr_url` · `dep_check_at` · `dep_check_missing` · `abort_owner` · `cost_abort_at` · `escalate_pending`(+`_decision_id`) · `dispatch_id` · `dispatch_id_completed` · `dispatch_attempt_count` · `controller_session_id` · `active_dispatch_count`. 공통 필드만 시험하면 조건부 필드가 투영에서 누락돼도 통과한다
  5. **block-scalar round-trip** (L2 test MEDIUM 흡수) — 다중 라인 `next_chunk`를 가진 **기존** STATE.md를 genesis로 부트스트랩 → 투영 → 렌더한 결과가 원본과 byte-identical. 부트스트랩이 블록 스칼라를 구조로 옳게 되읽는지(문자열 `"|"`로 접히지 않는지)를 이 단언이 잡는다
  6. **degraded stickiness — 3회 호출 단언** (R7 test MEDIUM 흡수) — 1회 직접 write가 sticky 모드를 흉내 낼 수 있으므로 *다중* 호출로 고정한다: append 실패 주입 → 마커 생성 확인 → **2번째** `update()`가 투영 없이 직접 경로 → **3번째** `update()`도 여전히 직접 경로(저널로 돌아가지 않음) → `journal checkpoint --reseed` 후 **4번째**가 투영 경로로 복귀. 5단계 전부를 단언하지 않으면 "복귀했는가"와 "애초에 나가지 않았는가"를 구별할 수 없다
  6b. **stickiness는 프로세스 경계를 넘는다 — 별도 프로세스로 단언** (R10 test MEDIUM 흡수) — 6의 5단계는 **한 node 프로세스 안**에서 돈다. degraded 모드의 sticky 근거는 in-memory 플래그가 아니라 **디스크의 `.degraded` 마커**인데(DD6.1), 단일 프로세스 test는 그 둘을 구별하지 못한다 — 구현이 모듈 스코프 변수로 sticky를 흉내 내도 6은 전부 통과한다. 그리고 실제 운용에서 degraded 구간을 가로지르는 것은 **세션(=프로세스)** 이므로, 프로세스 경계를 넘지 못하는 stickiness는 G1이 약속한 보호를 실제로는 제공하지 않는다. 따라서: 마커 생성 후 **`child_process.execFileSync`로 새 node 프로세스를 띄워** 그 안에서 `update()`를 호출하고, (i) 그 프로세스가 **직접 경로**를 탔음 (ii) 저널에 새 레코드가 **append되지 않았음** 을 부모가 단언한다. `--reseed` 후 또 한 번 새 프로세스를 띄워 **투영 경로 복귀**까지 확인한다. 모듈 스코프 캐시로 구현하면 자식 프로세스가 깨끗한 상태로 시작하므로 이 단언이 **실패한다** — 그것이 이 단언의 존재 이유다
  7. **`project()` 순수성 기계 검증** (R7 test MEDIUM 흡수 — 출력 동등성만으로는 부작용을 못 잡는다) — 두 겹: (a) **정적** — Task 7 축 5가 `project.js`의 `fs`/`child_process`/`net`/`os` import 0을 검사 (b) **동적** — test가 `fs`의 write 계열 메서드를 throw하는 스텁으로 교체한 상태에서 `project()`를 돌려 **정상 반환**함을 단언. (a)는 직접 import를, (b)는 간접 경로(전이 의존이 몰래 write하는 경우)를 각각 덮는다 — 어느 한쪽도 단독으로는 충분하지 않다

### Task 4: 재생 방어 (G2 · UI5·UI7 응답)
- **Action**: tombstone 레코드 kind 추가(작업 단위 종료 시 high-water mark 고정) + `session_epoch` 우선순위 적용. TTL 만료 이후에도 방어가 성립함을 보장 — epoch 비교는 시간 상한이 없다(M3 §8의 "무기한 replay 방어"). 크래시·재개 시나리오를 재현하는 회귀 test 작성: 세션 A가 작업 잡음 → 크래시 → 세션 B 승계·완료·tombstone → **A가 되살아나 지연 레코드 append** → 투영이 불변임을 단언.
- **Mirror**: `evidence-claim.js:241-250`(`resurrected-holder` 5분기 판정) — 같은 의미론을 순서 축으로 확장
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/state-journal-replay.test.js` — 시나리오는 "세션 A 착수 → 크래시 → 세션 B 승계·완료·tombstone → **A가 되살아나 지연 레코드 append**". 단언 5종: (a) 부활 레코드가 저널에 **잔존** (b) `superseded_by`가 B의 tombstone을 지목 (c) 투영 결과가 부활 **전과 deep-equal** (d) STATE.md **mtime 무변경**(`contentHash` skip이 실제로 발화 — 투영 제외가 "값은 같은데 파일은 다시 썼다"로 새지 않음) (e) **TTL(15분) 경과 후에도 (a)~(d)가 동일** — M3 claim TTL이 만료돼도 epoch 순서 방어는 시간 상한이 없음(M3 §8 "무기한 replay 방어")

### Task 5: 이력 보존 정책 (G4 · UI6 응답)
- **Action**: `lib/state-journal/retention.js` — checkpoint 압축(checkpoint 이전 세그먼트를 요약 레코드 1개로 접되 **checkpoint 자체는 무손실**) + 세그먼트 회전 + 상한 상수 3종(세션당 바이트 · 전역 바이트 · 보존 일수). `evictLRU` 방식의 무조건 unlink는 **쓰지 않는다**(DD1). 압축은 `journal checkpoint` 명시 호출과 상한 초과 시 자동 발화 양쪽.
- **Mirror**: `msw-events.js` cap 상수 배치 · M3 TTL 상수화(토글 아님)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/state-journal-retention.test.js` — **압축 전후 `project()` 결과가 deep-equal** · 상한 초과 시 발화 · checkpoint 손실 0

### Task 6: 질의 표면 (G4)
- **Action**: `state/cli.js`에 4개 서브커맨드 추가.
  - `journal query` — `--work-unit` · `--session` · `--since` · `--kind` · `--include-superseded` · `--json`
  - `journal verify` — **3중 검사**: ① 레코드별 `content_hash` 전수 재계산(DD6.3 — 우발 손상·단건 변조 검출, 손상분은 격리 카운트) ② 투영 ↔ 디스크 STATE.md 일치 ③ `.degraded` 마커 부재. 하나라도 실패하면 **비영점 exit**
  - `journal verify --reproject` — ②의 불일치를 명시 복구(DD6.2 — 읽기 경로에 암묵 replay를 넣지 않는 대신 제공하는 수동 수렴 경로)
  - `journal checkpoint` / `journal checkpoint --reseed` — 후자는 degraded 복구 전용(현재 STATE.md를 새 genesis로 봉인 + 마커 제거)
- **Mirror**: `lib/plan-review/cli.js`(얇은 CLI, 판정은 오라클) · `derive/cli.js --json`
- **Validate**: `node plugins/mccp/scripts/state/cli.js journal verify --json` exit 0 + `journal query --work-unit multi-session-work-loop-m5 --json`이 이번 사이클 레코드 반환 + **부정 fixture**: 레코드 1건의 바이트를 손상시키면 `verify`가 비영점 exit + 그 레코드가 투영에서 격리됨

### Task 7: 단일 writer 불변식 lint (G1)
- **Action**: `lib/state-journal/single-writer-lint.js` — **5축** 정적 검사. **축 1(단일 writer)**: `writeStateAtomic` 호출 / `STATE.md` 경로 직접 write가 투영 경로 **밖**에 존재하면 실패(승인 목록은 `state-writer.js`의 투영 함수 1개만). **축 2(G3 호출부 불변)**: GROUND가 열거한 STATE.md 소비 호출부 14개(`stateWriter.update`/`readState` · `state-injector.readState`/`inject`)의 목록을 커밋 아티팩트로 고정하고, `git diff origin/main...HEAD` 에서 그 **줄**이 변경되면 실패. `session-start.js`·`session-end.js`는 파일 전체가 아니라 **해당 호출부 줄만** 대상이므로 Task 8의 CL-5 편집과 충돌하지 않는다(G3 주의). **축 3(CL-5 경로 인자)**: `handoff-items`의 `enumerateUnfinishedItems`/`writeHandoffItems`/`restoreAndMatch` 호출부를 검사한다. **존재 검사만으로는 부족하다**(L2 security HIGH 흡수 — 인자를 넘기되 값이 틀리면 통과한다): 두 조건을 함께 본다 — (a) 세 함수 모두 경로 인자를 **전달**하고 (b) 그 인자가 `process.cwd()` 리터럴이 **아니다**(repoRoot 파생 식별자여야 한다). `enumerateUnfinishedItems(process.cwd())` 형태는 (a)를 만족하지만 (b)에서 걸린다 — 실제 CL-5가 정확히 그 형태이므로 (b)가 없으면 lint가 결함을 통과시킨다. 값의 *의미적* 정확성(그 식별자가 진짜 repoRoot인가)까지는 정적으로 판정하지 못하며, 그 축은 `cwd ≠ repoRoot` fixture(Task 8)가 담당한다 — **두 겹이 서로의 사각을 덮는 관계**이지 어느 한쪽이 완전한 것이 아니다. 환경 독립이라 `cwd === repoRoot`에서도 발화한다. **그리고 (b)는 리터럴만으로는 부족하다 (R7 test HIGH + invariant MEDIUM 흡수)**: `const f = process.cwd(); enumerateUnfinishedItems(f)` 는 리터럴 검사를 그대로 통과한다. 따라서 (b)를 **같은 함수 스코프 안의 1-hop 지역 별칭**까지 확장한다 — 인자로 넘긴 식별자가 그 스코프에서 `process.cwd()`로 바인딩됐으면 실패. **임의 깊이 별칭·재할당·고차 함수 경유는 여전히 못 잡으며, 그것은 정적 검사의 한계이지 구현으로 닫을 축이 아니다**(→ **명시 잔여 9**). **그리고 (c) 인자는 `resolveHandoffRoot`를 거친 값이어야 한다 (R10 test MEDIUM 흡수)**: (a)+(b)만으로는 세 호출부가 `resolveHandoffRoot`를 **호출하지 않고** 다른 경로로 얻은 값을 넘겨도 통과한다 — Task 8이 새 export를 만들면서 정작 호출부가 그것을 쓰지 않는 경우(no-op 래퍼)를 아무 검사도 잡지 못한다. 따라서 세 호출부 각각에 대해 **같은 함수 스코프 안에 `resolveHandoffRoot(` 호출이 존재하고 그 반환이 인자로 전달되는 식별자에 바인딩되는지**를 함께 본다. 이는 (b)의 1-hop 별칭 추적과 같은 기법의 *양성* 방향이며(부정: `process.cwd()` 바인딩 거부 / 긍정: `resolveHandoffRoot()` 바인딩 요구) 같은 한계(임의 깊이·재할당)를 공유한다 — **명시 잔여 9**에 이 방향도 포함된다. **축 4(handoff-items 독립성)**: `handoff-items.js`가 `state-journal/*` 또는 `journal-store`를 **import하면 실패**한다 (L2 security R6 HIGH 흡수 — 아래). **축 5(투영 순수성)**: `lib/state-journal/project.js`가 `fs`·`child_process`·`net`·`os`를 **import하면 실패**한다 (R7 test MEDIUM 흡수 — DD4의 "I/O를 갖지 않는다"가 선언이 아니라 검사가 된다. 전이 의존 경유는 Task 3 Validate 7(b)의 동적 스텁이 덮는다).

> **G3의 실제 위험은 호출부 줄이 아니라 호출 그래프다 (L2 security R6 HIGH 흡수 — 내 R2 수정의 사각).** R2에서 G3을 "호출부 줄 단위"로 좁혔는데, 리뷰어 지적대로 **`handoff-items.js`가 저널과 엮이면** 그 줄이 그대로여도 hook ↔ state-writer 상호작용이 저널 의존이 된다. **타협점**은 범위를 다시 넓히는 것이 아니라 **의존을 금지로 못박는 것**이다: M5에서 `handoff-items.js`는 **저널과 통합하지 않는다** — 독립 sidecar로 남고 이번 milestone이 고치는 것은 오직 **경로 해석**뿐이다(A4 분자는 `handoff-items`가 아니라 **저널 쪽**에서 파생한다 — Task 8). 축 4가 그 분리를 기계 검증하므로 "통합하지 않기로 했다"가 선언이 아니라 검사가 된다.
- **lint는 test가 아니라 독립 CLI다 (L2 invariant HIGH 흡수).** `node single-writer-lint.js --json`이 exit code로 판정하고, Validation §10이 **test runner와 무관하게** 직접 호출한다. test 안에서만 도는 lint는 test를 건너뛰면 함께 사라지는데, CL-5가 4회 재발한 이유가 정확히 "기계 검사가 통과 경로에 없었다"이다. `b2-coverage-gate.js`가 CLI + test 양쪽 표면을 갖는 것과 같은 형태다.
  **범위 밖(명시)**: 이 lint를 `/mccp:pr` Phase 1에 강제 게이트로 승격하는 것은 **하지 않는다** — 게이트 강도 변경은 UI3가 이번 주기 범위 밖으로 못박았다. 승격은 [backlog](codex-findings-backlog.md)에 기록하고 별도 축으로 다룬다. 따라서 M5가 보증하는 것은 "검사가 존재하고 Validation이 호출한다"이지 "우회 불가"가 아니다.
- **Mirror**: `lib/msw-metrics/b2-coverage-gate.js`(정적 lint + CLI/test 이중 표면 + 실패 시 지표 정직 강등)
- **Validate**: `node plugins/mccp/scripts/lib/state-journal/single-writer-lint.js --json` exit 0 + `node --test plugins/mccp/scripts/lib/tests/state-journal-single-writer.test.js` — 부정 fixture **7종**에서 **각각 실패**함을 단언: (a) 투영 밖에 `writeStateAtomic` 호출 삽입 → 축 1 (b) `stateWriter.update(` 호출부 줄 수정 → 축 2 (c) `enumerateUnfinishedItems(process.cwd())` 형태를 남겨둠 → 축 3 (b-리터럴) (d) **`const f = process.cwd(); enumerateUnfinishedItems(f)` 형태** → 축 3 (b-1hop 별칭, R7 흡수) (d2) **`const r = ctx.projectRoot; enumerateUnfinishedItems(r)` 형태** — 인자는 넘기고 `process.cwd()`도 아니지만 `resolveHandoffRoot`를 **거치지 않은** 값 → 축 3 (c), 즉 `projectRoot=''` 구멍이 그대로 남은 no-op 수정을 잡는다 (R10 흡수) (e) `handoff-items.js`에 `require('../lib/state-journal/…')` 삽입 → 축 4 (f) `project.js`에 `require('fs')` 삽입 → 축 5. 그리고 **Task 8이 실제로 바꾸는 CL-5 줄에서는 축 2가 통과**함을 양성 케이스로 고정

### Task 8: A4 경계 스코프 분자 + CL-5 4번째 재발 수정 (G5 · UI8·UI9 응답)
- **Action**: `lib/msw-metrics/a4-boundary-restore.js` — 저널의 `prev_session_id` 경계를 써서 "세션 N이 남긴 미해소 항목 중 세션 N+1이 실제로 이어받은 것"만 계상(자기 세션 self-credit **구조적 불가** · genesis 경계는 분모 제외 — DD10). `computeA4`가 저널 소스 존재 시 이를 소비하고 status를 `computed`로, 경계 0이면 `insufficient`, 저널 부재면 기존 `forward-only` 유지.
- **CL-5 수정은 3곳이다 (L2 invariant MEDIUM 흡수 — 초안은 2곳만 적었다).** `handoff-items.js`의 세 함수가 전부 경로를 스스로 정하며, **열거가 먼저** 실행되므로 write만 고치면 *틀린 위치에서 읽은 내용*을 옳은 위치에 쓴다.

**CL-5 수정 대상 3곳 (표는 리스트 밖 — 들여쓰기된 표는 렌더러에 따라 표로 읽히지 않아 실제로 L2 리뷰어가 "2곳"으로 오독했다):**

| # | 위치 | 현재 | 수정 |
|---|---|---|---|
| 1 | `session-end.js:381` | `enumerateUnfinishedItems(process.cwd())` | `enumerateUnfinishedItems(repoRoot)` |
| 2 | `session-end.js:382` | `writeHandoffItems(sid, unfinished)` | `writeHandoffItems(sid, unfinished, { stateDir: path.join(repoRoot,'.claude','state') })` |
| 3 | `session-start.js:748` | `restoreAndMatch(observerSessionId)` | `restoreAndMatch(observerSessionId, { stateDir: path.join(repoRoot,'.claude','state'), cwd: repoRoot })` |

`repoRoot`의 출처는 **양쪽 hook에 이미 있는 값**을 쓴다 — `session-start.js`는 `observerContext.projectRoot`(같은 블록 12줄 위 M3 수정, 8줄 위 M4 수정이 쓰는 바로 그 값), `session-end.js`는 동일 블록의 observer context. 새 해석 로직을 만들지 않는다.

**단, `projectRoot`는 빈 문자열일 수 있다 (L2 security R5 MEDIUM 흡수 — 실측 검증됨).** `observer-sessions.js:99`는 global context에서 `projectRoot: ''`를 반환하고, 그러면 `path.join('', '.claude', 'state')`가 `.claude/state`로 접혀 **고치려던 cwd-상대 경로가 그대로 남는다** — M3·M4 수정이 같은 값을 쓰므로 이 구멍은 그 둘에도 잠재한다. 따라서 세 호출부는 `projectRoot`를 그대로 쓰지 않고 **`resolveHandoffRoot(ctx)`** 를 거친다: `ctx.projectRoot`가 비어 있지 않으면 그 값, 비어 있으면 `msw-events.js#discoverRepoRoot`(이미 존재하는 walk-up, spawn 0)로 탐색, 그마저 실패하면 **loud warn 후 handoff 기록 자체를 skip**한다(틀린 위치에 쓰는 것보다 안 쓰는 편이 낫다 — 잘못된 위치의 파일은 다음 세션이 분모로 잘못 계상한다). 회귀 test에 `projectRoot=''` 케이스를 명시 포함한다.

**단, skip은 조용하면 CL-5 우회와 구별되지 않는다 (L2 invariant R6 HIGH 흡수 — 내 R5 수정이 만든 결함).** 지적이 정확했다: skip 경로가 있으면 `*.handoff-items.json`이 0건일 때 그것이 *배포 누락*인지 *해소 실패로 인한 우회*인지 알 수 없고, "CL-5 3곳 착지"라는 acceptance는 해소 **성공**을 요구하지 않으므로 결함이 남은 채 체크될 수 있다. **타협점** — skip을 없애지 않되(쓸 곳이 없는데 쓰는 것은 더 나쁘다) **셀 수 있게** 만든다:

1. skip 시 `.claude/state/.handoff-root-unresolved` 마커를 남기고 `handoff_root_unresolved` msw-event를 emit한다. **두 채널은 서로의 백업이다** — 아래 참조.
2. Validation-SHIP-2가 그 마커를 읽어 0건의 **원인을 구분**한다 — 마커가 있으면 "CL-5가 닫히지 않았다"고 명시 보고하며, 그 경우 G5를 충족으로 적는 것을 금지한다.

**단, 마커 write 자체가 실패하면 SHIP-2가 거짓 원인을 보고한다 (R7 security HIGH 흡수).** 지적이 정확했다: 초안은 "마커 부재 = producer 미실행"으로 단정하는데, 마커 write가 조용히 실패하면 *실제로는 경로 미해소*인 상황이 *배포 누락*으로 보고된다 — 감사 기록이 거짓이 되고, 이 milestone이 없애려는 침묵 실패가 진단 층에서 재생산된다.

**여기서는 throw가 답이 아니다.** DD6.1의 throw는 `update()` 경로의 좁은 예외이고, `session-end` hook에서 throw하면 세션 종료 자체가 깨진다(fail-open 계약 위반). 대신 **채널을 늘려 단정을 불가능하게** 만든다 — SHIP-2는 2-state가 아니라 **3-state**로 판정한다:

| 마커 / msw-event | `session_end` 레코드 | 판정 |
|---|---|---|
| 둘 중 하나라도 존재 | — | **CL-5 미해소** — G5 충족 기록 금지 |
| 둘 다 부재 | **부재** | **producer 미실행** — 배포 + 새 세션 후 재실행 |
| 둘 다 부재 | **존재** | **판정 불가(inconclusive)** — hook은 돌았는데 아티팩트도 자국도 없다. 마커·이벤트 양쪽 write가 실패했거나 미지의 경로다. **G5 충족 기록 금지** + 원인 조사 |

세 번째 행이 이번 흡수의 핵심이다. `session_end` 레코드는 hook이 **실제로 돌았다**는 독립 증거이므로, 그것이 있는데 아티팩트가 0건이면 "producer 미실행"은 **거짓**이다. 두 마커 채널이 동시에 유실돼도 이 판별자는 살아 있고, 그래서 SHIP-2는 모르는 것을 아는 척하지 않는다.
3. **다만 진짜로 해소 불가한 경우는 결함이 아니다**: `discoverRepoRoot`가 40단계 walk-up으로도 `.claude/`를 못 찾는다는 것은 **repo 밖에서 hook이 돌았다**는 뜻이고, 그곳에는 쓸 대상 자체가 없다. 그 상황에서 skip은 올바른 동작이며 마커가 그 사실을 기록한다. 즉 마커는 "구현 결함"과 "해당 없음"을 사람이 판별할 재료를 남기는 것이지, 그 자체가 실패 판정은 아니다.

- **부분 수정은 test로 못 잡는다 — lint로 잡는다 (L2 test HIGH + security MEDIUM 흡수).** 3곳 중 1번(열거)만 빠뜨려도, **test가 `cwd === repoRoot`인 환경에서 돌면 두 경로가 우연히 같은 곳으로 풀려 통과한다.** 그래서 두 겹을 건다: (a) 회귀 fixture는 **`cwd ≠ repoRoot`를 강제**한다(임시 디렉토리에서 `process.chdir`한 뒤 repoRoot를 별도 인자로 전달 — 같으면 fixture 자체가 실패) (b) Task 7 lint에 **축 3**을 추가해 `handoff-items` 3개 함수의 **모든** 호출부가 명시 `opts`(또는 명시 repoRoot 인자)를 전달하는지 정적 검사한다. lint는 환경에 의존하지 않으므로 **`cwd === repoRoot`인 환경에서 우연히 통과하는 일**은 없다.
  **단, "우연한 통과가 원리적으로 불가능하다"는 과잉 주장이었다 (R7 test HIGH + invariant MEDIUM 흡수).** 지적이 정확하다 — 정적 lint가 없애는 것은 *환경 의존* 우연이지 *모든* 우연이 아니다. `const f = process.cwd(); enumerateUnfinishedItems(f)` 는 리터럴 검사를 통과하고, `enumerateUnfinishedItems(cwd)`처럼 **잘못된 변수를 바인딩한 경우**는 이름만으로 판정할 수 없다. 축 3의 (b)를 1-hop 지역 별칭까지 넓혔지만(Task 7) 임의 깊이는 여전히 남으므로, 보증을 **"세 호출부가 전부 명시 인자를 받고, 리터럴·1-hop `process.cwd()` 형태가 아니다"** 로 정확히 좁힌다. 그 인자가 *실제로* repoRoot인지는 `cwd ≠ repoRoot` fixture가 런타임에 답하고, 두 겹이 남기는 사각은 **명시 잔여 9**로 등재한다.
- **Mirror**: `msw-metrics/index.js:98`(무결성 위반을 producer 부재보다 먼저 판정) · `session-start.js:709-712`·`735-741`(M3·M4의 CL-5 수정 주석 형식 — 4번째 재발임을 주석에 명시)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/a4-boundary-restore.test.js` — 단언 **8종**: (a) 같은 세션의 sidecar만 있을 때 분자 0(self-credit 불가) (a2) **`session_id==='unknown'` 레코드는 경계에서 제외** — `'unknown'` 2건을 서로 다른 세션으로 세면 self-credit이 뒷문으로 돌아온다(DD12 마지막 항) (b) genesis 경계만 있을 때 `insufficient`(DD10) (c) 실 세션 2개 경계에서 분자가 교차 항목만 계상 (d) 분자 ≤ 분모 (d2) **분자·분모가 비음수 정수**(R7 test MEDIUM 흡수 — `{numerator:-5, denominator:10}`은 (d)를 통과한다) (d3) **`status==='computed'`이면 분모 ≥ 1**(분모 0에 `computed`를 붙이면 0/0을 "측정됐다"로 보고하게 된다 — 그 경우는 `insufficient`가 옳다) (e) **fixture가 `cwd ≠ repoRoot`임을 자체 단언** — 같으면 test가 부분 수정을 못 잡으므로 fixture 스스로 실패해야 한다. **+ 축 3 lint**(Task 7)가 환경 무관하게 3곳 전수를 확인. **+ ship 시점 실측**(§G5의 조건성): `claude plugin update` + 새 세션 1회 후 `*.handoff-items.json` ≥1건 · `derive/cli.js run --json`의 A4 status `computed`

### Task 9: 설계 문서 + PRD 갱신 (UI6·UI7 확정 기록)
- **Action**: `docs/multi-session-work-loop/state-truth-source-design.md` 신규 — 보증 표(G1~G5) · 위협 모델과 범위 밖 · 보존 정책 수치 근거 · 재생 방어 판정 5분기 · M3/M5 경계 확정. `evidence-conflict-design.md` §8에 착지 결과 반영. `measurement-instrumentation.md`의 A4 행 갱신. PRD M5 status + Open Questions 2건(`이력 보존 정책` · `점유 만료와 재생 방어`)을 `[x]`로 전환하고 결론 요약 + 문서 링크.
- **Mirror**: `evidence-conflict-design.md`(§1 보증/비보증 → §5 taxonomy → §8 경계) 구조
- **Validate**: `node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md` exit 0(CLAUDE.md 절 변경 없음을 확인)

### Task 10: 릴리스 동기 (§3.7 5면)
- **Action**: `plugin.json` `1.23.7 → 1.23.8` · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · `renderer/tests/i18n-surface.test.js` 단언 2개 · `CHANGELOG.md` 신규 항목 · `docs/ENVIRONMENT.md` §11에 `MCCP_STATE_JOURNAL` 등재.
- **Mirror**: CLAUDE.md §3.7 의무 체크리스트 + 병렬 브랜치 forward-only 상향 규칙
- **Validate**: `git grep -n "1\.23\.8" -- plugins/mccp docs CHANGELOG.md` 가 5면 전부에서 hit

## Validation

```bash
# 1) 신규 모듈 회귀
node --test plugins/mccp/scripts/lib/tests/state-journal-order.test.js
node --test plugins/mccp/scripts/lib/tests/state-journal-projection.test.js
node --test plugins/mccp/scripts/lib/tests/state-journal-replay.test.js
node --test plugins/mccp/scripts/lib/tests/state-journal-retention.test.js
node --test plugins/mccp/scripts/lib/tests/state-journal-single-writer.test.js
node --test plugins/mccp/scripts/lib/tests/a4-boundary-restore.test.js
node --test plugins/mccp/scripts/state/tests/journal-store.test.js

# 2) 기존 표면 무회귀 (G3) — 두 파서 경로 + 소비처
node --test plugins/mccp/scripts/state/tests/state-writer.test.js
node --test plugins/mccp/scripts/state/tests/state-injector.test.js
node --test plugins/mccp/scripts/state/tests/breakpoint-detector.test.js
node --test plugins/mccp/scripts/state/tests/session-spawner.test.js

# 3) 전체 스위트 (사전 존재 red 목록과 대조 — 신규 red 0)
node --test plugins/mccp/scripts/**/tests/*.test.js

# 4) 투영 ↔ 디스크 일치 + 질의 표면 (G4)
node plugins/mccp/scripts/state/cli.js journal verify --json
node plugins/mccp/scripts/state/cli.js journal query --work-unit multi-session-work-loop-m5 --json

# 5) A4 computed 전환 실측 (G5 — UI9: 코드 존재는 근거가 아니다)
node plugins/mccp/scripts/derive/cli.js run --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s).metrics||{};console.log(JSON.stringify(m['A4']||m['a4_restore_rate']))})"
find . -name "*.handoff-items.json" | wc -l   # 착수 시 0 → 세션 1회 후 ≥1

# 6) 계측 무-LLM 계약 (M2 계약 유지)
git grep -nE "codex-invoke|briefing/invoke|Skill\(|Agent\(" -- plugins/mccp/scripts/lib/state-journal plugins/mccp/scripts/state/journal-store.js
# → 0 hit 이어야 함

# 7) 릴리스 5면 동기
git grep -n "1\.23\.8" -- plugins/mccp docs CHANGELOG.md

# 8) 배포 실행 여부 기계 검사 (G5 fail-open 봉쇄 — §G5의 조건성)
#    plugin.json 버전이 설치 캐시에 존재하지 않으면 `claude plugin update`가
#    실행되지 않은 것이고, 따라서 G5의 "실측"은 성립할 수 없다 → 비영점 exit.
node -e '
  const v=require("./plugins/mccp/.claude-plugin/plugin.json").version;
  const d=require("path").join(require("os").homedir(),".claude","plugins","cache","mccp","mccp",v);
  if(!require("fs").existsSync(d)){
    console.error("[G5] plugin cache missing "+v+" at "+d+" — `claude plugin update` was not run; the G5 실측 cannot have happened.");
    process.exit(1);
  }
  console.log("[G5] plugin cache has "+v+" — deployment prerequisite satisfied.");
'

# 9) 저널 무결성 (DD6.3) — content_hash 전수 + degraded 마커 부재
node plugins/mccp/scripts/state/cli.js journal verify --json

# 10) 단일 writer + G3 호출부 + CL-5 opts — lint를 CLI로 직접 실행 (L2 invariant HIGH 흡수)
#     test runner 안에서만 도는 lint는 test를 건너뛰면 함께 사라진다. CL-5가
#     4회 재발한 이유가 정확히 "기계 검사가 통과 경로에 없었다"이므로, lint는
#     독립 CLI로 존재하고 Validation이 직접 호출한다.
node plugins/mccp/scripts/lib/state-journal/single-writer-lint.js --json   # exit 0 필수

# 11) 단언 매니페스트 대조 — plan의 단언과 코드의 단언이 갈라지지 않았는가 (R9 test HIGH 흡수)
#     §10만으로는 부족하다: 그것은 lint의 *다른* 축(단일 writer·호출부·CL-5)을 보고,
#     매니페스트 대조는 `--assertions` 모드에 있다. exit 0만 확인하면 매니페스트에
#     적힌 단언이 test 파일에 하나도 없어도 통과한다 — 빈 test 파일은 `node --test`가
#     0개 test로 성공하므로 §3도 잡지 못한다. 그래서 **absent 0**을 명시 요구한다.
node plugins/mccp/scripts/lib/state-journal/single-writer-lint.js --assertions --json \
  | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      let j=null; try{ j=JSON.parse(s); }catch(_){}
      if(!j||!Array.isArray(j.assertions)){ console.error("[M5] assertion manifest unreadable"); process.exit(1); }
      const absent=j.assertions.filter(a=>!a.present);
      if(absent.length){
        console.error("[M5] "+absent.length+" manifest assertion(s) have no matching test() title:");
        absent.forEach(a=>console.error("  - ["+a.task+"] "+a.title));
        process.exit(1);
      }
      console.log("[M5] all "+j.assertions.length+" manifest assertions present in test files");
    });
  '

```

### Validation-SHIP — `/mccp:pr` 직전에만 실행 (implement 루프의 일부가 아님)

> **왜 분리하는가 (L2 invariant R6 CRITICAL 흡수 — 내 R5 수정이 만든 결함).** R5에서 G5 실측을 Validation §11로 넣었는데, Validation은 `/mccp:prp-implement` 검증 루프에서 도는 반면 §11은 **배포 + 새 세션 이후에만 통과 가능**하다. 그래서 implement 단계에서 §11은 **항상 실패**하고, 항상 실패하는 검사는 구현자가 "이건 원래 실패하는 거"로 학습해 무시하게 된다 — soft gate로 전락한다. 리뷰어 지적이 정확했다.
>
> **타협점**: 실측을 없애지도, implement 루프에 두지도 않는다. **별도 ship 단계**로 분리하고 실행 시점을 명시한다. §1~§10은 implement 루프(매 회 통과해야 함), 아래는 **PR 생성 직전 1회**(그 시점엔 배포가 끝나 있으므로 통과 가능하다). 항상 실패하는 검사가 루프 안에 없으므로 무시 학습이 생기지 않는다.

```bash
# SHIP-1) 배포 실행 여부 (구 §8)
node -e '
  const v=require("./plugins/mccp/.claude-plugin/plugin.json").version;
  const d=require("path").join(require("os").homedir(),".claude","plugins","cache","mccp","mccp",v);
  if(!require("fs").existsSync(d)){ console.error("[G5] plugin cache missing "+v+" — run `claude plugin update`."); process.exit(1); }
  console.log("[G5] plugin cache has "+v);
'

# SHIP-2) G5 실측 — producer가 실제로 산출하는가
#     0건의 원인을 3-state로 판정한다 (R7 security HIGH 흡수). 2-state였던 이전 판은
#     "마커 부재 = producer 미실행"으로 단정했는데, 마커 write가 조용히 실패하면
#     *경로 미해소*가 *배포 누락*으로 거짓 보고된다. `session_end` 레코드는 hook이
#     실제로 돌았다는 독립 증거이므로, 그것이 있는데 아티팩트가 0건이면
#     "producer 미실행"은 거짓이고 판정 불가로 떨어뜨려야 한다.
node -e '
  const {execSync}=require("child_process"); const fs=require("fs"); const path=require("path");
  const n=execSync("git ls-files --others --exclude-standard -- \".claude/state\"",{encoding:"utf8"})
    .split("\n").filter(s=>s.endsWith(".handoff-items.json")).length;
  if(n>=1){ console.log("[G5] handoff-items artifacts: "+n); process.exit(0); }

  const marker=fs.existsSync(".claude/state/.handoff-root-unresolved");
  // 두 번째 채널: msw-event. 마커 write가 실패해도 이쪽이 남을 수 있다.
  // 세 번째 채널: session_end — hook이 돌았는지 자체를 답하는 독립 증거.
  let evUnresolved=false, evSessionEnd=false;
  try {
    const dir=path.join(".claude","state","msw-events");
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      for (const line of fs.readFileSync(path.join(dir,f),"utf8").split("\n")) {
        if (!line.trim()) continue;
        let k=null; try { k=JSON.parse(line).kind; } catch(_) { continue; }   // malformed per-line skip
        if (k==="handoff_root_unresolved") evUnresolved=true;
        if (k==="session_end") evSessionEnd=true;
      }
    }
  } catch(_) { /* 디렉토리 부재 = 채널 없음. 아래 판정이 그 사실을 반영한다 */ }

  if (marker || evUnresolved) {
    console.error("[G5] 0 artifacts AND unresolved signal present (marker="+marker+" event="+evUnresolved
      +") — resolveHandoffRoot failed at runtime; CL-5 is NOT closed. Do not report G5 as met.");
    process.exit(1);
  }
  if (evSessionEnd) {
    console.error("[G5] INCONCLUSIVE: 0 artifacts, no unresolved signal, but a session_end event exists —"
      +" the hook DID run, so \"producer has not run\" would be a false cause. Both marker and event writes"
      +" may have failed, or an unmapped path was taken. Do not report G5 as met; investigate.");
    process.exit(1);
  }
  console.error("[G5] 0 artifacts, no unresolved signal, no session_end event — producer has not run."
    +" Deploy + boot one new session, then re-run.");
  process.exit(1);
'
node plugins/mccp/scripts/derive/cli.js run --json | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    let a=null; try{ const m=JSON.parse(s).metrics||{}; a=m.A4||m.a4_restore_rate||null; }catch(_){}
    if(!a){ console.error("[G5] A4 metric absent from derive output"); process.exit(1); }
    if(a.status!=="computed"){ console.error("[G5] A4 status="+a.status+" (expected computed)"); process.exit(1); }
    // status만 보면 0/0 이나 음수 분자도 "측정됐다"로 통과한다 (R7 test CRITICAL(a) 흡수).
    const num=a.numerator, den=a.denominator;
    const int=(v)=>Number.isInteger(v)&&v>=0;
    if(!int(num)||!int(den)||den<1||num>den){
      console.error("[G5] A4 status=computed but values are not sane: numerator="+num+" denominator="+den
        +" (require: non-negative integers, denominator >= 1, numerator <= denominator)");
      process.exit(1);
    }
    console.log("[G5] A4 status=computed "+num+"/"+den);
  });
'
```

> **§11이 실패하면 두 갈래뿐이다**: 배포 + 새 세션을 실제로 수행해 통과시키거나, §G5의 조건성이 미리 고정한 **미달 처리**(`computed` 주장 금지 · A4 행 `forward-only` 유지 · PRD status를 순정 `complete`로 적지 않음)를 밟는다. **조용히 지나가는 세 번째 길은 없다** — 이것이 3라운드 연속 제기된 "G5는 사람이 건너뛸 수 있다"에 대한 응답이다.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **투영 재배선이 STATE.md 바이트를 미세하게 바꿔 두 파서 중 하나가 깨짐** — 소비처 14곳이 조용히 오작동 | 높음 | G3 골든 바이트 회귀를 `state-writer.readState`·`state-injector.readState` **양쪽**에 건다. `renderState`를 재작성하지 않고 **그대로 재사용**(DD4). `MCCP_STATE_JOURNAL=shadow` 복구 스위치 |
| **저널이 hot path(모든 hook)에 들어가 세션 부팅이 느려짐** | 중 | append는 O_APPEND 단일 버퍼(spawn 0, `msw-events` 실측 계약). 투영은 순수 reduce이고 checkpoint 이후 레코드만 재생. `journal verify`로 회귀 감지 |
| **A4가 `computed`로 뒤집히지 않음** — 플러그인 캐시 미배포로 hook 수정이 런타임에 도달하지 않음(M4 env-snapshot이 지금 겪는 상태) | **높음(관측됨)** | §3.7대로 `plugin.json` bump을 Task 10에 의무 포함 + `claude plugin update` 후 **새 세션**에서 실측 확인을 Acceptance에 명시. 미확인 시 처리는 §G5의 조건성에 **사전 고정**(사후 협상 금지) |
| **CL-5 경로 결함(4번째 재발)의 수정이 불완전** — write만 고치고 열거(`enumerateUnfinishedItems(process.cwd())`)를 놓치면 *틀린 위치에서 읽은 내용*을 옳은 위치에 쓰게 되어, 아티팩트는 생기는데 내용이 비거나 교차 오염된다. 이 경우 G5는 "산출됨"으로 보이면서 값이 거짓이 된다 | **높음** | Task 8이 수정 대상을 **3곳 표로 고정**하고 `repoRoot` 출처까지 명시. 회귀 test (a)가 self-credit 0을, (c)가 교차 항목 계상을 각각 단언해 "생성됐다"와 "옳다"를 분리 검증 |
| **저널 append 실패 시 동작이 구현자 해석에 맡겨짐** — 쓰지 않으면 파이프라인 정지, 조용히 쓰면 SoT 주장이 무의미 | 중 | DD6.1 abort 표가 4개 상황 전부를 고정. `journal verify` 비영점 exit가 degraded를 표면화 |
| **압축이 이력을 손실시켜 M5가 없애려던 "되돌릴 수 없는 압축"을 재도입** | 중 | checkpoint 무손실 + **압축 전후 투영 deep-equal** test(G4). `evictLRU` 방식 unlink 미사용(DD1) |
| **재생 방어가 정상 재개까지 차단해 단일 세션 사용성을 해침** | 중 | 배제 대상은 **tombstone 이후 또는 역행 seq** 뿐이다. 정상 재개는 새 epoch + 새 seq라 항상 `admit`. 재개 시나리오를 회귀 test의 양성 케이스로 고정 |
| **저널 write 실패 시 폴백이 조용해 SoT 주장이 검증 불가가 됨** | 중 | DD6 — loud warn + `journal_degraded` 표기 + `journal verify`가 degraded를 비영점 exit로 노출 |
| **범위가 커져 분할 유혹** — 대형 코호트 반증 조건 위반 | 중 | 분할 금지(§대형 코호트 제약). 줄여야 하면 Task를 빼는 것이 아니라 **목표 미달을 정직 보고** |
| **병렬 브랜치 version 충돌** — `context-budget-cleanup`이 1.23.7 base라 1.23.8을 선점할 수 있음(이번 사이클 3회 재발) | **높음(관측됨)** | §3.7 forward-only 상향. merge 후 `CHANGELOG.md` 헤딩 중복 검사 + PR title version 재확인 |
| **머지가 intervening 파일을 소리 없이 삭제** (§3.5.1 · PR #110 선례) | 중 | 커밋 직전 `git diff --diff-filter=D --name-only origin/main...HEAD` 확인을 Acceptance에 포함 |

## Acceptance

- [ ] Task 1~10 전부 완료
- [ ] Validation §1~§7 전부 통과 (전체 스위트는 사전 존재 red 목록과 대조해 **신규 red 0**)
- [ ] Validation **§10·§11** 통과 — lint exit 0 **그리고** 매니페스트 단언 **absent 0**(빈 test 파일이 `node --test` 0개 test로 통과하는 구멍을 §11이 닫는다, R9 test HIGH 흡수)
- [ ] **G1** — `state-writer.update()` 경유 변형이 100% 저널에 append되고, 투영 밖 STATE.md write가 lint에서 0건. **degraded 모드(DD6.1)**: append 실패 시 sticky 마커 진입 → 투영 중단 → 직접 경로로 동작 → 불완전 저널이 STATE.md를 덮어쓰는 경로 부재를 회귀 test가 단언, `journal checkpoint --reseed` 복구 동작 확인. **stickiness는 3회 이상 호출로 단언**(Task 3 Validate 6 — 1회 직접 write가 sticky를 흉내 내지 못하게)
- [ ] **마커 실패 경로(DD6.1 책임 표)** — `journal-store.writeDegradedMarker`는 `{ok:false}` 반환(throw 없음) · `state-writer.update()`가 그 값을 받아 **throw**(유일 throw 지점) · `append 실패 ∧ STATE.md 성공 ∧ 마커 실패` 행이 회귀 test로 재현됨. `session-end` 경로의 `.handoff-root-unresolved`는 **throw하지 않고** msw-event 2채널 + SHIP-2 3-state로 처리
- [ ] **투영 순수성** — Task 7 축 5(`project.js`의 `fs`/`child_process`/`net`/`os` import 0) + Task 3 Validate 7(b) 동적 스텁에서 `project()` 정상 반환
- [ ] **무결성(DD6.3)** — 레코드별 `content_hash` 전수 검사 + 손상 레코드 격리(투영 제외 + 카운트) + `journal verify` 비영점 exit. 부정 fixture(바이트 손상)에서 실제로 실패
- [ ] **G2** — 크래시·재개 재생 test 단언 5종(잔존 · `superseded_by` · 투영 불변 · mtime 무변경 · TTL 경과 후 동일) + **DD11 클론 내구성**: `completion-ledger` N개 → tombstone N개 seed → 해당 work_unit 신규 레코드가 `admit-post-tombstone`, ledger 부재 시 loud warn + 부트스트랩 진행
- [ ] **G3** — (a) 동일 patch 시퀀스의 M5 전후 산출이 **byte-identical** (b) 두 파서 **각각**의 전후 파싱 결과 동등(상호 비교 아님) (c) `next_chunk` divergence fixture가 선재 격차를 pin (d) Task 7 축 2 lint가 STATE.md 소비 **호출부 14개 줄**의 변경 0을 확인 — `session-start.js`·`session-end.js`의 CL-5 편집은 이 대상 밖임을 양성 케이스로 확인
- [ ] **G4** — `journal query` 4개 필터 동작 + 압축 전후 투영 deep-equal + 상한 3종 발화
- [ ] **G5(분자 배송)** — `a4-boundary-restore.test.js` 단언 **7종**(self-credit 0 · genesis `insufficient` · 교차 계상 · 분자 ≤ 분모 · **비음수 정수** · **`computed`이면 분모 ≥ 1** · fixture `cwd ≠ repoRoot` 자체 단언) 통과 + CL-5 수정 **3곳**(열거 포함) 착지
- [ ] **G5(전환) — 아래 둘 중 정확히 하나가 성립하고, 어느 쪽인지 보고서에 명시된다** (L2 invariant R6 CRITICAL 흡수: 이전 판에서 "확인"과 "미확인"을 **두 개의 체크박스**로 나란히 둬 미달이 통과 모드처럼 읽혔다 — 하나로 합치고, 미달 쪽도 *양성 산출물*을 요구해 빈칸으로 체크할 수 없게 한다)
  - **(충족)** `Validation-SHIP-1`·`SHIP-2` 모두 exit 0 — 배포 확인 + `*.handoff-items.json` ≥1건 + A4 status `computed`
  - **(미달)** 아래 **세 산출물이 전부** 착지: ① `measurement-instrumentation.md` A4 행이 `forward-only`로 유지 ② PRD M5 status가 `complete (인정 조건 미충족: A4 전환 미확인)` 형태의 **non-canonical 문자열** ③ 보고서에 SHIP-2가 출력한 **3-state 판정** 인용 — `CL-5 미해소`(마커 또는 msw-event 존재) / `producer 미실행`(세 채널 전부 부재) / `판정 불가`(`session_end`는 있는데 아티팩트·자국이 없음). **`computed` 주장은 금지**이며, `판정 불가`는 미달의 한 형태이지 별도 통과 경로가 아니다
- [ ] PRD Open Questions 2건(`이력 보존 정책` · `점유 만료와 재생 방어`)이 `[x]` + 문서 링크로 마감
- [ ] 신규 토글 **정확히 1개**(`MCCP_STATE_JOURNAL`), `docs/ENVIRONMENT.md` §11 등재 (UI11)
- [ ] 게이트 강도·receipt chain·dual-review 불변식 변경 **0** (UI3) — `git diff`로 `scripts/receipt/` · `commands/` 게이트 본문 무변경 확인
- [ ] `plugin.json` 1.23.8 + footer 5면 동기 (§3.7)
- [ ] `git diff --diff-filter=D --name-only origin/main...HEAD` 에 의도하지 않은 삭제 0 (§3.5.1)
- [ ] Patterns mirrored, not reinvented

## Codex Adversarial Review

> **Codex skipped per `MCCP_CODEX_DISABLED=1` (env-level policy, first-class skip).**
>
> `codex-invoke.js`가 spawn 직전 short-circuit하므로 Codex는 **발화하지 않았고**, receipt는 `resolution.codex_verdict='skipped'` + `meta.codex_disabled=true`로 봉인된다.
>
> **이 봉인이 두 소비축에서 서로 다르게 읽힌다는 것을 정확히 적어 둔다 (실측 확인).**
>
> | 술어 | 값 | 귀결 |
> |---|---|---|
> | `dedupe.crossModelConverged` | **false** | cross-gate dedupe가 fail-closed → `/mccp:pr`의 PR-Codex는 **skip되지 않는다**. 이것이 이 경로가 안전한 이유다 |
> | `receipt-convergence.isConvergedVerdict` | **true** | codex 축에서는 `divergent`/`critical`이 아니면 `resolution.converged`로 떨어지는데 그 값은 `write.js:330`이 기본 `true`로 둔다. 따라서 **대시보드·derive 표면은 이 게이트를 converged로 렌더한다** |
>
> 두 번째 행은 함정이다. `skipped`가 M3 DD1의 sanctioned ship 집합 원소인 것은 *ship 판정* 축의 의도이지, **누군가 이 plan을 승인했다는 뜻이 아니다.** 이 receipt가 증명하는 것은 정확히 *"env 정책상 Codex를 부르지 않았다"* 하나뿐이다. §3.12가 `resolution.converged`를 신뢰 불가 필드로 지목한 바로 그 패턴이 `skipped` 경로에 남아 있는 것이며, 관측 사실로 [backlog](codex-findings-backlog.md)에 기록하되 이 milestone에서 고치지 않는다(게이트 강도 축 — UI3 범위 밖).
>
> **이 게이트는 승인을 발급하지 않는다.** 이 milestone의 실제 검토 기록은 두 곳에 있다:
>
> - **L2 refutation 패널 11라운드** — 전부 `divergent`, 3명 동시 pass 0회(최선 2). 라운드 1~9는 [plan-review-multi-session-work-loop.md](../reviews/plan-review-multi-session-work-loop.md), 라운드 10~11은 [plan-review-multi-session-work-loop-m5.md](../reviews/plan-review-multi-session-work-loop-m5.md)가 소유한다. 흡수 내역은 위 §L2 Review의 Round 6~11 표.
> - **미승인 진행의 근거** — §잔여 8. 운영자 결정이며, 승인을 위조하지 않는다.
>
> 따라서 이 plan은 **cross-model 검증을 받지 않은 상태로 구현에 들어간다.** 그 검증을 회복하려면 `/mccp:pr` 실행 시 `MCCP_CODEX_DISABLED`를 해제해 PR-Codex를 실제로 발화시켜야 한다(잔여 8의 조건부 서술이 가리키는 지점).

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) — `classification=disabled` · `blocking=false` · `durationMs=0`
- 라운드 수: 0 (Codex 미발화)
- 합치 결론: **Codex skipped per `MCCP_CODEX_DISABLED=1` (env-level policy, first-class skip).** spawn 직전 short-circuit이므로 implement-time 결정에 대한 cross-model 판정은 **존재하지 않는다.** receipt는 `resolution.codex_verdict='skipped'` + `meta.codex_disabled=true`로 봉인되며, `dedupe.crossModelConverged=false`이므로 cross-gate dedupe가 fail-closed → `/mccp:pr`의 PR-Codex는 skip되지 않는다(§Codex Adversarial Review의 2행 표와 동일 판정).
- YAGNI Triage: 해당 없음 (findings 0 — 리뷰어가 발화하지 않았으므로 "findings 0"은 *승인*이 아니라 *미실행*이다)
- Deferred to backlog: 0
- Open Questions: 없음 (게이트 축). 단 **cross-model 미검증 상태로 EXECUTE에 진입한다** — plan §잔여 8이 같은 조건을 plan 축에서 이미 선언했고, implement 축에도 동일하게 성립한다
- Codex session 참조: n/a (미발화)

### 실행 전 확정한 implement-time 결정 (plan이 pre-commit하지 않은 축)

plan은 모듈 경계·판정 우선순위·시그니처를 고정했으나 아래 6축은 열려 있었다. 구현자가 즉석에서 정하면 test와 lint가 서로 다른 것을 가정하게 되므로 EXECUTE 전에 못박는다.

| # | 축 | 결정 | 근거 |
|---|---|---|---|
| I1 | 저널 파일 배치 | `.claude/state/journal/records.jsonl` (활성 세그먼트) + `.claude/state/journal/segments/<n>.jsonl` (회전분) + `.claude/state/journal/checkpoint.json` + `.claude/state/journal/.degraded` | `msw-events`의 per-session 샤딩을 **쓰지 않는다** — 투영이 전 세션 레코드를 시간 순으로 접어야 하므로 단일 활성 세그먼트가 reduce 입력을 단순하게 만든다 |
| I2 | 순환 require 해소 | `state-writer.js`가 **함수 안에서 lazy require**로 journal facade를 부르고, `project.js`는 top-level에서 `state-writer`의 `mergeState`/`emptyState`를 require | plan Task 3이 "`project.js`는 `mergeState`를 import한다"를 요구하는데 `state-writer`가 top-level에서 journal을 require하면 CommonJS 부분 초기화로 `mergeState`가 `undefined`가 된다. lazy 방향을 **state-writer 쪽**으로 두면 project가 볼 때 state-writer는 이미 완전하다 |
| I3 | `work_unit` 해석 | `resolveWorkUnit({patch, merged})` = `patch.workUnit` → `patch.escalate_pending_decision_id` → `merged.frontmatter.escalate_pending_decision_id` → `merged.frontmatter.task_fingerprint` → `'unknown'` | plan은 tombstone을 `work_unit` 키로 판정하고 DD11은 그 tombstone을 `completion-ledger`의 **`decision_id`** 에서 seed한다. 두 네임스페이스가 만나는 유일한 지점이 decision slug이므로 그것을 최우선으로 둔다. **잔여(아래 I3-note) 참조** |
| I4 | `content_hash` 정규화 | 키 사전순 정렬 + `content_hash` 필드 제외 + `JSON.stringify` — `record.js#canonicalize` 한 함수가 소유하고 writer/verify가 **같은 함수**를 호출 | 두 곳에서 각자 직렬화하면 정규화가 갈라져 verify가 전건 실패한다 |
| I5 | 토글 파싱 위치 | `lib/state-journal/index.js#parseJournalMode(env)` — `enforce`(default) · `shadow` · `off`. 인식 불가 값은 loud warn 후 `enforce` | DD7이 값 3종만 정하고 파싱 위치를 정하지 않았다. facade에 두면 `state-writer`와 CLI가 같은 판정을 공유한다 |
| I6 | `seq` 스코프 | `work_unit` 별 단조 정수(1부터). 전역 단조가 아니라 **작업 단위별** | plan Task 1의 판정 우선순위 ③이 `highWater[work_unit]`을 쓰므로 seq는 work_unit 스코프여야 의미가 맞는다. 전역 순서는 `session_epoch` + `ts`가 답한다 |

> **I3-note (정직 기록 — 이번 구현이 발견한 plan의 미명시 축).** DD11은 tombstone을 `completion-ledger`의 `decision_id`로 seed하지만, `state-writer.update()`를 부르는 hook 다수는 decision slug를 patch에 싣지 않는다 — 그 경우 `work_unit`이 `task_fingerprint`(해시)로 떨어지고, ledger tombstone과 **네임스페이스가 만나지 않는다**. 즉 DD11의 클론 내구성은 **decision-slug 축 레코드에만** 성립하고 fingerprint 축 레코드에는 성립하지 않는다. 이는 G2를 무효화하지 않는다(저널 수명 안의 tombstone은 두 축 모두에 성립한다) — 좁아지는 것은 **클론 경계를 넘는** 방어뿐이다. plan의 잔여 1이 이미 "클론 밖으로 넘어가는 것은 요약"이라 적었으므로 그 잔여의 **범위 정밀화**로 기록하고, `state-truth-source-design.md`에 명시한다(Task 9).

### Security Reviewer

`Task(mccp:security-reviewer)` **실발화** — pre-EXECUTE 설계 리뷰. findings **7건** (CRITICAL 0 · HIGH 3 · MEDIUM 3 · LOW 1). auto-CRITICAL 카탈로그(§0 — security boundary · atomic state · schema breakage) 해당 **0건**이므로 MCCP-GATE-STOP 미발화.

| # | 지적 | Sev | Verdict | 판정 근거 |
|---|---|---|---|---|
| S1 | `resolveHandoffRoot(ctx)`에서 `ctx.projectRoot === ''`이면 `path.join('', …)`이 cwd 상대로 접혀 CL-5가 그대로 남는다 | HIGH | **ACCEPT_NOW (설계 확인)** | plan Task 8이 **이미 명세한 바로 그 동작**이다(비어 있으면 `discoverRepoRoot` walk-up → 실패 시 loud warn + skip). 리뷰어가 독립적으로 같은 결론에 도달한 것이며 신규 축이 아니다. 구현이 그 명세를 정확히 따르는지를 회귀 fixture(`projectRoot=''`)가 단언한다 |
| S2 | git-tracked `completion-ledger` 엔트리 파싱 — parse 실패의 uncaught throw + **`__proto__`/`constructor` 키를 통한 프로토타입 오염** | HIGH | **ACCEPT_NOW (오염 축은 신규)** | try/catch + `seeded`/`corrupt` 카운터는 DD11이 이미 명세했다. **그러나 오염 축은 plan 어디에도 없다** — `JSON.parse`는 `__proto__`를 *own* 속성으로 만들고 그 객체를 `Object.assign` 대상으로 쓰면 `[[Set]]`이 `Object.prototype` setter를 발동시킨다. 저널 레코드도 같은 경로다. **닫는 방법**: `record.js`의 allowlist 복사를 `Object.assign`/spread가 아니라 **키별 명시 대입 + `Object.create(null)` 누산기**로 구현하고, 오염 시도 fixture(저널 라인 1건 · ledger 엔트리 1건)를 `journal-store.test.js`에 넣는다 |
| S3 | seq 할당(read max → +1)이 append와 원자적이지 않아 동시 writer가 같은 seq를 쓰면 G2의 단조성이 깨진다 | HIGH | **ACCEPT_NOW (부분) — 잔여 4의 정밀화** | 리뷰어가 **판정 우선순위 ④를 놓쳤다**: plan은 같은 seq 충돌을 이미 예상하고 `session_epoch` 큰 쪽 `admit` / 작은 쪽 `admit-superseded`로 결정론적 해소를 고정했다(동률은 `session_id` 사전순). 게다가 `assignOrder`는 `update()`의 **기존 advisory 락 안**에서 돌므로 충돌은 락이 fail-open한 구간에서만 발생한다 = **잔여 4의 범위 그대로**. 다만 그 구간의 *귀결*이 plan에 적혀 있지 않았다 — 낮은 epoch 쪽 patch는 **투영되지 않는다**(레코드는 잔존·질의 가능). 이는 G1의 "정상 모드 무손실"과 충돌하지 않지만(락 fail-open은 정상 모드가 아니다) 명시가 없으면 조용한 손실로 읽힌다. → **잔여 4를 정밀화**하고 rule ④ 동시-seq 회귀 단언을 Task 1 Validate에 추가 |
| S4 | advisory 락 fail-open이 STATE.md ↔ 저널 divergence를 만들고 `verify`가 거짓 통과할 수 있다 | MEDIUM | **REJECT — 이미 닫힘** | plan Task 6의 `journal verify`는 **3중 검사**이고 그 ②가 정확히 "투영 ↔ 디스크 STATE.md 일치"다. 거짓 통과 전제가 성립하지 않는다. divergence 자체는 DD6.2 + 잔여 4가 선언했고 `verify --reproject`가 수렴 경로다. 구현이 ②를 실제로 갖는지만 확인하면 된다(Task 6 Validate) |
| S5 | checkpoint 압축 중 크래시 시 부분 checkpoint + 부분 삭제된 세그먼트로 tail 유실 | MEDIUM | **ACCEPT_NOW** | plan은 `writeCheckpoint`를 원자 tmp+rename으로 못박았으나 **세그먼트 회수 순서**는 정하지 않았다. 불변식으로 고정: (i) checkpoint를 tmp→rename으로 착지 (ii) checkpoint에 `record_count`+`through_seq`를 실어 부트스트랩이 대조 (iii) **rename 성공 이후에만** 세그먼트를 회전(unlink가 아니라 `segments/`로 이동). 압축 전후 투영 deep-equal 단언(Task 5)이 이 불변식의 반증자다 |
| S6 | `journal checkpoint --reseed` / `verify --reproject`가 이력을 파괴하는데 인가·감사·rate limit이 없다 | MEDIUM | **부분 ACCEPT** | "SSH 침해 공격자"는 M3 §1.1 · DD6.3이 선언한 **단일 운영자 위협 모델 밖**이다(`--force` 플래그·rate limit은 REJECT_YAGNI — 저장소 write 권한자는 저널 파일을 직접 지울 수 있으므로 CLI 게이트가 막지 못한다). **그러나 감사 축의 절반은 타당하고 이 milestone의 목적과 정확히 일치한다**: reseed는 이력을 지우면서 **자기 자신은 기록하지 않는** 상태였다. → reseed가 새 genesis에 `reseed_of`(직전 checkpoint 요약 · 폐기된 레코드 수 · 사유)를 봉인하고 loud stderr로 범위를 출력한다. 즉 파괴를 막지는 않되 **파괴가 이력에 남는다** |
| S7 | malformed JSONL 라인의 조용한 skip이 truncation(디스크 full 등)을 은폐한다 | LOW | **ACCEPT_NOW (일부) / REJECT (형식 변경)** | 진단 카운트는 Task 2가 이미 명세했다. 닫는 것은 **소비 축**이다: `journal verify`가 `malformed_count > 0`에서 **비영점 exit**하고 그 라인의 앞 80자를 stderr로 인용한다. 반면 length-framing/base64 래핑은 **REJECT_YAGNI** — `msw-events`와 공유하는 JSONL 계약을 깨고, `content_hash` 전수 검사 + malformed 카운트가 같은 신호를 이미 준다 |

**흡수 결과 요약**: 신규 축 2개(S2 프로토타입 오염 · S3 잔여 4 정밀화)와 구현 불변식 3개(S5 회수 순서 · S6 reseed 자기기록 · S7 verify 비영점)를 EXECUTE 범위에 넣는다. S1은 plan 명세 재확인, S4는 사실 오류로 기각. **DEFER_TO_BACKLOG 0건** — 전부 이번 사이클에서 닫거나 위협 모델 밖으로 기각했다.

> **잔여 4 정밀화 (S3 흡수)** — 락이 fail-open한 구간에서 두 프로세스가 동시에 append하면 같은 `seq`가 발급될 수 있다. 그 경우 판정 우선순위 ④가 `session_epoch` 큰 쪽을 `admit`, 작은 쪽을 `admit-superseded`로 결정론적으로 해소한다. **강등된 쪽의 patch는 투영에 반영되지 않는다** — 레코드는 저널에 잔존하고 `journal query --include-superseded`로 질의 가능하지만, STATE.md에는 나타나지 않는다. 즉 락 fail-open 구간은 "손실 없음"이 아니라 **"손실이 기록으로 남음"** 이다. G1이 "정상 모드"로 한정된 이유가 여기에도 걸린다.

## Design Critique

- 트리거: axis (a) detector positive — `design_signal=true`, `signal_files` 5개(`renderer/html.js` · `renderer/markdown.js` · `renderer/tests/i18n-surface.test.js` · `derive/sources/session-journal.js` · `derive/index.js`)
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료
- 라운드: **1** (R0) · cap 2 · **verdict `CONVERGED`** (게이트 2회차 재진입 시 재검출 — signal_files가 7개로 늘었으나 이는 plan 본문이 인용한 경로가 늘어난 것이고 design surface 변경은 그대로 version 상수 2개뿐)
- Assessment A (설계 검토): M5는 **새 렌더 표면을 도입하지 않는다.** design-surface 파일 2개의 변경은 §3.7이 의무화한 version 상수 동기(page-foot · derived 줄)뿐이며, 색 토큰·레이아웃·정보 위계·마크다운 렌더 파이프라인은 무변경이다. 4개 Output Constraints 전부 무영향:
  - 정보 위계 3단계(H15) — 신규 rendered-surface 라인 0이므로 heading depth 위험 없음
  - 강조색 화면당 1개 — accent 토큰 무변경
  - raw markdown marker 금지 — 렌더 파이프라인 무변경
  - 한 화면 항목 수 상한 — 대시보드에 신규 `list-of-N` 섹션 미추가
- Assessment B (detector, `detect.mjs --json .claude/cache/status.html`): findings **2건, 둘 다 이 plan이 도입한 것이 아니다** — 생성 아티팩트의 **선재** 상태다.
  - `em-dash-overuse` (warning) — 본문 em-dash 23개. 소스가 한국어 `.claude/` 산출물이라 파생 결과이며 M5 범위 밖
  - `numbered-section-markers` (advisory) — `06, 08, 10, 11, 12`. milestone 번호이므로 skill 자체 규칙("실제로 sequence일 때 번호는 정당")상 오탐 가능성이 높음
  - 둘 다 HIGH/CRITICAL 아님. **plan 섹션을 지목할 수 없으므로**(critique invariant) plan-actionable findings에 넣지 않고 관측으로 기록한다. 대시보드 표면 축의 후속 판단은 운영자 소관
- 결론: plan-actionable findings **0건** → R0에서 `CONVERGED`

## L2 Review — 최종 상태 (round 10까지)

L2 refutation 패널을 **10라운드** 돌렸고 **수렴하지 않았다**. 라운드 1~9의 판정과 findings 전문은 [.claude/reviews/plan-review-multi-session-work-loop.md](../reviews/plan-review-multi-session-work-loop.md)가, 라운드 10 이후는 canonical slug 파일 [.claude/reviews/plan-review-multi-session-work-loop-m5.md](../reviews/plan-review-multi-session-work-loop-m5.md)가 소유한다.

| Round | architect | security | test | invariant | 비고 |
|---|---|---|---|---|---|
| 1 | fail | fail | fail | fail | |
| 2 | **pass** | fail | fail | fail | |
| 3 | _(agent 오류)_ | **pass** | **pass** | fail | StructuredOutput 미호출 |
| 4 | _(세션 한도)_ | fail | _(한도)_ | _(한도)_ | **환경 실패** — coverage 1/3, 판정 불성립 |
| 5 | fail | fail | fail | fail | |
| 6 | **pass** | fail | fail | fail | 이후 agent cap 24/24 소진 |
| 7 | _(agent 오류)_ | fail | fail | fail | 새 세션에서 재판정. coverage 3/4라 여유 0 |
| 8 | **pass** | **pass** | fail | fail | coverage 4/4 — 2명이 findings 0으로 pass(최선) |
| 9 | fail(MEDIUM만) | **pass** | fail | fail | invariant 5건 전부 "코드가 아직 없다" 범주 |
| 10 | **pass** | **pass** | fail | fail | coverage 4/4 · 실결함 3건 신규 포착(아래 흡수) |

**종료 사유**: (1) 운영자 지시 — HIGH 이상을 수용하고 수렴하지 않으면 진행한다. round 6의 HIGH·CRITICAL **7건 전부**와 round 7의 실질 **4축**을 아래 두 표대로 흡수했다. (2) round 6은 세션 에이전트 cap `cap-exhausted`(granted 0)로, round 7은 흡수 후 재판정이 다시 `divergent`로 각각 종료됐다.

**receipt는 작성되지 않았다.** 패널 경로는 `review_proof`가 없는 verdict를 봉인하지 못하도록 설계돼 있고(fail-closed), divergent에는 proof가 생기지 않는다. 이 부재 자체가 정직한 기록이며, **승인을 위조하지 않는다**. `/mccp:pr` 단계에서 PR-Codex가 정상 발화하므로 cross-model 검증은 유실되지 않는다.

**개별 리뷰어는 3개 라운드에서 pass로 전환했으나 동시에 3명이 pass한 적은 없다.** plan은 매 라운드 더 엄격해지기만 했으므로(잔여 명시 · lint 축 4개 · 기계 검사 · ship 단계 분리) 이 진동은 품질 하락이 아니라 **동일 입력에 대한 판정 분산**이다 — PRD가 "판정 위치만 바꿔도 결과가 흔들린다"고 적은 현상의 실측 사례이며 diverse-agent-review PRD 소관이다.

### Round 6 HIGH+ 흡수 (7건 — 그중 5건은 내 이전 라운드 수정이 만든 결함)

| # | 지적 | 출처 | 타협점 |
|---|---|---|---|
| 1 | §11(G5 실측)이 implement 루프 안에 있어 **항상 실패**한다 → soft gate로 전락 | invariant CRITICAL · **내 R5 수정** | 실측을 없애지도 루프에 두지도 않고 **`Validation-SHIP` 단계로 분리**. §1~§10은 매 회, SHIP은 PR 직전 1회. 항상 실패하는 검사가 루프에 없으므로 무시 학습이 생기지 않는다 |
| 2 | Acceptance가 G5 "확인"과 "미확인"을 **나란한 두 체크박스**로 둬 미달이 통과 모드로 읽힌다 | invariant CRITICAL · **내 R5 수정** | **하나의 체크박스**로 합치고 미달 쪽에 *양성 산출물 3종*(A4 행 유지 · non-canonical PRD status · 원인 인용)을 요구 — 빈칸으로 체크 불가 |
| 3 | `resolveHandoffRoot`의 skip이 조용해 CL-5 우회와 구별되지 않는다 | invariant HIGH · **내 R5 수정** | skip을 없애지 않되 **셀 수 있게**: `.handoff-root-unresolved` 마커 + msw-event, SHIP-2가 0건의 **원인을 구분**해 보고. repo 밖 실행은 결함이 아니라 "해당 없음"임도 명시 |
| 4 | degraded 마커가 기록일 뿐이라, 크래시 후 다음 세션이 불완전 저널 위에서 조용히 재개한다 | invariant HIGH · **내 R3 수정** | 마커를 **차단**으로 승격 — 마커 존재 시 genesis 부트스트랩이 `EX_TEMPFAIL`로 거부하고 `--reseed`를 강제. 단 STATE.md 직접 경로는 살려 파이프라인은 멈추지 않는다 |
| 5 | 마커 write 자체가 실패하면 hook의 fail-open이 삼켜 **기록되지 못한 강등**이 남는다 | security HIGH · **내 R3 수정** | 마커 write 실패는 삼키지 않고 `update()`가 throw. 추가로 `journal verify`에 추론 축(`STATE.md.updated_at > 최신 레코드.ts` → degraded 판정)을 둬 마커 유실도 2차로 잡는다 |
| 6 | G3의 위험은 호출부 줄이 아니라 **호출 그래프**다 — `handoff-items`가 저널과 엮이면 줄이 그대로여도 위반 | security HIGH · **내 R2 수정의 사각** | 범위를 넓히는 대신 **의존을 금지**: M5에서 `handoff-items.js`는 저널과 통합하지 않는다(A4 분자는 저널 쪽에서 파생). lint **축 4**가 import를 기계 검증 |
| 7 | plan의 단언을 **구현 전에 검증할 기계 장치가 없다** | test HIGH | **Task 0 단언 매니페스트** — 각 Validate 단언을 `m5-assertion-manifest.json`으로 옮기고 lint가 test 제목과 대조. 구현 전엔 미존재 목록을 출력, 이후엔 누락을 실패로 |
| 8 | M2 re-freeze 선행 조건이 기계적으로 걸려 있지 않다 | invariant HIGH | **Task 0 진입 조건** — `measurement-feasibility.md` 상태를 인용하고 PROVISIONAL이면 **잔여 7**로 등재(차단하지 않음 — M2는 이미 ship됐으므로 되돌리는 것은 이 milestone의 권한 밖이고, 침묵이 문제였다) |

### Round 7 흡수 (4축 — 흡수 편집 후 재판정한 결과)

Round 6 흡수본(`plan_hash ef441f9c…`)을 새 입력으로 7라운드를 돌렸다. architect가 `StructuredOutput` 미호출로 null(round 3에 이어 2회차)이라 coverage 3/4였고, quorum 3을 채우려면 **응답한 3명 전원이 pass**해야 하는 여유 0 상태였다. 결과는 `divergent`(blocking 12). findings 13건 중 **실질 4축**을 흡수했다.

| # | 지적 | 출처 | 흡수 |
|---|---|---|---|
| A1 | **마커 write 실패 자체의 처리가 표에도 Task에도 없다** — line 256 산문만 "throw한다"고 적었고 *어느 함수가* 수행하는지는 적힌 적이 없다 | invariant CRITICAL ×2 + security HIGH (3명 독립 수렴) | DD6.1 abort 표에 `append 실패 ∧ STATE.md 성공 ∧ 마커 실패` 행 추가(되돌리지 않는 이유 포함) + **책임 2층 표** 신설(`journal-store.writeDegradedMarker`는 `{ok:false}`, `state-writer.update()`가 유일 throw 지점) + Task 2·3 Action에 구현 위치 명시 |
| A1b | `.handoff-root-unresolved` 마커 write가 실패하면 SHIP-2가 **거짓 원인**("producer 미실행")을 보고한다 | security HIGH | hook에서 throw는 불가(fail-open 계약)이므로 **채널을 늘려 단정을 불가능하게**: SHIP-2를 3-state로 — `session_end` msw-event가 hook 실행의 독립 증거이므로, 그것이 있는데 0건이면 `판정 불가`로 떨어진다 |
| A2 | **A4 값 온전성 미검증** — SHIP-2가 `status`만 보고 분자/분모를 안 본다. `{numerator:-5}`·`0/0`도 "측정됐다"로 통과 | test CRITICAL(a) + test MEDIUM | Task 8 단언 5→7종(비음수 정수 · `computed`이면 분모 ≥ 1) + SHIP-2에 값 검사 추가 |
| A3 | **lint 과잉 주장** — "우연한 통과가 원리적으로 불가능하다"는 거짓. `const f = process.cwd(); fn(f)` 는 리터럴 검사를 통과 | test HIGH + invariant MEDIUM | 축 3 (b)를 **1-hop 지역 별칭**까지 확장 + 주장을 실제 능력으로 좁힘 + 임의 깊이·오바인딩을 **명시 잔여 9**로 등재 |
| A4 | degraded stickiness가 다중 호출로 단언되지 않는다 · `project()` 순수성이 기계 검증되지 않는다 | test MEDIUM ×2 | Task 3 Validate에 단언 6(3회 호출 + reseed 복귀 5단계) · 7(정적 축 5 + 동적 `fs` 스텁) 추가. Task 7 축 5 신설, 부정 fixture 3→6종 |

**기각한 축(재지적)**: degraded가 fail-closed 아님(→ **잔여 4** + DD6 "직접 쓰기 금지가 아니라 조용한 폴백 금지") · SHIP-2 실패가 PR을 기계적으로 막지 않음(→ **UI3** 게이트 강도 변경 범위 밖 + §G5 조건성이 미달 처리를 사전 고정) · G5가 배포 의존(→ §G5 조건성 자체) · "test 파일이 아직 없다"(→ plan 정의상, 아래 절).

**리뷰어 등급 (round 7에서 확인).** `.claude/settings.json`의 `CLAUDE_CODE_SUBAGENT_MODEL: "haiku"` + `plan-review.js:176`의 `effort:'low'` 조합이라 L2 리뷰어 4명은 전부 **Haiku / low-effort**로 돈다. architect가 round 3·7 두 번 구조화 출력에 실패한 것도 같은 축이다. plan이 "판정 분산"이라 적은 진동의 **원인 한 축이 리뷰어 모델 등급**일 수 있으므로, 진동을 해석할 때 이 값을 함께 읽어야 한다 — 사용자 설정이라 이 milestone은 바꾸지 않고 사실만 기록한다.

### Round 8 흡수 (7축 — 처음으로 2명이 findings 0으로 pass)

Round 7 흡수본(`plan_hash e76e8f2e…`)으로 8라운드를 돌렸다. **architect·security 모두 findings 0으로 pass**했고 coverage는 4/4였다 — 8라운드 중 처음이다(round 3은 2 pass였으나 coverage 3/4). test·invariant가 남았고 quorum 3 미충족으로 여전히 `divergent`.

| # | 지적 | 출처 | 흡수 |
|---|---|---|---|
| B1 | **Task 0이 읽는 `m5-assertion-manifest.json`을 아무 Task도 만들지 않는다** — Files to Change에도 없어 Task 0 자체가 실행 불가 | test CRITICAL | Files to Change에 CREATE 추가 + Task 0에 **산출물** 절 신설 + 파일 부재 시 비영점 exit |
| B2 | `MCCP_STATE_JOURNAL`이 "복구 스위치"라고만 적혀 있고 발동·지속·우선순위·검증이 없다 | invariant HIGH | DD7에 **운영 계약 표** 5행 추가(수동 전용 · 프로세스 수명 · **마커 > 토글** · `shadow`는 쓰기 경로만 되돌림 · 양성 단언 2종) |
| B3 | G1이 "**모든** 상태 변형"이라 적어 degraded 구간(잔여 5)과 충돌한다 | test MEDIUM | 보증 표 G1을 "**정상 모드의** 모든 변형"으로 한정하고 제외가 마커·stderr·비영점 exit로 표면화됨을 본문에 넣음 |
| B4 | `update()`의 throw를 hook의 fail-open이 삼키면 실효를 잃는다 | invariant CRITICAL | throw가 보증하는 것을 **2항으로 정확히 규정** — ①성공을 반환하지 않는다 ②다음 세션의 `journal verify` 추론 축이 반드시 잡는다. "세션이 죽는다"는 보증하지 않으며(그쪽을 고르면 파이프라인 정지 Risk가 실현된다) 그 세션 내 지연을 잔여 5의 일부로 등재 |
| B5 | G3 단언 2는 *일관성*만 증명하고 *정확성*은 증명하지 않는다 — 두 파서가 똑같이 틀려도 통과 | test HIGH | 2b를 **양쪽 파서 × 고정 기대값**으로 확장(fixture에 리터럴로 박아 둘 다 틀리면 둘 다 실패). `next_chunk` 선재 divergence의 정확성 판정은 **잔여로 명시** |
| B6 | "CL-5 4번째 재발"이라 적고 근거는 3건만 인용 | test MEDIUM | 계수 근거 4건을 명시(① 최초 CL-5 ② M3 ③ M4 ④ 이번)하고 "재발"의 기준이 파일 동일이 아니라 **결함 형태 동일**임을 적음 |
| B7 | `content_hash`는 read 이후 검출일 뿐 write 시점 보호가 아니다 | invariant MEDIUM | DD6.3에 write 측 장치를 정확히 기술 — `O_APPEND` 단일 버퍼가 주는 것은 *레코드 원자성*이지 매체 무결성이 아니며, 손상 검출은 read 측 그물이 담당. **write-시점 매체 보호를 주장하지 않는다** |

**기각한 축(재지적)**: lint를 `/mccp:pr` 강제 게이트로 승격(→ **UI3** 범위 밖, Task 7 "범위 밖" 절에 이미 명시) · G5가 PR 게이트 안에서 반증 불가(→ §G5 조건성 + Validation-SHIP 분리가 round 6의 흡수) · `getRoot()` 같은 간접 형태를 lint가 못 잡음(→ **잔여 9**, round 7에서 등재) · G5의 OR 게이트(→ round 6 흡수로 단일 체크박스 + 미달 쪽 양성 산출물 3종) · receipt 부재로 `/mccp:pr`에 anchor가 없음(→ **잔여 8**, 사실이며 설계상 fail-closed).

### Round 9 흡수 (2축) + 판정 분산의 직접 증거

Round 8 흡수본(`plan_hash 63146d1b…`)으로 9라운드를 돌렸다. **security는 2라운드 연속 findings 0으로 pass**했으나 architect가 pass → fail로 되돌아갔고, quorum 3 미충족으로 `divergent`.

| # | 지적 | 출처 | 흡수 |
|---|---|---|---|
| C1 | Validation §10이 lint의 **exit 0만** 확인해 매니페스트 대조(`--assertions`)를 통과 경로에 넣지 않았다 — 빈 test 파일은 `node --test`가 0개 test로 성공하므로 §3도 못 잡는다 | test HIGH | **Validation §11 신설** — `--assertions --json`을 직접 호출하고 **absent 0**을 요구. Acceptance에도 별도 항목으로 추가 |
| C2 | Task 2 Validate가 호출하는 `state/tests/journal-store.test.js`가 Files to Change에 없다 | architect MEDIUM | CREATE 항목 추가(B1과 같은 형태의 누락) |

**나머지 8건은 흡수하지 않는다. 이 라운드가 그 이유를 스스로 보여준다.**

- **invariant 5건 전부가 "코드가 아직 없다"** 였다 — *"Current state-writer.js lines 614-628 has zero degraded mode logic"* · *"session-end.js lines 381-382 still have the pattern"* · *"neither mechanism exists yet"* · *"Task 7 axis 2 lint doesn't exist yet"*. 이 범주는 아래 §L2 Review Absorption이 라운드 2·5에서 이미 기각했고 패널 자신도 그때 수용했던 것이다. CL-5를 CRITICAL로 다시 든 것은 **plan의 GROUND 발견을 plan의 결함으로 되돌려 세는 것**이며 라운드 4에서 같은 근거로 기각됐다.
- **architect는 MEDIUM 3건만으로 `verdict=fail`을 반환했다.** 리뷰어 계약은 *"Any HIGH/CRITICAL finding means verdict=fail"* 과 *"pass ONLY when you could not find a defect"* 를 함께 적어 MEDIUM-only의 처리를 규정하지 않는다 — 계약 자체의 미정의 구간이다. 그리고 그 3건 중 둘(파서 비대칭 · 경로 바인딩)은 **plan이 §G3 주의와 잔여 9로 이미 선언한 한계**다. 같은 리뷰어가 round 8에서는 같은 한계를 보고 findings 0으로 pass했다.

즉 round 8→9의 판정 변화는 **plan 변경 때문이 아니다**(변경은 흡수 7축이고 전부 더 엄격해지는 방향이었다). PRD가 "판정 위치만 바꿔도 결과가 흔들린다"고 적은 현상의 가장 직접적인 실측이며, 계약의 MEDIUM-only 미정의 구간이 그 진동을 키운다 — 둘 다 diverse-agent-review PRD 소관이다.

### Round 10 흡수 (5축 — architect·security 동시 pass 2회차, 실결함 3건 신규)

Round 9 흡수본(`plan_hash e28a0806…`)으로 10라운드를 돌렸다. **architect·security 모두 findings 0으로 pass**(round 8에 이어 2회차, security는 3라운드 연속)했고 coverage 4/4·malformed 0이었다. test·invariant가 남아 quorum 3 미충족으로 `divergent`. 라운드 전문은 [plan-review-multi-session-work-loop-m5.md](../reviews/plan-review-multi-session-work-loop-m5.md)가 소유한다(canonical slug 파일 — rounds 1~9는 기존 `plan-review-multi-session-work-loop.md`).

| # | 지적 | 출처 | 흡수 |
|---|---|---|---|
| D1 | **Task 0의 Validate가 `single-writer-lint.js --assertions`를 호출하는데 그 파일은 Task 7이 CREATE한다 — Task 0이 실행 불가** | test **CRITICAL** | **실결함 확인.** R8의 B1과 같은 형태의 순환 의존이며, B1 흡수가 *산출물* 축(매니페스트 CREATE)만 닫고 *도구* 축을 남겼다. 책임을 시점으로 분할 — Task 0은 외부 도구 0개의 **매니페스트 자체 정합성**(부재·항목 수·필드·id 중복 4단언)만, `--assertions` 구현은 Task 7, `absent 0` 강제는 Validation §11(이미 존재하는 구현-후 게이트) |
| D2 | Task 0 Validate가 Tasks 1~8의 test 파일도 요구한다 | test HIGH | D1과 동근. Task 0 시점의 test 부재는 **정상**이며(매니페스트 설계 의도가 "아직 없는 단언 목록 출력"), 대조를 Task 0에서 떼어내면서 함께 해소 |
| D3 | degraded stickiness가 **프로세스 경계**를 넘는지 단언되지 않는다 — 단일 프로세스 test는 모듈 스코프 변수 구현과 디스크 마커 구현을 구별 못 한다 | test MEDIUM | **타당.** sticky의 근거는 디스크 `.degraded`이고 실제로 구간을 가로지르는 것은 세션(=프로세스)이다. Validate **6b** 신설 — `execFileSync`로 자식 node를 띄워 직접 경로·저널 무-append를 부모가 단언, `--reseed` 후 복귀도 새 프로세스로 확인. 모듈 스코프 캐시 구현이면 이 단언이 실패한다 |
| D4 | 세 호출부가 `resolveHandoffRoot`를 **실제로 호출**하는지 검사가 없다 — no-op 래퍼가 전 검사를 통과한다 | test MEDIUM | **타당.** Task 8이 새 export를 만들면서 호출부가 안 쓰는 경우를 (a)인자 전달·(b)`process.cwd()` 아님 어느 쪽도 못 잡는다. 축 3에 **(c)** 추가 — 같은 스코프에 `resolveHandoffRoot(` 호출이 있고 그 반환이 전달 식별자에 바인딩. 부정 fixture **(d2)** 신설(`ctx.projectRoot` 직접 전달 = `projectRoot=''` 구멍이 남은 no-op 수정). 한계는 (b)와 동일하므로 **잔여 9**에 양성 방향도 포함 |
| D5 | G3이 정확성을 증명하지 않는다 · `Validation-SHIP`이 PR을 기계적으로 막지 않는다 | test HIGH · invariant HIGH ×2 | **둘 다 plan이 이미 아는 한계였으나 산문에만 있었다** — Task 3 Validate 2b 말미와 §G5 조건성·Task 7 "범위 밖" 절. 잔여 목록에 없으니 리뷰어가 매 라운드 *새 결함*으로 재발견한다. **잔여 10**(G3 = 동등성이지 정확성 아님)·**잔여 11**(SHIP은 advisory — UI3 범위 밖이되 미달은 non-canonical status로 아카이브 거부라는 자국을 남김)로 승격 |

**기각한 축(재지적)**: invariant MEDIUM 3건 — degraded 무-알림(→ **잔여 5** + DD6.1의 SessionStart `<system-reminder>` 표면화) · advisory 락 창(→ **잔여 4**) · `next_chunk` divergence 미해소(→ **G3 주의** + 신설 **잔여 10**). 셋 다 plan이 선언한 한계의 재진술이며, §L2 Review Absorption 표의 R5 항목이 같은 근거로 이미 기각했다.

### Round 11 흡수 (1축) + 패널 종료

Round 10 흡수본(`plan_hash 105a6844…`)으로 11라운드를 돌렸다. **architect가 pass → fail로 되돌아갔고**(round 10에 이어 두 번째 진동), security는 **4라운드 연속 pass**, test·invariant는 fail. quorum 3 미충족으로 `divergent`.

| # | 지적 | 출처 | 흡수 |
|---|---|---|---|
| E1 | **레코드는 `session_id`·`prev_session_id`를 요구하고 `update()` 시그니처는 동결인데, 그 값의 취득 경로가 plan 어디에도 없다** | architect **CRITICAL ×2** | **실결함 확인.** DD2는 *순서의 원천*만 답하고 *취득 경로*는 답하지 않았다. **DD12 신설** — 세 필드를 전부 기존 부품에서 고정(`resolveSessionKey` env precedence · `session-ledger.created_at` + `ts-fallback` · `prev_session_id`는 **저널 tail**에서 파생). `prev_session_id`를 ledger가 아니라 저널에서 뽑는 근거(타 worktree 동시 세션이 시간상 더 가까울 수 있다)를 명시하고, `resolveIdentity`를 순수 함수로 분리해 Task 1 Validate 단언 4종(f~i)으로 반증 가능하게 만들었다. `'unknown'` 세션은 기록하되 A4 경계에서 제외(단언 a2) |

**기각한 축(재지적)**: architect HIGH 1건(CL-5 skip이 "결함"과 "해당 없음"을 구별 못 함 → SHIP-2 **3-state**가 정확히 그 판별자이며 Task 8이 이미 명세) · invariant CRITICAL 3건 + HIGH 4건(receipt 부재 → **잔여 8** · SHIP advisory → **잔여 11** · 마커 write 실패 → **DD6.1 책임 2층 표** · lint aliasing → **잔여 9** · Task 0 순환 의존 → **R10 D1에서 이미 해소**, 리뷰어가 흡수 전 상태를 읽었다) · test HIGH 3건 + MEDIUM 1건(G2 tombstone 배제 단언 → Task 4 Validate (c) · CL-5 호출부 검증 → Task 7 축 3 + Task 8 (e) · Validation §11 → plan에 존재하나 리뷰어가 *"plan excerpts로는 확인 불가"* 라고 스스로 적었다 — 772행 plan을 low-effort로 완독하지 못한 것).

**패널을 여기서 종료한다.** 11라운드 동안 **3명이 동시에 pass한 적이 없다**(최선은 round 8·10의 2 pass). 라운드 10→11의 변화는 plan이 나빠져서가 아니다 — 흡수는 실결함 3건을 닫고 잔여 2축을 명시했으며 전부 더 엄격해지는 방향이었는데, 그 사이 architect가 pass에서 fail로 뒤집혔다. round 8→9에서 관측한 것과 **같은 진동의 3회차**이며, round 11의 기각 사유 다수가 *"흡수 전 상태를 읽었다"* · *"plan을 끝까지 읽지 못했다"* 인 것이 원인 축을 가리킨다(§Round 7 흡수의 리뷰어 등급 항 — `CLAUDE_CODE_SUBAGENT_MODEL: "haiku"` + `effort:'low'`). 이는 plan의 결함이 아니라 **패널 자체의 계측 한계**이고 diverse-agent-review PRD 소관이다. 라운드를 더 도는 것의 기대값은 음수로 판단해 **미승인 상태로 진행**한다(잔여 8).

## L2 Review Absorption — 기각한 지적 (사실 대조 결과)

패널이 제기한 지적 중 **둘은 사실이 아니어서 기각**한다. 같은 지적이 재발하지 않도록 대조 근거를 남긴다.

| 지적 (라운드 2) | 판정 | 대조 근거 |
|---|---|---|
| invariant: *"`evidence-claim.js`가 이 worktree에 존재하지 않는다. M3가 머지되지 않았으므로 M5는 없는 코드에 의존한다"* | **기각 — 사실 오류** | `plugins/mccp/scripts/state/evidence-claim.js` 존재(16,509B), 커밋 `6ccf345 fix(mccp): address M3 pre-ship code review findings`. M3는 머지 완료이며 PRD Delivery Milestones의 M3 status도 `complete`다. 리뷰어가 `lib/` 하위만 탐색해 `state/` 하위를 놓친 것으로 보인다 |
| invariant: *"CL-5 표에 2행뿐인데 본문은 3곳이라 적었다"* | **기각 — 사실 오류. 단 표현은 수정** | 표는 처음부터 3행이었다(`session-end.js:381`·`:382`·`session-start.js:748`). 다만 표가 **리스트 아이템 안에 들여쓰기**돼 있어 렌더러에 따라 표로 읽히지 않는다 — 오독의 원인이 이쪽에 있으므로 표를 리스트 밖으로 옮겼다 |
| invariant(R3): *"receipt anchor가 클론 경계에서 끊긴다 — SoT가 working-tree 전용 저널로 옮겨가는데 receipt는 git-tracked다"* | **기각 — 전제 오류** | receipt는 `plan_hash`/`receipt_hash`/`subject_hash`에 anchor되며 **저널 레코드를 참조하지 않는다**. M5는 *상태*의 SoT만 옮기고 *증거*의 SoT는 `.claude/receipts/`에 그대로 둔다(§범위 경계 1행: "저널은 receipt를 대체하지 않는다"). 신설 receipt 필드 0개이고 `hash.js` 무변경이므로 검증 입력이 바뀌지 않는다. 클론 후 receipt 검증은 M5 전후로 동일하게 성립한다 |
| security(R4): *"`handoff-items`가 `repoRoot` 없이 호출된다"* (HIGH) | **기각 — 현재 코드 상태의 재진술** | 그것이 바로 이 plan의 GROUND 발견이자 Task 8이 고치는 대상이다(3곳 표). plan이 도입한 결함이 아니라 plan이 닫는 결함이므로 plan 결함으로 계상하지 않는다 |
| security(R4): *"Validation §10 lint는 post-ship이라 늦다"* | **기각 — 사실 오류. 단 지적의 나머지 절반은 흡수** | Validation은 `/mccp:prp-implement`의 검증 루프에서 도는 것이지 ship 후가 아니다(PR 생성 전). 다만 같은 finding의 *"lint가 인자 존재만 보고 값의 정확성은 안 본다"* 는 타당해서 축 3에 `process.cwd()` 리터럴 거부 조건을 추가했다 |
| invariant(R3): *"G5 미확인 시 `forward-only`로 두고 ship을 허용하는 것은 fail-open"* | **부분 기각 — 다만 결과를 기계화** | PRD UI9는 `computed`만 완료 근거로 인정하고, §대형 코호트 제약은 "분할이 아니라 **목표 미달을 정직 보고**"를 요구한다. 즉 미달 ship은 PRD가 지정한 처리이지 우회가 아니다(M4 선례). 다만 "조용한 수용" 우려는 타당하므로 §G5의 조건성에 **PRD status를 순정 `complete`로 적지 않는다**를 추가해 미달이 대시보드·`/mccp:archive-complete` 양쪽에 자국을 남기게 했다 |

| invariant(R5): *"degraded 보호는 advisory 락에 의존하므로 예방이 아니라 탐지다"* · *"ledger 부재 시 G2가 저널 수명 안에서만 성립한다"* | **기각 — 이미 선언한 잔여의 재지적** | 각각 **잔여 4**(락은 advisory · 무조건적 상호배제 미주장)와 **DD11 마지막 항**(ledger 부재 시 tombstone 0 + loud warn)이 plan 본문에 명시한 한계다. 리뷰어가 그 한계를 *발견*한 것이 아니라 plan이 적어둔 것을 다시 적었다. 한계를 없애려면 락을 mandatory로 바꿔야 하는데 그것은 게이트 강도 변경(UI3 범위 밖)이고, ledger를 복구하는 것은 증거 축(§3.12) 문제다. **선언된 잔여를 결함으로 계상하면 정직하게 한계를 적은 plan이 숨긴 plan보다 불리해진다** |
| invariant(R5): *"Task 8의 수정이 아직 버전 관리에 없다"* | **기각 — plan의 정의상 그렇다** | plan은 아직 수행하지 않은 작업을 기술하는 문서다. 아래 test 리뷰어의 동류 지적과 같은 처리 |

test 리뷰어가 라운드 1·2에서 반복한 *"test 파일이 아직 존재하지 않아 검증 불가"* 계열도 plan 결함으로 수용하지 않는다 — plan은 아직 수행하지 않은 작업을 기술하는 문서이므로, 그 부재를 결함으로 세면 어떤 plan도 통과할 수 없다. 다만 그 밑에 깔린 요구(단언을 구체적으로 고정하라)는 유효하므로 Task 1·3·4·6·7·8의 Validate에 단언 항목을 열거로 못박았다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더 UI가 없어 **어떤 impeccable 명령도 invoke하지 않으며**, 아래는 implementer용 체크리스트다. M5는 렌더 표면을 도입하지 않으므로 implement 단계에서도 `renderingSurface` selector가 refine/discovery를 recommend로 강등할 공산이 크다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## External Research Provenance

- Source PRD: .claude/prds/multi-session-work-loop.prd.md
- References section sha256: 1aaa7924f4e1ebed8993b242c00788e1c0ad84319463ff89f3a29625b33aa880
- Stamped at: 2026-08-10T13:58:21.195Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.
