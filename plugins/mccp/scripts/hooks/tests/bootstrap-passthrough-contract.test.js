'use strict';

// bootstrap.js#passthroughStdinAndExit 의 **stdout 계약** 회귀
// (codex-harness-portability — Codex hook 출력 계약 hotfix).
//
// Claude 쪽 ALLOW 관용구는 stdin 을 stdout 으로 되돌리는 것이고 이 저장소의 hook 24곳이
// 그 형태를 공유한다. Codex 는 hook stdout 을 그 이벤트의 **출력 계약**
// (`continue`/`stopReason`/`decision` …)으로 파싱하므로, 입력 이벤트를 되돌리면
// `hook returned invalid stop hook JSON output` 으로 거부하고 해당 hook 을 Failed 로
// 보고한다. 2026-09-10 음성 대조 실측: 같은 명령에서 echo 면 Stop 3건 전부 Failed,
// 침묵이면 전부 Completed.
//
// 이 파일이 지키는 것은 **비대칭**이다. "codex 에서 조용하다" 만 단언하면 세 호출처를
// 전부 침묵시키는 구현이 통과하고, 그러면 Claude 쪽 ALLOW 신호가 사라진다. 그래서 양쪽을
// 짝으로 단언한다 — 하네스 가드는 침묵, plugin 이 깨진 경로는 여전히 echo.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOKS_DIR = path.resolve(__dirname, '..');
const LIB_DIR = path.resolve(__dirname, '..', '..', 'lib');
const MARKER = require('../bootstrap').MARKER;

const PAYLOAD = JSON.stringify({ hook_event_name: 'Stop', session_id: 'contract', cwd: '/tmp' });

// 가드가 발화하려면 root 안에 오라클이 실재해야 한다 — 못 읽으면 bootstrap 은 기존 동작을
// 유지하도록 설계돼 있어(가드의 부재가 게이트의 부재보다 낫다) 픽스처가 조용히 무의미해진다.
function mkroot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-passthrough-'));
  fs.mkdirSync(path.join(root, 'scripts', 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, MARKER), '// marker\n');
  fs.copyFileSync(path.join(HOOKS_DIR, 'bootstrap.js'), path.join(root, 'scripts', 'hooks', 'bootstrap.js'));
  fs.copyFileSync(path.join(LIB_DIR, 'harness-ingress.js'), path.join(root, 'scripts', 'lib', 'harness-ingress.js'));
  return root;
}

function runBootstrap(root, harness) {
  const env = Object.assign({}, process.env, { CLAUDE_PLUGIN_ROOT: root });
  if (harness) env.MCCP_HARNESS = harness;
  else delete env.MCCP_HARNESS;
  return spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'hooks', 'bootstrap.js'), 'node', 'scripts/hooks/does-not-exist.js'],
    { input: PAYLOAD, encoding: 'utf8', env: env, timeout: 30000 }
  );
}

test('(a) codex 로 지목되면 하네스 가드는 stdout 에 아무것도 쓰지 않는다', () => {
  const root = mkroot();
  const r = runBootstrap(root, 'codex');
  assert.strictEqual(r.status, 0, 'ALLOW 경로이므로 exit 0');
  assert.strictEqual(r.stdout, '', 'Codex 는 stdout 을 출력 계약으로 파싱한다 — 입력 echo 는 계약 위반이다');
  assert.match(r.stderr, /skipping Claude-only hook on harness=codex/, '가드가 실제로 발화한 경로여야 단언이 의미를 갖는다');
});

test('(b) claude 경로의 ALLOW-passthrough echo 는 그대로다 (비대칭 단언)', () => {
  const root = mkroot();
  const r = runBootstrap(root, 'claude');
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, PAYLOAD, 'target 부재 passthrough 는 Claude 관용구를 유지해야 한다');
  assert.doesNotMatch(r.stderr, /skipping Claude-only hook/, '가드가 아니라 target 부재 경로여야 한다');
});

test('(c) 하네스 미지정도 echo 한다 — unknown 에서는 게이트를 지우지 않는다', () => {
  const root = mkroot();
  const r = runBootstrap(root, null);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, PAYLOAD);
});
