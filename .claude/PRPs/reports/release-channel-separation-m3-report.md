# Implementation Report: release-channel-separation M3 — release-runbook

**Plan**: release-channel-separation M3 (`.claude/plans/` 의 M3 계획서)
**Branch**: `release-channel-m3-release-runbook`
**Base**: `2cb173c` (origin/main, 2026-09-04)
**Date**: 2026-09-04

## Summary

`docs/release-channel.md`를 만들었다. 7개 절 — 채널 구조 · 릴리스 컷 · 롤백 ·
fast-forward 불가 처리 · 컷 트리거 · 컷 밖에서도 즉시 도달하는 잔여 · 한계 — 이고
**각 절이 측정됨/전사됨/미측정 중 하나로 라벨된다.**

이 마일스톤이 스스로 지목한 유일한 실패 모드는 "아직 한 번도 실행되지 않은 절차를
실행된 것처럼 읽히게 두는 것"이다. 그래서 라벨은 장식이 아니라 1급 내용이고, 라벨의
**존재**는 검증 블록 검사 15가 기계로 잡는다(정직성 — 컷 절이 정말 미측정인가 — 은
여전히 사람이 본다).

**2차 라이브 리허설은 하지 않았다.** M1이 리허설을 돌린 노출 0 창은 PR #168 머지와 함께
닫혔고, 오늘 같은 리허설을 반복하면 운영자의 실제 설치가 두 번 강등·복귀한다. 대신 M3은
런북의 **읽기 전용 절반**을 실제로 완주했다(아래 실측 원문). 쓰기 절반의 증거는 M1의
기록이며 문서가 그 구분을 라벨로 밝힌다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small |
| Files Changed | 7 (CREATE 2 · UPDATE 5) | 7 (CREATE 2 · UPDATE 5) |
| Live rehearsal | 0회 (설계상) | 0회 |
| Validation checks | 15 | 15 전건 exit 0 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 브랜치 + 삭제 사고 검사 | 완료 | 분기가 아니라 **fast-forward** — 편차 D1 |
| 2 | 릴리스 좌표 읽기 전용 실측 | 완료 | 6항 전건, 아래 원문 |
| 3 | `docs/release-channel.md` | 완료 | 7절 · 전건 라벨 |
| 4 | README 포인터 | 완료 | 설치 명령 3줄 무변경 |
| 5 | CLAUDE.md §3.7 포인터 | 완료 | 절차 미이전 — lint C1~C4 pass |
| 6 | PRD 갱신 | 완료 | OQ1·2·3·5 답 기입, 미체크 0건 |
| 7 | CHANGELOG `## [Unreleased]` | 완료 | 번호 선언 0 |
| 8 | 이연 축 backlog 적재 | 완료 | 3행 + code-review 이연 2행 = 5행, `scanBacklog` invalid_count 0 |
| 9 | 보고서 + 유출 검사 | 완료 | 이 문서 |

## 실측 원문

2026-09-04. **어떤 좌표도 움직이지 않았다** — 전부 읽기 전용이다. 경로는 `<HOME>` ·
`<PLUGINS>`로 치환했다.

### 1. 채널 좌표 (원격 직접 읽기)

```
$ git ls-remote origin refs/heads/release
647dfecba75eecd9287ee538ca5f7056c7ba71da	refs/heads/release
```

remote-tracking ref가 아니라 `ls-remote`를 쓴 이유는, 캐시된 ref는 "채널이 움직이지
않았다"와 "fetch 기구가 죽어 옛 값을 되읽는다"를 같은 모습으로 만들기 때문이다.

### 2. fast-forward 판정 쌍

```
$ git merge-base --is-ancestor origin/release origin/main; echo "exit=$?"
exit=0

$ git merge-base --is-ancestor origin/main origin/release; echo "exit=$?"
exit=1
```

**쌍이어야 의미가 있다.** 정방향만 재면 "항상 0을 내는 검사"와 구별되지 않는다. 역방향이
비영점이라는 것이 `release`가 `main`의 **진부분** 조상임을 확인한다.

### 3. 노출 간극 — 컷 트리거의 오늘 값

