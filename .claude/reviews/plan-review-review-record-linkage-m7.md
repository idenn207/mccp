# Plan Review Panel — review-record-linkage-m7

**Plan**: `.claude/plans/review-record-linkage-m7.plan.md` · **Plan version**: `sha256:66827fd968ffd4474a3299ae5e35d02b4d20ece013c6121697464972dd61664e`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 10 blocking finding(s): architect/HIGH, architect/FAIL, security/HIGH, security/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | DD10/Task 0 축 1의 '실제 게이트'(REVIEW_DIR/plan-path 실재+내용 일치)는 이미 상수-참다. 그 아티팩트는 이번 워크트리에 **이미 존재하며 내용까지 기대값과 동일**하고(R0 패널 실행이 남긴 것), 캐시 1.33.6 본문은 그 파일을 쓰지도 **purge하지도 않으므로** 캐시 세션에서도 그대로 살아남아 검사를 통과시킨다. 즉 이 게이트는 DD10이 초판을 폐기한 근거('관측 불가한 명제라 항상 통과했다')를 그대로 재현하며, 마일스톤의 유일한 되돌릴 수 없는 자원(라운드 예산, cap=1)을 보호하지 못한다. | 디스크 실재: `.claude/state/plan-review/plan-path` 내용 = `.claude/plans/review-record-linkage-m7.plan.md` (Task 0 검사가 요구하는 바로 그 문자열). 캐시 본문 `~/.claude/plugins/cache/mccp/mccp/1.33.6/commands/plan.md`의 `plan-path` 매치는 660·717 두 줄뿐이며 둘 다 `<plan-path>` 플레이스홀더 — `$REVIEW_DIR/plan-path`에 대한 write도 purge도 0건. 워크트리 `plugins/mccp/commands/plan.md:965`(purge)·`:977`(write)는 **같은 fenced 블록** 안이라 워크트리 실행에서도 항상 존재. 따라서 두 판본 모두에서 파일이 존재 → 판별력 0. plan 본문의 주장 'REVIEW_DIR/plan-path는 워크트리 본문만 쓰고 … env 주입으로 위조되지 않으며'(plan.md:238-240, Task 0 :321-324)는 *write* 축에만 참이고 검사가 보는 *existence* 축에는 거짓이다. |
| security | HIGH | DD10의 대체 게이트(Task 0 축 1)는 이미 충족되어 있어 캐시 본문 세션에서도 무조건 통과한다 — 신선도(freshness) 검사가 없어 DD10이 고치려던 '상수 통과 조건'이 그대로 재현된다 | plan.md:317-319는 `test -s "$REVIEW_DIR/plan-path"` + 내용 문자열 동등만 본다. 그런데 그 파일은 이미 디스크에 존재하고 내용이 정확히 기대값이다: /home/madsc/work/mccp/.worktrees/c1-review-record-linkage/.claude/state/plan-review/plan-path → `.claude/plans/review-record-linkage-m7.plan.md` (R0 실행 잔여, 같은 디렉토리에 dispatch-log-review-record-linkage-m7.jsonl 동반). purge는 워크트리 본문 `plugins/mccp/commands/plan.md:965`가 하는데, 플랜 자신이 F3/DD10에서 캐시 1.33.6 본문에는 그 줄이 0건이라고 단언한다 — 즉 캐시 본문이 실행되면 purge도 write도 일어나지 않고 stale 파일이 남아 게이트가 통과한다. 이 아티팩트의 실재는 '실행된 본문이 그 줄을 가졌다'가 아니라 '언젠가 어떤 본문이 썼다'만 뜻한다. 플랜은 이 게이트를 되돌릴 수 없는 라운드 예산(F8·F9, cap 1)을 지키는 유일한 기계 장치로 지정했다(Risks 표 첫 행 · plan.md:497). |
| security | MEDIUM | 강제 게이트의 신뢰 원천이 워크트리의 평문 파일이라 위조 비용이 `printf`(1줄)이다 — 플랜은 'env 주입으로 위조되지 않는다'만 논증하고 파일 자체의 쓰기 가능성은 논하지 않는다 | plan.md:321-324 "이 파일의 실재는 *실행된 본문이 그 줄을 가졌다*는 뜻이고, 그것은 env 주입으로 위조할 수 없다" — 그러나 `$REVIEW_DIR/plan-path`는 `.claude/state/plan-review/` 아래 일반 파일이고 nonce·서명·소유권 토큰이 없다(같은 디렉토리의 `reservation.json`/`l3-run-nonce` 계열과 달리 판별자가 없음). 대조 선례: plan.md 본문이 L3 stale 판별에 nonce를 본문에 싣는 이유(CLAUDE.md §3.13.3 "stale 판별은 경로가 아니라 레코드 안의 run_nonce다"). |
| security | MEDIUM | git-tracked 산출물에 절대 워크트리 경로(사용자 홈 포함)를 싣도록 acceptance가 요구하는데, `~` 축약 의무는 Task 0 텔레메트리에만 걸려 있다 — 저장소 선례(절대 cwd 유출)를 새 표면에서 되연다 | plan.md:517 "보고서가 **어느 경로에서 완주했는지** 명시 (`docs/dogfood-install.md:113`)" + plan.md:449-450; 그 의무의 원문은 docs/dogfood-install.md:111-113으로 `claude --plugin-dir <worktree>/plugins/mccp` 경로를 뜻한다. 반면 유출 완화는 plan.md:343-345에서 "`sha256sum ~/...`의 출력은 절대경로를 담고 보고서는 git-tracked다"로 **텔레메트리 출력에 한정**된다. 보고서(.claude/PRPs/reports/…)는 커밋 대상이다. |
| test | HIGH | DD10의 '실제 게이트'(REVIEW_DIR/plan-path 실재 확인)는 어떤 파일에도 착지하지 않고 어떤 Validate도 돌리지 않는다 — Risks 표 1행의 유일한 완화가 산문이다 | plan:312-319는 그 검사를 '5.2 진입 직후·5.2b 이전'에 놓는다고 적지만 `## Files to Change`(plan:75-85)에 `plugins/mccp/commands/plan.md`가 없고, `## Validation`(plan:456-491)에도 그 test -s/비교 블록이 없다. plan:497의 Risks 완화가 이 검사를 지목한다. 대조: plan:67이 미러로 든 `install-skew-wiring.test.js`는 '본문에 호출 줄이 실재하는지'를 정적 단언하는데, 이번 사이클에는 그 형태의 단언이 한 건도 요구되지 않는다 |
| test | MEDIUM | Risks 표가 완화 근거로 지목한 '두 경로 값 일치' test가 Task 2의 Validate 요구 목록에 없다 | plan:503 — '강제 뷰가 네 검사를 재정의해 linkage-audit --json과 갈린다 … test가 두 경로의 값 일치를 단언'. 그러나 Task 2 Validate(plan:403-410)가 반드시 포함하라고 못박은 fixture 4개는 degraded/unresolved/과다승인/코퍼스혼합이며 두 경로 일치 단언은 0건이다. 기존 suite에도 그 축은 없다(`linkage-audit.test.js:200`의 DD1a는 두 *도구*의 membership 일치이지 --json 대 --check-live-linkage가 아니다) |
| test | MEDIUM | Task 1은 스스로 'fail-closed — 미충족이면 즉시 정지'라 선언하지만 Validate가 종료코드 없는 출력 덤프라 위반이 자동으로 잡히지 않는다 | plan:347 제목의 fail-closed 선언 대 plan:363-372의 Validate — `node -e '…console.log(f, JSON.stringify({…}))'`. 비교도 exit도 없어 세 앵커 미충족이 사람 눈에만 걸린다. Acceptance(plan:512-514)도 같은 값을 요구하지만 검증 명령이 없다 |
| test | LOW | Acceptance 첫 항목의 '--plugin-dir 아래에서 1회 완주'는 이 plan 자신이 관측 불가라고 인정한 명제라 반증 수단이 없다 | plan:511 acceptance 대 plan:326-329 — "주장하지 않는 것은 '세션이 --plugin-dir로 떴다'이다 — 그 명제는 이 프로세스에서 관측 불가". 관측 불가 명제가 acceptance 체크리스트에는 남아 있어, 보고서 서술 외에 그것을 반증할 것이 없다 |
| invariant | HIGH | DD10/Task 0의 유일한 실제 게이트(`REVIEW_DIR/plan-path` 실재+내용 일치)는 stale 아티팩트에 대해 fail-open이다. 그 파일을 purge하는 것도 워크트리 본문뿐이므로, 캐시 본문이 도는 바로 그 실패 사례에서 이전 실행이 남긴 파일이 그대로 살아남아 검사를 통과시킨다. | 현재 이 워크트리에 `.claude/state/plan-review/plan-path`가 이미 존재하고 내용이 정확히 `.claude/plans/review-record-linkage-m7.plan.md`다(R0 패널 실행 잔여). 파일을 지우는 유일한 지점은 워크트리 `plugins/mccp/commands/plan.md:960-965`의 purge이고, plan F3/DD10이 인정하듯 캐시 1.33.6 본문에는 `plan-path`가 0건이라 purge도 write도 하지 않는다. 따라서 plan.md:317-319의 `test -s ... && [ "$(cat ...)" = ... ]`는 캐시 세션에서도 통과한다. plan은 freshness(nonce·started-at·mtime) 대조를 전혀 두지 않고 "env로 위조되지 않는다"만 근거로 든다(plan.md:321-324). |
| invariant | HIGH | Task 0 축 2의 통과 조건(`rounds_so_far == 0`)과 그것을 근거로 삼는 DD7·F8이 이미 거짓이다. 대상 슬러그의 라운드 예산은 이 사이클에서 이미 3라운드 소진됐고, cap=1 하에서 M7이 요구하는 이연 plan 게이트는 기계적으로 거부된다. | `.claude/state/review-rounds/mccp-plan-codex__review-record-linkage-m7.json`에 `index:0,1,2` panel `emitted` 3건이 기록돼 있다(2026-09-08). 반면 plan F8은 "`review-record-linkage-m7`은 `rounds_so_far:0`", DD7은 "실측 슬러그 …-m7, 원장 `rounds_so_far:0`", Task 0 축 2는 "`rounds_so_far`가 `0`이어야 한다. 다른 값이면 인자가 틀린 것이다 — 캡을 올려 우회하지 않는다"고 적는다. `.claude/settings.json:12` `MCCP_GATE_ROUND_CAP="1"`이고 F9대로 `plan-review/cli.js`가 원장으로 강제한다. |
| invariant | HIGH | 위 두 결과의 합으로, 플랜이 스스로 금지한 두 행위(캡 상향 DD7 · 원장 삭제 §3.16) 외에는 M7의 상류 앵커(Task 1)를 산출할 경로가 남지 않는다 — 즉 acceptance(exit 0) 도달 경로가 플랜 자신의 제약 안에서 존재하지 않는다. | plan.md:200-213 "캡 상향은 대안이 아니다 … 원장을 지우는 것도 §3.16의 정당한 행동 목록에 없다" + Task 1 "하나라도 없으면 구현을 계속하지 않고 정지한다" + 실측 원장 3라운드(위 증거). |
| invariant | LOW | Task 2 검사 4의 판정 기준이 모호해 fail-open 여지를 남긴다 — "eligible 집합의 원소"와 "`meta.plan_review_expected`가 실려"를 같은 문장에 놓는데, `explicit_false`도 필드가 실린 상태다. | plan.md:396 "지목한 ship이 **eligible 집합의 원소** — 즉 `meta.plan_review_expected`가 실려 자격이 확정됐다". `linkage-defs.js:200-206`은 `explicit_true`와 `explicit_false_explained`를 별도 코드로 구분하며 후자는 eligible이 아니다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | 공격 대상: (1) DD10의 5.2 게이트 판별력 — 캐시/워크트리 본문의 plan-path write·purge 줄과 디스크 잔존물을 실측해 상수-참임을 확인(위 HIGH). (2) F5/F6/F15 인용 — `finalize-receipt.js:281-336`을 열어 carry-forward 유일성·`review_source` 파생·`meta.plan_path` 정확히 1건 매칭이 인용대로임을 확인, 반증 실패. (3) DD4 '정의를 호출하고 재정의하지 않는다' — `computeLinkage(eligibleShips,…)`(linkage-audit.js:353-404)가 배열 인자라 단원소로 per-ship 재사용이 구조적으로 가능함을 확인, 재정의 강제 아님. (4) DD8 'HEAD 트리 하나' — 라이브 파티션이 이미 `liveRef='HEAD'`로 git show를 쓰므로(:621-655, :891) 새 코퍼스 경계를 만들지 않음, 반증 실패. (5) 검사 4의 eligible 정의 — `linkage-defs.js:192-240`의 명시 `plan_review_expected` 축과 일치. (6) acceptance(exit 0)의 도달 가능성 — `pr.md:1344-1385` 증거 커밋이 receipt와 back-patch된 레코드를 함께 stage하므로 HEAD 조건이 구조적으로 도달 가능, 반증 실패. (7) F8/F9 캡 강제 — `plan-review/cli.js:335-361` 확인, 인용 정확. |
| security | fail | 공격한 것: (1) DD10 대체 게이트의 신뢰 경계 — `$REVIEW_DIR/plan-path`를 실제로 열어 R0 잔여물이 기대값 그대로 디스크에 있음을 확인했고, 캐시 본문에 purge 줄이 0건이라는 플랜 자신의 F3 주장과 결합해 stale-pass 경로를 끝까지 추적함(HIGH). (2) 산출물 유출 — install-skew.js 출력에 절대경로가 없음을 skeleton(:95-105)에서 확인해 그 축은 기각했고, 대신 dogfood-install.md:113의 경로 명시 의무가 완화 범위 밖임을 확인. (3) `--decision <slug>` 경로 조작 — linkage-audit.js에 `--decision`/`path.join(user)` 소비 지점이 아직 없고 플랜도 receipt 파일명 조립을 명시하지 않아, 입력→결과 경로를 세울 수 없어 finding으로 올리지 않음. (4) DD8의 HEAD-전용 읽기가 `MCCP_PR_SKIP_LINK_EVIDENCE` 우회를 실제로 강등시키는지 — linkage-audit.js:621-628 주석과 일치하며 반증 실패. (5) receipt 재봉인/hash 표면 — 플랜은 present-only 필드만 다루고 재봉인을 UI13으로 배제, 반증 실패. (6) `--decision` 없는 전역 집계로 인한 과다승인 — 이미 R0 test HIGH로 흡수돼 Task 2 검사표가 닫음. |
| test | fail | plan과 PRD를 읽고, (a) Files to Change 각 파일에 대응하는 Validate 명령이 있는지 대조, (b) Risks 표의 완화가 지목한 test가 Task Validate/기존 suite에 실재하는지 `linkage-audit.test.js` 전 test 이름 스캔으로 확인, (c) 인용 file:line(`linkage-audit.js:112-118, 353-359, 621-628, 767`)이 실제로 그 내용인지 grep으로 확인 — 인용은 전부 정확했다, (d) DD8/DD3/DD9의 acceptance 주장이 Task 2의 4 fixture로 반증 가능한지 검토 — 그 4개는 실제로 해당 축을 덮는다. 결함은 (1) DD10 게이트가 파일·test 어디에도 착지하지 않는 산문 완화, (2) Risks 503행이 존재하지 않는 test를 완화로 인용, (3) Task 1의 fail-closed가 기계가 아님, (4) 관측 불가 acceptance 항목이다. |
| invariant | fail | plan이 인용한 근거를 원문 대조: finalize-receipt.js:281-335(F5·F6·F15 정확), linkage-audit.js:109-138(CHECK/STATE 종료코드 분리 정확), linkage-defs.js:186-233(3값 자격 정확), record.js/pr.md back-patch. 그 뒤 게이트를 열려고 시도: (a) DD10이 상수 검사를 대체한 `plan-path` 검사에 stale 입력을 먹여 통과시킬 수 있는지 — 디스크에 그 파일이 실제로 존재하고 캐시 본문이 purge하지 않음을 확인해 성공. (b) 라운드 예산 축 — 원장 파일을 직접 읽어 F8/DD7의 `rounds_so_far:0`이 거짓임을 확인. (c) DD9 acceptance 자기모순(exit 0 대 사유 기록)은 R0 흡수로 실제로 닫혀 있어 반증 실패. (d) `unresolved`(3)가 승인으로 접히는 경로를 찾으려 했으나 acceptance가 exit 0 단일 기준이라 반증 실패. (e) R1 캡 상향이 settings.json에 영구 잔류하는지 확인 — 여전히 1이라 반증 실패. |

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
  "wall_clock_ms": 271048,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:66827fd968ffd4474a3299ae5e35d02b4d20ece013c6121697464972dd61664e",
  "plan_path": ".claude/plans/review-record-linkage-m7.plan.md",
  "receipt_hash": null,
  "recorded_at": "2026-09-08T05:38:17.367Z",
  "rounds": 3
}
```
