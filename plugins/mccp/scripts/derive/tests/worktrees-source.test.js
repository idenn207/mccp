'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  scanWorktrees,
  parseWorktreePorcelain,
  deriveWorktreeProgress,
  isSelfWorktree,
} = require('../sources/worktrees');
const { derive } = require('../index');
const { applyPathMask } = require('../mask');
const { emptyModel } = require('../model');
const stateWriter = require('../../state/state-writer');
const { cleanup, gitInit, writeJson, writeText } = require('./helpers');

// ── helpers ──────────────────────────────────────────────────────────────────

function writeReceipt(root, gate, decision, over) {
  writeJson(path.join(root, '.claude', 'receipts', gate, decision + '.json'), Object.assign({
    schema_version: 'v1',
    gate_id: gate,
    decision_id: decision,
    round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, open_questions: [] },
    meta: { created_at: '2026-06-25T00:00:00.000Z' },
  }, over || {}));
}

// real multi-worktree fixture (gate-on tests need an actual `git worktree list`)
function makeMultiWorktree(branches) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-wt-'));
  const mainRoot = path.join(parent, 'main');
  fs.mkdirSync(mainRoot);
  gitInit(mainRoot);
  // derive() short-circuits when root has no .claude/ — ensure it exists so the
  // source loop (and thus the worktrees scanner) runs for derive-path tests.
  fs.mkdirSync(path.join(mainRoot, '.claude'), { recursive: true });
  const wts = [];
  for (const b of branches) {
    const wtPath = path.join(parent, b);
    execFileSync('git', ['worktree', 'add', '-b', b, wtPath], { cwd: mainRoot, stdio: 'ignore' });
    wts.push(wtPath);
  }
  return { parent, mainRoot, wts };
}

// ── (a) Task 1: pure porcelain parser ────────────────────────────────────────

test('parseWorktreePorcelain: multi-block (main + 2 worktrees + detached + bare)', () => {
  const fixture = [
    'worktree /repo/main',
    'HEAD 1111111111111111111111111111111111111111',
    'branch refs/heads/main',
    '',
    'worktree /repo/wt-a',
    'HEAD 2222222222222222222222222222222222222222',
    'branch refs/heads/feature-a',
    '',
    'worktree /repo/wt-b',
    'HEAD 3333333333333333333333333333333333333333',
    'branch refs/heads/feature-b',
    'locked',
    '',
    'worktree /repo/wt-detached',
    'HEAD 4444444444444444444444444444444444444444',
    'detached',
    '',
    'worktree /repo/bare-wt',
    'bare',
    '',
  ].join('\n');
  const out = parseWorktreePorcelain(fixture);
  assert.strictEqual(out.length, 5, 'five blocks parsed');
  assert.strictEqual(out[0].branch, 'main');
  assert.strictEqual(out[1].branch, 'feature-a');
  assert.strictEqual(out[2].branch, 'feature-b');
  assert.strictEqual(out[2].locked, true);
  assert.strictEqual(out[3].detached, true);
  assert.strictEqual(out[3].branch, null);
  assert.strictEqual(out[4].bare, true);
  assert.strictEqual(out[0].head, '1111111111111111111111111111111111111111');
});

test('parseWorktreePorcelain: empty / non-string → []', () => {
  assert.deepStrictEqual(parseWorktreePorcelain(''), []);
  assert.deepStrictEqual(parseWorktreePorcelain(null), []);
  assert.deepStrictEqual(parseWorktreePorcelain(undefined), []);
});

// ── (b) gate off no-op (no spawn) ────────────────────────────────────────────

test('scanWorktrees: gate off (no env, no opts) → scanned:false no-op', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-off-'));
  const prev = process.env.MCCP_MULTI_SESSION_SCAN;
  delete process.env.MCCP_MULTI_SESSION_SCAN;
  try {
    const r = scanWorktrees(root, {});
    assert.strictEqual(r.scanned, false);
    assert.strictEqual(r.count, 0);
    assert.deepStrictEqual(r.items, []);
    assert.strictEqual(r.degraded, false);
    assert.strictEqual(r.self_path, null);
    assert.strictEqual(r.truncated, false);
  } finally {
    if (prev === undefined) delete process.env.MCCP_MULTI_SESSION_SCAN;
    else process.env.MCCP_MULTI_SESSION_SCAN = prev;
    cleanup(root);
  }
});

test('scanWorktrees: env kill-switch (=0) overrides opts.worktreeScan', () => {
  const { parent, mainRoot } = makeMultiWorktree(['wt-a']);
  const prev = process.env.MCCP_MULTI_SESSION_SCAN;
  process.env.MCCP_MULTI_SESSION_SCAN = '0';
  try {
    const r = scanWorktrees(mainRoot, { worktreeScan: true });
    assert.strictEqual(r.scanned, false, 'kill-switch forces off even with opt-in');
  } finally {
    if (prev === undefined) delete process.env.MCCP_MULTI_SESSION_SCAN;
    else process.env.MCCP_MULTI_SESSION_SCAN = prev;
    cleanup(parent);
  }
});

