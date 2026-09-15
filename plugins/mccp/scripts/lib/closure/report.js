'use strict';

/**
 * closure — read-only report of debt denominator gap and disposition ledger
 *
 * Reads three ledgers without writing: sealed inventory, disposition ledger,
 * and live registry. Computes the gap between sealed denominator and live debt,
 * and surfaces both the disposition counts (sealed) and findings registry closure
 * rate (live) in one report. No game-changing decisions here — only surfacing
 * what already exists.
 *
 * Mirror: plugins/mccp/scripts/derive/sources/backlog.js:74-82 (EMPTY pattern)
 */

const path = require('path');

/**
 * Scrub absolute paths from a message: a path under the repo root becomes its
 * repo-relative form, any other absolute path becomes its basename.
 *
 * The rule is general, not a list of known prefixes — an earlier version
 * enumerated /home/, /Users/ and a drive letter, and everything else
 * (/tmp/, /var/lib/, /root/, /private/var/) walked straight through.
 *
 * Covers POSIX absolute paths, Windows drive paths in either case, and
 * multi-line `Require stack:` blocks. http(s) URLs are matched first and
 * returned verbatim; other schemes (`file://…`) are treated as paths, because
 * a file: URL carries a real filesystem path and exempting it would leak.
 *
 * What it does NOT promise: that the output can never contain the literal text
 * "/home/". A path-shaped token is folded, but this is a string transform on
 * arbitrary upstream text, not a proof about every possible input. The
 * falsifiable claim is the transform's behaviour, which its tests pin case by
 * case; the report-level guarantee is asserted separately at Task 4(f).
 */
