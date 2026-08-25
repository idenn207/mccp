'use strict';

// cli.test.js — CLI를 **실제로 spawn**한다.
//
// 모듈을 require해 `main()`을 부르면 배선 누락(require 경로 오타, `require.main`
// 분기, `process.exit` 미연결)을 하나도 못 본다. 단위 test 통과와 «경로가 도는가»는
// 별개 축이고, 이 파일이 후자를 맡는다. 그래서 여기서는 반환값이 아니라 **종료코드와
// stdout**을 본다.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '../cli.js');
// tests → env-contract → lib → scripts → mccp → plugins → repo root (6단계).
const REPO_ROOT = path.resolve(__dirname, '../../../../../..');

function run(args, env) {
  return spawnSync(process.execPath, [CLI].concat(args), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: Object.assign({}, process.env, env || {}),
  });
}

// ── 오용은 exit 2 ───────────────────────────────────────────────────────────
test('no command prints usage and exits 2', () => {
  const r = run([]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /usage: node/);
});

test('an unknown command exits 2 and names the whitelist', () => {
  const r = run(['frobnicate']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown command "frobnicate"/);
  assert.match(r.stderr, /list/);
});

test('an unknown filter value exits 2 rather than reporting an empty result', () => {
  // 검증하지 않으면 오탈자가 «결과 0건»으로 조용히 나와, 없는 것과 못 찾은 것을
  // 구분할 수 없다.
  const r = run(['list', '--domain', 'gatez']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown --domain "gatez"/);
  assert.match(r.stderr, /expected one of/);
});

test('a flag with no value exits 2', () => {
  const r = run(['list', '--domain']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /needs a value/);
});

test('explain with no name exits 2', () => {
  const r = run(['explain']);
  assert.equal(r.status, 2);
});

test('explain of an unknown toggle exits 2', () => {
  const r = run(['explain', 'MCCP_NOT_A_REAL_TOGGLE']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown toggle/);
});

test('a flag the command does not take exits 2 instead of being ignored', () => {
  // 조용히 무시하면 `doctor --all`을 배운 사람이 `list --all`을 치고
  // «--all은 목록에 안 먹는다»는 잘못된 결론을 가져간다.
  const r = run(['list', '--all']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown flag\(s\) for list: --all/);
  assert.match(r.stderr, /accepted: --json, --domain, --status, --kind/);

  const d = run(['doctor', '--domain', 'gates']);
  assert.equal(d.status, 2);
  assert.match(d.stderr, /unknown flag\(s\) for doctor: --domain/);
});

test('stray positional arguments exit 2', () => {
  const two = run(['explain', 'MCCP_PLAN_REVIEW', 'MCCP_STOP_LOOP']);
  assert.equal(two.status, 2);
  assert.match(two.stderr, /exactly one toggle name/);

  const pos = run(['list', 'MCCP_PLAN_REVIEW']);
  assert.equal(pos.status, 2);
  assert.match(pos.stderr, /takes no positional arguments/);
});

// ── list ────────────────────────────────────────────────────────────────────
test('list --json emits parseable JSON derived from the registry', () => {
  const r = run(['list', '--json']);
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.ok(j.count > 100, 'expected the full registry, got ' + j.count);
  assert.equal(j.entries.length, j.count);
  assert.ok(j.entries[0].name && j.entries[0].kind);
});

test('list --domain narrows the result', () => {
  const all = JSON.parse(run(['list', '--json']).stdout).count;
  const gates = JSON.parse(run(['list', '--domain', 'gates', '--json']).stdout);
  assert.ok(gates.count > 0 && gates.count < all);
  gates.entries.forEach(function (e) { assert.equal(e.domain, 'gates'); });
});

// ── explain ─────────────────────────────────────────────────────────────────
test('explain resolves the code vocabulary alongside the documented values', () => {
  const r = run(['explain', 'MCCP_REVIEW_SINGLE_PASS', '--json']);
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.entry.name, 'MCCP_REVIEW_SINGLE_PASS');
  assert.equal(j.vocabulary.ok, true);
  assert.ok(j.vocabulary.values.indexOf('deadline_pressure') !== -1);
  assert.equal(j.quarantined, null);
  assert.ok(j.settingsExample.env.MCCP_REVIEW_SINGLE_PASS !== undefined);
});

// M2가 격리를 전량 배수했으므로 «격리된 토글»을 실제 저장소에서 고를 수 없다. 이
// test는 그 사실 자체를 관측한다 — 격리 시절 대표 항목이던 MCCP_PLAN_REVIEW가 이제
// 깨끗하게 읽히는 것이 배수가 실제로 일어났다는 end-to-end 증거다.
//
// **잃은 것을 적어 둔다**: CLI의 격리 표면(exit 1 + «계약 격리 대상» 출력)은 이제
// 직접 test되지 않는다. CLI를 자식 프로세스로 띄우므로 합성 격리를 주입할 수 없기
// 때문이다. 그 분기의 규칙은 lint.test.js의 합성 격리(L10)와 doctor.test.js의
// DD4 test가 나눠 덮는다.
test('explain of a formerly quarantined toggle now reads clean (M2 배수)', () => {
  const r = run(['explain', 'MCCP_PLAN_REVIEW']);
  assert.equal(r.status, 0, 'M2가 수리했으므로 더 이상 격리가 아니다: ' + r.stdout);
  assert.doesNotMatch(r.stdout, /계약 격리 대상/);
});

