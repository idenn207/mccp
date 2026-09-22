#!/usr/bin/env node
'use strict';

// Codex `UserPromptSubmit` ingress (codex-harness-portability M2 Task 6).
//
// Claude Code의 receipt 게이트는 `UserPromptExpansion`에 걸려 있는데 Codex에는 그 이벤트가
// 없다(M1 `event-enum`: `mccp_events_absent`에 포함). 그래서 Codex에서 게이트 발화 수는 0이고,
// 이 파일이 그것을 1로 올리는 유일한 경로다.
//
// 세 가지를 하지 않는다:
//   1. **게이트 로직을 복제하지 않는다** — `receipt-prompt.js#runGate`에 위임한다(Task 5).
//   2. **하네스를 추측하지 않는다** — `harness-ingress.js`가 지목하지 않으면 아무 일도 안 한다.
//   3. **프롬프트 텍스트를 신뢰하지 않는다** — 아래 정규화가 유일한 통로다.
//
// 모듈 스코프 require는 전부 가드한다(`receipt-skill.js:19-33` 선례). 로드 실패가 throw가
// 되면 계측이 아니라 호스트를 깨뜨린다.

const path = require('path');
const fs = require('fs');

const oracle = (function () {
  try { return require('../lib/harness-ingress'); } catch (_) { return null; }
})();

const gate = (function () {
  try { return require('./receipt-prompt'); } catch (_) { return null; }
})();

// **소비처와 같은 tokenizer를 쓴다.** 여기서 `split(/\s+/)`를 쓰고 하류
// `extract-plan-path.js`가 따옴표 인식 tokenizer를 쓰면 둘이 보는 토큰이 달라지고, 그
// 차이가 곧 우회다(security S1 — `"--plan" /dev/zero`가 검사를 지나 `/dev/zero`로 해석됐다).
// 두 번째 tokenizer를 여기 쓰지 않고 하류의 것을 **빌려온다** — 사본을 만들면 같은 차이가
// 다시 벌어진다.
const tokenizer = (function () {
  try { return require('../lib/extract-plan-path').tokenize; } catch (_) { return null; }
})();

function warn(line) {
  try { process.stderr.write(line + '\n'); } catch (_) { /* best-effort */ }
}

function allow() { return 0; }

// ── 정규화: 신뢰 불가 입력이 게이트에 들어가는 유일한 지점 ────────────────────
//
// plan Risks는 `command_args`가 나르는 두 값 중 **decision slug만** 다뤘다. 그 문장은
// 참이다 — `deriveDecisionId`의 모든 반환 경로가 `SLUG_RE`를 지난다. 그러나 같은 문자열이
// 나르는 두 번째 값 `planPath`는 어떤 정규화도 받지 않고
// `extract-plan-path.js` → `hash.js#markdownHash`의 `fs.readFileSync`까지 **그대로** 간다.
// 상한도 `lstat`도 없다. security H3이 그 체인을 file:line으로 짚었다.
//
// 그래서 여기서 셋을 건다:
//   (a) **첫 줄만** 본다. 붙여넣은 로그 본문 안의 `--plan`/`--decision`이 args가 되지
//       못하게 한다. `decision.js`의 `explicitDecision`은 문자열 어디서든 매치한다.
//   (b) 길이 상한. 프롬프트는 사람이 타이핑한 명령 한 줄이지 페이로드가 아니다.
//   (c) `--plan` 값에 containment + regular-file + 크기 상한. 실패하면 그 토큰 쌍을
//       **떨어뜨린다** — 떨어뜨리면 `validate-cmd`의 generic-slug 하드블록(조건이
//       `&& !opts.planPath`)이 되살아나므로 방향이 안전 쪽이다.

const O_NONBLOCK_FLAG = typeof fs.constants.O_NONBLOCK === 'number' ? fs.constants.O_NONBLOCK : 0;
const MAX_COMMAND_LINE = 4096;
const MAX_PLAN_BYTES = 2 * 1024 * 1024;
const COMMAND_RE = /^\/?(mccp:[a-z0-9][a-z0-9-]*)(?:[ \t]+(.*))?$/;

