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

function formatRelativeTime(isoOrDate, now) {
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
};
