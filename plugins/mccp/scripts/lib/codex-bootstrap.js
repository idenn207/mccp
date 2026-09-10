'use strict';

// Codex 하네스 부트스트랩 — 설치 상태 진단 + 멱등 hook-trust 승인 + 발화 검증
// (codex-harness-portability M3.5).
//
// **무엇을 여는가.** M1~M3가 만든 것(비대화형 trust 승인 경로 · `run-command` skill ·
// `command-reach.js` 해소 오라클)은 전부 프로브와 저장소 안에만 있었다. 이 파일은 그 중
// trust 승인을 **제품 표면으로 승격**해서, 운영자가 한 번 돌리면 Codex에서 mccp가
// 실제로 발화하는 상태가 되게 한다. 새 능력은 열지 않는다.
//
// **왜 프로브 함수를 그대로 쓰지 않는가 (R1 security/HIGH · L3 high).**
// `scripts/codex-probe/cli.js#grantHookTrust`는 `hooks/list` 반환 **전량**에
// `enabled = true` + `trusted_hash`를 append한다. 그것은 매 실행 새로 만드는 스크래치
// home에서만 안전하다 — 실사용 `~/.codex/config.toml`에 같은 짓을 하면 운영자의
// **서드파티 hook 전부**를 무차별 승인하는 권한 상승이고, 승인 후 본문이 바뀐
// `modified` hook(= trust 모델이 존재하는 이유인 변조 신호)까지 함께 신뢰하게 된다.
// 그래서 여기서는 세 조건을 모두 만족하는 hook만 승인한다 (`selectTrustable`).
//
// **성공 조건은 발화 축에 결속한다 (R1 architect/test/invariant HIGH · L3 high).**
// 파일이 해소된다는 사실은 hook이 발화한다는 사실이 **아니다**. `command-reach.js`의
// `verify()`는 hook·trust·hash를 한 번도 읽지 않고, codex 캐시가 비면 claude 캐시로
// 폴백하며, `ROOT_ENV_NAMES`가 캐시 후보보다 먼저 온다. 그래서 `bootstrap --apply`의
// exit 0은 (i) `hooks/list`가 mccp hook을 `trusted`로 보고하고 (ii) `verify()`의
// `rootSource`가 `R-d:codex-cache`일 때만 나온다.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const MCCP_PLUGIN_NAME = 'mccp';

// `command-reach.js`가 root 후보로 읽는 env. 축 (ii)를 돌릴 때 자식 프로세스에서
// **지워야** 하는 이름들 — 남아 있으면 검증 대상이 Codex 설치 트리가 아니라 개발
// 워크트리가 된다(R1 security/MEDIUM).
const REACH_ENV_TO_CLEAR = [
  'MCCP_PLUGIN_ROOT',
  'CLAUDE_PLUGIN_ROOT',
  'CODEX_PLUGIN_ROOT',
  'MCCP_PLUGIN_ROOT_HINT',
];

// ── 순수 단계 ────────────────────────────────────────────────────────────────
// 아래 넷은 fs·spawn을 만지지 않는다. test가 실제 Codex 없이 형태를 단언한다 —
// 이 조립이 어긋나면 발화가 0이 되고 그것은 "hook이 없다"와 **같은 모양**이라
// 계측기가 자기 측정을 오염시킨다(`buildTrustBlock`과 같은 실패 모드).

function tomlBasicString(s) {
  return '"' + String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    + '"';
}

// key의 첫 구간은 **선언원**이다 — config hook이면 `config.toml`의 절대경로,
// plugin hook이면 `<plugin>@<marketplace>`. 전자를 그대로 레코드에 실으면 DD10
// 관문이 `posix-home`으로 거부한다. 관문을 넓히는 대신 값을 줄인다.
function shortHookKey(key) {
  const i = String(key).indexOf(':');
  if (i < 0) return String(key);
  const origin = String(key).slice(0, i);
  const rest = String(key).slice(i + 1);
  const base = origin.includes('/') || origin.includes('\\') ? path.basename(origin) : origin;
  return base + ':' + rest;
}

