'use strict';

const formatUtils = require('./format-utils');
const { computeVerdict } = require('./verdict');
const { parsePlanBody } = require('./parsers/plan-body');
const { renderStatusGrid } = require('./sections/status-grid');
const { renderWorkerFanout } = require('./sections/worker-fanout');
const { renderAuditTimeline } = require('./sections/audit-timeline');
const { renderOpenQuestions } = require('./sections/open-questions');
const { renderRisks } = require('./sections/risks');
const { renderMarkdown } = require('./markdown');
const { renderHtml } = require('./html');

function safeSection(name, fn) {
  try { return fn(); }
  catch (err) {
    process.stderr.write('[mccp:renderer] section=' + name
      + ' FAILED ' + (err && err.message || err) + ' (allow)\n');
    return {
      md: '> ⚠ section "' + name + '" failed to render: ' + String((err && err.message) || 'unknown').slice(0, 120),
      html: '<aside class="s-blocked">⚠ section "' + name + '" failed to render</aside>',
    };
  }
}

function safeCompose(name, fn, fallback) {
  try { return fn(); }
  catch (err) {
    process.stderr.write('[mccp:renderer] composer=' + name
      + ' FAILED ' + (err && err.message || err) + ' (allow)\n');
    return fallback;
  }
}

function safeFallback(err) {
  const msg = String((err && err.message) || err || 'unknown').slice(0, 200);
  const escaped = msg
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const derivedAt = new Date().toISOString();
  const md = [
    '# mccp Status · 🚫 render failed: ' + msg,
    '',
    '_Last refreshed: ' + derivedAt + '_',
    '',
    '> Render failed. See stderr for diagnostics.',
    '',
  ].join('\n');
  const html = [
    '<!doctype html>',
    '<html lang="ko"><head><meta charset="utf-8">',
    '<title>mccp Status · render failed</title>',
    '<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:1rem;color:#222}',
    'aside[role="alert"]{background:#c52026;color:#fff;padding:0.75rem;border-radius:4px}</style>',
    '</head><body>',
    '<aside role="alert">🚫 mccp render failed: ' + escaped + '</aside>',
    '<p>Render facade caught an exception. Check stderr for traceback.</p>',
    '</body></html>',
  ].join('\n');
  return {
    md, html, derivedAt,
    masked: true,
    warnings: [{ source: 'renderer.index', message: msg, severity: 'critical' }],
    verdict: { tone: 'red', icon: '🚫', text: 'render failed: ' + msg },
  };
}

function renderStatus(model, opts) {
  opts = opts || {};
  try {
    const m = model || {};
    const planBody = (function () {
      try { return parsePlanBody(m, opts); }
      catch (err) {
        process.stderr.write('[mccp:renderer] plan-body-parse FAILED ' + err.message + ' (allow)\n');
        return { planStatuses: new Map(), openQuestions: [], risks: [], warnings: [], degraded: true };
      }
    })();

    const verdict = (function () {
      try { return computeVerdict(m, planBody); }
      catch (err) {
        process.stderr.write('[mccp:renderer] verdict FAILED ' + err.message + ' (allow)\n');
        return { tone: 'red', icon: '🚫', text: 'verdict computation failed' };
      }
    })();

    const grid = safeSection('status-grid', () => renderStatusGrid(m, formatUtils, planBody));
    const fanout = safeSection('worker-fanout', () => renderWorkerFanout(m, formatUtils));
    const timeline = safeSection('audit-timeline', () => renderAuditTimeline(m, formatUtils));
    const questions = safeSection('open-questions', () => renderOpenQuestions(m, formatUtils, planBody));
    const risks = safeSection('risks', () => renderRisks(m, formatUtils, planBody));

    const sections = [grid, fanout, timeline, questions, risks];
    const derivedAt = m.derived_at || new Date().toISOString();

    const md = safeCompose(
      'markdown',
      () => (opts._injectComposerThrow === 'markdown'
        ? (() => { throw new Error('injected'); })()
        : renderMarkdown(m, sections, verdict, derivedAt, formatUtils)),
      '# mccp Status · 🚫 markdown composer failed\n',
    );

    const html = safeCompose(
      'html',
      () => (opts._injectComposerThrow === 'html'
        ? (() => { throw new Error('injected'); })()
        : renderHtml(m, sections, verdict, derivedAt, formatUtils)),
      '<!doctype html><html><body><aside>html composer failed</aside></body></html>',
    );

    return {
      md, html, derivedAt,
      masked: !!m.masked,
      warnings: (m.warnings || []).concat(planBody.warnings || []),
      verdict,
    };
  } catch (err) {
    process.stderr.write('[mccp:renderer] outer FAILED ' + (err && err.message) + ' (allow)\n');
    return safeFallback(err);
  }
}

module.exports = { renderStatus, safeSection, safeCompose, safeFallback };
