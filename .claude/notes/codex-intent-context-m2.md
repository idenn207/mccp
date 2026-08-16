# Implement-Codex 게이트 기록 — codex-intent-context M2

> `/mccp:prp-implement .claude/plans/codex-intent-context-m2.plan.md` Phase 2.5 산출물.
> plan 본문이 아니라 notes에 있는 이유는 말미 "섹션 위치 편차" 참조.

## Codex Implementation Review

> Codex skipped per `MCCP_CODEX_DISABLED=1` (env-level policy, first-class)

- 호출: `node <plugin-root>/scripts/lib/codex-invoke.js adversarial-review` → `classification=disabled`, `blocking=false`, `advisory=false`, `durationMs=0` (spawn 직전 short-circuit, v0.3.5)
- 라운드 수: 0
- 합치 결론: **미판정** — Implement-Codex가 실행되지 않았다. 아래 implement-time 결정들은 cross-model 적대 검증을 **받지 않은 상태**다.
- YAGNI Triage: 해당 없음 (Codex finding 0건)
- Deferred to backlog: 0
- Open Questions: 없음 (Codex 리뷰 미실행)
- `resolution.codex_verdict`: `skipped` — 승인이 아니다. cross-gate dedupe는 `converged`만 인정하므로 `/mccp:pr`에서 PR-Codex가 실제로 발화한다.

### Implement-time decisions (plan이 사전 확정하지 않은 항목)

cross-model 리뷰를 못 받았으므로 **무엇이 검증되지 않았는지**를 명시적으로 남긴다.

| # | 결정 | plan이 정하지 않은 부분 |
|---|---|---|
| D1 | `stripQuotedStructures`의 내부 상태 표현 | 단일 `htmlState` 객체(`{endRe\|blankTerminated}`)로 type 1~7을 통합할지, 타입별 개별 플래그를 둘지 |
| D2 | 주석 시작 지점의 앵커 범위 | CommonMark type 2는 줄 선두 앵커이지만, 현재 shipped 동작은 **줄 중간** `<!--`도 잡는다. 후자를 보존한다(줄 선두로 좁히면 `"prose <!--\nINTENT: none"`이 거짓 주장이 되어 fail-open 방향으로 후퇴) |
| D3 | `stripHtmlBlocks` 전체-텍스트 선처리의 존치 | DD6은 **주석만** 라인 루프로 옮기라고 지시한다. `<blockquote>` 쌍이 빈 줄을 포함할 때 type-6 규칙만으로는 빈 줄에서 블록이 끝나 뒤따르는 인용이 살아나므로, 이 선처리는 **유지**한다 |
| D4 | `ARBITER_PROJECTION_KEYS` 의 export 형태 | 배열(frozen) + `Object.keys` 등가 비교. Set이면 test의 등가 단언이 순서 없는 비교를 별도로 구현해야 한다 |
| D5 | `buildArbiterTaskPrompt` frozen 템플릿의 실제 문구 | plan은 "plan 섹션명을 문구로도 부르지 않는다"만 정한다 |
| D6 | e2e 대역(stub) 주입 메커니즘 | runner를 child process로 띄우고 arbiter 자리를 파일 쓰기로 대신하는 형태 vs. in-process DI |
| D7 | `schema.js` 페어링 검증 블록의 배치 | M1.5 mislabel 블록 뒤 신규 M2 블록 |
| D8 | `validate-cmd.js` 강등 문구의 삽입 지점 | `recoveryFor…`의 공통 tail 앞/뒤 |

### Security Reviewer

`Task(security-reviewer)` 실행됨 — "review proposed implementation: input validation and trust-boundary design". 반환: HIGH 1 · MEDIUM 7 · LOW 1 (CRITICAL 0).

**CRITICAL/HIGH 미해소 0건** — 유일한 HIGH(H1)는 이 사이클에서 흡수하며 등급 하향 근거를 함께 남긴다. 따라서 `[MCCP-GATE-STOP]` 조건 미충족.

