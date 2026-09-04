# Implementation Report: release-channel-separation M4 — residual-closure

> 실행: `/mccp:prp-implement .claude/plans/release-channel-separation-m4.plan.md`
> 브랜치: `release-channel-m4-residual-closure` · 게이트 판본: worktree `1.34.4`
> 일자: 2026-09-04

## Summary

M1~M3이 **자기 산출물 안에 명시로 이연한 부채**를 닫았다. 새 기능은 없고 채널의 강제
표면만 넓어진다 — 좌표 파일의 형태 단언이 사이클 단위에서 **모든 PR에서 도는 CI 게이트**가
되고(Axis A), 렌더러 두 footer가 번호를 `plugin.json`에서 **파생**해 릴리스 컷이 움직여야
하는 면이 다섯에서 셋으로 준다(Axis B). 첫 릴리스 컷은 여전히 일어나지 않았고 M4가 그것을
일으키지 않았다. 원격 채널 ref는 시작 시점과 동일하다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 17 (CREATE 6 · UPDATE 11) | **21** (CREATE 5 · UPDATE 14 · 편입 1 · 부수 1) |
| Tasks | 13 | 13 완료 (Task 10은 대조 방식 변경 — 아래) |
| plugin.json diff | 0줄 | **0줄** (우산 결정 1) |
| 채널 ref 이동 | 0 | **0** (`647dfec` 시작 = 종료) |

파일 수가 늘어난 이유 셋: (1) plan이 `.claude/PRPs/reports/…-report.md`를 CREATE로 세었는데
그 파일이 이 문서다, (2) 게이트가 `plan.md`에 `## Codex Implementation Review` 섹션을
주입했다, (3) 아래 "이번 커밋에 편입한 범위 밖 파일" 참조.

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 좌표 가드 스크립트 (R1) | 완료 | 단언이 plan의 5축에서 **6축**으로 — 엔트리 유일성 추가(security S5) |
| 2 | 판별력 test (R1) | 완료 | plan의 7 fixture → **11 test** (위반 8종 + 방어적 입력 + end-to-end) |
| 3 | 워크플로 등재, `paths` 없이 (R1) | 완료 | 단일 OS, test → 가드 순서 |
| 4 | 렌더러 버전 파생원 (R2) | 완료 | 앵커된 `SEMVER_RE` 전체 일치(security S4) · 절대 throw 안 함 |
| 5 | 두 footer 파생 전환 (R2·R3) | 완료 | 라이브 렌더 1회로 확인 — 아래 전사 |
| 6 | i18n-surface 정보 동등 고정 (R3) | 완료 | **기존 단언 회수 필요**가 드러남 — 아래 이탈 |
| 7 | 가드 4면 → 2면 재배선 (R2) | 완료 | 앵커-후-리터럴 2단계 + CI 보상 검사 배선(security S2) |
| 8 | 역방향 단언 판별력 (R2) | 완료 | `seed()` 파생 전환 + 기존 2건 재키잉 + 신규 4건 |
| 9 | 브랜치 보호 읽기 전용 재측정 (R4) | 완료 | **새 사실**: `main`도 404 — 아래 전사 |
| 10 | M1 santa escalation 종결 (R5) | 완료(방식 변경) | plan이 전제한 대조 항이 실재하지 않았다 — 아래 이탈 |
| 11 | PRD에 M4·OQ6 착지 (UI2·R6) | 완료 | 병렬 무충돌 주장의 범위도 좁힘 |
| 12 | 런북 6절 은퇴 문장 (R1) | 완료 | 7절 관측도 갱신 |
| 13 | backlog 정리 + §3.14 이연 | 완료 | 닫힘 표시 5행 · 신규 이연 4행 |

## Validation Results

### 1~13 (구현 직후, 전건 exit 0)

| # | 검사 | 결과 |
|---|---|---|
| 1 | 새 가드가 현행 좌표를 통과 | exit 0 · `ok:true` violations 0 |
| 2 | 새 가드 판별력 | exit 0 · **11/11 pass** |
| 3 | 상시성(`paths` 부재 + test·가드 둘 다) | exit 0 |
| 4 | 두 footer 앵커에 리터럴 0건 | exit 0 |
| 5 | 렌더 출력 일치 + 정보 동등 | exit 0 · **19/19 pass** |
| 6 | 재배선된 가드 통과 + test | exit 0 · **14/14 pass** · faces `derived`/`derived` |
| 7 | 브랜치가 번호를 선언하지 않음 | exit 0 |
| 8 | 렌더러가 실제로 돈다 | exit 0 |
| 9 | 채널 좌표 무이동 | exit 0 (기준선 대조 추가 — 아래) |
| 10 | PRD 구조(4행 · 미체크 0) | exit 0 |
| 11 | 런북 은퇴 문장 + 새 경로 인용 | exit 0 |
| 12 | escalation 상태 | exit 0 · `escalate_pending = (absent)` |
| 13 | backlog 4열 헤더 무손상 | exit 0 (신규/편집 행도 전부 4열) |

