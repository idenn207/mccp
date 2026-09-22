# Implementation Report: closure-accounting M2 — reseal-path

## Summary

M1이 격차를 **보이게** 만들었고, M2는 그것을 **닫는 경로**를 만들었다. 봉인 분모는
`sha256:f171a42e…`(1115건, 7일 경과)에서 `sha256:78aead8c…`(2841건)으로 **승계**됐고,
기존 판정 1101건이 결속을 끊지 않고 따라왔다. `denominator_gap.count`는 **1738 → 0**.

같은 실행이 `verify`의 `open`을 **0 → 1740**으로, `ok`를 `true → false`로 뒤집었다.
**그 뒤집힘이 이 milestone의 성공 신호다**(DD7) — 앞선 `open: 0`은 얼어붙은 분모를
측정한 산물이었고, 그것이 이 PRD가 지목한 "성공 방향 기본값"이다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 12 | 12 planned + 3 substantive unplanned (아래 Deviations) |
| carried / blocked / dropped | 합이 판정된 옛 항목 수 | 1101 + 0 + 14 = 1115 ✓ |
| 라이브 재봉인 | 1회 | 1회 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `sealAncestry` — 조상 사슬 판독 | 완료 | 형태 → 재계산 → git 인덱스 3조건 |
| 2 | `checkSuccessor` 조상 허용 + DD9 수락 마커 | 완료 | 시그니처는 4번째 인자를 `string \| string[]`로 확장 |
| 3 | `verifyDispositions` 결속 3분할 | 완료 | 두 호출 지점 모두 ancestry 전달 |
| 4 | `planReseal` 순수 오라클 | 완료 | 산술 항등식 1101+0+14=1115 실측 |
| 5 | `applyReseal` | 완료 | manifest → 아카이브 → **선검증** → 봉인 → append |
| 6 | CLI dry-run 기본 | 완료 | `apply` without `--apply` → exit 2 |
| 7 | `closure report` 문구 정정 + `ancestry_depth` | 완료 | "M2 responsibility" 제거, 경로를 이름으로 부름 |
| 8 | 문서 · PRD · CHANGELOG | 완료 | `## Re-sealing` 절 신설 |
| 9 | 라이브 재봉인 1회 (UI6) | 완료 | 3키 아티팩트 봉인 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | 통과 | `node --check` 전건 (이 저장소에는 type-check/lint 스크립트가 없다 — `package.json` 부재) |
| Unit Tests | 통과 | 83 pass / 0 fail — 신규 16 + 인접 67 (m10 30 · report 28 · backlog-source 9) |
| Build | N/A | 빌드 단계 없음 |
| Integration | 통과 | 라이브 재봉인 1회 완주 |
| Edge Cases | 통과 | 아래 mutation 표 |

plan `## Validation` 1~9: **전건 exit 0** (3번 diff 무출력 · 8번 grep 미매치).

### 양방향 mutation — test 비공허성

각 방어를 하나씩 꺼서 실제로 red가 되는지 확인했다. 처음 돌렸을 때 **(c)가 green으로
남았고**, 그것은 코드 결함이 아니라 **내 test 집합의 구멍**이었다: 아카이브 부재와
untracked는 덮었지만 "존재하고 tracked인데 **다른 내용**"을 덮은 case가 없었다.
그 case를 추가한 뒤 전건이 red가 된다.

| Mutation | 결과 |
|---|---|
| (a) 조상 허용 끄기 | fail 7 |
| (b) `ancestor_bound_lines` 분리 되돌리기 | fail 2 |
| (c) DD2 재계산 끄기 | **최초 fail 0 → test 보강 후 fail 1** |
| (c2) git-tracked 조건 끄기 | fail 1 |
| (d) 마커 규칙을 `indexOf`로 되돌리기 | fail 2 |
| (e) 수락을 조상 집합이 아니라 `succeeded_from`으로 키잉 | fail 1 |
| (f) step 1b의 `git add` 제거 | fail 6 |
| (g) 완료된 manifest가 resume을 고르게 (Codex R1 결함) | fail 1 |
| baseline | fail 0 |

