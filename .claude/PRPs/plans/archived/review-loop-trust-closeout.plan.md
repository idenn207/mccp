# Plan: Review-Loop Trust 우산 마감 (status 동기화 + 아카이브)

**Source PRD**: .claude/prds/review-loop-trust.prd.md
**Selected Milestone**: 없음 — 이 우산은 자체 구현 milestone을 갖지 않는다. 본 plan은 표 **안의** 행이 아니라 표 **자체**의 정합을 대상으로 한다.
**Complexity**: Small

## Summary

우산 PRD의 자식 7개가 전부 complete + archived인데 우산 표는 4행(P1·P2·P3·H3)이 여전히 `pending`이고 그 4행의 `Plan` 링크가 `archived/` 이동으로 깨져 있다. 우산 자신의 Open Question이 2026-08-16에 "자식이 complete로 전이할 때 우산 행을 사람이 같은 사이클에 정정한다"로 규칙을 세웠고, 그 규칙이 1/5/6행에만 적용된 뒤 4회 누락됐다.

이 plan은 그 4행을 ship 근거(PR·SHA·version)와 함께 정정하고, row 1의 stale한 "머지되지 않았다" 서술을 실측으로 교체하고, 미체결 OQ 2건을 근거와 함께 닫은 뒤, `/mccp:archive-complete`로 우산을 은퇴시킨다. 아카이브는 되돌리기 어려운 방향이므로, 우산이 활성 표면을 떠나면 추적자가 사라지는 잔여 2건 — 이제 unblocked된 "work chain 재배열" 후속 PRD, 그리고 **1순위 지표가 관측 0건**이라는 사실 — 을 append-only backlog에 먼저 등재한 뒤에 옮긴다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | review-loop-trust PRD의 남은 작업과 backlog, fix-task 상태를 확인할 것 | direction |
| UI2 | 확인 결과 중 우산 마감 chore를 이번 사이클의 작업으로 선택함 | direction |
| UI3 | 새 worktree를 만들지 않고 현재 worktree에서 main을 당긴 뒤 이어서 진행할 것 | direction |
| UI4 | delta-scope default flip(Layer 2 재측정)은 이번 사이클 범위 밖 | exclusion |
| UI5 | work chain 재배열 신규 PRD 작성은 이번 사이클 범위 밖 | exclusion |
| UI6 | backlog 미판정 6건 정리는 이번 사이클 범위 밖 | exclusion |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 우산 행 정정 포맷 | `.claude/prds/review-loop-trust.prd.md` 의 표 행 5·6 | Outcome 끝에 `. main 머지 완료 — PR #136 (295b628, v1.25.0)` 를 덧붙이고 status `complete`, Plan 셀은 `archived/` 경로. 이 두 행이 규칙의 유일한 선례다. **미러링 대상은 절(clause)의 형태이지 PR 개수가 아니다** — 아래 각주 참조 |
| 아카이브 실행 | `plugins/mccp/commands/archive-complete.md:19-103` | Phase 0 SCAN(결정적) → 1 EVALUATE → 2 HUMAN-GATE → 3 APPLY(원자) → 4 RENDER+VERIFY → 5 OUTPUT |
| 아카이브 커밋 | `4aab179` (santa-delta-review 은퇴) | `chore(archive): retire <name> PRD ...` · plugin.json **미변경** · archive-journal 1건 동반 |
| archivable 판정 | `plugins/mccp/scripts/lib/archive-complete/scan.js:159` | `rawRowCount === complete + dropped` fail-closed 등식. 비정규 행 1개면 전체 non-archivable |
| 단독 이동 거부 | `plugins/mccp/scripts/lib/archive-complete/apply.js:278` | PRD와 **그 모든 활성 plan**이 하나의 원자 단위. 우산은 현재 `plans=0`이나 본 plan이 물리면 `plans=1`이 되어 함께 이동한다 |
| backlog 등재 | `.claude/plans/codex-findings-backlog.md` | `| YYYY-MM-DD | SEVERITY | source | finding |` append-only 1행 |

