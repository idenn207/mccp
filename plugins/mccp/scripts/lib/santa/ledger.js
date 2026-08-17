'use strict';

// santa/ledger — 라운드 원장의 디스크 계층 (santa-loop-materialize M1 / Task 2).
//
// 라운드 수의 **단일 출처**다(DD1). counter는 그 수를 인자로 받는 순수 oracle이고
// gate는 디스크를 모른다. 여기만 파일을 안다.
//
// 외부 의존 4개 — 그 이상 없음, npm 0:
//   receipt/evidence-lock.js#guardedReadModifyWrite  (DD7 — mutation 3종)
//   receipt/hash.js#gitRepoRoot                      (DD3 — 경로 앵커)
//   receipt/decision.js{SLUG_RE,BRANCH_PREFIX_RE}    (DD3 — slug 규칙 재사용)
//   lib/path-containment.js#assertContained          (DD3 — traversal 2차 방어)
//
// plan Acceptance는 "외부 의존 정확히 3개"라 적었으나 그 목록이
// `path-containment`를 빠뜨렸다 — DD3 본문은 그것을 **명시적으로 요구**한다
// (R6 Codex F0이 이 호출의 인자 의미를 고쳐 놓은 자리다). 셋으로 줄이려면
// 심층 방어를 버려야 하므로 4개로 구현하고 그 불일치를 보고서에 적는다.
//
// ── 상태 파일 (DD2, P0 동결) ────────────────────────────────────────────────
//   <repoRoot>/.claude/state/santa-loop/<decision-slug>.json   gitignored · 0o600
//   { schema_version: 1, decision_id, cap, rounds: [...], entries: [] }
//   라운드 상태는 별도 필드가 아니라 `verdict === null`의 파생이다 —
//   OPEN(=null) / FINAL(=non-null). 상태를 두 곳에 두면 drift한다(DD1).
//
// ── 경로 주입은 CLI 표면을 갖지 않는다 (security S2 흡수) ───────────────────
// `opts.statePath` / `opts.stateDir` 두 단은 **프로그래매틱 전용**이다. CLI가
// 이것들을 플래그로 노출하면 repo-root 앵커링과 `assertContained`가 동시에
// 무력화되어, DD3의 방어 2단이 플래그 하나로 사라진다(그리고 원장이
// `.gitignore` 보호 밖에 생긴다). CLI가 받는 것은 `--cwd`뿐이고, 그것은
// repo-root **탐색 기점**일 뿐이라 어떤 값을 줘도 결과 경로는 그 repo의
// `.claude/state/santa-loop/` 안이다 — 탈출면이 구조적으로 없다.
// 같은 논리의 선례: CLAUDE.md §3.13(intent 결정이 CLI 플래그를 0건 갖는 이유).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { guardedReadModifyWrite } = require('../../receipt/evidence-lock');
const { gitRepoRoot } = require('../../receipt/hash');
const { SLUG_RE, BRANCH_PREFIX_RE } = require('../../receipt/decision');
const { assertContained } = require('../path-containment');

// santa-adjudication M3 — 종료 사유 어휘의 **단일 집합**. 읽기(`assertTerminationMarker`)와
// 쓰기(`terminate`)가 같은 것을 본다.
//
// 쓰기 쪽 열거만 넓히면 마커를 쓴 직후의 첫 `read()`가 `SANTA_LEDGER_CORRUPT`로 던져
// **그 slug의 원장이 통째로 읽히지 않는다**(seal도, status도, begin-round도). 그것은
// 이 milestone을 배송 불가로 만드는 절반짜리 변경이라, 두 곳을 한 상수에서 파생한다.
//
// `SCHEMA_VERSION`은 **올리지 않는다**: 올리면 M2가 쓴 기존 원장 전부가 즉시 읽기
// 불가가 되어 진행 중인 루프가 배송 시점에 전멸한다. 반대 방향(M3이 쓴 원장을 M2
// 코드가 읽으면 throw)은 fail-closed의 정상 동작이고 원장이 gitignored라 노출 창이
// "같은 워크트리에서 plugin cache를 되돌린 경우" 하나뿐이다.
const counterModule = require('./counter');
const terminator = require('./terminator');
const TERMINATION_REASONS = Object.freeze([
  counterModule.REASONS.CAP_REACHED,
  terminator.EXIT_REASON.PATCH_CHASING,
]);

const SCHEMA_VERSION = 1;
const STATE_MODE = 0o600;
const DEFAULT_DECISION_ID = 'default';
const IS_WINDOWS = process.platform === 'win32';

class SantaLedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'SantaLedgerError';
  }
}

function warn(line) {
  process.stderr.write('[mccp:santa-ledger] ' + line + '\n');
}

// ── decision slug ────────────────────────────────────────────────────────────

