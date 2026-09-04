'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { derive } = require('../index');
const { maskModel, applyPathMask, maskPath, scrubAbsPaths } = require('../mask');
const { tmpRepo, cleanup, gitInit, writeJson } = require('./helpers');

// ci-full-suite M2 갈래 P — 유출 좌표 산출기. 모델을 재귀로 걸으며 `needle`을
// 포함하는 문자열 값의 **경로**를 모은다. 단언 실패 메시지에만 쓰이므로
// 산출물에 영향을 주지 않는다. 상한 20건 — 전부 찍으면 CI 로그가 묻힌다.
function findLeaks(node, needle, trail, out) {
  out = out || [];
  if (out.length >= 20) return out;
  if (typeof node === 'string') {
    if (node.indexOf(needle) !== -1) {
      out.push({ at: trail.join('.') || '(root)', value: node.slice(0, 200) });
    }
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach(function (v, i) { findLeaks(v, needle, trail.concat('[' + i + ']'), out); });
    return out;
  }
  if (node && typeof node === 'object') {
    Object.keys(node).forEach(function (k) {
      findLeaks(node[k], needle, trail.concat(k), out);
    });
  }
  return out;
}

function writeAReceipt(root) {
  const p = path.join(root, '.claude', 'receipts', 'mccp-plan-codex', 'r.json');
  writeJson(p, {
    schema_version: 'v1',
    gate_id: 'mccp-plan-codex',
    phase: 'plan',
    decision_id: 'r',
    task_id: null,
    plan_hash: 'sha256:' + '0'.repeat(64),
    design_doc_hash: [],
    base_sha: '0000000',
    head_sha: '0000000',
    round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, open_questions: [] },
    subject_hash: 'sha256:' + '0'.repeat(64),
    receipt_hash: 'sha256:' + '0'.repeat(64),
    meta: { created_at: '2026-06-17T00:00:00.000Z', cwd: root,
      skipped: false, advisory: false, codex_skipped: false,
      security_skipped: false, impeccable_skipped: false },
  });
}

test('mask: default derive emits masked model (Codex F2 absorption)', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    writeAReceipt(root);
    const m = derive(root); // default — masked
    assert.strictEqual(m.masked, true);
    assert.strictEqual(m.repo_root, '<repo>');
    const json = JSON.stringify(m);
    // Should not contain the absolute tmp path
    // ci-full-suite M2 갈래 P — 이 실패는 Linux 에서만 관측됐고(M1 baseline),
    // 기존 메시지는 "샌다"까지만 말하고 **어느 필드가** 새는지는 말하지 않아,
    // 재현 불가한 플랫폼에서 수리 지점을 지목할 수 없었다.
    // `mask.js` 의 `applyPathMask` 는 소스별 `pathKeys` 화이트리스트만 마스킹하므로,
    // 목록 밖 필드가 절대경로를 담으면 아무것도 잡지 않는다(security-reviewer S3).
    // 그 구조적 백스톱은 backlog 로 이연했고, 여기서는 최소한 좌표를 낸다.
    //
    // 좌표 산출은 **실패했을 때만** 한다. `assert.ok(cond, msg)` 의 `msg` 는 인자라
    // 통과할 때도 매번 평가되고, 그러면 green 경로가 모델 전수 순회 +
    // `JSON.stringify` 를 값 없이 지불한다.
    if (json.indexOf(root) !== -1) {
      assert.fail('masked output should not contain absolute repo path; found: ' + root +
        '\n  leaking paths: ' + JSON.stringify(findLeaks(m, root, []), null, 2));
    }
  } finally {
    cleanup(root);
  }
});

test('mask: derive(root, {raw:true}) preserves absolute paths', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    writeAReceipt(root);
    const m = derive(root, { raw: true });
    assert.strictEqual(m.masked, false);
    assert.strictEqual(m.repo_root, path.resolve(root));
  } finally {
    cleanup(root);
  }
});

