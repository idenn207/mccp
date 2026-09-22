# Implementation Report: halt-step-recording (orchestrator-step-wiring M2)

**Plan**: `.claude/plans/orchestrator-step-wiring-m2.plan.md` (활성 위치 유지 — 아카이브는 `/mccp:archive-complete` 소유)
**Branch**: `orchestrator-step-wiring`
**Version**: `1.34.4 → 1.35.0` (minor — 이 PRD의 마지막 milestone)
**Date**: 2026-09-03

## Summary

`/mccp:work`가 멈춘 지점이 기록된다. `work-orchestrator.js`에 `record-halt`(producer)와
`last-halt`(repo-wide reader)가 생겼고, `work.md`의 halt 종료 지점 11개 전부가 recorder를
동반하며, 진입 배너가 A1 줄 옆에서 직전 halt를 한 줄로 읽는다.

배선을 지키는 것은 산문이 아니라 `work-command-body.test.js`의 8개 정적 단언이다. 특히
표 ↔ 배선 **양방향** 일치와 표 분모 ↔ 실측 exit 수 등식을 함께 강제하므로, 표를 줄여서
커버리지를 만족시키는 길이 막혀 있다.

## Gate 상태 (정직한 기록)

| 축 | 상태 |
|---|---|
| `mccp-plan-codex` receipt | **부재** — L2 패널이 `divergent`(halt at `5.2e`)로 멈춰 receipt를 쓰지 못했다. 사유·대가는 plan의 `## Gate Record` 절이 소유 |
| plan L2 findings | 16건(HIGH 4 · MEDIUM 7 · LOW 5) **전부 흡수, 이연 0건** — plan 본문에 위치 표시 |
| Implement-Codex | `classification=disabled` (`MCCP_CODEX_DISABLED=1` 영구 운영자 정책) → `codex_verdict='skipped'` 봉인. cross-gate dedupe 미개방 → `/mccp:pr`에서 PR-Codex 정상 발화 |
| security-reviewer | **HIGH 1건(S1) 발견 → ACCEPT_NOW 흡수**. 나머지 5개 공격 표면은 근거와 함께 기각 |
| impeccable (게이트 시점) | `skill_available=1`, `design_signal=0` → silent-skip(`no-signal`). critique loop 미발화, grounding capture 없음 |
| impeccable (Phase 3.6 finish) | `design_signal=1`로 **뒤집힘** — 아래 "관측" 참조. 5건 전부 `recommend` 강등, receipt에 restamp |
| chain validate | `ok=false` — 원인은 위 plan-codex 누락 **단일 건**(stale/blocking/open_critical 전부 0). 사용자 승인 하에 감사된 우회로 진행 |

**우회 사유**: plan `## Gate Record`(2026-09-03)에 기록된 사용자 판단 — "plan을 고치고
receipt는 포기". 재실행 경로는 라운드 캡 소진(`rounds_so_far=1`, `cap=1`, `mode=enforce`)으로
기계적으로 막혀 있고, 캡 상향은 §3.16의 우회 목록에 없다. receipt는 **위조하지 않았다**.

## security-reviewer S1 — 흡수한 HIGH

`--reason`이 터미널 control character / ANSI escape를 필터 없이 통과시켜 git-tracked
STATE.md에 영구 보존되고, 배너가 저장소 전체에서 매 진입마다 unescaped로 재생한다.

**액면 수용하지 않고 독립 반증했다**:

```
oneLineExcerpt(scrubAbsPaths("verdict=\x1b]0;PWNED\x07\x1b[2J..."))  → raw ESC 잔존 = true
JSON.stringify(...)  → on-disk 안전 = true      (컨테이너는 깨지지 않는다)
JSON.parse(...)      → raw ESC 복원 = true      (소비 지점에서 원상 복구된다)
```

즉 **저장은 안전하고 재생이 위험한** 형태였다. 어느 리뷰 축도 이 gap을 거르지 않았다 —
L2 HIGH 4건에도, R0 critique 5건에도 없고, Codex는 `disabled`로 발화하지 않았다.

흡수 4곳: DD7 후단 · Task 3 (2) · Task 4 (3) · Task 5 (11), 그리고 Acceptance에 항목 추가.
구현은 `scrubAbsPaths` → `stripAnsi`(재사용) → C0/C1/DEL 제거 → `oneLineExcerpt` 순이며,
**reader도 자신이 읽은 레코드에 같은 좁히기를 다시 적용**한다 — 쓰기 시점 좁히기만으로는
이미 디스크에 있는 구버전 레코드를 되돌릴 수 없기 때문이다(test 11c가 그 축을 겨냥한다).