// DD3 — santa는 `decision.js#deriveDecisionId`를 **쓰지 않는다**. 그 함수의
// BRANCH_BASED_COMMANDS 분기는 `/mccp:pr` 전용 의미론 두 개를 딸려 보내는데,
// 그중 implement-receipt fallback(decision.js:244-251)은 santa에서 재앙이다:
// santa는 receipt를 요구하지도 발행하지도 않으므로(UI4) `receiptExistsForSlug`가
// **항상 false**라, 브랜치에 receipt가 없으면 원장이 **다른 decision의 slug**
// 아래로 들어간다. 그래서 자기 3단 규칙을 갖는다(상수만 재사용).
function deriveSantaDecisionId(args, opts) {
  opts = opts || {};

  // 1) 명시 --decision — SLUG_RE 통과 필수. 실패는 throw이지 무시가 아니다.
  //    이 값은 경로 조립에 직접 들어가므로(`slug + '.json'`) 검증 없는 통과는
  //    디렉토리 탈출이다. SLUG_RE는 `.`과 `/`를 아예 배제한다.
  const explicit = args && args.decision;
  if (typeof explicit === 'string' && explicit !== '') {
    if (!SLUG_RE.test(explicit)) {
      throw new SantaLedgerError('SANTA_BAD_SLUG',
        '--decision "' + explicit + '" does not match ' + String(SLUG_RE) + '. ' +
        'The value is joined into a filesystem path, so anything with "." or "/" ' +
        'is refused before any file is touched.');
    }
    return explicit;
  }

  // 2) 브랜치명 → prefix 제거 + [._] → '-' 정규화 → 같은 SLUG_RE
  //    (decision.js#slugFromBranch와 동일 규칙. 복사가 아니라 같은 상수 재사용.)
  const branchSlug = slugFromBranch(opts.cwd);
  if (branchSlug) return branchSlug;

  // 3) 둘 다 실패
  return DEFAULT_DECISION_ID;
}

function slugFromBranch(cwd) {
  try {
    const out = execFileSync('git', ['branch', '--show-current'], {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    });
    const branch = (out || '').trim();
    if (!branch) return null;
    const slug = branch.replace(BRANCH_PREFIX_RE, '').toLowerCase().replace(/[._]+/g, '-');
    return SLUG_RE.test(slug) ? slug : null;
  } catch (_err) {
    return null;
  }
}

// resolveDecisionId → { decisionId, escalation, warning }  (DD3 3분기 표)
//
// **`decisionId`는 언제나 현 스코프에서 파생된 값이다.** 승계 slug를 반환하면
// 원장이 엉뚱한 파일에 쌓여 UI10(동작 보존)이 깨진다 — 현 santa-loop.md Step 0도
// 불일치 시 경고만 찍고 *현 스코프로* 진행한다. `escalate_pending_decision_id`는
// **비교 대상일 뿐 대체값이 아니다**.
function resolveDecisionId(opts) {
  opts = opts || {};
  const decisionId = (typeof opts.decisionOverride === 'string' && opts.decisionOverride !== '')
    ? deriveSantaDecisionId({ decision: opts.decisionOverride }, opts)
    : deriveSantaDecisionId(opts.args || {}, opts);

  const state = readEscalationState(opts);
  if (!state.pending) {
    return { decisionId: decisionId, escalation: 'none', warning: null };
  }
  if (state.decisionId && state.decisionId !== decisionId) {
    return {
      decisionId: decisionId,
      escalation: 'drift',
      warning: 'fingerprint drift — STATE points at ' + state.decisionId +
        ', but reviewing ' + decisionId,
    };
  }
  return { decisionId: decisionId, escalation: 'aligned', warning: null };
}

function readEscalationState(opts) {
  let statePath;
  try {
    const dir = opts.stateDir || path.join(repoRootOf(opts), '.claude', 'state');
    statePath = path.join(dir, 'STATE.md');
  } catch (_err) {
    return { pending: false, decisionId: null };
  }
  let raw;
  try { raw = fs.readFileSync(statePath, 'utf8'); } catch (_err) {
    return { pending: false, decisionId: null };
  }
  let pending = false;
  let id = null;
  for (const line of raw.split(/\r?\n/)) {
    const m1 = /^escalate_pending:\s*(\S+)/.exec(line);
    if (m1) pending = m1[1] === 'true';
    const m2 = /^escalate_pending_decision_id:\s*(\S+)/.exec(line);
    if (m2) id = m2[1];
  }
  return { pending: pending, decisionId: id };
}

// ── 경로 ─────────────────────────────────────────────────────────────────────

