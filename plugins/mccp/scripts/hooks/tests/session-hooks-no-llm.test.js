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
