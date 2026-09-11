'use strict';

// 명령 도달 계측 (codex-harness-portability M3 Task 1·2 — C1~C5).
//
// **왜 배선보다 먼저인가.** M3가 주장하려는 것은 "핵심 명령이 Codex에서 호출된다"이고,
// 그것은 셋이 모두 참일 때만 성립한다 — skill이 호출되고(C1), 본문이 있는 곳을 알아내고(C2),
// 본문이 실제로 도착한다(C3). 배선을 먼저 하면 셋 중 무엇이 성립했는지 구분할 수 없다.
//
// ── 판정 규칙 (M1 A4 · M2 B2와 같은 형태) ────────────────────────────────────
// 양성 관측은 **음성 대조가 성립할 때만** 배선에 귀속된다. C1/C3의 통제는 "존재하지 않는
// 명령 이름으로 같은 절차를 돌리면 표식이 나오지 않는다"이다. 통제가 실패하면 그 축은
// `blocked`도 `not-blocked`도 아니라 해석 불가다.
//
// **그리고 음성 결론에도 유효한 관측을 요구한다** (Codex Implement-R1 F5 흡수). M2의 B1은
// 후보가 전부 `inconclusive`여도 "어느 형식도 차단하지 않았다"를 `measured`로 냈다 —
// 타임아웃과 미발화를 부재로 확정한 것이다. 여기서는 그 형태를 **미러하지 않는다**:
// 관측이 `inconclusive`면 축은 `unmeasured`로 남는다.
//
// ── 자격증명·격리에 대해 주장하지 않는 것 (security S5 — 실측) ───────────────
// `cli.runCodex`는 `spawnSync`다. `spawnSync`는 이벤트 루프를 막으므로 자식이 도는 동안
// **SIGINT/SIGTERM 핸들러가 돌지 않는다** — 5초 자식에 1초 시점 SIGINT를 보내 핸들러가
// 한 번도 발화하지 않는 것을 실측했다. 즉 `block-probe.js`의 주석이 시그널 핸들러로
// 보호된다고 적은 그 창이 정확히 보호되지 않는 창이다. 여기서는 핸들러를 **등록하지
// 않는다** — 등록하면 SIGINT의 기본 처분(즉시 종료)을 덮어 Ctrl+C가 무반응이 되면서
// 정리는 여전히 안 되기 때문이다. 대신 자격증명 사본의 노출 창이 자식의 수명과 같다는
// 사실을 그대로 적고, 창을 줄이는 쪽으로 설계한다(사본 1개 · 스윕당 1회 · 0o600 · 0o700).
// SIGKILL·OOM에서 사본이 남는 것은 이 설계가 닫지 못하는 잔여다.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const cli = require('./cli');

const PROBE_TIMEOUT_MS = 300000;

// 도달 판정 표식. **명령 본문에만 있는 문자열**이라야 한다 — 모델이 스스로 지어낼 수 있는
// 일반적 표현은 도달의 증거가 되지 못한다.
const BODY_MARKER = 'CO-CREATION REQUIRED';
const BODY_COMMAND = 'plan-prd';
const ABSENT_COMMAND = 'plan-prd-does-not-exist';

function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) { /* best-effort */ } }

function codexVersion() {
  const r = spawnSync(process.env.MCCP_PROBE_CODEX_BIN || 'codex', ['--version'], {
    encoding: 'utf8', shell: false, timeout: 20000,
  });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

function tmpDir() {
  const r = spawnSync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8', shell: false });
  const gitDir = r.status === 0 ? String(r.stdout).trim() : '.git';
  return path.resolve(gitDir, 'mccp', 'tmp');
}

// ── 스크래치 설치 ────────────────────────────────────────────────────────────
// **디렉토리를 놓는 것으로는 발견되지 않는다** (측정 정정 3 — 실측 3회).
// 처음에는 `plugins/cache/<mkt>/mccp/<ver>/`에 사본을 놓고 hook 발화를 기대했다. 통제까지
// 미발화였고, `.codex-plugin/plugin.json`을 합성해도 그대로였다. 원인은 Codex가 설치를
// **레지스트리로** 관리하기 때문이다 — `~/.codex/plugins/cache/mccp/`가 비어 있다는 것이
// 그 증거였다(디렉토리는 있는데 내용이 없다 = 설치 기록만 남고 지워진 상태).
//
// 그래서 공식 경로를 쓴다: `codex plugin marketplace add` → `codex plugin add`. 이것이 M1
// `plugin-autodiscovery`가 말한 "**by install alone**"의 실제 의미다.
//
// **저장소의 `marketplace.json`은 쓰지 않는다.** 그것은 `ref: release`로 GitHub를 가리키므로
// (§3.7 release-channel-separation M1) 설치되는 것은 워크트리가 아니라 릴리스 브랜치다 —
// 즉 이 milestone이 추가한 skill이 실리지 않아 M3를 측정할 수 없다. 스크래치 marketplace를
// 따로 만들어 로컬 사본을 가리킨다. 저장소 파일은 건드리지 않는다.
function codexBin() { return process.env.MCCP_PROBE_CODEX_BIN || 'codex'; }

function codexPlugin(home, args, timeoutMs) {
  return spawnSync(codexBin(), ['plugin'].concat(args), {
    encoding: 'utf8', shell: false, timeout: timeoutMs || 120000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, TERM: 'dumb', CODEX_HOME: home },
  });
}

