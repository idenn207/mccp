# impeccable-detection-contract M4 — 게이트 산출물 · 라이브 증거

> plan: `.claude/plans/impeccable-detection-contract-m4.plan.md` (`plan_hash sha256:911ff610…1272c` — **편집 금지**)
> 이 파일이 M4의 게이트 산출물을 소유한다. plan 본문을 고치면 봉인된 plan-codex receipt가
> stale이 되어 `/mccp:pr`이 차단되므로, M1~M3과 같이 게이트 출력은 여기 쓴다.

## 게이트 진입 기록 — plan-codex 슬러그 불일치와 감사 우회

`/mccp:prp-implement`가 도출한 decision 슬러그는 `impeccable-detection-contract-m4`인데,
이 plan에 대한 `mccp-plan-codex` receipt는 **base 슬러그**(`impeccable-detection-contract`)에
실려 있다. `/mccp:plan`이 plan 경로가 아니라 **PRD 경로**로 호출된 결과다
(`derive-decision --command mccp:plan --args <prd>` → base).

측정으로 확인한 것 — 리뷰 대상 본문은 이 plan이 맞다:

| 대조 | 값 |
|---|---|
| 이 plan의 `hash-markdown` | `sha256:911ff610cb2c92b57c316764187d73c4dbb111b43a539a95d023e5cac161272c` |
| base 슬러그 receipt의 `reviewed_plan_hash` | **동일** |
| `validate --command mccp:prp-implement --decision impeccable-detection-contract --plan <this plan>` | `ok:true` exit 0 (stale 아님) |
| 같은 명령, `--decision …-m4` | `ok:false` missing `mccp-plan-codex`, exit 2 |

**우회 사유(§3.16)**: 게이트는 이 본문에 대해 2026-08-23T03:55Z에 실제로 실행됐고
verdict `divergent`가 정직하게 봉인됐다(L2 패널 4/4 fail, `MCCP_REVIEW_SINGLE_PASS=scope_too_small`).
재실행은 동일 본문·동일 리뷰어이므로 새 정보 없이 파일명만 얻는다(직전 실측 `review_wall_clock_ms=967170` ≈ 16분).
receipt 파일명 변경은 §3.12 no-rehash·§3.16 receipt 위조 금지에 걸리므로 하지 않았다.
진입은 프로젝트에 이미 설정된 `MCCP_RECEIPT_GATE_MODE=soft`(누락 receipt만 통과)의
informational allow-path로 이뤄졌다 — stale/blocking/critical은 여전히 차단된다.

**남는 것(숨기지 않는다)**: M4의 `mccp-implement-codex` receipt는 `-m4` 슬러그에 실리고
plan-codex는 base에 남으므로, 두 receipt가 **같은 슬러그에 공존하는 지점이 없다**.
cross-gate dedupe는 그래서 fail-closed로 닫힌 채 남고 `/mccp:pr`에서 PR-Codex가 실제로 발화한다.
plan verdict가 `divergent`라 dedupe는 애초에 열리지 않았을 것이므로 잃은 것은 없다.

## L2 패널이 남긴 미흡수 지적 (plan 게이트, backlog 적재 완료)

`MCCP_REVIEW_SINGLE_PASS`가 통과시킨 blocking finding 10건은 `codex-findings-backlog.md`에
기계 적재됐다(`backlog.json` `appended:10`). 그중 이 구현이 **직접 받는** 것:

