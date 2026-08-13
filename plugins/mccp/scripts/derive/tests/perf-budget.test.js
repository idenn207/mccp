'use strict';

// gate-guard-integrity M2 축 A(Task 2a) — 절대 wall-clock 예산을 자기 정규화
// 스케일링 비로 대체한다.
//
// 이전 단언은 `elapsed < 1000` 이었고, 그것은 **derive의 비용 + 머신 경합**을 함께
// 쟀다. 전수 병렬 실행은 코어 수를 초과해 프로세스를 띄우므로, 코드가 한 줄도 안
// 바뀌어도 부하가 높은 실행에서 발화할 수 있다. 그런 단언은 회귀 신호가 아니라
// 스케줄러 상태를 보고한다.
//
// 대신 **같은 fixture를 receipt 수만 바꿔 두 번** 재고 비율을 본다. 두 측정이 같은
// 경합을 받으므로 경합이 상쇄되고 남는 것이 알고리즘의 스케일링이다. 판정은
// `lib/perf-scaling.js`의 순수 오라클이 하고 여기서는 시간만 잰다.
//
// **완화가 아니라 대체임의 증명**은 §Validation의 `MCCP_PERF_INJECT_QUADRATIC=1`
// 실행이다 — 인위적 O(n²) 지연을 주입하면 아래 단언이 실제로 FAIL해야 한다. 그
// 스위치의 소비 지점은 **이 파일의 `runDerive` 헬퍼 진입부 단 한 곳**이며,
// production `derive/` 코드에는 들어가지 않는다(§Validation의 역방향 grep이 그
// 경계를 기계적으로 검사한다).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { derive } = require('../index');
const { tmpRepo, cleanup, gitInit, writeJson, writeText } = require('./helpers');
const envelope = require('../../lib/dispatch-envelope');
const { judgeScaling } = require('../../lib/perf-scaling');

const SMALL_N = 10;
const LARGE_N = 100;

// 비율 축이 잡지 못하는 것을 덮는 보조 상한(순수 상수 배수 폭증). 경합 잡음보다
// 한참 위라 부하로는 발화하지 않고, 파국적 회귀에는 발화한다. 원 단언의 1000ms를
// 낮춘 것이 아니라 **성격이 다른 두 번째 축**이다.
const CATASTROPHIC_CEILING_MS = 30000;

function rndUuid(n) {
  const s = n.toString(16).padStart(8, '0');
  return s + '-0000-0000-0000-' + n.toString(16).padStart(12, '0');
}

function buildFixture(receiptCount) {
  const root = tmpRepo();
  gitInit(root);
  for (let i = 0; i < 5; i++) {
    writeText(path.join(root, '.claude', 'plans', 'plan-' + i + '.plan.md'),
      '# Plan ' + i + '\n\n**Source PRD**: [p](../p.md)\n**Selected Milestone**: 1 — m\n**Complexity**: Small\n\n## Acceptance\n\n- [ ] item\n');
  }
  for (let i = 0; i < receiptCount; i++) {
    const gate = (i % 3 === 0) ? 'mccp-plan-codex' : (i % 3 === 1 ? 'mccp-implement-codex' : 'mccp-pr-codex');
    writeJson(path.join(root, '.claude', 'receipts', gate, 'd-' + i + '.json'), {
      schema_version: 'v1', gate_id: gate, phase: 'plan', decision_id: 'd-' + i, task_id: null,
      plan_hash: 'sha256:' + '0'.repeat(64),
      design_doc_hash: [], base_sha: '0000000', head_sha: '0000000', round: 1, findings: [],
      resolution: { converged: true, rounds: 1, open_questions: [] },
      subject_hash: 'sha256:' + '0'.repeat(64), receipt_hash: 'sha256:' + '0'.repeat(64),
      meta: { created_at: '2026-06-17T00:00:00.000Z',
        skipped: false, advisory: false, codex_skipped: false,
        security_skipped: false, impeccable_skipped: false },
    });
  }
  for (let i = 0; i < 20; i++) {
    const dispatchId = rndUuid(1000 + i);
    const p = path.join(root, '.claude', 'state', 'dispatches', dispatchId + '.envelope.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const w = envelope.write(p, {
      schema_version: 'v1', dispatch_id: dispatchId, worker_subagent_type: 'general-purpose',
      worker_started_at: '2026-06-17T00:00:00.000Z',
      worker_ended_at: '2026-06-17T00:00:30.000Z',
      worker_exit_status: 'ok', receipts_added: [], findings: [], next_action: null,
      controller_session_id: rndUuid(900 + i), parent_cwd: root,
    });
    assert.strictEqual(w.ok, true);
  }
  return root;
}

