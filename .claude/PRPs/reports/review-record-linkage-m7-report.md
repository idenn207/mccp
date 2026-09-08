# review-record-linkage M7 — 사이클 기록 (미완료 종료)

**Plan**: [.claude/plans/review-record-linkage-m7.plan.md](../../plans/review-record-linkage-m7.plan.md)
**PRD**: [.claude/prds/review-record-linkage.prd.md](../../prds/review-record-linkage.prd.md) · M7 `live-firing-execution`
**브랜치**: `review-record-linkage-m7`
**날짜**: 2026-09-08
**결론**: **M7은 complete가 아니다.** 구현에 착수하지 않았고 plan 게이트가 receipt를
산출하지 못한 채 라운드 예산이 종료적으로 소진됐다.

> 이 보고서는 구현 보고가 아니라 **사이클 기록**이다. plan Task 5가 규정한 보고서는
> 라이브 실값을 싣는 완료 보고인데, 이 사이클은 그 값을 산출할 지점(Task 4)에
> 도달하지 못했다. 그리고 STATE.md의 body patch 경로가 죽어 있어(아래 O3) §3.2가
> 허용하는 인계 채널이 없으므로, **다음 사이클을 위한 handoff도 이 파일이 진다**.

---

## 1. 무엇이 실행됐고 어디서 멈췄나

plan 게이트(`/mccp:plan .claude/plans/review-record-linkage-m7.plan.md`)를 세 라운드
돌렸고 셋 다 `divergent`로 끝났다. 구현(`prp-implement`)에는 착수하지 않았다.

| 라운드 | 시각 (UTC) | plan hash | 결과 |
|---|---|---|---|
| R0 | 2026-09-08T02:22:46Z | `sha256:1bf8698a…` | `divergent` · halt `5.2e` · 4관점 중 1 pass · wall 255,026 ms |
| R1 | 2026-09-08T02:41:10Z | `sha256:66827fd9…` | **반환 없음** — 세션이 SessionEnd marker 없이 사망. `l2.json`·`decision.json`·`proof.json` 0건, 리뷰 레코드 미갱신 |
| R1-retry | 2026-09-08T05:34:37Z | `sha256:66827fd9…` | `divergent` · halt `5.2e` · **4관점 전원 fail** · wall 271,048 ms |

R1-retry는 새 라운드가 아니라 **R1의 크래시 복구**다 — plan 본문을 한 글자도 고치지
않고 R1이 dispatch한 것과 **같은 hash**로 재발화했다. 그 판정은 사용자가 내렸다
(2026-09-08, §3.16 이탈).

산출물:

- 리뷰 레코드 `.claude/reviews/plan-review-review-record-linkage-m7.md`
  (`halt_stage:"5.2e"` · `rounds:3` · `receipt_hash:null`)
- R0 사본 `.claude/reviews/plan-review-review-record-linkage-m7-r0.md`
- receipt **미작성** — `.claude/receipts/mccp-plan-codex/`는 빈 상태다.
  위조하지 않은 것이 정직한 상태다(§3.12).

---

## 2. 라운드 예산이 종료적으로 소진됐다 (이 사이클의 지배적 사실)

```bash
$ node plugins/mccp/scripts/lib/review-rounds/cli.js status \
    --gate mccp-plan-codex --decision review-record-linkage-m7 --json
{"seal":{"found":true,"reason":"ok","cap":3,"mode":"enforce", …},
 "gate_id":"mccp-plan-codex","decision_id":"review-record-linkage-m7",
 "rounds_so_far":3, …}

$ grep -n 'MAX_ROUND_CAP\s*=' plugins/mccp/scripts/lib/review-single-pass.js
45:const MAX_ROUND_CAP = 3;
```

`counter.js:56`이 `roundsSoFar >= cap`에서 거부하므로, `MCCP_GATE_ROUND_CAP`을 **어떤
값으로 두어도** 이 슬러그로는 라운드가 더 열리지 않는다. 즉 흡수 후 재리뷰가 구조적으로
불가능하다.

§3.16이 원장 삭제를 정당한 행동 목록에서 뺐으므로 복구 경로도 없다. **예산을 다시 얻는
유일한 정당한 방법은 다른 decision slug다.**

### 캡 이력 (§3.16 이탈 기록 — plan 본문의 서술은 낡았다)