> **선례의 PR 개수는 우연이지 규칙이 아니다 (L2 architect HIGH 흡수).** 행 5·6이 단일 PR을 쓰는 이유는 H1·H2가 각각 PR 하나로 ship됐기 때문이고, 포맷이 하나만 허용해서가 아니다. P1은 실제로 #141·#143·#145 세 PR에 걸쳐 ship됐으므로 하나만 적으면 **사실이 아닌 기록**이 된다. 따라서 미러링하는 것은 `. main 머지 완료 — PR #N (sha, vX.Y.Z)` **절의 형태**이고, milestone이 여러 PR에 걸친 행은 그 절을 `·`로 반복한다. Acceptance의 "Patterns mirrored, not reinvented"는 이 정의로 판정한다 — 정확성을 깎아 선례의 개수를 맞추는 것은 미러링이 아니라 사실 왜곡이다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 아카이브 후 추적자가 사라지는 잔여 2건 + 게이트 실측 결함 1건 등재 (Task 4 — Task 5보다 **먼저**) |
| `.claude/prds/review-loop-trust.prd.md` | UPDATE | 표 4행 정정 · row 1 오기 정정 · OQ 2건 체결 · 1순위 지표 종료 시점 실측 주석 |
| `.claude/prds/archived/review-loop-trust.prd.md` | CREATE | `/mccp:archive-complete` Phase 3의 `git mv` 목적지 |
| `.claude/PRPs/plans/archived/review-loop-trust-closeout.plan.md` | CREATE | 같은 원자 단위로 이동하는 본 plan의 목적지 (apply.js C2) |
| `.claude/state/archive-journal/` | UPDATE | 파괴적 변경의 audit anchor (git-tracked). 디렉토리는 이미 존재하고 신규 journal 1건이 추가된다 |
| `.claude/state/STATE.md` | UPDATE | 사이클 연속성 |

`plugins/mccp/.claude-plugin/plugin.json`은 **변경하지 않는다** — 코드 0줄이고, 선례 5건(`0ed9b1c`·`4aab179`·`4ae8eeb`·`7220c84`·`2844944`)이 전부 no-bump다. §3.7의 minor 기준("PRD 전체 완료")은 자식 PRD가 ship될 때 이미 소비됐다.

## Tasks

### Task 1: 표 4행(P1·P2·P3·H3) status + Plan 링크 + ship 근거 정정

- **Action**: `.claude/prds/review-loop-trust.prd.md`의 61·62·63·66행에서 status를 `pending` → `complete`, Plan 셀을 `archived/<name>.prd.md`로, Outcome 끝에 ship 근거를 덧붙인다.

  | 행 | ship 근거 (전부 HEAD의 ancestor로 검증됨) |
  |---|---|
  | 2 P1 | PR #141 (`767a2c7`, v1.26.2) · #143 (`614eb79`, v1.27.1) · #145 (`22937aa`, v1.28.0) |
  | 3 P2 | PR #150 (`c1115c3`, v1.30.0) — M1~M3 일괄 |
  | 4 P3 | PR #160 (`83ed37a`, v1.32.7) — M1~M3 일괄 |
  | 7 H3 | PR #142 (`1384cbe`, v1.27.0) — M1+M2 출하 + M3 잔여 정리 |

- **Mirror**: `. main 머지 완료 — PR #NNN (sha, vX.Y.Z)` **절의 형태**. milestone이 여러 PR에 걸친 행(P1)은 그 절을 `·`로 반복한다 — 행 5·6이 절을 하나만 쓰는 것은 H1·H2가 PR 하나로 ship된 우연이지 개수 규칙이 아니다(Patterns 표 아래 각주). **행 5·6을 "단일 PR" 규칙으로 읽어 P1의 3개 PR을 하나로 줄이지 마라 — 그것은 미러링이 아니라 사실 왜곡이다.**
- **Validate**: `scan.js`를 실제로 돌려 우산이 `archivable: true`, `reason: all 7 milestone rows complete/dropped` 인지 확인(아래 Validation 1번, 불일치 시 `exit 1`).

