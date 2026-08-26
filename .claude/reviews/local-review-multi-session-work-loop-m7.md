# Local Review — multi-session-work-loop M7 (uncommitted)

**Reviewed**: 2026-08-21
**Mode**: Local Review Mode (`/mccp:code-review`, no args) — advisory, receipt chain 미개입
**Branch**: `multi-session-work-loop-m7`
**Scope**: tracked 31개 파일 (+928/-108) + untracked 15개 (신규 소스 3 · test 3 · 문서/데이터 9)
**Decision**: REQUEST CHANGES → **RESOLVED** (11건 전량 흡수, 2026-08-21)

## Summary

M7의 골격 — append-only 레지스트리 · derive source 배선 · emit 3지점 · 승격 표면 ·
coverage gate — 은 설계 문서와 코드가 실제로 일치하고, 주입 경계 재사용(§3.13 sanitizer)과
`type_separation` 파생, `merge=union` 적용까지 실측으로 성립한다. C1이 `forward-only` →
`computed`(0/12)로 뒤집힌 것도 확인했다.

차단 사유는 넷이다. 하나는 M7과 무관한 리뷰 게이트 약화가 diff에 섞여 있는 것이고, 나머지
셋은 이 milestone의 **자기 방어 논리**가 실제로는 반대 방향으로 작동하거나 정상 입력에서
오탐하는 것이다. 셋 다 실측으로 재현했다.

## Findings

### CRITICAL

None.

### HIGH

---

**H1 — `MCCP_PLAN_REVIEW_ROLES_MIN` 5→1: 패널 역할 다양성 하한이 3에서 1로 떨어진다 (미선언)**

`.claude/settings.json:16`

```diff
-    "MCCP_PLAN_REVIEW_ROLES_MIN": "5",
+    "MCCP_PLAN_REVIEW_ROLES_MIN": "1",
```

`quorum.js#parseRolesMin`의 실측 반환값:

| 값 | 결과 | 경위 |
|---|---|---|
| `"5"` (이전) | **3** | `n > MAX_OF(4)` → loud warn + `DEFAULT_ROLES_MIN` 폴백 |
| `"1"` (현재) | **1** | 유효 범위라 그대로 채택, warn 없음 |
| unset | 3 | 기본값 |

즉 실효 변경은 `5 → 1`이 아니라 **3 → 1**이고, L2 패널 quorum이 **단일 역할**로 충족
가능해진다. `decide.js:148`이 남긴 주석("lenses answered under ROLES_MIN=2 sealed a proof
claiming two")이 가리키듯 이 값은 봉인되는 proof의 의미를 바꾸는 계약층 값이다.

문제는 값 자체보다 **선언이 없다**는 점이다:

- plan의 `Files to Change` 표에 `.claude/settings.json`이 **없다** (grep 0건)
- CHANGELOG `[1.30.1]` 항목에 언급 **없음** (`ROLES_MIN` 매치는 v1.23.x 과거 항목뿐)
- 설계 문서 · 리포트 · implement-gate 노트 어디에도 없음
- M7의 범위(관측·전달 층)와 무관한 축

tracked settings이므로 이 저장소를 쓰는 모든 세션에 적용된다. §3.16이 라운드 수를 1로
줄이는 것은 명시 정책이지만, 그것은 **라운드 축**이고 이것은 **역할 다양성 축**이다 —
memory `never-soften-reviewer-prompts`가 지키는 선과 같은 방향의 변경이다.

**처방**: 값을 되돌리거나, 의도한 변경이면 별도 축으로 분리해 근거를 남기고(§3.7 체크리스트
+ CHANGELOG) plan의 Files to Change에 등재한다. 어느 쪽이든 M7 diff에 조용히 실려서는 안 된다.

---

**H2 — DD3/DD9의 오차 방향이 설계 계약과 반대다 (2차 키 제약이 C1을 부풀린다)**

`plugins/mccp/scripts/state/findings-registry.js:629-668`
(`matchKeyOf` · `findByMatchKey` · `deriveNonRecurrenceClosures`)

설계 문서 §4가 이 milestone의 **유일한 방어 가능성 근거**로 내세우는 명제:

> 실패 시 그 finding은 새 finding으로 계상되어 분모를 늘리고 분자는 늘리지 않는다 — 오차가
> **C1을 낮게 보는 보수적 방향**으로만 작동한다. **이것이 이 설계를 방어 가능하게 만드는
> 유일한 성질**이므로, 매칭을 관대하게 만드는 어떤 변경도 이 성질을 먼저 확인해야 한다.

그리고 세 제약(§4 1~3)은 2차 키가 "C1을 높이는 방향"이라는 전제 위에 붙어 있다.

**구현은 반대다.** 매칭 실패는 분모만 늘리지 않는다 — `deriveNonRecurrenceClosures:658-664`가
그 prior finding을 `closed{type:'fixed'}`로 **닫는다**(분자 +1). §4의 문장은 효과의 절반만
계산했다. 따라서 2차 키를 *적용*하는 쪽이 거짓 `fixed`를 막고, 세 제약이 그것을 *끄는* 순간
C1이 올라간다.

실측 (실제 결함 1건이 라운드 사이 문면만 바뀐 채 **고쳐지지 않고** 수렴 — 참값 `0/1 = 0.00`):

| 사례 | 2차 키 | closures | 보고된 C1 |
|---|---|---|---|
| A) `cited_path` 있음 | 적용 | 0 | `0/2 = 0.00` (정확) |
| B) `cited_path` 없음 (제약 1) | 미적용 | 1 | **`1/2 = 0.50`** |
| C) `<outside-repo>` (제약 3) | 미적용 | 1 | **`1/2 = 0.50`** |

