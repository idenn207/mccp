'use strict';

// derive source: toggle-usage
// 관측: env-snapshot 읽어 토글 non-default 사용 이력(B3 분자) + 분모 99 재스캔
// Emits: { used_toggle_count, denominator, operation_branch_count, ... }
// degraded fail-open per-source.

const fs = require('fs');
const path = require('path');

// 계약: MCCP_* 토글 식별자는 정규식 MCCP_[A-Z0-9_]+에 매치
// 분모 범위: plugins/mccp/scripts/**/*.js (tests 제외) ∪ commands/*.md
// 명시 제외: MCCP_TMP

const TOGGLE_RE = /MCCP_[A-Z0-9_]+/g;
const EXCLUDE_TOKENS = new Set(['MCCP_TMP']);

function scanToggleUsage(repoRoot) {
  const result = {
    ok: true,
    used_toggle_count: 0,
    denominator: 0,
    operation_branch_count: 0,
    producer_coverage: 'toggle-usage',
    degraded: false,
    invalid_count: 0,
    error: null,
  };

  try {
    // 1. Scan runtime surface for toggles (분모)
    const denominator = scanDenominator(repoRoot);
    result.denominator = denominator.count;

    // 2. Read env-snapshots to find non-default usage (분자)
    const snapDir = path.join(repoRoot, '.claude', 'state');
    const usedToggles = new Set();

    if (fs.existsSync(snapDir)) {
      const files = fs.readdirSync(snapDir);
      for (const file of files) {
        if (!file.endsWith('.env-snapshot.json')) continue;
        const filePath = path.join(snapDir, file);

        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (content.toggles && typeof content.toggles === 'object') {
            for (const toggleName of Object.keys(content.toggles)) {
              const toggleData = content.toggles[toggleName];
              // Only count non-default usage
              if (toggleData && toggleData.is_set === true) {
                usedToggles.add(toggleName);
              }
            }
          }
        } catch (snapErr) {
          result.invalid_count++;
        }
      }
    }

    result.used_toggle_count = usedToggles.size;

    // 3. Calculate operation branch count (동작 분기 수)
    // This is a heuristic: count distinct conditional branches per toggle
    // For now, estimate based on toggle name patterns and usage
    result.operation_branch_count = estimateOperationBranches(usedToggles, denominator.byName);

  } catch (err) {
    result.ok = false;
    result.error = err.message;
    result.degraded = true;
  }

  return result;
}

function scanDenominator(repoRoot) {
  const result = {
    count: 0,
    byName: {},
    degraded: false,
  };

  try {
    // Scan plugins/mccp/scripts/**/*.js (tests excluded)
    const scriptsDir = path.join(repoRoot, 'plugins', 'mccp', 'scripts');
    if (fs.existsSync(scriptsDir)) {
      scanDir(scriptsDir, '.js', true, result);
    }

    // Scan plugins/mccp/commands/*.md
    const commandsDir = path.join(repoRoot, 'plugins', 'mccp', 'commands');
    if (fs.existsSync(commandsDir)) {
      scanDir(commandsDir, '.md', false, result);
    }
  } catch (err) {
    result.degraded = true;
  }

  // 분모 = runtime surface에서 발견된 distinct 토글 수. scanDir은 byName만
  // 누적하므로 여기서 count를 파생한다(과거: count가 0으로 고정돼 B3가 항상
  // insufficient였던 버그).
  result.count = Object.keys(result.byName).length;

  return result;
}

function scanDir(dirPath, ext, excludeTests, result) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip tests directory for .js
        if (ext === '.js' && excludeTests && entry.name === 'tests') {
          continue;
        }
        scanDir(fullPath, ext, excludeTests, result);
      } else if (entry.name.endsWith(ext)) {
        // Skip .test.js files
        if (ext === '.js' && excludeTests && entry.name.endsWith('.test.js')) {
          continue;
        }

        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          let match;
          while ((match = TOGGLE_RE.exec(content)) !== null) {
            const token = match[0];
            if (!EXCLUDE_TOKENS.has(token)) {
              if (!result.byName[token]) {
                result.byName[token] = 0;
              }
              result.byName[token]++;
            }
          }
        } catch (fileErr) {
          // Skip unreadable files
        }
      }
    }
  } catch (err) {
    result.degraded = true;
  }
}

function estimateOperationBranches(usedToggles, denominatorByName) {
  // 동작 분기 수: 토글 하나가 몇 개의 서로 다른 값으로 분기하는지의 합
  // 예: MCCP_STOP_LOOP (off/observe/enforce 3분기) = 3, boolean = 2
  // This is a heuristic based on toggle patterns

  let totalBranches = 0;

  for (const toggleName of usedToggles) {
    const branchCount = estimateBranchesForToggle(toggleName);
    totalBranches += branchCount;
  }

  return totalBranches;
}

function estimateBranchesForToggle(toggleName) {
  // Heuristic: infer from token patterns
  // Default = 2 (boolean on/off)
  // Special patterns = higher

  if (toggleName === 'MCCP_STOP_LOOP' || toggleName === 'MCCP_RECEIPT_GATE_MODE') {
    return 3;
  }
  if (toggleName === 'MCCP_IMPECCABLE_ROUTING_MODE') {
    return 3;
  }
  if (toggleName === 'MCCP_DESIGN_GROUNDING') {
    return 3;
  }
  if (toggleName === 'MCCP_ORCHESTRATION_COST_FAIL_OPEN') {
    return 2;
  }
  // Default: boolean (2 branches)
  return 2;
}

module.exports = {
  scanToggleUsage,
};
