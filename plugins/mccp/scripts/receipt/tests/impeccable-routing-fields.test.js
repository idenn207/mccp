'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validate } = require('../schema');

function withRepo(fn) {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/routing-x.plan.md', '# Plan: routing-x\n\nbody\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    return fn(repo, path.relative(repo, plan));
  } finally {
    process.chdir(cwd);
  }
}

test('routing fields: mode + structured commands round-trip and validate', function () {
  withRepo(function (repo, planRel) {
    const routed = [
      { command: 'shape', call_form: 'background', status: 'invoked' },
      { command: 'layout', call_form: 'invoke', status: 'invoked' },
      { command: 'audit', call_form: 'invoke', status: 'failed' },
    ];
    const routedFile = writeFileSync(repo, '.claude/state/routed.json', JSON.stringify(routed));
    const r = write({
      gate: 'mccp-implement-codex',
      decision: 'routing-x',
      plan: planRel,
      'impeccable-routing-mode': 'auto',
      'impeccable-commands-routed-file': path.relative(repo, routedFile),
    });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.meta.impeccable_routing_mode, 'auto');
    assert.strictEqual(r.receipt.meta.impeccable_commands_routed.length, 3);
    assert.strictEqual(r.receipt.meta.impeccable_commands_routed[2].status, 'failed');
  });
});

test('routing fields: absent → null defaults, validates (present-only legacy)', function () {
  withRepo(function (repo, planRel) {
    const r = write({ gate: 'mccp-implement-codex', decision: 'routing-x', plan: planRel });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.meta.impeccable_routing_mode, null);
    assert.strictEqual(r.receipt.meta.impeccable_commands_routed, null);
  });
});

test('M3 a11y_auto_invoked: --a11y-auto-invoked → true, round-trips and validates', function () {
  withRepo(function (repo, planRel) {
    const r = write({
      gate: 'mccp-pr-codex',
      decision: 'routing-x',
      plan: planRel,
      'a11y-auto-invoked': true,
    });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.meta.a11y_auto_invoked, true);
  });
});

test('M3 a11y_auto_invoked: absent → default false, validates (present-only)', function () {
  withRepo(function (repo, planRel) {
    const r = write({ gate: 'mccp-pr-codex', decision: 'routing-x', plan: planRel });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.meta.a11y_auto_invoked, false);
  });
});

test('M3 a11y_auto_invoked: legacy receipt without the field still validates', function () {
  withRepo(function (repo, planRel) {
    const r = write({ gate: 'mccp-pr-codex', decision: 'routing-x', plan: planRel });
    delete r.receipt.meta.a11y_auto_invoked;
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
  });
});

test('M3 a11y_auto_invoked: non-boolean rejected by schema', function () {
  withRepo(function (repo, planRel) {
    const r = write({ gate: 'mccp-pr-codex', decision: 'routing-x', plan: planRel });
    r.receipt.meta.a11y_auto_invoked = 'yes';
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.some((e) => /a11y_auto_invoked/.test(e)), JSON.stringify(v.errors));
  });
});

test('routing fields: invalid mode value rejected by schema', function () {
  withRepo(function (repo, planRel) {
    assert.throws(function () {
      write({
        gate: 'mccp-implement-codex',
        decision: 'routing-x',
        plan: planRel,
        'impeccable-routing-mode': 'turbo',
      });
    }, /SCHEMA_INVALID|impeccable_routing_mode/);
  });
});

test('routing fields: invalid call_form/status enum rejected', function () {
  withRepo(function (repo, planRel) {
    const bad = [{ command: 'shape', call_form: 'teleport', status: 'invoked' }];
    const badFile = writeFileSync(repo, '.claude/state/bad.json', JSON.stringify(bad));
    assert.throws(function () {
      write({
        gate: 'mccp-implement-codex',
        decision: 'routing-x',
        plan: planRel,
        'impeccable-commands-routed-file': path.relative(repo, badFile),
      });
    }, /SCHEMA_INVALID|call_form/);
  });
});

test('routing fields: malformed entry (missing command) rejected', function () {
  withRepo(function (repo, planRel) {
    const bad = [{ call_form: 'invoke', status: 'invoked' }];
    const badFile = writeFileSync(repo, '.claude/state/bad2.json', JSON.stringify(bad));
    assert.throws(function () {
      write({
        gate: 'mccp-implement-codex',
        decision: 'routing-x',
        plan: planRel,
        'impeccable-commands-routed-file': path.relative(repo, badFile),
      });
    }, /SCHEMA_INVALID|command/);
  });
});

// ── v1.32.1 M6 — 여분 키 거부(작성자 + 검증자) · 경로 정규화 ──────────────────
//
// 두 겹인 것이 요점이다. schema는 이미 디스크에 있는 receipt를 판정하고, write는 애초에
// 그런 receipt가 만들어지지 않게 막는다. 한 겹만 두면 나머지 한쪽 경로로 들어온 여분 키가
// 조용히 봉인된다 — producer가 기록했다고 믿는 것과 다른 receipt가 남는다.

