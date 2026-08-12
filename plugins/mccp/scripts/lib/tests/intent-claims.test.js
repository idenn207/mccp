'use strict';

const test = require('node:test');
const assert = require('node:assert');

const icl = require('../intent-claims');

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const SECTION_ITEMS = [{ id: 'UI1' }, { id: 'UI2' }, { id: 'UI3' }];

function finding(body, extra) {
  return Object.assign({
    severity: 'HIGH',
    title: 'a finding title',
    body: body,
    recommendation: 'do the thing',
  }, extra || {});
}

function parse(bodies, items) {
  return icl.parseReviewerClaims({
    findings: bodies.map(function (b) { return finding(b); }),
    sectionItems: items || SECTION_ITEMS,
  });
}

function firstClaim(body, items) {
  return parse([body], items).claims[0];
}

function adj(index, conflict, dispute) {
  const o = { finding_index: index, intent_conflict: conflict };
  if (dispute !== undefined) o.intent_dispute_reason = dispute;
  return o;
}

// ---------------------------------------------------------------------------
// (a) 앵커 없는 산문은 주장이 아니다 — 오탐 0
// ---------------------------------------------------------------------------

test('(a) prose mentioning UI3 without a line anchor is not a claim', function () {
  const c = firstClaim('this proposal has a UI3 conflict in my reading, see INTENT: inline too');
  assert.strictEqual(c.status, 'unclaimed');
  assert.strictEqual(c.claim, null);
  assert.strictEqual(c.reason, 'no-anchor');
});

// ---------------------------------------------------------------------------
// (b) 정상 파싱
// ---------------------------------------------------------------------------

test('(b) INTENT: none parses as an explicit first-class answer', function () {
  const c = firstClaim(['some analysis text', 'INTENT: none'].join('\n'));
  assert.strictEqual(c.status, 'claimed');
  assert.strictEqual(c.claim, 'none');
});

test('(b) INTENT: UI3 parses as a single id claim', function () {
  const c = firstClaim(['some analysis text', 'INTENT: UI3'].join('\n'));
  assert.strictEqual(c.status, 'claimed');
  assert.strictEqual(c.claim, 'UI3');
});

test('(b) up to three leading spaces still anchors', function () {
  const c = firstClaim(['text', '   INTENT: UI2'].join('\n'));
  assert.strictEqual(c.claim, 'UI2');
});

// ---------------------------------------------------------------------------
// (c) 인용 구조 5종 안의 주장은 매칭되지 않는다 — 자기참조 인용 벡터 차단
// ---------------------------------------------------------------------------

const QUOTE_FORMS = {
  'backtick fence': ['```', 'INTENT: UI3', '```'],
  'tilde fence': ['~~~', 'INTENT: UI3', '~~~'],
  'four-space indent': ['    INTENT: UI3'],
  'blockquote': ['> INTENT: UI3'],
  'html pre block': ['<pre>', 'INTENT: UI3', '</pre>'],
};

Object.keys(QUOTE_FORMS).forEach(function (name) {
  test('(c) INTENT inside a ' + name + ' is not a claim', function () {
    const c = firstClaim(['quoting an earlier review:'].concat(QUOTE_FORMS[name]).join('\n'));
    assert.strictEqual(c.status, 'unclaimed', name + ' leaked a claim');
    assert.strictEqual(c.reason, 'no-anchor');
  });
});

test('(c) fenced block with an info string is still stripped', function () {
  const c = firstClaim(['```markdown', 'INTENT: UI1', '```'].join('\n'));
  assert.strictEqual(c.status, 'unclaimed');
});

test('(c) a longer closing fence closes the block', function () {
  const c = firstClaim(['````', 'INTENT: UI1', '````'].join('\n'));
  assert.strictEqual(c.status, 'unclaimed');
});

