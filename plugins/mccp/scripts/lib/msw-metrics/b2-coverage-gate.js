'use strict';

// multi-session-work-loop M3 — B2 강등 해제를 종속시키는 **반증 가능한** coverage gate.
//
// 설계 근거: docs/multi-session-work-loop/evidence-conflict-design.md §6
//
// 왜 필요한가: `evidence_guard_active` 관측 하나로 producer-present를 파생하면
// 그것이 증명하는 것은 "**어떤** guarded write가 1회 이상 있었다"뿐이고
// "**모든** receipt 변형 경로가 덮였다"가 아니다. writer 하나를 놓치면 그 경로는
// guard 이벤트도 overwrite 이벤트도 emit하지 않으므로, **덮이지 않은 writer가
// 있는데 B2가 `computed 0/N`으로 뒤집힌다** — M2가 거부한 결함이 한 층 위로
// 올라간 것이다.
//
// **primary falsifier는 런타임 파일시스템 변형 감사**다. 정적 소스 스캔은
// 동적 경로 · 셸/스크립트 writer · 생성 코드 · repo 밖 writer를 원리상 못 본다.
// 그래서 관측을 guarded producer 밖으로 옮겨, receipts 트리의 사전/사후
// 스냅샷 delta가 전부 대응 guard 이벤트를 갖는지 **파일시스템 결과로만** 판정한다.
//
// **위협 모델(정직히 명시)**: 이 gate가 겨냥하는 것은 *우발적 미계측 writer*
// (신규 직접 write 유입 · 셸 스크립트 · 생성 코드)이지 **repo write 권한을 가진
// 적대적 위조자가 아니다**. 후자는 감사 코드 자체를 고칠 수 있으므로 in-repo
// gate로 원리상 방어 불가이며, 단일 운영자 신뢰경계라는 PRD 전제상 범위 밖이다.
// gate가 막지 못하는 것을 막는다고 주장하지 않는다.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 이벤트 ts와 관측 창의 시계 오차 흡수.
const TS_TOLERANCE_MS = 30 * 1000;

// 승인된 receipt writer. 이 목록 밖에서 `.claude/receipts` 경로에 write하는 코드가
// 생기면 정적 lint가 실패한다 — "현재 알려진 caller"라는 한정을 지탱하는 guardrail.
const APPROVED_WRITERS = [
  'plugins/mccp/scripts/receipt/evidence-lock.js',   // 유일한 실제 원자 writer
  'plugins/mccp/scripts/receipt/store.js',           // guarded facade (writeReceipt/updateReceipt)
];

const APPROVED_PREFIXES = [
  'plugins/mccp/scripts/migrations/',                // sanctioned migration
];

// 기대 mutation entrypoint 레지스트리. 목록 밖 = 실패, 목록에 있는데 부재 = 실패.
const MUTATION_ENTRYPOINTS = [
  { file: 'plugins/mccp/scripts/receipt/store.js', fn: 'writeReceipt' },
  { file: 'plugins/mccp/scripts/receipt/store.js', fn: 'updateReceipt' },
  { file: 'plugins/mccp/scripts/receipt/evidence-lock.js', fn: 'writeFileAtomic' },
];

const WRITE_CALL_RE = /(writeFileSync|writeFile|appendFileSync|createWriteStream)\s*\([^)]*receipts/;

function toPosix(p) {
  return String(p).split(path.sep).join('/');
}

// ── 스냅샷 ───────────────────────────────────────────────────────────────────
// path → { receipt_hash, mtime, size }. receipt_hash가 봉인 증거의 정체이고,
// mtime/size는 carve-out 필드만 바뀐 변형(hash 불변)까지 포착한다.
function snapshotReceiptsTree(repoRoot) {
  const base = path.join(repoRoot, '.claude', 'receipts');
  const out = {};
  let gates;
  try { gates = fs.readdirSync(base); } catch (_e) { return out; }
  for (const g of gates) {
    if (g.startsWith('.')) continue;
    const gDir = path.join(base, g);
    let st;
    try { st = fs.lstatSync(gDir); } catch (_e) { continue; }
    if (!st.isDirectory() || st.isSymbolicLink()) continue;
    let files;
    try { files = fs.readdirSync(gDir); } catch (_e) { continue; }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const full = path.join(gDir, f);
      let stat;
      try { stat = fs.statSync(full); } catch (_e) { continue; }
      let receiptHash = null;
      try {
        const o = JSON.parse(fs.readFileSync(full, 'utf8'));
        receiptHash = (o && typeof o.receipt_hash === 'string') ? o.receipt_hash : null;
      } catch (_e) { receiptHash = null; }
      out[toPosix(path.relative(repoRoot, full))] = {
        receipt_hash: receiptHash,
        mtime: stat.mtimeMs,
        size: stat.size,
      };
    }
  }
  return out;
}

