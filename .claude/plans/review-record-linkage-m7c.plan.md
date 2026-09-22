# Plan: review-record-linkage M7 ship 구간 — live-firing-execution (`-m7c`)

**Source PRD**: `.claude/prds/review-record-linkage.prd.md`
**Selected Milestone**: M7 — live-firing-execution (ship 구간만)
**Decision slug**: `review-record-linkage-m7c` — plan 파일명 = 브랜치 = ship 슬러그. M7 plan의 UI2가 원했던 **단일 정체성**이 여기서 처음으로 성립한다.
**Complexity**: Small
**채택 근거**: HSR `P1-M7PATH`는 `halt`였고 사람 판정 H1도 처음엔 `halt`를 수용했다. 2026-09-22 사람이
H1을 **번복**해 이 경로를 택했다(`/mccp:milestone-close` 세션 — 기록은 M7 보고서 §11). 후보 notes가 채택 전
닫으라고 적은 P1 지적 1~5는 이 본문에 반영했다(K1 · Task 1 · K5 · `## 오케스트레이터 검사` · Task 2).
6번(헤드리스 L2 패널 실측)은 T2 자체가 재고, 7번(재리뷰 예산 우회)은 번복한 사람이 떠안은 판단이다.

## Summary

M7의 구현(`--check-live-linkage` 강제 뷰 + 회귀 19건)은 `review-record-linkage-m7b`에서 착지했고,
그 설계는 [M7 plan](review-record-linkage-m7.plan.md)이 소유한다. 이 plan은 **그 구현을 ship하는
구간 하나**만 다룬다 — 새 코드는 0줄이다.

이 구간이 따로 있는 이유는 `-m7b`의 상류 receipt가 **ship할 수 없는 상태**이기 때문이다(S1~S3).
두 receipt가 서로 다른 plan 본문에 묶여 있고, stale에는 우회가 없으며, `-m7b`의 plan 게이트는 더
열리지 않는다. 그래서 ship할 본문에 묶인 plan receipt를 새로 얻는다. 목적은 plan을 다듬는 것이
아니다 — 이 plan은 게이트가 봉인하는 순간 동결되고 finding은 본문에 흡수하지 않는다(K2 · K3).

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 브랜치 이름이 곧 ship receipt 슬러그가 되게 한다 | constraint |
| UI2 | ship은 plugin-dir 로 띄운 세션에서 완주한다 | constraint |
| UI3 | 완주 전후로 installed_plugins.json 의 sha256 불변을 확인한다 | constraint |
| UI4 | 자식 브랜치는 plugin.json version을 선언하지 않는다 | exclusion |
| UI5 | acceptance는 producer가 아니라 산출된 실값이다 | constraint |
| UI6 | 과거 코퍼스는 소급하지 않는다. 재봉인도 사이드카도 만들지 않는다 | exclusion |
| UI7 | 게이트 리뷰는 1라운드가 기본이고 이후에는 triage하고 진행한다 | direction |
| UI8 | 리뷰 finding은 HIGH와 CRITICAL만 흡수하고 나머지는 backlog로 이연한다 | direction |
| UI9 | 사람이 필요한 답변과 검토는 fable 과 codex 의 이중 리뷰로 대체한다 | direction |
| UI10 | M5 브랜치의 코드는 이 사이클 안에서 함께 머지하고 별도 ship을 시도하지 않는다 | constraint |

## 관측된 사실 (2026-09-22 · 이 워크트리에서 재현)

