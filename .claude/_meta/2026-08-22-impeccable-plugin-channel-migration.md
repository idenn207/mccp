# impeccable 배포 채널 전환(npm CLI 3.6.0 → marketplace plugin 4.1.1)이 mccp의 탐지·setup·디자인 게이트에 만든 결함 전수 조사

**Status**: active (2026-08-22 공식 문서 대조로 P0-b·P1 판정 정정)
**Date**: 2026-08-22
**Topic**: impeccable 배포 채널 전환(npm CLI 3.6.0 → marketplace plugin 4.1.1)이 mccp의 탐지·setup·디자인 게이트에 만든 결함 전수 조사

## Premises

| # | 참조 | 시점 | 무엇을 전제하는가 |
|---|---|---|---|
| P1 | `plugins/mccp/scripts/lib/impeccable-detect.js:54` | b111dca | `IMPECCABLE_PLUGIN_KEY`가 리터럴 `'impeccable@anthropics'` 하나로 고정돼 있다 |
| P2 | `plugins/mccp/scripts/lib/impeccable-detect.js:139` | b111dca | plugin manifest probe가 `[IMPECCABLE_PLUGIN_KEY, 'impeccable']` 정확 일치 2건만 시도한다 — 접두어 매칭이 없다 |
| P3 | `plugins/mccp/scripts/lib/impeccable-detect.js:146` | b111dca | manifest 실패 시 fallback은 `~/.claude/skills/impeccable` 하나다. plugin cache 경로도, 프로젝트 로컬 `.claude/skills/`도 보지 않는다 |
| P4 | `plugins/mccp/scripts/lib/dep-check.js:51` | b111dca | `checkImpeccableCli`는 `where`/`which impeccable` PATH 조회 단일 채널이다 |
| P5 | `plugins/mccp/commands/setup.md:88` | b111dca | Phase 3의 이름·문구·설치 명령이 전부 npm CLI 채널을 전제한다 (`separate npm CLI (not a Claude plugin)` · `npm install -g impeccable` · `impeccable skills install`) |
| P6 | `plugins/mccp/scripts/hooks/session-start.js:1070` | b111dca | SessionStart dep-check 경고가 `result.impeccable_cli.installed` 하나만 읽어 `missing`에 push한다 |
| P7 | `plugins/mccp/scripts/receipt/validate-cmd.js:33` | b111dca | `STRICT_IMPECCABLE_GATES = ['mccp-implement-codex', 'mccp-pr-codex']` — 이 둘에서만 `impeccable_skipped`가 blocking이다 |
| P8 | `plugins/mccp/scripts/receipt/validate-cmd.js:483` | b111dca | `meta.impeccable_skipped === true`가 strict 게이트에서 `blocking`, 그 밖에서는 `warnings`로 갈린다 |
| P9 | `plugins/mccp/commands/plan.md:743` | b111dca | plan 게이트의 `SKILL_AVAIL=0` 행은 plan 본문에 skip 주석을 적고 통과시킨다 (lenient) |
| P10 | `plugins/mccp/commands/prp-implement.md:421` | b111dca | implement 게이트의 같은 행은 "strict gate — BLOCKS downstream `/mccp:pr`"로 명시돼 있다 |
| P11 | `plugins/mccp/commands/pr.md:377` | b111dca | pr 게이트의 `SKILL_AVAIL=0` 행은 `MCCP_FORCE_PR_WITHOUT_IMPECCABLE`을 유일 탈출로 지목한다 |
| P12 | `plugins/mccp/commands/plan.md:1461` | b111dca | Codex design-scope 분할 플래그(`--impeccable-available`)가 `probeSkillAvailable({})` 반환값에 직결된다 (`prp-implement.md:223` · `plan.md:1861` 동일 패턴) |
| P13 | `plugins/mccp/scripts/lib/codex-invoke.js:197` | b111dca | `opts.impeccableAvailable === true`일 때만 `DESIGN_SCOPE_PREAMBLE`이 focus 앞에 붙는다 |
| P14 | `plugins/mccp/scripts/lib/codex-invoke.js:41` | b111dca | 그 preamble이 Codex에게 visual/color/typography/motion/spacing/brand 및 a11y finding을 emit하지 말라고 지시한다 |
| P15 | `CHANGELOG.md` | 2026-08-23 | 이 저장소에 impeccable 3.5.0 skill 본문이 `.claude/skills/impeccable/`에 79 파일로 git-tracked**였다** (조사 시점 `b111dca` 실측). **v1.31.3 M3에서 호출부 재배선과 동일 커밋으로 제거됐다** — 이 조사가 141행에서 "제거 결정에 딸려오는 비용"으로 예고한 그 항목이다. 참조를 CHANGELOG로 옮긴 이유는 L3가 현재 트리에서 해소되는 경로를 요구하기 때문이며, 원래 경로는 더 이상 존재하지 않는다 |
| P16 | `plugins/mccp/scripts/lib/tests/impeccable-detect.test.js:38` | b111dca | 탐지 test fixture가 manifest 키를 `'impeccable@anthropics'`로 고정해, 잘못된 키가 회귀 test에 의해 보존된다 |
| P17 | `plugins/mccp/scripts/lib/impeccable-routing.js:63` | b111dca | `PLAN_GUIDE`가 라우팅하는 명령 카탈로그 20종이 열거돼 있다 |
| P18 | `plugins/mccp/commands/pr.md:759` | b111dca | a11y-architect auto-invoke의 트리거는 `codex-result.json`의 `rendering_surface`이며 impeccable probe와 무관하다 |
| P19 | `plugins/mccp/scripts/lib/env-contract/registry.js:132` | b111dca | `MCCP_IMPECCABLE_SKILL`이 타입 `'string'` · enum 없음 · 설명 "impeccable skill 이름"으로 등재돼 있다 |
| P20 | `plugins/mccp/scripts/lib/env-contract/registry.js:223` | b111dca | `IMPECCABLE_VERSION` 외 18종 external 변수의 소비처가 전부 `impeccable-detect.js:135`로 귀속돼 있다 |
| P21 | `docs/environment/external.md:301` | b111dca | 문서가 `IMPECCABLE_VERSION`을 "mccp의 `/mccp:setup` dep-check가 CLI 미설치 환경에서 fallback hint로 honor"한다고 서술한다 |
| P22 | `.claude/PRPs/plans/archived/v0-3-6-codex-scope-state-noise.plan.md:62` | b111dca | v0.3.6이 marketplace skill 디렉토리 probe를 명시적으로 scope 밖으로 이연했다 |
| P23 | `.claude/audit/v1.0.0-docs-sync.md:50` | b111dca | v1.0.0 docs-sync 감사가 "`.claude/skills/impeccable/`에 vendor되어 있고"를 전제 오류로 판정하고 문서 재작성을 지시했다 |
| P24 | `.claude/audit/v1.0.0-baseline.md:39` | b111dca | v1.0.0 baseline 감사가 dep-check(PATH)와 Skill probe(user-level)의 2층 불일치를 F-W1-2로 이미 기록했다 |
| P25 | `CLAUDE.md` | b111dca | §1.1 표가 impeccable을 "번들 안 함 — 사용자가 별도 plugin 설치"로 단언한다 |
| P26 | `plugins/mccp/scripts/lib/gitignore-provision.js:130-132` | b111dca | provision 블록이 `.impeccable/*`를 무시하고 `!.impeccable/design.json`만 예외로 둔다 — 주석은 design.json을 "shared design-direction config"라 서술한다 |
| P27 | `plugins/mccp/commands/setup.md:102-103` | b111dca | setup이 실행하는 명령이 `npm install -g impeccable` + `impeccable skills install` 2행이며, 산문은 후자가 `~/.claude/skills/`에 배포한다고 서술한다 |

