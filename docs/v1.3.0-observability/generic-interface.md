# v1.3.0 Generic Interface Contract

> v1.3.0 Milestone 6 — Generic Interface Validation.
> "어떤 source는 optional, 어떤 fallback이 보장되는가."
> Companion: [`schema-surface.md`](./schema-surface.md), [`dashboard-surface.md`](./dashboard-surface.md), [`snapshot-schema.md`](./snapshot-schema.md).

## 0. Why this document exists

v1.3.0의 derive engine + STATUS.md/HTML renderer + daily snapshot + refresh trigger는 **mccp repo 자체 dogfood**에서만 검증된 채 M0~M5에서 ship됐다. M6는 새 기능을 추가하지 않고 (1) mccp 외 repo에서 graceful한지 4 fixture로 audit하고, (2) "어떤 source가 optional이며 어떤 fallback이 보장되는가" contract을 본문화한다. 이 문서는 mccp가 외부 repo에 installed되었을 때 reference impl이 어떻게 동작하는지를 명시한다.

검증 evidence: [`plugins/mccp/scripts/derive/tests/generic-interface.test.js`](../../plugins/mccp/scripts/derive/tests/generic-interface.test.js) (4 fixture) + [`plugins/mccp/scripts/lib/snapshot/tests/snapshot-generic.test.js`](../../plugins/mccp/scripts/lib/snapshot/tests/snapshot-generic.test.js) + [`plugins/mccp/scripts/lib/renderer/tests/renderer-generic.test.js`](../../plugins/mccp/scripts/lib/renderer/tests/renderer-generic.test.js) + [`.claude/plans/notes/v1-3-0-m6-audit.md`](../../.claude/plans/notes/v1-3-0-m6-audit.md) (5 axis evidence matrix).

## 1. Optional sources

`.claude/` 자체 또는 7 sources 각각이 없을 때 derive 동작.

| Condition | derive behavior | Source code |
|---|---|---|
| `<repo>/.claude/` 디렉토리 미존재 | `model.sources` 모두 zeroed defaults(`emptyModel()` 초기화 값). `opts.strict=true`일 때만 1건의 `severity: low / source: derive / message: 'no .claude/ directory at <path>'` warning. default mode는 silent. m0_capability probe는 그래도 수행. | [`derive/index.js:46-67`](../../plugins/mccp/scripts/derive/index.js) |
| `.claude/plans/` 비어있거나 미존재 | `sources.plans.count=0, items=[], degraded=false`. plans는 `.claude/PRPs/plans/` legacy 경로도 동시 스캔. | [`derive/sources/plans.js`](../../plugins/mccp/scripts/derive/sources/plans.js) |
| `.claude/receipts/` 비어있거나 미존재 | `sources.receipts.count=0, items=[]`. read-side는 `gate_id` prefix 검사 안 함 — free-form string 모두 허용. | [`derive/sources/receipts.js`](../../plugins/mccp/scripts/derive/sources/receipts.js) |
| `.claude/state/STATE.md` 미존재 | `sources.state.item=null, degraded=false`. | [`derive/sources/state.js:22-24`](../../plugins/mccp/scripts/derive/sources/state.js) |
| `.claude/plans/codex-findings-backlog.md` 미존재 | `sources.backlog.count=0, items=[]`. | [`derive/sources/backlog.js`](../../plugins/mccp/scripts/derive/sources/backlog.js) |
| `.claude/state/fix-task.md` 미존재 | `sources.fix_task.item=null`. | [`derive/sources/fix-task.js`](../../plugins/mccp/scripts/derive/sources/fix-task.js) |
| `.claude/state/dispatches/` 미존재 | `sources.envelopes.count=0, items=[], degraded=false`. | [`derive/sources/envelopes.js:36-37`](../../plugins/mccp/scripts/derive/sources/envelopes.js) |
| `.claude/cache/.last-render.json` 미존재 | `model.last_render_meta=null` (정상 — first render 이전). | [`derive/index.js:99-110`](../../plugins/mccp/scripts/derive/index.js) |
| `.claude/cache/snapshots/` 미존재 | `writeSnapshotIfNeeded` 가 directory를 생성하거나 short-circuit. snapshot read path는 directory 미존재 시 빈 array. | [`lib/snapshot/index.js`](../../plugins/mccp/scripts/lib/snapshot/index.js) |