// canonicalPath — containment 비교 **전에** 양쪽 철자를 하나로 맞춘다.
//
// 구현 중 실측한 이식성 결함이다. Windows에서 같은 디렉토리가 두 철자를 갖는다:
// `git rev-parse --show-toplevel`은 긴 이름을 돌려주는데(`C:/Users/Administrator/…`)
// 호출자가 준 경로는 8.3 단축명일 수 있고(`C:\Users\ADMINI~1\…`),
// **`fs.realpathSync`는 단축명을 확장하지 않는다** — 준 철자를 그대로 보존한다.
// 그러면 `assertContained`의 prefix 비교가 실패해 **정상 호출이 traversal로
// 오판**된다(실측: `path escapes gate dir (receipt=…ADMINI~1…, gate=…Administrator…)`).
//
// `fs.realpathSync.native`는 `GetFinalPathNameByHandle`을 써서 단축명을 긴
// 이름으로 편다(실측 확인). 그래서 양쪽을 이것으로 통과시킨 뒤 비교한다.
// symlink 해소는 그대로 일어나므로 방어가 약해지지 않는다.
//
// 실패(경로 미존재 등)는 원본을 그대로 돌려준다 — 그러면 `assertContained`가
// 평소대로 `PATH_ESCAPES_GATE`를 던진다(fail-closed 유지).
//
// 공유 모듈 `path-containment.js`를 고치는 것이 더 근본적이지만 그 파일은
// pr-phase-lock·quarantine migration과 공유하는 표면이라 M1이 건드릴 범위가
// 아니다(DD7의 "신규 lock 코드 0줄"과 같은 이유). santa 소유 범위에서만 맞춘다.
function canonicalPath(p) {
  try { return fs.realpathSync.native(p); } catch (_err) { return p; }
}

function repoRootOf(opts) {
  const root = gitRepoRoot(opts && opts.cwd ? opts.cwd : process.cwd());
  if (!root) {
    throw new SantaLedgerError('SANTA_NO_REPO_ROOT',
      'could not resolve a git repo root; santa ledger paths are anchored to it ' +
      '(cwd-relative anchoring would split one review scope across two files ' +
      'and halve the cap).');
  }
  return root;
}

// resolveStatePath(opts) — 3단 fallback. 3번째 단은 `process.cwd()`가 아니라
// **git repo root**다(DD3): 하위 디렉토리에서 호출해도 같은 원장을 봐야 하고,
// cwd 기준이면 같은 스코프가 두 파일로 갈려 캡이 반으로 쪼개진다.
function resolveStatePath(opts) {
  opts = opts || {};
  if (opts.statePath) return opts.statePath;               // 프로그래매틱 전용
  const slug = opts.decisionId || DEFAULT_DECISION_ID;
  if (opts.stateDir) return path.join(opts.stateDir, slug + '.json');  // 프로그래매틱 전용
  return path.join(repoRootOf(opts), '.claude', 'state', 'santa-loop', slug + '.json');
}

// 상태 **디렉토리**를 만들고 봉인한다 — 파일이 아니라 디렉토리인 것이 본질이다.
// `assertContained`는 첫 인자에 `fs.realpathSync`를 걸므로(path-containment.js:31)
// **대상이 실재하지 않으면 throw**한다. 최초 실행에는 상태 파일이 아직 없으니
// 파일 경로를 넘기면 정상 경로가 traversal로 오판돼 캡이 아예 못 돈다.
// 디렉토리는 mkdir 직후 실재하므로 realpath가 성립하고, symlink로 디렉토리를
// repo 밖으로 빼돌린 경우까지 잡힌다. 파일명은 `slug + '.json'`이고 SLUG_RE가
// `.`·`/`를 배제하므로 디렉토리가 봉인되면 파일도 봉인된다.
//
// **3번째 인자는 반드시 `null`이다** (DD3 / R6 Codex F0 / security S1).
// 그 인자는 generic repo-root 검사가 아니라 `expectedParentDir ⊂ .claude/receipts`를
// 강제하는 **receipt 전용** 검사다(path-containment.js:50-65). 산타 원장은
// `.claude/state` 아래라 receipts 밖이므로 `repoRoot`를 넘기면
// `gate dir escapes receipts root`로 **모든 정상 호출이 죽는다**.
// 선례: pr-phase-lock.js:466도 `.claude/state`에 쓰면서 `null`을 명시한다.
function ensureStateDir(statePath, opts) {
  const dir = path.dirname(statePath);
  fs.mkdirSync(dir, { recursive: true });

  // 프로그래매틱 주입(statePath/stateDir)은 CLI 표면이 없으므로 containment를
  // 걸지 않는다 — tmpdir을 쓰는 test가 유일 호출자다. CLI 경로(3번째 단)는
  // 언제나 아래를 통과한다.
  if (opts && (opts.statePath || opts.stateDir)) return dir;

  assertContained(canonicalPath(dir),
    canonicalPath(path.join(repoRootOf(opts), '.claude', 'state')), null);
  return dir;
}

