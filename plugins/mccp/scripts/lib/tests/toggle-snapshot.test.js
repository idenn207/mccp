'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const toggleSnapshot = require('../../state/toggle-snapshot');

// plugins/mccp/scripts/lib/tests -> five levels up is the repo root. Getting
// this wrong resolves to `plugins/`, where the scan finds nothing and an
// existence-guarded assertion would pass while checking nothing.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

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

// ---------------------------------------------------------------- M4 Task 5

test('M4: exclusions are NAMED, evidenced, and reported as two denominators', () => {
  const d = toggleSnapshot.scanSurfaceDetailed(REPO_ROOT);

  assert.ok(d.raw_surface_count > 0, 'raw surface should be non-empty');
  assert.strictEqual(
    d.toggle_count, d.raw_surface_count - d.excluded.length,
    'the two denominators must differ by exactly the exclusion count — that identity is what stops ' +
    'a named exclusion from reading as a retirement'
  );

  // measurement-design.md §B3: "제외는 이 목록에 이름을 적을 때만 유효하다."
  d.excluded.forEach((e) => {
    assert.ok(toggleSnapshot.TOGGLE_EXCLUSIONS[e.name], `${e.name} must be a named exclusion`);
    assert.ok(e.evidence && e.evidence.length > 20, `${e.name} must carry file:line evidence`);
    assert.ok(toggleSnapshot.EXCLUSION_CLASSES.includes(e.class), `${e.name} class must be catalogued`);
  });

  // The retracted candidates stay IN the denominator: all three are both set
  // and read, so an operator can override them from outside.
  ['MCCP_PLUGIN_ROOT', 'MCCP_SESSION_ID', 'MCCP_HOOK_ID'].forEach((n) => {
    assert.strictEqual(toggleSnapshot.isExcludedToggle(n), false,
      `${n} must NOT be excluded (set+read means it is a real override axis)`);
  });
});

test('M4: a .test.js file outside tests/ does not pollute the denominator', () => {
  // Latent-defect guard. The scanner used to filter tests/ DIRECTORIES only,
  // while measurement-design.md §B3 also requires excluding `*.test.js` FILES.
  // There are zero such files today, so only a fixture can prove the rule holds.
  const os = require('os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-scan-'));
  try {
    const scriptsDir = path.join(root, 'plugins', 'mccp', 'scripts', 'lib');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, 'real.js'), 'process.env.MCCP_REAL_TOGGLE;', 'utf8');
    fs.writeFileSync(path.join(scriptsDir, 'stray.test.js'), 'process.env.MCCP_MOCK_ONLY_TOGGLE;', 'utf8');

    const found = toggleSnapshot.scanRuntimeSurface(root);
    assert.ok(found.includes('MCCP_REAL_TOGGLE'), 'production file is scanned');
    assert.strictEqual(found.includes('MCCP_MOCK_ONLY_TOGGLE'), false,
      '*.test.js outside tests/ must be excluded');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('M4: operation branch count is computed over the DENOMINATOR, not usage', () => {
  const { countOperationBranches, branchesForToggle } =
    require('../../derive/sources/toggle-usage');

  assert.strictEqual(branchesForToggle('MCCP_STOP_LOOP'), 3, 'off|observe|enforce');
  assert.strictEqual(branchesForToggle('MCCP_SOME_BOOLEAN_TOGGLE'), 2, 'boolean floor');
  assert.strictEqual(countOperationBranches(['MCCP_STOP_LOOP', 'MCCP_X']), 5);

  // The anti-gaming co-report only works over the surface: counted over the
  // numerator instead, retiring a toggle would leave the branch sum unchanged
  // and an empty usage corpus would report 0 branches for 94 live toggles.
  const s = require('../../derive/sources/toggle-usage')
    .scanToggleUsage(REPO_ROOT);
  assert.ok(s.operation_branch_count > 0,
    'branch count must be non-zero while toggles exist, regardless of usage history');
  assert.ok(s.operation_branch_count >= s.denominator * 2,
    'every toggle contributes at least the boolean floor of 2');
  assert.strictEqual(s.raw_surface_count - s.excluded_count, s.denominator,
    'both denominators are reported and consistent');
});