// 선언원이 mccp plugin인가. plugin hook의 key는 `<plugin>@<marketplace>:...` 형태이고
// config hook은 그 자리에 절대경로를 담는다 — 후자는 우리 소유가 아니다.
function isMccpDeclared(key) {
  const i = String(key).indexOf(':');
  if (i < 0) return false;
  const origin = String(key).slice(0, i);
  if (origin.includes('/') || origin.includes('\\')) return false;   // config.toml 선언
  return origin.split('@')[0] === MCCP_PLUGIN_NAME;
}

// `[hooks.state."<key>"]` 블록만 골라 파싱한다. 완전한 TOML 파서가 아니다 —
// 알아야 하는 것은 (a) 어느 key가 이미 기록돼 있는가, (b) 그 블록의 `enabled`가
// 무엇인가, (c) 그 블록이 원문의 어느 줄 범위를 차지하는가 셋뿐이다.
function parseHookStateBlocks(toml) {
  const lines = String(toml == null ? '' : toml).split(/\r?\n/);
  const blocks = [];
  let cur = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const header = line.match(/^\s*\[([^\]]*)\]\s*$/);
    if (header) {
      if (cur) { cur.end = i - 1; blocks.push(cur); cur = null; }
      const inner = header[1].trim();
      const m = inner.match(/^hooks\.state\.("(?:[^"\\]|\\.)*")$/);
      if (m) {
        let key;
        try { key = JSON.parse(m[1]); } catch (_) { key = null; }
        if (key !== null) cur = { key: key, start: i, end: lines.length - 1, enabled: null };
      }
      continue;
    }
    if (cur) {
      const en = line.match(/^\s*enabled\s*=\s*(true|false)\s*$/);
      if (en) cur.enabled = en[1] === 'true';
    }
  }
  if (cur) blocks.push(cur);
  return blocks;
}

// 승인 대상 선별 — **세 조건을 모두** 만족하는 것만. 나머지는 사유와 함께 보고한다.
// 조용히 거르면 운영자는 왜 발화가 0인지 알 수 없고, 조용히 승인하면 그것이 권한 상승이다.
function selectTrustable(hooks, existingToml) {
  const existing = parseHookStateBlocks(existingToml);
  const disabled = new Set(existing.filter(function (b) { return b.enabled === false; })
    .map(function (b) { return b.key; }));
  const grant = [];
  const skipped = [];
  (Array.isArray(hooks) ? hooks : []).forEach(function (h) {
    if (!h || typeof h.key !== 'string' || typeof h.currentHash !== 'string') {
      skipped.push({ key: h && h.key ? shortHookKey(h.key) : '(unnamed)', reason: 'incomplete hooks/list entry' });
      return;
    }
    const short = shortHookKey(h.key);
    if (!isMccpDeclared(h.key)) {
      skipped.push({ key: short, reason: 'not-declared-by-mccp' });
      return;
    }
    // `modified`는 승인 후 본문이 바뀌었다는 신호다. 그것을 덮는 것은 승인이 아니라 은폐다.
    if (h.trustStatus === 'modified') {
      skipped.push({ key: short, reason: 'trust-status-modified' });
      return;
    }
    // 운영자가 명시적으로 끈 것을 켜는 것은 부트스트랩의 권한 밖이다.
    if (disabled.has(h.key)) {
      skipped.push({ key: short, reason: 'operator-disabled' });
      return;
    }
    grant.push(h);
  });
  return { grant: grant, skipped: skipped };
}

