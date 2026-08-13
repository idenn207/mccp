'use strict';

// multi-session-work-loop M5 Task 3 — 투영 동등성 + 골든 바이트 회귀 (G3).
//
// **G3이 주장하는 것은 "파서별 M5 전후 동등"이지 "두 파서 상호 동등"이 아니다.**
// `next_chunk` 블록 스칼라에 대해 두 파서는 M5 이전부터 다르게 답했고(선재 ·
// 잠복), 그 격차는 fixture로 pin해 M5가 조용히 넓히거나 좁히지 못하게 한다.
//
// 그리고 G3은 *동등성*을 증명하지 남은 *정확성*을 증명하지 않는다(잔여 10) —
// 그래서 단언 2b가 **미리 고정한 기대값**을 양쪽 파서에 각각 건다. 2만으로는
// "두 파서가 똑같이 틀린" 경우가 통과한다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const stateWriter = require('../../state/state-writer');
const stateInjector = require('../../state/state-injector');
const store = require('../../state/journal-store');
const { project } = require('../state-journal/project');

const FIXED_NOW = '2026-08-13T00:00:00.000Z';
const RealDate = Date;

function freezeClock() {
  global.Date = class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(FIXED_NOW);
      else super(...args);
    }
    static now() { return RealDate.parse(FIXED_NOW); }
  };
}
function unfreezeClock() { global.Date = RealDate; }

function mkRepo(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm5p-' + name + '-'));
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  return root;
}

// M5 **이전** 경로의 재현: readState → mergeState → renderState. 저널을 거치지
// 않는다. 이것이 byte 비교의 좌변이다.
function legacyRender(patches) {
  let state = stateWriter.emptyState();
  for (const p of patches) state = stateWriter.mergeState(state, p);
  return stateWriter.renderState(state);
}

// M5 경로: 실제 update()를 순서대로 호출하고 디스크 바이트를 읽는다.
function journalRender(patches, envOverride) {
  const root = mkRepo('j');
  const saved = process.env.MCCP_STATE_JOURNAL;
  if (envOverride !== undefined) process.env.MCCP_STATE_JOURNAL = envOverride;
  try {
    for (const p of patches) stateWriter.update(root, p);
    return { root: root, bytes: fs.readFileSync(stateWriter.statePath(root), 'utf8') };
  } finally {
    if (saved === undefined) delete process.env.MCCP_STATE_JOURNAL;
    else process.env.MCCP_STATE_JOURNAL = saved;
  }
}

// renderFrontmatter의 조건부 렌더 필드를 **전부** set한 patch 시퀀스. 공통 필드만
// 시험하면 조건부 필드가 투영에서 누락돼도 통과한다.
const FULL_PATCHES = [
  {
    taskFingerprint: 'fp-full', goal: 'goal line',
    plan: ['p1', 'p2'], done: ['d1'], inProgress: 'ip', nextStep: 'ns',
    lastDecision: 'ld', openQuestions: ['q1', 'q2'],
    nextChunk: 'line one\nline two\nline three',
    event: 'receipt_write',
    unsafeCheckpoint: true, confirmRequired: true,
    session_end_imminent: true, chain_aborted: true,
    last_pr_url: 'https://example.invalid/pr/1',
    chain_progress: '{"steps":[]}',
    depCheck: { checkedAt: '2026-01-01T00:00:00.000Z', missing: ['a', 'b'] },
    abort_owner: 'cost', cost_abort_at: '2026-01-02T00:00:00.000Z',
    escalate_pending: true, escalate_pending_decision_id: 'dec-1',
    dispatch_id: 'disp-1', dispatch_id_completed: 'disp-0', dispatch_attempt_count: 2,
    controller_session_id: 'ctrl-1', active_dispatch_count: 3,
  },
];

test('M5 projection: the same patch sequence renders byte-identical before and after M5', () => {
  freezeClock();
  try {
    const patches = [
      { taskFingerprint: 'fp1', goal: 'first goal' },
      { plan: ['a', 'b'], done: ['x'] },
      { event: 'receipt_write', nextStep: 'ship it' },
    ];
    const legacy = legacyRender(patches);
    const m5 = journalRender(patches).bytes;
    assert.strictEqual(m5, legacy, 'M5 must not change a single rendered byte');
  } finally { unfreezeClock(); }
});

test('M5 projection: each parser reads the pre- and post-M5 output identically', () => {
  freezeClock();
  try {
    const patches = FULL_PATCHES;
    const legacyRoot = mkRepo('legacy');
    fs.writeFileSync(stateWriter.statePath(legacyRoot), legacyRender(patches), 'utf8');
    const m5 = journalRender(patches);

    const wLegacy = stateWriter.readState(legacyRoot);
    const wM5 = stateWriter.readState(m5.root);
    assert.deepStrictEqual(wM5, wLegacy, 'state-writer parser: (a) === (b)');

    const iLegacy = stateInjector.readState(legacyRoot);
    const iM5 = stateInjector.readState(m5.root);
    assert.deepStrictEqual(iM5, iLegacy, 'state-injector parser: (a) === (b)');
  } finally { unfreezeClock(); }
});

