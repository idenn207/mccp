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

**`--decision`은 신뢰 입력이 아니다.** 값이 경로 조립에 직접 들어가므로(`path.join(root, '.claude/state/santa-loop', slug + '.json')`) 검증 없이는 `--decision ../../evil`이 디렉토리를 탈출한다. `SLUG_RE`는 `.`과 `/`를 아예 배제하므로 이것이 1차 방어이고, `path-containment.js#assertContained`를 한 번 더 건다(defence in depth). 검증 실패는 **exit 2, 파일 접촉 0**. 이 검사는 `resolve-decision`만이 아니라 `--decision`을 받는 **전 subcommand**에 적용된다.

**2차 방어의 대상은 상태 *파일*이 아니라 상태 *디렉토리*다.** `assertContained(targetPath, expectedParentDir, repoRoot)`는 3-arg이고 첫 인자에 **`fs.realpathSync`를 건다**([path-containment.js:30-36](../../plugins/mccp/scripts/lib/path-containment.js)) — 즉 **대상이 실재하지 않으면 `PATH_ESCAPES_GATE`로 throw**한다. 최초 실행에는 상태 파일이 아직 없으므로 파일 경로를 그대로 넘기면 정상 경로가 traversal로 오판돼 캡이 아예 못 돌아간다. 그래서 호출은:

**그리고 3번째 인자는 반드시 `null`이다.** `assertContained(target, expectedParentDir, repoRoot)`의 3번째 인자는 generic repo-root 검사가 **아니라** `expectedParentDir`가 `<repoRoot>/.claude/receipts` 아래인지 강제하는 **receipt 전용** 검사다([path-containment.js:50-65](../../plugins/mccp/scripts/lib/path-containment.js)) — 헤더 L16-18이 "Callers outside the receipts tree MUST omit `repoRoot`"라고 명시한다. santa 원장은 `.claude/state` 아래라 receipts 밖이므로, `repoRoot`를 넘기면 `gate dir escapes receipts root`로 **모든 정상 호출이 exit 2**가 된다(캡이 아니라 santa-loop 자체가 죽는다). 선례가 정확히 이 형태다 — [pr-phase-lock.js:466](../../plugins/mccp/scripts/lib/pr-phase-lock.js)도 `.claude/state`에 쓰면서 `null`을 명시적으로 넘긴다.

```js
fs.mkdirSync(stateDir, { recursive: true });          // <repoRoot>/.claude/state/santa-loop
assertContained(stateDir, path.join(repoRoot, '.claude', 'state'), null);
```

디렉토리는 mkdir 직후 실재하므로 realpath가 성립하고, symlink로 `.claude/state/santa-loop`를 repo 밖으로 빼돌린 경우까지 잡힌다(`realpathSync` + `path.sep` 접미 비교). 파일명 자체는 `slug + '.json'`이고 `SLUG_RE`가 `.`·`/`를 배제하므로 디렉토리가 봉인되면 파일도 봉인된다.

`--reviewer-file`은 반대다 — 호출자가 이미 쓴 뒤에 넘기므로 실재하고, 파일에 직접 `assertContained(reviewerFile, repoRoot, null)`를 건다.

> 이 절은 R6 Codex F0(high, confidence 0.99)의 흡수다. 직전 개정이 두 호출 모두에 `repoRoot`를 넘겨, **입력과 무관하게 최초 `begin-round`와 모든 `record`가 exit 2**가 되는 상태였다. 정상 경로 2종 + repo 밖 symlink + `.claude/state` 부재를 실행 test로 덮는다.

**반환되는 `decisionId`는 언제나 현 스코프에서 파생된 값이다.** `escalate_pending_decision_id`는 **비교 대상일 뿐 대체값이 아니다** — 현 `santa-loop.md` Step 0(L36-43)이 불일치 시 경고만 찍고 *현 스코프로 진행*하므로, 승계 slug를 반환하면 원장이 엉뚱한 파일에 쌓이고 UI10(동작 보존)이 깨진다. 3분기는 `escalation` 필드로만 표현된다:

| STATE.md 상태 | `decisionId` | `escalation` | `warning` |
|---|---|---|---|
| `escalate_pending ≠ true` | 파생 slug | `none` | `null` |
| `= true` ∧ 승계 id == 파생 slug | 파생 slug | `aligned` | `null` |
| `= true` ∧ 불일치 | **파생 slug** | `drift` | `"fingerprint drift — STATE points at <X>, but reviewing <Y>"` |

이것이 Open Question 4("Step 0을 모듈로 흡수할지")의 답이다 — 판정은 모듈로, 출력만 산문에.

**캡의 단위는 decision slug이고, 브랜치명이 바뀌면 캡은 새로 시작한다.** 상태 파일 경로가 slug에서 나오므로 rename은 새 원장을 만든다. rebase·commit·force-push는 브랜치 *이름*을 안 바꾸므로 영향 없고, 실제 트리거는 사용자가 의도적으로 rename/switch 하는 경우뿐이다. 그 경우 "다른 브랜치는 다른 리뷰 스코프"라는 해석이 오히려 맞다 — 그래서 default는 이대로 둔다. 다만 캡을 스코프에 **고정**해야 하는 운용(장기 브랜치 rename, worktree 이동)을 위해 `--decision <slug>` override를 CLI에 둔다. 이것은 계측 정확도를 사용자가 스스로 지킬 수 있는 손잡이이고, 없으면 조용한 캡 리셋을 막을 방법이 아예 없다.

**경로는 cwd가 아니라 git repo root에 앵커한다** — 하위 디렉토리에서 호출해도 같은 원장을 본다. cwd 기준이면 같은 스코프가 두 파일로 갈려 캡이 반으로 쪼개진다(`orchestration-runaway.js`의 `process.cwd()` fallback을 그대로 베끼면 생기는 결함).

**DD4 — 캡 게이트는 Step 5가 아니라 Step 3 진입점에 놓인다.** 초안은 `begin-round`를 Step 5(NAUGHTY fix cycle)에 뒀는데, 그러면 라운드 4의 리뷰어가 이미 발화하고 verdict까지 난 **뒤에** 거부가 온다 — "라운드 4가 애초에 시작되지 않는다"는 사전 거부 약속과 정면으로 모순이고, 캡의 실제 절약 대상(리뷰어 토큰)은 이미 소진된 뒤다. **라운드가 열리는 시점은 리뷰어를 띄우는 순간**이므로 `begin-round`는 Step 3 진입점 — Reviewer A/B 어느 발화보다 앞 — 에서 호출되고, 비영점 exit면 리뷰어를 **띄우지 않고** ESCALATION으로 간다. Step 5는 fix + commit 후 Step 3으로 되돌아가기만 하며 캡 판정을 스스로 하지 않는다.

**DD5 — 캡 강제의 정직한 천장.** 코드는 호출됐을 때 정지시킨다. `begin-round`를 *호출하는 것* 자체는 여전히 산문 지시다 — `/mccp:work` Step 3의 verify-decide HALT와 동일한 강제 등급이며, 그 이상을 주장하지 않는다. 완전 기계화(Stop hook 감시 등)는 MVP 밖이고 P1의 종료 조건 작업과 함께 재평가할 축이다.

