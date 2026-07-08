'use strict';

// /mccp:archive-complete — deterministic scan + classifier (read-only, LLM-free).
//
// 활성 PRD 를 열거하고 각 PRD 의 `## Delivery Milestones` 표를 **원시 행 단위로 전부
// 열거**해 archivable 여부를 fail-closed 로 판정한다. 평가(추론)는 command agent 가,
// 결정적 스캔은 이 모듈이 담당(레이어 분리 — stale-audit/enumerate.js 미러).
//
//   scan(opts) → { prds:[{path,name,milestones,plans,archivable,reason,counts}], scanned, degraded, warnings }
//
// 핵심 정확성 불변식(C2·C4·Codex F1):
//   - archivable = 표 존재 AND rawRowCount ≥ 1 AND rawRowCount === complete + dropped.
//     즉 **모든 원시 행이 complete 또는 dropped** 여야 한다. pending/in-progress/
//     non-canonical/파싱불가 행이 하나라도 있으면 non-archivable.
//   - rawRowCount 를 분모로 쓰고 parseDeliveryMilestones* 필터 결과를 분모로 쓰지 않는다.
//     비정규 status 행이 어느 정규 토큰 집합에도 안 잡혀 분모에서 증발하는 오분류(F1)를
//     rawRowCount 등식이 차단한다. 버킷 합 ≠ rawRowCount 인 파싱 mismatch 도 fail-closed.
//
// loud fail-open(throw 안 함). drift 증거는 advisory — ledger > receipt > git 우선순위.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  stripAxisIdPrefix,
  extractPlanPath,
  extractPrdLabel,
} = require('../renderer/parsers/plan-body');
const { scanPlans } = require('../../derive/sources/plans');
const { readLedger } = require('../completion-ledger/store');

const PRD_DIR = path.join('.claude', 'prds');
const RECEIPT_PR_GATE_DIR = path.join('.claude', 'receipts', 'mccp-pr-codex');
const CANONICAL_STATUSES = new Set(['complete', 'pending', 'in-progress', 'dropped']);

function warn(msg) { process.stderr.write('[mccp:archive-complete:scan] ' + msg + '\n'); }

// loud fail-open — stderr(사용자 가시) + warnings 싱크(구조적 degraded 신호) 동시에.
function pushWarn(warnings, msg) {
  warn(msg);
  if (Array.isArray(warnings)) warnings.push(msg);
}

// --- plan-body.js `findSection`/`parseTableRows` 로컬 포트 --------------------
// 두 함수는 plan-body.js 에서 export 되지 않는다. 여기 self-contained 로 포트해
// (스캔 대상 파일이 아닌) plan-body.js 를 건드리지 않고 동일 파싱을 재현한다
// (enumerate.js `scanInProgressRows` 가 이미 쓰는 로컬-표-스캔 패턴 미러).

function findSection(body, heading) {
  const startMatch = new RegExp('^' + heading + '\\s*$', 'm').exec(body);
  if (!startMatch) return null;
  const startIdx = startMatch.index + startMatch[0].length;
  const rest = body.slice(startIdx);
  const nextHeader = rest.match(/\n##\s/);
  return nextHeader ? rest.slice(0, nextHeader.index) : rest;
}

// 표 데이터 행(구분자 `|---|` 이후 행)만 반환. escaped `\|` 는 셀 내부 리터럴 파이프로
// 취급(plan-body.js parseTableRows 와 동일 정규식) — 헤더는 구분자 이전이라 제외된다.
function parseTableRows(section) {
  if (!section) return [];
  const lines = section.split(/\r?\n/);
  const rows = [];
  let inTable = false;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^\|\s*-+/.test(trimmed)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!trimmed.startsWith('|')) {
      if (trimmed === '') continue;
      break;
    }
    const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    const cells = inner.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
    rows.push(cells);
  }
  return rows;
}

// --- classifier --------------------------------------------------------------

// status 셀을 정규 토큰 4종(complete|pending|in-progress|dropped) 또는 'non-canonical'
// 로 정규화. 빈 셀·비정규 텍스트("complete (verify) · gated")는 모두 non-canonical
// (C4 fail-closed — `=== 정규토큰` 엄격 일치).
function normalizeStatus(cell) {
  const s = String(cell == null ? '' : cell).toLowerCase().trim();
  return CANONICAL_STATUSES.has(s) ? s : 'non-canonical';
}

