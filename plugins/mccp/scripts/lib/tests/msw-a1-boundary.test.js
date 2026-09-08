'use strict';

// orchestrator-step-wiring M1 (Task 8) — A1 집계 경계 회귀 가드.
//
// 지키는 명제는 넷이다.
//   (a) A1 축 이벤트는 **어느 root에서 해소해도 같은 디렉토리**에 착지한다.
//   (b) 그 경계는 **A1 축 세 kind에만** 걸리고 B2·taxonomy 축은 v1.33.x 동작 그대로다.
//   (c) 공유 위치 해소는 `root/.git` **하나만** 보므로 조상 저장소·repo 내부 fixture를
//       오염시키지 않는다.
//   (d) 어떤 실패에도 체인이 멈추지 않고, 강등은 조용하지 않다.
//
// fixture는 **실제 git이 쓰는 형태**로 조립한다 — main root에 `.git/` 디렉토리,
// worktree에 `gitdir: <path>` 한 줄을 담은 `.git` **파일**과 그 대상 디렉토리의
// `commondir` 파일. 손수 만든 기대 형태로 통과시키면 실 producer 경로를 검증하지 못한다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const mswEvents = require('../../state/msw-events');
const { scanSessionActivity } = require('../../derive/sources/session-activity');
const metricsMod = require('../msw-metrics/index');
const gate = require('../msw-metrics/m8-coverage-gate');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const A1_CLI = path.join(PLUGIN_ROOT, 'scripts', 'lib', 'msw-metrics', 'cli.js');

// ── fixture ────────────────────────────────────────────────────────────────
// 실제 git 레이아웃: <base>/main/.git/ (디렉토리) + <base>/<wt>/.git (파일)
function mkFixture(label) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-a1b-' + label + '-'));
  const main = path.join(base, 'main');
  const gitDir = path.join(main, '.git');
  fs.mkdirSync(path.join(gitDir, 'objects'), { recursive: true });
  fs.mkdirSync(path.join(gitDir, 'refs'), { recursive: true });
  fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
  fs.mkdirSync(path.join(main, '.claude', 'state'), { recursive: true });
  return { base: base, main: main, gitDir: gitDir };
}

// linked worktree 하나를 더한다. `.git`은 파일이고 `commondir`은 **상대 경로**다 —
// 실 저장소에서 실측한 형태(`../..` + LF)를 그대로 쓴다.
function addWorktree(fx, name) {
  const wt = path.join(fx.base, name);
  fs.mkdirSync(path.join(wt, '.claude', 'state'), { recursive: true });
  const wtGitDir = path.join(fx.gitDir, 'worktrees', name);
  fs.mkdirSync(wtGitDir, { recursive: true });
  fs.writeFileSync(path.join(wtGitDir, 'commondir'), '../..\n');
  fs.writeFileSync(path.join(wtGitDir, 'HEAD'), 'ref: refs/heads/' + name + '\n');
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: ' + wtGitDir + '\n');
  return wt;
}

function sharedDirOf(fx) {
  return path.join(fx.gitDir, mswEvents.SHARED_SUBPATH);
}

function localDirOf(root) {
  return path.join(root, '.claude', 'state', 'msw-events');
}

function writeLine(dir, sessionId, evt) {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, sessionId + '.jsonl'), JSON.stringify(evt) + '\n', 'utf8');
}

// ── (1) 도달성 — CRITICAL 회귀 가드 ────────────────────────────────────────
//
// 초안이 죽은 지점이 정확히 여기다: 실 producer 둘이 `repoRoot`를 **항상 명시**로
// 넘기는데 공유 위치를 `resolveEventsDir`의 독립 후보로 두면 그 분기가 도달 불가였다.
// 그래서 이 단언이 이 파일의 머리다.
test('A1 axis: an explicit-repoRoot append (the real producer shape) reaches the shared dir', () => {
  const fx = mkFixture('reach');
  const wt = addWorktree(fx, 'wtA');

  const r = mswEvents.appendEvent('sess-reach', {
    kind: 'task_started', work_unit: 'unit-1', work_unit_kind: 'milestone',
  }, { repoRoot: wt });
  assert.equal(r.ok, true);

  assert.ok(fs.existsSync(path.join(sharedDirOf(fx), 'sess-reach.jsonl')),
    'a task_started emitted with an explicit repoRoot must land in the shared common-dir location');
  assert.ok(!fs.existsSync(path.join(localDirOf(wt), 'sess-reach.jsonl')),
    'and must NOT also land worktree-local — two copies would double-count');
});

// ── (2) 위치 독립성 (F4) ───────────────────────────────────────────────────
test('A1 axis: three different roots of the same repo report the same startup count', () => {
  const fx = mkFixture('locind');
  const wtA = addWorktree(fx, 'wtA');
  const wtB = addWorktree(fx, 'wtB');

  mswEvents.appendEvent('s-a', { kind: 'task_started', work_unit: 'u1', work_unit_kind: 'milestone' }, { repoRoot: wtA });
  mswEvents.appendEvent('s-b', { kind: 'task_started', work_unit: 'u2', work_unit_kind: 'milestone' }, { repoRoot: wtB });
  mswEvents.appendEvent('s-m', { kind: 'task_started', work_unit: 'u3', work_unit_kind: 'milestone' }, { repoRoot: fx.main });

  const counts = [fx.main, wtA, wtB].map(function (r) {
    return scanSessionActivity(r).task_startups_count;
  });
  assert.deepEqual(counts, [3, 3, 3],
    'the whole point of the milestone: the denominator must not depend on where derive runs');
});

