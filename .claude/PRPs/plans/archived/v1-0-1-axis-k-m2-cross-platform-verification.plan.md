# Plan: v1.0.1 axis K — M2 cross-platform reproduction + W11 rubric re-measurement

**Source PRD**: `.claude/prds/v1-0-1-axis-k-pr-phase-guard-pid-alive.prd.md`
**Selected Milestone**: M2 — Linux/macOS reproduction + W11 rubric 재측정 + Windows regression 0
**Complexity**: Medium (cross-platform CI surface 신설 + W11 rubric audit row 갱신; source-code mutation 0)
**Worktree**: `.worktrees/v1.0.1-axis-k-m2`
**Branch**: `v1.0.1-axis-k-m2` (based on `main` @ `65d4c02` — axis K1+K2 ship commit)

## Summary

M1(axis K1+K2)이 `pr-phase-guard.js`의 `lockActive()`에 PID liveness 분기 + state marker + receipt audit field를 wire했고 PR #24로 main에 머지됨. M2는 그 fix가 실제로 Linux/macOS의 self-trap을 해소하는지 audit-grade로 입증한다. 본 plan은 source code mutation 0 — GitHub Actions matrix (ubuntu-latest + macos-latest) 1개 워크플로 + 결정적 reproduction fixture 1개 Node script + W11 rubric `v1.0.0-fallback-ux.md` 4d-equivalent row 1개 갱신 + Windows regression 시나리오 explicit assert. CI artifact (테스트 로그 + state marker JSON 스냅샷)을 PR에 첨부해 cross-platform credibility의 mechanical record를 확보한다.

## Decision: GitHub Actions matrix (ubuntu + macos) — 권장. WSL은 dev iteration fallback

PRD §Open Questions가 `/mccp:plan`에게 위임한 결정. 3개 후보 비교:

| 축 | (A) GitHub Actions matrix (ubuntu+macos) | (B) WSL (Windows-side) | (C) Docker Desktop on Windows |
|---|---|---|---|
| Linux 재현 | ✓ `ubuntu-latest` (GHA runner) | ✓ WSL2 Ubuntu | ✓ `node:20-alpine` 컨테이너 |
| macOS 재현 | ✓ `macos-latest` (GHA runner) | ✗ 불가 | ✗ Docker Desktop on Windows는 Linux containers만 |
| Audit trail (공개 기록) | ✓ Actions log + uploaded artifacts | ✗ 사용자 셸 history만 | ✗ 동일 |
| 단일-user dev 반복 속도 | △ push → ~2–3 min wait | ✓ instant | ✓ instant |
| CI pipeline에 박기 | trivial (workflow 단일 파일) | n/a | n/a |
| 비용 | public repo free / private repo는 minute 차감 | free | Docker Desktop 라이선스 (개인 free) |
| F11 schema 무손상 검증 | ✓ artifact에 lock body shape snapshot 첨부 가능 | ✓ | ✓ |

**권장: (A) GitHub Actions matrix**. 사유 3가지:

1. **macOS 재현은 Windows 호스트에서 GHA만 도달 가능** — PRD §Success Metrics 표 row 1 ("Linux/macOS reproduction") 충족을 위해 macOS는 필수. WSL은 Linux-only, Docker on Windows도 Linux-only. 다른 path 없음.
2. **cross-platform credibility = 공개 audit record** — PRD §Users "primary"는 *Linux/macOS 환경 mccp 사용자* + W-VERDICT §6의 axis K 정의는 *cross-platform credibility*. 사용자 본인은 Windows이므로 자신의 환경에서 fixture 통과를 보여줘도 audit 가치 0. GHA 통과 로그가 PR에 링크되고 CHANGELOG에 인용되어야 비로소 *공개적으로* "Linux/macOS에서 작동"이 입증됨.
3. **CI workflow surface는 작음** — 단일 job × 2 OS × ~40줄 YAML. fixture는 결정적 Node script (synthetic orphan lock 작성 → guard hook in-process invoke → assert reclaim + marker). 외부 의존성 0.

**Out-of-band 보완**: (B) WSL은 audit 기록은 아니지만 *dev iteration fallback*으로 동일 fixture를 제공. plan body가 GHA workflow + WSL invocation 둘 다 명시 — 둘은 같은 fixture script를 invoke하므로 drift 0.

