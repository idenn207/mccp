#!/usr/bin/env node
'use strict';

// 실행층 (Task 3). 열거 → argv 길이 판정 → spawn → 벽시계·exit code·파일별 집계.
//
// mirror는 `plugins/mccp/scripts/lib/suite-determinism.js:125-151`의 `runSuite`다 —
// spawn 실패나 불완전 출력을 "실패 0건"으로 읽지 않는다.
//
// ── 이 파일이 지키는 두 개의 독립 축 ──────────────────────────────────────────
// `ok`          = **측정이 성립했는가**. 스위트 green이 아니다. `exit_code`가
//                 비영점이어도 `ok:true`일 수 있고, 그래야 "M1은 측정이고 red는
//                 기록만 한다"는 전제가 Acceptance와 충돌하지 않는다.
// `redaction_ok` = **경로 유출이 없는가**. 흡수행 C-3이 두 축을 겸용하지 말라고
//                 정한 이유는 Acceptance 1이 `ci-node20`에 대해
//                 `ok:false ∧ attribution:'unavailable'`을 명시 수용하기 때문이다 —
//                 `ok:false` 일괄 거부는 그 수용 행을 죽인다.
//
// `--merge-into`는 `redaction_ok !== true`인 원소를 **거부**한다. 이것이 원장
// b52ca84d / 64a79560("불변식이 표시만 하고 차단하지 않는다")의 닫힘이다. 이전
// 명세의 거부 조건은 필수 키 + `ok` 불리언뿐이었고, `ok:false`도 유효 불리언이라
// 유출된 원소가 tracked 컨테이너에 그대로 들어갔다.
//
// 그리고 이 파일은 **자기 자신이 만드는 문자열도 redact한다**(원장 77b4add8).
// spawn 실패 메시지·`reason`·에러 stack은 reporter를 거치지 않으므로, reporter
// 산출만 훑는 스캔은 "정본 가드"처럼 보이되 지배적 유출 경로를 통과시킨다.
// 최종 산출 객체 **전체**에 대해 emit 직전 한 번 더 스캔하는 것이 그 닫힘이다.

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const { enumerateTests, exclusionsDigest, toPosix } = require('./enumerate');
const { createRedactor } = require('./redact');

const REPORT_MARKER = '##MCCP-SUITE-REPORT##';
const CONTAINER_SCHEMA = 'mccp-suite-baseline/v1';

// Windows `CreateProcess`의 커맨드라인 한계는 32,767자다. 실측 argv는 21,324바이트
// (65%)였다. 기본 임계를 24,000으로 두어 여유를 남기되, 값을 인자로 받는 순수
// 함수로 노출해 경계 입력을 **실행 없이** 단언할 수 있게 한다.
const DEFAULT_CHUNK_LIMIT_BYTES = 24000;

// 흡수행 C-5 — 파싱 **전** 바이트 상한. `JSON.parse`에 도달하기 전에 막아야
// OOM과 부분 write를 함께 닫는다.
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_DEPTH = 20;

// 흡수행 L-1 — label enum. 컨테이너의 키가 되므로 경로 형태를 만들 수 없어야 한다.
const LABEL_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

// 흡수행 C-4 — prototype pollution 가드. `intent-context.js`의 선례를 채택한다.
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

// ─────────────────────────────────────────────────────────────────────────────
// 순수층
// ─────────────────────────────────────────────────────────────────────────────

/**
 * argv 길이 판정. spawn 안에 묻으면 chunk 수를 실행 없이 단언할 수 없다 —
 * reporter가 집계 함수를 떼어낸 것과 같은 이유다.
 *
 * 한 파일이 단독으로 임계를 넘어도 **버리지 않는다**. 자기 혼자 든 chunk가 되며,
 * 그 chunk가 실제로 죽으면 spawn 실패로 관측된다. 조용히 빼면 분모가 줄어든다.
 */
