# 측정 가능성 부록 — 실측 근거와 소급 recoverability 프로토콜

STATUS: PROVISIONAL — corpus 기준일 2026-07-22

> 본 문서는 **가용성층**이다. 어느 소스가 *지금* 쓸 만한지의 관측 기록이며 약속이 아니다.
> 계약층([measurement-design.md](./measurement-design.md) · [label-protocol.md](./label-protocol.md) ·
> [large-cohort-registry.md](./large-cohort-registry.md))은 FROZEN이지만 이 문서는 아니다.
> **re-freeze 게이트**: `durable-evidence-substrate` chore와 ledger 승인 술어 정정이 착지한 뒤
> 본 문서를 재산출·재기록하기 전에는 M2(관측 계측)를 착수하지 않는다.

## 1. 왜 이 문서가 있는가

PRD는 *"약 125건의 게이트 증거와 105건의 PR 이력이 쌓여 있는데 데이터는 있는데 판정을 안 한다"* 고 적었다. 실측 결과 **그 전제가 틀렸다** — 건수는 있으나 C계열 지표가 필요로 하는 필드가 채워진 적이 없다. 따라서 "왜 아직 계산 안 했나"가 아니라 "무엇이 계산 가능한가"부터 확정해야 한다.

동시에 반대 방향의 성급함도 막아야 한다. 구조화 필드가 비었다는 것이 곧 소급 불가는 아니다 — findings는 PR body 산문으로 존재한다. 그래서 §4에 **프로토콜과 사전 임계**를 두고, 임계 미달일 때만 불가로 확정한다.

## 1.5 재현성 계약 (Implement-Codex IF1 흡수)

아래 §2의 수치는 **fresh clone에서 재현되지 않는다.** `.claude/receipts/`가 gitignored이기 때문이다 — 실제로 이 문서를 처음 쓸 때(2026-07-22) receipt는 121건이었으나 같은 날 재측정 시 122건이었다. 다른 세션의 게이트가 코퍼스를 바꿨다. 코퍼스는 재현 가능한 계산 대상이 아니라 **움직이는 로컬 상태**다.

따라서 §2의 수치는 산문 안에 흩어두지 않고 [evidence-snapshot.json](./evidence-snapshot.json)에 **단일 출처로 고정**했다. FROZEN 계약([measurement-design.md](./measurement-design.md) · [label-protocol.md](./label-protocol.md) · [large-cohort-registry.md](./large-cohort-registry.md))이 인용하는 모든 수치는 그 스냅샷의 관측값이며, 산문의 숫자와 스냅샷이 어긋나면 **스냅샷이 정답**이다.

- 스냅샷 파일: [evidence-snapshot.json](./evidence-snapshot.json)
- 관측 시점: 2026-07-22, main worktree
- `reproducible_in_fresh_clone: false` — 명시적으로 기록된 한계다

**이것이 FROZEN 계약을 감사 불가능한 코퍼스에 앵커한다**는 Codex 지적은 타당하다. 완전한 해소는 `durable-evidence-substrate` chore Phase A(ship receipt를 git-tracked로)가 착지해야 가능하며, 그때 ship 축(§2.6)은 재현 가능해진다. plan/implement receipt는 그 뒤에도 working-tree only다. 스냅샷은 그 중간 상태에서 계약이 참조할 **불변 기준점**을 제공한다 — 코퍼스가 다시 움직여도 FROZEN 계약은 이 스냅샷을 가리킨다.

## 2. 실측 — 스냅샷의 관측값 (각 수치는 아래 명령으로 그 시점에 산출됐다)

### 2.1 receipt 코퍼스의 구조화 필드 공백

| 항목 | 실측 |
|---|---|
| 파싱 가능 receipt (3 게이트) | 122건 |
| `findings` 보유 | **1건** (최대 3개) |
| `resolution.accepted`·`rejected` 모두 빈 배열 | **121건** |
| `resolution.codex_verdict` 부재 | **90건** (v1.20.3 이전 작성분) |

