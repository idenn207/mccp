# santa-adjudication M3 — implement-gate notes

> plan 본문(`.claude/plans/santa-adjudication-m3.plan.md`)은 `mccp-plan-codex` receipt가
> `plan_hash`로 봉인한 대상이라 게이트 산출물을 본문에 주입하지 않는다(M1·M2 선례 —
> 두 plan 모두 이 섹션을 갖지 않는다). `/mccp:prp-implement` Phase 2.5.4가 허용하는
> 대체 자리에 기록한다.

## Codex Implementation Review

> **정정(2026-08-18)**: 이 절의 이전 판은 `MCCP_CODEX_DISABLED=1` 정책 하에 작성돼
> "Codex skipped"를 기록했다. 그 env는 이후 두 설정 계층 어디에도 없고(user·project
> `settings.json` 양쪽 확인), 재진입한 implement 게이트에서 **Codex가 실제로 발화**했다.
> 아래는 그 실측 R1이다.

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review --impeccable-available`
  → `classification=ok` · `blocking=false` · `durationMs=102372` · base `main`
- 라운드 수: 1 (`MCCP_GATE_ROUND_CAP=1`. escalate 조건 미충족 — 아래 참조)
- **구조화 verdict: `needs-attention` → `resolution.codex_verdict='divergent'`**
  (`codex-review-payload#deriveGateVerdict`, `source=structured`). free-text 스캔이 아니다.
  divergent이므로 cross-gate dedupe는 **fail-closed**를 유지하고 PR-Codex가 ship 시점에
  실제로 발화한다.
- 합치 결론: **미수렴.** Codex가 HIGH 1건을 냈고 그 지적의 **기전은 정확하다.** 다만 그것은
  구현 결함이 아니라 plan이 DD11에서 명시적으로 선택하고 PRD Risks 2행이 Medium/High로
  사전 등재한 **설계상 수용된 오분류**다. 처방을 절반만 받는다(아래 triage) — 설계 반전은
  근거를 붙여 기각하고, 같은 finding이 함께 권고한 end-to-end negative test는 수용한다.
- Codex session 참조: `threadId=01a0126b-2946-7380-8338-ce899182d25c`

### YAGNI Triage (R1)

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1-a `classifyTarget`의 file-only 일치를 `unknown`으로 바꿔라(설계 반전) | HIGH | REJECT_YAGNI | DD11이 정확히 이 선택지를 검토하고 기각했다 — 라인을 요구하면 대부분이 `unknown`이 되어 terminator가 사실상 죽는다. 근거 file:line은 backlog 행에 |
| F1-b file-only 오분류에 대한 end-to-end negative test 부재 | HIGH | ACCEPT_NOW | 같은 finding의 둘째 권고. 항목 64가 oracle 층에서만 재던 경계(“touched 파일 + 미변경 라인 → `preexisting`”)를 실 git + 실 CLI 경로로 올린다. 항목 88 신설 |

- Deferred to backlog: 1 (F1-a 기각 근거) → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 (§0 auto-CRITICAL 카탈로그 해당 없음 — security boundary·atomic
  state·schema breakage 어디에도 걸리지 않는다)

**escalate 하지 않은 이유**: Phase 2.5.4의 조건은 (a) ACCEPT_NOW ∧ severity ∈ {CRITICAL,
HIGH} **그리고** (b) R1 흡수가 그것을 완전히 해소하지 못함, 둘 다다. F1-b는 항목 88로 R1
안에서 완전히 해소되므로 (b)가 거짓이다. `MCCP_GATE_ROUND_CAP=1`이기도 하다.

**F1이 실재로 닫지 못하는 것을 적는다**: 항목 88은 *경계가 유지됨*을 증명하지 파일 단위
일치의 오분류율을 재지 않는다. 그 비율은 실측 표본이 필요하고, 그것을 얻는 자리는
Task 8 (B)의 `targetsBreakdown` 관측이다. M3은 오분류율에 대해 어떤 수치도 주장하지 않는다.

### 구현 시점 결정 (plan이 미리 정하지 않은 것)

