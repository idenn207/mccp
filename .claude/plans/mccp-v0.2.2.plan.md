# Plan: mccp v0.2.2 — Codex 호출 fix + prp 자동 chain + receipt soft-mode

**Source**: 사용자 메시지(2026-06-04) + 메모리 [[mccp-v0.2-continuation]] (Q11 + receipt soft 병합 권고)
**Selected Scope**: Q11(a) Codex 호출 fix · Q11(b) prp-implement → prp-commit → prp-pr 자동 chain · Q11(c) 세션 종료 임박 mid-report · 메모리 v0.2.2(b) Receipt soft-mode patch · 배포(version bump + main push)
**Complexity**: Medium-Large
**Branch decision**: 본 cycle은 `main` 직접 작업 + 직접 push (사용자 선택: version bump → main push)

---

## Summary

mccp v0.2.1 이후 정황:
1. `Skill(codex:adversarial-review, ...)` 호출이 항상 fallback으로 빠짐 → 진단 결과 두 가지 원인이 겹친다. **(a) codex plugin의 skill 인덱스에 `adversarial-review`라는 이름의 Skill은 없음**(`codex-cli-runtime` / `codex-result-handling` / `gpt-5-4-prompting` 3개만 존재). **(b) `/codex:adversarial-review` slash command는 frontmatter `disable-model-invocation: true`로 모델 자동 호출 차단**. 두 경로 모두 막혀서 mccp 모든 게이트가 "auto-fallback" 상태로 동작.
2. 사용자 패턴이 "PR에서만 검토, 중간 보고 X"이므로, prp-implement 종료 후 prp-commit · prp-pr까지 자동 chain되어야 함. 단, auto-CRITICAL findings와 cost hard ceiling만 chain abort 트리거.
3. v0.2.2 (b) Receipt soft-mode (Codex+Claude self-debate 합의)를 같은 cycle에 묶음. `MCCP_RECEIPT_GATE_MODE=soft|hard|off` env 토글, `validate-cmd.js`의 `codex_skipped` 처리 명확화.
4. Q10까지 main에 push했으나 `plugin.json` version 미bump 상태 — 본 cycle 종료 시 0.2.1 → 0.2.2 + main push로 marketplace cache 갱신 유도.

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Cross-plugin lookup | (신규 helper에서 구현) `~/.claude/plugins/installed_plugins.json` 파싱 — codex@openai-codex의 installPath 동적 resolve | json 한 번 읽고 `plugins["codex@openai-codex"][0].installPath` 추출 |
| Bash sub-process invoke | [pr.md:108-120](plugins/mccp/commands/pr.md#L108-L120) — `node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js dedupe ...` 패턴 | command 본문에서 Bash로 stdout 캡처 후 JSON parse |
| Codex 결과 parsing | [codex-bridge.js:113-163](plugins/mccp/scripts/lib/codex-bridge.js#L113-L163) — `parseCodexResult(rawText, focus)` | 5종 verdict (`converged`/`divergent`/`critical`/`unavailable` + escalate) |
| Auto-fallback 메시지 | [codex-bridge.js:21-29](plugins/mccp/scripts/lib/codex-bridge.js#L21-L29) — `AUTO_FALLBACK_PATTERNS` 정규식 | 새 unavailable 메시지(`codex-plugin-not-installed`, `codex-companion-not-found`, `codex-cli-not-authenticated`)를 패턴에 추가 |
| Env-mode toggle | [ecc-context-monitor 파라미터화] — `MCCP_COST_NOTIFY_ONLY`, threshold env vars | `MCCP_RECEIPT_GATE_MODE` 동일 스타일로 도입. **default=hard** (R2 #3 fix — Tasks 본문 Task 4와 일치). `soft`/`off`는 explicit opt-in. |
| Test 패턴 | [codex-bridge.test.js 추정 위치] `plugins/mccp/scripts/lib/tests/` — Node native runner | 새 fixture는 동일 디렉토리에 추가 |
| 자동 chain | [prp-implement.md Phase 6 OUTPUT 끝](plugins/mccp/commands/prp-implement.md#L376-L415) — "Next Steps" 텍스트 | 새 `Phase 7 — AUTO-CHAIN` 추가, Phase 6 후 자동 진입 |
| Stop hook signal 재사용 | [ecc-context-monitor.js](plugins/mccp/scripts/hooks/ecc-context-monitor.js) — 50/80/100 cost threshold | `$80 soft handoff` 신호를 chain abort 트리거로 재사용 |

---

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/codex-invoke.js` | CREATE | 신규 helper. cross-plugin codex installPath resolve + **companion interface schema-version 검증** + Bash로 `codex-companion.mjs adversarial-review` 호출 + timeout/retry + 결과 stdout 반환. **Gated commands에서는 fail-closed**: missing `installed_plugins.json`, stale installPath, companion version mismatch, exit nonzero — 모두 `classification='blocking-unavailable'`로 returning. `MCCP_ALLOW_CODEX_UNAVAILABLE=1` env override시에만 advisory unavailable로 격하. |
| `plugins/mccp/scripts/lib/tests/codex-invoke.test.js` | CREATE | 5종 fixture: installed / not-installed / not-authenticated / timeout / non-zero exit |
| `plugins/mccp/scripts/lib/codex-bridge.js` | UPDATE | `AUTO_FALLBACK_PATTERNS`에 `codex-plugin-not-installed`, `codex-companion-not-found`, `cli-not-authenticated`, `process-exit-nonzero` 추가. 기존 `parseCodexResult`는 그대로 — invoke와 parse 결합 방식만 변경. |
| `plugins/mccp/scripts/lib/tests/codex-bridge.test.js` | UPDATE | 신규 fallback 패턴 case 4개 추가 |
| `plugins/mccp/commands/plan.md` | UPDATE | Phase 5.2/5.4 — `Skill(codex:adversarial-review, ...)` 호출을 `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review --focus "..."` Bash 호출로 교체. Forbidden phrase 카탈로그 갱신. |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | Phase 2.5.3 — 동일 교체. Phase 6 OUTPUT 끝에 `Phase 7 — AUTO-CHAIN` 추가. |
| `plugins/mccp/commands/pr.md` | UPDATE | Phase 2.5.3 — 동일 교체. `--base <ref>` 인자 보존. |
| `plugins/mccp/commands/prp-commit.md` | UPDATE | (확인 필요) inline 게이트 없으면 Phase 7 chain 진입점에 invokeable export 추가. |
| `plugins/mccp/scripts/hooks/receipt-prompt.js` | UPDATE | `MCCP_RECEIPT_GATE_MODE` 인식. **기본값 `hard`** (gate command의 chain-of-custody 유지). `soft` → opt-in 시에만, 누락 receipt는 machine-readable `skipped` placeholder를 즉시 write + downstream validator는 non-approving으로 처리. `off` → 완전 skip (개인 디버깅 전용). |
| `plugins/mccp/scripts/hooks/receipt-skill.js` | UPDATE | 위와 동일. |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | `codex_skipped` 처리 명확화 — receipt body의 `codex_skipped:true`이면 indirect auto-CRITICAL 누수 fix (현재는 빈 receipt가 block 자격을 잃지 않음). |
| `plugins/mccp/scripts/receipt/tests/validate-cmd.test.js` | UPDATE | `codex_skipped` fixture 추가 |
| `plugins/mccp/scripts/lib/auto-chain.js` | CREATE | `Phase 7 — AUTO-CHAIN` 본문 helper. **`shouldAbort()`는 다음 모두에서 abort**: (a) `MCCP_AUTO_CHAIN_DISABLE=1` env kill switch, (b) 직전 Codex `verdict !== 'converged'` (unavailable/divergent/critical 모두), (c) Open Questions 중 severity HIGH/CRITICAL 1개 이상, (d) `criticalCategory !== null` (§0 카탈로그), (e) receipt 누락/stale (hash mismatch / SHA 불일치), (f) 직전 chain step exit nonzero, (g) **cost metrics 직접 read** — bridge가 `~/.claude/plugins/data/mccp/cost-current.json` 등 from ecc-context-monitor 파일을 매 mutating step 직전에 read. unreadable이면 conservative abort. 단, hard ceiling 도달 시 무조건 abort. chain steps: `commit` → `pr`. 각 step 직후 receipt store에 step receipt 기록. |
| `plugins/mccp/scripts/lib/tests/auto-chain.test.js` | CREATE | abort 트리거 2종 + 정상 chain 1종 |
| `plugins/mccp/scripts/hooks/ecc-context-monitor.js` | UPDATE | **모든 toolCall마다** `~/.claude/plugins/data/mccp/cost-current.json`을 atomic write (tmp file rename) — R2 #2 fix. fields: `{cost_usd, threshold_tier, hard_ceiling_reached, last_write_ts}`. $80 soft handoff → 추가로 STATE.md `session_end_imminent=true`. $100 hard ceiling은 파일의 `hard_ceiling_reached=true` + STATE.md `chain_aborted=true` 동시 기록 — 두 channel 어느 쪽이든 auto-chain.js가 abort. env var는 unreliable이므로 사용 안 함. |
| `plugins/mccp/scripts/state/state-writer.js` | UPDATE | `session_end_imminent`, `chain_progress` 필드 schema 확장. 기존 paired HEAD/TAIL sentinel 패턴 유지. |
| `plugins/mccp/scripts/state/tests/state-writer.test.js` | UPDATE | 신규 필드 round-trip test 2개 |
| `docs/gate-design.md` | UPDATE | §"Codex Invocation Path" 새로 작성 — Skill 못 쓰는 이유, Bash 직접 호출 패턴, fallback 카탈로그 갱신. §"Mode" 추가 — receipt soft/hard/off 토글. §"Auto-Chain" 추가 — chain 흐름과 abort 트리거. |
| `docs/v0.2-state-schema.md` | UPDATE | §1.4 신규 필드 schema |
| `CLAUDE.md` | UPDATE | §3.3 Codex 의존 작업 fallback matrix 갱신 — new 인터페이스 반영. |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `"version": "0.2.1"` → `"0.2.2"` |
| `.claude/notes/mccp-v0.2-continuation.md` | UPDATE | Q11 close-out 기록 |

---

## Tasks (실행 순서)

### Task 1 — codex-invoke helper 작성 (fail-closed)

- **Action**: `plugins/mccp/scripts/lib/codex-invoke.js` 생성.
  - `function resolveCodexInstallPath()`: `os.homedir() + '/.claude/plugins/installed_plugins.json'`을 읽어 `plugins["codex@openai-codex"][0].installPath` 반환. 미설치/registry 누락/스키마 변경 시 throw `CodexNotInstalledError` with `reason: 'registry-missing'|'registry-malformed'|'plugin-not-installed'|'install-path-stale'`.
  - `function verifyCompanionInterface(installPath)`: companion 파일 존재 + plugin.json `version` semver를 known-compatible list (`["1.0.x"]`)와 비교. 미일치 시 `CompanionVersionMismatchError`.
  - `function invokeAdversarialReview(focus, { timeoutMs = 90_000, base, scope } = {})`: `child_process.spawnSync('node', [path.join(installPath, 'scripts/codex-companion.mjs'), 'adversarial-review', argString], { timeout, encoding: 'utf8' })`. Pre-check resolve + verify. 실패 시 fail-closed 반환.
  - 반환: `{ ok, stdout, stderr, durationMs, classification, blocking }` — classification은 `ok`/`registry-missing`/`registry-malformed`/`plugin-not-installed`/`install-path-stale`/`companion-version-mismatch`/`not-authenticated`/`timeout`/`exit-nonzero`/`stdout-empty`. **`blocking=true`가 디폴트** for 모든 non-`ok` classification. `MCCP_ALLOW_CODEX_UNAVAILABLE=1`이 set이면 `blocking=false`로 격하 (advisory mode).
  - CLI mode: `node codex-invoke.js adversarial-review --focus "..."` → stdout JSON으로 위 객체 emit (command 본문이 Bash 호출 후 parse하기 쉽도록). Exit code: blocking=true면 12, blocking=false면 0.
- **Mirror**: `plugins/mccp/scripts/lib/codex-bridge.js`의 module export style + `pr.md:108-120` Bash 호출 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js` — fixtures 6종: ok / registry-missing / install-path-stale / companion-version-mismatch / not-authenticated / `MCCP_ALLOW_CODEX_UNAVAILABLE=1` advisory.

### Task 2 — codex-bridge.js fallback 패턴 확장

- **Action**: `AUTO_FALLBACK_PATTERNS`에 다음 4개 추가:
  - `/codex[\s-]plugin[\s-]not[\s-]installed/i`
  - `/codex[\s-]companion[\s-]not[\s-]found/i`
  - `/cli[\s-]not[\s-]authenticated/i`
  - `/process[\s-]exit[\s-]nonzero/i`
- **Mirror**: 기존 `AUTO_FALLBACK_PATTERNS` 정규식 스타일.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-bridge.test.js`

### Task 3 — plan.md / prp-implement.md / pr.md 본문 교체 (fail-closed wrapper)

- **Action**: 세 command 모두 `Skill(codex:adversarial-review, "...")` 호출 사이트를 다음 **fail-closed wrapper**로 교체 (R2 #1 fix):
  ```bash
  # stderr를 stdout과 분리 — JSON contract 보장
  CODEX_STDOUT=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review \
    --focus "<focus text>" \
    [--base <ref>] \
    --timeout-ms 90000 \
    --json 2> .git/mccp/tmp/codex-invoke.stderr)
  CODEX_EXIT=$?

  # exit 12 → blocking-unavailable. exit 0 → ok (single classification).
  # JSON.blocking === true 인 결과는 **어떤 경로로든 receipt 진입 금지**.
  CODEX_BLOCKING=$(node -e 'try{const j=JSON.parse(process.argv[1]);console.log(j.blocking?"1":"0")}catch{console.log("1")}' "$CODEX_STDOUT")
  CODEX_CLASS=$(node -e 'try{const j=JSON.parse(process.argv[1]);console.log(j.classification||"unknown")}catch{console.log("parse-error")}' "$CODEX_STDOUT")

  if [ "$CODEX_EXIT" != "0" ] || [ "$CODEX_BLOCKING" = "1" ] || [ "$CODEX_CLASS" != "ok" ]; then
    if [ "${MCCP_ALLOW_CODEX_UNAVAILABLE:-0}" = "1" ]; then
      # Audited advisory mode — receipt body에 advisory=true + classification 명시
      echo "[mccp] Codex unavailable in advisory mode (class=$CODEX_CLASS exit=$CODEX_EXIT)"
    else
      echo "[MCCP-GATE-STOP] Codex unavailable (blocking=$CODEX_BLOCKING class=$CODEX_CLASS exit=$CODEX_EXIT). Set MCCP_ALLOW_CODEX_UNAVAILABLE=1 to proceed in advisory mode (will not yield converged receipt)."
      exit 1
    fi
  fi
  ```
  - 후속 텍스트 parsing은 기존 `codex-bridge.parseCodexResult` 호출(node `-e` 또는 sub-CLI). Parse 결과 verdict가 `converged`가 아닌 경우에도 receipt는 non-approving으로 write (R2 #1: blocking classification은 **어떤 경로로든 approving receipt 생성 금지**).
  - 본 wrapper는 plan / prp-implement / pr 모두 동일 패턴. base ref만 pr.md에서 추가.
- **Mirror**: pr.md Phase 2.5.2의 dedupe-cli 호출 패턴 + 본 plan Phase 5.6의 `[MCCP-GATE-STOP]` 출력 형식.
- **Validate**: 본 plan을 자기 자신으로 dogfooding. Acceptance: 동일 wrapper에 `--inject-failure plugin-not-installed`를 줘서 `blocking=1` exit 1이 나오고 receipt가 *write되지 않는지* 확인. 또한 `MCCP_ALLOW_CODEX_UNAVAILABLE=1` 환경에서 wrapper 통과하지만 receipt에 `advisory=true`로 stamp되어 downstream validator가 non-approving 처리하는지 확인.

### Task 4 — receipt mode patch (default hard)

- **Action**:
  - `receipt-prompt.js` / `receipt-skill.js`: 진입 시 `const mode = process.env.MCCP_RECEIPT_GATE_MODE || 'hard'`. **기본값 hard** (chain-of-custody 유지). `soft`→ opt-in. 누락 receipt가 있을 때 즉시 `decision="skipped-soft", codex_skipped=true, missing=true, blocking=true` placeholder receipt를 write — downstream validator는 이를 non-approving으로 처리하므로 사용자가 실수로 hard로 다시 돌아가도 chain이 깨지지 않음. `off`→ 진행 (개인 디버깅 전용, gate command에서는 `MCCP_RECEIPT_GATE_MODE=off` set 시에도 stderr 큰 경고).
  - `validate-cmd.js`: receipt body에 `codex_skipped:true` 또는 `missing:true`가 있으면 `decision="skipped"`, `verdict="unavailable"`이어도 block 효력 유지. 누락 receipt path도 동일하게 block (기존 indirect auto-CRITICAL 누수 fix).
- **Mirror**: `plugins/mccp/scripts/hooks/ecc-context-monitor.js`의 env 토글 패턴.
- **Validate**: 신규 fixture로 `node --test plugins/mccp/scripts/hooks/tests/receipt-prompt.test.js`. 3 mode + skipped-soft placeholder write/parse 각각 동작.

### Task 5 — auto-chain helper 작성 (fail-closed multi-trigger abort)

- **Action**:
  - `plugins/mccp/scripts/lib/auto-chain.js` 생성. `shouldAbort()`가 다음 **모두**를 검사 (하나라도 hit → abort):
    1. `process.env.MCCP_AUTO_CHAIN_DISABLE === '1'` → operator kill switch
    2. 직전 Codex receipt `verdict !== 'converged'` — unavailable / divergent / critical / DIVERGENT_UNRESOLVED 모두 abort
    3. 직전 Codex receipt Open Questions에 severity HIGH 또는 CRITICAL 1개 이상 → abort
    4. 직전 receipt `criticalCategory !== null` (§0 auto-CRITICAL 카탈로그) → abort
    5. **Receipt 누락/stale**: 기대 chain의 receipt 미존재, hash mismatch, plan head_sha와 mismatch → abort
    6. 직전 chain step exit nonzero → abort
    7. **Cost metrics 직접 read** (R2 #2 fix — first-chain missing-file allowance 제거): `~/.claude/plugins/data/mccp/cost-current.json` 매 mutating step 직전 read. 파일 미존재 / 1시간 이상 stale (`now - mtime > 3600s` — old file일수록 양수가 커지는 정상 방향, R3 #3 fix) / 파싱 실패 — 모두 **무조건 abort**. `hard_ceiling_reached === true`도 abort. cost telemetry 부재를 normal로 받아들이지 않음. `ecc-context-monitor`가 chain 시작 전 첫 toolCall에서 반드시 file을 write하므로, mutating step 시점엔 이미 존재가 보장됨.
    8. STATE.md `chain_aborted=true` 플래그 → abort
  - `runChain(steps)`: `commit` → `pr` 순서로 실행. 각 step 시작 직전에 `shouldAbort()` 호출. 각 step 종료 시 `state-writer.recordChainProgress({step, status, receiptPath})` + receipt store에 step receipt write.
  - 미들 보고: `session_end_imminent === true`이면 PR 직전에 STATE.md에 mid-report blob 작성 (chain 미완 상태로 다음 세션 인계).
- **Mirror**: `codex-bridge.js` 함수 export 스타일.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/auto-chain.test.js` — 8 abort trigger 각각 + normal happy-path 1종.

### Task 6 — prp-implement.md Phase 7 추가

- **Action**: Phase 6 (OUTPUT) 끝에 `Phase 7 — AUTO-CHAIN-COMMIT-PR` 섹션 신설. 내용:
  - `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/auto-chain.js runChain --steps "commit,pr"` 호출
  - abort signal 발견 시 STATE.md 기록 + 한 줄 stderr 후 종료 (사용자에게 보고 X — chain 도구만 멈춤)
  - 정상 종료 시 PR URL을 STATE.md `last_pr_url`에 저장
- **Mirror**: 기존 Phase 6 Markdown 구조.
- **Validate**: 본 cycle 종료 시점에 prp-implement → prp-commit → prp-pr 자동 chain이 동작하는지 manual smoke (Task 11 — 최종 dogfooding).

### Task 7 — ecc-context-monitor cost ceiling wire

- **Action**:
  - 50 NOTICE: 무동작 유지
  - 80 WARNING: STATE.md `session_end_imminent=true` (state-writer 호출). chain은 진행하되 mid-report 발생.
  - 100 CRITICAL: env `MCCP_COST_HARD_CEILING_HIT=1` emit (hook spawn 시 환경에 주입은 못 하므로 STATE.md `chain_aborted=true` 함께 기록 → auto-chain.js가 양쪽 검사).
- **Mirror**: 기존 cost threshold/log emit logic.
- **Validate**: 기존 ecc-context-monitor test에 신규 expect 추가.

### Task 8 — state-writer schema 확장

- **Action**: `session_end_imminent: boolean`, `chain_aborted: boolean`, `chain_progress: { steps: [{name, status, receiptPath, ts}] }`, `last_pr_url: string` 필드를 frontmatter에 추가. 기존 paired HEAD/TAIL sentinel 패턴 유지 — 새 필드는 같은 envelope 안.
- **Mirror**: `s10a-state-md-continuity` partial-delivery guard 그대로.
- **Validate**: `node --test plugins/mccp/scripts/state/tests/state-writer.test.js`

### Task 9 — docs 업데이트

- **Action**:
  - `docs/gate-design.md`: §Codex Invocation Path / §Mode / §Auto-Chain 신설
  - `docs/v0.2-state-schema.md`: §1.4 새 필드 schema
  - `CLAUDE.md`: §3.3 fallback matrix 갱신
- **Mirror**: 기존 docs 톤·구조.

### Task 10 — plugin version bump

- **Action**: `plugins/mccp/.claude-plugin/plugin.json` `"version": "0.2.1" → "0.2.2"`. CHANGELOG 입력 없음 (본 repo는 CHANGELOG 미사용 — git log이 source of truth).
- **Validate**: `git diff plugin.json`로 단일 라인 변경 확인.

### Task 11 — 최종 dogfood + commit + push

- **Action**: 모든 task 완료 후 본 명령 자체가 만든 chain을 시연. `/mccp:prp-implement` 호출 → Phase 2.5 Codex 호출이 실제 작동 → Phase 7 → `/mccp:prp-commit` → `/mccp:prp-pr`. 단, 본 cycle은 사용자 선택대로 PR 없이 main 직접 push (Task 11에서는 commit + push만, PR step은 skip — 사용자 메시지: "version bump → main push").
  - 즉 `/mccp:prp-implement` 종료 후 Phase 7는 단일 commit + main push로 동작하게 분기 검사: 본 cycle은 `MCCP_AUTO_CHAIN_SKIP_PR=1`로 invoke (one-off).
- **Validate**: `git log main -1`이 `chore(mccp): v0.2.2 — Q11 Codex 호출 fix + 자동 chain + receipt soft + 배포` 또는 유사 commit이 나타나야 함.

---

## Validation (level별)

```bash
# Level 1: unit tests (Node native runner)
node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js
node --test plugins/mccp/scripts/lib/tests/codex-bridge.test.js
node --test plugins/mccp/scripts/lib/tests/auto-chain.test.js
node --test plugins/mccp/scripts/hooks/tests/receipt-prompt.test.js
node --test plugins/mccp/scripts/receipt/tests/validate-cmd.test.js
node --test plugins/mccp/scripts/state/tests/state-writer.test.js

# Level 2: end-to-end dogfood (manual)
# - 본 plan을 자기 자신으로 /mccp:prp-implement에 넣어 chain 동작 확인
# - codex-invoke 실제 호출 결과를 STATE.md에서 verify

# Level 3: receipt chain validate
node plugins/mccp/scripts/receipt/cli.js validate --command mccp:prp-implement
node plugins/mccp/scripts/receipt/cli.js validate --command mccp:pr

# Level 4: marketplace cache sync verification (after push)
# - 새 세션에서 plugin version이 0.2.2로 표시되는지 확인 (사용자가 다음 세션에서 테스트)
```

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| codex-companion.mjs 인터페이스가 1.0.4 specific. 향후 codex plugin 업데이트시 깨질 수 있음 | M | H (모든 게이트 fallback 회귀) | **Mitigated**: codex-invoke.js의 `verifyCompanionInterface()`가 plugin.json semver를 known-compatible list와 비교 → mismatch 시 `blocking=true` fail-closed. 사용자가 의식적으로 `MCCP_ALLOW_CODEX_UNAVAILABLE=1`로 advisory 전환. |
| auto-chain 도중 사용자가 KILL 못 하면 위험 commit 발생 가능 | M | M | **Mitigated** (Codex R1 #3): `shouldAbort()` 8 trigger 모두 검사 — `MCCP_AUTO_CHAIN_DISABLE=1` env kill switch, non-converged Codex, HIGH/CRITICAL questions, criticalCategory, missing/stale receipt, nonzero step exit, cost hard ceiling, STATE.md `chain_aborted`. |
| receipt soft-mode가 hard에 의존하던 downstream 로직을 silently bypass | H | H (Codex R1 #2: hollow gate) | **Mitigated**: 기본값 `hard`로 변경. `soft`는 opt-in이며, soft에서도 누락 receipt는 즉시 `decision="skipped-soft", blocking=true` placeholder를 write — downstream validator는 non-approving으로 처리. `off`는 큰 stderr 경고. |
| Codex 경로 fix가 registry missing/stale 시 fail-open (Codex R1 #1) | M | H | **Mitigated**: codex-invoke.js의 `resolveCodexInstallPath()`가 registry-missing/registry-malformed/install-path-stale 모두 throw → caller가 `classification!=='ok'`로 받아 `blocking=true`. CLI exit code 12. |
| Cost hard ceiling이 STATE.md만으로는 advisory (Codex R1 #4: race) | H | H | **Mitigated**: auto-chain.js가 mutating step **직전**에 `~/.claude/plugins/data/mccp/cost-current.json`을 직접 read. `hard_ceiling_reached===true`면 abort, 파일 unreadable이면 conservative abort. STATE.md는 보조 channel (reporting + manual override). |
| main 직접 push에 사용자 패턴(PR 검토) 충돌 | H | L (사용자가 명시적으로 main push 선택) | 사용자 선택을 따름. 다음 cycle부터는 PR 패턴 복귀 권장 — plan 끝에 followup 기록. |
| Q10 변경(064c227 CLAUDE.md 등)이 marketplace에 미반영 | L | M | 본 plan 종료 후 사용자에게 다음 세션 시작 시 `/plugin update` 안내. |

---

## Acceptance

- [ ] codex-invoke.js + tests 통과
- [ ] codex-bridge.js fallback 패턴 확장 + tests 통과
- [ ] plan.md · prp-implement.md · pr.md 본문에서 `Skill(codex:adversarial-review` 0건 (Bash 호출로 100% 교체)
- [ ] receipt soft-mode (`MCCP_RECEIPT_GATE_MODE` 토글 3 mode) tests 통과
- [ ] validate-cmd.js의 `codex_skipped` 처리 fix + test
- [ ] auto-chain.js + tests 통과
- [ ] prp-implement.md Phase 7 AUTO-CHAIN 추가
- [ ] ecc-context-monitor에서 80/100 임계치가 STATE.md flag로 emit
- [ ] state-writer schema 확장 + round-trip test
- [ ] docs (gate-design / v0.2-state-schema / CLAUDE.md) 갱신
- [ ] plugin.json version 0.2.2
- [ ] main에 단일 commit + push 완료
- [ ] STATE.md `last_pr_url` 또는 commit sha 기록
- [ ] **Default-hard test** (R2 #3): `MCCP_RECEIPT_GATE_MODE` unset 상태에서 누락 receipt가 hard로 block 되는지 receipt-prompt + receipt-skill + validate-cmd 3 단계 모두 검증
- [ ] **Blocking-write 차단 test** (R2 #1): codex-invoke.js의 `blocking=true` 응답은 어떤 경로로든 approving receipt 생성 금지 — wrapper 분기 + receipt write에 advisory=true stamp + downstream validator non-approving 처리, 3 지점 모두 검증
- [ ] **Cost telemetry presence test** (R2 #2): `cost-current.json` 미존재/stale/unreadable 시 auto-chain mutating step 모두 abort — 4 case fixture

---

## Followups (별도 cycle)

- Q3 — S10b auto-handoff 본격 도입 (cost hard ceiling 진정한 enforcement)
- Q4 — `/mccp:work` 단일 entry
- v0.2.3 — Decision-slug derivation 통합 (Option Y, Codex 권고)
- v0.2.3 — Receipt soft → hard로 전환 가능한 trigger 조건 검토 (5결함 재발 여부 모니터링)
- TODO(s10a-followup) — shouldInjectContext=skip 회귀 test env var 발견 후 잠금

---

## Codex Adversarial Review

- 호출: `node codex-companion.mjs adversarial-review` (Bash 직접 호출 — Skill 인터페이스 미존재, slash command `disable-model-invocation:true`로 차단된 우회 경로. 본 plan v0.2.2가 fix하는 그 인터페이스를 본 review에서 dogfood함.)
- 라운드 수: 3 (max cap 도달)
- Round 1 verdict: needs-attention. 5 findings (4 high + 1 false positive).
  - **수용 — Plan body 직접 수정**:
    - R1#1 fail-open path resolution → codex-invoke.js에 fail-closed semantics + `MCCP_ALLOW_CODEX_UNAVAILABLE` override
    - R1#2 receipt soft-mode가 chain hollow → default=hard, soft는 opt-in + skipped-soft placeholder
    - R1#3 auto-chain abort 약함 → `shouldAbort()` 8 trigger 확장
    - R1#4 STATE.md만으로는 cost ceiling race → `~/.claude/plugins/data/mccp/cost-current.json` 직접 read
  - **거부 — false positive**:
    - R1#5 impeccable skill 트리 silent deletion 주장. 검증 결과: `git status` clean, `git diff --stat` empty, `git ls-files plugins/mccp/skills/impeccable` empty, filesystem 미존재. Codex가 `findstr` non-match를 deletion으로 mis-inference. `<grounding_rules>` 위반. 받지 않음.
- Round 2 verdict: needs-attention. 3 findings (2 high + 1 medium).
  - **수용 — Plan body 직접 수정**:
    - R2#1 wrapper가 exit code + blocking field check 명시 안 함 → Task 3에 fail-closed Bash wrapper 전문 + `[MCCP-GATE-STOP]` 분기 + advisory mode receipt stamp
    - R2#2 cost direct-read에 first-chain missing-file allowance 존재 → 제거. unreadable/stale/missing 모두 무조건 abort. ecc-context-monitor가 chain 시작 전 atomic write 보장.
    - R2#3 Patterns to Mirror 테이블에 `default=soft` 잔존 → `default=hard`로 정합화 + Acceptance에 default-hard test 추가
- Round 3 verdict: needs-attention (DIVERGENT_UNRESOLVED at cap). 3 findings.
  - **수용 — Plan + CLAUDE.md 직접 수정**:
    - R3#1 CLAUDE.md:47, :194에 `soft (예정 default)` 잔존 — Codex가 working tree에서 실제로 찾음. CLAUDE.md를 `hard (default — chain-of-custody 유지)`로 갱신.
    - R3#3 stale 수식 `mtime - now > 3600s` 거꾸로 — old file일수록 negative. `now - mtime > 3600s`로 fix.
  - **DIVERGENT_UNRESOLVED — 정책 결정 필요**:
    - **R3#2** `MCCP_ALLOW_CODEX_UNAVAILABLE=1` advisory mode가 `/mccp:pr`처럼 terminal mutating command에서 우회 경로가 됨. Codex 권고: "advisory를 terminal stage에서는 command-local abort로 처리하거나 별도 one-shot force flag 요구". 정책 trade-off: (a) terminal command에서도 advisory 허용하면 Codex 미설치/장애 시 사용자가 PR 자체를 막힘 (b) 막으면 진정한 fail-closed지만 가용성 저하. **본 cycle 결정**: terminal `pr`과 auto-chain의 `pr` step에 대해서는 advisory mode를 *명시적으로* 거부하도록 wrapper에 별도 분기. 즉 plan에서 `pr.md`와 `auto-chain.js`에 한해 `MCCP_ALLOW_CODEX_UNAVAILABLE=1`을 무시하는 동작 추가. **이 결정의 risk**: implement-time에 의도 추가로 별도 force flag (`MCCP_FORCE_PR_WITHOUT_CODEX=1`)가 필요할 수 있음. → Implement-Codex 게이트 (`/mccp:prp-implement` Phase 2.5)에서 재검토 항목으로 carry-over.
- Codex session 참조: thread `019e8efe-d0d8-7c43-a630-263049c48b4a` (R1), `019e8f05-0502-7870-95d1-e60e6b489f35` (R2), R3 thread는 `.git/mccp/tmp/codex-review-v0.2.2-r3.txt` 참조.
- Open Questions:
  - R3#2 — terminal advisory policy — severity HIGH — DIVERGENT_UNRESOLVED. Implement-Codex 게이트에서 재논의.
- Auto-CRITICAL 카탈로그 매칭: §0 카탈로그(secret/data loss/auth bypass/external destination/crypto) 어느 항목과도 매칭되지 않음 → auto-CRITICAL stop 미발동. R3#2는 governance gap이지 catastrophic 위험 아님.

