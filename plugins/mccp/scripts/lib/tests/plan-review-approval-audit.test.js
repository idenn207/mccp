'use strict';

// diverse-agent-review M11 Task 2 — 승인 dossier 결속 오라클 회귀 test.
//
// 이 test가 고정하는 것은 **결속 규칙과 그 실패 모드**다. 실코퍼스에 대한 경험적
// 주장(미탐이 있었는가)은 픽스처로 증명되지 않는다 — 그 반증은 도구를 실제
// 코퍼스에 돌린 출력을 문서에 축자 동결하는 것으로 성립한다. 여기서 주장하지
// 않고 그 한계를 명시한다(M8 `plan-review-corpus.test.js` 헤더와 같은 분업).
//
// 특히 지키는 것 넷:
//   - 부재를 0으로 접지 않는다 (blind · structurally_empty · unauditable · undated).
//   - **거부는 읽기 전에** 일어난다 (io 스텁 호출 0회로 단언 — 사후 판정은 검증이 아니다).
//   - 이름이 아니라 **해시**로 증인을 귀속한다 (Implement-Codex R1 F1).
//   - 도구는 결속하고 **판정하지 않는다** (DN2 — 판정 필드 부재를 test가 고정).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  audit,
  auditPathVerdict,
  parseIsoStrict,
  checkQuorumConsistency,
  hashContentAs,
  hashScheme,
  sliceReportSections,
  MAX_HISTORY_REVS,
} = require('../plan-review/approval-audit');

const { sha256, canonicalizeMarkdownStructural, subjectHash, receiptHash } = require('../../receipt/hash');
const schema = require('../../receipt/schema');

// ── 픽스처 빌더 ───────────────────────────────────────────────────────────────

// 구조 해시와 raw 해시가 **실제로 갈리는** 본문이어야 한다. 구조 정규화는 표 셀
// 안의 status 토큰을 `_STATUS_`로 접으므로(`hash.js:148-150`), 그 토큰이 없으면 두
// 체제가 같은 값을 내고 DN6 회귀는 아무것도 지키지 못한다 — 초판 픽스처가 정확히
// 그랬고 항목 4b가 그것을 붉게 잡았다.
const PLAN_BODY = [
  '# Plan: fixture',
  '',
  '## Summary',
  '',
  'A fixture plan body.',
  '',
  '## Delivery Milestones',
  '',
  '| # | Milestone | Status |',
  '|---|---|---|',
  '| 1 | first | complete |',
  '| 2 | second | pending |',
  '',
].join('\n');

function structuralHash(text) {
  return sha256(canonicalizeMarkdownStructural(text));
}

// record.js가 쓰는 형식의 최소 패널 레코드.
function recordText(opts) {
  const o = opts || {};
  const measurement = Object.assign({
    verdict: 'converged',
    source: 'multi-agent',
    layers: { l1: 'converged', l2: 'converged', l3: 'not fired' },
    quorum: { responded: 4, required: 3, roles: 4, of: 4, passed: true },
    wall_clock_ms: 1000,
    halt_stage: null,
    reviewed_plan_hash: structuralHash(PLAN_BODY),
    plan_path: '.claude/plans/fixture.plan.md',
    recorded_at: '2026-08-20T00:00:00.000Z',
  }, o.measurement || {});
  if (o.measurement && Object.prototype.hasOwnProperty.call(o.measurement, 'quorum')) {
    measurement.quorum = o.measurement.quorum;
  }

  const refutation = o.refutation || [
    ['architect', 'pass', 'attacked structure'],
    ['security', 'pass', 'attacked trust boundaries'],
    ['test', 'pass', 'attacked falsifiability'],
  ];

  const L = [];
  L.push('# Plan Review Panel — fixture');
  L.push('');
  L.push('## Findings');
  L.push('');
  L.push('| Perspective | Severity | Claim | Evidence |');
  L.push('|---|---|---|---|');
  L.push('');
  L.push('## Refutation attempted');
  L.push('');
  L.push('| Perspective | Verdict | What was attacked |');
  L.push('|---|---|---|');
  refutation.forEach(function (r) { L.push('| ' + r[0] + ' | ' + r[1] + ' | ' + r[2] + ' |'); });
  L.push('');
  L.push('## Measurement');
  L.push('');
  L.push('```json');
  L.push(o.rawMeasurement !== undefined ? o.rawMeasurement : JSON.stringify(measurement, null, 2));
  L.push('```');
  L.push('');
  return L.join('\n');
}

