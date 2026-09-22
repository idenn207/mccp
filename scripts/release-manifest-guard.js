#!/usr/bin/env node
'use strict';

// 릴리스 좌표 파일(`.claude-plugin/marketplace.json`)의 형태 단언을 소유한다.
//
// 왜 상시 가드인가: 채널이 닫는 것은 **plugin 본문**이지 좌표 파일이 아니다.
// `~/.claude/plugins/known_marketplaces.json` 의 mccp 항목에는 `ref` 가 없어
// marketplace clone 은 계속 main 을 추종하고, 따라서 이 파일 자체의 편집은
// 릴리스 컷을 거치지 않고 **머지 즉시 사용자에게 도달한다**
// (docs/release-channel.md 6절 실측). 그래서 이 파일은 릴리스 표면이다.
//
// 그 6절은 탐지기의 약점도 적어 뒀다: "사이클마다 실행돼야만 작동한다 …
// 아무도 부르지 않는 사이클에는 아무것도 재지 않는다." 이 스크립트와
// .github/workflows/release-manifest-gate.yml 이 그 문장을 은퇴시킨다.
//
// 무엇을 재는가 (전부 같은 축 — "코드를 어디서, 어느 좌표로 가져오는가"):
//   1. mccp 엔트리가 정확히 하나인가                  -> entry-missing / entry-ambiguous
//   2. source 가 객체인가 (M1 이전엔 상대경로 문자열)  -> source-not-object
//   3. source.source === 'git-subdir'                 -> source-kind
//   4. source.url    === 저장소 upstream URL           -> source-url
//   5. source.path   === 'plugins/mccp'                -> source-path
//   6. source.ref    === 'release'                     -> source-ref
//   7. `sha` 키 부재                                    -> source-sha-pinned
//
// 4번을 **존재가 아니라 값으로** 재는 이유: `url` 은 이 파일에서 유일하게 "코드를
// 어디서 가져오는가"를 정한다. 병합 사고(CLAUDE.md §3.5.1 선례)가 url 을 다른
// 저장소로 바꾸면 ref·path·sha 단언은 전부 통과하고 version-declaration-guard 는
// 이 파일을 아예 보지 않으므로, 다른 출처의 plugin 본문이 fetch 되는 경로가 어떤
// 검사에도 걸리지 않는다.
//
// 7번에 env escape 를 두지 않는 이유: 사고 대응 시 `sha` 를 일시적으로 박는 것은
// PRD 결정 2 가 허용하지만, escape 는 그 "일시"를 **연장하는** 방향으로만 작동한다.
// 대신 `sha` 가 있으면 가드가 붉어지고 그 red 가 타이머가 된다 — 핀이 빠질 때까지
// 계속 붉다. 이것이 성립하려면 워크플로에 `paths` 필터가 **없어야** 하고, 실제로
// 없다(그 파일의 주석이 이유를 적는다). 이 설계의 비용(사고 대응 커밋이 red 를
// 안고 머지돼야 한다)은 리뷰가 MEDIUM 으로 지적했고 backlog 가 소유한다.
//
// 이 가드가 재지 **않는** 것: custody 다. 좌표가 옳은지는 보지만, 그 좌표가 직접
// push 로부터 보호되는지(release 브랜치 보호 없음 — docs/release-channel.md 7절,
// 2026-09-04 실측 404)나 이 검사가 main 의 required status check 로 지정됐는지는
// 보지 않는다. 형태이지 custody 가 아니다.
//
// 기구의 죽음은 청결이 아니다: 읽기·파싱 실패는 통과가 아니라 HALT(exit 1) 다.
// version-declaration-guard.js 가 세운 같은 규칙이다.
//
//   node scripts/release-manifest-guard.js [--json]

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MANIFEST = '.claude-plugin/marketplace.json';
const PLUGIN_NAME = 'mccp';

const EXPECTED = {
  source: 'git-subdir',
  url: 'https://github.com/idenn207/mccp.git',
  path: 'plugins/mccp',
  ref: 'release',
};

function fail(msg) {
  process.stderr.write('[release-manifest-guard] ' + msg + '\n');
  process.exit(1);
}

function parseFlags(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') out.json = true;
  }
  return out;
}

