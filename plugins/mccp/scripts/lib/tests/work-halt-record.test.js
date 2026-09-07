'use strict';

// orchestrator-step-wiring M2 (Task 5) — halt producer/reader 단위 test.
//
// 이 파일이 지키는 명제는 넷이다:
//   1. 기록은 **관측이지 게이트가 아니다** — 어떤 실패에도 exit 0 (UI2).
//   2. 모르는 것은 **비운다** — present-only, 그리고 `'unknown'` 은 값이 아니다 (DD2).
//   3. 읽기 경계는 **저장소 전체**이고, 보장할 수 없으면 그렇게 말한다 (UI4).
//   4. `--reason` 은 durable artifact 로 가고 배너로 재생되므로 **쓰기와 읽기 양쪽**
//      에서 좁혀진다 (security S1).
//
// fixture repo 구성 방식 mirror: session-activity.test.js.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const CLI = path.resolve(__dirname, '..', 'work-orchestrator.js');
const orch = require('../work-orchestrator');
const stateWriter = require('../../state/state-writer');

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

// argv 로 전달되는 갈래에는 NUL 을 넣지 않는다 — Node 의 `spawnSync` 자체가 null byte 가
// 든 인자를 거부하므로(ERR_INVALID_ARG_VALUE) CLI 경로로는 애초에 도달할 수 없다. 그
// 사실이 곧 방어인 것은 아니다: 이미 STATE.md 에 실려 있는 레코드에는 그 제한이 없으므로
// NUL 은 (11c) 의 심은 레코드 쪽에서 검증한다.
const EVIL_ARGV = 'verdict=\u001b]0;PWNED\u0007\u001b[2J\u001b[1;31mFAKE OK\u001b[0mtail';
const EVIL_PLANTED = 'verdict=\u001b]0;PWNED\u0007\u001b[2J\u001b[1;31mFAKE OK\u001b[0m\u0000tail';

function mkRepo(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-halt-' + tag + '-'));
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 't@example.com']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'test']);
  return dir;
}

function run(cwd, args, env) {
  return spawnSync(process.execPath, [CLI].concat(args), {
    cwd: cwd,
    encoding: 'utf8',
    env: Object.assign({}, process.env, env || {}),
  });
}

function readChainProgress(repo) {
  const p = path.join(repo, '.claude', 'state', 'STATE.md');
  if (!fs.existsSync(p)) return null;
  const parsed = stateWriter.parseStateMd(fs.readFileSync(p, 'utf8'));
  const raw = parsed && parsed.frontmatter && parsed.frontmatter.chain_progress;
  if (typeof raw !== 'string') return null;
  return JSON.parse(raw);
}

// STATE.md 에 chain_progress 를 **좁히기를 거치지 않고** 직접 심는다. 구버전
// recorder 가 남긴 레코드를 재현하는 유일한 방법이다 (test 11c).
function plantChainProgress(repo, steps) {
  stateWriter.update(repo, {});
  const p = path.join(repo, '.claude', 'state', 'STATE.md');
  const src = fs.readFileSync(p, 'utf8');
  const json = JSON.stringify({ steps: steps });
  const block = 'chain_progress: |\n'
    + json.split('\n').map(function (l) { return '  ' + l; }).join('\n') + '\n';
  assert.ok(/^---\r?\n/.test(src), 'fixture STATE.md must have frontmatter');
  fs.writeFileSync(p, src.replace(/^---\r?\n/, '---\n' + block));
}

// ── (1) present-only ────────────────────────────────────────────────────────

test('(1) recordChainProgress: the 3 halt fields are present-only — absent when unset', () => {
  const repo = mkRepo('presentonly');
  stateWriter.recordChainProgress(repo, { step: 'commit', status: 'ok' });
  const entry = readChainProgress(repo).steps[0];
  assert.deepStrictEqual(Object.keys(entry).sort(), ['receipt_path', 'status', 'step', 'ts']);
  assert.ok(!('halt_site' in entry), 'halt_site must be absent, not null — absence IS "unknown"');
  assert.ok(!('reason' in entry));
  assert.ok(!('work_unit' in entry));
});

