---
description: 완료된 PRD(전 milestone complete/dropped)와 그 plan을 archived/로 이동하고 drift status를 정정한다 (human-gate, 재실행 가능). 완료 PRD/plan 아카이브 chore.
argument-hint: ""
---

# /mccp:archive-complete

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

활성 PRD(`.claude/prds/`) 중 **Delivery Milestones 전 행이 complete 또는 dropped** 인 것과 그 PRD 를 가리키는 plan 을 `archived/` 로 이동한다. 부수적으로, 실제로 shipped 됐는데 표에 pending/in-progress 로 남은 milestone 을 증거 인용해 status 정정한다. 평가(추론)는 이 명령(agent)에만 있고, archive 여부는 결정적 스캐너(`scan.js`)가 판정, 실제 이동은 원자 트랜잭션(`apply.js`)이 수행한다 — dashboard-audit 의 레이어 분리(agent 평가 ↔ 결정적 scan/apply)를 그대로 미러하되, 비파괴 마커 대신 **파일 이동 + status flip** 을 한다.

**핵심 불변식**:
- **human-gate**: 파일 이동 + 소스 편집이므로 제안 → 사용자 승인 → 적용. 자동 적용 안 함.
- **C2 (정확성 기준)**: 완료 plan archive 는 **PRD 전체가 완료(전 행 complete/dropped)일 때만**. 미완료 PRD 의 plan 을 옮기면 어느 스캔에도 안 잡혀 PRD 가 소실된다. `apply.js` 가 archivable 을 재검증하고 PRD + 그 모든 활성 plan 을 하나의 원자 단위로만 이동한다(단독 이동 거부).
- **증거 인용 필수**: status 정정(pending/in-progress → complete)은 근거(ledger/receipt/commit) 인용 필수. 불확실하면 **live 보수 default**(정정 안 함).
- **원자·rollback**: preflight-all → journal → 실패 시 전량 rollback. archived PRD + active plan 이 남는 부분 상태 0.
- **재실행 가능**: idempotent. 이미 아카이브된 항목은 skip.

## Phase 0 — SCAN (결정적 스크립트)

```bash
GITDIR=$(git rev-parse --git-dir); mkdir -p "$GITDIR/mccp/tmp"
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/archive-complete/scan.js" --json > "$GITDIR/mccp/tmp/archive-scan.json"
cat "$GITDIR/mccp/tmp/archive-scan.json"
```

산출 `{ prds:[{path,name,milestones,plans,archivable,reason,counts}], scanned, degraded, warnings }`. 각 milestone: `{name, status, driftSuspect, evidence}`.

`archivable:true` 인 PRD 도, `driftSuspect:true` 인 milestone 도 없으면 안내 후 STOP("아카이브/정정할 항목 없음"). `degraded:true` 면 `warnings` 를 사용자에게 보고(스캔이 일부 소스를 못 읽음).

## Phase 1 — EVALUATE (agent, 증거 인용)

두 종류의 후보를 **현재 코드/문서 구조와 대조**해 판정한다. **추론은 여기에만** 존재한다.

**(a) status drift 정정 후보** — `driftSuspect:true` 인 pending/in-progress milestone:

| Verdict | 의미 | 판정 조건(증거 필수) |
|---|---|---|
| `keep` | 정정 안 함 | 기본값. shipped 근거가 불충분하면 무조건 keep. |
| `correct→complete` | 완료로 정정 | plan 이 실제 ship(완료 ledger/`mccp-pr-codex` receipt/merge commit)됐음 — **인용**. |
| `correct→dropped` | 폐기로 정정 | milestone 이 폐기 결정됐음 — **인용**. |

`scan.js` 의 `evidence`(ledger/receipt/git)를 1차 근거로, Grep/Read 로 2차 확인(plan 완료 report·CHANGELOG·merge). **불확실 → keep**. 거짓 정정(미해결을 완료로 숨김)이 거짓 유지보다 훨씬 해롭다.

**(b) archive 후보** — `archivable:true` PRD (또는 (a) 정정 후 전 행 complete/dropped 이 되는 PRD):

- 그 PRD 와 `plans` 목록(scan 이 산출한 source_prd 매칭 plan 전부)을 하나의 이동 단위로 본다. **plan 을 임의로 빼지 말 것**(C2 — apply 가 거부).
- 정정 후에야 archivable 이 되는 PRD 는 (a) 정정과 (b) archive 를 **같은 승인**으로 묶는다.

## Phase 2 — PROPOSE + HUMAN-GATE

판정 결과를 두 제안 테이블로 제시한다:

```
## 제안 A — status 정정 (N건)

| # | PRD | milestone | 현재 | → | 근거(evidence) |
|---|-----|-----------|------|---|----------------|
| 1 | workflow-orchestration.prd.md | M4 병렬 활성화 | pending | complete | ledger: decision=… verdict=converged |

## 제안 B — archive 이동 (M건)

| # | PRD | 함께 이동할 plan | 사유 |
|---|-----|------------------|------|
| 1 | foo.prd.md | foo-m1.plan.md, foo-m2.plan.md | 전 3 milestone complete |
```

