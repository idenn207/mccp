# codex-intent-context M3 — gate artifacts

> Plan body is FROZEN. `mccp-plan-codex/codex-intent-context-m3` sealed
> `plan_hash = sha256:3e2e85a4043b306ab82b28e4a667f67e0b47ae31104e7311edf2aebc65375283`,
> and `/mccp:pr` guard 2 re-hashes the plan at ship time — any edit to
> `.claude/plans/codex-intent-context-m3.plan.md` turns that receipt `stale` and blocks
> the PR. So the Implement-Codex gate record lives here, per the M1 / M2 /
> santa-adjudication precedent (CLAUDE.md §3.11 · `prp-implement.md` 2.5.4 allows a
> notes path).

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 결과: `{"ok":true,"classification":"disabled","blocking":false,"advisory":false,"durationMs":0}`
- 라운드 수: 0 (호출 자체가 spawn 직전 short-circuit)

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, first-class).
> `CODEX_VERDICT=skipped` — receipt에 `meta.codex_disabled=true` +
> `meta.codex_skip_reason='codex_disabled'`가 자동 stamp된다. advisory mode가 아니므로
> `MCCP_ALLOW_CODEX_UNAVAILABLE`은 관여하지 않는다.

- 합치 결론: n/a — Codex가 발화하지 않았다. 이 gate의 cross-model 축은 terminal
  `/mccp:pr`로 이월되며, plan gate가 `review_source='multi-agent'`(비-cross-model)라
  cross-gate dedupe도 열리지 않는다. 즉 PR-Codex는 반드시 발화한다.
- YAGNI Triage: n/a (findings 0건)
- Deferred to backlog: 0 (이 gate 발) — 단, plan gate가 남긴 7건은 이미
  `.claude/plans/codex-findings-backlog.md` L402-408에 적재돼 있고, 그중 구현으로
  흡수되는 항목은 아래 "Plan-gate findings 흡수" 절에 기록한다.
- Open Questions: 없음
- Codex session 참조: n/a (spawn 없음)

### Implement-time decisions (2.5.2)

plan이 미리 확정하지 않은 것들 — Codex가 꺼져 있어 리뷰 대상이 되지 못했으므로 근거를
여기 남긴다.

| # | 결정 | 근거 |
|---|---|---|
| D1 | 브리지 아티팩트(`codex-verdict`·`codex-class`)를 **먼저** 쓰고 `l3.json`을 **마지막에** 쓴다 | `l3.json`의 존재가 곧 나머지 둘의 존재를 함의하게 만든다. 3-파일 원자성은 POSIX에 없으므로 순서로 대체한다(아래 F-arch-1 흡수) |
| D2 | 셋 중 하나라도 쓰지 못하면 exit 12 | plan Task 2의 단수 "레코드"를 3-파일 전체로 못박는다(F-inv-2 흡수) |
| D3 | nonce는 **레코드 안**(`run_nonce` 필드)에 싣고, 경로에는 넣지 않는다 | DD6이 정한 형태. 5.2f의 poll이 파일 존재가 아니라 필드 일치로 수용한다(F-inv-1 흡수) |
| D4 | `codexInvoke.invokeAdversarialReview`를 in-process로 부르되, test는 `--invoke-module`로 대역을 주입한다 | 네트워크 0. `require()` 경로 주입이 monkey-patch보다 격리가 명확하다 |
| D5 | `l3` 서브커맨드는 receipt/adjudication/lock을 갖지 않는다 | DD2 그대로. 차단 지점을 하나로 유지 |
| D6 | 5.2f deadline 1000s · poll 10s · spawn grace 30s | codex 900s + 여유. 5.2z의 실측된 규율과 같은 형태 |

### Plan-gate findings 흡수 (§3.14 — HIGH/CRITICAL만 그 자리에서)

plan L2 패널 7건(backlog L402-408). plan 본문은 봉인돼 있어 고칠 수 없으므로 **구현에서**
흡수한다 — 지적 대부분이 "plan이 X를 명세하지 않았다"이고, X를 구현이 올바르게 정하면 닫힌다.

