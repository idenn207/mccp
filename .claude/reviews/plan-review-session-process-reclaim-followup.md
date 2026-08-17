# Plan Review Panel — session-process-reclaim-followup

**Plan**: `.claude/plans/session-process-reclaim-followup.plan.md` · **Plan version**: `sha256:2e33d2e1e0f9730f34ec1a0f4ba4f38d4c7f01ccc205d07447267d6522e4ac4c`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 8 blocking finding(s): architect/FAIL, security/HIGH, security/FAIL, test/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | Task 11's structure violates the plan's own documented pattern (Action→Mirror→Validate) by introducing an unlabeled Action block followed by a separately-listed Action 3, creating ambiguity about whether Action 3 is a mandatory execution step or only a validation criterion | Line 256: `- **Action**: Task 1~10이 끝난 뒤...` (unlabeled, contains only version gate). Line 299: `- **Action 3 — anchor 기입...` (peer-level to Mirror/Validate, not as sub-item). Line 309: Action 3 referenced only in Validate section, not in Action description. Task 4 line 165 explicitly depends on '§Task 11 Action 3' which is structurally mislabeled. |
| security | HIGH | Task 4 ANCHOR-PENDING mechanism prevents dangling git-tracked references to non-existent receipts, but lacks code-level enforcement | Task 4 Action (ii) at line 163 prescribes use of ANCHOR-PENDING placeholder format, but fix-task.js:302-306 shows originating_receipts list entries are only filtered for string type—no validation that referenced paths exist as files. Validation 10 at line 615-616 is conditional and only runs if developer executes it manually; no code gate prevents writing actual receipt paths before receipt exists. |
| security | MEDIUM | Plan Task 11 Action 3 claims to replace placeholders only after receipt is created, but provides no verification that receipt write succeeded before updating tracked files | Line 299-300 says Task 11 Action 3 performs path substitution '출하 게이트를 완주해 receipt를 실제로 생성하면'. However, the actual procedure (lines 299-300) does not show verification that the receipt file is non-empty, validly formatted, or that its hash matches expectations. If receipt write partially fails, the substitution could leave a dangling reference. |
| security | MEDIUM | Task 4 validation enforcement is optional/manual, not integrated into automated gates, allowing bypass | Task 4 Validate section at line 168-171 documents multiple shell assertions (grep patterns, count checks). These are embedded in plan prose, not in `/mccp:pr` command hooks or validate-cmd gates. A developer can commit files without running these commands, bypassing the protection. Line 256 acknowledges 'Validate는 *사후* 판정' (post hoc judgment). |
| test | HIGH | Task 12에서 생성되는 smoke test 스크립트는 `pidAlive(pid) === false`를 실제로 단언할 것이다 | plan.md Task 12 line 333: '**`pidAlive(pid) === false`를 실제로 단언한다**'. 그러나: (1) session-processes.js의 module.exports (L1425-1464)에 `pidAlive`가 없다. (2) pidAlive()는 dashboard-server.js:99에 정의되어 있지만 session-processes.js에서 export되지 않는다. (3) 어느 파일에서 smoke test가 pidAlive()를 import할지 명시되지 않았다. (4) Validation 9 (L551)은 자체 inline 로직으로 process.kill(o.pid,0)을 사용하며, 스크립트가 실제로 pidAlive를 호출했는지 검증하지 않는다. 결론: 이 주장이 거짓임을 감지할 테스트가 없다 - 스크립트가 pidAlive를 호출하지 않고도 Validation 9를 통과할 수 있다. |
| test | MEDIUM | Task 9에서 추가하는 10개 backlog 항목의 정확한 keyword 일치 검증이 작동한다 | plan.md Task 9 L237: '위 산문 서술만 보고 행을 쓰면 뜻이 같아도 문자열이 어긋나 실재하는 등재가 누락으로 보고된다' — Validation 7 (L492-498)이 고정 문자열 10개를 grep -c로 찾는다. 그러나 이 Validate는 단지 keyword 존재 여부만 검증하고, 주어진 10개 keyword가 실제로 plan에서 명시한 것인지 검증하지 않는다. 예를 들어 L237에서 요구하는 'record 슬러그 충돌'이라는 정확한 문구가 plan Task 9 L212-213에는 '같은 PRD의 두 번째 plan이 첫 번째의 git-tracked 기록을 덮어씀'으로 쓰여있다. 만약 implementer가 의도대로 'record 슬러그 충돌' 문자열을 정확히 포함하지 않으면 Validation 7이 실패할 것이지만, 현재 Validation은 plan 문서의 의도된 keyword와 실제 keyword를 대조하지 않는다. |
| test | MEDIUM | Validation 9에서 `plugins/mccp/scripts/lib/tests/manual/session-process-reclaim-smoke.js` 파일이 존재하여 실행될 것이다 | plan.md Validation 9 L537: SMOKE_OUT=$(node plugins/mccp/scripts/lib/tests/manual/session-process-reclaim-smoke.js). 그런데: (1) 현재 이 파일은 존재하지 않는다 (Glob 결과 없음). (2) Task 12 (L327)에서 이 파일이 CREATE되어야 한다. (3) Task 1~11이 모두 실행된 후에만 Validation이 돌기 때문에 기술적으로는 가능하지만, 실행 순서를 보장하는 mechanism이 plan에 명시되지 않았다. (4) 만약 Task 12가 건너뛰어지거나 파일 생성에 실패하면 Validation 9는 즉시 실패한다 - 이는 테스트가 아니라 사전 조건이다. |
| test | MEDIUM | plan.md의 'Files to Change' 표(L74-92)에 Task별 파일 변경이 정확히 매핑되어 있다 | plan.md L82: `.claude/state/STATE.md \| UPDATE \| A5·A6 — **Task 3**: santa-loop 완주 반영 + 버전 서술 정정 · **Task 4**: 소실된 receipt 참조 정정 · **Task 9**: `escalate_pending` 해제. 셋 다 `state-writer.js` API 경유. **한 파일을 세 Task가 나눠 고치므로 여기 적어 둔다**'. 그런데 실제로: Task 3 (L149)은 santa-loop 반영 + 버전만 하고 escalate_pending은 건드리지 않는다고 명시. Task 4 (L159)는 소실 아티팩트 참조 정정만. Task 9 (L219)에서야 escalate_pending을 해제한다. 따라서 Files to Change 표의 설명이 불명확하다 - 세 Task가 '나눠' 고치는 것이 맞는지, 아니면 Task 9만 고치는 것이 맞는지 검증할 test가 없다. STATE.md의 최종 상태는 test할 수 있지만, 각 Task별로 어느 부분을 건드렸는지는 git diff로 추적하기 어렵다. |
| test | LOW | Task 5에서 plan 문서의 Task 2 케이스 7 라벨이 실제 test 코드(session-processes-reclaimable.test.js:425)와 일치하는지 검증된다 | plan.md Task 5 Validate L177: grep -n 'identity 7' plugins/mccp/scripts/lib/tests/session-processes-reclaimable.test.js 이 `:425`를 가리키는지 확인. 현재 session-processes-reclaimable.test.js 라인 425는 'test('identity 7 — MCCP_RECLAIM_IDENTITY_TOLERANCE_MS moves UP only'을 포함한다. 그러나 Validate는 단지 'identity 7'이 존재하는지만 grep하고, plan의 새로 추가될 라벨과 test 이름이 일치하는지는 검증하지 않는다. plan.md Task 5 Action (L173-176)에 추가될 라벨 세부사항이 명시되지 않았기 때문에, 어떤 라벨을 추가해야 하는지 알 수 없다. |
| invariant | CRITICAL | Task 11 Action shows version gate preconditions but omits the actual ship execution commands (`/mccp:prp-commit` and `/mccp:pr`), creating a halt-without-success-path gate | Plan line 254 title: '출하 실행' (ship execution). Line 256: 'Task 1~10이 끝난 뒤 `/mccp:prp-commit` → `/mccp:pr`로 실제 출하한다' (after Tasks 1-10, actually ship via these commands). Action block (lines 258-296) contains only the version gate bash code—reading versions, validating semver, fetching origin/main, comparing, and writing `version-gate.txt`—but **no bash line invoking `/mccp:prp-commit` or `/mccp:pr`**. The gate can halt (line 284 `exit 1` on version conflict), but the plan text claims action will execute ship yet shows only preconditions, not the action taken when preconditions pass. |
| invariant | HIGH | Task 1 base-inventory capture lacks atomic transaction integrity—stale prior-run file could pass validation and mask merge errors | Lines 100-104 show git command to capture pre-merge inventory. Validation 4 (line 393) checks `test -s '$MCCP_TMP/base-inventory.txt'` but does NOT verify the file is **fresh for this run**. If prior session crashed mid-Task-1 leaving `base-inventory.txt` present, this run skips the capture but Validation 4 passes because the file exists. The stale inventory is then used at line 398 `comm -23` against current HEAD, potentially missing files added to main since the prior attempt. Plan text (line 119) says 'precapture ∧ post-check' is the invariant, but the guard does not enforce freshness. |
| invariant | MEDIUM | Task 4 Validation 10 checks for receipt-loss annotation anywhere in file, not anchored to the specific git-tracked reference at line 12 of fix-task-applied.md, making the validation vacuous for receipt anchoring | Task 4 lines 161-162 acknowledge YAML frontmatter values cannot have inline comments without corruption. Proposed solution: place comment in body below frontmatter. Validation 10 line 603-604: `grep -c 'originating_receipts는 working-tree only · 소실됨'` searches the entire file for this string. The check is **location-agnostic**—the string could appear on any line and validation passes. Since the YAML list value is at line 12 and the body comment is "바로 아래", the comment could drift hundreds of lines away and still pass this validation. Per §3.12 receipt anchoring contract, a receipt reference must be bound to evidence of its disposition; this validation does not enforce that binding. |
| invariant | MEDIUM | Validation 9 smoke test uses POSIX-specific error code (EPERM) to detect process liveness on Windows, contradicting plan's OUT OF SCOPE section that prioritizes Windows 11 behavior | Plan line 53 Out of Scope: 'Windows/POSIX 프로세스 그룹 통일' is out of scope; prioritize '이 환경(Windows 11)에서 동작'. Validation 9 line 551: `alive=(e.code==="EPERM")` uses POSIX convention where EPERM means process exists but permission denied. Windows `process.kill(pid, 0)` does not throw EPERM for non-existent processes the same way. The validation can produce false positives (reporting alive when dead) or false negatives (reporting dead when alive) on Windows. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | Examined the plan's Task structure pattern across all 12 tasks to verify Action→Mirror→Validate consistency; cross-checked Task 4's dependency claim that 'Task 11 owns path entry via §Task 11 Action 3'; verified that Task 11's Validate (line 317-324) actually checks for Action 3 completion; confirmed Action 3 is introduced at line 299 with dash-bullet-bold formatting identical to Mirror/Validate sections rather than nested under Action; found no other tasks with this bifurcated Action structure; verified that this creates a load-bearing boundary leak (Task 4→Task 11 forward reference through unclear structural contract)." |
| security | fail | Attacked: (1) Whether code in receipt/write.js, fix-task.js, or schema.js validates receipt path references—found no path existence checks in frontmatter handling. (2) Whether ANCHOR-PENDING placeholder usage is enforced by parse rules or state-writer API—found it's only documented in plan prose, not implemented as a code constraint. (3) Whether Task 11 Action 3 verifies receipt before writing paths—found procedure assumes receipt exists without confirmation checks. (4) Whether Validation 10 is hooked into PR gates or required checkpoints—found it's manual/optional in plan Acceptance checklist. (5) Whether evidence-audit.js detects these gaps—found it reports pre-existing 'dangling ledger entries' but is read-only audit tool, not preventive gate. Could not find code mechanism that blocks writing actual receipt paths to git-tracked files before receipt exists and prevents developers from bypassing Task 4 validation steps. |
| test | fail | 1. **pidAlive() 함수 availability**: dashboard-server.js(L99)에 정의, session-processes.js exports에 미포함. smoke test 호출 방식 unspecified. ✓ 발견 2. **Task 9 keyword 정확성**: Validation 7은 10개 keyword substring grep만 수행, plan의 명시된 keyword 목록과 매칭 검증 없음. ✓ 발견 3. **Validation 9 file path dependency**: manual/session-process-reclaim-smoke.js는 Task 12에서 CREATE, Validation block이 실행 전 존재 보장 없음. ✓ 발견 4. **Files to Change 표 정확성**: STATE.md 3개 Task 분할 업데이트 설명과 실제 Task scope 불일치. ✓ 발견 5. **Task 5 라벨화**: Action에 추가될 라벨 세부사항 미명시, Validate만 'identity 7' 존재 확인. ✓ 발견 6. **session-processes.js 존재**: 파일 존재 확인 ✓ 7. **session-processes-reclaimable.test.js identity 7 test 존재**: 라인 425에 존재 ✓ 8. **freePort() 정의**: dashboard-server.test.js:588에서 정의, 라인 609/667에서 사용 중 ✓ 9. **Task 1 머지 검증 commands**: git ls-tree/comm/git diff 명령 실재하고 worktree-safe 함 ✓ 10. **Tests 5개 suite 존재**: session-processes*.test.js 4개 + dashboard-server.test.js 확인 ✓ |
| invariant | fail | Attacked: (1) **Task 11 gate completeness** — traced Action section from line 254 claim of ship execution through all code shown in lines 258-296; verified no `/mccp:pr` or `/mccp:prp-commit` invocation command exists. (2) **Task 1 transaction safety** — read precapture command (100-104) and guard at Validation 4 (393-402); confirmed no freshness check. (3) **Task 4 receipt anchoring** — read YAML exception at 161-162 and searched Validation 10 line 603-604 grep pattern; confirmed location-independent match. (4) **Validation 9 platform assumptions** — read process.kill error check at line 551 and cross-referenced plan OUT OF SCOPE line 53; confirmed POSIX error code used on Windows priority environment. Could not find compensating mechanisms or gatekeeping that would close these gaps. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "divergent",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": false
  },
  "wall_clock_ms": 318949,
  "halt_stage": "5.2e",
  "granted": 4,
  "reviewed_plan_hash": "sha256:2e33d2e1e0f9730f34ec1a0f4ba4f38d4c7f01ccc205d07447267d6522e4ac4c",
  "plan_path": ".claude/plans/session-process-reclaim-followup.plan.md",
  "recorded_at": "2026-08-16T21:17:39.795Z"
}
```
