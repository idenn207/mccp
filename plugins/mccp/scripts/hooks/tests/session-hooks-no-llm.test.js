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

test('session-end: A2 context null-emitted at producer boundary, not read from unverified latest-wins (PF3)', () => {
  // msw-m2-measurement-honesty-downgrade (Plan-Codex R1 PF3, Codex R3 next_steps):
  // session-end must NOT stamp an unverified latest-wins context-current.json value onto
  // the append-only session_end event (a concurrent/stale sample would be mis-attributed
  // to the ending session). It emits null until session-bound freshness exists. This locks
  // the producer boundary so the contaminated read cannot silently return.
  const endContent = fs.readFileSync(SESSION_END_PATH, 'utf8');
  // Structural guard: the context-state module must not be imported, so no readState()
  // call can reintroduce the contaminated read. (Checking the require, not a method-name
  // string, so an explanatory comment mentioning the old API does not false-fail.)
  assert.ok(
    !/require\(['"][^'"]*context-state['"]\)/.test(endContent),
    'session-end must not import context-state (the unverified latest-wins reader) — PF3'
  );
  assert.ok(
    /const contextRemainingPct = null/.test(endContent),
    'session-end must emit null context_remaining_pct until session-bound freshness exists (PF3)'
  );
});
