'use strict';

// 축 D 절단 오라클 (M3 Task 7). 이 파일이 **강제 workflow 형태의 유일한 단언자**다.
//
// ── 오라클은 주석이 아니라 실행 줄을 본다 ───────────────────────────────────
// 이 저장소는 이미 한 번 당했다 — §3.17의 `impeccable-resolve.test.js`는 명령 본문
// 전문을 훑어 리터럴을 모았고, 진짜 호출이 전부 걷힌 뒤에도 **산문 한 줄이 남아
// green을 유지했다**. "배선이 아니라 산문을 검사하고 있었다."
//
// 여기서 그 사고가 재현될 조건은 갖춰져 있다: Task 5.3이 4단 헤더 주석을 요구하고
// 그 주석이 단계 순서를 **서술**하므로, 절단이 실행 줄만 지워도 주석의 같은 문자열이
// test를 green으로 유지한다. 그래서 스캔 전에 주석을 걷고, **그 성질 자체를 짝
// 단언으로 고정한다** — 합성 fixture 둘에 대해 실행 줄만 있는 쪽은 만족하고 주석에만
// 있는 쪽은 만족하지 **않아야** 한다.
//
// ── 스캔 범위는 판정 줄 안이다 ──────────────────────────────────────────────
// 토큰이 파일 어디에나 있으면 만족하는 오라클이면, 판정 줄에서 `--exclude-from`을
// 지워도 **열거 sanity 단계**의 같은 토큰이 green을 유지한다. 그것이 위양성이고,
// (f2)가 그 위양성을 짝 단언으로 잡는다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const GATE_WF = path.join(REPO, '.github', 'workflows', 'test-suite.yml');
const BASELINE_WF = path.join(REPO, '.github', 'workflows', 'test-suite-baseline.yml');
const CUT = path.join(REPO, 'scripts', 'test-suite', 'wiring-cut.js');

// ─────────────────────────────────────────────────────────────────────────────
// 스캔 원시 도구 — 전부 **주석을 걷어낸 뒤** 동작한다
// ─────────────────────────────────────────────────────────────────────────────

/** 주석 줄을 제거한다. 인라인 `#`은 값 안의 `#`과 구분할 수 없어 건드리지 않는다. */
function stripComments(yamlText) {
  return String(yamlText).split(/\r?\n/)
    .filter(function (line) { return !/^\s*#/.test(line); })
    .join('\n');
}

/** `run:` 블록의 본문 줄만 모은다. 이것이 "실행 줄"의 정의다. */
function runLines(yamlText) {
  const lines = stripComments(yamlText).split('\n');
  const out = [];
  let inRun = false;
  let runIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') { continue; }
    const indent = line.length - line.replace(/^\s*/, '').length;
    const inline = line.match(/^(\s*)-?\s*run:\s*(\S.*)$/);
    const block = line.match(/^(\s*)-?\s*run:\s*\|\s*$/);
    if (block) { inRun = true; runIndent = block[1].length; continue; }
    if (inline && inline[2] !== '|') { out.push(inline[2].trim()); inRun = false; continue; }
    if (inRun) {
      if (indent > runIndent) { out.push(line.trim()); continue; }
      inRun = false;
    }
  }
  return out;
}

/** 판정 줄 — `gate.js`로 시작하는 `run:` 줄. 스캔 범위는 **이 줄 안**이다. */
function gateLine(yamlText) {
  return runLines(yamlText).find(function (l) {
    return /\bnode\s+scripts\/test-suite\/gate\.js\b/.test(l);
  }) || null;
}

/** step 블록을 순서대로 자른다. 각 블록은 `- ` 로 시작하는 항목의 원문이다. */
function steps(yamlText) {
  const lines = stripComments(yamlText).split('\n');
  const blocks = [];
  let cur = null;
  let stepIndent = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(\s*)- (?:name:|uses:|run:)/);
    if (m && (stepIndent === null || m[1].length === stepIndent)) {
      if (stepIndent === null) stepIndent = m[1].length;
      if (cur) blocks.push(cur);
      cur = line + '\n';
      continue;
    }
    if (cur !== null) cur += line + '\n';
  }
  if (cur) blocks.push(cur);
  return blocks;
}

function stepIndexMatching(yamlText, re) {
  const s = steps(yamlText);
  for (let i = 0; i < s.length; i++) if (re.test(s[i])) return i;
  return -1;
}

