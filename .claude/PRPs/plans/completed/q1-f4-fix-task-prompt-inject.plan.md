# Plan: Q1 — F4 fix-task escalation prompt inject (Option B)

**Source**: `.claude/notes/mccp-v0.2-continuation.md` §1 Q1
**Selected Milestone**: v0.2.1 patch (S9 dogfood F4 close-out)
**Complexity**: Small

## Summary

S9 dogfood F4 finding의 closure. fix-task.md escalation 섹션이 현재 `<original-prompt>` 리터럴을 그대로 노출해 사용자가 직접 채워야 하는 friction을 해결한다. caller([stop-review-loop.js:225,246](../../plugins/mccp/scripts/hooks/stop-review-loop.js#L225))가 이미 transcript에서 추출한 first user prompt를 `originalPrompt`로 넘기고 있으므로, [fix-task.js:145-151](../../plugins/mccp/scripts/state/fix-task.js#L145)의 escalation 본문 생성 로직 한 곳을 수정하면 끝난다. Option B = bounded inject + truncate.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | [fix-task.js:21-22](../../plugins/mccp/scripts/state/fix-task.js#L21) | `lowerCamel` 함수, 파일 내부 helper는 module exports 없이 모듈-private |
| Errors | [fix-task.js:189-195](../../plugins/mccp/scripts/state/fix-task.js#L189) | I/O는 atomic temp+rename, 실패 시 cleanup unlink로 부분 상태 방지 |
| Logging | (없음) | fix-task 빌드 경로는 logging을 쓰지 않음 — 순수 변환 함수. 그대로 유지 |
| Data access | [fix-task.js:52-57](../../plugins/mccp/scripts/state/fix-task.js#L52) `oneLineExcerpt` | "줄바꿈→공백 normalize + 200자 cap + `…` append" 패턴 — F4 truncate가 정확히 이 패턴의 변형 (140자) |
| Tests | [fix-task.test.js:1-13](../../plugins/mccp/scripts/state/tests/fix-task.test.js#L1) | `node:test` + `node:assert`, `mkdtempSync`로 임시 repo, `ft.write(repo, {...})` 후 `result.body`를 정규식으로 단정 |

기존 코드에 이미 truncate helper(`oneLineExcerpt`)가 존재 — 200자 cap에 똑같이 `…`을 사용. 새 helper를 만들지 말고 비슷한 형태로 inline에서 처리하거나 helper를 재사용한다.

## Files to Change

| File | Action | Why |
|---|---|---|
| [plugins/mccp/scripts/state/fix-task.js](../../plugins/mccp/scripts/state/fix-task.js) | UPDATE | escalate 블록(145-151)에서 firstPrompt 정규화 + 140자 truncate + single-quote inject + `/mccp:santa-loop` prefix 적용. falsy 가드는 그대로 두되 리터럴 fallback 유지 |
| [plugins/mccp/scripts/state/tests/fix-task.test.js](../../plugins/mccp/scripts/state/tests/fix-task.test.js) | UPDATE | 기존 두 escalate 테스트(line 45-57, 120-128)의 정규식 갱신 + 신규 4개 케이스 추가 |

## Tasks

### Task 1: fix-task.js — escalate body 재작성

- **Action**:
  - escalate 분기 시 `input.originalPrompt`가 truthy + 비어있지 않은 trimmed string이면 inject 경로, 아니면 리터럴 `<original-prompt>` fallback 경로로 분기
  - inject 경로: 줄바꿈(`\r?\n`)을 공백으로 치환 → trim → single-quote escape (`'` → `\'`) → 140자 초과 시 139자 + `…`로 truncate
  - prefix를 `/santa-loop`에서 `/mccp:santa-loop`로 변경
  - 따옴표 wrapping을 double quote에서 single quote로 변경
  - fallback 경로: `Next: run /mccp:santa-loop '<original-prompt>'` 형태로 그대로 출력 (single quote, mccp prefix 일관성 유지)
- **Mirror**: [fix-task.js:52-57](../../plugins/mccp/scripts/state/fix-task.js#L52) `oneLineExcerpt`의 normalize+truncate+`…` 패턴
- **Validate**: `node --test plugins/mccp/scripts/state/tests/fix-task.test.js` green

### Task 2: fix-task.test.js — 기존 단정 갱신

- **Action**:
  - line 56 정규식: `/Next: run \/santa-loop "rename function"/` → `/Next: run \/mccp:santa-loop 'rename function'/`
  - line 127 단정: double-quote escape 패턴 단정을 single-quote escape (`\\'`) 패턴 단정으로 교체. originalPrompt도 `'add "noop()" function'` → `"add 'noop()' function"`으로 바꿔 single-quote escape 케이스 검증
- **Mirror**: [fix-task.test.js:45-57](../../plugins/mccp/scripts/state/tests/fix-task.test.js#L45) 기존 escalate 단정 스타일
- **Validate**: `node --test plugins/mccp/scripts/state/tests/fix-task.test.js` green

### Task 3: fix-task.test.js — 신규 4 케이스 추가

- **Action**: 다음 단정을 추가 (각 별도 `test()` 블록)
  1. **140자 truncate**: 200자 prompt 입력 → body에 139자 + `…`이 정확히 들어가는지 확인. 정확한 길이 검증
  2. **null originalPrompt fallback**: `originalPrompt` 미지정 → body에 리터럴 `<original-prompt>`이 들어가는지
  3. **empty originalPrompt fallback**: `originalPrompt: ''` → body에 리터럴 `<original-prompt>`이 들어가는지
  4. **줄바꿈 normalize**: `originalPrompt: 'first line\nsecond line'` → body에 줄바꿈이 공백으로 치환되어 `'first line second line'`이 들어가는지
- **Mirror**: [fix-task.test.js:120-128](../../plugins/mccp/scripts/state/tests/fix-task.test.js#L120) escape test 구조
- **Validate**: `node --test plugins/mccp/scripts/state/tests/fix-task.test.js` 11개 → 15개 green

## Validation

```bash
node --test plugins/mccp/scripts/state/tests/fix-task.test.js
node --test plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js
```

- `stop-review-loop.test.js`는 caller 회귀 확인용(이 task에선 변경하지 않음, but 의존 모듈이라 함께 실행)
- 수동 검증: dogfood T-Codex-Bridge B 시나리오 재현하여 `.claude/state/fix-task.md` 본문 escalation 섹션 확인

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 기존 회귀 테스트가 silently green 유지 안 됨 (line 56, 127) | High → 의도된 회귀 | Task 2에서 명시적 갱신. PR review 시 정규식 diff로 확인 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| 누군가 transcript에 시크릿 포함 → 140자 잘림이 부분 시크릿 노출 | Low | 140자 자체가 mitigation. 그 이상의 작업은 v0.3 redaction layer로 분리(out of scope) |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| `/santa-loop` 호출 스크립트/문서가 다른 곳에 남아있어 `/mccp:santa-loop`와 불일치 | Medium | grep으로 잔재 확인, 본 plan 범위 외라면 별도 follow-up 이슈 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| single-quote escape 한국어 etc 특수문자에서 깨짐 | Low | `replace(/'/g, "\\'")` 한 단계로 충분. 정규식 단위 케이스 추가 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->

## Acceptance

- [ ] `node --test plugins/mccp/scripts/state/tests/fix-task.test.js` 15/15 green
- [ ] `node --test plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js` 회귀 없음
- [ ] [fix-task.js:145-151](../../plugins/mccp/scripts/state/fix-task.js#L145) 변경 외 다른 함수/모듈에 영향 없음 (`module.exports` 동일)
- [ ] 기존 두 escalate 테스트가 신규 패턴으로 갱신됨 (회귀 단정 = 신규 동작)
- [ ] 수동: T-Codex-Bridge B 시나리오 시 `.claude/state/fix-task.md` 본문에 리터럴 prompt가 single-quote로 inject되고, 200자 입력 시 140자에 `…`로 절단됨

## Codex Adversarial Review

> Codex unavailable, skipped (auto-fallback): `codex:adversarial-review` skill is blocked by harness `disable-model-invocation`; Skill tool cannot delegate to it in this environment.

## Codex Implementation Review

> Codex unavailable, skipped (auto-fallback): same harness-level block as Plan-Codex gate. Implement-time decision-set captured inline:
>
> - **Helper reuse**: `oneLineExcerpt` already does the 200-char/`…` pattern; for 140-char escalate inject, write an inline normalize+truncate next to the existing helper rather than parameterizing it — avoids changing the established 200-char contract used by `summarizeFailures`.
> - **140-char boundary**: cap = 139 chars + `…` (so total visible width ≤ 140). Mirrors `oneLineExcerpt`'s 199 + `…` arithmetic.
> - **Single-quote escape**: `replace(/'/g, "\\'")` in JS source — produces literal `\'` inside the YAML/markdown body. Acceptable because the inject lands in a markdown command-line example, not a YAML scalar.
> - **Cross-gate dedupe applied** for plan-level decisions (140-char cap, single quote, `/mccp:santa-loop` prefix) — these were already pinned in continuation note Q1 and re-stated in this plan; no Codex pass needed to re-litigate.
> - **Session ref**: N/A (Codex skipped)
