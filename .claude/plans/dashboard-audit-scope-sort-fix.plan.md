# Plan: dashboard-audit enumerate scope·정렬 근본 결함 수정

**Source**: free-form (세션 진단 — "위험 5건 해결 마크했는데 여전히 5건 표시")
**Selected Milestone**: stale-audit enumerate 정합성 (단일 patch)
**Complexity**: Small

## Summary

`dashboard-audit`의 `enumerate.js`가 (1) `kindRank` 정렬에서 `0 || 9` falsy 버그로 가장 stale한 milestone 후보를 리스트 맨 뒤로 보내고, (2) derive(대시보드 표시)가 읽지 않는 `.claude/PRPs/plans/completed/`를 superset으로 스캔해 대시보드에 무효한 항목을 audit 대상 앞쪽에 채운다. 두 결함이 겹쳐, audit이 "대시보드에 실제로 뜨는 항목"을 올바른 우선순위로 노출하지 못한다. 정렬을 nullish 기준으로 고치고 scope를 derive와 정합해 닫는다.

## 근본 원인 (이번 세션 증거)

증상: dashboard-audit으로 위험 5건을 마크하려 했으나 대시보드는 계속 5건 표시. 실제 소스(`dashboard-readability-m3.plan.md`)엔 마커가 없었음(git 히스토리·working tree 모두).

1. **정렬 버그 (`0 || 9`)** — `enumerate.js:173`. `kindRank = { milestone: 0, risk: 1, oq: 2 }`인데 `(kindRank[a.kind] || 9)`가 milestone rank `0`을 falsy 단락으로 `9`로 대체 → milestone이 unknown과 동일 rank로 맨 뒤. 합성 fixture로 `items[0].kind=risk`(milestone이어야 정상) 확인. 주석 line 170 "가장 stale 후보 우선: milestone → risk/oq" 와 정반대.
2. **scope 불일치** — `enumerate.js:30-31`이 `DISPLAY_PLAN_DIRS.concat([completed])`로 completed/를 포함하지만 `derive/sources/plans.js`의 `PLAN_DIRS`는 completed/ 제외. 확정: derive 위험 중 completed/ 출처 = 0건 → completed/ 마킹은 대시보드에 무효. 게다가 `.claude/PRPs/plans/completed/`(대문자 P)가 알파벳순으로 `.claude/plans/`보다 앞서 리스트 맨 앞 차지.
3. **증폭(수정 대상 아님)** — 리스트 170개 + 이전 세션 silent crash. 위 1·2가 고쳐지면 crash 시에도 중요 항목(milestone·대시보드 표시 항목)이 앞에 와 우선 처리됨.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/lib/stale-audit/enumerate.js:30` | `require('../../derive/sources/plans')` 로 derive scope를 SSoT로 import |
| 정렬 안전 | `plugins/mccp/scripts/lib/stale-audit/enumerate.js:172` | 기존 sort comparator 구조 유지, 등급 lookup만 nullish-safe로 |
| Tests | `plugins/mccp/scripts/lib/stale-audit/tests/enumerate.test.js:71,81` | 합성 tmp fixture(`.claude/plans`+`.claude/prds`) 후 `enumerate({repoRoot})` assert |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/stale-audit/enumerate.js` | UPDATE | 정렬 `\|\| 9`→nullish, completed/ superset 제거(scope=derive), 주석 정정 |
| `plugins/mccp/scripts/lib/stale-audit/tests/enumerate.test.js` | UPDATE | 정렬(milestone 우선)·scope(completed/ 제외) 회귀 테스트 추가 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | patch bump `1.20.0 → 1.20.1` (§3.7 — 단일 결함 수정) |

## Tasks

### Task 1: 정렬 kindRank nullish-safe
- **Action**: `enumerate.js` sort comparator의 `(kindRank[a.kind] || 9)`를 `(kindRank[a.kind] ?? 9)`로 (양변). milestone rank `0`이 보존돼 맨 앞으로.
- **Mirror**: 기존 comparator 구조·tie-break(source→lineNumber) 그대로.
- **Validate**: 합성 fixture(in-progress milestone + risk 혼재)에서 `items[0].kind==='milestone'`.

