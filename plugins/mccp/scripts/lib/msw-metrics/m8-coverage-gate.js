'use strict';

// multi-session-work-loop M8 — A1/A2/B3 승격을 종속시키는 **반증 가능한** coverage gate.
//
// 설계 근거: .claude/plans/multi-session-work-loop-m8.plan.md Task 9 (b2/c1 gate 거울)
//
// 왜 필요한가: M8은 세 지표를 claimed-computable로 승격한다. 승격의 근거는
// "producer가 배선됐다"인데, 그 명제를 producer 자신의 관측(`*_producer_present`)
// 으로만 확인하면 증명되는 것은 "**어떤** emit이 1회 이상 있었다"뿐이다. emit
// 지점 하나가 조용히 사라지거나, 승인되지 않은 새 지점이 생겨 다른 어휘로 쓰기
// 시작하면 그 사실은 어디에도 나타나지 않는다 — 지표는 계속 숫자를 낸다.
//
// 이 gate가 세우는 것은 두 축이다:
//   1. **레지스트리 실재**: 승인된 emit 지점이 전부 아직 그 자리에 있는가.
//      목록에 있는데 부재 = 실패(= producer가 조용히 제거됐다).
//   2. **정적 lint**: 목록 **밖**의 파일이 `msw-events.appendEvent`를 부르거나
//      `state/cli.js msw-event emit` 셸 경로를 쓰는가. 있으면 실패.
//
// **위협 모델(정직히 명시)**: b2-coverage-gate와 같다. 겨냥하는 것은 *우발적
// 미승인 emit 유입*이지 repo write 권한을 가진 적대적 위조자가 아니다. 후자는 이
// 파일 자체를 고칠 수 있으므로 in-repo gate로 원리상 방어 불가이며, 단일 운영자
// 신뢰경계라는 PRD 전제상 범위 밖이다. gate가 막지 못하는 것을 막는다고 주장하지
// 않는다. 또한 정적 축은 동적 경로·생성 코드·repo 밖 writer를 원리상 못 본다.
//
// **plan과 다른 점을 명시한다** (Phase 5 REPORT의 Deviations에도 기록): plan Task 9는
// 승인 emit 지점을 "정확히 5개"로 적었으나 실측 호출자는 **7개**다. plan이 열거한
// 다섯(receipt-prompt · pr.md Phase 5 · finalize-receipt · session-start · session-end)
// 은 M8이 더하거나 손댄 지점들이고, 거기에 **선재하는 정당한 두 지점**이 빠져
// 있었다 — `receipt/evidence-lock.js`(M3 증거 충돌 taxonomy)와
// `state/handoff-items.js`(M2 handoff 관측). 그 둘을 목록에서 빼면 gate는 착지
// 즉시 붉어지고, 그것은 계측이 아니라 오탐이다. 목록은 실측 집합으로 둔다.
// plan-conflict-detector 판정은 `conflict:false`(minor deviation)였다.

const fs = require('fs');
const path = require('path');

// 승인된 emit 지점. `file`은 repo-relative, `kinds`는 그 지점이 낼 수 있는 kind,
// `why`는 왜 이 지점이 정당한지. 목록 밖 = lint 실패, 목록에 있는데 부재 = 레지스트리 실패.
const APPROVED_EMIT_SITES = Object.freeze([
  Object.freeze({
    file: 'plugins/mccp/scripts/hooks/receipt-prompt.js',
    kinds: Object.freeze(['task_started']),
    why: 'A1 분모 (DD4) — /mccp:* 최초 발화 시점에 확실히 도는 유일한 hook',
  }),
  Object.freeze({
    file: 'plugins/mccp/scripts/state/cli.js',
    kinds: Object.freeze(['task_completed', 'remediation_pr']),
    why: 'A1 분자 + C2/C3 귀속 (DD4 · DD8) — PR 번호가 존재하는 유일한 시점이라 명령 본문이 이 CLI를 부른다',
  }),
  Object.freeze({
    file: 'plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js',
    kinds: Object.freeze(['task_ship_sealed']),
    why: 'DD5 병기 축 — 산문 의존(DD4)이 남긴 간극을 코드로 관측한다. 분자가 아니다',
  }),
  Object.freeze({
    file: 'plugins/mccp/scripts/hooks/session-start.js',
    kinds: Object.freeze(['session_start']),
    why: 'M2 세션 수명 + env-snapshot (B3 분자 corpus의 producer)',
  }),
  Object.freeze({
    file: 'plugins/mccp/scripts/hooks/session-end.js',
    kinds: Object.freeze(['session_end']),
    why: 'M2 세션 수명 + A2 context% stamp (DD6 — 귀속·신선도 통과분만)',
  }),
  Object.freeze({
    file: 'plugins/mccp/scripts/receipt/evidence-lock.js',
    kinds: Object.freeze(['evidence_guard_active', 'evidence_overwrite_observed', 'evidence_conflict_prevented']),
    why: 'M3 증거 충돌 taxonomy (B2 producer). M8 이전부터 존재하는 정당한 지점',
  }),
  Object.freeze({
    file: 'plugins/mccp/scripts/state/handoff-items.js',
    kinds: Object.freeze(['handoff_item']),
    why: 'M2 handoff 관측 (A4 substrate). M8 이전부터 존재하는 정당한 지점',
  }),
]);

