'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStatus } = require('../index');

function makeFullModel(now) {
  return {
    derived_at: new Date(now).toISOString(),
    masked: true,
    m0_capability: { contract_present: true },
    warnings: [],
    sources: {
      plans: {
        count: 1,
        items: [{ path: 'v1-4-2-dashboard-overhaul-m1.plan.md', source_prd: 'prd.md' }],
      },
      receipts: {
        count: 1,
        items: [{
          gate_id: 'mccp-plan-codex', decision_id: 'aaaa', converged: true,
          created_at: new Date(now - 60_000).toISOString(),
        }],
      },
      state: {
        item: {
          resume_state: 'idle',
          frontmatter: { task_fingerprint: 'v1-4-2-dashboard-overhaul' },
          body: { open_questions: ['next milestone?'] },
        },
      },
      backlog: { count: 1, items: [{ severity: 'HIGH', text: 'finding' }] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: {
        count: 1,
        items: [{
          ok: true, dispatch_id: 'eee1', worker_subagent_type: 'planner',
          is_terminal: false, stale: false,
          heartbeat_at: new Date(now - 10_000).toISOString(), receipts_added: 0,
        }],
      },
    },
    correlations: [],
  };
}

function renderWithStubs(model) {
  return renderStatus(model, {
    cwd: '/test',
    fsRead: (p) => {
      if (p.endsWith('prd.md')) {
        return '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n| 1 | a | x | in-progress | [v1-4-2-dashboard-overhaul-m1.plan.md](v1-4-2-dashboard-overhaul-m1.plan.md) |\n';
      }
      return '# plan\n\n## Open Questions\n\n- q1\n\n## Risks\n\n| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| rr | High | High | mm |\n';
    },
  });
}

test('html — Korean section h3 panel labels present (redesign-3 panels)', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.match(r.html, />타임라인<\/h3>/);
  assert.match(r.html, />위험<\/h3>/);
  assert.match(r.html, />워커<\/h3>/);
  assert.match(r.html, />질문<\/h3>/);
});

test('html — English section h2 labels absent (anti-pattern check)', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.doesNotMatch(r.html, />Open Questions<\/h2>/);
  assert.doesNotMatch(r.html, />Risks<\/h2>/);
  assert.doesNotMatch(r.html, />Timeline<\/h2>/);
  assert.doesNotMatch(r.html, />Workers<\/h2>/);
  assert.doesNotMatch(r.html, />Status<\/h2>/);
});

test('html — sidebar switcher + "mccp" badge present (M1 console app-shell)', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.match(r.html, /<div class="switcher">[\s\S]*?<span class="sw-name">/);
  assert.match(r.html, /<span class="sw-badge">mccp<\/span>/);
});

test('html — topbar freshness "갱신" present', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.match(r.html, /<span class="freshness">[\s\S]*?갱신/);
});

// The expected version is DERIVED from the plugin manifest, not pinned as a
// literal. §3.7 calls version bumps a frequently-missed axis, and a hardcoded
// literal turns this drift guard into one more thing to remember to edit —
// it fails on the bump itself rather than on the drift it exists to catch.
// Deriving makes the test assert what it actually cares about: the footers and
// the manifest agree.
const MANIFEST_VERSION = require('../../../../.claude-plugin/plugin.json').version;

// The trust signal both faces must carry: "this console is a derive artifact,
// not a human-edited document." Held as ONE constant so the two faces cannot
// drift apart — PRODUCT.md Design Principle 4 asks that the same information be
// present in both, and the markdown face went without these two tokens until
// M4. A per-face literal list would let one side lose a token silently.
const FOOTER_TRUST_TOKENS = ['derive-only', 'LLM-free'];

test('html — footer version matches plugin.json (footer element anchored)', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  // Anchor the version inside the <footer> element. Asserting a bare /v1\.x\.y/
  // against r.html silently matched the model's plan-derived milestone label
  // (e.g. "v1.4.2 · …"), so footer drift went untested — anchor on the tag.
  const escaped = MANIFEST_VERSION.replace(/\./g, '\\.');
  assert.match(r.html, new RegExp('<footer[^>]*>v' + escaped + ' ·'),
    `html footer must carry v${MANIFEST_VERSION} (plugin.json)`);
  assert.match(r.html, /통합 derive/);
});

// M4 R3. This pair is the compensating check named in
// scripts/version-declaration-guard.js: that guard now asserts the ABSENCE of a
// literal on the anchor line, which cannot tell "derived" from "wired to
// something else" — only rendered output can, and this is where it is measured.
test('both footers carry the same trust tokens (information parity)', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  const htmlFoot = (r.html.match(/<footer[^>]*>[\s\S]*?<\/footer>/) || [''])[0];
  const mdFoot = (r.md.split('\n').filter((l) => /_derived from \.claude\//.test(l))[0]) || '';
  FOOTER_TRUST_TOKENS.forEach((tok) => {
    assert.ok(htmlFoot.includes(tok), `html footer missing "${tok}": ${htmlFoot}`);
    assert.ok(mdFoot.includes(tok), `markdown footer missing "${tok}": ${mdFoot}`);
  });
});

test('markdown — ## 대시보드 anchor preserved (M2 rename, F3 absorption)', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.match(r.md, /^## 대시보드$/m);
  assert.doesNotMatch(r.md, /^## 현황$/m, '구 명칭 잔존 0');
});

test('markdown — Korean h2 labels present', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.match(r.md, /^## 타임라인$/m);
  assert.match(r.md, /^## 위험$/m);
  assert.match(r.md, /^## 워커$/m);
  assert.match(r.md, /^## 질문$/m);
});

test('markdown — English h2 labels absent', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.doesNotMatch(r.md, /^## Open Questions$/m);
  assert.doesNotMatch(r.md, /^## Risks$/m);
  assert.doesNotMatch(r.md, /^## Timeline$/m);
  assert.doesNotMatch(r.md, /^## Workers$/m);
  assert.doesNotMatch(r.md, /^## Status$/m);
});

test('markdown — title "mccp 상태"', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.match(r.md, /^# mccp 상태/m);
});

test('markdown — footer version matches plugin.json (footer line anchored)', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  // Anchor on the footer line for the same reason the html assertion does — a
  // bare /v1\.x\.y/ also matches plan-derived milestone labels in the body.
  //
  // M4 recovered this assertion. It used to pin the WHOLE line shape
  // (`^_derived from .claude/ · vX.Y.Z_$`), which made the trust-token addition
  // below a red test rather than the parity fix it is. The line-shape pin was
  // never the point: what this test cares about is that the footer line carries
  // the manifest's number. Token presence is asserted separately, from ONE
  // shared constant, so the two faces cannot drift apart.
  const line = r.md.split('\n').filter((l) => /^_derived from \.claude\//.test(l));
  assert.equal(line.length, 1, 'expected exactly one markdown footer line, got ' + line.length);
  assert.ok(line[0].includes('v' + MANIFEST_VERSION),
    `markdown footer must carry v${MANIFEST_VERSION} (plugin.json), got: ${line[0]}`);
});
