'use strict';

// closure-accounting M3 — 도달성 **선언**(`PRODUCER_CHANNELS`)과 emitter **소스**의 대조.
//
// 왜 필요한가: 선언 데이터는 첫 커밋에만 참이다. 채널 표가 리포트에 실리는 순간 그것은
// 독자가 인용하는 사실이 되므로, 현실과 어긋나는 순간 붉어질 장치가 없으면 "도달성을
// 표기한다"는 주장 자체가 낡은 채로 계속 출력된다. diverse-agent-review #1.5 가 패널에
// 판정을 배선하면 R3 이 붉어지고, 선언을 고치지 않으면 착지할 수 없다.
//
// **이 파일이 증명하지 않는 것** (Implement-Codex R1 F1 · plan gate hybrid L3 — 독립 2회
// 재현, backlog 2026-09-14 MEDIUM): 스캔은 *길이 코드에 존재하는가*만 본다. emitter 를
// 호출하는 쪽을 지워도 함수 본문의 리터럴·맵 참조·`appendFindings(` 는 그대로 남으므로
// 모든 신호가 불변이다. 그 축(각 producer 를 운영 caller 경유로 구동해 실제 이벤트를
// 단언하는 동작 test)은 별도 축으로 이연했다.
//
// 위협 모델은 `c1-coverage-gate.js:16-20` 과 같다 — 위조 방지가 아니라 **우발적 드리프트**.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const registry = require('../../state/findings-registry');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

// 스캐너 자신은 이 리터럴들을 데이터로 담고 있어 자기 자신을 잡는다. 이 파일은
// `tests/` 아래라 파일 열거에서 이미 빠지지만, 레지스트리는 명시 면제가 필요하다 —
// `appendFindings` 의 정의가 거기 있다.
const REGISTRY_SELF = 'plugins/mccp/scripts/state/findings-registry.js';

const APPEND_RE = /appendFindings\s*\(/;
const ADJ_KIND_RE = /kind:\s*['"]finding_adjudicated['"]/;
const ANY_KIND_RE = /kind:\s*['"]finding_(?:opened|adjudicated|closed)['"]/;
const CLOSURE_LITERAL_RE = /closure_type:\s*['"](\w+)['"]/g;
const MAP_REF = 'CLOSURE_FROM_ADJUDICATION[';

// 주석 줄은 검사에서 뺀다 — 넓힌 패턴이 주석까지 보면 **금지된 형태를 문서에 적는 행위
// 자체가 위반**이 되어 설명을 쓸 수 없게 된다(c1-coverage-gate.js 의 같은 규칙).
//
// 블록 주석은 `/*` 로 **열린 뒤에만** 뺀다. `*` 로 시작하는 줄을 무조건 주석으로 보면
// 앞 줄에서 이어지는 곱셈 같은 코드 줄까지 스캔에서 빠진다.
// ponytail: 줄 단위 근사 — 문자열 안의 `/*` 나 줄 중간에서 열리는 블록은 구분하지 못한다.
function stripCommentLines(raw) {
  let inBlock = false;
  return String(raw).split(/\r?\n/).filter(function (line) {
    const t = line.trim();
    if (inBlock) {
      if (t.indexOf('*/') !== -1) inBlock = false;
      return false;
    }
    if (t.indexOf('//') === 0) return false;
    if (t.indexOf('/*') === 0) {
      inBlock = t.indexOf('*/', 2) === -1;
      return false;
    }
    return true;
  }).join('\n');
}

function listJsFiles(dir, acc) {
  acc = acc || [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_e) { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      listJsFiles(full, acc);
    } else if (e.isFile() && e.name.endsWith('.js')) {
      acc.push(full);
    }
  }
  return acc;
}

function toPosix(p) { return String(p).split(path.sep).join('/'); }

// 비-test `.js` 전수. 각 항목은 주석 줄이 제거된 본문을 들고 있다.
function scanSources(root) {
  const scanRoot = path.join(root, 'plugins', 'mccp', 'scripts');
  return listJsFiles(scanRoot).map(function (abs) {
    const rel = toPosix(path.relative(root, abs));
    let raw = '';
    try { raw = fs.readFileSync(abs, 'utf8'); } catch (_e) { raw = ''; }
    const code = stripCommentLines(raw);
    return { rel: rel, code: code };
  }).filter(function (f) {
    return f.rel.indexOf('/tests/') === -1 && !f.rel.endsWith('.test.js');
  });
}

function readEmitter(root, rel) {
  const abs = path.join(root, rel);
  const raw = fs.readFileSync(abs, 'utf8');
  return stripCommentLines(raw);
}

// R5 — 판정 이벤트를 내면서 매핑 표를 경유하지 않는 파일. 계약 (c).
function adjudicatorsBypassingMap(root) {
  return scanSources(root)
    .filter(function (f) { return ADJ_KIND_RE.test(f.code) && f.code.indexOf(MAP_REF) === -1; })
    .map(function (f) { return f.rel; });
}

// R6 — 레지스트리에 발자국을 남기는 파일 전수(선언 여부와 무관).
function filesWithRegistryFootprint(root) {
  return scanSources(root)
    .filter(function (f) { return ANY_KIND_RE.test(f.code) || APPEND_RE.test(f.code); })
    .map(function (f) { return f.rel; });
}

function closureLiterals(code) {
  const out = new Set();
  let m;
  CLOSURE_LITERAL_RE.lastIndex = 0;
  while ((m = CLOSURE_LITERAL_RE.exec(code)) !== null) out.add(m[1]);
  return out;
}

function sortedArray(set) { return Array.from(set).sort(); }

// ── R1~R4: 선언 ↔ emitter 소스 ───────────────────────────────────────────────

test('(R1) every declared emitter exists on disk', () => {
  for (const c of registry.PRODUCER_CHANNELS) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, c.emitter)),
      c.channel + ': declared emitter ' + c.emitter + ' does not exist');
  }
});

