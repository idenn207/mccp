'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const detector = require('../goal-detect');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-goal-detect-'));
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

function writePrd(dir, rows, opts) {
  const o = opts || {};
  const header = '# Test PRD\n\n## Delivery Milestones\n<!-- comment -->\n\n| # | Milestone | Outcome | Status | Plan |\n|---|---|---|---|---|\n';
  let body = header;
  for (const r of rows) {
    body += `| ${r.id} | ${r.name} | ${r.outcome || 'x'} | ${r.status} | ${r.plan || '—'} |\n`;
  }
  if (o.noTable) {
    body = '# Test PRD\n\nNo milestones here.\n';
  }
  const prdPath = path.join(dir, 'prd.md');
  fs.writeFileSync(prdPath, body, 'utf8');
  return prdPath;
}

// === S1: env override × 3 ===

test('S1a: env "available" → availability=available', () => {
  withEnv({ MCCP_GOAL_FEATURE: 'available' }, () => {
    assert.strictEqual(detector.probeAvailability({}), 'available');
  });
});

test('S1b: env "missing" → availability=missing', () => {
  withEnv({ MCCP_GOAL_FEATURE: 'missing' }, () => {
    assert.strictEqual(detector.probeAvailability({}), 'missing');
  });
});

test('S1c: env "unknown" → availability=unknown', () => {
  withEnv({ MCCP_GOAL_FEATURE: 'unknown' }, () => {
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
      const data = typeof c[lvl] === 'string' ? c[lvl] : JSON.stringify(c[lvl]);
      fs.writeFileSync(out[lvl + 'Path'], data, 'utf8');
    }
  }
  return out;
}

test('S1d: no env + no hook-disable signal → default=available (goal default-on)', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, {});
    withEnv({ MCCP_GOAL_FEATURE: undefined }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'available');
    });
  });
});

test('S1e: no env + disableAllHooks:true → missing (hooks signal)', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, { user: { disableAllHooks: true } });
    withEnv({ MCCP_GOAL_FEATURE: undefined }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'missing');
    });
  });
});

test('S1f: no env + allowManagedHooksOnly:true at managed → missing (hooks signal)', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, { managed: { allowManagedHooksOnly: true } });
    withEnv({ MCCP_GOAL_FEATURE: undefined }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'missing');
    });
  });
});

test('S1g: no env + managed present-but-unreadable → unknown (policy unconfirmed downgrade)', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, { managed: '{ broken json' });
    withEnv({ MCCP_GOAL_FEATURE: undefined }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'unknown');
    });
  });
});

// === S2: in-progress + plan empty → plan-missing ===

test('S2: in-progress row + Plan cell empty → goal_signal=false + reason=plan-missing', () => {
  withTempDir((dir) => {
    const prdPath = writePrd(dir, [
      { id: 3, name: 'axis C — test', status: 'in-progress', plan: '—' },
    ]);
    withEnv({ MCCP_GOAL_FEATURE: 'available' }, () => {
      const result = detector.detect({
        mode: 'milestone-close',
        milestone: '3',
        prdPath: prdPath,
        repoRoot: dir,
      });
      assert.strictEqual(result.goal_signal, false);
      assert.strictEqual(result.reason, 'plan-missing');
      assert.strictEqual(result.signal_ref.row, 3);
    });
  });
});

// === S3: in-progress + plan filled + file exists → goal_signal=true + reason=ok ===

test('S3: in-progress row + Plan filled + plan file exists → goal_signal=true + reason=ok', () => {
  withTempDir((dir) => {
    const planFile = path.join(dir, 'plan-m3.plan.md');
    fs.writeFileSync(planFile, '# M3 plan\n', 'utf8');
    const prdPath = writePrd(dir, [
      { id: 3, name: 'axis C — test', status: 'in-progress', plan: `[m3](./plan-m3.plan.md)` },
    ]);
    withEnv({ MCCP_GOAL_FEATURE: 'available' }, () => {
      const result = detector.detect({
        mode: 'milestone-close',
        milestone: '3',
        prdPath: prdPath,
        repoRoot: dir,
      });
      assert.strictEqual(result.goal_signal, true);
      assert.strictEqual(result.reason, 'ok');
      assert.strictEqual(result.signal_ref.row, 3);
      assert.strictEqual(result.signal_ref.status, 'in-progress');
    });
  });
});

// === S4: complete row → already-closed ===

test('S4: complete row → goal_signal=false + reason=already-closed', () => {
  withTempDir((dir) => {
    const prdPath = writePrd(dir, [
      { id: 1, name: 'axis A', status: 'complete', plan: '[done](./done.md)' },
    ]);
    withEnv({ MCCP_GOAL_FEATURE: 'available' }, () => {
      const result = detector.detect({
        mode: 'milestone-close',
        milestone: '1',
        prdPath: prdPath,
        repoRoot: dir,
      });
      assert.strictEqual(result.goal_signal, false);
      assert.strictEqual(result.reason, 'already-closed');
    });
  });
});

// === S5: pending row → not-started ===

