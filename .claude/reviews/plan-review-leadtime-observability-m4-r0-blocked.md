# Plan Review Panel — leadtime-observability-m4

**Plan**: `.claude/plans/leadtime-observability-m4.plan.md` · **Plan version**: `sha256:f252ab4d51720c7f02a2b8c337818b70139368e0356413208e4f216fa99104e9`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 11 blocking finding(s): architect/HIGH, architect/HIGH, architect/FAIL, test/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | 공유 줄 폭 예산이 계획 안에서 두 값(125 대 120)으로 갈린다 — 그리고 계획 자신의 3자리 예시(121칼럼)가 Task 1이 지시한 상수 120을 초과한다. 구현자가 Task 1을 그대로 따르면 DD3이 근거와 함께 결정한 예산이 아닌 값이 코드에 박히고, 계획의 대표 예시가 즉시 실패한다. | plan DD3: "따라서 예산은 **표시 칼럼 125**로 두고" / Rendered Examples (b): "**(b) 3자리 코퍼스(합성) — 121 칼럼, 예산 125 안**" vs Task 1 Action: "예산 상수 2개(공유 줄 120 · 그 외 100)를 신설하고 export한다" (그리고 DD3 critique B 불릿도 "공유 줄 120 · 나머지 100"). 121 > 120. |
| architect | HIGH | Task 5의 검증 오라클이 DD3의 결정과 정면으로 모순된다 — DD3은 4자리 코퍼스가 예산을 넘는다고 명시했는데 Task 5는 4자리 합성 투영으로 공유 줄을 재고 "예산 안"을 단언하라고 지시한다. 그대로 구현하면 결정론적으로 실패하는 test이거나, 실패를 피하려 예산을 132 이상으로 몰래 올려 DD3의 근거 서술("숫자를 문구에 맞춰 고른 것이 아니다")을 무효로 만든다. | plan DD3: "실측: 오늘 109 · 3자리 121 · 4자리 132 — 즉 **4자리 코퍼스는 이 예산을 넘고, 그때 다시 판정해야 한다.**" 및 "그 값이 3자리 코퍼스(현실적 성장 구간)를 견딤을 test가 합성 투영으로 단언한다" vs Task 5 Action: "1레코드 합성 픽스처 대신 **4자리 카운트 합성 투영**으로 공유 줄을 재게 한다" + Validate: "공유 줄이 공유 예산 안". |
| architect | MEDIUM | Task 8의 Validate가 그 Task의 행위로는 구조적으로 성립할 수 없다. evidence-audit는 ledger를 `fs.readdirSync`로 세므로 이미 디스크에 존재하는(untracked) M3 엔트리는 이미 카운트되어 있고, git commit은 `ledger_count`를 1 증가시키지 않는다. 즉 Task 8이 닫으려는 성질(§3.12 tracked 내구성)을 이 오라클은 관측할 수 없다. | plugins/mccp/scripts/lib/evidence-audit.js:92 `names = fs.readdirSync(dir);` · :298 `ledger_count: ledgerCount` · :311 'ledger entries : ... (raw files, no dedup)'. git status 스냅샷: `?? .claude/state/completion-ledger/leadtime-observability-m3__e337d9e3d659.json` (파일은 이미 존재). plan Task 8 Validate: "`evidence-audit.js --json` 이 ... `ledger_count`가 1 증가한다". |
| architect | MEDIUM | DD6/Task 6의 토글은 한 소비 표면(STATUS.md 줄)만 끄고 다른 tracked 소비 표면(distribution.json)에는 낡은 파일을 그대로 남긴다. 축을 껐다는 사실이 그 파일에 표기되지 않아, C7이 인용하기로 한 산출물이 최신인 척 잔존한다 — UI7(부재를 부재로 적는다)의 경계가 두 표면에서 갈린다. 계획은 이 축을 언급하지 않는다. | plugins/mccp/scripts/lib/leadtime-distribution.js:67-69 `if (summary === null \|\| summary === undefined) return { written: false, reason: 'no-summary' };` — 기존 파일을 지우지도 표시하지도 않는다. plan DD6: "꺼지면 `model.leadtime`이 `null`이고 ... 줄이 사라진다" / Acceptance (d)는 줄 소멸만 확인한다. |
| architect | LOW | Patterns to Mirror 표의 인용 줄이 틀렸다 — `summarizeForSurface`는 leadtime.js:1122이고, 942행은 `coverage.measurable` 대입이다(DD4가 분모 근거로 인용한 용도로는 맞지만 '단일 투영' 근거로는 아니다). | plan Patterns to Mirror: "\| 단일 투영 \| `leadtime.js:942` \| `summarizeForSurface`가 유일한 해석 지점 \|" vs plugins/mccp/scripts/lib/leadtime.js:1122 `function summarizeForSurface(result) {` · :942 `measurable: result.records,`. |
| security | MEDIUM | Task 8's Validate cannot detect the property it claims to close. `evidence-audit.js` enumerates the ledger directory from the filesystem, not from git, so the currently-untracked M3 entry is ALREADY counted in `ledger_count` today. Committing it changes nothing the check can observe — 'ledger_count가 1 증가한다' is false as written, and tracked-ness (the actual §3.12 durability property: the audit must still work after the worktree is deleted) is never verified by any Validation step. The milestone can therefore declare the evidence gap closed while the file remains uncommitted. | plugins/mccp/scripts/lib/evidence-audit.js:86-96 `function readRawLedger(root) { const dir = path.join(root, LEDGER_SUBDIR); ... names = fs.readdirSync(dir);` (no git plumbing anywhere in the file) vs plan Task 8 Validate: "`node plugins/mccp/scripts/lib/evidence-audit.js --json` 이 비영점 exit를 내지 않고 `ledger_count`가 1 증가한다". The entry already exists on disk at .claude/state/completion-ledger/leadtime-observability-m3__e337d9e3d659.json (git status: untracked). |
| security | MEDIUM | Task 8 commits into the git-tracked audit corpus a ledger entry that asserts `version: "1.35.0"` — a plugin version no release cut has issued (this worktree's manifest is 1.34.4 per the plan's own Gate Deviation, and §3.7/UI10 say branches never declare a number). The plan does not acknowledge this, and none of its Validation steps look at it: `version-declaration-guard.js` inspects only plugin.json, the two renderer footers and CHANGELOG.md, never the completion ledger. The record is also self-locking — the entry's filename identity and binding are `<decision_id>__<receipt_hash[0:12]>`, so the value cannot be corrected later without breaking the ledger↔receipt binding (§3.12 no-rehash). Consequence: a durable, unguarded false version claim enters the audit corpus that downstream ledger readers report as shipped. | .claude/state/completion-ledger/leadtime-observability-m3__e337d9e3d659.json:7 `"version": "1.35.0"`; plan line 417-421 Gate Deviation states the worktree is `1.34.4`; plan UI10 "브랜치는 plugin manifest의 버전을 선언하지 않는다"; scripts/version-declaration-guard.js:40-43 constants are only PLUGIN_MANIFEST/footers/CHANGELOG — no completion-ledger path; CLAUDE.md §3.12 "ledger 엔트리의 파일명 정체성이 `<decision_id>__<receipt_hash[0:12]>`". |
| test | HIGH | 플랜이 공유 줄 폭 예산으로 서로 다른 두 숫자를 못박아, 어느 쪽으로 구현해도 플랜 자신이 요구한 단언 중 하나가 반드시 실패한다. Task 1은 상수를 '공유 줄 120'으로 신설하라고 지시하고, DD3은 '예산은 표시 칼럼 125'로 판정한다. 플랜 자신의 Rendered Examples (b) 3자리 코퍼스 문자열은 121칼럼이므로 120 예산에서는 즉시 초과다. | plan Task 1: '예산 상수 2개(공유 줄 120 · 그 외 100)를 신설하고' vs DD3: '따라서 예산은 **표시 칼럼 125**로 두고' vs Rendered Examples (b) '3자리 코퍼스(합성) — 121 칼럼, 예산 125 안' (plan lines 146, 240, 284). DD3 보강 문단도 '"공유 줄 120 · 나머지 100"의 이중 예산'이라 세 번째 표기로 흔들린다(plan:157). |
| test | HIGH | Task 5의 Validate가 요구하는 단언은 플랜의 자기 실측과 모순되어 통과 불가다 — '4자리 카운트 합성 투영으로 공유 줄을 재게' 한 뒤 '공유 줄이 공유 예산 안'임을 단언하라고 하는데, DD3이 4자리 코퍼스는 132칼럼으로 예산 125를 넘는다고 스스로 적었다. 구현자는 test를 통과시키기 위해 예산을 132 이상으로 올리거나(=DD3이 '숫자를 문구에 맞춰 고른 것이 아니다'라고 한 바로 그 행위) 단언을 조용히 3자리로 낮추게 된다. | plan Task 5: '1레코드 합성 픽스처 대신 **4자리 카운트 합성 투영**으로 공유 줄을 재게 한다' + Validate '공유 줄이 공유 예산 안' (plan:321,324-325) vs DD3 '실측: 오늘 109 · 3자리 121 · 4자리 132 — 즉 **4자리 코퍼스는 이 예산을 넘고, 그때 다시 판정해야 한다**' (plan:146-148) |
| test | HIGH | critique A의 CRITICAL('칼럼은 대리 지표이고 렌더 폭으로 검증해야 한다')을 흡수했다고 주장하지만, 그 흡수의 유일한 실체인 Task 5의 '렌더 폭 단언'은 이 저장소의 test 하네스로 실행할 수단이 없다. renderer test는 명시적으로 jsdom-free이고 레이아웃 엔진·폰트 메트릭이 없어, 880px/데스크톱에서 문단이 몇 줄로 접히는지는 결국 DD3이 '추정'이라고 인정한 px 곱셈으로만 흉내낼 수 있다. 즉 CRITICAL이 명목상 닫히고 실제로는 열린 채 남는다. | plan Task 5 Validate: '데스크톱 기본 폭과 880px에서 hero 패널 안의 이 문단이 1줄로 접히는지 재고 2줄이면 실패한다' — 그러나 Validate 명령은 `node --test .../leadtime.test.js` 하나뿐이고, renderer/tests/drawer.test.js:310이 'jsdom-free 환경 → markup-level 가드 단언'이라 적으며 responsive-layout.test.js:35는 CSS 문자열 정규식만 본다. DD3 자신도 '추정 렌더 폭은 오늘 약 759px'라고 적는다(plan:165). |
| test | MEDIUM | Task 8의 Validate는 그 Task가 바꾸는 것(git tracking)을 재지 못한다. `evidence-audit.js`는 파일시스템을 `readdirSync`로 읽으므로 이미 디스크에 존재하는 untracked 엔트리를 커밋해도 `ledger_count`는 변하지 않는다 — '1 증가한다'는 단언은 구조적으로 거짓이다. | plan Task 8 Validate: '`node plugins/mccp/scripts/lib/evidence-audit.js --json` 이 ... `ledger_count`가 1 증가한다' vs evidence-audit.js:92 `names = fs.readdirSync(dir);` / :298 `ledger_count: ledgerCount` — git index를 참조하는 경로가 없다. |
| test | MEDIUM | DD7이 단언 수단으로 지목한 '주입된 실행기'는 존재하지 않는다. leadtime.js는 `execFileSync`를 모듈 최상위에서 require해 직접 호출하며 주입 seam은 `allowGit` boolean뿐인데, DD6은 그 `allowGit`을 명시적으로 배제했다. 따라서 'spawn 0회'는 계측 지점 없이 선언된 단언이다. | plan DD7: 'spawn은 주입된 실행기 호출 수로 센다' · DD6: '되돌릴 수단은 축 자체를 끄는 토글이지 `allowGit`이 아니다' vs leadtime.js:178 `const { execFileSync } = require('child_process');` / :463 직접 호출 — opts 경유 실행기 주입 인자 0건. |
| invariant | HIGH | 공유 줄 폭 예산 상수가 plan 안에서 120과 125 두 값으로 갈리고, 어느 값을 잡아도 plan 자신이 적은 실측이 그 예산을 넘긴다. 즉 새 게이트의 임계값이 착지 시점에 '숫자를 데이터에 맞춰 다시 올리는' 방향으로만 해소된다 — DD3의 Risk 표가 스스로 경계한 그 침식이다. | plan DD3 L146-148: '예산은 표시 칼럼 125로 두고 … 실측: 오늘 109 · 3자리 121 · 4자리 132' / 같은 DD3 L157-158: '"공유 줄 120 · 나머지 100"의 이중 예산' / Task 1 L283-284: '예산 상수 2개(공유 줄 120 · 그 외 100)를 신설' / Rendered Examples (b) L240: '3자리 코퍼스(합성) — 121 칼럼, 예산 125 안' — 상수가 120이면 plan 자신의 (b) 예시가 초과다. |
| invariant | HIGH | Task 5의 Validate는 '4자리 합성 투영으로 공유 줄을 재고 공유 예산 안'을 단언하는데, DD3의 실측이 4자리=132 > 125라고 못박는다. 이 단언은 구현 시 결정적으로 red이며, 통과시키는 유일한 길은 예산 상수를 132 이상으로 올리는 것 — 게이트가 데이터에 맞춰 열린다. | plan Task 5 L320-325: '1레코드 합성 픽스처 대신 **4자리 카운트 합성 투영**으로 공유 줄을 재게 한다 … Validate: 공유 줄이 공유 예산 안' vs DD3 L146-148: '실측: 오늘 109 · 3자리 121 · 4자리 132 — 즉 **4자리 코퍼스는 이 예산을 넘고**'. |
| invariant | HIGH | critique A의 CRITICAL('칼럼은 대리 지표, 실제 렌더에서 두 줄이 될 수 있다')을 닫는다고 선언한 Task 5의 '렌더 폭 단언'은 (a) 저장소에 레이아웃 측정 수단이 없고 (b) plan 자신이 880px·3자리에서 wrap을 '수용'한다고 적어 단언 조건과 모순된다. 결과적으로 CRITICAL이 어떤 test도 잡지 못하는 문장으로 닫힌다. | plan Task 5 L326-327: '데스크톱 기본 폭과 880px에서 … 몇 줄로 접히는지 재고 2줄이면 실패한다' vs DD3 L165-170: '880px 뷰포트의 가용 폭은 약 771px이라 3자리 코퍼스부터 그 폭에서는 wrap한다 … 이 wrap은 **수용**하되'. 저장소의 반응형 검증은 레이아웃 엔진이 아니라 CSS 정규식이다 — plugins/mccp/scripts/lib/renderer/tests/responsive-layout.test.js:35,39-41 (`assert.match(CSS, /@media\\s*\\(max-width:\\s*880px\\)/)`), 그리고 plan L47-49가 폭 유틸 '0건 · root package.json 없음'을 명시한다. |
| invariant | MEDIUM | Task 8(§3.12 증거 내구성 공백 닫기)의 검증이 자기가 주장하는 속성(git-tracked 여부)에 앵커되지 않는다. `ledger_count`는 fs 디렉토리 스캔값이라 이미 디스크에 존재하는 untracked 엔트리를 세고 있으며, 커밋해도 증가하지 않는다 — 통과·실패 어느 쪽도 tracked 전환을 증명하지 못한다. | plan Task 8 L351-352: 'evidence-audit.js --json 이 비영점 exit를 내지 않고 `ledger_count`가 1 증가한다' vs plugins/mccp/scripts/lib/evidence-audit.js:92 `names = fs.readdirSync(dir);` · :298 `ledger_count: ledgerCount` · :311 `'ledger entries  : ' + r.ledger_count + ' (raw files, no dedup)'`. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | DD1~DD9의 인용을 전부 열어 대조했다: leadtime-surface.js:48-52(정규식 falsifier)·:105-106(100칼럼 주석)·:114(헤드 통계명)·:144-150(note if/else)·:166-171(런타임 호출 0건), leadtime.js:942/827(두 분모)·:1152(닫힌 열거형 push), renderer/sections/leadtime-line.js:51-53(md soft break 대 html 두 문단), status-grid.js:258(빈 줄 선행), renderer/tests/leadtime-line.test.js:68(줄 수 단언) — 이 인용들은 전부 계획이 말한 대로였다. Rendered Examples 세 문자열을 assertCoverageAdjacency의 HEAD_COVERAGE/VALUE_TOKEN/ADJACENT_COVERAGE에 손으로 돌려 통과함을 확인했고, 폭 109/121도 ambiguous=1 규칙으로 재계산해 일치했다. Validation 3b가 읽는 distribution.json이 실제로 summarizeForSurface 투영 그대로임(leadtime-distribution.js serialize)도 확인해 오라클 입력 불일치 가설은 기각했다. 의존 방향(leadtime.js → leadtime-surface.js 단방향, DD1의 소유권 이전이 순환을 만들지 않음)과 md 문단 분리가 status-grid 삽입 지점을 깨지 않는지도 호출부 전수(grep)로 확인해 기각했다. 남은 결함은 위 다섯 — 그중 둘은 계획이 자기 자신과 어긋난 예산 상수와 검증 오라클이다. |
| security | pass | Attacks I ran and could NOT land: (1) markdown injection via the new denominator-divergence note — I traced the whole chain and DD4's enum-only claim holds: `leadtime.js:1152-1170` pushes only literals into `degradations`, `leadtime-surface.js:96-163` builds every token from fixed labels + numeric `count()`/`fmtMin`/`fmtDay`, and the unescaped md branch (`renderer/sections/leadtime-line.js:51`) is therefore still structurally safe after Task 4 turns `\\n` into a paragraph break; Task 3's Mirror pins the same literal-set pattern, so no record-derived free text reaches either surface. (2) Absolute-path/cwd leak into a durable artifact (the repo's named precedent) — the ledger entry I checked carries no paths (`meta.cwd` in the paired receipt is already `\\".\\"`), and `normalizePlanPath`/`NON_REPO_PATH` remains untouched by the plan. (3) Command/argument injection through the new git-spawn toggle — DD6 deliberately does NOT reuse `allowGit` and adds no new spawn; the existing `execFileSync` argv-array + `--` discipline at leadtime.js:462-469 is not in the diff. (4) Privilege escalation via the new env toggle — it only suppresses an observability axis (`model.leadtime` null → existing hide predicate), gates no approval, and rewrites no verdict. (5) Partial-state trust on the ledger↔receipt pair — I verified the pair actually corroborates (`ledger.verdict=skipped` ↔ `resolution.codex_verdict=\\"skipped\\"`, `verdictsAgree` evidence-audit.js:210-218) and the receipt carries explicit `codex_disabled_at_pr:true` proof, i.e. the sanctioned §3.12 skip path, not an unproven skip. (6) DoS via the new width function on adversarial input — DD2 confines input to formatter output, which I confirmed has no free-text component. |
| test | fail | 플랜의 8개 Task Validate 라인을 각각 실제 코드/테스트와 대조했다: (1) 폭 예산 숫자를 Task 1·DD3·Rendered Examples 3면에서 교차 검증해 120/125/121 모순과 4자리 132 대 '예산 안' 단언 모순을 확인. (2) Task 5의 렌더 폭 단언 실행 가능성을 renderer/tests(jsdom-free, responsive-layout.test.js의 CSS 정규식 수준)와 대조. (3) Task 4가 뒤집는다는 leadtime-line.test.js:68을 직접 읽어 '결함 고정' 주장이 참임을 확인(반증 실패 — 이 주장은 정확했다). (4) Task 7의 `grep -c '^- \\\\[ \\\\]'`가 1을 낼지 PRD:101/103을 세어 확인(정확). (5) Task 8의 evidence-audit ledger_count 경로를 소스에서 확인해 커밋과 무관함을 발견. (6) DD7의 주입 실행기 seam을 leadtime.js에서 grep해 부재 확인. (7) DD9의 renderer/index.js:1123 실측 기각 주장, displayWidth/SHARED_LINE_BUDGET 부재(신설 대상)는 반증하지 못했다. |
| invariant | fail | DD9의 리뷰어 주장 기각을 재검증(renderer 트리에 `l.length > 100` 패턴 0건 — 기각 타당). DD4의 두 분모 citation(leadtime.js:827 `eligible`, :942 `measurable`)을 열어 실재 확인 — 정확함. DD14 falsifier가 그룹 라벨 도입으로 no-op이 될 경로를 추적(leadtime-surface.js:48-52 VALUE_TOKEN은 단위 수치/`미산출`를 전역 매칭하므로 그룹 라벨화가 토큰을 조용히 탈락시키지 않음 — 결함 아님). DD6 토글 off의 부재 경로(hide 조건 성립·UI7)와 note enum-only 불변식 보존도 공격했으나 구멍을 찾지 못함. 실제로 남은 것은 폭 예산 임계의 자기모순 3건과 Task 8 증거 앵커 불일치다. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "divergent",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": false
  },
  "wall_clock_ms": 452493,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:f252ab4d51720c7f02a2b8c337818b70139368e0356413208e4f216fa99104e9",
  "plan_path": ".claude/plans/leadtime-observability-m4.plan.md",
  "recorded_at": "2026-09-04T01:47:51.259Z"
}
```
