# Plan: metric-boundary-unification (orchestrator-step-wiring M1)

**Source PRD**: `.claude/prds/orchestrator-step-wiring.prd.md`
**Selected Milestone**: M1 — metric-boundary-unification
**Complexity**: Medium

## Summary

A1(무인 완주율)이 읽는 이벤트 corpus를 worktree-local에서 **git common dir 공유 위치**로 올려
어느 위치에서 derive를 돌려도 같은 값이 나오게 한다. 분모의 granularity 혼재는 producer가
`work_unit_kind`를 기록하고 reader가 PRD 단위를 제외해 정합화한다. 그 값을 `/mccp:work` 진입에
노출하고, 계산 단위(작업 단위)와 어긋난 A1 라벨을 정정한다. 계측 경로의 어떤 실패도 체인을
멈추지 않는다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 이 PRD의 M1(metric-boundary-unification)을 계획한다 | direction |
| UI2 | 분모 granularity는 producer가 work_unit_kind를 이벤트에 기록하고 reader가 PRD 단위를 분모에서 제외하는 방식으로 정합화한다. 기록은 남기고 레거시 이벤트는 unknown으로 병기한다 | constraint |
| UI3 | 집계 경계는 이벤트를 git common dir 공유 위치에 쓰고 기존 이벤트를 1회 마이그레이션해 성립시킨다. 읽는 쪽은 공유 위치와 worktree-local을 함께 읽는다 | constraint |
| UI4 | MVP는 M1 단독이다. M2인 halt 지점 기록은 이번 범위가 아니다 | exclusion |
| UI5 | 완주의 정의를 바꾸지 않는다. PR 번호 생성 시점 그대로다 | exclusion |
| UI6 | 계측 경로의 기록 실패는 체인을 멈추지 않으며 조용히 삼키지 않고 loud stderr로 표면화한다 | constraint |
| UI7 | work.md의 224행 대 715행 파일명 불일치는 이 PRD 밖이다 | exclusion |
| UI8 | A1 목표치는 이번에 정하지 않는다. 값이 산출되고 안정되게만 만든다 | exclusion |
| UI9 | 값이 어딘가에 표시되지 않으면 M1은 완료가 아니다 | constraint |
| UI10 | 이벤트 corpus를 git-tracked로 승격하는 결정은 이 PRD가 단독으로 내리지 않는다 | exclusion |

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~50k.

패널이 낸 26건 중 이 계획이 흡수한 축과, 흡수하지 않은 축의 사유를 함께 적는다.

### 흡수한 findings

| # | 관점 | 지적 | 이 계획의 처리 |
|---|---|---|---|
| F1 | architect · explorer (HIGH 2건) | `derive/sources/worktrees.js`의 `scanWorktrees()`가 "reader가 worktree 순회" 방식의 완성 패턴으로 이미 존재한다. 재사용을 검토하지 않으면 해결된 문제를 다시 푸는 것이다 | **검토했고 채택하지 않는다.** 근거는 DD1 — 그 모듈의 헤더가 `derive()`를 spawn-free 계약으로 못박고 git spawn을 opt-in gate 뒤에 두었으므로, 순회 방식은 기본 derive에서 **꺼진 채로** 남는다. 그러면 "어디서 돌려도 같은 값"이 기본 경로에서 성립하지 않는다 |
| F2 | architect (HIGH) | `session-activity.js`는 단일 repoRoot 구조라 집계 경계 상향에 seam이 없다 | Task 2가 그 seam을 만든다 — 기존 `candidates` 배열에 공유 위치를 **한 항목 더** 얹는다. 새 알고리즘이 아니라 CL-5가 이미 만든 다중 디렉토리 + `event_id` dedupe 골격의 확장이다 |
| F3 | architect (HIGH) | 여러 worktree scan 결과를 병합할 때 union-before-compute와 union-of-computed 중 무엇인가가 A1 **값 자체**를 바꾼다 | DD1이 그 질문을 **소멸시킨다.** 공유 위치는 디렉토리가 하나이므로 병합 함수가 존재하지 않는다. 이것이 순회 방식 대비 두 번째 우위다 |

<details><summary>나머지 9건 (F4–F12)</summary>

| # | 관점 | 지적 | 이 계획의 처리 |
|---|---|---|---|
| F4 | test (HIGH) | 지표 1(위치 의존성)이 수동 3곳 비교로만 정의돼 회귀 가드가 없다 | Task 8이 fixture 기반 기계 단언으로 옮긴다 — 서로 다른 3개 cwd에서 같은 값이 나오는 것을 test가 단언한다 |
| F5 | test (HIGH) | fail-open 불변식(UI6)에 test oracle이 없다 | Task 8이 강제 실패 주입 하에서 배너 경로가 exit 0을 유지하고 stderr에 사유가 남는 것을 단언한다 |
| F6 | test · explorer (MEDIUM) | 라벨 정정은 `msw-metrics-render.test.js`를 확장해야지 산문 준수로 두면 안 된다 | Task 6이 그 파일에 단언을 넣는다 |
| F7 | architect (MEDIUM) | fail-open 경계가 코드 레벨인지 명령 본문 산문인지 불명. `scanWorktrees`의 `SCAN_TIMEOUT_MS=3000` 선례를 따라야 한다 | Task 7의 배너 CLI가 코드 레벨 타임아웃을 갖고, work.md는 그 CLI의 종료코드만 본다. 산문에 의존하지 않는다 |
| F8 | security (MEDIUM) | 순회 방식은 외부 명령이 보고한 경로를 재검증해야 한다 | **부분 흡수.** DD1이 *reader* 표면은 없애지만 Task 3의 마이그레이션은 `git worktree list`를 실제로 연다 — L2 security가 이 모순을 지적했고, Task 3에 경로 재검증(repo-root 하위 ∧ 이벤트 디렉토리 실재)을 넣었다. 검증 규칙의 전수형은 backlog |
| F9 | security meta-gap | fail-open stderr가 절대경로를 흘리면 cwd 마스킹 노력을 무효화한다 | Task 7이 stderr 메시지의 경로를 repo-relative로 축약한다 |
| F10 | explorer (HIGH) | `computeA1`은 성숙한 계약이고 원인이 아니다. 손대면 잘못된 표적이다 | `computeA1`은 **변경 0**이다. Files to Change에 없다 |
| F11 | explorer (MEDIUM) | 배너 삽입 지점은 기존 classify 출력 줄이며 새 Phase가 필요 없다 | Task 7이 그 줄 직후 한 줄을 더한다 |
| F12 | security (LOW) | work_unit 슬러그가 파일 경로 구성에 쓰이면 path-injection 표면이 된다 | 이 계획은 슬러그를 **파일명에 쓰지 않는다**. in-memory 키와 배너 문자열뿐이고, 파일명이 되는 것은 sanitize를 거친 session id다 |

</details>

### 흡수하지 않은 findings (사유 명시)

| # | 관점 | 지적 | 미흡수 사유 |
|---|---|---|---|
| G1 | architect (MEDIUM) · explorer meta-gap | M2의 record-step 배선과 C10이 work.md를 공유해 충돌 위험 | **M2는 UI4로 범위 밖.** M1의 배너는 `work.md` 88행 근처이고 UI7이 지목한 224행/715행과 라인 반경이 멀다(실측 확인). M1 안에서의 충돌은 없다 |
| G2 | security (MEDIUM) | halt-step payload가 STATE.md를 거쳐 재주입되는 prompt-injection 채널이 될 수 있다 | **M2 축이라 범위 밖(UI4).** M1의 배너가 출력하는 work_unit은 `SLUG_RE`로 제약된 값이라 이 축에 해당하지 않는다 |
| G3 | architect · explorer meta-gap | `MCCP_MULTI_SESSION_SCAN` 토글을 재사용할지 새로 만들지 결정해야 한다 | **재사용하지 않고 그 종류를 새로 만들지도 않는다.** DD1에 순회가 없어 scan gate가 필요 없다. 대신 producer 경로 변경의 되돌림 수단으로 토글 하나만 둔다(DD2) |

<details><summary>나머지 5건 (G4–G8)</summary>

| # | 관점 | 지적 | 미흡수 사유 |
|---|---|---|---|
| G4 | security (LOW) | JSONL에 무결성 검사가 없어 위조·복사된 이벤트가 A1을 조작할 수 있다 | 기존 성질이며 M1이 악화시키지 않는다. 위조 방지는 CLAUDE.md 3.12가 이미 "같은 권한의 행위자는 막지 못한다"고 인정한 범위다. 별도 축으로 backlog |
| G5 | security (LOW) | repo-wide 읽기에 lock 논의가 없어 append 중 잘린 줄을 읽을 수 있다 | per-session 샤딩이라 동시 writer가 같은 파일을 쓰지 않는다(공유 위치로 모아도 파일명은 여전히 세션별이다). malformed line은 기존 per-line 격리가 삼키고 `invalid_count`로 병기된다 — 침묵하지 않는다 |
| G6 | architect (LOW) | A1만 고치면 `METRICS_META` 나머지 7개의 같은 어긋남이 미감사로 남는다 | **A1만 고친다.** UI9는 라벨 정정을 요구하고 범위는 PRD Open Question 5가 열어두었다. 전수 감사는 measurement-design.md 대조가 필요한 별도 작업이라 backlog |
| G7 | test (LOW) | 지표 4(halt 기록률)가 M1에서 검증되지 않음을 명시해야 한다 | 명시한다. Acceptance에 지표 4는 없다 — M2 소유(UI4) |
| G8 | test (MEDIUM) | 삭제된 worktree 이벤트의 test 전략이 없다 | DD1이 그 질문을 **구조적으로 해소**한다. 이벤트가 worktree 밖에 살므로 worktree 삭제와 무관하다. Task 8이 그 성질을 단언한다 |

</details>

## L2 Panel Absorption (R0 — 4/4 fail)

L2 반증 패널이 R0에서 **4/4 fail** · 9 blocking을 냈다(`.claude/reviews/plan-review-orchestrator-step-wiring.md`,
wall-clock 306초). CRITICAL 1 + HIGH 4를 이 자리에서 흡수하고 MEDIUM 6 + LOW 1을 backlog로
이연했다(§3.14). 흡수의 실체는 **DD7 하나** — 나머지는 그 파생이다.

| 관점 | severity | 지적 | 처리 |
|---|---|---|---|
| architect | **CRITICAL** | 실 producer 둘이 `repoRoot`를 항상 명시로 넘겨 새 분기가 **도달 불가**. `state/cli.js`는 Files to Change에 부재 | **DD7** — 공유 위치를 repoRoot의 파생물로. `state/cli.js` 추가. Task 8(1)이 도달성을 직접 단언 |
| architect | HIGH | `isCrossLocation = di > 0` — 맨 앞 디렉토리는 전건 수용이라 legacy 이벤트가 dedupe를 빠져나간다 | **Task 2** — 공유 위치를 `di>0`으로. **Task 3** — 마이그레이션이 legacy 복합키로도 접는다 |
| security | HIGH | `.claude`/`.git` 앵커가 독립이라 조상 저장소의 git dir로 해소될 수 있다 | **DD7** — walk-up 제거. `root/.git`만 본다. Task 8(3)이 회귀 가드 |
| test | HIGH | `session-activity.test.js`가 repo 내부 fixture로 정확 수치를 단언 — walk-up이 실 corpus를 끌어와 깬다 | **DD7**이 원인 제거(fixture에 `.git` 부재 → 경로 불변). Validation·Files to Change에 그 test 추가 |
| invariant | HIGH | 해소 기준(repoRoot 대 cwd)이 고정돼 있지 않다 | **DD7** — 기준은 항상 repoRoot. cwd 경로가 구조적으로 부재 |
| invariant | LOW→흡수 | `evictLRU` global cap이 저장소 전체에 걸려 과거 완주 이벤트를 조용히 삭제 | **Task 3** — 공유 위치에서 evict 미호출, cap 초과는 loud stderr만. severity를 올려 흡수한 이유는 결과가 A1 baseline의 소급 파괴이기 때문이다 |

