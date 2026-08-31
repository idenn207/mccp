'use strict';

// Codex R3 F4: session-start + session-end hooks가 LLM 호출을 하지 않는지 확인.
//
// 수정된 hook과 신규 lib이 LLM 모듈(codex-invoke, briefing, Skill, Agent)을
// 절대 호출하지 않는지 grep으로 검사.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// 모듈 경로
const SESSION_START_PATH = path.resolve(__dirname, '../session-start.js');
const SESSION_END_PATH = path.resolve(__dirname, '../session-end.js');

test('session-hooks-no-llm: grep denylist in modified hooks', () => {
  // session-start.js에 LLM 호출이 없는지 확인
  const startContent = fs.readFileSync(SESSION_START_PATH, 'utf8');
  assert.ok(!startContent.includes('codex-invoke'), 'session-start should not require codex-invoke');
  assert.ok(!startContent.includes('briefing/invoke'), 'session-start should not require briefing');
  assert.ok(!startContent.includes("Skill("), 'session-start should not call Skill');
  assert.ok(!startContent.includes("Agent("), 'session-start should not call Agent');

  // session-end.js에 LLM 호출이 없는지 확인
  const endContent = fs.readFileSync(SESSION_END_PATH, 'utf8');
  assert.ok(!endContent.includes('codex-invoke'), 'session-end should not require codex-invoke');
  assert.ok(!endContent.includes('briefing/invoke'), 'session-end should not require briefing');
  assert.ok(!endContent.includes("Skill("), 'session-end should not call Skill');
  assert.ok(!endContent.includes("Agent("), 'session-end should not call Agent');
});

test('session-hooks-no-llm: msw-events + toggle-snapshot + handoff-items no LLM', () => {
  // 신규 lib도 확인
  const mswPath = path.resolve(__dirname, '../../state/msw-events.js');
  const mswContent = fs.readFileSync(mswPath, 'utf8');
  assert.ok(!mswContent.includes('codex-invoke'));
  assert.ok(!mswContent.includes('Agent('));
  assert.ok(!mswContent.includes('Skill('));

  const togglePath = path.resolve(__dirname, '../../state/toggle-snapshot.js');
  const toggleContent = fs.readFileSync(togglePath, 'utf8');
  assert.ok(!toggleContent.includes('codex-invoke'));
  assert.ok(!toggleContent.includes('Agent('));
  assert.ok(!toggleContent.includes('Skill('));

  const handoffPath = path.resolve(__dirname, '../../state/handoff-items.js');
  const handoffContent = fs.readFileSync(handoffPath, 'utf8');
  assert.ok(!handoffContent.includes('codex-invoke'));
  assert.ok(!handoffContent.includes('Agent('));
  assert.ok(!handoffContent.includes('Skill('));
});

test('session-end: A2 context is read ONLY through the session-bound gate, never latest-wins (M8 DD6)', () => {
  // **PF3의 계승이지 폐기가 아니다.** msw-m2-measurement-honesty-downgrade는
  // `session-end`가 세션 귀속도 신선도도 없는 latest-wins 스냅샷을 그대로 stamp하는
  // 것을 막으려고 `readState()` import 자체를 금지했다. 그 금지는 당시 유일하게
  // 가능한 구조적 방어였다 — 귀속을 판정할 수단이 스키마에 없었기 때문이다.
  //
  // M8 Task 6이 그 수단을 만들었다(`context-state`에 `session_id` 보존 +
  // `resolveSessionBoundPct`). 그래서 이 test가 지키는 명제도 옮겨간다:
  // "context-state를 부르지 마라"가 아니라 **"latest-wins reader를 부르지 마라"**다.
  // 원래 금지의 대상은 모듈이 아니라 **무검증 read**였다.
  const endContent = fs.readFileSync(SESSION_END_PATH, 'utf8');

  // (1) 무검증 reader는 여전히 금지다. 직접 부르면 귀속 판정을 건너뛰고 남의 세션
  //     샘플을 stamp할 수 있다 — PF3가 막은 바로 그 경로다.
  //
  //     **주석은 스캔에서 제외한다.** 원 test가 이미 같은 함정을 적어 두었다 —
  //     'so an explanatory comment mentioning the old API does not false-fail'.
  //     이 파일의 M8 주석은 옛 API 이름을 설명을 위해 인용하므로, 코드 줄만 본다.
  const codeLines = endContent.split(/\r?\n/)
    .filter(function (l) { const t = l.trim(); return t.indexOf('//') !== 0 && t.indexOf('*') !== 0; })
    .join('\n');
  //     **지역 변수명에 결속하지 않는다** (local review M2): `contextState.readState(`
  //     로 좁히면 `cs.readState()` 나 `require('../lib/context-state').readState()`
  //     가 그대로 통과한다. 금지 대상은 특정 이름이 아니라 **그 호출 자체**이므로
  //     수신자와 무관하게 `.readState(` 를 본다. session-end는 이 API를 정당하게
  //     부를 이유가 없다 — 유일한 sanctioned read는 (2)의 게이트다.
  assert.ok(
    !/\.readState\s*\(/.test(codeLines),
    'session-end must NOT call the raw latest-wins reader on any receiver — that is the contaminated path PF3 closed'
  );

  // (2) 값은 세션 바인딩 게이트를 통해서만 들어온다.
  assert.ok(
    /resolveSessionBoundPct\s*\(/.test(endContent),
    'the only sanctioned read is the session-bound + freshness gate (M8 DD6)'
  );

  // (3) 게이트가 거절하면 결과는 여전히 null이다 — 강등을 되돌린 것이 아니라
  //     강등이 요구한 조건을 충족시킨 것이므로, 미충족 시 동작은 불변이어야 한다.
  assert.ok(
    /contextRemainingPct = null/.test(endContent),
    'a refused attribution must still emit null, exactly as the downgrade did'
  );
});