| # | severity | 지적 | M4 구현에서의 처리 |
|---|---|---|---|
| 1 | CRITICAL | Task 4·5가 `impeccable_commands_routed` 항목의 필수 `status` 필드를 명세하지 않음 | **반증됨** — plan Task 4.3이 기존 `schema.js` 5종 enum 통과를 요구하고 Task 5.3이 `{command, call_form, status}` 누적을 지시한다. 구현은 2.5.5b의 callForm→status 처리표를 그대로 쓰고 `restamp-routed.test.js`가 schema 통과를 단언한다 |
| 2 | HIGH | 라우팅 오라클 출력 ↔ receipt 항목 스키마 불일치 | **반증됨** — 오라클은 `{command, stage, callForm}`, receipt는 `{command, call_form, status}`. 변환은 본문 처리표가 소유하며 schema는 무변경 |
| 3 | HIGH | `status`를 채우는 기전 미명세 | 위와 동일 |
| 4 | HIGH | Task 2의 `shape` `background`→`recommend`가 기존 test를 깨뜨림 | **실재** — `impeccable-routing.test.js:47` 갱신 |
| 5 | HIGH | phase 필터가 카탈로그를 16→14로 줄이는데 기존 길이 단언 미갱신 | **실재** — `IMPLEMENT_COUNT` 상수 갱신 + 증감 이력 주석 |
| 6 | HIGH | Task 6이 신규 test만 열거 | **실재** — 기존 test 갱신을 구현에 포함 |

4·5·6은 실재하는 지적이고 구현에서 흡수했다. 1·2·3은 plan 본문에 이미 명세가 있어
증거로 기각한다(§3.14 — 기각에는 증거를 붙인다).

## Codex Implementation Review

