'use strict';

// review-loop-bypass M1 — static guards over the command-body WIRING.
//
// What this file can and cannot claim matters, because the Acceptance criterion
// it backs is easy to overread. The round loops in plan.md and prp-implement.md
// are prose an LLM follows; no test makes prose binding. What IS mechanical is
// whether each body READS THE SHARED ORACLE instead of its own literal — and
// that is exactly PRD Risk 5 ("one of the three gates is left out of the
// wiring"). This file closes that, and nothing wider.
//
// The 5.6b flag-forward assertions are here for a sharper reason: an
// implementation that quietly omits them passes every other test in the
// milestone while producing receipts with no audit stamp, which would break PRD
// Success Metric 4 in silence.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const COMMANDS = path.join(__dirname, '..', '..', '..', 'commands');

function read(name) {
  return fs.readFileSync(path.join(COMMANDS, name), 'utf8');
}

// Only fenced bash blocks are executable. Prose mentions the same tokens in
// tables and narrative and must not be linted as wiring.
function bashBlocks(src) {
  const out = [];
  let cur = null;
  src.split(/\r?\n/).forEach(function (line) {
    if (/^```bash\s*$/.test(line)) { cur = []; return; }
    if (/^```\s*$/.test(line)) { if (cur) out.push(cur.join('\n')); cur = null; return; }
    if (cur) cur.push(line);
  });
  return out;
}

const GATES = [
  ['plan.md', 'ROUND_CAP='],
  ['prp-implement.md', 'ROUND_CAP='],
  ['pr.md', 'export MCCP_GATE_ROUND_CAP='],
];

test('all three gate bodies read the round cap from the shared oracle', () => {
  GATES.forEach(function (g) {
    const blocks = bashBlocks(read(g[0]));
    const wired = blocks.filter(function (b) {
      return b.includes('scripts/lib/review-single-pass') && b.includes('effectiveRoundCap');
    });
    assert.ok(wired.length > 0,
      g[0] + ' must derive its round cap from lib/review-single-pass#effectiveRoundCap. ' +
      'A gate that keeps its own literal silently opts out of the toggle (PRD Risk 5).');
    assert.ok(wired.some(function (b) { return b.includes(g[1]); }),
      g[0] + ' must assign the oracle result (' + g[1] + '…) — computing it and ' +
      'discarding it would satisfy a substring check while changing nothing.');
  });
});

test('every gate surfaces WHY the cap was pinned', () => {
  // effectiveRoundCap returns {cap, pinned, reason} and the shell exports only
  // `.cap`. Without this line a pinned cap is indistinguishable from a
  // configured one in the logs.
  GATES.forEach(function (g) {
    const src = read(g[0]);
    assert.match(src, /\[mccp:single-pass\] round cap pinned to/,
      g[0] + ' must print the pinned-cap diagnostic');
  });
});

test('pr.md no longer hardcodes the child-process cap', () => {
  // This is the one MECHANICALLY enforced cap in the milestone: the codex-runner
  // child cannot read past what it inherits. A surviving literal would keep that
  // one real enforcement point outside the toggle.
  const src = read('pr.md');
  assert.doesNotMatch(src, /export MCCP_GATE_ROUND_CAP="\$\{MCCP_GATE_ROUND_CAP:-1\}"/,
    'the pre-M1 literal export must be gone, not merely accompanied');
});

test('plan.md 5.6b forwards BOTH single-pass flags, gated on a non-empty value', () => {
  const blocks = bashBlocks(read('plan.md'));
  const forwarding = blocks.filter(function (b) {
    return b.includes('--review-single-pass-reason');
  });
  assert.ok(forwarding.length > 0, 'plan.md must forward --review-single-pass-reason');

  forwarding.forEach(function (b) {
    assert.ok(b.includes('--review-single-pass-bypassed-verdict'),
      'the two flags go together — forwarding one alone is rejected by the schema ' +
      'invariant, so the receipt would simply not be written');
    assert.match(b, /single_pass_reason/,
      'the value must come from decision.json (the APPLIED relaxation), never re-derived ' +
      'from env (which only says the toggle was SET)');
    assert.match(b, /\[\s*-n\s+"\$SINGLE_PASS_REASON"\s*\]/,
      'the forward must be gated on a non-empty value, matching the [ -n … ] idiom ' +
      'used throughout this block');
  });
});

