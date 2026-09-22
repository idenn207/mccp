'use strict';

// 차단 프로토콜 계측 (codex-harness-portability M2 Task 2·3 — B1~B4).
//
// **왜 배선보다 먼저인가.** 이 저장소는 차단을 두 형식으로 낸다 —
// `receipt-prompt.js`는 stdout `{"decision":"block"}` + exit 0, `receipt-skill.js`는
// exit 2 + stderr. Codex가 어느 쪽을 존중하는지 M1은 재지 않았고 남은 것은 바이너리
// 문자열뿐이다. M2 Outcome 전체가 이 값에 걸려 있으므로 형식을 고르지 않고 잰다(DD5).
//
// **어느 형식도 차단하지 않으면 그대로 보고한다.** 통과 관측을 차단으로 반올림하는 것은
// UI17이 금지한 바로 그 행위다. 그 경우 `harness-ingress.js`의 `CODEX_BLOCK_PROTOCOL`은
// `null`로 남고 ingress는 켜지지 않는다.
//
// ── 판정 술어 (Implement-Codex R1 F2 흡수) ────────────────────────────────────
// "turn이 멈췄다"를 두 이벤트에 공용하지 않는다. 그 술어는 두 방향으로 틀린다:
//   - `PreToolUse` 차단이 성공해도 모델이 설명을 이어 말할 수 있다 → 침묵을 요구하면
//     동작하는 프로토콜을 기각한다.
//   - 인증 실패·타임아웃도 침묵과 비영점 종료를 낸다 → 차단이 아닌 것을 차단으로 읽는다.
// 그래서 이벤트마다 **보호 대상 연산**을 따로 정하고, 그것이 일어나지 않았음을 본다.
// 그리고 hook이 실제로 발화했다는 상관(correlation)이 없으면 어떤 판정도 내리지 않는다 —
// crash·timeout·미발화는 전부 `inconclusive`이고 `blocked`가 아니다.
//
// ── 자격증명·격리 (security M4 흡수) ──────────────────────────────────────────
// `finally`는 시그널을 막지 못한다. 스윕은 invocation이 여럿이라 창이 수십 분으로 늘어나므로
// SIGINT/SIGTERM 핸들러가 자격증명 사본을 먼저 지운다. lock은 **invocation 단위**로 잡고
// 놓으며, 살아 있는 소유자는 나이만으로 회수하지 않는다(§3.6 `pr-phase-lock` tri-state).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const cli = require('./cli');
const { makeGate } = require('./redact-gate');

const PROBE_TIMEOUT_MS = 180000;
const LOCK_STALE_MS = 60 * 1000;

// ── 후보 프로토콜 ─────────────────────────────────────────────────────────────
// 이름은 이 저장소가 실제로 쓰는 두 형식 + Claude가 문서화한 permissionDecision이다.
const PROTOCOLS = [
  {
    id: 'stdout-json-block',
    kind: 'stdout-json',
    note: 'receipt-prompt.js 형식 — stdout {"decision":"block"} + exit 0',
    body: 'process.stdout.write(JSON.stringify({decision:"block",reason:MARKER_BLOCK}));process.exit(0);',
  },
  {
    id: 'exit-nonzero-stderr',
    kind: 'exit-nonzero-stderr',
    exitCode: 2,
    note: 'receipt-skill.js 형식 — exit 2 + stderr',
    body: 'process.stderr.write(MARKER_BLOCK);process.exit(2);',
  },
  {
    id: 'hook-specific-deny',
    kind: 'stdout-json',
    note: 'hookSpecificOutput.permissionDecision=deny + exit 0',
    body: 'process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:EVENT,permissionDecision:"deny",permissionDecisionReason:MARKER_BLOCK}}));process.exit(0);',
  },
];

const ALLOW_PROTOCOL = {
  id: 'allow-control',
  kind: 'allow',
  note: '음성 대조 — 같은 hook이 아무것도 방출하지 않고 exit 0',
  body: 'process.exit(0);',
};

