'use strict';

function renderMarkdown(model, sections, verdict, derivedAt, formatUtils) {
  const { formatRelativeTime } = formatUtils;
  const m = model || {};
  const [grid, fanout, activeSessions, timeline, questions, risks] = sections;

  const now = Date.now();
  const derivedMs = new Date(derivedAt).getTime();
  const relative = formatRelativeTime(derivedAt, now);
  const isStale = Number.isFinite(derivedMs) && (now - derivedMs) > 60_000;

  const out = [];
  out.push('# mccp Status · ' + verdict.icon + ' ' + verdict.text);
  out.push('');
  out.push('_Last refreshed: ' + derivedAt + ' · ' + relative + '_');
  out.push('');
  if (m.masked === false) {
    out.push('> ⚠ **raw mode — 절대 외부 공유 금지** (경로 unmasked)');
    out.push('');
  }
  if (isStale) {
    out.push('> ⏱ rendered ' + relative + '; refresh recommended');
    out.push('');
  }

  const anchors = ['[verdict](#verdict)', '[status](#status)'];
  if (fanout) anchors.push('[workers](#workers)');
  if (activeSessions) anchors.push('[sessions](#sessions)');
  anchors.push('[timeline](#timeline)');
  if (questions) anchors.push('[questions](#questions)');
  anchors.push('[risks](#risks)');
  out.push(anchors.join(' · '));
  out.push('');
  out.push('---');
  out.push('');

  out.push('## Verdict');
  out.push('');
  out.push('> ' + verdict.icon + ' ' + verdict.text);
  out.push('');
  out.push('---');
  out.push('');

  out.push('## Status');
  out.push('');
  if (grid) { out.push(grid.md); out.push(''); }
  out.push('---');
  out.push('');

  if (fanout) {
    out.push('## Workers');
    out.push('');
    out.push(fanout.md);
    out.push('');
    out.push('---');
    out.push('');
  }

  if (activeSessions) {
    out.push('## Active Sessions');
    out.push('');
    out.push(activeSessions.md);
    out.push('');
    out.push('---');
    out.push('');
  }

  out.push('## Timeline');
  out.push('');
  if (timeline) { out.push(timeline.md); out.push(''); }
  out.push('---');
  out.push('');

  if (questions) {
    out.push('## Open Questions');
    out.push('');
    out.push(questions.md);
    out.push('');
    out.push('---');
    out.push('');
  }

  out.push('## Risks');
  out.push('');
  if (risks) { out.push(risks.md); out.push(''); }
  out.push('---');
  out.push('');

  out.push('_Derived from .claude/ via plugins/mccp/scripts/derive · v1.3.0-m3 renderer_');
  out.push('');

  return out.join('\n');
}

module.exports = { renderMarkdown };
