'use strict';

// multi-session-work-loop M7 Task 7 — C1 coverage gate.
//
// Assertion roster: C1-COVERAGE-STATIC · C1-COVERAGE-REGISTRY-WRITER ·
// C1-ACCEPTANCE-MECHANIZED · C1-COVERAGE-RUNTIME · C1-CONTRACT-COPRESENT ·
// C1-GATE-MERGE-UNION

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const gate = require('../msw-metrics/c1-coverage-gate');
const registry = require('../../state/findings-registry');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const GATE_CLI = path.join(REPO_ROOT, 'plugins', 'mccp', 'scripts', 'lib',
  'msw-metrics', 'c1-coverage-gate.js');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-c1gate-'));
  try {
    return fn(dir);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* best effort */ }
  }
}

function writeFile(root, rel, body) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf8');
  return abs;
}

// contractCoPresence 가 읽는 세 파일의 최소 stub.
function scaffoldContractTree(root, opts) {
  const o = opts || {};
  writeFile(root, path.join('plugins', 'mccp', 'scripts', 'lib', 'msw-metrics', 'index.js'),
    o.consumerRequires
      ? 'const typeDeclared = findings.type_separation === true;\n'
      : 'const typeIntegrity = (deferred + downgraded + rejected) > 0;\n');
  writeFile(root, path.join('plugins', 'mccp', 'scripts', 'derive', 'sources', 'findings.js'),
    'function scanFindings() { return { ok: true, type_separation: true }; }\n' +
    'module.exports = { scanFindings: scanFindings };\n');
  writeFile(root, path.join('plugins', 'mccp', 'scripts', 'derive', 'index.js'),
    o.sourceRegistered
      ? "const { scanFindings } = require('./sources/findings');\n" +
        'const SOURCE_SCANNERS = { findings: (r) => scanFindings(r) };\n' +
        'module.exports = { SOURCE_SCANNERS: SOURCE_SCANNERS };\n'
      : 'const SOURCE_SCANNERS = { plans: () => ({}) };\n' +
        'module.exports = { SOURCE_SCANNERS: SOURCE_SCANNERS };\n');
}

// ── C1-COVERAGE-STATIC ───────────────────────────────────────────────────────
test('C1-COVERAGE-STATIC: an unapproved finding-surface writer fails the lint', () => {
  withTempDir((root) => {
    // 승인 목록 밖에서 `.claude/reviews/` 에 직접 쓴다 — 계측되지 않은 finding 표면.
    writeFile(root, path.join('plugins', 'mccp', 'scripts', 'lib', 'rogue-recorder.js'),
      "const p = path.join(root, '.claude', 'reviews', 'plan-review-x.md');\n" +
      "fs.writeFileSync(p, body, 'utf8');\n");

    const r = gate.lintSurface(root, gate.SURFACE_PATH_TOKEN_RE, gate.APPROVED_SURFACE_WRITERS);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.violations.length, 1);
    assert.strictEqual(r.violations[0].file, 'plugins/mccp/scripts/lib/rogue-recorder.js');
    assert.strictEqual(r.violations[0].axis, 'path-taint', 'the one-hop taint axis catches it');
  });
});

test('C1-COVERAGE-STATIC: an inline path in the write call is caught too', () => {
  withTempDir((root) => {
    writeFile(root, path.join('plugins', 'mccp', 'scripts', 'lib', 'rogue-inline.js'),
      "fs.appendFileSync('.claude/reviews/plan-review-y.md', line);\n");
    const r = gate.lintSurface(root, gate.SURFACE_PATH_TOKEN_RE, gate.APPROVED_SURFACE_WRITERS);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.violations[0].axis, 'write-call-args');
  });
});

