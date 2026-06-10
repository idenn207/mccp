'use strict';

// fix-task.md writer — Stop-loop failure → next-turn correction file.
//
// Schema: docs/v0.2-state-schema.md §2
//
// Atomic rename. Idempotent: same input produces same output (apart from
// timestamps), and writing while the previous fix-task is still present
// overwrites it (next-turn application takes the latest failure).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FIX_TASK_VERSION = 1;
const STATE_DIRNAME = path.join('.claude', 'state');
const FIX_TASK_FILENAME = 'fix-task.md';
const APPLIED_FILENAME = 'fix-task-applied.md';
const DEFAULT_TTL_DAYS = 7;

function fixTaskPath(repoRoot) {
  return path.join(repoRoot, STATE_DIRNAME, FIX_TASK_FILENAME);
}

function appliedPath(repoRoot) {
  return path.join(repoRoot, STATE_DIRNAME, APPLIED_FILENAME);
}

function ensureDir(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function plusDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function summarizeFailures(failures) {
  if (!Array.isArray(failures) || failures.length === 0) return [];
  return failures.map(f => ({
    stage: String(f.stage || 'unknown'),
    exitCode: f.exitCode !== undefined ? f.exitCode : null,
    excerpt: oneLineExcerpt(f.excerpt || f.stderr || f.stdout || ''),
  }));
}

function oneLineExcerpt(text) {
  if (!text) return '';
  // Match CR, LF, CRLF, and any run of them. `\r?\n` would miss bare \r
  // and let it leak into the body — same hazard as the escalate inject.
  const flat = String(text).replace(/[\r\n]+/g, ' ').trim();
  if (flat.length <= 200) return flat;
  return flat.slice(0, 199) + '…';
}

function deriveTitle(failures, verdict) {
  if (verdict === 'codex_critical') return 'Codex CRITICAL — stop and address';
  if (verdict === 'codex_divergent') return 'Codex divergent — review concerns';
  if (verdict === 'plan_conflict') return 'plan-implement conflict — review and revise plan';
  if (Array.isArray(failures) && failures.length) {
    const first = failures[0];
    return 'quality fail: ' + first.stage + ' (exit ' + (first.exitCode !== undefined ? first.exitCode : '?') + ')';
  }
  return 'Stop-loop fix required';
}

function deriveWhy(verdict) {
  switch (verdict) {
    case 'quality_fail':
      return 'The Stop-loop quality runner found at least one failing stage. ' +
        'Fix the listed failures, then end your next response — the Stop-loop will re-run.';
    case 'codex_divergent':
      return 'Codex review flagged unresolved concerns. ' +
        'Address them in the next turn before ending the response.';
    case 'codex_critical':
      return 'Codex review hit an Auto-CRITICAL category. ' +
        'Stop and address before proceeding. Do not bypass.';
    case 'plan_conflict':
      return 'Implement phase detected a conflict between the plan and actual ' +
        'test/validation results. The deviation cannot be silently absorbed — ' +
        'review the plan, decide whether to revise it or accept the implementation ' +
        'drift, then re-enter /mccp:prp-implement.';
    default:
      return 'Stop-loop fix required.';
  }
}

function buildBody(input) {
  const verdict = input.verdict || 'quality_fail';
  const counter = Math.max(1, Math.min(2, input.counter || 1));
  const escalate = Boolean(input.escalate);
  const failures = summarizeFailures(input.failures || []);
  const originating = Array.isArray(input.originatingReceipts) ? input.originatingReceipts : [];

  const title = input.title || deriveTitle(failures, verdict);
  const why = input.why || deriveWhy(verdict);

  const nextActions = Array.isArray(input.nextActions) && input.nextActions.length
    ? input.nextActions
    : deriveNextActions(verdict, failures);

  // YAML quirk: a bare `originating_receipts:` with no items below parses as
  // null in strict YAML parsers, dropping receipt provenance. Emit `[]` for
  // empty so the schema's sequence type is honored (Reviewer B Round 1 #8).
  const originatingYaml = originating.length
    ? ['originating_receipts:', ...originating.map(o => '  - ' + String(o))]
    : ['originating_receipts: []'];

  const frontmatter = [
    '---',
    'fix_task_version: ' + FIX_TASK_VERSION,
    'task_fingerprint: ' + (input.taskFingerprint || ''),
    'gate_id: stop-review-loop',
    'decision_id: ' + (input.decisionId || 'default'),
    'created_at: ' + nowIso(),
    'expires_at: ' + plusDays(nowIso(), DEFAULT_TTL_DAYS),
    'counter: ' + counter,
    'verdict: ' + verdict,
    'escalate: ' + (escalate ? 'true' : 'false'),
    ...originatingYaml,
    '---',
    '',
  ].join('\n');

  const sections = [];
  sections.push('## Title\n' + title);
  sections.push('## Why\n' + why);

  if (failures.length) {
    sections.push('## Failures\n' + failures.map(f =>
      '- ' + f.stage + ': exit=' + (f.exitCode !== null ? f.exitCode : '?') +
      (f.excerpt ? ' | ' + f.excerpt : '')
    ).join('\n'));
  } else if (input.verdict === 'codex_critical' || input.verdict === 'codex_divergent') {
    sections.push('## Failures\n- codex review: ' + (input.codexSummary || '(no summary)'));
  } else {
    sections.push('## Failures\n- (no failure detail recorded)');
  }

  sections.push('## Next Actions\n' + nextActions.map((a, i) => (i + 1) + '. ' + a).join('\n'));

  if (originating.length) {
    sections.push('## Originating Decisions\n' + originating.map(o => '- ' + o).join('\n'));
  } else {
    sections.push('## Originating Decisions\n- gate: stop-review-loop, decision: ' + (input.decisionId || 'default'));
  }

  if (escalate) {
    // F4: bounded inject — single-quote, ≤140 chars (post-escape), newlines normalized.
    // Empty/missing originalPrompt → literal <original-prompt> fallback.
    // Escape MUST precede truncate, otherwise quote-heavy prompts blow past
    // the 140-char bound when each ' expands to \'.
    const raw = typeof input.originalPrompt === 'string' ? input.originalPrompt : '';
    // Match CR, LF, CRLF, and any run of them. `\r?\n` would miss bare \r
    // (classic Mac / some transcript libs) and let it leak into the body.
    const flat = raw.replace(/[\r\n]+/g, ' ').trim();
    let promptForBody;
    if (flat) {
      const escaped = flat.replace(/'/g, "\\'");
      if (escaped.length > 140) {
        let cut = 139;
        // Avoid leaving a dangling backslash from a half-cut \' pair.
        if (escaped.charAt(cut - 1) === '\\') cut -= 1;
        promptForBody = escaped.slice(0, cut) + '…';
      } else {
        promptForBody = escaped;
      }
    } else {
      promptForBody = '<original-prompt>';
    }
    sections.push([
      '## Dual Reviewer Escalation Required',
      "Next: run /mccp:santa-loop '" + promptForBody + "'",
    ].join('\n'));
  }

  return frontmatter + sections.join('\n\n') + '\n';
}

function deriveNextActions(verdict, failures) {
  if (verdict === 'codex_critical') {
    return [
      'Re-read the Codex review and identify the CRITICAL category.',
      'Either remove the offending change or address the catalog item directly.',
      'Do not bypass — the Stop-loop will re-fire on next turn.',
    ];
  }
  if (verdict === 'codex_divergent') {
    return [
      'Re-read the Codex review and address each unresolved concern.',
      'Update the implementation, then end the response so the Stop-loop re-runs.',
    ];
  }
  if (verdict === 'plan_conflict') {
    return [
      'Read .claude/state/fix-task.md and the source plan to understand the conflict.',
      'Run /mccp:plan <plan-path> if the plan needs revision, OR write a deviation rationale into the plan body if the implementation is correct.',
      'Re-enter /mccp:prp-implement <plan-path> after deciding.',
    ];
  }
  if (Array.isArray(failures) && failures.length) {
    const first = failures[0];
    return [
      'Re-run `' + (first.commandHint || 'npm run ' + first.stage) + '` locally and fix the surfaced errors.',
      'After the fix, end the response — the Stop-loop will re-run the chain.',
    ];
  }
  return ['Investigate why the Stop-loop failed and fix before the next response.'];
}

function bodyHash(body) {
  return crypto.createHash('sha256').update(String(body || '')).digest('hex').slice(0, 12);
}

function write(repoRoot, input) {
  const target = fixTaskPath(repoRoot);
  ensureDir(target);
  const body = buildBody(input || {});
  const tmp = target + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, body, 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    throw err;
  }
  return { path: target, body: body, bodyHash: bodyHash(body) };
}

// Minimal frontmatter parser scoped to fix-task.md. Returns {fm, body} or null.
// Handles key:value scalars and key:\n  - item sequences (originating_receipts).
function parseFixTaskMd(raw) {
  if (!raw) return null;
  const match = String(raw).match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);
  if (!match) return null;
  const fmText = match[1];
  const bodyText = match[2];
  const fm = {};
  const lines = fmText.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i);
    if (!m) { i++; continue; }
    const key = m[1];
    const value = m[2].trim();
    if (value === '' || value === '[]') {
      // Possible sequence on subsequent indented lines.
      const items = [];
      let j = i + 1;
      while (j < lines.length) {
        const im = lines[j].match(/^\s+-\s+(.+)$/);
        if (!im) break;
        items.push(im[1].trim());
        j++;
      }
      fm[key] = items;  // [] when value was literal [] with no items
      i = j;
      continue;
    }
    if (value === 'true') fm[key] = true;
    else if (value === 'false') fm[key] = false;
    else if (/^-?\d+$/.test(value)) fm[key] = parseInt(value, 10);
    else fm[key] = value;
    i++;
  }
  return { fm: fm, body: bodyText };
}

