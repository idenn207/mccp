'use strict';

// codex-probe 계측 하네스 test (Task 1 Validate a~h + Task 4 래칫).
// mirror: `scripts/tests/test-suite.test.js` — node --test, 합성 입력, 자기 포함 단언.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const probeHook = require('../codex-probe/probe-hook');
const report = require('../codex-probe/report');
const snapshot = require('../codex-probe/snapshot');
const scan = require('../codex-probe/scan-coupling');
const inventory = require('../codex-probe/coupling-inventory');
const cli = require('../codex-probe/cli');
const { makeGate } = require('../codex-probe/redact-gate');

const CLI_PATH = path.resolve(__dirname, '../codex-probe/cli.js');
const TRUTH_JSON = path.resolve(__dirname, '../../.claude/_meta/data/2026-09-09-codex-harness-truth.json');

const V = '0.153.4';
function snap(over) {
  return Object.assign({
    schema: snapshot.SCHEMA, at: '2026-09-09T00:00:00.000Z', codex_home_kind: 'real',
    codex_version: V, config_present: true, config_sha256: 'sha256:aa',
    config_mccp_keys: [], plugin_cache_entries: [],
  }, over || {});
}
function line(over) {
  return Object.assign({
    at: '2026-09-09T00:00:01.000Z', argv: ['node', 'probe-hook.js'],
    event: { hook_event_name: 'UserPromptSubmit', tool_name: 'Bash' },
    env: { values: { CLAUDE_PLUGIN_ROOT: '<home>/x' }, names_only: ['PATH'], value_suppressed: [] },
    run: { run_id: 'r1', trust_mode: 'trusted', codex_version: V, entrypoint: 'exec' },
  }, over || {});
}

// ── (a) 증거 없는 measured 승격이 거부된다 ─────────────────────────────────────
test('(a) an axis with a value but no evidence line folds to unmeasured', () => {
  const r = report.deriveReport({
    log: [line()], before: snap(), after: snap(),
    observations: { A3_auto_discovery: { value: true, evidence: [] } },
  });
  assert.strictEqual(r.axes.A3_auto_discovery.verdict, 'unmeasured');
  assert.match(r.axes.A3_auto_discovery.reason, /no evidence line/);
});

// ── (b) 빈 로그가 전 축 unmeasured ────────────────────────────────────────────
test('(b) an empty probe log leaves every axis unmeasured', () => {
  const r = report.deriveReport({ log: [], before: snap(), after: snap(), diff: { comparable: true, clean: true, added: [], removed: [] } });
  report.AXES.forEach((a) => assert.strictEqual(r.axes[a].verdict, 'unmeasured', a + ' should be unmeasured'));
  // positive control: 아무것도 재지 않은 실행이 "격리가 성립했다"를 주장하면 안 된다.
  assert.match(r.axes.revert_integrity.reason, /cannot distinguish/);
  assert.strictEqual(r.milestone_closeable.ok, false);
});

// ── (c) 와일드카드 매칭이 일어나지 않는다 ──────────────────────────────────────
test('(c) a non-allowlisted CODEX_* name is recorded name-only, never by value', () => {
  const out = probeHook.projectEnv({ CODEX_API_KEY: 'sk-super-secret', CODEX_HOME: '/h' });
  assert.ok(!Object.prototype.hasOwnProperty.call(out.values, 'CODEX_API_KEY'));
  assert.ok(out.names_only.includes('CODEX_API_KEY'));
  assert.ok(!JSON.stringify(out).includes('sk-super-secret'));
  // 닫힌 목록 안의 이름은 값을 싣는다 — 투영이 전부를 버리는 것이 아님을 함께 고정한다.
  assert.strictEqual(out.values.CODEX_HOME, '/h');
});

test('(c2) suffix-shaped names are not matched either', () => {
  const out = probeHook.projectEnv({ FOO_SESSION_ID: 'sid', BAR_PID: '9' });
  assert.deepStrictEqual(Object.keys(out.values), []);
  assert.deepStrictEqual(out.names_only.sort(), ['BAR_PID', 'FOO_SESSION_ID']);
});