## Files Changed

| File | Action | Planned? |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/reseal.js` | CREATED | 예 |
| `plugins/mccp/scripts/lib/tests/msw-reseal.test.js` | CREATED | 예 (16 tests) |
| `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js` | UPDATED | 예 |
| `plugins/mccp/scripts/lib/closure/report.js` | UPDATED | 예 |
| `plugins/mccp/scripts/lib/closure/tests/report.test.js` | UPDATED | 예 |
| `docs/multi-session-work-loop/debt-deferred-{critical,high,minor}.md` | UPDATED | 예 (수락 마커) |
| `docs/multi-session-work-loop/debt-inventory.md` | UPDATED | 예 |
| `docs/multi-session-work-loop/seals/debt-inventory-f171a42e2c34.json` | CREATED | 예 (파일명 이탈 — 아래) |
| `.claude/state/reseal-manifest.json` | CREATED | 예 |
| `.claude/_meta/data/2026-09-08-closure-reseal-live.json` | CREATED | 예 |
| `.claude/prds/closure-accounting.prd.md` | UPDATED | 예 |
| `CHANGELOG.md` | UPDATED | 예 |
| `plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js` | UPDATED | **아니오** |
| `docs/multi-session-work-loop/debt-inventory.json` | UPDATED | **아니오** (재봉인 산출) |
| `docs/multi-session-work-loop/debt-dispositions.jsonl` | UPDATED | **아니오** (승계 1101줄) |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | 명령 본문 의무(§3.14) |
| `.claude/notes/closure-accounting-m2-implement-review.md` | CREATED | 명령 본문 2.5.4 |

## Deviations from Plan

**D1 — 아카이브 파일명이 `Files to Change`의 예시와 다르다.** plan은 규칙을 `<sha12>`로
3회 부르면서 표의 구체 파일명은 8자(`debt-inventory-f171a42e.json`)로 적었다. 쓰기 측과
읽기 측의 절단 길이가 어긋나면 조상이 **영원히 미검증**이 되므로 방향은 안전하지만 설계가
조용히 죽는다. 다수결이자 규칙 쪽인 `sha12`를 택하고 `ARCHIVE_SHA_PREFIX_LEN` 단일 상수로
고정했다. 실제 파일: `debt-inventory-f171a42e2c34.json`. (implement-gate security review S7)

**D2 — review record가 plan 본문이 아니라 `.claude/notes/`에 있다.** 명령 본문 2.5.4는
`## Codex Implementation Review`를 plan에 주입하라고 하지만, 이 plan은 자기 본문에
"이 절 밖을 고치면 receipt를 다시 쓸 수 없다"고 **스스로 동결을 선언**했다. 실제로 주입하자
`mccp-plan-codex` receipt가 즉시 `stale`이 됐고(`d22035b3…` → `fa64453e…`) `validate`가
exit 2로 막았다. plan을 바이트 단위로 복원(55065 bytes 일치 확인)하고 명령 본문이 제공하는
notes 경로를 썼다. 두 receipt 모두 fresh다.

**D3 — 파일 확장 3건 (escalated).** `plan-conflict-detector`가 `file-expansion`으로 잡았고
**흡수하지 않고 escalate**했다(`fix-task.md` + `STATE.md.chain_aborted=true` +
`meta.plan_conflict_escalated`). 내 판단은 이것이 *구현 이탈*이 아니라 *plan 표의 누락*이라는
것이다:
- `debt-inventory.json` · `debt-dispositions.jsonl` — Task 5와 Task 9가 **존재 이유로** 바꾸는
  파일이다. 표에 없는 것이 이상하다.