function installScratch(home, repoRoot, marketplace) {
  const mkt = path.join(home, 'scratch-marketplace');
  fs.mkdirSync(path.join(mkt, '.claude-plugin'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(mkt, 'plugins'), { recursive: true, mode: 0o700 });
  fs.cpSync(path.join(repoRoot, 'plugins', 'mccp'), path.join(mkt, 'plugins', 'mccp'), { recursive: true });
  // `source`는 marketplace 루트 **상대 경로 문자열**이다. 객체형(`{source:'local',...}`)은
  // 이 버전이 인식하지 못하는 것을 실측했다 — 목록에 아예 뜨지 않는다.
  fs.writeFileSync(path.join(mkt, '.claude-plugin', 'marketplace.json'), JSON.stringify({
    name: marketplace,
    owner: { name: 'mccp-reach-probe' },
    plugins: [{ name: 'mccp', source: './plugins/mccp', description: 'local worktree copy for the M3 reach probe' }],
  }, null, 2));

  const added = codexPlugin(home, ['marketplace', 'add', mkt]);
  if (added.status !== 0) return { ok: false, root: null, stage: 'marketplace-add' };
  const installed = codexPlugin(home, ['add', 'mccp@' + marketplace]);
  if (installed.status !== 0) return { ok: false, root: null, stage: 'plugin-add' };

  // 설치 루트는 stdout이 말해 준다. 추측하지 않는다.
  const m = /Installed plugin root:\s*(\S+)/.exec(String(installed.stdout || ''));
  if (!m) return { ok: false, root: null, stage: 'root-unparsed' };
  return { ok: true, root: m[1], stage: null };
}

function copyAuth(home) {
  try {
    const data = fs.readFileSync(path.join(os.homedir(), '.codex', 'auth.json'));
    fs.writeFileSync(path.join(home, 'auth.json'), data, { flag: 'wx', mode: 0o600 });
    return true;
  } catch (_) { return false; }   // 부재는 관측값이다 — 인증 실패로 나타난다
}

// ── 한 번의 관측 ─────────────────────────────────────────────────────────────
function runOne(opts) {
  const { id, prompt, version, repoRoot, hookCommand, events } = opts;
  const base = tmpDir();
  fs.mkdirSync(base, { recursive: true });
  const runId = 'reach-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const home = path.join(base, 'reach-home-' + runId);
  const firedLog = path.join(base, 'reach-fired-' + runId + '.jsonl');

  try {
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });   // S8 — 기본 umask에 맡기지 않는다
    const authOk = copyAuth(home);                         // 설치도 인증을 볼 수 있으므로 먼저
    const inst = installScratch(home, repoRoot, 'mccp-probe');
    if (!inst.ok) {
      // **설치가 성립하지 않으면 어떤 관측도 하지 않는다.** 설치 실패 상태에서 얻은
      // "미발화"는 배선에 대해 아무 말도 하지 않는다(F5와 같은 선).
      return { id: id, run_id: runId, codex_version: version, install_ok: false,
               install_stage: inst.stage, run_ok: false, hook_fired: null,
               body_marker_present: null, stdout_bytes: 0 };
    }
    const installed = inst.root;

    if (hookCommand) {
      // ── C2는 **`hooks.json`** 에서 재야 한다 (측정 정정) ──────────────────
      // 첫 시도는 `config.toml`의 `[hooks]`에 등록해 "치환되지 않는다"를 얻었는데, 그것은
      // DD5가 묻는 질문이 아니다. 두 표면은 다르다 — `config.toml`은 plugin 문맥이 없으니
      // 치환할 root 자체가 없고, `hooks/hooks.json`은 Codex가 **어느 plugin의 것인지 알고**
      // 읽는다(M1 `plugin-autodiscovery`: discovered=true, `$schema` 제거 후 dispatched=true,
      // fired=[SessionStart, Stop]). 출하되는 것은 후자이므로 후자를 잰다.
      const src = 'try{require("fs").appendFileSync(' + JSON.stringify(firedLog)
        + ', JSON.stringify({fired:true,at:new Date().toISOString()})+"\n");}catch(_){}\nprocess.exit(0);';
      fs.writeFileSync(path.join(installed, 'reach-probe-hook.js'), src, { mode: 0o700 });
      // 스크래치 사본의 hooks.json을 **probe 한 건으로 대체**한다. 원본 29개 핸들러를
      // 그대로 두면 어느 것이 marker를 냈는지 귀속할 수 없다.
      fs.writeFileSync(path.join(installed, 'hooks', 'hooks.json'), JSON.stringify({
        description: 'reach-probe C2 single-handler probe',
        hooks: {
          SessionStart: [{
            matcher: '*',
            hooks: [{ type: 'command', command: hookCommand.replace('__ROOT__', installed) }],
            description: 'reach-probe C2',
            id: 'mccp:reach-probe-c2',
          }],
        },
      }, null, 2));
    }

    const env = {
      PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, TERM: 'dumb',
      CODEX_HOME: home,
    };
    const result = cli.runCodex(['exec', '--dangerously-bypass-hook-trust', prompt], {
      env: env, timeoutMs: PROBE_TIMEOUT_MS,
    });
    const stdout = String((result && result.stdout) || '');
    const fired = fs.existsSync(firedLog)
      && fs.readFileSync(firedLog, 'utf8').indexOf('"fired":true') !== -1;

    return {
      id: id,
      run_id: runId,
      codex_version: version,
      auth_copied: authOk,
      install_ok: true,
      install_stage: null,
      trust_mode: 'bypassed',
      exit_status: result ? result.status : null,
      exit_signal: result ? result.signal : null,
      hook_fired: hookCommand ? fired : null,
      // **원문은 싣지 않는다.** redact 관문은 경로만 보고 토큰 규칙이 0건이라
      // (M2 security M5) 관문이 못 보는 것을 관문 뒤에 두지 않는다. 대신 판정에 필요한
      // 불리언만 낸다.
      body_marker_present: stdout.indexOf(BODY_MARKER) !== -1,
      stdout_bytes: stdout.length,
      // 실행 자체가 성립했는가. 이것이 거짓이면 어떤 음성 관측도 부재의 증거가 아니다.
      run_ok: !!(result && result.status === 0 && !result.signal),
    };
  } finally {
    rmrf(home);       // auth 사본은 여기서 사라진다. SIGKILL 경로는 닫지 못한다(S5).
    rmrf(firedLog);
  }
}

