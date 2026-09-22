'use strict';

// 실행층 (Task 1). spawn·파일 IO만 하고 판정은 snapshot/report/scan이 한다.
// mirror: `scripts/test-suite/run.js`의 실행/순수 2층 분리.
//
// ── security R1 H2 — 안전 요건 셋이 이 파일에 모인다 ─────────────────────────
// 1. `codex`는 **argv 배열 + `shell:false`** 로만 spawn한다. 셸 문자열 보간 금지.
//    선례: `plugins/mccp/scripts/lib/codex-invoke.js:492-497`.
// 2. `run`은 Task 2·3 시퀀스를 `try/finally`로 감싸 **모든 종료 경로에서** teardown한다.
//    성공 경로만 지우는 것은 teardown이 아니다 — 인증 정지·크래시는 plan Risks가 이미
//    개연으로 적은 경로이고, 그때 0600 auth 사본이 무기한 남는다. **자원을 만드는 단계가
//    전부 그 안에 있어야 이 문장이 참이다** — auth 사본 생성이 `try` 밖에 있던 동안 이
//    항목은 코드가 아니라 의도의 서술이었다(코드 리뷰 M4).
// 3. `teardown`은 **이전 실행의 잔재도** 회수한다(PID + mtime). 직전 호출 직후의 부재만
//    단언하면 중단된 과거 실행은 영원히 안 보인다. 단 `owner`가 주어지면 **남의 실행은
//    건드리지 않는다**(M7) — 회수와 파괴를 가르는 것이 그 인자다.
//
// ── security R1 M2 — trust_mode의 단일 소유 지점이 여기다 ────────────────────
// `probe-hook.js`는 hook 자식이라 부모가 bypass 플래그로 떴는지 볼 수 없다. 그래서
// **CLI 플래그와 `MCCP_PROBE_TRUST_MODE`를 같은 분기에서 함께** 세운다. 두 곳에서 따로
// 세우면 값과 사실이 독립으로 드리프트하고, 그러면 A1 승격 규칙이 기록이 아니라 기억이 된다.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const snapshot = require('./snapshot');
const report = require('./report');
const { makeGate } = require('./redact-gate');
const { createRedactor } = require('../test-suite/redact');

const STALE_MS = 60 * 1000;

// A2가 등록하는 이벤트 이름. **측정 결과이지 가설이 아니다** (코드 리뷰 M2).
//
// 이 자리에는 측정 **전**의 추측 15종이 있었다("mccp가 쓰는 8종 + Codex 어휘일 법한 7종").
// M1이 `<Event> = [ 5 ]` 타입오류 기법으로 `HooksToml`의 실제 필드를 열거한 뒤에도 그 목록이
// 갱신되지 않아, 도구가 두 방향으로 어긋나 있었다: 존재하지 않는 8종을 계속 등록했고
// (미지 필드는 조용히 무시되므로 무해하다), **실재하는 `PostCompact`·`SubagentStart`·
// `SubagentStop` 셋을 등록하지 않았다**. 후자가 문제다 — 문서가 "수용은 확인, 발화는 미확인"
// 으로 열어 둔 바로 그 셋을 도구로는 영원히 관측할 수 없어, 재실행이 문서보다 적게 잰다.
//
// 정본은 `.claude/_meta/data/2026-09-09-codex-harness-truth.json`의
// `runs[id=event-enum].result.fields_present`이고, test가 그 파일에서 기대값을 파생해
// 두 표면이 조용히 갈라지지 못하게 한다.
//
// **완전성을 주장하지 않는다.** 이 열 개는 `codex-cli 0.153.4`가 받는 필드이고, 다른
// 버전에 대해서는 아무 말도 하지 않는다(UI13). 새 버전에서 이름을 다시 재려면 위 기법을
// 쓴다 — 알려진 필드는 타입 오류를 내고 미지 필드는 조용히 통과한다.
const EVENT_CANDIDATES = [
  'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'SessionStart', 'SessionEnd', 'Stop',
  'PreCompact', 'PostCompact', 'SubagentStart', 'SubagentStop',
];

