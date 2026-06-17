'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function tmpRepo(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'mccp-derive-'));
  return root;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
}

function gitInit(root) {
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '--allow-empty', '-m', 'init', '--no-gpg-sign'], { cwd: root, stdio: 'ignore' });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function writeText(p, text) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, text, 'utf8');
}

module.exports = {
  tmpRepo,
  cleanup,
  gitInit,
  ensureDir,
  writeJson,
  writeText,
};