// v0.3.2 — write fix-task.md if missing, otherwise idempotently append the
// receipt path to originating_receipts and ensure the escalation section is
// present. Preserves created_at / expires_at / counter from the existing
// file so a long-running escalation isn't TTL-reset by every appended receipt.
//
// Returns:
//   { path, body, bodyHash, skipped: true }  if all input receipts already present
//   { path, body, bodyHash, appended: true } if at least one new receipt added
//   { path, body, bodyHash, created: true }  if fallback to write() for missing file
function writeOrAppend(repoRoot, input) {
  const target = fixTaskPath(repoRoot);
  const payload = input || {};

  if (!fs.existsSync(target)) {
    const result = write(repoRoot, payload);
    return Object.assign({}, result, { created: true });
  }

  const existing = fs.readFileSync(target, 'utf8');
  const parsed = parseFixTaskMd(existing);
  if (!parsed) {
    // Corrupt frontmatter — fall back to overwrite (no recovery possible).
    process.stderr.write('[mccp:fix-task] WARNING: corrupt frontmatter at ' +
      target + '; overwriting via write()\n');
    const result = write(repoRoot, payload);
    return Object.assign({}, result, { created: true });
  }

  const existingReceipts = Array.isArray(parsed.fm.originating_receipts)
    ? parsed.fm.originating_receipts.slice()
    : [];
  const newReceipts = Array.isArray(payload.originatingReceipts)
    ? payload.originatingReceipts.filter(r => typeof r === 'string' && r.length > 0)
    : [];
  const toAdd = newReceipts.filter(r => existingReceipts.indexOf(r) === -1);

  if (toAdd.length === 0) {
    return { path: target, body: existing, bodyHash: bodyHash(existing), skipped: true };
  }

  const merged = existingReceipts.concat(toAdd);

  // Rebuild via buildBody with merged receipts + preserved counter.
  const rebuildInput = Object.assign({}, payload, {
    originatingReceipts: merged,
    counter: parsed.fm.counter || payload.counter || 1,
  });
  let body = buildBody(rebuildInput);

  // Preserve original created_at + expires_at (the escalation arrived earlier;
  // TTL was set then). buildBody re-emits both fields with `now`, so we patch.
  if (parsed.fm.created_at) {
    body = body.replace(/^created_at: .*$/m, 'created_at: ' + parsed.fm.created_at);
  }
  if (parsed.fm.expires_at) {
    body = body.replace(/^expires_at: .*$/m, 'expires_at: ' + parsed.fm.expires_at);
  }

  ensureDir(target);
  const tmp = target + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, body, 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    throw err;
  }
  return { path: target, body: body, bodyHash: bodyHash(body), appended: true };
}

