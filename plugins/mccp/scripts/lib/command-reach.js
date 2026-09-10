'use strict';

// 명령 이름 → 본문 경로 해소 오라클 (codex-harness-portability M3 Task 3).
//
// 형태의 선례는 `harness-ingress.js`(양성 신호로만 지목하고 모호하면 아무 일도 안 한다)와
// §3.17 `impeccable-detect.js#resolveImpeccable`(후보를 **전부 열거**한 뒤 실제로 열릴 하나를
// 지목한다)이다.
//
// ── 왜 순수 계산과 검증을 가르는가 (Implement-Codex R1 F3 · security S6) ──────
// 초안은 "순수 오라클이 미지 이름을 거부한다"였는데 그 둘은 양립하지 않는다. 파일을 만지지
// 않는 함수는 `plan-xyz`처럼 형식상 정상인 미지 이름을 거부할 수단이 없다. 그리고 리뷰어가
// 더 아픈 곳을 짚었다: plan의 Task 4(dispatcher)가 **root를 따로 구해 경로를 조립**하도록
// 적혀 있어, 검증이 무엇을 반환하든 그것을 무시하는 구현이 계획을 만족했다.
//
// 그래서 둘을 구조로 가른다:
//   `resolveCandidate()` — 순수. 이름 형태와 root 후보를 계산만 한다. 절대 `resolved`를
//                          주장하지 않는다.
//   `verify()`           — fs를 만진다. **여기서만** `resolved:true`가 나온다.
// 그리고 CLI shim이 `verify()`까지 마친 뒤에만 exit 0 + 경로를 낸다. SKILL.md는 경로를
// 조립하지 않고 그 stdout만 소비하므로, "검증을 우회하는 구현"은 조립할 경로가 본문에
// 없어서 존재할 수 없다.
//
// ── 열거는 디스크에서 온다 (DD3와 충돌하지 않는 이유) ────────────────────────
// DD3가 금지한 것은 **하드코딩 사본**이다. 갈라질 원본이 있기 때문이다. `readdirSync`로
// 얻은 집합은 원본 그 자체라 갈라질 것이 없다. 그래서 셋을 동시에 얻는다 — 미지 이름을
// ENOENT가 아니라 `unknown-command`로 **구별해** 거부하고, Task 5의 짝 단언은 여전히
// "본문 리터럴 ↔ 하드코딩 열거"를 재며 둘 다 거짓으로 남고, 명령이 추가돼도 무변경이다.

const fs = require('fs');
const path = require('path');

const ingress = (function () {
  try { return require('./harness-ingress'); } catch (_) { return null; }
})();

// 이름 형태. `.`과 `/`를 아예 배제하므로 `..`을 **구성할 수 없다** — 경로 탈출 방어의
// 1차선은 join 이전의 이 검사다. 다만 형태가 맞다고 그 자리에 무엇이 있는지는 말하지
// 않으므로, 실제 경계는 `verify()`의 realpath containment가 지킨다(security S6).
const NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;

// root를 나르는 env 이름 후보 (DD4 R-a). 철자를 열거만 하고 어느 것이 성립하는지는
// 주장하지 않는다 — 그 판정은 C2 측정이 한다.
const ROOT_ENV_NAMES = ['MCCP_PLUGIN_ROOT', 'CLAUDE_PLUGIN_ROOT', 'CODEX_PLUGIN_ROOT'];

const COMMANDS_DIR = 'commands';
const COMMAND_EXT = '.md';

function readEnv(env, name) {
  const v = env && env[name];
  return typeof v === 'string' ? v.trim() : '';
}

function validateName(name) {
  if (typeof name !== 'string' || name === '') return { ok: false, reason: 'empty command name' };
  if (name.indexOf('\0') !== -1) return { ok: false, reason: 'NUL-bearing command name' };
  // `mccp:` 접두는 받아서 벗긴다 — 호출자가 `/mccp:plan`을 그대로 넘길 수 있어야 한다.
  const bare = name.indexOf('mccp:') === 0 ? name.slice('mccp:'.length) : name;
  if (!NAME_RE.test(bare)) {
    return { ok: false, reason: 'command name does not match ' + String(NAME_RE) };
  }
  return { ok: true, reason: null, name: bare };
}

