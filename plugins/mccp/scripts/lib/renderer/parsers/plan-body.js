'use strict';

const fs = require('fs');
const path = require('path');
const { stripLineMarker, isResolved } = require('./resolution-marker');
const { isMilestoneClosed, ledgerCloseFresh } = require('./decision-state');
// Dashboard Data Exploration M1 — PRD 그룹핑 토대. canonicalPlanPath/prdSlug 를
// prd-group.js 와 공유(섹션이 item.source 를 같은 함수로 정규화해 planPrd 조회).
const { canonicalPlanPath, prdSlug } = require('./prd-group');
// plan_hash freshness 계산용(M5 Codex Implement-F1). plan 경로는 structural hash
// (status 토큰/체크박스 무관) → receipt.plan_hash 와 동일 정규화.
const { planAwareMarkdownHash } = require('../../../receipt/hash');

// M5 — in-progress 신선도 가드 임계(일). plan 의 마지막 receipt/ledger 활동이
// 이 일수를 넘으면 stale 로 강등(진행중 카운트에서 제외). env override.
function staleDaysThreshold() {
  const raw = process.env.MCCP_DASHBOARD_STALE_DAYS;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 14;
}

// plan(decision/basename)의 마지막 활동 시각(ms). receipt.created_at + ledger
// .completed_at 중 최신. 활동 신호가 없으면 null(→ 신선도 판정 보류, fail-open).
function lastActivityMs(decisionId, planBasename, receipts, ledgerItems) {
  let t = 0;
  for (const r of receipts || []) {
    if (!r || r.ok === false || !r.created_at) continue;
    if (decisionId && r.decision_id === decisionId) {
      const ms = Date.parse(r.created_at);
      if (Number.isFinite(ms)) t = Math.max(t, ms);
    }
  }
  for (const e of ledgerItems || []) {
    if (!e || !e.completed_at) continue;
    const match = (decisionId && e.decision_id === decisionId)
      || (planBasename && e.plan_basename === planBasename);
    if (match) {
      const ms = Date.parse(e.completed_at);
      if (Number.isFinite(ms)) t = Math.max(t, ms);
    }
  }
  return t || null;
}

// M3 — 'dropped' 추가(마일스톤 lifecycle). 기존 3 status 불변(additive).
const VALID_STATUSES = new Set(['pending', 'in-progress', 'complete', 'dropped']);