// 셸 경로(`state/cli.js msw-event emit`)를 부를 수 있는 명령 본문. 명령 본문은
// 실행되는 코드이므로 여기도 레지스트리가 필요하다.
const APPROVED_SHELL_CALLERS = Object.freeze([
  'plugins/mccp/commands/pr.md',
]);

// 감사자 자신 + 사거리 밖. 이 파일은 검출 토큰을 **데이터로** 담고 있어
// (문자열 리터럴이 `appendEvent(`를 문자 그대로 포함한다) 자기 자신을 잡는다.
const SELF_EXEMPT = 'plugins/mccp/scripts/lib/msw-metrics/m8-coverage-gate.js';

// writer 모듈 자신 — `appendEvent`를 **정의**하는 곳이지 호출하는 곳이 아니다.
const WRITER_MODULE = 'plugins/mccp/scripts/state/msw-events.js';

const EMIT_CALL_TOKEN = 'appendEvent' + '(';
const SHELL_CALL_TOKEN = 'msw-event' + ' emit';

function walk(absDir, repoRoot, accept, out) {
  let entries = [];
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch (_) { return out; }
  entries.forEach(function (e) {
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'tests') return;
      walk(abs, repoRoot, accept, out);
      return;
    }
    if (!e.isFile()) return;
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    if (rel.endsWith('.test.js')) return;
    if (accept(rel)) out.push(rel);
  });
  return out;
}

function surfaceFiles(repoRoot) {
  const js = walk(path.join(repoRoot, 'plugins', 'mccp', 'scripts'), repoRoot,
    function (rel) { return rel.endsWith('.js'); }, []);
  const md = walk(path.join(repoRoot, 'plugins', 'mccp', 'commands'), repoRoot,
    function (rel) { return rel.endsWith('.md'); }, []);
  return js.concat(md).sort();
}

// 축 1 — 레지스트리 실재. 승인 목록에 있는 지점이 실제로 그 파일에서 emit을
// 부르고 있는가. 부재는 "producer가 조용히 제거됐다"이며, 그 상태에서 지표가
// 계속 숫자를 내는 것이 이 gate가 막으려는 바로 그 실패다.
function entrypointRegistry(repoRoot) {
  const missing = [];
  APPROVED_EMIT_SITES.forEach(function (site) {
    let text = '';
    try { text = fs.readFileSync(path.join(repoRoot, site.file), 'utf8'); }
    catch (_) { missing.push(site.file + ' (unreadable)'); return; }
    if (text.indexOf(EMIT_CALL_TOKEN) === -1) {
      missing.push(site.file + ' (no ' + EMIT_CALL_TOKEN + ' call found)');
    }
  });
  return { ok: missing.length === 0, missing: missing };
}

// 축 2 — 정적 lint. 승인 목록 밖의 파일이 emit 경로를 쓰는가.
function staticLint(repoRoot) {
  const approvedJs = new Set(APPROVED_EMIT_SITES.map(function (s) { return s.file; }));
  const approvedShell = new Set(APPROVED_SHELL_CALLERS);
  const violations = [];

  surfaceFiles(repoRoot).forEach(function (rel) {
    if (rel === SELF_EXEMPT || rel === WRITER_MODULE) return;
    let text = '';
    try { text = fs.readFileSync(path.join(repoRoot, rel), 'utf8'); } catch (_) { return; }

    if (rel.endsWith('.js') && text.indexOf(EMIT_CALL_TOKEN) !== -1 && !approvedJs.has(rel)) {
      violations.push({ file: rel, kind: 'unapproved-appendEvent-caller' });
    }
    if (text.indexOf(SHELL_CALL_TOKEN) !== -1 && !approvedShell.has(rel) && !approvedJs.has(rel)) {
      violations.push({ file: rel, kind: 'unapproved-shell-emit-caller' });
    }
  });

  return { ok: violations.length === 0, violations: violations };
}