// 실제로 `receiptIntegrityOk`를 통과하는 receipt를 만든다. 손으로 지은 가짜
// `receipt_hash`를 쓰면 전 픽스처가 `receipt_corrupt`로 떨어져 이 test는 도구가
// 아니라 자기 픽스처를 재는 것이 된다(실측으로 확인 — 7건이 그렇게 실패했다).
function shipReceipt(opts) {
  const o = opts || {};
  const r = schema.makeSkeleton({});
  r.gate_id = 'mccp-pr-codex';
  r.phase = 'pr';
  r.decision_id = o.decision_id || 'fixture';
  r.plan_hash = o.plan_hash || structuralHash(PLAN_BODY);
  r.base_sha = '0'.repeat(40);
  r.head_sha = '1'.repeat(40);
  r.findings = o.findings || [];
  r.resolution = Object.assign({}, r.resolution, {
    codex_verdict: o.codex_verdict === undefined ? 'skipped' : o.codex_verdict,
  });
  r.meta = Object.assign({}, r.meta, {
    command: '/mccp:pr',
    codex_disabled: o.codex_disabled === undefined ? true : o.codex_disabled,
  });
  r.subject_hash = subjectHash(r);
  r.receipt_hash = receiptHash(r);
  if (o.corrupt) r.receipt_hash = 'sha256:' + 'f'.repeat(64);   // 의도적 손상
  return r;
}

// io 스텁. **모든** 파일시스템·git 접근이 여기를 통하므로, 거부 경로에서 호출
// 0회를 단언할 수 있다. 실제 도구가 io를 우회해 `fs`를 직접 부르면 이 단언이
// 깨지는 것이 목적이다.
function makeStubIo(spec) {
  const s = spec || {};
  const files = s.files || {};
  const calls = { exists: [], readFile: [], readDir: [], revList: [], showAtRev: [], firstCommitIso: [], isTracked: [] };
  const norm = function (p) { return String(p).replace(/\\/g, '/'); };
  return {
    root: '/fixture-root',
    calls: calls,
    // 어떤 경로로든 파일시스템에 닿은 총 횟수. 항목 9의 "읽기 0회" 단언의 모수.
    touchCount: function () {
      return calls.exists.length + calls.readFile.length + calls.readDir.length
        + calls.revList.length + calls.showAtRev.length + calls.firstCommitIso.length;
    },
    exists: function (p) { calls.exists.push(norm(p)); return Object.prototype.hasOwnProperty.call(files, norm(p)); },
    readFile: function (p) {
      calls.readFile.push(norm(p));
      return Object.prototype.hasOwnProperty.call(files, norm(p)) ? files[norm(p)] : null;
    },
    readDir: function (p) {
      calls.readDir.push(norm(p));
      const prefix = norm(p) + '/';
      const out = [];
      Object.keys(files).forEach(function (f) {
        if (f.indexOf(prefix) === 0 && f.slice(prefix.length).indexOf('/') === -1) {
          out.push(f.slice(prefix.length));
        }
      });
      return out;
    },
    revList: function (p) { calls.revList.push(norm(p)); return (s.revs && s.revs[norm(p)]) || []; },
    showAtRev: function (rev, p) {
      calls.showAtRev.push(rev + ':' + norm(p));
      const blobs = s.blobs || {};
      const k = rev + ':' + norm(p);
      return Object.prototype.hasOwnProperty.call(blobs, k) ? blobs[k] : null;
    },
    firstCommitIso: function (p) { calls.firstCommitIso.push(norm(p)); return (s.commitIso && s.commitIso[norm(p)]) || null; },
    isTracked: function (p) { calls.isTracked.push(norm(p)); return s.untracked ? !s.untracked.includes(norm(p)) : true; },
  };
}

function corpusResult(entries) {
  return {
    state: 'ok',
    records: entries.length,
    pass_path: { count: entries.length, entries: entries },
  };
}

function entry(o) {
  return Object.assign({
    record: '.claude/reviews/plan-review-fixture.md',
    plan_path: '.claude/plans/fixture.plan.md',
    wall_clock_ms: 1000,
    hash_bound: true,
    single_pass_trace: false,
    quorum: { responded: 4, required: 3, roles: 4, of: 4, passed: true },
    recorded_at: '2026-08-20T00:00:00.000Z',
    reason: 'L1 + L2 quorum satisfied',
  }, o || {});
}