> 이 표의 값은 [evidence-snapshot.json](./evidence-snapshot.json)의 `receipts.*`와 **기계 검증된다**(Validation CHECK 2d). 산문과 스냅샷이 어긋나면 검사가 실패하므로, §1.5의 "스냅샷이 정답" 규칙이 선언이 아니라 강제다. 초판은 이 표가 121/120으로 굳어 있었고 스냅샷은 122/121이었다 — PR-Codex R1 F2가 잡았다.

```bash
node -e '
const fs=require("fs");
const gates=["mccp-plan-codex","mccp-implement-codex","mccp-pr-codex"];
let total=0,withFindings=0,emptyRes=0,noVerdict=0;
for(const g of gates){
  for(const f of fs.readdirSync(".claude/receipts/"+g).filter(x=>x.endsWith(".json"))){
    let j; try{ j=JSON.parse(fs.readFileSync(".claude/receipts/"+g+"/"+f,"utf8")); }catch(e){ continue; }
    total++;
    const r=j.resolution||{};
    if((j.findings||[]).length) withFindings++;
    if(!(r.accepted||[]).length && !(r.rejected||[]).length) emptyRes++;
    if(!r.codex_verdict) noVerdict++;
  }
}
console.log({total,withFindings,emptyRes,noVerdict});'
```

### 2.2 시간축 anchor — receipt는 스스로 언제인지 모른다

receipt 스키마에 timestamp 필드가 **없다**. 유일한 시간 단서는 git SHA인데:

| anchor | 도달 가능 | 용도 |
|---|---|---|
| `head_sha` | **0 / 122** | 사용 불가 — squash-merge가 feature 커밋을 폐기했다 |
| `base_sha` | **122 / 122** | 하한 anchor로만 사용 가능 (2026-06-03 ~ 2026-07-21) |

즉 receipt를 버전·시기별로 층화하려면 `base_sha`의 커밋 날짜를 써야 하며, 이는 "receipt가 그 시점 *이후*에 작성됐다"는 하한만 준다.

```bash
node -e '
const fs=require("fs"),cp=require("child_process");
let head={ok:0,gone:0}, base={ok:0,gone:0};
for(const g of ["mccp-plan-codex","mccp-implement-codex","mccp-pr-codex"]){
  for(const f of fs.readdirSync(".claude/receipts/"+g).filter(x=>x.endsWith(".json"))){
    const j=JSON.parse(fs.readFileSync(".claude/receipts/"+g+"/"+f,"utf8"));
    for(const [k,acc] of [["head_sha",head],["base_sha",base]]){
      if(!j[k]) continue;
      try{ cp.execSync("git cat-file -e "+j[k]+"^{commit}",{stdio:"ignore"}); acc.ok++; }catch(e){ acc.gone++; }
    }
  }
}
console.log({head,base});'
```

### 2.3 findings의 실소재지 — PR body 산문

| 항목 | 실측 |
|---|---|
| 머지된 PR | 108건 (2026-06-03 ~ 2026-07-21) |
| `## Codex Review` 섹션 보유 | 97건 |
| "YAGNI Triage" 문자열 보유 | 46건 |
| **canonical 표 형식으로 기계 파싱 가능한 행** | **2행** |

findings는 소실된 것이 아니라 **구조화되지 않은 채 존재**한다. 46건이 triage를 했다고 적었지만 명령 템플릿의 표 형식과 일치하는 행은 2개뿐이다 — 형식 drift가 자동 집계를 막는다.

### 2.4 후속수정 지연 분포 — 결함 정의의 형태를 바꾼 실측

파일 겹침 기준으로 "PR_i 이후 같은 파일을 건드린 첫 PR"까지의 지연:

| 통계 | 값 |
|---|---|
| 대상 pair | 101 |
| p50 | 0.23일 |
| p75 | 0.53일 |
| p90 | 1.71일 |
| p95 | 3.80일 |
| 최대 | 20.21일 |
| 누적 ≤1일 | 88건 (87.1%) |
| 누적 ≤7일 | 100건 (99.0%) |
| 누적 ≤30일 | **101건 (100%)** |