test('M4: writeSnapshot warns loudly on a relative stateDir', () => {
  const os = require('os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-warn-'));
  const written = [];
  const origWrite = process.stderr.write;
  process.stderr.write = (chunk) => { written.push(String(chunk)); return true; };
  const origCwd = process.cwd();
  try {
    process.chdir(root);
    toggleSnapshot.writeSnapshot('sid-rel', { toggles: {} }, { stateDir: path.join('.claude', 'state') });
  } finally {
    process.chdir(origCwd);
    process.stderr.write = origWrite;
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.match(written.join(''), /relative stateDir/,
    'a cwd-relative stateDir silently misplaced every snapshot between M2 and M4 — it must be loud');
});

// ---------------------------------------------------------------- M4 Task 6

test('M4 Task 6: SessionStart writes the snapshot under repoRoot, not cwd', () => {
  // This test goes THROUGH THE CALL SITE. The pre-M4 test called writeSnapshot
  // directly with an explicit stateDir, so it passed while session-start.js
  // omitted opts entirely and produced zero snapshots for two milestones.
  //
  // cwd is deliberately a SUBDIRECTORY of the repo: with cwd === repoRoot a
  // cwd-relative fallback lands in the right place by accident and the test
  // proves nothing.
  const os = require('os');
  const { execFileSync, spawnSync } = require('child_process');
  const SESSION_START = path.resolve(__dirname, '..', '..', 'hooks', 'session-start.js');

  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-task6-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo, stdio: 'ignore' });

    const sub = path.join(repo, 'nested', 'workdir');
    fs.mkdirSync(sub, { recursive: true });

    const r = spawnSync(process.execPath, [SESSION_START], {
      cwd: sub,
      input: '{"session_id":"m4-task6-session"}',
      encoding: 'utf8',
      timeout: 30000,
      env: Object.assign({}, process.env, {
        // resolveSessionId() reads CLAUDE_SESSION_ID, not the stdin payload.
        // Without it observerSessionId is '' and the whole M2 instrumentation
        // block is skipped — the hook would exit 0 having written nothing.
        CLAUDE_SESSION_ID: 'm4-task6-session',
        MCCP_STOP_LOOP: 'enforce',           // a non-default so the snapshot has content
        MCCP_A3_READ_USER_MEMORY: '',
      }),
    });
    assert.strictEqual(r.status, 0, 'hook must exit 0: ' + (r.stderr || ''));

    const repoStateDir = path.join(repo, '.claude', 'state');
    const cwdStateDir = path.join(sub, '.claude', 'state');

    const atRepo = fs.existsSync(repoStateDir)
      ? fs.readdirSync(repoStateDir).filter((f) => f.endsWith('.env-snapshot.json')) : [];
    const atCwd = fs.existsSync(cwdStateDir)
      ? fs.readdirSync(cwdStateDir).filter((f) => f.endsWith('.env-snapshot.json')) : [];

    assert.strictEqual(atCwd.length, 0,
      'no snapshot may be written relative to cwd (that is the CL-5 defect)');
    assert.strictEqual(atRepo.length, 1,
      'exactly one snapshot must land under repoRoot — the reader scans only there. found: ' +
      JSON.stringify({ atRepo: atRepo, atCwd: atCwd, stderr: (r.stderr || '').slice(-500) }));

    const snap = JSON.parse(fs.readFileSync(path.join(repoStateDir, atRepo[0]), 'utf8'));
    assert.ok(snap.toggles && snap.toggles.MCCP_STOP_LOOP,
      'the non-default toggle must be captured, so the numerator can actually accumulate');
    assert.strictEqual(JSON.stringify(snap).includes('enforce'), false,
      'raw env values must never be persisted');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
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