// 추출 경로의 markdown-link/inline-code/quote 래퍼 제거. 평문 Source PRD가
// 백틱·따옴표·대괄호로 감싸진 경우 해석 전에 벗긴다 (Codex F1 absorption).
function stripPathWrappers(s) {
  return String(s == null ? '' : s).trim().replace(/^[`'"<[]+|[`'">\]]+$/g, '').trim();
}

// source_prd ref를 plan-dir-relative(링크 형태) 또는 repo-root-relative(평문)
// 둘 다 시도해 실제로 읽히는 경로를 채택한다. 렌더러는 ref를 plan 디렉토리 기준
// 으로 resolve하므로 평문 `.claude/prds/...` 는 `.claude/plans/.claude/prds/...`
// 로 이중화돼 fail-open skip 됐다 — dual-candidate로 해소 (Codex F1 absorption).
function resolvePrdRef(ref, planAbs, cwd, fsRead) {
  const cleaned = stripPathWrappers(ref);
  if (!cleaned) return null;
  const candidates = path.isAbsolute(cleaned)
    ? [cleaned]
    : [path.resolve(path.dirname(planAbs), cleaned), path.resolve(cwd, cleaned)];
  for (const c of candidates) {
    try { return { path: c, body: fsRead(c) }; } catch (_) { /* try next candidate */ }
  }
  return null;
}

// Delivery Milestones 표의 Plan 셀에서 `.plan.md` 경로를 추출한다. `(report: …)`
// 같은 괄호 annotation을 잡지 않도록 markdown-link target → bare `.plan.md`
// 토큰 순으로 우선하고, 미발견 시 legacy 첫-괄호 폴백 (Codex F2 absorption).
function extractPlanPath(planCell) {
  const cell = String(planCell == null ? '' : planCell);
  const links = cell.match(/\[[^\]]*\]\(([^)]+)\)/g) || [];
  for (const lk of links) {
    const m = lk.match(/\]\(([^)]+)\)/);
    if (m && /\.plan\.md$/i.test(m[1].trim())) return stripPathWrappers(m[1]);
  }
  const bare = cell.match(/(?:^|[\s(`'"[])([^\s()`'"[\]]+\.plan\.md)\b/i);
  if (bare) return stripPathWrappers(bare[1]);
  const paren = cell.match(/\(([^)]+)\)/);
  return paren ? stripPathWrappers(paren[1]) : null;
}

function findSection(body, heading) {
  const startMatch = new RegExp('^' + heading + '\\s*$', 'm').exec(body);
  if (!startMatch) return null;
  const startIdx = startMatch.index + startMatch[0].length;
  const rest = body.slice(startIdx);
  const nextHeader = rest.match(/\n##\s/);
  return nextHeader ? rest.slice(0, nextHeader.index) : rest;
}

// M3 (Codex F2) — opts.withMeta=true 면 각 데이터 행에 stripLineMarker 를 **셀
// split 이전** 적용해 행끝 해결 마커를 제거(phantom 셀 0)하고 row 객체
// `{cells, resolved, meta}` 를 반환. 기본(withMeta 미지정)은 cells 배열을 그대로
// 반환 — 마일스톤 파서 등 기존 caller 의 반환 shape 불변.
function parseTableRows(section, opts) {
  opts = opts || {};
  const withMeta = !!opts.withMeta;
  if (!section) return [];
  const lines = section.split(/\r?\n/);
  const rows = [];
  let inTable = false;
  for (const rawLine of lines) {
    const sm = withMeta ? stripLineMarker(rawLine) : null;
    const line = sm ? sm.line : rawLine;
    const trimmed = line.trim();
    if (/^\|\s*-+/.test(trimmed)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!trimmed.startsWith('|')) {
      if (trimmed === '') continue;
      break;
    }
    const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    // M8 follow-up — UNescaped 파이프만 셀 구분자로 분리. markdown `\|` 는 셀 안의
    // 리터럴 파이프다. 이전 `split('|')` 는 escaped pipe 까지 쪼개 Outcome 셀의
    // `a\|b\|c` 가 downstream 컬럼을 전부 밀어 Status/Plan 셀이 엉뚱한 index 로
    // 가고 행이 조용히 드롭됐다(완료 plan lifecycle 미검출 → 위험 오집계 원인).
    const cells = inner.split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, '|').trim());
    if (withMeta) rows.push({ cells, resolved: sm.resolved, meta: sm.meta });
    else rows.push(cells);
  }
  return rows;
}

function parseDeliveryMilestones(prdBody) {
  const result = new Map();
  const section = findSection(prdBody, '## Delivery Milestones');
  if (!section) return result;
  const rows = parseTableRows(section);
  for (const cells of rows) {
    if (cells.length < 5) continue;
    const status = cells[3].toLowerCase();
    if (!VALID_STATUSES.has(status)) continue;
    // M5 (Codex root-cause) — Plan 셀이 markdown-link `[..](..)` 든 backtick
    // bare path(`` `.claude/plans/x.plan.md` ``)든 모두 추출. 기존 parens-only
    // 정규식은 backtick bare-path PRD(dashboard-truthfulness 등)의 모든 행을
    // skip해 그 마일스톤이 in-progress 집계에 아예 안 잡혔다. Complete/Lifecycle
    // 파서가 쓰는 extractPlanPath 재사용으로 세 파서의 Plan-셀 추출을 일관화.
    const planPath = extractPlanPath(cells[4]);
    if (!planPath || planPath === '—' || planPath === '-') continue;
    const basename = planPath.split(/[\\/]/).pop();
    if (basename) result.set(basename, status);
  }
  return result;
}

function parseOpenQuestions(planBody) {
  if (!planBody) return [];
  const lines = planBody.split(/\r?\n/);
  const out = [];
  const headingStack = [];
  let inOQ = false;
  let oqHeadingLine = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h2) {
      headingStack.length = 0;
      headingStack.push('## ' + h2[1].trim());
      inOQ = /open\s+questions/i.test(h2[1]);
      if (inOQ) oqHeadingLine = i + 1;
      continue;
    }
    if (h3) {
      while (headingStack.length > 1) headingStack.pop();
      headingStack.push('### ' + h3[1].trim());
      continue;
    }
    if (!inOQ) continue;
    // M3 (Codex F2) — 행끝 해결 마커를 셀/텍스트 파싱 이전 제거. resolved 신호는
    // raw 라인의 `<!--mccp:resolved-->` 마커뿐(Codex F1 — bare `[x]` 미인정).
    const { line: cleaned } = stripLineMarker(line);
    const m = cleaned.match(/^\s*-\s+(?:\[[ xX]?\]\s+)?(.+?)\s*$/);
    if (m) {
      const text = m[1].trim();
      if (text) {
        out.push({
          text,
          lineNumber: i + 1,
          headingPath: headingStack.slice(),
          oqHeadingLineNumber: oqHeadingLine,
          resolved: isResolved(line),
        });
      }
    }
  }
  return out;
}