// ── (c) gate on items ────────────────────────────────────────────────────────

test('scanWorktrees: gate on (opts) → ≥2 items, scanned:true, main marked', () => {
  const { parent, mainRoot } = makeMultiWorktree(['wt-a', 'wt-b']);
  try {
    const r = scanWorktrees(mainRoot, { worktreeScan: true });
    assert.strictEqual(r.scanned, true);
    assert.ok(r.count >= 3, 'main + 2 worktrees → ≥3 rows, got ' + r.count);
    const mains = r.items.filter((i) => i.is_main);
    assert.strictEqual(mains.length, 1, 'exactly one is_main');
    const branches = r.items.map((i) => i.branch);
    assert.ok(branches.indexOf('wt-a') !== -1 && branches.indexOf('wt-b') !== -1);
  } finally {
    cleanup(parent);
  }
});

test('scanWorktrees: env=1 enables scan without opts', () => {
  const { parent, mainRoot } = makeMultiWorktree(['wt-a']);
  const prev = process.env.MCCP_MULTI_SESSION_SCAN;
  process.env.MCCP_MULTI_SESSION_SCAN = '1';
  try {
    const r = scanWorktrees(mainRoot, {});
    assert.strictEqual(r.scanned, true);
    assert.ok(r.count >= 2);
  } finally {
    if (prev === undefined) delete process.env.MCCP_MULTI_SESSION_SCAN;
    else process.env.MCCP_MULTI_SESSION_SCAN = prev;
    cleanup(parent);
  }
});

// ── (d) self-match ───────────────────────────────────────────────────────────

test('scanWorktrees: self row marked when repoRoot is one worktree', () => {
  const { parent, mainRoot, wts } = makeMultiWorktree(['wt-a', 'wt-b']);
  try {
    const selfRoot = wts[0]; // scan as if invoked from wt-a
    const r = scanWorktrees(selfRoot, { worktreeScan: true });
    const selfRows = r.items.filter((i) => i.is_self);
    assert.strictEqual(selfRows.length, 1, 'exactly one is_self');
    assert.strictEqual(selfRows[0].branch, 'wt-a');
    assert.ok(r.self_path, 'self_path set');
  } finally {
    cleanup(parent);
  }
});

test('isSelfWorktree: case + trailing-slash variants match', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-self-'));
  try {
    assert.strictEqual(isSelfWorktree(root, root), true);
    assert.strictEqual(isSelfWorktree(root + path.sep, root), true, 'trailing sep matches');
    if (/^[A-Za-z]:/.test(root)) {
      const flipped = root[0].toUpperCase() === root[0]
        ? root[0].toLowerCase() + root.slice(1)
        : root[0].toUpperCase() + root.slice(1);
      assert.strictEqual(isSelfWorktree(flipped, root), true, 'drive-case variant matches');
    }
    assert.strictEqual(isSelfWorktree(path.join(root, 'other'), root), false);
    assert.strictEqual(isSelfWorktree(null, root), false);
  } finally {
    cleanup(root);
  }
});

// ── Task 2: per-worktree progress derive ─────────────────────────────────────

test('deriveWorktreeProgress: parseable STATE + receipt → fields populated', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-prog-'));
  try {
    stateWriter.update(root, { goal: 'M5 multi-session dashboard', inProgress: 'wiring scanner' });
    writeReceipt(root, 'mccp-plan-codex', 'feat-x', {
      resolution: { converged: true, rounds: 1, open_questions: [] },
      meta: { created_at: '2026-06-25T01:00:00.000Z' },
    });
    const p = deriveWorktreeProgress(root, root, {});
    assert.strictEqual(p.state_present, true);
    assert.strictEqual(p.state_parseable, true);
    assert.ok(p.milestone_hint && p.milestone_hint.indexOf('M5') !== -1);
    assert.strictEqual(p.current_gate, 'mccp-plan-codex');
    assert.strictEqual(p.gate_converged, true);
    assert.strictEqual(p.blocked, false);
    assert.strictEqual(p.receipts, 1);
    assert.strictEqual(p.has_signal, true);
    assert.strictEqual(p.active, true, 'fresh files → active');
    assert.ok(p.last_activity, 'last_activity set');
    assert.strictEqual(p.degraded, false);
  } finally {
    cleanup(root);
  }
});

