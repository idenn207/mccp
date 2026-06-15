#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const MARKER = path.join('scripts', 'lib', 'utils.js');

function resolveRoot() {
  const env = process.env.CLAUDE_PLUGIN_ROOT;
  if (env && env.trim()) return env.trim();

  const home = os.homedir();
  const claude = path.join(home, '.claude');

  if (fs.existsSync(path.join(claude, MARKER))) return claude;

  const segCandidates = [
    ['mccp'], ['mccp@mccp'], ['marketplaces', 'mccp'],
    ['ecc'], ['ecc@ecc'], ['marketplaces', 'ecc'],
  ];
  for (const segs of segCandidates) {
    const dir = path.join(claude, 'plugins', ...segs);
    if (fs.existsSync(path.join(dir, MARKER))) return dir;
  }

  try {
    for (const slug of ['mccp', 'ecc']) {
      const cacheBase = path.join(claude, 'plugins', 'cache', slug);
      if (!fs.existsSync(cacheBase)) continue;
      for (const owner of fs.readdirSync(cacheBase, { withFileTypes: true })) {
        if (!owner.isDirectory()) continue;
        const ownerDir = path.join(cacheBase, owner.name);
        for (const ver of fs.readdirSync(ownerDir, { withFileTypes: true })) {
          if (!ver.isDirectory()) continue;
          const dir = path.join(ownerDir, ver.name);
          if (fs.existsSync(path.join(dir, MARKER))) return dir;
        }
      }
    }
  } catch (_err) {
    // resolve loop is best-effort; loud-fail below if nothing matches.
  }

  return null;
}

function passthroughStdinAndExit() {
  try {
    process.stdout.write(fs.readFileSync(0, 'utf8'));
  } catch (_err) {
    // stdin already drained or closed; nothing to forward.
  }
  process.exit(0);
}

function main() {
  const root = resolveRoot();
  if (!root) {
    process.stderr.write(
      '[mccp] bootstrap: CLAUDE_PLUGIN_ROOT empty + no plugin marker resolvable. ALLOW-passthrough; reinstall plugin or set CLAUDE_PLUGIN_ROOT.\n'
    );
    return passthroughStdinAndExit();
  }

  process.env.CLAUDE_PLUGIN_ROOT = root;
  process.env.MCCP_PLUGIN_ROOT = root;

  const target = path.join(root, 'scripts', 'hooks', 'plugin-hook-bootstrap.js');
  if (!fs.existsSync(target)) {
    process.stderr.write(`[mccp] bootstrap: target missing at ${target}\n`);
    return passthroughStdinAndExit();
  }

  process.argv[1] = target;
  require(target);
}

main();
