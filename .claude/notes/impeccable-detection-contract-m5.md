# impeccable-detection-contract M5 — 게이트 산출물 · 실측 · 라이브 증거

> plan: `.claude/plans/impeccable-detection-contract-m5.plan.md`
> (`plan_hash sha256:2e7c3174…cd870` — **편집 금지**)
> 이 파일이 M5의 게이트 산출물을 소유한다. plan 본문을 고치면 봉인된 plan-codex receipt가
> stale이 되어 `/mccp:pr`이 차단되므로, M1~M4와 같이 게이트 출력은 여기 쓴다.

## 게이트 진입 기록 — 슬러그가 이번에는 맞았다

M4의 진입은 슬러그 불일치(plan-codex가 base 슬러그에 실림) 때문에 §3.16 감사 우회를
썼다. M5는 그렇지 않다 — `/mccp:plan`이 plan 경로로 호출돼 `mccp-plan-codex`가
`impeccable-detection-contract-m5` 슬러그에 실렸고, 진입 검증이 그대로 통과했다.

| 대조 | 값 |
|---|---|
| 이 plan의 `hash-markdown` | `sha256:2e7c31745d1efc5e737f0a8de521a918872fd75524644e98b7cfe29d924cd870` |
| `mccp-plan-codex/impeccable-detection-contract-m5.json` 의 `reviewed_plan_hash` | **동일** |
| `validate --command mccp:prp-implement --decision …-m5 --plan <this plan>` | `ok:true` exit 0 |

plan 게이트의 verdict는 `divergent`가 정직하게 봉인돼 있다
(`review_source=multi-agent`, L2 패널 4/4 중 test·invariant 2건 fail,
`MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion`, `review_wall_clock_ms=902427` ≈ 15분).
§3.15대로 미흡수 지적은 `codex-findings-backlog.md`에 이미 적재됐고, 그 중 둘
(`evidence-debt.js` fail-closed 로더 · L7과 `not-consumed`의 관계)은 아래 Codex R1의
F1과 **같은 축**이라 이번 사이클에서 실제로 흡수했다.

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (§3.16 — 1라운드 기본. `MCCP_GATE_ROUND_CAP=3`은 천장이지 요구가 아니다)
- classification `ok` · `blocking=false` · `durationMs=386290` (6.4분) · 구조화 verdict `needs-attention` → 게이트 verdict `divergent`
- 합치 결론: 설계는 유지 가능하나 **래칫 로더가 fail-open일 수 있다**는 HIGH 1건이 실재했다. 그 축을 R1에서 전건 흡수했고, 나머지 MEDIUM 2건은 §3.14대로 backlog로 이연했다.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — 래칫 로더의 fail-closed 계약 미명시 | HIGH | ACCEPT_NOW | plan은 "빈 목록이 vacuous pass가 되지 않게"만 요구하고 **로더 자체의 실패**(require throw · 배열 아님 · 중복 · 미등록 이름 · 형식 오류)를 다루지 않았다. 그 경로가 열려 있으면 면제 목록이 조용히 전체 면제가 된다 — `lint.js` 헤더가 "읽기 실패는 통과가 아니라 drift"라고 선언한 규약의 정반대. plan 게이트 L2 invariant도 같은 축을 CRITICAL로 지목했다(`id=9c636dcb`). |
  | F2 — `not-consumed` 부재 주장의 범위가 선언 이상을 제외한다 | MEDIUM | DEFER_TO_BACKLOG | 실재한다. `scan.js:38`의 `isExcluded`가 `env-contract`를 **경로 substring**으로 통째로 제외하므로, 그 디렉토리 안의 미래 코드가 `process.env.IMPECCABLE_*`를 읽어도 부재 주장이 유지된다. §3.14대로 MEDIUM은 이연하되 **주장을 부풀리지 않는다** — L10 헤더에 이 한계를 명시해 "부재를 증명한다"가 아니라 "walkSurfaces 범위에서 부재"로 적었다. |
  | F3 — M5 escalation이 M4 task state에 붙어 있다 | MEDIUM | DEFER_TO_BACKLOG | 실재한다(`STATE.md.task_fingerprint`가 `…-m4`인데 `escalate_pending_decision_id`는 `…-m5`). 다만 이 사이클의 정상 진행이 `STATE.md`를 M5로 갱신하므로 별도 코드 변경 축이 아니다. 관측을 backlog에 남긴다. |
