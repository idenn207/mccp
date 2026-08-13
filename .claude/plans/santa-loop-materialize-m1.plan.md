# Plan: santa-loop 실체화 — M1 (모듈 골격 + 캡 강제)

**Source PRD**: `.claude/prds/santa-loop-materialize.prd.md`
**Selected Milestone**: 1 — 모듈 골격 + 캡 강제
**Complexity**: Medium

## Summary

`/mccp:santa-loop`의 결정 로직을 `plugins/mccp/scripts/lib/santa/` 3개 모듈(`ledger` · `counter` · `gate`)로 내리고 `cli.js` facade를 통해 `santa-loop.md`가 thin caller가 되게 한다. 라운드는 gitignored 상태 파일에 코드로 기록되고, 캡(`MCCP_SANTA_ROUND_CAP`, default 3)은 **리뷰어 발화 직전** `begin-round`가 비영점 exit로 거부해 강제한다. **판정 규칙의 내용은 바꾸지 않는다** — `gate.js`는 현 산문 표(둘 다 PASS → NICE, 하나라도 FAIL → NAUGHTY)를 그대로 구현하고 시그니처만 P1을 위해 동결한다.

**M1이 달성하지 않는 것 (PRD 1순위 지표의 절반).** PRD Success Metrics 1행은 "라운드 수가 **상태 파일에 기록되고 receipt에 봉인**"을 요구한다. M1은 앞 절반만 낸다 — 봉인은 `mccp-santa-review` GATE_ID를 신설하는 **M2 소유**다. 이 미달은 숨기지 않고 M1 보고서와 PRD M1 행에 그대로 적는다.

## User Intent

<!-- PRD는 2026-08-12 사용자와 co-created 산출물이므로 그 Out of scope · 승계 불변식 · Open Question 권고는 사용자 발화 제약이다. 저자 정당화는 ## Design Decisions에만 둔다. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | severity 축 정의와 patch-chasing terminator는 P0가 만들지 않는다. P1 소유 | exclusion |
| UI2 | 블라인드 레인과 스코프 확장은 P0가 만들지 않는다. P2 소유 | exclusion |
| UI3 | 델타 스코프 계산은 P0가 만들지 않는다. P3 소유 | exclusion |
| UI4 | 어떤 command도 santa receipt를 requires_preceding에 넣지 않는다 | constraint |
| UI5 | rubric 문안은 산문이 적합한 영역이므로 축약 대상이 아니다 | constraint |
| UI6 | santa verdict의 review_source는 multi-agent로 고정하고 codex나 hybrid로 표기하지 않는다 | constraint |
| UI7 | 원장은 리뷰어가 아니라 집계 단계가 읽는다. 리뷰어는 fresh, 원장은 persistent | constraint |
| UI8 | 계측이 먼저다. 계측 없이 착지한 개선은 다시 체감으로만 평가된다 | direction |
| UI9 | 원장 본문은 gitignored로 두고 집계값만 receipt에 봉인한다 | direction |
| UI10 | P0는 동작 보존 리팩터링이며 캡 강제 외에 판정 결과를 바꾸지 않는다 | constraint |
| UI11 | MVP는 골격과 캡으로 좁히고 판정 내용은 전부 P1에 남긴다 | constraint |
| UI12 | 인터페이스 변경은 P0 재개로만 하며 자식 PRD가 임의로 바꾸지 않는다 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수 oracle ↔ 디스크 분리 | `plugins/mccp/scripts/lib/orchestration-runaway.js:231` (`clampForRunaway`) vs `:421` (`readCounter`) | 결정은 인자만 받는 순수 함수, I/O는 별도 함수. 순수 쪽만 단위 test |
| 상태 파일 경로 해석 | `plugins/mccp/scripts/lib/orchestration-runaway.js:251` (`getRunawayPath`) | `opts.statePath` → `opts.stateDir` → `cwd/.claude/state/` 3단 fallback. test가 tmpdir을 주입 가능 |
| env 토글 파싱 | `plugins/mccp/scripts/lib/orchestration-runaway.js:145` (`parseMaxAgents`) | 정수 파싱 + 범위 검사 + 불량값은 loud stderr warn 후 default |
| CLI facade | `plugins/mccp/scripts/lib/plan-review/cli.js` + `decide.js`/`quorum.js` | `cli.js`는 subcommand dispatch + JSON stdout + exit code만. 판정은 sibling 모듈 |
| 명령 본문 축약 | `plugins/mccp/commands/work.md:760-791` | 산문은 "무엇을 왜"만 남고 결정·기록은 `node <lib> …` 호출. exit code로 HALT |
| 상태 파일 gitignore | `.gitignore:38` (`.claude/state/loop-counter.json`), `:42` (`orchestration-runaway.json`) | 세션 로컬 counter/state는 gitignored. 영속 증거는 receipt |
| 테스트 | `plugins/mccp/scripts/lib/tests/plan-review-cli-decide-dd3.test.js:1-25` | `node:test` + `node:assert/strict`, tmpdir fixture, **CLI 레벨 단언**(순수 oracle만 test하면 배선 결함을 놓친다는 이 repo의 실측 교훈) |
| decision slug 파생 | `plugins/mccp/scripts/receipt/decision.js:25` (`BRANCH_BASED_COMMANDS`) | plan 경로가 없는 command는 브랜치명 slug. Set에 키 1줄 추가로 편입 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/ledger.js` | CREATE | 라운드 원장 상태 파일 I/O + decision slug 해석. 라운드 수의 단일 출처 |
| `plugins/mccp/scripts/lib/santa/counter.js` | CREATE | 순수 캡 oracle (`parseCap` · `decideRound`). 디스크 미접촉 |
| `plugins/mccp/scripts/lib/santa/gate.js` | CREATE | verdict 판정. P0는 현 산문 규칙 그대로, 시그니처만 P1을 위해 동결 |
| `plugins/mccp/scripts/lib/santa/cli.js` | CREATE | `santa-loop.md`가 부르는 유일한 진입점. subcommand dispatch + exit code |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | CREATE | CLI 레벨 — 캡 도달 거부 · 상태 파일 · slug 해석(escalate 포함) |
| `plugins/mccp/scripts/lib/tests/santa-gate.test.js` | CREATE | 동작 보존 — 리뷰어 verdict 조합 표가 산문과 동일 결과 |
| `plugins/mccp/commands/santa-loop.md` | UPDATE | Step 0·5의 결정 로직을 CLI 호출로 교체. rubric·출력 포맷은 잔류(UI5) |
| `plugins/mccp/scripts/receipt/decision.js` | UPDATE | `SLUG_RE`·`BRANCH_PREFIX_RE` **export만** 추가 (santa가 같은 상수를 재사용). `BRANCH_BASED_COMMANDS`는 **무변경** — DD3 |
| `.gitignore` | UPDATE | `.claude/state/santa-loop/` 무시 (UI9) |
| `docs/ENVIRONMENT.md` | UPDATE | §11에 `MCCP_SANTA_ROUND_CAP` 등재 (토글 canonical 위치) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 1.23.7 → 1.23.8 (단일 milestone = patch, §3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | `## [1.23.8]` 항목 + 상단 `currently` 노트 동기 |
| `.claude/prds/santa-loop-materialize.prd.md` | UPDATE | M1 행 status pending → in-progress, Plan 셀에 본 plan 경로 |

