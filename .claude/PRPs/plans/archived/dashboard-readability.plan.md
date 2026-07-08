# Plan: Dashboard Readability — M1 (Codex timeout 근거 확인 + 문서 정정)

**Source PRD**: `.claude/prds/dashboard-readability.prd.md`
**Selected Milestone**: M1 — Codex timeout 근거 확인 + 문서 정정
**Complexity**: Small

## Summary
codex adversarial review의 timeout이 "2분"이라는 의심을 코드 대조로 종결한다. 실제 코드는 이미 `DEFAULT_TIMEOUT_MS = 900_000`(15분)이고 **프로덕션 기본/call-site 어디에도** 120s/2분 값은 없다(유일한 `120000`은 `codex-invoke.test.js:367` parseCliArgs 픽스처 — flag 보존 테스트일 뿐 기본값 아님) — 따라서 **codex timeout 동작 코드 변경 없음**. 실제와 어긋난 표면은 `CLAUDE.md` §3.3 classification 표의 `timeout` 행("90s 초과")이므로 이 한 줄을 코드(900s/15분)와 일치시키고, milestone PR 관행(§3.7)에 따라 `plugin.json`을 patch bump(`1.19.0→1.19.1`)하며 하드코딩 footer를 동기한다. 확정 근거는 PR/commit에 남긴다.

## Evidence (Phase 2 GROUND — 코드 대조 결과)
PRD Evidence 주장을 worktree 코드로 전수 검증함:

| 표면 | 실제 값 | 위치 | 판정 |
|---|---|---|---|
| codex-invoke 기본 timeout | `DEFAULT_TIMEOUT_MS = 900_000` (15분) | `plugins/mccp/scripts/lib/codex-invoke.js:54` (근거 주석 47–53행) | 정상 — 이미 15분 |
| PR 단계 codex-runner 기본 | `parseInt(args['timeout-ms'],10) || 900000` | `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js:123` | 정상 |
| plan/implement 명령 본문 | `--timeout-ms 900000` | `plan.md:558`, `prp-implement.md:207` | 정상 |
| 프로덕션 codex-timeout "120s/2분" 기본·call-site | **존재하지 않음** | repo-wide grep | 의심 전제 기각 |
| codex 컨텍스트 `120000` 매칭 | `codex-invoke.test.js:367`(parseCliArgs flag 보존 픽스처, 기본값 아님) 1건뿐 | grep `120000` | 프로덕션 동작과 무관 — 주장은 "프로덕션 기본/call-site 없음"으로 한정(Codex Plan-R1 F1) |
| CLAUDE.md §3.3 `timeout` 행 | `90s 초과` | `CLAUDE.md:197` | **STALE — 정정 대상** |

무관 false-positive(정정 금지): `CLAUDE.md:126`·`:654`(render lock 90s), `goal-phase-guard.js:264`·`milestone-close.md:209`(lock reclaim 90s mtime), `DESIGN.md:293`("2분 전" relative-time 표시), `codex-invoke.js:48`(역사적 "90s was too short" 근거 narrative — 의도된 보존), renderer 테스트의 `120_000`(relative-time delta, codex-timeout 무관).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Source of truth | `plugins/mccp/scripts/lib/codex-invoke.js:47-54` | 문서 정정의 기준값은 코드 상수(`DEFAULT_TIMEOUT_MS = 900_000` = 15분) + 그 근거 주석 |
| Doc 정합 표현 | `CLAUDE.md:202` (`tempfail (exit 75)` 행) | classification 표 셀은 "원인"을 짧게 기술 — 같은 톤으로 `900s(15분) 초과` |
| Tests | (없음) | CLAUDE.md 본문 content를 assert하는 테스트는 존재하지 않음 — manual diff + grep 검증으로 대체 |

## Files to Change
| File | Action | Why |
|---|---|---|
| `CLAUDE.md` | UPDATE | §3.3 표 `timeout` 행(line 197) `90s 초과` → `900s(15분) 초과` — 코드(900_000)와 일치 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | §3.7 milestone PR = patch bump `1.19.0` → `1.19.1` (Codex Plan-R1 F2 흡수 — M1은 delivery milestone PR이므로 cache 미배포 근거가 audit 관행을 override 못 함) |
| `CHANGELOG.md` | UPDATE | `1.19.1` row 추가 — codex-timeout 문서 정정(§3.3 stale 90s→900s) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer(line 1442 page-foot) 하드코딩 `v1.19.0` → `v1.19.1` 동기 (§3.7 footer drift 방지) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄(line 154) 하드코딩 `v1.19.0` → `v1.19.1` 동기 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer 스냅샷 테스트(line 123/125) `v1.19.0` → `v1.19.1` 동기 — Task 3/Validation §6/Risk가 명시한 갱신을 Files 표에 보정 추가(implement-time deviation: 표 누락 항목, prose는 이미 관할) |