- Deferred to backlog: 2 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 (F1을 R1에서 완전 흡수했으므로 2.5.4의 escalate 조건 (b)가 거짓 — R2 미실행)
- Codex session 참조: `codex-invoke` envelope `<gitdir>/mccp/tmp/codex-out.json`

### F1 흡수 — 래칫 로더를 fail-closed로 만든다

`evidence-debt.js`를 "그냥 require해서 이름 집합을 얻는" 모듈로 두면, 그 파일이 사라지거나
throw하거나 모양이 틀렸을 때 L10이 **면제 0건**(전부 red)이 아니라 **구현에 따라 조용한 통과**로
갈 수 있다. 그래서 두 겹으로 닫았다.

1. **모듈 자기 검증** — `evidence-debt.js`가 로드 시점에 스스로를 검사하고 위반이면 **throw**한다:
   배열 아님 · 항목이 `{name, axis}` 형태 아님 · 이름이 `NAME_RE` 불일치 · 중복 ·
   `^(MCCP_)?IMPECCABLE_` 매칭(축 밀어넣기 차단) · registry에 없는 이름.
   test가 아니라 **로드 경로**에 두는 이유는 §3.17이 확인한 사실 때문이다 — 이 저장소의
   test는 어떤 CI도 돌리지 않으므로, test에만 있는 불변식은 커밋을 막지 못한다.
   throw는 lint를 죽이는 것이 아니라 **L10을 red로 만든다**(아래 2가 잡는다).
2. **lint 쪽 fail-closed 로더** — L10이 debt를 `try/require`로 읽고 실패를 `problems`에
   적는다. 실패 시 면제 집합은 **빈 집합**이므로 정방향 검사가 전부 그대로 판정된다 —
   "로더가 죽으면 면제도 죽는다"가 관대한 방향이 아니라 엄격한 방향이다.
3. **미등록 이름 거부** — debt에 registry에 없는 이름이 있으면 red다. 이름이 사라졌는데
   목록에 남으면 래칫이 줄어들지 않은 것이고, 그것을 못 보면 목록이 화석이 된다.

### Design Review

`impeccable-detect.js detect --mode implement --json` 실측(2026-08-23):

```
skill_available=true  design_signal=false  silent_skip=true  silent_skip_reason="no-signal"
impeccable_invocation="impeccable:impeccable"  impeccable_source="plugin"
impeccable_version="4.1.1"  impeccable_shadowed=false  impeccable_eclipsed=[]
```

`SKILL_AVAIL=1 / SIGNAL=0 / DESIGN_INTENT_ACTIVE=0` → 2.5.5b 결정표의 (1,0,0) 행.
디자인 표면이 없으므로(이 milestone은 lint·registry·문서 축이다) critique retry loop도
stage routing도 발화하지 않고, receipt에 `impeccable_silent_skip=true` +
`silent_skip_reason="no-signal"`을 정직하게 forward한다. Phase 2.5.5c 캡처가 없으므로
Phase 3.6·3.7은 구조적으로 no-op이다.

**이것이 PRD Success Metric의 라이브 증거다** — `MCCP_IMPECCABLE_SKILL` **미설정**
상태에서 오라클이 plugin 채널을 찾아 `available:true`와 실제 열릴 본문 경로를 함께 냈다.
env 우회 0건.

### Security Reviewer

