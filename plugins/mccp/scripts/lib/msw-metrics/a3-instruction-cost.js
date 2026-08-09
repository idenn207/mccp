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
const { spawn, spawnSync } = require('child_process');

const MEMORY_ENV_FLAG = 'MCCP_A3_READ_USER_MEMORY';
const TIKTOKEN_ENCODING = 'o200k_base';

// M4 Task 1 — interpreter probe (replaces the `python3` hardcode).
//
// `python3` on Windows usually resolves to the WindowsApps Store stub, which
// prints an install hint and never runs Python. The hardcode therefore made
// A3 permanently `baseline-unavailable` on the operator's machine.
//
// Security absorption S1+S7: judge a candidate by its EXIT CODE plus a marker
// on stdout, never by parsing a version string out of prose — a stub that
// prints "Python was not found..." must not be mistaken for an interpreter.
// `shell: false` is explicit so no candidate name is ever handed to a shell.
//
// Scope note (S1, partially rejected): PATH resolution is NOT a new trust
// boundary here. Anyone who can prepend to PATH already controls the `node`
// that runs this file. Absolute-path pinning with ownership/signature checks
// was rejected as disproportionate for a local metrics script; instead the
// interpreter actually adopted is recorded in the emitted artifact so the
// measurement stays auditable.
const PY_CANDIDATES = Object.freeze([
  Object.freeze({ cmd: 'python3', prefix: Object.freeze([]) }),
  Object.freeze({ cmd: 'python', prefix: Object.freeze([]) }),
  Object.freeze({ cmd: 'py', prefix: Object.freeze(['-3']) }),
]);

const PROBE_MARKER = 'PYPROBE_OK:';
// The probe reports BOTH the major version and whether tiktoken imports in that
// same interpreter. Selecting on version alone picks the first Python 3 on PATH,
// which on a machine with several installs is routinely not the one carrying
// tiktoken — A3 then reports `baseline-unavailable` while a perfectly usable
// interpreter sits one candidate later. The import is attempted here rather than
// inferred from `pip` for the same reason the version string is: the process that
// answers must be the process that would tokenize.
const PROBE_SRC = [
  'import sys',
  'try:',
  '    import tiktoken',
  '    _tk = 1',
  'except Exception:',
  '    _tk = 0',
  'sys.stdout.write("' + PROBE_MARKER + '%d:%d" % (sys.version_info[0], _tk))',
  'raise SystemExit(0 if sys.version_info[0] == 3 else 3)',
].join('\n');

let _interpreterCache;

/**
 * Find the first candidate that is a real Python 3.
 * @param {Object} [opts]
 * @param {boolean} [opts.noCache] - bypass the per-process memo (tests)
 * @returns {{cmd: string, prefix: string[], version: string}|null}
 */
