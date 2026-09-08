#!/usr/bin/env node
'use strict';

// 격리 목록 로드와 검증 (DD7). `enumerate.js`의 `{pattern, reason}` 스키마를
// **확장**하며 새 스키마를 발명하지 않는다 — `ticket`이 더해질 뿐이다.
//
// ── 이 모듈이 존재하는 이유 ──────────────────────────────────────────────────
// DD7이 지목한 실패 모드는 "기계는 만들어지고 그것을 부르는 한 줄이 빠진다"이다.
// 검증기를 만들어 놓고 러너가 그것을 거치지 않으면 `ticket` 필수와 항목 수 상한이
// **사람이 로컬에서 부르는 한 줄에만** 존재한다. 그래서 `run.js`의 `--exclude-from`이
// 이 모듈을 거치고(`loadExclusions`), 게이트의 입력 해소(`inputs.js`)도 자체 파싱을
// 갖지 않고 여기에 위임한다. 소비 경로가 하나뿐이어야 상한이 실효를 갖는다.
//
// ── throw가 계약이다 ────────────────────────────────────────────────────────
// `normalizeExclusions`의 규율을 그대로 물려받는다: 계약 위반은 **걸러지지 않고
// 죽는다**. 걸러지면 호출자가 격리를 넘겼다고 믿는 채로 격리 없이 도는 반대 방향의
// 조용한 실패가 되고, 그것이 커버리지 분모를 말없이 바꾼다.

const fs = require('fs');
const { normalizeExclusions } = require('./enumerate.js');

// 항목 수 상한. **초기 항목 수와 등가**로 pin되며 그 등가를 test가 단언한다
// (`test-suite-coverage.test.js`). 한 방향(`<=`)으로만 두면 초기값 자체가 어디에도
// 고정되지 않아 헤드룸을 크게 잡는 것만으로 게이트가 열린다 — `EVIDENCE_DEBT_CEILING`
// 선례와 같은 형태다(L2 R9). 늘리려면 이 상수를 올리는 **별도 편집**이 필요하고
// 그 사실이 diff에 숫자로 남는다.
//
// 이 상수가 여기 사는 이유: 이것은 **검증기가 재는 값**(목록의 줄 수)이고,
// `.github/test-suite-floor.json`의 `max_excluded_files`는 **게이트가 재는 값**
// (glob 확장 결과의 파일 수)이다. 둘은 다른 수량이라 같은 자리에 두지 않는다.
const MAX_EXCLUSION_ENTRIES = 6;

// `run.js:48`과 같은 값. 입력 크기 상한이 없으면 판독이 메모리 축으로 실패한다.
const MAX_INPUT_BYTES = 16 * 1024 * 1024;

// ── pattern 복잡도 상한 (security-reviewer HIGH, 실측 재현) ──────────────────
// `enumerate.js`의 `globToRegExp`는 `*`를 `[^/]*`로, `**`를 `.*`로 **합치지 않고**
// 이어붙인다. 그래서 연속된 `*`는 인접한 무한 수량자(`[^/]*[^/]*[^/]*…`)가 되어
// 파국적 backtracking의 교과서적 형태가 된다. 실측: `"*".repeat(10)+"ZZZNOMATCH"`가
// 경로 하나에 43ms, `repeat(15)`는 8초에도 끝나지 않았고, 그것을 담은 목록으로
// `run.js --list`를 부르면 15초 뒤에도 살아 있었다.
//
// **이 축이 M3에서 새로 열린다.** 오늘 `globToRegExp`는 운영자가 로컬에서 부르는
// 경로에서만 도달 가능하고 baseline workflow는 `--exclude-from`을 아예 넘기지 않는다.
// M3의 `test-suite.yml`은 이 코드에 **fork PR이 통제하는 tracked 파일 내용**을
// 리뷰 이전에, `paths` 필터 없이, 저장소의 유일한 머지 차단 체크 위에서 먹인다.
// 25자짜리 pattern 한 줄이면 그 체크가 `timeout-minutes: 60`을 다 쓰고 죽고, 그 줄이
// 머지되면 **이후 모든 PR**이 같은 한 시간을 지불한다.
//
// DD7·DD9의 래칫 셋은 이것을 막지 못한다 — 전부 *몇 개를* 격리하는지를 재고
// *한 패턴이 얼마나 비싼지*는 재지 않는다. 그래서 검증기가 그 축을 든다.
// 여기가 맞는 자리인 이유는 DD7이 이 모듈을 **소비 경로 위에** 올려 뒀기 때문이다 —
// 러너(`run.js` 재배선)와 게이트(`inputs.js` 위임)가 둘 다 여기를 지난다.
const MAX_PATTERN_LENGTH = 200;
const MAX_PATTERN_WILDCARDS = 8;

/**
 * 격리 항목 배열을 검증한다. 반환값은 `{pattern, reason, ticket}`의 배열이며
 * `pattern`/`reason`은 `normalizeExclusions`가 정규화한 값 그대로다 —
 * 그래야 `exclusionsDigest`가 이 목록과 러너가 봉인한 값에 대해 같은 결과를 낸다.
 *
 * @param {unknown} raw
 * @returns {Array<{pattern: string, reason: string, ticket: string}>}
 */