제약 2(후보 2개 이상)도 같은 형태로 재현된다(`findByMatchKey:639`가 `null`을 돌려주어 종결).

부풀리는 방향은 설계 §2/UI5가 "조작 경로"로 명시한 바로 그 방향이고, `--acceptance` ·
대시보드 · `evidence-audit`가 모두 이 값을 하한으로 신뢰한다.

**처방**: (a) 매칭 실패 시 prior를 `fixed`로 닫지 않는다(예: 2차 키 미적용은 `unknown`으로
접어 종결 보류), 또는 (b) 세 제약의 정당화를 실제 방향에 맞춰 재작성하고 각 제약이 무엇을
사는지 다시 계산한다. 어느 쪽이든 §4의 "보수적 방향으로만" 문장은 현재 거짓이므로 함께
정정해야 한다.

---

**H3 — 런타임 falsifier가 정상 입력에서 오탐하고, 원인을 "유실"로 오진한다**

`plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js:290-322` (`correlateStandingRecords`)
vs `plugins/mccp/scripts/lib/plan-review/cli.js:612-645` (`emitPanelFindings`)
vs `plugins/mccp/scripts/lib/plan-review/record.js:157-176` (`findingRows`)

두 표면의 포함 조건이 다르다.

| | `findingRows` (표면) | `emitPanelFindings` (레지스트리) |
|---|---|---|
| result 조건 | `isObj(r)` | `typeof r.perspective === 'string'` |
| finding 조건 | `isObj(f)` | `typeof f.claim === 'string' && claim !== ''` |
| 동일 내용 중복 | 행 N개 | `finding_id` 파생이라 **1건으로 접힘** |

두 원인 모두 `record_findings > registry_findings`를 만들고, 게이트는 그것을
`reason: 'record-exceeds-registry'` + *"events were lost in the inflating direction"*으로
보고하며 `exit 1`한다 — **유실이 없었는데 유실이라고 말한다.**

실측 (claim 없는 finding 1건 + 동일 claim 2건, 한 perspective):

```
record rows counted by gate = 3
events emitted              = 2
registry folded findings    = 1
correlate ok                = false
uncovered = [{ work_unit:"probe", record_findings:3, registry_findings:1 }]
```

이 게이트는 plan `## Validation` 블록에 있어 `/mccp:prp-implement` validation loop이 실행하므로
차단 경로다. claim 필드가 빠진 리뷰어 출력은 흔한 malformed 형태이고, 샤드는 사이클마다
누적되므로 도달 가능성은 시간에 따라 커진다. 현재 트리가 통과하는 것은 covered work_unit이
1건뿐이라 두 조건 어디에도 걸리지 않았기 때문이다(covered 1 · unmeasured 24).

**반대 방향 사각도 같은 줄에 있다** (별도 항목 M4 참조).