| 시점 | cap | 사유 |
|---|---|---|
| 기본 | 1 | `.claude/settings.json:12` · §3.16 "리뷰는 1라운드가 기본" |
| R1 개방 | 2 | plan `## Review Rounds` R1 절 — R0의 HIGH 4건이 유일 acceptance 오라클의 건전성을 겨냥했고 UI15가 흡수를 요구 |
| R1-retry 개방 | 3 | 이 사이클 — R1이 산출 0으로 크래시했고 본문 hash가 불변이라 재리뷰가 아니라 복구로 판정 |

plan의 R1 절은 "`MCCP_GATE_ROUND_CAP`을 1 → 2로 올려 R1 1회만 연다"로 적혀 있어 실제
이력(3라운드)과 어긋난다. R1-retry의 invariant 리뷰어가 이 불일치를 지적했고 그것은
옳다. plan 본문에 `## Cycle Outcome` 절로 정정을 실었다.

---

## 3. 패널이 옳았던 것 — 실측으로 확인한 두 건

### V1 — DD10의 대체 게이트는 판별력이 0이다 (HIGH · 3리뷰어 독립 동일 축)

architect#1 · security#1 · invariant#1이 서로를 보지 못한 채 같은 결론에 도달했다.
plan의 DD10은 초판 Task 0 축 1을 "관측 불가한 명제라 항상 통과했다"는 이유로 폐기하고
`REVIEW_DIR/plan-path`의 실재 + 내용 동등을 대체 게이트로 세웠는데, **그것도 똑같이
상수-참**이다.

```bash
# 캐시 1.33.6 본문: plan-path 는 플레이스홀더 두 줄뿐 — $REVIEW_DIR/plan-path write 0건
$ grep -n 'plan-path' ~/.claude/plugins/cache/mccp/mccp/1.33.6/commands/plan.md
660:  ' "$PRD_PATH" "<plan-path>"
717:  --plan "<plan-path>" \

# 같은 본문의 purge 목록은 l3-findings.json 에서 끝난다 — plan-path 를 지우지 않는다
$ sed -n '960,965p' ~/.claude/plugins/cache/mccp/mccp/1.33.6/commands/plan.md
rm -f "$REVIEW_DIR/codex-verdict" … "$REVIEW_DIR/l3-findings.json"

# 워크트리 본문: purge 와 write 가 같은 fenced 블록
$ grep -n 'REVIEW_DIR/plan-path' plugins/mccp/commands/plan.md
965:      "$REVIEW_DIR/l3-findings.json" "$REVIEW_DIR/plan-path"
977:printf '%s' "<plan path>" > "$REVIEW_DIR/plan-path"
```

따라서 양방향 모두 통과한다:

- **워크트리 세션** — purge → write → 검사. 자기가 방금 쓴 파일을 확인하는 **동어반복**이다.
  이 사이클의 R1-retry 실행이 정확히 그 형태였다.
- **캐시 세션** — purge도 write도 하지 않으므로 이전 워크트리 실행의 잔여 파일이
  살아남아 **역시 통과**한다.

plan의 "`REVIEW_DIR/plan-path`는 워크트리 본문만 쓰고 … env 주입으로 위조되지 않는다"
(`:238-240` · `:321-324`)는 *write* 축에만 참이고 검사가 보는 *existence* 축에는
거짓이다. 이 게이트는 Risks 표 1행이 지목한 **유일한 완화**이자 되돌릴 수 없는
자원(라운드 예산)의 유일한 보호 장치였다.

test#1이 같은 게이트의 다른 축을 더한다: 그 검사는 `## Files to Change` 9행 어디에도
없고(`commands/plan.md` 0건) `## Validation` 7블록에도 없다 — **착지처가 없는 산문**이다.

### V2 — plan의 사실표가 자기 이력과 어긋난다 (HIGH)

invariant#2: F8 · DD7 · Task 0 축 2가 근거로 삼는 `rounds_so_far: 0`이 이미 거짓이다.
Task 0 축 2는 "다른 값이면 인자가 틀린 것이다 — 캡을 올려 우회하지 않는다"고 적는데,
이 사이클은 정확히 그 우회를 두 번 했다.

### V3 — acceptance 도달 경로가 plan 자신의 제약 안에 없다 (HIGH · 위 둘의 합)

invariant#3. 이 사이클 종료 시점에 그 판정은 **기계적으로 확정**됐다(§2).

---

## 4. 새로 발견한 하네스 결함 (소유 축 미정 — 이 PRD 밖)

**크래시한 패널 dispatch가 복구 불가능하게 라운드 예산을 소모한다.**