| # | 사실 | 재현 |
|---|---|---|
| S1 | `-m7b`의 두 상류 receipt가 서로 다른 plan 본문에 묶여 있다 | plan receipt `c27c5a…` = `e2c09a6`판, implement receipt `952d9c…` = `202d49b`판 (`plugins/mccp/scripts/receipt/hash.js`의 `planAwareMarkdownHash`) |
| S2 | stale에는 우회가 없다 | `validate --command mccp:pr --decision review-record-linkage-m7b --plan .claude/plans/review-record-linkage-m7.plan.md`가 `MCCP_RECEIPT_GATE_MODE` soft·hard·off 모두 exit 2 (`plugins/mccp/scripts/receipt/validate-cmd.js:871`) |
| S3 | `-m7b` plan 게이트의 2라운드째는 열리지 않는다 | single-pass가 캡을 1로 고정한다(`plugins/mccp/scripts/lib/review-single-pass.js:117`) · 원장 1. single-pass 없이 열면 L2 divergent에서 receipt가 없다 — HSR P0의 두 리뷰어가 독립적으로 같은 결론에 도달했다 |
| S4 | 상류 앵커는 `meta.plan_path` 문자열 동등이고 정확히 1건이어야 한다 | `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js:295`. 이 plan의 경로는 `-m7b` receipt가 선언한 경로와 달라 매칭이 1건이 된다 |
| S5 | `claude -p --plugin-dir` 하위 세션은 워크트리 본문을 실행한다 | `/mccp:receipt-status` 하위 세션이 워크트리의 `plugins/mccp/scripts/receipt/cli.js`를 호출 · 캐시 경로 0건 |
| S6 | `--settings`의 env는 키 단위로 덮고 나머지 프로젝트 env는 보존한다 | 하위 세션 `printenv`: `MCCP_GATE_ROUND_CAP` 1→2(덮음), `MCCP_RECEIPT_GATE_MODE`=`soft`(보존) |
| S7 | `--settings`의 `permissions.deny`는 `bypassPermissions`에서도 Edit를 거부하고 `permission_denials`에 남는다. 절대경로는 `//` 접두여야 한다 | `Edit(//<abs path>)` deny → 파일 불변 · denial 1건 · 결과 `REFUSED`. 접두 없이 쓴 규칙은 매칭되지 않아 편집이 통과했다 |
| S8 | 파일 모드 읽기 전용은 Edit 도구를 막지 못한다 | `chmod a-w` 파일이 Edit 뒤 내용이 바뀌었다(모드는 그대로) |
| S9 | prp-implement 2.5.4는 plan에 리뷰 절을 주입하고, 2.5.6은 "plan 또는 notes"를 받는다 | `plugins/mccp/commands/prp-implement.md:344` · `plugins/mccp/commands/prp-implement.md:724`. 주입이 상류 plan receipt를 stale로 만드는 구조 결함은 backlog 2026-08-09 MEDIUM · 2026-08-13 HIGH 행이 소유한다 |
| S10 | 선례: 세 receipt가 같은 `plan_hash`를 공유한 채 ship했다 | `closure-accounting-m2` — plan·implement·pr receipt `d22035b3…`, plan에 implement 리뷰 절 0개, 리뷰는 `.claude/notes/closure-accounting-m2-implement-review.md` |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 상류 앵커 | `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js:281-303` | 경로 문자열 동등 · 정확히 1건 |
| plan 동결 | `closure-accounting-m2` (S10) | implement 리뷰 절을 notes에 둔다 |
| 사람 판정 대체 | `.claude/plans/review-record-linkage-m7.plan.md` DD11 | 두 리뷰어 · 기계 판정 · 권한 상한 · 원문 봉인 |
| acceptance | `.claude/plans/review-record-linkage-m7.plan.md` DD9 | `--check-live-linkage` exit 0 단독 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `.claude/plans/review-record-linkage-m7c.plan.md` | UPDATE | 이 파일. T2 게이트가 봉인 전에 절을 붙일 수 있다 |
| `.claude/notes/review-record-linkage-m7c-implement-review.md` | CREATE | T3의 implement 리뷰 착지처 — plan 동결 (K2) |
| `docs/review-record-linkage/hsr-decisions.jsonl` | UPDATE | 런타임 판정점 `R-PR`·`R-SEC`의 기록 (M7 plan DD11) |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | §3.14 이연 채널 — T2 패널 finding을 plan 대신 여기에 |

## 결정

**K1 — 단일 정체성.** 슬러그 · 브랜치 · plan 파일명이 모두 `review-record-linkage-m7c`다.
`plugins/mccp/commands/pr.md:923`의 `SHIP_PLAN_PATH` 기본값이 곧 이 파일이므로 `PR_PLAN_PATH`가
필요 없다. `-m7b`에서 파일명과 슬러그가 갈라져 생겼던 운영자 채널 의존이 사라진다.
**`PR_PLAN_PATH`를 설정하지 않는다** — M7 plan Task 4의 export 지시는 `-m7b` 전용이다. 여기서 설정하면
상류 앵커가 `-m7b` receipt의 plan 경로로 오염되고 stale 2건으로 유일한 PR-Codex 라운드가 소진된다
(P1 Fable HIGH).

