'use strict';

// env-contract/measure-evidence.js — evidence 드리프트의 재현 가능한 실측 (v1.32.0).
//
// M5의 노트에 적힌 A/B/C 수치는 손으로 센 것이 아니라 이 스크립트의 출력이다. 그것이
// 요점이다 — 드리프트를 "고쳤다"고 주장하려면 **고치기 전과 후를 같은 자로 재야** 하고,
// 그 자가 문서 안의 숫자로만 존재하면 다음 사이클은 그것을 재현할 수 없다.
//
// 분류는 셋이고 성질이 다르다:
//   A  evidence 행 ±2 창 안에 이름이 있다 — 계약이 요구하는 상태.
//   B  같은 파일 안에 있지만 창 밖이다 — **낡았다**(코드가 움직였고 행 번호가 안 따라왔다).
//   C  그 파일에 이름이 아예 없다 — **거짓이다**(가리키는 곳이 애초에 그 토글이 아니다).
// 여기에 status `not-consumed`가 네 번째 자리를 갖는다: mccp가 읽지 않는 서드파티
// 변수라 read site가 **존재하지 않으므로** A/B/C 축으로 잴 대상이 아니다(DD1).
//
// **경계 일치를 쓴다.** 이름은 `/^[A-Z][A-Z0-9_]*$/`라 부분 문자열 일치를 쓰면
// `MCCP_PLAN_REVIEW_L3`가 적힌 행이 `MCCP_PLAN_REVIEW`를 인증한다 — 접두사 충돌이
// 드리프트를 감춘다. 그래서 앞뒤로 `[A-Za-z0-9_]`가 오지 않는 것을 요구한다.
// 부작용을 숨기지 않는다: status `scan-artifact`인 `MCCP_PLAN_REVIEW_`(끝이 밑줄인
// 접두사 오탐)에 대해 여기에는 «경계 일치로는 **절대** A가 될 수 없다»고 적혀 있었으나
// **거짓이다(v1.32.1 M6 정정)**. 경계 일치가 막는 것은 뒤에 word 문자가 오는 경우뿐이고
// 공백·문장부호는 그대로 매치한다 — 실측: `nameAppears('MCCP_PLAN_REVIEW_ 뒤에 공백',
// 'MCCP_PLAN_REVIEW_')`는 `true`다. 참인 문장은 이렇다: 그 이름은 실제 코드에서 **항상
// 다른 이름의 접두사로만** 나타나므로 표면에서 A가 되지 않으며, 그것은 정규식의 원리가
// 아니라 **관측된 성질**이다. 그래서 `EVIDENCE_DEBT`에 이름째 들어가되, 코드가 그 이름을
// 단독으로 쓰기 시작하면 A가 될 수 있고 그때는 목록에서 지워야 한다.
//
// mirror: `lint.js`의 `evidenceLexicalProblem` 재사용 — 경로 검사는 이 파일이 새로
//         만들지 않는다. «두 번째 구현이 생기면 그 둘이 갈라진다»고 적어 두고 정작
//         **창과 매처는 두 벌로 두었다**(로컬 `WINDOW`/`hasName`). v1.32.1 M6이
//         그것을 통합했다: 창도 매처도 `evidence-name.js`가 소유하고 이 파일은
//         `lint`가 re-export하는 `EVIDENCE_WINDOW`/`nameAppears`를 쓴다. 갈라 두면
//         창을 넓히는 사람이 한 쪽만 고쳐도 어떤 test도 붉지 않고, 그 순간 **재는 자와
//         강제하는 자가 다른 답을 낸다** — 이 파일이 스스로 존재 이유로 적은 «고치기 전과
//         후를 같은 자로 재야 한다»가 성립하지 않게 된다.

const fs = require('fs');
const path = require('path');

const registry = require('./registry');
const lint = require('./lint');

const IMPECCABLE_AXIS_RE = /^(MCCP_)?IMPECCABLE_/;

function makeLineReader(root) {
  const cache = new Map();
  return function readLines(rel) {
    if (!cache.has(rel)) {
      let lines = null;
      try {
        lines = fs.readFileSync(path.join(root, rel), 'utf8').split(/\r?\n/);
      } catch (_) {
        lines = null;
      }
      cache.set(rel, lines);
    }
    return cache.get(rel);
  };
}

/**
 * @param {string} repoRoot
 * @returns {{classes: Object, entries: Array, counts: Object, impeccable: Object}}
 */
function measure(repoRoot) {
  const root = repoRoot || process.cwd();
  const readLines = makeLineReader(root);
  const rows = [];

  registry.ENTRIES.forEach(function (e) {
    const row = { name: e.name, status: e.status, domain: e.domain, evidence: e.evidence, class: null, note: null };

    if (e.status === 'not-consumed') {
      row.class = 'not-consumed';
      rows.push(row);
      return;
    }

    // 어휘 스크린이 먼저다 — lint L8과 같은 순서. fs를 부르기 전에 형식을 거른다.
    const lex = lint.evidenceLexicalProblem(e.evidence);
    if (lex) {
      row.class = 'malformed';
      row.note = lex;
      rows.push(row);
      return;
    }

    const m = /^(.*):(\d+)$/.exec(String(e.evidence).trim());
    const rel = m[1];
    const lineNo = Number.parseInt(m[2], 10);
    const lines = readLines(rel);
    if (!lines) {
      row.class = 'unreadable';
      row.note = 'cannot read ' + rel;
      rows.push(row);
      return;
    }

    const from = Math.max(0, lineNo - 1 - lint.EVIDENCE_WINDOW);
    const to = Math.min(lines.length, lineNo + lint.EVIDENCE_WINDOW);
    if (lint.nameAppears(lines.slice(from, to).join('\n'), e.name)) row.class = 'A';
    else if (lint.nameAppears(lines.join('\n'), e.name)) row.class = 'B';
    else row.class = 'C';
    rows.push(row);
  });

  const counts = {};
  rows.forEach(function (r) { counts[r.class] = (counts[r.class] || 0) + 1; });

  const axis = rows.filter(function (r) { return IMPECCABLE_AXIS_RE.test(r.name); });
  const axisCounts = {};
  axis.forEach(function (r) { axisCounts[r.class] = (axisCounts[r.class] || 0) + 1; });

  return {
    total: rows.length,
    window: lint.EVIDENCE_WINDOW,
    counts: counts,
    impeccable: { total: axis.length, counts: axisCounts, entries: axis },
    entries: rows,
  };
}

// 이름은 그대로 두되 구현은 소유자 하나를 가리킨다 — 기존 호출자가 있다면 계속 동작하고,
// 그러면서도 이 파일 안에 두 번째 구현은 존재하지 않는다.
module.exports = {
  measure: measure,
  hasName: lint.nameAppears,
  WINDOW: lint.EVIDENCE_WINDOW,
  IMPECCABLE_AXIS_RE: IMPECCABLE_AXIS_RE,
};

if (require.main === module) {
  const result = measure(process.cwd());
  if (process.argv.indexOf('--json') !== -1) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const c = result.counts;
    process.stdout.write('total ' + result.total + ' (window +/-' + result.window + ')\n');
    Object.keys(c).sort().forEach(function (k) { process.stdout.write('  ' + k + ' ' + c[k] + '\n'); });
    process.stdout.write('impeccable axis: ' + result.impeccable.total + ' — '
      + JSON.stringify(result.impeccable.counts) + '\n');
    result.entries.filter(function (r) { return r.class === 'B' || r.class === 'C'; })
      .forEach(function (r) { process.stdout.write('  ' + r.class + ' ' + r.name + ' -> ' + r.evidence + '\n'); });
  }
}
