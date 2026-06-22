'use strict';

// v1.3.0-m3 DESIGN.md H1-H16 mechanical lint contract.
// See docs/v1.3.0-observability/DESIGN.md for the rule spec.
//
// Pure function, no I/O, no global state. Returns multi-violation
// collection (all 16 rules evaluated even after first hit). Fail-open
// per-rule: if a rule's check throws, that rule is skipped + stderr
// warn, other rules continue. Caller integrates via renderer/index.js
// and pushes model.warnings on violation count > 0 or degraded === true.

// v1.4.2 carve-out — 4-part OQ/Risks 컴포넌트 + a11y skip-link/copy-btn은
// H3 (border-radius)와 H4 (border-left) baseline에서 의도적으로 제외.
// design-gate의 card-less/stripe-less 원칙은 일반 layout chrome에 한정 적용
// 되고, 명시적 interactive affordance(severity pill, action prompt code chip,
// skip-link, copy-btn focus-visible, OQ/Risks meta-cue stripe, blockquote
// quote-stripe)는 4-part 컴포넌트의 핵심 design intent로 carve-out.
// v1.13.0 carve-out — pipe-node 는 게이트 파이프라인 스테퍼의 상태 노드
// affordance(pill). 일반 layout chrome 의 카드화와 구분되는 명시적 컴포넌트.
const H3_CARVEOUT = /\.(severity-tag|action-prompt|skip-link|copy-btn|s-secret|pipe-node)|\[role="alert"\]/;
const H4_CARVEOUT = /\.(meta-cue)|\bblockquote\b/;

