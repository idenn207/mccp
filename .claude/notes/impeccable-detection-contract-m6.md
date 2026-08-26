# impeccable-detection-contract M6 — 게이트 산출물 · 실측 · 라이브 증거

> plan: `.claude/plans/impeccable-detection-contract-m6.plan.md`
> 이 파일이 M6의 게이트 산출물을 소유한다. M1~M5와 같은 이유다 — plan 본문을 고치면 봉인된
> plan-codex receipt가 stale이 되므로 게이트 출력은 여기 쓴다. (예외: 명령 본문이 의무화한
> `## Codex Implementation Review` 섹션만 plan에 주입했고, 그 주입은 receipt write **이전**에
> 일어나 implement receipt의 `plan_hash`가 주입 후 본문을 가리킨다.)

## 게이트 진입 기록 — 슬러그가 또 어긋났다 (M4 선례 재발)

`/mccp:plan`이 plan 경로가 아닌 이름으로 호출돼 `mccp-plan-codex`가 **부모 슬러그**
`impeccable-detection-contract`에 실렸다. `/mccp:prp-implement`는 plan basename에서
`impeccable-detection-contract-m6`을 도출하므로 체인 검증이 missing으로 떨어졌다.

| 대조 | 값 |
|---|---|
| 이 plan의 리뷰 시점 `hash-markdown` | `sha256:887fc89d67c5c742aecbe60c435bca1ab06ad3d2c261e552b66b6477b1a32272` |
| `mccp-plan-codex/impeccable-detection-contract.json` 의 `plan_hash` · `reviewed_plan_hash` | **양쪽 다 동일** |
| 그 receipt의 `decision_id` | `impeccable-detection-contract` (`-m6` 아님) |
| `validate --command mccp:prp-implement --decision …-m6` | `ok:false` · **missing 1건뿐** (stale·blocking·open_critical 전부 0) |
| plan 게이트 verdict | `converged` · `review_source=multi-agent` · L2 quorum 4/4 pass · `review_wall_clock_ms=805782` (13.4분) |

즉 **패널은 바로 이 본문을 읽고 수렴했고**, 어긋난 것은 파일 이름뿐이다. §3.16이 금지한
receipt 위조(파일명 변경)를 쓰지 않았고, 재실행(같은 본문에 13.4분 패널 재지불, 새 정보 0)도
쓰지 않았다. `MCCP_RECEIPT_GATE_MODE=soft`(이미 `.claude/settings.json`에 상주 — hook이
informational ALLOW를 낸 이유)의 의미를 read-back에서도 지켰다: **missing-only만 통과**시키고
stale/blocking/open_critical이 하나라도 있으면 정지. M4가 같은 상황에서 §3.16 감사 우회를 쓴
선례와 같은 축이다(M5 노트 "슬러그가 이번에는 맞았다" 참조).

## Task 0 — 착수 전 실측

### (a) 죽은 `.claude/cache/` 분기 봉인

```bash
git ls-files .claude/cache/                                     # → 빈 출력
git check-ignore -v .claude/cache/STATUS.md .claude/cache/status.html
```

```
.gitignore:131:.claude/cache/	.claude/cache/STATUS.md
.gitignore:131:.claude/cache/	.claude/cache/status.html
```

파일 집합이 `git diff --name-only HEAD` ∪ `git ls-files --others --exclude-standard`이고
`.gitignore:131`이 두 경로를 **양쪽 모두에서** 배제하므로 그 분기는 어떤 입력으로도 참이 될 수
없다. 분기의 실재 위치:

```
471:  const cache = /\.claude\/cache\/(STATUS\.md|status\.html)$/;
472:  const isSurface = (f) => ui.test(f) || cache.test(f);
1218:  const cache = /\.claude\/cache\/(STATUS\.md|status\.html)$/;
1219:  const isSurface = (f) => ui.test(f) || cache.test(f);
```

> **plan의 V7 검증 명령이 틀렸다 — 실측으로 확인.** plan은
> `grep -n "claude/cache" plugins/mccp/commands/prp-implement.md`로 "isSurface 안에 hit 0"을
> 검증한다. 그러나 소스는 슬래시를 이스케이프한 `/\.claude\/cache\/…/` 형태라 리터럴
> `claude/cache`를 **포함하지 않는다**. 그 grep은 변경 전에도 isSurface 안에서 0 hit이고
> (819행의 산문 `.claude/cache/*.md` 하나만 잡힌다) 변경 후에도 0 hit이므로 **결코 붉어질 수
> 없는 검증**이다. 대체: `grep -n 'claude..cache' …` — 그 패턴은 "claude"와 "cache" 사이에
> **두 글자**를 요구하므로 이스케이프 형태만 잡고 819행 산문(`claude/cache`, 한 글자)은 잡지
> 않는다. 실측: 변경 전 **2 hit**(471·1218) → 변경 후 **0 hit**. 실제로 falsifiable하다. 이 정정은 §3.16이 금지하는 "리뷰어 프롬프트 완화"가
> 아니라 검증 명령이 자기가 주장하는 것을 측정하지 못하는 결함의 수정이다.

