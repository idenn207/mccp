'use strict';

// multi-session-work-loop M10 — 부채 정산의 **반증 가능한** completion gate.
//
// 설계 근거: .claude/plans/multi-session-work-loop-m10.plan.md Task 8 (m8/m9 gate 거울)
//
// 무엇을 판정하는가. M10의 완료 주장은 "봉인된 분모의 전건이 처분을 갖는다"이고,
// 그 주장은 산문이 아니라 exit code로 답한다. 네 축:
//
//   1. **봉인 실재·불변·결속** — inventory_sha256이 items[]로 재계산해 일치하고,
//      모든 처분 줄이 그 값에 묶여 있는가.
//   2. **처분 완전성** — open 0 · unmatched 0 · 규칙 위반 0 · CRITICAL/HIGH `fixed` ≥ 1.
//   3. **의도 위반 레코드** — 선언과 실제가 어긋났던 축이 전건 기록됐고, `fixed`는
//      증거가 해소되며 `declaration-corrected`는 그 문장이 지목 문서에 **실재**하는가.
//   4. **flip 교차검증** — PRD의 M10 행이 실제로 `complete`가 됐는가.
//
// **축 4가 더하는 것은 하나뿐이다.** 축 1~3은 flip 여부와 무관하게 평가되므로, 축 4는
// "flip이 실제로 일어났는가"만 답한다. m9 gate는 미-flip 행을 `checked:false`로 건너뛰어
// flip 전 실행에서 축이 통째로 평가되지 않았다 — 그래서 Task 9가 flip 전/후 2회 실행을
// 의무화한다. 여기서는 축 1~3이 항상 평가되므로 flip 전 실행도 의미가 있고, 축 4만
// 미충족으로 남는다.
//
// **producer의 자기 보고를 그대로 믿지 않는다** (L2 architect 지적 흡수). 축 2가
// `verifyDispositions`의 출력만 읽으면, 그 함수의 검증이 느슨해질 때 gate는 그 사실을
// 볼 수 없다 — 인증 대상이 인증 근거를 만드는 구조다. 그래서 gate는 봉인과 원장을 **직접
// 읽어** open·binding·fixed를 자체 계산하고, producer의 답과 **대조**한다. 둘이 어긋나면
// 그 자체가 실패다(`producer_agrees:false`). 완전한 독립은 아니다 — 두 계산 모두 같은
// 두 파일을 읽는다 — 지만, 판정 로직의 drift는 이 대조가 잡는다.
//
// **입력을 읽을 수 없으면 fail-closed다** (L2 invariant 지적 흡수). 봉인 부재, 원장
// 판독 불가, 모듈 로드 실패는 전부 `ok:false`다. m9 gate가 'PRD unreadable' ·
// 'derive model unavailable'을 명시적으로 ok:false로 접는 것과 같은 방향이며, gate
// 기계 자체의 고장이 통과로 접히지 않는다.
//
// **위협 모델(정직히 명시)**: m8·m9 gate와 같다. 겨냥하는 것은 *우발적 미승인 flip과
// producer drift*이지 repo write 권한을 가진 위조자가 아니다. 후자는 이 파일도, 봉인도,
// 원장도 직접 쓸 수 있으므로 in-repo gate로 원리상 방어 불가이며 단일 운영자 신뢰경계라는
// PRD 전제상 범위 밖이다. **막지 못하는 것을 막는다고 적지 않는다.**
//
// 이 gate가 판정하지 **않는 것**: 어떤 항목이 여전히 유효한지, 그리고 어떤 처분이 옳은지.
// 전건을 `deferred`로 밀어도(CRITICAL/HIGH `fixed` 1건만 있으면) 축 2는 통과한다. 임의
// 비율 임계를 세우지 않는 이유는 방어할 근거가 없기 때문이고, 대신 대량 이연은
// successor별 집계로 **보이게** 만든다. 그 위는 사람이 본다.

const fs = require('fs');
const path = require('path');

const PRD_REL = '.claude/prds/multi-session-work-loop.prd.md';
const LEDGER_REL = 'docs/multi-session-work-loop/intent-violation-ledger.json';

// The axes M10 undertook to record. An id missing from the ledger is a failure:
// the list is what "every axis was accounted for" means.
const REQUIRED_IV_IDS = Object.freeze(['IV1', 'IV2', 'IV3', 'IV4', 'IV5']);
const IV_RESOLUTIONS = Object.freeze(['fixed', 'declaration-corrected']);

