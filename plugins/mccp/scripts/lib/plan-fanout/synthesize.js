'use strict';

// plan-fanout synthesize — deterministic markdown assembly of the fan-out
// perspective results into a `## Multi-Perspective Fan-out` plan section.
//
// Pure, dep-free, NO LLM call (Design Decision 6 — reproducible + resumeFromRunId
// friendly). Mirrors the derive/ renderer's pure markdown assembly and the
// honest-fallback-string convention: when every perspective failed, return an
// explicit sentinel line the caller treats as a fall-back-to-inline signal.

const SECTION_HEADING = '## Multi-Perspective Fan-out';
const NO_PERSPECTIVES_SENTINEL =
  'fan-out yielded no perspectives — inline grounding used';

const SEVERITY_RANK = Object.freeze({ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 });
const PERSPECTIVE_ORDER = Object.freeze(['architect', 'security', 'test', 'explorer']);

function severityRank(sev) {
  const r = SEVERITY_RANK[String(sev || '').toUpperCase()];
  return r === undefined ? 4 : r;
}

function perspectiveRank(key) {
  const r = PERSPECTIVE_ORDER.indexOf(String(key || ''));
  return r === -1 ? PERSPECTIVE_ORDER.length : r;
}

function formatTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return 'n/a';
  return '~' + Math.round(n / 1000) + 'k';
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

// dedup preserving first-seen order; drops empty/whitespace entries.
function uniq(list) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const s = String(list[i]);
    if (s.trim() === '' || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

// synthesizeFanout({perspectives, spent, budgetTotal}) → markdown string
// perspectives MAY contain null elements (agent() returns null on worker
// failure); they are filtered. All-null / empty → sentinel fallback string.
function synthesizeFanout(opts) {
  opts = opts || {};
  const perspectives = asArray(opts.perspectives).filter(Boolean);

  if (perspectives.length === 0) {
    return SECTION_HEADING + '\n\n> ' + NO_PERSPECTIVES_SENTINEL + '.\n';
  }

  const covered = perspectives.map(function (p) {
    return p && p.perspective ? String(p.perspective) : '(unknown)';
  });

  // Collect + tag findings with their perspective, then severity-rank (stable
  // by perspective order within a severity band).
  const taggedFindings = [];
  perspectives.forEach(function (p) {
    const key = p && p.perspective ? String(p.perspective) : '(unknown)';
    asArray(p && p.findings).forEach(function (f) {
      if (!f || typeof f !== 'object') return;
      taggedFindings.push({
        key: key,
        claim: String(f.claim || '').trim(),
        evidence: String(f.evidence || '').trim(),
        severity: String(f.severity || 'UNKNOWN').toUpperCase(),
      });
    });
  });
  taggedFindings.sort(function (a, b) {
    const s = severityRank(a.severity) - severityRank(b.severity);
    if (s !== 0) return s;
    return perspectiveRank(a.key) - perspectiveRank(b.key);
  });

  const tag = function (p, s) { return String(s) + '  _(' + (p.perspective || '?') + ')_'; };
  const metaGaps = uniq(perspectives.reduce(function (acc, p) {
    return acc.concat(asArray(p && p.metaGaps).map(function (g) { return tag(p, g); }));
  }, []));
  const patterns = uniq(perspectives.reduce(function (acc, p) {
    return acc.concat(asArray(p && p.patternsToMirror).map(function (g) { return tag(p, g); }));
  }, []));

  const budgetSuffix = (Number.isFinite(opts.budgetTotal) && opts.budgetTotal > 0)
    ? ' / budget ' + formatTokens(opts.budgetTotal) : '';

  const lines = [];
  lines.push(SECTION_HEADING);
  lines.push('');
  lines.push('<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->');
  lines.push('');
  lines.push('**Coverage**: ' + perspectives.length + '/4 perspectives (' +
    covered.join(', ') + ') · spent ' + formatTokens(opts.spent) + budgetSuffix + '.');
  lines.push('');

  lines.push('### Findings (severity-ranked)');
  lines.push('');
  if (taggedFindings.length === 0) {
    lines.push('- (no findings surfaced)');
  } else {
    taggedFindings.forEach(function (f) {
      const ev = f.evidence ? ' — ' + f.evidence : '';
      lines.push('- **[' + f.severity + '][' + f.key + ']** ' + f.claim + ev);
    });
  }
  lines.push('');

  lines.push('### Meta-gaps');
  lines.push('');
  if (metaGaps.length === 0) {
    lines.push('- (none surfaced)');
  } else {
    metaGaps.forEach(function (g) { lines.push('- ' + g); });
  }
  lines.push('');

  lines.push('### Patterns to mirror');
  lines.push('');
  if (patterns.length === 0) {
    lines.push('- (none surfaced)');
  } else {
    patterns.forEach(function (g) { lines.push('- ' + g); });
  }
  lines.push('');

  return lines.join('\n');
}

module.exports = {
  synthesizeFanout: synthesizeFanout,
  SECTION_HEADING: SECTION_HEADING,
  NO_PERSPECTIVES_SENTINEL: NO_PERSPECTIVES_SENTINEL,
  severityRank: severityRank,
};
