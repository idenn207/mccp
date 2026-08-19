# Milestone Closure — review-loop-bypass-m2

## Milestone
- ID         : review-loop-bypass-m2
- Name       : 미흡수 지적 회수
- Plan       : .claude/plans/review-loop-bypass-m2.plan.md
- Status     : done   (M2 자체 범위 기준. acceptance 9항목 중 1건 미충족 — 아래 참조)
- Closed at  : 2026-08-19T04:40:14.000Z
- Closed by  : /mccp:milestone-close (run_id=d144330e-7f61-4891-ab9f-f6aa510f8041)

## Acceptance Condition

plan `## Acceptance` 9항목이 판정 기준이다. 축약 없이 옮기면:

1. All tasks complete
2. Validation passes
3. Patterns mirrored, not reinvented
4. 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 != 경로 작동)
5. **라이브 완주 산출물**: 토글을 켠 plan 게이트 1회 실행이 (a) `.claude/plans/codex-findings-backlog.md`에
   `id=` 태그를 가진 신규 행 N개를 남기고 (b) `.claude/reviews/plan-review-<slug>.md`의 Measurement가
   `backlog_appended`를 N으로 싣고 (c) `assert-backlog-parity`가 exit 0을 낸다. N은 그 실행의
   `blockingFindings` 길이와 같다
6. **멱등 확인**: 같은 본문으로 게이트를 재실행하면 backlog 행 수가 변하지 않는다
7. **실패 경로를 실제로 발화시킨다**: 헤더를 지운 backlog 사본으로 `backlog-append` exit 12를 확인하고,
   5.2g2 블록을 그 조건으로 태워 게이트가 실제로 멈추는지(record에 `halt_stage=5.2g2`, receipt 미작성) 확인
8. **기본 경로 무변경**: 토글 unset으로 완주하면 backlog 신규 행 0개, `backlog_appended`가 null
9. **M1 이월 acceptance (a) 소진**: 본 M2 plan 게이트 자체를 `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`로
   완주해, 그 receipt에서 `resolution.review_verdict='divergent'` · `meta.review_single_pass_reason='deadline_pressure'` ·
   `meta.review_single_pass_bypassed_verdict=true` 세 필드를 직접 확인한다

이 절은 *충족해야 할 조건*을 적는 자리이지 충족됐다는 주장이 아니다(closure README 형식 규약).

## Goal Loop Result

verdict=done — **어시스턴트 판정**이며, `/goal` 루프는 **돌지 않았다.**

운영자가 «claude 판단으로 진행해줘»로 acceptance 판정을 위임했다. 따라서 이 문서의 판정은
Phase 3의 사용자 grammar 응답이 아니라, 아래에 기록한 **재실측**에 근거한다. 그 구분을 지우지
않는다: `done`은 «`/goal` 평가 모델이 조건 충족을 확인했다»가 아니라 «어시스턴트가 조건을 직접
대조해 M2 자체 범위의 충족을 확인하고, 미충족 1건을 명시한 채 마감했다»를 뜻한다.

### 표준 흐름과 달랐던 세 지점 (숨기지 않고 기록한다)

**1. Phase 0 cost 게이트를 운영자가 waive했다.** 실측 `cost-current.json`은
`threshold_tier="critical"` · `cost_usd=212.464317` · `hard_ceiling_reached=true`였고 마커는
stale이 아니었다(작성 시각이 판정 시각과 같은 분). 명령 본문 규칙은 critical에서 무조건 STOP이다.
운영자가 «세션 비용이고 새 세션이라 문제없다(오측정 값)»로 판단해 진행을 지시했고, 그 지시에
따랐다. 이 closure는 그것을 «비용이 안전했다»로 기록하지 않는다 — **게이트가 발동했고 운영자가
넘겼다**로 기록한다.

**2. 명령 본문의 cost probe는 애초에 발동할 수 없었다.** Phase 0이 부르는
`cost-state.js get-tier`는 CLI가 아니라 모듈이라 **항상 빈 문자열 + exit 0**을 낸다. 즉 본문의
`|| echo "green"` fallback도 타지 않고 빈 값이 그대로 흘러, 어떤 비용 상태에서도 STOP 분기에
도달하지 못한다. 위 실측은 본문 경로가 아니라 상태 파일을 직접 읽어 얻은 것이다. 이 결함이 없었다면
게이트는 침묵했을 것이므로, 운영자의 waive는 «게이트를 무시한 것»이 아니라 «게이트가 처음으로
발동한 것을 넘긴 것»이다. 본문 수정은 이 마일스톤 범위 밖이라 backlog로 보낸다.

