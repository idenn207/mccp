# Implementation Report: review-record-linkage M3 — bidirectional-link

**Plan**: [`.claude/plans/review-record-linkage-m3.plan.md`](../../plans/review-record-linkage-m3.plan.md)
**Branch**: `review-record-linkage` · **Version**: `1.34.2 → 1.34.5`
**Date**: 2026-09-03

## Summary

결정층(ship receipt)과 내용층(패널 레코드)이 서로를 가리킨다. `/mccp:plan`이 레코드 경로를
plan receipt에 봉인하고, `/mccp:pr`이 — **상류 receipt의 `meta.plan_path`가 이 ship의 plan
경로와 일치할 때에만** — 그 값을 ship receipt로 전파한 뒤, ship이 봉인된 직후 그 해시를
레코드로 되쓴다. 같은 milestone에서 지표 2의 분모 생산자(`plan_review_expected`)와, 그 산출
실값을 읽을 **라이브 감사 파티션**(읽기 원천 = `HEAD` 트리)을 만들었다.

앵커가 어긋나면 침묵한다(무스탬프). 못 찾는 것보다 **잘못 찾는 것**이 위험하다 — 전자는
`undecidable`이지만 후자는 다른 마일스톤의 리뷰를 자기 승인 증거로 해시 봉인한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 확인 |
| Files Changed | 25 (신규 4 포함) | **28 변경 + 7 신규** |
| Version target | `1.34.3` | **`1.34.5`** — R7 재발(10회차), origin/main이 1.34.3·1.34.4 선점 |
| 신규 module | 1 (`link-receipt.js`) | **2** — `repo-path.js` 추가 (finding `7a88ff03` 흡수) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | receipt 계약 — present-only 5필드 | 완료 | `meta.plan_path`는 CLI 플래그 없음. 행위 증명으로 고정 |
| 2 | 레코드에 `receipt_hash` 자리 | 완료 | `plan_path` 정규화를 공유 헬퍼로 |
| 3 | back-patch 변환 (`link-receipt.js`) | 완료 | 순수·총함수. CRLF 보존 |
| 4 | `link-receipt` 서브커맨드 + containment | 완료 | **전용 write-locus resolver** (H1 흡수) |
| 5 | 자격 판정과 전파 (`finalize-receipt.js`) | 완료 | 7분기 전부 test |
| 6 | 게이트 본문 배선 | 완료 | 2.5.7 placeholder 제거 · plan-path 단일 원천 |
| 7 | evidence commit 4중 확장 | 완료 | 예외는 리터럴 1경로 (prefix 아님) |
| 8 | join 전환 + 라이브 파티션 + 동결 재생성 | 완료 | 수치 바이트 불변 (differing fields = 2, NUMERIC = 0) |
| 9 | 배선 부재 test | 완료 | 정적 10 + spawn e2e 4 |
| 10 | 릴리스 4면 + PRD | 완료 | PRD는 이미 정합 (M1 complete · M3 in-progress) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | JS + Node native runner. type-check/lint/build 스크립트 없음 (`package.json` 부재) |
| Unit / Integration | **Pass** | plan Validation 1번 12파일 = **230/230** |
| Receipt suite 전수 | **Pass** | `receipt/tests/*` = **716 tests, 715 pass, 0 fail** |
| plan-review + evidence 전수 | **Pass\*** | 413 중 404 pass · 8 fail · 1 skip — 아래 「알려진 실패」 참조 (회귀 아님) |
| env-contract lint | **Pass** | L1~L12 전부 ok |
| 동결 결정성 | **Pass** | `--frozen-only` 2회 실행 바이트 동일 |
| 과거 hash 불변 | **Pass** | tracked ship receipt 79건 **무변경** · `evidence-audit` `ok:25 false_positive:0 degraded:false` |
| 라이브 완주 | **Pass** | 아래 산출 실값 |

### 산출된 실값 (`linkage-audit.js --json`)

```
global state      : ok
frozen join       : explicit_field
live ref          : HEAD          live state: ok
head ships/records: 79/59         worktree diag: 4/7
denominator       : null          bidirectional: 0
dangling/stale    : 0/0
```

`bidirectional=0`은 **정상이고 예측된 값**이다(plan Acceptance의 부트스트랩 절). 이 사이클의
상류 `mccp-plan-codex` receipt는 Task 1이 `meta.plan_path`를 신설하기 **전에** 발행됐으므로
앵커가 legacy로 보아 무스탬프한다 — 앵커가 옳게 동작한 결과다. 0을 1로 만드는 유일한 방법은
앵커를 끄거나 파일명 fallback을 되살리는 것이고 둘 다 이 plan이 금지했다. 라이브 링크는
**다음 사이클**에서 확인한다.

