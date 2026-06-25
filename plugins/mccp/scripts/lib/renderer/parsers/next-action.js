'use strict';

const path = require('path');

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
function describeAction(command, source, ctx) {
  if (source === 'in-progress-plan' && ctx && ctx.planIntent) return ctx.planIntent;
  if (command && CMD_PURPOSE[command]) return CMD_PURPOSE[command];
  if (source === 'in-progress-plan') return '진행 중 plan 구현 계속';
  return null;
}

// resolveNextAction(stateItem, ctx) → { command, args, prose, copyText, source, executable, stale, description }
//   ctx = { plans, planStatuses, planStaleness, planIntent }
//   - command : '/mccp:…' display token (null when prose-only)
//   - copyText: executable command line (null when not executable)
//   - executable: true only when a runnable command line exists (F1)
//   - source : 'state-command' | 'resume-state' | 'in-progress-plan'
//            | 'in-progress-plan-stale' | 'prose' | 'idle'
//   - description: 짧은 "무엇을 하는지"(M6 Task 5, null when none)
function resolveNextAction(stateItem, ctx) {
  ctx = ctx || {};
  const plans = Array.isArray(ctx.plans) ? ctx.plans : [];
  const planStatuses = ctx.planStatuses instanceof Map ? ctx.planStatuses : new Map();
  const planStaleness = ctx.planStaleness instanceof Map ? ctx.planStaleness : new Map();

  const item = stateItem || {};
  const body = item.body || {};
  const blob = typeof body.nextStep === 'string' ? body.nextStep : '';
  const prose = firstLineProse(blob);

  // 1. Direct full-command extraction from the blob.
  const extracted = extractCommand(blob);
  if (extracted) {
    const needsArg = REQUIRES_ARG.has(extracted.command);
    if (!needsArg || extracted.args) {
      const copyText = '/' + extracted.command + (extracted.args ? ' ' + extracted.args : '');
      return {
        command: '/' + extracted.command,
        args: extracted.args || '',
        prose, copyText, source: 'state-command', executable: true, stale: false,
        description: describeAction('/' + extracted.command, 'state-command', ctx),
      };
    }
    // requires-arg but none → fall through to inference (may supply a path).
  }

  // 2. Inference fallback.
  if (item.resume_state === 'in-flight') {
    return {
      command: '/mccp:resume', args: '', prose, copyText: '/mccp:resume',
      source: 'resume-state', executable: true, stale: false,
      description: describeAction('/mccp:resume', 'resume-state', ctx),
    };
  }
  const firstInProgress = plans.find((p) => p && p.path
    && planStatuses.get(path.basename(p.path)) === 'in-progress');
  if (firstInProgress) {
    const base = path.basename(firstInProgress.path);
    if (planStaleness.get(base) === 'stale') {
      return {
        command: null, args: '', prose: prose || '미정 (stale)', copyText: null,
        source: 'in-progress-plan-stale', executable: false, stale: true, description: null,
      };
    }
    // F1 — bare 명령 금지: in-progress plan 의 resolved 경로를 인자로 포함.
    const planArg = firstInProgress.path;
    return {
      command: '/mccp:prp-implement', args: planArg, prose,
      copyText: '/mccp:prp-implement ' + planArg,
      source: 'in-progress-plan', executable: true, stale: false,
      description: describeAction('/mccp:prp-implement', 'in-progress-plan', ctx),
    };
  }

  // 3. prose-only or idle.
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

module.exports = { resolveNextAction, REQUIRES_ARG, cleanArg };
