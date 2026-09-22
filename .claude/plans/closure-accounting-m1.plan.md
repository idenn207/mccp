# Plan: closure-accounting M1 — closure-report

**Source PRD**: `.claude/prds/closure-accounting.prd.md`
**Selected Milestone**: 1 — closure-report
**Complexity**: Small

## Summary

부채 종결을 재는 계기가 이미 셋 있고(disposition ledger · findings-registry 이벤트 로그 ·
backlog 파서), 서로 다른 분모 위에서 서로 다른 답을 낸다 — 오늘 각각 `open: 0` · 1.59% ·
61.85%다. M1은 **새 계기를 만들지 않고** 그 셋을 한 read-only 출력으로 합쳐, 봉인 분모와
라이브 부채의 격차와 봉인 나이를 처음으로 산출한다. 그 값은 **실행 시점에 세 원장을 다시
읽어** 만들어진다 — 기준선 JSON은 특정 시각의 측정 기록이지 리포트의 입력이 아니다.
재봉인하지 않고, 상태를 바꾸지 않고, 무엇도 차단하지 않는다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | plan은 주장이 아니라 실측에 근거한다 | direction |
| UI2 | 조사 대상에 backlog · fix-task · open questions가 포함된다 | direction |
| UI3 | 의도대로 동작하지 않는 기능을 실측으로 식별한다 | direction |
| UI4 | 결과를 새 마일스톤으로 추가한다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 모듈 경계 | `plugins/mccp/scripts/lib/env-contract/cli.js:290` | 순수 오라클(`report.js`) + 얇은 CLI 투영(`cli.js`)이 분리되고, CLI는 `process.exit(main(argv))` 한 줄로 끝난다 |
| 실패 정책 | `plugins/mccp/scripts/derive/sources/backlog.js:74-82` | 모든 조기 반환 경로가 **같은 필드 집합**을 싣는다(`EMPTY`). 분기마다 shape가 달라지면 소비자가 가장 검사하지 않는 경로에서 `undefined`를 받는다 |
| 지연 require | `plugins/mccp/scripts/derive/sources/backlog.js:146-160` | `debt-inventory`는 순환 참조 위험이 있어 함수 안에서 require하고 실패를 fail-soft로 접는다 |
| 원장 읽기 | `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:385-389,432-454` | **두 함수의 계약이 다르다.** `readDispositions`만 `{ok, lines}`로 답한다. `readInventory`는 부재 시 `null`, 그 외에는 `JSON.parse`를 **감싸지 않고** 반환하므로 파손 봉인에서 throw한다 — 호출자가 try/catch해야 한다 |
| Test | `plugins/mccp/scripts/derive/tests/backlog-source.test.js:1-12` | **불변식을 동결하고 이 저장소의 행 수는 동결하지 않는다** — 게이트가 append할 때마다 값이 움직인다(실측 171/443 → 181/453) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/closure/report.js` | CREATE | 순수 오라클. 세 원장을 읽어 격차·나이·3분할을 산출. 쓰기 없음 |
| `plugins/mccp/scripts/lib/closure/cli.js` | CREATE | `closure report [--json]` 투영. `env-contract/cli.js` 형태 |
| `plugins/mccp/scripts/lib/closure/tests/report.test.js` | CREATE | 불변식 동결 + 기준선 JSON과의 **구조** 정합 |
| `.claude/_meta/data/2026-09-08-closure-baseline.json` | CREATE (완료) | 기준선 실측. 이미 작성됨 |
| `.claude/prds/closure-accounting.prd.md` | CREATE (완료) | 자식 PRD. 이미 작성됨 |
| `.claude/prds/harness-wiring-integrity.prd.md` | UPDATE (완료) | 우산에 C11 행 추가. 이미 반영됨 |
| `docs/multi-session-work-loop/debt-inventory.md` | UPDATE | 스냅샷 의미론의 **갱신 부재**를 한계로 명시하고 `closure report`를 가리킨다 |
| `CHANGELOG.md` | UPDATE | `## [Unreleased]` 아래에 항목 추가 (§3.7 — 브랜치는 번호를 선언하지 않는다) |