**Loud fail-open invariant** ([[feedback-loud-fail-open]] 참조) — 모든 sources는 throw 금지. 예외는 outer try/catch가 absorb하고 `pushWarning(model, 'medium', source, ...)` 으로 surface하며, `source.ok=false` + `source.error=err.message` 표기. derive 자체는 사용자 host 어떤 상태에서도 호출 가능.

## 2. mccp-extension fields (외부 repo에서 null)

receipt schema는 v0.2.x+ 누적으로 mccp 자체 워크플로우 (Codex dual review, controller dispatch, briefing stamp 등)를 위한 meta field 13종을 갖는다. 외부 repo의 receipt가 이 field 없이 작성되어도 derive + snapshot + renderer 모두 정상 동작한다.

### 2.1 5 카테고리

| 카테고리 | Fields | derive 산출(외부 receipt) | snapshot 산출 | renderer 표시 |
|---|---|---|---|---|
| **Briefing stamp** (v1.3.0-m2) | `briefing_summary`, `briefing_token_count`, `briefing_invocation_count` | `pick()` 으로 `undefined` | projection이 `null` 로 정규화 | audit-timeline에서 briefing blockquote 미생성 (raw row만 표시) |
| **Codex audit** (v0.2.4+) | `codex_dedupe_at_pr`, `codex_skipped_at_pr`, `codex_skip_reason`, `codex_disabled_at_pr`, `codex_review_actionable_findings`, `codex_disabled` | `pick()` 으로 `undefined` | `null` / `false` (boolean field는 falsy default) | impact 없음 (mccp 본문 표시 영역) |
| **Design scope** (v0.3.6) | `codex_design_scope_excluded`, `design_findings_dropped`, `a11y_routed_to_impeccable`, `dropped_findings_digest` | `pick()` 으로 `undefined` | projection 없음 (snapshot에 없음) | impact 없음 |
| **Controller IPC** (v1.2.0-m1) | `dispatched_by_controller_session_id`, `worker_dispatch_id`, `ipc_envelope_path`, `controller_context_marker_present` | `pick()` 으로 `undefined` | projection이 `null` 로 정규화 | worker-fanout section은 envelope 없으면 hide |
| **Misc** | `deferred_findings_count`, `plan_conflict_escalated`, `pr_phase_lock_stale_reclaimed_at_hook` | `pick()` 으로 `undefined` | projection 없음 | impact 없음 |

근거 — [`derive/sources/receipts.js:6-8`](../../plugins/mccp/scripts/derive/sources/receipts.js):
```js
function pick(m, k) {
  return (m && Object.prototype.hasOwnProperty.call(m, k)) ? m[k] : undefined;
}
```
`pick()` 은 absence와 explicit-null/false를 구분한다. snapshot projection ([`lib/snapshot/index.js:122-142`](../../plugins/mccp/scripts/lib/snapshot/index.js))은 absence를 `null` 로 정규화하여 outlive-session contract를 충족.

### 2.2 예시 (Fixture C 시뮬레이션)

외부 repo가 다음 receipt를 작성한 경우:

```json
{
  "schema_version": "v1",
  "gate_id": "foo-gate",
  "decision_id": "decision-1",
  "meta": { "created_at": "2026-06-19T00:00:00Z", "command": "/external-tool" }
}
```

snapshot payload:

