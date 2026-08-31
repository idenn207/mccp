'use strict';

// review-rounds/seal — 게이트 진입 시점의 라운드 정책을 디스크에 봉인하고 판독하는
// 오라클 (env-contract-integrity M3 / Task 2 · Task 3).
//
// 왜 env로는 안 되는가. 강제 지점은 `codex-invoke.js`와 `plan-review/cli.js`이고 둘 다
// **자식 프로세스**다. 이 PRD가 기록한 사건이 정확히 "값이 프로세스에 도달하지 않았다"
// 이므로, 캡을 env에서만 읽으면 M3은 자기가 고치려는 결함에 스스로 물린다. 그리고 R1이
// 끝난 뒤 실행 주체가 env를 고쳐 캡을 늘리는 창도 열려 있다 — `codex-policy.js`가
// v1.32.6에 `MCCP_CODEX_DISABLED`에 대해 닫은 것과 같은 창이다.
//
// mirror: codex-policy.js — `sealPolicy`(지우고-쓰기 · 0o600 · read-back 검증) ·
//         `readPolicy`(판정이 아니라 관측: 부재/만료/판독불가 구분) · `resolveGitDir`.
//
// **`codex-policy.json`과 별도 파일이다** (DD2). 방금 ship된 스키마를 확장하면 두 축의
// 실패가 서로 묶인다. 공유하는 것은 `resolveGitDir`와 `MAX_SEAL_AGE_MS` 둘뿐이고,
// 후자는 값을 복제하지 않고 **require해서** 같은 상수를 쓴다.
//
// ── 봉인 본문이 정체성을 나르는 이유 (Implement-Codex R1 F1 흡수) ───────────
// `codex-invoke.js`는 gate id도 decision slug도 **인자로 받지 않고**(자기 헤더가 그렇게
// 적었다), `emit-workflow-args`는 `--plan`만 받는다. 그런데 원장은 그 둘로 키잉된다.
// 두 chokepoint에 CLI 플래그를 새로 만들면 세 명령 본문의 모든 호출 지점이 그것을
// 넘겨야 하고, 그 "산문이 지시해야만 작동하는 배선"이 바로 M3이 없애려는 실패다.
// 그래서 정체성을 봉인이 나른다 — 봉인은 게이트 진입 시 **한 번** 쓰이고, 그 한 번은
// 명령 본문의 고정된 위치에 있어 정적 test가 검사할 수 있다.
//
// 그 대가는 정직하게 적는다: 봉인은 저장소 단위 **한 파일**이라, 같은 worktree에서 두
// 게이트가 겹치면 나중 봉인이 먼저 게이트의 정체성을 갈아치울 수 있다. 만료는 신선한
// 동시 봉인을 막지 못한다. 저장소 규약(3.8 — 동시 게이트는 worktree를 나눠 돌린다)이
// 그 창을 실무에서 닫고, run-scoped 불변 봉인은 backlog에 있다(같은 단일 파일 설계를
// `codex-policy.js`와 `REVIEW_DIR` 6종이 공유하므로 한 축만 고치면 저장소 안에 서로
// 다른 두 봉인 규약이 생긴다).

const fs = require('fs');
const path = require('path');

const codexPolicy = require('../codex-policy');
const { effectiveRoundCap } = require('../review-single-pass');
const { SLUG_RE } = require('../../receipt/decision');

const SCHEMA_VERSION = 1;
const SEAL_REL_DIR = path.join('mccp', 'tmp');
const SEAL_BASENAME = 'review-rounds-seal.json';

// 봉인 수명은 `codex-policy`와 **같은 상수**다. 두 봉인이 같은 게이트 실행을 덮는데
// 수명이 다르면, 하나가 살아 있고 다른 하나가 죽은 구간에서 정책이 반쪽만 적용된다.
const MAX_SEAL_AGE_MS = codexPolicy.MAX_SEAL_AGE_MS;

const ENV_LEDGER_MODE = 'MCCP_ROUND_LEDGER';

// `off`가 없다 (DD7). 끄는 것은 M3 이전 동작을 요청하는 것이고 그것이 결함 자체다.
// `observe`가 이미 비차단 + 전량 기록을 주므로 `off`가 사는 것은 침묵뿐이다.
const LEDGER_MODES = Object.freeze(['enforce', 'observe']);
const DEFAULT_LEDGER_MODE = 'enforce';

const READ_REASONS = Object.freeze(['ok', 'absent', 'expired', 'unreadable']);

function warn(line) {
  process.stderr.write('[mccp:review-rounds-seal] ' + line + '\n');
}

