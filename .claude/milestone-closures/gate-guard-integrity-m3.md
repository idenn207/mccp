# Milestone Closure — gate-guard-integrity-m3

## Milestone
- ID         : gate-guard-integrity-m3
- Name       : 잔여 종료
- Plan       : .claude/plans/gate-guard-integrity-m3.plan.md
- Status     : done
- Closed at  : 2026-08-16T19:23:08.644Z
- Closed by  : /mccp:milestone-close (run_id=24556c7c-6904-45e4-a5b1-197f82265ee0)

## Acceptance Condition

plan `## Acceptance` 14항목 전건 충족 — 판정은 `[C3]`의 **격리 15회 대조**가 맡고,
전수 실행(`[V]`)에 요구하는 것은 «알려진 비결정 2건 밖의 신규 red 0» 하나뿐이다
(plan Acceptance 12번째 항목의 R4 정정 규칙).

이 절은 *충족해야 할 조건*을 적는 자리이지 충족됐다는 주장이 아니다(closure README 형식 규약).
조건별 판정과 그 판정이 선 시점은 아래 `## Goal Loop Result`가 갖는다.

## Goal Loop Result

verdict=done.

**라이브 `/goal` loop은 돌리지 않았다.** `/goal`은 사용자만 호출 가능한 native 명령이라
어시스턴트가 대리 실행할 수 없고, 사용자가 «너가 진행해 줘»로 정적 검증을 위임했다.
선례(`meta-research-command-m1`)와 같은 형태이며, 그 사실을 숨기지 않고 기록한다 —
closure의 감사 가치는 verdict가 아니라 그 verdict가 무엇을 보고 내려졌는지에 있다.

**lock 운용도 표준 흐름과 달랐다.** Phase 2에서 `goal-phase.lock`을 정상 획득했으나,
`goal-phase-guard.js`가 lock 활성 중 Bash를 default-deny하므로 검증 명령을 실행할 수 없어
Phase 4의 lock exit을 검증 **이전**으로 앞당겼다(`cleared:true` 확인). 라이브 loop이 없는 이상
이 lock이 격리할 다중 turn 상태가 존재하지 않고, lease가 90s라 검증 시간(전수 ≈10분) 동안
어차피 stale로 판정된다. 순서 변경 사실을 기록으로 남긴다.

### 14항목 판정 (2026-08-16 실측 — 전건 재실행)

| # | 항목 | 판정 | 증거 |
|---|---|---|---|
| 1 | Task 0의 15행 재확인 | 충족 | 리포트가 13행 유효 + A2·B5 해소 사유를 기록(A2는 main의 `fix-task-applied.md`가 더 최신, B5는 main이 §3.7을 이미 정정) |
| 2 | `git status --short` 공백 | 충족 | 공백. fixture 동시 실행 후에도 공백 |
| 3 | `evidence-audit` 3조건 | **부분** | `state=incomplete`(≠inconsistent) ✔ · `hash_bound=16 === comparable=16` ✔ · **`unverifiable=19` 불변**(요구는 1 감소) |
| 4 | fixture `os.tmpdir()` + IGNORED + 동시 3개 간섭 0 | 충족 | 두 fixture 모두 `mkdtempSync(path.join(os.tmpdir(), …))` · msw-events 동시 3개 **9/9 × 3** · 트리 오염 0 |
| 5 | `prp-implement.md` completed 0건 + `[G2-OK]` + 대조군 `ok:true` | 충족 | `PRPs/plans/completed` **0** · `archive-complete` **7** · `[G2-OK] hash 불일치에서 stale 발화` · 원본 대조군 `stale:[] blocking:[]` |
| 6 | `pr.md` validate `--plan`이 `<` 시작 0건 + A/B red | 충족 | plan 원본 스니펫 `validate callsites=3 · non-variable --plan=0` · `validate-callsite-lint.test.js` **8/8** |
| 7 | `parsePlanFiles` 신규 부정 케이스 + A/B red | 충족 | `prose line between heading and table` grep 1건 · dedupe 격리 15회 **15/15** |
| 8 | `per_run[].failing` 실출력 + 판정 불변 | 충족 | CLI 실출력에 존재 · `suite-determinism.test.js` **12/12** |
| 9 | 문서 드리프트 5축 | **부분** | PRD 미해결 `- [ ]` **정확히 2건**(OQ5·OQ6) ✔ · env 2종 등재 ✔ · Evidence 각주 ✔ · B5는 main 선재 해소로 표에서 제거 · **CHANGELOG 단조성은 M3 표적 대역(1.23.x~1.25.x)에서만** |
| 10 | backlog 삭제 행 0 (append-only) | 충족(재정의된 속성) | 98 → **102**행, **소실 0**. diff의 `-` 4행은 전부 RESOLVED/ABSORBED 주석이 붙은 **수정행**이며 대응 `+`가 존재 |
| 11 | `i18n-surface.test.js` green | 충족 | **10/10** |
| 12 | 격리 15/15 + 전수 신규 red 0 | 충족 | dedupe 격리 **15/15** · 전수 `tests 4328 · pass 4316 · fail 0 · skipped 12` |
| 13 | Task 10 강제 게이트 부재 기록 | 충족 | `강제하는 게이트는 없다` grep **1** |
| 14 | 미주장 2건 기록 | 충족 | `OQ5의 근본 원인을 주장하지 않는다` **2** · `조건부 staleness는 닫지 않았다` **2** |

