# Implementation Report: 게이트 배선 오라클 추출 (diverse-agent-review M5)

## Summary

게이트 승인 배선(`plugins/mccp/commands/*.md` 안의 셸 블록)을 단위 test 사거리 안으로 옮겼다.
정본 셸 블록 추출기 1개 + 실측에서 도출한 seam 규칙 3종 + 열거된 부채 래칫 + lint CLI 를
새로 만들고, 저장소에 흩어져 있던 0칼럼 고정 추출기 사본 2벌을 그 오라클 소비로 이전했다.

**게이트 본문은 한 줄도 바뀌지 않았다** — commit range · working tree · index 세 축 모두에서
`plugins/mccp/commands/` diff 가 공집합이다. 오라클이 찾은 실결함 18건은 전부 backlog 로
이연했다(UI2 — 추출 전 배선 변경 금지).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 16 | 17 (notes 1건 추가 — 아래 Deviation 4) |
| S1 실측 위반 | 5 | **5** (일치) |
| S2 실측 후보 | 7 | 5 (헬퍼 escape 1 + 미검출 1 — Deviation 5) |
| S3 실측 위반 | 5 | **5** (일치) |
| 미채택 규칙 sizing | 283 | **163 / 182** (재현 불가 — Deviation 3) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 정본 블록 추출기 `blocks.js` | 완료 | 닫힘 술어는 plan 문면과 다르게 구현 — Deviation 1 |
| 2 | seam 규칙 3종 `rules.js` | 완료 | S3 술어에 조건 1개 추가 — Deviation 2 |
| 3 | 변이 test | 완료 | 규칙마다 red/green 짝 + lexical 제외 4짝 |
| 4 | 부채 래칫 `debt.js` | 완료 | 18건 열거 + `SEAM_DEBT_CEILING` + `ASSERT_BASELINE` |
| 5 | `lint.js` run() + CLI | 완료 | 부분 코퍼스 가드를 3 check 전부에 적용 |
| 6 | 기존 test 2개 이전 | 완료 | 6a delta 측정 · 6b F1 경계 이전 · 6c 비공허 짝 · 6d 미발동 |
| 7 | 미채택 규칙 기록 | 완료 | `docs/diverse-agent-review/gate-wiring-oracle.md` |
| 8 | version 4면 동기 + PRD/CHANGELOG | 완료 | `1.33.2 → 1.33.3` |

## Validation Results

| # | 검사 | 결과 |
|---|---|---|
| 1 | lint 실코퍼스 (3 check · `filesRead === filesExpected`) | 통과 — `S1,S2,S3` · 22/22 · debt 18 |
| 2 | 신규 test 3종 | 통과 — 40/40 |
| 3 | 이전된 기존 test 2종 | 통과 — 38/38 |
| 3b | assert 수 baseline 대조 | 통과 — 48 ≥ 46 · 42 = 42 |
| 4 | plan-review suite 무손상 | 통과 — 99/99 |
| 5 | 게이트 본문 diff 공집합 (commit range) | 통과 — 빈 출력 |
| 5b | **working tree + index** (Codex F1 흡수) | 통과 — 양쪽 clean |
| 6 | 삭제 파일 검증 (§3.5.1) | 통과 — 0건 |
| 7 | i18n-surface (version 4면) | 통과 — 10/10 |
| 8 | 문서 sizing 재측정 대조 | 통과 — S1 5 · S2 8 · S3 5, debt 18 |
| 9 | backlog parity (기계 대조) | 통과 — 15/15 |

plan-conflict detector: `conflict=0`.

### Design Grounding

**N/A** — Phase 2.5.5b 시점에 `design_signal=0`(silent-skip, reason=`no-signal`)이라 capture
아티팩트가 없고 Phase 3.7 은 완전 no-op 이다. receipt 에 `impeccable_silent_skip=true` +
사유가 정직하게 봉인됐다.

### Design Finish (Phase 3.6)

Phase 3 에서 renderer 2파일을 수정하자 `design_signal=1`(whitelist 히트)이 되어 finish 패스가
발동했다. `renderingSurface=0`(control-plane-only diff)이므로 오라클이 5개 명령을 전부
`recommend` 로 강등했고, 그 결과를 receipt 에 restamp 했다(`restamp-routed` exit 0).

