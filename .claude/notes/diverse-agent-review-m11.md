# diverse-agent-review M11 — 게이트 산출물

> plan(`.claude/plans/diverse-agent-review-m11.plan.md`)은 `mccp-plan-codex` receipt에
> `plan_hash`(`sha256:43e59143…`)로 봉인돼 있다. 게이트 섹션을 plan 본문에 주입하면 구조
> 해시가 바뀌어 receipt가 stale이 되고 `/mccp:pr` guard 2가 이 사이클의 PR을 막는다.
> 따라서 게이트 산출물은 여기 적는다 — `.claude/notes/diverse-agent-review-m8.md` 선례와 동일하다.

## Codex Implementation Review

- 호출: `node <plugin-root>/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 결과: `classification=ok` · `blocking=false` · `durationMs=269309` · `result.verdict=needs-attention`
- 라운드 수: **1** (cap=3이나 §3.16에 따라 1라운드 기본. R1의 ACCEPT_NOW HIGH 2건을 R1 안에서
  전부 흡수했으므로 2.5.4의 escalate 조건 (b)가 성립하지 않는다)
- 봉인 확인: `codex-policy read` → `{"found":true,"codexDisabled":false,"reason":"ok"}`
- 합치 결론: **slug 파생과 quorum 수용이 둘 다 증명 없이 신뢰하고 있었다.** 두 HIGH가 같은
  형태를 지적한다 — 도구가 어떤 아티팩트를 "이 레코드의 것"으로 인정하는 근거가 이름(slug)과
  존재(shape)뿐이면, 다른 plan의 증거가 미탐으로 둔갑하거나 자기 측정이 부인하는 승인이
  감사 표본에 남는다. 둘 다 **증명을 요구하는 방향**으로 흡수했다.

### YAGNI Triage

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 basename 파생 slug가 다른 plan의 증거를 교차 결속할 수 있다 | HIGH | **ACCEPT_NOW** | 가설이 아니라 **이 코퍼스에 실재**한다 — 아래 실측. hash-proven 귀속 + slug 충돌 탐지 + 채널별 `attribution` 표기로 흡수 |
| F2 quorum 구조 검증이 레코드의 내적 정합을 세우지 못한다 | HIGH | **ACCEPT_NOW** | shape만 보면 `Verdict: converged` + `quorum.passed=false` 레코드가 승인 표본에 남는다. 의미 검증(`passed===true` ∧ `responded>=required` ∧ role 경계)으로 흡수하고 모순 레코드는 `degraded` |
| F3 앵커 복구의 git 이력 순회에 강제 가능한 상한이 없다 | MEDIUM | **부분 ACCEPT_NOW + DEFER** | 상한 자체는 종료성 요건이라 즉시 구현(`history_limit_exhausted`를 진짜 부재와 **구분**). 상한의 **설정 가능성**은 §3.14대로 backlog 이연 |

### F1 — 실측으로 확인된 교차 결속 (가설 아님)

plan의 Preconditions는 "ship receipt가 5건 모두 존재한다"고 적었다. 그 명제는 **레코드
파일명에서 slug를 파생하면** 참이고, **리뷰된 본문의 해시로 귀속하면 거짓**이다.

| 레코드 | `plan_path` basename slug | 그 slug의 ship receipt | `reviewed_plan_hash`와 일치하는 receipt |
|---|---|---|---|
| `plan-review-codex-intent-context-m2.md` | `codex-intent-context-m2` | 있음 | `codex-intent-context-m2.json` |
| `plan-review-impeccable-detection-contract.md` | `impeccable-detection-contract-m6` | **없음** | **없음** |
| `plan-review-multi-session-work-loop-m6.md` | `multi-session-work-loop-m6` | 있음 | `multi-session-work-loop-m6.json` |
| `plan-review-santa-adjudication-m1.md` | `santa-adjudication-m1` | 있음 | `santa-adjudication-m1.json` |
| `plan-review-santa-adjudication.md` | `santa-adjudication-m2` | 있음 | `santa-adjudication-m2.json` |

레코드 파일명 slug(`impeccable-detection-contract`)로 찾으면 receipt가 **존재하지만**, 그
receipt의 `plan_hash`는 `sha256:c7d1d27d…`로 그 레코드의 `reviewed_plan_hash`
`sha256:887fc89d…`와 다르고 애초에 **다른 plan의 봉인**이다. 즉 이름으로 결속하면 다른
plan의 `findings`가 이 승인의 "승인 후 증거"로 계수될 수 있다 — F1이 서술한 형태 그대로다.

**이것은 DN10의 정정이기도 하다.** DN10은 그 레코드를 두고 "리뷰 해시와 ship 해시가 다르다
= 승인 대상이 승인 후 바뀌었다"고 적었으나, 그 판정 자체가 파일명 결속으로 다른 plan의
receipt를 끌어온 결과다. 해시로 귀속하면 정직한 서술은 **"그 리뷰된 본문에 대한 ship
receipt가 아예 없다"**(`no_ship_receipt`)이지 "본문이 바뀌었다"가 아니다. 도구는 그렇게
보고하고, 산출 문서가 이 정정을 명시한다.

### F2 — 승인 수용은 corpus.js 판정 + 레코드 자기 정합의 논리곱

`corpus.js#aggregate`가 내린 `verdict==='converged'` 판정은 **재계산하지 않는다**(plan Task 1의
불변식 — 두 판정이 갈라지면 어느 쪽이 계약인지 알 수 없다). 흡수는 재계산이 아니라 **추가
관문**이다: 그 레코드 자신의 `## Measurement` quorum 블록이 승인과 모순되면 감사 표본에서
빼고 `quorum_contradiction`으로 보고하며 `state`를 `degraded`로 만든다. 모순의 정의는
`passed !== true` · `responded < required` · `roles > of` · 셋 중 하나라도 비정수. 실측상
승인 5건은 전부 `{responded:4, required:3, roles:4, of:4, passed:true}`로 통과하므로 이
관문은 **상시 켜진 신호가 아니라** 회귀 가드다.