function planChunks(opts) {
  const o = opts || {};
  const files = Array.isArray(o.files) ? o.files : [];
  const limit = typeof o.limitBytes === 'number' && o.limitBytes > 0
    ? o.limitBytes
    : DEFAULT_CHUNK_LIMIT_BYTES;

  const chunks = [];
  let cur = [];
  let curBytes = 0;

  files.forEach((f) => {
    // +1은 인자 구분자 몫이다. 실제 셸을 거치지 않으므로(shell:false) 인용 부호는
    // 없지만, 커널/Win32가 인자 사이에 구분자를 넣으므로 그만큼을 센다.
    const cost = Buffer.byteLength(String(f), 'utf8') + 1;
    if (cur.length > 0 && curBytes + cost > limit) {
      chunks.push(cur);
      cur = [];
      curBytes = 0;
    }
    cur.push(f);
    curBytes += cost;
  });
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

/**
 * spawn 인자. reporter 경로 형태를 단언 가능하게 하려고 떼어낸다.
 *
 * Windows에서 `--test-reporter=<절대경로>`는 `ERR_UNSUPPORTED_ESM_URL_SCHEME`
 * (`Received protocol 'c:'`)로 죽는다 — 드라이브 문자가 URL 스킴으로 해석되기
 * 때문이다. 그래서 `file://` URL로 고정한다. 이 제약은 산문이 아니라 Task 4-(5)의
 * 단언이 지킨다.
 *
 * `--`는 필수다. 열거의 유일한 수용 조건이 "`*.test.js`로 끝남"이라
 * `--experimental-x=a.test.js` 같은 항목이 파일이 아니라 node 플래그로 해석된다.
 */
function buildSpawnArgs(opts) {
  const o = opts || {};
  const reporterPath = String(o.reporterPath || '');
  const files = Array.isArray(o.files) ? o.files : [];
  return [
    '--test',
    '--test-reporter=' + reporterPath,
    '--',
  ].concat(files.map(String));
}

/** reporter 경로를 계약된 형태(`file://` URL)로 만든다. */
function reporterUrl(absReporterPath) {
  return pathToFileURL(absReporterPath).href;
}

/**
 * 4값 probe. **`complete`만 `ok:true`다.**
 *
 * `unavailable`과 `none`을 가르는 것은 "nesting-0 이벤트가 도착했는가"이지
 * "필드가 있는가"가 아니다 — 그 구분이 없으면 전 파일이 크래시한 실행이 Node
 * 능력 부재로 위장된다. 앞선 판본은 귀속 0건을 `ok:true`로 줬고, 그러면 1건
 * 귀속은 차단되는데 0건 귀속은 통과하는 **역전**이 생긴다(최악 입력이 permissive
 * 방향으로 떨어진다).
 */
function deriveAttribution(opts) {
  const o = opts || {};
  const filesTotal = Number(o.filesTotal) || 0;
  const perFileCount = Number(o.perFileCount) || 0;
  const nesting0 = Number(o.nesting0Events) || 0;
  const attributed = Number(o.attributedEvents) || 0;

  if (filesTotal > 0 && perFileCount === filesTotal) {
    return { attribution: 'complete', ok: true, reason: null };
  }
  if (attributed > 0) {
    return {
      attribution: 'partial',
      ok: false,
      reason: 'attribution-partial: ' + (filesTotal - perFileCount) + ' of ' +
        filesTotal + ' file(s) produced no attributed nesting-0 test:complete',
    };
  }
  if (nesting0 > 0) {
    return { attribution: 'unavailable', ok: false, reason: 'attribution-unavailable' };
  }
  return { attribution: 'none', ok: false, reason: 'no-test-completed' };
}

/**
 * chunk 접기. 미지정 기본값은 통상 "마지막 값"으로 구현되며 그것은 앞 chunk의
 * red를 덮는 **fail-open**이다. 그래서 규칙을 전부 명시한다.
 *
 * `attribution`은 **접지 않는다** — 분모(`files_total`)가 전역이므로 판정도
 * 전역이어야 한다. 접으면 한 chunk의 귀속 실패가 다른 chunk의 `complete`에
 * 덮이거나 그 반대가 된다.
 */
function foldChunks(results, opts) {
  const o = opts || {};
  const filesTotal = Number(o.filesTotal) || 0;
  const list = Array.isArray(results) ? results : [];

  let exitCode = 0;
  const chunksFailed = [];
  const perFile = [];
  const failing = [];
  let measuredAll = true;
  let redactionOk = true;
  let nesting0 = 0;
  let attributed = 0;
  const reasons = [];

  list.forEach((r, i) => {
    const code = Number(r && r.exit_code) || 0;
    if (code !== 0) {
      chunksFailed.push(i);
      if (exitCode === 0) exitCode = code;      // 첫 비영점을 싣는다
    }
    if (!(r && r.ok === true)) {
      measuredAll = false;
      if (r && r.reason) reasons.push('chunk[' + i + ']: ' + r.reason);
    }
    if (!(r && r.redaction_ok === true)) redactionOk = false;
    if (r && Array.isArray(r.per_file)) perFile.push.apply(perFile, r.per_file);
    if (r && Array.isArray(r.failing)) failing.push.apply(failing, r.failing);
    nesting0 += Number(r && r.nesting0_events) || 0;
    attributed += Number(r && r.attributed_events) || 0;
  });

  perFile.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  const attr = deriveAttribution({
    filesTotal: filesTotal,
    perFileCount: perFile.length,
    nesting0Events: nesting0,
    attributedEvents: attributed,
  });
  if (attr.reason) reasons.push(attr.reason);

  const ok = measuredAll && attr.ok === true;
  return {
    ok: ok,
    reason: reasons.length ? reasons.join(' | ') : null,
    attribution: attr.attribution,
    exit_code: exitCode,
    chunks: list.length,
    chunks_failed: chunksFailed,
    // `ok:false`일 때 `per_file`은 `null`이지 `[]`가 아니다 — 모름을 0으로 쓰지 않는다.
    per_file: ok ? perFile : null,
    failing: failing,
    redaction_ok: redactionOk,
    nesting0_events: nesting0,
    attributed_events: attributed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 병합 · 검증 (신뢰 경계를 넘는 지점)
// ─────────────────────────────────────────────────────────────────────────────

/** 흡수행 C-4 — 재귀 키 스캔. `JSON.parse` 결과를 그대로 신뢰하지 않는다. */
function assertNoPollution(value, depth) {
  const d = depth || 0;
  if (d > MAX_DEPTH) throw new Error('merge: input nesting exceeds depth ' + MAX_DEPTH);
  if (Array.isArray(value)) {
    value.forEach((v) => assertNoPollution(v, d + 1));
    return;
  }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((k) => {
      if (FORBIDDEN_KEYS.indexOf(k) !== -1) {
        throw new Error('merge: forbidden key "' + k + '" in input');
      }
      assertNoPollution(value[k], d + 1);
    });
  }
}

/** `Object.create(null)` 기반 재구성 — 상속 슬롯을 아예 갖지 않는 사본을 만든다. */
function sanitize(value, depth) {
  const d = depth || 0;
  if (d > MAX_DEPTH) throw new Error('merge: input nesting exceeds depth ' + MAX_DEPTH);
  if (Array.isArray(value)) return value.map((v) => sanitize(v, d + 1));
  if (value && typeof value === 'object') {
    const out = Object.create(null);
    Object.keys(value).forEach((k) => {
      if (FORBIDDEN_KEYS.indexOf(k) !== -1) return;
      out[k] = sanitize(value[k], d + 1);
    });
    return out;
  }
  return value;
}

// 실제로 소비하는 필드만 타입 검증한다(흡수행 C-6 부분 흡수 — 미소비 필드의 전수
// 스키마는 backlog). 목록을 넓히는 것이 아니라 **소비 목록과 일치시키는 것**이
// 계약이다: 여기 없는 필드를 아래에서 읽으면 검증되지 않은 값을 읽는 것이다.
const REQUIRED_FIELDS = [
  { key: 'ok', type: 'boolean' },
  { key: 'redaction_ok', type: 'boolean' },
  { key: 'attribution', type: 'string' },
  { key: 'wall_clock_ms', type: 'number' },
  { key: 'git_sha', type: 'string' },
  { key: 'files_total', type: 'number' },
];

/**
 * 병합 대상 원소의 수용 판정. **`redaction_ok !== true`는 거부다.**
 *
 * 타 머신의 redaction을 이 머신에서 재도출할 수는 없다(흡수행 C-2) — 그래서
 * 재도출을 주장하지 않는다. producer가 자기 머신에서 내린 판정을 봉인하고,
 * merge는 그 봉인을 신뢰하되 **거부 조건으로** 쓴다. 그 위에 머신 무관한 구조적
 * 스캔을 2차로 돌린다(A-3).
 */
function validateElement(element, opts) {
  const o = opts || {};
  const errors = [];
  if (!element || typeof element !== 'object' || Array.isArray(element)) {
    return { ok: false, errors: ['element must be a JSON object'] };
  }

  REQUIRED_FIELDS.forEach((f) => {
    if (!(f.key in element)) {
      errors.push('missing required field: ' + f.key);
      return;
    }
    const v = element[f.key];
    if (typeof v !== f.type) {
      errors.push('field ' + f.key + ' must be ' + f.type + ' (got ' + typeof v + ')');
    }
  });

  // `per_file`은 `ok===true`일 때 배열이어야 하고 그 밖에는 null이어야 한다.
  if (element.ok === true) {
    if (!Array.isArray(element.per_file)) {
      errors.push('per_file must be an array when ok===true');
    } else if (typeof element.files_total === 'number' &&
               element.per_file.length !== element.files_total) {
      errors.push('per_file length ' + element.per_file.length +
        ' !== files_total ' + element.files_total);
    }
    if (element.attribution !== 'complete') {
      errors.push('ok===true requires attribution==="complete" (got ' +
        String(element.attribution) + ')');
    }
  }

  if (typeof element.git_sha === 'string' && element.git_sha.trim() === '') {
    errors.push('git_sha must not be empty');
  }
  if (typeof element.wall_clock_ms === 'number' && !(element.wall_clock_ms > 0)) {
    errors.push('wall_clock_ms must be > 0');
  }

  // ── 차단 조건 ──
  if (element.redaction_ok !== true) {
    errors.push(
      'redaction_ok is not true — refusing to append a leaking element to a ' +
      'git-tracked container (this is a BLOCK, not a flag)'
    );
  }

  // 2차: 이 머신의 구조적 스캔. 1차는 위의 producer 봉인이다.
  if (o.redactor) {
    const scan = o.redactor.scanResidual(element);
    if (scan.hits.length > 0 || scan.truncated) {
      errors.push('secondary residual scan found ' + scan.hits.length +
        ' hit(s)' + (scan.truncated ? ' (scan truncated)' : '') +
        ' — rules: ' + scan.hits.map((h) => h.rule).join(','));
    }
  }

  return { ok: errors.length === 0, errors: errors };
}

function readJsonFile(file) {
  const stat = fs.statSync(file);
  if (stat.size > MAX_INPUT_BYTES) {
    throw new Error('input exceeds ' + MAX_INPUT_BYTES + ' bytes (got ' + stat.size + ')');
  }
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  assertNoPollution(parsed, 0);
  return sanitize(parsed, 0);
}

/** tmp+rename 원자 write. 파일명 규약은 `<target>.<pid>.<rand>.tmp`(§3.6). */
function atomicWriteJson(target, value) {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = target + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, target);
}

/** 같은 label은 **교체**한다(중복 append 아님). 다른 label은 공존한다. */
function mergeIntoContainer(opts) {
  const o = opts || {};
  const container = o.container && typeof o.container === 'object'
    ? o.container
    : { schema: CONTAINER_SCHEMA, runs: [] };
  if (!Array.isArray(container.runs)) container.runs = [];
  container.schema = CONTAINER_SCHEMA;

  const label = String(o.label || '');
  if (!LABEL_RE.test(label)) {
    throw new Error('--label must match ' + LABEL_RE.source + ' (got "' + label + '")');
  }

  const element = Object.assign({}, o.element, { label: label });
  const idx = container.runs.findIndex((r) => r && r.label === label);
  if (idx >= 0) container.runs[idx] = element;
  else container.runs.push(element);

  container.runs.sort((a, b) =>
    (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return container;
}

// ─────────────────────────────────────────────────────────────────────────────
// 실행층
// ─────────────────────────────────────────────────────────────────────────────

function gitLines(args, cwd) {
  try {
    const out = execFileSync('git', args, {
      cwd: cwd,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out;
  } catch (_) {
    return '';
  }
}

/**
 * 흡수행 L-2 — `-z` NUL 구분 파싱. 개행 분리는 개행을 포함한 파일명을 조용히
 * 누락시키고, 누락은 분모를 줄인다.
 */
function listTrackedFiles(cwd) {
  const raw = gitLines(['ls-files', '-z'], cwd);
  return raw.split('\0').filter((s) => s !== '');
}

function gitSha(cwd) {
  return gitLines(['rev-parse', 'HEAD'], cwd).trim();
}

// 부모가 이미 `node --test`일 때 새는 변수들. 이것들이 자식에 남으면 자식 러너가
// **`--test-reporter`를 무시하고** v8 직렬화 채널로 보고해 stdout이 0바이트가 된다
// (실측: `NODE_TEST_CONTEXT=child-v8` · `NODE_TEST_WORKER_ID=1`). 그 결과는
// `incomplete-report`이므로 fail-closed이긴 하나, 이 러너는 자기 test 안에서
// 실행되는 것이 정상 경로다(Task 4-(9)) — 상속을 끊는 것이 맞다.
const INHERITED_TEST_CONTEXT_KEYS = ['NODE_TEST_CONTEXT', 'NODE_TEST_WORKER_ID'];

// ci-full-suite M2 갈래 H — 자식에게 **강제하는** 정책. 상속을 끊는
// `INHERITED_TEST_CONTEXT_KEYS`와 방향이 반대라 목록을 나눈다.
//
// `MCCP_CODEX_DISABLED=1` — CLAUDE.md §3.4가 전수 실행에 이것을 요구하고,
// M1 §11이 그 대가를 실측했다 — 중단된 재측정에서 orphan node 289개
// (codex broker 146+143)가 쌓여 셸이 `fork: Resource temporarily unavailable`에
// 도달했다. 전수 스위트는 codex 경로를 타는 test를 수백 회 돌리므로
// 기본값이 반드시 비활성이어야 한다.
//
// 목록이지 단일 상수인 것은 새 정책 env가 생겼을 때 어디에 추가해야
// 하는지가 자명하도록 하기 위해서다. 다만 **아무 정책 env나 여기 넣지
// 말 것** — `MCCP_ROUND_LEDGER`는 명시적으로 제외된다. 그 수준은 봉인 우선
// · env fallback이라(`review-rounds/seal.js:207-213`) 봉인이 있으면 자식의 env가
// 판정에 도달하지 않고, 더 중요하게는 `round-cap-command-body.test.js:209-212`가
// "이 변수는 운영자 정책이지 게이트 상태가 아니므로 어떤 게이트도
// 대입하지 않는다"를 단언한다. 러너가 그것을 대입하면 그 불변식을
// 그 test가 볼 수 없는 곳에서 깨는 것이다.
const FORCED_POLICY_ENV = Object.freeze({ MCCP_CODEX_DISABLED: '1' });

// childEnv — export는 장식이 아니라 반증 수단이다. 이것 없이는 "러너가
// codex 정책을 강제한다"는 주장을 **간접 오라클**(갈래 H가 green)로밖에 못
// 확인하고, 그 오라클은 다른 이유로 green이 되어도 같은 답을 낸다.
//
// `MCCP_SUITE_REPO_ROOT`는 유지한다 — 소비처가 실재한다
// (`scripts/test-suite/reporter.mjs:223`가 repo-relative 산출의 기준점으로 읽는다).
// M2 계획은 "소비처 0건"이라고 적었으나 그것은 `--include=*.js` grep이 `.mjs`를
// 놓친 결과였고, 제거했다면 redaction/attribution 경로가 조용히 깨졌다.
function childEnv(cwd, opts) {
  const o = opts || {};
  const env = Object.assign({}, process.env, { MCCP_SUITE_REPO_ROOT: cwd });
  INHERITED_TEST_CONTEXT_KEYS.forEach((k) => { delete env[k]; });
  // `--allow-codex`는 **로컬 진단 전용**이다. 어떤 `pull_request` 트리거
  // workflow에도 이 플래그를 배선하지 마라 — `childEnv`는 여전히 프로세스
  // env 전량을 통과시키므로, CI에서 켜지면 codex 자식이 그 job에 노출된
  // 모든 secret을 물려받는다 (security-reviewer S4).
  if (o.allowCodex !== true) Object.assign(env, FORCED_POLICY_ENV);
  return env;
}

function defaultSpawn(args, opts) {
  return spawnSync(process.execPath, args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: false,                        // 인자 주입 경로를 만들지 않는다
    env: childEnv(opts.cwd, { allowCodex: opts.allowCodex === true }),
  });
}

/**
 * 한 chunk 실행. `spawn`은 **주입 가능한 seam**이다 — Task 4-(6)의 실패 경로
 * 단언(ENOENT · 마지막 줄 부재 · 절단된 출력)은 이 seam 없이는 접기 헬퍼를
 * 대상으로 퇴화한다.
 */
function runChunk(opts) {
  const o = opts || {};
  const spawn = typeof o.spawn === 'function' ? o.spawn : defaultSpawn;
  const redactor = o.redactor;
  const args = buildSpawnArgs({ reporterPath: o.reporterPath, files: o.files });

  let r;
  try {
    r = spawn(args, { cwd: o.cwd, allowCodex: o.allowCodex === true });
  } catch (err) {
    // 이 문자열은 reporter를 거치지 않는다 — 여기서 직접 redact하지 않으면
    // 지배적 유출 경로가 열린 채로 남는다(원장 77b4add8).
    return {
      ok: false,
      reason: 'spawn-threw: ' + redactor.redactText(String((err && err.message) || err)),
      exit_code: null, per_file: null, failing: [],
      redaction_ok: true, nesting0_events: 0, attributed_events: 0,
    };
  }

  if (!r || r.error) {
    const msg = r && r.error ? String(r.error.message || r.error) : 'no result';
    return {
      ok: false,
      reason: 'spawn-failed: ' + redactor.redactText(msg),
      exit_code: null, per_file: null, failing: [],
      redaction_ok: true, nesting0_events: 0, attributed_events: 0,
    };
  }

  const stdout = String(r.stdout || '');
  const line = stdout.split(/\r?\n/).reverse().find((l) => l.startsWith(REPORT_MARKER));
  if (!line) {
    return {
      ok: false,
      reason: 'incomplete-report: reporter marker line absent (stdout ' +
        stdout.length + ' chars, status ' + String(r.status) + ')',
      exit_code: r.status, per_file: null, failing: [],
      redaction_ok: true, nesting0_events: 0, attributed_events: 0,
    };
  }

  let report;
  try {
    report = JSON.parse(line.slice(REPORT_MARKER.length));
  } catch (err) {
    return {
      ok: false,
      reason: 'truncated-report: reporter line did not parse as JSON (' +
        redactor.redactText(String((err && err.message) || err)) + ')',
      exit_code: r.status, per_file: null, failing: [],
      redaction_ok: true, nesting0_events: 0, attributed_events: 0,
    };
  }

  return {
    ok: true,
    reason: null,
    exit_code: r.status,
    per_file: Array.isArray(report.per_file) ? report.per_file : [],
    failing: Array.isArray(report.failing) ? report.failing : [],
    redaction_ok: report.redaction_ok === true,
    redaction_hits: report.redaction_hits || [],
    nesting0_events: Number(report.nesting0_events) || 0,
    attributed_events: Number(report.attributed_events) || 0,
  };
}

/** 전체 실행. 벽시계는 첫 spawn 직전부터 마지막 spawn 종료까지다. */
function runOnce(opts) {
  const o = opts || {};
  const cwd = o.cwd || process.cwd();
  const redactor = o.redactor || createRedactor({ repoRoot: cwd });
  const files = Array.isArray(o.files) ? o.files : [];
  const exclusions = o.exclusions || [];

  const chunks = planChunks({ files: files, limitBytes: o.limitBytes });

  const started = Date.now();
  const results = chunks.map((c) => runChunk({
    files: c,
    reporterPath: o.reporterPath,
    cwd: cwd,
    spawn: o.spawn,
    redactor: redactor,
    allowCodex: o.allowCodex === true,
  }));
  const wallClockMs = Date.now() - started;

  const folded = foldChunks(results, { filesTotal: files.length });

  const out = {
    ok: folded.ok,
    reason: folded.reason,
    attribution: folded.attribution,
    node_version: process.version,
    platform: process.platform,
    cpus: os.cpus().length,
    git_sha: o.gitSha != null ? o.gitSha : gitSha(cwd),
    ci_run_id: process.env.GITHUB_RUN_ID || null,
    files_total: files.length,
    files_excluded: (o.excluded || []).length,
    exclusions: exclusions,
    exclusions_digest: exclusionsDigest(exclusions),
    // 이 원소가 codex 비활성 기본값으로 측정됐는가. 컨테이너를 읽는 쪽이 두
    // 종류의 run을 구분할 수 있어야 한다 — 벽시계도 red 집합도 같은 조건에서
    // 나온 값이 아니므로, 이 플래그 없이 두 원소를 나란히 비교하면 오독한다.
    codex_allowed: o.allowCodex === true,
    wall_clock_ms: wallClockMs,
    exit_code: folded.exit_code,
    chunks: folded.chunks,
    chunks_failed: folded.chunks_failed,
    per_file: folded.per_file,
    failing: folded.failing,
    nesting0_events: folded.nesting0_events,
    attributed_events: folded.attributed_events,
    redaction_degraded: redactor.degraded,
  };

  // 최종 스캔. reporter 산출뿐 아니라 **이 함수가 만든 `reason`·`failing`까지**
  // 포함한 전체 객체를 훑는다. producer 봉인은 이 판정이며, merge가 그것을
  // 거부 조건으로 쓴다.
  const scan = redactor.scanResidual(out);
  out.redaction_ok = folded.redaction_ok && scan.hits.length === 0 && !scan.truncated;
  out.redaction_hits = scan.hits;
  out.redaction_scan_truncated = scan.truncated;
  if (!out.redaction_ok && !out.reason) out.reason = 'redaction-incomplete';
  else if (!out.redaction_ok) out.reason = out.reason + ' | redaction-incomplete';

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function parseArgv(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) { flags[a.slice(2)] = next; i++; }
        else flags[a.slice(2)] = true;
      }
    } else {
      flags._.push(a);
    }
  }
  return flags;
}

function readListFile(file) {
  const stat = fs.statSync(file);
  if (stat.size > MAX_INPUT_BYTES) {
    throw new Error('list file exceeds ' + MAX_INPUT_BYTES + ' bytes');
  }
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function main(argv) {
  const flags = parseArgv(argv);
  const cwd = process.cwd();
  const redactor = createRedactor({ repoRoot: cwd });

  // UI2 — 전수 러너는 codex 비활성이 **기본값**이고 해제는 명시적이다.
  // 로컬 진단 전용 — CI workflow에 배선하지 말 것(childEnv 주석 참조).
  // 값 표기를 저장소 관행에 맞춘다 — `MCCP_*` 토글이 전부 `1` 을 on 으로 읽으므로
  // (`env-contract/value.js` 의 bypass-flag 분기) `--allow-codex=1` 이 조용히 off 로
  // 접히면 켰다고 믿는 운영자가 강제된 채로 측정한다. 인정하는 표기는 셋뿐이고,
  // **그 밖의 모든 값은 off** 다(오타는 codex 를 켜는 쪽으로 접히지 않는다).
  const allowCodexRaw = flags['allow-codex'];
  const allowCodex = allowCodexRaw === true || allowCodexRaw === 'true' || allowCodexRaw === '1';
  if (allowCodexRaw !== undefined && !allowCodex) {
    process.stderr.write('[test-suite] --allow-codex=' + String(allowCodexRaw) +
      ' is not a recognised value (use the bare flag, =true, or =1); treating it as OFF.\n');
  }
  if (allowCodex) {
    process.stderr.write('[test-suite] --allow-codex: children inherit the ambient codex ' +
      'policy instead of the forced MCCP_CODEX_DISABLED=1. Local diagnosis only.\n');
  }

  const exclusions = flags['exclude-from']
    ? readJsonFile(flags['exclude-from'])
    : [];

  const tracked = flags['files-from']
    ? readListFile(flags['files-from'])
    : listTrackedFiles(cwd);

  const enumerated = enumerateTests({ trackedFiles: tracked, exclusions: exclusions });

  if (flags.list) {
    process.stdout.write(enumerated.included.join('\n') + (enumerated.included.length ? '\n' : ''));
    return 0;
  }

  // `--merge-into`는 tracked 증거 파일을 쓰는 **유일한** 주체다.
  if (flags['merge-into']) {
    const target = String(flags['merge-into']);
    const label = String(flags.label || '');
    const element = flags.from
      ? readJsonFile(String(flags.from))
      : runOnce({
        cwd: cwd,
        files: enumerated.included,
        excluded: enumerated.excluded,
        exclusions: exclusions,
        reporterPath: reporterUrl(path.join(__dirname, 'reporter.mjs')),
        redactor: redactor,
        allowCodex: allowCodex,
      });

    const v = validateElement(element, { redactor: redactor });
    if (!v.ok) {
      process.stderr.write('[test-suite] REFUSED to merge label="' + label + '":\n');
      v.errors.forEach((e) => process.stderr.write('  - ' + e + '\n'));
      return 12;
    }

    let container = null;
    if (fs.existsSync(target)) container = readJsonFile(target);
    const merged = mergeIntoContainer({ container: container, label: label, element: element });
    atomicWriteJson(target, merged);
    process.stderr.write('[test-suite] merged label="' + label + '" into ' +
      toPosix(path.relative(cwd, target)) + ' (' + merged.runs.length + ' run(s))\n');
    return 0;
  }

  const result = runOnce({
    cwd: cwd,
    files: enumerated.included,
    excluded: enumerated.excluded,
    exclusions: exclusions,
    reporterPath: reporterUrl(path.join(__dirname, 'reporter.mjs')),
    redactor: redactor,
    allowCodex: allowCodex,
  });

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  // 측정 도구는 스위트의 red로 죽지 않는다 — `ok`가 판정이고 `exit_code`는 데이터다.
  return result.ok ? 0 : 1;
}

module.exports = {
  childEnv,
  FORCED_POLICY_ENV,
  planChunks,
  buildSpawnArgs,
  reporterUrl,
  deriveAttribution,
  foldChunks,
  validateElement,
  mergeIntoContainer,
  runChunk,
  runOnce,
  listTrackedFiles,
  assertNoPollution,
  sanitize,
  REPORT_MARKER,
  CONTAINER_SCHEMA,
  DEFAULT_CHUNK_LIMIT_BYTES,
  LABEL_RE,
};

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    const r = createRedactor({ repoRoot: process.cwd() });
    process.stderr.write('[test-suite] ' + r.redactText(String((err && err.stack) || err)) + '\n');
    process.exitCode = 1;
  }
}
