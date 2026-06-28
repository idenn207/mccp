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
const { prdSlug, groupByPrd } = require('../parsers/prd-group');

function basename(p) {
  if (!p || typeof p !== 'string') return p || '?';
  const b = p.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  return b || p;
}

// dashboard-interactivity M2 — 개요 마일스톤 드로어의 위험/질문 필터 키 해소.
// worktree progress 에 PRD/plan 참조 키가 없으므로(milestone_hint = STATE.md goal
// 자유 텍스트), goal 전문에서 `.claude/prds/<name>.prd.md` 경로를 추출해 prdKey 를
// 파생한다. derivePrdKey(plan-body.js)와 동일 규칙: prdSlug(relPath - .prd.md) →
// 위험/질문 li-item 의 data-prd 와 정확히 동일 키(오귀속 0). 경로 부재 시 null.
function prdKeyFromHint(hint) {
  if (!hint) return null;
  const m = /\.claude\/prds\/[A-Za-z0-9._-]+\.prd\.md/i.exec(String(hint));
  if (!m) return null;
  return prdSlug(m[0].replace(/\.prd\.md$/i, '').replace(/\.md$/i, ''));
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

// kind → { 기존 .s-* 색 클래스, 아이콘, 한국어, 드로어 tone, 진행순 rank }. 신규 색 0.
// rank 는 M3 진행순 정렬(data-progress-rank)의 유일 키 — worktreeStatusKind 우선순위
// (blocked>degraded>active>idle)와 1:1 SSoT(색/아이콘/라벨/tone/rank 한곳).
const KIND_META = {
  blocked: { cls: 's-blocked', icon: '🚫', label: '차단됨', tone: 'high', rank: 3 },
  degraded: { cls: 's-stale', icon: '⚠', label: '오류', tone: 'med', rank: 2 },
  active: { cls: 's-in-progress', icon: '◐', label: '진행 중', tone: 'low', rank: 1 },
  idle: { cls: 'muted', icon: '·', label: '대기', tone: 'low', rank: 0 },
};

function kindMeta(kind) { return KIND_META[kind] || KIND_META.idle; }

// 개요(route-overview) "진행 중 마일스톤" 패널 worktree 표시 상한 — Output Constraint 4
// "top 3 expanded" anchor. 초과분은 활동·기록 route 멀티세션 표로 loud-on-demand.
const OVERVIEW_CAP = 3;

function isHealthy(item) {
  return !!item && !item.degraded && !item.blocked && !item.error;
}

function branchLabel(it) {
  return it.branch || (it.detached ? '(detached)' : '(no branch)');
}

// 안정 worktree 키 — M3 worktree 필터의 value ↔ <tr data-worktree> 동일 함수 산출.
// branch 우선(없으면 path basename), HTML attribute·필터 키 안전 문자로 정규화
// (`_` 결합 — H16 carve-out 이 data-worktree 를 strip 하므로 paired-underscore
//  false-positive 차단). 빈/누락은 'worktree'.
function worktreeKey(it) {
  const raw = (it && (it.branch || basename(it.path))) || 'worktree';
  return String(raw).replace(/[^A-Za-z0-9._-]+/g, '_') || 'worktree';
}

// last_activity(ISO) → epoch ms (정렬 비교용). null/파싱불가 → null(말단 처리).
function activityValue(it) {
  const la = it && it.last_activity;
  if (la == null) return null;
  const t = (typeof la === 'number') ? la : Date.parse(la);
  return Number.isNaN(t) ? null : t;
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

function renderMultiSession(model, formatUtils, options, planBody) {
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

  // 단일 healthy worktree 의 graceful-hide 판정(Impl-F1)은 per-item detail+projection
  // 1-pass 계산 뒤로 이동(F2) — healthy-single 도 eligible 진행중 마일스톤이 있으면
  // 개요 패널용 overview projection 은 방출해야 하므로(표 패널만 hidden), early-return
  // 을 표 조립 직전으로 미룬다.
  const now = (options && Number.isFinite(options.now)) ? options.now : Date.now();
  const detailMap = new Map();
  const mdRows = ['| worktree | 브랜치 | 진행 | 상태 | 활동 |', '|---|---|---|---|---|'];
  const mdDetailBlocks = [];
  const htmlRows = [];
  // 개요 in-progress 후보 누적(F1 eligibility 통과 행만). 표 loop 와 동일 pass 에서
  // 파생 — 재스캔/재계산 0.
  const overviewCandidates = [];

  // M3 진행순 정렬 tie-break — last_activity desc 1회 스캔해 recency index 부여
  // (0=최신). 활동 시각 없는 행은 dated 다음(말단, 동일 index → DOM 순서 안정 tie-break).
  const dated = items.filter((it) => activityValue(it) != null);
  dated.sort((a, b) => activityValue(b) - activityValue(a));
  const activityRank = new Map();
  dated.forEach((it, i) => activityRank.set(it, i));
  const undatedOrd = dated.length;

  // M3 필터 옵션 — present 한 kind/worktree 만, 결정적 순서(statuses: rank desc,
  // worktrees: 등장순). 중복은 key 로 제거. html.js buildSessionBar 가 소비.
  const statusOptions = [];
  const seenStatus = new Set();
  const worktreeOptions = [];
  const seenWorktree = new Set();

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

    // ── M3 진행순/필터 축. data-status(kind)·data-worktree(안정 키)·
    // data-progress-rank(KIND_META.rank SSoT)·data-activity-ord(recency index). ──
    const wtKey = worktreeKey(it);
    const progressRank = meta.rank;
    const activityOrd = activityRank.has(it) ? activityRank.get(it) : undatedOrd;
    if (!seenStatus.has(kind)) {
      seenStatus.add(kind);
      statusOptions.push({ key: kind, label: meta.label, rank: meta.rank });
    }
    if (!seenWorktree.has(wtKey)) {
      seenWorktree.add(wtKey);
      // 라벨 — self 는 "이 worktree", 아니면 branch/name. 필터 select 가시 텍스트.
      const wtLabel = isSelf ? '이 worktree' : (it.branch || name || '(worktree)');
      worktreeOptions.push({ key: wtKey, label: wtLabel });
    }

    // ── html 행 (색은 상태 셀 span 에만; tr 은 self 만). 행 클릭 → 드로어:
    // data-detail-id 는 worktree 셀(<td>)에 부여(milestone-history li 미러). ──
    const trData = ' data-status="' + escapeHtml(kind) + '"'
      + ' data-worktree="' + escapeHtml(wtKey) + '"'
      + ' data-progress-rank="' + progressRank + '"'
      + ' data-activity-ord="' + activityOrd + '"';
    const trOpen = isSelf ? '<tr class="self"' + trData + '>' : '<tr' + trData + '>';
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

    // ── 개요 in-progress 후보 (F1 lifecycle-fresh 3중 gate) ──
    //   (i)   it.active === true            — worktrees source freshness(14일) gate.
    //         stale STATE.md/오래된 goal 을 "진행중"에서 제외.
    //   (ii)  milestone_hint OR current_gate — 마일스톤 신호 부재 행(순수 idle/error)
    //         은 진행중 패널 비대상.
    //   (iii) NOT (current_gate==='mccp-pr-codex' && gate_converged===true) — 직전
    //         ship 게이트 수렴 = 마일스톤 *완료*(진행중 아님). just-shipped 제외.
    const justShipped = it.current_gate === 'mccp-pr-codex' && it.gate_converged === true;
    if (it.active === true && (it.milestone_hint || it.current_gate) && !justShipped) {
      const gateLabel = it.current_gate
        ? String(it.current_gate).replace(/^mccp-/, '') + (it.gate_converged === false ? ' ⚠' : '')
        : '';
      overviewCandidates.push({
        label: it.branch || name || '(worktree)',
        isSelf,
        kind,
        icon: meta.icon,
        statusLabel: meta.label,
        milestoneHint: it.milestone_hint
          ? truncate(plainSummary(it.milestone_hint, normalizeProse), 72)
          : '',
        gate: gateLabel,
        activity,
        rank: meta.rank,
        activityOrd,
        detailId: id,
        // dashboard-interactivity M2 — ms: 드로어 빌드용(아래 shown 루프에서 소비).
        rawItem: it,
        wtIndex: index,
        statusTone: meta.tone,
        prdKey: prdKeyFromHint(it.milestone_hint),
      });
    }
  });

  // 개요 projection — 후보를 rank desc(blocked>degraded>active; 포함 행 모두 active
  // 이므로 fresh 간 actionability 우선순위) → activityOrd asc(최신 먼저) 정렬,
  // OVERVIEW_CAP slice. total/shown 보존(silent cap 금지). 후보 0 → undefined.
  let overview;
  let msDetailMap = null;
  if (overviewCandidates.length) {
    const sorted = overviewCandidates
      .slice()
      .sort((a, b) => (b.rank - a.rank) || (a.activityOrd - b.activityOrd));
    const shown = sorted.slice(0, OVERVIEW_CAP);
    overview = { items: shown, total: sorted.length, shown: shown.length };

    // dashboard-interactivity M2 — 개요 마일스톤 드로어(ms:ov 네임스페이스). 표 행
    // (wt:)과 별도 키라 H18 중복-id 회피. nav(위험/질문 필터 이동)는 해당 prdKey 가
    // 실제 위험/질문에 존재할 때만 부여(groupByPrd 검증 — 죽은/오귀속 버튼 0).
    const planPrd = (planBody && planBody.planPrd instanceof Map) ? planBody.planPrd : null;
    const risksKeys = new Set(groupByPrd((planBody && planBody.risks) || [], planPrd).map((g) => g.prdKey));
    const qKeys = new Set(groupByPrd((planBody && planBody.openQuestions) || [], planPrd).map((g) => g.prdKey));
    msDetailMap = new Map();
    shown.forEach((cand) => {
      const msDetail = buildWorktreeDetail(cand.rawItem, formatUtils, {
        statusLabel: cand.statusLabel,
        statusTone: cand.statusTone,
        activity: cand.activity,
      });
      // 드로어 제목 = 클릭한 행 라벨(식별 일치). 평문 → escapeHtml(innerHTML sink).
      msDetail.title = escapeHtml(cand.isSelf ? '이 worktree' : cand.label);
      const nav = [];
      if (cand.prdKey) {
        if (risksKeys.has(cand.prdKey)) nav.push({ label: '위험 보기', route: 'risks', prd: cand.prdKey });
        if (qKeys.has(cand.prdKey)) nav.push({ label: '질문 보기', route: 'questions', prd: cand.prdKey });
      }
      if (nav.length) msDetail.nav = nav;
      const { id: msId } = addDetail(msDetailMap, 'ms:ov' + cand.wtIndex, msDetail);
      cand.detailId = msId; // overview trigger 를 ms: 키로 교체(H18 trigger==key 보존)
    });
  }

  // 단일 healthy worktree(Impl-F1): 표 md/html 미생성(표 패널 hidden). eligible overview
  // 있으면 {overview, details}(개요 패널만 독립 노출 — F2), 없으면 null(완전 부재).
  // 표가 없으므로 wt: detail 은 trigger 가 없어 details 는 ms:ov 키만(H18 고아 0).
  if (count === 1 && isHealthy(items[0])) {
    return overview ? { overview, details: msDetailMap } : null;
  }

  if (htmlRows.length === 0) return null;

  let md = mdRows.join('\n');
  if (mdDetailBlocks.length) md += '\n\n' + mdDetailBlocks.join('\n');

  const html =
    '<table class="multi-session"><thead><tr>'
    + '<th>worktree</th><th>브랜치</th><th>진행</th><th>상태</th><th>활동</th>'
    + '</tr></thead><tbody>' + htmlRows.join('') + '</tbody></table>';

  // M3 필터 옵션 — statuses 는 rank desc(blocked 먼저), worktrees 는 등장순.
  // {key,label} 만 노출(rank 는 정렬 후 drop — 컨트롤 빌더는 key/label 만 소비).
  const filterOptions = {
    statuses: statusOptions
      .slice()
      .sort((a, b) => b.rank - a.rank)
      .map((s) => ({ key: s.key, label: s.label })),
    worktrees: worktreeOptions.map((w) => ({ key: w.key, label: w.label })),
  };

  // 표(wt:) + 개요(ms:ov) detail 병합 — 서로 다른 네임스페이스라 충돌 0.
  // 표 행이 wt: trigger, 개요 항목이 ms:ov trigger → trigger 합 == 키 합(H18).
  if (msDetailMap) { for (const [k, v] of msDetailMap) detailMap.set(k, v); }

  const result = { md, html, details: detailMap, filterOptions };
  // 개요 패널은 표(이 result.html)와 독립 소비 — count>=2/unhealthy 케이스도 eligible
  // overview 가 있으면 부착(표/filterOptions/foot 불변, 순수 additive).
  if (overview) result.overview = overview;

  // truncated foot — no silent cap. cap/total 은 source warning 문자열에 보존됨.
  if (wt.truncated) {
    const note = wt.warning || ('worktree scan truncated (cap=' + count + ')');
    result.foot = '<span class="muted">' + escapeHtml(note) + '</span>';
    result.md += '\n\n> ⚠ ' + note;
  }

  return result;
}

module.exports = { renderMultiSession, worktreeStatusKind, kindMeta };