**해석**: 이 저장소에서 파일 겹침은 결함 신호가 아니라 정상 순차 작업의 기본 상태다. 어떤 창 W를 골라도 "겹침 = 결함" 정의는 전 이력을 결함으로 분류한다. 이 반례가 [label-protocol.md](./label-protocol.md)의 결함 정의를 결정했다.

### 2.5 판별 신호 base rate

| 신호 | 건수 |
|---|---|
| PR title `fix(` 접두 | 15 / 108 (13.9%) |
| PR title `revert` 접두 | **0 / 108** |
| conventional prefix 분포 | feat 71 · fix 15 · chore 12 · docs 5 · release 1 · 없음 4 |

`revert`가 0건이라는 것은 판별 기준으로서 revert 축이 이 코퍼스에서 표본을 만들지 못한다는 뜻이다.

### 2.6 completion-ledger — 링크는 완비, 판정은 무신호

| 항목 | 실측 | 함의 |
|---|---|---|
| 엔트리 수 | 29 | |
| `verdict` 값 분포 | **`converged` 29 / 29** | 값이 하나뿐 → **판별력 0** |
| ship receipt와 대조 가능 | 10 | |
| 대조 결과 일치 | 7 | |
| **대조 결과 불일치(거짓 양성)** | **3** | `divergent` 1 · `skipped` 2 |
| ship receipt 소실로 대조 불가 | 19 | 영구 손실 |
| 역방향 — ledger 엔트리 없는 ship receipt | **23 / 33** | ledger는 ship의 완전한 기록이 아니다 |

근본 원인은 `plugins/mccp/scripts/lib/completion-ledger/index.js`의 append 게이트가 `resolution.converged`(v1.20.3이 dedupe 축에서 이미 신뢰 불가로 판정한 always-true 필드)를 보고 `resolution.codex_verdict`를 보지 않는 것이다. `codex_verdict`는 completion-ledger 전체에서 **한 번도 참조되지 않는다**.

```bash
node -e '
const fs=require("fs");
const LD=".claude/state/completion-ledger", RD=".claude/receipts/mccp-pr-codex";
let conv=0,ok=0,fp=[],missing=0,total=0;
for(const f of fs.readdirSync(LD).filter(x=>x.endsWith(".json"))){
  const e=(JSON.parse(fs.readFileSync(LD+"/"+f,"utf8")).entry)||{}; total++;
  if(e.verdict!=="converged") continue;
  conv++;
  const rp=RD+"/"+e.decision_id+".json";
  if(!fs.existsSync(rp)){ missing++; continue; }
  const cv=(JSON.parse(fs.readFileSync(rp,"utf8")).resolution||{}).codex_verdict;
  if(cv==="converged") ok++; else fp.push(e.decision_id+" -> "+cv);
}
console.log({total,conv,ok,false_positive:fp.length,unauditable:missing});
fp.forEach(x=>console.log("  "+x));'
```

### 2.7 본 PRD 최초의 *측정된* 게이트 실효 사례

§2.6은 단순한 데이터 품질 문제가 아니다. PRD는 C계열을 두고 *"검사가 실제로 맞았는지 한 번도 측정된 적이 없다"* 고 적었는데, **여기 하나가 있다**:

- ship 승인 술어의 통과율: **100%** (29/29)
- 대조 가능한 것 중 실제로 틀린 비율: **30%** (3/10)

이것은 C2(게이트 헛발화율)와 같은 축은 아니다 — C2는 "차단했는데 실질 수정이 없었나"를 묻고, 이 사례는 "통과시켰는데 통과시키면 안 됐나"를 보인다. 오히려 C3(누출 결함율)의 구조에 가깝다. 다만 두 지표 어느 쪽으로도 **아직 계상하지 않는다** — 표본이 10건이고 단일 게이트이며, C2·C3은 라벨 프로토콜 확립 전 의사결정에 사용 금지이기 때문이다(PRD anti-gaming 규칙). 여기서의 용도는 **측정 설계가 왜 필요한지의 실증** 하나다.

### 2.8 그 밖의 소스 현황