`MCCP-GATE-STOP`을 내지 않은 이유: 그 규칙이 막는 것은 *결함을 안은 채 Phase 3로 넘어가는
것*이고, S1은 위 흡수로 제안 구현에서 제거됐다. §3.14(HIGH는 그 자리에서 흡수) + §3.16
(라운드를 늘리지 않는다)의 적용이다.

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `recordChainProgress` present-only 3필드 | 완료 | 기존 4필드 직렬화 무변경(키 순서 포함) |
| 2 | `auto-chain.recordStep` 침묵 catch 제거 | 완료 | 동작 무변경, 침묵만 제거. sidecar도 present-only 준수 |
| 3 | `record-halt` producer | 완료 | 봉쇄 가드 → 입력 좁히기 → work_unit 해소 → 기록. 전체 try/catch, 항상 exit 0 |
| 4 | `last-halt` repo-wide reader | 완료 | `worktrees.js` export 확대(`SCAN_TIMEOUT_MS`·`DEFAULT_CAP`·`parseCap`) |
| 5 | producer/reader 단위 test | 완료 | 24 test — (1)~(11) 전 항목 + 좁히기 단위 표면 2건 |
| 6 | `work.md` halt 사이트 표 | 완료 | 13행(shell 11 + prose 2) |
| 7 | 13개 halt 지점 배선 | 완료 | shell 11건 전부, prose 2건은 산문 지시 |
| 8 | 정적 wiring test | 완료 | 8 단언 (a)~(h) 전부 green |
| 9 | 진입 배너 | 완료 | A1 뒤, 같은 fold 형태. 부재/실패 구분 |
| 10 | halt 1회 유발 | 완료(부분) | 아래 "Task 10의 경계" 참조 |
| 11 | version 4면 동기 + CHANGELOG + PRD | 완료 | `1.35.0`. 번호는 `/mccp:pr` 직전 재계산 필요 |

### Task 4 — 계획 대비 실제 결정 정정

plan의 implement-time 결정 I1은 `worktrees.js` export를 **2개**(`SCAN_TIMEOUT_MS`·`DEFAULT_CAP`)로
적었으나 실제로는 **3개**를 내보냈다 — `parseCap`을 포함했다. 상한은 상수가 아니라 정책이고
(`MCCP_WORKTREE_SCAN_CAP`), 숫자만 가져가면 그 토글이 한쪽 순회에만 먹어 두 순회가 서로 다른
범위를 보게 된다. L2 architect MEDIUM이 지목한 "재사용을 주장하는 추상화가 도달 불가한 값을
가리킨다"를 실제로 닫으려면 `parseCap`이 필요했다.

## Validation Results

| # | 항목 | 결과 |
|---|---|---|
| 1 | 변경 모듈 단위 test (4 파일) | **104 pass / 0 fail** |
| 2 | 인접 회귀 (state-journal 2 + worktrees-source) | **42 pass / 0 fail** |
| 3 | 명령 본문 lint S1~S3 (3 파일) | **49 pass / 0 fail** |
| 4 | 4면 version drift (`i18n-surface`) | **10 pass / 0 fail** |
| 5 | env 계약 lint L1~L12 | **전부 ok** (아래 발견 1건 수정 후) |
| 6 | producer/reader 왕복 (격리 fixture, 출력 단언) | pass — `직전 halt: step=implement site=3.preflight (…) reason=roundtrip fixture` |
| 7 | fail-open (a) 거부 + (b) 실제 쓰기 실패 | pass — (a) 부작용 0 + loud, (b) exit 0 + loud |
| 8 | halt 사이트 커버리지 | **exits=11 · record-halt=11 · shell rows=11** |
| 9 | 삭제 검증 (§3.5.1) | **0건** |

### Validation 5가 잡은 실드리프트 1건 (수정함)

`work.md`에 사이트 표와 배너를 삽입하면서 아래 줄이 밀려, env-contract registry의
`MCCP_WORK_IMPLEMENT_PARALLEL` evidence 포인터 `work.md:239`가 L10에서 FAIL했다. 같은
문장(`PARALLEL="${MCCP_WORK_IMPLEMENT_PARALLEL:-1}"`)이 `:311`로 이동했음을 base와 대조해
확인하고 재지정했다. 이 milestone이 만든 드리프트이므로 여기서 고쳤다.

