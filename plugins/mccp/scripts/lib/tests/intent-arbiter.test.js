'use strict';

// codex-intent-context M2 — 심판 분리(DD1)와 강등 봉인(DD5)의 불변식.
//
// 이 파일이 지키는 명제는 "심판이 옳아진다"가 아니라 **"심판이 저자의 근거를 볼 수
// 없다"** 이다. 그 명제는 두 지점에서만 깨질 수 있다: (1) projection이 저자 근거나
// 그 위치를 실어 보내거나, (2) arbiter가 파일을 여는 도구를 되찾거나. 아래 (b)(c)(f)가
// 각각을 고정한다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ia = require('../intent-arbiter');

const AGENT_MD = path.join(__dirname, '..', '..', '..', 'agents', 'intent-arbiter.md');

// awaiting 아티팩트의 실제 형태(plan-codex-runner.js:403-429)를 그대로 흉내낸다.
// 여기에 심는 `plan_path`·`decision_id`·`run_nonce`·`claims_digest`는 runner가
// 진짜로 싣는 필드들이고, `zz_future`는 "나중에 누가 추가할 필드"의 자리다.
function awaitingFixture(extra) {
  return Object.assign({
    run_nonce: 'nonce-abc',
    decision_id: 'some-decision',
    plan_path: '.claude/plans/some-feature.plan.md',
    review_payload_digest: 'sha256:deadbeef',
    mislabel_mode: 'enforce',
    // The required mode rides in the artifact so 5.5a can recover it (the shell
    // variable does not survive across tool calls). It must NOT ride onward to the
    // arbiter, which has no business knowing whether it was the first choice.
    arbiter_mode: 'subagent',
    claims_digest: 'sha256:cafe',
    reviewer_contract: 'full',
    intent_items: [
      { id: 'UI1', text: 'the judge must not be the author', kind: 'direction' },
      { id: 'UI2', text: 'do not replace the reviewer itself', kind: 'exclusion' },
    ],
    findings: [
      {
        finding_index: 0,
        finding_digest: 'sha256:f0',
        reviewer_claim: 'UI1',
        reviewer_claim_status: 'claimed',
        reviewer_claim_reason: null,
        finding: { severity: 'HIGH', title: 'a title', body: 'a body', recommendation: 'do it' },
      },
    ],
    adjudication_path: '/tmp/gitdir/mccp/tmp/intent-adjudication-nonce-abc.json',
    zz_future: 'a field nobody has added yet',
  }, extra || {});
}

// ---------------------------------------------------------------------------
// (a) 모드 파싱
// ---------------------------------------------------------------------------

test('(a) an unset mode defaults to subagent, silently', function () {
  const warnings = [];
  assert.strictEqual(ia.parseArbiterMode({}, function (w) { warnings.push(w); }), 'subagent');
  assert.strictEqual(ia.parseArbiterMode({ MCCP_INTENT_ARBITER: '   ' }, function (w) { warnings.push(w); }), 'subagent');
  assert.deepStrictEqual(warnings, [], 'an unset toggle is not a mistake and must not warn');
});

test('(a) both modes parse, case-insensitively', function () {
  assert.strictEqual(ia.parseArbiterMode({ MCCP_INTENT_ARBITER: 'subagent' }), 'subagent');
  assert.strictEqual(ia.parseArbiterMode({ MCCP_INTENT_ARBITER: 'AUTHOR' }), 'author');
});

test('(a) a typo falls back to subagent and says so out loud', function () {
  const warnings = [];
  assert.strictEqual(
    ia.parseArbiterMode({ MCCP_INTENT_ARBITER: 'subagnet' }, function (w) { warnings.push(w); }),
    'subagent');
  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0], /subagnet/);
});