| 소스 | 실측 | 상태 |
|---|---|---|
| `codex-findings-backlog.md` 데이터 행 | 6 | 표본 부족 |
| PR 이력 (gh) | 108건, `mergedAt`+files 완비 | 사용 가능 |
| 환경 토글 | 코드 96 / CLAUDE.md 55 / ENVIRONMENT.md 38 / 문서 union 82 | B3 즉시 산출 가능 |
| `context-current.json` | **미존재** | A2 소스 없음 |
| session ledger | **0건** | A4 소스 없음 |
| CLAUDE.md | 782줄 · 139,335 바이트 | A3 baseline은 tokenizer 필요(§5) |

## 3. 계열별 소급 판정 (현 corpus 기준)

| 지표 | 판정 | 근거 |
|---|---|---|
| A1 작업 완주율 | **forward-only** | ledger 링크 필드는 유효하나 ship 기록이 불완전(23/33 미기록)하고 `verdict` 판별력 0(대조 10건 중 3 false positive)이라 대조 소스로 불가. §4는 C1 전용이라 A1 recovery 절차가 없다 → **소급 baseline을 만들지 않고** M2가 착수·종료 이벤트로 전향 수립(measurement-design.md A1, Codex R3 F2) |
| A2 세션 종료 컨텍스트 잔여 | **불가** | 텔레메트리 자체가 없다(`context-current.json` 미존재). 프로토콜 대상 아님 |
| A3 상시 지시문 점유율 | **`baseline-unavailable`** | 방법은 freeze됐으나 분자 3성분 중 둘(MEMORY.md user-level 경로 · STATE.md 런타임 블록)이 fresh clone 재현 불가 → M2가 주입 payload를 계측해야 baseline 확정(measurement-design.md A3 실행 규칙, R2-F3) |
| A4 세션 경계 복원율 | **불가** | session ledger 0건. 인계 항목 이벤트가 기록된 적 없음 |
| B1 진행 상태 drift | **부분** | 문서 status는 읽을 수 있으나 독립 증거 소스가 ledger인데 무신호 |
| B2 동시 세션 충돌 사고 | **불가** | 동시 세션 쌍 기록이 존재하지 않음. 분모 0 |
| B3 활성 축 수 | **가능** | 오늘 산출됨 (96 / 82 / 실사용 이력은 M2) |
| C1 피드백 폐쇄율 | **`recoverability-undetermined`** | §4 프로토콜 미실행 — C계열 중 유일한 프로토콜 대상 |
| C2 게이트 헛발화율 | **forward-only** | [label-protocol §4.2](./label-protocol.md)가 전향 귀속 기록 전 산출 금지로 확정 — 프로토콜 대상 아님 |
| C3 누출 결함율 | **forward-only** | [label-protocol §2.2](./label-protocol.md)가 소급 불가로 확정(revert 0 · 귀속 미기록) — 프로토콜 대상 아님. fix-title-proxy만 별도 보고 |

**C계열의 소급 지위는 지표마다 다르다** (§4.0과 정합):

- **C1** — `recoverability-undetermined`. PR body 산문 97건이 미탐색 소스로 남아 있어, §4 프로토콜을 실행해 임계에 미달할 때만 불가가 확정된다. C계열 중 유일하게 소급 프로토콜 대상이다.
- **C2·C3** — 프로토콜 대상이 **아니다**. §4.0대로 C3은 [label-protocol.md §2.2](./label-protocol.md)가 소급 불가로 이미 확정했고(revert 0 · 귀속 미기록), C2는 [label-protocol.md §4.2](./label-protocol.md)가 전향 계측 전 산출 금지로 확정했다. 따라서 §3 표는 C2·C3에 **`forward-only`** 라벨을 쓰고 `recoverability-undetermined`는 **C1에만** 남긴다. 초판은 셋 다 `recoverability-undetermined`로 적고 "C2·C3의 경우 이 라벨을 다르게 읽으라"는 주석으로 정합화했는데, 같은 라벨에 두 뜻을 얹는 것은 계약이 아니라 각주다 — 계약층인 [measurement-design.md](./measurement-design.md)에는 그 각주가 없어 실제로 어긋나 있었다(PR-Codex R2 F2). 라벨을 나누면 재해석이 필요 없다.

