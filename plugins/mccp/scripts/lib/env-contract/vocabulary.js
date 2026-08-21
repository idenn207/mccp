'use strict';

// env-contract/vocabulary.js — 레지스트리 `values`와 코드 어휘를 잇는 단일 소유자 (M1).
//
// L1~L9는 전부 **계약 내부**(레지스트리 ↔ 색인 ↔ 상세)의 정합만 본다. 그래서 존재하지
// 않는 값이 레지스트리에 들어가면 세 표면에 일관되게 복제된 뒤 green으로 보고된다 —
// 실측된 어긋남이 전부 그 형태다. 이 모듈이 만드는 결속은 «문서가 가르치는 값»과
// «코드가 실제로 받는 값» 사이의 유일한 다리이고, L10과 `doctor`가 같은 표를 읽는다.
//
// **DD1 — 소스 텍스트를 읽고 `require`하지 않는다.** 소비처 모듈 다수가 load 시점에
// env를 포획하고 stderr에 warn을 쓰며 일부는 fs를 만진다. 감사 대상을 부팅하는 lint는
// 자기가 감사하는 상태를 바꾼다. 정적 추출은 표현식으로 만든 집합을 못 읽지만, 그
// 한계는 `{ok:false, reason}`으로 **명시 열거**되지 조용히 통과하지 않는다(UI5).
//
// **DD2 — `vocabulary`는 3형태다.**
//   (a) `'path/to/file.js#CONST'`   배열 리터럴 정적 추출
//   (b) `{ derive: '<name>' }`      명명된 파생자. M1에는 `hook-ids` 하나뿐이고,
//                                   새 파생자를 늘리려면 "왜 상수로 승격할 수 없는가"를
//                                   논증해야 한다.
//   (c) `null` + `vocabularyGap`    읽을 수 없음을 명시 열거
//
// mirror: state/toggle-snapshot.js:50 `TOGGLE_EXCLUSIONS` — "제외는 정규식이 아니라
//         이름이고, 각 이름에는 실파일 근거가 붙는다". 아래 `QUARANTINE`이 같은 규약이다.
//         env-contract/lint.js:119 `evidenceLexicalProblem` — 어휘 스크린이 fs보다 먼저.

const fs = require('fs');
const path = require('path');

// 소스 파일 크기 상한. 이 표면의 최대 파일이 40KB 미만이라 2MB는 넉넉하며, 상한의
// 목적은 정상 입력을 거르는 것이 아니라 «읽기가 끝나지 않는 경우»를 유한하게 만드는
// 것이다.
const MAX_FILE_BYTES = 2 * 1024 * 1024;
// 한 상수에서 뽑는 리터럴 개수 상한. 어휘는 열거형이라 실제로는 한 자리 수다.
const MAX_LITERALS = 512;

// ── ref 어휘 스크린 ──────────────────────────────────────────────────────────
// fs를 부르기 **전에** 돈다. lint.js:119와 같은 이유 — 실재를 먼저 보면 디스크에
// 존재하는 절대경로가 통과해 CLAUDE.md §3.12가 닫은 누출 경로가 다시 열린다.
// ref는 registry.js(신뢰되는 in-repo 선언)에서 오지만, 오타 하나가 저장소 밖을
// 읽게 만드는 형태를 애초에 표현 불가능하게 둔다.
function refLexicalProblem(ref) {
  if (typeof ref !== 'string' || ref.trim() === '') return 'empty vocabulary ref';
  const raw = ref.trim();
  const hash = raw.indexOf('#');
  if (hash === -1) return 'vocabulary ref must be "path#CONST", got "' + raw + '"';
  const p = raw.slice(0, hash);
  const c = raw.slice(hash + 1);
  if (p === '') return 'vocabulary ref path is empty';
  if (c === '') return 'vocabulary ref constant is empty';
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(c)) return 'constant name is not an identifier: ' + c;
  if (p.indexOf('\u0000') !== -1) return 'vocabulary ref path contains a NUL byte';
  if (/^[/\\]/.test(p)) return 'absolute path (POSIX root) not allowed: ' + p;
  if (/^[A-Za-z]:/.test(p)) return 'absolute path (drive letter) not allowed: ' + p;
  if (/^\\\\/.test(p)) return 'absolute path (UNC) not allowed: ' + p;
  if (/^~[/\\]?/.test(p)) return 'home-relative path not allowed: ' + p;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(p)) return 'URL not allowed: ' + p;
  if (/%[A-Za-z_]+%|\$\{?[A-Za-z_]/.test(p)) return 'environment-expanded path not allowed: ' + p;
  if (p.split(/[/\\]/).indexOf('..') !== -1) return 'parent traversal ".." not allowed: ' + p;
  return null;
}

