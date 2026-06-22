'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const detector = require('../deep-research-detect');

const DETECT_JS = path.resolve(__dirname, '..', 'deep-research-detect.js');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const FALSE_POSITIVE_FIXTURE = path.join(REPO_ROOT, '.claude', 'prds', 'v1-4-0-automation-modernization.prd.md');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-deep-research-detect-'));
  try { return fn(dir); }
  finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) {} }
}

function withEnv(overrides, fn) {
  const saved = {};
  for (const k of Object.keys(overrides)) {
    saved[k] = process.env[k];
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  try { return fn(); }
  finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

// === Scenario 1: availability env override tristate (3 paths) ===

test('S1a: env override "available" → availability=available', () => {
  withEnv({ MCCP_DEEP_RESEARCH_SKILL: 'available' }, () => {
    assert.strictEqual(detector.probeAvailability({}), 'available');
  });
});

test('S1b: env override "missing" → availability=missing', () => {
  withEnv({ MCCP_DEEP_RESEARCH_SKILL: 'missing' }, () => {
    assert.strictEqual(detector.probeAvailability({}), 'missing');
  });
});

test('S1c: env override "unknown" → availability=unknown', () => {
  withEnv({ MCCP_DEEP_RESEARCH_SKILL: 'unknown' }, () => {
    assert.strictEqual(detector.probeAvailability({}), 'unknown');
  });
});

// Build an isolated three-level settings path set inside a temp dir.
function isolatedSettings(dir, contents) {
  const c = contents || {};
  const out = {
    managedPath: path.join(dir, 'managed-settings.json'),
    userPath: path.join(dir, 'user-settings.json'),
    projectPath: path.join(dir, 'project-settings.json'),
  };
  for (const lvl of ['managed', 'user', 'project']) {
    if (c[lvl] !== undefined) {
      fs.writeFileSync(out[lvl + 'Path'], JSON.stringify(c[lvl]), 'utf8');
    }
  }
  return out;
}

test('S1d: no env + no workflow signal → default=unknown (phantom-안내-금지)', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, {});
    withEnv({ MCCP_DEEP_RESEARCH_SKILL: undefined, CLAUDE_CODE_DISABLE_WORKFLOWS: undefined }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'unknown');
    });
  });
});

test('S1e: no env + disableWorkflows:true → missing (workflows signal)', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, { user: { disableWorkflows: true } });
    withEnv({ MCCP_DEEP_RESEARCH_SKILL: undefined, CLAUDE_CODE_DISABLE_WORKFLOWS: undefined }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'missing');
    });
  });
});

test('S1f: no env + enableWorkflows:true → available (workflows signal)', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, { user: { enableWorkflows: true } });
    withEnv({ MCCP_DEEP_RESEARCH_SKILL: undefined, CLAUDE_CODE_DISABLE_WORKFLOWS: undefined }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'available');
    });
  });
});

// === Scenario 2: false-positive — evidence-rich PRD + keyword → signal=false ===

test('S2: false-positive — current repo PRD (evidence-rich) → research_signal=false', () => {
  if (!fs.existsSync(FALSE_POSITIVE_FIXTURE)) {
    // Skip if running on a checkout where the fixture has been archived.
    return;
  }
  withEnv({ MCCP_DEEP_RESEARCH_SKILL: 'available' }, () => {
    const result = detector.detect({
      mode: 'prd',
      planPath: path.relative(REPO_ROOT, FALSE_POSITIVE_FIXTURE),
      repoRoot: REPO_ROOT,
    });
    assert.strictEqual(result.availability, 'available');
    assert.strictEqual(result.research_signal, false);
    assert.strictEqual(result.reason, 'no-signal');
  });
});

// === Scenario 3: Assumption marker + keyword → signal=true ===

