'use strict';

// doctor.test.js — 판정 오라클 8종 finding · 계층 우선순위 · 계층 격리 · 무언 규칙.
//
// `diagnose`는 env도 fs도 만지지 않으므로 입력을 전부 손으로 만든다 — 그것이 판정
// 경계를 고정할 수 있는 이유이고, 여기서 «실사용 사례»를 fixture로 재현할 수 있는
// 이유이기도 하다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const doctor = require('../doctor');
const layersMod = require('../settings-layers');

function entry(name, kind, values) {
  return { name: name, kind: kind, values: values || null, default: null, status: 'active', domain: 'gates' };
}
function codes(result) {
  return result.findings.map(function (f) { return f.code + ':' + f.name; }).sort();
}
function find(result, code, name) {
  return result.findings.find(function (f) { return f.code === code && f.name === name; });
}

// ── 층 D — 선언과 프로세스의 대조 ───────────────────────────────────────────
test('not-received: a declared toggle missing from the process is an error', () => {
  // 실사용 3번 사례의 형태 — 사용자 계층이 선언했는데 프로세스에 없다.
  const r = doctor.diagnose({
    declared: { MCCP_CODEX_DISABLED: { value: '1', layer: 'user', shadowed: [] } },
    processEnv: {},
    entries: [entry('MCCP_CODEX_DISABLED', 'bypass-flag')],
  });
  const f = find(r, 'not-received', 'MCCP_CODEX_DISABLED');
  assert.ok(f, 'expected not-received, got ' + JSON.stringify(codes(r)));
  assert.equal(f.severity, 'error');
  assert.equal(f.layer, 'user');
  assert.equal(r.ok, false);
});

test('value-diverged: a different process value is an error and shows both sides', () => {
  const r = doctor.diagnose({
    declared: { MCCP_STOP_LOOP: { value: 'enforce', layer: 'project', shadowed: [] } },
    processEnv: { MCCP_STOP_LOOP: 'observe' },
    entries: [entry('MCCP_STOP_LOOP', 'enum', ['off', 'observe', 'enforce'])],
  });
  const f = find(r, 'value-diverged', 'MCCP_STOP_LOOP');
  assert.ok(f);
  assert.equal(f.severity, 'error');
  assert.equal(f.declared, 'enforce');
  assert.equal(f.actual, 'observe');
  assert.equal(r.ok, false);
});

test('a declared value that arrived intact produces no finding', () => {
  const r = doctor.diagnose({
    declared: { MCCP_STOP_LOOP: { value: 'observe', layer: 'project', shadowed: [] } },
    processEnv: { MCCP_STOP_LOOP: 'observe' },
    entries: [entry('MCCP_STOP_LOOP', 'enum', ['off', 'observe', 'enforce'])],
    vocabularies: { MCCP_STOP_LOOP: { ok: true, values: ['off', 'observe', 'enforce'], source: 'x#Y' } },
  });
  assert.deepEqual(codes(r), []);
  assert.equal(r.ok, true);
});

test('unregistered-mccp: an MCCP_* name absent from the registry is an error', () => {
  const r = doctor.diagnose({
    declared: {},
    processEnv: { MCCP_TOTALLY_NEW: '1' },
    entries: [],
  });
  const f = find(r, 'unregistered-mccp', 'MCCP_TOTALLY_NEW');
  assert.ok(f);
  assert.equal(f.severity, 'error');
  assert.equal(r.ok, false);
});

test('ambient: a registered name nobody declared is info, not an error', () => {
  const r = doctor.diagnose({
    declared: {},
    processEnv: { MCCP_STOP_LOOP: 'observe' },
    entries: [entry('MCCP_STOP_LOOP', 'enum', ['off', 'observe', 'enforce'])],
    vocabularies: { MCCP_STOP_LOOP: { ok: true, values: ['off', 'observe', 'enforce'] } },
  });
  const f = find(r, 'ambient', 'MCCP_STOP_LOOP');
  assert.ok(f);
  assert.equal(f.severity, 'info');
  assert.equal(r.ok, true);
});

// ── 어휘 판정 ───────────────────────────────────────────────────────────────
test('detectHarness reads the markers, not the MCCP_* names it is judging', () => {
  assert.equal(doctor.detectHarness({ CLAUDECODE: '1' }), true);
  assert.equal(doctor.detectHarness({ CLAUDE_CODE_ENTRYPOINT: 'cli' }), true);
  assert.equal(doctor.detectHarness({}), false);
  // 빈 문자열은 표지가 아니다 — 손으로 지운 env가 하네스를 주장하게 두면 강등이 꾫힌다.
  assert.equal(doctor.detectHarness({ CLAUDECODE: '  ' }), false);
  // 이 도구가 판정하는 이름은 표지가 될 수 없다 — 자기 입력으로 자기 엄격을 고르게 된다.
  assert.equal(doctor.detectHarness({ MCCP_CODEX_DISABLED: '1' }), false);
});