### Design Grounding

**N/A** — Phase 2.5.5b 시점 `design_signal=false`(`no-signal`)라 2.5.5c capture가 없었고,
따라서 Phase 3.7은 완전 no-op이다. Phase 3.6은 post-EXECUTE에서 `design_signal=true`로
재도출됐고(whitelist 3파일이 diff에 진입), `renderingSurface=0`이라 finish 5종이 전부
`recommend`로 강등돼 receipt에 기록됐다. plan의 `## Design Critique`가 예고한 대로 이 hit는
*파일 정체성* whitelist 일치이지 디자인 내용 판정이 아니다 — 두 renderer 변경은 version
리터럴 1개씩이다.

## R4 패널 HIGH 5건 흡수 (착수 전 의무)

| id | 흡수 |
|---|---|
| `7a88ff03` | 신규 `lib/repo-path.js` — `require`는 `path` 하나(순수 builtin). `write.js`·`record.js`·`link-receipt.js`·`finalize-receipt.js`가 **한 구현**을 공유 |
| `613d8e5f` | `link-receipt --expect-plan-path` 필수(부재도 exit 12), 결속 검사가 **쓰기 이전**에 fail-closed |
| `682a31c5` | stale-hash 음성 test + 해시만 고치면 계수되는 양성 대조군 |
| `9ffdd2e3` | 라이브 파티션 `state`/`reason`/`scope_unknown` 사다리. `scope_unknown`이면 `linkage` 미방출 |
| `0c8735fe` | Validation 3번을 `$(git rev-parse --git-path mccp/tmp)`로 (linked worktree에서 `.git`은 파일) |

## Security Reviewer 흡수 (HIGH 1 · MEDIUM 2 · LOW 3)

| id | 흡수 |
|---|---|
| **H1** | `link-receipt`가 읽기 전용 `resolveContained`를 재사용하지 않는다. 그 함수는 realpath 실패를 **미해소 lexical 경로 + `ok:true`**로 통과시키고(읽기 호출자용 의도), `.claude/reviews`가 디렉토리 심볼릭 링크면 쓰기가 저장소 밖으로 나간다. `writePrivate`의 rename 보장은 **leaf** 심볼릭 링크에 대한 것이다. 전용 resolver: 실재 요구 · lstat 비-심볼릭 leaf · realpath **필수 성공**(lexical fallback 없음) · 해소된 realpath로만 read/write |
| M1 | 앵커를 env가 아니라 **argv + 아티팩트**로. 진입 시 삭제하고 성공 후에만 tmp+rename → stale 상속 경로 없음 |
| M2 | guard의 `.md` 분기가 **staged 경로 == 앵커 경로**까지 검사. 훗날 stdin 생산자가 prefix로 넓어져도 guard 단독으로 막는다 |
| L1 | 단일 아티팩트 + 단일 검증기 `parseLinkEvidence` — 단일 줄 · 접두 · `..` 부재 · 제어문자 부재 · hash 형태 |
| L2 | 대소문자 false-negative는 **의도된 트레이드오프**로 문서화. 고치지 않는다(R3가 거부한 "파일시스템 질의로의 성격 변화") |
| L3 | `link-receipt.js`가 `repo-path.js`를 require — 정규화 두 벌 방지 |

리뷰어 권고 1건 추가 채택: `meta.plan_path`의 플래그 미주입을 **부재 증명이 아니라 행위
증명**으로(적대적 `--plan-path`를 실제로 전달).

## Deviations from Plan

1. **신규 파일 `plugins/mccp/scripts/lib/repo-path.js`** — plan의 Files to Change에 없다.
   finding `7a88ff03`이 "헬퍼가 살 곳이 없다"를 정확히 지적했고, 그 셋(계층 역전 ·
   `linkage-defs.js` 동결 · 두 벌 구현) 중 어느 것도 택할 수 없었다. §1.2대로 dedupe planned
   matcher를 빗나가 PR-Codex가 발화한다(fail-closed 방향이라 안전).
2. **version 목표 `1.34.3` → `1.34.5`** — R7 10회차 재발. §3.7·UI14대로 `/mccp:pr` 진입
   직전에 **한 번 더** 재계산해야 한다.