function readSource(repoRoot, rel) {
  const abs = path.join(repoRoot, rel);
  let st;
  try {
    st = fs.statSync(abs);
  } catch (e) {
    return { ok: false, reason: 'cannot stat ' + rel + ': ' + e.message };
  }
  if (!st.isFile()) return { ok: false, reason: 'not a regular file: ' + rel };
  if (st.size > MAX_FILE_BYTES) {
    return { ok: false, reason: rel + ' exceeds the ' + MAX_FILE_BYTES + '-byte read cap (' + st.size + ')' };
  }
  try {
    return { ok: true, text: fs.readFileSync(abs, 'utf8') };
  } catch (e) {
    return { ok: false, reason: 'cannot read ' + rel + ': ' + e.message };
  }
}

// ── 배열 리터럴 스캐너 ───────────────────────────────────────────────────────
// 정규식 하나로 배열 본문을 잡으려 하면 문자열 안의 `]`와 주석에서 반드시 틀린다.
// 문자 단위로 걸으면 상태가 명시적이고 중첩 깊이를 셀 수 있다 — «한 겹만 본다»는
// 규칙이 그 깊이로 표현된다. 되짚기가 없으므로 입력 길이에 선형이다.
function scanArrayElements(text, openIdx) {
  const elements = [];
  let cur = '';
  let depth = 0;
  let i = openIdx + 1;
  while (i < text.length) {
    const ch = text[i];
    if (depth === 0 && ch === ']') {
      elements.push(cur);
      return { ok: true, elements: elements, end: i };
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      let lit = ch;
      let closed = false;
      while (j < text.length) {
        if (text[j] === '\\') { lit += text[j] + (text[j + 1] || ''); j += 2; continue; }
        if (text[j] === quote) { lit += quote; j += 1; closed = true; break; }
        lit += text[j];
        j += 1;
      }
      if (!closed) return { ok: false, reason: 'unterminated string literal in array body' };
      cur += lit;
      i = j;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === '[' || ch === '(' || ch === '{') { depth += 1; cur += ch; i += 1; continue; }
    if (ch === ']' || ch === ')' || ch === '}') { depth -= 1; cur += ch; i += 1; continue; }
    if (ch === ',' && depth === 0) { elements.push(cur); cur = ''; i += 1; continue; }
    cur += ch;
    i += 1;
  }
  return { ok: false, reason: 'array literal is not closed' };
}

const PLAIN_STRING_RE = /^(?:'([^'\\]*)'|"([^"\\]*)")$/;

/**
 * `'path/to/file.js#CONST'` 형태의 ref를 소스 **텍스트**에서 해석한다.
 *
 * 실패는 전부 `{ok:false, reason}`이다. **빈 배열을 성공으로 돌려주지 않는다** —
 * 빈 집합은 L10의 집합 비교에서 "모든 값이 불일치"를 뜻해 조용한 red를 만든다.
 *
 * @param {string} repoRoot
 * @param {string} ref
 * @returns {{ok:true, values:string[], file:string, constant:string}|{ok:false, reason:string}}
 */