## Tasks

### Task 1: 순수 오라클 `report.js`
- **Action**: `buildClosureReport(repoRoot)` 하나를 export한다. 반환 필드:
  `seal{sealed_at, sealed_at_commit, inventory_sha256, items, by_source, age_days}` ·
  `live{items, by_source}` ·
  `denominator_gap{count, pct}` ·
  `dispositions{total, by_disposition, disposed, resolved, fixed, suppressing}` ·
  `ledgers[]` (disposition ledger와 findings-registry 이벤트 로그를 **각각 한 행**으로,
  `name`·`closed`·`total`·`pct`·`denominator_note` 포함) ·
  `degraded[]` (읽지 못한 축의 이름과 이유).
  **`degraded[].reason`은 raw `err.message`를 절대 싣지 않는다.** `debt-inventory.js:196`·`:232`·`:439`·`:316-320`가
  `err.message`를 그대로 실어 보내고 Node fs 오류 메시지는 사용자 홈 절대경로를 포함하는데,
  Task 6이 그 출력을 **git-tracked 산출물로 커밋**한다. 저장소는 이미 같은 종류의 절대경로
  유출로 sanctioned 재봉인까지 갔다(§3.12 `v1.22.4-cwd-rebind.js`). reason은 upstream
  메시지를 SCRUBBING해서 도출한다: 절대경로가 repo root 아래면 repo-relative 형태로 치환하고,
  repo 밖이면 basename만 남긴다. 메시지 텍스트는 그대로 둔다.
- **Mirror**: `plugins/mccp/scripts/derive/sources/backlog.js:74-82`의 `EMPTY` 규약 — 모든 반환 경로가 위 필드를 전부 싣는다.
  읽기 실패는 throw가 아니라 `degraded[]` 항목 + 해당 필드 `null`이다. `readInventory`와 `buildInventory` 둘 다
  throw할 수 있으므로 **반드시 try/catch로 감싸야 한다**(Patterns 표의 정정된 계약).
- **Validate**: `node -e "console.log(JSON.stringify(require('./plugins/mccp/scripts/lib/closure/report.js').buildClosureReport(process.cwd()),null,2))"` 가 exit 0. 각 최상위 `seal`·`live`·`denominator_gap`·`dispositions` 아래의 키가 기준선 JSON 같은 이름·같은 중첩을 갖는다. 리포트는 기준선의 strict 상위집합이며, 리포트 전용 추가 필드(예: `seal.age_days`)는 허용된다. 값이 아니라 구조를 단언한다.

### Task 2: 재봉인 경고를 **출력 안에** 넣는다
- **Action**: `denominator_gap.count > 0`이면 `report.reseal_warning`에 고정 문구를 싣는다 —
  "재봉인은 M2 소유다. 지금 재봉인하면 판정 <N>건이 전부 unmatched가 된다(모든 줄이
  `<old sha>`에 결속돼 있다)." `<N>`과 `<old sha>`는 실제 값으로 채운다.
- **Mirror**: PRD 결정 3. 리포트가 유도하는 다음 행동이 곧 사고이므로 그 경고는
  산문이 아니라 **출력 필드**여야 한다.
- **Validate**: `denominator_gap.count > 0`인 트리에서 `reseal_warning`이 non-null이고,
  그 문자열이 **런타임에 읽은** `seal.items`와 `seal.inventory_sha256` 둘 다를 포함한다.
  리터럴을 기대하지 않는다 — 그 값은 재봉인마다 움직인다.

### Task 3: CLI 투영 `cli.js`
- **Action**: `closure report [--json] [--repo-root <path>]`. 기본은 사람이 읽는 표,
  `--json`은 Task 1의 객체 그대로. 종료코드는 **항상 0** — 이것은 계기이지 게이트가 아니다
  (PRD 결정 4). 알 수 없는 subcommand만 exit 2.
