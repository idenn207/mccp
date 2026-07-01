'use strict';

const STATUS_BADGES = Object.freeze({
  blocked: Object.freeze({
    text: 'blocked', icon: '🚫', korean: '차단됨',
    colorToken: '--status-blocked', appliesTo: 'both',
  }),
  stale: Object.freeze({
    text: 'stale', icon: '⏱', korean: '오래됨',
    colorToken: '--status-stale', appliesTo: 'icon',
  }),
  'secret-warn': Object.freeze({
    text: 'secret-warn', icon: '⚠', korean: '시크릿 의심',
    colorToken: '--status-secret', appliesTo: 'both',
  }),
  'worker-alive': Object.freeze({
    text: 'worker-alive', icon: '●', korean: '활성',
    colorToken: '--status-worker-alive', appliesTo: 'both',
  }),
  'worker-stale': Object.freeze({
    text: 'worker-stale', icon: '⏱', korean: '심박 끊김',
    colorToken: '--status-worker-stale', appliesTo: 'icon',
  }),
  'terminal-ok': Object.freeze({
    text: 'terminal-ok', icon: '✓', korean: '완료',
    colorToken: '--accent', appliesTo: 'both',
  }),
  'terminal-failure': Object.freeze({
    text: 'terminal-failure', icon: '✗', korean: '실패',
    colorToken: '--status-blocked', appliesTo: 'both',
  }),
  'in-progress': Object.freeze({
    text: 'in-progress', icon: '◐', korean: '진행 중',
    colorToken: '--accent', appliesTo: 'both',
  }),
  neutral: Object.freeze({
    text: 'neutral', icon: '·', korean: '대기',
    colorToken: '--muted', appliesTo: 'both',
  }),
});

// Dashboard Readability M2 (Codex F2) — 3번째 인자 opts 는 **opt-in** 확장. opts 미전달
// 시 기존 전 caller(footer/audit-timeline/milestone-history/multi-session/worker-fanout/
// drawer)는 'N일 전' 경로 byte-identical(blast radius 0). opts.absoluteAfterDays(number)
// 가 주어지고 days > 임계면 상대 표기 대신 절대일자(같은 연도 'M월 D일', 다른 연도
// 'YYYY년 M월 D일'). ≤임계 경로(초/분/시간/일)·invalid/미래/방금 가드 불변.
function formatRelativeTime(isoOrDate, now, opts) {
  if (typeof now !== 'number') now = Date.now();
  let ms;
  if (isoOrDate instanceof Date) {
    ms = isoOrDate.getTime();
  } else if (typeof isoOrDate === 'string' || typeof isoOrDate === 'number') {
    const d = new Date(isoOrDate);
    ms = d.getTime();
  } else {
    return '시각 불명';
  }
  if (!Number.isFinite(ms)) return '시각 불명';
  const diff = now - ms;
  if (diff < -1000) return '미래';
  if (diff < 5000) return '방금';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return seconds + '초 전';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + '분 전';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + '시간 전';
  const days = Math.floor(hours / 24);
  // 절대일자 bin(opt-in) — now·ms 양변에 같은 로컬 Date 적용(단일 데스크탑 사용자
  // 로컬, PRODUCT.md 환경 가정)으로 render-date 결정성 보존.
  if (opts && typeof opts.absoluteAfterDays === 'number' && days > opts.absoluteAfterDays) {
    const dThen = new Date(ms);
    const dNow = new Date(now);
    const mo = dThen.getMonth() + 1;
    const day = dThen.getDate();
    if (dThen.getFullYear() === dNow.getFullYear()) return mo + '월 ' + day + '일';
    return dThen.getFullYear() + '년 ' + mo + '월 ' + day + '일';
  }
  return days + '일 전';
}

function formatStatusBadge(kind) {
  const badge = STATUS_BADGES[kind];
  if (!badge) {
    throw new Error('formatStatusBadge: unknown kind "' + kind + '"');
  }
  return badge;
}

function mask(value, model) {
  if (value == null) return '';
  const str = String(value);
  if (!model || model.masked !== false) return str;
  return '⚠ raw ' + str;
}