초안은 여기서 "호출이 일어나는 한 리뷰어는 캡 너머로 발화하지 못한다"고 끝맺었다. **그것도 과대주장이다** — 호출이 일어나도 산문이 exit code를 무시하면 리뷰어는 발화한다. 정확한 천장은 DD11이 남기는 하나뿐이다: **토큰 소모는 막지 못한다.**

**DD11 — 캡의 강제는 지시가 아니라 능력에서 나온다** (R7 Codex F0 흡수).

DD4·DD5는 캡을 "`begin-round`가 비영점 exit을 내고 산문이 그것을 따른다"에 걸었다. 그런데 그 준수는 **관측 불가능**하다 — 산문 검사는 문자열 위치와 존재만 볼 수 있고, `exit`·`ESCALATION` 같은 단어는 무관한 문맥에도 등장하므로 존재 검사는 제어흐름의 증거가 되지 못한다. 리뷰어 기동 자체가 LLM 행위라 셸 스크립트로 추출해 실행 test를 붙일 대상도 없다. 즉 이 축을 지시 기반으로 두는 한, 캡은 **M1이 허용한 유일한 동작 변경인데도 검증 불가**로 남는다.

그래서 강제 지점을 **기록 경계**로 옮긴다. `ledger`는 `beginRound`가 연 라운드만 존재하는 것으로 취급하고, `recordReviewer`·`recordVerdict`는 **열리지 않은 라운드를 거부**한다(CLI에서 exit 2, 상태 파일 무변경).

이것이 바꾸는 것: 산문이 거부를 무시하고 리뷰어 A·B를 띄우더라도, 그 출력은 원장에 **들어갈 수 없고** `verdict`도 나오지 않는다. 라운드는 진행되지 못하고 루프는 캡에서 실제로 멈춘다. 그리고 이 성질은 CLI 호출만으로 전부 재현되므로 **test가 본다**.

남는 손실은 정확히 하나 — 캡 초과 라운드의 리뷰어가 **토큰을 쓰고 버려진다**. 낭비지만 안전 축이 아니고, DD4의 배치가 그 낭비를 정상 경로에서 0으로 만든다. M1은 이 하나를 못 막는다고 적고 넘어간다.

**DD12 — 라운드는 상태 기계다. 개설 여부만으로는 부족하다** (R8 Codex F0 흡수).

DD11의 초안은 `round >= rounds.length`(미개설)만 거부했다. 그것으로는 **열린 뒤**에 벌어지는 일이 전혀 통제되지 않는다:

- `verdict`를 리뷰어 기록 **전에** 부르면 envelope 0건 → 규칙상 NAUGHTY → 근거 없는 fix cycle이 돌고 **캡 라운드를 하나 더 태운다**.
- `record --id A`를 **두 번** 부르면 A envelope 2개가 쌓인다. 둘 다 PASS면 verdict는 NICE다 — **리뷰어 하나로 dual-review가 우회된다.** santa-loop의 존재 이유가 뚫리는 지점이라 이것이 가장 심각하다.
- verdict가 난 라운드에 `record`를 더 하거나 `verdict`를 다시 불러 **결론난 라운드를 덮어쓸** 수 있다.

즉 DD11은 자기가 닫았다고 말한 구멍을 절반만 닫았고, "남는 손실은 토큰뿐"이라는 주장도 그만큼 거짓이었다. 라운드에 명시적 상태를 준다.

**그러나 그 대응은 사용자 제약을 넘었다** (봉인 패스 Codex F0, conf 0.99 — 흡수). 초안 DD12는 규칙 5개를 뒀고 그중 넷이 **판정 lifecycle**이었다: `{A,B}` 완전성 · `id` 중복 · verdict 1회 · `record`는 `OPEN`에서만. 이것들은 캡 강제가 아니라 **verdict가 어떻게 생산되는지의 규칙**이고, UI11("MVP는 골격과 캡으로 좁히고 **판정 내용은 전부 P1에 남긴다**")이 P1에 남기라고 한 바로 그 내용이다. 규칙 3은 더 나아가 기존에 도달 가능하던 판정 결과(envelope 0건 → NAUGHTY)를 **없앤다** — UI10("캡 강제 외에 판정 결과를 바꾸지 않는다") 직접 위반이다.

**그래서 DD12를 캡 축 하나로 되돌린다.**

| 상태 | 진입 | `beginRound` | `record` | `verdict` |
|---|---|---|---|---|
| (미개설) | — | 라운드 0 개설 | **거부** exit 2 (DD11) | **거부** exit 2 (DD11) |
| `OPEN` | `beginRound` | **기존 index 멱등 반환**(append 없음) | 허용 | 허용 |
| `FINAL` | verdict 기록 | 다음 라운드 개설 | 허용 — **P1 소유** | 허용 — **P1 소유** |

**P0가 갖는 규칙은 하나다.**

0. **`beginRound`는 멱등이다.** 마지막 라운드가 `OPEN`이면 새 라운드를 **append하지 않고** 그 index를 그대로 반환한다. 새 라운드는 마지막이 `FINAL`일 때만 열린다. 이것이 없으면 stdout 유실 후 재시도·산문의 중복 호출·동시 호출이 각각 새 OPEN 라운드를 쌓아 **리뷰 없이 캡을 소진**한다. 판정은 lock **안에서** 일어난다(DD7) — 밖에서 검사하면 동시 호출 두 개가 나란히 통과한다.

이것은 순수하게 **캡 축**이다. 라운드가 몇 개 열리는가만 다루고 verdict가 무엇이 되는가는 건드리지 않으므로 UI10·UI11 안에 있다.

**P1으로 이관하는 것 (P0는 자리만 비워 둔다).**

| 규칙 | 왜 P1인가 |
|---|---|
| `verdict`는 `{A,B}` 둘 다 있을 때만 | 완전한 증거의 정의 = 판정 내용 |
| `id` 중복 처리(멱등 vs 거부) | 증거 동일성의 정의 = 판정 내용 |
| verdict 1회 / `FINAL` 불변 | 종료 조건 = P1의 핵심 소유물 |
| `record`는 `OPEN`에서만 | 위 셋의 파생 |

**이 이관에는 실제 대가가 있고 숨기지 않는다.** M1이 내는 API에는 `record --id A`를 두 번 넣어 A envelope 2개를 만들고 둘 다 PASS면 NICE를 받는 경로가 **열린 채 남는다** — dual-review가 우회 가능하다. 다만 (1) 현 santa-loop은 코드가 0이라 이것이 기존 대비 회귀는 아니고, (2) M1은 receipt를 발행하지 않으므로 이 verdict가 어떤 게이트도 통과시키지 않으며(UI4·DD8), (3) UI12에 따라 P1이 이 자리를 채우기 전까지 M1 산출물을 실운용에 쓰지 않는 것이 전제다. **P1의 1순위 항목으로 명시**하고 [backlog](codex-findings-backlog.md)에도 남긴다.

`gate.decideVerdict`의 "envelope 0건 → NAUGHTY"는 **그대로 살아 있는 규칙**이다(도달 불가가 아니다) — 규칙 3을 P1으로 보냈으므로 CLI가 그 경로를 막지 않는다. UI10의 동작 보존이 이로써 유지된다.

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

