# 패널 승인 품질 감사 (diverse-agent-review #11)

> #8이 답한 것은 "승인이 발급되는가"였고 답은 예였다 — converged 5건. 그 답이 생기자마자
> 이전에는 성립하지 않던 질문이 성립한다: **그 승인은 옳았는가.**
>
> 이 문서는 그 질문에 답한다. 도구(`approval-audit.js`)는 결속하고 세며, **판정은 여기서 한다**
> — M8 `quorum-calibration.md`가 세운 분업 그대로다.

**재현 명령**

```bash
node plugins/mccp/scripts/lib/plan-review/approval-audit.js            # 사람이 읽는 형태
node plugins/mccp/scripts/lib/plan-review/approval-audit.js --json     # 구조화 전문 (124,668 bytes)
```

측정 시각 2026-08-31 · 코퍼스 `records=38` (M8 동결 시점 35 · 이 milestone 착수 시점 37).
**코퍼스는 살아 있고 M8 문서는 스냅샷이다** — 이 문서가 그것을 대체하지 않으며, 두 문서는
서로 다른 시점의 서로 다른 사실이다.

---

## 1. 도구 출력 (축자 동결)

아래는 위 첫 번째 명령의 stdout **전문**이다. 절대 경로 1건(도구가 헤더에 찍는 실행
위치)을 `<repo-root>`로 redact한 것 외에는 편집하지 않았다 — §3.12 내구성 계약이 공개
이력에 로컬 경로가 실리는 것을 금지하고 `/mccp:pr` Phase 3.1 history-leak 게이트가 그것을
push 전에 fail-closed로 강제한다(2026-08-31 PR 게이트에서 실제로 차단됐고 이 줄이 그
해소다).

```text
approval audit (<repo-root>) — state=degraded
  coverage      : approved=5 auditable=4 unauditable=1
  proof_backing : corroborated=4 not_corroborated=1
  durability    : tracked=5 untracked=0
  ch report             : {"present":5} evidence_bearing=5 can_ground_absence=true
  ch backlog            : {"present":2,"absent":3} evidence_bearing=2 can_ground_absence=true
  ch downstream_reviews : {"absent":3,"present":2} evidence_bearing=2 can_ground_absence=true
  ch pr_codex           : {"structurally_empty":4,"absent":1} evidence_bearing=0 can_ground_absence=false
  ── codex-intent-context-m2 (.claude/reviews/plan-review-codex-intent-context-m2.md)
     anchor=on_disk scheme=structural revs=0
     proof_backing=corroborated durability=tracked approved_at=2026-08-15T03:31:00.883Z
     lenses=["architect","security","test","invariant"]
     channels=report:present backlog:present downstream_reviews:absent pr_codex:structurally_empty
     candidates=24
  ── impeccable-detection-contract-m6 (.claude/reviews/plan-review-impeccable-detection-contract.md)
     anchor=unauditable/unrecoverable scheme=structural revs=3
     proof_backing=no_ship_receipt durability=tracked approved_at=2026-08-23T12:40:46.234Z
     lenses=["architect","security","test","invariant"]
     channels=report:present backlog:present downstream_reviews:absent pr_codex:absent
     candidates=69
  ── multi-session-work-loop-m6 (.claude/reviews/plan-review-multi-session-work-loop-m6.md)
     anchor=on_disk scheme=structural revs=0
     proof_backing=corroborated durability=tracked approved_at=2026-08-15T18:10:05.530Z
     lenses=["architect","security","test","invariant"]
     channels=report:present backlog:absent downstream_reviews:present pr_codex:structurally_empty
     candidates=72
  ── santa-adjudication-m1 (.claude/reviews/plan-review-santa-adjudication-m1.md)
     anchor=on_disk scheme=structural revs=0
     proof_backing=corroborated durability=tracked approved_at=2026-08-16T12:37:33.053Z
     lenses=["architect","security","test","invariant"]
     channels=report:present backlog:absent downstream_reviews:absent pr_codex:structurally_empty
     candidates=9
  ── santa-adjudication-m2 (.claude/reviews/plan-review-santa-adjudication.md)
     anchor=on_disk scheme=structural revs=0
     proof_backing=corroborated durability=tracked approved_at=2026-08-17T05:52:56.874Z
     lenses=["architect","security","invariant"]
     channels=report:present backlog:absent downstream_reviews:present pr_codex:structurally_empty
     candidates=40

  This tool binds; it does not judge. No miss/false-approve verdict is emitted (DN2),
  and no ratio is reported (DN8).
```

