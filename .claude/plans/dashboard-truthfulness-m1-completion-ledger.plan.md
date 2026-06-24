# Plan: Dashboard Truthfulness M1 — 완료 이력 영속화 레지스터 (foundation)

**Source PRD**: `.claude/prds/dashboard-truthfulness.prd.md`
**Selected Milestone**: M1 — 완료 이력 영속화 레지스터 (foundation)
**Complexity**: Medium

## Summary

`/mccp:pr` 게이트 수렴(pr-codex receipt write) 직후, git-tracked **one-file-per-entry 디렉토리**(`.claude/state/completion-ledger/<id>.json`)에 완료 요약 1건을 쓰는 epilogue를 추가한다. receipt는 gitignore + worktree-local이라 merge + `git worktree remove` 후 사라지지만(post-merge amnesia), 이 레지스터는 git-tracked라 살아남는다. derive 엔진에 `ledger` source를 추가하고 `milestone-history.js`가 live receipt 부재 시 이 레지스터를 durable history로 읽어 "날짜 미상"을 해소한다. **데이터 레이어 전용 — UI/렌더 마크업 변경 없음**(렌더러는 레지스터를 읽기만; M2~M4가 표현을 다룬다).

> **Codex R1 흡수**(3 findings, 아래 ## Codex Adversarial Review): (F1) append를 **clean working tree** 게이트로 — dirty 시 skip(재현 가능한 commit_sha만 기록). (F2) 단일 JSON 배열 대신 **one-file-per-entry 디렉토리**(distinct 파일명 → git merge 충돌 0, session-ledger 패턴 완전 미러). (F3) **레지스터 항목 존재가 authoritative** — receipt meta stamp는 진단용(diagnostic-only).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Append-only ledger store (lock + atomic + strict validate) | `plugins/mccp/scripts/state/session-ledger.js:275-311` (`withLedgerLock`, `writeLedgerAtomic`) + `:102-168` (`validate`) | tmp+rename atomic write, stale-lock 재획득, ISO8601_RE strict 검증, loud fail-open WARNING |
| Receipt-write epilogue facade (loud fail-open) | `plugins/mccp/scripts/lib/briefing/index.js:72-130` (`triggerBriefing`) + `:36-70` (`stampReceipt`) | outer try/catch, 절대 throw 안 함, `(allow)` suffix stderr, post-write 재-read 후 carve-out 필드 restamp |
| Receipt epilogue wiring order | `plugins/mccp/scripts/receipt/write.js:367-399` (`write`) | writeReceipt → escalate → briefing → (신규 ledger) → render-trigger, 각 단계 독립 try/catch |
| hash carve-out (stamp가 tamper digest 무력화 방지) | `plugins/mccp/scripts/receipt/hash.js:198-218` (`receiptHash` briefing_* delete) | deep-clone via JSON, epilogue-stamp meta 필드를 hash 본문에서 제외 |
| Additive optional meta schema 검증 | `plugins/mccp/scripts/receipt/schema.js:472-487` (briefing_* present-only `req`) | `if (m.x !== undefined)` present-only 검증, 부재 시 통과(backward-compat) |
| derive count-source | `plugins/mccp/scripts/derive/sources/receipts.js:96-125` (`scanReceipts`) + `backlog.js` | `{ ok, count, items, invalid_count, degraded, error }` shape, fail-open → degraded |
| derive source 등록 | `plugins/mccp/scripts/derive/index.js:19-27` (`SOURCE_SCANNERS`) + `model.js:22-30` (`emptyModel.sources`) + `:61-69` (`validateShape` countSources) | additive optional source, MODEL_VERSION 'v1' 유지 |
| 완료 시점 fallback 사다리 | `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js:63-86` (`pickShipReceipt`) + `:116-120` (resolveGitCommitTime fallback) | live receipt → (신규 ledger) → git commit time → '날짜 미상' |
| plan body 섹션 파서 | `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` (`extractPlanSummary`, `parseDeliveryMilestonesComplete`) | 정규식 섹션 추출, fail-open → null/빈 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/completion-ledger/store.js` | CREATE | one-file-per-entry 저장소(`.claude/state/completion-ledger/<id>.json`) — lock+atomic+strict validate. session-ledger.js 패턴 미러 (F2) |
| `plugins/mccp/scripts/lib/completion-ledger/index.js` | CREATE | `triggerLedgerAppend` facade — gate-gating + clean-tree git-safety(F1) + diagnostic skip stamp(F3). briefing facade 미러 |
| `plugins/mccp/scripts/lib/completion-ledger/tests/store.test.js` | CREATE | per-entry write/idempotency/atomic/validate/degraded + **2-worktree merge 시뮬**(distinct 파일명 무충돌, F2) |
| `plugins/mccp/scripts/lib/completion-ledger/tests/index.test.js` | CREATE | gate-gating/converged-gating/clean-tree skip(F1)/fail-open/carve-out 보존/**meta flag 비-authoritative**(F3) |
| `plugins/mccp/scripts/receipt/hash.js` | UPDATE | `receiptHash` carve-out에 `meta.ledger_write_skipped` 추가 (단일 diagnostic 필드, F3) |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `meta.ledger_write_skipped` present-only 검증 (briefing_* 패턴) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | epilogue에 `triggerLedgerAppend(... { planPath: args.plan })` 와이어 (briefing 다음, render-trigger 이전) |
| `plugins/mccp/scripts/derive/sources/ledger.js` | CREATE | `scanLedger` count-source — 레지스터 read-only surface |
| `plugins/mccp/scripts/derive/index.js` | UPDATE | `SOURCE_SCANNERS`에 `ledger` 등록 |
| `plugins/mccp/scripts/derive/model.js` | UPDATE | `emptyModel.sources.ledger` + `validateShape` countSources 추가 |
| `plugins/mccp/scripts/derive/tests/ledger-source.test.js` | CREATE | scan/empty/invalid/degraded |
| `plugins/mccp/scripts/derive/tests/schema-drift.test.js` | UPDATE | 신규 source key 반영 |
| `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js` | UPDATE | `pickLedgerEntry` durable fallback (live receipt → ledger → git time) |
| `plugins/mccp/scripts/lib/renderer/tests/milestone-history.test.js` | UPDATE | **headline 회귀**: receipt+git 부재 시 ledger가 completedAt 제공 |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATE | ledger source + completion-ledger/ 디렉토리(per-entry) 스키마 + receipt meta `ledger_write_skipped`(diagnostic) 문서화 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.18.2 → 1.18.3` (patch — 단일 milestone ship, §3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer `v1.18.2 → v1.18.3` (line 804) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer `v1.18.2 → v1.18.3` (line 112) |
| `CHANGELOG.md` | UPDATE | 신규 row |
| `.claude/prds/dashboard-truthfulness.prd.md` | UPDATE | M1 Status `pending → in-progress` + Plan cell |

## Tasks

### Task 1: completion-ledger store (one-file-per-entry, F2)
- **Action**: `lib/completion-ledger/store.js` 생성. **디렉토리** `.claude/state/completion-ledger/`, 항목당 1파일 `<id>.json` (id = `<decision_id>__<receipt_hash 12자>`, filesystem-safe sanitize). 각 파일 shape `{ schema_version: 'v1', entry: {...} }`. 함수: `writeEntry(repoRoot, entry, opts)` / `readLedger(repoRoot)`(glob 디렉토리) / `validateEntry(entry)`. Entry 필드: `decision_id, gate, verdict, version, completed_at, commit_sha, plan_basename, plan_file_hash, risks_closed[], oq_closed[], receipt_hash`. **distinct 파일명 → 동시 worktree append가 git merge 충돌 0**(F2 핵심 — 단일 배열 tail 충돌 제거). idempotency: 동일 `<id>` 파일 존재 시 no-op(같은 receipt_hash 재-ship). reader는 decision_id별 최신 completed_at dedup. lock+atomic(tmp+rename)+strict validate, fail-open WARNING.
- **Mirror**: `state/session-ledger.js:252-311` (`ledgerFilePath`/`withLedgerLock`/`writeLedgerAtomic`, **per-session-file 패턴 그대로**) + `:558-660` (`listLedgers` glob+dedup) + `:102-168` (`validate` strict + ISO8601_RE).
- **Validate**: `node --test plugins/mccp/scripts/lib/completion-ledger/tests/store.test.js` (2-worktree 디렉토리 union 시뮬 포함).

### Task 2: clean-tree git-safety gate (F1)
- **Action**: store.js(또는 facade)에 `isLedgerAppendSafe(repoRoot)` → `{ safe, reason }`. **detached/unborn HEAD → unsafe**(안정 commit_sha 없음) + **dirty working tree → unsafe**(F1 흡수 — 재현 불가 commit_sha 방지). dirty 판정은 **allowlist 제외 후** `git status --porcelain`: `.claude/state/completion-ledger/`(자기 자신) · `.claude/state/STATE.md` · `.claude/cache/`(생성물)는 dirty로 치지 않음. mccp 정상 흐름상 `/mccp:pr`은 `/mccp:prp-commit` **이후** 도므로 source 트리는 clean → 정상 PR에서 append 성공(F1 우려 해소). unsafe면 skip + `meta.ledger_write_skipped=true` diagnostic stamp + loud log. `hash.js#runGit` 재사용.
- **Mirror**: `receipt/hash.js:220-272` (`runGit`/`gitBranch`).
- **Validate**: index.test.js에서 dirty-tree fixture(allowlist 밖 파일 수정) → skip + detached → skip + clean → append 검증.

### Task 3: plan body Risks/OQ 스냅샷 추출
- **Action**: `renderer/parsers/plan-body.js`에 `extractRisksAndOpenQuestions(body)` 추가 → `## Risks` 테이블 Risk 열 + `## Open Questions` list item 텍스트 배열. fail-open → `{ risks: [], openQuestions: [] }`. facade가 receipt의 plan path(opts.planPath)로 plan을 읽어 `risks_closed`/`oq_closed` 스냅샷에 사용.
- **Mirror**: `parsers/plan-body.js` `extractPlanSummary` / `parseDeliveryMilestonesComplete` 정규식·fail-open 스타일.
- **Validate**: plan-body-parser.test.js에 케이스 추가.

### Task 4: ledger facade (`triggerLedgerAppend`)
- **Action**: `lib/completion-ledger/index.js` 생성. `triggerLedgerAppend(repoRoot, receipt, receiptPath, opts) → void`. **gate-gating**: `receipt.gate_id === 'mccp-pr-codex'` AND `receipt.resolution?.converged === true` 일 때만 동작, 아니면 no-op return. version 해석(best-effort: repo plugin.json `version` → `git describe --tags --abbrev=0` → null; M2 host-version ladder와 무관한 완료-시점 스냅샷, Open Questions §4). verdict 해석(`meta.advisory`→'advisory' / `meta.skipped`→'skipped' / else 'converged'). git-safe(Task 2)면 entry 조립 후 `store.writeEntry` — **레지스터 항목 존재가 authoritative 완료 신호**(F3). git-unsafe면 write skip + `meta.ledger_write_skipped=true` **diagnostic** restamp(권위 아님, `/mccp:pr` pre-flight + 감사용). 성공 시 receipt 재-stamp **안 함**(`ledger_appended` 폐기 — 항목 존재가 곧 append 신호, F3 흡수 + YAGNI). diagnostic restamp는 briefing `stampReceipt` 미러(disk 재-read → meta set → validate → write; receipt_hash 비재계산, carve-out 보호). outer try/catch 절대 throw 안 함.
- **Mirror**: `lib/briefing/index.js:72-130` (facade) + `:36-70` (`stampReceipt`).
- **Validate**: `node --test plugins/mccp/scripts/lib/completion-ledger/tests/index.test.js`

### Task 5: hash carve-out + schema 필드 (F3 — diagnostic only)
- **Action**: `receipt/hash.js` `receiptHash` carve-out 블록에 `delete clone.meta.ledger_write_skipped;` 추가(briefing_* 바로 뒤; PRD "carve-out 계승"). `receipt/schema.js`에 `meta.ledger_write_skipped` present-only boolean 검증 추가(briefing_* 패턴). buildReceipt meta에는 **추가하지 않음**(epilogue diagnostic-stamp 전용). **단일 필드만** stamp(`ledger_appended` 폐기). 권위 신호는 레지스터 항목 — 소비자(milestone-history/derive)는 meta flag가 아닌 **레지스터 항목**을 읽는다(F3): false meta flag가 소비자를 속이지 못함을 테스트가 보증.
- **Mirror**: `hash.js:211-216` + `schema.js:472-487`.
- **Validate**: carve-out 테스트(`ledger_write_skipped` stamp 전후 `receipt_hash` 불변) + schema accept/reject + **consumer-ignores-meta-flag** 테스트.

### Task 6: write.js epilogue 와이어
- **Action**: `receipt/write.js` `write()`에서 briefing try/catch 다음, render-trigger 이전에 ledger try/catch 삽입: `require('../lib/completion-ledger').triggerLedgerAppend(built.repoRoot, built.receipt, p, { planPath: args.plan })`. lazy-require + outer try `(allow)` 로그(staged-install 안전). 순서: escalate → briefing → **ledger** → render-trigger(레지스터 반영 후 STATUS.md 재렌더).
- **Mirror**: `write.js:370-397` 기존 epilogue 3블록.
- **Validate**: 통합 — pr-codex write fixture가 레지스터 항목 생성 확인.

### Task 7: derive ledger source
- **Action**: `derive/sources/ledger.js` `scanLedger(repoRoot)` → `{ ok, count, items, invalid_count, degraded, error }`. `store.readLedger`(디렉토리 glob+dedup) 사용, 항목 read-only surface(마스킹은 derive mask가 처리). `derive/index.js` `SOURCE_SCANNERS.ledger` 등록 + `model.js emptyModel.sources.ledger`(count-source 형태) + `validateShape` countSources 배열에 `'ledger'` 추가. MODEL_VERSION 'v1' 유지(additive).
- **Mirror**: `derive/sources/receipts.js:96-125` + `index.js:19-27` + `model.js:22-69`.
- **Validate**: `node --test plugins/mccp/scripts/derive/tests/ledger-source.test.js` + schema-drift.test.js 갱신.

### Task 8: milestone-history ledger fallback (headline)
- **Action**: `sections/milestone-history.js`에 `pickLedgerEntry(ledgerItems, planBasename, decisionId)` 추가(decision_id별 최신 completed_at). 완료-시점 사다리: live pr-codex receipt(`pickShipReceipt`) → **ledger** → git commit time(`resolveGitCommitTime`) → '날짜 미상'. `m.sources.ledger.items`를 함수에 주입. ledger가 git-time보다 우선(더 정밀·durable).
- **Mirror**: `milestone-history.js:116-120` 기존 fallback 사다리.
- **Validate**: milestone-history.test.js에 **회귀 추가** — receipts=[] + gitCommitTime=()=>null + ledger 1항목 → `completedAt` = ledger 값(merge+worktree 제거 시뮬레이션).

### Task 9: schema-surface 문서
- **Action**: `docs/v1.3.0-observability/schema-surface.md`에 (a) `completion-ledger.json` 파일 스키마, (b) derive `ledger` source surface, (c) receipt meta `ledger_appended`/`ledger_write_skipped` 추가.
- **Mirror**: 기존 receipt/envelope 스키마 서술 톤.
- **Validate**: 본문 일관성 육안 + 식별자 grep.

### Task 10: version bump + footer + CHANGELOG
- **Action**: plugin.json `1.18.2 → 1.18.3`. html.js:804 + markdown.js:112 footer `v1.18.3` 동기화. CHANGELOG row.
- **Mirror**: §3.7 milestone patch bump.
- **Validate**: `node -e "require('./plugins/mccp/.claude-plugin/plugin.json').version" === 1.18.3` + footer grep.

### Task 11: PRD milestone 테이블 갱신
- **Action**: `dashboard-truthfulness.prd.md` M1 row Status `pending → in-progress`, Plan cell → 본 plan 경로.
- **Validate**: PRD 본문 확인.

## Validation

```bash
# 신규 모듈 단위 테스트
node --test plugins/mccp/scripts/lib/completion-ledger/tests/

# headline 회귀 (durable completedAt)
node --test plugins/mccp/scripts/lib/renderer/tests/milestone-history.test.js

# derive source + schema-drift
node --test plugins/mccp/scripts/derive/tests/

# receipt hash carve-out + schema 회귀
node --test plugins/mccp/scripts/receipt/tests/

# 전체 렌더러/derive 스위트 (0 회귀)
node --test plugins/mccp/scripts/lib/renderer/tests/
node --test plugins/mccp/scripts/derive/tests/

# end-to-end smoke — derive + render가 ledger source 소비
node plugins/mccp/scripts/derive/cli.js run --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s);console.log('ledger source:', !!m.sources.ledger)})"
node plugins/mccp/scripts/derive/cli.js render

# version/footer 동기화
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"
grep -n "v1.18.3" plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ledger restamp가 receipt chain-of-custody(receipt_hash) 훼손 | 중 | Task 5 carve-out + deep-clone(briefing 선례 계승) + stamp 전후 receipt_hash 불변 테스트가 가드 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| durable fallback 오매칭(엉뚱한 plan에 완료 시점 부여) | 중 | `(plan_basename | decision_id)` 명시 매칭만 + cycle-slug 매칭은 live receipt와 동일 규칙 재사용. 오매칭 시 '날짜 미상'으로 degrade(거짓 표기보다 안전) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| 재현 불가 commit_sha(dirty 시점 append) | 중 | **F1 흡수** — clean-tree gate. dirty(allowlist 밖) 시 append skip → HEAD가 reviewed state를 재현. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| cross-worktree 단일 파일 merge 충돌 | 중 | **F2 흡수** — one-file-per-entry. distinct 파일명 → tail 충돌 0. 2-worktree union 테스트가 보증. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| schema-drift / model validateShape 테스트 대량 회귀 | 중 | additive optional source(MODEL_VERSION 'v1' 불변) + countSources 배열 1줄 추가 + drift 테스트 동반 갱신 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| 동일 milestone 재-ship 시 중복 누적 | 저 | `<id>=<decision>__<receipt_hash>` 파일명 idempotency no-op + reader가 decision_id별 최신 dedup |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| epilogue가 receipt write를 poison | 저 | facade loud fail-open(throw 안 함) + write.js outer try `(allow)` belt-and-suspenders(briefing 미러) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->

## Open Questions

> Codex R1 검토 완료(아래 ## Codex Adversarial Review). §1·§2는 R1에서 해소됨.

- **§1 (해소·F1) dirty-tree append 시점**: Codex F1 흡수 — **clean-tree gate**로 확정. dirty(allowlist 밖) 또는 detached/unborn 시 skip + diagnostic stamp. `/mccp:pr`이 `/mccp:prp-commit` 이후 도는 흐름상 source는 clean이라 정상 append. PRD OQ("dirty 시 skip")와 정합. <!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
- **§2 (해소·F2) 레지스터 shape**: Codex F2 흡수 — 단일 JSON 배열 → **one-file-per-entry 디렉토리**(`.claude/state/completion-ledger/<id>.json`). distinct 파일명으로 cross-worktree merge 충돌 0. session-ledger 패턴 완전 미러. <!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
- **§3 risks_closed/oq_closed 의미론**: M1은 ship 시점 plan 본문의 Risks+OQ를 **스냅샷**(채택). M3 은퇴 매칭(스냅샷 ⊆ 현재 본문)이 이를 소비. M1↔M3 계약 정합성은 M3 plan에서 재확인. <!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
- **§4 version 스냅샷 소스**: M1은 완료-시점 best-effort(plugin.json→git describe→null). M2의 live host-version ladder(별도 OQ)와 분리. null 다수 허용. <!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
- **§5 receipt↔ledger drift(PRD OQ #6)**: `⚠ Ledger mismatch` 배너는 표현 레이어 → M1 out-of-scope, M2/M3로 defer. <!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->

## Acceptance
- [ ] 모든 task 완료
- [ ] Validation 전부 통과 (신규 + 전체 회귀 0)
- [ ] receipt_hash가 ledger stamp 전후 불변(carve-out 테스트 green)
- [ ] **headline**: receipt+git 부재 시 ledger가 completedAt 제공(merge+worktree 제거 회귀 green)
- [ ] 패턴 재사용(session-ledger / briefing facade / count-source) — 재발명 아님
- [ ] UI/렌더 마크업 무변경 — 데이터 레이어 only (impeccable 비대상)
- [ ] plugin.json + 양 footer v1.18.3 동기화

## Design Critique

- 트리거: detector `design_signal=true` (Files to Change에 `html.js`/`markdown.js` footer 버전 문자열 + `milestone-history.js` read-side fallback 로직 경로 포함 → whitelist hit).
- verdict: **CONVERGED** (round 1/cap 2). 실제 design surface 없음 — 본 M1은 PRD가 명시한 **데이터 레이어** 작업이다. 렌더러 touch는 (a) footer 버전 문자열 `v1.18.2 → v1.18.3` 동기화, (b) `milestone-history.js`의 완료-시점 fallback **로직**(마크업/시각 변경 없음)에 한정. 정보 위계·강조색·raw marker·항목 상한 4 Output Constraints에 걸리는 신규 surface 없음.
- M2~M4(개요 위젯·은퇴 표현·더보기·복사 버튼)가 실제 design surface를 도입하며, 그때 `frontend-design-direction` SKILL Output Constraints + impeccable `audit`/`polish`를 적용한다(PRD Design Direction).

## Design Routing Guide

routing mode: auto (effective at implement stage). 본 M1은 rendered UI 변경이 없어 plan/implement 모두 impeccable 명령을 invoke하지 않는다 — 아래는 M2+ design surface 작업을 위한 참고 체크리스트일 뿐이다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.18.2/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (R1에서 3건 전부 ACCEPT_NOW 흡수 — 미해소 ACCEPT_NOW HIGH/CRITICAL 없음 → R2 미발동)
- 합치 결론: Codex verdict=`needs-attention` (3 findings). 모두 타당 — M1이 고치려던 영역(dirty-state provenance / merge safety / 검증가능성)을 plan 초안이 도리어 약화시킨다는 지적. R1에서 plan을 개정해 전부 흡수.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 dirty-tree append가 재현 불가 commit_sha 보존 | HIGH | ACCEPT_NOW | clean-tree gate로 전환(dirty allowlist 밖 시 skip). `/mccp:pr`은 commit 이후 흐름이라 정상 append 유지 — PRD OQ와 정합. |
  | F2 단일 append-only JSON이 cross-worktree merge 안전 미보장 | HIGH | ACCEPT_NOW | one-file-per-entry 디렉토리로 전환(distinct 파일명 → tail 충돌 0). session-ledger 패턴 완전 미러 + 2-worktree union 테스트. |
  | F3 carve-out meta가 append/skip 주장 검증 불가 | MEDIUM | ACCEPT_NOW | 레지스터 항목 존재를 authoritative로, receipt meta(`ledger_write_skipped`)는 diagnostic-only로 격하. `ledger_appended` 폐기. consumer가 meta flag 아닌 항목을 읽음을 테스트로 보증. |
- Deferred to backlog: 0
- Open Questions: 없음 (3건 모두 R1 흡수, severity HIGH/MEDIUM — auto-CRITICAL 없음)
- Codex session 참조: threadId `019ef77b-4211-7440-8855-511a81860547`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
