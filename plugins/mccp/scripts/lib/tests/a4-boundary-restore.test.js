'use strict';

// multi-session-work-loop M5 Task 8 — A4 경계 스코프 분자 회귀 (G5).
//
// 기존 스캐너의 결함은 producer 부재가 아니라 **계산 오염**이었다: 현재 세션
// 자신의 sidecar까지 교차해 first session이 자기 handoff를 "복원됨"으로
// self-credit → 가짜 100%. 여기서는 그 self-credit이 **구조적으로 불가능**함을
// 고정한다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const a4 = require('../msw-metrics/a4-boundary-restore');
const handoffItems = require('../../state/handoff-items');
const record = require('../state-journal/record');

function rec(over) {
  return record.makeRecord(Object.assign({
    session_id: 's', session_epoch: '2026-01-01T00:00:00.000Z',
    work_unit: 'wu', seq: 1, kind: 'update', patch: { goal: 'g' },
  }, over || {}));
}

const ITEM_A = { type: 'plan', id: 'alpha.plan.md' };
const ITEM_B = { type: 'plan', id: 'beta.plan.md' };
const ITEM_C = { type: 'fix_task', id: 'fix-task' };

test('M5 a4: a single session cannot credit itself', () => {
  // 경계가 없으므로 자기 sidecar가 아무리 많아도 분자가 생기지 않는다.
  const out = a4.deriveA4Boundary({
    records: [rec({ session_id: 'only', prev_session_id: null })],
    sidecars: { only: [ITEM_A, ITEM_B, ITEM_C] },
  });
  assert.strictEqual(out.status, 'insufficient');
  assert.strictEqual(out.numerator, null);
  assert.strictEqual(out.boundary_count, 0);
});

test('M5 a4: unknown session ids are excluded from boundaries', () => {
  // DD12 마지막 항 — `'unknown'` 둘을 서로 다른 세션으로 세면 self-credit이
  // 뒷문으로 돌아온다. 기록은 하되 계상하지 않는다.
  const out = a4.deriveA4Boundary({
    records: [rec({ session_id: 'unknown', prev_session_id: 'unknown' })],
    sidecars: { unknown: [ITEM_A] },
  });
  assert.strictEqual(out.boundary_count, 0);
  assert.strictEqual(out.status, 'insufficient');
});

test('M5 a4: a genesis-only repository reports insufficient, not zero percent', () => {
  // DD10 — 이전 세션이 없는데 복원율을 계산하는 것은 self-credit과 같은 종류의
  // 거짓 값이다. 클론 직후 A4가 잠시 insufficient로 돌아가는 것은 정직한 표기다.
  const out = a4.deriveA4Boundary({
    records: [rec({ kind: 'genesis', prev_session_id: null, patch: null })],
    sidecars: {},
  });
  assert.strictEqual(out.status, 'insufficient');
  assert.strictEqual(out.value, null);
});

test('M5 a4: two real sessions count only the items that actually crossed', () => {
  const out = a4.deriveA4Boundary({
    records: [
      rec({ session_id: 'sess-2', prev_session_id: 'sess-1', seq: 2 }),
    ],
    sidecars: {
      'sess-1': [ITEM_A, ITEM_B, ITEM_C],   // 이전 세션이 남긴 3건
      'sess-2': [ITEM_B, ITEM_C],           // 그중 2건만 이어받았다
    },
  });
  assert.strictEqual(out.status, 'computed');
  assert.strictEqual(out.denominator, 3);
  assert.strictEqual(out.numerator, 2);
  assert.strictEqual(out.boundary_count, 1);
});

test('M5 a4: the numerator never exceeds the denominator', () => {
  const out = a4.deriveA4Boundary({
    records: [rec({ session_id: 'b', prev_session_id: 'a', seq: 2 })],
    sidecars: { a: [ITEM_A], b: [ITEM_A, ITEM_B, ITEM_C] },
  });
  assert.ok(out.numerator <= out.denominator,
    'items the next session added on its own are not restorations');
  assert.strictEqual(out.denominator, 1);
});

test('M5 a4: numerator and denominator are non-negative integers', () => {
  const out = a4.deriveA4Boundary({
    records: [rec({ session_id: 'b', prev_session_id: 'a', seq: 2 })],
    sidecars: { a: [ITEM_A, ITEM_B], b: [ITEM_A] },
  });
  assert.ok(Number.isInteger(out.numerator) && out.numerator >= 0);
  assert.ok(Number.isInteger(out.denominator) && out.denominator >= 0);
});

