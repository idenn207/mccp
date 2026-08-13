'use strict';

// multi-session-work-loop M5 — 저널 레코드 스키마 (순수).
//
// 설계: docs/multi-session-work-loop/state-truth-source-design.md
//
// 이 모듈은 I/O를 갖지 않는다. 디스크 접근은 state/journal-store.js 소관이고
// 여기서는 "무엇이 유효한 레코드인가"와 "그 레코드의 정규 직렬화는 무엇인가"만
// 답한다. 두 질문의 답이 한 곳에 있어야 writer와 `journal verify`가 같은
// content_hash를 계산한다 — 두 곳에서 각자 직렬화하면 정규화가 갈라져 verify가
// 전건 실패한다 (I4).
//
// Patterns (state/msw-events.js 거울):
//   - bounded allowlist (목록 밖 키는 기록되지 않는다)
//   - per-field char cap
//   - malformed 격리는 호출자(journal-store)가 per-line으로 수행

const crypto = require('crypto');

// 레코드 allowlist. 이 목록이 곧 스키마다.
//
// 왜 allowlist 복사가 `Object.assign`/spread가 아니라 키별 명시 대입인가
// (security-reviewer S2): `JSON.parse('{"__proto__":{...}}')`는 `__proto__`를
// **own 속성**으로 만들고, 그 객체를 `Object.assign`의 *source*로 쓰면
// `[[Set]]`이 `Object.prototype`의 setter를 발동시킨다. 저널은 신뢰 경계 밖
// (디스크 · git-tracked ledger)에서 오는 JSON을 파싱하므로 이 경로가 실재한다.
// 키를 allowlist에서만 가져오면 `__proto__`가 애초에 대상 키가 되지 않는다.
const RECORD_FIELDS = [
  'record_id',
  'ts',
  'session_id',
  'session_epoch',
  'epoch_source',
  'work_unit',
  'seq',
  'kind',
  'patch',
  'prev_session_id',
  'superseded_by',
  'checkpoint_of',
  'content_hash',
];

const RECORD_FIELD_SET = new Set(RECORD_FIELDS);

// content_hash는 자기 자신을 해싱 입력에서 제외한다 — 포함하면 계산이 순환한다.
const HASH_EXCLUDE_FIELDS = new Set(['content_hash']);

const RECORD_KINDS = new Set([
  'genesis',     // 부트스트랩 시 STATE.md를 봉인한 최초 레코드
  'update',      // state-writer.update() 한 번 = 레코드 한 건
  'tombstone',   // 작업 단위 종료 — high-water를 고정한다
  'checkpoint',  // retention 압축이 남기는 무손실 접점
  'reseed',      // degraded 복구 — 파괴가 이력에 남도록 자기 자신을 기록한다 (S6)
]);

const EPOCH_SOURCES = new Set(['ledger', 'ts-fallback']);

// 판정 enum 4종 (order.js#decideAdmission이 돌려주는 값).
const ADMISSION = {
  ADMIT: 'admit',
  SUPERSEDED: 'admit-superseded',
  POST_TOMBSTONE: 'admit-post-tombstone',
  REJECT: 'reject-malformed',
};

const FIELD_MAX_CHARS = 256;
// patch는 STATE.md 본문을 나르므로 다른 필드보다 넉넉해야 한다. 그래도 상한은
// 둔다 — 상한 없는 필드 하나가 per-line cap을 무력화한다.
const PATCH_MAX_CHARS = 8192;
const MAX_LINE_BYTES = 16384;

// 프로토타입 오염 벡터. patch는 중첩 객체라 allowlist 밖이므로 여기서 직접 턴다.
const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainValue(v) {
  return v === null || typeof v === 'string' || typeof v === 'number' ||
    typeof v === 'boolean';
}