원장은 dispatch 시점에 `classification:"emitted"`만 적고 **반환 여부를 추적하지 않는다**:

```json
{"index":1,"at":"2026-09-08T02:41:10.725Z","channel":"panel","classification":"emitted"}
```

R1은 이 줄을 남긴 뒤 산출물을 하나도 만들지 못하고 죽었다(`l2.json`·`decision.json`·
`proof.json` 0건 · 리뷰 레코드 두 파일 바이트 동일). 그런데도 예산에서 1이 영구 차감됐다.
`MAX_ROUND_CAP`이 3이므로 이런 크래시 3회면 그 decision의 게이트는 **영구히 닫히고**,
§3.16이 원장 삭제를 금지하므로 복구 경로가 없다.

후보 처방: 원장 엔트리에 완료 축(`returned`/`abandoned`)을 더해 `decideRound`가 미완료
dispatch를 예산에서 제외하거나, lease 형태로 미반환 라운드를 회수한다.

---

## 5. 기록한 곳 (유실 0)

R1-retry의 11개 finding을 [codex-findings-backlog.md](../../plans/codex-findings-backlog.md)에
적재했다 (R0 4행과 합쳐 이 plan 관련 15행). 파서 정합 확인:

```bash
$ node -e 'const {scanBacklog}=require("./plugins/mccp/scripts/derive/sources/backlog.js");
  const r=scanBacklog(process.cwd());
  console.log(JSON.stringify({ok:r.ok,count:r.count,invalid_count:r.invalid_count,degraded:r.degraded}))'
{"ok":true,"count":1478,"invalid_count":0,"degraded":false}
```

| Severity | 건수 | 내용 |
|---|---|---|
| HIGH | 5 | V1(3리뷰어 병합) · 착지처 부재 · V2 · V3 · §4 하네스 결함 |
| MEDIUM | 4 | 위조 비용(`printf` 1줄) · 보고서 경로 유출 · 두 경로 일치 test 부재 · Task 1 fail-closed가 기계 아님 |
| LOW | 2 | 관측 불가 acceptance 항목 · 검사 4의 `explicit_false` 모호성 |

MEDIUM 2건(두 경로 일치 test 부재 · Task 1 fail-closed)은 **R0에서 이미 이연된 축을 R1이
독립 재발견**한 것이다. 이연이 축을 닫지 않는다는 증거로 남긴다.

---

## 6. 열린 질문 / 관측

- **O1 — 슬러그를 바꾸면 UI2·UI4·DD7이 걸린다.** 예산을 다시 얻는 유일한 정당한 방법이
  새 슬러그인데, UI2는 브랜치 이름이 곧 ship 슬러그여야 한다고 정하고 UI4는 plan 경로를
  못박는다. DD7은 `/mccp:pr` 2.5.9의 체인 조회가 슬러그로 이뤄지므로 파일명이 일치해야
  한다고 적는다(M5의 실측 HALT). 새 슬러그는 이 셋을 다시 정하는 결정이며 사용자 소관이다.
- **O2 — DD10 축 자체가 성립하는지 재검토 대상이다.** "어느 본문이 실행 중인가"는 R0·R1
  두 라운드가 연속으로 "이 프로세스에서 관측 불가"라고 결론 낸 명제다. 초판(축 1)과
  대체안(DD10) 둘 다 상수였다. 다음 사이클의 선택지는 (i) 진짜 관측 가능한 신호를 찾거나
  (ii) 그 축을 접고 사후 증거(`--check-live-linkage`)에만 의존하는 것이다.
- **O3 — STATE.md body patch가 여전히 조용히 드롭된다** (M5가 backlog에 남긴 HIGH 재현).
  ```
  before: "review-record-linkage M3 — bidirectional"
  after : "review-record-linkage M3 — bidirectional"   # sw.update(root,{goal:"__PROBE__"}) 직후
  ```
  예외도 없고 반환 객체도 정상이다. frontmatter 축은 정상. §3.2가 직접 편집을 금지하므로
  세션 연속성 body를 갱신할 **합법 경로가 없고**, 그래서 이 보고서가 인계를 진다.
  소유 축은 `state-journal/`(multi-session-work-loop)이고 그 브랜치는 in-flight다.
- **O4 — PRD의 M5 `complete` 표기가 다시 앞선다.** plan DD5는 "M7이 머지되지 못하면 그
  표기는 다시 앞서 있게 되므로 그 경우 M7 보고서가 그 사실을 적는다"고 정했다. 이 줄이
  그 기록이다. M5 코드는 이 브랜치에 있고 아직 머지되지 않았다.