## 관측 — 디자인 신호가 EXECUTE 전후로 뒤집혔다

게이트 시점(2.5.5b)에는 `design_signal=0`(`no-signal`)이라 critique loop도 grounding capture도
발화하지 않았다. EXECUTE 후 Phase 3.6에서 다시 도출하니 `design_signal=1`(`ok`)이었고, 원인은
version 4면 동기가 건드린 `renderer/html.js`·`renderer/markdown.js` 두 파일이다.

즉 **디자인 표면이 실제로 생겨서가 아니라 control-plane 파일 2개를 만졌기 때문에** 신호가
켜졌다. 오라클도 그것을 알아본다 — `renderingSurface=0`이라 finish 5건이 전부 `recommend`로
강등됐다. 이 사이클에서 잘못된 것은 없지만, 게이트 시점과 finish 시점의 신호가 갈릴 수 있고
그 갈림이 **버전 bump 같은 무관한 편집**으로 발생한다는 사실은 기록해 둔다.

## Files Changed

| File | Action | 규모 |
|---|---|---|
| `plugins/mccp/scripts/lib/work-orchestrator.js` | UPDATE | +262 |
| `plugins/mccp/commands/work.md` | UPDATE | +89 |
| `plugins/mccp/scripts/lib/auto-chain.js` | UPDATE | +23 / -8 |
| `plugins/mccp/scripts/state/state-writer.js` | UPDATE | +15 / -5 |
| `plugins/mccp/scripts/derive/sources/worktrees.js` | UPDATE | +9 |
| `plugins/mccp/scripts/lib/tests/work-halt-record.test.js` | CREATE | 423 |
| `plugins/mccp/scripts/lib/tests/work-command-body.test.js` | CREATE | 228 |
| `plugins/mccp/scripts/state/tests/state-writer.test.js` | UPDATE | +38 |
| `plugins/mccp/scripts/lib/tests/work-orchestrator.test.js` | UPDATE | +33 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | +1 / -1 (evidence 재지정) |
| `plugins/mccp/.claude-plugin/plugin.json` · `renderer/html.js` · `renderer/markdown.js` · `CHANGELOG.md` | UPDATE | version 4면 동기 |
| `.claude/prds/orchestrator-step-wiring.prd.md` | UPDATE | M2 행 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | LOW 1건 이연 |

## Deviations from Plan