## Design Decisions

<!-- 저자 정당화. 리뷰어의 intent 채널에는 들어가지 않는다. -->

**DD1 — 라운드 카운터는 원장의 파생값이지 두 번째 상태가 아니다.** counter와 ledger를 각각 라운드 수를 들고 있게 하면 즉시 drift한다. PRD의 1순위 지표가 "라운드 수가 상태 파일에 기록"이므로 그 숫자는 정확히 하나여야 한다. → `ledger.js`가 유일한 디스크 소유자, 라운드 수 = `rounds[].length`. `counter.js`는 그 수를 인자로 받는 순수 oracle.

**DD2 — 상태 파일은 `.claude/state/santa-loop/<decision-slug>.json`, gitignored, mode `0o600`.** PRD Open Question 1의 권고안 그대로. 라운드마다의 diff 노이즈 없이 계측 분모는 살고, 영속화는 M2의 `mccp-santa-review` receipt가 집계값으로 담당한다. `loop-counter.json`·`orchestration-runaway.json` 두 선례와 동일 축이고, owner-only mode는 `quarantine.lock`(CLAUDE.md §3.6) 선례를 따른다.

```jsonc
// state file schema — P0 동결
{ "schema_version": 1,
  "decision_id": "santa-loop-materialize-m1",
  "cap": 3,
  "rounds": [                        // 라운드 수 = rounds.length (DD1)
    { "index": 0,                    // 0-based
      "started_at": "2026-08-13T...Z",
      "reviewers": [                 // 각 원소 = { envelope, raw }
        { "envelope": { /* DD9 */ },
          "raw": { /* 리뷰어 원본 JSON을 파싱한 객체 전체 — checks·suggestions 포함.
                      원본 바이트가 아니라 재직렬화 값이다: 상태 파일 자체가 JSON이라
                      바이트 보존은 이중 인코딩이 되고, P1이 필요한 것은 구조다 */ } } ],
      "verdict": "NICE" | "NAUGHTY" | null } ],
  "entries": [] }                    // P1 소유 — P0는 빈 배열로 만들고 손대지 않는다
```

**`raw`를 함께 보관하는 이유**: envelope는 gate 판정에 필요한 최소 투영이라 `checks`·`suggestions`를 버린다. 그런데 P1의 severity 축은 바로 그 `checks`에서 나온다 — envelope만 저장하면 P0가 P1의 입력을 파기하는 셈이다. 원본을 곁에 두면 P0는 좁은 계약을 유지하면서도 P1이 필요한 순간 손실 없이 꺼내 쓸 수 있다. `gate.js`는 `raw`를 보지 않는다(UI11 — 판정 내용은 P1 소유).

**`read()`의 실패 의미는 fail-closed다.** 파일 부재는 최초 실행이므로 `{schema_version:1, rounds:[], entries:[]}`를 반환한다. 그러나 **파싱 실패·schema_version 불일치는 throw**한다 — 여기서 `rounds:[]`로 폴백하면 손상된 파일 하나가 캡을 0으로 리셋해 라운드가 무제한이 된다. 캡이 틀릴 수 있는 유일하게 허용 안 되는 방향이다.