// ── doctor ──────────────────────────────────────────────────────────────────
test('doctor --json runs end to end and declares it is not a gate', () => {
  const r = run(['doctor', '--json']);
  assert.ok(r.status === 0 || r.status === 1, 'unexpected exit ' + r.status + ': ' + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.gate, false, 'doctor must declare itself a diagnostic, not a gate (DD6)');
  assert.equal(j.layers.length, 3, 'all three settings tiers must be reported');
  assert.ok(j.counts && typeof j.counts.error === 'number');
});

test('doctor exits 1 when an injected value cannot have been received', () => {
  // 프로세스에만 있고 레지스트리에 없는 MCCP_* 는 error다 — 이 경로가 실제로
  // 종료코드까지 도달하는지 본다.
  const r = run(['doctor', '--json'], { MCCP_DEFINITELY_NOT_REGISTERED: '1' });
  assert.equal(r.status, 1);
  const j = JSON.parse(r.stdout);
  const hit = j.findings.find(function (f) { return f.name === 'MCCP_DEFINITELY_NOT_REGISTERED'; });
  assert.ok(hit, 'expected the injected name to be reported');
  assert.equal(hit.code, 'unregistered-mccp');
  assert.equal(j.ok, false);
});

test('doctor --all adds foreign names without their values', () => {
  const quiet = JSON.parse(run(['doctor', '--json']).stdout);
  const loud = JSON.parse(run(['doctor', '--all', '--json']).stdout);
  const foreignQuiet = quiet.findings.filter(function (f) { return f.code === 'foreign-name'; });
  const foreignLoud = loud.findings.filter(function (f) { return f.code === 'foreign-name'; });
  assert.equal(foreignQuiet.length, 0, 'foreign names must be silent by default (UI6)');
  assert.ok(foreignLoud.length > 0, '--all should surface them');
  foreignLoud.forEach(function (f) {
    assert.equal(f.actual, undefined, f.name + ': a foreign name must never carry its value');
  });
});

test('the human output of doctor names the three layers and the not-a-gate line', () => {
  const r = run(['doctor']);
  assert.match(r.stdout, /settings 계층/);
  assert.match(r.stdout, /user/);
  assert.match(r.stdout, /project/);
  assert.match(r.stdout, /local/);
  assert.match(r.stdout, /진단이며 게이트가 아니다/);
});

// ── 경로 접기 ──────────────────────────────────────────────────
test('doctor folds the home and repo prefixes out of the layer paths', () => {
  // 이 출력이 PR 본문이나 이슈에 복사되는 순간 CLAUDE.md §3.12가 receipt
  // `meta.cwd`에서 막은 것과 같은 형태의 누출이 된다.
  const j = JSON.parse(run(['doctor', '--json']).stdout);
  const byLayer = {};
  j.layers.forEach(function (l) { byLayer[l.layer] = l.path; });
  assert.match(byLayer.user, /^~\//, 'user layer should be home-relative, got ' + byLayer.user);
  assert.match(byLayer.project, /^\.\//, 'project layer should be repo-relative, got ' + byLayer.project);
  assert.match(byLayer.local, /^\.\//, 'local layer should be repo-relative, got ' + byLayer.local);
  j.layers.forEach(function (l) {
    assert.ok(!/^[A-Za-z]:/.test(l.path), l.layer + ': drive-letter path leaked: ' + l.path);
    assert.ok(!/\\/.test(l.path), l.layer + ': backslash path leaked: ' + l.path);
  });
});

test('doctor stays green outside the harness instead of calling every toggle undelivered', () => {
  // `settings.json`의 `env`는 Claude Code가 spawn한 프로세스에만 주입된다. 그러므로
  // «평범한 셸»을 재현하려면 변수를 빈 값으로 덮는 것으로는 부족하다 — 빈 값은
  // «없음»이 아니라 «있지만 다름»이라 value-diverged 를 만든다. 지워서 넘긴다.
  const bare = {};
  Object.keys(process.env).forEach(function (k) {
    if (/^MCCP_/.test(k)) return;
    if (k === 'CLAUDECODE' || k === 'CLAUDE_CODE_ENTRYPOINT') return;
    bare[k] = process.env[k];
  });
  const r = spawnSync(process.execPath, [CLI, 'doctor', '--json'], {
    cwd: REPO_ROOT, encoding: 'utf8', env: bare,
  });
  const j = JSON.parse(r.stdout);
  assert.equal(r.status, 0, '하네스 밖 실행은 종료코드를 바꾸지 않는다: ' + r.stdout.slice(0, 400));
  const notReceived = j.findings.filter(function (f) { return f.code === 'not-received'; });
  assert.equal(notReceived.length, 0, '하네스 밖에서는 미도달을 error로 세지 않는다');
  const agg = j.findings.filter(function (f) { return f.code === 'env-delivery-unverifiable'; });
  assert.equal(agg.length, 1, '대신 한 건으로 묶어 이유를 말해야 한다: ' + JSON.stringify(j.counts));
  assert.equal(agg[0].severity, 'info');
  assert.ok(agg[0].count > 0);
});