`prd_granularity_excluded_count > 0`을 완료 조건에서 뺀 것(test MEDIUM)과 되돌림 수단의 실효
단언(invariant MEDIUM), 마이그레이션 경로 재검증(security MEDIUM)은 부분 흡수했고, 각 축의
전수형은 backlog에 남겼다.

### R1 — 4/4 fail · HIGH 6

R1은 두 가지를 동시에 보여줬다. **첫째, R0 흡수가 그대로 다음 라운드의 표적이 됐다** — §3.16이
경고한 전이가 이 계획에서 실측됐다. 마이그레이션 경로 재검증(R0 security MEDIUM 흡수)은 수집
대상을 거절하는 규칙이 됐고, evict 규칙(R0 invariant LOW 흡수)은 locus가 틀렸다. **둘째, R0가 못 본 전제 결함을 찾았다** — corpus가 A1 전용이 아니라는 사실이다.

| 관점 | severity | 지적 | 처리 |
|---|---|---|---|
| architect | HIGH | 격리 선례 오독 — 주석은 "repo **or worktree**"이고 **B2가 피해자**다 | **DD1 정정** + **DD8** |
| architect | HIGH | `sessions`가 스캔 루프 밖(`:117`)이라 전 worktree 세션이 concurrent로 pair. `msw-metrics-b2.test.js`는 `.git` 없는 fixture라 **green 유지** | **DD8** — B2 축 이벤트가 이동하지 않으므로 오염 자체가 없다 |
| architect · security · invariant | HIGH ×2 + MEDIUM | evict 완화의 locus 오류 — 실제 삭제는 `appendEvent:299`의 무조건 호출 | **Task 1** — 규칙을 `appendEvent`로 옮김 |
| security | HIGH | 마이그레이션 경로 규칙이 형제 worktree를 전부 skip. Validation 4가 0/0으로 vacuous 통과 | **Task 3** — 기준을 repo-root에서 **common dir**로 |
| invariant | HIGH | DD3+DD6이 `num > den`을 만들고 `computeA1`에 상한이 없어 **A1 > 100%를 `computed`로 인증** | **Task 5** — 분자에도 같은 필터. `num ≤ den`이 reader에서 구조 보장 |
| architect | MEDIUM | `appendEvent` 호출자가 2개가 아니라 7개 | **DD8** — 나머지 5개는 비-A1 kind라 경로 불변. 전수 감사는 backlog |
| security | MEDIUM | `work_unit_kind` 판정 술어 미정의 | **Task 4** — 규칙 고정 |
| test | MEDIUM | `METRICS_META.desc`가 dead field — 렌더 test로 반증 불가 | **Task 6** — test는 `name`에만 건다 |
| invariant | MEDIUM | 토글 오타가 신규 동작을 켠 채 남긴다 | **Task 1** — 열거 밖 값은 off + loud warn |

나머지 MEDIUM 4 + LOW 2는 backlog로 이연했다(증거 동봉).

**R2는 마지막 라운드다** (cap 3). 사용자 결정에 따라 R2 결과와 무관하게 진행하며, 비수렴이면
`MCCP_REVIEW_SINGLE_PASS`로 완화한다 — verdict는 `divergent` 그대로 봉인되므로 cross-gate
dedupe가 열리지 않고 `/mccp:pr`에서 PR-Codex가 반드시 발화한다(§3.15).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 경로 해소 | `plugins/mccp/scripts/state/msw-events.js:223` | `discoverRepoRoot` — spawn 없이 `statSync` walk-up. 주석이 "`git rev-parse` spawn은 append마다 44ms라 hot path에 부적합"이라 명시 |
| 우선순위 | `plugins/mccp/scripts/state/msw-events.js:236` | `resolveEventsDir`의 명시 인자 우선 사슬. **DD7은 이 사슬에 후보를 더하지 않고 `repoRoot` 해소 뒤에 파생 단계를 얹는다** — 후보를 더하는 초안이 L2 CRITICAL의 원인이었다 |
| 다중 스캔 dedupe | `plugins/mccp/scripts/derive/sources/session-activity.js:87` | `candidates` → `canonical()` 정규화 → `scanDirs` → `seenEventIds`/`seenLegacyKeys`. 새 알고리즘 금지, 이 골격 확장 |
| Allowlist 확장 | `plugins/mccp/scripts/state/msw-events.js:56` | 필드는 emit 배선 **전에** allowlist에 넣는다. 없으면 `eventToJsonLine`이 조용히 버린다 |
| fail-open producer | `plugins/mccp/scripts/hooks/receipt-prompt.js:172` | try/catch + loud stderr + 절대 throw 안 함. UI6의 기존 형태 |
| 마이그레이션 | `plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js` | idempotent · dry-run · marker 기록 · resumable |
| 코드 레벨 타임아웃 | `plugins/mccp/scripts/derive/sources/worktrees.js:27` | `SCAN_TIMEOUT_MS = 3000` — fail-open 경계를 산문이 아니라 코드가 강제 |
| env 등록 | `plugins/mccp/scripts/lib/env-contract/registry.js:182` | 9열 행 형식. evidence는 실제 read site여야 lint L10 정방향을 통과 |
| 격리 test | `plugins/mccp/scripts/lib/tests/msw-events-path.test.js:54` | tmpdir 2개로 교차 계상 부재를 단언. **이 성질은 보존 대상**(DD1) |

## Design Decisions

### DD1 — 집계 경계는 공유 위치로 성립시킨다. 순회로 성립시키지 않는다

`git worktree list` 순회안은 이미 완성 패턴이 있고(F1) 그래서 매력적으로 보이지만, 그 패턴을
가져오는 순간 M1의 목표가 기본값에서 성립하지 않는다. `worktrees.js` 헤더가 그 이유를 직접
적는다 — "derive() is contracted spawn-free under a strict perf budget, so the git spawn sits
behind an opt-in gate ... the bare derive() call leaves it OFF". A1을 그 gate 뒤에 두면
`derive/cli.js run`의 기본 호출은 여전히 worktree-local 값을 낸다. 지표 1이 요구하는 것은
"opt-in하면 같은 값"이 아니라 "어디서 돌려도 같은 값"이다.

공유 위치는 셋을 동시에 준다. (a) spawn 0 — `.git`이 파일이면 그 안의 `gitdir:` 행을 읽고 그
디렉토리의 `commondir` 파일을 resolve하면 끝이고, 디렉토리면 그 자체다. 전부 `fs` 연산이라
spawn-free 계약이 무손상이다. (b) 병합 함수가 없다 — 디렉토리가 하나이므로 F3의 union 질문이
성립하지 않는다. (c) 삭제된 worktree의 이벤트 소실 문제가 구조적으로 닫힌다 — 이벤트가 worktree
밖에 살기 때문이다.

**초안이 여기서 선례를 오독했다 (L2 R1 architect HIGH).** 초안은 `msw-events-path.test.js:54`가
지키는 성질을 "다른 **저장소**의 이벤트가 섞이지 않는다"로 인용하고, common dir은 같은 저장소의
worktree만 공유하므로 안전하다고 결론했다. 그 인용이 틀렸다. 실제 주석은
`plugins/mccp/scripts/derive/sources/session-activity.js:93-99`에서 **"a DIFFERENT repo *or worktree*"** 라 적고 피해자로 **B2의 분모와 guard 커버리지**를 명시한다. test 제목도 `two worktrees do not cross-count each other
events (B2 denominator integrity)`다. 즉 그 선례가 지키는 것은 **worktree 수준 격리**이고,
공유 common dir은 그것을 의도적으로 파괴한다 — A1만이 아니라 **같은 corpus를 읽는 모든 소비처**에
대해서다.

이 오독이 남긴 구멍은 DD1을 뒤집어서가 아니라 **범위를 좁혀서** 닫는다 — DD8을 보라. A1 축
이벤트만 공유 위치로 보내면 B2가 읽는 `session_start`/`session_end`는 worktree-local에 그대로
남고, 위 선례가 지키는 성질이 **무손상으로** 보존된다.

### DD2 — 되돌림 수단은 토글 하나. 새 scan gate는 만들지 않는다

producer 경로가 바뀌므로 되돌림 수단이 필요하다(hook 경로 변경의 배포 위험). `MCCP_MSW_EVENTS_SHARED`
하나를 둔다 — default on, off면 공유 위치 해소를 건너뛰고 이전 동작(worktree-local)으로 복귀한다.

**읽는 쪽은 이 토글을 읽지 않는다.** reader가 공유 위치를 계속 읽는 것은 무해하고(없으면 빈
디렉토리), 토글을 양쪽에 걸면 producer가 공유 위치에 쓴 뒤 토글을 끈 사람이 그 이벤트를 잃는다.
G3가 물은 `MCCP_MULTI_SESSION_SCAN` 재사용 문제는 순회가 없으므로 발생하지 않는다.

### DD3 — granularity는 producer가 기록하고 reader가 제외한다

`receipt-prompt.js`는 emit 시점에 `command_args`를 들고 있으므로 인자가 PRD 경로인지 그 자리에서
확실히 안다. 새 필드 `work_unit_kind`(값은 `prd` 또는 `milestone`)를 allowlist에 넣고 emit한다.
reader는 값이 `prd`인 착수를 분모에서 **뺀다**.

**제외를 producer가 아니라 reader에서 하는 이유**: PRD Open Question 1이 "두 축을 분리해 각각
산출"을 선택지로 남겼는데, producer에서 emit을 막으면 그 문이 영구히 닫히고 PRD 단위 착수가 몇
건이었는지 사후 확인도 불가능해진다. 기록은 남기고 집계에서 뺀다.

**레거시 이벤트(필드 부재)는 분모에 포함하고 별도 카운터로 병기한다.** 슬러그 이름으로 추론하지
않는다 — milestone suffix 패턴은 휴리스틱이고, `.claude/prds/` 파일명 대조는 PRD 파일 자체가
branch마다 달라(실측: c0부터 c4까지의 PRD는 각 worktree에만 존재) 이 milestone이 없애려는
worktree 경계 문제를 판정 기준에 다시 들인다. "모른다"를 "milestone이다"로 접으면 조용한
오분류가 된다.

### DD4 — 착수와 완주의 키 비대칭을 숨기지 않고 수치로 낸다

실측이 PRD의 진단을 한 단계 밀어냈다. 착수는 `deriveDecisionId(command, args)`가 **인자 경로**에서,
완주는 `pr.md`가 같은 함수를 **branch 기반**으로 불러 파생한다. 두 키가 일치하는 것은 우연이며,
`env-contract-integrity`가 PRD 이름인데도 완주 기록을 받은 것이 그 증거다(branch 이름이 PRD
이름과 같았다).

따라서 DD3의 제외는 "착수 없는 완주"를 만들 수 있다. 그것을 조용히 두지 않고
`completion_without_startup` 카운터로 낸다 — `sealed_without_completion`의 선례와 같은 형태다.
**완주 producer는 건드리지 않는다**(UI5). M1은 비대칭을 관측 가능하게 만들 뿐 없애지 않으며,
그 수치가 크면 그것이 후속 축의 근거다.