// 정상 1건 픽스처 — 앵커가 디스크에 있고 ship receipt가 해시로 결속된다.
function healthySpec(over) {
  const files = {
    '.claude/reviews/plan-review-fixture.md': recordText({}),
    '.claude/plans/fixture.plan.md': PLAN_BODY,
    '.claude/receipts/mccp-pr-codex/fixture.json': JSON.stringify(shipReceipt({})),
  };
  return Object.assign({ files: files }, over || {});
}

// ── 1. blind 규칙 ─────────────────────────────────────────────────────────────

test('1. blind — 승인 레코드 0건이면 state=blind이고 어떤 카운터/비율도 보고하지 않는다', function () {
  const r = audit({ io: makeStubIo({ files: {} }), corpusResult: corpusResult([]) });
  assert.equal(r.state, 'blind');
  assert.equal(r.coverage.approved, 0);
  assert.deepEqual(r.records, []);
  // 부재를 판정으로 읽지 않는다: 비율·요약 카운터가 아예 없어야 한다.
  assert.equal(r.proof_backing_summary, undefined);
  assert.equal(r.channel_summary, undefined);
  // 비율 어휘 검사는 **필드 이름**에 대해서만 한다 — `notes`의 산문은 "어떤 비율도
  // 보고하지 않는다"고 말하기 위해 그 단어를 쓸 수밖에 없다.
  const fieldNames = [];
  (function walk(v) {
    if (v === null || typeof v !== 'object') return;
    Object.keys(v).forEach(function (k) { fieldNames.push(k); walk(v[k]); });
  })(r);
  assert.ok(!/rate|ratio|percent/i.test(fieldNames.join(' ')),
    'blind 출력의 필드 이름에 비율 어휘가 없어야 한다: ' + fieldNames.join(','));
});

// ── 2·3. 구조적 공집합 vs 부재 ───────────────────────────────────────────────

test('2. structurally_empty — codex_disabled ship receipt는 pr_codex를 구조적 공집합으로 보고한다', function () {
  const r = audit({ io: makeStubIo(healthySpec()), corpusResult: corpusResult([entry()]) });
  const d = r.records[0];
  assert.equal(d.channels.pr_codex.state, 'structurally_empty');
  assert.match(d.channels.pr_codex.reason, /codex_disabled=true/);
  // 그 0이 "미탐 없음"의 근거가 되지 않는다.
  assert.equal(r.channel_summary.pr_codex.evidence_bearing_records, 0);
  assert.equal(r.channel_summary.pr_codex.can_ground_absence, false);
  // 어떤 candidate도 그 채널에서 나오지 않는다.
  assert.equal(d.candidates.filter(function (c) { return c.channel === 'pr_codex'; }).length, 0);
});

test('3. structurally_empty ≠ absent — receipt 부재와 Codex 미발화는 서로 다르게 분류된다', function () {
  const withReceipt = audit({ io: makeStubIo(healthySpec()), corpusResult: corpusResult([entry()]) });
  const noReceiptSpec = healthySpec();
  delete noReceiptSpec.files['.claude/receipts/mccp-pr-codex/fixture.json'];
  const without = audit({ io: makeStubIo(noReceiptSpec), corpusResult: corpusResult([entry()]) });

  assert.equal(withReceipt.records[0].channels.pr_codex.state, 'structurally_empty');
  assert.equal(without.records[0].channels.pr_codex.state, 'absent');
  assert.notEqual(
    withReceipt.records[0].channels.pr_codex.state,
    without.records[0].channels.pr_codex.state,
  );
});

// ── 4. DN6 — 해시 체제는 기록된 경로가 고른다 ────────────────────────────────