- 호출: `node …/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (§3.16 — 1라운드 기본)
- classification `ok` · durationMs 461793 · verdict `needs-attention` → `deriveGateVerdict` = **`divergent`** (source=`structured`)
- 1회차는 `exit-nonzero`로 실패했다: `failed to initialize sqlite state runtime under ~/.codex: database is locked`.
  stale codex 프로세스 7개가 떠 있었고(최고 14시간), 재시도 1회로 통과했다. 프로세스는 죽이지 않았다 —
  다른 worktree 세션 소유일 수 있다.
- 합치 결론: phase 분리 자체는 plan·prd·pr에 대해 bounded로 인정. 남은 두 축은 **restamp의 감사 성질**이며 둘 다 R1에서 흡수했다.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 append-only restamp가 멱등이 아니라 재시도가 중복 이력을 위조한다 | HIGH | ACCEPT_NOW | 실재. plan의 "중복 = drift 신호"는 *실제 두 번째 발화*와 *같은 restamp의 재시도*를 구분하지 못한다. tail-match 멱등으로 닫는다(아래) |
  | F2 fail-open restamp가 finish 발화를 receipt에서 사라지게 한다 | HIGH | ACCEPT_NOW | 실재. "덜 기록"이 정확히 M4가 고치려는 실패다. 차단성은 바꾸지 않고 조용한 소실을 시끄럽고 복구 가능한 소실로 바꾼다(아래) |

- Deferred to backlog: 0
- Open Questions: 없음 (R1에서 전건 흡수, DIVERGENT_UNRESOLVED 아님)
- Codex thread: `01a02d55-570a-7790-97b5-665539aef474`

### F1 흡수 — tail-match 멱등

`restampRoutedCommands`는 append 전에 **들어온 슬라이스가 기존 배열의 꼬리와 이미 동일한지**
검사하고, 동일하면 no-op으로 반환한다(receipt 무변경 · 해시 재계산 없음).

이것이 plan의 drift 신호를 **하나도 잃지 않는** 이유:

- M4가 잡으려는 drift는 "duplicate-call 불변식이 거짓" = **같은 명령이 pre 패스와 finish 패스
  양쪽에서 발화"다. pre 항목은 2.5.6 최초 write가, finish 항목은 3.6.4 restamp가 넣으므로
  **서로 다른 출처**다. tail-match는 restamp 대 restamp만 비교하므로 이 신호에 닿지 않는다.
- 한 finish 패스 안에서 같은 명령이 두 번 나오면 그 슬라이스 안에 두 건이 들어 있고, append는
  슬라이스를 통째로 넣으므로 두 건 다 남는다.
- 삼켜지는 유일한 경우는 **바이트 동일한 슬라이스를 나르는 두 번의 별개 restamp 호출**이며,
  이는 압도적으로 재시도다. 내용이 다른 진짜 두 번째 패스는 그대로 append된다.

Codex의 처방("running the same restamp twice leaves the receipt unchanged")을 그대로 만족하고,
`restamp-routed.test.js`가 재시도 no-op과 "내용이 다르면 append"를 함께 단언한다.

### F2 흡수 — 차단성은 유지, 소실은 시끄럽고 복구 가능하게

Phase 3.6은 advisory이고 M4가 그 성질을 바꾸는 것은 plan이 명시적으로 거부한 결정이라
fail-open을 fail-closed로 뒤집지 않는다(그것은 범위 확장이다). 대신 셋을 더한다:

1. **bounded 재시도** — restamp 실패의 현실적 원인은 `updateReceipt`의 락 경합이므로 3회까지 재시도.
2. **증거 보존** — 최종 실패 시 entries tempfile을 **지우지 않고** 경로를 loud stderr로 낸다.
   발화 기록은 receipt 밖에 남되 사라지지는 않는다.
3. **다음 세션에 인계** — `.claude/state/fix-task.md`에 항목을 남기고 Phase 5 REPORT에 기록한다.

**주장하지 않는 것**: 이것은 receipt만 보고 소실을 탐지할 수 있게 만들지 **못한다**.
검증기가 요구할 수 있는 receipt 내 상태를 만들려면 present-only meta 필드가 필요하고,
그것은 plan이 "schema 변경 0"으로 못 박은 축이다. 그 잔여는 여기 명시하고 backlog로 넘기지 않는다 —
plan의 범위 결정이지 놓친 것이 아니다.

### Design Review

impeccable skill은 가용하다(`resolve` → `available:true` · `invocation:impeccable:impeccable` ·
source `plugin` · `4.1.1` · `shadowed:false` · `eclipsed:[]`) — M3 재배선이 라이브에서 성립한다는 증거.

`detect --mode implement`는 `design_signal:false` · `silent_skip:true` · `reason:no-signal`을
반환했다. 이 시점 diff에 렌더 표면이 없는 것이 사실이므로 **정직한 silent-skip**이고,
receipt에 `impeccable_silent_skip=true`로 forward했다. 임의로 트리거를 켜지 않았다.

### Security Reviewer

아래 「구현 후 보안 리뷰」 절 참조 — 4건 흡수(F4 CRITICAL · F3 · F1 · F2), 2건 PASS 독립 확인, 선재 2건 backlog 이연.

---

## Task 1 — UI10 재확인: 차단 조건의 근거 (실측, 2026-08-23)

측정 대상은 설치된 `impeccable@impeccable` **4.1.1** 이다
(`~/.claude/plugins/cache/impeccable/impeccable/4.1.1/skills/impeccable/`).

### 1차 근거 — 벤더가 함께 배포하는 자기 계약

`scripts/command-metadata.json` `shape.description`:

> "Plan UX and UI before code. **Runs a required multi-round discovery interview**, uses visual
> probes when available, and produces a user-confirmed design brief for implementation."

**조건 없이 required**다 — PRODUCT.md 유무와 무관하다. meta-research가 우려한 "공식 문서 뒷받침
없음"은 이것으로 해소된다. 카탈로그 전체(23개)에서 `interview`를 서술에 담은 명령은 **정확히 둘**:

| 명령 | 인터뷰 성질 |
|---|---|
| `shape` | **required** — 무조건 |
| `init` | "Runs a multi-round discovery interview **when context is missing**" — 조건부. 그리고 PRODUCT.md를 **쓴다** |

23개 전량: `adapt animate audit bolder clarify colorize craft critique delight distill document
extract harden init layout live onboard optimize overdrive polish quieter shape typeset`.

### 2차 근거 — 실행 시 차단 분기

`scripts/context.mjs`:

- `:1116` (`hasVisualImplementation=true` 갈래) — "For `init`, **`teach`**, `shape`, or any request to
  create a new surface or replacement visual world, load reference/init.md and **create PRODUCT.md with
  the user first**."
- `:1121` — "`BUILD_INIT_REQUIRED`: Before shape or any new-surface/redesign flow, init must capture
  PRODUCT.md with the human **or structured simulated user**."
- `:1130-1132` (`hasVisualImplementation=false` 갈래) — 같은 3인조를 다시 묶고 "complete its human or
  **structured simulated-user interview**, and write PRODUCT.md before designing".
- `:1138` — `PRODUCT_INIT_REQUIRED`.

비대화형 게이트에서 이 분기에 들어가면 (a) 질문하며 멎거나 (b) "structured simulated-user
interview"로 제품 진실을 **지어내어 사용자 저장소에 PRODUCT.md를 쓴다**. 후자가 더 나쁘다.

### `INTERVIEW_REQUIRED_COMMANDS`의 세 원소가 정당한 이유 (측정된 미묘함)

plan Task 2는 집합을 `['shape', 'init', 'teach']`로 정했다. 실측 결과 그 근거는 성립하되
**두 소스가 어긋난다**:

- `context.mjs:1116`·`:1132`의 차단 문장은 세 이름을 **한 문장에서** 묶는다 → plan의 "형제" 근거는 사실이다.
- 그러나 `command-metadata.json`의 23개 카탈로그에 **`teach`는 없다**. 저장소 전역 grep에서
  `teach`는 `reference/{critique,onboard,operate}.md` 등의 **영단어**로만 나온다.

즉 `teach`는 벤더 자신의 차단 프로즈가 부르지만 4.1.1 명령 카탈로그에는 없는 이름이다 —
벤더 측 불일치다. 이것은 세 원소 유지를 **약화하지 않고 강화한다**: 집합의 목적이
"미래에 카탈로그가 넓어질 때 인터뷰형 명령이 조용히 발화하지 않게 막는 것"이고,
`teach`는 정확히 그 미래의 후보이기 때문이다. mccp 라우팅 카탈로그에는 추가하지 않는다(UI5).
**오늘 교집합은 `shape` 하나**이며, Task 6의 metric test가 그 교집합이 전 게이트·전 phase에서
공집합임을 단언한다.

### 측정된 오라클 매트릭스 — M4 **이전** 기준선 (auto 모드)

| gate | renderingSurface | n | non-recommend 발화 |
|---|---|---|---|
| prd | true / false | 20 | (none) |
| plan | true / false | 20 | (none) |
| implement | **true** | 16 | `discovery/shape:background` `refine/layout:invoke` `refine/typeset:invoke` `refine/animate:invoke` `refine/colorize:invoke` `simplify/adapt:invoke` `evaluate/critique:invoke` `evaluate/audit:invoke` |
| implement | false | 16 | `evaluate/critique:invoke` `evaluate/audit:invoke` |
| pr | true / false | 7 | (none) |

plan이 적은 기준선과 **일치**한다(추정이 아니라 실행으로 얻었다 — UI13).

### meta-research 정정 1건 (plan이 예고한 것)

P2.5의 "`harden`·`optimize`·`onboard`·`polish`가 어느 게이트에서도 발화하지 않는다"는
`polish`에 한해 **낡았다**. v1.18.21이 `prp-implement.md` Phase 3.6을 도입해 `clarify`·`distill`·`polish`를
post-EXECUTE로 부른다. 남는 미발화는 `harden`·`optimize`·`onboard` 셋이다.

### 신규 발견 (plan Task 4의 존재 이유)

Phase 3.6의 그 3종은 **오라클을 거치지 않는다**. 오라클은 implement에서 `clarify`·`distill`을
`recommend`로, `polish`는 아예 미등재로 답한다. receipt의 `impeccable_commands_routed`는
2.5.6(pre-EXECUTE)에 봉인되고, 유일한 사후 restamp인 `restampGroundingVerdict`(`write.js:1064`)는
`meta.design_grounding_verdict` **한 키만** 건드린다. 따라서 실제 발화 3건이 receipt에
**기록될 경로가 구조적으로 없다**.

### 구현 후 보안 리뷰 (`mccp:security-reviewer`, 2026-08-23)

대상은 receipt 무결성 변조 표면이다 — 해시 재계산 · 봉인 배열 append · caller 공급 파일 경로.
리뷰어 주장은 **그대로 받지 않고 코드로 재검증**했다(§3.14는 흡수를 요구하지 트집을 요구하지 않는다).

| # | 리뷰어 severity | 재검증 결과 | 처리 |
|---|---|---|---|
| F4 | CRITICAL | **실재** — 멱등 검사 위치가 제안서에 명시되지 않았다 | ACCEPT_NOW — `updateReceipt` mutate 콜백 **안**에 두었다 |
| F3 | HIGH → **MEDIUM으로 정정** | 실재하나 severity 과대 | ACCEPT_NOW — 게이트 화이트리스트 추가 |
| F1 | MEDIUM | 실재(선재) | restamp 경로는 흡수, 최초 write 경로는 backlog |
| F2 | MEDIUM | 실재(선재) | restamp 경로는 흡수, 최초 write 경로는 backlog |
| F5 | INFORMATIONAL PASS | **독립 확인함** | 조치 없음 |
| F6 | INFORMATIONAL PASS | **독립 확인함** | 조치 없음 |

#### F4 — 멱등 검사가 임계구역 안에 있어야 한다

리뷰어가 옳다. 락 **밖**에서 검사하면 검사와 쓰기 사이에 다른 writer가 배열 꼬리를 바꿀 수 있고,
그것은 §3.12가 막는 lost-update와 같은 부류다. `store.js:236`이 mutate의 `null` 반환을
"쓰지 않음"으로 처리하므로(`if (next === null || next === undefined) return null;`) 락 안 no-op이
지원되는 패턴임을 확인했고, 그 형태로 구현했다. `restamp-routed.test.js` (f)가 재시도 후
디스크의 `receipt_hash`가 **불변**임을 단언한다 — 즉 재봉인조차 일어나지 않는다.

#### F3 — 실재하나 HIGH는 아니다 (증거 기반 정정)

리뷰어 주장: 게이트 제한이 없어 `mccp-pr-codex`(git-tracked ship corpus)를 겨눌 수 있다.

재검증: `store.js#assertNoTrackedOverwrite`(`:124`)가 `isGitTracked`로 **동적 판정**해 tracked
receipt를 다른 해시로 덮는 것을 이미 `TRACKED_RECEIPT_OVERWRITE`로 거부한다. 즉 §3.12 no-rehash
불변식은 이 제한 **없이도 지켜지고 있었다** — 리뷰어도 "will eventually block"이라 인정한다.
실제 차이는 *거부 시점*(락 안, 시도 뒤)뿐이므로 **fail-fast 보강**이지 취약점이 아니다.
그래도 흡수하는 이유는 plan이 "이 restamp는 `mccp-implement-codex`에만 쓴다"고 명시했고, 코드가
그 결정을 스스로 말하는 편이 낫기 때문이다. 리뷰어가 제안한 `plan-impeccable`·`implement-impeccable`
포함은 **채택하지 않았다** — 좁게 시작하고 필요할 때 넓히는 쪽이 안전하다.

