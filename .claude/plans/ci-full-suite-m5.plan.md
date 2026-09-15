# Plan: ci-full-suite M5 — findings closure

**Source PRD**: `.claude/prds/ci-full-suite.prd.md`
**Selected Milestone**: 5 — findings-closure
**Complexity**: Small

## Summary

이 PRD가 연 CRITICAL 8건(redact 6 · enumerate 1 · run 1)은 코드로 닫혔을 가능성이 높은데도 검증 기록 없이 매 세션 SessionStart에 open으로 승입된다. M5는 (a) 8건을 c3 HEAD에서 재검증해 file:line 근거를 문서로 남기고, (b) 닫힘이 입증된 건만 **판정 원장**(`debt-inventory.js dispose`)에 넣을 batch 파일을 준비하며, (c) c2 worktree에 남은 근거 없는 registry close 잔재를 되돌린다. **registry 코드와 registry shard는 건드리지 않는다.** batch 적용은 closure-accounting M2(재봉인)가 착지한 뒤의 Task 3이다.

**원안에서 바뀐 것 (2026-09-14 c3 재측정).** 원안은 registry에 `finding_closed`를 쓰는 두 Task(흡수 경로 close 배선 · 과거 shard 사후 close 도구)였다. 둘 다 이미 코드와 사용자 판정이 닫은 경로라 삭제했다 — 근거는 `## Design Decisions` DD1·DD6. 운영자가 2026-09-14 "축소 + M2 대기"를 선택했다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | backlog 미흡수 항목 · open questions · 실측으로 발견한 수정사항을 반영한 수정 계획이어야 한다 | direction |
| UI2 | 이미 다른 milestone이 회수한 범위는 중복 구현하지 않고 새 slug로 분리한다 | constraint |
| UI3 | 리뷰 라운드를 늘리지 않는다 — cap 도달 시 마지막 리뷰의 미흡수 finding은 backlog에 기록된다 | constraint |
| UI4 | 게이트 receipt의 review verdict는 실제 divergent 값 그대로 봉인되며 converged로 위장하지 않는다 | constraint |
| UI5 | OQ2(mkTmpRepo 6-spawn)는 PRD가 별도 축으로 명시 이월했으므로 이번 범위에서 제외한다 | exclusion |
| UI6 | M5는 CRITICAL 8건 재검증 문서와 dispose batch 파일 준비로 축소하고 registry 코드 변경은 0건이다 | direction |
| UI7 | dispose batch 적용은 closure-accounting M2 재봉인 이후로 미루고 선행 의존으로 명시한다 | constraint |
| UI8 | c2 worktree에 남은 근거 없는 registry close 잔재는 되돌린다 | direction |

## Evidence (c3 HEAD `43aeedb` = `origin/main` `af05240` 트리 · 2026-09-14 실측)

| 축 | 실측 |
|---|---|
| registry 규모 | 56 shard · `finding_opened` 1706 · `finding_closed` 19 · `finding_adjudicated` 0 · fold 후 open 1438 · 승입 대상(HIGH+CRITICAL) **507** · open CRITICAL 35(이 PRD 소유 8) |
| 대상 8건 | `findings:99ba4ae4289a3d21` · `e797f7d884806e1f` · `69b08f8343fb33bc` · `31964e8ab2ae3e88` · `ccca5ddc9dbe2a50` · `43460bad38d361d9`(ci-full-suite-m1 · santa-loop) · `639d7374f2f4d904`(m3a · plan-codex invariant) · `a1ce669aebc9a95a`(m3b · plan-codex invariant). opened_at 2026-09-02~04 |
| 봉인 밖 | 봉인 `sealed_at 2026-09-01T01:21:41Z`(`docs/multi-session-work-loop/debt-inventory.json` meta) — 8건 전부 인벤토리 부재. `dispose`는 `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:495-497`에서 거부한다 |
| 승입 억제 경로 | `plugins/mccp/scripts/state/handoff-items.js:139-164` — 판정 원장의 해소 판정(`fixed`·`obsolete`·`superseded`·`duplicate`)만 억제한다. registry close는 이 표면을 끄는 경로가 아니다 |
| claim 원문 부재 | registry `ALLOWED_FIELDS`(`plugins/mccp/scripts/state/findings-registry.js:71-104`)에 `claim`이 없고 `claim_digest`만 있다 — 원문은 리뷰 기록에서 `claimDigestOf` 대조로 찾아야 한다 |
| glob-breadth (m3a) | `max_excluded_files` 래칫 — `scripts/test-suite/coverage.js:154` · `scripts/test-suite/gate.js:207` · CI workflow `test-suite.yml`의 floor 대조 step |
| suite fail-open (m3b) | `scripts/test-suite/gate.js:189-192` `exit_code !== 0` → `stage 1 suite_red`. 라이브 발화 run `34174703512`(M3 §7a) · `34556517175`(M4 절단 A) |
| redact (m1) | `scripts/test-suite/run.js:326` `redaction_ok !== true` 병합 거부. **문서화된 잔여**: `scripts/test-suite/redact.js:153-154` — A-2 퍼센트 디코드 미구현 · UNC root에서 `createRedactor` ~2.7초 블록 |
| c2 잔재 | `.worktrees/c2-orchestrator-step-wiring` 16 shard에 **추가만** 77줄(`finding_closed/fixed` 8 · `/deferred` 69 · 삭제 0 · `cited_path:null` 77) + untracked marker `.claude/state/findings/.m4-legacy-close.json`. 같은 디렉토리의 untracked `orchestrator-step-wiring-m4.jsonl`(6줄)은 c2 자신의 게이트 산출물 |