// ── 시나리오: 이벤트마다 보호 대상 연산이 다르다 ──────────────────────────────
const SCENARIOS = [
  {
    event: 'UserPromptSubmit',
    // 보호 대상: 프롬프트가 모델에 도달하는 것. 도달하면 모델만이 낼 수 있는 표식이 나온다.
    prompt: function (marker) {
      return 'Reply with exactly this token and nothing else: ' + marker;
    },
    // 표식이 codex stdout에 나타났는가 = 프롬프트가 모델에 도달했다.
    protectedOccurred: function (ctx) {
      return String(ctx.stdout || '').indexOf(ctx.marker) !== -1;
    },
    protectedOpName: 'prompt reached the model',
  },
  {
    event: 'PreToolUse',
    // 보호 대상: 도구가 실제로 실행되는 것. 파일이 생기면 실행됐다.
    prompt: function (marker, ctx) {
      return 'Use the shell to create an empty file at exactly this path, then stop: ' + ctx.sentinelPath;
    },
    protectedOccurred: function (ctx) {
      return fs.existsSync(ctx.sentinelPath);
    },
    protectedOpName: 'tool actually executed',
  },
];

function tmpDir() {
  const r = spawnSync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8', shell: false });
  const gitDir = r.status === 0 ? String(r.stdout).trim() : '.git';
  return path.resolve(gitDir, 'mccp', 'tmp');
}

function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
}

function pidAlive(pid) {
  if (!Number.isFinite(pid)) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err && err.code === 'EPERM'; }
}