즉 M2에게 주는 지시는 하나다: **소급 프로토콜은 C1에만 돌리고, C2·C3은 전향 계측을 기다린다.**

## 4. 소급 recoverability 프로토콜

### 4.0 프로토콜 적용 대상 — C3 제외 (Implement-Codex R2-F2 흡수)

이 프로토콜은 **C1에만** 적용한다. C2·C3은 대상이 아니다:

- **C3 제외** — [label-protocol.md §2.2](./label-protocol.md)가 소급 C3를 이미 **산출 불가**로 확정했다(revert 0건 · finding 귀속 미기록 → 분자 0, fix-title은 별도 `fix-title-proxy`로만). 존재하지 않기로 선언된 지표에 소급 프로토콜을 돌리면 안 된다. C3 본체는 M2가 `gate_decision_id → finding_id → remediation_pr` 전향 귀속을 기록한 뒤에만 산출하며, **이 전향 귀속 체인 구축은 M2의 수용 조건**이다.
- **C2 제외** — [label-protocol.md §4.2](./label-protocol.md)가 C2를 M2 전향 계측 전 산출 금지로 확정했다(차단↔diff 귀속 미기록).
- **C1만 대상** — finding 생성·해소는 PR body 산문에 부분적으로 존재하므로, 아래 프로토콜로 소급 가능성을 판정한다.
- **A계열 비대상 (Codex R3 F2 흡수)** — 이 프로토콜은 finding 소급(C1) 전용이며 A1 recovery 절차를 정의하지 않는다. §3 표의 A1이 forward-only인 이유가 이것이다 — ledger는 대조 소스로 불가하고(`verdict` 판별력 0) §4에 A1 절차가 없으므로, A1은 소급 baseline 없이 M2가 전향 수립한다. A1을 §4로 소급하려는 시도(=ledger 재사용)는 손상된 술어 재사용 위험이라 금지한다.

§3 표의 C3 상태는 **`forward-only`**다 — "전향 귀속 기록 전까지 산출하지 않는다"는 뜻이며 label-protocol §2.2와 동일하다. `recoverability-undetermined`(=프로토콜이 아직 판정하지 않음)와는 **다른 라벨**이므로 혼용하지 않는다. fix-title-proxy를 C3으로 승격하지 않는다.

### 4.1 절차 (C1 전용)

1. **층화 표집** — PR body의 `## Codex Review` / YAGNI 산문에서 표본을 뽑는다. 층화 축은 게이트 종류 × `base_sha` 커밋 월(§2.2 하한 anchor).
2. **연결 시도** — 각 finding을 후속 PR·revert 창에 연결한다. 연결 규칙은 [label-protocol.md](./label-protocol.md)의 결함 정의를 그대로 쓴다.
3. **사람 판정** — 자동 파싱이 모호한 행은 사람이 판정하고, 판정자 2인의 일치율을 기록한다.
4. **커버리지·검정력 기록** — 파싱 성공률, 셀당 표본, 일치율을 산출한다.
5. **확정** — 아래 임계 중 **하나라도 미달**하면 해당 지표를 소급 불가로 확정하고 전향 수집만 남긴다.

### 4.2 사전 임계 — base rate에 정박 (실행 전 고정, Implement-Codex IF5 흡수)

초안은 임계 네 개(40/60/75/5)를 근거 없이 나열했다. Codex 지적대로 **사전 등록은 저검정력 임계를 유효하게 만들지 않는다** — 특히 fix-title 15건·revert 0건인 코퍼스에서 표집 40 · 파싱 60%는 양성 사례가 너무 적어 C3을 추정할 수 없으면서도 프로토콜 문언은 만족시킨다.

따라서 임계를 관측 base rate에 정박하고, **각 임계가 왜 그 값인지**를 명시한다.

