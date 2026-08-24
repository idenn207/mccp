# impeccable-detection-contract M1 — 게이트 산출물과 라이브 실측

> plan 본문(`.claude/plans/impeccable-detection-contract-m1.plan.md`)은 plan-codex 게이트가
> `plan_hash`로 봉인했으므로 편집하지 않는다. Task 0 사전 측정 · Task 8 라이브 증거 ·
> 게이트 리뷰 기록은 전부 이 자리에 남긴다 (codex-intent-context M1·M2·M3 선례).

## Task 0 — 라이브 사전 측정 (코드 수정 이전 시점)

측정 시각 2026-08-22 · 브랜치 `impeccable-detection-contract` · Node v24.11.1.

### (a) invocation 네임스페이스 사실 고정 — 판정: 확정

명령: 현재 세션 skill/agent registry 열람 + `~/.claude/plugins/installed_plugins.json` 판독.

출력:

```
세션 skill registry:  impeccable                     (project-local 3.5.0)
                      impeccable:impeccable          (plugin 4.1.1)
세션 agent registry:  impeccable:impeccable-asset-producer / -documenter
                      / -finish-reviewer / -manual-edit-applier
레지스트리 키:        ["impeccable@impeccable"]
installPath:          C:\Users\skypark207\.claude\plugins\cache\impeccable\impeccable\4.1.1
```

판정: bare `impeccable`과 `impeccable:impeccable`이 **별개 이름으로 동시 등재**된다.
레지스트리 키는 `<pluginName>@<marketplaceName>` 규약이고 호출 namespace는 pluginName만 쓴다 —
독립 반례로 codex는 키가 `codex@openai-codex`인데 namespace는 `codex:setup`·`codex:rescue`다.
따라서 plugin 채널의 invocation은 `impeccable:impeccable`이며 `impeccable@impeccable:impeccable`이
아니다. (이 판정은 plan-review L2 architect가 CRITICAL로 반대 주장을 냈고 증거로 기각됐다 —
`.claude/plans/codex-findings-backlog.md` 참조.)

### (b) 도구 권한 — 판정: 양성 (MVP 권한 축 추가 불필요)

명령:

```bash
PB="C:/Users/skypark207/.claude/plugins/cache/impeccable/impeccable/4.1.1/skills/impeccable/scripts"
node "$PB/doctor.mjs"
node "$PB/context.mjs"
```

출력: 둘 다 **exit 0 완주**. `doctor.mjs`는 이 저장소를 대상으로 `needs a command (1)` +
`worth saying (2)` 진단을 정상 출력했고, `context.mjs`는 PRODUCT.md 본문을 정상 방출했다.

관측된 불일치: plugin 4.1.1의 SKILL.md `allowed-tools`는
`Bash(node .claude/skills/impeccable/scripts/*)` — **project 상대 경로**인데 plugin base는
cache 경로다. 그러나 이 불일치는 `node` 직접 실행을 막지 않았다.

판정: **양성**. PRD Risk 2행이 요구한 "음성이면 MVP 범위에 권한 축을 추가"는 **발동하지 않는다**.

### (c) plugin 단독 조건 기준선 — 판정: 결함 재현

명령:

```bash
node -e 'const d=require("./plugins/mccp/scripts/lib/impeccable-detect.js");
         console.log(d.probeSkillAvailable({}), d.IMPECCABLE_PLUGIN_KEY, typeof d.resolveImpeccable)'
```

출력:

```
probeSkillAvailable({})          = false
IMPECCABLE_PLUGIN_KEY (하드코딩) = "impeccable@anthropics"
실제 레지스트리 키               = ["impeccable@impeccable"]
resolveImpeccable                = undefined
probe (userSkillDir 부재)        = false
```

판정: plugin 4.1.1이 **설치돼 있는데도** 탐지는 false다. 원인 셋 —
하드코딩 키 불일치(`@anthropics` ≠ `@impeccable`) · project-local 채널 부재 · 오라클 미존재.
이 기준선이 M1이 고치려는 결함 그 자체이며, Task 1 완료 직후 대조 대상이다.

이 저장소의 소스 실측: project `.claude/skills/impeccable/SKILL.md` = `version: 3.5.0` ·
plugin cache `skills/impeccable/SKILL.md` = `version: 4.1.1` · `~/.claude/skills/`에는
`learned/`만 있고 impeccable 없음.