function validateExclusions(raw) {
  // 최상위는 **배열**이지 `{exclusions: [...]}` 래핑이 아니다. 소비 경로
  // (`enumerate.js:55-59`)가 `Array.isArray`가 아니면 TypeError를 던지므로,
  // 래핑을 받아들이는 보조 코드는 그 자리에서만 통과하고 게이트에서 죽는다.
  if (!Array.isArray(raw)) {
    throw new TypeError(
      'exclusions file must contain a top-level ARRAY of {pattern, reason, ticket} ' +
      '(not an object wrapper) — enumerate.js#normalizeExclusions consumes it directly'
    );
  }
  if (raw.length > MAX_EXCLUSION_ENTRIES) {
    throw new RangeError(
      'exclusions: ' + raw.length + ' entries exceeds MAX_EXCLUSION_ENTRIES=' +
      MAX_EXCLUSION_ENTRIES + ' — raising the cap is a separate, reviewable edit (DD7)'
    );
  }

  // pattern/reason의 형태 검증은 정본 소비자에게 맡긴다. 여기서 다시 구현하면
  // 두 검증기가 갈라질 수 있고, 그때 러너와 게이트가 같은 파일을 다르게 읽는다.
  const normalized = normalizeExclusions(raw);

  return normalized.map((entry, i) => {
    // 복잡도 상한. 거부하는 것이지 조용히 고쳐 쓰는 것이 아니다 — 패턴을 재해석하면
    // 저자가 의도한 격리 범위와 실제 범위가 갈리고, 그 갈림이 커버리지 분모를 바꾼다.
    if (entry.pattern.length > MAX_PATTERN_LENGTH) {
      throw new RangeError(
        'exclusions[' + i + '].pattern is ' + entry.pattern.length + ' chars, over MAX_PATTERN_LENGTH=' +
        MAX_PATTERN_LENGTH + ' - long patterns are a regex-complexity vector, not a legitimate exclusion'
      );
    }
    const wildcards = (entry.pattern.match(/\*/g) || []).length;
    if (wildcards > MAX_PATTERN_WILDCARDS) {
      throw new RangeError(
        'exclusions[' + i + '].pattern carries ' + wildcards + ' wildcards, over MAX_PATTERN_WILDCARDS=' +
        MAX_PATTERN_WILDCARDS + ' (pattern=' + entry.pattern + ')'
      );
    }
    // 인접한 무한 수량자가 파국적 backtracking의 원인이다. `**`는 정당한 glob이지만
    // `***` 이상은 glob 의미론에서 `**`와 같은 것을 뜻하면서 정규식만 한 단계 더
    // 비싸게 만든다 — 즉 표현력을 늘리지 않고 비용만 늘린다.
    if (/\*{3}/.test(entry.pattern)) {
      throw new RangeError(
        'exclusions[' + i + '].pattern contains a run of 3+ consecutive "*" (pattern=' + entry.pattern +
        ') - it means no more than "**" does, and globToRegExp compiles each one into another ' +
        'unbounded quantifier, which is the catastrophic-backtracking shape'
      );
    }
    const ticket = raw[i] && raw[i].ticket;
    // `ticket`은 공백만으로 채울 수 없다 — `reason`에 대한 `normalizeExclusions`의
    // 규율과 같은 이유다. 통제가 형식만 남는 것을 막는다.
    if (typeof ticket !== 'string' || ticket.trim() === '') {
      throw new TypeError(
        'exclusions[' + i + '].ticket is required and must be a non-empty string ' +
        '(pattern=' + entry.pattern + ') — an exclusion without a ticket is a silent deletion (DD7)'
      );
    }
    return { pattern: entry.pattern, reason: entry.reason, ticket: ticket.trim() };
  });
}

/** 파일에서 로드해 검증한다. 판독 실패도 검증 실패도 전부 throw다. */
function loadExclusions(file) {
  const stat = fs.statSync(file);
  if (stat.size > MAX_INPUT_BYTES) {
    throw new Error('exclusions file exceeds ' + MAX_INPUT_BYTES + ' bytes (got ' + stat.size + ')');
  }
  return validateExclusions(JSON.parse(fs.readFileSync(file, 'utf8')));
}

module.exports = {
  loadExclusions, validateExclusions,
  MAX_EXCLUSION_ENTRIES, MAX_PATTERN_LENGTH, MAX_PATTERN_WILDCARDS,
};

if (require.main === module) {
  // CLI는 `--check <file>` 하나다. **모듈이 throw하는 모든 입력에 대해 비영점**이어야
  // 한다 — throw를 삼키고 exit 0으로 끝나는 CLI가 있으면 workflow의 격리 검증 단계가
  // 장식이 된다(L2 R15 test). 그래서 catch가 exitCode를 반드시 세운다.
  const argv = process.argv.slice(2);
  const idx = argv.indexOf('--check');
  const file = idx >= 0 ? argv[idx + 1] : argv[0];
  if (!file || typeof file !== 'string' || file.startsWith('--')) {
    process.stderr.write('usage: exclusions.js --check <exclusions.json>\n');
    process.exitCode = 2;
  } else {
    try {
      const list = loadExclusions(file);
      process.stdout.write('[exclusions] ok — ' + list.length + '/' + MAX_EXCLUSION_ENTRIES +
        ' entries, every entry carries a ticket\n');
      process.exitCode = 0;
    } catch (err) {
      process.stderr.write('[exclusions] REFUSED: ' + String((err && err.message) || err) + '\n');
      process.exitCode = 1;
    }
  }
}
