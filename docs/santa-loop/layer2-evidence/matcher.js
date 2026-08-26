'use strict';
// Layer 2 매처 — PREREGISTRATION.md R2 를 그대로 구현한다. 결과를 보고 고치지 않는다.
const fs = require('fs');
const path = require('path');

const LINE_TOLERANCE = 12;

// R2 토큰 술어 (사전 등록 — 대소문자 무시)
const PREDICATES = {
  D1: (t) => t.includes('takefield') ||
       (t.includes('trim') && ['undefined', 'bound', 'out of range', 'index'].some((k) => t.includes(k))),
  D2: (t) => t.includes('mergecounts') ||
       (t.includes('concat') && ['string', 'type', 'a + b'].some((k) => t.includes(k))),
  D3: (t) => t.includes('expiresat') || t.includes('ttl') ||
       (t.includes('cache') && ['expir', 'stale'].some((k) => t.includes(k))),
  D4: (t) => t.includes('milestone') &&
       ['3', 'three', 'mismatch', 'two', 'declares'].some((k) => t.includes(k)),
};

function norm(p) { return String(p || '').split(String.fromCharCode(92)).join('/').replace(/^[.]\//, '').toLowerCase(); }
function textOf(issue) {
  if (typeof issue === 'string') return issue.toLowerCase();
  return [issue && issue.claim, issue && issue.failure_scenario, issue && issue.evidence]
    .map((x) => (typeof x === 'string' ? x : '')).join('\n').toLowerCase();
}

// R2.1 위치 우선 → R2.2 텍스트 대체 → R2.3 다중 매치 해소
function attribute(issue, defects) {
  const cands = [];
  const locs = (issue && Array.isArray(issue.locations)) ? issue.locations : [];
  for (const d of defects) {
    const dp = norm(d.path);
    for (const l of locs) {
      if (!l || typeof l.file !== 'string') continue;
      const lf = norm(l.file);
      if (lf !== dp && !lf.endsWith('/' + dp) && !dp.endsWith('/' + lf)) continue;
      if (Number.isInteger(l.line)) {
        const dist = Math.abs(l.line - d.line);
        if (dist <= LINE_TOLERANCE) cands.push({ id: d.id, dist, via: 'location' });
      } else {
        cands.push({ id: d.id, dist: Infinity, via: 'location-noline' });
      }
    }
  }
  if (cands.length === 0) {
    const t = textOf(issue);
    for (const d of defects) {
      const base = norm(d.path).split('/').pop();
      if (!t.includes(base)) continue;
      if (PREDICATES[d.id] && PREDICATES[d.id](t)) cands.push({ id: d.id, dist: Infinity, via: 'text' });
    }
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => (a.dist - b.dist) || (a.id < b.id ? -1 : 1));
  return cands[0];
}

const SP = process.argv[2];
const scopes = JSON.parse(fs.readFileSync(path.join(SP, 'scopes.json'), 'utf8'));
const defects = scopes.defects;

const out = { modes: {}, tolerance: LINE_TOLERANCE };
for (const mode of ['off', 'enforce']) {
  const perDefect = {}; defects.forEach((d) => { perDefect[d.id] = { class: d.class, found: false, by: [] }; });
  const nonCorpus = [];
  for (const rid of ['A', 'B']) {
    const f = path.join(SP, 'verdict-' + mode + '-' + rid + '.json');
    if (!fs.existsSync(f)) { console.error('MISSING ' + f); process.exitCode = 1; continue; }
    const v = JSON.parse(fs.readFileSync(f, 'utf8'));
    const issues = Array.isArray(v.critical_issues) ? v.critical_issues : [];
    for (const it of issues) {
      const hit = attribute(it, defects);
      const claim = (typeof it === 'string' ? it : (it && it.claim) || '').slice(0, 110);
      if (hit) { perDefect[hit.id].found = true; perDefect[hit.id].by.push(rid + ':' + hit.via); }
      else nonCorpus.push({ reviewer: rid, claim });
    }
  }
  const byClass = {};
  for (const d of defects) {
    byClass[d.class] = byClass[d.class] || { total: 0, found: 0, ids: [] };
    byClass[d.class].total += 1;
    if (perDefect[d.id].found) { byClass[d.class].found += 1; }
    byClass[d.class].ids.push(d.id + (perDefect[d.id].found ? '=found' : '=missed'));
  }
  out.modes[mode] = {
    perDefect, byClass,
    findings: Object.values(perDefect).filter((x) => x.found).length,
    nonCorpus,
  };
}
out.layer2 = { fullFindings: out.modes.off.findings, deltaFindings: out.modes.enforce.findings };
fs.writeFileSync(path.join(SP, 'layer2-result.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
