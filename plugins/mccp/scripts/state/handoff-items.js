'use strict';

// M2 인계 항목 계측 — 세션 종료 시 미완 작업 열거 및 복원.
//
// A4 지표 분모: 이전 세션에서 남긴 미완 항목 수
// A4 지표 분자: 현재 세션에서 복원된 항목 수
//
// 미완 항목 소스:
//   - STATE.md 진행 항목 (task_type ∈ {unstarted, in_progress, pending_review})
//   - fix-task.md (존재 = 미해소 작업)
//   - 미완료 plan (status ≠ 'complete' ∧ ≠ 'dropped')

const fs = require('fs');
const path = require('path');

// multi-session-work-loop M5 (Task 8) — CL-5 4번째 재발의 경로 해석 단일 지점.
//
// **이 모듈은 state-journal을 import하지 않는다** (Task 7 축 4가 기계 검증).
// M5에서 handoff-items는 저널과 통합하지 않고 독립 sidecar로 남으며, 이번
// milestone이 고치는 것은 오직 경로 해석뿐이다 — A4 분자는 handoff-items가
// 아니라 저널 쪽에서 파생한다(a4-boundary-restore.js).
//
// 왜 `ctx.projectRoot`를 그대로 쓰면 안 되는가: `observer-sessions.js:99`가
// global 컨텍스트에서 `projectRoot: ''`를 반환하고, 그러면
// `path.join('', '.claude', 'state')`가 `.claude/state`로 접혀 **고치려던
// cwd-상대 경로가 그대로 남는다**. M3·M4의 CL-5 수정이 같은 값을 쓰므로 이 구멍은
// 그 둘에도 잠재한다.
//
// skip이 조용하면 CL-5 우회와 구별되지 않으므로(마커 부재 = 미배포인지 해소
// 실패인지 알 수 없다) **셀 수 있게** 만든다: 마커 + msw-event 2채널. 두 채널은
// 서로의 백업이며, SHIP-2는 여기에 `session_end` 이벤트를 더해 3-state로 판정한다.
const HANDOFF_ROOT_UNRESOLVED_MARKER = '.handoff-root-unresolved';

function resolveHandoffRoot(ctx) {
  ctx = ctx || {};
  const declared = typeof ctx.projectRoot === 'string' ? ctx.projectRoot.trim() : '';
  if (declared) return { ok: true, root: declared, source: 'project-context' };

  // msw-events의 walk-up을 재사용한다 — spawn 0이고 이미 존재하는 부품이다.
  // 새 해석 로직을 만들면 writer마다 답이 갈라진다(CL-5의 원인 형태 그 자체).
  let discovered = null;
  try {
    discovered = require('./msw-events').discoverRepoRoot(ctx.cwd);
  } catch (_e) {
    discovered = null;
  }
  if (discovered) return { ok: true, root: discovered, source: 'walk-up' };

  // 여기까지 왔다는 것은 40단계 walk-up으로도 `.claude/`를 못 찾았다는 뜻이고,
  // 그것은 **repo 밖에서 hook이 돌았다**는 의미다 — 쓸 대상 자체가 없으므로
  // skip이 올바른 동작이다. 마커는 "구현 결함"과 "해당 없음"을 사람이 판별할
  // 재료를 남기는 것이지 그 자체가 실패 판정은 아니다.
  const reason = 'projectRoot empty and discoverRepoRoot found no .claude/ ancestor';
  markHandoffRootUnresolved(ctx, reason);
  return { ok: false, root: null, reason: reason, source: 'unresolved' };
}