```
$ git rev-list --count origin/release..origin/main
162

$ git log -1 --format='%ci  %h  %s' origin/release
2026-09-01 10:10:57 +0900  647dfec  chore(state): env-contract-integrity 잔여 state 회전 — stuck escalation 해소 (#167)

$ git log -1 --format='%ci  %h  %s' origin/main
2026-09-04 09:45:24 +0900  2cb173c  feat: ci-full-suite M2 — suite-green (red 16파일 6갈래 귀속) (#177)

days since release tip: 3.0
```

계획서 Risks가 적은 값(2일 · 138커밋)은 계획 작성 시점의 관측이다. 3일 만에 24커밋이
더 쌓였다 — 편차가 아니라 이 지표가 실제로 움직인다는 증거이고, 다음 사이클이 대조할
기준선이다.

### 4. 되돌릴 좌표 — 태그 실재

```
$ git ls-remote --tags origin | grep -i "mccp--v"
647dfecba75eecd9287ee538ca5f7056c7ba71da	refs/tags/mccp--v1.33.6
```

태그 SHA와 `release` SHA가 같다. UI7이 말하는 "태그가 있으면 `sha` 없이도 되돌릴 좌표가
남는다"가 오늘 실제로 성립한다.

### 5. 설치 상태 쌍

```
path: <HOME>/.claude/plugins/installed_plugins.json
key: mccp@mccp
{
  "scope": "user",
  "installPath": "<PLUGINS>/cache/mccp/mccp/1.33.6",
  "version": "1.33.6",
  "installedAt": "2026-08-11T04:46:45.216Z",
  "lastUpdated": "2026-09-01T07:39:27.674Z",
  "gitCommitSha": "647dfecba75eecd9287ee538ca5f7056c7ba71da"
}

origin/release SHA (from git ls-remote): 647dfecba75eecd9287ee538ca5f7056c7ba71da
installed gitCommitSha:                  647dfecba75eecd9287ee538ca5f7056c7ba71da
match: true
```

**이 쌍이 "채널이 잡고 있다"의 오늘 증거다.** `main`이 162커밋 앞서 있는 동안 설치는
`1.33.6`/`647dfec`에 고정돼 있다 — 즉 채널 분리가 의도한 대로 작동하고 있다.

### 6. 브랜치 보호

```
$ gh api repos/idenn207/mccp/branches/release/protection
{"message":"Not Found", ..., "status":"404"}
```

보호는 **없다**. DD7이 예측한 그대로이며 켜지 않는 이유와 켜기 전에 재야 할 것은
backlog 행이 소유한다.

## Validation Results

계획서 `## Validation` 블록 15개 검사 전건 exit 0.

**두 번 돌렸고, 두 실행은 같은 것을 재지 않았다 (code-review H1 수용).** 첫 실행은
커밋 **전**이었는데 그 시점 이 브랜치는 커밋이 0개였고 산출물 6개가 untracked라
`git diff origin/main...HEAD`가 빈 출력이었다 — 즉 커밋 diff를 보는 검사 2·12·13이 대상
0건으로 자동 통과했다. **그중 13은 이 저장소의 유일한 절대경로 유출 탐지기**이고, 같은
사이클이 L2 security finding 2건을 흡수해 그 pathspec을 4→7파일로 넓히고 fail-open guard까지
붙인 직후였다. 넓힌 pathspec이 아무 파일도 담지 않았다는 뜻이다.

두 번째 실행은 커밋 후다. 관측 창이 실제로 열렸다:

```
$ git rev-list --count origin/main..HEAD
2

$ git diff --name-only origin/main...HEAD | wc -l
12

$ git diff --unified=0 origin/main...HEAD -- docs README.md CLAUDE.md CHANGELOG.md \
    .claude/PRPs/reports .claude/prds .claude/plans/codex-findings-backlog.md | grep -c '^+'
610
```

검사 13이 0줄이 아니라 **610줄**을 스캔하고 통과했다. 아래 표의 결과는 이 두 번째 실행의
것이다. 라이브 유출은 두 실행 어느 쪽에서도 없었다 — 변경 12파일 전수 스캔 0건이며,
차이는 유출 유무가 아니라 **탐지기가 볼 것이 있었는가**다.