## Evidence

### 0. 관측 환경 (실측)

`~/.claude/plugins/installed_plugins.json`의 impeccable 항목은 정확히 하나이며 키는 `impeccable@impeccable`이다.

```
impeccable keys: ["impeccable@impeccable"]
  scope       : user
  installPath : C:\Users\skypark207\.claude\plugins\cache\impeccable\impeccable\4.1.1
  version     : 4.1.1
```

`~/.claude/skills/impeccable`은 존재하지 않는다 (`~/.claude/skills/`에는 `learned/`만 있다). 즉 이슈 #155가 서술한 "구 CLI 잔재가 fail-open을 만들던" 단계는 이미 지났고, 지금은 그 다음 상태다.

같은 저장소에서 탐지기를 그대로 호출한 실측:

```
probeSkillAvailable()  = false
checkImpeccableCli()   = {"installed":false}
detect({mode:'plan'})  = { skill_available:false, cli_available:false,
                           design_signal:false, reason:"skill-missing",
                           silent_skip:false }
```

impeccable 4.1.1이 정상 설치된 머신에서 mccp의 디자인 축 전체가 `skill-missing`으로 판정된다. 이것은 가설이 아니라 현재 상태다. 이번 세션의 SessionStart 배너가 그대로 증거다 — `[mccp] Missing dependencies: impeccable. Run /mccp:setup to install.`

### 1. F1 (HIGH · 근인) — probe가 marketplace 키 규칙을 모른다

`<plugin>@<marketplace>` 규칙에서 marketplace id는 설치 소스가 정한다. impeccable은 `github:pbakaus/impeccable`에서 오므로 키가 `impeccable@impeccable`이 되는데, probe는 `impeccable@anthropics`와 bare `impeccable` 두 리터럴만 정확 일치로 본다 (P1·P2). 어느 쪽도 맞지 않는다.

`impeccable@anthropics`가 어디서 왔는지는 코드가 말하지 않는다 — 주석 어디에도 그 marketplace를 관측했다는 기록이 없다. 추정으로 박은 키가 test fixture(P16)에 고정되면서 회귀 test가 오답을 보존하는 구조가 됐다. 키를 고치면 그 test가 붉어지므로, 수정은 코드와 fixture를 같은 커밋에서 다뤄야 한다.

fallback(P3)은 `~/.claude/skills/impeccable` 한 곳뿐이라, plugin cache에 실재하는 `plugins/cache/impeccable/impeccable/4.1.1/skills/impeccable/SKILL.md`를 보지 못한다.

