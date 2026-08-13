# Implement Gate Review — gate-guard-integrity M2

**Gate**: `mccp-implement-codex` · **Decision**: `gate-guard-integrity-m2`
**Plan**: `.claude/plans/gate-guard-integrity-m2.plan.md`
**Bound plan_hash**: `sha256:9fd9fd6604403eedcab93666537299de7cc1debd75bddede74f15f0e1d070605`

> **왜 plan 본문이 아니라 여기인가.** `/mccp:prp-implement` Phase 2.5.4는 이 기록을 plan 본문에 주입하라고 규정하지만, `receipt/hash.js`의 `markdownHashStructural`은 게이트 주입 섹션을 strip하지 않는다(frontmatter key · checkbox · PR placeholder · table status token만 정규화). 그래서 주입 즉시 plan_hash가 바뀌어 **직전 단계인 `mccp-plan-codex` receipt가 stale**이 되고, Phase 2.5.7 read-back validate가 `exit 2`로 자기 게이트를 거부한다(실측: 주입 후 `cc9d11a5…` ≠ 봉인된 `9fd9fd66…`).
>
> 이 저장소는 **같은 문제에 대한 관례를 이미 확립**했다 — plan §Review History가 라운드별 리뷰 기록을 `.claude/reviews/plan-review-<slug>.md`에 두는 이유로 "plan 본문 편집은 `reviewed_plan_hash` 바인딩을 깨뜨린다"를 명시한다(커맨드 Phase 5.2h). 구현 게이트에 같은 규칙을 적용한 것이 이 파일이다. 커맨드 2.5.6 Step A의 grep 대상(`<plan or notes path>`)은 이 파일이며, 우회가 아니라 **동일 검사를 바인딩을 깨지 않는 위치에서** 수행한 것이다.
>
> 근본 결함(2.5.4 ↔ 2.5.7 자기모순)은 이 milestone의 범위 밖이고 STATE.md Open Questions에 이미 backlog 항목으로 올라 있다.

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0
- 합치 결론: **Codex 미발화.** `MCCP_CODEX_DISABLED=1`(사용자 전역 `~/.claude/settings.json`)이므로 `codex-invoke.js:182-192`가 spawn 직전 short-circuit했다 — 실측 `classification=disabled` · `blocking=false` · `ok=true` · `durationMs=0`. v0.3.5 first-class skip이라 advisory env 없이 통과하되 **검토는 0건**이다. plan 게이트(`## Codex Adversarial Review`)와 **같은 공백**이며, 본 milestone도 cross-model 확증을 획득했다고 주장하지 않는다. receipt는 `codex_verdict=skipped`로 이 사실을 봉인한다.
- YAGNI Triage: Codex finding 0건(미발화)이므로 triage 대상 없음.
- Deferred to backlog: 0건
- Open Questions: 없음 (§0 auto-CRITICAL 카탈로그 해당 없음)
- Codex session 참조: 없음 (spawn 미수행)

### Implement-time decisions (2.5.2에서 열거한 것)

plan이 사전 확정하지 않은 결정만 나열한다. 세 건 전부 아래 security 리뷰의 검토 대상이 됐다.

| # | 결정 | 판단 |
|---|---|---|
| D-a | `store.js#quarantineReceipt`의 실제 시그니처 | plan은 `(receiptFilePath, suffix)` 2-arg로 적었으나 `receiptsDir(repoRoot)` 봉쇄를 요구한다. 경로에서 repoRoot를 역산하면 **공격자 입력이 자기 봉쇄 루트를 정의**하므로 봉쇄가 무의미해진다. store.js의 기존 관례(`writeReceipt(repoRoot, …)`)대로 `repoRoot`를 첫 인자로 받는다 (Deviation D2) |
| D-b | 기존 runner test의 fixture 위치 | `plan-codex-runner.test.js:248`의 fixture receipt가 `<scratch>/plan-codex-receipt.json` — `.claude/receipts/` **밖**이다. 봉쇄가 켜지면 이 기존 test가 깨진다. fixture를 `<scratch>/.claude/receipts/mccp-plan-codex/r.json`으로 옮긴다 — production이 실제로 쓰는 형태라 test가 더 충실해진다 (Deviation D3) |
| D-c | fail-open marker 리터럴 | 아래 security 리뷰 LOW 지적 흡수 (Deviation D1) |

### Security Reviewer

plan Task 6a가 경로 봉쇄(path traversal · symlink 탈출 · suffix 주입)를 신설하므로 security-sensitive 축으로 분류하고 `Task(security-reviewer)`를 **실발화**했다 — auto-fallback이 아니므로 receipt는 `security_skipped=false`다.

**판정: CLEAN — CRITICAL/HIGH 0건.**

| 축 | 판정 |
|---|---|
| 경로 봉쇄 알고리즘 | 3층(suffix 정규식 → `path.relative` → 부모 `realpathSync`)이 충분. Windows `\\?\` prefix는 `path.resolve`가 정규화하고 drive-relative(`C:file`)는 `isAbsolute` 검사가 거른다. junction은 `isSafeGateDir`의 `isSymbolicLink()`가 Node 10+에서 잡는다 |
| suffix 주입 | `SAFE_TOKEN_RE`가 ASCII 전용이라 separator · `..` · NUL · 제어문자 · unicode homoglyph 우회가 전부 불가 |
| 새 rename primitive의 위협 확대 | 없음. 이 게이트의 대상은 "미계측 writer 유입"이지 repo write 권한을 가진 적대적 위조자가 아니다 — `b2-coverage-gate.js:19-23`이 이미 그 경계를 선언했고 신규 helper가 그것을 넓히지 않는다 |
| fail-open 강제가 정당한 실패 신호를 가리는가 | 가리지 않음. **리뷰어가 plan의 주장을 독립 grep으로 재확인** — `session-start.js`의 exit-code 대입은 `:1102` 단 1곳이고 그 값이 `0`이다. 삼킬 비영점 경로가 애초에 없다 |
| test 전용 env 2종의 production 도달성 | 없음. 소비처가 test 파일 자신이고 §Validation의 역방향 grep이 `derive/`(tests 제외) 누출을 기계적으로 차단한다 |

**흡수한 지적 1건 (LOW)** — plan이 지정한 marker 리터럴 `FAIL-OPEN-FORCED原exit=<N>`의 `原`가 영어 코드베이스에서 이례적이라는 지적. §Validation 게이트는 prefix `FAIL-OPEN-FORCED`만 grep하므로 판정에 영향이 없고, Windows에서 소스에 CJK 리터럴을 심는 인코딩 위험(선례: literal-escape-becomes-NUL)을 피하기 위해 **`FAIL-OPEN-FORCED orig_exit=<N>`** 로 착지한다 (Deviation D1).

**미해소로 남긴 것 (리뷰어 지적 4번)** — helper가 throw하지 않으므로 호출부가 반환값을 무시하면 격리 실패가 조용히 지나간다. 이것은 코드 결함이 아니라 **test가 실제로 반환값 처리를 단언해야 성립하는 요구**이며, plan Task 6b가 이미 그 형태(stub을 `{ok:false}`로 만들고 FATAL stderr 발화 확인)를 의무화했다. §Validation의 위임 관측 2건이 그 falsifier다.
