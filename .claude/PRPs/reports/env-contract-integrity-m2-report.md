# Implementation Report: 환경변수 계약 무결성 — M2 어긋난 값 수리 + 값 의미·멤버 어휘 문서화

- **Plan**: `.claude/plans/env-contract-integrity-m2.plan.md` (그 자리에 유지 — 아카이브는 `/mccp:archive-complete` 소관)
- **Branch**: `env-contract-integrity`
- **Version**: `1.30.2 → 1.32.3` (잠정 — 아래 «머지 전 필수 조치» 참조)
- **Date**: 2026-08-25

## Summary

M1이 격리표로 «보이게» 만든 어긋남 8건을 전부 코드 쪽 사실에 맞추고, 같은 커밋에서 격리표를
비웠다(DD8 한 커밋 불변식). 어휘 상수 승격 6건으로 검사 표면을 넓혔고 그 넓어진 표면이
**오늘 보이지 않던 어긋남 2건**을 새로 드러냈다. 상세 문서 8장에 값별 결과 27 + 멤버 어휘 9
구조 블록을 채운 뒤 **L11**이 그것을 레지스트리와 양방향으로 대조하도록 켰다.

승격 8건 중 2건은 승격이 **틀린 처방**임이 실측으로 밝혀져 사유를 정정했다 — 어휘 gap은
13 → **7**이며, 이 수가 0이 아닌 것이 결함이 아니라 «사유가 참인 것»이 목적이다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 수리·승격은 예측대로였고, 문서 27+9 블록 작성이 실제 부피의 대부분 |
| Files Changed | 28 | 33 (+ 산출물 2: 이 보고서 · implement 게이트 notes) |
| 어휘 gap | 13 → 7 | **7** (명령으로 계수) |
| 승격 | 6건 | **6건** — 전부 ref 결속 확인 |
| 격리 | 8 → 0 | **0** (`L10.quarantined.length === 0`) |
| L11 대상 | enum 27 + list 9 | **36** (`L11.targets`) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 격리 8건 수리 + `QUARANTINE` 배수 | 완료 | 한 커밋 불변식 준수 — 수리와 삭제가 같은 편집 |
| 2 | 승격 4건 (stop-loop · goal · ultracode · evidence-lock) | 완료 | 판정 불변 — 각 소비처 기존 test **무수정** 통과 |
| 3 | 승격 2건 + 그것이 드러낸 수리 2건 | 완료 | `MCCP_BRIEFING=always` 미구현 · `MCCP_CONTEXT_MONITOR_COST_MODE` 3값 전부 no-op |
| 4 | 승격 오판 2건 사유 정정 | 완료 | `session-start.js:168` · `work.md:334` ↔ `orchestration-preview.js:71` 지목 |
| 5 | kind 오기 2건 | 완료 | `int→string`(기본값 `3of4`) · `bool→bypass-flag`, §2 «그 셋» 서사 정정 |
| 6 | `LIST_MEMBER_POLICY` 이전 + 9건 완비 | 완료 | `doctor.js`는 require로 읽고 재-export하지 않는다 |
| 7 | 문서 값별 결과 27 + 멤버 어휘 9 | 완료 | 제거된 값마다 대체 경로 1줄 동봉(DD1) |
| 8 | L11 신설 | 완료 | 파싱 규격 명시 + vacuous-pass 4경로 차단 |
| 9 | 회귀 test 4파일 + 저장소 설정 수리 | 완료 | 101 → **113** tests. 아래 «편차» 참조 |
| 10 | 문서 · 버전 · PRD · CHANGELOG | 완료 | 4면 동기 + 색인 12행 + §2 정정 2건 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 계약 lint L1~L11 | 통과 | exit 0. `quarantined=0` · `L11.targets=36` |
| env-contract 단위 test | 통과 | **113/113** (M1 101건 + 신규 12건) |
| 소비처 회귀 — receipt | 통과 | 657 tests · fail 0 |
| 소비처 회귀 — lib | 통과 | 2398 tests · fail 0 |
| 소비처 회귀 — hooks | 1건 실패 | **선재 red** — 아래 참조 |
| CLI 완주 | 통과 | `doctor` 경고 2 → **0** · `explain MCCP_HOOK_PROFILE` exit 0 |
| version 4면 동기 | 통과 | `i18n-surface.test.js` 10/10 |
| §3.5.1 삭제 검증 | 통과 | 삭제 파일 **0건** |

