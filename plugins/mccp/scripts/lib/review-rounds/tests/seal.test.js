'use strict';

// review-rounds/seal — 봉인 단위 test (env-contract-integrity M3 / Task 2 · Task 3).
//
// 봉인이 존재하는 이유는 하나다: 강제 지점(`codex-invoke.js` · `plan-review/cli.js`)이
// **자식 프로세스**이고, 이 PRD가 기록한 사건이 정확히 "값이 프로세스에 도달하지
// 않았다"이기 때문이다. 그러므로 이 파일의 중심 단언은 **"env를 비워도 봉인값이
// 이긴다"** 이고, 나머지는 그 주장이 조용히 거짓이 되는 경로(만료·판독불가·부재)를
// 각각 구별해 보고하는지를 본다.
//
// gitDir fixture는 git repo일 필요가 없다 — 봉인은 `gitDir` 인자를 그대로 앵커로 쓰고
// 원장과 달리 repo-root를 스스로 찾지 않는다. 그 차이 자체가 계약이라 fixture도 그
// 모양을 따른다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const seal = require('../seal');
const codexPolicy = require('../../codex-policy');
const { effectiveRoundCap } = require('../../review-single-pass');

const IS_WINDOWS = process.platform === 'win32';
const GATE = 'mccp-plan-codex';
const SLUG = 'seal-fixture';

function makeGitDir() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'round-seal-')));
}

function sealWith(gitDir, env, extra) {
  return seal.sealCap(Object.assign({
    gitDir: gitDir, env: env || {}, gateId: GATE, decisionId: SLUG,
  }, extra || {}));
}

// ── 봉인이 env를 이긴다 (이 파일의 존재 이유) ────────────────────────────────

test('a sealed cap survives an empty env — the whole point of sealing', () => {
  const gitDir = makeGitDir();
  sealWith(gitDir, { MCCP_GATE_ROUND_CAP: '3' });

  // 이 test가 공허하지 않음을 먼저 고정한다: env만 읽었다면 답이 달라져야 한다.
  assert.notEqual(effectiveRoundCap({}).cap, 3,
    'fixture must distinguish the sealed cap from the env-derived one');

  const r = seal.resolveEnforcement({ gitDir: gitDir, env: {} });
  assert.equal(r.cap, 3);
  assert.equal(r.source, 'seal');
});

test('a sealed cap survives an env that says something else mid-run', () => {
  // 관측된 실패 형태: R1이 끝난 뒤 실행 주체가 env를 고쳐 예산을 늘린다.
  const gitDir = makeGitDir();
  sealWith(gitDir, { MCCP_GATE_ROUND_CAP: '1' });
  const r = seal.resolveEnforcement({ gitDir: gitDir, env: { MCCP_GATE_ROUND_CAP: '3' } });
  assert.equal(r.cap, 1, 'the seal, not the live env, decides');
});

test('the seal carries the ledger key, because the chokepoints have no flag for it', () => {
  // `codex-invoke.js`는 gate id도 decision slug도 인자로 받지 않고
  // `emit-workflow-args`는 `--plan`만 받는다. 정체성이 봉인에 실리지 않으면 두
  // chokepoint는 무엇을 셀지 알 수 없다.
  const gitDir = makeGitDir();
  sealWith(gitDir, {});
  const s = seal.resolveEnforcement({ gitDir: gitDir, env: {} });
  assert.equal(s.gateId, GATE);
  assert.equal(s.decisionId, SLUG);
  assert.equal(s.canRecord, true);
});

test('the pin reason rides along so a pinned cap is not read as a configured one', () => {
  const gitDir = makeGitDir();
  const body = sealWith(gitDir, {
    MCCP_GATE_ROUND_CAP: '3',
    MCCP_REVIEW_SINGLE_PASS: 'scope_too_small',
  });
  assert.equal(body.cap, 1, 'single-pass pins the cap regardless of the configured value');
  assert.equal(body.pinned, true);
  assert.match(String(body.pinned_by), /single-pass/);

  const r = seal.resolveEnforcement({ gitDir: gitDir, env: {} });
  assert.equal(r.pinned, true);
  assert.match(String(r.pinnedBy), /single-pass/);
});

// ── 열화는 세 상태로 구별된다 ────────────────────────────────────────────────

test('an absent seal degrades to env and says so', () => {
  const gitDir = makeGitDir();
  const observed = seal.readCap({ gitDir: gitDir });
  assert.equal(observed.found, false);
  assert.equal(observed.reason, 'absent');

  const r = seal.resolveEnforcement({ gitDir: gitDir, env: { MCCP_GATE_ROUND_CAP: '2' } });
  assert.equal(r.cap, 2);
  assert.equal(r.source, 'env');
  assert.equal(r.sealReason, 'absent');
});

