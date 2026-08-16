# santa-loop-materialize M2 — implement-cycle notes

> 본 파일이 `## Codex Implementation Review` 섹션을 소유한다. plan
> (`.claude/plans/santa-loop-materialize-m2.plan.md`)은 `mccp-plan-codex` receipt에
> `plan_hash=sha256:c0a43a59…`로 봉인돼 있어 본문을 편집하면 그 receipt가 **stale**
> (validate-cmd.js:365-373, blocking)이 된다. `/mccp:prp-implement` 2.5.4가 허용하는
> notes 경로를 써서 봉인을 보존한다.

## 사이클 범위

Task 1~8은 선행 사이클에서 착지 완료(plan `## Tasks` 전건). 본 사이클은 그 위에
PR-Codex 리뷰 finding을 흡수하는 **후속 교정 사이클**이다.

| Finding | Severity | 처리 | 근거 |
|---|---|---|---|
| F1 — 마지막 허용 라운드의 NICE가 divergent로 오봉인되고 그대로 push된다 | HIGH | **본 사이클 흡수** | CLAUDE.md §3.14 — CRITICAL·HIGH만 그 자리에서 흡수 |
| F2 — santa receipt가 원장 집계 없이 유효하다 | MEDIUM | **backlog append** | §3.14 — MEDIUM·LOW는 고치지 말고 backlog 1줄 |

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0
- 합치 결론: > Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, first-class skip — classification=`disabled`, blocking=false, spawn 직전 short-circuit)
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | (없음) | — | — | Codex가 발화하지 않았으므로 triage 대상 finding이 없다 |

- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md` (PR-Codex F2, MEDIUM)
- Open Questions: 없음 — §0 auto-CRITICAL(security boundary / atomic state / schema breakage) 해당 없음
- Codex session 참조: n/a (env policy skip, durationMs=0)

### Implement-time 결정 (2.5.2)

plan이 사전 확약하지 않은 결정 4건. F1 교정이 도입하는 것들이다.

1. **ledger state에 additive termination 마커 신설** — `state.terminated = { reason, at }`.
   `schema_version`은 1 유지(present-only additive). 부재 = "거부가 관측된 적 없음".
2. **거부 분기가 상태를 쓴다** — `beginRound`의 `!decision.allowed` 경로가
   `write:false` → `write:true`로 바뀐다. 이미 마커가 있으면 재기록하지 않는 멱등 가드.
3. **`aggregateFrom`이 산술 대신 마커에서 파생** — `rounds.length >= cap` 제거.
   legacy 원장(마커 부재)은 `exitReason:null`로 읽힌다.
4. **`santa-loop.md` Step 5.5가 sealed verdict에 분기** — `SEAL_EXIT`만 보던 것에
   `$SEAL_JSON.verdict` 분기를 추가해 divergent 봉인 시 push를 막는다.

### Security Reviewer

미발화 — 본 변경면(원장 상태 파생 · 캡 게이트 · 커맨드 본문 분기)은 2.5.5가 열거하는
security-sensitive 영역(auth · crypto · secrets · input validation · injection · SSRF ·
path traversal · privilege escalation) 어디에도 해당하지 않는다. **fallback이 아니라
미트리거**이므로 `security_skipped`를 세우지 않는다(미트리거를 skip으로 기록하면
실제 fallback과 구분이 사라진다).

### Design Review

`impeccable-detect --mode implement` → `skill_available=true` · `design_signal=false` ·
`silent_skip=true` · reason `no-signal`. 렌더링 표면 무변경이므로 critique retry loop
미진입. receipt에 `--impeccable-silent-skip --impeccable-silent-skip-reason no-signal`
forward.

## 후속 라운드 — `/mccp:code-review` (로컬, 커밋 직전)

커밋 전 로컬 리뷰가 **F1 교정 자체의 결함**을 잡았다. 위 결정 1~3이 도입한 마커가
산술 파생의 오봉인을 다른 형태로 재현한 것이라, 새 축이 아니라 같은 자리의 미완성으로
보고 그 자리에서 닫았다.

| Finding | Severity | 처리 |
|---|---|---|
| H1 — 거부 마커가 판정을 영구 낙인으로 만든다 | HIGH | 흡수 |
| M1 — 거부가 원장 `cap`을 env 값으로 덮어쓴다 | MEDIUM | 흡수(H1과 같은 커밋이 연 구멍) |
| M2 — 본 노트가 untracked | MEDIUM | 흡수(커밋 포함) |
| L1 — `terminated` 미검증 | LOW | 흡수(`parseState`에 형태 검사) |
| L2 — 없는 린터를 참조하는 `eslint-disable` 주석 | LOW | 흡수(제거) |

### H1 — 마커는 관측이지 종료가 아니다

실측 2경로. ① 이미 수렴해 봉인된 slug에 `/mccp:santa-loop`를 재진입하면 Step 3의
**정상** 캡 거부가 마커를 쓰고, 재봉인이 converged receipt를 divergent로 덮었다.
② 캡을 상향해(`MCCP_SANTA_ROUND_CAP` 1..10 — 문서화된 운영 경로) 루프를 재개하면
그 뒤의 수렴까지 종료로 읽혔다. 둘 다 CLI 실행으로 재현했고, 교정 후 같은 스크립트가
`converged`로 뒤집히는 것을 확인했다.

교정 3층 — `deriveVerdict`가 마커를 **입력으로 받지 않는다**(라운드에서만 판정) ·
`beginRound`가 라운드를 열 때 마커를 **지운다** · `aggregateFrom`이 현재 라운드 수에
**결속된** 마커만 종료로 읽는다. 마커의 몫은 판정이 아니라 "왜 끝났는지"이고, 그 투영
(수렴 = 캡이 끝낸 것이 아니다)은 `seal()`이 한다.

**구멍이 생기지 않는 근거**(F1과 동일): 진짜 캡 소진은 반드시 non-NICE 최종 라운드로
끝난다 — NICE는 루프의 종료 조건이라 그 뒤로 라운드를 열 일이 없고, 거부는 항상 FINAL
라운드 뒤에만 온다(마지막이 OPEN이면 `beginRound`는 멱등 반환이라 `decideRound`에 닿지
않는다). 따라서 종료를 만든 거부는 예외 없이 `fin.verdict !== 'NICE'` 절이 잡는다.

### Implement-time 결정 (후속)

5. **마커가 라운드 수에 결속된다** — `{reason, at, rounds}`. 결속 없는 마커는 "언젠가
   거부가 있었다"는 영구 낙인이라 상태 스냅샷이 아니다. `beginRound`의 clear가 정상
   경로를 덮으므로 이 검사는 손으로 편집된 원장에 대한 2차 방어다.
6. **`state.cap` 갱신을 허용 분기로 옮긴다** — 거부 분기가 write를 하게 되면서 env가
   원장을 덮어쓸 수 있게 됐다. 거부는 항상 라운드 1건 이상 뒤에 오므로 그 시점 cap은
   이미 기록돼 있어 잃는 정보가 없다.
7. **`deriveVerdict(projection)`으로 인자 축소** — `agg`를 받지 않는다. 판정이 마커를
   볼 수 없게 하는 것이 계약이라, 받아 놓고 안 쓰는 것보다 못 받는 편이 강제된다.
   M2 자기 모듈이라 M1 동결 시그니처(P0)와 무관하다.
8. **종료 사유의 투영은 `seal()`이 한다** — `rawAgg.exitReason`을 수렴 여부로 걸러
   report·proof·receipt·반환값에 **하나의 값**으로 흘린다. 원장은 관측 원본을 그대로
   보관하고 `status` subcommand는 그것을 보여준다.

test 8항목 추가(`[19]`·`[20]` + 종료 마커 5건 + 손상 마커 1건). `[19]`는 결속된
마커를 쓰므로 결속 검사로는 걸러지지 않는 축(판정이 마커를 다시 보면 실패)을 지킨다.