(Phase 5 Codex review가 disable 상태이지만, 사용자가 R1에서 (B)/(C) 권고 시 trade-off 표 재검토 — 본 plan은 (A) baseline. PRD §Risks 4번 row "Linux/macOS reproduction이 현 사용자 환경에서 검증 불가" mitigation 직결.)

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| CI workflow shape | `.github/workflows/*.yml` (있다면 grep 후 base) — 없으면 mccp convention 신설 | OS matrix + `actions/checkout@v4` + `actions/setup-node@v4 (node-version: 20)` + `node --test` 호출 |
| Test fixture for orphan lock | `plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` axis 11.2 "dead same-host" | `tmpdir`에 lock body `{pid:999999, host:os.hostname(), subphase:'codex-review'}` write → `lockActive()` invoke → assert reclaim + marker file |
| W11 rubric row format | `.claude/audit/v1.0.0-fallback-ux.md` line 60–63 (11a/11e/11f/11i/11l capture format) | `**11<x>** (captured runtime, <ISO>): T = <n>, NS = <n>, Severity <level> — <one-line rationale>` |
| Audit row delta evidence | `.claude/audit/v1.0.0-fallback-ux.md` line 840 (delta `-1.0 ✓`) | `pre-patch` row + `post-patch` row + explicit delta `-N ✓` 표시 + raw stdout 인용 |
| State marker shape assertion | `plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` axis 12.1 (Task 2 mirror) | JSON keys `reclaimed_at`/`former_run_id`/`former_pid`/`former_host`/`reason` 모두 존재 |
| F11 schema invariant probe | `plugins/mccp/scripts/lib/tests/pr-phase-lock-f11.test.js` | `lockBody`의 `ownership_token_hash` 키 존재 (writer-side) + raw `ownership_token` 키 부재 |
| Windows regression marker | `plugins/mccp/hooks/hooks.json` (PreToolUse matcher) | `Bash|Edit|Write|MultiEdit|NotebookEdit` 만 — `PowerShell` 미포함. M2는 matcher 변경 0 row 박음 |
| CHANGELOG 형식 | `CHANGELOG.md` v1.0.1 entry (M1이 작성한 row) | 같은 v1.0.1 헤딩 아래 `### Verified` 신설 — M1의 `### Fixed` / `### Added` 아래 새 sub-section |

## Files to Change

| File | Action | Why |
|---|---|---|
| `.github/workflows/axis-k-m2-cross-platform.yml` | CREATE | GitHub Actions matrix (ubuntu-latest + macos-latest), Node 20, fixture script 호출, artifacts upload |
| `plugins/mccp/scripts/hooks/tests/fixtures/axis-k-m2-reproduce.mjs` | CREATE | 결정적 reproduction fixture — synthetic orphan lock 작성 → in-process `lockActive()` invoke → assert reclaim + marker shape + stderr emit. Node 20+ ESM, 외부 dep 0 |
| `plugins/mccp/scripts/hooks/tests/fixtures/axis-k-m2-windows-regression.mjs` | CREATE | Windows-only path probe — `hooks.json` matcher에 `PowerShell` 부재 확인 + PowerShell escape 명령이 hook 적용 범위 밖임을 explicit assert (정적 검증 only — 실제 PowerShell 호출 안 함) |
| `.claude/audit/v1.0.1-axis-k-m2-rubric.md` | CREATE | W11 rubric 4d row 재측정 결과 + raw stdout (GHA artifact 인용) + pre/post-patch delta + Severity 재분류 |
| `.claude/prds/v1-0-1-axis-k-pr-phase-guard-pid-alive.prd.md` | UPDATE | Delivery Milestones 표 M2 row: Status pending → in-progress, Plan column `—` → 본 plan path |
| `CHANGELOG.md` | UPDATE | v1.0.1 entry에 `### Verified` sub-section 추가 — "Linux + macOS GitHub Actions matrix passing for axis K orphan-lock reclaim, W11 4d row recovered from Type E/NS=5 to Type ≤C/NS ≤2" |
| `.claude/state/STATE.md` | (no manual edit) | hook이 갱신, plan에는 변경 없음 |

신규 fixture script 인터페이스 (양쪽 OS 공통, single source of truth):

