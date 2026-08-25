'use strict';

// v0.4.0 axis H — plan-conflict-detector.
//
// Phase 3 / Phase 4 of /mccp:prp-implement calls this to decide whether a
// validation failure (or zero-exit "fake pass") represents a true plan ↔
// implementation gap or a minor deviation that can be absorbed silently.
//
// Conservative philosophy: when in doubt, return conflict=false. False
// positives stop legitimate work; false negatives merely fall back to the
// pre-axis-H "WHAT/WHY note + continue" behavior, which is what users had
// before this module existed.
//
// Three signals (per plan §"plan-conflict-detector"):
//   1. signature-drift   — TypeError / is not a function / signature error in
//                          a file NOT in the plan's Files to Change table.
//   2. file-expansion    — git diff shows ≥2 files outside the plan.
//   3. fake-pass         — validation output contains "0 tests run" /
//                          "no tests" / "skipped" markers despite exit 0.

const fs = require('fs');

const SIGNATURE_ERROR_PATTERNS = [
  /TypeError\b/,
  /is not a function/i,
  /function .+ does not exist/i,
  /Cannot find name '/,
  /\bis not defined\b/,
  /ReferenceError\b/,
];

const FAKE_PASS_PATTERNS = [
  /\b0 tests? run\b/i,
  /\bno tests? (?:run|found|executed|matched)\b/i,
  /\bskipped\b.{0,40}(?:test|spec|suite)/i,
  /tests? to run\s*:?\s*0\b/i,
];

const FILE_PATH_RE =
  /\b((?:[a-zA-Z0-9_.\-]+[\/\\])*[a-zA-Z0-9_.\-]+\.(?:js|ts|tsx|jsx|mjs|cjs|md|json|py|go|rs))\b/g;