**사후 chmod의 창(window)을 정확히 적는다** (R6 Codex F1, medium — 실측 확인). `writeFileAtomic`은 tmp를 mode 없이 만들고 rename하므로 **tmp와 최종 파일 둘 다** umask 기본값으로 잠깐 존재한다. 그 사이 다른 OS 사용자가 원장의 `raw`(리뷰어 원본 findings)를 읽을 수 있다. lock은 writer 경합만 막고 reader를 막지 않는다.

이 창을 **두 단계로** 좁힌다. (1) run 내부: write → chmod 사이는 남는다 — 좁히되 없애지 못한다. (2) run 사이: rename 직후 프로세스가 죽어 완화된 mode가 남는 경우를 **영구가 아니라 다음 접근까지**로 만든다 — `ledger.js`가 모든 진입점(`read`·`beginRound`·`recordReviewer`·`recordVerdict`·`aggregate`)에서 `fs.statSync`로 mode를 확인하고 `0o600`이 아니면 **repair 후 진행**한다(POSIX에서만 의미, Windows는 no-op).

**근본 수정은 M1 밖이다.** Codex의 권고(`writeFileAtomic`에 mode 옵션 추가)가 옳은 해법이지만, 그 함수는 receipt write 경로를 공유하는 evidence-critical 모듈이라 P0 골격 milestone이 건드릴 표면이 아니다(UI11 · Acceptance의 "외부 의존 정확히 3개" · DD7의 "신규 lock 코드 0줄"). [codex-findings-backlog.md](codex-findings-backlog.md)에 이연하고, M1은 위 2단계 완화와 **그 잔여 창의 정직한 기술**까지만 주장한다.

`beginRound` · `recordReviewer` · 라운드 verdict 기록 3개 mutation이 전부 이 안에서 돈다. `read()`·`aggregate()`는 lock 없는 순수 read.

**DD8 — `review_source='multi-agent'`는 M2에서 봉인된다.** M1은 receipt를 발행하지 않으므로 UI6이 코드에 닿는 지점이 없다. 다만 `gate.js`가 `'converged'` 같은 receipt 어휘를 반환하지 않고 `NICE`/`NAUGHTY`만 반환하게 해 M2 이전에 어휘가 새는 것을 막는다.

## Tasks

### Task 1: 순수 캡 oracle
- **Action**: `santa/counter.js` — `parseCap(env)` (`MCCP_SANTA_ROUND_CAP`, default 3, 허용 1..10, 불량값은 stderr warn 후 default) + `decideRound({ roundsSoFar, cap })` → `{ allowed, roundIndex, exitReason }` (`exitReason ∈ {null,'cap_reached'}`). 디스크 미접촉.
- **Mirror**: `orchestration-runaway.js:145` `parseMaxAgents` · `:231` `clampForRunaway`
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` — cap=3에서 rounds 0/1/2는 allowed, 3은 `cap_reached`

### Task 2: 원장 디스크 계층
- **Action**: `santa/ledger.js` — `resolveStatePath(opts)` = `opts.statePath` → `path.join(opts.stateDir, slug + '.json')` → `path.join(gitRepoRoot(opts.cwd), '.claude/state/santa-loop', slug + '.json')`. **세 번째 단은 `process.cwd()`가 아니라 `gitRepoRoot()`** (DD3) — `receipt/hash.js#gitRepoRoot` 재사용. `deriveSantaDecisionId(args, {cwd})` (DD3 3단 규칙 + `SLUG_RE`) · `resolveDecisionId({cwd, args, stateDir, decisionOverride})` → DD3 표대로 (`decisionOverride`는 `SLUG_RE` 통과 시에만 `decisionId`가 되고 실패는 throw; `escalation`은 그대로 계산) `{decisionId, escalation, warning}` · `read()` (DD2 — 부재는 빈 상태, 파싱 실패·version 불일치는 **throw**) · `beginRound()` · `recordReviewer(round, envelope)` · `recordVerdict(round, verdict)` · `readReviewers(round)` · `appendEntry()` · `aggregate()` → `{rounds, entries, exitReason}`. **`recordReviewer`·`recordVerdict`는 `beginRound`가 연 라운드만 받는다** — `round >= rounds.length`(미개설)면 throw하고 append 0건(DD11). 이것이 캡을 지시가 아니라 능력으로 강제하는 지점이다. **`beginRound`는 멱등이다**(DD12): lock 안에서 마지막 라운드를 보고 `OPEN`이면 append 없이 그 index를 반환하고, `FINAL`이거나 라운드가 없을 때만 새로 연다. 검사가 lock 밖이면 동시 호출 둘이 나란히 통과해 규칙이 무력해진다. 라운드 상태(`OPEN`/`FINAL`)는 별도 필드가 아니라 `verdict === null`의 파생이다(DD1 — 상태는 하나여야 한다). **판정 lifecycle 규칙(`{A,B}` 완전성 · `id` 중복 · verdict 1회)은 P1 소유** — P0는 `recordReviewer`·`recordVerdict`의 시그니처만 확정하고 그 안에 lifecycle 검사를 넣지 않는다(UI10·UI11). mutation 3종은 전부 `evidence-lock#guardedReadModifyWrite`로 감싼다(DD7). 파일 mode `0o600` — guarded write 직후 chmod, **그리고 전 진입점에서 `statSync` 확인 후 불일치 시 repair**(DD7의 crash-window 완화, POSIX 한정). **finding row 스키마는 P1 소유** — P0는 reviewer envelope와 append/aggregate 인터페이스만 확정한다.
- **Mirror**: `orchestration-runaway.js:251` `getRunawayPath` · `decision.js:199` `deriveDecisionId` · `plugins/mccp/scripts/receipt/evidence-lock.js:561` `guardedReadModifyWrite`
- **Validate**: 같은 test — tmpdir 상태 파일이 라운드마다 커지고 재읽기가 멱등 · DD3 3분기 각각에서 `decisionId`가 **항상 파생 slug**이고 drift에서만 `warning` non-null · **손상 JSON은 throw이고 `rounds:[]`로 폴백하지 않는다**

