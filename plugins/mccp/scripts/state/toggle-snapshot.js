'use strict';

// M2 토글 계측 — env-snapshot producer.
//
// MCCP_* 토글의 runtime-surface를 스캔하고 current session의
// 비기본값 토글만 `.claude/state/<session_id>.env-snapshot.json`에 기록.
// raw 값 절대 영속 금지(비밀·경로 유출 방지). 이름·boolean·default-class만.

const fs = require('fs');
const path = require('path');

// 기본값 표 (CLAUDE.md §4 cheat sheet 기반)
const TOGGLE_DEFAULTS = Object.freeze({
  MCCP_STOP_LOOP: 'observe',
  MCCP_STOP_LOOP_CODEX: '0',
  MCCP_RECEIPT_GATE_MODE: 'hard',
  MCCP_SKIP_RECEIPT: undefined,
  MCCP_RECEIPT_DEBUG: undefined,
  MCCP_ALLOW_CODEX_UNAVAILABLE: undefined,
  MCCP_CODEX_DISABLED: undefined,
  MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER: undefined,
  MCCP_FORCE_PR_WITHOUT_IMPECCABLE: undefined,
  MCCP_PR_SKIP_CODEX_REVIEW: undefined,
  CODEX_DEDUPE_AT_PR: undefined,
  MCCP_GATE_ROUND_CAP: '1',
  MCCP_CODEX_DESIGN_SCOPE_HONOR: '1',
  MCCP_DESIGN_CRITIQUE_MAX_RETRY: '2',
  MCCP_DESIGN_INTENT_REASON: undefined,
  MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN: undefined,
  MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL: undefined,
  MCCP_DESIGN_GROUNDING: 'enforce',
  MCCP_IMPECCABLE_ROUTING_MODE: 'auto',
  MCCP_IMPECCABLE_INTENT_COMMANDS: undefined,
  MCCP_A11Y_AUTO_INVOKE: '1',
  MCCP_RENDER_TRIGGER_DEBOUNCE_MS: '5000',
  MCCP_RENDER_LOCK_LEASE_MS: '90000',
  MCCP_RECEIPT_DEBUG_LEGACY_INLINE: undefined,
  MCCP_AUTO_CHAIN_DISABLE: undefined,
  MCCP_AUTO_CHAIN_SKIP_PR: undefined,
  MCCP_WORK_ISOLATE_IMPLEMENT: '1',
  MCCP_WORK_IMPLEMENT_WORKFLOW: '0',
  MCCP_WORK_IMPLEMENT_PARALLEL: 'on',
  MCCP_WORK_MERGE_STRATEGY: 'worktree-merge',
  MCCP_WORK_PARALLEL_MAX: '4',
  MCCP_WORK_PARALLEL_BUDGET: '150000',
  MCCP_WORK_PARALLEL_AUTODISABLE_TIER: '',
  MCCP_WORK_MERGED_VERIFY: 'enforce',
  MCCP_PLAN_FANOUT: 'on',
  MCCP_PLAN_FANOUT_BUDGET: '150000',
  MCCP_PLAN_FANOUT_AUTODISABLE_TIER: '',
  MCCP_ORCHESTRATION_COST_FAIL_OPEN: '1',
  MCCP_ORCHESTRATION_MAX_AGENTS: '24',
  MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: '600000',
  MCCP_ORCHESTRATION_CATASTROPHIC_USD: '500',
  MCCP_ORCHESTRATION_USD_BOMB: undefined,
  MCCP_AUTO_HANDOFF: 'notify',
  MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN: undefined,
  MCCP_HANDOFF_THRESHOLDS_USD: '50,80,100',
  MCCP_ORCHESTRATOR_POLL_MS: '500',
  MCCP_DISPATCH_CONTEXT: '0',
  MCCP_BRIEFING: 'auto',
  MCCP_BRIEFING_AUTODISABLE_TIER: 'notice,warning,critical',
  MCCP_SESSION_RETENTION_DAYS: undefined,
  MCCP_SUBSCRIPTION: undefined,
  MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_WARN_PCT: '35',
  MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_CRITICAL_PCT: '25',
  MCCP_SUBSCRIPTION_OVERFLOW_TOOL_WARN: '0',
  MCCP_SUBSCRIPTION_OVERFLOW_TOOL_CRITICAL: '0',
  MCCP_COST_STATE_DECAY_HOURS: '6',
});

// secret 패턴 감지 (derive/mask.js 거울, CLAUDE.md §4 cheat sheet 기반)
// reason toggles + force override toggles (likely to contain secrets/paths)
const SECRET_NAME_RE = /_REASON$|FORCE_PR_WITHOUT|FORCE_PR_WITHOUT_IMPECCABLE/;