**K2 — 순서는 plan → implement이고, 동결은 권한 규칙이 강제한다.** 두 게이트 모두 자기 해시를
봉인하기 **전에** plan을 편집할 수 있으므로(plan 5.0 · S9) 뒤에 도는 쪽이 plan을 건드리면 앞의
receipt가 stale이 된다. T2가 봉인한 뒤의 모든 하위 세션(T3 · T5)에 이 plan 파일의
`Edit`·`Write` deny를 `//` 절대경로로 건다(S7). 산문 지시가 아니라 권한 규칙이 막고, 시도는
`permission_denials`에 남는다. **막지 못하는 것**: Bash로 파일을 쓰는 경로. 그것은 T3·T4의 해시
3자 대조가 사후에 잡는다.

**K3 — 이것은 §3.16 이탈이고, 판정은 사람이 H1 번복으로 했다(HSR `P1-M7PATH`는 `halt`).** 새 슬러그로 다시
리뷰하는 것은 IV1이 경계한 형태다. 다른 점 둘을 적는다 — (a) IV1의 우려는 재리뷰가 원장에서
**보이지 않는** 것인데, 여기서는 새 원장 · 새 레코드 파일 · 이 절이 사유와 함께 남는다.
(b) 이탈이 사는 것은 plan 완성도가 아니라 **ship할 본문에 묶인 receipt**다. T2의 finding은
plan에 흡수하지 않는다(K2 — 흡수하면 S1이 재현된다). CRITICAL·HIGH가 코드 결함이면 T3에서
코드로 흡수하고, plan 문언 지적은 §3.15 M2가 backlog에 적재한 그대로 둔다.

**K4 — `-m7b`의 receipt와 원장은 건드리지 않는다.** 삭제 · 재봉인 · 이름 변경이 전부 없다.
경로가 달라 앵커 모호성이 생기지 않는다(S4). `-m7b`는 이 PRD의 이력으로 남는다.

**K5 — 하위 세션의 권한 상한도 deny 규칙이다.** M7 plan DD11 규칙 3이 HSR에게 금지한 행동 중
deny 목록이 **접두 매칭으로 실제로 막는 것**만 막는다: `Bash(gh pr merge:*)` · `Bash(git push --force:*)` ·
`Bash(git push -f:*)` · `.claude/settings.json`의 `Edit`/`Write`. **막지 못하는 것**: `git push origin --force`
처럼 플래그가 뒤에 오는 형태 · `gh api …/merge` · Bash로 settings를 쓰는 경로(P1 Codex · Fable MEDIUM).
그것들은 `CONSTRAINTS`의 금지 문구와 사후 디스크 대조에 맡긴다. 그래서 `permission_denials`는
**비어 있거나 이 deny 목록에 걸린 항목만** 담아야 한다. 그 밖의 거부가 있으면 그 단계는 실패다 —
`bypassPermissions` 아래서 그것이 위장 성공의 유일한 신호다.

**K6 — acceptance는 M7 plan DD9 그대로다.**
`node plugins/mccp/scripts/lib/linkage-audit.js --check-live-linkage --decision review-record-linkage-m7c`
의 **exit 0** 하나. 사유 기록은 미통과의 설명이지 통과 경로가 아니다.

**K7 — 실패는 멈춘다.** T2에서 L1 실패 · L2 `unavailable`(응답 부족) · 5.2 거부가 나면 `halt`다 —
이 슬러그도 1라운드를 쓰며, 그 다음 경로는 HSR 권한 밖이다(3번째 슬러그는 없다). T3 해시 불일치도
`halt`. ship 비승인은 M7 plan의 판정점 `R-PR`·`R-SEC`를 따른다.

## 하위 세션 호출 형태

```bash
REPO="$PWD"; PLAN="$REPO/.claude/plans/review-record-linkage-m7c.plan.md"
FREEZE="\"Edit(/$PLAN)\",\"Write(/$PLAN)\","      # T2 뒤에만 넣는다 (K2)
DENY="[${FREEZE}\"Bash(gh pr merge:*)\",\"Bash(git push --force:*)\",\"Bash(git push -f:*)\",\"Edit(/$REPO/.claude/settings.json)\",\"Write(/$REPO/.claude/settings.json)\"]"
claude -p --plugin-dir "$REPO/plugins/mccp" --permission-mode bypassPermissions \
  --settings "{\"env\":{\"MCCP_AUTO_CHAIN_DISABLE\":\"1\"$EXTRA_ENV},\"permissions\":{\"deny\":$DENY}}" \
  --append-system-prompt "$CONSTRAINTS" --output-format stream-json --verbose \
  "<slash command>" > "$S/<step>.jsonl"
```