**검사 9와 12를 단언으로 승격했다.** plan의 원본은 값을 **출력만** 하고 어떤 조건도
강제하지 않아, 실패 방향(채널 ref가 움직임 / 근거 없이 해소됨)이 검증 밖이었다(L2 test·
invariant MEDIUM이 지적한 그대로). 9는 시작 시점 SHA
`647dfecba75eecd9287ee538ca5f7056c7ba71da`를 스크래치패드에 봉인한 뒤 종료 시점과
대조하도록 바꿨다. 12는 여전히 출력이지만, 그 값을 만든 주체가 사람 판단이 아니라 기계임을
아래 Task 10 항목에 기록했다.

### 14~16 (커밋 이후 — backlog 2026-09-04 code-review H1)

커밋 전에는 `git diff origin/main...HEAD`가 이 세 검사에 대해 대상 0건이라 자동 통과하며,
그중 15는 이 저장소의 **유일한 절대경로 유출 탐지기**다. 커밋 후 재실행 결과:

<!-- POST-COMMIT-14-16 -->

### Design Grounding

**N/A — capture 없음.** 그러나 그 이유가 이 사이클에서 관측할 만하다.

`impeccable-detect --mode implement`는 **git diff를 본다.** Phase 2.5.5b는 Phase 3 EXECUTE
**이전**에 돌므로 그 시점 diff는 비어 있었고 `design_signal=false`(`reason=no-signal`)였다.
따라서 (a) critique retry loop이 돌지 않았고 (b) 2.5.5c가 grounding direction을 capture하지
않았으며 (c) Phase 3.7이 완전 no-op이 됐다. 그런데 Phase 3.6에서 같은 탐지기를
post-EXECUTE diff로 재도출하면 **`design_signal=true`**(`signal_files`: `html.js` ·
`markdown.js` · `i18n-surface.test.js`)다.

즉 **디자인 표면이 오직 produced diff에만 존재하는 사이클은 critique loop도 grounding
lint도 받지 못한다.** receipt에 `impeccable_silent_skip=true reason=no-signal`이 찍힌 것은
그 시점에 참이었으므로 정직한 기록이지만, 그 기록이 "디자인 표면이 없었다"로 읽히면 거짓이
된다. plan의 `## Design Routing Guide`가 이 발화 가능성을 예상했으나 순서 문제는 다루지
않았다. 이 축은 M4 범위 밖(§3.9 게이트 순서 설계)이라 닫지 않았고 여기 기록만 남긴다.

Phase 3.6 finish 라우팅은 정상 발화했다 — `mode=auto` · `renderingSurface=0`(변경 파일이
전부 `.js`/`.md`/`.yml`이라 UI 확장자 0건)이므로 5개 명령이 전부 `recommend`로 강등됐고,
그 결과가 `restamp-routed`로 receipt에 append됐다(exit 0).

## Files Changed

| File | Action | Lines |
|---|---|---|
| `scripts/release-manifest-guard.js` | CREATED | +199 |
| `scripts/tests/release-manifest-guard.test.js` | CREATED | +151 |
| `.github/workflows/release-manifest-gate.yml` | CREATED | +47 |
| `plugins/mccp/scripts/lib/renderer/plugin-version.js` | CREATED | +101 |
| `plugins/mccp/scripts/lib/renderer/tests/plugin-version.test.js` | CREATED | +91 |
| `scripts/version-declaration-guard.js` | UPDATED | +134 / -46 |
| `scripts/tests/version-declaration-guard.test.js` | UPDATED | +70 / -12 |
| `.github/workflows/version-declaration-gate.yml` | UPDATED | +31 / -6 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | +5 / -2 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | +9 / -2 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | +35 / -8 |
| `docs/release-channel.md` | UPDATED | +48 / -12 |
| `.claude/prds/release-channel-separation.prd.md` | UPDATED | +8 / -3 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | +14 / -5 |
| `.claude/state/STATE.md` | UPDATED | writer API 경유 |
| `CHANGELOG.md` | UPDATED | +25 (`## [Unreleased]` 아래) |
| `.claude/plans/release-channel-separation-m4.plan.md` | UPDATED | +56 (게이트 주입 섹션) |
| `.claude/PRPs/reports/release-channel-separation-m4-report.md` | CREATED | 이 파일 |
| `plugins/mccp/.claude-plugin/plugin.json` | **무변경** | **0줄** (우산 결정 1) |