### Task 2: row 1(P0)의 stale한 미머지 서술 정정

- **Action**: 60행의 "단 배송은 **브랜치 착지까지**이고 브랜치 `santa-loop-materialize`가 main에 아직 머지되지 않았다(PR 미생성 → 후속 사이클)"를 삭제하고 `main 머지 완료 — PR #139 (ee9f8e0, M1 v1.25.2 · M2 v1.26.0)`으로 교체한다. status는 이미 `complete`라 표 판정에는 영향이 없고, 정정 대상은 **서술의 사실성**이다.
- **Mirror**: Task 1과 동일 어미.
- **Validate**: `git merge-base --is-ancestor ee9f8e0 HEAD` 가 exit 0. 정정 후 본문에 "머지되지 않았다" 문자열 0건.

### Task 3: Open Question 2건 체결 + 1순위 지표 종료 시점 실측 주석

- **Action**:
  1. OQ "우산 PRD의 대시보드 가시성" → `[x]`. 판정: (a) 미노출 감수로 확정하되, **본 plan이 물리는 동안에는 `plans=1`이 되어 일시적으로 노출되고 아카이브와 함께 이동한다**는 실측을 기록. 아카이브 후에도 `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js:218`이 `.claude/prds/archived/`를 직접 스캔하므로 완료 이력은 타임라인에 남는다.
  2. OQ "santa 원장의 git-tracked 여부 — P0가 결정" → `[x]`. 판정: P0 M1이 권고안대로 착지했다 — 원장 본문은 `.gitignore:53`의 `.claude/state/santa-loop/`로 gitignored이고, 집계는 `seal.js:51`의 `mccp-santa-review` receipt(`meta.santa_rounds` / `santa_entries` / `santa_cap` / `santa_blind_records`, `schema.js:1055-1075`)에 봉인된다.
  3. Success Metrics 표 아래에 종료 시점 실측 1문단 추가: 1순위 지표(판정 계측 가능성)는 **기전은 전부 착지했으나 관측이 0건**이다. `mccp-santa-review`는 `schema.js:35`의 GATE_IDS에 등재됐고 aggregate 4필드도 검증되지만, 이 저장소의 두 체크아웃 어디에도 해당 receipt와 `.claude/state/santa-loop/` 원장이 없다. 둘 다 gitignored이므로 이것이 "한 번도 안 돌았다"의 증명은 아니지만, **우산이 약속한 baseline은 아직 확정되지 않았다**. 이는 우산 Risks 표 마지막 행("계측을 붙였는데 corpus가 안 쌓여…")이 예견한 상태이고, 그 mitigation(forward-only 누적)에 따라 다음 santa 실행이 첫 관측이 된다.
- **Mirror**: 이미 체결된 OQ "archive 시점"의 `**결정(YYYY-MM-DD): …**` 어투.
- **Validate**: 미체결 `- [ ]` 0건.

### Task 4: 아카이브로 소실될 잔여 + 게이트 실측 결함을 backlog에 등재 (Task 5보다 먼저)

