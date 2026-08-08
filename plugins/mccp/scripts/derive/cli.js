#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { MODEL_VERSION } = require('./model');
const { derive } = require('./index');
const { renderStatus } = require('../lib/renderer');

function showHelp() {
  process.stdout.write([
    'mccp-derive ' + MODEL_VERSION,
    '',
    'Usage: node plugins/mccp/scripts/derive/cli.js <subcommand> [options]',
    '',
    'Subcommands:',
    '  run [--json] [--summary] [--raw] [--strict]',
    '       --json     Emit JSON to stdout (default if no other format flag).',
    '       --summary  Emit a one-line-per-source text summary (debug only).',
    '       --raw      Emit unmasked model (absolute paths preserved). Stderr WARNING.',
    '       --strict   Exit 1 if M0 capability check reports contract_present=false.',
    '  render [--md] [--html] [--out <dir>] [--raw] [--strict]',
    '       --md       Emit STATUS.md only (default emits both).',
    '       --html     Emit status.html only.',
    '       --out <dir>  Output directory (default .claude/cache/).',
    '       --raw      Pass through to derive() — model.masked=false. HTML output gets a red ribbon. Stderr WARNING.',
    '       --strict   Exit 1 if M0 capability check reports contract_present=false.',
    '  metrics-assert [--json] [--fixtures] [--dry-run]',
    '       Mechanical acceptance gate: enumerate claimed-computable ids, reject null/baseline-forming.',
    '       Exit non-zero if any assertion fails. --json emits metrics object.',
    '  msw-a3 [--json]',
    '       A3 instruction-cost measurement: token counts of injected payloads.',
    '       Emits JSON with component breakdown (counts + hashes, no raw text).',
    '  msw-recoverability [--json] [--dry-run]',
    '       C1 recoverability probe: stratified sample of PR findings.',
    '       Read-only audit; applies 4 pre-registered thresholds. Emits verdict + coverage.',
    '  version          Print derive model version and exit 0.',
    '  --help, -h       Show this help.',
    '',
    'Notes:',
    '  - Default emits masked, share-safe JSON. --raw is opt-in for internal tools.',
    '  - Does not write to disk. Does not call any LLM. Reads `.claude/` only.',
    '  - msw-a3 requires tiktoken (pip install tiktoken) for o200k_base tokenization.',
    '',
  ].join('\n'));
}

function parseFlags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        out[a.slice(2)] = args[i + 1];
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

function emitSummary(model) {
  const s = model.sources;
  const degraded = [];
  for (const [k, v] of Object.entries(s)) {
    if (v && v.degraded) degraded.push(k);
  }
  const lines = [
    'mccp-derive ' + MODEL_VERSION,
    'derived_at: ' + model.derived_at,
    'masked: ' + model.masked,
    'm0_capability.contract_present: ' + model.m0_capability.contract_present,
    'plans: ' + (s.plans.count || 0),
    'receipts: ' + (s.receipts.count || 0),
    'state: ' + (s.state.item ? 'present (' + s.state.item.resume_state + ')' : 'absent'),
    'backlog: ' + (s.backlog.count || 0),
    'fix_task: ' + (s.fix_task.item ? 'present' : 'absent'),
    'pr: ' + (s.pr.item ? 'present' : 'absent'),
    'envelopes: ' + (s.envelopes.count || 0),
    'correlations: ' + (model.correlations || []).length,
    'warnings: ' + (model.warnings || []).length,
    'degraded sources: ' + (degraded.length === 0 ? '(none)' : degraded.join(', ')),
  ];
  return lines.join('\n') + '\n';
}

function cmdRun(rest) {
  const cwd = process.cwd();
  const wantRaw = !!rest.raw;
  if (wantRaw) {
    process.stderr.write('[mccp:derive] --raw emits absolute paths; do NOT pipe to LLM/log/share\n');
  }
  let model;
  try {
    model = derive(cwd, { raw: wantRaw, strict: !!rest.strict });
  } catch (err) {
    process.stderr.write('[mccp:derive] ERROR: ' + err.message + '\n');
    return 1;
  }
  if (rest.summary && !rest.json) {
    process.stdout.write(emitSummary(model));
  } else {
    process.stdout.write(JSON.stringify(model, null, 2) + '\n');
  }
  if (rest.strict && model.m0_capability && model.m0_capability.contract_present === false) {
    return 1;
  }
  return 0;
}

