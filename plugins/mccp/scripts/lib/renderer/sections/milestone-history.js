'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseDeliveryMilestonesComplete,
  parseDeliveryMilestonesLifecycle,
  resolvePrdRef,
  extractPlanSummary,
} = require('../parsers/plan-body');
const { detailId, addDetail, buildMilestoneDetail, renderDetailMd } = require('../parsers/drawer-detail');
const { buildTabs } = require('../parsers/tabs');

const MAX_EXPANDED = 5;

// receipt 부재 시 완료 시점 fallback. plan 파일의 최종 commit 시점을 read한다.
// fail-open: git 부재 / 미커밋 / 경로 미존재 → null (caller가 '날짜 미상' 표시).
function defaultGitCommitTime(cwd) {
  return (relPath) => {
    try {
      const { execFileSync } = require('child_process');
      const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', relPath], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const s = (out || '').trim();
      return s || null;
    } catch (_) {
      return null;
    }
  };
}

// PRD 셀의 planPath(repo-root-relative 평문 또는 PRD-dir-relative 링크)를
// repo-root / PRD-dir 두 기준으로 해석해 실제 git 시점이 잡히는 경로를 채택.
// '.claude/plans/', '.claude/PRPs/plans/completed/', '../plans/' 모두 커버하며
// basename 재구성을 쓰지 않는다 (Codex F2 absorption).
function resolveGitCommitTime(planPath, prdDir, cwd, gitCommitTime) {
  if (!planPath) return null;
  const cleaned = String(planPath).trim();
  if (!cleaned) return null;
  const absCandidates = path.isAbsolute(cleaned)
    ? [cleaned]
    : [path.resolve(cwd, cleaned), path.resolve(prdDir, cleaned)];
  // PRD 셀이 archive 전 경로(`.claude/plans/...`)로 stale일 수 있다 — archived plan은
  // `.claude/PRPs/plans/completed/`로 이동된다. directory-preserving 후보가 모두
  // 빈 결과면 canonical archive/active 위치를 basename으로 최종 시도 (Codex F2).
  const base = cleaned.split(/[\\/]/).pop();
  if (base && /\.plan\.md$/i.test(base)) {
    absCandidates.push(path.resolve(cwd, '.claude/PRPs/plans/completed', base));
    absCandidates.push(path.resolve(cwd, '.claude/plans', base));
  }
  for (const abs of absCandidates) {
    const rel = path.relative(cwd, abs);
    const t = gitCommitTime(rel || cleaned);
    if (t) return t;
  }
  return null;
}

function planRef(p) {
  if (!p) return null;
  if (typeof p.source_prd === 'string') return p.source_prd;
  if (p.source_prd && typeof p.source_prd === 'object' && p.source_prd.path) return p.source_prd.path;
  return null;
}

function pickShipReceipt(receipts, planBasename) {
  if (!planBasename) return null;
  const slug = planBasename.replace(/\.plan\.md$/, '').replace(/\.md$/, '');
  let best = null;
  for (const r of receipts) {
    if (!r) continue;
    // F2 absorption — derive normalize 출력은 `gate`. 원본은 `gate_id`. 양쪽 호환.
    const gate = r.gate_id || r.gate;
    if (gate !== 'mccp-pr-codex') continue;
    const dec = r.decision_id || '';
    if (!dec) continue;
    const slugCycle = (slug.match(/^(v\d+-\d+-\d+)/) || [])[0] || null;
    const decCycle = (dec.match(/^(v\d+-\d+-\d+)/) || [])[0] || null;
    const ok = dec.indexOf(slug) >= 0
      || slug.indexOf(dec) >= 0
      || (slugCycle && decCycle && slugCycle === decCycle);
    if (!ok) continue;
    if (!r.created_at) continue;
    if (!best || new Date(r.created_at).getTime() > new Date(best.created_at).getTime()) {
      best = r;
    }
  }
  return best;
}