function scrubPathsFromMessage(message, repoRoot) {
  if (!message || typeof message !== 'string') return message;

  // Strip a trailing separator: with `repoRoot` given as `<root>/`, the
  // repo-relative slice below removed one character too many and turned
  // `<root>/plugins/foo.js` into `.plugins/foo.js`.
  const normalized = path.normalize(repoRoot).replace(/[\\/]+$/, '');

  // ONE pass over three alternatives. Running them as sequential replaces made
  // each pass re-scan the previous one's OUTPUT: a repo-internal path already
  // reduced to `plugins/mccp/.../report.js` was matched again by the bare-POSIX
  // rule and collapsed to `pluginsreport.js` — neither a path nor a basename.
  //
  // The lookbehind is what keeps non-path tokens intact. Without it `1115/1115`
  // matched at `/1115` and became `11151115`, and `https://github.com/x` lost
  // everything after the colon. This string is an audit record, so corrupting it
  // is its own defect even on the runs where no path would have leaked.
  const escapedRoot = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // An http(s) URL is matched FIRST and returned verbatim. Earlier the URL was
  // protected by excluding `:` and `/` from the lookbehind instead, which also
  // exempted `file:///home/…`, `cwd:/home/…` and `-/home/…` — three shapes Node
  // and our own callers really emit, so the docstring's "never returns /home/"
  // was false. Matching URLs explicitly lets the lookbehind stay narrow.
  const ABSOLUTE = new RegExp(
    '(?<![\\w.])(?:'
      + '(https?://[^\\s"\'`<>{}]+)'            // an http(s) URL: kept as-is
      + '|' + escapedRoot + '(?:/[^\\s"\'`<>{}]*)?'  // under the repo root
      + '|/[^\\s"\'`<>{}]+'                     // any other POSIX absolute path
      + '|[A-Za-z]:\\\\[^\\s"\'`<>{}]+'         // Windows drive path, either case
    + ')',
    'g'
  );
  return message.replace(ABSOLUTE, function (match) {
    if (/^https?:\/\//.test(match)) return match;
    if (match.indexOf(normalized) === 0) {
      return match.slice(normalized.length).replace(/^\//, '') || '.';
    }
    if (match.charAt(0) === '/') return path.basename(match);
    const parts = match.split('\\');
    return parts[parts.length - 1];
  });
}

/**
 * buildClosureReport(repoRoot) — pure oracle, no side effects
 *
 * Returns an object with fields:
 *  - seal: {sealed_at, sealed_at_commit, inventory_sha256, items, by_source, age_days}
 *  - live: {items, by_source}
 *  - denominator_gap: {count, pct}
 *  - dispositions: {total, by_disposition, disposed, resolved, fixed, suppressing}
 *  - ledgers: [] (two rows: dispositions and findings)
 *  - degraded: [] (errors during read)
 *  - reseal_warning: null or string (only if gap > 0)
 *
 * Every return path contains all fields (EMPTY pattern). Read failures are
 * collected in degraded[] instead of throwing.
 */
function buildClosureReport(repoRoot) {
  // Shape we return on every path
  const EMPTY = {
    seal: null,
    live: null,
    denominator_gap: null,
    dispositions: null,
    ledgers: [],
    degraded: [],
    reseal_warning: null,
  };

  // Require debtInv once at the start (will be intercepted by test mocks)
  const debtInv = require('../msw-metrics/debt-inventory');

  // Read sealed inventory
  let sealDoc = null;
  try {
    const raw = debtInv.readInventory(repoRoot);
    if (raw) {
      sealDoc = raw;
    }
  } catch (err) {
    const reason = scrubPathsFromMessage(err.message || String(err), repoRoot);
    return Object.assign({}, EMPTY, {
      degraded: [{ name: 'sealed-inventory', reason }],
    });
  }

  if (!sealDoc) {
    return Object.assign({}, EMPTY, {
      degraded: [{ name: 'sealed-inventory', reason: 'not found' }],
    });
  }

  // `readInventory` returns whatever JSON.parse produced — it validates nothing
  // (debt-inventory.js:385-389), so shape checking is the caller's job. Without
  // this, a seal whose `items` is a truthy non-array (or holds a null entry)
  // reaches the `.map` below and throws OUT of an oracle whose whole contract is
  // that it never throws; the CLI then prints zero bytes and exits 0, so a
  // `--json` consumer receives empty input and no reason for it.
  //
  // A file that parses but is not a seal (`[]`, `"x"`) is equally not a seal:
  // reporting it as an honest empty inventory would publish `items: 0` with an
  // empty degraded[], which is a measurement, not a diagnosis.
  if (!Array.isArray(sealDoc.items)
      || sealDoc.items.some(function (it) { return !it || typeof it !== 'object'; })) {
    return Object.assign({}, EMPTY, {
      degraded: [{
        name: 'sealed-inventory',
        reason: 'malformed: `items` is not an array of objects '
          + '(got ' + (Array.isArray(sealDoc.items) ? 'array with non-object entries' : typeof sealDoc.items) + ')',
      }],
    });
  }

  // Extract seal info
  const meta = sealDoc.meta || {};
  const sealedAt = meta.sealed_at || null;
  const sealedAtCommit = meta.sealed_at_commit || null;
  const inventorySha = sealDoc.inventory_sha256 || null;
  const sealItems = (sealDoc.items || []).length;
  const sealBySource = {};
  if (meta.stats && meta.stats.by_source) {
    Object.assign(sealBySource, meta.stats.by_source);
  }

  // Calculate seal age
  let ageDays = null;
  if (sealedAt) {
    const sealTime = new Date(sealedAt).getTime();
    const nowTime = new Date().getTime();
    ageDays = Math.floor((nowTime - sealTime) / (1000 * 60 * 60 * 24));
  }

  // Read dispositions ledger
  let dispoDoc = null;
  let dispositionError = null;
  try {
    dispoDoc = debtInv.readDispositions(repoRoot);
  } catch (err) {
    const reason = scrubPathsFromMessage(err.message || String(err), repoRoot);
    dispositionError = { name: 'disposition-ledger', reason };
  }

  if (!dispoDoc) {
    const reason = dispositionError ? dispositionError.reason : 'unknown error';
    return Object.assign({}, EMPTY, {
      seal: {
        sealed_at: sealedAt,
        sealed_at_commit: sealedAtCommit,
        inventory_sha256: inventorySha,
        items: sealItems,
        by_source: sealBySource,
        age_days: ageDays,
      },
      degraded: [{ name: 'disposition-ledger', reason }],
    });
  }

  if (!dispoDoc.ok) {
    const reason = scrubPathsFromMessage(dispoDoc.error || 'unknown error', repoRoot);
    return Object.assign({}, EMPTY, {
      seal: {
        sealed_at: sealedAt,
        sealed_at_commit: sealedAtCommit,
        inventory_sha256: inventorySha,
        items: sealItems,
        by_source: sealBySource,
        age_days: ageDays,
      },
      degraded: [{ name: 'disposition-ledger', reason }],
    });
  }

  // Use upstream foldDispositions (last-write-wins per item) to count uniquely per item_id
  // Upstream verifyDispositions filters on `index.has(r.item_id)`
  // (debt-inventory.js:606-608). Without that membership test a line whose sha
  // matches but whose item is not in the seal is still folded, so `disposed` can
  // exceed `total` — measured 3/1 = 300% closure. That is an error in the
  // success direction, the one direction this report may never make.
  const sealedIds = new Set((sealDoc.items || []).map(function (it) { return it.item_id; }));
  const boundLines = dispoDoc.lines.filter(function(line) {
    return line.inventory_sha256 === inventorySha && sealedIds.has(line.item_id);
  });
  const folded = debtInv.foldDispositions(boundLines);

  const dispositionsByType = {};
  let resolvedCount = 0;
  let fixedCount = 0;
  for (const rec of folded.values()) {
    const disp = rec.disposition || 'unknown';
    dispositionsByType[disp] = (dispositionsByType[disp] || 0) + 1;

    if (debtInv.SUPPRESSING_DISPOSITIONS.indexOf(rec.disposition) !== -1) {
      resolvedCount += 1;
      if (rec.disposition === 'fixed') {
        fixedCount += 1;
      }
    }
  }
  const disposedCount = folded.size;

  // Check if dispositions ledger has malformed lines
  // PR-Codex R2 F1 (HIGH, absorbed) — VERIFY the seal digest before trusting the
  // denominator it labels. `inventory_sha256` was read and echoed but never
  // recomputed, so a parseable truncation or a merge that kept the old digest
  // changed the denominator while retaining its binding. Reproduced against the
  // real seal: keeping only the first item yielded `closed: 1, total: 1, pct: 100`
  // with `degraded: []` — a fresh route to the same comfortable 100% this
  // milestone exists to remove. Upstream `verifyDispositions` already guards this
  // via inventoryHash; the report simply omitted the check.
  //
  // Verification is skipped only when the collector does not expose the hash (a
  // mocked module in tests) or the seal declares no digest — we never invent a
  // verdict we cannot compute.
  let sealDigestMismatch = null;
  if (inventorySha && typeof debtInv.inventoryHash === 'function') {
    try {
      const recomputed = debtInv.inventoryHash(sealDoc.items || []);
      if (recomputed !== inventorySha) {
        sealDigestMismatch = {
          name: 'seal-digest',
          reason: 'sealed inventory_sha256 does not match a recomputation over items[] — '
            + 'the seal is corrupt or truncated, so its denominator cannot be trusted',
        };
      }
    } catch (_e) {
      sealDigestMismatch = {
        name: 'seal-digest',
        reason: 'sealed inventory_sha256 could not be recomputed over items[]',
      };
    }
  }

  let disposalDegraded = null;
  if (dispoDoc.malformed && dispoDoc.malformed > 0) {
    disposalDegraded = {
      name: 'disposition-ledger',
      reason: 'malformed lines: ' + dispoDoc.malformed,
    };
  }

  // Read live inventory (buildInventory throws on failure)
  let liveInventory = null;
  let buildError = null;
  let liveInventoryDegraded = null;
  try {
    liveInventory = debtInv.buildInventory(repoRoot);
  } catch (err) {
    const reason = scrubPathsFromMessage(err.message || String(err), repoRoot);
    buildError = { name: 'live-inventory', reason };
  }

  if (!liveInventory) {
    return Object.assign({}, EMPTY, {
      seal: {
        sealed_at: sealedAt,
        sealed_at_commit: sealedAtCommit,
        inventory_sha256: inventorySha,
        items: sealItems,
        by_source: sealBySource,
        age_days: ageDays,
      },
      dispositions: {
        total: sealItems,
        by_disposition: dispositionsByType,
        disposed: disposedCount,
        resolved: resolvedCount,
        fixed: fixedCount,
        suppressing: debtInv.SUPPRESSING_DISPOSITIONS,
      },
      degraded: [buildError],
    });
  }

  // Ancestry depth is read through the same oracle the gate uses, so the report
  // cannot disagree with `verify` about how deep the chain is.
  let sealAncestryDepth = null;
  try {
    const anc = debtInv.sealAncestry(repoRoot, sealDoc);
    sealAncestryDepth = anc === null ? null : anc.verified.length;
  } catch (err) {
    sealAncestryDepth = null;
  }

  // Check for live inventory degradation (C5)
  if (liveInventory.stats && liveInventory.stats.findings_degraded) {
    liveInventoryDegraded = {
      name: 'live-inventory-findings',
      reason: 'findings registry read partially',
    };
  }

  const liveItems = (liveInventory.items || []).length;
  const liveBySource = liveInventory.stats ? liveInventory.stats.by_source : {};

  // Calculate gap (denominator is live items, not seal).
  //
  // PR-Codex R1 F1 (HIGH, absorbed) — count unsealed item IDENTITIES, not net
  // length growth. Subtracting lengths assumes every sealed item is still live,
  // and it is not: the collector drops closed findings and replaces fix-task
  // entries, so a disappearing sealed item silently offsets a newly added one.
  // Measured on this repo at absorption time: lengths gave 1689, identities gave
  // 1703, and 14 sealed items were no longer live. The pathological case is worse
  // than an undercount — equal additions and removals report a gap of 0, which
  // SUPPRESSES the reseal warning while unsealed debt exists. That is the exact
  // class of comfortable-false-number this milestone exists to remove, so the
  // instrument must not be able to produce it.
  //
  // `count` is therefore |live \ sealed| and is never negative. The old
  // subtraction survives as `net_change`, which is a different question ("did the
  // pile grow or shrink?") and CAN be negative — the plan's row-deletion case.
  const idOf = function (it) {
    return it && typeof it.item_id === 'string' && it.item_id.length > 0 ? it.item_id : null;
  };
  const sealItemsArr = sealDoc.items || [];
  const liveItemsArr = liveInventory.items || [];
  const sealIdList = sealItemsArr.map(idOf);
  const liveIdsAll = liveItemsArr.map(idOf);
  // An item with no usable identity cannot be compared. Reporting it as "sealed"
  // would undercount and reporting it as "unsealed" would overcount, so we refuse
  // to answer rather than guess — same contract as every other read failure here
  // (degraded[] + null, never 0).
  const identityIncomplete =
    sealIdList.some(function (id) { return id === null; }) ||
    liveIdsAll.some(function (id) { return id === null; });
  const sealedIdSet = new Set(sealIdList.filter(Boolean));
  const liveIdSet = new Set(liveIdsAll.filter(Boolean));
  const gapCount = identityIncomplete
    ? null
    : liveIdsAll.filter(function (id) { return !sealedIdSet.has(id); }).length;
  const sealedNotLive = identityIncomplete
    ? null
    : sealIdList.filter(function (id) { return !liveIdSet.has(id); }).length;
  const netChange = liveItems - sealItems;
  const gapPct = (gapCount !== null && liveItems > 0)
    ? parseFloat((gapCount * 100 / liveItems).toFixed(2))
    : null;

  // Read findings registry for ledgers (C5: capture degraded metadata)
  let findingsError = null;
  let findingsDegraded = [];
  let findingsIncomplete = false;
  let findingsInfo = { opened: 0, closed: 0 };
  try {
    const registry = require('../../state/findings-registry');
    const allFindings = registry.readAll({ repoRoot });

    // `degraded` is a BOOLEAN and the reasons are strings in `degraded_reasons`
    // (findings-registry.js:698-701); `malformed` counts unparsable lines. The
    // earlier Array.isArray test on that boolean could never be true, so registry
    // degradation never surfaced and a partially-read ledger was reported as a
    // complete count — the success-direction default this PRD exists to remove,
    // reproduced inside the instrument itself.
    const reasons = (allFindings && Array.isArray(allFindings.degraded_reasons))
      ? allFindings.degraded_reasons : [];
    const malformed = (allFindings && typeof allFindings.malformed === 'number')
      ? allFindings.malformed : 0;
    if (allFindings && (allFindings.degraded === true || reasons.length > 0 || malformed > 0)) {
      findingsIncomplete = true;
      const detail = reasons.length ? reasons.join(' · ') : ('malformed lines: ' + malformed);
      findingsDegraded.push({
        name: 'findings-registry',
        reason: scrubPathsFromMessage(detail, repoRoot),
      });
    }

    if (allFindings && Array.isArray(allFindings.findings)) {
      // Count opened vs closed (non-closed is open per upstream countFindings)
      let opened = 0;
      let closed = 0;
      for (const f of allFindings.findings) {
        if (f && f.state === 'closed') {
          closed += 1;
        } else if (f) {
          // Non-closed includes: open, finding_adjudicated (accepted), etc.
          opened += 1;
        }
      }
      findingsInfo = { opened, closed };
    }
  } catch (err) {
    const reason = scrubPathsFromMessage(err.message || String(err), repoRoot);
    findingsError = { name: 'findings-registry', reason };
  }

  // A zero is a claim; null is the honest "not measured". Reporting 0/0/0 for an
  // unreadable or partially-read registry is exactly the silently-short number
  // this instrument exists to make visible.
  const findingsUnknown = Boolean(findingsError) || findingsIncomplete;
  const findingsTotal = findingsUnknown ? null : findingsInfo.opened + findingsInfo.closed;
  const findingsClosed = findingsUnknown ? null : findingsInfo.closed;
  const findingsClosedPct = (!findingsUnknown && findingsTotal > 0)
    ? parseFloat((findingsClosed * 100 / findingsTotal).toFixed(2))
    : null;

  // Build ledgers array
  const ledgers = [];

  // Dispositions ledger. A malformed ledger nulls `dispositions` below, so this
  // row must be nulled by the SAME condition — publishing a definitive closure
  // rate beside a null dispositions block states two different things about one
  // measurement, and the confident one is the one a reader quotes.
  ledgers.push({
    name: 'disposition-ledger',
    closed: (disposalDegraded || sealDigestMismatch) ? null : disposedCount,
    total: (disposalDegraded || sealDigestMismatch) ? null : sealItems,
    pct: (!disposalDegraded && !sealDigestMismatch && sealItems > 0)
      ? parseFloat((disposedCount * 100 / sealItems).toFixed(2))
      : null,
    // The note must name the ACTUAL reason: a corrupt seal and a malformed
    // ledger are different failures, and a reader who is told the wrong one
    // looks in the wrong place.
    denominator_note: (disposalDegraded || sealDigestMismatch)
      ? 'sealed inventory at ' + (sealedAtCommit || 'unknown')
        + ' — NOT COUNTED ('
        + (sealDigestMismatch
          ? 'seal digest does not match its items'
          : 'ledger has malformed lines')
        + '; see degraded)'
      : 'sealed inventory at ' + (sealedAtCommit || 'unknown'),
  });

  // Findings registry ledger
  ledgers.push({
    name: 'findings-registry',
    closed: findingsClosed,
    total: findingsTotal,
    pct: findingsClosedPct,
    denominator_note: findingsUnknown
      ? 'live registry entries — NOT COUNTED (unreadable or partially read; see degraded)'
      : 'live registry entries',
  });

  // Build reseal warning if gap > 0. Suppressed when the ledger is malformed:
  // the warning quotes a disposition count, and quoting a number the row above
  // just declared NOT COUNTED is the same contradiction in a second place.
  // The old text said re-sealing was a future milestone's responsibility and that
  // it would "unbind all N disposition records". Both halves stopped being true
  // once the succession path landed: there is a tool, and it carries the judgments
  // forward instead of unbinding them. What it CANNOT carry is the part worth
  // naming here — an item that is no longer live gets no carried line, and an item
  // whose cross-reference no longer resolves is left unjudged on purpose.
  //
  // This names the path and stops there. `closure report` is an instrument, not a
  // gate: it still exits 0 no matter how large the gap is, and it does not tell
  // anyone to run anything automatically.
  let resealWarning = null;
  if (gapCount > 0 && !disposalDegraded && !sealDigestMismatch) {
    resealWarning = (
      gapCount + ' live item(s) are outside the sealed denominator. ' +
      'Succession is available: `node plugins/mccp/scripts/lib/msw-metrics/reseal.js` ' +
      'plans it and writes nothing. It carries the ' + disposedCount + ' existing ' +
      'disposition(s) forward rather than unbinding them, but items that are no ' +
      'longer live, and items whose duplicate_of no longer resolves, are reported ' +
      'as dropped or blocked instead of carried.'
    );
  }

  // Collect all degraded errors (print first for visibility per C6)
  const allDegraded = [];
  if (findingsError) allDegraded.push(findingsError);
  for (const d of findingsDegraded) allDegraded.push(d);
  if (disposalDegraded) allDegraded.push(disposalDegraded);
  if (sealDigestMismatch) allDegraded.push(sealDigestMismatch);
  if (liveInventoryDegraded) allDegraded.push(liveInventoryDegraded);
  // PR-Codex R1 F1 — an unidentifiable item makes the sealed/live set difference
  // unanswerable. Say so instead of returning a number that is quietly wrong.
  if (identityIncomplete) {
    allDegraded.push({
      name: 'denominator-gap-identity',
      reason: 'inventory item(s) missing item_id — sealed/live identity comparison not possible',
    });
  }

  // When degradation exists, render affected counts as null rather than silently-short
  // A corrupt seal poisons the sealed id set, so the gap computed against it is
  // not a smaller-but-honest number — it is unknown. Null it with the rest.
  const finalDenominatorGap = (allDegraded.length > 0 && liveInventoryDegraded) || sealDigestMismatch
    ? null
    : {
      count: gapCount,
      pct: gapPct,
      net_change: netChange,
      sealed_not_live: sealedNotLive,
    };

  const suppressingDispositions = debtInv.SUPPRESSING_DISPOSITIONS;

  return {
    seal: {
      sealed_at: sealedAt,
      sealed_at_commit: sealedAtCommit,
      inventory_sha256: inventorySha,
      items: sealItems,
      by_source: sealBySource,
      age_days: ageDays,
      // How many generations this denominator descends from. `null` when the
      // chain cannot be judged — the same "unreadable is not zero" rule the rest
      // of this report follows.
      ancestry_depth: sealAncestryDepth,
    },
    live: allDegraded.length > 0 && liveInventoryDegraded ? null : {
      items: liveItems,
      by_source: liveBySource,
    },
    denominator_gap: finalDenominatorGap,
    dispositions: (disposalDegraded || sealDigestMismatch) ? null : {
      total: sealItems,
      by_disposition: dispositionsByType,
      disposed: disposedCount,
      resolved: resolvedCount,
      fixed: fixedCount,
      suppressing: suppressingDispositions,
    },
    ledgers,
    degraded: allDegraded,
    reseal_warning: resealWarning,
  };
}

module.exports = {
  buildClosureReport,
  // Exported for test only. Task 4(f) calls the "no absolute path in the output"
  // assertion the single falsifiable one in this milestone, and it cannot be
  // falsified through buildClosureReport alone: reaching a degraded reason there
  // requires a reader to throw, so the well-formed fixtures the suite uses can
  // never carry a path. Reachable directly, the rule is testable against the
  // exact inputs that leaked before it existed.
  scrubPathsFromMessage,
};
