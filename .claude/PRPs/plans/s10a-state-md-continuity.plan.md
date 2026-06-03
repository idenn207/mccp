# Plan: S10a — STATE.md Continuity Layer

**Source**: v0.2 plan §2 (originating ask: "자동 세션 초기화"), continuation queue Q2
**Selected Milestone**: S10a (STATE.md continuity)
**Complexity**: Medium (3-5 days, ~250 LOC + ~150 LOC tests)
**Blocks**: Q3 (S10b auto-handoff), Q4 (S11 `/mccp:work`)

## Summary

S10a는 docs/v0.2-state-schema.md §1이 명세한 `STATE.md` 컨테이너를 실제 코드로 구현한다. PreCompact 시 writer가 STATE.md를 갱신하고, SessionStart 시 injector가 STATE.md + 미적용 fix-task를 다음 세션 context에 주입한다. 결과적으로 직전 세션의 작업 컨텍스트가 자동 복원되어 사용자가 "어디까지 했더라"를 재구성할 필요가 없어진다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming (state module) | [plugins/mccp/scripts/state/loop-counter.js](plugins/mccp/scripts/state/loop-counter.js) | `<name>.js` + `tests/<name>.test.js` 1:1 |
| Atomic write | [plugins/mccp/scripts/state/loop-counter.js:82-93](plugins/mccp/scripts/state/loop-counter.js#L82-L93) | `tmp = target + '.' + pid + '.' + random + '.tmp'` → `renameSync` |
| Advisory lock | [plugins/mccp/scripts/state/loop-counter.js:100-155](plugins/mccp/scripts/state/loop-counter.js#L100-L155) | `LOCK_MAX_RETRIES=50` × `LOCK_RETRY_MS=20`, `LOCK_STALE_MS=30s`, fail-soft warning |
| Hook bootstrap | [plugins/mccp/scripts/hooks/session-start-bootstrap.js:73-116](plugins/mccp/scripts/hooks/session-start-bootstrap.js#L73-L116) | `resolvePluginRoot` → `run-with-flags.js` → exit-code passthrough |
| Schema version guard | [plugins/mccp/scripts/state/loop-counter.js:72-77](plugins/mccp/scripts/state/loop-counter.js#L72-L77) | `parsed.version !== VERSION` → warn + reset (corrupt = empty) |
| CRLF normalization | [plugins/mccp/scripts/state/fix-task.js:52-59](plugins/mccp/scripts/state/fix-task.js#L52-L59) | `/[\r\n]+/g` not `\r?\n` (bare \r leaks otherwise) |
| Test scaffolding | [plugins/mccp/scripts/state/tests/loop-counter.test.js:1-20](plugins/mccp/scripts/state/tests/loop-counter.test.js#L1-L20) | `node:test` + `mkdtempSync` per-test repo |

## Files to Change

| File | Action | Why |
|---|---|---|
| [plugins/mccp/scripts/state/state-writer.js](plugins/mccp/scripts/state/state-writer.js) | CREATE | STATE.md 생성·갱신 (PreCompact + 이벤트 훅에서 호출) |
| [plugins/mccp/scripts/state/state-injector.js](plugins/mccp/scripts/state/state-injector.js) | CREATE | SessionStart 시 STATE.md + fix-task를 system context로 주입 |
| [plugins/mccp/scripts/state/tests/state-writer.test.js](plugins/mccp/scripts/state/tests/state-writer.test.js) | CREATE | 스키마 enforcement + 동시성 + version guard 회귀 잠금 |
| [plugins/mccp/scripts/state/tests/state-injector.test.js](plugins/mccp/scripts/state/tests/state-injector.test.js) | CREATE | inject 시퀀스 + missing/corrupt fallback + 7-day sweep 검증 |
| [plugins/mccp/scripts/hooks/pre-compact.js](plugins/mccp/scripts/hooks/pre-compact.js) | UPDATE | 기존 로깅 뒤에 `state-writer.update({event: 'precompact'})` 호출 추가 |
| [plugins/mccp/scripts/hooks/session-start.js](plugins/mccp/scripts/hooks/session-start.js) | UPDATE | 기존 context injection 체인에 `state-injector.inject()` 추가 (`<system-reminder>` 포맷) |
| [plugins/mccp/scripts/hooks/tests/session-start.test.js](plugins/mccp/scripts/hooks/tests/session-start.test.js) | UPDATE (또는 신규) | T-Session-Bootstrap 회귀 잠금 |
| [docs/v0.2-state-schema.md](docs/v0.2-state-schema.md) | UPDATE | §1.3 신규: `last_event` enum 확장, writer-driven event 목록 표화, injector skip 매트릭스 |

`docs/v0.2-state-schema.md`의 §1 본문은 이미 완전 — **변경 없이** 구현이 100% 따라가야 한다. §1.3은 writer/injector 행동을 명시한 보조 섹션.

## Tasks

### Task 1: state-writer.js (CREATE, ~120 LOC)

- **Action**: §1.1 스키마대로 STATE.md를 atomic write. API: `update({event, taskFingerprint, goal?, plan?, done?, inProgress?, nextStep?, lastDecision?, openQuestions?, nextChunk?, unsafeCheckpoint?, confirmRequired?})`. 누락된 필드는 기존 STATE.md의 값을 보존(read-modify-write). 신규 파일이면 `created_at = updated_at = now`, 갱신이면 `updated_at = now`만.
- **Body template enforcement**: 섹션 순서 고정(Goal → Plan → Done → In Progress → Next Step → Last Decision → Open Questions → Last Updated). 호출자가 자유 텍스트를 넣어도 template render만 통과시킴.
- **Bounds**: Goal ≤ 3줄, Next Step = 1줄, Last Decision = 1 paragraph (줄바꿈 공백 normalize 후 단일 paragraph로 truncate). 위반 시 `…` truncate + stderr warning(예외 throw 금지 — Stop hook을 막으면 안 됨).
- **Atomicity**: loop-counter.js의 `withCounterLock` + `writeState` 패턴 그대로 복제. `.claude/state/STATE.md.lock` 사용. `tmp = target + '.' + pid + '.' + random + '.tmp'` → `renameSync`.
- **CRLF**: 모든 사용자 입력 필드는 `/[\r\n]+/g, ' '` 정규화 후 줄 수 카운트(fix-task.js의 oneLineExcerpt와 동일 규칙).
- **Mirror**: [loop-counter.js:82-205](plugins/mccp/scripts/state/loop-counter.js#L82-L205) (atomic rename + lock + bumpUnlocked composition)
- **Validate**: `node --test plugins/mccp/scripts/state/tests/state-writer.test.js`

### Task 2: state-writer.test.js (CREATE, ~80 LOC, 8 케이스)

- **Action**: 8 회귀 잠금:
  1. 신규 STATE.md 생성 — 모든 required frontmatter 키 존재(`state_version`, `task_fingerprint`, `created_at`, `updated_at`, `last_event`, `last_event_at`)
  2. read-modify-write 보존 — 두 번째 update에서 미명시 필드는 그대로
  3. Goal > 3줄 → truncate + `…`, 예외 throw 안 함
  4. body section 순서 검증 — header 인덱스 비교
  5. CRLF만 들어와도 body가 깨지지 않음 (`\r`만, `\r\n`만, 섞임 3 케이스)
  6. 동시 호출(2개) — lock으로 직렬화, 둘 다 성공, 두 번째가 첫 번째의 변경을 봄
  7. version mismatch — 기존 파일의 `state_version: 0` 또는 `state_version: 2`면 reset + warning
  8. `confirm_required: true` toggle — frontmatter에 반영
- **Mirror**: [tests/loop-counter.test.js](plugins/mccp/scripts/state/tests/loop-counter.test.js) (`mkdtempSync` per-test repo, `node:test`)
- **Validate**: `node --test plugins/mccp/scripts/state/tests/state-writer.test.js` → 8/8

### Task 3: state-injector.js (CREATE, ~100 LOC)

- **Action**: SessionStart에서 호출되는 inject 함수. API: `inject(repoRoot) → {stdout: string, applied: {state: bool, fixTask: bool}}`. 호출자가 stdout에 그대로 write.
- **Sequence** (failure-isolated, 한 단계 실패가 다음을 막지 않음):
  1. `fix-task-applied.md`의 stat이 7일 초과 → unlink + log (lazy sweep, §2 expiration)
  2. `STATE.md` 읽기 시도
     - 없음/version mismatch/missing required keys → skip with stderr warning(§1 "Required keys" 규칙)
     - OK → `<system-reminder>` 블록으로 body를 inject (frontmatter 제외)
  3. `fix-task.md` 읽기 시도
     - 없음 → skip silently
     - OK → `<system-reminder>` 블록으로 body inject, 그 후 `fs.renameSync` → `fix-task-applied.md`로 atomic rotate(§2 "rotated after SessionStart inject")
  4. `confirm_required: true` → inject 끝에 `[mccp:state] 이어가시겠습니까? (y/n)` prompt(§1.2). default false.
- **Skip matrix** (테스트로 잠금):

| STATE.md | fix-task.md | injector 결과 |
|---|---|---|
| missing | missing | empty stdout, exit 0 |
| missing | present | fix-task만 inject + rotate |
| present (v1, valid) | missing | STATE.md만 inject |
| present | present | 둘 다 inject (STATE 먼저, fix-task 뒤) |
| present (version 0/2) | * | STATE skip + warning, fix-task만 처리 |
| present (missing required key) | * | STATE skip + warning, fix-task만 처리 |
| corrupt frontmatter | * | STATE skip + warning, fix-task만 처리 |

- **Mirror**: [session-start-bootstrap.js:121-156](plugins/mccp/scripts/hooks/session-start-bootstrap.js#L121-L156) (stdout passthrough + non-fatal warning convention)
- **Validate**: `node --test plugins/mccp/scripts/state/tests/state-injector.test.js`

### Task 4: state-injector.test.js (CREATE, ~100 LOC, 9 케이스)

- **Action**: §3의 7-row skip matrix + 2 부가:
  1-7. skip matrix 7 케이스 각각
  8. 7-day sweep — `fix-task-applied.md`의 mtime을 8일 전으로 set → inject 호출 후 파일 unlink 확인
  9. fix-task rotate atomicity — inject 후 `fix-task.md` 없고 `fix-task-applied.md` 있는지
- **Mirror**: [tests/fix-task.test.js](plugins/mccp/scripts/state/tests/fix-task.test.js) (frontmatter / body 직접 assert, fs stat 검증)
- **Validate**: `node --test plugins/mccp/scripts/state/tests/state-injector.test.js` → 9/9

### Task 5: pre-compact.js wiring (UPDATE, ~10 LOC delta)

- **Action**: 기존 로직(compaction-log + active-session note) 유지. 뒤에 try/catch로 `require('../state/state-writer').update({event: 'precompact', taskFingerprint: <derived>})` 추가. 실패해도 process.exit(0) 보존(현재 동작과 일치).
- **taskFingerprint 유도**: PreCompact event JSON에서 first user prompt 추출 불가하므로, `loop-counter.js`의 fingerprint를 last-known 값으로 재사용(`.claude/state/loop-counter.json` tasks에서 가장 최근 `lastAt` 항목). 없으면 `'unknown'` placeholder + warning.
- **Validate**: 수동 — `echo '{}' | node plugins/mccp/scripts/hooks/pre-compact.js` 실행 후 `.claude/state/STATE.md` 생성 확인

### Task 6: session-start.js wiring (UPDATE, ~15 LOC delta)

- **Action**: 기존 context injection 체인(`sessions/*-session.tmp` 로딩) 뒤에 `state-injector.inject(repoRoot)` 호출 추가. 반환된 stdout을 기존 stdout에 append. `try/catch` 감싸서 injector 예외가 SessionStart을 막지 않게.
- **repoRoot 유도**: `process.cwd()`로부터 `git rev-parse --show-toplevel` 시도, 실패 시 `process.cwd()` fallback.
- **Validate**: 수동 — 임시 repo에서 STATE.md + fix-task.md 만들고 session-start.js 실행 → stdout에 `<system-reminder>` 블록 2개 출력 확인

### Task 7: T-Session-Bootstrap 회귀 잠금 (UPDATE/CREATE)

- **Action**: 기존 S9 Task 7의 T-Session-Bootstrap 시나리오를 자동 테스트로 변환. `tests/session-start.test.js`에 다음 회귀 잠금:
  - injector가 throw해도 `session-start.js`가 정상 exit 0
  - STATE.md/fix-task가 없어도 기존 session.tmp injection은 정상 동작
  - inject 순서: 기존 session.tmp context **다음에** state/fix-task가 옴(역순이면 fix-task가 stale context에 묻힘)
- **Mirror**: 없음 — 신규 패턴. spawnSync로 session-start.js 직접 호출 + stdout 검증.
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/session-start.test.js`

### Task 8: docs/v0.2-state-schema.md §1.3 추가 (UPDATE)

- **Action**: §1.2 뒤에 §1.3 "Writer-driven events" 추가:
  - `last_event` enum 표(`stop_loop_pass | receipt_write | pr_created | fix_task_applied | precompact`)
  - 각 event의 어느 hook에서 writer를 호출하는지 매트릭스
  - injector skip 매트릭스 7 케이스 (Task 3의 표 그대로)
- **Validate**: `grep -c '^###' docs/v0.2-state-schema.md` 그대로 — 섹션 순서 안 깨짐

## Validation

```bash
# 단위 테스트
node --test plugins/mccp/scripts/state/tests/state-writer.test.js
node --test plugins/mccp/scripts/state/tests/state-injector.test.js
node --test plugins/mccp/scripts/hooks/tests/session-start.test.js

# 회귀 — 기존 테스트가 깨지지 않는지
node --test plugins/mccp/scripts/state/tests/loop-counter.test.js
node --test plugins/mccp/scripts/state/tests/fix-task.test.js
node --test plugins/mccp/scripts/state/tests/dedupe-key.test.js
node --test plugins/mccp/scripts/state/tests/cli.test.js

# 수동 dogfood (mccp repo 자체에서)
# 1. PreCompact 모의
echo '{}' | node plugins/mccp/scripts/hooks/pre-compact.js
cat .claude/state/STATE.md  # frontmatter + body 확인

# 2. SessionStart 모의 — 새 session.tmp 없는 빈 상태로
echo '{"session_id":"test"}' | node plugins/mccp/scripts/hooks/session-start.js
# 위 STATE.md가 <system-reminder>로 inject되었는지 확인
```

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| state-writer가 concurrent Stop-loop와 race | MEDIUM | medium (state corruption) | loop-counter.js의 `withCounterLock` 그대로 복제 — 동일 패턴이 이미 production에서 검증됨 |
| injector exception이 SessionStart을 죽임 | LOW | high (모든 새 세션 차단) | session-start.js에서 try/catch 감싸기. fallback = inject skip + warning |
| STATE.md 무한 성장 | MEDIUM | low (디스크 점유) | template render가 자동 truncate. Goal ≤ 3줄 등 bound가 enforced |
| fix-task rotate가 atomic하지 않아 다음 세션에서 중복 적용 | LOW | medium (혼란) | `fs.renameSync`는 POSIX/Win32에서 atomic. inject **직후** rotate(읽기와 rename 사이 race 없음) |
| 7-day sweep이 wallclock 변경에 취약 | LOW | low | mtime 사용, 시스템 시계 역행은 v0.3에서 다룰 OOS |
| schema doc과 구현 drift | MEDIUM | high (재구현 사이클) | doc §1을 single source of truth로 선언. drift 시 doc이 권위. PR 시 `grep '^state_version' docs/...`로 sanity check |
| Codex가 atomicity 결함 발견 (escape-overflow 유사) | MEDIUM | medium | Phase 5 게이트 + Codex round 1+ 강제. v0.2.1처럼 회귀 잠금으로 close |
| pre-compact.js의 fingerprint 유도 실패 → `'unknown'` 누적 | MEDIUM | low | warning + 정상 동작 보존. v0.3에서 PreCompact event JSON에 prompt 포함되면 개선 |

## Out of Scope (v0.2)

- **Per-event writer wiring** beyond PreCompact: Q3(S10b)에서 commit/receipt write/pr-created 이벤트에 writer가 hook됨. 본 S10a는 PreCompact + manual API만.
- **next_chunk 채움**: §1.2의 `next_chunk` 필드는 schema 상 정의되어 있지만 채우는 주체는 Q3 breakpoint-detector. S10a는 writer가 받으면 저장하는 것까지만.
- **`unsafe_checkpoint: true` 분기**: Q3 hard ceiling 도달 시점에 set됨. S10a는 frontmatter 통과만 보장.
- **Cross-worktree STATE.md sharing**: worktree별로 `.claude/state/`가 독립이므로 자연 isolation. 명시적 공유 메커니즘은 v0.3 OOS.

## Acceptance

- [ ] state-writer 8/8 tests green
- [ ] state-injector 9/9 tests green
- [ ] session-start.js 회귀 테스트 green (T-Session-Bootstrap 4 시나리오)
- [ ] 기존 state 모듈 tests 회귀 없음 (loop-counter, fix-task, dedupe-key, cli)
- [ ] 수동 dogfood — 본 mccp repo에서 PreCompact → SessionStart 왕복 시 STATE.md/fix-task inject 확인
- [ ] docs §1.3 추가 + §1 본문 미변경
- [ ] Phase 5 Codex 게이트 통과 (receipt write 성공, `/mccp:prp-implement` validate 0 exit)

## Codex Adversarial Review

> Codex unavailable, skipped (auto-fallback): `Skill(codex:adversarial-review)` blocked by `disable-model-invocation` in current harness — Codex CLI 미연동 환경.

**S10a 잔여 리스크 (Codex 미검증 항목 self-flag)**: 본 plan은 다음 세 결정에 대해 adversarial review를 받지 못함 — 구현 시 self-double-check 필요.

1. **Lock 파일 분리의 충분성**: `loop-counter.json.lock` ↔ `STATE.md.lock` 별도 운영이 cross-file invariant(예: counter bump + STATE.md update의 순서성)에 영향 없는지 — Task 1 구현 시 sequence diagram으로 재확인 권장.
2. **fix-task rotate의 atomicity 경계**: `fs.renameSync`는 OS atomic이지만, stdout flush와 동시 실행 시 "inject된 system-reminder가 user에게 보이기 전에 fix-task-applied.md로 이동" 시점 차이가 있음. Task 3 구현 시 rename을 stdout write 후로 명시 배치.
3. **PreCompact fingerprint 유도의 정확성**: 한 세션에서 task가 바뀐 경우(예: Q1 후 Q5로 이동) loop-counter의 most-recent lastAt은 직전 task만 가리킴. Task 5에서 `'unknown'` fallback 발동 조건을 명시적 테스트로 잠금.