test('(a) "off" is not a mode — it falls back loudly, it does not disable the axis', function () {
  // Silently honouring `off` would let one word turn the separation off with no
  // trace anywhere. Asking for no arbiter is spelled `author`, and that spelling
  // is recorded in the receipt.
  const warnings = [];
  assert.strictEqual(
    ia.parseArbiterMode({ MCCP_INTENT_ARBITER: 'off' }, function (w) { warnings.push(w); }),
    'subagent');
  assert.strictEqual(warnings.length, 1);
});

// ---------------------------------------------------------------------------
// (b) projection whitelist — 최상위와 중첩 양쪽
// ---------------------------------------------------------------------------

test('(b) the projection keys are EXACTLY the whitelist, not a superset', function () {
  const p = ia.buildArbiterProjection(awaitingFixture());
  assert.deepStrictEqual(Object.keys(p).sort(), ia.ARBITER_PROJECTION_KEYS.slice().sort(),
    'equality, not containment — a subset assertion passes while plan_path rides along');
});

test('(b) every runner field outside the whitelist is absent, including a future one', function () {
  const p = ia.buildArbiterProjection(awaitingFixture());
  ['plan_path', 'decision_id', 'run_nonce', 'claims_digest', 'mislabel_mode',
    'arbiter_mode', 'reviewer_contract', 'zz_future'].forEach(function (k) {
    assert.ok(!Object.prototype.hasOwnProperty.call(p, k), k + ' leaked into the projection');
  });
});

test('(b) findings items are whitelisted too, not copied wholesale', function () {
  // Checking only the top level lets an implementation copy the awaiting finding
  // entry verbatim and still pass — `reviewer_claim_reason` and anything added
  // later would ride along inside it.
  const p = ia.buildArbiterProjection(awaitingFixture());
  assert.strictEqual(p.findings.length, 1);
  assert.deepStrictEqual(Object.keys(p.findings[0]).sort(), ia.ARBITER_FINDING_KEYS.slice().sort());
  assert.ok(!Object.prototype.hasOwnProperty.call(p.findings[0], 'reviewer_claim_reason'));
});

test('(b) the finding body itself is passed through unfiltered — it is the subject', function () {
  const p = ia.buildArbiterProjection(awaitingFixture());
  assert.deepStrictEqual(p.findings[0].finding,
    { severity: 'HIGH', title: 'a title', body: 'a body', recommendation: 'do it' });
});

test('(b) intent items are whitelisted, so a widened item shape cannot become a channel', function () {
  const wide = awaitingFixture({
    intent_items: [{
      id: 'UI1', text: 'the judge must not be the author', kind: 'direction',
      source_path: '.claude/plans/some-feature.plan.md',
      row: { file: 'plan.md', line: 22 },
    }],
  });
  const p = ia.buildArbiterProjection(wide);
  assert.deepStrictEqual(Object.keys(p.intent_items[0]).sort(),
    ia.ARBITER_INTENT_ITEM_KEYS.slice().sort());
  assert.ok(!Object.prototype.hasOwnProperty.call(p.intent_items[0], 'source_path'));
});

test('(b) a malformed or empty awaiting artifact still projects the exact key set', function () {
  [null, undefined, {}, [], 'nope', 42].forEach(function (bad) {
    const p = ia.buildArbiterProjection(bad);
    assert.deepStrictEqual(Object.keys(p).sort(), ia.ARBITER_PROJECTION_KEYS.slice().sort(),
      JSON.stringify(bad));
    assert.deepStrictEqual(p.findings, []);
    assert.deepStrictEqual(p.intent_items, []);
  });
});

// ---------------------------------------------------------------------------
// (c) 경로 누출 0 — projection과 프롬프트 문자열 양쪽
// ---------------------------------------------------------------------------

