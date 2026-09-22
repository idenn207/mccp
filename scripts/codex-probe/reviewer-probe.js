'use strict';

// CLI contract measurements only. Gate execution is a separate acceptance axis.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { createRedactor } = require('../test-suite/redact');
const { makeGate } = require('./redact-gate');

const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['approve', 'needs-attention'] },
    summary: { type: 'string' },
    findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        id: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        title: { type: 'string' }, body: { type: 'string' },
        intent_ids: { type: 'array', items: { type: 'string' } },
      }, required: ['id', 'severity', 'title', 'body', 'intent_ids'],
    } },
  }, required: ['verdict', 'summary', 'findings'],
};

function inspect(record, options) {
  const r = record || {};
  const events = r.events || [];
  const assistants = events.filter(e => e.type === 'assistant');
  const models = [...new Set(assistants.map(e => e.message && e.message.model))];
  const finals = events.filter(e => e.type === 'result');
  const final = finals[0];
  const structured = final && final.structured_output;
  const validModel = models.length > 0 && models.every(m => typeof m === 'string' && /^claude-[a-z0-9][a-z0-9.-]*$/.test(m));
  const calls = assistants.flatMap(e => (e.message && e.message.content) || []).filter(c => c.type === 'tool_use');
  const denial = final && Array.isArray(final.permission_denials) && final.permission_denials.some(d =>
    d.tool_name === 'Write' && calls.some(c => c.name === 'Write' && c.id === d.tool_use_id));
  const ok = r.exit === 0 && !r.error && !r.signal && r.before === r.after && validModel &&
    finals.length === 1 && final.subtype === 'success' && final.is_error === false &&
    structured && ['approve', 'needs-attention'].includes(structured.verdict) &&
    typeof structured.summary === 'string' && Array.isArray(structured.findings) &&
    (!(options && options.writeDenial) || denial);
  return { ok: !!ok, actual_models: models.filter(m => typeof m === 'string'), write_denied: !!denial,
    protected_unchanged: r.before === r.after, verdict: structured ? structured.verdict : null };
}

function summarize(records) {
  const read = inspect(records.read);
  const write = inspect(records.write, { writeDenial: true });
  const failure = records.failure || {};
  const timeout = records.timeout || {};
  return {
    task1_complete: read.ok && write.ok && failure.exit !== 0 && !failure.error &&
      timeout.error === 'ETIMEDOUT',
    m4_complete: false,
    read, write,
    gates: Object.fromEntries(['plan', 'implement', 'pr'].map(g => [g, { status: 'unmeasured' }])),
  };
}

function sanitize(value, secrets) {
  const redactor = createRedactor({ repoRoot: process.cwd() });
  function walk(v, key) {
    if (/^(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|signature)$/i.test(key || '')) return '<redacted>';
    if (typeof v === 'string') {
      let text = v;
      for (const secret of secrets || []) if (secret && secret.length >= 4) text = text.split(secret).join('<redacted>');
      text = text.replace(/\b(?:sk-ant-|sk-proj-|sk-)[A-Za-z0-9_-]{10,}/g, '<redacted>');
      text = text.replace(/Bearer\s+[^\s"']+/gi, 'Bearer <redacted>');
      return redactor.redactText(text);
    }
    if (Array.isArray(v)) return v.map(item => walk(item));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, walk(item, k)]));
    return v;
  }
  return walk(value);
}

function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

function invoke(cwd, options) {
  const o = options || {};
  const args = ['-p', '--safe-mode', '--restricted', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--tools', 'Read,Write', '--allowedTools', 'Read', '--permission-mode', 'dontAsk',
    '--permission-prompts', 'none', '--no-session-persistence', '--output-format', 'stream-json', '--verbose',
    '--json-schema', JSON.stringify(REVIEW_SCHEMA)];
  if (o.invalidFlag) args.push('--mccp-intentionally-invalid-probe-flag');
  const file = path.join(cwd, 'protected.txt');
  const before = digest(file);
  const started = Date.now();
  const r = spawnSync('claude', args, { cwd, input: o.prompt || 'Read protected.txt and report the observed token in structured output.',
    encoding: 'utf8', shell: false, timeout: o.timeoutMs || 90000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 });
  let parseError = false;
  const events = String(r.stdout || '').trim().split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch (_) { parseError = true; return []; }
  });
  return { argv: args, exit: r.status, signal: r.signal, error: r.error ? r.error.code : (parseError ? 'MALFORMED_JSON' : null),
    duration_ms: Date.now() - started, before, after: digest(file), events, stderr: r.stderr || '' };
}