- **O5 — `install_plugins.json` sha256 불변** (UI8): 완주 전후 모두
  `26925fd8b72568ea12712e023985445c97567dff129c1f6bbdd8e4a21cab16fc`. 이 사이클은 설치
  상태를 바꾸지 않았다.
- **O6 — 예산 소진 사실은 이 워크트리 밖으로 나가지 않는다.** 원장
  `mccp-plan-codex__review-record-linkage-m7.json`은 `.gitignore:64`로 **ignored이고
  untracked**다. (`review-rounds/`의 tracked 15건은 CLAUDE.md F14대로 그 규칙 이전에
  커밋된 것들이고, tracked 파일에는 ignore가 적용되지 않는다.)

  ```bash
  $ git ls-files --error-unmatch .claude/state/review-rounds/mccp-plan-codex__review-record-linkage-m7.json
  Did you forget to 'git add'?
  ```

  귀결이 둘이고 **둘 다 다음 사이클이 알아야 한다**:

  1. 이 브랜치를 새로 체크아웃하거나 워크트리를 재생성하면 이 슬러그의 `rounds_so_far`가
     **0으로 관측된다**. §2가 말하는 "종료적 소진"은 *이 디스크*의 성질이지 브랜치의
     성질이 아니다.
  2. 따라서 워크트리를 지우는 것만으로 예산이 되돌아온다. **그것은 §3.16이 금지한 원장
     삭제와 기계적으로 구분되지 않는다** — `.gitignore`가 허용한다는 사실이 정당화가 되지
     않는다. 다음 사이클이 새 예산으로 진입한다면 그것은 *사고*가 아니라 **사유를 남긴
     명시적 결정**이어야 한다. 이 문단이 그 구분을 가능하게 하려고 있다.

  `.claude/state/plan-review/`(`.gitignore:173`)도 같아서 `l2.json`·`decision.json`은
  남지 않는다. 그래서 findings는 backlog(§5)에, 판정은 리뷰 레코드(git-tracked)에,
  서사는 이 보고서에 각각 이중화했다.

---

## 7. 다음 사이클 handoff

STATE.md 경로가 죽어 있으므로(O3) 인계는 여기다. 순서대로 읽어라.

1. **`review-record-linkage-m7` 슬러그로는 plan 게이트가 열리지 않는다.** 원장 3/3 ·
   `MAX_ROUND_CAP=3`. `MCCP_GATE_ROUND_CAP`을 올려 시도하지 마라 — 기계가 거부한다.
   **원장을 지우는 것은 §3.16이 금지한다.**
2. **먼저 O1을 사용자와 정하라.** 새 슬러그로 갈지, DD10 축을 접을지(O2), M7 범위를
   다시 그을지. 이 결정 없이 게이트에 진입하면 또 예산만 태운다.
3. **plan 본문을 고칠 때 V1·V2·V3를 흡수하라.** backlog의 2026-09-08 HIGH 5행이 근거와
   file:line을 갖고 있다. 특히 DD10의 대체 게이트는 **판별력이 없다는 것이 실측됐으므로**
   그대로 옮기지 마라.
4. **게이트 진입 전에 슬러그와 `rounds_so_far`를 반드시 실측하라.**
   ```bash
   node plugins/mccp/scripts/receipt/cli.js derive-decision --command mccp:plan --args "<칠 인자>"
   node plugins/mccp/scripts/lib/review-rounds/cli.js status --gate mccp-plan-codex --decision "<위 출력>" --json
   ```
   이것은 plan Task 0 축 2가 정한 절차이고, 그 절차 자체는 이번에 유효하게 작동했다 —
   진입 전에 `rounds_so_far:2`를 드러낸 것이 그것이다.
5. **§4의 하네스 결함은 이 PRD 밖이다.** 별도 축으로 열지 여부는 사용자 판단이며, 열기
   전까지는 크래시가 예산을 태운다는 사실을 안고 운영해야 한다.
6. **원장이 `rounds_so_far:0`으로 보이거든 예산이 회복된 것이 아니라 워크트리가 바뀐
   것이다** (O6). 그 상태로 그냥 진입하지 마라 — 이 보고서가 3라운드 소진의 기록이다.
   새 예산으로 갈 것이라면 사유를 남기고 가라.