// **주입 스위치의 유일한 소비 지점.** 진입부에서 env를 읽고, 켜져 있으면 n²에
// 비례하는 바쁜 대기를 한 뒤 실제 derive에 위임한다. production 경로에 test 전용
// 분기를 심는 것은 이 PRD가 복원하려는 신뢰의 반대 방향이므로, 주입은 여기서
// 끝난다.
function runDerive(fixtureRoot, n) {
  const inject = process.env.MCCP_PERF_INJECT_QUADRATIC === '1';
  const start = Date.now();
  if (inject) {
    // 스톨은 **측정 창 안**이어야 한다. 타이머 밖에 두면 주입해도 elapsed 가
    // 움직이지 않아 이 축이 자기 자신을 검증하지 못한다(구현 중 1회 실측으로
    // 확인한 실수 — 배치가 계약의 일부다).
    const until = start + n * n;
    while (Date.now() < until) { /* deliberate O(n^2) stall */ }
  }
  const m = derive(fixtureRoot, { raw: true });
  return { elapsed: Date.now() - start, model: m, injected: inject };
}

test('perf-budget: derive cost scales no worse than linearly in receipt count', () => {
  const smallRoot = buildFixture(SMALL_N);
  const largeRoot = buildFixture(LARGE_N);
  try {
    // 순서를 교차시키지 않는다 — 두 측정이 같은 경합 창 안에 있어야 상쇄가
    // 성립하므로 연속으로 잰다.
    const small = runDerive(smallRoot, SMALL_N);
    const large = runDerive(largeRoot, LARGE_N);

    // 내용 단언은 그대로 유지한다. 성능 축을 바꾼다고 derive가 무엇을 읽었는지에
    // 대한 검증까지 잃으면 안 된다.
    assert.strictEqual(large.model.sources.plans.count, 5);
    assert.strictEqual(large.model.sources.receipts.count >= LARGE_N, true,
      'expected >= ' + LARGE_N + ' receipts; got ' + large.model.sources.receipts.count);
    assert.strictEqual(large.model.sources.envelopes.count, 20);
    assert.strictEqual(small.model.sources.receipts.count >= SMALL_N, true,
      'expected >= ' + SMALL_N + ' receipts; got ' + small.model.sources.receipts.count);

    const verdict = judgeScaling({
      small: { n: SMALL_N, ms: small.elapsed },
      large: { n: LARGE_N, ms: large.elapsed },
    });
    // 측정치를 항상 남긴다 — assert 메시지는 실패할 때만 보이고, 이 축의
    // 근거(경합에 흔들리지 않는 비율)는 통과했을 때도 읽을 수 있어야 한다.
    console.log('perf-budget: n=' + SMALL_N + ' ' + small.elapsed + 'ms · n=' + LARGE_N + ' '
      + large.elapsed + 'ms · ratio=' + verdict.ratio.toFixed(2)
      + ' limit=' + (verdict.linearRatio * 2).toFixed(2)
      + (small.injected ? ' [MCCP_PERF_INJECT_QUADRATIC=1]' : ''));
    assert.ok(verdict.ok,
      'derive scaling regressed: ' + verdict.reason
      + ' (small=' + small.elapsed + 'ms @n=' + SMALL_N
      + ', large=' + large.elapsed + 'ms @n=' + LARGE_N + ')');

    // 비율 축이 원리상 못 보는 상수 배수 폭증에 대한 두 번째 축. 경합으로는
    // 발화하지 않을 만큼 느슨하다.
    assert.ok(large.elapsed < CATASTROPHIC_CEILING_MS,
      'derive blew past the catastrophic ceiling: ' + large.elapsed + 'ms');
  } finally {
    cleanup(smallRoot);
    cleanup(largeRoot);
  }
});