`mccp:security-reviewer`를 **호출하지 않았다.** 2.5.5의 조건("auth, crypto, secrets, input
validation, SQL/cmd injection, SSRF, path traversal, privilege escalation")이 발화하지
않는다고 판정했고, 그 판정의 근거를 숨기지 않고 여기 적는다.

- 신규 신뢰 경계 0. 입력은 전부 git-tracked 저장소 내부 데이터(`registry.js`의 RAW 표,
  `evidence-debt.js`의 상수)이고 외부·사용자 입력을 받는 지점이 없다.
- 유일하게 걸리는 축은 **path traversal**이다 — L10이 evidence의 `path:line`으로 파일을
  읽는다. 그러나 이것은 신규 표면이 아니라 **L8이 이미 갖고 있는 표면**이고, L10은 자체
  경로 검사를 만들지 않고 `evidenceLexicalProblem`을 **fs 호출보다 먼저** 재사용한다
  (절대경로 · `..` · UNC · 드라이브 문자 · env 확장 · URL 전부 그 스크린이 거른다).
  통제를 우회하지 않고 재사용하므로 표면이 넓어지지 않는다.
- `measure-evidence.js`는 read-only이며 쓰기 경로가 없다.

판정이 틀렸다면 비용은 이 문단이 감사 앵커로 남는다는 점에서 관측 가능하다.
`security_skipped` 플래그는 **세우지 않았다** — 그 플래그는 Task 도구가 *실패*했을 때의
정직한 표시이지, 조건이 발화하지 않았을 때 쓰는 것이 아니다(세우면 없던 시도를 주장한다).

---

## Task 1 — 착수 전 실측 (2026-08-23, `measure-evidence.js`)

수치는 손으로 센 것이 아니라 스크립트의 출력이다. 그것이 요점이다 — 드리프트를 "고쳤다"고
주장하려면 고치기 전과 후를 **같은 자로** 재야 하고, 그 자가 문서 안의 숫자로만 존재하면
다음 사이클은 재현할 수 없다.

```
$ node plugins/mccp/scripts/lib/env-contract/measure-evidence.js
total 162 (window +/-2)
  A 110      # evidence 행 ±2 안에 이름이 있다 — 계약이 요구하는 상태
  B 28       # 같은 파일 안에 있지만 창 밖 — **낡았다**
  C 24       # 그 파일에 이름이 아예 없다 — **거짓이다**
impeccable axis: 23 — {"B":4,"C":19}
```

### plan의 111/28/23과 다른 이유 (정정)

plan은 A **111** · C **23**으로 적었다. 차이는 정확히 한 항목, `MCCP_PLAN_REVIEW_`다.
plan 시점의 측정은 부분 문자열 일치를 썼고, 그러면 `MCCP_PLAN_REVIEW_BUDGET`이 적힌 줄이
`MCCP_PLAN_REVIEW_`를 인증해 A로 떨어진다. 이 스크립트는 **경계 일치**를 쓰므로 C다.

경계 일치가 옳다 — 부분 문자열 일치는 `MCCP_PLAN_REVIEW_L3`가 적힌 행이 `MCCP_PLAN_REVIEW`를
인증하게 해서 드리프트를 감춘다. 그리고 `MCCP_PLAN_REVIEW_`(status `scan-artifact`, 끝이
밑줄인 접두사 오탐)는 경계 일치로는 **원리상** A가 될 수 없다. 그것이 오분류가 아니라 그
항목의 성질이며, 그래서 `EVIDENCE_DEBT`에 이름째 들어간다. **결과적으로 잔여 debt는 plan이
예상한 28이 아니라 29다** — 숫자를 plan에 맞추지 않고 실측을 적는다.

### impeccable 축 23건의 내역

- **C 19건** — 전부 `impeccable-detect.js:135`(또는 `:256`)를 가리켰다. 그 줄은
  `isDesignSurfacePath()` 내부이고 어느 `IMPECCABLE_*`와도 무관하다.
- **B 4건** — `MCCP_IMPECCABLE_ROUTING_MODE` 118 → **164** ·
  `MCCP_IMPECCABLE_INTENT_COMMANDS` 127 → **173** · `MCCP_IMPECCABLE_SKILL` 301 → **319** ·
  `IMPECCABLE_FORCE_OVERRIDE_REASON` `prp-implement.md` 224 → **702**.

뒤 둘은 plan이 적은 목적지(170 · 437)와 다르다. plan의 두 값은 **그 이름을 언급하는 산문/표
행**이고, 여기서 쓴 값은 **실제로 값을 읽는 줄**이다(`const raw = (env && env.MCCP_IMPECCABLE_INTENT_COMMANDS)` ·
`[ -z "${IMPECCABLE_FORCE_OVERRIDE_REASON:-}" ]`). registry의 필드 계약이 "실제로 읽는 지점"이라
못 박으므로 후자를 따랐다. 둘 다 L10 ±2 창은 통과하므로 이것은 정확성의 문제이지 통과 여부의
문제가 아니다.

### 세 표면 불일치 (plan의 주장 확인)

`MCCP_IMPECCABLE_SKILL`의 실제 read site는 `impeccable-detect.js:319`인데 registry는 `:301`,
`docs/environment/review.md`는 `:135`를 적고 있었다. **셋이 서로 달랐다.** 셋 다 M5가 맞췄다.

### lint 맹점 (이 milestone이 닫는 것)

착수 시점 lint: **L1 `FAIL`**(`MCCP_PLAN_REVIEW_TEST_INVOKE` 미등재 — origin/main `b111dca`
상속분) · **L8 `ok`**. 위 23건 전부가 L8을 통과했다. L8은 형식과 실재만 보기 때문이다.

### 문서 자기모순 · 거짓 주장

- 19개 절이 헤더(`**기본값** 없음`)와 같은 절의 "v1.29.0 원문" 표(`https://impeccable.style` 등)로
  **서로 반대되는 값**을 적었다.
- `IMPECCABLE_VERSION` 절이 "mccp의 `/mccp:setup` dep-check가 fallback hint로 honor"한다고
  적었다. 실측: `plugins/mccp/scripts/` 전체에서 그 이름을 읽는 코드 **0건**. 링크된 plan도
  이동했다(`.claude/PRPs/plans/archived/mccp-setup-command.plan.md`).

### 고치지 않는 것으로 기록 (DD5)

`<사유를 한 문장으로>` 템플릿 오염 비-impeccable 7종 · CLAUDE.md §3.16의
`MCCP_GATE_ROUND_CAP=1` 서술과 `.claude/settings.json`의 실제 값 `"3"`의 불일치(사용자 결정) ·
`EVIDENCE_DEBT` 29건의 축별 소유. 전부 backlog에 이연 기록.

---

## Acceptance — 라이브 산출물 (2026-08-23)

### 1. L1~L10 전부 `ok`

```
$ node plugins/mccp/scripts/lib/env-contract/lint.js
ok   L1 — registry covers the runtime surface
ok   L2 — index and registry agree both ways
ok   L3 — index detail links resolve to file and anchor
ok   L4 — retired names are absent from the runtime surface
ok   L5 — no stale status markers on shipped surfaces
ok   L6 — exclusion table matches its normative doc
ok   L7 — every non-retired toggle anchor carries a valid usage example
ok   L8 — registry evidence is repo-relative and real
ok   L9 — no raw boolean comparisons outside env-contract/
ok   L10 — registry evidence names the toggle it points at
EXIT=0
```

착수 시점은 L1 `FAIL` + L8 `ok`였고, **그 L8의 `ok`가 이 milestone이 닫은 맹점**이다.

착지 후 재측정:

```
total 163 (window +/-2) — A 115 · B 24 · C 5 · not-consumed 19
impeccable axis: 23 — {"A":4,"not-consumed":19}
```

(총계가 162 → 163인 것은 `MCCP_PLAN_REVIEW_TEST_INVOKE` 1행 등재 때문이다.)

### 2. 래칫이 장식이 아님을 실행으로 보인다

**(a) 목록에서 이름 하나를 지우면 그 항목이 붉어진다** — `MCCP_A11Y_AUTO_INVOKE` 행 제거 후:

```
FAIL L10 — registry evidence names the toggle it points at
       MCCP_A11Y_AUTO_INVOKE: evidence plugins/mccp/commands/pr.md:759 does not name it
       within +/-2 lines — move it to the real read site
```

되돌린 뒤 다시 `ok`.

**(b) 로더 자체를 망가뜨리면 아무것도 면제되지 않는다** — Codex R1 F1이 지목한 축을 실행으로
확인했다. `evidence-debt.js`를 `assertShape`가 throw하는 형태로 바꾸자:

```
FAIL L10 — registry evidence names the toggle it points at
       evidence-debt is unusable, so no exemption applies: boom
       MCCP_AUTO_CHAIN_SKIP_PR: evidence ... does not name it within +/-2 lines
       MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER: ...
       MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN: ...
```

즉 **로더가 죽으면 면제도 죽는다.** 관대한 방향이 아니라 엄격한 방향으로 실패한다. 되돌린 뒤
다시 `ok`.

### 3. 오라클과 문서가 모순되지 않는다

```
$ node plugins/mccp/scripts/lib/impeccable-detect.js resolve --json
{"available":true,"reason":"ok","invocation":"impeccable:impeccable","source":"plugin",
 "version":"4.1.1","path":"~/.claude/plugins/cache/impeccable/impeccable/4.1.1/skills/impeccable/SKILL.md",
 "shadowed":false,"eclipsed":[]}

$ node plugins/mccp/scripts/lib/dep-check.js
  impeccable skill: available (plugin v4.1.1, impeccable:impeccable)
  impeccable CLI  : missing  [telemetry only — no gate reads this]
```

`docs/environment/review.md`의 `MCCP_IMPECCABLE_SKILL` 절은 이제 (i) 값이 `available`/`missing`
enum이고 (ii) `available`은 *이름이 해소된다*만 주장할 뿐 *어느 사본이 답하는지*는 주장하지
않으며(그래서 `path`가 `null`) (iii) 이 override는 **외부에 따로 설치한 경우를 위한 장치**라고
적는다. 위 출력과 모순되는 문장이 없다 — 오라클은 env 없이 plugin 채널을 찾아 `source`·`path`를
함께 냈고, 문서는 그 경우 override가 불필요하다고 말한다.

### 4. env 우회 없이 게이트가 발화했다 (PRD Success Metric)

이 사이클의 `/mccp:prp-implement` 실행 자체가 그 관측이다. `MCCP_IMPECCABLE_SKILL` **미설정**
상태에서 2.5.5b 탐지가 돌았고 receipt에 이렇게 봉인됐다:

```
impeccable_skipped               = false
impeccable_skip_reason           = null
impeccable_force_override        = false
impeccable_force_override_reason = null
impeccable_silent_skip           = true
impeccable_silent_skip_reason    = "no-signal"
resolution.codex_verdict         = "divergent"
```

`impeccable_skipped=false`가 요점이다 — M1 이전이라면 CLI 부재만으로 `skipped=true`가 됐을
자리다. `silent_skip=true`는 결함이 아니라 정직한 관측이다(이 milestone은 lint·registry·문서
축이라 디자인 표면이 없다). **env 우회 0건.**

## 주장하지 않는 것

- **다른 축의 29건을 고치지 않았다.** 이름과 소유 축을 적어 각 축이 갚게 할 뿐이다.
- **역방향 검사가 "mccp가 이 변수를 절대 읽지 않는다"를 증명하지 않는다.** `scan.js`가
  `env-contract` 디렉토리를 통째로 제외하므로 그 안의 미래 코드는 보이지 않는다(backlog).
- **이 test들은 어떤 CI도 돌리지 않는다.** 강제 지점은 아래 `## Validation` 로컬 실행이고,
  그래서 "축을 목록에 밀어 넣을 수 없다"는 불변식은 test뿐 아니라 모듈 **로드 시점 throw**에도
  둔다.
- **설치된 plugin cache가 1.31.0(pre-M1)이다.** 검증은 전부 worktree 경로로 직접 실행했다.
  머지 후 `claude plugin update` 필요.