### 2. F2 (HIGH) — setup이 낡은 명령으로 구버전 채널을 권하고, 그 결과가 F1의 fail-open 조건을 생산한다

> **2026-08-22 정정.** 이 절의 이전 판본은 npm CLI 채널이 "폐기됐다"고 전제했다. 공식 문서 대조 결과 **거짓이다** — `/tutorials/getting-started`는 `npx impeccable install`을 기본 경로로 제시하며 폐기 표시가 없다. 실제 상태는 폐기가 아니라 **채널 간 버전 격차**다(npm latest 3.6.0 · plugin 4.1.1). 아래는 그 정정을 반영한 본문이다.

`checkImpeccableCli`는 PATH 단일 채널이다 (P4). plugin 설치자는 영구히 `installed:false`다. 그 하나의 boolean이 두 표면을 동시에 오염시킨다.

- SessionStart(P6): 24시간마다 "Missing dependencies: impeccable" 오탐. 정상 설치자가 24시간마다 존재하지 않는 문제를 통보받는다.
- `/mccp:setup` Phase 3(P5·P27): 매 실행마다 설치를 권하고, 승낙하면 `npm install -g impeccable` + `impeccable skills install`을 돌린다.

**두 명령 모두 공식 문서에 없다.** 공식 설치 경로는 `npx impeccable install` **하나**이고, `impeccable skills install`이라는 서브커맨드는 문서 어디에도 나오지 않는다. 즉 setup이 권하는 것은 "폐기된 채널"이 아니라 **문서에 없는 낡은 명령**이며, 그것이 배포하는 자리가 P3의 fallback 경로(`~/.claude/skills/impeccable`)라 4.1.1이 설치돼 있어도 3.x 본문이 섀도잉한다. setup을 따르면 probe가 true로 돌아오지만, 4.1.1을 인식해서가 아니라 구버전 디렉토리가 생겨서다 — 자기 진단을 자기가 위조하는 형태다.

Phase 3의 문구 `impeccable is a separate npm CLI (not a Claude plugin)`도 이제 **절반만 참**이다. CLI는 실재하고 폐기되지 않았으나, Claude Code plugin 채널도 동시에 실재한다.

### 3. F3 (MEDIUM · 이슈 밖 신규 · 등급 하향) — 이 저장소에 3.5.0 사본이 git-tracked로 남아 있다

> **2026-08-22 정정 (HIGH → MEDIUM).** 이전 판본은 이것을 "번들 금지 위반"으로 규정했다. 공식 문서 대조 결과 `.claude/skills/`는 **npm CLI 설치기의 정상 산출 위치**다("Run `npx impeccable install` from project root" → "Files are deployed to tool-specific directories like `.claude/skills/`"). 따라서 위치 자체는 위반이 아니다. 남는 쟁점은 **git-tracked 여부와 3.5.0이라는 정체** 둘뿐이며, 그만큼 등급을 내린다.

`.claude/skills/impeccable/`에 impeccable 3.5.0 본문이 79개 파일로 git-tracked 상태다 (P15). 도입 커밋은 `bc18572 feat: 개발용 ECC Plugin 주입`.

CLAUDE.md §1.1(P25)의 "번들 안 함"은 `plugins/mccp/skills/`에 한해서만 참이다 — commit `2116c43 chore: impeccable을 plugin에서 제외`가 지운 것은 plugin 쪽 사본이고, 프로젝트 쪽 사본은 남았다. 다만 위 정정에 따라 이것은 "문서 위반"이 아니라 **문서가 CLI 설치 채널을 서술하지 않는 공백**이다.

실제로 남는 귀결 셋:

- **버전 섀도잉.** 3.5.0 사본이 plugin 4.1.1보다 우선 해소된다 — 다른 프로젝트에서 실측됐다(Evidence §9). git-tracked라 **모든 체크아웃에 3.5.0이 따라온다.**
- **본문 드리프트.** 3.5.0에는 4.1.1 SKILL.md가 로드를 지시하는 `reference/craft-floor.md`·`new-work.md`·`operate.md`·`routing.md`·`degraded/`가 없고, 반대로 4.1.1이 버린 `brand.md`·`product.md`·`interaction-design.md`가 남아 있다. 스크립트 층도 다르다 (4.1.1의 `doctor.mjs`·`surface-brief.mjs`·`hook-*.mjs`·`concept-seed.mjs` 부재).
- **probe는 이 디렉토리를 아예 안 본다** (P3). 공식 CLI의 **기본 설치 위치**를 mccp가 구조적으로 못 보는 것이므로, 이는 F3의 부산물이 아니라 **F1의 확장**이다.

v1.0.0 docs-sync 감사(P23)가 이 디렉토리를 "전제 오류"로 규정한 것은 여전히 틀렸다 — 디렉토리는 실재한다.

### 4. F4 (MEDIUM) — 같은 `skill-missing`이 게이트마다 반대 방향으로 작동한다

| 게이트 | `SKILL_AVAIL=0`의 결과 | 방향 |
|---|---|---|
| `/mccp:plan` (P9) | plan 본문에 skip 주석 기록 후 통과. receipt `impeccable_skipped=true`는 warning | fail-open |
| `/mccp:prp-implement` (P10·P7) | strict 게이트 — 하류 `/mccp:pr`을 차단하는 receipt를 봉인 | fail-closed |
| `/mccp:pr` (P11·P8) | blocking. 탈출은 `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` audited escape뿐 | fail-closed |

