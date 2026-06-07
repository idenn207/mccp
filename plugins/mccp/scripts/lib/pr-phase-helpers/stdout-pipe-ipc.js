'use strict';

// stdout-pipe-ipc — Anonymous-pipe IPC helpers for ownership_token transfer.
//
// v0.2.8 Task 2.6.1-followup F11 R3-F2 absorption: replaces the file-based
// sealed-channel proposal. Two helpers, both synchronous wrappers around
// child_process.spawnSync:
//
//   spawnAndCaptureToken(cmdArgs, opts) — stdio:['ignore','pipe','inherit'].
//     Captures child stdout, parses as JSON, extracts ownership_token.
//     Returns { exitCode, stdoutJSON, parseError, rawToken, stdoutRaw }.
//     Pipe is anonymous; filesystem never sees the token.
//
//   spawnAndPipeToken(cmdArgs, rawToken, opts) — stdio:['pipe','pipe','inherit'].
//     Writes rawToken + '\n' to child.stdin via spawnSync input opt, captures
//     stdout. Token never appears in argv, env, or filesystem.

const { spawnSync } = require('child_process');

function spawnAndCaptureToken(cmdArgs, opts) {
  if (!Array.isArray(cmdArgs) || cmdArgs.length === 0) {
    throw new Error('spawnAndCaptureToken: cmdArgs must be non-empty array');
  }
  opts = opts || {};
  const stderrMode = opts.captureStderr ? 'pipe' : 'inherit';
  const result = spawnSync(cmdArgs[0], cmdArgs.slice(1), {
    cwd: opts.cwd,
    env: opts.env || process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', stderrMode],
    timeout: opts.timeoutMs,
  });
  if (result.error) {
    const err = new Error('spawnAndCaptureToken: spawn failed: ' + result.error.message);
    err.code = result.error.code;
    throw err;
  }
  let stdoutJSON = null;
  let parseError = null;
  try {
    stdoutJSON = JSON.parse(result.stdout);
  } catch (err) {
    parseError = err.message;
  }
  const rawToken = stdoutJSON && typeof stdoutJSON.ownership_token === 'string'
    ? stdoutJSON.ownership_token
    : null;
  return {
    exitCode: result.status,
    stdoutJSON: stdoutJSON,
    parseError: parseError,
    rawToken: rawToken,
    stdoutRaw: result.stdout,
    stderr: opts.captureStderr ? result.stderr : undefined,
  };
}

function spawnAndPipeToken(cmdArgs, rawToken, opts) {
  if (!Array.isArray(cmdArgs) || cmdArgs.length === 0) {
    throw new Error('spawnAndPipeToken: cmdArgs must be non-empty array');
  }
  if (typeof rawToken !== 'string' || rawToken.length === 0) {
    throw new Error('spawnAndPipeToken: rawToken must be non-empty string');
  }
  opts = opts || {};
  const stderrMode = opts.captureStderr ? 'pipe' : 'inherit';
  const result = spawnSync(cmdArgs[0], cmdArgs.slice(1), {
    cwd: opts.cwd,
    env: opts.env || process.env,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', stderrMode],
    input: rawToken + '\n',
    timeout: opts.timeoutMs,
  });
  if (result.error) {
    const err = new Error('spawnAndPipeToken: spawn failed: ' + result.error.message);
    err.code = result.error.code;
    throw err;
  }
  return {
    exitCode: result.status,
    stdout: result.stdout,
    stderr: opts.captureStderr ? result.stderr : undefined,
  };
}

module.exports = {
  spawnAndCaptureToken,
  spawnAndPipeToken,
};
