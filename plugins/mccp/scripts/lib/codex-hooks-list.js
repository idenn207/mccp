'use strict';

// app-server의 `hooks/list`를 한 번 부르고 결과를 stdout에 JSON으로 낸다.
//
// **왜 별도 파일인가.** `cli.js`는 `spawnSync`만 쓴다(실행층의 단순함이 그 파일의 계약이다).
// 그런데 app-server는 stdio JSON-RPC라 요청·응답을 주고받아야 하므로 비동기 스트림이
// 필요하다. 그 비동기성을 `cli.js` 안으로 들이면 실행층이 두 모델을 갖게 되므로, 왕복은
// 이 파일이 하고 `cli.js`는 여전히 `spawnSync` 한 번으로 부른다.
//
// 이 파일은 **묻기만 한다** — 승인 기록을 쓰지 않는다. 쓰는 것은 호출자다
// (프로브: `scripts/codex-probe/cli.js#grantHookTrust` · 제품: `codex-bootstrap.js`).
//
// **M3.5에 프로브에서 여기로 옮겨졌다.** 제품 부트스트랩이 같은 왕복을 필요로 하는데
// `scripts/codex-probe/`는 배포 트리 밖이라 설치된 환경에 존재하지 않는다. 사본을 두면
// 갈라지므로 옮기고 프로브가 이쪽을 부른다.

const { spawn } = require('child_process');

const HOME = process.argv[2];
const CWD = process.argv[3] || process.cwd();
const TIMEOUT_MS = Number(process.env.MCCP_PROBE_HOOKS_LIST_TIMEOUT_MS || 45000);

function fail(msg) {
  process.stderr.write('[hooks-list] ' + msg + '\n');
  process.exit(1);
}

if (!HOME) fail('usage: hooks-list.js <codex-home> [cwd]');

const child = spawn(process.env.MCCP_PROBE_CODEX_BIN || 'codex', ['app-server'], {
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: Object.assign({}, process.env, { CODEX_HOME: HOME }),
});

let done = false;
function finish(code, payload) {
  if (done) return;
  done = true;
  clearTimeout(timer);
  if (payload) process.stdout.write(JSON.stringify(payload));
  try { child.kill(); } catch (_) { /* already gone */ }
  process.exit(code);
}

const timer = setTimeout(function () {
  process.stderr.write('[hooks-list] timed out after ' + TIMEOUT_MS + 'ms\n');
  finish(1, null);
}, TIMEOUT_MS);

function send(obj) { child.stdin.write(JSON.stringify(obj) + '\n'); }

let buf = '';
child.stdout.on('data', function (chunk) {
  buf += chunk.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    if (msg.id === 1 && msg.result) {
      send({ method: 'initialized', params: {} });
      send({ id: 2, method: 'hooks/list', params: { cwds: [CWD] } });
    } else if (msg.id === 2) {
      if (msg.error) {
        process.stderr.write('[hooks-list] hooks/list error: ' + JSON.stringify(msg.error) + '\n');
        finish(1, null);
      } else {
        finish(0, msg.result || { data: [] });
      }
    }
  }
});

child.on('error', function (err) { process.stderr.write('[hooks-list] spawn failed: ' + err.message + '\n'); finish(1, null); });
child.on('exit', function (code) {
  if (!done) { process.stderr.write('[hooks-list] app-server exited ' + code + ' before responding\n'); finish(1, null); }
});

send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'mccp-codex-hooks-list', version: '1' } } });