test('4. DN6 — plan이 archived/로 옮겨져도 기록된 경로의 체제로 앵커가 복구된다', function () {
  // 기록된 경로는 `.claude/plans/…`(구조 해시 체제)인데 파일은 archived/에 있다.
  const files = {
    '.claude/reviews/plan-review-fixture.md': recordText({}),
    '.claude/PRPs/plans/archived/fixture.plan.md': PLAN_BODY,
    '.claude/receipts/mccp-pr-codex/fixture.json': JSON.stringify(shipReceipt({})),
  };
  const r = audit({ io: makeStubIo({ files: files }), corpusResult: corpusResult([entry()]) });
  const d = r.records[0];
  assert.equal(d.anchor.state, 'on_disk');
  assert.equal(d.anchor.scheme, 'structural');
  assert.equal(d.anchor.recovered_from, '.claude/PRPs/plans/archived/fixture.plan.md');
  assert.equal(r.coverage.auditable, 1);
});

test('4b. DN6 (수정 전 실패의 고정) — 현재 경로 체제로 해시하면 같은 픽스처가 불일치한다', function () {
  // 이것이 "수정 전 실패"의 기계적 재현이다. 잘못된 구현은 파일이 실제로 있는
  // 경로(`archived/`)로 체제를 고르므로 raw 해시가 되고, 구조 해시로 봉인된
  // `reviewed_plan_hash`와 어긋나 앵커가 unrecoverable로 떨어진다.
  const recorded = '.claude/plans/fixture.plan.md';
  const actual = '.claude/PRPs/plans/archived/fixture.plan.md';
  assert.equal(hashScheme(recorded), 'structural');
  assert.equal(hashScheme(actual), 'raw', 'archived 경로는 isPlanPath가 거짓이라 raw로 떨어진다');

  const sealed = hashContentAs(recorded, PLAN_BODY);          // 올바른 구현
  const wrong = hashContentAs(actual, PLAN_BODY);             // 수정 전 구현
  assert.notEqual(wrong, sealed, '두 체제가 같은 값을 내면 이 회귀는 아무것도 지키지 못한다');
  assert.equal(hashContentAs(recorded, PLAN_BODY), sealed);
});

// ── 5. unauditable 격리 ──────────────────────────────────────────────────────

test('5. unauditable — 본문 복구 불가는 격리되고 state는 ok를 유지하며 auditable이 준다', function () {
  const files = {
    '.claude/reviews/plan-review-fixture.md': recordText({}),
    // plan 본문이 어디에도 없다. ship receipt는 해시로 결속돼 있다(별개 축).
    '.claude/receipts/mccp-pr-codex/fixture.json': JSON.stringify(shipReceipt({})),
  };
  const r = audit({ io: makeStubIo({ files: files }), corpusResult: corpusResult([entry()]) });
  const d = r.records[0];
  assert.equal(d.anchor.state, 'unauditable');
  assert.equal(d.anchor.reason, 'unrecoverable');
  assert.equal(d.proof_backing, 'corroborated');
  // 고장이 아니라 코퍼스의 경계다 — state를 바꾸지 않는다.
  assert.equal(r.state, 'ok');
  assert.equal(r.coverage.approved, 1);
  assert.equal(r.coverage.auditable, 0);
  assert.equal(r.coverage.unauditable, 1);
});

test('5b. 상한 소진은 진짜 부재와 구분된다 (history_limit_exhausted)', function () {
  const revs = {};
  const many = [];
  for (let i = 0; i < MAX_HISTORY_REVS + 5; i++) many.push('rev' + i);
  revs['.claude/plans/fixture.plan.md'] = many;
  const files = {
    '.claude/reviews/plan-review-fixture.md': recordText({}),
    '.claude/receipts/mccp-pr-codex/fixture.json': JSON.stringify(shipReceipt({})),
  };
  const r = audit({ io: makeStubIo({ files: files, revs: revs }), corpusResult: corpusResult([entry()]) });
  const d = r.records[0];
  assert.equal(d.anchor.state, 'unauditable');
  assert.equal(d.anchor.reason, 'history_limit_exhausted');
  assert.equal(d.anchor.history_limit_exhausted, true);
  assert.equal(d.anchor.revisions_scanned, MAX_HISTORY_REVS);
  // 소진을 `unrecoverable`로 접으면 오래된 승인이 조용히 감사 불가가 된다.
  assert.notEqual(d.anchor.reason, 'unrecoverable');
});

// ── 6. degraded ──────────────────────────────────────────────────────────────