// ── (d) 목록 안이어도 secret 형태는 값이 억제된다 ─────────────────────────────
test('(d) the regex backstop suppresses a secret-shaped name even when allowlisted', () => {
  const out = probeHook.projectEnv({ CODEX_AUTH_TOKEN: 'tok' }, null, ['CODEX_AUTH_TOKEN']);
  assert.deepStrictEqual(Object.keys(out.values), []);
  assert.ok(out.value_suppressed.includes('CODEX_AUTH_TOKEN'));
  assert.ok(!JSON.stringify(out).includes('tok'));
});

test('(d2) the backstop is UNREACHABLE with the shipped allowlist — pinned deliberately', () => {
  // 현재 여덟 이름 중 SECRET_NAME_RE에 걸리는 것은 없다. 즉 실 구성에서 이 분기는 도달
  // 불가이고, 그 사실 자체를 고정한다 — 목록에 secret 형태 이름이 추가되는 날 이 test가
  // red로 알린다(§3.17 "도달 불가를 test가 고정한다").
  const hit = probeHook.VALUE_ALLOWLIST.filter((n) => probeHook.SECRET_NAME_RE.test(n));
  assert.deepStrictEqual(hit, []);
});

// ── (e) argv가 basename으로 접힌다 ───────────────────────────────────────────
test('(e) argv is folded to basenames while flags survive', () => {
  const folded = probeHook.foldArgv(['/home/someone/.nvm/versions/node/v22/bin/node',
    '/home/someone/work/repo/scripts/codex-probe/probe-hook.js', '--verbose']);
  assert.deepStrictEqual(folded, ['node', 'probe-hook.js', '--verbose']);
  assert.ok(!folded.join(' ').includes('someone'));
});

// ── (f) bypassed 줄은 A1을 승격시키지 못한다 ──────────────────────────────────
test('(f) a bypassed trust_mode line does not promote A1', () => {
  const l = line({ run: { run_id: 'r1', trust_mode: 'bypassed', codex_version: V, entrypoint: 'exec' } });
  const r = report.deriveReport({ log: [l], before: snap(), after: snap() });
  assert.strictEqual(r.axes.A1_hook_fires.verdict, 'unmeasured');
  assert.match(r.axes.A1_hook_fires.reason, /bypassed/);
  assert.strictEqual(r.milestone_closeable.ok, false);
  // 같은 줄이 trusted였다면 승격한다 — 규칙이 trust_mode에 걸려 있음을 대조로 고정한다.
  const ok = report.deriveReport({ log: [line()], before: snap(), after: snap() });
  assert.strictEqual(ok.axes.A1_hook_fires.verdict, 'measured');
  assert.strictEqual(ok.milestone_closeable.ok, true);
});

test('(f2) codex_version must agree between evidence lines and both snapshots (UI13)', () => {
  const l = line({ run: { run_id: 'r1', trust_mode: 'trusted', codex_version: '0.99.0', entrypoint: 'exec' } });
  const r = report.deriveReport({ log: [l], before: snap(), after: snap() });
  assert.strictEqual(r.axes.A1_hook_fires.verdict, 'unmeasured');
  assert.match(r.axes.A1_hook_fires.reason, /0\.99\.0 != snapshot/);
});