**DD3 — slug 파생은 `santa/ledger.js`가 자체 소유한다. `decision.js`는 건드리지 않는다** (PRD Open Question 3).

초안은 `BRANCH_BASED_COMMANDS`에 키 1줄만 추가하려 했다. 그러면 브랜치 slug와 함께 **`/mccp:pr` 전용 의미론 두 개가 딸려 온다** — K2 receipt-prefix augmentation과, 그보다 위험한 [decision.js:244-251](../../plugins/mccp/scripts/receipt/decision.js)의 implement-receipt fallback:

> `if (!receiptExistsForSlug(branchSlug)) { … return lastImplementReceiptSlug(cwd); }`

santa-loop은 receipt를 요구하지도 발행하지도 않으므로(UI4·M1) `receiptExistsForSlug`는 **항상 false**다. 즉 브랜치에 해당 receipt가 없으면 santa의 원장이 **다른 decision의 slug** 아래로 들어간다 — 그 fallback은 "`/mccp:pr`이 plan/implement가 쓴 receipt를 찾게 한다"는 목적으로 만들어졌고, 여기서는 목적 자체가 존재하지 않는다.

그래서 `santa/ledger.js#deriveSantaDecisionId(args, {cwd})`가 자기 규칙을 갖는다 (~10줄):

1. 명시 `--decision <slug>` — **`SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/` 통과 필수**
2. `git branch --show-current` → prefix 제거 + `[._]` → `-` 정규화 → 같은 `SLUG_RE` 검사 (`decision.js#slugFromBranch`와 동일 규칙, 복사가 아니라 같은 정규식 상수를 export해 재사용)
3. 둘 다 실패 → `'default'`

부수 효과로 공유 파일 편집이 0이 되어 병렬 worktree 6개와의 충돌면도 사라진다.

**`--decision`은 신뢰 입력이 아니다.** 값이 경로 조립에 직접 들어가므로(`path.join(root, '.claude/state/santa-loop', slug + '.json')`) 검증 없이는 `--decision ../../evil`이 디렉토리를 탈출한다. `SLUG_RE`는 `.`과 `/`를 아예 배제하므로 이것이 1차 방어이고, 조립된 경로에 `path-containment.js#assertContained`를 한 번 더 건다(defence in depth). 검증 실패는 **exit 2, 파일 접촉 0**. 이 검사는 `resolve-decision`만이 아니라 `--decision`을 받는 **전 subcommand**에 적용된다.

**반환되는 `decisionId`는 언제나 현 스코프에서 파생된 값이다.** `escalate_pending_decision_id`는 **비교 대상일 뿐 대체값이 아니다** — 현 `santa-loop.md` Step 0(L36-43)이 불일치 시 경고만 찍고 *현 스코프로 진행*하므로, 승계 slug를 반환하면 원장이 엉뚱한 파일에 쌓이고 UI10(동작 보존)이 깨진다. 3분기는 `escalation` 필드로만 표현된다:

| STATE.md 상태 | `decisionId` | `escalation` | `warning` |
|---|---|---|---|
| `escalate_pending ≠ true` | 파생 slug | `none` | `null` |
| `= true` ∧ 승계 id == 파생 slug | 파생 slug | `aligned` | `null` |
| `= true` ∧ 불일치 | **파생 slug** | `drift` | `"fingerprint drift — STATE points at <X>, but reviewing <Y>"` |

이것이 Open Question 4("Step 0을 모듈로 흡수할지")의 답이다 — 판정은 모듈로, 출력만 산문에.

**캡의 단위는 decision slug이고, 브랜치명이 바뀌면 캡은 새로 시작한다.** 상태 파일 경로가 slug에서 나오므로 rename은 새 원장을 만든다. rebase·commit·force-push는 브랜치 *이름*을 안 바꾸므로 영향 없고, 실제 트리거는 사용자가 의도적으로 rename/switch 하는 경우뿐이다. 그 경우 "다른 브랜치는 다른 리뷰 스코프"라는 해석이 오히려 맞다 — 그래서 default는 이대로 둔다. 다만 캡을 스코프에 **고정**해야 하는 운용(장기 브랜치 rename, worktree 이동)을 위해 `--decision <slug>` override를 CLI에 둔다. 이것은 계측 정확도를 사용자가 스스로 지킬 수 있는 손잡이이고, 없으면 조용한 캡 리셋을 막을 방법이 아예 없다.

**경로는 cwd가 아니라 git repo root에 앵커한다** — 하위 디렉토리에서 호출해도 같은 원장을 본다. cwd 기준이면 같은 스코프가 두 파일로 갈려 캡이 반으로 쪼개진다(`orchestration-runaway.js`의 `process.cwd()` fallback을 그대로 베끼면 생기는 결함).

