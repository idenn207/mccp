#!/usr/bin/env node
'use strict';

// mccp-state CLI — manage v0.2 state files (loop-counter, fix-task, dedupe-key).
//
// S10a/S10b will extend this with `state write/read/clear` and breakpoint /
// spawn subcommands. S8 ships only the foundations.

const path = require('path');

const VERSION = '1.0.0';

function showHelp() {
  process.stdout.write([
    'mccp-state v' + VERSION,
    '',
    'Usage:',
    '  mccp-state counter --task <fingerprint> [--bump | --reset | --read] [--cwd <path>] [--fix-task-hash <hex>]',
    '  mccp-state fingerprint --prompt <first-200-chars>',
    '  mccp-state fix-task   --read | --clear | --mark-applied | --sweep-applied [--cwd <path>]',
    '  mccp-state dedupe-key --plan <path> --decision <slug> [--cwd <path>]',
    '  mccp-state journal query      [--work-unit <slug>] [--session <id>] [--since <iso>] [--kind <k>] [--include-superseded] [--json]',
    '  mccp-state journal verify     [--reproject] [--json]',
    '  mccp-state journal checkpoint [--reseed [--reason <text>]] [--json]',
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

function resolveCwd(flags) {
  return flags.cwd ? path.resolve(flags.cwd) : process.cwd();
}

function cmdCounter(flags) {
  const lc = require('./loop-counter');
  const cwd = resolveCwd(flags);
  const fp = flags.task;
  if (!fp) {
    process.stderr.write('mccp-state counter: --task <fingerprint> required\n');
    return 1;
  }
  if (flags.bump) {
    const next = lc.bump(cwd, fp, flags['fix-task-hash'] || null);
    process.stdout.write(JSON.stringify(next, null, 2) + '\n');
    return 0;
  }
  if (flags.reset) {
    lc.reset(cwd, fp);
    process.stdout.write(JSON.stringify({ ok: true, fingerprint: fp, reset: true }, null, 2) + '\n');
    return 0;
  }
  const got = lc.get(cwd, fp);
  process.stdout.write(JSON.stringify(got, null, 2) + '\n');
  return 0;
}

function cmdFingerprint(flags) {
  const lc = require('./loop-counter');
  const prompt = flags.prompt;
  if (prompt === undefined || prompt === true) {
    process.stderr.write('mccp-state fingerprint: --prompt <text> required\n');
    return 1;
  }
  process.stdout.write(lc.fingerprintFromPrompt(String(prompt)) + '\n');
  return 0;
}

function cmdFixTask(flags) {
  const ft = require('./fix-task');
  const cwd = resolveCwd(flags);
  if (flags.read) {
    const body = ft.read(cwd);
    if (body === null) {
      process.stderr.write('mccp-state fix-task: no fix-task.md present\n');
      return 2;
    }
    process.stdout.write(body);
    return 0;
  }
  if (flags.clear) {
    ft.clear(cwd);
    process.stdout.write(JSON.stringify({ ok: true, cleared: true }, null, 2) + '\n');
    return 0;
  }
  if (flags['mark-applied']) {
    const moved = ft.markApplied(cwd);
    process.stdout.write(JSON.stringify({ ok: moved, marked_applied: moved }, null, 2) + '\n');
    return 0;
  }
  if (flags['sweep-applied']) {
    const swept = ft.sweepStaleApplied(cwd);
    process.stdout.write(JSON.stringify({ ok: true, swept: swept }, null, 2) + '\n');
    return 0;
  }
  process.stderr.write('mccp-state fix-task: pick one of --read | --clear | --mark-applied | --sweep-applied\n');
  return 1;
}

function cmdDedupeKey(flags) {
  const dk = require('./dedupe-key');
  const planPath = flags.plan === undefined || flags.plan === true ? '' : String(flags.plan);
  const decision = flags.decision === undefined || flags.decision === true ? '' : String(flags.decision);
  if (!decision) {
    process.stderr.write('mccp-state dedupe-key: --decision <slug> required\n');
    return 1;
  }
  const key = dk.dedupeKey(planPath, decision, { cwd: resolveCwd(flags) });
  process.stdout.write(key + '\n');
  return 0;
}

// ── multi-session-work-loop M5 — journal 질의 표면 (G4) ──────────────────────
//
// 얇은 CLI: 판정은 전부 오라클(`lib/state-journal/*`)이 하고 여기서는 인자를
// 옮기고 exit code를 정한다 (lib/plan-review/cli.js 선례).

function journalOpts(flags) {
  return { repoRoot: resolveCwd(flags) };
}

function emit(flags, payload, humanLines) {
  if (flags.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    process.stdout.write(humanLines.join('\n') + '\n');
  }
}

function cmdJournalQuery(flags) {
  const store = require('./journal-store');
  const { classifyAll } = require('../lib/state-journal/order');
  const opts = journalOpts(flags);

  const read = store.readRecords(opts);
  const seed = store.seedTombstonesFromLedger(opts);
  const classified = classifyAll(read.records, { seededTombstones: seed.tombstones });

  const includeSuperseded = !!flags['include-superseded'];
  const wantWorkUnit = typeof flags['work-unit'] === 'string' ? flags['work-unit'] : null;
  const wantSession = typeof flags.session === 'string' ? flags.session : null;
  const wantKind = typeof flags.kind === 'string' ? flags.kind : null;
  const since = typeof flags.since === 'string' ? Date.parse(flags.since) : null;

  const rows = [];
  for (const entry of classified) {
    const r = entry.record;
    const projected = entry.decision.verdict === 'admit';
    if (!projected && !includeSuperseded) continue;
    if (wantWorkUnit && r.work_unit !== wantWorkUnit) continue;
    if (wantSession && r.session_id !== wantSession) continue;
    if (wantKind && r.kind !== wantKind) continue;
    if (since !== null && Number.isFinite(since) && Date.parse(r.ts) < since) continue;
    rows.push({
      record_id: r.record_id,
      ts: r.ts,
      session_id: r.session_id,
      work_unit: r.work_unit,
      seq: r.seq,
      kind: r.kind,
      verdict: entry.decision.verdict,
      superseded_by: entry.decision.supersededBy || r.superseded_by || null,
      reason: entry.decision.reason,
    });
  }

  emit(flags, { ok: true, count: rows.length, malformed_count: read.malformed_count, records: rows },
    rows.map(function (r) {
      return [r.ts, r.session_id, r.work_unit + '#' + r.seq, r.kind, r.verdict].join('  ');
    }).concat(['(' + rows.length + ' record(s), ' + read.malformed_count + ' malformed)']));
  return 0;
}

function cmdJournalVerify(flags) {
  const store = require('./journal-store');
  const stateWriter = require('./state-writer');
  const { project } = require('../lib/state-journal/project');
  const rec = require('../lib/state-journal/record');
  const opts = journalOpts(flags);
  const repoRoot = opts.repoRoot;

  const result = {
    ok: true,
    checks: {},
    corrupt_records: [],
    malformed_count: 0,
    degraded: false,
  };

  const read = store.readRecords(opts);
  result.malformed_count = read.malformed_count;
  result.malformed_samples = read.malformed_samples;

  // ① 레코드별 content_hash (DD6.3). **격리는 read 경로가 이미 수행했으므로**
  //    여기서 `read.records`를 재검하면 언제나 0건이 나온다(걸러진 뒤다) —
  //    검사가 무력해진다. 격리 목록(`read.corrupt`)을 보는 것이 정답이다.
  result.corrupt_records = (read.corrupt || []).slice();
  result.checks.content_hash = result.corrupt_records.length === 0;

  // 방어적 재검 — 통과한 레코드가 정말로 유효한지 한 번 더 본다(read 경로가
  // 조용히 느슨해지면 여기서 잡힌다).
  for (const r of read.records) {
    if (!rec.verifyContentHash(r)) {
      result.corrupt_records.push({
        record_id: r.record_id, work_unit: r.work_unit, seq: r.seq, source: 'post-filter',
      });
      result.checks.content_hash = false;
    }
  }

  // malformed는 truncation(디스크 full 등)을 은폐할 수 있으므로 비영점 exit 대상이다.
  result.checks.no_malformed_lines = read.malformed_count === 0;

  // ③ degraded 마커 부재.
  result.degraded = store.isDegraded(opts);
  result.checks.not_degraded = !result.degraded;

  // ② 투영 ↔ 디스크 STATE.md 일치.
  const input = store.readProjectionInput(opts);

  // checkpoint 무결성 (C2) — checkpoint는 투영의 base이므로 레코드보다 강한 축이다.
  result.checks.checkpoint_integrity = !input.checkpoint_corrupt;
  if (input.checkpoint_corrupt) {
    result.checkpoint_corrupt_reason = input.checkpoint_corrupt_reason;
  }

  let projectionMatches = null;
  if (!input.checkpoint) {
    result.checks.projection_matches_disk = null;   // 저널 없음 — 판정 대상 아님
  } else {
    const projected = project(input.records, input.base, {
      seededTombstones: input.seededTombstones,
    });
    const onDisk = stateWriter.readState(repoRoot);
    projectionMatches = stateWriter.contentHash(projected) === stateWriter.contentHash(onDisk);
    result.checks.projection_matches_disk = projectionMatches;

    if (flags.reproject && !projectionMatches) {
      // DD6.2 — 읽기 경로에 암묵 replay를 넣지 않는 대신 제공하는 **명시** 수렴 경로.
      stateWriter.update(repoRoot, {});
      result.reprojected = true;
      const after = stateWriter.readState(repoRoot);
      result.checks.projection_matches_disk =
        stateWriter.contentHash(project(store.readProjectionInput(opts).records,
          store.readProjectionInput(opts).base,
          { seededTombstones: input.seededTombstones })) === stateWriter.contentHash(after);
    }
  }

  // 추론 축 (DD6.1) — 마커가 외부에서 삭제돼도 잡는 2차 그물.
  // STATE.md의 updated_at이 저널 최신 레코드의 ts보다 뒤면 degraded로 판정한다.
  if (!result.degraded && read.records.length > 0) {
    const latest = read.records.reduce(function (a, b) {
      return Date.parse(a.ts) >= Date.parse(b.ts) ? a : b;
    });
    const onDisk = stateWriter.readState(repoRoot);
    const updatedAt = Date.parse(onDisk.frontmatter.updated_at || '');
    const latestTs = Date.parse(latest.ts);
    if (Number.isFinite(updatedAt) && Number.isFinite(latestTs) && updatedAt > latestTs + 1000) {
      result.checks.no_marker_inferred_degraded = false;
      result.inferred_degraded_reason =
        'STATE.md.updated_at (' + onDisk.frontmatter.updated_at + ') is newer than the ' +
        'latest journal record (' + latest.ts + ') — a write bypassed the journal';
    } else {
      result.checks.no_marker_inferred_degraded = true;
    }
  }

  // ledger seed 손상은 부활 방어의 구멍이므로 표면화한다 (DD11).
  result.ledger = { seeded: input.ledger.seeded, corrupt: input.ledger.corrupt };
  result.checks.ledger_intact = input.ledger.corrupt === 0;

  result.ok = Object.keys(result.checks).every(function (k) {
    return result.checks[k] !== false;
  });

  emit(flags, result, [
    'journal verify: ' + (result.ok ? 'OK' : 'FAILED'),
    '  content_hash        : ' + result.checks.content_hash + ' (' + result.corrupt_records.length + ' corrupt, quarantined from projection)',
    '  checkpoint_integrity: ' + result.checks.checkpoint_integrity,
    '  no_malformed_lines  : ' + result.checks.no_malformed_lines + ' (' + result.malformed_count + ')',
    '  not_degraded        : ' + result.checks.not_degraded,
    '  projection==disk    : ' + result.checks.projection_matches_disk,
    '  ledger_intact       : ' + result.checks.ledger_intact + ' (corrupt ' + input.ledger.corrupt + ')',
  ]);
  return result.ok ? 0 : 1;
}

function cmdJournalCheckpoint(flags) {
  const retention = require('../lib/state-journal/retention');
  const stateWriter = require('./state-writer');
  const opts = journalOpts(flags);

  if (flags.reseed) {
    const out = retention.reseed(Object.assign({}, opts, {
      state: stateWriter.readState(opts.repoRoot),
      reason: typeof flags.reason === 'string' ? flags.reason : undefined,
    }));
    emit(flags, out, ['reseed: ' + (out.ok ? 'ok' : 'failed ' + out.reason)]);
    return out.ok ? 0 : 1;
  }

  const out = retention.compact(opts);
  emit(flags, out, ['checkpoint: ' + (out.ok ? (out.compacted ? 'compacted' : out.reason) : 'failed ' + out.reason)]);
  return out.ok ? 0 : 1;
}

function cmdJournal(flags, rest) {
  const action = rest[0];
  switch (action) {
    case 'query': return cmdJournalQuery(flags);
    case 'verify': return cmdJournalVerify(flags);
    case 'checkpoint': return cmdJournalCheckpoint(flags);
    default:
      process.stderr.write('mccp-state journal: pick one of query | verify | checkpoint\n');
      return 1;
  }
}

function main(argv) {
  const sub = argv[2];
  const flags = parseFlags(argv.slice(3));
  switch (sub) {
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      showHelp();
      return 0;
    case '-v':
    case '--version':
    case 'version':
      process.stdout.write(VERSION + '\n');
      return 0;
    case 'counter':
      return cmdCounter(flags);
    case 'fingerprint':
      return cmdFingerprint(flags);
    case 'fix-task':
      return cmdFixTask(flags);
    case 'dedupe-key':
      return cmdDedupeKey(flags);
    case 'journal':
      return cmdJournal(flags, flags._);
    default:
      process.stderr.write('mccp-state: unknown subcommand "' + sub + '"\n');
      showHelp();
      return 1;
  }
}

if (require.main === module) {
  try {
    process.exit(main(process.argv));
  } catch (err) {
    process.stderr.write('mccp-state: fatal: ' + (err && err.stack || err) + '\n');
    process.exit(1);
  }
}

module.exports = { main: main, VERSION: VERSION };