- **Mirror**: `env-contract/cli.js:290`의 `process.exit(main(process.argv.slice(2)))`.
- **Validate**: `node plugins/mccp/scripts/lib/closure/cli.js report` exit 0 ·
  `... report --json | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))"` exit 0 ·
  `... bogus` exit 2.

### Task 4: 불변식 test
- **Action**: `report.test.js`에 다음을 단언한다 —
  (a) 모든 반환 경로가 같은 최상위 키 집합을 갖는다(원장 파일을 임시로 못 읽게 한 fixture 포함),
  (b) `disposed >= resolved >= fixed`,
  (c) 세 원장을 **주입된 fixture**로 읽혔을 때 `seal.items`·`live.items`·`dispositions.total`이
      그 fixture의 알려진 값과 같다 — `denominator_gap.count === live.items - seal.items`
      **하나만** 단언하는 것은 두 피연산자가 함께 틀려도 항상 참인 동어반복이라 금지한다.
      부호는 별도로 본다: 봉인이 라이브보다 크면(행 삭제) 음수로 **보고**되고 0으로 접히지 않는다,
  (d) `ledgers`가 정확히 2행이고 각 행이 `denominator_note`를 갖는다,
  (e) 기준선 JSON의 `debt_inventory` 아래 각 섹션(`seal`·`live`·`denominator_gap`·`dispositions`)에
      존재하는 **모든 키가** 리포트의 동명 최상위 섹션에도 같은 중첩으로 존재한다. 이는
      **부분집합 단언이지 동치 단언이 아니다** — 리포트가 그 위에 필드를 더 얹는 것은 허용되며
      실제로 `seal.age_days`가 그런 필드다(기준선에는 없다). 동치로 쓰면 그 필드 때문에 즉시
      붉어진다. 값은 비교하지 않는다,
  (f) 출력 전체를 문자열화했을 때 `/home/`·`/Users/`·`C:\\` 로 시작하는 절대경로가 **0건**이다
      (Validation 5b가 시험하는 것과 정확히 같은 세 접두사다)
      (Task 1 sanitize 계약을 반증 가능하게 만드는 유일한 단언),
  (g) `denominator_gap.count === 0`인 fixture에서 `reseal_warning`이 **null**이다
      (경고의 false 분기 — non-null만 보면 한쪽 방향만 검증된다).
- **Mirror**: `plugins/mccp/scripts/derive/tests/backlog-source.test.js:1-12` — 불변식을 동결하고 행 수는 동결하지 않는다.
- **Validate**: `MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 plugins/mccp/scripts/lib/closure/tests/report.test.js`

### Task 5: 한계를 문서에 적는다
- **Action**: `docs/multi-session-work-loop/debt-inventory.md`에 절 하나를 추가한다 —
  스냅샷 의미론은 의도이고 결함이 아니지만 **갱신 장치가 없어** 봉인이 멈추면 `open: 0`이
  영구히 참이 된다는 것, 값은 **읽는 시점마다 달라진다**는 것(기준선 파일은 특정 시각의
  측정이고, 그 안의 `debt_inventory` 섹션은 최상위 `measured_at`보다 **뒤에** 잰 값이라 한
  파일 안에도 측정 시각이 둘이다 — 그 사실이 곧 이 절의 논지다),
  그 값을 보는 수단이 `closure report`라는 것, 재봉인은 M2 소유라는 것.
- **Mirror**: PRD `## References`가 이미 그 파일을 도구 문서로 지목한다.
- **Validate**: `grep -q 'closure report' docs/multi-session-work-loop/debt-inventory.md`

