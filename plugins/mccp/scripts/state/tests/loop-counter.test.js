'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lc = require('../loop-counter');

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-loop-counter-'));
}

test('fingerprintFromPrompt is deterministic and 12-hex', () => {
  const a = lc.fingerprintFromPrompt('hello world');
  const b = lc.fingerprintFromPrompt('hello world');
  assert.strictEqual(a, b);
  assert.match(a, /^[0-9a-f]{12}$/);
});

test('fingerprintFromPrompt diverges on different inputs', () => {
  const a = lc.fingerprintFromPrompt('task a');
  const b = lc.fingerprintFromPrompt('task b');
  assert.notStrictEqual(a, b);
});

test('fingerprint only considers first 200 chars', () => {
  const head = 'x'.repeat(200);
  const a = lc.fingerprintFromPrompt(head);
  const b = lc.fingerprintFromPrompt(head + ' tail differs');
  assert.strictEqual(a, b);
});

test('get returns zero baseline for new fingerprint', () => {
  const repo = mkRepo();
  const fp = lc.fingerprintFromPrompt('new task');
  const got = lc.get(repo, fp);
  assert.strictEqual(got.count, 0);
  assert.strictEqual(got.lastAt, null);
  assert.strictEqual(got.fixTaskHash, null);
});

test('bump increments and persists across reads', () => {
  const repo = mkRepo();
  const fp = lc.fingerprintFromPrompt('task A');
  const first = lc.bump(repo, fp, 'fixhash-0');
  assert.strictEqual(first.count, 1);
  assert.strictEqual(first.fixTaskHash, 'fixhash-0');
  const second = lc.bump(repo, fp, 'fixhash-1');
  assert.strictEqual(second.count, 2);
  assert.strictEqual(second.fixTaskHash, 'fixhash-1');
  const reload = lc.get(repo, fp);
  assert.strictEqual(reload.count, 2);
});

test('bump is capped at MAX_COUNT (2)', () => {
  const repo = mkRepo();
  const fp = lc.fingerprintFromPrompt('cap me');
  lc.bump(repo, fp, 'a');
  lc.bump(repo, fp, 'b');
  const capped = lc.bump(repo, fp, 'c');
  assert.strictEqual(capped.count, lc.MAX_COUNT);
});

test('reset clears a specific fingerprint without touching others', () => {
  const repo = mkRepo();
  const fpA = lc.fingerprintFromPrompt('keep me');
  const fpB = lc.fingerprintFromPrompt('reset me');
  lc.bump(repo, fpA, 'a');
  lc.bump(repo, fpB, 'b');
  lc.reset(repo, fpB);
  assert.strictEqual(lc.get(repo, fpA).count, 1);
  assert.strictEqual(lc.get(repo, fpB).count, 0);
});

test('corrupt JSON file collapses to empty state on next read', () => {
  const repo = mkRepo();
  const target = lc.counterPath(repo);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '{not valid json', 'utf8');
  const state = lc.readState(repo);
  assert.deepStrictEqual(state, lc.emptyState());
});

test('wrong version collapses to empty state', () => {
  const repo = mkRepo();
  const target = lc.counterPath(repo);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ version: 99, tasks: { foo: { count: 5 } } }));
  const state = lc.readState(repo);
  assert.deepStrictEqual(state, lc.emptyState());
});

test('writeState uses unique tmp suffix per process so no shared race target', () => {
  const repo = mkRepo();
  const fp = lc.fingerprintFromPrompt('race me');
  // Pre-create a sibling .tmp to simulate a stale tmp; bump must still succeed.
  const target = lc.counterPath(repo);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target + '.99999.aaaaaaaa.tmp', 'stale', 'utf8');
  lc.bump(repo, fp, 'h');
  assert.strictEqual(lc.get(repo, fp).count, 1);
});

test('clearAll removes the entire counter file', () => {
  const repo = mkRepo();
  const fp = lc.fingerprintFromPrompt('x');
  lc.bump(repo, fp, 'h');
  assert.ok(fs.existsSync(lc.counterPath(repo)));
  lc.clearAll(repo);
  assert.ok(!fs.existsSync(lc.counterPath(repo)));
});

test('concurrent bump invocations do not lose updates (advisory lock)', async () => {
  const repo = mkRepo();
  const fp = lc.fingerprintFromPrompt('concurrent task');

  // Spawn N child processes that each call bump() once. With the advisory
  // lock the resulting count must equal min(N, MAX_COUNT). Without the lock,
  // R-M-W races would let some children read count=0 and overwrite each
  // other's increment, leaving count < min(N, MAX_COUNT) intermittently.
  const N = 8;
  const child = require('child_process');
  const childScript = `
    'use strict';
    const lc = require('${path.resolve(__dirname, '..', 'loop-counter').replace(/\\\\/g, '/').replace(/\\/g, '/')}');
    lc.bump(process.argv[2], process.argv[3], 'h');
  `;
  const scriptPath = path.join(repo, '__bump.js');
  fs.writeFileSync(scriptPath, childScript, 'utf8');

  await Promise.all(
    Array.from({ length: N }, () => new Promise((resolve) => {
      const p = child.spawn(process.execPath, [scriptPath, repo, fp], {
        stdio: 'ignore',
      });
      p.on('exit', resolve);
    }))
  );

  const final = lc.get(repo, fp);
  // With MAX_COUNT=2 and 8 concurrent bumps, lock must enforce cap at MAX_COUNT
  // and never undercount below MAX_COUNT (each bump observes a monotonically
  // increasing prior count under the lock).
  assert.strictEqual(final.count, lc.MAX_COUNT,
    'expected count to reach MAX_COUNT=' + lc.MAX_COUNT + ' after ' + N + ' bumps, got ' + final.count);
});

test('stale lock is detected and overridden', () => {
  const repo = mkRepo();
  const fp = lc.fingerprintFromPrompt('stale-lock');
  const lockFile = lc.lockPath(repo);
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  fs.writeFileSync(lockFile, '99999\n2000-01-01T00:00:00.000Z', 'utf8');
  // backdate
  const past = new Date(Date.now() - 60 * 1000);
  fs.utimesSync(lockFile, past, past);
  // bump should succeed by overriding the stale lock
  const result = lc.bump(repo, fp, 'h');
  assert.strictEqual(result.count, 1);
});

test('withCounterLock: tryAcquire closes fd even when writeSync throws (B#17 fd leak)', () => {
  const repo = mkRepo();
  const realWrite = fs.writeSync;
  const realClose = fs.closeSync;
  let closed = 0;
  fs.writeSync = () => { throw new Error('disk full'); };
  fs.closeSync = (fd) => { closed++; return realClose(fd); };
  try {
    assert.throws(() => lc.withCounterLock(repo, () => 'x'), /disk full/);
    assert.ok(closed >= 1, 'lock fd must be closed despite writeSync failure');
  } finally {
    fs.writeSync = realWrite;
    fs.closeSync = realClose;
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