## Codex Implementation Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.31.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (`MCCP_GATE_ROUND_CAP` 아래 §3.16 1라운드 방침)
- classification: `ok` · blocking: `false` · durationMs: 293875 · 구조화 verdict: `needs-attention` → `divergent`
- 합치 결론: 오라클 형태와 열거 규칙은 승인 범위. 미해소로 남는 축은 **plugin 단독 설치의 호출부 재배선**이며 plan Risks 1행이 M3 인계로 이미 소유한다.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 detector contract not implemented in working tree | CRITICAL | ACCEPT_NOW | 게이트가 EXECUTE 이전에 도는 구조라 Codex가 본 diff가 빈 것이 정상 — Phase 3가 이 구현을 수행해 R1에서 해소된다 |
  | F2 plugin-only becomes available but callers stay bare | CRITICAL | DEFER_TO_BACKLOG | 결과 등가 — M1 전후 모두 plugin 단독은 `impeccable_skipped`로 귀결(전: `available:false`, 후: `unknown_skill` → critique fallback). 새 실패 모드가 아니라 Skill 호출 1회 낭비이고, plan Risks 1행이 M3 재배선을 전제로 명시 소유 |
  | F3 shadowed bare sources can report a false winner path | HIGH | ACCEPT_NOW | plan이 `source`/`path`를 정하지 않고 남긴 실제 공백. 모호한 bare 충돌에서 `source:null`·`path:null`·`version:null`·`shadowed:true`로 답하고 test에 단언을 추가한다 (plan과 충돌하지 않음) |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: plugin 단독 설치의 호출부 재배선 — severity CRITICAL, **M3 소유**(plan Risks 1행). M1은 `invocation`을 1급 반환값으로 실어 사실을 표면화하는 데까지만 책임진다.

### Design Review

> impeccable unavailable, skipped (auto-fallback): skill-missing

detector 출력(implement mode): `skill_available=false` · `design_signal=false` ·
`reason=skill-missing` · `silent_skip=false`. 따라서 critique retry loop · stage-aware routing ·
design-grounding capture는 **어느 것도 발동하지 않았고**, 2.5.6이 `--impeccable-skipped
--impeccable-skip-reason skill-missing`을 forward한다.

**이 사이클에서 세 번째 재현이다.** PRD의 Design Direction 절, plan-codex 게이트(lenient),
그리고 이 implement 게이트(strict)가 전부 같은 이유로 같은 줄을 남겼다 — plugin 4.1.1과
project-local 3.5.0이 **둘 다 디스크에 실재하는데도** 탐지는 없다고 답한다. Task 0(c)가
기록한 기준선이 그 원인을 셋으로 특정한다.

**하류 영향 (기록 · 반올림 금지)**: `mccp-implement-codex`는 strict 게이트이므로
`meta.impeccable_skipped=true`는 `/mccp:pr`을 **차단한다**. 정직한 복구는 게이트를 끄는 것이
아니라 **M1 구현이 착지한 뒤 implement 게이트를 재실행**하는 것이다 — 그 시점의 탐지는
project 3.5.0을 보고 `skill_available=true`를 내므로 receipt가 깨끗해진다. 이것이 Acceptance
3번("`MCCP_IMPECCABLE_SKILL` 미설정 상태에서 `SKILL_AVAIL=1`로 진입한 stderr 한 줄")의
실측 기회이기도 하다.

### Security Reviewer

`Task(mccp:security-reviewer)` 정상 완주 (145초). CRITICAL/HIGH **0건** → MCCP-GATE-STOP 미발동.
`SECURITY_SKIPPED_REASON` 미설정 — receipt는 `security_skipped` 플래그를 forward하지 않는다.

| # | 축 | 지적 | Severity | 판정 |
|---|---|---|---|---|
| 1A | 열거 | `skills/` 디렉토리명이 `invocation` 문자열로 흘러 traversal 문자가 섞일 수 있다 | MEDIUM | **흡수** — 이름을 `^[a-zA-Z0-9_-]+$`로 whitelist한 뒤에만 `path.join`에 넣는다 |
| 1B | 열거 | `readdirSync` ↔ `readFileSync` 사이 symlink TOCTOU | MEDIUM | **흡수** — skill 디렉토리에 `lstatSync().isSymbolicLink()` 사전검사, 참이면 소스로 세지 않는다. (권고의 "열거를 아예 하지 마라"는 채택 불가 — plan Task 1이 이름을 **읽어서** 정하라고 명시) |
| 2B | 유계 판독 | `readFileSync`가 FIFO·device에서 무한 정지 | LOW→CRITICAL(침해 시) | **흡수** — `statSync(...).isFile()` 사전검사. 게이트가 cryptic timeout으로 죽는 경로를 2줄로 닫는다 |
| 2A | 유계 판독 | 8KB가 큰 frontmatter에 부족할 수 있다 | LOW | **이연** — plan Task 2가 8KB를 명시하고, 실물 2종(4.1.1·3.5.0)은 `version`이 선두 ~300B에 있다. 상향은 plan 계약 변경이라 M1 범위 밖 |
| 3 | installPath | 사용자 쓰기 가능 JSON의 경로가 traversal 가능 | MEDIUM→LOW | **이연(문서)** — 검증 경계는 registry를 읽는 쪽(`dep-check.js`)이 소유한다. 이 함수는 재검증하지 않고 가정을 문서화한다 |
| 4 | TOCTOU | 4소스 순차 열거 사이 상태 변화 | LOW | **무조치** — 탐지 오라클은 그 순간의 관측 스냅샷이고 그것이 옳은 동작이다 |

