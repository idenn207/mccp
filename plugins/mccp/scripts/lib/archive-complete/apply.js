'use strict';

// /mccp:archive-complete — atomic archive transaction + status-corrector.
//
// 승인된 status 정정 + archive 이동을 **all-or-nothing 원자 트랜잭션**으로 적용한다.
// 어떤 mutation 보다 먼저 전 set 을 preflight — 하나라도 실패면 mutation 0 으로 abort.
// 통과 시 operation journal 을 기록하고 순차 적용하되, 적용 중 어떤 실패(collision·fs
// error·git mv 실패)든 전량 rollback(옮긴 파일 reverse git mv + 편집한 status 셀 원복).
//
//   apply(opts) → { moved, corrected, skipped, aborted, rolledBack, errors, journalPath }
//
// 핵심 불변식:
//   - **C2 (원자 단위)**: PRD + 그에 속한 모든 활성 plan 은 하나의 원자 단위. archived
//     PRD + active plan 이 남는 부분 상태를 구조적으로 불가능하게 한다. apply 가
//     archivable 을 재검증(scan 신뢰 안 함) + PRD 의 모든 활성 plan 이 planPaths 에
//     포함됐는지 검증(단독 이동 거부).
//   - **CAS**: status flip 은 read 시 content-hash 캡처 → write 직전 재-read 불일치 abort.
//   - **operation journal = durable audit anchor(F3)**: scan hash·승인 corrections+evidence·
//     소스 content hash·목적지·timestamp·session id 를 `.claude/state/archive-journal/<id>.json`
//     (git-tracked, completion-ledger 패턴 미러)에 기록. rollback 매체이자 감사 기록.
//     주의: 이 journal 은 durable manifest 이지 `mccp-*-codex` 게이트 receipt 가 아니다
//     (파일 이동 chore 에 cross-model review 는 YAGNI — human-gate + git + journal 이 review).
//
// loud fail-open: 판정 단계는 throw 안 하고 aborted/errors 로 통보. Mirror:
// stale-audit/apply.js(lock+CAS+rollback) + completion-ledger/store.js(tmp+rename atomic).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { stripAxisIdPrefix } = require('../renderer/parsers/plan-body');
const { scanPlans } = require('../../derive/sources/plans');
const { classifyMilestones, isArchivable, sourcePrdPathOf } = require('./scan');

const PRD_ARCHIVE_DIR = path.join('.claude', 'prds', 'archived');
const PLAN_ARCHIVE_DIR = path.join('.claude', 'PRPs', 'plans', 'archived');
const JOURNAL_SUBDIR = path.join('.claude', 'state', 'archive-journal');
const VALID_STATUSES = new Set(['complete', 'pending', 'in-progress', 'dropped']);

const LOCK_MAX_RETRIES = 50;
const LOCK_RETRY_MS = 20;
const LOCK_STALE_MS = 30000;
const SLEEP_BUF = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) { Atomics.wait(SLEEP_BUF, 0, 0, ms); }

