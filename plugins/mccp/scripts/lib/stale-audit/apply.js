'use strict';

// Dashboard Truthfulness M3 — stale-audit apply (deterministic, 비파괴 마커 삽입).
//
// 승인된 ref+reason 을 받아 소스 `.md` 에 비파괴 해결 마커를 단다(소스 행 보존,
// 주석/체크박스만 추가 — 되돌리기 가능). Codex 재설계 F3 lost-update 방지:
//   - per-file lock (withFileLock, store.js withLedgerLock 미러)
//   - content-hash compare-and-swap (read 시 hash 캡처 → rename 직전 재-read 해
//     불일치 시 abort, atomic rename 단독 의존 폐기)
//   - 파일당 모든 승인 마커를 1 트랜잭션 batch (read once → 전 마커 apply → 검증
//     → write once)
//   - idempotent (isResolved 시 skip) + atomic(tmp+rename)
//   - 편집 후 parseRisks/parseOpenQuestions/parseDeliveryMilestones 재-parse 로
//     표 무손상 검증(실패 시 rollback + 에러)
//   - ref 오매칭(정규화 텍스트 불일치) 시 skip + 경고(편집 안 함)
//
// loud fail-open: 파일 단위 실패는 격리(다른 파일 진행), throw 안 함.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  parseRisks,
  parseOpenQuestions,
  parseDeliveryMilestones,
} = require('../renderer/parsers/plan-body');
const { isResolved, stripLineMarker, buildMarker } = require('../renderer/parsers/resolution-marker');
const { findRisksTableLine, findMilestoneRow } = require('./locate');

const LOCK_MAX_RETRIES = 50;
const LOCK_RETRY_MS = 20;
const LOCK_STALE_MS = 30000;
const MILESTONE_RETIRE = new Set(['complete', 'dropped']);

const SLEEP_BUF = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) { Atomics.wait(SLEEP_BUF, 0, 0, ms); }

function warn(msg) { process.stderr.write('[mccp:stale-audit:apply] ' + msg + '\n'); }

