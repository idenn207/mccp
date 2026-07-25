# Plan: Multi-Session Work Loop — M2 (관측 계측)

**Source PRD**: `.claude/prds/multi-session-work-loop.prd.md`
**Selected Milestone**: M2 — 관측 계측
**Complexity**: Large

## Summary

M2는 M1이 계약층으로 freeze한 지표 10개를, **추가 LLM 호출 없이 구조화 데이터로만** 전향 기록하고 산출해 기존 대시보드에 추세와 함께 표시한다. 핵심은 계측 인프라 발명이 아니라, **기존 세션 라이프사이클 hook에 sidecar append-only event log(`.claude/state/msw-events/`)를 얹어** M2 고유 이벤트를 기록하고, 흩어진 신호(session-ledger는 `created_at`/`ended_at`을 **read-only**로만 소비 · hook-trace·STATE.md·receipt·completion-ledger·PR 이력·env 토글)를 derive 층에서 지표로 합성하는 것이다. **session-ledger 스키마는 절대 변경하지 않는다**(Codex R1 F1 — strict unknown-key validator라 필드 추가 시 구버전 reader가 깨진다). C2·C3은 귀속 체인만 전향 구축하고 값은 산출하지 않으며(label-protocol freeze), A1/A2/A4/B2는 소급 baseline 없이 M2 계측 시점부터 전향 수립한다.

착수 전 **진입 게이트**로 `measurement-feasibility.md` 재-freeze를 먼저 처리한다 — `durable-evidence-substrate`(ship receipt git-tracked)와 ledger 술어 정정(codex_verdict-first, v1.22.5)이 오늘 착지해 진입 조건이 해제됐으므로, 부패한 corpus 기준으로 baseline이 고정되는 것을 막기 위해 현재 corpus로 evidence-snapshot을 재산출하고 STATUS를 재기록한 뒤에만 계측 코드를 얹는다.

## GROUND — Multi-Perspective 조사 (inline fan-out)

Phase 2.5 Workflow fan-out 대신 read-only 병렬 탐색 2건(event-producer 매핑 / metrics·dashboard 매핑)으로 GROUND를 수행했다(fail-open 경로). 확정된 사실:

- **session-ledger.js(v2)** 는 `created_at`/`last_seen_at`/`ended_at`/lease/PID-liveness 스키마가 완비돼 있고 **이미 production writer가 있다**(Codex F1 정정 — 최초 GROUND 오판): `session-start.js:668` `createLedger` + `session-end.js:329,336` `updateLedgerHeartbeat`/`finalizeLedger`. 게다가 `validate()`(session-ledger.js:161-164)가 **unknown top-level key를 strict 거부**한다 → 여기에 필드를 추가하면 구버전 reader가 신규 ledger를 reject해 active-session discovery + A1/A2/A4/B2 substrate가 깨진다(mixed-version/rollback 창). **따라서 M2는 ledger 스키마를 건드리지 않는다** — ledger의 `created_at`/`ended_at`/`last_seen_at`을 read-only로 세션 타이밍에 쓰고, M2 고유 필드(`task_completed`·`context_remaining_pct`·인계 항목)는 **sidecar append-only event log**(`.claude/state/msw-events/<session_id>.jsonl`, 자체 lenient 스키마)에 기록한다.
- **context-state.js** 는 `context-current.json`(`context_remaining_pct`/`tool_count`/`context_ts`)의 read/write를 제공하나 현재 파일이 미생성 상태다. producer(ecc-context-monitor)가 stamp하는 경로가 있으므로 A2는 session-end에서 이 값을 읽어 **sidecar msw-events에** 기록한다(ledger 아님 — R2 F3). 부재 시 `context-unknown` 정직 기록 + coverage 미달 표시.
- **EVENT 3(handoff)·6(finding)·7(gate+diff)** 은 STATE.md frontmatter / fix-task·backlog / receipt·completion-ledger에 **이미 기록**된다 → derive read만.
- **토글(B3/EVENT5)** 은 중앙 레지스트리가 없고 receipt meta에 산발 stamp만 있다 → SessionStart env-snapshot 신규 필요. 분모 = runtime surface **99**(`.js`∪`commands/*.md`, tests 제외, `MCCP_TMP` 제외).
- **derive** 는 `index.js`의 9-source scanner에 신규 `sources.*` 등록으로 확장(LLM-free·dep-free·JSON read-only). **renderer** 는 `sections/*.js` + `renderStatus()` 조율 + markdown/html composer; M1 `multi-session.js`(sources.worktrees)가 신규 섹션의 직접 선례.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 계측 프로토콜 문서 | `docs/v1.4.0-multi-session/m3-friction-metric.md` | 스키마 → 이벤트 taxonomy → 집계 규칙 → dogfood 프로토콜 → retention 절 구성. 지표를 문서 1건으로 단일 목적화 |
| derive source (JSON scan) | `plugins/mccp/scripts/derive/sources/backlog.js` | HEADER_RE 정규식 + append-only 파싱 + `{count, items}` emit. read-only·dep-free |
| derive source 등록 | `plugins/mccp/scripts/derive/index.js` (9 SOURCE_SCANNERS) | `sources` 객체에 scanner 등록 + degraded fail-open per-source |
| renderer 신규 섹션 | `plugins/mccp/scripts/lib/renderer/sections/multi-session.js` | derive model 소비 → markdown/html 섹션. graceful hide(분모 0일 때) |
| 원자 상태 write | `plugins/mccp/scripts/lib/context-state.js:69-98` | tmp+pid+random nonce rename + out-of-order reject + best-effort(`{ok:false}` 무예외) |
| session 스키마·liveness | `plugins/mccp/scripts/state/session-ledger.js:48-51,194-200` | v2 KNOWN_KEYS + `pidIsLive()` process.kill(pid,0) + Windows EPERM=alive |
| hook fail-loud-open | `plugins/mccp/scripts/hooks/session-end-trace.js:70-82` | `writeDegradedEndMarker` — 모듈 로드 실패에도 marker 보장 + degraded loud stderr |
| worktree-safe 경로 | `git rev-parse --git-path` (§3.8) | `.git/` hardcode 금지 — worktree에서 `.git`은 파일 |
| version bump | CLAUDE.md §3.7 | 단일 milestone ship = patch 자리. `plugin.json` + user-visible footer(html.js/markdown.js) 동기 |