test('6. degraded — 깨진 Measurement JSON은 조용히 0으로 세어지지 않는다', function () {
  const files = healthySpec().files;
  files['.claude/reviews/plan-review-fixture.md'] = recordText({ rawMeasurement: '{ not json' });
  const r = audit({ io: makeStubIo({ files: files }), corpusResult: corpusResult([entry()]) });
  assert.equal(r.state, 'degraded');
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0].reason, /quorum_contradiction|measurement/);
  assert.equal(r.coverage.approved, 0, '읽지 못한 레코드를 승인으로 세지 않는다');
});

// ── 7. Refutation 표 파싱 ────────────────────────────────────────────────────

test('7. lenses — 3번째 셀에 파이프가 들어도 관점 열이 어긋나지 않는다', function () {
  const files = healthySpec().files;
  files['.claude/reviews/plan-review-fixture.md'] = recordText({
    refutation: [
      ['architect', 'pass', 'attacked a \\| b \\| c'],
      ['security', 'pass', 'plain'],
    ],
  });
  const r = audit({ io: makeStubIo({ files: files }), corpusResult: corpusResult([entry()]) });
  assert.deepEqual(r.records[0].lenses, ['architect', 'security']);
});

// ── 8. 판정 부재 (DN2) ───────────────────────────────────────────────────────

test('8. 판정 부재 — 출력 어디에도 false-approve 류의 판정 필드가 없다', function () {
  const r = audit({ io: makeStubIo(healthySpec()), corpusResult: corpusResult([entry()]) });
  const s = JSON.stringify(r);
  ['false_approve', 'false-approve', 'is_miss', 'miss_count', 'missed', 'verdict_miss', 'approval_correct']
    .forEach(function (banned) {
      assert.ok(s.indexOf(banned) === -1, '판정 필드가 새어나왔다: ' + banned);
    });
  // 시간 순서는 사실이지 판정이 아니다 — 그 이름이 판정 라벨을 쓰지 않는지도 고정한다.
  r.records[0].candidates.forEach(function (c) {
    assert.ok(Object.prototype.hasOwnProperty.call(c, 'recorded_after_approval'));
    assert.equal(c.post_approval, undefined);
    assert.equal(c.out_of_lens, undefined);
  });
});

// ── 9. 경로 탈출 거부 — 읽기 전에 ────────────────────────────────────────────

test('9. 경로 탈출 — 거부 입력은 unauditable + plan_path_rejected이고 읽기가 시도되지 않는다', function () {
  const escapes = [
    ['../../../etc/passwd', 'not_repo_relative'],
    ['/abs/x.md', 'not_repo_relative'],
    ['C:/x.md', 'not_repo_relative'],
    ['a\\b.md', 'not_repo_relative'],
    ['./x.md', 'not_repo_relative'],
    ['x\u0000y.md', 'not_repo_relative'],
    // security-reviewer C2 — 정본 validator는 이것들을 통과시킨다. git 옵션 주입.
    ['--all', 'leading_dash_segment'],
    ['-n', 'leading_dash_segment'],
    ['.claude/plans/--output=x.plan.md', 'leading_dash_segment'],
    // security-reviewer H1 — win32에서 읽으면 실패가 아니라 stdin 대기 정지.
    ['CON', 'windows_reserved_name'],
    ['.claude/plans/NUL.plan.md', 'windows_reserved_name'],
  ];
  escapes.forEach(function (pair) {
    const v = auditPathVerdict(pair[0]);
    assert.equal(v.ok, false, pair[0] + ' 는 거부돼야 한다');
    assert.equal(v.reason, pair[1], pair[0] + ' 의 거부 사유');
  });

  // 실제 감사 경로에서 읽기 0회. **사후 판정은 검증이 아니다** — io 스텁의
  // 접촉 횟수로 단언한다.
  escapes.forEach(function (pair) {
    // 레코드 자체는 정상이어야 한다 — 그래야 이 test가 재는 것이 경로 관문이지
    // "레코드를 못 읽었다"가 아니다.
    const io = makeStubIo({
      files: {
        '.claude/reviews/plan-review-fixture.md': recordText({ measurement: { plan_path: pair[0] } }),
      },
    });
    const before = io.touchCount();
    const r = audit({ io: io, corpusResult: corpusResult([entry({ plan_path: pair[0] })]) });
    const d = r.records.length ? r.records[0] : null;
    assert.ok(d, 'record 는 dossier 로 남아야 한다: ' + pair[0]);
    assert.equal(d.anchor.state, 'unauditable');
    assert.equal(d.anchor.reason, 'plan_path_rejected:' + pair[1]);
    // 거부된 plan_path 로는 단 한 번도 접근하지 않는다.
    const touched = io.calls.exists.concat(io.calls.readFile, io.calls.revList,
      io.calls.showAtRev.map(function (x) { return x.split(':').slice(1).join(':'); }));
    assert.ok(touched.indexOf(String(pair[0]).replace(/\\/g, '/')) === -1,
      '거부 경로에 접근했다: ' + pair[0]);
    assert.ok(io.touchCount() >= before);
  });
});