function extractConstant(repoRoot, ref) {
  const lex = refLexicalProblem(ref);
  if (lex) return { ok: false, reason: lex };
  const raw = String(ref).trim();
  const hash = raw.indexOf('#');
  const rel = raw.slice(0, hash);
  const constant = raw.slice(hash + 1);

  const src = readSource(repoRoot || process.cwd(), rel);
  if (!src.ok) return { ok: false, reason: src.reason };

  // 선행 경계는 «단어 문자도 `.`도 아닌 것»이다. `[\r\n;]`으로 좁히면
  // `function g() { const V = […] }`처럼 여는 중괄호 뒤에 오는 두 번째 선언을 놓쳐,
  // 같은 이름이 두 번 선언된 파일에서 **먼저 나온 것을 조용히 고른다** — 모호한 소스를
  // 거부하는 대신 임의로 하나를 택하는 것은 fail-open이다. 넓힌 쪽의 오탐(주석 안의
  // `const V =`)은 «모호하니 거부»로 끝나므로 안전한 방향이다.
  const declRe = new RegExp('(?:^|[^\\w$.])(?:const|let|var)\\s+' + constant + '\\s*=', 'g');
  const m = declRe.exec(src.text);
  if (!m) return { ok: false, reason: 'no `const ' + constant + ' = …` declaration in ' + rel };
  if (declRe.exec(src.text)) {
    return { ok: false, reason: 'more than one declaration of ' + constant + ' in ' + rel };
  }

  // `= Object.freeze([`, `= new Set([`, `= [` — 첫 `[`까지 가되, 그 사이에 래퍼가
  // 아닌 것이 끼면 배열 리터럴이 아니라 표현식이므로 실패한다.
  const after = src.text.slice(m.index + m[0].length);
  const openRel = after.search(/\[/);
  if (openRel === -1) return { ok: false, reason: constant + ' in ' + rel + ' is not an array literal' };
  const prefix = after.slice(0, openRel);
  if (!/^\s*(?:Object\.freeze\s*\(\s*|new\s+Set\s*\(\s*)*$/.test(prefix)) {
    return { ok: false, reason: constant + ' in ' + rel + ' is built by an expression, not an array literal' };
  }

  const scanned = scanArrayElements(after, openRel);
  if (!scanned.ok) return { ok: false, reason: scanned.reason + ' (' + constant + ' in ' + rel + ')' };

  const values = [];
  for (let k = 0; k < scanned.elements.length; k += 1) {
    const el = scanned.elements[k].trim();
    if (el === '') continue; // 마지막 원소 뒤의 trailing comma
    const lit = PLAIN_STRING_RE.exec(el);
    if (!lit) {
      return {
        ok: false,
        reason: constant + ' in ' + rel + ' contains a non-literal element: ' + el.slice(0, 60),
      };
    }
    values.push(lit[1] !== undefined ? lit[1] : lit[2]);
    if (values.length > MAX_LITERALS) {
      return { ok: false, reason: constant + ' in ' + rel + ' exceeds ' + MAX_LITERALS + ' literals' };
    }
  }
  if (values.length === 0) {
    return { ok: false, reason: constant + ' in ' + rel + ' has no string literals (an empty set is never a success)' };
  }
  return { ok: true, values: values, file: rel, constant: constant };
}

// ── 명명된 파생자 ────────────────────────────────────────────────────────────
// `MCCP_DISABLED_HOOKS`의 어휘는 단일 상수가 아니라 **두 이질적 소스**의 합집합이다
// (G3 실측). `path#CONST` 한 형태로는 표현할 수 없으므로 이름 붙인 파생자를 둔다.
// 둘 중 하나라도 못 읽으면 `{ok:false}` — 부분 집합은 L10에서 있지도 않은 불일치를
// 만들어 내므로 통과보다 나쁘다.
const DISPATCHER_REL = 'plugins/mccp/scripts/hooks/bash-hook-dispatcher.js';
const HOOKS_JSON_REL = 'plugins/mccp/hooks/hooks.json';

function deriveHookIds(repoRoot) {
  const root = repoRoot || process.cwd();
  const ids = new Set();

  const disp = readSource(root, DISPATCHER_REL);
  if (!disp.ok) return { ok: false, reason: disp.reason };
  // **속성 위치**의 `id:`만 주장으로 인정한다 — 앞에 `{` 나 `,` 또는 줄머리가 와야 한다.
  // `\bid:` 하나만으로는 산문 한복판의 `… id: 'x' …` 같은 것도 잡아 어휘가 상위 집합이
  // 되고, 상위 집합은 `doctor` 가 진짜 오타에 경고를 내지 않는 fail-open 이다.
  //
  // 줄머리(`/^[ \t]*id:/m`)로 좁히지 **않은** 이유: `[{ id: 'x' }]` 처럼 한 줄에 쓴
  // 테이블에서 절반만 읽혀 조용한 부분 집합이 된다(실측 — lint fixture 가 정확히 그
  // 형태라 전 fixture 가 붉어졌다). 부분 집합은 상위 집합보다 안전한 방향이지만 여전히
  // «못 읽었는데 읽은 척»이고, 이 파일의 규약은 그것을 금지한다.
  const idRe = /(?:^|[{,])\s*id:\s*'([^'\\\n]+)'/gm;
  let m;
  while ((m = idRe.exec(disp.text))) ids.add(m[1]);
  if (ids.size === 0) {
    return { ok: false, reason: 'no `id:` literals in ' + DISPATCHER_REL + ' — an empty half is not a success' };
  }
  const fromDispatcher = ids.size;

  const hooks = readSource(root, HOOKS_JSON_REL);
  if (!hooks.ok) return { ok: false, reason: hooks.reason };
  const argvRe = /run-with-flags\.js\s+([A-Za-z][A-Za-z0-9:_-]*)/g;
  let n = 0;
  while ((m = argvRe.exec(hooks.text))) { ids.add(m[1]); n += 1; }
  if (n === 0) {
    return { ok: false, reason: 'no `run-with-flags.js <id>` argv in ' + HOOKS_JSON_REL + ' — an empty half is not a success' };
  }

  return {
    ok: true,
    values: Array.from(ids).sort(),
    sources: [DISPATCHER_REL + ' (' + fromDispatcher + ')', HOOKS_JSON_REL + ' (' + n + ')'],
  };
}

const DERIVERS = Object.freeze({
  'hook-ids': deriveHookIds,
});

// ── 격리표 ──────────────────────────────────────────────────────────────────
// 알려진 어긋남의 **명시 열거**. `TOGGLE_EXCLUSIONS` 규약대로 정규식이 아니라 이름이고,
// 각 이름에 실파일 근거와 담당 마일스톤이 붙는다.
//
// **격리는 배수된다(DD3-ii).** L10은 격리되지 않은 불일치에 실패할 뿐 아니라, 격리
// 항목이 **더 이상 불일치하지 않아도** 실패한다. 후자가 없으면 이 표는 영구 면죄부가
// 되어 M2가 수리해도 아무도 지우지 않는다.
//
// `expected`는 레지스트리의 `values`, `actual`은 코드가 실제로 받는 어휘다. 둘 다
// 정렬된 집합으로 비교되므로 순서는 의미가 없다.
//
// 아래 8건은 L10을 켠 **첫 실행에서 실측된 전부**다. 어느 것도 추정이 아니며, 각
// `actual`은 이 파일의 추출기가 그 시점에 소스에서 읽어 낸 값 그대로다.
const QUARANTINE = Object.freeze([
  Object.freeze({
    name: 'MCCP_PLAN_REVIEW',
    expected: Object.freeze(['off', 'multi-agent', 'codex', 'hybrid']),
    actual: Object.freeze(['codex', 'multi-agent', 'hybrid']),
    reason: '문서만 아는 `off`. plan-review/decide.js:50 `MODES`에 없으므로 판독 불가 값으로 '
      + '취급돼 `codex`로 fallback한다 — «리뷰 없음»을 기대한 운영자가 정반대로 cross-model '
      + '리뷰를 받는다. UI10대로 M1은 이 모드를 구현하지 않는다.',
    owner: 'M2 (문서에서 `off`를 제거)',
  }),
  Object.freeze({
    name: 'MCCP_SANTA_SEVERITY_GATE',
    expected: Object.freeze(['off', 'high', 'critical']),
    actual: Object.freeze(['enforce', 'off']),
    reason: '코드는 2상태(enforce|off)인데 문서는 severity 임계 어휘를 가르친다. '
      + 'santa/gate.js:148이 열거 밖 값을 거부하므로 문서대로 `high`를 넣으면 warn 후 '
      + 'default로 되돌아간다 — 이 저장소의 `.claude/settings.json`이 실제로 `high`를 쓴다.',
    owner: 'M2 (값 수리)',
  }),
  Object.freeze({
    name: 'MCCP_SANTA_TERMINATOR',
    expected: Object.freeze(['off', 'on']),
    actual: Object.freeze(['enforce', 'off']),
    reason: '문서의 `on`이 santa/terminator.js:20 `TERMINATOR_VALUES`에 없다. '
      + '같은 파일 :89가 열거 밖 값을 거부한다.',
    owner: 'M2 (값 수리)',
  }),
  Object.freeze({
    name: 'MCCP_SANTA_ADJUDICATION_GATE',
    expected: Object.freeze(['off', 'warn', 'enforce']),
    actual: Object.freeze(['enforce', 'off']),
    reason: '문서의 `warn`이 santa/adjudication.js:43 `GATE_VALUES`에 없다. '
      + '중간 등급이 있다고 가르치지만 코드는 2상태다.',
    owner: 'M2 (값 수리)',
  }),
  Object.freeze({
    name: 'MCCP_SANTA_LEDGER_SUPPRESSION',
    expected: Object.freeze(['off', 'on']),
    actual: Object.freeze(['enforce', 'off']),
    reason: '문서의 `on`이 santa/adjudication.js:43 `GATE_VALUES`에 없다. '
      + '이 토글은 위 ADJUDICATION_GATE와 같은 상수를 공유한다(같은 `parseEnum`).',
    owner: 'M2 (값 수리)',
  }),
  Object.freeze({
    name: 'MCCP_HOOK_PROFILE',
    expected: Object.freeze(['full', 'lean', 'minimal']),
    actual: Object.freeze(['minimal', 'standard', 'strict']),
    reason: '겹치는 값이 `minimal` 하나뿐이다. 문서의 `full`·`lean`은 코드에 없고, '
      + 'hook-flags.js:19가 실제로 쓰는 기본값 `standard`는 문서에 없다 — 양방향으로 어긋난 '
      + '유일한 항목이다.',
    owner: 'M2 (값 수리 + 기본값 문서화)',
  }),
  Object.freeze({
    name: 'MCCP_STATE_JOURNAL',
    expected: Object.freeze(['off', 'on']),
    actual: Object.freeze(['enforce', 'off', 'shadow']),
    reason: '문서의 `on`이 state-journal/index.js `JOURNAL_MODES`에 없다. '
      + '코드의 3상태(enforce|shadow|off)를 문서가 boolean으로 축약했다.',
    owner: 'M2 (값 수리)',
  }),
  Object.freeze({
    name: 'MCCP_SESSION_LEDGER_SCOPE',
    expected: Object.freeze(['repo', 'host', 'global']),
    actual: Object.freeze(['global', 'repo', 'hybrid']),
    reason: '문서의 `host`가 state/session-ledger.js `VALID_SCOPES`에 없고, 코드의 `hybrid`가 '
      + '문서에 없다. 이름이 비슷해 오탈자로 보이지만 두 값의 의미가 다르므로 어느 쪽을 '
      + '정본으로 삼을지는 소비처 확인이 필요하다.',
    owner: 'M2 (정본 확정 후 수리)',
  }),
]);

/**
 * 한 레지스트리 항목의 어휘를 3형태 중 맞는 것으로 해석한다.
 * L10과 `doctor`가 **같은 함수**를 쓴다 — 두 축이 갈라지면 한쪽이 통과시킨 값을
 * 다른 쪽이 정상이라 보고하는 상태가 생긴다.
 *
 * @param {string} repoRoot
 * @param {{name:string, vocabulary:*, vocabularyGap:*}} entry
 * @returns {{ok:boolean, form:string, values?:string[], reason?:string, source?:string}}
 */
function resolveVocabulary(repoRoot, entry) {
  const v = entry && entry.vocabulary;
  if (v === null || v === undefined) {
    const gap = entry && entry.vocabularyGap;
    if (gap) return { ok: false, form: 'gap', reason: gap };
    return { ok: false, form: 'unspecified', reason: 'no vocabulary and no vocabularyGap' };
  }
  if (typeof v === 'string') {
    const r = extractConstant(repoRoot, v);
    if (!r.ok) return { ok: false, form: 'ref', reason: r.reason };
    return { ok: true, form: 'ref', values: r.values, source: r.file + '#' + r.constant };
  }
  if (typeof v === 'object' && typeof v.derive === 'string') {
    const fn = DERIVERS[v.derive];
    if (!fn) return { ok: false, form: 'derive', reason: 'unknown deriver: ' + v.derive };
    const r = fn(repoRoot);
    if (!r.ok) return { ok: false, form: 'derive', reason: r.reason };
    return { ok: true, form: 'derive', values: r.values, source: 'derive:' + v.derive };
  }
  return { ok: false, form: 'malformed', reason: 'vocabulary must be a "path#CONST" string, {derive}, or null' };
}

function quarantineByName() {
  const m = new Map();
  QUARANTINE.forEach(function (q) { m.set(q.name, q); });
  return m;
}

module.exports = {
  extractConstant: extractConstant,
  refLexicalProblem: refLexicalProblem,
  resolveVocabulary: resolveVocabulary,
  DERIVERS: DERIVERS,
  QUARANTINE: QUARANTINE,
  quarantineByName: quarantineByName,
  MAX_FILE_BYTES: MAX_FILE_BYTES,
  MAX_LITERALS: MAX_LITERALS,
};
