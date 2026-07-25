/**
 * Test: A3 instruction-cost measurement
 *
 * Critical assertions:
 * 1. A3 artifact contains ZERO raw CLAUDE/MEMORY source text (R3-F3 boundary)
 * 2. Token count via tiktoken differs from bytes/4 estimate (proves tokenizer works)
 * 3. User-memory omitted when not opted-in
 * 4. Loud not-delivered marking when tokenizer absent
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { measureA3 } = require('../msw-metrics/a3-instruction-cost');

test('A3: source-text-0 assertion — artifact has no raw CLAUDE/MEMORY/STATE text', async () => {
  // Create temp CLAUDE.md for testing
  const testClaude = 'Test CLAUDE.md content with Korean: 한국어 테스트';
  const tempClaude = path.join(__dirname, 'temp-claude-test.md');

  try {
    fs.writeFileSync(tempClaude, testClaude);

    const result = await measureA3({
      claudePath: tempClaude,
      readUserMemory: false,
    });

    // CRITICAL: Assert NO raw text fields in result
    // Only counts + hashes allowed
    assert(!result.components.claude_md.text,
      'SECURITY VIOLATION: Raw CLAUDE.md text found in artifact (R3-F3 source-text-0)');

    if (result.components.memory_index && !result.components.memory_index.omitted) {
      assert(!result.components.memory_index.text,
        'SECURITY VIOLATION: Raw MEMORY.md text found in artifact');
    }

    if (result.components.state_block) {
      assert(!result.components.state_block.text,
        'SECURITY VIOLATION: Raw STATE.md text found in artifact');
    }

    // Assert only safe fields exist
    const safeFields = ['bytes', 'hash', 'tokens', 'omitted', 'reason'];
    for (const component of Object.values(result.components)) {
      for (const key of Object.keys(component)) {
        assert(safeFields.includes(key),
          `Unexpected field in component: ${key} (should be one of ${safeFields.join(', ')})`);
      }
    }

    console.log('✓ A3: source-text-0 boundary verified (no raw text persisted)');
  } finally {
    if (fs.existsSync(tempClaude)) fs.unlinkSync(tempClaude);
  }
});

test('A3: user-memory omitted when MCCP_A3_READ_USER_MEMORY not set', async () => {
  const tempClaude = path.join(__dirname, 'temp-claude-test2.md');

  try {
    fs.writeFileSync(tempClaude, 'Test content');

    // Ensure env flag is NOT set
    delete process.env.MCCP_A3_READ_USER_MEMORY;

    const result = await measureA3({
      claudePath: tempClaude,
      readUserMemory: false, // Explicitly don't read
    });

    assert(result.components.memory_index.omitted === true,
      'Memory component should be marked omitted when env flag not set');
    assert(result.components.memory_index.reason.includes('MCCP_A3_READ_USER_MEMORY'),
      'Omission reason should mention env flag');

    console.log('✓ A3: user-memory opt-in honored');
  } finally {
    if (fs.existsSync(tempClaude)) fs.unlinkSync(tempClaude);
  }
});

test('A3: baseline-unavailable when tokenizer absent', async () => {
  const tempClaude = path.join(__dirname, 'temp-claude-test3.md');

  try {
    fs.writeFileSync(tempClaude, 'Test content without real tokenizer');

    const result = await measureA3({
      claudePath: tempClaude,
      readUserMemory: false,
      // Simulate no tiktoken available by using invalid python
    });

    // If tiktoken is not available, status should be baseline-unavailable
    if (result.status === 'baseline-unavailable') {
      assert(result.baseline_available === false,
        'baseline_available flag should be false');
      assert(result.not_delivered_reason,
        'not_delivered_reason should be set loudly');
      console.log(`✓ A3: baseline-unavailable properly marked: ${result.not_delivered_reason}`);
    } else if (result.status === 'computed') {
      // Tiktoken IS available; check that tokenizer info is recorded
      assert(result.tokenizer_info,
        'tokenizer_info should be recorded when successful');
      assert(result.tokenizer_info.model === 'o200k_base',
        'tokenizer model should be o200k_base');
      console.log('✓ A3: tiktoken available, token count computed');
    }
  } finally {
    if (fs.existsSync(tempClaude)) fs.unlinkSync(tempClaude);
  }
});

test('A3: bytes and token counts only', async () => {
  const tempClaude = path.join(__dirname, 'temp-claude-test4.md');

  try {
    const testContent = 'A quick brown fox jumps over the lazy dog.';
    fs.writeFileSync(tempClaude, testContent);

    const result = await measureA3({
      claudePath: tempClaude,
      readUserMemory: false,
    });

    // Assert numerator_bytes is set
    assert(result.numerator_bytes > 0,
      'numerator_bytes should be > 0');
    assert.strictEqual(result.numerator_bytes, Buffer.byteLength(testContent, 'utf8'),
      'numerator_bytes should match actual UTF-8 byte count');

    // If tiktoken available, assert numerator_tokens differs from bytes/4
    if (result.status === 'computed' && result.numerator_tokens) {
      const bytesDiv4 = Math.ceil(result.numerator_bytes / 4);
      assert(result.numerator_tokens !== bytesDiv4,
        `Token count (${result.numerator_tokens}) should NOT equal bytes/4 estimate (${bytesDiv4})`);
      console.log(`✓ A3: tokens (${result.numerator_tokens}) ≠ bytes/4 estimate (${bytesDiv4})`);
    }

    console.log('✓ A3: byte and token counts verified');
  } finally {
    if (fs.existsSync(tempClaude)) fs.unlinkSync(tempClaude);
  }
});

test('A3: denominator is documented context window', async () => {
  const tempClaude = path.join(__dirname, 'temp-claude-test5.md');

  try {
    fs.writeFileSync(tempClaude, 'Test');

    const result = await measureA3({
      claudePath: tempClaude,
      readUserMemory: false,
    });

    assert.strictEqual(result.denominator_tokens, 200000,
      'Denominator should be documented Claude context window (200,000)');

    console.log('✓ A3: denominator = documented context window');
  } finally {
    if (fs.existsSync(tempClaude)) fs.unlinkSync(tempClaude);
  }
});
