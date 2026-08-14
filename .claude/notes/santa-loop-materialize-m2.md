# santa-loop-materialize M2 — 구현 노트

> 이 파일은 `/mccp:prp-implement` Phase 2.5가 **plan 본문 대신** 쓰는 리뷰 기록이다.
> plan(`.claude/plans/santa-loop-materialize-m2.plan.md`)은 `mccp-plan-codex` receipt의
> `plan_hash=sha256:c0a43a59…`에 바인딩돼 있어, 본문을 한 글자라도 고치면
> `validate-cmd.js:304`의 재해시 대조가 그 receipt를 stale로 떨어뜨린다.
> command body가 허용하는 대안 경로(`.claude/notes/<topic>.md`)를 쓴 이유다.

## Codex Implementation Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (cap `MCCP_GATE_ROUND_CAP` 기본 1)
- classification: `ok` · structured verdict: `needs-attention` → `codex_verdict=divergent`
- 합치 결론: seal의 원장 읽기를 **단일 스냅샷**으로 바꾸면 지적이 닫힌다. 나머지 6개 결정은 반박되지 않았다.

### YAGNI Triage

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 — seal이 원장 버전이 뒤섞인 상태를 감사 receipt에 봉인 | HIGH | ACCEPT_NOW | 지적이 정확하다. `read()`(라운드 골격) + 라운드별 `readReviewers()`(각각 내부에서 `read()` 재호출) + `aggregate()`(또 `read()`)로 최소 N+2회 읽고, 읽기에는 lock이 없다. 동시 CLI 호출이 그 사이에 mutate하면 라운드 메타·리뷰어 quorum·집계·exitReason이 **동시에 존재한 적 없는** 조합으로 봉인된다. 감사 앵커에서는 조용한 불일치가 명시적 실패보다 나쁘다 |

- Deferred to backlog: 0
- Open Questions: 없음 (F1 R1 내 완전 해소)
- Codex thread: `019ffeef-dde9-7c00-b8e4-2d1f0e712797`

### F1 흡수 — 단일 스냅샷 + ledger에 순수 파생 함수 2개 추가 (additive)

