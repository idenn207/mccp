'use strict';

// santa-loop-materialize M2 — produces-only gate `mccp-santa-review` + present-only
// meta.santa_* 4종 + gate별 review_source 고정 불변식(DD3).
//
// test 이름의 `[N]` 접두는 plan의 커버리지 계약 id다. Validation 2d가 두 test
// 파일에서 이 id를 수집해 1~16 전체 집합과 대조하므로, 이름 규약을 깨면 항목이
// 존재해도 감사에서 누락으로 잡힌다.
//
// 소유: 이 파일은 Task 2가 만들고 항목 1·2·3·5·7을 쓴다. Task 6이 4·6을 덧붙인다.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validate, GATE_IDS } = require('../schema');
const { ALIAS_MATRIX, phaseFromGate, getCommandSpec } = require('../aliases');
const { receiptHash, planAwareMarkdownHash } = require('../hash');
const { isCrossModelCorroborated, CROSS_MODEL_SOURCES } = require('../../lib/review-verdict');

const SLUG = 'santa-x';
const REPORT_REL = '.claude/reviews/santa-review-' + SLUG + '.md';

// santa proof — DD3의 층 매핑. quorum은 상수가 아니라 FINAL 라운드의 distinct
// envelope.id에서 파생된 값을 흉내낸다(A·B 두 명이 정상 기록된 라운드).
//
// `reviewed_plan_hash`는 **필수**다. isReviewProofStructurallyValid는 이 필드가
// sha256 문자열이 아니면 converged proof를 거부한다(review-verdict.js:182-183) —
// plan DD3 표의 "있으면 일치"보다 강한 계약이라 seal.js도 항상 채워야 한다.
function santaProof(reportHash, overrides) {
  const base = {
    layers: { l1: 'converged', l2: 'converged', l3: null },
    verification_verdict: 'converged',
    quorum: { passed: true, required: 2, of: 2, responded: 2, roles: 2 },
    perspectives: [{ perspective: 'A' }, { perspective: 'B' }],
    dispatch_evidence: [REPORT_REL],
    reviewed_plan_hash: reportHash,
  };
  return Object.assign(base, overrides || {});
}

// 각 test는 자기 tmp repo에서 돈다. subject는 plan이 아니라 santa 리포트
// markdown이다 — write.js의 `--plan`은 이름만 plan이고 실제로는 subject markdown이며
// hash.js#planAwareMarkdownHash가 non-plan 경로를 markdownHash로 보낸다(DD2).
function withRepo(fn) {
  const repo = mkTmpRepo();
  const report = writeFileSync(repo, REPORT_REL,
    '# santa-loop review — ' + SLUG + '\n\n집계 리포트 본문\n');
  // proof의 reviewed_plan_hash는 receipt의 plan_hash와 같은 함수로 계산해야
  // 둘이 어긋나지 않는다(write.js가 같은 함수로 subject를 해시한다).
  const proofPath = writeFileSync(repo, '.claude/state/santa-loop/' + SLUG + '.proof.json',
    JSON.stringify(santaProof(planAwareMarkdownHash(report)), null, 2));
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    return fn(repo, path.relative(repo, report), path.relative(repo, proofPath));
  } finally {
    process.chdir(cwd);
  }
}

// 정상 santa receipt 1건. 개별 test가 이걸 받아 필드를 흔든다.
function writeSanta(reportRel, proofRel, extra) {
  return write(Object.assign({
    gate: 'mccp-santa-review',
    decision: SLUG,
    plan: reportRel,
    'review-verdict': 'converged',
    'review-source': 'multi-agent',
    'review-proof-file': proofRel,
  }, extra || {}));
}

// ── [1] gate 등록 ─────────────────────────────────────────────────────────────

test('[1] mccp-santa-review is a registered gate id with phase=review', function () {
  assert.ok(GATE_IDS.indexOf('mccp-santa-review') !== -1, 'gate id registered');
  // 'pr'이 아니라 'review'인 것이 요점이다 — evidence-stage-guard가 phase==='pr'을
  // ship receipt 판정에 쓰므로, 'pr'이면 감사 앵커가 ship 증거로 오분류된다(DD1).
  assert.strictEqual(phaseFromGate('mccp-santa-review'), 'review');
});