```json
{
  "receipts": [
    {
      "gate_id": "foo-gate",
      "decision_id": "decision-1",
      "created_at": "2026-06-19T00:00:00Z",
      "converged": false,
      "receipt_hash": null,
      "briefing_summary": null,
      "briefing_token_count": null,
      "briefing_invocation_count": null,
      "codex_skipped_at_pr": false,
      "codex_skip_reason": null,
      "codex_dedupe_at_pr": false,
      "ipc_envelope_path": null,
      "dispatched_by_controller_session_id": null,
      "worker_dispatch_id": null
    }
  ]
}
```

STATUS.md audit-timeline에는 다음 row 1줄로 표시 (briefing blockquote 없음 — `briefing_summary === null`):

```
- 2시간 전 · `foo-gate`/`decision-1` · ◐ 진행
```

## 3. Non-mccp gate names

receipts의 `gate_id` 가 임의 string일 때 derive + render 동작.

| Component | Behavior on free-form gate_id | Source |
|---|---|---|
| derive | `scanReceipts` 는 `gate_id` prefix 검사 안 함 — directory traversal + JSON parse만. 외부 자동화가 만든 `.claude/receipts/<any-name>/<any-slug>.json` 모두 수집. | [`derive/sources/receipts.js`](../../plugins/mccp/scripts/derive/sources/receipts.js) |
| audit-timeline | `r.gate_id \|\| r.gate \|\| '(unknown-gate)'` 으로 raw label fallback. mccp-* prefix는 시각적으로 강조되지 않음 — 모든 gate가 동일 톤. | [`renderer/sections/audit-timeline.js:124`](../../plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js) |
| status-grid | gate_id 자체는 표시하지 않음. converged 여부만 집계. `decisionsWithLaterConverged` set은 free-form gate에도 정상 동작. | [`renderer/sections/status-grid.js:18-26`](../../plugins/mccp/scripts/lib/renderer/sections/status-grid.js) |
| verdict | gate_id 기반 step 없음. m0_capability → mask_hits → critical warnings → degraded sources → state → fix-task → envelopes → backlog → plans → default 의 priority chain만 사용. | [`renderer/verdict.js`](../../plugins/mccp/scripts/lib/renderer/verdict.js) |
| snapshot writer | `projectReceipt(r)` 는 `r.gate \|\| r.gate_id \|\| null` 으로 raw 보존. 30-day retention/eviction은 filename(`YYYY-MM-DD.json`) 만 보고, gate_id와 무관. | [`lib/snapshot/index.js:122-142`](../../plugins/mccp/scripts/lib/snapshot/index.js) |

**STATE.md `valid_events`** 도 generic이다 — state-writer는 enum strict 검증 안 하고 read-only mode에서는 어떤 event 값도 통과한다. derive `sources/state.js` 는 frontmatter object를 그대로 반환.

## 4. What is NOT generic

mccp가 의도적으로 가정하는 contract — 외부 repo가 이 contract을 위반하면 derive는 graceful degrade 하지만 의미 있는 데이터는 surface 못한다.

### 4.1 Source path shape (mccp 표준 layout)

derive는 `.claude/{plans,receipts,state,state/dispatches,plans/codex-findings-backlog.md,state/fix-task.md,state/STATE.md,cache/.last-render.json,cache/snapshots/}` 의 mccp 표준 layout을 가정한다. 외부 repo가 동일 layout을 채우면 derive가 의미 있게 동작 (Fixture B/C 가 검증). 외부 repo가 다른 layout(예: `.claude/my-tool/receipts/`)을 사용하면 derive는 그 경로를 못 본다.

### 4.2 STATE.md schema ownership

`STATE.md` 는 **mccp가 자체 작성하는 단일-writer 파일**이다 ([`state/state-writer.js`](../../plugins/mccp/scripts/state/state-writer.js)). 외부 자동화가 `STATE.md` 를 직접 만들면 state-writer가 `state_version !== 1` 을 감지해 reset → `parseStateMd` 가 `null` 반환 → derive `sources/state.js` 는 emptyState로 surface. 이는 **graceful (no throw, no degraded)** 이지만 외부 STATE는 그대로 소비되지 않는다. 외부 도구가 STATE.md를 같이 사용하려면 mccp의 `state-writer.update()` API를 거치는 게 contract.

