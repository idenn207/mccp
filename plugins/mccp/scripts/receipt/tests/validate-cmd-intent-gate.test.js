'use strict';

// codex-intent-context M1 Task 8 — validate-cmd is the CANONICAL read-back
// surface for the intent gate (DD5). This pins the full 9-state decision tree
// and the "old receipts keep working" regression.
//
// The receipts are constructed in-memory and written directly (not through
// write.js) so every state — including ones write.js refuses to produce, such
// as an unproven `skipped` — can be exercised. That is the point of a read-back
// surface: it must judge what it FINDS on disk, not only what a cooperating
// writer would have produced.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const { validateCommand } = require('../validate-cmd');
const { classifyIntentMeta } = require('../../lib/intent-context');
const { makeSkeleton } = require('../schema');
const { subjectHash, receiptHash, planAwareMarkdownHash } = require('../hash');

const PRD_PLAN = [
  '# Plan: ig',
  '',
  '**Source PRD**: `.claude/prds/ig.prd.md`',
  '',
  '## User Intent',
  '',
  '| ID | Constraint (user-stated) | Kind |',
  '|---|---|---|',
  '| UI1 | keep the milestone scope narrow | direction |',
  '',
  '## Summary',
  '',
  'body',
  '',
].join('\n');

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-intent-validate-'));
  spawnSync('git', ['init', '-q', root], { cwd: root });
  spawnSync('git', ['-C', root, 'config', 'user.email', 'test@mccp']);
  spawnSync('git', ['-C', root, 'config', 'user.name', 'mccp-test']);
  spawnSync('git', ['-C', root, 'config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  spawnSync('git', ['-C', root, 'add', '.'], { cwd: root });
  spawnSync('git', ['-C', root, 'commit', '-q', '-m', 'init'], { cwd: root });
  const planRel = '.claude/plans/ig.plan.md';
  const planAbs = path.join(root, planRel);
  fs.mkdirSync(path.dirname(planAbs), { recursive: true });
  fs.writeFileSync(planAbs, PRD_PLAN);
  return { root: root, planRel: planRel, planAbs: planAbs };
}

// Seal a receipt the way write.js would, then apply the intent meta under test.
function seedPlanReceipt(repo, intentMeta, opts) {
  const o = opts || {};
  const sha = spawnSync('git', ['-C', repo.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
    .stdout.trim();
  const r = makeSkeleton({
    gate_id: 'mccp-plan-codex',
    phase: 'plan',
    decision_id: 'ig',
    plan_hash: o.planHash || planAwareMarkdownHash(repo.planAbs),
    base_sha: sha,
    head_sha: sha,
    round: 1,
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [], codex_verdict: 'converged' },
  });
  r.meta.command = '/mccp-plan-codex';
  if (intentMeta) Object.assign(r.meta, intentMeta);
  r.subject_hash = subjectHash(r);
  r.receipt_hash = receiptHash(r);
  const dir = path.join(repo.root, '.claude', 'receipts', 'mccp-plan-codex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ig.json'), JSON.stringify(r, null, 2));
  return r;
}

function validateImplement(repo) {
  return validateCommand('mccp:prp-implement', {
    cwd: repo.root, decisionId: 'ig', planPath: repo.planRel,
  });
}

function blockingKinds(res) {
  return res.blocking.map(function (b) { return b.kind || '(none)'; });
}

// ── the 9 states ─────────────────────────────────────────────────────────────

test('(1) out-of-scope gate carries no intent judgement at all', function () {
  const repo = makeRepo();
  // mccp-implement-codex is NOT judged by the intent axis (UI4); seeding a
  // plan receipt that passes lets us confirm the implement gate contributes no
  // intent blocking of its own.
  seedPlanReceipt(repo, { intent_gate_verdict: 'preserved', intent_plan_digest: planAwareMarkdownHash(repo.planAbs) });
  const res = validateImplement(repo);
  assert.strictEqual(blockingKinds(res).indexOf('intent_gate_incomplete'), -1);
});

test('(2) DD2 — key absent (legacy) → ALLOW with an explicit warning', function () {
  const repo = makeRepo();
  seedPlanReceipt(repo, null);
  const res = validateImplement(repo);
  assert.strictEqual(blockingKinds(res).indexOf('intent_gate_incomplete'), -1,
    'legacy receipts must not be retroactively blocked');
  const kinds = res.warnings.map(function (w) { return w.kind; });
  assert.ok(kinds.indexOf('intent_gate_unknown') !== -1,
    'the unknown state must be surfaced, not silent');
});

test('(3) preserved → pass', function () {
  const repo = makeRepo();
  seedPlanReceipt(repo, {
    intent_gate_verdict: 'preserved',
    intent_plan_digest: planAwareMarkdownHash(repo.planAbs),
  });
  const res = validateImplement(repo);
  assert.strictEqual(blockingKinds(res).indexOf('intent_gate_incomplete'), -1);
  assert.strictEqual(res.ok, true);
});

test('(4) skipped + a corroborated proof → pass', function () {
  const repo = makeRepo();
  seedPlanReceipt(repo, {
    intent_gate_verdict: 'skipped',
    intent_skip_proof: 'no_codex_findings',
    intent_plan_digest: planAwareMarkdownHash(repo.planAbs),
  });
  const res = validateImplement(repo);
  assert.strictEqual(blockingKinds(res).indexOf('intent_gate_incomplete'), -1);
});

test('(5) skipped WITHOUT proof → block (an unproven skip is a free pass)', function () {
  const repo = makeRepo();
  seedPlanReceipt(repo, { intent_gate_verdict: 'skipped' });
  const res = validateImplement(repo);
  assert.ok(blockingKinds(res).indexOf('intent_gate_incomplete') !== -1);
  assert.strictEqual(res.ok, false);
});

test('(6) incomplete / conflict_unresolved → block', function () {
  ['incomplete', 'conflict_unresolved'].forEach(function (v) {
    const repo = makeRepo();
    seedPlanReceipt(repo, {
      intent_gate_verdict: v,
      intent_plan_digest: planAwareMarkdownHash(repo.planAbs),
    });
    const res = validateImplement(repo);
    assert.ok(blockingKinds(res).indexOf('intent_gate_incomplete') !== -1, v + ' must block');
    const entry = res.blocking.filter(function (b) { return b.kind === 'intent_gate_incomplete'; })[0];
    // the operator must be told NOT to hand-write the receipt (there is no CLI path)
    assert.match(entry.reason, /INTEGRITY/);
    assert.match(entry.reason, /MCCP_SKIP_INTENT_GATE/);
  });
});

test('(7) in-scope but explicitly null → invariant violation → block', function () {
  const repo = makeRepo();
  seedPlanReceipt(repo, { intent_gate_verdict: null });
  const res = validateImplement(repo);
  assert.ok(blockingKinds(res).indexOf('intent_gate_incomplete') !== -1);
});

test('(8) unknown enum value → block (fail-closed, caught even earlier by schema)', function () {
  const repo = makeRepo();
  seedPlanReceipt(repo, { intent_gate_verdict: 'looks-fine-to-me' });
  const res = validateImplement(repo);
  // The schema enum rejects the value before the intent block is reached, so
  // the blocking KIND is the schema one. What matters — and what is asserted —
  // is that an unrecognized verdict can never read as a pass. Asserting
  // `intent_gate_incomplete` specifically would be asserting a path the
  // validator legitimately short-circuits.
  assert.strictEqual(res.ok, false);
  assert.ok(res.blocking.some(function (b) { return /schema invalid/.test(b.reason); }),
    'expected schema-level rejection of the unknown verdict');
  // ...and the oracle itself is fail-closed on the same value.
  assert.strictEqual(classifyIntentMeta({ intent_gate_verdict: 'looks-fine-to-me' }), 'blocked');
});

test('(9) DD4-2 — intent_plan_digest != plan_hash → block even when verdict passes', function () {
  const repo = makeRepo();
  seedPlanReceipt(repo, {
    intent_gate_verdict: 'preserved',
    intent_plan_digest: 'sha256:' + '0'.repeat(64),
  });
  const res = validateImplement(repo);
  const entry = res.blocking.filter(function (b) { return b.kind === 'intent_gate_incomplete'; })[0];
  assert.ok(entry, 'a verdict reached on a different body must not certify this one');
  assert.match(entry.reason, /intent_plan_digest/);
});

// ── override + ordering ──────────────────────────────────────────────────────

test('DD6 — a receipt sealed under the audited override unblocks the chain', function () {
  const repo = makeRepo();
  seedPlanReceipt(repo, {
    intent_gate_verdict: 'incomplete',
    intent_gate_force_override: true,
    intent_gate_force_override_reason: 'operator accepted the residual gap after manual review',
    intent_plan_digest: planAwareMarkdownHash(repo.planAbs),
  });
  const res = validateImplement(repo);
  assert.strictEqual(blockingKinds(res).indexOf('intent_gate_incomplete'), -1,
    'the override exists precisely so the chain can proceed');
});

test('integrity checks win: a tampered receipt is never read for its intent fields', function () {
  const repo = makeRepo();
  const r = seedPlanReceipt(repo, {
    intent_gate_verdict: 'incomplete',
    intent_plan_digest: planAwareMarkdownHash(repo.planAbs),
  });
  // Post-seal mutation of a SUBJECT field → subject-tamper must fire and the
  // loop must `continue` before the intent block runs.
  // round stays inside the schema range [1,10] so this is a genuine POST-SEAL
  // subject mutation and not merely a schema violation — otherwise the test
  // would prove nothing about tamper detection ordering.
  r.round = 2;
  fs.writeFileSync(
    path.join(repo.root, '.claude', 'receipts', 'mccp-plan-codex', 'ig.json'),
    JSON.stringify(r, null, 2));
  const res = validateImplement(repo);
  const kinds = blockingKinds(res);
  assert.ok(kinds.indexOf('subject-tamper') !== -1, 'tamper must be detected');
  assert.strictEqual(kinds.indexOf('intent_gate_incomplete'), -1,
    'intent fields must not be read from a receipt already known to be tampered');
});

// ── recovery guidance must fit the verdict it is reporting ───────────────────
//
// M1 emitted one sentence for every blocking intent verdict. That sentence names
// the most common cause of `incomplete` as though it were the only one, and it
// actively misdiagnoses the M1.5 verdicts — an operator told to go add
// adjudications when the reviewer is the one who ignored the contract edits the
// wrong file and stays blocked.

function blockingReason(repo) {
  const res = validateImplement(repo);
  const hit = res.blocking.filter(function (b) { return b.kind === 'intent_gate_incomplete'; });
  assert.strictEqual(hit.length, 1, 'expected exactly one intent blocker');
  return hit[0].reason;
}

test('(R) `incomplete` guidance names its other causes, not just the missing row', function () {
  const repo = makeRepo();
  seedPlanReceipt(repo, {
    intent_gate_verdict: 'incomplete',
    intent_plan_digest: planAwareMarkdownHash(repo.planAbs),
  });
  const reason = blockingReason(repo);
  // The receipt does not record WHICH cause fired, so the guidance must not
  // assert one. All four are fixed by the same re-run, which is why naming the
  // range costs nothing.
  ['review_payload_digest', 'count', 'finding_index'].forEach(function (cause) {
    assert.ok(reason.indexOf(cause) !== -1, 'must mention ' + cause + ': ' + reason);
  });
  assert.ok(reason.indexOf('no CLI surface') !== -1,
    'and must keep the integrity warning that applies to every intent verdict');
});

// A mislabel verdict is only reachable from a real comparison, so the schema now
// requires its evidence. Seeding the verdict alone built a shape the producer
// cannot emit — the fixture, not the rule, was wrong.
function mislabelEvidence(extra) {
  return Object.assign({
    intent_mislabel_mode: 'enforce',
    intent_reviewer_contract: 'full',
    intent_claim_counts: {
      total: 1, claimed: 1, unclaimed: 0,
      agree_none: 0, agree_conflict: 0, id_mismatch: 0,
      reviewer_only: 1, author_only: 0,
      reviewer_conflict: 1, author_conflict: 0,
    },
    intent_claims_digest: 'sha256:' + 'c'.repeat(64),
    intent_mislabel_disputes: 0,
    intent_mislabel_audit: [{
      finding_index: 0,
      finding_digest: 'sha256:' + 'b'.repeat(64),
      reviewer_claim: 'UI1',
      author_conflict: 'none',
      classification: 'reviewer-only',
      resolution: 'unresolved',
      dispute_reason: null,
    }],
  }, extra || {});
}

test('(R) the M1.5 verdicts get their own guidance, not the incomplete text', function () {
  const inconclusive = makeRepo();
  seedPlanReceipt(inconclusive, {
    intent_gate_verdict: 'inconclusive',
    intent_plan_digest: planAwareMarkdownHash(inconclusive.planAbs),
    ...mislabelEvidence({
      intent_reviewer_contract: 'partial',
      intent_claim_counts: {
        total: 2, claimed: 1, unclaimed: 1,
        agree_none: 0, agree_conflict: 0, id_mismatch: 0,
        reviewer_only: 1, author_only: 0,
        reviewer_conflict: 1, author_conflict: 0,
      },
    }),
  });
  const a = blockingReason(inconclusive);
  assert.ok(a.indexOf('REVIEWER') !== -1,
    'inconclusive is the reviewer\'s failure, and the text must say so: ' + a);
  assert.ok(a.indexOf('not fixed by editing adjudications') !== -1, a);

  const mislabel = makeRepo();
  seedPlanReceipt(mislabel, {
    intent_gate_verdict: 'mislabel_unresolved',
    intent_plan_digest: planAwareMarkdownHash(mislabel.planAbs),
    ...mislabelEvidence(),
  });
  const b = blockingReason(mislabel);
  assert.ok(b.indexOf('intent_dispute_reason') !== -1,
    'mislabel_unresolved has two concrete resolutions and must name them: ' + b);
  assert.notStrictEqual(a, b, 'the two M1.5 verdicts must not share one message');
});

// ── M2 — the degradation fact rides along with the blocking recovery text ─────
//
// An extra SENTENCE, not an extra verdict. Minting `degraded_incomplete`,
// `degraded_inconclusive` and so on would double the verdict enum to say one
// thing that is equally true of all of them, and every consumer that switches on
// the verdict would need the new arms.

// NOT named `blockingReason` — that name is already taken above by a helper that
// takes a repo. A second declaration would hoist over it and silently hand every
// earlier test the wrong argument.
function blockingReasonOf(res) {
  const hit = res.blocking.filter(function (b) { return b.kind === 'intent_gate_incomplete'; })[0];
  assert.ok(hit, 'expected a blocking intent verdict, got ' + JSON.stringify(blockingKinds(res)));
  return hit.reason;
}

test('M2 — a blocking verdict reached after a degradation says so', function () {
  const repo = makeRepo();
  seedPlanReceipt(repo, {
    intent_gate_verdict: 'incomplete',
    intent_plan_digest: planAwareMarkdownHash(repo.planAbs),
    intent_arbiter: 'author',
    intent_arbiter_degraded_reason: 'unknown-task-failure',
  });
  const reason = blockingReasonOf(validateImplement(repo));
  assert.match(reason, /degraded to author adjudication \(unknown-task-failure\)/,
    'the operator reads this verdict differently once the author was the judge');
  assert.match(reason, /every finding was adjudicated/,
    'and the verdict-specific guidance must still be there — the note is additive');
});

test('M2 — a separated run adds nothing to the recovery text', function () {
  const repo = makeRepo();
  seedPlanReceipt(repo, {
    intent_gate_verdict: 'incomplete',
    intent_plan_digest: planAwareMarkdownHash(repo.planAbs),
    intent_arbiter: 'subagent',
    intent_arbiter_degraded_reason: null,
  });
  const reason = blockingReasonOf(validateImplement(repo));
  assert.doesNotMatch(reason, /degraded to author/);
});

test('M2 — a run that ASKED for the author is not reported as a degradation', function () {
  // `author` alone is a choice, not a fallback. Reporting it as a degradation
  // would tell the operator something failed when nothing did.
  const repo = makeRepo();
  seedPlanReceipt(repo, {
    intent_gate_verdict: 'incomplete',
    intent_plan_digest: planAwareMarkdownHash(repo.planAbs),
    intent_arbiter: 'author',
    intent_arbiter_degraded_reason: null,
  });
  assert.doesNotMatch(blockingReasonOf(validateImplement(repo)), /degraded to author/);
});

test('M2 — a legacy receipt with no arbiter keys keeps its M1 recovery text verbatim', function () {
  const repo = makeRepo();
  seedPlanReceipt(repo, {
    intent_gate_verdict: 'incomplete',
    intent_plan_digest: planAwareMarkdownHash(repo.planAbs),
  });
  const reason = blockingReasonOf(validateImplement(repo));
  assert.doesNotMatch(reason, /degraded/);
  assert.match(reason, /INTEGRITY: do NOT hand-write this receipt/);
});