// Dashboard Truthfulness M8 (③ 글자-ID strip) — v0-4-0-orchestrator 식 axis
// 글자-ID prefix("H — plan-implement verify", "A , metric pivot", "**I — foo")를
// 제거한다. 단일 대문자 + dash/comma 구분자 + 공백만 매칭하므로 "M3 — foo"(글자+
// 숫자)·"Done one"(구분자 없음)·"v0.3.4 ship"(소문자/숫자 시작)은 미스킵. bold
// 래퍼(`**`)는 보존해 이름만 정리한다.
function stripAxisIdPrefix(name) {
  return String(name == null ? '' : name)
    .replace(/^(\*\*|__)?\s*[A-Z]\s*[—–\-,]\s+/, '$1')
    .trim();
}

function parseDeliveryMilestonesComplete(prdBody) {
  const out = [];
  const section = findSection(prdBody, '## Delivery Milestones');
  if (!section) return out;
  const rows = parseTableRows(section);
  for (const cells of rows) {
    if (cells.length < 5) continue;
    const status = cells[3].toLowerCase();
    if (status !== 'complete') continue;
    const name = stripAxisIdPrefix((cells[1] || '').trim());
    const planCell = cells[4] || '';
    const planPath = extractPlanPath(planCell);
    const basename = planPath ? planPath.split(/[\\/]/).pop() : null;
    if (name) out.push({ name, planBasename: basename, planPath });
  }
  return out;
}

function parseRisks(planBody) {
  const section = findSection(planBody, '## Risks');
  if (!section) return { rows: [], malformedCount: 0 };
  // M3 (Codex F2) — withMeta: 행끝 마커는 셀 split 이전 stripLineMarker 로 제거되어
  // risk 텍스트가 마커-free 이고 row 별 resolved flag 가 함께 온다.
  const rows = parseTableRows(section, { withMeta: true });
  const out = [];
  let malformedCount = 0;
  for (const row of rows) {
    const cells = row.cells;
    if (cells.length === 4) {
      out.push({
        risk: cells[0],
        likelihood: cells[1],
        impact: cells[2],
        mitigation: cells[3],
        resolved: row.resolved,
        resolvedMeta: row.meta,
      });
    } else if (cells.length === 3) {
      out.push({
        risk: cells[0],
        likelihood: cells[1],
        impact: '',
        mitigation: cells[2],
        resolved: row.resolved,
        resolvedMeta: row.meta,
      });
    } else {
      malformedCount += 1;
    }
  }
  return { rows: out, malformedCount };
}

