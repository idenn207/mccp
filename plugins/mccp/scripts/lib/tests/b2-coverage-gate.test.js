'use strict';

// multi-session-work-loop M3 — B2 coverage gate 회귀.
//
// 이 gate의 존재 이유는 B2 flip이 **반증 가능**해야 한다는 것이다. 그러므로 가장
// 중요한 test는 "통과한다"가 아니라 **"우회하면 통과하지 못한다"**이다:
//   부정 fixture (i) 이벤트 없는 우회 write
//   부정 fixture (ii) 위조 이벤트를 동반한 우회 write   ← santa R1 I4
//   Implement-Codex R1 F4  런타임 관측 없이는 ok를 반환하지 않음

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gate = require('../msw-metrics/b2-coverage-gate');

const TARGET = '.claude/receipts/mccp-plan-codex/demo.json';
const T0 = Date.parse('2026-01-01T00:00:00.000Z');

function snap(hash, mtime, size) {
  return { [TARGET]: { receipt_hash: hash, mtime: mtime || 1000, size: size || 100 } };
}

function guardEvent(pre, post, tsMs) {
  return {
    kind: 'evidence_guard_active',
    target: TARGET,
    pre_hash: pre,
    post_hash: post,
    ts: new Date(tsMs === undefined ? T0 : tsMs).toISOString(),
    event_id: 'evt-' + Math.random(),
  };
}

const WINDOW = { windowStart: T0 - 1000, windowEnd: T0 + 1000 };

test('Implement-Codex F4: no runtime observation → gate is INDETERMINATE, never ok', () => {
  const repo = process.cwd();
  const r = gate.evaluateGate({ repoRoot: repo });
  assert.equal(r.ok, false, 'static axes alone must never establish coverage');
  const reasons = r.failures.map((f) => f.reason);
  assert.ok(reasons.includes('runtime-observation-not-supplied'),
    'the missing PRIMARY axis must be named explicitly, got ' + JSON.stringify(reasons));
  assert.equal(r.axes.runtime.supplied, false);
});

test('a mutation with a matching guard event is covered', () => {
  const r = gate.correlateMutations(
    snap('sha256:a'), snap('sha256:b', 2000),
    [guardEvent('sha256:a', 'sha256:b')], WINDOW);
  assert.equal(r.ok, true);
  assert.equal(r.hash_changes, 1);
  assert.equal(r.covered, 1);
  assert.deepEqual(r.uncovered, []);
});

test('negative fixture (i): bypass write with NO guard event is detected', () => {
  const r = gate.correlateMutations(
    snap('sha256:a'), snap('sha256:b', 2000), [], WINDOW);
  assert.equal(r.ok, false, 'an unguarded mutation must fail the gate');
  assert.equal(r.uncovered.length, 1);
  assert.equal(r.uncovered[0].target, TARGET);
});

test('negative fixture (ii): a FORGED guard event cannot self-certify (santa I4)', () => {
  // The bypass writer emits an event whose post_hash matches the observed final
  // state but whose pre_hash does not match the observed prior state. Requiring
  // BOTH ends is what makes after-the-fact fabrication insufficient.
  const r = gate.correlateMutations(
    snap('sha256:a'), snap('sha256:b', 2000),
    [guardEvent('sha256:WRONG', 'sha256:b')], WINDOW);
  assert.equal(r.ok, false, 'post-hash-only forgery must not pass');
  assert.equal(r.uncovered.length, 1);
});

test('an event for a DIFFERENT target does not cover this mutation', () => {
  const ev = guardEvent('sha256:a', 'sha256:b');
  ev.target = '.claude/receipts/mccp-pr-codex/other.json';
  const r = gate.correlateMutations(snap('sha256:a'), snap('sha256:b', 2000), [ev], WINDOW);
  assert.equal(r.ok, false);
});

test('events outside the observation window (±30s) do not count', () => {
  const stale = guardEvent('sha256:a', 'sha256:b', T0 - 10 * 60 * 1000);
  const r = gate.correlateMutations(snap('sha256:a'), snap('sha256:b', 2000), [stale], WINDOW);
  assert.equal(r.ok, false, 'a long-past event must not certify a fresh mutation');

  const withinTolerance = guardEvent('sha256:a', 'sha256:b', T0 + 1000 + 20 * 1000);
  const r2 = gate.correlateMutations(snap('sha256:a'), snap('sha256:b', 2000), [withinTolerance], WINDOW);
  assert.equal(r2.ok, true, '±30s clock tolerance is honored');
});