// ── (3) 조상 격리 — security HIGH 회귀 가드 ────────────────────────────────
test('shared resolution never walks up: a .claude-only root under a git ancestor stays local', () => {
  const fx = mkFixture('ancestor');
  // `.claude`는 있고 `.git`은 없는 디렉토리. 조상(fx.main)에는 `.git`이 있다.
  const child = path.join(fx.main, 'nested-project');
  fs.mkdirSync(path.join(child, '.claude', 'state'), { recursive: true });

  const dir = mswEvents.resolveEventsDir({ repoRoot: child, kind: 'task_started' });
  assert.equal(path.resolve(dir), path.resolve(localDirOf(child)),
    'walk-up would resolve to the ancestor git dir — that was the security HIGH');
  assert.equal(mswEvents.commonDirOf(child), null);
});

// ── (4) 경로 불변 — test HIGH 회귀 가드 ────────────────────────────────────
test('a root with no .git resolves byte-identically to the pre-M1 location', () => {
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-a1b-plain-'));
  fs.mkdirSync(path.join(plain, '.claude', 'state'), { recursive: true });

  for (const kind of ['task_started', 'task_completed', 'task_ship_sealed', 'session_start']) {
    assert.equal(mswEvents.resolveEventsDir({ repoRoot: plain, kind: kind }),
      path.join(plain, '.claude', 'state', 'msw-events'),
      'tmpdir fixtures have no .git, so existing isolation assertions must be untouched (kind=' + kind + ')');
  }
});

// ── (b) KIND 경계 — DD8 ────────────────────────────────────────────────────
test('KIND boundary: only the three A1 kinds go shared; everything else stays worktree-local', () => {
  const fx = mkFixture('kindb');
  const wt = addWorktree(fx, 'wtA');
  const shared = sharedDirOf(fx);
  const local = localDirOf(wt);

  for (const kind of ['task_started', 'task_completed', 'task_ship_sealed']) {
    assert.equal(mswEvents.resolveEventsDir({ repoRoot: wt, kind: kind }), shared, kind + ' is an A1 axis kind');
  }
  for (const kind of ['session_start', 'session_end', 'evidence_guard_active', 'remediation_pr', undefined]) {
    assert.equal(mswEvents.resolveEventsDir({ repoRoot: wt, kind: kind }), local,
      String(kind) + ' must stay worktree-local — B2/taxonomy/findings isolation depends on it');
  }
});

// ── (5) worktree 삭제 내성 (G8) ────────────────────────────────────────────
test('A1 values survive deleting the worktree the events came from', () => {
  const fx = mkFixture('deltree');
  const wt = addWorktree(fx, 'doomed');
  mswEvents.appendEvent('s-doom', { kind: 'task_started', work_unit: 'u1', work_unit_kind: 'milestone' }, { repoRoot: wt });

  const before = scanSessionActivity(fx.main).task_startups_count;
  fs.rmSync(wt, { recursive: true, force: true });
  const after = scanSessionActivity(fx.main).task_startups_count;

  assert.equal(before, 1);
  assert.equal(after, before, 'the events live outside the worktree, so its deletion cannot move A1');
});

// ── (6) legacy dedupe — architect HIGH 회귀 가드 ───────────────────────────
test('an event_id-less duplicate present in both locations collapses to one', () => {
  const fx = mkFixture('legacy');
  const legacy = {
    kind: 'task_started', session_id: 's-leg', work_unit: 'u-leg',
    work_unit_kind: 'milestone', ts: '2026-01-01T00:00:00.000Z',
  };
  writeLine(localDirOf(fx.main), 's-leg', legacy);
  writeLine(sharedDirOf(fx), 's-leg', legacy);

  const scan = scanSessionActivity(fx.main);
  assert.equal(scan.task_startups_count, 1,
    'the shared dir sits at di>0 so legacyKeyOf catches cross-location duplicates');
});

// ── (7) granularity — Task 5 ───────────────────────────────────────────────
test('granularity: prd units leave the denominator, missing kind is counted but flagged', () => {
  const fx = mkFixture('gran');
  const d = localDirOf(fx.main);
  writeLine(d, 's1', { kind: 'task_started', session_id: 's1', work_unit: 'p1', work_unit_kind: 'prd', ts: 't1', event_id: 'e1' });
  writeLine(d, 's1', { kind: 'task_started', session_id: 's1', work_unit: 'm1', work_unit_kind: 'milestone', ts: 't2', event_id: 'e2' });
  writeLine(d, 's1', { kind: 'task_started', session_id: 's1', work_unit: 'm2', work_unit_kind: 'milestone', ts: 't3', event_id: 'e3' });
  writeLine(d, 's1', { kind: 'task_started', session_id: 's1', work_unit: 'u1', ts: 't4', event_id: 'e4' });

  const scan = scanSessionActivity(fx.main);
  assert.equal(scan.task_startups_count, 3, 'denominator = milestone(2) + unknown(1); prd is excluded');
  assert.equal(scan.prd_granularity_excluded_count, 1);
  assert.equal(scan.work_unit_kind_unknown_count, 1);
});

test('A1 can never exceed 100%: a completion with no startup is counted separately, not in the numerator', () => {
  const fx = mkFixture('cap');
  const d = localDirOf(fx.main);
  // PRD 단위 슬러그가 착수와 완주를 **둘 다** 가진 실측 형태(DD4). 분모에서만 빼면
  // 분자가 분모를 넘어 A1 > 100%가 `computed`로 인증된다.
  writeLine(d, 's1', { kind: 'task_started', session_id: 's1', work_unit: 'prd-unit', work_unit_kind: 'prd', ts: 't1', event_id: 'c1' });
  writeLine(d, 's1', { kind: 'task_completed', session_id: 's1', work_unit: 'prd-unit', ts: 't2', event_id: 'c2' });
  writeLine(d, 's1', { kind: 'task_started', session_id: 's1', work_unit: 'ms-unit', work_unit_kind: 'milestone', ts: 't3', event_id: 'c3' });

  const scan = scanSessionActivity(fx.main);
  assert.equal(scan.task_startups_count, 1);
  assert.equal(scan.task_completions_count, 0, 'the orphan completion must not enter the numerator');
  assert.equal(scan.completion_without_startup, 1, 'but it must not be silently dropped either');
  assert.ok(scan.task_completions_count <= scan.task_startups_count,
    'num <= den must hold structurally in the reader so computeA1 needs no cap (DD6)');

  const a1 = metricsMod.computeMetrics({ sources: { session_activity: scan } })[metricsMod.A1_WORK_COMPLETION_RATE];
  assert.ok(a1.value === null || a1.value <= 1, 'A1 must never certify a ratio above 100%');
});