// ── (g) DD10 관문이 잔여 절대경로에 쓰기를 거부한다 ───────────────────────────
test('(g) the DD10 pre-write gate refuses to write an object carrying an absolute path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-gate-'));
  const target = path.join(dir, 'out.json');
  const gate = makeGate({ repoRoot: process.cwd() });
  const res = gate.writeGuarded({ path: target, data: { leak: path.join(os.homedir(), '.codex', 'plugins', 'cache', 'mccp') } });
  assert.strictEqual(res.written, false);
  assert.ok(res.hits.length > 0);
  assert.strictEqual(fs.existsSync(target), false, 'refused write must leave no file');
  // 진단 자체가 유출 채널이 되지 않는다.
  assert.ok(!JSON.stringify(res.hits).includes(os.homedir()));
  const clean = gate.writeGuarded({ path: target, data: { rel: 'plugins/cache/mccp/' } });
  assert.strictEqual(clean.written, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── (h) producer → consumer e2e ──────────────────────────────────────────────
test('(h) probe-hook.js spawned as a real child produces JSONL that report.js consumes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-e2e-'));
  const log = path.join(dir, 'probe.jsonl');
  const r = spawnSync(process.execPath, [path.resolve(__dirname, '../codex-probe/probe-hook.js')], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', tool_name: 'Bash', cwd: process.cwd() }),
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      PROBE_LOG: log,
      MCCP_PROBE_RUN_ID: 'e2e',
      MCCP_PROBE_TRUST_MODE: 'trusted',
      MCCP_PROBE_CODEX_VERSION: V,
      MCCP_PROBE_ENTRYPOINT: 'test',
      MCCP_PROBE_REPO_ROOT: process.cwd(),
      CODEX_API_KEY: 'sk-must-not-appear',
    }),
  });
  assert.strictEqual(r.status, 0, 'probe-hook must always exit 0');
  const raw = fs.readFileSync(log, 'utf8');
  assert.ok(!raw.includes('sk-must-not-appear'), 'a non-allowlisted secret value must never reach the log');
  const parsed = raw.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  assert.strictEqual(parsed.length, 1);
  // producer가 실제로 낸 줄을 consumer가 파싱해 축으로 승격시킨다. 합성 로그만 쓰면
  // producer 키 이름이 바뀌어도 전 test가 green인 채 라이브만 조용히 unmeasured가 된다.
  const rec = report.deriveReport({ log: parsed, before: snap(), after: snap() });
  assert.strictEqual(rec.axes.A1_hook_fires.verdict, 'measured');
  assert.strictEqual(rec.axes.A6_payload_shape.verdict, 'measured');
  assert.strictEqual(rec.axes.A6_payload_shape.value.has_tool_name, true);
  assert.deepStrictEqual(rec.axes.A2_event_enum.value.fired, ['UserPromptSubmit']);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── snapshot 순수층 ──────────────────────────────────────────────────────────
test('mccp attribution is a boundary match, not a substring match', () => {
  const keys = snapshot.mccpKeysFromToml('[marketplaces.mccp]\n[plugins."mccp@mccp"]\n[other.xmccpy]\n[tui]\n');
  assert.deepStrictEqual(keys, ['marketplaces.mccp', 'plugins."mccp@mccp"']);
});

test('diff refuses to claim clean when a snapshot is missing (positive control)', () => {
  const d = snapshot.diff(null, snap());
  assert.strictEqual(d.comparable, false);
  assert.strictEqual(d.clean, false);
});

test('diff ignores whole-file config sha256 — DD3 retired that oracle', () => {
  const d = snapshot.diff(snap({ config_sha256: 'sha256:aa' }), snap({ config_sha256: 'sha256:bb' }));
  assert.strictEqual(d.clean, true, 'a config.toml Codex rewrote on its own must not read as residue');
  const dirty = snapshot.diff(snap(), snap({ config_mccp_keys: ['marketplaces.mccp'] }));
  assert.strictEqual(dirty.clean, false);
  assert.deepStrictEqual(dirty.added, ['config_mccp_keys:marketplaces.mccp']);
});

// ── Task 4 스캐너 양방향 + 상한 짝 단언 ──────────────────────────────────────
test('the shipped inventory covers every independently-derived candidate', () => {
  const res = scan.scan({});
  assert.strictEqual(res.unlisted, 0, 'unlisted: ' + JSON.stringify(res.unlisted_items));
  assert.strictEqual(res.fossil, 0, 'fossil: ' + JSON.stringify(res.fossil_items));
  assert.ok(res.candidates_total > 100, 'the candidate universe must be non-trivial, got ' + res.candidates_total);
});

test('candidates are produced WITHOUT reading the inventory — the scanner is independent', () => {
  // 빈 목록으로 스캔하면 후보 전량이 unlisted가 된다. 이것이 `unlisted:0`이 구조적 항진이
  // 아니라는 증명이다 — 목록이 유일 입력이면 이 단언은 0을 낸다.
  const res = scan.scan({ inventory: [] });
  assert.strictEqual(res.unlisted, res.candidates_total);
  assert.ok(res.unlisted > 100);
});

test('a declared entry covering nothing is reported as fossil', () => {
  const res = scan.scan({ inventory: [{ name: 'ghost', rule: 'claude-home-path', covers: ['plugins/mccp/scripts/lib/does-not-exist.js'] }] });
  assert.strictEqual(res.fossil, 1);
  assert.strictEqual(res.fossil_items[0].name, 'ghost');
});