stderr (경계를 침묵하지 않는다):

```text
[mccp:approval-audit]   not corroborated: impeccable-detection-contract-m6 — proof_backing=no_ship_receipt (the plan-gate receipt is gone; the ship receipt is the only independent witness)
[mccp:approval-audit] coverage: 1 of 5 approved record(s) are unauditable (reviewed body unrecoverable, path rejected, or no usable approval timestamp). They are NOT counted as "no defect found".
[mccp:approval-audit] channel "pr_codex" yielded evidence for 0 of 5 approved record(s) ({"structurally_empty":4,"absent":1}) — it was NOT looked through, so it cannot ground any claim of "no miss".
```

`--json`의 최상위 블록(축자):

```json
{
  "state": "degraded",
  "corpus_state": "ok",
  "corpus_records": 38,
  "read_error": false,
  "corpus_error": null,
  "parse_failures": 0,
  "coverage": { "approved": 5, "auditable": 4, "unauditable": 1 },
  "rejected": [],
  "proof_backing_summary": { "corroborated": 4, "not_corroborated": 1 },
  "durability_summary": { "tracked": 5, "untracked": 0 },
  "ship_receipts_indexed": 71,
  "ship_receipts_corrupt": 0,
  "history_scan_limit": 200
}
```

`records[].candidates`는 전체 **214행**이라 여기 싣지 않았다 — 생략했다는 사실을 적는 것이
생략 자체보다 중요하다. 전문은 위 `--json` 명령이 낸다. 판정에 실제로 인용한 행은 §4에 출처와
함께 축자로 옮겼다.

---

## 2. 감사 커버리지 — 5건 중 4건

| 레코드 | 앵커 | 시간축 | 감사 가능? |
|---|---|---|---|
| `codex-intent-context-m2` | `on_disk` | 2026-08-15T03:31:00.883Z | 예 |
| `multi-session-work-loop-m6` | `on_disk` | 2026-08-15T18:10:05.530Z | 예 |
| `santa-adjudication-m1` | `on_disk` | 2026-08-16T12:37:33.053Z | 예 |
| `santa-adjudication-m2` | `on_disk` | 2026-08-17T05:52:56.874Z | 예 |
| `impeccable-detection-contract-m6` | **`unauditable/unrecoverable`** | 2026-08-23T12:40:46.234Z | **아니오** |

`impeccable-detection-contract-m6`의 `reviewed_plan_hash`(`sha256:887fc89d…`)는 디스크의 현재
본문과도, 그 경로의 어떤 git 리비전(3건 순회)과도 일치하지 않는다. **패널이 무엇을 읽고
승인했는지 복구할 방법이 없으므로** G1(앵커) 관문을 판정할 수 없고, 이 레코드에서는 어떤
증거도 미탐으로 승격되지 않는다.

**이 1건을 분모에 넣어 "미탐 없음"을 세지 않는다.** 커버리지는 4/5이고, 그것이 이 감사가
말할 수 있는 전부다. 상한 소진(`history_limit_exhausted`)이 아니라 진짜 부재
(`unrecoverable`)임을 도구가 구분해 보고했으므로, "더 찾아보면 나올 수도 있다"가 아니라
"그 경로의 이력에 없다"이다.

---

## 3. 채널 지도 — 무엇을 실제로 보았는가

Acceptance가 요구하는 구분이 여기 있다: **"보았고 없었다"** 인가 **"볼 수 있는 채널이 비어
있었다"** 인가.

| 채널 | 상태 분포 | 증거를 낸 레코드 | 이 채널로 "미탐 없음"을 주장할 수 있나 |
|---|---|---|---|
| `report` | `present` 5 | **5 / 5** | **가능** — 이 감사의 유일한 실질 채널 |
| `backlog` | `present` 2 · `absent` 3 | 2 / 5 | 부분적 |
| `downstream_reviews` | `present` 2 · `absent` 3 | 2 / 5 | 부분적 |
| `pr_codex` | `structurally_empty` 4 · `absent` 1 | **0 / 5** | **불가능** |

