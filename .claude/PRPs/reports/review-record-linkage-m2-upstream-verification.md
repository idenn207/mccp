# M2 `rounds-channel` — 상류 충족 검증 (dropped 판정의 증거)

**PRD**: [.claude/prds/review-record-linkage.prd.md](../../prds/review-record-linkage.prd.md) · M2
**상태**: `dropped` (상류 선점) — 본 문서가 그 판정의 **증거**다
**작성**: 2026-09-02 · 측정 base `ec3e0df` (origin/main `9947efd` 머지 포함)
**사유**: PR-Codex R1 F2(HIGH)가 "UI9(MVP는 M1과 M2)를 저자 판단으로 축소했다"를 지적했다.
저자 판단만으로는 사용자 진술 범위를 줄일 수 없으므로, **판단을 증거로 바꾼다.**

---

## 무엇을 검증하는가

M2의 outcome 문장(PRD Delivery Milestones 2행)이 acceptance다:

> `resolution.rounds`에 게이트용 입력 통로가 생기고 세 게이트가 실값을 넘긴다.
> **acceptance는 producer가 아니라 산출된 실값** — 배선 부재를 보는 test가 없으면 완료가 아니다.

네 개의 검사 가능한 명제로 쪼갠다. 각 행은 **재현 명령**을 동봉한다.

| # | 명제 | 결과 |
|---|---|---|
| A | `resolution.rounds`에 게이트용 입력 통로가 실재한다 | **충족** |
| B | 세 게이트가 그 통로에 값을 넣는다 | **충족** |
| C | 산출된 **실값**이 리터럴 1이 아니다 | **충족** (실측 `rounds: 3`) |
| D | 배선 부재를 보는 test가 있다 | **충족** (85 pass / 0 fail) |

---

## A — 통로 실재

`receipt/write.js`가 `resolution.rounds`를 **round ledger에서 파생**한다. 리터럴이 아니다.

```bash
grep -n 'rounds' plugins/mccp/scripts/receipt/write.js
```

실측: `:40-45`가 M3 이전 상태를 자기 주석으로 기록한다 — "`--rounds` does not exist;
the only override, `--resolution-file`, is …" 그리고 "receipt sealed `rounds: 1` after a
measured 15+ rounds". `:61-62`가 `lib/review-rounds/{ledger,seal}`을 로드하고,
`:457-470`이 ledger에서 파생한다. `:77` 주석이 **부패한 ledger를 0으로 읽지 않는다**
(`null`, never 0)를 명시한다 — 이 PRD가 M1에서 `undecidable`을 0으로 접지 않는 것과
같은 규율이다.