**처방**: 대조 축을 맞춘다 — 표면 카운트를 `emitPanelFindings`와 같은 술어로 세거나(공유
오라클), 레지스트리 쪽을 `finding_id` fold 이전의 emit 건수로 비교하거나, 두 술어의 차이를
`skipped_reason`으로 표면화해 "유실"과 "포함 조건 불일치"를 다른 이름으로 가른다.

---

**H4 — `seq` 할당이 kind 검증보다 먼저라, 호출자 버그가 샤드를 영구히 `degraded`로 만든다**

`plugins/mccp/scripts/state/findings-registry.js:350` (할당) vs `:357` (검증)

```js
const base = allocateSeqBase(dir, workUnit, n);   // :350  고수위 전진
...
  if (KINDS.indexOf(src.kind) === -1) {
    return { ok: false, reason: 'invalid_kind: ...', written: 0 };   // :357  뒤늦은 거부
  }
```

배치 안에 잘못된 `kind`가 하나 있으면 `n`개 번호가 소진된 뒤 아무것도 쓰이지 않는다.
그 결과는 disk write 실패와 **구분되지 않는 구멍**인데, mkdir/append 실패 경로와 달리
`.degraded` 마커도 stderr 경고도 남지 않는다(`writeDegradedMarker` 미호출).

실측:

```
write2 {"ok":false,"reason":"invalid_kind: typo_kind","written":0}
degraded marker written?  false
write3 seq=[5,5]                       ← 2,3,4 소실
degraded = true
reasons  = ["seq gap(s): 2,3,4","seq count mismatch (max=5 unique=2)"]
source coverage = findings-registry-degraded
```

레지스트리는 evict도 재작성도 하지 않는 git-tracked 감사 corpus(§3.12 · DD4)이므로 이
상태는 **되돌릴 수 없고**, 그 work_unit은 `c1-coverage-gate --acceptance` 축 4
(`coverage.indexOf('degraded') === -1`)를 영구히 통과하지 못한다.

현재 emit 3지점은 모두 리터럴 유효 kind를 쓰므로 **지금은 도달 불가**다. 다만 이것은
"입력 검증이 상태 변경보다 앞선다"는 기본 순서 위반이고, 대가가 비가역이며, 그 대가를 치르는
것이 하필 이 milestone 자신의 배송 증거 게이트다.

**처방**: `allocateSeqBase` **전에** 전체 배열의 `kind`를 검증한다(3줄). 검증 실패에도
`.degraded` 마커를 남길지는 별도 판단이나, 최소한 소진되지 않아야 한다.

### MEDIUM

**M1 — 소스 파일에 raw NUL 바이트 2개 — ripgrep/grep이 모듈 전체를 건너뛴다**

`plugins/mccp/scripts/state/findings-registry.js:172` (`].join('\0')`) · `:634`
(`String(finding.perspective) + '\0' + String(p)`)

해시 preimage와 매칭 키의 구분자로 NUL을 쓰는 것 자체는 타당하지만, `'\0'` **이스케이프가
아니라 실제 NUL 바이트**가 소스에 박혀 있다(offset 8236 · 27232).

```
$ file  …/findings-registry.js     →  data
$ rg -n "deriveFindingId" …        →  binary file matches (found "\0" byte around offset 8236)
$ grep -n "deriveFindingId" …      →  Binary file … matches      (줄 번호 없음)
$ git grep -n "deriveFindingId" …  →  정상 동작 (git은 첫 8000바이트만 검사, 첫 NUL이 8236)
```

git diff/merge는 무사하지만(numstat `720 0`, `- -` 아님), 이 저장소는 grep 기반 감사에
크게 의존한다 — coverage gate 자체가 텍스트 lint이고 CLAUDE.md가 grep 실측을 반복 인용한다.
M7의 핵심 신규 모듈이 표준 검색에서 보이지 않는 상태다.

**처방**: 리터럴 NUL을 `'\0'` 이스케이프로 교체(동작 동일, 1글자).

---

**M2 — `codexFindingEvent`의 `round`에 finding 배열 인덱스가 들어간다**

`plugins/mccp/scripts/lib/plan-codex-runner.js:751`

```js
round: Number.isInteger(index) ? index : null,
```

