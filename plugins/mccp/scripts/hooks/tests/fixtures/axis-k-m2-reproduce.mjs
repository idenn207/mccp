#!/usr/bin/env node
// axis-k-m2-reproduce.mjs — v1.0.1 axis K M2 cross-platform reproduction
// fixture. Single source of truth for both local (Windows/WSL) and GitHub
// Actions (ubuntu-latest + macos-latest) invocation.
//
// Writes a same-host + dead-PID orphan lock body to a synthetic repo root,
// invokes pr-phase-guard.lockActive() with the REAL pr-phase-lock module
// (only repoRoot() is overridden to skip git-rev-parse traversal), then
// asserts:
//   (1) lockActive returns null (reclaim path taken)
//   (2) lock file unlinked
//   (3) stale-reclaim marker written with canonical 5-key shape
//
// PASS on any OS proves the same cross-platform reclaim path. Windows
// self-trap is a separate concern (hooks.json matcher gap) covered by
// the sibling axis-k-m2-windows-regression.mjs fixture.
//
// Exit codes:
//   0 — all assertions passed
//   1 — any assertion failed (CI red)
//
// Stdout (single line JSON, parseable by jq / artifact upload):
//   { "os", "hostname", "fixture", "former_pid", "marker_path", "reclaimed" }

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const FIXTURE_NAME = 'axis-k-m2';
const FORMER_PID = 999999;

// fixtures/ → tests/ → hooks/ → scripts/ → mccp/ (plugin root)
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const GUARD_PATH = path.join(PLUGIN_ROOT, 'scripts', 'hooks', 'pr-phase-guard.js');
const LOCK_MOD_PATH = path.join(PLUGIN_ROOT, 'scripts', 'lib', 'pr-phase-lock.js');

const guard = require(GUARD_PATH);
const realLockMod = require(LOCK_MOD_PATH);

const tmpRoot = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-axkm2-')),
);
const stateDir = path.join(tmpRoot, '.claude', 'state');
fs.mkdirSync(stateDir, { recursive: true });
const lockFile = path.join(stateDir, 'pr-phase.lock');

const lockBody = {
  run_id: 'axis-k-m2-fixture',
  subphase: realLockMod.SUBPHASE_DEFAULT,
  pid: FORMER_PID,
  host: os.hostname(),
  mtime: new Date().toISOString(),
  ownership_token_hash: '0'.repeat(64),
};
fs.writeFileSync(lockFile, JSON.stringify(lockBody) + '\n');

const lockMod = Object.assign({}, realLockMod, {
  repoRoot: () => tmpRoot,
});

let failure = null;
let reclaimed = false;
const markerPath = path.join(tmpRoot, guard.STALE_RECLAIM_MARKER_REL);

try {
  const r = guard.lockActive(lockMod, tmpRoot);
  if (r !== null) {
    failure = `lockActive returned non-null (expected null after reclaim): ${JSON.stringify(r)}`;
  } else if (fs.existsSync(lockFile)) {
    failure = `lock file still exists after reclaim: ${lockFile}`;
  } else if (!fs.existsSync(markerPath)) {
    failure = `stale-reclaim marker missing at: ${markerPath}`;
  } else {
    const markerBody = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    const expectedKeys = ['reclaimed_at', 'former_run_id', 'former_pid', 'former_host', 'reason'];
    for (const k of expectedKeys) {
      if (!(k in markerBody)) {
        failure = `marker missing key '${k}': ${JSON.stringify(markerBody)}`;
        break;
      }
    }
    if (!failure) {
      if (markerBody.former_pid !== FORMER_PID) {
        failure = `marker.former_pid: got ${markerBody.former_pid}, want ${FORMER_PID}`;
      } else if (markerBody.former_host !== os.hostname()) {
        failure = `marker.former_host: got ${markerBody.former_host}, want ${os.hostname()}`;
      } else if (markerBody.reason !== 'same-host-dead-pid') {
        failure = `marker.reason: got ${markerBody.reason}, want same-host-dead-pid`;
      } else if (!/^\d{4}-\d{2}-\d{2}T/.test(markerBody.reclaimed_at)) {
        failure = `marker.reclaimed_at not ISO: ${markerBody.reclaimed_at}`;
      } else if (markerBody.former_run_id !== 'axis-k-m2-fixture') {
        failure = `marker.former_run_id: got ${markerBody.former_run_id}, want axis-k-m2-fixture`;
      } else {
        reclaimed = true;
      }
    }
  }
} catch (err) {
  failure = `lockActive threw: ${err.message}`;
}

try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) { /* cleanup best-effort */ }

const output = {
  os: process.platform,
  hostname: os.hostname(),
  fixture: FIXTURE_NAME,
  former_pid: FORMER_PID,
  marker_path: markerPath,
  reclaimed,
};

process.stdout.write(JSON.stringify(output) + '\n');

if (failure) {
  process.stderr.write(`[axis-k-m2-reproduce] FAIL: ${failure}\n`);
  process.exit(1);
}

process.exit(0);