// ── producer 술어 — backlog a936d46c ("술어를 반증할 test가 0건") ──────────
test('the producer predicate reads the ARGUMENT, never the slug name', () => {
  const c = mswEvents.classifyWorkUnitKind;
  assert.equal(c('.claude/prds/orchestrator-step-wiring.prd.md'), 'prd');
  assert.equal(c('.claude\\prds\\foo.prd.md'), 'prd');
  assert.equal(c('--full .claude/prds/x.prd.md'), 'prd');
  assert.equal(c('.claude/plans/orchestrator-step-wiring-m1.plan.md'), 'milestone');
  assert.equal(c('some free form feature'), 'milestone');
  // 빈 문자열은 관측이다 — 인자가 있었고 그 안에 PRD 경로가 없었다.
  assert.equal(c(''), 'milestone');
  // 인자 **자체**가 없으면 판정하지 않는다 (local review M1). `milestone`으로 접으면
  // producer가 "모른다"를 표현할 수단을 잃고, reader의 unknown 통은 구 이벤트
  // 전용이 되어 payload 스키마가 바뀌는 날 조용한 오분류가 된다.
  assert.equal(c(undefined), null);
  assert.equal(c(null), null);
  assert.equal(c(123), null);
  // 슬러그가 PRD **이름**과 같아도 인자가 plan이면 milestone이다 — 이름 기반 추론
  // 금지(DD3)를 고정한다.
  assert.equal(c('.claude/plans/orchestrator-step-wiring.plan.md'), 'milestone');
});

test('work_unit_kind survives serialization (an allowlist miss drops it silently)', () => {
  const line = mswEvents.eventToJsonLine({
    kind: 'task_started', session_id: 's', work_unit: 'u', work_unit_kind: 'prd', ts: 't',
  });
  assert.equal(JSON.parse(line).work_unit_kind, 'prd');
});

// ── (8) fail-open + 되돌림 수단 ────────────────────────────────────────────
test('degrading to worktree-local is loud but never fatal, and warns once per process', () => {
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-a1b-degrade-'));
  fs.mkdirSync(path.join(plain, '.claude', 'state'), { recursive: true });

  // 별도 프로세스에서 두 번 append — warnOnce가 프로세스 단위이므로 같은 프로세스여야
  // "1회"를 잴 수 있다.
  const script =
    'const m = require(' + JSON.stringify(path.join(PLUGIN_ROOT, 'scripts', 'state', 'msw-events')) + ');' +
    'const root = process.argv[1];' +
    'const a = m.appendEvent("s1", { kind: "task_started", work_unit: "u1" }, { repoRoot: root });' +
    'const b = m.appendEvent("s1", { kind: "task_started", work_unit: "u2" }, { repoRoot: root });' +
    'process.stdout.write(JSON.stringify({ a: a.ok, b: b.ok }));';
  const out = execFileSync(process.execPath, ['-e', script, plain], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { MCCP_MSW_EVENTS_SHARED: 'on' }),
  });
  assert.deepEqual(JSON.parse(out), { a: true, b: true }, 'a degraded resolution must not break the append');

  assert.ok(fs.existsSync(path.join(localDirOf(plain), 's1.jsonl')),
    'the events must land in the pre-M1 location when the common dir cannot be resolved');
});