// TOML basic string 이스케이프 (코드 리뷰 M3).
//
// 이 값은 문자열 연결로 `command = "..."` 안에 들어간다. 이스케이프가 없으면 경로의
// `\`(Windows 전량)와 `"`가 TOML을 깨거나 다른 escape로 재해석된다. 실패 모드가 고약한
// 이유는 조용해서다 — config가 무효면 발화가 0이 되고, 그것은 레코드에서 "hook이 발화하지
// 않는다"와 **같은 모양**이다. 계측기가 자기 측정을 오염시킨다.
//
// **남는 위험은 명시한다**: 이 함수는 TOML 층만 책임진다. `command`가 문자열이므로 호스트가
// 그것을 어떻게 분해하는지(셸 경유인가 argv 분리인가)는 M1이 측정하지 않았고, 따라서 공백이
// 든 경로는 TOML을 통과해도 실행 층에서 갈릴 수 있다. 그 축은 측정 대상이지 가정 대상이 아니다.
function tomlBasicString(s) {
  return '"' + String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    + '"';
}

// `[hooks]` 블록 생성. 순수 함수라 test가 실제 spawn 없이 형태를 단언한다.
function buildHooksConfig(command, events) {
  const list = Array.isArray(events) ? events : EVENT_CANDIDATES;
  const quoted = tomlBasicString(command);
  return ['[hooks]'].concat(list.map(function (e) {
    return e + ' = [ { matcher = "*", hooks = [ { type = "command", command = ' + quoted + ' } ] } ]';
  })).concat(['']).join('\n');
}


