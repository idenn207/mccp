'use strict';

function renderMarkdown(model, sections, verdict, derivedAt, formatUtils) {
  const { formatRelativeTime, normalizeProse } = formatUtils;
  const norm = typeof normalizeProse === 'function' ? normalizeProse : (s) => s;
  const verdictText = norm(verdict.text);
  const m = model || {};
  const [grid, pipeline, fanout, activeSessions, timeline, questions, risks, milestoneHistory, multiSession] = sections;

  const now = Date.now();
  const derivedMs = new Date(derivedAt).getTime();
  const relative = formatRelativeTime(derivedAt, now);
  const isStale = Number.isFinite(derivedMs) && (now - derivedMs) > 60_000;

  const out = [];
  out.push('# mccp 상태 · ' + verdict.icon + ' ' + verdictText);
  out.push('');
  out.push('_마지막 갱신: ' + derivedAt + ' · ' + relative + '_');
  out.push('');
  if (m.masked === false) {
    out.push('> ⚠ **raw 모드 — 절대 외부 공유 금지** (경로 unmasked)');
    out.push('');
  }
  if (isStale) {
    out.push('> ⏱ rendered ' + relative + '; refresh recommended');
    out.push('');
  }

  const anchors = ['[verdict](#verdict)', '[대시보드](#대시보드)'];
  if (pipeline) anchors.push('[파이프라인](#파이프라인)');
  if (fanout) anchors.push('[워커](#워커)');
  if (multiSession) anchors.push('[멀티세션](#멀티세션-진행)');
  if (activeSessions) anchors.push('[최근-활동](#최근-활동)');
  anchors.push('[타임라인](#타임라인)');
  if (milestoneHistory) anchors.push('[마일스톤-기록](#마일스톤-기록)');
  if (questions) anchors.push('[질문](#질문)');
  anchors.push('[위험](#위험)');
  out.push(anchors.join(' · '));
  out.push('');
  out.push('---');
  out.push('');

  out.push('## Verdict');
  out.push('');
  out.push('> ' + verdict.icon + ' ' + verdictText);
  // M6 Task 4 — Hero subtext(요약 prose) plain-text 동등 한 줄 보조.
  if (verdict.subtext) {
    out.push('>');
    out.push('> ' + norm(verdict.subtext));
  }
  out.push('');
  out.push('---');
  out.push('');

  out.push('## 대시보드');
  out.push('');
  if (grid) { out.push(grid.md); out.push(''); }
  out.push('---');
  out.push('');

  if (pipeline) {
    out.push('## 파이프라인');
    out.push('');
    out.push(pipeline.md);
    out.push('');
    out.push('---');
    out.push('');
  }

  if (fanout) {
    out.push('## 워커');
    out.push('');
    out.push(fanout.md);
    out.push('');
    out.push('---');
    out.push('');
  }

  if (multiSession) {
    out.push('## 멀티세션 진행');
    out.push('');
    out.push(multiSession.md);
    out.push('');
    out.push('---');
    out.push('');
  }

  if (activeSessions) {
    out.push('## 최근 활동');
    out.push('');
    out.push(activeSessions.md);
    out.push('');
    out.push('---');
    out.push('');
  }

  out.push('## 타임라인');
  out.push('');
  if (timeline) { out.push(timeline.md); out.push(''); }
  out.push('---');
  out.push('');

  if (milestoneHistory) {
    out.push('## 마일스톤 기록');
    out.push('');
    out.push(milestoneHistory.md);
    out.push('');
    out.push('---');
    out.push('');
  }

  if (questions) {
    out.push('## 질문');
    out.push('');
    out.push(questions.md);
    out.push('');
    out.push('---');
    out.push('');
  }

  out.push('## 위험');
  out.push('');
  if (risks) { out.push(risks.md); out.push(''); }
  out.push('---');
  out.push('');

  out.push('_derived from .claude/ · v1.18.18_');
  out.push('');

  return out.join('\n');
}

module.exports = { renderMarkdown };