function resolveInterpreter(opts = {}) {
  if (!opts.noCache && _interpreterCache !== undefined) return _interpreterCache;

  // Two-tier selection. A candidate that imports tiktoken wins outright; the
  // first bare Python 3 is kept only as a fallback so that "no tiktoken anywhere"
  // still reports the existing loud baseline-unavailable against a real
  // interpreter instead of returning null and losing that detail.
  let withTiktoken = null;
  let barePython3 = null;

  for (const cand of PY_CANDIDATES) {
    let r;
    try {
      r = spawnSync(cand.cmd, cand.prefix.concat(['-c', PROBE_SRC]), {
        encoding: 'utf8',
        shell: false,
        timeout: 20000,
        windowsHide: true,
      });
    } catch (_e) {
      continue;
    }
    if (!r || r.error || r.status !== 0) continue;
    const out = String(r.stdout || '');
    const at = out.indexOf(PROBE_MARKER + '3');
    if (at === -1) continue;

    // marker is `PYPROBE_OK:<major>:<tiktoken 0|1>`; tolerate the older
    // major-only shape by treating a missing third field as unknown.
    const tail = out.slice(at + PROBE_MARKER.length + 1);
    const hasTiktoken = /^:1\b/.test(tail);
    const entry = {
      cmd: cand.cmd,
      prefix: cand.prefix.slice(),
      version: null,
      tiktoken_available: hasTiktoken,
    };
    if (hasTiktoken) { withTiktoken = entry; break; }
    if (!barePython3) barePython3 = entry;
  }

  const found = withTiktoken || barePython3;
  if (!opts.noCache) _interpreterCache = found;
  return found;
}

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
  // The documented contract is `=1`, so honour that literally. A bare truthiness
  // test made `MCCP_A3_READ_USER_MEMORY=0` switch the component ON, which is the
  // opposite of what anyone writing `0` means and a silent divergence from the
  // documented spelling.
  const memoryFlagRaw = process.env[MEMORY_ENV_FLAG];
  const memoryFlagOn = typeof memoryFlagRaw === 'string'
    && /^(1|true|yes|on)$/i.test(memoryFlagRaw.trim());
  const readUserMemory = opts.readUserMemory !== false && memoryFlagOn;

  try {
    // Component 1: CLAUDE.md
    const claudePath = opts.claudePath || path.join(process.cwd(), 'CLAUDE.md');
    let claudeText = '';
    let claudeBytes = 0;
    let claudeHash = '';

    // CLAUDE.md IS the A3 numerator's headline component; without it there is no
    // measurement to make. Today an absent file happens to fail closed further
    // down, but only because tokenization then dereferences a component that was
    // never created — a TypeError standing in for a contract. Anyone who later
    // initialises that component defensively would silently turn this into a
    // sealed zero-token baseline, so state the requirement here instead of
    // relying on a crash to enforce it.
    if (!fs.existsSync(claudePath)) {
      result.status = 'baseline-unavailable';
      result.not_delivered_reason =
        `CLAUDE.md not found at ${claudePath} — the A3 numerator has no headline component ` +
        '(measuring an absent instruction file as zero would seal a meaningless baseline)';
      process.stderr.write('[A3 MEASUREMENT] Baseline unavailable: ' + result.not_delivered_reason + '\n');
      return result;
    }

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

    // M4 Task 1 — measure what is ACTUALLY injected, not the frontmatter.
    //
    // The previous implementation matched /^---\n(...)\n---/ and measured the
    // YAML frontmatter, which SessionStart never injects. What reaches the
    // model is `formatStateBlock(body)` — the system-reminder wrapper around
    // the STATE.md *body* (plus the escalation section when flagged). Measuring
    // the frontmatter therefore counted the wrong slice of the numerator.
    stateText = readInjectedStateBlock(opts);
    if (stateText) {
      stateBytes = Buffer.byteLength(stateText, 'utf8');
      stateHash = crypto.createHash('sha256').update(stateText).digest('hex');
      result.components.state_block = {
        bytes: stateBytes,
        hash: stateHash,
        tokens: null,
      };
    }

    // Total bytes (never store raw text)
    const totalBytes = claudeBytes + memoryBytes + stateBytes;
    result.numerator_bytes = totalBytes;

    // Try to get token count via tiktoken
    try {
      const tokenInfo = await tokenizeWithTiktoken(claudeText, memoryText, stateText);

      result.tokenizer_info = {
        tool: 'tiktoken',
        model: TIKTOKEN_ENCODING,
        version: tokenInfo.version,
        // Provenance of the version above: it was read in the SAME process that
        // ran enc.encode, so "reproducible with this tokenizer" is verifiable.
        version_source: 'tokenizing-process',
        python_version: tokenInfo.python_version,
        interpreter: tokenInfo.interpreter,
        executable: tokenInfo.executable,
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
  // M4 Task 1 — the tokenizer version is read INSIDE the process that does the
  // tokenizing. The previous `execSync('pip show tiktoken')` could report a
  // version from an entirely different pip/interpreter than the one that ran
  // `enc.encode`, so the "pin the tokenizer for reproducibility" contract
  // (measurement-design.md §A3) was not actually enforced. It also went
  // through a shell; this does not.
  const interp = resolveInterpreter();
  if (!interp) {
    throw new Error(
      'no Python 3 interpreter found (tried ' +
      PY_CANDIDATES.map((c) => [c.cmd].concat(c.prefix).join(' ')).join(', ') + ')'
    );
  }

  // `disallowed_special=()` — CLAUDE.md is prose that may legitimately contain
  // sequences tiktoken treats as special tokens; the default raises on them and
  // would surface as a spurious baseline-unavailable.
  const pythonScript = [
    'import sys, json',
    'try:',
    '    import tiktoken',
    'except Exception as e:',
    '    sys.stderr.write("tiktoken import failed: %s" % e)',
    '    raise SystemExit(4)',
    'enc = tiktoken.get_encoding("' + TIKTOKEN_ENCODING + '")',
    'data = json.load(sys.stdin)',
    'counts = {}',
    'total = 0',
    'for key, text in data.items():',
    '    if text is None:',
    '        counts[key] = 0',
    '        continue',
    '    n = len(enc.encode(text, disallowed_special=()))',
    '    counts[key] = n',
    '    total += n',
    'version = getattr(tiktoken, "__version__", None)',
    'if not version:',
    '    try:',
    '        from importlib.metadata import version as _v',
    '        version = _v("tiktoken")',
    '    except Exception:',
    '        version = "unknown"',
    'sys.stdout.write(json.dumps({',
    '    "counts": counts, "total": total,',
    '    "tiktoken_version": version,',
    '    "python_version": sys.version.split()[0],',
    '    "executable": sys.executable,',
    '}))',
  ].join('\n');

  const inputData = {
    claude_md: texts[0] || '',
    memory_index: texts[1] || '',
    state_block: texts[2] || '',
  };

  return new Promise((resolve, reject) => {
    const proc = spawn(interp.cmd, interp.prefix.concat(['-c', pythonScript]), {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
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
          version: result.tiktoken_version || 'unknown',
          python_version: result.python_version || null,
          executable: result.executable || null,
          interpreter: [interp.cmd].concat(interp.prefix).join(' '),
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

// SessionStart wrapper shapes. These MIRROR state-injector.js#formatStateBlock
// and #appendEscalateSection.
//
// We deliberately do NOT call state-injector.inject(): that entry point has
// side effects (it sweeps stale fix-task-applied.md) and A3 must stay a
// read-only measurement. The BODY comes from the injector's own exported
// reader, so only these two small wrapper shapes are duplicated — if the
// injector's wrapper changes, this must follow. The emitted artifact records
// this as a caveat so a silent drift is visible at audit time.
const STATE_BLOCK_HEAD = '<system-reminder>\n[mccp:STATE.md — restored from previous session]\n\n';
const STATE_BLOCK_TAIL = '\n</system-reminder>\n';

function wrapStateBlock(body) {
  return STATE_BLOCK_HEAD + body + STATE_BLOCK_TAIL;
}

function stripFrontmatter(raw) {
  const m = String(raw).match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? String(raw).slice(m[0].length) : String(raw);
}

/**
 * Reconstruct the SessionStart-injected STATE.md block (read-only).
 * @returns {string|null} the exact text injected, or null when absent
 */
function readInjectedStateBlock(opts = {}) {
  if (typeof opts.stateBlockText === 'string') return opts.stateBlockText;

  if (opts.statePath) {
    if (!fs.existsSync(opts.statePath)) return null;
    try {
      return wrapStateBlock(stripFrontmatter(fs.readFileSync(opts.statePath, 'utf8')).trimEnd());
    } catch (_e) {
      return null;
    }
  }

  try {
    const injector = require('../../state/state-injector');
    const state = injector.readState(opts.repoRoot || process.cwd());
    if (!state || state.kind !== 'ok' || typeof state.body !== 'string') return null;
    let body = state.body;
    const fm = state.frontmatter;
    if (fm && fm.escalate_pending === true) {
      const dec = fm.escalate_pending_decision_id || '(unknown)';
      body += '\n' + [
        '',
        '## Escalation Pending',
        '- decision: ' + dec,
        '- Next: /mccp:santa-loop (가용)',
        '- 해제: santa-loop 통과 후 receipt가 ACCEPT 상태로 갱신되면 자동 clear',
      ].join('\n');
    }
    return wrapStateBlock(body);
  } catch (_e) {
    return null;
  }
}

/**
 * Find MEMORY.md files recursively (simple implementation).
 *
 * Security absorption S4: skip symlinks. `readdirSync(withFileTypes)` uses
 * lstat semantics, so a symlinked directory already fails isDirectory() and is
 * not traversed — the real exposure was a symlinked MEMORY.md *file* pointing
 * outside ~/.claude (its bytes would be tokenized and its size recorded). We
 * reject any candidate whose realpath escapes the search root.
 */
function findMemoryFiles(basePath, maxDepth = 5, currentDepth = 0, rootReal = null) {
  const results = [];
  if (currentDepth > maxDepth) return results;

  let root = rootReal;
  if (root === null) {
    try {
      root = fs.realpathSync(basePath);
    } catch (_e) {
      return results;
    }
  }

  try {
    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(basePath, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && entry.name !== '.git') {
        if (entry.name === 'memory') {
          const memPath = path.join(fullPath, 'MEMORY.md');
          if (isContainedRegularFile(memPath, root)) {
            results.push(memPath);
          }
        }
        results.push(...findMemoryFiles(fullPath, maxDepth, currentDepth + 1, root));
      }
    }
  } catch (e) {
    // Silently skip inaccessible directories
  }

  return results;
}

// A regular (non-symlink) file whose realpath stays under `root`.
function isContainedRegularFile(candidate, root) {
  try {
    if (!fs.lstatSync(candidate).isFile()) return false;
    const real = fs.realpathSync(candidate);
    const rel = path.relative(root, real);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  } catch (_e) {
    return false;
  }
}

module.exports = {
  measureA3,
  tokenizeWithTiktoken,
  resolveInterpreter,
  readInjectedStateBlock,
  MEMORY_ENV_FLAG,
  TIKTOKEN_ENCODING,
  DENOMINATOR_TOKENS: 200000,
};