// v1.3.0-m3-redux H10 — render-time prose normalizer.
// Substitutes U+2014 em dash and the ASCII " -- " variant with a comma. Single
// hyphens surrounded by spaces (" - ") are preserved (legitimate parenthetical).
// SSoT invariant: source files (PRD, STATE.md, receipt JSON) are never edited;
// normalization happens at render time only. PRD §Copy line 209 mandates this.
function normalizeProse(s) {
  if (s == null) return '';
  return String(s)
    .replace(/—/g, ',')
    .replace(/ -- /g, ', ');
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

function escapeAttr(s) {
  const escaped = escapeHtml(s);
  return escaped
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\s/g, '%20');
}

// v1.18.0 M2 — inline-markdown prose renderer. Single entry point that resolves
// both H10 (em-dash) and H16 (unrendered markdown marker) for derive-sourced
// prose. The HTML path normalizes em-dash → comma, renders code/bold/link as
// real HTML (so the markers never survive as literals), neutralizes MD0xx
// markdownlint codes as <code> (H16 strips <code> spans before counting), and
// escapes the gaps. The catalog is 1:1 with output-constraints.js H16:
// inline-backtick / entity-backtick / bold-asterisk / bold-underscore /
// md-link / md-lint-code. Links collapse to their text only (no anchor) for
// safety. Python dunders (__init__ 등) are left literal — H16 whitelists them.
// SSoT invariant: source files (PRD/STATE/receipt) are never edited; this runs
// at render time only, mirroring normalizeProse (line 87).
const PROSE_DUNDER = new Set([
  'init', 'name', 'main', 'file', 'doc', 'str', 'repr', 'call',
  'enter', 'exit', 'all', 'slots', 'dict', 'iter', 'len',
]);
const PROSE_MDLINT = /\bMD0?\d{2,4}\b/g;
// Leftmost-first: GFM double-backtick code span (may contain single backticks),
// single-backtick code, bold (** or __), markdown link. Double-backtick must
// precede single so ``a `b` c`` is one span, not mis-paired.
const PROSE_TOKEN = /(``[^\n]+?``)|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\[[^\]]+\]\([^)]+\))/;
// Derived once from PROSE_DUNDER so hasResidualMarker's carve-out can never drift
// from renderInline's whitelist. No \b — mirrors renderInline's boundary-less
// __token__ match above, so an intra-word dunder strips identically.
const PROSE_DUNDER_RE = new RegExp('__(?:' + Array.from(PROSE_DUNDER).join('|') + ')__', 'g');

// Tokenize already-normalized text. Bold inner content is processed
// recursively so nested code spans (e.g. **a `x` b**) become <code> (which H16
// strips) instead of surviving as escaped &#96; entities inside <strong>.
function renderInline(s, esc) {
  const plain = (t) => esc(t).replace(PROSE_MDLINT, '<code>$&</code>');
  let out = '';
  let rest = s;
  let m;
  while ((m = PROSE_TOKEN.exec(rest)) !== null) {
    out += plain(rest.slice(0, m.index));
    const tok = m[0];
    if (m[1]) {
      // Double-backtick GFM span — inner may hold single backticks; esc()
      // turns them into &#96; which H16 strips along with the <code> wrapper.
      out += '<code>' + esc(tok.slice(2, -2).trim()) + '</code>';
    } else if (m[2]) {
      out += '<code>' + esc(tok.slice(1, -1)) + '</code>';
    } else if (m[3]) {
      out += '<strong>' + renderInline(tok.slice(2, -2), esc) + '</strong>';
    } else if (m[4]) {
      const inner = tok.slice(2, -2);
      // Leave Python dunders literal (H16 whitelists them) — converting
      // __init__ → <strong>init</strong> would distort technical prose.
      if (PROSE_DUNDER.has(inner)) out += plain(tok);
      else out += '<strong>' + renderInline(inner, esc) + '</strong>';
    } else if (m[5]) {
      const lt = tok.match(/^\[([^\]]+)\]/);
      out += plain(lt ? lt[1] : tok);
    }
    rest = rest.slice(m.index + tok.length);
  }
  out += plain(rest);
  return out;
}

function renderProseHtml(text, formatUtils) {
  const esc = (formatUtils && formatUtils.escapeHtml) || escapeHtml;
  return renderInline(normalizeProse(text), esc);
}

// Markdown path — normalizeProse only. Markdown keeps its own backtick/bold/
// link markers (they are legitimate there; H16 is HTML-only). H10 still scans
// md, so em-dash normalization is the one transform that applies.
function renderProseMd(text) {
  return normalizeProse(text);
}