function sha256(s) { return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'); }

function tryAcquire(lockFile) {
  try {
    const fd = fs.openSync(lockFile, 'wx');
    fs.writeSync(fd, String(process.pid) + '\n' + new Date().toISOString());
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    return false;
  }
}

function isStaleLock(lockFile) {
  try { return Date.now() - fs.statSync(lockFile).mtimeMs > LOCK_STALE_MS; }
  catch (_) { return false; }
}

function withFileLock(targetFile, fn, maxRetries) {
  const lockFile = targetFile + '.audit-lock';
  const retries = (typeof maxRetries === 'number' && maxRetries >= 0) ? maxRetries : LOCK_MAX_RETRIES;
  let acquired = false;
  for (let i = 0; i < retries; i++) {
    try { if (tryAcquire(lockFile)) { acquired = true; break; } }
    catch (e) { warn('lock acquire error ' + lockFile + ': ' + e.message); break; }
    if (isStaleLock(lockFile)) { try { fs.unlinkSync(lockFile); } catch (_) {} continue; }
    sleepSync(LOCK_RETRY_MS);
  }
  if (!acquired) {
    // Codex M3-b F4 — fail-closed: lock 미획득 시 fn() 미호출 + aborted 반환(편집 폐기).
    // lock 보유가 1차 방어, content-hash CAS 는 2차. 동시 audit/사용자 편집이 같은
    // 경로를 다시 타도 lost-update 차단. 이전 fail-open(경고 후 진행)은 lost-update 구멍.
    warn('could not acquire lock ' + lockFile + '; aborting edit (fail-closed, lost-update 방지)');
    return { applied: [], skipped: [], aborted: true, error: 'lock acquire failed (fail-closed)' };
  }
  try { return fn(); }
  finally { try { fs.unlinkSync(lockFile); } catch (_) {} }
}

function writeFileAtomic(target, content) {
  const tmp = target + '.audit-tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  try { fs.renameSync(tmp, target); }
  catch (err) { try { fs.unlinkSync(tmp); } catch (_) {} throw err; }
}

// 정규화 텍스트 비교 — 공백 collapse + trim 후 exact. drift 시 skip 판단.
function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

// OQ 라인에서 텍스트 추출(파서와 동일 regex). 마커는 stripLineMarker 로 제거 후.
function extractOQText(rawLine) {
  const cleaned = stripLineMarker(rawLine).line;
  const m = cleaned.match(/^\s*-\s+(?:\[[ xX]?\]\s+)?(.+?)\s*$/);
  return m ? m[1].trim() : null;
}

// risk 라인에서 첫 셀(risk 텍스트) 추출.
function extractRiskCell(rawLine) {
  const cleaned = stripLineMarker(rawLine).line.trim();
  if (!cleaned.startsWith('|')) return null;
  const cells = cleaned.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  return cells.length ? cells[0] : null;
}

// 마일스톤 행의 status 셀을 newStatus 로 교체(셀 패딩 단일화). 마커 없는 cleaned 라인.
function flipMilestoneStatus(cleanedLine, newStatus) {
  const parts = cleanedLine.split('|');
  // `| # | name | outcome | status | plan |` → parts[4] = status 셀.
  if (parts.length < 6) return null;
  parts[4] = ' ' + newStatus + ' ';
  return parts.join('|');
}

// 한 파일의 모든 ref 를 1 트랜잭션으로 적용. 반환 { applied, skipped, aborted, error }.
function applyFile(absPath, fileRefs, fsRead, now) {
  const result = { applied: [], skipped: [], aborted: false, error: null };
  let content;
  try { content = fsRead(absPath); }
  catch (e) { result.error = 'read failed: ' + e.message; return result; }

  const hashBefore = sha256(content);
  const eol = /\r\n/.test(content) ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);

  const before = {
    risks: safe(() => parseRisks(content)),
    oq: safe(() => parseOpenQuestions(content)),
    ms: safe(() => parseDeliveryMilestones(content)),
  };

  for (const ref of fileRefs) {
    const verdict = applyRef(lines, ref, now);
    if (verdict.applied) result.applied.push(verdict.record);
    else result.skipped.push(verdict.record);
  }

  if (result.applied.length === 0) {
    // 모두 skip(idempotent/mismatch) → write 불필요.
    return result;
  }

  const newContent = lines.join(eol);

  // 재-parse 검증 — 행 수 + malformed 불변(표 무손상). 실패 시 rollback.
  const after = {
    risks: safe(() => parseRisks(newContent)),
    oq: safe(() => parseOpenQuestions(newContent)),
    ms: safe(() => parseDeliveryMilestones(newContent)),
  };
  const intact = verifyIntact(before, after);
  if (!intact.ok) {
    result.error = 're-parse verify failed (rollback): ' + intact.reason;
    // applied → aborted 로 강등.
    result.skipped.push(...result.applied.map((r) => Object.assign({}, r, { applied: false, reason: 'rollback:' + intact.reason })));
    result.applied = [];
    result.aborted = true;
    return result;
  }

  // content-hash CAS — rename 직전 재-read 해 read 이후 파일 변경 감지.
  let diskNow;
  try { diskNow = fsRead(absPath); }
  catch (e) { result.error = 'CAS re-read failed: ' + e.message; result.aborted = true; result.applied = []; return result; }
  if (sha256(diskNow) !== hashBefore) {
    result.error = 'content-hash mismatch — file changed during edit (abort, lost-update 방지)';
    result.aborted = true;
    result.skipped.push(...result.applied.map((r) => Object.assign({}, r, { applied: false, reason: 'hash-mismatch-abort' })));
    result.applied = [];
    return result;
  }

  try { writeFileAtomic(absPath, newContent); }
  catch (e) { result.error = 'atomic write failed: ' + e.message; result.aborted = true; result.applied = []; return result; }
  return result;
}

function safe(fn) { try { return fn(); } catch (_) { return null; } }

// before/after parse 비교 — 위험/OQ 행 수 동일 + malformed 미증가 + 마일스톤 표
// 행 수 동일(상태만 바뀜). null(parse throw)은 양쪽 모두 null 이어야 ok.
function verifyIntact(before, after) {
  if (!before.risks || !after.risks) {
    if (before.risks !== after.risks) return { ok: false, reason: 'risks parse availability changed' };
  } else {
    if (before.risks.rows.length !== after.risks.rows.length) return { ok: false, reason: 'risk row count drift' };
    if (after.risks.malformedCount > before.risks.malformedCount) return { ok: false, reason: 'risk malformed increased' };
  }
  if (Array.isArray(before.oq) && Array.isArray(after.oq)) {
    if (before.oq.length !== after.oq.length) return { ok: false, reason: 'oq count drift' };
  }
  if (before.ms && after.ms) {
    if (before.ms.size !== after.ms.size) return { ok: false, reason: 'milestone table size drift' };
  }
  return { ok: true };
}

