'use strict';

// M2 관측 계측 — sidecar append-only event log writer.
//
// 세션 시작/종료 이벤트를 `.claude/state/msw-events/<session_id>.jsonl`에
// 원자적으로 append한다. session-ledger 스키마 확장 불가(strict unknown-key
// validator)이므로 sidecar 로그로 M2 고유 필드를 기록. Per-session 샤딩은
// same-file 동시쓰기를 최소화.
//
// Patterns (hook-trace.js 거울):
//   - O_APPEND one-buffer append (fs.appendFileSync)
//   - bounded allowlist schema (고정 필드만 permit)
//   - per-field char cap 256 (FIELD_MAX_CHARS)
//   - per-line size cap (초과 시 truncate+flag)
//   - retention: per-file byte cap + global GC
//   - malformed 격리: per-line skip (세션 지표 오염 방지)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EVENTS_DIRNAME = path.join('.claude', 'state', 'msw-events');
const FIELD_MAX_CHARS = 256;
const MAX_LINE_BYTES = 8192;
const PER_FILE_MAX_BYTES = 256 * 1024; // 256KB per session file
const GLOBAL_MAX_BYTES = 100 * 1024 * 1024; // 100MB total

// sessionId는 `<session_id>.jsonl` 파일명이 되므로 **파일명 성분 검증**이
// 필요하다. 타입 검사만으로는 `'../../evil'`이 통과해 이벤트 디렉토리를
// 탈출한다 — 지금까지 호출자들이 sanitize된 값을 넘겨 안전했을 뿐이고,
// M8이 새 producer(Task 3 착수 emit · Task 4 CLI emit)를 더하며 그중 하나는
// **미sanitize raw 세션 id**(`session-identity.resolveRawSessionId`)에 닿는다.
// 그래서 검증을 모든 producer가 지나는 초크 포인트에 둔다.
//
// 허용 문자는 `utils.sanitizeSessionId`의 산출 집합(`[A-Za-z0-9_-]`)과 같다 —
// 좁히면 정상 세션 id가 거절되어 fail-open 호출자에게 조용한 미계상이 되고,
// 그것은 이 milestone이 없애려는 실패 양상 자체다. `.` `/` `\` `:`는 배제된다.
//
// **길이 상한은 의도적으로 sanitize보다 좁다** (local review L1). `sanitizeSessionId`
// 에는 길이 제한이 없어 128자를 넘는 `MCCP_SESSION_ID`를 그대로 통과시키지만, 이
// 값은 `<sid>.jsonl` 파일명이 되므로 파일시스템 상한(NAME_MAX 255)에 여유를 두고
// 잘라야 한다. 초과 입력은 **거절**이지 절삭이 아니다 — 절삭하면 서로 다른 두
// 세션이 같은 파일로 붕괴해 이벤트가 섞이고, 그 오염은 미계상보다 나쁘다.
// 호출자는 전부 fail-open + loud stderr이므로 거절은 시끄럽게 보인다.
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