test('outside the harness, undelivered declarations are one info, not N errors', () => {
  // 평범한 셸에서 돌리면 선언된 토글 전부가 «도달하지 않았다»로 보인다 — 참이지만
  // 쓸모없는 참이고, error로 보고하면 정상 저장소가 고장난 것처럼 읽힌다.
  const input = {
    declared: {
      MCCP_CODEX_DISABLED: { value: '1', layer: 'user', shadowed: [] },
      MCCP_STOP_LOOP: { value: 'observe', layer: 'project', shadowed: [] },
    },
    processEnv: {},
    entries: [entry('MCCP_CODEX_DISABLED', 'bypass-flag'), entry('MCCP_STOP_LOOP', 'enum', ['off', 'observe'])],
  };

  const outside = doctor.diagnose(Object.assign({}, input, { harness: false }));
  assert.deepEqual(codes(outside), ['env-delivery-unverifiable:*']);
  const f = find(outside, 'env-delivery-unverifiable', '*');
  assert.equal(f.severity, 'info');
  assert.equal(f.count, 2);
  assert.deepEqual(f.names, ['MCCP_CODEX_DISABLED', 'MCCP_STOP_LOOP']);
  assert.equal(outside.ok, true);

  // 같은 입력이라도 하네스 안이면 여전히 error다.
  const inside = doctor.diagnose(Object.assign({}, input, { harness: true }));
  assert.equal(inside.counts.error, 2);
  assert.equal(inside.ok, false);
});

test('harness defaults to true, so lowering the verdict must be asked for', () => {
  // 미지정이 «밖»으로 기본하면 진짜 미도달이 조용히 info로 접힌다.
  const r = doctor.diagnose({
    declared: { MCCP_CODEX_DISABLED: { value: '1', layer: 'user', shadowed: [] } },
    processEnv: {},
    entries: [entry('MCCP_CODEX_DISABLED', 'bypass-flag')],
  });
  assert.ok(find(r, 'not-received', 'MCCP_CODEX_DISABLED'));
  assert.equal(r.ok, false);
});

test('value-outside-vocabulary is a warning, not an error', () => {
  const r = doctor.diagnose({
    declared: {},
    processEnv: { MCCP_STOP_LOOP: 'nope' },
    entries: [entry('MCCP_STOP_LOOP', 'enum', ['off', 'observe', 'enforce'])],
    vocabularies: { MCCP_STOP_LOOP: { ok: true, values: ['off', 'observe', 'enforce'], source: 'x#Y' } },
  });
  const f = find(r, 'value-outside-vocabulary', 'MCCP_STOP_LOOP');
  assert.ok(f);
  assert.equal(f.severity, 'warning');
  assert.equal(r.ok, true);
});

test('list-member-unknown names the parser policy for that toggle (DD8)', () => {
  // 실사용 1번 사례의 형태 — hook id 목록에 오타가 섞였다.
  const r = doctor.diagnose({
    declared: {},
    processEnv: { MCCP_DISABLED_HOOKS: 'pre:bash:real,pre:bash:typo' },
    entries: [entry('MCCP_DISABLED_HOOKS', 'list')],
    vocabularies: { MCCP_DISABLED_HOOKS: { ok: true, values: ['pre:bash:real'], source: 'derive:hook-ids' } },
  });
  const f = find(r, 'list-member-unknown', 'MCCP_DISABLED_HOOKS');
  assert.ok(f, 'expected list-member-unknown, got ' + JSON.stringify(codes(r)));
  assert.equal(f.severity, 'warning');
  assert.deepEqual(f.unknown, ['pre:bash:typo']);
  // 처방이 아니라 «이 파서가 그 토큰을 어떻게 다루는가»를 알려 준다.
  assert.match(f.message, /검증 없이 수용/);
});

test('an unresolved vocabulary produces no verdict — not knowing is not a violation', () => {
  const r = doctor.diagnose({
    declared: {},
    processEnv: { MCCP_STOP_LOOP: 'anything' },
    entries: [entry('MCCP_STOP_LOOP', 'enum', ['off', 'observe'])],
    vocabularies: { MCCP_STOP_LOOP: { ok: false, form: 'gap', reason: 'inline compare' } },
  });
  assert.equal(codes(r).filter(function (c) { return /outside-vocabulary/.test(c); }).length, 0);
});

