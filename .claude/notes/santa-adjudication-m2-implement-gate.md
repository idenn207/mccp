# santa-adjudication M2 — implement 게이트 기록 (2026-08-17)

## Codex Implementation Review

> **이 섹션이 plan이 아니라 이 노트에 있는 이유**: `mccp-plan-codex` receipt가
> `plan_hash=sha256:407a9825…`로 plan 본문을 봉인했다(`planAwareMarkdownHash`는 섹션 carve-out을
> 갖지 않는다 — `hash.js:174`가 `markdownHashStructural`로 위임하고 그 함수는 frontmatter 키·
> 체크박스·PR 자리표시자·표 status 토큰만 정규화한다). plan에 섹션을 주입하면 해시가 바뀌어
> 그 receipt가 stale이 되고 `/mccp:pr`의 chain 검증이 hard-block한다. `/mccp:prp-implement`
> Phase 2.5.4가 "plan (또는 notes)"을 허용하므로 여기가 정본이다. M1이 같은 판단을 했다
> (`santa-adjudication-m1-gate.md:9-13`).

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0
- 합치 결론: **Codex는 발화하지 않았다.** `MCCP_CODEX_DISABLED=1`이 셸 env에 설정돼 있어 wrapper가
  spawn 직전 short-circuit했다(`classification=disabled`, `blocking=false`, `durationMs=0` — v0.3.5
  first-class skip). advisory mode(`MCCP_ALLOW_CODEX_UNAVAILABLE`)가 아니라 **env 정책에 의한 의도된
  skip**이므로 `$CODEX_VERDICT='skipped'`로 봉인한다.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | — | — | — | Codex 미발화로 finding 0건 |
- Deferred to backlog: 2 → `.claude/plans/codex-findings-backlog.md`
  (security-reviewer F4 `entries` 무상한 MEDIUM · F8 빈 claim id 접힘 LOW — §3.14대로 MEDIUM 이하는 비흡수)
- Open Questions: 없음. §0 auto-CRITICAL 카탈로그(security boundary · atomic state · schema breakage)
  해당 없음 — security-reviewer가 CRITICAL/HIGH 0건으로 반환했고(아래), 원장 축은 P0 동결 함수를
  건드리지 않으며(DD11 · DD1), receipt schema는 무변경이다(DD12).
- Codex session 참조: 없음 (미발화)

### Security Reviewer

`Task(mccp:security-reviewer)`를 입력 검증·해시 동일성·CLI 인자·fail-closed 게이트·append-only 원장
다섯 축으로 호출했고 **"No CRITICAL/HIGH implementation vulnerabilities detected"** 로 반환했다.
표제에 CRITICAL/HIGH로 열거된 항목들은 취약점이 아니라 **plan이 이미 명세한 요구의 재확인**이라
구현 체크리스트로 흡수한다(각 항목 옆이 plan의 근거 위치다):

1. `coverageOf`는 `issueId`가 비문자열·빈 문자열인 blocking 행을 `missing`에 담아 `covered:false`를
   내야 한다 — plan Task 1 (`:487-492`), 커버리지 39·40·60
2. `analyzeReviewers`의 병합 blocking 행마다 `issueId`가 실려야 한다 — plan Task 2 (2), 커버리지 56
3. `cmdBeginRound`는 `ledger.beginRound` **이전에** `coverageOf`를 불러야 한다 — plan Task 3 (4), 커버리지 43·44
4. `buildEntry`가 `issue_id`를 만드는 **유일한 경로**여야 한다(호출자가 id를 주지 못한다) — plan Task 1 검증 규칙

MEDIUM 2건은 성격이 갈린다. `MCCP_SANTA_LEDGER_SUPPRESSION=off`의 의미("suppression 경로를 타지
않는다"이지 "사후에 suppression을 되돌린다"가 아니다)와 `blocking` 필드가 이제 effective라는 사실은
**코드 주석으로 흡수**했다(M1이 MEDIUM "CLEAN + 문서화 권고"에 대해 내린 것과 같은 처리).
나머지 MEDIUM/LOW 2건은 backlog로 보냈다.

### impeccable

`impeccable-detect.js detect --mode implement` → `skill_available:true` · `design_signal:false` ·
`silent_skip:true` · `reason:no-signal`. M2는 CLI·JSON 표면만 만들고 렌더 표면을 만들지 않으므로
(plan `## Design Routing Guide`가 `renderingSurface=0`을 예고했다) 결정 표의 (1,0,0) 행이다 —
critique retry loop·stage routing 미발화, receipt에 `--impeccable-silent-skip` forward.
M1 receipt도 같은 값이라 `/mccp:pr` chain 검증에서 **warning**(blocking 아님)으로 나타난다.

## 게이트 진입 시 발견한 것 — plan-codex receipt slug 불일치

`/mccp:prp-implement` 진입 시 receipt hook이 `mccp-plan-codex/santa-adjudication-m2` **부재**로
informational ALLOW를 냈다. 조사 결과 게이트는 실제로 돌았고 slug만 어긋나 있었다.

| 축 | 값 |
|---|---|
| 원인 | 이전 세션이 `/mccp:plan`을 **PRD 경로**로 호출 → `derive-decision --args <prd>` = `santa-adjudication` |
| 검증기 | `/mccp:prp-implement <plan>`는 **plan 경로**로 파생 → `santa-adjudication-m2` |
| 실측 | `validate --decision santa-adjudication` → `ok:true` / `--decision santa-adjudication-m2` → `missing` |
| 해소 | 봉인된 패널 proof(`.claude/state/plan-review/proof.json`)를 `plan.md` Phase 5.6b와 **동일한 write 경로**로 `-m2` slug에 재기록 |
| 결과 | 원본 receipt와 3개 필드만 상이 — `decision_id` · 그로부터 파생된 `receipt_hash` · `created_at` |

`plan.md` 본문이 이 경로를 명시적으로 정당화한다("On the panel paths the write above IS the receipt
write, and it is legitimate" — 패널 경로에는 runner가 없고 Codex가 발화하지 않으므로 CLI 플래그가
위조할 in-process intent decision 자체가 존재하지 않는다). 리뷰 자체는 재실행하지 않았다 —
`reviewed_plan_hash`가 현재 plan과 일치하므로 같은 리뷰가 같은 대상을 덮는다.

**M3 착수 시 주의**: `/mccp:plan`을 **plan 경로**로 호출하면 이 불일치가 생기지 않는다.
M1은 그렇게 해서 `santa-adjudication-m1`으로 곧바로 맞았다(`santa-adjudication-m1-gate.md:100`).
