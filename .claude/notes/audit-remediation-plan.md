# mccp 구현 감사 — A(광범위 Haiku) + B(심화 Opus) 통합 수정 계획

생성: 2026-07-05 · 시작 버전 1.20.2 · 브랜치 main(clean) · Codex 플러그인 설치됨

## 종합

- A(11 서브시스템, Haiku) 10건 + B(5 서브시스템, Opus 심화) 17건. 중복/보강 제거 후 고유 이슈 ~19개. refuted A5 + B2 = 7건.
- **가동성 자체는 건강** — 모든 서브시스템 테스트 green(총 ~1,200+). operability 렌즈 실질 결함 0.
- 실제 문제 3축: (1) 최근 v1.20.2 경로의 **로직 결함**(dedupe false-skip), (2) hook 레이어 **silent-failure**, (3) 광범위한 **CLAUDE.md 문서 드리프트**.
- **B가 A(Haiku)가 못 잡은 CRITICAL 로직 버그 발견** → cross-gate dedupe false-skip. 최우선.
- 방법론 교훈: Haiku 광범위 sweep은 doc-drift는 잘 잡지만 로직 버그는 놓침. Opus 심화가 필수였음.

---

## P1 — Codex dual-review 무결성 (CRITICAL) ← 최우선

핵심 가치(Claude↔Codex dual-review)를 조용히 무력화하는 버그.

- **B#1 (critical, logic_bug)**: `dedupe.js` evaluateForDedupe가 실제 Codex verdict이 아니라 `resolution.converged`를 검사하는데, `write.js`가 이 필드를 **항상 `true`로 default** 기록(`--resolution-file` 미전달). → plan/implement Codex가 divergent(non-critical)여도 양쪽 receipt가 converged=true → `CODEX_DEDUPE_AT_PR=1` → PR-Codex 조용히 skip. dual-review 파괴.
  - 증거: write.js:122-129 defaultResolution converged:true / dedupe.js:401-421 / plan.md:656-683 write에 --resolution-file 없음 / codex-bridge.js:98-109 parseVerdict는 있으나 미전달 / finalize-receipt.js:140-207 --resolution-file 미forward.
- **B#3 (high, deferred)**: receipt schema에 Codex verdict를 담는 필드가 없음(design_critique_verdict는 있으나 codex_verdict 없음). 근본 원인.
- **B#11 (medium, intent_gap)**: divergent verdict가 plan write를 막지 않음(severity 게이트 CRITICAL/HIGH ACCEPT_NOW만 막음). converged=true default와 결합해 false-skip 성립.
- **B#9 (medium, silent_failure)**: evaluateForDedupe 테스트 커버리지 0(critical 경로 무테스트).

**수정 방향**: plan.md Phase 5 / prp-implement.md Phase 2.5 Codex 게이트에서 parse된 verdict(converged/divergent/critical)를 캡처 → receipt에 persist(resolution.converged 실제화 or `codex_verdict` 신설, finalize-receipt.js에서 forward) → evaluateForDedupe가 실제 verdict 검사 → evaluateForDedupe 유닛+CLI 테스트 추가.
**touch**: finalize-receipt.js, write.js, dedupe.js, schema.js, plan.md, prp-implement.md, tests. **버전**: 1.20.3.

---

## P2 — Session continuity silent-failure (HIGH×2) ← 이번 세션 신호의 근본 원인

SessionStart가 낸 "3세션 SessionEnd marker 없이 종료 — silent failure 의심" + 감사 중 관측된 "30+ 세션 .end 누락"의 실제 원인.

- **B#4 (high, silent_failure, A③ 확인)**: session-end-trace.js:34-40 loadHookTrace()가 hook-trace 모듈 로드 실패 시 null 반환(debug-only), runSync:99-100이 null이면 .end marker 미작성 + lease 미해제 → 후에 crash로 오탐. **30+ 누락의 root cause.**
- **B#5 (high, silent_failure, A③ 확인)**: session-end-marker.js:27-35 중첩 try-catch + run-with-flags.js:151-156 exit(0) → 실패가 성공(exit 0)으로 은폐. fail-loud-open 위반.
- **B#10 (medium, logic_bug)**: lease heartbeat가 recordWrite()에만 의존(hook-trace.js:277) → 도구 안 쓰는 순수 대화 세션은 10분 후 stale → false crash alert. (SessionStart 신호 과발화 기여)
- **B#16 (low, race, partial)**: state-writer.js:510-535 lock 1초 후 fail-soft로 lock 없이 진행 → 동시 write last-writer-wins. 문서 "atomic" vs 실제 "advisory" 불일치.
- **B#17 (low, silent_failure, partial)**: state-writer.js:491-501 / loop-counter.js writeSync 실패 시 fd 누수(try/finally 부재).

**수정 방향**: hook-trace 로드 실패해도 fs.writeFileSync로 degraded marker 보장(marker > lease, fail-open) / 중첩 catch를 실패 표면화(exit 1) / SessionStart에서 idle lease renewLease / fd 누수 try/finally / 문서 정정.
**touch**: session-end-trace.js, session-end-marker.js, run-with-flags.js, hook-trace.js, session-start-trace-injector.js, state-writer.js, loop-counter.js, tests. **버전**: 1.20.4.

---

## P3 — atomic-locks PID-reuse race (HIGH)

