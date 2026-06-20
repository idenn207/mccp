'use strict';

// v1.3.0-m3 DESIGN.md H1-H14 mechanical lint contract.
// See docs/v1.3.0-observability/DESIGN.md for the rule spec.
//
// Pure function, no I/O, no global state. Returns multi-violation
// collection (all 14 rules evaluated even after first hit). Fail-open
// per-rule: if a rule's check throws, that rule is skipped + stderr
// warn, other rules continue. Caller integrates via renderer/index.js
// and pushes model.warnings on violation count > 0 or degraded === true.

const RULES = [
  // H1 light mode default. First :root --bg token lightness must be >= 0.97.
  {
    id: 'H1',
    severity: 'invariant',
    check: ({ css }) => {
      const m = css.match(/--bg:\s*oklch\(\s*0\.(\d+)/);
      if (!m) return { evidence: 'no :root --bg token found' };
      const val = parseFloat('0.' + m[1]);
      if (val < 0.97) return { evidence: '--bg lightness ' + val + ' (< 0.97)' };
      return null;
    },
  },
  // H2 main column max-width <= 720px.
  {
    id: 'H2',
    severity: 'invariant',
    check: ({ css }) => {
      const m = css.match(/\bmain\b[^{]*\{[^}]*max-width:\s*(\d+)px/);
      if (!m) return { evidence: 'no main max-width found' };
      const px = parseInt(m[1], 10);
      if (px > 720) return { evidence: 'main max-width ' + px + 'px (> 720)' };
      return null;
    },
  },
  // H3 no cards. border-radius >= 1px on section/li/td chrome.
  // Simplification: total count across CSS source. baseline = 0.
  {
    id: 'H3',
    severity: 'absolute-ban',
    check: ({ css }) => {
      const matches = css.match(/border-radius:\s*[1-9]/g);
      if (matches) return { evidence: matches.length + ' border-radius hit(s)' };
      return null;
    },
  },
  // H4 no side-stripe. border-left thicker than 1px, or box-shadow inset
  // offset >= 2px on the left edge.
  {
    id: 'H4',
    severity: 'absolute-ban',
    check: ({ css }) => {
      const a = css.match(/border-left:\s*[2-9]\d*px/g);
      const b = css.match(/inset\s+[2-9]\d*px\s+0\s+0/g);
      const hits = (a ? a.length : 0) + (b ? b.length : 0);
      if (hits > 0) return { evidence: hits + ' side-stripe hit(s)' };
      return null;
    },
  },
  // H5 no identical card grid. CSS grid auto-fit + minmax pattern.
  {
    id: 'H5',
    severity: 'absolute-ban',
    check: ({ css }) => {
      const matches = css.match(/repeat\(auto-fit,\s*minmax\(/g);
      if (matches) return { evidence: matches.length + ' auto-fit grid(s)' };
      return null;
    },
  },
  // H6 no hero-metric. font-size >= 1.6rem.
  // Carve-out: h1.verdict { font-size: 1.5rem } (PRD line 117) exact 1.5
  // is allowed. selector context intentionally ignored for simplicity.
  // Parse-then-filter beats a clever regex literal — easier to read and
  // covers 10rem, 12.5rem, etc. without enumerating cases.
  {
    id: 'H6',
    severity: 'invariant',
    check: ({ css }) => {
      const matches = css.match(/font-size:\s*[\d.]+rem/g) || [];
      const hits = [];
      for (const decl of matches) {
        const num = decl.match(/([\d.]+)/);
        if (num && parseFloat(num[1]) >= 1.6) hits.push(decl);
      }
      if (hits.length > 0) return { evidence: hits.join(', ') };
      return null;
    },
  },
  // H7 no glassmorphism. backdrop-filter / backdrop-blur declarations.
  {
    id: 'H7',
    severity: 'absolute-ban',
    check: ({ css }) => {
      const matches = css.match(/backdrop-filter|backdrop-blur/g);
      if (matches) return { evidence: matches.length + ' glassmorphism hit(s)' };
      return null;
    },
  },
  // H8 no gradient bg. radial-gradient anywhere, linear-gradient or
  // color-mix when adjacent to `background` in the same declaration.
  // Bidirectional adjacency so the rule fires whether the gradient
  // appears before or after `background:`.
  {
    id: 'H8',
    severity: 'absolute-ban',
    check: ({ css }) => {
      const radial = css.match(/radial-gradient/g) || [];
      const bgLinear = css.match(/background[^;]*linear-gradient|linear-gradient[^;]*background/g) || [];
      const bgColorMix = css.match(/background[^;]*color-mix|color-mix[^;]*background/g) || [];
      const total = radial.length + bgLinear.length + bgColorMix.length;
      if (total > 0) return { evidence: total + ' gradient bg hit(s)' };
      return null;
    },
  },
  // H9 uppercase at most 1 declaration site allowed.
  {
    id: 'H9',
    severity: 'invariant',
    check: ({ css }) => {
      const matches = css.match(/text-transform:\s*uppercase/g);
      const count = matches ? matches.length : 0;
      if (count > 1) return { evidence: count + ' uppercase declaration(s)' };
      return null;
    },
  },
  // H10 no em-dash in rendered prose.
  // Carve-out per DESIGN.md line 48: strip <code>/<pre>/HTML attributes
  // (title/alt/aria-label) from HTML body before counting. For markdown,
  // strip fenced code blocks (``` ... ```) and inline backticks.
  {
    id: 'H10',
    severity: 'absolute-ban',
    check: ({ html, md }) => {
      let count = 0;
      const hits = [];
      if (html) {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const bodyContent = bodyMatch ? bodyMatch[1] : html;
        const stripped = bodyContent
          .replace(/<code[\s\S]*?<\/code>/g, '')
          .replace(/<pre[\s\S]*?<\/pre>/g, '')
          .replace(/(?:title|alt|aria-label)="[^"]*"/g, '');
        const m = stripped.match(/—/g);
        if (m) { count += m.length; hits.push('html(' + m.length + ')'); }
      }
      if (md) {
        const stripped = md
          .replace(/```[\s\S]*?```/g, '')
          .replace(/`[^`]*`/g, '');
        const m = stripped.match(/—/g);
        if (m) { count += m.length; hits.push('md(' + m.length + ')'); }
      }
      if (count > 0) return { evidence: count + ' em-dash(es): ' + hits.join('+') };
      return null;
    },
  },
  // H11 severity vocabulary cap. --sev-* token declarations <= 3.
  // m3-redux uses --signal/--warn/--ok + --accent without --sev- prefix.
  // This rule catches future drift that reintroduces --sev-low / --sev-mid etc.
  {
    id: 'H11',
    severity: 'invariant',
    check: ({ css }) => {
      const matches = css.match(/--sev-[a-z-]+:/g);
      const count = matches ? matches.length : 0;
      if (count > 3) return { evidence: count + ' --sev-* tokens' };
      return null;
    },
  },
  // H12 no .sev-pill class. Severity tokens render via color, not chrome.
  {
    id: 'H12',
    severity: 'absolute-ban',
    check: ({ css }) => {
      const matches = css.match(/\.sev-pill\b/g);
      if (matches) return { evidence: matches.length + ' .sev-pill hit(s)' };
      return null;
    },
  },
  // H13 no custom font names. System font stack only.
  // Catches Inter/Pretendard/JetBrains reintroduction inside font-family.
  {
    id: 'H13',
    severity: 'absolute-ban',
    check: ({ css }) => {
      const fontFamilyDecls = css.match(/font-family:\s*[^;]+;/g) || [];
      const hits = [];
      for (const decl of fontFamilyDecls) {
        const m = decl.match(/Inter|Pretendard|JetBrains/);
        if (m) hits.push(m[0]);
      }
      if (hits.length > 0) return { evidence: hits.join(', ') };
      return null;
    },
  },
  // H14 verdict prose. h1.verdict text must not be a raw slug.
  // PM-voice sentences pass; slug-only ("v1.3.0", "1-3-0-m3") fails.
  {
    id: 'H14',
    severity: 'absolute-ban',
    check: ({ html }) => {
      const h1Match = html.match(/<h1 class="verdict[^"]*">([\s\S]*?)<\/h1>/);
      if (!h1Match) return null;
      const inner = h1Match[1];
      const stripped = inner
        .replace(/<span class="v-icon"[^>]*>[\s\S]*?<\/span>/g, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (/^v?\d+[-.]\d+/.test(stripped)) {
        return { evidence: 'h1.verdict text "' + stripped.slice(0, 40) + '" is slug-only' };
      }
      return null;
    },
  },
];

function runOutputConstraints(input) {
  const ctx = {
    css: (input && input.css) || '',
    html: (input && input.html) || '',
    md: (input && input.md) || '',
  };
  const violations = [];
  const details = [];
  for (const rule of RULES) {
    try {
      const result = rule.check(ctx);
      if (result) {
        violations.push(rule.id);
        details.push({
          rule: rule.id,
          evidence: result.evidence,
          severity: rule.severity,
        });
      }
    } catch (err) {
      process.stderr.write('[mccp:renderer] design-lint rule=' + rule.id
        + ' FAILED ' + ((err && err.message) || err) + ' (allow)\n');
    }
  }
  return { violations, details };
}

module.exports = { runOutputConstraints, RULES };
