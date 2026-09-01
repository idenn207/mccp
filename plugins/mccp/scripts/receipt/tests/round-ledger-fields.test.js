'use strict';

// env-contract-integrity M3 / Task 6 — receipt가 진짜 라운드 수를 봉인한다.
//
// M3 이전 `resolution.rounds`는 리터럴 `1`이었고 그것을 바꿀 CLI 플래그가 없었다.
// 측정된 15+ 라운드에도 receipt는 `1`을 봉인했다 — 저자의 서술과 봉인된 사실이 같은
// 리터럴이었으니 그 필드는 아무 정보도 나르지 않았다. 여기서 단언하는 것은 그 필드가
// 이제 **원장에서 파생된다**는 것, 그리고 파생이 불가능한 경우가 정직하게 구별된다는
// 것이다.
//
// **fixture는 실제 write 경로를 지난다.** 손으로 조립한 receipt는 subject/receipt hash와
// schema 검증과 plan bind를 건너뛰므로, production이 거부할 receipt에 대해 green이 되는
// 방법이 된다(review-single-pass-fields.test.js의 같은 규약).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validate, makeSkeleton } = require('../schema');
const { receiptHash } = require('../hash');
const ledger = require('../../lib/review-rounds/ledger');
const seal = require('../../lib/review-rounds/seal');

const CLI = path.join(__dirname, '..', 'cli.js');
const GATE = 'mccp-implement-codex';
const SLUG = 'round-fields';

// 주변 env 중화 — 이 저장소의 tracked settings.json이 MCCP_GATE_ROUND_CAP 등을 싣고
// 있어, 봉인 없는 경로를 단언하는 test가 ambient 값에 따라 흔들리면 안 된다.
delete process.env.MCCP_REVIEW_SINGLE_PASS;

// briefing은 receipt-write 경로에 실린 **실제 LLM 호출**이다. 끄지 않으면 test 1건마다
// 그 호출이 timeout(75s 실측)까지 대기해 이 파일 전체가 20분을 넘긴다. 여기서 검증하는
// 것은 라운드 원장이지 briefing이 아니므로, 축을 끄는 것이 정확한 격리다.
process.env.MCCP_BRIEFING = 'off';

function withRepo(fn) {
  const repo = mkTmpRepo();
  writeFileSync(repo, '.claude/plans/rounds.plan.md',
    '# Plan: rounds\n\n## Summary\n\nround ledger fixture.\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    return fn({ repo: repo, planRel: '.claude/plans/rounds.plan.md' });
  } finally { process.chdir(cwd); }
}

function record(repo, n) {
  for (let i = 0; i < n; i += 1) {
    ledger.recordRound({ gateId: GATE, decisionId: SLUG, channel: 'codex',
      classification: 'ok', cwd: repo });
  }
}

function doWrite(ctx, extra) {
  return write(Object.assign({
    gate: GATE, decision: SLUG, plan: ctx.planRel, quiet: true,
  }, extra || {}));
}

// ── 파생 (DD8) ───────────────────────────────────────────────────────────────

test('with no ledger the rounds field keeps its legacy 1, and the real count is 0', () => {
  // schema가 `rounds >= 1`을 요구하므로 빈 원장을 0으로 쓰려면 그 규칙을 완화해야 하고
  // 그것은 별개 축이다. 잃는 것은 없다 — 진짜 수는 옆 필드가 봉인한다.
  withRepo(function (ctx) {
    const r = doWrite(ctx).receipt;
    assert.strictEqual(r.resolution.rounds, 1);
    assert.strictEqual(r.meta.round_ledger_count, 0);
    assert.strictEqual(validate(r).ok, true);
  });
});

test('a ledger with three rounds makes the receipt say three', () => {
  withRepo(function (ctx) {
    record(ctx.repo, 3);
    const r = doWrite(ctx).receipt;
    assert.strictEqual(r.resolution.rounds, 3);
    assert.strictEqual(r.meta.round_ledger_count, 3);
  });
});

test('the derivation is per (gate, decision) — a sibling gate does not leak in', () => {
  withRepo(function (ctx) {
    ledger.recordRound({ gateId: 'mccp-plan-codex', decisionId: SLUG,
      channel: 'codex', cwd: ctx.repo });
    ledger.recordRound({ gateId: GATE, decisionId: 'other-decision',
      channel: 'codex', cwd: ctx.repo });
    const r = doWrite(ctx).receipt;
    assert.strictEqual(r.meta.round_ledger_count, 0);
    assert.strictEqual(r.resolution.rounds, 1);
  });
});

test('rounds counts every channel, because the cap is one budget', () => {
  withRepo(function (ctx) {
    ledger.recordRound({ gateId: GATE, decisionId: SLUG, channel: 'codex', cwd: ctx.repo });
    ledger.recordRound({ gateId: GATE, decisionId: SLUG, channel: 'panel', cwd: ctx.repo });
    assert.strictEqual(doWrite(ctx).receipt.resolution.rounds, 2);
  });
});