### Task 3: verdict 게이트 동결
- **Action**: `santa/gate.js` — `decideVerdict({ reviewers, round, cap })` → `{ verdict: 'NICE'|'NAUGHTY', failing: [...], exitReason }`. **`reviewers`는 DD9 envelope 배열** (`[{id, model, verdict, criticalIssues}]`); `failing`은 `verdict==='FAIL'`인 envelope의 `id` 배열. 규칙은 현 산문 그대로. 순수 함수 — 디스크·env 미접촉. 파일 상단에 **frozen interface** 주석 + P1 소유 표시. **envelope 0건 → NAUGHTY는 살아 있는 규칙으로 유지**한다 — 판정 lifecycle을 P1으로 이관했으므로(DD12) CLI가 그 경로를 막지 않는다. 동작 보존(UI10)이 이로써 성립한다.
- **Mirror**: `plan-review/decide.js` (순수 판정, 인자만으로 결정)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-gate.test.js` — PASS/PASS→NICE, PASS/FAIL→NAUGHTY, FAIL/PASS→NAUGHTY, FAIL/FAIL→NAUGHTY + `failing`이 FAIL한 id만 담음 + envelope 0건이면 NAUGHTY(fail-closed)

### Task 4: CLI facade
- **Action**: `santa/cli.js` — subcommand 5종. JSON stdout, exit 0 정상 / 12 캡 거부 / 2 usage. `require.main` 블록만 얇게. **전 subcommand 공통 `--decision <slug>`** — 있으면 파생 대신 그 slug를 쓴다(DD3 캡 고정 손잡이).
  - `resolve-decision` → `{decisionId, escalation, warning}` (DD3)
  - `begin-round` → `{allowed, roundIndex, exitReason}`; 캡 도달 시 exit 12. **멱등** — 마지막 라운드가 `OPEN`이면 append 없이 그 index를 반환(exit 0), 새 라운드는 `FINAL` 이후에만(DD12 규칙 0)
  - `record --round <N> --id A|B --model <str> --reviewer-file <p>` → 리뷰어 JSON을 읽어 envelope로 **변환·검증** 후 append (DD9). 검증 실패는 exit 2 + append 0건
  - `verdict --round <N>` → `ledger.readReviewers(N)` → `gate.decideVerdict` → `{verdict, failing, exitReason}` → `ledger.recordVerdict`로 라운드를 `FINAL`로 전이. **완전성·중복·재판정 검사는 넣지 않는다** — P1 소유(DD12)
  - `status` → `ledger.aggregate()`

  **exit code는 예외까지 전부 매핑한다** — `cli.js`가 최상위에서 `try/catch`하며, 어떤 예외도 stack trace로 새어나가 exit 1이 되지 않는다:

  | 조건 | exit | stdout |
  |---|---|---|
  | 정상 | 0 | 결과 JSON |
  | 캡 도달 (`begin-round`) | 12 | `{allowed:false, exitReason:"cap_reached"}` |
  | usage 오류(미지 subcommand·필수 플래그 누락) | 2 | — |
  | `--decision` `SLUG_RE` 불통과 / `assertContained` 실패 | 2 | — (파일 접촉 0) |
  | envelope 검증 실패 (`record`) | 2 | — (append 0건) |
  | **미개설 라운드** (`record`/`verdict`의 `--round N`이 `beginRound` 미경유) | **2** | — (상태 파일 무변경, DD11) |
  `FINAL` 라운드 변경 · `id` 충돌 · 증거 부족 verdict에 대한 exit code는 **P0가 정의하지 않는다** — 판정 lifecycle이라 P1 소유다(DD12). P0의 CLI는 그 세 경우를 검사하지 않고 통과시키며, 그 결과 열려 있는 dual-review 우회 경로는 DD12에 명시했다.
  | `ledger.read()` throw — 손상 JSON·`schema_version` 불일치 | **2** | — |
  | **lock 획득 실패** (`evidence-lock`의 `EVIDENCE_LOCK_UNAVAILABLE`) | **75** | — (mutation 0건) |
  | **그 외 미매핑 예외** (catch-all) | **2** | — |

  **lock 실패가 75(`EX_TEMPFAIL`)인 이유**: 이것만은 입력 오류가 아니라 **일시적 경합**이다. 5s lease가 만료되면 다음 시도가 성공하므로 호출자에게 "잠시 후 재시도"를 알려야 하고, 2로 뭉뚱그리면 산문이 이를 영구 실패로 오독해 라운드를 포기한다. repo에 이미 같은 의미의 선례가 있다(§4 generic-receipt quarantine의 tempfail propagation — `classify.js`가 exit 75를 emit). **12로 두면 안 된다** — 12는 `cap_reached` 전용이라 호출자가 캡 도달로 오독한다.

  catch-all이 12가 아니라 2인 것도 같은 이유다. mirror인 `plan-review/cli.js:571-577`은 미매핑 예외를 `EX_BLOCK`(12)로 흡수하지만 그쪽 12는 "차단"이라 의미가 맞고, 여기 12는 "캡 도달"이라 맞지 않는다. 미러링은 **정책**("예외가 조용한 통과가 되지 않는다")을 따르는 것이지 숫자를 따르는 것이 아니다.

  `read()` 실패를 exit 2로 두는 것은 의도적이다. exit 0(무시)이면 캡이 리셋되고, exit 12(캡 도달)면 호출자가 "정상 종료"로 오독한다. 손상은 **입력 오류와 같은 등급**으로 다뤄 호출자가 멈추게 한다. 어떤 실패 경로도 상태 파일을 쓰지 않는다.
- **Mirror**: `plan-review/cli.js`, `orchestration-runaway.js:809` `runCli`, `path-containment.js:69` `assertContained`
- **Validate**: 같은 cap test — `begin-round` 4회째 exit 12 + stdout `exitReason:"cap_reached"` · `record` ×2(실제 Step 3 형태의 fixture) 후 `verdict`가 두 envelope를 정확히 round-trip · 불량 verdict / 비배열 `critical_issues` / repo 밖 `--reviewer-file` 각각 exit 2 + 상태 파일 무변경 · **`--decision ../../evil`을 5개 subcommand 전부에 넣어 각각 exit 2 + 파일 접촉 0** (표 순회 test 1개) · 손상 JSON에서 exit 2 (exit 0도 12도 아님) · **DD11 — cap=3에서 `begin-round`가 exit 12를 낸 뒤 `record --round 3`과 `verdict --round 3`이 각각 exit 2 + 상태 파일 byte 무변경. `begin-round`를 아예 부르지 않고 `record --round 0`을 직접 호출해도 exit 2** (캡 거부를 무시한 산문이 리뷰어를 띄워도 출력이 원장에 못 들어감을 CLI 레벨에서 재현) · **DD12 규칙 0** — `OPEN` 상태에서 `begin-round` 연속 3회 + 동시 2회가 `rounds.length`·reviewers 수·잔여 캡을 바꾸지 않고 같은 `roundIndex`를 반환

### Task 5: `santa-loop.md`를 thin caller로 축약
- **Action**:
  - Step 0의 3분기 판정 → `cli.js resolve-decision` 1회 호출. 산문에는 **`warning`이 non-null이면 그대로 stderr 출력**만 잔류(판정 없음).
  - **Step 3 진입점 — 어떤 리뷰어 발화보다 앞 — 에 `cli.js begin-round`**(DD4). 비영점 exit이면 리뷰어를 **띄우지 않고** ESCALATION 블록 출력 후 종료. 요구는 "리뷰어 이전"이지 "파일 첫 줄"이 아니다: DD4가 지키려는 것은 토큰이 소진되기 전 거부이고, 그 앞에 오는 산문 도입부는 리뷰어를 띄우지 않으므로 무해하다. Acceptance L268의 순서 단언과 **같은 것을 말하도록** 문안을 맞춘 것이다(R5 test/MEDIUM — 이전 문안은 "첫 줄"을 요구하면서 test는 순서만 봐서, 명세와 검증이 어긋나 있었다).
  - Step 3 각 리뷰어 응답 → 원본 JSON을 tmp에 쓰고 `cli.js record --round $ROUND --id A --model "$MODEL_A" --reviewer-file <tmp>` (리뷰어당 1회, B도 동일). **리뷰어 프롬프트·출력 계약은 무변경** — `id`/`model`은 caller가 알고 있는 값이고 변환은 CLI가 한다(DD9).
  - Step 4 verdict 문장 → `cli.js verdict --round $ROUND`.
  - Step 5의 `Maximum 3 iterations` 산문 제거 — fix + commit 후 Step 3으로 복귀만 하고 캡 판정은 하지 않는다.
  - **Step 2 rubric 표 · Output 섹션 · Notes는 무변경**(UI5). 축약 후 결정 로직 잔존 0.
- **Mirror**: `plugins/mccp/commands/work.md:760-791` (판정은 node 호출, 산문은 해석과 HALT만)
- **Validate**: `grep -n "Maximum 3 iterations\|ESCALATE ==" plugins/mccp/commands/santa-loop.md` → 산문 캡/분기 잔존 0. 그리고 **순서는 눈으로 보지 않고 test가 본다** — `santa-loop-cap.test.js`가 `santa-loop.md`를 `### ` 헤딩 단위로 잘라 **`### Step 3` slice를 먼저 확정한 뒤**, 그 slice 안에서만 `begin-round` 위치 < `#### Reviewer A` 위치임을 단언한다. slice 밖(예: Step 2)으로 옮겨도 red — 단순 전역 문자열 위치 비교였다면 통과했을 회피 경로다. 리팩터가 순서를 뒤집어도 red. (`instruction-contract/lint.js`가 CLAUDE.md를 파싱하는 것과 같은 축 — 산문도 기계 검증 대상이다.)

  **이 test가 보는 것은 배치이지 셸 의미론이 아니다**(R5 invariant/MEDIUM · R7 Codex F0). `begin-round`를 올바른 위치에서 호출하면서 비영점 exit을 **무시**하는 산문을 쓰면 위 단언은 통과한다.

  이전 개정은 여기에 "같은 slice에 `exit`·`ESCALATION` 문자열이 있는지도 단언하므로 exit code를 무시하는 산문을 걸러낸다"고 적었다. **그 주장은 거짓이었다** — 그 단어들은 무관한 산문에 얼마든지 등장할 수 있고, 존재 검사는 그것이 `begin-round`의 결과에 **결속돼 있는지**를 전혀 보지 않는다. 문자열 존재로 제어흐름을 증명하려 한 것이 오류다. 해당 문장은 삭제한다.

  **대신 강제를 지시 기반에서 능력 기반으로 옮긴다**(DD11). 산문이 exit code를 무시하고 리뷰어를 띄우더라도 그 출력은 원장에 들어갈 수 없다 — `record`·`verdict`가 열리지 않은 라운드를 거부하기 때문이다. 이 축은 CLI test로 **완전히 관측 가능**하다. 남는 천장은 DD5가 말한 것 하나로 줄어든다: **리뷰어 토큰이 실제로 소모되는 것**은 코드가 막지 못한다. 그것은 산문 준수 문제이고 M1은 막았다고 주장하지 않는다.