test('9b. 대칭 — 정상 코퍼스의 두 형태는 통과한다 (정상을 잃는 validator는 결함이다)', function () {
  assert.equal(auditPathVerdict('.claude/plans/x.plan.md').ok, true);
  assert.equal(auditPathVerdict('.claude/PRPs/plans/archived/x.plan.md').ok, true);
  assert.equal(auditPathVerdict('.claude/PRPs/reports/multi-session-work-loop-m6-report.md').ok, true);
});

// ── 10. coverage 항등식 ──────────────────────────────────────────────────────

test('10. coverage — 정확히 세 키이고 approved === auditable + unauditable', function () {
  const files = healthySpec().files;
  files['.claude/reviews/plan-review-other.md'] = recordText({
    measurement: { plan_path: '.claude/plans/other.plan.md' },
  });
  const r = audit({
    io: makeStubIo({ files: files }),
    corpusResult: corpusResult([
      entry(),
      entry({ record: '.claude/reviews/plan-review-other.md', plan_path: '.claude/plans/other.plan.md' }),
    ]),
  });
  assert.deepEqual(Object.keys(r.coverage).sort(), ['approved', 'auditable', 'unauditable']);
  assert.equal(r.coverage.approved, r.coverage.auditable + r.coverage.unauditable);
});

// ── 11. proof_backing → degraded ─────────────────────────────────────────────

test('11. proof_backing — ship plan_hash 불일치는 uncorroborated이고 state를 degraded로 만든다', function () {
  const files = healthySpec().files;
  // 같은 slug 이름의 receipt이지만 **다른 plan의 봉인**이다.
  files['.claude/receipts/mccp-pr-codex/fixture.json'] = JSON.stringify(
    shipReceipt({ plan_hash: 'sha256:someotherplan' }),
  );
  const r = audit({ io: makeStubIo({ files: files }), corpusResult: corpusResult([entry()]) });
  const d = r.records[0];
  // 이름이 같아도 증인이 아니다 (R1 F1).
  assert.equal(d.proof_backing, 'no_ship_receipt');
  assert.equal(d.proof_backing_detail.slug_addressed_receipt_exists, true);
  assert.equal(r.state, 'degraded');
  // 그리고 그 receipt의 findings 는 이 레코드의 증거로 쓰이지 않는다.
  assert.equal(d.candidates.filter(function (c) { return c.channel === 'pr_codex'; }).length, 0);
});

test('11b. 전건 corroborated 면 ok 를 유지한다 (상시 켜진 신호가 아님을 고정)', function () {
  const r = audit({ io: makeStubIo(healthySpec()), corpusResult: corpusResult([entry()]) });
  assert.equal(r.records[0].proof_backing, 'corroborated');
  assert.equal(r.state, 'ok');
});

// ── 12. recorded_at 부재 ─────────────────────────────────────────────────────

test('12. recorded_at — 부재/파싱 불가면 approved_at=null 이고 어떤 후보도 승인 이후로 승격되지 않는다', function () {
  [undefined, '', 'Mon Aug 26 2026', '2026-8-16', '2026-02-30T00:00:00Z'].forEach(function (bad) {
    const files = healthySpec().files;
    files['.claude/reviews/plan-review-fixture.md'] = recordText({ measurement: { recorded_at: bad } });
    files['.claude/PRPs/reports/fixture-report.md'] = [
      '# report', '', '## Deviations from Plan', '', '- something drifted', '',
    ].join('\n');
    const r = audit({
      io: makeStubIo({ files: files, commitIso: { '.claude/PRPs/reports/fixture-report.md': '2026-09-01T00:00:00.000Z' } }),
      corpusResult: corpusResult([entry()]),
    });
    const d = r.records[0];
    assert.equal(d.approved_at, null, JSON.stringify(bad) + ' 는 시각으로 받아들여지면 안 된다');
    assert.equal(r.coverage.unauditable, 1);
    d.candidates.forEach(function (c) {
      assert.equal(c.recorded_after_approval, null,
        '시간축이 없으면 어떤 후보도 승인 이후로 승격되지 않는다');
    });
  });
});