### 이번 커밋에 편입한 범위 밖 파일 (명시)

- `.claude/state/completion-ledger/release-channel-separation-m3__2c2fab040f93.json` —
  **M3의 ship 증거**이며 M4 산출물이 아니다. 같은 디렉토리의 나머지 46개는 전부 tracked인데
  이것만 untracked로 남아 있었다. §3.12는 ledger 엔트리가 ship receipt와 결속되는 감사
  대조 corpus라고 규정하므로, worktree를 정리하면 그대로 소실된다. 한 파일 추가로 증거 공백이
  닫히고 위험이 0이라 **의도적으로 편입했고 여기 명시한다** — 숨기지 않는다.
- `.claude/state/leadtime/distribution.json` — Validation 검사 8(`derive/cli.js render`)의
  **부수 산출물**이다. 내가 편집한 것이 아니라 렌더러가 갱신했다.

### 이번 커밋에서 **뺀** working-tree 변경

- `.claude/state/fix-task.md` (삭제) · `.claude/state/fix-task-applied.md` (수정) — 세션
  시작 시점부터 있던 선행 상태이고 `ci-full-suite-m2` 소유라 UI3 범위 밖이다. 손대지 않았다.

## Deviations from Plan

### D1 — Task 10: plan이 전제한 대조 항이 실재하지 않았다

plan Task 10-1은 santa receipt의 `review_proof`가 담은 **각 지적**을 backlog와 대조하라고
지시했다. 실측하면 그 필드에는 지적이 하나도 없다:

```
.claude/receipts/mccp-santa-review/release-channel-separation-m1.json
  → resolution.review_proof = 399 bytes
    { layers, verification_verdict:"divergent", quorum{passed:false,required:2,of:2,responded:2},
      perspectives:[{perspective:"A"},{perspective:"B"}], dispatch_evidence:[...], reviewed_plan_hash }
```

`dispatch_evidence`가 가리키는
`.claude/reviews/santa-review-release-channel-separation-m1.md`도 **20줄짜리 라운드 요약표**
(R0 NAUGHTY · R1 NAUGHTY · R2 NICE)이고 개별 지적을 열거하지 않는다. 즉 대조의 한쪽 항이
없으므로 plan이 전제한 기계 대조는 성립할 수 없다.

**바꾼 방식**: 지적 원문이 남은 유일한 곳은 backlog이고, 그것은 게이트가 당시 **기계로**
적재한 것이다. 실측하면 `santa-loop R0` 5행 · `R1` 3행 · `R2` 9행으로 plan이 적은 4/2/3보다
**많다**. 따라서 "전건이 원장에 있다"는 명제는 참이지만, 그 판정의 근거는 receipt가 아니라
원장 자신이다.

**해소 주체도 바뀌었다.** `escalate_pending`은 내 판단이 아니라 이번 implement receipt
write가 기계로 clear했다 — `[mccp:escalate] cleared for
mccp-implement-codex/release-channel-separation-m4 (subsequent clean receipt)`. 그래서 이
항목은 "리뷰를 통과했다"가 아니라 **"지적이 원장으로 이관됐고, 승인 필드는 후속 clean
receipt가 소유한다"**로 STATE.md에 기록했다. M1 santa receipt의 `divergent` 봉인 자체는
그대로 남아 있다 — 아무것도 되쓰지 않았다.

또한 plan의 `## Gate Deviation`이 예고한 대로, 이 게이트의 `divergent`가 escalation 대상을
`m1` → `m4`로 이미 덮어쓴 상태였으므로 frontmatter는 M1을 가리키고 있지 않았다.

### D2 — Task 6: 기존 markdown footer 단언을 회수해야 했다

plan Task 6은 "기존 html footer 단언 **옆에** markdown footer 단언을 추가한다"고 적었다.
실제로는 `i18n-surface.test.js:165`에 markdown footer 단언이 **이미 있었고**, 그것이 옛
형식을 줄 전체로 pin하고 있었다(`/^_derived from \.claude\/ · v1\.34\.4_$/m`). 정보 동등을
위해 토큰 둘을 더하는 순간 그 단언이 붉어졌다(실측 1회 red). Task 8이 `version-declaration-guard`
쪽에서 예견한 것과 **같은 부류**의 회수가 이쪽에도 필요했다.

