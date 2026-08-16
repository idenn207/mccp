'use strict';

// session-process-reclaim — 회수율 1차 실측 (PRD [primary] 지표, 표본 1).
//
// 왜 여기 있는가: M1+M2의 검증은 전량 단위 test였고, 그것들은 주입한 killer가 받은
// pid 집합을 기대 집합과 대조한다 — *판정 로직*은 증명하지만 *실제로 프로세스가 죽는지*는
// 증명하지 않는다. 그래서 이 PRD의 1차 지표는 한 번도 관측된 적이 없었다. 이 스크립트가
// 그 한 번이다: 진짜 자식을 띄우고, 진짜 `reclaimSession`을 부르고, 진짜 죽었는지 본다.
//
// `tests/manual/` 하위인 것이 곧 "CI 상시 suite 미편입" 보장이다 — `node --test`가 도는
// 글롭 `tests/*.test.js`에서 `*`는 디렉토리 구분자를 넘지 않는다. 실물 프로세스를 죽이는
// 검사는 CI에서 불안정하므로 일회성 실행으로 둔다.
//
// 실행: node plugins/mccp/scripts/lib/tests/manual/session-process-reclaim-smoke.js
// 성공 = exit 0. 그 외 **모든** 경우(단언 실패·spawn 실패·타임아웃·예외)는 비영점.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const sp = require('../../session-processes');
// 생사 판정은 이 저장소의 정본을 **재사용**한다. 재구현하면 `EPERM→alive` 의미론이
// 플랫폼별로 갈릴 여지가 생기고, Validation 9의 독립 확인과 다른 함수를 쓰게 된다.
const { isPidAlive } = require('../../../receipt/evidence-lock');

const SID = 'smoke-' + process.pid;
const POLL_INTERVAL_MS = 50;
const POLL_MAX_MS = 5000;

// 상향만 반영되는 토글(§D15)을 명시적으로 올린다. 기본값(win32 500 / POSIX 1500)은
// spawn 직후의 시각 지터를 흡수하기에 빠듯해, 정체 probe가 `identity_mismatch`로
// 읽으면 회수가 일어나지 않는다 — 방향은 fail-closed(오살 아님)지만 이 관측이
// 측정하려는 것은 그 지터가 아니다. 올린 값을 관측 줄에 함께 싣는다.
process.env.MCCP_RECLAIM_IDENTITY_TOLERANCE_MS = '10000';

let childPid = null;
let repo = null;

function cleanup() {
  // 실패 경로가 좀비를 남기면 이 스크립트 자체가 PRD가 없애려는 문제를 만든다.
  if (childPid !== null && isPidAlive(childPid)) {
    try { process.kill(childPid, 'SIGKILL'); } catch (_) { /* already gone */ }
  }
  if (repo) {
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  }
}

function fail(msg) {
  process.stderr.write('SMOKE FAILED: ' + msg + '\n');
  cleanup();
  // process.exitCode 설정만으로 끝내지 않는다 — 비동기 잔여 핸들이 있으면 종료 코드가
  // 뒤집힌다.
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  repo = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-smoke-')));

  // 자식은 **파일**로 띄운다. `node -e`는 `__filename`이 `[eval]`이라 명령줄에 스크립트
  // 경로가 없고, §D15 축 1(우리 경로가 첫 script 토큰과 등가인가)이 인위적으로 어긋나
  // `identity_mismatch`가 된다 — 회수가 안 되는 것이 구현 결함이 아니라 하네스 결함이
  // 되는 형태다. 보고서가 기록한 실측 함정이 정확히 이것이다.
  const childPath = path.join(repo, 'keepalive.js');
  fs.writeFileSync(childPath, 'setInterval(function () {}, 1e9);\n', 'utf8');

  const spawnedAtMs = Date.now();
  const child = spawn(process.execPath, [childPath], { stdio: 'ignore' });
  child.on('error', (e) => fail('spawn failed: ' + e.message));
  await sleep(250);   // OS가 프로세스를 보고할 수 있게 될 때까지
  childPid = child.pid;
  if (!Number.isInteger(childPid) || childPid <= 0) fail('no child pid');
  if (!isPidAlive(childPid)) fail('child died before registration (pid ' + childPid + ')');

  const env = Object.assign({}, process.env, { CLAUDE_CODE_SESSION_ID: SID });
  const reg = sp.register(repo, {
    env: env,
    kind: 'plan-codex-runner',
    lifetime: 'session',
    role: 'owner',
    pid: childPid,
    execPath: childPath,
    // 남의 pid를 등록하므로 우리 uptime을 쓸 수 없다(§register 주석) — spawn 시각을 넣는다.
    procStartedAtMs: spawnedAtMs,
  });
  if (!reg || reg.ok !== true) fail('register rejected: ' + JSON.stringify(reg));

  const before = sp.list(repo, SID);
  const targets = (before.records || []).length;
  if (targets !== 1) fail('expected exactly 1 registered record, got ' + targets);

  const out = sp.reclaimSession({ repoRoot: repo, sessionId: SID, env: env });

  // 반환값만 보고 통과시키지 않는다 — PR-Codex R1이 잡았던 결함(신호를 무시한 프로세스를
  // 회수 성공으로 보고)을 그대로 재현하기 때문이다. kill 직후 즉시 읽으면 OS가 아직
  // 회수 전일 수 있으므로 bounded poll로 확인하고, 창을 넘기면 **실패**로 처리한다.
  let aliveAfter = isPidAlive(childPid);
  const deadline = Date.now() + POLL_MAX_MS;
  while (aliveAfter && Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    aliveAfter = isPidAlive(childPid);
  }

  const observation = {
    attempted: out.attempted,
    succeeded: (out.reclaimed || []).length,
    pid: childPid,
    pid_alive_after: aliveAfter,
    skipped: out.skipped || [],
    // 아래는 판정에 쓰이지 않는 관측 맥락이다.
    complete: out.complete,
    unreclaimed: out.unreclaimed || [],
    unverified: out.unverified || [],
    budget_exceeded: out.budgetExceeded,
    platform: process.platform,
    identity_tolerance_ms: sp.resolveIdentityToleranceMs
      ? sp.resolveIdentityToleranceMs(process.env)
      : null,
    sample_size: 1,
  };
  process.stdout.write('RECLAIM_OBSERVATION ' + JSON.stringify(observation) + '\n');

  if (out.complete !== true) fail('reclaimSession reported complete=false');
  if (observation.succeeded !== 1) fail('expected exactly 1 reclaimed pid, got ' + observation.succeeded);
  if (aliveAfter !== false) {
    fail('pid ' + childPid + ' still alive after ' + POLL_MAX_MS + 'ms — reported reclaimed but not dead');
  }

  // 표본 1을 표본 1이라 적는다. 비율로 옮겨 적지 않는다.
  process.stdout.write('회수 관측: 표본 1건, pid ' + childPid + ' 종료 확인됨. 비율로 일반화하지 않는다.\n');
  cleanup();
  process.exit(0);
}

main().catch((e) => fail('uncaught: ' + (e && e.stack ? e.stack : String(e))));
