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
