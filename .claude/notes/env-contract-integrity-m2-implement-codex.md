# env-contract-integrity M2 — Implement gate notes

> 주입 대상이 plan 본문이 아니라 이 notes 파일인 이유: plan 본문을 편집하면
> `.claude/receipts/mccp-plan-codex/env-contract-integrity.json`의 `plan_hash`가
> 어긋나 `/mccp:pr`의 staleness guard가 차단한다(M1에서 실측된 상태).
> `/mccp:prp-implement` Phase 2.5.4는 notes 경로 주입을 명시적으로 허용한다.

## Codex Implementation Review

- 호출: skipped — `MCCP_CODEX_DISABLED=1` (env-level policy, v0.3.5 first-class skip)
- 라운드 수: 0 (Codex 미발화)
- 합치 결론: Codex는 이 저장소 정책상 비활성이다. 대신 Plan 게이트가 L2 다관점 패널
  (architect · security · test · invariant, 4/4 응답)로 돌았고 verdict는 `divergent`로
  정직하게 봉인됐다(`review_single_pass_reason: deadline_pressure`, §3.15).
- YAGNI Triage: 해당 없음 (Codex finding 0건). L2 패널의 blocking finding 8건은
  `/mccp:plan` 5.2g2가 `.claude/plans/codex-findings-backlog.md`에 이미 적재했다.
- Deferred to backlog: 8 → `.claude/plans/codex-findings-backlog.md` (2026-08-25 행)
- Open Questions: 없음 (auto-CRITICAL 카탈로그 해당 없음)
- Codex session 참조: n/a

### Implement 단계에서 흡수하는 L2 finding

§3.14대로 CRITICAL/HIGH만 그 자리에서 흡수한다. 아래 3건은 구현 설계에 직접 걸리므로
Task 실행 중 흡수하고, 나머지는 backlog에 남긴다.

| id | severity | finding | 흡수 방법 |
|---|---|---|---|
| `7649f625` | CRITICAL | L11의 markdown 파싱 규격이 부재해 fail-closed가 degrade로 무너질 위험 | Task 8에서 블록 경계·줄 형식·앵커 해석 규칙을 코드와 주석으로 명시하고, 파싱 실패는 통과가 아니라 problem |
| `cb9e8d0a` | HIGH | L11의 vacuous-pass — 블록을 못 찾으면 조용히 통과 | 블록 부재 = problem, 대상 집합이 비면 그 자체를 problem으로 보고 |
| `c32fa229` / `174c5a4c` | CRITICAL | plan이 인용한 `path:line`이 실제 소스와 어긋날 수 있다 | 각 mirror 참조를 구현 직전 실제 파일에서 재확인하고, 어긋나면 plan이 아니라 실측을 따른다 |

### Security Reviewer

해당 없음 — 이 마일스톤은 auth · crypto · secrets · 입력 검증 · injection · SSRF ·
path traversal · 권한 상승 어디에도 닿지 않는다(환경변수 어휘 상수 승격 + 문서 블록 + lint 규칙).
`security_skipped` 플래그를 세우지 않는다(스킵이 아니라 비해당).

### Design Review

`impeccable-detect --mode implement` → `design_signal=false` · `silent_skip=true` ·
`silent_skip_reason=no-signal`. 게이트 진입 시점의 diff가 비어 있어 렌더 표면이 없다.
receipt에 `--impeccable-silent-skip`을 forward한다. Phase 3.6/3.7은 EXECUTE 후 재판정한다.