### `pr_codex`의 0은 관측이 아니다

ship receipt가 해시로 결속된 **4건**은 전부 ship 시점에 Codex가 꺼져 있었다 — receipt
자신이 `meta.codex_disabled=true` · `resolution.codex_verdict='skipped'` · `findings=[]`로
그렇게 적는다. 그 0은 "Codex가 보았는데 결함이 없었다"가 아니라 **"Codex가 발화하지
않았다"** 이다.

**나머지 1건(`impeccable-detection-contract-m6`)은 다르고, 그 차이를 접으면 이 절이 막으려는
오독을 이 절 자신이 저지른다.** 그 레코드에는 리뷰된 본문을 봉인한 ship receipt가 **아예
없으므로**(§7), 그쪽 0은 Codex에 대해 아무것도 말하지 않는다 — 꺼져 있었다는 관측조차 아니다.
도구는 전자를 `structurally_empty`, 후자를 `absent`로 **나눠** 보고하고 어느 쪽도 카운터에
0으로 기여시키지 않는다. 위 표의 `structurally_empty` 4 · `absent` 1이 그 구분이다.

plan L2 패널의 `architect/HIGH`가 여기에 반론했다 — "전건이 같은 상태면 상시 켜진 상수라
정보를 나르지 않는다". **지적의 실질은 옳고 이 문서가 그것을 그대로 받는다**: 이 채널은 이
코퍼스에서 변별력이 0이며(`can_ground_absence=false`), 따라서 아래 §4의 어떤 판정도 이
채널에 기대지 않는다. 다만 범주는 구분한다 — 그 원칙은 *state 승격*에 대한 것이지 *보고*에
대한 것이 아니다. 보고를 없애면 0이 관측으로 오독되고, 그것이 정확히 막으려는 실패다.

### 판정 근거는 `report` 채널이다

4개 auditable 레코드 전부가 구현 보고서의 `## Deviations from Plan` ·
`## Issues Encountered` 절을 냈고, 그 절들은 **승인 시각 이후에**(전건
`recorded_after_approval=true`) **패널이 아닌 생산자**(구현자)가 쓴 git-tracked 기록이다.
G3이 요구하는 형태를 정확히 만족한다.

---

## 4. 레코드별 판정 — G1 · G2 · G3

관문(DN1): **G1** 결함이 리뷰된 본문에 실재하는가 · **G2** 그 실행에서 발화한 관점의 렌즈
안인가 · **G3** 승인 이후 다른 생산자의 기록에 적혀 있는가. 셋의 논리곱만 `miss`다.

### 4.1 `codex-intent-context-m2` — **miss 3건**

렌즈 4종 전부 발화(`architect` · `security` · `test` · `invariant`).

| 증거 (축자, 출처 `.claude/PRPs/reports/codex-intent-context-m2-report.md`) | G1 | G2 | G3 | 판정 |
|---|---|---|---|---|
| D2 "plan Task 5 (v)는 `$ADJUDICATION.tmp` 작성 후 rename이라고 적었으나, 같은 Task가 정한 `tools: [Write]`에는 rename 수단이 없다." | ✅ 리뷰된 plan 내부 모순 | ✅ architect/invariant | ✅ | **miss** |
| D3 "plan Task 12는 '단언 2건 동기'를 요구했으나, 그 파일은 … 이미 `MANIFEST_VERSION = require('.../plugin.json').version`으로 **파생**하도록 바뀌어 있었다" | ✅ plan이 저장소에 대한 낡은 사실을 주장 | ✅ test | ✅ | **miss** |
| D4 "`docs/multi-session-work-loop/instruction-contract.md`에 `S3.13.2` 행 1줄 추가 … Task 12의 §3.13.2 추가에 대한 **기계적 귀결**" | ✅ `Files to Change` 누락 | ✅ architect | ✅ | **miss** |
| D1 게이트 기록을 notes에 씀 (`prp-implement.md` 구조 결함, 2026-08-09 backlog 기등재) | ❌ 리뷰된 plan이 아니라 **명령 본문**의 결함 | — | — | `out_of_body` |
| D5 아카이브 목적지 불일치 (`completed/` vs `archived/`) | ❌ 명령 본문 | — | — | `out_of_body` |
| D6 PRD status를 `in-progress`로 남김 | ❌ 결함이 아니라 판단 | — | — | `not_evidence` |
| Issues 3건 (probe 순서 · 자기무력화 스캔 · 헬퍼 이름 충돌) | ❌ 구현 중 **생성**된 결함 | — | — | `post_approval` |