### (b) 여분 키 legacy 위험 — 0건

저장소 전 receipt를 훑어 `meta.impeccable_commands_routed` 항목의 키 집합을 셌다.

```
receipts with routed array: 1 | entries: 5 | non-canonical: 0
keysets: {"call_form,command,status":5}
```

plan 기재(receipt 1건 · entry 5건 · 비정규 0건)와 일치. whitelist 도입의 **소급 거부 위험이
0**이므로 legacy 예외를 두지 않는다(예외가 곧 위조 통로라는 DD1 근거).

### (c) A/B/C 기준선

```bash
node plugins/mccp/scripts/lib/env-contract/measure-evidence.js --json
```

```json
{ "A": 115, "B": 24, "C": 5, "not-consumed": 19 }
```

plan 기재와 일치. Task 5(창/매처 통합)·Task 7(주석 정정)은 이 수치를 **바꾸지 않아야** 한다.

### (d) 현재 탐지 상태 — 회귀 없음

```bash
node plugins/mccp/scripts/lib/impeccable-detect.js resolve --json
node plugins/mccp/scripts/lib/dep-check.js
```

```
available:true · reason:ok · invocation:impeccable:impeccable · source:plugin
version:4.1.1 · shadowed:false · eclipsed:[]
```

```
codex plugin    : installed (v1.0.6)
impeccable skill: available (plugin v4.1.1, impeccable:impeccable)
impeccable CLI  : missing  [telemetry only — no gate reads this]
codex disabled  : no
```

M2가 세운 "판정 권한은 `available` 하나, CLI는 telemetry"가 출력에 그대로 드러난다.

### (e) STATE.md `dep_check_missing: impeccable`은 stale이다

`.claude/state/STATE.md:14`가 `dep_check_missing: impeccable`을 들고 있으나 (d)가 반증한다.
설치된 plugin cache가 `1.31.0`(**pre-M1**)이라 SessionStart hook이 M1 이전 탐지기로 그 값을
썼다. 따라서 PRD Success Metric "SessionStart 오탐 0건"은 **이 머신에서 지금 확정할 수 없다** —
머지 + `claude plugin update` 이후로 명시 이연한다. 이 값은 hook이 소유하므로 §3.2대로 직접
편집하지 않는다.

같은 축의 실재 드리프트 1건은 고친다(Task 10): `.claude/state/fix-task-applied.md`의
`task_fingerprint: impeccable-detection-contract-m4` ↔ `decision_id: impeccable-detection-contract-m5`.

## Task 9 — PRD Open Questions 3건 측정 (2026-08-23)

형식은 M3 Task 0을 미러한다: **측정 방법 · 관측 · 판정할 수 없는 것**을 나눠 적는다.

### (a) hook 이중 등록의 실제 영향 — 정적 증거로 판정, 라이브는 잔여

**측정 방법.** DD7대로 npm CLI 3.6.0을 임시 설치하지 않았다(설치는 M3가 제거한 섀도잉을
되살린다). 대신 세 표면의 **선언**을 각각 읽어 구성으로 판정했다 —
plugin 4.1.1의 `hooks/hooks.json`, 사용자 `~/.claude/settings.json`의 hooks,
mccp의 `plugins/mccp/hooks/hooks.json`.

**관측.**

| 표면 | 이벤트 | matcher | 비고 |
|---|---|---|---|
| impeccable plugin 4.1.1 | `PostToolUse` | `Edit|Write` | timeout 5 · "Checking UI changes" |
| impeccable plugin 4.1.1 | `Stop` | (없음) | timeout 30 · "Design deep pass" |
| 사용자 `~/.claude/settings.json` | `PreToolUse` | `Write|Edit|MultiEdit` | `impeccable-guard.ps1` — **사용자 작성** |
| 사용자 `~/.claude/settings.json` | `PostToolUse` | `Skill` | `impeccable-flag.ps1` — **사용자 작성** |
| mccp | `Stop` | `*` × 7 | `stop-review-loop` 등 |

**판정 1 — 현재 구성에서 이중 발화는 없다.** plugin의 `PostToolUse`는 matcher가
`Edit|Write`이고 사용자 항목의 `PostToolUse`는 `Skill`이라 **겹치지 않는다**. 사용자
`PreToolUse` 항목은 애초에 다른 이벤트다. 즉 이 머신에서 impeccable 디자인 hook은 편집 1회당
**정확히 1회** 돈다. PRD가 우려한 이중 등록은 **plugin과 npm CLI가 동시에 설치된 경우**에만
성립하는데, CLI는 설치돼 있지 않다(`dep-check`: `impeccable CLI: missing`).