호출부 `emitCodexFindings:764`가 `findings.forEach(function (f, i) { codexFindingEvent(f, i) })`
이므로 `round`에 실리는 값은 **리뷰 라운드가 아니라 배열 첨자**다. `seal.js`는 같은 필드에
진짜 라운드 번호를 싣고(`emitSantaFindings:437`), reader `foldEvents:497`는 두 의미를 구분하지
않는다. 계산에 쓰이지는 않지만(matchKey·비재발 판정 모두 미사용) 재작성 불가한 감사 corpus에
들어가는 잘못된 값이다.

현재 커밋된 샤드는 `MCCP_CODEX_DISABLED=1` 탓에 전부 `round: null`이라 아직 오염은 없다.

**처방**: Plan-Codex는 단일 라운드이므로 `round: null`(또는 실제 라운드 번호)을 싣고, 첨자가
필요하면 allowlist에 별도 필드를 넓히거나 싣지 않는다.

---

**M3 — 테스트가 저장소 자신의 tracked env에서 붉어진다 (+ 병렬 실행 flaky 2건)**

`plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js`

이 파일은 `withCap()`으로 `MCCP_SANTA_ROUND_CAP`은 중화하지만 `MCCP_REVIEW_SINGLE_PASS`는
중화하지 않는다. `.claude/settings.json`에 `"MCCP_REVIEW_SINGLE_PASS": "deadline_pressure"`가
tracked로 들어 있으므로(§3.15대로 `begin-round`가 exit 2), **기본 개발 환경에서 28건이 실패**한다.

```
$ node --test …/santa-loop-cap.test.js                          → 28 fail
$ env -u MCCP_REVIEW_SINGLE_PASS node --test …                  → 56 tests, 0 fail, 3 skipped
```

STATE.md가 기록한 "santa 269건 중 266 pass · 0 fail"은 후자 조건에서만 성립한다. 계측이
아니라 검증 신뢰도의 문제다 — 이 상태에서는 실제 회귀와 env 잡음을 구분할 수 없다.

부수로, `--test-concurrency=4` 전체 lib 스위트(2478건)에서 같은 파일의 lock 테스트 2건
(`DD7 — lock 획득 실패는 exit 75` · `R2 F1 — MCCP_EVIDENCE_CONFLICT_GUARD=off/warn`)이
6초대 소요 후 실패한다. 단독 실행 시 0 fail이므로 병렬 lock 경합에 의한 flaky다.

**처방**: `withCap`과 같은 형태로 `MCCP_REVIEW_SINGLE_PASS`를 delete하는 래퍼를 두거나
파일 상단에서 한 번 삭제한다. flaky 2건은 별도 축(lock 테스트 직렬화).

---

**M4 — 런타임 falsifier의 반대 방향 사각: 샤드가 전 게이트를 합산한다**

`plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js:308-317`

```js
const opened = shard.findings.length;
if (opened < recordCount) { …uncovered… }
```

`shard.findings`는 그 work_unit의 **모든 게이트**(패널 + Plan-Codex + santa)를 fold한 집합인데,
`recordCount`는 패널 `## Findings` 표만 센다. 같은 work_unit에 Codex나 santa finding이 있으면
좌변이 부풀어 **실제 패널 유실을 가린다**. 이 축이 겨냥한 것이 정확히 "부풀리는 방향의 유실"
(설계 §5 2항)이므로 사각이 목적과 겹친다.

**처방**: 비교 시 `gate_id`/`perspective`로 패널 축만 추린다.

### LOW

**L1 — `eventToJsonLine`의 8KB 분기가 절삭하지 않는다** —
`findings-registry.js:214-219`. 상한 초과 시 `truncated: true` 키를 **추가**해 다시 직렬화하므로
줄이 오히려 커진다. `msw-events.js`의 동일 결함을 그대로 승계한 것이고, 필드당 256자 ×
allowlist 16개라 실질 상한이 ~4.3KB이므로 현재 도달 불가다. 승계 사실을 주석에 남기거나
실제 절삭으로 고친다.

**L2 — 승격 블록에서 `f.source`만 sanitize를 거치지 않고 벌거벗은 경로로 렌더된다** —
`state-injector.js:217`. `perspective`·`cited_path`는 `sanitizeForInjection`을 통과하고
`cited_path`는 백틱 코드 스팬으로 감싸지만, `f.source`(`'.claude/reviews/plan-review-' +
work_unit + '.md'`)는 둘 다 아니다. `work_unit`은 우리 슬러그이고 `sanitizeField`가 개행을
지우므로 실질 위험은 낮으나, 설계 §6이 벌거벗은 경로를 금지한 근거("그 줄이 지시로 읽힐 여지")는
같은 줄에 그대로 적용된다. 백틱으로 감싸는 것으로 충분하다.