- **Action**: `.claude/plans/codex-findings-backlog.md`에 3행 append.
  1. `MEDIUM` — **work chain 재배열(우산 항목 1.5) 후속 PRD 미착수.** 우산의 착수 순서표가 "P1·P2·P3 전부 종료 후"로 걸어둔 유일한 후속인데 세 축이 전부 complete가 되어 **지금 unblocked**이다. 활성 PRD 6개 중 해당 PRD는 없고, 우산이 아카이브되면 이 의존 해제 사실을 들고 있는 활성 문서가 0이 된다. 착수는 `/mccp:plan-prd`부터.
  2. `HIGH` — **우산 1순위 지표가 관측 0건으로 종료된다.** Task 3-3의 실측. 다음 santa 실행이 첫 관측이며, 그 실행이 `mccp-santa-review` receipt를 실제로 남기는지 확인하는 것이 baseline 확정 조건이다.
  3. `LOW` — **L1 C6가 `.claude/…:NN` 인용을 구조적으로 항상 미해석한다.** 본 plan의 게이트 R0에서 실측. `plugins/mccp/scripts/lib/plan-review/l1-check.js:66`의 `CITATION_RE`가 `[A-Za-z0-9_]`로 시작해 선행 점을 잘라내고(`.claude/…` → `claude/…`), 같은 파일 44행의 `CITATION_BASES`에 그것이 해석될 base가 없다. 결과적으로 plan이 PRD·다른 plan을 줄 번호와 함께 인용하면 무조건 C6 위반이 되어, 저자가 인용을 **덜 정확하게**(줄 번호 삭제) 고치도록 압박한다 — lint가 정밀도를 깎는 방향이다.
- **Mirror**: 파일 기존 행의 4열 포맷. 날짜는 `YYYY-MM-DD` 정규형이어야 한다 — `derive/sources/backlog.js`가 날짜를 파싱 못 하면 그 행은 `degraded`로 떨어져 대시보드에 안 뜬다.
- **Validate**: `error` 부재만으로는 부족하다(L2 security MEDIUM). 등재 후 `node plugins/mccp/scripts/derive/cli.js run --json` 을 돌려 backlog 소스의 **`degraded`가 false**이고 신규 3행이 파싱된 행에 실재하는지까지 확인한다(아래 Validation 4번, 불일치 시 `exit 1`).

### Task 5: `/mccp:archive-complete` 실행 (human-gate)

- **Precondition — 실행 전 차단 스크립트 (L2 invariant HIGH 흡수, R2 라벨 정정).** Task 4가 조용히 실패해도 이 Task가 실행될 수 있다는 것이 원래 설계의 결함이었다. 순서를 산문으로만 적어두면 blocker가 아니다. 아카이브는 되돌리기 어렵고, `apply.js`의 preflight는 PRD milestone 표만 검사할 뿐 backlog 상태를 **전혀 보지 않으므로**, 검사는 여기서 직접 세운다.

  **이 스크립트의 강제력 범위를 정확히 적는다.** 이것은 `archive-complete` 도구가 강제하는 런타임 게이트가 **아니다** — 이 plan을 실행하는 주체가 커맨드 진입 전에 돌려야 하는 차단 스크립트다. R2 패널이 CRITICAL로 지적한 것은 이 구분이었고, 그 지적의 유효한 부분은 **라벨의 과장**이지 스크립트의 부재가 아니다(도구에 backlog 검사를 넣는 것은 코드 변경이고 이 chore의 선언된 범위 밖 — Files to Change 아래 각주 참조). exit 1이면 Task 5에 진입하지 않는다.

  ```bash
  # Task 4가 3행을 남겼는가 — 앵커 문자열 존재 AND 그 행이 실제로 파싱되는가.
  # 앵커 grep만으로는 부족하다(L2 security MEDIUM): 날짜가 깨진 행은 앵커를
  # 담고도 backlog.js에서 non-parsed로 떨어져 대시보드에 영영 안 뜬다.
  node -e '
    const fs=require("fs");
    const rows=fs.readFileSync(".claude/plans/codex-findings-backlog.md","utf8")
      .split(/\r?\n/).filter(function(l){ return /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(l); });
    const need=["work chain 재배열","1순위 지표가 관측 0건","CITATION_RE"];
    const missing=need.filter(function(a){ return !rows.some(function(r){ return r.indexOf(a)!==-1; }); });
    if(missing.length){
      console.error("[HALT] 파싱 가능한 backlog 행에 없음: "+missing.join(" · "));
      console.error("[HALT] 아카이브하면 이 findings는 되돌릴 수 없이 소실된다. Task 4를 먼저 끝내라.");
      process.exit(1);
    }
    console.log("pre-flight ok: 3 anchors present in parseable rows");
  ' || exit 1
  ```