test('M6: 여분 키를 실은 entries 파일은 write가 거부한다 (작성자 쪽)', function () {
  withRepo(function (repo, planRel) {
    const routed = [{ command: 'polish', call_form: 'invoke', status: 'invoked', note: 'extra' }];
    const routedFile = writeFileSync(repo, '.claude/state/routed-extra.json', JSON.stringify(routed));
    assert.throws(function () {
      write({
        gate: 'mccp-implement-codex',
        decision: 'routing-x',
        plan: planRel,
        'impeccable-routing-mode': 'auto',
        'impeccable-commands-routed-file': path.relative(repo, routedFile),
      });
    }, /exactly command\/call_form\/status/,
      '여분 키를 가진 entries 파일이 write를 통과했다 — restamp 경로(:1223-1231)와 규율이 갈라졌다');
  });
});

test('M6: 여분 키를 가진 receipt는 schema가 거부한다 (검증자 쪽)', function () {
  withRepo(function (repo, planRel) {
    const routed = [{ command: 'polish', call_form: 'invoke', status: 'invoked' }];
    const routedFile = writeFileSync(repo, '.claude/state/routed-ok.json', JSON.stringify(routed));
    const r = write({
      gate: 'mccp-implement-codex',
      decision: 'routing-x',
      plan: planRel,
      'impeccable-routing-mode': 'auto',
      'impeccable-commands-routed-file': path.relative(repo, routedFile),
    });
    assert.strictEqual(validate(r.receipt).ok, true, '정규 3키가 거부됐다');

    // 디스크에 있는 receipt를 사후에 오염시킨 형태 — write를 거치지 않는 유일한 경로다.
    r.receipt.meta.impeccable_commands_routed[0].note = 'extra';
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, false, '여분 키를 가진 receipt가 valid로 판정됐다');
    assert.ok(v.errors.some(function (e) { return /unexpected key/.test(e); }),
      'unexpected key 메시지가 없다: ' + JSON.stringify(v.errors));
  });
});

test('M6: 상대 경로 entries 파일은 args.cwd 기준으로 해소된다 (process.cwd() 아님)', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/routing-cwd.plan.md', '# Plan: routing-cwd\n\nbody\n');
  writeFileSync(repo, '.claude/state/routed-cwd.json',
    JSON.stringify([{ command: 'polish', call_form: 'invoke', status: 'invoked' }]));

  // 이 test는 chdir하지 않는다. process.cwd()가 repo가 아니라는 것이 전제이고, 그래서
  // 아래 상대 경로는 args.cwd로 해소되지 않으면 읽히지 않는다(수정 전 동작 = null).
  assert.notStrictEqual(path.resolve(process.cwd()), path.resolve(repo),
    'test 전제 붕괴: process.cwd()가 이미 repo다');

  const r = write({
    gate: 'mccp-implement-codex',
    decision: 'routing-cwd',
    plan: path.relative(repo, plan),
    cwd: repo,
    'impeccable-routing-mode': 'auto',
    'impeccable-commands-routed-file': '.claude/state/routed-cwd.json',
  });
  assert.ok(Array.isArray(r.receipt.meta.impeccable_commands_routed),
    'entries 파일이 args.cwd 기준으로 해소되지 않았다 (null로 떨어짐)');
  assert.strictEqual(r.receipt.meta.impeccable_commands_routed.length, 1);
  assert.strictEqual(r.receipt.meta.impeccable_commands_routed[0].command, 'polish');
});

// ── v1.32.1 code-review M2 — 두 벌 키 목록의 일치를 기계로 고정한다 ──────────
//
// `write.js`(producer)와 `schema.js`(validator)는 같은 키 목록을 각자 갖는다. require
// 순환 때문에 한 쪽이 다른 쪽을 import할 수 없어 복제 자체는 정당하지만, **단언 없는
// 복제**는 M6 Task 5가 `measure-evidence.js`에서 지운 결함과 같은 것이다 — 한 쪽을
// 넓혀도 아무 test가 붉지 않고, 그 순간 «무엇이 유효한 entry인가»에 대해 작성자와
// 검증자가 다른 답을 낸다. 여기서 붉히는 것이 그 갈라짐이다.
test('M2: write와 schema의 ROUTED_ENTRY_KEYS는 같은 목록이다', function () {
  const writeKeys = require('../write').ROUTED_ENTRY_KEYS;
  const schemaKeys = require('../schema').ROUTED_ENTRY_KEYS;

  assert.ok(Array.isArray(writeKeys) && writeKeys.length > 0,
    'write.js가 ROUTED_ENTRY_KEYS를 export하지 않는다 — 대조 자체가 불가능해진다');
  assert.ok(Array.isArray(schemaKeys) && schemaKeys.length > 0,
    'schema.js가 ROUTED_ENTRY_KEYS를 export하지 않는다 — 대조 자체가 불가능해진다');

  assert.deepStrictEqual(
    writeKeys.slice().sort(), schemaKeys.slice().sort(),
    'write.js와 schema.js의 키 목록이 갈라졌다. 한 쪽만 고치면 producer가 쓴 receipt를 '
    + 'validator가 거부하거나(또는 그 반대) 하므로 두 곳을 함께 고쳐라.');
});
