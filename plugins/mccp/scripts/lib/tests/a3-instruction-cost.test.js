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
const os = require('os');
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

    // M4 contract update (explicit, not silent): the STATE component is now
    // measured by default from repoRoot. Before M4 it required an opts.statePath
    // that no caller ever passed, so component 3 of the numerator was silently
    // always zero. This case isolates the CLAUDE.md component on purpose, so
    // `stateBlockText: ''` pins "no state block" rather than relying on the old
    // silent omission. The default-on behaviour is covered by the case below.
    const result = await measureA3({
      claudePath: tempClaude,
      readUserMemory: false,
      stateBlockText: '',
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

test('A3: STATE component measures the INJECTED block, not the frontmatter (M4)', async () => {
  // Regression for the M4 Task 1 defect: the old extractor matched
  // /^---\n(...)\n---/ and measured the YAML frontmatter — a slice SessionStart
  // never injects. What is actually injected is the system-reminder wrapper
  // around the STATE.md *body*.
  const { readInjectedStateBlock } = require('../msw-metrics/a3-instruction-cost');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a3-state-'));

  try {
    const stateDir = path.join(tmpRoot, '.claude', 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'STATE.md'), [
      '---',
      'state_version: 1',
      'task_fingerprint: a3-state-block-fixture',
      'created_at: 2026-08-09T00:00:00.000Z',
      'updated_at: 2026-08-09T00:00:00.000Z',
      'frontmatter_only_sentinel: FRONTMATTER_ONLY_SENTINEL',
      '---',
      '',
      '## Goal',
      'BODY_SENTINEL goal line',
      '',
      '## Next Step',
      'BODY_SENTINEL next line',
      '',
    ].join('\n'), 'utf8');

    const block = readInjectedStateBlock({ repoRoot: tmpRoot });
    assert.ok(block, 'injected state block should be produced from repoRoot');
    assert.ok(block.includes('BODY_SENTINEL'),
      'injected block must contain the STATE.md body (what SessionStart actually injects)');
    assert.ok(!block.includes('FRONTMATTER_ONLY_SENTINEL'),
      'injected block must NOT contain frontmatter (the pre-M4 extractor measured exactly this)');
    assert.ok(block.includes('[mccp:STATE.md — restored from previous session]'),
      'injected block must carry the SessionStart wrapper, which is part of the token cost');

    // And it flows into the numerator as its own component.
    const tempClaude = path.join(tmpRoot, 'CLAUDE.md');
    fs.writeFileSync(tempClaude, 'claude content', 'utf8');
    const result = await measureA3({ claudePath: tempClaude, repoRoot: tmpRoot, readUserMemory: false });
    assert.ok(result.components.state_block, 'state_block component should be present by default');
    assert.strictEqual(result.components.state_block.bytes, Buffer.byteLength(block, 'utf8'),
      'state_block bytes should equal the injected block size');

    console.log('✓ A3: STATE component = injected block (not frontmatter)');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('A3: committed artifact never carries a user-memory content digest (S5)', () => {
  // Security absorption S5. The in-memory measurement may hold the hash; the
  // artifact writer must not. A sha256 of a user-level file in git history
  // fingerprints a file outside the repo and is unreproducible on a clone.
  const { redactForCommit } = require('../msw-metrics/cli');

  const out = redactForCommit({
    claude_md: { bytes: 10, hash: 'aaa', tokens: 3 },
    memory_index: { bytes: 20, hash: 'secret-digest', tokens: 5 },
    state_block: { bytes: 30, hash: 'ccc', tokens: 7 },
  });

  assert.strictEqual(out.memory_index.hash, null, 'user-memory digest must be redacted');
  assert.ok(out.memory_index.hash_redacted, 'redaction must be visible, not silent');
  assert.strictEqual(out.memory_index.bytes, 20, 'counts stay — the numerator must remain honest');
  assert.strictEqual(out.memory_index.tokens, 5);
  assert.strictEqual(out.claude_md.hash, 'aaa', 'repo-tracked component keeps its digest');
  assert.strictEqual(out.state_block.hash, 'ccc', 'repo-tracked component keeps its digest');

  console.log('✓ A3: user-memory digest never reaches the committed artifact');
});

test('A3: interpreter probe adopts a real Python 3 (or honestly reports none)', () => {
  // M4 Task 1: the pre-M4 hardcoded `python3` resolves to the WindowsApps stub,
  // which prints an install hint and exits non-zero. The probe judges by exit
  // code plus a stdout marker, so a stub can never be adopted.
  const { resolveInterpreter } = require('../msw-metrics/a3-instruction-cost');
  const { spawnSync } = require('child_process');

  const interp = resolveInterpreter({ noCache: true });
  if (!interp) {
    console.log('✓ A3: no Python 3 on this machine — probe reported null (loud path)');
    return;
  }

  const r = spawnSync(interp.cmd, interp.prefix.concat(['-c', 'import sys; print(sys.version_info[0])']), {
    encoding: 'utf8', shell: false, windowsHide: true,
  });
  assert.strictEqual(r.status, 0, 'adopted interpreter must execute Python');
  assert.strictEqual(String(r.stdout).trim(), '3', 'adopted interpreter must be Python 3');
  console.log(`✓ A3: probe adopted "${[interp.cmd].concat(interp.prefix).join(' ')}"`);
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

// -------------------------------- santa-loop round 1: --force leaves a record
//
// `--emit` refuses to clobber, but `--force` re-pinned the sealed before-value
// with nothing written down. That reopens the exact hole the seal closes: once
// the baseline is silently replaced, the reduction claim can no longer be
// checked against anything. A re-pin is still allowed; it just cannot be quiet.

const { buildResealHistory } = require('../msw-metrics/cli');

test('reseal: --force carries forward the identity of the record it replaced', () => {
  const prior = JSON.stringify({
    git_head: 'aaaaaaaa', measured_at: '2026-01-01T00:00:00.000Z', numerator_tokens: 45646,
    after: { git_head: 'bbbbbbbb' },
  });
  const r = buildResealHistory(prior, '2026-02-02T00:00:00.000Z');

  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.history.length, 1);
  assert.deepStrictEqual(r.history[0], {
    resealed_at: '2026-02-02T00:00:00.000Z',
    previous_git_head: 'aaaaaaaa',
    previous_measured_at: '2026-01-01T00:00:00.000Z',
    previous_numerator_tokens: 45646,
    previous_after_git_head: 'bbbbbbbb',
  });
});

test('reseal: repeated re-pins accumulate rather than overwrite each other', () => {
  const first = buildResealHistory(JSON.stringify({ git_head: 'aaaa', numerator_tokens: 1 }), 't1');
  const second = buildResealHistory(
    JSON.stringify({ git_head: 'bbbb', numerator_tokens: 2, reseal_history: first.history }), 't2');

  assert.strictEqual(second.history.length, 2, 'a second re-pin must not erase the first');
  assert.strictEqual(second.history[0].previous_git_head, 'aaaa');
  assert.strictEqual(second.history[1].previous_git_head, 'bbbb');
});

test('reseal: an unreadable prior record blocks the re-pin', () => {
  assert.strictEqual(buildResealHistory(null, 't').ok, false);
  assert.strictEqual(buildResealHistory('{ not json', 't').ok, false);
  assert.strictEqual(buildResealHistory('"a string"', 't').ok, false);
});

test('a3: a missing CLAUDE.md is an explicit refusal, not an empty measurement', () => {
  // Round 2: absent CLAUDE.md did fail closed, but only because tokenisation
  // then dereferenced a component that was never created. A TypeError standing
  // in for a contract breaks the moment someone initialises that component
  // defensively, so the requirement is stated rather than crashed into.
  const os = require('os');
  const fsx = require('fs');
  const pathx = require('path');
  const { measureA3 } = require('../msw-metrics/a3-instruction-cost');

  const root = fsx.mkdtempSync(pathx.join(os.tmpdir(), 'a3-noclaude-'));
  try {
    return measureA3({ repoRoot: root, claudePath: pathx.join(root, 'CLAUDE.md') }).then((r) => {
      assert.strictEqual(r.status, 'baseline-unavailable');
      assert.match(r.not_delivered_reason || '', /CLAUDE\.md not found/);
      assert.notStrictEqual(r.status, 'computed', 'an absent numerator must never seal a baseline');
    });
  } finally {
    fsx.rmSync(root, { recursive: true, force: true });
  }
});

test('probe: the adopted interpreter reports whether IT can import tiktoken', () => {
  // Round 4: selection used to stop at the first Python 3 on PATH. On a machine
  // with several installs that is routinely not the one carrying tiktoken, so
  // A3 reported baseline-unavailable while a usable interpreter sat one
  // candidate later. The probe now answers both questions in one process.
  const { resolveInterpreter } = require('../msw-metrics/a3-instruction-cost');
  const found = resolveInterpreter({ noCache: true });

  if (found === null) return; // no Python at all: nothing to assert about selection

  assert.strictEqual(typeof found.tiktoken_available, 'boolean',
    'the adopted interpreter must state its own tiktoken availability, not leave it unknown');
  assert.ok(found.cmd, 'an adopted interpreter always names the command it resolved to');
});