test('12b. parseIsoStrict — 관대한 파서를 쓰지 않는다', function () {
  assert.equal(parseIsoStrict('2026-08-20T00:00:00.000Z'), Date.parse('2026-08-20T00:00:00.000Z'));
  assert.equal(parseIsoStrict('2026-08-20T00:00:00Z'), Date.parse('2026-08-20T00:00:00Z'));
  assert.equal(parseIsoStrict('2026-08-20T09:00:00+09:00'), Date.parse('2026-08-20T09:00:00+09:00'));
  // security-reviewer H2 — 정규식은 통과하지만 존재하지 않는 날짜다.
  assert.equal(parseIsoStrict('2026-02-30T00:00:00Z'), null);
  assert.equal(parseIsoStrict('2026-13-01T00:00:00Z'), null);
  assert.equal(parseIsoStrict('Mon Aug 26 2026'), null);
  assert.equal(parseIsoStrict('2026-8-16'), null);
  assert.equal(parseIsoStrict(null), null);
});

// ── 13. quorum 모순 (Implement-Codex R1 F2) ──────────────────────────────────

test('13. quorum 모순 — 자기 측정이 부인하는 승인은 표본에서 빠지고 degraded 가 된다', function () {
  const contradictions = [
    { quorum: { responded: 4, required: 3, roles: 4, of: 4, passed: false } },
    { quorum: { responded: 2, required: 3, roles: 4, of: 4, passed: true } },
    { quorum: { responded: 4, required: 3, roles: 9, of: 4, passed: true } },
    { quorum: null },
  ];
  contradictions.forEach(function (m) {
    const files = healthySpec().files;
    files['.claude/reviews/plan-review-fixture.md'] = recordText({ measurement: m });
    const r = audit({ io: makeStubIo({ files: files }), corpusResult: corpusResult([entry()]) });
    assert.equal(r.coverage.approved, 0, JSON.stringify(m) + ' 는 승인 표본에 남으면 안 된다');
    assert.equal(r.rejected.length, 1);
    assert.match(r.rejected[0].reason, /^quorum_contradiction:/);
    assert.equal(r.state, 'degraded');
  });
});

test('13b. checkQuorumConsistency — 정상 quorum 은 통과한다', function () {
  assert.equal(checkQuorumConsistency({ quorum: { responded: 4, required: 3, roles: 4, of: 4, passed: true } }).ok, true);
});

// ── 14. slug 는 plan_path basename 이다 (R1 F1) ──────────────────────────────

test('14. slug — 레코드 파일명이 아니라 plan_path basename 에서 파생된다', function () {
  const files = {
    // 레코드 파일명 slug 는 `renamed`, plan basename slug 는 `realslug`.
    '.claude/reviews/plan-review-renamed.md': recordText({
      measurement: { plan_path: '.claude/plans/realslug.plan.md' },
    }),
    '.claude/plans/realslug.plan.md': PLAN_BODY,
    '.claude/receipts/mccp-pr-codex/realslug.json': JSON.stringify(shipReceipt({})),
    '.claude/PRPs/reports/realslug-report.md': [
      '# r', '', '## Issues Encountered', '', '- a real issue', '',
    ].join('\n'),
    // 함정: 레코드 파일명 slug 의 보고서에는 다른 plan 의 내용이 있다.
    '.claude/PRPs/reports/renamed-report.md': [
      '# r', '', '## Issues Encountered', '', '- SOMEONE ELSE PROBLEM', '',
    ].join('\n'),
  };
  const r = audit({
    io: makeStubIo({ files: files }),
    corpusResult: corpusResult([entry({
      record: '.claude/reviews/plan-review-renamed.md',
      plan_path: '.claude/plans/realslug.plan.md',
    })]),
  });
  const d = r.records[0];
  assert.equal(d.slug, 'realslug');
  assert.equal(d.slug_source, 'plan_path_basename');
  const texts = d.candidates.map(function (c) { return c.text; }).join('\n');
  assert.ok(texts.indexOf('a real issue') !== -1);
  assert.ok(texts.indexOf('SOMEONE ELSE PROBLEM') === -1, '다른 plan 의 증거가 결속되면 안 된다');
});