### DD5 — 배너는 경량 경로를 쓰고 코드가 타임아웃을 강제한다

`derive/cli.js run` 전체는 실측 2.28초이고 9개 source를 전부 돈다. A1만 필요하므로
`scanSessionActivity`와 `computeMetrics`만 부르는 경량 서브커맨드를 둔다 — 실측 **0.13초**.

fail-open 경계는 **코드**에 둔다. 배너 CLI가 전역 try/catch를 갖고, 어떤 실패에도 exit 0으로
끝나며 stdout에 빈 문자열을 낸다. `work.md`는 그 stdout이 비었으면 배너 줄을 생략할 뿐이다.
산문("실패해도 진행하라")에 의존하지 않는다 — 이 저장소는 산문 강제가 불이행된 실측을 이미 갖고 있다.

**타임아웃은 in-process `setTimeout`으로 성립하지 않는다 (R2 흡수 — 초안의 메커니즘은 발화 불가였다).**
초안은 `a1`에 "자체 타임아웃(3000ms)"을 두고 `plugins/mccp/scripts/derive/sources/worktrees.js:27` `SCAN_TIMEOUT_MS`를 선례로 들었다.
그 상수는 `execFileSync`에 넘기는 **자식 프로세스** 경계이고, `a1`이 부르는 `scanSessionActivity`는
`fs.readdirSync`(`plugins/mccp/scripts/derive/sources/session-activity.js:131`) + `fs.readFileSync`(`:138`)의 **완전 동기 중첩 루프**다.
동기 루프가 이벤트 루프를 쥐고 있는 동안 `setTimeout` 콜백은 실행될 수 없으므로, 약속된 상한은
존재하지 않고 "어떤 실패에도 exit 0" 역시 **stall을 덮지 못한다** — 그 경우 exit 자체가 없다.
게다가 Task 1이 공유 위치에서 `evictLRU`를 빼므로 스캔 대상은 `GLOBAL_MAX_BYTES`(100MB)를
설계상 넘길 수 있고, 그 디렉토리를 **모든 `/mccp:work` Phase 0가 읽는다.** 즉 트리거는 이론이 아니다.

정정은 선례를 말로만 인용하지 말고 **그 형태 그대로 쓰는 것**이다 — `work.md`가 `a1`을
`execFileSync(..., { timeout: 3000 })`로 부른다(경계가 자식 프로세스이므로 동기 루프도 SIGTERM으로
끊긴다). 자식이 시간 안에 못 끝내면 부모는 그것을 빈 stdout으로 취급해 배너를 생략한다.
`a1` 자신은 타임아웃을 주장하지 않고 try/catch + exit 0만 책임진다 — 지킬 수 없는 보장을
CLI 계약에 적지 않는다.

### DD6 — computeA1은 변경 0이다

값이 위치마다 다른 원인은 계산이 아니라 **읽는 디렉토리**다. `computeA1`의 status enum과
producer-presence 이원 판정은 그대로 둔다. 새 status를 만들지 않는다.

### DD7 — 공유 위치는 repoRoot에서 파생한다. walk-up 하지 않는다 (L2 R0 흡수)

R0 패널이 이 계획의 초안을 네 관점에서 전부 반증했고, 네 지적이 **하나의 설계 오류**로 수렴했다.
초안은 공유 위치를 `resolveEventsDir`의 **독립 후보**로 두고 `opts.repoRoot` 뒤 우선순위에서
`.git`을 walk-up으로 찾게 했다. 그 배치가 넷을 한꺼번에 깨뜨렸다.

| L2 지적 | 초안의 결과 |
|---|---|
| architect CRITICAL | 실 producer 둘이 `repoRoot`를 **항상 명시**로 넘기므로(`receipt-prompt.js:194` · `state/cli.js:445`) 새 분기가 **도달 불가**. 구현해도 A1이 그대로 worktree-local로 남는다 |
| security HIGH | `.claude` walk-up(repoRoot)과 `.git` walk-up(common dir)이 **독립 앵커**라, `.claude`는 있고 `.git`은 없는 저장소가 **조상 저장소**의 git dir로 해소된다 |
| invariant HIGH | 해소 기준이 `repoRoot`인지 `process.cwd()`인지 계획 어디에도 고정돼 있지 않았다 |
| test HIGH | `session-activity.test.js:27`은 fixture를 **repo 내부**에 만들고 정확 수치를 단언한다. walk-up이 실제 저장소 corpus를 끌어와 그 test를 깬다 |

정정은 하나다. **공유 위치를 독립 후보가 아니라 `repoRoot`의 파생물로 만든다.**

```
opts.dir
  ↓ (없으면)
root = opts.repoRoot ?? discoverRepoRoot(opts.cwd)
  ↓ (root가 있으면)
  공유 활성 ∧ commonDirOf(root) ≠ null  →  <common>/mccp/msw-events
  그 외                                  →  <root>/.claude/state/msw-events
  ↓ (root가 없으면)
레거시 cwd 상대
```

`commonDirOf(root)`는 **`root/.git` 하나만** 본다. 부모로 올라가지 않는다. 이 한 줄이 넷을 닫는다.

- **CRITICAL** — 공유 위치가 `repoRoot`를 *대체*하는 것이 아니라 그것으로부터 *파생*되므로,
  producer가 `repoRoot`를 명시로 넘겨도 분기에 도달한다. 도달 불가 경로가 사라진다.
- **security HIGH** — `.git`을 repoRoot **안에서만** 찾으므로 조상 저장소에 닿을 방법이 없다.
  `.claude`는 있고 `.git`은 없는 저장소는 공유 위치가 `null`이 되어 worktree-local로 남는다 —
  안전한 방향의 실패이고, 그것이 곧 `MCCP_MSW_EVENTS_SHARED=off`의 동작과 같다.
- **invariant HIGH** — 기준이 **항상 repoRoot**다. `cwd` 기준 해소 경로가 구조적으로 존재하지 않는다.
- **test HIGH** — tmpdir fixture에는 `.git`이 없으므로 `commonDirOf`가 `null`을 내고 경로가
  기존과 **바이트 단위로 같다**. `session-activity.test.js`와 `msw-events-path.test.js:54`의
  격리 단언이 둘 다 무손상이다. 초안은 이 성질을 "우선순위를 뒤에 둬서" 얻으려 했고 그 대가가
  CRITICAL이었다. 파생 구조는 같은 성질을 대가 없이 준다.

### DD8 — 공유되는 것은 A1 축 이벤트뿐이다 (L2 R1 흡수)

R1 패널이 DD7의 남은 전제를 무너뜨렸다. **corpus는 A1 전용이 아니다.** 같은 sidecar를 B2 동시성
(`session_start`/`session_end`), 증거 충돌 taxonomy(`evidence_*`), findings remediation
(`remediation_pr`)이 함께 읽는다. 초안은 corpus 전체를 공유 위치로 옮기면서 A1 소비처만
열거했고, 그 결과 셋이 동시에 깨졌다.

| R1 지적 | 원인 |
|---|---|
| architect HIGH — 격리 선례 오독 | 주석이 지키는 것은 worktree 수준 격리이고 **B2가 피해자**다(DD1 정정 참조) |
| architect HIGH — 부수 소비처 무주인 | `sessions`는 스캔 루프 **밖**(`plugins/mccp/scripts/derive/sources/session-activity.js:117`)에서 만들어져 모든 `scanDir`의 세션을 합친다. 공유 위치에 전 worktree의 세션이 모이면 병렬 worktree 세션이 **어디서나 concurrent로 pair**된다 |
| — 그리고 test가 못 잡는다 | `msw-metrics-b2.test.js`의 fixture는 `.git` 없는 tmpdir이라 DD7상 공유 분기를 타지 않는다. 프로덕션 동작이 바뀌어도 suite는 green을 유지한다 |

**정정은 경계를 KIND로 긋는 것이다.** `appendEvent`가 공유 위치를 쓰는 것은
`task_started` · `task_completed` · `task_ship_sealed` **정확히 셋**뿐이고, 나머지 kind는
worktree-local(`<root>/.claude/state/msw-events`)에 **무변경**으로 남는다. 이 셋이 A1의 분모·분자·
커버리지 축 전부이며(`session-activity.js`의 `startedWorkUnits`/`completedWorkUnits`/`sealedWorkUnits`),
worktree를 넘어 같은 `work_unit`으로 결속되는 유일한 축이다.

- **B2는 보존되지만 `sessions`가 합쳐지지 않기 때문이 아니다 (R2 흡수 — 초안의 근거는 거짓이었다).**
  `sessions` 맵은 **합쳐진다**. `plugins/mccp/scripts/derive/sources/session-activity.js:154`의 `if (!sessions[sessionId])`는 per-line
  루프 안에 있고 **kind 가드가 없어서**, 공유 위치에 모인 타 worktree의 A1 이벤트가 그대로 세션
  엔트리를 만든다. B2가 살아남는 것은 `spanOf`가 `session_start` 없이는 null을 반환하기 때문이지,
  맵이 분리돼서가 아니다 — 즉 결론만 맞고 메커니즘은 존재하지 않았다.
- **그래서 A2가 실제로 깨진다 (신규 — 초안이 이 소비처를 열거하지 않았다).**
  `computeA2`는 `sessions.length`를 **분모로** 쓰고(`msw-metrics/index.js:202`, `:223`),
  분자 `samples.length`는 `context_remaining_pct`를 실은 로컬 `session_end`에서만 온다. 두 축이
  비대칭으로 움직이므로 A1 이벤트를 공유 위치로 올리는 순간 A2의 sample coverage가
  **관측된 적 없는 세션 수만큼 희석**된다. `index.js:44-45`·`:196`이 명시한 "분모 = 관측된 세션 수" 계약이 조용히
  거짓이 되고, **이 PRD가 없애려는 위치 의존성이 두 번째 지표에서 재생산된다.**
  대응은 Task 5a와 Task 8(9)가 소유한다(아래).
- **taxonomy·findings가 보존된다** — `evidence_*`·`remediation_pr`도 worktree-local이다.
  R0가 이연시킨 `derive/sources/findings.js:37`의 직접 경로 읽기(그 파일은 `resolveEventsDir`를
  거치지 않는다)도 **결함이 아니게 된다** — 그 축의 이벤트가 애초에 이동하지 않기 때문이다.
- **호출자 census는 2개가 아니라 3개다 (R2 흡수 — 초안이 자기모순이었다).**
  R1이 지적한 5개 중 4개(`session-start.js:774` · `session-end.js:377` · `evidence-lock.js:295` ·
  `handoff-items.js:76`)는 비-A1 kind라 경로가 바뀌지 않는다. 그러나
  **`finalize-receipt.js:472`는 `kind: 'task_ship_sealed'`를 emit**하며, 그것은 바로 위 문단이 A1 축으로 정의한 셋 중 하나다.
  초안은 이 파일을 "전부 비-A1"에 넣어 자기 KIND 경계와 정면으로 모순됐다
  (`m8-coverage-gate.js:52`의 승인 emit 레지스트리도 이 파일을 `task_ship_sealed`로 등록한다).