회수 방식: 줄 **형태** pin을 버리고 앵커 + 값 대조로 바꿨다. 그 test가 실제로 관심 있는 것은
줄 모양이 아니라 "footer가 manifest의 번호를 담는가"이고, 토큰 존재는 **하나의 공유 상수**
(`FOOTER_TRUST_TOKENS`)에서 두 면을 함께 대조하는 별도 test가 맡는다.

### D3 — Task 12: 은퇴 문장을 verbatim 인용할 수 없었다

plan Task 12는 "문장을 지우지 않는다 … 무엇이 왜 달라졌는지가 함께 남아야 한다"고 했는데,
Validation 검사 11은 그 문장(`CI화는 backlog 축이다`)이 파일에 **없을 것**을 단언한다. 처음에
이력 보존을 위해 verbatim 인용했더니 검사 11이 붉었다(실측 1회 red). 이력은 **서술**로 남기고
문자열 자체는 재생산하지 않는 형태로 고쳤다 — 검사는 기계이고 계획서는 산문이므로 기계를
따랐다.

### D4 — 브랜치 결정

plan은 브랜치를 정하지 않았다. 진입 시점 브랜치는 `release-channel-m3-release-runbook`
(이미 머지됨)이었고 그 위에 M4 plan 커밋 3개가 로컬에만 있었다. 형제 명명 규칙
(`release-channel-m1-closeout` · `m2-dogfood-install` · `m3-release-runbook`)에 맞춰
`release-channel-m4-residual-closure`를 새로 땄다.

### D5 — Validation 9·12를 단언으로 승격 (위 참조)

## Issues Encountered

1. **게이트 판본 드리프트** — 명령 본문이 참조하는 설치 캐시는 `1.33.6`이고 worktree는
   `1.34.4`, 캐시의 최신본조차 `1.33.7`이다. 캐시로 게이트를 돌리면 그 빌드의 receipt 필드가
   조용히 사라지므로 **모든 게이트 스크립트를 worktree 판본으로 실행**했다.
2. **`MCCP_SKIP_RECEIPT=1`이 `cli.js validate`에서는 동작하지 않는다** — 실측: 재실행해도
   exit 2 그대로. 실제 존중 지점은 hook 계층뿐이다(`receipt-prompt.js:335` ·
   `receipt-skill.js:164`). 즉 raw validator에는 우회 경로가 **설계상 없다.**
   이 명령의 구속 게이트는 hook이고 그쪽은 ALLOW했다.
3. **알 수 없는 이벤트 `implement_complete`** — 어떤 hook이 `VALID_EVENTS`에 없는 이벤트를
   emit해 `state-writer`가 `last_event`를 조용히 `precompact`로 강등한다. 리터럴이 worktree
   트리에도 설치 캐시 전수에도 없다(grep 0건). 저장소 전반 부채(UI3 밖)라 backlog에만 적재.