### Task 6: 라이브 1회 완주와 출력 보존
- **Action**: `closure report --json`을 실제로 1회 실행해 그 출력을
  `.claude/_meta/data/2026-09-08-closure-report-live.json`으로 보존하고,
  같은 실행 시점에 `debt-inventory`를 직접 호출해 얻은 값과 대조한 결과를 보고서에 적는다.
  **기준선 JSON의 숫자와 같기를 기대하지 않는다** — 기준선 측정 이후 게이트가 append하면
  `live.items`가 움직인다. 실제로 이 plan의 리뷰 1회가 격차를 1372 → 1389로 옮겼다.
- **Mirror**: `## Acceptance`의 마지막 항목 — 단위 test 통과 ≠ 경로 작동.
- **Validate**: 그 파일이 존재하고, 그 `denominator_gap.count`가 **같은 순간에 재계산한**
  `buildInventory().items.length - readInventory().items.length`와 같다.

## Validation

```bash
# 1. 오라클이 돈다
node -e "const r=require('./plugins/mccp/scripts/lib/closure/report.js').buildClosureReport(process.cwd()); if(!r||typeof r.denominator_gap!=='object')throw new Error('shape'); console.log('ok', r.denominator_gap.count)"

# 2. CLI 세 경로
node plugins/mccp/scripts/lib/closure/cli.js report >/dev/null
node plugins/mccp/scripts/lib/closure/cli.js report --json | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('json ok')"
node plugins/mccp/scripts/lib/closure/cli.js bogus; test $? -eq 2 && echo "exit2 ok"

# 3. test
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 plugins/mccp/scripts/lib/closure/tests/report.test.js

# 4. 회귀: 건드리지 않은 이웃이 여전히 녹색인가
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/derive/tests/backlog-source.test.js

# 5. 재봉인 경고가 출력에 실재한다 (Task 2) — 리터럴 동결 없이 런타임 봉인값과 대조
node plugins/mccp/scripts/lib/closure/cli.js report --json \
  | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
     if(j.denominator_gap.count>0){
       if(!j.reseal_warning) throw new Error('gap>0 but no reseal_warning');
       if(!String(j.reseal_warning).includes(String(j.seal.items))) throw new Error('warning omits seal.items');
       if(!String(j.reseal_warning).includes(String(j.seal.inventory_sha256))) throw new Error('warning omits seal.inventory_sha256');
     } else if(j.reseal_warning) throw new Error('gap==0 but reseal_warning present');
     console.log('warn ok')"

# 5b. 산출물에 절대경로가 없다 (Task 1 sanitize 계약 · security HIGH 흡수)
node plugins/mccp/scripts/lib/closure/cli.js report --json \
  | node -e "const s=require('fs').readFileSync(0,'utf8');
     const m=s.match(/\/home\/[^\\\"\\\\\\\]+|\/Users\/[^\\\"\\\\\\\]+|[A-Z]:\\\\/);
     if(m) throw new Error('absolute path leaked: '+m[0]); console.log('no abs path')"

# 6. 문서 앵커
grep -q 'closure report' docs/multi-session-work-loop/debt-inventory.md && echo "doc ok"

# 7. 기존 원장 코드 편집분 0을 확인한다 (PRD 병렬 안전성 주장의 근거).
#    M1은 "신규 파일만"이 아니다 — 문서 2건을 UPDATE한다(Files to Change). 이 가드가 지키는
#    범위는 아래 세 경로의 **원장 코드**이며, 그 밖의 문서 편집은 대상이 아니다.
#    invariant HIGH 흡수: 이전 형태는 `| grep . && echo ... || echo ...` 였고 두 분기 모두
#    echo로 끝나 **항상 exit 0**이었다 — 위반 트리와 청정 트리를 구별하지 못했다.
if git diff --name-only origin/main...HEAD -- \
     plugins/mccp/scripts/lib/msw-metrics/ \
     plugins/mccp/scripts/state/findings-registry.js \
     plugins/mccp/scripts/derive/ | grep -q .; then
  echo "UNEXPECTED EDIT to existing ledger code"; exit 1
fi
echo "no edits to existing ledger code — ok"

# 7b. 작업 중 상태도 기존 ledger 코드를 건드리지 않는가
if git status --porcelain -- \
     plugins/mccp/scripts/lib/msw-metrics/ \
     plugins/mccp/scripts/state/findings-registry.js \
     plugins/mccp/scripts/derive/ | grep -q .; then
  echo "UNEXPECTED WORKING TREE EDIT to existing ledger code"; exit 1
fi
echo "no working tree edits to existing ledger code — ok"

# 8. §3.5.1 — 이번 브랜치가 삭제하는 파일이 의도한 것뿐인가.
#    출력만 하는 형태는 Acceptance("1~9 전건 exit 0")에 결속될 수 없다 — 무엇이 지워져도 exit 0이다.
#    M1은 어떤 파일도 삭제하지 않으므로 삭제 목록이 비어있음을 단언한다.
if git diff --diff-filter=D --name-only origin/main...HEAD | grep -q .; then
  echo "UNEXPECTED DELETION — §3.5.1: 머지 사고를 의심하고 멈출 것"
  git diff --diff-filter=D --name-only origin/main...HEAD
  exit 1
fi
echo "no deletions — ok"

# 9. §3.7 — 브랜치가 버전을 선언하지 않았는가
node scripts/version-declaration-guard.js --base origin/main
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 리포트가 또 하나의 안 불리는 계기가 된다 — 이 PRD가 진단한 병리 자체 | **HIGH** | Task 6이 라이브 1회 실행과 출력 보존을 요구한다. 그리고 M1은 계기를 늘리지 않고 기존 셋을 합친다 |
| 격차를 보고 반사적으로 재봉인해 판정 1115건이 끊긴다 | **HIGH** | Task 2가 그 경고를 **출력 필드**로 만든다. M1에는 재봉인 코드가 없다 |
| `buildInventory`가 매 호출마다 전 원장(오늘 2500여 건)을 재수집해 느리다 | LOW | 이 세션에서 수 초 내 완주 실측. 캐시하지 않는다 — 캐시가 곧 두 번째 stale 봉인이다 |
| test가 오늘 값을 동결해 다음 append에 red | MEDIUM | Task 4가 값이 아니라 구조·부등식만 단언한다(`plugins/mccp/scripts/derive/tests/backlog-source.test.js` 선례) |
| M1 산출물이 미머지 M4 브랜치 위에 쌓인다 | **HIGH** | 아래 `## Branch Note` 참조 — 이 plan은 브랜치 결정을 사용자에게 남긴다 |