- **Action**: pre-flight가 통과한 뒤에만 커맨드를 실행한다. Phase 0 SCAN이 우산을 archivable로 잡고 Phase 2가 사람 승인을 요구한다. Phase 3이 우산 PRD + 본 plan을 하나의 원자 단위로 이동하고 archive-journal 1건을 남긴다. **`git mv`를 손으로 치지 않는다** — §3.11의 수동 경로는 orphan *plan* 전용이고, 여기서는 tool의 discovery가 정상 동작한다(실측: scan이 우산을 이미 열거함).
- **Mirror**: `4aab179`의 커밋 형태.
- **Validate**: 위 pre-flight가 exit 0 · `.claude/prds/review-loop-trust.prd.md` 부재 · `.claude/prds/archived/review-loop-trust.prd.md` 존재 · archive-journal 신규 1건 · `git status`에 rename 2건.

### Task 6: 삭제 검증 + 커밋

- **Action**: §3.5.1대로 `git diff --diff-filter=D --name-only origin/main...HEAD`로 이번 브랜치가 삭제하는 파일을 전수 확인한다. rename은 D+A 쌍으로 잡히므로 **목록의 각 항목에 `archived/` 대응 파일이 있는지**까지 대조한다. 그 외 삭제가 1건이라도 있으면 멈추고 조사한다. 이어서 `chore(archive): retire review-loop-trust umbrella PRD after all seven children shipped` 로 커밋.
- **Mirror**: CLAUDE.md §3.5.1 삭제 검증 의무.
- **Validate**: 삭제 목록이 정확히 우산 PRD와 본 plan 2건이고 둘 다 `archived/`에 대응 파일이 있다.

## Validation

모든 항목이 **단언형**이다 — 관측만 하고 넘어가면 Task 4가 조용히 실패한 채 Task 5가 도는 것과 같은 결함이 Validation 자신에게 생긴다(L2 test HIGH 흡수). 블록은 `set -e` 아래에서 돌리고, 각 항목은 실패 시 비영점으로 끝난다.

