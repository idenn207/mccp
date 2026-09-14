'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { canonicalize } = require('./jcs');

function sha256(input) {
  return 'sha256:' + crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function stripBom(content) {
  if (content.length > 0 && content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

function normalizeLineEndings(content) {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function stripTrailingWhitespace(content) {
  return content.split('\n').map(function (line) {
    return line.replace(/[ \t]+$/, '');
  }).join('\n');
}

function normalizeTrailingNewlines(content) {
  const trimmed = content.replace(/\n+$/, '');
  return trimmed + '\n';
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---(\n|$)/;
const FRONTMATTER_KEY_RE = /^([A-Za-z0-9_-][A-Za-z0-9_.-]*):\s*(.*)$/;

function normalizeFrontmatter(content) {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return content;
  const yaml = match[1];
  const lines = yaml.split('\n');
  const flatEntries = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    const m = line.match(FRONTMATTER_KEY_RE);
    if (!m) {
      return content;
    }
    const key = m[1];
    let value = m[2];
    const collected = [line];
    let j = i + 1;
    while (j < lines.length && (lines[j].startsWith('  ') || lines[j].startsWith('\t') || lines[j].startsWith('- '))) {
      collected.push(lines[j]);
      j += 1;
    }
    flatEntries.push({ key: key, body: collected.join('\n') });
    i = j;
  }
  flatEntries.sort(function (a, b) {
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return 0;
  });
  const sortedYaml = flatEntries.map(function (e) { return e.body; }).join('\n');
  const tail = match[2] || '';
  return content.replace(FRONTMATTER_RE, '---\n' + sortedYaml + '\n---' + tail);
}

function canonicalizeMarkdown(content) {
  let c = content;
  c = stripBom(c);
  c = normalizeLineEndings(c);
  c = stripTrailingWhitespace(c);
  c = normalizeFrontmatter(c);
  c = normalizeTrailingNewlines(c);
  return c;
}

// ── 신뢰 불가 경로에 대한 유일한 read 초크포인트 (codex-harness-portability M3 · S3/S4) ──
//
// `--plan <path>`는 프롬프트에서 와서 여기까지 정규화 없이 도달한다. 진입점은 넷이고
// (`receipt-prompt.js` · `receipt-skill.js` · `receipt-prompt-submit.js` · `receipt/cli.js`)
// 그중 셋은 어떤 검사도 하지 않는다. 그래서 방어를 ingress마다 두지 않고 **읽는 자리 하나**에
// 둔다 — ingress에 두면 새 ingress가 생길 때마다 다시 빠뜨릴 수 있다.
//
// **`isFile()`이 실효 가드이고 크기 상한은 심층 방어다.** `/dev/zero`는 `size`를 `0`으로
// 보고하므로 크기만 재면 통과하고, 그 다음 `readFileSync`가 메모리를 소진한다(security S4).
//
// **`open` 다음에 `fstat`이다** — `statSync(path)`로 먼저 재고 나중에 여는 형태는 그 사이
// 경로가 바뀌는 check-then-open 경합을 남긴다. 여기서는 검사와 읽기가 **같은 fd**를 쓴다.
const MAX_MARKDOWN_BYTES = 4 * 1024 * 1024;

// **`O_NONBLOCK`이 없으면 검사에 도달하지 못한다.** FIFO를 여는 `open(2)`은 writer가 생길
// 때까지 **블록한다** — 즉 `isFile()`을 open 뒤에 두는 것만으로는 FIFO를 막지 못하고,
// 무한 대기가 메모리 소진을 대신할 뿐이다. 이 결함은 아래 회귀 test (b)가 실제로 멈추면서
// 드러났다(리뷰어가 지적한 것이 아니다). 정규 파일은 `O_NONBLOCK`을 무시한다.
const O_NONBLOCK = typeof fs.constants.O_NONBLOCK === 'number' ? fs.constants.O_NONBLOCK : 0;

function readTextBounded(abs) {
  let fd;
  try {
    fd = fs.openSync(abs, fs.constants.O_RDONLY | O_NONBLOCK);
  } catch (err) {
    // 부재·권한은 호출자가 이미 다루는 오류 형태 그대로 올린다.
    throw err;
  }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) {
      throw new Error('refusing to hash a non-regular file: ' + path.basename(abs));
    }
    if (st.size > MAX_MARKDOWN_BYTES) {
      throw new Error('refusing to hash a file above the ' + MAX_MARKDOWN_BYTES
        + '-byte cap (' + st.size + '): ' + path.basename(abs));
    }
    const buf = Buffer.allocUnsafe(st.size);
    let read = 0;
    while (read < st.size) {
      const n = fs.readSync(fd, buf, read, st.size - read, read);
      if (n <= 0) break;
      read += n;
    }
    return buf.slice(0, read).toString('utf8');
  } finally {
    try { fs.closeSync(fd); } catch (_) { /* best-effort */ }
  }
}

function markdownHash(filePath) {
  const abs = path.resolve(filePath);
  const raw = readTextBounded(abs);
  const canon = canonicalizeMarkdown(raw);
  return sha256(canon);
}

const STRUCTURAL_STRIP_KEYS = ['status', 'pr', 'completed_at'];
const STATUS_TOKENS = [
  'pending',
  'in-progress',
  'complete',
  'done',
  'blocked',
  'proposed',
  'accepted',
];

function stripFrontmatterKeys(content, keysToStrip) {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return content;
  const yaml = match[1];
  const lines = yaml.split('\n');
  const stripSet = new Set(keysToStrip);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      out.push(line);
      i += 1;
      continue;
    }
    const m = line.match(FRONTMATTER_KEY_RE);
    if (!m) {
      out.push(line);
      i += 1;
      continue;
    }
    const key = m[1];
    let j = i + 1;
    while (j < lines.length && (lines[j].startsWith('  ') || lines[j].startsWith('\t') || lines[j].startsWith('- '))) {
      j += 1;
    }
    if (!stripSet.has(key)) {
      for (let k = i; k < j; k++) out.push(lines[k]);
    }
    i = j;
  }
  const tail = match[2] || '';
  return content.replace(FRONTMATTER_RE, '---\n' + out.join('\n') + '\n---' + tail);
}

