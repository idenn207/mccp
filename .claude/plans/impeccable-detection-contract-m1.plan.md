# Plan: impeccable 탐지 계약 M1 — 정직한 탐지

**Source PRD**: `.claude/prds/impeccable-detection-contract.prd.md`
**Selected Milestone**: M1 — 정직한 탐지
**Complexity**: Medium

## Summary

`probeSkillAvailable`가 돌려주는 boolean 하나를 `resolveImpeccable()` 오라클로 대체한다 —
설치원을 전부 열거하고, 각 설치원의 `version`을 SKILL.md frontmatter에서 실제로 판독하고,
**`Skill(...)` 호출이 실제로 열게 될 본문 하나**를 지목한다. `probeSkillAvailable`는 그 결과의
`available` 필드를 반환하는 얇은 래퍼로 남으므로 4개 호출부는 무변경이고, `detect()`의 JSON은
기존 필드 의미를 그대로 둔 채 새 필드만 얹는 **엄격한 상위집합**이 된다 — 즉 M1은 게이트의
분기 동작을 바꾸지 않고 **분기의 입력만** 참으로 만든다.

핵심 발견 하나가 설계를 지배한다: **plugin 채널의 skill은 `impeccable:impeccable`로 등록되고,
bare `impeccable`로는 해소되지 않는다.** mccp 본문은 전부 `Skill(impeccable, ...)`를 호출한다.
따라서 "설치됨"을 boolean으로만 답하면 plugin 단독 설치 환경에서 탐지는 true인데 호출은
`unknown_skill`로 떨어진다 — PRD의 두 번째 지표(탐지 ↔ 실제 발화 일치)가 정확히 이 실패를
가리킨다. M1은 그래서 `invocation`을 **1급 반환값**으로 싣는다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 공식 채널로 default 설치한 사용자에게 환경변수 설정을 요구하지 않는다 — env 우회는 외부에 따로 설치한 경우를 위한 장치다 | constraint |
| UI2 | 기존 npm CLI 3.x 사용자는 강제 마이그레이션 대상이 아니며 계속 동작해야 한다 | exclusion |
| UI3 | 설계의 근간은 impeccable 공식 문서이며 코드에서 추정한 값이 아니다 | direction |
| UI4 | 설치원을 전부 열거하고 실제 version을 판독하고 실제로 해소될 본문 하나를 지목한다 | constraint |
| UI5 | 디자인 축이 없는 백엔드 전용 작업에서는 무동작이어야 하고 없는 도구의 설치를 압박하지 않는다 | exclusion |
| UI6 | 대상은 신규 설치자와 기존 CLI 사용자와 CLI에서 plugin으로 이행하는 사용자 세 분절 전부다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 반환 계약 | `plugins/mccp/scripts/lib/dep-check.js:20` | 절대 throw하지 않고 sentinel 객체를 돌려준다 — 호출부가 try/catch 없이 `if (!result.installed)`로 분기 |
| 분류 enum | `plugins/mccp/scripts/lib/impeccable-detect.js:12` | bool 위에 휴리스틱을 얹지 않고 `reason` 문자열 enum으로 분기 (codex-invoke 미러) |
| 다중 채널 열거 | `plugins/mccp/scripts/lib/codex-invoke.js:1` | 실패를 뭉뚱그리지 않고 원인별로 이름을 준다 (`install-path-stale` 등 14종) |
| frontmatter 파싱 | `plugins/mccp/scripts/lib/agent-compress.js:10` | `^---\r?\n([\s\S]*?)\r?\n---` 정규식 + 줄단위 `key: value` |
| 주입 가능 경로 | `plugins/mccp/scripts/lib/impeccable-detect.js:133` | 모든 파일시스템 경로를 옵션으로 주입 가능하게 두어 test가 tmpdir로 대체 |
| test 하네스 | `plugins/mccp/scripts/lib/tests/impeccable-detect.test.js:11` | `node:test` + `withTempDir` / `withEnv` / `writePluginsManifest` 헬퍼 |
| loud stderr | `plugins/mccp/commands/plan.md:817` | 강등·비정상은 조용히 넘기지 않고 `[mccp:<axis>]` 접두 stderr |
| 4면 version 동기 | `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:94` | 기대값을 `plugin.json`에서 파생 — footer 리터럴을 빠뜨리면 그 test가 red |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/impeccable-detect.js` | UPDATE | `resolveImpeccable()` 신설 · 접두어 매칭 · 4소스 열거 · version 판독 · `detect()` 필드 확장 · `resolve` 서브커맨드 |
| `plugins/mccp/scripts/lib/tests/impeccable-resolve.test.js` | CREATE | 채널 조합 매트릭스와 version·invocation·shadow 단언 |
| `plugins/mccp/scripts/lib/tests/impeccable-detect.test.js` | UPDATE | fixture의 `impeccable@anthropics` 리터럴을 실측 키로 교정하고 legacy 키는 별도 케이스로 보존 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | `MCCP_IMPECCABLE_SKILL` consumer 앵커가 이번 편집으로 stale해지므로 함께 정정 (L8 lint 대상) |
| `docs/gate-design.md` | UPDATE | `### impeccable-detection` 앵커 신설 — 4소스 표·해소 규칙·모호성 처리 |
| `CLAUDE.md` | UPDATE | 탐지 계약 절 추가 — invocation 네임스페이스 규칙과 "모르면 모른다" 계약 |
| `docs/multi-session-work-loop/instruction-contract.md` | UPDATE | 신설 CLAUDE.md 절의 ledger row (C1~C4 lint 통과 조건) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (§3.7 patch — PRD 단일 milestone) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | 신규 heading 항목과 `currently` 노트 |
| `.claude/prds/impeccable-detection-contract.prd.md` | UPDATE | M1 행 status와 Plan 셀 |
| `.claude/notes/impeccable-detection-contract-m1.md` | CREATE | Task 0 사전 측정과 Task 8 라이브 증거 (plan 본문은 게이트 후 봉인되므로 별도 자리) |
| `.claude/PRPs/reports/impeccable-detection-contract-m1-report.md` | CREATE | `/mccp:prp-implement` 산출 report |