test('C1-COVERAGE-STATIC: reading a surface, or naming it in prose, is not a violation', () => {
  withTempDir((root) => {
    // 표면을 **읽기만** 하고 다른 대상에 쓰는 정당한 파일. 파일 안에 토큰이 있다는
    // 사실만으로 잡으면 이런 파일이 전부 오검출된다(b2 가 실측으로 겪은 형태).
    writeFile(root, path.join('plugins', 'mccp', 'scripts', 'lib', 'honest-reader.js'),
      "const src = fs.readFileSync(path.join(root, '.claude', 'reviews', f), 'utf8');\n" +
      "fs.writeFileSync(path.join(root, '.claude', 'cache', 'out.json'), src);\n" +
      "// this comment mentions writeFileSync('.claude/reviews/x.md') on purpose\n");
    const r = gate.lintSurface(root, gate.SURFACE_PATH_TOKEN_RE, gate.APPROVED_SURFACE_WRITERS);
    assert.deepStrictEqual(r.violations, [], 'no false positive on a reader or on a comment');
  });
});

test('C1-COVERAGE-STATIC: the live tree has exactly the declared surface writers', () => {
  const r = gate.staticLint(REPO_ROOT);
  assert.deepStrictEqual(r.surface.violations, [],
    'an unapproved .claude/reviews/ writer entered the tree');
  // 승인 목록이 실재 파일을 가리키는지도 함께 본다 — 사라진 경로를 승인해 두면
  // 목록이 조용히 무의미해진다.
  gate.APPROVED_SURFACE_WRITERS.forEach((rel) => {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, rel)), rel + ' is approved but absent');
  });
});

// ── C1-COVERAGE-REGISTRY-WRITER ──────────────────────────────────────────────
//
// 표면 축과 **별개 표면**이므로 `C1-COVERAGE-STATIC` 이 이를 대신하지 않는다.
test('C1-COVERAGE-REGISTRY-WRITER: a direct write to the registry path fails', () => {
  withTempDir((root) => {
    writeFile(root, path.join('plugins', 'mccp', 'scripts', 'lib', 'rogue-emitter.js'),
      "const target = path.join(root, '.claude', 'state', 'findings', slug + '.jsonl');\n" +
      "fs.appendFileSync(target, JSON.stringify(event) + '\\n');\n");

    const r = gate.lintSurface(root, gate.REGISTRY_PATH_TOKEN_RE, gate.APPROVED_REGISTRY_WRITERS);
    assert.strictEqual(r.ok, false, 'bypassing the normalization choke point must fail');
    assert.strictEqual(r.violations[0].file, 'plugins/mccp/scripts/lib/rogue-emitter.js');
  });
});

test('C1-COVERAGE-REGISTRY-WRITER: the registry is the only approved writer, and emit points are not on the list', () => {
  assert.deepStrictEqual(gate.APPROVED_REGISTRY_WRITERS,
    ['plugins/mccp/scripts/state/findings-registry.js'],
    'a second approved writer makes the single-choke-point claim false');
  // emit 지점 3곳은 `appendFindings()` 를 호출할 뿐이므로 목록에 없어야 한다.
  ['plugins/mccp/scripts/lib/plan-review/cli.js',
    'plugins/mccp/scripts/lib/plan-codex-runner.js',
    'plugins/mccp/scripts/lib/santa/seal.js'].forEach((rel) => {
    assert.strictEqual(gate.APPROVED_REGISTRY_WRITERS.indexOf(rel), -1,
      rel + ' calls the registry — putting it on the approved list would make the choke point four');
  });
  const r = gate.staticLint(REPO_ROOT);
  assert.deepStrictEqual(r.registry.violations, [],
    'an unapproved .claude/state/findings/ writer entered the tree');
});

// ── C1-CONTRACT-COPRESENT ────────────────────────────────────────────────────
//
// DD10 — 커밋 경계가 아니라 **트리 상태**를 본다. 분할 착지가 일어난 순간의 트리에서
// 붉어지므로 커밋 경계를 감시하는 것보다 강하고 단순하다.
test('C1-CONTRACT-COPRESENT: a consumer-only tree (Task 2 without Task 3) fails', () => {
  withTempDir((root) => {
    scaffoldContractTree(root, { consumerRequires: true, sourceRegistered: false });
    const r = gate.contractCoPresence(root);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.consumer_requires_contract, true);
    assert.strictEqual(r.source_registered, false);
    assert.match(r.detail, /unproducible/);
  });
});