// Dashboard Truthfulness M1 — durable completion fallback. The completion
// ledger (`.claude/state/completion-ledger/`) is git-tracked, so it survives
// `git worktree remove` after merge — the exact post-merge amnesia window
// where the live pr-codex receipt is gone. Match by plan_basename (and
// decision_id when available); newest completed_at wins. More precise + more
// durable than the git-commit-time floor, so it sits ABOVE git time and BELOW
// the live receipt in the ladder.
function pickLedgerEntry(ledgerItems, planBasename, decisionId) {
  if (!Array.isArray(ledgerItems) || ledgerItems.length === 0) return null;
  let best = null;
  for (const e of ledgerItems) {
    if (!e) continue;
    const matchBasename = planBasename && e.plan_basename === planBasename;
    const matchDecision = decisionId && e.decision_id === decisionId;
    if (!matchBasename && !matchDecision) continue;
    if (!e.completed_at) continue;
    if (!best || new Date(e.completed_at).getTime() > new Date(best.completed_at).getTime()) {
      best = e;
    }
  }
  return best;
}

function renderMilestoneHistory(model, formatUtils, planBody, opts) {
  opts = opts || {};
  const { escapeHtml, formatRelativeTime, renderProseHtml } = formatUtils;
  const m = model || {};
  const cwd = opts.cwd
    || (m.repo_root && typeof m.repo_root === 'string' && m.repo_root !== '<repo>'
      ? m.repo_root : process.cwd());
  const fsRead = opts.fsRead || ((p) => fs.readFileSync(p, 'utf8'));
  const gitCommitTime = opts.gitCommitTime || defaultGitCommitTime(cwd);
  const plans = (m.sources && m.sources.plans && m.sources.plans.items) || [];
  const receipts = (m.sources && m.sources.receipts && m.sources.receipts.items) || [];
  const ledgerItems = (m.sources && m.sources.ledger && m.sources.ledger.items) || [];

  // 각 plan의 source_prd를 dual-path(plan-dir / repo-root)로 해석해 실제로 읽히는
  // PRD를 채택 → 평문-경로 PRD discovery 복원 (Codex F1 absorption).
  const all = [];
  // M3 — lifecycle(pending/dropped) 행을 완료-기록 early-return *앞*에서 수집(Codex
  // F3 — lifecycle-only PRD 도 렌더). dedup by status|basename|name.
  const lifecycle = [];
  const seenLifecycle = new Set();
  const seenPrd = new Set();
  for (const p of plans) {
    if (!p || !p.path) continue;
    const ref = planRef(p);
    if (!ref) continue;
    const planAbs = path.isAbsolute(p.path) ? p.path : path.resolve(cwd, p.path);
    const resolved = resolvePrdRef(ref, planAbs, cwd, fsRead);
    if (!resolved) continue;
    if (seenPrd.has(resolved.path)) continue;
    seenPrd.add(resolved.path);
    const prdDir = path.dirname(resolved.path);
    const completeRows = parseDeliveryMilestonesComplete(resolved.body);
    for (const lr of parseDeliveryMilestonesLifecycle(resolved.body)) {
      // Dashboard Truthfulness M8 (② lifecycle 스코핑) — 'pending'(예정)은 아직
      // 시작도 안 한 speculative 마일스톤이라 대시보드 truthfulness를 흐린다.
      // 명시적 결정인 'dropped'(폐기)만 surface하고 예정은 제외한다(사용자 결정
      // 2026-06-25: "미진행 중 예정인 것들은 전부 폐기").
      if (lr.status !== 'dropped') continue;
      const key = lr.status + '|' + (lr.planBasename || lr.name);
      if (seenLifecycle.has(key)) continue;
      seenLifecycle.add(key);
      lifecycle.push(lr);
    }
    for (const row of completeRows) {
      const ship = pickShipReceipt(receipts, row.planBasename);
      let completedAt = ship && ship.created_at ? ship.created_at : null;
      // Durable ledger fallback (above git-time) — survives merge + worktree
      // removal, resolving the "날짜 미상" headline regression. decision_id is
      // passed null on purpose: delivery-milestone rows carry no decision slug,
      // so plan_basename is the match key. The decisionId param stays in the
      // signature for callers that DO have a slug (entry dedup is by decision).
      if (!completedAt) {
        const led = pickLedgerEntry(ledgerItems, row.planBasename, null);
        if (led && led.completed_at) completedAt = led.completed_at;
      }
      if (!completedAt && row.planPath) {
        completedAt = resolveGitCommitTime(row.planPath, prdDir, cwd, gitCommitTime);
      }
      // v1.18.1 M3 — 마일스톤 드로어 요약(OPTIONAL): plan `## Summary` read-side.
      // 부재/unreadable 시 null → 드로어 graceful degrade. fail-open(throw 안 함).
      let planSummary = null;
      if (row.planPath) {
        const cands = path.isAbsolute(row.planPath)
          ? [row.planPath]
          : [path.resolve(cwd, row.planPath), path.resolve(prdDir, row.planPath)];
        const base = row.planBasename;
        if (base) {
          cands.push(path.resolve(cwd, '.claude/PRPs/plans/completed', base));
          cands.push(path.resolve(cwd, '.claude/plans', base));
        }
        for (const abs of cands) {
          try {
            planSummary = extractPlanSummary(fsRead(abs));
            if (planSummary) break;
          } catch (_) { /* fail-open — 다음 후보 */ }
        }
      }
      all.push({
        name: row.name,
        planBasename: row.planBasename,
        planPath: row.planPath || null,
        completedAt,
        planSummary,
      });
    }
  }

  // dedup by planBasename (한 plan이 multiple PRD 등장 시 최신)
  const seen = new Map();
  for (const e of all) {
    const key = e.planBasename || e.name;
    const prev = seen.get(key);
    if (!prev) { seen.set(key, e); continue; }
    const a = e.completedAt ? new Date(e.completedAt).getTime() : 0;
    const b = prev.completedAt ? new Date(prev.completedAt).getTime() : 0;
    if (a > b) seen.set(key, e);
  }
  const merged = Array.from(seen.values()).sort((a, b) => {
    const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return tb - ta;
  });

  // M3 (Codex F3) — 완료 0 이어도 lifecycle 있으면 렌더(early-return 조건 확장).
  if (merged.length === 0 && lifecycle.length === 0) return null;
  const expanded = merged.slice(0, MAX_EXPANDED);
  const collapsed = merged.slice(MAX_EXPANDED);
  const now = Date.now();
  // v1.18.1 M3 — 드로어 detail 누적(안정 키 = ms:planPath, basename 아닌 path 로
  // 동일-basename 다른 PRD 분리). 요약은 OPTIONAL(plan ## Summary read-side).
  const detailMap = new Map();

  function renderItem(e, ordinal) {
    const rel = e.completedAt && typeof formatRelativeTime === 'function'
      ? formatRelativeTime(e.completedAt, now)
      : (e.completedAt || '날짜 미상');
    const fileHtml = e.planBasename
      ? '<span class="ms-file">' + escapeHtml(e.planBasename) + '</span>'
      : '';
    const whenHtml = e.completedAt
      ? '<span class="ms-when"><time datetime="' + escapeHtml(e.completedAt) + '">' + escapeHtml(rel) + '</time></span>'
      : '<span class="ms-when">' + escapeHtml(rel) + '</span>';
    // 드로어 detail — REQUIRED(이름/plan/ship). 요약은 OPTIONAL(degrade).
    const rawId = detailId('ms', { planPath: e.planPath, name: e.name, ordinal });
    const detail = buildMilestoneDetail(
      { name: e.name, planBasename: e.planBasename, relative: rel },
      e.planSummary,
      formatUtils,
    );
    const { id } = addDetail(detailMap, rawId, detail);
    const html = '<li class="milestone-item" data-detail-id="' + escapeHtml(id) + '">'
      + '<span class="ms-check"><svg class="i" aria-hidden="true"><use href="#ic-check"/></svg>'
      + '<span class="sr-only">완료</span></span>'
      + '<span class="ms-text">' + renderProseHtml(e.name, formatUtils) + fileHtml + '</span>'
      + whenHtml
      + '</li>';
    // v1.18.2 M4 — STATUS.md 동등본. 헤더(이름·ship·plan)는 그대로 두고, drawer-detail
    // SSoT 의 md-누락 행(요약 = plan ## Summary)을 인라인 append. plan/ship 은 헤더가
    // 이미 동일 값으로 표기 → omit(field-key + value 동등, Codex F2). 요약은 plain-text
    // 소비자에게 새로 노출(drawer 와 정보 동등).
    const titleText = detail.titleText
      || (formatUtils.renderProseMd ? formatUtils.renderProseMd(e.name) : e.name);
    const detailMd = renderDetailMd(detail, formatUtils, { omit: new Set(['plan', 'ship']) });
    const md = '- ' + titleText + ' · ' + rel
      + (e.planBasename ? ' (' + e.planBasename + ')' : '')
      + (detailMd ? '\n' + detailMd : '');
    return { html, md };
  }

  const expR = expanded.map((e, i) => renderItem(e, i));
  const colR = collapsed.map((e, i) => renderItem(e, MAX_EXPANDED + i));

  // M3 — lifecycle(pending/dropped) 행. 비-색 이중표기(◌ 예정 / ⊘ 폐기) + 드로어
  // detail 없음(data-detail-id 미부여 → H18 trigger 카운트 무영향). 완료 항목과
  // 구조 동일한 milestone-item li 이되 ms-life-mark 텍스트 마커 사용.
  function renderLifecycleItem(row) {
    const isPending = row.status === 'pending';
    const mark = isPending ? '◌' : '⊘';
    const label = isPending ? '예정' : '폐기';
    const fileHtml = row.planBasename
      ? '<span class="ms-file">' + escapeHtml(row.planBasename) + '</span>'
      : '';
    const html = '<li class="milestone-item ms-lifecycle">'
      + '<span class="ms-life-mark" aria-hidden="true">' + mark + '</span>'
      + '<span class="sr-only">' + escapeHtml(label) + '</span>'
      + '<span class="ms-text">' + renderProseHtml(row.name, formatUtils) + fileHtml + '</span>'
      + '<span class="ms-when">' + escapeHtml(label) + '</span>'
      + '</li>';
    const nameMd = formatUtils.renderProseMd ? formatUtils.renderProseMd(row.name) : row.name;
    const md = '- ' + mark + ' ' + label + ' · ' + nameMd
      + (row.planBasename ? ' (' + row.planBasename + ')' : '');
    return { html, md };
  }
  const lifeR = lifecycle.map(renderLifecycleItem);

  const mdParts = [];
  // 완료 패널 inner(완료 목록 + MAX_EXPANDED 더보기). HTML 은 탭 panel 로 들어간다.
  let completePanelHtml = '';
  if (merged.length > 0) {
    completePanelHtml = '<ul class="milestone-history" role="list">' + expR.map(r => r.html).join('') + '</ul>';
    if (collapsed.length > 0) {
      completePanelHtml += '<details class="more"><summary>'
        + '<svg class="i i-sm chev" aria-hidden="true"><use href="#ic-arrow"/></svg>+'
        + collapsed.length + ' 더보기</summary>'
        + '<ul class="milestone-history" role="list">' + colR.map(r => r.html).join('') + '</ul></details>';
    }
    let cmd = expR.map(r => r.md).join('\n');
    if (collapsed.length > 0) {
      cmd += '\n\n<details>\n<summary>+' + collapsed.length + ' 더보기</summary>\n\n'
        + colR.map(r => r.md).join('\n')
        + '\n\n</details>';
    }
    mdParts.push(cmd);
  }

  // 미진행(lifecycle) 패널 inner. md 는 기존 <details> 토글 유지(탭은 HTML CSS 전용).
  let lifecyclePanelHtml = '';
  if (lifecycle.length > 0) {
    lifecyclePanelHtml = '<ul class="milestone-history" role="list">' + lifeR.map(r => r.html).join('') + '</ul>';
    mdParts.push('<details>\n<summary>미진행 마일스톤 ' + lifecycle.length + '건 · 표시</summary>\n\n'
      + lifeR.map(r => r.md).join('\n')
      + '\n\n</details>');
  }

  // M6 Task 3 — '미진행 N건 · 표시' <details> 를 risks/questions 와 동일한 buildTabs
  // (완료 default · 미진행 N) 패턴으로 통일. lifecycle 0 이면 탭 없이 완료 직접 노출
  // (open-questions resolved 0 분기 미러). md 는 위에서 plain-text <details> 로 동등.
  let html;
  if (lifecycle.length > 0) {
    const completeChecked = merged.length > 0;
    html = buildTabs({
      name: 'tab-milestones',
      tabs: [
        {
          id: 'done', label: '완료', count: merged.length, checked: completeChecked,
          panelHtml: completePanelHtml || '<p class="panel-empty">완료된 마일스톤이 없습니다.</p>',
        },
        {
          id: 'lifecycle', label: '미진행', count: lifecycle.length, checked: !completeChecked,
          panelHtml: lifecyclePanelHtml,
        },
      ],
    }, formatUtils);
  } else {
    html = completePanelHtml;
  }

  const md = mdParts.join('\n\n');
  return { md, html, details: detailMap };
}

module.exports = { renderMilestoneHistory, pickShipReceipt, pickLedgerEntry, resolveGitCommitTime };
