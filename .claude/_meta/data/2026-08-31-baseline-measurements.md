# mccp 하네스 평가 기준선 실측 (2026-08-31)

**Status**: data
**Date**: 2026-08-31
**Topic**: 외부 평가 세션이 산출한 기준선 계측 — 이후 개선의 before-state
**Machine-readable**: [2026-08-31-baseline-measurements.json](2026-08-31-baseline-measurements.json)

이 문서는 판정이 아니라 **데이터**다. 해석·처방은 이것을 소비하는 PRD와 분석 문서가 소유한다.
측정 시점은 main worktree HEAD이며, 선행 메타 조사 2건(`2026-08-31-harness-instability-and-command-bloat.md`,
`2026-08-31-remaining-issue-disposition.md`)이 사용한 `d1db647`과 **다른 커밋**이다 — 값이 어긋나는
지점은 그 사실을 명시한다.

---

## 1. 규모

| 항목 | 값 |
|---|---|
| 커밋 | 654 |
| JS 비-test LOC | 108,985 |
| JS test LOC | 96,930 (346 파일) |
| test:code | **0.889** |
| 명령 본문 | 22 파일 / 11,080 줄 / 650,396 B |
| CLAUDE.md | 1,103 줄 / 119,295 B |
| docs `*.md` | 47 파일 / 1.04 MB |
| doc:code (바이트) | **0.395** |
| agents | 58 |
| skills | 47 |
| 2026-08 순증 LOC | +133,465 |
| 최근 4주 커밋/주 | 106 / 164 / 128 / 43 |

## 2. Ship receipt corpus (`mccp-pr-codex`, 72건)

| `resolution.codex_verdict` | 건수 | 비율 |
|---|---|---|
| `skipped` | 33 | 45.8% |
| ABSENT (legacy) | 22 | 30.6% |
| `divergent` | 10 | 13.9% |
| `converged` | **7** | **9.7%** |

| 봉인 필드 충실도 | 값 |
|---|---|
| `resolution.rounds === 1` | **71 / 72 (98.6%)** |
| `resolution.findings` 비어있지 않음 | **0 / 72** |
| `meta.pr_codex_force_override === true` | 6 |
| 마지막 `converged` | 2026-07-14 |
| 가장 최근 `divergent` ship | 2026-08-31 |

**해석 주의** — `rounds:1` · `findings:[]`은 "게이트가 아무것도 못 찾았다"가 아니다.
override 사유문이 round 6 · 4연속 라운드를 증언하므로, 이는 **게이트가 찾은 것을 receipt가
기록하지 않는다**는 뜻이다. 근인은 `plugins/mccp/scripts/receipt/write.js:393-394`의
`defaultResolution = { converged: true, rounds: 1, ... }` 리터럴이다.
(선행 조사 B절의 정정을 그대로 승계한다.)

## 3. 증거 체인 무결성

| 지표 | 값 | 출처 |
|---|---|---|
| `evidence-audit` state | **`incomplete`** (exit 4) | 저장소 자체 도구 |
| coverage | **0.568** | comparable 25 / ledger 44 |
| unverifiable | 19 | ledger 엔트리에 대응 receipt 없음 |
| false_positive | 0 | |
| ship receipt : ledger | 72 : 44 | 28건 미결속 |
| `receipt-anchored-to-plan` correlation | **20** | derive (전체 receipt 대비 27.8%) |
| derive warnings (전부 `correlate`) | 52 | plan_hash 미해소 |

## 4. 자기측정 계층 (derive `metrics`)

| 상태 | 지표 |
|---|---|
| `computed` | A4, B1, B3, C1 — **4 / 10** |
| `forward-only` (null) | A1, A2, B2, C2, C3 |
| `integrity_ok:false` | **A3** (CLAUDE.md 변경 후 stale) |

A1의 `invalid_reason`은 `"no live startup producer wired"`이며, 이는 그 배선을 표방한
커밋 `d2d7117` (v1.33.0, *"측정 부채 상환 (A1/A2/B3 producer 배선)"*) **이후**의 관측이다.

## 5. 이연 원장 (`codex-findings-backlog.md`)

| 지표 | HEAD | d1db647 |
|---|---|---|
| 총 줄 수 | 803 | 790 |
| `^|` 데이터 행 | 478 | 465 |
| Severity 열 파싱 성공 행 | — | 462 |
| CRITICAL / HIGH / MEDIUM / LOW / FAIL | — | 43 / 157 / 144 / 67 / 51 |
| `[ABSORBED` 마커 | 32 | 32 |
| 흡수율 (열 기준 분모) | — | **6.9%** |
| "구조적으로 발화 불가능한 가드" 계열 행 | 49 | — |
| 상태/closure 열 | **없음** (4열 고정) | 없음 |