// dashboard-interactivity M1 — block-level prose renderer. Mirrors renderProseHtml's
// escape-then-render SSoT (line 169) but lifts it from inline-only to block-level so
// the right drawer can show a plan summary / mitigation as the full structured prose
// (paragraphs, lists, fenced code, blockquotes, GFM tables) instead of a single joined
// line. INVARIANT (Codex critique F1, Constraint 3): EVERY rendered text path terminates
// in renderInline (or esc, for code fences) — there is no raw passthrough. Malformed
// structures (table without a separator row, an unterminated fence) degrade to an
// inline-rendered <p>, never to a literal `|`/backtick/`**` that would leak to H16.
// Defense-in-depth (Codex F1, Task 2): MAX_BLOCKS caps emitted nodes so no single
// section can balloon the DOM. fail-open — any throw returns escapeHtml(text).
const MAX_BLOCKS = 200;

// A separator row anchors a GFM table: must hold a pipe, at least one dash, and only
// table-frame characters. A header row alone is NOT a table (Codex F1) — the
// header+separator pair is the gate, else each line degrades to an inline <p>.
function isTableSeparatorRow(line) {
  const t = String(line == null ? '' : line).trim();
  return t.indexOf('|') !== -1 && t.indexOf('-') !== -1 && /^[|\s:-]+$/.test(t);
}