### Deferred to backlog

- **1건 (이번 게이트 발)** — F3의 상한 **설정 가능성**(`--max-history` 류 노출). 상한과
  `history_limit_exhausted` 구분은 이번에 구현하므로 남는 것은 노출 축뿐이다.
- plan 게이트발 미흡수 15건은 `plan-review/cli.js`가 이미 기계 적재했다(레코드
  `measurement.backlog_appended=15`). 같은 항목을 다시 append하지 않는다 — 두 줄로 세면
  원장이 빈도를 과대 진술한다.

### Open Questions

없음 (§0 auto-CRITICAL 카탈로그 — security boundary · atomic state · schema breakage — 해당 0건).
이 milestone은 schema를 바꾸지 않고(receipt 필드 0 추가), 상태를 쓰지 않으며(read-only),
신뢰 경계를 넓히지 않는다(입력 검증을 **추가**한다).

- Codex session 참조: threadId `01a05569-5aff-74c3-9893-f21c95740a6d`

### Security Reviewer

security-sensitive 카탈로그 중 **input validation · path traversal 해당**이라 조건부 게이트가
발화했다. M8과 다른 점이 여기다 — M8의 `corpus.js`는 repo-local 고정 2경로만 읽었지만, 이
milestone의 `approval-audit.js`는 **마크다운에서 파싱한 `measurement.plan_path`**를
`fs`·`git`으로 흘려보낸다(DN13이 지목한 바로 그 비대칭).

판정과 흡수 내역은 아래 「Security Reviewer 판정」 절에 적는다.

### Design Review

`impeccable-detect --mode implement` → `skill_available=true` · `design_signal=false` ·
`reason=no-signal` · `silent_skip=true` · `impeccable_invocation=impeccable` ·
`impeccable_source=user` · `version=4.0.4` · `shadowed=false` · `eclipsed=[]`.
렌더 표면(`.tsx/.jsx/.vue/.svelte/.astro/.css/.scss/.html`)이 진입 시점 diff에 없으므로
3-axis trigger 전부 미발화(axis a 0 · axis b 0 · axis c 미설정). critique retry loop ·
stage-aware routing · design-grounding capture 모두 미진입. receipt에
`--impeccable-silent-skip --impeccable-silent-skip-reason no-signal` forward.

