'use strict';

// v1.4.0-m2 — STATUS.md "Active Sessions" surface.
// Pure function of derive `state.item.active_session_ledgers`. Graceful hide
// (return null) when no active ledgers — keeps the dashboard quiet for the
// single-worktree case, which is the common path.
//
// The renderer does not know which ledger is "self" (the worktree generating
// the STATUS.md vs the sibling reading it later), so every active ledger is
// surfaced. PM consumers infer self via the sticky verdict block elsewhere.

function tail(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(-n) : s;
}

function formatAge(createdAtIso, now) {
  const t = Date.parse(createdAtIso);
  if (!Number.isFinite(t)) return '?';
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  if (seconds < 60) return '~now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h';
  const days = Math.floor(hours / 24);
  return days + 'd';
}

function renderActiveSessions(model, formatUtils, options) {
  const { escapeHtml } = formatUtils;
  const m = model || {};
  const sources = m.sources || {};
  const stateItem = sources.state && sources.state.item;
  const ledgers = stateItem && Array.isArray(stateItem.active_session_ledgers)
    ? stateItem.active_session_ledgers
    : [];

  if (ledgers.length === 0) return null;

  const now = (options && Number.isFinite(options.now)) ? options.now : Date.now();

  const mdRows = ['| 세션 | 브랜치 | 위치 | 호스트 | 시작 |', '|---|---|---|---|---|'];
  const htmlRows = [];

  for (const led of ledgers) {
    if (!led) continue;
    const shortId = tail(String(led.session_id || ''), 8) || '—';
    const branch = led.git_branch || '(no branch)';
    const cwd = led.cwd || '—';
    const host = led.host || '—';
    const age = formatAge(led.created_at, now);

    mdRows.push(
      '| `' + shortId + '` | ' + branch + ' | ' + cwd + ' | ' + host + ' | ' + age + ' |'
    );
    htmlRows.push(
      '<tr>'
      + '<td><code>' + escapeHtml(shortId) + '</code></td>'
      + '<td>' + escapeHtml(branch) + '</td>'
      + '<td>' + escapeHtml(cwd) + '</td>'
      + '<td>' + escapeHtml(host) + '</td>'
      + '<td>' + escapeHtml(age) + '</td>'
      + '</tr>'
    );
  }

  if (htmlRows.length === 0) return null;

  const md = mdRows.join('\n');
  const html =
    '<table class="active-sessions"><thead><tr>'
    + '<th>세션</th><th>브랜치</th><th>위치</th><th>호스트</th><th>시작</th>'
    + '</tr></thead><tbody>' + htmlRows.join('') + '</tbody></table>';

  return { md, html };
}

module.exports = { renderActiveSessions, formatAge };