test('C1-CONTRACT-COPRESENT: a producer-only tree (Task 3 without Task 2) fails', () => {
  withTempDir((root) => {
    scaffoldContractTree(root, { consumerRequires: false, sourceRegistered: true });
    const r = gate.contractCoPresence(root);
    assert.strictEqual(r.ok, false);
    assert.match(r.detail, /inert/, 'the anti-gaming check would exist but read nothing');
  });
});

test('C1-CONTRACT-COPRESENT: both present passes, and the live tree is both-present', () => {
  withTempDir((root) => {
    scaffoldContractTree(root, { consumerRequires: true, sourceRegistered: true });
    assert.strictEqual(gate.contractCoPresence(root).ok, true);
  });
  const live = gate.contractCoPresence(REPO_ROOT);
  assert.strictEqual(live.ok, true);
  assert.strictEqual(live.consumer_requires_contract, true);
  assert.strictEqual(live.source_registered, true);
});

// ── C1-GATE-MERGE-UNION ──────────────────────────────────────────────────────
//
// Task 1 의 `C1-MERGE-UNION` 이 단언이라면 이쪽은 **게이트**다. 둘은 다른 층이라
// 중복이 아니다 — 수동 명령으로만 두면 잘못 설정된 인프라 위에서도 게이트가 통과한다.
test('C1-GATE-MERGE-UNION: a tree without the declaration fails the gate axis', () => {
  withTempDir((root) => {
    execFileSync('git', ['-C', root, 'init', '-q']);
    const r = gate.mergeUnionCheck(root);
    assert.strictEqual(r.ok, false, 'no .gitattributes rule means silent append loss on merge');
    assert.strictEqual(r.probes.length, 2);
    assert.notStrictEqual(r.probes[0].merge, 'union');
  });
});

test('C1-GATE-MERGE-UNION: a too-narrow glob fails on the future-name probe', () => {
  withTempDir((root) => {
    execFileSync('git', ['-C', root, 'init', '-q']);
    // 실제 파일 하나만 지목하는 선언 — 선언은 있으나 패턴이 아니다.
    writeFile(root, '.gitattributes',
      '.claude/state/findings/multi-session-work-loop.jsonl merge=union\n');
    const r = gate.mergeUnionCheck(root);
    assert.strictEqual(r.probes[0].merge, 'union', 'the named file is covered');
    assert.notStrictEqual(r.probes[1].merge, 'union', 'but a future work unit is not');
    assert.strictEqual(r.ok, false, 'a declaration that only covers today is not merge safety');
  });
});

test('C1-GATE-MERGE-UNION: the glob form passes, and the live tree carries it', () => {
  withTempDir((root) => {
    execFileSync('git', ['-C', root, 'init', '-q']);
    writeFile(root, '.gitattributes', '.claude/state/findings/*.jsonl merge=union\n');
    assert.strictEqual(gate.mergeUnionCheck(root).ok, true);
  });
  assert.strictEqual(gate.mergeUnionCheck(REPO_ROOT).ok, true);
});

// ── C1-COVERAGE-RUNTIME ──────────────────────────────────────────────────────
//
// 표면은 레지스트리와 **다른 코드 경로가 다른 목적으로** 쓰므로 기록기의 기록기가
// 아니라 독립 관측이다. 이 축이 잡는 것은 batch 유실 중 **부풀리는 방향**이다.
test('C1-COVERAGE-RUNTIME: a review record listing more findings than the registry holds fails', () => {
  withTempDir((root) => {
    writeFile(root, path.join('.claude', 'reviews', 'plan-review-wu-rt.md'), [
      '# plan review', '', '## Findings', '',
      '| Perspective | Severity | Claim | Evidence |',
      '|---|---|---|---|',
      '| security | HIGH | first claim | e |',
      '| security | HIGH | second claim | e |',
      '| test | MEDIUM | third claim | e |',
      '', '## Measurement', '',
    ].join('\n'));
    // 레지스트리에는 1건만 착지했다 — batch 가 부분/전체 유실된 상태.
    registry.appendFindings('wu-rt', [{
      kind: 'finding_opened', gate_id: 'mccp-plan-codex', perspective: 'security',
      severity: 'HIGH', claim: 'first claim',
    }], { repoRoot: root });

    const r = gate.correlateStandingRecords(root);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.uncovered.length, 1);
    assert.strictEqual(r.uncovered[0].record_findings, 3);
    assert.strictEqual(r.uncovered[0].registry_findings, 1);
  });
});

