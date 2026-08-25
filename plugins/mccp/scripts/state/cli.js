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
    '  mccp-state msw-event emit --kind <task_completed|remediation_pr> --work-unit <slug>',
    '                            [--pr-number <n>] [--gate-decision-id <slug>] [--finding-id <hex16>]',
    '                            [--session <id>] [--cwd <path>] [--json]',
    '                            (remediation_pr requires --pr-number AND --finding-id)',
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

// ── msw-event emit (multi-session-work-loop M8 Task 4 · DD4) ────────────────
//
// 왜 CLI가 필요한가: 완주(`task_completed`)는 **PR 번호가 있어야 성립**하고 그
// 번호는 `gh pr create` 이후에만 존재한다. 그 뒤에 도는 코드가 없으므로
// `/mccp:pr` Phase 5(명령 본문)가 이 경로로 emit한다. 착수를 hook이 기록하고
// 완주를 명령 본문이 기록하는 비대칭은 의도적이다.
//
// 이 서브커맨드는 **shell 도달 가능한 쓰기 경로**다(security review R1 F3).
// 그래서 세 축을 좁힌다:
//
//   1. **kind 열거를 고정한다.** 임의 kind를 허용하면 셸 호출자가
//      `task_started`나 `session_start`를 위조해 A1의 **분모**와 세션 수명 축을
//      직접 조작할 수 있다. 분모는 hook만 쓴다(그쪽은 사용자가 실제로 명령을
//      발화해야 돈다). 여기서 쓸 수 있는 것은 분자 쪽 둘뿐이다.
//      분자 위조가 여전히 가능하다는 점은 숨기지 않는다 — DD4가 산문 의존을
//      이미 인정했고, DD5의 `sealed_without_completion`이 그 간극을 수치로
//      드러낸다. 좁힐 수 있는 것을 좁히고, 못 좁히는 것은 관측한다.
//   2. **값 형태를 검증한다.** work_unit·gate_decision_id는 canonical `SLUG_RE`,
//      pr_number는 부호없는 정수. 검증 없이 통과시키면 파일명 성분과 집계 키가
//      임의 문자열이 된다.
//   3. **모르는 플래그를 거부한다.** allowlist 밖 키를 조용히 무시하면 오타 하나가
//      "기록됐다"는 착각을 만든다 — `eventToJsonLine`이 이미 조용히 버리므로
//      여기서 시끄럽게 막는 것이 유일한 방어다.
const MSW_EMITTABLE_KINDS = ['task_completed', 'remediation_pr'];
const MSW_EMIT_FLAGS = ['kind', 'work-unit', 'pr-number', 'gate-decision-id', 'finding-id', 'session', 'cwd', 'json'];