```
node plugins/mccp/scripts/hooks/tests/fixtures/axis-k-m2-reproduce.mjs

  → exit 0: reclaim 성공 + marker 파일 작성됨 + stderr "stale lock reclaimed" 1줄 emit
  → exit 1: reclaim 실패 또는 marker 부재 또는 stderr emit 부재 → CI red
  → stdout: structured JSON (latest-only) — { os, hostname, fixture: "axis-k-m2", former_pid, marker_path, reclaimed: true|false }
```

위 인터페이스가 dev + GHA 양쪽에서 동일 → fixture가 우리의 *해석 가능한 audit unit*.

## Tasks

### Task 1: Reproduction fixture 작성 (`axis-k-m2-reproduce.mjs`)

- **Action**: `plugins/mccp/scripts/hooks/tests/fixtures/axis-k-m2-reproduce.mjs` 신설. 단계:
  1. `os.tmpdir()` 아래 임시 repo root 생성 (`mkdtempSync`)
  2. 임시 root 안에 `.claude/state/pr-phase.lock` body write — `{pid:999999, host:os.hostname(), subphase:'codex-review', mtime: new Date().toISOString(), ownership_token_hash: '0'.repeat(64)}` (dead PID + same-host)
  3. `pr-phase-guard.js`의 `lockActive(repoRoot)` 직접 require + 호출
  4. assert: 반환값이 `null` (reclaim path), 임시 lock 파일이 unlink됨, `<root>/.claude/state/pr-phase-lock-stale-reclaimed.json` marker가 생성됨
  5. marker JSON shape 검증 (`reclaimed_at` / `former_run_id` / `former_pid===999999` / `former_host===os.hostname()` / `reason==='same-host-dead-pid'`)
  6. cleanup (rm -rf 임시 root)
  7. stdout 1줄 JSON (위 인터페이스), exit code matches
- **Mirror**: `pr-phase-guard.test.js` axis 11.2 + axis 12.1 — 동일 fixture, 단 ESM standalone script로 환경 무관 invoke
- **Validate**: 로컬 (Windows) 호출 — `node plugins/mccp/scripts/hooks/tests/fixtures/axis-k-m2-reproduce.mjs` → exit 0 + stdout JSON `reclaimed: true`. (Windows에서도 reclaim 로직 자체는 same-host+dead-PID 시 작동 — Windows의 *self-trap*은 hook의 PowerShell-matcher 부재 때문이지, reclaim path 자체는 cross-platform.)

### Task 2: Windows regression fixture (`axis-k-m2-windows-regression.mjs`)

- **Action**: `plugins/mccp/scripts/hooks/tests/fixtures/axis-k-m2-windows-regression.mjs` 신설.
  1. `plugins/mccp/hooks/hooks.json`을 read + parse
  2. PreToolUse entries 순회 → 모든 matcher에서 `PowerShell` substring 부재 assert
  3. 적어도 1개의 PreToolUse entry가 `Bash` matcher를 포함하는지 assert (sanity)
  4. stdout JSON `{ os, hooks_json_path, powershell_matched: false, bash_matched: true }`
  5. assertion fail이면 exit 1
- **Mirror**: PRD §Scope의 "Windows PowerShell 우회 path" + plan M1 §Tasks Task 5 axis 11.5 동일 로직, 단 standalone script로
- **Validate**: 로컬 호출 → exit 0 + `powershell_matched: false`. M1 코드는 hooks.json을 건드리지 않았으므로 회귀 0이 mechanical.

### Task 3: GitHub Actions workflow (`axis-k-m2-cross-platform.yml`)

- **Action**: `.github/workflows/axis-k-m2-cross-platform.yml` 신설. 골자:
  ```yaml
  name: axis-k-m2 cross-platform verification
  on:
    pull_request:
      branches: [main]
      paths:
        - 'plugins/mccp/scripts/hooks/pr-phase-guard.js'
        - 'plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js'
        - 'plugins/mccp/scripts/hooks/tests/fixtures/axis-k-m2-*.mjs'
        - '.github/workflows/axis-k-m2-cross-platform.yml'
    workflow_dispatch:
  jobs:
    verify:
      strategy:
        fail-fast: false
        matrix:
          os: [ubuntu-latest, macos-latest]
      runs-on: ${{ matrix.os }}
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: '20' }
        - name: Run reproduction fixture
          run: node plugins/mccp/scripts/hooks/tests/fixtures/axis-k-m2-reproduce.mjs
          id: reproduce
        - name: Run pr-phase-guard unit tests (axis 11/12)
          run: node --test plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js
        - name: Capture fixture stdout
          if: always()
          run: node plugins/mccp/scripts/hooks/tests/fixtures/axis-k-m2-reproduce.mjs > axis-k-m2-${{ matrix.os }}.json || true
        - name: Upload artifact
          if: always()
          uses: actions/upload-artifact@v4
          with:
            name: axis-k-m2-${{ matrix.os }}
            path: axis-k-m2-${{ matrix.os }}.json
  ```
  - `pull_request` paths 필터로 무관 PR은 트리거 안 됨 — minute 비용 0
  - `workflow_dispatch` 으로 수동 트리거 가능 (M2 검증 단발 실행용)
  - artifact upload로 GHA log 외에도 reviewable JSON 보존
