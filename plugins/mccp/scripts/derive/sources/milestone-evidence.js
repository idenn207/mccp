'use strict';

// derive source: milestone_evidence — 활성 PRD 의 milestone 행을 열거하고 각 행을
// **문서에서 파생되지 않은 증거**와 대조한다. computeB1 의 유일한 입력.
//
//   scanMilestoneEvidence(repoRoot, opts) → {
//     ok, degraded, error, independence_ok, producer_coverage,
//     denominator, drift_count, drift_items[],
//     undetermined_evidence_count, noncanonical_status_count, no_plan_count,
//     archived_excluded_count, raw_row_count, warnings
//   }
//
// 2층 분리(a4-boundary-restore.js 미러): 순수 오라클(b1-status-drift.js)이 **판정**하고,
// 이 source 가 **관측**한다. 증거 구성 I/O 는 이 파일이 직접 하지 않고 단일 builder
// (b1-evidence-builder.js)에 위임한다 — 오라클은 주입값의 출처를 볼 수 없으므로
// 생산자를 하나로 만드는 것만이 §3.12 git-tracked 불변식을 지키는 기계 장치다.
//
// per-source fail-open(session-journal.js 계약): 행 하나의 조회 실패는 그 행만
// undetermined 로 두고 전체는 계속 진행한다. 다만 **조회 계층 자체가 죽으면**
// (`git` 미존재 등) degraded:true 로 올려 computeB1 이 `invalid` 을 내게 한다 —
// "증거를 못 구했다" 와 "증거가 없다" 는 다른 상태다.

const fs = require('fs');
const path = require('path');

const { classifyMilestones } = require('../../lib/archive-complete/scan');
const {
  adjudicateMilestone,
  decisionFromBasename,
  isDrift,
  EVIDENCE_FIELDS,
  VERDICT_UNDETERMINED,
} = require('../../lib/msw-metrics/b1-status-drift');
const {
  buildEvidence,
  buildPlanIndex,
  resolveDefaultRef,
  resolvePlanReference,
  defaultGitQuery,
} = require('../../lib/msw-metrics/b1-evidence-builder');

const PRD_DIR = path.join('.claude', 'prds');
const ARCHIVED_PRD_DIR = path.join('.claude', 'prds', 'archived');
const PRODUCER_COVERAGE = 'milestone-evidence';

// 문서 status 가 "ship 됐어야 한다" 를 뜻하는 집합. 이 대조는 결합부인 이 source 의
// 책임이며, 오라클 모듈은 status 를 아예 받지 않는다(독립성의 타입 경계).
const DOC_STATUS_SHIPPED_SIDE = new Set(['complete', 'dropped']);
const DOC_STATUS_UNSHIPPED_SIDE = new Set(['pending', 'in-progress']);
const NON_CANONICAL = 'non-canonical';

function listPrdFiles(dirAbs) {
  // 비재귀 — archived/ 는 하위 디렉토리라 .prd.md 필터에서 자연 제외된다.
  try {
    return fs.readdirSync(dirAbs).filter((n) => n.endsWith('.prd.md')).sort()
      .map((n) => path.join(dirAbs, n));
  } catch (_) { return []; }
}

function countArchivedPrds(dirAbs) {
  try {
    return fs.readdirSync(dirAbs).filter((n) => n.endsWith('.prd.md')).length;
  } catch (_) { return 0; }
}

// join key 정규화(`resolvePlanReference`)는 **builder 가 소유한다** — 이 파일에 두면
// archive-complete/scan.js 가 같은 규칙을 갖지 못해 두 표면의 판정이 갈린다(local
// review H2: 같은 39행 중 5행이 실제로 갈렸다). 규칙과 근거는 b1-evidence-builder.js
// 의 해당 절 참조.

// 주입된 evidence 가 builder 산출물의 형태(정확히 5필드)인지 확인한다. 어긋나면
// 제3의 생산자가 끼어들었다는 뜻이므로 independence 를 주장할 수 없다.
function looksLikeBuilderEvidence(ev) {
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return false;
  const keys = Object.keys(ev).sort();
  return keys.length === EVIDENCE_FIELDS.length
    && EVIDENCE_FIELDS.slice().sort().every((k, i) => keys[i] === k);
}