#### F1 · F2 — 선재 결함, restamp 경로만 흡수

둘 다 **최초 write 경로**(`write.js:710-715`)의 성질이고 M4가 만든 것이 아니다. 신규
`restampRoutedCommands`는 양쪽을 정렬했다: 항목 키가 정확히 셋이 아니면 **거부**(조용한 정규화
아님 — 예상 밖 키는 producer/consumer 불일치이고 버리면 caller가 믿는 것과 다른 receipt가 봉인된다),
경로는 `path.resolve(cwd, ...)`로 정규화(`--review-proof-file`이 이미 하는 방식). 최초 write 경로
변경은 전 게이트의 receipt write에 영향을 주고 schema 화이트리스트는 "schema 변경 0" 제약 밖이라
backlog로 이연했다(각각 증거 포함).

`__proto__` 축은 test로 고정했다 — `JSON.parse`가 `__proto__`를 own property로 주므로 4번째 키가
되어 키 검사에 먼저 걸린다(`restamp-routed.test.js` (h2)).

#### F5 · F6 — PASS 판정을 독립 확인했다

- **hash 커버리지**: `hash.js`의 carve-out 목록에 `impeccable_commands_routed`가 **없다**. 따라서
  append는 `receipt_hash`를 반드시 바꾸고, 그 필드는 서명 안에 남아 변조 탐지 대상이다.
  `restamp-routed.test.js` (d)가 append 후 해시 변경 + 디스크 일치를 단언한다.