- **Mirror**: 기존 `.github/workflows/*.yml` 가 있다면 그 convention. 없으면 GHA 표준.
- **Validate**: PR 생성 후 양쪽 OS 모두 green. red 발생 시 어느 단계에서 fail인지 artifact + log로 진단.

### Task 4: W11 rubric 4d row 재측정 (`.claude/audit/v1.0.1-axis-k-m2-rubric.md`)

- **Action**: 신규 audit 파일 `.claude/audit/v1.0.1-axis-k-m2-rubric.md` 작성. 구조:
  ```markdown
  # W11 rubric — axis K M2 post-patch re-measurement

  **Source rubric**: `.claude/audit/v1.0.0-fallback-ux.md` (plan v0.5 §UX Decision-Type Rubric)
  **Subject row**: W4 4d — `/mccp:pr` re-invocation with orphan `pr-phase.lock` (dead PID, subphase=codex-review)
  **Pre-patch state**: Type E (5) + NS=5 — single-row STOP_RELEASE trigger (`.claude/audit/v1.0.0-receipts.md:23` original entry; `.claude/audit/v1.0.0-release-verification-verdict.md:52` BLOCKING tally)
  **Post-patch evidence**: GitHub Actions run <link>, artifacts `axis-k-m2-ubuntu-latest.json` + `axis-k-m2-macos-latest.json`

  ## Re-measurement (per OS)

  ### ubuntu-latest
  **Captured (GHA run <ISO>)**:
  - T (UX Decision-Type): <n> — rationale: user는 dead PID 감지를 인지할 의무 없음, hook이 자동 reclaim하고 stderr 1줄로 알림 + 후속 receipt에 audit field stamp. 결정 트리거 없음 → Type B (자동 recovery + 사후 audit) 또는 그 이하.
  - NS (Next-step 명료성): <n> — rationale: 다음 step은 `/mccp:pr` 그대로 재실행. hook이 lock-absent로 해석 → 후속 진행. 추가 명령 0 → NS 1.
  - Severity: <level> (PASS 또는 LOW)
  - Raw stdout: `cat axis-k-m2-ubuntu-latest.json` 인용

  ### macos-latest
  (동일 형식)

  ## Delta
  | Axis | Pre-patch | ubuntu | macos | Delta |
  |---|---|---|---|---|
  | T | 5.0 (Type E) | <n> | <n> | -<n> ✓ |
  | NS | 5.0 | <n> | <n> | -<n> ✓ |
  | Severity | BLOCKING | <level> | <level> | recovered |

  ## Verdict
  PRD §Success Metrics row 2 (W11 4d row Type ≤C/NS ≤2) — <PASS/FAIL>.
  W-VERDICT §2 BLOCKING tally: 1 → 0 (axis K M2 closes the single-row STOP_RELEASE source).

  ## Linked artifacts
  - GHA run: <URL>
  - artifact ubuntu: <URL>
  - artifact macos: <URL>
  ```
- **Mirror**: `.claude/audit/v1.0.0-fallback-ux.md`의 11a/11e/11f/11i/11l capture format (line 60–63) — `**11<x>** (captured runtime, <ISO>): T = <n>, NS = <n>, Severity <level> — <one-line>`
- **Validate**: 파일 존재 + `grep -E "Type [0-5]|NS = [0-5]"` 매치 ≥2 + GHA artifact URL이 실재 (실행 후).

### Task 5: PRD M2 row 갱신 + Delivery Milestones 정합화