test('(R2) registers agrees with whether the emitter calls appendFindings', () => {
  for (const c of registry.PRODUCER_CHANNELS) {
    const code = readEmitter(REPO_ROOT, c.emitter);
    assert.equal(APPEND_RE.test(code), c.registers,
      c.channel + ': declared registers=' + c.registers + ' but the source says otherwise');
  }
});

test('(R3) adjudicated agrees with whether the emitter writes a finding_adjudicated event', () => {
  for (const c of registry.PRODUCER_CHANNELS) {
    const code = readEmitter(REPO_ROOT, c.emitter);
    assert.equal(ADJ_KIND_RE.test(code), c.adjudicated,
      c.channel + ': declared adjudicated=' + c.adjudicated + ' but the source says otherwise');
  }
});

test('(R4) closure_types is exactly the literals the emitter writes, plus the map it consults', () => {
  const mapped = Object.keys(registry.CLOSURE_FROM_ADJUDICATION)
    .map(function (k) { return registry.CLOSURE_FROM_ADJUDICATION[k]; })
    .filter(Boolean);
  for (const c of registry.PRODUCER_CHANNELS) {
    const code = readEmitter(REPO_ROOT, c.emitter);
    const reachable = closureLiterals(code);
    // 맵을 참조하면 그 비-null 값 전부에 닿을 수 있다 — 리터럴로 복제하지 않는 이유다.
    if (code.indexOf(MAP_REF) !== -1) mapped.forEach(function (v) { reachable.add(v); });
    assert.deepEqual(sortedArray(reachable), sortedArray(new Set(c.closure_types)),
      c.channel + ': declared closure_types do not match the source');
  }
});

// ── R5~R6: 계약 (c) — 전수 스캔 ──────────────────────────────────────────────

test('(R5) a file that adjudicates findings must go through CLOSURE_FROM_ADJUDICATION', () => {
  assert.deepEqual(adjudicatorsBypassingMap(REPO_ROOT), [],
    'these files pick a closure outcome without consulting the single mapping table');
});

test('(R6) every file that touches the registry is a declared emitter', () => {
  const declared = new Set(registry.PRODUCER_CHANNELS.map(function (c) { return c.emitter; }));
  declared.add(REGISTRY_SELF);
  const undeclared = filesWithRegistryFootprint(REPO_ROOT)
    .filter(function (rel) { return !declared.has(rel); });
  assert.deepEqual(undeclared, [],
    'these files emit registry events but are absent from PRODUCER_CHANNELS');
});