test('deriveWorktreeProgress: latest receipt by created_at + non-converged → blocked', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-blk-'));
  try {
    writeReceipt(root, 'mccp-plan-codex', 'old', {
      resolution: { converged: true, rounds: 1, open_questions: [] },
      meta: { created_at: '2026-06-20T00:00:00.000Z' },
    });
    writeReceipt(root, 'mccp-implement-codex', 'new', {
      resolution: { converged: false, rounds: 2, open_questions: [] },
      meta: { created_at: '2026-06-25T00:00:00.000Z' },
    });
    const p = deriveWorktreeProgress(root, root, {});
    assert.strictEqual(p.current_gate, 'mccp-implement-codex', 'newest by created_at');
    assert.strictEqual(p.gate_converged, false);
    assert.strictEqual(p.blocked, true);
    assert.ok(p.blocked_reason && p.blocked_reason.indexOf('not converged') !== -1);
  } finally {
    cleanup(root);
  }
});

test('deriveWorktreeProgress: fix-task.md presence → blocked', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-fix-'));
  try {
    stateWriter.update(root, { goal: 'x' });
    writeText(path.join(root, '.claude', 'state', 'fix-task.md'), '# fix\n');
    const p = deriveWorktreeProgress(root, root, {});
    assert.strictEqual(p.blocked, true);
    assert.strictEqual(p.blocked_reason, 'fix-task.md present');
  } finally {
    cleanup(root);
  }
});

test('deriveWorktreeProgress: advisory receipt → blocked', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-adv-'));
  try {
    writeReceipt(root, 'mccp-pr-codex', 'd', {
      resolution: { converged: true, rounds: 1, open_questions: [] },
      meta: { created_at: '2026-06-25T00:00:00.000Z', advisory: true },
    });
    const p = deriveWorktreeProgress(root, root, {});
    assert.strictEqual(p.blocked, true);
    assert.ok(p.blocked_reason && p.blocked_reason.indexOf('advisory') !== -1);
  } finally {
    cleanup(root);
  }
});

test('deriveWorktreeProgress: no .claude → absent (not degraded)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-abs-'));
  try {
    const p = deriveWorktreeProgress(root, root, {});
    assert.strictEqual(p.state_present, false);
    assert.strictEqual(p.has_signal, false);
    assert.strictEqual(p.degraded, false, 'genuine absence is NOT a degrade');
    assert.strictEqual(p.last_activity, null);
  } finally {
    cleanup(root);
  }
});

// ── (i) Codex F3: corrupt STATE → degraded row preserved (NOT absent) ─────────

test('deriveWorktreeProgress: STATE present but corrupt → degraded + state_present, row preserved', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-corrupt-'));
  try {
    // no frontmatter → parseStateMd returns null (unparseable, not absent)
    writeText(path.join(root, '.claude', 'state', 'STATE.md'), 'garbage no frontmatter here\n');
    // receipts still present → must survive the corrupt-STATE row
    writeReceipt(root, 'mccp-plan-codex', 'd', {
      meta: { created_at: '2026-06-25T00:00:00.000Z' },
    });
    const p = deriveWorktreeProgress(root, root, {});
    assert.strictEqual(p.state_present, true, 'present, NOT masquerading as absent');
    assert.strictEqual(p.state_parseable, false);
    assert.strictEqual(p.degraded, true);
    assert.strictEqual(p.blocked_reason, 'state-unparseable');
    assert.strictEqual(p.current_gate, 'mccp-plan-codex', 'receipts survive the corrupt STATE');
    assert.strictEqual(p.receipts, 1);
  } finally {
    cleanup(root);
  }
});

// ── (e) per-worktree fail-open degrade (unreadable STATE) ─────────────────────

test('deriveWorktreeProgress: STATE.md unreadable (is a dir) → degraded, error scrubbed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-unread-'));
  try {
    // make STATE.md a directory → existsSync true, readFileSync throws EISDIR
    fs.mkdirSync(path.join(root, '.claude', 'state', 'STATE.md'), { recursive: true });
    const p = deriveWorktreeProgress(root, root, {});
    assert.strictEqual(p.state_present, true);
    assert.strictEqual(p.state_parseable, false);
    assert.strictEqual(p.degraded, true);
    assert.strictEqual(p.blocked_reason, 'state-unreadable');
  } finally {
    cleanup(root);
  }
});

// ── (f) cap / truncated ──────────────────────────────────────────────────────

test('scanWorktrees: cap → truncated:true + warning, count == cap', () => {
  const { parent, mainRoot } = makeMultiWorktree(['wt-a', 'wt-b']);
  try {
    const r = scanWorktrees(mainRoot, { worktreeScan: true, cap: 1 });
    assert.strictEqual(r.truncated, true);
    assert.strictEqual(r.count, 1, 'capped to 1');
    assert.ok(r.warning && r.warning.indexOf('truncated') !== -1, 'no silent cap — warning present');
  } finally {
    cleanup(parent);
  }
});