그 후 사용자에게 **명시 승인**을 요청한다(자동 적용 금지). 사용자는 전체 승인 / 일부 선택(번호) / 거부 중 택. 승인된 항목만 Phase 3 로.

> 승인 없이 Phase 3 진입 금지. 일부만 승인하면 그 부분집합만 apply. archive 승인 시 그 PRD 의 **모든** plan 이 함께 가는지 재확인(C2).

## Phase 3 — APPLY (결정적 스크립트, 원자 트랜잭션)

승인분을 `{statusCorrections, archives}` JSON 으로 직렬화해 원자 applier 에 전달한다(평가 결과를 코드가 다시 추론하지 않음):

```bash
GITDIR=$(git rev-parse --git-dir); mkdir -p "$GITDIR/mccp/tmp"
OPS_FILE="$GITDIR/mccp/tmp/archive-approved.json"
SCAN_HASH=$(node -e 'const c=require("crypto");process.stdout.write(c.createHash("sha256").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' "$GITDIR/mccp/tmp/archive-scan.json")
# 승인된 항목을 아래 형태로 기록:
#   statusCorrections: [{prdPath, milestoneName, newStatus(complete|dropped), reason, evidence}]
#   archives:          [{prdPath, planPaths:[repo-root-relative plan paths ...]}]
# prdPath/planPaths 는 repo-root 상대 경로. reason 은 Phase 1 근거 한 문장.
cat > "$OPS_FILE" <<'JSON'
{ "statusCorrections": [ ... ], "archives": [ ... ] }
JSON
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/archive-complete/apply.js" --ops-file "$OPS_FILE" --scan-hash "$SCAN_HASH" --json
```

applier 보증: **preflight-all**(하나라도 실패면 mutation 0 abort) → **operation journal**(`.claude/state/archive-journal/<id>.json`, git-tracked audit anchor) → 순차 적용(status flip content-hash CAS + git mv PRD/plan) → **적용 중 어떤 실패든 전량 rollback**(reverse git mv + status 셀 원복). collision: 내용 동일 → skip(idempotent), 상이 → `<name>.legacy.md` 보존(데이터 손실 0). C2: archivable=false PRD 이동 거부 + PRD 의 활성 plan 누락 시 거부.

결과 `{ moved, corrected, skipped, aborted, rolledBack, errors, journalPath }` 확인 — `aborted:true` 면 `errors` 를 사용자에게 보고(부분 상태 없음이 보장되니 원인 수정 후 재실행). `skipped`(already-archived/skip-duplicate)도 정직히 보고.

## Phase 4 — RENDER + VERIFY

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/derive/cli.js" render
node "${CLAUDE_PLUGIN_ROOT}/scripts/derive/cli.js" run --json | node -e 'const m=JSON.parse(require("fs").readFileSync(0));const d=Object.entries(m.sources||{}).filter(([,s])=>s&&s.degraded);process.stdout.write("degraded sources: "+JSON.stringify(d.map(([k])=>k))+"\n")'
```

`.claude/cache/STATUS.md` + `status.html` 재생성. archived PRD/plan 은 활성 표면에서 사라지고(비재귀 스캔), 완료 이력은 `milestone-history` 가 `.claude/prds/archived/` 를 직접 스캔해 타임라인에 유지한다. **모든 derive source 의 `degraded===false` 를 확인** — 하나라도 degraded 면 이동으로 참조가 깨진 것이니 사용자에게 보고. STATUS.md 크기 델타(이동 전후)도 함께 보고.

## Phase 5 — OUTPUT + version advisory

```
## Archive Complete 완료

- 스캔: {scanned} PRD (archivable {A} · drift-suspect milestone {D})
- 승인·적용: 이동 {moved}건 · status 정정 {corrected}건 · skip {skipped} · abort {aborted}
- journal: {journalPath}
- 렌더: .claude/cache/status.html 갱신 — degraded source {degradedCount}

### Next
- status.html 육안 확인(브라우저). 되돌리려면 `git mv` 역방향 + journal 참조.
- 재실행 가능(idempotent) — 새 완료 PRD 생기면 다시 실행.
```

**version advisory (§3.7)**: 이 명령은 파일만 이동한다 — plugin.json version 을 자동 bump 하지 않는다. milestone ship 과 함께 아카이브하는 흐름이면 `plugins/mccp/.claude-plugin/plugin.json` version + footer(`html.js`/`markdown.js`) + CHANGELOG 동기가 별도로 필요하다는 것만 안내(auto-edit 안 함).

## Out of scope

- 자동 적용(human-gate 필수).
- 미완료 PRD 의 plan 이동(C2 — PRD 전체 완료 시에만).
- `mccp-*-codex` 게이트 receipt 발행(파일 이동 chore 에 cross-model review 는 YAGNI — human-gate + git history + operation journal 이 review).
- plugin.json version bump(§3.7 은 별도 축 — advisory 안내만).

## See also

- `/mccp:dashboard-audit` — 비파괴 해결 마커로 stale 위험/질문/마일스톤 은퇴(파일 이동 아님).
- `/mccp:milestone-close` — milestone 종료 acceptance 를 receipt chain 에 anchor.
- CLAUDE.md §3 `archived/` 아카이브 관례(C1~C4 불변식).
