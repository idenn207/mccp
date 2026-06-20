'use strict';

// v1.4.0-m2 — STATUS.md "Active Sessions" surface.
// Pure function of derive `state.item.active_session_ledgers`. Graceful hide
// (return null) when no active ledgers — keeps the dashboard quiet for the
// single-worktree case, which is the common path.
//
// v1.4.0-m3 — self/other 시각 구분. derive `state.item.self_session_id` (Codex
// Implement R1 F3 absorption contracted surface) 가 set이면 매칭 row를
// **this worktree** 마커로 시각 구분. set이 아니거나 매칭 0건이면 M2 ship
// 행동 그대로(graceful degrade) — null fallback. PM consumer는 단일 row scan
// 만으로 self를 즉시 인식해 reconciliation friction을 줄인다.

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

  const selfId = stateItem && typeof stateItem.self_session_id === 'string'
    ? stateItem.self_session_id
    : null;

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
    const isSelf = selfId && led.session_id === selfId;

    const mdFirstCol = isSelf
      ? '**this worktree** `' + shortId + '`'
      : '`' + shortId + '`';
    mdRows.push(
      '| ' + mdFirstCol + ' | ' + branch + ' | ' + cwd + ' | ' + host + ' | ' + age + ' |'
    );
    const htmlFirstCell = isSelf
      ? '<td><strong>this worktree</strong> <code>' + escapeHtml(shortId) + '</code></td>'
      : '<td><code>' + escapeHtml(shortId) + '</code></td>';
    const trOpen = isSelf ? '<tr class="self">' : '<tr>';
    htmlRows.push(
      trOpen
      + htmlFirstCell
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