## Tasks
### Task 1: codex-timeout 근거 확정 (검증 only, 파일 변경 없음)
- **Action**: Phase 2 GROUND 표를 plan/commit/PR body에 근거로 고정. 결론 = "코드는 이미 15분, 코드 변경 불필요". codex-invoke.js 주석(47–53행)이 이미 in-code 근거를 영속 보관하므로 별도 evidence 문서 신설 안 함.
- **Mirror**: `codex-invoke.js:47-54` 상수 + 주석을 single source of truth로.
- **Validate**: `grep -n "900_000\|900000" plugins/mccp/scripts/lib/codex-invoke.js plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js` 가 기본값을 확인. repo-wide `grep "120s\|2분"` 에 codex-timeout 매칭 0.

### Task 2: CLAUDE.md §3.3 stale 행 정정
- **Action**: `CLAUDE.md:197` 의 `| `timeout` | 90s 초과 | block | warn + 통과 |` 에서 `90s 초과` → `900s(15분) 초과` 로 교체. 다른 셀(block / warn + 통과)·다른 행은 손대지 않음.
- **Mirror**: 코드 상수 900_000ms = 900s = 15분.
- **Validate**: `grep -n "90s 초과" CLAUDE.md` → 0 hits (codex-timeout 행 정정 확인). `grep -n "900s(15분) 초과" CLAUDE.md` → 1 hit. render-lock "90s"(126/654행)는 그대로 잔존 확인.

### Task 3: plugin.json patch bump + footer 동기 (Codex Plan-R1 F2)
- **Action**: `plugin.json` `version` `1.19.0` → `1.19.1`. `CHANGELOG.md`에 `1.19.1` row(codex-timeout 문서 정정) 추가. `html.js:1442` page-foot + `markdown.js:154` derived 줄의 하드코딩 `v1.19.0` → `v1.19.1` 동기. branch 이름과의 일관성(`dashboard-readability`) 확인.
- **Mirror**: §3.7 Milestone PR 의무 체크리스트 + footer drift 경고.
- **Validate**: `grep -rn "v1.19.0\|1.19.0" plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js plugins/mccp/.claude-plugin/plugin.json` → 0 hits (전부 1.19.1). 렌더러 스냅샷 테스트가 footer version에 고정돼 있으면 갱신 + diff 리뷰.

### Task 4: timeout 동작 코드 무변경 + 무관 표면 미오염 검증
- **Action**: codex timeout *동작* 코드(codex-invoke.js / codex-runner.js / 명령 본문 `--timeout-ms`)는 변경 0임을 확인. 변경된 `.js`는 renderer footer version 문자열 2곳뿐(동작 무관). render-lock "90s"(CLAUDE.md 126/654)·lock-reclaim "90s"는 보존.
- **Mirror**: —
- **Validate**: `git diff plugins/mccp/scripts/lib/codex-invoke.js plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js` → 빈 출력. `git diff --stat` 의 `.js` 변경이 html.js/markdown.js footer 한 줄씩으로 한정.