## Tasks

### Task 0: 라이브 사전 측정 — 탐지를 고쳐도 게이트가 발화하는가

PRD Risk 1행과 Open Question 3번이 **M1 착수 전** 확인을 요구한다. 코드를 고치기 전에 측정하고
결과를 `.claude/notes/impeccable-detection-contract-m1.md`에 기록한다. 음성이면 조용히 진행하지
않고 PRD의 mitigation대로 **MVP 범위에 권한 축을 추가**한다.

- **Action**:
  - (a) **invocation 네임스페이스 사실 고정.** 현재 세션 skill registry에 bare `impeccable`(project-local 3.5.0)과 `impeccable:impeccable`(plugin 4.1.1)이 **동시에 별개 이름으로** 등재돼 있음을 기록한다. Skill 도구 계약(plugin skill은 `plugin:skill`)이 근거이고, 같은 저장소의 `coding-standards` ↔ `mccp:coding-standards` 쌍이 같은 규칙의 독립 실례다.
  - (b) **도구 권한.** plugin SKILL.md의 `allowed-tools`는 `Bash(node .claude/skills/impeccable/scripts/*)`인데 plugin base는 cache 경로다. cache 경로의 `context.mjs`와 `doctor.mjs`를 Bash로 1회 실행해 완주 여부와 Node 요구(22+)를 기록한다 (관측 머신 Node v24.11.1).
  - (c) **plugin 단독 조건 기준선.** 임시 디렉토리를 repoRoot로 삼아 project-local 사본이 없는 상태를 만들고, Task 1 완료 직후 오라클이 무엇을 지목하는지 대조할 기준선으로 남긴다.
- **Mirror**: `.claude/notes/codex-intent-context-m3.md` — 게이트 산출물과 라이브 실측을 plan 본문 밖 노트에 두는 M1·M2·M3 선례.
- **Validate**: 노트에 (a)(b)(c) 세 관측이 각각 명령·출력·판정으로 기록되고, (b)가 음성일 때 "MVP 범위에 권한 축 추가"가 명시적으로 적혀 있을 것.

### Task 1: `resolveImpeccable()` — 다중소스 오라클