test('M5 projection: both parsers match pinned expected values, not just each other', () => {
  freezeClock();
  try {
    const m5 = journalRender(FULL_PATCHES);

    const w = stateWriter.readState(m5.root);
    assert.strictEqual(w.frontmatter.state_version, 1);
    assert.strictEqual(w.frontmatter.task_fingerprint, 'fp-full');
    assert.strictEqual(w.frontmatter.created_at, FIXED_NOW);
    assert.strictEqual(w.frontmatter.updated_at, FIXED_NOW);
    assert.strictEqual(w.frontmatter.escalate_pending, true);
    assert.strictEqual(w.frontmatter.confirm_required, true);

    const i = stateInjector.readState(m5.root);
    assert.strictEqual(i.frontmatter.state_version, 1);
    assert.strictEqual(i.frontmatter.task_fingerprint, 'fp-full');
    assert.strictEqual(i.frontmatter.created_at, FIXED_NOW);
    assert.strictEqual(i.frontmatter.updated_at, FIXED_NOW);
    assert.strictEqual(i.frontmatter.escalate_pending, true);
    assert.strictEqual(i.frontmatter.confirm_required, true);
  } finally { unfreezeClock(); }
});

test('M5 projection: the pre-existing next_chunk parser divergence is pinned, not widened', () => {
  freezeClock();
  try {
    const m5 = journalRender([{ nextChunk: 'line one\nline two\nline three' }]);
    const w = stateWriter.readState(m5.root);
    const i = stateInjector.readState(m5.root);
    assert.strictEqual(w.frontmatter.next_chunk, 'line one\nline two\nline three',
      'state-writer consumes the block scalar');
    assert.strictEqual(i.frontmatter.next_chunk, '|',
      'state-injector does NOT — this asymmetry predates M5 and must stay exactly this wide');
  } finally { unfreezeClock(); }
});

test('M5 projection: every conditional frontmatter field survives the projection', () => {
  freezeClock();
  try {
    const m5 = journalRender(FULL_PATCHES);
    const bytes = m5.bytes;
    const required = [
      'next_chunk: |', 'chain_progress: |', 'last_pr_url: ', 'dep_check_at: ',
      'dep_check_missing: ', 'abort_owner: ', 'cost_abort_at: ',
      'escalate_pending: true', 'escalate_pending_decision_id: ',
      'dispatch_id: ', 'dispatch_id_completed: ', 'dispatch_attempt_count: ',
      'controller_session_id: ', 'active_dispatch_count: ',
    ];
    for (const key of required) {
      assert.ok(bytes.indexOf(key) !== -1, 'conditional field missing from projection: ' + key);
    }
    assert.strictEqual(bytes, legacyRender(FULL_PATCHES), 'and the whole render is still identical');
  } finally { unfreezeClock(); }
});

test('M5 projection: a multi-line next_chunk survives genesis bootstrap round-trip', () => {
  freezeClock();
  try {
    // 기존 STATE.md(블록 스칼라 보유)를 genesis로 부트스트랩 → 투영 → 렌더한
    // 결과가 원본과 byte-identical이어야 한다. 부트스트랩이 블록 스칼라를 문자열
    // "|"로 접으면 이 단언이 실패한다.
    const root = mkRepo('blockscalar');
    const original = legacyRender([{ taskFingerprint: 'bs', nextChunk: 'alpha\nbeta\ngamma' }]);
    fs.writeFileSync(stateWriter.statePath(root), original, 'utf8');

    stateWriter.update(root, {});
    const after = fs.readFileSync(stateWriter.statePath(root), 'utf8');
    assert.strictEqual(after, original, 'bootstrap + projection must be a no-op on an existing file');
    assert.strictEqual(stateWriter.readState(root).frontmatter.next_chunk, 'alpha\nbeta\ngamma');
  } finally { unfreezeClock(); }
});

test('M5 projection: degraded mode is sticky across repeated update() calls and recovers only on reseed', () => {
  const root = mkRepo('sticky');
  stateWriter.update(root, { goal: 'before degrade' });
  const beforeCount = store.readRecords({ repoRoot: root }).records.length;

  // 마커를 직접 심어 degraded 구간을 재현한다.
  store.writeDegradedMarker(root, { reason: 'injected for regression' });

  stateWriter.update(root, { goal: 'second' });
  const afterSecond = store.readRecords({ repoRoot: root }).records.length;
  assert.strictEqual(afterSecond, beforeCount, '2nd update takes the direct path — no journal append');
  assert.strictEqual(stateWriter.readState(root).body.goal, 'second', 'but STATE.md still updates');

  stateWriter.update(root, { goal: 'third' });
  const afterThird = store.readRecords({ repoRoot: root }).records.length;
  assert.strictEqual(afterThird, beforeCount, '3rd update did NOT drift back to the journal');
  assert.strictEqual(stateWriter.readState(root).body.goal, 'third');

  const retention = require('../state-journal/retention');
  retention.reseed({ repoRoot: root, state: stateWriter.readState(root), reason: 'test recovery' });
  assert.strictEqual(store.isDegraded({ repoRoot: root }), false);

  stateWriter.update(root, { goal: 'fourth' });
  const afterFourth = store.readRecords({ repoRoot: root }).records.length;
  assert.ok(afterFourth > 0, '4th update is back on the projection path');
  assert.strictEqual(stateWriter.readState(root).body.goal, 'fourth');
});