const LEAK_PATTERNS = [
  [/\.plan\.md/, 'a plan filename'],
  [/\.claude[/\\]plans/, 'the plans directory'],
  [/Design Decisions/, 'the section that holds the author rationale'],
  [/## Summary/, 'the section that holds the author framing'],
];

test('(c) the projection carries no path to, or name of, the author rationale', function () {
  const serialized = JSON.stringify(ia.buildArbiterProjection(awaitingFixture()));
  LEAK_PATTERNS.forEach(function (pair) {
    assert.doesNotMatch(serialized, pair[0], 'projection leaked ' + pair[1]);
  });
});

test('(c) the prompt the arbiter actually receives carries none of it either', function () {
  // The projection is only half the surface: the prompt template is the other,
  // and a template that names the sections by name would hand over the anchoring
  // hint even with a clean projection.
  const projection = ia.buildArbiterProjection(awaitingFixture());
  const prompt = ia.buildArbiterTaskPrompt({
    projection: projection,
    adjudicationPath: projection.adjudication_path,
  });
  LEAK_PATTERNS.forEach(function (pair) {
    assert.doesNotMatch(prompt, pair[0], 'prompt leaked ' + pair[1]);
  });
});

test('(c) the prompt still carries everything the M1 binding requires', function () {
  // The mirror image of the leak check: a projection that leaks nothing because
  // it carries nothing produces an adjudication that M1 rejects, and the gate
  // fails closed for the wrong reason.
  const projection = ia.buildArbiterProjection(awaitingFixture());
  const prompt = ia.buildArbiterTaskPrompt({
    projection: projection,
    adjudicationPath: projection.adjudication_path,
  });
  assert.match(prompt, /sha256:deadbeef/, 'review_payload_digest must reach the arbiter');
  assert.match(prompt, /sha256:f0/, 'per-finding finding_digest must reach the arbiter');
  assert.match(prompt, /"finding_index": 0/, 'finding_index must reach the arbiter');
  assert.match(prompt, /UI1/, 'the constraint ids must reach the arbiter');
  assert.match(prompt, /intent-adjudication-nonce-abc\.json/, 'it has to know where to write');
});

// ---------------------------------------------------------------------------
// (d) 프롬프트 결정성
// ---------------------------------------------------------------------------

test('(d) the same input yields a byte-identical prompt', function () {
  const a = ia.buildArbiterTaskPrompt({
    projection: ia.buildArbiterProjection(awaitingFixture()), adjudicationPath: '/x/y.json',
  });
  const b = ia.buildArbiterTaskPrompt({
    projection: ia.buildArbiterProjection(awaitingFixture()), adjudicationPath: '/x/y.json',
  });
  assert.strictEqual(a, b);
});

test('(d) an absent adjudicationPath argument falls back to the projected one', function () {
  // Without the fallback `adjudication_path` sits in the whitelist and never reaches
  // the prompt — a dead key under a comment that calls the whitelist "everything the
  // arbiter receives". Worse, an empty argument would tell the arbiter to write to
  // nowhere, and the runner would then wait out its timeout for a file no one wrote.
  const projection = ia.buildArbiterProjection(awaitingFixture());
  ['', undefined, null, 42].forEach(function (bad) {
    const prompt = ia.buildArbiterTaskPrompt({ projection: projection, adjudicationPath: bad });
    assert.match(prompt, /adjudication_path: \/tmp\/gitdir\/mccp\/tmp\/intent-adjudication-nonce-abc\.json/,
      'the runner-authored path is the fallback for ' + JSON.stringify(bad));
  });
});

test('(d) an explicit adjudicationPath still wins over the projected one', function () {
  const projection = ia.buildArbiterProjection(awaitingFixture());
  const prompt = ia.buildArbiterTaskPrompt({
    projection: projection, adjudicationPath: '/from/the/shell.json' });
  assert.match(prompt, /adjudication_path: \/from\/the\/shell\.json/);
  assert.doesNotMatch(prompt, /nonce-abc/);
});

test('(d) with neither, the prompt says empty rather than the string "null"', function () {
  // `null` reads as a path to the arbiter. Empty reads as missing, which is what it is.
  const prompt = ia.buildArbiterTaskPrompt({ projection: ia.buildArbiterProjection(null) });
  assert.match(prompt, /adjudication_path: \n/);
});

test('(d) the builder takes no awaiting path and no plan path — the signature is the rule', function () {
  const prompt = ia.buildArbiterTaskPrompt({
    projection: ia.buildArbiterProjection(awaitingFixture()),
    adjudicationPath: '/x/y.json',
    planPath: '.claude/plans/some-feature.plan.md',   // ignored: not a parameter
    awaitingPath: '/tmp/intent-awaiting-nonce-abc.json',
  });
  assert.doesNotMatch(prompt, /\.plan\.md/);
  assert.doesNotMatch(prompt, /intent-awaiting/);
});

// ---------------------------------------------------------------------------
// (e) resolveArbiterSeal — DD5 8·9번의 4조합
// ---------------------------------------------------------------------------

const DEGRADED = { from: 'subagent', to: 'author', reason: 'unknown-task-failure' };

test('(e) subagent + no degradation seals subagent', function () {
  assert.deepStrictEqual(ia.resolveArbiterSeal({ requiredMode: 'subagent', degraded: null }),
    { arbiter: 'subagent', reason: null, conflict: false });
});

test('(e) subagent + degradation seals author AND the reason', function () {
  assert.deepStrictEqual(ia.resolveArbiterSeal({ requiredMode: 'subagent', degraded: DEGRADED }),
    { arbiter: 'author', reason: 'unknown-task-failure', conflict: false });
});

test('(e) author + no degradation seals author with no reason', function () {
  // The reason is paired to an APPLIED degradation. Sealing one here would
  // document a fallback that never happened.
  assert.deepStrictEqual(ia.resolveArbiterSeal({ requiredMode: 'author', degraded: null }),
    { arbiter: 'author', reason: null, conflict: false });
});

test('(e) author + degradation is a contradiction, not a no-op', function () {
  // There is nothing to degrade FROM. Ignoring the flag would let the file claim
  // a history the sealed value denies, and both would pass.
  assert.deepStrictEqual(ia.resolveArbiterSeal({ requiredMode: 'author', degraded: DEGRADED }),
    { arbiter: null, reason: null, conflict: true });
});

test('(e) an unknown required mode resolves as subagent, never as author', function () {
  // Fail-closed direction: an unparsed mode must not silently become "no arbiter".
  assert.strictEqual(ia.resolveArbiterSeal({ requiredMode: 'nonsense' }).arbiter, 'subagent');
  assert.strictEqual(ia.resolveArbiterSeal({}).arbiter, 'subagent');
});

// ---------------------------------------------------------------------------
// (f) 도구 부재는 프롬프트 문구가 아니라 레지스트리로 보장된다
// ---------------------------------------------------------------------------

test('(f) the arbiter agent declares exactly one tool, and it is Write', function () {
  // DD1 rests entirely on this line. If `Read` comes back, the arbiter can pull
  // plan_path out of anything it is handed and open the author rationale — and
  // every other assertion in this file becomes decoration.
  const body = fs.readFileSync(AGENT_MD, 'utf8');
  const fm = body.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(fm, 'the agent file must have frontmatter');
  const tools = fm[1].match(/^tools:\s*\[(.*)\]\s*$/m);
  assert.ok(tools, 'tools must be declared as an inline list');
  const parsed = tools[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  assert.deepStrictEqual(parsed, ['Write']);
});

test('(f) the arbiter is registered under the name the command body dispatches', function () {
  const body = fs.readFileSync(AGENT_MD, 'utf8');
  assert.match(body, /^name:\s*intent-arbiter\s*$/m);
});

// ---------------------------------------------------------------------------
// 순수성 — 이 모듈은 fs도 process도 만지지 않는다
// ---------------------------------------------------------------------------

test('the oracle module reads no filesystem and no environment', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'intent-arbiter.js'), 'utf8');
  assert.doesNotMatch(src, /require\(['"]fs['"]\)/);
  assert.doesNotMatch(src, /require\(['"]child_process['"]\)/);
  assert.doesNotMatch(src, /process\.env/,
    'the mode arrives as an argument; reading env here would give the runner a ' +
    'second interpretation of the same axis');
});