// ── guard 이벤트 수집 ────────────────────────────────────────────────────────
function readGuardEvents(repoRoot, opts) {
  opts = opts || {};
  const dir = opts.dir || path.join(repoRoot, '.claude', 'state', 'msw-events');
  const out = [];
  let files;
  try { files = fs.readdirSync(dir); } catch (_e) { return out; }
  for (const f of files) {
    if (!f.endsWith('.jsonl')) continue;
    let raw;
    try { raw = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (_e) { continue; }
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e && typeof e.kind === 'string' && e.kind.indexOf('evidence_') === 0) out.push(e);
      } catch (_e) { /* per-line malformed 격리 */ }
    }
  }
  return out;
}

// ── primary 축: 런타임 변형 감사 ─────────────────────────────────────────────
//
// gate-pass 판정식(모호하지 않게 고정): 관측된 `receipt_hash` 변경 각각에 대해,
//   - 같은 `target` 경로를 가리키고
//   - `pre_hash`가 변경 **전** 관측값과 같고
//   - `post_hash`가 변경 **후** 관측값과 같은
// guard 이벤트가 **정확히 1건 이상** 존재해야 한다. 이벤트 `ts`는 관측 창 ±30s까지 허용.
//
// pre/post를 **둘 다** 요구하는 이유: "delta + 아무 guard 이벤트"로는 우회 writer가
// 이벤트를 하나 흘려 자기증명할 수 있다. 사후 상태만 맞추는 사후조작으로는 통과 못 한다.
//
// carved-only 변형(hash 불변, mtime/size 변경)은 **별도 분류**로 세고 hash-변경
// 커버리지 판정에는 넣지 않는다 — carved 5필드는 봉인 증거를 바꿀 수 없으므로
// 그 손실은 증거 손실이 아니라 메타 손실이다(§6.4).
function correlateMutations(before, after, events, opts) {
  opts = opts || {};
  const tol = Number.isFinite(opts.toleranceMs) ? opts.toleranceMs : TS_TOLERANCE_MS;
  const winStart = Number.isFinite(opts.windowStart) ? opts.windowStart - tol : null;
  const winEnd = Number.isFinite(opts.windowEnd) ? opts.windowEnd + tol : null;

  const inWindow = function (e) {
    if (winStart === null && winEnd === null) return true;
    const t = Date.parse(e.ts || '');
    if (!Number.isFinite(t)) return false;
    if (winStart !== null && t < winStart) return false;
    if (winEnd !== null && t > winEnd) return false;
    return true;
  };

  const hashChanges = [];
  const carvedOnly = [];
  const paths = new Set(Object.keys(before).concat(Object.keys(after)));
  for (const p of paths) {
    const b = before[p] || null;
    const a = after[p] || null;
    if (!a) continue;                                     // 삭제는 별도 축(본 gate 범위 밖)
    const bh = b ? b.receipt_hash : null;
    const ah = a.receipt_hash;
    if (bh !== ah) {
      hashChanges.push({ target: p, pre_hash: bh, post_hash: ah });
    } else if (b && (b.mtime !== a.mtime || b.size !== a.size)) {
      carvedOnly.push({ target: p, receipt_hash: ah });
    }
  }

  const covered = [];
  const uncovered = [];
  for (const chg of hashChanges) {
    const match = events.some(function (e) {
      if (e.kind !== 'evidence_guard_active') return false;
      if (e.target !== chg.target) return false;
      if ((e.pre_hash || null) !== (chg.pre_hash || null)) return false;
      if ((e.post_hash || null) !== (chg.post_hash || null)) return false;
      return inWindow(e);
    });
    if (match) covered.push(chg); else uncovered.push(chg);
  }

  return {
    hash_changes: hashChanges.length,
    covered: covered.length,
    uncovered: uncovered,
    carved_only: carvedOnly.length,
    // 총량 비교는 금지(누락 은폐). 건별 목록을 그대로 노출한다.
    ok: uncovered.length === 0,
  };
}

// ── 보조 축: 정적 lint ───────────────────────────────────────────────────────
function listJsFiles(dir, acc) {
  acc = acc || [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_e) { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      listJsFiles(full, acc);
    } else if (e.isFile() && e.name.endsWith('.js')) {
      acc.push(full);
    }
  }
  return acc;
}

function staticLint(repoRoot) {
  const scanRoot = path.join(repoRoot, 'plugins', 'mccp', 'scripts');
  const violations = [];
  for (const full of listJsFiles(scanRoot)) {
    const rel = toPosix(path.relative(repoRoot, full));
    if (rel.indexOf('/tests/') !== -1) continue;
    if (APPROVED_WRITERS.indexOf(rel) !== -1) continue;
    if (APPROVED_PREFIXES.some(function (p) { return rel.indexOf(p) === 0; })) continue;
    let raw;
    try { raw = fs.readFileSync(full, 'utf8'); } catch (_e) { continue; }
    const lines = raw.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (WRITE_CALL_RE.test(lines[i])) {
        violations.push({ file: rel, line: i + 1, text: lines[i].trim().slice(0, 160) });
      }
    }
  }
  return { ok: violations.length === 0, violations: violations };
}