- **그 세 번째 호출자는 root 해소 방식까지 다르다.** `finalize-receipt.js`는
  `gitRepoRoot(args.cwd)`(= `git rev-parse --show-toplevel`, `hash.js:277`)를 쓰고
  `discoverRepoRoot`의 `.claude` walk-up을 쓰지 않으며, `runGit`이 null을 반환하면
  `appendEvent({repoRoot: null})`이 cwd walk-up으로 떨어진다. 즉 sealed 이벤트가 completed
  이벤트와 **다른 root 아래**에 착지할 수 있어 `sealed_without_completion`이 유령 gap을 보고한다.
  Task 1이 이 호출자를 명시 대상에 포함하고 Task 8(10)이 root 일치를 단언한다.
- **reader는 두 디렉토리를 계속 읽는다** — 공유 위치에는 A1 축만 있고 worktree-local에는 그 외가
  있으므로, 둘을 합쳐 스캔하는 현재 구조가 그대로 옳다. 다만 공유 위치는 `di>0`이다(아래).
- **열거에서 빠진 소비처가 하나 더 있었다 — `m8-coverage-gate.js` (R2 흡수).**
  `evaluateAcceptance`는 `resolveEventsDir`를 **거치지 않고**
  `path.join(repoRoot,'.claude','state','msw-events')`를 직접 만들며(`:164`),
  `PRE = ['session_start','session_end','task_started']`가 전부 관측돼야
  `ok: preMissing.length===0 && snapshots>0`을 낸다(`:178`·`:192`).
  `task_started`가 공유 위치로 이동하면 **신규 worktree에서 이 게이트가 영구히 `ok:false`**가 된다 —
  "producer가 조용히 제거됐다"를 탐지하려는 게이트가, 살아서 다른 곳에 쓰고 있는 producer를 두고
  정확히 그렇게 보고한다. 게다가 유일한 커버 test(`msw-m8-producers.test.js:294`)는
  `Array.isArray`만 단언하고 `acc.ok`를 보지 않아 **suite는 green을 유지한다**.
  Task 5b가 이 파일을 `resolveEventsDir` 경유로 바꾸고 Task 8(11)이 `acc.ok`를 단언한다.