test('an absent seal makes enforcement structurally impossible, not merely declined', () => {
  // 원장 키를 모르면 셀 수조차 없다. `canRecord=false`가 그 사실이고, chokepoint는
  // 그 값을 보고 fail-open한다 — M3 이전 저장소의 모든 리뷰를 막는 것이 캡 초과보다
  // 큰 해이기 때문이다.
  const gitDir = makeGitDir();
  const s = seal.resolveEnforcement({ gitDir: gitDir, env: {} });
  assert.equal(s.canRecord, false);
  assert.equal(s.canEnforce, false);
  assert.equal(s.gateId, null);
  assert.equal(s.decisionId, null);
  assert.equal(s.sealReason, 'absent');
});

test('an expired seal degrades, and its age is reported rather than its value used', () => {
  const gitDir = makeGitDir();
  const t0 = Date.parse('2026-08-01T00:00:00.000Z');
  sealWith(gitDir, { MCCP_GATE_ROUND_CAP: '3' }, { now: t0 });

  const later = t0 + seal.MAX_SEAL_AGE_MS + 1;
  const observed = seal.readCap({ gitDir: gitDir, now: later });
  assert.equal(observed.found, false);
  assert.equal(observed.reason, 'expired');
  assert.equal(observed.cap, 3, 'the stale value is reported for diagnosis');

  const s = seal.resolveEnforcement({ gitDir: gitDir, env: {}, now: later });
  assert.equal(s.canRecord, false, 'but it is never used to enforce');
  assert.equal(s.sealReason, 'expired');
});

test('the seal lifetime is the same constant codex-policy uses, not a copy', () => {
  // 두 봉인이 같은 게이트 실행을 덮는데 수명이 다르면, 하나가 살아 있고 다른 하나가
  // 죽은 구간에서 정책이 반쪽만 적용된다.
  assert.equal(seal.MAX_SEAL_AGE_MS, codexPolicy.MAX_SEAL_AGE_MS);
});

test('a rewound clock is unreadable, not fresh — the age cannot be trusted', () => {
  const gitDir = makeGitDir();
  const t0 = Date.parse('2026-08-01T00:00:00.000Z');
  sealWith(gitDir, {}, { now: t0 });
  const observed = seal.readCap({ gitDir: gitDir, now: t0 - 60000 });
  assert.equal(observed.found, false);
  assert.equal(observed.reason, 'unreadable');
});

test('a malformed or under-specified seal body reads as unreadable, never as ok', () => {
  const gitDir = makeGitDir();
  const target = seal.sealPathFor(gitDir);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const good = sealWith(gitDir, {});
  const broken = [
    'not json at all',
    JSON.stringify(Object.assign({}, good, { schema_version: 99 })),
    JSON.stringify(Object.assign({}, good, { cap: 0 })),
    JSON.stringify(Object.assign({}, good, { cap: 'three' })),
    JSON.stringify(Object.assign({}, good, { mode: 'off' })),
    JSON.stringify(Object.assign({}, good, { gate_id: '../escape' })),
    JSON.stringify(Object.assign({}, good, { decision_id: 'a/b' })),
    JSON.stringify(Object.assign({}, good, { sealed_at: 'whenever' })),
  ];

  broken.forEach(function (raw) {
    fs.writeFileSync(target, raw);
    const observed = seal.readCap({ gitDir: gitDir });
    assert.equal(observed.found, false, 'must not accept: ' + raw.slice(0, 60));
    assert.equal(observed.reason, 'unreadable');
  });
});

test('a missing gitDir is absent, not a throw', () => {
  const observed = seal.readCap({ gitDir: null });
  assert.equal(observed.found, false);
  assert.equal(observed.reason, 'absent');
  const s = seal.resolveEnforcement({ gitDir: null, env: {} });
  assert.equal(s.canRecord, false);
});

// ── 쓰기 계약 ────────────────────────────────────────────────────────────────

test('sealing refuses a key that is not safe as a filename component', () => {
  const gitDir = makeGitDir();
  ['../escape', 'a/b', '', 'UPPER'].forEach(function (bad) {
    assert.throws(function () { sealWith(gitDir, {}, { gateId: bad }); }, /gateId must match/);
    assert.throws(function () { sealWith(gitDir, {}, { decisionId: bad }); }, /decisionId must match/);
  });
});

test('a read-back mismatch throws instead of leaving a silently wrong seal', () => {
  // 봉인은 정책의 유일한 디스크 사본이다. write가 0을 반환하고도 빈 파일이 남는
  // 실패 모드는 exit code만으로 잡히지 않으므로 되돌려 읽는 한 번의 비용을 치른다.
  // 그 비용이 실제로 값을 하는지는 이렇게만 증명할 수 있다.
  const gitDir = makeGitDir();
  const target = seal.sealPathFor(gitDir);
  const real = fs.readFileSync;
  fs.readFileSync = function (p, enc) {
    if (typeof p === 'string' && path.resolve(p) === path.resolve(target)) {
      return JSON.stringify({ cap: 999, mode: 'enforce', gate_id: GATE,
        decision_id: SLUG, sealed_at: 'tampered' });
    }
    return real.apply(fs, arguments);
  };
  try {
    assert.throws(function () { sealWith(gitDir, {}); }, /read-back mismatch/);
  } finally {
    fs.readFileSync = real;
  }
});