F1이 살아 있는 상태에서 사용자가 이슈 지적대로 레거시 `~/.claude/skills/impeccable`을 지우면, plan은 조용히 통과하고 PR 단계에서 하드블록된다. 사이클의 가장 비싼 지점에서 처음 막히고, 그때 사용자가 받는 진단은 "impeccable이 없다"인데 실제로는 4.1.1이 설치돼 있다. 진단이 참이 아니므로 사용자가 취할 수 있는 올바른 행동이 없고, 남는 선택지는 audited escape를 쓰는 것뿐이다 — 게이트가 의미 없이 소비된다.

이 비대칭 자체는 의도된 설계로 읽힌다(주석이 "write action이니 strict"라고 말한다). 결함은 비대칭이 아니라 비대칭의 입력이 틀렸다는 것이다.

### 5. F5 (MEDIUM) — Codex design-scope 분할이 같은 오답 하나에 매달려 있다

`--impeccable-available`은 세 게이트 전부에서 `probeSkillAvailable({})` 반환값으로 결정되고 (P12), 그 플래그가 `DESIGN_SCOPE_PREAMBLE` 적용 여부를 정한다 (P13). preamble은 Codex에게 design 6범주 및 a11y를 emit하지 말라고 지시한다 (P14).

두 상태 모두 비정상이다.

- **지금(probe=false)**: preamble 미적용 → Codex가 design/a11y finding을 그대로 낸다. impeccable은 안 돈다. 커버리지 자체는 남지만, 설계가 의도한 소유권 분할(design→impeccable, security/correctness/perf→Codex)이 무너지고 receipt의 `codex_design_scope_excluded=false`가 "impeccable이 없다"는 틀린 사실을 봉인한다.
- **setup을 따른 뒤(probe=true, 3.6.0 섀도)**: preamble 적용 → Codex는 design 축에 침묵하고, impeccable은 3.6.0 본문으로 돈다. 두 리뷰어 모두 4.1.1 기준을 적용하지 않는 구간이 열린다. 이슈가 "조용한 위험"이라 부른 것의 정확한 기계적 형태가 이것이다.

### 6. F6 (확인된 정상 축) — a11y-architect auto-invoke는 영향받지 않는다

트리거가 `codex-result.json`의 `rendering_surface`이고 impeccable probe와 무관하다 (P18). 설계 주석이 밝힌 이유("design-scope preamble이 a11y를 억제하므로 finding 기반 트리거는 starve된다")가 결과적으로 이 축을 F1로부터 격리했다. 고칠 것 없음.

다만 `rendering_surface`는 `codex-runner.js`가 `codex-result.json`에 쓰는 값이므로, Codex가 skip/disabled면 a11y auto-invoke도 함께 죽는다. 이는 impeccable 채널과 무관한 별개 축이라 이번 조사 범위 밖으로 둔다.

### 7. F7 (LOW) — 명령 카탈로그는 무손실. 신규 명령만 미반영

`PLAN_GUIDE`가 라우팅하는 20종(P17: shape · layout · typeset · animate · colorize · bolder · quieter · overdrive · delight · adapt · distill · clarify · critique · audit · harden · optimize · onboard · polish · document · extract)은 전부 4.1.1에 존재한다. 채널 전환이 라우팅 표를 깨지 않았다.

4.1.1이 새로 가진 `visualize` · `doctor` · `operate` · `new-work` · native 계열(`ios` · `android` · `adapt.native` · `audit.native`)은 표에 없다. 결함이 아니라 미반영이며, 이번 사이클의 필수 항목도 아니다. `craft`는 4.1.1에서 "Deprecated alias"가 됐는데 mccp는 이미 제외하고 있다 — 우연히 맞았다.

### 8. F8 (LOW) — env-contract registry / 문서 드리프트

- `MCCP_IMPECCABLE_SKILL`(P19)은 타입 `'string'` · enum 없음 · 설명 "impeccable skill 이름"인데, 코드는 이 값을 `available` / `missing` 2값으로만 해석한다 (`impeccable-detect.js:135-136`). 그 밖의 문자열은 조용히 무시된다. 이름을 넣으라는 설명대로 쓰면 아무 일도 일어나지 않는다.
- `IMPECCABLE_*` external 변수 19종의 소비처가 전부 `impeccable-detect.js:135`로 귀속돼 있다 (P20). 그 줄은 `MCCP_IMPECCABLE_SKILL` env override 한 줄이고, 나머지 변수는 impeccable 자신의 스크립트가 읽는다. 일괄 채워넣은 자리표시자가 그대로 남았다.
- `IMPECCABLE_VERSION`이 "`/mccp:setup` dep-check가 fallback hint로 honor"한다는 서술(P21)은 사실이 아니다 — `plugins/mccp/scripts/` 전체에서 그 변수를 읽는 코드는 registry 등재 행 1건뿐이고 `dep-check.js`에는 없다 (실측 grep).
- `docs/environment/external.md`가 `.claude/skills/impeccable/scripts/*.mjs`를 링크 앵커로 6곳 이상 사용한다. F3의 벤더 디렉토리를 지우기로 하면 그 링크가 같이 깨진다 — 제거 결정에 딸려오는 비용이다.