test('14b. attribution — 해시로 증명된 결속과 이름으로 주장된 결속을 구분해 표기한다', function () {
  const files = healthySpec().files;
  files['.claude/PRPs/reports/fixture-report.md'] = [
    '# r', '', '## Deviations from Plan', '', '- drifted', '',
  ].join('\n');
  // findings 항목은 schema가 요구하는 실제 형태여야 한다 — 약식으로 쓰면 receipt가
  // schema 검증에 걸려 `receipt_corrupt`가 되고, 이 test는 attribution이 아니라
  // 자기 픽스처의 부실을 재게 된다.
  files['.claude/receipts/mccp-pr-codex/fixture.json'] = JSON.stringify(
    shipReceipt({
      codex_disabled: false,
      codex_verdict: 'converged',
      findings: [{ severity: 'HIGH', area: 'correctness', description: 'real finding' }],
    }),
  );
  const r = audit({ io: makeStubIo({ files: files }), corpusResult: corpusResult([entry()]) });
  const d = r.records[0];
  const byChannel = {};
  d.candidates.forEach(function (c) { byChannel[c.channel] = c.attribution; });
  assert.equal(byChannel.pr_codex, 'hash_proven');
  assert.equal(byChannel.report, 'slug_claimed');
});

// ── 15. durability (패널 invariant CRITICAL 을 측정으로 닫는다) ──────────────

test('15. durability — 레코드의 git tracked 여부를 보고하되 state 는 바꾸지 않는다', function () {
  const tracked = audit({ io: makeStubIo(healthySpec()), corpusResult: corpusResult([entry()]) });
  assert.equal(tracked.records[0].durability, 'tracked');
  assert.equal(tracked.durability_summary.untracked, 0);

  const spec = healthySpec();
  spec.untracked = ['.claude/reviews/plan-review-fixture.md'];
  const untracked = audit({ io: makeStubIo(spec), corpusResult: corpusResult([entry()]) });
  assert.equal(untracked.records[0].durability, 'untracked');
  assert.equal(untracked.durability_summary.untracked, 1);
  // 코퍼스의 경계이지 고장이 아니다 — 상시 켜지면 정보를 나르지 않는다.
  assert.equal(untracked.state, 'ok');
});

// ── 16. 보고서 절 슬라이싱 ───────────────────────────────────────────────────

test('16. 보고서 슬라이싱 — heading 리터럴로 자르고, 하나도 못 잡으면 present 가 아니라 absent 다', function () {
  const secs = sliceReportSections([
    '# report', '## Summary', 'ignored', '## Deviations from Plan', '- d1',
    '## Code-review 흡수 (ship 직전, 2026-08-24)', '- c1', '## Next Steps', 'ignored too',
  ].join('\n'));
  assert.equal(secs.length, 2);
  assert.equal(secs[0].heading, '## Deviations from Plan');
  assert.ok(secs[1].heading.indexOf('## Code-review') === 0);
  assert.deepEqual(secs[0].lines.filter(Boolean), ['- d1']);

  // 파일은 있는데 어떤 절도 안 잡히는 경우.
  const files = healthySpec().files;
  files['.claude/PRPs/reports/fixture-report.md'] = '# report\n\n## Summary\n\nnothing relevant\n';
  const r = audit({ io: makeStubIo({ files: files }), corpusResult: corpusResult([entry()]) });
  assert.equal(r.records[0].channels.report.state, 'absent');
  assert.equal(r.records[0].channels.report.reason, 'no_evidence_sections_matched');
});

// ── 17. 예외가 audit() 을 벗어나지 않는다 ────────────────────────────────────

test('17. 어떤 입력에도 audit() 이 throw 하지 않는다 (조용한 붕괴가 조용한 0이 된다)', function () {
  const weird = [
    entry({ plan_path: null }),
    entry({ plan_path: 42 }),
    entry({ record: '.claude/reviews/missing.md' }),
  ];
  weird.forEach(function (e) {
    assert.doesNotThrow(function () {
      audit({ io: makeStubIo({ files: {} }), corpusResult: corpusResult([e]) });
    });
  });
});
