'use strict';

// leadtime-observability M3 — `scanLeadtime` (derive 진입점의 leadtime 축) 회귀 test.
//
// 이 파일이 존재하는 이유: plan 의 Validation 2d·6 이 이 경로를 실행하는데 어떤
// Task 도 만들지 않았고(L2 test/invariant HIGH), 그 두 명령이 plan 자신이 지목한
// HIGH 리스크 **둘의 유일한 falsifier** 다.
//
//   (1) 실패 sentinel 이 절대경로를 git-tracked 파일에 커밋한다 (DD12 실패 경로)
//   (2) `leadtimeScan:false` 인데 축이 계산돼 spawn-free 예산이 깨진다 (DD16)
//
// (1)은 **라이브 probe 로 도달 불가**하다: `audit()` 은 존재하지 않는 root 에서
// throw 하지 않고 평범한 blind summary 를 돌려준다(`corpus.js` 가 없는 디렉토리를
// 삼킨다). 그래서 이 축은 **의존성을 주입해 throw 를 강제**해야 한다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const { scanLeadtime, sentinel, ERROR_KINDS } = require('../../lib/leadtime-derive');
const { emptySummary } = require('../../lib/leadtime-surface');

const LEADTIME_ID = require.resolve('../../lib/leadtime');

// `leadtime` 모듈을 한 번의 require 동안만 갈아끼운다. 실제 throw 를 강제하는
// 유일한 통로 — 라이브 코퍼스로는 이 분기에 닿지 못한다.
function withLeadtimeStub(stub, fn) {
  const cached = require.cache[LEADTIME_ID];
  require.cache[LEADTIME_ID] = new Module(LEADTIME_ID, null);
  require.cache[LEADTIME_ID].filename = LEADTIME_ID;
  require.cache[LEADTIME_ID].loaded = true;
  require.cache[LEADTIME_ID].exports = stub;
  try { return fn(); }
  finally {
    if (cached) require.cache[LEADTIME_ID] = cached;
    else delete require.cache[LEADTIME_ID];
  }
}

function silenceStderr(fn) {
  const orig = process.stderr.write;
  const seen = [];
  process.stderr.write = function (chunk) { seen.push(String(chunk)); return true; };
  try { fn(seen); }
  finally { process.stderr.write = orig; }
}

// ── 1. DD16 — 축은 렌더 경로에서만 계산된다 ─────────────────────────────────

test('leadtimeScan off returns null and never touches the oracle (spawn-free budget)', () => {
  let called = false;
  withLeadtimeStub({
    audit() { called = true; throw new Error('must not run'); },
    summarizeForSurface() { throw new Error('must not run'); },
  }, () => {
    assert.equal(scanLeadtime(process.cwd(), {}), null);
    assert.equal(scanLeadtime(process.cwd(), { leadtimeScan: false }), null);
    assert.equal(scanLeadtime(process.cwd(), undefined), null);
  });
  assert.equal(called, false, 'bare derive must pay zero for this axis');
});

test('leadtimeScan on runs the oracle and returns its projection verbatim', () => {
  const projection = emptySummary([]);
  let auditOpts = null;
  const out = withLeadtimeStub({
    audit(o) { auditOpts = o; return { marker: 'raw-result' }; },
    summarizeForSurface(r) {
      assert.equal(r.marker, 'raw-result', 'the projection consumes the audit result');
      return projection;
    },
  }, () => scanLeadtime('/some/root', { leadtimeScan: true }));

  assert.equal(out, projection, 'the projection is returned unchanged — no second interpretation');
  assert.equal(auditOpts.repoRoot, '/some/root');
  assert.equal(auditOpts.allowGit, true, 'the render path pays for the git witness');
});

// ── 2. DD12 실패 경로 — sentinel 은 닫힌 열거형만 싣는다 ────────────────────

test('an oracle that throws yields a sentinel, never a thrown error', () => {
  silenceStderr(() => {
    const out = withLeadtimeStub({
      audit() { throw new Error("ENOENT: no such file or directory, open 'C:\\\\_project\\\\secret\\\\x.md'"); },
      summarizeForSurface() { throw new Error('unreached'); },
    }, () => scanLeadtime('/root', { leadtimeScan: true }));
    assert.equal(out.state, 'blind');
    assert.deepEqual(out.degradations, [ERROR_KINDS.READ_FAILED]);
  });
});