| # | 결정 | 근거 |
|---|---|---|
| I1 | `ledger.js`가 `terminator`를 **지연 require**한다(`assertTerminationMarker`·`terminate` 본문 안에서) | `counter`를 그렇게 부르는 선례와 동형. `terminator.js`는 아무것도 require하지 않으므로 순환은 없지만, 최상단 require를 더하면 P0 모듈의 로드 그래프가 바뀐다 |
| I2 | hunk 파싱은 정규식 1패스가 아니라 **줄 단위 스캔** | 보안 리뷰 권고 2. `git show` 출력을 `\r?\n`으로 나눠 각 줄에 앵커 정규식을 적용한다 — 백트래킹 면이 줄 길이로 한정된다 |
| I3 | rev 파일 내용은 **`.trim()` 후** 형식 검사 | 보안 리뷰 권고 1. 셸이 쓴 파일에 trailing newline이 붙으므로 trim 없이는 정상 rev가 전부 불량으로 떨어진다 |
| I4 | `git show`에 `maxBuffer` 명시 | 보안 리뷰 (d) MEDIUM — 기본 buffer 초과는 throw이고 그 throw가 `check-termination` 전체를 죽인다. 초과는 `{}`(미발화)로 흡수한다 |
| I5 | `check-termination` stdout 키 6종 고정 — `terminate` · `exitReason` · `reason` · `targetsBreakdown` · `classified` · `unresolved` | 커맨드 본문이 `terminate` 불리언에만 분기하고 나머지는 진단이다(DD7) |
| I6 | `TERMINATION_REASONS`는 `ledger.js`가 소유하고 `counter.REASONS.CAP_REACHED` + `terminator.EXIT_REASON.PATCH_CHASING`에서 파생 | Task 4가 지정한 "읽기와 쓰기가 같은 집합" |

### Security Reviewer

`Task(security-reviewer)` — proposed implementation 검토(5축: 인자 주입 · 경로 traversal ·
비신뢰 입력 정규화 · 자원 고갈 · git 실패 흡수의 오용).

**재진입 시 재호출하지 않았다(2026-08-18).** 아래 판정의 대상은 `terminator.js`의 git 호출 ·
경로 · 비신뢰 입력 정규화이고, 재진입 delta(legacy test 기대값 확장 · 문서 3면 · 실경로 probe ·
항목 88)는 **그 표면을 넓히지 않는다** — 새 입력 경로도 새 인자 조립도 없다. 따라서
`security_skipped`는 receipt에 **세우지 않는다**: 리뷰는 건너뛴 것이 아니라 이미 수행됐고,
없는 skip을 기록하면 `/mccp:pr` validator가 참인 fail-closed 신호를 거짓으로 받는다.

**CRITICAL 0건 · HIGH 0건.** 5축 전부 SAFE 판정이고 (d) 자원 고갈만 MEDIUM("설계상 수용" —
git 고유 동작이며 rev는 이미 커밋된 것이라 push 권한이 전제). 권고 2건(rev `.trim()` · 줄 단위
hunk 파싱)은 위 I2·I3으로 흡수했고 MEDIUM 1건은 I4로 흡수했다.

- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | S1 rev 파일 trim 부재 시 정상 rev가 전부 불량 판정 | MEDIUM | ACCEPT_NOW | 같은 편집 자리이고 미흡수 시 terminator가 영구 미발화(조용한 실패) |
  | S2 줄 단위 hunk 파싱 | MEDIUM | ACCEPT_NOW | 같은 편집 자리. 방어적 코딩 비용 0 |
  | S3 `git show` 출력 무제한 | MEDIUM | ACCEPT_NOW | throw가 `check-termination`을 죽이므로 흡수가 fail-closed 방향과 정합 |

- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 카탈로그 해당 없음)

---

## Task 8 — 실 경로 완주 실측 (2026-08-18)

두 부분 모두 **무조건부**로 수행했고 둘 다 충족됐다. 합성 리뷰어 JSON은 쓰지 않았다 —
전 라운드가 실제 리뷰어 2인(Claude opus + Codex `gpt-5.4` CLI, 진짜 model diversity)의
출력이 실제 CLI를 지나 실제 원장에 들어간 결과다.

### (A) 미발화 경로 — 이 저장소, slug `santa-adjudication`

라운드 0에서 Step 4.5가 실제로 실행됐다. `terminate=false` · `reason=round-below-min`
(DD6의 `round < 1`을 지목) · `--prev-fix-rev`는 **넘기지 않았다**(빈 문자열도 아니다).
루프는 M2까지의 동작과 동일하게 NAUGHTY로 진행했고 회귀는 없다. 라운드 0 판정:
`contract=full` · blocking 1건(Codex의 HIGH) · `targetsBreakdown={0,0,1}`.

`unknown` 전량이므로 항목 84의 진단 stderr가 발화했다. **관측된 잡음 1건**: 라운드 0은
직전 패치가 정의상 없어 `patchRanges`가 항상 비고 따라서 전량 `unknown`이 **항상** 성립한다
— 그래서 이 진단은 모든 라운드 0에서 예외 없이 찍히며, 그 자리에서는 "리뷰어 미준수"와
"정상 미발화"를 가르지 못한다(항목 84가 그 구분을 주장하는 것은 라운드 ≥ 1에서다).
severity LOW(문구 잡음, 판정 무영향)이라 §3.14대로 backlog 행이다.

### (B) 발화 경로 — 별도 워크트리 probe, slug `santa-adjudication-m3-probe`