function writeAtomic(target, content) {
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, target);
}

function cmdRender(rest) {
  const cwd = process.cwd();
  const wantRaw = !!rest.raw;
  if (wantRaw) {
    process.stderr.write('[mccp:derive:render] --raw emits unmasked HTML; do NOT share\n');
  }
  let model;
  try {
    // dashboard-multi-session M1 (Codex F1) — render is the dashboard's default
    // entry, so opt the worktree scanner IN here. Without this the default-off
    // scanner would make the multi-session surface permanently invisible. bare
    // derive() (run / validate / perf-budget) stays default-off → spawn-free.
    model = derive(cwd, { raw: wantRaw, strict: !!rest.strict, worktreeScan: true });
  } catch (err) {
    process.stderr.write('[mccp:derive:render] ERROR derive failed: ' + err.message + '\n');
    return 1;
  }
  let rendered;
  try {
    // v1.3.0-m5 — pass the resolved snapshotsDir explicitly. derive() masked
    // model.repo_root to '<repo>', so the renderer's auto-resolution would
    // fall back to null; the CLI knows the real cwd and can supply the path.
    rendered = renderStatus(model, {
      snapshotsDir: path.join(cwd, '.claude', 'cache', 'snapshots'),
    });
  } catch (err) {
    process.stderr.write('[mccp:derive:render] ERROR render failed: ' + err.message + '\n');
    return 1;
  }
  const outDir = path.resolve(cwd, rest.out || path.join('.claude', 'cache'));
  try { fs.mkdirSync(outDir, { recursive: true }); }
  catch (err) {
    process.stderr.write('[mccp:derive:render] ERROR mkdir ' + outDir + ': ' + err.message + '\n');
    return 1;
  }
  const wantMd = !!rest.md;
  const wantHtml = !!rest.html;
  const emitMd = wantMd || (!wantMd && !wantHtml);
  const emitHtml = wantHtml || (!wantMd && !wantHtml);
  if (emitMd) writeAtomic(path.join(outDir, 'STATUS.md'), rendered.md);
  if (emitHtml) writeAtomic(path.join(outDir, 'status.html'), rendered.html);
  // v1.3.0-m3 advisory — DESIGN.md H1-H14 lint violations. fail-open: exit
  // code unchanged. blocking promotion deferred per OQ #4 (see plan).
  if (rendered.design_constraint_violations && rendered.design_constraint_violations.length > 0) {
    process.stderr.write('[mccp:renderer] design-lint '
      + rendered.design_constraint_violations.length + ' violation(s): '
      + rendered.design_constraint_violations.join(',') + ' (advisory)\n');
  }
  if (rendered.design_lint_degraded) {
    process.stderr.write('[mccp:renderer] design-lint subsystem degraded (advisory)\n');
  }
  // v1.3.0-m5 — piggyback the daily snapshot writer on the CLI render path.
  // Lazy require + try/catch so a missing snapshot module never breaks render.
  try {
    require('../lib/snapshot').writeSnapshotIfNeeded(model, {
      trigger: 'cli-render',
      repoRoot: cwd,
    });
  } catch (err) {
    process.stderr.write('[mccp:derive:render] snapshot failed (allow): '
      + (err && err.message) + '\n');
  }
  if (rest.strict && model.m0_capability && model.m0_capability.contract_present === false) {
    return 1;
  }
  return 0;
}