test('C1-COVERAGE-RUNTIME: the synthetic verdict=fail row is not counted against the registry', () => {
  // 두 표면의 계약이 다르다 — quorum 이 합성한 행은 리뷰어가 제출한 finding 이
  // 아니므로 emit 대상이 아니고, 그것을 세면 게이트가 정상 경로를 영구히 붉힌다.
  const md = [
    '## Findings', '',
    '| Perspective | Severity | Claim | Evidence |',
    '|---|---|---|---|',
    '| security | HIGH | a real finding | e |',
    '| invariant | FAIL | reviewer returned verdict=fail | (no finding filed) |',
    '', '## Refutation attempted',
  ].join('\n');
  assert.strictEqual(gate.countRecordFindings(md), 1);
});

test('C1-COVERAGE-RUNTIME: a pre-registry record is unmeasured, not a failure', () => {
  withTempDir((root) => {
    writeFile(root, path.join('.claude', 'reviews', 'plan-review-wu-old.md'), [
      '## Findings', '',
      '| Perspective | Severity | Claim | Evidence |',
      '|---|---|---|---|',
      '| security | HIGH | an old finding | e |',
      '', '## Measurement',
    ].join('\n'));
    const r = gate.correlateStandingRecords(root);
    // 배송 증거와 저장소 일반 불변식을 뒤섞지 않는다 — 그 축은 --acceptance 소관이다.
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.unmeasured.length, 1);
    assert.strictEqual(r.uncovered.length, 0);
  });
});

test('C1-COVERAGE-RUNTIME: a windowed delta with no matching events fails', () => {
  withTempDir((root) => {
    const rel = path.join('.claude', 'reviews', 'plan-review-wu-win.md');
    writeFile(root, rel, ['## Findings', '', '| Perspective | Severity | Claim | Evidence |',
      '|---|---|---|---|', '', '## M'].join('\n'));
    const before = gate.snapshotReviewSurface(root);

    writeFile(root, rel, ['## Findings', '', '| Perspective | Severity | Claim | Evidence |',
      '|---|---|---|---|',
      '| security | HIGH | a new claim | e |',
      '| test | HIGH | another new claim | e |', '', '## M'].join('\n'));
    const after = gate.snapshotReviewSurface(root);

    const r = gate.correlateSurfaceDelta(root, before, after);
    assert.strictEqual(r.deltas, 1);
    assert.strictEqual(r.ok, false, 'the surface grew but no registry event accompanied it');
  });
});

// ── C1-ACCEPTANCE-MECHANIZED ─────────────────────────────────────────────────
//
// 수용 조건이 산문 체크리스트로만 있으면 **건너뛰어도 PR 이 통과**하므로
// "코드 존재는 판정 근거가 아니다"(UI4)를 스스로 위반한다. 이 모드가 재판정한다.
test('C1-ACCEPTANCE-MECHANIZED: an empty tree fails and names every broken axis', () => {
  withTempDir((root) => {
    execFileSync('git', ['-C', root, 'init', '-q']);
    const r = gate.evaluateAcceptance({ repoRoot: root });
    assert.strictEqual(r.ok, false);
    const axes = r.failures.map((f) => f.axis).sort();
    assert.deepStrictEqual(axes,
      ['audit-sample', 'c1-computed', 'merge-union', 'registry-committed', 'registry-present'],
      'all five machine-decidable axes report by name, not as one opaque failure');
  });
});