```bash
set -e

# 1. 표 판정 — archivable 등식 (Task 1·2 후). 단언: archivable이 아니면 exit 1.
node -e '
  const s=require("./plugins/mccp/scripts/lib/archive-complete/scan.js");
  const r=s.scan({repoRoot:process.cwd()});
  const p=r.prds.find(function(x){return /review-loop-trust/.test(x.path)});
  if(!p){ console.error("FAIL: 우산 PRD가 scan 결과에 없다"); process.exit(1); }
  console.log(p.archivable, p.reason, "plans="+p.plans.length);
  if(!p.archivable){ console.error("FAIL: not archivable — "+p.reason); process.exit(1); }
'

# 2. OQ 미체결 0건 · stale 서술 0건 (Task 2·3 후). grep -c 는 세기만 하므로 단언을 건다.
test "$(grep -c '^- \[ \]' .claude/prds/review-loop-trust.prd.md)" = "0" \
  || { echo "FAIL: 미체결 Open Question이 남아 있다"; exit 1; }
! grep -q '머지되지 않았다' .claude/prds/review-loop-trust.prd.md \
  || { echo "FAIL: row 1의 stale 미머지 서술이 남아 있다"; exit 1; }

# 3. ship 근거 SHA 7개가 전부 HEAD의 ancestor인가. 하나라도 아니면 exit 1.
for c in ee9f8e0 767a2c7 614eb79 22937aa c1115c3 83ed37a 1384cbe; do
  git merge-base --is-ancestor "$c" HEAD || { echo "FAIL: NOT ANCESTOR $c"; exit 1; }
done

# 4. backlog — error 부재로는 부족하다. degraded=false 이고 3행이 파싱됐는가.
node plugins/mccp/scripts/derive/cli.js run --json > /tmp/derive.json
node -e '
  const fs=require("fs");
  const m=JSON.parse(fs.readFileSync("/tmp/derive.json","utf8"));
  const b=(m.sources||{}).backlog||{};
  if(b.ok===false||b.degraded===true){ console.error("FAIL: backlog source degraded/not-ok"); process.exit(1); }
  const rows=fs.readFileSync(".claude/plans/codex-findings-backlog.md","utf8")
    .split(/\r?\n/).filter(function(l){ return /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(l); });
  const need=["work chain 재배열","1순위 지표가 관측 0건","CITATION_RE"];
  const missing=need.filter(function(a){ return !rows.some(function(r){ return r.indexOf(a)!==-1; }); });
  if(missing.length){ console.error("FAIL: 파싱 가능한 행에 없음 — "+missing.join(" · ")); process.exit(1); }
  console.log("backlog ok: 3 rows parseable");
'

# 5. 아카이브 후 대시보드 완료 이력 보존 (Task 5 후). 0건이면 이력이 사라진 것.
node plugins/mccp/scripts/derive/cli.js render
test "$(grep -c 'Review-Loop Trust' .claude/cache/STATUS.md)" != "0" \
  || { echo "FAIL: 아카이브 후 완료 이력이 대시보드에서 사라졌다"; exit 1; }

# 6. 삭제 검증 (Task 6) — 삭제 목록의 모든 항목이 archived/ 대응 파일을 갖는가.
git diff --diff-filter=D --name-only origin/main...HEAD > /tmp/deleted.txt
cat /tmp/deleted.txt
while read -r f; do
  [ -z "$f" ] && continue
  b=$(basename "$f")
  git ls-files --error-unmatch ".claude/prds/archived/$b" >/dev/null 2>&1 \
    || git ls-files --error-unmatch ".claude/PRPs/plans/archived/$b" >/dev/null 2>&1 \
    || { echo "FAIL: 대응 archived/ 파일 없는 삭제 — $f (§3.5.1 조사 필요)"; exit 1; }
done < /tmp/deleted.txt

# 7. plugin.json 미변경 반증 (Files to Change 아래 주장이 반증 가능해야 한다).
! git diff --name-only origin/main...HEAD -- plugins/mccp/.claude-plugin/plugin.json | grep -q . \
  || { echo "FAIL: plugin.json이 변경됐다 — 이 chore는 코드 0줄이어야 한다"; exit 1; }

echo "ALL VALIDATION PASSED"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 우산을 아카이브하면 1순위 지표가 관측 0건인 채로 트랙이 닫힌다 | **High (확실)** | 감추지 않고 Task 3-3에서 우산 본문에, Task 4-2에서 backlog에 이중 기록한다. 우산 Risks 표가 이미 예견한 상태이며 mitigation은 forward-only 누적이다. 지표를 채우려고 santa를 억지로 1회 돌리는 것은 UI4~UI6이 배제한 범위이고, 목적 없는 실행은 corpus를 오염시킨다 |
| `/mccp:archive-complete`가 아직 실행 중인 본 plan을 함께 옮긴다 | Medium | 의도된 동작이다(apply.js:278 원자 단위). Task 5를 뒤에서 두 번째에 두어 이동 시점에 plan이 이미 완료 상태가 되게 한다. 선례 `4aab179`도 plan 3개를 PRD와 같은 커밋에서 옮겼다 |
| 표 편집이 `rawRowCount` 등식을 깨서 non-archivable로 떨어진다 | Low | `scan.js:155`의 bucket-sum mismatch도 fail-closed다. Task 1 Validate가 편집 직후 실제 oracle을 돌려 확인하므로 Phase 3까지 가지 않고 잡힌다 |
| 삭제 검증이 rename을 오탐해 멈춘다 | Low | Task 6이 D 목록과 `archived/` 대응 파일을 쌍으로 대조한다. 대응이 있으면 이동, 없으면 진짜 삭제 |
| 아카이브 후 "work chain 재배열"이 잊힌다 | Medium | Task 4-1이 append-only backlog에 등재한다. backlog는 `derive/sources/backlog.js`가 읽어 대시보드에 carried-over finding으로 노출되므로 활성 표면에 남는다 |
| Task 4가 조용히 실패한 채 Task 5가 실행돼 3건이 소실된다 | Medium | **L2 invariant HIGH가 지적한 원래 결함.** 순서 서술은 blocker가 아니었고 `apply.js` preflight는 backlog를 보지 않는다. Task 5에 앵커 grep pre-flight를 두어 3행이 실재하지 않으면 exit 1로 진입 자체를 막는다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes — `## Validation` 블록 전체가 `set -e` 아래에서 `ALL VALIDATION PASSED`로 끝난다(관측만으로는 통과가 아니다)
- [ ] Patterns mirrored, not reinvented — 판정 기준은 Patterns 표 아래 각주다: 미러링 대상은 `. main 머지 완료 — PR #N (sha, vX.Y.Z)` 절의 형태이고, PR 개수는 사실을 따른다
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 — 구체적으로 `/mccp:archive-complete`를 **실제로 실행**해 (a) `.claude/prds/archived/review-loop-trust.prd.md` (b) `.claude/PRPs/plans/archived/review-loop-trust-closeout.plan.md` (c) `.claude/state/archive-journal/` 신규 JSON 1건, 세 산출물이 디스크에 존재함을 확인한다. `scan.js`가 archivable을 반환하는 것만으로는 완주가 아니다
- [ ] 우산 본문에 미체결 `- [ ]` 0건, stale 미머지 서술 0건
- [ ] backlog 3행이 등재되고 `derive/cli.js run` 이 backlog 소스에서 error를 내지 않는다
- [ ] 이번 브랜치의 삭제 목록이 정확히 2건이고 둘 다 `archived/` 대응 파일을 가진다 (§3.5.1)