| ID | Sev | 지적 | 처리 |
|---|---|---|---|
| H1 | HIGH→MEDIUM | 강등 쓰기의 TOCTOU — `EEXIST` 재-probe와 덮어쓰기 사이에 늦은 arbiter의 rename이 끼면 유효 산출이 지워지고 `author`로 기록된다 | **인정 + 흡수**. Task 11의 셸 계약을 "probe 프로세스 → 쓰기 프로세스" 2단계에서 **재-probe와 조건부 쓰기를 한 `node` 프로세스**로 합쳐 셸 레벨 간극을 제거한다. 등급 하향 근거 3: (a) 오류 방향이 **자기불리**다 — 분리를 과소 주장할 뿐 거짓 `subagent`를 만들 수 없다, (b) 덮어쓴 경우에도 실리는 것은 M1 바인딩을 통과한 저자 adjudication이라 무효 산출이 ship되지 않는다, (c) 창을 만들 수 있는 주체는 늦은 arbiter 자신뿐이고 그 밖의 행위자는 DD10 위협모델 밖이다 |
| M1 | MEDIUM | `arbiter_degraded.from/to` 열거 검사가 homoglyph를 통과시킨다 | **기각(오독)**. 닫힌 enum에 대한 **엄격 일치**는 homoglyph를 통과가 아니라 **거부**시킨다. 그리고 NFKC는 Cyrillic→Latin을 접지 못한다(CLAUDE.md §3.13 실측 — `ignоre`의 U+043E 불변). 정규화를 넣으면 통제가 강해지는 게 아니라 근거 없는 단계가 하나 는다 |
| M2 | MEDIUM | `intent_items`에 `_meta.source_path` 같은 중첩 필드가 있으면 경로가 샌다 | **부분 인정**. 현 경로 누출은 **없다** — `extractIntentSection`이 `items.push({id, text, kind})`로 닫힌 3키를 리터럴 생성한다(`intent-context.js:416`). 그러나 whitelist 원칙(“blacklist가 아니라 whitelist인 것이 핵심”)은 최상위·`findings[]`뿐 아니라 items에도 적용되어야 미래 형태 변경에 견딘다 → **Task 3(b)에 items 명시 투영 + Task 4에 등가 단언 추가** |
| M3 | MEDIUM | `arbiter_degraded.reason`에 XSS/injection 위험 | **기각**. 이 필드를 소비하는 renderer가 없고(`html.js`·`markdown.js`는 `intent_*`를 읽지 않는다) JSON 직렬화가 이미 이스케이프한다. 입력에서 `<`·`&`를 거부하면 `"Task returned <no result>"` 같은 **정당한 사유**가 막힌다 — 출력 컨텍스트 이스케이프는 소비처의 책임이지 입력 검증의 책임이 아니다 |
| M4 | MEDIUM | probe의 stderr가 경로를 노출한다 | **기각**. DD5 4번이 "사유는 stderr"를 **명시적으로 요구**한다. stderr를 `/dev/null`로 보내면 probe 크래시가 진단 불가가 되고, 그것이 정확히 이 절이 없애려던 "조용한 정지"다. 로컬 운영자 자기 터미널로의 경로 출력은 disclosure가 아니다 |
| M5 | MEDIUM | `stampIntentDecision`이 schema 검증을 호출하지 않아 페어링 위반이 디스크에 남을 수 있다 | **기각(실측)**. `write.js:765`가 디스크 이전에 `validate(receipt)`를 호출하고 실패 시 `SCHEMA_INVALID`를 throw한다. restamp 경로(`:949`)도 동일하다. `buildReceipt`를 통째로 우회하는 caller는 DD4가 이미 범위 밖으로 선언한 동일 권한 Node caller 축이다 |
| M6 | MEDIUM | arbiter의 도구 제한이 문서/등록에만 존재한다 | **plan에 이미 있음** — Task 4 (f)가 frontmatter를 파싱해 `tools === ['Write']` 등가를 단언한다. 추가 조치 없음 |
| M7 | MEDIUM | runner에 나중에 env fallback이 생기면 봉인이 갈라진다 | **plan에 이미 있음** — Task 9 (5)가 소스 스캔 0회를 단언한다. 제안된 **코드 주석**(`DD5#1: ENV NOT READ HERE, by design`)만 추가로 채택 |
| L1 | LOW | awaiting 임시 파일에 PII가 담길 수 있고 world-readable이다 | **기각(실측)**. `writePrivate`가 `mode: 0o600`으로 쓴다(`plan-codex-runner.js:62`, `:76-80`). 이미 owner-only다 |

