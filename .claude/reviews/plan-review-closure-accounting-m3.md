# Plan Review Panel — closure-accounting-m3

**Plan**: `.claude/plans/closure-accounting-m3.plan.md` · **Plan version**: `sha256:4d712e446ae5f13c667e1136320735116604c3afd28c8785dfaeb87336cdee5e`
**Verdict**: `divergent` via `hybrid`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=true
**Layers**: L1 converged · L2 converged · L3 divergent
**Halted at**: `5.2e`

> Reason: L1+L2 converged but L3 (Codex) returned divergent

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | LOW | The plan's survey of how `accepted` is read lists three consumers and calls debt-inventory 'the minority reader'. It misses two more. `emitPanelClosures` also filters on `state === 'open'`, so a panel finding already marked accepted can never be closed as deferred. The registry's own counting treats `!== 'closed'` as open. The plan's argument that debt-inventory is the lone outlier is therefore incomplete, and the panel close path stays asymmetric after M3. | plugins/mccp/scripts/lib/plan-review/cli.js:1074 `.filter(function (f) { return f && f.state === 'open'; })`; plugins/mccp/scripts/state/findings-registry.js:628 `if (f.state !== 'closed') { counts.open += 1; ...}`; plan L54-62 lists only debt-inventory.js:218, report.js:406-411, and isPromotable |
| architect | LOW | DD5 says closure and adjudication events carry no `gate_id`. That is wrong for the panel channel, which does stamp one on its close events. The fold-based classification still works, because the fold copies `gate_id` from the opened event. Only the stated reason is partly false. | plugins/mccp/scripts/lib/plan-review/cli.js:1093-1097 finding_closed event includes `gate_id: 'mccp-plan-codex'`; plan DD5 L129-130 'the adjudication and closure events do not carry gate_id' |
| architect | LOW | `PRODUCER_CHANNELS` is identified by emitter file, while `channelOf` is identified by `gate_id` plus `perspective`. Nothing links the two, so the falsifier checks one while the report counts by the other. Also, `channelOf` separates the Plan-Codex runner from the panel only by `perspective === 'codex'`, and the panel copies its perspective string straight from reviewer results. The plan already records the narrower blind spot (a new channel inside a file that is already declared), so the risk is noted but not closed. | plugins/mccp/scripts/lib/plan-codex-runner.js:825-828 (`gate_id 'mccp-plan-codex'`, `perspective 'codex'`); plugins/mccp/scripts/lib/plan-review/cli.js:1131-1132 (same `gate_id`, `perspective: r.perspective`); plan Risks row 2 |
| security | LOW | The plan adds a new degraded entry `{name:'findings-producers', reason}` but does not say that `reason` goes through `scrubPathsFromMessage`. Every existing degraded reason in report.js does. Task 7 commits the live `report --json` output into a tracked report file. If that reason is ever built from a module-load error message, it could put an absolute path into a committed artifact. That is the same kind of leak as the earlier `cwd` precedent. Today the likely trigger is a missing export, which gives a static string, so the real risk is low. | plan Task 4: "`producers: null` + `degraded`에 `{name:'findings-producers', reason}`을 넣는다" (no scrub named); report.js:117,175,195,284,398,417 all wrap reasons in scrubPathsFromMessage; plan Task 7 writes CLI output to .claude/PRPs/reports/closure-accounting-m3-report.md |
| test | MEDIUM | Task 5 changes `closure/cli.js#formatTable` but nothing automated tests the new per-channel rows. The only check is a manual look ('채널 5행 육안 확인'). If a formatting regression dropped a row, printed `not counted` wrongly, or printed the wrong owner suffix, every Validate command would still pass. | plan L271 'Validate: ... 출력에 채널 5행이 보인다' and L310 '# 채널 5행 육안 확인'. Glob of plugins/mccp/scripts/lib/closure/tests/* finds only report.test.js, so no cli test exists. |
| test | LOW | R4's regex (`closure_type:\\s*['"](\\w+)['"]`) cannot see plan-codex-runner's closure types, because that file assigns them from a variable. R4 only passes for that channel through the map-reference union branch. If the runner stopped using the map, R4 would still pass as long as the string `CLOSURE_FROM_ADJUDICATION[` appeared anywhere in the file, even in dead code or a comment. Task 3 does not require excluding comment lines for R3, R4 or R5; it requires that only for R2. | plugins/mccp/scripts/lib/plan-codex-runner.js:892-894 `const closure = findingsRegistry.CLOSURE_FROM_ADJUDICATION[it.verdict]; ... closure_type: closure`. Plan L218 '(주석 줄 제외)' is attached to R2 only. |
| invariant | LOW | R6 전수 스캔은 주석 줄 제외를 명시하지 않는다(R2만 명시). c1-coverage-gate.js의 주석에 `appendFindings()`와 `finding_opened`가 들어 있어서, 주석을 빼지 않고 구현하면 첫 실행부터 선언되지 않은 emitter로 잡혀 red가 된다. 그러면 구현자가 면제 목록을 넓히는 쪽으로 대응할 수 있고, 그만큼 falsifier가 약해진다. | plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js:44 `appendFindings()` 와 :247 `finding_opened`는 주석이다. plan Task 3 R6에는 면제가 `findings-registry.js`뿐이고 주석 제외 문구는 R2에만 있다. |
| invariant | LOW | DD3 필터 변경은 plan이 적은 소비처(report·reseal) 말고 handoff-items.js와 derive/sources/backlog.js의 부채 목록에도 흘러간다. plan에는 이 두 곳이 적혀 있지 않다. 둘 다 게이트가 아니라 fail-open 방향의 영향은 없지만, 표면이 달라진다는 사실이 기록되지 않았다. | plugins/mccp/scripts/state/handoff-items.js:155, plugins/mccp/scripts/derive/sources/backlog.js:157이 debt-inventory를 require한다. plan Files to Change와 Risks에는 이 두 곳이 없다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | I checked every emitter location the plan cites: plan-codex-runner.js:824/858/894/896, plan-review/cli.js:1094/1104/1130/1150 and santa/seal.js:444/476/485. Each says what the plan claims. I searched every non-test file under plugins/mccp/scripts that contains a finding_* kind literal or calls appendFindings(. The only callers are the three declared emitters plus findings-registry.js, so R6's claimed list is accurate. R3 and R4 hold against the current code: the runner picks closure_type through a variable plus the CLOSURE_FROM_ADJUDICATION[ lookup, the panel writes the literal 'deferred', and santa writes the literal 'fixed'. The R5 contract holds for the runner. In the registry fold (findings-registry.js:594-609) I confirmed that gate_id and perspective are copied from the opened event, which DD5 depends on. I also confirmed that the requires in findings-registry.js give no cycle risk from the new exports, and that report.js loads the registry lazily at :380. DD3's filter change adds items only and does not change the item shape, so seal binding (UI1) is untouched. The seal timing it cites matches the claim that the accepted findings were left out at seal time. I then looked for other consumers of the open/accepted meaning and found the two the plan missed (LOW). No HIGH or CRITICAL structural defect: the single-source claim for CLOSURE_FROM_ADJUDICATION and the new declaration next to it holds against the real call sites. |
| security | pass | I tried five attacks and none held up. 1) Privilege escalation through the change to how `accepted` findings are read (DD3). Changing the filter from `=== 'open'` to `!== 'closed'` makes the debt count stricter, not looser. No input can now drop a real finding from the debt list, and the seal's item shape is unchanged. 2) Forged closures. The plan adds no producer that can write `finding_adjudicated` or `finding_closed` events (UI6). `PRODUCER_CHANNELS` is fixed data used only for reporting and gate decisions never read it. So nobody gains the power to close findings, which was the concern in the fan-out's security meta-gap. 3) Tampering and bypass. The report still exits 0 and blocks nothing (UI3). The falsifier test is openly described as catching drift, not forgery, the same threat model as c1-coverage-gate. There are no new env toggles or override paths. 4) Path handling. The emitter paths are hard-coded, repo-relative constants. The scanner only reads files under plugins/mccp/scripts. No outside input reaches `path.join`. 5) Leaks into committed files. The `producers[]` counts and channel names contain no paths or secrets. The one gap left is the unscrubbed degraded reason, reported above as LOW. |
| test | pass | Read the whole plan. Grepped every non-test emitter of `appendFindings(`, `finding_*` kind literals, `gate_id` and `perspective`. That confirms the declared emitters in R1/R2/R6 are complete: seal.js, plan-review/cli.js, plan-codex-runner.js and findings-registry.js. R3 and R5 hold for plan-codex-runner.js:892-896. The DD5 channelOf rules match the real gate_id and perspective values (santa `mccp-santa-loop`, codex `perspective:'codex'`, panel `mccp-plan-codex` with panel perspectives). Checked whether an existing test encodes the accepted-exclusion bug: no test file mentions `accepted` for debt or m10. Only report.test.js, msw-m10-producers.test.js and msw-reseal.test.js use collectFindings or buildInventory, and all three are in Validation. Confirmed that a red-first mutation is planned for the accepted fix (Task 1), for R3/R4 (Task 3) and for the open count (Task 4). R8 gives a non-vacuous positive control for R5/R6. Only closure/cli.js lacks a test. |
| invariant | pass | 1) DD3 필터 변경(`!== 'closed'`)이 게이트를 여는지 추적했다. m10-coverage-gate.js는 라이브 수집이 아니라 봉인 문서와 원장을 읽고, 판독 불가는 ok:false로 막는다(:77-98). 따라서 이 변경으로 게이트가 열리거나 닫히는 경로는 없고, 봉인 결속(UI1)과 재봉인 금지도 유지된다. reseal.js도 봉인 쪽 해시를 쓴다. 2) 새 계기(`producers`)를 확인했다. `findingsUnknown`이면 observed가 null이 되고, 모듈이 결손되면 degraded를 명시한다. 조용한 0이나 null이 없고, 리포트는 게이트가 아니다(UI3). 3) falsifier 선언이 실제 코드와 맞는지 대조했다. emitter는 비-test 파일 기준 plan-codex-runner.js:892-896, plan-review/cli.js:1096, santa/seal.js:478이고, 선언된 closure_types·adjudicated와 일치한다. 선언 밖 파일은 c1-coverage-gate.js 하나이며 주석에만 나온다(LOW). 4) 은퇴 기각 근거(KINDS 밖 kind를 malformed로 처리 → degraded)는 제거하는 방향이 아니라서 게이트를 약하게 만들지 않는다. 5) 롤백 경로를 봤다. 추가형 변경과 필터 한 줄이라 revert하면 이전 동작으로 돌아가고, mutation 실측이 Task 1·3·4에 박혀 있다. HIGH 이상의 결함은 찾지 못했다. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "hybrid",
  "layers": {
    "l1": "converged",
    "l2": "converged",
    "l3": "divergent"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": true
  },
  "wall_clock_ms": 317535,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:4d712e446ae5f13c667e1136320735116604c3afd28c8785dfaeb87336cdee5e",
  "plan_path": ".claude/plans/closure-accounting-m3.plan.md",
  "recorded_at": "2026-09-14T02:45:34.960Z"
}
```