function warn(msg) { process.stderr.write('[mccp:archive-complete:apply] ' + msg + '\n'); }
function sha256(s) { return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'); }
function toPosix(p) { return String(p == null ? '' : p).split(path.sep).join('/'); }
function baseOf(p) { return p ? String(p).split(/[\\/]/).pop() : null; }

// `<name>.legacy.<ext>` — 복합 확장자(.prd.md/.plan.md)는 전체 suffix 앞에 .legacy 삽입
// (dup.prd.md → dup.legacy.prd.md), 그 외는 마지막 확장자 앞에 삽입.
function legacyName(base) {
  const compound = base.match(/^(.*?)(\.(?:prd|plan)\.md)$/i);
  if (compound) return compound[1] + '.legacy' + compound[2];
  const ext = (base.match(/(\.[^.]+)$/) || [''])[0];
  return base.slice(0, base.length - ext.length) + '.legacy' + ext;
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function writeFileAtomic(target, content) {
  const tmp = target + '.archive-tmp';
  ensureDir(path.dirname(target));
  fs.writeFileSync(tmp, content, 'utf8');
  try { fs.renameSync(tmp, target); }
  catch (err) { try { fs.unlinkSync(tmp); } catch (_) {} throw err; }
}

// --- per-file lock (stale-audit withFileLock 미러) ----------------------------

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
function withFileLock(targetFile, fn) {
  const lockFile = targetFile + '.archive-lock';
  let acquired = false;
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    try { if (tryAcquire(lockFile)) { acquired = true; break; } }
    catch (e) { warn('lock acquire error ' + lockFile + ': ' + e.message); break; }
    if (isStaleLock(lockFile)) { try { fs.unlinkSync(lockFile); } catch (_) {} continue; }
    sleepSync(LOCK_RETRY_MS);
  }
  if (!acquired) {
    warn('could not acquire lock ' + lockFile + '; aborting (fail-closed)');
    throw new Error('lock acquire failed: ' + toPosix(targetFile));
  }
  try { return fn(); }
  finally { if (acquired) { try { fs.unlinkSync(lockFile); } catch (_) {} } }
}

// --- status 셀 surgical replace(escaped-pipe safe) ----------------------------

// 라인의 unescaped `|` 위치들(plan-body.js parseTableRows lookbehind `(?<!\\)\|` 미러).
function unescapedPipeIndexes(line) {
  const idxs = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '|' && (i === 0 || line[i - 1] !== '\\')) idxs.push(i);
  }
  return idxs;
}

// `## Delivery Milestones` 표에서 name 과 일치하는 데이터 행의 line index 반환(1-indexed
// 아님 — 0-indexed lines 배열 기준). 못 찾으면 null.
function findMilestoneRowIndex(lines, name) {
  let inSection = false;
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+Delivery Milestones\s*$/.test(line)) { inSection = true; inTable = false; continue; }
    if (inSection && /^##\s/.test(line)) break; // 다음 섹션
    if (!inSection) continue;
    const trimmed = line.trim();
    if (/^\|\s*-+/.test(trimmed)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!trimmed.startsWith('|')) { if (trimmed === '') continue; break; }
    const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    const cells = inner.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
    if (cells.length < 5) continue;
    const cellName = (cells[1] || '').trim();
    if (cellName === name || stripAxisIdPrefix(cellName) === name) return i;
  }
  return null;
}

// 주어진 milestone 행 라인의 status 셀(데이터 셀 index 3)만 surgical replace. 다른 셀의
// 원래 whitespace/내용을 보존한다. 실패 시 null.
function replaceStatusCell(line, newStatus) {
  const pipes = unescapedPipeIndexes(line);
  // `| # | name | outcome | status | plan |` → 6 unescaped pipes 이상.
  if (pipes.length < 6) return null;
  const before = line.slice(0, pipes[3] + 1);
  const after = line.slice(pipes[4]);
  return before + ' ' + newStatus + ' ' + after;
}

// body 에 milestone status 정정을 in-memory 로 적용(preflight 시뮬레이션 + apply 공용).
// 반환 { ok, body, error }.
function flipStatusInBody(body, milestoneName, newStatus) {
  if (!VALID_STATUSES.has(newStatus)) {
    return { ok: false, error: 'invalid newStatus "' + newStatus + '"' };
  }
  const eol = /\r\n/.test(body) ? '\r\n' : '\n';
  const lines = body.split(/\r?\n/);
  const idx = findMilestoneRowIndex(lines, milestoneName);
  if (idx == null) return { ok: false, error: 'milestone row not found: "' + milestoneName + '"' };
  const replaced = replaceStatusCell(lines[idx], newStatus);
  if (replaced == null) return { ok: false, error: 'status cell not editable: "' + milestoneName + '"' };
  lines[idx] = replaced;
  return { ok: true, body: lines.join(eol) };
}

// --- git mv (injectable for tests) -------------------------------------------

