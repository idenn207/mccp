# Milestone Closure — santa-adjudication-m2

## Milestone
- ID         : santa-adjudication-m2
- Name       : 판정 원장
- Plan       : .claude/plans/santa-adjudication-m2.plan.md
- Status     : done
- Closed at  : 2026-08-17T10:36:02.197Z
- Closed by  : /mccp:milestone-close (run_id=2b1e071d-d6c7-4dcf-96f9-f943ae649859)

## Acceptance Condition

plan `## Acceptance` 5항목을 그대로 옮긴다:

- All tasks complete
- Validation passes (커버리지 스크립트 성공 종료 — 상한은 커버리지 표에서 파생되고 각 항목에
  assert 1개 이상 + 동결 함수 무변경 + gate 6·adjudication 6 export 존재 + P0 파일 무접촉)
- Patterns mirrored, not reinvented
- **(A) 실 경로 완주** — Task 7 Validate (a)~(d): `begin-round`가 coverage 선검사를 지나 라운드를
  열고, `verdict` stdout이 `suppressed`·`entries`·`ledger`·`carryOver`를 싣고,
  `.claude/reviews/santa-review-<slug>.md`가 산출되며, `mccp-santa-review` receipt의
  `meta.santa_entries`가 원장 `entries` 길이와 **일치**한다.
- **(B) 억제 경로 실 경로 관측** — Task 7 Validate (e)~(g): 종자 결함 probe에서 미판정 blocking이
  `begin-round`를 거부하고(캡 미소모), 판정 후 열리며, 다음 라운드의 같은 claim이 `suppressed`에
  담기고 `blocking`에서 빠진다. **조건절이 없다** — 이 항목이 체크되지 않으면 milestone은
  `complete`가 아니며 PRD Milestone 2 행을 `complete`로 바꾸지 않는다.

이 절은 *충족해야 할 조건*을 적는 자리이지 충족됐다는 주장이 아니다(closure README 형식 규약).
조건별 판정과 그 판정이 선 시점은 아래 `## Goal Loop Result`가 갖는다 — **(B)의 세 번째 축 (g)는
본 closure의 `Closed at` 시점에 미충족이었고, 운영자 판정으로 종료됐다.**

## Goal Loop Result

verdict=done. 운영자 응답(원문): "M2을 complete처리 해줘."

**라이브 `/goal` loop은 돌리지 않았다.** 운영자가 `/goal` 진입 없이 명령 인수로 직접 판정했고,
acceptance는 정적 증거로 검증했다. M1 closure와 같은 경로이며, 그 사실을 숨기지 않고 기록한다 —
closure의 감사 가치는 verdict가 아니라 그 verdict가 무엇을 보고 내려졌는지에 있다.

검증 근거 (2026-08-17 실측, 격리 lock enter **이전** 수집 — lock 활성 중에는 `goal-phase-guard`가
Bash를 default-deny로 차단하므로 측정은 그 앞에서 끝나야 한다):

- 브랜치 상태 — working tree clean · branch `santa-adjudication` · PR **#143** OPEN ·
  `mergeable=MERGEABLE` · `mergeStateStatus=CLEAN` ·
  title `feat(v1.27.1): santa-adjudication M2 — 판정 원장 (adjudication ledger)`.
- 회귀 test 5개 suite 전건 green — `santa-adjudication.test.js` 60/60(신규 26~60 포함) ·
  `santa-gate.test.js` 10/10 · `santa-loop-cap.test.js` 48 pass / 3 skipped / 0 fail ·
  `santa-seal.test.js` 13/13 · `santa-review-gate.test.js` 12/12. 합계 fail 0.
- 커버리지 계약 — `coverage 60/60 (bound derived from the plan table), every item has at least
  one assertion`. 상한이 plan 표에서 파생되므로 M1의 1~25 소실도 같은 스크립트가 잡는다.
  **이 출력이 뜻하는 범위는 plan `## Validation`이 명시한 그대로다** — 60개 자리에 test가 있고
  각각 최소 한 번 단언한다까지이며, 단언의 *내용* 정합성은 리뷰가 본다.