function markHandoffRootUnresolved(ctx, reason) {
  process.stderr.write('[mccp:handoff-items] WARNING: cannot resolve a repo root for ' +
    'handoff items (' + reason + ') — SKIPPING the write. Writing to a cwd-relative ' +
    'path would let the next session count it as its own denominator, which is worse ' +
    'than not writing.\n');

  // 채널 1 — 마커. 경로가 안 풀리는 상황이므로 cwd 상대가 최선이다(진단용).
  try {
    const dir = path.join(ctx && ctx.cwd ? ctx.cwd : process.cwd(), '.claude', 'state');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, HANDOFF_ROOT_UNRESOLVED_MARKER),
      JSON.stringify({ at: new Date().toISOString(), reason: reason, pid: process.pid }) + '\n',
      'utf8');
  } catch (_e) { /* 채널 2가 백업이다 */ }

  // 채널 2 — msw-event. 마커 write가 조용히 실패해도 이쪽이 남을 수 있다.
  try {
    const mswEvents = require('./msw-events');
    mswEvents.appendEvent(String((ctx && ctx.sessionId) || 'unknown'), {
      kind: 'handoff_root_unresolved',
      ts: new Date().toISOString(),
      producer: 'handoff-items.js',
    }, { cwd: ctx && ctx.cwd });
  } catch (_e) { /* 두 채널이 동시에 실패하면 SHIP-2가 3-state로 판정한다 */ }
}

// STATE.md frontmatter 읽기 (stateWriter 스타일)
function readStateFrontmatter(statePath) {
  if (!fs.existsSync(statePath)) return null;

  try {
    const content = fs.readFileSync(statePath, 'utf8');
    const lines = content.split('\n');

    // frontmatter 범위 찾기
    let inFrontmatter = false;
    let frontEnd = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('---')) {
        if (inFrontmatter) {
          frontEnd = i;
          break;
        }
        inFrontmatter = true;
      }
    }

    if (frontEnd <= 1) return null;

    const fm = lines.slice(1, frontEnd).join('\n');
    const data = {};

    // YAML 파싱 (간단한 key: value만 지원)
    for (const line of fm.split('\n')) {
      const match = /^(\w+):\s*(.*)$/.exec(line);
      if (match) {
        data[match[1]] = match[2].trim();
      }
    }

    return data;
  } catch (_e) {
    return null;
  }
}

// 열거 함수: 미완 항목 목록
function enumerateUnfinishedItems(cwd) {
  cwd = cwd || process.cwd();
  const items = [];

  // 1. STATE.md 진행 항목
  try {
    const statePath = path.join(cwd, '.claude', 'state', 'STATE.md');
    if (fs.existsSync(statePath)) {
      const content = fs.readFileSync(statePath, 'utf8');

      // 간단한 정규식으로 task 섹션 찾기
      const taskRe = /^##\s+Task\s+(\d+):?\s+(.*?)$/gm;
      let match;
      while ((match = taskRe.exec(content)) !== null) {
        const taskNum = match[1];
        const taskName = match[2].trim();
        // 마지막 Task 섹션은 indexOf가 -1을 반환한다 — substring(x, -1)은
        // substring(0, x)로 뒤집혀 엉뚱한 영역을 스캔하므로 content.length로 clamp.
        const nextSection = content.indexOf('\n##', match.index + 1);
        const blockEnd = nextSection === -1 ? content.length : nextSection;
        const taskBlock = content.substring(match.index, blockEnd);

        // 상태 감지
        if (taskBlock.includes('[ ]') || taskBlock.includes('unstarted') || taskBlock.includes('pending')) {
          items.push({
            type: 'state_task',
            id: `task-${taskNum}`,
            name: taskName,
            source: 'STATE.md',
          });
        }
      }
    }
  } catch (_e) {
    // 파싱 실패는 무시
  }

  // 2. fix-task.md
  try {
    const fixTaskPath = path.join(cwd, '.claude', 'state', 'fix-task.md');
    if (fs.existsSync(fixTaskPath)) {
      items.push({
        type: 'fix_task',
        id: 'fix-task',
        name: 'Unresolved fix task',
        source: 'fix-task.md',
      });
    }
  } catch (_e) {
    // 파일 확인 실패는 무시
  }

  // 3. 미완료 plan (간단한 휴리스틱)
  try {
    const plansDir = path.join(cwd, '.claude', 'plans');
    if (fs.existsSync(plansDir)) {
      const files = fs.readdirSync(plansDir);
      for (const file of files) {
        if (!file.endsWith('.plan.md')) continue;

        try {
          const content = fs.readFileSync(path.join(plansDir, file), 'utf8');
          // 미완료 plan: status가 complete/dropped가 아님 (간단히 "complete" 문자열 부재로 판단)
          const isCompleted = content.includes('status: complete') || content.includes('status: dropped');
          if (!isCompleted) {
            items.push({
              type: 'plan',
              id: file,
              name: file,
              source: `plans/${file}`,
            });
          }
        } catch (_e) {
          // 파일 읽기 실패는 무시
        }
      }
    }
  } catch (_e) {
    // 디렉토리 읽기 실패는 무시
  }

  return items;
}