// 멱등 병합. 같은 key의 기존 블록을 **교체**하고 나머지 본문은 바이트 그대로 둔다.
// 프로브의 append-only는 매 실행 새 파일을 쓰는 스크래치 home에서만 성립한다.
function mergeTrustBlocks(existingToml, hooks) {
  const src = String(existingToml == null ? '' : existingToml);
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const lines = src.split(/\r?\n/);
  const blocks = parseHookStateBlocks(src);
  const byKey = new Map();
  blocks.forEach(function (b) { byKey.set(b.key, b); });

  const drop = new Set();
  const keys = [];
  const appended = [];
  (Array.isArray(hooks) ? hooks : []).forEach(function (h) {
    keys.push(shortHookKey(h.key));
    const b = byKey.get(h.key);
    if (b) { for (let i = b.start; i <= b.end; i += 1) drop.add(i); }
    appended.push(h);
  });

  const kept = [];
  for (let i = 0; i < lines.length; i += 1) if (!drop.has(i)) kept.push(lines[i]);
  // 교체로 생긴 연속 빈 줄을 접는다 — 그러지 않으면 같은 입력의 재실행이 바이트
  // 동일을 내지 못하고, 멱등성 단언이 거짓이 된다.
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();

  const out = kept.slice();
  appended.forEach(function (h) {
    out.push('');
    out.push('[hooks.state.' + tomlBasicString(h.key) + ']');
    out.push('enabled = true');
    out.push('trusted_hash = ' + tomlBasicString(h.currentHash));
  });
  if (out.length) out.push('');
  return { toml: out.join(eol), keys: keys, replaced: appended.length };
}

module.exports = {
  MCCP_PLUGIN_NAME,
  REACH_ENV_TO_CLEAR,
  tomlBasicString,
  shortHookKey,
  isMccpDeclared,
  parseHookStateBlocks,
  selectTrustable,
  mergeTrustBlocks,
};

// ── fs · spawn 계층 ──────────────────────────────────────────────────────────
// 순수 단계와 달리 여기서만 외부 상태를 만진다. `--apply` 없이는 **한 바이트도 쓰지
// 않는다** — 운영자 홈의 config를 고치는 것은 되돌리기 어려운 변경이므로 기본이 관측이다.

const CODEX_BIN = process.env.MCCP_CODEX_BIN || 'codex';
const HOOKS_LIST_TIMEOUT_MS = Number(process.env.MCCP_CODEX_HOOKS_LIST_TIMEOUT_MS || 45000);

function resolveCodexHome(env) {
  const e = env || process.env;
  if (typeof e.CODEX_HOME === 'string' && e.CODEX_HOME.trim()) return e.CODEX_HOME.trim();
  return path.join(e.HOME || os.homedir(), '.codex');
}

function configPath(codexHome) { return path.join(codexHome, 'config.toml'); }

function readConfig(codexHome) {
  try { return fs.readFileSync(configPath(codexHome), 'utf8'); }
  catch (err) { return err.code === 'ENOENT' ? '' : null; }
}

// argv 배열 + `shell:false`. 문자열 보간 경로를 이 파일에 만들지 않는다.
function runCodex(args, codexHome, timeoutMs) {
  return spawnSync(CODEX_BIN, args, {
    encoding: 'utf8',
    shell: false,
    timeout: timeoutMs || 120000,
    env: Object.assign({}, process.env, { CODEX_HOME: codexHome }),
    maxBuffer: 8 * 1024 * 1024,
  });
}