### 4.2 `multi-session-work-loop-m6` — **miss 4건**

렌즈 4종 전부 발화.

| 증거 (축자, 출처 `.claude/PRPs/reports/multi-session-work-loop-m6-report.md`) | G1 | G2 | G3 | 판정 |
|---|---|---|---|---|
| D9 "plan은 `decision_id = planBasename`만 규정하고 Plan 셀이 **plan 파일이 아닐 때**와 **PRD 기준 상대일 때**를 다루지 않았다. 실측에서 둘 다 나왔고 각각 **위양성 3건**과 **커버리지 누락 5행**을 만들었다" | ✅ 명세 공백이 실제 오계상을 낳음 | ✅ architect/test | ✅ | **miss (가장 무거움)** |
| D5 "plan Validation `node --test <디렉토리>` … 이 환경의 Node 24가 `MODULE_NOT_FOUND`로 거부한다" | ✅ plan이 지정한 검증 명령이 성립하지 않음 | ✅ test | ✅ | **miss** |
| D7 "plan 명세 11필드 → `adjudications[]` 추가 … 없으면 UI14 감사 표본이 '대조한 범위'를 확인할 수 없다" | ✅ 산출 명세가 자기 Acceptance를 지탱하지 못함 | ✅ architect/test | ✅ | **miss** |
| D8 "`opts.adjudicate` 추가 — plan이 요구한 '오라클이 throw하는 stub' 회귀를 고정할 유일한 방법" | ✅ plan이 요구한 회귀에 도달 수단을 안 줌 | ✅ test | ✅ | **miss** |
| D4 "5면 → **4면**. `i18n-surface.test.js`는 `plugin.json`에서 version을 **파생**한다" | ✅ §4.1 D3과 **같은 낡은 사실** | ✅ test | ✅ | **miss (§4.1 D3과 동일 사실 — 아래 C3)** |
| D1 base 트리 병합 · D2 version forward-only 상향 | ❌ 전자는 실행 판단, 후자는 plan Risks 표가 **사전 승인** | — | — | `not_evidence` |
| D3 게이트 기록 위치 · D10 아카이브 | ❌ 명령 본문 | — | — | `out_of_body` |
| Issues 1·2·3 (join key 축) | — | — | — | D9의 **귀결** — 같은 miss, 중복 계수하지 않음 |
| lint 주석 오탐 · 선재 red 3건 · 병렬 flake | ❌ 구현 중 생성 / 선재 | — | — | `post_approval` |

### 4.3 `santa-adjudication-m1` — **miss 1건**

렌즈 4종 전부 발화.

| 증거 (축자, 출처 `.claude/PRPs/reports/santa-adjudication-m1-report.md`) | G1 | G2 | G3 | 판정 |
|---|---|---|---|---|
| 1 "`santa-loop-cap.test.js` (미계획 파일 1건) — plan `Files to Change`에 없으나 세 단언이 M1의 변경에 **기계적으로 종속**된다" | ✅ `Files to Change` 누락 | ✅ test/architect | ✅ | **miss** |
| 2 plan-conflict detector 위양성 (`normalizePath`가 백틱을 안 벗김) | ❌ **도구** 결함 (별도 HIGH로 backlog 등재됨) | — | — | `out_of_body` |
| 3 notes 기록 · 4 아카이브 | ❌ 명령 본문 | — | — | `out_of_body` |
| 5 PRD Open Question 해소 표시 | ❌ 결함이 아님 | — | — | `not_evidence` |
| 6 "게이트 순서 위반 (제 실행 오류) — 2.5.6 receipt write가 Phase 3보다 뒤에 실행됐다" | ❌ 실행자의 절차 위반이지 plan 결함이 아님 | — | — | `out_of_body` |
| Issues (Codex 쿼터 · 라운드 0 프롬프트 결함 · coverage 23 단언 충돌) | ❌ 환경 / 실행 오류 / 구현 중 | — | — | `post_approval` |

### 4.4 `santa-adjudication-m2` — **miss 3건 · `out_of_lens` 1건**