test('CEILING is paired with the inventory length', () => {
  // 상한은 신원이 아니라 가시화 장치다 — 늘리려면 상수를 올리는 별도 편집이 필요하고
  // 그 사실이 diff에 숫자로 남는다(mirror: env-contract/evidence-debt.js).
  assert.strictEqual(inventory.COUPLING_INVENTORY_CEILING, inventory.COUPLING_INVENTORY.length);
});

test('name-axis coverage is exact, never a prefix match', () => {
  const cands = [{ rule: 'claude-env-name', kind: 'name', key: 'CLAUDE_PLUGIN_ROOT_EXTRA' }];
  const entry = { rule: 'claude-env-name', covers: ['CLAUDE_PLUGIN_ROOT'] };
  assert.strictEqual(scan.coversCandidate(entry, cands[0]), false);
});

// ══ 코드 리뷰 흡수 회귀 ═══════════════════════════════════════════════════════
// 아래는 2026-09-09 로컬 코드 리뷰가 낸 지적의 회귀다. 각 test는 **고치기 전에 red였던
// 형태**를 재현한다 — 지적이 실재했다는 증거이자, 같은 결함이 되돌아오면 잡는 그물이다.

// ── H1: 두 필드가 같은 redaction을 받는다 ─────────────────────────────────────
test('H1 capture() redacts config_mccp_keys, not just plugin_cache_entries', () => {
  // Codex는 통상 운용 중 `[projects."<절대경로>"]` trust 헤더를 스스로 쓴다. 그 경로에
  // `mccp` 세그먼트가 있으면 — 즉 이 저장소에서 프로브를 돌리면 반드시 —
  // `isMccpAttributed`가 그것을 잡는다. 고치기 전에는 그 절대경로가 그대로 실렸다.
  const { createRedactor } = require('../test-suite/redact');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-home-'));
  fs.writeFileSync(path.join(home, 'config.toml'),
    '[projects."' + process.cwd() + '"]\ntrust_level = "trusted"\n[tui]\n');

  const snapped = snapshot.capture({
    codexHome: home,
    kind: 'real',
    codexVersion: V,
    redactor: createRedactor({ repoRoot: process.cwd() }),
  });

  assert.strictEqual(snapped.config_mccp_keys.length, 1, 'the trust header must still be reported');
  const key = snapped.config_mccp_keys[0];
  assert.ok(!key.includes(os.homedir()), 'the operator home path must not survive: ' + key);
  assert.ok(key.startsWith('projects.'), 'the attribution itself is still reported: ' + key);

  // 그리고 그 산출물은 DD10 관문을 **통과해야 한다**. 고치기 전에는 관문이 거부했고,
  // 그래서 `--out` 경로에서 이 스냅샷을 아예 만들 수 없었다.
  const verdict = makeGate({ repoRoot: process.cwd() }).inspect(snapped);
  assert.strictEqual(verdict.ok, true, 'gate hits: ' + JSON.stringify(verdict.hits));
  fs.rmSync(home, { recursive: true, force: true });
});