test('(c) a tilde fence is not closed by a backtick fence', function () {
  // 여는 fence와 다른 문자로는 닫히지 않으므로 뒤따르는 주장도 함께 삼켜진다.
  const c = firstClaim(['~~~', 'INTENT: UI1', '```', 'INTENT: UI2'].join('\n'));
  assert.strictEqual(c.status, 'unclaimed');
});

// ---------------------------------------------------------------------------
// (d) stripper가 놓쳐도 fail-closed — 진짜 주장 1건 + 살아남은 인용 1건 = 2건
// ---------------------------------------------------------------------------

test('(d) a missed quote next to a real claim folds to unclaimed, not to the first line', function () {
  const c = firstClaim([
    'the previous reviewer wrote:',
    'INTENT: UI1',
    'but I disagree; my own verdict follows.',
    'INTENT: UI2',
  ].join('\n'));
  assert.strictEqual(c.status, 'unclaimed');
  assert.strictEqual(c.reason, 'multiple-anchors');
  assert.strictEqual(c.claim, null);
});

// ---------------------------------------------------------------------------
// (e) 앵커 2건 이상 → unclaimed (첫 줄을 고르지 않는다)
// ---------------------------------------------------------------------------

test('(e) two anchors never resolve to the first one', function () {
  const c = firstClaim(['INTENT: UI1', 'INTENT: none'].join('\n'));
  assert.strictEqual(c.reason, 'multiple-anchors');
});

test('(e) anchors spread across title/body/recommendation still count together', function () {
  // 필드별 독립 주장을 허용하면 "정확히 1건" 규칙이 성립하지 않는다.
  const parsed = icl.parseReviewerClaims({
    findings: [{ title: 'INTENT: UI1', body: 'text', recommendation: 'INTENT: UI2' }],
    sectionItems: SECTION_ITEMS,
  });
  assert.strictEqual(parsed.claims[0].reason, 'multiple-anchors');
});

// ---------------------------------------------------------------------------
// (f) 콤마 목록 / (g) dangling id / (h) 상한 초과
// ---------------------------------------------------------------------------

test('(f) a comma list is not a claim', function () {
  const c = firstClaim('INTENT: UI3, UI7');
  assert.strictEqual(c.status, 'unclaimed');
  assert.strictEqual(c.reason, 'comma-list');
});

test('(g) a dangling id folds to unclaimed, NOT to none', function () {
  const c = firstClaim('INTENT: UI99');
  assert.strictEqual(c.status, 'unclaimed');
  assert.strictEqual(c.reason, 'unknown-id');
  assert.notStrictEqual(c.claim, 'none');
});

test('(g) a malformed token folds to unclaimed', function () {
  assert.strictEqual(firstClaim('INTENT: maybe').reason, 'bad-token');
  assert.strictEqual(firstClaim('INTENT: ui3').reason, 'bad-token');
});

test('(h) scan text above the cap folds to unclaimed', function () {
  const big = 'x'.repeat(icl.MAX_CLAIM_SCAN_CHARS + 1);
  const c = firstClaim([big, 'INTENT: UI1'].join('\n'));
  assert.strictEqual(c.status, 'unclaimed');
  assert.strictEqual(c.reason, 'text-too-large');
});

test('(h) non-string fields are coerced to empty, never to [object Object]', function () {
  const parsed = icl.parseReviewerClaims({
    findings: [{ title: { nested: 'INTENT: UI1' }, body: null, recommendation: 'INTENT: UI2' }],
    sectionItems: SECTION_ITEMS,
  });
  assert.strictEqual(parsed.claims[0].claim, 'UI2');
});

// ---------------------------------------------------------------------------
// (i) DD3 6종 분류
// ---------------------------------------------------------------------------

function compareOne(reviewerBody, authorConflict) {
  const parsed = parse([reviewerBody]);
  return icl.compareIntentClaims({
    claims: parsed,
    adjudications: [adj(0, authorConflict)],
  });
}

test('(i) agree-none', function () {
  assert.strictEqual(compareOne('INTENT: none', 'none').entries[0].classification, 'agree-none');
});