- **B#2 (high, race)**: 홀더 crash + 다른 프로세스가 같은 PID 재사용 + heartbeat로 fresh mtime → tryReclaimStaleLock의 isPidAlive()가 재사용 PID를 살아있다 판단 → same-host NEVER reclaim → lock이 lease(60s) 만료까지 stuck. PR 워크플로 60초+ 정지.
  - pr-phase-lock.js:264-272,307-310 / quarantine.js:172-180. 테스트 gap(reused-PID + fresh-mtime 케이스 없음).

**수정 방향**: same-host reclaim에서 PID-liveness 최적화 제거하고 mtime-only reclaim(보수적) 또는 token 검증 통합 + 회귀 테스트.
**touch**: pr-phase-lock.js, quarantine.js, tests. **버전**: 1.20.5.

---

## P4 — dispatch/work-isolation 강건화 (MEDIUM)

- **A① (medium, intent_gap)**: work.md:167 dispatch는 산문 지시(코드 아님, work.md 전체가 프롬프트라 정상). 하지만 worker 미런칭 시 merge(work.md:177)가 pending envelope→verdict=failed→HALT exit 13, **인라인 fallback 없음**(prepare가 이미 아티팩트 생성). fail-open 철학과 어긋남. live 검증 필요.
- **B#6 (medium, silent_failure, was high→partial)**: prp-implement.md Phase 2.5.6(line 591) receipt write에 `|| exit 1` 없음 → exit 12(DISPATCH_MARKER_MISSING_FIELDS) 예외가 bash에서 무시될 수 있음(Phase 2.5.7 validate가 safety net이라 medium).
- **B#13 (low, intent_gap, was medium→low)**: prp-implement.md Phase 2.5.6에 dispatch context/attribution flag(3종) 언급 없음 → worker가 doc만 따르면 flag 미forward → un-anchored receipt. worker prompt(dispatch-cli.js:126-132)와 doc 분리.

**수정 방향**: merge 전 pending 감지 → graceful inline degrade / `|| exit 1` 추가 / attribution 자동 주입 또는 doc 보강 / 실제 /mccp:work full-chain live 검증.
**touch**: work.md, prp-implement.md, dispatch merge 로직, tests. **버전**: 1.20.6.

---

## P5 — receipt_hash tamper-detect 실제 연결 (LOW, 보안 인접)

- **B#15 (low, intent_gap, A⑥ 확인)**: receipt_hash가 write.js:298에서 계산되지만 validate-cmd.js가 재계산·비교하지 않음(subject_hash만 검증). "tamper-detect digest"가 실제로는 무력 — findings/resolution/meta 변조 미탐지. git 추적 + subject_hash가 완화하므로 low.

**수정 방향**: validate-cmd.js에 receipt_hash 재계산·비교 추가(subject_hash 패턴 미러) + 변조 탐지 테스트.
**touch**: validate-cmd.js, tests. **버전**: 1.20.7 (또는 P1에 흡수 — 둘 다 receipt 무결성).

---

## P6 — 문서 정합화 (CLAUDE.md drift, doc-only, 저위험)

- A④/B#12: §3.3 classification 표 registry-malformed 누락 + tempfail 오기재(실제 classify.js 개념) + enum 개수(11/13/14) 불일치 + codex-invoke.js:14-17 주석에 parse-error 누락.
- A⑤: §1.4/§5 derive "7 source" → 실제 9(ledger v1.18.3, worktrees v1.18.12). schema-surface.md는 9로 정확.
- A⑥/B#14: §1.3 "strict mechanical enforcement" 과장 — v1.3.1 informational allow-path(plan/prp-implement/resume missing-only) 미문서화. (B가 실제 동작 solid 확인, terminal은 hard-block.)
- A⑦: §3.9:415 design-critique test fixture(.claude/cache/test-fixture-status.html) never committed → e2e 5/6. fixture 생성 or 문서 정정.
- A⑧: §3.9:385 enum 축약(ESCALATE/DIVERGENT vs ESCALATE_NEXT_ROUND/DIVERGENT_UNRESOLVED).
- A⑨: §3.2 SessionEnd marker 메커니즘 미문서화(gate-design.md엔 있음).
- A⑩: §1.4 stop-loop "최대 2회 bounded retry" → 실제 실패 카운터(자동 재시도 아님).
- **B#7/B#8 (medium×2)**: §3.6 "Canonical schema (양쪽 공통)" 과장 — quarantine는 raw token in-memory(hash+stdin-pipe 아님). **결정: 문서 정정 기본(B 평가: quarantine 설계 무해, 0o600 보호). hash화는 defense-in-depth 선택.**
- B#16: §3.2 STATE.md "atomic lock" → "advisory (fail-soft 1s)" 정정.

**touch**: CLAUDE.md, codex-invoke.js(주석), (선택) fixture. **버전**: doc-only는 bump 불요하나 코드 주석 포함 시 patch.

---

## Refuted (신뢰성 신호)
A 5건 + B 2건 refute — adversarial 검증이 거짓 양성 제거함.

## 실행 순서 / 결정
1. **P1(critical) → P2 → P3 → P4 → P5 → P6**. 각 독립 PR, main에서 순차 분기(stacked-PR 머지순서 함정 회피).
2. quarantine lock: **문서 정정** 기본(코드 hash화는 사용자 선택).
3. 버전: 배치별 patch bump(P1=1.20.3 …). footer(html.js/markdown.js) 동기(§3.7).
4. worktree: `.worktrees/<batch>/` per §3.8, PR merge 직후 cleanup.
5. P1은 아키텍처 변경이라 /mccp:plan 확인 게이트에서 설계 검토 후 구현.