test('a projection that throws yields its own sentinel kind', () => {
  silenceStderr(() => {
    const out = withLeadtimeStub({
      audit() { return {}; },
      summarizeForSurface() { throw new Error('boom'); },
    }, () => scanLeadtime('/root', { leadtimeScan: true }));
    assert.deepEqual(out.degradations, [ERROR_KINDS.ORACLE_THREW]);
  });
});

test('the sentinel carries NO path, record name or hash — not even from the exception', () => {
  const kinds = Object.keys(ERROR_KINDS).map(k => ERROR_KINDS[k]);
  kinds.forEach((kind) => {
    const ser = JSON.stringify(sentinel(kind));
    assert.ok(!/[\\/]/.test(ser), 'no path separator in the ' + kind + ' sentinel: ' + ser);
    assert.ok(!/\.md\b/.test(ser), 'no record filename');
    assert.ok(!/sha256:/.test(ser), 'no plan hash');
    assert.ok(!/ENOENT|Error|message/.test(ser), 'no raw exception text');
  });
});

test('the exception text goes to stderr and only there', () => {
  silenceStderr((seen) => {
    withLeadtimeStub({
      audit() { throw new Error('SECRET-ABSOLUTE-PATH-MARKER'); },
      summarizeForSurface() { throw new Error('unreached'); },
    }, () => {
      const out = scanLeadtime('/root', { leadtimeScan: true });
      assert.ok(!JSON.stringify(out).includes('SECRET-ABSOLUTE-PATH-MARKER'),
        'the sentinel must not carry the message');
    });
    assert.ok(seen.join('').includes('SECRET-ABSOLUTE-PATH-MARKER'),
      'but the operator must still be able to see it');
  });
});

test('the error kinds are a CLOSED enum — a free string would reopen the leak', () => {
  assert.deepEqual(
    Object.keys(ERROR_KINDS).map(k => ERROR_KINDS[k]).sort(),
    ['module-load-failed', 'oracle-threw', 'read-failed'],
  );
});

// ── 3. sentinel 은 blind 골격의 한 인스턴스다 ───────────────────────────────
//
// 별도 shape 을 쓰면 포매터가 `coverage.panel_records`·`by_anchor` 를 읽는 바로 그
// unknown-input 경로에서 DD3 의 "관측 부재 vs 렌더 결함" 구분이 무너진다.

test('the sentinel is shape-identical to the blind skeleton (only degradations differ)', () => {
  const s = sentinel(ERROR_KINDS.READ_FAILED);
  const skeleton = emptySummary([ERROR_KINDS.READ_FAILED]);
  assert.deepEqual(s, skeleton,
    'a sentinel with its own shape would break the formatter on exactly the failure path');
});

test('a sentinel formats into a normal absent line rather than crashing the renderer', () => {
  const { formatLeadtimeLine, assertCoverageAdjacency } =
    require('../../lib/leadtime-surface');
  const out = formatLeadtimeLine(sentinel(ERROR_KINDS.MODULE_LOAD));
  assert.ok(out.text.includes('미산출'));
  assert.ok(out.parts.note.includes('module-load-failed'), 'the reason is stated: ' + out.parts.note);
  assertCoverageAdjacency(out.text);
});

// ── 4. 라이브 경로 — 합성 repo 에서 spawn 없이 완주한다 ─────────────────────

test('a real scan over an empty synthetic repo completes and stays blind', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-leadtime-src-'));
  try {
    fs.mkdirSync(path.join(root, '.claude', 'reviews'), { recursive: true });
    const out = scanLeadtime(root, { leadtimeScan: true });
    assert.ok(out, 'the scan returns a projection');
    assert.equal(out.tool, 'leadtime');
    assert.equal(out.state, 'blind', 'an empty corpus is blind, not ok-with-zero');
    assert.equal(out.panel_span, null, 'absence is not a distribution of zero');
    assert.ok('ledger_basename' in out.post_panel_span.by_anchor);
    assert.ok('ship_plan_hash' in out.post_panel_span.by_anchor);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