// M3 Task 5 (DD7) — plan 표의 `Files to Change` 첫 열은 관례상 백틱으로 감싼 경로다.
// 백틱을 제거하지 않으면 파싱 결과가 백틱을 달고 나오고 diff 경로는 맨몸이라
// `isInPlan`이 **영구 미매칭**한다 — 변경 파일 전부가 unplanned로 보고되고, 항상
// 발화하는 가드는 꺼진 가드와 같다.
function normalizePath(p) {
  return String(p || '').replace(/`/g, '')
    .replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function isInPlan(file, planFiles) {
  const f = normalizePath(file);
  if (!f) return false;
  for (const p of planFiles) {
    const pp = normalizePath(p);
    if (!pp) continue;
    if (f === pp) return true;
    if (f.endsWith('/' + pp) || pp.endsWith('/' + f)) return true;
  }
  return false;
}

function parseFilesToChange(planText) {
  if (!planText) return [];
  const lines = String(planText).split(/\r?\n/);
  const files = [];
  let inSection = false;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      inSection = /^Files\s+to\s+Change\s*$/i.test(heading[1]);
      continue;
    }
    if (!inSection) continue;
    const cellMatch = line.match(/^\|\s*([^|]+?)\s*\|/);
    if (!cellMatch) continue;
    const cellRaw = cellMatch[1].trim();
    if (!cellRaw) continue;
    if (/^File$/i.test(cellRaw)) continue;
    if (/^[-:]+$/.test(cellRaw)) continue;
    const linkMatch = cellRaw.match(/\[([^\]]+)\]\([^)]+\)/);
    const cell = linkMatch ? linkMatch[1] : cellRaw;
    const norm = normalizePath(cell);
    if (norm) files.push(norm);
  }
  return files;
}

function extractFilesFromText(text) {
  if (!text) return [];
  const found = new Set();
  let m;
  FILE_PATH_RE.lastIndex = 0;
  while ((m = FILE_PATH_RE.exec(text)) !== null) {
    found.add(normalizePath(m[1]));
  }
  return Array.from(found);
}

function hasSignatureLevelError(text) {
  if (!text) return false;
  return SIGNATURE_ERROR_PATTERNS.some(function (re) { return re.test(text); });
}

function matchesFakePass(text) {
  if (!text) return null;
  for (const re of FAKE_PASS_PATTERNS) {
    if (re.test(text)) return re.source;
  }
  return null;
}

function noConflict() {
  return { conflict: false, signal: null, reason: null };
}

function detectFromFileExpansion(opts) {
  const planFiles = Array.isArray(opts && opts.planFilesToChange) ? opts.planFilesToChange : [];
  const actual = Array.isArray(opts && opts.actualFilesChanged) ? opts.actualFilesChanged : [];
  if (planFiles.length === 0) return noConflict();
  const unplanned = actual
    .map(normalizePath)
    .filter(Boolean)
    .filter(function (f) { return !isInPlan(f, planFiles); });
  if (unplanned.length >= 2) {
    const sample = unplanned.slice(0, 3).join(', ');
    return {
      conflict: true,
      signal: 'file-expansion',
      reason: 'plan defines ' + planFiles.length + ' files; diff has ' +
        unplanned.length + ' unplanned (e.g. ' + sample + ')',
    };
  }
  return noConflict();
}

function detectFromValidationFailure(opts) {
  const planText = (opts && opts.planText) || '';
  const failureOutput = (opts && opts.failureOutput) || '';
  const filesChanged = Array.isArray(opts && opts.filesChanged) ? opts.filesChanged : [];

  if (!planText) return noConflict();

  const fakePassRe = matchesFakePass(failureOutput);
  if (fakePassRe) {
    return {
      conflict: true,
      signal: 'fake-pass',
      reason: 'validation output matches fake-pass pattern /' + fakePassRe + '/',
    };
  }

  const planFiles = parseFilesToChange(planText);
  if (hasSignatureLevelError(failureOutput)) {
    const errorFiles = extractFilesFromText(failureOutput);
    const unplanned = errorFiles.filter(function (f) { return !isInPlan(f, planFiles); });
    if (unplanned.length > 0) {
      return {
        conflict: true,
        signal: 'signature-drift',
        reason: 'signature-level error references file outside plan: ' + unplanned[0],
      };
    }
  }

  if (filesChanged.length > 0 && planFiles.length > 0) {
    const exp = detectFromFileExpansion({
      planFilesToChange: planFiles,
      actualFilesChanged: filesChanged,
    });
    if (exp.conflict) return exp;
  }

  return noConflict();
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        out[a.slice(2)] = argv[i + 1];
        i += 1;
      } else {
        out[a.slice(2)] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv.slice(2));
  const subcommand = args._[0] || 'detect';
  if (subcommand !== 'detect') {
    process.stderr.write('plan-conflict-detector: unknown subcommand "' + subcommand + '"\n');
    return 1;
  }
  let planText = '';
  if (args.plan && args.plan !== true) {
    try {
      planText = fs.readFileSync(String(args.plan), 'utf8');
    } catch (err) {
      process.stderr.write('plan-conflict-detector: cannot read --plan: ' + err.message + '\n');
      return 1;
    }
  }
  const failureOutput = args['failure-output'] && args['failure-output'] !== true
    ? String(args['failure-output']) : '';
  const filesChangedText = args['files-changed'] && args['files-changed'] !== true
    ? String(args['files-changed']) : '';
  const filesChanged = filesChangedText
    .split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);

  const result = detectFromValidationFailure({
    planText: planText,
    failureOutput: failureOutput,
    filesChanged: filesChanged,
  });

  if (args.json) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    process.stdout.write(result.conflict
      ? 'CONFLICT: ' + result.reason + '\n'
      : 'OK\n');
  }
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  detectFromValidationFailure: detectFromValidationFailure,
  detectFromFileExpansion: detectFromFileExpansion,
  parseFilesToChange: parseFilesToChange,
  extractFilesFromText: extractFilesFromText,
  hasSignatureLevelError: hasSignatureLevelError,
  matchesFakePass: matchesFakePass,
  isInPlan: isInPlan,
  normalizePath: normalizePath,
  SIGNATURE_ERROR_PATTERNS: SIGNATURE_ERROR_PATTERNS,
  FAKE_PASS_PATTERNS: FAKE_PASS_PATTERNS,
};
