'use strict';

// env-contract/scan.js — 검사 범위의 단일 소유자 (v1.29.1).
//
// 세 소비처가 «같은 범위를 본다»는 주장은 규범으로만 적으면 세 번째 구현이 생기는 것을
// 막지 못한다. 그래서 범위를 **모듈로 지정**한다 — Validation 0b(토글별 비교 형태 감사) ·
// Validation 0c(파일 단위 raw 비교 유무) · lint L9(잔존 raw 비교 0건)는 전부 이 함수를
// 호출하고 자체 walk를 갖지 않는다. drift가 «두 코드가 갈라졌다»가 아니라 «호출하지
// 않았다»가 되어 export 계약이 그것을 잡는다.
//
// **공유되는 것은 «파일 열거»이지 분석이 아니다.** 셋의 결론이 달라도 되는 지점은
// 분석이고, 절대 달라서는 안 되는 지점이 범위다.
//
// 두 surface를 모두 걷는다:
//   - `plugins/mccp/scripts/**/*.js`   — 런타임 코드
//   - `plugins/mccp/commands/*.md`     — 명령 본문. 그 안의 `node -e` 스니펫도 실행되는
//                                        production 코드이며, 실제로 등록 boolean 토글을
//                                        raw로 비교하는 지점이 있었다. 검사 범위가 주장
//                                        범위보다 좁으면 그 주장은 fail-open이다.
//
// 제외:
//   - `*.test.js`      — test는 일부러 raw 비교를 쓴다(파서 자체를 검사하므로).
//   - `env-contract/`  — 이 계약의 구현체 자신. 여기가 raw 비교의 유일한 정당한 자리다.
//   - `tests/` 디렉토리 하위 — fixture와 수동 스모크 스크립트.

const fs = require('fs');
const path = require('path');

const SCRIPTS_REL = 'plugins/mccp/scripts';
const COMMANDS_REL = 'plugins/mccp/commands';

// v1.32.1 M6 — 제외는 **실제 디렉토리**여야 한다. 아래 `isExcluded`는 원래
// `rel.indexOf('env-contract') !== -1`, 즉 경로 **substring**을 봤다. 그러면 이 디렉토리
// 밖에 있는 미래의 `lib/gates/env-contract-bridge.js`나 `commands/env-contract-audit.md`도
// 이름만으로 조용히 면제된다. **예시는 걷는 범위 안에서 든다**(v1.32.1 code-review M3
// 정정): 여기에는 `docs/env-contract-notes.md`가 예로 적혀 있었으나 `walkSurfaces`는
// `scripts/`와 `commands/`만 걷고 `docs/` 하위는 애초에 열거하지 않으므로, 그 예시로는
// «면제된다»가 성립하지 않는다. 오늘 그런 파일은 **0건**이므로(실측:
// `git ls-files | grep env-contract`가 이 디렉토리 밖에서 아무것도 내지 않는다) 이 변경이
// 고치는 파일도 0건이다 — 얻는 것은 **미래의 조용한 면제를 막는 것**뿐이고, 그것이 이
// 태스크의 정직한 크기다.
const ENV_CONTRACT_DIR_REL = 'plugins/mccp/scripts/lib/env-contract/';

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function isExcluded(rel) {
  if (rel.endsWith('.test.js')) return true;
  // `rel`은 모든 호출 지점에서 `toPosix()`를 이미 거쳐 오므로 이 앵커는 백슬래시를
  // 다룰 필요가 없다(Windows에서도 구분자는 '/'다).
  if (rel.indexOf(ENV_CONTRACT_DIR_REL) === 0) return true;
  if (rel.indexOf('/tests/') !== -1) return true;
  return false;
}

function walkDir(absDir, repoRoot, accept, out) {
  let entries = [];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  entries.forEach(function (e) {
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') return;
      walkDir(abs, repoRoot, accept, out);
      return;
    }
    if (!e.isFile()) return;
    const rel = toPosix(path.relative(repoRoot, abs));
    if (!accept(rel)) return;
    if (isExcluded(rel)) return;
    out.push(rel);
  });
  return out;
}

/**
 * 두 surface의 파일 목록을 repo-root 상대 POSIX 경로로 돌려준다.
 * 정렬은 결정적이다 — 소비처가 출력을 그대로 비교·보고하므로 순서가 흔들리면 안 된다.
 *
 * @param {string} repoRoot
 * @returns {string[]}
 */
function walkSurfaces(repoRoot) {
  const root = repoRoot || process.cwd();
  const out = [];
  walkDir(path.join(root, SCRIPTS_REL), root, function (rel) { return rel.endsWith('.js'); }, out);
  walkDir(path.join(root, COMMANDS_REL), root, function (rel) { return rel.endsWith('.md'); }, out);
  out.sort();
  return out;
}

module.exports = {
  walkSurfaces: walkSurfaces,
  SCRIPTS_REL: SCRIPTS_REL,
  COMMANDS_REL: COMMANDS_REL,
};
