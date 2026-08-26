'use strict';

// derive source: handoff-items (A4 substrate)
// 관측: .claude/state/*.handoff-items.json sidecar → 이전 세션이 남긴 미완 항목(분모)
//       + 그 중 현재에도 여전히 미완 = 복원된 항목(분자).
// Emits: { items_left_count, items_restored_count, ... }
// read-only · degraded fail-open per-source.
//
// 이전에는 이 source가 없어 msw-metrics computeA4가 항상
// insufficient('handoff_items source unavailable')였다(대시보드 A4 미산출).
// handoff-items lib의 enumerate/match 의미를 read-only로 재사용한다.

const fs = require('fs');
const path = require('path');
const { enumerateUnfinishedItems } = require('../../state/handoff-items');

function scanHandoffItems(repoRoot) {
  const result = {
    ok: true,
    items_left_count: 0,
    items_restored_count: 0,
    producer_coverage: 'handoff-items',
    // multi-session-work-loop M7 Task 5 — 승격이 A4 분모 구성을 바꾸는 것을
    // 관측 가능하게 한다. A4 무결성 규칙은 분모 **축소**를 플래그하므로 증가 자체는
    // 위반이 아니지만, 해석이 바뀌는 것은 기록되어야 한다: finding 유형이 유입되기
    // 전과 후의 A4 는 같은 이름의 다른 값이다.
    by_type: {},
    degraded: false,
    invalid_count: 0,
    error: null,
  };

  try {
    const stateDir = path.join(repoRoot, '.claude', 'state');
    if (!fs.existsSync(stateDir)) return result;

    // 현재 미완 항목 — 복원 판정 lookup (한 번만 열거)
    let currentKeys = new Set();
    try {
      const current = enumerateUnfinishedItems(repoRoot);
      currentKeys = new Set(current.map(c => `${c.type} ${c.id}`));
    } catch (_e) {
      result.degraded = true;
    }

    // 모든 handoff sidecar에서 distinct (type,id) 수집 (분모)
    const leftKeys = new Set();
    const files = fs.readdirSync(stateDir);
    for (const file of files) {
      if (!file.endsWith('.handoff-items.json')) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(stateDir, file), 'utf8'));
        if (Array.isArray(data.items)) {
          for (const item of data.items) {
            if (item && item.type != null && item.id != null) {
              leftKeys.add(`${item.type} ${item.id}`);
            }
          }
        }
      } catch (_e) {
        result.invalid_count++;
      }
    }

    result.items_left_count = leftKeys.size;

    // 분모의 유형 구성. 키는 `${type} ${id}` 이므로 첫 토큰이 유형이다.
    const byType = {};
    for (const key of leftKeys) {
      const type = String(key).split(' ')[0] || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
    }
    result.by_type = byType;

    // 복원 = 남겨진 항목 중 현재에도 여전히 미완 (distinct, 중복 없음)
    let restored = 0;
    for (const key of leftKeys) {
      if (currentKeys.has(key)) restored++;
    }
    result.items_restored_count = restored;
  } catch (err) {
    result.ok = false;
    result.error = err.message;
    result.degraded = true;
  }

  return result;
}

module.exports = {
  scanHandoffItems,
};