**렌즈 3종만 발화**(`architect` · `security` · `invariant`) — **`test` 관점이 발화하지
않았다.** G2가 실제로 작동하는 지점이 여기다.

| 증거 (축자, 출처 `.claude/PRPs/reports/santa-adjudication-m2-report.md`) | G1 | G2 | G3 | 판정 |
|---|---|---|---|---|
| 1 "`santa-loop-cap.test.js`를 편집했다 (plan `Files to Change` 밖) … M2가 명세한 동작 변경이 그 파일의 세 단언을 **필연적으로** 거짓으로 만든다" | ✅ `Files to Change` 누락 | ✅ architect | ✅ | **miss** |
| 2 "plan Task 1은 '`kind` 부재 행은 스키마 검증에 넘긴다'라 적고 커버리지 31은 '`kind` 부재 행은 `malformed`가 된다'고 적는다. **둘이 동시에 참이려면** 스키마가 태그를 요구해야" | ✅ plan 내부 두 절의 모순 | ✅ invariant | ✅ | **miss** |
| 3 "plan Task 2는 'export하지 않는다'고 적었으나, 그 문장의 근거로 든 것은 순환 회피뿐 … export하지 않으면 규칙을 베껴야 하고 그것은 plan Task 1이 금지한 바로 그 형태다" | ✅ plan 자기 규칙끼리의 충돌 | ✅ architect/invariant | ✅ | **miss** |
| 4 "커버리지 60 (b)가 요구하는 `issueId` 유실 runtime 가드는 **정상 경로에서 도달 불가**다 … 직접 호출로 두면 그 가드는 **반증 불가능한 방어 코드**가 된다" | ✅ plan이 반증 불가능한 요구를 담음 | ❌ **`test` 관점이 발화하지 않았다** | ✅ | **`out_of_lens`** |
| 5 escalation 출력 위치 (exit 75에도 "round cap reached"를 찍던 기존 배치) | ❌ `santa-loop.md`의 선재 결함 | — | — | `out_of_body` |
| Issues: slug 어긋남 (PRD 경로 호출 vs plan 경로 파생) | ❌ 게이트 인프라 | — | — | `out_of_body` |
| Issues: M1 항목 18 키 집합 단언 갱신 | ✅ 기계적 귀결 (1번과 같은 부류) | ✅ architect | ✅ | 1번에 포함 — 중복 계수하지 않음 |

---

## 5. 판정 요약

**답은 "미탐 없음"이 아니다.** 감사 가능한 4건 **전부**에서 미탐이 발견됐다.

| 레코드 | 판정 | miss |
|---|---|---|
| `codex-intent-context-m2` | **miss** | 3 |
| `multi-session-work-loop-m6` | **miss** | 4 |
| `santa-adjudication-m1` | **miss** | 1 |
| `santa-adjudication-m2` | **miss** | 3 (+ `out_of_lens` 1) |
| `impeccable-detection-contract-m6` | **`unauditable`** | 판정 불가 |

**비율은 적지 않는다** (DN8 · UI9). 표본은 4이고, 재실행 덮어쓰기(O3) 생존 편향의 방향이
불분명하며, 코퍼스 커버리지는 하한이다. 위 숫자는 **관측 빈도**이고 확률이 아니다.

### 미탐은 무작위가 아니라 한 종류로 몰린다

11건을 유형으로 접으면 다섯이 되고, 그중 셋이 반복된다.

| 유형 | 건수 | 레코드 수 | 내용 |
|---|---|---|---|
| **C1 `Files to Change` 누락** | 3 | 3 | 변경이 **기계적으로 강제**하는 파일(대부분 그 변경을 검사하는 test)을 plan이 열거하지 않았다 |
| **C2 plan 내부 모순** | 3 | 2 | 한 Task의 절차가 같은 plan의 다른 조항·자기 도구 권한과 충돌한다 |
| **C3 저장소에 대한 낡은 사실** | 2 | 2 | **같은 오류가 두 패널을 각각 통과했다** — `i18n-surface.test.js`가 version을 파생한다는 사실을 두 plan이 모두 몰랐다 |
| **C4 명세 공백이 오계상을 낳음** | 2 | 1 | 경계 케이스 미규정이 위양성 3건 + 커버리지 누락 5행으로 실현됐다 |
| **C5 환경에서 성립하지 않는 Validation** | 1 | 1 | plan이 지정한 검증 명령이 이 환경의 Node에서 거부된다 |