test('(i) agree-conflict', function () {
  assert.strictEqual(compareOne('INTENT: UI2', 'UI2').entries[0].classification, 'agree-conflict');
});

test('(i) id-mismatch', function () {
  assert.strictEqual(compareOne('INTENT: UI2', 'UI3').entries[0].classification, 'id-mismatch');
});

test('(i) reviewer-only', function () {
  assert.strictEqual(compareOne('INTENT: UI2', 'none').entries[0].classification, 'reviewer-only');
});

test('(i) author-only', function () {
  assert.strictEqual(compareOne('INTENT: none', 'UI2').entries[0].classification, 'author-only');
});

test('(i) unclaimed dominates whatever the author said', function () {
  assert.strictEqual(compareOne('no anchor here', 'UI2').entries[0].classification, 'unclaimed');
});

// ---------------------------------------------------------------------------
// (j) id-mismatch가 blocking 후보 / (k) author-only는 아니다
// ---------------------------------------------------------------------------

test('(j) id-mismatch lands in needsResponse — label asymmetry is actually detected', function () {
  const r = compareOne('INTENT: UI2', 'UI3');
  assert.strictEqual(r.needsResponse.length, 1);
  assert.strictEqual(r.needsResponse[0].classification, 'id-mismatch');
});

test('(j) reviewer-only lands in needsResponse', function () {
  assert.strictEqual(compareOne('INTENT: UI2', 'none').needsResponse.length, 1);
});

test('(k) author-only never needs a response — over-labelling is the safe direction', function () {
  const r = compareOne('INTENT: none', 'UI2');
  assert.strictEqual(r.needsResponse.length, 0);
  assert.strictEqual(r.counts.author_only, 1);
});

test('(k) agree-* never needs a response', function () {
  assert.strictEqual(compareOne('INTENT: none', 'none').needsResponse.length, 0);
  assert.strictEqual(compareOne('INTENT: UI2', 'UI2').needsResponse.length, 0);
});

// ---------------------------------------------------------------------------
// (l) claimed/total 계측이 1/20과 19/20을 구분한다
// ---------------------------------------------------------------------------

function nBodies(total, claimedCount) {
  const out = [];
  for (let i = 0; i < total; i++) {
    out.push(i < claimedCount ? 'INTENT: none' : 'no claim at all here');
  }
  return out;
}

test('(l) 1/20 and 19/20 are distinguishable and BOTH are partial', function () {
  const low = parse(nBodies(20, 1));
  const high = parse(nBodies(20, 19));
  assert.strictEqual(low.claimed, 1);
  assert.strictEqual(high.claimed, 19);

  const lowCmp = icl.compareIntentClaims({ claims: low, adjudications: [] });
  const highCmp = icl.compareIntentClaims({ claims: high, adjudications: [] });
  assert.strictEqual(lowCmp.compliance, 'partial');
  assert.strictEqual(highCmp.compliance, 'partial');
  assert.strictEqual(lowCmp.counts.claimed, 1);
  assert.strictEqual(highCmp.counts.claimed, 19);
});

test('(l) compliance is full only when every finding carries a valid claim', function () {
  const all = icl.compareIntentClaims({ claims: parse(nBodies(5, 5)), adjudications: [] });
  assert.strictEqual(all.compliance, 'full');
  const none = icl.compareIntentClaims({ claims: parse(nBodies(5, 0)), adjudications: [] });
  assert.strictEqual(none.compliance, 'absent');
});

test('(l) zero findings is absent, never full', function () {
  const r = icl.compareIntentClaims({ claims: parse([]), adjudications: [] });
  assert.strictEqual(r.compliance, 'absent');
});

// ---------------------------------------------------------------------------
// counts 합계 불변식 (schema가 같은 식을 검증한다 — Task 7)
// ---------------------------------------------------------------------------