test('M5 projection: degraded stickiness survives a process boundary', () => {
  // 단일 프로세스 test는 모듈 스코프 변수 구현과 디스크 마커 구현을 구별하지
  // 못한다. sticky의 근거는 디스크 `.degraded`이고 실제로 구간을 가로지르는 것은
  // 세션(=프로세스)이므로, 자식 프로세스로 확인한다.
  const root = mkRepo('crossproc');
  stateWriter.update(root, { goal: 'seed' });
  const baseline = store.readRecords({ repoRoot: root }).records.length;
  store.writeDegradedMarker(root, { reason: 'cross-process regression' });

  const script =
    'const sw=require(' + JSON.stringify(path.resolve(__dirname, '..', '..', 'state', 'state-writer.js')) + ');' +
    'sw.update(' + JSON.stringify(root) + ', { goal: "from child" });';
  execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  const after = store.readRecords({ repoRoot: root }).records.length;
  assert.strictEqual(after, baseline, 'a fresh process must ALSO take the direct path');
  assert.strictEqual(stateWriter.readState(root).body.goal, 'from child');

  const retention = require('../state-journal/retention');
  retention.reseed({ repoRoot: root, state: stateWriter.readState(root) });
  const script2 =
    'const sw=require(' + JSON.stringify(path.resolve(__dirname, '..', '..', 'state', 'state-writer.js')) + ');' +
    'sw.update(' + JSON.stringify(root) + ', { goal: "after reseed" });';
  execFileSync(process.execPath, ['-e', script2], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const recovered = store.readRecords({ repoRoot: root }).records;
  assert.ok(recovered.some(function (r) { return r.kind === 'update'; }),
    'a fresh process returns to the projection path after reseed');
});

test('M5 projection: project() returns normally with every fs write method stubbed to throw', () => {
  // DD4의 "I/O를 갖지 않는다"를 **동적으로** 확인한다. 축 5의 정적 검사는 직접
  // import만 보므로, 전이 의존이 몰래 write하는 경우는 이쪽이 덮는다.
  const realFs = require('fs');
  const writers = ['writeFileSync', 'appendFileSync', 'renameSync', 'mkdirSync', 'unlinkSync',
    'writeFile', 'appendFile', 'openSync', 'createWriteStream'];
  const saved = {};
  for (const w of writers) {
    saved[w] = realFs[w];
    realFs[w] = function () { throw new Error('fs.' + w + ' must not be called from project()'); };
  }
  try {
    const rec = require('../state-journal/record');
    const records = [
      rec.makeRecord({
        session_id: 's', session_epoch: '2026-01-01T00:00:00.000Z', work_unit: 'wu',
        seq: 1, kind: 'update', patch: { goal: 'pure' },
      }),
      rec.makeRecord({
        session_id: 's', session_epoch: '2026-01-01T00:00:00.000Z', work_unit: 'wu',
        seq: 2, kind: 'update', patch: { nextStep: 'still pure' },
      }),
    ];
    const out = project(records, null, {});
    assert.strictEqual(out.body.goal, 'pure');
    assert.strictEqual(out.body.nextStep, 'still pure');
  } finally {
    for (const w of writers) realFs[w] = saved[w];
  }
});

test('M5 projection: shadow mode renders the legacy bytes while still growing the journal', () => {
  // DD7 운영 계약의 양성 단언 2종. 이 둘이 없으면 "복구된다"는 주장이 test로
  // 존재하지 않는다.
  freezeClock();
  try {
    const patches = [
      { taskFingerprint: 'sh', goal: 'shadow goal' },
      { plan: ['s1'], nextStep: 'shadow next' },
    ];
    const shadow = journalRender(patches, 'shadow');
    assert.strictEqual(shadow.bytes, legacyRender(patches),
      'shadow reverts the STATE.md WRITE path to the pre-M5 output byte-for-byte');

    const enforce = journalRender(patches, 'enforce');
    const shadowRecords = store.readRecords({ repoRoot: shadow.root }).records.length;
    const enforceRecords = store.readRecords({ repoRoot: enforce.root }).records.length;
    assert.strictEqual(shadowRecords, enforceRecords,
      'shadow reverts only the write path — the journal keeps growing identically');
  } finally { unfreezeClock(); }
});