- **Action**: `.claude/prds/v1-0-1-axis-k-pr-phase-guard-pid-alive.prd.md`의 Delivery Milestones 표 row 2 (M2) Status `pending` → `in-progress`, Plan column `—` → `.claude/plans/v1-0-1-axis-k-m2-cross-platform-verification.plan.md`. (Plan template 명시: PRD artifact mode에서 update only the selected row.)
- **Mirror**: `/mccp:plan` PRD artifact output §"Update only the selected row from `pending` to `in-progress`"
- **Validate**: `grep -n "v1-0-1-axis-k-m2-cross-platform-verification.plan.md" .claude/prds/v1-0-1-axis-k-pr-phase-guard-pid-alive.prd.md` → 매치 1줄.

### Task 6: CHANGELOG.md `### Verified` sub-section 추가

- **Action**: 기존 v1.0.1 entry 아래 `### Verified` 신설. 1줄:
  > "Cross-platform reproduction passed on `ubuntu-latest` + `macos-latest` via GitHub Actions matrix. W11 rubric 4d row recovered from `Type E (5) + NS=5` to `Type ≤C (3) + NS ≤2`; single-row STOP_RELEASE source closed (W-VERDICT §2 BLOCKING tally 1 → 0). Windows PowerShell escape path regression-free (hooks.json matcher unchanged)."
- **Mirror**: v1.0.0 entry shape (`### Fixed` / `### Added` heading 패턴)
- **Validate**: `grep -A 3 "### Verified" CHANGELOG.md` 매치.

### Task 7: PR 생성 + GHA matrix run 트리거 + artifact 인용

- **Action**: 모든 위 파일이 staged + commit + push 후 `gh pr create`. PR body가:
  - axis K M2 cross-platform verification 목적 명시
  - GHA matrix run URL 인용
  - `axis-k-m2-ubuntu-latest.json` + `axis-k-m2-macos-latest.json` artifact 인용
  - W-VERDICT §2 BLOCKING tally close 선언
- **Mirror**: PR #24 (M1)이 사용한 PR body convention
- **Validate**: PR 생성 + 양쪽 GHA job green + reviewer가 4d row recovery 검증.

## Validation

