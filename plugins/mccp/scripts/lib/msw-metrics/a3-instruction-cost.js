/**
 * A3 instruction-cost measurement
 *
 * Measures token counts of injected payloads without persisting raw text.
 * Three components:
 * 1. CLAUDE.md (repo-tracked, always readable)
 * 2. MEMORY.md index (~/.claude/.../memory/MEMORY.md, user-level, opt-in)
 * 3. SessionStart STATE.md block (runtime-injected, session-specific)
 *
 * Critical boundary (Codex R3-F3):
 * - Compute token/byte counts IN-MEMORY only
 * - Persist ONLY aggregate counts + sha256
 * - NEVER raw source text
 * - User-memory read is explicit opt-in (env flag)
 * - When tokenizer unavailable, emit baseline-unavailable loudly
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const MEMORY_ENV_FLAG = 'MCCP_A3_READ_USER_MEMORY';

/**
 * Measure instruction-cost A3
 * @param {Object} opts
 * @param {string} opts.claudePath - path to CLAUDE.md
 * @param {string} opts.statePath - path to current STATE.md or null
 * @param {string} [opts.memoryIndexPath] - path to MEMORY.md index or null
 * @param {boolean} [opts.readUserMemory] - honor MCCP_A3_READ_USER_MEMORY env flag
 * @returns {Object} result with numerator, denominator, status, baseline_unavailable reason
 */
async function measureA3(opts = {}) {
  const result = {
    numerator_tokens: null,
    numerator_bytes: null,
    components: {},
    denominator_tokens: 200000, // Claude model context window (documented value)
    status: 'computing',
    baseline_available: true,
    not_delivered_reason: null,
    tokenizer_info: null,
    ratio: null,
  };

  // Check if user-memory read is explicitly enabled
  const readUserMemory = opts.readUserMemory !== false && process.env[MEMORY_ENV_FLAG];

  try {
    // Component 1: CLAUDE.md
    const claudePath = opts.claudePath || path.join(process.cwd(), 'CLAUDE.md');
    let claudeText = '';
    let claudeBytes = 0;
    let claudeHash = '';

    if (fs.existsSync(claudePath)) {
      claudeText = fs.readFileSync(claudePath, 'utf8');
      claudeBytes = Buffer.byteLength(claudeText, 'utf8');
      claudeHash = crypto.createHash('sha256').update(claudeText).digest('hex');
      result.components.claude_md = {
        bytes: claudeBytes,
        hash: claudeHash,
        tokens: null, // will compute via tiktoken
      };
    }

    // Component 2: MEMORY.md index (user-level, opt-in)
    let memoryText = '';
    let memoryBytes = 0;
    let memoryHash = '';

    if (readUserMemory) {
      const memoryPath = opts.memoryIndexPath ||
        path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'projects', '*', 'memory', 'MEMORY.md');

      // Try to find MEMORY.md (pattern match if wildcard present)
      let actualMemoryPath = null;
      if (memoryPath.includes('*')) {
        const baseDir = path.dirname(memoryPath.replace(/\/\*.*$/, ''));
        if (fs.existsSync(baseDir)) {
          const files = findMemoryFiles(baseDir);
          if (files.length > 0) {
            actualMemoryPath = files[0]; // Use first found
          }
        }
      } else if (fs.existsSync(memoryPath)) {
        actualMemoryPath = memoryPath;
      }

      if (actualMemoryPath && fs.existsSync(actualMemoryPath)) {
        memoryText = fs.readFileSync(actualMemoryPath, 'utf8');
        memoryBytes = Buffer.byteLength(memoryText, 'utf8');
        memoryHash = crypto.createHash('sha256').update(memoryText).digest('hex');
        result.components.memory_index = {
          bytes: memoryBytes,
          hash: memoryHash,
          tokens: null,
        };
      }
    } else {
      result.components.memory_index = {
        bytes: null,
        hash: null,
        tokens: null,
        omitted: true,
        reason: `${MEMORY_ENV_FLAG} not set (user-level memory read opt-in)`,
      };
    }

    // Component 3: SessionStart STATE.md block (from opts or would need to parse STATE.md)
    let stateText = '';
    let stateBytes = 0;
    let stateHash = '';

    if (opts.statePath && fs.existsSync(opts.statePath)) {
      const stateContent = fs.readFileSync(opts.statePath, 'utf8');
      // Extract SessionStart injected block (heuristic: look for injected STATE section)
      const sessionBlockMatch = stateContent.match(/^---\n([\s\S]*?)\n---/m);
      if (sessionBlockMatch) {
        stateText = sessionBlockMatch[1];
        stateBytes = Buffer.byteLength(stateText, 'utf8');
        stateHash = crypto.createHash('sha256').update(stateText).digest('hex');
        result.components.state_block = {
          bytes: stateBytes,
          hash: stateHash,
          tokens: null,
        };
      }
    }

    // Total bytes (never store raw text)
    const totalBytes = claudeBytes + memoryBytes + stateBytes;
    result.numerator_bytes = totalBytes;

    // Try to get token count via tiktoken
    try {
      const tokenInfo = await tokenizeWithTiktoken(claudeText, memoryText, stateText);

      result.tokenizer_info = {
        tool: 'tiktoken',
        model: 'o200k_base',
        version: tokenInfo.version,
      };

      // Store token counts per component
      result.components.claude_md.tokens = tokenInfo.claude_tokens;
      if (result.components.memory_index && !result.components.memory_index.omitted) {
        result.components.memory_index.tokens = tokenInfo.memory_tokens;
      }
      if (result.components.state_block) {
        result.components.state_block.tokens = tokenInfo.state_tokens;
      }

      result.numerator_tokens = tokenInfo.total_tokens;
      result.status = 'computed';
      result.ratio = totalBytes > 0 ? result.numerator_tokens / result.denominator_tokens : 0;
    } catch (e) {
      // Tokenizer unavailable
      result.baseline_available = false;
      result.status = 'baseline-unavailable';
      result.not_delivered_reason = `tiktoken tokenization failed: ${e.message}`;

      // Log loudly to stderr
      console.error(`\n[A3 MEASUREMENT] Baseline unavailable: ${result.not_delivered_reason}`);
      console.error('[A3 MEASUREMENT] Ensure tiktoken is installed: pip install tiktoken');
    }

  } catch (e) {
    result.status = 'error';
    result.not_delivered_reason = `Measurement error: ${e.message}`;
    console.error(`[A3 MEASUREMENT] Error: ${e.message}`);
  }

  // CRITICAL: Never include raw text in result
  // Only counts + hashes stored; raw bytes are ephemeral.
  // Optional chaining throughout — claude_md/state_block are only set when the
  // source file exists (CLAUDE.md 부재 시 claude_md=undefined → 무가드 delete는 throw).
  delete result.components.claude_md?.text;
  delete result.components.memory_index?.text;
  delete result.components.state_block?.text;

  return result;
}