### 9. F9 (MEDIUM · 신규) — mccp가 provision하는 `.impeccable/` 무시 규칙이 공식 계약과 극성이 반대다

`gitignore-provision.js:130-132`(P26)가 **모든 사용자 저장소에** 다음을 심는다.

```
# impeccable tool byproducts. design.json is the shared design-direction config.
.impeccable/*
!.impeccable/design.json
```

공식 `/docs/config`는 반대로 규정한다.

| 파일 | 공식 | mccp provision |
|---|---|---|
| `.impeccable/config.json` | **commit** — "team-wide detector ignores representing shared project intent" | ignore (어긋남) |
| `.impeccable/design.json` | 생성 sidecar — "The markdown files are the files you own. The generated JSON helps the detector, hooks, and Live Mode read the design system precisely." | tracked (어긋남) |
| `.impeccable/config.local.json` | ignore (`/.impeccable/config.local.json`) | 포괄 ignore로 우연히 일치 |
| `.impeccable/hook.ndjson` | ignore | 포괄 ignore로 우연히 일치 |

두 파일 모두 극성이 뒤집혔고, mccp 주석의 "design.json is the shared design-direction config"는 사실이 아니다 — 공유 파일은 `config.json`이다. 이 블록은 `/mccp:setup` Phase 5가 provision하므로 **오답이 사용자 저장소로 전파된다.**

### 10. F10 (MEDIUM · 신규) — hook이 채널마다 별도로 등록돼 이중 발화가 가능하다

impeccable 4.1.1 plugin은 자체 `hooks/hooks.json`을 ship한다 — `PostToolUse` matcher `Edit|Write`(timeout 5) + `Stop`(timeout 30). 공식 `/docs/hooks`는 **CLI 설치기가 Claude Code용 hook manifest를 `.claude/settings.local.json`에 쓴다**고 명시한다. 즉 **CLI + plugin 양쪽 설치 시 같은 hook이 두 경로로 등록**된다.

hook 실물은 소스 파일을 편집하지 않고 `hookSpecificOutput.additionalContext`로 system reminder만 emit하므로 mccp의 PR-phase mutations finalizer는 건드리지 않는다(확인함). 또한 `.impeccable/` 산출물은 mccp의 provision 블록이 이미 포괄 무시한다.

두 가지가 남는다.

- **Node 22+ 요구.** plugin `hooks.json` 실물이 `parseInt(process.versions.node,10) >= 22`를 검사하고, 미충족 시 `~/.impeccable/node-unsupported` 마커를 쓰고 systemMessage를 낸다. mccp CLAUDE.md는 Node **20+** 를 명시한다 — 두 하한이 어긋난다. (공식 문서에는 Node 요구 서술이 없어 **실물을 근거로 삼는다.**)
- **mccp Stop-loop과 동거.** 둘 다 `Stop`에 붙고 둘 다 `additionalContext`를 낸다. 상호작용은 미측정이다.

kill switch는 존재한다 — `IMPECCABLE_HOOK_DISABLED` env · `.impeccable/config.json`의 `hook.enabled:false` · `/impeccable hooks off`.

## Prior Art

**2026-08-22 갱신 — 최초 판본은 "미조사"였다.** 운영자 지시로 공식 문서 `https://impeccable.style/docs/`와 그 하위를 대조했고, 그 결과가 F2·F3의 등급과 Verdict의 P0-b·P1을 바꿨다. 아래는 판정에 실제로 쓰인 것만 남긴 것이다.

### 설치 채널 (`/tutorials/getting-started`)

공식이 제시하는 채널은 넷이며 **어느 것도 폐기 표시가 없다.**

| 채널 | 명령 | 배포 위치 | 관측 버전 |
|---|---|---|---|
| npm CLI — 공식 기본 | `npx impeccable install` (project root) | harness 자동 감지 후 `.claude/skills/` 등 | 3.6.0 |
| Claude Code plugin | `/plugin marketplace add pbakaus/impeccable` | plugin cache | 4.1.1 |
| skills marketplace | `npx skills add pbakaus/impeccable` | 전 harness 공용 빌드 1종 | GitHub HEAD |
| GitHub Copilot | 내장 (Settings → Experimental) | — | — |

업데이트도 채널별로 살아 있다 — `npx impeccable update` / `npx impeccable check` / plugin은 `/plugin` 메뉴.

`npm view impeccable` 실측: latest **3.6.0**, repository `git+https://github.com/pbakaus/impeccable.git`, homepage `https://impeccable.style`, 최종 수정 **2026-08-14**. 같은 프로젝트의 두 채널이 major 하나만큼 벌어져 있을 뿐, npm 채널이 버려진 것이 아니다.

**판정에 미친 영향**: 최초 Verdict의 P0-b는 "npm 채널 지시를 삭제한다"였다. **과했다.** 공식이 기본으로 제시하는 경로를 mccp가 지울 근거가 없다. 고쳐야 할 것은 채널이 아니라 **명령**이다.

### 명령 분류 (`/docs/` 내비게이션)

