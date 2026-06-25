'use strict';

const fs = require('fs');

const MAX_LEN = 60;

function capLen(opts) {
  const n = opts && typeof opts.maxLen === 'number' ? opts.maxLen : MAX_LEN;
  return n > 0 ? n : MAX_LEN;
}

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

function truncate(s, maxLen) {
  if (!s) return null;
  const cap = typeof maxLen === 'number' && maxLen > 0 ? maxLen : MAX_LEN;
  const t = String(s).replace(/[*_`]/g, '').trim();
  if (!t) return null;
  // codepoint 기준 cap(한글 깨짐 방지).
  const chars = Array.from(t);
  if (chars.length <= cap) return t;
  return chars.slice(0, cap - 1).join('') + '…';
}

// M6 followup — opts.maxLen 으로 cap 조절(기본 60). Hero subtext 는 더 긴 cap 으로
// 호출해 "핵심 두 축은…" 같은 중요 내용이 잘리지 않게 한다(full-width + multi-line).
function extractIntent(body, opts) {
  if (typeof body !== 'string' || !body) return null;
  const cap = capLen(opts);
  try {
    const hyp = findSection(body, '## Hypothesis');
    if (hyp) {
      const line = firstNonEmptyLine(hyp);
      if (line) return truncate(line, cap);
    }
    const prob = findSection(body, '## Problem');
    if (prob) {
      const line = firstNonEmptyLine(prob);
      if (line) return truncate(line, cap);
    }
    const sum = findSection(body, '## Summary');
    if (sum) {
      const line = firstNonEmptyLine(sum);
      if (line) return truncate(line, cap);
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