| # | 검사 | 결과 |
|---|---|---|
| 1 | 채널 좌표 무이동 (`ls-remote` = `647dfec…`) | pass |
| 2 | 릴리스 표면 4파일 diff 부재 | pass |
| 3 | manifest 형태 (`git-subdir`·`ref: release`·`sha` 부재) | pass |
| 4 | ambient `MCCP_RELEASE_CUT` 부재 + version 선언 가드 | pass |
| 5 | 산출물 2건 실재 | pass |
| 6 | README·CLAUDE.md 포인터 | pass |
| 7 | 런북이 아카이브될 plan/PRD를 인용하지 않음 | pass |
| 8 | 런북의 16진 좌표 6종 전부 해소 | pass |
| 9 | lease 없는 강제 이동 3형태 부재 | pass |
| 10 | PRD 미체크 Open Question 0건 | pass |
| 11 | instruction-contract lint (C1~C4) | pass |
| 12 | 삭제 파일 0건 | pass |
| 13 | 추가된 줄의 절대 경로 0건 | pass |
| 14 | 오늘 날짜 backlog 행 ≥3 | pass (5행 — code-review 이연 2축 추가 후. `scanBacklog` ok:true · invalid_count 0) |
| 15 | 런북 전 절의 증거 라벨 존재 | pass (7/7) |

### 판별력 대조

전건 통과만으로는 "게이트가 작동한다"와 "게이트가 아무것도 보지 않는다"가 구별되지
않는다. 그래서 관측 쌍 둘과 **흔들기 3축**을 함께 쟀다.

관측 쌍(값이 서로 달라야 상수가 아니다):

1. **FF 판정 쌍** — 정방향 exit 0 / 역방향 exit 1.
2. **설치 상태 쌍** — `version`과 `gitCommitSha`가 **함께** `origin/release`를 가리킨다.
   어느 한쪽만 보면 값이 맞는 것과 옛 값을 되읽는 것이 같아진다.

흔들기(산출물을 일부러 어긋내고 검사가 실제로 붉어지는지 확인 — 각 probe 뒤 즉시 복원,
최종 sha256이 원본과 동일함을 확인했다):

| Probe | 심은 위반 | 결과 |
|---|---|---|
| A | 라벨 없는 `## 임시 절` 추가 | 검사 15 `FAIL: 임시 절` · exit 1 |
| B | `=` 없는 lease 형태를 산문에 추가 | 검사 9b 탐지 → HALT 발화 |
| C | 실재하지 않는 16진 좌표 `deadbee` 추가 | 검사 8 `unresolvable token` → HALT 발화 |
| D | 런북에 절대 경로 1줄 추가 (code-review 후 추가) | **커밋 전 exit 0(미탐지)** / 커밋 후 exit 1 `HALT: an added line carries an absolute path` |

Probe C는 검사 8의 fail-closed 방향도 함께 보여준다 — 지어낸 좌표는 물론 우연히 16진으로만
이뤄진 영어 단어도 붉어진다. 완화가 아니라 좌표 문서에서 그 토큰을 치우는 것이 정답이며,
이번 문서의 토큰 6종은 전부 실재 커밋이다.

복원 확인: `sha256=24ab21cbbb5335bc22247faee7298f713f340051b7ce74512b390f1d715699b4`
(probe A~C 전후 동일).

**Probe D가 A~C와 다른 점**: A~C는 전부 파일을 직접 읽는 검사(15·9·8)를 흔들었고 그래서
커밋 상태와 무관하게 발화했다. D가 겨냥한 13은 커밋 diff를 보므로 **같은 위반이 커밋
전에는 통과하고 커밋 후에는 HALT한다** — 그 비대칭이 A~C만으로는 드러나지 않았다.
D의 커밋-후 측정은 원 브랜치를 건드리지 않도록 임시 브랜치에서 수행하고 즉시 삭제했다
(복귀 후 HEAD 불변 · 트리 clean 확인).

## Deviations from Plan