// `--acceptance` (opt-in) — 라이브 corpus가 M8이 주장하는 상태에 실제로 도달했는가.
//
// **기본 실행에 넣지 않는다.** A1의 완주 신호는 이 milestone 자신의 `/mccp:pr`에서
// 처음 발화하므로(plan Risks에 기록된 순환), 커밋 전 실행에서 이것을 요구하면
// 검증이 구조적으로 실패한다. 그래서 판정은 opt-in이고, PRE 단계에서 확인 가능한
// 것과 POST에서만 가능한 것을 **나눠서** 보고한다.
function evaluateAcceptance(repoRoot) {
  const PRE = ['session_start', 'session_end', 'task_started'];
  const POST = ['task_completed', 'task_ship_sealed'];

  // orchestrator-step-wiring M1 (Task 5b) — **경로를 조립하지 않고 해소기에 묻는다.**
  //
  // 이전 판본은 `<repoRoot>/.claude/state/msw-events`를 직접 만들었다. DD8이
  // `task_started`를 git common dir로 옮기면 그 kind가 이 디렉토리에서 사라지고,
  // `PRE`가 전건 관측을 요구하므로 **신규 worktree에서 `ok:false`가 영구화**된다 —
  // producer가 조용히 제거됐는지 보려는 게이트가, 살아서 다른 곳에 쓰고 있는
  // producer를 두고 정확히 그렇게 보고하게 된다.
  //
  // 두 위치를 **둘 다, 토글과 무관하게** 본다. local은 공유로 옮기기 전에 쌓인
  // 이벤트가 여전히 거기 있어서이고, shared는 아래 이유로 그렇다.
  //
  // 해소는 `resolveEventsDir`가 아니라 reader(`derive/sources/session-activity.js`)와
  // **같은 방식**으로 한다 — `commonDirOf`를 직접 부르고 토글은 읽지 않는다.
  // `resolveEventsDir`는 `MCCP_MSW_EVENTS_SHARED`를 통과하므로 토글이 off면 공유
  // 위치가 후보에서 빠지고, 그러면 이 게이트는 살아서 그곳에 쓰고 있는 producer를
  // 두고 위 문단이 막겠다고 한 "제거됨" 보고를 그대로 낸다(local review H1 —
  // 토글 off에서 `post_missing`에 두 kind가 실리는 것으로 실증). 읽는 쪽이 토글을
  // 보지 않는 것은 무해하다: 공유 위치가 없으면 후보에서 빠질 뿐이고, 있으면 그
  // 이벤트는 실재한다. 쓰는 쪽만 토글을 읽으면 충분하다.
  const localDir = path.join(repoRoot, '.claude', 'state', 'msw-events');
  const scanDirs = [localDir];
  try {
    const mswEvents = require('../../state/msw-events');
    const common = mswEvents.commonDirOf(repoRoot);
    if (common) {
      const shared = path.join(common, mswEvents.SHARED_SUBPATH);
      if (scanDirs.indexOf(shared) === -1) scanDirs.push(shared);
    }
  } catch (_) {
    // 해소기를 못 읽으면 local만 본다 — 오늘의 동작이고 fail 방향이 보수적이다.
  }

  const kinds = new Set();
  scanDirs.forEach(function (eventsDir) {
    let files = [];
    try { files = fs.readdirSync(eventsDir); } catch (_) { files = []; }
    files.forEach(function (f) {
      if (!f.endsWith('.jsonl')) return;
      let text = '';
      try { text = fs.readFileSync(path.join(eventsDir, f), 'utf8'); } catch (_) { return; }
      text.split(/\r?\n/).forEach(function (line) {
        if (!line.trim()) return;
        try { const o = JSON.parse(line); if (o && o.kind) kinds.add(o.kind); } catch (_) { /* per-line 격리 */ }
      });
    });
  });

  const preMissing = PRE.filter(function (k) { return !kinds.has(k); });
  const postMissing = POST.filter(function (k) { return !kinds.has(k); });

  let snapshots = 0;
  try {
    snapshots = fs.readdirSync(path.join(repoRoot, '.claude', 'state'))
      .filter(function (f) { return f.endsWith('.env-snapshot.json'); }).length;
  } catch (_) { snapshots = 0; }

  return {
    // PRE만 판정한다. POST는 보고하되 실패로 세지 않는다 — plan Risks가 기록한
    // 순환(완주 신호는 이 milestone의 PR이 처음 발화)을 gate가 부정하면 안 된다.
    ok: preMissing.length === 0 && snapshots > 0,
    observed_kinds: Array.from(kinds).sort(),
    pre_missing: preMissing,
    post_missing: postMissing,
    post_note: postMissing.length
      ? 'POST kinds appear only after this milestone\'s own /mccp:pr runs (documented circularity)'
      : null,
    env_snapshot_count: snapshots,
  };
}

function evaluateGate(opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || process.cwd();
  const registry = entrypointRegistry(repoRoot);
  const lint = staticLint(repoRoot);
  const out = {
    ok: registry.ok && lint.ok,
    approved_site_count: APPROVED_EMIT_SITES.length,
    registry: registry,
    static_lint: lint,
  };
  if (opts.acceptance) {
    out.acceptance = evaluateAcceptance(repoRoot);
    out.ok = out.ok && out.acceptance.ok;
  }
  return out;
}

function runCli(argv) {
  const result = evaluateGate({
    repoRoot: process.cwd(),
    acceptance: argv.indexOf('--acceptance') !== -1,
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  evaluateGate: evaluateGate,
  entrypointRegistry: entrypointRegistry,
  staticLint: staticLint,
  evaluateAcceptance: evaluateAcceptance,
  runCli: runCli,
  APPROVED_EMIT_SITES: APPROVED_EMIT_SITES,
  APPROVED_SHELL_CALLERS: APPROVED_SHELL_CALLERS,
  SELF_EXEMPT: SELF_EXEMPT,
  WRITER_MODULE: WRITER_MODULE,
};
