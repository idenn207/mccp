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

// 첫 완결 문장 safety cap — 완결 문장이라도 이 길이를 넘으면 단어 경계 soft-cut.
const HARD_CAP = 400;

function stripMd(s) {
  // 마커 강등(`*_\``) — rendered surface 에 raw markdown marker 미노출(Output
  // Constraint 3). complete/cap 양 경로 공통.
  return String(s == null ? '' : s).replace(/[*_`]/g, '').trim();
}

// Dashboard Truthfulness M7 Task 5 (⑤) — 첫 완결 문장. mid-word `…` 없이 종결부호
// (. 。 ! ?)까지 반환한다. 종결부호 부재 시 전체 첫 줄(문단 길이로 bounded). 매우 긴
// run-on 문장만 HARD_CAP 에서 단어 경계로 soft-cut 하되 줄임표는 붙이지 않는다
// ("그만 잘라" — 완전성 > 시각 밀도, 사용자 결정 2026-06-25). Hero subtext 가 항상
// 완결돼 다음 행동을 판단할 수 있게 한다.
function firstSentence(t) {
  const m = t.match(/^[\s\S]*?[.。!?](?=\s|$)/);
  let s = m ? m[0].trim() : t;
  if (s.length > HARD_CAP) {
    const cut = s.slice(0, HARD_CAP);
    const lastSpace = cut.lastIndexOf(' ');
    s = (lastSpace > HARD_CAP * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
  }
  return s;
}

// opts.complete=true → 첫 완결 문장(Hero subtext, mid-word `…` 없음). 그 외 →
// 기존 codepoint cap + 줄임표(tooltip 등 짧은 표면, 기본 60).
function shapeIntent(s, opts) {
  const t = stripMd(s);
  if (!t) return null;
  if (opts && opts.complete) return firstSentence(t);
  const cap = capLen(opts);
  const chars = Array.from(t); // codepoint 기준(한글 깨짐 방지).
  if (chars.length <= cap) return t;
  return chars.slice(0, cap - 1).join('') + '…';
}

// M6 followup / M7 Task 5 — opts.complete 면 첫 완결 문장(Hero subtext), 아니면
// opts.maxLen cap(기본 60, tooltip). Hypothesis → Problem → Summary 우선순위.
function extractIntent(body, opts) {
  if (typeof body !== 'string' || !body) return null;
  try {
    for (const heading of ['## Hypothesis', '## Problem', '## Summary']) {
      const sec = findSection(body, heading);
      if (sec) {
        const line = firstNonEmptyLine(sec);
        if (line) return shapeIntent(line, opts);
      }
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