// allowlist — 이 필드들만 기록 가능.
//
// M3 추가분(work_unit ~ event_id)은 **추가만**이다: 기존 필드 · cap ·
// malformed 격리 계약은 불변이라 M2 하위 표면이 회귀하지 않는다.
//
// 왜 allowlist 확장이 감사와 같은 Task에 묶여야 하는가: `eventToJsonLine`은
// allowlist에 없는 키를 **조용히 버린다**. pre/post hash를 emit해도 여기 없으면
// 디스크에 남지 않고, B2 런타임 감사는 영원히 대조할 값을 못 찾는다.
const ALLOWED_FIELDS = new Set([
  'kind',
  'ts',
  'session_id',
  'created_at',
  'ended_at',
  'task_slug',
  'task_completed',
  'context_remaining_pct',
  'producer',
  // multi-session-work-loop M3 — 증거 충돌 taxonomy
  'work_unit',       // = decision slug (점유 키)
  'conflict_kind',   // 사고/차단의 구체 형태
  'holder_session',  // 충돌 상대 또는 기록 주체
  'pre_hash',        // 변형 **전** receipt_hash (감사 상관의 좌변)
  'post_hash',       // 변형 **후** receipt_hash (사후조작만으로는 통과 못 하게)
  'claim_epoch',     // fence 바인딩
  'target',          // repo-relative receipt 경로 (건별 상관의 키)
  'event_id',        // 안정적 dedupe 키 (Implement-Codex R1 F6)
  // multi-session-work-loop M8 — A1 완주 · C2/C3 귀속
  //
  // 같은 규약이다: 여기 없는 키는 `eventToJsonLine`이 **조용히 버리므로**, emit
  // 지점을 배선하기 **전에** 이 집합을 넓혀야 한다. 넓히지 않으면 producer는
  // 도는데 디스크에는 남지 않고, 집계는 영원히 0을 보고한다.
  'pr_number',         // 완주를 증명하는 PR 번호 (A1 분자 — DD4)
  'gate_decision_id',  // finding을 낳은 차단 판정 (C2/C3 귀속 삼각의 좌변 — DD8)
  // local review H3 — 삼각의 **가운데**. 이것이 없으면 `remediation_pr` 레코드는
  // 어떤 finding에도 결속되지 않고, `derive/sources/findings.js`는 distinct
  // finding_id로 세므로 `with_remediation_pr`이 구조적으로 0에 머문다. writer는
  // 쓰는데 reader가 읽을 수 없는 상태가 정확히 이 milestone이 갚는 부채다.
  'finding_id',        // 해소된 finding의 registry id (C2/C3 조인 키)
  // orchestrator-step-wiring M1 (DD3) — A1 분모의 granularity 축.
  //
  // 값은 `prd` 또는 `milestone`. producer가 emit 시점에 인자에서 판정하고 reader가
  // `prd`를 분모에서 뺀다. **필드 부재는 `milestone`이 아니라 unknown이다** —
  // 슬러그 이름으로 추론하면 조용한 오분류가 된다(DD3).
  'work_unit_kind',
]);

class MswEventsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// 주어진 디렉토리 크기를 바이트 단위로 계산
function computeDirSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of files) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          total += stat.size;
        } catch (_e) {
          // 파일 stat 실패는 무시
        }
      }
    }
  } catch (_e) {
    // 디렉토리 read 실패는 무시
  }
  return total;
}

// evictLRU: global cap 초과 시 오래된 session 파일 삭제
function evictLRU(dir) {
  if (!fs.existsSync(dir)) return;

  const currentBytes = computeDirSizeBytes(dir);
  if (currentBytes <= GLOBAL_MAX_BYTES) return;

  try {
    const files = fs.readdirSync(dir, { withFileTypes: true })
      .filter(f => f.isFile() && f.name.endsWith('.jsonl'))
      .map(f => {
        const fullPath = path.join(dir, f.name);
        const stat = fs.statSync(fullPath);
        return { name: f.name, path: fullPath, mtime: stat.mtimeMs };
      })
      .sort((a, b) => a.mtime - b.mtime); // 오래된 것부터

    let toDelete = Math.ceil(files.length * 0.2); // 20% 삭제
    for (const file of files.slice(0, toDelete)) {
      try {
        fs.unlinkSync(file.path);
      } catch (_e) {
        // 삭제 실패는 무시
      }
    }
  } catch (_e) {
    // evict 실패는 무시하고 진행
  }
}

// 필드값 validate + truncate
function sanitizeField(value, fieldName) {
  if (value === null || value === undefined) return null;

  // number/boolean은 타입을 보존한다 — String()으로 강제하면 task_completed:false가
  // "false"(truthy string)로, context_remaining_pct:85가 "85"로 영속돼 reader가
  // 타입을 오판한다. cap/개행 정규화는 문자열 필드에만 적용.
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  let str = String(value);
  if (str.length > FIELD_MAX_CHARS) {
    str = str.slice(0, FIELD_MAX_CHARS - 4) + '_...';
  }

  // 개행/특수문자 제거
  str = str.replace(/[\n\r\t]/g, ' ');
  return str;
}

// 이벤트 객체 → JSON 라인 직렬화
function eventToJsonLine(event) {
  const filtered = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in event) {
      filtered[key] = sanitizeField(event[key], key);
    }
  }

  const line = JSON.stringify(filtered) + '\n';
  const lineBytes = Buffer.byteLength(line, 'utf8');

  if (lineBytes > MAX_LINE_BYTES) {
    // 라인이 너무 크면 truncate + flag
    const truncated = { ...filtered, truncated: true };
    const newLine = JSON.stringify(truncated) + '\n';
    return newLine;
  }

  return line;
}

