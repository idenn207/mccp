# Fix Task — PR-Codex R1 (v1.22.3 M3)

- **Source**: `/mccp:pr` PR-Codex gate, R1, `run_id=1203df1f-09c5-4dc4-8549-b5c72d94087c`
- **Verdict**: `needs-attention` → receipt `resolution.codex_verdict='divergent'`, `meta.codex_review_actionable_findings=true`
- **Codex summary**: "No ship: the PR still mishandles design-scope exclusions and can corrupt its new primary runaway counter before any worker actually launches."
- **Receipt**: `.claude/receipts/mccp-pr-codex/workflow-orchestration-live-activation-m3.json` (head `a4db756`)
- **Decision**: 두 건 모두 ACCEPT_NOW (backlog 이연 아님). 흡수 후 `/mccp:pr` 재실행.
- **Verified**: 두 finding 모두 실제 코드로 확인함 — Codex 주장 액면 수용 아님.

---

## F1 — Filtered design/a11y-only reviews still block the PR gate

- **Severity**: HIGH (Codex confidence 0.88)
- **Locus**: `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js:96-100`

### 현상

```js
function isActionable(review, filteredFindings) {
  if (!review) return true;
  if (!APPROVING_VERDICTS.has(review.verdict.toLowerCase())) return true;  // ← short-circuit
  return (filteredFindings || []).length > 0;
}
```

비-`approve` verdict가 `filteredFindings`를 보기 **전에** short-circuit한다. Codex가 design/a11y
finding 때문에만 `needs-attention`을 내면 `filterDesignFindings`가 그 항목을 전부 drop해도
`actionable=true`가 남고, `finalize-receipt`가 raw verdict를 `divergent`로 매핑한다.
결과: 살아남은 in-scope finding이 0인데 PR이 불투명하게 차단된다 (design-scope
exclusion preamble의 계약 위반).

### 왜 지금 중요한가

M3 이전에는 `isActionable`이 구조적으로 **항상 false**였다(envelope의 `.summary`/`.findings`를
읽어서 — 실제 데이터는 `.stdout`에 있음). 즉 이 경로는 발화 자체가 불가능했다.
M3의 verdict-read 수정이 이 경로를 **새로 활성화**했다. 이 PR이 연 문이므로 이 PR에서 닫는다.

관련: implement 게이트가 이미 같은 축을 MEDIUM으로 식별해 backlog에 이연한 항목
("Implement-Codex F2: scope-excluded finding만으로 non-approve 시 불투명 차단").
Codex가 PR 게이트에서 HIGH로 재발화 → backlog에서 끌어올려 여기서 해소.

### 수정 방향 (Codex recommendation)

post-filter **effective verdict**를 도출한다:

- unreadable review → 계속 blocking (fail-closed 유지, 절대 완화 금지)
- non-approve + 원래 finding이 0개 → 계속 blocking (근거 없는 non-approve는 신뢰 불가)
- non-approve + itemized finding이 **전부** design/a11y로 필터됨 → `codex_actionable_findings=false` +
  approving/scoped-out 상태를 receipt로 forward

### 회귀 가드

- 필터 전 finding이 있었고 일부만 drop된 경우 → 여전히 actionable=true 여야 함
- `filteredFindings.length > 0` 경로 무변경
- 기존 `codex-runner.test.js`의 verdict-read 테스트가 green 유지
- **test stub이 실제 producer를 반영하는지 확인** — 지난 라운드 교훈: stub이 구현 가정을
  인코딩해 suite green인 채 production blind였음. 실제 codex-invoke envelope 형태로 stub할 것.

---

## F2 — Runaway slots are consumed before launch is guaranteed

- **Severity**: HIGH (Codex confidence 0.82)
- **Locus**: `plugins/mccp/scripts/lib/orchestration-runaway.js:248-308` (`reserveWorkers`)

### 현상

`reserveWorkers`가 **결정 시점**에 `launched`를 영구 증가시킨다:

```js
const launched = cur.launched + decision.n;
fs.writeFileSync(tmp, body); fs.renameSync(tmp, p);
return { granted: decision.n, ... };
```

함수 주석도 이를 명시한다: "`granted` is ... ALREADY counted — the caller must NOT call
bumpCounter afterwards."

호출자는 오라클을 resolve하는 동안 이를 호출하는데, 그 **이후** 단계가 worker를 spawn하지
않고 skip/fail할 수 있다:

- Workflow 미가용 → Task 경로로 fallback
- `prepare-fleet` 실패
- route fallback (`resolveWorkRoute`)
- plan fan-out의 Workflow budget pre-guard skip

이 경로들에서 worker가 0개 뜬 채 슬롯만 소진된다(유령 예약).

### 왜 지금 중요한가

M3가 operational USD block을 은퇴시키면서 이 카운터를 **primary structural backstop**으로
승격시켰다. 따라서 유령 예약이 `MCCP_ORCHESTRATION_MAX_AGENTS`(default 24) headroom을 갉아
이후 **실제** 작업을 1 worker로 조기 강등시킨다. 방향은 보수적(안전성 파괴 아님)이지만
M3의 헤드라인 주장("cap이 primary backstop") 자체의 정확성 결함이다.

지난 라운드에 잡힌 결함("fan-out이 granted worker 무시 → cap 미바인딩 = M3 주장 거짓")과
**같은 계열**이다 — cap을 신뢰 가능한 backstop으로 만드는 축.

### 수정 방향 (Codex recommendation, 택 1)

**(a) reserve/commit 분리** — 취소 가능 토큰으로 reserve, 대응 Workflow/parallel launch가
개시된 **후에만** commit, prepare/route/budget/fallback 실패 시 release.

**(b) 예약 지점 이동** — 후속 모든 경로가 정확히 granted fleet을 spawn하는 **최종 caller
지점**으로 원자 예약을 옮긴다.

(b)가 더 단순하나 호출부 구조에 종속. (a)는 crash-safety를 위해 release 누락 시 lease 만료가
필요 — 기존 lock lease 패턴(§3.6) 재사용 검토.

### 불변식 (깨뜨리지 말 것)

- **원자성 유지** — Codex F2(M3)가 봉인한 read-then-bump TOCTOU를 되살리지 말 것.
  reserve 결정+기록은 단일 lock 임계구역 안에 남아야 한다.
- **lock 고갈은 fail-safe degrade=1** — fail-open 금지(cap이 유일 backstop).
- **clamp는 전 run 경로** — metered 포함(M3 변경 2번 축).
- read-only firing-preview는 bump 없는 pure `clampForRunaway`를 계속 써야 한다
  (관측이 headroom을 소비하면 안 됨 — `orchestration-preview.test.js`가 정적 검증).

### 회귀 가드

- 기존 원자성 회귀 test `[4,4,1,1,1]` (동시 예약 시퀀스) green 유지
- `orchestration-runaway.test.js` 24건 green 유지
- preview read-only 불변식 test green 유지

---

## Next

```
/mccp:prp-implement   # 위 2건 흡수
/mccp:pr              # 재실행 — PR-Codex가 회귀 확인
```