// ── [2] 왕복 ──────────────────────────────────────────────────────────────────

test('[2] santa receipt round-trips with --santa-* and the review triple', function () {
  withRepo(function (repo, reportRel, proofRel) {
    const r = writeSanta(reportRel, proofRel, {
      'santa-rounds': 2,
      'santa-entries': 5,
      'santa-cap': 3,
    });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.gate_id, 'mccp-santa-review');
    assert.strictEqual(r.receipt.phase, 'review');
    assert.strictEqual(r.receipt.meta.santa_rounds, 2);
    assert.strictEqual(r.receipt.meta.santa_entries, 5);
    assert.strictEqual(r.receipt.meta.santa_cap, 3);
    assert.strictEqual(r.receipt.resolution.review_source, 'multi-agent');
    assert.strictEqual(r.receipt.resolution.review_verdict, 'converged');
  });
});

test('[2] santa_exit_reason round-trips and rejects any other value', function () {
  withRepo(function (repo, reportRel, proofRel) {
    const r = writeSanta(reportRel, proofRel, {
      'santa-rounds': 3, 'santa-cap': 3, 'santa-exit-reason': 'cap_reached',
    });
    assert.strictEqual(validate(r.receipt).ok, true);
    assert.strictEqual(r.receipt.meta.santa_exit_reason, 'cap_reached');

    r.receipt.meta.santa_exit_reason = 'something_else';
    assert.strictEqual(validate(r.receipt).ok, false, 'enum must be closed');
  });
});

// ── [3] present-only — 키 부재 (DD4 hash 안정성) ──────────────────────────────

test('[3] omitting --santa-* leaves the meta keys ABSENT, not null', function () {
  withRepo(function (repo, reportRel, proofRel) {
    const r = writeSanta(reportRel, proofRel);
    assert.strictEqual(validate(r.receipt).ok, true);
    // `null` 이 아니라 **키 자체가 없어야** 한다. makeSkeleton에 넣으면 모든
    // receipt의 canonical hash 입력이 바뀌어 git-tracked ship corpus 재작성이
    // TRACKED_RECEIPT_OVERWRITE 가드에 걸린다(DD4).
    ['santa_rounds', 'santa_entries', 'santa_cap', 'santa_exit_reason'].forEach(function (k) {
      assert.ok(!(k in r.receipt.meta),
        'meta.' + k + ' must not exist when the flag is not supplied (got ' +
        JSON.stringify(r.receipt.meta[k]) + ')');
    });
  });
});

test('[3] a non-santa gate never materializes santa_* keys', function () {
  withRepo(function (repo, reportRel) {
    const r = write({ gate: 'mccp-implement-codex', decision: SLUG, plan: reportRel });
    assert.strictEqual(validate(r.receipt).ok, true);
    assert.ok(!('santa_rounds' in r.receipt.meta));
    assert.ok(!('santa_cap' in r.receipt.meta));
  });
});

// ── [5] negative — review_source 참칭 4케이스 (UI3/I4) ────────────────────────

test('[5] santa receipt REJECTS review_source codex / hybrid / absent / whole-triple-absent',
  function () {
    withRepo(function (repo, reportRel, proofRel) {
      const base = writeSanta(reportRel, proofRel).receipt;

      // (a) codex 참칭 · (b) hybrid 참칭
      ['codex', 'hybrid'].forEach(function (src) {
        const r = JSON.parse(JSON.stringify(base));
        r.resolution.review_source = src;
        const v = validate(r);
        assert.strictEqual(v.ok, false, 'review_source=' + src + ' must be REJECTed');
        assert.ok(JSON.stringify(v.errors).indexOf('mccp-santa-review') !== -1,
          'the santa invariant must be the rejecting rule, not an unrelated one');
      });

      // (c) review_source만 부재 (나머지 triple 존재)
      const onlySourceGone = JSON.parse(JSON.stringify(base));
      delete onlySourceGone.resolution.review_source;
      assert.strictEqual(validate(onlySourceGone).ok, false,
        'absent review_source must be REJECTed — absence is not "multi-agent"');

      // (d) review triple 전부 부재 — **위치 계약의 유일한 강제**.
      // 검사가 `if (reviewPresent.length > 0)` 가드 **안**에 놓이면 이 케이스만
      // 조용히 통과하고, 그 receipt는 resolution.converged 기본값 true를 달고
      // 승인처럼 읽힌다. 나머지 3케이스는 잘못된 중첩에서도 통과하므로 이것이
      // 없으면 위치 결함이 탐지되지 않는다.
      const tripleGone = JSON.parse(JSON.stringify(base));
      delete tripleGone.resolution.review_source;
      delete tripleGone.resolution.review_verdict;
      delete tripleGone.resolution.review_proof;
      const v = validate(tripleGone);
      assert.strictEqual(v.ok, false,
        'a santa receipt with NO review triple must be REJECTed (the gate-id check must ' +
        'sit OUTSIDE the reviewPresent guard)');
      assert.ok(JSON.stringify(v.errors).indexOf('mccp-santa-review') !== -1,
        'rejection must come from the santa invariant');
    });
  });

