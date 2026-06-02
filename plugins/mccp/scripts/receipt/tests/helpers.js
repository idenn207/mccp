'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function mkTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-receipt-test-'));
  execFileSync('git', ['init', '--initial-branch=master', '--quiet'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' });
  // initial commit so HEAD exists
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'initial', '--quiet'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

function writeFileSync(repo, relPath, content) {
  const p = path.join(repo, relPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

function captureIO() {
  const out = [];
  const err = [];
  return {
    stdout: { write: function (s) { out.push(String(s)); } },
    stderr: { write: function (s) { err.push(String(s)); } },
    env: {},
    output: function () { return out.join(''); },
    errput: function () { return err.join(''); },
  };
}

module.exports = { mkTmpRepo: mkTmpRepo, writeFileSync: writeFileSync, captureIO: captureIO };
