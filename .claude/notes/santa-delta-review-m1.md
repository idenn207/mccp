# santa-delta-review M1 — 실측 노트 (Task 10 acceptance)

> **1차 증거는 봉인된 receipt이고 이 노트는 그 서술이다**(DD10). 노트가 유실돼도
> `meta.santa_delta_rounds` · `meta.santa_delta_paths_dropped`는 남는다.

- 일자: 2026-08-20
- 대상 버전: `1.30.2` (원래 `1.30.1`; main이 codex-intent-context M2에 그 번호를 발행해 §3.7 forward-only 상향)
- 드라이버: 실제 CLI 하위명령만 사용(내부 함수 직접 호출 0건). 실제 git repo ·
  실제 fix 커밋 · 실제 `git show` hunk · 실제 seal · 실제 receipt.

## 무엇을 실제로 돌렸는가

라운드 2개짜리 santa 루프를 CLI 경로로 완주했다.

| 단계 | 호출 | 결과 |
|---|---|---|
| 라운드 1 | `scope-delta` | `mode=enforce applied=false reason=no-anchor 5→5 revs=[]` |
| 라운드 1 | `begin-round --scope-*` | `roundIndex=0`, 원장에 `{applied:false, reason:"no-anchor", before:5, after:5}` |
| 라운드 1 | `lanes` | `blindId=A`, 범위 없음(`- src/a.js` 형태) |
| 라운드 1 | `record`×2 → `verdict` | `NAUGHTY` (CRITICAL 1건) → `adjudicate absorbed` |
| fix | 실제 커밋 + anchor 파일 | `round-0-fix-rev.txt` |
| 라운드 2 | `scope-delta` | `applied=true reason=null` **5→1** `revs=[<fix rev>]` |
| 라운드 2 | `begin-round --scope-*` | `roundIndex=1`, 원장에 `{applied:true, reason:null, before:5, after:1}` |
| 라운드 2 | `lanes --ranges-file` | 대상 경로 줄 = `- src/a.js:80-120` |
| 라운드 2 | `record`×2 → `verdict` | `NICE` |
| 봉인 | `seal` | `review_verdict=converged`, `santa_rounds=2` |

## Acceptance 4항목 대조

- **(a) 델타가 발화했다** — 라운드 2에서 `applied=true`, `revs`에 실제 fix rev 1건.
  라운드 1은 `no-anchor` passthrough라 UI3(라운드 1 전체 스코프)이 별도 검사 없이 성립했다.
- **(b) `before` > `after`** — **5 → 1**. fix 커밋이 건드리지 않은 4개 파일
  (`src/b.js`~`src/e.js`)이 스코프에서 빠졌다. 확장 범위는 변경 라인 100 기준
  `[80, 120]` — `CONTEXT_LINES`(20)가 앞뒤로 정확히 적용됐다.
- **(c) 프롬프트에 범위가 실리고 상태 단언이 0건** — 조립된 블라인드 프롬프트의
  `## Target paths` 아래가 `- src/a.js:80-120`이고, `PRIOR_ROUND_PATTERNS` 7종을
  프롬프트 전문에 걸었을 때 매치 **0건**. rubric("Every criterion must have an
  objective PASS/FAIL condition.")은 그대로 통과했다 — DD4의 두-목록 분리가
  의도대로 정상 rubric을 죽이지 않는다는 실측.
- **(d) 봉인된 receipt** — `meta.santa_delta_rounds=1` · `meta.santa_delta_paths_dropped=4`.
  schema validate 통과.

## 이 실행이 **덮지 않은** 것 (과대 주장 금지)

- **LLM 리뷰어 발화는 fixture JSON으로 대체했다.** 즉 이것은
  `/mccp:santa-loop` 커맨드 본문의 산문 실행이 아니라 그 본문이 부르는 **CLI 경로**의
  완주다. 본문의 셸 블록(관측 stderr 라인 · `SCOPE_FLAGS` 조립 · `RANGES_FLAG` 조립)은
  `santa-delta-command-body.test.js`의 정적 단언이 배선을 고정하고, 그 test의 천장은
  "배선 누락과 위치 drift"이지 산문 불이행이 아니다. 두 축이 나눠 덮고 어느 쪽도
  다른 쪽을 대신하지 않는다.
- 그래서 위 표의 `scope-delta` 관측 stderr 라인(`[santa] delta scope: …`)은
  이 드라이버에서 **관측되지 않았다** — 그 줄은 CLI가 아니라 커맨드 본문이 낸다
  (CLI는 JSON만 내고 본문이 렌더한다). 설계대로다.
- **탐지율 보존은 재지 않았다.** 이 실행이 보이는 것은 *스코프가 줄었다*이지
  *줄여도 결함을 놓치지 않는다*가 아니다. 후자는 M2 소유이고 합성 fixture조차 아직 없다.
- 실행 환경에서 `MCCP_REVIEW_SINGLE_PASS`를 제거해야 했다 — 이 저장소 자신의
  `.claude/settings.json`이 그것을 켜 두면 `begin-round`가 정상 거부하기 때문이다
  (review-loop-bypass M1 DD5). 축 자체와 무관한 환경 상호작용이다.

## 부수 실측

- **금지 패턴을 원시 출력 전체에 걸면 정상 저장소 경로가 라운드를 죽인다.**
  `.claude/plans/review-loop-bypass-m1.plan.md`가 `/pass(ed)?/i`("by**pass**")에,
  `.claude/agents/refactor-cleaner.md`가 `/clean/i`("**clean**er")에 걸린다. 둘 다 실재
  파일이고 전자는 상시 스코프가 `<slug>*.plan.md`로 끌어오는 부류다. 그래서 검사를
  **스캐폴딩**(줄에서 경로를 뺀 나머지)으로 한정했다 — 같은 동결, 오탐 0.
- **ReDoS 주장 반박** — implement-gate security-reviewer의 HIGH-1이 서술한 그대로의
  적대적 입력(1,202,005자 = `"previous" + 5000공백` × 200 + 200,000공백 + `"round"`)에서
  전체 스캔 20회 = 43.9ms(1회 2.2ms), 실측 200-경로 프롬프트 1000회 = 6.1ms(1회 6µs).
  선형이고 폭발 없음. 근거: 중첩 수량자도 겹치는 교대도 없다.
