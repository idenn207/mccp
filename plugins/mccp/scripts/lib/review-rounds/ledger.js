'use strict';

// review-rounds/ledger — 라운드 수의 **단일 출처** (env-contract-integrity M3 / Task 1).
//
// 왜 있는가. 캡은 오늘 판정만 있고 강제가 없다. `effectiveRoundCap`은 정확한 수를
// 돌려주고 세 게이트가 그 오라클을 실제로 호출하지만, 라운드를 여는 것은 LLM이 읽는
// 산문이라 초과를 막는 장치가 없었다 — 실측 15+ 라운드, 그런데 receipt는 `rounds: 1`을
// 봉인했다(`write.js`의 리터럴). "몇 번 돌았는가"를 아는 주체가 없었기 때문이다.
// 여기가 그 주체다. 판정은 `santa/counter.js#decideRound`가 하고(순수 함수, 재사용),
// 디스크는 이 파일만 안다.
//
// mirror: santa/ledger.js — 상태 파일 규약 · repo-root 앵커 · `assertContained` 2차
//         방어 · `0o600` · mutation 임계구역. 그 파일이 이 축의 완성된 선례다.
//
// ── 상태 파일 ───────────────────────────────────────────────────────────────
//   <repoRoot>/.claude/state/review-rounds/<gate-id>__<decision-slug>.json
//   { schema_version: 1, gate_id, decision_id, rounds: [{index, at, channel, classification}] }
//   gitignored · 0o600
//
// **키는 decision slug이지 plan hash가 아니다** (DD6). dispatch-log는 hash로 키잉하지만
// 그 목적은 "같은 본문 재심사" 탐지다. 캡의 목적은 반대다 — escalation 라운드는 본문을
// 고친 뒤 돌므로 hash로 키잉하면 캡이 영원히 발화하지 않는다.
//
// **게이트별로 파일이 갈린다.** 한 decision이 plan → implement → pr 세 게이트를 지나고
// 각 게이트가 자기 캡을 갖는다. 하나로 합치면 plan에서 캡을 다 쓴 decision이 implement
// 게이트에서 리뷰를 한 번도 못 받는다.
//
// ── 경로 주입은 CLI 표면을 갖지 않는다 ──────────────────────────────────────
// `opts.statePath` / `opts.stateDir`는 **프로그래매틱 전용**이다(santa/ledger.js와 같은
// 규약, CLAUDE.md 3.13 선례). CLI가 이것을 플래그로 노출하면 repo-root 앵커링과
// `assertContained`가 동시에 무력화되고 원장이 `.gitignore` 보호 밖에 생긴다.
//
// ── 이 모듈이 주장하지 않는 것 ──────────────────────────────────────────────
// **check-then-act는 프로세스 사이에서 원자적이지 않다.** DD3대로 Codex 채널은
// "리뷰어가 답했을 때" 계상하므로 판정(spawn 전)과 기록(spawn 후) 사이에 spawn이
// 통째로 들어간다. 그 창에서 진짜로 동시에 진입한 두 게이트는 둘 다 통과할 수 있다.
// 캡이 강제하는 명제는 "기록된 라운드 수가 캡을 넘지 않는다"이지 "동시 spawn이
// 불가능하다"가 아니다. 저장소 규약(3.8 — 동시 게이트는 worktree를 나눠 돌린다)이 그
// 창을 실무에서 닫고, 예약 기반의 진짜 상호배제는 backlog에 있다
// (Implement-Codex R1 F1 잔여).

const fs = require('fs');
const path = require('path');

const { guardedReadModifyWrite } = require('../../receipt/evidence-lock');
const { gitRepoRoot } = require('../../receipt/hash');
const { SLUG_RE } = require('../../receipt/decision');
const { assertContained } = require('../path-containment');

const SCHEMA_VERSION = 1;
const STATE_MODE = 0o600;
const STATE_SUBDIR = 'review-rounds';
const IS_WINDOWS = process.platform === 'win32';

// 채널은 강제 chokepoint와 1:1이다(DD5). 새 값을 늘리려면 새 chokepoint가 있어야 한다.
const CHANNELS = Object.freeze(['codex', 'panel']);

class ReviewRoundsLedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReviewRoundsLedgerError';
    this.code = code;
  }
}