1. **`worktrees.js` export 3개** (I1은 2개로 적었다) — 위 "Task 4" 참조.
2. **prose 2건을 fenced bash에 넣지 않았다.** 초안 배선은 ```bash fence로 넣었는데, 그러면
   `command-body/blocks`가 그것을 shell 배선으로 세어 (d) 표 대조와 커버리지 등식(exits=11
   vs recs=13)이 **둘 다 깨진다** — 표가 "산문이라 기계가 못 본다"고 적은 진술 자체가 거짓이
   된다. inline code로 내려 해소했다.
3. **`env-contract/registry.js`가 Files to Change에 없었다.** 위 Validation 5 항목 참조 —
   이 milestone의 삽입이 만든 드리프트라 같은 사이클에서 닫는 것이 맞다고 판단했다.

## Issues Encountered

- **이 저장소 STATE.md를 합성 halt로 1회 오염시켰다가 제거했다.** 셸 fallback(`||`) 때문에
  첫 `record-halt`가 fixture가 아니라 저장소 cwd에서 실행됐다. 이는 plan이 L2 invariant
  MEDIUM으로 흡수해 Validation 6을 격리 fixture로 다시 쓰게 만든 바로 그 오염이며,
  제가 shell 실수로 실제로 재현했다. `chain_progress` 블록만 외과적으로 제거하고
  (`grep -c chain_progress` = 0), 재파싱과 `last-halt` 침묵을 확인했다. 이후 Task 10은
  격리 fixture 안에서 수행했다.
- heredoc과 inline `node -e`가 tool 경계에서 백슬래시 이스케이프를 접는 현상이 반복돼,
  백슬래시가 필요한 편집은 파일로 authoring한 뒤 splice하는 방식으로 전환했다. 코드에는
  영향 없다.

## Tests Written

| Test File | Tests | 범위 |
|---|---|---|
| `work-halt-record.test.js` | 24 | present-only · fail-open(throw/sidecar) · DD7 좁히기 · DD2 `'unknown'` 부재 · reader 부재/파손/전역최신 · 봉쇄 가드 부작용 0 · scrub 순서 · supersession · 절삭 · control character (a)(b)(c) |
| `work-command-body.test.js` | 8 | (a) 커버리지 · (b) stderr 보존 · (c) DD5 · (d) 표↔배선 양방향 · (e) site 유일/step enum · (f) UI5 리터럴 pin · (g) 배너 pin · (h) 분모 pin |
| `state-writer.test.js` (추가) | +2 | present-only 존재/부재 양방향 · 명시 null 미실체화 |
| `work-orchestrator.test.js` (추가) | +3 | 기존 export 불변 · HALT_STEPS 어휘 · site 정규식 수용/거부 |

## Task 10의 경계 (부분으로 남긴다)

halt를 1회 유발해 두 증거를 캡처했다 — `chain_progress`에 `status:'halted'` 항목이 생겼고,
배너 블록을 **verbatim 실행**해 그 줄이 나왔다:

```
[mccp:work] 직전 halt: step=implement site=3.preflight (2026-09-03T06:26:44.438Z) reason=next-step reported HALT before implement
```

다만 hook과 명령 본문은 worktree가 아니라 `~/.claude/plugins/cache/mccp/mccp/<version>/`에서
로드되므로(§3.7), **라이브 `/mccp:work` 완주는 이 사이클에서 불가능**하다. verbatim 실행까지가
가능한 최강 증거이며 "라이브 완주"를 주장하지 않는다 — M1이 같은 경계에서 지표 5를 부분으로
남긴 선례를 그대로 따른다.

## 주장하지 않는 것

- **지표 4의 런타임 축은 여전히 미측정이다.** DD3대로 사이트 커버리지(11/11)로 측정했고
  그것은 test가 매 실행 강제한다. "멈춘 `/mccp:work` 중 기록된 비율"은 독립 관측원이 없어
  정의상 100%이거나 측정 불가다.
- **prose 2건은 기계가 강제하지 않는다.** 표에 `enforcement: prose`로 열거해 분모에 남겼을
  뿐이다. 숨기지 않았다는 것이 여기서 주장할 수 있는 전부다.
- **halt 원인 분류와 자동 진행은 하지 않는다** (UI6 — C9 소유). 어느 step에서 멈췄다까지다.

## Next Steps

- [ ] `/mccp:prp-commit`
- [ ] `/mccp:pr` — **진입 직전 version 재계산**(§3.7 forward-only; 이 브랜치는 M1에서 3회 재상향 실측)
- [ ] PR 본문에 plan `## Gate Record` 절을 receipt 부재의 근거로 인용
- [ ] PRD 종료 후 `/mccp:archive-complete` (M1·M2 모두 complete가 된 뒤, 사람 게이트)

---

## 사후 code-review 흡수 (2026-09-04, `/mccp:code-review` 로컬 모드)

구현 직후 로컬 리뷰에서 HIGH 2 · MEDIUM 3 · LOW 6이 나왔고 **전건 흡수**했다. 아래 둘은
실행으로 재현한 것이라 가설이 아니다.

### HIGH-1 — supersession 규칙이 도달 불가였다

`last-halt`는 "chain_progress의 마지막 항목이 halted일 때만" 주장하도록 설계됐는데, 그
원장에 **non-halted 항목을 쌓는 호출자가 명령 본문에 0건**이었다(`grep record-step
commands/*.md` → 0). 즉 모든 항목이 halted라 규칙이 구조적으로 발동하지 못했고, 첫 halt
이후 모든 진입이 같은 줄을 무기한 재생했다 — Task 4 (6)이 명시적으로 막으려 한 상태이자,
Task 9가 전제한 "평소 미표시"가 최초 halt 이후 거짓이 되는 상태다. 실측: 이 worktree의
`chain_progress`는 halt 1건(2026-09-03T06:25:42Z)만 갖는데 그 뒤 M2 구현 전체가 진행된
시점에도 배너가 같은 줄을 냈다. reader 규칙만 test하면(test (9)) 이 사실이 보이지 않는다.