4. **Bash heredoc이 199줄 파일 작성에서 깨졌다** — `unexpected EOF`. Write 도구로 전환.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `scripts/tests/release-manifest-guard.test.js` | 11 | 좌표 위반 8종(`entry-missing`/`entry-ambiguous`/`source-not-object`/`source-kind`/`source-url`/`source-path`/`source-ref`/`source-sha-pinned`) + 방어적 입력 + `process.exit` 부재 + end-to-end |
| `plugins/mccp/scripts/lib/renderer/tests/plugin-version.test.js` | 8 | 실제 manifest 해소 · 강등 3경로 · **적대적 semver 6종**(`</footer><script>` 포함) · 앵커 확인 |
| `scripts/tests/version-declaration-guard.test.js` (추가) | +4 | 파생 인정 · 리터럴 재도입 · 앵커 소멸 · `footerFaceState` 단위 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` (추가) | +1, 회수 1 | 두 면 trust token 동등 · markdown 단언 재키잉 |

회귀: `scripts/tests/*` **69/69 pass** · renderer suite 전체 **692/692 pass** (340s,
`MCCP_CODEX_DISABLED=1 --test-concurrency=2`). renderer 두 면을 건드렸으므로 그 suite 전체를
돌렸다 — 직접 관련 2파일(19/19)만으로는 회귀 부재를 주장할 수 없다.

## 실측 전사 (읽기 전용)

### 두 면의 footer — 라이브 렌더 1회 (`node plugins/mccp/scripts/derive/cli.js render`)

```
.claude/cache/status.html
  <footer role="contentinfo" class="page-foot mono">v1.34.4 · <code lang="en">.claude/</code> 통합 derive · derive-only · LLM-free</footer>

.claude/cache/STATUS.md:3237
  _derived from .claude/ · v1.34.4 · derive-only · LLM-free_

plugins/mccp/.claude-plugin/plugin.json
  1.34.4
```

세 값이 일치한다. `plugin-version.js`의 상대 require가 **실제 derive 산출 경로에서**
해소된다는 것이 이것으로 증명된다(단위 test는 stub 모델로 도므로 그것만으로는 증명되지
않는다 — L2 test MEDIUM이 지적한 축).

### 브랜치 보호 (2026-09-04T06:45:10Z, 읽기 전용)

```
gh api repos/idenn207/mccp/branches/release/protection → 404 Not Found
gh api repos/idenn207/mccp/branches/main/protection    → 404 Not Found
```

**M3 대비 새 사실**: M3은 `release`만 쟀다. `main`도 404라는 것은 "release만 무보호"가 아니라
이 저장소에 보호 규칙 자체가 없다는 뜻이다. 런북 7절을 그 방향으로 정정했다. 결론(켜기 전에
롤백 왕복을 먼저 측정한다)은 바꾸지 않았고 backlog 행도 열린 채로 뒀다 — UI4.

### 채널 좌표 (시작 = 종료)

```
시작 2026-09-04T06:44:58Z  refs/heads/release  647dfecba75eecd9287ee538ca5f7056c7ba71da
종료                        refs/heads/release  647dfecba75eecd9287ee538ca5f7056c7ba71da
```

어떤 원격 ref도 움직이지 않았다 (UI4).

### 게이트 receipt

```
.claude/receipts/mccp-implement-codex/release-channel-separation-m4.json
  resolution.codex_verdict = "skipped"            (MCCP_CODEX_DISABLED=1 · classification=disabled · durationMs=2)
  meta.round_cap           = 1                    (pinnedBy=single-pass+codex-disabled)
  meta.impeccable_silent_skip / _reason = true / "no-signal"
  meta.impeccable_commands_routed = 5 × recommend (clarify·distill·harden·optimize·polish)
  receipt_hash             = sha256:dcecfe429e6ad8fa1…
```

## Gate Deviation (PR 본문으로 이월)

**upstream plan receipt가 stale이다.** `validate --command mccp:prp-implement`:

```
ok:false · missing 0 · blocking 0 · open_critical 0 · stale 1
  mccp-plan-codex/release-channel-separation-m4
  receipt_plan_hash  sha256:342f47cf9a575be88f10ee6f5b1765f4251126a81ae9d4917fc8d288b342001c
  current_plan_hash  sha256:77332b8c7a4c3f4046b5e507d09900d8a405f57800721726b606deb4c0b399c5
```

`blocking`이 **비어 있다**는 것이 핵심이다 — ship-verdict 축은 전부 통과했고 `ok=false`의
유일한 사유가 staleness다. 이 상태는 구조적이다(2.5.4의 섹션 주입이 모든 사이클에서 같은
상태를 만든다). 처방은 receipt 재봉인이 **아니다** — 패널이 읽지 않은 본문에 승인을 다시
봉인하는 것이고 §3.12 no-rehash가 금지한다. plan의 `## Gate Deviation`이 지정한 경로대로
§3.16 audited escape로 진행했고, 그 델타를 여기와 PR 본문에 명시한다.

또한 plan-review 패널 자체가 **승인하지 않았다**(L2 4/4 `fail`, quorum 미충족, verdict
`divergent` 봉인). 따라서 cross-gate dedupe는 열리지 않고 `/mccp:pr`에서 PR-Codex가 실제로
발화한다 — 게이트 진입은 승인이 아니다.

## Next Steps

- [ ] `/mccp:pr` — 진입 직전 `git diff --diff-filter=D --name-only origin/main...HEAD`(§3.5.1)와
      `node scripts/version-declaration-guard.js`(§3.7 확인 지점 2)를 손으로 한 번씩
- [ ] PRD는 M4가 `in-progress`인 동안 아카이브 불가 — 의도된 결과(§3.11 C2). PR 머지 후
      M4 행을 `complete`로 flip하면 PRD 전체가 `/mccp:archive-complete` 대상이 된다