> **plan 단계와 판정이 다른 이유(정직한 기록).** plan 게이트에서는 `design_signal=true`였다 —
> Validation 블록의 셸 명령 문자열과 `Files to Change`의 `renderer/html.js`·`renderer/markdown.js`
> 경로가 부분 문자열로 걸렸기 때문이다(plan `## Design Critique`가 그 사실을 이미 기록했다).
> implement 진입 시점의 diff에는 그 두 파일이 아직 없으므로 detector가 정직하게 `no-signal`을
>낸다. Task 7이 두 파일의 **버전 리터럴 1개씩**을 바꾸므로 Phase 3.6이 EXECUTE 후 같은
> detector를 다시 돌려 그 변화를 잡는다 — 두 판정은 서로 다른 시점의 서로 다른 사실이지
> 불일치가 아니다.

## Plan 게이트 미흡수 finding — implement 시 처리 (§3.14)

plan L2 패널이 `MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion`으로 완화되며 15건을
backlog에 기계 적재했다(verdict는 `divergent` 그대로 봉인 — 완화는 라운드를 없애지 판정을
위장하지 않는다). plan 본문은 봉인돼 수정할 수 없으므로 **구현에서 흡수**하고 여기 기록한다.
§3.14대로 CRITICAL·HIGH만 다루고 MEDIUM 이하는 원장에 남긴다.

