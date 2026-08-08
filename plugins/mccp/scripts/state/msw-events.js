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

function resolveEventsDir(opts) {
  opts = opts || {};
  if (opts.dir) return opts.dir;
  if (opts.repoRoot) return path.join(opts.repoRoot, EVENTS_DIRNAME);
  const discovered = discoverRepoRoot(opts.cwd);
  if (discovered) return path.join(discovered, EVENTS_DIRNAME);
  return EVENTS_DIRNAME;   // 레거시 fallback (repo 밖에서 실행된 경우)
}

// 핵심: append 이벤트
function appendEvent(sessionId, event, opts) {
  opts = opts || {};
  if (!sessionId || typeof sessionId !== 'string') {
    throw new MswEventsError('invalid_session_id', 'sessionId must be non-empty string');
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

  const eventsDir = resolveEventsDir(opts);

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
    evictLRU(eventsDir);

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'append-failed: ' + (err && err.message) };
  }
}

// 공개 API
module.exports = {
  appendEvent,
  resolveEventsDir,
  discoverRepoRoot,
  eventToJsonLine,
  sanitizeField,
  MswEventsError,
  ALLOWED_FIELDS,
  FIELD_MAX_CHARS,
  MAX_LINE_BYTES,
  PER_FILE_MAX_BYTES,
  GLOBAL_MAX_BYTES,
  EVENTS_DIRNAME,
};