// parseLedgerMode — 불량값은 **기본값 `enforce`로 fail-closed**.
//
// `parseRoundCap`은 불량값에서 fail-open(기본 캡)하는데 여기는 반대인 것이 의도다. 두
// 파서가 답하는 질문이 다르다: 캡의 불량값은 "몇 회인가"의 오타라 기본 회수로 접는 것이
// 권한을 늘리지 않지만, 모드의 불량값을 관대한 쪽(`observe`)으로 접으면 오타 하나가
// 강제를 통째로 끄는 조용한 kill switch가 된다. 방향 규칙은 `parseSinglePass`와 같다.
//
// 대소문자를 구분한다 — 이 값은 봉인에 그대로 실려 감사 대상이 되므로, 정규화하면 서로
// 다른 입력이 같은 필드를 채운다.
function parseLedgerMode(env) {
  const raw = env && env[ENV_LEDGER_MODE];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_LEDGER_MODE;
  }
  const v = String(raw).trim();
  if (LEDGER_MODES.indexOf(v) === -1) {
    warn(ENV_LEDGER_MODE + ' must be one of [' + LEDGER_MODES.join('|') + ']; got "' +
      raw + '". Falling back to ' + DEFAULT_LEDGER_MODE + ' (fail-closed) — a typo must ' +
      'not become a silent bypass of the round cap.');
    return DEFAULT_LEDGER_MODE;
  }
  return v;
}

function sealPathFor(gitDir) {
  return path.join(gitDir, SEAL_REL_DIR, SEAL_BASENAME);
}

function assertKeyComponent(value, label) {
  if (typeof value !== 'string' || !SLUG_RE.test(value)) {
    throw new Error('sealCap: ' + label + ' must match ' + String(SLUG_RE) +
      '; got ' + JSON.stringify(value));
  }
  return value;
}

// sealCap — 게이트 진입 시 1회. 지우고-쓰기 순서를 지킨다: 나중에 지우면 unlink가
// 실패했을 때 stale 산출물이 살아남아 다음 소비자가 그것을 읽는다.
function sealCap(opts) {
  const o = opts || {};
  const gitDir = o.gitDir;
  if (!gitDir) throw new Error('sealCap: gitDir is required');
  const env = o.env || {};
  const now = Number.isFinite(o.now) ? o.now : Date.now();

  const gateId = assertKeyComponent(o.gateId, 'gateId');
  const decisionId = assertKeyComponent(o.decisionId, 'decisionId');

  // 캡 오라클을 여기서 **한 번** 부른다. 봉인 이후의 판정은 전부 이 결과를 읽으므로,
  // 세 게이트가 각자 다시 계산해 서로 다른 답을 얻는 경로가 없다.
  const eff = effectiveRoundCap(env, Object.prototype.hasOwnProperty.call(o, 'codexDisabled')
    ? { codexDisabled: o.codexDisabled }
    : undefined);

  const body = {
    schema_version: SCHEMA_VERSION,
    gate_id: gateId,
    decision_id: decisionId,
    cap: eff.cap,
    pinned: eff.pinned === true,
    pinned_by: eff.pinnedBy || null,
    mode: parseLedgerMode(env),
    sealed_at: new Date(now).toISOString(),
  };

  const target = sealPathFor(gitDir);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try { fs.unlinkSync(target); } catch (_) { /* 부재는 정상 */ }
  fs.writeFileSync(target, JSON.stringify(body, null, 2) + '\n', { mode: 0o600 });

  // write가 0을 반환하고도 빈 파일이 남는 실패 모드는 exit code만으로 잡히지 않는다.
  // 이 아티팩트는 정책의 유일한 디스크 사본이므로 되돌려 읽는 한 번의 비용을 치른다.
  const back = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (back.cap !== body.cap || back.mode !== body.mode ||
      back.gate_id !== body.gate_id || back.decision_id !== body.decision_id ||
      back.sealed_at !== body.sealed_at) {
    throw new Error('sealCap: read-back mismatch at ' + target);
  }
  return body;
}