test('S5: pending row → goal_signal=false + reason=not-started', () => {
  withTempDir((dir) => {
    const prdPath = writePrd(dir, [
      { id: 4, name: 'axis D — template doc', status: 'pending', plan: '—' },
    ]);
    withEnv({ MCCP_GOAL_FEATURE: 'available' }, () => {
      const result = detector.detect({
        mode: 'milestone-close',
        milestone: '4',
        prdPath: prdPath,
        repoRoot: dir,
      });
      assert.strictEqual(result.goal_signal, false);
      assert.strictEqual(result.reason, 'not-started');
    });
  });
});

// === S6: no milestones table → no-milestones-table ===

test('S6: PRD without Delivery Milestones table → reason=no-milestones-table', () => {
  withTempDir((dir) => {
    const prdPath = writePrd(dir, [], { noTable: true });
    withEnv({ MCCP_GOAL_FEATURE: 'available' }, () => {
      const result = detector.detect({
        mode: 'milestone-close',
        milestone: '3',
        prdPath: prdPath,
        repoRoot: dir,
      });
      assert.strictEqual(result.goal_signal, false);
      assert.strictEqual(result.reason, 'no-milestones-table');
    });
  });
});

// === S7: out-of-range row → milestone-not-found ===

test('S7: --milestone 99 (out-of-range) → reason=milestone-not-found', () => {
  withTempDir((dir) => {
    const prdPath = writePrd(dir, [
      { id: 1, name: 'axis A', status: 'complete', plan: '[a](./a.md)' },
      { id: 2, name: 'axis B', status: 'in-progress', plan: '[b](./b.md)' },
    ]);
    withEnv({ MCCP_GOAL_FEATURE: 'available' }, () => {
      const result = detector.detect({
        mode: 'milestone-close',
        milestone: '99',
        prdPath: prdPath,
        repoRoot: dir,
      });
      assert.strictEqual(result.goal_signal, false);
      assert.strictEqual(result.reason, 'milestone-not-found');
    });
  });
});

// === S8: partial name match → row found + evaluated ===

test('S8: --milestone "axis C" (partial name match) → row found + signal evaluated', () => {
  withTempDir((dir) => {
    const planFile = path.join(dir, 'm3.plan.md');
    fs.writeFileSync(planFile, '# m3\n', 'utf8');
    const prdPath = writePrd(dir, [
      { id: 3, name: 'axis C — /goal → mccp:milestone-close', status: 'in-progress', plan: '[m3](./m3.plan.md)' },
    ]);
    withEnv({ MCCP_GOAL_FEATURE: 'available' }, () => {
      const result = detector.detect({
        mode: 'milestone-close',
        milestone: 'axis C',
        prdPath: prdPath,
        repoRoot: dir,
      });
      assert.strictEqual(result.goal_signal, true);
      assert.strictEqual(result.signal_ref.row, 3);
    });
  });
});

// === S9: path traversal (relative ../) → path-traversal ===

test('S9a: --prd ../../etc/passwd (relative traversal) → reason=path-traversal', () => {
  withTempDir((dir) => {
    withEnv({ MCCP_GOAL_FEATURE: 'available' }, () => {
      const result = detector.detect({
        mode: 'milestone-close',
        prdPath: '../../etc/passwd',
        repoRoot: dir,
      });
      assert.strictEqual(result.goal_signal, false);
      assert.strictEqual(result.reason, 'path-traversal');
    });
  });
});

// === S9b: symlink path traversal (realpath escape) → path-traversal ===

test('S9b: --prd symlink-pointing-outside-repo → reason=path-traversal (S2 realpath guard)', { skip: process.platform === 'win32' }, () => {
  withTempDir((dir) => {
    withTempDir((outside) => {
      const outsideFile = path.join(outside, 'leaked.txt');
      fs.writeFileSync(outsideFile, 'leaked', 'utf8');
      const link = path.join(dir, 'symlink.md');
      try { fs.symlinkSync(outsideFile, link); }
      catch (_err) { return; /* no symlink privilege */ }
      withEnv({ MCCP_GOAL_FEATURE: 'available' }, () => {
        const result = detector.detect({
          mode: 'milestone-close',
          prdPath: 'symlink.md',
          repoRoot: dir,
        });
        assert.strictEqual(result.goal_signal, false);
        assert.strictEqual(result.reason, 'path-traversal');
      });
    });
  });
});

// === S10: mode mismatch ===

test('S10a: mode=prd → reason=mode-mismatch', () => {
  withEnv({ MCCP_GOAL_FEATURE: 'available' }, () => {
    const result = detector.detect({ mode: 'prd', repoRoot: process.cwd() });
    assert.strictEqual(result.goal_signal, false);
    assert.strictEqual(result.reason, 'mode-mismatch');
    assert.strictEqual(result.mode, null);
  });
});

test('S10b: mode=implement → reason=mode-mismatch', () => {
  withEnv({ MCCP_GOAL_FEATURE: 'available' }, () => {
    const result = detector.detect({ mode: 'implement', repoRoot: process.cwd() });
    assert.strictEqual(result.reason, 'mode-mismatch');
  });
});