3. **hash 형식 정정** — `link-receipt`의 `--receipt-hash`를 bare 64-hex가 아니라
   `sha256:<64hex>`로. 초안 test가 bare hex로 통과했는데 그것은 **이 저장소의 어떤 producer도
   만들지 않는 형식**이라, 그대로 뒀으면 실제 back-patch가 매번 거절되면서 suite는 green이었다.
   `evidence-stage-guard`의 anchor test가 그 불일치를 잡았다.
4. **`fs.realpathSync` → `.native`** — Windows 8.3 단축명(`ADMINI~1`)을 일반 realpath는 확장하지
   않는다(실측). `repoRoot`(git)와 `planAbs`(cwd)의 철자가 갈리면 fold가 plan을 repo 밖으로
   보고해 `meta.plan_path`가 조용히 누락된다. 안전한 방향이지만 정상 plan에 대해 조용히 틀린다.
5. **M1 test 1건 갱신** — `D3 surfaces the join it actually uses`가 `filename_convention`과
   그 상한을 pin하고 있었다. 계약이 바뀌었으므로 옛 단언은 회귀 가드가 아니라 새 동작을
   금지하는 화석이다. 조인 라벨 + `join_note`가 자기 조인을 말한다는 성질로 교체.
6. **`plan.md`의 plan-path 기록 위치** — 퍼지 블록 직후가 아니라 `mode.json` 파생 **뒤**로.
   `plan-review-command-body.test.js`의 R5 reset test가 퍼지 후 8줄 창을 보는데 내 6줄이
   `mode.json`을 창 밖으로 밀었다. 순서는 무관하므로 이동이 옳고, 창을 넓히면 그 test의
   촘촘함이 사라진다.

## 알려진 실패 (회귀 아님 — 명시 이연)

`plan-review-cli-emit.test.js` **8건**이 이 세션의 round-cap **seal**
(`<gitdir>/mccp/tmp/review-rounds-seal.json`, Phase 2.5.0이 작성)을 상속해 `emit-workflow-args`가
BLOCK된다. **기계 확인**: seal을 잠시 치우면 **12/12 pass**, 되돌리면 8 fail. 이 test는 임시
dir에서 CLI를 spawn하지만 gitdir을 격리하지 않는다. M3 코드와 무관하고 M3 범위 밖이라
backlog에 `id=m3-seal-leak`로 이연했다. **seal은 원문 그대로 복원했고 라운드 원장은 손대지
않았다**(§3.16 — 원장을 지우는 것은 정당한 행동 목록에 없다).

## Tests Written

| Test File | 신규 | 덮는 축 |
|---|---|---|
| `linkage-link-receipt.test.js` (CREATE) | 14 | 변환 · 멱등 · CRLF · 결속 · containment · 캐리어 |
| `linkage-wiring.test.js` (CREATE) | 14 | 정적 배선 10 + spawn e2e 4 (양성·불일치·legacy·반증가능성) |
| `receipt-linkage-fields.test.js` (CREATE) | 12 | present-only · hash 불변 · over-permissive 거부 · 플래그 미주입 |
| `linkage-audit.test.js` (UPDATE) | +7 | 라이브 파티션 · 커밋/미커밋 · stale hash · dangling · 분모 · 사다리 · 동결 무누출 |
| `pr-phase-helpers/finalize-receipt.test.js` (UPDATE) | +10 | 앵커 7분기 + unknown source + 형태 거부 + 표기 면역 |
| `evidence-stage-guard.test.js` (UPDATE) | +7 | 리뷰-레코드 분기 · 앵커 부재 fail-closed · 경로 동등 · stale |
| `plan-review-record.test.js` (UPDATE) | +4 | `receipt_hash` 자리 · 정규화 동작 · never-throws |
| `linkage-frozen-baseline.test.js` (UPDATE) | +3 | 결정성 · EOL 정규화 · 라이브 키 무누출 |

## 로컬 code-review 흡수 (2026-09-03, commit 직전)

`/mccp:code-review` Local Review Mode가 낸 지적 **9건을 전건 수용**했다. 이연 0건.