| 관점 | severity | finding | 처리 |
|---|---|---|---|
| invariant | CRITICAL ×2 | `.claude/reviews/`가 worktree-only라 감사가 재현 불가하고 acceptance를 사후 검증할 수 없다 | **기각(기등재) + 측정으로 승격.** 전제가 실측상 거짓이다 — `.gitignore:154`가 무시하는 것은 `.claude/state/plan-review/`이고 같은 주석 `:149-152`가 `.claude/reviews/plan-review-<slug>.md`를 DURABLE로 지목하며 `git ls-files .claude/reviews/` 78건이 tracked다. 기각 근거는 이미 원장에 있으므로 재append하지 않고, **주장 대신 측정**으로 닫는다: 도구가 레코드마다 `durability`(`tracked`/`untracked`)를 보고해 재현성이 산문이 아니라 출력의 필드가 된다 |
| invariant | HIGH | 재현성 위험의 두 완화(git-tracked 소스만 쓰기 / git-tracked 출력 쓰기) 중 어느 것도 구현하지 않는다 | **흡수** — 전자가 이미 성립함을 위 `durability` 축이 매 실행 증명하고, 후자는 산출 문서(`docs/diverse-agent-review/approval-quality-audit.md`)가 git-tracked로 커밋되며 도구 출력을 축자 동결한다 |
| invariant | HIGH | Validation이 acceptance-critical 상태의 내구성을 강제하지 않는다 — `state='blind'`여도 구조 검사를 통과한다 | **흡수** — Validation 1을 강화해 `state==='blind'`에서 **비영점 종료**하고 dossier 6축(`anchor`·`hash_chain`·`proof_backing`·`lenses`·`channels`·`candidates`)의 존재를 함께 단언한다. plan 본문의 Validation 1은 봉인돼 있어 여기 기록하고 보고서가 실제 실행줄을 인용한다 |
| architect | HIGH | `pass_path.entries`는 메타데이터 포인터일 뿐 채널 데이터가 아니다 | **기각(설계대로)** — plan Task 1 item 4가 채널을 각자의 경로에서 읽도록 이미 규정한다. entries는 앵커 2개(`record`·`plan_path`)와 시각(`recorded_at`)을 나르는 것이 역할이고, 그 이상을 나르리라 기대한 적이 없다 |
| architect | HIGH | `pr_codex`가 5건 전부 `structurally_empty`면 상시 켜진 상수라 DN3 자기 원칙과 모순된다 | **흡수(범주 정정 + 문서 의무)** — DN15의 "상시 켜진 신호" 규칙은 **state 승격**에 대한 것이지 **보고**에 대한 것이 아니다. `structurally_empty`는 state를 바꾸지 않는 보고이고, 그 보고가 없으면 0이 관측으로 오독된다(DN3이 막으려는 바로 그것). 다만 지적의 실질은 옳다 — 이 채널은 이 코퍼스에서 **변별력이 0**이다. 산출 문서가 채널 지도에서 그 사실을 명시하고, Acceptance의 "보았고 없었다 vs 볼 수 있는 채널이 비어 있었다" 구분에 이 채널을 후자로 못박는다 |
| architect | HIGH | 승인 verdict는 `.claude/reviews/`에서, 증거는 ship receipt에서 온다 — 두 소스의 우선순위가 미문서 | **흡수** — 우선순위를 도구 헤더와 문서에 명문화한다: **승인 판정의 정본은 레코드(`corpus.js`)이고 ship receipt는 증인일 뿐 verdict를 절대 덮지 않는다.** 둘이 어긋나면 판정을 바꾸는 것이 아니라 `proof_backing`이 `uncorroborated`로 떨어지고 `state`가 `degraded`가 된다(DN14·DN15) |
| architect | HIGH | 승인을 발급한 quorum proof 구조를 기계 검사하지 않는다(DN9가 유일한 검증을 이연했다) | **흡수** — DN9는 `review_proof`(plan-gate receipt 전용, 그 5건에 대해 부재)를 못 쓴다고 적었을 뿐이고, 레코드의 `## Measurement` **quorum 블록은 실재한다**. Codex F2와 같은 축이므로 함께 흡수: 의미 검증 관문 추가 |
| test | HIGH | Validation 1이 `state`와 coverage 항등식만 보고 dossier 축의 존재를 검사하지 않는다 | **흡수** — 위 invariant/HIGH와 동일 조치(Validation 1 강화) |
| test | HIGH | Task 2의 12개 test 항목이 서술만 있고 코드가 없어 사전 검토 불가 | **기각(범주)** — plan은 구현을 서술하는 문서이고 코드는 이 단계의 산출물이다. 다만 지적의 유효한 절반(“사전 실패를 실측했다는 주장이 검증 불가”)은 흡수한다 — 아래 test/HIGH 참조 |
| test | HIGH | DN6 회귀의 "수정 전 실패"가 코드 부재로 반증 불가 | **흡수** — 해당 단언을 **먼저 잘못된 구현(현재 경로 체제)으로 돌려 실패를 실측하고 그 출력을 보고서에 인용**한 뒤 올바른 구현으로 넘어간다. 주장이 아니라 붙여넣은 실패 출력이 근거가 된다 |
| test | HIGH | `structurally_empty` 구분 test를 Validation이 참조하지 않고 test 파일이 아직 없다 | **기각(범주) + 부분 흡수** — 파일 부재는 구현 전 상태다. Validation 2가 그 test 파일을 돌리므로 참조는 성립한다 |

MEDIUM 이하(architect 1 · test 4 · LOW 1)는 §3.14대로 원장에 남기고 이 사이클에서 고치지
않는다. 단 test/MEDIUM의 `/tmp` 비이식성은 **실행상** 걸리므로(Windows) Validation 4를
scratchpad 경로로 돌리고 그 사실을 보고서에 적는다 — plan 본문 수정이 아니라 실행 시 대체다.

## Security Reviewer 판정

`Task(mccp:security-reviewer)` — "review proposed implementation: input validation and path
traversal". 반환: **CRITICAL 3 · HIGH 2 · MEDIUM 2**. 전건을 **구현 전에** 흡수했으므로
Open Questions로 승격된 항목이 0건이고 2.5.5의 `[MCCP-GATE-STOP]`은 발동하지 않는다 —
게이트가 막는 것은 *미해소* CRITICAL이고, 여기서는 코드가 아직 없어 흡수가 곧 작성이다.