// === S11: plan-cell forms × resolution base (false-negative regression) ===
//
// Every fixture above puts the PRD at repoRoot, so prdDir === repoRoot and the
// resolution base was never actually exercised. These place the PRD in a
// subdirectory (as real PRDs are, under .claude/prds/) so the two defects that
// made a live PRD report plan-missing are each independently reproducible:
//   (1) extractPlanPath did not strip inline-code backticks
//   (2) a bare repo-root-relative cell resolved against prdDir

function writeNestedPrd(dir, planCell) {
  const prdDir = path.join(dir, '.claude', 'prds');
  const planDir = path.join(dir, '.claude', 'plans');
  fs.mkdirSync(prdDir, { recursive: true });
  fs.mkdirSync(planDir, { recursive: true });
  fs.writeFileSync(path.join(planDir, 'm2.plan.md'), '# m2\n', 'utf8');
  const body = '# Test PRD\n\n## Delivery Milestones\n\n'
    + '| # | Milestone | Outcome | Status | Plan |\n|---|---|---|---|---|\n'
    + `| 2 | live 완주 검증 | x | in-progress | ${planCell} |\n`;
  const prdPath = path.join(prdDir, 'prd.md');
  fs.writeFileSync(prdPath, body, 'utf8');
  return prdPath;
}

function detectNested(dir, planCell) {
  const prdPath = writeNestedPrd(dir, planCell);
  return withEnv({ MCCP_GOAL_FEATURE: 'available' }, () => detector.detect({
    mode: 'milestone-close',
    milestone: '2',
    prdPath: prdPath,
    repoRoot: dir,
  }));
}

test('S11a: backticked repo-root-relative plan cell → goal_signal=true (defect 1+2)', () => {
  withTempDir((dir) => {
    const result = detectNested(dir, '`.claude/plans/m2.plan.md`');
    assert.strictEqual(result.reason, 'ok');
    assert.strictEqual(result.goal_signal, true);
    // backticks must not survive into the emitted path — the command body
    // stamps signal_ref.plan into the closure doc and edits that file.
    assert.strictEqual(result.signal_ref.plan, '.claude/plans/m2.plan.md');
  });
});

test('S11b: bare repo-root-relative plan cell → goal_signal=true (defect 2 alone)', () => {
  withTempDir((dir) => {
    const result = detectNested(dir, '.claude/plans/m2.plan.md');
    assert.strictEqual(result.reason, 'ok');
    assert.strictEqual(result.goal_signal, true);
  });
});

test('S11c: backticked markdown link → link target extracted', () => {
  withTempDir((dir) => {
    const result = detectNested(dir, '`[m2](../plans/m2.plan.md)`');
    assert.strictEqual(result.reason, 'ok');
    assert.strictEqual(result.signal_ref.plan, '../plans/m2.plan.md');
  });
});

test('S11d: ./-relative cell still resolves against the PRD dir (no regression)', () => {
  withTempDir((dir) => {
    const prdDir = path.join(dir, '.claude', 'prds');
    fs.mkdirSync(prdDir, { recursive: true });
    fs.writeFileSync(path.join(prdDir, 'sibling.plan.md'), '# sib\n', 'utf8');
    const result = detectNested(dir, '[sib](./sibling.plan.md)');
    assert.strictEqual(result.reason, 'ok');
    assert.strictEqual(result.signal_ref.plan, './sibling.plan.md');
  });
});

test('S11e: backticked em-dash cell is still an empty plan → plan-missing', () => {
  withTempDir((dir) => {
    const result = detectNested(dir, '`—`');
    assert.strictEqual(result.goal_signal, false);
    assert.strictEqual(result.reason, 'plan-missing');
  });
});

test('S11f: genuinely absent plan file → plan-missing (not path-traversal)', () => {
  withTempDir((dir) => {
    const result = detectNested(dir, '`.claude/plans/nope.plan.md`');
    assert.strictEqual(result.goal_signal, false);
    assert.strictEqual(result.reason, 'plan-missing');
  });
});

test('S11g: plan cell escaping the repo under every base → path-traversal', () => {
  withTempDir((dir) => {
    const result = detectNested(dir, '`../../../../etc/passwd`');
    assert.strictEqual(result.goal_signal, false);
    assert.strictEqual(result.reason, 'path-traversal');
  });
});

// === bonus: availability=unknown + ok-eligible row → reason=unknown-default ===

test('Bonus: availability=unknown + eligible row → goal_signal=false + reason=unknown-default', () => {
  withTempDir((dir) => {
    const planFile = path.join(dir, 'm3.plan.md');
    fs.writeFileSync(planFile, '# m3\n', 'utf8');
    const prdPath = writePrd(dir, [
      { id: 3, name: 'axis C', status: 'in-progress', plan: '[m3](./m3.plan.md)' },
    ]);
    withEnv({ MCCP_GOAL_FEATURE: 'unknown' }, () => {
      const result = detector.detect({
        mode: 'milestone-close',
        milestone: '3',
        prdPath: prdPath,
        repoRoot: dir,
      });
      assert.strictEqual(result.goal_signal, false);
      assert.strictEqual(result.reason, 'unknown-default');
    });
  });
});