function normalizeCheckboxes(content) {
  return content.replace(/^(\s*[-*+]\s+)\[[xX]\]/gm, '$1[ ]');
}

function normalizePrPlaceholder(content) {
  return content.replace(/PR\s+#(?:\d+|\?{1,3})/g, 'PR #_PR_');
}

function normalizeTableStatusTokens(content) {
  const tokenAlt = STATUS_TOKENS.map(function (t) { return t.replace(/-/g, '\\-'); }).join('|');
  const re = new RegExp('(?<=\\|[ \\t]*)(' + tokenAlt + ')(?=[ \\t]*\\|)', 'g');
  return content.replace(re, '_STATUS_');
}

function canonicalizeMarkdownStructural(content) {
  let c = canonicalizeMarkdown(content);
  c = stripFrontmatterKeys(c, STRUCTURAL_STRIP_KEYS);
  c = normalizeCheckboxes(c);
  c = normalizePrPlaceholder(c);
  c = normalizeTableStatusTokens(c);
  return c;
}

function markdownHashStructural(filePath) {
  const abs = path.resolve(filePath);
  const raw = readTextBounded(abs);
  const canon = canonicalizeMarkdownStructural(raw);
  return sha256(canon);
}

function isPlanPath(filePath) {
  const normalized = String(filePath).replace(/\\/g, '/');
  return /(^|\/)\.claude\/plans\/[^/]+\.plan\.md$/.test(normalized);
}

function planAwareMarkdownHash(filePath) {
  return isPlanPath(filePath) ? markdownHashStructural(filePath) : markdownHash(filePath);
}

const SUBJECT_FIELDS = [
  'task_id',
  'phase',
  'gate_id',
  'plan_hash',
  'design_doc_hash',
  'base_sha',
  'head_sha',
  'round',
];

function subjectHash(receipt) {
  const subject = {};
  for (let i = 0; i < SUBJECT_FIELDS.length; i++) {
    const k = SUBJECT_FIELDS[i];
    if (receipt[k] !== undefined) subject[k] = receipt[k];
  }
  return sha256(canonicalize(subject));
}

function receiptHash(receipt) {
  // Deep-clone via JSON because the canonical hash MUST be insensitive to
  // mutations of nested objects we strip below (meta.briefing_*). A shallow
  // clone (Object.assign) leaks the meta reference, so deleting meta.briefing_*
  // would corrupt the live receipt the caller is still using.
  const clone = JSON.parse(JSON.stringify(receipt));
  delete clone.receipt_hash;
  // v1.3.0-m2 Codex R1 F1 absorption — briefing_* fields are stamped AFTER
  // the canonical receipt has been finalized + written + hashed. Excluding
  // them from the hashed body lets briefing land without invalidating the
  // tamper-detect digest. Backward-compat: receipts written before v1.3.0-m2
  // lack these keys, so `delete` is a no-op and the hash is bit-identical
  // to its pre-v1.3.0-m2 value.
  if (clone.meta && typeof clone.meta === 'object') {
    delete clone.meta.briefing_summary;
    delete clone.meta.briefing_token_count;
    delete clone.meta.briefing_token_estimated;
    delete clone.meta.briefing_invocation_count;
    // Dashboard Truthfulness M1 (F3) — completion-ledger writes a single
    // diagnostic field `ledger_write_skipped` onto the receipt AFTER the
    // canonical hash is finalized (epilogue restamp on the git-unsafe path).
    // Excluding it from the hashed body keeps the tamper-detect digest stable;
    // the authoritative completion signal is the ledger entry's existence, not
    // this flag. Backward-compat: pre-M1 receipts lack the key → no-op delete.
    delete clone.meta.ledger_write_skipped;
  }
  return sha256(canonicalize(clone));
}

function runGit(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd: cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr).trim() : '';
    const msg = stderr || err.message;
    const e = new Error('git ' + args.join(' ') + ' failed: ' + msg);
    e.code = 'GIT_FAILED';
    throw e;
  }
}