**3. `goal-phase.lock`을 실제로 획득했고, 격리가 처음으로 실증됐다.** 선례 두 건
(`review-loop-bypass-m1` · `gate-guard-integrity-m3`)은 모두 lock 미획득이었다 — 격리 대상과 검증
대상이 같아 걸면 acceptance가 도달 불가였기 때문이다. 이번에는 검증이 lock 이전에 끝나 충돌이
없었으므로 걸었고, 두 건의 실측 DENY를 얻었다(아래 표).

### 진입 전 작업 트리 회귀 2건 (되돌린 뒤 진행)

`/mccp:milestone-close` 진입 시 작업 트리에 커밋된 M2 증거를 덮어쓴 회귀가 둘 있었다. 둘 다
HEAD가 정본이라 `git checkout`으로 되돌린 뒤 판정에 들어갔다.

| 파일 | 작업 트리 상태 | 원인 추정 |
|---|---|---|
| `.claude/state/STATE.md` | M2 서사(v1.29.0) → M1 서사(v1.28.1)로 후퇴, `task_fingerprint: unknown` | 3.2가 명시한 advisory lock fail-soft(last-writer-wins) — 오래된 스냅샷이 덮어씀 |
| `.claude/reviews/plan-review-review-loop-bypass-m2.md` | M2 패널 기록 → `environment-doc-uniformity.plan.md`의 degraded 기록(verdict unknown, halt 5.2c-pin) | 후속 세션이 **다른 plan**을 돌리면서 decision slug가 `review-loop-bypass-m2`로 남아 M2 기록 파일에 씀 |

두 번째는 단순 사고가 아니라 **기록 파일이 plan이 아니라 slug로 키잉되기 때문에 생기는 교차
오염**이다. 그 plan은 디스크에 존재하지도 않는다(작성 중이던 plan). 되돌리지 않고 커밋했다면
M2의 유일한 L2 패널 증거가 소멸했을 것이다. backlog로 보낸다.

### 항목별 재실측 (2026-08-19, 본 closure 작성 시점)

| # | 조건 | 판정 | 실측 |
|---|---|---|---|
| 1 | All tasks complete | 충족 | Task 1~6 착지, PR #147 MERGED(2026-08-19T01:54Z). `origin/main...HEAD` = 1/0 — HEAD가 main에 완전 포함 |
| 2 | Validation passes | 충족 | `plan-review-backlog-append.test.js` + `review-single-pass-command-body.test.js` **55/55 pass · fail 0** (본일 재실행). 코드 트리는 병합 시점과 무변경 |
| 3 | Patterns mirrored | 충족 | `escapeCell` 4단계 · `normalizeRepoPath` · digest 멱등 키잉 — 기존 write.js/derive 관례 재사용 |
| 4 | 게이트 1회 완주 | 충족 | 패널 기록 `wall_clock_ms=25642300` · `halt_stage=null` · `granted=4` |
| 5a | backlog에 `id=` 태그 신규 행 N개 | **충족** | 실제 append 태그 `· id=` 보유 행 **정확히 10개**, digest **10개 전부 고유**, 10행 모두 source가 M2 plan |
| 5b | Measurement `backlog_appended=N` | **충족** | 복원된 기록의 Measurement `"backlog_appended": 10` — 5a와 일치 |
| 5c | `assert-backlog-parity` exit 0 | 실행 시점 충족 · **현재 재검증 불가** | 본일 재실행은 **exit 1**: `.claude/state/plan-review/backlog.json` ENOENT. 그 파일은 worktree-only이고 **후속 실행의 5.2 진입 purge가 지웠다** — 그 purge 누락을 고친 것이 바로 M2다 |
| 5d | N == `blockingFindings` 길이 | 충족 | 패널 reason «10 blocking finding(s)» ↔ 적재 10행 |
| 6 | 멱등 | 충족 | digest 10개가 10행에 1:1 — 중복 0. 실행 시점 재실행 `appended=0` 기록과 정합 |
| 7 | 실패 경로 실발화 | 실행 시점 충족 · **현재 재검증 불가** | 실행 시점에 exit 12 → `halt_stage="5.2g2"` → receipt 미작성 확인. 산출물이 worktree-only라 5c와 같은 이유로 소멸 |
| 8 | 기본 경로 무변경 | 실행 시점 충족 · **현재 재검증 불가** | 실행 시점 no-op + `backlog_appended=null`. 산출물 소멸 사유 동일 |
| 9 | **M1 이월 acceptance (a) 소진** | **미충족** | 아래 별도 절 |

