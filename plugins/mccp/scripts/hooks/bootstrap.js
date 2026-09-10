#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const MARKER = path.join('scripts', 'lib', 'utils.js');

// 해소 순서가 보안 축이다 (codex-harness-portability M2 · security H1).
//
// 이전 순서는 `env(무검증) → home 스캔`이었고 `__dirname` 폴백이 아예 없었다. 그 형태는
// 두 가지를 허용한다:
//
//   1. `CLAUDE_PLUGIN_ROOT`가 가리키는 트리를 **marker 검증 없이** require한다. 그 이름을
//      쓸 수 있는 무엇이든 26개 hook의 코드 로딩 위치를 지정할 수 있었다.
//   2. env가 비면 곧바로 `~/.claude/plugins/cache/<slug>/<owner>/<ver>/`를 훑는다. Codex에서
//      hooks.json이 살아나면 **Codex가 승인한 본문**(저장소 트리의 해시)과 **실제로 실행되는
//      본문**(임의 버전의 Claude 캐시 사본)이 갈린다. M1의 `plugin-autodiscovery` 레코드가
//      그 경로로 실제 실행이 일어났음을 이미 기록하고 있다.
//
// 그래서 순서를 `env(+marker 검증) → __dirname 상대 → home 스캔`으로 바꾼다. 가운데
// 후보가 핵심이다 — 이 파일이 실제로 놓인 트리이므로, 호스트가 승인한 본문과 실행되는
// 본문이 같아진다. plan Task 7은 이 폴백을 "마지막 후보로" 추가하라고 적었는데 그 자리는
// **도달하지 않는다**(home 스캔이 먼저 성공한다). 위치가 곧 이 수정의 전부다.
function resolveRoot() {
  const env = process.env.CLAUDE_PLUGIN_ROOT;
  if (env && env.trim()) {
    const declared = env.trim();
    if (fs.existsSync(path.join(declared, MARKER))) return declared;
    // 조용히 넘어가지 않는다 — 이 값이 틀렸다는 사실 자체가 진단이다.
    process.stderr.write(
      '[mccp] bootstrap: CLAUDE_PLUGIN_ROOT=' + declared + ' has no ' + MARKER +
      '; ignoring it and resolving from the tree this hook actually lives in.\n'
    );
  }

  // 이 파일 자신의 트리. `plugins/mccp/scripts/hooks/` → `plugins/mccp/`.
  const selfRoot = path.resolve(__dirname, '..', '..');
  if (fs.existsSync(path.join(selfRoot, MARKER))) return selfRoot;

  const home = os.homedir();
  const claude = path.join(home, '.claude');

  if (fs.existsSync(path.join(claude, MARKER))) return claude;

  const segCandidates = [
    ['mccp'], ['mccp@mccp'], ['marketplaces', 'mccp'],
    ['ecc'], ['ecc@ecc'], ['marketplaces', 'ecc'],
  ];
  for (const segs of segCandidates) {
    const dir = path.join(claude, 'plugins', ...segs);
    if (fs.existsSync(path.join(dir, MARKER))) return dir;
  }

  try {
    for (const slug of ['mccp', 'ecc']) {
      const cacheBase = path.join(claude, 'plugins', 'cache', slug);
      if (!fs.existsSync(cacheBase)) continue;
      for (const owner of fs.readdirSync(cacheBase, { withFileTypes: true })) {
        if (!owner.isDirectory()) continue;
        const ownerDir = path.join(cacheBase, owner.name);
        for (const ver of fs.readdirSync(ownerDir, { withFileTypes: true })) {
          if (!ver.isDirectory()) continue;
          const dir = path.join(ownerDir, ver.name);
          if (fs.existsSync(path.join(dir, MARKER))) return dir;
        }
      }
    }
  } catch (_err) {
    // resolve loop is best-effort; loud-fail below if nothing matches.
  }

  return null;
}

function passthroughStdinAndExit() {
  try {
    process.stdout.write(fs.readFileSync(0, 'utf8'));
  } catch (_err) {
    // stdin already drained or closed; nothing to forward.
  }
  process.exit(0);
}

function main() {
  const root = resolveRoot();
  if (!root) {
    process.stderr.write(
      '[mccp] bootstrap: CLAUDE_PLUGIN_ROOT empty + no plugin marker resolvable. ALLOW-passthrough; reinstall plugin or set CLAUDE_PLUGIN_ROOT.\n'
    );
    return passthroughStdinAndExit();
  }

  process.env.CLAUDE_PLUGIN_ROOT = root;
  process.env.MCCP_PLUGIN_ROOT = root;

  // ── 하네스 가드 (codex-harness-portability M2 Task 1 · L2-11 흡수) ─────────
  //
  // `hooks.json`에서 `$schema`를 지우면 Codex에서 **핸들러 29건 전부**가 살아난다.
  // 그중 다섯은 exit 2 + stderr로 도구 호출을 막는 default-deny 가드이고, 그 lock 상태
  // 가정은 Codex에서 한 번도 검증된 적이 없다 — stale lock 하나가 세션 전체를 deny로
  // 만들 수 있다. UI16이 요구하는 것은 "0에서 1로"이지 "0에서 29로"가 아니다.
  //
  // 그래서 **적극적으로 codex로 지목된** 실행에서는 Claude 전용 hook을 통과시킨다.
  // `unknown`에서는 돈다 — 판별자가 실패한 Claude 세션에서 게이트를 통째로 지우는 것이
  // 더 큰 손실이기 때문이다(오작동 방향을 안전 쪽으로 접는다).
  try {
    const ingress = require(path.join(root, 'scripts', 'lib', 'harness-ingress.js'));
    if (!ingress.shouldRunClaudeHook(process.env)) {
      process.stderr.write('[mccp] bootstrap: skipping Claude-only hook on harness=codex\n');
      return passthroughStdinAndExit();
    }
  } catch (_err) {
    // 오라클을 못 읽으면 기존 동작을 유지한다 — 가드의 부재가 게이트의 부재보다 낫다.
  }

  const target = path.join(root, 'scripts', 'hooks', 'plugin-hook-bootstrap.js');
  if (!fs.existsSync(target)) {
    process.stderr.write(`[mccp] bootstrap: target missing at ${target}\n`);
    return passthroughStdinAndExit();
  }

  process.argv[1] = target;
  require(target);
}

// CLI shim과 export를 가른다 (`session-end-marker.js` 외 10건의 선례). hook으로 실행될
// 때의 동작은 그대로이고, test가 `resolveRoot`를 자식 프로세스 없이 부를 수 있게 된다.
module.exports = { MARKER, resolveRoot };

if (require.main === module) main();