test('the six classifications partition the findings exactly', function () {
  const bodies = [
    'INTENT: none', 'INTENT: UI2', 'INTENT: UI2', 'INTENT: UI2', 'INTENT: none', 'no anchor',
  ];
  const r = icl.compareIntentClaims({
    claims: parse(bodies),
    adjudications: [
      adj(0, 'none'), adj(1, 'UI2'), adj(2, 'UI3'), adj(3, 'none'), adj(4, 'UI1'), adj(5, 'none'),
    ],
  });
  assert.strictEqual(r.counts.agree_none, 1);
  assert.strictEqual(r.counts.agree_conflict, 1);
  assert.strictEqual(r.counts.id_mismatch, 1);
  assert.strictEqual(r.counts.reviewer_only, 1);
  assert.strictEqual(r.counts.author_only, 1);
  assert.strictEqual(r.counts.unclaimed, 1);
  assert.ok(icl.claimCountsInvariantOk(r.counts));
});

test('the invariant rejects a tampered counts object', function () {
  const r = icl.compareIntentClaims({ claims: parse(['INTENT: none']), adjudications: [adj(0, 'none')] });
  assert.ok(icl.claimCountsInvariantOk(r.counts));
  const bad = Object.assign({}, r.counts, { agree_none: 5 });
  assert.strictEqual(icl.claimCountsInvariantOk(bad), false);
});

test('reviewer_conflict and author_conflict are cross-cuts, not part of the partition', function () {
  const r = icl.compareIntentClaims({
    claims: parse(['INTENT: UI2']),
    adjudications: [adj(0, 'UI3')],
  });
  assert.strictEqual(r.counts.reviewer_conflict, 1);
  assert.strictEqual(r.counts.author_conflict, 1);
  assert.ok(icl.claimCountsInvariantOk(r.counts));
});

// ---------------------------------------------------------------------------
// dispute 텍스트는 대조 결과에 그대로 실려 나간다 (판정은 오라클 소유)
// ---------------------------------------------------------------------------

test('dispute_reason rides along on the entry without being judged here', function () {
  const r = icl.compareIntentClaims({
    claims: parse(['INTENT: UI2']),
    adjudications: [adj(0, 'none', 'the reviewer misread the module boundary here')],
  });
  assert.strictEqual(r.needsResponse[0].dispute_reason,
    'the reviewer misread the module boundary here');
});

test('a missing adjudication entry reads as author-said-nothing', function () {
  const r = icl.compareIntentClaims({ claims: parse(['INTENT: UI2']), adjudications: [] });
  assert.strictEqual(r.entries[0].classification, 'reviewer-only');
  assert.strictEqual(r.entries[0].author_conflict, null);
});

// ---------------------------------------------------------------------------
// purity
// ---------------------------------------------------------------------------

