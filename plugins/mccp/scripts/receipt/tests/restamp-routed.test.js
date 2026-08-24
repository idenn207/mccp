'use strict';

// v1.31.4 M4 — restamp-routed semantics.
//
// The finish pass (prp-implement Phase 3.6) runs AFTER the 2.5.6 receipt write,
// so its outcomes reach the receipt only through this restamp. Two properties
// are in tension and both are pinned here:
//
//   append-only across restamps — a command firing in BOTH passes must show up
//     twice, because that duplicate IS the drift signal that the duplicate-call
//     invariant broke. Merging it away would erase the evidence.
//   idempotent within one restamp — a RETRY of the same restamp must not forge
//     a second history (Codex Implement-R1 F1). A retry is not a second pass.
//
// The discriminator is a tail match on the canonical entry form, evaluated
// inside the updateReceipt critical section.

// Each write()/restamp goes through the briefing hook, whose LLM call has no
// stub in a bare tmp repo and burns its full 60s timeout per receipt write.
// MCCP_BRIEFING=off is the documented policy toggle (docs/ENVIRONMENT.md), not
// a test-only backdoor — it skips the invocation before it is attempted.
process.env.MCCP_BRIEFING = 'off';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write, restampRoutedCommands } = require('../write');
const { validate } = require('../schema');

const PRE = [
  { command: 'layout', call_form: 'invoke', status: 'invoked' },
  { command: 'critique', call_form: 'invoke', status: 'invoked' },
];
const FINISH = [
  { command: 'clarify', call_form: 'invoke', status: 'invoked' },
  { command: 'distill', call_form: 'invoke', status: 'invoked' },
  { command: 'polish', call_form: 'invoke', status: 'invoked' },
];

function withRepo(fn) {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/routed-x.plan.md', '# Plan: routed-x\n\nbody\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    return fn(repo, path.relative(repo, plan).split(path.sep).join('/'));
  } finally {
    process.chdir(cwd);
  }
}

// Seed an implement receipt. `pre` null → the field stays null (legacy shape),
// which is one of the two starting states the restamp must handle.
function seed(repo, planRel, pre, extraFlags) {
  const args = Object.assign({
    gate: 'mccp-implement-codex',
    decision: 'routed-x',
    plan: planRel,
  }, extraFlags || {});
  if (pre) {
    const f = writeFileSync(repo, '.claude/state/pre.json', JSON.stringify(pre));
    args['impeccable-commands-routed-file'] = path.relative(repo, f).split(path.sep).join('/');
  }
  return write(args);
}

function entriesFile(repo, name, entries) {
  const f = writeFileSync(repo, '.claude/state/' + name, JSON.stringify(entries));
  return path.relative(repo, f).split(path.sep).join('/');
}

function restamp(repo, file) {
  return restampRoutedCommands({
    gate: 'mccp-implement-codex',
    decision: 'routed-x',
    'impeccable-commands-routed-file': file,
    cwd: repo,
  });
}

test('(a) appends onto a null array — the legacy/no-pre-pass starting state', function () {
  withRepo(function (repo, planRel) {
    const seeded = seed(repo, planRel, null);
    assert.strictEqual(seeded.receipt.meta.impeccable_commands_routed, null);

    const r = restamp(repo, entriesFile(repo, 'finish.json', FINISH));
    assert.strictEqual(r.noop, false);
    assert.strictEqual(r.appended, FINISH.length);
    assert.deepStrictEqual(r.receipt.meta.impeccable_commands_routed, FINISH);
  });
});

test('(b) appends onto an existing array preserving order and leaving prior entries untouched', function () {
  withRepo(function (repo, planRel) {
    seed(repo, planRel, PRE);
    const r = restamp(repo, entriesFile(repo, 'finish.json', FINISH));
    const got = r.receipt.meta.impeccable_commands_routed;
    assert.strictEqual(got.length, PRE.length + FINISH.length);
    assert.deepStrictEqual(got.slice(0, PRE.length), PRE, 'pre-pass entries must survive verbatim');
    assert.deepStrictEqual(got.slice(PRE.length), FINISH, 'finish entries append in order');
  });
});