**반환값을 그대로 믿지 않고 5건 전부 기계 확인했다.** 세 건은 확인 과정에서 리뷰어 서술보다
강한 사실이 나왔다.

| # | severity | 주장 | 기계 확인 | 처리 |
|---|---|---|---|---|
| C1 | CRITICAL | `isRepoRelativeEvidencePath`는 문자열 검사라 symlink 탈출을 막지 못한다 | 소스 확인 — `review-verdict.js:80-95`에 `fs` 호출이 없다. 봉쇄 선례는 저장소에 이미 있다(`goal-detect.js:92,97` · `goal-phase-lock.js:226`) | **흡수** — 읽기 전에 `realpathSync` 봉쇄를 얹는다. 재발명이 아니라 기존 패턴 미러 |
| C2 | CRITICAL | `git rev-list`에 `--` 구분자가 없으면 경로가 옵션으로 파싱된다 | **실측: `isRepoRelativeEvidencePath('--all')` → `true`, `('-n')` → `true`, `('--output=/tmp/x')` → `true`.** 선행 대시 규칙이 아예 없다 | **흡수** — `execFileSync` 배열 인자 + `--` 구분자 + 선행 대시 자체 거부(3중) |
| C3 | CRITICAL | 이력 순회·버퍼·타임아웃 상한 부재 | 저장소 선례 확인(`history-leak-scan.js` maxBuffer · `hook-caps.js` timeout) | **흡수** — Codex F3과 같은 축. 리비전 수·`maxBuffer`·`timeout` 3축 상한 + 소진을 `history_limit_exhausted`로 **진짜 부재와 구분** |
| H1 | HIGH | 파생 slug가 Windows 예약 장치명일 수 있다 | **실측: `isRepoRelativeEvidencePath('CON')` → `true`.** 이 저장소는 win32에서 돌고, `CON`을 읽으면 실패가 아니라 **stdin 대기로 멈춘다** | **흡수** — slug와 경로 세그먼트를 예약 장치명 집합에 대해 거부 |
| H2 | HIGH | ISO 정규식 통과 후에도 날짜가 강제 변환될 수 있다 | 확인 — `2026-02-30T00:00:00Z`는 plan이 지정한 정규식을 통과하고 `Date.parse`는 3월 2일을 준다 | **흡수** — 정규식 뒤에 `toISOString()` 왕복 대조. G3 시간축이 판정을 가르므로 조용한 이동은 미탐/`post_approval`을 뒤집는다 |
| M1 | MEDIUM | slug 추출 규칙이 미명시 | — | 흡수(무비용) — `path.basename(planPath, '.plan.md')`로 고정 |
| M2 | MEDIUM | 손상 receipt가 `degraded`인지 무시인지 미명시 | plan이 이미 답한다 — `proof_backing`의 `receipt_corrupt` 값 + DN15(비-`corroborated` → `degraded`) | 기각(기해결) |

**공유 validator는 고치지 않는다.** C2·H1이 드러낸 구멍은 `isRepoRelativeEvidencePath`
자체에 있지만, 그 함수는 `review-verdict.js`의 게이트 경로 소유물이고 UI5(#5 오라클 추출 전
배선 확대 금지) + Validation 8(게이트 파일 diff 공집합)이 그 파일 수정을 금한다. 그래서
이 도구는 **정본 validator를 그대로 재사용하고 그 위에 자기 층을 얹는다** — DN13이 요구한
"재구현하지 않는다"를 지키면서 자기 사거리의 구멍을 닫는 유일한 형태다. 정본 validator를
넓히는 것은 그 함수의 다른 호출자(`review-verdict.js:173-177`의 `dispatch_evidence` 검증)에
영향을 주므로 **별도 축**이며 원장으로 이연한다(아래).

이연 1건 — `isRepoRelativeEvidencePath`가 선행 대시와 Windows 예약 장치명을 거부하지 않는
것은 정본 validator의 결함이고, `dispatch_evidence[]` 경로에도 같은 구멍이 열려 있다.
M11은 자기 도구만 닫았다.
