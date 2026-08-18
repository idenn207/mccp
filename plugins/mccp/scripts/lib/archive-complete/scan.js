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
// M6 — drift 판정은 대시보드(computeB1)와 **같은 오라클**을 쓴다. 두 표면이 서로 다른
// 오라클로 같은 질문에 답하던 상태를 닫는다(UI3·UI11).
const {
  adjudicateMilestone,
  VERDICT_SHIPPED,
  VERDICT_UNDETERMINED,
} = require('../msw-metrics/b1-status-drift');
// 증거 구성 + **join key 정규화**를 둘 다 builder 에서 가져온다. 오라클만 공유하고
// 입력 정규화를 각자 구현하면 두 표면이 여전히 다른 답을 낸다(local review H2 — 실측
// 39행 중 5행이 갈렸다: 자식 PRD 링크 행이 여기서 `not-shipped` 로, PRD-상대 경로 행이
// git 오류로 각각 오판됐다).
const {
  buildEvidence,
  buildPlanIndex,
  resolveDefaultRef,
  resolvePlanReference,
  defaultGitQuery,
} = require('../msw-metrics/b1-evidence-builder');

const PRD_DIR = path.join('.claude', 'prds');
// receipt 경로 상수는 M6 에서 b1-evidence-builder.js 로 이전됐다 — 증거 구성 지점이
// 하나뿐이어야 출처가 구조적으로 보장되기 때문이다(위 drift 증거 구간 주석 참조).
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

// --- drift 증거(2차 cross-check, advisory) ------------------------------------
//
// b1-independence:region-start (drift evidence)
//
// multi-session-work-loop M6 — 이 구간의 **판정 축**은 공유 오라클
// (msw-metrics/b1-status-drift.js)이 소유하고, 증거 구성 I/O 는 단일 builder
// (msw-metrics/b1-evidence-builder.js)만 수행한다. 이전에는 이 구간이 ledger 를
// 강증거로 먼저 보고 `fs.existsSync` 로 receipt 존재를 판정했는데, 두 가지가 계약과
// 어긋났다:
//   - 계약(UI3)이 ledger 를 **판정 소스에서 배제**했다. 대시보드와 이 명령이 서로
//     다른 오라클로 같은 질문에 답하는 상태였다. 이제 ledger 는 **참고 인용**으로만
//     병기되고 `driftSuspect` 를 결정하지 않는다.
//   - `fs.existsSync` 는 untracked 사본도 통과시킨다. 오라클은 순수 함수라 주입된
//     boolean 의 **출처를 볼 수 없으므로**, 여기서 evidence 를 직접 만들면 §3.12
//     git-tracked 불변식이 이 경로로 조용히 무효가 된다. 그래서 이 구간은 evidence 를
//     만들지 않고 builder 를 호출한다 — b1-independence-lint.js 축 (iv)가
//     `receiptPresent` 의 생성이 builder 밖에 0건임을 정적으로 고정한다.
//
// 실패는 **fail-closed** 다. 이전 구현은 catch 에서 `driftSuspect:false` 를 돌려
// 오라클 예외가 "drift 없음" 으로 읽혔다. 이제 `evidence_verdict:'undetermined'` 를
// 싣고 scan() 이 warnings → degraded:true 로 올린다.

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

// ledger 참고 인용 — 판정에 쓰이지 않는다. 병기 전용.
function ledgerCitation(milestone, ledgerEntries) {
  const basename = milestone && milestone.planBasename;
  if (!basename) return null;
  const decision = decisionFromBasename(basename);
  for (const e of ledgerEntries || []) {
    if (!e) continue;
    if (e.plan_basename === basename || (decision && e.decision_id === decision)) {
      return 'ledger(ref only): decision=' + e.decision_id + ' verdict=' + e.verdict + ' at ' + e.completed_at;
    }
  }
  return null;
}