// ── M1: stdout도 같은 관문을 지난다 ───────────────────────────────────────────
test('M1 the stdout channel is gated too, not only --out', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-stdout-'));
  const logPath = path.join(dir, 'probe.jsonl');
  const beforePath = path.join(dir, 'before.json');
  const afterPath = path.join(dir, 'after.json');
  fs.writeFileSync(logPath, JSON.stringify(line()) + '\n');
  fs.writeFileSync(beforePath, JSON.stringify(snap()));
  fs.writeFileSync(afterPath, JSON.stringify(snap()));

  const run = (observations) => {
    const obsPath = path.join(dir, 'obs-' + Math.random().toString(36).slice(2) + '.json');
    fs.writeFileSync(obsPath, JSON.stringify(observations));
    return spawnSync(process.execPath, [CLI_PATH, 'report',
      '--log', logPath, '--before', beforePath, '--after', afterPath, '--observations', obsPath],
    { encoding: 'utf8', cwd: process.cwd() });
  };

  // 통제: 깨끗한 관측은 stdout으로 나가고 exit 0이다.
  const clean = run({ A3_auto_discovery: { value: 'discovered', evidence: [0] } });
  assert.strictEqual(clean.status, 0, clean.stderr);
  assert.strictEqual(JSON.parse(clean.stdout).axes.A3_auto_discovery.verdict, 'measured');

  // 처치: 절대경로를 실은 관측은 **stdout으로 나가지 못한다**. `--out`이 없어도.
  const leak = run({ A3_auto_discovery: { value: path.join(os.homedir(), '.codex', 'leak'), evidence: [0] } });
  assert.strictEqual(leak.status, 1, 'a residual absolute path must refuse the stdout write');
  assert.strictEqual(leak.stdout, '', 'nothing may reach stdout once the gate refuses');
  assert.match(leak.stderr, /REFUSED stdout/);
  assert.ok(!leak.stderr.includes(os.homedir()), 'the diagnostic must not leak the path it refused');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── M2: 등록 이름이 측정 원자료와 일치한다 ────────────────────────────────────
test('M2 EVENT_CANDIDATES equals the measured HooksToml fields, derived from the raw record', () => {
  // 기대값을 여기에 다시 적지 않는다 — 그러면 두 리터럴이 각자 드리프트한다. 정본은
  // truth JSON이고, 이 단언은 도구와 원자료가 갈라지는 순간 red가 된다.
  const truth = JSON.parse(fs.readFileSync(TRUTH_JSON, 'utf8'));
  const enumRun = truth.runs.find((r) => r.id === 'event-enum');
  const measured = enumRun.result.fields_present.slice().sort();
  assert.deepStrictEqual(cli.EVENT_CANDIDATES.slice().sort(), measured);
  // 회귀의 핵심: 이 셋이 빠져 있었다.
  ['PostCompact', 'SubagentStart', 'SubagentStop'].forEach((name) => {
    assert.ok(cli.EVENT_CANDIDATES.includes(name), name + ' must be registered or it can never be observed');
  });
});

// ── M3: TOML 문자열이 이스케이프된다 ──────────────────────────────────────────
test('M3 the hooks config escapes backslashes and quotes instead of corrupting the TOML', () => {
  const winCmd = 'C:\\Program\\node.exe C:\\repo\\probe-hook.js';
  const cfg = cli.buildHooksConfig(winCmd, ['SessionStart']);
  assert.match(cfg, /^\[hooks\]\n/);
  // 원문 백슬래시가 그대로 실리면 TOML이 `\P` 같은 무효 escape를 만난다.
  assert.ok(!cfg.includes('command = "C:\\Program'), 'raw backslash must not reach the TOML');
  assert.ok(cfg.includes('C:\\\\Program\\\\node.exe'), 'backslashes must be doubled: ' + cfg);
  assert.strictEqual(cli.tomlBasicString('a"b'), '"a\\"b"');
  // 이벤트 하나당 한 줄, 그리고 목록은 기본값으로 EVENT_CANDIDATES를 쓴다.
  assert.strictEqual(cli.buildHooksConfig('x').trim().split('\n').length, cli.EVENT_CANDIDATES.length + 1);
});

// ── M5: 워치독이 hang을 막는다 ────────────────────────────────────────────────
test('M5 the hook child exits even when the host never closes stdin', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-hang-'));
  const log = path.join(dir, 'probe.jsonl');
  const child = spawn(process.execPath, [path.resolve(__dirname, '../codex-probe/probe-hook.js')], {
    stdio: ['pipe', 'ignore', 'ignore'],
    env: Object.assign({}, process.env, {
      PROBE_LOG: log,
      MCCP_PROBE_RUN_ID: 'hang',
      MCCP_PROBE_TRUST_MODE: 'trusted',
      MCCP_PROBE_CODEX_VERSION: V,
      MCCP_PROBE_REPO_ROOT: process.cwd(),
      MCCP_PROBE_STDIN_WAIT_MS: '300',
    }),
  });
  // stdin을 **열어 둔 채** 둔다 — 고치기 전에는 여기서 영원히 살았다.
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('probe-hook hung on open stdin')); }, 10000);
    child.on('close', (c) => { clearTimeout(timer); resolve(c); });
  });
  assert.strictEqual(code, 0, 'probe-hook must always exit 0');
  const parsed = JSON.parse(fs.readFileSync(log, 'utf8').trim());
  assert.strictEqual(parsed.stdin_truncated, true, 'the truncation must be recorded, not silent');
  assert.strictEqual(parsed.run.trust_mode, 'trusted');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── M6: 관문이 직렬화 형태도 본다 ─────────────────────────────────────────────