function scanMilestoneEvidence(repoRoot, opts) {
  const root = repoRoot || process.cwd();
  const o = opts || {};
  const warnings = [];
  const out = {
    ok: true,
    degraded: false,
    error: null,
    independence_ok: true,
    producer_coverage: PRODUCER_COVERAGE,
    denominator: 0,
    drift_count: 0,
    drift_items: [],
    // 행별 판정 전수. drift 만 싣으면 "대조한 범위" 를 사람이 확인할 수 없어 UI14 의
    // 감사 표본 대조가 성립하지 않는다(0 건이 "drift 없음" 인지 "대조 못 함" 인지
    // 구별되지 않는다). 변조 불변성 test 의 증거층 단언도 이 배열을 읽는다.
    adjudications: [],
    undetermined_evidence_count: 0,
    noncanonical_status_count: 0,
    no_plan_count: 0,
    archived_excluded_count: 0,
    raw_row_count: 0,
    warnings: warnings,
  };

  const gitQuery = typeof o.gitQuery === 'function' ? o.gitQuery : defaultGitQuery(root);

  // 조회 계층 생존 확인 — 이것이 죽으면 행별 fail-open 이 아니라 전체 degraded 다.
  let gitAlive = true;
  try {
    const probe = gitQuery(['rev-parse', '--git-dir']);
    gitAlive = !!(probe && probe.ok);
  } catch (_) { gitAlive = false; }
  if (!gitAlive) {
    out.degraded = true;
    out.error = 'git query layer unavailable — evidence cannot be constructed';
    warnings.push(out.error);
    return out;
  }

  // ref 는 한 번만 해석해 행마다 재해석하지 않는다. 실패해도 degraded 가 아니다 —
  // 행별로 gitReachable:null → undetermined 가 정직한 표기다.
  const refResolution = resolveDefaultRef(gitQuery);
  if (!refResolution.ref) warnings.push(refResolution.error);

  // plan 목록도 한 번만 만들어 행마다 재조회하지 않는다(정확 경로 miss 시 basename
  // fallback 의 입력 — b1-evidence-builder.js PLAN_DIRS 주석 참조).
  const planIndex = refResolution.ref ? buildPlanIndex(gitQuery, refResolution.ref) : null;

  const prdAbsDir = path.join(root, PRD_DIR);
  out.archived_excluded_count = countArchivedPrds(path.join(root, ARCHIVED_PRD_DIR));

  // --- 1단계: 전역 열거 (증거 조회 **이전**) --------------------------------
  // decision_id 에는 PRD 성분이 없으므로 서로 다른 두 PRD 가 같은 basename 을 선언해도
  // 같은 receipt 를 가리킨다. 따라서 중복 집계는 **활성 PRD 전체를 가로질러** 한 번에
  // 한다. 첫 행/마지막 행 채택은 금지 — 충돌 행 전부를 undetermined 로 강등한다.
  const rows = [];
  const decisionOwners = new Map();

  for (const abs of listPrdFiles(prdAbsDir)) {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    let body;
    try { body = fs.readFileSync(abs, 'utf8'); }
    catch (e) {
      out.degraded = true;
      warnings.push('prd read failed ' + rel + ': ' + e.message);
      continue;
    }

    const cls = classifyMilestones(body);
    out.raw_row_count += cls.rawRowCount;

    for (const m of cls.milestones) {
      if (m.status === NON_CANONICAL) {
        // 비교할 좌변이 없다 — 분모에서 제외한다. 정직한 주석("complete (조건 미충족)")이
        // drift 로 벌받지 않게 하되, raw_row_count 병기로 제외분이 항상 보이게 한다.
        out.noncanonical_status_count += 1;
        continue;
      }
      const ref = resolvePlanReference(m.planPath, rel);
      const decisionId = ref.ok ? decisionFromBasename(ref.basename) : null;
      if (decisionId) {
        if (!decisionOwners.has(decisionId)) decisionOwners.set(decisionId, []);
        decisionOwners.get(decisionId).push(rows.length);
      }
      rows.push({
        prd: rel,
        milestone: m.name,
        doc_status: m.status,
        planPath: ref.ok ? ref.path : null,
        planBasename: ref.ok ? ref.basename : null,
        planRefReason: ref.ok ? null : ref.reason,
        decisionId: decisionId,
        duplicateKey: false,
      });
    }
  }

  for (const [decisionId, idxs] of decisionOwners) {
    if (idxs.length < 2) continue;
    const prdSet = new Set(idxs.map((i) => rows[i].prd));
    idxs.forEach((i) => { rows[i].duplicateKey = true; });
    warnings.push('duplicate decision_id "' + decisionId + '" shared by ' + idxs.length
      + ' rows across ' + prdSet.size + ' prd(s)');
  }

  // 정규 status 활성 행 전수가 분모다. 증거가 undetermined 인 행도 **분모에는 남는다** —
  // 빼면 "증거를 못 구할수록 분모가 줄어 성적이 좋아지는" 경로가 열린다.
  out.denominator = rows.length;

  // 항등식 자체 검증(archive-complete 버킷 합 등식 미러). 어긋나면 파싱 경로에 구멍이
  // 있는 것이므로 조용히 통과시키지 않는다.
  if (out.raw_row_count !== out.denominator + out.noncanonical_status_count) {
    out.degraded = true;
    warnings.push('row identity violated: raw_row_count=' + out.raw_row_count
      + ' != denominator=' + out.denominator
      + ' + noncanonical_status_count=' + out.noncanonical_status_count);
  }

  // --- 2단계: 행별 증거 구성 + 판정 ----------------------------------------
  //
  // `record` 는 **증거층** 산출물이다. doc_status 를 함께 싣지만 그것은 표시용이며,
  // verdict 는 오라클이 status 를 보지 못한 채 낸 값이다 — 변조 불변성 test 가
  // (decision_id, evidence_verdict) 쌍의 집합이 status 변조에 불변임을 단언한다.
  const record = (row, adjudication, verdictOverride, reasonOverride) => {
    out.adjudications.push({
      prd: row.prd,
      milestone: row.milestone,
      decision_id: row.decisionId,
      doc_status: row.doc_status,
      evidence_verdict: verdictOverride || (adjudication && adjudication.verdict) || VERDICT_UNDETERMINED,
      evidence_ref: adjudication ? adjudication.evidence_ref : null,
      codex_verdict: adjudication ? adjudication.codex_verdict : null,
      reason: reasonOverride || (adjudication && adjudication.reason) || null,
    });
  };

  for (const row of rows) {
    if (!row.planBasename) {
      out.no_plan_count += 1;
      out.undetermined_evidence_count += 1;
      record(row, null, VERDICT_UNDETERMINED, row.planRefReason || 'row declares no plan link');
      if (row.planRefReason) {
        warnings.push('unresolvable plan reference for "' + row.milestone + '" ('
          + row.prd + '): ' + row.planRefReason);
      }
      continue;
    }

    let evidence;
    try {
      evidence = buildEvidence({
        repoRoot: root,
        planPath: row.planPath,
        planBasename: row.planBasename,
        duplicateKey: row.duplicateKey,
        gitQuery: gitQuery,
        defaultRef: refResolution.ref || undefined,
        planIndex: planIndex || undefined,
      });
    } catch (e) {
      // per-source fail-open — 이 행만 undetermined, 전체는 계속.
      warnings.push('evidence build failed for ' + row.milestone + ': ' + e.message);
      out.undetermined_evidence_count += 1;
      record(row, null, VERDICT_UNDETERMINED, 'evidence build failed: ' + e.message);
      continue;
    }

    if (!looksLikeBuilderEvidence(evidence)) {
      // 제3의 생산자가 끼어들었다 — 독립성을 주장할 수 없다.
      out.independence_ok = false;
      warnings.push('evidence for ' + row.milestone + ' does not match the builder shape');
      out.undetermined_evidence_count += 1;
      record(row, null, VERDICT_UNDETERMINED, 'evidence does not match the builder shape');
      continue;
    }

    const adjudication = adjudicateMilestone({
      planBasename: row.planBasename,
      planPath: row.planPath,
      evidence: evidence,
    });

    record(row, adjudication);

    if (adjudication.verdict === VERDICT_UNDETERMINED) {
      out.undetermined_evidence_count += 1;
      continue;
    }

    const expectsShipped = DOC_STATUS_SHIPPED_SIDE.has(row.doc_status)
      ? true
      : (DOC_STATUS_UNSHIPPED_SIDE.has(row.doc_status) ? false : null);

    if (isDrift(expectsShipped, adjudication.verdict)) {
      out.drift_count += 1;
      out.drift_items.push({
        prd: row.prd,
        milestone: row.milestone,
        doc_status: row.doc_status,
        evidence_verdict: adjudication.verdict,
        evidence_ref: adjudication.evidence_ref,
        codex_verdict: adjudication.codex_verdict,
      });
    }
  }

  return out;
}

module.exports = {
  scanMilestoneEvidence,
  DOC_STATUS_SHIPPED_SIDE,
  DOC_STATUS_UNSHIPPED_SIDE,
  PRODUCER_COVERAGE,
};