test('C1-ACCEPTANCE-MECHANIZED: an uncommitted registry fails the HEAD axis specifically', () => {
  withTempDir((root) => {
    execFileSync('git', ['-C', root, 'init', '-q']);
    writeFile(root, '.gitattributes', '.claude/state/findings/*.jsonl merge=union\n');
    registry.appendFindings(gate.ACCEPTANCE_WORK_UNIT, [{
      kind: 'finding_opened', gate_id: 'mccp-plan-codex', perspective: 'security',
      severity: 'HIGH', claim: 'a finding that was written but never committed',
    }], { repoRoot: root });
    // `git add` 만 한다 — `git ls-files --error-unmatch` 라면 여기서 통과한다.
    execFileSync('git', ['-C', root, 'add', '-A']);

    const r = gate.evaluateAcceptance({ repoRoot: root });
    const byAxis = {};
    r.failures.forEach((f) => { byAxis[f.axis] = f; });
    assert.strictEqual(r.axes.registry_present.ok, true, 'the file is on disk');
    assert.strictEqual(r.axes.merge_union.ok, true);
    assert.ok(byAxis['registry-committed'],
      'index registration is not commitment — the HEAD-tree probe is the point');
  });
});

test('C1-ACCEPTANCE-MECHANIZED: degraded coverage is refused as shipping evidence', () => {
  // Task 2 계약: degraded 는 지표 산출을 막지 않지만 배송 증거로는 쓰지 않는다.
  // 두 층을 분리하지 않으면 둘 중 하나가 반드시 틀린다.
  const src = fs.readFileSync(GATE_CLI, 'utf8');
  assert.ok(/coverage\.indexOf\('degraded'\) === -1/.test(src),
    'the acceptance mode must reject a degraded coverage value');
});