- 동결 계약 — `frozen function unchanged; gate 6 + adjudication 6 exports present`.
  `decideVerdict` 반환이 정확히 3필드로 유지되고 신규 12개 export가 존재한다.
- 소유권 교집합 ∅ — `P0 files untouched` (`ledger.js`·`seal.js`·`counter.js` 무접촉).
- §3.5.1 삭제 검증 — `git diff --diff-filter=D --name-only origin/main...HEAD`가 **빈 출력**.
  이 브랜치는 파일을 하나도 지우지 않는다.
- receipt chain — `validate --command mccp:pr --decision santa-adjudication-m2 --plan <plan>`이
  `ok:true` · `missing:[]` · `stale:[]` · `blocking:[]` · `open_critical:[]`.
  warning 1건은 M1 시절의 `impeccable_silent_skip=true`(observational)로 blocking이 아니다.
  **decision slug를 생략하면 `default`로 해석돼 missing 2건이 뜬다** — 이 브랜치의 게이트는
  `santa-adjudication-m2` slug에 산다.
- version — `plugins/mccp/.claude-plugin/plugin.json` `1.27.1` (CLAUDE.md 3.7 patch 축 —
  PRD 3개 milestone 중 2번째 ship). §3.7 forward-only 재번호를 이 사이클에도 한 번 겪었다
  (1.26.3 → 1.27.1, merge-commit `4bf0f3f`).

### (A) — 충족

Task 7 (A)의 네 산출물이 전부 확인된다 (slug는 `santa-adjudication-m2`로 명시 핀 —
브랜치 slug `santa-adjudication`의 원장은 M1이 캡 3라운드를 이미 소진해 `begin-round`가 exit 12를
낸다).

| 검증 | 실측 |
|---|---|
| (a) 라운드 기록 | `mccp-santa-review` receipt `meta.santa_rounds=1` · `santa_cap=3` |
| (b) verdict stdout M2 키 | `suppressed`·`entries`·`ledger`·`carryOver` 전부 존재 |
| (c) 집계 리포트 | `.claude/reviews/santa-review-santa-adjudication-m2.md` 산출 (461 B) |
| (d) receipt ↔ 원장 일치 | `meta.santa_entries=0` = 원장 `entries` 길이 · `review_verdict="converged"` · `resolution.review_source="multi-agent"`(UI4) · `review_proof.quorum` `{passed:true, required:2, of:2, responded:2, roles:2}` |

원장 실물은 `.claude/state/santa-loop/santa-adjudication-m2.json`(7.7 KB) +
`.proof.json`(517 B)로 남아 있다.

### (B) — (e)·(f) 충족, **(g) 미충족**. 운영자 판정으로 종료

별도 워크트리 `santa-m2-probe`에서 DD13 라운드 결속을 `e.round < round` → `<= round`로 되돌린
2줄 종자 결함을 실제 리뷰어 4명(전원 opus, 합성 JSON 미사용)에게 보인 결과:

| 검증 | 실측 |
|---|---|
| (e) 미판정 blocking → `begin-round` 거부 | exit 2 · `rounds 1 → 1`(**캡 미소모**) · stderr가 4건을 id·severity·claim으로 전량 열거 |
| (f) 전건 판정 후 재호출 | `entries: 4` → `{"allowed":true,"roundIndex":1}` |
| (g) 다음 라운드 같은 claim 억제 | **미관측** — `suppressed: 0` |

