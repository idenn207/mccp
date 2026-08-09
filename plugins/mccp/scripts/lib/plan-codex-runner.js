'use strict';

// plan-codex-runner — ONE process owns the Plan-Codex review, the intent-gate
// decision, and the receipt write.
//
// WHY ONE PROCESS (DD3). The gate's decision inputs are the Codex findings. If
// those findings round-trip through a file between "review" and "write", that
// file IS the gate, and anything able to write it can forge a passing verdict
// without Codex ever running. So the review payload is parsed in memory and
// never re-read from disk. The audit envelope written below is a COPY for human
// forensics; nothing reads it back. `intent-context.test.js` and this module's
// test assert exactly that (tamper the copy → the stamped verdict is unchanged).
//
// WHY ONE *LONG-LIVED* PROCESS (Implement-Codex R1 F1). Adjudication is
// authored by the LLM after it reads the findings, so it cannot be in-memory
// only. The obvious two-invocation design (emit findings → LLM writes file →
// second invocation) forces the second process to recover findings from the
// disk envelope — which reinstates precisely the channel DD3 removed and makes
// the tamper test vacuous. Instead this process STAYS ALIVE: it publishes the
// findings as OUTPUT, waits for the adjudication file, and validates it against
// the payload it still holds in memory.
//
// The distinction that makes this sound: the awaiting artifact is an output
// (never read back by the runner), and the adjudication file is a *claim* that
// is checked against in-memory digests rather than trusted.
//
// Because codex-invoke can block for up to 900s while the Bash tool caps at
// 600s, callers launch this detached and poll the completion marker. Marker
// handling is bound to this run (R2 F3 + R1 F5): the marker path carries a
// caller-generated nonce, the receipt itself seals `meta.intent_run_nonce`, and
// a per-decision lease lock stops a retry from racing a live run.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ic = require('./intent-context');
const codexInvoke = require('./codex-invoke');
const codexPayload = require('./codex-review-payload');
const receiptWrite = require('../receipt/write');
const { planAwareMarkdownHash } = require('../receipt/hash');

// Exit codes. 12 mirrors codex-invoke's BLOCKING_EXIT so callers branch on one
// vocabulary; 11 is distinct so "another run owns this decision" never reads as
// "the gate blocked".
const EX_OK = 0;
const EX_BLOCKED = 12;
const EX_LOCK_HELD = 11;
const EX_USAGE = 2;

// Names that get concatenated into temp paths must not be able to contain a
// path separator or a `..` segment (see run()).
const SAFE_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const LOCK_LEASE_MS = 15 * 60 * 1000;   // > a 900s codex call, so a live review is never reclaimed
const HEARTBEAT_EVERY_MS = 20 * 1000;
const DEFAULT_ADJUDICATION_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 1000;
const FILE_MODE = 0o600;
const MARKER_WRITE_ATTEMPTS = 3;
const MARKER_RETRY_DELAY_MS = 50;

function gitTmpDir(cwd) {
  const rel = execFileSync('git', ['rev-parse', '--git-path', 'mccp/tmp'],
    { cwd: cwd, encoding: 'utf8' }).trim();
  const abs = path.isAbsolute(rel) ? rel : path.resolve(cwd, rel);
  fs.mkdirSync(abs, { recursive: true });
  return abs;
}

// security S5 — owner-only, atomic-ish, and never at a predictable path that an
// attacker could pre-create as a symlink.
function writePrivate(file, text) {
  const tmp = file + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, text, { mode: FILE_MODE });
  fs.renameSync(tmp, file);
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

function paths(tmpDir, decisionId, nonce) {
  return {
    lock: path.join(tmpDir, 'intent-gate-' + decisionId + '.lock'),
    awaiting: path.join(tmpDir, 'intent-awaiting-' + nonce + '.json'),
    adjudication: path.join(tmpDir, 'intent-adjudication-' + nonce + '.json'),
    marker: path.join(tmpDir, 'intent-marker-' + nonce + '.json'),
    envelope: path.join(tmpDir, 'intent-envelope-' + nonce + '.json'),
  };
}