// pending/in-progress milestone 이 실제로 shipped 됐다는 증거를 **공유 오라클**로 판정.
// 반환: { driftSuspect, evidence, evidence_verdict, error }
function collectDriftEvidence(milestone, ledgerEntries, repoRoot, opts) {
  const o = opts || {};
  const out = { driftSuspect: false, evidence: null, evidence_verdict: null, error: null };
  if (!milestone) return out;

  const cite = ledgerCitation(milestone, ledgerEntries);

  // join key 를 derive source 와 **같은 함수**로 해석한다. 해석 불가는 `not-shipped`
  // 가 아니라 `undetermined` 다 — 부재를 판정으로 바꾸지 않는다(E1). 이전 구현은 원문
  // 셀을 그대로 넘겨, 자식 PRD 링크를 문 행에 `not-shipped` 라는 적극적 주장을 냈다.
  const ref = resolvePlanReference(milestone.planPath, o.prdRelPath);
  if (!ref.ok) {
    out.evidence_verdict = VERDICT_UNDETERMINED;
    out.evidence = ['adjudication: ' + ref.reason].concat(cite ? [cite] : []).join(' · ');
    return out;
  }

  // decision_id 충돌 — 호출부가 활성 PRD **전체**를 가로질러 계산해 넘긴다. 충돌한 행은
  // 전부 강등된다(임의 채택 금지, b1-status-drift.js:108-114). 이전 구현은 이 자리에
  // `false` 를 하드코딩해, 같은 receipt 를 가리키는 두 행에 모두 `shipped` 를 냈다.
  const decisionId = decisionFromBasename(ref.basename);
  const duplicateKey = !!(o.duplicateDecisions && o.duplicateDecisions.has(decisionId));

  // 오라클 주입 seam — 프로덕션 기본값은 실제 오라클이다. 존재 이유는 단 하나,
  // **fail-closed 분기를 회귀로 고정**하기 위함이다(오라클 예외가 "drift 없음" 으로
  // 읽히던 이전 동작이 이 축의 결함이었다). CLI 에서는 도달할 수 없다.
  const adjudicate = typeof o.adjudicate === 'function' ? o.adjudicate : adjudicateMilestone;

  let adjudication;
  try {
    const evidence = buildEvidence({
      repoRoot: repoRoot,
      planPath: ref.path,
      planBasename: ref.basename,
      duplicateKey: duplicateKey,
      gitQuery: o.gitQuery,
      defaultRef: o.defaultRef,
      planIndex: o.planIndex,
    });
    adjudication = adjudicate({
      planBasename: ref.basename,
      planPath: ref.path,
      evidence: evidence,
    });
  } catch (e) {
    out.evidence_verdict = VERDICT_UNDETERMINED;
    out.evidence = 'oracle failed: ' + ((e && e.message) || String(e));
    out.error = out.evidence;
    return out;
  }

  out.evidence_verdict = adjudication.verdict;
  // 이 구간의 좌변은 언제나 pending/in-progress(호출부가 그 행만 넘긴다)이므로
  // 문서는 "아직 ship 되지 않았다" 를 주장한다. 증거가 shipped 면 그것이 drift 다.
  out.driftSuspect = adjudication.verdict === VERDICT_SHIPPED;

  const parts = [];
  if (adjudication.evidence_ref) parts.push(adjudication.source + ': ' + adjudication.evidence_ref);
  else parts.push('adjudication: ' + adjudication.reason);
  if (adjudication.codex_verdict) parts.push('codex_verdict=' + adjudication.codex_verdict);
  if (cite) parts.push(cite);
  if (!adjudication.evidence_ref) {
    // 약증거 인용도 **해석된** 경로로 조회한다 — 원문 셀을 쓰면 PRD-상대 경로가 git 에
    // 그대로 들어가 조용히 빈 결과를 낸다.
    const commit = gitLastCommit(ref.path, repoRoot);
    if (commit) parts.push('git: last commit ' + commit);
  }
  out.evidence = parts.join(' · ');
  return out;
}
// b1-independence:region-end

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

  // --- 1단계: 전역 열거 (증거 조회 **이전**) ----------------------------------
  // decision_id 에는 PRD 성분이 없으므로 서로 다른 두 PRD 가 같은 basename 을 선언하면
  // 같은 receipt 를 가리킨다. 따라서 중복 집계는 **활성 PRD 전체를 가로질러** 한 번에
  // 한다(derive/sources/milestone-evidence.js 와 동일 규칙 — 두 표면이 같은 답을 내려면
  // 충돌 판정도 같은 범위에서 나와야 한다).
  const parsed = [];
  for (const abs of listPrds(prdAbsDir)) {
    scanned += 1;
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    let body;
    try { body = fsRead(abs); }
    catch (e) { pushWarn(warnings, 'prd read failed ' + rel + ': ' + e.message); continue; }
    parsed.push({ abs, rel, body, cls: classifyMilestones(body) });
  }

  const decisionCounts = new Map();
  for (const p of parsed) {
    for (const m of p.cls.milestones) {
      if (!CANONICAL_STATUSES.has(m.status)) continue;   // 비교할 좌변이 없는 행은 제외
      const ref = resolvePlanReference(m.planPath, p.rel);
      if (!ref.ok) continue;
      const id = decisionFromBasename(ref.basename);
      if (!id) continue;
      decisionCounts.set(id, (decisionCounts.get(id) || 0) + 1);
    }
  }
  const duplicateDecisions = new Set();
  decisionCounts.forEach((n, id) => { if (n > 1) duplicateDecisions.add(id); });

  // git 배관은 **스캔당 한 번**만 세운다. 이전 구현은 행마다 `resolveDefaultRef`(rev-parse)
  // 와 `buildPlanIndex`(ls-tree 전체)를 재실행해 실측 862ms → 3,201ms 로 3.7배 느려졌다.
  // builder 는 처음부터 두 값을 주입받는 seam 을 갖고 있었고 derive source 는 그것을
  // 쓰고 있었다 — 이 호출자만 쓰지 않았다. lazy 로 두어 pending/in-progress 행이 하나도
  // 없으면 git 을 아예 부르지 않던 성질도 보존한다.
  let plumbing = null;
  const gitPlumbing = () => {
    if (plumbing) return plumbing;
    const gq = typeof opts.gitQuery === 'function' ? opts.gitQuery : defaultGitQuery(repoRoot);
    const resolved = resolveDefaultRef(gq);
    plumbing = {
      gitQuery: gq,
      defaultRef: resolved.ref,
      planIndex: opts.planIndex || (resolved.ref ? buildPlanIndex(gq, resolved.ref) : null),
    };
    return plumbing;
  };

  // --- 2단계: PRD 별 판정 ------------------------------------------------------
  for (const { abs, rel, body, cls } of parsed) {
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
      let evidenceVerdict = null;
      if (m.status === 'pending' || m.status === 'in-progress') {
        const g = gitPlumbing();
        const d = collectDriftEvidence(m, ledgerEntries, repoRoot, {
          prdRelPath: rel,
          duplicateDecisions: duplicateDecisions,
          gitQuery: g.gitQuery,
          defaultRef: g.defaultRef,
          planIndex: g.planIndex,
          adjudicate: opts.adjudicate,
        });
        driftSuspect = d.driftSuspect;
        evidence = d.evidence;
        evidenceVerdict = d.evidence_verdict;
        // fail-closed — 오라클 실패를 "drift 없음" 으로 읽지 않는다. warnings 에 올리면
        // scan() 이 degraded:true 가 되고, /mccp:archive-complete command body 는
        // degraded PRD 에 대해 이미 보수적으로 동작한다.
        if (d.error) pushWarn(warnings, 'drift oracle failed for ' + rel + ' / ' + m.name + ': ' + d.error);
      }
      return { name: m.name, status: m.status, driftSuspect, evidence, evidence_verdict: evidenceVerdict };
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
  // M6 — 오라클이 같은 규칙을 재구현하므로(순수성 유지를 위해 이 모듈을 import 하지
  // 않는다) 두 구현의 동치를 test 가 고정한다. 그 test 의 대조 상대가 이 export 다.
  decisionFromBasename,
};
