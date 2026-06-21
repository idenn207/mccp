'use strict';

// v1.3.0-m3-redux — plain table, no card wrapper, no severity pills.
// Severity surfaces as a small lowercase tag (`<span class="tag t-critical">critical</span>`).
// Only `critical` ever takes signal-red color; `high/medium/low` stay ink/muted.

const MAX_ROWS = 8;

const RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, '': 0 };
function rank(s) { return RANK[(s || '').toUpperCase()] || 0; }

function tagClass(s) {
  const k = (s || '').toUpperCase().match(/^(CRITICAL|HIGH|MEDIUM|LOW)/);
  return k ? 't-' + k[1].toLowerCase() : '';
}
function tagWord(s) {
  const k = (s || '').toUpperCase().match(/^(CRITICAL|HIGH|MEDIUM|LOW)/);
  return k ? k[1].toLowerCase() : '';
}

function renderRisks(model, formatUtils, planBody) {
  const { escapeHtml, normalizeProse } = formatUtils;
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
    mdRows.push('| ' + risk + ' | ' + lik + ' | ' + imp + ' | ' + mit + ' |');

    const likTag = lik
      ? '<span class="tag ' + tagClass(lik) + '">' + tagWord(lik) + '</span>'
      : '<span class="muted">,</span>';
    const impTag = imp
      ? '<span class="tag ' + tagClass(imp) + '">' + tagWord(imp) + '</span>'
      : '<span class="muted">,</span>';
    htmlRows.push(
      '<tr>'
      + '<td class="risk-name">' + escapeHtml(normalizeProse(r.risk || '')) + '</td>'
      + '<td>' + likTag + '</td>'
      + '<td>' + impTag + '</td>'
      + '<td class="risk-mit">' + escapeHtml(normalizeProse(mit)) + '</td>'
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
