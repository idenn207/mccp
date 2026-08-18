#!/usr/bin/env node
'use strict';

// multi-session-work-loop M6 — B1 독립성 정적 lint (4축) + 증거 생산자 유일성.
//
// 설계: docs/multi-session-work-loop/status-adjudication-design.md
// 선례: lib/state-journal/single-writer-lint.js (정적 lint + CLI/test 이중 표면)
//
// **이 lint 는 독립성의 증명이 아니다 — 2차 통제다.** 1차 통제는 오라클의 타입 경계
// (b1-status-drift.js 가 문서 status 를 받지 않고 자체 I/O 도 하지 않는다)이고, 그
// 경계 위에서 변조 불변성 test 가 양방향으로 반증한다. 정적 스캔은 **간접 의존**
// (별칭 require · 동적 `require(var)` · 호출자가 status 를 다른 이름으로 실어 넘김)을
// 잡지 못하며, **직접 require 만** 본다(전이 추적 없음). 이 순서를 뒤집어 lint 통과를
// 독립성 증명으로 읽으면 없는 보증을 믿게 된다.
//
// **lint 는 test 가 아니라 독립 CLI 다.** test 안에서만 도는 검사는 test 를 건너뛰면
// 함께 사라진다. Validation §2 가 test runner 와 무관하게 이 파일을 직접 부른다.
//
// 4축:
//   (i)   판정 경로에 completion-ledger require 0        — 계약(UI3)이 판정 소스에서 배제
//   (ii)  **오라클 모듈에** fs/child_process require 0    — 순수성(builder 는 I/O 가 본업이라 제외)
//   (iii) **오라클 모듈에** 문서 status 리터럴 0          — 받지 않는 값에 반응할 수 없음
//   (iv)  receiptPresent 의 생성/대입이 builder 밖 0건    — 오라클이 출처를 볼 수 없으므로
//         + builder 가 cat-file 을 쓰고 existsSync/ls-files 를 쓰지 않음   유일성만이 기계 장치

const fs = require('fs');
const path = require('path');

const SCRIPTS_ROOT = path.resolve(__dirname, '..', '..');        // plugins/mccp/scripts
const REPO_ROOT = path.resolve(SCRIPTS_ROOT, '..', '..', '..');  // repo root

const ORACLE = 'plugins/mccp/scripts/lib/msw-metrics/b1-status-drift.js';
const BUILDER = 'plugins/mccp/scripts/lib/msw-metrics/b1-evidence-builder.js';
const SOURCE = 'plugins/mccp/scripts/derive/sources/milestone-evidence.js';
const SCAN = 'plugins/mccp/scripts/lib/archive-complete/scan.js';

// 감사자 자신. 금지 패턴을 **데이터로** 담고 있어 자기 자신을 잡으므로 제외한다
// (single-writer-lint.js SELF / b2-coverage-gate.js SELF_EXEMPT 와 같은 이유).
const SELF = 'plugins/mccp/scripts/lib/msw-metrics/b1-independence-lint.js';

// scan.js 는 파일 전체가 판정 경로가 아니다 — ledger 는 여전히 **참고 인용**으로
// 병기되므로 module-level require 가 정당하게 남는다. 축 (i) 의 대상은 아래 마커로
// 구분된 drift 증거 **구간**이다.
const REGION_START = 'b1-independence:region-start';
const REGION_END = 'b1-independence:region-end';

