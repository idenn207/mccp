# Plan: `/mccp:archive-complete` — 완료 PRD/plan 아카이브 + 대시보드 정합화 command

**Source PRD**: (none — free-form 입력, 직전 세션 commit `18ebe94`/v1.20.14 수동 작업이 사양 레퍼런스)
**Selected Milestone**: 단일 milestone (신규 command)
**Complexity**: Medium

## Summary

직전 세션에서 수동 수행한 "완료 PRD/plan을 `archived/`로 이동 + status drift 정정 + 대시보드 재렌더" 흐름을 재사용 가능한 human-gate command `/mccp:archive-complete`로 만든다. `/mccp:dashboard-audit`의 6-phase 형태(결정적 scan → agent 평가 → human-gate → 결정적 apply → render → output)를 그대로 미러하되, 비파괴 마커 대신 **파일 이동 + status flip**을 수행한다. 핵심 정확성 기준은 "PRD 전체가 완료됐을 때만 그 plan을 archive"하는 dangling-active-PRD 불변식(C2)이다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Command 6-phase | `plugins/mccp/commands/dashboard-audit.md` | ENUMERATE→EVALUATE→PROPOSE+HUMAN-GATE→APPLY→RENDER→OUTPUT. `${CLAUDE_PLUGIN_ROOT}` 경로(버전 하드코딩 금지) |
| enumerate/apply 분리 | `plugins/mccp/scripts/lib/stale-audit/enumerate.js`, `apply.js` | 결정적 스크립트, agent는 평가만 |
| content-hash CAS + rollback | `plugins/mccp/scripts/lib/stale-audit/apply.js` | per-file lock + rename 직전 재-read 불일치 abort + idempotent + 재-parse 무손상 검증 |
| milestone 파싱 | `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js:205,262` | `parseDeliveryMilestonesComplete`(`cells[3]==='complete'`)·`parseDeliveryMilestonesLifecycle`(pending/dropped) |
| plan↔PRD 인덱스 | `plugins/mccp/scripts/derive/sources/plans.js` | `scanPlans`·`PLAN_DIRS`·`extractSourcePrd`(링크+평문 both) |
| drift 증거원 | `plugins/mccp/scripts/lib/completion-ledger/store.js` | `readLedger`(git-tracked durable) |
| 아카이브 목적지 | `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js:51,181,218` | PRD→`.claude/prds/archived/`, plan→`.claude/PRPs/plans/archived/` |
| worktree-safe tmp / fail-open | 전역 컨벤션 | `git rev-parse --git-path`, throw 안 함 |

## 핵심 정합성 불변식 (코드 근거)