test('carved-only mutation is classified separately, not counted as a hash change', () => {
  // briefing_* / ledger_write_skipped are canonicalized OUT of receipt_hash, so a
  // stamp changes bytes and mtime but not the seal. That is metadata loss, not
  // evidence loss (§6.4), so it must not enter hash-change coverage.
  const before = snap('sha256:same', 1000, 100);
  const after = snap('sha256:same', 2000, 140);
  const r = gate.correlateMutations(before, after, [], WINDOW);
  assert.equal(r.hash_changes, 0, 'no seal changed');
  assert.equal(r.carved_only, 1, 'but the mtime axis still SEES it');
  assert.equal(r.ok, true, 'carved-only churn does not fail the gate');
});

test('a brand-new receipt (absent → present) is a hash change and needs an event', () => {
  const r = gate.correlateMutations({}, snap('sha256:new', 2000), [], WINDOW);
  assert.equal(r.hash_changes, 1);
  assert.equal(r.ok, false, 'creation is a mutation too');

  const r2 = gate.correlateMutations({}, snap('sha256:new', 2000),
    [guardEvent(null, 'sha256:new')], WINDOW);
  assert.equal(r2.ok, true, 'pre_hash null matches "no prior receipt"');
});

test('static lint passes on the real repo (approved writers only)', () => {
  const r = gate.staticLint(process.cwd());
  assert.equal(r.ok, true,
    'unapproved receipt writers found: ' + JSON.stringify(r.violations, null, 2));
});

test('static lint FAILS when an unapproved writer is introduced', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-lint-'));
  const dir = path.join(repo, 'plugins', 'mccp', 'scripts', 'lib');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'rogue.js'),
    "fs.writeFileSync(path.join(root, '.claude/receipts/x/y.json'), body);\n", 'utf8');
  const r = gate.staticLint(repo);
  assert.equal(r.ok, false, 'a new direct receipt writer must be caught');
  assert.equal(r.violations[0].file, 'plugins/mccp/scripts/lib/rogue.js');
});

// 회귀 고정: lint가 "실제로 존재했던" writer 형태를 잡는지.
//
// 이전 판본의 정규식은 리터럴 `receipts`(복수)만 봤고, 위 test는 하필 그 형태
// 하나로만 검증해서 **통과했다**. 그래서 lint는 저장소 전체에서 위반 0을
// 보고하면서도 이 milestone이 방금 제거한 두 writer를 못 잡는 상태였다.
// 아래 fixture는 전부 이 저장소에 실재했던 코드에서 그대로 가져온 것이다 —
// 하나라도 통과하면 guardrail이 다시 비어 있다는 뜻이다.
const HISTORICAL_WRITER_SHAPES = [
  { name: 'briefing stamper (pre-M3)', src: "  fs.writeFileSync(receiptPath, json, 'utf8');\n" },
  { name: 'store.writeReceipt (pre-M3)', src: "  fs.writeFileSync(p, JSON.stringify(receipt, null, 2) + '\\n', 'utf8');\n" },
  { name: 'ledger skip stamper (pre-M3)', src: "  fs.writeFileSync(receiptPath, JSON.stringify(fresh, null, 2) + '\\n', 'utf8');\n" },
  {
    name: 'path via store helper, no token on the write line',
    src: "const p = receiptPath(repoRoot, gateId, decisionId);\nfs.writeFileSync(p, body, 'utf8');\n",
  },
];

