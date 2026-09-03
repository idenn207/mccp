#!/usr/bin/env node
'use strict';

// 우산 결정 1 (harness-wiring-integrity.prd.md) 의 기계 강제 지점.
//
//   "자식 브랜치는 plugin.json version 을 선언하지 않는다. 번호는 릴리스 컷이
//    결정한다. 병렬 브랜치 version 충돌(9회 재발 이력)은 브랜치가 미리 번호를
//    잡기 때문에 생긴다."
//
// 그 결정은 채택된 날부터 **관례로만** 존재했다 — C0 PRD 자신이 그렇게 적었다
// ("옮기지 않으면 결정 1은 관례로만 남는다"). 관례의 대가는 실측됐다: 결정이
// 선 뒤에도 자식 다섯이 각자 번호를 선언했고 1.34.5 를 셋이, 1.35.0 을 둘이
// 동시에 주장했다. 결정을 어긴 첫 브랜치가 그 결정을 소유한 C0 자신이었다.
//
// 왜 여기(repo-root scripts/)인가: 배포되는 것은 `plugins/mccp` 하위뿐이다
// (marketplace.json 의 source.path). 이것은 **이 저장소의 릴리스 정책**이지
// 플러그인의 동작이 아니므로, 사용자 저장소에 실려 가서는 안 된다. 같은 이유로
// `/mccp:pr` 커맨드 본문에는 넣지 않는다 — 그러면 남의 저장소에까지 우리
// 릴리스 규율을 강요하게 된다.
//
// 무엇을 재는가 (셋 다 같은 축의 다른 얼굴이다):
//   1. plugin.json 의 version 이 base 와 다른가            -> 선언
//   2. 4면(footer 2 + CHANGELOG 노트)이 plugin.json 과 어긋나는가 -> 반쪽 선언
//   3. CHANGELOG 에 base 에 없던 `## [X.Y.Z]` 헤딩이 생겼는가 -> 번호 선점
//
// 2번을 함께 재지 않으면 "footer 만 올리는" 우회가 남고, 3번을 함께 재지 않으면
// plugin.json 을 그대로 두고 CHANGELOG 로 번호를 선점하는 우회가 남는다. 셋 다
// 같은 행위의 다른 표면이므로 한 가드가 소유한다.
//
// 유일한 합법 경로는 릴리스 컷이다. 그때는 MCCP_RELEASE_CUT 에 **사유**를 담아
// 켠다 (값이 곧 사유 — §3.15 MCCP_REVIEW_SINGLE_PASS 와 같은 형태. 별도 사유
// 변수를 두면 잊을 수 있고 잊힌 사유는 감사 불가다).
//
//   node scripts/version-declaration-guard.js [--base <ref>] [--json]

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PLUGIN_MANIFEST = 'plugins/mccp/.claude-plugin/plugin.json';
const HTML_FOOTER = 'plugins/mccp/scripts/lib/renderer/html.js';
const MD_FOOTER = 'plugins/mccp/scripts/lib/renderer/markdown.js';
const CHANGELOG = 'CHANGELOG.md';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function fail(msg) {
  process.stderr.write('[version-declaration-guard] ' + msg + '\n');
  process.exit(1);
}

function parseFlags(argv) {
  const out = { base: 'origin/main', json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--base' && argv[i + 1]) { out.base = argv[i + 1]; i += 1; }
    else if (argv[i].startsWith('--base=')) out.base = argv[i].slice(7);
  }
  return out;
}

function git(args, opts) {
  return execFileSync('git', args, Object.assign({ encoding: 'utf8' }, opts || {}));
}