test('S3: Assumption marker + keyword → research_signal=true (reason=ok)', () => {
  const body = '# PRD\n\n## Problem\nfoo\n\n## Evidence\n\nAssumption — needs validation via external research.\n\n## Users\nbar';
  withEnv({ MCCP_DEEP_RESEARCH_SKILL: 'available' }, () => {
    const result = detector.detect({ mode: 'prd', body: body });
    assert.strictEqual(result.research_signal, true);
    assert.strictEqual(result.reason, 'ok');
  });
});

// === Scenario 4: empty Evidence with only "TBD —" → signal=true ===

test('S4: Evidence section with only "TBD —" placeholder + keyword → signal=true', () => {
  const body = '# PRD\n\n## Problem\nWe need a research spec.\n\n## Evidence\n\nTBD — needs validation via user research\n\n## Users\nbar';
  withEnv({ MCCP_DEEP_RESEARCH_SKILL: 'available' }, () => {
    const result = detector.detect({ mode: 'prd', body: body });
    assert.strictEqual(result.research_signal, true);
    assert.strictEqual(result.reason, 'ok');
  });
});

test('S4b: completely empty Evidence section + keyword in body → signal=true', () => {
  const body = '# PRD\n\n## Problem\nWe need research on standards.\n\n## Evidence\n\n## Users\nbar';
  withEnv({ MCCP_DEEP_RESEARCH_SKILL: 'available' }, () => {
    const result = detector.detect({ mode: 'prd', body: body });
    assert.strictEqual(result.research_signal, true);
  });
});

// === Scenario 5: path traversal ===

test('S5a: relative path traversal → reason=path-traversal, exit 0 semantics', () => {
  withTempDir((dir) => {
    withEnv({ MCCP_DEEP_RESEARCH_SKILL: 'available' }, () => {
      const result = detector.detect({
        mode: 'prd',
        planPath: '../../../etc/passwd',
        repoRoot: dir,
      });
      assert.strictEqual(result.reason, 'path-traversal');
      assert.strictEqual(result.research_signal, false);
      assert.deepStrictEqual(result.signal_files, []);
    });
  });
});

test('S5b: absolute path outside repo → reason=path-traversal', () => {
  withTempDir((dir) => {
    withTempDir((outsideDir) => {
      const outside = path.join(outsideDir, 'evil.md');
      fs.writeFileSync(outside, '# evil', 'utf8');
      withEnv({ MCCP_DEEP_RESEARCH_SKILL: 'available' }, () => {
        const result = detector.detect({
          mode: 'prd',
          planPath: outside,
          repoRoot: dir,
        });
        assert.strictEqual(result.reason, 'path-traversal');
      });
    });
  });
});

// === Scenario 6: --stdin first-class entry (spawnSync) ===

test('S6: --stdin input path — body via pipe, --plan omitted', () => {
  const body = '## Evidence\n\nAssumption — needs validation via external research.';
  const result = spawnSync('node', [DETECT_JS, 'detect', '--mode', 'prd', '--stdin', '--json'], {
    input: body,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { MCCP_DEEP_RESEARCH_SKILL: 'available' }),
  });
  assert.strictEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.availability, 'available');
  assert.strictEqual(parsed.research_signal, true);
  assert.strictEqual(parsed.mode, 'prd');
  assert.strictEqual(parsed.reason, 'ok');
});

test('S6b: --stdin with empty body → research_signal=false (reason=no-signal)', () => {
  const result = spawnSync('node', [DETECT_JS, 'detect', '--mode', 'prd', '--stdin', '--json'], {
    input: '',
    encoding: 'utf8',
    env: Object.assign({}, process.env, { MCCP_DEEP_RESEARCH_SKILL: 'available' }),
  });
  assert.strictEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.research_signal, false);
  assert.strictEqual(parsed.reason, 'no-signal');
});

// === Scenario 7: mode-mismatch (non-prd modes) ===

