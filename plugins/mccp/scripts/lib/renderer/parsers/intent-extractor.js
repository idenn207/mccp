'use strict';

const fs = require('fs');

const MAX_LEN = 60;

function firstNonEmptyLine(section) {
  if (!section) return null;
  const lines = section.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#') || t.startsWith('|') || t.startsWith('-')) continue;
    if (t.startsWith('<!--') || t.startsWith('>')) continue;
    return t;
  }
  return null;
}

function findSection(body, heading) {
  const m = new RegExp('^' + heading + '\\s*$', 'm').exec(body);
  if (!m) return null;
  const rest = body.slice(m.index + m[0].length);
  const next = rest.match(/\n##\s/);
  return next ? rest.slice(0, next.index) : rest;
}

function truncate(s) {
  if (!s) return null;
  const t = String(s).replace(/[*_`]/g, '').trim();
  if (!t) return null;
  if (t.length <= MAX_LEN) return t;
  return t.slice(0, MAX_LEN - 1) + '…';
}

function extractIntent(body, _opts) {
  if (typeof body !== 'string' || !body) return null;
  try {
    const hyp = findSection(body, '## Hypothesis');
    if (hyp) {
      const line = firstNonEmptyLine(hyp);
      if (line) return truncate(line);
    }
    const prob = findSection(body, '## Problem');
    if (prob) {
      const line = firstNonEmptyLine(prob);
      if (line) return truncate(line);
    }
    const sum = findSection(body, '## Summary');
    if (sum) {
      const line = firstNonEmptyLine(sum);
      if (line) return truncate(line);
    }
    return null;
  } catch (_) {
    return null;
  }
}

function extractIntentFromPath(absPath, opts) {
  opts = opts || {};
  const fsRead = opts.fsRead || ((p) => fs.readFileSync(p, 'utf8'));
  try {
    return extractIntent(fsRead(absPath), opts);
  } catch (_) {
    return null;
  }
}

module.exports = { extractIntent, extractIntentFromPath, MAX_LEN };