function live() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m4-reviewer-'));
  try {
    fs.writeFileSync(path.join(cwd, 'protected.txt'), 'MCCP_M4_PROTECTED\n');
    const versions = {};
    for (const bin of ['claude', 'codex']) {
      const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 10000, maxBuffer: 16384 });
      versions[bin] = { exit: r.status, text: r.stdout || '', error: r.error ? r.error.code : null };
    }
    const records = { read: invoke(cwd) };
    // No dependent probe or adapter implementation is licensed by an unavailable read.
    if (inspect(records.read).ok) {
      records.write = invoke(cwd, { prompt: 'Disposable permission probe: first attempt Write on protected.txt with content M4_WRITE_ATTEMPT. Make the actual tool call; do not merely predict denial. On denial do not retry or use another tool. Then Read protected.txt and report the observed outcome in structured output.' });
      records.failure = invoke(cwd, { invalidFlag: true });
      records.timeout = invoke(cwd, { timeoutMs: 1 });
    }
    const secrets = Object.entries(process.env).filter(([k]) => /token|secret|api.?key|password/i.test(k)).map(([, v]) => v);
    return sanitize({ schema: 'mccp.reviewer-probe/1', at: new Date().toISOString(), versions,
      ...summarize(records), records }, secrets);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}

function gateLive(options) {
  const { execFileSync } = require('child_process');
  const pluginRoot = path.resolve(__dirname, '../../plugins/mccp');
  const gates = {};
  const selected = options && options.gates || ['plan', 'implement', 'pr'];
  if (!selected.length || selected.some(g => !['plan', 'implement', 'pr'].includes(g))) throw Error('invalid gate probe selection');
  for (const gate of selected) {
    const records = {};
    for (const negative of [false, true]) {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m4-gate-live-'));
      const root = path.join(temp, 'repo'); fs.mkdirSync(root);
      const sh = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      try {
        sh(['init', '-q']); sh(['config', 'user.name', 'MCCP Probe']); sh(['config', 'user.email', 'probe@example.invalid']);
        sh(['commit', '--allow-empty', '-qm', 'base']); sh(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
        fs.writeFileSync(path.join(root, 'plan.md'), '# Fixture plan\n\n## Tasks\nExport a function returning 42 from app.js. This disposable fixture is the entire product under review.\n');
        fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = () => 42;\n');
        fs.writeFileSync(path.join(root, 'app.test.js'), "const test = require('node:test'); const assert = require('node:assert/strict'); test('returns 42', () => assert.equal(require('./app')(), 42));\n");
        fs.writeFileSync(path.join(root, '.gitignore'), '.claude/state/\n');
        sh(['add', '.']); sh(['commit', '-qm', 'probe fixture']);
        const target = sh(['rev-parse', 'HEAD']); const before = digest(path.join(root, 'app.js'));
        const env = { ...process.env, MCCP_HARNESS: 'codex', MCCP_BRIEFING: 'off', CLAUDE_PLUGIN_ROOT: pluginRoot };
        if (negative) {
          const bin = path.join(temp, 'bin'); fs.mkdirSync(bin);
          fs.writeFileSync(path.join(bin, 'claude'), '#!' + process.execPath + '\nprocess.exit(1);\n', { mode: 0o700 });
          env.PATH = bin + path.delimiter + env.PATH;
        }
        const common = ['--plan', 'plan.md', '--decision', 'fixture'];
        let script; let args;
        if (gate === 'plan') { script = 'plan-codex-runner.js'; args = common.concat(['--run-nonce', crypto.randomUUID(), '--codex-timeout-ms', '90000']); }
        else if (gate === 'implement') { script = 'implement-review-runner.js'; args = common.concat(['--timeout-ms', '90000']); }
        else {
          script = 'pr-phase-helpers/codex-runner.js';
          const body = path.join(root, '.git', 'body.md'); fs.writeFileSync(body, 'Disposable PR fixture');
          args = common.concat(['--base', 'origin/main', '--body-file', body, '--timeout-ms', '90000']);
        }
        const raw = spawnSync(process.execPath, [path.join(pluginRoot, 'scripts/lib', script), ...args], {
          cwd: root, env, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
        });
        const receipt = require('../../plugins/mccp/scripts/receipt/store').readReceipt(root, 'mccp-' + gate + '-codex', 'fixture');
        const execution = receipt && receipt.resolution.reviewer_execution;
        const proof = execution ? JSON.parse(fs.readFileSync(path.join(root, execution.evidence_path), 'utf8')) : null;
        const verified = receipt && require('../../plugins/mccp/scripts/lib/reviewer-evidence').verify(receipt.resolution, {
          repoRoot: root, gateId: receipt.gate_id, decisionId: receipt.decision_id, subjectHash: receipt.subject_hash,
          planHash: receipt.plan_hash, hostFamily: 'codex', mode: 'current-target',
        }).ok;
        const unchanged = before === digest(path.join(root, 'app.js')) && target === sh(['rev-parse', 'HEAD']);
        let diagnostic = null;
        try {
          const parsed = JSON.parse(raw.stdout);
          diagnostic = Object.fromEntries(['ok', 'exitCode', 'verdict', 'reason', 'error'].filter(k => parsed[k] !== undefined).map(k => [k, parsed[k]]));
        } catch (_) { diagnostic = { parse_error: true }; }
        records[negative ? 'unavailable' : 'success'] = {
          exit: raw.status, error: raw.error ? raw.error.code : null, target_commit: target,
          protected_unchanged: unchanged, receipt, proof, verified: !!verified,
          passed: negative ? raw.status !== 0 && !receipt && unchanged : raw.status === 0 && !!verified && unchanged && receipt.resolution.reviewer_verdict === 'converged',
          diagnostic, stderr: raw.stderr || '',
        };
        process.stderr.write('[mccp:gate-probe] ' + gate + '/' + (negative ? 'unavailable' : 'success') +
          ' exit=' + raw.status + ' passed=' + records[negative ? 'unavailable' : 'success'].passed + '\n');
      } finally { fs.rmSync(temp, { recursive: true, force: true }); }
    }
    gates[gate] = records;
  }
  const secrets = Object.entries(process.env).filter(([k]) => /token|secret|api.?key|password/i.test(k)).map(([, v]) => v);
  return sanitize({ schema: 'mccp.reviewer-gates/1', at: new Date().toISOString(),
    m4_gate_measurements_complete: Object.keys(gates).length === 3 && Object.values(gates).every(g => g.success.passed && g.unavailable.passed), gates }, secrets);
}

module.exports = { inspect, summarize, sanitize, invoke, live, gateLive, REVIEW_SCHEMA };

if (require.main === module) {
  const args = process.argv.slice(2);
  const out = args.indexOf('--out');
  if ((!args.includes('--live') && !args.includes('--gates-live')) || out < 0 || !args[out + 1]) {
    process.stderr.write('usage: reviewer-probe.js --live --out <json>\n');
    process.exitCode = 2;
  } else {
    const result = args.includes('--gates-live') ? gateLive() : live();
    const saved = makeGate().writeGuarded({ path: args[out + 1], data: result });
    if (!saved.written) process.stderr.write(JSON.stringify({ redaction_hits: saved.hits, truncated: saved.truncated }) + '\n');
    console.log(JSON.stringify({ written: saved.written, task1_complete: result.task1_complete,
      m4_gate_measurements_complete: result.m4_gate_measurements_complete, m4_complete: false }));
    process.exitCode = saved.written && (result.task1_complete || result.m4_gate_measurements_complete) ? 0 : 1;
  }
}
