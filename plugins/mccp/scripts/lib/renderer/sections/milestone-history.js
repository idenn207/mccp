'use strict';

const fs = require('fs');
const path = require('path');
const { parseDeliveryMilestonesComplete, resolvePrdRef } = require('../parsers/plan-body');

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

  // 각 plan의 source_prd를 dual-path(plan-dir / repo-root)로 해석해 실제로 읽히는
  // PRD를 채택 → 평문-경로 PRD discovery 복원 (Codex F1 absorption).
  const all = [];
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
    for (const row of completeRows) {
      const ship = pickShipReceipt(receipts, row.planBasename);
      let completedAt = ship && ship.created_at ? ship.created_at : null;
      if (!completedAt && row.planPath) {
        completedAt = resolveGitCommitTime(row.planPath, prdDir, cwd, gitCommitTime);
      }
      all.push({
        name: row.name,
        planBasename: row.planBasename,
        completedAt,
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

  if (merged.length === 0) return null;
  const expanded = merged.slice(0, MAX_EXPANDED);
  const collapsed = merged.slice(MAX_EXPANDED);
  const now = Date.now();

  function renderItem(e) {
    const rel = e.completedAt && typeof formatRelativeTime === 'function'
      ? formatRelativeTime(e.completedAt, now)
      : (e.completedAt || '날짜 미상');
    const fileHtml = e.planBasename
      ? '<span class="ms-file">' + escapeHtml(e.planBasename) + '</span>'
      : '';
    const whenHtml = e.completedAt
      ? '<span class="ms-when"><time datetime="' + escapeHtml(e.completedAt) + '">' + escapeHtml(rel) + '</time></span>'
      : '<span class="ms-when">' + escapeHtml(rel) + '</span>';
    const html = '<li class="milestone-item">'
      + '<span class="ms-check"><svg class="i" aria-hidden="true"><use href="#ic-check"/></svg>'
      + '<span class="sr-only">완료</span></span>'
      + '<span class="ms-text">' + renderProseHtml(e.name, formatUtils) + fileHtml + '</span>'
      + whenHtml
      + '</li>';
    const md = '- ' + (formatUtils.renderProseMd ? formatUtils.renderProseMd(e.name) : e.name) + ' · ' + rel
      + (e.planBasename ? ' (' + e.planBasename + ')' : '');
    return { html, md };
  }

  const expR = expanded.map(renderItem);
  const colR = collapsed.map(renderItem);

  let html = '<ul class="milestone-history" role="list">' + expR.map(r => r.html).join('') + '</ul>';
  if (collapsed.length > 0) {
    html += '<details class="more"><summary>'
      + '<svg class="i i-sm chev" aria-hidden="true"><use href="#ic-arrow"/></svg>+'
      + collapsed.length + ' 더보기</summary>'
      + '<ul class="milestone-history" role="list">' + colR.map(r => r.html).join('') + '</ul></details>';
  }
  let md = expR.map(r => r.md).join('\n');
  if (collapsed.length > 0) {
    md += '\n\n<details>\n<summary>+' + collapsed.length + ' 더보기</summary>\n\n'
      + colR.map(r => r.md).join('\n')
      + '\n\n</details>';
  }
  return { md, html };
}

module.exports = { renderMilestoneHistory, pickShipReceipt, resolveGitCommitTime };