function cmdMetricsAssert(rest) {
  // R2-F2 mechanical acceptance gate
  // Enumerates claimed-computable ids, rejects null/baseline-forming, asserts B3 real value
  // Claimed-computable = {B2, B3} after multi-session-work-loop M3 restored B2
  // (A1/A2/A4 → forward-only, C1/C2/C3 forward-only, B1 insufficient), so only
  // those two per-id constants are referenced here.
  const {
    computeMetrics,
    METRIC_IDS,
    B2_CONCURRENT_CONFLICTS,
    B3_TOGGLE_AXES,
  } = require('../lib/msw-metrics');
  const { buildSeededModel } = require('../lib/msw-metrics/fixture');

  // PR-Codex R2-F3: C1은 live findings derive source가 없어(fixture만 주입)
  // 실 derive에서 절대 산출 못 하므로 claimed-computable에서 제외(forward-only).
  //
  // msw-m2-measurement-honesty-downgrade (Plan-Codex R1 PF2 / R3-F0 / re-R3 F0):
  // A2·A4·B2·A1 모두 C1과 함께 제외한다. A4는 self-credit, A2는 unverified stamp로
  // 계산이 오염됐고, B2는 독립 collision-producer-presence 신호가 없어 computed-zero를
  // 낼 수 없다. **A1도** production에 `task_completed` KIND 이벤트를 emit하는 live
  // producer가 없어(session-end는 `session_end` KIND + `task_completed:false` 필드만
  // 방출) 실 derive에선 항상 forward-only다 — fixture만 completions_producer_present를
  // 주입해 compute 경로를 실증할 뿐이라, claimed-computable에 두면 fixture만 통과하고
  // production은 계약(아래 Check 2: null numerator 거부)을 못 지킨다(re-R3 F0, 0.92).
  // 즉 B2를 제거한 바로 그 PF2 논리가 A1에도 동일 적용된다. A1은 flag가 live-derivable
  // (task_completed 관측 시 flip)이라 producer가 배선되면 A1을 다시 목록에 넣을 수 있다.
  // 남는 건 live producer가 실재하는 B3뿐 — 유일한 claimed-computable.
  //
  // multi-session-work-loop M3: **B2 rejoins** the claimed-computable set. The
  // PF2 argument that removed it was "no INDEPENDENT collision-producer-presence
  // signal exists; building one = building the producer, out of scope". M3 built
  // the producer — `evidence_guard_active` fires on every guarded receipt write,
  // so presence is orthogonal to incident count and a computed-zero is reachable.
  // The flip is additionally gated on a falsifiable runtime coverage audit
  // (b2-coverage-gate.js), so an uncovered writer keeps B2 at forward-only
  // instead of silently reporting `computed 0/N`.
  //
  // A1/A2/A4/C1 stay excluded — their producers are still absent or contaminated.
  const claimedComputable = [
    B2_CONCURRENT_CONFLICTS,
    B3_TOGGLE_AXES,
  ];

  // --fixtures: run the gate against the shared seeded fixture so it exercises
  // the compute path deterministically (baseline data accumulates over time, so
  // real derive on a fresh repo legitimately yields insufficient/baseline-forming
  // — that is NOT an acceptance signal). Without --fixtures the gate reads real
  // derive output (used later for monitoring once a baseline has formed).
  let metrics;
  if (rest.fixtures) {
    try {
      metrics = computeMetrics(buildSeededModel());
    } catch (err) {
      process.stderr.write('[mccp:metrics-assert] fixture compute failed: ' + err.message + '\n');
      return 1;
    }
  } else {
    const cwd = process.cwd();
    let model;
    try {
      model = derive(cwd, { raw: false, strict: false });
    } catch (err) {
      process.stderr.write('[mccp:metrics-assert] derive failed: ' + err.message + '\n');
      return 1;
    }
    if (!model.metrics || typeof model.metrics !== 'object') {
      process.stderr.write('[mccp:metrics-assert] FAIL: model.metrics not computed\n');
      return 1;
    }
    metrics = model.metrics;
  }
  let failures = 0;

  // Check 1: All claimed-computable must be present
  for (const id of claimedComputable) {
    if (!metrics[id]) {
      process.stderr.write(`[mccp:metrics-assert] FAIL: claimed-computable ${id} not in metrics\n`);
      failures++;
    }
  }

  // Check 2: No claimed-computable can have null numerator/denominator
  for (const id of claimedComputable) {
    const m = metrics[id];
    if (!m) continue;

    if (m.numerator === null || m.numerator === undefined) {
      process.stderr.write(`[mccp:metrics-assert] FAIL: ${id} numerator is null\n`);
      failures++;
    }
    if (m.denominator === null || m.denominator === undefined) {
      process.stderr.write(`[mccp:metrics-assert] FAIL: ${id} denominator is null\n`);
      failures++;
    }
  }

  // Check 3: No claimed-computable can have status='baseline-forming'
  for (const id of claimedComputable) {
    const m = metrics[id];
    if (!m) continue;

    if (m.status === 'baseline-forming') {
      process.stderr.write(`[mccp:metrics-assert] FAIL: ${id} status is 'baseline-forming' (not computed)\n`);
      failures++;
    }
  }

  // Check 4: B3 must have a real numeric value
  const b3 = metrics[B3_TOGGLE_AXES];
  if (b3) {
    if (typeof b3.value !== 'number' || b3.value < 0 || b3.value > 1) {
      process.stderr.write(`[mccp:metrics-assert] FAIL: B3 value is not numeric ratio [0,1] (got ${b3.value})\n`);
      failures++;
    }
  }

  // Ensure {metrics:{}} cannot pass
  if (Object.keys(metrics).length === 0) {
    process.stderr.write('[mccp:metrics-assert] FAIL: metrics object is empty\n');
    failures++;
  }

  if (failures > 0) {
    process.stderr.write(`[mccp:metrics-assert] ${failures} assertion(s) failed\n`);
    return 1;
  }

  if (rest.json) {
    process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
  }
  return 0;
}