// ── 파일 mode (DD7 / R6 Codex F1) ────────────────────────────────────────────
//
// `evidence-lock#writeFileAtomic`은 tmp를 mode 인자 **없이** 만들고 rename하므로
// (evidence-lock.js:241) 결과 파일은 umask 기본값(보통 0o644)이다. DD2의 0o600을
// evidence-lock에 기대면 그 주장이 거짓이 된다 — 그래서 여기서 자기 책임으로 건다.
//
// 창은 두 단계로 좁힌다. (1) run 내부의 write→chmod 사이는 **남는다**(좁히되
// 없애지 못한다). (2) run 사이 — rename 직후 프로세스가 죽어 완화된 mode가 남는
// 경우 — 는 모든 진입점의 self-repair로 "영구"가 아니라 "다음 접근까지"가 된다.
// 근본 수정(`writeFileAtomic`에 mode 옵션)은 receipt write를 공유하는
// evidence-critical 모듈 변경이라 M1 범위 밖이고 backlog에 있다.
function chmodState(statePath) {
  if (IS_WINDOWS) return;                       // POSIX mode는 사실상 무력
  try { fs.chmodSync(statePath, STATE_MODE); } catch (_err) { /* best-effort */ }
}

function repairModeIfNeeded(statePath) {
  if (IS_WINDOWS) return;
  let st;
  try { st = fs.statSync(statePath); } catch (_err) { return; }   // 부재는 정상
  if ((st.mode & 0o777) === STATE_MODE) return;
  try {
    fs.chmodSync(statePath, STATE_MODE);
    warn('repaired state file mode to 0600 (was ' +
      (st.mode & 0o777).toString(8) + ') at ' + statePath);
  } catch (_err) { /* best-effort */ }
}

// ── 읽기 ─────────────────────────────────────────────────────────────────────

function emptyState(decisionId, cap) {
  return {
    schema_version: SCHEMA_VERSION,
    decision_id: decisionId || DEFAULT_DECISION_ID,
    cap: Number.isInteger(cap) ? cap : null,
    rounds: [],
    entries: [],          // P1 소유 — P0는 만들기만 하고 손대지 않는다
    // `beginRound`가 거부된 시점에만 `{reason, at, rounds}`로 채워진다. null은
    // "거부가 관측된 적 없음"이며, 이 필드가 아예 없는 legacy 원장도 같게 읽힌다
    // (`parseState`는 요구하지 않는다 — additive라 schema_version은 1 유지).
    //
    // `rounds`는 **거부를 관측한 시점의 라운드 수**다. 마커를 그 수에 결속하지
    // 않으면 "언젠가 거부가 있었다"만 남아, 이후 캡이 상향돼 라운드가 더 열려도
    // 마커가 그대로 종료를 주장한다. 마커는 상태의 스냅샷이지 영구 낙인이 아니다.
    terminated: null,
  };
}

// **파싱 실패와 schema_version 불일치는 throw다** (DD2). 여기서 `rounds:[]`로
// 폴백하면 손상된 파일 하나가 캡을 0으로 리셋해 라운드가 무제한이 된다 —
// 캡이 틀릴 수 있는 유일하게 허용 안 되는 방향이다. 부재만 최초 실행이다.
function parseState(raw, decisionId, cap, statePath) {
  if (raw === null || raw === undefined) return emptyState(decisionId, cap);
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (err) {
    throw new SantaLedgerError('SANTA_LEDGER_CORRUPT',
      'santa ledger is not valid JSON at ' + statePath + ': ' + err.message +
      '\n  Refusing to continue: falling back to an empty ledger would reset the ' +
      'round cap to 0 and make the loop unbounded.');
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new SantaLedgerError('SANTA_LEDGER_CORRUPT',
      'santa ledger is not a JSON object at ' + statePath);
  }
  if (obj.schema_version !== SCHEMA_VERSION) {
    throw new SantaLedgerError('SANTA_LEDGER_CORRUPT',
      'santa ledger schema_version mismatch at ' + statePath +
      ' (found ' + JSON.stringify(obj.schema_version) + ', expected ' + SCHEMA_VERSION + ')');
  }
  if (!Array.isArray(obj.rounds)) {
    throw new SantaLedgerError('SANTA_LEDGER_CORRUPT',
      'santa ledger `rounds` is not an array at ' + statePath);
  }
  if (!Array.isArray(obj.entries)) obj.entries = [];
  assertTerminationMarker(obj, statePath);
  if (obj.terminated === undefined) obj.terminated = null;
  return obj;
}

