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
// 무엇을 재는가 (넷 다 같은 축의 다른 얼굴이다):
//   1. plugin.json 의 version 이 base 와 다른가                    -> 선언
//   2. **2면**(plugin.json + CHANGELOG 노트)이 서로 어긋나는가      -> 반쪽 선언
//   3. 렌더러 두 footer 가 번호를 **파생하는가**(리터럴이면 위반)   -> 선언 재도입
//   4. CHANGELOG 에 base 에 없던 `## [X.Y.Z]` 헤딩이 생겼는가       -> 번호 선점
//
// 2번을 함께 재지 않으면 "CHANGELOG 노트만 올리는" 우회가 남고, 4번을 함께 재지
// 않으면 plugin.json 을 그대로 두고 CHANGELOG 로 번호를 선점하는 우회가 남는다.
// 넷 다 같은 행위의 다른 표면이므로 한 가드가 소유한다.
//
// **3번은 M4 에서 극성이 뒤집혔다.** 그전까지 두 footer 는 번호를 리터럴로 박고
// 있어서 이 가드가 "리터럴이 manifest 와 같은가"를 쟀다. M4 가 두 면을
// `renderer/plugin-version.js` 파생으로 바꾸면서 리터럴이 사라졌고, 그러면 옛
// matcher 는 `undefined` 를 내어 **모든 PR 이** `version-face-unreadable` 로 HALT
// 한다 — 이 주석이 예전에 "Fix the matcher in this guard together with the format
// change" 라고 적었던 바로 그 지점이다. 그래서 판정을 두 단계로 나눈다:
//
//   (1) face **앵커** 를 찾는다 (`<footer …page-foot` · `derived from .claude/`).
//       못 찾으면 `version-face-missing` — 부재는 여전히 위반이다. 역방향 단언만
//       두면 footer 삭제·형식 변경·파일 이름 변경이 전부 '파생'(통과)으로 읽혀,
//       오늘 CI 에서 차단하는 unknown 이 내일은 통과가 된다.
//   (2) 앵커를 찾은 뒤에야 그 줄에 버전 리터럴이 있는지 본다. 있으면
//       `version-face-literal-reintroduced`.
//
// **이 검사의 알려진 잔여(security review MEDIUM, 2026-09-04)**: (2) 는 앵커 **한
// 줄** 만 스캔하므로, 리터럴을 그 줄 밖으로 옮기면(`const FOOTER_V = '1.34.4';` 뒤
// `'…>v' + FOOTER_V`) 앵커는 계속 매치되고 그 줄에 숫자가 없어 '파생'으로 인증된다
// — 파생이 아닌 값에 대해. 구 4면 설계에는 이 구멍이 없었다(어떤 형식 이탈이든
// `undefined` 로 접혀 fail-closed 였다). 즉 극성 반전이 새로 여는 회귀이며,
// **여기서 닫지 않는다.** 보상 검사는 렌더 **출력** 을 manifest 와 대조하는
// plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js 이고, 이 워크플로의
// test 단계가 그것을 실제로 CI 에서 돌린다(M4 이전에는 어떤 워크플로도 그 파일을
// 부르지 않았다 — 5개 중 0개). 분담: 이 가드는 **소스에서 리터럴의 부재** 를,
// 그 test 는 **출력에서 값의 일치** 를 잰다. 둘 중 하나만으로는 위 잔여가 관측되지
// 않는다. 정적 스캔을 모듈 참조 단언으로 승격하는 것은 별개 축이라 backlog 소유.
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

// 두 footer 의 face 앵커. 파일 전수 정규식을 쓰지 않는 것이 핵심이다 — html.js 는
// 이력 주석에 버전 리터럴을 9건 담고 있어서, 파일 전수로 재면 **어떤 상태에서도**
// 붉다(올바른 상태를 포함해서). 그러면 판별력이 0 이고, 예측 가능한 수리는 matcher
// 완화이며 그것이 게이트가 게이트이기를 그만두는 방식이다. 같은 오탐을
// i18n-surface.test.js 가 이미 겪고 태그 앵커로 옮겼다.
const FOOTER_ANCHORS = {
  html_footer: /<footer[^>]*page-foot/,
  markdown_footer: /derived from \.claude\//,
};