**DD4 — 캡 게이트는 Step 5가 아니라 Step 3 진입점에 놓인다.** 초안은 `begin-round`를 Step 5(NAUGHTY fix cycle)에 뒀는데, 그러면 라운드 4의 리뷰어가 이미 발화하고 verdict까지 난 **뒤에** 거부가 온다 — "라운드 4가 애초에 시작되지 않는다"는 사전 거부 약속과 정면으로 모순이고, 캡의 실제 절약 대상(리뷰어 토큰)은 이미 소진된 뒤다. **라운드가 열리는 시점은 리뷰어를 띄우는 순간**이므로 `begin-round`는 Step 3 첫 줄에서 호출되고, 비영점 exit면 리뷰어를 **띄우지 않고** ESCALATION으로 간다. Step 5는 fix + commit 후 Step 3으로 되돌아가기만 하며 캡 판정을 스스로 하지 않는다.

**DD5 — 캡 강제의 정직한 천장.** 코드는 호출됐을 때 정지시킨다. `begin-round`를 *호출하는 것* 자체는 여전히 산문 지시다 — `/mccp:work` Step 3의 verify-decide HALT와 동일한 강제 등급이며, 그 이상을 주장하지 않는다. 완전 기계화(Stop hook 감시 등)는 MVP 밖이고 P1의 종료 조건 작업과 함께 재평가할 축이다. DD4의 배치는 이 천장 **안에서** 가능한 최선이다: 호출이 일어나는 한 리뷰어는 캡 너머로 발화하지 못한다.

**DD9 — 리뷰어 verdict의 데이터 경로를 P0가 확정한다.** Step 3(리뷰어) → Step 4(verdict) 사이에 저장소가 없으면 `gate.decideVerdict`가 무엇을 받는지 아무도 모른다. P0는 **reviewer envelope**를 소유하고 P1은 **finding row**를 소유한다 — 경계가 이것이다.

```jsonc
// 입력 — 리뷰어가 실제로 내는 JSON. santa-loop.md Step 3 (L76-85) 그대로, 무변경.
{ "verdict": "PASS" | "FAIL",
  "checks": [ { "criterion": "...", "result": "PASS|FAIL", "detail": "..." } ],
  "critical_issues": ["..."],
  "suggestions": ["..."] }

// 출력 — reviewer envelope. P0 동결. cli.js record가 합성한다.
{ "id": "A" | "B",           // --id 로 caller가 준다. 리뷰어 JSON에는 없다
  "model": "opus",            // --model 로 caller가 준다. 계측용
  "verdict": "PASS" | "FAIL", // 리뷰어 JSON 그대로
  "criticalIssues": ["..."] } // 리뷰어 JSON의 critical_issues (부재 시 [])
```

**변환의 주체는 `cli.js record`다.** 초안은 envelope를 "Step 3 출력의 부분집합"이라 적었는데 사실이 아니다 — `id`·`model`은 리뷰어 JSON에 없고 `critical_issues`는 이름이 다르다. 리뷰어 프롬프트를 바꾸지 않기 위해(UI10) 변환은 CLI가 흡수한다:

```
cli.js record --round <N> --id A|B --model <str> --reviewer-file <path>
```

**입력 검증은 fail-closed다.** `verdict ∉ {PASS,FAIL}` · `critical_issues`가 배열도 부재도 아님 · `id ∉ {A,B}` · `model` 빈 문자열 · JSON 파싱 실패 → **exit 2 + append 0건**. 부분 기록으로 원장을 오염시키지 않는다. `--reviewer-file`은 `path-containment.js#assertContained`로 repo root 하위임을 강제한다(임의 경로 읽기 차단).

`record`의 성공 출력은 `{ recorded: true, round, id, reviewersInRound }` — 호출자(산문)가 두 리뷰어가 다 들어갔는지 스스로 확인할 수 있어야 한다. 원본 리뷰어 JSON은 `raw`로 함께 저장된다(DD2).

- `cli.js verdict --round <N>` — 라운드 N의 envelope 전부를 읽어 `gate.decideVerdict({ reviewers, round, cap })` 호출. `reviewers`는 **envelope 배열**이며 `raw`는 전달하지 않는다.
- `gate.js`는 디스크를 모른다(순수). 읽기는 `ledger`, 변환·검증은 `cli`, 판정만 `gate`.

**DD10 — 필드 이름은 JS·CLI JSON 양쪽 모두 camelCase다.** `exitReason`·`roundIndex`·`decisionId`·`criticalIssues`. `orchestration-runaway.js`의 CLI 출력(`reservationId`·`maxAgents`)과 같은 규약이며, snake_case는 receipt 스키마 계층에만 쓴다. 초안이 `exit_reason`과 `exitReason`을 섞어 쓴 것은 결함이었고 전부 camelCase로 통일한다.

**DD6 — `gate.js`는 P1이 채울 자리다.** P0가 확정하는 것은 시그니처뿐이며 본문은 현 산문 표를 1:1로 옮긴 것이다. severity 축·patch-chasing terminator를 여기에 미리 넣지 않는다(UI1·UI11). 시그니처 변경은 P0 재개 사안(UI12).