- **C1** — PRD는 활성 plan `source_prd`로만 대시보드 discovery (`plans.js` `PLAN_DIRS` 비재귀 + `milestone-history.js` plan 루프). derive에 전용 PRD source 없음.
- **C2 (정확성 기준)** — 완료 plan archive는 **PRD 전체 완료 시에만**. 미완료 PRD의 plan을 옮기면 어느 스캔에도 안 잡혀 PRD 소실 (`milestone-history.js:218`은 `.claude/prds/archived/`만 스캔, 활성 `.claude/prds/`는 안 함).
- **C3** — 목적지 고정: PRD→`.claude/prds/archived/`, plan→`.claude/PRPs/plans/archived/` (`.claude/plans/`에 살던 plan도 archived 목적지는 `PRPs/plans/archived/`). 비재귀라 archived/ 하위는 자동 비표시.
- **C4** — status 파싱은 `=== 'complete'` 엄격 일치. 비정규 텍스트(예 "complete (verify) · gated")는 complete도 lifecycle도 아님 → 보수적 미-archivable.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/archive-complete/scan.js` | CREATE | 결정적 스캔: 활성 PRD 열거 → milestone 분류 → plan↔PRD 인덱스 → drift 증거 수집 → `{prds:[{path,name,milestones,plans,archivable,reason}]}` JSON |
| `plugins/mccp/scripts/lib/archive-complete/apply.js` | CREATE | 원자 archive 트랜잭션: preflight-all → operation journal → status flip(CAS) + `git mv` PRD/plan→archived → 실패 시 전량 rollback(collision-safe·idempotent). journal은 `.claude/state/archive-journal/<id>.json`(git-tracked)에 audit anchor 겸 기록 |
| `plugins/mccp/scripts/lib/archive-complete/tests/scan.test.js` | CREATE | archivable 판정·C2 불변식·비정규 status·drift 증거 fixture 테스트 (`node --test`) |
| `plugins/mccp/scripts/lib/archive-complete/tests/apply.test.js` | CREATE | CAS·rollback·collision·idempotent·git mv 테스트 |
| `plugins/mccp/commands/archive-complete.md` | CREATE | 6-phase human-gate command body (`${CLAUDE_PLUGIN_ROOT}` 경로) |
| `CLAUDE.md` | UPDATE | §3 신설 subsection — `archived/` 아카이브 관례 (C1~C4 + 하드코딩 스캔 경로 + command 포인터) |
| `CHANGELOG.md` | UPDATE | 신규 row |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (신규 command = patch, `1.20.14 → 1.20.15`) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer 버전 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer 버전 동기 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer 버전 어서션 동기 |

## Tasks

### Task 1: scan.js — 결정적 스캐너 + 분류기
- **Action**:
  - `.claude/prds/` 활성 PRD 열거(비재귀, `archived/` 제외).
  - **raw-table 열거 우선 (Codex F1 흡수)**: 각 PRD의 `## Delivery Milestones` 표를 **원시 행 단위로 전부 열거**(`parseTableRows` 재사용)해 `rawRowCount` 확정 — `parseDeliveryMilestonesComplete`/`Lifecycle`는 *분류*에만 쓰고 *분모*로 쓰지 않는다. 각 행 status를 `complete | pending | in-progress | dropped | non-canonical`로 정규화(비정규 = 위 4개 정규 토큰 어디에도 안 맞는 셀).
  - **archivable 판정(C2·C4 fail-closed)**: `표 존재 AND rawRowCount ≥ 1 AND rawRowCount === completeRows + droppedRows` 일 때만 archivable. 즉 **모든 원시 행이 complete OR dropped**여야 하며, pending/in-progress/**non-canonical/파싱불가 행이 하나라도 있으면 non-archivable**. 비정규 행이 어느 분류 집합에도 안 잡혀 분모에서 증발하는 오분류(F1)를 rawRowCount 등식이 차단한다. 파싱 mismatch(`rawRowCount ≠ complete + dropped + pending + inprogress + noncanonical`)도 fail-closed non-archivable.
  - plan↔PRD 인덱스: `plans.js` `scanPlans`로 `.claude/plans`+`.claude/PRPs/plans` 스캔 → `source_prd`가 이 PRD를 가리키는 plan 집합 수집.
  - **drift 증거(2차 cross-check)**: pending/in-progress 행에 대해 `readLedger`(plan_basename/decision 매칭) → `mccp-pr-codex` receipt → (옵션) git log 순으로 shipped 증거 조회. 증거 있으면 `driftSuspect:true` + 증거 인용.
  - 출력 `{prds:[{path,name,milestones:[{name,status,driftSuspect,evidence}],plans:[relpath...],archivable,reason}], scanned}`. `--json`.
- **Mirror**: `stale-audit/enumerate.js` 구조 + `plans.js`/`plan-body.js`/`completion-ledger/store.js` import.
- **Validate**: `node plugins/mccp/scripts/lib/archive-complete/tests/scan.test.js` (fixture: workflow-orchestration 유사 M4=pending → archivable=false; all-complete PRD → archivable=true; "complete (verify)·gated" → non-canonical → archivable=false).

### Task 2: apply.js — 원자 archive 트랜잭션 + status-corrector
- **Action**:
  - 입력: 승인된 `{statusCorrections:[{prdPath,milestoneName,newStatus,reason,evidence}], archives:[{prdPath, planPaths:[...]}]}`.
  - **원자 트랜잭션 (Codex F2 흡수 — all-or-nothing)**: 어떤 mutation보다 먼저 **전 archive set을 preflight**한다 — 모든 목적지 경로/collision/소스 존재/git 상태를 한 번에 검사, 하나라도 실패면 mutation 0으로 abort. 통과 시 **operation journal**을 기록하고 순차 적용하되, **적용 중 어떤 실패(collision·fs error·git mv 실패·중단)든 journal로 전량 rollback**(옮긴 파일 reverse `git mv` + 편집한 status 셀 원복). **PRD + 그에 속한 모든 plan은 하나의 원자 단위** — archived PRD + active plan이 남는 부분 상태(C2 위반)를 구조적으로 불가능하게. 재실행은 journal 대조로 idempotent.
  - **operation journal = durable audit anchor (Codex F3 부분 흡수)**: journal은 rollback 매체이자 **감사 기록**을 겸한다 — scan hash, 승인된 corrections + 그 evidence 참조, 소스 content hash, 목적지, timestamp, session id. 위치는 `.claude/state/archive-journal/<id>.json`(git-tracked, completion-ledger 패턴 미러). 이로써 "왜 이 pending을 complete로 flip했나 / 이 부분 상태가 인가된 run에서 왔나"가 git diff 밖에서도 복원 가능. **주의(D3 유지)**: 이 journal은 durable operation manifest이지 `mccp-*-codex` **게이트 receipt가 아니다** — cross-model adversarial review를 요구하지 않는다(파일 이동 chore에 Codex 게이트는 YAGNI, human-gate + git history가 review). Codex F3의 "gate receipt" 프레이밍은 REJECT하되 그 audit-durability 의도는 journal이 충족.
  - status flip: PRD Delivery Milestones 표 해당 행 status 셀만 편집. content-hash CAS(재-read 불일치 abort) + 편집 후 표 재-parse 무손상 검증. 실패 시 위 트랜잭션 rollback에 포함.
  - 이동: `git mv` PRD→`.claude/prds/archived/`, 각 plan→`.claude/PRPs/plans/archived/`. **불변식(C2)**: `archives[]`의 PRD는 scan이 archivable=true 판정한 것만 + 그 PRD의 **모든 완료 plan을 함께** 이동(apply가 재검증, 단독 이동 거부).
  - collision(목적지 basename 존재): 내용 동일→skip(idempotent), 상이→`<name>.legacy.md` 보존(데이터 손실 0).
  - 결과 `{moved, corrected, skipped, aborted, rolledBack, errors, journalPath}`.
- **Mirror**: `stale-audit/apply.js`(lock+CAS+rollback+idempotent) + `completion-ledger/store.js`(git-tracked journal, tmp+rename atomic). git mv는 `execFileSync`.
- **Validate**: `node .../tests/apply.test.js` (tmp repo fixture: preflight collision → mutation 0 abort; **git mv 중간 실패 주입 → 전량 rollback**(archived PRD + active plan 부분 상태 0 검증); CAS 불일치 abort; idempotent re-run(journal 대조); collision -legacy; git mv history 보존).

### Task 3: archive-complete.md — command body
- **Action**: dashboard-audit.md 6-phase 미러.
  - Phase 0 SCAN: `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/archive-complete/scan.js" --json`.
  - Phase 1 EVALUATE(agent): drift-suspect milestone에 증거 인용해 status 정정 제안, archivable PRD+plan 목록화. **불확실→미이동(live 보수)**.
  - Phase 2 PROPOSE+HUMAN-GATE: (a) status 정정표, (b) archive 이동표 제시 → 명시 승인(전체/부분/거부). 자동 적용 금지.
  - Phase 3 APPLY: 승인분만 `apply.js`에 직렬화 전달.
  - Phase 4 RENDER+VERIFY: `derive/cli.js render` → `derive/cli.js run --json`으로 모든 source `degraded===false` 검증 + STATUS.md 크기 델타 보고.
  - Phase 5 OUTPUT + **version advisory**: 요약 + plugin.json/footer version drift 감지 시 §3.7 체크리스트 안내(auto-edit 안 함).
- **Mirror**: `dashboard-audit.md` phase 서술·human-gate 문구·`${CLAUDE_PLUGIN_ROOT}` 경로.
- **Validate**: command frontmatter/phase 구조 리뷰 + dogfood 1회(현행 repo에서 scan → workflow-orchestration이 archivable=false로 나오는지 육안).

### Task 4: CLAUDE.md §3 archived/ 관례 문서 + 릴리스 동기
- **Action**: §3에 subsection 신설 — `archived/` 폴더명 통일, C1~C4 불변식, `milestone-history.js` 하드코딩 스캔 경로(51/181/218), `/mccp:archive-complete` 포인터, 기존 command(milestone-close/dashboard-audit)와의 capability 구분. CHANGELOG row + plugin.json `1.20.14→1.20.15` + footer 2개 + i18n 테스트 어서션 동기.
- **Mirror**: §3.7/§3.8 문서 톤 + `18ebe94` 커밋의 릴리스 동기 항목.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` green(footer 버전 일치).

## Validation
```bash
node --test plugins/mccp/scripts/lib/archive-complete/tests/
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
# dogfood: 현행 repo에서 scan은 archive 대상 0을 보고해야 한다
node plugins/mccp/scripts/lib/archive-complete/scan.js --json | node -e 'const j=JSON.parse(require("fs").readFileSync(0));console.log("archivable:",j.prds.filter(p=>p.archivable).map(p=>p.name))'
# 재렌더 후 derive degraded 0
node plugins/mccp/scripts/derive/cli.js render && node plugins/mccp/scripts/derive/cli.js run --json | node -e 'const m=JSON.parse(require("fs").readFileSync(0));const d=Object.entries(m.sources||{}).filter(([,s])=>s.degraded);console.log("degraded:",d.map(([k])=>k))'
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| dangling active PRD 소실(C2 위반) | 높음(오설계 시) | archivable = **rawRowCount === complete + dropped**(전 원시 행) + apply가 PRD+plan 원자 이동 재검증 |
| 비정규 status 행이 분모서 증발 → 오분류(Codex F1) | 중간 | raw-table 열거로 rawRowCount 확정, 비정규는 어느 정규 토큰도 아니라 등식 깨짐 → fail-closed non-archivable |
| apply 중간 실패로 부분 상태(archived PRD + active plan, Codex F2) | 중간 | preflight-all → journal → 실패 시 전량 rollback, PRD+plans 단일 원자 단위 |
| 파괴적 변경 audit 유실(Codex F3) | 낮음 | operation journal이 scan hash·승인·evidence·목적지·session 기록(rollback 매체 겸 audit anchor). git-tracked |
| drift false-positive(미완을 완료로 flip → 미해결 은폐) | 중간 | 강증거만·보수 default(미정정)·human-gate. ledger>receipt>git 우선순위 |
| 목적지 collision 데이터 손실 | 중간 | 내용동일 skip / 상이 `-legacy` 보존, git mv history 유지, overwrite 금지 |
| `.claude/plans/` vs `.claude/PRPs/plans/` 이중 소스 drift | 낮음 | 두 소스 모두 스캔, archived 목적지는 milestone-history와 일치하는 `PRPs/plans/archived/` 단일 |
| command 버전 경로 하드코딩 skew | 낮음 | `${CLAUDE_PLUGIN_ROOT}` 사용(dashboard-audit 미러), plan.md식 하드코딩 회피 |

## Acceptance
- [ ] scan.js가 workflow-orchestration을 archivable=false(M4 pending·M3 비정규)로 정확 분류
- [ ] scan.js가 **rawRowCount === complete + dropped** 등식으로 비정규 행을 fail-closed 처리(Codex F1) — 비정규 1행 + 나머지 complete PRD도 archivable=false
- [ ] apply.js가 **원자 트랜잭션**: git mv 중간 실패 주입 시 전량 rollback(부분 상태 0, Codex F2) + 활성 PRD plan 단독 이동 거부(C2) + CAS/idempotent/collision-safe
- [ ] apply.js가 operation journal(scan hash·승인·evidence·목적지·session)을 git-tracked로 기록(Codex F3 audit anchor)
- [ ] command가 human-gate(자동 적용 0) + 증거 인용 + `${CLAUDE_PLUGIN_ROOT}` 경로
- [ ] 재렌더 후 derive degraded 0, STATUS.md 회귀 0
- [ ] CLAUDE.md archived/ 관례 문서화 + version/footer/CHANGELOG 동기
- [ ] Patterns mirrored, not reinvented (stale-audit/dashboard-audit/plan-body/plans/completion-ledger 재사용)

## Design Critique

- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료.
- detector `design_signal=true` — 단, plan 본문이 `renderer/html.js`·`renderer/markdown.js`(footer 버전 동기)를 언급해 걸린 것으로 실제 rendered design surface 도입은 없음(footer 버전 문자열 = SKILL 기준 control-plane no-op).
- 4 Output Constraints 평가: 정보위계 heading depth ≤ 3(`###`까지) ✓ · 강조색 rendered surface 없음(N/A) ✓ · raw marker rendered surface 없음(N/A) ✓ · list-of-N rendered surface 없음(N/A) ✓.
- 결론: **CONVERGED (round 1)**. 재편집 불필요.

## Codex Adversarial Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) — threadId `019f431d-279e-7d90-a73f-905b8ab07389`
- 라운드 수: 1 (cap=1; ACCEPT_NOW HIGH 전부 plan 편집으로 R1 내 완전 흡수 → escalate 불필요)
- Codex verdict: `needs-attention` (No-ship) — 3 findings, 모두 실재·날카로움. C2/data-loss 표면을 정확히 타격.
- 합치 결론: 3건 전부 ACCEPT_NOW(F3은 부분)로 흡수. F1→raw-table 열거 등식, F2→원자 트랜잭션+journal, F3→journal이 audit 겸함(단 Codex-gate receipt 프레이밍은 REJECT).
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 비정규 status 행이 archivable 분모서 증발 | HIGH | ACCEPT_NOW | Task 1에 raw-table 열거 + `rawRowCount === complete + dropped` fail-closed 추가. 오분류 C2 위반 차단 |
  | F2 apply가 PRD+plans 원자 트랜잭션 아님 | HIGH | ACCEPT_NOW | Task 2에 preflight-all → journal → 실패 시 전량 rollback. 부분 상태(archived PRD+active plan) 구조적 불가 |
  | F3 파괴적 human-gate 변경에 durable 기록 없음 | MEDIUM | ACCEPT_NOW (부분) | operation journal이 audit anchor 겸함(scan hash·승인·evidence·목적지·session). 단 `mccp-*-codex` gate receipt 요구는 REJECT — 파일 이동 chore에 cross-model review는 YAGNI(D3 유지), human-gate+git+journal이 review |
- Deferred to backlog: 0
- Open Questions: 없음 (3 findings 전부 R1 흡수 — 미해소 data-loss/critical 항목 0)
- Codex session 참조: threadId `019f431d-279e-7d90-a73f-905b8ab07389`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
