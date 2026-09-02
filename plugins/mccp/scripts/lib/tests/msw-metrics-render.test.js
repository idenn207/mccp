'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { renderMswMetrics } = require('../renderer/sections/msw-metrics');

// Mock formatUtils for HTML rendering
const mockFormatUtils = {
  escapeHtml: (str) => {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};

test('msw-metrics: graceful hide when metrics unavailable', async (t) => {
  // No metrics at all
  const result1 = renderMswMetrics({}, mockFormatUtils);
  assert.strictEqual(result1, null);

  // metrics null
  const result2 = renderMswMetrics({ metrics: null }, mockFormatUtils);
  assert.strictEqual(result2, null);

  // metrics undefined
  const result3 = renderMswMetrics({ metrics: undefined }, mockFormatUtils);
  assert.strictEqual(result3, null);
});

test('msw-metrics: graceful hide when nothing is measured yet', async (t) => {
  // Baseline not formed is genuinely nothing to say, so the section stays out
  // of the dashboard. Integrity violations are a different case -- see below.
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: null,
        denominator: null,
        value: null,
        status: 'insufficient',
        coverage: 'unknown',
      },
      B3: {
        id: 'B3',
        numerator: null,
        denominator: null,
        value: null,
        status: 'forward-only',
        coverage: 'unknown',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.strictEqual(result, null);
});

test('msw-metrics: an invalid metric is surfaced even with nothing computed', async (t) => {
  // This assertion used to say the opposite. Hiding `invalid` turns "the
  // measurement substrate is broken" into silence on the operator's dashboard,
  // which is the same confidently-wrong flattening M4 removed one layer down:
  // the metric refuses to publish a drifted denominator, and then the renderer
  // refuses to mention that it refused.
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: null,
        denominator: null,
        value: null,
        status: 'insufficient',
        coverage: 'unknown',
      },
      B3: {
        id: 'B3',
        numerator: null,
        denominator: null,
        value: null,
        status: 'invalid',
        invalid_reason: 'exclusion table drift',
        coverage: 'toggle-usage',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null,
    'a broken measurement substrate must reach the operator, not vanish');
});

test('msw-metrics: renders when at least one computed metric exists', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: 1,
        denominator: 2,
        value: 0.5,
        status: 'computed',
        coverage: 'session-activity',
      },
      A2: {
        id: 'A2',
        numerator: null,
        denominator: null,
        value: null,
        status: 'insufficient',
        coverage: 'unknown',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);
  assert.ok(result.md);
  assert.ok(result.html);
  assert.match(result.md, /A1/);
  assert.match(result.html, /A1/);

  // orchestrator-step-wiring M1 (Task 6) — A1의 라벨은 **작업 단위**를 말해야 한다.
  //
  // 이 지표는 M8부터 distinct `work_unit`을 세는데 라벨은 세션을 말하고 있었다. 옛
  // 이름의 **부재**까지 단언하는 이유는, 새 이름을 더하기만 하면 두 이름이 공존하는
  // 상태도 green이 되기 때문이다.
  //
  // `desc`는 단언하지 않는다: 렌더러는 `meta.name`만 출력하고 `desc`의 read site는
  // 정의부 외에 0건이라 **반증 불가능한 문자열**이다. 그런 값에 통과 단언을 걸면
  // green이 아무것도 뜻하지 않게 된다.
  assert.match(result.md, /작업 단위 완주율/);
  assert.match(result.html, /작업 단위 완주율/);
  assert.doesNotMatch(result.md, /세션 착수 안정성/);
  assert.doesNotMatch(result.html, /세션 착수 안정성/);
});

test('msw-metrics: heading depth ≤ 3 constraint', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'session-activity',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);

  // Check markdown: should not have #### or deeper
  assert.match(result.md, /^/); // No #### in the section body
  assert.ok(!result.md.includes('####'));

  // Check HTML: should not have <h4> or deeper
  assert.ok(!result.html.includes('<h4>'));
  assert.ok(!result.html.includes('<h5>'));
});