- **Action**: `impeccable-detect.js`에 순수 함수 하나를 신설한다. 파일시스템 경로는 전부 옵션 주입 가능(`installedPluginsPath` · `projectSkillDir` · `userSkillDir` · `repoRoot`)하게 두고 절대 throw하지 않는다.

  **반환 형태**

  ```js
  {
    available: bool,
    reason: 'ok' | 'not-installed' | 'env-forced-available' | 'env-forced-missing',
    invocation: 'impeccable' | 'impeccable:impeccable' | null,
    source: 'env' | 'plugin' | 'project' | 'user' | null,
    version: string | null,
    path: string | null,
    sources: [{ source, invocation, version, path }],
    shadowed: bool,
  }
  ```

  **열거하는 4소스**

  | # | 소스 | 위치 | invocation | version 판독 |
  |---|---|---|---|---|
  | 1 | `env` | `MCCP_IMPECCABLE_SKILL` = `available` / `missing` | `impeccable` (가정) | 없음 → `null` |
  | 2 | `plugin` | `installed_plugins.json` 키를 `/^impeccable@/` **접두어** 매칭 + legacy bare `impeccable` | `<pluginName>:<skillDirName>` | manifest `version` 우선, 없으면 frontmatter |
  | 3 | `project` | `<repoRoot>/.claude/skills/impeccable/SKILL.md` | `impeccable` | frontmatter |
  | 4 | `user` | `~/.claude/skills/impeccable/SKILL.md` | `impeccable` | frontmatter |

  **규칙 넷**

  - **`env`가 최우선**이고 `missing`이면 즉시 `available:false`로 끝낸다 (기존 동작 보존, UI1이 인정하는 탈출구).
  - **plugin 엔트리는 `installPath`가 디스크에 실재하고 그 안에 `skills/<name>/SKILL.md`가 있을 때만 소스로 센다.** stale installPath를 설치로 세는 것은 `codex-invoke.js`가 `install-path-stale`로 이미 거부하는 실패이고, 여기서 세면 "지목한 본문이 열리지 않는" 상태를 우리가 직접 만든다. `invocation`의 skill 이름은 그 디렉토리 이름을 **읽어서** 정하고 `impeccable`이라고 가정하지 않는다.
  - **project와 user는 디렉토리 존재가 아니라 `SKILL.md` 존재를 요구한다.** 기존 코드는 빈 디렉토리도 `true`로 셌다 — 열릴 본문이 없는데 있다고 답하는 것이라 UI4에 정면으로 어긋난다. 의도된 동작 변경이며 Risks에 적는다.
  - **모호하면 `version:null`.** 이긴 `invocation`을 공유하는 소스가 둘 이상이면(project + user) 어느 본문이 해소되는지는 **측정된 바 없다**. 그때 `shadowed:true` · `version:null`로 답하고 `sources[]`에 둘 다 싣는다. 이것이 PRD Open Question 1번을 **답하지 않고 닫는** 방법이다 — M1의 정확도가 그 답에 의존하지 않게 만든다.

  **plugin과 bare 소스는 경쟁하지 않는다.** invocation 네임스페이스가 다르므로 plugin은 bare 이름을 이기지도 지지도 않는다. 따라서 `shadowed`는 bare 소스끼리에만 성립하고, plugin과 project의 공존은 shadow가 아니라 **서로 다른 두 이름**이다. 승자 선택은 bare 소스가 하나라도 있으면 bare(mccp 본문이 부르는 이름이 그것이므로), 없으면 plugin이다.

- **Mirror**: `dep-check.js`의 sentinel 반환 · `codex-invoke.js`의 원인별 classification · `agent-compress.js#parseFrontmatter`.
- **Validate**: `node -e "console.log(JSON.stringify(require('./plugins/mccp/scripts/lib/impeccable-detect.js').resolveImpeccable({}),null,2))"` 가 이 머신에서 `available:true` · `source:'project'` · `invocation:'impeccable'` · `version:'3.5.0'` 을 내고 `sources[]`가 plugin 4.1.1을 동반할 것.

### Task 2: frontmatter version 판독 — 유계 읽기

- **Action**: SKILL.md 전문을 읽지 않고 선두 8KB만 읽어 frontmatter를 파싱하는 헬퍼를 둔다. 파싱 실패, `version` 부재, 비문자열은 전부 `null`이며 throw하지 않는다. 4.1.1과 3.5.0 실물이 양쪽 다 `version: <x.y.z>` 한 줄을 갖는 것이 근거다.
- **Mirror**: `plugins/mccp/scripts/lib/agent-compress.js:10`의 정규식 형태를 쓰되 전체 파일 앵커 대신 선두 슬라이스에 적용.
- **Validate**: 신규 test — 4.1.1과 3.5.0 실물 형태 fixture 2종에 frontmatter 없음, `version` 없음, 깨진 YAML 3종을 더해 각각 기대값 또는 `null`.

### Task 3: 배선 — `probeSkillAvailable` · `detect()` · CLI

