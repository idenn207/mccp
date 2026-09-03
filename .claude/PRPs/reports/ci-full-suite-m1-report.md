# Implementation Report: ci-full-suite M1 — suite-entrypoint-and-baseline

**Plan**: `.claude/plans/ci-full-suite-m1.plan.md` (활성 위치 유지 — 아카이브는 `/mccp:archive-complete` 소관)
**Branch**: `ci-full-suite` · **PR**: [#171](https://github.com/idenn207/mccp/pull/171) (draft)
**판정 문서**: [`docs/ci-full-suite/m1-baseline.md`](../../../docs/ci-full-suite/m1-baseline.md)

## Summary

전수 test 실행의 정본 진입점을 배포 표면 밖(`scripts/`)에 만들고 로컬 1회 + CI 4회(Node 20·24 × run 2회)
완주해 벽시계와 파일 단위 분해를 기록했다. 배포 표면(`plugins/`)은 한 줄도 바뀌지 않았다.

**이 milestone의 실제 발견은 계획과 다르다.** plan은 "174분을 파일 단위로 분해한다"를 목표로
했는데, 측정 결과 그 수는 스위트의 성질이 아니라 **플랫폼의 성질**이었다 — 같은 Node
v24.19.0에서 Windows 순차 합계가 Linux의 **64.8배**이고, 전수가 4코어 Linux runner에서
**75.5초**에 끝난다. 그 사실이 M2의 전제(runtime-reduction)를 재검토 대상으로 만든다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (측정 대기 시간이 지배) |
| Files Changed | 6 CREATE | 7 CREATE (`redact.js`가 santa-loop에서 분리 추가) |
| 벽시계 baseline | 로컬 1건 | 로컬 1 + CI 4 (matrix 2 Node × run 2회 — synchronize가 2차를 무료로 줬다) |
| 병렬 하한 | 23.3분 (우산 PRD 인용값) | 플랫폼별로 다름 — Linux 17.5초 · Windows 27.5분 |
| Node 20 귀속 | 불확실 (DD6 fallback 대비) | **완전** — fallback 미발화 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | base 동기화 + §3.5.1 삭제 검증 | 완료 (2회) | PR 개설 후 재수행 — 아래 "Deviations" 참조 |
| 1 | `scripts/test-suite/enumerate.js` | 완료 | 순수층, 사유 없는 제외는 throw |
| 2 | `scripts/test-suite/reporter.mjs` (+ `redact.js`) | 완료 | roll-up 분리, 경로 redaction |
| 3 | `scripts/test-suite/run.js` | 완료 | `--list` / `--json` / `--files-from` / `--exclude-from` / `--merge-into` |
| 4 | `scripts/tests/test-suite.test.js` | 완료 | 39 단언, 11갈래 전부 |
| 5 | `.github/workflows/test-suite-baseline.yml` | 완료 | `workflow_dispatch` + 좁은 `pull_request` |
| 6 | 측정 수행 (6갈래) | 완료 | 로컬 1 + CI 4 + 병합 + 분해 + flaky 3회 + 하한 + run 간 편차 |
| 7 | `docs/ci-full-suite/m1-baseline.md` | 완료 | 13절 (§5a run 간 편차 · §7a redaction 추가) |
| 8 | PRD 정정 + milestone 갱신 | 완료 | milestone 1 → `complete`, OQ1·OQ4 답변 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | Pass | `node --check` 4개 + ESM import 1개. 저장소에 type-check/lint 러너 없음 |
| Unit Tests | Pass | 39/39 (`scripts/tests/test-suite.test.js`), 머지 전후 각 1회 |
| Build | N/A | 빌드 단계 없는 저장소 |
| Integration | Pass | 좁은 범위 smoke 12파일 `ok:true`/`complete`/exit 0 · 전수 5회 완주 (전부 `ok:true`/`complete`) |
| Edge Cases | Pass | 귀속 4값 probe · chunk 접기 · 병합 의미론 · prototype pollution 거부 |

### 게이트

| 축 | 결과 |
|---|---|
| Implement-Codex | `round-cap-reached` (3/3 소진) → `codex_verdict='divergent'` 정직 봉인. spawn 없음 |
| Security Reviewer | 2026-09-01 완주분 승계(12행 흡수, 미해소 CRITICAL/HIGH 0). `security_skipped` 미forward |
| impeccable | `design_signal=false` → silent-skip (`no-signal`) forward |
| santa-loop | 5라운드 cap 도달, verdict `divergent`. HIGH/CRITICAL 흡수분은 `redact.js`에 착지 |

## Acceptance — 6/6 충족

| # | 기준 | 결과 |
|---|---|---|
| 1 | `local` + `ci-node20` 원소가 각각 존재, 열거된 조합만 수용 | **MET** — 둘 다 행 A(`ok:true` · `complete` · `per_file==files_total`) |
| 2 | `--list` == `git ls-files '*.test.js'` | **MET** — 371 완전 일치 |
| 3 | `pull_request` run ≥1 + artifact 내용이 1번 검사 통과 | **MET** — run `33597753311` + synchronize가 발화시킨 `33598634085`. 4개 artifact 전부 통과 |
| 4 | 판정 문서에 상위 15 + flaky 3회 | **MET** |
| 5 | 자기 포함 (`scripts/tests/test-suite.test.js` 열거됨) | **MET** — 비-`.test.js` 3개는 미열거(정상) |
| 6 | 컨테이너 절대경로 0건 | **MET** — 5원소 전부 `redaction_ok:true`, `redaction_hits:[]` |

## Files Changed

| File | Action |
|---|---|
| `scripts/test-suite/enumerate.js` | CREATED |
| `scripts/test-suite/reporter.mjs` | CREATED |
| `scripts/test-suite/redact.js` | CREATED |
| `scripts/test-suite/run.js` | CREATED |
| `scripts/tests/test-suite.test.js` | CREATED |
| `.github/workflows/test-suite-baseline.yml` | CREATED |
| `.claude/_meta/data/2026-09-01-suite-baseline.json` | CREATED |
| `docs/ci-full-suite/m1-baseline.md` | CREATED |
| `.claude/plans/ci-full-suite-m1.plan.md` | UPDATED (복구 + 리뷰 절) |
| `.claude/prds/ci-full-suite.prd.md` | UPDATED (milestone + OQ) |

## Deviations from Plan

1. **plan 파일 복구 (계획에 없던 작업).** 직전 세션의 `## Codex Implementation Review` 섹션
   치환 편집이 Task 8 본문의 **산문 참조**(``아래 `## Codex Implementation Review` ``)에
   매칭돼, 그 지점부터 옛 섹션 헤더까지를 통째로 덮어썼다. 결과로 `## Validation` ·
   `## Risks` · `## Acceptance` · `## Design Critique` · `## Design Routing Guide` ·
   `## Codex Adversarial Review` **154줄이 소실**됐다. HEAD 판본에서 splice 복원했고, 그
   과정에서 직전 세션의 의도된 리뷰 절 갱신은 보존했다. 복구 없이 진행했다면 이 사이클은
   Acceptance를 모르는 채 "완료"를 선언했을 것이다.

2. **Task 0을 두 번 수행.** PR 개설 직후 workflow가 발화하지 않았다. 원인은
   **PR이 `CONFLICTING`이면 GitHub이 merge ref를 만들지 못해 `pull_request` workflow run이
   아예 생성되지 않는다**는 것이다(실측 — run 0건). 브랜치가 `origin/main`보다 61 커밋 뒤였다.
   base를 재머지(충돌 4건을 파일 단위 해소: backlog는 union · 우산 PRD는 main · state는 ours)해
   push하자 `MERGEABLE`이 되며 run이 즉시 생성됐다. §3.5.1 삭제 검증 재수행 결과 0건.

3. **CI matrix를 node 20 + 24 둘 다 실었다.** plan은 node 20의 `data.file` 가용성 판정을
   목적으로 했으나 24도 함께 돌려 **같은 Node 버전의 플랫폼 비교**를 얻었다. 그것이 §2의
   64.8배 결론을 가능하게 했다 — 24가 없었다면 격차를 Node 버전에 귀속할 여지가 남았다.

4. **판정 문서를 로컬 전용 판본에서 전면 재작성.** CI 결과가 §4(병렬 하한)의 결론을 뒤집었다.
   초판은 "shard만으로는 27.5분 밑으로 못 간다"였고, Linux 실측 후 그것은 Windows 개발 머신에
   한정된 진술이 됐다.

## Issues Encountered

| 문제 | 해소 |
|---|---|
| plan 154줄 소실 | HEAD splice 복원 (위 Deviation 1) |
| `pull_request` workflow 미발화 | PR 충돌 해소 (위 Deviation 2) |
| `cli.js validate` exit 2 (upstream plan receipt stale) | 구조적·기존 문제. 봉인 해시 `dab39c61`은 커밋된 어느 판본과도 불일치하며 이 세션 이전부터 그렇다. `cli.js validate`는 `MCCP_RECEIPT_GATE_MODE`/`MCCP_SKIP_RECEIPT`를 **소비하지 않으므로**(실측 — 둘 다 exit 2 불변) 그 exit는 게이트 차단이 아니라 진단이다. §3.16대로 라운드를 늘리지 않고 사유를 기록하고 진행 |
| Acceptance 6 보조 grep이 22건 보고 | 전부 오탐. 드라이브 문자 갈래가 `equal:` + 백슬래시에 매칭. 정본 `redaction_ok:true`로 판정, 문서 §7a에 기록 |
| 로컬 재측정이 완주 불가 | 머지된 트리에서 `local`을 재측정하려 했으나 세션의 다른 작업과 경합해 clean run의 2배를 넘겨도 끝나지 않았고 node 자식 336개에서 셸이 `fork: Resource temporarily unavailable`에 도달했다. **중단**하고 clean `local`(경합 없던 실행)을 보존했다 — 오염된 값으로 덮어쓰지 않는다. 컨테이너는 원자 write라 중단에도 무손상(5원소 전부 유효 확인) |
| `MCCP_GATE_ROUND_CAP` 실효값 불일치 | `.claude/settings.json`은 `1`인데 프로세스 env는 `3`이었다. 봉인도 3으로 떴다. 본 사이클 범위 밖 — 아래 Next Steps |

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `scripts/tests/test-suite.test.js` | 39 | 열거 · argv 산술 · reporter 집계 · redaction · spawn 인자 형태 · 실패 경로 · chunk 접기 · 자기 포함(실제 spawn) · reporter e2e(실제 `node --test`) · 병합 의미론 · 귀속 4값 probe(negative 포함) |

## Next Steps

- [ ] `/mccp:pr` — PR #171을 ready로 승격. **PR-Codex가 반드시 발화한다**(dedupe가 `divergent`로 닫혀 있음) — 이것이 이 사이클에 없던 cross-model 반증의 회수 지점이다
- [ ] M2 착수 전 결정: **무엇을 최적화하는가** (CI 피드백이면 이미 충족, 로컬 루프면 `mkTmpRepo` 감축)
- [ ] M3 입력: red가 플랫폼마다 다르므로(교집합 2) CI matrix 필요 여부 판단
- [ ] 별도 축: `MCCP_GATE_ROUND_CAP` 선언값(1) 대 실효값(3) 불일치 — `env-contract/doctor.js` 대상
