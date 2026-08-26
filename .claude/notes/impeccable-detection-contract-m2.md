# impeccable 탐지 계약 M2 — 작업 노트

> plan 본문(`.claude/plans/impeccable-detection-contract-m2.plan.md`)은 `mccp-plan-codex`
> receipt에 `plan_hash`로 결속돼 있어 편집하면 stale이 된다(§3.11 guard 2). 그래서 게이트
> 산출물·사전 측정·라이브 증거는 전부 이 파일이 소유한다 — M1·M3 선례와 같은 자리.

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review`
  (fail-closed Bash wrapper, v0.2.2) · `--timeout-ms 540000`
- 라운드 수: 1 (`MCCP_REVIEW_SINGLE_PASS=deadline_pressure`로 캡 1 고정 — `effectiveRoundCap` 실측 `{"cap":1,"pinned":true}`)
- 호출 횟수 2회 / 기록 라운드 1: 1차 호출의 envelope를 stdout 파일로 저장하지 않아
  셸 종료와 함께 유실했다(harness 처리 실수). 동일 focus로 1회 재호출해 기록을 확보했고,
  두 응답 모두 **같은 working-tree diff**에 대한 R1이다. 아래 triage는 양쪽 findings를 합친다.
  (1차 = R1a, 2차 = R1b. R1b envelope는 worktree gitdir의 `mccp/tmp/codex-impl.json`)
- 합치 결론: verdict `needs-attention` → `CODEX_VERDICT=divergent`. 실질 지적 2건을 구현
  계약으로 흡수하고, "구현이 아직 없다" 계열 2건은 게이트 위치(EXECUTE 이전)의 부산물로 기각.

- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | R1a-F1 SessionStart test bypasses the repoRoot contract | HIGH | ACCEPT_NOW | `MCCP_IMPECCABLE_SKILL`은 오라클 최우선 축이라 파일시스템·repoRoot 경로를 통째로 단락시킨다 — repoRoot를 안 넘긴 구현도 그 test를 통과한다. env 없는 hook-spawn test(임시 repo + project 사본 + 중첩 cwd)를 Task 7에 추가한다 |
  | R1a-F2 Setup install branch can ship stale or broken | HIGH | ACCEPT_NOW | 설치 후 재-`dep-check`가 Task 4 항목으로 명시되지 않았고 필수 리터럴에도 `dep-check`가 없다. L2 invariant 패널이 같은 지적을 냈다(backlog `id=3df115cd`, 이미 수용). Phase 3 설치 분기에 재-`dep-check` + Phase 1 표 갱신을 명시하고 정적 test 필수 리터럴에 `dep-check`를 넣는다 |
  | R1a-F3 Gitignore flip surfaces design.json as pollution | HIGH | DEFER_TO_BACKLOG | 1차 envelope 유실로 본문이 중간에서 끊겼다. 다만 plan이 UI7로 tracked 유지를 이미 결정했고 provisioner는 자동 untrack하지 않는다는 기존 계약이라, 새 결정이 필요한 축이 아니다 — backlog로 이연 |
  | R1b-F1 M2 detection contract is absent from dep-check and SessionStart | CRITICAL | REJECT_YAGNI | 결함이 아니다. Implement-Codex 게이트는 `prp-implement.md` 2.5 헤더대로 **Phase 3 EXECUTE 이전**에 돌므로 pre-EXECUTE diff에 구현이 없는 것이 정상이다. 이 finding의 recommendation은 plan Task 1·2를 그대로 복창한다 |
  | R1b-F2 Setup and ignore-rule behavior still use the pre-M2 contract | HIGH | REJECT_YAGNI | 위와 같은 범주 — plan Task 3·4를 복창한다 |

- Deferred to backlog: 6 (Codex R1a-F3 이연 · R1b-F1·R1b-F2 기각 · security S4·S5 기각 · S7 이연) → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 (auto-CRITICAL 카탈로그 해당 0건)
- Codex session 참조: R1a threadId `01a02976-d257-7a52-a86d-c56af06f0ede`

### Security Reviewer

- 호출: `Task(mccp:security-reviewer)` — read-only. 결과: CRITICAL 3 · HIGH 3 · MEDIUM 1 · LOW 1.
- 명령 본문(`prp-implement.md` 2.5.5)은 "CRITICAL/HIGH security findings → MCCP-GATE-STOP"을
  규정하지만, §3.14가 정한 수용 절차(CRITICAL/HIGH는 **그 자리에서 흡수**, 기각은 증거 첨부)를
  적용해 **전건을 처리하고 진행**한다. 아래 판정은 전부 file:line 또는 1차 자료 인용을 갖는다.

| # | Severity | Finding | Verdict | 근거 |
|---|---|---|---|---|
| S1 | CRITICAL | SKILL.md frontmatter version이 검증 없이 터미널 출력으로 흐른다(ANSI/제어문자 주입) | ACCEPT_NOW (범위 조정) | 실재한다. 다만 `impeccable-detect.js`는 `Files to Change` 밖이므로 **내가 새로 만드는 렌더 경계**에서 막는다 — Task 1의 `dep-check` CLI printer 행과 Task 4의 Phase 1 표가 그 경계다. 화이트리스트 `[A-Za-z0-9._+-]` · 길이 상한 · 위반 시 `?`로 표기 |
| S2 | CRITICAL | 지연 require가 throw하거나 부분 export를 잡으면 `checkImpeccable`이 sentinel 계약을 깬다 | ACCEPT_NOW | `dep-check.js:8` 헤더가 "Never throws. Returns sentinel objects"를 자기 계약으로 선언하고 plan Task 1의 Mirror가 `dep-check.js:20` sentinel을 지목한다. plan 문구("반환을 그대로 돌려준다")를 문자 그대로 구현하면 계약 위반이 된다 — try/catch + `typeof resolveImpeccable === 'function'` 검사 후 `{available:false, reason:'detect-load-error'}` 반환 |
| S3 | CRITICAL | `Bash(npx:*)`는 임의 원격 패키지 실행을 허용한다 | ACCEPT_NOW (plan 이탈) | 타당하다. `Bash(npx impeccable:*)`로 좁힌다 — 다단어 prefix는 지원 형식이고, 형태가 틀려도 실패 모드가 권한 프롬프트라 안전한 방향이다. plan Task 7이 요구한 필수 리터럴도 좁힌 형태로 바꾼다(**의도적 plan 이탈** — report에 기록) |
| S4 | HIGH | 신뢰할 수 없는 `repoRoot`로 path traversal | REJECT (코드가 반박) | `impeccable-detect.js:158-172` `normalizeSourcePath`는 **표시용 문자열만** 만든다 — repoRoot로 파일을 열지 않는다. `path.relative` 결과가 `..`로 시작하거나 절대경로면 거부하고 home-relative → raw로 강등한다. 잘못된 repoRoot의 실제 귀결은 "덜 정규화된 표시 경로"이지 escape가 아니다. 입력원도 `git rev-parse --show-toplevel` 또는 `process.cwd()`라 공격자 제어가 아니다 |
| S5 | HIGH | SKILL.md 읽기의 FIFO 블로킹 | REJECT (이미 흡수됨) | `impeccable-detect.js:197-199`가 `isRegularFile`를 **선행** 호출하고 주석이 출처를 "security-reviewer 2B"로 명시한다 — M1이 같은 지적을 이미 흡수했다. 잔여 TOCTOU는 skill 디렉토리 쓰기 권한을 가진 로컬 공격자를 전제하는데, 그 공격자는 SKILL.md 자체를 고치면 된다. 해당 파일은 `Files to Change` 밖 |
| S6 | HIGH | `config.json` 무시 해제 전에 비밀정보 부재를 검증하지 않았다 | ACCEPT_NOW → **1차 자료로 해소** | 설치된 impeccable v4.1.1 자체 레퍼런스가 직접 답한다: `skills/impeccable/reference/hooks.md:11` "Per-developer overrides, **including the install consent decision (`hook.consent`)**, live in the **gitignored** `.impeccable/config.local.json`" · `hooks.md:48` "The default scope is **shared** `.impeccable/config.json`" · `new-work.md:53` "the gitignored `config.local.json` winning where one machine differs from **the team's committed value**". 즉 비밀·동의 값은 `config.local.json`에 살고 그것은 `.impeccable/*`에 계속 걸린다. `config.json`의 키는 `buildPath` · `hook.*` · `detector.*` · `projectRoots` · `stalenessCheck` — 자격증명 없음. 이 인용을 gitignore 블록 주석에 남긴다. 같은 증거가 L2 test 패널 HIGH(`id=6204117d`, 근거 미검증)도 닫는다 |
| S7 | MEDIUM | tracked `design.json`이 매 provision마다 pollution으로 보고된다 | DEFER_TO_BACKLOG | §3.14대로 MEDIUM은 이연. UI7이 tracked 유지를 정했고 provisioner 무자동-untrack은 기존 계약이다. Codex R1a-F3과 같은 축이라 backlog에서 합류 |
| S8 | LOW | 4면 version 동기 누락 | 조치 없음 | plan Validation이 이미 `i18n-surface.test.js`로 소유한다(기대값을 `plugin.json`에서 파생하므로 footer 누락이 red) |

### 구현 계약으로 이관된 항목 (흡수 결과 — 구현 시 반드시 반영)

plan 본문은 봉인돼 흡수를 본문에 반영할 수 없으므로, 아래를 구현 계약으로 둔다.

- **C1 (R1a-F1)** — Task 7의 `session-start-dep-check.test.js`에 env override를 쓰지 않는
  케이스를 **추가**한다: 임시 git repo에 `.claude/skills/impeccable/SKILL.md`를 만들고
  하위 디렉토리를 cwd로 hook을 spawn해, `injectorRepoRoot` 전달이 있을 때만 배너가 침묵함을
  단언한다. 기존 env 양방향 케이스는 그대로 둔다(빠른 배선 확인용).
- **C2 (R1a-F2 + L2 invariant `id=3df115cd`)** — Task 4 Phase 3의 설치 분기는 설치 직후
  `checkImpeccable()` 재실행 + Phase 1 표 갱신 보고를 포함한다. Task 7의
  `setup-command-body.test.js` 필수 리터럴에 `dep-check`를 추가한다.
- **C3 (L2 invariant `id=877c8f0f`)** — Task 9에 관측 (d)를 더한다:
  `MCCP_IMPECCABLE_SKILL=missing`으로 `/mccp:setup --dry-run`이 설치 분기에 진입해
  plugin-first 선택지와 invocation-gap 경고를 출력하는지 확인하고 기록한다.
- **C4 (S1)** — 버전 문자열은 **내가 만드는 렌더 경계에서** 소독한다. `dep-check.js`의
  `impeccable skill` printer 행과 `setup.md` Phase 1 표에 들어가기 전에 화이트리스트
  `^[A-Za-z0-9._+-]{1,64}$`를 적용하고, 위반하면 값을 버리고 `?`로 적는다.
  `impeccable-detect.js`는 `Files to Change` 밖이므로 손대지 않는다.
- **C5 (S2)** — `checkImpeccable`은 `dep-check.js:8`이 선언한 sentinel 계약("Never throws")을
  지킨다. 지연 require를 try/catch로 감싸고 `typeof detect.resolveImpeccable === 'function'`을
  확인한 뒤 호출하며, 실패 시 `{ available:false, reason:'detect-load-error', … }`를 돌려준다.
  **관대한 방향으로 실패하지 않는다** — `available`은 실패 시 반드시 false.
- **C6 (S3)** — frontmatter는 `Bash(npx:*)`가 아니라 `Bash(npx impeccable:*)`를 쓴다.
  `setup-command-body.test.js`의 필수 리터럴도 좁힌 형태로 단언한다. **plan Task 4·7 문구에서
  의도적으로 이탈**하며 report의 Deviations에 WHAT/WHY로 남긴다.
- **C7 (S6)** — gitignore 블록 주석이 극성의 1차 근거를 직접 인용한다:
  `config.local.json`이 gitignored per-developer 파일이고 `hook.consent` 같은 로컬 값이
  거기 산다는 impeccable v4.1.1 `reference/hooks.md` 서술. 주석이 근거를 말한다는
  `gitignore-provision.js:104` Mirror 그대로.
## Task 0 — 라이브 사전 측정

측정일 2026-08-22. **어떤 설치도 수행하지 않았다** — 전부 기존 레지스트리·파일 읽기와 `--help`다.

### (a) `claude` 실행 파일과 `plugin` 서브커맨드

- 명령: `which claude` · `claude --version` · `claude plugin --help`
- 출력: `/c/Program Files/nodejs/claude` · `2.1.239 (Claude Code)` · `plugin|plugins` 서브커맨드 실재
  (`details` `disable` `enable` `eval` `init|new` `install|i <plugin>` `list` `marketplace`
  `prune` `tag` `uninstall` `update` `validate`)
- 판정: **가용**. mccp 자신의 probe가 `ENOENT`로 실패한 것(`[mccp] claude --version probe failed`)은
  probe 경로 문제이지 바이너리 부재가 아니다.

### (b) marketplace 이름과 설치 키 사슬

- 명령: `~/.claude/plugins/known_marketplaces.json` · `~/.claude/plugins/installed_plugins.json` 읽기 ·
  `claude plugin marketplace --help`
- 출력:
  - `known_marketplaces.json` → `"impeccable": { source: { source: "github", repo: "pbakaus/impeccable" } }`
  - `installed_plugins.json` → 키 `impeccable@impeccable` · `version 4.1.1` · `scope user` ·
    `installPath ~/.claude/plugins/cache/impeccable/impeccable/4.1.1`
  - `claude plugin marketplace add <source>` · `claude plugin install <plugin>`(“use plugin@marketplace
    for specific marketplace”) 둘 다 실물 서브커맨드
- 판정: **사슬 확정** — `pbakaus/impeccable` → marketplace `impeccable` → 키 `impeccable@impeccable`.
  CLI 형태가 확정됐으므로 **Task 4 Phase 3은 slash 안내로 강등하지 않고 CLI 명령을 쓴다**:
  `claude plugin marketplace add pbakaus/impeccable` → `claude plugin install impeccable@impeccable`.
  (이 판정이 Task 4 Step 4의 분기 입력이다 — L2 invariant HIGH `id=e0d2678b`가 지적한
  "측정→구현 전달"의 전달 매개가 바로 이 절이며, `setup.md` Phase 3 주석이 이 절을 근거로 인용한다.)

### (c) plugin 단독 환경의 실제 귀결

- 명령: 임시 repoRoot(project 사본 없음) + 부재 `userSkillDir` + `MCCP_IMPECCABLE_SKILL` 미설정으로
  `resolveImpeccable()` 호출 · `grep -rn "Skill(impeccable" plugins/mccp/`
- 출력:
  - `{ available: true, invocation: "impeccable:impeccable", source: "plugin", version: "4.1.1", shadowed: false }`
  - 호출부 리터럴 `Skill(impeccable` **16건 / 7개 명령 본문** (code-review 2 · plan 2 · plan-prd 1 ·
    pr 1 · prp-implement 6 · prp-pr 1 · review-pr 1). `Skill(impeccable:` 형태는 **0건**.
  - `plugins/mccp/scripts/lib/tests/impeccable-guard.test.js:81`이 canonical 5개 명령 전부에
    bare 호출 존재를 단언한다.
- 판정: plugin 단독 설치자의 게이트는 **오늘 발화하지 않는다** — 등록 이름 `impeccable:impeccable`과
  호출 이름 `impeccable`이 다르고, 그 차이를 메우는 호출부는 0건이다. 이것이 Task 4 Step 5의
  정직성 출력이 말해야 하는 사실이며, 재배선은 M3 소유다.

### (d) `.impeccable/config.json`의 커밋 적격성 — Task 3 극성의 1차 근거

L2 test 패널 HIGH(`id=6204117d`)와 security-reviewer S6이 같은 지점을 지적했다: plan Task 3이
"공식 `/docs/config`를 근거로"라고 적었으나 Task 0이 그 출처를 검증하지 않았다. 설치된
impeccable v4.1.1 자체 레퍼런스로 검증한다.

- 명령: `grep -rn "config\.json" ~/.claude/plugins/cache/impeccable/impeccable/4.1.1`
- 출력(발췌):
  - `skills/impeccable/reference/hooks.md:11` — "toggles the hook **per project** by editing
    `.impeccable/config.json` (the unified Impeccable config…). **Per-developer overrides, including
    the install consent decision (`hook.consent`) the CLI records, live in the gitignored
    `.impeccable/config.local.json`.**"
  - `hooks.md:48` — "The default scope is **shared** `.impeccable/config.json`; add `--local` only
    when the user explicitly asks for a private exception."
  - `new-work.md:53` — "the gitignored `.impeccable/config.local.json` winning where one machine
    differs from **the team's committed value**"
  - `init.md:114-116` — `buildPath` 값을 `config.json`에 기록; "The config is the only place this lives."
- 관측된 키: `buildPath` · `hook.{enabled,quiet,auditLog,perEditRules,consent}` ·
  `detector.{extensions,ignores}` · `projectRoots` · `stalenessCheck`. **자격증명 없음.**
- 판정: `config.json`은 **팀 공유 커밋 대상**이고, 로컬·동의·비밀 성격의 값은
  `config.local.json`에 산다. 새 규칙 `.impeccable/*` + `!.impeccable/config.json`은
  `config.local.json`을 계속 무시하므로(예외는 정확히 한 파일만 되살린다) 비밀 커밋 위험을
  만들지 않는다. `.impeccable/live/config.json`도 `.impeccable/live/` 디렉토리가 제외되어
  계속 무시된다 — git은 제외된 디렉토리 내부 파일을 되살릴 수 없다.


## Task 9 — 라이브 완주 관측

관측일 2026-08-22. 단위 test 통과는 경로 작동이 아니므로 셋(+C3의 넷째)을 실물로 남긴다.

### (a) SessionStart hook 실물 실행 — 배너 침묵

- 명령: `printf '{"session_id":"m2-task9-live"}' | MCCP_CODEX_DISABLED=0 node plugins/mccp/scripts/hooks/session-start.js`
- 출력: `Missing dependencies` 줄이 **한 건도 나오지 않았다**(grep 0). impeccable을 포함한
  missing-deps 줄 수 = 0.
- 판정: **Acceptance (a) 충족.** 기준이 "없거나, 있어도 impeccable을 포함하지 않을 것"인데
  전자다 — 이 머신은 codex plugin도 설치돼 있어 missing 집합 자체가 비었다. M2 이전에는
  같은 실행이 `impeccable`을 24시간마다 보고했다(PATH에 바이너리가 없으므로).

### (b) `/mccp:setup` Phase 1 표 + Phase 3 진입 조건

- 명령: `node plugins/mccp/scripts/lib/dep-check.js` (Phase 1이 실행하는 그 명령) ·
  `node plugins/mccp/scripts/lib/dep-check.js --json`으로 Phase 3.1 조건 평가
- 출력:

  ```
  mccp dep-check
    codex plugin    : installed (v1.0.6)
    impeccable skill: available (project v3.5.0, impeccable)
    impeccable CLI  : missing  [telemetry only — no gate reads this]
    codex disabled  : no
  ```

  `available === true` → **Phase 3 전체 skip**, AskUserQuestion 미발화, 보고 한 줄:
  `impeccable skill: already resolved via project v3.5.0 as \`impeccable\` — nothing to install.`
- 판정: **Acceptance (b) 충족**, 단 두 가지를 명시한다.
  - **슬래시 명령으로 돌리지 않았다.** 명령 레지스트리는 plugin **cache 1.31.0**을 서빙하는데
    (`mccp:setup`의 설명이 아직 "impeccable CLI"다) 이 사이클의 setup.md 재작성은 worktree에만
    있다. `/mccp:setup --dry-run`을 부르면 **구버전 본문**이 돌아 관측이 이 milestone의 것이
    아니게 된다. 그래서 새 본문이 지시하는 명령을 그대로 실행하고 그 출력에 새 본문의 판정
    조건을 적용했다. 슬래시 경로의 완주는 머지 + `claude plugin update` 이후에 성립한다.
  - **문자열 차이 1건**: Acceptance는 `available (project 3.5.0, impeccable)`로 적었고 실제
    출력은 `available (project v3.5.0, impeccable)`(`v` 포함)다. plan 안에서 Task 1이 정한
    포맷이 `available (source vN, invocation)`이므로 구현은 Task 1을 따랐고, Acceptance 문구가
    그 `v`를 빠뜨린 plan 내부 불일치다.

### (c) `gitignore-provision --dry-run` + 극성 실측

- 명령: `node plugins/mccp/scripts/lib/gitignore-provision.js provision --json --dry-run` ·
  `git check-ignore --no-index -q <path>`
- 출력: `action: "append"` · `pollution: null` ·
  `addedLines`에 `!.impeccable/config.json` **있음** / `!.impeccable/design.json` **없음**.
  규칙 평가: `design.json` → IGNORED · `config.json` → not ignored.
- 판정: **Acceptance (c) 충족.** plan은 `action:"update"`를 예상했으나 이 저장소에는 managed
  블록이 아직 없어 `append`다 — 예측 세부의 차이이지 결함이 아니다.
  `--no-index`가 필요한 이유도 실측으로 확인했다: `design.json`은 tracked라(UI7)
  기본 `check-ignore`가 "not ignored"로 답한다. 규칙의 극성을 보려면 index를 빼야 한다.

### (d) 미설치 경로 (C3 — L2 invariant `id=877c8f0f` 이관분)

- 명령: `MCCP_IMPECCABLE_SKILL=missing node plugins/mccp/scripts/lib/dep-check.js [--json]`
- 출력: `impeccable skill: missing` · `available:false` · `reason:"env-forced-missing"` →
  Phase 3.1 skip 조건 **불충족** → 3.2 설치 분기 진입(AskUserQuestion 1회, plugin-first).
- 판정: 이 머신은 impeccable이 이미 설치돼 있어 실제 미설치를 재현할 수 없다는 제약을
  env 최우선 축으로 우회했다 — **아무것도 설치하지 않고** 미설치 분기를 관측했다.
  다만 (b)와 같은 이유로 이것도 판정 로직 실행이지 슬래시 명령 완주는 아니다.
