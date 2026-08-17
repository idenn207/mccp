# santa-adjudication M3 — implement-gate notes

> plan 본문(`.claude/plans/santa-adjudication-m3.plan.md`)은 `mccp-plan-codex` receipt가
> `plan_hash`로 봉인한 대상이라 게이트 산출물을 본문에 주입하지 않는다(M1·M2 선례 —
> 두 plan 모두 이 섹션을 갖지 않는다). `/mccp:prp-implement` Phase 2.5.4가 허용하는
> 대체 자리에 기록한다.

## Codex Implementation Review

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, first-class skip)

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` → `classification=disabled`,
  `blocking=false`, `durationMs=0`. spawn 직전 short-circuit이므로 리뷰가 실패한 것이 아니라
  **정책상 발화하지 않았다**. receipt는 `resolution.codex_verdict='skipped'`로 봉인되며
  승인을 주장하지 않는다 — cross-gate dedupe는 fail-closed를 유지하므로 PR-Codex가 ship
  시점에 실제로 발화한다.
- 라운드 수: 0 (호출 없음)
- 합치 결론: n/a — 이 milestone의 적대적 검토는 plan 단계의 L2 반증 패널 11라운드(R0~R10)가
  수행했고 그 흡수 내역이 본문 편집 자리마다 인용돼 있다.

### 구현 시점 결정 (plan이 미리 정하지 않은 것)

| # | 결정 | 근거 |
|---|---|---|
| I1 | `ledger.js`가 `terminator`를 **지연 require**한다(`assertTerminationMarker`·`terminate` 본문 안에서) | `counter`를 그렇게 부르는 선례와 동형. `terminator.js`는 아무것도 require하지 않으므로 순환은 없지만, 최상단 require를 더하면 P0 모듈의 로드 그래프가 바뀐다 |
| I2 | hunk 파싱은 정규식 1패스가 아니라 **줄 단위 스캔** | 보안 리뷰 권고 2. `git show` 출력을 `\r?\n`으로 나눠 각 줄에 앵커 정규식을 적용한다 — 백트래킹 면이 줄 길이로 한정된다 |
| I3 | rev 파일 내용은 **`.trim()` 후** 형식 검사 | 보안 리뷰 권고 1. 셸이 쓴 파일에 trailing newline이 붙으므로 trim 없이는 정상 rev가 전부 불량으로 떨어진다 |
| I4 | `git show`에 `maxBuffer` 명시 | 보안 리뷰 (d) MEDIUM — 기본 buffer 초과는 throw이고 그 throw가 `check-termination` 전체를 죽인다. 초과는 `{}`(미발화)로 흡수한다 |
| I5 | `check-termination` stdout 키 6종 고정 — `terminate` · `exitReason` · `reason` · `targetsBreakdown` · `classified` · `unresolved` | 커맨드 본문이 `terminate` 불리언에만 분기하고 나머지는 진단이다(DD7) |
| I6 | `TERMINATION_REASONS`는 `ledger.js`가 소유하고 `counter.REASONS.CAP_REACHED` + `terminator.EXIT_REASON.PATCH_CHASING`에서 파생 | Task 4가 지정한 "읽기와 쓰기가 같은 집합" |

### Security Reviewer

`Task(security-reviewer)` — proposed implementation 검토(5축: 인자 주입 · 경로 traversal ·
비신뢰 입력 정규화 · 자원 고갈 · git 실패 흡수의 오용).

**CRITICAL 0건 · HIGH 0건.** 5축 전부 SAFE 판정이고 (d) 자원 고갈만 MEDIUM("설계상 수용" —
git 고유 동작이며 rev는 이미 커밋된 것이라 push 권한이 전제). 권고 2건(rev `.trim()` · 줄 단위
hunk 파싱)은 위 I2·I3으로 흡수했고 MEDIUM 1건은 I4로 흡수했다.

- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | S1 rev 파일 trim 부재 시 정상 rev가 전부 불량 판정 | MEDIUM | ACCEPT_NOW | 같은 편집 자리이고 미흡수 시 terminator가 영구 미발화(조용한 실패) |
  | S2 줄 단위 hunk 파싱 | MEDIUM | ACCEPT_NOW | 같은 편집 자리. 방어적 코딩 비용 0 |
  | S3 `git show` 출력 무제한 | MEDIUM | ACCEPT_NOW | throw가 `check-termination`을 죽이므로 흡수가 fail-closed 방향과 정합 |

- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 카탈로그 해당 없음)