// 합성 fixture를 만드는 헬퍼 — 실제 workflow를 변형해 각 단언의 부정을 만든다.
function mutate(fn) {
  return fn(fs.readFileSync(GATE_WF, 'utf8'));
}

// 각 단언을 함수로 노출한다 — 합성 fixture에 같은 판정을 적용할 수 있어야
// "이 단언이 그 변형을 실제로 잡는가"를 재는 짝 단언이 성립한다.
const ASSERTIONS = {
  gateLineTokens: function (y) {
    const line = gateLine(y);
    if (!line) return false;
    const required = [
      'gate.js', '--measurement measurement.json',
      '--exclude-from .github/test-suite-exclusions.json',
      '--floor-from .github/test-suite-floor.json',
      '--base-ref "origin/$BASE_REF"',
      '--json', '> gate.json',
    ];
    return required.every(function (t) { return line.indexOf(t) >= 0; });
  },
  gateLineFlagUniqueness: function (y) {
    const line = gateLine(y);
    if (!line) return false;
    return ['--measurement', '--exclude-from', '--floor-from', '--base-ref'].every(function (flag) {
      const hits = line.split(flag).length - 1;
      return hits === 1;
    });
  },
  baseRefEnvBinding: function (y) {
    // 값이 두 곳에 나뉘어 살기 때문에 이 인자에 한해 스캔 범위가 그 step의 `env:`
    // 블록까지 넓어진다. 규칙은 하나다 — **단언은 값이 정의된 자리를 본다.**
    const idx = stepIndexMatching(y, /\bnode\s+scripts\/test-suite\/gate\.js\b/);
    if (idx < 0) return false;
    const block = steps(y)[idx];
    return /BASE_REF:\s*\$\{\{\s*github\.base_ref\s*\|\|\s*'main'\s*\}\}/.test(block);
  },
  noContinueOnError: function (y) {
    return !/continue-on-error/.test(stripComments(y));
  },
  noConditionalsExceptUpload: function (y) {
    // `if:`가 나타나도 되는 자리는 업로드 단계 하나이고 값도 리터럴 `always()`다.
    // 대상은 **클래스 전체**(모든 step과 job)이지 열거된 두 step이 아니다 — 열거는
    // 전수 실행 step을 사거리 밖에 남겼고, 그 step이 skip되면 판정이 PR이 커밋해 둔
    // measurement.json을 읽는다.
    const stripped = stripComments(y);
    const ifs = stripped.split('\n').filter(function (l) { return /^\s+if:\s/.test(l); });
    if (ifs.length === 0) return true;
    return ifs.every(function (l) { return /^\s+if:\s*always\(\)\s*$/.test(l); }) &&
      ifs.length === 1 &&
      /upload-artifact/.test(steps(y)[stepIndexMatching(y, /if:\s*always\(\)/)] || '');
  },
  noExitCodeSuppression: function (y) {
    // 가장 값싼 과대허용 무력화다 — 판정 줄 뒤에 `|| true` 한 토막이면 다른 모든
    // 단언이 green인 채 게이트의 차단이 체크를 red로 만들지 못한다. 대상은 판정
    // step 하나가 아니라 **모든 `run:` 블록**이다.
    const lines = runLines(y);
    return lines.every(function (l) {
      if (/\|\|\s*true\b/.test(l)) return false;
      if (/\|\|\s*:\s*$/.test(l)) return false;
      if (/\bset\s+\+e\b/.test(l)) return false;
      if (/\bset\s+\+o\s+errexit\b/.test(l)) return false;
      if (/^exit\s+0\s*$/.test(l)) return false;
      return true;
    });
  },
  forkDefences: function (y) {
    const stripped = stripComments(y);
    if (!/permissions:\s*\n\s*contents:\s*read/.test(stripped)) return false;
    if (!/persist-credentials:\s*false/.test(stripped)) return false;
    if (/pull_request_target/.test(stripped)) return false;
    if (/secrets\./.test(stripped)) return false;
    const uses = stripped.match(/uses:\s*\S+/g) || [];
    if (uses.length === 0) return false;
    return uses.every(function (u) { return /@[0-9a-f]{40}\b/.test(u); });
  },
  baseRefPrerequisites: function (y) {
    const stripped = stripComments(y);
    if (!/fetch-depth:\s*0/.test(stripped)) return false;
    const fetchIdx = stepIndexMatching(y, /git fetch --no-tags origin/);
    const gateIdx = stepIndexMatching(y, /\bnode\s+scripts\/test-suite\/gate\.js\b/);
    return fetchIdx >= 0 && gateIdx >= 0 && fetchIdx < gateIdx;
  },
  precedingSteps: function (y) {
    const lines = runLines(y);
    const has = function (re) { return lines.some(function (l) { return re.test(l); }); };
    if (!has(/scripts\/test-suite\/exclusions\.js --check \.github\/test-suite-exclusions\.json/)) return false;
    // 열거 sanity는 **두 호출**로 이뤄진다. 하나만 요구하면 정체성 검사를 지운
    // 편집이 통과한다 — 격리 분할 검사의 `--list --exclude-from` 줄이 같은 정규식을
    // 만족하기 때문이다(음성 fixture "the enumerate sanity step removed"가 실측했다).
    //  1. 정체성 — 플래그 없는 `--list`가 `git ls-files`와 같은가
    if (!has(/scripts\/test-suite\/run\.js --list \|/)) return false;
    if (!has(/git ls-files '\*\.test\.js'/)) return false;
    //  2. 격리 분할 — 두 호출의 개수 차이가 floor 파일의 상한과 같은가
    if (!has(/scripts\/test-suite\/run\.js --list --exclude-from \.github\/test-suite-exclusions\.json/)) return false;
    // 판정자 자기 test — 두 파일이 **둘 다** 있어야 한다. 뒤의 것이 workflow 형태의
    // 유일한 단언자이므로 그것이 조용히 빠지면 오라클 전체가 무력화된다.
    if (!has(/node --test .*scripts\/tests\/test-suite-coverage\.test\.js.*scripts\/tests\/wiring-cut\.test\.js/)) return false;
    // 전수 실행 — **인자 값까지** 리터럴 일치.
    if (!has(/scripts\/test-suite\/run\.js --exclude-from \.github\/test-suite-exclusions\.json --json > measurement\.json/)) return false;
    // 업로드가 판정 **뒤**에 있고 `if: always()`를 갖는다.
    const upIdx = stepIndexMatching(y, /upload-artifact/);
    const gateIdx = stepIndexMatching(y, /\bnode\s+scripts\/test-suite\/gate\.js\b/);
    if (!(upIdx > gateIdx && gateIdx >= 0)) return false;
    return /if:\s*always\(\)/.test(steps(y)[upIdx]);
  },
  producerBeforeConsumer: function (y) {
    // 단언 1d는 producer를 *끄는* 것만 막고 producer보다 **먼저 판정하는 것**은
    // 막지 못한다. 판정 step을 앞으로 옮기면 다섯 step이 전부 존재하고 어디에도
    // `if:`가 없고 네 인자가 리터럴 그대로인데, 판정은 PR이 커밋해 둔
    // measurement.json을 읽는다. 순서는 **의존하는 쌍에만** 건다.
    const runIdx = stepIndexMatching(y, /run\.js --exclude-from .* --json > measurement\.json/);
    const gateIdx = stepIndexMatching(y, /\bnode\s+scripts\/test-suite\/gate\.js\b/);
    return runIdx >= 0 && gateIdx >= 0 && runIdx < gateIdx;
  },
  noNarrowingTriggerKeys: function (y) {
    // 다섯 전부의 부재를 단언한다. `paths` 둘만 보면 `branches: [release]`나
    // `types: [labeled]`가 대부분의 PR에서 workflow를 아예 발화시키지 않는데도 green이다.
    const stripped = stripComments(y);
    const m = stripped.match(/\non:\n([\s\S]*?)\n(?=\S)/);
    if (!m) return false;
    const onBlock = m[1];
    return !/^\s+(paths|paths-ignore|branches|branches-ignore|types):/m.test(onBlock);
  },
  noExpressionInRun: function (y) {
    // 클래스 전체를 잰다 — 두 지점에만 걸면 나중에 attacker-controlled 값
    // (`github.head_ref` · PR 제목)을 다른 step의 `run:`에 보간하는 편집이 통과한다.
    return runLines(y).every(function (l) { return l.indexOf('${{') < 0; });
  },
  checkoutSeesPrTree: function (y) {
    const idx = stepIndexMatching(y, /actions\/checkout/);
    if (idx < 0) return false;
    return !/^\s+ref:\s/m.test(steps(y)[idx]);
  },
  resourceBounds: function (y) {
    const stripped = stripComments(y);
    // **job 수준**이어야 한다 — step 하나에 두면 값 단언은 green인데 전수 실행 step은
    // GitHub 기본 360분을 유지해 required check 영구 pending이 그대로 열린다.
    if (!/^\s{4}timeout-minutes:\s*60\s*$/m.test(stripped)) return false;
    if (/^\s{6,}timeout-minutes:/m.test(stripped)) return false;
    if (!/group:\s*test-suite-\$\{\{\s*github\.ref\s*\}\}/.test(stripped)) return false;
    if (!/cancel-in-progress:\s*true/.test(stripped)) return false;
    if (!/node-version:\s*'20'/.test(stripped)) return false;
    return true;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 단언 1~3b — 실제 강제 workflow에 대해
// ─────────────────────────────────────────────────────────────────────────────

const LIVE = function () { return fs.readFileSync(GATE_WF, 'utf8'); };

test('(1) the gate line carries every token AND every literal argument value', () => {
  assert.ok(ASSERTIONS.gateLineTokens(LIVE()), gateLine(LIVE()) || '(no gate line found)');
});

test('(1-uniq) each pinned flag appears EXACTLY once in the gate line', () => {
  // 존재만 재는 단언은 중복 플래그에 무감하다 — 리터럴 쌍을 그대로 둔 채 뒤에 같은
  // 플래그를 다른 값으로 붙이면 last-wins 파서가 뒤의 값을 쓰는데 오라클은 green이다.
  assert.ok(ASSERTIONS.gateLineFlagUniqueness(LIVE()));
});

test('(1-env) BASE_REF is bound to github.base_ref, not head_ref or HEAD', () => {
  assert.ok(ASSERTIONS.baseRefEnvBinding(LIVE()));
});

test('(1c) the workflow carries no continue-on-error anywhere', () => {
  assert.ok(ASSERTIONS.noContinueOnError(LIVE()));
});

test('(1d) no step or job carries if:, except the upload step with a literal always()', () => {
  assert.ok(ASSERTIONS.noConditionalsExceptUpload(LIVE()));
});

test('(1e) no run: block suppresses an exit code', () => {
  assert.ok(ASSERTIONS.noExitCodeSuppression(LIVE()));
});

test('(1b) the five fork-PR defences all hold', () => {
  assert.ok(ASSERTIONS.forkDefences(LIVE()));
});

test('(2) base ref prerequisites exist and precede the gate', () => {
  assert.ok(ASSERTIONS.baseRefPrerequisites(LIVE()));
});

test('(2b) all four preceding steps exist as execution lines', () => {
  assert.ok(ASSERTIONS.precedingSteps(LIVE()));
});

test('(2b2) the producer step precedes the consumer step', () => {
  assert.ok(ASSERTIONS.producerBeforeConsumer(LIVE()));
});

test('(2c) resource bounds are pinned by value AND at job level', () => {
  assert.ok(ASSERTIONS.resourceBounds(LIVE()));
});

test('(2d) checkout has no ref: — the gate judges the PR tree', () => {
  assert.ok(ASSERTIONS.checkoutSeesPrTree(LIVE()));
});

test('(3) on.pull_request carries none of the five narrowing keys', () => {
  assert.ok(ASSERTIONS.noNarrowingTriggerKeys(LIVE()));
});

test('(3b) no run: block interpolates a GitHub expression', () => {
  assert.ok(ASSERTIONS.noExpressionInRun(LIVE()));
});

// ─────────────────────────────────────────────────────────────────────────────
// (f) 합성 fixture — 각 단언의 **부정** 하나씩. 없으면 단언이 그 변형을 실제로
//     잡는지 알 수 없고, 오라클이 위양성인지도 알 수 없다.
// ─────────────────────────────────────────────────────────────────────────────

const NEGATIVES = [
  ['--floor-from removed from the gate line', 'gateLineTokens',
    function (y) { return y.replace(' --floor-from .github/test-suite-floor.json', ''); }],
  ['--exclude-from removed from the gate line ONLY', 'gateLineTokens',
    function (y) { return y.replace(/(gate\.js[^\n]*?) --exclude-from \.github\/test-suite-exclusions\.json/, '$1'); }],
  ['--base-ref removed', 'gateLineTokens',
    function (y) { return y.replace(' --base-ref "origin/$BASE_REF"', ''); }],
  ['--json removed from the gate line', 'gateLineTokens',
    function (y) { return y.replace(/(gate\.js[^\n]*?) --json > gate\.json/, '$1 > gate.json'); }],
  ['the > gate.json redirect removed', 'gateLineTokens',
    function (y) { return y.replace(' --json > gate.json', ' --json'); }],
  ['gate.js swapped for coverage.js', 'gateLineTokens',
    function (y) { return y.replace('node scripts/test-suite/gate.js', 'node scripts/test-suite/coverage.js'); }],
  ['--exclude-from value pointed at another file', 'gateLineTokens',
    function (y) { return y.replace(/(gate\.js[^\n]*?)--exclude-from \.github\/test-suite-exclusions\.json/, '$1--exclude-from other.json'); }],
  ['--measurement value pointed at another file', 'gateLineTokens',
    function (y) { return y.replace('--measurement measurement.json', '--measurement committed.json'); }],
  ['--base-ref value replaced with HEAD', 'gateLineTokens',
    function (y) { return y.replace('--base-ref "origin/$BASE_REF"', '--base-ref HEAD'); }],
  ['--floor-from given a second time with another value', 'gateLineFlagUniqueness',
    function (y) { return y.replace(' --json > gate.json', ' --floor-from bogus.json --json > gate.json'); }],
  ['--base-ref given a second time', 'gateLineFlagUniqueness',
    function (y) { return y.replace(' --json > gate.json', ' --base-ref HEAD --json > gate.json'); }],
  ['BASE_REF bound to github.head_ref', 'baseRefEnvBinding',
    function (y) { return y.replace(/BASE_REF: \$\{\{ github\.base_ref \|\| 'main' \}\}\n(\s+)run: node scripts\/test-suite\/gate\.js/, "BASE_REF: ${{ github.head_ref }}\n$1run: node scripts/test-suite/gate.js"); }],
  ['the BASE_REF env mapping deleted from the gate step', 'baseRefEnvBinding',
    function (y) { return y.replace(/\n\s+env:\n\s+BASE_REF: \$\{\{ github\.base_ref \|\| 'main' \}\}\n(\s+run: node scripts\/test-suite\/gate\.js)/, '\n$1'); }],
  ['continue-on-error added to the gate step', 'noContinueOnError',
    function (y) { return y.replace(/(\n\s+)(run: node scripts\/test-suite\/gate\.js)/, '$1continue-on-error: true$1$2'); }],
  ['if: added to the gate step', 'noConditionalsExceptUpload',
    function (y) { return y.replace(/(\n\s+)(env:\n\s+BASE_REF[^\n]*\n\s+run: node scripts\/test-suite\/gate\.js)/, "$1if: github.actor != 'dependabot[bot]'$1$2"); }],
  ['if: added to the job', 'noConditionalsExceptUpload',
    function (y) { return y.replace('    runs-on: ubuntu-latest', "    if: github.actor != 'nobody'\n    runs-on: ubuntu-latest"); }],
  ['|| true appended to the gate line', 'noExitCodeSuppression',
    function (y) { return y.replace(' --json > gate.json', ' --json > gate.json || true'); }],
  // 이 fixture는 **실행 줄**을 겨냥해야 한다 — 헤더 주석이 같은 파일명을 먼저 담고
  // 있어서 순진한 replace는 주석을 고치고, 그러면 stripComments가 그것을 걷어 단언이
  // 정당하게 green으로 남는다. 그 자체가 (e)가 잡는 위양성의 거울상이다.
  ['|| true appended to the self-test line', 'noExitCodeSuppression',
    function (y) {
      return y.replace(/(run: node --test [^\n]*wiring-cut\.test\.js)/, '$1 || true');
    }],
  ['set +e added to a run block', 'noExitCodeSuppression',
    function (y) { return y.replace('          node scripts/test-suite/run.js --list | sort > enum-all.txt', '          set +e\n          node scripts/test-suite/run.js --list | sort > enum-all.txt'); }],
  ['exit 0 appended to a run block', 'noExitCodeSuppression',
    function (y) { return y.replace('          test "$((all - included))" -eq "$cap"', '          test "$((all - included))" -eq "$cap"\n          exit 0'); }],
  ['permissions widened to contents: write', 'forkDefences',
    function (y) { return y.replace('  contents: read', '  contents: write'); }],
  ['persist-credentials removed', 'forkDefences',
    function (y) { return y.replace('\n          persist-credentials: false', ''); }],
  ['pull_request_target used', 'forkDefences',
    function (y) { return y.replace('\n  pull_request:', '\n  pull_request_target:'); }],
  ['a uses: pinned by tag instead of SHA', 'forkDefences',
    function (y) { return y.replace(/actions\/checkout@[0-9a-f]{40}/, 'actions/checkout@v4'); }],
  ['a secret injected into the job', 'forkDefences',
    function (y) { return y.replace(/(\n\s+)(run: node scripts\/test-suite\/gate\.js)/, '$1env:$1  TOKEN: ${{ secrets.SOME_TOKEN }}$1$2'); }],
  ['fetch-depth: 0 removed', 'baseRefPrerequisites',
    function (y) { return y.replace('\n          fetch-depth: 0', ''); }],
  ['the base fetch step removed', 'baseRefPrerequisites',
    function (y) { return y.replace(/\n      - name: Fetch base ref\n(?:.*\n)*?        run: git fetch --no-tags origin "\$BASE_REF"\n/, '\n'); }],
  ['the exclusions validation step removed', 'precedingSteps',
    function (y) { return y.replace(/\n      - name: Validate exclusions list\n        run: [^\n]*\n/, '\n'); }],
  ['the enumerate sanity step removed', 'precedingSteps',
    function (y) { return y.replace(/          node scripts\/test-suite\/run\.js --list \| sort > enum-all\.txt\n/, ''); }],
  ['the gate self-test step removed', 'precedingSteps',
    function (y) { return y.replace(/\n      - name: Gate discriminating-power tests\n        run: [^\n]*\n/, '\n'); }],
  ['--exclude-from removed from the full-suite run line', 'precedingSteps',
    function (y) { return y.replace('run.js --exclude-from .github/test-suite-exclusions.json --json > measurement.json', 'run.js --json > measurement.json'); }],
  ['wiring-cut.test.js dropped from the self-test line', 'precedingSteps',
    function (y) { return y.replace(' scripts/tests/wiring-cut.test.js', ''); }],
  ['paths added to on.pull_request', 'noNarrowingTriggerKeys',
    function (y) { return y.replace('on:\n  pull_request:\n', "on:\n  pull_request:\n    paths:\n      - 'scripts/**'\n"); }],
  ['branches added to on.pull_request', 'noNarrowingTriggerKeys',
    function (y) { return y.replace('on:\n  pull_request:\n', 'on:\n  pull_request:\n    branches: [release]\n'); }],
  ['types added to on.pull_request', 'noNarrowingTriggerKeys',
    function (y) { return y.replace('on:\n  pull_request:\n', 'on:\n  pull_request:\n    types: [labeled]\n'); }],
  ['a run: block interpolates github.head_ref', 'noExpressionInRun',
    function (y) { return y.replace('        run: git fetch --no-tags origin "$BASE_REF"', '        run: git fetch --no-tags origin ${{ github.head_ref }}'); }],
  ['checkout given a ref:', 'checkoutSeesPrTree',
    function (y) { return y.replace('          fetch-depth: 0', '          ref: ${{ github.event.pull_request.base.sha }}\n          fetch-depth: 0'); }],
  ['timeout-minutes moved from the job to a step', 'resourceBounds',
    function (y) {
      return y.replace('    timeout-minutes: 60\n', '')
        .replace('      - uses: actions/checkout@', '      - timeout-minutes: 60\n        uses: actions/checkout@');
    }],
  ['concurrency removed', 'resourceBounds',
    function (y) { return y.replace(/concurrency:\n  group: test-suite-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true\n/, ''); }],
  ['node-version changed to 24', 'resourceBounds',
    function (y) { return y.replace("node-version: '20'", "node-version: '24'"); }],
  ['the gate step moved before the full-suite run step', 'producerBeforeConsumer',
    function (y) {
      const gateStep = y.match(/      - name: Gate\n(?:.*\n)*?        run: node scripts\/test-suite\/gate\.js[^\n]*\n/);
      if (!gateStep) return y;
      return y.replace(gateStep[0], '').replace('      - name: Full-suite measurement\n', gateStep[0] + '      - name: Full-suite measurement\n');
    }],
];

test('(f) every negative fixture is caught by its assertion', () => {
  NEGATIVES.forEach(function (entry) {
    const label = entry[0];
    const assertionName = entry[1];
    const mutated = mutate(entry[2]);
    const live = LIVE();
    assert.notStrictEqual(mutated, live, label + ': the fixture did not actually change the workflow');
    assert.strictEqual(ASSERTIONS[assertionName](mutated), false,
      label + ': assertion "' + assertionName + '" stayed green on a workflow that is materially weaker');
  });
});

test('(f2) scope false-positive pairing — a token surviving in ANOTHER run line is not enough', () => {
  // 판정 줄에서 `--exclude-from`을 지웠지만 **열거 sanity 줄에는 남아 있는** YAML.
  // 파일 전체를 스캔하는 오라클이면 여기서 green이 되고, 그것이 위양성이다.
  const mutated = mutate(function (y) {
    return y.replace(/(gate\.js[^\n]*?) --exclude-from \.github\/test-suite-exclusions\.json/, '$1');
  });
  assert.ok(/--exclude-from \.github\/test-suite-exclusions\.json/.test(mutated),
    'the fixture must keep the token elsewhere in the file — otherwise it does not test scope');
  assert.strictEqual(ASSERTIONS.gateLineTokens(mutated), false,
    'the oracle scanned the whole file instead of the gate line');
});

test('(e) comment false-positive pairing — prose must not satisfy an execution-line assertion', () => {
  // §3.17의 선례가 정확히 이것이다: 진짜 호출이 전부 걷힌 뒤에도 산문 한 줄이 남아
  // green을 유지했다. 4단 헤더 주석이 단계 순서를 서술하므로 여기서 재현 가능하다.
  const executable = [
    'jobs:',
    '  gate:',
    '    steps:',
    '      - name: Gate',
    '        run: node scripts/test-suite/gate.js --measurement measurement.json' +
      ' --exclude-from .github/test-suite-exclusions.json' +
      ' --floor-from .github/test-suite-floor.json --base-ref "origin/$BASE_REF" --json > gate.json',
    '',
  ].join('\n');
  const commentOnly = [
    'jobs:',
    '  gate:',
    '    steps:',
    '      # run: node scripts/test-suite/gate.js --measurement measurement.json',
    '      #   --exclude-from .github/test-suite-exclusions.json',
    '      #   --floor-from .github/test-suite-floor.json --base-ref "origin/$BASE_REF" --json > gate.json',
    '      - name: Gate',
    '        run: echo nothing',
    '',
  ].join('\n');

  assert.strictEqual(ASSERTIONS.gateLineTokens(executable), true,
    'an execution line carrying every token must satisfy the assertion');
  assert.strictEqual(ASSERTIONS.gateLineTokens(commentOnly), false,
    'a comment carrying the same string must NOT satisfy it — otherwise the oracle checks prose, not wiring');
});

// ─────────────────────────────────────────────────────────────────────────────
// (4) baseline workflow에 대한 단언 넷 — Task 5와 Task 6이 함께 고치는데
//     어떤 오라클도 걸려 있지 않았다(L2 R14 test).
// ─────────────────────────────────────────────────────────────────────────────

const BASELINE_ASSERTIONS = {
  noPullRequestTrigger: function (y) {
    const stripped = stripComments(y);
    const m = stripped.match(/\non:\n([\s\S]*?)\n(?=\S)/);
    if (!m) return false;
    return !/^\s+pull_request:/m.test(m[1]);
  },
  osMatrix: function (y) {
    const stripped = stripComments(y);
    return /runs-on:\s*\$\{\{\s*matrix\.os\s*\}\}/.test(stripped) &&
      /matrix:\n(?:.*\n)*?\s+os:\s*\[/.test(stripped);
  },
  artifactNameCarriesBothAxes: function (y) {
    const stripped = stripComments(y);
    const nameLine = (stripped.match(/name:\s*test-suite-baseline-[^\n]*/) || [''])[0];
    const pathLine = (stripped.match(/path:\s*baseline-[^\n]*/) || [''])[0];
    const both = function (l) { return l.indexOf('matrix.os') >= 0 && l.indexOf('matrix.node') >= 0; };
    return both(nameLine) && both(pathLine);
  },
  defaultsShellBash: function (y) {
    return /defaults:\n\s+run:\n\s+shell:\s*bash/.test(stripComments(y));
  },
};

test('(4a) baseline no longer carries a pull_request trigger (DD1)', () => {
  assert.ok(BASELINE_ASSERTIONS.noPullRequestTrigger(fs.readFileSync(BASELINE_WF, 'utf8')));
});

test('(4b) baseline runs on matrix.os with an os axis (DD8)', () => {
  assert.ok(BASELINE_ASSERTIONS.osMatrix(fs.readFileSync(BASELINE_WF, 'utf8')));
});

test('(4c) baseline artifact name AND path carry both matrix axes', () => {
  // node 축만 담으면 같은 node의 두 OS job이 동일 이름을 올려 upload-artifact@v4가
  // 중복을 거부하고 Windows artifact가 아예 존재하지 않는다.
  assert.ok(BASELINE_ASSERTIONS.artifactNameCarriesBothAxes(fs.readFileSync(BASELINE_WF, 'utf8')));
});

test('(4d) baseline pins defaults.run.shell to bash (Windows default is pwsh)', () => {
  assert.ok(BASELINE_ASSERTIONS.defaultsShellBash(fs.readFileSync(BASELINE_WF, 'utf8')));
});

test('(4-neg) each baseline assertion catches its own negation', () => {
  const live = fs.readFileSync(BASELINE_WF, 'utf8');
  const cases = [
    ['pull_request restored', 'noPullRequestTrigger',
      function (y) { return y.replace('on:\n  workflow_dispatch:', 'on:\n  workflow_dispatch:\n  pull_request:'); }],
    ['runs-on hardcoded back to ubuntu-latest', 'osMatrix',
      function (y) { return y.replace('runs-on: ${{ matrix.os }}', 'runs-on: ubuntu-latest'); }],
    ['artifact name carries only the node axis', 'artifactNameCarriesBothAxes',
      function (y) { return y.replace('name: test-suite-baseline-${{ matrix.os }}-node${{ matrix.node }}', 'name: test-suite-baseline-node${{ matrix.node }}'); }],
    ['defaults.run.shell removed', 'defaultsShellBash',
      function (y) { return y.replace(/    defaults:\n      run:\n        shell: bash\n/, ''); }],
  ];
  cases.forEach(function (c) {
    const mutated = c[2](live);
    assert.notStrictEqual(mutated, live, c[0] + ': the fixture did not change the file');
    assert.strictEqual(BASELINE_ASSERTIONS[c[1]](mutated), false, c[0] + ': assertion stayed green');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 절단 왕복 — 스크립트 자체가 무엇을 하는지 (계획 Task 7의 (a)~(c), (a2), (e5a))
// ─────────────────────────────────────────────────────────────────────────────

const { RED_FILE } = require('../test-suite/wiring-cut.js');

test('(e5a) the planted red file matches NO exclusion pattern', () => {
  // 걸리면 (i) 그 파일이 격리돼 실행되지 않으므로 스위트 red가 애초에 발생하지 않고
  // (ii) max_excluded_files 등가 단언이 판정보다 앞선 자기 test 단계를 red로 만들어
  // gate.json이 생성되지 않는다 — Acceptance 3-A가 요구하는 증거의 producer가 사라진다.
  const { enumerateTests } = require('../test-suite/enumerate.js');
  const exclusions = JSON.parse(fs.readFileSync(path.join(REPO, '.github', 'test-suite-exclusions.json'), 'utf8'));
  const r = enumerateTests({ trackedFiles: [RED_FILE], exclusions: exclusions });
  assert.strictEqual(r.excluded.length, 0,
    'the planted file falls under an exclusion pattern, which would kill the axis-D producer');
});

test('the oracle round trip is wired: --apply removes a token this file asserts on', () => {
  // 절단이 실제로 무엇을 하는지 재는 정적 단언이다. 왕복 자체는 트리를 바꾸므로
  // `## Validation` 검사 4가 커밋된 트리에서 돌리고, 여기서는 절단 대상이 단언 1의
  // 사거리 안에 있음을 확인한다 — 사거리 밖이면 왕복이 위양성이다.
  const { ORACLE_TOKEN } = require('../test-suite/wiring-cut.js');
  const live = LIVE();
  assert.ok(live.indexOf(ORACLE_TOKEN) >= 0, 'the cut target must exist in the workflow');
  assert.strictEqual(ASSERTIONS.gateLineTokens(live.replace(ORACLE_TOKEN, '')), false,
    'cutting the token must make assertion 1 red; otherwise the round trip proves nothing');
});