// ---------------------------------------------------------------------------
// per-decision lease lock (Implement-Codex R1 F5)
// ---------------------------------------------------------------------------
//
// Host-aware tri-state, mirroring pr-phase-lock.js: a live PID on THIS host is
// never reclaimed (that is a real running review), while a dead PID or a
// foreign host past the lease is. Without this, a retry launched while the
// first runner is still working produces two writers for one receipt, and the
// loser can overwrite after the winner's marker was already validated.
function acquireLock(lockPath, nonce) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockPath, 'wx', FILE_MODE);
      fs.writeSync(fd, JSON.stringify({
        run_nonce: nonce, pid: process.pid, host: os.hostname(),
        started_at: new Date().toISOString(),
      }));
      fs.closeSync(fd);
      return { ok: true };
    } catch (err) {
      if (err.code !== 'EEXIST') return { ok: false, reason: 'lock-error: ' + err.message };
      let body = null;
      let mtimeMs = 0;
      try {
        body = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        mtimeMs = fs.statSync(lockPath).mtimeMs;
      } catch (_) { /* unreadable → treat as reclaimable below */ }
      // §3.6 tri-state. On OUR host, PID liveness is authoritative and the
      // lease is irrelevant: a live PID is never reclaimed (that is a real
      // 900s-capable review in flight), and a dead PID is reclaimed at once
      // rather than making the next run wait out a lease it already knows is
      // orphaned. On a FOREIGN host we cannot probe liveness, so the mtime
      // lease is the only available signal. An unreadable body is corrupt →
      // reclaim.
      const sameHost = body && body.host === os.hostname();
      if (sameHost) {
        if (pidAlive(body.pid)) return { ok: false, reason: 'held', holder: body };
      } else if (body && (Date.now() - mtimeMs) <= LOCK_LEASE_MS) {
        return { ok: false, reason: 'held', holder: body };
      }
      try { fs.unlinkSync(lockPath); } catch (_) { /* someone else won the race */ }
    }
  }
  return { ok: false, reason: 'held' };
}

function releaseLock(lockPath, nonce) {
  try {
    const body = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (body && body.run_nonce !== nonce) return;   // not ours — leave it alone
  } catch (_) { /* unreadable → fall through and remove */ }
  try { fs.unlinkSync(lockPath); } catch (_) { /* already gone */ }
}

function heartbeat(lockPath) {
  try { const now = new Date(); fs.utimesSync(lockPath, now, now); } catch (_) { /* best effort */ }
}

// ---------------------------------------------------------------------------
// adjudication wait
// ---------------------------------------------------------------------------

