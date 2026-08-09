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

// B3 명시 제외 분류표 (multi-session-work-loop M4 Task 5)
//
// measurement-design.md §B3 규칙: "제외는 이 목록에 이름을 적을 때만 유효하며,
// 범위를 조용히 좁히는 것은 금지한다." 따라서 제외는 정규식이 아니라 **이름**이고,
// 각 이름에는 실파일 근거가 붙는다. 규범 문서(measurement-design.md §B3)가 같은
// 목록을 소유하며 이 표는 그 집행부다.
//
// 여기 없는 것은 제외하지 않는다. 특히 `MCCP_PLUGIN_ROOT` · `MCCP_SESSION_ID` ·
// `MCCP_HOOK_ID`는 "하네스 내부 변수"로 제외하자는 초안이 있었으나 **철회**했다 —
// 셋 다 set과 read가 모두 있어 운영자가 외부에서 override할 수 있으므로 실제 토글이다.
const TOGGLE_EXCLUSIONS = Object.freeze({
  MCCP_TMP: Object.freeze({
    class: 'shell-local',
    evidence: 'plugins/mccp/commands/*.md — command body의 셸 지역변수이지 env 게이트가 아니다(정규식 오탐)',
  }),
  MCCP_RESOLVE_NONCE: Object.freeze({
    class: 'browser-global',
    evidence: 'plugins/mccp/scripts/lib/dashboard-server.js:184 — `window.__MCCP_RESOLVE_NONCE` JS 전역이며 환경변수가 아니다',
  }),
  MCCP_RESOLVE_PATH: Object.freeze({
    class: 'browser-global',
    evidence: 'plugins/mccp/scripts/lib/dashboard-server.js:185 — `window.__MCCP_RESOLVE_PATH` JS 전역',
  }),
  MCCP_NONCE_HEADER: Object.freeze({
    class: 'browser-global',
    evidence: 'plugins/mccp/scripts/lib/dashboard-server.js:186 — `window.__MCCP_NONCE_HEADER` JS 전역',
  }),
  MCCP_MCP_RECONNECT_: Object.freeze({
    class: 'dynamic-key-prefix',
    evidence: 'plugins/mccp/scripts/hooks/mcp-health-check.js:517 — `MCCP_MCP_RECONNECT_${serverName}` 템플릿 접두사. 단일 토글 이름이 아니라 패밀리이며, 실 멤버 MCCP_MCP_RECONNECT_COMMAND는 분모에 그대로 남는다',
  }),
  MCCP_ORCHESTRATION_: Object.freeze({
    class: 'dynamic-key-prefix',
    evidence: 'plugins/mccp/scripts/lib/orchestration-runaway.js:41 — 주석의 `MCCP_ORCHESTRATION_*` glob 표기가 정규식에 잘려 잡힌 것. 실 멤버들은 각자 분모에 남는다',
  }),
  MCCP_LOCK_TEST_ARGV_TOKEN: Object.freeze({
    class: 'test-only',
    evidence: 'plugins/mccp/scripts/hooks/pr-phase-guard.js:92 — lock 테스트 전용 argv 토큰',
  }),
  MCCP_IMPECCABLE_CLI_MOCK: Object.freeze({
    class: 'test-only',
    evidence: 'plugins/mccp/scripts/lib/impeccable-detect.js:256 — CLI 가용성 mock 전용',
  }),
  MCCP_STOP_LOOP_E2E: Object.freeze({
    class: 'test-only',
    evidence: 'plugins/mccp/scripts/quality/runner.js:7 — e2e 스테이지 opt-in 전용',
  }),
  MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL: Object.freeze({
    class: 'test-only',
    evidence: 'plugins/mccp/commands/plan.md:687 — critique 결과를 강제 실패로 mock하는 test env',
  }),
});

const EXCLUSION_CLASSES = Object.freeze([
  'shell-local', 'browser-global', 'dynamic-key-prefix', 'test-only',
]);

function isExcludedToggle(name) {
  return Object.prototype.hasOwnProperty.call(TOGGLE_EXCLUSIONS, name);
}

// measurement-design.md §B3 owns the exclusion list: "제외는 이 목록에 이름을
// 적을 때만 유효" and "집행부는 TOGGLE_EXCLUSIONS이며 이 표와 1:1이다". Until
// something compares them, that 1:1 is an assertion in prose while the code is
// the real source of truth -- a denominator can then be changed by editing JS
// alone, which is exactly what the named-exclusion rule exists to prevent.
// These two functions make the claim checkable; the test asserts zero drift.
const EXCLUSION_DOC_REL = path.join('docs', 'multi-session-work-loop', 'measurement-design.md');