- **Action**:
  - `probeSkillAvailable(opts)`는 `resolveImpeccable(opts).available`를 반환하는 **얇은 래퍼**로 남긴다. 기존 옵션 이름(`installedPluginsPath` · `userSkillDir`)을 그대로 받아야 한다 — 기존 test 6건이 그 이름으로 주입한다. 4개 호출부(`plugins/mccp/commands/plan.md:1462` · `plugins/mccp/commands/plan.md:1862` · `plugins/mccp/commands/prp-implement.md:224` · `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js:277`)는 **무변경**.
  - `detect()`는 `skill_available` · `reason` · `silent_skip`의 **의미를 바꾸지 않고** 필드만 추가한다: `impeccable_invocation` · `impeccable_source` · `impeccable_version` · `impeccable_path` · `impeccable_sources` · `impeccable_shadowed`. 상위집합이므로 게이트 본문의 분기는 한 줄도 손대지 않는다.
  - CLI에 `resolve` 서브커맨드를 추가한다(`--json` 지원). 사람이 읽는 출력은 소스를 표로 나열하고 이긴 줄을 표시한다 — M2(setup·경고)와 M3(섀도잉 표면화)가 그대로 소비할 진단 표면이다.
- **Mirror**: 기존 `detect` 서브커맨드의 `parseArgs` + `--json` 분기 구조.
- **Validate**: `detect --mode plan --json`이 기존 키를 전부 유지한 채 새 키를 포함하고, `resolve --json`이 Task 1과 동일한 객체를 출력.

### Task 4: test — 채널 조합 매트릭스

- **Action**: `impeccable-resolve.test.js`를 신설한다. PRD Success Metric 2행이 요구하는 조합을 그대로 케이스로 만든다.

  | 케이스 | 기대 |
  |---|---|
  | plugin 단독 (`impeccable@impeccable`) | `available:true` · `source:'plugin'` · `invocation:'impeccable:impeccable'` · `version` = manifest · `shadowed:false` |
  | plugin 단독, legacy 키 (`impeccable@anthropics`) | 동일 — 접두어 매칭이 하위 호환을 진다 |
  | plugin 단독, `installPath` stale | `available:false` · `reason:'not-installed'` |
  | project-local 단독 | `source:'project'` · `invocation:'impeccable'` · `version` = frontmatter |
  | user-level 단독 | `source:'user'` · `invocation:'impeccable'` |
  | project + user 공존 | `shadowed:true` · `version:null` · `sources.length===2` |
  | plugin + project 공존 | `shadowed:false` (이름이 다르므로) · 승자 `project` · `sources.length===2` |
  | 빈 디렉토리만 (SKILL.md 부재) | `available:false` — 동작 변경 앵커 |
  | 전부 부재 | `available:false` · `invocation:null` · `sources:[]` |
  | `MCCP_IMPECCABLE_SKILL=missing` + 전 소스 실재 | `available:false` · `reason:'env-forced-missing'` |
  | `MCCP_IMPECCABLE_SKILL=available` + 전 소스 부재 | `available:true` · `source:'env'` · `version:null` |

  기존 `probeSkillAvailable` test 6건이 boolean 계약 회귀를 지키므로 **삭제하지 않는다.**
- **Mirror**: `plugins/mccp/scripts/lib/tests/impeccable-detect.test.js:11`의 `withTempDir` / `withEnv` / `writePluginsManifest` 하네스 구조를 같은 이름으로 재작성 (파일 간 일관성).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/impeccable-resolve.test.js` 전건 pass.

### Task 5: fixture 교정과 registry 앵커 정정

- **Action**:
  - `plugins/mccp/scripts/lib/tests/impeccable-detect.test.js:35`의 `writePluginsManifest`가 심는 키를 실측값 `impeccable@impeccable`로 바꾼다. 접두어 매칭이므로 test는 붉어지지 않지만, **회귀 test가 오답을 보존하는 구조**(meta-research F1)를 남기지 않는 것이 목적이다. legacy `impeccable@anthropics`는 Task 4의 전용 케이스로 옮겨 하위 호환 근거로 남긴다.
  - `plugins/mccp/scripts/lib/env-contract/registry.js:132`의 `MCCP_IMPECCABLE_SKILL` consumer 앵커가 이번 편집으로 stale해진다. 새 줄로 정정한다. **이 항목의 타입·설명 드리프트(meta-research F8) 자체는 PRD가 M5에 배정했으므로 건드리지 않는다** — 우리가 옮긴 앵커만 따라 옮긴다.
- **Mirror**: "우리가 깨뜨린 것만 우리가 고친다" 경계 — §3.14의 흡수 임계와 같은 온도.
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js`의 L8이 pass. L1의 `MCCP_PLAN_REVIEW_TEST_INVOKE` 실패는 **main 승계 선재 red**이며 이번 축이 아니다 — backlog에 1줄 적재.