// 순수 함수. test 가 fixture 로 판별력을 재는 지점이며, 어떤 I/O 도 하지 않고
// process.exit 도 부르지 않는다 (헬퍼에서 exit 하면 이 함수를 호출하는 test
// 프로세스가 통째로 죽어 위반 경로가 검증 불가능해진다 —
// version-declaration-guard.js:128-129 가 세운 같은 규칙).
function evaluateManifest(obj) {
  const violations = [];
  const push = (rule, detail) => violations.push({ rule: rule, detail: detail });

  const plugins = obj && Array.isArray(obj.plugins) ? obj.plugins : [];
  const matches = plugins.filter((p) => p && p.name === PLUGIN_NAME);

  if (matches.length === 0) {
    push('entry-missing', 'no plugin entry named ' + JSON.stringify(PLUGIN_NAME) +
      ' in ' + MANIFEST + '. The release coordinates cannot be certified for a plugin ' +
      'this marketplace does not declare.');
    return { ok: false, entry: null, violations: violations };
  }

  if (matches.length > 1) {
    // 중복 엔트리는 "탐색 실패" 의 한 형태다 — 어느 쪽이 사용자에게 해소되는지
    // (첫 매치인지 마지막 매치인지) 이 저장소는 측정한 바 없으므로, 준수하는
    // 미끼 엔트리 옆에 비준수 그림자 엔트리를 두는 형태를 통과시켜서는 안 된다.
    push('entry-ambiguous', MANIFEST + ' declares ' + matches.length + ' plugin entries ' +
      'named ' + JSON.stringify(PLUGIN_NAME) + '. Which one the loader resolves is not ' +
      'measured here, so the coordinates are not certifiable.');
    return { ok: false, entry: null, violations: violations };
  }

  const entry = matches[0];
  const source = entry.source;

  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    // M1 이전 형태: source 가 상대경로 문자열(`"./plugins/mccp"`). 이 분기가
    // 없으면 아래 값 단언들이 전부 undefined 대조로 흩어져 무엇이 잘못됐는지
    // 흐려진다.
    push('source-not-object', MANIFEST + ' entry ' + JSON.stringify(PLUGIN_NAME) +
      ' has source ' + JSON.stringify(source) + ' — expected a git-subdir object. ' +
      'A bare string source is the pre-M1 layout, which pins nothing.');
    return { ok: false, entry: entry, violations: violations };
  }

  if (Object.prototype.hasOwnProperty.call(source, 'sha')) {
    push('source-sha-pinned', MANIFEST + ' source carries a `sha` key (' +
      JSON.stringify(source.sha) + '). A commit pin is allowed only as a temporary ' +
      'incident measure (PRD decision 2); this guard is the timer that keeps it ' +
      'temporary. Remove the pin to go green.');
  }

  const CHECKS = [
    ['source', 'source-kind'],
    ['url', 'source-url'],
    ['path', 'source-path'],
    ['ref', 'source-ref'],
  ];
  CHECKS.forEach(function (pair) {
    const key = pair[0];
    const rule = pair[1];
    const got = source[key];
    const want = EXPECTED[key];
    if (got !== want) {
      push(rule, MANIFEST + ' source.' + key + ' is ' + JSON.stringify(got) +
        ' but must be ' + JSON.stringify(want) + '.');
    }
  });

  return { ok: violations.length === 0, entry: entry, violations: violations };
}

function main(argv) {
  const opts = parseFlags(argv.slice(2));

  let repoRoot;
  try {
    repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch (_e) {
    fail('not a git repository — the guard cannot locate ' + MANIFEST +
      ' and must not report clean');
  }

  const abs = path.join(repoRoot, MANIFEST);

  let raw;
  try {
    raw = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    fail('cannot read ' + MANIFEST + ' (' + (err && err.code) +
      ') — instrument failure, not a clean tree');
  }

  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (_e) {
    fail('cannot parse ' + MANIFEST + ' as JSON — instrument failure, not a clean tree');
  }

  const result = evaluateManifest(obj);

  const report = {
    ok: result.ok,
    manifest: MANIFEST,
    entry: result.entry,
    violations: result.violations,
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else if (result.ok) {
    process.stdout.write('ok: release coordinates intact (' + EXPECTED.source + ' ' +
      EXPECTED.url + ' ' + EXPECTED.path + '@' + EXPECTED.ref + ', no sha pin)\n');
  } else {
    process.stderr.write('[release-manifest-guard] HALT — ' + MANIFEST +
      ' is a RELEASE SURFACE: edits to it reach installs on merge, without a cut ' +
      '(docs/release-channel.md 6절).\n');
    result.violations.forEach(function (v) {
      process.stderr.write('  ' + v.rule + ': ' + v.detail + '\n');
    });
  }

  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  evaluateManifest: evaluateManifest,
  MANIFEST: MANIFEST,
  EXPECTED: EXPECTED,
};
