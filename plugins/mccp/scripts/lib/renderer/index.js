'use strict';

const formatUtils = require('./format-utils');
const { computeVerdict } = require('./verdict');
const { parsePlanBody } = require('./parsers/plan-body');
const { renderStatusGrid } = require('./sections/status-grid');
const { renderPipeline } = require('./sections/pipeline');
const { renderWorkerFanout } = require('./sections/worker-fanout');
const { renderActiveSessions } = require('./sections/active-sessions');
const { renderMultiSession } = require('./sections/multi-session');
const { renderAuditTimeline } = require('./sections/audit-timeline');
const { renderOpenQuestions } = require('./sections/open-questions');
const { renderRisks } = require('./sections/risks');
const { renderMilestoneHistory } = require('./sections/milestone-history');
const { renderMswMetrics } = require('./sections/msw-metrics');
const { dedupOQAndRisks } = require('./parsers/cross-section-dedupe');
const { annotateResolution } = require('./parsers/resolution-classify');
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

    // M2 — cross-section dedupe (Risks 자체 보존, cue만 첨부). fail-open.
    try {
      if (planBody && Array.isArray(planBody.openQuestions) && Array.isArray(planBody.risks)) {
        const { openQuestions, risks } = dedupOQAndRisks(planBody.openQuestions, planBody.risks);
        planBody.openQuestions = openQuestions;
        planBody.risks = risks;
      }
    } catch (err) {
      process.stderr.write('[mccp:renderer] cross-section-dedupe FAILED ' + err.message + ' (allow)\n');
    }

    // M3 — 해결 마커 전파(결정적). dedupe 가 risk 객체를 Object.assign 으로 보존하므로
    // resolved flag 가 살아남는다. annotateResolution 은 boolean 정규화 seam. fail-open.
    try { annotateResolution(planBody); }
    catch (err) {
      process.stderr.write('[mccp:renderer] annotate-resolution FAILED ' + err.message + ' (allow)\n');
    }

    const verdict = (function () {
      try { return computeVerdict(m, planBody, opts); }
      catch (err) {
        process.stderr.write('[mccp:renderer] verdict FAILED ' + err.message + ' (allow)\n');
        return { tone: 'red', icon: '🚫', text: 'verdict computation failed' };
      }
    })();

    // v1.3.0-m5 — audit-timeline reads from .claude/cache/snapshots/ when
    // the snapshotsDir opt is provided (or resolves automatically from
    // model.repo_root in raw mode). Tests pass `opts.snapshotsDir=null` to
    // suppress the snapshot read path entirely.
    const snapshotsDir = (function () {
      if (opts.snapshotsDir === null) return null;
      if (typeof opts.snapshotsDir === 'string') return opts.snapshotsDir;
      const root = (typeof m.repo_root === 'string'
        && m.repo_root !== '<repo>'
        && require('path').isAbsolute(m.repo_root)) ? m.repo_root : null;
      if (!root) return null;
      return require('path').join(root, '.claude', 'cache', 'snapshots');
    })();

    const grid = safeSection('status-grid', () => renderStatusGrid(m, formatUtils, planBody, opts));
    const pipeline = safeSection('pipeline', () => renderPipeline(m, formatUtils, planBody, opts));
    const fanout = safeSection('worker-fanout', () => renderWorkerFanout(m, formatUtils));
    const activeSessions = safeSection('active-sessions', () => renderActiveSessions(m, formatUtils));
    const multiSession = safeSection('multi-session', () => renderMultiSession(m, formatUtils, opts, planBody));
    const timeline = safeSection('audit-timeline',
      () => renderAuditTimeline(m, formatUtils, opts && opts.now, { snapshotsDir: snapshotsDir }));
    const questions = safeSection('open-questions', () => renderOpenQuestions(m, formatUtils, planBody, opts));
    const risks = safeSection('risks', () => renderRisks(m, formatUtils, planBody, opts));
    const milestoneHistory = safeSection('milestone-history',
      () => renderMilestoneHistory(m, formatUtils, planBody, opts));
    const mswMetrics = safeSection('msw-metrics',
      () => renderMswMetrics(m, formatUtils, opts));

    const sections = [grid, pipeline, fanout, activeSessions, timeline, questions, risks, milestoneHistory, multiSession, mswMetrics];
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

    // v1.3.0-m3 DESIGN.md H1-H14 mechanical lint. Pure function of the
    // CSS literal + composed HTML/MD. Fail-open per Codex F2 absorption:
    // a broken lint subsystem surfaces via `design_lint_degraded` instead
    // of silently passing as a clean render.
    const lintResult = (function () {
      try {
        const { runOutputConstraints } = require('./output-constraints');
        const { TOKENS, LAYOUT } = require('./html');
        if (opts._injectLintThrow) throw new Error('injected lint throw');
        return runOutputConstraints({ css: TOKENS + LAYOUT, html, md });
      } catch (err) {
        process.stderr.write('[mccp:renderer] design-lint FAILED '
          + ((err && err.message) || err) + ' (allow)\n');
        return {
          violations: [],
          details: [],
          degraded: true,
          degraded_reason: (err && err.message) || String(err),
        };
      }
    })();

    const warnings = (m.warnings || []).concat(planBody.warnings || []);
    // Codex F3 absorption: route lint results into the same warnings array
    // verdict.js consumes, so violations are observable in the verdict
    // chain rather than dead data on the return shape.
    if (lintResult.violations.length > 0) {
      warnings.push({
        severity: 'medium',
        source: 'renderer.design-lint',
        message: lintResult.violations.length + ' design-lint violations: '
          + lintResult.violations.join(','),
      });
    }
    if (lintResult.degraded) {
      warnings.push({
        severity: 'medium',
        source: 'renderer.design-lint',
        message: 'design-lint subsystem degraded: '
          + (lintResult.degraded_reason || 'unknown'),
      });
    }

    return {
      md, html, derivedAt,
      masked: !!m.masked,
      warnings,
      verdict,
      design_constraint_violations: lintResult.violations,
      design_lint_degraded: !!lintResult.degraded,
    };
  } catch (err) {
    process.stderr.write('[mccp:renderer] outer FAILED ' + (err && err.message) + ' (allow)\n');
    return safeFallback(err);
  }
}

module.exports = { renderStatus, safeSection, safeCompose, safeFallback };
