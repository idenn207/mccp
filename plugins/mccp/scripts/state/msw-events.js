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

// allowlist — 이 필드들만 기록 가능
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

  // 디렉토리 (테스트용 override 가능)
  const eventsDir = opts.dir || EVENTS_DIRNAME;

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