§3.14는 MEDIUM/LOW를 흡수 대상에서 빼지만, 1A·1B·2B는 **지금 작성하는 함수 본문의 1~3줄**이고
셋 다 구체적 공격 시나리오가 제시됐다. 기록만 하고 알면서 방치하면 다음 사이클이 같은 코드를
다시 열어야 하므로 닫는 쪽이 싸다. 이연한 2A·3·4를 포함해 판정은 전부 backlog에 적재했다.

## Task 8 — 라이브 완주 (코드 수정 이후)

`MCCP_IMPECCABLE_SKILL` **미설정** 상태에서 측정했다(`undefined` 확인). 환경변수 우회 없음.

### (1) SKILL_AVAIL이 뒤집혔는가 — 판정: 조건부 예

명령·출력:

```bash
$ node plugins/mccp/scripts/lib/impeccable-detect.js detect --mode plan --plan <this plan>
impeccable-detect plan reason=ok
  skill_available : true          # ← Task 0(c) 기준선의 false에서 뒤집힘
  design_signal   : true

$ node "C:/Users/.../plugins/cache/mccp/mccp/1.31.0/scripts/lib/impeccable-detect.js" detect --mode plan --plan <this plan>
impeccable-detect plan reason=skill-missing
  skill_available : false         # ← 설치본은 그대로
```

**게이트는 worktree가 아니라 설치된 plugin cache를 호출한다.** 명령 본문의 모든 node 호출이
`${CLAUDE_PLUGIN_ROOT}`(= `~/.claude/plugins/cache/mccp/mccp/<version>/`)로 해소되므로,
이번 사이클의 세 게이트가 전부 `skill-missing`을 낸 것은 **정상 동작**이었다 — 그들은 고쳐지기
전의 코드를 실행했다. 오라클은 뒤집혔고, 게이트 표면의 뒤집힘은 머지 후
`claude plugin update`가 `1.31.1` cache를 만든 다음에 성립한다(§3.7이 version bump을 의무로
두는 이유가 정확히 이것이다).

따라서 Acceptance 3은 **이 사이클 안에서는 미달**이다. 반올림하지 않는다 — 오라클 축은 충족,
게이트 표면 축은 머지 + `claude plugin update` 이후로 이연된다. 검증 명령은 위 (B)를 그대로
다시 돌리는 것이고, 기대값은 `reason=ok` · `skill_available: true`다.

### (2) 지목한 path와 실제로 열리는 본문이 같은가 — 판정: 일치 (소거법)

오라클이 지목한 것: `source=project` · `invocation=impeccable` ·
`path=.claude/skills/impeccable/SKILL.md` · `version=3.5.0`.

근거: 현재 세션 skill registry에 bare `impeccable`이 등재돼 있고, 이 머신에서 bare 이름으로
등록되는 소스는 project 사본 **하나뿐**이다 — user-level `~/.claude/skills/`에는 `learned/`만
있음을 Task 0에서 실측했고, plugin은 `impeccable:impeccable`이라는 **다른 이름**으로 등록된다.
bare 등록원이 유일하므로 `Skill(impeccable, ...)`가 여는 본문은 오라클이 지목한 그 파일이다.

한계: 이것은 소거법이지 직접 관측이 아니다. bare 소스가 둘이 되는 순간 이 논증은 성립하지
않으며, 그것이 오라클이 그 경우에 `source`·`path`를 `null`로 답하는 이유다.

### (3) 환경변수 우회 없이 진행됐는가 — 판정: 예

`MCCP_IMPECCABLE_SKILL`은 측정 전 구간에서 `undefined`였다. `.claude/settings.json`의 `env`
블록에도 없다. Task 0의 기준선과 위 (1)·(2)가 모두 우회 없는 상태의 값이다.

### Task 0(c) 기준선과의 대조

| 축 | Task 0 (수정 전) | Task 8 (수정 후, worktree) |
|---|---|---|
| `probeSkillAvailable({})` | `false` | `true` |
| 하드코딩 키 | `impeccable@anthropics` (실측과 불일치) | 접두어 `/^impeccable@/` 매칭 |
| project 채널 | 없음 | `.claude/skills/impeccable/SKILL.md` 3.5.0 |
| `resolveImpeccable` | `undefined` | 4소스 열거 · 2소스 발견 |
| 열거된 소스 | — | plugin 4.1.1 (`impeccable:impeccable`) + project 3.5.0 (`impeccable`) |