// root 후보를 **순서대로** 낸다. DD4의 판정 규칙(R-a > R-b > R-d > R-c)이 이 순서다.
// R-c(모델 추론)는 후보에 넣지 않는다 — 그 경로는 조용히 틀리므로 오라클이 자동으로
// 고를 수 있어서는 안 된다.
function rootCandidates(opts) {
  const o = opts || {};
  const env = o.env || {};
  const out = [];

  ROOT_ENV_NAMES.forEach(function (n) {
    const v = readEnv(env, n);
    if (v) out.push({ id: 'R-a:' + n, kind: 'env', value: v, reason: n + ' is populated' });
  });

  const hint = typeof o.rootHint === 'string' ? o.rootHint.trim() : '';
  if (hint) out.push({ id: 'R-b:hint', kind: 'hint', value: hint, reason: 'caller-supplied root hint' });

  // R-d — marketplace 레이아웃 열거. 값이 아니라 **탐색 규칙**이라 순수 단계에서는
  // 패턴으로만 낸다. 실제 확장은 `verify()`가 한다.
  const codexHome = readEnv(env, 'CODEX_HOME')
    || (readEnv(env, 'HOME') ? path.join(readEnv(env, 'HOME'), '.codex') : '');
  if (codexHome) {
    out.push({ id: 'R-d:codex-cache', kind: 'glob', value: path.join(codexHome, 'plugins', 'cache'), reason: 'codex plugin cache layout' });
  }
  const claudeHome = readEnv(env, 'HOME') ? path.join(readEnv(env, 'HOME'), '.claude') : '';
  if (claudeHome) {
    out.push({ id: 'R-d:claude-cache', kind: 'glob', value: path.join(claudeHome, 'plugins', 'cache'), reason: 'claude plugin cache layout' });
  }
  return out;
}

// ── 순수 단계 ────────────────────────────────────────────────────────────────
// **`resolved`를 절대 주장하지 않는다.** 파일을 안 봤으므로 주장할 수 없다.
function resolveCandidate(opts) {
  const o = opts || {};
  const env = o.env || {};
  const harness = ingress ? ingress.resolveHarness(env).harness : 'unknown';
  const v = validateName(o.name);
  return {
    harness: harness,
    name: v.ok ? v.name : null,
    nameOk: v.ok,
    candidates: v.ok ? rootCandidates({ env: env, rootHint: o.rootHint }) : [],
    reason: v.ok ? null : v.reason,
  };
}

// `<root>`가 실제로 mccp plugin root인가 — `commands/` 디렉토리 유무로 잰다.
function commandsDirOf(root) {
  try {
    const d = path.join(root, COMMANDS_DIR);
    return fs.statSync(d).isDirectory() ? d : null;
  } catch (_) { return null; }
}

// R-d glob 확장: `<cache>/*/mccp/*/`. 추측하지 않는다 — `commands/`를 실제로 가진 것만 낸다.
function expandCacheRoots(cacheDir) {
  const found = [];
  let markets = [];
  try { markets = fs.readdirSync(cacheDir); } catch (_) { return found; }
  markets.forEach(function (m) {
    let versions = [];
    const owner = path.join(cacheDir, m, 'mccp');
    try { versions = fs.readdirSync(owner); } catch (_) { return; }
    versions.forEach(function (ver) {
      const r = path.join(owner, ver);
      if (commandsDirOf(r)) found.push(r);
    });
  });
  // 정렬은 하되 **최신을 추측하지 않는다** — 여럿이면 그 사실을 호출자에게 넘긴다.
  return found.sort();
}