| Finding | Sev | 처리 | 어디서 |
|---|---|---|---|
| test: hybrid 단독 설정 = 에이전트 0개 HALT가 test로 단언되지 않음 | HIGH | **흡수** — command-body test에 5.2a-0 배선 단언 + `mode` 오라클 test | Task 3 · Task 6 |
| test: 라이브 산출물 3종을 검증할 harness 부재 | HIGH | **부분 흡수** — Task 8 라이브 완주로 확인하고 결과를 정직 기록. 산출물 검증 스크립트는 신설하지 않음(YAGNI: 1회성) | Task 8 |
| test: Task 6의 3개 단언이 아직 없음 | HIGH | **흡수** — 그 3건이 곧 Task 6의 작업이다. 추가로 `l3` 배선 단언 2건 | Task 6 |
| invariant: Task 4의 Mirror가 nonce-in-path를 가리켜 오도적 | HIGH | **흡수** — 5.2f를 nonce-in-record로 명시 구현하고 Mirror 서술을 그에 맞춰 쓴다(D3) | Task 4 |
| architect: 3-파일 tmp+rename은 원자적이지 않음 | MEDIUM | **흡수**(비용 0) — 순서로 닫는다(D1). MEDIUM이라 §3.14상 의무는 아니나 한 줄이면 끝난다 | Task 2 |
| invariant: Task 2의 exit-code 계약이 3-파일에 대해 미명세 | MEDIUM | **흡수**(비용 0) — D2 | Task 2 |
| invariant: Task 4가 nonce 생성/검증 절차를 pseudo-code 없이 둠 | MEDIUM | **흡수**(비용 0) — 5.2f에 실제 shell로 작성 | Task 4 |

기각 0건. 강등 0건.

### Security Reviewer

(아래 절에 기록)

### Design Review

(아래 절에 기록)

---

## Design Review (2.5.5b)

`impeccable-detect.js detect --mode implement --json` →

```json
{"skill_available":true,"cli_available":true,"design_signal":false,"signal_files":[],
 "mode":"implement","reason":"no-signal","silent_skip":true,"silent_skip_reason":"no-signal"}
```

`SKILL_AVAIL=1 · SIGNAL=0 · DESIGN_INTENT_ACTIVE=0` → 결정표의 silent-skip 행. critique
retry loop 미실행, stage-aware routing 미실행, 2.5.5c grounding capture 미실행(trigger
미발화). receipt에 `--impeccable-silent-skip --impeccable-silent-skip-reason "no-signal"`
forward.

> [mccp:impeccable] silent-skip reason=no-signal · implementation declares no design surface (whitelist hit 0)

**이것은 detector의 시점 gap이며 plan이 이미 예고한 것이다.** plan `## Design Critique`
절의 LOW 관찰 2번: 게이트 진입 시점의 diff는 비어 있고(소스 변경 0), Task 9의 version
문자열 치환이 `renderer/html.js`·`renderer/markdown.js`를 건드리는 것은 그 뒤다. plan
게이트에서는 같은 detector가 `design_signal=true`를 냈고 critique loop이 **CONVERGED**로
판정했으므로(4 anchor 전건 무위반, 근거는 plan 본문의 표) 이번 변경의 디자인 축은 이미
판정을 받았다. 여기서 loop을 다시 돌릴 근거가 없다 — 렌더 표면 변경은 version 문자열
2건이 전부이고, 그 drift는 `i18n-surface.test.js`가 기계적으로 잡는다.

---

## Security Reviewer (2.5.5)

`Task(mccp:security-reviewer)` — "review proposed implementation" — 5개 축을 지정해 공격
요청(Codex 출력 신뢰경계 · `--review-dir` 봉쇄 · `writePrivate` 패턴 · nonce 취급 ·
detached spawn). 5건 반환: CRITICAL 1 · MEDIUM 2 · LOW 2.

### F1 (CRITICAL 주장) — `--focus`를 통한 셸 주입