### 선재 red (M2와 무관)

`hooks/tests/ecc-context-monitor.test.js`의 `Axis B (f)` 1건. **M2 변경 전 파일로 되돌려
돌려도 동일하게 실패**한다(양쪽 23 중 22 pass). env 경계(`MCCP_HANDOFF_THRESHOLDS_USD`)로도
재현되지 않으므로 그 축도 아니다. backlog 적재 완료.

### Acceptance — 실증 확인 4건

기계 test와 별개로 **라이브 1회씩** 확인했다. 「단위 test 통과」와 「경로 작동」은 다른 명제다.

1. **격리 배수가 살아 있다** — `MCCP_HOOK_PROFILE`의 수리를 되돌리자 L10이
   `documented values do not match the code vocabulary — registry=[full,lean,minimal]
   code=[minimal,standard,strict]`로 붉어졌다. 복원 후 exit 0.
2. **L11이 양방향으로 막는다** — 값 한 줄 삭제 → `value \`strict\` is declared in the
   registry but has no row`. 선언에 없는 값 추가 → `row for \`turbo\` has no matching
   registry value`. 둘 다 L11 **단독** 실패.
3. **`doctor` 경고 2 → 0** — 수리된 선언이 주입된 프로세스에서 `error 0 · warning 0 · info 0`.
4. **승격이 판정을 바꾸지 않았다** — 6종 소비처의 test 파일 수정 **0건**으로 전부 통과.

## Deviations from Plan

1. **Codex Implementation Review를 plan 본문이 아니라 notes에 주입했다.**
   plan 본문을 편집하면 `mccp-plan-codex` receipt의 `plan_hash`가 어긋나 `/mccp:pr`의
   staleness guard가 차단한다(M1 plan이 이미 그 상태임을 실측). 커맨드 본문이 notes 경로를
   명시적으로 허용하므로 그쪽을 택했다 → `.claude/notes/env-contract-integrity-m2-implement-codex.md`.

2. **implement receipt의 decision slug을 `env-contract-integrity`로 썼다** (plan 경로에서
   도출되는 `env-contract-integrity-m2`가 아니라). Plan 게이트가 그 slug으로 기록했고
   `/mccp:pr`도 브랜치명에서 같은 slug을 도출하므로, chain이 한 키 아래 모이는 쪽이 정합이다.

3. **깨진 사용 예시가 2건이 아니라 5건이었다.** plan G6은 2건(`MCCP_PLAN_REVIEW` ·
   `MCCP_HOOK_PROFILE`)을 예측했으나, Task 3·5의 수리가 3건을 더 드러냈다
   (`MCCP_CONTEXT_MONITOR_COST_MODE` · `MCCP_AUTO_CHAIN_SKIP_PR` · `MCCP_PLAN_REVIEW_QUORUM`).
   전부 수리했다.

4. **Task 9의 «기존 단언 삭제 0건»을 문자 그대로 지키지 못했다.** 격리표가 비면서 3개
   단언의 전제가 사라졌다. 삭제 대신 **전환**했다: (a) `QUARANTINE.length > 0` → 배수 완료
   단언 + 배수 규칙은 `lint.test.js`의 **합성 격리 fixture**로 이전(규칙 자체는 계속 검사됨),
   (b) `bypass-flag` 3개 → 4개, (c) cli.test의 «격리된 토글 explain» → «배수됐으므로 깨끗하게
   읽힌다». **잃은 것을 명시한다**: CLI의 격리 표면(exit 1 + 격리 문구)은 이제 직접 test되지
   않는다(자식 프로세스라 합성 격리 주입 불가). 그 분기는 L10 fixture와 doctor DD4 test가
   나눠 덮는다 — test 본문에 그대로 적어 뒀다.