function readJson(abs) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(abs, 'utf8')) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function requireDebtInventory() {
  try {
    return { ok: true, mod: require('./debt-inventory') };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── axis 1 ───────────────────────────────────────────────────────────────────

function checkSeal(repoRoot, debt) {
  const abs = path.join(repoRoot, debt.INVENTORY_REL);
  if (!fs.existsSync(abs)) {
    return { ok: false, reason: 'inventory absent at ' + debt.INVENTORY_REL };
  }
  const doc = readJson(abs);
  if (!doc.ok) return { ok: false, reason: 'inventory unreadable: ' + doc.error };
  const items = doc.value && Array.isArray(doc.value.items) ? doc.value.items : null;
  if (!items) return { ok: false, reason: 'inventory has no items[]' };

  const recomputed = debt.inventoryHash(items);
  const sealIntact = recomputed === doc.value.inventory_sha256;

  const led = debt.readDispositions(repoRoot);
  if (!led.ok) return { ok: false, reason: 'disposition ledger unreadable: ' + led.error };

  let bound = 0;
  let mismatched = 0;
  for (const rec of led.lines) {
    if (rec.inventory_sha256 === doc.value.inventory_sha256) bound += 1;
    else mismatched += 1;
  }

  return {
    ok: sealIntact && mismatched === 0 && led.malformed === 0,
    seal_intact: sealIntact,
    inventory_sha256: doc.value.inventory_sha256,
    recomputed: recomputed,
    item_count: items.length,
    disposition_lines: led.lines.length,
    bound_lines: bound,
    mismatched_lines: mismatched,
    malformed_lines: led.malformed,
  };
}

// ── axis 2 ───────────────────────────────────────────────────────────────────

// Recomputed here rather than taken from the producer, then compared against it.
function checkDispositions(repoRoot, debt) {
  const doc = debt.readInventory(repoRoot);
  if (!doc) return { ok: false, reason: 'inventory absent' };
  const led = debt.readDispositions(repoRoot);
  if (!led.ok) return { ok: false, reason: 'disposition ledger unreadable: ' + led.error };

  const index = new Map(doc.items.map(function (i) { return [i.item_id, i]; }));
  const bound = led.lines.filter(function (r) {
    return r.inventory_sha256 === doc.inventory_sha256 && index.has(r.item_id);
  });
  const folded = new Map();
  for (const rec of bound) folded.set(rec.item_id, rec);

  let open = 0;
  let fixedAdjudicable = 0;
  for (const it of doc.items) {
    const rec = folded.get(it.item_id);
    if (!rec) { open += 1; continue; }
    if (rec.disposition === 'fixed' &&
      debt.ADJUDICABLE_SEVERITIES.indexOf(it.severity) !== -1) fixedAdjudicable += 1;
  }
  const unmatched = led.lines.filter(function (r) {
    return r.inventory_sha256 === doc.inventory_sha256 && !index.has(r.item_id);
  }).length;

  const own = {
    open: open,
    unmatched_dispositions: unmatched,
    adjudicable_fixed: fixedAdjudicable,
  };

  const reported = debt.verifyDispositions(repoRoot);
  const agrees = !!reported && reported.open === own.open &&
    reported.unmatched_dispositions === own.unmatched_dispositions &&
    reported.adjudicable_fixed === own.adjudicable_fixed;

  return {
    ok: own.open === 0 && own.unmatched_dispositions === 0 &&
      own.adjudicable_fixed >= 1 && agrees &&
      !!reported && reported.invalid_dispositions === 0,
    recomputed: own,
    producer_agrees: agrees,
    producer_reported: reported ? {
      open: reported.open,
      unmatched_dispositions: reported.unmatched_dispositions,
      adjudicable_fixed: reported.adjudicable_fixed,
      invalid_dispositions: reported.invalid_dispositions,
    } : null,
    deferrals_by_successor: reported ? reported.deferrals_by_successor : null,
  };
}

// ── axis 3 ───────────────────────────────────────────────────────────────────

// `declaration-corrected` is checked by CONTENT, not by file existence. A
// committed static file is true forever once it lands, which is the shape the M9
// gate calls out in its own source; asserting the corrected sentence is actually
// there is what makes the record falsifiable.
function checkIntentViolations(repoRoot, debt) {
  const abs = path.join(repoRoot, LEDGER_REL);
  if (!fs.existsSync(abs)) return { ok: false, reason: 'ledger absent at ' + LEDGER_REL };
  const parsed = readJson(abs);
  if (!parsed.ok) return { ok: false, reason: 'ledger unreadable: ' + parsed.error };
  const items = parsed.value && Array.isArray(parsed.value.items) ? parsed.value.items : null;
  if (!items) return { ok: false, reason: 'ledger has no items[]' };

  const byId = new Map(items.map(function (i) { return [i.id, i]; }));
  const missing = REQUIRED_IV_IDS.filter(function (id) { return !byId.has(id); });
  const problems = [];

  for (const it of items) {
    if (IV_RESOLUTIONS.indexOf(it.resolution) === -1) {
      problems.push({ id: it.id, reason: 'resolution must be one of ' + IV_RESOLUTIONS.join('|') });
      continue;
    }
    const cls = debt.classifyEvidence(it.evidence, repoRoot, { allowBarePath: true });
    if (!cls.ok) { problems.push({ id: it.id, reason: 'evidence: ' + cls.reason }); continue; }

    if (cls.kind === 'commit') {
      // A commit sha must be reachable from HEAD, or it does not evidence this
      // tree's state.
      try {
        require('child_process').execFileSync('git',
          ['-C', repoRoot, 'merge-base', '--is-ancestor', cls.value, 'HEAD'], { stdio: 'ignore' });
      } catch (err) {
        problems.push({ id: it.id, reason: 'commit not reachable from HEAD: ' + cls.value });
      }
      continue;
    }
    if (cls.path) {
      const target = path.join(repoRoot, cls.path);
      if (!fs.existsSync(target)) {
        problems.push({ id: it.id, reason: 'evidence file absent: ' + cls.path });
        continue;
      }
      if (it.resolution === 'declaration-corrected') {
        if (typeof it.asserted_text !== 'string' || !it.asserted_text.trim()) {
          problems.push({ id: it.id, reason: 'declaration-corrected requires asserted_text' });
          continue;
        }
        let body;
        try {
          body = fs.readFileSync(target, 'utf8');
        } catch (err) {
          problems.push({ id: it.id, reason: 'evidence unreadable: ' + err.message });
          continue;
        }
        if (body.indexOf(it.asserted_text) === -1) {
          problems.push({
            id: it.id,
            reason: 'asserted_text is not present in ' + cls.path +
              ' — the correction is claimed but not written',
          });
        }
      }
    }
  }

  return {
    ok: missing.length === 0 && problems.length === 0,
    recorded: items.length,
    required: REQUIRED_IV_IDS.length,
    missing_ids: missing,
    problems: problems,
  };
}

// ── axis 4 ───────────────────────────────────────────────────────────────────

function checkPrdFlip(repoRoot) {
  const abs = path.join(repoRoot, PRD_REL);
  if (!fs.existsSync(abs)) return { ok: false, reason: 'PRD absent — cannot tell whether M10 flipped' };
  let body;
  try {
    body = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    return { ok: false, reason: 'PRD unreadable: ' + err.message };
  }
  const row = body.split(/\r?\n/).find(function (l) { return /^\|\s*10\s*\|/.test(l); });
  if (!row) return { ok: false, reason: 'no M10 row in the Delivery Milestones table' };
  const cells = row.split('|').map(function (c) { return c.trim(); });
  const status = cells.length >= 5 ? cells[cells.length - 3] : null;
  return {
    ok: status === 'complete',
    status: status,
    reason: status === 'complete' ? null : 'M10 row is "' + status + '", not complete',
  };
}

// ── gate ─────────────────────────────────────────────────────────────────────

function evaluateGate(opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || process.cwd();
  const loaded = requireDebtInventory();
  if (!loaded.ok) {
    return {
      ok: false,
      reason: 'debt-inventory module failed to load: ' + loaded.error +
        ' — the gate machinery itself is broken, which is a failure, not a pass',
    };
  }
  const debt = loaded.mod;
  const seal = checkSeal(repoRoot, debt);
  const dispositions = checkDispositions(repoRoot, debt);
  const intentViolations = checkIntentViolations(repoRoot, debt);
  const prdFlip = checkPrdFlip(repoRoot);
  return {
    ok: seal.ok && dispositions.ok && intentViolations.ok && prdFlip.ok,
    seal: seal,
    dispositions: dispositions,
    intent_violations: intentViolations,
    prd_flip: prdFlip,
  };
}

function runCli(argv) {
  const result = evaluateGate({ repoRoot: process.cwd() });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  evaluateGate: evaluateGate,
  checkSeal: checkSeal,
  checkDispositions: checkDispositions,
  checkIntentViolations: checkIntentViolations,
  checkPrdFlip: checkPrdFlip,
  runCli: runCli,
  REQUIRED_IV_IDS: REQUIRED_IV_IDS,
  IV_RESOLUTIONS: IV_RESOLUTIONS,
  PRD_REL: PRD_REL,
  LEDGER_REL: LEDGER_REL,
};