### Task 6: 배선 + 릴리스 표면
- **Action**: `decision.js`에 **`BRANCH_PREFIX_RE`만 export 추가** (동작 변경 0 — `BRANCH_BASED_COMMANDS`는 손대지 않는다, DD3) · `.gitignore`에 `.claude/state/santa-loop/` · `docs/ENVIRONMENT.md` §11에 `MCCP_SANTA_ROUND_CAP` · `plugin.json` 1.23.8 · `html.js`/`markdown.js` footer · `CHANGELOG.md` 항목 + `currently` 노트 · PRD M1 행 in-progress.

  **`SLUG_RE`는 이미 export돼 있다**([decision.js:318](../../plugins/mccp/scripts/receipt/decision.js)) — 실측 확인. 따라서 이 파일의 diff는 **1줄**(`BRANCH_PREFIX_RE: BRANCH_PREFIX_RE,`)이지 2줄이 아니다(R5 독립 검출). 이전 문안은 두 상수 모두 미export를 전제해, 올바른 구현이 "2줄" acceptance를 만족시키지 못하는 자기모순이었다.

  **동기면은 4면이다** — `plugin.json` · `html.js:1419` page-foot · `markdown.js:163` derived 줄 · `CHANGELOG.md`(항목 + `currently` 노트). §3.7이 말하는 5번째 면인 `i18n-surface.test.js` 단언은 [L94](../../plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js)에서 `plugin.json`을 **파생**하므로 수동 동기 대상이 아니다(리터럴을 박아 두던 시절의 잔재). 이전 문안의 "5면"은 Acceptance의 "3면 + CHANGELOG"와 어긋나 있었고, 실측상 Acceptance 쪽이 맞다.
- **Mirror**: `.gitignore:38,42`, CLAUDE.md §3.7 체크리스트
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/` (decision.js 회귀 0) + version 4면 동기 확인. **`BRANCH_BASED_COMMANDS` 무변경은 육안이 아니라 test가 본다**(R5 test/MEDIUM) — `santa-loop-cap.test.js`가 `require('receipt/decision.js').BRANCH_BASED_COMMANDS`를 읽어 (a) `'mccp:santa-loop'`을 **포함하지 않고** (b) 멤버십이 `{'mccp:pr','mccp:prp-pr','mccp:code-review','mccp:review-pr'}` 4개 그대로임을 단언한다([decision.js:25-30](../../plugins/mccp/scripts/receipt/decision.js), 실측). santa를 이 Set에 넣는 순간 red — DD3이 회피한 `lastImplementReceiptSlug` fallback 함정이 실제로 다시 열리는 유일한 경로이므로, 그것만은 기계가 지킨다.

## Validation

```bash
# 신규 test
node --test plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js \
            plugins/mccp/scripts/lib/tests/santa-gate.test.js

# 기존 회귀 — decision.js 편입이 receipt 계층을 깨지 않는지
node --test plugins/mccp/scripts/receipt/tests/

# 산문 캡 잔존 0 — 반드시 단언적이어야 한다.
# `grep … || echo "OK"`는 발견 시 grep이 exit 0이라 `||`가 안 타고, 미발견 시 echo가
# 타서 또 exit 0 — 어떤 입력에서도 실패할 수 없어 Acceptance를 지지하지 못한다(R5 test/HIGH).
if grep -n "Maximum 3 iterations" plugins/mccp/commands/santa-loop.md; then
  echo "FAIL: prose cap still present in santa-loop.md" >&2
  exit 1