공식은 23개 명령을 6분류로 싣는다 — Create(`impeccable`·`shape`) · Evaluate(`audit`·`critique`) · Refine 8종 · Simplify 3종 · Harden(`harden`·`onboard`·`optimize`·`polish`) · System(`document`·`extract`·`init`·`live`).

mccp `impeccable-routing.js`의 stage 분류와 대조하면 **6분류 중 5가 정확히 일치**한다. 차이 둘:

- mccp는 `polish`를 별도 stage로 분리하지만 공식은 Harden에 넣는다 (경미).
- 공식 Create에 있는 **bare `impeccable`** 이 mccp 카탈로그에 없다. 공식은 이를 "inspect the project and recommend what to do next" + 자연어 라우팅 진입점으로 정의한다.

**판정에 미친 영향**: F7("카탈로그 무손실")이 SKILL.md 대조에 이어 공식 분류 대조로도 재확인됐다. 라우팅 표 수정은 여전히 불필요하다.

### 설정과 무시 규칙 (`/docs/config`)

F9의 근거다. `.impeccable/config.json`이 commit 대상이고 `config.local.json`·`hook.ndjson`이 ignore 대상이라는 것이 공식 규정이다.

### hook (`/docs/hooks`)

F10의 근거다. Claude Code용 hook manifest가 `.claude/settings.local.json`에 설치된다는 것, 그리고 kill switch 3종(`IMPECCABLE_HOOK_DISABLED` · `hook.enabled` · `/impeccable hooks off`)이 여기서 나온다. **Node 버전 요구는 문서에 없어 plugin 실물을 근거로 삼았다.**

### 조사하지 않은 것

`/docs/context`는 PRODUCT.md·DESIGN.md의 역할까지만 서술하고 **명령별 차단 규칙을 싣지 않는다.** F5(shape 라우팅 어긋남)의 근거인 `BUILD_INIT_REQUIRED` / `SCOPED_EXISTING_ALLOWED` 분기는 공식 문서가 아니라 `context.mjs:1110-1140` 실물에서만 확인된다. **그 축은 문서 뒷받침이 없다** — 실물이 바뀌면 함께 무효화된다.

## Precedent

**이 gap은 새로 생긴 것이 아니라 이연된 것이다.** v0.3.6 plan(P22)이 `probeSkillAvailable`에 user-level 디렉토리 probe를 추가하면서, 같은 줄에서 marketplace 경로를 명시적으로 잘라냈다:

> marketplace skill directory (`~/.claude/plugins/marketplaces/*/skills/impeccable`)는 별도 — 본 task scope 외 (사용자가 user-level 명시 설치한 경우만 인식).

당시 판단은 방어 가능했다 — impeccable이 아직 npm 채널이었고 marketplace 설치가 가설이었다. 이연이 만료된 시점이 impeccable 4.x의 채널 전환이고, 만료를 알리는 기구가 없었다. 이슈 #155가 그 알림 역할을 사람이 대신한 것이다.

두 번째 선례: v1.0.0 baseline 감사(P24)가 dep-check(PATH)와 Skill probe(user-level)의 2층 불일치를 F-W1-2로 이미 기록하고 "W3가 해소"라고 적었다. 그 불일치는 해소되지 않았고, 채널이 하나 더 늘어 이제 3층(PATH · user-level · marketplace plugin)이 됐다. 같은 결함이 두 번 관측되고 두 번 이연된 셈이다.

세 번째 선례는 방향이 반대다. v1.0.0 docs-sync(P23)가 `.claude/skills/impeccable/` 벤더링을 "전제 오류"로 판정했는데 실측상 디렉토리는 실재한다(F3). 선행 문서의 전제가 무효화된 것이 아니라 애초에 틀렸다. 이 조사가 그 감사 항목을 정정하며, 해당 감사 문서의 상태 갱신을 운영자에게 제안한다 — 남의 문서를 임의로 고치지는 않는다.

backlog 선례(`.claude/plans/codex-findings-backlog.md:238`, 2026-08-17)는 impeccable detector 출력의 위양성을 다루므로 축이 다르다. 다만 "impeccable 산출물을 그대로 신뢰하지 말 것"이라는 그 항목의 처방은 F5의 소유권 분할 논의와 같은 온도다.

## Verdict

> **2026-08-22 정정.** 공식 문서 대조로 P0-b와 P1이 바뀌었다. 근인(F1)과 우선순위 골격은 그대로다.

**근인은 하나다: mccp가 impeccable의 존재를 판정하는 채널이 실제 배포 채널과 어긋나 있고, 그 판정 하나에 게이트 발화·Codex scope 분할·setup 권유·SessionStart 경고가 전부 매달려 있다.** F1·F2·F4·F5는 독립 결함이 아니라 같은 오답의 네 출구다. F3은 그 위에 얹힌 별개 축이며, 방향이 반대라 함께 고치지 않으면 서로를 가린다.

수정 순서를 아래로 판정한다.

### P0-a — 탐지를 단일 SoT로 통합하고 반환형을 넓힌다

`probeSkillAvailable`을 다음으로 교체한다.

