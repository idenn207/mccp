'use strict';

// Quality runner — fail-fast chain over the stages detected by `detect.js`.
//
//   order: lint → typecheck → test → e2e
//
// e2e is skipped by default; set `MCCP_STOP_LOOP_E2E=1` to opt in.
// Each stage is a child process that inherits PATH and HOME but not stdin.
// stdout/stderr are captured (capped at 64 KiB tail per stream to keep
// fix-task.md small) and the chain stops at the first non-zero exit.

const { spawnSync } = require('child_process');
const { detect } = require('./detect');

const STAGE_ORDER = ['lint', 'typecheck', 'test', 'e2e'];
const TAIL_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per stage

function tail(buf, max) {
  if (!buf) return '';
  const s = String(buf);
  if (s.length <= max) return s;
  return s.slice(s.length - max);
}

function runStage(stageName, stageInfo, opts) {
  const start = Date.now();
  const cmdString = String(stageInfo.command || '').trim();
  if (!cmdString) {
    return {
      name: stageName,
      status: 'error',
      command: stageInfo.command,
      exitCode: -1,
      durationMs: 0,
      stdout: '',
      stderr: 'mccp-quality: empty command',
      timedOut: false,
    };
  }

  let result;
  try {
    // shell:true makes spawnSync hand the whole string to cmd.exe or /bin/sh,
    // which correctly preserves quoting in `node -e "..."` invocations and
    // resolves npm.cmd/pnpm.cmd on Windows.
    result = spawnSync(cmdString, [], {
      cwd: opts.cwd,
      env: opts.env || process.env,
      timeout: opts.timeoutMs || DEFAULT_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (err) {
    return {
      name: stageName,
      status: 'error',
      command: stageInfo.command,
      exitCode: -1,
      durationMs: Date.now() - start,
      stdout: '',
      stderr: 'mccp-quality: spawn error: ' + err.message,
      timedOut: false,
    };
  }

  const timedOut = result.error && result.error.code === 'ETIMEDOUT';
  const exitCode = result.status === null ? -1 : result.status;
  const status = timedOut ? 'timeout'
    : exitCode === 0 ? 'pass'
    : 'fail';

  return {
    name: stageName,
    status: status,
    command: stageInfo.command,
    exitCode: exitCode,
    durationMs: Date.now() - start,
    stdout: tail(result.stdout, TAIL_BYTES),
    stderr: tail(result.stderr, TAIL_BYTES),
    timedOut: timedOut,
  };
}

function isStageEnabled(stageName, env) {
  if (stageName === 'e2e') {
    return env && env.MCCP_STOP_LOOP_E2E === '1';
  }
  return true;
}

function run(opts) {
  const options = opts || {};
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const requestedStage = options.stage || 'all';
  const detection = options.detection || detect(cwd);

  const stages = [];
  let passed = true;

  const targetStages = requestedStage === 'all'
    ? STAGE_ORDER
    : [requestedStage];

  for (const stageName of targetStages) {
    const info = detection.stages[stageName];
    if (!info) {
      stages.push({
        name: stageName,
        status: 'skipped',
        command: null,
        exitCode: null,
        durationMs: 0,
        stdout: '',
        stderr: '',
        reason: 'no source detected',
      });
      continue;
    }
    if (!isStageEnabled(stageName, env)) {
      stages.push({
        name: stageName,
        status: 'skipped',
        command: info.command,
        exitCode: null,
        durationMs: 0,
        stdout: '',
        stderr: '',
        reason: 'opt-in required (MCCP_STOP_LOOP_E2E=1)',
      });
      continue;
    }

    const stageResult = runStage(stageName, info, {
      cwd: cwd,
      env: env,
      timeoutMs: options.timeoutMs,
    });
    stages.push(stageResult);
    if (stageResult.status !== 'pass') {
      passed = false;
      break; // fail-fast
    }
  }

  return {
    passed: passed,
    packageManager: detection.packageManager,
    stages: stages,
  };
}

module.exports = {
  run: run,
  STAGE_ORDER: STAGE_ORDER,
  TAIL_BYTES: TAIL_BYTES,
  DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
};