fi
echo "OK: prose cap removed"

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
- [ ] **캡 게이트가 리뷰어 발화보다 앞에 배치된다** (DD4) — **test**가 `### Step 3` slice를 먼저 확정하고 그 안에서 `begin-round` < `#### Reviewer A`를 단언. `begin-round`를 Step 2로 옮기면 red. **이 항목이 증명하는 것은 배치뿐이다** — 산문이 exit code를 무시하는 경우는 아래 항목이 담당한다
- [ ] **캡이 기록 경계에서 기계적으로 구속된다** (DD11) — `begin-round`가 exit 12로 거부한 라운드 N에 대해 `record --round N`과 `verdict --round N`이 각각 **exit 2**이고 상태 파일 byte 무변경. 즉 산문이 거부를 무시하고 리뷰어를 띄워도 **그 출력은 원장에 들어가지 못하고 verdict도 나오지 않는다**. `begin-round` 없이 `record`를 직접 호출해도 동일. 이 축은 CLI test로 완전히 관측 가능하다
- [ ] **`begin-round`가 멱등이다** (DD12 규칙 0) — `OPEN` 라운드가 있는 상태에서 `begin-round`를 연속 3회 호출해도 `rounds.length`·`reviewers` 수·잔여 캡이 전부 불변이고 같은 `roundIndex`가 반환됨. 동시 호출 2개도 동일(판정이 lock 안에서 일어나므로). 이 항목이 red면 재시도만으로 리뷰 없이 캡이 소진된다
- [ ] **판정 lifecycle이 P0에 선반영되지 않음** (DD12 / UI10·UI11) — `cli.js`와 `ledger.js`에 `{A,B}` 완전성 · `id` 중복 · verdict 재판정 검사가 **없다**. `record --id A`를 두 번 넣으면 성공하고 `gate.decideVerdict`의 envelope 0건 → NAUGHTY 경로가 **도달 가능**하다(동작 보존). 이 자리는 P1이 채운다
- [ ] **M1이 막지 못하는 것을 명시한다** (DD5) — 캡 초과 시 리뷰어가 실제로 발화해 **토큰을 소모하는 것**은 코드가 막지 못한다(리뷰어 기동은 LLM 행위라 셸로 추출할 대상이 없다). M1은 그것을 막았다고 주장하지 않으며, 보고서와 PRD 갱신에 같은 문장이 실려야 한다
- [ ] **exit code 표가 lock 실패와 catch-all을 포함** — `EVIDENCE_LOCK_UNAVAILABLE`은 75(일시적, 재시도), 미매핑 예외는 2. 12는 `cap_reached` 전용이라 어느 쪽도 12를 쓰지 않음
- [ ] **`assertContained` 대상이 파일이 아니라 디렉토리** — `fs.realpathSync`가 미존재 대상에 throw하므로 최초 실행에서 정상 경로가 traversal로 오판되지 않음. mkdir 직후 `stateDir`에 3-arg로 호출 (DD3)
- [ ] **리뷰어 원본이 소실되지 않음** — `record` 후 상태 파일의 `rounds[N].reviewers[i].raw`에 `checks`·`suggestions`가 그대로 남아 P1이 severity 축을 세울 입력이 보존됨 (DD2)
- [ ] **경로가 git repo root 앵커** — 하위 디렉토리에서 호출해도 같은 원장 파일을 읽고, `--decision <slug>`로 캡을 고정할 수 있음 (DD3)
- [ ] **`--decision`이 디렉토리를 탈출하지 못함** — `--decision ../../evil` 등 `SLUG_RE` 불통과 값이 전 subcommand에서 exit 2 + 파일 접촉 0 (DD3)
- [ ] **`decision.js`의 `BRANCH_BASED_COMMANDS`가 무변경** — santa 원장이 `lastImplementReceiptSlug` fallback으로 남의 decision slug 아래 들어가지 않음. **test**가 그 Set을 읽어 `'mccp:santa-loop'` 부재 + 4개 멤버십 유지를 단언(육안 아님). `git diff plugins/mccp/scripts/receipt/decision.js`는 export **1줄**(`BRANCH_PREFIX_RE`) — `SLUG_RE`는 이미 export됨 (DD3)
- [ ] **reviewer envelope round-trip** — 실제 Step 3 형태 fixture(`{verdict, checks, critical_issues, suggestions}`)를 `record --id --model`로 넣으면 envelope로 변환돼 저장되고, `verdict`가 둘을 받아 판정하며 `failing`이 FAIL한 `id`만 담음 (DD9)
- [ ] **불량 입력이 원장을 오염시키지 않음** — 불량 verdict · 비배열 `critical_issues` · repo 밖 `--reviewer-file` 각각 exit 2이고 상태 파일 byte 무변경
- [ ] **손상 상태 파일이 캡을 리셋하지 않음** — 깨진 JSON에서 `read()`가 throw하고 `begin-round`가 라운드 0으로 재출발하지 않음 (DD2)
- [ ] 원장 mutation 3종이 `evidence-lock#guardedReadModifyWrite` 안에서 실행되고, 정상 종료 후 파일 mode가 `0o600` (DD7·DD2)
- [ ] **mode self-repair** — 파일을 `0o644`로 바꿔 둔 뒤 임의 진입점을 호출하면 mode가 `0o600`으로 복구되고 동작은 정상 (POSIX 한정, Windows는 skip). rename 직후 크래시로 완화된 mode가 **영구히** 남지 않음 (DD7 / R6 Codex F1). run 내부의 write→chmod 잔여 창은 M1이 닫지 않으며 그렇게 주장하지도 않음
- [ ] **`assertContained` 3번째 인자가 `null`** — `.claude/state`는 receipts 밖이라 `repoRoot`를 넘기면 `gate dir escapes receipts root`로 전 호출이 exit 2가 된다. 정상 경로 2종이 통과하고 repo 밖 symlink는 여전히 차단됨 (DD3 / R6 Codex F0)
- [ ] escalate_pending 3분기 전부에서 `decisionId`가 파생 slug이며, drift에서만 `warning`이 non-null이고 `santa-loop.md`가 그 문자열을 stderr로 출력 (DD3)
- [ ] CLI JSON stdout 필드가 전부 camelCase (`exitReason`·`roundIndex`·`decisionId`) — snake_case 혼용 0 (DD10)
- [ ] `santa-loop.md`에 결정 로직 잔존 0 (`Maximum 3 iterations` 산문 캡 · Step 0 3분기 판정 제거), rubric 표와 Output 섹션은 diff 무변경
- [ ] verdict 4조합이 산문 규칙과 동일 (동작 보존, UI10). `gate.decideVerdict`의 envelope 0건 → NAUGHTY가 **CLI 경유로도 도달 가능**(판정 lifecycle을 P1으로 이관했으므로) — 동작 보존 유지
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

- 호출: `node plugins/mccp/scripts/lib/plan-codex-runner.js` (in-process intent gate, v1.23.1) — Codex GPT-5.4 계열
- 라운드 수: 2 (R6·R7 — 앞선 R1~R5는 multi-agent 패널, 기록은 [plan-review-santa-loop-materialize-m1.md](../reviews/plan-review-santa-loop-materialize-m1.md))
- 리뷰 대상 plan 버전: R6 `sha256:bb4f7f63…` (R5 흡수분 7건 반영본) · R7 `sha256:54e372f3…` (R6 흡수분 반영본)
- 합치 결론: **R6 2건 + R7 1건, 전량 ACCEPT_NOW.** R6-F0(high)은 R5 흡수가 새로 만든 결함으로 채택 시 santa-loop이 입력과 무관하게 전면 불능이 되는 종류였고, R7-F0(high)은 R5 흡수가 **Acceptance에 심은 거짓 주장**을 겨눴다.