### 4.3 Degraded surface는 contract의 일부 (F3 absorption)

malformed JSON receipt / `additionalProperties:false` 위반 envelope / unsupported STATE frontmatter / symlink receipt 등의 경우, **derive는 throw하지 않고 다음 신호를 surface**한다 (Fixture D 가 검증):

- `sources.<name>.degraded = true`
- `sources.<name>.invalid_count >= 1`
- `model.warnings` 에 `severity: medium / source: <name>` entry 1건
- renderer verdict 는 `tone: amber, icon: ⏱, text: '<source> 소스 손상'` 으로 surface
- symlink dereference 없음 (양축 보장):
  - envelope file이 symlink → `isPlainFile` guard로 enumerate에서 skip ([`derive/sources/envelopes.js:14-19, 50`](../../plugins/mccp/scripts/derive/sources/envelopes.js))
  - receipt file이 symlink → `readReceipt` 가 `UNSAFE_RECEIPT_FILE` throw → `extract()` catch가 `ok:false` item으로 surface → `invalid_count++` + `degraded:true` ([`receipt/store.js#readReceipt`](../../plugins/mccp/scripts/receipt/store.js), [`derive/sources/receipts.js#extract`](../../plugins/mccp/scripts/derive/sources/receipts.js))
  - receipt gate dir 자체가 symlink → `isSafeGateDir` guard로 enumerate 거부 ([`receipt/store.js#isSafeGateDir`](../../plugins/mccp/scripts/receipt/store.js)). 외부 path content는 어느 경로로도 model에 surface되지 않음

즉 "degraded surface는 contract violation이 아니라 contract의 일부 (graceful 시그널)"이다. 외부 repo가 손상된 `.claude/` 상태를 가져도 mccp는 throw하지 않고 사용자에게 amber verdict로 알린다.

### 4.4 Parseability minimum (only)

mccp가 외부 repo에 강제하는 minimum:
- receipt file은 UTF-8 readable JSON
- STATE.md는 UTF-8 readable text (frontmatter parse 실패는 reset, throw 아님)
- envelope file은 `<dispatch_id>.envelope.json` 명명에 UTF-8 readable JSON

이를 위반하면 해당 file은 `degraded` 로 표시되지만 (위 §4.3) 다른 sources는 영향 없다. throw는 절대 없음.

## 5. Reference impl invariant

이 4 fixture(A/B/C/D) + 3 unit test 파일은 mccp가 v1.4.x 이후 외부 repo install에서 회귀 없이 graceful한지를 검증하는 reference impl gate다. 새 source 추가 / receipts.js meta field 추가 / renderer section 변경 시 4 fixture 모두 통과를 유지해야 한다. 외부 repo dogfood 첫 install에서 fixture가 cover 못한 hardcoded 가정이 발견되면, 그것은 v1.6.x 이상 patch axis로 즉시 절차화 권장.

## 6. Cross-references

- [`schema-surface.md`](./schema-surface.md) — receipt/envelope/STATE frontmatter의 read-side schema baseline.
- [`dashboard-surface.md`](./dashboard-surface.md) — STATUS.md + HTML renderer의 dashboard contract.
- [`snapshot-schema.md`](./snapshot-schema.md) — daily snapshot payload schema.
- [`state-md-naming-reconciliation.md`](./state-md-naming-reconciliation.md) — PRD ↔ code identifier 매핑.
- [`.claude/plans/notes/v1-3-0-m6-audit.md`](../../.claude/plans/notes/v1-3-0-m6-audit.md) — M6 audit evidence matrix (5 axis).