test('[5] a non-santa gate is unaffected by the santa review_source invariant', function () {
  withRepo(function (repo, reportRel) {
    // 같은 "triple 부재" 형태라도 다른 gate에서는 정상이다 — 불변식이 gate_id로
    // 좁게 걸려 있어야 하고, 전역 제약이 되면 기존 receipt 전부가 깨진다.
    const r = write({ gate: 'mccp-plan-codex', decision: SLUG, plan: reportRel });
    assert.strictEqual(validate(r.receipt).ok, true, JSON.stringify(validate(r.receipt).errors));
  });
});

// ── [4] 비침습 — 어떤 command chain에도 진입하지 않는다 (DD1/UI2) ────────────

test('[4] no command produces / requires / design-options mccp-santa-review', function () {
  Object.keys(ALIAS_MATRIX).forEach(function (cmd) {
    const spec = ALIAS_MATRIX[cmd];
    const all = [].concat(spec.produces || [], spec.requires_preceding || [],
      spec.design_optional || []);
    assert.ok(all.indexOf('mccp-santa-review') === -1,
      cmd + ' must not reference mccp-santa-review in its chain');
  });
  // 문자열 전수 검사 — 위 3개 키 밖에 새 키가 생겨도 잡힌다.
  assert.ok(JSON.stringify(ALIAS_MATRIX).indexOf('mccp-santa-review') === -1,
    'ALIAS_MATRIX must not mention the santa gate anywhere');
});

test('[4] the santa gate does not tighten prp-implement or pr preflight', function () {
  assert.deepStrictEqual(getCommandSpec('mccp:prp-implement').requires_preceding,
    ['mccp-plan-codex']);
  assert.deepStrictEqual(getCommandSpec('mccp:pr').requires_preceding,
    ['mccp-plan-codex', 'mccp-implement-codex']);
});

// ── [6] negative — dual-review 우회 불가 (UI12) ──────────────────────────────

test('[6] a CONVERGED santa receipt does NOT count as cross-model corroboration', function () {
  withRepo(function (repo, reportRel, proofRel) {
    const r = writeSanta(reportRel, proofRel);
    assert.strictEqual(r.receipt.resolution.review_verdict, 'converged');
    assert.strictEqual(validate(r.receipt).ok, true);

    // 이것이 UI12의 전부다. santa가 cross-model로 인정되면 두 개의 santa 승인만으로
    // /mccp:pr의 PR-Codex가 skip되어 dual-review가 조용히 우회된다.
    assert.strictEqual(isCrossModelCorroborated(r.receipt.resolution), false,
      'multi-agent approval must never satisfy cross-model corroboration');
    assert.ok(CROSS_MODEL_SOURCES.indexOf('multi-agent') === -1,
      'multi-agent must stay outside CROSS_MODEL_SOURCES');
  });
});

test('[6] a codex-sourced receipt DOES corroborate — the negative above is not vacuous',
  function () {
    withRepo(function (repo, reportRel) {
      // 대조군이 없으면 [6]은 "isCrossModelCorroborated가 늘 false"여도 통과한다.
      const r = write({
        gate: 'mccp-implement-codex', decision: SLUG, plan: reportRel,
        'codex-verdict': 'converged',
      });
      assert.strictEqual(isCrossModelCorroborated(r.receipt.resolution), true,
        'the codex axis must still corroborate — otherwise [6] proves nothing');
    });
  });

