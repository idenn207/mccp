'use strict';

const MAX_ROWS = 8;

const RANK = { HIGH: 3, MEDIUM: 2, LOW: 1, '': 0 };
function rank(s) { return RANK[(s || '').toUpperCase()] || 0; }

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
    htmlRows.push(
      '<tr>'
      + '<td>' + escapeHtml(r.risk || '') + '</td>'
      + '<td>' + escapeHtml(lik) + '</td>'
      + '<td>' + escapeHtml(imp) + '</td>'
      + '<td>' + escapeHtml(mit) + '</td>'
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