// 파일 크기 체크 + per-file cap 초과 시 rotation(현재는 skip, 향후 rotation 가능)
function checkFileSize(filePath) {
  if (!fs.existsSync(filePath)) return true; // OK

  try {
    const stat = fs.statSync(filePath);
    if (stat.size >= PER_FILE_MAX_BYTES) {
      // 향후: rotation 로직 추가 가능
      return false; // 다 참 — 크기 초과했지만 일단 append 시도(fail-open)
    }
  } catch (_e) {
    // stat 실패는 무시
  }
  return true;
}

// multi-session-work-loop M3 (CL-5) — writer↔reader 경로 정합.
//
// 기존 기본 경로는 **cwd 상대**(`EVENTS_DIRNAME`)인데 reader
// (`derive/sources/session-activity.js`)는 **repoRoot 고정**이었다. 두 hook
// caller 어느 쪽도 `opts.dir`을 넘기지 않았으므로 실제 기록 위치가 hook
// 프로세스의 `process.cwd()`에 종속됐고, 결과는 (a) 이벤트가 reader가 보지 않는
// 곳에 쌓여 조용히 0건이 되거나 (b) worktree가 여럿일 때 서로의 이벤트가 교차
// 계상되는 것이었다. 이 저장소에 worktree 3개가 동시에 살아 있으므로 (b)는
// 가설이 아니다. B2의 분모와 guard 커버리지가 전부 이 sidecar 위에 얹히므로
// M3의 헤드라인 acceptance가 여기에 직접 달려 있다.
//
// 해석 우선순위: opts.dir(테스트) > opts.repoRoot(명시) > cwd에서 위로 올라가며
// `.claude` 보유 디렉토리 탐색 > cwd 상대(레거시 fallback).
//
// walk-up을 쓰는 이유: `git rev-parse --show-toplevel` spawn은 append마다 ~44ms
// (실측)라 hot path에 부적합하다. statSync 몇 번이면 같은 답을 얻는다.
function discoverRepoRoot(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  for (let i = 0; i < 40; i++) {
    try {
      if (fs.statSync(path.join(dir, '.claude')).isDirectory()) return dir;
    } catch (_e) { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// orchestrator-step-wiring M1 — 집계 경계를 git common dir로 올린다 (DD1 · DD7 · DD8).
//
// 왜 순회가 아닌가: A1이 "어디서 돌려도 같은 값"이 되려면 producer가 worktree마다
// 다른 디렉토리에 쓰는 것을 멈춰야 한다. reader가 worktree를 순회하는 대안은
// `derive/sources/worktrees.js` 헤더가 `derive()`를 spawn-free로 못박고 git spawn을
// opt-in gate 뒤에 두므로 **기본 derive에서 꺼진 채**로 남는다.
//
// 공유되는 것은 **A1 축 세 kind뿐**이다(DD8). 나머지를 함께 올리면
// `session-activity.js:154`의 세션 맵이 kind 가드 없이 채워져 타 worktree 세션이
// 섞이고, B2의 worktree 격리(`msw-events-path.test.js:54`)와 A2의 "분모 = 관측된
// 세션 수" 계약이 동시에 깨진다.
const SHARED_SUBPATH = path.join('mccp', 'msw-events');
const A1_AXIS_KINDS = new Set(['task_started', 'task_completed', 'task_ship_sealed']);
const SHARED_EVENTS_TOGGLE = 'MCCP_MSW_EVENTS_SHARED';

// 프로세스당 1회 경고. append마다 내면 hook 출력이 노이즈가 되어, UI6가 요구한
// "조용하지 않다"가 역설적으로 "읽히지 않는다"가 된다.
const warnedOnce = new Set();
function warnOnce(key, line) {
  if (warnedOnce.has(key)) return;
  warnedOnce.add(key);
  process.stderr.write('[mccp:msw-events] ' + line + '\n');
}

// 토글 판정. **열거 밖 값은 off로 접는다.**
//
// 공유 파서(`env-contract/value.js`)의 기본 fold는 레지스트리 default(여기서는 on)
// 인데, 그 방향은 오타가 신규 producer 경로를 켠 채 남긴다. 이 저장소의 선례
// (§3.15 `MCCP_REVIEW_SINGLE_PASS`)는 반대 방향이므로 열거 검사를 앞에 둔다.
// **별칭 집합은 그 모듈에서 가져온다** — 리터럴을 여기서 다시 적으면 파싱 규약이
// 두 벌이 되고, 그것이 env-contract L9가 막는 것이다.
function sharedEventsEnabled(env) {
  const src = env || process.env;
  let value;
  try {
    value = require('../lib/env-contract/value');
  } catch (_e) {
    // 파서를 못 읽으면 오늘의 동작(worktree-local)으로 접는다. 관대한 방향으로
    // 실패하면 깨진 require가 조용한 경로 변경이 된다.
    warnOnce('toggle-load', 'env-contract/value unreadable — ' + SHARED_EVENTS_TOGGLE
      + ' folds OFF (worktree-local) for this process.');
    return false;
  }
  const raw = Object.prototype.hasOwnProperty.call(src, SHARED_EVENTS_TOGGLE)
    ? src[SHARED_EVENTS_TOGGLE]
    : undefined;
  if (raw !== undefined && raw !== null && String(raw) !== '') {
    const v = String(raw).trim().toLowerCase();
    const known = value.TRUE_ALIASES.indexOf(v) !== -1 || value.FALSE_ALIASES.indexOf(v) !== -1;
    if (!known) {
      warnOnce('toggle-enum', SHARED_EVENTS_TOGGLE + ' is set to a value outside the'
        + ' enumeration — folding OFF (fail-closed). A typo must not leave the new'
        + ' producer path on.');
      return false;
    }
  }
  try {
    return value.parseBool(src, SHARED_EVENTS_TOGGLE);
  } catch (err) {
    warnOnce('toggle-parse', SHARED_EVENTS_TOGGLE + ' could not be parsed ('
      + ((err && err.message) || String(err)) + ') — folding OFF (worktree-local).');
    return false;
  }
}

// DD3 — 착수 이벤트의 granularity 판정. **인자 축**이지 명령 축이 아니다.
//
// 여기 사는 이유: `work_unit_kind`의 allowlist가 이 파일에 있고, 그 값의 정의역을
// 다른 파일이 소유하면 둘이 어긋날 수 있다. producer(`receipt-prompt.js`)는 hook
// 스크립트라 `module.exports`가 없어 test가 require할 수 없다 — 술어를 그쪽에 두면
// **반증 가능한 곳이 어디에도 없어진다**(L2 R1 test HIGH가 지적한 그 상태다).
//
// 규칙은 고정이다(L2 R1 security MEDIUM — 술어 미정의 흡수): 공백으로 나눈 토큰 중
// 하나라도 `.claude/prds/` 아래이거나 `.prd.md`로 끝나면 `prd`, 아니면 `milestone`.
// 슬러그 **이름**으로는 절대 추론하지 않는다 — milestone suffix 패턴은 휴리스틱이고
// PRD 파일명 대조는 이 milestone이 없애려는 worktree 경계 문제를 판정 기준에 다시
// 들인다(DD3).
//
// **인자 자체가 없으면 판정하지 않고 `null`을 낸다** (local review M1). 이 파일
// `:88`과 reader(`session-activity.js`)는 "열거 밖 값과 필드 부재는 같은 통
// (`unknown`)"을 규칙으로 세웠는데, 여기서 비문자열을 `milestone`으로 접으면
// producer가 **모르는 상태를 표현할 수단을 갖지 못한다** — hook payload에서
// `command_args`가 사라지는 날 전 착수가 근거 없이 `milestone`으로 봉인되고,
// 그것이 DD3가 금지한 조용한 오분류와 같은 형태다. `null`은 allowlist를 통과해
// 필드로 실리고 reader가 `unknown`으로 센다.
//
// 빈 문자열은 다르다: "인자가 있었고 그 안에 PRD 경로가 없었다"는 관측이므로
// `milestone`이 맞다.
const PRD_ARG_RE = /(^|[\\/])\.claude[\\/]prds[\\/]|\.prd\.md$/i;
function classifyWorkUnitKind(commandArgs) {
  if (typeof commandArgs !== 'string') return null;
  const tokens = commandArgs.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (PRD_ARG_RE.test(t)) return 'prd';
  }
  return 'milestone';
}

// 해소된 후보가 **git dir의 형태**인가 (security review S1 흡수).
//
// 리뷰어는 `path-containment.assertContained(root, common)`을 처방했으나 그 규칙은
// 이 축에서 **항상 거짓**이다: worktree의 common dir(`<repo>/.git`)은 worktree
// root(`<repo>/.worktrees/<name>`)의 하위가 아니다. 그것을 쓰면 공유 위치가 어떤
// worktree에서도 성립하지 않아 이 milestone이 통째로 무력화된다. 실제로 성립하는
// 불변식은 구조 검증이다 — `commondir`의 `../` 누적이 임의 디렉토리를 가리키면
// 그곳은 git dir의 형태를 갖지 않으므로 여기서 걸린다.
function looksLikeGitDir(dir) {
  try {
    if (!fs.statSync(path.join(dir, 'HEAD')).isFile()) return false;
  } catch (_e) {
    return false;
  }
  for (const marker of ['objects', 'refs']) {
    try {
      if (fs.statSync(path.join(dir, marker)).isDirectory()) return true;
    } catch (_e) { /* 다음 marker */ }
  }
  return false;
}

// `root/.git` **하나만** 본다. 부모로 올라가지 않는다.
//
// walk-up이 L2 R0의 security HIGH(조상 저장소의 git dir로 해소)와 test HIGH(repo
// 내부 fixture가 실 corpus를 끌어옴)의 공통 원인이었다. `.git`이 없으면 `null`이고
// 호출자는 worktree-local로 남는다 — 안전한 방향의 실패다.
//
// spawn 금지: `discoverRepoRoot`의 주석대로 `git rev-parse` spawn은 append마다
// ~44ms라 hot path에 부적합하다. 여기는 전부 `fs` 연산이다.
function commonDirOf(root) {
  if (!root) return null;
  const dotGit = path.join(root, '.git');
  let st;
  try {
    st = fs.statSync(dotGit);
  } catch (_e) {
    return null;
  }

  let candidate = null;
  if (st.isDirectory()) {
    candidate = dotGit;
  } else if (st.isFile()) {
    // security review S4 — 실 worktree의 `.git`은 `gitdir: <path>` + LF이고
    // `commondir`은 `../..` + LF이다. trim하지 않으면 개행이 경로 세그먼트가 되어
    // Windows가 거절하고, "판독 불가면 null"이라는 계약 대신 throw가 된다.
    let text;
    try {
      text = fs.readFileSync(dotGit, 'utf8');
    } catch (_e) {
      return null;
    }
    const m = /^\s*gitdir:\s*(.+)$/m.exec(text);
    if (!m) return null;
    const gitdir = path.resolve(root, m[1].trim());
    let commonText;
    try {
      commonText = fs.readFileSync(path.join(gitdir, 'commondir'), 'utf8');
    } catch (_e) {
      commonText = null;
    }
    candidate = commonText === null ? gitdir : path.resolve(gitdir, commonText.trim());
  } else {
    return null;
  }

  return looksLikeGitDir(candidate) ? candidate : null;
}

// 해소 결과 + 그것이 공유 위치인지. `appendEvent`의 evict 분기가 두 번째 값을 쓴다 —
// 경로 문자열을 다시 파싱해 추측하면 같은 판정이 두 벌이 된다.
function resolveEventsDirInfo(opts) {
  opts = opts || {};
  if (opts.dir) return { dir: opts.dir, shared: false };
  const root = opts.repoRoot || discoverRepoRoot(opts.cwd);
  if (!root) return { dir: EVENTS_DIRNAME, shared: false };   // 레거시 fallback (repo 밖)

  const local = path.join(root, EVENTS_DIRNAME);
  if (!A1_AXIS_KINDS.has(opts.kind)) return { dir: local, shared: false };
  if (!sharedEventsEnabled(opts.env)) return { dir: local, shared: false };

  const common = commonDirOf(root);
  if (common) return { dir: path.join(common, SHARED_SUBPATH), shared: true };

  // UI6 — 강등은 조용하지 않다. 이것은 이 milestone이 없애려는 상태로의 복귀다.
  // 절대경로를 흘리지 않도록 repo-relative로만 말한다(F9).
  warnOnce('shared-degraded', SHARED_EVENTS_TOGGLE + ' is on but this root has no'
    + ' resolvable git common dir (checked <root>/.git) — A1 events fall back to <root>/'
    + EVENTS_DIRNAME.split(path.sep).join('/')
    + '. Aggregation is worktree-local for this process.');
  return { dir: local, shared: false };
}

function resolveEventsDir(opts) {
  return resolveEventsDirInfo(opts).dir;
}

// 핵심: append 이벤트
function appendEvent(sessionId, event, opts) {
  opts = opts || {};
  if (!sessionId || typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
    throw new MswEventsError('invalid_session_id',
      'sessionId must be a non-empty filename-safe token matching ' + String(SESSION_ID_RE));
  }

  // 필드 검증: kind + ts는 필수
  if (!event.kind) {
    throw new MswEventsError('missing_kind', 'event.kind required');
  }
  if (!event.ts) {
    event.ts = new Date().toISOString();
  }
  event.session_id = sessionId;
  // 안정적 dedupe 키(Implement-Codex R1 F6). back-compat 이중 스캔이 구·신
  // 위치를 모두 읽어야 하는데, 본문 전체로 dedupe하면 필드가 우연히 같은
  // **별개 이벤트가 붕괴**한다. append 시점에 id를 부여해 그 모호성을 없앤다.
  if (!event.event_id) {
    event.event_id = crypto.randomUUID();
  }

  // DD8 — kind가 공유 여부를 정한다. 호출자에게 묻지 않고 이벤트에서 읽는 이유는
  // 경계가 이벤트의 성질이지 호출자의 선택이 아니기 때문이다.
  const eventsInfo = resolveEventsDirInfo(Object.assign({}, opts, { kind: event.kind }));
  const eventsDir = eventsInfo.dir;

  // 디렉토리 생성
  if (!fs.existsSync(eventsDir)) {
    try {
      fs.mkdirSync(eventsDir, { recursive: true });
    } catch (_e) {
      // 이미 존재하거나 권한 오류 — fail-open
      return { ok: false, reason: 'mkdir-failed' };
    }
  }

  // 파일 경로
  const filePath = path.join(eventsDir, `${sessionId}.jsonl`);

  // 라인 직렬화
  let line;
  try {
    line = eventToJsonLine(event);
  } catch (err) {
    return { ok: false, reason: 'serialize-failed: ' + (err && err.message) };
  }

  // O_APPEND 원자 append
  try {
    // checkFileSize는 정보용 — 초과해도 append 시도
    checkFileSize(filePath);

    fs.appendFileSync(filePath, line, { encoding: 'utf8', flag: 'a' });

    // global cap 체크 + evict
    //
    // **공유 위치에서는 evict하지 않는다** (L2 R1 architect·security·invariant HIGH).
    // `evictLRU`는 cap 초과 시 오래된 `.jsonl` 20%를 unlink하고 실패도 삼킨다. 공유
    // 위치는 전 worktree의 A1 corpus가 모이는 곳이라 그 삭제가 곧 **A1 baseline의
    // 소급 파괴**다. cap 초과는 시끄럽게 알리고 삭제 판단은 사람에게 맡긴다.
    // worktree-local 경로의 기존 evict 동작은 무변경이다.
    //
    // 이미 경고했으면 크기를 다시 재지 않는다 (local review L2). `computeDirSizeBytes`는
    // 디렉토리 전수 stat이고 공유 위치는 파일 수가 단조 증가하는 쪽인데, 두 번째
    // 계산이 낳는 것은 억제될 경고뿐이다.
    if (eventsInfo.shared) {
      if (!warnedOnce.has('shared-cap') && computeDirSizeBytes(eventsDir) > GLOBAL_MAX_BYTES) {
        warnOnce('shared-cap', 'shared A1 event corpus exceeds GLOBAL_MAX_BYTES ('
          + GLOBAL_MAX_BYTES + ' bytes). Nothing was deleted — retention here is a human'
          + ' decision because eviction would retroactively shrink the A1 baseline.');
      }
    } else {
      evictLRU(eventsDir);
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'append-failed: ' + (err && err.message) };
  }
}

// 공개 API
module.exports = {
  appendEvent,
  resolveEventsDir,
  resolveEventsDirInfo,
  discoverRepoRoot,
  commonDirOf,
  sharedEventsEnabled,
  classifyWorkUnitKind,
  eventToJsonLine,
  sanitizeField,
  MswEventsError,
  ALLOWED_FIELDS,
  SESSION_ID_RE,
  FIELD_MAX_CHARS,
  MAX_LINE_BYTES,
  PER_FILE_MAX_BYTES,
  GLOBAL_MAX_BYTES,
  EVENTS_DIRNAME,
  SHARED_SUBPATH,
  A1_AXIS_KINDS,
  SHARED_EVENTS_TOGGLE,
};