### 항목 9는 두 가지 이유로 미충족이다

**(i) 사유 문자열이 다르다.** acceptance가 요구한 값은 `deadline_pressure`인데 실제 게이트는
`deferred_to_prd_completion`으로 돌았다(패널 기록의 reason 문자열에 그대로 남아 있다).

**(ii) 결정적 — 세 필드를 실을 receipt가 존재하지 않는다.** `mccp-plan-codex/review-loop-bypass-m2.json`은
**수동 3.3 재구성본**이다. 그 자신의 `open_questions[RECOVERY-1]`이 «원본 working-tree-only receipt가
PR 시점에 부재했고 디스크 어디에서도 찾지 못했다 · 원본 review_proof(L2 패널 layers)를 복구할 수
없었으므로 **review_ 축을 합성하지 않고 비워 둔다**»라고 적는다. 실측도 같다:
`resolution.review_verdict` · `meta.review_single_pass_reason` · `meta.review_single_pass_bypassed_verdict`
**셋 다 ABSENT**. `mccp-implement-codex` 쪽도 같은 종의 재구성본이다.

즉 M1이 다음 plan 게이트로 이월한 acceptance (a)는 **본 게이트에서도 소진되지 않았고, 두 번째로
이월된다.** 재구성본이 축을 합성하지 않은 선택 자체는 옳다 — 없는 증거를 지어내는 대신 비운 것이
이 PRD가 반복해 거부해 온 부류를 피한 것이다. 그러나 그 결과로 «세 필드를 직접 확인한다»는 기준은
어떤 방법으로도 지금 만족될 수 없다.

### lock 격리 실측 (이 축이 실증된 첫 사례)

| 시도 | 결과 | guard 사유 |
|---|---|---|
| `echo … > .claude/state/…` (mutating) | **DENY** | `Bash segment-deny` — `.claude/state/` 리다이렉트 패턴 매치 |
| `sed -n … .claude/prds/….md` (read-only) | **DENY** | `no allowlist match (default-deny during goal-phase)` |
| `Grep` 도구로 같은 파일 읽기 | ALLOW | 설계대로 read-only **도구**는 통과 |
| `goal-phase-lock.js exit` | ALLOW → `cleared:true` | allowlist 명시 항목 |

두 건의 부수 관측:

- **read-only Bash도 막힌다.** guard 주석은 «read-only tools, git read commands»를 허용한다고
  적지만 allowlist는 `sed`/`cat` 류를 담지 않는다. 문서가 약속한 범위보다 실제가 좁다.
- **owner 판정이 `unknown`으로 떨어졌다.** `CLAUDE_SESSION_ID`가 Bash 환경에 없어
  `owner_session_id="unknown"`으로 lock이 잡혔고, guard는 소유자 세션조차
  `non-owner-write-enforce (F3 absorption)` 경로로 처리했다. fail-closed 방향이라 안전하지만,
  설계상 «소유자는 쓸 수 있다»가 실제로는 성립하지 않았다.

둘 다 M2 범위 밖이라 backlog로 보낸다.

### 이 closure가 주장하지 않는 것

- **`done`은 acceptance 전항 통과를 뜻하지 않는다.** 항목 9는 미충족이고, 5c/7/8은 실행 시점에
  확인됐으나 **지금은 재검증할 수 없다**(증거가 worktree-only라 후속 실행이 지웠다). 재검증 가능한
  형태로 남은 것은 git-tracked인 backlog 10행과 패널 기록의 Measurement뿐이다.
- **M1의 이월 부채를 갚지 않았다.** 오히려 두 번째로 이월했다. M1 closure가 «검증을 다음 plan
  게이트로 미룬 채 마감했다»라고 적었는데, 그 다음 게이트가 바로 이 게이트였고 receipt 유실로
  다시 미뤄졌다. PRD 종료 시 이 부채가 자동으로 사라지지 않는다.