**(g)가 실패한 이유는 리뷰어가 결함을 놓쳐서가 아니다.** round 0·round 1의 fresh 리뷰어 4명은
같은 결함을 **4/4 전건** 다시 찾았고 **4건 모두 다른 문장으로** 썼다. `issue_id`가 정규화 claim에서
파생되므로 넷 다 새 id를 얻었다. `carryOver`는 DD5가 정의한 서명을 정확히 냈다 — round 1에서
`{suppressed:0, resolvedAbsent:4, newBlocking:4}`. **DD5가 High로 예측한 패러프레이즈 한계가
실측으로 확인된 것이고, 병목은 재보고율이 아니라 재보고의 문안 안정성이다.** 계측 도구는 의도대로
작동했고, 이 사건을 관측 가능하게 만든 것이 그 도구의 목적이다.

**억제 메커니즘 자체는 고장이 아니다.** probe의 round 1 판정이 (종자가 라운드 결속을 지웠으므로)
**같은 라운드**의 그 지적을 실제로 지웠다 — `kind: absorbed-rereported`, `entryRound: 1`,
blocking 4 → 3. 즉 DD13이 막는 우회가 실경로에서 재현됐고, 본 브랜치에서는 같은 시퀀스가 NAUGHTY로
남는다(커버리지 49 + 실 CLI 왕복 스모크). 정확 재보고 경로는 커버리지 34·41~46·49·55가 덮는다.

**운영자 override와 그 성격.** plan Acceptance (B)의 문언은 조건절 없이 "이 항목이 체크되지 않으면
milestone은 `complete`가 아니며 PRD Milestone 2 행을 `complete`로 바꾸지 않는다"이다. 본 closure의
`Status: done`과 그에 따른 PRD row 2 flip은 **그 문언을 충족했다는 주장이 아니라, 운영자가 (g)를
이연하기로 내린 명시 판정이다.** 그 판정을 정당화하는 관측과 처방은 PRD
`.claude/prds/santa-adjudication.prd.md` Open Questions의 M2 (B) 항목이 이미 소유하고 있고, 요지는
**(g)의 병목이 M2가 닫을 수 있는 축이 아니라는 것**이다 — 처방 (1)은 리뷰어 프롬프트가 지적마다
안정적 식별자(파일:라인 또는 규칙 id)를 요구하고 `issue_id`를 claim이 아니라 그 식별자에서 파생하는
것이며, PRD가 그것을 **M3 또는 P2의 축**으로 적었다. 처방 (2)는 임계 기반 fuzzy matching이
**처방이 아니라는** 부정형이다(DD5: 잘못 합쳐진 두 지적은 실재 결함을 지우는 방향으로 틀린다).

따라서 `Status: done`은 「구현·검증·회귀 test 146건이 끝났고, 실경로 완주도 (A) 전건과 (B)의
(e)·(f)까지 확인됐으며, 남은 (g)는 식별자 축을 갖지 않은 M2가 닫을 수 없어 명시 이연됐다」는 뜻이다.
「이 문서가 쓰이는 순간 plan의 모든 문언이 이미 충족돼 있었다」는 뜻이 **아니다.** 전자를 후자로
적으면 closure가 자기 stamp 시점에 대해 거짓을 말하게 된다. 그리고 M2가 실제로 억제한다고 주장할
범위는 PRD 문언 그대로 **"운영자가 같은 문장으로 다시 만나는 경우"**까지이며, 그 범위를 넘는 주장을
본 closure도 하지 않는다.

본 closure 직후의 기록 갱신: PRD `## Delivery Milestones` row 2의 status를 `in-progress` →
`complete`로 정정하고, 같은 PRD Open Question의 "Milestone 2 행은 `complete`로 바꾸지 않는다"
문장에 본 override를 주석으로 병기한다(실측값은 지우지 않는다). PRD row 3(patch-chasing
terminator)은 여전히 `pending`이므로 `/mccp:archive-complete`의 archivable 조건(CLAUDE.md 3.11
C2/C3)에 도달하지 않으며, 아카이브는 일어나지 않는다.

## Deviation — plan-body anchor를 싣지 않았다 (M1과 같은 이유, 같은 A/B)

