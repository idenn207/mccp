'use strict';

const { execFileSync } = require('child_process');

const ORIGIN_OWNER_REPO_RE = /(?:github\.com[:/])([^/]+)\/([^/.]+?)(?:\.git)?$/i;

function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString('utf8').trim();
}

function scanPR(repoRoot) {
  let headSha = null;
  let branch = null;
  let remoteOwnerRepo = null;
  let originUrl = null;
  try {
    headSha = git(['rev-parse', 'HEAD'], repoRoot);
  } catch (err) {
    return { ok: false, item: null, degraded: false, error: 'not a git repo (' + err.code + ')' };
  }
  try {
    branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
  } catch (_e) { branch = null; }
  try {
    originUrl = git(['config', '--get', 'remote.origin.url'], repoRoot);
  } catch (_e) { originUrl = null; }
  if (originUrl) {
    const m = originUrl.match(ORIGIN_OWNER_REPO_RE);
    if (m) remoteOwnerRepo = { owner: m[1], repo: m[2] };
  }
  return {
    ok: true,
    item: {
      head_sha: headSha,
      branch,
      remote_owner_repo: remoteOwnerRepo,
      origin_url: originUrl,
    },
    degraded: false,
    error: null,
  };
}

module.exports = {
  scanPR,
};