**판정 2 — Stop 상호작용은 가산적이고 교차 오염이 없다.** mccp는 `Stop`에 7개 그룹을
선언하고 impeccable이 8번째를 더한다. 하니스는 둘 다 돌리지만 mccp의 Stop-loop은 자기 상태
파일(`.claude/state/loop-counter.json`)로만 판정하므로 다른 hook의 출력에 반응하지 않는다.
남는 실제 영향은 **지연**이다(impeccable Stop hook timeout 30s가 mccp의 Stop 체인에 더해진다).

**판정할 수 없는 것.** CLI가 설치된 환경에서 편집 1회당 hook이 실제로 2회 도는지의 **라이브
관측**. 위는 선언을 읽은 **구성 판정**이며 라이브 측정이라 부르지 않는다(DD7). 그 측정을
하려면 CLI를 설치한 별도 환경이 필요하고, 이 저장소에서는 그것이 M3가 닫은 섀도잉을 다시
연다.

### (b) Node 하한 — 올리지 않는다. 벤더가 이미 degraded를 설계했다

**측정 방법.** plugin 4.1.1의 hook command 문자열을 그대로 읽었다.

**관측.** 두 hook 모두 본문 실행 **전에** 자기 자신을 게이트한다:

```
node -e "process.exit(Math.min(parseInt(process.versions.node,10),22)===22?0:1)"
  || { D="$HOME/.impeccable"; [ -f "$D/node-unsupported" ] || {
       mkdir -p "$D" && : > "$D/node-unsupported" &&
       printf '%s' '{"systemMessage":"The impeccable design hook is not running: no Node 22
       or newer on PATH. Install one, or remove the impeccable hook from your harness settings."}'; };
     exit 0; }
```

Node major < 22이면 hook은 **실행되지 않고 exit 0**으로 끝나며, marker 파일을 한 번만 만들고
systemMessage를 한 번만 낸다. 즉 **벤더 자신이 Node < 22를 지원되는 degraded 상태로 설계했다** —
실패가 아니라 자기 비활성화다.

**판정 — mccp의 Node 하한 20+를 유지한다.** 하한을 올리면 mccp 전 사용자가 **선택적 의존**
하나 때문에 런타임을 올려야 하고, 그것은 §1.1이 세운 "impeccable은 번들하지 않는 선택적
의존" 계약과 어긋난다(DD7). 이 머신은 Node v24.11.1이라 hook이 실제로 돌며
`~/.impeccable/node-unsupported` marker는 **부재**다(실측).

### (c) `impeccable@anthropics` 리터럴의 출처 — mccp 자신의 추정값이다

**측정 방법.** `git log -S "impeccable@anthropics" --oneline --all`로 도입 커밋을 찾고 그
커밋의 diff에서 리터럴이 **어떤 맥락으로** 들어왔는지 읽었다.

**관측.** 최초 도입은 `6da66bc feat(v0.2.6): Milestone 1 — impeccable design-review wiring`이고,
그 커밋은 `impeccable-detect.js`를 **신규 생성**(264줄)하면서 그 안에

```js
const IMPECCABLE_PLUGIN_KEY = 'impeccable@anthropics';
```

를 처음 썼다. 즉 이 리터럴은 **어떤 레지스트리에서 관측된 값이 아니라 mccp가 자기 코드에 쓴
가정**이고, M1이 실측으로 반증했다(실제 키는 `impeccable@impeccable`이며 그 하드코드는 아무것도
매치하지 못해 설치된 plugin을 모든 게이트에서 보이지 않게 만들었다).

**판정 — 하위 호환 부담은 0이다.** 과거에 실재한 채널이 아니므로 그 키로 설치된 사용자는
존재할 수 없다. **그럼에도 이 milestone은 리터럴을 제거하지 않는다**: `impeccable-resolve.test.js`가
그것을 legacy 정확 일치 케이스로 봉인하고 있고, 탐지 동작을 바꾸는 것은 M1 계약의 재개봉이다
(DD8과 같은 선). 판정만 기록하고 제거는 하지 않는다.

## Task 13 — 라이브 완주 관측 (2026-08-23)

plan이 이 태스크에 적은 넷 중 **둘은 관측됐고 둘은 관측될 수 없었다.** 관측되지 않은 둘은
실패가 아니라 plan의 전제가 이 diff에 맞지 않았기 때문이며, 그 사실을 원인째로 적는다.

### (1) 관측됨 — 죽은 분기 제거가 발화를 바꾸지 않는다

같은 파일 집합(26개: tracked diff ∪ non-ignored untracked)에 대해 제거 **전** 판정식
(`ui.test(f) || cache.test(f)`)과 **후** 판정식(`ui.test(f)`)을 각각 적용했다.