// review M2 — self worktree must survive truncation even when it sorts past the
// cap. git lists [main, wt-a, wt-b]; scanning from wt-b (self at index 2) with
// cap 2 would drop self under the old slice(0,cap), losing the anchor row.
test('scanWorktrees: truncation retains the self worktree (anchor not dropped)', () => {
  const { parent, mainRoot, wts } = makeMultiWorktree(['wt-a', 'wt-b']);
  try {
    const selfRoot = wts[1]; // wt-b — git lists it last, past a cap of 2
    const r = scanWorktrees(selfRoot, { worktreeScan: true, cap: 2 });
    assert.strictEqual(r.truncated, true);
    assert.strictEqual(r.count, 2, 'capped to 2');
    const selfRows = r.items.filter((i) => i.is_self);
    assert.strictEqual(selfRows.length, 1, 'self retained despite truncation');
    assert.strictEqual(selfRows[0].branch, 'wt-b');
    assert.ok(r.self_path, 'self_path survives the cap');
    const mains = r.items.filter((i) => i.is_main);
    assert.strictEqual(mains.length, 1, 'is_main still present (front slot preserved at cap≥2)');
  } finally {
    cleanup(parent);
  }
});

// ── (g) masked paths (real worktrees through derive) ─────────────────────────

test('derive: worktreeScan masked output → outside-root paths placeholdered, self_path safe', () => {
  const { parent, mainRoot } = makeMultiWorktree(['wt-a']);
  try {
    const m = derive(mainRoot, { worktreeScan: true }); // default masked
    assert.strictEqual(m.masked, true);
    const w = m.sources.worktrees;
    assert.strictEqual(w.scanned, true);
    for (const it of w.items) {
      assert.ok(!/^[A-Za-z]:[\\/]/.test(it.path) && it.path.indexOf(parent) === -1,
        'no raw absolute path leaked in items[].path: ' + it.path);
    }
    if (w.self_path) {
      assert.ok(w.self_path.indexOf(parent) === -1, 'self_path not raw absolute');
    }
  } finally {
    cleanup(parent);
  }
});

// ── (h) Codex F2: sibling read fail → masked output has no raw absolute path ──

test('applyPathMask: worktrees error/warning strings scrubbed of outside-root abs paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-leak-'));
  try {
    const sibling = path.join(path.dirname(root), 'sibling-worktree', '.claude', 'state', 'STATE.md');
    const m = emptyModel(root);
    m.sources.worktrees = {
      ok: true, count: 1, invalid_count: 1, degraded: true, scanned: true, truncated: false,
      self_path: path.join(root),
      error: "ENOENT: no such file or directory, open '" + sibling + "'",
      items: [{
        path: path.join(path.dirname(root), 'sibling-worktree'),
        branch: 'feat-x', head: 'abc', is_self: false, is_main: false,
        degraded: true,
        error: "EACCES: permission denied, scandir '" + sibling + "'",
      }],
    };
    applyPathMask(m, root);
    assert.ok(m.sources.worktrees.error.indexOf(path.dirname(root)) === -1,
      'source error scrubbed: ' + m.sources.worktrees.error);
    assert.ok(m.sources.worktrees.items[0].error.indexOf(path.dirname(root)) === -1,
      'item error scrubbed: ' + m.sources.worktrees.items[0].error);
    assert.ok(m.sources.worktrees.error.indexOf('<outside-repo:') !== -1, 'placeholder present');
    assert.ok(m.sources.worktrees.items[0].path.indexOf('<outside-repo:') !== -1,
      'item path placeholdered');
  } finally {
    cleanup(root);
  }
});

// ── (j) Codex F1: render path opt-in vs bare derive default-off ───────────────

test('derive: worktreeScan:true scans ≥2; bare derive(raw) stays scanned:false', () => {
  const { parent, mainRoot } = makeMultiWorktree(['wt-a', 'wt-b']);
  const prev = process.env.MCCP_MULTI_SESSION_SCAN;
  delete process.env.MCCP_MULTI_SESSION_SCAN; // ensure env doesn't force on
  try {
    const rendered = derive(mainRoot, { worktreeScan: true });
    assert.strictEqual(rendered.sources.worktrees.scanned, true);
    assert.ok(rendered.sources.worktrees.count >= 3, 'render path fills worktrees');

    const bare = derive(mainRoot, { raw: true });
    assert.strictEqual(bare.sources.worktrees.scanned, false, 'bare derive default-off (perf budget)');
    assert.strictEqual(bare.sources.worktrees.count, 0);
  } finally {
    if (prev === undefined) delete process.env.MCCP_MULTI_SESSION_SCAN;
    else process.env.MCCP_MULTI_SESSION_SCAN = prev;
    cleanup(parent);
  }
});