// Bounded, synchronous wait. Synchronous on purpose: this process exists solely
// to hold the payload, and a blocking loop keeps that lifetime obvious. The
// heartbeat keeps the lease fresh so a concurrent runner still sees us as live.
function waitForAdjudication(p, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastBeat = 0;
  const sab = new Int32Array(new SharedArrayBuffer(4));
  while (Date.now() < deadline) {
    if (fs.existsSync(p.adjudication)) {
      // security S4 — enforce the byte bound at the READ boundary, not after.
      // parseAdjudicationFile also checks it, but by then the whole file is
      // already a string in this process: a multi-gigabyte file would exhaust
      // memory before the intended `incomplete` verdict could be returned, so
      // the bound would exist on paper only.
      let size = 0;
      try { size = fs.statSync(p.adjudication).size; }
      catch (err) { return { ok: false, reason: 'adjudication unstatable: ' + err.message }; }
      if (size > ic.ADJUDICATION_LIMITS.FILE_BYTES) {
        return { ok: false, reason: 'adjudication file too large (' + size + ' bytes > ' +
          ic.ADJUDICATION_LIMITS.FILE_BYTES + ') — refused before reading it' };
      }
      try { return { ok: true, text: fs.readFileSync(p.adjudication, 'utf8') }; }
      catch (err) { return { ok: false, reason: 'adjudication unreadable: ' + err.message }; }
    }
    if (Date.now() - lastBeat > HEARTBEAT_EVERY_MS) {
      heartbeat(p.lock);
      lastBeat = Date.now();
    }
    Atomics.wait(sab, 0, 0, POLL_INTERVAL_MS);
  }
  return { ok: false, reason: 'timed out after ' + timeoutMs + 'ms waiting for adjudication' };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// The marker is the caller's ONLY channel. plan.md Phase 5.6 launches this runner
// detached and then polls for the marker, so neither this process's stderr nor its
// exit code ever reaches the caller. Dropping the marker therefore does not merely
// lose a log line — it downgrades a precise `blocked` verdict, with its actionable
// reason, into an indistinguishable `crashed`. Retry first (on Windows the AV
// scanner and the search indexer both take transient locks on a freshly renamed
// file), then fall back to just the four fields Phase 5.6 actually branches on,
// which is far likelier to land when the original write failed on ENOSPC.
function writeMarker(markerPath, body) {
  for (let attempt = 1; attempt <= MARKER_WRITE_ATTEMPTS; attempt++) {
    try { writePrivate(markerPath, JSON.stringify(body, null, 2)); return true; }
    catch (err) {
      if (attempt < MARKER_WRITE_ATTEMPTS) { sleepMs(MARKER_RETRY_DELAY_MS); continue; }
      process.stderr.write('[plan-codex-runner] marker write failed after ' +
        MARKER_WRITE_ATTEMPTS + ' attempts: ' + err.message + '\n');
    }
  }
  try {
    writePrivate(markerPath, JSON.stringify({
      run_nonce: body.run_nonce,
      decision_id: body.decision_id,
      exit_code: body.exit_code,
      intent_gate_verdict: body.intent_gate_verdict,
      reason: body.reason || null,
      marker_degraded: true,
    }));
    process.stderr.write('[plan-codex-runner] wrote a minimal degraded marker instead\n');
    return true;
  } catch (err) {
    process.stderr.write('[plan-codex-runner] FATAL: no marker could be written (' +
      err.message + '). The caller cannot read this run\'s verdict and will fail ' +
      'closed on the crashed/timeout path.\n');
    return false;
  }
}

// A receipt the runner refuses to stand behind must not stay on the consumable
// path. It carries this run's nonce, so leaving it would both let
// /mccp:prp-implement read a receipt bound to a body that was never reviewed and
// make Phase 5.6's markerless recovery — which infers success from "a receipt
// seals our nonce" — report this blocked run as a success. Rename rather than
// delete: the artifact stays available for diagnosis, just not for consumption.
function quarantineReceipt(receiptPath, nonce) {
  if (!receiptPath) return;
  // Nothing on disk means nothing on the consumable path — the invariant already
  // holds, so this is not a degraded outcome worth shouting about.
  if (!fs.existsSync(receiptPath)) return;
  const dest = receiptPath + '.invalid-' + nonce;
  try {
    fs.renameSync(receiptPath, dest);
    process.stderr.write('[plan-codex-runner] quarantined the mis-sealed receipt → ' + dest + '\n');
  } catch (err) {
    process.stderr.write('[plan-codex-runner] FATAL: could not quarantine the mis-sealed ' +
      'receipt at ' + receiptPath + ' (' + err.message + '). Remove it by hand before ' +
      're-running — it seals a body that was never reviewed.\n');
  }
}

function run(opts, deps) {
  const o = opts || {};
  const d = deps || {};
  const invoke = d.invokeAdversarialReview || codexInvoke.invokeAdversarialReview;
  const write = d.write || receiptWrite.write;
  const env = o.env || process.env;
  const cwd = o.cwd || process.cwd();

  const planPath = o.plan;
  const decisionId = o.decision;
  const nonce = o.runNonce;
  if (!planPath || !decisionId || !nonce) {
    return { exitCode: EX_USAGE, error: '--plan, --decision and --run-nonce are required' };
  }

  // Both values are concatenated into temp-file paths below. Unvalidated, a
  // `..` segment makes path.join escape the tmp dir entirely — and the lock
  // reclaim path calls unlinkSync, so an escaping name turns a malformed slug
  // into arbitrary file deletion. The property required here is "no path
  // separators, no traversal", not "must be a UUID": callers generate a
  // randomUUID (which matches this grammar) but uniqueness is their job, and
  // demanding UUID shape here would only move the failure without adding
  // containment.
  if (!SAFE_TOKEN_RE.test(decisionId)) {
    return { exitCode: EX_USAGE,
      error: '--decision must match ' + SAFE_TOKEN_RE + ' (got "' + decisionId + '")' };
  }
  if (!SAFE_TOKEN_RE.test(nonce)) {
    return { exitCode: EX_USAGE,
      error: '--run-nonce must match ' + SAFE_TOKEN_RE + ' (got "' + nonce + '")' };
  }

  const tmpDir = o.tmpDir || gitTmpDir(cwd);
  const p = paths(tmpDir, decisionId, nonce);

  // Defence in depth: the grammar above already forbids separators, so this
  // should be unreachable. It is here because every path this process writes,
  // renames or unlinks is derived from caller input, and an assert is cheaper
  // than trusting one regex to stay correct.
  const base = path.resolve(tmpDir) + path.sep;
  const escaped = Object.keys(p).filter(function (k) {
    return (path.resolve(p[k]) + path.sep).indexOf(base) !== 0;
  });
  if (escaped.length) {
    return { exitCode: EX_USAGE,
      error: 'derived path(s) escape the tmp dir: ' + escaped.join(', ') };
  }

  const lock = acquireLock(p.lock, nonce);
  if (!lock.ok) {
    if (lock.reason === 'held') {
      process.stderr.write('[plan-codex-runner] another run already owns decision "' +
        decisionId + '" (pid ' + (lock.holder && lock.holder.pid) + '). ' +
        'Attach to its marker instead of launching a second writer.\n');
      return { exitCode: EX_LOCK_HELD, error: 'lock held', holder: lock.holder || null };
    }
    return { exitCode: EX_BLOCKED, error: lock.reason };
  }

  try {
    const planAbs = path.resolve(cwd, planPath);
    const planText = fs.readFileSync(planAbs, 'utf8');
    const planDigest = planAwareMarkdownHash(planAbs);
    // DD4-1 anchor — everything except the section this gate rewrites itself.
    const stableAtReview = ic.stableBodyDigest(planText);

    // L1 — build the reference from the User Intent table ONLY (DD8). No other
    // part of the plan is reachable from here, which is how author rationale is
    // kept out of the reviewer's context structurally rather than by lint.
    const section = ic.extractIntentSection(planText);
    const intentReference = section.present ? ic.buildIntentReference(section.items) : null;

    const envelope = invoke(o.focus || '', {
      env: env,
      timeoutMs: o.codexTimeoutMs,
      json: true,
      impeccableAvailable: o.impeccableAvailable === true,
      intentReference: intentReference,
    });

    // Audit copy only. Nothing below reads this back (DD3).
    writeMarkerSafe(p.envelope, envelope);

    const gate = codexPayload.deriveGateVerdict({
      envelope: envelope,
      freeText: (envelope && envelope.stdout) || '',
    });
    const codexVerdict = (envelope && envelope.classification === 'disabled')
      ? 'skipped' : gate.verdict;

    const meta = { codex_disabled: envelope && envelope.classification === 'disabled' };

    // DD3 — an unreadable review is NOT "zero findings". Absence of evidence is
    // never read as evidence of absence; this branch is owned here, before the
    // oracle, so the oracle only ever sees a non-null payload.
    let payload = null;
    if (!meta.codex_disabled) {
      payload = codexPayload.parseReviewPayload(envelope);
      if (payload === null) {
        return finish(EX_BLOCKED, {
          verdict: 'incomplete',
          reason: 'codex review payload unreadable (classification=' +
            (envelope && envelope.classification) + ')',
        });
      }
    }

    // Does the gate even apply? free-form plan / codex disabled / zero findings
    // are legitimate skips, each mechanically corroborated (DD1).
    const skipProof = ic.resolveSkipProof({ planText: planText, reviewPayload: payload, meta: meta });

    let decision;
    if (skipProof) {
      decision = { verdict: 'skipped', skipProof: skipProof, counts: null,
        reason: 'gate does not apply (' + skipProof + ')' };
    } else {
      // Publish findings for the LLM to adjudicate, then wait — still holding
      // `payload` in memory as the sole source of truth for the digests.
      writePrivate(p.awaiting, JSON.stringify({
        run_nonce: nonce,
        decision_id: decisionId,
        plan_path: planPath,
        review_payload_digest: ic.canonicalDigest(payload),
        findings: payload.findings.map(function (f, i) {
          return { finding_index: i, finding_digest: ic.canonicalDigest(f), finding: f };
        }),
        adjudication_path: p.adjudication,
      }, null, 2));
      process.stderr.write('[plan-codex-runner] awaiting adjudication → ' + p.adjudication + '\n');

      const waited = waitForAdjudication(p, o.adjudicationTimeoutMs
        || parseInt(env.MCCP_INTENT_ADJUDICATION_TIMEOUT_MS, 10) || DEFAULT_ADJUDICATION_TIMEOUT_MS);
      if (!waited.ok) {
        return finish(EX_BLOCKED, { verdict: 'incomplete', reason: waited.reason });
      }
      const parsed = ic.parseAdjudicationFile(waited.text);
      if (!parsed.ok) {
        return finish(EX_BLOCKED, { verdict: 'incomplete',
          reason: 'adjudication file rejected: ' + parsed.reason });
      }
      decision = ic.decideIntentGate({
        planText: planText,
        section: section,
        reviewPayload: payload,
        adjudications: parsed.value,
        meta: meta,
      });
    }

    const overrideReason = ic.parseIntentGateSkipReason(env);
    const derived = ic.deriveIntentGateDecision(decision, {
      forceOverrideActive: !!overrideReason,
    });

    if (!derived.runtimeAllowed) {
      return finish(EX_BLOCKED, derived, decision);
    }

    // DD4-1 — re-read the plan immediately before writing, and REFUSE to write
    // if the reviewed body has moved out from under the decision.
    //
    // The plan's literal wording ("the whole digest must match or abort") cannot
    // hold: this gate requires the caller to replace the `## Codex Adversarial
    // Review` placeholder with the triage record before the receipt is written,
    // and the receipt must seal the FINAL body or validate-cmd reports it stale
    // immediately. A whole-body equality check would abort every successful run.
    //
    // The enforceable form is to bind the STABLE REMAINDER: elide the section
    // the gate itself writes and require the rest to be byte-identical. That
    // still covers everything the decision was actually derived from — the
    // `## User Intent` table that produced the reviewer's reference, and the
    // Tasks/Design Decisions Codex reviewed. Editing those between review and
    // write now fails closed with no receipt written, which is what DD4-1
    // promised; only the gate's own injection is exempt, and it is exempt by
    // name rather than by being indistinguishable.
    const planTextAtWrite = fs.readFileSync(planAbs, 'utf8');
    const stableAtWrite = ic.stableBodyDigest(planTextAtWrite);
    if (stableAtWrite !== stableAtReview) {
      return finish(EX_BLOCKED, {
        verdict: 'incomplete',
        reason: 'plan body changed outside the gate-injected review record between ' +
          'review and write — the adjudicated findings and the User Intent section no ' +
          'longer describe the body this receipt would seal. Re-run /mccp:plan.',
      });
    }

    const digestNow = planAwareMarkdownHash(planAbs);
    if (digestNow !== planDigest) {
      process.stderr.write('[plan-codex-runner] plan whole-body digest moved between review ' +
        'and write (reviewed ' + planDigest + ', sealing ' + digestNow + '). The stable ' +
        'remainder is unchanged, so this is the gate injecting its own review record.\n');
    }

    // The runner now owns this receipt write, so the audit flags the command
    // body used to pass to `cli.js write` must ride along or they would be
    // silently dropped from plan-codex receipts. These are ordinary audit
    // fields with existing CLI surfaces elsewhere — unlike intentDecision,
    // forwarding them creates no forgery channel (they cannot make a receipt
    // read as intent-approved).
    const passThrough = {};
    ['impeccable-skipped', 'impeccable-silent-skip'].forEach(function (k) {
      if (o[k] === true) passThrough[k] = true;
    });
    ['impeccable-skip-reason', 'impeccable-silent-skip-reason', 'design-critique-rounds',
      'design-critique-verdict', 'design-intent-reason', 'impeccable-routing-mode',
    ].forEach(function (k) {
      if (o[k] !== undefined && o[k] !== null && o[k] !== '') passThrough[k] = o[k];
    });

    const result = write(Object.assign({
      gate: 'mccp-plan-codex',
      decision: decisionId,
      plan: planPath,
      cwd: cwd,
      'codex-verdict': codexVerdict,
    }, passThrough, {
      intentDecision: {
        verdict: derived.verdict,
        runtime_allowed: derived.runtimeAllowed,
        reason: derived.reason,
        skip_proof: decision.skipProof || null,
        counts: decision.counts || null,
        section_present: section.present,
        items_count: section.present ? section.items.length : null,
        reference_injected: !!intentReference,
        plan_digest: digestNow,
        run_nonce: nonce,
        force_override: derived.overrideActive,
        force_override_reason: overrideReason || null,
      },
    }));

    // DD4-2 / security S2 — write.js recomputes plan_hash by re-reading the file
    // itself, so a residual window exists between our re-read above and its own.
    // Verify the RETURNED receipt rather than assuming: the failure mode this
    // closes is a runner that reports success while leaving a receipt whose
    // sealed body is not the one that was reviewed.
    if (!result || !result.receipt || result.receipt.plan_hash !== digestNow) {
      process.stderr.write('[plan-codex-runner] FATAL: written receipt plan_hash ' +
        ((result && result.receipt && result.receipt.plan_hash) || '(none)') +
        ' != sealed digest ' + digestNow + '\n');
      quarantineReceipt(result && result.path, nonce);
      // Pass no write result: there is no receipt the caller may act on, so the
      // marker must not advertise a receipt_path that has just been quarantined.
      return finish(EX_BLOCKED, {
        verdict: 'incomplete',
        reason: 'post-write plan_hash mismatch — receipt does not seal the reviewed body',
      }, null, null);
    }

    return finish(EX_OK, derived, decision, result);

    function finish(exitCode, derivedOrDecision, rawDecision, writeResult) {
      // writeMarker returns false only when the retry AND the degraded fallback
      // both failed. Nothing here can escalate that: this process is detached, so
      // its exit code and stdout are discarded, and the one channel to the caller
      // is the file that just could not be written. Recovery therefore lives on
      // the caller side — plan.md 5.2 and 5.6 fall back to the nonce this run
      // sealed inside the receipt. That covers every SUCCESSFUL run; a blocked run
      // has no receipt to seal, so it degrades to `crashed`, which still stops the
      // chain. Surfaced in the result because the in-process tests assert on it
      // and because a silent `false` here is exactly the kind of lost signal this
      // gate exists to prevent.
      const markerWritten = writeMarker(p.marker, {
        run_nonce: nonce,
        decision_id: decisionId,
        plan_digest: planDigest,
        receipt_path: (writeResult && writeResult.path) || null,
        receipt_hash: (writeResult && writeResult.receipt && writeResult.receipt.receipt_hash) || null,
        intent_gate_verdict: derivedOrDecision.verdict,
        codex_verdict: codexVerdict,
        exit_code: exitCode,
        reason: derivedOrDecision.reason || null,
      });
      return {
        exitCode: exitCode,
        verdict: derivedOrDecision.verdict,
        reason: derivedOrDecision.reason || null,
        receiptPath: (writeResult && writeResult.path) || null,
        markerPath: p.marker,
        markerWritten: markerWritten,
      };
    }
  } catch (err) {
    writeMarker(p.marker, {
      run_nonce: nonce, decision_id: decisionId, exit_code: EX_BLOCKED,
      intent_gate_verdict: 'incomplete',
      reason: (err && err.message) || String(err),
    });
    process.stderr.write('[plan-codex-runner] ' + ((err && err.stack) || err) + '\n');
    return { exitCode: EX_BLOCKED, error: (err && err.message) || String(err) };
  } finally {
    // security S5 — the adjudication + awaiting artifacts are per-run scratch.
    // The envelope audit copy and the marker deliberately survive.
    //
    // The adjudication file matters most here: unlike everything else this
    // process writes, it is authored by the caller's shell heredoc (Phase 5.5a)
    // and so lands with the ambient umask rather than this module's 0600. Its
    // path is nonce-scoped but sits in a shared git tmp dir, and it is already
    // fully consumed — the decision was derived from it before this block runs.
    try { if (fs.existsSync(p.awaiting)) fs.unlinkSync(p.awaiting); } catch (_) {}
    try { if (fs.existsSync(p.adjudication)) fs.unlinkSync(p.adjudication); } catch (_) {}
    releaseLock(p.lock, nonce);
  }
}

function writeMarkerSafe(file, obj) {
  try { writePrivate(file, JSON.stringify(obj, null, 2)); }
  catch (err) {
    process.stderr.write('[plan-codex-runner] audit copy write failed: ' + err.message + '\n');
  }
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--plan' && i + 1 < argv.length) { o.plan = argv[++i]; continue; }
    if (a === '--decision' && i + 1 < argv.length) { o.decision = argv[++i]; continue; }
    if (a === '--run-nonce' && i + 1 < argv.length) { o.runNonce = argv[++i]; continue; }
    if (a === '--focus' && i + 1 < argv.length) { o.focus = argv[++i]; continue; }
    if (a === '--impeccable-available') { o.impeccableAvailable = true; continue; }
    if (a === '--codex-timeout-ms' && i + 1 < argv.length) {
      o.codexTimeoutMs = parseInt(argv[++i], 10); continue;
    }
    if (a === '--adjudication-timeout-ms' && i + 1 < argv.length) {
      o.adjudicationTimeoutMs = parseInt(argv[++i], 10); continue;
    }
    // Audit pass-through for flags the command body used to hand to cli.js
    // write. NOTE: there is deliberately NO `--intent-*` flag here — the intent
    // decision is programmatic-only (Implement-Codex R1 F2).
    if (a === '--impeccable-skipped') { o['impeccable-skipped'] = true; continue; }
    if (a === '--impeccable-silent-skip') { o['impeccable-silent-skip'] = true; continue; }
    if (i + 1 < argv.length && [
      '--impeccable-skip-reason', '--impeccable-silent-skip-reason',
      '--design-critique-rounds', '--design-critique-verdict',
      '--design-intent-reason', '--impeccable-routing-mode',
    ].indexOf(a) !== -1) {
      o[a.slice(2)] = argv[++i];
      continue;
    }
  }
  return o;
}

if (require.main === module) {
  const r = run(parseArgs(process.argv.slice(2)));
  if (r.error) process.stderr.write('[plan-codex-runner] ' + r.error + '\n');
  process.stdout.write(JSON.stringify(r) + '\n');
  process.exit(r.exitCode);
}

module.exports = {
  run: run,
  parseArgs: parseArgs,
  acquireLock: acquireLock,
  releaseLock: releaseLock,
  paths: paths,
  EX_OK: EX_OK,
  EX_BLOCKED: EX_BLOCKED,
  EX_LOCK_HELD: EX_LOCK_HELD,
  EX_USAGE: EX_USAGE,
  // Exposed so the test can assert the DEFAULT wiring really points at the real
  // modules — a DI-only test proves the fake path and nothing else (Codex F4).
  defaultDeps: {
    invokeAdversarialReview: codexInvoke.invokeAdversarialReview,
    write: receiptWrite.write,
  },
};
