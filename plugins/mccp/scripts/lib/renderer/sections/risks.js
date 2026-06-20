'use strict';

const MAX_ROWS = 8;

const RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, '': 0 };
function rank(s) { return RANK[(s || '').toUpperCase()] || 0; }

const SEV_CLASS = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };
function sevClass(s) {
  const k = (s || '').toUpperCase().match(/^(CRITICAL|HIGH|MEDIUM|LOW)/);
  return k ? SEV_CLASS[k[1]] : 'idle';
}
function rowTone(impact, likelihood) {
  const a = rank(impact);
  const b = rank(likelihood);
  const m = Math.max(a, b);
  if (m >= 4) return 'critical';
  if (m >= 3) return 'high';
  if (m >= 2) return 'medium';
  if (m >= 1) return 'low';
  return 'idle';
}

function renderRisks(model, formatUtils, planBody) {
  const { escapeHtml } = formatUtils;
  const pb = planBody || {};
  const allRisks = Array.isArray(pb.risks) ? pb.risks.slice() : [];

  if (allRisks.length === 0) {
    return {
      md: '_(no risks surface available)_',
      html: '<p class="muted"><em>no risks surface available</em></p>',
    };
  }

  allRisks.sort((a, b) => {
    const di = rank(b.impact) - rank(a.impact);
    if (di !== 0) return di;
    return rank(b.likelihood) - rank(a.likelihood);
  });

  const shown = allRisks.slice(0, MAX_ROWS);
  const moreCount = Math.max(0, allRisks.length - MAX_ROWS);

  const mdRows = ['| Risk | Likelihood | Impact | Mitigation |', '|---|---|---|---|'];
  const htmlRows = [];
  for (const r of shown) {
    const risk = (r.risk || '').replace(/\|/g, '\\|');
    const lik = (r.likelihood || '');
    const imp = (r.impact || '');
    const mit = (r.mitigation || '').replace(/\|/g, '\\|');
    mdRows.push('| ' + risk + ' | ' + lik + ' (' + (lik[0] || '-') + ') | ' + imp + ' (' + (imp[0] || '-') + ') | ' + mit + ' |');
    const tone = rowTone(imp, lik);
    const likPill = lik
      ? '<span class="sev-pill s-' + sevClass(lik) + '">' + escapeHtml(lik) + '</span>'
      : '<span class="muted">—</span>';
    const impPill = imp
      ? '<span class="sev-pill s-' + sevClass(imp) + '">' + escapeHtml(imp) + '</span>'
      : '<span class="muted">—</span>';
    htmlRows.push(
      '<tr data-tone="' + tone + '">'
      + '<td class="risk-name">' + escapeHtml(r.risk || '') + '</td>'
      + '<td>' + likPill + '</td>'
      + '<td>' + impPill + '</td>'
      + '<td class="risk-mit">' + escapeHtml(mit) + '</td>'
      + '</tr>'
    );
  }
  let md = mdRows.join('\n');
  if (moreCount > 0) md += '\n_+' + moreCount + ' less critical_';

  const html =
    '<table class="risks"><thead><tr>'
    + '<th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th>'
    + '</tr></thead><tbody>' + htmlRows.join('') + '</tbody></table>'
    + (moreCount > 0 ? '<p class="muted"><em>+' + moreCount + ' less critical</em></p>' : '');

  return { md, html };
}

module.exports = { renderRisks };