// gate id와 decision slug는 **파일명 성분**이다. SLUG_RE가 `.`/`/`/`\`를 배제하므로 이
// 검사를 통과한 값은 디렉토리를 벗어날 수 없다 — `assertContained`는 그 위의 2차
// 방어이지 1차가 아니다.
//
// gate id를 `GATE_IDS`로 검사하지 않는 이유: 이 모듈은 `codex-invoke.js`의 hot path에
// 실리고 `schema.js`는 receipt 계층 전체를 끌어온다. 경로 안전에 필요한 명제는
// "파일명 성분으로 안전한가"이고 SLUG_RE가 그것을 이미 답한다. 오타난 gate id는 별도
// 원장을 조용히 만들지만, 그 값은 봉인에서 오고 봉인은 명령 본문이 쓰므로 배선 오류는
// `round-cap-command-body.test.js`의 정적 단언이 잡는다.
function assertKeyComponent(value, label) {
  if (typeof value !== 'string' || !SLUG_RE.test(value)) {
    throw new ReviewRoundsLedgerError('REVIEW_ROUNDS_BAD_KEY',
      label + ' must match ' + String(SLUG_RE) + '; got ' + JSON.stringify(value));
  }
  return value;
}

function canonicalPath(p) {
  try { return fs.realpathSync.native(p); } catch (_err) { return p; }
}

// `opts.repoRoot` is a PROGRAMMATIC-ONLY shortcut for callers that already hold
// one, and it exists for cost, not convenience: `gitRepoRoot` spawns `git
// rev-parse` and that measured 546ms per call on Windows. `receipt/write.js`
// resolves the root before it reaches us, so without this every receipt write
// paid for a second identical spawn. Like `statePath`/`stateDir` it is not a CLI
// flag — a shell-settable root would relocate the ledger outside the .gitignore
// entry that protects it.
function repoRootOf(opts) {
  if (opts && typeof opts.repoRoot === 'string' && opts.repoRoot) return opts.repoRoot;
  const root = gitRepoRoot(opts && opts.cwd ? opts.cwd : process.cwd());
  if (!root) {
    throw new ReviewRoundsLedgerError('REVIEW_ROUNDS_NO_REPO_ROOT',
      'could not resolve a git repo root; the round ledger is anchored to it ' +
      '(a cwd-relative anchor would split one gate scope across two files and ' +
      'halve the cap).');
  }
  return root;
}

function ledgerBasename(gateId, decisionId) {
  return gateId + '__' + decisionId + '.json';
}

// resolveStatePath — 3단. 3번째 단이 `process.cwd()`가 아니라 **git repo root**인 것이
// 본질이다: 하위 디렉토리에서 호출해도 같은 원장을 봐야 하고, cwd 기준이면 같은 스코프가
// 두 파일로 갈려 캡이 쪼개진다.
function resolveStatePath(opts) {
  opts = opts || {};
  if (opts.statePath) return opts.statePath;                       // 프로그래매틱 전용
  const gateId = assertKeyComponent(opts.gateId, 'gateId');
  const decisionId = assertKeyComponent(opts.decisionId, 'decisionId');
  const base = ledgerBasename(gateId, decisionId);
  if (opts.stateDir) return path.join(opts.stateDir, base);        // 프로그래매틱 전용
  return path.join(repoRootOf(opts), '.claude', 'state', STATE_SUBDIR, base);
}

// 상태 **디렉토리**를 만들고 봉인한다. `assertContained`는 첫 인자에 realpath를 걸므로
// 대상이 실재해야 한다 — 최초 실행에는 상태 파일이 없으니 파일 경로를 넘기면 정상
// 경로가 traversal로 오판된다. 디렉토리는 mkdir 직후 실재한다.
//
// **3번째 인자는 반드시 `null`이다.** 그 인자는 generic repo-root 검사가 아니라
// `expectedParentDir`이 `.claude/receipts` 안인지를 강제하는 receipt 전용 검사다. 이
// 원장은 `.claude/state` 아래라 receipts 밖이므로 repoRoot를 넘기면 모든 정상 호출이
// 죽는다 (santa/ledger.js / pr-phase-lock.js가 같은 이유로 `null`을 명시한다).
function ensureStateDir(statePath, opts) {
  const dir = path.dirname(statePath);
  fs.mkdirSync(dir, { recursive: true });
  if (opts && (opts.statePath || opts.stateDir)) return dir;       // 프로그래매틱 주입
  assertContained(canonicalPath(dir),
    canonicalPath(path.join(repoRootOf(opts), '.claude', 'state')), null);
  return dir;
}

function chmodState(statePath) {
  if (IS_WINDOWS) return;                        // POSIX mode는 사실상 무력
  try { fs.chmodSync(statePath, STATE_MODE); } catch (_err) { /* best-effort */ }
}

function repairModeIfNeeded(statePath) {
  if (IS_WINDOWS) return;
  let st;
  try { st = fs.statSync(statePath); } catch (_err) { return; }    // 부재는 정상
  if ((st.mode & 0o777) === STATE_MODE) return;
  try { fs.chmodSync(statePath, STATE_MODE); } catch (_err) { /* best-effort */ }
}

function emptyState(gateId, decisionId) {
  return {
    schema_version: SCHEMA_VERSION,
    gate_id: gateId || null,
    decision_id: decisionId || null,
    rounds: [],
  };
}