**L3 — `repoRoot` 미해석 시 `../` 상대경로가 그대로 기록된다** —
`findings-registry.js:139-141`. 절대경로만 `<outside-repo>`로 접고 `../../x.js`는 통과시킨다.
정규화가 "단일 초크 포인트"라는 주장(§7)의 가장자리 예외이므로 같은 자리에서 접는 편이 일관된다.

## Validation Results

| Check | Result | Detail |
|---|---|---|
| Syntax (`node --check`, 변경 js 전량) | Pass | 0 fail |
| M7 스위트 (c1-coverage-gate · c1-feedback-loop · findings-registry · msw-metrics ×4 · assertion-manifest) | Pass | 147/147 |
| santa 스위트 (단독) | Pass | 56 tests · 0 fail · 3 skipped |
| santa 스위트 (저장소 tracked env) | **Fail** | 28 fail — M3 |
| renderer + derive 스위트 | Pass | 799/799 |
| state + receipt 스위트 | Pass | 872 · 0 fail · 1 skipped |
| lib 전체 (`--test-concurrency=4`) | Fail | 2478 · 2 fail (flaky, M3) · 14 skipped |
| `c1-coverage-gate.js` (default) | Pass | ok=true, 4축 통과 |
| `c1-coverage-gate.js --acceptance` | Fail (의도) | `registry-committed` 1축 — 커밋 전이라 정상 |
| `assertion-manifest-check --manifest m7` | Pass | 32 assertion / floor 32 |
| `assertion-manifest-check --manifest m6` | Pass | 회귀 없음 |
| Lint | Skipped | 저장소에 lint 스크립트 없음 (package.json 부재) |
| Build | n/a | — |

**부수 확인 (문제 없음)**

- plan `plan_hash` 봉인 일치 — `sha256:f6bfde5a…` (sealed == live). §3.11 guard 2 staleness 없음
- 4면 version 동기 완료 — `plugin.json` · `html.js` page-foot · `markdown.js` · CHANGELOG `currently`
- `merge=union` 실적용 — 실재 이름 · 미래 이름 양쪽 `git check-attr` = `union`
- 커밋된 샤드 12줄에 절대경로 0건 · `claim` 필드 0건 (`claim_digest`만) — §3.12 · 설계 §6 계약 준수
- 주입 sanitizer 실동작 — directive/homoglyph EXCLUDED, `<`/backtick 이스케이프 확인
- DD9 세 제약과 `isPromotable` 임계(HIGH·CRITICAL, 판독 불가 미승격)는 명세대로 동작
- `contractCoPresence` · `SOURCE_SCANNERS.findings` 등록 확인, C1 = `computed` 0/12

## Files Reviewed

**Added (신규 소스)**
- `plugins/mccp/scripts/state/findings-registry.js` (720)
- `plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js` (596)
- `plugins/mccp/scripts/derive/sources/findings.js` (81)

**Added (test)**
- `plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js` (753)
- `plugins/mccp/scripts/lib/tests/findings-registry.test.js` (422)
- `plugins/mccp/scripts/lib/tests/c1-coverage-gate.test.js` (347)

**Added (문서·데이터)**
- `docs/multi-session-work-loop/feedback-loop-design.md` · `m7-{before,after,audit-sample,assertion-manifest}.json`
- `.claude/state/findings/multi-session-work-loop-m7.jsonl`
- `.claude/PRPs/reports/…-m7-report.md` · `.claude/notes/…-m7-implement-gate.md` · `.claude/reviews/plan-review-…-m7.md`

**Modified (소스)**
- `lib/msw-metrics/index.js` · `assertion-manifest-check.js` · `fixture.js`
- `lib/plan-review/cli.js` · `lib/plan-codex-runner.js` · `lib/santa/seal.js`
- `lib/intent-context.js` · `lib/renderer/sections/msw-metrics.js` · `renderer/{html,markdown}.js`
- `state/state-injector.js` · `state/handoff-items.js`
- `derive/index.js` · `derive/sources/handoff-items.js`