// Row shape: | class | `<TOKEN>` | evidence |   (trailing `_` allowed: prefix
// families). The token is not spelled out with its real prefix here: this file
// is itself inside the scanned surface, so a literal example would be counted
// as a toggle and inflate the very denominator it documents (same
// self-contamination the PYPROBE_OK marker hit).
const EXCLUSION_ROW = /^[ \t]*\|[ \t]*([a-z][a-z-]*)[ \t]*\|[ \t]*`(MCCP_[A-Z0-9_]*)`[ \t]*\|/gm;

function parseExclusionDoc(repoRoot, docPath) {
  const target = path.resolve(repoRoot || process.cwd(), docPath || EXCLUSION_DOC_REL);
  let text;
  try {
    text = fs.readFileSync(target, 'utf8');
  } catch (err) {
    return { ok: false, tokens: null, path: target, error: err.message };
  }
  const tokens = new Map();
  EXCLUSION_ROW.lastIndex = 0;
  let m;
  while ((m = EXCLUSION_ROW.exec(text)) !== null) {
    if (EXCLUSION_CLASSES.indexOf(m[1]) === -1) continue;
    tokens.set(m[2], m[1]);
  }
  return { ok: true, tokens: tokens, path: target, error: null };
}

/**
 * Compare the normative exclusion table against the enforcing constant.
 * Drift in either direction is reported; an unreadable table is drift too,
 * because "cannot check" must not read the same as "checked and clean".
 */
function crossCheckExclusions(repoRoot, docPath) {
  const codeNames = Object.keys(TOGGLE_EXCLUSIONS);
  const doc = parseExclusionDoc(repoRoot, docPath);
  if (!doc.ok) {
    return {
      ok: false,
      drift: ['normative exclusion table not readable at ' + doc.path + ' (' + doc.error + ')'],
      missing_in_doc: codeNames, missing_in_code: [], class_mismatch: [],
      doc_token_count: null, code_token_count: codeNames.length,
    };
  }
  const missingInDoc = codeNames.filter((n) => !doc.tokens.has(n));
  const missingInCode = Array.from(doc.tokens.keys()).filter((n) => !isExcludedToggle(n));
  const classMismatch = codeNames
    .filter((n) => doc.tokens.has(n) && doc.tokens.get(n) !== TOGGLE_EXCLUSIONS[n].class)
    .map((n) => n + ' (code=' + TOGGLE_EXCLUSIONS[n].class + ', doc=' + doc.tokens.get(n) + ')');

  const drift = []
    .concat(missingInDoc.map((n) => 'excluded in code but not named in the normative table: ' + n))
    .concat(missingInCode.map((n) => 'named in the normative table but not excluded in code: ' + n))
    .concat(classMismatch.map((s) => 'class mismatch — ' + s));

  return {
    ok: drift.length === 0,
    drift: drift,
    missing_in_doc: missingInDoc,
    missing_in_code: missingInCode,
    class_mismatch: classMismatch,
    doc_token_count: doc.tokens.size,
    code_token_count: codeNames.length,
  };
}

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
        // M4 Task 5 — measurement-design.md §B3은 "`*/tests/*` 경로와 `*.test.js`
        // 파일 제외"를 규정하는데 디렉토리만 걸러 왔다. 현재 tests/ 밖 `.test.js`가
        // 0개라 무해하지만, 하나만 생기면 mock 토글이 분모를 조용히 오염시킨다.
        if (fileExt === '.js' && entry.name.endsWith('.test.js')) continue;
        results.push(fullPath);
      }
    }
  } catch (_e) {
    // 스캔 실패는 무시
  }

  return results;
}

/**
 * runtime-surface scan — 제외 **전/후** 두 분모를 함께 낸다.
 *
 * 하나만 보고하면 제외가 곧 감축으로 오독된다(G3). `raw_surface_count`는 정규식이
 * 잡은 전수, `toggle_count`는 명명된 제외를 뺀 실 토글 수이며, 둘의 차이가 정확히
 * 제외 건수다. 제외는 은퇴가 **아니다** — M4의 은퇴 건수는 0이다.
 *
 * @returns {{raw: string[], toggles: string[], raw_surface_count: number,
 *            toggle_count: number, excluded: Array<{name,class,evidence}>,
 *            excluded_by_class: Object, defaults_conflicts: string[]}}
 */
function scanSurfaceDetailed(repoRoot) {
  const raw = scanRuntimeSurface(repoRoot, { includeExcluded: true });
  const toggles = raw.filter((n) => !isExcludedToggle(n));
  const excluded = raw.filter(isExcludedToggle).map((name) => ({
    name: name,
    class: TOGGLE_EXCLUSIONS[name].class,
    evidence: TOGGLE_EXCLUSIONS[name].evidence,
  }));

  const byClass = {};
  EXCLUSION_CLASSES.forEach((c) => { byClass[c] = []; });
  excluded.forEach((e) => { (byClass[e.class] = byClass[e.class] || []).push(e.name); });

  // 제외된 이름이 TOGGLE_DEFAULTS(분자 표)에도 있으면 두 표가 모순이다. 조용히
  // 넘기면 numerator가 분모 밖 토글을 셀 수 있으므로 표면화한다. 정합화 자체는
  // numerator 작업이라 M8 소관이다.
  const defaultsConflicts = excluded
    .map((e) => e.name)
    .filter((n) => Object.prototype.hasOwnProperty.call(TOGGLE_DEFAULTS, n));

  return {
    raw: raw,
    toggles: toggles,
    raw_surface_count: raw.length,
    toggle_count: toggles.length,
    excluded: excluded,
    excluded_by_class: byClass,
    defaults_conflicts: defaultsConflicts,
    // Surfaced next to the denominator it governs: a reader who sees
    // "denominator 96" should be able to see, in the same object, whether the
    // exclusions producing that 96 are the ones the normative table names.
    exclusion_doc: crossCheckExclusions(repoRoot),
  };
}