test('mask: applyPathMask redacts ledger cwd to <repo>-relative posix path (v1.5.0-m1 H1)', () => {
  const root = tmpRepo();
  try {
    const ledgerCwd = path.join(root, 'apps', 'web');
    const model = {
      sources: {
        state: {
          item: {
            path: '.claude/state/STATE.md',
            active_session_ledgers: [
              { session_id: 'a', cwd: ledgerCwd, host: 'DESKTOP-LEAK', git_branch: 'main' },
            ],
          },
        },
      },
    };
    applyPathMask(model, root);
    const led = model.sources.state.item.active_session_ledgers[0];
    assert.strictEqual(led.cwd, 'apps/web', 'cwd must be repo-relative posix path');
    assert.strictEqual(led.host, '<host>', 'host must be redacted to placeholder');
    assert.strictEqual(led.git_branch, 'main', 'git_branch stays raw (intentional)');
    assert.strictEqual(led.session_id, 'a', 'session_id stays raw');
    const json = JSON.stringify(model);
    assert.ok(json.indexOf(ledgerCwd) === -1, 'absolute ledger cwd must not leak through mask');
    assert.ok(json.indexOf('DESKTOP-LEAK') === -1, 'hostname must not leak through mask');
  } finally {
    cleanup(root);
  }
});

test('mask: applyPathMask tolerates missing active_session_ledgers array', () => {
  const root = tmpRepo();
  try {
    const model = { sources: { state: { item: { path: '.claude/state/STATE.md' } } } };
    applyPathMask(model, root);
    assert.strictEqual(model.sources.state.item.path, '.claude/state/STATE.md');
  } finally {
    cleanup(root);
  }
});