test('M5 a4: a computed status always carries a denominator of at least one', () => {
  // 분모 0에 `computed`를 붙이면 0/0을 "측정됐다"로 보고하게 된다.
  const empty = a4.deriveA4Boundary({
    records: [rec({ session_id: 'b', prev_session_id: 'a', seq: 2 })],
    sidecars: {},
  });
  assert.notStrictEqual(empty.status, 'computed');
  assert.strictEqual(empty.status, 'insufficient');

  const real = a4.deriveA4Boundary({
    records: [rec({ session_id: 'b', prev_session_id: 'a', seq: 2 })],
    sidecars: { a: [ITEM_A], b: [ITEM_A] },
  });
  assert.strictEqual(real.status, 'computed');
  assert.ok(real.denominator >= 1);
});

test('M5 a4: the CL-5 fixture runs with cwd different from repoRoot', () => {
  // `cwd === repoRoot`인 환경에서는 두 경로가 우연히 같은 곳으로 풀려 부분 수정을
  // 못 잡는다. fixture 스스로 그 조건을 거부해야 한다.
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm5a4-repo-'));
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'm5a4-cwd-'));
  fs.mkdirSync(path.join(repoRoot, '.claude', 'state'), { recursive: true });

  const savedCwd = process.cwd();
  process.chdir(elsewhere);
  try {
    assert.notStrictEqual(path.resolve(process.cwd()), path.resolve(repoRoot),
      'the fixture MUST run with cwd !== repoRoot or it proves nothing');

    const resolved = handoffItems.resolveHandoffRoot({ projectRoot: repoRoot, cwd: process.cwd() });
    assert.strictEqual(resolved.ok, true);
    assert.strictEqual(resolved.root, repoRoot);

    handoffItems.writeHandoffItems('sess-x', [ITEM_A], {
      stateDir: path.join(resolved.root, '.claude', 'state'),
    });
    assert.ok(fs.existsSync(path.join(repoRoot, '.claude', 'state', 'sess-x.handoff-items.json')),
      'the sidecar lands under repoRoot, not cwd');
    assert.ok(!fs.existsSync(path.join(elsewhere, '.claude', 'state', 'sess-x.handoff-items.json')),
      'and nothing was written next to cwd');
  } finally {
    process.chdir(savedCwd);
  }
});

test('M5 a4: an empty projectRoot falls back to the walk-up instead of collapsing to cwd', () => {
  // `observer-sessions.js:99`는 global 컨텍스트에서 `projectRoot: ''`를 반환하고,
  // 그러면 `path.join('', …)`이 cwd 상대로 접혀 고치려던 CL-5가 그대로 남는다.
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm5a4-walkup-'));
  fs.mkdirSync(path.join(repoRoot, '.claude', 'state'), { recursive: true });
  const nested = path.join(repoRoot, 'a', 'b', 'c');
  fs.mkdirSync(nested, { recursive: true });

  const resolved = handoffItems.resolveHandoffRoot({ projectRoot: '', cwd: nested });
  assert.strictEqual(resolved.ok, true);
  assert.strictEqual(resolved.source, 'walk-up');
  assert.strictEqual(path.resolve(resolved.root), path.resolve(repoRoot));
});

test('M5 a4: an unresolvable root skips the write and leaves a countable marker', () => {
  // skip이 조용하면 CL-5 우회와 구별되지 않는다. 마커 + msw-event 2채널로
  // 셀 수 있게 만든다(SHIP-2의 3-state 판정 입력).
  const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'm5a4-noclaude-'));

  // walk-up을 **주입으로** 실패시킨다. 실제 디렉토리로 재현하려 하면 이 환경에서는
  // 성공한다 — Windows의 temp 경로 조상(`C:\Users\<user>`)에 진짜 `.claude/`가
  // 있어서 40단계 walk-up이 그것을 찾아낸다. 즉 "repo 밖"을 파일시스템으로
  // 흉내 내는 fixture는 환경에 종속되고, 그 종속이 곧 이 단언의 무력화다.
  const mswEvents = require('../../state/msw-events');
  const savedDiscover = mswEvents.discoverRepoRoot;
  mswEvents.discoverRepoRoot = function () { return null; };
  try {
    const resolved = handoffItems.resolveHandoffRoot({ projectRoot: '', cwd: isolated });
    assert.strictEqual(resolved.ok, false);
    assert.strictEqual(resolved.source, 'unresolved');
    assert.ok(fs.existsSync(path.join(isolated, '.claude', 'state',
      handoffItems.HANDOFF_ROOT_UNRESOLVED_MARKER)),
      'the marker records that the skip happened, so 0 artifacts is diagnosable');
  } finally {
    mswEvents.discoverRepoRoot = savedDiscover;
  }
});