// runtime-surface scan (tests 제외, 명명된 제외 분류표 적용)
function scanRuntimeSurface(repoRoot, opts) {
  const includeExcluded = !!(opts && opts.includeExcluded);
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
        if (includeExcluded || !isExcludedToggle(name)) {
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
            if (includeExcluded || !isExcludedToggle(name)) {
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

  // M4 Task 6 — a relative stateDir resolves against the CALLER's cwd while the
  // reader (derive/sources/toggle-usage.js) scans a fixed repoRoot. When those
  // differ the snapshot lands somewhere nobody reads and B3's numerator stays 0
  // forever while the metric still reports `degraded: false`. That is exactly
  // what happened between M2 and M4: session-start.js omitted opts entirely and
  // not a single *.env-snapshot.json was ever produced. Fail loud rather than
  // silently writing into the void — the default is kept for back-compat.
  if (!path.isAbsolute(stateDir)) {
    process.stderr.write(
      '[mccp:toggle-snapshot] WARNING: relative stateDir "' + stateDir + '" resolves against cwd (' +
      process.cwd() + '). Pass an absolute { stateDir } anchored at repoRoot, or the reader will not find this snapshot.\n'
    );
  }

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
//
// 제외 후 한 숫자만 내면 그 숫자가 규범 문서가 승인한 제외로 만들어진 것인지
// 읽는 쪽이 알 수 없다. 제외 전 분모를 함께 내고, 표와 코드가 어긋났으면
// 숫자를 조용히 내주지 않고 **비영점 exit로 실패**한다.
function scanDenominator(repoRoot) {
  const root = repoRoot || process.cwd();
  const d = scanSurfaceDetailed(root);
  console.log(d.toggle_count);
  console.error('[toggle-denominator] raw=' + d.raw_surface_count +
    ' excluded=' + d.excluded.length + ' -> denominator=' + d.toggle_count);
  if (d.exclusion_doc && !d.exclusion_doc.ok) {
    console.error('[toggle-denominator] EXCLUSION TABLE DRIFT — this denominator is not the ' +
      'one measurement-design.md §B3 names:');
    d.exclusion_doc.drift.forEach((x) => console.error('  - ' + x));
    return 1;
  }
  return 0;
}

// CLI: --scan-surface (제외 전/후 분모 + 분류별 제외 근거)
function printSurface(repoRoot, asJson) {
  const d = scanSurfaceDetailed(repoRoot || process.cwd());
  if (asJson) {
    console.log(JSON.stringify(d, null, 2));
    return;
  }
  console.log('raw_surface_count : ' + d.raw_surface_count + '   (정규식 전수)');
  console.log('toggle_count      : ' + d.toggle_count + '   (명명된 제외 후 실 토글)');
  console.log('excluded          : ' + d.excluded.length + '   (은퇴 아님 — M4 은퇴 건수는 0)');
  EXCLUSION_CLASSES.forEach((c) => {
    const names = d.excluded_by_class[c] || [];
    if (names.length) console.log('  ' + c + ' (' + names.length + '): ' + names.join(', '));
  });
  if (d.defaults_conflicts.length) {
    console.log('  WARNING defaults_conflicts (' + d.defaults_conflicts.length +
      '): ' + d.defaults_conflicts.join(', ') + ' — 제외 목록과 TOGGLE_DEFAULTS가 모순. numerator 정합은 M8 소관');
  }
}

// 공개 API
module.exports = {
  TOGGLE_DEFAULTS,
  TOGGLE_EXCLUSIONS,
  EXCLUSION_CLASSES,
  EXCLUSION_DOC_REL,
  isExcludedToggle,
  parseExclusionDoc,
  crossCheckExclusions,
  scanRuntimeSurface,
  scanSurfaceDetailed,
  captureNonDefault,
  writeSnapshot,
  scanDenominator,
  SECRET_NAME_RE,
};

// CLI
if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--scan-denominator') {
    process.exitCode = scanDenominator(process.cwd());
  } else if (arg === '--scan-surface') {
    printSurface(process.cwd(), process.argv.indexOf('--json') !== -1);
  }
}