## Branch Note

이 산출물들은 현재 `c0-release-channel-separation` worktree에서 작성됐고, 그 브랜치는
`origin/main`보다 **15 커밋 앞서 있으며 PR이 없다**(M4 residual-closure 작업). 이 M1을
같은 브랜치에 커밋하면 M4 PR의 diff에 무관한 파일이 섞이고, 그 브랜치의 ship receipt는
이미 `ship-gate-stale-head` 상태다.

**권장**: M4를 먼저 `/mccp:pr`로 내보내고, M1은 `origin/main`에서 갈라진 새 worktree
(`.worktrees/c11-closure-accounting`, §3.8)에서 구현한다.

**Migration set** — 이 M1과 연결된 tracked/untracked 산출물:
- **Untracked** (새 worktree에서 신규 작성): `.claude/plans/closure-accounting-m1.plan.md` · `.claude/prds/closure-accounting.prd.md` · `.claude/_meta/data/2026-09-08-closure-baseline.json` · `.claude/reviews/plan-review-closure-accounting.md` · `.claude/state/findings/closure-accounting.jsonl`
- **Tracked edits** (기존 파일 수정): `.claude/prds/harness-wiring-integrity.prd.md` (C11 행 추가) · `.claude/plans/codex-findings-backlog.md` (10행 append)
- **Gitignored state**: `.claude/state/review-rounds/mccp-plan-codex__closure-accounting.json` — **복사 필수**. 이 라운드-ledger를 미복사하면 plan 재실행이 라운드 캡을 리셋하고 패널이 다시 돈다(CLAUDE.md §3.16 금지). 같은 디렉토리의 `mccp-plan-codex__closure-accounting-decisions.json`(브랜치·구현적격성 2중 리뷰가 소비한 별도 round)과 `.claude/state/plan-review/dispatch-log-closure-accounting.jsonl`도 이 사이클의 기록이다 — 복사하면 이력이 보존되고, 하지 않으면 소실된다(캡 안전성에는 영향 없음).