### Design Review

> impeccable silent-skip: `design_signal=false`, `reason=no-signal`, `skill_available=true`

`impeccable-detect.js detect --mode implement`가 이 시점의 diff에서 렌더 표면을 찾지 못했다(`silent_skip=true`). `MCCP_DESIGN_INTENT_REASON` 미설정이라 3축 트리거 전부 미발화 → SKILL first-step / critique retry loop / stage-aware routing / Phase 2.5.5c grounding capture **전부 미실행**. receipt에 `impeccable_silent_skip=true` + `reason=no-signal`이 봉인된다.

이 milestone의 렌더 표면 변경은 `renderer/html.js` page-foot와 `renderer/markdown.js` derived 줄의 **version 문자열 2건**뿐이며(Task 12), 게이트 진입 시점에는 아직 미착지라 detector가 못 본 것이 정상이다.

## 섹션 위치 편차 (WHAT / WHY)

**WHAT** — 2.5.4는 `## Codex Implementation Review`를 plan 본문에 주입하라고 지시한다. 이 사이클은 그 절을 **plan이 아니라 이 notes 파일**에 썼다.

**WHY** — plan 본문을 건드리면 `mccp-plan-codex` receipt가 stale이 되어 게이트가 자기 자신을 막는다. 실측:

```
$ cp plan.md /tmp/probe.plan.md && printf '\n## Codex Implementation Review\n\n- probe\n' >> /tmp/probe.plan.md
$ node .../cli.js validate --command mccp:prp-implement --decision codex-intent-context-m2 --plan /tmp/probe.plan.md
{ "ok": false, "stale": [ { "gate_id": "mccp-plan-codex",
    "reason": "plan file hash differs from receipt (plan changed since gate)",
    "receipt_plan_hash": "sha256:9e22d72b…", "current_plan_hash": "sha256:10109025…" } ] }
EXIT=2
```

`validate-cmd.js:363-375`가 `--plan`이 주어질 때 **모든** upstream 게이트의 `plan_hash`를 현재 파일과 대조하므로, 2.5.4의 주입이 2.5.7의 read-back을 실패시킨다. M1·M1.5 사이클에서 이 충돌이 표면화되지 않은 이유는 그 plan들이 **여러 세션에 걸쳐 재구현**되어 절이 이미 plan 본문에 있었고, 재주입이 동일 내용이라 hash가 불변이었기 때문이다(M1: plan-codex `17:01:52` ↔ implement `17:03:25`, 양쪽 `sha256:9460d65f…` 동일).

2.5.6 Step A의 검증 대상은 문언상 `<plan or notes path>`이고 2.5.4도 notes 경로를 대안으로 인정한다. 그 대안이 존재하는 **이유**(plan 본문을 변형하면 안 되는 상황)가 여기에 정확히 해당하므로 notes를 목적지로 택했다. plan 본문은 무손상이고 `mccp-plan-codex`의 L2 패널 증거(5라운드·quorum 3of4)도 재생성 없이 보존된다.

**대안을 택하지 않은 이유** — plan에 주입하고 `/mccp:plan`을 재실행하면 hash는 맞지만 590초짜리 4관점 패널 심의와 그 `review_proof`가 **덮어쓰기**된다. 기록을 보존하려고 도입한 게이트가 기록을 지우는 결과라 채택하지 않았다.