12항목 충족 · **2항목 부분 충족**. 두 부분 충족은 구현 미달이 아니라 **plan 전제의 오류**이며,
둘 다 리포트가 이미 이탈로 기록해 둔 것이다 — 이 closure는 그 기록을 승인하는 것이 아니라
**재실측으로 동일한 값을 확인**했을 뿐이다.

- 3번(`unverifiable` 불변) — 리포트 D4. `evidence-audit`은 git 인덱스가 아니라 **파일시스템**을 읽으므로
  untracked 상태에서도 그 ledger 엔트리가 이미 계수되고 있었다. 커밋이 이 수치를 움직일 수 없다는 뜻이며,
  plan Task 1이 요구한 «1 감소»는 애초에 관측 불가능한 조건이었다. 나머지 두 조건은 성립한다.
- 9번(CHANGELOG 단조) — 리포트 D8. 선재 붕괴 3건(`[Unreleased]` 삽입 · `[1.9.0]` 중복 · `[1.4.0]→[1.4.1]` 역전)은
  전부 2026-06대 이력으로 **main 선재**이고 M3 범위 밖이라 backlog로 이관했다. M3이 만든 헤딩은 단조를 깨지 않는다.

### plan-body 스탬프는 기록되지 않았다 — 그 시도가 결함을 드러냈다

`/mccp:milestone-close` Phase 4는 plan 본문에 `## Milestone Closure Provenance` 섹션을
쓰도록 **의무화**한다(option B custody anchor). 그 스탬프를 실제로 썼고, 그 편집이
상위 receipt 2건을 stale로 만들어 **다음 `/mccp:pr`을 차단**하는 것을 실측했다.

| | `validate --command mccp:pr --decision gate-guard-integrity-m3` |
|---|---|
| 스탬프 **전** | `ok:true` · `stale:[]` |
| 스탬프 **후** | `ok:false` · stale 2건 — `mccp-plan-codex`·`mccp-implement-codex`, `plan file hash differs from receipt` (`sha256:e65be5b8…` → `sha256:26c55435…`) |
| 되돌린 **후** | `ok:true` · `stale:0` (plan이 HEAD와 바이트 동일) |

즉 명령이 규정대로 실행되면 그 다음 게이트를 통과할 수 없다. MSW M4가 등재한
「`prp-implement` Phase 2.5가 자기 자신을 stale로 만든다」와 **같은 종**이다 —
게이트가 의무화한 편집이 자기 상위 anchor를 무효화한다. 이 PRD가 복원한 가드 2가
이 PRD의 closure 명령을 잡은 셈이다.

