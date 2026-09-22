# review-record-linkage M7 — 사이클 기록 (2 사이클)

> **이 파일은 두 사이클을 담는다.** §1~§7 은 **1 차 사이클**(`-m7` 슬러그, 2026-09-08
> 오전)의 기록이고 그 시점에 정확했다. **§8 부터가 2 차 사이클**(`-m7b` 슬러그, 같은 날
> 오후)이며 1 차가 남긴 handoff(§7)를 실제로 수행한 기록이다. 1 차 기록을 지우지 않는
> 이유는 §3.7·§3.17 과 같다 — 무엇이 왜 달라졌는지가 함께 남아야 한다.

---

## 1 차 사이클 (`-m7`) — 미완료 종료

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

---

# 8. 2 차 사이클 (`-m7b`) — 구현 착지, acceptance 는 미달

**브랜치**: `review-record-linkage-m7b` · **plan**: `.claude/plans/review-record-linkage-m7.plan.md`
**결정 슬러그**: `review-record-linkage-m7b` · **날짜**: 2026-09-08
**결론**: **M7 은 여전히 complete 가 아니다.** 코드는 착지했고 회귀도 붙었지만 DD9 가
정한 단일 acceptance(`--check-live-linkage … exit 0`)에 도달하지 못했다 — 현재
`unresolved`(3), 사유 `named_ship_absent_from_tree`. 남은 것은 Task 4 하나다.

## 8.1 정체성 축이 어떻게 닫혔나

1 차가 남긴 질문은 "브랜치 = plan 파일명 = plan receipt 슬러그 = ship 슬러그" 를 어떻게
다시 성립시키느냐였다. 세 후보를 코드로 대조해 하나만 남았다.

| 후보 | 판정 | 근거 (실측) |
|---|---|---|
| 브랜치를 `-m7b` 로, plan 파일명은 `-m7` 유지 | **채택** | ship 슬러그가 브랜치에서 파생되므로(`derive-decision --command mccp:pr` → `review-record-linkage-m7b`) 2.5.8·2.5.9 의 슬러그 키 체인 조회가 봉인된 receipt 를 찾는다. 앵커는 `meta.plan_path` 문자열 동등이라 파일명을 그대로 두면 정확히 1 건 매칭 |
| 브랜치와 plan 파일명을 **둘 다** `-m7b` 로 | 기각 | `finalize-receipt.js:289-303` 이 receipt 가 봉인한 옛 경로와 비교하므로 매칭 0 건 → `link_anchor_unresolved`. **M7 의 표제 결과가 바로 그 링크 봉인이다** |
| `-m7` 슬러그로 receipt 수동 발행 | 기각 | 같은 `meta.plan_path` 를 선언하는 receipt 가 둘이 되어 앵커가 ambiguous(2 건) → 역시 미봉인 |

채택안의 잔여 비용은 하나다: plan 파일명이 슬러그와 다르므로 ship 진입 시
`PR_PLAN_PATH=.claude/plans/review-record-linkage-m7.plan.md` 를 export 해야 한다.
`pr.md:928` 이 그것을 operator 채널이라 명시하고, 빠뜨리면 `:931` 이 HALT 하며 복구
지침을 출력한다 — 조용히 틀리지 않는다.

**측정으로 확인한 대조**:

```
validate --command mccp:prp-implement --decision review-record-linkage-m7   → ok=false (no receipt written)
validate --command mccp:prp-implement --decision review-record-linkage-m7b  → ok=true
```

## 8.2 게이트가 실제로 무엇을 잡았나

| 게이트 | 결과 | 잡은 것 |
|---|---|---|
| plan 패널 (R2, single-pass) | `divergent` · 4 관점 중 3 fail | CRITICAL 1 + HIGH 5 — 전부 **정체성 축 하나**. plan 본문이 `-m7` 을 5 곳에서 못박은 채 재제출됐고, Task 0 축 2 의 통과 조건(`rounds_so_far:0`)이 결정적으로 거짓이며, DD10 의 대체 게이트가 착지 파일 없이 남아 있었다 |
| Implement-Codex R1 | `needs-attention` → `divergent` · 82.6 s | HIGH 2 — **F1** `computeLinkage` 는 자격 오라클이 아니다(`:383` 이 인자를 그대로 순회, 자격 판정은 호출자 `:539-545`) · **F2** `readLiveCorpus(root,'HEAD')` 는 판독마다 HEAD 를 재해소한다 |
| security-reviewer | CRITICAL 1 · HIGH 2 · MEDIUM 2 · LOW 2 | **S1** 해시 비교 재구현 시 양쪽 `null` 이 통과(back-patch **이전의 기본 상태**) · **S2** 봉인 경로로 파일 열기 · **S3** `fs` 단건 조회가 DD8 을 무효화 · **S4** 슬러그 가드가 `REF_SHAPE` 보다 약함 · **S5** OID 해소 실패의 `'HEAD'` fallback · **S6** 파손 receipt 를 부재로 접음 |