**부분 흡수 · 제시된 기전은 오류, 잔여 위험은 실재.**

리뷰어의 핵심 주장은 이것이다: *"`$FOCUS`가 이미 위험한 문자열로 설정돼 있으면 큰따옴표는
공백 분할은 막지만 **명령 치환은 막지 못한다**."* 이는 POSIX 셸 의미론상 **거짓**이다.
매개변수 확장의 결과값은 명령 치환을 위해 재스캔되지 않는다(`eval` 없이는):

```
$ FOCUS='$(id)`id`'; printf '%s\n' "$FOCUS"
$(id)`id`
```

따라서 `--focus "$FOCUS"`는 값이 무엇이든 안전하고, 이미 argv로 전달되므로
`parseArgs`가 문자열로 받는다. 그 경로에 결함은 없다.

**그러나 리뷰어가 가리킨 방향에는 진짜 변종이 있다** — 커맨드 본문에서 focus는 변수가
아니라 **LLM이 마크다운에 직접 써 넣는 리터럴**이다(5.2z가 정확히 그 형태:
`--focus "challenge the following plan decisions: <list 1-3 key decisions from the plan>"`).
거기서는 그 텍스트가 *셸 소스*이므로, 저자 LLM이 plan 인용문에 백틱이나 `$(`나 `"`를
포함시키면 실제로 확장·주입된다. 선재 결함이고 5.2z에도 있다.

**흡수**: 5.2f는 focus를 **인용된 heredoc**(`<<'L3FOCUS'`)으로 파일에 쓰고 그 파일을
읽어 `"$FOCUS"`로 넘긴다. 인용된 heredoc은 본문에 대해 **어떤 확장도 수행하지 않으므로**
LLM이 무엇을 써 넣든 불활성이다. 5.2z 쪽 동일 변종은 이 milestone 사거리 밖(mode=codex
경로는 diff 사거리 밖 — plan Risks 2행)이라 backlog.

### F2 (MEDIUM) — `--review-dir` 신규 디렉토리 TOCTOU

**이미 흡수됨(리뷰 시점에 구현이 병렬 진행 중이었다).** `cli.js#cmdL3`는 리뷰어가 권고한
바로 그 형태다: contain → `mkdirSync` → **재-contain**. 두 번째 호출은 실재하는 경로에
대해 돌므로 `realpathSync`가 실제로 해석되고, 첫 호출의 ENOENT 완화(lexical only)에
기대지 않는다.

잔여: 재-contain과 각 write 사이의 창은 남는다. `rename(2)`가 목적지 심링크를 따르지
않고 교체하므로 write-through는 불가하고, `.claude/state/`에 쓰기 권한을 가진 로컬
적대자는 §3.13.2가 명시한 **단일 신뢰 사용자 위협모델 밖**이다. 조치 없음.

### F3 (LOW) — 0o600 검증 test 부재

**흡수(비용 0).** Task 7에 mode 단언 추가. 단 `process.platform !== 'win32'` 가드 —
Windows는 POSIX mode 비트를 재현하지 않아 무조건 단언하면 이 개발 환경에서 red가 된다.

### F4 (LOW) — nonce가 argv에 노출

**무조치 — 리뷰어 자신의 결론과 일치.** nonce는 capability token이 아니라 staleness
discriminator다. §3.6의 stdin-pipe 모델은 *권한*을 나르는 토큰을 위한 것이고, 이 값은
그것을 나르지 않는다(일치해도 아무 권한도 얻지 못한다 — 판정은 `decide`가 소유).
`SAFE_TOKEN_RE` 형태 검사는 노출과 무관한 별개 이유(JSON·메시지에 임의 값이 실리는 것)로
넣었다.

### F5 (MEDIUM) — verdict enum이 과허용