`/$PLAN`은 `$PLAN`이 `/`로 시작하므로 `//…` 형태가 된다(S7). `CONSTRAINTS`: "이 세션은 지시된
단계 하나만 수행한다. AskUserQuestion을 쓰지 않는다. Stop hook의 fix-task 요구는 기록만 하고
처리하지 않는다. `git push --force`·`gh pr merge`·`gh api`로 머지하지 않는다. `PR_PLAN_PATH`를 설정하지
않는다." 하위 세션의 성공은 자기 보고로 판정하지 않는다 — 각 Task의 Validate가 디스크를 읽는다.

## Tasks

### Task 1: 브랜치와 산출물을 준비한다 (오케스트레이터)
- **Action**: 작업 트리 clean 확인 → `git checkout -b review-record-linkage-m7c review-record-linkage-m7b` →
  `git checkout review-record-linkage-m6 -- .claude/plans/review-record-linkage-m7.plan.md .claude/plans/review-record-linkage-m6.plan.md docs/review-record-linkage/hsr-decisions.jsonl`
  (M6 plan은 검사 7이 부르는 HSR 재계산 스크립트의 유일한 구현이라 함께 운반한다 — P1 Codex MEDIUM)
  → 이 plan을 후보 notes에서 복원 → 커밋 → `git merge origin/main`(§3.5.1 삭제 검사).
  `installed_plugins.json` sha256을 **새로** 기록한다.
- **Mirror**: M7 plan Task 0의 정체성 표
- **Validate**: `## Validation` 검사 1

### Task 2: plan 게이트 1라운드 (하위 세션 · 동결 전)
- **Action**: `/mccp:plan .claude/plans/review-record-linkage-m7c.plan.md` · `EXTRA_ENV`에
  `MCCP_PLAN_REVIEW=multi-agent` · `MCCP_REVIEW_SINGLE_PASS=scope_too_small` · `FREEZE` 비움.
  (새 코드 0줄인 ship 구간이라 사유는 `scope_too_small`이다 — P1 Fable LOW)
  패널이 divergent여도 single-pass가 그 verdict를 그대로 봉인한다(§3.15). finding은 plan에
  흡수하지 않는다(K3). 산출물을 명시 경로로 커밋한다.
- **Mirror**: M7 plan R2 (`-m7b`가 같은 형태로 receipt를 얻었다)
- **Validate**: `## Validation` 검사 2

### Task 3: implement 게이트 (하위 세션 · 동결)
- **Action**: `/mccp:prp-implement .claude/plans/review-record-linkage-m7c.plan.md` · `FREEZE` 포함 ·
  `CONSTRAINTS`에 추가: "구현은 이미 착지했다(`202d49b` · `5b3935c`). 이 plan의 Task는 전부 오케스트레이터
  작업이다 — Phase 3에서 어떤 Task도 실행하지 않고 `claude -p` 하위 세션을 띄우지 않는다.
  implement 리뷰 절은 `.claude/notes/review-record-linkage-m7c-implement-review.md`에 쓴다."
- **Mirror**: `closure-accounting-m2` (S10)
- **Validate**: `## Validation` 검사 3

### Task 4: ship 전 체인을 확인한다 (오케스트레이터)
- **Action**: T2·T3 산출물을 명시 경로로 커밋하고 체인을 읽는다. 하나라도 어긋나면 `halt`(K7).
- **Mirror**: `plugins/mccp/commands/pr.md` 2.5.9의 `ok` 판정
- **Validate**: `## Validation` 검사 4

### Task 5: ship (하위 세션 · 동결)
- **Action**: `/mccp:pr` · `FREEZE` 포함. PR-Codex 비승인이나 security 정지는 M7 plan의 판정점
  `R-PR`·`R-SEC`로 간다(선택지 · 상한 · 기록은 그 plan이 소유한다).
- **Mirror**: M7 plan Task 4
- **Validate**: PR이 생성되고 evidence commit이 push됐다 · `## Validation` 검사 5의 `permission_denials` 대조