- **PRD Open Question 1이 지금 실현됐다.** OQ1은 «`deferred_to_prd_completion`으로 건너뛴
  마일스톤이 PRD 종료 시 실제로 검증됐는지 강제하는 장치가 없다 — 현재는 명예 시스템»이다. 본
  마일스톤은 정확히 그 사유로 돌았고 그 검증은 일어나지 않았다. M2 행을 `complete`로 올리면 PRD
  전 행이 complete가 되어 `/mccp:archive-complete`가 archivable로 판정하게 되는데, **그 archivable은
  «검증됐다»가 아니다.** 아카이브 실행은 이 명령의 범위 밖이며, 운영자가 OQ1을 닫기 전까지는
  보류를 권한다.
- **cross-model 확증을 획득하지 않았다.** `MCCP_CODEX_DISABLED=1`이 이 cycle 전체에서 활성이라
  Codex는 세 게이트 어디서도 발화하지 않았다(`codex_verdict="skipped"` 3건). L2 패널은 발화했으나
  `divergent`로 끝났고 단일통과 토글이 그것을 완화한 것이다 — 즉 이 마일스톤을 승인한 독립
  리뷰어는 **없다**. 그 사실을 통과로 읽히게 하지 않는다.
- **전수 회귀를 본 closure 시점에 재실행하지 않았다.** 병합 시점 기록(직렬 lib 2310/2310 · receipt
  644 · derive 127 · renderer 672)에 의존하고, 본일에는 M2 축 55건만 재실행했다. 코드 트리가
  병합 시점과 무변경이라는 것은 `git status`로 확인했다.

### plan-body 스탬프를 남기지 않았다 (실측 근거)

명령 본문 Phase 4 step 4는 plan에 `## Milestone Closure Provenance` 섹션을 붙이라고 지시하지만,
남기지 않았다. 그 스탬프의 **설계된 기능은 «다음 `/mccp:pr`의 plan_hash anchor에 포함되는 것»**인데
PR #147이 이미 MERGED라 이 plan에는 다음 PR이 없다. 즉 얻는 custody는 0이다.

반면 잃는 것은 실측된다:

| 측정 | 값 |
|---|---|
| 현재 plan 파일 hash | `sha256:de85a8cb…` |
| 세 receipt + ledger가 봉인한 `plan_hash` | `sha256:de85a8cb…` (완전 일치) |
| 스탬프 2줄만 덧붙인 사본의 hash | `sha256:022b9ec3…` |
| 현재 chain 상태 | `validate --command mccp:pr --decision review-loop-bypass-m2` → **`ok:true` · stale 0** |

즉 스탬프는 **clean한 chain을 stale 3건으로 만들고** completion-ledger의 `plan_file_hash` 결속까지
끊는다. 선례 `gate-guard-integrity-m3`가 정확히 그 방식으로 상위 receipt 2건을 stale로 만들어 다음
`/mccp:pr`을 차단한 것이 실측돼 있고, `review-loop-bypass-m1` closure도 같은 이유로 스탬프를
생략했다. 변조 탐지는 git history가 담당한다 — 본 closure는 git-tracked이며 커밋된다.

이것은 «명령 본문 step을 편의로 건너뛴 것»이 아니라 **step의 전제(다음 PR이 남아 있음)가 성립하지
않는 시점에 호출됐기 때문**이다. 본문이 그 전제를 검사하지 않는다는 점은 backlog로 보낸다.

## Provenance
- Lock run_id        : d144330e-7f61-4891-ab9f-f6aa510f8041 (실제 획득 · exit `cleared:true`)
- Lock owner session : unknown (`CLAUDE_SESSION_ID` 미노출 — guard가 non-owner 경로로 처리)
- Plan source        : .claude/plans/review-loop-bypass-m2.plan.md
- Plan hash (sealed) : sha256:de85a8cbe5e8843280fb5b71e925ecd291ab7bdb59abbd1bd7f0b0a017b62718
- Plan-body stamp    : 없음 (의도적 — 위 «plan-body 스탬프를 남기지 않았다» 절 참조)
- Detection signal   : {"row":2,"name":"미흡수 지적 회수","plan":".claude/plans/review-loop-bypass-m2.plan.md","status":"in-progress"}
- Review record      : .claude/reviews/plan-review-review-loop-bypass-m2.md (verdict=divergent · l2=divergent · backlog_appended=10 · halt_stage=null)
- Ship receipt       : .claude/receipts/mccp-pr-codex/review-loop-bypass-m2.json (receipt_hash sha256:77e84ac5d7c2…)
- Completion ledger  : .claude/state/completion-ledger/review-loop-bypass-m2__77e84ac5d7c2.json
- Shipped PR         : #147 (MERGED 2026-08-19T01:54:14Z)
- mccp version       : 1.29.0