test('msw-metrics: XSS escape - payload in coverage field', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: '<script>alert(1)</script>',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);

  // Verify the XSS payload is escaped in HTML
  assert.ok(!result.html.includes('<script>alert'));
  assert.ok(result.html.includes('&lt;script&gt;'));
});

test('msw-metrics: XSS escape - payload in coverage', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: '<img src=x onerror="alert(1)">',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);

  // Verify payload is escaped — angle brackets should be encoded
  assert.ok(result.html.includes('&lt;img'));
  assert.ok(result.html.includes('&gt;'));
});

test('msw-metrics: list-of-N collapse (top 3 expanded)', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'session-activity',
      },
      A2: {
        id: 'A2',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'unknown',
      },
      A4: {
        id: 'A4',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'unknown',
      },
      B1: {
        id: 'B1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'unknown',
      },
      B2: {
        id: 'B2',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'unknown',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);

  // Check markdown has collapse with "+2 더 보기" or similar
  assert.ok(result.md.includes('<details>'));

  // Check HTML has details + summary
  assert.ok(result.html.includes('<details'));
  assert.ok(result.html.includes('<summary>'));
  assert.ok(result.html.includes('보기</summary>'));
});

test('msw-metrics: forward-only metrics (C2, C3) show H10-safe placeholder (no em-dash)', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'session-activity',
      },
      A2: {
        id: 'A2',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'unknown',
      },
      A4: {
        id: 'A4',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'unknown',
      },
      C2: {
        id: 'C2',
        numerator: null,
        denominator: null,
        value: null,
        status: 'forward-only',
        coverage: 'n/a',
      },
      C3: {
        id: 'C3',
        numerator: null,
        denominator: null,
        value: null,
        status: 'forward-only',
        coverage: 'n/a',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);

  // Check that C2/C3 are present (top-expanded, not collapsed)
  assert.ok(result.md.includes('C2'));
  assert.ok(result.md.includes('C3'));
  // Forward-only value uses the H10-safe placeholder — the rendered section must
  // contain NO em-dash (U+2014), which the renderer's H10 design-lint also enforces.
  assert.ok(!result.md.includes('—'), 'msw-metrics markdown must not contain em-dash (H10)');
});

test('msw-metrics: footer version string present', async (t) => {
  // This is a renderer section test, not checking main render result
  // Just ensure the section can be called without error
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'session-activity',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);
  assert.ok(result.md);
  assert.ok(result.html);
});

test('msw-metrics: invalid reason shown in status when invalid', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: null,
        denominator: null,
        value: null,
        invalid_reason: 'test reason',
        status: 'invalid',
        coverage: 'unknown',
      },
      B1: {
        id: 'B1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'unknown',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);
  // Result should render B1 as computed
  assert.ok(result.html.includes('B1'));
});