// ── 열화가 침묵하지 않는다 (Implement-Codex R1 F3) ───────────────────────────

test('no usable seal seals round_cap=null — enforcement did not run', () => {
  // `null`은 "미설정"이 아니라 **의미**다: 이 실행은 등록되지 않았고, 따라서 옆의
  // count는 정본이 아니다. 그 구별이 없으면 열화된 실행과 깨끗한 실행이 receipt 위에서
  // 똑같이 보인다.
  withRepo(function (ctx) {
    record(ctx.repo, 2);
    const r = doWrite(ctx).receipt;
    assert.strictEqual(r.meta.round_cap, null);
    assert.strictEqual(r.meta.round_cap_pinned_by, null);
    assert.strictEqual(r.meta.round_ledger_count, 2);
  });
});

test('a usable seal seals the cap that was actually in force', () => {
  withRepo(function (ctx) {
    seal.sealCap({
      gitDir: seal.resolveGitDir(ctx.repo),
      env: { MCCP_GATE_ROUND_CAP: '3' },
      gateId: GATE, decisionId: SLUG,
    });
    const r = doWrite(ctx).receipt;
    assert.strictEqual(r.meta.round_cap, 3);
    assert.strictEqual(r.meta.round_cap_pinned_by, null, 'nothing pinned it');
  });
});

test('a pinned cap names the axis that pinned it', () => {
  withRepo(function (ctx) {
    seal.sealCap({
      gitDir: seal.resolveGitDir(ctx.repo),
      env: { MCCP_GATE_ROUND_CAP: '3', MCCP_REVIEW_SINGLE_PASS: 'deadline_pressure' },
      gateId: GATE, decisionId: SLUG,
    });
    const r = doWrite(ctx).receipt;
    assert.strictEqual(r.meta.round_cap, 1);
    assert.match(String(r.meta.round_cap_pinned_by), /single-pass/);
  });
});

test('a corrupt ledger seals count=null, never 0', () => {
  // 0으로 접으면 파일 하나를 망가뜨리는 것이 곧 "라운드가 없었다"는 봉인된 사실이 된다.
  withRepo(function (ctx) {
    record(ctx.repo, 2);
    fs.writeFileSync(ledger.resolveStatePath({ gateId: GATE, decisionId: SLUG, cwd: ctx.repo }),
      '{ broken');
    const r = doWrite(ctx).receipt;
    assert.strictEqual(r.meta.round_ledger_count, null);
    assert.strictEqual(r.resolution.rounds, 1, 'an unreadable ledger cannot derive a count');
    assert.strictEqual(validate(r).ok, true);
  });
});

// ── DD9 — 명시 rounds가 원장과 어긋나면 fail-closed ─────────────────────────

test('a resolution-file agreeing with the ledger is accepted', () => {
  withRepo(function (ctx) {
    record(ctx.repo, 2);
    const rf = path.join(ctx.repo, 'resolution.json');
    fs.writeFileSync(rf, JSON.stringify({
      converged: true, rounds: 2, accepted: [], rejected: [], open_questions: [],
    }));
    assert.strictEqual(doWrite(ctx, { 'resolution-file': rf }).receipt.resolution.rounds, 2);
  });
});

test('a resolution-file contradicting the ledger throws instead of being overridden', () => {
  // 조용히 원장 쪽을 채택하면 목적(저자 서술과 봉인된 사실의 분리)은 달성되지만
  // "저자가 다른 수를 믿고 있었다"는 관측 가능한 사건이 사라진다.
  withRepo(function (ctx) {
    record(ctx.repo, 3);
    const rf = path.join(ctx.repo, 'resolution.json');
    fs.writeFileSync(rf, JSON.stringify({
      converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [],
    }));
    assert.throws(function () { doWrite(ctx, { 'resolution-file': rf }); },
      function (e) {
        assert.strictEqual(e.code, 'ROUND_LEDGER_MISMATCH');
        assert.match(e.message, /rounds=1/);
        assert.match(e.message, /records 3/);
        return true;
      });
  });
});

test('the contradiction is fail-closed: exit 12 and NO receipt on disk', () => {
  // throw만 하고 receipt가 남으면 fail-closed가 아니다. CLI 계층까지 내려가 확인한다.
  const repo = mkTmpRepo();
  writeFileSync(repo, '.claude/plans/rounds.plan.md',
    '# Plan: rounds\n\n## Summary\n\nround ledger fixture.\n');
  ledger.recordRound({ gateId: GATE, decisionId: SLUG, channel: 'codex', cwd: repo });

  const rf = path.join(repo, 'resolution.json');
  fs.writeFileSync(rf, JSON.stringify({
    converged: true, rounds: 7, accepted: [], rejected: [], open_questions: [],
  }));

  const r = spawnSync(process.execPath, [CLI, 'write',
    '--gate', GATE, '--decision', SLUG,
    '--plan', '.claude/plans/rounds.plan.md',
    '--resolution-file', rf, '--quiet',
  ], { cwd: repo, encoding: 'utf8' });

  assert.strictEqual(r.status, 12, r.stdout + r.stderr);
  assert.strictEqual(
    fs.existsSync(path.join(repo, '.claude', 'receipts', GATE, SLUG + '.json')), false,
    'the write did not happen');
});