// null(파일 못 읽음) 도 'missing' 이다 — 읽을 수 없는 face 는 인증할 수 없는
// face 와 같다. 앵커가 정확히 1줄이 아니면(0줄=삭제/형식변경, 2줄 이상=중복)
// 역시 인증 불가다.
//   'derived'          — 앵커 1줄, 그 줄에 버전 리터럴 없음 (기대 상태)
//   'literal:<v>'      — 앵커 1줄, 그 줄에 리터럴 재도입
//   'missing:<n>'      — 앵커가 1줄이 아님 (n = 찾은 줄 수, 파일 부재는 -1)
function footerFaceState(text, anchorRe) {
  if (text === null) return 'missing:-1';
  const lines = text.split('\n').filter((l) => anchorRe.test(l));
  if (lines.length !== 1) return 'missing:' + lines.length;
  const m = lines[0].match(/\d+\.\d+\.\d+/);
  return m ? 'literal:' + m[0] : 'derived';
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

  // 비교 기준은 base 의 **tip 이 아니라 merge-base** 다. tip 과 대조하면 "이
  // 브랜치가 선언했는가"가 아니라 "main 과 다른가"를 재게 되고, 그러면 아무것도
  // 하지 않은 **뒤처진 브랜치**가 위반으로 잡힌다(실측: command-body-diet 1.34.1
  // vs main 1.34.4 — 그 브랜치는 올린 적이 없다). 같은 혼동을 M2 plan 의 R6
  // 정정이 반대 방향에서 이미 지적했다. 재는 것은 언제나 **이 브랜치가 물려받은
  // 값에서 움직였는가** 다.
  let compareRef;
  try {
    compareRef = git(['merge-base', opts.base, 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_e) {
    fail('no merge-base between ' + opts.base + ' and HEAD — unrelated histories. ' +
      'The guard cannot tell inherited from declared and must not report clean.');
  }

  const baseManifest = readAtRef(compareRef, PLUGIN_MANIFEST);
  if (baseManifest === null) {
    fail('cannot read ' + PLUGIN_MANIFEST + ' at merge-base ' + compareRef + ' — instrument failure');
  }

  const baseVersion = manifestVersion(baseManifest, compareRef);
  const headVersion = manifestVersion(readWorkingTree(repoRoot, PLUGIN_MANIFEST), 'working tree');

  const faces = {
    plugin_json: headVersion,
    html_footer: footerFaceState(readWorkingTree(repoRoot, HTML_FOOTER), FOOTER_ANCHORS.html_footer),
    markdown_footer: footerFaceState(readWorkingTree(repoRoot, MD_FOOTER), FOOTER_ANCHORS.markdown_footer),
    changelog_note: changelogNoteVersion(readWorkingTree(repoRoot, CHANGELOG)),
  };

  const baseHeadings = changelogVersionHeadings(readAtRef(compareRef, CHANGELOG));
  const headHeadings = changelogVersionHeadings(readWorkingTree(repoRoot, CHANGELOG));
  const newHeadings = headHeadings.filter((h) => baseHeadings.indexOf(h) === -1);

  const violations = [];

  if (headVersion !== baseVersion) {
    violations.push({
      rule: 'manifest-version-declared',
      detail: PLUGIN_MANIFEST + ' declares ' + headVersion + ' but its merge-base with ' +
        opts.base + ' (' + compareRef.slice(0, 12) + ') has ' + baseVersion +
        '. A branch does not pick the number; the release cut does.',
    });
  }

  // 렌더러 두 면 — 역방향 단언(리터럴이 있으면 위반), 단 앵커 부재도 위반.
  Object.keys(FOOTER_ANCHORS).forEach(function (k) {
    const state = faces[k];
    if (state === 'derived') return;
    if (state.indexOf('missing:') === 0) {
      const n = state.slice('missing:'.length);
      violations.push({
        rule: 'version-face-missing',
        detail: k + ': ' + (n === '-1'
          ? 'the file could not be read'
          : 'found ' + n + ' lines matching the face anchor ' + FOOTER_ANCHORS[k] +
            ' (expected exactly 1)') +
          '. The face is gone or its anchor moved, so this guard cannot certify that the ' +
          'footer derives its number. Absence is not derivation — restore the anchor, or ' +
          'update this guard together with the format change.',
      });
      return;
    }
    violations.push({
      rule: 'version-face-literal-reintroduced',
      detail: k + ' carries a version literal (' + state.slice('literal:'.length) +
        ') on its footer anchor line. Since M4 both renderer footers derive the number ' +
        'from ' + PLUGIN_MANIFEST + ' via renderer/plugin-version.js; a literal there is a ' +
        'declaration wearing a footer, and it puts back one of the faces the release cut ' +
        'no longer has to move.',
    });
  });

  // 리터럴 대조가 남는 면 — CHANGELOG 노트 하나뿐이다(plugin_json 은 위 1번이 잰다).
  const note = faces.changelog_note;
  if (note === undefined) {
    violations.push({
      rule: 'version-face-unreadable',
      detail: 'changelog_note did not match its expected literal shape (currently `X.Y.Z`) — ' +
        'the face moved, so the two-face check cannot certify anything. Fix the matcher in ' +
        'this guard together with the format change.',
    });
  } else if (note !== null && note !== headVersion) {
    violations.push({
      rule: 'version-face-drift',
      detail: 'changelog_note reads ' + note + ' but ' + PLUGIN_MANIFEST + ' reads ' +
        headVersion + '. A half-declared version is still a declaration.',
    });
  }

  if (newHeadings.length > 0) {
    violations.push({
      rule: 'changelog-version-heading-claimed',
      detail: 'CHANGELOG.md introduces version heading(s) absent from the merge-base: ' +
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
    merge_base: compareRef,
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
    process.stdout.write('ok: no version declaration on this branch (merge-base with ' +
      opts.base + ' = ' + baseVersion + ')\n');
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
  footerFaceState: footerFaceState,
  FOOTER_ANCHORS: FOOTER_ANCHORS,
  changelogNoteVersion: changelogNoteVersion,
  releaseCutReason: releaseCutReason,
};