### R6 (`sha256:bb4f7f63…`)

- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F0 — 상태 경로에 3-arg `assertContained`를 쓰면 모든 정상 호출이 실패 | HIGH (conf 0.99) | **ACCEPT_NOW** | 소스 확인 완료. 3번째 인자는 generic repo-root가 아니라 `expectedParentDir ⊂ .claude/receipts` 강제([path-containment.js:50-65](../../plugins/mccp/scripts/lib/path-containment.js)). `.claude/state`는 receipts 밖이라 전 호출이 `gate dir escapes receipts root`로 exit 2. 헤더 L16-18이 "receipts 밖 caller는 `repoRoot`를 생략하라"고 명시하고 [pr-phase-lock.js:466](../../plugins/mccp/scripts/lib/pr-phase-lock.js)이 같은 형태로 `null`을 넘긴다 |
  | F1 — 사후 chmod가 원장 원문을 일시 노출 | MEDIUM (conf 0.95) | **ACCEPT_NOW (범위 축소)** | 메커니즘 확인 완료([evidence-lock.js:241](../../plugins/mccp/scripts/receipt/evidence-lock.js) — `writeFileSync(tmp, content, 'utf8')`, mode 없음). 다만 권고안(`writeFileAtomic`에 mode 옵션)은 receipt write를 공유하는 evidence-critical 모듈 변경이라 UI11 밖. santa 소유 범위의 2단계 완화(chmod + 전 진입점 mode self-repair)로 수용하고 근본 수정은 backlog 이연 |

### R7 (`sha256:54e372f3…`)

R6의 두 흡수분은 **재지적 없음** — 3-arg `null` 정정과 mode self-repair 모두 올바른 것으로 확인됐다. 새 finding 1건은 R5 흡수가 심은 거짓 주장을 겨눈다.

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F0 — 캡 거부가 리뷰어 실행을 막는다는 것을 acceptance test가 증명하지 못한다 | HIGH (conf 0.98) | **ACCEPT_NOW** | 맞다. R5가 추가한 "`exit`·`ESCALATION` 존재 단언이 exit code를 무시하는 산문을 걸러낸다"는 **거짓**이었다 — 그 단어들은 무관한 산문에도 등장하고, 존재 검사는 `begin-round` 결과와의 **결속**을 전혀 보지 않는다. `$?`를 무시하고 리뷰어 둘을 띄우는 구현이 단언을 통과하며, 그러면 M1이 허용한 유일한 동작 변경인 캡이 미강제로 남는다 |

**흡수 — 단 권고안 그대로는 아니다.** Codex는 "dispatch 제어흐름을 실행 가능한 스크립트로 추출해 리뷰어 미기동을 단언하라"고 했지만, 리뷰어 기동은 LLM 행위라 추출 대상이 존재하지 않는다(`/mccp:work` verify-decide HALT와 같은 repo 전역 한계). 대신 **DD11**을 신설해 강제를 지시에서 **능력**으로 옮겼다 — `record`·`verdict`가 미개설 라운드를 거부하므로, 산문이 거부를 무시해도 리뷰어 출력이 원장에 못 들어가고 verdict가 안 나온다. 이 축은 CLI test로 완전히 관측 가능하다. 남는 손실(캡 초과 라운드의 토큰 소모)은 막지 못한다고 Acceptance에 명시했다.

거짓 문장은 삭제했고, Acceptance 1개 항목을 3개(배치 / 능력 강제 / 못 막는 것)로 쪼개 각각이 관측 가능한 것만 주장하게 했다.

### R8 (`sha256:726e4f5e…`)

R7의 DD11 흡수는 재지적 없음 — 능력 기반 전환 자체는 옳다고 확인됐다. 다만 **그것이 절반만 닫았다**는 지적이 왔다.

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F0 — DD11이 열린 라운드의 lifecycle을 강제하지 않는다 | HIGH (conf 0.98) | **ACCEPT_NOW** | 맞다. DD11은 `round >= rounds.length`만 거부했고 **열린 뒤**는 무방비였다. 세 구멍: (1) 리뷰어 기록 전 `verdict` → envelope 0건 → NAUGHTY → 근거 없는 fix cycle이 캡 라운드를 태움, (2) **`record --id A` ×2 → A envelope 2개 → 둘 다 PASS면 NICE → 리뷰어 하나로 dual-review 우회**, (3) verdict 후 재기록·재판정으로 결론난 라운드 덮어쓰기 |

**(2)가 이번 8라운드 전체에서 가장 심각한 결함이다** — santa-loop이 존재하는 이유인 dual-review 자체가 기계적으로 뚫린다. 그리고 이 지적은 DD11이 "남는 손실은 토큰뿐"이라고 한 주장도 **거짓으로 만든다**(라운드 낭비·증거 위조·결론 변조가 남아 있었으므로).

**흡수 — DD12 신설.** 라운드에 명시적 상태(`OPEN`/`FINAL`, `verdict === null`의 파생)를 주고 규칙 4개를 강제한다: `record`는 `OPEN`에서만 · `id` 중복은 byte-identical일 때만 멱등 허용 나머지는 exit 2 · `verdict`는 `{A,B}` 둘 다 있을 때만이며 부족은 NAUGHTY가 아니라 **exit 2** · verdict는 1회. `gate.js`의 envelope-0 → NAUGHTY는 순수 함수 default로 남기되 CLI 도달 불가임을 주석에 명시한다. Acceptance에 lifecycle 5종 + "리뷰어 하나로 NICE가 나오지 않는다" 항목을 추가했다.

> **후속 정정 (봉인 패스)** — 위 흡수 중 **규칙 1~4(판정 lifecycle)는 되돌렸다.** 봉인 패스 Codex F0가 그것이 UI10·UI11 위반임을 지적했고 그 지적이 옳다. 현재 DD12에는 캡 축인 **규칙 0만** 남아 있고 lifecycle은 P1 소유다. 그 결과 R8이 닫았다고 한 dual-review 우회 경로는 **다시 열려 있으며**, 그 사실과 근거는 DD12 본문에 명시했다. 이 문단은 R8 시점의 기록으로 남긴다.

### R9 (`sha256:b69db7ea…`) — 마지막 라운드

리뷰어에게 **깨끗한 통과도 정당한 출력**임을 명시적으로 허용하고("반증에 실패했으면 그렇게 말하고 findings 0으로 반환하라"), 넓게 훑는 대신 **가장 위험한 단일 지점 하나**를 `file:line`으로 증명하도록 요청했다.

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F0 — `beginRound` 재시도가 여러 OPEN 라운드를 만들고 캡을 소진한다 | HIGH (conf 0.98) | **ACCEPT_NOW** | DD12는 `record`·`verdict`만 제한하고 **`beginRound` 자신은 통제하지 않았다**. stdout 유실 후 재시도 · 산문의 중복 호출 · 동시 호출이 각각 새 OPEN 라운드를 append해 **리뷰 없이 캡을 태우고**, 여러 라운드가 병행돼 상태 기계가 무너진다 |

