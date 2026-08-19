# santa-evidence-diversity M2 — implement-gate notes

> plan 본문(`.claude/plans/santa-evidence-diversity-m2.plan.md`)은 `mccp-plan-codex`
> receipt가 `plan_hash`(`sha256:f1bc8593…`)로 봉인한 대상이라 게이트 산출물을 본문에
> 주입하지 않는다(M1 · santa-adjudication M1~M3 선례). `/mccp:prp-implement` Phase 2.5.4가
> 허용하는 대체 자리에 기록한다. 본문을 편집하면 receipt가 stale이 되어 `/mccp:pr`이
> §3.11 guard 2에 막힌다.

## 진입 배경 — plan 게이트 슬러그 재발행

직전 세션의 plan 게이트는 receipt를 PRD-레벨 슬러그 `santa-evidence-diversity`에
파일링했고, `/mccp:prp-implement`가 도출하는 키는 `santa-evidence-diversity-m2`라
게이트가 "missing"으로 막혔다. **게이트 미실행이 아니라 파일링 불일치**였다 —
receipt의 `plan_hash`가 M2 plan 본문과 바이트 단위로 일치(`f1bc8593…`)했다.

CLAUDE.md §3.15가 파일명 변경(위조)을 금지하므로 같은 본문에 대해 패널을 정상
슬러그로 **1패스 재발행**했다. 본문 무편집.

| 축 | 직전 (`santa-evidence-diversity`) | 재발행 (`santa-evidence-diversity-m2`) |
|---|---|---|
| verdict | `divergent` | `divergent` (세탁 없음) |
| quorum | 0/4 pass · blocking 10 | 3/4 pass · blocking 2 |
| fail 낸 관점 | architect · security · test · invariant | invariant 단독 |
| wall clock | 702s | 696s |
| single-pass | `deferred_to_prd_completion` | `deferred_to_prd_completion` |

