# Plan: 내구 증거층 봉인 — 감사 가능성 복구 (Phase A = ship receipt 추적)

**Source**: 대화 세션 조사 (2026-07-21/22) + Plan-Codex R1 No-ship 흡수 + 교차 세션 관측 불일치 해소
**Selected Milestone**: 독립 chore (multi-session-work-loop PRD 마일스톤 아님)
**Complexity**: Medium
**재구성 이력**: R0 원안은 Plan-Codex R1 `needs-attention`(CRITICAL 1 · HIGH 1 · MEDIUM 1)으로 No-ship. R1 재구성판이 3건을 흡수했으나, F3 흡수로 도입한 cwd 재봉인 migration이 ledger↔receipt 암호학적 결속을 끊는다는 사실이 R2 GROUND 실측에서 드러나 해당 Task를 **철회**했다(E4). R2판은 태스크 번호를 한 칸씩 당겼다(R1 A3~A6 → R2 A2~A5). **R3**은 R2에 대한 Plan-Codex R1(`needs-attention`, CRITICAL 1 · HIGH 1 · MEDIUM 1)을 3건 전부 흡수한 판이다 — 핵심은 ledger evidence-commit을 Phase A에서 제거한 것(E6)과 rebase 재진입 자동화를 HALT로 바꾼 것이다. 본 문서는 R3판이다.

## Summary

worktree 삭제 워크플로에서 증거가 소실되는 문제를, **감사 가능성 복구**를 1차 목표로 재정의한다. 원안은 "증거를 내구화한다"였는데, 재구성판은 "**증거를 근거로 판정할 수 있게 만든다**"이다. 둘은 같지 않다 — 내구화만 하고 판정 술어가 거짓이면 거짓을 영구화하고, 감사 도구가 대조 대상 부재를 "이상 없음"으로 보고하면 결함이 구조적으로 은폐된다.

핵심 분리: **receipt는 참이고 ledger가 거짓이다.** receipt는 `codex_verdict: divergent`를 정직하게 기록하고, ledger가 그것을 `converged`로 뒤집는다. 따라서 receipt 추적은 지금 진행 가능하고(오히려 술어 결함을 *증명*하는 증거), ledger 소급 기록만 술어 수정 뒤로 미룬다. 원안은 둘을 한 단위로 묶어 통째로 차단됐다.

> **단, "receipt는 참"은 필드 단위로는 정확하지 않다.** receipt에도 `resolution.converged: true`가 함께 실려 있다(E2 인용문 참조 — divergent ship인데 이 필드는 true). Phase A가 clean 12건을 추적하면 그 **오도성 필드도 함께 영구화**된다. 그럼에도 추적이 옳은 이유는 `codex_verdict`가 바로 옆에 있어 **불일치가 증명 가능**하기 때문이다 — 이것이 E1의 감사를 성립시키는 바로 그 성질이다. 다만 추적 코퍼스에 신뢰 불가 필드가 포함된다는 사실을 CLAUDE.md 증거 내구성 계약(Task A5)에 명시해, 후속 소비처가 `resolution.converged`를 키로 삼지 않게 한다. v1.20.3이 dedupe 축에서 이미 내린 판정(이 필드는 always-true라 신뢰 불가)이 ledger 축과 receipt 독자 양쪽에 아직 전파되지 않았다.

R2에서 세 번째 원칙이 추가됐다: **증거를 내구화하는 변경은 그 증거를 변조해서는 안 된다.** R1판의 cwd 재봉인 migration이 이 원칙을 위반했다 — 33건의 `receipt_hash`를 재계산해, ledger가 그 receipt를 가리키던 결속을 끊는다. 노출 제거보다 결속 보존이 우선한다(E4).

## Evidence

### E1 — 감사 맹점 (신규 발견, 재구성의 직접 계기)

두 세션이 같은 감사를 돌려 정반대 결론에 도달했다. 원인은 판단 차이가 아니라 **대조 대상의 부재**다.

관측 시점: **2026-07-22**. 아래 수치는 그 시점 스냅샷이다 — worktree 열의 "디렉토리 자체 없음"은 이후 해당 worktree가 `mccp-plan-codex` receipt를 쓰면서 변한다(ship receipt는 여전히 0). 감사 결과를 인용할 때는 시점을 함께 인용할 것.

| | main worktree | `.worktrees/v1.22.4-multi-session-m1` |
|---|---|---|
| ship receipt 파일 | 33 | **0** (디렉토리 자체 없음) |
| ledger `verdict=converged` | 29 | 28 |
| 대조 OK | 7 | 0 |
| **거짓 양성** | **3** | **0** |
| 대조 불가 | 19 | **28** |

worktree 세션은 결함 부재를 관측한 것이 아니라 **관측 수단이 없었다**. 최악의 1건(`live-activation-m3-pr-codex-absorption` — ledger도 untracked)은 그 worktree에서 원리상 볼 수 없다.

**따라서 내구성 결함은 단순 데이터 손실이 아니라, 술어 결함을 탐지할 감사 자체를 무력화하는 2차 결함이다.** 그리고 fresh clone은 항상 후자의 상태다 — 즉 **본 저장소를 새로 받은 누구도 이 결함을 발견할 수 없다.**

### E2 — 술어 결함 (다른 plan 소관, 여기서는 전제로만)

`completion-ledger/index.js:95-96`이 `resolution.converged`(v1.20.3이 dedupe 축에서 신뢰 불가로 판정하고 폐기한 always-true 필드)를 보고 `resolution.codex_verdict`를 보지 않는다. 실측:

```text
ledger.verdict     : converged
receipt.resolution : {"converged":true, ..., "codex_verdict":"divergent"}
meta.codex_review_actionable_findings: true
```

거짓 양성 3건: `live-activation-m3-pr-codex-absorption`(divergent) · `workflow-orchestration-m4-parallel-activation`(skipped) · `worktree-gitdir-tmp-resolve`(skipped). **셋 다 `meta.cwd`가 현 root**라 구 저장소명 노출과 무관하다.

별건으로 ledger 엔트리가 아예 없는 receipt 23건 중 `workflow-orchestration-live-activation-m3`이 `codex_verdict=divergent`다. 거짓 양성은 아니나(ledger가 주장한 바 없음) ship 기록 누락 축의 사례라 Phase B 표식 대상에 포함한다.

이 축의 수정은 별도 plan/cycle 소관이다. 등재: `codex-findings-backlog.md` 2026-07-22 CRITICAL.

### E3 — receipt 추적의 비용은 작다

전수 실측 125건: 전체 248KB · `meta.host` 0건 · non-null `meta.briefing_summary` 0건 · findings 보유 1건. 거의 전부 메타데이터.

gitignore는 **검토된 결정이 아니다** — 도입 커밋 `375157d`(2026-06-02 스캐폴딩), 근거는 `mccp-bootstrap.plan.md` §11 Open Questions의 `Q3 | MEDIUM (default: working tree, gitignore)` 한 행. 해악은 3회 기록됨(v0.2.4 "unauditable bypass" · 사용자 본인 2026-06-23 제기 · `pickShipReceipt` 영구 null).

### E4 — receipt 재봉인은 ledger 결속을 끊는다 (R1판 Task A2 철회 근거)

R1판은 "재봉인 migration은 확립된 관례"(`v0.2.4` · `v0.2.6` · `v0.3.6`)를 들어 R0의 무수정 원칙을 과보수로 기각했다. **그 논거는 이 맥락에서 성립하지 않는다.**