- **동시성**: `updateReceipt` → `guardedReadModifyWrite`가 read·mutate·tracked-guard·atomic rename을
  한 임계구역으로 묶는다(`store.js:192-237`). 직접 읽어 확인했다.

**주장하지 않는 것**: 이 리뷰는 단일 신뢰 사용자 위협모델 안에서 이뤄졌다. 같은 권한으로 Node를
실행할 수 있는 주체는 receipt를 직접 봉인할 수 있으며, 여기서 닫은 것은 *entries 파일을 통한*
경로다.

---

## Task 8 — 라이브 완주 (2026-08-23)

단위 test 통과는 경로 작동의 증거가 아니다. 아래는 실제로 돈 것과 **돌지 않은 것**이다.

### 트리거는 우회 없이 발화했다 — 다만 그 이유가 예상과 달랐다

plan Task 8은 임시 UI 파일로 `renderingSurface=1`을 만들라고 했고 그렇게 했다
(`scratch-m4-surface.css`, 커밋 전 삭제 완료 — `git status`에 0건).
그런데 `design_signal`을 켠 것은 그 파일이 **아니었다**:

```
signal_files: ["plugins/mccp/scripts/lib/renderer/html.js",
               "plugins/mccp/scripts/lib/renderer/markdown.js",
               "plugins/mccp/scripts/receipt/write.js"]
```