// ── [7] hash 커버리지 ────────────────────────────────────────────────────────

test('[7] meta.santa_* and review_proof are inside receipt_hash (tamper is detectable)',
  function () {
    withRepo(function (repo, reportRel, proofRel) {
      const r = writeSanta(reportRel, proofRel, {
        'santa-rounds': 2, 'santa-entries': 4, 'santa-cap': 3,
      });
      const sealed = receiptHash(r.receipt);
      assert.strictEqual(sealed, r.receipt.receipt_hash,
        'the written receipt must already be sealed with its own hash');

      const bumped = JSON.parse(JSON.stringify(r.receipt));
      bumped.meta.santa_rounds = 99;
      assert.notStrictEqual(receiptHash(bumped), sealed,
        'meta.santa_rounds must NOT be carved out of receipt_hash');

      const forged = JSON.parse(JSON.stringify(r.receipt));
      forged.resolution.review_proof.quorum.roles = 4;
      assert.notStrictEqual(receiptHash(forged), sealed,
        'review_proof must NOT be carved out of receipt_hash');
    });
  });

// ── [M1] 레인 커버리지 정수 2종 (santa-evidence-diversity) ────────────────────

test('[M1] santa_blind_* round-trips, and 0 is a VALID observed value', function () {
  withRepo(function (repo, reportRel, proofRel) {
    const r = writeSanta(reportRel, proofRel, {
      'santa-rounds': 2, 'santa-blind-records': 2, 'santa-blind-rounds': 2,
    });
    assert.strictEqual(validate(r.receipt).ok, true, JSON.stringify(validate(r.receipt).errors));
    assert.strictEqual(r.receipt.meta.santa_blind_records, 2);
    assert.strictEqual(r.receipt.meta.santa_blind_rounds, 2);

    // `off` 실행의 형태. 0은 "관측했고 블라인드가 0건이었다"이고 schema가 그것을
    // 받아야 한다 — 거부하면 정상 producer 출력(DD8이 약속한 off stamp)이 막힌다.
    const z = writeSanta(reportRel, proofRel, {
      'santa-rounds': 1, 'santa-blind-records': 0, 'santa-blind-rounds': 0,
    });
    assert.strictEqual(validate(z.receipt).ok, true, JSON.stringify(validate(z.receipt).errors));
    assert.strictEqual(z.receipt.meta.santa_blind_records, 0);
    assert.strictEqual(z.receipt.meta.santa_blind_rounds, 0);
  });
});

test('[M1] santa_blind_* rejects negatives and non-integers', function () {
  withRepo(function (repo, reportRel, proofRel) {
    const r = writeSanta(reportRel, proofRel, {
      'santa-rounds': 1, 'santa-blind-records': 1, 'santa-blind-rounds': 1,
    });
    assert.strictEqual(validate(r.receipt).ok, true);

    [-1, 1.5, '2', null === undefined ? 0 : NaN].forEach(function (bad) {
      const c = JSON.parse(JSON.stringify(r.receipt));
      c.meta.santa_blind_records = bad;
      assert.strictEqual(validate(c).ok, false,
        'santa_blind_records accepted ' + JSON.stringify(bad));
    });
    [-3, 0.5, 'x'].forEach(function (bad) {
      const c = JSON.parse(JSON.stringify(r.receipt));
      c.meta.santa_blind_rounds = bad;
      assert.strictEqual(validate(c).ok, false,
        'santa_blind_rounds accepted ' + JSON.stringify(bad));
    });
  });
});

test('[M1] omitting the lane flags leaves both keys ABSENT (present-only)', function () {
  withRepo(function (repo, reportRel, proofRel) {
    // 부재 = "레인 축이 없던 시절에 쓰였다(모름)". 0과 구별돼야 하고, makeSkeleton에
    // 넣지 않았다는 것이 곧 §3.12 ship corpus의 hash 안정성이다.
    const r = writeSanta(reportRel, proofRel, { 'santa-rounds': 1 });
    assert.strictEqual(validate(r.receipt).ok, true);
    ['santa_blind_records', 'santa_blind_rounds'].forEach(function (k) {
      assert.ok(!(k in r.receipt.meta),
        'meta.' + k + ' must be absent when the flag is not supplied');
    });
  });
});