// patch 정화 — 깊이 제한 + 오염 키 제거. 반환은 항상 새 객체이며 입력을 공유하지
// 않는다(호출자가 나중에 변형해도 저널에 들어간 값이 바뀌지 않는다).
function sanitizePatch(value, depth) {
  depth = depth || 0;
  if (depth > 4) return null;
  if (isPlainValue(value)) {
    if (typeof value === 'string' && value.length > PATCH_MAX_CHARS) {
      return value.slice(0, PATCH_MAX_CHARS - 4) + '_...';
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 200).map(function (v) { return sanitizePatch(v, depth + 1); });
  }
  if (typeof value !== 'object') return null;
  const out = {};
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length && i < 200; i++) {
    const k = keys[i];
    if (POLLUTION_KEYS.has(k)) continue;
    out[k] = sanitizePatch(value[k], depth + 1);
  }
  return out;
}

function sanitizeScalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  let str = String(value);
  if (str.length > FIELD_MAX_CHARS) str = str.slice(0, FIELD_MAX_CHARS - 4) + '_...';
  return str.replace(/[\n\r\t]/g, ' ');
}

// allowlist 복사. 신뢰 경계를 넘는 유일한 관문이므로 여기서만 키를 정한다.
function sanitizeRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out = {};
  for (const key of RECORD_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const raw = input[key];
    if (key === 'patch' || key === 'checkpoint_of') {
      out[key] = raw === null || raw === undefined ? null : sanitizePatch(raw, 0);
    } else if (key === 'seq') {
      const n = Number(raw);
      out[key] = Number.isInteger(n) ? n : raw;
    } else {
      out[key] = sanitizeScalar(raw);
    }
  }
  return out;
}

// 정규 직렬화 — 키 사전순 + content_hash 제외. writer와 verify가 **같은 함수**를
// 부르는 것이 계약이다 (I4).
function canonicalize(record) {
  const keys = RECORD_FIELDS.filter(function (k) {
    return !HASH_EXCLUDE_FIELDS.has(k) &&
      Object.prototype.hasOwnProperty.call(record, k) &&
      record[k] !== undefined;
  }).sort();
  const shell = {};
  for (const k of keys) shell[k] = record[k];
  return JSON.stringify(shell);
}

function computeContentHash(record) {
  return 'sha256:' + crypto.createHash('sha256')
    .update(canonicalize(record), 'utf8')
    .digest('hex');
}

function verifyContentHash(record) {
  if (!record || typeof record.content_hash !== 'string') return false;
  return computeContentHash(record) === record.content_hash;
}

// 스키마 검증. `{ok, errors}` — throw하지 않는다(msw-events 계약).
function validateRecord(record) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, errors: ['record must be an object'] };
  }
  for (const key of Object.keys(record)) {
    if (!RECORD_FIELD_SET.has(key)) errors.push('unknown field "' + key + '"');
  }
  if (typeof record.record_id !== 'string' || !record.record_id) errors.push('record_id required');
  if (typeof record.ts !== 'string' || !record.ts) errors.push('ts required');
  if (typeof record.session_id !== 'string' || !record.session_id) errors.push('session_id required');
  if (typeof record.work_unit !== 'string' || !record.work_unit) errors.push('work_unit required');
  if (!RECORD_KINDS.has(record.kind)) errors.push('kind must be one of ' + Array.from(RECORD_KINDS).join('|'));
  if (!Number.isInteger(record.seq) || record.seq < 1) errors.push('seq must be an integer >= 1');
  if (record.epoch_source !== undefined && record.epoch_source !== null &&
      !EPOCH_SOURCES.has(record.epoch_source)) {
    errors.push('epoch_source must be ledger|ts-fallback');
  }
  if (record.prev_session_id !== undefined && record.prev_session_id !== null &&
      typeof record.prev_session_id !== 'string') {
    errors.push('prev_session_id must be a string or null');
  }
  return { ok: errors.length === 0, errors: errors };
}

// 레코드 생성 — allowlist 복사 후 content_hash를 봉인한다.
function makeRecord(fields) {
  const base = sanitizeRecord(fields) || {};
  if (!base.record_id) base.record_id = crypto.randomUUID();
  if (!base.ts) base.ts = new Date().toISOString();
  if (base.prev_session_id === undefined) base.prev_session_id = null;
  if (base.superseded_by === undefined) base.superseded_by = null;
  if (base.checkpoint_of === undefined) base.checkpoint_of = null;
  if (base.patch === undefined) base.patch = null;
  delete base.content_hash;
  base.content_hash = computeContentHash(base);
  return base;
}