test('the module reads no filesystem and no environment', function () {
  const src = require('fs').readFileSync(require.resolve('../intent-claims'), 'utf8');
  assert.ok(!/require\(['"]fs['"]\)/.test(src), 'intent-claims must not require fs');
  assert.ok(!/process\.env/.test(src), 'intent-claims must not read process.env');
});

// ── the shipped contract must describe the parser that reads it ──────────────
//
// The reviewer only ever sees INTENT_MISLABEL_CONTRACT. If that text promises
// behaviour the parser does not have, a reviewer can follow the contract exactly
// and still be scored `unclaimed` — a failure it cannot diagnose or fix, which
// then reads as reviewer non-compliance and blocks the author instead.
const { INTENT_MISLABEL_CONTRACT } = require('../codex-invoke');

test('the contract does not promise that quoted INTENT lines are counted', function () {
  const ids = [{ id: 'UI1' }];
  const quoted = [
    { title: 't', body: '> INTENT: UI1', recommendation: '' },
    { title: 't', body: '```\nINTENT: UI1\n```', recommendation: '' },
    { title: 't', body: '    INTENT: UI1', recommendation: '' },
    { title: 't', body: '<blockquote>\nINTENT: UI1\n</blockquote>', recommendation: '' },
  ];
  const r = icl.parseReviewerClaims({ findings: quoted, sectionItems: ids });
  assert.strictEqual(r.claimed, 0, 'every quote form is stripped before the scan');
  r.claims.forEach(function (c) {
    assert.strictEqual(c.status, 'unclaimed');
    assert.strictEqual(c.claim, null);
  });

  // …so the prompt must say so. The old wording ("a quoted line is also
  // counted") described the opposite behaviour.
  assert.ok(INTENT_MISLABEL_CONTRACT.indexOf('세어지지 않고') !== -1,
    'the contract must state that quoted lines are NOT counted');
  assert.ok(INTENT_MISLABEL_CONTRACT.indexOf('인용문 안의 이 줄도 세어집니다') === -1,
    'the contract must not carry the old promise that quoted lines count');
});

test('an unquoted claim beside a quoted one still resolves to the real claim', function () {
  // The stripper exists so a finding whose ONLY `INTENT:` line is an example
  // does not become a false claim. It must not eat the genuine line next to it.
  const r = icl.parseReviewerClaims({
    findings: [{
      title: 'x',
      body: 'Example from another finding:\n\n```\nINTENT: UI9\n```\n\nINTENT: UI1',
      recommendation: '',
    }],
    sectionItems: [{ id: 'UI1' }],
  });
  assert.strictEqual(r.claims[0].status, 'claimed');
  assert.strictEqual(r.claims[0].claim, 'UI1');
});

// ── indentation is measured in columns, not characters ───────────────────────

test('a space+tab indented line is code, not a claim', function () {
  // Markdown advances a tab to the next 4-column tab stop, so " \t" is a
  // 4-column indent — an indented code block. A character-counting stripper
  // (`/^(?: {4,}|\t)/`) misses it, and then the anchor regex accepts it because
  // it tolerates leading whitespace.
  const mixed = [
    ' \tINTENT: UI1',
    '  \tINTENT: UI1',
    '   \tINTENT: UI1',
    '\t INTENT: UI1',
  ];
  mixed.forEach(function (line) {
    const r = icl.parseReviewerClaims({
      findings: [{ title: 'x', body: 'Example:\n\n' + line, recommendation: '' }],
      sectionItems: [{ id: 'UI1' }],
    });
    assert.strictEqual(r.claims[0].status, 'unclaimed',
      JSON.stringify(line) + ' expands to >=4 columns and must be stripped');
  });
});

test('a quoted "none" cannot manufacture an agreement out of an example', function () {
  // The damaging direction: an example line becomes the finding's ONLY claim, so
  // a finding the reviewer never labelled reads as agreeing with the author.
  const cmp = icl.compareIntentClaims({
    claims: icl.parseReviewerClaims({
      findings: [{ title: 'x', body: 'For instance:\n\n \tINTENT: none', recommendation: '' }],
      sectionItems: [{ id: 'UI1' }],
    }),
    adjudications: [{ finding_index: 0, intent_conflict: 'none' }],
  });
  assert.strictEqual(cmp.entries[0].classification, 'unclaimed');
  assert.notStrictEqual(cmp.compliance, 'full',
    'a fabricated agreement must not read as reviewer compliance');
});

test('indents below 4 columns stay claimable (markdown lists, not code)', function () {
  ['INTENT: UI1', ' INTENT: UI1', '  INTENT: UI1', '   INTENT: UI1'].forEach(function (line) {
    const r = icl.parseReviewerClaims({
      findings: [{ title: 'x', body: line, recommendation: '' }],
      sectionItems: [{ id: 'UI1' }],
    });
    assert.strictEqual(r.claims[0].claim, 'UI1', JSON.stringify(line) + ' is not code');
  });
});

test('the scan bound is characters, and multibyte text does not shorten it', function () {
  // The cap exists to bound regex work over reviewer-controlled text, and that
  // work tracks code units. Measuring UTF-8 bytes instead would make identical
  // scan cost pass or fail based on the reviewer's language.
  const ids = [{ id: 'UI1' }];
  const korean = '가'.repeat(30000) + '\nINTENT: none';
  assert.ok(Buffer.byteLength(korean, 'utf8') > icl.MAX_CLAIM_SCAN_CHARS,
    'fixture must exceed the cap in BYTES to be meaningful');
  assert.ok(korean.length < icl.MAX_CLAIM_SCAN_CHARS, 'but stay under it in characters');
  assert.strictEqual(
    icl.parseReviewerClaims({ findings: [{ title: '', body: korean, recommendation: '' }], sectionItems: ids })
      .claims[0].status,
    'claimed', 'under the character cap, a valid claim is still read');

  const over = 'x'.repeat(icl.MAX_CLAIM_SCAN_CHARS + 1) + '\nINTENT: none';
  assert.strictEqual(
    icl.parseReviewerClaims({ findings: [{ title: '', body: over, recommendation: '' }], sectionItems: ids })
      .claims[0].reason,
    'text-too-large', 'over the character cap, it folds to unclaimed');
});

// ── unclosed / lazy quote structures ─────────────────────────────────────────
//
// The stripper cannot be complete, and the design says so. But it must at least
// assume ONE markdown: the fence machine already swallows an unclosed fence to
// the end of the text, so HTML blocks and blockquotes reading the same input
// differently is an internal inconsistency, not an accepted residual. Every case
// here produced `claimed none` before the fix — a finding the reviewer never
// labelled, reading as agreement with the author.

test('an unclosed HTML quote block swallows to the end, like an unclosed fence', function () {
  const ids = [{ id: 'UI1' }];
  ['<pre>', '<code>', '<blockquote>', '<PRE class="x">'].forEach(function (open) {
    const r = icl.parseReviewerClaims({
      findings: [{ title: 't', body: open + '\nINTENT: none', recommendation: '' }],
      sectionItems: ids,
    });
    assert.strictEqual(r.claims[0].status, 'unclaimed', open + ' is never closed');
  });

  // …while a well-formed block still only removes itself, leaving a real claim
  // after it readable.
  const kept = icl.parseReviewerClaims({
    findings: [{ title: 't', body: '<pre>\nINTENT: UI9\n</pre>\n\nINTENT: UI1', recommendation: '' }],
    sectionItems: ids,
  });
  assert.strictEqual(kept.claims[0].claim, 'UI1');
});

test('a lazy blockquote continuation is still inside the quote', function () {
  const ids = [{ id: 'UI1' }];
  const r = icl.parseReviewerClaims({
    findings: [{ title: 't', body: '> quoted context\nINTENT: none', recommendation: '' }],
    sectionItems: ids,
  });
  assert.strictEqual(r.claims[0].status, 'unclaimed',
    'CommonMark keeps the second line in the quote until a blank line ends it');

  // A blank line ends the quote, so a claim after it is the reviewer's own.
  const after = icl.parseReviewerClaims({
    findings: [{ title: 't', body: '> quoted context\n\nINTENT: UI1', recommendation: '' }],
    sectionItems: ids,
  });
  assert.strictEqual(after.claims[0].claim, 'UI1');
});

test('quoted text cannot manufacture agreement through any of these forms', function () {
  const bodies = ['<pre>\nINTENT: none', '> ctx\nINTENT: none', ' \tINTENT: none'];
  bodies.forEach(function (body) {
    const cmp = icl.compareIntentClaims({
      claims: icl.parseReviewerClaims({
        findings: [{ title: 't', body: body, recommendation: '' }],
        sectionItems: [{ id: 'UI1' }],
      }),
      adjudications: [{ finding_index: 0, intent_conflict: 'none' }],
    });
    assert.strictEqual(cmp.entries[0].classification, 'unclaimed', JSON.stringify(body));
    assert.notStrictEqual(cmp.compliance, 'full', JSON.stringify(body));
  });
});