test('[M1] santa_blind_* is NOT carved out of receipt_hash', function () {
  // `validate()`는 hash를 검사하지 않는다 — 봉인 검사는 [7]과 동일하게
  // `receiptHash()` 재계산 비교로 한다. 이 두 필드가 carve-out되면 stamp를 고쳐도
  // 봉인이 그대로여서 "관측된 커버리지"가 사후 변조 가능해진다.
  withRepo(function (repo, reportRel, proofRel) {
    const r = writeSanta(reportRel, proofRel, {
      'santa-rounds': 1, 'santa-blind-records': 1, 'santa-blind-rounds': 1,
    });
    const sealed = receiptHash(r.receipt);
    assert.strictEqual(sealed, r.receipt.receipt_hash);

    [['santa_blind_records', 99], ['santa_blind_rounds', 7]].forEach(function (pair) {
      const bumped = JSON.parse(JSON.stringify(r.receipt));
      bumped.meta[pair[0]] = pair[1];
      assert.notStrictEqual(receiptHash(bumped), sealed,
        'meta.' + pair[0] + ' must NOT be carved out of receipt_hash');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// santa-evidence-diversity M3 — degrade 축 receipt 5필드.
//
// 지키는 것은 셋이다: 5필드의 present-only 검증 · ack ↔ ack_reason 양방향 불변식 ·
// **DD2 사영 회귀**(degraded 봉인이 receipt/proof 어휘를 오염시키지 않는다).
// ═══════════════════════════════════════════════════════════════════════════════

test('[M3] the five degrade fields round-trip and validate', function () {
  withRepo(function (repo, reportRel, proofRel) {
    const r = writeSanta(reportRel, proofRel, {
      'santa-rounds': 1,
      'santa-model-families': 1,
      'santa-model-degraded': true,
      'santa-degrade-reason': 'same_family',
      'santa-degrade-ack': true,
      'santa-degrade-ack-reason':
        'codex is not installed on this build machine so reviewer B fell back to Claude',
    });
    assert.strictEqual(validate(r.receipt).ok, true,
      JSON.stringify(validate(r.receipt).errors));
    assert.strictEqual(r.receipt.meta.santa_model_families, 1);
    assert.strictEqual(r.receipt.meta.santa_model_degraded, true);
    assert.strictEqual(r.receipt.meta.santa_degrade_reason, 'same_family');
    assert.strictEqual(r.receipt.meta.santa_degrade_ack, true);
    assert.match(r.receipt.meta.santa_degrade_ack_reason, /codex is not installed/);
  });
});

test('[M3] omitting the degrade flags leaves all five keys ABSENT (present-only)', function () {
  withRepo(function (repo, reportRel, proofRel) {
    // 부재 = "이 축이 없던 시절에 쓰였다(모름)". makeSkeleton에 넣지 않았다는 것이
    // 곧 §3.12 git-tracked ship corpus의 hash 안정성이다.
    const r = writeSanta(reportRel, proofRel, { 'santa-rounds': 1 });
    assert.strictEqual(validate(r.receipt).ok, true);
    ['santa_model_families', 'santa_model_degraded', 'santa_degrade_reason',
      'santa_degrade_ack', 'santa_degrade_ack_reason'].forEach(function (k) {
      assert.ok(!(k in r.receipt.meta),
        'meta.' + k + ' must be absent when the flag is not supplied');
    });
  });
});

test('[M3] santa_model_families accepts 0 and rejects non-integers', function () {
  withRepo(function (repo, reportRel, proofRel) {
    // 0은 유효한 값이다 — 계열이 하나도 식별되지 않은 라운드(전원 unknown)이고,
    // 부재와 다른 상태다.
    const zero = writeSanta(reportRel, proofRel, {
      'santa-rounds': 1, 'santa-model-families': 0,
    });
    assert.strictEqual(zero.receipt.meta.santa_model_families, 0);
    assert.strictEqual(validate(zero.receipt).ok, true);

    [-1, 0.5, 'x', true].forEach(function (bad) {
      const c = JSON.parse(JSON.stringify(zero.receipt));
      c.meta.santa_model_families = bad;
      assert.strictEqual(validate(c).ok, false,
        'santa_model_families accepted ' + JSON.stringify(bad));
    });
  });
});

test('[M3] the two degrade booleans accept only true (false === absence)', function () {
  withRepo(function (repo, reportRel, proofRel) {
    const r = writeSanta(reportRel, proofRel, {
      'santa-rounds': 1, 'santa-model-degraded': true, 'santa-degrade-reason': 'same_family',
    });
    // writer 쪽: `false`를 넘겨도 키가 생기지 않는다.
    const off = writeSanta(reportRel, proofRel, {
      'santa-rounds': 1, 'santa-model-degraded': false,
    });
    assert.ok(!('santa_model_degraded' in off.receipt.meta),
      'false must be stored as absence, not as an explicit false');

    // schema 쪽: 명시 false는 거부된다 — 부재와 뜻이 겹치는 순간 present-only 의미론이
    // 무너진다.
    [false, 'true', 1, null].forEach(function (bad) {
      if (bad === null) return;   // null은 부재로 취급되는 것이 계약이다
      ['santa_model_degraded', 'santa_degrade_ack'].forEach(function (k) {
        const c = JSON.parse(JSON.stringify(r.receipt));
        c.meta[k] = bad;
        if (k === 'santa_degrade_ack') c.meta.santa_degrade_ack_reason = 'a reason long enough to pass';
        assert.strictEqual(validate(c).ok, false,
          k + ' accepted ' + JSON.stringify(bad));
      });
    });
  });
});

test('[M3] santa_degrade_reason is a closed 2-value enum', function () {
  withRepo(function (repo, reportRel, proofRel) {
    ['same_family', 'unknown_model'].forEach(function (ok) {
      const r = writeSanta(reportRel, proofRel, {
        'santa-rounds': 1, 'santa-degrade-reason': ok,
      });
      assert.strictEqual(validate(r.receipt).ok, true, ok + ' must be accepted');
    });
    const base = writeSanta(reportRel, proofRel, {
      'santa-rounds': 1, 'santa-degrade-reason': 'same_family',
    });
    // 열거 밖은 거부된다. 특히 `codex_disabled`처럼 그럴듯한 값이 거부되는 것이 요점이다 —
    // 봉인되는 사유는 projection에서 파생 가능한 두 값뿐이고, 의도적 비활성 대 미가용의
    // 구분은 Step 5.5의 안내 메시지 소관이다(DD7).
    ['codex_disabled', 'unavailable', '', 'SAME_FAMILY', 42].forEach(function (bad) {
      const c = JSON.parse(JSON.stringify(base.receipt));
      c.meta.santa_degrade_reason = bad;
      assert.strictEqual(validate(c).ok, false,
        'santa_degrade_reason accepted ' + JSON.stringify(bad));
    });
  });
});

test('[M3] ack and ack_reason are bound in BOTH directions', function () {
  withRepo(function (repo, reportRel, proofRel) {
    const REASON = 'codex is absent on this host so reviewer B ran as a second Claude';

    // 한쪽만 넘긴 호출은 **write 시점에** 거부된다 — `write()`가 schema를 돌리고
    // SCHEMA_INVALID로 던지므로 깨진 receipt가 디스크에 닿지 않는다.
    assert.throws(function () {
      writeSanta(reportRel, proofRel, { 'santa-rounds': 1, 'santa-degrade-ack': true });
    }, /both be present or both absent/,
    'an approval with no recorded reason must be rejected');

    assert.throws(function () {
      writeSanta(reportRel, proofRel, { 'santa-rounds': 1, 'santa-degrade-ack-reason': REASON });
    }, /both be present or both absent/,
    'a reason for an approval that was never applied must be rejected');

    const both = writeSanta(reportRel, proofRel, {
      'santa-rounds': 1, 'santa-degrade-ack': true, 'santa-degrade-ack-reason': REASON,
    });
    assert.strictEqual(validate(both.receipt).ok, true,
      JSON.stringify(validate(both.receipt).errors));

    // 사후 삭제도 같은 불변식에 걸린다.
    const stripped = JSON.parse(JSON.stringify(both.receipt));
    delete stripped.meta.santa_degrade_ack_reason;
    assert.strictEqual(validate(stripped).ok, false,
      'deleting the reason from a sealed ack must not validate');

    // **security-reviewer F3의 정확한 실패 모양**: 사유 부재 시 `null`을 명시 저장하는
    // `pr_codex_force_override` 블록(write.js)을 복사하면 이 receipt가 나온다. `null`은
    // 이 축의 부재 판정 기준(`!== null && !== undefined`)에 걸려 여전히 거부되어야
    // 한다 — 그렇지 않으면 "사유 없는 승인"이 null을 쓰고 통과한다.
    const nulled = JSON.parse(JSON.stringify(both.receipt));
    nulled.meta.santa_degrade_ack_reason = null;
    assert.strictEqual(validate(nulled).ok, false,
      'the pr_codex_force_override null-reason shape must be rejected here');
  });
});

test('[M3] DD2 projection — a degraded seal never leaks the word into receipt or proof',
  function () {
    // 이것이 M3의 지표가 요구하는 "구분"의 기계적 표현이다: 같은 receipt에서
    // `review_verdict='divergent'`(비승인)와 `santa_model_degraded=true`(왜 비승인인가)가
    // **함께** 읽히고, `degraded`라는 이름은 receipt·proof 어느 필드에도 없다.
    withRepo(function (repo, reportRel, proofRel) {
      const r = writeSanta(reportRel, proofRel, {
        'santa-rounds': 1,
        'review-verdict': 'divergent',              // seal()의 사영 결과
        'santa-model-families': 1,
        'santa-model-degraded': true,
        'santa-degrade-reason': 'same_family',
      });
      assert.strictEqual(validate(r.receipt).ok, true,
        JSON.stringify(validate(r.receipt).errors));
      assert.strictEqual(r.receipt.resolution.review_verdict, 'divergent');
      assert.strictEqual(r.receipt.meta.santa_model_degraded, true);
      assert.strictEqual(r.receipt.meta.santa_degrade_reason, 'same_family');

      // `degraded`가 receipt 어디에도 값으로 실리지 않는다. 문자열 전수 검사로 두는
      // 이유는 필드를 하나씩 열거하면 신규 필드가 조용히 새기 때문이다.
      const flat = JSON.stringify(r.receipt);
      assert.equal(/"degraded"/.test(flat), false,
        'the token "degraded" must not appear as a value anywhere in the receipt');
    });
  });

test('[M3] review-verdict vocabulary is untouched — "degraded" is not a receipt value',
  function () {
    // DD2가 주장하는 "어휘 무접촉"의 기계적 확인. 이 배열은 `receipt/schema.js`의
    // CODEX_VERDICT_VALUES와 공유되므로, 여기에 degraded가 들어가면 santa와 무관한
    // codex 축·pr-ship-gate·dedupe·대시보드가 전부 새 값을 만난다.
    const { REVIEW_VERDICT_VALUES } = require('../../lib/review-verdict');
    assert.equal(REVIEW_VERDICT_VALUES.indexOf('degraded'), -1,
      'degraded leaked into the shared review/codex verdict vocabulary');

    withRepo(function (repo, reportRel, proofRel) {
      assert.throws(function () {
        writeSanta(reportRel, proofRel, { 'santa-rounds': 1, 'review-verdict': 'degraded' });
      }, /schema|verdict/i, 'writing review_verdict=degraded must be rejected');
    });
  });

test('[M3] the degrade fields are NOT carved out of receipt_hash', function () {
  // carve-out되면 stamp를 고쳐도 봉인이 그대로여서 "관측된 degrade"가 사후 변조
  // 가능해진다. [M1]의 santa_blind_* 단언과 같은 규약이다.
  withRepo(function (repo, reportRel, proofRel) {
    const r = writeSanta(reportRel, proofRel, {
      'santa-rounds': 1,
      'santa-model-families': 1,
      'santa-model-degraded': true,
      'santa-degrade-reason': 'same_family',
    });
    const sealed = receiptHash(r.receipt);
    assert.strictEqual(sealed, r.receipt.receipt_hash);

    [['santa_model_families', 2], ['santa_model_degraded', false],
      ['santa_degrade_reason', 'unknown_model']].forEach(function (pair) {
      const bumped = JSON.parse(JSON.stringify(r.receipt));
      bumped.meta[pair[0]] = pair[1];
      assert.notStrictEqual(receiptHash(bumped), sealed,
        'meta.' + pair[0] + ' must NOT be carved out of receipt_hash');
    });
  });
});