Codex 권고("add an exported projection function that accepts or returns one sanitized
snapshot, rather than rereading per round")를 그대로 따른다. plan Task 3의 seal 7단 중
(2)·(3)의 **입력 획득 방식만** 바뀌고 출력 계약·투영 경계·verdict 규칙은 무변경이다.

`ledger.js`에 순수 함수 2개를 **추가**한다. 기존 두 함수는 그 순수 함수에 위임만 하므로
**시그니처·동작 무변경**이다 — DD7/UI7이 금지하는 "M1 동결 시그니처 변경"에 해당하지 않는다
(추가는 동결 위반이 아니다).

| 신규 export | 계약 | 기존 함수와의 관계 |
|---|---|---|
| `reviewersFrom(state, round)` | 이미 읽은 state에서 해당 라운드의 **envelope만** 반환 (raw 미접촉) | `readReviewers(round, opts)` = `reviewersFrom(read(opts), round)` |
| `aggregateFrom(state, cap)` | state + cap에서 `{rounds, entries, exitReason}` 파생 | `aggregate(opts)` = `aggregateFrom(read(opts), cap)` |

seal은 이제 `ledger.read(opts)`를 **한 번만** 호출하고 위 두 순수 함수로 전부 파생한다.
raw 소거가 여전히 ledger 모듈 안에 있으므로 UI4 이중 방어도 보존된다 — plan이 R0·R2에서
세운 "렌더러에 raw를 실을 인자가 없다"는 구조는 무변경이다.

**Files to Change 이탈 1건(기록)**: `plugins/mccp/scripts/lib/santa/ledger.js`가 plan의
Files to Change 표에 없다. 순수 추가이고 F1(HIGH)을 닫는 유일한 정공법이라 수용한다.
plan 본문은 hash 바인딩 때문에 고칠 수 없으므로 이 이탈은 여기와 구현 리포트에 기록한다.

### 추가 test 항목 (plan 16항목 밖 — 여기서 계약)

plan의 커버리지 계약은 1~16이고 Validation 2d는 그 집합의 **존재**를 검사하므로,
추가 항목은 2d를 깨지 않는다.

- **[17] 동시 변경 하에서의 스냅샷 일관성** (Codex next_steps) — `seal`이 스냅샷을 잡은 뒤
  원장을 변경해도, 산출 리포트·receipt가 **한 버전**에서만 파생됨을 단언한다. 단일
  `read()` 위임을 되돌려 라운드별 재읽기로 회귀시키면 red가 된다.

### 반박되지 않은 결정 6건 (기록만)

2 모듈 레이아웃(순수 3 + seal 1 개별 export) · 3 `SantaLedgerError` 재사용 + 신규 exit code 0개 ·
4 리포트 markdown 형태(heading ≤ 3, 4라운드 이상 시 상위 3행 + `<details>`) ·
5 리포트 해시를 디스크 재읽기가 아니라 **기록한 그 문자열**로 계산 ·
6 `mutate`가 module-private이라 항목 11(c)를 **export된 mutation 4종**(`beginRound`·
`recordReviewer`·`recordVerdict`·`appendEntry`) 스파이로 대체 ·
7 `buildProof`의 distinct-id를 FINAL 라운드에서만 파생.

6은 plan이 문자 그대로는 구현 불가한 항목을 요구한 것이라, 의도(DD5 "mutation 경로 진입
자체 금지")를 보존하는 대체안이다. 모든 mutation은 그 4개 진입점을 지나므로 커버리지는 동일하다.

## 구현 중 발견 (plan 밖 사실)

plan 본문은 hash 바인딩 때문에 고칠 수 없으므로 여기에 기록한다.

| # | 발견 | 처리 |
|---|---|---|
| D1 | **`node --test <디렉토리>`가 이 환경(Node 24.19)에서 동작하지 않는다** — 디렉토리를 모듈 경로로 해석해 `MODULE_NOT_FOUND`로 죽는다. plan의 Validation 2b·Task 6 Validate가 그 형태다 | 실행 시 glob 형태(`.../tests/*.test.js`)로 대체. 구현 리포트에 명시 |
| D2 | **`review_proof.reviewed_plan_hash`는 필수다** — plan DD3 표는 "있으면 receipt plan_hash와 일치"로 적어 선택적으로 읽히지만, `isReviewProofStructurallyValid`(`review-verdict.js:182-183`)는 sha256 문자열이 아니면 converged proof를 **거부**한다 | `seal.js`가 항상 `markdownHash(리포트)`를 채운다. test fixture도 동일 |
| D3 | **`schema.test.js`의 generic 순회가 새 gate와 충돌** — `every valid gate_id accepted`가 baseline fixture 하나로 전 GATE_ID를 검증하는데, santa gate는 설계상 review triple 없이는 거부된다(gate별 resolution 제약은 이 repo 최초) | fixture를 gate별로 보강(`GATE_RESOLUTION_EXTRAS`)하고, 보강을 뺐을 때 거부되는지를 별도 test로 못박아 우회 장치가 아님을 고정. `schema.test.js`는 plan Files to Change 밖이라 이탈로 기록 |
| D4 | **`ledger.js`가 Files to Change 밖** | Codex F1(HIGH) 흡수의 정공법이라 수용. 위 F1 절 참조 |
| D5 | **M1의 `santa-loop-cap.test.js`가 "M2 미착륙"을 단언** — `UI4/UI11 — M2 산출물이 코드에 선반영되지 않았다`가 santa 디렉토리에 4개 파일만 있고 receipt 배선이 **없음**을 요구했고, `Acceptance — 외부 의존 4개`가 의존 allowlist를 고정했다. M2 착륙이 정의상 이 둘을 red로 만든다 | 지우지 않고 **경계를 이동**. 전자는 "receipt 배선은 `seal.js`에만 있다(M1 4개 모듈은 여전히 receipt-free)"로 좁히고 seal.js가 실제로 그 경로를 갖는지 대조군 단언을 추가했다 — 그냥 지우면 "배선이 어디에나 퍼져도 아무도 모른다"가 되어 M1이 막으려던 결함이 되살아난다. 후자는 M2가 더한 정확히 2개(`./seal`·`../../receipt/write`)를 allowlist에 명시. `santa-loop-cap.test.js`도 Files to Change 밖이라 이탈로 기록 |
| D6 | **`assertContained`는 존재하는 두 경로만 검사한다**(realpath 기반) — 아직 없는 파일에는 걸 수 없고 `target === gate`도 거부한다 | 대상을 파일이 아니라 **디렉토리**로 잡고 gate를 그 부모로 뒀다(`ensureStateDir`와 동형). 파일명 안전성은 SLUG_RE가 경로 조립 **이전**에 이미 보장하므로 방어가 비지 않는다 — `assertContained`가 막는 것은 심볼릭 링크 탈출이고 그것이 이 모듈의 계약이다 |

### Security Reviewer

`Task(mccp:security-reviewer)` 실행 완료. **CRITICAL/HIGH 0건** → MCCP-GATE-STOP 미해당.
MEDIUM 3 · LOW 2이고, 그중 신규 실행 항목은 F1 하나다.

| # | Severity | 지적 | 처리 |
|---|---|---|---|
| S1 | MEDIUM | **proof 경로가 봉인되지 않는다.** plan Task 3은 리포트 경로만 `assertContained(리포트, <repoRoot>/.claude/reviews, null)`로 봉인하고, `.claude/state/santa-loop/<slug>.proof.json` 쓰기에는 어떤 containment도 명시하지 않는다. SLUG_RE가 `.`·`/`를 막지만 디렉토리 검증은 2차 방어다 | **흡수** — seal이 proof를 쓰기 전 `assertContained(proofPath, <repoRoot>/.claude/state/santa-loop, null)`를 적용한다. 리포트 경로와 동일한 3-arg 형태(3번째 `null` = receipts 전용 검사 비활성, M1과 같은 이유) |
| S2 | MEDIUM | cap fallback이 조용히 env를 읽어 감사 기록을 위조할 수 있다 | **설계 이미 정정됨** — plan Task 3이 `cap: state.cap` 명시 전달을 요구사항으로 못박았고 항목 16이 env를 어긋나게 둔 fixture로 강제한다. 구현 충실도 문제이므로 추가 설계 변경 없음 |
| S3 | MEDIUM | gate-id 기준 `review_source` 검사가 이 파일 최초 패턴이라 잘못 중첩되기 쉽다(기존 5개 검사가 전부 가드 안에 있어 근육 기억이 그쪽으로 끌린다) | **설계 이미 정정됨** — R7에서 "가드 바깥(형제)"으로 교정했고 항목 5의 4번째 sub-case("triple 전부 부재")가 유일한 강제다. 구현 시 중첩 깊이를 특별히 확인한다 |
| S4 | LOW | raw 소거가 구조적으로 건전하나 test 의존 | 조치 없음 — 항목 10 canary가 유일 강제이고 그것이 설계 의도다 |
| S5 | LOW | `--review-proof-file`이 임의 JSON 경로를 받는다 | 조치 없음 — proof는 schema 구조 검증 + `receipt_hash` 봉인을 거치고, 정상 경로에서 seal이 내부 생성하므로 2차 우려에 그친다 |

S1 흡수로 seal의 파일 쓰기 **2곳 모두** containment를 갖는다. plan 본문은 hash 바인딩 때문에 수정 불가하므로, 이 결정은 여기와 `seal.js` 헤더 주석에 기록한다.

### D7 — 착지 직전 버전 재번호 (§3.7 forward-only, 8번째 재발)

plan Task 8과 그 `Files to Change` 행은 `plugin.json` `1.23.8 → 1.23.9`를 지정하고 구현도 그대로 냈지만, **PR 직전 origin/main 병합 시점에 두 번호가 모두 무효**임이 드러났다.

- main이 그사이 **다른 축**으로 `1.23.8`(diverse-agent-review M4, 2026-08-09)을 발행해 이 브랜치의 M1 `## [1.23.8]`(2026-08-13)과 CHANGELOG 헤딩이 정면 충돌했다.
- main이 `1.23.10` · `1.23.11` · `1.24.0` · `1.25.0`까지 나아가, `1.23.9`를 그대로 두면 머지 시 매니페스트가 **역행**한다.

§3.7대로 발행된 번호는 불가침이고 미머지 항목만 위로 민다. PRD는 milestone이 M1·M2 둘뿐이고 M1이 complete이므로 **M2는 PRD 전체 종료 = minor 축**이다:

| 항목 | plan 지정 | 착지 |
|---|---|---|
| M1 (선행 커밋) | `1.23.8` | `1.25.1` (patch) |
| M2 (본 milestone) | `1.23.9` | `1.26.0` (minor — PRD 종료) |

동기 면은 plan이 적은 그대로 4개(`plugin.json` · `html.js:1419` · `markdown.js:163` · CHANGELOG 항목 + `currently` 노트)이고 대상 값만 바뀌었다. **plan 본문은 hash 바인딩이라 수정하지 않았다** — plan Task 8의 `1.23.9`는 이제 stale이며, 정본은 이 표다. 커밋 메시지의 `feat(v1.23.8-m1)` · `feat(v1.23.9-m2)`도 history 재작성을 피해 그대로 두었다(§3.12 — SHA 도달성 보존이 receipt 결속보다 우선한다). PR 제목은 착지 번호를 쓴다.