## Files to Change

경로는 repo-root 상대 full 경로(§1.2 dedupe planned-matcher 요구).

| File | Action | Why |
|---|---|---|
| `docs/multi-session-work-loop/measurement-feasibility.md` | UPDATE | **진입 게이트 재-freeze** — 현재 corpus(git-tracked ship receipt + 정정 ledger 술어)로 STATUS 재기록·수치 갱신 |
| `docs/multi-session-work-loop/evidence-snapshot.json` | UPDATE | 재-freeze 관측값 재산출(단일 출처). CHECK가 산문↔스냅샷 일치 강제 |
| `docs/multi-session-work-loop/measurement-instrumentation.md` | CREATE | M2 계측 설계 — 7 이벤트 → producer → derive → dashboard 매핑 + no-LLM 계약 + anti-gaming 검사 목록 |
| `plugins/mccp/scripts/state/msw-events.js` | CREATE | **sidecar append-only event log** writer(Codex F1 흡수 — session-ledger strict validator를 피함) — `.claude/state/msw-events/<session_id>.jsonl`에 M2 이벤트(착수/종료/context%/task_completed/인계) 원자 append. 자체 lenient 스키마 + per-event `producer_coverage` 마커(F3) |
| `plugins/mccp/scripts/state/session-ledger.js` | (미변경) | **스키마 건드리지 않음**(F1). ledger의 `created_at`/`ended_at`/`last_seen_at`만 read-only로 세션 타이밍에 소비 |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | 기존 `createLedger` 호출 뒤에 msw-events 착수 이벤트(ledger.created_at anchor) append + env-snapshot capture + 직전 세션 인계 항목 복원 매칭(A4). **ledger 스키마 미변경** |
| `plugins/mccp/scripts/hooks/session-end.js` | UPDATE | 기존 `finalizeLedger` 뒤에 msw-events 종료 이벤트(`ended_at`·`task_completed`·`context_remaining_pct` from context-state read) append + 미완 종료 시 인계 항목 write(A4). **ledger 스키마 미변경** |
| `plugins/mccp/scripts/state/toggle-snapshot.js` | CREATE | pure lib — `MCCP_[A-Z0-9_]+` 스캔(분모, tests·`MCCP_TMP` 제외) + default 표 비교 → non-default capture(B3/EVENT5) |
| `plugins/mccp/scripts/state/handoff-items.js` | CREATE | pure lib — 세션 종료 시 미완 인계 항목 열거 + 다음 세션 복원 매칭(A4 분모·분자) |
| `plugins/mccp/scripts/derive/sources/session-activity.js` | CREATE | derive source — **msw-events sidecar** + session-ledger(read-only) + hook-trace shard 상관 → 착수/종료(A1·A2)·활성 구간·동시세션 충돌 창(B2)·인계 복원(A4) + per-source `producer_coverage` 집계(F3) |
| `plugins/mccp/scripts/derive/sources/toggle-usage.js` | CREATE | derive source — env-snapshot 읽어 토글 non-default 사용 이력(B3 분자) + 분모 99 재스캔 |
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | CREATE | pure — derive model → 지표 산출(A1/A2/A4/B1/B2/B3/C1) + anti-gaming 무결성 검사 + forward-only 정직(값 없으면 `baseline-forming`/`insufficient`) |
| `plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js` | CREATE | A3 계측 — 주입 payload 3성분(CLAUDE.md·MEMORY.md index·STATE.md 블록) 바이트+해시 capture + tiktoken o200k_base 토큰 수(python subprocess, 부재 시 `baseline-unavailable` 정직 강등) |
| `plugins/mccp/scripts/lib/msw-metrics/recoverability-probe.js` | CREATE | C1 §4 소급 프로토콜 read-only probe — PR body 산문 층화 표집 + 4임계 검사(표집40·파싱60%·일치율75%·셀당5) → recoverability verdict |
| `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` | CREATE | 대시보드 섹션 — 지표 8종 + 추세 + C2·C3 forward-only 정직 표기 + 분모 0 graceful hide |
| `plugins/mccp/scripts/derive/index.js` | UPDATE | 신규 source(session-activity·toggle-usage) 등록 + `metrics` projection 통합(msw-metrics 호출) |
| `plugins/mccp/scripts/derive/cli.js` | UPDATE | `run --json` 출력에 `metrics` 노출 + `msw-recoverability`/`msw-a3` 서브커맨드 + **`metrics-assert --fixtures --dry-run`**(R2 F2 — 지표 id enumerate·null/baseline-forming reject·B3 실수치 assert, 실패 시 non-zero exit) |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE | `msw-metrics` 섹션을 `renderStatus()` sections 배열에 등록 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | msw-metrics 섹션 composer + footer version 동기 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | msw-metrics 섹션 composer + page-foot version 동기 |
| `.claude/prds/multi-session-work-loop.prd.md` | UPDATE | M2 행 `pending → in-progress` + Plan 셀 = 본 plan 경로 |
| `.gitignore` | UPDATE | **(Claude CL-1)** `.claude/state/msw-events/` + `.claude/state/*.env-snapshot.json` 추가 — 미등록 시 sidecar·env-snapshot이 커밋 오염 + git 이력 유출(기존 `hook-trace/`·`session-ledgers/`·`dispatches/` 패턴 mirror) |
| `plugins/mccp/scripts/hooks/tests/session-hooks-no-llm.test.js` | CREATE | **(Codex R3 F4)** codex-invoke/briefing/agent 모듈 실패 stub 후 session-start/session-end 실행 → LLM 미호출·정상 완료 입증 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.22.5 → 1.22.6`(§3.7 단일 milestone = patch) |
| `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` | CREATE | 지표 산출 + anti-gaming 무결성 + forward-only 정직 회귀 |
| `plugins/mccp/scripts/lib/tests/msw-metrics-acceptance.test.js` | CREATE | **(R2 F2)** seeded fixture + dry-run으로 A1/A2/A4/B1/B2/B3/C1 각 id compute 강제 — null·baseline-forming(claimed-computable) reject, B3 실수치 assert |
| `plugins/mccp/scripts/lib/tests/msw-events.test.js` | CREATE | **(R2 F1)** O_APPEND 원자 append + N 병렬 writer 동시쓰기 stress(전 이벤트·coverage 생존) + ledger 스키마 diff 0 |
| `plugins/mccp/scripts/lib/tests/toggle-snapshot.test.js` | CREATE | 분모 스캔(99 근사)·default 비교·제외 규칙 회귀 |
| `plugins/mccp/scripts/lib/tests/session-activity.test.js` | CREATE | 활성 구간 병합·충돌 창·A4 복원 매칭 회귀 |

## Tasks

### Task 1: 진입 게이트 — measurement-feasibility 재-freeze
- **Action**: 현재 worktree corpus로 §2.1/§2.6/§2.8 재현 쿼리를 재실행(git-tracked ship receipt + 정정 ledger 술어 반영). `evidence-snapshot.json`을 재산출하고 `measurement-feasibility.md` STATUS를 `PROVISIONAL — 2026-07-22`에서 `RE-FROZEN — <오늘>`로 갱신. ledger `verdict` 판별력이 정정 후에도 0인지(codex_verdict-first 적용된 신규 엔트리 유무) 실측 기록. **(santa R1 하드닝 — gitignore-first 순서)** 이 진입 게이트에서 `.gitignore` 등록(CL-1)을 **가장 먼저** 처리한다 — msw-events/env-snapshot 파일이 실제로 생성되는 Task 2 **이전에** `.claude/state/msw-events/` + `.claude/state/*.env-snapshot.json`를 `.gitignore`에 추가해, 미등록 창에서 raw 이벤트·env-snapshot이 커밋 오염되는 경로를 원천 차단(등록이 sidecar 생성보다 늦으면 그 사이 커밋에서 유출).
- **Mirror**: `docs/multi-session-work-loop/measurement-feasibility.md:29-58` 재현 명령 블록
- **Validate**: `node -e` 재현 쿼리 출력이 갱신된 snapshot과 일치. 신규 레코드 write 0(probe read-only).

### Task 2: msw-events sidecar event log (A1·A2 substrate — F1 재설계, R2 race-safe)
- **Action**: `msw-events.js` — `.claude/state/msw-events/<session_id>.jsonl` append-only sidecar. **bounded allowlist 스키마(Codex R3 F1)**: 이벤트 필드는 고정 allowlist(`kind`·`ts`·`session_id`·`created_at`/`ended_at`·`task_slug`·`task_completed`·`context_remaining_pct`·`producer`)만, **per-field char cap 256(hook-trace `FIELD_MAX_CHARS` mirror)** + **max serialized line size cap**(초과 시 truncate+flag). `session-start.js`가 기존 `createLedger`(스키마 미변경) 뒤에 착수 이벤트 append(A1), `session-end.js`가 `finalizeLedger` 뒤에 종료 이벤트 append(A2, context-state read). **append 세만틱 = `O_APPEND` one-buffer write**(Codex R2 F1 — `fs.appendFileSync`가 한 번에 한 라인(개행 포함)을 원자 write; read-modify-rewrite 아님. context-state latest-wins snapshot **mirror 안 함**). best-effort(실패는 hook 진행 무영향). 각 이벤트 `producer` coverage 마커(F3). **retention(R3 F1/CL-3)**: per-file byte cap + global GC(hook-trace `evictLRU` 64KB/100entry/100MB mirror). reader(Task 5)는 **per-line malformed 격리/skip**(부분·초과 라인이 세션 지표를 오염 안 시킴). **(santa R1 하드닝 — O_APPEND 원자성 contingency)** sidecar 경로는 `<session_id>.jsonl` **per-session 샤딩**이라 정상 경로에선 파일당 단일 writer뿐(다중 세션은 서로 다른 파일 → same-file 동시쓰기는 드문 케이스). O_APPEND 원자성은 **가정하지 않고 test로 입증**한다 — Windows N-writer stress test가 interleaving/torn write를 드러내면 O_APPEND 단독을 신뢰하지 말고 (a) writer-당 임시파일+`rename`(context-state 패턴) 또는 (b) advisory-lock+retry(`pr-phase-lock.js` 패턴)로 강등한다.
- **Mirror**: `hook-trace.js:30-32,61`(append-only shard·O_APPEND·`PER_SHARD_MAX_BYTES`·`FIELD_MAX_CHARS`·`evictLRU`), `session-end-trace.js:70-82`(fail-loud-open). **context-state.js는 mirror 안 함**(latest-wins snapshot ≠ append)
- **Validate**: 합성 세션 start→end 시 sidecar에 2 이벤트 append. **session-ledger 스키마 diff 0**(F1) + 생성 ledger가 기존 스키마 밖 키 0(R2 F3). **Windows 동시 append stress test**(N 병렬 writer + **max-size 및 truncated 레코드** → N 이벤트·coverage 생존, malformed는 격리/skip; R3 F1). hook 실패 주입 시 세션 진행 무중단(loud stderr).

### Task 3: env-snapshot + toggle-snapshot lib (B3/EVENT5 — R3 F2 redacted)
- **Action**: `toggle-snapshot.js` pure lib — 분모 스캔(`plugins/mccp/scripts/**/*.js` 제외 tests + `commands/*.md`, 정규식 `MCCP_[A-Z0-9_]+`, `MCCP_TMP` 명시 제외) + default 표(§4 cheat sheet 기반) 비교. `session-start.js`가 `process.env`의 non-default `MCCP_*`를 `.claude/state/<session_id>.env-snapshot.json`으로 capture. **raw 값 영속 금지(Codex R3 F2 + Claude CL-4)** — B3는 raw 값이 아니라 (toggle **name** · non-default **boolean** · default class · 동작 분기 수)만 필요하므로 그것만 기록한다. 자유텍스트 reason 토글(`MCCP_DESIGN_INTENT_REASON`·`MCCP_PR_SKIP_CODEX_REVIEW`·`MCCP_FORCE_PR_WITHOUT_*` 등)은 값에 비밀·경로·자격증명이 섞일 수 있어 raw 저장 시 유출 경로가 된다. 값이 필요한 경우는 salted hash/bucket만. secret-like name은 redact(`derive/mask.js#maskSecrets` catalogue mirror).
- **Mirror**: `derive/sources/backlog.js`(정규식 파싱), `derive/mask.js#maskSecrets`(5-regex redact catalogue), measurement-design.md §4 B3 실행 규칙
- **Validate**: 분모 스캔이 evidence-snapshot 99와 일치(CHECK). non-default 토글 설정 시 snapshot에 **name+boolean만** 기록, default면 미기록. **raw env 값이 snapshot·derived output 어디에도 나타나지 않음**(R3 F2 회귀 test — 알려진 비밀 값 주입 후 부재 assert).

### Task 4: handoff-items lib (A4)
- **Action**: `handoff-items.js` pure lib — 세션 종료 시 미완 작업 상태 항목(STATE.md 진행 항목·미해소 fix-task·미완 plan 등)을 구조화 열거해 write(A4 분모). 다음 session-start가 그 항목의 복원 여부를 매칭 기록(A4 분자). 분모 축소(적게 남겨 부풀리기) 자동 플래그.
- **Mirror**: `state-writer.js`(frontmatter read), session-ledger 인계 스키마
- **Validate**: N개 항목 write 후 다음 세션이 M개 복원 시 A4=M/N. 분모 직전주기 대비 감소 시 플래그.

### Task 5: derive sources — session-activity + toggle-usage (B2·A4·B3)
- **Action**: `session-activity.js` — session-ledger heartbeat(`last_seen_at`) 간격 + hook-trace shard 타임스탬프 + lease mtime을 상관해 세션 활성 구간과 **동시 세션 쌍**(분모)·충돌 창(분자, 같은 파일 교차 write) 도출(B2). `toggle-usage.js` — env-snapshot 집계(B3 분자) + 분모 재스캔. 둘 다 `derive/index.js`에 등록, degraded fail-open.
- **Mirror**: `derive/index.js` SOURCE_SCANNERS, `hook-trace.js:45-58` shard 스키마
- **Validate**: 겹치는 두 세션 fixture → 동시 쌍 1·충돌 창 판정. `derive/cli.js run --json`에 신규 source 노출.

### Task 6: msw-metrics 산출 lib + anti-gaming (A1/A2/A4/B1/B2/B3/C1)
- **Action**: `msw-metrics/index.js` pure — derive model에서 각 지표를 `{numerator, denominator, value, integrity_ok, invalid_reason?, status, coverage}`로 산출. status ∈ `computed|baseline-forming|forward-only|insufficient|invalid`. anti-gaming 무결성 검사(measurement-design 각 지표 표): A1 단위수 급증→분할 의심 플래그·착수시각>지시시각→무효, A2 미완종료↑ 조합→무효, B2 분모0→무효, B3 동작분기 수 병기·blob 접기 탐지, C1 해소 유형 분리(이연·강등·기각 미계상), B1 두 소스 독립성 검증. **F3(coverage) 흡수 — 누락 레코드 ≠ 적은 세션**: 각 producer의 coverage 마커(Task 2 msw-events `producer` 필드)를 metric status에 전파해, required producer coverage 미달 창은 `insufficient`/`invalid`로 처리하고 baseline·추세에서 **제외**한다(compute-time 검사는 "쓰인 적 없는 레코드"를 탐지 못하므로 coverage를 별도 신호로). **C2·C3은 산출하지 않음**(귀속 체인만, `forward-only` 반환).
- **Mirror**: label-protocol.md §5(C1 유형), measurement-design.md §3-5(무결성 검사)
- **Validate**: fixture로 각 지표 값·무결성 검사 발화 확인. C1이 이연·강등·기각을 해소로 계상하지 않음. B2 분모0 시 invalid. **coverage 미달 창이 baseline에서 제외됨**(F3 회귀).

### Task 7: A3 instruction-cost 계측
- **Action**: `a3-instruction-cost.js` — 주입 payload 3성분(CLAUDE.md·`~/.claude/.../MEMORY.md` index·SessionStart STATE.md 블록)에 대해 **토큰/바이트 수는 in-memory로 계산하고 영속물에는 aggregate count + sha256만 남긴다 — raw 바이트열은 절대 저장 안 함(Codex R3 F3 신뢰경계)**. `MEMORY.md`는 repo 밖 user-level 상태라, 그 raw 바이트를 project-local artifact로 영속하면 개인/전역 memory의 새 disclosure 경로가 된다. **user-level memory read는 명시적 opt-in**(env 또는 flag)일 때만; 미opt-in이면 CLAUDE.md·STATE.md 성분만 계산하고 MEMORY 성분은 `omitted`. tiktoken `o200k_base` 토큰 수(python subprocess + `pip show tiktoken` 버전 기록). 분모 = 모델 공표 컨텍스트 길이(문서화 값). **F4 release contract**: 지원 runtime(python + tiktoken o200k_base + 버전 pin)을 measurement-instrumentation.md에 명시. 부재 시 `baseline-unavailable`을 not-delivered로 **loud 표기**(silent pass 금지, 바이트/4 추정 금지).
- **Mirror**: measurement-design.md §A3 실행 규칙(tokenizer 지정), `derive/mask.js`(개인정보 비영속 원칙)
- **Validate**: 지원 runtime에서 tiktoken으로 CLAUDE.md 토큰 수 산출(바이트/4 추정과 ≠). **A3 artifact에 MEMORY/CLAUDE 원문 텍스트가 0(count+hash만) — source text 부재 assert(R3 F3)**. user-memory 미opt-in 시 MEMORY 성분 omitted. tokenizer 부재 시 not-delivered 표기.

### Task 8: C1 recoverability 소급 probe
- **Action**: `recoverability-probe.js` — PR body 산문(`## Codex Review`/YAGNI) 층화 표집(게이트×`base_sha` 월) + 4임계 검사(셀당 양성5·표집40·파싱60%·일치율75%). read-only(신규 레코드 0). 임계 미달 시 C1 소급 불가 확정. 사람 감사 표본 절차(§6, 지표별 5건) 문서화.
- **Mirror**: measurement-feasibility.md §4, label-protocol.md §6
- **Validate**: probe가 verdict(`recoverable`/`insufficient-<axis>`) + 커버리지 수치 emit. 신규 write 0.

### Task 9: 대시보드 섹션 + 추세
- **Action**: `renderer/sections/msw-metrics.js` — 8 지표 + 추세(기존 snapshot 이력 소비, 없으면 현재값+`baseline-forming`) + C2·C3 forward-only 정직 표기 + 분모0/미산출 graceful hide. `renderer/index.js`에 등록, markdown.js/html.js composer + footer version(1.22.6) 동기.
- **Design (Output Constraints — SKILL.md, §3.9 critique 채택)**: 이 섹션은 렌더 표면이므로 4 제약을 준수한다 — (1) **정보 위계 3단계·heading depth ≤ 3**(섹션 heading은 H2 `## Measurement`, 지표 그룹은 최대 H3; 지표별 세부는 표 셀/collapse로 내림), (2) **강조색 화면당 ≤ 1**(invalid/severe 1개 색만; forward-only·baseline-forming은 중립 톤), (3) **raw markdown marker 금지**(`baseline-forming`/`insufficient` 같은 status 표기가 미렌더 `**bold**`/MD0xx로 새지 않게 — html.js escape + markdown.js는 렌더 문자열만), (4) **list-of-N 상한**(지표 10개 중 A·B·C 계열 요약을 상위 3개 expanded + 나머지 `<details><summary>+N more</summary>`로 collapse — "quiet by default, loud on demand"). H15(heading ≤3)는 v1.18.22 produced-diff lint이 implement 시 mechanical 재검증.
- **Mirror**: `renderer/sections/multi-session.js`, `renderStatus()` sections 배열, `frontend-design-direction/SKILL.md` Output Constraints
- **Validate**: `node plugins/mccp/scripts/derive/cli.js render` → STATUS.md에 지표 섹션 출력. XSS payload 자기주입 escape(html.js). heading depth ≤ 3. footer version 3면 동기.

### Task 10: measurement-instrumentation.md + 릴리스 메타
- **Action**: `measurement-instrumentation.md` 작성(7 이벤트 → producer 파일:줄 → derive → dashboard, no-LLM 계약, anti-gaming 검사 목록, retention). PRD M2 행 in-progress + Plan 셀. plugin.json 1.22.6. footer 동기(Task 9와 함께).
- **Mirror**: `docs/v1.4.0-multi-session/m3-friction-metric.md`, CLAUDE.md §3.7
- **Validate**: 문서 cross-link 유효. plugin.json/footer version 일치.

## Validation

```bash
cd <repo-root>/.worktrees/v1.22.6-multi-session-m2

# 1. 신규 lib 단위 테스트
node --test plugins/mccp/scripts/lib/tests/msw-metrics.test.js \
            plugins/mccp/scripts/lib/tests/toggle-snapshot.test.js \
            plugins/mccp/scripts/lib/tests/session-activity.test.js

# 2. (Codex R2 F2) 지표 compute를 기계적으로 강제 — truthy 체크로는 {metrics:{}}가 통과.
#    seeded fixture + production dry-run에서 A1/A2/A4/B1/B2/B3/C1 각 id를 enumerate,
#    null numerator/denominator/status를 reject, claimed-computable에 baseline-forming reject,
#    B3 실 corpus 실수치 assert.
node --test plugins/mccp/scripts/lib/tests/msw-metrics-acceptance.test.js
node plugins/mccp/scripts/derive/cli.js metrics-assert --fixtures --dry-run   # 실패 시 non-zero exit
node plugins/mccp/scripts/derive/cli.js run --strict                          # schema contract probe

# 3. 대시보드 렌더 + escape
node plugins/mccp/scripts/derive/cli.js render && grep -q "measurement" .claude/cache/STATUS.md

# 4. B3 분모 재스캔 == evidence-snapshot
node plugins/mccp/scripts/state/toggle-snapshot.js --scan-denominator | node -e 'const n=+require("fs").readFileSync(0,"utf8").trim();const s=require("./docs/multi-session-work-loop/evidence-snapshot.json");process.exit(n===s.toggles.in_runtime_surface?0:1)'

# 5. (Codex R3 F4) no-LLM 계약 — 신규 lib + **수정된 lifecycle hook 전부** 대상 denylist.
#    hook(session-start/session-end)이 실제 이벤트 producer이므로 반드시 포함(hot-path LLM 잠입 차단).
! grep -rn "codex-invoke\|briefing/invoke\|Skill(\|Agent(" \
    plugins/mccp/scripts/hooks/session-start.js plugins/mccp/scripts/hooks/session-end.js \
    plugins/mccp/scripts/state/msw-events.js plugins/mccp/scripts/state/toggle-snapshot.js \
    plugins/mccp/scripts/state/handoff-items.js plugins/mccp/scripts/lib/msw-metrics/ \
    plugins/mccp/scripts/derive/sources/session-activity.js plugins/mccp/scripts/derive/sources/toggle-usage.js
# 5b. hook 실행 test — codex-invoke/briefing/agent 모듈을 실패로 stub하고 두 hook 실행 → 정상 완료(호출 없음) 입증
node --test plugins/mccp/scripts/hooks/tests/session-hooks-no-llm.test.js

# 6. 재-freeze probe read-only (신규 레코드 0 — git status 미증가 확인)
node plugins/mccp/scripts/derive/cli.js msw-recoverability --dry-run

# 7. version 3면 동기
node -e 'const v=require("./plugins/mccp/.claude-plugin/plugin.json").version; if(v!=="1.22.6")process.exit(1)'

# 8. 전체 회귀
node --test plugins/mccp/scripts/**/tests/*.test.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **(Codex F1 해소)** session-ledger 필드 추가가 strict validator(L161-164)로 구버전 reader를 깨뜨림 | — | ledger 스키마 **미변경** — M2 필드는 sidecar `msw-events` log에 기록. validate() unknown-key 회귀 test |
| **(Codex F4)** A3 tiktoken degradation이 영구 측정 구멍이 됨 | 중 | 지원 runtime(python+tiktoken o200k_base)을 release contract로 명시. 부재 시 not-delivered loud 표기(silent pass 금지). derive core는 dep-free 유지(A3는 derive 밖) |
| A2 context% — producer는 실존(`ecc-context-monitor.js:331` `writeState`, Claude CL-2 정정)하나 ECC bridge 입력(`bridge.context_remaining_pct`)에 종속 | 중 | A2는 session-end에서 read; bridge 무신호 시 `context-unknown` 정직 기록(0으로 위조 금지) + coverage 미달로 baseline 제외(F3) |
| **(Codex R3 + Claude) telemetry 안전성 — 무한 증가·raw 값·개인정보·hot-path LLM** | 높음 | bounded allowlist 스키마 + field/line cap + retention GC(R3 F1) · env-snapshot name-only redact(R3 F2/CL-4) · A3 count+hash만·raw 미영속·user-memory opt-in(R3 F3) · no-LLM denylist를 hook까지(R3 F4) · `.gitignore` 등록(CL-1, **santa R1: sidecar 생성보다 먼저**) · O_APPEND는 per-session 샤딩으로 same-file 경쟁 최소화 + stress test 실패 시 rename/lock+retry fallback(**santa R1**) |
| **(Codex F5)** M2 범위 1 PR 과대 — rollback 경계·컨텍스트 소진 | 높음 | PR 분할은 PRD freeze(작업단위=milestone=1 PR) 위배라 **거부**. 내부 경계로 완화: Task 순서(재-freeze→sidecar→producer→derive→metric→dashboard) + Task별 validate 게이트 + sidecar가 스키마-호환 rollback 위험 제거(F1) + `/mccp:work` 격리 worker 위임 |
| 소급 baseline을 부패 corpus에 고정 | 중 | Task 1 재-freeze를 다른 모든 Task보다 **먼저**. re-freeze 전 metric 산출 금지 |
| **(Codex F3)** fail-open producer 누락이 baseline을 조용히 오염 | 중 | producer별 coverage 마커 → metric status. 미달 창은 insufficient/invalid로 baseline·추세 제외(누락 ≠ 적은 세션). invalid는 loud 표기 |
| 지표가 목적을 대체(A1 부풀리기·B2 직렬화 회피) | 높음 | 무결성 규칙 표를 산출 시점 검사로 인코딩(A1 단위수 급증·착수시각 역전·B2 분모0·B3 분기수) + 감사 표본 절차 |

## Acceptance
- [ ] Task 1 재-freeze 선행 완료(STATUS RE-FROZEN, snapshot 재산출, 신규 레코드 0)
- [ ] 7 이벤트 전부 구조화 producer 연결(추가 LLM 호출 0 — Validation 5 통과). session-ledger 스키마 diff 0(F1)
- [ ] **(Codex F2) 각 claimed-computable 지표(A1/A2/A4/B1/B2/B3/C1)가 seeded fixture + production dry-run에서 non-null numerator/denominator/status로 실제 산출됨** — "baseline-forming" 단독은 acceptance 미충족(compute 경로 end-to-end 입증 필수). B3는 실 corpus 실수치
- [ ] 산출 지표 대시보드에 추세와 표시(fixture-computed + B3 실수치)
- [ ] **(Codex F3) producer coverage 미달 창은 insufficient/invalid로 baseline·추세 제외**(누락 레코드가 적은 세션으로 위장 안 됨)
- [ ] **(Codex F4) A3가 지원 runtime에서 실제 토큰 산출** 또는 미산출을 not-delivered로 loud 표기(silent pass 금지)
- [ ] C2·C3은 귀속 체인만, 값 미산출(forward-only)로 정직 표기
- [ ] C1 §4 소급 probe verdict + 커버리지 수치 산출
- [ ] anti-gaming 무결성 검사 mechanical 인코딩 + invalid loud 표기
- [ ] **(R3 telemetry 안전성)** sidecar bounded(field/line cap·malformed 격리·retention GC) + Windows max/truncated stress 통과(F1) · env-snapshot raw 값 부재(F2 회귀 test) · A3 artifact에 source text 0·user-memory opt-in(F3) · no-LLM denylist가 hook 포함(F4) · msw-events/env-snapshot `.gitignore` 등록(CL-1)
- [ ] All tasks complete · Validation passes · Patterns mirrored, not reinvented
- [ ] plugin.json 1.22.6 + footer 3면 동기

## External Research Provenance

- Source PRD: .claude/prds/multi-session-work-loop.prd.md
- References section sha256: 1aaa7924f4e1ebed8993b242c00788e1c0ad84319463ff89f3a29625b33aa880
- Stamped at: 2026-07-24T09:11:26.516Z
- Anchor: plan body is hash-anchored by the plan-codex receipt plan_hash. Any post-stamp PRD ## References mutation mismatches on next /mccp:plan validate.

## Design Critique

- SKILL first-step: `frontend-design-direction/SKILL.md` Output Constraints Read 완료.
- Design surface: 대시보드 `renderer/sections/msw-metrics.js`(STATUS.md/status.html metrics 섹션) — PRD 수용조건 "판단용 시각화".
- Round 0 finding(MEDIUM): Task 9가 4 Output Constraints를 명시 채택하지 않음 → Task 9 Design 항목으로 채택(heading≤3·accent≤1·raw-marker 금지·list-of-N top3+collapse).
- Verdict: **converged** (rounds=1). HIGH/CRITICAL 잔존 0. produced-diff H15 lint이 implement 시 mechanical 재검증.

## Codex Adversarial Review

- 호출: `codex-invoke.js adversarial-review` (fail-closed wrapper, v0.2.2) + impeccable design-scope preamble
- 라운드: **3 (R1 + R2 + R3) — 세 번 다 verdict=needs-attention (No-ship)**. R3에서 **Claude 독립 분석(architect fresh-eyes, 코드 대조) 병행** — 두 모델이 telemetry 안전성 축에서 독립 수렴.
- 합치 결론: **미수렴(divergent)** — 총 13건 흡수(HIGH 10·MED 3), F5 1건 정당 거부. R3 흡수 후 Codex 재확인 전 — 운영자 판단 대기. implement는 별도 세션.

### R1 — needs-attention (No-ship)
| Finding | Sev | Verdict | 처리 |
|---|---|---|---|
| F1 dormant-ledger 전제 오류 + strict unknown-key validator | HIGH | ACCEPT_NOW | 사실 정정(writer 존재·구버전 reader 파괴 위험) → ledger 스키마 확장 폐기, **sidecar event log** |
| F2 계측 없이 ship 가능한 acceptance | HIGH | ACCEPT_NOW | fixture 기반 compute를 acceptance에 강제 |
| F3 fail-open producer가 baseline 조용히 오염 | MED | ACCEPT_NOW | per-producer coverage → status(insufficient/invalid), baseline 제외 |
| F4 A3 tiktoken degradation 영구 구멍 | MED | ACCEPT_NOW | tokenizer release contract + 미산출 not-delivered loud |
| F5 24파일 rollback 경계 → PR 분할 | MED | REJECT_YAGNI | PRD freeze(milestone=1 PR) 위배 → 분할 거부, 내부 경계로 완화 |

### R2 — needs-attention (No-ship), R1 흡수 재검증
| Finding | Sev | Verdict | 처리 |
|---|---|---|---|
| F1 sidecar tmp+rename 동시쓰기 라인 유실 | HIGH | ACCEPT_NOW | **O_APPEND** 원자 append + N-writer stress test (hook-trace 패턴, context-state latest-wins mirror 폐기) |
| F2 acceptance가 기계적으로 미강제(truthy만) | HIGH | ACCEPT_NOW | `metrics-assert` CLI + acceptance test(각 id enumerate·null/baseline-forming reject·B3 실수치) |
| F3 stale ledger "연결"·"봉인" 표현 잔존 | HIGH | ACCEPT_NOW | Summary/GROUND 정리 + 생성 ledger가 기존 스키마 밖 키 0 validation |

### R3 — needs-attention (No-ship) + Claude 독립 분석 병행 (telemetry 안전성 수렴)
| Finding | 출처 | Sev | Verdict | 처리 |
|---|---|---|---|---|
| F1 O_APPEND이 bounded record/corruption 보장 없음(max line·field cap·malformed 격리 부재) | Codex R3 + Claude CL-3 | HIGH | ACCEPT_NOW | allowlist bounded 스키마 + field/line cap + retention GC + malformed skip + Windows max/truncated stress (hook-trace mirror) |
| F2 env-snapshot이 raw `MCCP_*` 값 영속(비밀·경로 유출) | Codex R3 + Claude CL-4 | HIGH | ACCEPT_NOW | name+boolean+분기수만 기록, raw 값 미영속, secret-name redact(mask.js) + 회귀 test |
| F3 A3가 user `MEMORY.md` raw 바이트 캡처(repo 신뢰경계) | Codex R3 + Claude | HIGH | ACCEPT_NOW | count+hash만 영속·raw 미저장·user-memory opt-in·source-text-0 assert |
| F4 no-LLM 검사가 수정된 hook(session-start/end) 누락 | Codex R3 | HIGH | ACCEPT_NOW | denylist를 hook 포함 전 touched 파일로 + hook 실행 stub test |
| CL-1 msw-events/env-snapshot이 `.gitignore` 미등록(커밋 오염+이력 유출) | Claude 고유 | HIGH | ACCEPT_NOW | `.gitignore` 등록(기존 state 패턴 mirror) |
| CL-2 A2 producer 실존(ecc-context-monitor writeState) | Claude 고유 | — | (Risk 완화) | Risk 문구 정정 |

- Deferred to backlog: 0 (F5는 reject, defer 아님)
- Open Questions: **divergent(Codex R1/R2/R3) — 운영자 accept-and-proceed** — santa-loop 에스컬레이션(아래 절) 후 implement 진행 결정. plan-codex verdict는 정직하게 **divergent** 유지(dedupe fail-closed → 복귀한 Codex가 PR-Codex에서 실발화). Codex 재확인은 Jul 29(usage 복구)/PR-Codex로 이연.
- 병행 검증 메모: R3의 F2/F3는 Claude 독립 분석과 **교차 확인**(두 모델이 같은 결함 독립 지목 = 강한 신호), F1은 Claude CL-3가 씨앗을 먼저 발견, F4는 Codex 고유, CL-1은 Claude 고유. dual-review + cross-model이 실제로 상보적으로 작동한 사례.
- Codex 참조: R1 thread 019f9368-3260-7a60, R2·R3 재검증 thread.

### Santa-loop 에스컬레이션 재검증 (2026-07-24)

- **트리거**: DIVERGENT_UNRESOLVED plan-codex 게이트 운영자 에스컬레이션(`/mccp:santa-loop '<gate-receipt:mccp-plan-codex/multi-session-work-loop>'`).
- **리뷰어**: Reviewer A = Claude Opus(`code-reviewer`). Reviewer B = Codex GPT-5.4가 **usage limit(Jul 29 복구)로 실패** → skill fallback으로 Reviewer B = 2번째 Claude Opus(context-isolated). **⚠️ model diversity 미달**(둘 다 Opus) — 원래 divergent를 낸 Codex의 재확인은 미획득.
- **결과**: A **PASS**(8/8) · B **FAIL**(3 PASS / 5 FAIL). **양쪽 합의: 흡수 13건 real + 코드 사실 grounding 정확** — session-ledger strict validator(L161-165)·hook-trace 캡(FIELD_MAX_CHARS=256/PER_SHARD_MAX_BYTES=64KB)·context-state atomic rename·createLedger(L668)/finalizeLedger(L336) 전부 실파일 confirmed. B의 5개 FAIL(`security_boundary`/`atomic_concurrency`/`no_llm_contract`/`measurement_integrity`/`no_regression`)은 **전부 "구현/테스트 파일 미존재" 단일 근거** = plan-vs-구현 frame 불일치(그 파일들은 implement의 산출물이지 plan 전제조건이 아님). **새 substantive design 결함 0**.
- **운영자 결정**: accept-and-proceed. Codex 최종 cross-model 확인은 복구(Jul 29) 후 **PR-Codex 게이트로 이연**. plan-codex verdict는 정직하게 **divergent** 유지.
- **santa R1 하드닝 2건 흡수**: (1) `.gitignore`-first 순서(Task 1 — commit-leak 창 차단), (2) O_APPEND Windows 원자성 contingency + per-session 샤딩 명시(Task 2/Risks — 원자성을 test로 입증하거나 rename/lock+retry fallback).

## Codex Implementation Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed wrapper, v0.2.2)
- 라운드 수: 0 (advisory — Codex 미발화)
- 합치 결론: **Codex unavailable (usage limit, Jul 29 복구 예정) — advisory mode**. 실측 `exit=12 · class=exit-nonzero · blocking=1`. 운영자 accept-and-proceed 결정에 따라 `MCCP_ALLOW_CODEX_UNAVAILABLE=1` non-approving receipt로 진행. 실 cross-model implement 검증은 **PR-Codex(복귀 후)로 이연** — dedupe는 plan-codex divergent + 본 implement unavailable로 fail-closed → PR-Codex 실발화 보장.
> Codex unavailable, skipped (auto-fallback): exit-nonzero (usage limit until Jul 29)
- YAGNI Triage: n/a (Codex 미발화)
- Open Questions: divergent (plan-codex) 유지 — santa-loop adjudicated accept-and-proceed (위 절)
- Codex session 참조: n/a (advisory)

### Design Review
> impeccable design gate: `skill_available=true · design_signal=false` → silent-skip(no-signal). 현재 diff에 rendered surface 없음(코드 미작성). Task 9 대시보드 섹션(`renderer/sections/msw-metrics.js`)은 plan Design Critique(converged) + Phase 3.7 produced-diff H15 lint으로 EXECUTE 시 mechanical 재검증.

### Security Reviewer
> 보안 민감 영역(env-snapshot 비밀·경로 redaction[R3-F2], A3 user-memory raw-byte 신뢰경계[R3-F3], malformed-line 격리[R3-F1])은 **santa-loop dual review의 `security_boundary` 기준으로 이미 검토**(양 리뷰어 평가, Reviewer B의 gitignore-timing 지적 흡수). produced 코드 대상 재검증은 post-EXECUTE 회귀 test(raw-value 부재·source-text-0) + PR 게이트 security-reviewer가 담당. pre-EXECUTE(무 diff) 재실행은 redundant로 생략.