// ── A1 — 비대화형 trust 승인 (M1 종료 축) ───────────────────────────────────
// M1의 첫 측정은 발화를 6건 보고도 A1을 접었다. 전부 `--dangerously-bypass-hook-trust`
// 였고, "신뢰 절차를 지나 발화한다"와 "신뢰 절차를 껐다"는 다른 사실이기 때문이다.
// 비대화형 승인 경로가 **없다고** 판정한 것이 아니라 **찾지 못했다**고 적었고, 여기가
// 그 값이다.
//
// 경로는 셋이 맞물린다:
//   1. `config.toml`의 `[hooks.state."<key>"] { enabled, trusted_hash }`가 trust 기록이다.
//      스키마는 타입 오류로 확정했다 — `hooks.state`는 map, 그 값은 struct HookStateToml.
//   2. `<key>`와 기대 hash를 **추측하지 않는다.** app-server의 `hooks/list`가 hook마다
//      `key` · `currentHash` · `trustStatus`를 그대로 준다. 우리가 계산하면 Codex의
//      산식이 바뀌는 날 조용히 어긋나고, 그 어긋남은 "발화 0"과 같은 모양이라 계측기가
//      자기 측정을 오염시킨다(`buildHooksConfig`의 이스케이프와 같은 실패 모드).
//   3. `-c hooks.state."<key>"=...` **CLI override로는 안 된다** — key가 config.toml의
//      절대경로를 담아 점을 포함하므로 dotted-path 파서가 그것을 쪼갠다. 파일에 쓴다.
//
// **음성 대조로 이 배선이 실재함을 고정한다**: hash를 한 글자 틀리면 `trustStatus`는
// `modified`가 되고 발화는 0이다. 즉 이 함수가 승인하지 않으면 hook은 돌지 않는다.
function listHooks(home, cwd, timeoutMs) {
  // M3.5 — 단일 원본으로 이전됐다. 제품 CLI(`codex-bootstrap.js`)도 같은 파일을 부르므로
  // 사본을 두면 갈라진다. 프로브는 배포 트리 밖이고 그 파일은 안이라 방향은 이쪽이다.
  const client = path.resolve(__dirname, '..', '..', 'plugins', 'mccp', 'scripts', 'lib', 'codex-hooks-list.js');
  const r = spawnSync(process.execPath, [client, home, cwd], {
    encoding: 'utf8',
    shell: false,
    timeout: timeoutMs || 60000,
    env: Object.assign({}, process.env, { CODEX_HOME: home }),
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) return { ok: false, reason: 'hooks/list exited ' + r.status, hooks: [] };
  let parsed;
  try { parsed = JSON.parse(String(r.stdout || '')); } catch (err) {
    return { ok: false, reason: 'hooks/list output unparsable: ' + err.message, hooks: [] };
  }
  const entries = (parsed && parsed.data) || [];
  const hooks = [];
  entries.forEach(function (e) {
    (e.hooks || []).forEach(function (h) {
      if (h && typeof h.key === 'string' && typeof h.currentHash === 'string') hooks.push(h);
    });
  });
  return { ok: true, reason: null, hooks: hooks };
}

// 승인 기록을 config.toml에 덧붙인다. **관측한 hook만** 승인한다 — 목록에 없는 것을
// 미리 승인할 수단이 없고, 있어도 그것은 승인이 아니라 추측이다.
// key의 첫 구간은 **선언원**이다 — config hook이면 `config.toml`의 절대경로, plugin hook이면
// `<plugin>@<marketplace>`. 전자를 그대로 레코드에 실으면 DD10 관문이 `posix-home`으로
// 거부한다(실측: 10건 전부). 관문을 넓히는 대신 값을 줄인다 — 이 필드가 답해야 하는 것은
// "무엇이 승인됐는가"이고, 그것은 파일명과 이벤트·색인이면 성립한다. 절대경로는 감사값이
// 없고(스크래치 home은 teardown으로 사라진다) 유출값만 있다.
function shortHookKey(key) {
  const i = String(key).indexOf(':');
  if (i < 0) return String(key);
  const origin = String(key).slice(0, i);
  const rest = String(key).slice(i + 1);
  const base = origin.includes('/') || origin.includes('\\') ? path.basename(origin) : origin;
  return base + ':' + rest;
}

function grantHookTrust(home, cwd, timeoutMs) {
  const listed = listHooks(home, cwd, timeoutMs);
  if (!listed.ok) return { granted: 0, ok: false, reason: listed.reason, keys: [] };
  if (listed.hooks.length === 0) {
    return { granted: 0, ok: false, reason: 'hooks/list returned no hooks — nothing to trust', keys: [] };
  }
  const block = buildTrustBlock(listed.hooks);
  fs.appendFileSync(path.join(home, 'config.toml'), block.toml);
  return { granted: block.keys.length, ok: true, reason: null, keys: block.keys };
}

// TOML 조립은 순수 함수라 test가 실제 spawn 없이 형태를 단언한다 —
// `buildHooksConfig`와 같은 이유이고, 그 이유가 여기서 더 무겁다: 이 블록이 어긋나면
// 발화가 0이 되고 그것은 "hook이 발화하지 않는다"와 **같은 모양**이다.
function buildTrustBlock(hooks) {
  const lines = [''];
  const keys = [];
  hooks.forEach(function (h) {
    lines.push('[hooks.state.' + tomlBasicString(h.key) + ']');
    lines.push('enabled = true');
    lines.push('trusted_hash = ' + tomlBasicString(h.currentHash));
    lines.push('');
    keys.push(shortHookKey(h.key));
  });
  return { toml: lines.join('\n'), keys: keys };
}

function gitPath(rel) {
  const r = spawnSync('git', ['rev-parse', '--git-path', rel], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('git rev-parse failed: ' + (r.stderr || '').trim());
  return r.stdout.trim();
}

function tmpDir() {
  const d = gitPath('mccp/tmp');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function scratchHome() { return path.join(tmpDir(), 'codex-probe-home'); }
function authCopy() { return path.join(scratchHome(), 'auth.json'); }
function runLock() { return path.join(tmpDir(), 'codex-probe-run.json'); }
function defaultLog() { return path.join(tmpDir(), 'codex-probe.jsonl'); }

function codexBin() { return process.env.MCCP_PROBE_CODEX_BIN || 'codex'; }

// argv 배열 + shell:false. 문자열 보간 경로를 이 파일에 만들지 않는다.
//
// **stdin은 반드시 닫힌 채로 간다.** `spawnSync`는 `input`이 없으면 stdin 파이프를 즉시
// EOF로 닫으므로 여기서는 저절로 성립하지만, 같은 명령을 셸에서 손으로 부르면 터미널
// stdin을 물려받아 `codex exec`가 "Reading additional input from stdin..."에서 멎는다
// (M3에서 실측 — 타임아웃까지 0바이트). 프로브 밖에서 재현할 때는 `< /dev/null`을 붙여라.
function runCodex(args, opts) {
  const o = opts || {};
  return spawnSync(codexBin(), args, {
    encoding: 'utf8',
    shell: false,
    timeout: o.timeoutMs || 120000,
    env: o.env || process.env,
    cwd: o.cwd,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function codexVersion() {
  const r = runCodex(['--version'], { timeoutMs: 20000 });
  if (r.status !== 0) return null;
  const m = String(r.stdout || '').trim().match(/([0-9]+\.[0-9]+\.[0-9]+)/);
  return m ? m[1] : null;
}

function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err && err.code === 'EPERM'; }
}

// 잔재 회수. `(PID dead) OR (mtime > 60s)`는 §3.6의 관용구다 — clock skew와 PID 재사용
// 양쪽에 강인하다. `--force`는 살아 있는 실행도 지운다(운영자 명시 의사).
//
// **`owner`가 주어지면 소유권이 `force`를 이긴다** (코드 리뷰 M7). lock body에 `run_id`를
// 싣고도 대조하지 않아, `cmdRun`의 finally가 항상 `force:true`로 부르면 그 사이 시작한
// 다른 프로브의 scratch home까지 지웠다. §3.6이 state lock에 ownership token을 요구하는
// 이유가 정확히 이 실패 모드다. `owner`와 holder의 `run_id`가 다르면 **아무것도 지우지
// 않는다** — 그 자원은 남의 것이고, 남의 것을 지우는 것은 회수가 아니라 파괴다.
function teardown(opts) {
  const o = opts || {};
  const lock = runLock();
  const home = scratchHome();
  let holder = null;
  try { holder = JSON.parse(fs.readFileSync(lock, 'utf8')); } catch (_) { holder = null; }

  if (o.owner && holder && holder.run_id && holder.run_id !== o.owner) {
    return {
      removed: false,
      reason: 'run lock is held by another run — refusing to remove its scratch home',
      owner_mismatch: true,
    };
  }

  let stale = true;
  let reason = 'no run lock';
  if (holder) {
    const age = Date.now() - Date.parse(holder.at || 0);
    const alive = pidAlive(holder.pid);
    stale = !alive || age > STALE_MS;
    reason = alive ? (stale ? 'lease expired (' + age + 'ms)' : 'holder alive') : 'holder pid dead';
  }
  if (!stale && !o.force) {
    return { removed: false, reason: reason, hint: 'pass --force to remove a live run' };
  }
  // auth 사본을 **먼저** 지운다 — 뒤이은 rmrf가 실패해도 자격증명은 남지 않는다.
  rmrf(authCopy());
  rmrf(home);
  rmrf(lock);
  return {
    removed: true,
    reason: reason,
    scratch_home_absent: !fs.existsSync(home),
    auth_copy_absent: !fs.existsSync(authCopy()),
  };
}

function readJsonl(p) {
  let raw = '';
  try { raw = fs.readFileSync(p, 'utf8'); } catch (_) { return []; }
  return raw.split(/\r?\n/).filter(Boolean).map(function (l) {
    try { return JSON.parse(l); } catch (_) { return { _unparsed_line: true }; }
  });
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function flag(args, name, dflt) {
  const i = args.indexOf(name);
  return i === -1 || !args[i + 1] ? dflt : args[i + 1];
}

// stdout도 산출 채널이다 (코드 리뷰 M1).
//
// DD10 관문은 `--out`이 있을 때만 걸려 있었는데 `--out` 미지정이 **기본값**이다. 즉
// `redact-gate.js`가 선언한 "관문이 하나면 그 구멍은 구조적으로 존재하지 않는다"가 가장
// 흔한 호출 형태에서 거짓이었다. 파일이든 stdout이든 같은 오라클을 지난다.
function emitGuarded(gate, data) {
  const serialized = require('./redact-gate').serialize(data);
  const verdict = gate.inspectPayload(data, serialized);
  if (!verdict.ok) {
    process.stderr.write('[codex-probe] DD10 gate REFUSED stdout: '
      + verdict.hits.length + ' residual hit(s)'
      + (verdict.truncated ? ' (scan truncated)' : '') + '\n');
    // 진단에도 경로 원문은 없다 — `hits[i]`는 `{at, rule, length}`뿐이다.
    process.stderr.write(JSON.stringify({ hits: verdict.hits }) + '\n');
    process.exit(1);
  }
  process.stdout.write(serialized);
}

function cmdSnapshot(args) {
  const kind = flag(args, '--kind', 'scratch');
  const home = flag(args, '--home', kind === 'real' ? path.join(os.homedir(), '.codex') : scratchHome());
  const out = flag(args, '--out', null);
  const gate = makeGate({ repoRoot: process.cwd() });
  // 생산자 쪽 1차 방어. `plugin_cache_entries`는 snapshot.js가 이미 codexHome **상대경로**로
  // 만들어 절대경로를 구성하지 않지만(C1의 구조적 해소), redactor를 함께 넘겨 실제 홈을 잴 때
  // 남는 문자열까지 접는다. 최종 판정은 아래 DD10 관문이 한다 — 관문은 값을 고치지 않으므로
  // 생산자가 접지 않은 것은 통과하지 못하고 **쓰기가 거부된다**.
  const snap = snapshot.capture({
    codexHome: home,
    kind: kind,
    codexVersion: codexVersion(),
    redactor: createRedactor({ repoRoot: process.cwd() }),
  });
  if (out) {
    const res = gate.writeGuarded({ path: out, data: snap });
    if (!res.written) {
      process.stderr.write('[codex-probe] DD10 gate REFUSED write: ' + res.hits.length + ' residual hit(s)\n');
      process.exit(1);
    }
    process.stderr.write('[codex-probe] snapshot -> ' + path.basename(out) + '\n');
  } else {
    emitGuarded(gate, snap);
  }
}

function cmdReport(args) {
  const log = readJsonl(flag(args, '--log', defaultLog()));
  const before = readJson(flag(args, '--before', ''));
  const after = readJson(flag(args, '--after', ''));
  const observations = readJson(flag(args, '--observations', '')) || {};
  // M2 B축 입력. plan Validation 4·5는 `report --in <file>`을 불렀는데 그런 플래그는
  // 존재한 적이 없어 **조용히 기본 로그를 읽었다** — 검사가 아무것도 검사하지 않았다.
  // 이름을 지어내는 대신 실제 입력 둘을 각각 받는다.
  const block = readJson(flag(args, '--block', ''));
  const truth = readJson(flag(args, '--truth', ''));
  const rec = report.deriveReport({
    log: log,
    before: before,
    after: after,
    diff: snapshot.diff(before, after),
    observations: observations,
    block: block,
    truth: truth,
  });
  const out = flag(args, '--out', null);
  const gate = makeGate({ repoRoot: process.cwd() });
  if (out) {
    const res = gate.writeGuarded({ path: out, data: rec });
    if (!res.written) {
      process.stderr.write('[codex-probe] DD10 gate REFUSED write: ' + res.hits.length + ' residual hit(s)\n');
      process.exit(1);
    }
  }
  emitGuarded(gate, rec);
  // 축이 접혔다고 exit 비영점을 내지 않는다 — `unmeasured`는 정상 산출이다(DD7).
}

// Task 2·3의 라이브 계측. 어떤 종료 경로에서도 teardown이 돈다.
function cmdRun(args) {
  const entrypoint = flag(args, '--entrypoint', 'exec');
  const bypass = args.indexOf('--bypass-hook-trust') !== -1;
  const prompt = flag(args, '--prompt', 'reply with the single word ok');
  const home = scratchHome();
  const log = flag(args, '--log', defaultLog());
  const version = codexVersion();
  const runId = 'probe-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  // ── M7: 남의 실행을 덮어쓰지 않는다 ─────────────────────────────────────────
  // lock을 무조건 덮어쓰면 먼저 돌던 프로브가 자기 lock을 잃고, 그 실행의 finally가
  // 우리 자원을 지우거나 우리 finally가 그쪽 자원을 지운다. 살아 있는 남의 lock을 보면
  // 시작하지 않는다. `at`이 파손됐는데 pid가 살아 있으면 **살아 있는 쪽으로** 판정한다.
  const existing = readJson(runLock());
  if (existing && existing.run_id !== runId) {
    const parsedAt = Date.parse(existing.at || '');
    const live = pidAlive(existing.pid)
      && (!Number.isFinite(parsedAt) || Date.now() - parsedAt <= STALE_MS);
    if (live) {
      process.stderr.write('[codex-probe] another probe run holds the run lock (run_id='
        + String(existing.run_id) + ') — refusing to start.\n'
        + '[codex-probe]   wait for it, or reclaim with: cli.js teardown --force\n');
      return process.exit(1);
    }
  }

  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(runLock(), JSON.stringify({ run_id: runId, pid: process.pid, at: new Date().toISOString() }, null, 2));

  // ── M4: 자원을 만드는 모든 단계가 try 안에 있다 ─────────────────────────────
  // 이 `try`는 원래 `runCodex` 한 줄만 감쌌고, 그 앞에서 **0600 auth 사본**을 만들었다.
  // 헤더 주석은 "모든 종료 경로에서 teardown한다"고 단언하는데 자격증명을 만드는 단계가
  // 그 밖에 있었으므로 그 단언이 거짓이었다. config 쓰기와 auth 복사를 안으로 들인다.
  let result;
  let authCopied = false;
  let trustMode;
  let trustGrant = null;
  let cleanEnv = false;
  try {
    // [hooks] 등록. probe-hook의 절대경로가 필요하지만 이 파일은 config.toml(scratch home,
    // git-dir 아래)에만 들어가고 tracked 산출물에는 가지 않는다.
    const hookPath = path.resolve(__dirname, 'probe-hook.js');
    // ── 스키마는 실측으로 확정했다 (Task 2-0 · A2) ─────────────────────────────
    // `[hooks]`는 **struct**(HooksToml)이고 그 필드가 **시퀀스**다. 초기 시도
    // `Event = { command = [...] }`는 `invalid type: map, expected a sequence in \`hooks\``로,
    // `[[hooks]]`/`hooks = [...]`는 `invalid type: sequence, expected struct HooksToml`로 거부됐다.
    // 통과하는 형태는 `Event = [ { command = [...] } ]`이다.
    //
    // 그리고 **파싱 통과는 발화가 아니다** — 같은 자리에서 Claude 중첩 형태
    // (`[{matcher, hooks:[{type,command}]}]`)와 `[{type, command}]`도 함께 통과했다.
    // 파서가 관대하다는 뜻이므로 A2의 `measured` 조건은 여전히 "수용"이 아니라 "발화"다.
    // 최종 형태. 각 층의 이름은 파서가 오류 메시지로 알려준 것을 그대로 쓴다:
    //   hooks            → struct HooksToml (필드는 이벤트 이름, **미지 이름은 조용히 무시된다**)
    //   <Event>          → sequence of MatcherGroup
    //   MatcherGroup     → { matcher: string, hooks: [HookHandlerConfig] } — 필드 전부 optional
    //   HookHandlerConfig→ internally tagged enum, variant는 command|mcp_tool|prompt|agent
    //   command variant  → `command`가 필수이고 **배열이 아니라 문자열**이다
    //
    // 이 형태를 찾기 전 시도한 `<Event> = [ { command = [...] } ]`는 **파싱은 통과했다** —
    // MatcherGroup의 필드가 전부 optional이고 미지 필드를 무시하므로 "hook이 하나도 없는 빈
    // matcher group"이 됐고, 그래서 config는 유효한데 발화가 0이었다. 파싱 통과를 발화의
    // 증거로 쓰면 안 되는 이유가 여기 실측으로 있다.
    const cmd = process.execPath + ' ' + hookPath;
    fs.writeFileSync(path.join(home, 'config.toml'), buildHooksConfig(cmd));

    // ── DD9 — 자격증명 사본은 계측의 일부이므로 계측처럼 다룬다 ──────────────────
    // 격리 home에는 auth.json이 없어 모델 호출 경로가 인증에서 멎는다. 사본은 git-dir tmp
    // 안에만 두고 finally의 teardown이 지운다.
    //
    // **생성 수단을 명시한다** (security R1 M1): `fs.copyFileSync`의 mode 보존은 이 호스트에서
    // 실측되나 Node 공개 API의 보장이 아니라 파일시스템에 따라 갈릴 수 있다. 이 저장소가 비밀
    // 파일마다 쓰는 원자적 관용구를 그대로 쓴다 — mirror: `pr-phase-lock.js:470` ·
    // `codex-policy.js:123`.
    const srcAuth = path.join(os.homedir(), '.codex', 'auth.json');
    try {
      const data = fs.readFileSync(srcAuth);
      fs.writeFileSync(authCopy(), data, { flag: 'wx', mode: 0o600 });
      authCopied = true;
    } catch (_) { /* 부재·이미 존재는 관측값이다 — 인증 실패로 나타난다 */ }

    // ── M2: 플래그와 trust_mode를 **같은 분기에서** 세운다 ──────────────────────
    //
    // **`trusted`는 이제 주장이 아니라 결과다** (A1). 이전에는 bypass 플래그가 없기만 하면
    // 이 값이 `trusted`가 됐는데, 그때 hook은 실제로 승인되지 않아 발화가 0이었다 — 즉
    // 값은 `trusted`인데 신뢰 절차를 지난 발화는 하나도 없는 상태를 레코드가 구분하지
    // 못했다. 승인이 실제로 기록됐을 때만 `trusted`를 쓰고, 그러지 못하면 `untrusted`다.
    // A1의 승격 규칙이 `trusted` 줄만 보므로 이 구분이 곧 축의 정직성이다.
    const argv = [entrypoint];
    if (bypass) {
      argv.push('--dangerously-bypass-hook-trust');
      trustMode = 'bypassed';
    } else {
      trustGrant = grantHookTrust(home, process.cwd());
      trustMode = trustGrant.granted > 0 ? 'trusted' : 'untrusted';
      if (!trustGrant.ok) {
        process.stderr.write('[codex-probe] hook trust NOT granted: ' + trustGrant.reason + '\n');
      } else {
        process.stderr.write('[codex-probe] hook trust granted for ' + trustGrant.granted + ' hook(s)\n');
      }
    }
    argv.push(prompt);

    cleanEnv = args.indexOf('--clean-env') !== -1;
    // 상속 교란 제거(A5). 부모 env를 물려주면 "Codex가 주입했다"와 "부모가 갖고 있었다"를
    // 구분할 수 없다 — 첫 실측에서 CLAUDE_* 13개가 그렇게 섞였다. PATH/HOME은 codex 실행에
    // 필요한 최소값이라 남긴다.
    const base = cleanEnv
      ? { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, TERM: 'dumb' }
      : Object.assign({}, process.env);
    const env = Object.assign(base, {
      CODEX_HOME: home,
      PROBE_LOG: log,
      MCCP_PROBE_RUN_ID: runId,
      MCCP_PROBE_TRUST_MODE: trustMode,
      MCCP_PROBE_CODEX_VERSION: version || '',
      MCCP_PROBE_ENTRYPOINT: entrypoint,
      MCCP_PROBE_REPO_ROOT: process.cwd(),
    });

      result = runCodex(argv, { env: env, timeoutMs: 180000 });
  } finally {
    // `owner`를 넘겨 **우리 실행의 자원만** 회수한다(M7).
    const td = teardown({ force: true, owner: runId });
    process.stderr.write('[codex-probe] teardown: ' + JSON.stringify(td) + '\n');
  }

  // ── M8: stderr는 절단이 아니라 redact로 다룬다 ──────────────────────────────
  // 이 자리의 주석은 "인증 오류가 토큰 조각을 담을 수 있다"며 400자 절단을 근거로 들었는데,
  // 절단은 **앞부분을 남긴다** — 오류 배너의 `CODEX_HOME` 절대경로도 토큰 조각도 대개
  // 거기 있다. 절단은 크기 상한이지 유출 통제가 아니다. redactor를 태우고 나서 자른다.
  const redactor = createRedactor({ repoRoot: process.cwd() });
  const stderrHead = result && result.stderr
    ? redactor.redactText(String(result.stderr)).slice(0, 400)
    : null;

  emitGuarded(makeGate({ repoRoot: process.cwd() }), {
    run_id: runId,
    entrypoint: entrypoint,
    trust_mode: trustMode,
    // 승인이 일어났는지를 레코드가 스스로 말한다. `trust_mode`만 있으면 `untrusted`가
    // "승인을 시도했는데 실패했다"인지 "애초에 hook이 없었다"인지 구분되지 않는다.
    hook_trust: trustGrant,
    clean_env: cleanEnv,
    codex_version: version,
    status: result ? result.status : null,
    signal: result ? result.signal : null,
    stderr_head: stderrHead,
    auth_copy_used: authCopied,
    log_lines: readJsonl(log).length,
  });
}

function main() {
  const args = process.argv.slice(2);
  const sub = args[0];
  if (sub === 'snapshot') return cmdSnapshot(args);
  if (sub === 'report') return cmdReport(args);
  if (sub === 'teardown') {
    // `--verify`는 **read-only**다. plan Validation 10이 이 플래그로 "격리 잔재 부재"를
    // 확인하려 했는데 `main()`은 `--force`만 알았고, 결과적으로 그 검사는 파괴적 teardown을
    // 실행하면서 남의 live run이 lock을 쥐고 있으면 exit 1(=잔재 있음)로 읽혔다.
    // 검사와 파괴를 가른다.
    if (args.indexOf('--verify') !== -1) {
      const residue = [scratchHome(), authCopy(), runLock()].filter(function (p) {
        try { return fs.existsSync(p); } catch (_) { return false; }
      });
      process.stdout.write(JSON.stringify({ clean: residue.length === 0, residue: residue.map(function (p) { return path.basename(p); }) }, null, 2) + '\n');
      return process.exit(residue.length === 0 ? 0 : 1);
    }
    const res = teardown({ force: args.indexOf('--force') !== -1 });
    process.stdout.write(JSON.stringify(res, null, 2) + '\n');
    return process.exit(res.removed ? 0 : 1);
  }
  if (sub === 'run') return cmdRun(args);
  if (sub === 'gate-demo') {
    const bp = require('./block-probe');
    const outIdx = args.indexOf('--out');
    const out = outIdx !== -1 ? args[outIdx + 1] : null;
    const rec = bp.gateDemo({ repoRoot: process.cwd() });
    const gate = makeGate({ repoRoot: process.cwd() });
    if (out) {
      const res = gate.writeGuarded({ path: out, data: rec });
      if (!res.written) {
        process.stderr.write('[codex-probe] DD10 gate REFUSED write: ' + res.hits.length + ' residual hit(s)\n');
        return process.exit(1);
      }
    }
    emitGuarded(gate, rec);
    return process.exit(rec.pair_ok ? 0 : 1);
  }
  if (sub === 'block') {
    // 계측 본문은 block-probe.js가 소유한다. 여기서는 진입점만 잇는다.
    const bp = require('./block-probe');
    const outIdx = args.indexOf('--out');
    const out = outIdx !== -1 ? args[outIdx + 1] : null;
    const rec = bp.sweep({ cwd: process.cwd() });
    const gate = makeGate({ repoRoot: process.cwd() });
    if (out) {
      const res = gate.writeGuarded({ path: out, data: rec });
      if (!res.written) {
        process.stderr.write('[codex-probe] DD10 gate REFUSED write: ' + res.hits.length + ' residual hit(s)\n');
        return process.exit(1);
      }
    }
    emitGuarded(gate, rec);
    return;
  }
  if (sub === 'reach') {
    // C축 계측. 본문은 reach-probe.js가 소유하고 여기서는 진입점만 잇는다 —
    // `block`과 같은 형태다. **모든 산출은 DD10 관문을 지난다**: 이 스윕은 plugin root
    // 절대경로를 재는 것이 목적이라 지금까지 중 가장 위험한 producer다(security S7).
    const rp = require('./reach-probe');
    const outIdx = args.indexOf('--out');
    const out = outIdx !== -1 ? args[outIdx + 1] : null;
    const onlyIdx = args.indexOf('--only');
    const only = onlyIdx !== -1 && args[onlyIdx + 1] ? args[onlyIdx + 1].split(',') : null;
    const rec = rp.sweep({ cwd: process.cwd(), only: only });
    const gate = makeGate({ repoRoot: process.cwd() });
    if (out) {
      const res = gate.writeGuarded({ path: out, data: rec });
      if (!res.written) {
        process.stderr.write('[codex-probe] DD10 gate REFUSED write: ' + res.hits.length + ' residual hit(s)\n');
        return process.exit(1);
      }
    }
    emitGuarded(gate, rec);
    return;
  }
  process.stderr.write('usage: cli.js <snapshot|report|teardown|run|block|gate-demo|reach> [...]\n');
  process.exit(2);
}

module.exports = {
  teardown, scratchHome, authCopy, runLock, defaultLog, pidAlive, STALE_MS, runCodex,
  EVENT_CANDIDATES, tomlBasicString, buildHooksConfig, emitGuarded,
  shortHookKey, buildTrustBlock,
};

if (require.main === module) main();