// `hooks/list` 왕복. `<key>`·`currentHash`·`trustStatus`를 **추측하지 않고** 받아 온다 —
// 우리가 hash를 계산하면 Codex의 산식이 바뀌는 날 조용히 어긋나고, 그 어긋남은 "발화 0"과
// 같은 모양이라 계측기가 자기 측정을 오염시킨다.
function listHooks(codexHome, cwd) {
  const client = path.resolve(__dirname, 'codex-hooks-list.js');
  const r = spawnSync(process.execPath, [client, codexHome, cwd || process.cwd()], {
    encoding: 'utf8',
    shell: false,
    timeout: HOOKS_LIST_TIMEOUT_MS,
    env: Object.assign({}, process.env, { CODEX_HOME: codexHome }),
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.error) return { ok: false, reason: 'hooks/list spawn failed: ' + r.error.message, hooks: [] };
  if (r.status !== 0) return { ok: false, reason: 'hooks/list exited ' + r.status, hooks: [] };
  let parsed;
  try { parsed = JSON.parse(String(r.stdout || '')); }
  catch (err) { return { ok: false, reason: 'hooks/list output unparsable: ' + err.message, hooks: [] }; }
  const hooks = [];
  ((parsed && parsed.data) || []).forEach(function (e) {
    (e.hooks || []).forEach(function (h) { if (h && typeof h.key === 'string') hooks.push(h); });
  });
  return { ok: true, reason: null, hooks: hooks };
}

// 축 (ii) — 해소. **`rootSource`가 `R-d:codex-cache`일 때만** 성립으로 본다.
// `resolved:true`만 보면 셋이 틀린다: codex 캐시가 비면 claude 캐시로 폴백하고,
// `ROOT_ENV_NAMES`가 캐시 후보보다 먼저 오며, `harness==='claude'`면 즉시 단락된다.
// 그래서 그 네 env를 지운 **자식 프로세스**에서 `MCCP_HARNESS=codex`로 돌린다.
function verifyReach(codexHome, name) {
  const shim = path.resolve(__dirname, 'command-reach.js');
  const env = Object.assign({}, process.env, { CODEX_HOME: codexHome, MCCP_HARNESS: 'codex' });
  REACH_ENV_TO_CLEAR.forEach(function (k) { delete env[k]; });
  const r = spawnSync(process.execPath, [shim, 'resolve', name || 'plan', '--json'], {
    encoding: 'utf8', shell: false, timeout: 30000, env: env, maxBuffer: 4 * 1024 * 1024,
  });
  let out = null;
  try { out = JSON.parse(String(r.stdout || '')); } catch (_) { out = null; }
  if (!out) return { ok: false, reason: 'command-reach produced no readable JSON', rootSource: null };
  if (!out.resolved) return { ok: false, reason: out.reason || 'not resolved', rootSource: out.rootSource || null };
  if (out.rootSource !== 'R-d:codex-cache') {
    return {
      ok: false,
      reason: 'resolved via ' + String(out.rootSource) + ', not the Codex plugin cache — this does NOT prove Codex reach',
      rootSource: out.rootSource,
    };
  }
  return { ok: true, reason: null, rootSource: out.rootSource, commandPath: out.commandPath, root: out.root };
}

// 관측만 낸다. 잴 수 없었던 것은 `missing`이 아니라 `unmeasured`다 —
// 통제 없는 미발화는 부재의 증거가 아니다(M1·M3의 판정 규칙).
function status(opts) {
  const o = opts || {};
  const codexHome = o.codexHome || resolveCodexHome(o.env);
  const out = { codex_home: codexHome, cli: null, config: null, hooks: null, reach: null };

  const ver = runCodex(['--version'], codexHome, 15000);
  out.cli = ver.error || ver.status !== 0
    ? { axis: 'missing', detail: ver.error ? ver.error.message : 'exit ' + ver.status }
    : { axis: 'ok', version: String(ver.stdout || '').trim() };

  const cfg = readConfig(codexHome);
  if (cfg === null) out.config = { axis: 'unmeasured', detail: 'config.toml unreadable' };
  else {
    const blocks = parseHookStateBlocks(cfg);
    const mine = blocks.filter(function (b) { return isMccpDeclared(b.key); });
    out.config = {
      axis: mine.length ? 'ok' : 'missing',
      trust_blocks_total: blocks.length,
      trust_blocks_mccp: mine.length,
      exists: cfg !== '',
    };
  }

  if (out.cli.axis !== 'ok') out.hooks = { axis: 'unmeasured', detail: 'codex CLI unavailable' };
  else {
    const listed = listHooks(codexHome, o.cwd);
    if (!listed.ok) out.hooks = { axis: 'unmeasured', detail: listed.reason };
    else {
      const mine = listed.hooks.filter(function (h) { return isMccpDeclared(h.key); });
      const trusted = mine.filter(function (h) { return h.trustStatus === 'trusted'; });
      out.hooks = {
        axis: mine.length === 0 ? 'missing' : (trusted.length ? 'ok' : 'missing'),
        total: listed.hooks.length,
        mccp: mine.length,
        mccp_trusted: trusted.length,
        by_status: mine.reduce(function (a, h) { a[h.trustStatus] = (a[h.trustStatus] || 0) + 1; return a; }, {}),
        keys: mine.map(function (h) { return shortHookKey(h.key); }),
      };
    }
  }

  const reach = verifyReach(codexHome, o.name);
  out.reach = reach.ok
    ? { axis: 'ok', root_source: reach.rootSource }
    : { axis: 'missing', detail: reach.reason, root_source: reach.rootSource };
  return out;
}

// 백업은 이 저장소가 비밀 인접 파일에 쓰는 원자적 관용구를 그대로 쓴다.
// `copyFileSync`의 mode 보존은 Node 공개 API의 보장이 아니고, 백업본은 trust 해시
// 전량과 운영자의 provider 설정을 담는다.
function backupConfig(codexHome, body) {
  const dest = configPath(codexHome) + '.mccp-backup-' + new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(dest, body, { flag: 'wx', mode: 0o600 });
  return dest;
}

function bootstrap(opts) {
  const o = opts || {};
  const apply = o.apply === true;
  const codexHome = o.codexHome || resolveCodexHome(o.env);
  const steps = [];
  const fail = function (step, detail) {
    steps.push({ step: step, ok: false, detail: detail });
    return { ok: false, apply: apply, codex_home: codexHome, steps: steps };
  };

  const ver = runCodex(['--version'], codexHome, 15000);
  if (ver.error || ver.status !== 0) {
    return fail('codex-cli', ver.error ? ver.error.message : 'exit ' + ver.status);
  }
  steps.push({ step: 'codex-cli', ok: true, detail: String(ver.stdout || '').trim() });

  // Codex 자신의 설치 명령은 **감싸되 재해석하지 않는다** — 종료 코드와 stderr를 그대로
  // 표면화한다. 우리가 성공/실패를 다시 판정하면 그 판정이 Codex의 것과 어긋나는 날 조용히 틀린다.
  if (o.marketplace) {
    if (!apply) steps.push({ step: 'marketplace-add', ok: true, detail: 'DRY-RUN: ' + CODEX_BIN + ' plugin marketplace add ' + o.marketplace });
    else {
      const r = runCodex(['plugin', 'marketplace', 'add', o.marketplace], codexHome, 180000);
      if (r.status !== 0) return fail('marketplace-add', 'exit ' + r.status + ': ' + String(r.stderr || '').trim());
      steps.push({ step: 'marketplace-add', ok: true, detail: String(r.stdout || '').trim() });
    }
  }
  if (!apply) steps.push({ step: 'plugin-add', ok: true, detail: 'DRY-RUN: ' + CODEX_BIN + ' plugin add ' + MCCP_PLUGIN_NAME });
  else {
    const r = runCodex(['plugin', 'add', MCCP_PLUGIN_NAME], codexHome, 300000);
    if (r.status !== 0) return fail('plugin-add', 'exit ' + r.status + ': ' + String(r.stderr || '').trim());
    steps.push({ step: 'plugin-add', ok: true, detail: String(r.stdout || '').trim() });
  }

  const listed = listHooks(codexHome, o.cwd);
  if (!listed.ok) return fail('hooks-list', listed.reason);
  const cfg = readConfig(codexHome);
  if (cfg === null) return fail('read-config', 'config.toml unreadable');
  const sel = selectTrustable(listed.hooks, cfg);
  steps.push({
    step: 'select-trustable', ok: true,
    detail: 'grant=' + sel.grant.length + ' skipped=' + sel.skipped.length,
    grant: sel.grant.map(function (h) { return shortHookKey(h.key); }),
    skipped: sel.skipped,
  });
  // 승인할 것이 0건인 상태를 성공으로 반올림하지 않는다. 발화 축이 성립할 수 없다.
  if (sel.grant.length === 0) return fail('select-trustable', 'no mccp-declared hook is eligible for trust');

  const merged = mergeTrustBlocks(cfg, sel.grant);
  if (!apply) {
    steps.push({ step: 'merge-trust', ok: true, detail: 'DRY-RUN: would replace ' + merged.replaced + ' block(s) in ' + configPath(codexHome) });
    steps.push({ step: 'verify', ok: true, detail: 'DRY-RUN: skipped (nothing was applied)' });
    return { ok: true, apply: false, codex_home: codexHome, steps: steps, dry_run: true };
  }
  let backup;
  try { backup = backupConfig(codexHome, cfg); }
  catch (err) { return fail('backup', err.message); }
  fs.writeFileSync(configPath(codexHome), merged.toml, { mode: 0o600 });
  steps.push({ step: 'merge-trust', ok: true, detail: 'replaced ' + merged.replaced + ' block(s)', backup: path.basename(backup) });

  // ── 성공 조건은 두 축이 **모두** 성립할 때만 ─────────────────────────────
  // 축 (i) 발화가 1차다. 파일이 해소된다는 사실은 hook이 발화한다는 사실이 아니다.
  const after = listHooks(codexHome, o.cwd);
  if (!after.ok) return fail('verify-fire', after.reason);
  const trusted = after.hooks.filter(function (h) { return isMccpDeclared(h.key) && h.trustStatus === 'trusted'; });
  if (trusted.length === 0) {
    return fail('verify-fire', 'no mccp hook reports trustStatus=trusted after the merge — the trust record did not take');
  }
  steps.push({ step: 'verify-fire', ok: true, detail: trusted.length + ' mccp hook(s) report trustStatus=trusted' });

  const reach = verifyReach(codexHome, o.name);
  if (!reach.ok) return fail('verify-reach', reach.reason);
  steps.push({ step: 'verify-reach', ok: true, detail: 'rootSource=' + reach.rootSource });

  return { ok: true, apply: true, codex_home: codexHome, steps: steps };
}

module.exports.resolveCodexHome = resolveCodexHome;
module.exports.configPath = configPath;
module.exports.listHooks = listHooks;
module.exports.verifyReach = verifyReach;
module.exports.status = status;
module.exports.bootstrap = bootstrap;

// ── CLI shim ─────────────────────────────────────────────────────────────────
// **exit 0은 두 검증 축이 모두 성립할 때만**이다(`--apply`). dry-run은 아무것도 쓰지
// 않았으므로 검증할 것이 없고, 그 사실을 `dry_run:true`로 밝힌다.
if (require.main === module) {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  const json = argv.indexOf('--json') !== -1;
  const flagVal = function (name) {
    const i = argv.indexOf(name);
    return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  };
  if (sub === 'status') {
    const out = status({ env: process.env, name: flagVal('--name') });
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    const blocked = ['cli', 'hooks', 'reach'].filter(function (k) { return !out[k] || out[k].axis !== 'ok'; });
    process.exit(blocked.length ? 1 : 0);
  } else if (sub === 'bootstrap') {
    const out = bootstrap({
      env: process.env,
      apply: argv.indexOf('--apply') !== -1,
      marketplace: flagVal('--marketplace'),
      name: flagVal('--name'),
    });
    if (json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    else out.steps.forEach(function (s) {
      process.stdout.write((s.ok ? '  ok  ' : ' FAIL ') + s.step + ' — ' + s.detail + '\n');
    });
    process.exit(out.ok ? 0 : 1);
  } else {
    process.stderr.write('usage: codex-bootstrap.js <status|bootstrap> [--apply] [--marketplace <ref>] [--name <command>] [--json]\n');
    process.exit(2);
  }
}
