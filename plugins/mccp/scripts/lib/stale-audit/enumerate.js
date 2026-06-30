'use strict';

// Dashboard Truthfulness M3 — stale-audit enumerate (deterministic, read-only).
//
// active(미마커) 위험/OQ/마일스톤 항목을 안정 ref 와 함께 수집한다. 평가(추론)는
// `/mccp:dashboard-audit` agent 가, 결정적 ref 산출은 이 모듈이 담당(레이어 분리).
//
//   enumerate(opts) → { items: [ref...], scanned, degraded, warnings }
//   ref(risk)      = { kind:'risk', source, ordinal, text, lineNumber }
//   ref(oq)        = { kind:'oq',   source, lineNumber, text }
//   ref(milestone) = { kind:'milestone', source(prd), name, status, lineNumber }
//
// enumerate↔apply 는 동일 파서(plan-body.js)를 공유해 ref 가 apply 시점의 라인 위치
// 와 정합한다. loud fail-open(throw 안 함).

const fs = require('fs');
const path = require('path');
const {
  parseRisks,
  parseOpenQuestions,
  parseDeliveryMilestonesLifecycle,
} = require('../renderer/parsers/plan-body');
const { findRisksTableLine, findMilestoneRow } = require('./locate');
// derive 가 *표시*하는 plan 집합(SSoT)을 그대로 가져와 completed/ 아카이브로 확장.
// item-id 계약: 서버 re-enumerate 는 렌더러가 resolveId 를 부여한 *모든* plan 항목을
// 재현해야 한다(enumerate ⊇ derive). 디렉토리를 여기서 재선언하면 조용히 drift 한다
// (LOW#1 — top-level 레거시 plan 의 "제외" 버튼이 derive 엔 뜨지만 서버는 못 찾아 항상
// 409). completed/ 는 derive 미표시(버튼 미부여)지만 dashboard-audit 의 기존 커버리지
// 보존을 위해 superset 으로 유지.
const { PLAN_DIRS: DISPLAY_PLAN_DIRS } = require('../../derive/sources/plans');
const PLAN_DIRS = DISPLAY_PLAN_DIRS.concat([path.join('.claude', 'PRPs', 'plans', 'completed')]);
const PRD_DIR = path.join('.claude', 'prds');

function warn(msg) {
  process.stderr.write('[mccp:stale-audit] ' + msg + '\n');
}

// loud fail-open — stderr(사용자 가시) + warnings 싱크(구조적 degraded 신호)를 동시에.
// 둘 중 하나만 두면 fail-open 이 절반만 wiring 된다([[feedback-loud-fail-open]]).
function pushWarn(warnings, msg) {
  warn(msg);
  if (Array.isArray(warnings)) warnings.push(msg);
}

function listFiles(dirAbs, suffix) {
  try {
    return fs.readdirSync(dirAbs)
      .filter((n) => n.endsWith(suffix))
      .map((n) => path.join(dirAbs, n));
  } catch (_) { return []; }
}

// active(미마커) 위험/OQ 를 한 plan 파일에서 추출. lineNumber 안정 ref 포함.
function enumeratePlan(absPath, relPath, fsRead, warnings) {
  const out = [];
  let body;
  try { body = fsRead(absPath); }
  catch (e) { pushWarn(warnings, 'plan read failed ' + relPath + ': ' + e.message); return out; }
  const lines = body.split(/\r?\n/);

  try {
    const { rows } = parseRisks(body);
    rows.forEach((r, ordinal) => {
      if (r.resolved) return; // 이미 마커 → active 아님
      const lineNumber = findRisksTableLine(lines, ordinal);
      out.push({
        kind: 'risk',
        source: relPath,
        ordinal,
        text: (r.risk || '').trim(),
        lineNumber, // 1-indexed, null if not found (apply 가 재검증)
      });
    });
  } catch (e) { pushWarn(warnings, 'parseRisks failed ' + relPath + ': ' + e.message); }

  try {
    const oq = parseOpenQuestions(body);
    oq.forEach((q) => {
      if (q.resolved) return;
      out.push({
        kind: 'oq',
        source: relPath,
        lineNumber: q.lineNumber,
        text: (q.text || '').trim(),
      });
    });
  } catch (e) { pushWarn(warnings, 'parseOpenQuestions failed ' + relPath + ': ' + e.message); }

  return out;
}