**이 결정은 구현 착수 전에 필요하다.**

## Gate Deviation

**이 plan은 승인 receipt 없이 존재한다.** 2026-09-08 `/mccp:plan` Phase 5의 L2 패널
(`multi-agent`, 4/4 응답, roles 4/4)이 `divergent`를 냈고 `decide`가 exit 12로 차단했다.
`MCCP_GATE_ROUND_CAP=1`(enforce·봉인됨)이므로 재리뷰는 열리지 않는다 — §3.16대로
1라운드를 triage하고 진행한다.

- 리뷰 기록: [`.claude/reviews/plan-review-closure-accounting.md`](../reviews/plan-review-closure-accounting.md)
  (`halt_stage: 5.2e` · `wall_clock_ms: 212831` · `reviewed_plan_hash: sha256:436d39f8…`)
- 패널 산출: HIGH **7** · MEDIUM **7** · LOW **3** (blocking 11)

**흡수(§3.14 — HIGH 전건 그 자리에서):**

| # | 관점 | 지적 | 처리 |
|---|---|---|---|
| 1 | architect·test | Task 4(e)의 "기준선 JSON과 같은 키 구조" 단언은 성립 불가 — 최상위 교집합 0 | 대조 대상을 기준선의 **`debt_inventory` 하위 구조**로 한정하고, 그 대조가 동치가 아니라 **부분집합**임을 4(e)에 명시 |
| 2 | architect·test | Task 6·Acceptance가 참조한 `2487`·`1115`·`live.items - seal.items`가 기준선 파일에 **부재** | **기준선의 실제 결함이었다.** 봉인 축을 세션에서 측정하고도 아티팩트에 쓰지 않았다 → `debt_inventory` 섹션(seal·live·denominator_gap·dispositions·verify) 추가 |
| 3 | test | plan이 스스로 금지한 값 동결을 Validate 2곳에서 저지름 | 리터럴 제거. 런타임에 읽은 `seal.items`·재계산한 차이와 대조하도록 전환 |
| 4 | security | `degraded[].reason`이 fs `err.message`를 실어 **git-tracked 산출물에 절대경로 유출**(§3.12 선례) | Task 1에 **메시지 scrubbing** 계약 추가(절대경로를 repo-relative로, repo 밖이면 basename으로 치환) + Task 4(f)·Validation 5b에 절대경로 0건 단언. 초안이 적었던 `{code, path_repo_relative}`는 upstream이 `err.code`·`err.path`를 버리므로 **구성 불가**여서 철회했다 |
| 5 | invariant | **Validation 7이 실패할 수 없다** — `\| grep . && echo … \|\| echo …`는 두 분기 모두 exit 0 | `if … grep -q .; then exit 1; fi`로 교체. Acceptance가 이 검사에 결속돼 있었으므로 안전 주장 전체가 반증 불가였다 |

지적 3의 정당성은 이 사이클이 스스로 실증했다 — 기준선 측정 시점 격차 **1372**가 패널 실행
직후 **1389**로 움직였다(findings-registry에 패널 자신의 지적 17건이 `finding_opened` 이벤트로 기록됐다).

**이연(§3.14 — MEDIUM·LOW는 원장으로):** 10행을
[`codex-findings-backlog.md`](codex-findings-backlog.md)에 append(2026-09-08).
그중 6건(`readInventory` 계약 오인 ×2 · Task 4(c) 동어반복 · `reseal_warning` false 분기 ·
Validation 5 리터럴 · `inventory_sha256` 미앵커)은 **같은 사이클에서 함께 흡수**했으므로
원장 행은 제기 사실의 기록이고 미해소 항목이 아니다. 남는 미해소는 4건이다.