배선한 진전 지점은 둘이고 각각 닫는 축이 다르다 — Step 3.verify 통과(`--step implement`)가
`3.*` halt를, Phase 3 도달(`--step pr`)이 `0.dirty-tree`·`2t.commit`을 닫는다. 둘 다 실제
진전에서만 도달하므로 **고치지 않은 재진입으로는 배너가 사라지지 않는다**. A1 완주 지표는
무관하다(UI3) — 완주의 정의도 그 producer도 건드리지 않고, `chain_progress`는 DD1이 갈라
놓은 별개 채널이며 여기 쌓인 값은 배너 신선도 판정에만 쓰인다. producer의 존재 자체는
`work-command-body.test.js (i)`가 고정한다.

### HIGH-2 — 부재가 실패로 오보됐다

`readStateFrontmatter`가 `parseStateMd`를 직접 불렀고, 그 함수는 frontmatter 부재·
`state_version` 불일치에 stderr WARNING("resetting state")을 쓴다. 배너 wrapper는 stdout이
비면 **stderr 첫 줄**을 실패 사유로 삼으므로, halt가 없을 뿐인 정상 상태가
`halt 배너 생략: [mccp:state-writer] WARNING: unsupported state_version …`으로 표시됐다
(격리 fixture로 재현). DD1이 읽기를 저장소 전체로 넓혔으므로 **다른 worktree 하나의 파손이
모든 worktree의 진입 배너를 오염**시킨다. 게다가 그 문구는 이 경로가 아무것도 쓰지 않는데도
리셋이 일어난 것처럼 읽힌다.

두 겹으로 닫았다 — `parseStateMd(raw, {quiet})`로 관찰자 경로의 노이즈 자체를 없애고
(기본값 무변경), 배너는 reader 자신의 접두(`[mccp:last-halt]`)를 단 줄만 사유로 채택한다.
후자가 있어야 미래에 다른 계층이 stderr를 내도 같은 오보가 재발하지 않는다.

### 나머지

| 심각도 | 항목 | 조치 |
|---|---|---|
| MEDIUM | reader 재강제가 `reason`·`step`·`site`에만 적용, `ts`·`work_unit` 누락 + step/site는 접히지 않아 개행이 배너를 여러 줄로 만듦 | `safeField`로 네 필드 전부 동일 좁히기(텍스트·`--json` 양쪽). 회귀 test (13) |
| MEDIUM | `work-command-body.test.js` (a)/(c)가 **블록 단위 근사** — 한 블록에 recorder 1 + exit 3이면 뒤 둘이 무임승차 | 1:1 소비 pairing으로 교체(문자 위치 기준). 판정기 자신을 합성 입력으로 검증하는 (c2) 추가 |
| MEDIUM | PRD M2 status를 `complete`로 선반영해 `archive-complete/scan.js`가 미머지 작업을 `archivable:true`로 판정(실측) | plan이 지정한 `in-progress`로 정정. 재실행 시 `archivable:false` 확인 |
| LOW | `DEFAULT_CAP` 미사용 export | 제거 — 상한은 숫자가 아니라 `parseCap` 정책으로 나간다 |
| LOW | CHANGELOG가 아직 존재하지 않는 `scripts/version-declaration-guard.js`를 강제 수단으로 지목 | 소유 브랜치와 미도달 사실을 명시 |
| LOW | backlog 마지막 행이 leading `\|` 없이 시작 | 표 행 형태로 정정(파서는 fallback으로 읽고 있었으나 렌더에서 표 밖) |
| LOW | `auto-chain` sidecar 주석의 "레코드 모양을 맞춘다"가 `ts` 형식 차이를 덮음 | 맞춘 것이 **키 집합**임을 명시 |
| LOW | `recordChainProgress`가 함수가 아닌 경우는 catch를 타지 않아 침묵 | 같은 크기의 stderr 추가 |
| LOW | `truncated.kept`가 부분 답이 있었던 것처럼 읽힘 | `cap`으로 개명 + 배너 문구 `절삭(cap n/총)` |
| LOW | `---` 뒤 빈 줄 누락 | 정정 |

### 재검증

| 검사 | 결과 |
|---|---|
| `work-halt-record` + `work-command-body` | 36 pass (신규 (12)(13)(i)(c2) 포함) |
| 인접 회귀 11파일 | 383 pass |
| `state/tests` 전체 | 217 pass |
| `derive/tests` 전체 | 136 pass |
| `env-contract/lint.js` | L1~L12 ok (evidence anchor `work.md:311 → :322` 재고정) |
| supersession 라이브 | halt 표시 → 진전 기록 후 침묵 → 새 halt 재표시 (3단계 확인) |