function findSelectorContext(css, hitIndex) {
  const slice = css.slice(0, hitIndex);
  const openBraceIdx = slice.lastIndexOf('{');
  if (openBraceIdx === -1) return '';
  const before = slice.slice(0, openBraceIdx);
  const closeBraceIdx = before.lastIndexOf('}');
  return before.slice(closeBraceIdx + 1).trim();
}

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
  // H3 no cards. border-radius >= 1px on layout chrome.
  // v1.4.2 carve-out: severity-tag pill + action-prompt code chip + skip-link
  // + copy-btn(focus-visible)는 4-part 컴포넌트 + a11y의 핵심 affordance.
  {
    id: 'H3',
    severity: 'absolute-ban',
    check: ({ css }) => {
      const regex = /border-radius:\s*[1-9]/g;
      let m;
      let uncarvedHits = 0;
      while ((m = regex.exec(css)) !== null) {
        const selector = findSelectorContext(css, m.index);
        if (H3_CARVEOUT.test(selector)) continue;
        uncarvedHits++;
      }
      if (uncarvedHits > 0) return { evidence: uncarvedHits + ' uncarved border-radius hit(s)' };
      return null;
    },
  },
  // H4 no side-stripe. border-left thicker than 1px, or box-shadow inset
  // offset >= 2px on the left edge.
  // v1.4.2 carve-out: meta-cue blockquote + 일반 blockquote는 4-part 컴포넌트의
  // "왜:" rationale stripe로 design intent.
  {
    id: 'H4',
    severity: 'absolute-ban',
    check: ({ css }) => {
      const regexA = /border-left:\s*[2-9]\d*px/g;
      const regexB = /inset\s+[2-9]\d*px\s+0\s+0/g;
      let m;
      let uncarvedHits = 0;
      while ((m = regexA.exec(css)) !== null) {
        const selector = findSelectorContext(css, m.index);
        if (H4_CARVEOUT.test(selector)) continue;
        uncarvedHits++;
      }
      while ((m = regexB.exec(css)) !== null) {
        const selector = findSelectorContext(css, m.index);
        if (H4_CARVEOUT.test(selector)) continue;
        uncarvedHits++;
      }
      if (uncarvedHits > 0) return { evidence: uncarvedHits + ' uncarved side-stripe hit(s)' };
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
          .replace(/<script[\s\S]*?<\/script>/gi, '')
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
  // H15 heading depth <= 3. h1 + h2 + h3 만 허용. h4+ 등장 시 PM voice 60s scan 불가.
  // HTML body + markdown source 양쪽 검사. attribute 안의 `<h4>` 같은 escape는
  // 이미 &lt; 로 변환돼 다른 토큰 — strip 불필요.
  // Codex F2 (plan-time) + F2 (implement-time) absorption:
  // markdown은 fenced code block(backtick `{3,}` AND tilde `~{3,}`) strip 후
  // CommonMark ATX (`^ {0,3}#{4,6}\s`) 매칭 — indented heading 잡고
  // fenced 예시 false-positive 회피. 두 fence 종류 모두 cover.
  {
    id: 'H15',
    severity: 'invariant',
    check: ({ html, md }) => {
      let count = 0;
      const hits = [];
      if (html) {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const bodyContent = bodyMatch ? bodyMatch[1] : html;
        const m = bodyContent.match(/<h[4-9]\b/gi);
        if (m) { count += m.length; hits.push('html(' + m.length + ')'); }
      }
      if (md) {
        // Strip fenced code blocks. CommonMark allows fence length >= 3 of
        // either backtick or tilde. Closing fence must be same char, length >=.
        // Conservative regex: paired triple-or-more of same fence char.
        let stripped = md
          .replace(/^([ ]{0,3})(`{3,})[^\n]*\n[\s\S]*?\n[ ]{0,3}\2[ \t]*$/gm, '')
          .replace(/^([ ]{0,3})(~{3,})[^\n]*\n[\s\S]*?\n[ ]{0,3}\2[ \t]*$/gm, '');
        const m = stripped.match(/^ {0,3}#{4,6}\s/gm);
        if (m) { count += m.length; hits.push('md(' + m.length + ')'); }
      }
      if (count > 0) return { evidence: count + ' h4+/heading(s): ' + hits.join('+') };
      return null;
    },
  },
  // H16 unrendered markdown literal in HTML body.
  // Catalog: paired ** / paired __ / inline backtick (raw + entity variants) /
  //          md link / MD lint code / entity-encoded asterisk/underscore (paired).
  // Carve-out (same as H10): strip <code>/<pre>/HTML attributes before count.
  // Codex F3 (implement-time) absorption: Python dunder 15종 whitelist
  // (init/name/main/file/doc/str/repr/call/enter/exit/all/slots/dict/iter/len).
  // 본 repo skill docs에 __all__/__slots__/__dict__ 다수 존재 — 좁은 10종
  // whitelist는 production false-positive 양산.
  // Codex F4 (implement-time) absorption: entity-encoded backtick은 leading-zero
  // (&#096;), uppercase hex (&#X60;), named entity (&grave;) variant 모두 cover.
  // entity-encoded asterisk/underscore는 paired matching (2회 이상 등장 시 fire) —
  // bold marker bypass 차단. md link literal과 MD0xx lint code는 unchanged.
  // markdown source는 IS markdown — 본 rule는 HTML body only.
  {
    id: 'H16',
    severity: 'absolute-ban',
    check: ({ html }) => {
      if (!html) return null;
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const bodyContent = bodyMatch ? bodyMatch[1] : html;
      const PYTHON_DUNDERS = /\b__(?:init|name|main|file|doc|str|repr|call|enter|exit|all|slots|dict|iter|len)__\b/g;
      const stripped = bodyContent
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<code[\s\S]*?<\/code>/g, '')
        .replace(/<pre[\s\S]*?<\/pre>/g, '')
        .replace(/(?:title|alt|aria-label)="[^"]*"/g, '')
        .replace(PYTHON_DUNDERS, '');
      // entity-encoded backtick variants (decimal w/ leading zeros, hex upper/lower, named)
      const ENT_BACKTICK = '(?:&#0*96;|&#[xX]0*60;|&grave;)';
      const ENT_ASTERISK = '(?:&#0*42;|&#[xX]0*2[aA];|&ast;)';
      const ENT_UNDERSCORE = '(?:&#0*95;|&#[xX]0*5[fF];|&(?:lowbar|UnderBar);)';
      const patterns = [
        { name: 'bold-asterisk', re: /\*\*[^*\n]+\*\*/g },
        { name: 'bold-underscore', re: /\b__[^_\n]+__\b/g },
        { name: 'inline-backtick', re: /`[^`\n]+`/g },
        { name: 'entity-backtick', re: new RegExp(ENT_BACKTICK + '[^&\\n]+' + ENT_BACKTICK, 'g') },
        // paired entity-asterisk (bypasses raw ** rule via entity encoding)
        { name: 'entity-asterisk-pair', re: new RegExp(ENT_ASTERISK + ENT_ASTERISK + '[^\\n]+?' + ENT_ASTERISK + ENT_ASTERISK, 'g') },
        // paired entity-underscore (bypasses raw __ rule via entity encoding)
        { name: 'entity-underscore-pair', re: new RegExp(ENT_UNDERSCORE + ENT_UNDERSCORE + '[^\\n]+?' + ENT_UNDERSCORE + ENT_UNDERSCORE, 'g') },
        { name: 'md-link', re: /\[[^\]]+\]\([^)]+\)/g },
        { name: 'md-lint-code', re: /\bMD0?\d{2,4}\b/g },
      ];
      const hits = [];
      let total = 0;
      for (const p of patterns) {
        const m = stripped.match(p.re);
        if (m) { total += m.length; hits.push(p.name + '(' + m.length + ')'); }
      }
      if (total > 0) return { evidence: total + ' unrendered marker(s): ' + hits.join('+') };
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