// 단일 ref 적용(in-place 라인 편집). 반환 { applied, record }.
function applyRef(lines, ref, now) {
  const at = ref.at || now;
  const rec = { kind: ref.kind, source: ref.source, text: ref.text };
  let idx = null;

  if (ref.kind === 'oq') {
    idx = (typeof ref.lineNumber === 'number') ? ref.lineNumber - 1 : null;
  } else if (ref.kind === 'risk') {
    const ln = (typeof ref.lineNumber === 'number') ? ref.lineNumber : findRisksTableLine(lines, ref.ordinal);
    idx = (typeof ln === 'number') ? ln - 1 : null;
  } else if (ref.kind === 'milestone') {
    const loc = findMilestoneRow(lines, ref.name);
    idx = loc ? loc.lineNumber - 1 : null;
  }

  if (idx == null || idx < 0 || idx >= lines.length) {
    rec.reason = 'line not located';
    return { applied: false, record: rec };
  }
  const raw = lines[idx];

  // 텍스트 정합 검증(오매칭 skip) + 적용.
  if (ref.kind === 'oq') {
    const got = extractOQText(raw);
    if (got == null || norm(got) !== norm(ref.text)) { rec.reason = 'text mismatch (oq)'; return { applied: false, record: rec }; }
    if (isResolved(raw)) { rec.reason = 'already-resolved (idempotent)'; return { applied: false, record: rec }; }
    let edited = raw.replace(/-\s+\[\s\]/, '- [x]'); // 체크박스 [ ]→[x] (표기 부수)
    edited = edited.replace(/[ \t]+$/g, '') + ' ' + buildMarker(ref.reason, at);
    lines[idx] = edited;
    rec.reason = 'marked';
    return { applied: true, record: rec };
  }

  if (ref.kind === 'risk') {
    const got = extractRiskCell(raw);
    if (got == null || norm(got) !== norm(ref.text)) { rec.reason = 'text mismatch (risk)'; return { applied: false, record: rec }; }
    if (isResolved(raw)) { rec.reason = 'already-resolved (idempotent)'; return { applied: false, record: rec }; }
    lines[idx] = raw.replace(/[ \t]+$/g, '') + buildMarker(ref.reason, at);
    rec.reason = 'marked';
    return { applied: true, record: rec };
  }

  if (ref.kind === 'milestone') {
    const newStatus = ref.newStatus || 'complete';
    if (!MILESTONE_RETIRE.has(newStatus)) { rec.reason = 'invalid newStatus'; return { applied: false, record: rec }; }
    const sm = stripLineMarker(raw);
    const cells = sm.line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length < 5 || cells[1] !== String(ref.name).trim()) { rec.reason = 'milestone row mismatch'; return { applied: false, record: rec }; }
    if (MILESTONE_RETIRE.has((cells[3] || '').toLowerCase())) { rec.reason = 'already-retired (idempotent)'; return { applied: false, record: rec }; }
    const flipped = flipMilestoneStatus(sm.line, newStatus);
    if (flipped == null) { rec.reason = 'milestone flip failed'; return { applied: false, record: rec }; }
    lines[idx] = flipped.replace(/[ \t]+$/g, '') + buildMarker(ref.reason, at);
    rec.reason = 'status→' + newStatus;
    return { applied: true, record: rec };
  }

  rec.reason = 'unknown kind';
  return { applied: false, record: rec };
}

// apply(opts) — refs 를 source 별 batch 로 적용. now 는 ISO 문자열(테스트 주입).
function apply(opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || process.cwd();
  const fsRead = opts.fsRead || ((p) => fs.readFileSync(p, 'utf8'));
  const now = opts.now || new Date().toISOString();
  const refs = Array.isArray(opts.refs) ? opts.refs : [];

  const byFile = new Map();
  for (const ref of refs) {
    if (!ref || !ref.source) continue;
    if (!byFile.has(ref.source)) byFile.set(ref.source, []);
    byFile.get(ref.source).push(ref);
  }

  const summary = { applied: [], skipped: [], files: [], aborted: [], errors: [] };
  for (const [source, fileRefs] of byFile) {
    const abs = path.isAbsolute(source) ? source : path.join(repoRoot, source);
    const res = withFileLock(abs, () => applyFile(abs, fileRefs, fsRead, now), opts.lockMaxRetries);
    summary.applied.push(...res.applied);
    summary.skipped.push(...res.skipped);
    if (res.aborted) summary.aborted.push(source);
    if (res.error) summary.errors.push({ source, error: res.error });
    summary.files.push({ source, applied: res.applied.length, skipped: res.skipped.length, aborted: res.aborted, error: res.error });
  }
  return summary;
}

// CLI: node apply.js --refs-file <path.json> [--repo-root R] [--now ISO] --json
// refs-file 은 승인된 ref 배열 JSON. `/mccp:dashboard-audit` Phase 3 이 호출.
function main(argv) {
  const args = argv.slice(2);
  const opts = {};
  let refsFile = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--refs-file') refsFile = args[++i];
    else if (args[i] === '--repo-root') opts.repoRoot = args[++i];
    else if (args[i] === '--now') opts.now = args[++i];
  }
  if (!refsFile) { process.stderr.write('apply: --refs-file required\n'); process.exit(2); }
  try { opts.refs = JSON.parse(fs.readFileSync(refsFile, 'utf8')); }
  catch (e) { process.stderr.write('apply: refs-file parse failed: ' + e.message + '\n'); process.exit(2); }
  const summary = apply(opts);
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  // abort/error 가 있으면 비-0(부분 적용도 통보). applied 0 + error 면 1.
  if (summary.errors.length > 0 && summary.applied.length === 0) process.exit(1);
}

if (require.main === module) main(process.argv);

module.exports = { apply, applyFile, applyRef, flipMilestoneStatus, verifyIntact };