// base 쪽 파일을 읽는다. 읽지 못하면 **통과가 아니라 실패**다 — 기구의 죽음은
// 청결이 아니라는 이 저장소의 규칙(§Validation 검사 10/12 주석)과 같은 형태.
function readAtRef(ref, file) {
  try {
    return git(['show', ref + ':' + file], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (_e) {
    return null;
  }
}

function readWorkingTree(repoRoot, file) {
  try {
    return fs.readFileSync(path.join(repoRoot, file), 'utf8');
  } catch (_e) {
    return null;
  }
}

function manifestVersion(text, where) {
  if (text === null) return null;
  let j;
  try { j = JSON.parse(text); } catch (_e) {
    fail('cannot parse ' + PLUGIN_MANIFEST + ' at ' + where + ' — instrument failure, not a clean tree');
  }
  const v = j && j.version;
  if (typeof v !== 'string' || !SEMVER_RE.test(v)) {
    fail(PLUGIN_MANIFEST + ' at ' + where + ' has no usable semver version (got ' + JSON.stringify(v) + ')');
  }
  return v;
}

// 두 footer 는 리터럴이다. 정규식이 못 찾으면 형식이 바뀐 것이고, 그때 조용히
// null 을 흘리면 4면 검사가 도달 불가가 된다 — 그래서 부재도 보고한다.
function htmlFooterVersion(text) {
  if (text === null) return null;
  const m = text.match(/page-foot[^']*?>v(\d+\.\d+\.\d+)/);
  return m ? m[1] : undefined;
}

function markdownFooterVersion(text) {
  if (text === null) return null;
  const m = text.match(/_derived from \.claude\/ · v(\d+\.\d+\.\d+)_/);
  return m ? m[1] : undefined;
}

function changelogNoteVersion(text) {
  if (text === null) return null;
  const m = text.match(/currently `(\d+\.\d+\.\d+)`/);
  return m ? m[1] : undefined;
}

function changelogVersionHeadings(text) {
  if (text === null) return [];
  const out = [];
  const re = /^## \[(\d+\.\d+\.\d+)\]/gm;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

// 릴리스 컷 면제. 값이 곧 사유이므로 형태만 검사한다 — 한 낱말짜리 `1` 은
// 사유가 아니다.
// throw 하고 main 이 잡는다. process.exit 를 여기서 부르면 이 함수를 호출하는
// test 프로세스가 통째로 죽어, 면제 경로가 **검증 불가능**해진다.
function releaseCutReason(env) {
  const raw = env.MCCP_RELEASE_CUT;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  if (trimmed.length < 30 || trimmed.split(' ').length < 3) {
    throw new Error('MCCP_RELEASE_CUT is set but its reason is not substantive (len=' +
      trimmed.length + ' words=' + trimmed.split(' ').length + '). ' +
      'The value IS the reason: state which cut this is and why, in >=30 chars and >=3 words.');
  }
  return trimmed;
}

function main(argv) {
  const opts = parseFlags(argv.slice(2));

  let repoRoot;
  try {
    repoRoot = git(['rev-parse', '--show-toplevel']).trim();
  } catch (_e) {
    fail('not a git repository — the guard cannot resolve a base and must not report clean');
  }

  try {
    git(['rev-parse', '--verify', opts.base], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (_e) {
    fail('base ref ' + JSON.stringify(opts.base) + ' is not resolvable — ' +
      'an unrunnable guard must not read as a pass. Fetch it first (git fetch origin main).');
  }

  const baseManifest = readAtRef(opts.base, PLUGIN_MANIFEST);
  if (baseManifest === null) {
    fail('cannot read ' + PLUGIN_MANIFEST + ' at ' + opts.base + ' — instrument failure');
  }

  const baseVersion = manifestVersion(baseManifest, opts.base);
  const headVersion = manifestVersion(readWorkingTree(repoRoot, PLUGIN_MANIFEST), 'working tree');

  const faces = {
    plugin_json: headVersion,
    html_footer: htmlFooterVersion(readWorkingTree(repoRoot, HTML_FOOTER)),
    markdown_footer: markdownFooterVersion(readWorkingTree(repoRoot, MD_FOOTER)),
    changelog_note: changelogNoteVersion(readWorkingTree(repoRoot, CHANGELOG)),
  };

  const baseHeadings = changelogVersionHeadings(readAtRef(opts.base, CHANGELOG));
  const headHeadings = changelogVersionHeadings(readWorkingTree(repoRoot, CHANGELOG));
  const newHeadings = headHeadings.filter((h) => baseHeadings.indexOf(h) === -1);

  const violations = [];

  if (headVersion !== baseVersion) {
    violations.push({
      rule: 'manifest-version-declared',
      detail: PLUGIN_MANIFEST + ' declares ' + headVersion + ' but ' + opts.base +
        ' has ' + baseVersion + '. A branch does not pick the number; the release cut does.',
    });
  }

  Object.keys(faces).forEach(function (k) {
    if (k === 'plugin_json') return;
    const v = faces[k];
    if (v === undefined) {
      violations.push({
        rule: 'version-face-unreadable',
        detail: k + ' did not match its expected literal shape — the face moved, so the ' +
          'four-face check cannot certify anything. Fix the matcher in this guard together with the format change.',
      });
      return;
    }
    if (v !== null && v !== headVersion) {
      violations.push({
        rule: 'version-face-drift',
        detail: k + ' reads ' + v + ' but ' + PLUGIN_MANIFEST + ' reads ' + headVersion +
          '. A half-declared version is still a declaration.',
      });
    }
  });

  if (newHeadings.length > 0) {
    violations.push({
      rule: 'changelog-version-heading-claimed',
      detail: 'CHANGELOG.md introduces version heading(s) absent from ' + opts.base + ': ' +
        newHeadings.join(', ') + '. Unreleased work goes under "## [Unreleased]" — ' +
        'claiming a numbered heading reserves a number the release cut has not assigned.',
    });
  }

  let cutReason;
  try {
    cutReason = releaseCutReason(process.env);
  } catch (err) {
    fail(err.message);
  }
  const ok = violations.length === 0 || cutReason !== null;

  const report = {
    ok: ok,
    base: opts.base,
    base_version: baseVersion,
    declared_version: headVersion,
    faces: faces,
    new_changelog_headings: newHeadings,
    violations: violations,
    release_cut_reason: cutReason,
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else if (violations.length === 0) {
    process.stdout.write('ok: no version declaration on this branch (base ' + opts.base +
      ' = ' + baseVersion + ')\n');
  } else if (cutReason) {
    process.stdout.write('release cut allowed: ' + cutReason + '\n');
    violations.forEach(function (v) {
      process.stdout.write('  (allowed) ' + v.rule + ': ' + v.detail + '\n');
    });
  } else {
    process.stderr.write('[version-declaration-guard] HALT — umbrella decision 1 ' +
      '(harness-wiring-integrity.prd.md): a child branch does not declare a version.\n');
    violations.forEach(function (v) {
      process.stderr.write('  ' + v.rule + ': ' + v.detail + '\n');
    });
    process.stderr.write('\nFix: restore every face to the base value (' + baseVersion +
      ') and move the CHANGELOG entry under "## [Unreleased]".\n');
    process.stderr.write('If this IS the release cut, set MCCP_RELEASE_CUT to the reason ' +
      '(>=30 chars, >=3 words) — the value is the audit record.\n');
  }

  return ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  changelogVersionHeadings: changelogVersionHeadings,
  htmlFooterVersion: htmlFooterVersion,
  markdownFooterVersion: markdownFooterVersion,
  changelogNoteVersion: changelogNoteVersion,
  releaseCutReason: releaseCutReason,
};