**2차 — fable × codex 2중 리뷰(2026-09-08).** 위 흡수 이후의 본문에 대해 별도 decision
슬러그(`closure-accounting-decisions`)로 라운드를 열어 **모델 밖 Codex**와 **fable**을 각각
독립 리뷰어로 돌렸다. 두 축을 물었다 — (1) 산출물을 어느 브랜치에 둘 것인가 (2) 흡수된 plan이
구현 착수에 적격인가. **(1)은 두 리뷰어가 일치**해 새 worktree 이관(옵션 c)으로 확정했고,
**(2)는 갈렸다**(fable `ready-with-fixes` / codex `not-ready`). 보수적으로 `not-ready`를 취해
합집합 12건을 흡수했고, 그 결과를 다시 2중 검증해 잔여 13건(부분 착지 5 · 회귀 8)을 닫았다.
그 라운드가 이 절의 위 표에 없는 지적들의 출처다.

**3차 — 구현에 대한 fable × codex 2중 리뷰 3라운드(2026-09-08).** 구현은 세 번 리뷰됐고
세 번 모두 `fail`로 돌아왔다. 그 순서가 이 milestone의 논지 자체를 실증하므로 남긴다.

| 라운드 | 스위트 상태 | 리뷰어가 실제로 찾은 것 |
|---|---|---|
| R1 | 8/8 green | **그 green이 공허했다** — Task 4(e)의 기준선 경로가 `plugins/.claude/…`로 해소돼 존재하지 않았고 try/catch가 조용히 `return`했다. 가장 중요한 단언이 한 번도 실행된 적 없었다 |
| R2 | 15/15 green | 10건을 고쳤다고 보고했으나 **3건이 미착지**였다. 선언한 에이전트는 소스를 읽었고, 반증한 리뷰어는 probe를 돌렸다 — unmatched disposition 줄로 300% closure 재현, `readAll().degraded`가 boolean인데 `Array.isArray` 검사, scrub 3연속 replace가 서로의 출력을 재스캔 |
| R3 | 20/20 green | **돌지만 아무것도 고정하지 않았다** — 의미 mutation 20종 중 **15종이 생존**했다(`resolved := disposed`, `disposed := sealItems`(영구 100%), sha 결속 제거…). 원인은 모든 fixture가 봉인 항목 전부를 온전한 줄로 처리해 세 카운트가 우연히 일치한 것 |

R3 흡수: `disposed(6) ≠ resolved(3) ≠ fixed(1) < total(10)`이고 제외 사유 두 가지를 각각
심은 fixture를 도입해 그 계열을 통째로 죽였다 · 봉인 `items` shape 불량이 oracle 밖으로
throw하던 경로를 강등으로 접었다(그 전에는 CLI가 0바이트 출력에 exit 0) · malformed
disposition 원장에서 `dispositions`만 null이고 ledger 행과 재봉인 경고는 확정 수치를
계속 싣던 모순을 닫았다 · `degraded[]` 중복 push 제거 · scrub의 lookbehind가 면제하던
`file:///home/…` · `cwd:/home/…` · `-/home/…` 세 형태를 닫았다 · 커밋 예정이던 리뷰 기록의
사용자 홈 절대경로를 제거했다(PR history-leak 게이트는 sibling worktree 경로를 못 잡는다).

**비공허성은 이제 주장이 아니라 측정이다** — mutation 13종 전건 killed, 기댓값 위조 시 red.
남은 MEDIUM 2 · LOW 3은 [codex-findings-backlog.md](codex-findings-backlog.md)에 이연했다
(실패 순서 의존성 · upstream 열거 실패의 latent 0/0 · cwd 결속 test 5건 · `readAll` 비배열
반환 · table 모드의 note 미렌더).

