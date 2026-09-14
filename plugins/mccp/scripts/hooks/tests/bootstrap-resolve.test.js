'use strict';

// bootstrap.js#resolveRoot 해소 순서 회귀 (codex-harness-portability M2 Task 7 · security H1).
//
// 이 파일이 지키는 것은 **순서**다. plan Task 7은 `__dirname` 폴백을 "마지막 후보로"
// 추가하라고 적었고, 그 자리는 home 스캔이 먼저 성공하므로 도달하지 않는다. 그리고
// Claude Code에서는 env가 항상 이겨서 폴백이 관측되지 않으므로, "Claude 경로 무변경"만
// 단언하는 test는 그 순서 오류를 **통과시킨다**. 그래서 여기서는 env를 비우고 home 캐시를
// 심은 픽스처에서 `__dirname` 트리가 이기는 것을 직접 단언한다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REAL_BOOTSTRAP = path.resolve(__dirname, '..', 'bootstrap.js');
const MARKER = require('../bootstrap').MARKER;

function mkfix() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-bootstrap-'));
  // (1) 이 hook이 실제로 사는 트리 — `<root>/scripts/hooks/bootstrap.js`
  const selfRoot = path.join(base, 'selftree');
  fs.mkdirSync(path.join(selfRoot, 'scripts', 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(selfRoot, 'scripts', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(selfRoot, MARKER), '// marker\n');
  fs.copyFileSync(REAL_BOOTSTRAP, path.join(selfRoot, 'scripts', 'hooks', 'bootstrap.js'));
  // (2) 가짜 홈 — 다른 버전의 캐시 사본이 이미 존재한다(H1이 기술한 실제 상황)
  const home = path.join(base, 'home');
  const cache = path.join(home, '.claude', 'plugins', 'cache', 'mccp', 'mccp', '9.9.9');
  fs.mkdirSync(path.join(cache, 'scripts', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(cache, MARKER), '// stale cache marker\n');
  return { base, selfRoot, home, cache };
}

// 자식 프로세스로 부른다 — `os.homedir()`가 HOME을 읽으므로 부모 환경을 오염시키지 않는다.
function resolveIn(fix, env) {
  const script = 'process.stdout.write(String(require(' +
    JSON.stringify(path.join(fix.selfRoot, 'scripts', 'hooks', 'bootstrap.js')) +
    ').resolveRoot()));';
  const r = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    shell: false,
    env: Object.assign({ PATH: process.env.PATH, HOME: fix.home }, env || {}),
  });
  return { out: String(r.stdout || '').trim(), err: String(r.stderr || ''), status: r.status };
}

test('(a) env 부재 + home 캐시 존재 → __dirname 트리가 이긴다 (security H1의 핵심 단언)', () => {
  const fix = mkfix();
  try {
    const r = resolveIn(fix, {});
    assert.equal(r.status, 0);
    assert.equal(r.out, fix.selfRoot,
      'the tree the hook lives in must win over any ~/.claude cache copy');
    assert.notEqual(r.out, fix.cache);
  } finally {
    fs.rmSync(fix.base, { recursive: true, force: true });
  }
});

test('(b) marker를 가진 CLAUDE_PLUGIN_ROOT는 그대로 이긴다 — Claude 경로 무변경', () => {
  const fix = mkfix();
  try {
    const declared = path.join(fix.base, 'declared');
    fs.mkdirSync(path.join(declared, 'scripts', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(declared, MARKER), '// declared marker\n');
    const r = resolveIn(fix, { CLAUDE_PLUGIN_ROOT: declared });
    assert.equal(r.out, declared);
    assert.equal(r.err, '', 'a valid declared root must not warn');
  } finally {
    fs.rmSync(fix.base, { recursive: true, force: true });
  }
});

test('(c) marker 없는 CLAUDE_PLUGIN_ROOT는 무검증 신뢰되지 않고 loud하게 무시된다', () => {
  const fix = mkfix();
  try {
    const bogus = path.join(fix.base, 'bogus');
    fs.mkdirSync(bogus, { recursive: true });
    const r = resolveIn(fix, { CLAUDE_PLUGIN_ROOT: bogus });
    assert.notEqual(r.out, bogus, 'an unverified declared root must not be required from');
    assert.equal(r.out, fix.selfRoot);
    assert.match(r.err, /has no scripts\/lib\/utils\.js/);
  } finally {
    fs.rmSync(fix.base, { recursive: true, force: true });
  }
});

test('(d) 공백만 있는 값은 선언으로 치지 않는다', () => {
  const fix = mkfix();
  try {
    const r = resolveIn(fix, { CLAUDE_PLUGIN_ROOT: '   ' });
    assert.equal(r.out, fix.selfRoot);
    assert.equal(r.err, '', 'an empty declaration is not a wrong declaration — no warning');
  } finally {
    fs.rmSync(fix.base, { recursive: true, force: true });
  }
});

test('(e) 어느 후보도 성립하지 않으면 null이고 던지지 않는다 (fail-open 유지)', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-bootstrap-empty-'));
  try {
    const lone = path.join(base, 'lone', 'scripts', 'hooks');
    fs.mkdirSync(lone, { recursive: true });
    fs.copyFileSync(REAL_BOOTSTRAP, path.join(lone, 'bootstrap.js'));
    const script = 'process.stdout.write(String(require(' +
      JSON.stringify(path.join(lone, 'bootstrap.js')) + ').resolveRoot()));';
    const r = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8', shell: false,
      env: { PATH: process.env.PATH, HOME: path.join(base, 'nohome') },
    });
    assert.equal(r.status, 0);
    assert.equal(String(r.stdout).trim(), 'null');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('(f) require해도 main()이 돌지 않는다 — stdin을 기다리지 않는다', () => {
  const r = spawnSync(process.execPath, ['-e', 'require(' + JSON.stringify(REAL_BOOTSTRAP) + '); process.stdout.write("returned");'], {
    encoding: 'utf8', shell: false, timeout: 5000,
    env: Object.assign({}, process.env),
  });
  assert.equal(String(r.stdout).trim(), 'returned');
  assert.equal(r.signal, null, 'requiring the module must not hang on stdin');
});