`/mccp:milestone-close` Phase 4는 이 closure의 sha256을 plan 본문 `## Milestone Closure
Provenance` 섹션에 stamp할 것을 의무화한다(option B custody anchor). **이 milestone에서도 그
stamp를 싣지 않았고, 그 사실을 여기 기록한다.**

**이유 — stamp가 자기 다음 게이트를 차단한다.** plan_hash 비교는 `hash.js#planAwareMarkdownHash`가
`.claude/plans/*.plan.md`에 대해 **구조 해시**(`markdownHashStructural`)로 수행한다. 그 정규화가
접는 것은 frontmatter `status`/`pr`/`completed_at` · 체크박스 상태 · PR placeholder · 표의 status
토큰뿐이고, **신규 섹션은 접지 않는다.** 비파괴 A/B 실측(2026-08-17, 실제 plan은 미변경):

| 상태 | 구조 해시 |
|---|---|
| 현재 (stamp 없음) | `sha256:407a9825…` — 세 receipt(`mccp-plan-codex`·`mccp-implement-codex`·`mccp-pr-codex`)가 바인딩한 값과 **정확히 일치** |
| stamp 추가 시 | `sha256:b3139b5d…` → 세 receipt 전부 `stale` |

즉 stale의 단일 원인은 stamp다. M1에서 측정한 것과 같은 자기차단이 M2에서도 그대로 재현된다.

**왜 재봉인이 아니라 미stamp인가.** 이번에는 이유가 M1보다 하나 더 있다. (1) `receipt/write.js`가
"plan changed after L2 reviewed it (DD13) … Recovery: rerun the L2 review against the current plan
— **do NOT reseal, that would certify an unreviewed version**"로 이 상황의 재봉인을 명시 거부한다.
(2) 그리고 이 사이클의 `mccp-pr-codex` ship receipt는 **이미 git-tracked로 커밋됐다**(`ff9c671`) —
CLAUDE.md §3.12 no-rehash invariant상 tracked ship receipt의 `receipt_hash` 재계산은
sanctioned 도구(`v1.22.4-cwd-rebind.js`) 외에는 금지이고, `store.js#writeReceipt`의
`TRACKED_RECEIPT_OVERWRITE` 가드가 fail-closed HALT한다. `MCCP_RECEIPT_GATE_MODE=soft`도 대안이
아니다 — missing만 통과시키고 stale은 차단한다.

**그래서 잃은 것과 남은 것.** 잃은 것은 "closure 본문이 변조되면 다음 게이트의 plan_hash mismatch로
검출된다"는 메커니즘이다. 남은 것은 **git**이다 — `.claude/milestone-closures/`가 git-tracked이므로
본문 자체가 커밋으로 봉인되고 변조는 diff로 드러난다. sha256을 형제 파일에 적어 두는 것보다 약하지
않다.

이 결함은 저장소가 이미 알고 있다: [codex-findings-backlog.md](../plans/codex-findings-backlog.md)의
2026-08-16 HIGH 행(`milestone-close.md` Phase 4)이 같은 자기차단을 A/B 실측과 함께 등재했고, 권고한
진짜 수정은 **(b) closure sha256을 plan이 아니라 receipt `meta`에 싣는 것**이다 — 본 이탈은 그
방향과 같다. **두 번째 milestone에서 같은 이탈이 반복됐다는 사실 자체가 그 backlog 항목의 우선순위
근거**이며, 이 문단이 그 재발을 명시 기록한다.

## Provenance
- Lock run_id        : 2b1e071d-d6c7-4dcf-96f9-f943ae649859
- Lock owner session : a78c6f44-1b42-478d-a24e-f61e773edba2
- Plan source        : .claude/plans/santa-adjudication-m2.plan.md
- Detection signal   : {"row":2,"name":"판정 원장","plan":".claude/plans/santa-adjudication-m2.plan.md","status":"in-progress"}
- mccp version       : 1.27.1