### 5.1 선행 조사와의 불일치 — **미판정**

선행 조사(`harness-instability` 전제 14)는 같은 커밋에서
**"데이터 행 756 · CRITICAL 57 · HIGH 230 · MEDIUM 294 · LOW 106"**을 보고한다.
본 계측은 **465행 / 43 / 157 / 144 / 67 + FAIL 51**이다.

- 줄 수(790)는 **일치**한다 — 같은 파일을 봤다.
- 행 수는 1.6배, severity 합(687 vs 462)은 1.49배 차이다.
- 선행 조사의 분류에는 **`FAIL` 계급이 없다** — 이 저장소 원장에 51행 실재한다.
- 파일 전체의 severity **토큰** 출현은 1,254회다. 한 행의 Finding 본문이 다른 severity를
  인용하는 일이 잦으므로, 선행 수치는 **열이 아니라 본문 전역 토큰**을 센 것으로 추정된다.

**귀결**: 흡수율이 `32/756 = 4.2%`에서 `32/465 = 6.9%`로 바뀐다. 결론(회수 루프 부재)은
방향이 같으나 **분모가 정정되어야 한다**. 본 문서는 어느 쪽도 채택하지 않고 기록만 한다 —
판정은 이 데이터를 소비하는 분석이 내린다.

## 6. 강제 인프라

| 지표 | 값 |
|---|---|
| CI workflow 파일 | 2 |
| CI가 실행하는 test | **3 / 346 = 0.87%** |
| 전체 suite 실행 시간 (실측 추정) | **약 3,921초 (65분)** — 3파일 34초 기준 외삽 |
| 무작위 20파일 샘플 | **20/20 green** |
| 런타임 고유 `MCCP_*` env | 146 |
| 그중 bypass/override 계열 | **18** |
| `fail-open` 문자열 출현 | 297 |
| `fail-closed` 문자열 출현 | 216 |
| `catch (_)` | 277 |
| `process.exit(비영점)` | 112 |

## 7. 리뷰 경제 (선행 조사 D절 인용 — 본 세션 재측정 아님)

| 지표 | 값 |
|---|---|
| 측정 가능 패널 | 37건 |
| wall-clock 합계 | **12.14시간** |
| 중앙값 | 8.0분 |
| **최대** | **427.4분 (7.1시간)** |
| 패널 verdict | converged 5 / divergent 31 |
| 차단 중 단일통과 우회 | 16 / 32 (50%) |

이 수치는 `plan-review/corpus.js` 오라클 산출이며 본 데이터셋이 독립 재측정하지 **않았다**.
운영자가 지목한 "마일스톤당 하루~1주" 리드타임과 대조할 때, 이 표는 **패널 구간만**
포함하고 implement · PR · Codex 라운드 · 재작업 구간은 미포함임에 주의한다.

## 8. 자기참조성

| 지표 | 값 |
|---|---|
| PRD 총계 | 41 (active 6 / archived 35) |
| 주제가 mccp 자신인 PRD | **41 / 41** |
| plan 총계 | 171 (active 35 / archived 136) |

외부 제품 전달 이력이 0이므로, 개선 루프에 **저장소 밖 접지 신호(external grounding)가 없다**.

## 9. 이 데이터셋이 측정하지 **않은** 것

정직하려면 사거리 밖을 적어야 한다.

- **test 346개 전수 실행 결과** — 20개 샘플만 green 확인. 나머지 326개의 현재 상태는 미측정.
- **마일스톤 end-to-end 리드타임** — plan 파일 최초 커밋 → ship 커밋 간격(4~18일)은
  git 기반 근사이며, 실제 착수·중단·재개 시각은 어디에도 기록되지 않는다.
- **토큰·비용** — 세션당 컨텍스트 소모, 게이트 1회 실행의 토큰 비용 모두 미측정.
- **패널·Codex 라운드의 개별 wall-clock** — corpus 집계값만 인용했고 원문 72건 미판독.
- **`plugins/mccp/agents/` 58개 · `skills/` 47종의 본문** — 선행 조사의 사각과 동일하게 미판독.
- **명령 본문 inline `node -e` 240건** — 어떤 test도 닿지 않는 표면. 정적 계수만 인용.