function gitRefs(options) {
  const opts = options || {};
  const cwd = opts.cwd || process.cwd();
  const candidates = [];
  if (opts.base) candidates.push(opts.base);
  candidates.push('origin/master', 'origin/main', 'master', 'main');
  const headSha = runGit(['rev-parse', 'HEAD'], cwd);
  let baseSha = null;
  let baseRef = null;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    try {
      baseSha = runGit(['merge-base', 'HEAD', c], cwd);
      baseRef = c;
      break;
    } catch (_e) {
      // try next
    }
  }
  if (!baseSha) {
    baseSha = headSha;
    baseRef = 'HEAD';
  }
  return { baseSha: baseSha, headSha: headSha, baseRef: baseRef };
}

function gitBranch(cwd) {
  try {
    return runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd || process.cwd());
  } catch (_e) {
    return null;
  }
}

function gitRepoRoot(cwd) {
  return runGit(['rev-parse', '--show-toplevel'], cwd || process.cwd());
}

module.exports = {
  sha256: sha256,
  readTextBounded: readTextBounded,
  MAX_MARKDOWN_BYTES: MAX_MARKDOWN_BYTES,
  canonicalizeMarkdown: canonicalizeMarkdown,
  markdownHash: markdownHash,
  canonicalizeMarkdownStructural: canonicalizeMarkdownStructural,
  markdownHashStructural: markdownHashStructural,
  isPlanPath: isPlanPath,
  planAwareMarkdownHash: planAwareMarkdownHash,
  subjectHash: subjectHash,
  receiptHash: receiptHash,
  gitRefs: gitRefs,
  gitBranch: gitBranch,
  gitRepoRoot: gitRepoRoot,
  SUBJECT_FIELDS: SUBJECT_FIELDS,
  STRUCTURAL_STRIP_KEYS: STRUCTURAL_STRIP_KEYS,
  STATUS_TOKENS: STATUS_TOKENS,
};
