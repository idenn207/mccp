# review-record-linkage M7 ship 구간 (`-m7c`) — implement-gate review record

> `/mccp:prp-implement` 2.5.4의 review record다. **plan 본문이 아니라 여기 산다** — plan의
> K2가 T2 봉인 뒤 plan을 동결했고(`Edit`·`Write` deny), 2.5.4대로 plan에 절을 주입하면
> `mccp-plan-codex` receipt가 즉시 stale이 된다(S9). 선례는 `closure-accounting-m2`(S10).

- Plan: `.claude/plans/review-record-linkage-m7c.plan.md` (본문 무변경 — `planAwareMarkdownHash` = `sha256:e603253f…` = plan receipt `plan_hash`)
- Gate: `mccp-implement-codex` · decision `review-record-linkage-m7c`
- 이 사이클의 새 코드: **0줄**. 구현은 `202d49b` · `5b3935c`(M7), `65bbbc5` · `ea1a4f4`(M5)에서 착지했다. Phase 3은 어떤 Task도 실행하지 않는다 — plan의 Task는 전부 오케스트레이터 작업이다.

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review --base origin/main` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: **1** (`MCCP_GATE_ROUND_CAP=1` 봉인 · 원장 `rounds_so_far=1`, §3.16)
- 합치 결론: **`converged`** — 구조화 verdict `approve`, finding 0건 (`codex-review-payload.deriveGateVerdict` source=`structured`).
  리뷰어 요약: "named-ship 검사가 fail-closed이고, corpus 읽기를 한 커밋에 고정하며, eligibility와 hash 가드를 보존한다."
- 리뷰 대상: `branch diff against origin/main` (`target.explicit=true`). 명령 본문의 호출에는 `--base`가 없는데,
  작업 트리가 dirty(`.claude/state/fix-task-applied.md` — 훅 산출물)라 companion의 `auto` 스코프가
  그 상태 파일 하나만 리뷰하게 된다. 유일한 라운드를 ship diff에 쓰기 위해 wrapper가 문서화한 `--base origin/main`을 붙였다.
- focus: plan이 pre-commit하지 않은 구현 시점 결정 10건 — `--check-live-linkage` 종료 코드 표(0/1/2/3, degraded > violations, 빈 eligible 집합 = unresolved) ·
  HEAD OID 1회 고정과 해석 실패 fail-closed · 검사 4(eligibility)를 검사 3(단독 bidirectional)보다 먼저 · `receipt_hash` 동등 비교 헬퍼 재사용(null===null 차단) ·
  `meta.review_record_path`를 map key로만 사용 · slug 가드의 REF_SHAPE 대칭 · install-skew의 SHA_RE/`CLAUDE_PLUGIN_ROOT` 선검증과 경로 문자열 미반환 ·
  skew 배너의 `MCCP_CODEX_DISABLED` 가드 밖 배치와 전용 dedupe 키 · 전역 gitignore 패턴 4종 · plan 동결로 세 receipt가 한 `plan_hash`를 공유하는 ship 절차.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | (없음) | — | — | Codex finding 0건 |

- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 0건)
- Codex session 참조: threadId `01a0c7da-fe7c-7712-99bd-32a386b46257` (durationMs 67371)

### Security Reviewer

- 호출: Task `mccp:security-reviewer` (read-only 지시) · 대상 `git diff origin/main...HEAD -- plugins/ .gitignore`
  (linkage-audit · install-skew · dep-check/session-start · state-writer · gitignore-provision). 호출 성공 — `SECURITY_SKIPPED_REASON` 미설정.
- 결과: **CRITICAL/HIGH 0건** → MCCP-GATE-STOP 없음. 리뷰어가 코드에서 직접 확인한 것:
  slug 가드 이중 적용(`linkage-audit.js:144-150`, `main()`과 `checkLiveLinkage()`) · git 호출 전부 `execFileSync` argv + `--end-of-options` ·
  `meta.review_record_path`는 `byPath` Map 조회에만 쓰임(`:417-422,944-959`) · `pinHead`가 40-hex OID 검증 후 실패 시 `null`→`unresolved`(`:906-921`) ·
  install-skew `SHA_RE` 선검증(`:308-314`)과 `classifyPluginRoot`의 fs/git 접촉 전 검증(`:140-172`) · 터미널 출력은 `safeLabel` 경유(`dep-check.js:36-38`) ·
  새 frontmatter 키 값은 닫힌 enum과 ISO 시각에서만 생성(`session-start.js:1188-1213`).

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | S-L1 — 네트워크 공유에 매핑된 드라이브 문자(`Z:\`)가 UNC 검사를 통과 (`install-skew.js:140-172`) | LOW | DEFER_TO_BACKLOG | §3.14 — HIGH 미만. 피해자가 이미 매핑·신뢰한 공유로만 트래픽이 가므로 악용성 낮음. `codex-findings-backlog.md`에 1줄 적재 |

- Deferred to backlog: 1

### Design Review

- `impeccable-detect --mode implement`: `skill_available=true` · `design_signal=false` · `reason=no-signal` →
  silent-skip 행. receipt에 `--impeccable-silent-skip --impeccable-silent-skip-reason no-signal`을 싣는다.
  렌더링 표면이 없으므로 routing · critique loop · design-grounding capture는 돌지 않는다.
