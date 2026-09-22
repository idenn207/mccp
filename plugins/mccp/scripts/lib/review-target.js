'use strict';

// Immutable input for opposite-family reviews. No caller-supplied dirty-path
// exclusions: only this run's input and fixed output roles may be uncommitted.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { stableBodyDigest } = require('./intent-context');
const captures = new WeakSet();
const SHA = /^sha256:[a-f0-9]{64}$/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const GATES = ['mccp-plan-codex', 'mccp-implement-codex', 'mccp-pr-codex'];
const digest = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function git(root, args, binary) {
  return execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], { cwd: root, encoding: binary ? undefined : 'utf8',
    maxBuffer: 32 * 1024 * 1024, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
}
function relative(p) {
  return typeof p === 'string' && p === p.trim() && p.length > 0 &&
    !/^[A-Za-z]:|^\/|\\|\0/.test(p) && p.split('/').every(s => s && s !== '.' && s !== '..');
}
function contained(root, p) {
  if (!relative(p)) throw Error('invalid review input path');
  const full = path.resolve(root, p);
  let cur = root;
  for (const part of p.split('/')) {
    cur = path.join(cur, part);
    if (fs.existsSync(cur) && fs.lstatSync(cur).isSymbolicLink()) throw Error('symlink review path');
  }
  const real = fs.realpathSync(full);
  if (!real.startsWith(fs.realpathSync(root) + path.sep)) throw Error('review path outside repository');
  if (!fs.statSync(real).isFile()) throw Error('review input must be a file');
  return real;
}
function inputBytes(root, p) {
  const bytes = fs.readFileSync(contained(root, p));
  if (bytes.length > 2 * 1024 * 1024) throw Error('review input too large');
  return bytes;
}
function planDigest(bytes) {
  const text = bytes.toString('utf8');
  const headings = text.split('\n').filter(l => /^\s*##\s+Codex Adversarial Review\s*$/.test(l));
  if (headings.length > 1 || headings.some(l => l !== '## Codex Adversarial Review')) throw Error('ambiguous review section');
  return stableBodyDigest(text);
}
function outputs(gate, decision, nonce) {
  if (!GATES.includes(gate) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(decision) ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(nonce)) throw Error('invalid review identity');
  return Object.freeze({ proof: '.claude/reviews/reviewer-' + nonce + '.json',
    receipt: '.claude/receipts/' + gate + '/' + decision + '.json',
    manifest: '.claude/reviews/reviewer-' + nonce + '-ship.json' });
}
function changed(root) {
  // --no-renames makes both halves of a rename independently visible.
  return [...new Set([
    ...git(root, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', '--']).split('\0'),
    ...git(root, ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', 'HEAD', '--']).split('\0'),
    ...git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
  ].filter(Boolean))];
}
function clean(root, allowed) {
  const bad = changed(root).filter(p => !allowed.includes(p));
  if (bad.length) throw Error('dirty review target: ' + bad.join(', '));
}
function validateInput(i) {
  return !!(i && i.version === 1 && GATES.includes(i.gate_id) &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(i.decision_id || '') &&
    [i.base_commit, i.target_commit, i.target_tree].every(x => OID.test(x || '')) &&
    relative(i.plan_path) && SHA.test(i.plan_stable_digest || '') && Array.isArray(i.design_inputs) &&
    i.design_inputs.every((d, n, a) => relative(d.path) && SHA.test(d.hash || '') && (n === 0 || a[n - 1].path < d.path)));
}
function capture(o) {
  const root = fs.realpathSync(o.cwd || process.cwd());
  const nonce = o.runNonce || crypto.randomUUID();
  const outputPaths = outputs(o.gateId, o.decisionId, nonce);
  const plan = o.planPath;
  const planBytes = inputBytes(root, plan);
  const designs = [...new Set(o.designPaths || [])].sort().map(p => ({ path: p, bytes: inputBytes(root, p) }));
  const input = { version: 1, gate_id: o.gateId, decision_id: o.decisionId,
    base_commit: git(root, ['rev-parse', '--verify', (o.base || 'HEAD') + '^{commit}']).trim(),
    target_commit: git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim(),
    target_tree: git(root, ['rev-parse', '--verify', 'HEAD^{tree}']).trim(),
    plan_path: plan, plan_stable_digest: planDigest(planBytes),
    design_inputs: designs.map(d => Object.freeze({ path: d.path, hash: digest(d.bytes) })) };
  Object.freeze(input.design_inputs); Object.freeze(input);
  if (!validateInput(input)) throw Error('invalid reviewed input');
  if (git(root, ['ls-tree', '-r', input.target_commit]).split('\n').some(l => l.startsWith('160000 '))) throw Error('submodule review unavailable');
  const allowed = Object.freeze([plan, ...designs.map(d => d.path), ...Object.values(outputPaths)]);
  clean(root, allowed);
  const context = Object.freeze({ root, gateId: o.gateId, decisionId: o.decisionId, runNonce: nonce,
    reviewedInput: input, reviewedInputHash: digest(canonical(input)), outputPaths, allowed,
    reviewText: JSON.stringify({ plan: { path: plan, content: planBytes.toString('utf8') },
      design_inputs: designs.map(d => ({ path: d.path, content: d.bytes.toString('utf8') })) }) });
  captures.add(context);
  return context;
}
function verify(input, root, opts) {
  const o = opts || {};
  if (!validateInput(input)) throw Error('invalid reviewed input');
  if (git(root, ['rev-parse', '--verify', input.target_commit + '^{tree}']).trim() !== input.target_tree) throw Error('review tree mismatch');
  if (planDigest(inputBytes(root, input.plan_path)) !== input.plan_stable_digest) throw Error('review plan changed');
  for (const d of input.design_inputs) if (digest(inputBytes(root, d.path)) !== d.hash) throw Error('review design changed');
  if (o.mode !== 'upstream') {
    if (git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim() !== input.target_commit) throw Error('review HEAD changed');
    clean(root, [input.plan_path, ...input.design_inputs.map(d => d.path), ...Object.values(outputs(input.gate_id, input.decision_id, o.runNonce))]);
  }
  return true;
}
function assertCurrent(c) {
  if (!captures.has(c)) throw Error('untrusted review capture');
  verify(c.reviewedInput, c.root, { runNonce: c.runNonce });
}
function snapshot(c, run) {
  assertCurrent(c);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-review-target-'));
  const work = path.join(dir, 'tree');
  try {
    const hooks = path.join(dir, 'empty-hooks'); fs.mkdirSync(hooks);
    // No checkout: neither smudge/process filters nor post-checkout hooks may
    // execute unreviewed code. The independent worktree supplies Git objects.
    git(c.root, ['-c', 'core.hooksPath=' + hooks, 'worktree', 'add', '--detach', '--no-checkout', work, c.reviewedInput.target_commit]);
    // Tools are disabled for this transport. Supply every tracked blob as data,
    // including symlink *objects*, never filesystem dereferences. This also
    // prevents Read from escaping through absolute paths or the .git pointer.
    const entries = git(work, ['ls-tree', '-rz', c.reviewedInput.target_commit]).split('\0').filter(Boolean);
    const files = [];
    let size = Buffer.byteLength(c.reviewText);
    for (const entry of entries) {
      const m = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(entry);
      if (!m || m[2] !== 'blob') throw Error('unsupported review tree entry');
      const bytes = git(work, ['cat-file', 'blob', m[3]], true);
      const utf8 = bytes.toString('utf8');
      const readable = !bytes.includes(0) && Buffer.from(utf8).equals(bytes);
      const file = { path: m[4], mode: m[1], oid: m[3], encoding: readable ? 'utf8' : 'base64', content: readable ? utf8 : bytes.toString('base64') };
      size += Buffer.byteLength(JSON.stringify(file)); files.push(file);
      if (size > 8 * 1024 * 1024) throw Error('review tree exceeds input limit');
    }
    const text = 'Committed tree and draft inputs (JSON):\n' + JSON.stringify({
      reviewed_input: c.reviewedInput, draft_inputs: JSON.parse(c.reviewText), files,
      diff: git(work, ['diff', '--no-ext-diff', '--no-textconv', c.reviewedInput.base_commit, c.reviewedInput.target_commit, '--']),
    });
    if (Buffer.byteLength(text) > 8 * 1024 * 1024) throw Error('review tree exceeds input limit');
    const result = run({ cwd: work, reviewText: text });
    assertCurrent(c);
    return result;
  } finally {
    try { git(c.root, ['worktree', 'remove', '--force', work]); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
}
module.exports = { capture, verify, assertCurrent, snapshot, validateInput, outputs, changed, clean,
  canonical, digest, git, relative, contained, isCapture: c => captures.has(c) };