// ── 검증 단계 (fs) ───────────────────────────────────────────────────────────
// `resolved:true`가 나오는 유일한 자리.
function verify(opts) {
  const o = opts || {};
  const cand = resolveCandidate(o);
  const base = {
    harness: cand.harness,
    name: cand.name,
    resolved: false,
    root: null,
    rootSource: null,
    commandPath: null,
    known: null,
    reason: null,
  };

  // DD6 — Claude 하네스면 여기서 끝낸다. 진짜 명령이 있는데 한 단계 더 도는 것은 손해다.
  if (cand.harness === 'claude') {
    return Object.assign(base, {
      reason: 'claude harness: use the real slash command /mccp:' + (cand.name || '<name>') + ' instead',
    });
  }
  if (!cand.nameOk) return Object.assign(base, { reason: cand.reason });

  // root 후보를 순서대로 시도한다. `commands/`를 실제로 가진 첫 번째가 승자다.
  const tried = [];
  let root = null;
  let rootSource = null;
  for (let i = 0; i < cand.candidates.length && !root; i++) {
    const c = cand.candidates[i];
    if (c.kind === 'glob') {
      const roots = expandCacheRoots(c.value);
      tried.push({ id: c.id, found: roots.length });
      // **모호하면 지목하지 않는다** (§3.17 shadowed 규칙). 둘 이상이면 어느 사본이
      // 열릴지 측정된 바 없으므로 추측하지 않는다.
      if (roots.length === 1) { root = roots[0]; rootSource = c.id; }
      else if (roots.length > 1) {
        return Object.assign(base, {
          reason: 'ambiguous plugin root: ' + roots.length + ' installed copies under ' + c.id
            + ' — refusing to guess which one answers',
        });
      }
    } else {
      const ok = commandsDirOf(c.value);
      tried.push({ id: c.id, found: ok ? 1 : 0 });
      if (ok) { root = c.value; rootSource = c.id; }
    }
  }
  if (!root) {
    return Object.assign(base, {
      reason: 'no plugin root resolved (tried: '
        + (tried.map(function (t) { return t.id; }).join(', ') || 'none') + ')',
    });
  }

  // ── 미지 이름은 ENOENT가 아니라 그 이름으로 거부한다 (security S6) ──────────
  // 열거는 디스크에서 오므로 사본이 아니다. 구별해 거부하면 "없는 명령"과 "설치가
  // 깨졌다"가 호출자에게 다른 사실로 도달한다.
  const dir = path.join(root, COMMANDS_DIR);
  let known = [];
  try {
    known = fs.readdirSync(dir)
      .filter(function (f) { return f.slice(-COMMAND_EXT.length) === COMMAND_EXT; })
      .map(function (f) { return f.slice(0, -COMMAND_EXT.length); })
      .sort();
  } catch (err) {
    return Object.assign(base, { root: root, rootSource: rootSource, reason: 'commands directory unreadable (' + (err && err.code) + ')' });
  }
  if (known.indexOf(cand.name) === -1) {
    return Object.assign(base, {
      root: root, rootSource: rootSource, known: known.length,
      reason: 'unknown-command: ' + cand.name + ' is not among the ' + known.length + ' installed commands',
    });
  }

  // ── 경계는 realpath가 지킨다 ────────────────────────────────────────────────
  // 이름 형태가 맞다는 것은 **그 자리에 무엇이 놓였는지**를 말하지 않는다. 심어 둔
  // symlink는 형태 검사를 그대로 통과하므로, 해소한 경로가 root 안에 남는지를 본다.
  const target = path.join(dir, cand.name + COMMAND_EXT);
  let rootReal;
  let targetReal;
  try {
    rootReal = fs.realpathSync(root);
    targetReal = fs.realpathSync(target);
  } catch (err) {
    return Object.assign(base, { root: root, rootSource: rootSource, reason: 'unresolvable command body (' + (err && err.code) + ')' });
  }
  const rel = path.relative(rootReal, targetReal);
  if (rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    return Object.assign(base, { root: root, rootSource: rootSource, reason: 'command body resolves outside the plugin root' });
  }
  let st;
  try { st = fs.statSync(targetReal); } catch (err) {
    return Object.assign(base, { root: root, rootSource: rootSource, reason: 'unstatable command body (' + (err && err.code) + ')' });
  }
  if (!st.isFile()) {
    return Object.assign(base, { root: root, rootSource: rootSource, reason: 'command body is not a regular file' });
  }

  return {
    harness: cand.harness,
    name: cand.name,
    resolved: true,
    root: rootReal,
    rootSource: rootSource,
    commandPath: targetReal,
    known: known.length,
    reason: null,
  };
}

module.exports = {
  NAME_RE,
  ROOT_ENV_NAMES,
  validateName,
  rootCandidates,
  resolveCandidate,
  verify,
};

// ── CLI shim ─────────────────────────────────────────────────────────────────
// **exit 0은 `resolved:true`일 때만**이다. 그것이 F3 흡수의 기계적 형태다 — dispatcher는
// 이 종료 코드와 stdout만 보고, 스스로 경로를 만들지 않는다.
if (require.main === module) {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  if (sub !== 'resolve' || !argv[1]) {
    process.stderr.write('usage: command-reach.js resolve <name> [--json]\n');
    process.exit(2);
  }
  const out = verify({ env: process.env, name: argv[1], rootHint: process.env.MCCP_PLUGIN_ROOT_HINT });
  if (argv.indexOf('--json') !== -1) {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else if (out.resolved) {
    process.stdout.write(out.commandPath + '\n');
  } else {
    process.stderr.write('[mccp:command-reach] ' + out.reason + '\n');
  }
  process.exit(out.resolved ? 0 : 1);
}