// ── 스윕 ─────────────────────────────────────────────────────────────────────
// 턴 비용이 크므로(M1 실측 ~3.1k/턴, 본문 로드는 훨씬 크다) 축당 1턴으로 설계한다.
function sweep(opts) {
  const o = opts || {};
  const repoRoot = o.cwd || process.cwd();
  const version = codexVersion();
  const only = o.only || null;
  const runs = [];

  const scenarios = [
    {
      id: 'c2-hooksjson-substitution',
      hookCommand: 'node "${CLAUDE_PLUGIN_ROOT}/reach-probe-hook.js"',
      prompt: 'Reply with the single word: ok',
    },
    {
      id: 'c2-hooksjson-control-absolute',
      // 통제 — 같은 표면에 절대경로로 등록하면 발화해야 한다. 발화하지 않으면 위 관측의
      // "미발화"는 치환 실패가 아니라 hooks.json 배선 실패이고, 그러면 축은 해석 불가다.
      hookCommand: 'node "__ROOT__/reach-probe-hook.js"',
      prompt: 'Reply with the single word: ok',
    },
    {
      id: 'c1c3-positive-body-reached',
      prompt: 'Use the run-command skill to run the mccp command named ' + BODY_COMMAND
        + '. Do not actually carry the command out. Instead, after you read its body, quote the '
        + 'exact text of its first "## Phase 0" heading and then stop.',
    },
    {
      id: 'c1c3-control-absent-command',
      // 통제: 존재하지 않는 이름. 표식이 나오면 그 표식은 도달의 증거가 아니다.
      prompt: 'Use the run-command skill to run the mccp command named ' + ABSENT_COMMAND
        + '. If it cannot be resolved, say exactly why and stop.',
    },
  ].filter(function (s) { return !only || only.indexOf(s.id) !== -1; });

  scenarios.forEach(function (s) {
    runs.push(runOne({
      id: s.id, prompt: s.prompt, version: version, repoRoot: repoRoot,
      hookCommand: s.hookCommand || null, events: ['UserPromptSubmit'],
    }));
  });

  return {
    schema: 'mccp.codex-probe.reach/1',
    codex_version: version,
    body_marker_command: BODY_COMMAND,
    absent_command: ABSENT_COMMAND,
    runs: runs,
  };
}

module.exports = { sweep, runOne, BODY_MARKER, BODY_COMMAND, ABSENT_COMMAND, installScratch };