**DD7 — 원장 mutation은 기존 `evidence-lock`으로 감싼다. 새 lock을 만들지 않는다.** 초안은 "단일 세션 순차 writer"를 근거로 lock을 생략했는데, `/mccp:work`의 병렬 route(dispatch-controller, v1.2.0-m1+)가 santa-loop을 동시 호출할 수 있으므로 그 전제가 성립하지 않는다. 그리고 여기서 last-writer-wins가 나면 라운드가 **적게** 세어져 캡이 fail-open된다 — DD2의 corrupt-read와 같은, 허용 안 되는 방향이다.

`plugins/mccp/scripts/receipt/evidence-lock.js`의 `guardedReadModifyWrite(target, mutate, opts)`를 그대로 쓴다(§3.6 evidence write lock — 5s lease · O_EXCL · dead-PID/cross-host 즉시 reclaim · atomic tmp+rename). 신규 lock 코드 0줄. 실패 정책은 **fail-closed** — 라운드를 열지 못하는 것은 안전한 방향이고, 그 모듈이 이미 그 정책을 갖고 있다.

**단 mode는 evidence-lock이 보장하지 않는다.** `writeFileAtomic`은 `fs.writeFileSync(tmp, content, 'utf8')`로 mode 인자 없이 쓰므로 결과 파일은 umask 기본값(보통 `0o644`)이다 — DD2의 `0o600`을 evidence-lock에 기대면 그 주장이 거짓이 된다. `ledger.js`가 guarded write 직후 **자기 책임으로 `fs.chmodSync(statePath, 0o600)`**을 호출한다. Windows에서 POSIX mode는 사실상 무력하므로 이것은 multi-user POSIX 호스트를 위한 조치이고, 그 한계를 여기 적어 둔다(주 개발 환경은 Windows 단일 사용자).

`beginRound` · `recordReviewer` · 라운드 verdict 기록 3개 mutation이 전부 이 안에서 돈다. `read()`·`aggregate()`는 lock 없는 순수 read.

**DD8 — `review_source='multi-agent'`는 M2에서 봉인된다.** M1은 receipt를 발행하지 않으므로 UI6이 코드에 닿는 지점이 없다. 다만 `gate.js`가 `'converged'` 같은 receipt 어휘를 반환하지 않고 `NICE`/`NAUGHTY`만 반환하게 해 M2 이전에 어휘가 새는 것을 막는다.

## Tasks

### Task 1: 순수 캡 oracle
- **Action**: `santa/counter.js` — `parseCap(env)` (`MCCP_SANTA_ROUND_CAP`, default 3, 허용 1..10, 불량값은 stderr warn 후 default) + `decideRound({ roundsSoFar, cap })` → `{ allowed, roundIndex, exitReason }` (`exitReason ∈ {null,'cap_reached'}`). 디스크 미접촉.
- **Mirror**: `orchestration-runaway.js:145` `parseMaxAgents` · `:231` `clampForRunaway`
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` — cap=3에서 rounds 0/1/2는 allowed, 3은 `cap_reached`

### Task 2: 원장 디스크 계층
- **Action**: `santa/ledger.js` — `resolveStatePath(opts)` = `opts.statePath` → `path.join(opts.stateDir, slug + '.json')` → `path.join(gitRepoRoot(opts.cwd), '.claude/state/santa-loop', slug + '.json')`. **세 번째 단은 `process.cwd()`가 아니라 `gitRepoRoot()`** (DD3) — `receipt/hash.js#gitRepoRoot` 재사용. `deriveSantaDecisionId(args, {cwd})` (DD3 3단 규칙 + `SLUG_RE`) · `resolveDecisionId({cwd, args, stateDir, decisionOverride})` → DD3 표대로 (`decisionOverride`는 `SLUG_RE` 통과 시에만 `decisionId`가 되고 실패는 throw; `escalation`은 그대로 계산) `{decisionId, escalation, warning}` · `read()` (DD2 — 부재는 빈 상태, 파싱 실패·version 불일치는 **throw**) · `beginRound()` · `recordReviewer(round, envelope)` · `recordVerdict(round, verdict)` · `readReviewers(round)` · `appendEntry()` · `aggregate()` → `{rounds, entries, exitReason}`. mutation 3종은 전부 `evidence-lock#guardedReadModifyWrite`로 감싼다(DD7). 파일 mode `0o600`. **finding row 스키마는 P1 소유** — P0는 reviewer envelope와 append/aggregate 인터페이스만 확정한다.
- **Mirror**: `orchestration-runaway.js:251` `getRunawayPath` · `decision.js:199` `deriveDecisionId` · `plugins/mccp/scripts/receipt/evidence-lock.js:561` `guardedReadModifyWrite`
- **Validate**: 같은 test — tmpdir 상태 파일이 라운드마다 커지고 재읽기가 멱등 · DD3 3분기 각각에서 `decisionId`가 **항상 파생 slug**이고 drift에서만 `warning` non-null · **손상 JSON은 throw이고 `rounds:[]`로 폴백하지 않는다**

