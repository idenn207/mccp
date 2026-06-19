# Codex Findings Backlog (defer-to-later)

Append-only log of Codex findings classified DEFER_TO_BACKLOG by YAGNI triage
(v0.2.9+ gate policy — see [docs/gate-design.md](../../docs/gate-design.md) §Divergent auto-rerun).

Reviewed quarterly OR when a new milestone consciously elects to absorb.

| Date | Severity | Source plan | Finding |
|---|---|---|---|
| 2026-06-19 | HIGH | v1.3.0 cycle retro | STATE.md body 자동 roll 부재. v1.3.0 cycle M1-M4 6건 PR이 STATE.md body를 미갱신 → main이 M0 stale 상태로 25일 잔존. v0.3.6 content-hash skip(state-writer.js:554 HASH_EXCLUDE_FRONTMATTER_KEYS)은 churn 차단 목적으로 정상 작동 — 유지. 후보 axis: `pr.md` Phase 1 VALIDATE에서 frontmatter.last_pr_url vs `gh pr list --base main --state merged --limit 1` 비교 → mismatch 시 stderr WARN(또는 BLOCK). 대안: `/mccp:work` post-merge hook으로 body roll 자동 propose. v1.4.x cycle axis 후보. |