test('(c) adjacent meta fields survive the restamp (field-preserving, not a rebuild)', function () {
  withRepo(function (repo, planRel) {
    seed(repo, planRel, PRE, {
      'impeccable-routing-mode': 'auto',
      'design-critique-rounds': 2,
      'design-critique-verdict': 'converged',
      'design-grounding-captured': true,
      'design-grounding-verdict': 'grounded',
      'codex-verdict': 'converged',
    });
    const r = restamp(repo, entriesFile(repo, 'finish.json', FINISH));
    const m = r.receipt.meta;
    assert.strictEqual(m.impeccable_routing_mode, 'auto');
    assert.strictEqual(m.design_critique_rounds, 2);
    assert.strictEqual(m.design_critique_verdict, 'converged');
    assert.strictEqual(m.design_grounding_captured, true);
    assert.strictEqual(m.design_grounding_verdict, 'grounded');
    assert.strictEqual(r.receipt.resolution.codex_verdict, 'converged');
  });
});

test('(d) both digests are recomputed and the result validates', function () {
  withRepo(function (repo, planRel) {
    const seeded = seed(repo, planRel, PRE);
    const before = seeded.receipt.receipt_hash;
    const r = restamp(repo, entriesFile(repo, 'finish.json', FINISH));

    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.notStrictEqual(r.receipt.receipt_hash, before,
      'impeccable_commands_routed is NOT carved out of receipt_hash (hash.js), so appending must re-seal');

    // and the seal on disk matches what we returned
    const onDisk = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    assert.strictEqual(onDisk.receipt_hash, r.receipt.receipt_hash);
    assert.deepStrictEqual(onDisk.meta.impeccable_commands_routed,
      r.receipt.meta.impeccable_commands_routed);
  });
});

test('(e) a command already present in the pre pass is recorded TWICE — the duplicate is the signal', function () {
  withRepo(function (repo, planRel) {
    // `polish` in both passes would mean the duplicate-call invariant broke.
    // The receipt must show it, not tidy it away.
    const pre = PRE.concat([{ command: 'polish', call_form: 'invoke', status: 'invoked' }]);
    seed(repo, planRel, pre);
    const r = restamp(repo, entriesFile(repo, 'finish.json', FINISH));
    const polishes = r.receipt.meta.impeccable_commands_routed
      .filter(function (e) { return e.command === 'polish'; });
    assert.strictEqual(polishes.length, 2,
      'dedupe would erase the drift signal this field exists to carry');
  });
});

test('(f) replaying the SAME restamp is a no-op — no duplicate history, no re-seal', function () {
  withRepo(function (repo, planRel) {
    seed(repo, planRel, PRE);
    const file = entriesFile(repo, 'finish.json', FINISH);

    const first = restamp(repo, file);
    assert.strictEqual(first.noop, false);
    const sealed = first.receipt.receipt_hash;
    const length = first.receipt.meta.impeccable_commands_routed.length;

    const second = restamp(repo, file);
    assert.strictEqual(second.noop, true, 'a retry is not a second finish pass');
    assert.strictEqual(second.appended, 0);
    assert.strictEqual(second.receipt, null, 'updateReceipt must not write on a suppressed retry');

    const onDisk = JSON.parse(fs.readFileSync(first.path, 'utf8'));
    assert.strictEqual(onDisk.receipt_hash, sealed, 'receipt must not be re-sealed by a retry');
    assert.strictEqual(onDisk.meta.impeccable_commands_routed.length, length);
  });
});

test('(g) idempotency suppresses only an identical tail — a DIFFERENT second pass still appends', function () {
  withRepo(function (repo, planRel) {
    seed(repo, planRel, PRE);
    restamp(repo, entriesFile(repo, 'finish.json', FINISH));

    const other = [{ command: 'harden', call_form: 'invoke', status: 'failed' }];
    const r = restamp(repo, entriesFile(repo, 'finish2.json', other));
    assert.strictEqual(r.noop, false, 'different content is a real second record, not a retry');
    const got = r.receipt.meta.impeccable_commands_routed;
    assert.deepStrictEqual(got.slice(-1), other);
    assert.strictEqual(got.length, PRE.length + FINISH.length + 1);
  });
});

test('(g2) a partial-overlap tail is NOT treated as a retry — uncertainty appends', function () {
  withRepo(function (repo, planRel) {
    seed(repo, planRel, PRE);
    restamp(repo, entriesFile(repo, 'finish.json', FINISH));
    // Same commands, one different outcome. Suppressing this would silently
    // discard a genuinely different observation.
    const changed = FINISH.slice(0, 2).concat([
      { command: 'polish', call_form: 'invoke', status: 'failed' },
    ]);
    const r = restamp(repo, entriesFile(repo, 'finish3.json', changed));
    assert.strictEqual(r.noop, false);
    assert.deepStrictEqual(r.receipt.meta.impeccable_commands_routed.slice(-3), changed);
  });
});

