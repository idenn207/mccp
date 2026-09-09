'use strict';

// 계측기 — Codex의 hook 자식 프로세스로 실행돼 이벤트 전문을 JSONL 한 줄로 남긴다 (Task 1).
// A1(발화) · A5(env) · A6(payload shape)이 이 한 아티팩트에서 나온다.
//
// **항상 exit 0.** 계측기가 호스트를 깨뜨리면 그 실행은 "hook이 발화하지 않는다"와
// 구분되지 않는다 — 우리가 재려는 바로 그 사실을 우리가 오염시킨다.
//
// **그리고 항상 *종료*한다** (코드 리뷰 M5). 종료 경로가 stdin의 `end`/`error`뿐이면
// 호스트가 stdin을 닫지 않는 구성에서 이 프로세스는 영원히 산다. hang은 crash보다 나쁘다 —
// exit 0 규칙이 막으려는 호스트 오염을 오히려 크게 하고, 관측상으로는 "발화하지 않았다"와
// 구분되지 않는다. 그래서 워치독이 stdin과 **경주**하고, 시간이 다하면 그때까지 받은 것으로
// 줄을 남긴다(`stdin_truncated:true`로 그 사실을 함께 남긴다 — 조용한 절삭은 관측을 지운다).
//
// ── env 투영: 와일드카드 없는 닫힌 정확 이름 집합 (security R1 H1) ──────────────
// 초안은 `CODEX_*` · `*_SESSION_ID` · `*_PID`를 allowlist라 불렀다. 그것은 allowlist가
// 아니라 접두/접미 매칭이고, 이름을 미리 알 수 없는 미래의 `CODEX_API_KEY` /
// `CODEX_AUTH_TOKEN`이 **값째로** 로그에 실린다 — DD9가 금지한 결과가 기본 동작이 된다.
// plan 자신이 `## Patterns to Mirror`에 "이름은 경계 일치로 센다"를 적어 두고 보안상 더
// 중요한 이 축에만 접두사 매칭을 썼다.
//
// 그래서 값을 싣는 이름은 **정확히 아래 여덟**이고, 나머지는 `names_only`로 이름만 남긴다.
// 이름을 남기는 것은 A5의 요구다 — OQ5가 묻는 것이 "세션 id를 나르는 이름이 무엇인가"이므로
// 이름 발견을 죽이면 축 자체가 죽는다. 이름은 비밀이 아니고 값이 비밀이다.
const VALUE_ALLOWLIST = [
  'CLAUDE_PLUGIN_ROOT',
  'CLAUDE_PLUGIN_DATA',
  'MCCP_PLUGIN_ROOT',
  'CODEX_HOME',
  'CODEX_SESSION_ID',
  'CODEX_THREAD_ID',
  'PWD',
  'CWD',
];

// 2차 방어. 위 목록에 들어 있더라도 이 형태의 이름은 값을 싣지 않는다 —
// 목록 편집 실수 한 번이 곧 유출이 되지 않게 한다.
const SECRET_NAME_RE = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH/i;

const TRUST_MODES = ['trusted', 'bypassed', 'unknown'];

const MAX_EVENT_DEPTH = 8;
const MAX_STRING = 4096;

function redactDeep(value, redactText, depth) {
  const d = depth || 0;
  if (d > MAX_EVENT_DEPTH) return '<depth-capped>';
  if (typeof value === 'string') return redactText(value.slice(0, MAX_STRING));
  if (Array.isArray(value)) return value.map(function (v) { return redactDeep(v, redactText, d + 1); });
  if (value && typeof value === 'object') {
    const out = {};
    // 키도 훑는다 — 경로를 키로 쓰는 맵이 값만 보는 투영에서는 구조적으로 안 보인다.
    Object.keys(value).forEach(function (k) {
      out[redactText(k)] = redactDeep(value[k], redactText, d + 1);
    });
    return out;
  }
  return value;
}

// env 투영. `redactText`는 주입받는다 — 이 모듈이 redactor를 직접 만들면 test가
// 호스트 홈 경로에 의존하게 된다.
// `allowlist`를 주입 가능하게 둔 이유는 test다. 현재 여덟 이름 중 `SECRET_NAME_RE`에
// 걸리는 것은 **하나도 없어** 2차 방어가 실 구성에서는 도달 불가이고, 주입이 없으면 그 분기가
// 반증 불가능한 산문이 된다(§3.17의 "도달 불가를 test가 고정한다"와 같은 형태).
// 목록에 secret 형태 이름이 들어오는 날 그 test가 실제 방어를 재게 된다.
function projectEnv(env, redactText, allowlist) {
  const src = env || {};
  const list = Array.isArray(allowlist) ? allowlist : VALUE_ALLOWLIST;
  const rt = redactText || function (s) { return s; };
  const values = {};
  const namesOnly = [];
  const suppressed = [];
  Object.keys(src).sort().forEach(function (name) {
    const allowed = list.indexOf(name) !== -1;
    if (!allowed) { namesOnly.push(name); return; }
    if (SECRET_NAME_RE.test(name)) { suppressed.push(name); return; }
    values[name] = rt(String(src[name]));
  });
  return { values: values, names_only: namesOnly, value_suppressed: suppressed };
}