- manifest 키를 리터럴이 아니라 `^impeccable@` 접두어 매칭으로 본다. 어느 marketplace에서 왔는지는 이슈가 지적한 대로 mccp가 알 필요 없는 사실이다.
- fallback을 넓힌다. 공식 채널이 넷이므로(Prior Art) 최소 셋을 봐야 한다: plugin cache(`plugins/cache/*/impeccable/*/skills/impeccable/SKILL.md`) · **project-level `<repo>/.claude/skills/impeccable`** · user-level `~/.claude/skills/impeccable`. **project-level이 가장 중요하다** — 공식 CLI 설치기의 기본 산출 위치인데 현재 probe가 아예 보지 않는다.
- boolean이 아니라 `{ available, source, version, path }`를 돌려준다. **`version`은 선택이 아니다** — 3.x를 marketplace에 등록한 설치가 가능하므로 채널로 버전을 추정할 수 없다(운영자 지적). `source`는 "무엇 덕분에 true인가"를 진단 가능하게 만든다.
- 소스가 둘 이상이면 **전부 열거하고 실제로 해소될 하나를 지목한다.** user-level 3.5.0이 plugin 4.1.1을 이긴다는 것이 실측됐으므로(Evidence §9 · 운영자 라이브 관측), `available:true` 하나로는 그 실패를 표현할 수 없다.
- test fixture(P16)를 같은 커밋에서 고친다. 안 고치면 회귀 test가 오답을 지키므로 수정이 붉게 나온다.

우선순위 근거: F1·F4·F5가 전부 이 함수 반환값 하나에 매달려 있다(P12가 세 게이트에서 같은 호출을 반복한다). 다른 어떤 수정도 이것보다 먼저 하면 증상만 옮긴다.

### P0-b — setup의 **명령**을 공식으로 맞추고 무시 규칙의 극성을 되돌린다

> **정정.** 이전 판정은 "npm 채널 지시를 삭제한다"였다. 공식이 `npx impeccable install`을 기본 경로로 제시하므로 **삭제는 과하다.** 채널이 아니라 명령이 틀렸다.

같은 사이클에 묶는다. P0-a만 착지하면 setup은 여전히 구버전 디렉토리를 만들고, 그것이 P0-a의 `source`·`version` 필드를 오염시킨다.

- Phase 3(P5·P27)의 설치 명령을 **`npx impeccable install`** 로 교체한다. `npm install -g impeccable` + `impeccable skills install` 2행은 **공식 문서에 없는 명령**이므로 삭제 대상이지만, npm 채널 자체는 남긴다.
- Claude Code 사용자에게는 plugin 채널(`/plugin marketplace add pbakaus/impeccable`)을 **함께 제시**한다 — 그쪽이 4.1.1이다. 어느 쪽을 고를지는 사용자의 선택이며 강제하지 않는다(운영자 제약: 강제 마이그레이션 불가).
- `checkImpeccableCli`를 다채널 `checkImpeccable`로 대체하고 P0-a의 결과를 재사용한다 — 같은 사실을 두 함수가 각자 판정하는 구조를 남기지 않는다.
- Phase 1 detect 표와 Phase 3 문구에서 "separate npm CLI (not a Claude plugin)"를 정정한다. CLI는 실재하되 유일 채널이 아니다.
- SessionStart(P6)가 다채널 결과를 읽게 한다. 이것이 오탐 배너를 닫는 지점이다.
- **F9 동반 수정** — `gitignore-provision.js`의 `.impeccable/` 블록 극성을 공식(`/docs/config`)에 맞춘다: `config.json`은 tracked, `config.local.json`·`hook.ndjson`은 ignore, `design.json`은 생성물이므로 tracked 예외를 **철회**한다. provision 블록이라 오답이 사용자 저장소로 전파되므로 setup 축과 분리할 수 없다.

### P1 — 저장소의 3.5.0 사본은 제거한다 — 근거는 바뀌었고 결론은 유지된다

> **정정.** 이전 근거는 "CLAUDE.md §1.1이 번들을 금지한다"였다. 공식 문서상 `.claude/skills/`는 **CLI 설치기의 정상 산출 위치**이므로 그 근거는 무효다. 그럼에도 제거가 답인 이유는 다르다.

- **섀도잉.** 3.5.0이 plugin 4.1.1보다 우선 해소되는 것이 실측됐고, git-tracked라 **모든 체크아웃에 3.5.0이 따라온다.** 제거하지 않으면 P0-a가 project-level을 보게 되는 순간 이 사본이 "유효한 탐지원"이 되어 오답이 더 은밀해진다.
- **복구가 싸다.** 지운 뒤 최신이 필요하면 `npx impeccable install` 한 줄이면 된다 — 공식 경로이므로 제거가 되돌릴 수 없는 결정이 아니다.
- **드리프트는 벌어지기만 한다.** 4.1.1이 3.5.0에 없는 파일(`craft-floor.md`·`new-work.md`·`operate.md`)의 로드를 지시한다.

비용은 실재한다 — `docs/environment/external.md`의 링크 앵커 6곳 이상이 이 경로를 가리키므로 함께 정정해야 한다(F8 마지막 항). 그리고 CLAUDE.md §1.1의 "번들 안 함" 표현은 **CLI 설치 채널을 서술하지 않는 공백**이므로 제거와 무관하게 보강이 필요하다.

