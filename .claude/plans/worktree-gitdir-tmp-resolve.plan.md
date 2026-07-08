# Plan: worktree gitdir tmp resolve (재발 부채 종결)

**Source**: free-form (`/mccp:plan` conversational mode)
**Branch**: `fix/worktree-gitdir-tmp-resolve` (off `main`, 메인 워킹트리에서 작업 — 버그 자체가 worktree 게이트를 깨므로)
**Complexity**: Medium

## Summary

worktree에서 `.git`은 `gitdir:` 포인터 **파일**이라, mccp command 본문이 하드코딩한 리터럴 `.git/mccp/tmp`에 `mkdir -p` 하면 `ENOTDIR`(`Not a directory`)로 깨진다. `pr.md`·`dashboard-audit.md`·`pr-body.js`는 이미 `git rev-parse --git-dir`로 고쳐졌지만 `work.md`(13)·`resume.md`(1)·`plan.md`(2)·`prp-implement.md`(3) 4개 command에 잔여 리터럴이 남아 CLAUDE.md §3.8이 권장하는 worktree에서 `/mccp:work`·`/mccp:resume`·`/mccp:plan`·`/mccp:prp-implement`가 깨진다. CHANGELOG.md:535 기준 "누적 8+ cycle 반복 결함"을 이번에 mechanical 재발 방지 테스트와 함께 종결한다.

## Fix Invariant (Codex F1 absorption — MEDIUM ACCEPT_NOW)

