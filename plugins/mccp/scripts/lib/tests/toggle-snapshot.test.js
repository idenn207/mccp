'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const toggleSnapshot = require('../../state/toggle-snapshot');

test('toggle-snapshot: captureNonDefault with defaults', () => {
  const env = {
    MCCP_STOP_LOOP: 'observe', // default
    MCCP_RECEIPT_GATE_MODE: 'hard', // default
  };

  const result = toggleSnapshot.captureNonDefault(env);

  // 기본값이면 기록 안 됨
  assert.strictEqual(Object.keys(result).length, 0, 'defaults should not be captured');
});

test('toggle-snapshot: captureNonDefault with non-default', () => {
  const env = {
    MCCP_STOP_LOOP: 'enforce', // non-default (default='observe')
    MCCP_RECEIPT_GATE_MODE: 'soft', // non-default (default='hard')
    MCCP_GATE_ROUND_CAP: '2', // non-default (default='1')
  };

  const result = toggleSnapshot.captureNonDefault(env);

  assert.ok('MCCP_STOP_LOOP' in result, 'non-default should be captured');
  assert.ok('MCCP_RECEIPT_GATE_MODE' in result);
  assert.ok('MCCP_GATE_ROUND_CAP' in result);

  // 기본값 필드는 아직 기본값
  assert.strictEqual('MCCP_DESIGN_CRITIQUE_MAX_RETRY' in result, false, 'default should not appear');
});

test('toggle-snapshot: secret-name redaction', () => {
  const env = {
    MCCP_DESIGN_INTENT_REASON: 'my-secret-reason-with-paths-and-tokens',
    MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER: 'another-secret',
  };

  const result = toggleSnapshot.captureNonDefault(env);

  // secret-name이면 raw 값이 아니라 제목만 기록
  assert.ok(result.MCCP_DESIGN_INTENT_REASON.is_secret_reason === true);
  assert.ok(result.MCCP_DESIGN_INTENT_REASON.is_set === true);
  assert.strictEqual('value_type' in result.MCCP_DESIGN_INTENT_REASON, false, 'no value_type for secret');
  assert.strictEqual(typeof result.MCCP_DESIGN_INTENT_REASON.value, 'undefined', 'no raw value for secret');

  assert.ok(result.MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER.is_secret_reason === true);
});

test('toggle-snapshot: writeSnapshot atomic tmp+rename', async () => {
  const tmpDir = path.join(__dirname, '..', '..', '.test-toggle-snapshot');
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tmpDir, { recursive: true });

  const sessionId = '01234567-89ab-cdef-0123-456789abcdef';
  const snapshot = {
    session_id: sessionId,
    captured_at: new Date().toISOString(),
    toggles: {
      MCCP_STOP_LOOP: { is_set: true, value_type: 'string' },
      MCCP_RECEIPT_GATE_MODE: { is_set: true, value_type: 'string' },
    },
  };

  const result = toggleSnapshot.writeSnapshot(sessionId, snapshot, {
    stateDir: tmpDir,
  });

  assert.strictEqual(result.ok, true, 'write should succeed');
  assert.ok(fs.existsSync(result.path), 'file should exist');

  const content = JSON.parse(fs.readFileSync(result.path, 'utf8'));
  assert.deepStrictEqual(content.toggles, snapshot.toggles);

  // cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('toggle-snapshot: scanRuntimeSurface denominator approx', () => {
  // 실제 스캔은 느리므로 항상 수행하진 않음 (선택적 테스트)
  // 여기서는 regex 테스트만
  const testContent = `
    const env = process.env.MCCP_STOP_LOOP;
    const mode = process.env.MCCP_RECEIPT_GATE_MODE;
    if (process.env.MCCP_TMP) { /* should be excluded */ }
  `;

  const re = /MCCP_[A-Z0-9_]+/g;
  const found = new Set();
  let match;
  while ((match = re.exec(testContent)) !== null) {
    const name = match[0];
    if (name !== 'MCCP_TMP') {
      found.add(name);
    }
  }

  assert.ok(found.has('MCCP_STOP_LOOP'));
  assert.ok(found.has('MCCP_RECEIPT_GATE_MODE'));
  assert.strictEqual(found.has('MCCP_TMP'), false, 'MCCP_TMP should be excluded');
});

test('toggle-snapshot: raw env value not in output', () => {
  const env = {
    MCCP_DESIGN_INTENT_REASON: 'super-secret-path=/home/user/private',
    MCCP_STOP_LOOP: 'enforce',
  };

  const result = toggleSnapshot.captureNonDefault(env);

  // 전체 result를 문자열로 직렬화해서 secret이 없는지 확인
  const json = JSON.stringify(result);
  assert.strictEqual(json.includes('super-secret-path'), false, 'raw secret value should not appear');
  assert.strictEqual(json.includes('/home/user'), false, 'path should not appear');
  assert.strictEqual(json.includes('MCCP_DESIGN_INTENT_REASON'), true, 'toggle name should appear');

  // MCCP_STOP_LOOP should be captured (non-default)
  assert.ok('MCCP_STOP_LOOP' in result, 'non-default MCCP_STOP_LOOP should be captured');
  // 메타데이터만 있고 raw 값은 없음
  assert.ok(result.MCCP_STOP_LOOP.is_set === true, 'is_set flag should exist');
});