function serialize(record) {
  const line = JSON.stringify(record) + '\n';
  if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
    // per-line cap 초과. patch를 잘라 다시 시도한다 — 레코드를 통째로 버리면
    // 그 변형의 순번 자체가 사라져 high-water가 어긋난다.
    const trimmed = Object.assign({}, record, { patch: null });
    delete trimmed.content_hash;
    trimmed.content_hash = computeContentHash(trimmed);
    return JSON.stringify(trimmed) + '\n';
  }
  return line;
}

// 한 줄 파싱. 실패는 throw가 아니라 null — 호출자가 per-line 격리한다.
function parseLine(line) {
  if (typeof line !== 'string' || !line.trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (_e) {
    return null;
  }
  const clean = sanitizeRecord(parsed);
  if (!clean) return null;
  return clean;
}

// 세 정체성 필드의 취득 (DD12). 순수 함수 — I/O는 호출자가 주입한다.
//
//   session_id      : orchestration-runaway#resolveSessionKey와 **동일** precedence.
//                     새 resolver를 만들면 /mccp:plan 5.2·fan-out 예약과 키가 갈라진다.
//   session_epoch   : ledger의 created_at (단조 · host/pid 검증 완료). 부재 시 ts.
//   prev_session_id : ledger가 아니라 **저널 tail**에서 파생한다. ledger의 "시간상
//                     직전"은 다른 worktree의 동시 세션일 수 있고, A4가 물어야 하는
//                     것은 *이 저장소 상태를 실제로 이어받은* 세션이다.
function resolveIdentity(opts) {
  opts = opts || {};
  const env = opts.env || {};
  const ts = opts.ts || new Date().toISOString();

  const sessionId = env.MCCP_SESSION_ID || env.CLAUDE_CODE_SESSION_ID ||
    env.CLAUDE_SESSION_ID || 'unknown';

  let sessionEpoch = null;
  let epochSource = 'ts-fallback';
  if (typeof opts.ledgerRead === 'function') {
    let ledger = null;
    try {
      ledger = opts.ledgerRead({ sessionId: sessionId });
    } catch (_e) {
      ledger = null;
    }
    const createdAt = ledger && ledger.ok !== false &&
      (ledger.created_at || (ledger.ledger && ledger.ledger.created_at));
    if (typeof createdAt === 'string' && createdAt) {
      sessionEpoch = createdAt;
      epochSource = 'ledger';
    }
  }
  if (!sessionEpoch) sessionEpoch = ts;

  const tail = opts.journalTail || null;
  let prevSessionId = null;
  if (tail && typeof tail.session_id === 'string' && tail.session_id &&
      tail.session_id !== sessionId) {
    prevSessionId = tail.session_id;
  }

  return {
    session_id: sessionId,
    session_epoch: sessionEpoch,
    epoch_source: epochSource,
    prev_session_id: prevSessionId,
  };
}

module.exports = {
  RECORD_FIELDS: RECORD_FIELDS,
  RECORD_KINDS: RECORD_KINDS,
  EPOCH_SOURCES: EPOCH_SOURCES,
  ADMISSION: ADMISSION,
  FIELD_MAX_CHARS: FIELD_MAX_CHARS,
  PATCH_MAX_CHARS: PATCH_MAX_CHARS,
  MAX_LINE_BYTES: MAX_LINE_BYTES,
  POLLUTION_KEYS: POLLUTION_KEYS,
  sanitizeRecord: sanitizeRecord,
  sanitizePatch: sanitizePatch,
  canonicalize: canonicalize,
  computeContentHash: computeContentHash,
  verifyContentHash: verifyContentHash,
  validateRecord: validateRecord,
  makeRecord: makeRecord,
  serialize: serialize,
  parseLine: parseLine,
  resolveIdentity: resolveIdentity,
};