**D1 — Task 1은 "분기"가 아니라 fast-forward였다.** 계획서는 브랜치를 `origin/main`에서
딴다고 적었는데, 브랜치는 이미 `52e11d7`(M2 머지 커밋)에 서 있었고 그 사이 `origin/main`이
24커밋 전진해 있었다. HEAD는 자기 커밋이 0개이고 `origin/main`의 **진부분 조상**이었으므로
`git merge --ff-only origin/main`으로 동기화했다. 결과는 계획이 의도한 상태(= `origin/main`
tip에서 시작)와 같고, 삭제 0건을 확인했다(§3.5.1). 겹치는 dirty 파일 1건
(`codex-findings-backlog.md`)은 append 1행이라 따로 보관했다가 아래 D2대로 처리했다.

**D2 — 보관해 둔 backlog 행을 되붙이지 않았다. 상류가 그 축을 이미 닫았다.** 계획서
`## Review Absorption`의 재진입 문단이 이연한 1건(L1 `CITATION_RE`가 `.claude/` 파일의
콜론 인용을 해소하지 못한다)은 base 동기화가 가져온 `0fe532f`이 정확히 고쳤다 —
`CITATION_RE`의 첫 문자 클래스에 선택적 선행 점이 생겼다. 실측 확인:

```
captured = .claude/prds/release-channel-separation.prd.md
exists   = true
```

닫힌 축을 열린 것처럼 적재하면 backlog가 거짓을 갖는다. 그래서 되붙이지 않고 여기
기록한다. **계획서의 "이연 총계 1건"은 이 실행 뒤 0건이다.**

**D3 — Acceptance의 "검사 1~14"는 15개를 뜻한다.** 검사 15는 L2 패널의 test HIGH를
흡수하며 신설됐는데 Acceptance 줄의 범위 표기가 함께 갱신되지 않았다. 15개 전부 돌렸다.

**D4 — 이 사이클은 승인 receipt 없이 착지한다.** `mccp-plan-codex/release-channel-separation-m3.json`은
존재하지 않는다. 계획서가 기록한 대로 DD13 plan-hash 결속(흡수 편집이 `reviewed_plan_hash`를
어긋나게 했다)과 소진된 라운드 캡(`rounds:[{index:0}]`, 봉인 `cap:1`)이 함께 그 receipt의
봉인을 **구조적으로 불가능**하게 만들었고, 이 사이클은 위조 대신 부재를 택했다.
`/mccp:prp-implement` 진입은 운영자가 명시한 감사 override로 이뤄졌다:

```
MCCP_SKIP_INTENT_GATE="L2 panel round 0 returned divergent and absorbing all 15 findings
changed the plan body, so the DD13 plan-hash binding makes receipt sealing structurally
impossible while round cap 1 refuses re-review; proceeding under CLAUDE.md 3.16 with
PR-Codex left fail-closed"
```

**진입은 승인이 아니다.** cross-gate dedupe는 `converged`가 아닌 모든 값에 fail-closed이므로
`/mccp:pr`에서 PR-Codex가 실제로 발화한다.

**D5 — Implement-Codex는 발화하지 않았다(정책).** `MCCP_CODEX_DISABLED=1`이 이 환경의
영구 운영자 정책이고 Phase 2.5.0이 그것을 봉인했다. 결과: `classification=disabled` ·
`blocking=false` · `durationMs=1` · receipt `codex_verdict=skipped`. 장애가 아니라 정책이며
receipt가 그 사실을 그대로 봉인한다. 라운드 캡도 같은 자리에서 봉인됐다
(`cap=1 mode=enforce pinned-by=codex-disabled`).

**D6 — impeccable design gate는 silent-skip이다.** implement 단계 탐지기가
`design_signal=false` (`reason=no-signal`)를 냈다. 계획 단계에서는 키워드 기반으로
`true`였지만 implement 탐지기는 diff를 보고, 이 diff에 렌더링 표면이 없다 — 계획서의
`## Design Routing Guide`가 예상한 그대로다. critique loop·stage routing 미발화,
design-direction 캡처 없음 → **Phase 3.7 DESIGN GROUNDING VERIFY는 no-op**이다.

## Issues Encountered

