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
};
