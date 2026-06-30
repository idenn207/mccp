/* Dashboard Interactivity M4 — write-mode client wiring (browser IIFE).
 *
 * dashboard-server.js reads this at serve time and injects it ONLY for a
 * --write server's `/` response, preceded by a config <script> that sets
 * window.__MCCP_RESOLVE_NONCE / __MCCP_RESOLVE_PATH / __MCCP_NONCE_HEADER. The
 * base cache status.html never contains this script, so the "제외" drawer
 * buttons stay inert (rendered hidden, no behavior) outside a write session.
 * Not dead code in the cache — it is simply never loaded there.
 *
 * Responsibilities:
 *   (1) Mark <body data-mccp-write> so DRAWER_SCRIPT un-hides .d-resolve buttons.
 *   (2) Delegate .d-resolve clicks → reason prompt → confirm → nonce'd fetch POST.
 *   (3) Honest result handling: success relies on the server's SSE reload (it
 *       re-rendered the collapsed marker); failure is loud and the source is
 *       guaranteed unchanged (server is fail-closed). This is the first fetch in
 *       the dashboard — every other surface is read-only.
 */
(function () {
  'use strict';
  var d = document;
  if (!d || !d.body) return;
  var NONCE = window.__MCCP_RESOLVE_NONCE;
  var PATH = window.__MCCP_RESOLVE_PATH || '/__mccp_resolve';
  var HEADER = window.__MCCP_NONCE_HEADER || 'x-mccp-nonce';
  if (!NONCE) return; // not write-mode → no-op.

  // (1) reveal — DRAWER_SCRIPT renders .d-resolve hidden unless this attr is set.
  d.body.setAttribute('data-mccp-write', '1');

  // polite live region for screen-reader announcements (a11y P3 — visually
  // hidden, announced on update).
  var live = d.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');
  live.style.position = 'absolute';
  live.style.width = '1px';
  live.style.height = '1px';
  live.style.margin = '-1px';
  live.style.padding = '0';
  live.style.overflow = 'hidden';
  live.style.clip = 'rect(0 0 0 0)';
  live.style.whiteSpace = 'nowrap';
  live.style.border = '0';
  d.body.appendChild(live);
  function announce(msg) {
    try { live.textContent = ''; live.textContent = msg; } catch (e) { /* ignore */ }
  }

  function submit(btn, id) {
    var reason = window.prompt('이 항목을 제외(obsolete) 처리할 사유를 입력하세요 (2단어 이상):', '');
    if (reason == null) return; // cancelled
    reason = String(reason).trim();
    if (reason.split(/\s+/).filter(Boolean).length < 2) {
      window.alert('사유는 2단어 이상이어야 합니다. 제외하지 않았습니다.');
      return;
    }
    if (!window.confirm("'" + reason + "' 사유로 이 항목을 제외 처리합니다.\n계속할까요? (해결 마커 삭제로 되돌릴 수 있습니다)")) return;

    btn.disabled = true;
    announce('제외 처리 중…');
    var headers = { 'content-type': 'application/json' };
    headers[HEADER] = NONCE;
    fetch(PATH, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ id: id, reason: reason }),
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'bad response' }; })
        .then(function (j) { return { status: r.status, body: j }; });
    }).then(function (res) {
      if (res.status === 200 && res.body && res.body.ok) {
        announce('제외 처리됨. 곧 새로고침됩니다.');
        // Server re-rendered status.html → SSE reload refreshes the collapsed
        // view. If render was pending (lock contention) reload as a fallback.
        if (res.body.rendered === false) { setTimeout(function () { location.reload(); }, 400); }
        return;
      }
      btn.disabled = false;
      var msg = (res.body && res.body.error) || ('HTTP ' + res.status);
      announce('제외 처리 실패: ' + msg);
      window.alert('제외 처리 실패: ' + msg + '\n소스 파일은 변경되지 않았습니다.');
      // A stale id means the dashboard drifted from the source — resync.
      if (res.body && res.body.stale) { setTimeout(function () { location.reload(); }, 400); }
    }).catch(function (e) {
      btn.disabled = false;
      announce('제외 처리 실패(네트워크).');
      window.alert('제외 처리 실패(네트워크): ' + (e && e.message) + '\n소스 파일은 변경되지 않았습니다.');
    });
  }

  // (2) event delegation — drawer buttons are re-created on each open, so a live
  // delegated listener is the right pattern (per-button binding would go stale).
  d.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('.d-resolve');
    if (!t || t.disabled) return;
    var id = t.getAttribute('data-resolve-id');
    if (!id) return;
    e.preventDefault();
    submit(t, id);
  });
})();
