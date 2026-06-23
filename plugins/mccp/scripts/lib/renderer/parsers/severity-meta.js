'use strict';

const SEVERITY_META = {
  CRITICAL: { visible: 'CRITICAL', srLabel: '최고', icon: '🔴', className: 's-critical' },
  HIGH:     { visible: 'HIGH',     srLabel: '높음', icon: '🟠', className: 's-high' },
  MEDIUM:   { visible: 'MEDIUM',   srLabel: '중간', icon: '🟡', className: 's-medium' },
  LOW:      { visible: 'LOW',      srLabel: '낮음', icon: '⚪', className: 's-low' },
  UNKNOWN:  { visible: 'UNKNOWN',  srLabel: '미상', icon: '⚪', className: 's-unknown' },
};

function severityMeta(sev) {
  return SEVERITY_META[String(sev || 'UNKNOWN').toUpperCase()] || SEVERITY_META.UNKNOWN;
}

function severityTagHtml(sev, escapeHtml) {
  const meta = severityMeta(sev);
  return '<span class="severity-tag ' + meta.className
    + '" aria-label="위험도: ' + meta.srLabel + '">'
    + '<span class="icon" aria-hidden="true">' + meta.icon + '</span> '
    + escapeHtml(meta.visible)
    + '</span>';
}

// v1.18.0 M2 — sample `.sev` badge. 3 color tiers (s-high/s-med/s-low), literal
// abbreviated text (HIGH/MED/LOW). Severity is conveyed by TEXT (non-color a11y)
// + aria-label; no emoji, no chrome pill (H12 .sev-pill 금지). CRITICAL folds
// into the high tier; UNKNOWN into low.
const SEV_BADGE = {
  CRITICAL: { cls: 's-high', text: 'CRIT', srLabel: '최고' },
  HIGH: { cls: 's-high', text: 'HIGH', srLabel: '높음' },
  MEDIUM: { cls: 's-med', text: 'MED', srLabel: '중간' },
  LOW: { cls: 's-low', text: 'LOW', srLabel: '낮음' },
  UNKNOWN: { cls: 's-low', text: 'LOW', srLabel: '미상' },
};

function sevBadgeHtml(sev) {
  const meta = SEV_BADGE[String(sev || 'UNKNOWN').toUpperCase()] || SEV_BADGE.UNKNOWN;
  return '<span class="sev ' + meta.cls + '" aria-label="위험도: ' + meta.srLabel + '">'
    + meta.text + '</span>';
}

module.exports = { SEVERITY_META, severityMeta, severityTagHtml, SEV_BADGE, sevBadgeHtml };