### Task 3: verdict 게이트 동결
- **Action**: `santa/gate.js` — `decideVerdict({ reviewers, round, cap })` → `{ verdict: 'NICE'|'NAUGHTY', failing: [...], exitReason }`. **`reviewers`는 DD9 envelope 배열** (`[{id, model, verdict, criticalIssues}]`); `failing`은 `verdict==='FAIL'`인 envelope의 `id` 배열. 규칙은 현 산문 그대로. 순수 함수 — 디스크·env 미접촉. 파일 상단에 **frozen interface** 주석 + P1 소유 표시.
- **Mirror**: `plan-review/decide.js` (순수 판정, 인자만으로 결정)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-gate.test.js` — PASS/PASS→NICE, PASS/FAIL→NAUGHTY, FAIL/PASS→NAUGHTY, FAIL/FAIL→NAUGHTY + `failing`이 FAIL한 id만 담음 + envelope 0건이면 NAUGHTY(fail-closed)

### Task 4: CLI facade
- **Action**: `santa/cli.js` — subcommand 5종. JSON stdout, exit 0 정상 / 12 캡 거부 / 2 usage. `require.main` 블록만 얇게. **전 subcommand 공통 `--decision <slug>`** — 있으면 파생 대신 그 slug를 쓴다(DD3 캡 고정 손잡이).
  - `resolve-decision` → `{decisionId, escalation, warning}` (DD3)
  - `begin-round` → `{allowed, roundIndex, exitReason}`; 캡 도달 시 exit 12
  - `record --round <N> --id A|B --model <str> --reviewer-file <p>` → 리뷰어 JSON을 읽어 envelope로 **변환·검증** 후 append (DD9). 검증 실패는 exit 2 + append 0건
  - `verdict --round <N>` → `ledger.readReviewers(N)` → `gate.decideVerdict` → `{verdict, failing, exitReason}`
  - `status` → `ledger.aggregate()`

  **exit code는 예외까지 전부 매핑한다** — `cli.js`가 최상위에서 `try/catch`하며, 어떤 예외도 stack trace로 새어나가 exit 1이 되지 않는다:

  | 조건 | exit | stdout |
  |---|---|---|
  | 정상 | 0 | 결과 JSON |
  | 캡 도달 (`begin-round`) | 12 | `{allowed:false, exitReason:"cap_reached"}` |
  | usage 오류(미지 subcommand·필수 플래그 누락) | 2 | — |
  | `--decision` `SLUG_RE` 불통과 / `assertContained` 실패 | 2 | — (파일 접촉 0) |
  | envelope 검증 실패 (`record`) | 2 | — (append 0건) |
  | `ledger.read()` throw — 손상 JSON·`schema_version` 불일치 | **2** | — |

  `read()` 실패를 exit 2로 두는 것은 의도적이다. exit 0(무시)이면 캡이 리셋되고, exit 12(캡 도달)면 호출자가 "정상 종료"로 오독한다. 손상은 **입력 오류와 같은 등급**으로 다뤄 호출자가 멈추게 한다. 어떤 실패 경로도 상태 파일을 쓰지 않는다.
- **Mirror**: `plan-review/cli.js`, `orchestration-runaway.js:809` `runCli`, `path-containment.js:69` `assertContained`
- **Validate**: 같은 cap test — `begin-round` 4회째 exit 12 + stdout `exitReason:"cap_reached"` · `record` ×2(실제 Step 3 형태의 fixture) 후 `verdict`가 두 envelope를 정확히 round-trip · 불량 verdict / 비배열 `critical_issues` / repo 밖 `--reviewer-file` 각각 exit 2 + 상태 파일 무변경 · **`--decision ../../evil`을 5개 subcommand 전부에 넣어 각각 exit 2 + 파일 접촉 0** (표 순회 test 1개) · 손상 JSON에서 exit 2 (exit 0도 12도 아님)

### Task 5: `santa-loop.md`를 thin caller로 축약
- **Action**:
  - Step 0의 3분기 판정 → `cli.js resolve-decision` 1회 호출. 산문에는 **`warning`이 non-null이면 그대로 stderr 출력**만 잔류(판정 없음).
  - **Step 3 첫 줄에 `cli.js begin-round`**(DD4). 비영점 exit이면 리뷰어를 **띄우지 않고** ESCALATION 블록 출력 후 종료.
  - Step 3 각 리뷰어 응답 → 원본 JSON을 tmp에 쓰고 `cli.js record --round $ROUND --id A --model "$MODEL_A" --reviewer-file <tmp>` (리뷰어당 1회, B도 동일). **리뷰어 프롬프트·출력 계약은 무변경** — `id`/`model`은 caller가 알고 있는 값이고 변환은 CLI가 한다(DD9).
  - Step 4 verdict 문장 → `cli.js verdict --round $ROUND`.
  - Step 5의 `Maximum 3 iterations` 산문 제거 — fix + commit 후 Step 3으로 복귀만 하고 캡 판정은 하지 않는다.
  - **Step 2 rubric 표 · Output 섹션 · Notes는 무변경**(UI5). 축약 후 결정 로직 잔존 0.
- **Mirror**: `plugins/mccp/commands/work.md:760-791` (판정은 node 호출, 산문은 해석과 HALT만)
- **Validate**: `grep -n "Maximum 3 iterations\|ESCALATE ==" plugins/mccp/commands/santa-loop.md` → 산문 캡/분기 잔존 0. 그리고 **순서는 눈으로 보지 않고 test가 본다** — `santa-loop-cap.test.js`가 `santa-loop.md`를 `### ` 헤딩 단위로 잘라 **`### Step 3` slice를 먼저 확정한 뒤**, 그 slice 안에서만 `begin-round` 위치 < `#### Reviewer A` 위치임을 단언한다. slice 밖(예: Step 2)으로 옮겨도 red — 단순 전역 문자열 위치 비교였다면 통과했을 회피 경로다. 리팩터가 순서를 뒤집어도 red. (`instruction-contract/lint.js`가 CLAUDE.md를 파싱하는 것과 같은 축 — 산문도 기계 검증 대상이다.)