### Task 2: enumerate scope = derive scope (completed/ superset 제거)
- **Action**: `enumerate.js:30-31`을 `const { PLAN_DIRS } = require('../../derive/sources/plans')`로 단순화(completed/ concat 삭제). line 24-31 주석을 "audit 대상 = 대시보드 표시 항목(derive scope SSoT)"로 정정. `path` import는 PRD_DIR에서 계속 쓰이므로 유지. enumerate ⊇ derive 계약은 completed/ 제거 후에도 유지(derive에 completed/ 없음 → enumerate == derive scope).
- **Mirror**: `derive/sources/plans.js` PLAN_DIRS를 유일 진실원으로.
- **Validate**: `enumerate()` 결과에 `completed/` 출처 항목 0건. 기존 `enumerate ⊇ derive`(top-level `.claude/PRPs/plans`) 테스트(line 81) 여전히 통과.

### Task 3: 회귀 테스트
- **Action**: enumerate.test.js에 2개 추가 — (a) 정렬: in-progress milestone이 risk/oq보다 앞(합성 PRD+plan), (b) scope: `.claude/PRPs/plans/completed/`에 위험 둔 fixture가 enumerate에 안 잡힘.
- **Mirror**: line 71/81 기존 fixture 패턴(tmp dir + 파일 생성 + enumerate).
- **Validate**: `node --test plugins/mccp/scripts/lib/stale-audit/tests/enumerate.test.js`.

## Validation

```bash
node --test plugins/mccp/scripts/lib/stale-audit/tests/enumerate.test.js
node --test plugins/mccp/scripts/lib/stale-audit/tests/apply.test.js
# 전체 회귀(enumerate 소비자 확인)
node --test plugins/mccp/scripts/lib/stale-audit/tests/
# 실제 repo에서 milestone 우선·completed 제외 확인
node plugins/mccp/scripts/lib/stale-audit/enumerate.js --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const c=j.items.filter(x=>String(x.source).includes("completed/")).length;console.log("completed/ 출처:",c,"(0이어야)");})'
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| completed/ 제거가 서버 --write UI resolve의 id 매칭을 깸 | LOW | UI 버튼은 renderer(derive scope)가 그린 항목에만 존재 → completed/ 항목엔 버튼 자체가 없음. enumerate==derive로 오히려 정합 상승. 기존 line 81 계약 테스트로 가드 |
| 정렬 변경이 apply↔enumerate lineNumber parity를 흔듦 | LOW | 정렬은 노출 순서만 변경, ref의 source/ordinal/lineNumber 필드는 불변. locate.js 매칭은 순서 독립. apply.test.js로 가드 |
| milestone 우선 노출이 기존 audit 습관과 달라짐 | LOW | 의도된 개선(주석 명시 우선순위 복원). 사용자 관측 표면은 제안 테이블뿐 — 항목 집합 동일, 순서만 truthful |

## 스코프 제외 (별도 축)

- **milestone 자동 완료 감지 실패**: readability M3가 PR #81(squash) merge됐는데 M5 `isMilestoneClosed`(terminal-receipt/ledger)가 못 잡아 in-progress로 남은 문제. 이번 세션은 수동 flip으로 해결. squash merge 후 plan_hash/receipt 부재 원인 조사는 completion-ledger/M5 축 — backlog. 근거: 이 plan은 "audit이 올바른 대상을 올바른 순서로 노출"에 한정.
- **리스트 cap 기본값**: `--limit` 기본 무제한. Task 1·2로 우선순위가 truthful해지면 crash 시에도 중요 항목 우선 처리 → 완화. UX 개선은 후속.

## Acceptance

- [ ] Task 1-3 완료
- [ ] Validation 전부 통과 (milestone 우선 + completed/ 0건)
- [ ] plugin.json 1.20.1 bump
- [ ] 패턴 재사용(derive PLAN_DIRS SSoT), 재발명 없음

## Codex Adversarial Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1
- 합치 결론: plan 방향(`?? 9` 정렬 수정 + completed/ scope 제거 + 회귀 테스트 + patch bump)이 근본 원인을 정확히 겨냥. Codex는 working-tree diff에 아직 코드가 없음을 관찰(HIGH) — plan-codex 게이트의 정상 상태(구현은 prp-implement)이며, Codex recommendation이 plan Task 1-3과 동일.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1: root-cause fix가 diff에 미구현 (enumerate.js:173 `\|\| 9`, :31 completed concat 잔존) | HIGH | ACCEPT_NOW (via prp-implement) | plan-codex는 plan을 리뷰; 코드 변경은 다음 게이트가 소유. plan이 이미 정확한 수정(Task 1-3)을 명시 → 구현 단계로 이월. plan 자체 결함 아님 |
- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 0)
- Codex session 참조: threadId `019f1d6e-7814-78d0-a68d-ae2386a3ea19`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