**같은 입력에서 두 패널이 갈렸다.** 직전 security HIGH("DD4의 드롭 요건과 Task 2의 전량
`assertContained`가 모순 → 부재 경로에서 라운드 차단")를 재발행 패널의 security 리뷰어는
같은 코드를 읽고 **pass**로 판정했다("execution flow is secure due to downstream
validation"). 앞 판정을 철회하지 않는다 — 그 모순은 `path-containment.js`에서 코드로
재확인된 실재이고 Task 2 구현에서 고친다. 기록하는 것은 *동일 입력에 대한 리뷰어 판정
불안정*이며, 이것이 라운드를 늘리는 대신 적용 후 결과로 판단하라는 §3.15의 근거다.

재발행 패널의 단독 CRITICAL(invariant, "Task 3에 실행 가능한 bash가 없다")은 근거를
붙여 기각했다 — plan `:267-269`가 fail-closed 요건을 **요건으로** 명시하고 Mirror로
`HAS_ASSIGNMENT` 검사를 지목하며(plan `:138`), 그 코드는 Phase 3 EXECUTE의 산출물이지
plan의 산출물이 아니다. Phase 5.5 auto-CRITICAL 카탈로그(secret 노출 · 데이터 손실 ·
비가역 마이그레이션 · auth 우회 · 외부 목적지 변경 · crypto 키) 어디에도 해당하지 않아
게이트 정지 사유도 아니다. 같은 축의 **세 번째 재보고**다. 전문과 나머지 findings는
`.claude/reviews/plan-review-santa-evidence-diversity-m2.md` · backlog 2026-08-19 항목.

## Codex Implementation Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review`
  (fail-closed Bash wrapper, v0.2.2) → `classification=disabled` · `blocking=false` ·
  `durationMs=0`
- **Codex skipped per `MCCP_CODEX_DISABLED=1`** — v0.3.5 first-class skip. env는 user-level
  `~/.claude/settings.json:14`에 상주하는 표준 설치 정책이라 advisory mode(`MCCP_ALLOW_CODEX_UNAVAILABLE`)가
  필요 없고, spawn 직전 short-circuit이라 Codex는 발화하지 않았다.
- 라운드 수: 0 (호출 자체가 skip — `MCCP_GATE_ROUND_CAP=1`)
- `resolution.codex_verdict = 'skipped'`. **cross-gate dedupe는 fail-closed 유지** —
  `dedupe.js#evaluateForDedupe`는 `converged` 외 어떤 값에도 skip을 허용하지 않으므로
  `/mccp:pr`에서 PR-Codex가 ship 시점에 실제로 발화한다.
- 합치 결론: **cross-model 축이 이번 사이클에 발화하지 않았다.** 아래 Security Reviewer가
  그 자리를 대신하지 않는다 — 다른 축이다. 이 한계를 주장하지 않고 그대로 기록한다.

### 2.5.1 cross-gate dedupe — 미적용

plan의 `## Codex Adversarial Review`는 Phase 5.1이 넣은 **placeholder 그대로**다
(`mode=multi-agent`에서는 Phase 5.3 주입이 스킵되고 plan이 동결되므로 정상이다). `합치 결론`
줄이 없어 dedupe 전제가 성립하지 않는다. 2.5.2 이후를 정상 수행했다.

### 2.5.2 구현 시점 결정 (Codex focus로 넘긴 4축)

plan이 사전 확정하지 않은 결정으로 다음 4개를 열거해 focus에 실었다. Codex가 skip돼
반론은 받지 못했다 — 열거 자체는 감사 기록으로 남긴다.

1. `scope-always.js`는 순수 oracle로 유지하고 외부 require는 `path` builtin 1개.
   모든 fs I/O는 `cli.js cmdScopeAlways`가 진다
2. **도출된** Source PRD 경로는 `assertContained`가 아니라 repo 상대 정규화 + `..` 이탈
   거부 + 던지지 않는 존재 확인으로 다룬다. **필수 입력**(`--paths-file`)은 기존
   `assertContained`를 그대로 유지한다 (DD4 ↔ Task 2 모순의 해소 — 아래 Security Reviewer)
3. 발견 단계(`pairs` · `unresolved`) 소유자는 `cmdScopeAlways`다. oracle이 아니다 —
   plan Task 1의 `mergeScope` 반환은 `{paths, added, truncated}` 3키이고 CLI 출력은 7키라,
   그 차이를 만드는 자리를 CLI로 확정한다(패널이 지적한 plan 내부 불일치의 해소)
4. `santa-loop.md` Step 1은 여전히 `SCOPE_PATHS_JSON`의 유일한 생산자이며(M1 DD11),
   `paths`가 배열이 아니면 exit 0이어도 중단한다

### 2.5.4 YAGNI Triage

Codex 미발화로 finding 0건. triage 표 없음. `Open Questions: 없음`.

### impeccable design gate (2.5.5b)

`skill_available=1` · `design_signal=0` → **silent-skip** (`reason=no-signal`).
receipt에 `--impeccable-silent-skip --impeccable-silent-skip-reason "no-signal"`을
forward한다. 이 사이클의 diff에 rendered surface가 없고, Task 7이 건드리는
`renderer/html.js` · `renderer/markdown.js`는 **version 리터럴 1개**뿐이라 구조 · 색 ·
마크다운 마커 · 항목 수가 무변경이다. critique retry loop과 stage-aware routing은
트리거 미발화로 돌지 않았고, 그에 따라 Phase 2.5.5c design-direction capture와
Phase 3.7 grounding verify도 no-op이다.

### Security Reviewer

`Task(security-reviewer)` — 구현 **이전** 설계 리뷰(코드 미존재). 넘긴 축 4개:
untrusted 마크다운 → 파일 경로 도출(path traversal) · containment 정책 분리(DD4 ↔ Task 2) ·
해소 경로가 블라인드 프롬프트로 들어가는 내용 노출 · 자원 고갈(ReDoS · glob · 무한 read).
반환: CRITICAL 1 · HIGH 2 · MEDIUM 4 · LOW 2. **auto-fallback 없음** — 리뷰어가 정상
발화했으므로 receipt에 `security_skipped`를 stamp하지 않는다.

| # | Severity | 항목 | 판정 |
|---|---|---|---|
| 1 | CRITICAL | posix 정규화 후 `..` 잔존으로 repo 이탈 | **흡수 — 구현 제약** |
| 4 | HIGH | `--decision` slug을 통한 glob 주입 | **기각 — 실측 반증** |
| 2 | HIGH→LOW | plan 경로 심볼릭 링크 이탈 | 리뷰어 자체 강등(선행 read가 방어) |
| 7 | MEDIUM | `unresolved` 항목이 `paths`에 남아 프롬프트로 유출 | plan이 이미 요건화 — 구현·test로 확인 |
| 5 | MEDIUM | NUL / 인코딩된 구분자 주입 | 흡수 — NUL 거부 가드(값쌈) |
| 3 | MEDIUM | Source PRD 추출 정규식 ReDoS | 무조치 — `MAX_REVIEWER_BYTES` 선행 상한이 완화 |
| 6 · 8 | LOW | Windows 8.3 dedup · glob ReDoS | 무조치 (6은 정합성 축, 8은 리뷰어 자체 무위험 판정) |

**흡수 1 (CRITICAL)** — plan `:198-199`는 링크가 plan 상대경로면 `planPath` 디렉토리
기준으로 "posix 정규화해 repo 상대로 환원한다"고만 적고 이탈 거부를 명시하지 않는다.
`path.posix.normalize('../../etc/passwd')`는 `../../etc/passwd` 그대로라 정규화만으로는
막히지 않는다. `sourcePrdFrom`은 fs를 모르는 순수 함수라 스스로 realpath를 못 하므로,
**문자열 단계에서** 거부해야 한다. 구현 제약으로 확정한다:

- 정규화 결과가 `..`로 시작하거나 `/../`를 포함하면 `null`
- 절대경로(`/` 시작, `\\` UNC, `X:` 드라이브 문자)면 `null`
- NUL(`\0`) 포함이면 `null` (finding 5 동시 해소)
- 위 4건 각각에 회귀 test를 건다 (UI19 — 불변식마다 test 존재)

**기각 1 (HIGH, 근거 부착)** — finding 4는 "`deriveSantaDecisionId`가 검증하지 않는다면"
이라는 **미확인 전제**를 달고 있었고, 그 전제가 거짓이다. `ledger.js:86-101`이 명시
`--decision`을 `SLUG_RE`로 검사해 실패 시 `SANTA_BAD_SLUG`를 던지며, 주석이 그 이유를
"이 값은 경로 조립에 직접 들어가므로 검증 없는 통과는 디렉토리 탈출이다"로 적어 둔다.
`SLUG_RE`는 `receipt/decision.js:32`의 `/^[a-z0-9][a-z0-9-]{0,80}$/`다 — glob 메타문자
(`*?[]{}`)·`.`·`/`·`_`·대문자를 전부 배제한다. 실측:

```
"santa-evidence-diversity-m2" -> santa-evidence-diversity-m2
"x[!z]y*"                     -> THROW SANTA_BAD_SLUG
"*/../../etc/*"               -> THROW SANTA_BAD_SLUG
"a.b" / "a/b" / "A_b-1" / "x*" -> THROW SANTA_BAD_SLUG
```

throw는 `baseOpts`(`cli.js:113`)에서 **어떤 파일도 열기 전에** 일어난다. 덧붙여 구현은
glob 라이브러리를 쓰지 않고 `fs.readdirSync` + 리터럴 prefix 필터를 쓴다 — 주입 클래스를
설계로 제거한다.

**확인 대상 (MEDIUM 7)** — 결함이 아니라 요건이다. plan DD4가 "존재 확인 실패분은
스코프에서 빼되 `unresolved[]`에 남긴다"로 이미 규정하고 Task 4가
"해소 불가 PRD가 `unresolved`로 가고 `paths`에는 없음"을 단언 대상으로 열거한다.
구현에서 그대로 지키고 그 test를 실제로 건다.

## Task 6 — 게이트 경로 1회 완주 실측 (2026-08-19)

측정 장소는 probe 워크트리 `.worktrees/santa-m2-probe`(브랜치 `santa-m2-probe`, 커밋
`4905d2b`)다. 이 사이클의 작업 트리 내용을 그대로 커밋해 **clean tree**를 만든 이유는
Acceptance의 최소 조건이 "plan과 그 Source PRD가 **diff에 없는 채로** `added`에 나타날 것"인데,
본 워크트리에서는 PRD가 이번 사이클에 편집돼 diff 안에 있기 때문이다. clean tree에서는
`git diff --name-only HEAD`가 비므로 조건이 합성 없이 성립한다(선례: santa-adjudication M3
Task 8의 probe 워크트리).

decision slug은 `santa-evidence-diversity`이며 이것은 **실제 브랜치가 도출하는 값**이다
(본 워크트리에서 `cli.js resolve-decision` → `{"decisionId":"santa-evidence-diversity"}`).
probe 브랜치명이 다르므로 그 슬러그를 `--decision`으로 핀했다.

### (A) 미발화가 아니라 발화 — diff가 비었는데 3건이 들어온다

```
diff scope = []
scope-always exit=0
HAS_PATHS=1
[santa] always-on scope: mode=enforce added=3 pairs=2 unresolved=0 truncated=0
[santa]   + .claude/plans/santa-evidence-diversity-m1.plan.md
[santa]   + .claude/prds/santa-evidence-diversity.prd.md
[santa]   + .claude/plans/santa-evidence-diversity-m2.plan.md
[santa]   pair .claude/plans/santa-evidence-diversity-m1.plan.md -> .claude/prds/santa-evidence-diversity.prd.md
[santa]   pair .claude/plans/santa-evidence-diversity-m2.plan.md -> .claude/prds/santa-evidence-diversity.prd.md
merged SCOPE_PATHS_JSON = [".claude/plans/santa-evidence-diversity-m1.plan.md",
                           ".claude/prds/santa-evidence-diversity.prd.md",
                           ".claude/plans/santa-evidence-diversity-m2.plan.md"]
```

이것이 #125 조건 그 자체다: 변경이 하나도 없는 상태에서도 관계의 **양쪽**이 스코프에 들어온다.
형제 plan(M1)이 함께 들어온 것은 슬러그 매칭이 `<slug>*`이기 때문이고(DD1 Risk 행이 예상한
거동), 두 plan이 같은 PRD를 선언하므로 쌍이 2건이다. `unresolved` 0 · `truncated` 0.

### (B) 상시 경로가 블라인드 프롬프트 본문에 실린다

`lanes --paths-file <merged> --rubric-file <rubric>` → exit 0 · `blindId="A"` · 1201 bytes.
본문 포함 여부(전건 [o]): M2 plan 경로 · Source PRD 경로 · `## Rubric` 섹션 ·
`Plan/PRD consistency` 행 · 정합 문구의 `working tree` · `CRITICAL` · `locations`.

이것이 Acceptance의 최소 조건이며, **스코프에 넣는 것**과 **리뷰어에게 전달되는 것**이
서로 다른 사실이라 둘을 따로 관측했다.

### (C) `off`는 두 축을 함께 끈다

```
MCCP_SANTA_ALWAYS_SCOPE=off →
{"mode":"off","paths":[],"added":[],"pairs":[],"rubricRow":"","truncated":0}
```

`added`와 `rubricRow`가 함께 비는 것이 DD5다. `paths`가 `[]`인 것은 이 probe의 diff가 비어
있기 때문이며(passthrough), 그 상태에서는 `lanes`가 빈 배열을 거부해 라운드가 열리지 않는다 —
M2 이전과 동일한 정상 동작이다. plan 파일은 한 개도 열리지 않았다(발견 단계 진입 전 반환).

### (D) 실패는 중단이지 강등이 아니다 (DD3)

`--paths-file`을 저장소 밖 경로로 주입:

```
scope-always exit=2
stderr: [mccp:santa-cli] path containment refused (PATH_ESCAPES_GATE) — no file was touched.
[santa] scope-always failed (exit 2) — NOT launching reviewers.
reviewers launched = 0
```

Step 1의 `if [ "$ALWAYS_EXIT" -ne 0 ]` 분기가 실제로 exit하며, diff 스코프만으로 진행하는
fallback은 존재하지 않는다.

### 측정하지 않은 것

리뷰어가 실제로 "plan은 M2를 in-progress로 적었는데 PRD는 complete"류의 불일치를 **포착하는지**는
측정하지 않았다. 그것은 LLM 행위라 셸로 단언할 대상이 없고, M2는 어떤 포착률도 주장하지 않는다.
닫은 것은 그 앞 단계 — 관계의 한쪽만 스코프에 드는 구조적 불가능 상태다.