**C3이 이 감사에서 가장 무거운 관측이다.** 서로 다른 시점의 서로 다른 두 패널이 **같은 낡은
사실**을 통과시켰다. 이는 개별 실행의 운이 아니라 **패널이 구조적으로 못 보는 축**이 있음을
시사한다 — 리뷰어는 plan 본문을 읽지만 그 본문이 저장소에 대해 주장하는 사실을 **대조하지
않는다**. C1도 같은 성질이다: `Files to Change`가 완전한지는 plan만 읽어서는 판정할 수 없고
저장소와 대조해야 한다.

C2는 성질이 다르다 — plan 본문만 읽어도 판정 가능한 **내부 모순**이고, 그것을 놓친 것은
사거리 밖이 아니라 사거리 안의 미탐이다.

### 처방은 이 milestone의 범위가 아니다

#11은 **관측 milestone**이다(DN11 · UI11). 위 유형이 시사하는 조치 — 리뷰어에게 저장소 대조
능력을 주는 것, `Files to Change` 완전성의 기계 검사, plan 내부 모순 lint — 는 전부 **게이트
배선 변경**이고 UI5가 그것을 #5(오라클 추출) 뒤로 못박는다. 이 문서는 근거를 남기고 멈춘다.
"보고만 하고 끝"이 아니라 **범위가 관측까지**인 것이다.

---

## 6. 해시 사슬 — 미탐과 다른 축

`hash_chain`은 `reviewed → ship → current` 3점을 본다. 미탐(패널이 못 본 결함)과 **다른
종류의 결함**(승인의 대상이 승인 후 바뀌었다)이므로 같은 칸에 섞지 않는다.

관측: **auditable 4건 전부 `edited_after_approval=false`**이고 `proof_backing=corroborated`다.
즉 패널이 승인한 본문과 ship된 본문이 같다. `impeccable-detection-contract-m6`만
`proof_backing=no_ship_receipt`이며 `edited_after_approval`은 `null`(판정 불가)이다.

### plan DN10의 정정

plan DN10은 그 레코드를 두고 "리뷰 해시와 ship 해시가 **다르다** — 승인 대상이 승인 후
바뀌었다"고 적었다. **그 판정 자체가 잘못된 결속의 산물이다.**

레코드 파일명은 `plan-review-impeccable-detection-contract.md`이고 그 이름으로 slug를 뽑으면
`impeccable-detection-contract`가 된다. 그 이름의 ship receipt는 **존재한다** — 다만 그
`plan_hash`(`sha256:c7d1d27d…`)는 이 레코드의 `reviewed_plan_hash`(`sha256:887fc89d…`)와
다르고 애초에 **다른 plan의 봉인**이다. 이름으로 결속하면 다른 plan의 receipt를 끌어와
"해시가 다르다"는 결론에 도달한다.

해시로 귀속하면 정직한 서술은 **"그 리뷰된 본문을 봉인한 ship receipt가 아예 없다"**
(`no_ship_receipt`)이지 "본문이 바뀌었다"가 아니다. 이 함정은 가설이 아니라 이 코퍼스에
실재하며, Implement-Codex R1 F1이 독립적으로 같은 형태를 지목했다. 도구는 전 ship receipt를
`plan_hash`로 색인해 해시가 일치하는 것만 증인으로 인정하고(`attribution:'hash_proven'`),
나머지 채널은 원리상 slug 귀속뿐이므로 `slug_claimed`로 **표기**한다.

---

## 7. `state=degraded`가 가리키는 것

`state != blind`만으로는 통과가 아니다. 무엇이 degrade시켰는지 지목하고 판정한다.

**원인은 정확히 하나**: `impeccable-detection-contract-m6`의 `proof_backing`이
`no_ship_receipt`다(파싱 실패 0 · `rejected` 0 · `read_error` false).