**흡수 — DD12에 규칙 0 추가.** `beginRound`는 멱등이다: lock **안에서** 마지막 라운드를 보고 `OPEN`이면 append 없이 그 index를 반환, 새 라운드는 `FINAL` 이후에만. 검사를 lock 밖에 두면 동시 호출 둘이 나란히 통과하므로 위치가 본질이다.

### 종료 판정 — R9에서 멈춘다

**Codex 4라운드(R6~R9)가 전부 HIGH를 하나씩 냈고, R7·R8·R9는 모두 직전 흡수가 남긴 구멍을 겨눴다.**

| 라운드 | 겨냥 대상 |
|---|---|
| R6 | R5 흡수가 넣은 `assertContained` 3-arg 오용 |
| R7 | R5 흡수가 Acceptance에 심은 거짓 단언 |
| R8 | R7 흡수(DD11)가 절반만 닫은 lifecycle |
| R9 | R8 흡수(DD12)가 `beginRound`를 빠뜨린 구멍 |

이 수열은 수렴이 아니다. 매 라운드가 진짜 결함을 냈다는 점에서 노이즈도 아니지만, **패치가 다음 패치의 대상을 만드는 구조**는 이 PRD가 [#124](https://github.com/skypark207/my-claude-code-plugin/issues/124)로 지목한 patch-chasing 그 자체다. R10을 도는 것은 P0를 계획하면서 P0가 없애려는 루프를 실연하는 일이므로, 사전에 정한 종료 규칙("R9가 본문 수정을 요구하면 흡수만 하고 종료")대로 멈춘다.

- **R9 흡수분(DD12 규칙 0)은 판정 이후 편집이라 미검증**이다.

### 봉인 패스 — §5.4 캡 초과 경로로 착지

R9 종료 후, 게이트가 **이미 문서화해 둔 출구**를 지나쳤음을 확인했다: §5.4는 캡 초과 시 `DIVERGENT_UNRESOLVED`를 달고 **진행**(= receipt 발행)하라고 규정하는데, 앞선 종료 판정은 receipt를 포기했다. 그래서 본문을 수정하지 않는 조건으로 봉인 패스를 한 번 더 돌렸다. 그런데 findings 2건이 왔고 **둘 다 흡수하지 않을 수 없는 것**이었다.

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F0 — DD12가 캡 강제를 넘어 판정 결과를 변경한다 | HIGH (conf 0.99) | **ACCEPT_NOW** | 옳다. DD12 규칙 1~4는 판정 lifecycle이고 UI11이 P1에 남기라 한 내용이다. 규칙 3은 도달 가능하던 판정(envelope 0건 → NAUGHTY)을 없애 UI10을 직접 위반한다. **사용자 제약 위반은 DEFER 대상이 아니다** — 그것을 이연하면 "요청과 다른 것을 알면서 봉인"이 된다 |
| F1 — 봉인 결론이 receipt 부재로 구현 진입을 막는다 | HIGH (conf 0.98) | **ACCEPT_NOW** | 옳다. 본문이 "receipt 미발행 → prp-implement 시작 불가"와 "캡 초과 경로로 진행 허용"을 동시에 주장해 절차적으로 구현 불가였다. 아래 서술을 정정했다 |

**F0 흡수는 이전 흡수들과 성격이 다르다 — 명세를 *줄인다*.** R6~R9의 흡수는 전부 규칙을 *추가*했고 그 추가분이 다음 라운드의 공격면이 됐다. F0 흡수는 반대로 DD12를 사용자가 정한 경계(캡 축 하나)로 되돌린다. 되돌린 자리가 무엇을 잃는지는 DD12 본문에 그대로 적었다 — dual-review 우회 경로가 열린 채 남고, 그것은 P1의 1순위 항목이다.

- **receipt**: 이 봉인 패스가 발행한다. verdict는 `divergent` — 정직한 기록이며, cross-gate dedupe가 fail-closed로 막혀 `/mccp:pr`에서 PR-Codex가 반드시 재발화하므로 dual-review는 보존된다.
- **`/mccp:prp-implement` 진입**: 가능하다. 비-terminal 게이트는 divergent receipt를 차단하지 않는다(§1.3). 앞선 "시작할 수 없다"는 서술은 receipt가 아예 없던 시점의 것이며 F1 지적대로 지금은 사실이 아니다.
- 이 세션의 측정치는 P1 판정 계약의 **baseline 자료**다 — 라운드별 결함 수와 성격은 [plan-review-santa-loop-materialize-m1.md](../reviews/plan-review-santa-loop-materialize-m1.md)의 "9라운드 측정치" 절이 소유한다.

---

- Deferred to backlog: 1 → [.claude/plans/codex-findings-backlog.md](codex-findings-backlog.md) (R6-F1의 `writeFileAtomic` mode 옵션)
- **Open Questions: DIVERGENT_UNRESOLVED** (§5.4 캡 초과 경로) — `MCCP_GATE_ROUND_CAP`은 미설정이라 **default 1**인데 Codex 라운드가 4회(R6~R9) 돌았다. §5.4는 캡 초과 시 `DIVERGENT_UNRESOLVED`를 달고 **진행**하라고 규정하므로 그 판정을 여기에 확정한다. 미해소로 남는 항목:
  - R9-F0 흡수(DD12 규칙 0 — `beginRound` 멱등)는 **판정 이후 편집이라 미검증**이다. plan은 심사받은 버전보다 엄격해졌을 뿐이지만 승인을 주장하지 않는다.
  - R6-F1의 근본 수정(`writeFileAtomic` mode 옵션)은 backlog 이연 — M1은 창을 좁히기만 하고 닫지 않는다.
  - auto-CRITICAL 범주(비밀 노출·데이터 손실·비가역 마이그레이션·인증 우회·외부 목적지 변경·키 취급) 해당 **0건** — 따라서 §5.5 CRITICAL stop 대상이 아니고 진행이 허용된다.
- **캡이 4배 초과된 것은 부주의가 아니라 게이트의 구조 결함이다.** §5.4가 지시하는 "흡수 후 진행"의 *진행*이 도달 불가다 — `plan-codex-runner.js`가 리뷰 시점 본문에 결속돼 있어, §5.4가 시키는 흡수를 수행하는 순간 그 라운드는 `incomplete` + exit 12로 receipt 발행이 막히고 유일한 출구가 재실행(=다음 라운드)이 된다. 그래서 "HIGH를 흡수하면 receipt를 못 얻고, receipt를 얻으려면 흡수를 포기해야" 하는 이지선다가 생긴다. 이 사이클은 흡수를 택했고 그 대가로 라운드가 연쇄했다. [backlog](codex-findings-backlog.md) 2026-08-13 HIGH 항목이 수정 후보 3안을 담는다
- **cross-model이 실제로 다른 것을 봤다는 증거 2건**: (1) R5 패널 4인 중 security 관점은 `assertContained` 호출을 "심층 방어 확인"으로 pass시켰으나 R6 Codex는 같은 호출의 **인자 의미**를 소스로 읽어 전면 불능 결함을 찾았다. (2) R5 패널 invariant 관점이 같은 축을 MEDIUM으로 지적하고 넘어간 자리에서, R7 Codex는 그 흡수가 만든 **거짓 단언 자체**를 HIGH로 짚었다. 두 번 다 패널이 통과시킨 지점이다