### Task 6: 문서 — 계약을 적는다

- **Action**:
  - `docs/gate-design.md`에 `### impeccable-detection` 앵커 신설: 4소스 표, invocation 네임스페이스 규칙, 모호성 처리, "주장하지 않는 것".
  - `CLAUDE.md`에 짧은 절을 추가하고 상세는 위 앵커로 보낸다. 상주해야 할 내용은 **둘뿐**이다. (1) plugin skill은 `plugin:skill`로 등록되므로 bare `impeccable`로 해소되지 않는다 — mccp 본문이 부르는 이름이 bare이므로 M3가 project-local 사본을 지우기 전에 이 사실을 소비해야 한다. (2) 다중 bare 소스의 우선순위는 미측정이며 탐지는 추정하지 않고 `version:null` + `shadowed:true`로 답한다.
  - `docs/multi-session-work-loop/instruction-contract.md`에 그 절의 ledger row를 추가한다.
- **Mirror**: §3.13.3 형태 — CLAUDE.md는 불변식만, 배경은 `[상세](docs/gate-design.md#anchor)`.
- **Validate**: `node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md`가 C1~C4 pass (baseline rows=31 전건 pass).

### Task 7: version 4면 동기와 PRD 행

- **Action**: `plugin.json`을 patch 한 칸 올린다 (§3.7 — PRD 단일 milestone). `renderer/html.js` page-foot, `renderer/markdown.js` derived 줄, `CHANGELOG.md` 신규 heading과 `currently` 노트를 같은 값으로 맞춘다. PRD의 M1 행 status와 Plan 셀을 갱신한다.
- **Mirror**: §3.7 "동기 대상 4면" + `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:94`의 파생 기대값.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` pass. **번호를 미리 고정하지 않는다** — §3.7이 요구하는 두 시점(base 머지 해소 직후, `/mccp:pr` 진입 직전)에 각각 재계산한다. 미머지 `env-contract-integrity`가 현재 1.30.0으로 미리베이스 상태라 리베이스하며 patch 자리를 선점할 수 있다.

### Task 8: 라이브 완주 — 단위 test가 아니라 경로

- **Action**: 이 저장소에서 신설 오라클을 태운 `/mccp:plan` 게이트를 **환경변수 우회 없이** 1회 완주시키고 다음 셋을 노트에 기록한다. (1) `SKILL_AVAIL`이 1로 뒤집혔는가, (2) 탐지가 지목한 `path`와 `Skill(impeccable, ...)`가 실제로 연 본문이 같은가, (3) `MCCP_IMPECCABLE_SKILL` 없이 진행됐는가. Task 0의 (c) 기준선과 대조한다.
- **Mirror**: PRD Success Metrics 1·2행 · `.claude/notes/codex-intent-context-m3.md`의 라이브 실측 형식.
- **Validate**: 노트에 세 관측이 각각 기록되고, (2)가 불일치면 그 사실을 **미달로 기록**한다 — 통과로 반올림하지 않는다.

## Validation

```bash
# 단위
node --test plugins/mccp/scripts/lib/tests/impeccable-resolve.test.js
node --test plugins/mccp/scripts/lib/tests/impeccable-detect.test.js
node --test plugins/mccp/scripts/lib/tests/impeccable-detect-design-surface.test.js
node --test plugins/mccp/scripts/lib/tests/impeccable-guard.test.js
node --test plugins/mccp/scripts/lib/tests/dep-check.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 계약 lint
node plugins/mccp/scripts/lib/env-contract/lint.js
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# 오라클 실측 (이 머신: project 3.5.0 + plugin 4.1.1 공존)
node plugins/mccp/scripts/lib/impeccable-detect.js resolve --json
node plugins/mccp/scripts/lib/impeccable-detect.js detect --mode plan \
  --plan .claude/plans/impeccable-detection-contract-m1.plan.md --json