`.worktrees/santa-m3-probe`(브랜치 `santa-m3-probe`, 로컬 전용·미push)에 종자 패치를
심고 5라운드를 돌렸다. 리뷰 대상은 `src/path-guard.js` 한 파일(경로 containment guard)이고,
각 라운드의 "수정"은 직전 라운드 지적을 **불완전하게** 흡수했다.

| round | verdict | blocking | targetsBreakdown | Step 4.5 |
|---|---|---|---|---|
| 0 | NAUGHTY | 4 | `{0, 0, 4}` | `round-below-min` (미발화) |
| 1 | NAUGHTY | 7 | `{6, 1, 0}` | `not-all-round-n-patch` (미발화) |
| 2 | NAUGHTY | 5 | `{4, 1, 0}` | `not-all-round-n-patch` (미발화) |
| 3 | NAUGHTY | 1 | `{1, 0, 0}` | **`terminate=true` · `patch_chasing`** |

(B) 1~5 전건 충족:

1. `check-termination`이 `terminate:true` + `exitReason:'patch_chasing'`.
2. 원장 `state.terminated = {reason:'patch_chasing', at:'2026-08-18T01:59:14.541Z', rounds:4}`
   — 관측 시점 라운드 수에 결속.
3. `begin-round`가 `SANTA_TERMINATED` + exit 2 · `rounds.length` 4 무변경 · `cap` 5 무변경.
   **관측된 순서**: M2의 coverage 선검사가 M3의 종료 선검사보다 **앞서므로**, 미판정
   blocking이 남아 있으면 `SANTA_ADJUDICATION_INCOMPLETE`가 먼저 뜬다. 둘 다 exit 2 ·
   라운드 미개설 · 캡 미소모라 결과는 같지만, `SANTA_TERMINATED`를 보려면 판정을 먼저
   마쳐야 한다. 결함이 아니라 순서다 — 판정 원장이 완결돼야 루프 종료를 선언한다.
4. `seal`이 `resolution.review_verdict='divergent'` · `review_proof.layers.l1='divergent'` ·
   `meta.santa_exit_reason='patch_chasing'` · `review_source='multi-agent'` ·
   `santa_rounds=4`/`santa_entries=17`/`santa_cap=5`로 봉인하고 receipt가 schema를 통과
   (`{ok:true, errors:[]}`). **`resolution.converged`는 `true`였다** — §3.12가 신뢰 불가
   필드로 지목한 그 값이고, 실제 판정은 `review_verdict`에 있다. 실측으로 재확인됐다.
5. `MCCP_SANTA_TERMINATOR=off` + `begin-round` → 라운드 4가 열리고(`rounds` 4→5)
   마커가 `null`로 지워짐 + loud stderr.

증거는 `.claude/reviews/santa-review-santa-adjudication-m3-probe.md` 1개 파일만 M3
브랜치로 가져왔다(§3.8 워크트리 정리를 넘어 살아남는 유일한 표면 — 원장·receipt는
gitignored이거나 working-tree only다). Acceptance (B) 검증 스크립트 green.

### (B)가 실제로 가르쳐 준 것 — 전량 조건은 장식이 아니다

라운드 1·2는 **단 한 건의 `preexisting`** 때문에 미발화했고, 두 번 다 원인은 리뷰어가
결함의 소재를 미변경 줄(시그니처 줄 `:5`, 미변경 return `:21`)로 지목한 것이었다. 오발화는
**0건**이다. 종료는 직전 라운드가 모듈 **전체를 재작성한 뒤에야** 성립했는데, 그것이 바로
patch-chasing의 정의이므로 판정은 옳다. 남는 질문은 보수성의 대가이고 PRD Open Questions에
신규 항목으로 등재했다(처방 후보 (b) = Step 3 프롬프트가 "고치려면 바꿔야 할 정확한 줄"을
요구 — 라운드 2·3에서 시도해 라운드 3의 `preexisting` 0을 얻었으나 **인과는 미확정, 표본 1**).

## PR-Codex R1 — 판정과 봉인 사이의 TOCTOU 흡수 (2026-08-18)

verdict `needs-attention` · finding 1건(HIGH) · **전량 흡수**. 이 라운드는 M3 구현이
끝난 뒤 `/mccp:pr` 게이트에서 실발화했다(dedupe는 implement verdict가 `divergent`라
fail-closed로 닫혀 있었다).

**지적** — `cmdCheckTermination`이 lock 없이 읽어 판정한 뒤(`cli.js:586`) 별도 호출로
`ledger.terminate`를 부르는데(`:634`), `terminate`는 평가된 라운드를 인자로 받지 않고
lock 안에서 그 시점의 `state.rounds.length`에 결속한다(`ledger.js:573`). 그 사이 다른
프로세스가 `begin-round`로 N+1을 열면 마커가 **평가된 적 없는** 라운드에 붙고, 이후
`begin-round`는 `assertNotTerminated`에 막힌다(`cli.js:654`) — 봉인된 종료 사유가
거짓이 되고 미평가 작업이 잘린다.