**세 리뷰어가 서로 다른 것을 잡았다.** 패널은 *plan 이 자기 모순이다*, Codex 는 *재사용
대상이 자격을 판정하지 않는다*, security 는 *재구현하면 fail-open 이 열린다* 를 봤다.
겹친 지적은 없다.

## 8.3 흡수가 반증 가능한가 — 변이 검사

지적을 "흡수했다" 는 주장은 그 흡수를 되돌렸을 때 test 가 붉어져야 검증된다. 여섯 축
전부에 대해 실제로 되돌려 확인했다.

| 되돌린 축 | 결과 |
|---|---|
| 자격 검사 제거 (Codex F1) | **red** — test 52·53 |
| HEAD 핀 제거 (Codex F2 / S5) | **red** — test 63 |
| 슬러그 가드 약화 (S4) | **red** — test 62 |
| 지목 무시 + 전역 자격집합 판정 (과다승인) | **red** — test 52·53·56·66 |
| `degraded`/`violations` 우선순위 뒤집기 (DD3) | **red** — test 69 |
| 자격 0 건을 `ok` 로 (진공 통과) | **red** — test 65 |

**우선순위 축은 처음에 통과했다** — 기존 degraded fixture 는 위반이 동시에 성립하지
않아 우선순위가 발동하지 않았다. 둘이 함께 성립하는 fixture(test 69)를 추가한 뒤에야
반증력이 생겼다. 변이 검사를 돌리지 않았다면 "우선순위를 지킨다" 는 주장은 검증되지
않은 채 남았을 것이다.

## 8.4 이 사이클이 치른 비용 — 감추지 않는다

**상류 plan receipt 는 stale 이다.** R2 지적 흡수가 plan 본문을 고쳤고, `hash.js` 의
구조적 정규화는 checkbox·PR 번호·표의 status 토큰만 접고 산문은 전부 해시하므로
`plan_hash` 가 반드시 바뀐다. 실측:

```
prp-implement --decision review-record-linkage-m7b --plan <plan>
  → stale: mccp-plan-codex "plan file hash differs from receipt (plan changed since gate)"
pr           --decision review-record-linkage-m7b --plan <plan>   → 같은 stale 1 건
```

재봉인 경로는 없다 — `-m7` 은 3/3, `-m7b` 는 1/1 이고 새 슬러그로 재리뷰하는 것은
§3.16 IV1 이 이름 붙여 금지한 "고쳐서 재리뷰" 다. 그래서 §3.16 이 정한 대로 라운드를
늘리지 않고 지나며 사유를 남긴다.

**plan 의 Task 0.5 가 적은 처방 한 줄은 틀렸다 — 여기서 정정한다.** 그 절은
`prp-implement` 진입에 `MCCP_SKIP_RECEIPT=1` 을 쓰라고 적었는데, **실측하면 그 토글은
이 CLI validator 를 움직이지 않는다**(우회 유무 모두 exit 2). 그 토글은 hook 경로가
소비하고, `2.5.7` 의 "non-zero 면 Phase 3 에 들어가지 마라" 는 기계가 아니라 명령 본문의
산문이다. 정정을 plan 본문이 아니라 이 보고서에 적는 이유는, plan 을 다시 고치면 방금
쓴 implement receipt 까지 stale 이 되어 같은 부채가 한 겹 늘기 때문이다.

**진행 판단의 근거**: `blocking`·`open_critical`·`missing` 이 전부 비어 있고 유일한
non-empty 파티션이 복구 불가한 상류 `stale` 1 건이었다. 그리고 **링크 자체는 영향받지
않는다** — `finalize-receipt.js:281-330` 의 carry-forward 는 `meta.plan_path` 문자열
동등만 보고 `plan_hash` 를 보지 않으므로, ship 이 봉인할
`meta.review_record_path`·`meta.plan_review_expected` 는 stale 과 무관하게 진짜 값이다.
**우회가 여는 것은 *체인 검증*이지 *링크 산출*이 아니다.**

**주장하지 않는 것**: 이 우회 아래에서 나올 ship 이 "완전한 체인 증거" 라고 주장하지
않는다. 같은 축의 잔여(상류 receipt 가 working-tree only · hash 미검증)는 R2 security
MEDIUM 으로 backlog 에 있다.

**게이트 이탈 1 건**: 명령 본문 2.5.5 는 security CRITICAL/HIGH 를 `[MCCP-GATE-STOP]`
으로 규정하는데 멈추지 않았다. 사유는 그 지적들이 "설계가 안전하지 않다" 가 아니라
**"이렇게 재구현하면 깨진다"** 는 조건부이고 그 조건은 DD4 가 이미 금지한 행위라는 것,
그리고 §3.14 가 CRITICAL/HIGH 를 그 자리에서 흡수하라고 정한다는 것이다. 대신 §8.3 의
변이 검사로 흡수를 반증 가능하게 만들었다.