test('(h) an entry carrying an unknown key is refused, not silently normalized', function () {
  withRepo(function (repo, planRel) {
    seed(repo, planRel, PRE);
    const smuggled = [{
      command: 'polish', call_form: 'invoke', status: 'invoked', phase: 'finish',
    }];
    assert.throws(function () {
      restamp(repo, entriesFile(repo, 'bad.json', smuggled));
    }, /exactly command\/call_form\/status/,
    'schema.js validates the three required fields but does not forbid extras; the writer must');
  });
});

test('(h2) __proto__ in an entry cannot reach the sealed receipt', function () {
  withRepo(function (repo, planRel) {
    seed(repo, planRel, PRE);
    // JSON.parse gives __proto__ as an own property, so it is a 4th key and the
    // key check rejects it before it is ever concat-ed into the receipt.
    const polluted = JSON.parse(
      '[{"command":"polish","call_form":"invoke","status":"invoked","__proto__":{"polluted":true}}]');
    assert.throws(function () {
      restamp(repo, entriesFile(repo, 'proto.json', polluted));
    }, /exactly command\/call_form\/status/);
    assert.strictEqual({}.polluted, undefined, 'no prototype pollution escaped the test');
  });
});

test('(i) a git-tracked ship gate is refused up front (§3.12 no-rehash)', function () {
  withRepo(function (repo, planRel) {
    seed(repo, planRel, PRE);
    assert.throws(function () {
      restampRoutedCommands({
        gate: 'mccp-pr-codex',
        decision: 'routed-x',
        'impeccable-commands-routed-file': entriesFile(repo, 'finish.json', FINISH),
        cwd: repo,
      });
    }, /not eligible for restamp-routed/,
    'store.js already refuses the tracked overwrite, but that rejection happens inside the lock — '
    + 'this one names the rule at the door');
  });
});

test('(j) an empty entries array is a no-op, not a re-seal', function () {
  withRepo(function (repo, planRel) {
    const seeded = seed(repo, planRel, PRE);
    const before = seeded.receipt.receipt_hash;
    const r = restamp(repo, entriesFile(repo, 'empty.json', []));
    assert.strictEqual(r.noop, true);
    assert.strictEqual(r.appended, 0);
    const onDisk = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    assert.strictEqual(onDisk.receipt_hash, before,
      'a finish pass that processed nothing has nothing to seal');
  });
});

test('(k) a malformed entry value is rejected by the schema enum, not written', function () {
  withRepo(function (repo, planRel) {
    seed(repo, planRel, PRE);
    const bad = [{ command: 'polish', call_form: 'invoke', status: 'made-up' }];
    assert.throws(function () {
      restamp(repo, entriesFile(repo, 'badstatus.json', bad));
    }, function (err) {
      return err.code === 'SCHEMA_INVALID';
    });
  });
});

test('(l) a missing entries file fails loudly rather than writing an empty record', function () {
  withRepo(function (repo, planRel) {
    seed(repo, planRel, PRE);
    assert.throws(function () {
      restamp(repo, '.claude/state/does-not-exist.json');
    }, /file not found/);
  });
});

test('(m) an empty entries array with NO receipt fails loudly instead of reporting success', function () {
  // code-review M2 — the empty-entries shortcut returned a path and exit 0
  // without ever looking for the receipt, so a restamp with no target at all
  // read, in a log, exactly like one that landed. Phase 3.6.5 treats exit 0 as
  // "recorded", so that shortcut could retire a real failure silently.
  withRepo(function (repo) {
    assert.throws(function () {
      restamp(repo, entriesFile(repo, 'empty.json', []));
    }, function (err) {
      return err.code === 'RECEIPT_NOT_FOUND';
    }, 'an absent receipt must not be reported as a successful no-op');
  });
});

test('(n) the two no-op shapes are told apart by reason', function () {
  // "produced no outcomes" and "already recorded" are different facts about a
  // cycle. One message for both (the shipped behaviour) told an operator
  // reading the log that a replay had happened when nothing had been produced.
  withRepo(function (repo, planRel) {
    seed(repo, planRel, PRE);

    const empty = restamp(repo, entriesFile(repo, 'empty.json', []));
    assert.strictEqual(empty.noop, true);
    assert.strictEqual(empty.reason, 'no-entries');

    const file = entriesFile(repo, 'finish.json', FINISH);
    const first = restamp(repo, file);
    assert.strictEqual(first.noop, false);
    assert.strictEqual(first.reason, null, 'a real append is not a no-op and carries no reason');

    const replay = restamp(repo, file);
    assert.strictEqual(replay.noop, true);
    assert.strictEqual(replay.reason, 'already-recorded');
  });
});
