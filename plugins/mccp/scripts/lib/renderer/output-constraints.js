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
// v1.14.0 carve-out — tl-node 는 활동 step-chart rail 의 상태 노드 마커(pill).
// 세로 connector 는 background 라인(.tl-rail::before)이라 H4 무관 — carve-out 불필요.
// v1.16.0 (M3 재설계) — 다크 콘솔 + Vercel 카드 베이스. card / nav-rail 은
// 목적 있는 비중첩 카드 / 길찾기 레일의 design intent affordance 로 H3 carve-out.
// 카드 중첩 금지는 신규 H17 이 DOM-aware 로 강제.
// v1.16.0 redesign-2 — status-strip 의 .cell 칩은 우측 rail 의 상태 jump
// affordance(icon+색상 칩, 클릭 시 섹션 이동). pipe-node/tl-node 와 동격의
// 명시적 컴포넌트 affordance 로 H3 carve-out.
// v1.17.0 redesign-3 (Vercel 멀티페이지 콘솔) — hero-panel / panel 은 목적 있는
// 비중첩 패널(card-in-card 금지는 H17 이 DOM-aware 로 강제), nav-rail a / route 는
// 라우팅 affordance. 모두 일반 layout chrome 의 무분별한 카드화와 구분되는 명시
// 컴포넌트라 H3 carve-out. status-strip(폐기)도 무해하게 잔존.
// v1.17.0 (dashboard-console-redesign M1, Codex Plan-Codex R1 F1 흡수) — selector-
// aware carve-out 유지(magnitude 천장 도입 안 함). 승인된 dashboard-sample.html 이
// frozen canonical 이라 carve 집합은 bounded(무한 증식 아님). 추가된 명시 affordance:
// 사이드바 스위처/검색/pin-alert/topbar 셸 칩 + 샘플 섹션 컴포넌트(node-mark/ms-check/
// sev/inline-prompt/audit-node/dot). 일반 layout chrome(section/div/topbar/sidebar/
// content)는 carve 밖이라 radius 추가 시 H3 FIRE — design-invariants drift fixture 가
// 이 가드를 증명한다.
const H3_CARVEOUT = /\.(severity-tag|action-prompt|skip-link|copy-btn|s-secret|pipe-node|tl-node|card|panel|hero-panel|nav-rail|nav-link|status-strip|route|switcher|sw-mark|sw-badge|search|kbd|pin-alert|pa-btn|c-mark|tb-icon-btn|node-mark|node-dot|ms-check|sev|inline-prompt|freshness|audit-node|dot)|\[role="alert"\]/;
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
  // H1 (v1.16.0 개정) 다크 mode default + light opt-in. 기본 :root --bg 는
  // 어두워야(< 0.5) 하고, `@media (prefers-color-scheme: light)` 안에서 밝은
  // --bg(>= 0.97)로 override 되어야 한다. (이전: light default >= 0.97)
  {
    id: 'H1',
    severity: 'invariant',
    check: ({ css }) => {
      const dm = css.match(/--bg:\s*oklch\(\s*0?\.(\d+)/);
      if (!dm) return { evidence: 'no :root --bg token found' };
      const dark = parseFloat('0.' + dm[1]);
      if (dark >= 0.5) return { evidence: 'default --bg lightness ' + dark + ' not dark (>= 0.5)' };
      const lightBlock = css.match(/@media\s*\(prefers-color-scheme:\s*light\)\s*\{[\s\S]*?--bg:\s*oklch\(\s*([\d.]+)/);
      if (!lightBlock) return { evidence: 'no prefers-color-scheme: light --bg override' };
      const light = parseFloat(lightBlock[1]);
      if (light < 0.97) return { evidence: 'light --bg lightness ' + light + ' (< 0.97)' };
      return null;
    },
  },
  // H2 (v1.17.0 개정) 읽기 콘텐츠 폭 상한. 승인된 sample 콘솔이 2-col 패널 그리드를
  // 담는 --content-max(<= 1080px)로 콘텐츠 가독 폭을 cap. nav 레일 폭(--sidebar-w)은
  // 별도. (이전: <= 960, redesign-3)
  {
    id: 'H2',
    severity: 'invariant',
    check: ({ css }) => {
      const m = css.match(/--content-max:\s*(\d+)px/);
      if (m) {
        const px = parseInt(m[1], 10);
        if (px > 1080) return { evidence: '--content-max ' + px + 'px (> 1080)' };
        return null;
      }
      const mm = css.match(/\bmain\b[^{]*\{[^}]*max-width:\s*(\d+)px/);
      if (!mm) return { evidence: 'no --content-max or main max-width found' };
      const px = parseInt(mm[1], 10);
      if (px > 1080) return { evidence: 'main max-width ' + px + 'px (> 1080)' };
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
  // H13 (v1.17.0 재정의, Codex Plan-Codex R1 F3 흡수) no external network fetch.
  // 이전: font-family banlist(Inter/Pretendard/JetBrains) — 외부 폰트 로드를 막으려던
  // 의도였으나 "Pretendard 로컬 family-name 참조"(fetch 아님)까지 금지하는 과잉이었다.
  // 승인된 sample 은 Pretendard 를 로컬 family-name 으로만 참조(외부 fetch 0) →
  // banlist 대신 **렌더 산출물 전체(css+html)의 외부 fetch surface**를 mechanical 검출.
  // status.html 은 self-contained(inline jQuery/sprite/style, 로컬 폰트 참조)라 green.
  // 검출 대상: @import / url(http|https|//) / <link|script|img|iframe|source|use|
  // audio|video|track|embed src|href=(http|https|//). 로컬 fragment(#id)·상대경로는 무관.
  // grep validation 은 smoke-check 로 강등 — invariant 본체는 이 룰.
  {
    id: 'H13',
    severity: 'absolute-ban',
    check: ({ css, html }) => {
      const surface = (css || '') + '\n' + (html || '');
      const hits = [];
      if (/@import\b/.test(surface)) hits.push('@import');
      if (/url\(\s*['"]?(?:https?:)?\/\//i.test(surface)) hits.push('css url(external)');
      if (/<(?:link|script|img|iframe|source|use|audio|video|track|embed)\b[^>]*\b(?:src|href|xlink:href)\s*=\s*['"]?(?:https?:)?\/\//i.test(surface)) {
        hits.push('html external src/href');
      }
      if (hits.length > 0) return { evidence: 'external fetch surface: ' + hits.join(', ') };
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
  // H17 (v1.16.0 신규, Codex R1 F2 absorption) 카드 중첩 금지 — DOM-aware.
  // Vercel 베이스의 핵심 규율: "card 안에 card" 0. `<section class="card">`
  // 만이 아니라 임의 block 태그(section/div/article/main/aside)의 `card`
  // class token nesting 을 stack scan 으로 검출. carve-out 없음(card 중첩은
  // 절대 금지). markdown 무관 — HTML body only.
  {
    id: 'H17',
    severity: 'absolute-ban',
    check: ({ html }) => {
      if (!html) return null;
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const body = bodyMatch ? bodyMatch[1] : html;
      const tagRe = /<(\/?)(section|div|article|main|aside)\b([^>]*)>/gi;
      const stack = [];
      let nested = 0;
      let mm;
      while ((mm = tagRe.exec(body)) !== null) {
        const isClose = mm[1] === '/';
        const tag = mm[2].toLowerCase();
        if (isClose) {
          // pop to matching tag (tolerant of unbalanced inner markup)
          for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].tag === tag) { stack.splice(i); break; }
          }
        } else {
          const isCard = /class="[^"]*\bcard\b[^"]*"/.test(mm[3]);
          if (isCard && stack.some((e) => e.isCard)) nested++;
          stack.push({ tag, isCard });
        }
      }
      if (nested > 0) return { evidence: nested + ' nested card(s)' };
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