// `argv`는 basename으로 접는다 (security R1 C1). A6가 필요로 하는 진단값은
// "어느 스크립트가 어떤 플래그로 불렸나"이지 "디스크 어디에 있나"가 아니고,
// `argv[0]`(nvm/asdf node 경로)과 `argv[1]`(worktree 절대경로)은 매 줄마다 계정명을 나른다.
function foldArgv(argv) {
  return (argv || []).map(function (a) {
    const s = String(a);
    if (s.charAt(0) === '-') return s;          // 플래그는 그대로 — 진단값이 거기 있다
    return s.split(/[\\/]/).pop() || s;
  });
}

// `run` provenance (security R1 M2 · 리뷰 R1 invariant-HIGH).
//
// `trust_mode`는 **자기 보고이지 관측이 아니다** — 이 프로세스는 hook 자식이라 부모 `codex`가
// `--dangerously-bypass-hook-trust`로 떴는지 볼 수 없다. 그래서 값이 진실이려면 플래그를
// 세우는 자리와 이 변수를 세우는 자리가 하나여야 하고, 그 유일 지점이 `cli.js run`이다.
// 여기서는 **읽고 검증만** 한다 — 열거 밖 값은 `unknown`으로 접는다(추정하지 않는다).
//
// `codex_version`이 줄마다 실리는 이유는 UI13이다. 스냅샷에만 있으면 한 버전의 로그를
// 다른 시점의 스냅샷과 짝지어도 `measured`가 나온다(리뷰 R1 invariant-MEDIUM).
function buildRun(env) {
  const src = env || {};
  const mode = String(src.MCCP_PROBE_TRUST_MODE || '').trim();
  return {
    run_id: String(src.MCCP_PROBE_RUN_ID || '').trim() || null,
    trust_mode: TRUST_MODES.indexOf(mode) === -1 ? 'unknown' : mode,
    codex_version: String(src.MCCP_PROBE_CODEX_VERSION || '').trim() || null,
    entrypoint: String(src.MCCP_PROBE_ENTRYPOINT || '').trim() || null,
  };
}

function buildLine(opts) {
  const o = opts || {};
  const rt = o.redactText || function (s) { return s; };
  const line = {
    at: (o.now || new Date()).toISOString(),
    argv: foldArgv(o.argv),
    event: redactDeep(o.event, rt, 0),
    env: projectEnv(o.env, rt),
    run: buildRun(o.env),
  };
  // present-only. 워치독이 stdin을 기다리다 시간이 다한 실행에만 실린다.
  if (o.stdinTruncated) line.stdin_truncated = true;
  return line;
}

// 워치독 예산. hook 자식은 호스트 턴 안에서 도므로 짧아야 하고, Codex는 `SessionEnd`를
// 3s로 clamp한다고 스스로 로그한다(truth 문서 A3) — 그보다 길게 잡으면 우리가 관측한
// 호스트 예산 밖에서 사는 계측기가 된다.
const STDIN_WAIT_MS = Number(process.env.MCCP_PROBE_STDIN_WAIT_MS || 2500);

module.exports = {
  VALUE_ALLOWLIST,
  SECRET_NAME_RE,
  TRUST_MODES,
  STDIN_WAIT_MS,
  projectEnv,
  foldArgv,
  buildRun,
  buildLine,
  redactDeep,
};

if (require.main === module) {
  // 실행 경로. 어떤 실패도 exit 0을 바꾸지 않고, 어떤 경로도 무기한 대기하지 않는다.
  let done = false;
  let stdin = '';

  const emit = function (truncated) {
    if (done) return;
    done = true;
    try {
      const fs = require('fs');
      const path = require('path');
      const { createRedactor } = require('../test-suite/redact');
      const redactor = createRedactor({ repoRoot: process.env.MCCP_PROBE_REPO_ROOT || process.cwd() });
      let event = null;
      // 파싱 실패도 관측값이다 — Codex가 JSON이 아닌 것을 보냈다는 사실을 지우지 않는다.
      try { event = JSON.parse(stdin); } catch (_) { event = { _unparsed: true, _len: stdin.length }; }
      const line = buildLine({
        argv: process.argv,
        event: event,
        env: process.env,
        redactText: function (s) { return redactor.redactText(s); },
        stdinTruncated: truncated,
      });
      const logPath = process.env.PROBE_LOG;
      if (logPath) {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.appendFileSync(logPath, JSON.stringify(line) + '\n');
      }
    } catch (_) { /* 계측기는 호스트를 깨뜨리지 않는다 */ }
    process.exit(0);
  };

  // `unref`하지 않는다 — 이 타이머가 프로세스를 살려 두는 것이 목적이다. stdin이 이미
  // 닫힌 정상 경로에서는 `end`가 먼저 도착해 `emit`이 `process.exit`으로 끝낸다.
  const watchdog = setTimeout(function () { emit(true); }, STDIN_WAIT_MS);

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (c) { stdin += c; });
  process.stdin.on('error', function () { clearTimeout(watchdog); emit(false); });
  process.stdin.on('end', function () { clearTimeout(watchdog); emit(false); });
}