**Modified (test)** — `msw-metrics.test.js` · `msw-metrics-render.test.js` ·
`msw-metrics-acceptance.test.js` · `msw-derive-sources.test.js` ·
`assertion-manifest-check.test.js` · `santa-loop-cap.test.js`

**Modified (설정·문서)** — `.claude/settings.json` (**H1**) · `.gitattributes` ·
`plugin.json` · `CHANGELOG.md` · plan/PRD/measurement-design/backlog/STATE.md

## §3.14 분류

| 항목 | 처리 |
|---|---|
| H1 · H2 · H3 · H4 | 그 자리에서 흡수 대상 |
| M1~M4 · L1~L3 | `codex-findings-backlog.md`에 append (증거는 위 각 항목) |

---

## Resolution — 11건 전량 흡수 (2026-08-21)

사용자 지시로 §3.14 분류(HIGH만 흡수 / MEDIUM·LOW는 backlog)를 적용하지 않고 **전건을
그 자리에서 흡수**했다. 각 항목은 수정 전 실측으로 재현하고 수정 후 같은 실측으로 확인한
뒤, 회귀 단언을 붙였다.

| # | 조치 | 위치 | 회귀 단언 |
|---|---|---|---|
| H1 | `git checkout HEAD -- .claude/settings.json` — 실효 하한 3 복원 | `.claude/settings.json` | (설정 되돌림, 코드 축 아님) |
| H2 | 대조 불가 시 종결 보류 · 다중 후보를 재발로 판정 · 통상 경로 보존 | `findings-registry.js#deriveNonRecurrenceClosures` | `C1-ID-SECONDARY-KEY: 대조 불가한 비재발은 종결하지 않는다` |
| H3 | 표면 카운트를 emit 술어 + `finding_id` fold와 일치 | `c1-coverage-gate.js#countRecordFindings` · `parseRecordRow` | `C1-COVERAGE-RUNTIME: 표면 카운트가 emit 술어와 같다` |
| H4 | `kind` 검증을 `seq` 할당보다 앞으로 | `findings-registry.js#appendFindings` | `C1-BATCH-ATOMIC: 잘못된 kind 는 seq 를 소진하기 전에 거절된다` |
| M1 | 리터럴 NUL → `\0` 이스케이프 (해시 불변) | `findings-registry.js` · `c1-coverage-gate.js` | `C1-REGISTRY-ALLOWLIST: 레지스트리 소스에 리터럴 NUL 바이트가 없다` |
| M2 | 배열 첨자 `round` 제거 + 미사용 파라미터 정리 | `plan-codex-runner.js#codexFindingEvent` | `C1-EMIT-PLAN-CODEX: Codex emit 은 배열 첨자를 round 로 싣지 않는다` |
| M3 | 주변 `MCCP_REVIEW_SINGLE_PASS` 중화 — **범위가 리뷰 당시 추정보다 넓었다(4파일)** | `santa-loop-cap.test.js` · `santa-adjudication.test.js` · `santa-lanes.test.js` · `receipt/tests/review-single-pass-fields.test.js` | 네 파일 모두 ambient env 에서 green |
| M4 | `panelFindingsOf`로 패널 축만 대조 | `c1-coverage-gate.js` | `C1-COVERAGE-RUNTIME: 다른 게이트의 finding 이 패널 유실을 가리지 않는다` |
| L1 | 상한 초과 시 실제 절삭 (도달 불가 분기의 계약 정정) | `findings-registry.js#eventToJsonLine` | — (필드 캡상 도달 불가, 주석에 명시) |
| L2 | `source` 경로도 코드 스팬 | `state-injector.js#buildOpenFindingsBlock` | `C1-PROMOTE-SANITIZED: 승격 블록의 경로는 전부 코드 스팬이다` |
| L3 | `repoRoot` 부재 시 `..` 도 placeholder | `findings-registry.js#normalizeCitedPath` | `C1-REGISTRY-PATH-NORMALIZED: repoRoot 부재 시 …` |

### 수정 전후 실측