test('(1) recordChainProgress: the halt fields are carried when set', () => {
  const repo = mkRepo('carried');
  stateWriter.recordChainProgress(repo, {
    step: 'implement',
    status: 'halted',
    halt_site: '3.preflight',
    reason: 'next-step said halt',
    work_unit: 'demo-m2',
  });
  const entry = readChainProgress(repo).steps[0];
  assert.strictEqual(entry.halt_site, '3.preflight');
  assert.strictEqual(entry.reason, 'next-step said halt');
  assert.strictEqual(entry.work_unit, 'demo-m2');
  // 기존 4필드의 직렬화는 무변경이어야 한다.
  assert.strictEqual(entry.step, 'implement');
  assert.strictEqual(entry.status, 'halted');
  assert.strictEqual(entry.receipt_path, null);
  assert.match(entry.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test('(1) explicit nulls do not create keys', () => {
  const repo = mkRepo('explicitnull');
  stateWriter.recordChainProgress(repo, {
    step: 'pr', status: 'halted', halt_site: null, reason: null, work_unit: null,
  });
  const entry = readChainProgress(repo).steps[0];
  assert.ok(!('halt_site' in entry) && !('reason' in entry) && !('work_unit' in entry));
});

// ── (2) fail-open: the writer throws ────────────────────────────────────────

test('(2) record-halt stays exit 0 and loud when the state-writer path throws', () => {
  const repo = mkRepo('throwing');
  // CLAUDE_PLUGIN_ROOT 로 auto-chain 의 state-writer 해소를 **throw 하는 모듈**로
  // 돌린다. `applyLocked` 의 실제 throw 경로(DD6)를 프로세스 경계에서 재현하는 가장
  // 정직한 방법이다 — 이 경로가 살아 있어야 UI2 가 성립한다.
  const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-fakeroot-'));
  const sw = path.join(fakeRoot, 'scripts', 'state');
  fs.mkdirSync(sw, { recursive: true });
  fs.writeFileSync(path.join(sw, 'state-writer.js'),
    'module.exports={recordChainProgress(){'
    + 'throw new Error("MCCP_JOURNAL_DEGRADED_UNRECORDED: simulated");}};');

  const r = run(repo, ['record-halt', '--step', 'implement', '--site', '3.preflight',
    '--reason', 'writer is down'], { CLAUDE_PLUGIN_ROOT: fakeRoot });
  assert.strictEqual(r.status, 0, 'a failing recorder must never stop the halt path');
  assert.ok((r.stderr || '').trim().length > 0,
    'UI2: the failure must be surfaced, not swallowed');
});

// ── (3) fallback path: state-writer cannot be required ──────────────────────

test('(3) an unresolvable state-writer falls back to the JSONL sidecar, loudly', () => {
  const repo = mkRepo('fallback');
  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-emptyroot-'));

  const r = run(repo, ['record-halt', '--step', 'implement', '--site', '3.merge',
    '--reason', 'sidecar path'], { CLAUDE_PLUGIN_ROOT: emptyRoot });
  assert.strictEqual(r.status, 0);
  assert.match(r.stderr || '', /auto-chain\.log\.jsonl sidecar/,
    'the silent catch is the exact UI2 violation Task 2 removes');

  const log = path.join(repo, '.claude', 'state', 'auto-chain.log.jsonl');
  assert.ok(fs.existsSync(log), 'the record must survive in the sidecar');
  const rec = JSON.parse(fs.readFileSync(log, 'utf8').trim().split('\n').pop());
  assert.strictEqual(rec.step, 'implement');
  assert.strictEqual(rec.status, 'halted');
  assert.strictEqual(rec.halt_site, '3.merge');
  assert.strictEqual(rec.reason, 'sidecar path');
  // 두 채널의 레코드 모양이 같아야 한다 — present-only 도 함께.
  assert.ok(!('work_unit' in rec), 'the sidecar must honour present-only too');
});

// ── (4) DD7 input narrowing ────────────────────────────────────────────────

test('(4) --step outside the enum is skipped, not rejected', () => {
  const repo = mkRepo('badstep');
  const r = run(repo, ['record-halt', '--step', 'deploy', '--site', '3.preflight']);
  assert.strictEqual(r.status, 0, 'an argument mistake must not change the halt path');
  assert.match(r.stderr || '', /--step must be one of/);
  assert.strictEqual(readChainProgress(repo), null, 'nothing may be recorded');
});

test('(4) --site outside the regex is skipped, not rejected', () => {
  const repo = mkRepo('badsite');
  const bad = ['BAD SITE', '-leading', 'a'.repeat(41), 'has/slash'];
  for (const value of bad) {
    const r = run(repo, ['record-halt', '--step', 'implement', '--site', value]);
    assert.strictEqual(r.status, 0, 'site=' + value);
    assert.match(r.stderr || '', /--site must match/);
  }
  assert.strictEqual(readChainProgress(repo), null);
});

test('(4) --reason is folded to one line and capped at 200 chars', () => {
  const repo = mkRepo('reasoncap');
  run(repo, ['record-halt', '--step', 'verify', '--site', '3.verify',
    '--reason', 'line one\nline two\r\nline three ' + 'x'.repeat(400)]);
  const entry = readChainProgress(repo).steps[0];
  assert.ok(!/[\r\n]/.test(entry.reason), 'CR/LF must be folded');
  assert.ok(entry.reason.length <= 200, 'length contract is 200, got ' + entry.reason.length);
  assert.match(entry.reason, /^line one line two line three /,
    'folding must preserve word boundaries, not concatenate');
});

// ── (5) DD2 work_unit resolution ───────────────────────────────────────────

test('(5) --work-unit wins when given', () => {
  const repo = mkRepo('wuexplicit');
  run(repo, ['record-halt', '--step', 'implement', '--site', '3.preflight',
    '--work-unit', 'explicit-slug']);
  assert.strictEqual(readChainProgress(repo).steps[0].work_unit, 'explicit-slug');
});

test('(5) STATE.md task_fingerprint is the second choice', () => {
  const repo = mkRepo('wufingerprint');
  stateWriter.update(repo, { taskFingerprint: 'orchestrator-step-wiring-m2' });
  const fm = stateWriter.parseStateMd(
    fs.readFileSync(path.join(repo, '.claude', 'state', 'STATE.md'), 'utf8')).frontmatter;
  assert.strictEqual(fm.task_fingerprint, 'orchestrator-step-wiring-m2',
    'fixture precondition: the fingerprint really is set');
  run(repo, ['record-halt', '--step', 'implement', '--site', '3.preflight']);
  const steps = readChainProgress(repo).steps;
  assert.strictEqual(steps[steps.length - 1].work_unit, 'orchestrator-step-wiring-m2');
});

test("(5) task_fingerprint:'unknown' is absence, not a value", () => {
  const repo = mkRepo('wuunknown');
  // `emptyState` 가 리터럴 'unknown' 으로 채우고 REQUIRED_FRONTMATTER_KEYS 에 들어
  // 있어 실제 STATE.md 에서 결코 부재하지 않는다. "둘 다 없을 때"만 보는 test 는
  // 실서비스에서 발생하는 유일한 경로를 구조적으로 못 본다 (L2 architect HIGH).
  stateWriter.update(repo, {});
  const fm = stateWriter.parseStateMd(
    fs.readFileSync(path.join(repo, '.claude', 'state', 'STATE.md'), 'utf8')).frontmatter;
  assert.strictEqual(fm.task_fingerprint, 'unknown',
    'fixture precondition: a fresh STATE.md really does carry the sentinel');
  run(repo, ['record-halt', '--step', 'implement', '--site', '3.preflight']);
  const steps = readChainProgress(repo).steps;
  assert.ok(!('work_unit' in steps[steps.length - 1]),
    "'unknown' must fold to absence — sealing it produces a key that never joins A1");
});

// ── (6) reader: absence, corruption, and the global maximum ────────────────

test('(6) last-halt is silent and exit 0 when there is nothing to say', () => {
  const repo = mkRepo('readerempty');
  const noState = run(repo, ['last-halt']);
  assert.strictEqual(noState.status, 0);
  assert.strictEqual((noState.stdout || '').trim(), '', 'no STATE.md → no banner');

  stateWriter.update(repo, {});
  const noProgress = run(repo, ['last-halt']);
  assert.strictEqual(noProgress.status, 0);
  assert.strictEqual((noProgress.stdout || '').trim(), '', 'no chain_progress → no banner');
});

test('(6) corrupt chain_progress JSON degrades to silence, never to a crash', () => {
  const repo = mkRepo('readercorrupt');
  stateWriter.update(repo, {});
  const p = path.join(repo, '.claude', 'state', 'STATE.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8')
    .replace(/^---\r?\n/, '---\nchain_progress: |\n  {"steps": [ THIS IS NOT JSON\n'));
  const r = run(repo, ['last-halt']);
  assert.strictEqual(r.status, 0);
  assert.strictEqual((r.stdout || '').trim(), '');
});

test('(6) last-halt picks the globally most recent halt across worktrees (UI4)', () => {
  const repo = mkRepo('readerglobal');
  fs.writeFileSync(path.join(repo, 'seed.txt'), 'seed\n');
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', ['-C', repo, 'commit', '-qm', 'seed']);
  const wt = path.join(repo, 'wt-second');
  execFileSync('git', ['-C', repo, 'worktree', 'add', '-q', '-b', 'second', wt]);

  plantChainProgress(repo, [{
    step: 'implement', status: 'halted', receipt_path: null,
    ts: '2026-01-01T00:00:00.000Z', halt_site: '3.preflight', reason: 'older, here',
  }]);
  plantChainProgress(wt, [{
    step: 'verify', status: 'halted', receipt_path: null,
    ts: '2026-06-01T00:00:00.000Z', halt_site: '3.verify', reason: 'newer, elsewhere',
  }]);

  const r = run(repo, ['last-halt']);
  assert.strictEqual(r.status, 0);
  const out = (r.stdout || '').trim();
  assert.match(out, /step=verify/, 'the newer halt wins even though it is in another worktree');
  assert.match(out, /site=3\.verify/);
  assert.match(out, /· worktree=wt-second$/,
    'a halt in a different worktree must name it');

  // 반대 방향: 로컬이 더 최신이면 worktree 꼬리표가 붙지 않는다.
  plantChainProgress(repo, [{
    step: 'commit', status: 'halted', receipt_path: null,
    ts: '2026-07-01T00:00:00.000Z', halt_site: '2t.commit', reason: 'newest, local',
  }]);
  const r2 = run(repo, ['last-halt']);
  assert.match((r2.stdout || '').trim(), /step=commit/);
  assert.ok(!/worktree=/.test(r2.stdout || ''),
    'sameness is not part of the answer — do not print it');
});

// ── (7) containment guard ──────────────────────────────────────────────────

test('(7) a directory with no .claude/.git marker is refused with zero side effects', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-bare-'));
  const before = fs.readdirSync(bare);
  const r = run(bare, ['record-halt', '--step', 'implement', '--site', '3.preflight']);
  assert.strictEqual(r.status, 0, 'refusal is also fail-open');
  assert.match(r.stderr || '', /no \.claude or \.git marker/);
  assert.deepStrictEqual(fs.readdirSync(bare), before,
    'instrumentation must never create state outside a repository');
  assert.ok(!fs.existsSync(path.join(bare, '.claude')));

  const reader = run(bare, ['last-halt']);
  assert.strictEqual(reader.status, 0);
  assert.strictEqual((reader.stdout || '').trim(), '');
  assert.deepStrictEqual(fs.readdirSync(bare), before);
});

// ── (8) absolute-path scrubbing, and its ORDER ─────────────────────────────

test('(8) --reason is scrubbed before it reaches the git-tracked artifact', () => {
  const repo = mkRepo('scrub');
  const abs = process.platform === 'win32'
    ? 'C:\\Users\\someone\\secret' : '/home/someone/secret';
  run(repo, ['record-halt', '--step', 'implement', '--site', '3.merge',
    '--reason', 'token kept at ' + abs + '/x.json']);
  const reason = readChainProgress(repo).steps[0].reason;
  assert.ok(reason.indexOf(abs) < 0,
    'STATE.md is git-tracked (§3.2) — an absolute path here is the §3.12 leak class: ' + reason);
});

test('(8) scrubbing runs BEFORE truncation, so the 200-char contract holds on the final text', () => {
  const repo = mkRepo('scruborder');
  const abs = process.platform === 'win32'
    ? 'C:\\Users\\someone\\deep\\path' : '/home/someone/deep/path';
  run(repo, ['record-halt', '--step', 'implement', '--site', '3.merge',
    '--reason', (abs + '/a ').repeat(30) + 'tail']);
  const reason = readChainProgress(repo).steps[0].reason;
  assert.ok(reason.length <= 200, 'final length must be <= 200, got ' + reason.length);
  assert.ok(reason.indexOf(abs) < 0, 'and the scrub must still have happened');
});

// ── (9) supersession ──────────────────────────────────────────────────────

test('(9) a halt that was followed by another step is no longer claimed', () => {
  const repo = mkRepo('supersede');
  plantChainProgress(repo, [
    {
      step: 'implement', status: 'halted', receipt_path: null,
      ts: '2026-02-01T00:00:00.000Z', halt_site: '3.preflight', reason: 'blocked',
    },
    { step: 'implement', status: 'ok', receipt_path: null, ts: '2026-02-02T00:00:00.000Z' },
  ]);
  const r = run(repo, ['last-halt']);
  assert.strictEqual(r.status, 0);
  assert.strictEqual((r.stdout || '').trim(), '',
    'chain_progress is append-only with no resolution concept — without this rule the '
    + 'banner claims a recovered halt forever');
});

// ── (10) truncation says so instead of answering ──────────────────────────

test('(10) a truncated worktree list yields the omission reason, not a wrong answer', () => {
  const repo = mkRepo('truncate');
  fs.writeFileSync(path.join(repo, 'seed.txt'), 'seed\n');
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', ['-C', repo, 'commit', '-qm', 'seed']);
  execFileSync('git', ['-C', repo, 'worktree', 'add', '-q', '-b', 'other',
    path.join(repo, 'wt-other')]);
  plantChainProgress(repo, [{
    step: 'implement', status: 'halted', receipt_path: null,
    ts: '2026-03-01T00:00:00.000Z', halt_site: '3.preflight', reason: 'local',
  }]);
  const r = run(repo, ['last-halt'], { MCCP_WORKTREE_SCAN_CAP: '1' });
  assert.strictEqual(r.status, 0);
  const out = (r.stdout || '').trim();
  assert.match(out, /^halt 배너 생략: worktree 목록 절삭\(cap 1\/2\)$/,
    'a global maximum drawn from a truncated list presents an older halt as the answer');
  assert.ok(!/직전 halt:/.test(out));
});

// ── (12) 부재와 실패는 섞이지 않는다 (review HIGH-2) ──────────────────────

test('(12) a damaged STATE.md elsewhere does not turn "no halt" into "read failed"', () => {
  const repo = mkRepo('quietparse');
  fs.writeFileSync(path.join(repo, 'seed.txt'), 'seed\n');
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', ['-C', repo, 'commit', '-qm', 'seed']);
  execFileSync('git', ['-C', repo, 'worktree', 'add', '-q', '-b', 'other',
    path.join(repo, 'wt-other')]);
  // 남의 worktree 의 STATE.md 가 이 reader 가 아는 schema 가 아니다. 흔한 상태다 —
  // 오래 산 worktree 하나면 충분하고, DD1 이 읽기를 저장소 전체로 넓혔으므로 그
  // 하나가 **모든** worktree 의 진입 배너에 도달한다.
  const alien = path.join(repo, 'wt-other', '.claude', 'state');
  fs.mkdirSync(alien, { recursive: true });
  fs.writeFileSync(path.join(alien, 'STATE.md'),
    '---\nstate_version: 9\ntask_fingerprint: x\n---\n\n## Goal\nx\n');

  const r = run(repo, ['last-halt']);
  assert.strictEqual(r.status, 0);
  assert.strictEqual((r.stdout || '').trim(), '', 'there is no halt — silence is the answer');
  assert.strictEqual((r.stderr || '').trim(), '',
    'the parse layer says "resetting state", which is false here (this path writes '
    + 'nothing) and, worse, the banner treats any stderr line as a read failure — so a '
    + 'neighbouring worktree turns a healthy "no halt" into a reported breakage. '
    + 'measured: ' + JSON.stringify((r.stderr || '').trim()));
});

// ── (13) reader 재강제는 reason 만의 것이 아니다 (review M1) ──────────────

test('(13) newlines planted in step/site/ts cannot split the banner into extra lines', () => {
  const repo = mkRepo('fieldfold');
  plantChainProgress(repo, [{
    step: 'implement\n[mccp:work] chain complete',
    status: 'halted',
    receipt_path: null,
    ts: '2026-05-01T00:00:00.000Z\n[mccp:work] all gates passed',
    halt_site: '3.merge\n[mccp:work] nothing to see',
    reason: 'plain',
  }]);
  const out = (run(repo, ['last-halt']).stdout || '').replace(/\n$/, '');
  assert.ok(out.indexOf('\n') < 0,
    'the banner is echoed unquoted, so a newline in ANY reported field forges an extra '
    + '"[mccp:work] " line. chain_progress lives in a git-tracked STATE.md, so that '
    + 'value can arrive through a PR. measured: ' + JSON.stringify(out));
  assert.match(out, /step=implement/, 'the record is still reported, just folded');

  const j = (run(repo, ['last-halt', '--json']).stdout || '');
  const parsed = JSON.parse(j);
  ['step', 'site', 'ts'].forEach(function (k) {
    assert.ok(String(parsed[k] || '').indexOf('\n') < 0,
      '--json is a consumer too — ' + k + ' still carries a newline');
  });
});

// ── (11) control characters (security S1) ─────────────────────────────────

test('(11a) control characters never reach the durable artifact', () => {
  const repo = mkRepo('ctrlstore');
  run(repo, ['record-halt', '--step', 'implement', '--site', '3.gate.verdict', '--reason', EVIL_ARGV]);
  const reason = readChainProgress(repo).steps[0].reason;
  assert.ok(!CONTROL_RE.test(reason),
    'raw control bytes in a git-tracked record: ' + JSON.stringify(reason));
  assert.ok(reason.indexOf('\u001b') < 0);
  assert.match(reason, /verdict=/, 'the readable content must survive the narrowing');
});

test('(11b) control characters never reach the banner', () => {
  const repo = mkRepo('ctrlbanner');
  run(repo, ['record-halt', '--step', 'implement', '--site', '3.gate.verdict', '--reason', EVIL_ARGV]);
  const out = run(repo, ['last-halt']).stdout || '';
  assert.ok(!CONTROL_RE.test(out),
    'the banner is echoed unquoted into the operator terminal: ' + JSON.stringify(out));
});

test('(11c) the reader re-enforces narrowing on records it did not write', () => {
  // 쓰기 시점 좁히기만으로는 **이미 디스크에 있는** 레코드를 되돌릴 수 없다. 구버전
  // recorder 가 남긴 오염된 한 줄은 DD1 의 저장소-전체 읽기 때문에 다른 모든 worktree
  // 의 진입마다 재생된다 — 이 단언이 없으면 그 경로가 열린 채로 남는다.
  const repo = mkRepo('ctrllegacy');
  plantChainProgress(repo, [{
    step: 'implement', status: 'halted', receipt_path: null,
    ts: '2026-04-01T00:00:00.000Z', halt_site: '3.merge', reason: EVIL_PLANTED,
  }]);
  const planted = readChainProgress(repo).steps[0].reason;
  assert.ok(planted.indexOf('\u001b') >= 0,
    'fixture precondition: the planted record really is un-narrowed');

  const out = run(repo, ['last-halt']).stdout || '';
  assert.match(out, /step=implement/, 'the record must still be reported');
  assert.ok(!CONTROL_RE.test(out),
    'a legacy record must be narrowed at read time: ' + JSON.stringify(out));

  const j = run(repo, ['last-halt', '--json']).stdout || '';
  assert.ok(!CONTROL_RE.test(j), 'the --json surface is a consumer too');
});

// ── narrowing unit surface (no spawn) ─────────────────────────────────────

test('narrowReason keeps CR/LF for the folder instead of deleting them', () => {
  const deps = orch.haltDeps();
  assert.strictEqual(orch.narrowReason('a\nb', process.cwd(), deps), 'a b',
    'stripping CR/LF before oneLineExcerpt would concatenate words');
});

test('scrubControl removes ANSI sequences and residual control bytes but keeps text', () => {
  const deps = orch.haltDeps();
  assert.strictEqual(orch.scrubControl('a\u001b[31mb\u0007c\td', deps), 'abc d',
    'tab becomes a space; ESC and BEL are REMOVED (not spaced), so b and c join');
});