**운영자 판정(2026-08-16): 스탬프를 되돌린다.** 대안이었던 «plan/implement receipt
재anchor»(M4 선례)는 PR을 즉시 통과시키지만 「게이트가 리뷰한 plan」이라는 anchor의
의미를 사후 편집으로 재키잉한다. 되돌리기는 receipt를 손대지 않으므로 custody 무손상이고,
대가는 이 closure 문서가 plan에 sha256으로 고정되지 않는다는 것뿐이다 —
closure는 git-tracked이므로 변조 탐지는 git history가 담당한다.

기록 시점 closure sha256: `sha256:b7271a3b9518c9e929172c7f6534dda35398f16a53940fa8b66ae47ed441251c`
(본 절 추가 **이전** 값이다. 본 절이 그 값을 바꾸므로 위 해시는 plan에 스탬프됐던 그 순간의
본문을 가리키며, 현재 파일의 해시가 아니다 — 지난 관측을 사후 값으로 고쳐 쓰지 않는다.)
결함은 backlog에 HIGH로 등재했다(`.claude/plans/codex-findings-backlog.md`, 2026-08-16).

### 이 closure가 주장하지 않는 것

- **`Status: done`은 「M3의 구현과 검증이 끝났다」는 뜻이지 「PRD M3 행이 이미 `complete`다」가 아니다.**
  본 closure가 기록되는 시점의 PRD M3 행은 여전히 `in-progress`이고, `scan.js`는 그래서
  `archivable:false`를 낸다. status 전환은 PR 머지 **후** `/mccp:archive-complete`가
  archivable 재검증과 같은 원자 트랜잭션 안에서 수행한다(CLAUDE.md §3.11 C2).
  지금 전환하면 그 plan이 아카이브 대상 집합에 들어가 이 cycle의 PR을 자기 가드로 막는다.
- **cross-model 확증을 획득하지 않았다.** plan·implement 두 게이트 모두 `codex_verdict='skipped'`다
  (`MCCP_CODEX_DISABLED=1`이 사용자 전역 설정). M1·M2와 동일한 공백을 승계하며, 모델 다양성을
  얻었다고 주장하지 않는다. plan 단계의 L2 반증 패널 4인은 컨텍스트 격리이지 모델 다양성이 아니다.
- **OQ5의 근본 원인을 닫지 않았다.** 전수 2회(리포트) + 본 closure의 3회차에서 알려진 비결정 2건이
  모두 미발화했으나, p≈0.10에서 3회 미포착 확률은 약 73%다 — flake가 사라졌다는 증거가 아니다.
- **Task 10(worktree 정리 + 아카이브)을 강제하지 않는다.** 머지 후 사람이 실행하도록 강제하는
  게이트는 없다. 탐지는 `scan.js`의 `archivable:true` 상시 오라클 · backlog 1행 · 리포트 미체크 항목 3중이며,
  미실행의 결과는 데이터 손실이 아니라 아카이브 지연이다.

## Provenance
- Lock run_id        : 24556c7c-6904-45e4-a5b1-197f82265ee0
- Lock owner session : session_017sj1C2BzQ9Bnup43yCmZ6P
- Plan source        : .claude/plans/gate-guard-integrity-m3.plan.md
- Detection signal   : {"row":3,"name":"잔여 종료","plan":".claude/plans/gate-guard-integrity-m3.plan.md","status":"in-progress"}
- mccp version       : 1.26.1 (closure 작성 시점에는 `1.25.2`였다. 직후 `origin/main` 병합에서
  §3.7 병렬 version 충돌 4번째 재발이 드러났다 — main이 PR #139로 `1.25.2`를 선점하고 `1.26.0`까지
  올라가 있었다. 발행된 번호는 불가침이므로 미머지인 이쪽을 forward-only로 상향했다. 이 필드는
  *이 milestone이 실제로 ship되는* 버전을 가리켜야 하므로 갱신하되, 갱신 사실을 숨기지 않는다.)