```
renderingSurface BEFORE : false   matched: []
renderingSurface AFTER  : false   matched: []
identical: true      cache-only contribution: 0
```

죽은 항이 기여한 파일은 **0개**다. DD3의 도달불가 주장이 실측으로 확인됐다.

### (2) 관측될 수 없음 — finish 라우팅은 이 diff에서 **두 게이트 모두** 음성이다

plan은 Phase 3.6의 finish 5종이 발화하고 restamp가 착지하기를 기대했다. 실제로는 두 조건이
독립적으로 거짓이라 발화 경로가 애초에 열리지 않는다.

- **2.5.5b 트리거**: `design_signal=false` (reason `no-signal`) → silent-skip 행. critique
  루프·라우팅·Phase 3.6/3.7 전부 미진입.
- **Phase 3.6.1 조건 2**: 구현이 끝난 뒤 다시 재도 `FINISH_SURFACE=0`이다. 이 milestone의
  diff에는 `.tsx/.jsx/.vue/.svelte/.astro/.css/.scss/.html`이 **한 개도 없고**
  `.claude/cache/` 산출물도 없다 — 전부 control-plane `.js`와 문서다.

즉 트리거를 강제로 켰더라도(axis c 감사 override) Phase 3.6은 자기 조건 2에서 다시 멎는다.
**plan의 Acceptance가 이 diff에 맞지 않았다**는 것이 정직한 결론이고, 억지로 발화시키는 것은
receipt에 없는 사실을 만드는 일이라 하지 않았다.

### 새 관측 — 2.5.5b는 자기 Files-to-Change에 구조적으로 눈감는다

측정 중 plan이 예상하지 못한 축이 드러났다. M6이 고치는 파일 중 셋이 `DESIGN_SURFACE_PATHS`
소속인데, 게이트 시점에는 그 사실이 보이지 않는다:

| 시점 | `design_signal` | `signal_files` |
|---|---|---|
| 2.5.5b (EXECUTE **이전**) | `false` (`no-signal`) | `[]` |
| 구현 완료 후 (EXECUTE **이후**) | **`true`** (`ok`) | `renderer/html.js` · `renderer/markdown.js` · `receipt/write.js` |

탐지기의 결함이 아니라 **평가 시점의 구조적 blind**다 — 2.5.5b는 아직 일어나지 않은 편집을
볼 수 없다. 문서화된 우회는 `MCCP_DESIGN_INTENT_REASON` 감사 override 하나뿐이며(명령 본문이
"detector blindness에 대한 escape"라고 명시한다), 근본 해소 후보 둘(plan의 `Files to Change`를
detect 입력에 더하기 · 트리거를 post-EXECUTE로 한 번 더 평가하기)은 **M4가 정합화한 발화 대상을
넓히므로 자기 증거를 갖춘 별도 축**이 필요하다. backlog에 이연했다.

### (3) 관측될 수 없음 — `impeccable_commands_routed`는 `null`이다

(2)의 직접 귀결이다. Task 1·2가 고친 write 경로는 대신 **test가 실제로 실행**해 덮는다 —
`impeccable-routing-fields.test.js`의 M6 3건이 진짜 `write()`와 `validate()`를 호출해
정규 3키 통과 · 여분 키 거부(작성자·검증자 양쪽) · `args.cwd` 기준 상대 경로 해소를 각각
단언한다(12/12 pass). 단위 test 통과가 경로 작동과 같지 않다는 것은 그대로 유효하며, 라이브
발화는 렌더 표면을 실제로 건드리는 다음 사이클로 이연한다.

### (4) 관측됨 — impeccable 축 env 우회 0건

```
MCCP_IMPECCABLE_SKILL             = (unset)
MCCP_DESIGN_INTENT_REASON         = (unset)
IMPECCABLE_FORCE_OVERRIDE_REASON  = (unset)
MCCP_FORCE_PR_WITHOUT_IMPECCABLE  = (unset)
MCCP_IMPECCABLE_ROUTING_MODE      = (unset)
```

receipt의 `impeccable_skipped`는 `false`이고 `impeccable_silent_skip`이 `true`다 — SKILL은
available인데 이 diff에 디자인 표면이 없다는 **정직한 기록**이다. PRD Success Metric 1
(impeccable 축 우회 0건)은 충족한다.

**단, 이 사이클은 impeccable 축이 아닌 우회를 둘 썼고 그것은 별개로 기록된다**:
`MCCP_ALLOW_CODEX_UNAVAILABLE=1`(Codex 쿼터 소진 — receipt에 `codex_verdict=unavailable` +
`advisory=true`) 와 security-reviewer auto-fallback(세션 운영 지침 — `security_skipped=true`).
둘 다 backlog에 회수 경로와 함께 이연했다.