- `completion-ledger/store.js:94-96` — ledger 엔트리의 **파일명 정체성이 `<decision_id>__<receipt_hash[0:12]>`**이고, `writeEntry`는 `(decision_id, receipt_hash)` 쌍에 대해 멱등이다.
- 실측(2026-07-22): comparable 10건 **전부** `receipt_hash` 조인이 성립한다(mismatch 0). 즉 결속은 지금 온전하며, 이것이 본 plan이 지키려는 감사 체인 그 자체다.
- 재봉인하면 33건의 해시가 전부 바뀌어 그 10건이 dangling이 되고, 재-append가 no-op이 아니라 **중복 엔트리**를 만든다.
- 선례 3건은 전부 completion-ledger 도입(`21f20ae`, 2026-06-24) **이전**이다(`v0.2.4`/`v0.2.6` = 2026-06-05). 당시엔 `receipt_hash`에 결속된 소비자가 없었으므로 선례가 이 상호작용을 덮지 못한다.
- `hash.js:211-222`의 carve-out(해시 계산 전 필드 삭제) 우회도 불가하다. 그 방식은 "구 receipt엔 해당 키가 없어 `delete`가 no-op"이라는 후방호환에 의존하는데, `meta.cwd`는 전 receipt에 존재하고 이미 해시에 포함돼 있어 carve-out 시 **125건 전부**의 검증이 깨진다.

**결론**: R0의 무수정 원칙이 옳았다 — 그 원칙이 지키던 것이 바로 이 결속이었다. 코퍼스 33건 중 현 root 12 / 구 저장소명 21로 갈린다.

> **R4에서 초과됨**: R2/R3판은 여기서 "구 저장소명 노출을 명시 수용한다"고 결론지었다. **그 수용은 철회됐다** — E7이 유출 21건을 Phase A 추적 대상에서 제외해 노출을 0건으로 만들기 때문이다. 무수정 원칙은 그대로 유지되며(어떤 receipt도 고치지 않음), 노출은 수용이 아니라 **회피**로 해소된다.

### E5 — 지금 하지 않으면 반증 불가능해진다

거짓 양성 3건을 입증하는 33개 receipt는 **main working tree에만, untracked로** 존재한다. 이것이 소실되면 E1의 worktree 세션이 내린 "이상 없음" 결론이 **반증 불가능**해진다. 이것이 Phase A의 긴급성 근거다.

### E6 — ledger에는 내구성 gap이 없다. 있는 건 독성 엔트리다 (R3, Codex F1 흡수)

R2까지 Task A4는 evidence-commit 대상에 `.claude/state/completion-ledger/`를 포함했다. 실측(2026-07-22)이 그 전제를 무너뜨린다:

| | 값 |
|---|---|
| ledger tracked | **28** |
| ledger on disk | 29 |
| untracked | **1** — `live-activation-m3-pr-codex-absorption__c8b9175d489a.json` |

`.gitignore:37-42`가 "completion-ledger entries ARE git-tracked"를 명시하고 `*.lock`/`*.tmp`만 제외한다. **ledger는 이미 추적 대상 클래스다.** 즉 Phase A가 닫을 durability gap이 ledger 쪽에는 없다.

그리고 유일한 untracked 1건은 정확히 **거짓 양성 엔트리**다(`ledger.verdict=converged` ↔ `receipt.codex_verdict=divergent`). Task B3은 이것을 "**B1 완료 전 커밋 금지**"라고 못박는다. 따라서 R2판 A4의 evidence-commit은 **첫 실행에서 B3가 금지한 그 파일을 커밋한다** — Phase A가 Phase B의 금지를 위반하는 내부 모순이다.

Codex F1은 "미래에 생산될 거짓 엔트리"를 지적했는데, 실제 상태는 그보다 나쁘다: 오늘 당장 그렇다. 게다가 `write.js:436`이 매 receipt write마다 `triggerLedgerAppend`를 호출하고 `index.js:96`이 always-true `resolution.converged`로 게이팅하므로, 앞으로의 사이클도 같은 거짓을 계속 생산한다.

**결론**: ledger evidence-commit은 Phase A에서 **제거**하고 Phase B(술어가 참이 된 뒤)로 옮긴다. 플랜 제목의 "ledger 커밋 타이밍 수리"도 함께 철회한다 — 그 전제가 실측으로 거짓이었다.

### E7 — 유출 21건은 감사에 0을 기여한다 (R4, Codex R2 F3 흡수)

Codex R2가 F3을 미해소로 남긴 논거는 비가역성이다: 한 번 push하면 Phase B의 rebind가 HEAD는 고쳐도 **이미 공개된 git 이력에서는 history rewrite 없이 절대 제거할 수 없다**. R3까지 이 점이 명시되지 않아 "노출은 낮은 영향"이라는 평가 자체가 불완전했다.

실측이 이 교착을 깬다 — 유출 여부와 감사 가치가 **완전히 분리**된다:

| | 전체 | clean(현 root) | leak(구 저장소명) |
|---|---|---|---|
| ship receipt | 33 | **12** | 21 |
| comparable | 10 | **10** | **0** |
| 거짓 양성 | 3 | **3** | **0** |

**감사가 필요로 하는 receipt는 전부 clean 12건 안에 있다.** 유출 21건은 comparable에도 거짓 양성에도 하나도 기여하지 않는다(전원 ledger 미대응 = unverifiable 19에 속함).

**결론**: Phase A는 **clean 12건만** 추적한다. E5의 긴급 증거를 100% 보존하면서 구 저장소명을 git 이력에 **0건** 공개하므로 F3이 완전히 닫히고, receipt를 전혀 수정하지 않으므로 E4 결속도 그대로다. 유출 21건은 Phase B에서 Codex가 제시한 원자적 rebind(redact→rehash→ledger `receipt_hash` 갱신→rename→manifest)로 정제한 뒤 추적한다. 세 선택지(무수정 전량 추적 / 즉시 rebind / 노출 수용) 어느 쪽보다 낫고 트레이드오프가 없다.

> **측정 주의(방법론)**: 이 분류를 확인하는 과정에서 `node -e '…'` 및 quoted heredoc 양쪽 모두 **이중 백슬래시가 붕괴**해 Windows 경로 리터럴 비교가 조용히 거짓이 되는 것을 겪었다(예: `"X:\\parent\\repo"` 형태 리터럴이 실제로는 구분자가 사라진 문자열로 붕괴, len 손실). 첫 측정은 `clean=0`이라는 **오답을 조용히** 냈다. A1 구현과 Validation은 **경로 백슬래시 리터럴을 쓰지 말 것** — 데이터에서 읽거나 `my-claude-code-plugin` 같은 백슬래시 없는 토큰으로 판정한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 결속 불변 | `completion-ledger/index.js:74-76` | 사후 stamp 시 `receipt_hash`를 **재계산하지 않음**이 명시 계약 |
| gitignore 부분 해제 | `.gitignore:41-42` | 산출물 종류별 제외(디렉토리 통째 아님) |
| 게이트 단계 삽입 | `commands/pr.md:779` Phase 3 | Phase 사이 Bash 블록 + loud stderr, LLM 컨펌 없음 |
| coverage 정직 보고 | `derive/index.js` per-source `degraded` 플래그 | 부분 실패를 성공으로 뭉개지 않고 명시 표면화 |
| 테스트 | `receipt/tests/*-fields.test.js` (40+) | `node --test`, 축별 파일 분리 |

## 두 단계로 분리 (원안의 교착 해소)

| | 내용 | 차단 여부 |
|---|---|---|
| **Phase A** | 감사 가능성 복구 — **clean ship receipt 12건 추적**(E7) · 감사 coverage 정직성 · 덮어쓰기 HALT 가드 · receipt-only evidence-commit | **차단 없음. 지금 진행 가능** |
| **Phase B** | 소급 판정 정정 + **ledger 커밋 타이밍** — untracked 1건 회수 · 거짓 양성 3건 격리 · 대조 불가 19건 표식 · ledger evidence-commit 배선 | **E2 술어 수정 완료 후** |