// ── R7: 분류 ─────────────────────────────────────────────────────────────────

test('(R7) channelOf applies the three rules in order and counts the rest', () => {
  assert.equal(registry.channelOf({ gate_id: 'mccp-santa-loop', perspective: 'santa-A' }), 'santa-loop');
  assert.equal(registry.channelOf({ gate_id: 'mccp-plan-codex', perspective: 'codex' }), 'plan-codex-runner');
  assert.equal(registry.channelOf({ gate_id: 'mccp-plan-codex', perspective: 'architect' }), 'plan-review-panel');
  // 모르는 gate 는 버려지지 않는다 — 버리면 채널 합계가 ledger 합계보다 작아지고 그
  // 차이가 설명되지 않는다(DD5).
  assert.equal(registry.channelOf({ gate_id: 'mccp-something-new', perspective: 'x' }), 'unattributed');
  assert.equal(registry.channelOf({}), 'unattributed');
  assert.equal(registry.channelOf(null), 'unattributed');

  const declared = registry.PRODUCER_CHANNELS.map(function (c) { return c.channel; });
  assert.ok(declared.indexOf('plan-review-l3') !== -1,
    'a channel that registers nothing must still be declared, or the reachability claim is false');
  assert.ok(declared.indexOf(registry.UNATTRIBUTED_CHANNEL) === -1,
    'unattributed is a bucket, not a producer');
});

// ── R8: 비공허 양성 대조 ─────────────────────────────────────────────────────
//
// 스캐너가 실제로 무언가를 잡는지 임시 트리로 확인한다. 이것이 없으면 R5·R6 의 빈
// 배열은 "위반이 없다"와 "스캐너가 아무것도 못 본다"를 구분하지 못한다.

function makeTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-reach-'));
  for (const rel of Object.keys(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[rel], 'utf8');
  }
  return root;
}