// ── invocation 단위 lock ──────────────────────────────────────────────────────
// 살아 있는 소유자는 **나이만으로 회수하지 않는다.** `cli.js`의 판정은
// `alive && age <= 60s`라 180s짜리 호출이 61초에 stale로 읽히고, 그때 남의 scratch home과
// auth 사본이 삭제된다(Implement-Codex R1 F1). 여기서 liveness는 회수를 **막는** 조건이다.
function acquireLock(lockPath, runId) {
  const mine = JSON.stringify({ run_id: runId, pid: process.pid, at: new Date().toISOString() }, null, 2);
  for (;;) {
    try {
      fs.writeFileSync(lockPath, mine, { flag: 'wx' });
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    let body = null;
    try { body = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch (_) { body = null; }
    if (body && pidAlive(body.pid) && body.pid !== process.pid) return false;   // 살아 있으면 절대 뺏지 않는다
    let age = Infinity;
    try { age = Date.now() - fs.statSync(lockPath).mtimeMs; } catch (_) { age = Infinity; }
    if (age <= LOCK_STALE_MS && body && body.pid !== process.pid) return false; // 죽었는지 모르겠고 최근이면 양보
    rmrf(lockPath);                                                             // 죽었고 낡았다 → 회수
  }
}

function releaseLock(lockPath, runId) {
  try {
    const body = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (body && body.run_id === runId) fs.rmSync(lockPath, { force: true });
  } catch (_) { /* 이미 없거나 남의 것 */ }
}

function heartbeat(lockPath) {
  try { const now = new Date(); fs.utimesSync(lockPath, now, now); } catch (_) { /* best-effort */ }
}

// ── 스크래치 홈 ───────────────────────────────────────────────────────────────
function writeHookScript(dir, protocol, event, markerBlock, logPath) {
  const src = [
    "'use strict';",
    'const fs=require("fs");',
    'const EVENT=' + JSON.stringify(event) + ';',
    'const MARKER_BLOCK=' + JSON.stringify(markerBlock) + ';',
    // hook이 실제로 발화했다는 상관 표식. 이것이 없으면 어떤 판정도 하지 않는다.
    'try{fs.appendFileSync(' + JSON.stringify(logPath) + ', JSON.stringify({fired:true,event:EVENT,at:new Date().toISOString()})+"\\n");}catch(_){}',
    protocol.body,
  ].join('\n');
  const p = path.join(dir, 'block-probe-hook.js');
  fs.writeFileSync(p, src, { mode: 0o700 });
  return p;
}

// **trust는 이 축이 아니다.** B1이 묻는 것은 "Codex가 형식 X를 존중하는가"이고 hook이
// 도는지는 M1의 A1이 이미 trusted 경로로 쟀다. 그래서 여기서는 `--dangerously-bypass-hook-trust`
// 로 발화를 확실히 하고 레코드에 `trust_mode:'bypassed'`를 정직하게 적는다. 부수 효과로
// security M6이 지적한 위험(config.toml 중복 append · 현재 저장소의 project hook 무차별
// 승인)을 **아예 지나지 않는다**.

// ── 한 번의 관측 ──────────────────────────────────────────────────────────────
function runOne(opts) {
  const { protocol, scenario, version } = opts;
  const base = tmpDir();
  fs.mkdirSync(base, { recursive: true });
  const runId = 'blk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const lockPath = path.join(base, 'codex-block-probe.lock');
  const home = path.join(base, 'block-probe-home-' + runId);
  const logPath = path.join(base, 'block-probe-fired-' + runId + '.jsonl');
  const sentinelPath = path.join(base, 'block-probe-sentinel-' + runId + '.txt');
  const marker = 'ZZ' + runId.toUpperCase().replace(/[^A-Z0-9]/g, '') + 'ZZ';
  const markerBlock = 'mccp-block-probe refused this ' + scenario.event;

  if (!acquireLock(lockPath, runId)) {
    return { skipped: true, reason: 'another probe holds the lock' };
  }

  // 시그널 경로에서도 자격증명 사본이 남지 않게 한다 (`finally`는 SIGINT를 막지 못한다).
  const cleanup = function () { rmrf(home); rmrf(logPath); rmrf(sentinelPath); releaseLock(lockPath, runId); };
  const onSignal = function () { cleanup(); process.exit(130); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  let result = null;
  try {
    fs.mkdirSync(home, { recursive: true });
    const hookPath = writeHookScript(home, protocol, scenario.event, markerBlock, logPath);
    fs.writeFileSync(
      path.join(home, 'config.toml'),
      cli.buildHooksConfig(process.execPath + ' ' + hookPath, [scenario.event])
    );
    try {
      const data = fs.readFileSync(path.join(os.homedir(), '.codex', 'auth.json'));
      fs.writeFileSync(path.join(home, 'auth.json'), data, { flag: 'wx', mode: 0o600 });
    } catch (_) { /* 부재는 관측값이다 — 인증 실패로 나타난다 */ }

    heartbeat(lockPath);

    const ctx = { marker: marker, sentinelPath: sentinelPath };
    const prompt = scenario.prompt(marker, ctx);
    // `--clean-env`가 기본이다 (security L3): 부모 env를 물려주면 운영자의 env 이름 전량이
    // 관측에 섞이고, 그 산출은 git-tracked 파일로 간다.
    const env = {
      PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, TERM: 'dumb',
      CODEX_HOME: home,
    };
    result = cli.runCodex(['exec', '--dangerously-bypass-hook-trust', prompt], {
      env: env, timeoutMs: PROBE_TIMEOUT_MS,
    });
    heartbeat(lockPath);

    ctx.stdout = result && result.stdout;
    const fired = fs.existsSync(logPath) && fs.readFileSync(logPath, 'utf8').indexOf('"fired":true') !== -1;
    const occurred = scenario.protectedOccurred(ctx);

    return {
      skipped: false,
      run_id: runId,
      protocol: protocol.id,
      protocol_kind: protocol.kind,
      event: scenario.event,
      codex_version: version,
      trust_mode: 'bypassed',
      hook_fired: fired,
      protected_op: scenario.protectedOpName,
      protected_op_occurred: occurred,
      exit_status: result ? result.status : null,
      exit_signal: result ? result.signal : null,
      // **원문은 싣지 않는다** (security M5): redact 관문은 경로만 보고 토큰·계정 식별자
      // 규칙이 0건이다. 관문이 못 보는 것은 관문 뒤에 두지 않는다.
      verdict: classify({ fired: fired, occurred: occurred, protocol: protocol, result: result }),
    };
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    cleanup();
  }
}

// 3값이다. `blocked` / `not-blocked` / `inconclusive` — "아마"에 해당하는 값은 없다.
function classify(o) {
  if (!o.result) return 'inconclusive';
  if (o.result.signal) return 'inconclusive';                 // 타임아웃·강제종료
  if (!o.fired) return 'inconclusive';                        // hook이 안 돌았으면 귀속 불가
  if (o.protocol.kind === 'allow') return o.occurred ? 'not-blocked' : 'inconclusive';
  return o.occurred ? 'not-blocked' : 'blocked';
}

function sweep(opts) {
  const cwd = opts.cwd || process.cwd();
  const version = cli.runCodex ? codexVersion() : null;
  const runs = [];
  for (const scenario of SCENARIOS) {
    // 음성 대조를 **먼저** 돌린다. 통제가 성립하지 않으면 그 이벤트의 차단 관측은
    // 해석 불가이므로 차단 시도에 시간을 쓰지 않는다.
    const control = runOne({ protocol: ALLOW_PROTOCOL, scenario: scenario, cwd: cwd, version: version });
    runs.push(control);
    const controlOk = !control.skipped && control.verdict === 'not-blocked';
    if (!controlOk) continue;
    for (const protocol of PROTOCOLS) {
      runs.push(runOne({ protocol: protocol, scenario: scenario, cwd: cwd, version: version }));
    }
  }
  return { schema: 'mccp.codex-probe.block/1', codex_version: version, runs: runs };
}

function codexVersion() {
  const r = spawnSync(process.env.MCCP_PROBE_CODEX_BIN || 'codex', ['--version'], {
    encoding: 'utf8', shell: false, timeout: 20000,
  });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

module.exports = { PROTOCOLS, ALLOW_PROTOCOL, SCENARIOS, classify, sweep, runOne, acquireLock, releaseLock };

if (require.main === module) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const out = outIdx !== -1 ? args[outIdx + 1] : null;
  const rec = sweep({ cwd: process.cwd() });
  const gate = makeGate({ repoRoot: process.cwd() });
  if (out) {
    const res = gate.writeGuarded({ path: out, data: rec });
    if (!res.written) {
      process.stderr.write('[block-probe] DD10 gate REFUSED write: ' + res.hits.length + ' residual hit(s)\n');
      process.exit(1);
    }
  }
  cli.emitGuarded(gate, rec);
}

// ── Task 8: 실차단 실증 (Metric 2) ────────────────────────────────────────────
//
// B1은 **프로토콜**을 쟀다. 이것은 **실제 게이트**를 잰다 — 합성 payload가 아니라
// `receipt-prompt-submit.js`가 `runGate`를 불러 낸 출력으로 관측한다(security M1).
// 그 구분이 없으면 "형식은 차단하는데 우리 payload는 무효"인 상태가 B1 `measured`와
// 로컬 test green을 모두 통과해 도착한다.
//
// 술어는 B1과 같다. 프롬프트 둘째 줄이 표식을 요구하고, 게이트가 차단하면 모델은 그
// 프롬프트를 보지 못하므로 표식이 나올 수 없다. 정규화는 **첫 줄만** 명령으로 읽으므로
// 둘째 줄은 게이트 판정에 영향을 주지 않는다.
function gateDemo(opts) {
  const repoRoot = (opts && opts.repoRoot) || process.cwd();
  const base = tmpDir();
  fs.mkdirSync(base, { recursive: true });
  const runId = 'demo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  const home = path.join(base, 'gate-demo-home-' + runId);
  const repo = path.join(base, 'gate-demo-repo-' + runId);
  const version = codexVersion();
  const hookPath = path.join(repoRoot, 'plugins', 'mccp', 'scripts', 'hooks', 'receipt-prompt-submit.js');

  const cleanup = function () { rmrf(home); rmrf(repo); };
  const onSignal = function () { cleanup(); process.exit(130); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    // ── 픽스처는 **차단하는 파티션**이어야 한다 ────────────────────────────────
    // 첫 시도는 `/mccp:prp-implement`를 썼고 차단되지 않았다. 결함이 아니라 설계다 —
    // 비-terminal 게이트의 **missing-only** upstream receipt는 v1.3.1 informational
    // ALLOW 경로이고(CLAUDE.md §1.3), 그 경로는 차단이 아니라 컨텍스트 주입 + 통과다.
    // 그래서 terminal `/mccp:pr`을 쓴다 — 그쪽은 receipt 누락에 hard-block이다.
    //
    // 그리고 브랜치가 `master`/`main`이면 decision slug가 generic으로 접혀 v0.2.8
    // 하드블록이 먼저 걸린다(그것도 차단이지만 우리가 재려는 차단이 아니다). feature
    // 브랜치를 만들어 슬러그를 실제 값으로 만든다. 커밋이 없으면 `git rev-parse HEAD`가
    // 실패해 receipt write가 죽으므로 빈 커밋을 하나 둔다.
    fs.mkdirSync(path.join(repo, '.claude', 'plans'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.claude', 'plans', 'demo.plan.md'),
      '# Plan: demo\n\n## Summary\n\ngate demonstration fixture.\n\n## Tasks\n\n### Task 1: none\n');
    const git = function (argv) {
      return spawnSync('git', argv, { cwd: repo, shell: false, encoding: 'utf8' });
    };
    git(['init', '-q']);
    git(['-c', 'user.email=probe@local', '-c', 'user.name=probe', 'commit', '-q', '--allow-empty', '-m', 'init']);
    git(['checkout', '-q', '-b', 'feat/gate-demo']);

    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'config.toml'),
      cli.buildHooksConfig(process.execPath + ' ' + hookPath, ['UserPromptSubmit']));
    try {
      const data = fs.readFileSync(path.join(os.homedir(), '.codex', 'auth.json'));
      fs.writeFileSync(path.join(home, 'auth.json'), data, { flag: 'wx', mode: 0o600 });
    } catch (_) { /* 부재는 인증 실패로 나타난다 */ }

    const observe = function (label) {
      const marker = 'ZZ' + label.toUpperCase().replace(/[^A-Z0-9]/g, '') + runId.toUpperCase().replace(/[^A-Z0-9]/g, '') + 'ZZ';
      const prompt = '/mccp:pr\n'
        + 'Also reply with exactly this token: ' + marker;
      const r = cli.runCodex(['exec', '--dangerously-bypass-hook-trust', prompt], {
        env: {
          PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, TERM: 'dumb',
          CODEX_HOME: home,
          MCCP_HARNESS: 'codex',
          // 실증의 애매함을 없앤다 — 이 저장소는 `soft`를 opt-in 중이지만(§1.2) 그 값은
          // 누락 receipt를 통과시키므로 "차단"을 관측할 수 없다. 스크래치 저장소에서
          // 기본값을 명시한다.
          MCCP_RECEIPT_GATE_MODE: 'hard',
        },
        timeoutMs: PROBE_TIMEOUT_MS,
        cwd: repo,
      });
      const reached = String((r && r.stdout) || '').indexOf(marker) !== -1;
      return {
        phase: label,
        exit_status: r ? r.status : null,
        exit_signal: r ? r.signal : null,
        prompt_reached_model: reached,
        verdict: !r || r.signal ? 'inconclusive' : (reached ? 'passed' : 'blocked'),
      };
    };

    // 1) 선행 receipt 부재 → 차단해야 한다
    const blocked = observe('missing');

    // 2) 음성 대조 — 같은 프롬프트가 receipt를 갖추면 통과해야 한다
    // 통제: `/mccp:pr`이 요구하는 두 선행 receipt를 그 브랜치의 실제 슬러그로 쓴다.
    const receiptCli = path.join(repoRoot, 'plugins', 'mccp', 'scripts', 'receipt', 'cli.js');
    const slugRun = spawnSync(process.execPath, [receiptCli, 'derive-decision', '--command', 'mccp:pr', '--args', ''], {
      cwd: repo, encoding: 'utf8', shell: false,
      env: Object.assign({}, process.env, { MCCP_CODEX_DISABLED: '1' }),
    });
    const slug = slugRun.status === 0 ? String(slugRun.stdout).trim() : null;
    let receiptWritten = Boolean(slug);
    if (slug) {
      ['mccp-plan-codex', 'mccp-implement-codex'].forEach(function (gate) {
        const w = spawnSync(process.execPath, [receiptCli, 'write',
          '--gate', gate, '--decision', slug,
          '--plan', '.claude/plans/demo.plan.md', '--codex-verdict', 'converged', '--quiet'], {
          cwd: repo, encoding: 'utf8', shell: false,
          env: Object.assign({}, process.env, { MCCP_CODEX_DISABLED: '1' }),
        });
        if (w.status !== 0) receiptWritten = false;
      });
    }
    const control = receiptWritten ? observe('receipt-present')
      : { phase: 'receipt-present', verdict: 'inconclusive', reason: 'could not write the control receipt' };

    return {
      schema: 'mccp.codex-probe.gate-demo/1',
      codex_version: version,
      harness_designation: 'MCCP_HARNESS=codex',
      receipt_gate_mode: 'hard',
      ingress: 'receipt-prompt-submit.js (real hook, delegates to runGate)',
      command: '/mccp:pr (terminal gate — hard-blocks on missing receipts)',
      runs: [blocked, control],
      // 양성 하나로는 배선의 실재가 고정되지 않는다 (M1 A4).
      pair_ok: blocked.verdict === 'blocked' && control.verdict === 'passed',
    };
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    cleanup();
  }
}

module.exports.gateDemo = gateDemo;