test('msw-metrics: a stale metric is surfaced even with nothing computed', async (t) => {
  // The live tree hit exactly this: A3 stale + B3 forward-only meant the section
  // vanished from STATUS.md entirely, so the milestone that put A3 on the
  // dashboard produced a dashboard with no metrics on it.
  const model = {
    metrics: {
      A3: {
        id: 'A3',
        numerator: null,
        denominator: null,
        value: null,
        status: 'insufficient',
        stale: true,
        stale_reason: 'CLAUDE.md changed since the A3 measurement',
        coverage: 'a3-instruction-cost',
      },
      B3: {
        id: 'B3', numerator: null, denominator: null, value: null,
        status: 'forward-only', coverage: 'toggle-usage',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null,
    'a measurement that exists but went stale must reach the operator');
});

// --- B1 렌더 제약 (multi-session-work-loop M6) --------------------------------
//
// detector 에 의존하지 않는 단언이다. impeccable detector 미설치 환경에서 advisory
// skip 만 남기면 이 Task 의 디자인 검사가 **전부** 사라지므로, 4개 Output Constraint 를
// 렌더 산출 문자열에 대해 직접 고정한다. detector 는 이 위에 얹는 추가 관측이다.

function b1Model(over) {
  const b1 = Object.assign({
    id: 'B1',
    numerator: 5,
    denominator: 39,
    value: null,
    status: 'computed',
    integrity_ok: true,
    coverage: 'milestone-evidence',
    undetermined_evidence_count: 33,
    noncanonical_status_count: 2,
    no_plan_count: 31,
    archived_excluded_count: 29,
    raw_row_count: 41,
    evidence_source: 'milestone-evidence',
    independence_ok: true,
    drift_items: [
      // PRD 표 셀은 이 repo 관례상 볼드 마커를 포함한다 — 그대로 흘리면 렌더 표면에
      // `**` 가 누출된다(제약 3). em-dash 도 데이터 쪽에서 들어올 수 있다.
      { prd: 'p.prd.md', milestone: '**P0 santa-loop 실체화**', doc_status: 'complete', evidence_verdict: 'not-shipped', evidence_ref: 'a.json' },
      { prd: 'p.prd.md', milestone: 'H1 setup — gitignore', doc_status: 'complete', evidence_verdict: 'not-shipped', evidence_ref: 'b.json' },
      { prd: 'p.prd.md', milestone: '`H2` 메타 조사', doc_status: 'complete', evidence_verdict: 'not-shipped', evidence_ref: 'c.json' },
      { prd: 'q.prd.md', milestone: 'live 완주 검증', doc_status: 'in-progress', evidence_verdict: 'shipped', evidence_ref: 'd.json' },
      { prd: 'q.prd.md', milestone: '발견 gap 보완', doc_status: 'pending', evidence_verdict: 'shipped', evidence_ref: 'e.json' },
    ],
  }, over || {});
  return { metrics: { B1: b1 } };
}

test('B1-RENDER-CONSTRAINTS: count not ratio, no new heading/accent/marker/collapse, top-3 with (+N건)', () => {
  const model = b1Model();
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);
  const html = result.html;
  const md = result.md;

  // --- 값은 건수다 (UI4) ---------------------------------------------------
  assert.ok(/5건 \(대조 6\/39\)/.test(md), 'B1 must render as a COUNT with a coverage cue; got: ' + md);
  assert.ok(!/\|\s*\d+%\s*\|/.test(md), 'B1 must never render as a percentage: ' + md);

  // --- (i) H15: 신규 h4+ / CommonMark #### 이상 0건 -------------------------
  assert.equal((html.match(/<h[4-9][\s>]/gi) || []).length, 0, 'no h4+ headings in the metrics section');
  assert.equal((md.match(/^#{4,6}\s/gm) || []).length, 0, 'no deep CommonMark headings in the metrics section');

  // --- (ii) 강조색 1개: 신규 accent 클래스 미도입 ---------------------------
  // 행 상태는 기존 STATUS_META 클래스(ok/warn/bad/muted)만 쓴다. drift 전용 뱃지를
  // 새로 칠하면 같은 viewport 에 2번째 강조가 생긴다.
  const classes = (html.match(/class="([^"]+)"/g) || [])
    .map((c) => c.slice(7, -1)).join(' ').split(/\s+/).filter(Boolean);
  const allowed = new Set(['ok', 'warn', 'bad', 'muted', 'msw-metrics', 'msw-metrics-extra', 'mono']);
  const unexpected = Array.from(new Set(classes)).filter((c) => !allowed.has(c));
  assert.deepEqual(unexpected, [], 'no new accent/style class may be introduced: ' + unexpected.join(', '));

  // --- (iii) 인라인 마커 0건 ∧ 신규 문자열 em-dash 0건 ----------------------
  // H16 은 HTML 전용이다(markdown 은 자기 마커가 정당하고 표의 `**B1**` 이 그 예).
  // <code> 안은 렌더된 코드 스팬이므로 H16 과 동일하게 제외한다.
  const visible = html.replace(/<code>[\s\S]*?<\/code>/g, '');
  assert.equal((visible.match(/\*\*/g) || []).length, 0, 'no raw bold marker may reach the HTML surface');
  assert.equal((visible.match(/`/g) || []).length, 0, 'no raw backtick may reach the HTML surface');
  // 볼드는 사라지는 게 아니라 **렌더된다** — 마커만 없어야 한다.
  assert.ok(/<strong>P0 santa-loop 실체화<\/strong>/.test(html), 'bold must render, not vanish: ' + html);
  const b1Lines = (html.match(/<p class="muted">B1[^<]*<\/p>/g) || []).join('');
  assert.equal((b1Lines.match(/[—–]/g) || []).length, 0, 'B1 detail lines must not carry an em-dash');
  const b1Md = md.split('\n').filter((l) => l.indexOf('B1 상세') === 0 || l.indexOf('B1 커버리지') === 0).join('');
  assert.equal((b1Md.match(/[—–]/g) || []).length, 0, 'markdown B1 detail must be em-dash free too');

  // --- (iv) 신규 collapse 0건 — 개수 ∧ 배치 --------------------------------
  // (iv-a) 개수 불변: B1 배선 전후로 동일해야 한다.
  const withoutB1 = renderMswMetrics(b1Model({ drift_items: [] }), mockFormatUtils);
  assert.equal((html.match(/<details/g) || []).length, 1, 'exactly the one pre-existing shared collapse');
  assert.equal((html.match(/<details/g) || []).length,
    (withoutB1.html.match(/<details/g) || []).length,
    'drift detail must not add a collapse');

  // (iv-b) 배치: drift 줄은 **기존** msw-metrics-extra 안의 <p class="muted"> 여야 한다.
  const extra = html.slice(html.indexOf('<details class="msw-metrics-extra">'));
  assert.ok(extra.indexOf('<p class="muted">B1 상세:') !== -1,
    'the drift line must live inside the existing shared collapse');
  assert.ok(html.indexOf('<p class="muted">B1 상세:') > html.indexOf('<details class="msw-metrics-extra">'),
    'the drift line must not sit above the collapse');

  // (iv-c) collapse 유사 위젯 신규 0건 — 개수만 세면 <div>+CSS 로 우회된다.
  assert.equal((html.match(/display\s*:\s*none/gi) || []).length, 0);
  assert.equal((html.match(/\shidden(?=[\s=>])/gi) || []).length, 0);
  assert.equal((html.match(/aria-expanded/gi) || []).length, 0);
  assert.equal((html.match(/class="[^"]*(collapse|accordion|toggle)[^"]*"/gi) || []).length, 0);

  // --- 항목 수 상한: 상위 3건 + (+N건) 절삭 병기 ---------------------------
  assert.ok(/B1 상세: drift 5건/.test(md), 'the full drift count must be stated: ' + md);
  assert.ok(/\(\+2건\)/.test(md), 'truncation must always be visible, never silent: ' + md);
  const detailLine = md.split('\n').find((l) => l.indexOf('B1 상세:') === 0);
  assert.ok(detailLine.indexOf('live 완주 검증') === -1,
    'only the top 3 drift items are listed inline');
});

test('B1 렌더 — drift 0건이어도 커버리지 줄은 남는다 (0건 ≠ drift 없음)', () => {
  const result = renderMswMetrics(b1Model({ numerator: 0, drift_items: [] }), mockFormatUtils);
  assert.notStrictEqual(result, null);
  assert.ok(/0건 \(대조 6\/39\)/.test(result.md), 'zero must still disclose the compared range');
  assert.ok(/B1 커버리지: 대조 6\/39 행/.test(result.md));
  // drift 가 없으면 상세 줄도 없다 — 빈 목록을 그리지 않는다.
  assert.ok(result.md.indexOf('B1 상세:') === -1);
});

test('B1 렌더 — 증거가 전부 확정이면 커버리지 단서 없이 건수만 낸다', () => {
  const result = renderMswMetrics(b1Model({ numerator: 1, undetermined_evidence_count: 0, drift_items: [
    { prd: 'p.prd.md', milestone: 'M1', doc_status: 'complete', evidence_verdict: 'not-shipped', evidence_ref: 'a.json' },
  ] }), mockFormatUtils);
  assert.ok(/\|\s*1건\s*\|/.test(result.md), 'no cue needed when nothing is undetermined: ' + result.md);
});

// ── multi-session-work-loop M7 Task 6 — C1 렌더 분리 표기 ────────────────────

function c1Model(overrides) {
  return {
    metrics: {
      C1: Object.assign({
        id: 'C1',
        numerator: 6,
        denominator: 10,
        value: 0.6,
        deferred_count: 2,
        downgraded_count: 1,
        rejected_count: 1,
        open_count: 0,
        deferred_rate: 0.2,
        integrity_ok: true,
        status: 'computed',
        coverage: 'findings-registry',
      }, overrides || {}),
    },
  };
}

test('C1-RENDER-SPLIT: closure and deferral render as two distinct figures', () => {
  const out = renderMswMetrics(c1Model(), mockFormatUtils);
  assert.ok(out, 'a computed C1 renders the section');

  // 단일 값으로 접히지 않는다 — 이연으로 100% 를 만드는 경로가 보여야 한다.
  assert.match(out.md, /60%\s*\(이연 20%\)/,
    'the C1 value cell carries both rates: ' + out.md);
  assert.match(out.html, /60%\s*\(이연 20%\)/);

  // 유형 분해가 상세로 함께 나온다.
  assert.match(out.md, /C1 유형 분해: 해소 6\/10건 · 이연 2건 · 강등 1건 · 기각 1건/);
});

test('C1-RENDER-SPLIT: a unit that deferred everything does not read as 100%', () => {
  const out = renderMswMetrics(c1Model({
    numerator: 0, denominator: 8, value: 0,
    deferred_count: 8, downgraded_count: 0, rejected_count: 0, open_count: 0,
    deferred_rate: 1,
  }), mockFormatUtils);
  assert.match(out.md, /0%\s*\(이연 100%\)/,
    'deferring everything closes nothing, and the surface must say so');
});

test('C1-RENDER-SPLIT: degraded coverage is named, not hidden behind the value', () => {
  const out = renderMswMetrics(c1Model({
    coverage: 'findings-registry-degraded',
  }), mockFormatUtils);
  assert.match(out.md, /계측 유실 있음 \(하한값\)/,
    'a lossy measurement cycle may not present as a clean number');
});

test('C1-RENDER-SPLIT: the C1 row keeps the section design constraints', () => {
  const out = renderMswMetrics(c1Model(), mockFormatUtils);
  // (1) heading depth ≤ 3
  assert.ok(!/^#{4,}\s/m.test(out.md), 'no heading deeper than h3');
  assert.ok(!/<h[4-9]/i.test(out.html), 'no html heading deeper than h3');
  // (3) raw markdown marker 금지 — 렌더 문자열에 미렌더 볼드 마커가 없다.
  assert.ok(out.html.indexOf('**') === -1, 'no raw markdown marker leaks into html');
  // (4) 신규 collapse 를 열지 않는다 — 공유 collapse 하나뿐이다.
  const opens = (out.html.match(/<details/g) || []).length;
  assert.ok(opens <= 1, 'C1 detail rides the shared collapse, it does not open a new one');
});

test('C1-RENDER-SPLIT: an absent deferred_rate degrades to the closure rate alone', () => {
  // 구 derive 산출물(필드 부재)이 들어와도 렌더가 깨지지 않는다.
  const model = c1Model();
  delete model.metrics.C1.deferred_rate;
  const out = renderMswMetrics(model, mockFormatUtils);
  assert.match(out.md, /\| 60% \| /, 'falls back to the single rate rather than NaN');
  assert.ok(out.md.indexOf('이연 NaN') === -1);
});