# 회귀 광역 (호출부 무변경 확인)
node --test plugins/mccp/scripts/receipt/tests/
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **탐지를 고쳐도 `Skill(impeccable, ...)`가 plugin 본문을 못 연다** — 네임스페이스가 달라 구조적으로 해소되지 않는다 | **높음 — 이미 확인됨** | M1은 `invocation`을 1급 반환값으로 실어 사실을 표면화한다. 호출부 재배선은 M3가 project-local 사본을 지우며 **반드시** 소비해야 하는 전제로 넘기고, M1 문서와 CLAUDE.md에 그 인계를 명시한다 |
| 도구 권한(`allowed-tools` ↔ cache 경로) 때문에 비대화형 게이트가 멎는다 | 중 | Task 0의 (b)가 **코드 수정 전에** 측정한다. 음성이면 PRD mitigation대로 MVP 범위에 권한 축을 추가하고 조용히 진행하지 않는다 |
| SKILL.md 요구로 빈 디렉토리 사용자가 새로 차단된다 | 낮 | 의도된 교정 — 열릴 본문이 없는데 있다고 답하던 것이다. plan은 lenient라 무영향이고 implement와 pr에서만 막힌다. 탈출은 UI1이 인정하는 `MCCP_IMPECCABLE_SKILL=available` |
| 다중 bare 소스 우선순위를 모르는 채 `version`을 답해 오답을 봉인한다 | 중 | 모호하면 `version:null` + `shadowed:true`. 추정하지 않는 것이 계약이고 test가 그 케이스를 고정한다 |
| 접두어 매칭이 무관한 plugin(`impeccable-foo@x`)을 잡는다 | 낮 | 매칭은 `/^impeccable@/` — `@` 앞이 정확히 `impeccable`이어야 한다. bare legacy `impeccable`만 별도 예외 |
| `detect()` 필드 추가가 하류 소비자를 깨뜨린다 | 낮 | 엄격한 상위집합 — 기존 키와 의미 무변경. `impeccable-guard.test.js`와 receipt test 광역 실행으로 확인 |
| version 4면 중 일부 누락 또는 병렬 브랜치 번호 충돌 | **높음 — 실측 4회 재발** | `i18n-surface.test.js`가 3면을 red로 잡는다. §3.7 두 시점 재계산을 Task 7 Validate에 못박았다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)

라이브 완주가 산출해야 하는 것을 명시한다 — 아래 셋이 `.claude/notes/impeccable-detection-contract-m1.md`에 **명령·출력·판정**으로 기록되지 않으면 M1은 미완이다.

1. **Task 0 사전 측정 3건**(invocation 네임스페이스 · 도구 권한 · plugin 단독 기준선)이 코드 수정 **이전** 시점으로 기록될 것.
2. `resolve --json` 실측이 이 머신에서 **두 소스를 모두 열거**하고(project 3.5.0 + plugin 4.1.1) 이긴 줄과 그 `invocation`을 지목할 것.
3. `MCCP_IMPECCABLE_SKILL` **미설정** 상태에서 `/mccp:plan` 게이트가 `SKILL_AVAIL=1`로 진입한 stderr 한 줄이 남을 것. 뒤집히지 않았다면 그 사실을 미달로 기록할 것.

## Out of Scope (M1)

- `/mccp:setup` 명령 교체, SessionStart 배너, `checkImpeccableCli` 다채널화 — **M2**.
- 섀도잉의 사용자 표면화와 정리 제안, 이 저장소 3.5.0 사본 제거, 그에 따른 호출부 재배선 — **M3**.
- `MCCP_IMPECCABLE_SKILL`의 타입·enum·설명 드리프트, `IMPECCABLE_VERSION` 서술 정정 — **M5**.
- 게이트 lenient/strict 비대칭 재설계 — PRD가 명시적으로 배제(입력이 참이 되면 의도대로 작동).
- 라우팅 카탈로그 확장, a11y auto-invoke — PRD Out of scope.

## Design Critique

> impeccable unavailable, skipped (auto-fallback): skill-missing

detector 출력: `skill_available=false` · `design_signal=true` · `reason=skill-missing`.
디자인 신호는 잡혔다 — 이 plan이 `impeccable-detect.js`와 renderer 2면을 건드리므로
`DESIGN_SURFACE_PATHS` whitelist(axis b)에 걸린다. 그런데 skill이 "없다"고 판정돼
critique retry loop이 돌지 않았다. **impeccable 4.1.1은 이 머신에 정상 설치돼 있다.**

즉 이 plan이 고치려는 결함이 이 plan 자신의 게이트에서 재현됐다 — PRD의 Design Direction 절이
같은 자리에서 같은 이유로 남긴 줄의 두 번째 실례이고, plan 단계 게이트(lenient)까지 그 결함이
도달함을 보이는 관측이다. plan-codex는 lenient 게이트이므로 `meta.impeccable_skipped=true`는
warning으로 표면화되고 진행을 막지 않는다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