test('plan.md appends a dispatch-log line at the L2 launch point', () => {
  const blocks = bashBlocks(read('plan.md'));
  const pinBlock = blocks.filter(function (b) {
    return b.includes('mark-debt') && b.includes('dispatch-log-');
  });
  assert.ok(pinBlock.length > 0,
    'the dispatch log must be appended where the panel actually fires (beside the ' +
    'debt marker), not on a post-return path that may never execute');
  const b = pinBlock[0];
  assert.match(b, /round_index/, 'each entry carries its round index');
  assert.match(b, /reviewed_plan_hash/, 'entries are keyed by plan hash, not by log length');
  assert.match(b, /appendFileSync/, 'the log is append-only');
});

test('the dispatch log is keyed with the PLAN-aware hash, not the raw markdown hash', () => {
  // The consumer (`assert-single-round`) compares these entries against the
  // Measurement block's `reviewed_plan_hash`, which record.js takes from the L2
  // emit — and that is `planAwareMarkdownHash`. `hash-markdown` is a DIFFERENT
  // function for anything under `.claude/plans/`, and the two agree only while
  // every structural normalization is a no-op. `hash-plan` is the subcommand that
  // exposes the same function the plan axis binds to. The equivalence itself is
  // pinned in review-single-pass.test.js; this guards the wiring.
  const blocks = bashBlocks(read('plan.md'));
  const pinBlock = blocks.filter(function (b) {
    return b.includes('mark-debt') && b.includes('dispatch-log-');
  })[0];
  assert.ok(pinBlock, 'dispatch-log block must exist');
  const hashLine = pinBlock.split('\n').filter(function (l) {
    return /DISPATCH_HASH=/.test(l);
  })[0];
  assert.ok(hashLine, 'the block must derive DISPATCH_HASH');
  assert.match(hashLine, /hash-plan/,
    'DISPATCH_HASH must come from `hash-plan` — the plan axis binds to the structural ' +
    'hash, so keying the ledger with the raw one makes a re-fire after a ticked ' +
    'checkbox read as a clean single round');
  assert.doesNotMatch(hashLine, /hash-markdown/,
    'hash-markdown is the raw canonicalization and must not key this ledger');
});