// 종료 마커도 `rounds`/`entries`와 같은 계층에서 검증한다. 이것이 없으면 손상된
// 마커가 `aggregateFrom` → receipt write까지 흘러가 **receipt 스키마**가 거부하고
// (`SCHEMA_INVALID`), 운영자가 받는 진단이 원장 손상이 아니라 receipt 문제를
// 가리킨다. fail-closed 방향은 같지만 진단이 틀리면 복구가 엉뚱한 곳을 판다.
function assertTerminationMarker(obj, statePath) {
  const t = obj.terminated;
  if (t === null || t === undefined) return;
  // santa-adjudication M3 — 읽기 쪽 열거는 `TERMINATION_REASONS` 멤버십이다. 쓰기와
  // 같은 집합을 보지 않으면 `patch_chasing` 마커가 쓰인 원장이 다음 read에서
  // 통째로 거부된다(그 상수의 주석이 근거를 갖는다). 나머지 검사는 무변경이다.
  const ok = !!t && typeof t === 'object' && !Array.isArray(t) &&
    TERMINATION_REASONS.indexOf(t.reason) !== -1 &&
    typeof t.at === 'string' && !Number.isNaN(Date.parse(t.at)) &&
    Number.isInteger(t.rounds) && t.rounds >= 0;
  if (!ok) {
    throw new SantaLedgerError('SANTA_LEDGER_CORRUPT',
      'santa ledger `terminated` marker is malformed at ' + statePath +
      ' (found ' + JSON.stringify(t) + '; expected null or ' +
      '{reason:"' + TERMINATION_REASONS.join('"|"') + '", at:<ISO>, rounds:<int>})');
  }
}

// read(opts) — lock 없는 순수 read. 부재는 빈 상태, 손상은 throw.
function read(opts) {
  opts = opts || {};
  const statePath = resolveStatePath(opts);
  repairModeIfNeeded(statePath);
  let raw = null;
  try { raw = fs.readFileSync(statePath, 'utf8'); } catch (_err) { raw = null; }
  return parseState(raw, opts.decisionId, opts.cap, statePath);
}

function serialize(state) {
  return JSON.stringify(state, null, 2) + '\n';
}

// mutation 공통 — guardedReadModifyWrite 안에서 read·판정·write가 전부 일어난다.
// read를 임계구역 **밖**에 두면 lost update가 닫히지 않는다(DD7). 여기서
// last-writer-wins가 나면 라운드가 **적게** 세어져 캡이 fail-open된다.
function mutate(opts, fn) {
  const statePath = resolveStatePath(opts);
  ensureStateDir(statePath, opts);
  repairModeIfNeeded(statePath);

  let outcome = null;
  guardedReadModifyWrite(statePath, function (currentRaw) {
    const state = parseState(currentRaw, opts.decisionId, opts.cap, statePath);
    const r = fn(state);
    outcome = r.outcome;
    if (!r.write) return null;                 // null → write skip (lock은 정상 해제)
    return serialize(r.state || state);
  }, {
    env: opts.env,
    // **`mode: 'enforce'`는 상속된 env를 의도적으로 무시한다** (R2 Codex F1 흡수).
    //
    // `runGuarded`는 `opts.mode || parseGuardMode(opts.env)`로 모드를 정하므로,
    // 이것을 넘기지 않으면 `MCCP_EVIDENCE_CONFLICT_GUARD=off`가 상속되는 것만으로
    // 원장이 **lock 없이** read-modify-write된다(evidence-lock.js:330-343). `warn`도
    // 획득 실패 시 lock 없이 진행한다(:357-361). 그러면 동시 `begin-round` 둘이
    // 같은 pre-state를 읽고 각자 허가를 받은 뒤 write가 하나로 붕괴해 —
    // **리뷰어는 두 번 도는데 `rounds.length`는 하나만 는다.** 캡이 fail-open된다.
    //
    // 그 kill switch는 receipt 계층을 위한 것이고, 여기서는 M1이 **유일하게
    // 주장하는 불변식**을 env 하나로 무력화한다. 그래서 santa 원장은 그것을
    // 존중하지 않는다 — 판정을 잃느니 라운드를 못 여는 쪽이 안전한 방향이고,
    // 그것이 DD7이 "실패 정책은 fail-closed"라고 적을 때 의도한 바다.
    // 공유 모듈은 무변경이다: 호출 방식만 고정한다.
    mode: 'enforce',
  });

  chmodState(statePath);
  return outcome;
}

// ── mutation 3종 ─────────────────────────────────────────────────────────────