## Design Decisions

- **DD1 — registry에 close를 쓰지 않는다.** 세 곳이 독립적으로 이 경로를 닫았다: `docs/multi-session-work-loop/feedback-loop-design.md` §2(`ACCEPT_NOW`→`null`, 수용을 해소로 계상하는 것은 조작 경로) · §4(`fixed`는 라운드 간 비재발로만) · `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:11-19`(다른 work unit의 finding을 registry에서 닫으면 C1 분자 조작). 판정은 판정 원장이 받는다.
- **DD2 — batch는 준비만 하고 적용하지 않는다.** 8건이 봉인 밖이라 지금 `dispose`는 전량 거부된다(all-or-nothing). 재봉인은 closure-accounting M2 소관이므로(UI2) 여기서 봉인을 건드리지 않는다.
- **DD3 — batch evidence는 `#<pr>`을 우선한다.** path:line은 M2 대기 동안 drift한다. 닫는 코드를 착지시킨 PR 번호는 불변이다. 문서는 path:line과 측정 HEAD sha를 함께 싣는다. PR을 특정할 수 없으면 path:line으로 쓰고 문서에 측정 sha를 남긴다.
- **DD4 — 잔여 축에 걸린 지적은 `fixed`를 받지 않는다.** 억제는 해소 판정만 한다(`handoff-items.js:146-151`). 문서화된 잔여(퍼센트 디코드 · UNC)에 해당하는 지적에 `fixed`를 붙이면 미해소 결함을 승입 표면에서 끄는 것이 된다. 그 건은 문서에 `residual`로 적고 open으로 남긴다.
- **DD5 — c2 되돌림 범위는 추가된 77줄과 marker뿐이다.** `git diff`가 추가만 보이므로 `checkout --`가 정확히 그 77줄을 지운다. `orchestrator-step-wiring-m4.jsonl`은 c2 게이트의 정당한 산출물일 수 있어 건드리지 않는다.
- **DD6 — 원안 Task 1(흡수 close 배선)은 삭제한다.** 패널 모드 종결 producer는 closure-accounting M3가 2026-09-14 사용자 판정으로 합성 producer를 금지하고 DAR #1.5로 이관했다(c11 worktree `.claude/plans/closure-accounting-m3.plan.md` UI6·UI9). 중복 구현이다(UI2).

## Out of Scope

- 이 PRD 밖 open CRITICAL 27건 · HIGH 472건
- registry C1 수치 변경 · `CLOSURE_FROM_ADJUDICATION` · `emitPanelClosures`
- 재봉인 · 판정 원장 스키마 (closure-accounting M2·M3)
- OQ2 mkTmpRepo 6-spawn (UI5)

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 판정 batch 형식 | `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:825-845` | 한 줄 한 JSON(`item_id` · `disposition` · `evidence` · `note`), all-or-nothing 적용 |
| evidence 형태 | `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:129-160` `classifyEvidence` | `<path>:<line>` · 40-hex sha · `#<pr>`만 수용 |
| 미충족 기록 | `docs/ci-full-suite/m4-live-closure.md` | 반올림하지 않고 표로 열거, 미충족은 사유와 함께 |
| 증거 문서 위치 | `docs/ci-full-suite/axis-d-a-gate.json` | 이 PRD의 증거는 `docs/ci-full-suite/`에 tracked |

## Files to Change

| File | Action | Why |
|---|---|---|
| `.claude/plans/ci-full-suite-m5.plan.md` | UPDATE | 본 plan (untracked 초안을 c3 재측정으로 개정) |
| `.claude/prds/ci-full-suite.prd.md` | UPDATE | M5 행 서술 정정(registry close → 판정 원장 · M2 선행 의존) |
| `docs/ci-full-suite/m5-findings-closure.md` | CREATE | 8건 판정표(file:line · 측정 sha) · c2 잔재 처리 기록 · Task 3 트리거 |
| `docs/ci-full-suite/m5-dispositions.jsonl` | CREATE | `fixed` 판정분 dispose batch (적용은 Task 3) |