test('sealing replaces rather than overwrites in place', () => {
  // 지우고-쓰기 순서. 나중에 지우면 unlink가 실패했을 때 stale 산출물이 살아남아
  // 다음 소비자가 그것을 읽는다.
  const gitDir = makeGitDir();
  sealWith(gitDir, { MCCP_GATE_ROUND_CAP: '3' });
  sealWith(gitDir, { MCCP_GATE_ROUND_CAP: '2' }, { decisionId: 'seal-fixture-two' });

  const observed = seal.readCap({ gitDir: gitDir });
  assert.equal(observed.cap, 2);
  assert.equal(observed.decisionId, 'seal-fixture-two');
});

test('the seal file is owner-only on POSIX',
  { skip: IS_WINDOWS ? 'POSIX mode is inert on Windows' : false }, () => {
    const gitDir = makeGitDir();
    sealWith(gitDir, {});
    assert.equal(fs.statSync(seal.sealPathFor(gitDir)).mode & 0o777, 0o600);
  });

test('clearCap removes the seal and reports whether there was one', () => {
  const gitDir = makeGitDir();
  assert.equal(seal.clearCap({ gitDir: gitDir }), false);
  sealWith(gitDir, {});
  assert.equal(seal.clearCap({ gitDir: gitDir }), true);
  assert.equal(seal.readCap({ gitDir: gitDir }).reason, 'absent');
});

// ── MCCP_ROUND_LEDGER 어휘 (Task 3) ─────────────────────────────────────────

test('the mode vocabulary is exactly enforce and observe — there is no off', () => {
  // `off`를 두는 것은 M3 이전 동작(강제 없음)을 요청하는 것이고 그것이 이 milestone이
  // 고친 결함 자체다. `observe`가 이미 비차단 + 전량 기록을 준다.
  assert.deepEqual(seal.LEDGER_MODES.slice(), ['enforce', 'observe']);
  assert.equal(seal.LEDGER_MODES.indexOf('off'), -1);
  assert.equal(Object.isFrozen(seal.LEDGER_MODES), true);
  assert.equal(seal.DEFAULT_LEDGER_MODE, 'enforce');
});

test('an unset mode defaults to enforce', () => {
  assert.equal(seal.parseLedgerMode({}), 'enforce');
  assert.equal(seal.parseLedgerMode({ MCCP_ROUND_LEDGER: '' }), 'enforce');
  assert.equal(seal.parseLedgerMode({ MCCP_ROUND_LEDGER: '   ' }), 'enforce');
});

test('a bad mode fails CLOSED — a typo must not become a silent bypass', () => {
  // 방향이 `parseRoundCap`과 반대인 것이 의도다. 캡의 오타는 "몇 회인가"의 오답이라
  // 기본 회수로 접어도 권한이 늘지 않지만, 모드의 오타를 관대한 쪽으로 접으면 오타
  // 하나가 강제를 통째로 끄는 조용한 kill switch가 된다.
  ['off', 'OBSERVE', 'Enforce', 'observ', '0', '1', 'true'].forEach(function (bad) {
    assert.equal(seal.parseLedgerMode({ MCCP_ROUND_LEDGER: bad }), 'enforce',
      JSON.stringify(bad) + ' must fall back to enforce');
  });
});

test('observe records but never refuses', () => {
  const gitDir = makeGitDir();
  sealWith(gitDir, { MCCP_ROUND_LEDGER: 'observe' });
  const s = seal.resolveEnforcement({ gitDir: gitDir, env: {} });
  assert.equal(s.mode, 'observe');
  assert.equal(s.canRecord, true, 'observe still counts — that is its measurement purpose');
  assert.equal(s.canEnforce, false, 'and never blocks');
});

test('the mode comes from the seal first, with env only as a fallback', () => {
  // codex-policy의 단조 OR가 아니다. OR(→enforce)면 단계적 배포를 위해 observe를
  // 봉인한 운영자가 env가 지워지는 순간 강제로 튀고, env 우선이면 실행 중 observe를
  // 심는 것이 곧 조용한 우회가 된다. 봉인 우선은 두 오답을 모두 피한다.
  const gitDir = makeGitDir();
  sealWith(gitDir, { MCCP_ROUND_LEDGER: 'observe' });
  const s = seal.resolveEnforcement({ gitDir: gitDir, env: { MCCP_ROUND_LEDGER: 'enforce' } });
  assert.equal(s.mode, 'observe', 'the live env must not re-arm a sealed observe');
  assert.equal(s.canEnforce, false);

  const gitDir2 = makeGitDir();
  sealWith(gitDir2, { MCCP_ROUND_LEDGER: 'enforce' });
  const s2 = seal.resolveEnforcement({ gitDir: gitDir2, env: { MCCP_ROUND_LEDGER: 'observe' } });
  assert.equal(s2.canEnforce, true, 'nor disarm a sealed enforce');
});