// beginRound — **멱등이다** (DD12 규칙 0).
//
// 마지막 라운드가 OPEN이면 새 라운드를 append하지 않고 그 index를 그대로
// 반환한다. 새 라운드는 마지막이 FINAL일 때(또는 라운드가 없을 때)만 열린다.
// 이것이 없으면 stdout 유실 후 재시도 · 산문의 중복 호출 · 동시 호출이 각각
// 새 OPEN 라운드를 쌓아 **리뷰 없이 캡을 소진**한다.
//
// 판정이 lock **안에서** 일어나는 것이 본질이다 — 밖에서 검사하면 동시 호출
// 두 개가 나란히 통과한다.
function beginRound(opts) {
  const counter = require('./counter');
  const cap = Number.isInteger(opts.cap) ? opts.cap : counter.parseCap(opts.env || process.env);

  return mutate(Object.assign({}, opts, { cap: cap }), function (state) {
    state.decision_id = opts.decisionId || state.decision_id || DEFAULT_DECISION_ID;

    // **`state.cap`은 라운드가 실제로 열릴 때만 갱신한다** (아래 허용 분기).
    // 거부 분기가 마커를 쓰기 시작하면서 여기 두면 env가 원장을 덮어쓴다 —
    // 다른 세션이 낮은 `MCCP_SANTA_ROUND_CAP`으로 진입해 거부만 받아도 원장의
    // cap이 그 값으로 바뀌고, 봉인이 `santa_cap`에 **라운드를 게이트한 적 없는
    // 값**을 싣는다(seal.js 머리말이 막는다고 적은 오기와 같은 것). 거부는 항상
    // 라운드 1건 이상 뒤에 오므로 그 시점 cap은 이미 기록돼 있다.
    const last = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1] : null;
    if (last && last.verdict === null) {
      // OPEN — 멱등 반환. append 없음, 캡 소모 없음.
      return {
        write: false,
        outcome: { allowed: true, roundIndex: last.index, exitReason: null, reopened: true },
      };
    }

    const decision = counter.decideRound({ roundsSoFar: state.rounds.length, cap: cap });
    if (!decision.allowed) {
      // 거부는 **관측된 사건**이므로 원장에 남긴다. 이전에는 남기지 않고 소비자가
      // `rounds.length >= cap` 산술로 되짚었는데, 그 술어는 캡 *도달*(마지막 허용
      // 라운드가 열린 상태)과 다음 begin-round의 *거부*를 구분하지 못한다. 그래서
      // 마지막 허용 라운드가 NICE로 수렴한 run까지 `cap_reached`로 읽혀 divergent로
      // 오봉인됐다. 마커만이 그 둘을 가른다 — seal.js의 층 매핑 주석이 이미
      // `cap_reached`를 "begin-round가 거부"로 정의하고 있으므로, 이 변경은 파생을
      // 그 문언에 맞추는 것이다.
      //
      // 마커는 **관측 시점의 라운드 수에 결속된다**. 그러지 않으면 "언젠가 거부가
      // 있었다"만 남아, 캡이 상향돼 라운드가 더 열린 뒤에도 마커가 종료를 계속
      // 주장한다(허용 분기의 clear와 이 결속이 같은 구멍을 양쪽에서 막는다).
      const already = !!(state.terminated &&
        state.terminated.reason === decision.exitReason &&
        state.terminated.rounds === state.rounds.length);
      if (!already) {
        state.terminated = {
          reason: decision.exitReason,
          at: new Date().toISOString(),
          rounds: state.rounds.length,
        };
      }
      return {
        // 멱등이다. 이미 같은 사유로 종료된 원장을 재기록하면 `at`이 호출마다 밀려
        // **최초 거부 시각**이라는 감사값이 사라진다. beginRound는 프로즈가 여러 번
        // 부를 수 있으므로(멱등 계약) 이 방향의 보호가 필요하다.
        write: !already,
        state: state,
        outcome: { allowed: false, roundIndex: null, exitReason: decision.exitReason },
      };
    }

    // 라운드가 열렸다 = 이전 거부는 더 이상 이 원장의 종료가 아니다. 캡을 상향해
    // 루프를 재개하는 것은 문서화된 운영 경로(`MCCP_SANTA_ROUND_CAP` 1..10)이고,
    // 마커를 그대로 두면 그 뒤의 수렴까지 종료로 읽혀 divergent로 봉인된다.
    state.cap = cap;
    state.terminated = null;
    state.rounds.push({
      index: decision.roundIndex,
      started_at: new Date().toISOString(),
      reviewers: [],
      verdict: null,
    });
    return {
      write: true,
      state: state,
      outcome: { allowed: true, roundIndex: decision.roundIndex, exitReason: null, reopened: false },
    };
  });
}

