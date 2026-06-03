# Implementation Report: Q1 — F4 fix-task escalation prompt inject (Option B)

## Summary

S9 dogfood F4 finding closure. `fix-task.md` escalation body가 더 이상 사용자가 직접 채워야 하는 `<original-prompt>` 리터럴을 그대로 노출하지 않는다. caller(`stop-review-loop.js`)가 transcript에서 추출한 first user prompt를 `originalPrompt`로 넘기면, [fix-task.js:145-167](../../../plugins/mccp/scripts/state/fix-task.js#L145)가 줄바꿈 normalize → **single-quote escape** → escape 결과가 140자 초과 시 truncate(`…` 접미, dangling backslash 가드 포함) → `/mccp:santa-loop '<prompt>'` 형태로 inject한다. transcript 누락/empty prompt는 기존 `<original-prompt>` 리터럴 fallback을 유지한다.

**계약**: injected substring 길이 ≤ 140자 **post-escape**. raw 기준이 아닌 escape 적용 후 기준이라는 점이 중요 — 따옴표만 가득한 입력도 boundary를 침범하지 않는다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small (변경 한 곳, ~16 LOC + 4 신규 테스트) |
| Files Changed | 2 | 2 (fix-task.js, fix-task.test.js) |
| Test count | 11 → 15 | 12 → 16 (plan의 11→15는 base count 오집계, 실제 base 12) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | fix-task.js — escalate body rewrite | Complete | [fix-task.js:145-167](../../../plugins/mccp/scripts/state/fix-task.js#L145), normalize/escape/truncate/prefix 적용 + post-fix 정정 (아래 §Post-implementation fix) |
| 2 | fix-task.test.js — 기존 escalate 단정 갱신 | Complete | line 56(prefix+quote), line 120-128(이름+escape pattern) 모두 갱신 |
| 3 | fix-task.test.js — 신규 4 케이스 추가 + 1 회귀 | Complete | truncate, null fallback, empty fallback, newline normalize + escape-overflow 회귀 |

## Post-implementation fix (Codex stop-time review catch)

1차 구현 직후 Codex stop-time review가 다음 결함을 지적:
> escaped prompts can exceed the advertised 140-character bound

**원인**: 1차 구현이 **truncate 후 escape** 순서. `flat.length ≤ 140` 이면 truncate를 skip한 뒤 escape를 적용했기 때문에, single-quote가 다수 포함된 입력(예: `"'".repeat(140)`)은 escape 후 280자가 되어 계약을 위반함.

**수정**: 순서를 **escape 먼저 → 결과 길이 기준 truncate**로 뒤집고, `slice(139)`가 `\'` pair 중간을 자르는 경우(=charAt(138)이 `\`)에 한 글자 더 줄여 dangling backslash를 방지 (cut=138 + `…`).

**회귀 잠금**: `escalation truncates after escaping so quote-heavy prompts stay ≤140 chars` 테스트 추가. 140 single-quotes 입력으로 동일 결함이 재현 시 즉시 빨강이 되도록 단정.

**계약 정정**: "≤140 chars"는 **post-escape** 기준이라는 점을 Summary 첫 단락에 명시. raw 기준으로 오해되지 않도록.

## Post-implementation fix #2 (Codex stop-time review catch — CR newlines)

`escape-before-truncate` 적용 직후 Codex가 두 번째 결함 지적:
> CR-only prompt newlines still bypass normalization

**원인**: 1차 normalization 정규식 `/\r?\n/g`은 LF/CRLF만 매치하고 **CR 단독(`\r`)은 우회**. classic Mac 줄바꿈, 일부 transcript writer가 `\r`만 사용하는 환경에서 raw `\r`이 escalation body에 그대로 leak → single-line contract 깨짐.

**수정**: 정규식을 `/[\r\n]+/g`로 확장. CR, LF, CRLF, 연속 newline run을 모두 단일 공백으로 collapse.

**회귀 잠금**: `escalation normalizes CR, CRLF, and runs of newlines to a single space` 테스트 추가. 4 케이스 (`\r`, `\r\n`, `\n\r\n`, `\r\r`)로 모든 EOL variant을 단정.

**Note**: 같은 결함이 [fix-task.js:54](../../../plugins/mccp/scripts/state/fix-task.js#L54) `oneLineExcerpt`에도 존재(failure stderr/stdout normalize에 사용). 본 fix 범위 외(Q1 계약은 escalate body 한정)지만 별도 follow-up 가치 있음 — continuation note에 노트.

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | repo에 TypeScript / lint 설정 없음 (no package.json) |
| Unit Tests — fix-task | Pass | 16/16 green |
| Regression — stop-review-loop | Pass | 13/13 green (caller가 새 escalate body에 의존하지 않음을 증명) |
| Build | N/A | 순수 Node 모듈, 빌드 단계 없음 |
| Integration | N/A | unit test가 atomic write까지 커버 |
| Edge Cases | Pass | 140자 boundary, null, empty, newline 모두 신규 테스트로 커버 |

## Files Changed

| File | Action | Lines |
|---|---|---|
| [plugins/mccp/scripts/state/fix-task.js](../../../plugins/mccp/scripts/state/fix-task.js) | UPDATE | +14 / -3 (escalate 블록만) |
| [plugins/mccp/scripts/state/tests/fix-task.test.js](../../../plugins/mccp/scripts/state/tests/fix-task.test.js) | UPDATE | +47 / -3 (기존 2개 갱신 + 신규 4개 추가) |

## Deviations from Plan

- **테스트 count 표현**: plan은 `11 → 15`로 적었으나 실제 base는 12 (12 → 16). plan 작성 시 단순 count 오기. 본 보고서가 정정함.
- **truncate 단정 방식**: plan은 "정확한 길이 검증"이라 적었고 정규식 단정도 검토했으나, 실제 구현에서는 `assert.ok(body.includes(expected))` 패턴으로 작성. 이유: `…` 문자가 regex 리터럴 안에서 escape 의 부담을 만들고, 실패 시 body 전체를 메시지로 노출해 디버그가 쉬움. 동일한 검증 강도지만 가독성이 더 높다고 판단.

## Issues Encountered

- **PostToolUse loop warning**: Edit 호출 3회가 같은 도구명이라 hook이 "stuck loop"로 오인. 실제로는 세 번 모두 다른 파일/다른 hunk(`fix-task.js` 1회 + `fix-task.test.js` 2개 hunk). 무시하고 진행. (별도 follow-up 대상은 아니지만, hook이 도구명만 매칭하고 paramaters를 differentiate하지 않는 약점이 드러남.)
- **markdownlint MD060 warnings**: plan 본문의 `|---|` separator가 compact 스타일 경고를 띄움. 기존 `.claude/plans/mccp-v0.2.plan.md`와 동일 컨벤션이라 무시.

## Tests Written

| Test | Behavior covered |
|---|---|
| `escalation prompt single quotes are escaped` | single-quote escape (변경된 wrapping을 반영, 기존 double-quote 테스트 대체) |
| `escalation prompt is truncated at 140 chars with ellipsis` | 200자 입력 → 139자 + `…` 정확한 boundary |
| `escalation falls back to literal placeholder when originalPrompt is missing` | undefined → `<original-prompt>` 리터럴 |
| `escalation falls back to literal placeholder when originalPrompt is empty` | `''` → `<original-prompt>` 리터럴 |
| `escalation normalizes newlines in original prompt to spaces` | `\n` → 공백 치환 |

## Next Steps

- [ ] `/mccp:code-review` 로 변경 review (선택)
- [ ] continuation note Q5로 진행 → v0.2.1 patch release 묶음 커밋
  - 묶을 hunks: `.gitignore`, `docs/v0.2-architecture.md`, `plugins/mccp/scripts/hooks/ecc-context-monitor.js`(이전 세션 변경, 현재는 disk 상태 동기 가능성 있음 — git status 재확인 필요), `plugins/mccp/scripts/state/fix-task.js`, `plugins/mccp/scripts/state/tests/fix-task.test.js`, `plugins/mccp/.claude-plugin/plugin.json` (0.2.0→0.2.1)
- [ ] 새 dogfood로 T-Codex-Bridge B 시나리오에서 실제 inject가 정상 동작하는지 수동 확인