// `--plan <v>` / `--plan=<v>` 를 찾아 검증하고, 통과하지 못하면 제거한다.
//
// 토큰 분해는 **하류와 같은 tokenizer**로 한다. 이전에는 공백 분해였고 "따옴표를 지원하지
// 않는 것이 의도"라고 적혀 있었는데, 그 의도는 성립할 수 없었다 — 하류가 따옴표를 해석하는
// 이상 여기서 안 하는 것은 방어가 아니라 **사각지대**다(S1, 재현됨).
//
// 재조립은 무손실이어야 한다. 검증한 토큰을 공백으로 잇기만 하면 공백을 품은 경로가 하류에서
// 다시 쪼개지고(정당한 사용 — `--plan "a b.md"`), 따옴표를 품은 토큰은 다르게 재해석된다.
// 그래서 **재해석이 필요한 토큰만** 작은따옴표로 감싸 `tokenize(rebuild(t)) === t`를 만든다.
const SAFE_TOKEN = /^[^\s'"\\]+$/;

function requote(token) {
  const t = String(token);
  if (SAFE_TOKEN.test(t)) return t;
  return "'" + t.replace(/(['\\])/g, '\\$1') + "'";
}

function sanitizePlanArg(args, cwd) {
  if (!args) return { args: '', dropped: null };
  // tokenizer를 못 불러오면 인자를 통째로 떨어뜨린다. 공백 분해로 **되돌아가지 않는다** —
  // 그것이 정확히 S1의 상태이고, 여기서 fail-open하면 수정이 없던 일이 된다.
  if (typeof tokenizer !== 'function') {
    return { args: '', dropped: 'shared tokenizer unavailable' };
  }
  const toks = tokenizer(String(args));
  const out = [];
  let dropped = null;

  for (let i = 0; i < toks.length; i++) {
    let value = null;
    let consumed = 0;
    if (toks[i] === '--plan' && i + 1 < toks.length) { value = toks[i + 1]; consumed = 2; }
    else if (toks[i].indexOf('--plan=') === 0) { value = toks[i].slice('--plan='.length); consumed = 1; }

    if (value === null) { out.push(toks[i]); continue; }

    const verdict = checkPlanPath(value, cwd);
    if (verdict.ok) {
      for (let k = 0; k < consumed; k++) out.push(toks[i + k]);
    } else {
      dropped = verdict.reason;
    }
    i += consumed - 1;
  }
  return { args: out.map(requote).join(' '), dropped: dropped };
}

function checkPlanPath(value, cwd) {
  if (!value || value.indexOf('\0') !== -1) return { ok: false, reason: 'empty or NUL-bearing path' };
  const root = cwd && typeof cwd === 'string' ? cwd : process.cwd();
  let abs;
  try { abs = path.resolve(root, value); } catch (_) { return { ok: false, reason: 'unresolvable path' }; }

  // ── containment는 **해소된 경로**로 잰다 (security S2) ──────────────────────
  // 이전에는 어휘적 경로로 `path.relative`를 재고 마지막 요소만 `lstat`했다. 그러면 중간
  // 디렉토리의 symlink를 OS가 투명하게 따라가므로 밖의 일반 파일에 도달한다 — 실측:
  // `checkPlanPath('self/root/etc/passwd', '/proc')`가 ok:true였고 realpath는 `/etc/passwd`.
  // `realpathSync`는 중간·최종 요소를 한 번에 해소하므로 그 구멍을 통째로 닫는다.
  // (이 검사는 "이미 존재하는 파일"만 다루므로 존재하지 않는 경로용 prefix 해소 기법은
  //  필요 없다.)
  let rootReal;
  let absReal;
  try {
    rootReal = fs.realpathSync(root);
    absReal = fs.realpathSync(abs);
  } catch (err) {
    return { ok: false, reason: 'ENOENT-class (' + (err && err.code) + ')' };
  }

  const rel = path.relative(rootReal, absReal);
  if (rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    return { ok: false, reason: 'outside the working directory' };
  }

  // ── 검사와 읽기 사이의 경합을 줄인다 (S4) ──────────────────────────────────
  // `statSync(path)`가 아니라 열어 둔 fd를 `fstat`한다. `/dev/zero`는 size를 0으로 보고하므로
  // 실효 가드는 `isFile()`이고 크기 상한은 심층 방어다.
  //
  // **잔여**: 실제 hash read는 별개 `open`이라 check-then-open TOCTOU가 남는다(S8). 그것을
  // 여기서 닫을 수는 없고, 닫는 자리는 `hash.js#readTextBounded`다 — 그쪽은 자기 fd를
  // fstat하므로 이 hook을 우회한 경로에서도 비정규 파일을 거부한다.
  // `O_NONBLOCK`이 필수다 — FIFO의 `open(2)`은 writer를 기다리며 블록하므로, 그것 없이는
  // `isFile()` 검사에 닿기 전에 hook이 멎는다. 정규 파일은 이 플래그를 무시한다.
  let fd;
  try { fd = fs.openSync(absReal, fs.constants.O_RDONLY | O_NONBLOCK_FLAG); }
  catch (err) { return { ok: false, reason: 'unopenable (' + (err && err.code) + ')' }; }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) return { ok: false, reason: 'not a regular file' };
    if (st.size > MAX_PLAN_BYTES) return { ok: false, reason: 'larger than the plan size cap' };
  } catch (err) {
    return { ok: false, reason: 'unstatable (' + (err && err.code) + ')' };
  } finally {
    try { fs.closeSync(fd); } catch (_) { /* best-effort */ }
  }
  return { ok: true, reason: null };
}

// prompt → {command_name, command_args} 또는 null(=게이트 대상 아님 → ALLOW).
function normalizePrompt(prompt, cwd) {
  if (typeof prompt !== 'string' || !prompt) return null;
  const firstLine = prompt.split(/\r?\n/, 1)[0];
  if (firstLine.length > MAX_COMMAND_LINE) return null;
  const m = COMMAND_RE.exec(firstLine.trim());
  if (!m) return null;
  const clean = sanitizePlanArg(m[2] || '', cwd);
  if (clean.dropped) {
    // 경로 원문은 싣지 않는다 — 오류 문자열이 block reason과 additionalContext를 타고
    // 모델 컨텍스트로 재주입되는 것이 H3의 두 번째 축이다.
    warn('[mccp:receipt-prompt-submit] dropped a --plan argument: ' + clean.dropped);
  }
  return { commandName: m[1], commandArgs: clean.args };
}

// ── 차단 방출 ────────────────────────────────────────────────────────────────
// 형태는 오라클이 나르는 측정값이 정한다. 값이 없으면 여기 도달하지 않는다.
function makeEmission(protocol, eventName) {
  if (protocol && protocol.kind === 'exit-nonzero-stderr') {
    return {
      hookEventName: eventName,
      emit: function (text) { process.stderr.write(text); },
      exitOverride: protocol.exitCode,
    };
  }
  // 기본은 stdout JSON — Claude와 같은 형태다.
  return {
    hookEventName: eventName,
    emit: function (text) { process.stdout.write(text); },
    exitOverride: null,
  };
}

function readStdin() {
  return new Promise(function (resolve) {
    let buf = '';
    try { process.stdin.setEncoding('utf8'); } catch (_) { return resolve(''); }
    process.stdin.on('data', function (c) { buf += c; });
    process.stdin.on('end', function () { resolve(buf); });
    process.stdin.on('error', function () { resolve(buf); });
    setTimeout(function () { resolve(buf); }, 25000);
  });
}

async function main() {
  if (!oracle) {
    warn('[mccp:receipt-prompt-submit] harness-ingress oracle unavailable — allowing');
    return allow();
  }

  // 오라클을 **stdin보다 먼저** 본다. payload는 지목을 내릴 수만 있고 올리지 못하므로
  // (`classifyPayload`의 한 방향 규칙), env만으로 `enabled=false`가 나오면 그 판정은
  // payload를 읽어도 뒤집히지 않는다. Claude Code에서 이 hook은 매 프롬프트마다 돌기
  // 때문에 이 조기 반환이 곧 비용이다.
  const pre = oracle.resolveIngress({ env: process.env });
  if (!pre.enabled) {
    if (pre.notice) warn(pre.notice);
    return allow();
  }

  let event = null;
  try {
    const raw = await readStdin();
    if (!raw.trim()) return allow();
    event = JSON.parse(raw);
  } catch (_) {
    return allow();
  }

  const decided = oracle.resolveIngress({ env: process.env, payload: event });
  if (!decided.enabled) {
    if (decided.notice) warn(decided.notice);
    return allow();
  }

  const norm = normalizePrompt(event.prompt, event.cwd);
  if (!norm) return allow();

  if (!gate || typeof gate.runGate !== 'function') {
    warn('[mccp:receipt-prompt-submit] gate core unavailable — allowing ' + norm.commandName);
    return allow();
  }

  const emission = makeEmission(decided.blockProtocol, decided.event);
  const code = await gate.runGate({
    command_name: norm.commandName,
    command_args: norm.commandArgs,
    session_id: event.session_id,
    cwd: event.cwd,
    // Codex의 `UserPromptSubmit`에는 `tool_use_id`가 없고 `turn_id`가 그 자리를 맡는다
    // (M1 `probe_log_shape_clean_env`). `tryShardLog`가 `sid && tuid`를 요구하므로 이
    // 매핑이 없으면 G1 fail-open이 hook-trace에 아무 기록도 남기지 않는다.
    tool_use_id: event.tool_use_id || event.turn_id,
    hook_event_name: decided.event,
  }, emission);

  return emission.exitOverride !== null && code !== 0 ? emission.exitOverride : code;
}

module.exports = {
  normalizePrompt,
  sanitizePlanArg,
  requote,
  checkPlanPath,
  makeEmission,
  MAX_COMMAND_LINE,
  MAX_PLAN_BYTES,
};

if (require.main === module) {
  main().then(function (code) {
    process.exit(code);
  }).catch(function (err) {
    // fail-open. 계측이 호스트를 깨뜨리면 "게이트가 없다"와 구분되지 않는다.
    warn('[mccp:receipt-prompt-submit] fatal (allowing): ' + (err && err.stack || err));
    process.exit(0);
  });
}