// **열리지 않은 라운드는 거부한다** (DD11) — 캡을 지시가 아니라 **능력**으로
// 강제하는 지점이다. 산문이 `begin-round`의 비영점 exit을 무시하고 리뷰어를
// 띄우더라도 그 출력은 원장에 **들어갈 수 없고** verdict도 나오지 않는다.
// 라운드는 진행되지 못하고 루프는 캡에서 실제로 멈춘다.
//
// **판정 lifecycle 검사는 넣지 않는다** — `{A,B}` 완전성 · `id` 중복 ·
// verdict 1회 · `record`는 OPEN에서만, 넷 다 P1 소유다(DD12 / UI10·UI11).
// 그 결과 `record --id A`를 두 번 넣는 dual-review 우회 경로가 열린 채 남으며,
// 그것은 P1의 1순위 항목으로 backlog에 있다.
function assertRoundOpened(state, round, statePathHint) {
  if (!Number.isInteger(round) || round < 0 || round >= state.rounds.length) {
    throw new SantaLedgerError('SANTA_ROUND_NOT_OPEN',
      'round ' + round + ' was never opened by begin-round (ledger has ' +
      state.rounds.length + ' round(s))' + (statePathHint ? ' at ' + statePathHint : '') +
      '.\n  The ledger only accepts writes for rounds begin-round opened. If the cap ' +
      'refused this round, that refusal is final — reviewer output cannot be recorded.');
  }
}

function recordReviewer(round, envelope, raw, opts) {
  return mutate(opts, function (state) {
    assertRoundOpened(state, round);
    const r = state.rounds[round];
    r.reviewers.push({ envelope: envelope, raw: raw === undefined ? null : raw });
    return {
      write: true,
      state: state,
      outcome: { recorded: true, round: round, id: envelope.id, reviewersInRound: r.reviewers.length },
    };
  });
}

function recordVerdict(round, verdict, opts) {
  return mutate(opts, function (state) {
    assertRoundOpened(state, round);
    state.rounds[round].verdict = verdict;
    return {
      write: true,
      state: state,
      outcome: { round: round, verdict: verdict },
    };
  });
}

// terminate({reason}, opts) — santa-adjudication M3 신규 export (프로토콜 2 — 추가는
// 동결 위반이 아니다. 기존 8종은 한 글자도 바뀌지 않는다).
//
// **종료의 소재는 `state.terminated` 마커 하나다**(DD1). 두 번째 채널을 만들면
// 소비자(`seal`·리포트·receipt·`status`)마다 어느 쪽을 볼지 골라야 하고, 고르는
// 순간 갈린다. 그래서 `patch_chasing`은 같은 마커에 다른 reason으로 들어가고
// **결속 규칙도 멱등 규칙도 `beginRound` 거부 분기에서 그대로 상속한다**.
//
// `state.cap`은 건드리지 않는다 — 거부 분기와 같은 이유다(캡을 게이트한 적 없는
// 값이 봉인에 실리는 것을 막는다).
//
// 열거 검사가 `mutate` **밖**인 것이 의도다: 불량 reason에 lock을 잡을 이유가 없다.
function terminate(input, opts) {
  const reason = (input !== null && typeof input === 'object' && typeof input.reason === 'string')
    ? input.reason : null;
  if (TERMINATION_REASONS.indexOf(reason) === -1) {
    throw new SantaLedgerError('SANTA_TERMINATION_INVALID',
      'termination reason must be one of [' + TERMINATION_REASONS.join('|') + ']; got ' +
      JSON.stringify(reason) + '. Nothing was written and no lock was taken.');
  }
  return mutate(opts || {}, function (state) {
    const t = state.terminated;
    // **먼저 관측된 종료가 실제 종료다.** 이미 이 라운드 수에 결속된 마커가 있으면
    // reason이 같든 다르든 덮어쓰지 않는다 — 같으면 멱등(재기록하면 `at`이 호출마다
    // 밀려 **최초 종료 시각**이라는 감사값이 사라진다)이고, 다르면 나중 판정이 앞선
    // 관측을 지우는 것이라 종료 사유가 거짓이 된다.
    if (t && t.rounds === state.rounds.length) {
      return {
        write: false,
        outcome: {
          terminated: false, reason: t.reason, rounds: t.rounds, at: t.at, already: true,
        },
      };
    }
    const at = new Date().toISOString();
    state.terminated = { reason: reason, at: at, rounds: state.rounds.length };
    return {
      write: true,
      state: state,
      outcome: {
        terminated: true, reason: reason, rounds: state.rounds.length, at: at, already: false,
      },
    };
  });
}

// appendEntry — **P1 소유 자리**. finding row 스키마는 P1이 정의하고 P0는
// 시그니처만 동결한다. P0의 CLI에는 이 subcommand가 없다(호출자 0).
function appendEntry(entry, opts) {
  return mutate(opts, function (state) {
    state.entries.push(entry);
    return { write: true, state: state, outcome: { entries: state.entries.length } };
  });
}

// ── 읽기 파생 ────────────────────────────────────────────────────────────────