test('C1-ACCEPTANCE-MECHANIZED: the CLI exits non-zero on failure and zero by default', () => {
  withTempDir((root) => {
    execFileSync('git', ['-C', root, 'init', '-q']);
    const bad = spawnSync(process.execPath, [GATE_CLI, '--acceptance', '--json'],
      { cwd: root, encoding: 'utf8' });
    assert.notStrictEqual(bad.status, 0, 'skipping the evidence must not exit 0');
    assert.match(bad.stderr, /\[c1-coverage-gate\] FAIL/);
  });

  // default 모드는 이 저장소에서 통과해야 한다(Validation 블록이 그렇게 부른다).
  const live = spawnSync(process.execPath, [GATE_CLI, '--json'],
    { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.strictEqual(live.status, 0, 'default gate on the live tree: ' + live.stderr);
});

// ── local review 흡수 (H3 · M4) ──────────────────────────────────────────────

test('C1-COVERAGE-RUNTIME: 표면 카운트가 emit 술어와 같다 (claim 부재·중복 fold)', () => {
  // `record.js#findingRows` 는 `isObj(f)` 인 모든 finding 에 행을 쓰지만
  // `plan-review/cli.js#emitPanelFindings` 는 claim 이 비면 emit 하지 않고,
  // 레지스트리는 내용 파생 `finding_id` 로 fold 한다. 표면을 raw 행 수로 세면
  // 유실이 없는데도 `record > registry` 가 되어 게이트가 **오진하며 차단**한다.
  const markdown = [
    '# Plan Review Panel — probe',
    '',
    '## Findings',
    '',
    '| Perspective | Severity | Claim | Evidence |',
    '|---|---|---|---|',
    '| security | HIGH |  | lib/a.js:10 |',              // claim 부재 → emit 안 됨
    '| security | HIGH | same claim | lib/b.js:1 |',
    '| security | HIGH | same claim | lib/b.js:1 |',      // 동일 내용 → fold 되어 1건
    '| security | fail | reviewer returned verdict=fail | (no finding filed) |',
    '',
    '## Next',
  ].join('\n');
  assert.strictEqual(gate.countRecordFindings(markdown), 1,
    'emit 술어(claim 존재)와 fold(내용 파생 id)를 표면 쪽도 따른다');

  // 이스케이프된 파이프가 셀 경계로 오인되지 않는다. 백슬래시를 소스 리터럴로 적으면
  // 셸·heredoc 을 지나며 개수가 조용히 바뀌므로(실측), `record.js#cell` 과 **같은
  // 변환**을 여기서 실행해 입력을 만든다 — fixture 가 진짜 이스케이프를 담는지도 단언한다.
  const BS = String.fromCharCode(92);
  const asCell = function (v) {
    return String(v).split(BS).join(BS + BS).split('|').join(BS + '|');
  };
  const row = '| test | HIGH | ' + asCell('a | b') + ' | x.js:1 |';
  assert.ok(row.indexOf(BS + '|') !== -1, 'the fixture really carries an escaped pipe');
  assert.deepStrictEqual(gate.parseRecordRow(row), ['test', 'HIGH', 'a | b', 'x.js:1']);

  const escaped = [
    '## Findings',
    '',
    '| Perspective | Severity | Claim | Evidence |',
    '|---|---|---|---|',
    row,
    '',
  ].join('\n');
  assert.strictEqual(gate.countRecordFindings(escaped), 1);
});

test('C1-COVERAGE-RUNTIME: 다른 게이트의 finding 이 패널 유실을 가리지 않는다', () => {
  // `shard.findings` 는 그 work_unit 의 모든 게이트를 fold 한 집합이다. 좌변을
  // 그대로 쓰면 Codex·santa finding 이 수를 채워 **실제 패널 유실**을 덮는다 —
  // 이 축이 겨냥한 것이 정확히 그 방향의 유실이므로 사각이 목적과 겹친다.
  const shard = {
    findings: [
      { gate_id: 'mccp-plan-codex', perspective: 'security' },   // 패널
      { gate_id: 'mccp-plan-codex', perspective: 'codex' },      // Codex — 제외
      { gate_id: 'mccp-santa-loop', perspective: 'santa-A' },    // santa — 제외
    ],
  };
  assert.strictEqual(gate.panelFindingsOf(shard).length, 1);
  assert.strictEqual(gate.PANEL_GATE_ID, 'mccp-plan-codex');
  assert.strictEqual(gate.CODEX_PERSPECTIVE, 'codex');
});

test('C1-COVERAGE-RUNTIME: 정상 패널 기록과 레지스트리는 uncovered 를 내지 않는다', () => {
  withTempDir((dir) => {
    const root = path.join(dir, 'repo');
    fs.mkdirSync(path.join(root, '.claude', 'reviews'), { recursive: true });
    fs.mkdirSync(path.join(root, '.claude', 'state', 'findings'), { recursive: true });
    writeFile(root, path.join('.claude', 'reviews', 'plan-review-wu.md'), [
      '## Findings',
      '',
      '| Perspective | Severity | Claim | Evidence |',
      '|---|---|---|---|',
      '| security | HIGH | boundary is unchecked | lib/a.js:1 |',
      '| security | HIGH |  | lib/b.js:2 |',
      '',
    ].join('\n'));
    registry.appendFindings('wu', [{
      kind: 'finding_opened', gate_id: 'mccp-plan-codex', perspective: 'security',
      severity: 'HIGH', claim: 'boundary is unchecked',
      claim_digest: registry.claimDigestOf('boundary is unchecked'),
      cited_path: 'lib/a.js',
    }, {
      // 다른 게이트의 finding 이 섞여 있어도 패널 축 판정은 흔들리지 않는다.
      kind: 'finding_opened', gate_id: 'mccp-santa-loop', perspective: 'santa-A',
      severity: 'HIGH', claim: 'unrelated', claim_digest: registry.claimDigestOf('unrelated'),
    }], { repoRoot: root });

    const r = gate.correlateStandingRecords(root);
    assert.strictEqual(r.ok, true, JSON.stringify(r.uncovered));
    assert.strictEqual(r.covered, 1);
  });
});
