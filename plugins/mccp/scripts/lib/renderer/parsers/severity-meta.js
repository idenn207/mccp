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

module.exports = { SEVERITY_META, severityMeta, severityTagHtml };