// ── 보조 축: entrypoint 레지스트리 ───────────────────────────────────────────
function entrypointRegistry(repoRoot) {
  const missing = [];
  for (const ep of MUTATION_ENTRYPOINTS) {
    let raw;
    try { raw = fs.readFileSync(path.join(repoRoot, ep.file), 'utf8'); } catch (_e) {
      missing.push(Object.assign({ reason: 'file-unreadable' }, ep));
      continue;
    }
    if (raw.indexOf('function ' + ep.fn) === -1) {
      missing.push(Object.assign({ reason: 'entrypoint-absent' }, ep));
    }
  }
  return { ok: missing.length === 0, missing: missing };
}

// ── gate ─────────────────────────────────────────────────────────────────────
//
// **런타임 관측 아티팩트 없이는 ok를 반환하지 않는다**(Implement-Codex R1 F4).
// primary falsifier가 런타임 감사인데 CLI가 정적 축만으로 `{ok:true}`를 낼 수
// 있으면, `computeB2`가 primary 축을 한 번도 관측하지 않고 `computed`로
// 이동한다 — 계측되지 않은 셸/생성 writer가 e2e 창 동안 receipt를 변형해도
// 정적 검사와 CLI가 모두 통과하고 B2가 `computed 0/N`을 보고하게 된다.
function evaluateGate(args) {
  args = args || {};
  const repoRoot = args.repoRoot;
  const failures = [];
  const axes = {};

  const obs = args.runtimeObservation || null;
  if (!obs || !obs.before || !obs.after) {
    failures.push({
      axis: 'runtime-mutation-audit',
      reason: 'runtime-observation-not-supplied',
      detail: 'the PRIMARY falsifier requires a before/after receipts-tree snapshot pair. '
        + 'Static axes alone can never establish coverage, so the gate is INDETERMINATE '
        + '(not ok) without one.',
    });
    axes.runtime = { ok: false, supplied: false };
  } else {
    const events = args.events || readGuardEvents(repoRoot, args);
    const r = correlateMutations(obs.before, obs.after, events, {
      windowStart: obs.windowStart,
      windowEnd: obs.windowEnd,
      toleranceMs: args.toleranceMs,
    });
    axes.runtime = Object.assign({ supplied: true }, r);
    if (!r.ok) {
      failures.push({
        axis: 'runtime-mutation-audit',
        reason: 'uncovered-mutation',
        detail: r.uncovered.length + ' receipt_hash change(s) had no matching guard event',
        uncovered: r.uncovered,
      });
    }
  }

  const lint = staticLint(repoRoot);
  axes.static_lint = lint;
  if (!lint.ok) {
    failures.push({
      axis: 'static-lint',
      reason: 'unapproved-receipt-writer',
      detail: lint.violations.length + ' receipt-path write(s) outside approved helpers',
      violations: lint.violations,
    });
  }

  const reg = entrypointRegistry(repoRoot);
  axes.entrypoint_registry = reg;
  if (!reg.ok) {
    failures.push({
      axis: 'entrypoint-registry',
      reason: 'registry-mismatch',
      detail: reg.missing.length + ' expected mutation entrypoint(s) missing',
      missing: reg.missing,
    });
  }

  return { ok: failures.length === 0, failures: failures, axes: axes };
}

// gate 결과를 derive가 읽을 수 있는 아티팩트로 남긴다. derive는 관측 창을 만들 수
// 없으므로(read-only · 시점 하나) 하니스가 만든 이 verdict를 소비한다.
function writeGateArtifact(repoRoot, result) {
  const p = path.join(repoRoot, '.claude', 'cache', 'b2-coverage-gate.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const body = {
    ok: !!result.ok,
    generated_at: new Date().toISOString(),
    failures: result.failures || [],
    axes: result.axes || {},
  };
  const tmp = p + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(body, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
  return p;
}

function readGateArtifact(repoRoot) {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, '.claude', 'cache', 'b2-coverage-gate.json'), 'utf8');
    const o = JSON.parse(raw);
    return (o && typeof o === 'object') ? o : null;
  } catch (_e) { return null; }
}

function runCli(argv) {
  const repoRoot = process.cwd();
  const result = evaluateGate({ repoRoot: repoRoot });
  if (argv.indexOf('--write-artifact') !== -1) {
    try { writeGateArtifact(repoRoot, result); } catch (_e) { /* best effort */ }
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  evaluateGate: evaluateGate,
  snapshotReceiptsTree: snapshotReceiptsTree,
  readGuardEvents: readGuardEvents,
  correlateMutations: correlateMutations,
  staticLint: staticLint,
  entrypointRegistry: entrypointRegistry,
  writeGateArtifact: writeGateArtifact,
  readGateArtifact: readGateArtifact,
  runCli: runCli,
  APPROVED_WRITERS: APPROVED_WRITERS,
  MUTATION_ENTRYPOINTS: MUTATION_ENTRYPOINTS,
  TS_TOLERANCE_MS: TS_TOLERANCE_MS,
};