test('contract-drift wins over any ok verdict for a quarantined toggle (DD4)', () => {
  // 순진한 doctor는 오늘의 values를 믿고 "정상"을 보고한다 — 격리 항목은 바로 그
  // values가 코드와 어긋난 것들이므로, 그 보고가 곧 오교육이다.
  const q = new Map([['MCCP_PLAN_REVIEW', {
    name: 'MCCP_PLAN_REVIEW',
    expected: ['off', 'multi-agent'],
    actual: ['multi-agent'],
    reason: 'documented off does not exist in code',
    owner: 'M2',
  }]]);
  const r = doctor.diagnose({
    declared: {},
    processEnv: { MCCP_PLAN_REVIEW: 'multi-agent' },  // 오늘의 values 기준으로는 유효하다
    entries: [entry('MCCP_PLAN_REVIEW', 'enum', ['off', 'multi-agent'])],
    vocabularies: { MCCP_PLAN_REVIEW: { ok: true, values: ['multi-agent'] } },
    quarantine: q,
  });
  const f = find(r, 'contract-drift', 'MCCP_PLAN_REVIEW');
  assert.ok(f, 'a quarantined toggle must never be reported as fine');
  assert.equal(f.severity, 'warning');
  assert.equal(f.owner, 'M2');
  assert.equal(codes(r).filter(function (c) { return /outside-vocabulary/.test(c); }).length, 0);
});

// ── 소유하지 않는 이름 (DD5 · UI6) ──────────────────────────────────────────
test('foreign names are silent by default and value-free under --all', () => {
  const input = {
    declared: { PATH: { value: '/usr/bin', layer: 'user', shadowed: [] } },
    processEnv: { PATH: '/usr/bin', HOME: '/home/x' },
    entries: [],
  };
  const quiet = doctor.diagnose(input);
  assert.deepEqual(codes(quiet), [], '소유하지 않는 이름에 등급을 주는 검사기는 즉시 무시당한다');

  const loud = doctor.diagnose(Object.assign({}, input, { all: true }));
  const rows = loud.findings.filter(function (f) { return f.code === 'foreign-name'; });
  assert.equal(rows.length, 2);
  rows.forEach(function (f) {
    assert.equal(f.severity, 'info');
    // 값은 절대 싣지 않는다 — 이 도구는 프로세스 전체 env를 볼 수 있다.
    assert.equal(f.actual, undefined, f.name + ': a foreign name must never carry its value');
    assert.equal(f.declared, undefined);
  });
  assert.equal(loud.ok, true);
});

// ── settings-layers — 우선순위와 계층 격리 ─────────────────────────────────
const tmpRoots = [];
function mkRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-layers-'));
  tmpRoots.push(root);
  const home = path.join(root, 'home');
  const repo = path.join(root, 'repo');
  Object.keys(files).forEach(function (rel) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[rel], 'utf8');
  });
  return { root: root, home: home, repo: repo };
}
test.after(() => {
  tmpRoots.forEach((r) => { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) {} });
});

test('layer priority is local > project > user and shadowed values are kept', () => {
  const s = mkRepo({
    'home/.claude/settings.json': JSON.stringify({ env: { A: 'from-user', U: 'user-only' } }),
    'repo/.claude/settings.json': JSON.stringify({ env: { A: 'from-project' } }),
    'repo/.claude/settings.local.json': JSON.stringify({ env: { A: 'from-local' } }),
  });
  const r = layersMod.readLayers({ repoRoot: s.repo, homeDir: s.home });
  assert.equal(r.declared.A.value, 'from-local');
  assert.equal(r.declared.A.layer, 'local');
  assert.deepEqual(r.declared.A.shadowed.map(function (x) { return x.layer + '=' + x.value; }),
    ['user=from-user', 'project=from-project']);
  assert.equal(r.declared.U.value, 'user-only');
});

test('one unreadable layer does not silence the others', () => {
  // 진단이 가장 필요한 순간은 설정이 망가졌을 때다. 그때 침묵하면 도구가 없는 것과 같다.
  const s = mkRepo({
    'home/.claude/settings.json': '{ this is not json',
    'repo/.claude/settings.json': JSON.stringify({ env: { B: 'ok' } }),
  });
  const r = layersMod.readLayers({ repoRoot: s.repo, homeDir: s.home });
  const user = r.layers.find(function (l) { return l.layer === 'user'; });
  assert.equal(user.state, 'unreadable');
  assert.ok(user.error, 'the unreadable layer must say why');
  assert.equal(r.declared.B.value, 'ok', 'the readable layer must still be read');
});

test('an absent layer is normal, not an error', () => {
  const s = mkRepo({ 'repo/.claude/settings.json': JSON.stringify({ env: { C: '1' } }) });
  const r = layersMod.readLayers({ repoRoot: s.repo, homeDir: s.home });
  const states = {};
  r.layers.forEach(function (l) { states[l.layer] = l.state; });
  assert.equal(states.user, 'absent');
  assert.equal(states.local, 'absent');
  assert.equal(states.project, 'present');
});

test('a settings file with no env block is distinguished from an absent one', () => {
  const s = mkRepo({ 'repo/.claude/settings.json': JSON.stringify({ model: 'x' }) });
  const r = layersMod.readLayers({ repoRoot: s.repo, homeDir: s.home });
  const project = r.layers.find(function (l) { return l.layer === 'project'; });
  assert.equal(project.state, 'no-env-block');
});