// readReviewers(round) → envelope 배열. `raw`는 전달하지 않는다 — gate는
// envelope만 본다(DD9). 미개설 라운드는 여기서도 거부다(DD11).
// santa-loop-materialize M2 (Implement-Codex R1 F1) — 이미 읽은 state에서
// 파생하는 **순수** 함수. `readReviewers`/`aggregate`는 각자 자기 `read()`를
// 호출하므로, 봉인처럼 여러 값을 함께 봐야 하는 소비자가 그것들을 나란히 부르면
// 원장을 N+2회 읽게 되고 읽기에는 lock이 없다. 그 사이 다른 CLI 호출이 mutate하면
// 라운드 메타·리뷰어·집계가 **동시에 존재한 적 없는** 조합이 되어, 감사 앵커가
// 실재하지 않은 상태를 영구 봉인한다.
//
// 그래서 소비자는 `read()`를 한 번만 부르고 아래 두 함수로 전부 파생한다.
// raw 소거가 여전히 ledger 모듈 안에서 일어나므로 UI4의 이중 방어도 보존된다.
// 기존 두 함수는 이것들에 위임만 하므로 시그니처·동작 무변경이다(M1 동결 준수).
function reviewersFrom(state, round, statePathHint) {
  assertRoundOpened(state, round, statePathHint);
  return state.rounds[round].reviewers.map(function (r) { return r.envelope; });
}

function readReviewers(round, opts) {
  return reviewersFrom(read(opts), round, resolveStatePath(opts));
}

// aggregate() → { rounds, entries, exitReason } — **집계값만**(UI9).
// 원장 본문은 gitignored로 두고 M2가 이 세 값을 receipt에 봉인한다.
//
// `exitReason`은 `beginRound`가 거부 시점에 남긴 termination 마커에서만 나온다.
// 산술(`rounds.length >= cap`)로 되짚지 않는 이유는 그것이 캡 *도달*과 *거부*를
// 뭉개기 때문이다 — 마지막 허용 라운드가 NICE로 끝난 run도 도달 조건은 만족한다.
// 마커 부재는 "거부가 관측된 적 없음"이고, 그것이 legacy 원장의 정직한 읽기다.
// 그 완화로 구멍이 생기지 않는다: 진짜 캡 소진은 반드시 non-NICE 최종 라운드로
// 끝나므로 `seal.js#deriveVerdict`의 `fin.verdict !== 'NICE'` 절이 이미 잡는다.
//
// **마커는 관측 시점의 라운드 수에 결속돼야만 유효하다.** 결속을 검사하지 않으면
// 마커가 "언젠가 거부가 있었다"는 영구 낙인이 되어, 이후 캡 상향으로 라운드가 더
// 열리고 수렴해도 종료를 계속 주장한다 — 산술 파생이 만들던 오봉인을 마커로
// 재현하는 것이다. `beginRound`가 라운드를 열 때 마커를 지우므로 정상 경로에서는
// 어긋날 일이 없고, 이 검사는 손으로 편집된 원장에 대한 2차 방어다.
//
// `cap`은 M1 동결 시그니처(docs/santa-loop/ownership.md)를 지키기 위해 남긴
// 잔존 인자다 — 마커 기반 파생에는 쓰이지 않는다. 제거는 인터페이스 변경이라
// UI7대로 P0 재개 사안이다.
function aggregateFrom(state, cap) {
  const t = state.terminated;
  const bound = !!t && typeof t.reason === 'string' && t.rounds === state.rounds.length;
  return {
    rounds: state.rounds.length,
    entries: state.entries.length,
    exitReason: bound ? t.reason : null,
  };
}

function aggregate(opts) {
  opts = opts || {};
  const counter = require('./counter');
  const state = read(opts);
  const cap = Number.isInteger(opts.cap) ? opts.cap : counter.parseCap(opts.env || process.env);
  return aggregateFrom(state, cap);
}

module.exports = {
  deriveSantaDecisionId: deriveSantaDecisionId,
  resolveDecisionId: resolveDecisionId,
  resolveStatePath: resolveStatePath,
  canonicalPath: canonicalPath,
  read: read,
  beginRound: beginRound,
  recordReviewer: recordReviewer,
  recordVerdict: recordVerdict,
  readReviewers: readReviewers,
  appendEntry: appendEntry,
  // M3 — patch-chasing 종료 마커 writer (프로토콜 2 추가 기록). 짝이 되는
  // `clearTermination`은 **없다**: `beginRound`의 허용 분기가 이미
  // `state.terminated = null`을 수행하므로 재개 경로에 새 코드가 필요 없다.
  terminate: terminate,
  aggregate: aggregate,
  // M2 — 단일 스냅샷 파생용 순수 함수 2종 (additive; 위 두 함수가 이것에 위임한다)
  reviewersFrom: reviewersFrom,
  aggregateFrom: aggregateFrom,
  SantaLedgerError: SantaLedgerError,
  SCHEMA_VERSION: SCHEMA_VERSION,
  TERMINATION_REASONS: TERMINATION_REASONS,
  STATE_MODE: STATE_MODE,
  DEFAULT_DECISION_ID: DEFAULT_DECISION_ID,
};