test('mask: applyPathMask tolerates empty/non-string ledger fields', () => {
  const root = tmpRepo();
  try {
    const model = {
      sources: {
        state: {
          item: {
            path: '.claude/state/STATE.md',
            active_session_ledgers: [
              { session_id: 'a', cwd: '', host: null, git_branch: 'main' },
              { session_id: 'b' },
              null,
            ],
          },
        },
      },
    };
    applyPathMask(model, root);
    const arr = model.sources.state.item.active_session_ledgers;
    assert.strictEqual(arr[0].cwd, '', 'empty string cwd left as-is');
    assert.strictEqual(arr[0].host, null, 'null host left as-is');
    assert.strictEqual(arr[1].session_id, 'b', 'minimal ledger untouched');
    assert.strictEqual(arr[2], null, 'null entry untouched');
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// v1.4.x patch — receipts.items[].cwd outside-root mask coverage
//   Codex R1 F3 + R2 F2 absorption.
// ---------------------------------------------------------------------------

[
  { name: 'inside-root POSIX',                 root: '/proj/x',     input: '/proj/x/sub',          expect: 'sub' },
  { name: 'sibling worktree POSIX',            root: '/proj/x',     input: '/proj/y/other',        expect: '<outside-repo:other>' },
  { name: 'Windows drive (same host)',         root: 'C:\\proj\\x', input: 'D:\\other\\file',      expect: '<outside-repo:file>' },
  { name: 'UNC path',                          root: 'C:\\proj\\x', input: '\\\\server\\share\\x', expect: '<outside-repo:x>' },
  { name: 'POSIX host receives Windows input', root: '/proj/x',     input: 'D:\\other\\file',      expect: '<outside-repo:file>' },
  { name: 'degenerate drive root',             root: '/proj/x',     input: 'D:\\',                 expect: '<outside-repo:_>' },
  { name: 'input equals repo root',            root: '/proj/x',     input: '/proj/x',              expect: '.' },
].forEach((tc) => {
  test('maskPath cwd: ' + tc.name, () => {
    assert.strictEqual(maskPath(tc.input, tc.root), tc.expect);
  });
});

test('maskPath: receipts.items[].cwd outside-root never leaks raw separators (R2 F2)', () => {
  const repoRoot = '/proj/x';
  const inputs = [
    '/other/proj/file.json',
    'D:\\foo\\bar',
    '\\\\server\\share\\path\\file',
    '..\\sibling\\thing',
  ];
  for (const input of inputs) {
    const masked = maskPath(input, repoRoot);
    if (masked.startsWith('<outside-repo:')) {
      const body = masked.slice('<outside-repo:'.length, -1);
      assert.ok(!body.includes('\\') && !body.includes('/'),
        'placeholder body must not contain raw separators: ' + JSON.stringify(masked));
      assert.ok(!/^[A-Za-z]:/.test(body),
        'placeholder body must not retain drive prefix: ' + JSON.stringify(masked));
    }
  }
});

test('mask: maskModel is idempotent', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    writeAReceipt(root);
    const raw = derive(root, { raw: true });
    const a = maskModel(raw, root);
    const b = maskModel(a, root);
    assert.strictEqual(JSON.stringify(a), JSON.stringify(b),
      'applying maskModel twice should equal applying once');
  } finally {
    cleanup(root);
  }
});

// ── scrubAbsPaths (dashboard-multi-session M1, review M3) ─────────────────────
// scrubAbsPaths is the privacy-critical scrubber for free-form fs/git error +
// warning strings (the worktrees scanner's fail-open paths). Its regex carries
// two subtle invariants the comment claims but the end-to-end applyPathMask
// tests never isolate: (1) outside-root abs/drive/UNC tokens get placeholdered,
// (2) URL schemes and bare relative fragments are NOT mistaken for paths.
// Synthetic platform-native roots — no fs (scrubAbsPaths/maskPath are pure).

test('scrubAbsPaths: outside-root abs path embedded in error → placeholdered, parent not leaked', () => {
  const root = path.resolve(__dirname, 'fixture-root');
  const sibling = path.join(path.dirname(root), 'sibling', '.claude', 'state', 'STATE.md');
  const err = "ENOENT: no such file or directory, open '" + sibling + "'";
  const scrubbed = scrubAbsPaths(err, root);
  assert.ok(scrubbed.indexOf(path.dirname(root)) === -1,
    'parent dir not leaked: ' + scrubbed);
  assert.ok(scrubbed.indexOf('<outside-repo:') !== -1, 'placeholder present: ' + scrubbed);
});

test('scrubAbsPaths: inside-root abs path → collapsed to relative, no placeholder', () => {
  const root = path.resolve(__dirname, 'fixture-root');
  const inside = path.join(root, '.claude', 'state', 'STATE.md');
  const scrubbed = scrubAbsPaths('read ' + inside, root);
  assert.ok(scrubbed.indexOf('<outside-repo:') === -1, 'inside-root not placeholdered');
  assert.ok(scrubbed.indexOf(root) === -1, 'absolute root prefix stripped: ' + scrubbed);
  assert.ok(scrubbed.indexOf('.claude/state/STATE.md') !== -1,
    'collapsed to posix relative: ' + scrubbed);
});

test('scrubAbsPaths: UNC path → placeholdered, raw share not leaked', () => {
  const root = path.resolve(__dirname, 'fixture-root');
  const scrubbed = scrubAbsPaths('open \\\\server\\share\\file.txt now', root);
  assert.ok(scrubbed.indexOf('\\\\server') === -1, 'raw UNC share not leaked: ' + scrubbed);
  assert.ok(scrubbed.indexOf('<outside-repo:') !== -1, 'UNC placeholdered: ' + scrubbed);
});

test('scrubAbsPaths: URL schemes preserved (not mistaken for UNC/path)', () => {
  const root = path.resolve(__dirname, 'fixture-root');
  const input = 'see https://example.com/pull/42 and http://host/x for details';
  assert.strictEqual(scrubAbsPaths(input, root), input, 'URLs untouched');
});

test('scrubAbsPaths: bare relative fragments preserved', () => {
  const root = path.resolve(__dirname, 'fixture-root');
  const input = 'edited derive/x.js and lib/y.js (and/or others)';
  assert.strictEqual(scrubAbsPaths(input, root), input, 'relative fragments untouched');
});

test('scrubAbsPaths: non-string / empty → returned as-is', () => {
  const root = path.resolve(__dirname, 'fixture-root');
  assert.strictEqual(scrubAbsPaths('', root), '');
  assert.strictEqual(scrubAbsPaths(null, root), null);
  assert.strictEqual(scrubAbsPaths(42, root), 42);
});