**모든 fresh Bash 블록은 `$MCCP_TMP`를 (a) 블록 시작부에서 재도출하고 (b) 그 tmp로 write/redirect 하기 전에 같은 블록에서 `mkdir -p "$MCCP_TMP"` 한다.** 다른 phase의 mkdir에 의존 금지 — shell 리다이렉트(`2> "$MCCP_TMP/x.stderr"`)는 파일은 만들어도 **부모 디렉토리는 못 만들어** clean worktree에서 `No such file or directory`로 실패하고, gate skip/dedupe 경로가 앞선 phase의 mkdir을 우회하면 dir이 없는 채로 그 블록에 진입할 수 있다. 특히 `prp-implement.md` Phase 7 auto-chain 블록(line 1451)과 `work.md` Step 3.5 merge-write 블록(line 182)은 mkdir을 소유한 블록과 **분리된** fresh shell이므로 자체 mkdir을 반드시 추가한다. (Codex adversarial review F1 — 리터럴만 제거하는 순진한 치환이 이 경로를 놓쳤다.)

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| gitdir resolve (shell, env var) | `plugins/mccp/commands/pr.md:404` | `MCCP_TMP="$(git rev-parse --git-dir)/mccp/tmp"` → 이후 `"$MCCP_TMP"` 참조 |
| gitdir resolve (shell, 1-line) | `plugins/mccp/commands/dashboard-audit.md:72` | `GITDIR=$(git rev-parse --git-dir); mkdir -p "$GITDIR/mccp/tmp"` |
| gitdir resolve (JS 헬퍼) | `plugins/mccp/scripts/receipt/pr-body.js:23-41` | `gitDir(repoRoot)` — `.git`가 file이면 `gitdir:` 포인터 read, dir이면 그대로. worktree 테스트 완비 |
| per-block 재도출 계약 | `plugins/mccp/commands/prp-implement.md:445` | fresh Bash 블록마다 `GITDIR=$(git rev-parse --git-dir)` 재계산 (env var 비지속) |
| version footer sync | `plugins/mccp/scripts/lib/renderer/html.js:1417`, `markdown.js:154` | page-foot `v<X.Y.Z>` + derived 줄 동기 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/commands/work.md` | UPDATE | 13곳 리터럴 → per-block `MCCP_TMP` 재도출. node inliner(160·178)는 JS 문자열 리터럴이라 `$MCCP_TMP`를 argv로 주입 |
| `plugins/mccp/commands/resume.md` | UPDATE | line 26 mkdir → gitdir-resolved |
| `plugins/mccp/commands/plan.md` | UPDATE | line 601 mkdir + 615 codex-invoke.stderr redirect → gitdir-resolved |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | line 196 mkdir + 208 codex-invoke.stderr + 1451 auto-chain.stderr → 445 기존 GITDIR과 일관 정리 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.20.7 → 1.20.8` (§3.7 patch — command 본문 변경) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer `v1.20.7 → v1.20.8` 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 `v1.20.7 → v1.20.8` 동기 |
| `CHANGELOG.md` | UPDATE | `## [1.20.8]` row 추가 |
| `plugins/mccp/scripts/lib/tests/command-tmp-worktree-safe.test.js` | CREATE | 재발 방지 — commands/*.md 실행 Bash에 리터럴 `.git/mccp/tmp` 부재 mechanical assert |

> **참고**: `plugins/mccp/scripts/hooks/pr-phase-guard.js` (line 77·134)와 `plugins/mccp/scripts/receipt/tests/pr-body.test.js`, `plugins/mccp/commands/pr.md:401` 주석의 `.git/mccp/tmp`는 **의도적**이므로 변경하지 않는다(리스크 R1·R2 참조). 재발 방지 테스트는 이들을 화이트리스트로 제외한다.

## Tasks

### Task 1: work.md gitdir 이전 (13곳)
- **Action**: 3개 fresh Bash 블록(Step 0 line 42, Step 3 line 146, Step 3.5 line 177) 각각 시작부에 `MCCP_TMP="$(git rev-parse --git-dir)/mccp/tmp"` 추가하고 블록 내 `.git/mccp/tmp` 전부 `"$MCCP_TMP"`로 치환. line 62·147·155·158·182 redirect/rm 경로 포함. **Step 3.5 블록(177+)은 line 182에서 `> "$MCCP_TMP/dispatch-merge.json"` write를 하므로 이 블록도 자체 `mkdir -p "$MCCP_TMP"` 보유 필수**(Fix Invariant / F1). **node inliner(160·178)**: 단일따옴표 JS라 shell 미보간 → `$MCCP_TMP`를 `node -e '... process.argv[1] ...' "$MCCP_TMP"` argv로 주입해 JS가 `argv[1]+"/dispatch-prepare.json"` 조립. 산문(139·197)은 `<gitdir>/mccp/tmp`로 정정.
- **Mirror**: `dashboard-audit.md:72` (per-block 재도출), `prp-implement.md:445`
- **Validate**: `grep -nE '\.git/mccp/tmp' plugins/mccp/commands/work.md` → 실행 Bash 0건(산문/`<gitdir>` 표기만); tmp write/redirect 블록마다 same-block mkdir 존재

### Task 2: resume.md gitdir 이전 (1곳)
- **Action**: line 26 `mkdir -p .git/mccp/tmp` → `MCCP_TMP="$(git rev-parse --git-dir)/mccp/tmp"; mkdir -p "$MCCP_TMP"` (해당 블록 내 후속 참조 있으면 함께 치환)
- **Mirror**: `pr.md:404`
- **Validate**: `grep -nE '\.git/mccp/tmp' plugins/mccp/commands/resume.md` → 0건

### Task 3: plan.md gitdir 이전 (2곳)
- **Action**: Phase 5.2 블록 line 601 mkdir + 615 `2> .git/mccp/tmp/codex-invoke.stderr` → 블록 시작에 `MCCP_TMP=...` 추가, `mkdir -p "$MCCP_TMP"` + `2> "$MCCP_TMP/codex-invoke.stderr"`
- **Mirror**: `pr.md:404`
- **Validate**: `grep -nE '\.git/mccp/tmp' plugins/mccp/commands/plan.md` → 0건. 이 파일 수정이 곧 자기 자신의 게이트를 worktree-safe하게 만듦(dogfood)

### Task 4: prp-implement.md gitdir 일관 정리 (3곳) + Phase 7 self-sufficient mkdir (F1)
- **Action**: line 196 mkdir + 208 codex-invoke.stderr는 Phase 2.5 블록 시작에 `MCCP_TMP=...` (또는 기존 445 `GITDIR` 패턴 재사용) 추가 후 치환. **line 1451 auto-chain 블록(Phase 7 — line 1447-1453)은 Phase 2.5와 분리된 fresh shell이므로 자체 `MCCP_TMP="$(git rev-parse --git-dir)/mccp/tmp"; mkdir -p "$MCCP_TMP"`를 리다이렉트 직전에 추가**(Fix Invariant — 앞 phase mkdir 의존 금지). 445의 기존 `GITDIR`과 네이밍 일관.
- **Mirror**: 같은 파일 `prp-implement.md:445`, `dashboard-audit.md:72`
- **Validate**: `grep -nE '\.git/mccp/tmp' plugins/mccp/commands/prp-implement.md` → 0건 + Phase 7 블록이 자체 mkdir 보유(Task 6 smoke가 실증)

### Task 5: 버전 bump + footer + CHANGELOG
- **Action**: `plugin.json` `1.20.7 → 1.20.8`; `html.js:1417`·`markdown.js:154` footer `v1.20.7 → v1.20.8`; `CHANGELOG.md`에 `## [1.20.8] — <date>` row(재발 부채 종결 요약).
- **Mirror**: `CHANGELOG.md` 기존 row 포맷
- **Validate**: `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"` → `1.20.8`; `grep -c v1.20.8 plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js`

### Task 6: 재발 방지 테스트 (CREATE) — usability 실증 (F1 강화)
- **Action**: `command-tmp-worktree-safe.test.js` — 2축.
  - **축 A (static)**: `commands/*.md`를 읽어 실행 Bash 라인(`mkdir`/redirect target)에 리터럴 `.git/mccp/tmp`가 없음을 assert. 화이트리스트: `pr.md`의 설명 주석(401), 산문 `<gitdir>/mccp/tmp`. 정규식은 코드펜스 안 `mkdir -p .git/mccp/tmp` 및 `> .git/mccp/tmp/` redirect만 잡음.
  - **축 B (usability — Codex F1)**: literal 부재만으론 부족(리터럴 제거해도 dir 미생성 redirect는 여전히 깨짐). 실제 임시 worktree를 `git worktree add`로 만들고, gitdir-resolved `mkdir -p "$(git rev-parse --git-dir)/mccp/tmp"` 후 `2> "$MCCP_TMP/x.stderr"` redirect가 성공하는지 실행 대조. `.git`가 file인지도 assert(worktree 확증). teardown으로 worktree 제거. (pr-body.test.js `mkTmpWorktree` 헬퍼 패턴 mirror.)
- **Mirror**: `plugins/mccp/scripts/lib/tests/*.test.js` (node native test), `plugins/mccp/scripts/receipt/tests/pr-body.test.js:191` (worktree 생성/teardown)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/command-tmp-worktree-safe.test.js`

## Validation

```bash
# 1. 잔여 리터럴 0건 (실행 Bash)
grep -rnE 'mkdir -p \.git/mccp/tmp|> \.git/mccp/tmp/' plugins/mccp/commands/work.md plugins/mccp/commands/resume.md plugins/mccp/commands/plan.md plugins/mccp/commands/prp-implement.md

# 2. 전체 테스트 회귀 없음
node --test plugins/mccp/scripts

# 3. worktree 실증 — mkdir + redirect usability (F1 대조)
git worktree add .worktrees/tmp-verify HEAD
cd .worktrees/tmp-verify && test -f .git && echo ".git is FILE (worktree confirmed)"
MCCP_TMP="$(git rev-parse --git-dir)/mccp/tmp"; mkdir -p "$MCCP_TMP"
echo "err" 2> "$MCCP_TMP/smoke.stderr" && echo "gitdir-resolved mkdir+redirect OK in worktree"
cd - && git worktree remove .worktrees/tmp-verify

# 4. 버전 동기
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # 1.20.8
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **R1 (HEADLINE) pr-phase-guard가 gitdir 형태를 lock 중 차단** — guard의 `INDIRECT_INVOKE_PATTERNS` `/\$\(/`가 `$(git rev-parse --git-dir)`를 무조건 DENY, mkdir 예외는 리터럴 `.git/mccp/tmp`만([:77](../../plugins/mccp/scripts/hooks/pr-phase-guard.js#L77)·[:112](../../plugins/mccp/scripts/hooks/pr-phase-guard.js#L112)·[:134](../../plugins/mccp/scripts/hooks/pr-phase-guard.js#L134)) | LOW | guard는 **pr-phase codex-review lock 활성 중에만** 발화([:477](../../plugins/mccp/scripts/hooks/pr-phase-guard.js#L477)). 대상 4개 command는 그 subphase에서 실행되지 않음(normal single-session). 유일 노출 = **동일 워킹트리 동시세션**(§3.8은 세션별 별도 worktree 권장 → out-of-support-model) + guard는 loud BLOCK(silent 아님). **권장: guard 미변경**(보안 패턴 `$(` DENY 완화는 review-only 창의 command-substitution 방어를 약화 → scope·리스크 확대). Codex가 이 판단을 압박 검증 |
| R2 pr-body.test.js가 `.git/mccp/tmp` 문자열 기대 | 없음 | `pr-body.js`는 이미 `gitDir()` JS 헬퍼로 worktree-safe + 테스트 완비([pr-body.test.js:209-236](../../plugins/mccp/scripts/receipt/tests/pr-body.test.js#L209)). 변경 불필요 |
| R3 work.md 3블록 shell-state 비지속 계약 위반 | MEDIUM | 각 fresh Bash 블록이 `MCCP_TMP`를 독립 재도출(env var 전달 금지). dashboard-audit.md 패턴 mirror. node inliner는 argv 주입 |
| R4 재발 방지 테스트 false-positive(의도적 리터럴 오탐) | LOW | 화이트리스트 명시(pr.md 주석·산문). 실행 Bash 컨텍스트(`mkdir`/redirect)만 매칭 |
| R5 `git rev-parse --git-dir` 상대경로 반환(subdir cwd) | LOW | command는 repo root에서 실행. 우려 시 `--absolute-git-dir` 검토(단 기존 참조 impl은 `--git-dir` — 일관 위해 유지) |
| **R6 (Codex F1 흡수) redirect-only 블록이 dir 미생성으로 실패** — 리터럴 제거해도 `2> "$MCCP_TMP/x"`는 부모 dir 없으면 clean worktree에서 깨짐; static 스캔은 통과(false confidence) | MEDIUM→해소 | Fix Invariant로 every tmp-write 블록 same-block mkdir 강제. prp-implement Phase 7 + work Step 3.5 명시 흡수. Task 6 축 B가 실제 worktree에서 mkdir+redirect usability 실증(literal 부재 아님) |

## Acceptance

- [ ] work.md·resume.md·plan.md·prp-implement.md 실행 Bash에 리터럴 `.git/mccp/tmp` 0건
- [ ] `node --test plugins/mccp/scripts` 전체 PASS (회귀 없음)
- [ ] worktree 실증: gitdir-resolved mkdir 성공, 메인 트리 무회귀
- [ ] plugin.json 1.20.8 + html.js/markdown.js footer 동기 + CHANGELOG row
- [ ] 재발 방지 테스트 PASS + pr-phase-guard 미변경 결정에 Codex APPROVE
- [ ] 패턴 재발명 없이 pr.md/dashboard-audit.md 기존 패턴 mirror

## Design Critique

- Detector: `SKILL_AVAIL=1`, `design_signal=true` (mechanical) — plan이 `renderer/html.js`·`markdown.js`를 **footer 버전 문자열 동기화**(`v1.20.7 → v1.20.8`)로만 언급해 매칭됨. 실제 rendered UI/색/타이포/레이아웃 변경 **0** (버전 리터럴 1곳).
- Verdict: **CONVERGED** (round 1). 4 Output Constraints 무위반 — 정보 위계 변화 없음, 강조색 미도입, raw markdown marker 미surface, list-of-N 미확장. plan 스테이지엔 rendered surface 부재라 impeccable 명령 invoke 없이(§3.9 recommend-only) 자명 수렴.
- Routing mode: `auto` (implement 스테이지 recommend-only guide — 이 변경은 control-plane이라 실제 라우팅 대상 아님).

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` design-scope preamble)
- 라운드 수: 1 (R1 흡수로 종료 — MEDIUM이라 cap 강제 R2 없음)
- 합치 결론: Codex `needs-attention` — 1 MEDIUM finding (redirect-without-mkdir). R1에서 Fix Invariant로 흡수 → **converged**. pr-phase-guard 미변경·argv 주입·재발 테스트 3개 challenge엔 이의 없음(결정 유지).
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 auto-chain/merge redirect가 same-block mkdir 없이 clean worktree에서 실패; static 스캔이 못 잡음 | MEDIUM | ACCEPT_NOW | 이 fix의 목적을 한 경로에서 무력화하는 실제 correctness 결함. Fix Invariant(모든 tmp-write 블록 same-block mkdir) + Task 6 축 B(worktree usability 실증)로 흡수 |
- Deferred to backlog: 0
- Open Questions: 없음 (F1 MEDIUM R1 해소, HIGH/CRITICAL 미검출)
- Codex session 참조: threadId `019f3daa-fc93-7373-924f-8366c2e1d580`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