// M3 — 마일스톤 lifecycle 파서. `## Delivery Milestones` 표에서 pending/dropped
// 행을 link 무요구로 수집(complete 는 milestone-history 의 완료 기록이 담당).
// 반환 키 {name, outcome, status, planPath, planBasename}. 표 컬럼:
// [0]=# [1]=Milestone(name) [2]=Outcome [3]=Status [4]=Plan.
function parseDeliveryMilestonesLifecycle(prdBody) {
  const out = [];
  const section = findSection(prdBody, '## Delivery Milestones');
  if (!section) return out;
  const rows = parseTableRows(section);
  for (const cells of rows) {
    if (cells.length < 5) continue;
    const status = (cells[3] || '').toLowerCase();
    if (status !== 'pending' && status !== 'dropped') continue;
    const name = stripAxisIdPrefix((cells[1] || '').trim());
    if (!name) continue;
    const outcome = (cells[2] || '').trim();
    const planCell = cells[4] || '';
    const planPath = extractPlanPath(planCell);
    const planBasename = planPath ? planPath.split(/[\\/]/).pop() : null;
    out.push({ name, outcome, status, planPath, planBasename });
  }
  return out;
}

function sourcePrdPath(p) {
  if (!p || !p.source_prd) return null;
  if (typeof p.source_prd === 'string') return p.source_prd;
  if (typeof p.source_prd === 'object' && p.source_prd.path) return p.source_prd.path;
  return null;
}

