'use strict';

// Plan v0.2.2 R2#1 — canonical cost-state path helper.
//
// Single source of truth for both ecc-context-monitor (writer) and
// auto-chain (reader). NEVER use cwd-relative paths — different chain
// step invocations under different cwds must converge on the same file.

const os = require('os');
const path = require('path');

const COST_STATE_FILENAME = 'cost-current.json';
const COST_STATE_LOCK = 'cost-current.lock';

function getCostStateDir() {
  return path.join(os.homedir(), '.claude', 'plugins', 'data', 'mccp');
}

function getCostStatePath() {
  return path.join(getCostStateDir(), COST_STATE_FILENAME);
}

function getCostStateLockPath() {
  return path.join(getCostStateDir(), COST_STATE_LOCK);
}

module.exports = {
  getCostStateDir: getCostStateDir,
  getCostStatePath: getCostStatePath,
  getCostStateLockPath: getCostStateLockPath,
  COST_STATE_FILENAME: COST_STATE_FILENAME,
  COST_STATE_LOCK: COST_STATE_LOCK,
};
