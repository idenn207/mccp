'use strict';

// dashboard-multi-session M2 — 멀티세션 진행 섹션.
// Pure function of derive `model.sources.worktrees` (M1 cross-worktree progress
// model). worktree당 1행(진행 요약 + 차단 강조 + self 마커) + 우측 드로어 detail.
// 기존 active-sessions.js(세션 존재 축)와 무손상 병치 — 본 섹션은 진행 축.
//
// graceful hide(분리 규칙, Codex Plan-F1 + Impl-F1):
//   - scanned !== true               → null            (scan off 경로 조용)
//   - count===0 && degraded && error → degraded notice (broken-scan 진단 보존)
//   - count===1 && healthy(item)     → null            (정상 단일 worktree = self)
//   - count===1 && !healthy          → 1행 테이블       (단일 degraded/blocked self loud)
//   - count>=2                       → 멀티세션 테이블
//   render := (count>=2) OR (count===1 && !healthy);  notice := (count===0 && degraded && error)
//
// 상태 색: 기존 .s-* cascade 재사용(신규 색 클래스 0). 색은 **상태 셀 span 에만**
// (worker-fanout 계약 — 행 전체 색칠 금지, 색 단독 의미 금지). 색+아이콘+텍스트
// 3중 = a11y non-color severity. per-worktree scrubbed item.error 노출(Impl-F2).

const {
  detailId,
  addDetail,
  buildWorktreeDetail,
  renderDetailMd,
} = require('../parsers/drawer-detail');

function basename(p) {
  if (!p || typeof p !== 'string') return p || '?';
  const b = p.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  return b || p;
}