// in-progress 마일스톤(은퇴 후보) 을 PRD 에서 추출. complete/dropped 는 이미 종료.
function enumeratePrd(absPath, relPath, fsRead, warnings) {
  const out = [];
  let body;
  try { body = fsRead(absPath); }
  catch (e) { pushWarn(warnings, 'prd read failed ' + relPath + ': ' + e.message); return out; }
  const lines = body.split(/\r?\n/);
  // lifecycle 파서는 pending/dropped 만 — in-progress 는 별도 스캔(status 셀 직접).
  // 마일스톤 audit 은 stale in-progress → complete/dropped 후보를 노출.
  const { parseDeliveryMilestones } = require('../renderer/parsers/plan-body');
  void parseDeliveryMilestonesLifecycle; // lifecycle 은 이미 종료라 후보 아님(미사용)
  let statusMap;
  try { statusMap = parseDeliveryMilestones(body); } catch (_) { statusMap = new Map(); }
  // statusMap 은 basename→status(링크 있는 행만). in-progress 행을 raw 표에서 직접 스캔.
  // (link 무요구 — name 기준 row 위치 + status 셀.)
  const inProgress = scanInProgressRows(body);
  for (const row of inProgress) {
    const loc = findMilestoneRow(lines, row.name);
    out.push({
      kind: 'milestone',
      source: relPath,
      name: row.name,
      status: 'in-progress',
      lineNumber: loc ? loc.lineNumber : null,
    });
  }
  void statusMap;
  return out;
}

// `## Delivery Milestones` 표의 in-progress 행 name 목록(link 무요구).
function scanInProgressRows(prdBody) {
  const out = [];
  const startMatch = /^##\s+Delivery Milestones\s*$/m.exec(prdBody);
  if (!startMatch) return out;
  const rest = prdBody.slice(startMatch.index + startMatch[0].length);
  const nextHeader = rest.match(/\n##\s/);
  const section = nextHeader ? rest.slice(0, nextHeader.index) : rest;
  let inTable = false;
  for (const raw of section.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (/^\|\s*-+/.test(trimmed)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!trimmed.startsWith('|')) { if (trimmed === '') continue; break; }
    const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length < 5) continue;
    if ((cells[3] || '').toLowerCase() === 'in-progress' && cells[1]) {
      out.push({ name: cells[1] });
    }
  }
  return out;
}

function enumerate(opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || process.cwd();
  const fsRead = opts.fsRead || ((p) => fs.readFileSync(p, 'utf8'));
  const limit = typeof opts.limit === 'number' && opts.limit > 0 ? opts.limit : null;

  const items = [];
  let scanned = 0;
  const warnings = [];

  for (const dir of PLAN_DIRS) {
    const abs = path.isAbsolute(dir) ? dir : path.join(repoRoot, dir);
    for (const file of listFiles(abs, '.plan.md')) {
      scanned += 1;
      const rel = path.relative(repoRoot, file).split(path.sep).join('/');
      items.push(...enumeratePlan(file, rel, fsRead, warnings));
    }
  }
  const prdAbs = path.isAbsolute(PRD_DIR) ? PRD_DIR : path.join(repoRoot, PRD_DIR);
  for (const file of listFiles(prdAbs, '.prd.md')) {
    scanned += 1;
    const rel = path.relative(repoRoot, file).split(path.sep).join('/');
    items.push(...enumeratePrd(file, rel, fsRead, warnings));
  }

  // 정렬 — 가장 stale 후보 우선: milestone(in-progress) → 그다음 risk/oq, source 순.
  const kindRank = { milestone: 0, risk: 1, oq: 2 };
  items.sort((a, b) => {
    const kr = (kindRank[a.kind] || 9) - (kindRank[b.kind] || 9);
    if (kr !== 0) return kr;
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    return (a.lineNumber || 0) - (b.lineNumber || 0);
  });

  const capped = limit ? items.slice(0, limit) : items;
  return {
    items: capped,
    scanned,
    total: items.length,
    truncated: limit ? items.length > limit : false,
    degraded: warnings.length > 0,
    warnings,
  };
}

// CLI: node enumerate.js --json [--limit N]
function main(argv) {
  const args = argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') { opts.limit = parseInt(args[++i], 10); }
    else if (args[i] === '--repo-root') { opts.repoRoot = args[++i]; }
  }
  const result = enumerate(opts);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) main(process.argv);

module.exports = { enumerate, scanInProgressRows };