// 간단한 파일 재귀 스캔 (glob 미사용)
function scanFilesRecursively(dir, fileExt) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // tests 디렉토리는 제외
        if (entry.name !== 'tests' && entry.name !== 'test') {
          results.push(...scanFilesRecursively(fullPath, fileExt));
        }
      } else if (entry.isFile() && fullPath.endsWith(fileExt)) {
        results.push(fullPath);
      }
    }
  } catch (_e) {
    // 스캔 실패는 무시
  }

  return results;
}

// runtime-surface scan (tests 제외, MCCP_TMP 제외)
function scanRuntimeSurface(repoRoot) {
  const found = new Set();
  const re = /MCCP_[A-Z0-9_]+/g;

  // .js 파일 스캔
  const jsFiles = scanFilesRecursively(
    path.join(repoRoot, 'plugins', 'mccp', 'scripts'),
    '.js'
  );

  for (const file of jsFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      let match;
      while ((match = re.exec(content)) !== null) {
        const name = match[0];
        if (name !== 'MCCP_TMP') {
          found.add(name);
        }
      }
    } catch (_e) {
      // 파일 읽기 실패는 무시
    }
  }

  // .md 파일 스캔
  const mdDir = path.join(repoRoot, 'plugins', 'mccp', 'commands');
  if (fs.existsSync(mdDir)) {
    try {
      const mdFiles = fs.readdirSync(mdDir).filter(f => f.endsWith('.md'));
      for (const file of mdFiles) {
        try {
          const content = fs.readFileSync(path.join(mdDir, file), 'utf8');
          let match;
          while ((match = re.exec(content)) !== null) {
            const name = match[0];
            if (name !== 'MCCP_TMP') {
              found.add(name);
            }
          }
        } catch (_e) {
          // 파일 읽기 실패는 무시
        }
      }
    } catch (_e) {
      // 디렉토리 읽기 실패는 무시
    }
  }

  return Array.from(found).sort();
}

// 현재 env에서 non-default 토글만 추출
function captureNonDefault(env) {
  const nonDefault = {};

  for (const [name, defaultValue] of Object.entries(TOGGLE_DEFAULTS)) {
    const currentValue = env[name];

    // 비기본값 판정
    if (currentValue !== undefined && currentValue !== defaultValue) {
      // secret-name이면 redact
      if (SECRET_NAME_RE.test(name)) {
        // name + boolean(비어있는지)만 기록
        nonDefault[name] = {
          is_set: true,
          is_secret_reason: true,
        };
      } else {
        // name + boolean + 기본값 유형만 기록
        const booleanValue = Boolean(currentValue) && currentValue !== '0' && currentValue !== 'false' && currentValue !== 'off';
        nonDefault[name] = {
          is_set: true,
          value_type: typeof currentValue === 'string' ? 'string' : typeof currentValue,
          is_boolean: booleanValue,
          default_class: typeof defaultValue,
        };
      }
    }
  }

  return nonDefault;
}

// snapshot write (원자적 tmp+rename, context-state 거울)
function writeSnapshot(sessionId, snapshot, opts) {
  opts = opts || {};
  const stateDir = opts.stateDir || path.join('.claude', 'state');

  if (!fs.existsSync(stateDir)) {
    try {
      fs.mkdirSync(stateDir, { recursive: true });
    } catch (_e) {
      return { ok: false, reason: 'mkdir-failed' };
    }
  }

  const targetPath = path.join(stateDir, `${sessionId}.env-snapshot.json`);
  const tmpPath = targetPath + '.' + process.pid + '.' + require('crypto').randomBytes(4).toString('hex') + '.tmp';

  try {
    fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
    try {
      fs.renameSync(tmpPath, targetPath);
    } catch (err) {
      try { fs.unlinkSync(tmpPath); } catch (_e) { /* ignore */ }
      throw err;
    }
    return { ok: true, path: targetPath };
  } catch (err) {
    return { ok: false, reason: 'write-failed: ' + (err && err.message) };
  }
}

// CLI: --scan-denominator (분모 출력)
function scanDenominator(repoRoot) {
  const vars = scanRuntimeSurface(repoRoot || process.cwd());
  console.log(vars.length);
}

// 공개 API
module.exports = {
  TOGGLE_DEFAULTS,
  scanRuntimeSurface,
  captureNonDefault,
  writeSnapshot,
  scanDenominator,
  SECRET_NAME_RE,
};

// CLI
if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--scan-denominator') {
    scanDenominator(process.cwd());
  }
}