// PRD body → milestone 분류. rawRowCount = 표 데이터 행 총수(분모, F1). cells.length < 5
// (파싱불가/malformed) 행도 rawRowCount 에 포함하고 non-canonical 로 버킷팅한다.
function classifyMilestones(prdBody) {
  const result = {
    hasTable: false, rawRowCount: 0,
    complete: 0, dropped: 0, pending: 0, inProgress: 0, nonCanonical: 0,
    milestones: [],
  };
  const section = findSection(prdBody, '## Delivery Milestones');
  if (!section) return result;
  const rows = parseTableRows(section);
  result.hasTable = rows.length > 0;
  for (const cells of rows) {
    result.rawRowCount += 1;
    let name;
    let status;
    let planPath = null;
    if (cells.length < 5) {
      name = (cells[1] || cells[0] || '(malformed row)').trim() || '(malformed row)';
      status = 'non-canonical';
    } else {
      name = stripAxisIdPrefix((cells[1] || '').trim()) || '(unnamed)';
      status = normalizeStatus(cells[3]);
      planPath = extractPlanPath(cells[4]);
    }
    switch (status) {
      case 'complete': result.complete += 1; break;
      case 'dropped': result.dropped += 1; break;
      case 'pending': result.pending += 1; break;
      case 'in-progress': result.inProgress += 1; break;
      default: result.nonCanonical += 1; break;
    }
    result.milestones.push({
      name, status, planPath,
      planBasename: planPath ? planPath.split(/[\\/]/).pop() : null,
    });
  }
  return result;
}

// classification → { archivable, reason }. C2/C4/F1 fail-closed 판정.
function isArchivable(c) {
  if (!c || !c.hasTable || c.rawRowCount < 1) {
    return { archivable: false, reason: 'no Delivery Milestones table or empty' };
  }
  const bucketSum = c.complete + c.dropped + c.pending + c.inProgress + c.nonCanonical;
  if (bucketSum !== c.rawRowCount) {
    // 버킷 합이 원시 행 수와 다르면 파싱 경로에 구멍이 있는 것 — 조용히 통과시키지 않는다.
    return { archivable: false, reason: 'row bucket mismatch (raw=' + c.rawRowCount + ' sum=' + bucketSum + ') — fail-closed' };
  }
  if (c.rawRowCount === c.complete + c.dropped) {
    return { archivable: true, reason: 'all ' + c.rawRowCount + ' milestone rows complete/dropped' };
  }
  const blockers = [];
  if (c.pending) blockers.push('pending=' + c.pending);
  if (c.inProgress) blockers.push('in-progress=' + c.inProgress);
  if (c.nonCanonical) blockers.push('non-canonical=' + c.nonCanonical);
  return { archivable: false, reason: 'not all rows complete/dropped (' + blockers.join(', ') + ')' };
}

// --- drift 증거(2차 cross-check, advisory·fail-open) --------------------------

function decisionFromBasename(planBasename) {
  return String(planBasename || '').replace(/\.plan\.md$/i, '');
}

function gitLastCommit(relPath, repoRoot) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%h %s', '--', relPath], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch (_) { return null; }
}

// pending/in-progress milestone 이 실제로 shipped 됐다는 증거를 ledger > receipt > git
// 순으로 조회. 강증거(ledger/receipt) 발견 시 driftSuspect. git 은 약증거(마지막 커밋).
function collectDriftEvidence(milestone, ledgerEntries, repoRoot) {
  const out = { driftSuspect: false, evidence: null };
  const basename = milestone && milestone.planBasename;
  if (!basename) return out;
  const decision = decisionFromBasename(basename);
  try {
    // 1) completion-ledger (강증거)
    for (const e of ledgerEntries || []) {
      if (!e) continue;
      if (e.plan_basename === basename || (decision && e.decision_id === decision)) {
        out.driftSuspect = true;
        out.evidence = 'ledger: decision=' + e.decision_id + ' verdict=' + e.verdict + ' at ' + e.completed_at;
        return out;
      }
    }
    // 2) mccp-pr-codex receipt (강증거)
    if (decision) {
      const receiptPath = path.join(repoRoot, RECEIPT_PR_GATE_DIR, decision + '.json');
      if (fs.existsSync(receiptPath)) {
        out.driftSuspect = true;
        out.evidence = 'receipt: ' + path.join(RECEIPT_PR_GATE_DIR, decision + '.json').split(path.sep).join('/');
        return out;
      }
    }
    // 3) git log (약증거 — driftSuspect 는 올리지 않고 참고용 인용만)
    if (milestone.planPath) {
      const commit = gitLastCommit(milestone.planPath, repoRoot);
      if (commit) out.evidence = 'git: last commit ' + commit;
    }
  } catch (e) {
    // advisory — 증거 조회 실패는 판정을 막지 않는다.
    out.evidence = out.evidence || null;
  }
  return out;
}