**기각 + backlog(증거 첨부).** 리뷰어는 `REVIEW_VERDICT_VALUES` 5종 대신 `deriveGateVerdict`가
실제 낼 수 있는 3종(`converged|divergent|unavailable`)으로 좁히라고 권고한다. 채택하지
않는다 — 이 검사의 대상은 *생산자가 무엇을 내는가*가 아니라 *하류 필드가 무엇을 받는가*다.
`review_proof.layers.l3`는 `REVIEW_VERDICT_VALUES`로 검증되므로(`review-verdict.js:47`)
그 집합이 정확한 상한이고, 생산자 구현에 결속하면 `deriveVerdict` 주입 대역이나 향후
payload 오라클 변경마다 이 검사가 거짓 거부를 하게 된다. 과허용된 2종의 실제 위험도 0이다:
`critical`은 `decide.js:314`가 명시 분기로 처리하고(verdict 그대로 승계, source hybrid),
`skipped`는 같은 파일 `:300`의 `ran` 술어가 배제한다. 즉 둘 다 안전하게 처리되는 값이다.
`unavailable`은 애초에 이 코드가 `invoked:false`로 접으므로 도달하지 않는다.

Backlog 등재: 생산자-소비자 어휘 정렬을 별도 축으로 다룰 값어치는 있다(어느 쪽이 SSoT인지
문서화 부재).

---

## Task 8 — 라이브 완주 실측 (2026-08-21)

`MCCP_PLAN_REVIEW=hybrid MCCP_PLAN_REVIEW_L3=1` 조건에서 5.2f의 shell 블록을 **커맨드
본문 그대로** 실행했다. Codex는 이 저장소 정책상 `MCCP_CODEX_DISABLED=1`이므로 이 호출
한 건에만 `MCCP_CODEX_DISABLED=0`을 주었다(설치·인증은 정상: companion 1.0.6 해석됨).

### 무엇이 실제로 성립했나

**Acceptance (1) — 성립.** 2회 실행 모두 `l3.json`이 `invoked:true` + enum 안의 verdict를
산출했다. detached 실행 → nonce 대조 poll → 아티팩트 4종이 전 구간 실작동.

```json
{
  "invoked": true,
  "verdict": "divergent",
  "reason": "classification=ok verdict-source=structured",
  "run_nonce": "4f947372-c639-4596-bdfd-e3674753df5e"
}
```

아티팩트 4종 (write order):

```
codex-class
codex-verdict
l3.json
l3-findings.json
codex-verdict = [divergent]
codex-class   = [classification=ok verdict-source=structured]
```

**Acceptance (2)(3) — 미성립, 사유 기록.** receipt 축(`review_source='hybrid'` +
`review_proof.layers.l3` + `meta.review_l3_invoked`/`review_l3_reason` +
`resolution.codex_verdict`)은 `/mccp:plan` **전체** 완주를 요구한다. 하지 않았고 이유는
둘이다:

1. **L2 패널이 이 plan에 대해 비수렴이다.** 실제 게이트 실행이 `divergent`(quorum 4/3
   미충족, 7 blocking)를 냈고 receipt가 그 상태로 봉인돼 있다. 그 상태에서 `decide`는
   hybrid 승인 경로에 진입하지 않으므로, 전체 완주를 해도 (2)(3)이 요구하는 *converged*
   hybrid receipt는 나오지 않는다.
2. **재실행이 파괴적이다.** 같은 plan으로 `/mccp:plan`을 다시 돌리면
   `mccp-plan-codex/codex-intent-context-m3.json` — 바로 이 implement 게이트가 검증에
   통과시킨 receipt — 를 덮어쓴다.

대신 그 leg를 **분해해서** 확인했다. 5.6b가 실제로 실행하는 추출 줄을 라이브 아티팩트에
그대로 먹였다:

```
REVIEW_L3_REASON=[classification=ok verdict-source=structured]
```

비어 있지 않으므로 `--review-l3-reason`이 실제로 붙는다. 그 값이 receipt에 stamp되는
것은 `plan-review-write-invariants.test.js:339-349`가 실제 `write.js`로 단언하고,
5.6b가 그 플래그를 forward하는 배선은 command-body test M3(g)가 단언한다.
**초록 test를 완주로 바꿔 부르지 않는다** — (2)(3)은 미달이고 위가 그 대체 증거다.