const LEDGER_REQUIRE = /require\(\s*['"][^'"]*completion-ledger/;
const IMPURE_REQUIRE = /require\(\s*['"](?:node:)?(?:fs|child_process)['"]\s*\)/;
// 문서 status 리터럴 — 따옴표로 감싼 형태만 본다(음성 fixture 가 `if (status === 'complete')`).
const STATUS_LITERAL = /(['"])(?:complete|pending|in-progress|dropped)\1/;
// 생성/대입만 — 읽기(`evidence.receiptPresent`)는 대상이 아니다.
const RECEIPT_PRESENT_WRITE = /(?:^|[^.\w])receiptPresent\s*(?::|=(?!=))/;

function toPosix(p) { return String(p).split(path.sep).join('/'); }

// 주석을 공백으로 치환한다(줄 수·줄 번호 보존). 이 lint 는 **코드**의 형태를 보는
// 것이지 산문을 보는 것이 아니다 — 금지 패턴을 *설명하는* 주석에 걸리면 lint 가
// 문서화를 벌하게 되고, 저자는 규칙을 설명하지 않는 쪽으로 학습한다. 이 파일 자신이
// 4축을 주석으로 설명하고 있어 그 문제가 즉시 드러났다.
//
// 문자열 리터럴 안의 `//` 는 주석이 아니므로 따옴표 상태를 추적하고, **정규식 리터럴도
// 추적한다**(local review L1). 이전에는 정규식을 추적하지 않으면서 "대상 파일에 `//`·`/*`
// 를 담은 정규식이 없다" 를 근거로 삼았는데, 그것은 대상 파일이 바뀌면 **조용히 깨지는**
// 전제였다 — 오라클에 `/https?:\/\//` 하나만 추가되면 그 줄부터 나머지가 주석으로 접혀
// 축 (ii)·(iii) 가 통째로 눈이 먼다. 감사자가 눈머는 실패는 통과로 보이므로 위험하다.
//
// regex-vs-division 판정은 직전 유의 토큰으로 한다(표준 휴리스틱). 애매한 자리(`}` 뒤
// 등)는 **나눗셈으로 접는다** — 그쪽이 이전 동작이라 이 변경이 오작동을 *추가*할 수 없다.
const REGEX_PRECEDING_CHARS = new Set(
  ['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '+', '-', '*', '%', '~', '^', '<', '>']
);
const REGEX_PRECEDING_WORDS = new Set(
  ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'instanceof', 'do', 'else', 'yield', 'await']
);

function stripComments(text) {
  const src = String(text);
  let out = '';
  let i = 0;
  let quote = null;   // "'" | '"' | '`'
  let lastChar = null;   // 직전 유의 문자(코드 면)
  let lastWord = '';     // 직전 식별자 — 키워드 뒤의 `/` 는 정규식이다

  const noteCode = (ch) => {
    if (/\s/.test(ch)) return;
    if (/[A-Za-z0-9_$]/.test(ch)) lastWord += ch;
    else lastWord = '';
    lastChar = ch;
  };

  const startsRegex = () => (
    lastChar === null
    || REGEX_PRECEDING_CHARS.has(lastChar)
    || REGEX_PRECEDING_WORDS.has(lastWord)
  );

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += (next === undefined ? '' : next); i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; out += c; noteCode(c); i += 1; continue; }
    if (c === '/' && next !== '/' && next !== '*' && startsRegex()) {
      // 정규식 리터럴 — 문자 클래스 안의 `/` 는 종료가 아니다.
      out += c;
      i += 1;
      let inClass = false;
      while (i < src.length) {
        const r = src[i];
        if (r === '\n') break;                       // 미종료 정규식 — 방어적 탈출
        out += r;
        i += 1;
        if (r === '\\') { if (i < src.length) { out += src[i]; i += 1; } continue; }
        if (r === '[') { inClass = true; continue; }
        if (r === ']') { inClass = false; continue; }
        if (r === '/' && !inClass) break;
      }
      while (i < src.length && /[a-z]/.test(src[i])) { out += src[i]; i += 1; }   // 플래그
      lastChar = '/';
      lastWord = '';
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (c === '/' && next === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += (src[i] === '\n' ? '\n' : ' ');
        i += 1;
      }
      out += '  ';
      i += 2;
      continue;
    }
    out += c;
    noteCode(c);
    i += 1;
  }
  return out;
}

function readFileOr(abs) {
  try { return fs.readFileSync(abs, 'utf8'); } catch (_) { return null; }
}

// 마커 사이 구간만 반환. 마커가 없으면 null(= 구간 미선언) — 호출자가 위반으로 처리한다.
function extractRegion(text) {
  const s = text.indexOf(REGION_START);
  if (s === -1) return null;
  const e = text.indexOf(REGION_END, s);
  if (e === -1) return null;
  return text.slice(s, e);
}

function firstMatchingLine(text, re) {
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return { line: i + 1, text: lines[i].trim() };
  }
  return null;
}

// 코드 면에서만 찾는다(주석 제외). 보고되는 source_line 은 원문에서 꺼내 사람이
// 읽을 수 있게 한다 — 공백으로 치환된 줄을 보여주면 진단이 안 된다.
function findCode(text, re) {
  const hit = firstMatchingLine(stripComments(text), re);
  if (!hit) return null;
  const raw = String(text).split(/\r?\n/)[hit.line - 1];
  return { line: hit.line, text: (raw === undefined ? hit.text : raw.trim()) };
}

// 코드 면에 이 패턴이 **존재하는가**(양성 단언용).
function codeHas(text, re) {
  return re.test(stripComments(text));
}

function walkJs(dir, out) {
  out = out || [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // tests/ 는 제외 — 음성 fixture 와 stub 이 금지 패턴을 의도적으로 담는다.
      if (e.name === 'node_modules' || e.name === 'tests') continue;
      walkJs(full, out);
    } else if (e.isFile() && e.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

// lintIndependence — 개별 경로를 덮어쓸 수 있게 열어 둔다. 음성 fixture test 가
// tmpdir 사본을 가리켜 "lint 가 실제로 잡는가" 를 단언하기 위함이다. 잡지 못하는
// lint 는 통과 사실 자체가 무의미하다.
function lintIndependence(opts) {
  const o = opts || {};
  const repoRoot = o.repoRoot || REPO_ROOT;
  const violations = [];

  const abs = (rel) => (path.isAbsolute(rel) ? rel : path.join(repoRoot, rel));
  const oraclePath = o.oraclePath || abs(ORACLE);
  const builderPath = o.builderPath || abs(BUILDER);
  const sourcePath = o.sourcePath || abs(SOURCE);
  const scanPath = o.scanPath || abs(SCAN);

  const push = (axis, file, detail, hit) => {
    violations.push({
      axis: axis,
      file: toPosix(path.relative(repoRoot, file)) || toPosix(file),
      detail: detail,
      line: hit ? hit.line : null,
      source_line: hit ? hit.text : null,
    });
  };

  const oracle = readFileOr(oraclePath);
  const builder = readFileOr(builderPath);
  const source = readFileOr(sourcePath);
  const scan = readFileOr(scanPath);

  for (const [label, text, p] of [['oracle', oracle, oraclePath], ['builder', builder, builderPath],
    ['source', source, sourcePath], ['scan', scan, scanPath]]) {
    if (text === null) push('read', p, label + ' file is unreadable');
  }

  // --- 축 (i): 판정 경로에 completion-ledger require 0 ------------------------
  const ledgerTargets = [];
  if (oracle !== null) ledgerTargets.push([oraclePath, oracle]);
  if (builder !== null) ledgerTargets.push([builderPath, builder]);
  if (source !== null) ledgerTargets.push([sourcePath, source]);
  if (scan !== null) {
    const region = extractRegion(scan);
    if (region === null) {
      push('i-ledger-require', scanPath,
        'drift-evidence region markers not found (' + REGION_START + ' / ' + REGION_END + ')');
    } else {
      ledgerTargets.push([scanPath, region]);
    }
  }
  for (const [p, text] of ledgerTargets) {
    const hit = findCode(text, LEDGER_REQUIRE);
    if (hit) push('i-ledger-require', p, 'completion-ledger is required on the adjudication path', hit);
  }

  // --- 축 (ii): 오라클 모듈의 순수성 ------------------------------------------
  // builder 는 I/O 가 본업이므로 **이 축의 대상이 아니다** — 두 모듈을 같은 축으로
  // 묶으면 builder 가 존재할 수 없다.
  if (oracle !== null) {
    const hit = findCode(oracle, IMPURE_REQUIRE);
    if (hit) push('ii-oracle-purity', oraclePath, 'oracle requires fs/child_process (it must do no I/O)', hit);
  }

  // --- 축 (iii): 오라클 모듈에 문서 status 리터럴 0 ---------------------------
  if (oracle !== null) {
    const hit = findCode(oracle, STATUS_LITERAL);
    if (hit) push('iii-oracle-status-literal', oraclePath, 'oracle contains a document status literal', hit);
  }

  // --- 축 (iv): receiptPresent 생산자 유일성 ---------------------------------
  // 오라클은 순수 함수라 주입된 boolean 의 **출처를 볼 수 없다**(fs.existsSync 도
  // git cat-file 도 boolean 하나를 낸다). 런타임 검증이 원리상 불가능하므로 생산자가
  // 하나뿐임을 정적으로 고정하는 것이 유일한 기계 장치다.
  const scanRoots = Array.isArray(o.scanRoots) ? o.scanRoots : [SCRIPTS_ROOT];
  const builderAbsResolved = path.resolve(builderPath);
  const selfAbs = path.resolve(repoRoot, SELF);
  for (const rootDir of scanRoots) {
    for (const file of walkJs(rootDir)) {
      const resolved = path.resolve(file);
      if (resolved === builderAbsResolved || resolved === selfAbs) continue;
      const text = readFileOr(file);
      if (text === null) continue;
      const hit = findCode(text, RECEIPT_PRESENT_WRITE);
      if (hit) {
        push('iv-evidence-producer', file,
          'receiptPresent is created/assigned outside ' + BUILDER, hit);
      }
    }
  }

  // builder 의 **수단**도 고정한다. 출력 단언(test)은 "이 구현이 틀렸다" 를 잡지만
  // "이 구현이 맞다" 를 증명하지 못한다 — 하드코딩 목록·캐시 조회 같은 제3의 구현도
  // false 를 낼 수 있다. 명령 문자열을 정적으로 고정하면 그 간극이 닫힌다.
  if (builder !== null) {
    if (!codeHas(builder, /['"]cat-file['"]/)) {
      push('iv-evidence-producer', builderPath,
        'builder does not use `git cat-file` for receipt reachability');
    }
    const existsHit = findCode(builder, /fs\s*\.\s*existsSync/);
    if (existsHit) {
      push('iv-evidence-producer', builderPath,
        'builder uses fs.existsSync (working-tree presence is not commit reachability)', existsHit);
    }
    const lsFilesHit = findCode(builder, /['"]ls-files['"]/);
    if (lsFilesHit) {
      push('iv-evidence-producer', builderPath,
        'builder uses git ls-files (index membership passes staged-only receipts)', lsFilesHit);
    }
  }

  return { ok: violations.length === 0, violations: violations };
}

function main(argv) {
  const args = argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root') opts.repoRoot = args[++i];
    else if (args[i] === '--json') opts.json = true;
  }
  // --repo-root 를 주면 축 (iv) 의 스캔 범위도 **그 트리**로 향한다. 기본값(실제
  // SCRIPTS_ROOT)을 유지하면 음성 fixture 를 가리켜도 진짜 소스를 스캔해 fixture 가
  // 검증되지 않는다.
  if (opts.repoRoot) {
    opts.scanRoots = [path.join(opts.repoRoot, 'plugins', 'mccp', 'scripts')];
  }
  const result = lintIndependence(opts);
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (result.ok) {
    process.stdout.write('[b1-independence-lint] ok — 4 axes clean\n');
  } else {
    result.violations.forEach((v) => {
      process.stderr.write('[b1-independence-lint] ' + v.axis + ' — ' + v.file
        + (v.line ? ':' + v.line : '') + ' — ' + v.detail + '\n');
      if (v.source_line) process.stderr.write('    ' + v.source_line + '\n');
    });
    process.stderr.write('[b1-independence-lint] ' + result.violations.length + ' violation(s)\n');
  }
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) main(process.argv);

module.exports = {
  lintIndependence,
  stripComments,
  ORACLE,
  BUILDER,
  SOURCE,
  SCAN,
  REGION_START,
  REGION_END,
};