`DESIGN_SURFACE_PATHS` 화이트리스트가 잡았다 — version footer 동기(Task 7)로 편집한 두 renderer
파일과 `write.js`다. detector가 **tracked diff만 본다**는 기존 서술은 그대로 맞다
(`impeccable-detect.js:515` `git diff --name-only HEAD` — untracked 미포함). 임시 파일이 기여한 것은
Phase 3.6이 **자체 재계산**하는 `renderingSurface` 쪽뿐이고, 그쪽은 tracked ∪ untracked를 본다.

**여기서 관측된 별개의 성질**: 이 게이트의 디자인 트리거는 **EXECUTE 이전**에 평가되는데, 그
시점의 diff에는 이번 작업물이 아직 없다. 2.5.5b에서는 `design_signal=false`(정직한 silent-skip,
receipt에 그대로 봉인)였고, EXECUTE 이후에야 true가 됐다. 즉 **디자인 게이트 화이트리스트를 편집하는
milestone은 자기 pre-EXECUTE 트리거를 구조적으로 켤 수 없다.** §3.9가 이미 인정한 "critique는
산출 diff를 못 본다"와 같은 계열의 성질이고, M4가 만든 것이 아니다.

### 실제로 돈 것

| 단계 | 결과 |
|---|---|
| call-form carrier (M3) | `[mccp:impeccable] call-form: Skill(impeccable:impeccable, ...)` — `resolve`가 source `plugin` · `4.1.1` · `shadowed:false` |
| impeccable Setup | `context.mjs --target scratch-m4-surface.css` 실행 → 실제 PRODUCT.md 컨텍스트 반환 (Users · Product Purpose · Brand Personality) |
| finish 오라클 | `phase=finish mode=auto renderingSurface=1 → clarify:invoke distill:invoke harden:invoke optimize:invoke polish:invoke` |
| 5종 호출 | 전부 완주. **어느 것도 질문하며 멎지 않았다** — UI11이 요구하는 성질이 정확히 이것이다 |
| restamp | `RESTAMP_OK=1`, receipt에 5건 append |