### Task 6: acceptance를 판정한다 (오케스트레이터)
- **Action**: 강제 뷰를 실행하고 설치 sha256을 재확인한다. exit 0이 아니면 M7을 complete로
  선언하지 않는다(K6). ship 이후 산출물(PRD 행 · frozen-baseline 라이브 절 · M7 보고서)은 M6
  브랜치가 운반한다(M6 plan DD13 · Task 7).
- **Mirror**: M7 plan DD9
- **Validate**: `## Validation` 검사 6 · 검사 7

## Validation

```bash
PLAN=.claude/plans/review-record-linkage-m7c.plan.md; SLUG=review-record-linkage-m7c

# 1. 정체성 (Task 1)
test "$(git branch --show-current)" = "$SLUG" || { echo "branch != $SLUG"; exit 1; }
test "$(node plugins/mccp/scripts/receipt/cli.js derive-decision --command mccp:plan --args "$PLAN" 2>/dev/null)" = "$SLUG" \
  || { echo "plan slug derivation != $SLUG"; exit 1; }
node plugins/mccp/scripts/lib/plan-review/cli.js l1 --plan "$PLAN" 2>/dev/null \
  | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log("L1:",j.verdict);if(j.verdict!=="converged")process.exit(1)'

# 2. plan receipt — 이 파일에, 이 해시로, 링크 필드와 함께 (Task 2)
node -e '
const fs=require("fs"),h=require("./plugins/mccp/scripts/receipt/hash.js");
const [plan,slug]=process.argv.slice(1);
const r=JSON.parse(fs.readFileSync(".claude/receipts/mccp-plan-codex/"+slug+".json","utf8"));
const cur=h.planAwareMarkdownHash(plan);
const ok={plan_path:r.meta.plan_path===plan, record:typeof r.meta.review_record_path==="string"&&r.meta.review_record_path.length>0,
  source:r.resolution.review_source==="multi-agent", hash:r.plan_hash===cur};
console.log(JSON.stringify(ok)); if(Object.values(ok).includes(false))process.exit(1);' "$PLAN" "$SLUG"
node plugins/mccp/scripts/lib/review-rounds/cli.js status --gate mccp-plan-codex --decision "$SLUG" --json

# 3. 동결 — plan 파일 해시 = plan receipt = implement receipt, 리뷰 절은 notes에 (Task 3)
node -e '
const fs=require("fs"),h=require("./plugins/mccp/scripts/receipt/hash.js");
const [plan,slug]=process.argv.slice(1);
const cur=h.planAwareMarkdownHash(plan);
const r=g=>JSON.parse(fs.readFileSync(".claude/receipts/"+g+"/"+slug+".json","utf8")).plan_hash;
const notes=fs.readFileSync(".claude/notes/"+slug+"-implement-review.md","utf8");
const ok={plan_receipt:r("mccp-plan-codex")===cur, implement_receipt:r("mccp-implement-codex")===cur,
  notes_section:/^## Codex Implementation Review$/m.test(notes), plan_has_no_impl_section:!/^## Codex Implementation Review$/m.test(fs.readFileSync(plan,"utf8"))};
console.log(JSON.stringify(ok)); if(Object.values(ok).includes(false))process.exit(1);' "$PLAN" "$SLUG"

# 4. ship 전 체인 — stale·blocking 0, ship 슬러그 = 이 슬러그 (Task 4)
node plugins/mccp/scripts/receipt/cli.js validate --command mccp:pr --decision "$SLUG" --plan "$PLAN" 2>/dev/null \
  | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log("stale:",j.stale.length,"blocking:",j.blocking.length);if(j.stale.length||j.blocking.length)process.exit(1)'
test "$(node plugins/mccp/scripts/receipt/cli.js derive-decision --command mccp:pr --args "" 2>/dev/null)" = "$SLUG" \
  || { echo "ship slug derivation != $SLUG"; exit 1; }

# 7. HSR 기록 · version 미선언 · 삭제 0
#    HSR 재계산은 M6 plan 검사 11과 같은 스크립트를 HSR_REQUIRED="P0,P0-M7CAP,P0-M6CAP,P1,P1-M7PATH" 로 돌린다
node scripts/version-declaration-guard.js
git diff --diff-filter=D --name-only origin/main...HEAD
```

## 오케스트레이터 검사