test('the dispatch-log block halts on its own failures instead of firing untraced', () => {
  // Every neighbouring step in this block guards (`mark-debt` calls PIN_HALT and
  // exits). Without the same guard here a failed hash writes `reviewed_plan_hash:
  // ""` and a failed append writes nothing at all — both surface much later as a
  // confusing assert-single-round failure rather than at the point of breakage.
  const blocks = bashBlocks(read('plan.md'));
  const pinBlock = blocks.filter(function (b) {
    return b.includes('mark-debt') && b.includes('dispatch-log-');
  })[0];
  const tail = pinBlock.slice(pinBlock.indexOf('DISPATCH_LOG='));
  assert.match(tail, /DISPATCH_HASH=[\s\S]*?\|\|\s*\{\s*PIN_HALT/,
    'a failed plan hash must halt, not continue with an empty one');
  assert.match(tail, /\[\s*-z\s+"\$DISPATCH_HASH"\s*\]/,
    'an empty hash must be rejected explicitly — it matches nothing and looks like a record');
  assert.match(tail, /"\$DISPATCH_HASH"\s*\\?\s*\n?\s*\|\|\s*\{\s*PIN_HALT/,
    'a failed append must halt — a panel firing with no ledger line is precisely what ' +
    'this log exists to make impossible');
});

test('plan.md forwards the valueless single-pass flag ahead of the valued one', () => {
  // parseFlags reads `--foo` as boolean true only when the next argv element
  // starts with `--`; otherwise it swallows that element as the flag's value and
  // write.js's `=== true` test declines to stamp. Putting the boolean first makes
  // its neighbour a `--` flag inside the pair, so correctness does not depend on
  // what a later block happens to append after it.
  const blocks = bashBlocks(read('plan.md'));
  const b = blocks.filter(function (x) {
    return x.includes('--review-single-pass-bypassed-verdict');
  })[0];
  assert.ok(b, 'plan.md must forward the bypass flag');
  assert.match(b, /--review-single-pass-bypassed-verdict[\s\S]{0,80}--review-single-pass-reason/,
    'the valueless flag must be followed by another `--` flag inside the same append');
});

test('the dispatch log is NOT in the Phase 5.2 purge list', () => {
  // Purging it would let a re-fire erase its own trace: R0 halts, R1 runs, the
  // purge drops R0's line, and one surviving round_index:0 entry plus a null
  // halt_stage reads as a clean single round. The measurement would then pass
  // precisely when it should fail.
  const blocks = bashBlocks(read('plan.md'));
  blocks.forEach(function (b) {
    if (!/^\s*rm -f /m.test(b)) return;
    const purgeLines = b.split('\n').filter(function (l) { return /rm -f/.test(l) || /^\s{6,}"\$REVIEW_DIR/.test(l); });
    purgeLines.forEach(function (l) {
      assert.doesNotMatch(l, /dispatch-log/,
        'dispatch-log-<slug>.jsonl is a ledger, not IPC — purging it disarms the ' +
        'UI5 re-fire assertion: ' + l.trim());
    });
  });
});

test('santa-loop.md documents the single-pass refusal', () => {
  const src = read('santa-loop.md');
  assert.match(src, /SANTA_SINGLE_PASS_ACTIVE/,
    'the operator must be able to tell a refusal from a usage error');
  assert.match(src, /MCCP_REVIEW_SINGLE_PASS/,
    'and must be told which variable to unset');
});

// ── review-loop-bypass M2 — 5.2g2 backlog capture wiring ─────────────────────
//
// 범위를 명시한다: plan.md는 실행 파일이 아니라 산문이므로 이 단언들은 **배선
// 누락과 drift만** 잡는다. 셸 인용 실수, 종료코드 미검사, 호출은 하되 결과를
// 무시하는 블록은 전부 통과한다. 실행 축은 다른 두 곳이 덮는다 — CLI의 동작은
// plan-review-backlog-append.test.js의 spawnSync 케이스가, 게이트가 실제로
// 멈추는지는 Acceptance의 "실패 경로를 실제로 발화시킨다" 항목이 담당한다.
// 세 축이 모두 있어야 DD1의 HALT가 증명되며, 어느 하나도 나머지를 대신하지 않는다.

function backlogBlock() {
  return bashBlocks(read('plan.md')).filter(function (b) {
    return b.includes('backlog-append');
  });
}

test('plan.md calls backlog-append from a fenced block', () => {
  const blocks = backlogBlock();
  assert.ok(blocks.length > 0,
    'the single-pass relaxation must mechanically capture the findings it drops — ' +
    'prose telling the author to append them by hand is what M1 already had');
});

test('the backlog capture is gated on the APPLIED relaxation, not on the env', () => {
  const b = backlogBlock()[0];
  assert.ok(b, 'backlog-append block must exist');
  assert.match(b, /single_pass_reason/,
    'the gate must read decision.json — the env only says the toggle was SET, ' +
    'while decision.single_pass_reason says a bypass actually happened');
  // The env name legitimately appears in the failure branch's recovery advice
  // ("unset MCCP_REVIEW_SINGLE_PASS"). What must not happen is the env being
  // READ as the condition — that is the two-sources-for-one-fact shape behind
  // the v1.22.3 round-4 defect. So the assertion targets executable lines only,
  // not the operator-facing echo text.
  const executable = b.split('\n').filter(function (l) {
    return !/^\s*#/.test(l) && !/^\s*echo\b/.test(l);
  }).join('\n');
  assert.doesNotMatch(executable, /\$\{?MCCP_REVIEW_SINGLE_PASS/,
    're-deriving the condition from env is the shape that produced the v1.22.3 ' +
    'round-4 defect: two sources for one fact');
});

test('the capture failure branch records stage 5.2g2 and then exits', () => {
  const b = backlogBlock()[0];
  assert.ok(b, 'backlog-append block must exist');
  assert.match(b, /--halt-stage 5\.2g2/,
    'a stop with no recorded stage is a stop the measurement cannot see');
  assert.match(b, /\bexit\s+\d+/,
    'the recorder is non-blocking (|| true), so it must never be the last statement ' +
    'on a failure path — the block would exit 0 and a failed capture would read as a pass');
  const idx = b.indexOf('--halt-stage 5.2g2');
  assert.ok(/\bexit\s+\d+/.test(b.slice(idx)),
    'the exit must follow the recorder, not precede it');
});

test('5.2g2 sits between 5.2g and 5.2h in document order', () => {
  // Position is contract, not layout. Before 5.2g the proof is unverified, so the
  // ledger would take findings from a run that never certified itself; after 5.2h
  // the record has already been written and could not carry `backlog_appended`,
  // which is the anchor assert-backlog-parity reads.
  const src = read('plan.md');
  const g = src.indexOf('#### 5.2g — ');
  const g2 = src.indexOf('#### 5.2g2 — ');
  const h = src.indexOf('#### 5.2h — ');
  assert.ok(g > -1 && g2 > -1 && h > -1, 'all three sections must exist');
  assert.ok(g < g2 && g2 < h,
    'a token-only assertion would pass with the block in the wrong phase');
});

test('the HALT stage catalog lists 5.2g2', () => {
  const src = read('plan.md');
  assert.match(src, /5\.2e-proof\|5\.2f\|5\.2g\|5\.2g2/,
    'the recorder contract says that list is the COMPLETE set of HALTs in 5.2 — ' +
    'a stop missing from it makes the claim wider than the wiring');
});