function splitTableRow(line) {
  return String(line == null ? '' : line)
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

// dashboard-interactivity M1.2 (Codex F-C1) — render-then-validate gate for the
// paragraph soft-break <br> path. A soft break can orphan an inline marker (bold
// ** / __, single or double backtick, md link) so a literal/entity marker
// survives renderInline. This scans an ALREADY-RENDERED candidate fragment
// against the H16 catalog (1:1 with output-constraints.js): if any marker leaked,
// the caller falls back to the known-good space-join. Carve-outs mirror H16 —
// strip rendered <code>/<pre> spans and Python dunders so legitimate output never
// forces a false fallback. esc() turns every backtick into &#96;, so single- and
// double-backtick straddles both surface as the entity-backtick pattern; ** / __
// / md-link stay literal (esc leaves them) and surface raw. Validating output
// (not a parity heuristic) covers all PROSE_TOKEN kinds, including double-backtick
// spans and md links a balance check would miss.
function hasResidualMarker(htmlFragment) {
  const ENT_BACKTICK = '(?:&#0*96;|&#[xX]0*60;|&grave;)';
  const stripped = String(htmlFragment == null ? '' : htmlFragment)
    .replace(/<code[\s\S]*?<\/code>/g, '')
    .replace(/<pre[\s\S]*?<\/pre>/g, '')
    .replace(PROSE_DUNDER_RE, '');
  // __ and entity-backtick mirror renderInline exactly so the gate is never less
  // sensitive than the path that produced the leak: __ stays boundary-less
  // (renderInline's __token__ has no \b, so an intra-word straddle is caught),
  // and the entity-backtick span uses a lazy any-char inner so an &-bearing code
  // body (esc → &amp;) between two straddled backticks no longer defeats the scan.
  return /\*\*[^*\n]+\*\*/.test(stripped)
    || /__[^_\n]+__/.test(stripped)
    || /`[^`\n]+`/.test(stripped)
    || new RegExp(ENT_BACKTICK + '[^\\n]+?' + ENT_BACKTICK).test(stripped)
    || /\[[^\]]+\]\([^)]+\)/.test(stripped);
}

function renderProseBlockHtml(text, formatUtils) {
  const esc = (formatUtils && formatUtils.escapeHtml) || escapeHtml;
  try {
    const normalized = normalizeProse(text);
    if (!normalized.trim()) return '';
    const lines = normalized.split('\n');
    const out = [];
    let i = 0;

    const blockStart = (s) => /^(```)/.test(s) || /^>\s?/.test(s)
      || /^[-*]\s+/.test(s) || /^\d+[.)]\s+/.test(s) || /^#{1,6}\s/.test(s);
    const tableStart = (idx) => idx + 1 < lines.length
      && lines[idx].indexOf('|') !== -1 && isTableSeparatorRow(lines[idx + 1]);
    const push = (html) => { if (out.length < MAX_BLOCKS) out.push(html); };

    while (i < lines.length && out.length < MAX_BLOCKS) {
      const trimmed = lines[i].trim();
      if (!trimmed) { i += 1; continue; }

      // Fenced code — body is esc-only (never inline-rendered: code is literal).
      // An unterminated fence drops the opening marker and degrades its body to
      // inline <p> per Codex F1 (no dangling backtick reaches H16).
      if (/^```/.test(trimmed)) {
        const body = [];
        i += 1;
        let closed = false;
        while (i < lines.length) {
          if (/^```\s*$/.test(lines[i].trim())) { closed = true; i += 1; break; }
          body.push(lines[i]);
          i += 1;
        }
        if (closed) {
          push('<pre><code>' + esc(body.join('\n')) + '</code></pre>');
        } else {
          for (const b of body) {
            if (b.trim()) push('<p>' + renderInline(b.trim(), esc) + '</p>');
          }
        }
        continue;
      }

      // Blockquote — consecutive `>` lines, soft-joined, inline-rendered.
      if (/^>\s?/.test(trimmed)) {
        const quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          quote.push(lines[i].trim().replace(/^>\s?/, ''));
          i += 1;
        }
        push('<blockquote>' + renderInline(quote.join(' '), esc) + '</blockquote>');
        continue;
      }

      // Unordered list.
      if (/^[-*]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
          i += 1;
        }
        push('<ul>' + items.map((it) => '<li>' + renderInline(it, esc) + '</li>').join('') + '</ul>');
        continue;
      }

      // Ordered list.
      if (/^\d+[.)]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
          i += 1;
        }
        push('<ol>' + items.map((it) => '<li>' + renderInline(it, esc) + '</li>').join('') + '</ol>');
        continue;
      }

      // GFM table — header + separator gate (Codex F1). Body rows run until a
      // non-pipe line. Every cell is inline-rendered.
      if (tableStart(i)) {
        const header = splitTableRow(lines[i]);
        i += 2;
        const body = [];
        while (i < lines.length && lines[i].indexOf('|') !== -1 && lines[i].trim()) {
          body.push(splitTableRow(lines[i]));
          i += 1;
        }
        const thead = '<thead><tr>' + header.map((c) => '<th>' + renderInline(c, esc) + '</th>').join('') + '</tr></thead>';
        const tbody = '<tbody>' + body.map((r) => '<tr>' + r.map((c) => '<td>' + renderInline(c, esc) + '</td>').join('') + '</tr>').join('') + '</tbody>';
        push('<table>' + thead + tbody + '</table>');
        continue;
      }

      // Heading — H15 forbids <h4>+, so a content heading renders as a styled
      // paragraph. .d-h carries weight + color + margin in CSS (NOT an inner
      // <strong> — that double-encoded the weight, M1.2 F1). The drawer owns the
      // <h2>/<h3> hierarchy; .d-h stays <= .d-sec h3 so a prose ## never inverts
      // the section-label hierarchy.
      const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
      if (heading) {
        push('<p class="d-h">' + renderInline(heading[1].trim(), esc) + '</p>');
        i += 1;
        continue;
      }

      // Paragraph — collect consecutive lines until a blank line or a new block
      // (including a lookahead-detected table). The drawer is a loud-on-demand
      // full-prose surface, so an intended soft break (mitigation steps, OQ
      // sub-lines) is preserved as <br> instead of collapsed to a space. The
      // candidate is per-line renderInline joined by <br>; render-then-validate
      // (Codex F-C1) falls back to the known-good space-join if a marker
      // straddled the break, so raw/entity marker leakage stays structurally 0.
      // The md path (renderProseBlockMd) keeps the \n, so HTML <br> == md \n.
      const para = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t || blockStart(t) || tableStart(i)) break;
        para.push(t);
        i += 1;
      }
      if (para.length) {
        const candidate = para.map((p) => renderInline(p, esc)).join('<br>');
        const safe = hasResidualMarker(candidate)
          ? renderInline(para.join(' '), esc)
          : candidate;
        push('<p>' + safe + '</p>');
      } else {
        i += 1;
      }
    }

    return out.join('');
  } catch (_) {
    return esc(String(text == null ? '' : text));
  }
}

// Block-level markdown path — like renderProseMd, normalizeProse only. Markdown
// already carries its own block markers (lists, fences, tables) legitimately, so
// the only render-time transform is H10 em-dash. Named for symmetry with
// renderProseBlockHtml; renderDetailMd consumes it for multi-line section bodies.
function renderProseBlockMd(text) {
  return normalizeProse(text);
}

module.exports = {
  STATUS_BADGES,
  formatRelativeTime,
  formatStatusBadge,
  mask,
  escapeHtml,
  escapeAttr,
  normalizeProse,
  renderProseHtml,
  renderProseMd,
  renderProseBlockHtml,
  renderProseBlockMd,
};