코드 파일 변경 0건 · `plugin.json` 변경 0건(§3.7).

## Tasks

### Task 0: 8건 재검증 문서
- **Action**: 8건 각각의 claim 원문을 `claimDigestOf` 대조로 찾는다(후보: `.claude/reviews/plan-review-ci-full-suite-m1.md` · `-m3a.md` · `-m3b.md` · santa-loop 원장). c3 HEAD에서 그 지적이 가리키는 실패가 지금도 재현되는지 코드와 test로 확인하고 판정한다: `fixed`(닫힘 입증) · `residual`(문서화된 잔여 축에 해당, DD4) · `open`(원문 미발견 또는 입증 불가). 표 열은 `| finding_id | 출처 | 판정 | 코드 근거(path:line) | batch evidence |`. 문서 머리에 측정 HEAD sha를 적는다.
- **Mirror**: `docs/ci-full-suite/m4-live-closure.md` 표 형식
- **Validate**: Validation V1

### Task 1: dispose batch 준비
- **Action**: Task 0에서 `fixed`로 판정한 건마다 `{"item_id":"findings:<16hex>","disposition":"fixed","evidence":"#<pr>","note":"docs/ci-full-suite/m5-findings-closure.md"}` 한 줄을 `docs/ci-full-suite/m5-dispositions.jsonl`에 쓴다. `residual`·`open`은 싣지 않는다. **`dispose`를 실행하지 않는다**(DD2).
- **Mirror**: `debt-inventory.js:825-845` batch 형식 · `:129-160` evidence 형태
- **Validate**: Validation V2 · V3

### Task 2: c2 잔재 되돌리기
- **Action**: 되돌리기 직전 c2 diff를 다시 재서 여전히 "추가만 77줄 · 전부 `finding_closed` · `cited_path:null`"인지 확인한다. 달라졌으면 멈추고 보고한다. 같으면 **사용자 확인 후** `git -C .worktrees/c2-orchestrator-step-wiring checkout -- <16 shard>` + marker 삭제. `orchestrator-step-wiring-m4.jsonl`은 건드리지 않는다(DD5). 결과를 문서에 기록한다.
- **Validate**: Validation V4

### Task 3 (차단됨 — closure-accounting M2 착지 후)
- **트리거**: closure-accounting PRD M2 행이 `complete`로 main에 머지되고 V3가 `ready`를 출력한다.
- **Action**: `node plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js dispose --batch docs/ci-full-suite/m5-dispositions.jsonl` → `debt-inventory.js verify`로 판정 결속 확인 → SessionStart open-findings 표면(`handoff-items.js`)에서 `fixed` 판정분 부재 확인. 그 뒤 PRD M5 행을 `complete`로 올린다.
- **Validate**: 적용 직전 V2 · V3(`ready`) 재실행 → 적용 후 `node plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js verify --json`에서 batch 8건 이하가 유효 판정으로 집계되고 invalid 0
- **이번 사이클에서는 수행하지 않는다.** M5 행은 Task 0~2 착지 후에도 `in-progress`로 남는다.

## Validation