### Task 6: 배선 + 릴리스 표면
- **Action**: `decision.js`에서 `SLUG_RE`·`BRANCH_PREFIX_RE`를 export (동작 변경 0 — `BRANCH_BASED_COMMANDS`는 손대지 않는다, DD3) · `.gitignore`에 `.claude/state/santa-loop/` · `docs/ENVIRONMENT.md` §11에 `MCCP_SANTA_ROUND_CAP` · `plugin.json` 1.23.8 · `html.js`/`markdown.js` footer · `CHANGELOG.md` 항목 + `currently` 노트 · PRD M1 행 in-progress.
- **Mirror**: `.gitignore:38,42`, CLAUDE.md §3.7 체크리스트
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/` (decision.js 회귀 0) + version 5면 동기 확인

## Validation

```bash
# 신규 test
node --test plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js \
            plugins/mccp/scripts/lib/tests/santa-gate.test.js

# 기존 회귀 — decision.js 편입이 receipt 계층을 깨지 않는지
node --test plugins/mccp/scripts/receipt/tests/

# 산문 캡 잔존 0
grep -n "Maximum 3 iterations" plugins/mccp/commands/santa-loop.md || echo "OK: prose cap removed"

# 상시 지시문 계약 (CLAUDE.md 무변경이어도 회귀 확인)
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# §3.5.1 — 이 브랜치가 base 대비 삭제하는 파일 전수 확인
git diff --diff-filter=D --name-only origin/main...HEAD
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **6개 sibling worktree가 전부 1.23.8을 선점하려 한다** (`git worktree list` 실측 7개, 전부 `1c5220a`) | **High** | §3.7 forward-only. base merge 후 `CHANGELOG.md`에 `## [1.23.8]` 중복이 생기면 미머지 쪽을 1칸 상향하고 5면(plugin.json · html.js · markdown.js · CHANGELOG 항목·노트 · PR title) 전부 동기 |
| `santa-loop.md` 축약 중 rubric·Output 산문이 함께 지워짐 | Medium | UI5를 acceptance 항목으로 명시. Step 2 표와 Output 섹션은 diff에서 **무변경**이어야 함 |
| `decision.js` 편입이 `/mccp:pr` 전용 fallback을 santa에 물려줘 원장이 남의 slug로 들어간다 | ~~Medium~~ **제거됨** | DD3 — 편입 자체를 포기하고 santa가 자기 3단 규칙을 갖는다. `decision.js` 동작 변경 0(상수 export만) |
| `--decision` 값이 경로 조립에 들어가 디렉토리 탈출 | Medium | DD3 — `SLUG_RE`(`.`·`/` 배제)가 1차, `assertContained`가 2차. 전 subcommand 적용, 실패는 exit 2 + 파일 접촉 0 |
| P1·P2가 `gate.js` 시그니처를 서로 다르게 가정 | Medium | frozen interface 주석 + M2 산출 소유권 표. 변경은 P0 재개(UI12) |
| `/mccp:work` 병렬 route가 santa-loop을 동시 호출해 라운드가 적게 세어진다(캡 fail-open) | Medium | DD7 — 신규 lock 대신 `evidence-lock#guardedReadModifyWrite`(5s lease · fail-closed)로 mutation 3종을 감싼다. 라운드를 못 여는 쪽이 안전한 방향 |
| 리뷰어 프롬프트를 건드려 출력 계약이 바뀐다 | Low | DD9 — 변환을 `cli.js record`가 흡수하므로 Step 3 리뷰어 JSON은 무변경. acceptance가 실제 Step 3 형태 fixture로 검증 |
| 브랜치 rename/switch가 slug를 바꿔 캡이 조용히 리셋된다 | Low | DD3 — 설계된 동작(다른 브랜치 = 다른 스코프)이며 rebase에는 불변. 고정이 필요하면 `--decision <slug>`. plan·`docs/ENVIRONMENT.md`에 명시해 "몰라서 당하는" 경우를 없앤다 |
| 캡 강제가 "완전 기계화"로 과대 보고됨 | Medium | DD5를 보고서와 PRD 갱신에 그대로 실어 강제 등급을 명시(호출 시 정지 = `/mccp:work` HALT와 동급) |

## Acceptance