test('M6 the gate inspects the serialized form, catching what the structural walk cannot', () => {
  const gate = makeGate({ repoRoot: process.cwd() });
  const leak = path.join(os.homedir(), '.codex', 'auth.json');
  // `scanResidual`은 own enumerable key만 훑고 함수 값은 지나친다. 그래서 구조 순회에는
  // 안 보이지만 `JSON.stringify`는 `toJSON`을 호출해 경로를 디스크에 남긴다.
  const payload = { inner: { toJSON: function () { return leak; } } };
  assert.strictEqual(gate.inspect(payload).ok, true, 'structural walk is blind here — that is the premise');
  const verdict = gate.inspectPayload(payload);
  assert.strictEqual(verdict.ok, false, 'the serialized form must be judged too');
  assert.ok(verdict.hits.some((h) => h.at.startsWith('<serialized>')), JSON.stringify(verdict.hits));

  // 그리고 쓰기가 실제로 거부되고 파일이 남지 않는다.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-ser-'));
  const target = path.join(dir, 'out.json');
  assert.strictEqual(gate.writeGuarded({ path: target, data: payload }).written, false);
  assert.strictEqual(fs.existsSync(target), false);
  // 통과 경로는 원자적으로 쓰고 tmp 잔재를 남기지 않는다.
  assert.strictEqual(gate.writeGuarded({ path: target, data: { rel: 'a/b' } }).written, true);
  assert.deepStrictEqual(fs.readdirSync(dir), ['out.json']);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── M7: teardown이 남의 실행을 지우지 않는다 ──────────────────────────────────
test('M7 teardown refuses to reclaim a lock owned by another run, even with force', () => {
  const lockPath = cli.runLock();
  const saved = fs.existsSync(lockPath) ? fs.readFileSync(lockPath) : null;
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify({ run_id: 'theirs', pid: process.pid, at: new Date().toISOString() }));

    const foreign = cli.teardown({ force: true, owner: 'mine' });
    assert.strictEqual(foreign.removed, false, 'force must not beat ownership');
    assert.strictEqual(foreign.owner_mismatch, true);
    assert.strictEqual(fs.existsSync(lockPath), true, 'the other run keeps its lock');

    // 자기 lock은 회수한다 — 소유권 검사가 teardown을 통째로 막아 버리지 않음을 대조로 고정한다.
    const own = cli.teardown({ force: true, owner: 'theirs' });
    assert.strictEqual(own.removed, true, own.reason);
    assert.strictEqual(fs.existsSync(lockPath), false);
  } finally {
    if (saved !== null) fs.writeFileSync(lockPath, saved);
    else if (fs.existsSync(lockPath)) fs.rmSync(lockPath, { force: true });
  }
});

// ── LOW: revert_integrity의 증거가 자의적으로 접히지 않는다 ────────────────────
test('revert_integrity cites every probe line, not an arbitrary line 0', () => {
  const bypassedLine = line({ run: { run_id: 'r1', trust_mode: 'bypassed', codex_version: V, entrypoint: 'exec' } });
  const r = report.deriveReport({
    log: [bypassedLine, bypassedLine, bypassedLine],
    before: snap(), after: snap(),
    diff: { comparable: true, clean: true, added: [], removed: [] },
  });
  assert.strictEqual(r.axes.revert_integrity.verdict, 'measured');
  assert.deepStrictEqual(r.axes.revert_integrity.evidence, [0, 1, 2]);
  // A1은 여전히 접힌다 — 이 완화가 trust 규칙으로 새지 않음을 함께 고정한다.
  assert.strictEqual(r.axes.A1_hook_fires.verdict, 'unmeasured');
});

// ── LOW: 스캐너가 vendored 트리를 세지 않는다 ─────────────────────────────────
test('the coupling scanner skips vendored trees so the ratchet does not track install state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-scan-'));
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = process.env.CLAUDE_ALPHA;\n');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'b.js'), 'const y = process.env.CLAUDE_BETA;\n');

  const keys = scan.candidates({ root: root }).map((c) => c.key);
  assert.ok(keys.includes('CLAUDE_ALPHA'), 'the owned tree is still scanned: ' + JSON.stringify(keys));
  assert.ok(!keys.includes('CLAUDE_BETA'), 'node_modules must not enter the candidate universe');
  fs.rmSync(root, { recursive: true, force: true });
});