**4차 — PR-Codex R1(2026-09-08). 그 "남는 델타"가 실제로 결함을 담고 있었다.**
`/mccp:pr`의 PR-Codex가 발화해 `divergent`를 냈고 ship gate가 push를 차단했다. HIGH 1건은
실재했고 흡수했다 — `denominator_gap.count`가 길이 뺄셈이라 **봉인 항목이 전부 라이브에
남아 있다고 가정**했다. 독립 재현: 길이차 1689 대 ID기준 1703, 봉인 14건이 라이브에 부재.
추가와 삭제가 상쇄되면 격차 0을 보고하고 `reseal_warning`이 침묵하므로, 이 milestone이
없애려는 병리를 계기 자신이 재생산할 수 있었다. `count`를 `|live \ sealed|`로 바꾸고 옛
뺄셈은 `net_change`로 분리했으며, 크기는 같고 식별자가 겹치지 않는 fixture로 반증 test를
추가해 mutation으로 비공허성을 확인했다. MEDIUM 1건(`findings-registry.js` 열거 실패 삼킴)은
**Validation 7이 편집을 금지한 upstream 파일**이라 backlog로 이연했다. override는 쓰지
않았다. 상세는 [보고서](../PRPs/reports/closure-accounting-m1-report.md)의 `## PR-Codex R1`.

**5차 — PR-Codex R2(2026-09-08).** R1의 HIGH를 고치자 `denominator_gap`의 의미가 바뀌었고 그
코드는 미리뷰였다. ship gate의 복구 지침 1순위대로 `MCCP_GATE_ROUND_CAP=2`로 재발화시켰고, R2가
**다른 축의 HIGH**를 냈다 — `inventory_sha256`을 재계산 없이 신뢰해, 봉인을 1건으로 잘라도
digest만 유지하면 `closed:1 total:1 pct:100 · degraded:[]`가 나왔다(재현 확인). 손상된 봉인이
완벽한 종결 점수를 내는 두 번째 경로다. `inventoryHash` 재계산·대조를 넣고 불일치 시 관련 수치를
전부 null로 접었으며, 양방향 mutation으로 test 비공허성을 확인했다(검증 끄면 `(i)` red, 전부
degrade하면 `(i2)`·`(m1)` red). MEDIUM(disposition 미검증 — 거짓 100%의 **알려진 잔여 경로**)은
재현 절차째 backlog로 이연했다. 이후 캡이 소진돼 §3.16대로 라운드를 늘리지 않고
`MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`로 ship하며, 그 우회는 verdict를 재작성하지 않는다.

**남는 델타** — R3 잔여 수정 이후의 본문과 코드는 **다시 리뷰되지 않았다.** 라운드 캡이
소진됐고(§3.16) 재리뷰가 기본 선택지가 아니므로, 그 사실을 여기 적는 것으로 닫는다.
구현 착수 전에 필요한 것은 재리뷰가 아니라(캡 소진) 이 절의 정직한 존재다.

## Acceptance

- [ ] All tasks complete
- [ ] Validation 1~9 전건 exit 0
- [ ] Patterns mirrored, not reinvented — 특히 `EMPTY` 규약과 "불변식만 동결" test 규약
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동):
      `closure report --json`을 라이브 1회 실행해
      `.claude/_meta/data/2026-09-08-closure-report-live.json`을 산출하고,
      그 `denominator_gap.count`가 **같은 순간에 재계산한** `buildInventory` −
      `readInventory` 차이와 일치함을 확인한다(기준선의 고정 숫자와 비교하지 않는다 —
      게이트 append가 그 값을 움직인다).
      **이 항목은 리포트가 "돈다"가 아니라 "그 시점의 실제 격차를 낸다"를 요구한다.**
- [ ] `report.js`·`cli.js`가 `debt-inventory.js`·`findings-registry.js`·`backlog.js`를
      **읽기만** 하고 한 줄도 편집하지 않음 (Validation 7)