**측정 도구의 셸 이스케이프.** 설치 상태를 읽는 일회성 스크립트를 heredoc으로 넣었을 때
역슬래시가 한 겹 먹혀 `SyntaxError`가 났다(2회). 스크래치패드에 파일로 쓰고 실행해
해소했다. 산출물에는 영향이 없고 측정값도 바뀌지 않았다 — 기록해 두는 이유는 같은 형태의
경로 치환 코드를 다음 사이클이 다시 쓸 것이기 때문이다.

**산출물 편집 도구가 문서를 2.4배로 부풀렸다 (복구 완료).** 런북의 태그 목록 명령을 고치려고
Node의 `String.replace`를 썼는데, 치환 문자열 끝이 `$'`였다 — 그것은 리터럴이 아니라 **매치
이후 전체 텍스트**를 뜻하는 치환 패턴이다. 두 번의 replace가 각각 자기 뒤 문서 전량을 복제해
297줄 파일이 726줄이 되고 절 헤딩이 4번 반복됐다. 파일은 untracked라 `git checkout`으로
되돌릴 수 없었다.

복구는 팽창이 결정론적이라는 성질을 썼다 — `head + PREFIX + tail + B + tail` 형태를 역산해
두 꼬리가 실제로 동일함과 가운데가 `B`임을 검증한 뒤 잘라냈고, **원본 sha256
`24ab21cb…`와 바이트 단위로 일치**함을 확인하고서야 디스크에 썼다(불일치면 쓰지 않고 throw).
재적용은 `split`/`join`으로 했다 — 치환 패턴을 해석하지 않는다.

부수로 하나 더 나왔다: 첫 재적용본은 `grep -v '^{}$'`였는데 이스케이프가 한 겹 먹혀
**`^`가 앵커로 읽히는 틀린 필터**(줄 전체가 `{}`)가 됐다. peeled ref를 하나도 걸러내지
못한다. 정규식 대신 `grep -vF '^{}'` 고정 문자열로 바꾸고 실제 `ls-remote` 출력에 대해
동작을 확인했다. 두 사고 모두 같은 교훈이다 — **문자열을 조립해 파일을 고칠 때는 조립
계층마다 해석기가 하나씩 더 있다.** 위의 셸 이스케이프 항목과 같은 계열이고, 다음 사이클이
같은 형태의 편집을 할 것이므로 남긴다.

## Files Changed

| File | Action |
|---|---|
| `docs/release-channel.md` | CREATED |
| `.claude/PRPs/reports/release-channel-separation-m3-report.md` | CREATED |
| `README.md` | UPDATED |
| `CLAUDE.md` | UPDATED |
| `.claude/prds/release-channel-separation.prd.md` | UPDATED |
| `CHANGELOG.md` | UPDATED |
| `.claude/plans/codex-findings-backlog.md` | UPDATED |

**건드리지 않은 것** (검사 2가 기계로 확인): `.claude-plugin/marketplace.json` ·
`plugins/mccp/.claude-plugin/plugin.json` · renderer 두 면.

## Design Grounding

N/A — design trigger 미발화(D6). 캡처 아티팩트가 없으므로 Phase 3.7은 no-op이었다.

## Tests Written

없다. 이 마일스톤의 산출물은 산문 문서이고, 검증은 계획서 `## Validation` 블록 15개 검사가
수행한다(그중 3·8·9·15는 산출물 자체를 기계로 읽는다). DD2대로 새 스크립트도 CI 워크플로도
만들지 않았다 — 컷이 아직 한 번도 실행되지 않아 자동화가 무엇을 지키는지 정의되지 않는다.

## Next Steps

- [ ] `/mccp:pr` — PR-Codex가 실제로 발화한다(dedupe 미개방). 진입 직전 `git diff --diff-filter=D`
      재확인.
- [ ] PRD 종료 후 `/mccp:archive-complete` — M3 행이 complete가 되면 PRD 전 milestone이
      닫힌다.
- [ ] 첫 릴리스 컷(번호 `2.0.0`, 시점은 운영자 소유)이 돌면 런북 2절의 라벨이 미측정에서
      측정됨으로 바뀌고, 검증 블록 검사 1의 리터럴이 그 컷의 좌표로 갱신된다.