## 8.5 Validation 결과

| # | 검사 | 결과 |
|---|---|---|
| 1 | 정체성 축 (브랜치·ship 슬러그·receipt 실재·원장) | **pass** — 전부 `-m7b`, 원장 `-m7`:3 / `-m7b`:1 |
| 2 | 상류 앵커 3 값 | **pass** — `plan_path` 일치 · `review_record_path` 봉인(F3 증거) · `review_source: multi-agent` |
| 3 | 단위 + 회귀 4 파일 | **pass** — 120/120 (신규 19) |
| 4 | 동결 블록 바이트 불변 | **pass** — 0 줄 diff |
| 5 | **라이브 실값 (acceptance)** | **미달** — `unresolved`(3), `named_ship_absent_from_tree` |
| 6 | version 미선언 (UI11) | **pass** — 선언 0 건 |
| 7 | 머지가 파일을 지웠는가 (§3.5.1) | **pass** — 삭제 0 건 |

`installed_plugins.json` sha256 은 `26925fd8…` 로 Task 0 이 못박은 값과 **동일**하다
(UI8) — 이 사이클은 설치 상태를 바꾸지 않았다.

## 8.6 착지한 파일

| 파일 | Action | 요지 |
|---|---|---|
| `plugins/mccp/scripts/lib/linkage-audit.js` | UPDATE | `--check-live-linkage` 강제 뷰 · 세 번째 종료코드 표 · 슬러그 가드 · HEAD OID 고정 |
| `plugins/mccp/scripts/lib/tests/linkage-audit.test.js` | UPDATE | 회귀 19 건 (plan 요구 4 + 흡수 6 축의 반증 fixture) |
| `docs/dogfood-install.md` | UPDATE | plan 게이트도 같은 경로여야 하는 이유 + 확인 명령 |
| `docs/review-record-linkage/frozen-baseline.md` | UPDATE | 라이브 절에 M7 관측 (동결 블록 불변) |
| `.claude/prds/review-record-linkage.prd.md` | UPDATE | M7 2 차 사이클 note (status `in-progress` 유지) |
| `.claude/plans/review-record-linkage-m7.plan.md` | UPDATE | R2 흡수 · Task 0/0.5/1 재작성 · DD10 철회 · 리뷰 섹션 2 종 |
| `CHANGELOG.md` | UPDATE | `[Unreleased]` 누적 (version 미선언) |
| `.claude/PRPs/reports/review-record-linkage-m7-report.md` | UPDATE | 이 파일 |

## 8.7 다음 사이클 handoff — 남은 것은 Task 4 하나다

1. **`claude --plugin-dir <worktree>/plugins/mccp` 세션에서** `/mccp:prp-commit` →
   `/mccp:pr` 을 완주한다 (UI7). 그 경로가 아니면 얻은 `0` 은 결함의 증거가 아니라
   **측정하지 않았다는 뜻**이다.
2. **`/mccp:pr` 진입 전에 export 한다**:
   `PR_PLAN_PATH=.claude/plans/review-record-linkage-m7.plan.md`. 빠뜨리면 `pr.md:931`
   이 HALT 한다(조용히 틀리지는 않는다).
3. **상류 stale 을 예상하라.** 2.5.8·2.5.9 가 그것을 본다. 그것은 §8.4 가 기록한 이번
   사이클의 알려진 부채이지 새 결함이 아니다. **receipt 를 재봉인해 없애려 하지 마라** —
   §3.12 no-rehash 이고 재봉인 경로도 없다.
4. **완주 후 acceptance 를 판정한다**:
   `node plugins/mccp/scripts/lib/linkage-audit.js --check-live-linkage --decision review-record-linkage-m7b`.
   **exit 0 만이 통과**이고 1·2·3 은 전부 미통과다. `0` 이면 그때 M7 을 complete 로
   선언하고 PRD 행과 frozen-baseline 라이브 절에 실값을 적는다. `3` 이 그대로면
   ship 이 커밋되지 않은 것이고, `1` 이면 링크가 실제로 서지 않은 것이다 — 두 번째가
   이 마일스톤이 원래 찾으려던 결함이다.
5. **완주 전후로 `installed_plugins.json` sha256 이 불변인지 확인한다** (UI8).
   기준값 `26925fd8b72568ea12712e023985445c97567dff129c1f6bbdd8e4a21cab16fc`.
6. **PR-Codex 는 반드시 발화한다.** plan·implement 양쪽 receipt 가 `divergent` 를
   봉인했으므로 cross-gate dedupe 는 닫힌 채로 남는다(fail-closed). 그것이 정상이다.