| 심각도 | 지적 | 흡수 |
|---|---|---|
| **HIGH** | `pr.md` Phase 3.0의 `LINK_RECORD` 추출이 `node -e` 안 top-level `return` 때문에 `SyntaxError` — **파싱 실패**라 정상 아티팩트에서도 실행되지 않고, `2>/dev/null`과 `\|\| printf ''`가 그것을 삼켜 값이 **항상 비었다**. 네 widening(진입 predicate · stage 집합 · guard stdin · OUTSIDE 예외)이 전부 죽어 back-patch된 레코드가 히스토리에 도달하지 못했다 — R4 invariant `id=0dfe87db`가 예측한 분기 (i)가 그대로 재현된 것이고, `bidirectional=0`이라 **부트스트랩과 관측상 구별되지 않았다** | `return` 제거 + 조건 분기로 교체. **`linkage-wiring.test.js`가 이제 그 스니펫을 명령 본문에서 뽑아 실제로 spawn**한다(양성 1 + 음성 3, 두 muffler 없이). 반증 확인 완료 — `return`을 되돌리면 red |
| MEDIUM | `link-receipt.js`의 해시 거부 메시지가 `/^[0-9a-f]{64}$/`라고 적는데 강제되는 것은 `/^sha256:[0-9a-f]{64}$/`. Deviations 3번이 기록한 바로 그 혼동을 운영자에게 다시 가르쳤다 | 두 메시지를 `RECEIPT_HASH_RE.source`에서 파생 — 정규식이 바뀌면 문구가 따라간다 |
| MEDIUM | `plan.md` 5.6b가 `PLAN_PATH`를 빈 값만 검사한다. 5.2가 리터럴로 쓰는 미치환 `<plan path>`는 **비어있지 않아** 통과하고 `write.js`의 `planAwareMarkdownHash`에서 불투명한 ENOENT로 죽는다 — 새로 쓴 "Re-run Phase 5.2" 안내는 발화하지 않는다 | `pr.md` 2.5.7과 대칭인 `[ ! -f ]` HALT 추가. 두 게이트가 같은 실수에 같은 방식으로 실패한다 |
| MEDIUM | 패널 레코드를 `archive/`로 옮기면 봉인 경로가 dangling이 되고 §3.12 때문에 되돌릴 수 없다. 가정이 아니라 이 저장소에 이미 4건 실재 | `linkage-audit.js` 주석 + `frozen-baseline.md`에 전용 절. basename fallback은 **의도적으로 넣지 않는다**(M3가 없앤 파일명 조인의 뒷문) |
| MEDIUM | 이 브랜치의 `/mccp:pr`은 `SHIP_PLAN_PATH` 기본 파생(`review-record-linkage`)이 실재하지 않아 새 HALT에 막힌다 (R12, 실측) | 아래 Next Steps에 명시 |
| LOW | `computeLinkage`에 `recordBySlug`를 넘기지만 읽지 않는다 — 맵 생성까지 죽은 계산 | 인자·맵 제거. 다음 사람이 "두 조인이 공존한다"고 읽지 않도록 사유를 남김 |
| LOW | guard가 `.md` 확장자로 라우팅하는데 carrier는 `.md`를 요구하지 않아, 확장자 없는 경로가 **틀린 사유**("non-JSON path under receipt corpus")로 HALT | `parseLinkEvidence`가 `.md`를 요구 — 두 라우터가 구조적으로 일치 |
| LOW | back-patch는 ship 확정 **전**이라, 이후 HALT하면 착지하지 않은 해시가 tracked 레코드에 남고 롤백 경로가 없다 | 호출 지점에 명시. 잔여는 `stale_receipt_hash`로 관측되고 재실행이 멱등적으로 덮는다 |
| LOW | fence 치환이 문서 전체를 split·rejoin해 혼합 개행 파일을 전면 재작성 — "바뀐 것은 한 줄"이라는 주석과 어긋남 | 오프셋 splice로 교체. fence 밖 바이트 무변경, 삽입 줄만 여는 fence의 종결자를 따른다 |

## Next Steps

- [ ] **`/mccp:pr` 진입 전 `export PR_PLAN_PATH=.claude/plans/review-record-linkage-m3.plan.md`** — 기본 파생 `.claude/plans/review-record-linkage.plan.md`는 실재하지 않아 2.5.7이 HALT한다 (R12, 실측)
- [ ] `/mccp:pr` 진입 **직전** version 재계산 (§3.7 · UI14 — R7 10회차)
- [ ] 다음 사이클에서 **라이브 링크 완주** 확인 (`bidirectional >= 1`) — 이 사이클의 이연 항목
- [ ] backlog `id=m3-seal-leak` (test 격리) 처리
- [ ] M4 `review-round-structure`가 PRD의 마지막 milestone — 완료 시 minor bump + `/mccp:archive-complete`