## L2 판정 기록

R0(L1 3건) · R1(L2 2 fail / 1 finding) · R2(L2 4 fail / 11 findings)에서 제기된 지적의 처분이다. 리뷰어 프롬프트는 손대지 않았고(I1), 오탐은 여기 하류에서 거른다.

| 라운드 | 출처 | 지적 | 판정 |
|---|---|---|---|
| R0 | L1 C3 | `.claude/state/archive-journal/`를 CREATE로 선언(이미 존재) | **수용** — UPDATE로 정정 |
| R0 | L1 C6 | `milestone-history.js` bare basename 인용 | **수용** — repo-root full 경로로 교체 |
| R0 | L1 C6 | `claude/prds/…` 미해석 | **기각(checker 결함)** — `l1-check.js:66` `CITATION_RE`가 선행 점을 잘라내고 `CITATION_BASES`에 대응 base가 없다. 인용을 덜 정확하게 만드는 방향이라 회피 대신 backlog LOW 등재(Task 4-3) |
| R1 | invariant HIGH | Task 4 실패해도 Task 5 진입 가능 (되돌릴 수 없는 소실) | **수용** — Task 5에 실행 전 차단 스크립트 추가 |
| R1 | architect HIGH | 다중-PR 포맷이 Acceptance "Patterns mirrored"와 모순 | **수용(재정의)** — 미러링 대상이 절의 형태임을 각주로 고정. PR 개수는 사실을 따른다 |
| R1 | test LOW | `plugin.json` 미변경이 반증 불가 | **수용** — Validation 7번 |
| R2 | architect CRITICAL · invariant CRITICAL×2 + HIGH | Task 5 pre-flight가 `apply.js`에 없으므로 "기계적 강제"가 아니다 | **부분 수용.** 라벨 과장은 **수용** — "기계적 HALT" → "실행 전 차단 스크립트"로 정정. 도구에 backlog 검사를 넣으라는 요구는 **기각**: 그 기준을 적용하면 모든 mccp plan의 모든 `**Validate**` 줄이 위반이 되고, 코드 0줄·version bump 없음이라는 이 chore의 선언된 범위(Files to Change 아래 각주)와 UI4~UI6 배제를 뒤집는다. plan은 실행되는 지시문이지 런타임이 아니다 |
| R2 | architect HIGH×2 | Task 1 `Mirror` 줄이 R1의 각주와 모순 | **수용** — R1 흡수가 만든 실제 내부 모순. Mirror 줄을 각주와 일치시킴 |
| R2 | test HIGH + MEDIUM×2 + LOW | Validation이 관측형이라 실패해도 통과로 읽힌다 | **수용** — 블록 전체를 `set -e` + 항목별 `exit 1` 단언형으로 교체 |
| R2 | security MEDIUM | 앵커 grep은 통과하나 날짜 깨진 행은 파싱 실패해 대시보드에 안 뜬다 | **수용** — pre-flight와 Validation 4번을 "파싱 가능한 행" 기준으로 강화 |

