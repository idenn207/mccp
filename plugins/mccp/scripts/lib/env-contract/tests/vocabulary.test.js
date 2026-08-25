'use strict';

// vocabulary.test.js — 추출기 3형태 · 파생자 · 격리 배수 규칙의 회귀.
//
// 이 모듈의 실패 모드는 «틀린 값을 준다»가 아니라 «못 읽었는데 읽은 척한다»이다.
// 빈 배열을 성공으로 돌려주면 L10의 집합 비교에서 «모든 값이 불일치»가 되어 조용한
// red를 만들고, 반대로 표현식으로 만든 집합을 부분적으로 읽으면 있지도 않은 불일치를
// 만들어 낸다. 그래서 아래 단언의 대부분은 «실패했는가»가 아니라 **«실패라고 말했는가»**를
// 본다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const vocabulary = require('../vocabulary');
const registry = require('../registry');

// tests → env-contract → lib → scripts → mccp → plugins → repo root (6단계).
const REPO_ROOT = path.resolve(__dirname, '../../../../../..');

const tmpRoots = [];
function mkRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-vocab-'));
  tmpRoots.push(root);
  return root;
}
function write(root, rel, text) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, 'utf8');
  return rel;
}
test.after(() => {
  tmpRoots.forEach((r) => { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) {} });
});

// ── extractConstant: 3형태를 모두 읽는다 ────────────────────────────────────
test('extractConstant reads a bare array literal', () => {
  const root = mkRoot();
  write(root, 'a.js', "const MODES = ['x', 'y'];\n");
  const r = vocabulary.extractConstant(root, 'a.js#MODES');
  assert.equal(r.ok, true);
  assert.deepEqual(r.values, ['x', 'y']);
});

test('extractConstant reads Object.freeze and new Set wrappers', () => {
  const root = mkRoot();
  write(root, 'f.js', "const A = Object.freeze(['p', 'q']);\n");
  write(root, 's.js', 'const B = new Set(["m", "n"]);\n');
  assert.deepEqual(vocabulary.extractConstant(root, 'f.js#A').values, ['p', 'q']);
  assert.deepEqual(vocabulary.extractConstant(root, 's.js#B').values, ['m', 'n']);
});

test('extractConstant ignores comments and a trailing comma', () => {
  const root = mkRoot();
  write(root, 'c.js', "const V = [\n  'a', // first\n  /* second */ 'b',\n];\n");
  assert.deepEqual(vocabulary.extractConstant(root, 'c.js#V').values, ['a', 'b']);
});

test('extractConstant does not descend into a nested array', () => {
  const root = mkRoot();
  // 중첩은 «한 겹만 본다»에 걸려 리터럴이 아닌 원소로 거부된다 — 안쪽 값을 조용히
  // 끌어올리면 실제로 수용되지 않는 값이 어휘에 섞인다.
  write(root, 'n.js', "const V = ['a', ['b', 'c']];\n");
  const r = vocabulary.extractConstant(root, 'n.js#V');
  assert.equal(r.ok, false);
  assert.match(r.reason, /non-literal element/);
});

// ── 실패는 «실패라고 말한다» ─────────────────────────────────────────────────
test('an empty array is never a success', () => {
  const root = mkRoot();
  write(root, 'e.js', 'const V = [];\n');
  const r = vocabulary.extractConstant(root, 'e.js#V');
  assert.equal(r.ok, false);
  assert.match(r.reason, /empty set is never a success/);
});

test('an expression-built set fails rather than returning a partial read', () => {
  const root = mkRoot();
  write(root, 'x.js', "const BASE = ['a'];\nconst V = BASE.concat(['b']);\n");
  const r = vocabulary.extractConstant(root, 'x.js#V');
  assert.equal(r.ok, false);
  assert.match(r.reason, /expression, not an array literal/);
});

test('a non-literal element fails', () => {
  const root = mkRoot();
  write(root, 'i.js', "const OTHER = 'z';\nconst V = ['a', OTHER];\n");
  const r = vocabulary.extractConstant(root, 'i.js#V');
  assert.equal(r.ok, false);
  assert.match(r.reason, /non-literal element/);
});

test('a duplicate declaration fails instead of picking one', () => {
  const root = mkRoot();
  write(root, 'd.js', "const V = ['a'];\nfunction g() { const V = ['b']; return V; }\n");
  const r = vocabulary.extractConstant(root, 'd.js#V');
  assert.equal(r.ok, false);
  assert.match(r.reason, /more than one declaration/);
});