// readCap — 판정이 아니라 **관측**이다. 부재/만료/판독불가를 구분해 보고한다. 판정
// (`resolveEnforcement`)이 셋을 서로 다르게 다루고, 운영자가 "강제가 조용히 강등됐다"를
// 사후에 읽을 수 있어야 하기 때문이다.
function readCap(opts) {
  const o = opts || {};
  const gitDir = o.gitDir;
  const now = Number.isFinite(o.now) ? o.now : Date.now();
  const miss = function (reason, ageMs) {
    return { found: false, reason: reason, ageMs: ageMs === undefined ? null : ageMs,
      cap: null, mode: null, pinned: null, pinnedBy: null, gateId: null, decisionId: null };
  };
  if (!gitDir) return miss('absent');

  const target = sealPathFor(gitDir);
  let raw;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch (err) {
    // 부재(ENOENT)와 그 밖의 I/O 실패(권한 등)는 다르다. 전자는 정상 상태이고 후자는
    // 봉인이 있었을 수도 있는데 읽지 못한 이상 상태다.
    return miss((err && err.code === 'ENOENT') ? 'absent' : 'unreadable');
  }

  let body;
  try { body = JSON.parse(raw); } catch (_) { return miss('unreadable'); }
  if (!body || typeof body !== 'object') return miss('unreadable');
  if (body.schema_version !== SCHEMA_VERSION) return miss('unreadable');
  if (!Number.isInteger(body.cap) || body.cap < 1) return miss('unreadable');
  if (LEDGER_MODES.indexOf(body.mode) === -1) return miss('unreadable');
  if (typeof body.gate_id !== 'string' || !SLUG_RE.test(body.gate_id)) return miss('unreadable');
  if (typeof body.decision_id !== 'string' || !SLUG_RE.test(body.decision_id)) return miss('unreadable');

  const sealedAt = Date.parse(body.sealed_at);
  if (!Number.isFinite(sealedAt)) return miss('unreadable');

  const ageMs = now - sealedAt;
  // 미래 타임스탬프(시계 되감김)는 만료가 아니라 판독불가다 — 나이를 신뢰할 수 없다.
  if (ageMs < 0) return miss('unreadable', ageMs);
  if (ageMs > MAX_SEAL_AGE_MS) {
    const m = miss('expired', ageMs);
    m.cap = body.cap;                 // 관측값은 싣되 found=false — 판정은 쓰지 않는다
    m.mode = body.mode;
    return m;
  }

  return {
    found: true,
    reason: 'ok',
    ageMs: ageMs,
    cap: body.cap,
    mode: body.mode,
    pinned: body.pinned === true,
    pinnedBy: body.pinned_by || null,
    gateId: body.gate_id,
    decisionId: body.decision_id,
  };
}

// resolveEnforcement — chokepoint가 실제로 읽는 단일 판정.
//
// 반환의 세 불리언이 서로 다른 질문에 답한다:
//   canEnforce  캡 초과를 **거부**해도 되는가          (봉인 ok + mode enforce)
//   canRecord   라운드를 **기록**할 수 있는가           (봉인 ok — 원장 키를 알아야 한다)
//   enforced    이번 판정이 강제로 취급되는가           (canEnforce의 별칭, 소비처 가독성용)
//
// **모드는 봉인 우선이고 env는 fallback이다** — `codex-policy`의 단조 OR가 아니다.
// 두 축의 안전 방향이 다르기 때문이다. codex-policy는 "비용이 줄어드는 방향"이 안전해서
// 실행 중 env를 켜는 정상 조작을 즉시 반영해야 했다. 여기서 OR(→enforce)를 쓰면
// 단계적 배포를 위해 `observe`를 봉인한 운영자가 env가 지워지는 순간 강제로 튄다.
// 반대로 env 우선이면 실행 중 `observe`를 심는 것이 곧 조용한 우회이고, 그것이 M3이
// 막으려는 실패 계열 자체다. 봉인 우선은 두 오답을 모두 피한다.
//
// **봉인이 없으면 강제가 불가능하다.** 원장 키를 알 수 없으므로 세지도 못한다. 그때는
// fail-open + loud warn이다 — 봉인한 적 없는 저장소(= M3 이전 사용자)의 모든 Codex
// 호출을 막는 것이 캡 초과보다 큰 해이기 때문이다. 열화가 stderr에만 살지 않도록
// receipt의 `meta.round_ledger_count`가 `null`로 그 사실을 봉인한다(R1 F3 흡수).
function resolveEnforcement(opts) {
  const o = opts || {};
  const env = o.env || {};
  const r = readCap({ gitDir: o.gitDir, now: o.now });

  if (r.reason !== 'ok') {
    const eff = effectiveRoundCap(env);
    return {
      canEnforce: false,
      canRecord: false,
      enforced: false,
      cap: eff.cap,
      pinned: eff.pinned,
      pinnedBy: eff.pinnedBy,
      mode: parseLedgerMode(env),
      gateId: null,
      decisionId: null,
      source: 'env',
      sealReason: r.reason,
    };
  }

  return {
    canEnforce: r.mode === 'enforce',
    canRecord: true,
    enforced: r.mode === 'enforce',
    cap: r.cap,
    pinned: r.pinned,
    pinnedBy: r.pinnedBy,
    mode: r.mode,
    gateId: r.gateId,
    decisionId: r.decisionId,
    source: 'seal',
    sealReason: 'ok',
  };
}

function clearCap(opts) {
  const o = opts || {};
  if (!o.gitDir) return false;
  try {
    fs.unlinkSync(sealPathFor(o.gitDir));
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  sealCap: sealCap,
  readCap: readCap,
  resolveEnforcement: resolveEnforcement,
  clearCap: clearCap,
  sealPathFor: sealPathFor,
  parseLedgerMode: parseLedgerMode,
  resolveGitDir: codexPolicy.resolveGitDir,
  LEDGER_MODES: LEDGER_MODES,
  DEFAULT_LEDGER_MODE: DEFAULT_LEDGER_MODE,
  ENV_LEDGER_MODE: ENV_LEDGER_MODE,
  MAX_SEAL_AGE_MS: MAX_SEAL_AGE_MS,
  READ_REASONS: READ_REASONS,
  SCHEMA_VERSION: SCHEMA_VERSION,
};
