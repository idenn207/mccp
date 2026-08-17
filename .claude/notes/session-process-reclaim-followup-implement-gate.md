# session-process-reclaim followup (M3) — Implement 게이트 기록

> plan 본문이 아니라 여기에 쓴다. plan(`.claude/plans/session-process-reclaim-followup.plan.md`)을
> 편집하면 `mccp-plan-codex/session-process-reclaim-followup.json`이 봉인한 `plan_hash`가 stale이 되어
> 체인이 스스로 깨진다. main의 gate-guard-integrity M3가 같은 이유로 쓴 회피(2.5.4 self-stale)를 그대로 따른다.

## Codex Implementation Review

- 호출: `node …/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0 — Codex가 발화하지 않았다
- 합치 결론: `classification=disabled` · `blocking=false` · `durationMs=0`. user-level `~/.claude/settings.json`의
  `MCCP_CODEX_DISABLED=1`에 의한 v0.3.5 first-class skip이며 실패가 아니다. receipt는 `--codex-verdict skipped`로
  기록하고, `write.js`가 `meta.codex_disabled=true` + `meta.codex_skip_reason='codex_disabled'`를 env에서 자동 stamp한다.
- YAGNI Triage: **해당 없음** — 리뷰어가 발화하지 않았으므로 finding이 0건이다. 발화하지 않은 리뷰어의 침묵을
  승인으로 읽지 않는다.
- Deferred to backlog: 0
- Open Questions: 없음(Codex 축). 이 사이클의 미해소 축은 아래 *심사 공백*이 소유한다.
- Codex session 참조: 없음(spawn 이전 short-circuit)

### 심사되지 않은 implement-time 결정 (열거 — 침묵을 승인으로 읽지 않기 위해)

Codex에 넘긴 focus는 아래 5건이었고, 전부 **심사받지 않은 채** 착지했다.

| # | 결정 | 근거 | 되돌리는 법 |
|---|---|---|---|
| 1 | base 머지에서 `STATE.md`·`fix-task-applied.md`를 ours로 해소 | main 쪽 두 레코드는 각각 gate-guard-integrity M3·santa-loop-materialize M2의 것이고 **둘 다 이미 출하됨**(1.26.1·1.26.0이 main에 있음) — in-flight 손실 0 | 머지 커밋에서 해당 두 경로만 `git checkout <main-sha> --` |
| 2 | 머지 **전에** pending 아티팩트를 커밋 | main도 `STATE.md`·`fix-task-applied.md`를 바꿔 uncommitted 트리로는 `git merge`가 거부한다(실측) | 해당 커밋 revert 후 stash 경로로 재시도 |
| 3 | 목표 버전 `1.27.0` (main `1.26.1` 기준 forward-only) | §3.7 "PRD 전 milestone 완료 → minor". plan 작성 시 실측은 `1.26.0`이었고 머지 중 main이 한 칸 더 밀었다 — 7번째 재발 | 4면 재상향 + Task 2 Validate 전체 재실행 |
| 4 | 스모크 스크립트가 `evidence-lock.js#isPidAlive`를 재사용 (재구현 금지) | plan Task 12 계약 0번이 정본으로 지목. `session-processes.js` export 37개에 `pidAlive`/`isPidAlive` 부재(실측) | — |
| 5 | backlog 행을 리터럴 키워드로 고정 | Validation 7이 substring으로 실재를 판정하므로 뜻이 같아도 문자열이 어긋나면 누락으로 보고된다 | — |

### Security Reviewer

**수행됨** — `Task(security-reviewer)`, 2026-08-17. 사용자가 명시 허가한 뒤 실행했다(세션 agent 정책상
기본은 미호출이며, 최초 `security_skipped=true` receipt는 그 상태를 정직하게 봉인하고 `/mccp:pr`를 막고
있었다). **이 코드가 받은 첫 security 심사다** — M1+M2는 출하된 적이 없어 지금까지 어떤 security 리뷰도
받지 않았으므로, 리뷰 범위를 M3 델타가 아니라 **`origin/main...HEAD` 전체**로 잡았다.

판정: **CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 1.**

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| `writePrivate`(`:230-234`) — `writeFileSync` 성공 후 `renameSync`가 실패하면 tmp 파일이 남는다 | LOW | REJECT_YAGNI | **코드로 확인함**: 레지스트리를 읽는 세 지점 전부(`list :501` · `collectSiblingReuse :615` · `scanForeignOrphans :1396`)가 `name.endsWith('.json')`으로 필터하는데 tmp 접미사는 `.tmp`다. 즉 누출된 tmp는 어떤 회수 판정에도 **구조적으로 도달할 수 없다** — 레코드로 오독될 경로가 없다. 디렉토리도 gitignored working-tree 전용이라 corpus 오염도 아니다. 리뷰어 자신도 "mitigation not required"로 적었다 |

리뷰어가 확인한 방어(요지): 소유권 6축 + 정체 3축이 각각 통과해야 kill에 도달하고 전 축이 fail-closed ·
containment가 `realpathSync.native` + `isInside`로 mkdir 전후에 걸쳐 검사되어 symlink/junction 탈출을
막음 · 명령줄 토큰화가 basename이나 substring이 아니라 **전체 경로 등가**로 대조 · `process.kill`이
`reclaimSession` 안 `isReclaimableBy` 뒤에만 존재함을 소스 스캔 test가 기계적으로 강제.

**심사가 넓힌 것도, 좁힌 것도 없다.** 이미 backlog가 소유한 축(L2 패널 R2의 하드닝 5건 중 security 관점
4건 — `unreclaimed.json mode` 런타임 단언 · `assertSafeSessionId` 전 경로 호출 강제 ·
`probeProcess` 파싱 견고성 · `realpath` 폴백 symlink 봉쇄)은 리뷰어도 별도 취약점으로 올리지 않았고,
Task 9가 열린 채로 등재해 둔 상태 그대로다. 기존 명시 잔여(§D11 TOCTOU · §D15 유계 오살 창 ·
`isNodeInterpreterImage` basename 축)도 리뷰어가 "acknowledged residual"로 확인했을 뿐 등급을 올리지
않았다 — 따라서 이 심사는 "주장하지 않는 것" 목록을 **줄이지 않는다**.

### Design Review

> impeccable silent-skip: `design_signal=false` (reason `no-signal`), `skill_available=true`.

detector가 이번 diff에서 design surface를 찾지 못했다. 이 사이클의 렌더 표면 델타는 `html.js:1419`·
`markdown.js:163`의 **버전 리터럴 2줄**뿐이고 UI 확장자 파일이 0건이므로 detector 판정과 실제가 일치한다.
receipt에 `--impeccable-silent-skip --impeccable-silent-skip-reason "no-signal"`을 forward한다.

## 이 게이트가 순서상 늦게 돌았다 (deviation)

Phase 2.5는 Phase 3 EXECUTE의 **첫 코드 변경 이전**에 돌아야 하는데, 이 사이클에서는 Task 1(base 머지)과
Task 2(버전 상향)가 먼저 착지한 뒤에 돌았다. 원인은 두 Task가 머지 충돌 해소 형태여서 "구현"이 아니라
"Phase 2 PREPARE의 remote 동기화"로 취급됐기 때문이다. 결과적으로 위 focus 1~3은 **이미 착지한 뒤에**
리뷰 대상으로 제출됐다. 되돌리는 법은 위 표에 각각 적었다.