### 세 acceptance 산출물

1. **finish 엔트리 ≥1** — 실측 5건:
   `[{"command":"clarify","call_form":"invoke","status":"invoked"}, {"distill"…}, {"harden"…}, {"optimize"…}, {"polish"…}]`
   receipt: `.claude/receipts/mccp-implement-codex/impeccable-detection-contract-m4.json`
   `receipt_hash: sha256:b996d2547f6307b3b5a89b615c59421fa924d8de276c3347750b29ffb7a7c759`
2. **`shape` non-recommend 0건** — 실측 `[]`. UI11이 라이브에서 성립.
3. **stderr finish 행** — 위 표 3행. Phase 5 REPORT의 `### Design Finish` 소제목은 보고서에 존재.

추가로 **멱등이 라이브에서 검증됐다**: 같은 entries 파일로 restamp를 재생하면
`{"noop": true, "appended": 0, "receipt_hash": null}` — 재봉인조차 일어나지 않는다(Codex F1 흡수의
실동작 확인).

### F2 흡수 경로도 우연히 라이브 검증됐다

첫 restamp 시도가 **설치된 plugin cache(1.31.0, pre-M4)** 의 `cli.js`를 불러
`unknown subcommand "restamp-routed"`로 3회 전부 실패했다. 그 순간 구현한 fail-open 경로가 설계대로
동작했다 — 3회 재시도 · 매회 loud stderr · **entries 산출물 보존**(`$GITDIR/mccp/tmp/…json`, 310B) ·
구현 진행 미차단. 저장소 소스 CLI로 다시 부르자 `RESTAMP_OK=1`로 착지했고 보존된 산출물이 그대로
쓰였다. 사고였지만 관측은 진짜다.

이것은 STATE.md가 이미 적어 둔 미해결 항목의 재확인이기도 하다 — **설치된 cache가 1.31.0이라
`${CLAUDE_PLUGIN_ROOT}` 경유 호출은 여전히 옛 술어로 돈다.** 이 사이클의 명령 본문이 새로 부르는
`restamp-routed`는 사용자가 `claude plugin update`를 돌려 1.31.4 cache가 생기기 전까지 **이 세션 밖에서
동작하지 않는다**. 머지 후 조치 사항이다(§3.7).

### 주장하지 않는 것

- **디자인 내용은 공허하다.** M4는 control-plane 변경이라 유일한 렌더 표면이 내가 만들었다 지운
  합성 파일이었다. 5종이 *완주했다*는 것이 이 항목의 주장이고, *의미 있는 디자인 산출을 냈다*는
  주장이 아니다. plan이 이 한계를 미리 적었고("임시 표면 없이 '완주했다'고 적으면 그것이 정확히 이
  항목이 금지하는 주장이다") 그 경계를 지켰다.
- **2.5.5b pre 패스는 돌지 않았다.** 그 시점 트리거가 false였고, 켜려면
  `MCCP_DESIGN_INTENT_REASON` audited override로 pre 7종 + critique 루프를 합성 파일에 대해
  지불해야 했다 — 비용만 있고 신호가 없어 하지 않았다. 이 사이클이 검증한 것은 **finish 경로**다.