async function cmdA3Measurement(rest) {
  // Task 7: A3 instruction-cost measurement
  // Measures token counts of CLAUDE.md + MEMORY.md index + STATE.md block
  // Read-only; emits counts + hashes only (no raw text)
  const { measureA3 } = require('../lib/msw-metrics/a3-instruction-cost');

  try {
    const result = await measureA3({
      readUserMemory: !!process.env.MCCP_A3_READ_USER_MEMORY,
    });

    if (rest.json || true) { // always JSON for now
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }

    // Exit with appropriate code
    if (result.status === 'error') {
      return 1;
    } else if (result.status === 'baseline-unavailable') {
      // Loud marking on stderr already done; exit ok but data incomplete
      return 0;
    } else {
      return 0;
    }
  } catch (err) {
    process.stderr.write('[mccp:derive:msw-a3] ERROR: ' + err.message + '\n');
    return 1;
  }
}

async function cmdRecoverabilityProbe(rest) {
  // Task 8: C1 recoverability probe
  // Stratified sample of PR findings; apply 4 pre-registered thresholds
  // Read-only; writes 0 new records
  const { probeRecoverability } = require('../lib/msw-metrics/recoverability-probe');

  try {
    const result = await probeRecoverability({
      dryRun: !!rest['dry-run'],
    });

    if (rest.json || true) { // always JSON for now
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }

    // Exit with appropriate code
    if (result.status === 'error') {
      return 1;
    } else {
      return 0;
    }
  } catch (err) {
    process.stderr.write('[mccp:derive:msw-recoverability] ERROR: ' + err.message + '\n');
    return 1;
  }
}

async function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    return 0;
  }
  const sub = args[0];
  const rest = parseFlags(args.slice(1));
  switch (sub) {
    case 'version':
      process.stdout.write(MODEL_VERSION + '\n');
      return 0;
    case 'run':
      return cmdRun(rest);
    case 'render':
      return cmdRender(rest);
    case 'metrics-assert':
      return cmdMetricsAssert(rest);
    case 'msw-a3':
      return await cmdA3Measurement(rest);
    case 'msw-recoverability':
      return await cmdRecoverabilityProbe(rest);
    default:
      process.stderr.write('mccp-derive: unknown subcommand "' + sub + '"\n');
      showHelp();
      return 1;
  }
}

if (require.main === module) {
  main(process.argv).then(code => process.exit(code));
}

module.exports = { main };