이것은 배경 소음이 아니라 **감사 결과 자체**다. 승인의 `review_proof`는 plan-gate
receipt에만 실렸고 `.claude/receipts/mccp-plan-codex/`는 worktree-only라 그 5건 분이 남아
있지 않다(현재 그 디렉토리에 있는 유일한 파일은 이 milestone 자신의 게이트가 방금 쓴
`diverse-agent-review-m11.json`이다). 남은 유일한 독립 증인이 git-tracked ship receipt인데,
이 레코드에는 그것도 없다. 즉 **이 승인 레코드가 정말 그 게이트 실행이 쓴 것인지 보증할
독립 증인이 0이다.**

`degraded`는 그 사실의 정직한 이름이다. 나머지 4건은 서로 다른 시점에 서로 다른 writer가
같은 본문을 봉인했으므로(레코드의 `reviewed_plan_hash` == ship receipt의 `plan_hash`)
사후 수기 작성 가능성이 크게 줄어든다 — **다만 이것은 해시 한 값의 교차 확인일 뿐 전사
전체의 무결성 증명이 아니다.** quorum 블록·findings 표·Refutation 표는 여전히 무증인이다.

---

## 8. 답하지 않은 것

- **비율을 산출하지 않는다** (DN8). 표본 4, 생존 편향 방향 불명, 커버리지 하한. "false-approve
  비율"은 PRD Open Questions의 표현이지 이 milestone이 산출할 수 있는 양이 아니며, **그 사실
  자체가 산출물의 일부다.**
- **`review_proof` 구조 검증은 이 코퍼스에서 수행 불가하다** (DN9). fan-out `security/HIGH`가
  `isReviewProofStructurallyValid` 호출을 요구했으나 그 객체는 plan-gate receipt에만 실리고
  그 디렉토리는 이 5건에 대해 부재이며, 리뷰 레코드에 `review_proof`/`dispatch_evidence`
  문자열은 0회 등장한다. **인자를 구성할 수 없다.** 대신 레코드의 `## Measurement` quorum
  블록은 실재하므로 그것을 의미 검증한다(5건 전부 통과 — 자기 측정이 부인하는 승인 0건).
- **Codex를 켜서 5건을 다시 보게 하지 않았다** (DN4). 그것은 정답지가 아니라 **새 의견**이다.
  지금의 리뷰어는 그때의 리뷰어가 아니고(모델·프롬프트·저장소 상태가 전부 다르다), 그 5건은
  Codex가 꺼진 채 생산됐으므로 켠 채 얻은 판정은 같은 실험의 대조군도 아니다.
- **패널을 재실행하지 않았다** (DN5). 같은 본문에서 다시 승인이 나면 "패널이 옳다"가 아니라
  "패널이 재현적이다"이고, 다르게 나오면 승인 품질이 아니라 분산을 잰 것이다. 게다가
  재실행은 O3(레코드 덮어쓰기)로 **감사 대상을 파괴**한다.
- **미탐 판정 자체는 기계화되지 않았다.** G1의 앵커 복구와 G3의 시각 순서는 도구가 결속하지만,
  "이 서술이 정말 결함인가"(G2의 실질)는 산문이라 사람이 읽었다. 완화는 도구가
  `candidates` **전건**을 출처와 함께 내는 것이다 — 체리피킹은 막지 못하나 누락은 사후
  대조로 드러난다. 위 §4의 각 행은 그 214행 중 하나를 축자로 옮긴 것이다.
- **`untracked` 레코드는 0이었다** — 즉 이 감사는 재현 가능하다. 이는 plan L2 패널의 CRITICAL
  2건("`.claude/reviews/`가 worktree-only라 감사가 재현 불가")에 대한 **측정된 답**이다.
  `.gitignore:154`가 무시하는 것은 `.claude/state/plan-review/`(per-invocation IPC)이고, 같은
  주석 `:149-152`가 `.claude/reviews/plan-review-<slug>.md`를 DURABLE record로 지목한다.

---

## 9. M8 문서와의 관계

`quorum-calibration.md`는 `records=35` 시점의 **스냅샷**이고 이 문서는 `records=38` 시점이다.
이 문서가 그것을 대체하지 않는다 — 두 문서는 서로 다른 질문에 답한다(M8: 승인이 발급되는가 ·
M11: 그 승인이 옳았는가). 코퍼스가 살아 있다는 사실 자체가 도구를 상수 대신 재스캔으로 만든
이유이며, 승인 5건이라는 수는 다음 승인이 나오면 늘어난다.