권장(미실행): `clarify` · `distill` · `harden` · `optimize` · `polish`.

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/lib/command-body/blocks.js` | CREATED |
| `plugins/mccp/scripts/lib/command-body/rules.js` | CREATED |
| `plugins/mccp/scripts/lib/command-body/debt.js` | CREATED |
| `plugins/mccp/scripts/lib/command-body/lint.js` | CREATED |
| `plugins/mccp/scripts/lib/tests/command-body-blocks.test.js` | CREATED |
| `plugins/mccp/scripts/lib/tests/command-body-rules.test.js` | CREATED |
| `plugins/mccp/scripts/lib/tests/command-body-lint.test.js` | CREATED |
| `docs/diverse-agent-review/gate-wiring-oracle.md` | CREATED |
| `.claude/notes/diverse-agent-review-m5.md` | CREATED (Deviation 4) |
| `plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js` | UPDATED |
| `plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js` | UPDATED |
| `.claude/plans/codex-findings-backlog.md` | UPDATED (+17행) |
| `.claude/prds/diverse-agent-review.prd.md` | UPDATED (#5 → complete) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED (1.33.3) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED (page-foot) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED (derived 줄) |
| `CHANGELOG.md` | UPDATED (1.33.3 항목) |

## Deviations from Plan

**1. 닫는 fence 술어를 plan 문면대로 구현하지 않았다.**
plan Task 1 은 "닫는 fence 는 여는 fence 이상의 들여쓰기를 요구한다"고 적었다. 그 술어는
dedented closer 를 닫힘으로 인정하지 않아 블록이 뒤따르는 산문과 다음 fence 를 삼킨다.
Implement-Codex R1 F3 가 지적했고 **실측으로 재현됐다** — 그 초안으로 S1 을 돌리면 위반이
32/32 로 보고된다(참값 5). 승격 대상(`command-tmp-worktree-safe.test.js:39`)의 실제 동작
(열려 있으면 어떤 fence 든 닫는다)을 택했고, 이는 plan 의 "승격한다"는 지시와 정합적이다.
plan 의 그 한 문장이 mirror 대상의 실제 동작과 어긋나 있었다.

**2. S3 술어에 조건을 하나 더했다.**
plan 의 2조건(stderr 폐기 ∧ fail-open)만으로는 41건이 잡히고 그중 36건이
`git`·`mktemp`·`kill`·`cat`·`ls` 다 — loud-fail-open 계약이 없는 명령들이다. plan 이 실측한
후보 5건이 **전부 node 계측 호출**이라는 사실에서 세 번째 조건을 도출했다(UI3 — 근거 없이
넓히거나 좁히지 않는다). 조건 추가 후 정확히 그 5건이다.

**3. 미채택 규칙의 sizing 이 plan 의 283건과 다르다.**
제 정의로는 163(lexical stripping 적용) / 182(raw)이고 파일별 내역도 대체로 절반이다.
**숫자를 맞추려고 측정 방법을 바꾸지 않았다.** 두 열의 정의를 문서에 명시해 재현 가능하게
하고, plan 의 숫자를 재현할 수 없다는 사실과 추정 원인(집계 단위 차이)을 함께 기록했다.
미채택 결론은 바뀌지 않는다 — 근거가 절대 수가 아니라 "다수가 정당하다"는 성질이기 때문이다.

**4. Codex 리뷰 섹션을 plan 이 아니라 notes 에 썼다.**
plan 은 `mccp-plan-codex` receipt 에 `plan_hash` 로 봉인돼 있어 본문을 고치면 그 receipt 가
stale 이 되어 `/mccp:pr` 에서 차단된다. 커맨드 본문 Phase 2.5.4 가 허용하는 notes 경로
(`.claude/notes/diverse-agent-review-m5.md`)를 썼다. Files to Change 가 16 → 17 이 된 이유다.

**5. S2 가 후보 7건 중 5건을 보고한다.**
`plan.md:1252` 는 plan 이 예고한 헬퍼 본문 escape 로 정상 제외됐다. `work.md:60` 은
**미검출**이고 이는 줄 단위 lexical 근사의 한계다 — 앞 줄에서 열린 홑따옴표를 닫는 줄이라
`scrubQuotes` 가 나머지를 데이터로 지운다. 놓치는 방향이 "위반을 덜 보고"라 규칙이 조용히
꺼지지는 않으나, 그 1건은 현재 부채에도 없다. 문서 §4 에 한계로 기록했다.

## Issues Encountered

**셸 인라인에서 정규식 이스케이프가 깨진다.** `node -e '...'` 와 quoted heredoc 양쪽에서
`\\` 가 `\` 로 축약되어 `new RegExp("\\$\\{?" + name + "\\b")` 가 `/${?NAME/` 이 되고 `\b` 는
backspace 문자가 됐다. 그 결과 S1 이 32/32 오탐을 냈다. 규칙 모듈을 파일로 작성해 해소했다
(이 milestone 이 다루는 seam 문제의 실물 사례라 문서와 이 보고서에 남긴다).

**부채 래칫의 축소 방향이 조용히 꺼져 있었다.** `debtKey` 가 NUL 로 join 하는데 `lint.js` 의
화석 필터가 공백으로 split 해 필터가 항상 false 였다 — 화석이 하나도 보고되지 않으면서 lint 은
green 이었다. **변이 test 가 이것을 잡았다**(`a fossil debt row ... is reported` 가 red).
구분자 규약을 두 모듈에 나눠 두면 어긋날 수 있으므로, 키를 되파싱하지 않고 `{count, row}`
구조를 들고 다니도록 고쳐 그 실패가 **존재할 수 없게** 만들었다. 이것이 정확히 이 milestone 이
겨냥한 실패 클래스("단위 test 통과 ≠ 경로 작동")이고, 짝 단언의 가치가 실증된 지점이다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `command-body-blocks.test.js` | 9 | 들여쓴 fence · 태그 집합 · dedented closer(F3) · 미종료 · CRLF · 실코퍼스 13건 |
| `command-body-rules.test.js` | 18 | S1/S2/S3 변이 짝 · "이후" 술어 · cross-fence · lexical 제외 4짝 · S3 3조건 반증 |
| `command-body-lint.test.js` | 13 | 실코퍼스 · 래칫 양방향 · 화석 · 개수 기반 면제 · 부분/빈 코퍼스 · digest 정규화 |

기존 2파일의 assert 수는 46 → 48, 42 → 42 (감소 없음).

## Next Steps

- [ ] `/mccp:prp-commit` → `/mccp:pr` (PR 진입 직전 §3.7 version 재계산)
- [ ] 이연된 18건 + MEDIUM 2건은 backlog 에 적재됨 — 수정은 별개 축(#5 뒤)
