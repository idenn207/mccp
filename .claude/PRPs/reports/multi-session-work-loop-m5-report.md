# Implementation Report: multi-session-work-loop M5 — 상태 진실원 이전

**Plan**: [.claude/plans/multi-session-work-loop-m5.plan.md](../../plans/multi-session-work-loop-m5.plan.md)
**Version**: `1.23.7 → 1.23.10` (계획 1.23.8 → main #126이 1.23.8을, #131이 1.23.9를 각각 선점해 §3.7 forward-only로 두 번 상향 — **6번째 재발**) · **Branch**: `v1.24.0-multi-session-m5`
**Design doc**: [docs/multi-session-work-loop/state-truth-source-design.md](../../../docs/multi-session-work-loop/state-truth-source-design.md)

## Summary

세션 간 진실의 원천을 되돌릴 수 없는 요약 문서(STATE.md)에서 **append-only 저널**로
옮기고 STATE.md를 그 저널의 **파생 투영물**로 강등했다. `state-writer.update()`는
이제 "레코드 append → 재투영 → 기존 `renderState` → `contentHash` 비교 →
`writeStateAtomic`" 경로를 타며, **공개 시그니처와 렌더 바이트는 한 줄도 바뀌지
않았다**. 재생 방어는 `(work_unit, seq)` high-water + `session_epoch` + tombstone
3자의 순수 오라클로 고정했고, tombstone은 git-tracked `completion-ledger`에서
재수집되므로 클론·`git clean` 이후에도 살아남는다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 대형 코호트 제약대로 **분할 없이 완주** |
| Tasks | 10 | 10 (전부 착지) |
| Files Changed | 31 | 31 (CREATE 17 · UPDATE 14) |
| 신규 토글 | 정확히 1 | 1 (`MCCP_STATE_JOURNAL`) |
| 회귀 단언 | Task별 열거 | **77건** (매니페스트 대조 absent 0 — PR-Codex 흡수 10건 포함) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 진입 조건 + 단언 매니페스트 | 완료 | **진입 조건 결과가 plan과 달랐다** — 아래 D1 |
| 1 | 레코드 스키마 + 순서 오라클 | 완료 | 판정 우선순위 ③/④ 해석 조정 — D2 |
| 2 | 저널 store + genesis 부트스트랩 | 완료 | ledger 스키마 오독 발견·수정 — D3 |
| 3 | 투영 + `state-writer` 재배선 | 완료 | `created_at` 재파생 결함 발견·수정 — D4 |
| 4 | 재생 방어 | 완료 | |
| 5 | 이력 보존 정책 | 완료 | 상한 3종 상수 확정 (UI6 응답) |
| 6 | 질의 표면 (`journal query|verify|checkpoint`) | 완료 | verify 5축 |
| 7 | 단일 writer 불변식 lint | 완료 | lint 자체 결함 발견·수정 — D6 |
| 8 | A4 경계 분자 + CL-5 3곳 | 완료 | `work_unit` 밀림 발견·수정 — D5 |
| 9 | 설계 문서 + PRD 갱신 | 완료 | |
| 10 | 릴리스 동기 | 완료 | 4면 + CHANGELOG (i18n test는 M4 이후 plugin.json 파생이라 리터럴 없음) |

## Validation Results

| # | Check | Status |
|---|---|---|
| §1 | 신규 모듈 회귀 8파일 | ✅ 77/77 |
| §2 | 기존 표면 무회귀 (state-writer · injector · breakpoint · spawner) | ✅ 199/199 |
| §3 | 전체 스위트 | ✅ **3584 tests / 3576 pass — 신규 red 0** (실패 3건 중 2건은 사전 존재 b2-coverage-gate, 1건은 병렬 부하 flake `perf-budget`으로 단독 실행 시 통과) |
| §4 | `journal verify` · `journal query` | ✅ exit 0 |
| §6 | 계측 무-LLM 계약 | ✅ 0 hit |
| §7 | 릴리스 면 동기 | ✅ plugin.json · html.js · markdown.js · CHANGELOG · ENVIRONMENT |
| §10 | `single-writer-lint --json` | ✅ exit 0 (위반 0) |
| §11 | 매니페스트 대조 `absent 0` | ✅ 77/77 present |
| Task 9 | `instruction-contract/lint.js` | ✅ C1~C4 pass (CLAUDE.md 절 변경 0) |
| §3.5.1 | `--diff-filter=D` 의도치 않은 삭제 | ✅ 0건 |
| SHIP-1 | 배포 확인 | ❌ **미확인** (설계상 ship 시점 전용 — 아래 G5) |

### 사전 존재 red 대조

전체 스위트의 2건 실패는 **전부 사전 존재분**이다: `b2-coverage-gate` 정적 lint가
`plugins/mccp/scripts/lib/plan-codex-runner.js`의 `fs.renameSync(receiptPath, dest)`
하나를 잡는다. STATE.md Open Questions에 "main이 b2-coverage-gate 2건으로 이미 red —
origin/main clean checkout 실측 확인 · #118 소관"으로 기록돼 있고, 이번 브랜치는 그
파일을 **건드리지 않았다**(`git diff --name-only` 0 hit). 위반 목록에 M5 파일은 한
건도 없다.

## 보증 판정 (G1~G5)

| # | 판정 | 근거 |
|---|---|---|
| G1 | **충족** | 투영 밖 `writeStateAtomic` 호출부 0(lint 축 1) · degraded 5단계 회귀 · `recordChainProgress`도 같은 임계구역을 거치도록 통합해 write 호출부가 저장소 전체에서 하나 |
| G2 | **충족** | 재생 회귀 6종(잔존 · `superseded_by` · 투영 불변 · **mtime 무변경** · TTL 경과 후 동일 · 정상 재개 양성) + ledger seed 27건 |
| G3 | **충족** | 동일 patch 시퀀스 **byte-identical** · 파서별 전후 동등 · 양쪽 파서 고정 기대값 · `next_chunk` divergence pin · 조건부 필드 14종 전수 · 블록 스칼라 round-trip |
| G4 | **충족** | 압축 전후 투영 동등 · 세그먼트 **회전**(삭제 0) · checkpoint 접점 정확 · 크래시 지점 수렴 · 상한 3종 개별 발화 |
| G5 | **분자 배송 충족 / 전환 미확인** | 아래 |

### G5 — 미달 처리 (§G5 조건성대로 사전 고정된 경로)

`Validation-SHIP-1`이 실패한다: `plugin.json` 1.23.10이 설치 캐시에 없다 = 이 사이클은
`claude plugin update`를 수행하지 않았다. 따라서 그 뒤의 "실측"은 **성립할 수 없다**.
plan이 사후 협상을 막기 위해 미리 고정한 처리를 그대로 밟는다:

1. `computed` 주장 **하지 않음**
2. `measurement-instrumentation.md` A4 행을 `forward-only`로 **유지**(분자가 배송됐다는
   사실과 전환 조건을 행 안에 명시)
3. PRD Delivery Milestones M5 status를 순정 `complete`가 아니라
   **`complete (인정 조건 미충족: A4 전환 미확인)`** 로 기록 → §3.11 C4 기준상
   non-canonical이라 `/mccp:archive-complete`가 보수적으로 아카이브를 거부하며,
   **그 거부가 의도된 표식**이다

SHIP-2의 3-state 판정은 배포가 없었으므로 **실행 자체가 무의미**하다(세 채널 모두
배포 후에만 신호를 낸다). 현 상태는 3-state 중 `producer 미실행`에 해당하며, 그것이
결함이 아니라 미배포임은 SHIP-1이 독립적으로 증명한다.

## Deviations from Plan

**D1 — 잔여 7("provisional 스키마 위에서 진행")의 전제가 사실과 달랐다.**
`measurement-feasibility.md`의 STATUS는 `PROVISIONAL`이 아니라
`RE-FROZEN — 2026-07-24`다. plan 작성 시점의 오독이며 차단이 아니라 *완화*이므로
진행하고 설계문 §2에 정정을 남겼다.

**D2 — 판정 우선순위 ③/④의 해석을 조정했다.** plan은 ③을 `seq ≤ highWater →
admit-superseded`, ④를 same-seq epoch 비교로 적었다. 그런데 `highWater`는 정의상
admit된 최대 seq이므로 동시 append로 같은 seq를 받은 두 번째 레코드는
`seq ≤ highWater`를 **항상** 만족한다 → ④가 도달 불가능한 죽은 규칙이 된다. plan이
④의 별도 회귀 단언을 요구하므로, 두 규칙이 모두 효력을 갖는 유일한 해석은 same-seq
충돌을 역행보다 먼저 보고 역행을 strict `<`로 두는 것이다. **plan이 명시 계약으로
못박은 "②가 epoch보다 먼저"는 그대로 보존**했고 회귀가 그것을 단언한다.

**D3 — `completion-ledger` 스키마 오독(구현 중 발견·수정).** 최초 구현이 top-level
`decision_id`를 읽어 실측 **32건 전부가 corrupt**로 계상됐다(실제는
`{schema_version, entry:{decision_id,…}}`). DD11이 요구한 corrupt 카운터가 이 결함을
드러냈다 — 조용히 0건을 seed했다면 G2가 성립한다고 오독됐을 자리다. 수정 후 27개
distinct 작업 단위 seed.

**D4 — `created_at` 재파생(구현 중 발견·수정).** 재투영이 매 호출마다 replay 시각으로
`created_at`을 덮어써 "이 상태가 처음 만들어진 시각"이 미래로 밀렸다. 기존 회귀
`read-modify-write preserves unspecified fields`가 검출. 레코드의 `ts`를 결정론적
앵커로 고정했다(`updated_at`/`last_event_at`은 반대로 "지금"이 맞으므로 손대지 않음 —
M5 이전 경로도 매 write마다 now를 찍었고 최종값이 동일).

**D5 — `work_unit` 한 칸 밀림(구현 중 발견·수정).** 해석이 기존 frontmatter만 읽어
작업 단위를 바꾸는 바로 그 변형이 *이전* 단위로 기록됐다. patch를 frontmatter보다
먼저 본다.

**D6 — lint 자체가 CL-5 형태를 통과시켰다(구현 중 발견·수정).** 순진한
`\(([^)]*)` 인자 추출이 `fn(process.cwd())`의 첫 `)`에서 끊겨 **잡아야 할 형태 바로
그것**을 놓쳤다. 부정 fixture가 검출했고 괄호 균형 스캔으로 교체했다.

**D7 — plan 아카이브를 수행하지 않았다.** command body Phase 5는 plan을
`.claude/PRPs/plans/completed/`로 옮기라고 하지만, 이 저장소의 실제 관례는 §3.11이
소유한다 — 아카이브는 **PRD 전체 완료 시** `/mccp:archive-complete`가 수행하며, M4의
plan도 `.claude/plans/`에 그대로 있다. 지금 옮기면 `/mccp:pr`의 chain 검증이 참조하는
경로가 사라지고 §3.11 C2(미완료 PRD의 plan 이동 금지)와도 충돌한다.

**D8 — `recordChainProgress`를 공용 임계구역으로 통합했다(계획 밖 최소 변경).**
lint 축 1이 "투영 경로 밖 `writeStateAtomic` 0"을 요구하는데, `recordChainProgress`가
자기 write를 갖고 있어 축 1이 **자기 모듈 안에서 이미 거짓**이었다. `applyLocked`
하나로 묶어 호출부를 1개로 만들었다(이미 락 안이라 `update()` 재진입 대신 직접 호출).

## Issues Encountered

- **`discoverRepoRoot`가 환경 때문에 항상 성공한다** — Windows temp 경로의 조상
  `C:\Users\<user>`에 실제 `.claude/`가 있어 40단계 walk-up이 그것을 찾아낸다. "repo
  밖"을 파일시스템으로 흉내 내는 fixture는 이 환경에서 성립하지 않으므로, 해당
  회귀는 `discoverRepoRoot` 주입으로 환경 독립화했다.
- **ledger 부재 경고가 매 `update()`마다 발화**해 hook stderr를 덮었다(§3.4 신호 vs
  노이즈). 프로세스당 1회로 억제하되 침묵하지는 않게 했다. 손상(`corrupt`) 경고는
  억제 대상에서 제외 — 그쪽은 매번 시끄러워야 하는 무결성 신호다.

## Files Changed

| 구분 | 수 | 목록 |
|---|---|---|
| CREATE (구현) | 8 | `lib/state-journal/{record,order,project,retention,index,single-writer-lint}.js` · `state/journal-store.js` · `lib/msw-metrics/a4-boundary-restore.js` |
| CREATE (derive) | 1 | `derive/sources/session-journal.js` |
| CREATE (test) | 8 | `lib/tests/state-journal-{order,projection,replay,retention,single-writer}.test.js` · `lib/tests/a4-boundary-restore.test.js` · `lib/tests/state-journal-integrity.test.js`(PR-Codex 흡수) · `state/tests/journal-store.test.js` |
| CREATE (docs) | 2 | `state-truth-source-design.md` · `m5-assertion-manifest.json` |
| UPDATE | 13 | `state/{state-writer,cli,handoff-items}.js` · `hooks/{session-start,session-end}.js` · `lib/msw-metrics/index.js` · `derive/index.js` · `renderer/{html,markdown}.js` · `plugin.json` · `.gitignore` · `CHANGELOG.md` · `docs/ENVIRONMENT.md` |
| UPDATE (docs) | 3 | `evidence-conflict-design.md` · `measurement-instrumentation.md` · PRD |

## Security

사전 `security-reviewer` **실발화** — findings 7건(CRITICAL 0 · HIGH 3 · MEDIUM 3 ·
LOW 1) 전건 트리아지, DEFER 0건. 상세는 plan의 `### Security Reviewer` 표. 흡수 결과:

- **신규 축 2건** — 프로토타입 오염 경로(저널 라인·ledger 엔트리 양쪽 회귀 fixture로
  차단 확인) · seq 충돌 잔여 정밀화(잔여 4에 "손실이 기록으로 남음"을 명문화)
- **구현 불변식 3건** — checkpoint rename 이후에만 세그먼트 회전 · `--reseed`가 폐기
  범위를 새 genesis에 봉인 · malformed > 0에서 `verify` 비영점 exit
- **기각 1건** — "`verify`가 투영↔디스크 divergence를 못 잡는다"는 사실 오류(3중 검사
  ②가 정확히 그것)
- **위협 모델 밖 1건** — `--reseed` 인가 게이트/rate limit(저장소 write 권한자는 저널
  파일을 직접 지울 수 있으므로 CLI 게이트가 막지 못한다). 감사 축 절반만 수용

## PR-Codex R1 — 첫 cross-model 발화 결과 (실결함 3건 · override 없이 수정)

`/mccp:pr`에서 `MCCP_CODEX_DISABLED`를 해제해 PR-Codex를 실제로 발화시켰다.
verdict `needs-attention` (**No-ship**), HIGH 3건. `lock_exit_ok:true` ·
`mutations:[]`로 review-only 불변식은 지켜졌다. 세 건 모두 코드 대조로 실결함임을
확인하고 **audited override를 쓰지 않고 수정**했다.

| # | 지적 | 판정 | 수정 |
|---|---|---|---|
| C1 | 프로덕션 레코드가 안정적 session epoch을 못 받음 (0.93) | **실결함** | `journalApply`의 `ledgerRead` 기본값을 실제 `session-ledger.readLedger`로. 세션당 per-process 메모(hot path) |
| C2 | 손상 레코드가 투영을 구동 (0.90) | **실결함** | read 경로 해시 검증 + 격리. checkpoint는 격리 불가 → degraded. 부트스트랩의 손상-checkpoint 덮어쓰기도 차단 |
| C3 | 큰 patch가 조용히 절단/폐기 (0.88) | **실결함** | patch 절단 전면 제거. 표현 불가 시 절단이 아니라 append 실패 → degraded |

**공통 형태가 이 milestone의 교훈이다**: 세 건 모두 단위 test가 *강등 분기*(C1은
`ts-fallback`)나 *작은 입력*(C3)만 시험해 통과했고, **프로덕션 경로와 권위 경로는
한 번도 확인되지 않았다**. C2는 plan(DD6.3)이 명시한 격리를 구현하지 않았는데도
`verify` test가 통과해 가려졌다. 신규 회귀 7건은 전부 프로덕션/권위 형태로 다시
썼다(`state-journal-integrity.test.js`).

수정 중 추가로 드러난 것: 손상 checkpoint를 `readCheckpoint`가 null로 돌려주므로
**부트스트랩이 그것을 "부재"로 보고 새 genesis로 덮어썼다** — 격리가 아니라 증거
인멸이다. Codex가 지적한 범위보다 한 칸 더 나빴고, 회귀 test가 그것을 잡았다.

## PR-Codex R2 — 병합 트리 재발화 (실결함 2건 · 역시 override 없이 수정)

R1 흡수 + `origin/main`(#131) 병합 후 최종 트리로 재발화. **R1의 3건은 재발하지
않았고 새 축 2건**이 나왔다.

| # | 지적 | 판정 | 수정 |
|---|---|---|---|
| D1 | 압축이 순서 인덱스를 버려 압축 후 지연 레코드가 admit됨 (HIGH, 0.90) | **실결함** | checkpoint에 `order_index` 봉인 + `buildOrderIndex`가 복원 |
| D2 | `enforceLimits` 호출부 0개 — 상한 3종이 한 번도 발화 안 함 (MEDIUM, 0.86) | **실결함** | write 경로에 배선(읽은 레코드 재사용). 압축 실패는 loud warn |

**R1과 같은 사각이 다시 확인됐다**: 회귀가 압축 전후 *상태*는 대조했지만 *순서
메타*는 보지 않았고, 보존 정책은 *오라클*만 시험하고 *발화*는 시험하지 않았다.
즉 두 라운드 모두 "산출물은 맞는데 메커니즘이 배선되지 않은" 형태였다. 신규 회귀
3건은 전부 메커니즘 축이다(압축 후 admission · 회전된 tombstone · CLI 없는 자동 발화).

## Cross-model 검증 상태 (정직 기록)

- **Plan-Codex · Implement-Codex 모두 미발화** — `MCCP_CODEX_DISABLED=1`(user-level
  정책)이라 spawn 직전 short-circuit. 두 receipt 모두 `codex_verdict='skipped'`.
- **L2 refutation 패널은 11라운드 전부 divergent**(3명 동시 pass 0회) — plan 잔여 8이
  선언한 대로 **미승인 상태로 진행**했다.
- **따라서 이 milestone은 아직 cross-model 검증을 한 번도 받지 않았다.** 회복 경로는
  `/mccp:pr` 실행 시 `MCCP_CODEX_DISABLED`를 해제해 PR-Codex를 실제로 발화시키는
  것이다. cross-gate dedupe는 `codex_verdict='skipped'`에서 fail-closed이므로
  PR-Codex는 **skip되지 않는다**.

## Next Steps

- [ ] `/mccp:prp-commit` → `/mccp:pr` (PR 본문에 G5 미달 처리 명시)
- [ ] **G5 전환 확인**: `claude plugin update` → 새 세션 1회 → `SHIP-1`·`SHIP-2` 재실행.
      통과하면 `measurement-instrumentation.md` A4 행과 PRD status를 정정
- [ ] PR-Codex를 실제로 받으려면 `/mccp:pr` 시 `MCCP_CODEX_DISABLED` 해제 (운영자 결정)