```bash
# Local (Windows) — fixture sanity
node plugins/mccp/scripts/hooks/tests/fixtures/axis-k-m2-reproduce.mjs
# Expect: exit 0, stdout JSON with reclaimed: true (Windows에서도 reclaim 로직 자체는 작동)

node plugins/mccp/scripts/hooks/tests/fixtures/axis-k-m2-windows-regression.mjs
# Expect: exit 0, stdout JSON with powershell_matched: false, bash_matched: true

# Local — unit test 회귀 (M1이 도입한 axis 11/12)
node --test plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js
# Expect: 75/75 PASS (M1 baseline)

# Local — F11 schema 무손상
node --test plugins/mccp/scripts/lib/tests/pr-phase-lock-f11.test.js
# Expect: 42/42 PASS, lockBody schema 변경 없음

# CI (after push to v1.0.1-axis-k-m2)
gh workflow run axis-k-m2-cross-platform.yml --ref v1.0.1-axis-k-m2
gh run watch  # 또는 PR 생성 시 자동 트리거 대기
# Expect: ubuntu-latest job green + macos-latest job green

# Artifact 다운로드 후 rubric 작성 (Task 4)
gh run download <run-id> --name axis-k-m2-ubuntu-latest
gh run download <run-id> --name axis-k-m2-macos-latest

# W11 rubric audit row 완성도 — Task 4
grep -E "Type [0-5]|NS = [0-5]" .claude/audit/v1.0.1-axis-k-m2-rubric.md | wc -l
# Expect: ≥4 (각 OS × T+NS = 4 row 최소)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| GitHub Actions runner의 macOS image가 mccp Node 20 dependency 불일치 발생 | LOW | `actions/setup-node@v4 with node-version: '20'`이 image와 무관하게 Node 20 install. 양쪽 OS 동일 |
| fixture 가 host-aware tri-state policy의 same-host 분기 못 통과 (`os.hostname()` 결정성 문제) | LOW | fixture가 lock body의 host field를 *호출 시점의* `os.hostname()`으로 write — runner hostname 변경에 무관. F11 R2-F2 same-host 분기 정확 도달 |
| GHA artifact가 PR-public이라 secret 누출 위험 | LOW | fixture stdout은 fixed schema (os/hostname/fixture/former_pid/marker_path/reclaimed) — secret 카테고리 0. hostname은 GHA runner의 generic name |
| W11 rubric의 4d row 재측정이 audit author 주관 평가 → 객관성 문제 | MED | `.claude/audit/v1.0.0-fallback-ux.md` line 32 STOP_RELEASE 임계 ("단일 row가 Type E (5) OR Next-step 5") 와 동일 임계를 mechanical 적용. rubric body에 평가 rationale을 다른 row와 동일 format으로 명시 → audit cross-review 가능 |
| Windows 사용자(=현 사용자)가 GHA 실행 결과만 보고 reclaim 동작 자체를 검증 못 함 | LOW | Task 1의 local Windows fixture 실행이 동일 reclaim 코드 path를 도달 (cross-platform 코드, Windows는 self-trap만 별도 — fixture는 self-trap 시나리오가 아닌 *fix 작동 자체*를 검증). + Task 2의 hooks.json matcher 정적 검증으로 Windows escape path 보존 explicit assert |
| F11 sealed-channel schema 변경 없음 invariant 위반 | LOW | M2는 source code 변경 0 row 박는 plan. lockBody / ownership_token_hash 코드 path 미접근. Task 1 fixture가 schema-aware로 lockBody write (canonical schema 그대로) → schema drift 0이 mechanical |
| GHA matrix가 paths 필터로 트리거 안 됨 — PR에서 검증 회피 | LOW | `workflow_dispatch` 백업 + Task 3 paths 목록에 `.github/workflows/axis-k-m2-cross-platform.yml` 자체 포함 → workflow 변경만으로도 트리거 |
| PR 검증을 위해 GHA가 매번 돌면 minute 누적 (개인 free tier 한계) | LOW | paths 필터로 무관 PR은 트리거 안 됨. axis K 코드 변경 PR만 트리거 — 빈도 매우 낮음 |

## Acceptance

- [ ] Tasks 1–7 모두 complete
- [ ] `axis-k-m2-reproduce.mjs` 로컬 (Windows) 호출 → exit 0 + `reclaimed: true`
- [ ] `axis-k-m2-windows-regression.mjs` 로컬 호출 → exit 0 + `powershell_matched: false`
- [ ] GHA matrix run: ubuntu-latest job green + macos-latest job green (PRD Success Metrics row 1)
- [ ] W11 rubric 4d row: ubuntu + macos 양쪽에서 Type ≤C (≤3) + NS ≤2 (PRD Success Metrics row 2)
- [ ] `node --test plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` → 75/75 PASS, M1 regress 0
- [ ] hooks.json PreToolUse matcher 미변경 (PRD Success Metrics row 3, Windows regression 0)
- [ ] `lockBody` canonical schema diff 0 + `ownership_token_hash` 키 보존 (PRD Success Metrics row 4, F11 무손상)
- [ ] `.claude/audit/v1.0.1-axis-k-m2-rubric.md` 작성 + GHA artifact URL 인용
- [ ] PRD M2 row Status `in-progress` → `complete` (PR merge 시점에 갱신)
- [ ] CHANGELOG.md v1.0.1 `### Verified` sub-section 추가
- [ ] Phase 5 Codex review — APPROVE (또는 disabled-skip per permanent policy)

## Codex Adversarial Review

> Codex skipped per `MCCP_CODEX_DISABLED=1` (env-level policy, first-class skip via wrapper short-circuit; classification=`disabled`, `durationMs=0`). Permanent bypass per [[feedback-codex-permanent-bypass]] (codex token cap 소진, 2026-06-08 user 결정). Receipt at Phase 5.6 will auto-stamp `meta.codex_disabled=true` + `meta.codex_skip_reason='codex_disabled'`.

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed wrapper, classification=disabled, no spawn)
- 라운드 수: 0 (skipped)
- 합치 결론: n/a — Codex permanently disabled per user policy. Phase 5.0 impeccable detect `design_signal=false` 추가 확인됨 (M2는 verification + CI work, no UI surface) → impeccable Skill도 silent skip.
- YAGNI Triage: n/a (no findings to triage)
- Deferred to backlog: 0
- Open Questions: 
  - PRD §Open Questions의 5개 row는 본 plan §Decision (env 채택 — GHA matrix) + §Tasks 1–4 (fixture + rubric + workflow) + §Risks (race window / artifact secret 검토)에서 plan author 판단으로 흡수. Codex review가 disable 상태이므로 사용자 R1 turn에서 explicit 재검토 가능.
- Codex session 참조: n/a