function read(repoRoot) {
  const target = fixTaskPath(repoRoot);
  if (!fs.existsSync(target)) return null;
  return fs.readFileSync(target, 'utf8');
}

function clear(repoRoot) {
  const target = fixTaskPath(repoRoot);
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

function markApplied(repoRoot) {
  const src = fixTaskPath(repoRoot);
  if (!fs.existsSync(src)) return false;
  const dst = appliedPath(repoRoot);
  ensureDir(dst);
  fs.renameSync(src, dst);
  return true;
}

function sweepStaleApplied(repoRoot, maxAgeMs) {
  const target = appliedPath(repoRoot);
  if (!fs.existsSync(target)) return false;
  const cap = typeof maxAgeMs === 'number' ? maxAgeMs : DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000;
  const stat = fs.statSync(target);
  if (Date.now() - stat.mtimeMs > cap) {
    fs.unlinkSync(target);
    return true;
  }
  return false;
}

module.exports = {
  FIX_TASK_VERSION: FIX_TASK_VERSION,
  DEFAULT_TTL_DAYS: DEFAULT_TTL_DAYS,
  fixTaskPath: fixTaskPath,
  appliedPath: appliedPath,
  buildBody: buildBody,
  bodyHash: bodyHash,
  write: write,
  writeOrAppend: writeOrAppend,
  parseFixTaskMd: parseFixTaskMd,
  read: read,
  clear: clear,
  markApplied: markApplied,
  sweepStaleApplied: sweepStaleApplied,
  oneLineExcerpt: oneLineExcerpt,
};