## Validation
```bash
# (worktree cwd 기준)
# 1) 정정 완료 — codex-timeout 행이 900s로
grep -n "900s(15분) 초과" CLAUDE.md            # 1 hit
grep -n "| \`timeout\` | 90s 초과" CLAUDE.md   # 0 hits

# 2) 무관 render-lock 90s는 보존
grep -n "90s render lock\|90s는 generous" CLAUDE.md   # 여전히 존재

# 3) 프로덕션 codex-timeout 거짓값 부재 (numeric form 포함, Codex F1)
#    120000 매칭은 codex-invoke.test.js:367 parseCliArgs 픽스처 1건만 허용
grep -rn "120000\|120_000\|--timeout-ms 120\|120s\|2분" plugins/mccp/scripts plugins/mccp/commands \
  | grep -iE "codex|timeout-ms" | grep -v "codex-invoke.test.js:367"   # 0 hits

# 4) version bump + footer 동기 (Codex F2)
grep -rn "1\.19\.0" plugins/mccp/.claude-plugin/plugin.json \
  plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js   # 0 hits (전부 1.19.1)

# 5) timeout 동작 코드 무변경
git diff plugins/mccp/scripts/lib/codex-invoke.js \
  plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js          # 빈 출력

# 6) 테스트 그린 (footer 스냅샷 갱신 후)
node --test plugins/mccp/scripts/lib/renderer/tests/ 2>&1 | tail -3
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| 무관한 "90s"(render-lock 126/654행, lock-reclaim)를 실수로 함께 변경 | LOW | §3.3 표의 line 197 단일 행만 타겟. 정정 후 `git diff CLAUDE.md`로 한 줄 변경만 확인 |
| footer version bump으로 `html.js` 변경 → implement 단계 design detector가 UI-ext diff로 `design_signal` 발화 가능 | MEDIUM | footer는 version 문자열 한 줄이라 critique은 trivial CONVERGED 예상. produced-diff grounding(Phase 3.7)은 `v1.19.1` added line이 H15(heading) anchor 무관 → `anchor_clean`/`grounded` 통과 예상. 회귀 아님(스냅샷 갱신 + diff 리뷰) |
| footer 스냅샷 테스트가 `v1.19.0`에 고정 | LOW | 의도된 변경 — 스냅샷 갱신 + diff 리뷰로 회귀 아님 확인 |
| M1이 작아 단독 PR이 과해 보임 | LOW | PRD가 독립 milestone으로 규정 + 근거 확정이라는 audit 가치 + §3.7 bump 관행 준수. M2/M3와 별도 유지(PRD 의도) |

## Acceptance
- [ ] `CLAUDE.md` §3.3 `timeout` 행이 코드(900s/15분)와 일치
- [ ] docs에 프로덕션 codex-timeout "90s/120s/2분" 거짓 주장 0 (render-lock 90s + test 픽스처는 보존)
- [ ] codex timeout *동작* 코드 변경 0 (codex-invoke.js / codex-runner.js / 명령 본문 diff 빈 출력)
- [ ] `plugin.json` `1.19.1` + footer(html.js/markdown.js) + CHANGELOG 동기 (§3.7, version drift 0)
- [ ] renderer 테스트 그린 (footer 스냅샷 갱신 포함)
- [ ] 확정 근거가 commit/PR body에 기록됨
- [ ] 패턴(코드 상수를 source of truth로)을 따름

## Observations (out of scope — 기록만)
- `codex-invoke.js`가 companion에 `--timeout-ms`를 forward하지 않는 점: foreground review는 완료까지 실행돼 `spawnSync` 900s가 실효 상한이라 현재 영향 없음. 개선이 필요해지면 별도 cycle (PRD Out-of-scope와 일치).
- 항목별 *실제* 타임스탬프 데이터 모델(M2 시각 표시의 정밀화)은 별도 PRD 후보 — M2는 plan 단위 `lastActivityMs` 근사 사용.

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2; `--impeccable-available` design-scope preamble 적용)
- 라운드 수: 1 (R1; 모든 finding MEDIUM → §5.4 ACCEPT_NOW×{HIGH,CRITICAL} 미충족, R2 escalate 없음)
- 합치 결론: codex verdict `needs-attention` 2 MEDIUM finding 모두 타당 → R1에서 plan에 흡수. timeout 동작 코드 변경 없음이라는 핵심 결론은 유지.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1a — "120s 어디에도 없음" 주장이 과장(`codex-invoke.test.js:367` 픽스처에 `--timeout-ms 120000` 존재) | MEDIUM | ACCEPT_NOW | 주장을 "프로덕션 기본/call-site 없음"으로 한정 + validation에 numeric form(`120000`/`120_000`) 추가. Evidence 표·Summary·Validation 흡수 완료 |
  | F1b — wrapper가 companion에 `--timeout-ms` forward 안 함(900s는 outer kill switch) | MEDIUM | REJECT_YAGNI | PRD Out-of-scope 명시 항목. foreground review는 완료까지 실행돼 `spawnSync` 900s가 실효 상한 → 현재 동작 영향 0. Observations에 기록 |
  | F2 — plugin.json bump 생략이 §3.7 milestone=patch 관행과 충돌(audit drift) | MEDIUM | ACCEPT_NOW | bump `1.19.0→1.19.1` + footer(html.js:1442/markdown.js:154)/CHANGELOG 동기로 변경. Files/Tasks/Risks/Acceptance 흡수 완료 |
- Deferred to backlog: 0 (F1b는 PRD Out-of-scope가 이미 관할 — backlog append 불필요)
- Open Questions: 없음 (CRITICAL/HIGH 0, auto-CRITICAL 카테고리 해당 없음)
- Codex session 참조: threadId `019f1747-c00d-78b2-a9ba-9a9ccadc2eda`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

- Design gate: impeccable Skill available, detector `design_signal=false` (no-signal) → silent-skip. 변경 표면이 doc(`CLAUDE.md`/`CHANGELOG.md`) + `.js`(renderer footer 문자열) + `plugin.json`이라 rendered UI surface 부재. critique loop / produced-diff grounding 미발화 (정상).
- Security: 해당 없음 (doc 정정 + version bump, auth/crypto/input 무관).