function cmdMswEventEmit(flags) {
  const { SLUG_RE } = require('../receipt/decision');
  const { FINDING_ID_RE } = require('./findings-registry');
  const mswEvents = require('./msw-events');
  const { resolveRawSessionId } = require('../lib/session-identity');
  const { sanitizeSessionId } = require('../lib/utils');

  const unknown = Object.keys(flags).filter(function (k) {
    return k !== '_' && MSW_EMIT_FLAGS.indexOf(k) === -1;
  });
  if (unknown.length) {
    process.stderr.write('mccp-state msw-event emit: unknown flag(s): --' + unknown.join(' --') + '\n');
    return 1;
  }

  const kind = typeof flags.kind === 'string' ? flags.kind : '';
  if (MSW_EMITTABLE_KINDS.indexOf(kind) === -1) {
    process.stderr.write('mccp-state msw-event emit: --kind must be one of '
      + MSW_EMITTABLE_KINDS.join(' | ') + ' (got ' + JSON.stringify(kind) + ')\n');
    return 1;
  }

  const workUnit = typeof flags['work-unit'] === 'string' ? flags['work-unit'] : '';
  if (!SLUG_RE.test(workUnit)) {
    process.stderr.write('mccp-state msw-event emit: --work-unit must match '
      + String(SLUG_RE) + ' (got ' + JSON.stringify(workUnit) + ')\n');
    return 1;
  }

  const event = { kind: kind, work_unit: workUnit, producer: 'state-cli' };

  if (flags['pr-number'] !== undefined) {
    const raw = String(flags['pr-number']);
    if (!/^[0-9]+$/.test(raw)) {
      process.stderr.write('mccp-state msw-event emit: --pr-number must be an unsigned integer (got '
        + JSON.stringify(raw) + ')\n');
      return 1;
    }
    event.pr_number = raw;
  }

  if (flags['gate-decision-id'] !== undefined) {
    const gid = String(flags['gate-decision-id']);
    if (!SLUG_RE.test(gid)) {
      process.stderr.write('mccp-state msw-event emit: --gate-decision-id must match '
        + String(SLUG_RE) + ' (got ' + JSON.stringify(gid) + ')\n');
      return 1;
    }
    event.gate_decision_id = gid;
  }

  if (flags['finding-id'] !== undefined) {
    const fid = String(flags['finding-id']);
    if (!FINDING_ID_RE.test(fid)) {
      process.stderr.write('mccp-state msw-event emit: --finding-id must match '
        + String(FINDING_ID_RE) + ' (got ' + JSON.stringify(fid) + ')\n');
      return 1;
    }
    event.finding_id = fid;
  }

  // `remediation_pr`는 그 이름이 뜻하는 바가 PR 번호이므로 번호 없이는 무의미하다.
  if (kind === 'remediation_pr' && event.pr_number === undefined) {
    process.stderr.write('mccp-state msw-event emit: --kind remediation_pr requires --pr-number\n');
    return 1;
  }

  // local review H3 — `--finding-id`도 같은 이유로 필수다. 조인 키가 없는 귀속
  // 레코드는 **어느 소비처도 읽을 수 없다**: `derive/sources/findings.js`는
  // distinct finding_id로 `with_remediation_pr`을 세므로, id 없는 레코드는
  // 디스크에 남아도 커버리지를 영원히 0으로 만든다. 그 상태(writer는 쓰는데
  // reader가 못 읽음)가 이 milestone이 갚는 부채와 같은 형태라 여기서 막는다.
  if (kind === 'remediation_pr' && event.finding_id === undefined) {
    process.stderr.write('mccp-state msw-event emit: --kind remediation_pr requires --finding-id '
      + '(a record with no join key can never be read back)\n');
    return 1;
  }

  const sid = sanitizeSessionId(typeof flags.session === 'string' ? flags.session : null)
    || sanitizeSessionId(resolveRawSessionId(process.env));
  if (!sid) {
    process.stderr.write('mccp-state msw-event emit: no resolvable session id '
      + '(pass --session <id> or set MCCP_SESSION_ID)\n');
    return 1;
  }

  let res;
  try {
    res = mswEvents.appendEvent(sid, event, { repoRoot: resolveCwd(flags) });
  } catch (err) {
    process.stderr.write('mccp-state msw-event emit: ' + ((err && err.message) || String(err)) + '\n');
    return 1;
  }
  if (!res || !res.ok) {
    process.stderr.write('mccp-state msw-event emit: append failed: '
      + ((res && res.reason) || 'unknown') + '\n');
    return 1;
  }

  emit(flags, { ok: true, kind: kind, work_unit: workUnit, session_id: sid },
    ['emitted ' + kind + ' work_unit=' + workUnit + ' session=' + sid]);
  return 0;
}

function cmdMswEvent(flags, rest) {
  const action = rest[0];
  switch (action) {
    case 'emit': return cmdMswEventEmit(flags);
    default:
      process.stderr.write('mccp-state msw-event: pick one of emit\n');
      return 1;
  }
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
    case 'msw-event':
      return cmdMswEvent(flags, flags._);
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