// 기록 함수: 미완 항목을 sidecar에 기록
function writeHandoffItems(sessionId, items, opts) {
  opts = opts || {};
  const stateDir = opts.stateDir || path.join('.claude', 'state');

  if (!fs.existsSync(stateDir)) {
    try {
      fs.mkdirSync(stateDir, { recursive: true });
    } catch (_e) {
      return { ok: false, reason: 'mkdir-failed' };
    }
  }

  const targetPath = path.join(stateDir, `${sessionId}.handoff-items.json`);
  const tmpPath = targetPath + '.' + process.pid + '.' + require('crypto').randomBytes(4).toString('hex') + '.tmp';

  const payload = {
    session_id: sessionId,
    created_at: new Date().toISOString(),
    items: items,
    count: items.length,
  };

  try {
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    try {
      fs.renameSync(tmpPath, targetPath);
    } catch (err) {
      try { fs.unlinkSync(tmpPath); } catch (_e) { /* ignore */ }
      throw err;
    }
    return { ok: true, path: targetPath, count: items.length };
  } catch (err) {
    return { ok: false, reason: 'write-failed: ' + (err && err.message) };
  }
}

// 복원 함수: 이전 세션의 handoff-items와 현재 상태 비교
function restoreAndMatch(currentSessionId, opts) {
  opts = opts || {};
  const stateDir = opts.stateDir || path.join('.claude', 'state');
  const cwd = opts.cwd || process.cwd();

  const restored = [];

  // 모든 *.handoff-items.json 파일 열거
  try {
    if (!fs.existsSync(stateDir)) return { ok: true, restored: [], restored_count: 0 };

    // 현재 미완 항목을 한 번만 열거해 lookup Set을 만든다 — 이전에는 항목마다
    // 루프 안에서 STATE.md·전체 plan을 재읽어 O(files × items × disk)였다.
    const current = enumerateUnfinishedItems(cwd);
    const currentKeys = new Set(current.map(c => `${c.type} ${c.id}`));

    // 같은 현재 항목을 여러 이전 handoff 파일이 나열해도 한 번만 계상한다
    // (중복 계상 시 restored_count > denominator로 A4 > 1이 되어 anti-gaming 취지 위배).
    const seen = new Set();

    const files = fs.readdirSync(stateDir);
    for (const file of files) {
      if (!file.endsWith('.handoff-items.json') || file === `${currentSessionId}.handoff-items.json`) {
        continue; // 현재 세션 파일은 제외
      }

      try {
        const data = JSON.parse(fs.readFileSync(path.join(stateDir, file), 'utf8'));
        if (Array.isArray(data.items)) {
          for (const item of data.items) {
            const key = `${item.type} ${item.id}`;
            if (seen.has(key)) continue;
            if (currentKeys.has(key)) {
              seen.add(key);
              restored.push({ ...item, restored_in_session: currentSessionId });
            }
          }
        }
      } catch (_e) {
        // 파일 파싱 실패는 무시
      }
    }
  } catch (_e) {
    // 디렉토리 읽기 실패는 무시
  }

  return {
    ok: true,
    restored: restored,
    restored_count: restored.length,
  };
}

// 공개 API
module.exports = {
  enumerateUnfinishedItems,
  writeHandoffItems,
  restoreAndMatch,
  readStateFrontmatter,
  resolveHandoffRoot,
  HANDOFF_ROOT_UNRESOLVED_MARKER,
};