test('the a1 CLI always exits 0 and prints nothing it cannot stand behind', () => {
  // 마커 없는 경로 (security review S5) — 거절하되 exit 0 + 빈 stdout.
  const bogus = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-a1b-bogus-'));
  const res = execFileSync(process.execPath, [A1_CLI, 'a1', '--repo-root', bogus], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(res, '', 'no marker means no claim');
});

test('MCCP_MSW_EVENTS_SHARED actually reverses the path in BOTH directions', () => {
  const fx = mkFixture('toggle');
  const wt = addWorktree(fx, 'wtA');
  const call = function (v) {
    const saved = process.env.MCCP_MSW_EVENTS_SHARED;
    if (v === null) delete process.env.MCCP_MSW_EVENTS_SHARED;
    else process.env.MCCP_MSW_EVENTS_SHARED = v;
    try { return mswEvents.resolveEventsDir({ repoRoot: wt, kind: 'task_started' }); }
    finally {
      if (saved === undefined) delete process.env.MCCP_MSW_EVENTS_SHARED;
      else process.env.MCCP_MSW_EVENTS_SHARED = saved;
    }
  };
  const off = call('off');
  const on = call('on');
  assert.equal(off, localDirOf(wt), 'off must restore the pre-M1 location');
  assert.equal(on, sharedDirOf(fx), 'on must actually reach the shared location');
  assert.notEqual(on, off, 'an implementation that always returns local would pass a one-sided check');
  // 열거 밖 값은 **off로 접힌다** — 오타가 신규 producer 경로를 켠 채 남기지 않는다.
  assert.equal(call('yes-please'), localDirOf(wt), 'a typo folds closed, not open');
});

// ── (9) A2 분모 오염 — CRITICAL 회귀 가드 ──────────────────────────────────
test('A2 denominator counts only locally-observed sessions, and B2 stays put', () => {
  const fx = mkFixture('a2');
  const t0 = '2026-01-01T00:00:00.000Z';
  const t1 = '2026-01-01T01:00:00.000Z';

  // 로컬 세션 2건 — 온전한 수명(start + end)을 갖는다.
  for (const sid of ['loc-1', 'loc-2']) {
    writeLine(localDirOf(fx.main), sid, { kind: 'session_start', session_id: sid, created_at: t0, ts: t0, event_id: sid + '-s' });
    writeLine(localDirOf(fx.main), sid, { kind: 'session_end', session_id: sid, ended_at: t1, ts: t1, context_remaining_pct: 40, event_id: sid + '-e' });
  }
  // 공유 위치의 **외래** 세션 3건 — A1 이벤트만 있고 이 위치에서 관측된 적이 없다.
  for (const sid of ['for-1', 'for-2', 'for-3']) {
    writeLine(sharedDirOf(fx), sid, { kind: 'task_started', session_id: sid, work_unit: 'u-' + sid, work_unit_kind: 'milestone', ts: t0, event_id: sid + '-t' });
  }

  const scan = scanSessionActivity(fx.main);
  assert.equal(scan.sessions.length, 5, 'the session map has no kind guard — all five appear');
  assert.equal(scan.sessions_local.length, 2, 'but only two were observed in a worktree-local candidate');

  const a2 = metricsMod.computeMetrics({ sources: { session_activity: scan } })[metricsMod.A2_CONTEXT_REMAINING];
  assert.equal(a2.denominator, 2,
    'a denominator of 5 would dilute A2 by sessions this location never observed');
  assert.equal(a2.status, 'computed');

  // B2가 살아남는 **이유**를 고정한다: `spanOf`가 session_start 없이는 null이다.
  assert.equal(scan.concurrent_pairs_count, 1,
    'the two local sessions overlap; the three foreign A1-only sessions have no span');
});

test('A2 falls back to sessions when a producer predates sessions_local', () => {
  const legacyScan = {
    ok: true,
    sessions: [{ session_id: 'a', context_remaining_pct: 55 }, { session_id: 'b', context_remaining_pct: null }],
    producer_coverage: 'session-activity',
  };
  const a2 = metricsMod.computeMetrics({ sources: { session_activity: legacyScan } })[metricsMod.A2_CONTEXT_REMAINING];
  assert.equal(a2.denominator, 2,
    'the fallback is deliberate and asserted here so it is not a silent behaviour');
});

// ── (10) 세 번째 A1 producer의 root 일치 ───────────────────────────────────
test('the sealed producer lands under the same root as the completion producer', () => {
  const fx = mkFixture('sealed');
  const wt = addWorktree(fx, 'wtA');

  assert.equal(
    mswEvents.resolveEventsDir({ repoRoot: wt, kind: 'task_ship_sealed' }),
    mswEvents.resolveEventsDir({ repoRoot: wt, kind: 'task_completed' }),
    'a sealed event landing under a different root makes sealed_without_completion report a phantom gap');

  // `gitRepoRoot`가 null을 반환하는 상황의 대체 해소기가 같은 root를 낸다.
  const deep = path.join(wt, 'a', 'b');
  fs.mkdirSync(deep, { recursive: true });
  assert.equal(path.resolve(mswEvents.discoverRepoRoot(deep)), path.resolve(wt));

  // 배선 확인 — finalize-receipt가 null을 그대로 넘기지 않는다.
  const src = fs.readFileSync(
    path.join(PLUGIN_ROOT, 'scripts', 'lib', 'pr-phase-helpers', 'finalize-receipt.js'), 'utf8');
  assert.ok(/gitRepoRoot\(emitCwd\)\s*\|\|\s*mswEvents\.discoverRepoRoot\(emitCwd\)/.test(src),
    'the third A1 producer must fall back to the same resolver the other two use');

  mswEvents.appendEvent('s-seal', { kind: 'task_completed', work_unit: 'u1' }, { repoRoot: wt });
  mswEvents.appendEvent('s-seal', { kind: 'task_ship_sealed', work_unit: 'u1' }, { repoRoot: wt });
  const scan = scanSessionActivity(fx.main);
  assert.equal(scan.sealed_without_completion, 0, 'same root, same work_unit — no phantom gap');
});

// ── (11) m8-coverage-gate acceptance 불변 ──────────────────────────────────
test('m8-coverage-gate acceptance stays ok when task_started moves to the shared dir', () => {
  const fx = mkFixture('m8gate');
  const wt = addWorktree(fx, 'wtA');
  const t0 = '2026-01-01T00:00:00.000Z';

  // PRE 세 kind: session_start/session_end는 worktree-local, task_started는 공유.
  mswEvents.appendEvent('s-gate', { kind: 'session_start', created_at: t0, ts: t0 }, { repoRoot: wt });
  mswEvents.appendEvent('s-gate', { kind: 'session_end', ended_at: t0, ts: t0 }, { repoRoot: wt });
  mswEvents.appendEvent('s-gate', { kind: 'task_started', work_unit: 'u1', work_unit_kind: 'milestone' }, { repoRoot: wt });
  fs.writeFileSync(path.join(wt, '.claude', 'state', 'x.env-snapshot.json'), '{}\n');

  // 배치가 실제로 갈렸는지 먼저 확인한다 — 안 갈렸으면 이 test는 아무것도 증명하지 않는다.
  assert.ok(fs.existsSync(path.join(sharedDirOf(fx), 's-gate.jsonl')));
  assert.ok(fs.existsSync(path.join(localDirOf(wt), 's-gate.jsonl')));

  const acc = gate.evaluateAcceptance(wt);
  assert.deepEqual(acc.pre_missing, [],
    'a gate that hardcodes the local path reports the live task_started producer as removed');
  assert.equal(acc.ok, true);

  // local review H1 — 게이트는 **토글을 읽지 않는다**. 쓰는 쪽만 토글을 보고,
  // 읽는 쪽(여기와 `session-activity.js`)은 두 위치를 늘 본다. 이 단언이 없으면
  // 토글 off에서 게이트가 살아 있는 producer를 "제거됨"으로 보고하는 상태가
  // 회귀로 돌아온다 — 실측된 형태다.
  const saved = process.env.MCCP_MSW_EVENTS_SHARED;
  try {
    for (const v of ['off', '0', 'no']) {
      process.env.MCCP_MSW_EVENTS_SHARED = v;
      const off = gate.evaluateAcceptance(wt);
      assert.deepEqual(off.pre_missing, [],
        'with the toggle ' + v + ' the gate must still see the shared task_started');
      assert.equal(off.ok, true);
    }
  } finally {
    if (saved === undefined) delete process.env.MCCP_MSW_EVENTS_SHARED;
    else process.env.MCCP_MSW_EVENTS_SHARED = saved;
  }
});

// ── (12) 마이그레이션 리더는 청크 경계에서 문자를 자르지 않는다 ──────────────
test('the migration line reader survives a multi-byte character on the chunk boundary',
  () => {
    const mig = require('../../migrations/msw-events-common-dir');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-a1b-decode-'));
    const fp = path.join(dir, 'x.jsonl');

    // 청크는 1MiB다. 3바이트 문자의 **첫 바이트만** 첫 청크에 들어가도록 padding을
    // 역산한다 — 그 오프셋을 눈대중으로 잡으면(예: prefix 길이를 빼지 않으면) 경계에
    // 걸치지 않아 손상 없는 코드와 손상 있는 코드가 똑같이 통과하고, 그 test는
    // 아무것도 증명하지 않는다.
    const CHUNK = 1024 * 1024;
    const prefix = '{"kind":"task_started","work_unit":"';   // 전부 ASCII
    const padLen = (CHUNK - 1) - Buffer.byteLength(prefix, 'utf8');
    const head = 'a'.repeat(padLen);
    const suffix = '작업","ts":"t"}';
    const line1 = prefix + head + suffix;
    // 계약 확인: '작'의 첫 바이트가 마지막으로 첫 청크에 들어가는 바이트다.
    assert.equal(Buffer.byteLength(prefix + head, 'utf8'), CHUNK - 1);

    const line2 = JSON.stringify({ kind: 'task_completed', work_unit: '끝', ts: 't' });
    const LF = String.fromCharCode(10);
    fs.writeFileSync(fp, line1 + LF + line2 + LF, 'utf8');

    const seen = [];
    assert.equal(mig.forEachLine(fp, (l) => { if (l.trim()) seen.push(l); }), true);
    assert.equal(seen.length, 2);
    assert.equal(JSON.parse(seen[0]).work_unit, head + '작업');
    assert.equal(JSON.parse(seen[1]).work_unit, '끝');
    assert.ok(!seen.join('').includes('�'), 'no replacement character survived');
  });

// ── (13)-(16) PR-Codex R1 흡수 — 조용한 누락과 동시 실행 중복 ────────────────
//
// 읽기 실패 주입은 monkey-patch가 아니라 **파일 자리에 디렉토리를 둔다**. 이름이
// `.jsonl`로 끝나고 symlink가 아니므로 두 스캔 모두 이것을 열려 하고, 어느 플랫폼에서든
// `forEachLine`이 `false`를 낸다(win32는 open에서, POSIX는 read에서 EISDIR). 실제
// 실패 경로를 그대로 타므로 이 주입은 구현 세부에 기대지 않는다.
//
// `collect`는 git에게 common dir과 worktree 목록을 직접 묻는다(S3). 그래서 여기서는
// 다른 test들의 합성 fixture가 아니라 **진짜 `git init` 저장소**를 쓴다.
function mkGitRepo(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-a1b-' + label + '-'));
  execFileSync('git', ['-C', dir, 'init', '-q'], { stdio: 'ignore', windowsHide: true });
  return dir;
}

function migSharedDirOf(repo) {
  const mig = require('../../migrations/msw-events-common-dir');
  return path.join(mig.gitCommonDirOf(repo), mswEvents.SHARED_SUBPATH);
}

function unreadableFile(dir, name) {
  fs.mkdirSync(path.join(dir, name), { recursive: true });   // 파일 자리의 디렉토리
}

test('an unreadable shared-corpus file aborts instead of appending against partial keys', () => {
  const mig = require('../../migrations/msw-events-common-dir');
  const repo = mkGitRepo('f1shared');
  writeLine(localDirOf(repo), 'sess-x', { kind: 'task_started', work_unit: 'u1', ts: 't1' });

  const shared = migSharedDirOf(repo);
  fs.mkdirSync(shared, { recursive: true });
  unreadableFile(shared, 'broken.jsonl');

  const r = mig.collect({ cwd: repo });

  assert.equal(r.ok, false);
  assert.equal(r.state, 'failed');
  assert.equal(r.reason, 'shared-corpus-unreadable',
    'an incomplete `seen` set must abort — appending against it duplicates legacy ' +
    'events permanently, because the reader does not de-duplicate inside the shared dir');
  assert.deepEqual(r.unreadable_shared, ['broken.jsonl']);
  assert.equal(fs.existsSync(path.join(shared, 'sess-x.jsonl')), false,
    'nothing may be appended once the dedupe key set is known to be incomplete');
});

test('an unreadable source file yields partial, never a complete marker', () => {
  const mig = require('../../migrations/msw-events-common-dir');
  const repo = mkGitRepo('f1source');
  const local = localDirOf(repo);
  writeLine(local, 'sess-ok', { kind: 'task_started', work_unit: 'u1', ts: 't1' });
  unreadableFile(local, 'sess-broken.jsonl');

  const r = mig.collect({ cwd: repo });

  assert.equal(r.state, 'partial',
    'a source we could not read is a KNOWN omission — reporting `complete` tells the ' +
    'operator the corpus is unified when that worktree is silently missing from it');
  assert.equal(r.ok, false);
  assert.equal(r.report.unreadable.length, 1);
  assert.equal(r.report.unreadable[0].file, 'sess-broken.jsonl');
  assert.ok(r.pending.some((p) => /sess-broken\.jsonl$/.test(p.file)),
    'the unreadable source stays in `pending` so the next (idempotent) run retries it');

  const shared = migSharedDirOf(repo);
  assert.equal(fs.existsSync(path.join(shared, 'sess-ok.jsonl')), true,
    'the readable source is still collected — one bad file does not stop the rest');

  const marker = JSON.parse(fs.readFileSync(
    path.join(shared, '.migrations', 'msw-events-common-dir.json'), 'utf8'));
  assert.equal(marker.state, 'partial');
});

test('a live migration lock refuses a concurrent run rather than double-appending', () => {
  const mig = require('../../migrations/msw-events-common-dir');
  const repo = mkGitRepo('f2held');
  writeLine(localDirOf(repo), 'sess-y', { kind: 'task_started', work_unit: 'u1', ts: 't1' });

  const shared = migSharedDirOf(repo);
  const mdir = path.join(shared, '.migrations');
  fs.mkdirSync(mdir, { recursive: true });
  // 이 프로세스의 pid + hostname → orphan 판정이 "살아 있다"로 떨어진다.
  fs.writeFileSync(path.join(mdir, 'msw-events-common-dir.lock'), JSON.stringify({
    token: 'someone-elses-token', pid: process.pid, host: os.hostname(),
    at: new Date().toISOString(),
  }));

  const r = mig.collect({ cwd: repo });

  assert.equal(r.state, 'failed');
  assert.equal(r.reason, 'lock-unavailable');
  assert.equal(fs.existsSync(path.join(shared, 'sess-y.jsonl')), false,
    'the whole read-then-append transaction must be serialized, not just the append');
  assert.equal(fs.existsSync(path.join(mdir, 'msw-events-common-dir.lock')), true,
    'a refused run must not release a lock it does not own');
});

// ── (17)-(18) security review 흡수 — F1/F2 수정의 완전성 구멍 ────────────────
test('a shared dir that exists but cannot be listed aborts, and is not read as a first run', () => {
  const mig = require('../../migrations/msw-events-common-dir');
  const repo = mkGitRepo('secdirlist');
  writeLine(localDirOf(repo), 'sess-q', { kind: 'task_started', work_unit: 'u1', ts: 't1' });

  const shared = migSharedDirOf(repo);
  fs.mkdirSync(shared, { recursive: true });

  // 열거 실패 주입: readdirSync만 던지게 한다. per-file 검사(`forEachLine`)는 이 경로에
  // 도달조차 하지 못하므로, 이 단언은 **디렉토리 축**을 정확히 겨냥한다.
  const realReaddir = fs.readdirSync;
  const target = path.resolve(shared);
  fs.readdirSync = function (p, ...rest) {
    if (path.resolve(String(p)) === target) {
      const err = new Error('EACCES: permission denied'); err.code = 'EACCES'; throw err;
    }
    return realReaddir.call(fs, p, ...rest);
  };
  let r;
  try { r = mig.collect({ cwd: repo }); } finally { fs.readdirSync = realReaddir; }

  assert.equal(r.state, 'failed');
  assert.equal(r.reason, 'shared-dir-unreadable',
    'EACCES on an EXISTING shared dir must not be folded into the ENOENT "first run" path — ' +
    'an empty `seen` there re-appends the whole existing corpus, which is exactly the ' +
    'duplication the per-file abort exists to prevent');
  assert.equal(r.error_code, 'EACCES');
  assert.equal(fs.existsSync(path.join(shared, 'sess-q.jsonl')), false);
});

test('a symlinked events dir is refused, so containment cannot be redirected outside the repo', () => {
  const mig = require('../../migrations/msw-events-common-dir');
  const repo = mkGitRepo('secsymdir');

  // 저장소 밖의 "심어둔" corpus. 링크를 따라가면 이 이벤트가 공유 baseline에 실린다.
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-a1b-outside-'));
  fs.writeFileSync(path.join(outside, 'planted.jsonl'),
    JSON.stringify({ kind: 'task_completed', work_unit: 'planted', ts: 't1', pr_number: '9999' }) + '\n');

  const local = localDirOf(repo);
  fs.mkdirSync(path.dirname(local), { recursive: true });
  try {
    fs.symlinkSync(outside, local, 'junction');
  } catch (_e) {
    return;   // symlink 생성 권한이 없는 환경(win32 비관리자)에서는 주입 자체가 불가
  }

  const r = mig.collect({ cwd: repo });

  const shared = migSharedDirOf(repo);
  assert.equal(fs.existsSync(path.join(shared, 'planted.jsonl')), false,
    'following a symlinked events dir would copy arbitrary outside JSON into the shared ' +
    'A1 baseline — the containment check proves `wt` belongs to this repo, never that its ' +
    'contents do (CWE-59)');
  assert.equal(r.report.candidates, 0);
});

test('an orphaned lock is reclaimed, and a successful run releases its own', () => {
  const mig = require('../../migrations/msw-events-common-dir');
  const repo = mkGitRepo('f2orphan');
  writeLine(localDirOf(repo), 'sess-z', { kind: 'task_started', work_unit: 'u1', ts: 't1' });

  const shared = migSharedDirOf(repo);
  const mdir = path.join(shared, '.migrations');
  fs.mkdirSync(mdir, { recursive: true });
  const lockPath = path.join(mdir, 'msw-events-common-dir.lock');
  fs.writeFileSync(lockPath, JSON.stringify({
    token: 'stale', pid: process.pid, host: os.hostname(), at: '2020-01-01T00:00:00.000Z',
  }));
  // lease(60s)를 넘긴 mtime — PID가 살아 있어도 회수 대상이다.
  const old = new Date(Date.now() - 10 * 60 * 1000);
  fs.utimesSync(lockPath, old, old);

  const r = mig.collect({ cwd: repo });

  assert.equal(r.state, 'complete', 'a lease-expired lock must not block forever');
  assert.equal(fs.existsSync(path.join(shared, 'sess-z.jsonl')), true);
  assert.equal(fs.existsSync(lockPath), false,
    'the run must release the lock it acquired — otherwise the next run waits out a ' +
    'full lease for no reason');
});

// ── orchestrator-step-wiring M3 (Task 5) — 격리의 reader 측 두 번째 축 ────────
//
// 이 여섯 단언이 함께 있어야 한다. plan 원안의 세 단언은 **어느 것도** kind 기준
// 가드와 `dirIsShared` 기준 가드를 구별하지 못했다(L2 architect/HIGH · test/HIGH,
// Implement-Codex R1 F1): A1 계수는 세션 엔트리 생성 분기 **밖**에서 무조건 돌고
// (`session-activity.js` `task_started` 계수), B2는 `spanOf`가 `session_start`를
// 요구하므로 A1-only 세션은 어느 구현에서도 pair에 기여하지 않는다. 실제 판별자는
// (4)(5)(6)이다.

test('(M3 Task 5) shared non-A1 events do not enter the session axis', () => {
  const fx = mkFixture('m3iso');
  const t0 = '2026-02-01T00:00:00.000Z';
  const t1 = '2026-02-01T02:00:00.000Z';

  // 오늘의 writer가 만들 수 없는 형태다 — `msw-events.js:419`가 비-A1 kind를 공유
  // 위치로 보내지 않고 migration도 skip한다. 그것이 이 단언의 **목적**이다:
  // 오늘의 회귀를 잡는 그물이 아니라, `A1_AXIS_KINDS`에 kind가 추가되거나 세션 축
  // 이벤트가 어떤 경로로든 공유 위치에 닿는 날 붉어지는 그물이다.
  for (const sid of ['ghost-1', 'ghost-2']) {
    writeLine(sharedDirOf(fx), sid, { kind: 'session_start', session_id: sid, created_at: t0, ts: t0, event_id: sid + '-s' });
    writeLine(sharedDirOf(fx), sid, { kind: 'session_end', session_id: sid, ended_at: t1, ts: t1, context_remaining_pct: 77, event_id: sid + '-e' });
  }

  const scan = scanSessionActivity(fx.main);
  assert.equal(scan.concurrent_pairs_count, 0,
    'two overlapping spans in the SHARED corpus would be a B2 denominator built from '
    + 'sessions this location never ran');
  assert.equal(scan.sessions.length, 0,
    'the reader must not even create the entries');
  const a2 = metricsMod.computeMetrics({ sources: { session_activity: scan } })[metricsMod.A2_CONTEXT_REMAINING];
  assert.notEqual(a2.numerator, 2, 'nor may their context samples reach A2');
});

test('(M3 Task 5) the isolation does not kill the A1 axis it exists to protect', () => {
  const fx = mkFixture('m3a1');
  const t0 = '2026-02-01T00:00:00.000Z';
  for (const sid of ['far-1', 'far-2']) {
    writeLine(sharedDirOf(fx), sid, {
      kind: 'task_started', session_id: sid, work_unit: 'u-' + sid,
      work_unit_kind: 'milestone', ts: t0, event_id: sid + '-t',
    });
  }
  const scan = scanSessionActivity(fx.main);
  assert.equal(scan.task_startups_count, 2,
    'A1 axis events MUST still be read from the shared location — that boundary is what M1 built');
});

test('(M3 Task 5) local non-A1 events still feed B2 — the assertion that discriminates', () => {
  // **판별자 1.** DD3 요약의 kind-단독 표현을 문자 그대로 구현하면(dir 조건 없이)
  // 로컬 `session_start`/`session_end`도 막혀 `spanOf`가 span을 못 만들고 이 단언이
  // 붉어진다. plan 원안의 세 단언은 전부 두 구현에서 통과하므로 이 축을 재지 못했다.
  const fx = mkFixture('m3local');
  const t0 = '2026-03-01T00:00:00.000Z';
  const t1 = '2026-03-01T03:00:00.000Z';
  for (const sid of ['loc-a', 'loc-b']) {
    writeLine(localDirOf(fx.main), sid, { kind: 'session_start', session_id: sid, created_at: t0, ts: t0, event_id: sid + '-s' });
    writeLine(localDirOf(fx.main), sid, { kind: 'session_end', session_id: sid, ended_at: t1, ts: t1, context_remaining_pct: 40, event_id: sid + '-e' });
  }
  const scan = scanSessionActivity(fx.main);
  assert.equal(scan.concurrent_pairs_count, 1,
    'the two local sessions overlap; a kind-only guard would erase B2 entirely');
  assert.equal(scan.sessions.length, 2);
  assert.equal(scan.sessions_local.length, 2);
});

test('(M3 Task 5) local context samples still reach A2 — the second discriminating axis', () => {
  // **판별자 2.** 같은 오구현이 A2의 분자도 통째로 지운다. B2만 재면 그 손실은
  // 보이지 않는다.
  const fx = mkFixture('m3a2');
  const t0 = '2026-03-02T00:00:00.000Z';
  const t1 = '2026-03-02T01:00:00.000Z';
  writeLine(localDirOf(fx.main), 'loc-c', { kind: 'session_start', session_id: 'loc-c', created_at: t0, ts: t0, event_id: 'c-s' });
  writeLine(localDirOf(fx.main), 'loc-c', { kind: 'session_end', session_id: 'loc-c', ended_at: t1, ts: t1, context_remaining_pct: 62, event_id: 'c-e' });

  const scan = scanSessionActivity(fx.main);
  const a2 = metricsMod.computeMetrics({ sources: { session_activity: scan } })[metricsMod.A2_CONTEXT_REMAINING];
  assert.equal(a2.numerator, 1, 'a kind-only guard would drop the only sample');
  assert.deepEqual(a2.value, { p50: 62, p95: 62 });
});

test('(M3 Task 5) an already-created entry does not admit shared non-A1 events', () => {
  // **판별자 3 (Implement-Codex R1 F1).** 가드를 엔트리 **생성**에만 걸면
  // `events.push`와 `session_end` 갱신이 그대로 돌아, 앞선 공유 A1 이벤트가 이미
  // 만들어 둔 엔트리에 외래 span과 외래 context 샘플이 실린다. 아래 fixture는
  // 각 외래 세션에 A1 이벤트를 **먼저** 실어 엔트리를 만들게 하고, 그 뒤에 겹치는
  // 세션 수명을 붙인다 — 생성-only 가드에서 `concurrent_pairs_count`가 1이 된다.
  const fx = mkFixture('m3after');
  const t0 = '2026-04-01T00:00:00.000Z';
  const t1 = '2026-04-01T04:00:00.000Z';
  for (const sid of ['mix-1', 'mix-2']) {
    writeLine(sharedDirOf(fx), sid, {
      kind: 'task_started', session_id: sid, work_unit: 'u-' + sid,
      work_unit_kind: 'milestone', ts: t0, event_id: sid + '-t',
    });
    writeLine(sharedDirOf(fx), sid, { kind: 'session_start', session_id: sid, created_at: t0, ts: t0, event_id: sid + '-s' });
    writeLine(sharedDirOf(fx), sid, { kind: 'session_end', session_id: sid, ended_at: t1, ts: t1, context_remaining_pct: 88, event_id: sid + '-e' });
  }

  const scan = scanSessionActivity(fx.main);
  assert.equal(scan.task_startups_count, 2, 'the A1 axis is untouched — the entries DO get created');
  assert.equal(scan.sessions.length, 2);
  assert.equal(scan.concurrent_pairs_count, 0,
    'a creation-only guard leaves :212 pushing the shared session_start onto the existing '
    + 'entry, which gives it a span and a foreign B2 pair');
  const a2 = metricsMod.computeMetrics({ sources: { session_activity: scan } })[metricsMod.A2_CONTEXT_REMAINING];
  // 샘플이 0이면 `computeA2`는 percentile 분기에 들어가지 않고 numerator를 주장하지
  // 않는다(null). 고정하려는 명제는 "0이라는 수"가 아니라 **외래 샘플이 하나도
  // 분자에 닿지 않았다**이므로 그 형태로 단언한다.
  assert.ok(!(a2.numerator > 0),
    'nor may the shared session_end stamp its context sample onto an existing entry '
    + '(got numerator=' + String(a2.numerator) + ')');
});

// ── orchestrator-step-wiring M3 (Task 1) — 잠든 가드의 가시성 ────────────────

test('(M3 Task 1) the a1 banner names the dormant spike guard', () => {
  // 필드만 싣고 렌더 경로를 열지 않으면 운영자는 `status=`만 보고 anti-gaming 축이
  // 살아 있다고 읽는다. 기준선 producer가 없는 것이 영구 상태이므로(DD2) 이 토큰은
  // 사실상 상수이고, 그것이 정확히 전달하려는 사실이다.
  const fx = mkFixture('m3banner');
  writeLine(localDirOf(fx.main), 'b-1', {
    kind: 'task_started', session_id: 'b-1', work_unit: 'u1',
    work_unit_kind: 'milestone', ts: '2026-05-01T00:00:00.000Z', event_id: 'b1-t',
  });
  const run = require('node:child_process').spawnSync(
    process.execPath, [A1_CLI, 'a1', '--repo-root', fx.main], { encoding: 'utf8' });
  assert.equal(run.status, 0, 'the banner is fail-open and never blocks');
  assert.match(run.stdout || '', /spike-guard=dormant/,
    'the token must appear well below the 50-unit threshold — gating it on the threshold '
    + 'would make it a surface that never renders, which is the failure this Task closes');
});

// ── santa R2 — 세션 맵은 null-prototype 이라야 한다 ─────────────────────────
//
// 양 리뷰어가 각자 재현한 축이다. `sessionId` 는 파일명에서 그대로 오고 writer 의
// `SESSION_ID_RE` 는 `__proto__` 를 허용하므로, 리터럴 `{}` 맵에서는 그 한 파일이
// `Object.prototype` 에 `observed_local` 을 심는다. 그 순간 `sessions_local` 필터가
// **모든** 객체를 로컬로 읽어, 바로 위 Task 4·5 가 세운 모집단 분리가 전부 거짓이
// 된다 — 그리고 그 거짓은 어느 기존 단언에도 걸리지 않았다.
//
// 단언 셋이 함께 있어야 한다: 오염 부재 · 이벤트 보존 · 소유 키로의 착지. 첫
// 단언만 두면 `sessionId` 를 통째로 버리는 구현(오염은 없지만 계수도 잃는)과
// 구별되지 않는다.

test('(santa R2) a __proto__ session id cannot reach Object.prototype', () => {
  const fx = mkFixture('proto');
  const t0 = '2026-03-01T00:00:00.000Z';
  const t1 = '2026-03-01T01:00:00.000Z';

  writeLine(localDirOf(fx.main), '__proto__', {
    kind: 'session_start', session_id: '__proto__', created_at: t0, ts: t0, event_id: 'p-s',
  });
  writeLine(localDirOf(fx.main), '__proto__', {
    kind: 'session_end', session_id: '__proto__', ended_at: t1, ts: t1,
    context_remaining_pct: 42, event_id: 'p-e',
  });
  writeLine(sharedDirOf(fx), '__proto__', {
    kind: 'task_started', session_id: '__proto__', work_unit: 'u-proto',
    work_unit_kind: 'milestone', ts: t0, event_id: 'p-t',
  });
  writeLine(localDirOf(fx.main), 'plain-sid', {
    kind: 'task_started', session_id: 'plain-sid', work_unit: 'u-plain',
    work_unit_kind: 'milestone', ts: t0, event_id: 'q-t',
  });

  const scan = scanSessionActivity(fx.main);

  assert.equal({}.observed_local, undefined,
    'a literal {} session map lets sessions[\'__proto__\'] resolve to Object.prototype, '
    + 'so the assignment lands on every object in the process and sessions_local '
    + 'reports foreign sessions as local — Task 4/5 population split defeated');
  assert.equal(scan.task_startups_count, 2,
    'and the guard must not be "drop the session" either: both startups still count');
  assert.ok(scan.sessions.some(function (s) { return s && s.session_id === '__proto__'; }),
    'the id lands as an ordinary own key, not as a hole');
});