// --------------------------------------------- santa-loop round 1: G3 doc gate
//
// measurement-design.md §B3 says exclusions are only valid when NAMED there and
// that TOGGLE_EXCLUSIONS is 1:1 with that table. Nothing compared them, so the
// denominator could be changed by editing JS alone -- the exact move the
// named-exclusion rule exists to prevent. These pin the comparison.

test('exclusions: the normative table and the enforcing constant agree exactly', () => {
  const x = toggleSnapshot.crossCheckExclusions(REPO_ROOT);
  assert.deepStrictEqual(x.drift, [],
    'measurement-design.md §B3 and TOGGLE_EXCLUSIONS must stay 1:1');
  assert.strictEqual(x.ok, true);
  assert.strictEqual(x.doc_token_count, x.code_token_count);
  assert.ok(x.code_token_count > 0, 'a zero-token comparison would pass vacuously');
});

test('exclusions: a token excluded in code but absent from the table is drift', () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'excl-doc-'));
  try {
    const docRel = path.join('docs', 'multi-session-work-loop', 'measurement-design.md');
    const real = fs.readFileSync(path.join(REPO_ROOT, docRel), 'utf8');
    // Drop one named row; the constant still excludes it.
    const cut = real.split('\n').filter((ln) => ln.indexOf('`MCCP_STOP_LOOP_E2E`') === -1).join('\n');
    const cutPath = path.join(tmp, 'measurement-design.cut.md');
    fs.writeFileSync(cutPath, cut, 'utf8');

    const x = toggleSnapshot.crossCheckExclusions(REPO_ROOT, cutPath);
    assert.strictEqual(x.ok, false, 'removing a row from the table must be visible');
    assert.deepStrictEqual(x.missing_in_doc, ['MCCP_STOP_LOOP_E2E']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('exclusions: an unreadable table is drift, not a clean pass', () => {
  const x = toggleSnapshot.crossCheckExclusions(REPO_ROOT, 'docs/definitely-not-here.md');
  assert.strictEqual(x.ok, false,
    '"cannot check" must never report the same as "checked and clean"');
  assert.match(x.drift.join('\n'), /not readable/);
});

test('exclusions: the live surface carries the doc comparison beside the denominator', () => {
  const d = toggleSnapshot.scanSurfaceDetailed(REPO_ROOT);
  assert.ok(d.exclusion_doc, 'the denominator and its provenance travel together');
  assert.strictEqual(d.exclusion_doc.ok, true, JSON.stringify(d.exclusion_doc.drift));
  assert.strictEqual(d.raw_surface_count - d.toggle_count, d.excluded.length,
    'the gap between the two denominators is exactly the exclusion count');
});

test('exclusions: evidence that names a nonexistent path is drift', () => {
  // Round 4: matching the SHAPE of a path is not evidence -- `x.js` satisfies
  // any regex and points at nothing, so a row could look justified while
  // justifying nothing.
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-exist-'));
  try {
    const docRel = path.join('docs', 'multi-session-work-loop', 'measurement-design.md');
    const real = fs.readFileSync(path.join(REPO_ROOT, docRel), 'utf8');
    const doctored = real.replace(
      /(\|\s*test-only\s*\|\s*`MCCP_STOP_LOOP_E2E`\s*\|)[^|\n]*\|/,
      '$1 totally/made-up/nowhere.js:7 — fabricated |'
    );
    assert.notStrictEqual(doctored, real, 'fixture must actually alter the evidence cell');
    const f = path.join(tmp, 'doctored.md');
    fs.writeFileSync(f, doctored, 'utf8');

    const x = toggleSnapshot.crossCheckExclusions(REPO_ROOT, f);
    assert.strictEqual(x.ok, false);
    assert.strictEqual(x.bad_evidence.length, 1,
      'only the fabricated row may fail — the real rows use script-relative paths and must still resolve');
    assert.match(x.bad_evidence[0], /MCCP_STOP_LOOP_E2E/);
    assert.match(x.bad_evidence[0], /does not exist/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