**남은 축 하나는 별개다.** reader가 공유 디렉토리를 `candidates`의 **어디에** 넣는가 —
`isCrossLocation = di > 0`이라 첫 디렉토리는 전건 수용이므로, 공유 위치를 맨 앞에 두면 여러
worktree에서 모인 legacy 이벤트가 dedupe를 통과한다(architect HIGH 2번째). Task 2가 공유 위치를
**뒤쪽(di>0)** 에 두어 cross-location 복합키 dedupe가 걸리게 한다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/state/msw-events.js` | UPDATE | `discoverCommonDir` 추가(spawn-free) · `resolveEventsDir` 우선순위에 공유 위치 삽입 · `work_unit_kind` allowlist 추가 |
| `plugins/mccp/scripts/derive/sources/session-activity.js` | UPDATE | `candidates`에 공유 위치 추가 · `work_unit_kind` 필터 · 진단 카운터 3종 병기 |
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATE | **R2 신설.** `computeA2`의 분모를 `sessions.length`가 아니라 `sessions_local.length`로 읽는다. 공유 위치의 외래 A1 세션이 분모에 섞이는 것을 막는다(Task 5a) |
| `plugins/mccp/scripts/lib/msw-metrics/m8-coverage-gate.js` | UPDATE | **R2 신설.** `evaluateAcceptance`가 하드코딩 경로(`:164`) 대신 kind별 `resolveEventsDir`를 쓴다. 안 고치면 신규 worktree에서 `ok:false`가 영구화된다(Task 5b) |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATE | **R2 신설.** 세 번째 A1 producer(`task_ship_sealed`, `:472`). root 해소를 `discoverRepoRoot` 파생과 맞춰 sealed와 completed가 같은 root에 착지하게 한다 |
| `plugins/mccp/scripts/hooks/receipt-prompt.js` | UPDATE | `emitTaskStarted`가 `work_unit_kind`를 실어 보낸다 |
| `plugins/mccp/scripts/state/cli.js` | UPDATE | **완주(분자) producer.** `msw-event emit`이 `appendEvent(sid, event, { repoRoot: resolveCwd(flags) })`로 부르므로(`:445`) DD7 파생 구조의 적용 대상이다. 초안이 이 파일을 빠뜨려 분자가 공유 위치에 착지하지 않았다(L2 CRITICAL) |
| `plugins/mccp/scripts/migrations/msw-events-common-dir.js` | CREATE | 기존 worktree-local 이벤트를 공유 위치로 1회 수집(idempotent · dry-run · marker) |
| `plugins/mccp/scripts/lib/msw-metrics/cli.js` | UPDATE | `a1` 서브커맨드 — 경량 A1 산출 + 코드 레벨 타임아웃 + 항상 exit 0 |
| `plugins/mccp/commands/work.md` | UPDATE | Phase 0 classify 출력 직후 A1 배너 한 줄 |
| `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` | UPDATE | `METRICS_META`의 A1 항목 name/desc를 작업 단위 기준으로 정정 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | `MCCP_MSW_EVENTS_SHARED` 등록 |
| `docs/environment/orchestration.md` | UPDATE | 새 토글 상세 |
| `docs/ENVIRONMENT.md` | UPDATE | 토글 색인 행 |
| `plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js` | CREATE | 위치 독립성 · granularity · fail-open · worktree 삭제 내성 기계 단언 |
| `plugins/mccp/scripts/lib/tests/msw-events-path.test.js` | UPDATE | 공유 위치 해소 케이스 추가. 기존 격리 단언은 무변경 |
| `plugins/mccp/scripts/lib/tests/session-activity.test.js` | UPDATE | repo **내부** fixture(`__dirname/.tmp-…`)로 정확 수치를 단언하는 test. DD7상 `.git`이 없어 경로가 불변이지만, 그 불변성이 우연이 아님을 단언으로 고정한다(L2 test HIGH) |
| `plugins/mccp/scripts/lib/tests/msw-metrics-render.test.js` | UPDATE | 정정된 A1 라벨 단언 |
| `plugins/mccp/scripts/lib/tests/msw-m8-producers.test.js` | UPDATE | **R2 신설.** `:294`가 `Array.isArray`만 보고 `acc.ok`를 안 봐서 게이트가 뒤집혀도 green이었다. `acc.ok` 단언 추가 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (PR 진입 직전 재계산) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | 새 항목 |
| `.claude/prds/orchestrator-step-wiring.prd.md` | UPDATE | M1 행 status/Plan 셀 |

## Tasks

### Task 1: 공유 위치 해소 — repoRoot 파생, spawn-free, walk-up 없음 (DD7)

- **Action**: `msw-events.js`에 `commonDirOf(root)` 추가 — **`root/.git` 하나만** 검사한다.
  디렉토리면 그 경로가 common dir이고, 파일이면 `gitdir: <p>` 행을 읽어 `<p>/commondir`을
  `<p>` 기준으로 resolve한다. 없거나 판독 불가면 `null`. **부모로 올라가지 않는다** — walk-up이
  security HIGH(조상 저장소 오염)와 test HIGH(fixture 오염)의 원인이었다.
  `resolveEventsDir`를 DD7의 파생 구조로 바꾼다: `opts.dir` → `root = opts.repoRoot ??
  discoverRepoRoot(opts.cwd)` → root가 있으면 (공유 활성 ∧ `commonDirOf(root)` non-null이면
  `<common>/mccp/msw-events`, 아니면 `<root>/.claude/state/msw-events`) → root가 없으면 레거시
  cwd 상대. 공유 활성은 `MCCP_MSW_EVENTS_SHARED`가 결정한다.
- **KIND 경계 (DD8)**: `resolveEventsDir`는 `opts.kind`를 받는다. 그 값이
  `task_started`/`task_completed`/`task_ship_sealed` 중 하나일 때**만** 공유 위치를 고려하고,
  그 외에는 공유 활성 여부와 무관하게 `<root>/.claude/state/msw-events`를 낸다. `appendEvent`가
  `event.kind`를 그대로 넘긴다. 이 한 조건이 B2·taxonomy·findings 축을 v1.33.6 동작에 고정한다.
- **영향받는 producer는 3개다 (R2 흡수 — DD8 참조)**: `receipt-prompt.js`(착수) ·
  `state/cli.js`(완주) · **`pr-phase-helpers/finalize-receipt.js:472`(ship seal)**. 셋째는
  초안이 "비-A1"으로 잘못 분류했던 호출자이고, root 해소가 다르다 —
  `gitRepoRoot(args.cwd)`를 쓰고 `runGit` 실패 시 `repoRoot: null`로 떨어져 cwd walk-up을 탄다.
  그 경우 sealed 이벤트가 completed와 다른 root에 착지하므로, 이 파일도
  `discoverRepoRoot` 파생과 같은 root를 쓰도록 맞춘다. Task 8(10)이 그 일치를 단언한다.
- **evict locus (L2 R1 architect·security·invariant HIGH)**: 삭제는 `resolveEventsDir`가 아니라
  `appendEvent`가 한다 — `appendEvent`는 반환된 디렉토리에 **무조건** `evictLRU(eventsDir)`를
  호출하고(`msw-events.js:299`), `evictLRU`는 오래된 `.jsonl` 20%를 unlink하며 실패도 삼킨다.
  초안은 이 규칙을 마이그레이션에만 뒀는데, 실제 삭제 경로는 매 hook append다. **`appendEvent`가 공유 위치에 쓸 때는 `evictLRU`를 호출하지 않는다.** cap 초과는 loud stderr로만 알리고 삭제는
  사람의 판단에 맡긴다. worktree-local 경로의 기존 evict 동작은 무변경이다.
- **UI6 — 강등은 조용하지 않다**: 공유가 활성인데 `commonDirOf`가 `null`을 내면 worktree-local로
  강등되는데, 그것은 이 milestone이 없애려는 상태로의 복귀다. 강등 시 **loud stderr 1회**를
  낸다(프로세스당 1회로 dedupe — append마다 내면 hook 출력이 노이즈가 된다). 경로는
  repo-relative로 축약해 절대경로를 흘리지 않는다.
- **토글은 fail-closed로 접는다 (L2 R1 invariant MEDIUM)**: `MCCP_MSW_EVENTS_SHARED`가 열거 밖
  값이면 **off로 접고 loud warn**한다. 오타가 신규 producer 경로를 켠 채로 남기는 방향은 이
  저장소의 선례(§3.15 `MCCP_REVIEW_SINGLE_PASS`)와 반대다.
- **Mirror**: `discoverRepoRoot`(`plugins/mccp/scripts/state/msw-events.js:223`) — `fs`만 쓰고
  spawn 금지. 그 주석이 "append마다 44ms"라는 이유를 이미 적었다. `commonDirOf`도 같은 규율이되
  **walk-up 루프는 갖지 않는다**.
- **Validate**: (a) 이 worktree와 main repo에서 `resolveEventsDir({repoRoot: <각자의 루트>})`가
  **같은 경로**를 반환한다 — CRITICAL이 닫혔다는 직접 증거다(초안은 여기서 서로 다른 경로를
  냈다). (b) `.git`이 없는 tmpdir을 `repoRoot`로 넘기면 반환값이 **v1.33.6과 바이트 동일**하다.
  (c) `.claude`만 있고 조상에 `.git`이 있는 디렉토리를 넘겨도 조상 git dir이 **반환되지 않는다**.

### Task 2: reader가 공유 위치를 읽는다 — 후보 순서가 dedupe 극성을 정한다

- **Action**: `session-activity.js`의 `candidates`에 공유 위치를 추가하되
  **맨 앞이 아니라 뒤쪽**(`di > 0`)에 넣는다. 순서는 `[<repoRoot>/.claude/state/msw-events, <공유 위치>,
  <legacy cwd>]`다. `canonical()` 정규화 · `seenDirs` · `isCrossLocation` dedupe 골격은 그대로
  재사용한다. 공유 위치 해소 실패는 후보 미추가로 접힌다(throw 금지).
- **왜 뒤쪽인가 (architect HIGH)**: `isCrossLocation = di > 0`이라 **첫 디렉토리는 전건 수용**이다
  (`plugins/mccp/scripts/derive/sources/session-activity.js:130`). 마이그레이션이 여러 worktree의 이벤트를 공유 디렉토리 하나로
  모으므로, 그 디렉토리를 `di=0`에 두면 `event_id`가 없는 레거시 이벤트가 복합키 dedupe를
  통과해 중복 계상된다. 뒤쪽에 두면 `legacyKeyOf` 복합키가 걸린다. 초안의 "2중으로 접는다"는
  주장은 레거시 이벤트에 대해 **양쪽 다 비어 있었다**.
- **Mirror**: `plugins/mccp/scripts/derive/sources/session-activity.js:87` — 새 dedupe 알고리즘을
  만들지 않는다(F2).
- **Validate**: 같은 `event_id`를 가진 이벤트와 **`event_id`가 없는 동일 내용** 이벤트를 각각
  worktree-local과 공유 위치 양쪽에 두고, 둘 다 1건으로 접히는지 단언.

### Task 3: 1회 마이그레이션 — legacy 복합키까지 dedupe하고 retention을 건드리지 않는다

- **Action**: `migrations/msw-events-common-dir.js` — `git worktree list --porcelain`으로
  worktree를 열거해(1회 실행 도구라 spawn이 허용된다. derive 경로가 아니다) 각 worktree의
  `.claude/state/msw-events/*.jsonl`을 공유 위치로 **복사 병합**한다. **원본은 지우지 않는다** —
  reader가 back-compat로 계속 읽으므로 삭제가 불필요하고 되돌림 여지를 남긴다. dry-run 지원,
  marker는 공유 위치 아래 `.migrations/msw-events-common-dir.json`.
- **dedupe는 2단이다 (security · invariant MEDIUM → HIGH와 얽혀 흡수)**: `event_id`가 있으면
  그 키로, **없으면 `plugins/mccp/scripts/derive/sources/session-activity.js:126`의 `legacyKeyOf`와 동형인 복합키**
  (`session_id ∥ kind ∥ ts ∥ ended_at ∥ created_at`)로 접는다. `event_id` 단독이면 M3 이전
  레거시 줄이 N중으로 쌓이고, reader는 **같은 디렉토리 안에서는 절대 dedupe하지 않으므로**
  그 부풀림이 baseline에 그대로 봉인된다.
- **A1 축만 옮긴다 (DD8)**: 각 줄을 파싱해 `kind`가 A1 축 셋 중 하나인 것만 공유 위치로
  복사한다. 나머지 kind는 worktree-local에 그대로 두고 건드리지 않는다. 통째로 복사하면 DD8이
  worktree-local에 남기기로 한 B2·taxonomy 이벤트가 공유 위치에도 생겨 reader가 양쪽에서 세게
  된다.
- **경로 컨테인먼트 기준은 repo-root가 아니라 common dir이다 (L2 R1 security HIGH)**: 초안은
  "`git worktree list` 보고 경로 중 `<repo-root>` 하위만 연다"고 적었는데, 마이그레이션은 보통
  worktree **안에서** 실행되고 그때 repo-root는 그 worktree 자신이다(`discoverRepoRoot`는
  `.claude`를 가진 최초 디렉토리를 낸다). 형제 worktree와 main repo는 그 하위가 아니므로 **전부 skip되어** 공유 위치에 자기 것만 남고, dry-run 재실행 0건 검사는 0/0으로 vacuous하게 통과한다.
  수집해야 할 corpus를 정확히 거절하는 규칙이었다. 올바른 기준은 **`commonDirOf(cwd)`가 같은 worktree만 연다** — 그것이 "같은 저장소"의 기계적 정의이고 DD7이 이미 쓰는 판정이다. 경로가
  `git worktree list`에서 왔고 `.claude/state/msw-events`가 실재하는지도 함께 확인하며, 거절한
  경로는 사유와 함께 stderr에 남긴다.
- **retention은 Task 1이 소유한다**: 공유 위치의 no-evict 규칙은 마이그레이션이 아니라
  `appendEvent`에 걸린다(Task 1 참조). 마이그레이션 자신도 evict를 호출하지 않지만, 그것만으로는
  hot path의 조용한 삭제를 막지 못한다 — 그 locus 오류가 L2 R1에서 세 관점에 동시에 지적됐다.
- **Mirror**: `migrations/v0.2.8-generic-receipt-quarantine.js` — idempotent · dry-run · marker.
- **Validate**: dry-run 보고 건수와 실행 후 공유 위치의 distinct 이벤트 수가 일치. 재실행 시 추가
  0건. `event_id` 없는 동일 줄을 두 worktree에 심어 놓고 1건으로 접히는지 단언.

### Task 4: granularity 필드 (producer)

- **Action**: `msw-events.js`의 `ALLOWED_FIELDS`에 `work_unit_kind` 추가(allowlist가 emit보다
  **먼저**). `receipt-prompt.js`의 `emitTaskStarted`가 `commandArgs`에 PRD 경로 토큰이 있으면
  `prd`, 아니면 `milestone`을 실어 보낸다. `NON_WORK_UNIT_COMMANDS`는 **그대로 둔다** — 그것은
  명령 축이고 이것은 인자 축이라 서로 다른 조건이다.
- **Mirror**: `msw-events.js:56` allowlist 확장 규약 · `receipt-prompt.js:172` fail-open.
- **Validate**: `eventToJsonLine`이 `work_unit_kind`를 보존하는지 단언(allowlist 누락이면 조용히
  버려진다).

### Task 5: granularity 필터 (reader)

- **Action**: `session-activity.js`의 `task_started` 분기에서 `work_unit_kind`가 `prd`면
  분모 Set에 넣지 않고 제외 Set에 넣는다. 필드 부재는 분모에 포함하되 unknown Set에 넣는다.
  결과에 `prd_granularity_excluded_count` · `work_unit_kind_unknown_count` ·
  `completion_without_startup`(완주 work_unit 중 분모에 없는 수)을 추가한다.
  **computeA1은 손대지 않는다**(DD6) — 세 카운터는 `session_activity` 소스의 진단 필드로만 존재한다.
- **분자에도 같은 필터를 적용한다 (L2 R1 invariant HIGH — A1 > 100% 차단)**: 분모에서만 빼면
  분자가 분모에 없는 항목을 세게 된다. 실측이 그 사례를 갖고 있다 — `env-contract-integrity`는
  PRD 이름 슬러그로 착수와 완주를 **둘 다** 가졌다(착수는 인자 경로, 완주는 branch에서 파생 —
  DD4). 그러면 `completedWorkUnits.size > startedWorkUnits.size`가 가능하고, `computeA1`은
  `completedCount / startupCount`를 그대로 내며 상한도 무결성 분기도 없어 **A1 > 100%가 `status:'computed'` · `integrity_ok:true`로 인증된다**. 따라서 완주 work_unit이 분모 Set에
  없으면 **분자에서도 제외**하고 그 수를 `completion_without_startup`으로 계상한다.
  `num ≤ den`이 reader에서 구조적으로 보장되므로 DD6(computeA1 무변경)이 유지된다.
- **Mirror**: `sealed_without_completion` 결과 필드 — 분자가 아닌 커버리지 축.
- **Validate**: fixture로 prd 1건 + milestone 2건 + 필드 부재 1건을 주입해 분모 3, 제외 1,
  unknown 1이 나오는지. **그리고 PRD 단위 슬러그에 착수·완주가 둘 다 있는 fixture**를 주입해
  `numerator ≤ denominator`이고 `completion_without_startup === 1`인지 단언한다 — 이것이
  A1 > 100% 회귀 가드다.

### Task 5a: A2 분모를 관측된 세션으로 되돌린다 (R2 흡수 — CRITICAL)

- **왜**: DD8이 보인 대로 `sessions` 맵은 kind와 무관하게 채워지므로, A1 이벤트를 공유 위치로
  올리는 순간 A2의 분모(`sessions.length`)에 **이 위치에서 관측된 적 없는 세션**이 섞인다.
  분자는 로컬 `session_end`에서만 오므로 비율이 조용히 붕괴한다. 이 milestone이 A1에서 없애는
  위치 의존성을 A2에서 새로 만드는 것이므로 범위 밖으로 미룰 수 없다.
- **Action**: `session-activity.js`가 세션 엔트리에 **그 세션을 어느 디렉토리에서 봤는지**를
  기록하고(`observed_local: boolean` — worktree-local 후보에서 온 이벤트가 하나라도 있으면 true),
  결과에 `sessions_local`을 추가한다. `msw-metrics/index.js`의 `computeA2`는 분모를
  `sessions.length`가 아니라 **`sessions_local.length`** 로 읽는다.
  `sessions`(전체)는 그대로 두어 다른 소비처를 건드리지 않는다 — 이것은 필드 추가이고 의미 변경이 아니다.
- **Mirror**: Task 5의 세 카운터와 같은 형태 — 소스 결과에 진단 필드를 더하고 소비처가 골라 읽는다.
- **Validate**: fixture에 로컬 세션 2 + 공유 위치의 외래 A1 세션 3을 넣고
  `computeA2`의 `denominator === 2`이며 `status:'computed'`인지 단언. 분모가 5가 되면 실패다.

### Task 5b: `m8-coverage-gate`가 해소기를 거치게 한다 (R2 흡수 — HIGH)

- **왜**: `evaluateAcceptance`가 `resolveEventsDir`를 우회해 worktree-local 경로를 직접
  조립하고(`m8-coverage-gate.js:164`) `PRE`에 `task_started`를 요구하므로(`:178`),
  그 kind가 공유 위치로 이동하면 **신규 worktree에서 `ok:false`가 영구화**된다. producer 제거를
  탐지하려는 게이트가 살아 있는 producer를 제거됐다고 보고하게 된다.
- **Action**: `evaluateAcceptance`가 `eventsDir`를 직접 만들지 않고, `PRE`/`POST`의 각 kind에
  대해 `resolveEventsDir({ repoRoot, kind })`가 가리키는 디렉토리를 조회하도록 바꾼다.
  kind별로 조회처가 갈리는 것이 KIND 경계의 정의이므로, 게이트도 같은 오라클을 써야 정합하다.
- **Mirror**: Task 2의 reader와 동일 — 경로를 유추하지 않고 `resolveEventsDir`에 묻는다.
- **Validate**: Task 8(11).

### Task 6: A1 라벨 정정

- **Action**: `renderer/sections/msw-metrics.js`의 `METRICS_META` A1 항목을 name "작업 단위
  완주율", desc "착수 기록이 있는 작업 단위 중 PR 번호까지 도달한 비율"로 바꾼다. 나머지 7개
  지표는 건드리지 않는다(G6 — 전수 감사는 backlog).
- **`desc`는 렌더되지 않는다 (L2 R1 test MEDIUM)**: 렌더러는 `meta.name`만 출력하고
  (`renderer/sections/msw-metrics.js:444` · `:469` · `:530`) `desc`의 read site는 정의부 외에
  **0건**이다. 즉 `desc`는 dead field이고, 렌더 test로는 그 값을 반증할 수 없다. PRD가 오독
  risk의 근거로 든 "표시 라벨" 중 실제로 표시되는 것은 `name` 절반뿐이다. 그래도 `desc`를
  고치는 이유는 그 파일이 지표 계약을 읽는 사람의 참조점이기 때문이고, **test는 `name`에만 건다** — 반증 불가능한 문자열에 통과 단언을 걸면 green이 아무것도 뜻하지 않게 된다.
- **Mirror**: 같은 파일이 B1·C1을 M4에서 정정한 이력의 형태.
- **Validate**: `msw-metrics-render.test.js`가 렌더 출력에서 **새 `name`을 단언하고 옛 `name`의 부재를 단언**한다. `desc`는 단언 대상이 아니며, 그 사실을 test 주석에 남긴다.

### Task 7: work 진입 배너

- **Action**: (a) `msw-metrics/cli.js`에 `a1` 서브커맨드 추가 — `scanSessionActivity`와
  `computeMetrics`만 호출하고 전역 try/catch를 갖고 **어떤 실패에도 exit 0 + 빈 stdout**으로
  끝난다. stderr 메시지의 경로는 repo-relative로 축약한다(F9).
  **`a1`은 자체 타임아웃을 주장하지 않는다** — DD5가 보인 대로 동기 스캔 위에서는 발화할 수 없고,
  지킬 수 없는 보장을 계약에 적으면 그것이 곧 조용한 degradation이다.
  **`--repo-root <path>`를 받는다** — 기본값은 cwd. Validation 1b·5가 "빌드 하나를 여러 root에
  대해" 돌리는 형태를 취하므로 이 플래그는 편의가 아니라 그 검증의 전제다(R2 흡수).
  (b) `work.md` Phase 0의 classification echo 직후에 그 CLI를
  **`execFileSync(..., { timeout: 3000 })`로** 부르고(경계는 자식 프로세스 — `plugins/mccp/scripts/derive/sources/worktrees.js:27`과 같은 형태), 타임아웃·비영점·빈 stdout은
  전부 "배너 없음"으로 접어 한 줄을 생략한다.
- **Mirror**: `plugins/mccp/commands/work.md:90` — CLI 호출 후 `node -e`로 JSON을 안전 파싱하는 관용구.
  타임아웃 경계는 `derive/sources/worktrees.js:27`의 `execFileSync` + `timeout` 형태를 **그대로** 쓴다.
- **Validate**: `/mccp:work` 라이브 1회에서 배너 줄이 실제로 출력되는 것을 확인(UI9). 공유
  디렉토리를 읽기 불가로 만든 상태에서 CLI가 exit 0 + 빈 stdout인지 확인.
  **그리고 스캔이 3초를 넘도록 만든 fixture에서 `/mccp:work` 진입이 멈추지 않고 배너만 생략되는지 확인** —
  이것이 DD5가 약속한 상한이 실제로 존재하는지의 유일한 증거다.

### Task 8: 회귀 test

- **Action**: `msw-a1-boundary.test.js` 신설. fixture는 **실제 git이 쓰는 형태**로 조립한다 —
  main root에 `.git/` 디렉토리, worktree에 `gitdir: <path>` 한 줄을 담은 `.git` **파일**과 그
  대상 디렉토리의 `commondir` 파일. 손수 만든 기대 형태로 통과시키면 실 producer 경로를 검증하지
  못한다(L2 test LOW).
  - **(1) 도달성 — CRITICAL 회귀 가드**: `appendEvent`를 **실 producer와 같은 형태**로
    (`{ repoRoot: <worktree root> }` 명시) 호출했을 때 이벤트가 **공유 위치에 착지**하는지
    단언한다. 초안이 죽은 지점이 정확히 여기이므로 이 단언이 이 test의 머리다.
  - **(2) 위치 독립성**: 같은 fixture repo의 서로 다른 3개 root에서 `scanSessionActivity`가 같은
    `task_startups_count`를 내는지 단언(F4).
  - **(3) 조상 격리 — security HIGH 회귀 가드**: `.claude`만 있고 **조상에 `.git`이 있는**
    디렉토리를 `repoRoot`로 넘겨도 조상 git dir이 쓰이지 않는지 단언.
  - **(4) 경로 불변 — test HIGH 회귀 가드**: `.git`이 없는 tmpdir을 `repoRoot`로 넘기면 반환
    경로가 v1.33.6과 동일한지 단언.
  - **(5) worktree 삭제 내성**: 이벤트를 공유 위치에 쓴 뒤 worktree 디렉토리를 지워도 값이
    불변인지 단언(G8).
  - **(6) legacy dedupe — architect HIGH 회귀 가드**: `event_id` 없는 동일 이벤트를
    worktree-local과 공유 위치에 각각 두고 1건으로 접히는지 단언.
  - **(7) granularity**: Task 5의 fixture 단언.
  - **(8) fail-open**: `commonDirOf`가 `null`을 내도록 fixture를 구성하고(`.git` 제거)
    `a1` CLI가 exit 0 + worktree-local 경로 복원 + loud stderr 1회인지 단언. `MCCP_MSW_EVENTS_SHARED=off`도
    같은 경로를 복원하는지 함께 단언한다 — DD2가 내세운 되돌림 수단이 실제로 되돌리는지를
    확인하는 것이지 exit code만 보는 것이 아니다(L2 test·invariant MEDIUM 부분 흡수).

  - **(9) A2 분모 오염 — CRITICAL 회귀 가드 (R2 신설)**: 공유 위치에
    **외래 worktree의 A1 이벤트만** 있는 세션 3건과 로컬 `session_start`/`session_end` 세션 2건을 fixture에 넣고,
    `computeA2`의 `denominator === 2`인지 단언한다. 이 항목이 없으면 DD8이 틀려도 붉어지는 test가
    0건이라는 R1 test HIGH가 그대로 남는다 — 초안이 실제로 그 상태였다.
    같은 fixture에서 B2의 `concurrent_pairs_count`가 불변인지도 함께 단언한다(그것이 살아남는
    이유가 `spanOf`의 `session_start` 요구임을 고정한다).
  - **(10) 세 번째 A1 producer의 root 일치 — HIGH 회귀 가드 (R2 신설)**:
    `finalize-receipt.js` 경로로 emit되는 `task_ship_sealed`가 `task_completed`와
    **같은 root 아래**에 착지하는지 단언한다. `gitRepoRoot`가 null을 반환하는 상황을 주입해
    `sealed_without_completion`이 유령 gap을 만들지 않는지도 확인한다.
  - **(11) `m8-coverage-gate` acceptance 불변 — HIGH 회귀 가드 (R2 신설)**: Task 5b 적용 후
    fixture worktree에서 `evaluateAcceptance(...).ok === true`인지 단언한다.
    **`acc.ok`를 직접 본다** — 기존 `msw-m8-producers.test.js:294`는 `Array.isArray`만 보므로
    게이트가 뒤집혀도 green을 유지했다. 그 test도 `acc.ok` 단언을 추가하도록 함께 고친다.

  `msw-events-path.test.js`에는 공유 위치 해소 케이스를 더하되
  **기존 격리 단언은 손대지 않는다**. `session-activity.test.js`에는 repo 내부 fixture의 경로
  불변성 단언을 더한다.
- **Mirror**: `msw-derive-sources.test.js`의 fixture 주입 · `msw-events-path.test.js`의 tmpdir 격리.
- **Validate**: 아래 Validation 블록 전체 green.

### Task 9: env 등록 + 문서 + version 동기

- **Action**: `registry.js`에 `MCCP_MSW_EVENTS_SHARED`를 bool · default on · off 값 · active ·
  category orchestration · evidence는 `msw-events.js`의 실제 read site 경로와 줄번호로 등록.
  `docs/environment/orchestration.md` 상세 + `docs/ENVIRONMENT.md` 색인 행. `plugin.json` ·
  `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · `CHANGELOG.md` 4면 동기.
- **Mirror**: `registry.js:182` 행 — evidence는 read site여야 lint L10 정방향을 통과한다.
- **Validate**: `env-contract/lint.js`가 L1부터 L10까지 전부 통과.

> **version은 지금 고정하지 않는다** (CLAUDE.md 3.7 병렬 브랜치 충돌). 이 브랜치의 base는
> 1.33.1이고 **origin/main은 이미 1.33.7을**(commit `2bf60ad` — release-channel-separation M1),
> sibling worktree가 1.34.0을 선언 중이다. target은 (a) base 머지 해소 시점과
> (b) `/mccp:pr` 진입 직전 **두 번 재계산**한다. 단일 milestone이므로 patch 축(**잠정 1.33.8**)이며,
> 재상향 시 위 4면을 **전부 다시** 동기하고 `i18n-surface.test.js`를 재실행한다.
>
> **implement 시점 재계산 결과 — 위 문단의 전제가 이미 stale했다 (2026-09-02).**
> 실측하니 origin/main은 1.33.7이 아니라 **1.34.1**이고, sibling `c1-review-record-linkage`가
> **1.34.2**를 선언 중이다. 발행된 번호는 불가침이므로 그 위로 밀되 예측 가능한 충돌을 피해
> 한 칸 더 올려 **1.34.3**에 착지했다. 4면(`plugin.json` · `renderer/html.js` page-foot ·
> `renderer/markdown.js` derived 줄 · `CHANGELOG.md`)을 동기하고 `i18n-surface.test.js`를
> 재실행해 green을 확인했다. 이 절이 경고한 대로 **`/mccp:pr` 진입 직전 한 번 더 재계산한다** —
> 위 세 브랜치 중 어느 것이든 그 사이에 머지되면 target이 또 밀린다.
>
> **R2 흡수 — 초안은 여기서 "origin/main은 이미 1.33.6"이라 적고 target을 1.33.7로 골랐다.**
> 1.33.7은 **이미 발행된 번호**이므로 그대로 따르면 `CHANGELOG.md`에 `## [1.33.7]` 헤딩이 둘
> 생기고(§3.7이 "조용히 넘어가지 말 것"이라 못박은 깨진 상태), `claude plugin update`가 기존
> `~/.claude/plugins/cache/mccp/mccp/1.33.7/`로 해소돼 사용자가 release-channel-separation M1
> 코드를 계속 돌게 된다. 이 절이 경고하는 바로 그 충돌을 이 절 자신이 저지르고 있었다.
>
> **번호를 파일명에 넣지 않는다 (재상향 안전성).** 초안은 마이그레이션 파일명·marker 경로·
> Validation 4의 세 명령에 `v1.33.7`을 하드코딩했다. 번호가 한 칸 밀리는 순간 그 경로들은
> `Cannot find module`로 죽고 idempotency 검사가 **조용히 실행되지 않는다**. 따라서 마이그레이션
> 파일명은 버전이 아니라 축 이름을 쓴다 — `msw-events-common-dir.js`.

## Validation

```bash
# 1) 새 + 기존 msw 축 test 전량
node --test plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js \
            plugins/mccp/scripts/lib/tests/msw-events-path.test.js \
            plugins/mccp/scripts/lib/tests/msw-events.test.js \
            plugins/mccp/scripts/lib/tests/msw-derive-sources.test.js \
            plugins/mccp/scripts/lib/tests/msw-m8-producers.test.js \
            plugins/mccp/scripts/lib/tests/msw-metrics.test.js \
            plugins/mccp/scripts/lib/tests/msw-metrics-render.test.js \
            plugins/mccp/scripts/lib/tests/msw-metrics-acceptance.test.js \
            plugins/mccp/scripts/lib/tests/msw-metrics-b2.test.js \
            plugins/mccp/scripts/lib/tests/session-activity.test.js

# 1b) 도달성 + KIND 경계 + cross-root 경로 동일성 (CRITICAL · DD8 · L2 R1 test LOW)
#
#   R2 흡수 — 초안은 `cd "$d" && node -e 'require("./plugins/...")'` 였다. `node -e` 의
#   상대 require는 **cwd 기준으로 해소**되므로 그 형태는 세 개의 서로 다른 체크아웃에 있는
#   서로 다른 빌드를 부른다. main·c3 는 이 변경이 없는 브랜치라 `opts.kind` 를 무시하고
#   worktree-local 을 반환하므로, 검사는 구현이 옳아도 **반드시 실패**한다 — 변경을 재는 게
#   아니라 브랜치 차이를 재기 때문이다. 그래서 **빌드 하나를 여러 root 에 대해** 돌린다.
#   이것이 Task 1 Validate (a) 가 머지 전에 통과할 수 있는 유일한 형태이기도 하다.
#   판정은 눈이 아니라 프로세스 exit code 가 한다.
node -e '
  const m = require("./plugins/mccp/scripts/state/msw-events");
  const roots = process.argv.slice(1);
  const a1 = roots.map(function (r) { return m.resolveEventsDir({ repoRoot: r, kind: "task_started" }); });
  const b2 = roots.map(function (r) { return m.resolveEventsDir({ repoRoot: r, kind: "session_start" }); });
  roots.forEach(function (r, i) { console.log(r + "\n  A1축 = " + a1[i] + "\n  B2축 = " + b2[i]); });
  // A1 축: 세 root 에서 같은 경로. 하나라도 다르면 집계 경계가 새는 것이다.
  if (new Set(a1).size !== 1) { console.error("FAIL: A1 축 경로가 root 마다 다르다"); process.exit(1); }
  // B2 축: 세 root 에서 서로 달라야 한다(각자의 worktree-local). 같아지면 KIND 경계가 무너진 것이다.
  if (new Set(b2).size !== roots.length) { console.error("FAIL: B2 축이 worktree-local 로 분리되지 않는다"); process.exit(1); }
  console.log("OK: A1 은 root 독립, B2 는 root 별 분리");
' "<repo-root>" \
  "<repo-root>/.worktrees/c2-orchestrator-step-wiring" \
  "<repo-root>/.worktrees/c3-ci-full-suite"

# 2) env 계약 lint (L1~L10) — 새 토글 등록 검증
node plugins/mccp/scripts/lib/env-contract/lint.js

# 3) surface version 동기 (4면 drift 검출)
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 4) 마이그레이션 idempotency — dry-run, 실행, 재실행 0건
node plugins/mccp/scripts/migrations/msw-events-common-dir.js --dry-run
node plugins/mccp/scripts/migrations/msw-events-common-dir.js
node plugins/mccp/scripts/migrations/msw-events-common-dir.js --dry-run

# 5) 지표 1 — 위치 독립성 라이브 실측 (3곳에서 같은 값이어야 한다)
#
#   R2 흡수 — 초안은 `cd "$d" && node .../cli.js a1` 이었다. `a1` 서브커맨드는 **어느
#   체크아웃에도 아직 없으므로**(main·c3 의 `cli.js` 는 `a3` 만 dispatch 하고 usage 를 낸다)
#   세 줄 중 둘이 빈 stdout 이 되고, acceptance 지표 1 은 "빈 문자열 3개가 같다" 로 **공허하게
#   만족**된다. 이 milestone 의 표제 성질이 측정되지 않은 채 ship 되는 경로다.
#   따라서 여기서도 **이 worktree 의 CLI 하나**를 `--repo-root` 로 세 root 에 대해 돌린다.
#   Task 7 이 `a1` 에 `--repo-root` 를 받게 하는 것은 그래서 선택이 아니라 이 검증의 전제다.
A1_VALUES=$(for d in "<repo-root>" \
                     "<repo-root>/.worktrees/c2-orchestrator-step-wiring" \
                     "<repo-root>/.worktrees/c3-ci-full-suite"; do
  printf '%s => ' "$d"
  node plugins/mccp/scripts/lib/msw-metrics/cli.js a1 --repo-root "$d"
done)
echo "$A1_VALUES"
# 눈으로 비교하지 않는다 — 값만 뽑아 유일성을 기계로 판정한다. 빈 값도 실패로 센다.
echo "$A1_VALUES" | node -e '
  const lines = require("fs").readFileSync(0, "utf8").split(/\r?\n/).filter(Boolean);
  const vals = lines.map(function (l) { return l.split("=>").slice(1).join("=>").trim(); });
  if (vals.length !== 3) { console.error("FAIL: 3 행이 나오지 않았다 (" + vals.length + ")"); process.exit(1); }
  if (vals.some(function (v) { return v === ""; })) { console.error("FAIL: 빈 출력이 있다 — 공허한 일치를 통과로 세지 않는다"); process.exit(1); }
  if (new Set(vals).size !== 1) { console.error("FAIL: 위치마다 A1 값이 다르다 -> " + JSON.stringify(vals)); process.exit(1); }
  console.log("OK: 세 위치에서 A1 = " + vals[0]);
'

# 6) 배너 경량 경로 비용 (derive 전체 2.28s 대비)
time node plugins/mccp/scripts/lib/msw-metrics/cli.js a1

# 7) 되돌림 수단이 실제로 되돌리는가 — exit code만 보지 않는다
#    off는 (a) exit 0이고 (b) worktree-local 경로를 복원해야 한다. 후자가 본체다.
#
#   R2 흡수 — 초안은 `resolveEventsDir({ repoRoot: process.cwd() })` 를 **kind 없이** 불렀다.
#   Task 1 의 KIND 경계상 kind 가 A1 축 셋이 아니면(undefined 포함) 토글·공유 활성 여부와 무관하게
#   항상 worktree-local 이 반환되므로, 그 단언은 토글이 off 든 on 이든 **아예 미구현이든** 통과한다.
#   즉 DD2 가 내세운 유일한 되돌림 수단의 유일한 실행 가능 증거가 구조적으로 실패할 수 없었다.
#   토글을 배선하고 존중하기를 잊은 구현도, 극성을 뒤집은 구현도 green 을 받는다.
#   고침은 (i) kind 를 준다 (ii) **양방향 쌍**으로 단언한다. 한쪽만 있으면 어느 방향도 고정되지 않는다.
MCCP_MSW_EVENTS_SHARED=0 node plugins/mccp/scripts/lib/msw-metrics/cli.js a1; echo "exit=$?"
node -e '
  const m = require("./plugins/mccp/scripts/state/msw-events");
  const LOCAL = /[\\\/]\.claude[\\\/]state[\\\/]msw-events$/;
  const root = process.cwd();
  const call = function (env) {
    const saved = process.env.MCCP_MSW_EVENTS_SHARED;
    if (env === null) delete process.env.MCCP_MSW_EVENTS_SHARED; else process.env.MCCP_MSW_EVENTS_SHARED = env;
    try { return m.resolveEventsDir({ repoRoot: root, kind: "task_started" }); }
    finally { if (saved === undefined) delete process.env.MCCP_MSW_EVENTS_SHARED; else process.env.MCCP_MSW_EVENTS_SHARED = saved; }
  };
  // (i) 음의 방향 — off 는 A1 축에서도 worktree-local 을 복원해야 한다.
  const off = call("0");
  console.log("off  =", off);
  if (!LOCAL.test(off)) { console.error("FAIL: off 가 worktree-local 을 복원하지 않았다"); process.exit(1); }
  // (ii) 양의 방향 — 이것이 없으면 "항상 local 을 반환하는 구현" 도 (i) 를 통과한다.
  const on = call("1");
  console.log("on   =", on);
  if (LOCAL.test(on)) { console.error("FAIL: on 인데 A1 축이 공유 위치로 가지 않는다 — (i) 는 공허하게 통과한다"); process.exit(1); }
  if (on === off) { console.error("FAIL: 토글이 경로를 전혀 바꾸지 않는다"); process.exit(1); }
  console.log("OK: 토글이 양방향으로 실제 경로를 바꾼다");
'
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 공유 위치 이전이 hook 경로라 배포 직후 이벤트가 조용히 사라진다 | 중 | `resolveEventsDir` 한 함수만 바뀌고 모든 호출자가 fail-open이다. 토글로 즉시 복귀. Task 8의 위치 독립성 단언이 기계로 잡는다 |
| 기존 격리 test가 깨진다 | 중 | DD7 — 공유 위치가 `root/.git`에서만 파생되므로 `.git`이 없는 tmpdir·repo-내부 fixture는 경로가 **v1.33.6과 동일**하다. Task 8(4)가 그 불변성을 단언하고, `msw-events-path.test.js`·`session-activity.test.js`의 기존 단언은 무변경으로 통과해야 한다 |
| 마이그레이션이 이벤트를 중복 계상시킨다 | 중 | **2단 dedupe** — `event_id`가 있으면 그 키로, 없으면 `legacyKeyOf` 동형 복합키로 접는다. reader 쪽은 공유 위치를 `di>0`에 두어 cross-location dedupe가 걸린다. 초안의 "`event_id` 2중" 주장은 레거시 이벤트에 대해 양쪽 다 비어 있었다(L2 architect HIGH) |
| 공유 위치 해소가 조상 저장소에 착지한다 | 낮음 | DD7이 walk-up을 제거해 `root/.git`만 본다. Task 8(3)이 회귀 가드 |
| 집계를 한 곳에 모아 retention이 과거 완주 이벤트를 지운다 | 중 | Task 3 — 공유 위치에서 `evictLRU` 미호출, cap 초과는 loud stderr. 조용한 삭제가 A1 분자를 소급 감소시키는 경로를 닫는다 |
| `.git` 내부에 쓰는 것이 git 동작을 간섭한다 | 낮음 | common dir 아래 `mccp/`는 git이 쓰지 않는 이름이고, `codex-policy.js`가 이미 git dir 아래 `mccp/tmp/`를 쓰는 선례가 있다. tracked 되지 않으므로 CLAUDE.md 3.12 내구성 계약과 무관(UI10) |
| 배너가 work 진입을 느리게 한다 | 낮음 | 경량 경로 실측 0.13초(derive 전체 2.28초 대비). 코드 레벨 3초 타임아웃이 상한 |
| PRD 단위 제외로 완주 5건 중 일부가 고아가 된다 | 중 | DD4 — `completion_without_startup`으로 수치화한다. 값이 조작되는 것이 아니라 비대칭이 보이게 되는 것이며, 그 수치가 후속 축의 근거다 |
| A1 값이 마이그레이션 직후 점프해 개선으로 오독된다 | 중 | 지표 2에 목표치가 없고(UI8) baseline이 이 milestone에서 처음 확정된다. CHANGELOG에 이 시점 이전 값과 비교 불가임을 명시 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)

라이브 완주가 산출해야 하는 것 — 아래 넷이 **전부** 관측되지 않으면 M1은 완료가 아니다.

1. **지표 1** — Validation 5가 세 위치에서 **같은** A1 값을 출력한다. 하나라도 다르면 집계
   경계가 새는 것이다.
2. **지표 2** — 그 값의 status가 `computed`다(`forward-only`가 아니다). 저장소 전체 corpus에는
   완주 이벤트가 실재하므로 완주 producer-presence가 참이 된다.
3. **지표 3** — `work_unit_kind_unknown_count`가 마이그레이션된 레거시 착수 수와 **일치**하고,
   그 이후 발생한 착수는 전부 `kind`를 갖는다(unknown이 늘지 않는다).

   > **`prd_granularity_excluded_count > 0`을 완료 조건으로 두지 않는다** (L2 test MEDIUM 흡수).
   > 마이그레이션은 `work_unit_kind`를 소급 부여하지 않고(DD3), 지표 5가 요구하는 라이브 1회는
   > milestone 단위 `/mccp:work`이므로 `kind='milestone'`이 찍힌다. 즉 이번 사이클에서 그 값은
   > **구조적으로 0**이고, 0이 아니게 만들려면 acceptance를 완화하거나 데이터를 인위로 만들어야
   > 한다 — 둘 다 이 milestone이 없애려는 종류의 자기기만이다. 필터가 실제로 동작하는지는
   > Task 8(7)의 fixture 단언이 증명하고, 라이브 값은 PRD 경로 착수가 처음 발생할 때 자연히
   > 관측된다.
4. **지표 5** — `/mccp:work` 라이브 1회에서 A1 배너 줄이 실제 터미널 출력에 나타난다. `work.md`를
   고쳤다는 것만으로는 이 항목을 주장할 수 없다.

지표 4(halt 지점 기록률)는 **M1의 acceptance가 아니다** — M2 소유다(UI4 · G7).

## Design Critique

detector `design_signal=true` (signal files: `renderer/sections/msw-metrics.js` · `renderer/html.js` ·
`renderer/markdown.js` · `derive/sources/session-activity.js`). SKILL first-step으로
`frontend-design-direction/SKILL.md`의 `## Output Constraints` 4개 앵커를 읽고 R0 1회를 돌렸다.
verdict `CONVERGED` (round 0/2, HIGH·CRITICAL 0건). santa-loop R0 흡수로 본문이 바뀐 뒤
게이트를 재진입하며 네 앵커를 다시 기계 측정했고, 그 결과가 아래 표다.

| 앵커 | 측정 | 판정 |
|---|---|---|
| 정보 위계 3단계 (H15) | fence 제외 실제 heading `#`1 / `##`14 / `###`23 — 최대 3, H4 이상 0건 | 통과 |
| 강조색 화면당 1개 | inline-code span 제외 후 강조 채널 1종(bold)만. italic · strike · HTML emphasis 0건 | 통과 |
| raw markdown marker 금지 | 줄을 넘는 `**` **6쌍 재유입**(santa R0 흡수가 되돌려 놓음) → 이번 R0에서 재흡수 (줄바꿈 위치만 이동, 문구 무변경) | 흡수 후 0건 |
| 한 화면 항목 수 상한 | 7개 섹션이 3행 초과 → 파서 비-입력 2개 표를 **R0에서 흡수** (상위 3 + collapse) | 흡수 후 통과 · 나머지는 적용 대상 아님 |

MEDIUM 2건은 §3.14상 backlog 대상이지만 편집 비용이 낮고 라운드를 늘리지 않으므로 R0 안에서
그 자리 흡수했다(§3.16 — 라운드를 늘리지 않는 것이 요지이지 고치지 않는 것이 아니다).

세 번째 앵커를 흡수한 근거는 이 저장소의 실측 선례다 — `renderer/sections/msw-metrics.js`의
주석이 "PRD 표 셀에서 온 볼드 마커가 `esc()`만 거치면 HTML 표면에 리터럴로 누출된다"는 실제
사고를 기록하고 있다. 문단 단위로는 유효한 마크업이라도 셀 경계를 넘는 마커는 그 사고와 같은
형태이므로 닫아 두는 편이 싸다.

### 앵커 4의 적용 범위 (완화가 아니라 범위 판정)

collapse는 **파서 입력이 아닌 서술 섹션에만** 적용했다. 기존 plan 34건 중 9건이 `<details>`를
쓰고, 그 선례들은 전부 "흡수하지 않은 N건" 같은 서술 목록과 Task 내부 부속 설명이다 — 표준
템플릿 섹션이나 파서 입력을 감싼 선례는 0건이다.

| 섹션 | 행 수 | 처리 | 근거 |
|---|---|---|---|
| 흡수한 findings | 12 | **collapse** (F1–F3 expanded) | 파서 없음. 선례 정확 일치 |
| 흡수하지 않은 findings | 8 | **collapse** (G1–G3 expanded) | 파서 없음. 선례 정확 일치 |
| User Intent | 10 | 유지 | `intent-context.js:390`의 `findSection` + 엄격 구조 가드. 구조 위반은 섹션을 **부재**로 만들어 게이트를 차단한다 |
| Files to Change | 18 | 유지 | `receipt/dedupe.js:40`의 `FILES_HEADING_RE`가 heading 직후 표를 찾는다. 감싸면 planned 매칭이 전량 residual로 떨어진다 |
| Tasks | 9 | 유지 | `/mccp:prp-implement`의 실행 입력 |
| Patterns to Mirror · Risks | 9 · 7 | 유지 | 파서는 없으나 plan 템플릿의 표준 섹션이다. 감싸면 이 문서만 형식이 달라진다(선례 0건) |
| Acceptance | 8 | 유지 | 체크율이 완료 판정 근거(§3.11)이고 fixture가 이 heading을 단언한다 |

## Design Routing Guide

routing mode: `auto` (effective at implement stage). plan 단계는 **recommend-only**이며 이 게이트의
실제 발화는 0건이다. 아래는 implement 단계에서 라우팅될 stage별 명령 목록이다.

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

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 2 (R0는 payload를 저장하지 않아 내용을 읽지 못했고, 읽지 못한 리뷰는 리뷰가 아니므로 R1에서 파일로 재수신했다. cap 3, 1라운드 잔여)
- 합치 결론: 리뷰어는 `needs-attention` · CRITICAL 1건을 냈고, 그 사실 주장 3건은 전부 참이지만 결론은 범주 오류다 — 이 게이트는 EXECUTE **이전**에 돌므로 "구현이 diff에 없다"는 정상 상태다. 새 implement-time 결정은 반증되지 않았고 계획대로 진행한다.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — 요청한 구현이 target diff에 없다 | CRITICAL | REJECT_YAGNI | 범주 오류. 사실 3건(`resolveEventsDir` kind 미배선 · `computeA2`가 `sessions.length` · CLI가 `a3` 단독)은 직접 확인해 전부 참이나, 그것이 곧 이 게이트 시점의 정상 상태다. 리뷰어 target이 `working-tree`로 기본 해소돼 존재하지 않는 diff를 읽었다. ship 시점 diff 리뷰는 `/mccp:pr`의 PR-Codex 소유 |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md` (기각 근거 + 파생 축: implement-gate가 Codex에 *결정 텍스트*를 target으로 넘길 플래그가 없다는 구조 결함)
- Open Questions: 없음 (auto-CRITICAL 카탈로그 해당 0건 — security boundary/atomic state/schema breakage 어디에도 속하지 않는다)
- Codex session 참조: threadId `01a05fb9-e400-7a70-a983-847ed16ff201`

### Design Review

- detector: `skill_available=1` · `design_signal=0` · `reason=no-signal` → **silent_skip**. plan 단계의 `design_signal=true`는 *예정된* 렌더러 변경에 근거했고, 게이트 시점의 tracked diff에는 아직 rendered surface가 없다. critique retry loop과 stage routing은 트리거 미발화로 돌지 않았고, 그 사실을 receipt에 `impeccable_silent_skip`으로 정직하게 남긴다.

### Security Reviewer

`Task(security-reviewer)`가 실행됐고(auto-fallback 아님) 경로 처리 축에서 HIGH 3 · MEDIUM 3 · LOW 2를 냈다.
게이트가 EXECUTE **이전**이므로 흡수의 형태는 "설계 수정"이고, 아래 항목은 전부 Task 1/3/7의
구현 계약에 반영된 뒤 Phase 3에 진입한다(§3.14 — HIGH는 그 자리에서 흡수).

| # | severity | 지적 | 처리 |
|---|---|---|---|
| S1 | HIGH | `commonDirOf`가 resolve 결과에 아무 경계 검사가 없어 `commondir`의 `../` 누적이 저장소 밖 write anchor를 만든다 | **흡수 — 단, 리뷰어의 처방은 채택하지 않는다.** `assertContained(root, common)`는 이 축에서 **항상 거짓**이다: worktree의 common dir(`<repo-root>/.git`)은 worktree root(`.worktrees/c2-…`)의 하위가 아니다. 그 규칙을 쓰면 공유 위치가 어떤 worktree에서도 성립하지 않아 milestone이 통째로 무력화된다. 실제로 성립하는 불변식은 **구조 검증**이다 — resolve된 디렉토리가 git dir의 형태(`HEAD` 존재 ∧ (`objects` ∨ `refs`) 디렉토리 존재)여야 하고 아니면 `null`. 임의 디렉토리로의 착지를 막으면서 정당한 common dir은 전부 통과한다 |
| S2 | HIGH | `commonDirOf(x) === commonDirOf(cwd)` 문자열 동등은 Windows에서 unsound (대소문자 · 구분자 · junction) | **흡수** — 비교 전 `path.resolve` → `fs.realpathSync.native` → win32에서 case-fold → 후행 구분자 제거. realpath 실패는 fail-closed(비동등으로 처리) |
| S3 | HIGH | 마이그레이션의 cross-worktree 열람 gate가 S1/S2와 같은 primitive를 유일 인가로 재사용해 순환이다 | **흡수** — 마이그레이션은 1회 실행 도구라 spawn이 허용되므로(Task 3) 손수 파싱 대신 `git -C <path> rev-parse --git-common-dir`로 **git 자신에게 묻는다**. 더해 대상 경로가 symlink 아닌 실디렉토리인지 `lstatSync`로 확인한다. `commonDirOf` 손수 파싱은 hot path(spawn 금지)에만 남는다 |
| S4 | MEDIUM | `gitdir:` 행과 `commondir` 내용의 trailing LF/CRLF 미처리 시 경로 세그먼트에 제어문자가 섞여 throw | **흡수** — 두 read 직후 `.trim()`. 이것은 보안 이전에 정확성 결함이다(실 worktree 파일이 실제로 LF 종단) |
| S5 | MEDIUM | `a1 --repo-root`가 argv를 무검증으로 `path.join`에 넘긴다 | **흡수** — `.claude` 또는 `.git` 마커 보유를 요구하고 미보유면 거절. 거절해도 `a1`은 계약대로 exit 0 + 빈 stdout |
| S6 | MEDIUM | 마이그레이션 copy loop에 per-file 크기 상한이 없다 (writer는 `PER_FILE_MAX_BYTES` 보유) | **흡수** — writer와 같은 상한을 적용하고 초과 파일은 skip + loud stderr |
| S7 | LOW-MED | `*.jsonl` glob이 symlink 항목을 거르지 않는다 | **흡수** — `lstatSync(file).isSymbolicLink()`이면 skip |
| S8 | LOW | copy loop의 malformed line 처리 미명시 | **흡수** — writer 헤더가 선언한 per-line 격리를 그대로 미러 |

MEDIUM·LOW도 전부 흡수한 이유는 신규 작성 코드의 1~3줄 변경이라 backlog 추적 비용이 흡수 비용보다
크기 때문이다(§3.16의 선례 — 라운드를 늘리지 않는 것이 요지이지 고치지 않는 것이 아니다).