분리 근거는 두 가지다. (1) receipt는 참이라 추적해도 거짓이 생기지 않는다 — 거짓은 ledger의 판정 필드에만 있다. (2) **ledger에는 애초에 내구성 gap이 없다**(E6 — 이미 28/29 tracked). 따라서 Phase A가 ledger를 건드릴 이유가 없고, 건드리면 B3가 금지한 독성 엔트리를 커밋하게 된다.

## Files to Change (Phase A)

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/evidence-audit.js` | CREATE | ledger↔receipt 대조 + **coverage 정직 보고** + 해시 결속 검증 |
| `plugins/mccp/scripts/lib/tests/evidence-audit.test.js` | CREATE | **coverage 0에서 clean을 반환하지 않음**을 고정 |
| `.gitignore` | UPDATE | `mccp-pr-codex/*.json` 재포함 + 낡은 주석 교체 |
| `plugins/mccp/scripts/receipt/store.js` | UPDATE | **덮어쓰기 HALT 가드** — `writeReceipt`의 fs write **직전**. 모든 호출자 커버(Codex R3 F1) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | **신규** receipt의 `meta.cwd`를 repo-relative로 (기존 파일 미접근) |
| `plugins/mccp/scripts/receipt/tests/overwrite-guard.test.js` | CREATE | **rebase와 무관한 같은-slug 반복**을 writer 경로 직접 호출로 재현(Codex R3 F1) |
| `plugins/mccp/scripts/receipt/tests/cwd-normalization.test.js` | CREATE | 신규 정규화 + **기존 33건 해시 불변** 회귀 |
| `plugins/mccp/commands/pr.md` | UPDATE | HEAD_SHA passthrough + **receipt-only** evidence-commit + rebase HALT |
| `.claude/receipts/mccp-pr-codex/*.json` — **clean 12건만** | ADD | **내용 무변경**으로 추적. 유출 21건은 Phase B rebind 후(E7) |
| `CLAUDE.md` | UPDATE | merge-commit 정책 + 증거 내구성 계약(재봉인 금지 근거 포함) |
| `plugins/mccp/.claude-plugin/plugin.json` · `CHANGELOG.md` | UPDATE | `1.22.3 → 1.22.4` (§3.7) |

## Tasks — Phase A

### Task A1: 감사 coverage 정직성 (최우선 — E1이 만든 결함)

- **Action**: `evidence-audit.js` 신설. ledger↔receipt 대조 결과를 `{state, comparable, ok, false_positive, unverifiable, hash_bound, coverage}` 로 반환한다.
  - `state` enum: `'ok'`(대조 수행됨) · **`'blind'`**(`comparable === 0` — 대조 대상 부재) · `'degraded'`(일부 소스 읽기 실패).
  - **`comparable === 0`이면 절대 `'ok'`/`'clean'`을 반환하지 않는다.** 이 한 줄이 E1을 만든 결함의 정확한 반대다.
  - `ok`/`false_positive`/`unverifiable`/`hash_bound`는 **건수**, `coverage`는 `comparable / (ledger 엔트리 수)` 비율.
  - CLI 인터페이스: `--json`(구조화 출력) · `--repo-root <path>`(대상 트리 지정 — 기본값은 `git rev-parse --show-toplevel`). `--repo-root`는 선택이 아니라 **필수 기능**이다: blind 계약을 테스트하려면 receipt가 0건인 트리를 가리킬 수 있어야 하고, 교차 worktree 감사(E1의 재현) 자체가 이 옵션 없이는 불가능하다.
  - CLI는 `state==='blind'`에서 **비영점 exit** + loud stderr.
- **조인 규약**: 1차 키는 `entry.decision_id` — ledger는 판정 필드가 **`entry` 하위에 중첩**돼 있어 최상위 조인은 조용히 `comparable=0`을 낸다(실측 확인). `entry.receipt_hash`↔`receipt.receipt_hash` 일치는 `hash_bound`로 **별도 보고**한다. 결속이 끊기면 감사 체인이 끊긴 것이므로 침묵하지 않는다(E4).
- **왜 최우선인가**: 이 결함이 없었다면 교차 세션 모순이 애초에 발생하지 않았다. 그리고 이 도구가 없으면 E2 술어 수정의 효과도 검증할 수 없다.
- **Mirror**: derive per-source `degraded` 플래그 — 부분 실패를 성공으로 뭉개지 않음
- **Validate**: receipt 디렉토리를 임시로 감춘 상태에서 실행 → `blind` + 비영점 exit. 33건 있는 상태 → `comparable=10 · ok=7 · false_positive=3 · unverifiable=19 · hash_bound=10`

### Task A2: gitignore 선별 해제

- **Action**: git 재포함 규칙상 트레일링 슬래시 디렉토리 제외는 하위를 `!`로 되살릴 수 없으므로 `/*` 형태 필수:

  ```gitignore
  # Runtime receipts — 내구성 계약(CLAUDE.md):
  #   plan/implement receipt = 세션 진단용 → working-tree only
  #   ship receipt(mccp-pr-codex) = 감사 대조 corpus → git-tracked
  # 2026-07-22: 부트스트랩 미검토 기본값(mccp-bootstrap.plan.md §11 Q3,
  # commit 375157d) 대체. 그 기본값이 감사 자체를 불가능하게 만들었다(E1).
  .claude/receipts/*
  !.claude/receipts/mccp-pr-codex/
  .claude/receipts/mccp-pr-codex/*.lock
  .claude/receipts/mccp-pr-codex/*.tmp
  ```

- **Validate**: `git check-ignore -v` 3종 — plan-codex 무시 / pr-codex **미무시**(exit 1) / `.migrations/` 무시

### Task A3: 신규 receipt cwd 정규화 (기존 파일 불가침)

- **Action**: `write.js:169`의 `cwd: cwd`를 repo-relative(`.` 또는 상대경로, repo 밖은 placeholder)로 정규화. **신규 write 경로에만** 적용하며 기존 33건은 읽지도 쓰지도 않는다.
- **불변식 2건**: (1) 기존 receipt의 `receipt_hash`는 변하지 않는다. (2) `hash.js`에 `meta.cwd` carve-out을 추가하지 않는다 — `meta.cwd`는 전 receipt에 존재하므로 carve-out은 125건 전부의 검증을 깨뜨린다(E4).
- **F3 처리**: 원안은 "값은 repo root라 민감하지 않다"고 서술했으나 **1건 샘플링 후 일반화한 오류**였다(실제 분포: 현 root 12 / 구 저장소명 21). 신규 receipt는 본 Task의 정규화로 닫히고, **기존 21건은 Phase A 추적 대상에서 제외**돼 git 이력에 도달하지 않는다(E7). 노출은 수용이 아니라 회피로 해소된다 — 무수정 원칙은 유지.
- **Validate**: 신규 write의 `meta.cwd`가 상대 · hash 통과 · **기존 33건 `receipt_hash === receiptHash(receipt)` + `hash_bound=10` 불변**(회귀 고정)

#### A3-b: 덮어쓰기 HALT 가드 (Codex R3 F1 흡수 — writer 앵커)

- **Action**: `store.js#writeReceipt`의 `fs.writeFileSync` **직전**에 fail-closed 가드. 조건: **대상 경로가 git-tracked이고 디스크의 `receipt_hash`가 새로 계산된 hash와 다르면** 비영점 종료하고 **쓰지 않는다**. `pr.md`에 두면 이미 덮어쓴 뒤라 늦고 그 커맨드 밖 write를 못 막는다.
- **왜 `writeReceipt`가 옳은 앵커인가 (전수 확인 — 초안의 "유일한 쓰기 지점" 주장은 부정확했다)**: receipt 파일에 `fs.writeFileSync`를 하는 경로는 **넷**이다.

  | 경로 | `receipt_hash` | 가드 필요 |
  |---|---|---|
  | `store.js#writeReceipt` | **바뀔 수 있음**(정본 교체) | **예 — 여기 앵커** |
  | `briefing/index.js:69` | 불변 — `hash.js:212-215`가 `briefing_*`를 carve-out(`index.js:63-67`이 미재계산을 명시) | 아니오(구조적 불가) |
  | `completion-ledger/index.js:86` `stampSkipDiagnostic` | 불변 — `hash.js:222`가 `ledger_write_skipped` carve-out | 아니오(구조적 불가) |
  | `migrations/v0.2.4·v0.2.6·v0.3.6` | **명시적 재계산** | 별도 축 — 명시적 versioned 작업이며 결속 인지 처리는 E4/Phase B rebind 소관 |

  즉 `writeReceipt`는 "유일한 쓰기 지점"이 아니라 **정본을 교체하는 유일한 경로**다. 나머지 stamper 둘은 carve-out 덕에 해시를 바꿀 수 없으므로 결속을 깨지 못한다.
- **왜 rebase 조건이 아닌가**: rebase는 이 결함의 한 사례일 뿐이다. 실측상 이미 발생한 8건은 전부 **정상 재-PR**이었다.
- **운영자 탈출구(필수 — 없으면 deadlock. 실재 확인됨)**: 같은 decision을 정당하게 다시 ship해야 하면 **새 decision slug를 쓴다**. 이 탈출구가 실제로 사용 가능한지 `decision.js`로 확인했다 — 파생 우선순위 1이 **명시적 `--decision <slug>`**(`decision.js:7`)이므로 운영자가 직접 지정할 수 있고, `mccp:pr`은 BRANCH_BASED(`decision.js:25-30`)라 **새 브랜치명**도 새 slug를 만든다. 즉 탈출구는 둘이며 illusory하지 않다. 기존 slug 덮어쓰기는 supersession 스키마가 생기기 전까지 불허(Out of Scope). 가드 메시지가 두 탈출구를 그대로 출력한다.
- **untracked는 무영향**: 아직 추적되지 않은 21건과 신규 decision은 가드에 걸리지 않는다 — 결속을 가진 대상만 보호한다.
- **Validate**: `overwrite-guard.test.js`가 **writer 경로를 직접 호출**해 (a) tracked + hash 상이 → 비영점 + 파일 미변경, (b) untracked → 정상 write, (c) tracked + hash 동일(멱등 재작성) → 정상 통과를 고정. **rebase를 경유하지 않는 같은-slug 반복** 시나리오여야 한다

### Task A4: receipt evidence-commit + HEAD_SHA passthrough (F2 흡수 · R3 축소)

- **Action**: 두 부분. R2판의 세 번째 부분(rebase 재봉인)은 R3에서 **철회**했다(아래).
  1. **HEAD_SHA passthrough** — Phase 2.5(`pr.md:509/571`)가 캡처한 값을 Phase 4(`pr.md:863/866`)가 **재계산하지 않고 전달받아** 쓰게 한다. 현재는 `git rev-parse HEAD`를 다시 돌아 body-file(`pr-body-<slug>-${HEAD_SHA:0:12}.md`)을 못 찾을 수 있다.
  2. **receipt evidence-commit** — Phase 3 push 직전, `.claude/receipts/mccp-pr-codex/` **한 경로만** 별도 커밋. `--amend` 금지. **`.claude/state/completion-ledger/`는 대상이 아니다**(E6 — ledger는 이미 tracked이고, 유일한 untracked 1건은 B3가 커밋을 금지한 독성 엔트리다).
- **F2 원문**: 원안 Task 4는 "별도 커밋이면 안전"이라 단정했으나, HEAD 변경이 body-file 조회를 깨 `## Design Review`·`## Codex Adversarial Review`가 **조용히 누락**된다.
- **rebase 축(R2 part 3) 철회 — Codex F2 흡수**: R2는 rebase 후 도달성 파괴를 "게이트 재진입"으로 풀려 했으나, 그 전략이 **더 나쁜 결함을 만든다**. `receipt/store.js:96-101` `writeReceipt`는 `<gate>/<decision>.json` **고정 경로 덮어쓰기**라 append-only가 아니다. 반면 ledger `writeEntry`는 새 `receipt_hash`마다 새 파일을 만든다. 따라서 재진입은 **이미 커밋된 ledger 엔트리가 가리키는 receipt를 HEAD에서 지운다** — E4가 막으려던 dangling 결속을 정확히 재현한다. 게다가 `KNOWN_ENTRY_KEYS`에 `superseded_by`/`supersedes`가 없고 스키마가 strict라 **supersession을 표현할 어휘조차 없다**. 감사자는 의도된 승계와 증거 소실을 구분할 수 없다.
  - **R4 실측 — rebase는 이 결함의 일부일 뿐이고, 이미 세 번 일어났다**: 같은 decision slug로 재-PR하면 `writeReceipt`가 같은 파일을 덮어쓰고 ledger는 새 hash로 새 파일을 만든다. 현재 상태에서 `dashboard-interactivity`는 ledger 엔트리 **4건**(각기 다른 hash)에 receipt는 **0건**, `dashboard-data-exploration`·`dashboard-readability`는 각 2건에 receipt 0건 — 합 **8건이 이미 dangling**이다. rebase와 무관한 정상 워크플로에서 발생했다. Codex R2는 이를 추론으로 제기했으나 실측이 더 강하게 확증한다.
  - **R5 처리 — 가드는 A3(writer)이 소유한다**: R4는 HALT 조건은 옳게 서술했으나 **위치가 틀렸다**(Codex R3 F1). 실제 덮어쓰기는 `store.js#writeReceipt`에서 일어나므로 `pr.md`에 두면 이미 덮어쓴 뒤라 늦고, 그 커맨드 밖의 직접 write는 아예 못 막는다. 가드는 **Task A3**으로 이관했다. A4는 HEAD_SHA passthrough와 receipt-only evidence-commit만 소유한다. 자동 재진입은 여전히 금지.
  - **완화되지만 해소되지는 않음(정직 기록)**: 추적 이전에는 덮어쓴 receipt가 **영구 소실**되지만, 추적 이후에는 git 이력에 남아 **복원 가능**하다. Phase A는 이 결함을 고치지 못해도 악화시키지 않으며 오히려 완화한다. 대신 A1은 "dangling이나 이력에서 복원 가능" 과 "소실"을 **구분해 보고**해야 한다.
  - **근본 해소는 Out of Scope** — receipt append-only화 또는 supersession 스키마 신설이 필요하며, 둘 다 receipt/ledger 양쪽 store 계약 변경이라 본 chore 범위를 넘는다.
- **실패 처리**: evidence-commit 실패는 fail-loud-open(PR 진행). 단 (1)과 rebase HALT는 **fail-closed** — body 섹션 누락과 SHA 도달성 파괴는 조용히 지나가면 안 된다.
- **Validate**: 스테이징 범위 밖 혼입 시 실패하는 테스트(특히 `completion-ledger/` 혼입 시 실패) · evidence-commit 후에도 Phase 4가 올바른 body-file을 찾음 · rebase 시나리오에서 **HALT 발동**(재진입 자동 실행 아님) · 커밋 전후 `hash_bound=10` 불변

### Task A5: clean 12건 추적 + 문서 + 버전

- **Action**: clean 12건만 `git add` — **내용 무변경**. 대상 선정은 `meta.cwd`에 `my-claude-code-plugin` 토큰이 없는 것(백슬래시 리터럴 금지 — E7 측정 주의). 유출 21건은 gitignore 유지 상태로 남기고 Phase B rebind 후 추적한다. CLAUDE.md에 merge-commit 정책(이미 GitHub 설정 적용 완료)과 **증거 내구성 계약** 표. 계약에는 (a) 재봉인 금지 근거(E4), (b) 추적 코퍼스에 신뢰 불가 필드 `resolution.converged`가 포함되므로 소비처가 이를 키로 삼지 말 것(Summary 각주)을 함께 적는다. `plugin.json 1.22.4` + footer×2 + CHANGELOG.
- **Validate**: **추적 12건**(코퍼스 33건은 디스크에 그대로) · tracked 집합에 `my-claude-code-plugin` 0건 · 33건 해시 불변 · `plugin.json` 1.22.4

## Tasks — Phase B (E2 술어 수정 완료 후)

### Phase B가 E2에 요구하는 계약 (필수 — 미충족 시 B1 실행 불가)

E2를 "술어를 `codex_verdict`로 바꾼다"로만 정의하면 **Phase B는 여전히 막힌다.** 실측:

```text
ledger  VALID_VERDICTS      : [converged, advisory, skipped]
receipt CODEX_VERDICT_VALUES: [converged, divergent, critical, unavailable, skipped]
```

ledger entry 스키마는 **strict**다(`store.js` — `KNOWN_ENTRY_KEYS` 미등록 키 reject + `VALID_VERDICTS` enum 검증). 즉 **`divergent`·`critical`·`unavailable`을 저장할 어휘가 없다.** 거짓 양성 3건 중 `live-activation-m3-pr-codex-absorption`이 정확히 `divergent`이므로, 어휘 확장 없이는 B1의 "정정"이 **스키마 위반으로 실패**한다.

따라서 E2 plan은 아래를 반드시 포함해야 하며, 본 plan은 이를 **선행 계약으로 명시**한다.

1. `VALID_VERDICTS`를 receipt의 5종 + `unknown`(구 receipt fallback)으로 확장. 기존 `advisory`는 하위호환 유지(제거하면 구 엔트리가 invalid).
2. `codex_verdict` 부재 시 기본값은 **`unknown`** — 어떤 경로로도 `converged`가 되지 않는다(v1.20.3이 dedupe 축에서 내린 규칙과 동일).
3. append 게이트가 divergent ship을 **누락시키지 않을 것**. 술어를 "converged일 때만 기록"으로 조이면 거짓 기록이 *기록 없음*으로 바뀔 뿐이고, 그건 PRD가 문제 #3으로 지목한 피드백 단절을 게이트가 스스로 만드는 것이다. 기록은 하되 참값을 싣고, 승인 판정은 소비처가 한다.
4. ledger 소비처 **10곳** 전수 감사 — `derive/sources/ledger.js` · `archive-complete/{scan,apply}.js` · `renderer/sections/{milestone-history,pipeline,status-grid}.js` · `renderer/parsers/{decision-state,plan-body}.js` 등. 어휘가 넓어지면 "엔트리 존재 = 완료"로 읽는 소비처가 곧 오판이 된다.
5. 엔트리 정정 시 **`receipt_hash` 결속 유지**(E4) — verdict 필드만 바꾸고 결속 키는 건드리지 않는다. 파일명 rename이 불가피하면 A1 도구의 `hash_bound`가 회귀로 잡는다.

### Task B1: 거짓 양성 3건 정정 또는 격리

`live-activation-m3-pr-codex-absorption` · `workflow-orchestration-m4-parallel-activation` · `worktree-gitdir-tmp-resolve`. 수정된 술어로 재판정 후 정정하거나, 정정 불가면 명시 격리(삭제 아님 — 거짓 기록도 감사 대상).

### Task B2: 대조 불가 19건에 `unverifiable` 표식

ship receipt가 이미 소실돼 참·거짓 판정이 **영구 불가능**하다. 복구 불가를 정직하게 기록한다 — 침묵은 "검증됨"으로 오독된다. ledger 엔트리가 없는 receipt 23건(그중 `workflow-orchestration-live-activation-m3`이 divergent)도 같은 축에서 표식한다.

### Task B3: untracked ledger 1건 회수

`live-activation-m3-pr-codex-absorption__c8b9175d489a.json`. **B1 완료 전 커밋 금지** — 현 상태 그대로 커밋하면 거짓을 영구화한다(R0 원안의 CRITICAL 결함).

## Validation

> **실행 규약 (실측으로 확정 — 지키지 않으면 이 블록은 돌지 않는다)**
>
> 1. `node --test <dir>/`는 Node 24.11.1에서 `MODULE_NOT_FOUND`로 **즉시 실패**한다(디렉토리를 모듈로 해석). **glob 형태만 동작**한다. 기존 47개 plan이 쓰던 관행이라 repo-wide 선재 문제다.
> 2. receipt 스위트 39개 중 **12개가 briefing LLM 호출로 45s+ 행**한다(`design-grounding-fields` · `e2e-dogfood` · `impeccable-*` · `merged-verify-fields` · `pr-codex-*` · `preflight` · `schema-plan-conflict` · `security-*`). **`MCCP_BRIEFING=off`가 필수**이며, 주면 4~10초에 통과한다. Task A3이 고치는 파일이 바로 이 테스트들이 덮는 `receipt/write.js`이므로, 이 규약 없이는 **핵심 변경의 검증 수단이 존재하지 않는다.**
> 3. 아래 모든 검사는 실패 시 종료한다. 기대값은 주석이 아니라 **단정문**이다 — Task A1의 주제가 "부재를 이상 없음으로 보고하지 마라"인데 Validation 자신이 그 규칙을 어기면 안 된다.

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
export MCCP_BRIEFING=off   # 위 규약 2

# 1. 감사 도구가 main에서 실측치를 재현하는가 (Task A1 핵심 계약)
node -e '
const a=require("./plugins/mccp/scripts/lib/evidence-audit.js");
const r=a.audit({repoRoot:process.cwd()});
const bad=[];
if(r.state!=="ok")           bad.push("state="+r.state+" (want ok)");
if(r.comparable!==10)        bad.push("comparable="+r.comparable+" (want 10)");
if(r.ok!==7)                 bad.push("ok="+r.ok+" (want 7)");
if(r.false_positive!==3)     bad.push("false_positive="+r.false_positive+" (want 3)");
if(r.unverifiable!==19)      bad.push("unverifiable="+r.unverifiable+" (want 19)");
if(r.hash_bound!==10)        bad.push("hash_bound="+r.hash_bound+" (want 10)");
if(typeof r.coverage!=="number") bad.push("coverage missing");
if(bad.length){ console.log("FAIL:",bad.join(" | ")); process.exit(1); }
console.log("OK: 10 comparable / 7 ok / 3 false-positive / 19 unverifiable / 10 hash-bound");'

# 2. blind 계약 — ship receipt 0건 트리에서 ok/clean 반환 금지 (E1이 만든 결함의 역)
node -e '
const a=require("./plugins/mccp/scripts/lib/evidence-audit.js");
const fs=require("fs"),os=require("os"),path=require("path");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"evaudit-"));
fs.mkdirSync(path.join(tmp,".claude/state/completion-ledger"),{recursive:true});
const r=a.audit({repoRoot:tmp});
if(r.state!=="blind"){ console.log("FAIL: 0-comparable tree reported state="+r.state); process.exit(1); }
console.log("OK: blind !== clean");'

# 3. CLI가 blind에서 비영점 exit 하는가
tmpdir=$(mktemp -d); mkdir -p "$tmpdir/.claude/state/completion-ledger"
if node plugins/mccp/scripts/lib/evidence-audit.js --json --repo-root "$tmpdir" >/dev/null 2>&1; then
  echo "FAIL: CLI exited 0 on a blind tree"; exit 1
fi
echo "OK: CLI non-zero on blind"

# 4. 기존 33건 불가침 — 내용 무변경 (A3 핵심 불변식, E4)
[ -z "$(git status --porcelain .claude/receipts/mccp-pr-codex/ | grep -v '^??' || true)" ] \
  || { echo "FAIL: tracked ship receipts were modified"; exit 1; }
node -e '
const fs=require("fs"); const D=".claude/receipts/mccp-pr-codex";
const {receiptHash}=require("./plugins/mccp/scripts/receipt/hash.js");
let bad=[],n=0;
for(const f of fs.readdirSync(D).filter(x=>x.endsWith(".json"))){
  const j=JSON.parse(fs.readFileSync(D+"/"+f,"utf8")); n++;
  if(j.receipt_hash!==receiptHash(j)) bad.push(f);
}
if(n!==33){ console.log("FAIL: expected 33 ship receipts, found",n); process.exit(1); }
if(bad.length){ console.log("FAIL: receipt_hash invalid:",bad.join(", ")); process.exit(1); }
console.log("OK: 33 receipts intact, hashes valid");'

# 5. hash.js에 meta.cwd carve-out이 없는가 (E4 — 있으면 125건 검증이 깨진다)
! grep -q 'delete clone.meta.cwd' plugins/mccp/scripts/receipt/hash.js \
  || { echo "FAIL: meta.cwd carve-out added to hash.js"; exit 1; }

# 6. gitignore 3종 — exit code를 실제로 단정
git check-ignore -q .claude/receipts/mccp-plan-codex/x.json \
  || { echo "FAIL: plan-codex must be ignored"; exit 1; }
! git check-ignore -q .claude/receipts/mccp-pr-codex/x.json \
  || { echo "FAIL: pr-codex must NOT be ignored"; exit 1; }
git check-ignore -q .claude/receipts/.migrations/x.lock \
  || { echo "FAIL: .migrations must be ignored"; exit 1; }

# 7. clean 12건만 tracked 인가 (E7 — 유출 21건은 Phase B)
[ "$(git ls-files .claude/receipts/mccp-pr-codex/ | wc -l)" -eq 12 ] \
  || { echo "FAIL: expected exactly 12 tracked ship receipts"; exit 1; }

# 7a. tracked 집합에 구 저장소명이 단 1건도 없는가 (F3 회귀 — 비가역이므로 push 전 필수)
for f in $(git ls-files .claude/receipts/mccp-pr-codex/); do
  grep -q 'my-claude-code-plugin' "$f" \
    && { echo "FAIL: leaking receipt staged for permanent history: $f"; exit 1; }
done
echo "OK: 12 tracked, zero old-repo-name leakage"

# 7b. Phase A가 ledger를 커밋하지 않았는가 (E6 — B3 계약 유지)
[ "$(git ls-files .claude/state/completion-ledger/ | wc -l)" -eq 28 ] \
  || { echo "FAIL: Phase A changed the ledger tracked set (must stay 28)"; exit 1; }
git ls-files --others --exclude-standard .claude/state/completion-ledger/ \
  | grep -q 'live-activation-m3-pr-codex-absorption__c8b9175d489a.json' \
  || { echo "FAIL: the poison ledger entry must remain untracked until B1"; exit 1; }

# 7c. 덮어쓰기 가드가 writer에 앵커돼 있는가 (Codex R3 F1 — pr.md에만 있으면 늦다)
grep -q 'receipt_hash' plugins/mccp/scripts/receipt/store.js \
  || { echo "FAIL: overwrite guard not anchored in writeReceipt path"; exit 1; }

# 8. 단위 테스트 — glob 형태 필수 (규약 1)
node --test "plugins/mccp/scripts/receipt/tests/*.test.js"
node --test "plugins/mccp/scripts/lib/tests/evidence-audit.test.js"

# 9. 회귀 — lib 스위트는 알려진 fixture 실패 1건 외 0
out=$(node --test "plugins/mccp/scripts/lib/tests/*.test.js" 2>&1 || true)
fails=$(printf '%s\n' "$out" | sed -n 's/^ℹ fail \([0-9]*\)$/\1/p' | tail -1)
[ "$fails" = "1" ] || { echo "FAIL: expected exactly 1 known failure, got ${fails:-?}"; exit 1; }
printf '%s\n' "$out" | grep -q 'design-critique-loop-e2e.test.js' \
  || { echo "FAIL: the single failure is NOT the known fixture case"; exit 1; }

# 10. version surface 동기
v=$(node -e 'process.stdout.write(require("./plugins/mccp/.claude-plugin/plugin.json").version)')
[ "$v" = "1.22.4" ] || { echo "FAIL: plugin.json=$v"; exit 1; }
grep -q "$v" plugins/mccp/scripts/lib/renderer/html.js || { echo "FAIL: html footer drift"; exit 1; }
grep -q "$v" plugins/mccp/scripts/lib/renderer/markdown.js || { echo "FAIL: md footer drift"; exit 1; }
echo "ALL CHECKS PASSED"
```

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 감사 도구가 또 다른 형태로 맹점을 만듦 | 중 | 높음 | `coverage`·`hash_bound`를 반환값 **필수 필드**로 두고, 0-coverage에서 clean 반환 금지를 테스트로 고정 |
| A3/A4가 실수로 기존 receipt를 변조 | 낮음 | **높음** | 신규 write 경로 한정 + `git status --porcelain` 무변경 + 33건 해시 불변 + `hash_bound=10`을 회귀로 고정(Validation 4·5) |
| A4의 세 부분 중 일부만 적용 | 중 | 높음 | 한 Task로 묶고 각 부분에 독립 validate |
| gitignore 재포함 오작성 | 높음 | 중 | `/*` 형태 강제 + `check-ignore` 3종 |
| 유출 21건이 실수로 스테이징돼 비가역 공개 | 낮음 | **높음** | Phase A 추적 대상은 clean 12건뿐(E7). Validation 7a가 tracked 집합의 `my-claude-code-plugin` 0건을 **push 전 필수 게이트**로 강제 — 통과 못 하면 push 금지 |
| clean 12건의 `meta.cwd`에 현 root 절대경로가 남음 | **확실** | 낮음 | 전수 스캔 확인 — 유출 벡터는 `meta.cwd` 단 하나이고 사용자명·호스트명·구 저장소명은 0건. 신규 receipt는 A3이 상대경로화 |
| `plugin.json 1.22.4`가 타 worktree와 충돌 | 높음 | 낮음 | 충돌 상대는 `.worktrees/v1.22.4-multi-session-m1`(M1 plan도 1.22.4를 주장). **본 chore가 M2의 선행이므로 1.22.4는 이쪽이 갖고, M1 plan을 1.22.5로 상향**한다(§3.7 forward-only). M1 plan의 `Files to Change`·Validation·Acceptance 3곳이 버전을 언급하므로 함께 정정 |
| Validation이 실행 불가한 채로 남음 | — | — | **해소됨** — 실측으로 두 결함 확인 후 수정: `node --test <dir>/`는 Node 24에서 즉시 실패(glob 필수), receipt 스위트 12/39가 briefing으로 45s+ 행(`MCCP_BRIEFING=off` 필수). Validation 상단 규약 참조 |
| Phase A 지연 중 33건 소실 → E1 결론이 반증 불가능해짐 | 중 | **높음** | Phase A를 우선 착수(E5) |
| 동시 worktree가 같은 slug receipt를 써서 git 충돌 | 낮음 | 중 | 현재도 조용히 덮이며, 추적은 이를 **보이게** 만든다. 근본 수정(write lock)은 PRD M3 소관 |

## Out of Scope

- **ledger 승인 술어 수정** — 별도 plan/cycle(E2). 본 plan은 Phase B에서 그 결과를 소비만 한다.
- **ledger evidence-commit 배선** — R3에서 Phase A → Phase B로 이동(E6). ledger는 이미 tracked라 내구성 gap이 없고, 술어가 거짓인 채로 커밋 타이밍만 당기면 거짓만 빨리 굳는다.
- **receipt append-only화 / supersession 스키마** — Codex F2의 근본 해소. `receipt/store.js`의 덮어쓰기 계약과 ledger `KNOWN_ENTRY_KEYS` strict 스키마를 양쪽 다 바꿔야 하므로 본 chore 범위 밖. Phase A는 rebase 시 **HALT**로 회피만 한다.
- **기존 receipt의 cwd 정규화** — E4가 결속 파괴로 기각. Codex F3이 제시한 원자적 rebind(redact→rehash→ledger `receipt_hash` 갱신→rename→manifest)는 기술적으로 타당하나, **Phase B가 어차피 ledger 엔트리를 수정하므로 그때 함께 하는 것이 자연스럽다**. Phase A에서 단독으로 하면 결속만 끊는다.
- **receipt 전면 추적** — `receipt/store.js:100`이 lock 없는 맨 `writeFileSync`. 동시 쓰기 보호 선행 필요(PRD M3).
- **acceptance 증거 바인딩 / milestone 완료 기계 판정** — PRD M6.
- **STATE.md 강등** — PRD M5. 본 plan은 STATE.md에 의존하지 않는다.
- **과거 squash 커밋의 소급 SHA 복구** — 원리상 불가능.

## Acceptance — Phase A

- [ ] `evidence-audit.js`가 receipt 부재 시 `clean`이 아닌 **`blind` + 비영점 exit** (테스트 고정)
- [ ] 같은 도구가 main에서 `comparable=10 · ok=7 · false_positive=3 · unverifiable=19 · hash_bound=10` 재현
- [ ] **기존 33건 `receipt_hash` 불변** · `git status --porcelain` 무변경 (A3 불가침 회귀)
- [ ] `hash.js`에 `meta.cwd` carve-out을 추가하지 않음
- [ ] `git check-ignore` 3종 기대대로
- [ ] 신규 receipt `meta.cwd` 상대 · 기존 파일 미접근
- [ ] evidence-commit 후에도 Phase 4가 올바른 body-file을 찾음(F2-a 회귀)
- [ ] rebase 시나리오에서 **HALT 발동** — 게이트 재진입을 자동 실행하지 않음(Codex F2 회귀)
- [ ] evidence-commit이 `.claude/receipts/mccp-pr-codex/` 외 스테이징 시 실패 — 특히 **`completion-ledger/` 혼입 시 실패**(E6 회귀)
- [ ] Phase A가 `.claude/state/completion-ledger/`를 커밋하지 않음 · untracked 독성 엔트리 1건이 여전히 untracked(B3 계약 유지)
- [ ] `--amend` 미사용
- [ ] ship receipt **clean 12건** tracked · tracked 집합에 `my-claude-code-plugin` **0건**(F3 회귀 — push 후 비가역)
- [ ] 유출 21건은 untracked 유지(Phase B rebind 대상)
- [ ] tracked receipt를 다른 hash로 덮어쓰려 할 때 **HALT** — 가드가 `store.js#writeReceipt`의 fs write **직전**에 위치(Codex R3 F1). `pr.md` 단독 배치는 불가
- [ ] `overwrite-guard.test.js`가 **rebase를 경유하지 않는 같은-slug 반복**을 writer 직접 호출로 재현
- [ ] 가드 탈출구가 명시됨 — 정당한 재-ship은 **새 decision slug**(기존 slug 덮어쓰기는 supersession 스키마 전까지 불허)
- [ ] CLAUDE.md 증거 내구성 계약(재봉인 금지 + `resolution.converged` 비신뢰 명시) + merge-commit 정책
- [ ] `plugin.json` 1.22.4 + footer×2 + CHANGELOG
- [ ] Patterns mirrored, not reinvented

## Acceptance — Phase B (E2 이후)

- [ ] **선행 계약 충족 확인** — E2가 `VALID_VERDICTS`를 receipt 5종 + `unknown`으로 확장했고, `divergent` 엔트리가 스키마 통과함(미충족 시 B1 착수 금지)
- [ ] divergent ship이 ledger에 **기록된다**(누락 아님) 그리고 완료 판정 소비처가 그것을 완료로 세지 않는다
- [ ] ledger 소비처 10곳 전수 감사 완료
- [ ] 거짓 양성 3건 정정 또는 명시 격리
- [ ] 대조 불가 19건 `unverifiable` 표식
- [ ] untracked ledger 1건이 **B1 이후에** 회수됨
- [ ] 정정 후에도 `hash_bound` 불변(E4 결속 유지)
- [ ] Phase B 완료 후 `evidence-audit.js`가 `false_positive=0`을 보고(도구가 자기 수정의 검증자)

## Design Critique

- 트리거: `design_signal=true` (signal_file `receipt/write.js`) — **false positive**. control-plane이며 rendered surface 아님. 조용히 skip하지 않고 명시 판정.
- 라운드 1 / cap 2 · Verdict **CONVERGED**
- H15(heading depth ≤ 3) PASS · 나머지 3개 제약은 렌더 surface 부재로 N/A · `detect.mjs` → `[]`

## Codex Adversarial Review — R0 (원안 대상, 이력)

- 호출: `codex-invoke.js adversarial-review` (worktree 1.22.3 — cache 1.22.2 stale)
- 라운드 1 (R0 timeout 570s → focus 압축 후 511s `ok`) · threadId `019f8598-aeff-78a0-8853-2bcf33e186db`
- **Verdict: `needs-attention` — No ship** · *"this would publish false durable evidence and still loses evidence on common Phase 3 failure paths"*
- 세 건 전부 직접 검증 후 **ACCEPT_NOW**, 이연 0:

| Finding | Severity | 검증 | 최종 흡수 위치 |
|---|---|---|---|
| F1 ledger backfill이 divergent를 converged로 기록 | CRITICAL | 확인 | Phase B로 분리 + E2 별도 plan |
| F2 evidence-commit이 HEAD-키잉·rebase 도달성 파괴 | HIGH | 확인 | Task A4 (3부분) |
| F3 backfill cwd가 repo root만이 아님 | MEDIUM | 확인 | **R1 migration → R2 철회**(E4) → **R4 최종**: 신규는 A3 정규화, 유출 21건은 추적 제외(E7)로 노출 0건 |

R1판은 F1을 "차단"이 아니라 **범위 분리**로 흡수했다 — receipt는 참이므로 추적이 거짓을 만들지 않고, 거짓은 ledger 판정 필드에만 있다는 구분이 근거다. R2판은 F3 흡수 방식을 뒤집었다 — 재봉인이 ledger 결속을 끊는다는 실측(E4)이 나왔고, 노출 제거보다 결속 보존이 우선하기 때문이다.

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (**워크트리 1.22.3** — cache 1.22.2에는 `codex-review-payload.js`가 없어 구 blind runner. 그걸 썼다면 F5 재현 위험)
- 라운드 1 · 345s · `classification=ok` · threadId `019f85fd-1d9e-76b0-8aa5-39d199a1a5ef`
- verdict 판독: **구조화 `parseReviewPayload(envelope)`** → `needs-attention` (자유 텍스트 스캔 아님). `verdictToGate` → `divergent`
- **Verdict: `needs-attention` — No ship** · *"Phase A still durableizes false completion evidence, and the re-entry strategy creates unverifiable superseded state. The cwd leak is also avoidable without breaking the ledger binding."*
- 세 건 전부 코드로 재현 검증 완료(액면 수용 아님):

| Finding | Severity | 검증 | Verdict |
|---|---|---|---|
| F1 Phase A가 술어 수정 전에 live ledger 엔트리를 커밋 | CRITICAL | 확인 — `write.js:436`이 매 write마다 `triggerLedgerAppend`, `index.js:96`이 always-true `resolution.converged`로 게이팅 | **ACCEPT_NOW · R3 흡수** → E6 신설, ledger evidence-commit을 Phase A에서 제거 |
| F2 게이트 재진입이 receipt를 덮어쓰고 supersession 계약이 없음 | HIGH | 확인 — `store.js:96-101` `writeReceipt`는 고정 경로 덮어쓰기, `KNOWN_ENTRY_KEYS`에 `superseded_by` 부재(strict) | **ACCEPT_NOW · R3 흡수** → A4 part 3 철회, rebase 시 fail-closed HALT. 근본 해소는 Out of Scope |
| F3 cwd 노출은 회피 가능 — E4가 이분법 | MEDIUM | 기술적 타당 — 원자적 rebind(redact→rehash→ledger 갱신→rename→manifest) 가능 | **ACCEPT_NOW · R3 부분 흡수** → Out of Scope에 rebind 경로 명시 + Phase B가 자연 위치임을 기록. Phase A 무수정 결정은 유지 |

**R3 흡수 요지 — F1은 Codex가 말한 것보다 나빴다.** Codex는 "미래에 생산될 거짓 엔트리"를 지적했으나, 실측(E6)은 **오늘 당장**임을 보인다: ledger는 이미 28/29 tracked이고 유일한 untracked 1건이 정확히 거짓 양성 엔트리인데, Task B3이 그것의 커밋을 명시적으로 금지한다. 즉 R2판 A4는 첫 실행에서 B3 금지를 위반한다. 동시에 이 실측은 **F1의 해소를 쉽게 만든다** — ledger에는 애초에 Phase A가 닫을 durability gap이 없으므로, "술어를 먼저 고친다"(범위 폭증)가 아니라 **"ledger를 Phase A에서 빼면 된다"**가 답이다. 부수적으로 플랜 제목의 "ledger 커밋 타이밍 수리" 전제도 철회했다.

**F2의 자기모순 기록**: A4의 "게이트 재진입 선호"는 E4 결속을 보호하려고 R2에서 추가한 보완이었으나, 재진입이야말로 receipt를 덮어써 dangling 결속을 만든다. 결함을 제거한 게 아니라 다른 자리로 옮겼다. R3은 자동화를 포기하고 HALT로 바꿨다 — 안전하지 않다고 아는 전략을 자동 실행하느니 멈춘다.

### 라운드 2 (R3 흡수본 대상)

- 210s · `classification=ok` · threadId `019f8614-344f-78c0-a02a-493c3e602164` · 구조화 판독 → `needs-attention` (gate `divergent`)
- **"No-ship. F1 is closed for the original durability bug… F2 is not closed because overwrite risk still exists outside rebase. F3 is not closed because Phase A would knowingly commit absolute paths into git history before the rebind."**

| R1 finding | R2 판정 | R4 흡수 |
|---|---|---|
| F1 CRITICAL — ledger 거짓 커밋 | **CLOSED** | — |
| F2 HIGH — 덮어쓰기가 rebase 밖에서도 발생 | NOT closed | **A4 HALT 조건을 "tracked receipt를 다른 hash로 덮어쓰기"로 확대** + 실측 8건 dangling 기록 |
| F3 MEDIUM — 노출이 push 후 비가역 | NOT closed | **E7 — Phase A는 clean 12건만 추적**(유출 21건은 감사 기여 0). 노출 0건 · 무수정 · 증거 100% 보존 |

**R2가 옳았던 핵심**: F3의 비가역성 논거 — push 이후에는 Phase B rebind가 HEAD만 고칠 뿐 공개된 이력에서 경로를 제거하려면 history rewrite가 필요하다. R3까지 이 점이 명시되지 않아 "노출은 낮은 영향"이라는 평가가 불완전했다.

### 라운드 3 (R4 흡수본 대상)

- 336s · `classification=ok` · threadId `019f8637-5a32-7b32-a988-cfb4fbddbb30` · 구조화 판독 → `needs-attention` (gate `divergent`)
- **"F2 is not closed: R4 states the right HALT condition, but the concrete plan still does not place it in the receipt write path. F3's clean-12 strategy is directionally sufficient… but R4 still contains conflicting 33/leak-accepted instructions."**

| R3 finding | 판정 | R5 흡수 |
|---|---|---|
| F1 HIGH — HALT이 writer에 앵커되지 않음 | NOT closed | **A3-b 신설** — 가드를 `store.js#writeReceipt`의 fs write 직전으로 이관(모든 호출자 커버). 운영자 탈출구(**새 decision slug**) 명시. `overwrite-guard.test.js`가 rebase 미경유 같은-slug 반복을 writer 직접 호출로 고정 |
| F2 MEDIUM — clean-12가 잔존 33/수용 문구와 충돌 | NOT closed ("directionally sufficient") | **모순 전수 제거** — 추적 문맥 33→12, "명시 수용" 문구 3곳 철회, 유출 risk 행 교체. 33은 corpus/해시 감사 문맥에만 잔존. 7a zero-token 검사를 **push 전 필수 게이트**로 명시 |

**R3이 옳았던 핵심**: 조건을 옳게 적는 것과 **옳은 자리에 두는 것**은 다르다. `pr.md`의 가드는 이미 덮어쓴 뒤라 늦고 그 커맨드 밖 write를 못 막는다. 그리고 문서 내 모순은 그 자체로 미해소다 — 구현자가 어느 쪽을 따를지 문서가 정하지 못하면 비가역 유출 경로가 열린 채다.

### 라운드 4 (R5 흡수본 대상) — 수렴

- 711s · `classification=ok` · threadId `019f864d-b176-7d41-8d9e-e0d2debc3308` · 구조화 판독 → **`approve`** (gate `converged`) · **findings 0**
- **F1 CLOSED** — 가드가 `store.js#writeReceipt`의 write 직전으로 이동했고, 정본을 교체하는 writer들이 실제로 그 경로를 경유함을 Codex가 독립 확인(`write.js:412`, `:519`; `store.js:96-100`). 직접 쓰는 stamper 둘은 hash-carved 필드만 건드림(`briefing/index.js:69`, `completion-ledger/index.js:86`, `hash.js:212`, `:222`). 탈출구도 실재 확인(`decision.js:40`, `:204`).
- **F2 CLOSED** — A5가 clean 12건만 추적하고, 노출 수용이 철회됐으며, 잔존 `33`은 전부 corpus/해시 감사 문맥. 현 root `meta.cwd` 잔여는 low risk로 명시 기록됐고 receipt 스캔에서 `Users`/`AppData`/사용자명 hit 0건 확인.

**자체 정정 기록(R5, Codex 지적 전 선제)**: R5 초안은 A3-b의 근거로 "`writeReceipt`가 유일한 쓰기 지점"이라고 단언했으나 **부정확했다** — receipt 파일에 `fs.writeFileSync`하는 경로는 넷이다. 배치 결론은 유지되되 근거를 "정본을 교체하는 유일한 경로"로 정정하고 4경로 표를 명시했다. 이번 사이클에서 반복된 실패 형태(옳은 결론 + 과장된 근거)를 스스로 잡은 사례로 남긴다.

**게이트 상태**: 4라운드에서 **수렴**. `codex_verdict=converged`.

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (4라운드, `codex_verdict=converged`, findings 0). No new implement-time decisions detected — plan이 파일 구조·추상 경계·함수 계약·앵커 위치(예: `store.js#writeReceipt` fs write 직전 가드)까지 전수 pre-commit했고, 외부 의존/동시성 모델은 Out of Scope로 명시. `git diff origin/main..HEAD` ⊆ Files to Change (파일 확장 0). Cross-gate dedupe applied.