```bash
# V1 — 문서가 8건을 전부 싣고 각 행이 판정 + 코드 인용을 갖는다
node -e '
const t=require("fs").readFileSync("docs/ci-full-suite/m5-findings-closure.md","utf8").split("\n");
const ids=["99ba4ae4289a3d21","e797f7d884806e1f","69b08f8343fb33bc","31964e8ab2ae3e88","ccca5ddc9dbe2a50","43460bad38d361d9","639d7374f2f4d904","a1ce669aebc9a95a"];
const bad=ids.filter(id=>{const r=t.find(l=>l.startsWith("|")&&l.includes(id));return !r||!/\|\s*(fixed|residual|open)\s*\|/.test(r)||!/[\w./-]+\.\w+:\d+/.test(r)});
if(bad.length){console.error("V1 FAIL",bad);process.exit(1)}console.log("V1 ok")'

# V2 — batch 줄이 전부 fixed · evidence 형태 유효 · registry의 open finding · 문서의 fixed 집합과 일치
node -e '
const fs=require("fs"),root=process.cwd();
const debt=require("./plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js");
const reg=require("./plugins/mccp/scripts/state/findings-registry.js");
const open=new Set(reg.readAll({repoRoot:root}).findings.filter(f=>f.state==="open").map(f=>"findings:"+f.finding_id));
const rows=fs.readFileSync("docs/ci-full-suite/m5-dispositions.jsonl","utf8").split("\n").filter(l=>l.trim()).map(JSON.parse);
const doc=fs.readFileSync("docs/ci-full-suite/m5-findings-closure.md","utf8").split("\n").filter(l=>/\|\s*fixed\s*\|/.test(l)).map(l=>"findings:"+(l.match(/[0-9a-f]{16}/)||[""])[0]);
for(const r of rows){if(r.disposition!=="fixed")throw new Error("non-fixed "+r.item_id);const c=debt.classifyEvidence(r.evidence,root,{allowBarePath:false});if(!c.ok)throw new Error("evidence "+r.item_id+": "+c.reason);if(!open.has(r.item_id))throw new Error("not open "+r.item_id)}
const a=rows.map(r=>r.item_id).sort().join(),b=doc.sort().join();if(a!==b)throw new Error("batch/doc mismatch "+a+" vs "+b);
console.log("V2 ok",rows.length)'

# V3 — 봉인 의존 관측(read-only). 이번 사이클 기대값은 blocked
node -e '
const inv=require("./docs/multi-session-work-loop/debt-inventory.json");const have=new Set(inv.items.map(i=>i.item_id));
const rows=require("fs").readFileSync("docs/ci-full-suite/m5-dispositions.jsonl","utf8").split("\n").filter(l=>l.trim()).map(JSON.parse);
const miss=rows.filter(r=>!have.has(r.item_id)).length;
console.log(miss===0?"V3 ready — Task 3 적용 가능":"V3 blocked — "+miss+"/"+rows.length+" 봉인 밖 (sealed_at "+inv.meta.sealed_at+")")'

# V4 — c2 잔재 부재 (c2 게이트 산출물 1파일 제외)
C2=../c2-orchestrator-step-wiring
test -z "$(git -C "$C2" status --porcelain -- .claude/state/findings/ ':!.claude/state/findings/orchestrator-step-wiring-m4.jsonl')" \
  && test ! -e "$C2/.claude/state/findings/.m4-legacy-close.json" && echo "V4 ok"

# V5 — 번호 선언 없음 (§3.7)
node scripts/version-declaration-guard.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 재검증이 실제 미해소 지적을 `fixed`로 판정한다 | 중 | 원문 미발견·재현 확인 불가는 `open`, 잔여 축은 `residual`(DD4). `fixed`마다 코드 근거 필수(V1) |
| closure-accounting M2가 batch 계약(item_id 형태 · evidence 규칙)을 바꾼다 | 낮음 | Task 3 적용 직전 V2·V3 재실행. all-or-nothing이라 부분 적용이 없다 |
| M2가 착지하지 않아 M5가 `in-progress`에 머문다 | 중 | 반올림하지 않는다 — PRD 행과 문서에 선행 의존을 명시 |
| c2 worktree에 다른 세션이 살아 있어 되돌림이 그 작업을 지운다 | 낮음 | Task 2가 직전 재측정 + 사용자 확인. diff가 77줄 추가와 다르면 멈춘다 |

## Acceptance

- [ ] Task 0~2 완료 + V1·V2·V4·V5 통과
- [ ] V3가 이번 사이클에서 `blocked`를 출력하고 그 사실이 문서와 PRD M5 행에 적힘
- [ ] 8건 각각의 판정과 file:line 근거가 문서에 있음 (`residual`·`open`은 사유 포함)
- [ ] c2 worktree에 근거 없는 close 잔재가 없음
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 — 이번 사이클의 라이브 경로는 V2(실제 `classifyEvidence` · 실제 registry 판독)와 V3(실제 봉인 판독)이다. **`dispose` 적용과 SessionStart 억제 관측은 Task 3로 미충족이며 반올림하지 않는다**

## Design Critique

- round 0/2 · verdict `CONVERGED` · findings `[]`
- 트리거: detector `signal_files: ["<keyword:design>"]` — `## Design Decisions` 제목의 키워드 적중. 렌더 표면 파일 0건(Files to Change는 PRD 행 · plan · 증거 md · jsonl batch).
- `impeccable detect .claude/plans/ci-full-suite-m5.plan.md` exit 0 · 출력 0건. 비평할 인터페이스가 없어 A/B 서브에이전트 · 브라우저 검사 · snapshot은 수행하지 않았다(대상 부재). Questions skipped: 비대화형 게이트이며 대상에 디자인 표면이 없다.

## Design Routing Guide

routing mode: auto (effective at implement stage). 이 plan은 렌더 표면을 바꾸지 않으므로 implement 단계에서 발화할 명령이 없을 것으로 본다 — 아래는 게이트가 생성한 체크리스트다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