`/mccp:prp-implement` Phase 4가 돌리지 않는다 — 5는 하위 세션의 stream-json이 있어야 하고 6은 ship 뒤에만
성립한다(P1 Fable LOW). 오케스트레이터가 각 단계 뒤에 돌린다.

```bash
SLUG=review-record-linkage-m7c
# 5. 하위 세션의 거부는 deny 목록 안에서만 (K5) — 각 단계의 stream-json 에 대해
#    사용: node -e '<아래>' "$S/<step>.jsonl" "$PWD"
node -e '
const fs=require("fs");const [f,repo]=process.argv.slice(1);
const ev=fs.readFileSync(f,"utf8").split("\n").filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
const r=ev.filter(e=>e.type==="result").pop(); if(!r){console.error("no result event");process.exit(1);}
const plan=repo+"/.claude/plans/review-record-linkage-m7c.plan.md", settings=repo+"/.claude/settings.json";
const allowed=d=>((d.tool_name==="Edit"||d.tool_name==="Write")&&[plan,settings].includes(d.tool_input&&d.tool_input.file_path))
  ||(d.tool_name==="Bash"&&/^(gh pr merge|git push (--force|-f))/.test(String(d.tool_input&&d.tool_input.command||"").trim()));
const bad=(r.permission_denials||[]).filter(d=>!allowed(d));
console.log("is_error:",r.is_error,"| denials:",(r.permission_denials||[]).length,"| outside deny list:",bad.length);
if(r.is_error||bad.length)process.exit(1);' "${STEP_JSONL:?set STEP_JSONL}" "$PWD"

# 6. acceptance (Task 6 · K6)
node plugins/mccp/scripts/lib/linkage-audit.js --check-live-linkage --decision "$SLUG"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| T2 패널이 이번에도 전원 fail이다 (이 PRD의 모든 패널 라운드가 그랬다) | **높음** | single-pass가 `divergent`를 그대로 봉인하므로 링크 산출에는 영향이 없다. finding은 backlog, plan은 동결 |
| T2가 L1에서 멈추거나 L2가 `unavailable`이다 | 낮음 | 진입 전 검사 1이 L1 `converged`를 확인한다. `unavailable`은 §3.15가 완화하지 않으므로 `halt` — 다음 경로는 없다(K7) |
| T3 하위 세션이 명령 본문(2.5.4)대로 plan을 편집하려 한다 | 중 | deny가 막고(S7) 그 시도가 `permission_denials`에 남는다. Bash 경로는 검사 3이 잡고 `halt` |
| 하위 세션의 위장 성공 (exit 0인데 게이트 미실행) | 중 | 각 Task의 Validate가 receipt · 원장 · 해시를 디스크에서 읽는다. `permission_denials`는 deny 목록 밖이 0이어야 한다(검사 5). `bypassPermissions`에서 그 밖의 신호는 없다 — 권한 좁히기는 `headless-delegation` M1c 소유 |
| 이탈이 선례가 되어 "막히면 새 슬러그"가 습관이 된다 | 중 | K3 — 판정은 HSR이 했고 사유가 이 파일과 원장에 남는다. 3번째 슬러그는 HSR 권한 밖이다 |
| M7이 머지되지 못해 PRD의 M5 `complete`가 다시 앞선다 | 낮음 | M7 plan DD5 — 보고서가 그 사실을 적는다 |

## Acceptance

- [ ] `node plugins/mccp/scripts/lib/linkage-audit.js --check-live-linkage --decision review-record-linkage-m7c`가 **exit 0** (K6 — 유일한 통과 기준)
- [ ] plan 파일 해시 = plan receipt = implement receipt의 `plan_hash`이고 plan에 implement 리뷰 절이 없다 (검사 3)
- [ ] 모든 하위 세션의 `permission_denials`가 deny 목록 밖을 담지 않는다 (검사 5)
- [ ] `installed_plugins.json` sha256이 Task 1 값과 같다 (UI3)
- [ ] `-m7b`의 receipt · 원장 · 레코드가 무변경이다 (K4)
- [ ] exit 0이 아니면 사유가 M7 보고서에 있고 M7은 complete로 선언되지 않는다

> 위 둘째~다섯째 항목은 **경로 조건**이다. 첫째 항목을 대체하는 통과 경로가 아니다(M7 plan DD9).