test('(R8) the scanners catch an undeclared emitter and a map-bypassing adjudicator', () => {
  const root = makeTree({
    'plugins/mccp/scripts/lib/rogue-closer.js':
      "'use strict';\nfunction f(){ return { kind: 'finding_closed', closure_type: 'fixed' }; }\nmodule.exports={f:f};\n",
    'plugins/mccp/scripts/lib/rogue-adjudicator.js':
      "'use strict';\nfunction g(){ return { kind: 'finding_adjudicated', state: 'accepted' }; }\nmodule.exports={g:g};\n",
    // 주석 안의 같은 리터럴은 위반이 아니다 — 아니라면 이 규칙을 문서에 적을 수 없다.
    'plugins/mccp/scripts/lib/innocent-doc.js':
      "'use strict';\n// kind: 'finding_closed' 는 종결 이벤트다\nmodule.exports={};\n",
    'plugins/mccp/scripts/lib/innocent-block.js':
      "'use strict';\n/*\n * kind: 'finding_closed' 는 종결 이벤트다\n */\nmodule.exports={};\n",
    // `*` 로 시작해도 블록 주석 밖이면 코드다 — 스캔에서 빠지면 안 된다.
    'plugins/mccp/scripts/lib/rogue-continuation.js':
      "'use strict';\nconst n = 2\n  * appendFindings(1);\nmodule.exports={n:n};\n",
    // test 는 전수에서 빠진다.
    'plugins/mccp/scripts/lib/tests/decoy.test.js':
      "'use strict';\nconst e={ kind: 'finding_adjudicated' };\n",
  });
  try {
    const footprint = filesWithRegistryFootprint(root);
    assert.deepEqual(footprint.sort(), [
      'plugins/mccp/scripts/lib/rogue-adjudicator.js',
      'plugins/mccp/scripts/lib/rogue-closer.js',
      'plugins/mccp/scripts/lib/rogue-continuation.js',
    ], 'R6 scanner must see undeclared emitters (even on a `*`-led line), ignore comments, and skip tests');

    assert.deepEqual(adjudicatorsBypassingMap(root),
      ['plugins/mccp/scripts/lib/rogue-adjudicator.js'],
      'R5 scanner must see an adjudicator that never consults the mapping table');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ── R9: 선언된 emitter 함수는 실제로 호출된다 (closure-accounting M5 DD7 · backlog 1828 · 1851) ──
//
// R2 는 emitter **파일**에 `appendFindings(` 가 있는지만 본다. 그 호출을 감싼 함수를 아무도
// 부르지 않아도 R2 는 초록이다 — 1828 이 적은 정확한 시나리오(러너의 호출 한 줄을 지워도
// 모든 신호 불변)다. R9 는 그 함수가 자기 정의 밖의 비-test 소스에서 **적어도 한 번
// 호출된다**를 단언한다. 주장 범위는 거기까지다 — "라이브 경로에서 실행된다"는 주장하지
// 않는다(그 축은 이 파일 머리의 이연 항목 그대로다).
//
// ponytail: 줄 단위 근사 — `function NAME(` 선언만 본다. 화살표 함수·메서드 속성으로 쓴
// emitter 는 보지 못하며, 오늘의 emitter 는 전부 `function` 선언이다. 자기 재귀 호출도
// 호출로 센다.

const FUNCTION_DECL_RE = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/;

function escapeRe(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// `appendFindings(` 가 나오는 줄마다, 그 줄이나 그 위에서 가장 가까운 `function NAME(`.
function appendFindingsCallers(code) {
  const names = new Set();
  let current = null;
  for (const line of String(code).split(/\r?\n/)) {
    const decl = line.match(FUNCTION_DECL_RE);
    if (decl) current = decl[1];
    if (APPEND_RE.test(line) && current) names.add(current);
  }
  return names;
}

function uncalledEmitters(root, rels) {
  const names = new Set();
  for (const rel of rels) appendFindingsCallers(readEmitter(root, rel)).forEach((n) => names.add(n));
  const corpus = scanSources(root).map((f) => f.code).join('\n');
  const count = (re) => (corpus.match(re) || []).length;
  return Array.from(names).filter(function (name) {
    const calls = count(new RegExp('\\b' + escapeRe(name) + '\\s*\\(', 'g'));
    const decls = count(new RegExp('\\bfunction\\s+' + escapeRe(name) + '\\s*\\(', 'g'));
    return calls - decls === 0;
  }).sort();
}

test('(R9) every function that calls appendFindings in a declared emitter is itself called', () => {
  const rels = registry.PRODUCER_CHANNELS.filter((c) => c.registers).map((c) => c.emitter);
  assert.ok(rels.length > 0, 'fixture: at least one registering channel');
  const callers = new Set();
  for (const rel of rels) appendFindingsCallers(readEmitter(REPO_ROOT, rel)).forEach((n) => callers.add(n));
  assert.ok(callers.size >= rels.length, 'each registering emitter wraps its call in a named function: '
    + Array.from(callers).join(', '));
  assert.deepEqual(uncalledEmitters(REPO_ROOT, rels), [],
    'these emitter functions write to the registry but nothing outside their definition calls them');
});

test('(R9b) the call scan catches an uncalled emitter and ignores a call that is only a comment', () => {
  const EMITTER = 'plugins/mccp/scripts/lib/rogue-emitter.js';
  const emitterSrc = "'use strict';\nfunction emitX(events) {\n  return registry.appendFindings('wu', events);\n}\nmodule.exports={emitX:emitX};\n";
  const cases = [
    [{ [EMITTER]: emitterSrc }, ['emitX']],
    [{ [EMITTER]: emitterSrc, 'plugins/mccp/scripts/lib/caller.js': "'use strict';\nrequire('./rogue-emitter').emitX([]);\n" }, []],
    [{ [EMITTER]: emitterSrc, 'plugins/mccp/scripts/lib/caller.js': "'use strict';\n// emitX([]) 는 여기서 부르지 않는다\n" }, ['emitX']],
    // a test file is not a caller — the scan corpus excludes tests.
    [{ [EMITTER]: emitterSrc, 'plugins/mccp/scripts/lib/tests/emit.test.js': "'use strict';\nemitX([]);\n" }, ['emitX']],
  ];
  for (const [files, expected] of cases) {
    const root = makeTree(files);
    try {
      assert.deepEqual(uncalledEmitters(root, [EMITTER]), expected, Object.keys(files).join(' + '));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