| 시나리오 | 수정 전 | 수정 후 | 참값 |
|---|---|---|---|
| H2 — 고쳐지지 않은 결함이 문면만 바뀐 채 수렴 (`cited_path` 없음) | `1/2 = 0.50` | `0/2 = 0.00` | `0/1 = 0.00` |
| H2 — 같은 `matchKey` 다중 후보 | 종결 1건 | 종결 0건 | 미종결 |
| H2 — 빈 수렴 라운드 (통상 경로 회귀) | 종결 1건 | 종결 1건 | 종결 |
| H3 — claim 부재 1 + 동일 내용 2 | record 3 / registry 1 → **exit 1** | record 1 / registry 1 → ok | ok |
| H4 — 배치 중 잘못된 `kind` 1건 | 다음 seq `5`, 샤드 영구 `degraded` | 다음 seq `2`, `degraded=false` | 소진 없음 |
| M3 — ambient env 에서 santa 스위트 | 28 fail | 0 fail | 0 fail |

### 문서 반영

- `docs/multi-session-work-loop/feedback-loop-design.md` §4 — 오차 방향 주장이 **틀렸다는
  사실과 그 근거를 명시적으로 남기고** 정정된 규칙으로 대체. §5 — `seq` 할당과 입력 검증의
  순서, 그리고 falsifier의 술어 일치·패널 축 한정을 추가.
- `CHANGELOG.md` `[1.30.1]` — `### Fixed (local review 흡수)` 절 신설.

### 남긴 것 (이 사이클에서 하지 않음)

- **assertion manifest 하한(32)은 넓히지 않았다.** 하한은 상한이 아니며, plan의
  `## Assertion Roster`가 `plan_hash`로 봉인돼 있어(현재 sealed == live) 편집하면 §3.11
  가드 2가 이 사이클의 PR을 막는다. 회귀 단언은 기존 id 아래에 붙였다.
- **`MCCP_PLAN_REVIEW_ROLES_MIN="5"`가 무효값이라는 것 자체**는 되돌린 상태 그대로 남았다
  (`MAX_OF(4)` 초과 → loud warn + 기본값 3 폴백). main에 있는 선재 조건이고, 고치는 것은
  게이트 강도 축의 **선언된 변경**이어야 하므로 이 diff에 섞지 않는다 → backlog.
- **`--test-concurrency=4`에서 santa lock test 2건 flaky.** 단독 실행은 green이며 원인은
  병렬 lock 경합이다. 직렬화는 별도 축 → backlog.

### 흡수 중 드러난 것 — M3 의 실제 범위와 backlog 표 손상

- **M3 은 한 파일이 아니라 네 파일이었다.** 리뷰 시점에는 `santa-loop-cap.test.js` 만
  실행해 28건을 확인했는데, 흡수 후 전체 스위트를 저장소 자신의 ambient env 로 돌리자
  `santa-adjudication.test.js` 22건 · `santa-lanes.test.js` 1건 ·
  `receipt/tests/review-single-pass-fields.test.js` 2건이 같은 원인으로 더 나왔다
  (각 파일 단독 실행 시 `env -u` 로는 0 fail — 격리로 확인). 마지막 파일은 **토글이 꺼져
  있을 때**를 단언하는 test 를 갖고 있어 ambient 값이 새면 그 단언이 기본 환경에서 붉어진다.
  네 파일 모두 모듈 로드 시점에 `delete process.env.MCCP_REVIEW_SINGLE_PASS` 한다.
  이 확대는 리뷰의 M3 서술이 **범위를 과소 추정**했음을 뜻한다 — 원인 진단은 맞았고 범위가 틀렸다.
- **backlog 표에 파서가 못 보던 행이 1건 있었다.** 흡수분을 append 하며 형식을 맞추다가,
  이 사이클이 앞서 넣은 `2026-08-21 | MEDIUM | …plan.md | **plan의 Files to Change 표가…**`
  행에 선행 `|` 가 없어 `derive/sources/backlog.js` 의 4열 파서에 **잡히지 않던 것**을
  함께 고쳤다(§3.15 의 "4열 고정" 계약). 정정 후 `scanBacklog` 는 136행 · `invalid_count: 0`.

### 잔여 flaky (원인 다름 — env 아님)

전체 스위트 직렬 실행에서 `review-verdict-corpus-hash.test.js` 와
`session-processes-reclaim.test.js` 가 각각 실패했다가 **단독 실행에서는 양쪽 env 모두 0 fail**
이다. `santa-loop-cap` 의 lock test 2건과 같은 부하·타이밍 계열이며 env 축이 아니다 → backlog.
