# mccp v0.2 — Continuation Queue (다음 세션 진입점)

**Generated**: 2026-06-03 (S9 dogfood 종료), updated 2026-06-04 (S10a close-out + v0.2.2 plan)
**Last completed work**:

- v0.2.1 (Q5) — shipped 2026-06-04 (1ea5cd9 + 961917e)
- S10a (Q2) — STATE.md continuity layer. 79+ tests green. Codex stop-time review 2-round findings 모두 회귀 잠금 (rotate-in-inject + consume-without-deliver 3-layer guard). **Uncommitted on `feat/s10a-state-md-continuity` branch.**

**다음 세션 첫 단계 (필수)**:

→ user에게 **"Q11이 무엇인가요?"** 확인. 본 세션 시점 명세 없음.

---

## 1. Next Sprint — v0.2.2 (병행 작업)

### v0.2.2 (a) — S10a commit

- 8 changed files (~750 LOC):
  - `plugins/mccp/scripts/state/state-writer.js` (CREATE)
  - `plugins/mccp/scripts/state/state-injector.js` (CREATE)
  - `plugins/mccp/scripts/state/tests/state-writer.test.js` (CREATE)
  - `plugins/mccp/scripts/state/tests/state-injector.test.js` (CREATE)
  - `plugins/mccp/scripts/hooks/pre-compact.js` (UPDATE — PreCompact wiring)
  - `plugins/mccp/scripts/hooks/session-start.js` (UPDATE — SessionStart wiring + 3-layer commit guard)
  - `plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js` (CREATE)
  - `docs/v0.2-state-schema.md` (UPDATE — §1.3 + consume-vs-deliver contract)
- Optional artifact commit: `.claude/PRPs/plans/s10a-state-md-continuity.plan.md` (작성 완료, untracked)
- Tests 결과: state-writer 8/8 + state-injector 11/11 + T-Session-Bootstrap 5/5 = 24개 신규 + fix-task 19/19 회귀 없음

### v0.2.2 (b) — Receipt soft-mode patch

Codex+Claude self-debate 결과 **SOFT 권고**. 3단계 점진 축소 중 Stage 1만 본 patch.

- `MCCP_RECEIPT_GATE_MODE` env (default=soft, hard/off 토글)
- `receipt-prompt.js` + `receipt-skill.js` mode-aware
- `validate-cmd.js`의 `codex_skipped` 처리 명확화 (Codex이 catch한 indirect auto-CRITICAL 누수 fix — skipped receipt는 CRITICAL이 없음에도 block 자격 박탈)
- Tests + `docs/gate-design.md` §"Mode" 추가
- 예상 작업: ~1시간

### v0.2.2 (c) — Q11

명세 미정. **다음 세션 시작 시 user가 정의 예정.**

---

## 2. v0.2.3+ Backlog (별도)

### Decision-slug derivation 통합 (Option Y, Codex 권고)

- `/mccp:plan` command body Phase 5.6 step B를 plan-path 기준으로 통일
- 현재: `--args "S10a — STATE.md continuity"` → slug `s10a`
- After: `--args "<plan path>"` → slug `s10a-state-md-continuity`
- plan-codex와 implement-codex slug가 정렬되어 silent block 사라짐
- 예상: ~30분 + test fixture

### TODO(s10a-followup)

- `shouldInjectContext=skip` 회귀 test의 env var 발견 후 잠금
- 위치: `plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js` (TODO 주석 남김)

### Q3 — S10b auto-handoff

- $100 hard ceiling에 도달해도 자동 handoff 안 됨 (본 세션이 $109까지 갔음 = 증거)
- `breakpoint-detector.js` (신규) + `session-spawner.js` (신규) + `ecc-context-monitor.js` 분기
- 선행: S10a (DONE) + STATE.md `next_chunk` field (schema 정의됨)

### Q4 — S11 `/mccp:work` 단일 entry

- 선행: Q3

---

## 3. Decision Log

| 결정 | 이유 | 근거 |
|---|---|---|
| Receipt SOFT 권고 채택 | 한 세션에 5결함 노출, Codex+Claude self-debate 합의 | 본 세션 §"Self-Adversarial Debate" |
| S10a 명세 변경 = consume-vs-deliver contract | Codex stop-time finding | `docs/v0.2-state-schema.md` §1.3 consume-vs-deliver |
| 3-layer commit guard (pushed+survived+writeOK) | Codex 2nd-round finding (shouldInjectContext gate + truncation) | `session-start.js:663-707` |
| Q11 = TBD by user | 본 세션 명세 없음 | 다음 세션 첫 단계 |

---

## 4. Session $109 Postmortem

- 본 세션이 $100 hard ceiling을 $9.78 초과. S10b auto-handoff 미구현으로 자동 stop 안 됨.
- Memory `feedback-cost-not-stop-signal`: "cost warning은 stop signal 아님"이 정상 동작. ceiling 본 의도는 S10b가 wire 예정이었음.
- v0.2.2 또는 v0.3 priority에서 S10b를 앞당기는 결정 필요할 수 있음.

---

## 5. Quick-start for Next Session

```text
1. MEMORY.md 첫 항목 → 본 파일 자동 진입
2. user에게 "Q11은 무엇인가요?" 확인
3. git status — feat/s10a-state-md-continuity branch + uncommitted 8 files 확인
4. S10a commit 먼저? 또는 v0.2.2 묶음? — user 결정
5. Receipt soft-mode + Q11 병행
```