### 라이브가 아니면 못 찾았을 것 — findings 유실 (구현 중 흡수)

1회차가 `divergent`를 냈는데 **무엇에 대한 이견인지 읽을 방법이 없었다.** `l3.json`은
verdict와 reason만 싣고 `record.js#readL3`(:105-111)이 정확히 그 둘만 읽으므로 5.2h는 한
단어를 출력한다. Codex의 findings는 파싱된 뒤 그 단어로 접혀 버려지고 있었다. 그런데
5.2f 산문은 "L3의 findings는 5.2h를 통해 운영자에게 도달한다"고 적고 있었다 — 어떤 코드
경로에서도 참이 아니었다.

`l3-findings.json`(4번째 아티팩트, `l3.json` **앞**에 써서 순서 계약 유지)으로 닫고 5.2f
산문을 정정했다. `record.js`가 그것을 리뷰 레코드 표에 싣는 것은 `Files to Change` 밖이라
backlog로 이연했다. 2회차에서 findings가 실제로 남았고, 그 덕에 아래 triage가 가능했다.

### L3-Codex R1 triage (§3.14 — HIGH/CRITICAL만 그 자리에서)

라이브 리뷰가 낸 실제 findings 2건. 둘 다 `severity: high`, `confidence: 0.99`.

| # | 제목 | 처리 |
|---|---|---|
| F1 | 동시 writer가 다른 run의 브리지 아티팩트와 짝지어진 유효 `l3.json`을 만들 수 있다 | **흡수** |
| F2 | nonce 자체가 공유 가변 상태라 한 run이 다른 run의 결과를 수용할 수 있다 | **기각 + 증거** |

**F1 흡수** — 지적이 정확하다. 고정명 4종이 독립 rename되므로 A:codex-verdict →
B:codex-verdict → A:l3.json 순서가 가능하고, A의 poll은 nonce 일치로 수용하는데 5.6b는
B의 브리지 파일을 읽는다. 흡수는 리뷰어가 제안한 manifest/staging 재설계가 아니라 **더
작은 쪽**을 택했다: hybrid에서 5.6b가 verdict를 브리지 파일이 아니라 **poll이 수용한 바로
그 `l3.json`**에서 읽는다(3줄). 그러면 봉인되는 verdict와 수용된 레코드가 구성상 같은
run의 것이다. `mode=codex`는 무변경 — 5.2z가 유일 생산자이고 `l3.json`이 없으며, 건드리면
DD5가 사거리 밖으로 뺀 경로를 다시 끌어들인다.

**F2 기각(증거 첨부)** — 기전은 맞다. 그러나 이것은 **L3 결함이 아니라 `REVIEW_DIR`
전체의 성질**이다. 그 디렉토리는 `l1.json` · `l2.json` · `decision.json` · `proof.json` ·
`reservation.json` · `mode.json`이 전부 공유하는 singleton이고(증거: `plan.md` Phase 5.2
진입의 `rm -f` purge 목록), 한 worktree에서 게이트 둘을 겹쳐 돌리면 L3가 존재하기 전에
이미 비정합이다. plan DD6도 이를 "선재 한계, 신규 축 아님"으로 미리 명시했다. 실제 해소는
5.2 전체 lock 또는 nonce-scoped staging + manifest이며 둘 다 UI1("배선만")과 DD5를 넘는다.

**다만 F2가 옳게 지적한 것 하나는 고쳤다 — 주장이 과했다.** DD6·내 문서 초안이 nonce가
"stale/**동시 실행**을 가른다"고 적고 있었는데, 가르는 것은 stale뿐이다. 3면(plan.md 5.2f
주석 · gate-design.md · CLAUDE.md §3.13.3)에서 그 문장을 정정하고 동시 게이트는 worktree를
나누라고(§3.8) 명시했다. 없는 보장에 기대는 사람이 없도록 하는 것이 기각의 조건이다.