function defaultGitMv(srcRel, destRel, repoRoot) {
  execFileSync('git', ['mv', srcRel, destRel], {
    cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// --- expected plan set (C2) ---------------------------------------------------

function expectedPlansForPrd(repoRoot, prdBasename) {
  let items = [];
  try { items = (scanPlans(repoRoot).items) || []; } catch (_) { items = []; }
  return items
    .filter((p) => baseOf(sourcePrdPathOf(p)) === prdBasename)
    .map((p) => toPosix(p.path))
    .filter(Boolean);
}

// --- journal -----------------------------------------------------------------

function journalId(now, payloadHash) {
  const stamp = String(now).replace(/[:.]/g, '-');
  return stamp + '__' + payloadHash.slice(0, 8);
}

function writeJournal(repoRoot, journal) {
  const dir = path.join(repoRoot, JOURNAL_SUBDIR);
  ensureDir(dir);
  const target = path.join(dir, journal.id + '.json');
  writeFileAtomic(target, JSON.stringify(journal, null, 2) + '\n');
  return toPosix(path.relative(repoRoot, target));
}

// --- collision action ---------------------------------------------------------
// source/dest 상태로 move action 판정. 반환 { action, srcRel, destRel, legacyRel? }.
//   'move'            source 존재 · dest 부재 → 정상 이동
//   'move-legacy'     source·dest 존재 · 내용 상이 → source 를 <name>.legacy.md 로 보존
//   'skip-duplicate'  source·dest 존재 · 내용 동일 → 이동 skip(idempotent)
//   'already-archived' source 부재 · dest 존재 → 이미 아카이브됨(idempotent)
//   null + error      source·dest 모두 부재 → 옮길 것 없음(preflight fail)
function planMove(repoRoot, srcRel, archiveDir) {
  const srcAbs = path.join(repoRoot, srcRel);
  const base = baseOf(srcRel);
  const destRel = toPosix(path.join(archiveDir, base));
  const destAbs = path.join(repoRoot, destRel);
  const srcExists = fs.existsSync(srcAbs);
  const destExists = fs.existsSync(destAbs);
  if (srcExists && !destExists) return { action: 'move', srcRel, destRel };
  if (!srcExists && destExists) return { action: 'already-archived', srcRel, destRel };
  if (!srcExists && !destExists) return { error: 'source missing and not archived: ' + srcRel };
  // both exist — content compare
  let same = false;
  try { same = sha256(fs.readFileSync(srcAbs, 'utf8')) === sha256(fs.readFileSync(destAbs, 'utf8')); }
  catch (_) { same = false; }
  if (same) return { action: 'skip-duplicate', srcRel, destRel };
  const legacyRel = toPosix(path.join(archiveDir, legacyName(base)));
  return { action: 'move-legacy', srcRel, legacyRel, destRel };
}

// --- preflight ---------------------------------------------------------------

function preflight(repoRoot, statusCorrections, archives) {
  const errors = [];
  const corrections = [];
  const moveOps = [];

  // 1) status corrections — resolve + validate + compute corrected body per PRD.
  //    같은 PRD 여러 정정을 누적 적용해 최종 correctedBody 를 만든다.
  const correctedBodies = new Map(); // prdRel → { abs, hashBefore, body }
  for (const corr of statusCorrections) {
    const prdRel = toPosix(corr.prdPath);
    const abs = path.join(repoRoot, prdRel);
    if (!fs.existsSync(abs)) { errors.push('status-correction PRD missing: ' + prdRel); continue; }
    let state = correctedBodies.get(prdRel);
    if (!state) {
      let orig;
      try { orig = fs.readFileSync(abs, 'utf8'); }
      catch (e) { errors.push('status-correction PRD read failed: ' + prdRel + ': ' + e.message); continue; }
      state = { abs, hashBefore: sha256(orig), body: orig, prdRel };
      correctedBodies.set(prdRel, state);
    }
    const flip = flipStatusInBody(state.body, corr.milestoneName, corr.newStatus);
    if (!flip.ok) { errors.push('status-correction failed (' + prdRel + '): ' + flip.error); continue; }
    state.body = flip.body;
    corrections.push({
      prdRel, abs, milestoneName: corr.milestoneName, newStatus: corr.newStatus,
      reason: corr.reason || '', evidence: corr.evidence || null,
    });
  }

  // 2) archives — re-verify archivable(after corrections) + C2 plan completeness + moves.
  for (const arc of archives) {
    const prdRel = toPosix(arc.prdPath);
    const prdAbs = path.join(repoRoot, prdRel);
    const prdBase = baseOf(prdRel);
    // archivability re-verify — corrected body 우선, 없으면 disk 원본.
    let body = null;
    const cb = correctedBodies.get(prdRel);
    if (cb) body = cb.body;
    else if (fs.existsSync(prdAbs)) { try { body = fs.readFileSync(prdAbs, 'utf8'); } catch (_) { body = null; } }
    // source 부재 + dest 존재면 already-archived(idempotent) — body 없어도 진행.
    const prdMove = planMove(repoRoot, prdRel, PRD_ARCHIVE_DIR);
    if (prdMove.error) { errors.push(prdMove.error); continue; }
    if (prdMove.action !== 'already-archived') {
      if (body == null) { errors.push('archive PRD unreadable: ' + prdRel); continue; }
      const verdict = isArchivable(classifyMilestones(body));
      if (!verdict.archivable) {
        errors.push('PRD not archivable (C2, after corrections): ' + prdRel + ' — ' + verdict.reason);
        continue;
      }
    }
    // C2 — 이 PRD 의 모든 활성 plan 이 planPaths 에 포함됐는가(단독 이동 거부).
    const expected = expectedPlansForPrd(repoRoot, prdBase);
    const given = new Set((arc.planPaths || []).map(toPosix));
    const missingPlans = expected.filter((p) => !given.has(p));
    if (missingPlans.length > 0) {
      errors.push('C2 violation — PRD ' + prdRel + ' has active plans not included: ' + missingPlans.join(', '));
      continue;
    }
    // build moves for PRD + all its plans (atomic unit).
    const unit = { prdRel, moves: [] };
    unit.moves.push(prdMove);
    for (const planPath of (arc.planPaths || [])) {
      const pRel = toPosix(planPath);
      const pMove = planMove(repoRoot, pRel, PLAN_ARCHIVE_DIR);
      if (pMove.error) { errors.push(pMove.error); }
      else unit.moves.push(pMove);
    }
    moveOps.push(unit);
  }

  return { ok: errors.length === 0, errors, corrections, correctedBodies, moveOps };
}

// --- apply -------------------------------------------------------------------

function apply(opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || process.cwd();
  const now = opts.now || new Date().toISOString();
  const sessionId = opts.sessionId || process.env.CLAUDE_SESSION_ID || 'unknown';
  const scanHash = opts.scanHash || null;
  const gitMv = typeof opts.gitMv === 'function' ? opts.gitMv : defaultGitMv;
  const statusCorrections = Array.isArray(opts.statusCorrections) ? opts.statusCorrections : [];
  const archives = Array.isArray(opts.archives) ? opts.archives : [];

  const result = {
    moved: [], corrected: [], skipped: [],
    aborted: false, rolledBack: false, errors: [], journalPath: null,
  };

  // === PREFLIGHT (mutation 전 전량 검사) ===
  let plan;
  try { plan = preflight(repoRoot, statusCorrections, archives); }
  catch (e) { result.aborted = true; result.errors.push({ stage: 'preflight', error: e.message }); return result; }
  if (!plan.ok) {
    result.aborted = true;
    result.errors = plan.errors.map((e) => ({ stage: 'preflight', error: e }));
    return result; // mutation 0
  }

  // === JOURNAL (durable audit anchor, F3) ===
  const journalArchives = plan.moveOps.map((u) => ({
    prd: u.prdRel,
    moves: u.moves.map((m) => ({ action: m.action, from: m.srcRel, to: m.legacyRel || m.destRel })),
  }));
  const journalCorrections = plan.corrections.map((c) => ({
    prd: c.prdRel, milestone: c.milestoneName, new_status: c.newStatus,
    reason: c.reason, evidence: c.evidence,
  }));
  const payloadHash = sha256(JSON.stringify({ journalArchives, journalCorrections, scanHash }));
  const journal = {
    schema_version: 'v1',
    id: journalId(now, payloadHash),
    created_at: now,
    session_id: sessionId,
    scan_hash: scanHash,
    status_corrections: journalCorrections,
    archives: journalArchives,
  };
  try { result.journalPath = writeJournal(repoRoot, journal); }
  catch (e) {
    // journal 을 못 쓰면 audit anchor 부재 → mutation 진입 안 함(fail-closed).
    result.aborted = true;
    result.errors.push({ stage: 'journal', error: e.message });
    return result;
  }

  // === APPLY with rollback stack ===
  const undo = [];
  try {
    // test seam — preflight 이후·mutation 이전 진입점(CAS mismatch 재현용). production
    // default no-op(injectable now/gitMv 와 동일 철학).
    if (typeof opts.onBeforeApply === 'function') opts.onBeforeApply(plan);
    // 1) status corrections (CAS + atomic write, per-file lock)
    for (const state of plan.correctedBodies.values()) {
      // 이 PRD 에 실제 정정이 있었는지(body 변경) 확인.
      // (correctedBodies 는 정정 대상 PRD 만 담긴다 — 항상 변경 있음.)
      withFileLock(state.abs, () => {
        const diskNow = fs.readFileSync(state.abs, 'utf8');
        if (sha256(diskNow) !== state.hashBefore) {
          throw new Error('CAS mismatch — PRD changed during edit: ' + state.prdRel);
        }
        const original = diskNow;
        writeFileAtomic(state.abs, state.body);
        undo.push(() => writeFileAtomic(state.abs, original));
      });
    }
    for (const corr of plan.corrections) {
      result.corrected.push({ prd: corr.prdRel, milestone: corr.milestoneName, newStatus: corr.newStatus });
    }

    // 2) archive moves (PRD + plans as atomic units)
    for (const unit of plan.moveOps) {
      for (const mv of unit.moves) {
        if (mv.action === 'move') {
          ensureDir(path.dirname(path.join(repoRoot, mv.destRel)));
          gitMv(mv.srcRel, mv.destRel, repoRoot);
          undo.push(() => gitMv(mv.destRel, mv.srcRel, repoRoot));
          result.moved.push({ from: mv.srcRel, to: mv.destRel });
        } else if (mv.action === 'move-legacy') {
          ensureDir(path.dirname(path.join(repoRoot, mv.legacyRel)));
          gitMv(mv.srcRel, mv.legacyRel, repoRoot);
          undo.push(() => gitMv(mv.legacyRel, mv.srcRel, repoRoot));
          result.moved.push({ from: mv.srcRel, to: mv.legacyRel, collision: 'legacy' });
        } else if (mv.action === 'skip-duplicate' || mv.action === 'already-archived') {
          result.skipped.push({ path: mv.srcRel, reason: mv.action });
        }
      }
    }
  } catch (e) {
    // === ROLLBACK (전량 원복) ===
    result.errors.push({ stage: 'apply', error: e.message });
    for (let i = undo.length - 1; i >= 0; i--) {
      try { undo[i](); }
      catch (ue) { result.errors.push({ stage: 'rollback', error: ue && ue.message ? ue.message : String(ue) }); }
    }
    result.aborted = true;
    result.rolledBack = true;
    result.moved = [];
    result.corrected = [];
    // journal 은 aborted 시도의 감사 기록으로 남긴다(삭제 안 함).
  }

  return result;
}

// CLI: node apply.js --ops-file <path.json> [--repo-root R] [--now ISO] [--scan-hash H]
// ops-file = { statusCorrections:[...], archives:[...] }. command Phase 3 이 호출.
function main(argv) {
  const args = argv.slice(2);
  const opts = {};
  let opsFile = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ops-file') opsFile = args[++i];
    else if (args[i] === '--repo-root') opts.repoRoot = args[++i];
    else if (args[i] === '--now') opts.now = args[++i];
    else if (args[i] === '--scan-hash') opts.scanHash = args[++i];
  }
  if (!opsFile) { process.stderr.write('apply: --ops-file required\n'); process.exit(2); }
  let ops;
  try { ops = JSON.parse(fs.readFileSync(opsFile, 'utf8')); }
  catch (e) { process.stderr.write('apply: ops-file parse failed: ' + e.message + '\n'); process.exit(2); }
  opts.statusCorrections = ops.statusCorrections || [];
  opts.archives = ops.archives || [];
  const summary = apply(opts);
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  if (summary.aborted) process.exit(1);
}

if (require.main === module) main(process.argv);

module.exports = {
  apply,
  preflight,
  flipStatusInBody,
  replaceStatusCell,
  findMilestoneRowIndex,
  planMove,
  expectedPlansForPrd,
};