test('static lint catches every writer shape that actually existed here', () => {
  for (const shape of HISTORICAL_WRITER_SHAPES) {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-lint-shape-'));
    const dir = path.join(repo, 'plugins', 'mccp', 'scripts', 'lib');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rogue.js'), shape.src, 'utf8');
    const r = gate.staticLint(repo);
    assert.equal(r.ok, false, 'MISSED writer shape: ' + shape.name + ' — ' + shape.src.trim());
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// 회귀 고정 2: lint가 "앞으로 생길" writer 형태를 잡는지.
//
// 위 HISTORICAL fixture는 **이미 제거된** 형태만 담고 있어서, 그것만 통과하면
// guardrail이 과거만 막고 미래는 안 막는 상태가 된다. 실제로 그랬다 — 축 A는
// write 줄 하나만 보고 축 B는 store helper 호출에만 반응하므로, 아래 네 형태는
// 저장소 전체 스캔에서 전부 통과했다(측정으로 확인). 신규 writer가 자연스럽게
// 고를 형태들이고, 특히 tmp+rename은 이 milestone 자신이 확립한 관용구다.
const BYPASS_WRITER_SHAPES = [
  {
    name: 'inline path.join into a variable, write on the next line',
    src: "const target = path.join(root, '.claude', 'receipts', gate, slug + '.json');\nfs.writeFileSync(target, json);\n",
  },
  {
    name: 'tmp write then rename onto the receipt (this milestone own idiom)',
    src: "const target = path.join(root, '.claude', 'receipts', gate, slug + '.json');\nconst tmp = target + '.new';\nfs.writeFileSync(tmp, json);\nfs.renameSync(tmp, target);\n",
  },
  {
    name: 'async fs.promises.writeFile',
    src: "const target = path.join(root, '.claude', 'receipts', gate, slug + '.json');\nawait fs.promises.writeFile(target, json);\n",
  },
  {
    name: 'file descriptor write (openSync + writeSync)',
    src: "const target = path.join(root, '.claude', 'receipts', gate, slug + '.json');\nconst fd = fs.openSync(target, 'w');\nfs.writeSync(fd, json);\n",
  },
];

// 회귀 고정 3: 경로를 **인라인으로** 넘기는 변형 API.
//
// 축 C(변수 taint)는 write 대상이 식별자일 때만 발동하므로, 경로를 호출 안에서
// 바로 만들면 축 C가 못 받는다. 그러면 방어는 축 A의 **동사 목록**에만 의존하는데
// 그 목록이 4개(write/append/createWriteStream 계열)뿐이라 아래 8종이 전부
// 통과했다 — 측정으로 확인했고, santa round 2의 Reviewer B가 그중 `openSync`
// 하나를 반례로 제시했다. 한 건만 고치면 같은 모양의 나머지 7개가 남으므로
// 목록 전체를 넓혔고, 여기서 모양째 고정한다.
const INLINE_PATH_WRITER_SHAPES = [
  { name: 'openSync for write', src: "const fd = fs.openSync(path.join(root, '.claude/receipts/g/s.json'), 'w');\n" },
  { name: 'promises.open for write', src: "const h = await fs.promises.open(path.join(root, '.claude/receipts/g/s.json'), 'w');\n" },
  { name: 'promises.appendFile', src: "await fs.promises.appendFile(path.join(root, '.claude/receipts/g/s.json'), line);\n" },
  { name: 'copyFileSync onto a receipt', src: "fs.copyFileSync(src, path.join(root, '.claude/receipts/g/s.json'));\n" },
  { name: 'renameSync onto a receipt', src: "fs.renameSync(tmp, path.join(root, '.claude/receipts/g/s.json'));\n" },
  { name: 'cpSync onto a receipt', src: "fs.cpSync(srcDir, path.join(root, '.claude/receipts/g/s.json'));\n" },
  { name: 'truncateSync a receipt', src: "fs.truncateSync(path.join(root, '.claude/receipts/g/s.json'), 0);\n" },
  { name: 'symlinkSync over a receipt', src: "fs.symlinkSync(evil, path.join(root, '.claude/receipts/g/s.json'));\n" },
];

test('static lint catches inline-path mutators, not just the write family', () => {
  for (const shape of INLINE_PATH_WRITER_SHAPES) {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-lint-inline-'));
    const dir = path.join(repo, 'plugins', 'mccp', 'scripts', 'lib');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rogue.js'), shape.src, 'utf8');
    const r = gate.staticLint(repo);
    assert.equal(r.ok, false, 'MISSED inline-path shape: ' + shape.name + ' — ' + shape.src.trim());
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('static lint catches writer shapes a future caller would plausibly use', () => {
  for (const shape of BYPASS_WRITER_SHAPES) {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-lint-bypass-'));
    const dir = path.join(repo, 'plugins', 'mccp', 'scripts', 'lib');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rogue.js'), shape.src, 'utf8');
    const r = gate.staticLint(repo);
    assert.equal(r.ok, false, 'MISSED bypass shape: ' + shape.name + ' — ' + shape.src.trim());
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// 알려진 gap 고정 (santa round 3, 실측).
//
// 이 test는 lint가 **못 잡는다는 것**을 assert한다. 통과를 축하하려는 게 아니라
// 경계를 고정하려는 것이다 — 누가 나중에 축을 바꿔 이 형태가 잡히기 시작하면
// 이 test가 실패하고, 그때 design §6.3의 "여전히 못 보는 것" 목록을 함께
// 갱신하게 된다(설계는 바꿨는데 문서는 옛 주장을 유지하는 것이 이 사이클에서
// 세 라운드 연속 잡힌 실패 유형이다). tombstone TTL lapse를 known-gap으로
// 고정한 것과 같은 취급이다.
//
// 문자열 연산은 리터럴 경계에서 토큰을 쪼개므로 정규식 축이 원리상 못 본다.
// 이걸 잡으려면 AST가 필요하고, 그 판정은 런타임 변형 감사(primary)의 몫이다.
const KNOWN_GAP_SHAPES = [
  { name: 'path built with the + operator', src: "const p = '.claude' + '/receipts' + '/x.json';\nfs.writeFileSync(p, data);\n" },
  { name: 'path built with .concat()', src: "const p = '.claude'.concat('/receipts', '/x.json');\nfs.writeFileSync(p, data);\n" },
];

test('KNOWN GAP: string-operator paths are not seen by the static axes', () => {
  for (const shape of KNOWN_GAP_SHAPES) {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-lint-gap-'));
    const dir = path.join(repo, 'plugins', 'mccp', 'scripts', 'lib');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rogue.js'), shape.src, 'utf8');
    const r = gate.staticLint(repo);
    assert.equal(r.ok, true,
      'this shape is now CAUGHT: ' + shape.name
      + ' — that is an improvement, but update design 6.3 "여전히 못 보는 것" and move it out of KNOWN_GAP_SHAPES');
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// 반대 방향의 경계도 고정한다. 축 A·B는 의도적으로 과잉 포섭이며(design §6.3),
// 그 판단의 근거는 두 오류의 비용이 비대칭이라는 것이다 — 오검출은 시끄럽게
// 실패해 승인 목록으로 분류되고, 미검출은 guardrail을 조용히 비운다. 누가
// 정밀도를 올리려 좁히면 이 test가 실패하면서 그 trade-off를 다시 마주하게 된다.
const DELIBERATE_OVERREACH_SHAPES = [
  {
    name: 'receipt token in the value argument, non-receipt target',
    src: "fs.writeFileSync(configFile, JSON.stringify(receipt.meta));\n",
  },
  {
    name: 'file uses receiptPath() to READ, writes somewhere else',
    src: "const p = receiptPath(root, gate, slug);\n"
      + "const data = JSON.parse(fs.readFileSync(p, 'utf8'));\n"
      + "fs.writeFileSync(path.join(root, 'other', 'file.json'), data);\n",
  },
];

test('DELIBERATE: the static axes over-reach, and that is the chosen trade-off', () => {
  for (const shape of DELIBERATE_OVERREACH_SHAPES) {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-lint-over-'));
    const dir = path.join(repo, 'plugins', 'mccp', 'scripts', 'lib');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'probe.js'), shape.src, 'utf8');
    const r = gate.staticLint(repo);
    assert.equal(r.ok, false,
      'this shape is no longer flagged: ' + shape.name
      + ' — narrowing the axes re-opens the inline-dest misses from round 2; if that is intended, update design 6.3');
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('static lint does not fire on non-receipt writes in the same tree', () => {
  // The guardrail must stay usable: a file that writes something else entirely
  // (PR body staging, cache artifacts) is not a receipt writer.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-lint-fp-'));
  const dir = path.join(repo, 'plugins', 'mccp', 'scripts', 'lib');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'innocent.js'),
    "fs.writeFileSync(staging, String(content == null ? '' : content), 'utf8');\n"
    + "fs.writeFileSync(path.join(repoRoot, '.claude/cache/STATUS.md'), md, 'utf8');\n", 'utf8');
  // 축 C(변수 taint) 음성 대조군. 이 둘은 tmp+rename·fd write라는 **같은 관용구**를
  // 쓰지만 대상이 receipt가 아니다. 파일 안에 receipt 토큰이 있다는 이유만으로
  // 잡는 초안 설계는 실제로 이 형태의 실파일 3개를 오검출했다
  // (completion-ledger/store.js · dispatch-cli.js · pr-phase-lock.js).
  fs.writeFileSync(path.join(dir, 'ledger-writer.js'),
    "const target = path.join(root, '.claude', 'state', 'completion-ledger', name);\n"
    + "const tmp = target + '.tmp';\n"
    + "fs.writeFileSync(tmp, content, 'utf8');\n"
    + 'fs.renameSync(tmp, target);\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'lock-writer.js'),
    "const lockFile = path.join(dir, 'x.lock');\n"
    + "const fd = fs.openSync(lockFile, 'wx');\n"
    + 'fs.writeSync(fd, body);\n', 'utf8');
  const r = gate.staticLint(repo);
  assert.equal(r.ok, true, 'false positives: ' + JSON.stringify(r.violations, null, 2));
  fs.rmSync(repo, { recursive: true, force: true });
});

test('the auditor exempts itself, and that exemption stays honest', () => {
  // The gate file holds the detection patterns as DATA, so it matches itself and
  // has to be exempt. An exemption is only acceptable while the claim behind it
  // holds: this file must never write to a receipt path. Pin that directly
  // rather than trusting the comment.
  const src = fs.readFileSync(path.join(process.cwd(), gate.SELF_EXEMPT), 'utf8');
  const writeTargets = src.split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .filter((l) => /(writeFileSync|appendFileSync|createWriteStream)\s*\(/.test(l));
  assert.ok(writeTargets.length > 0, 'the file does write something; if not, drop the exemption');
  for (const l of writeTargets) {
    assert.ok(!/receipts/.test(l),
      'the exempt auditor must not write into .claude/receipts: ' + l.trim());
  }
  assert.ok(src.includes("'.claude', 'cache', 'b2-coverage-gate.json'"),
    'its only artifact target is the cache verdict file');
});

test('static lint ignores tests and sanctioned migrations', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-lint2-'));
  const testsDir = path.join(repo, 'plugins', 'mccp', 'scripts', 'lib', 'tests');
  const migDir = path.join(repo, 'plugins', 'mccp', 'scripts', 'migrations');
  fs.mkdirSync(testsDir, { recursive: true });
  fs.mkdirSync(migDir, { recursive: true });
  const line = "fs.writeFileSync('.claude/receipts/a/b.json', x);\n";
  fs.writeFileSync(path.join(testsDir, 'fixture.js'), line, 'utf8');
  fs.writeFileSync(path.join(migDir, 'v9.9.9-thing.js'), line, 'utf8');
  assert.equal(gate.staticLint(repo).ok, true);
});

test('entrypoint registry passes on the real repo', () => {
  const r = gate.entrypointRegistry(process.cwd());
  assert.equal(r.ok, true, 'missing entrypoints: ' + JSON.stringify(r.missing));
});

test('entrypoint registry FAILS when a declared entrypoint disappears', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-reg-'));
  const r = gate.entrypointRegistry(repo);
  assert.equal(r.ok, false);
  assert.equal(r.missing.length, gate.MUTATION_ENTRYPOINTS.length);
});

test('gate artifact round-trips and is what derive consumes', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-art-'));
  assert.equal(gate.readGateArtifact(repo), null, 'absent artifact reads as null (fail-closed)');
  gate.writeGateArtifact(repo, { ok: true, failures: [], axes: {} });
  const back = gate.readGateArtifact(repo);
  assert.equal(back.ok, true);
  assert.ok(back.generated_at, 'the artifact records when it was produced');
});

test('full gate: supplied runtime observation with an uncovered write stays NOT ok', () => {
  const r = gate.evaluateGate({
    repoRoot: process.cwd(),
    runtimeObservation: Object.assign({
      before: snap('sha256:a'),
      after: snap('sha256:b', 2000),
    }, WINDOW),
    events: [],
  });
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.reason === 'uncovered-mutation'));
});

test('full gate: covered observation on the real repo passes every axis', () => {
  const r = gate.evaluateGate({
    repoRoot: process.cwd(),
    runtimeObservation: Object.assign({
      before: snap('sha256:a'),
      after: snap('sha256:b', 2000),
    }, WINDOW),
    events: [guardEvent('sha256:a', 'sha256:b')],
  });
  assert.equal(r.ok, true, 'failures: ' + JSON.stringify(r.failures, null, 2));
  assert.equal(r.axes.runtime.covered, 1);
});