// --- plan↔PRD index ----------------------------------------------------------

function sourcePrdPathOf(planItem) {
  const sp = planItem && planItem.source_prd;
  if (!sp) return null;
  if (typeof sp === 'string') return sp;
  if (typeof sp === 'object' && sp.path) return sp.path;
  return null;
}

function baseOf(p) { return p ? String(p).split(/[\\/]/).pop() : null; }

// --- PRD 열거 ----------------------------------------------------------------

function listPrds(dirAbs) {
  // 비재귀 — archived/ 는 하위 디렉토리라 .prd.md 필터에서 자연 제외된다.
  try {
    return fs.readdirSync(dirAbs)
      .filter((n) => n.endsWith('.prd.md'))
      .map((n) => path.join(dirAbs, n));
  } catch (_) { return []; }
}

function scan(opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || process.cwd();
  const fsRead = opts.fsRead || ((p) => fs.readFileSync(p, 'utf8'));
  const warnings = [];

  let ledgerEntries = [];
  try {
    const l = readLedger(repoRoot);
    ledgerEntries = (l && l.entries) || [];
  } catch (e) { pushWarn(warnings, 'ledger read failed: ' + e.message); }

  let planItems = [];
  try {
    const s = scanPlans(repoRoot);
    planItems = (s && s.items) || [];
  } catch (e) { pushWarn(warnings, 'scanPlans failed: ' + e.message); }

  const prdAbsDir = path.isAbsolute(PRD_DIR) ? PRD_DIR : path.join(repoRoot, PRD_DIR);
  const prds = [];
  let scanned = 0;

  for (const abs of listPrds(prdAbsDir)) {
    scanned += 1;
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    let body;
    try { body = fsRead(abs); }
    catch (e) { pushWarn(warnings, 'prd read failed ' + rel + ': ' + e.message); continue; }

    const cls = classifyMilestones(body);
    const verdict = isArchivable(cls);
    const name = extractPrdLabel(body, abs);
    const prdBasename = path.basename(abs);

    const plans = planItems
      .filter((p) => baseOf(sourcePrdPathOf(p)) === prdBasename)
      .map((p) => (p.path || '').split(path.sep).join('/'))
      .filter(Boolean)
      .sort();

    const milestones = cls.milestones.map((m) => {
      let driftSuspect = false;
      let evidence = null;
      if (m.status === 'pending' || m.status === 'in-progress') {
        const d = collectDriftEvidence(m, ledgerEntries, repoRoot);
        driftSuspect = d.driftSuspect;
        evidence = d.evidence;
      }
      return { name: m.name, status: m.status, driftSuspect, evidence };
    });

    prds.push({
      path: rel,
      name,
      milestones,
      plans,
      archivable: verdict.archivable,
      reason: verdict.reason,
      counts: {
        rawRowCount: cls.rawRowCount,
        complete: cls.complete,
        dropped: cls.dropped,
        pending: cls.pending,
        inProgress: cls.inProgress,
        nonCanonical: cls.nonCanonical,
      },
    });
  }

  return { prds, scanned, degraded: warnings.length > 0, warnings };
}

// CLI: node scan.js --json [--repo-root R]
function main(argv) {
  const args = argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root') opts.repoRoot = args[++i];
  }
  const result = scan(opts);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) main(process.argv);

module.exports = {
  scan,
  classifyMilestones,
  isArchivable,
  normalizeStatus,
  collectDriftEvidence,
  sourcePrdPathOf,
};
