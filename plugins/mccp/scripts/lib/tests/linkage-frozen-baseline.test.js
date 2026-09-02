'use strict';

// review-record-linkage M1 — 동결 블록 ↔ 라이브 출력 바이트 일치.
//
// **이 파일이 존재하는 이유**: 계획 초안은 "문서의 축자 블록이 실제 출력과 바이트
// 일치"를 Validate 줄의 *서술*로만 두고, Risks 표에서는 그것을 "기계로 확인된다"고
// 주장했다 — 실행 가능한 명령도 test 파일도 없이. 그 격차를 리뷰어가 잡았고, 이
// 파일이 그 답이다. 동결이 산문이면 동결이 아니다.
//
// 실코퍼스에 대해 도구를 실제로 spawn한다. `linkage-audit.test.js`가 합성 픽스처로
// 파서·사다리·파티션 규칙을 고정하는 것과 역할이 다르다 — 그쪽은 규칙을, 이쪽은
// **커밋된 숫자가 아직 참인지**를 지킨다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const AUDIT = path.join(__dirname, '..', 'linkage-audit.js');
const DOC = path.join(REPO_ROOT, 'docs', 'review-record-linkage', 'frozen-baseline.md');

const BEGIN = '<!-- BEGIN linkage-audit.js --frozen-only (verbatim) -->';
const END = '<!-- END linkage-audit.js --frozen-only (verbatim) -->';

// 문서에서 BEGIN/END 사이의 ```json 펜스 본문을 뽑는다. 마커나 펜스가 없으면
// **그 자체가 실패**다 — 조용히 skip하면 동결이 사라진 것을 아무도 모른다.
function extractFrozenBlock(markdown) {
  const b = markdown.indexOf(BEGIN);
  const e = markdown.indexOf(END);
  assert.notEqual(b, -1, 'the frozen-baseline doc lost its BEGIN marker');
  assert.notEqual(e, -1, 'the frozen-baseline doc lost its END marker');
  assert.ok(b < e, 'BEGIN must precede END');
  const between = markdown.slice(b + BEGIN.length, e);
  const m = between.match(/```json\r?\n([\s\S]*?)\r?\n```/);
  assert.ok(m, 'no ```json fence between the markers');
  return m[1];
}

test('the committed frozen block is byte-identical to the live --frozen-only output', function () {
  const live = execFileSync(process.execPath, [AUDIT, '--frozen-only'], {
    cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).replace(/\n$/, '');

  const committed = extractFrozenBlock(fs.readFileSync(DOC, 'utf8'));

  if (committed !== live) {
    // 차이를 눈으로 찾게 두지 않는다 — 첫 어긋난 줄을 지목한다.
    const a = committed.split(/\r?\n/);
    const b = live.split(/\r?\n/);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
    assert.fail(
      'frozen-baseline.md is out of date at line ' + (i + 1) + ' of the block.\n' +
      '  committed: ' + JSON.stringify(a[i]) + '\n' +
      '  live:      ' + JSON.stringify(b[i]) + '\n' +
      'Regenerate the block from `node plugins/mccp/scripts/lib/linkage-audit.js --frozen-only`. ' +
      'If the live value moved because the CORPUS changed rather than the tool, check the ' +
      'baseline partition first: a pre_baseline number is supposed to be immutable.');
  }
  assert.equal(committed, live);
});

test('the doc quotes no hand-copied numbers outside the frozen block', function () {
  // 문서의 중심 주장은 "손으로 옮겨 적은 숫자는 없다"이다. 완전 검증은 불가능하므로
  // 얕게, 그러나 실제로 확인한다: 블록 밖 산문이 인용하는 수치는 동결 블록 안에
  // 실재해야 한다.
  const md = fs.readFileSync(DOC, 'utf8');
  const block = extractFrozenBlock(md);
  const frozen = JSON.parse(block);

  const prose = md.slice(0, md.indexOf(BEGIN));
  // 산문이 D1/D2/D3 오늘 값으로 내건 세 쌍.
  assert.ok(prose.indexOf('0 / ' + frozen.pre_baseline.round_structure.denominator) !== -1,
    'the D1 headline in the prose must match round_structure.denominator');
  assert.ok(prose.indexOf(String(frozen.pre_baseline.ship_eligibility.counts.undecidable) + '건 전건') !== -1,
    'the D2 headline must match ship_eligibility.counts.undecidable');
  assert.ok(prose.indexOf('각 0 / ' + frozen.pre_baseline.linkage.denominator) !== -1,
    'the D3 headline must match linkage.denominator');
});

test('the frozen block never carries an absolute path (DD6)', function () {
  // 이 출력은 git-tracked 문서에 동결되므로 호스트 경로가 새면 영구히 남는다.
  // 디렉토리 이름을 열거하지 않는 형태 규칙이다: JSON 문자열 VALUE 가 `/` ·
  // 드라이브 문자 · UNC 로 시작하는가.
  const block = extractFrozenBlock(fs.readFileSync(DOC, 'utf8'));
  const offenders = [];
  block.split(/\r?\n/).forEach(function (line, i) {
    if (/:\s*"(\/|[A-Za-z]:[\\/]|\\\\)/.test(line)) offenders.push((i + 1) + ': ' + line.trim());
  });
  assert.deepEqual(offenders, [], 'absolute path(s) leaked into the committed frozen block');
});

test('the frozen block omits the mutable partition', function () {
  const frozen = JSON.parse(extractFrozenBlock(fs.readFileSync(DOC, 'utf8')));
  assert.equal('post_baseline' in frozen, false);
  assert.equal('undated' in frozen, false);
  assert.equal('state' in frozen, false, 'the corpus-global state is mutable; baseline.state is the frozen one');
  assert.ok(frozen.baseline && typeof frozen.baseline.state === 'string');
});
