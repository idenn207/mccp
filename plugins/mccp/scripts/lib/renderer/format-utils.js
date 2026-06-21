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

module.exports = {
  STATUS_BADGES,
  formatRelativeTime,
  formatStatusBadge,
  mask,
  escapeHtml,
  escapeAttr,
  normalizeProse,
};