- [ ] `plugins/mccp/scripts/lib/santa/{ledger,counter,gate,cli}.js` 4개 존재. 외부 의존은 **정확히 3개**만 — `receipt/evidence-lock.js`(DD7) · `receipt/hash.js#gitRepoRoot`(DD3) · `receipt/decision.js`의 `SLUG_RE`/`BRANCH_PREFIX_RE` 상수(DD3). 그 외 mccp 모듈 require 0, npm 의존 0
- [ ] cap=3에서 4번째 `begin-round`가 exit 12로 거부되고 상태 파일 라운드 수가 3에서 멈춤
- [ ] **캡 거부가 리뷰어 발화 이전이다** (DD4) — **test**가 `### Step 3` slice를 먼저 확정하고 그 안에서 `begin-round` < `#### Reviewer A`를 단언. `begin-round`를 Step 2로 옮기면 red
- [ ] **리뷰어 원본이 소실되지 않음** — `record` 후 상태 파일의 `rounds[N].reviewers[i].raw`에 `checks`·`suggestions`가 그대로 남아 P1이 severity 축을 세울 입력이 보존됨 (DD2)
- [ ] **경로가 git repo root 앵커** — 하위 디렉토리에서 호출해도 같은 원장 파일을 읽고, `--decision <slug>`로 캡을 고정할 수 있음 (DD3)
- [ ] **`--decision`이 디렉토리를 탈출하지 못함** — `--decision ../../evil` 등 `SLUG_RE` 불통과 값이 전 subcommand에서 exit 2 + 파일 접촉 0 (DD3)
- [ ] **`decision.js`의 `BRANCH_BASED_COMMANDS`가 무변경** — santa 원장이 `lastImplementReceiptSlug` fallback으로 남의 decision slug 아래 들어가지 않음. `git diff plugins/mccp/scripts/receipt/decision.js`가 상수 export 2줄만 (DD3)
- [ ] **reviewer envelope round-trip** — 실제 Step 3 형태 fixture(`{verdict, checks, critical_issues, suggestions}`)를 `record --id --model`로 넣으면 envelope로 변환돼 저장되고, `verdict`가 둘을 받아 판정하며 `failing`이 FAIL한 `id`만 담음 (DD9)
- [ ] **불량 입력이 원장을 오염시키지 않음** — 불량 verdict · 비배열 `critical_issues` · repo 밖 `--reviewer-file` 각각 exit 2이고 상태 파일 byte 무변경
- [ ] **손상 상태 파일이 캡을 리셋하지 않음** — 깨진 JSON에서 `read()`가 throw하고 `begin-round`가 라운드 0으로 재출발하지 않음 (DD2)
- [ ] 원장 mutation 3종이 `evidence-lock#guardedReadModifyWrite` 안에서 실행되고 파일 mode가 `0o600` (DD7·DD2)
- [ ] escalate_pending 3분기 전부에서 `decisionId`가 파생 slug이며, drift에서만 `warning`이 non-null이고 `santa-loop.md`가 그 문자열을 stderr로 출력 (DD3)
- [ ] CLI JSON stdout 필드가 전부 camelCase (`exitReason`·`roundIndex`·`decisionId`) — snake_case 혼용 0 (DD10)
- [ ] `santa-loop.md`에 결정 로직 잔존 0 (`Maximum 3 iterations` 산문 캡 · Step 0 3분기 판정 제거), rubric 표와 Output 섹션은 diff 무변경
- [ ] verdict 4조합이 산문 규칙과 동일 (동작 보존, UI10) + envelope 0건은 NAUGHTY(fail-closed)
- [ ] `.claude/state/santa-loop/`가 gitignored이고 `git status`에 나타나지 않음 (UI9)
- [ ] `node --test plugins/mccp/scripts/receipt/tests/` 회귀 0
- [ ] `MCCP_SANTA_ROUND_CAP`이 `docs/ENVIRONMENT.md` §11에 등재
- [ ] version 3면(plugin.json · html.js · markdown.js) + CHANGELOG 동기
- [ ] M2 미착수 항목이 코드에 선반영되지 않음 — `mccp-santa-review` GATE_ID · receipt write 경로 부재 (UI11). **그 결과 PRD 1순위 지표의 "receipt 봉인" 절반은 M1에서 미달**이며, 이 미달이 M1 보고서와 PRD M1 행에 명시됨
- [ ] `git diff --diff-filter=D --name-only origin/main...HEAD`에 의도치 않은 삭제 0 (§3.5.1)

## Design Critique

detector: `design_signal=true` — signal files `plugins/mccp/scripts/lib/renderer/html.js` · `plugins/mccp/scripts/lib/renderer/markdown.js` (Task 6 footer version 동기). 둘 다 **rendered surface 신규 도입이 아니라 버전 리터럴 1개씩 교체**다.

critique retry loop: round 0/2 → **CONVERGED**. 4개 Output Constraints 전수 대조 결과 위반 0 —

- 정보 위계 3단계: plan heading depth ≤ 3 (`#`/`##`/`###`)
- 강조색 화면당 1개: 신규 accent token 0
- raw markdown marker 금지: 렌더 표면 신규 markdown leak 0
- 한 화면 항목 수 상한: 신규 `list-of-N` 렌더 섹션 0 (아래 routing guide는 collapse 처리)

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 **어떤 impeccable 명령도 호출하지 않는다** — 아래는 구현자용 체크리스트다. 본 M1은 rendered surface를 신규 도입하지 않으므로 실제 라우팅은 대부분 강등될 것으로 예상한다.

<details><summary>stage → command (20 rows)</summary>

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

</details>

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
