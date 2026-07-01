'use strict';

const path = require('path');
const { VERDICT } = require('./verdict-label');

// Dashboard Truthfulness M2 (Codex R1 F1 absorption) — next-action resolver.
// Pure function (no file reads): consumes the derive model's `state.item` plus a
// small ctx of plan metadata. Extracts a FULL command line (command + args) from
// the STATE.md `Next Step` blob — never a bare command token, because an
// arg-requiring command with no args is non-executable. A required-arg command
// found without args is NOT advertised as copyable (prose-only); an inference
// fallback then supplies a runnable command when possible (resume-state or the
// in-progress plan's resolved path). `source` is always reported for provenance.

// 인자 없이는 실행 불가한 명령 — args 없으면 copyText 로 advertise 금지(F1).
const REQUIRES_ARG = new Set([
  'mccp:prp-implement', 'mccp:plan', 'mccp:plan-prd', 'mccp:prp-commit', 'mccp:work',
]);

const PROSE_CAP = 80;

// 첫 `/mccp:`·`/codex:` 명령부터 안전 구분자(개행 / 백틱 / 괄호 / 쉼표 / 한글 음절
// / 가운뎃점 / 줄임표)까지를 command + args 로 캡처. 한글·문장부호 경계를 args 에서
// 제외해 "`/mccp:resume`(또는 …)" 나 "/mccp:resume 으로" 같은 prose 꼬리를 인자로
// 오인하지 않는다.
const CMD_RE = /\/((?:mccp|codex):[a-z0-9-]+)([^\n`)(,·…가-힣]*)/;

// 마커 강등 — action-prompt.js cleanArg 미러(백틱/볼드/링크/em-dash → plain, MD0xx
// 토큰 깨기, 공백 정규화). 복사 명령·prose 양쪽을 H10/H16 안전하게 만든다.
function cleanArg(s) {
  return String(s == null ? '' : s)
    .replace(/—/g, ',')
    .replace(/ -- /g, ', ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\bMD(0?\d{2,4})\b/g, 'MD-$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstLineProse(blob) {
  if (!blob) return '';
  const firstLine = blob.split(/\r?\n/).find((l) => l.trim()) || '';
  const cleaned = cleanArg(firstLine);
  if (cleaned.length <= PROSE_CAP) return cleaned;
  return cleaned.slice(0, PROSE_CAP - 1) + '…';
}

function extractCommand(blob) {
  if (!blob) return null;
  const m = String(blob).match(CMD_RE);
  if (!m) return null;
  return { command: m[1], args: cleanArg(m[2] || '') };
}

// M6 Task 5 + followup — "무엇을 하는지" 설명. STATE.md 원문 prose echo(truncated 노이즈)
// 대신 명령→용도 clean 매핑으로 일관된 한 줄을 보인다. in-progress-plan 은 plan intent
// (구체적)를 우선. Pure(파일 읽기 없음): planIntent 는 caller(status-grid) 주입.
const CMD_PURPOSE = {
  '/mccp:resume': 'STATE.md 핸드오프 신호로 이어가기',
  '/mccp:prp-commit': '자연어 파일 타겟팅 커밋',
  '/mccp:prp-implement': 'plan 실행 + 검증 루프',
  '/mccp:plan': '구현 plan + Codex review',
  '/mccp:plan-prd': '문제 정의 PRD 작성',
  '/mccp:pr': 'PR 생성 + 게이트 통과',
  '/mccp:prp-pr': 'PR 생성 + 게이트 통과',
  '/mccp:work': 'PRD→plan→PR 자동 체인',
  '/mccp:code-review': '변경 코드 multi-perspective review',
};
// Dashboard Truthfulness M8 — "무엇을 하는지"는 *명령의 용도*(concise)를 우선한다.
// M6 Task 4가 Hero subtext(plan intent)를 도입한 뒤로 desc 의 planIntent 는
// subtext 와 똑같은 문장을 capped/truncated 로 한 번 더 보여 잘림 노이즈가 됐다.
// 알려진 명령은 CMD_PURPOSE(짧고 안 잘림)를 desc 로, planIntent 는 미지의 명령
// fallback 으로만 둔다(subtext 가 이미 plan intent 를 full 로 노출).
function describeAction(command, source, ctx) {
  if (command && CMD_PURPOSE[command]) return CMD_PURPOSE[command];
  if ((source === 'in-progress-plan' || source === 'gate-frontier')
    && ctx && ctx.planIntent) return ctx.planIntent;
  if (source === 'in-progress-plan' || source === 'gate-frontier') return '진행 중 plan 구현 계속';
  return null;
}

// Dashboard Truthfulness M7 Task 3 (Codex Plan-R1 F1) — HOLLOW_COMMANDS are
// recovery/lookup meta-commands. STATE.md may carry one (a stale `Next Step`
// often holds `/mccp:resume`), but echoing it as the next action is hollow:
// resume is a noop without a genuine handoff signal, and trace/receipt-* only
// inspect. They are filtered from the STATE.md echo path; a real handoff is
// surfaced only via the dedicated handoff_spawn branch (F3).
const HOLLOW_COMMANDS = new Set([
  'mccp:resume', 'mccp:trace',
  'mccp:receipt-status', 'mccp:receipt-validate', 'mccp:receipt-write',
]);

// 게이트 순서 — converged-frontier(이 게이트 수렴·다음 대기) 노드의 next action 은
// 그 게이트가 아니라 다음 게이트다(impl 수렴 → 다음=PR, plan 수렴 → 다음=implement).
const STAGE_ORDER = ['plan', 'impl', 'pr'];

// frontier short → 실행 명령. 'pr'/'impl' 은 단일 명령으로 매핑되지만 'plan' frontier
// (plan 게이트 진행 중)는 깔끔한 단일 명령이 없어 prose 로 처리(null 반환).
function frontierCommand(short, planPath) {
  if (short === 'impl') {
    return { command: '/mccp:prp-implement', args: planPath, copyText: '/mccp:prp-implement ' + planPath };
  }
  if (short === 'pr') {
    return { command: '/mccp:pr', args: '', copyText: '/mccp:pr' };
  }
  return null;
}

// STATE.md substantive command freshness (Codex Plan-R1 F1). The demonstrated
// staleness failure is a command whose plan-path arg points at ANOTHER cycle's
// plan (this very worktree's STATE.md references the pipeline-chart cycle). So a
// command carrying a `.md` plan-path arg is fresh only when that basename is a
// CURRENT in-progress plan. Arg-less / non-plan-arg commands (create/action like
// /mccp:plan-prd, /mccp:work, /mccp:pr) are not bound to a stale plan artifact,
// and the frontier-primary reorder already protects the live in-progress case,
// so they pass through here (this step is only reached when no in-progress
// frontier exists).
function stateCommandFresh(extracted, plans, planStatuses) {
  const argFirst = (extracted.args || '').split(/\s+/)[0] || '';
  if (/\.md$/i.test(argFirst)) {
    const inProgressBasenames = new Set(
      plans.filter((p) => p && p.path
        && planStatuses.get(path.basename(p.path)) === 'in-progress')
        .map((p) => path.basename(p.path)));
    return inProgressBasenames.has(path.basename(argFirst));
  }
  return true;
}

// resolveNextAction(stateItem, ctx) → { command, args, prose, copyText, source, executable, stale, description }
//   ctx = { plans, planStatuses, planStaleness, planIntent, decisionState, hasHandoffSignal }
//   - command : '/mccp:…' display token (null when prose-only)
//   - copyText: executable command line (null when not executable)
//   - executable: true only when a runnable command line exists (F1)
//   - source : 'resume-state' | 'gate-frontier' | 'in-progress-plan'
//            | 'state-fresh' | 'in-progress-plan-stale' | 'prose' | 'idle'
//   - description: 짧은 "무엇을 하는지"(M6 Task 5, null when none)
//
// Priority (M7 Task 3, frontier-primary — Codex F1+F3): genuine handoff →
// live in-progress plan's gate frontier → freshness-gated STATE.md command →
// stale-plan note → prose/idle. The frontier outranks any STATE.md echo, so a
// stale-but-substantive STATE.md command can never mask the current next action.
function resolveNextAction(stateItem, ctx) {
  ctx = ctx || {};
  const plans = Array.isArray(ctx.plans) ? ctx.plans : [];
  const planStatuses = ctx.planStatuses instanceof Map ? ctx.planStatuses : new Map();
  const planStaleness = ctx.planStaleness instanceof Map ? ctx.planStaleness : new Map();
  const decisionState = ctx.decisionState instanceof Map ? ctx.decisionState : new Map();
  const hasHandoffSignal = !!ctx.hasHandoffSignal;

  const item = stateItem || {};
  const body = item.body || {};
  const blob = typeof body.nextStep === 'string' ? body.nextStep : '';
  const prose = firstLineProse(blob);

  // 1. Genuine handoff only (Codex F3) — STATE.md last_event === 'handoff_spawn',
  //    the same signal the resume dispatcher honors. resume_state==='in-flight'
  //    or resume_dispatching alone is NOT an actionable resume.
  if (hasHandoffSignal) {
    return {
      command: '/mccp:resume', args: '', prose, copyText: '/mccp:resume',
      source: 'resume-state', executable: true, stale: false,
      description: describeAction('/mccp:resume', 'resume-state', ctx),
    };
  }

  // 2. Gate-frontier derive (PRIMARY, Codex F1) — the live in-progress plan's
  //    decision-state frontier is the truthful next action, evaluated BEFORE any
  //    STATE.md echo.
  const inProgress = plans.filter((p) => p && p.path
    && planStatuses.get(path.basename(p.path)) === 'in-progress');
  for (const plan of inProgress) {
    const base = path.basename(plan.path);
    if (planStaleness.get(base) === 'stale') continue; // stale handled at step 4
    const decisionId = base.replace(/\.plan\.md$/, '').replace(/\.md$/, '');
    const d = decisionState.get(decisionId);
    if (d) {
      if (d.state === 'done') continue; // ledger-promoted/shipped → not next work
      if (d.state === 'blocked') {
        return {
          command: null, args: '', prose: prose || 'Codex ' + VERDICT.HOLD + ' · 개입 필요',
          copyText: null, source: 'gate-frontier', executable: false, stale: false,
          description: 'Codex 검토 ' + VERDICT.HOLD + ' — 사람 개입 필요',
        };
      }
      // converged-frontier(이 게이트 수렴, 다음 게이트 대기) → next action 은 다음
      // 게이트다. impl 수렴이면 re-implement 가 아니라 PR 이 truthful next.
      const frontierNode = (d.nodes || []).find((n) => n.short === d.activeStage);
      let targetShort = d.activeStage;
      if (frontierNode && frontierNode.status === 'converged-frontier') {
        const idx = STAGE_ORDER.indexOf(d.activeStage);
        if (idx >= 0 && idx < STAGE_ORDER.length - 1) targetShort = STAGE_ORDER[idx + 1];
      }
      const fc = frontierCommand(targetShort, plan.path);
      if (fc) {
        return {
          command: fc.command, args: fc.args, prose, copyText: fc.copyText,
          source: 'gate-frontier', executable: true, stale: false,
          description: describeAction(fc.command, 'gate-frontier', ctx),
        };
      }
      // 'plan' frontier — plan 게이트 진행 중, 단일 실행 명령 없음 → prose.
      return {
        command: null, args: '', prose: prose || 'plan 게이트 진행 중',
        copyText: null, source: 'gate-frontier', executable: false, stale: false,
        description: ctx.planIntent || 'plan 게이트 진행 중',
      };
    }
    // No decision-state for this plan (no receipts yet) → implement it.
    return {
      command: '/mccp:prp-implement', args: plan.path, prose,
      copyText: '/mccp:prp-implement ' + plan.path,
      source: 'in-progress-plan', executable: true, stale: false,
      description: describeAction('/mccp:prp-implement', 'in-progress-plan', ctx),
    };
  }

  // 3. STATE.md substantive command — freshness-gated fallback (Codex F1). Only
  //    reached when no actionable in-progress frontier exists. Hollow commands
  //    are dropped; a substantive command must be fresh or it is ignored.
  const extracted = extractCommand(blob);
  if (extracted && !HOLLOW_COMMANDS.has(extracted.command)) {
    const needsArg = REQUIRES_ARG.has(extracted.command);
    if ((!needsArg || extracted.args)
      && stateCommandFresh(extracted, plans, planStatuses)) {
      const copyText = '/' + extracted.command + (extracted.args ? ' ' + extracted.args : '');
      return {
        command: '/' + extracted.command, args: extracted.args || '',
        prose, copyText, source: 'state-fresh', executable: true, stale: false,
        description: describeAction('/' + extracted.command, 'state-fresh', ctx),
      };
    }
  }

  // 4. Stale in-progress plan (no fresh frontier, no fresh STATE.md command).
  const staleInProgress = inProgress.find(
    (p) => planStaleness.get(path.basename(p.path)) === 'stale');
  if (staleInProgress) {
    return {
      command: null, args: '', prose: prose || '미정 (stale)', copyText: null,
      source: 'in-progress-plan-stale', executable: false, stale: true, description: null,
    };
  }

  // 5. prose-only or idle.
  if (prose) {
    return {
      command: null, args: '', prose, copyText: null,
      source: 'prose', executable: false, stale: false, description: null,
    };
  }
  return {
    command: null, args: '', prose: '대기', copyText: null,
    source: 'idle', executable: false, stale: false, description: null,
  };
}

module.exports = { resolveNextAction, REQUIRES_ARG, cleanArg, HOLLOW_COMMANDS };