function truncate(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// 진행 셀 요약 — inline 마커(**/`/__/링크)를 strip 한 plain 텍스트로. 셀은 48자
// truncate 가 전제라 renderProseHtml(paired 마커만 태그화)을 쓰면 truncate 가 페어를
// 분리한 순간 짝 잃은 ** 가 raw 로 누출됨(H16 absolute-ban). 셀은 plain 요약이고
// bold/code 서식은 드로어 detail(full prose, 비-truncate)에서 보존. snake_case 보호
// 위해 leftover 제거는 * 와 백틱만(unpaired _ 는 보존).
function plainSummary(s, normalizeProse) {
  let t = (typeof normalizeProse === 'function') ? normalizeProse(String(s)) : String(s);
  t = t
    .replace(/``([^\n]+?)``/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*`]/g, '');
  return t;
}

// 우선순위: blocked > degraded > active > idle. (차단이 degraded 보다 actionable.)
function worktreeStatusKind(item) {
  if (!item) return 'idle';
  if (item.blocked) return 'blocked';
  if (item.degraded || item.error) return 'degraded';
  if (item.active) return 'active';
  return 'idle';
}

// kind → { 기존 .s-* 색 클래스, 아이콘, 한국어, 드로어 tone }. 신규 색 0.
const KIND_META = {
  blocked: { cls: 's-blocked', icon: '🚫', label: '차단됨', tone: 'high' },
  degraded: { cls: 's-stale', icon: '⚠', label: '오류', tone: 'med' },
  active: { cls: 's-in-progress', icon: '◐', label: '진행 중', tone: 'low' },
  idle: { cls: 'muted', icon: '·', label: '대기', tone: 'low' },
};

function kindMeta(kind) { return KIND_META[kind] || KIND_META.idle; }

function isHealthy(item) {
  return !!item && !item.degraded && !item.blocked && !item.error;
}

function branchLabel(it) {
  return it.branch || (it.detached ? '(detached)' : '(no branch)');
}

// 진행 셀 (md) — milestone_hint(plain 요약, truncate 48) + 게이트 보조 + (차단/오류
// 시) loud 마커. 셀은 plainSummary 로 마커 strip(truncate 가 페어를 잘라도 깨진 마커
// 0); full 서식은 드로어 detail md(renderDetailMd 진행 섹션)가 보존.
function progressMd(it, normalizeProse) {
  const norm = (s) => (typeof normalizeProse === 'function' ? normalizeProse(String(s)) : String(s));
  const parts = [];
  if (it.milestone_hint) parts.push(truncate(plainSummary(it.milestone_hint, normalizeProse), 48));
  if (it.current_gate) {
    const conv = it.gate_converged === false ? ' ⚠' : '';
    parts.push(String(it.current_gate).replace(/^mccp-/, '') + conv);
  }
  if (it.blocked && it.blocked_reason) {
    parts.push('🚫 ' + norm(it.blocked_reason));
  } else if (it.error || it.degraded) {
    const e = it.error || it.blocked_reason;
    if (e) parts.push('⚠ ' + norm(e));
  }
  return parts.length ? parts.join(' · ') : '—';
}

// 진행 셀 (html) — milestone_hint 는 plainSummary(마커 strip) 후 truncate(48) +
// escapeHtml. renderProseHtml 을 안 쓰는 이유: paired 마커만 태그화하므로 truncate 가
// 페어를 분리하면 짝 잃은 ** 가 raw 로 누출(H16 absolute-ban). bold/code 서식은
// 드로어 detail(full prose)에서 보존. 게이트/차단/오류 는 escapeHtml 평문. 반환값은
// 이미 안전 HTML(caller 재-escape 금지).
function progressHtmlCell(it, formatUtils) {
  const { escapeHtml, normalizeProse } = formatUtils;
  const norm = (s) => (typeof normalizeProse === 'function' ? normalizeProse(String(s)) : String(s));
  const parts = [];
  if (it.milestone_hint) {
    parts.push(escapeHtml(truncate(plainSummary(it.milestone_hint, normalizeProse), 48)));
  }
  if (it.current_gate) {
    const conv = it.gate_converged === false ? ' ⚠' : '';
    parts.push(escapeHtml(String(it.current_gate).replace(/^mccp-/, '') + conv));
  }
  if (it.blocked && it.blocked_reason) {
    parts.push('🚫 ' + escapeHtml(norm(it.blocked_reason)));
  } else if (it.error || it.degraded) {
    const e = it.error || it.blocked_reason;
    if (e) parts.push('⚠ ' + escapeHtml(norm(e)));
  }
  return parts.length ? parts.join(' · ') : '—';
}

function renderMultiSession(model, formatUtils, options) {
  const { escapeHtml, formatRelativeTime, normalizeProse } = formatUtils;
  const m = model || {};
  const sources = m.sources || {};
  const wt = sources.worktrees;

  // scan off / 소스 부재 → 조용.
  if (!wt || wt.scanned !== true) return null;

  const items = Array.isArray(wt.items) ? wt.items : [];
  const count = items.length;

  // 0-item degraded scan → 작은 진단 notice (Codex Plan-F1, loud-fail-open).
  // verdict 의 generic collapse 가 actionable error 텍스트를 잃으므로 섹션이 직접 보존.
  if (count === 0) {
    if (wt.degraded && wt.error) {
      const errTxt = 'worktree 스캔 실패: ' + normalizeProse(String(wt.error));
      return {
        md: '> ⚠ ' + errTxt,
        html: '<aside class="s-stale">⚠ ' + escapeHtml(errTxt) + '</aside>',
      };
    }
    return null;
  }

  // 단일 worktree: healthy 면 조용(공통 경로), unhealthy 면 1행 테이블 loud (Impl-F1).
  if (count === 1 && isHealthy(items[0])) return null;

  const now = (options && Number.isFinite(options.now)) ? options.now : Date.now();
  const detailMap = new Map();
  const mdRows = ['| worktree | 브랜치 | 진행 | 상태 | 활동 |', '|---|---|---|---|---|'];
  const mdDetailBlocks = [];
  const htmlRows = [];

  items.forEach((item, index) => {
    if (!item) return;
    const it = item;
    const isSelf = it.is_self === true;
    // self worktree 의 path 는 cwd-relative '.' 라 basename 이 '.' — dangling dot 방지.
    // self 면 "이 worktree" 마커가 식별을 대신하므로 name 생략(빈), non-self 면 branch
    // 로 fallback(그래도 없으면 '(worktree)').
    const rawName = basename(it.path);
    const name = (rawName && rawName !== '.')
      ? rawName
      : (isSelf ? '' : (it.branch || '(worktree)'));
    const kind = worktreeStatusKind(it);
    const meta = kindMeta(kind);
    const branch = branchLabel(it);
    const progress = progressMd(it, normalizeProse);
    const progressH = progressHtmlCell(it, formatUtils);
    const activity = it.last_activity ? formatRelativeTime(it.last_activity, now) : '활동 없음';

    // 드로어 detail (Impl-F3 ordinal-keyed). activity 를 opts 로 넘겨 테이블 셀 과
    // 동일 문자열 보장(정보 동등). status 라벨/tone 도 섹션 계산값 전달(SSoT).
    const detail = buildWorktreeDetail(it, formatUtils, {
      statusLabel: meta.label,
      statusTone: meta.tone,
      activity,
    });
    const rawId = detailId('wt', { ordinal: index, path: it.path });
    const { id } = addDetail(detailMap, rawId, detail);

    // ── md 행 (self → **이 worktree** prepend, 비-색 a11y-safe 마커) ──
    // name 이 빈 값(self+'.')이면 마커만(trailing space 0).
    const selfMarkMd = '**이 worktree**';
    const wtCellMd = isSelf ? (name ? selfMarkMd + ' ' + name : selfMarkMd) : name;
    mdRows.push('| ' + wtCellMd + ' | ' + branch + ' | ' + progress
      + ' | ' + meta.icon + ' ' + meta.label + ' | ' + activity + ' |');
    // 테이블 뒤 per-worktree 인라인 detail — 드로어 SSoT 의 테이블-누락 행(경로/HEAD/
    // 게이트/receipts/차단·오류)을 plain-text 동등으로 노출. 브랜치/마지막 활동은
    // 테이블 셀에 verbatim 이라 omit(중복 회피, 값은 여전히 md 에 존재).
    const detailMd = renderDetailMd(detail, formatUtils, {
      omit: new Set(['브랜치', '마지막 활동']),
    });
    if (detailMd) {
      mdDetailBlocks.push('- ' + wtCellMd + '\n' + detailMd);
    }

    // ── html 행 (색은 상태 셀 span 에만; tr 은 self 만). 행 클릭 → 드로어:
    // data-detail-id 는 worktree 셀(<td>)에 부여(milestone-history li 미러). ──
    const trOpen = isSelf ? '<tr class="self">' : '<tr>';
    const selfMarkHtml = '<strong>이 worktree</strong>';
    const wtCellInner = isSelf
      ? (name ? selfMarkHtml + ' ' + escapeHtml(name) : selfMarkHtml)
      : escapeHtml(name);
    htmlRows.push(
      trOpen
      + '<td data-detail-id="' + escapeHtml(id) + '">' + wtCellInner + '</td>'
      + '<td>' + escapeHtml(branch) + '</td>'
      + '<td>' + progressH + '</td>'
      + '<td><span class="' + meta.cls + '">'
      + escapeHtml(meta.icon + ' ' + meta.label) + '</span></td>'
      + '<td>' + escapeHtml(activity) + '</td>'
      + '</tr>'
    );
  });

  if (htmlRows.length === 0) return null;

  let md = mdRows.join('\n');
  if (mdDetailBlocks.length) md += '\n\n' + mdDetailBlocks.join('\n');

  const html =
    '<table class="multi-session"><thead><tr>'
    + '<th>worktree</th><th>브랜치</th><th>진행</th><th>상태</th><th>활동</th>'
    + '</tr></thead><tbody>' + htmlRows.join('') + '</tbody></table>';

  const result = { md, html, details: detailMap };

  // truncated foot — no silent cap. cap/total 은 source warning 문자열에 보존됨.
  if (wt.truncated) {
    const note = wt.warning || ('worktree scan truncated (cap=' + count + ')');
    result.foot = '<span class="muted">' + escapeHtml(note) + '</span>';
    result.md += '\n\n> ⚠ ' + note;
  }

  return result;
}

module.exports = { renderMultiSession, worktreeStatusKind, kindMeta };