/**
 * Call python tiktoken to count tokens
 * @param {...string} texts - components to tokenize
 * @returns {Promise<Object>} token counts
 */
async function tokenizeWithTiktoken(...texts) {
  // Check tiktoken availability via pip show
  let tiktokenVersion = 'unknown';
  try {
    const pipOutput = execSync('pip show tiktoken', { encoding: 'utf8' });
    const versionMatch = pipOutput.match(/Version: ([\d.]+)/);
    if (versionMatch) {
      tiktokenVersion = versionMatch[1];
    }
  } catch (e) {
    throw new Error('tiktoken not installed. Install with: pip install tiktoken');
  }

  // Use python to count tokens (subprocess to avoid JS tokenizer approximations)
  const pythonScript = `
import tiktoken
enc = tiktoken.get_encoding("o200k_base")
import sys
import json
data = json.load(sys.stdin)
results = {}
total = 0
for key, text in data.items():
  if text is not None:
    count = len(enc.encode(text))
    results[key] = count
    total += count
  else:
    results[key] = 0
print(json.dumps({'counts': results, 'total': total}))
`;

  const inputData = {
    claude_md: texts[0] || '',
    memory_index: texts[1] || '',
    state_block: texts[2] || '',
  };

  return new Promise((resolve, reject) => {
    const proc = require('child_process').spawn('python3', ['-c', pythonScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    // spawn 자체 실패(ENOENT 등)는 'close'가 아니라 'error'로만 온다. Windows에서
    // python3가 없으면 이 핸들러 없이는 Promise가 영영 settle 안 돼 hang한다.
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(new Error(`tiktoken subprocess spawn failed: ${err && err.message ? err.message : err}`));
    });

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0) {
        reject(new Error(`tiktoken subprocess failed: ${stderr || 'unknown error'}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve({
          claude_tokens: result.counts.claude_md || 0,
          memory_tokens: result.counts.memory_index || 0,
          state_tokens: result.counts.state_block || 0,
          total_tokens: result.total || 0,
          version: tiktokenVersion,
        });
      } catch (e) {
        reject(new Error(`Failed to parse tiktoken output: ${e.message}`));
      }
    });

    try {
      proc.stdin.write(JSON.stringify(inputData));
      proc.stdin.end();
    } catch (err) {
      // 실패한 spawn의 stdin write는 던질 수 있다 — 'error' 핸들러가 reject를
      // 소유하므로 여기서는 삼킨다(이미 settle됐거나 곧 settle됨).
    }
  });
}

/**
 * Find MEMORY.md files recursively (simple implementation)
 */
function findMemoryFiles(basePath, maxDepth = 5, currentDepth = 0) {
  const results = [];
  if (currentDepth > maxDepth) return results;

  try {
    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(basePath, entry.name);
      if (entry.isDirectory() && entry.name !== '.git') {
        if (entry.name === 'memory') {
          const memPath = path.join(fullPath, 'MEMORY.md');
          if (fs.existsSync(memPath)) {
            results.push(memPath);
          }
        }
        results.push(...findMemoryFiles(fullPath, maxDepth, currentDepth + 1));
      }
    }
  } catch (e) {
    // Silently skip inaccessible directories
  }

  return results;
}

module.exports = { measureA3, tokenizeWithTiktoken };