5. **`explain`이 값별 결과를 인라인하지 않는다.** Acceptance 문구는 요구했으나 plan의
   Files to Change에 `cli.js`가 없어 범위 밖으로 뒀다. `explain`은 수리된 기본값·코드 어휘·
   상세 앵커를 출력하고 값별 결과 산문은 그 앵커가 소유한다. backlog 적재.

6. **Phase 3.6/3.7이 no-op이다.** 게이트 진입 시 `design_signal=false`(diff 비어 있음)라
   2.5.5c 캡처가 없고, EXECUTE 후 렌더 표면도 **공집합**이다(renderer 2파일의 변경은 version
   리터럴 각 1개). 다만 EXECUTE 후 detector는 `design_signal=true`로 뒤집힌다 — 그 시점차를
   HIGH로 backlog에 적재했다.

## 머지 전 필수 조치 (2건, HIGH)

이 두 건은 `/mccp:pr` 이전 **머지 해소 단계**에서 반드시 처리해야 한다. backlog에도 적재했다.

1. **`env-contract/lint.js`의 L-번호가 main과 정면 충돌한다.** `origin/main`의 L10은
   «evidence가 실제로 그 이름을 가리키는가 (+ not-consumed 역방향 + 래칫)»로 **다른 검사**이고
   9개 체계다. 이 브랜치는 M1의 L10(어휘 결속) + M2의 L11을 갖는다. 파일 구성도 갈렸다 —
   main에만 3파일(`evidence-debt.js` · `evidence-name.js` · `measure-evidence.js`),
   이쪽에만 6파일(`vocabulary.js` · `doctor.js` · `cli.js` · `settings-layers.js` + test 2종).
   §3.5.1대로 «내 쪽 디렉토리를 통째로 취함»은 **금지**이며, 두 L10을 함께 살려 재번호해야 한다.

2. **CHANGELOG version이 두 항목 모두 밀린다.** main에 이미 `## [1.30.2]`가 있고 그것은
   diverse-agent-review PRD의 것이다 — 이 브랜치 M1 항목의 번호와 충돌한다. M2의 `1.32.3`도
   잠정값이며 §3.7대로 (a) 머지 해소 직후 (b) `/mccp:pr` 진입 직전 두 번 재계산한다.

## Files Changed

| 구분 | 수 | 비고 |
|---|---|---|
| env-contract 모듈 | 4 | `registry.js` · `vocabulary.js` · `lint.js` · `doctor.js` |
| 승격된 소비처 | 6 | 판정 불변 — stderr warn 경로만 추가 |
| 상세 문서 + 색인 | 8 | 값별 결과 27 · 멤버 어휘 9 · 색인 12행 · §2 정정 2건 |
| test | 5 | env-contract 5파일, 101 → 113 |
| 버전 4면 + PRD + backlog + settings | 7 | |
| 신규 산출물 | 2 | 이 보고서 · implement 게이트 notes |

총 33 files changed, 977 insertions(+), 233 deletions(-).

## Tests Written

| Test File | 추가 | 커버리지 |
|---|---|---|
| `tests/lint.test.js` | 6 | L11 — 누락 · 잉여(양방향) · placeholder · 블록 부재 · 블록 중복 · 정책표 불일치 |
| `tests/vocabulary.test.js` | 3 | 격리 배수 · `LIST_MEMBER_POLICY` 레지스트리 파생 대조 · 문장 실질성 |
| `tests/registry.test.js` | 2 | gap 7건 + 사유 형태 · 승격 6건 ref 결속 |
| `tests/doctor.test.js` | 1 | `contract-drift` 0건 (배수의 진단 쪽 관측) |

기존 fixture 2건(L10 배수 규칙)은 **합성 격리**로 전환해 규칙 검사를 보존했다.

## Next Steps

- [ ] **머지 해소** — 위 «머지 전 필수 조치» 2건 처리 + §3.5.1 삭제 검증 재실행
- [ ] version 재계산 (머지 직후 · `/mccp:pr` 진입 직전)
- [ ] `/mccp:prp-commit` → `/mccp:pr`
