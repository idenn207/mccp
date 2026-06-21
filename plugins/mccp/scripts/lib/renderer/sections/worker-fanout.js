'use strict';

// v1.3.0-m3-redux — plain <table class="workers">, no card wrapper, no inset
// box-shadow side-stripe. Worker state color lives on a span inside the
// status cell ONLY (color + icon + text 3-way per PRD line 169).

function tail(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(-n) : s;
}

function envelopeStatusKind(env) {
  if (!env || !env.ok) return 'secret-warn';
  if (env.stale) return 'worker-stale';
  if (env.is_terminal) {
    if (env.terminal_state === 'failure' || env.terminal_state === 'crashed' || env.terminal_state === 'timeout') {
      return 'terminal-failure';
    }
    return 'terminal-ok';
  }
  return 'worker-alive';
}

function kindClass(kind) {
  // Map STATUS_BADGE kinds to CSS class suffixes used in html.js .workers rules.
  if (kind === 'secret-warn' || kind === 'terminal-failure') return 'k-blocked';
  if (kind === 'worker-stale') return 'k-worker-stale';
  if (kind === 'worker-alive') return 'k-worker-alive';
  if (kind === 'terminal-ok') return 'k-terminal-ok';
  if (kind === 'in-progress') return 'k-in-progress';
  return '';
}

function renderWorkerFanout(model, formatUtils) {
  const { escapeHtml, formatRelativeTime, formatStatusBadge } = formatUtils;
  const m = model || {};
  const sources = m.sources || {};
  const envSrc = sources.envelopes || {};
  const items = envSrc.items || [];
  const stateItem = sources.state && sources.state.item;
  const controllerActive = !!(stateItem && stateItem.controller_active);

  if ((envSrc.count || items.length) === 0 && !controllerActive) {
    return null;
  }

  const mdRows = ['| 봉투 | 워커 | 상태 | 심박 | 산출물 |', '|---|---|---|---|---|'];
  const htmlRows = [];

  if (stateItem && stateItem.frontmatter && stateItem.frontmatter.controller_session_id) {
    const cid = tail(String(stateItem.frontmatter.controller_session_id), 8);
    const adc = stateItem.frontmatter.active_dispatch_count || 0;
    const parentKind = adc > 0 ? 'in-progress' : 'terminal-ok';
    const badge = formatStatusBadge(parentKind);
    mdRows.push('| `' + cid + '` | controller | ' + badge.icon + ' ' + badge.korean + ' | , | active_dispatch_count=' + adc + ' |');
    htmlRows.push(
      '<tr class="s-' + escapeHtml(parentKind) + '">'
      + '<td><code>' + escapeHtml(cid) + '</code></td>'
      + '<td>controller</td>'
      + '<td><span class="w-kind ' + kindClass(parentKind) + '">'
      + escapeHtml(badge.icon) + ' ' + escapeHtml(badge.korean) + '</span></td>'
      + '<td class="muted">,</td>'
      + '<td>active_dispatch_count=' + escapeHtml(String(adc)) + '</td>'
      + '</tr>'
    );
  }

  for (const env of items) {
    if (!env || !env.ok) {
      const errPath = env && env.path ? tail(String(env.path), 32) : '?';
      const errMsg = env && env.error ? String(env.error).slice(0, 60) : 'unknown';
      mdRows.push('| `' + errPath + '` | ⚠ envelope corrupt | , | , | ' + errMsg + ' |');
      htmlRows.push(
        '<tr class="s-blocked">'
        + '<td><code>' + escapeHtml(errPath) + '</code></td>'
        + '<td><span class="w-kind k-blocked">⚠ envelope corrupt</span></td>'
        + '<td class="muted">,</td><td class="muted">,</td>'
        + '<td>' + escapeHtml(errMsg) + '</td>'
        + '</tr>'
      );
      continue;
    }
    const did = tail(String(env.dispatch_id || ''), 8);
    const sub = env.worker_subagent_type || env.subagent_type || '(unknown)';
    const kind = envelopeStatusKind(env);
    const badge = formatStatusBadge(kind);
    const hb = env.heartbeat_at ? formatRelativeTime(env.heartbeat_at) : ',';
    const receipts = env.receipts_added != null ? String(env.receipts_added) : '0';
    mdRows.push('| `' + did + '` | ' + sub + ' | ' + badge.icon + ' ' + badge.korean + ' | ' + hb + ' | ' + receipts + ' |');
    htmlRows.push(
      '<tr class="s-' + escapeHtml(kind) + '">'
      + '<td><code>' + escapeHtml(did) + '</code></td>'
      + '<td>' + escapeHtml(sub) + '</td>'
      + '<td><span class="w-kind ' + kindClass(kind) + '">'
      + escapeHtml(badge.icon) + ' ' + escapeHtml(badge.korean) + '</span></td>'
      + '<td>' + escapeHtml(hb) + '</td>'
      + '<td>' + escapeHtml(receipts) + '</td>'
      + '</tr>'
    );
  }

  if (items.length === 0 && controllerActive) {
    const cid = tail(String((stateItem.frontmatter && stateItem.frontmatter.controller_session_id) || ''), 8);
    mdRows.push('| , | ⏱ controller `' + cid + '` active · envelopes missing | , | , | , |');
    htmlRows.push(
      '<tr class="s-stale">'
      + '<td class="muted">,</td>'
      + '<td><span class="w-kind k-worker-stale">⏱ controller <code>'
      + escapeHtml(cid) + '</code> active, envelopes missing</span></td>'
      + '<td class="muted">,</td><td class="muted">,</td><td class="muted">,</td>'
      + '</tr>'
    );
  }

  const md = mdRows.join('\n');
  const html =
    '<table class="workers"><thead><tr>'
    + '<th>봉투</th><th>워커</th><th>상태</th><th>심박</th><th>산출물</th>'
    + '</tr></thead><tbody>' + htmlRows.join('') + '</tbody></table>';

  return { md, html };
}

module.exports = { renderWorkerFanout, envelopeStatusKind };