// Dashboard Data Exploration M1 — PRD H1 제목 = 그룹 **표시 라벨 전용**(라벨로
// 키잉하지 않음 — 동일 H1 라벨 충돌 회피, Codex F2). H1 부재 시 PRD 파일 stem(kebab)
// fail-open. `^#\s+`만 매칭하므로 `## H2`는 미스킵.
// PRD H1 → 그룹 헤더/필터 옵션 표시 라벨. inline code/bold 마커(`code`/**bold**)는
// strip 한 plain 텍스트 — 라벨은 plain 컨텍스트(prd-group <summary> span · <option>
// 텍스트)에 들어가는데, escapeHtml 이 backtick 을 &#96; 로 인코딩하면 H16
// entity-backtick(unrendered marker, 실데이터 plan H1 에 `id` 포함 시)이 발화한다.
// snake_case 보호 위해 leftover 는 backtick/asterisk 만 제거(unpaired _ 보존).
function stripInlineMarkers(s) {
  return String(s)
    .replace(/``([^\n]+?)``/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/[*`]/g, '');
}

function extractPrdLabel(prdBody, prdAbs) {
  const m = /^#\s+(.+?)\s*$/m.exec(String(prdBody || ''));
  if (m && m[1].trim()) return stripInlineMarkers(m[1].trim());
  return path.basename(prdAbs || '').replace(/\.prd\.md$/i, '').replace(/\.md$/i, '') || 'PRD';
}

// PRD 경로 → data-prd 안정 식별자(prdKey). **prdPath 파생**(라벨 slug 아님 — 동일
// H1 두 PRD 가 다른 group 으로 분리되어야 함, Codex F2). cwd-relative 로 만들어
// machine-independent(절대경로면 basename fallback). 동명 basename 다른 디렉토리는
// 서로 다른 relative path → 서로 다른 prdKey(오귀속 0).
function derivePrdKey(prdAbs, cwd) {
  let rel = String(prdAbs || '');
  try {
    const r = path.relative(cwd || process.cwd(), prdAbs);
    rel = (r && !r.startsWith('..') && !path.isAbsolute(r)) ? r : path.basename(prdAbs);
  } catch (_e) {
    rel = path.basename(rel);
  }
  return prdSlug(rel.replace(/\.prd\.md$/i, '').replace(/\.md$/i, ''));
}

function extractCyclePrefix(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const m = slug.match(/^(v\d+-\d+-\d+)/);
  return m ? m[1] : null;
}

function computePlanStaleness(plan, model) {
  if (!plan || !plan.path) return 'unknown';
  const basename = path.basename(plan.path).replace(/\.plan\.md$/, '').replace(/\.md$/, '');
  const planCycle = extractCyclePrefix(basename);
  const fp = (model && model.sources && model.sources.state
            && model.sources.state.item && model.sources.state.item.frontmatter
            && model.sources.state.item.frontmatter.task_fingerprint) || null;
  if (!fp) return 'unknown';
  const fpCycle = extractCyclePrefix(fp);
  if (!planCycle || !fpCycle) return 'unknown';
  return planCycle === fpCycle ? 'fresh' : 'stale';
}

// v1.18.1 M3 — 마일스톤 드로어 요약(OPTIONAL). plan `## Summary` 섹션 첫 단락을
// read-side 추출(receipt 스키마 무확장 — chain-of-custody 무손상). 부재 시 null →
// 드로어 graceful degrade. 다음 `##` heading 또는 빈 줄 2개에서 단락 종료.
function extractPlanSummary(planBody) {
  const section = findSection(planBody, '## Summary');
  if (!section) return null;
  const lines = section.split(/\r?\n/);
  const para = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) { if (para.length) break; else continue; }
    if (/^#{1,6}\s/.test(t)) break;
    para.push(t);
  }
  const text = para.join(' ').trim();
  return text || null;
}

// Dashboard Truthfulness M1 Task 3 — ship-time snapshot of a plan's `## Risks`
// (Risk column) + `## Open Questions` (list-item text). The completion-ledger
// facade reads the plan body at gate-converge time and stores these as
// risks_closed[] / oq_closed[]; M3 will diff this snapshot against the live
// plan body to retire resolved rows. fail-open → { risks: [], openQuestions: [] }.
function extractRisksAndOpenQuestions(planBody) {
  const out = { risks: [], openQuestions: [] };
  if (!planBody || typeof planBody !== 'string') return out;
  try {
    const { rows } = parseRisks(planBody);
    out.risks = rows
      .map(function (r) { return (r.risk || '').trim(); })
      .filter(Boolean);
  } catch (_e) { out.risks = []; }
  try {
    out.openQuestions = parseOpenQuestions(planBody)
      .map(function (o) { return (o.text || '').trim(); })
      .filter(Boolean);
  } catch (_e) { out.openQuestions = []; }
  return out;
}

function parsePlanBody(model, opts) {
  opts = opts || {};
  const cwd = opts.cwd || process.cwd();
  const fsRead = opts.fsRead || ((p) => fs.readFileSync(p, 'utf8'));
  const m = model || {};
  const plansSrc = (m.sources && m.sources.plans) || {};
  const plans = plansSrc.items || [];

  const planStatuses = new Map();
  const planStaleness = new Map();
  const openQuestions = [];
  const risks = [];
  const warnings = [];
  let degraded = false;

  const prdBodies = new Map();
  // Dashboard Data Exploration M1 — planPrd: Map(canonicalPlanPath → { prdPath,
  // prdLabel, prdKey }). 섹션(risks/open-questions)이 항목 source 를 같은
  // canonicalPlanPath 로 정규화해 조회 → PRD 그룹 분배. prdMetaByPath 캐시로 PRD당
  // 1회 라벨/키 파생.
  const prdMetaByPath = new Map();
  const planPrd = new Map();
  for (const p of plans) {
    if (!p || !p.path) continue;
    const planAbs = path.isAbsolute(p.path) ? p.path : path.resolve(cwd, p.path);
    const prdRel = sourcePrdPath(p);
    if (!prdRel) continue;
    const resolved = resolvePrdRef(prdRel, planAbs, cwd, fsRead);
    if (!resolved) {
      degraded = true;
      warnings.push({ source: prdRel, message: 'PRD read failed (all candidates unreadable)' });
      continue;
    }
    if (!prdBodies.has(resolved.path)) prdBodies.set(resolved.path, resolved.body);
    if (!prdMetaByPath.has(resolved.path)) {
      prdMetaByPath.set(resolved.path, {
        prdLabel: extractPrdLabel(resolved.body, resolved.path),
        prdKey: derivePrdKey(resolved.path, cwd),
      });
    }
    const meta = prdMetaByPath.get(resolved.path);
    // 키는 stored p.path 의 canonical form(항목이 source: p.path 를 그대로 들고 옴).
    planPrd.set(canonicalPlanPath(p.path), {
      prdPath: resolved.path, prdLabel: meta.prdLabel, prdKey: meta.prdKey,
    });
  }

  for (const [prdAbs, prdBody] of prdBodies) {
    const statusMap = parseDeliveryMilestones(prdBody);
    if (statusMap.size === 0) {
      degraded = true;
      warnings.push({ source: prdAbs, message: 'no Delivery Milestones table found' });
    }
    for (const [basename, status] of statusMap) {
      planStatuses.set(basename, status);
    }
  }

  // M5 Task 1 — 완료 자동감지 override 레이어. PRD 표 status 가 in-progress 여도
  // terminal receipt(plan_hash-fresh) 또는 completion-ledger 가 닫힌 마일스톤을
  // complete 로 간주(Codex F1: plan_hash 상관, fail-closed). PRD 데이터가 stale
  // 이어도 durable 완료 신호가 있으면 진행중에서 제외 — '진행중=실제'의 안전망.
  const receiptItems = (m.sources && m.sources.receipts && m.sources.receipts.items) || [];
  const ledgerItems = (m.sources && m.sources.ledger && m.sources.ledger.items) || [];
  const planAbsByBasename = new Map();
  for (const p of plans) {
    if (!p || !p.path) continue;
    planAbsByBasename.set(path.basename(p.path),
      path.isAbsolute(p.path) ? p.path : path.resolve(cwd, p.path));
  }
  for (const [basename, status] of planStatuses) {
    if (status !== 'in-progress') continue;
    const decisionId = basename.replace(/\.plan\.md$/, '').replace(/\.md$/, '');
    let currentPlanHash = null;
    const planAbs = planAbsByBasename.get(basename);
    if (planAbs) {
      // plan 파일이 현재 worktree 에 있으면 structural hash 로 freshness 비교.
      // 부재(archived/worktree-removed)면 null → ledger-only close 경로로 위임.
      try { currentPlanHash = planAwareMarkdownHash(planAbs); } catch (_e) { currentPlanHash = null; }
    }
    let closed;
    try {
      closed = isMilestoneClosed({ decisionId, planBasename: basename, currentPlanHash,
        receipts: receiptItems, ledgerItems });
    } catch (_e) { closed = { closed: false }; }
    if (closed && closed.closed) planStatuses.set(basename, 'complete');
  }

  // M8 — 위험 lifecycle scope. 출처 plan 이 완료/은퇴면 그 plan 의 미마커 위험을
  // active 에서 분리(이력 버킷). **위험을 숨기는 건 fresh 증거를 요구**(Codex F1):
  //   (1) planStatuses complete/dropped(PRD lifecycle SSoT + M5 auto-detect 승격),
  //   (2) terminal-receipt(isMilestoneClosed 내부 plan_hash-fresh guard 신뢰),
  //   (3) ledgerCloseFresh(STRICT id+basename+hash) — bare ledger path 는 쓰지 않음.
  // reopened/edited(hash 불일치)·null-hash(archived/unreadable)·unknown → false →
  // active 유지(under-claim 안전). per-plan 캐시로 plan 당 1회 판정.
  const sourceClosedCache = new Map();
  function sourcePlanClosed(planRelPath) {
    const basename = path.basename(planRelPath);
    if (sourceClosedCache.has(basename)) return sourceClosedCache.get(basename);
    let closedFlag = false;
    const status = planStatuses.get(basename);
    if (status === 'complete' || status === 'dropped') {
      closedFlag = true; // (1) 해시 미계산 short-circuit
    } else {
      const decisionId = basename.replace(/\.plan\.md$/, '').replace(/\.md$/, '');
      let currentPlanHash = null;
      const planAbs = planAbsByBasename.get(basename);
      if (planAbs) {
        try { currentPlanHash = planAwareMarkdownHash(planAbs); } catch (_e) { currentPlanHash = null; }
      }
      let viaTerminal = false;
      try {
        const c = isMilestoneClosed({ decisionId, planBasename: basename, currentPlanHash,
          receipts: receiptItems, ledgerItems });
        viaTerminal = !!(c && c.closed && c.via === 'terminal-receipt');
      } catch (_e) { viaTerminal = false; }
      if (viaTerminal) {
        closedFlag = true; // (2) terminal-receipt: plan_hash-fresh 내장
      } else {
        try {
          closedFlag = ledgerCloseFresh({ decisionId, planBasename: basename, currentPlanHash,
            receipts: receiptItems, ledgerItems });
        } catch (_e) { closedFlag = false; } // (3) STRICT ledger(id+basename+hash)
      }
    }
    sourceClosedCache.set(basename, closedFlag);
    return closedFlag;
  }

  for (const p of plans) {
    if (!p || !p.path) continue;
    const planAbs = path.isAbsolute(p.path) ? p.path : path.resolve(cwd, p.path);
    let planBody;
    try { planBody = fsRead(planAbs); }
    catch (err) {
      degraded = true;
      warnings.push({ source: planAbs, message: 'plan read failed: ' + err.message });
      continue;
    }
    const oq = parseOpenQuestions(planBody);
    oq.forEach((entry, idx) => {
      openQuestions.push({
        source: p.path,
        text: entry.text,
        lineNumber: entry.lineNumber,
        // v1.18.1 M3 — drawer 안정 키 fallback(lineNumber 부재 시). plan 내 등장 순.
        ordinal: idx,
        headingPath: entry.headingPath,
        oqHeadingLineNumber: entry.oqHeadingLineNumber,
        // M3 — 해결 마커 전파(parser 가 raw 라인에서 감지한 flag). 섹션이 소비.
        resolved: !!entry.resolved,
      });
    });
    const { rows: riskRows, malformedCount } = parseRisks(planBody);
    // v1.18.1 M3 — risk 안정 키는 plan Risks 표 등장 순서(ordinal). 중복 위험
    // 텍스트에도 유일·안정(text-hash 폐기, Codex R1 F2). render-time 정렬과 무관한
    // parse-time 원본 순서를 박는다.
    riskRows.forEach((row, idx) => {
      risks.push(Object.assign({}, row, {
        source: p.path,
        ordinal: idx,
        // M8 — 출처 plan lifecycle. active 필터(risks.js/status-grid.js)가 소비.
        sourceClosed: sourcePlanClosed(p.path),
      }));
    });
    if (malformedCount > 0) {
      warnings.push({
        source: planAbs,
        message: malformedCount + ' malformed Risks row(s) skipped',
      });
    }
  }

  // M5 Task 1 — 신선도 가드. 활동(receipt/ledger) 신호가 있고 임계(기본 14일)를
  // 넘으면 stale 로 강등(진행중 카운트 제외). 활동 신호가 없으면 기존 cycle-based
  // 판정으로 fallback — receipt-less 신규 작업을 stale 로 숨기지 않음(fail-open).
  const staleMs = staleDaysThreshold() * 24 * 60 * 60 * 1000;
  const nowMs = (opts.now != null ? opts.now : Date.now());
  for (const p of plans) {
    if (!p || !p.path) continue;
    const basename = path.basename(p.path);
    if (planStatuses.get(basename) !== 'in-progress') continue;
    const decisionId = basename.replace(/\.plan\.md$/, '').replace(/\.md$/, '');
    const last = lastActivityMs(decisionId, basename, receiptItems, ledgerItems);
    if (last != null && (nowMs - last) > staleMs) {
      planStaleness.set(basename, 'stale');
    } else {
      planStaleness.set(basename, computePlanStaleness(p, model));
    }
  }

  return { planStatuses, planStaleness, openQuestions, risks, warnings, degraded, planPrd };
}

module.exports = {
  parsePlanBody,
  parseDeliveryMilestones,
  parseDeliveryMilestonesComplete,
  parseDeliveryMilestonesLifecycle,
  parseOpenQuestions,
  parseRisks,
  extractRisksAndOpenQuestions,
  extractPlanSummary,
  extractCyclePrefix,
  computePlanStaleness,
  resolvePrdRef,
  extractPlanPath,
  stripPathWrappers,
  stripAxisIdPrefix,
  extractPrdLabel,
  derivePrdKey,
};