### P2 — 게이트 방향의 비대칭은 유지, 입력만 고친다

F4의 lenient/strict 비대칭 자체는 재설계 대상이 아니다(write action 기준이 명시적이고 방어 가능하다). P0이 착지하면 "설치했는데 PR에서 막힌다"가 사라지므로 비대칭은 의도대로 작동한다. P0 이전에 F4를 손대지 말 것 — 지금 strict를 완화하면 진짜 미설치까지 통과시킨다.

### P2.5 — 게이트 발화 정합은 별도 축이다 (MVP 밖 권고)

라우팅 오라클 실측(9조합)에서 나온 두 어긋남은 F1과 독립이며 P0이 착지해도 남는다.

- **`shape`가 implement에서 발화한다.** 공식은 `shape`를 Create 분류의 "Plan UX/UI **before writing code**"로 정의하는데 mccp는 코드가 나온 뒤 `background`로 돌린다. 더구나 `context.mjs:1110-1140`이 PRODUCT.md 부재 시 `shape`를 `BUILD_INIT_REQUIRED` 차단 대상으로 지목하므로, 비대화형 게이트가 human interview 경로로 빠진다. **단, 이 분기는 공식 문서 뒷받침이 없다**(Prior Art 말미) — 실물 기반이므로 착수 전 재확인이 필요하다.
- **`harden`·`optimize`·`onboard`·`polish`가 어느 게이트에서도 발화하지 않는다.** implement 표에 부재하고 pr 표에는 있으나 pr은 review-only다.
- 공식 Create의 **bare `impeccable`** 이 mccp 카탈로그에 없다.

### P3 — registry / 문서 드리프트 정리

F8은 게이트를 막지 않으므로 마지막이다. 다만 `MCCP_IMPECCABLE_SKILL`의 타입·설명 정정(P19)은 P0-a와 같은 파일 근방을 만지므로 그 사이클에 얹는 편이 싸다. `IMPECCABLE_VERSION` 서술(P21)과 소비처 일괄 오귀속(P20)은 별도 chore로 충분하다.

### 이 판정이 주장하지 않는 것

- **F7은 고칠 대상이 아니다.** 4.1.1 신규 명령 미반영은 결함이 아니라 미반영이며, 라우팅 표 확장은 별도 축이다.
- **F6은 이미 정상이다.** a11y auto-invoke를 이번 범위에서 건드릴 이유가 없다.
- **P0이 디자인 게이트의 품질을 보장하지 않는다.** 닫는 것은 "설치했는데 발화하지 않는다"이고, 발화한 뒤 impeccable이 무엇을 찾는지는 별개 문제다(backlog 2026-08-17 항목이 그 축이다).
- **bare skill 이름 해소 규칙은 여전히 미확정이다.** P0-a의 project-level probe는 "그 디렉토리가 있으면 skill이 있다"만 주장하고, 그것이 4.1.1보다 우선하는지는 주장하지 않는다.

## Open Questions

> 2026-08-22 갱신 — 1번이 부분적으로 닫혔고 두 항목이 추가됐다.

1. **skill 해소 우선순위의 일반 규칙.** user-level 3.5.0이 plugin 4.1.1을 이긴다는 것은 라이브로 관측됐다(운영자 보고). **project-level `.claude/skills/`가 그 순서 어디에 끼는지는 여전히 미확인**이며, 공식 CLI의 기본 설치 위치가 바로 거기라 P0-a의 정확도를 좌우한다.
2. **`impeccable@anthropics`는 어디서 왔는가.** 코드·주석·plan 어디에도 그 marketplace를 관측했다는 기록이 없다. 과거 실재한 채널인지 추정 리터럴인지에 따라 접두어 매칭이 하위 호환을 얼마나 져야 하는지가 갈린다.
3. **4.1.1의 `allowed-tools`가 plugin 설치에서 유효한가.** SKILL.md가 `Bash(node .claude/skills/impeccable/scripts/*)`를 선언하는데 plugin base는 cache 경로다. 권한 프롬프트가 실제로 뜨면 **탐지를 고쳐도 비대화형 게이트에서 멎는다** — MVP 성공 여부를 좌우할 수 있는 유일한 항목이다.
4. **hook 이중 등록의 실제 영향.** CLI가 `.claude/settings.local.json`에, plugin이 `hooks/hooks.json`에 각각 등록한다. 양쪽 설치 시 `PostToolUse(Edit|Write)`가 2회 도는지, 그리고 impeccable `Stop` hook(timeout 30)이 mccp Stop-loop과 어떻게 상호작용하는지 미측정이다.
5. **Node 하한 불일치를 어느 쪽에 맞출 것인가.** plugin hook은 22+를 요구하고 mccp는 20+를 명시한다. mccp가 하한을 올릴지, hook 미동작을 정상 degraded로 문서화할지 미정이다.
6. **`.impeccable/design.json` tracked 예외를 철회할 때 기존 저장소는 어떻게 되는가.** provision 블록은 마커 span만 교체하므로 규칙은 바뀌지만, 이미 커밋된 `design.json`은 tracked로 남는다. untrack 여부는 사용자 결정이다(§Phase 5 "already-tracked files ... do not untrack them" 관례와 정합).
