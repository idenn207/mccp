'use strict';

// leadtime-observability M3 — distribution writer 회귀 test.
//
// 판정은 **반환값**으로 한다. mtime 만 보면 "정상 skip"(내용 동일)과 "writer 가
// fail-open 으로 조용히 죽음"이 구분되지 않는다 — 두 경우 다 파일이 그대로다.
//
// 고정하는 것 넷: content-stability(DD6) · 원자성 + unique tmp(§3.6) · tracked
// 목적지(DD5) · payload 에 시각 필드 없음(DD6).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  REL_DIR,
  FILENAME,
  distributionPath,
  serialize,
  writeDistribution,
} = require('../leadtime-distribution');
const { emptySummary } = require('../leadtime-surface');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-leadtime-dist-'));
}

function summary(over) {
  const s = emptySummary([]);
  s.state = 'ok';
  s.coverage = { panel_records: 10, measurable: 8, counts_are_lower_bound: true };
  s.panel_span = { n: 8, min: 1, p50: 2, p90: 3, max: 4 };
  return Object.assign(s, over || {});
}

test('the destination is .claude/state/leadtime/, not .claude/cache/ (DD5)', () => {
  assert.equal(REL_DIR, path.join('.claude', 'state', 'leadtime'));
  assert.equal(FILENAME, 'distribution.json');
  const p = distributionPath('/repo');
  assert.ok(!p.includes(path.join('.claude', 'cache')),
    'a gitignored destination cannot satisfy "C7 이 인용할 파일이 남는다" (UI4)');
});

test('a first write creates the file and reports it', () => {
  const root = tmpRoot();
  try {
    const res = writeDistribution(root, summary());
    assert.equal(res.written, true);
    assert.equal(res.reason, 'created');
    assert.ok(fs.existsSync(distributionPath(root)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an identical payload is NOT rewritten — the return value says so, not the mtime', () => {
  const root = tmpRoot();
  try {
    writeDistribution(root, summary());
    const again = writeDistribution(root, summary());
    assert.equal(again.written, false);
    assert.equal(again.reason, 'unchanged',
      'a silent no-op and a fail-open death look identical on disk; only the return value separates them');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a changed payload IS rewritten', () => {
  const root = tmpRoot();
  try {
    writeDistribution(root, summary());
    const changed = writeDistribution(root, summary({ state: 'degraded' }));
    assert.equal(changed.written, true);
    assert.equal(changed.reason, 'changed');
    const onDisk = JSON.parse(fs.readFileSync(distributionPath(root), 'utf8'));
    assert.equal(onDisk.state, 'degraded');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('no summary means no write — an uncomputed axis does not publish an empty file', () => {
  const root = tmpRoot();
  try {
    const res = writeDistribution(root, null);
    assert.equal(res.written, false);
    assert.equal(res.reason, 'no-summary');
    assert.equal(fs.existsSync(distributionPath(root)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the payload carries no wall-clock field — content-stability is structural (DD6)', () => {
  const text = serialize(summary());
  assert.ok(!/written_at|generated_at|timestamp|"derived_at"/.test(text),
    'a time field would make every render dirty a git-tracked file: ' + text.slice(0, 200));
});

test('serialization is key-order stable so the same content is the same bytes', () => {
  const a = serialize({ b: 1, a: { d: 2, c: 3 } });
  const b = serialize({ a: { c: 3, d: 2 }, b: 1 });
  assert.equal(a, b);
});

test('no tmp file survives a successful write, and the tmp name is pid+nonce scoped (§3.6)', () => {
  const root = tmpRoot();
  try {
    writeDistribution(root, summary());
    const dir = path.dirname(distributionPath(root));
    const leftovers = fs.readdirSync(dir).filter(f => f.endsWith('.tmp'));
    assert.deepEqual(leftovers, [], 'a tracked directory must not keep tmp orphans');

    // 이름 규약 자체를 고정한다 — 고정 이름 tmp 는 동시 writer 가 충돌하고,
    // 크래시 시 tracked 디렉토리에 부분 JSON 을 남긴다.
    const src = fs.readFileSync(require.resolve('../leadtime-distribution'), 'utf8');
    assert.ok(/process\.pid/.test(src) && /randomBytes/.test(src),
      'the tmp name must include pid + nonce');
    assert.ok(/unlinkSync/.test(src), 'a failed rename must not leave the tmp behind');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