test('S7: mode=plan → mode-mismatch (M1 supports prd only)', () => {
  withEnv({ MCCP_DEEP_RESEARCH_SKILL: 'available' }, () => {
    const result = detector.detect({ mode: 'plan' });
    assert.strictEqual(result.reason, 'mode-mismatch');
    assert.strictEqual(result.mode, null);
  });
});

test('S7b: mode=implement → mode-mismatch', () => {
  const result = detector.detect({ mode: 'implement' });
  assert.strictEqual(result.reason, 'mode-mismatch');
  assert.strictEqual(result.mode, null);
});

test('S7c: missing mode → mode-mismatch', () => {
  const result = detector.detect({});
  assert.strictEqual(result.reason, 'mode-mismatch');
});

// === Scenario 8: env override beats settings signal ===

test('S8: env override "missing" beats enableWorkflows settings signal', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, { user: { enableWorkflows: true } });
    withEnv({ MCCP_DEEP_RESEARCH_SKILL: 'missing', CLAUDE_CODE_DISABLE_WORKFLOWS: undefined }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'missing');
    });
  });
});

test('S8b: env override "available" wins even with disableWorkflows settings signal', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, { user: { disableWorkflows: true } });
    withEnv({ MCCP_DEEP_RESEARCH_SKILL: 'available', CLAUDE_CODE_DISABLE_WORKFLOWS: '1' }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'available');
    });
  });
});

test('S8c: enableWorkflows at project level + no env → available', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, { project: { enableWorkflows: true } });
    withEnv({ MCCP_DEEP_RESEARCH_SKILL: undefined, CLAUDE_CODE_DISABLE_WORKFLOWS: undefined }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'available');
    });
  });
});

test('S8d: disableWorkflows at managed beats enableWorkflows at user → missing', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, {
      managed: { disableWorkflows: true },
      user: { enableWorkflows: true },
    });
    withEnv({ MCCP_DEEP_RESEARCH_SKILL: undefined, CLAUDE_CODE_DISABLE_WORKFLOWS: undefined }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'missing');
    });
  });
});

// === Heuristic unit tests ===

test('hasEvidenceGap: Assumption marker triggers gap=true', () => {
  assert.strictEqual(detector.hasEvidenceGap('Assumption — needs validation via user research'), true);
  assert.strictEqual(detector.hasEvidenceGap('Assumption -- needs validation via foo'), true);
});

test('hasEvidenceGap: rich evidence section returns false', () => {
  const body = '## Evidence\n- bullet 1 with content\n- bullet 2 with detail\n- bullet 3 with sources\n\n## Users';
  assert.strictEqual(detector.hasEvidenceGap(body), false);
});

test('hasResearchKeyword: word boundary on English keywords', () => {
  assert.strictEqual(detector.hasResearchKeyword('specification ABI'), false);
  assert.strictEqual(detector.hasResearchKeyword('I need a spec'), true);
  assert.strictEqual(detector.hasResearchKeyword('researcher reviewing'), false);
  assert.strictEqual(detector.hasResearchKeyword('deep-research integration'), true);
});

test('hasResearchKeyword: Korean keywords via literal substring', () => {
  assert.strictEqual(detector.hasResearchKeyword('이건 표준 명세입니다'), true);
  assert.strictEqual(detector.hasResearchKeyword('외부 조사가 필요'), true);
  assert.strictEqual(detector.hasResearchKeyword('리서치 결과'), true);
  assert.strictEqual(detector.hasResearchKeyword('이건 일반 본문'), false);
});

test('computeResearchSignal: AND-gate enforced', () => {
  const evidenceGapOnly = 'Assumption — needs validation via user feedback (no keyword)';
  assert.strictEqual(detector.computeResearchSignal(evidenceGapOnly), false);

  const keywordOnly = 'We have a standard. Evidence section is rich.\n## Evidence\n- bullet';
  assert.strictEqual(detector.computeResearchSignal(keywordOnly), false);

  const both = 'Assumption — needs validation via external research';
  assert.strictEqual(detector.computeResearchSignal(both), true);
});