**판정 — 실재한다.** 기존 멱등 가드(`ledger.js:564`)는 *이미 있는 마커*만 보고 라운드
일치를 검증하지 않으므로 비어 있는 축이 맞다. DD11이 근거를 붙여 기각한 file-only 축과
달리 이것은 **plan이 검토한 적 없다** — DD4와 커버리지 86이 재는 것은 `경로 격리`이지
동시 접근이 아니고, 2026-08-17 backlog 행이 그 구분을 이미 적어 두었다. 폭발 반경은
DD11 축과 같은 계열(한 라운드 이른 종료 + `off` 재개)이지만, §3.14는 HIGH를 그 자리에서
흡수하라고 규정하고 수정이 M3 자신의 표면 안에서 닫히므로 기각할 근거가 없다.

**흡수** — `terminate`가 판정 좌표(`expectedRounds` · `expectedRound`)를 **필수**로 받고
lock 안에서 재확인한다. 어긋나면 write 없이 `{stale:true}`를 돌려주고,
`cmdCheckTermination`은 종료를 **주장하지 않는다**(stdout `terminate:false` ·
`reason:'stale-decision'` + stderr 진단). 기본값을 두지 않은 이유는 그것이 옛 호출자를
조용히 옛(취약) 경로로 보내기 때문이다. 좌표 검사는 멱등 검사보다 **앞**이다 — stale한
호출이 `already`를 받아 가면 호출자가 남의 종료를 자기 것으로 보고한다.

`terminate`는 M3이 신규 추가한 export라(ownership.md:182 "동결 표에 있는가: 아니오")
인자 추가가 변경 프로토콜 1 위반이 아니다. 프로덕션 호출자는 `cli.js:634` 1곳뿐이다.

**술어 단일 정본** — `lastFinalRound`를 `ledger.js`로 옮기고 `cli.js`가 위임한다. 좌표
검증과 판정 대상 선택이 갈리면 가드가 통과시키는 상태와 실제로 판정한 라운드가 어긋난다.

**커버리지 89 신설** — 좌표 부재·범위 밖·타입 불량 6종 throw(원장 무변경) · 봉인 전
라운드가 열린 경우 미봉인 · **라운드 수는 같은데 뒤 라운드가 FINAL이 된** 두 번째 형태 ·
정상 경로 무손상 · cli 배선 원문 일치 4건. 전량 green: santa-adjudication 89/89 ·
santa-loop-cap 48 · santa-gate 10 · santa-seal 13 · santa-review-gate 12.

## PR-Codex R2 — 증거 절단 흡수 · file-only 재보고 기각 (2026-08-18)

verdict `needs-attention` · finding 2건(HIGH×2) · **1건 흡수 · 1건 기각**.

**F2 (흡수) — 절단된 증거가 발화 쪽으로만 틀린다.** `normalizeLocations`는 상한 20에서
순회를 멈추는데(`terminator.js:112`), 잘려 나간 뒤쪽에 patch 밖 location이 하나라도 있으면
그 지적은 `preexisting`이어야 했다. 절단은 그것을 보이지 않게 만들 뿐이고 오차의 방향이
**한 방향**이라, 전량 조건(DD5)이 막아야 할 것을 조용히 통과시킨다 — fail-closed 설계
안의 fail-open이다. 판정 층인 `classifyTarget`이 상한 초과를 `unknown`으로 읽게 했다.
항목 63이 그은 경계(정규화는 판정이 아니다)는 그대로다 — `normalizeLocations`는 무변경이고
개수를 보는 것은 판정이 한다. 유효 원소 수가 아니라 raw 길이로 재는 것은 전수 스캔을
되살리지 않기 위해서이고, 그 보수성은 **미발화 쪽으로만** 틀린다. 커버리지 90 신설.

**F1 (기각) — file-only 일치, 2회째 재보고.** 같은 사이클 안에서 Implement-Codex R1에
이어 두 번째다. 처방("file-only를 `unknown`으로")은 DD11이 검토·기각한 그 선택지이고,
인용된 UI4는 `direction`이라 라인 정밀도를 규정하지 않는다(정밀도 축은 UI10이고 그 부분
이탈은 PRD Risks가 사전 등재한 수용된 trade-off다). 근거는 backlog 2026-08-18 행에
file:line으로 남겼다. **F2와 F1은 같은 함수를 지목하지만 다른 축이다** — F1은 "약한 증거를
받아들이는 것"(설계 선택)이고 F2는 "받아들인 증거를 조용히 버리는 것"(결함)이다.