| 임계 | 값 | 정박 근거 |
|---|---|---|
| 최소 양성 사례 / (게이트 × 창 × 유형) 셀 | 5 | 5 미만이면 셀 비율의 신뢰구간이 ±0.4를 넘어 방향조차 못 읽는다. estimand는 셀 비율이며 이 셀당 최소가 검정력의 실질 게이트다 |
| 표집 크기 | 40 | PR 108건의 층화 하한 — [evidence-snapshot.json](./evidence-snapshot.json) `with_yagni_text`=46이 표집 가능 상한이므로 40은 그 88%다. 46을 넘길 수 없다 |
| 파싱 성공률 하한 | 60 | canonical 표 파싱은 2/46(4%)로 이미 실패다. 60%는 **사람 보조 파싱**이 도달해야 할 목표이며, 자동 파싱만으로는 원리상 미달한다(그 사실이 곧 소급 불가 신호) |
| 판정자 일치율 하한 | 75 | 2인 판정의 우연 일치(κ 기준)를 넘는 최소선. 75% 미만이면 판정 자체가 소음이라 그 셀을 버린다 |

**핵심 — 이 임계는 통과를 위한 것이 아니라 불가를 증명하기 위한 것이다.** revert 0건 · fix-title 15건인 corpus에서 "최소 양성 5/셀"은 C3의 대부분 셀에서 **미달이 예정**돼 있고, 그 미달이 곧 [label-protocol.md §2.2](./label-protocol.md)의 "소급 C3 산출 불가" 선언의 정량적 근거다. 임계를 낮춰 통과시키는 것이 아니라, 임계를 정직하게 걸어 불가를 드러낸다.

**estimand 명시**: 각 C계열 지표의 추정 대상은 (게이트 종류 × 관측 창 × finding 유형) 셀별 비율이다. 셀당 양성 5건 미만이면 그 셀은 보고하지 않고 "표본 부족"으로 남긴다 — 전체 평균으로 뭉개지 않는다.

이 숫자들은 **프로토콜을 실행하기 전에** 적혔다. 실행 결과가 나쁘다는 이유로 낮추는 것은 지표 무결성 규칙 위반이며, 그렇게 얻은 소급값은 무효다.

### 4.3 실행 경계

프로토콜의 **정의**는 M1이 소유하고 **실행**은 M2가 소유한다. M1은 기존 아티팩트를 읽는 커버리지 probe까지만 수행하며 신규 레코드를 쓰지 않는다(PRD "데이터 수집 0" 준수).

### 4.4 ledger는 대조 소스로 쓸 수 없다

§2.6대로 ledger `verdict`는 값이 하나뿐이라 어떤 대조에서도 신호를 주지 못한다. 프로토콜은 ledger를 **링크 소스**(어느 plan이 어느 커밋으로 갔는가)로만 쓰고, **판정 소스**로는 쓰지 않는다.

## 5. A3 baseline의 측정 방법 문제

PRD는 상시 지시문 점유를 "약 46,000 토큰"으로 적었으나 **측정 방법이 기재되어 있지 않다**. 바이트 기반 교차확인은 신뢰할 수 없다 — CLAUDE.md는 139,335바이트이고 4바이트/토큰 가정 시 약 35,000토큰으로 24% 괴리가 난다. 한국어 UTF-8은 문자당 3바이트이고 토크나이저 거동이 영어와 달라 바이트 추정이 성립하지 않는다.

A3의 목표는 *"절반 이하로 감축"* 이므로 baseline이 방법과 함께 고정되지 않으면 **목표 자체가 반증 불가능**하다. 따라서 [measurement-design.md](./measurement-design.md)의 A3 `산출식`이 실제 tokenizer를 지정하며, 그 지정 없이 산출된 값은 A3 판정에 사용하지 않는다.

## 6. 이 문서의 한계

- 모든 수치는 **mccp 자신에 대해서만** 유효하다. 외부 대조군은 PRD out-of-scope다.
- 19건의 대조 불가는 **영구 손실**이다. `durable-evidence-substrate` chore는 앞으로의 소실을 막을 뿐 과거를 복구하지 못한다.
- §2의 재현 명령은 `.claude/receipts/`가 존재하는 트리에서만 동작한다. receipt가 gitignored인 현재, fresh clone에서는 §2.1·2.2·2.6이 재현되지 않는다 — 이 사실 자체가 chore의 근거다.