- `msw-m10-producers.test.js` — DD9가 부분 문자열 규칙을 교체하므로 **그 규칙을 고정한 test는
  반드시 바뀐다**. plan은 라이브 successor 문서 3건의 편집은 예견했지만 그 규칙을 단언하는
  test는 열거하지 않았다.

**다만 그 판단은 내 것이고, 게이트는 사람의 확인을 요구한다.** `chain_aborted=true`가 자동
commit/PR을 막아 둔 상태다.

## Issues Encountered

**I1 — plan-conflict escalation이 앞선 receipt 플래그를 덮어썼다.** 명령 본문의 escalation
3단계는 `--plan-conflict-escalated` 하나만 넘기는 bare write인데, receipt write는 merge가
아니라 **재작성**이라 `resolution.codex_verdict`가 `undefined`가 되고
`meta.impeccable_silent_skip`이 **거짓으로** `false`가 됐다. 전자는 fail-closed라 안전하지만
"Codex가 divergent라고 말했다"는 기록이 지워지고, 후자는 사실이 아니다. 전 플래그를 한 번에
실어 다시 썼다. 명령 본문의 결함이며 이 저장소의 다른 게이트에도 같은 형태가 있는지는
확인하지 않았다.

**I2 — `mask.test.js`가 main에서 이미 red다.** `git archive HEAD`로 뽑은 깨끗한 트리에서
동일하게 실패하는 것을 확인했다(M2와 무관). backlog에 재현 절차째 적재했다.

**I3 — DD8 실현.** `m10-coverage-gate.js`가 같은 트리에서 exit 0 → **exit 1**이 됐다. 예견된
결과이고 옛 봉인을 아카이브로 보존해 그 판정이 어느 다이제스트 위에서 성립했는지는 대조
가능하다. 문서에 적었다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/msw-reseal.test.js` | 16 (신규) | 승계 append · 판정 verbatim 복사 · 조상 3조건 · 결속 3분할(과다허용 방향 포함) · 마커 vs 부분문자열 · **A→B→noop→B→C** · 신규 deferral 마찰 보존 · manifest 상태기계 4갈래 · 두 번째 writer 부재 스캔 · fail-closed · 산술 항등식 |
| `plugins/mccp/scripts/lib/closure/tests/report.test.js` | +1, 1 수정 | `ancestry_depth` null-on-unjudgeable · warning이 경로를 이름으로 부름 |
| `plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js` | 3 수정 | 옛 substring 규칙을 고정하던 단언을 마커 규칙으로 |

## Acceptance — 실측

`.claude/_meta/data/2026-09-08-closure-reseal-live.json` (before/reseal/after 3키, **단일
프로세스**에서 캡처해 그 사이 게이트가 부채를 덧붙일 수 없게 했다):

| 관계 | 결과 |
|---|---|
| `after.denominator_gap.count === 0` | **0** ✓ |
| `after.seal.ancestry_depth === before + 1` | 0 + 1 === 1 ✓ |
| `after.verify.binding_mismatch === 0` | 0 ✓ |
| `after.verify.invalid_dispositions === 0` | 0 ✓ |
| `ancestor_bound_lines === before.dispositions.total` | 1115 === 1115 ✓ |
| `after.verify.open > 0` (성공 신호) | 1740 · `ok:false` ✓ |

**퇴로를 쓰지 않았다.** plan의 `## Codex Adversarial Review` B항은 "재측정한다"가 실행
불가일 수 있다고 경고했지만(부채 writer가 끼어들면 그 행은 계속 분모 밖), 측정 창이 조용해
0을 **실제로 관측**했다. 창을 다시 잡을 필요가 없었다.

## Next Steps

- [ ] 사람 확인: D3의 파일 확장 3건 수용 여부 (`chain_aborted` 해제 조건)
- [ ] `/mccp:code-review` 또는 `/mccp:pr`
- [ ] 재봉인은 **단일 커밋**으로 유지할 것 — 롤백 경로가 git뿐이다