test('a missing declaration fails', () => {
  const root = mkRoot();
  write(root, 'm.js', "const OTHER = ['a'];\n");
  const r = vocabulary.extractConstant(root, 'm.js#NOPE');
  assert.equal(r.ok, false);
  assert.match(r.reason, /no `const NOPE/);
});

test('a file over the read cap fails instead of being read', () => {
  const root = mkRoot();
  const big = "const V = ['a'];\n" + 'x'.repeat(vocabulary.MAX_FILE_BYTES + 1);
  write(root, 'big.js', big);
  const r = vocabulary.extractConstant(root, 'big.js#V');
  assert.equal(r.ok, false);
  assert.match(r.reason, /exceeds the .* read cap/);
});

// ── ref 어휘 스크린은 fs보다 먼저 돈다 ──────────────────────────────────────
test('refLexicalProblem rejects traversal, absolute and expanded paths', () => {
  const cases = [
    ['../../etc/passwd#V', /parent traversal/],
    ['/etc/passwd#V', /absolute path \(POSIX root\)/],
    ['C:/Windows/x.js#V', /absolute path \(drive letter\)/],
    // UNC는 `evidenceLexicalProblem`(mirror)과 **같은 순서**라 POSIX-root 분기가 먼저
    // 잡는다. 거부된다는 사실이 요구이고 어느 문구로 거부하느냐는 아니므로, 여기서
    // mirror와 다른 순서를 요구하면 두 스크린이 갈라진다.
    ['\\\\host\\share\\x.js#V', /absolute path \(POSIX root\)/],
    ['~/x.js#V', /home-relative/],
    ['https://example.com/x.js#V', /URL not allowed/],
    ['${HOME}/x.js#V', /environment-expanded/],
    ['a.js', /must be "path#CONST"/],
    ['a.js#', /constant is empty/],
    ['a.js#not-an-ident', /not an identifier/],
  ];
  cases.forEach(([ref, re]) => {
    assert.match(String(vocabulary.refLexicalProblem(ref)), re, 'for ' + ref);
  });
  assert.equal(vocabulary.refLexicalProblem('plugins/a/b.js#V'), null);
});

test('a traversal ref is refused even when the target exists on disk', () => {
  // 순서가 뒤집혀 실재를 먼저 보면 이 경우가 통과한다. fixture는 «실재하는» 파일을
  // 저장소 밖에 두어 그 순서를 구분한다.
  const outside = mkRoot();
  write(outside, 'real.js', "const V = ['a'];\n");
  const inside = path.join(outside, 'repo');
  fs.mkdirSync(inside, { recursive: true });
  const r = vocabulary.extractConstant(inside, '../real.js#V');
  assert.equal(r.ok, false);
  assert.match(r.reason, /parent traversal/);
});

// ── 파생자 ──────────────────────────────────────────────────────────────────
test('the hook-ids deriver unions both real sources', () => {
  const r = vocabulary.DERIVERS['hook-ids'](REPO_ROOT);
  assert.equal(r.ok, true, r.reason);
  assert.ok(r.values.length >= 20, 'expected the union to be non-trivial, got ' + r.values.length);
  // 두 소스가 각각 실제로 기여했는지 — 합집합이 한쪽만으로 채워지면 다른 절반이
  // 조용히 빠져도 이 test가 초록이다.
  assert.ok(r.values.indexOf('pre:bash:block-no-verify') !== -1, 'dispatcher half missing');
  assert.ok(r.values.indexOf('stop:cost-tracker') !== -1, 'hooks.json half missing');
  assert.equal(r.sources.length, 2);
});

test('the hook-ids deriver fails when either half is unreadable', () => {
  const root = mkRoot();
  // dispatcher만 두고 hooks.json은 없다 → 부분 집합을 성공으로 돌려주면 안 된다.
  write(root, 'plugins/mccp/scripts/hooks/bash-hook-dispatcher.js', "const H = [{ id: 'pre:bash:x' }];\n");
  const r = vocabulary.DERIVERS['hook-ids'](root);
  assert.equal(r.ok, false);
  assert.match(r.reason, /hooks\.json/);
});

// ── resolveVocabulary — 3형태 분기 ──────────────────────────────────────────
test('resolveVocabulary distinguishes gap from unspecified', () => {
  const gap = vocabulary.resolveVocabulary(REPO_ROOT, { vocabulary: null, vocabularyGap: 'because' });
  assert.equal(gap.ok, false);
  assert.equal(gap.form, 'gap');

  const none = vocabulary.resolveVocabulary(REPO_ROOT, { vocabulary: null, vocabularyGap: null });
  assert.equal(none.ok, false);
  assert.equal(none.form, 'unspecified');
});

test('resolveVocabulary rejects an unknown deriver by name', () => {
  const r = vocabulary.resolveVocabulary(REPO_ROOT, { vocabulary: { derive: 'nope' } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /unknown deriver/);
});

// ── 격리표의 형태 ───────────────────────────────────────────────────────────
// M2가 격리 8건을 전부 수리하고 같은 커밋에서 표를 비웠다(DD8). 표가 비었다는 것은
// «격리할 어긋남이 없다»는 뜻이지 «검사가 꺼졌다»는 뜻이 아니다 — 새 어긋남은 격리되지
// 않은 채 L10에서 즉시 붉어지고, 배수 규칙 자체는 lint.test.js의 합성 격리가 고정한다.
test('quarantine is drained — M2 repaired every entry (DD8)', () => {
  assert.equal(vocabulary.QUARANTINE.length, 0,
    '격리가 남아 있으면 그 항목의 owner 마일스톤이 아직 끝나지 않은 것이다');
});

test('every quarantine entry is well formed and names a real enum entry', () => {
  vocabulary.QUARANTINE.forEach((q) => {
    const e = registry.get(q.name);
    assert.ok(e, q.name + ' is quarantined but not in the registry');
    // enum 전용이다. list는 `values`가 null이라 비교할 문서 어휘가 없고, 비교할 수
    // 없으면 DD3-ii의 배수(수리되면 붉어진다)가 성립하지 않는다 — lint L10의 list
    // 분기가 같은 규칙을 강제한다.
    assert.equal(e.kind, 'enum', q.name + ' is quarantined but is not an enum entry');
    assert.ok(Array.isArray(q.expected) && q.expected.length > 0, q.name + ': expected must be a non-empty array');
    assert.ok(Array.isArray(q.actual) && q.actual.length > 0, q.name + ': actual must be a non-empty array');
    // TOGGLE_EXCLUSIONS 규약 — 이름마다 실파일 근거와 담당이 붙는다.
    assert.ok(typeof q.reason === 'string' && q.reason.trim().length >= 30, q.name + ': reason must be substantive');
    assert.ok(typeof q.owner === 'string' && q.owner.trim() !== '', q.name + ': owner must name a milestone');
    // 격리는 «지금도 어긋난다»는 주장이다. 같은 집합을 적어 두면 그 주장이 거짓이다.
    const same = q.expected.length === q.actual.length
      && q.expected.slice().sort().every((v, i) => v === q.actual.slice().sort()[i]);
    assert.equal(same, false, q.name + ': expected and actual are the same set — nothing to quarantine');
  });
});

// ── list 멤버 정책표 (M2 DD6) ───────────────────────────────────────────────
// 손으로 센 «9»는 다음 list가 추가되는 순간 낡는다. 레지스트리에서 파생해 대조한다.
test('LIST_MEMBER_POLICY covers exactly the registry list entries', () => {
  const lists = registry.ENTRIES.filter((e) => e.kind === 'list').map((e) => e.name).sort();
  assert.ok(lists.length > 0, 'list 항목이 0개면 이 검사는 공허하다');
  const documented = Object.keys(vocabulary.LIST_MEMBER_POLICY).sort();
  assert.deepEqual(documented, lists,
    '빠진 항목은 doctor에서 «문서화되지 않았다»로 떨어지고 L11에서는 problem이다 (UI10)');
});

test('every LIST_MEMBER_POLICY entry states a substantive direction', () => {
  Object.keys(vocabulary.LIST_MEMBER_POLICY).forEach((name) => {
    const v = vocabulary.LIST_MEMBER_POLICY[name];
    assert.equal(typeof v, 'string');
    assert.ok(v.trim().length >= 30, name + ': 처리 방향은 한 문장 이상이어야 한다');
  });
});

test('quarantineByName indexes every entry', () => {
  const m = vocabulary.quarantineByName();
  assert.equal(m.size, vocabulary.QUARANTINE.length);
  vocabulary.QUARANTINE.forEach((q) => assert.ok(m.has(q.name)));
});