test('a resolution-file without a rounds key is not a contradiction', () => {
  withRepo(function (ctx) {
    record(ctx.repo, 2);
    const rf = path.join(ctx.repo, 'resolution.json');
    fs.writeFileSync(rf, JSON.stringify({
      converged: true, accepted: [], rejected: [], open_questions: [],
    }));
    assert.strictEqual(doWrite(ctx, { 'resolution-file': rf }).receipt.resolution.rounds, 2);
  });
});

// ── present-only 계약 (§3.12) ────────────────────────────────────────────────

test('the three fields are NOT in makeSkeleton', () => {
  // skeleton에 키를 더하면 모든 receipt의 hash 입력이 바뀌어 git-tracked ship corpus가
  // 흔들린다. 부재는 "이 빌드에는 이 축이 없었다"는 세 번째 상태다.
  const sk = makeSkeleton({
    gate_id: GATE, phase: 'implement', decision_id: 'skeleton-fixture',
    plan_hash: 'sha256:' + '0'.repeat(64),
    base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40),
    subject_hash: 'sha256:' + '1'.repeat(64), receipt_hash: 'sha256:' + '2'.repeat(64),
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
  });
  ['round_ledger_count', 'round_cap', 'round_cap_pinned_by'].forEach(function (k) {
    assert.ok(!Object.prototype.hasOwnProperty.call(sk.meta, k),
      'meta.' + k + ' must be present-only');
  });
  sk.meta.command = '/mccp:prp-implement';
  sk.meta.cwd = '/tmp/fixture';
  sk.meta.git_branch = 'fixture';
  assert.strictEqual(validate(sk).ok, true, 'a receipt without the axis still validates');
});

test('the audit fields are inside the receipt hash, not carved out', () => {
  // hash 밖의 감사 필드는 **서명되지 않은** 필드이고, validate-cmd의 receipt-tamper
  // 검사가 그 편집을 지나친다 (§3.13.2의 같은 판단).
  withRepo(function (ctx) {
    record(ctx.repo, 2);
    const r = doWrite(ctx).receipt;
    const before = receiptHash(r);
    const tampered = JSON.parse(JSON.stringify(r));
    tampered.meta.round_ledger_count = 1;
    assert.notStrictEqual(receiptHash(tampered), before);
  });
});

// ── schema 형태 계약 ─────────────────────────────────────────────────────────

function shapeFixture(meta) {
  const sk = makeSkeleton({
    gate_id: GATE, phase: 'implement', decision_id: 'shape-fixture',
    plan_hash: 'sha256:' + '0'.repeat(64),
    base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40),
    subject_hash: 'sha256:' + '1'.repeat(64), receipt_hash: 'sha256:' + '2'.repeat(64),
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
  });
  sk.meta.command = '/mccp:prp-implement';
  sk.meta.cwd = '/tmp/fixture';
  sk.meta.git_branch = 'fixture';
  Object.assign(sk.meta, meta);
  return sk;
}

test('schema accepts the three honest states and rejects impossible ones', () => {
  assert.strictEqual(validate(shapeFixture({ round_ledger_count: 0, round_cap: null,
    round_cap_pinned_by: null })).ok, true, 'counted, not enrolled');
  assert.strictEqual(validate(shapeFixture({ round_ledger_count: null, round_cap: null,
    round_cap_pinned_by: null })).ok, true, 'ledger unreadable');
  assert.strictEqual(validate(shapeFixture({ round_ledger_count: 2, round_cap: 3,
    round_cap_pinned_by: 'single-pass' })).ok, true, 'enrolled and pinned');

  assert.strictEqual(validate(shapeFixture({ round_ledger_count: -1 })).ok, false);
  assert.strictEqual(validate(shapeFixture({ round_ledger_count: 1.5 })).ok, false);
  assert.strictEqual(validate(shapeFixture({ round_ledger_count: '2' })).ok, false);
  assert.strictEqual(validate(shapeFixture({ round_cap: 0 })).ok, false);
  assert.strictEqual(validate(shapeFixture({ round_cap: 'three' })).ok, false);
  assert.strictEqual(validate(shapeFixture({ round_cap_pinned_by: '' })).ok, false);
});

test('a pin without a cap is refused — it would claim an enforcement with no value', () => {
  const bad = validate(shapeFixture({ round_cap: null, round_cap_pinned_by: 'single-pass' }));
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.errors.join(' ').indexOf('round_cap_pinned_by') !== -1);
});