이 PRD Evidence 절의 원래 진단("`receipt/cli.js:23`의 write 플래그 목록에 `--rounds`류가
0개")은 **그 시점에 정직했고**, 바뀐 것은 상류다. `write.js:450`의 `rounds: 1`은 여전히
존재하지만 그것은 `defaultResolution`이고, `:457-470`의 파생이 그 위에 선다.

## B — 세 게이트의 배선

증분 채널 **2종**과 게이트 seal **3종**이 실재한다.

```bash
grep -n 'recordRound\|review-rounds' plugins/mccp/scripts/lib/codex-invoke.js plugins/mccp/scripts/lib/plan-review/cli.js
for f in plan.md prp-implement.md pr.md; do grep -c 'review-rounds/cli.js" seal' plugins/mccp/commands/$f; done
```

| 축 | 위치 | 실측 |
|---|---|---|
| Codex 증분 | `lib/codex-invoke.js:354` `recordRoundSafely` → `:534` 호출 | 실재 |
| 패널 증분 | `lib/plan-review/cli.js:348` `recordRound` | 실재 |
| seal (`plan`) | `commands/plan.md` | 1건 |
| seal (`prp-implement`) | `commands/prp-implement.md` | 1건 |
| seal (`pr`) | `commands/pr.md` | 1건 |

세 게이트 전부 진입 시 정책을 봉인한다. 이 세션의 `/mccp:pr` 실행도 그것을 실행했다:
`sealed cap=1 mode=enforce key=mccp-pr-codex__review-record-linkage`.

## C — 산출된 실값 (acceptance의 핵심)

**producer 실재는 acceptance가 아니다.** M2 문장이 명시적으로 "산출된 실값"을 요구하므로,
working tree의 receipt 코퍼스를 전수 집계했다.

```bash
# 전 receipt의 resolution.rounds 분포 + ledger/cap 동봉값
node -e '<본 문서 하단 재현 스크립트>'
```

실측 (83건, base `ec3e0df`):

```
resolution.rounds distribution: {"1": 80, "2": 1, "3": 1, "undefined": 1}
```

`rounds > 1`인 2건:

| receipt | rounds | round_ledger_count | round_cap |
|---|---|---|---|
| `mccp-pr-codex/v0-2-8-task-2-6-1-fix.json` | 2 | (부재) | (부재) |
| `mccp-plan-codex/review-record-linkage.json` | **3** | **3** | 3 |

**후자가 결정적 증거다.** 이 PRD 자신의 M1 plan 게이트가 패널을 3회 발화했고, 발행된
receipt가 `rounds: 3`을 봉인했으며, 그 값이 `round_ledger_count: 3`과 **일치**한다 —
리터럴이 아니라 실제로 센 값이다. 전자(2)는 2026-06-07의 **수동 발행분**이라 통로의
증거가 아니다(PRD Evidence 절이 이미 그렇게 분류했다).

이 PRD의 게이트 receipt 4건 전체:

| receipt | rounds | ledger | cap | 해석 |
|---|---|---|---|---|
| `mccp-plan-codex` | 3 | 3 | 3 | 실값. **통로가 산다** |
| `mccp-implement-codex` | 1 | **0** | 3 | 잔여 사례 — 아래 |
| `mccp-pr-codex` | 1 | 1 | 1 | 실값(1라운드, §3.16 캡 1) |
| `mccp-santa-review` | 1 | (부재) | (부재) | 범위 밖 — 아래 |

### 잔여 1건은 소실이 아니라 표현 한계다 (재확인)

`mccp-implement-codex`가 `ledger: 0`인데 `rounds: 1`이다. `schema.js`의 `rounds >= 1`이
0을 표현할 수 없기 때문이고, **참값 0은 `meta.round_ledger_count`가 따로 싣는다.**
PRD의 M2 dropped 주가 이 사례를 예고했고, 이 사이클이 그것을 **실물로 재현**했다.
`round-ledger-fields.test.js`의 `'with no ledger the rounds field keeps its legacy 1,
and the real count is 0'`가 정확히 이 동작을 고정한다. 즉 알려진·문서화된·test로 고정된
한계이며 M2 재개 사유가 아니다(C4가 소비 시점에 셈법을 정한다).

### 범위 밖 관측 — `mccp-santa-review`는 ledger를 갖지 않는다

M2 문장은 "**세** 게이트"라 `mccp-santa-review`는 acceptance 범위 밖이다. 다만
"이제 모든 receipt가 실 라운드 수를 갖는다"는 **더 넓은 주장은 거짓**이므로 여기 적는다.
santa-loop는 자기 라운드를 `meta.santa_rounds`(이 사이클 값 2)로 따로 싣는다. 통합 여부는
M2가 아니라 별도 축의 판단이다.

## D — 배선 부재를 보는 test

```bash
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/round-cap-command-body.test.js \
  plugins/mccp/scripts/receipt/tests/round-ledger-fields.test.js \
  plugins/mccp/scripts/lib/review-rounds/tests/{ledger,seal,enforcement}.test.js
```

실측: **88 tests · 85 pass · 0 fail · 3 skipped**.

배선 부재를 직접 겨냥하는 단언 (`round-cap-command-body.test.js`):

- `every gate seals the round policy at entry, with its own gate id`
- `the seal precedes the first Codex invocation in every gate`
- `plan.md seals before the L2 panel launch, not just before Codex`
- `no gate body assigns or unsets MCCP_ROUND_LEDGER`
- `no gate body clears the round seal or the ledger`

파생 정확성 (`round-ledger-fields.test.js`):

- `a ledger with three rounds makes the receipt say three`
- `with no ledger the rounds field keeps its legacy 1, and the real count is 0`
- `the derivation is per (gate, decision) — a sibling gate does not leak in`
- `a corrupt ledger seals count=null, never 0`
- `a resolution-file contradicting the ledger throws instead of being overridden`

**skip 3건의 정체**: 전부 `POSIX mode is inert on Windows`
(`review-rounds/tests/ledger.test.js:227,235` · `seal.test.js:224`) — 파일 모드 단언이라
이 플랫폼에서 무의미하다. 배선 커버리지 공백이 **아니다**. 다만 이 저장소의 측정이
Windows 단독이므로 POSIX 파일 모드 축은 **여기서 검증되지 않았다**고 적는 것이 정직하다.

---

## 판정

A·B·C·D 네 명제가 모두 충족된다. 특히 C는 이 PRD 자신의 게이트가 `rounds: 3`을 봉인한
**end-to-end 실물**이므로, M2가 만들려던 outcome은 이미 존재한다. 여기서 다시 만들면
두 번째 통로가 생기고, 그것은 이 PRD가 M1에서 세운 "정의는 한 곳이 소유한다"를 결정층에서
위반한다.

따라서 **M2 `dropped` 유지**이며, UI9("MVP는 M1과 M2")는 **폐기가 아니라 충족**으로 읽는다 —
M2의 outcome이 상류에서 제공되므로 MVP가 요구한 상태에 도달했다.

## 이 문서가 주장하지 않는 것

- **상류 구현의 품질을 심사하지 않았다.** M2 acceptance 문장의 충족만 대조했다.
- **80/83 receipt가 여전히 `rounds: 1`이다.** 그 전부가 상류 M3 이전 발행분이라 소급
  대상이 아니며(UI1: 과거는 소급하지 않는다), 통로의 반증이 아니다.
- **코퍼스는 working tree 기준**이다. ship receipt만 git-tracked이므로(§3.12) 다른
  클론에서 세면 분모가 다르다. 실값 증거(`rounds: 3`)는 tracked 대상이 아닌
  `mccp-plan-codex` receipt이므로, 재현하려면 이 워크트리이거나 같은 게이트를 다시
  돌려야 한다 — 이것이 이 검증의 가장 약한 고리다.
- **POSIX 파일 모드 축은 미검증**이다(위 D 참조).

## 재현 스크립트 (C 절)

```js
const fs = require('fs'), path = require('path');
const base = '.claude/receipts';
const rows = [];
for (const gate of fs.readdirSync(base)) {
  const d = path.join(base, gate);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.json')) continue;
    try {
      const r = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
      rows.push({ gate, file: f, rounds: r.resolution && r.resolution.rounds,
        ledger: r.meta && r.meta.round_ledger_count, cap: r.meta && r.meta.round_cap });
    } catch (e) { /* unreadable — skip */ }
  }
}
const dist = {};
rows.forEach(r => { dist[r.rounds] = (dist[r.rounds] || 0) + 1; });
console.log('total:', rows.length, 'dist:', JSON.stringify(dist));
rows.filter(r => r.rounds > 1).forEach(r =>
  console.log('  ' + r.gate + '/' + r.file + ' rounds=' + r.rounds + ' ledger=' + r.ledger));
```