// 손상은 **throw**다. 빈 상태로 접으면 파손된 원장이 곧 "라운드 0회"가 되어 캡이 조용히
// 리셋된다 — 캡 원장에서 그것은 가장 나쁜 실패 방향이다.
function parseState(raw, gateId, decisionId, statePath) {
  if (raw === null || raw === undefined) return emptyState(gateId, decisionId);
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (err) {
    throw new ReviewRoundsLedgerError('REVIEW_ROUNDS_CORRUPT',
      'round ledger is not valid JSON at ' + statePath + ': ' + err.message +
      ' — refusing to read a corrupt ledger as "zero rounds" (that would silently ' +
      'reset the cap). Inspect the file, then delete it to start a fresh count.');
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.rounds)) {
    throw new ReviewRoundsLedgerError('REVIEW_ROUNDS_CORRUPT',
      'round ledger has no rounds[] array at ' + statePath);
  }
  if (obj.schema_version !== SCHEMA_VERSION) {
    throw new ReviewRoundsLedgerError('REVIEW_ROUNDS_SCHEMA',
      'round ledger schema_version ' + JSON.stringify(obj.schema_version) +
      ' != ' + SCHEMA_VERSION + ' at ' + statePath);
  }
  return obj;
}

function read(opts) {
  opts = opts || {};
  const statePath = resolveStatePath(opts);
  repairModeIfNeeded(statePath);
  let raw = null;
  try { raw = fs.readFileSync(statePath, 'utf8'); } catch (_err) { raw = null; }
  return parseState(raw, opts.gateId, opts.decisionId, statePath);
}

function count(opts) {
  return read(opts).rounds.length;
}

function serialize(state) {
  return JSON.stringify(state, null, 2) + '\n';
}

// mutation — read/판정/write가 전부 임계구역 **안**에서 일어난다. read를 밖에 두면 lost
// update가 닫히지 않고, 여기서 last-writer-wins가 나면 라운드가 **적게** 세어져 캡이
// fail-open된다.
//
// **`mode: 'enforce'`는 상속된 env를 의도적으로 무시한다** (Implement-Codex R1 F2).
// `runGuarded`는 모드를 `opts.mode || parseGuardMode(opts.env)`로 정하므로, 이것을
// 넘기지 않으면 `MCCP_EVIDENCE_CONFLICT_GUARD=off`가 상속되는 것만으로 원장이 lock 없이
// read-modify-write된다. 그러면 성공한 두 리뷰가 서로를 덮어써 캡을 넘긴 호출이
// 통과한다. 캡 원장에서 직렬화는 하드닝이 아니라 정확성이다.
function mutate(opts, fn) {
  const statePath = resolveStatePath(opts);
  ensureStateDir(statePath, opts);
  repairModeIfNeeded(statePath);

  let outcome = null;
  guardedReadModifyWrite(statePath, function (currentRaw) {
    const state = parseState(currentRaw, opts.gateId, opts.decisionId, statePath);
    const r = fn(state);
    outcome = r.outcome;
    if (!r.write) return null;
    return serialize(r.state || state);
  }, { env: opts.env, mode: 'enforce' });

  chmodState(statePath);
  return outcome;
}

// recordRound — 라운드 1건 append. index는 append 시점의 길이(0-based)이고 그 계산이
// lock 안에서 일어나므로 동시 기록 둘이 같은 index를 갖지 않는다.
//
// 캡 판정은 **여기서 하지 않는다**(DD5). 판정은 chokepoint가 `decideRound`로 하고 원장은
// 사실만 기록한다 — 두 곳이 판정하면 어느 쪽이 정본인지 알 수 없게 된다.
function recordRound(opts) {
  opts = opts || {};
  const channel = opts.channel;
  if (CHANNELS.indexOf(channel) === -1) {
    throw new ReviewRoundsLedgerError('REVIEW_ROUNDS_BAD_CHANNEL',
      'channel must be one of [' + CHANNELS.join('|') + ']; got ' + JSON.stringify(channel));
  }
  const at = opts.at || new Date().toISOString();
  const classification = typeof opts.classification === 'string' ? opts.classification : null;

  return mutate(opts, function (state) {
    state.gate_id = opts.gateId || state.gate_id;
    state.decision_id = opts.decisionId || state.decision_id;
    const index = state.rounds.length;
    state.rounds.push({ index: index, at: at, channel: channel, classification: classification });
    return {
      write: true,
      state: state,
      outcome: { index: index, count: state.rounds.length },
    };
  });
}

module.exports = {
  read: read,
  count: count,
  recordRound: recordRound,
  resolveStatePath: resolveStatePath,
  ledgerBasename: ledgerBasename,
  ReviewRoundsLedgerError: ReviewRoundsLedgerError,
  SCHEMA_VERSION: SCHEMA_VERSION,
  STATE_MODE: STATE_MODE,
  STATE_SUBDIR: STATE_SUBDIR,
  CHANNELS: CHANNELS,
};