**patch-chasing 실측 (이 PRD가 문서화한 현상의 자기 재현).** R2 findings 11건 중 8건이 R1 흡수가 새로 넣은 텍스트를 겨눴다 — Task 5 pre-flight(5건)와 Patterns 각주(2건), 그리고 그 각주가 만든 Mirror 모순(1건). 우산 PRD Evidence 절의 #124 실측("라운드 4~6의 지적이 전부 직전 라운드가 넣은 코드를 겨눔")과 같은 형태이며, 이번에는 R1→R2 한 스텝에서 관측됐다. 이 관측 자체가 P1~P3가 닫으려던 축의 근거 데이터다.

**종결 방식.** 수용 항목을 전부 반영한 뒤 `MCCP_REVIEW_SINGLE_PASS=scope_too_small`로 1회 완화해 닫는다. verdict는 `divergent`로 봉인되며 `converged`로 세탁되지 않고, 잔여 findings는 5.2g2가 backlog에 기계적으로 적재한다.

## Design Critique

- 검출: `impeccable-detect.js` → `design_signal=true`, `skill_available=true` (impeccable 4.0.4, user scope, `impeccable_shadowed=false`)
- 트리거 축: (a) detector positive. `signal_files`는 본 plan Validation 블록의 `node plugins/mccp/scripts/derive/cli.js render` 한 줄이다 — 렌더러 **소스**가 아니라 read-only 재렌더 호출이라 신호는 약하지만, 리뷰어를 피해가지 않고 규정대로 loop을 돌렸다.
- 라운드: R0 1회 · cap 2 (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` default)
- verdict: **CONVERGED** (findings 0건 — 렌더 design surface 미도입)
- 4개 Output Constraints 대조 근거:
  - **정보 위계 3단계 / H15** — plan heading은 3단계까지만 쓴다. 실측 분포 `#`×7 · `##`×8 · `###`×6, depth 4 이상 0건.
  - **강조색 화면당 1개** — 렌더 surface 미도입. accent token · theme · CSS · 템플릿 파일 변경 0건.
  - **raw markdown marker 금지** — opening `**` 직후 공백을 찾는 정밀 검출기로 plan · PRD 양쪽 clean. 더불어 노출 경로 자체가 없다: `plugins/mccp/scripts/lib/renderer/sections/open-questions.js`는 plan OQ와 STATE.md만 소비해 PRD 산문이 도달하지 않고, `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js:211-216`은 아카이브 PRD의 milestone 행만 읽으며 주석이 "활성 카운트 오염 0"을 명시한다.
  - **한 화면 항목 수 상한** — plan에 `list-of-N` 렌더 섹션 없음.

## Design Routing Guide

routing mode: auto (implement 단계에서 유효). plan 단계는 렌더된 UI가 없어 어떤 impeccable 명령도 **호출하지 않는다** — 아래는 구현자용 체크리스트다. 본 plan은 렌더 surface를 도입하지 않으므로 implement에서 실제로 발화할 행은 없을 것으로 예상된다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
