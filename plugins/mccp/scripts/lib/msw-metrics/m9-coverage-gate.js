'use strict';

// multi-session-work-loop M9 — PRD status 정본화를 종속시키는 반증 가능한 gate.
//
// 설계 근거: .claude/plans/multi-session-work-loop-m9.plan.md Task 6 (m8 gate 거울)
//
// M9는 M4·M5·M8이 status 셀 안에 남긴 미충족 인정 조건을 지우고 정본 `complete`로
// 바꾼다. 그 편집 하나가 `archive-complete/scan.js:106`의 `normalizeStatus` 판정을
// non-archivable -> archivable로 뒤집는다 — **조건이 실제로 닫혔는지와 무관하게**.
// 즉 이 milestone은 자기가 통과해야 할 검사를 자기가 지우는 구조다.
//
// 세 축을 세운다:
//   1. **레지스트리 실재** — Task 2·4가 더한 producer가 아직 그 자리에 있는가.
//   2. **정적 lint** — 목록 밖의 파일이 같은 어휘로 쓰는가.
//   3. **술어 교차 검증** — 여기가 이 gate의 존재 이유다. 술어를 *평가만* 하면
//      "무엇이 참인가" 보고서가 나올 뿐 "무엇이 flip됐는가"는 보지 않아서, 술어가
//      거짓인 채 괄호만 지워진 행을 그대로 통과시킨다. 그래서 PRD에서 실제로
//      정본 `complete`가 된 행을 읽어 그 행의 술어와 대조하고, 하나라도 거짓이면
//      비영점으로 답한다.
//
// **위협 모델 (한정해서 적는다)**: m8/b2/c1 gate와 같다. 겨냥하는 것은 *우발적
// 미승인 flip*이지 repo write 권한을 가진 적대적 위조자가 아니다. 후자는 이 파일
// 자체를 고칠 수 있으므로 in-repo gate로 원리상 방어 불가이고, 단일 운영자
// 신뢰경계라는 PRD 전제상 범위 밖이다. 또한 markdown 편집을 런타임으로 차단하는
// 수단이 이 하네스에 없으므로 이 **사후 교차 검증이 가용한 최강 강제**이며,
// 그래서 plan의 `## Validation`과 `## Acceptance`가 이 gate의 exit 0을 요구한다.

const fs = require('fs');
const path = require('path');

// 축 1 — 승인된 producer 지점. M9가 더한 둘만 여기 있다(선재 지점은 m8 gate 소관).
const APPROVED_PRODUCER_SITES = Object.freeze([
  Object.freeze({
    file: 'plugins/mccp/scripts/lib/plan-review/cli.js',
    token: 'emitPanelClosures',
    why: 'Task 2 — 패널 경로 C1 종결 producer. backlog 적재분을 deferred 로 종결한다',
  }),
  Object.freeze({
    file: 'plugins/mccp/scripts/state/cli.js',
    token: 'cmdFindingsUnattributed',
    why: 'Task 4 — C2/C3 귀속 파생. pr.md 의 빈 리터럴을 대체한다',
  }),
  Object.freeze({
    file: 'plugins/mccp/commands/pr.md',
    token: 'findings-unattributed',
    why: 'Task 4 — 파생된 귀속을 실제로 emit 하는 소비 지점',
  }),
]);

// 자기 자신은 검출 토큰을 **데이터로** 담고 있어 스스로를 잡는다.
const SELF_EXEMPT = 'plugins/mccp/scripts/lib/msw-metrics/m9-coverage-gate.js';

const PRD_PATH = '.claude/prds/multi-session-work-loop.prd.md';

function walk(absDir, repoRoot, accept, out) {
  let entries = [];
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch (_) { return out; }
  entries.forEach(function (e) {
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'tests') return;
      walk(abs, repoRoot, accept, out);
      return;
    }
    if (!e.isFile()) return;
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    if (rel.endsWith('.test.js')) return;
    if (accept(rel)) out.push(rel);
  });
  return out;
}

function surfaceFiles(repoRoot) {
  const js = walk(path.join(repoRoot, 'plugins', 'mccp', 'scripts'), repoRoot,
    function (rel) { return rel.endsWith('.js'); }, []);
  const md = walk(path.join(repoRoot, 'plugins', 'mccp', 'commands'), repoRoot,
    function (rel) { return rel.endsWith('.md'); }, []);
  return js.concat(md).sort();
}

// 축 1 — 목록에 있는데 부재 = producer 가 조용히 제거됐다.
function producerRegistry(repoRoot) {
  const missing = [];
  APPROVED_PRODUCER_SITES.forEach(function (site) {
    let text = '';
    try { text = fs.readFileSync(path.join(repoRoot, site.file), 'utf8'); }
    catch (_) { missing.push(site.file + ' (unreadable)'); return; }
    if (text.indexOf(site.token) === -1) {
      missing.push(site.file + ' (no ' + site.token + ' found)');
    }
  });
  return { ok: missing.length === 0, missing: missing };
}

// 축 2 — 목록 밖의 파일이 같은 어휘를 쓰는가.
function staticLint(repoRoot) {
  const approved = new Set(APPROVED_PRODUCER_SITES.map(function (s) { return s.file; }));
  const violations = [];
  const tokens = ['emitPanelClosures', 'cmdFindingsUnattributed'];

  surfaceFiles(repoRoot).forEach(function (rel) {
    if (rel === SELF_EXEMPT || approved.has(rel)) return;
    let text = '';
    try { text = fs.readFileSync(path.join(repoRoot, rel), 'utf8'); } catch (_) { return; }
    tokens.forEach(function (t) {
      if (text.indexOf(t) !== -1) violations.push({ file: rel, token: t });
    });
  });

  return { ok: violations.length === 0, violations: violations };
}

// ── 축 3 — 술어 교차 검증 ────────────────────────────────────────────────────

// PRD 의 `## Delivery Milestones` 표에서 (번호, status) 를 읽는다. `scan.js` 의
// `normalizeStatus` 와 **같은 엄격도**로 판정한다 — 비정규 텍스트가 섞인 셀은
// `complete` 가 아니며, 그것이 M9 가 지우려는 마커 자체다.
function readMilestoneStatuses(repoRoot) {
  let body = '';
  try { body = fs.readFileSync(path.join(repoRoot, PRD_PATH), 'utf8'); }
  catch (_) { return null; }

  const rows = new Map();
  body.split(/\r?\n/).forEach(function (line) {
    const m = /^\|\s*(\d+)\s*\|/.exec(line);
    if (!m) return;
    const cells = line.split('|');
    // | # | Milestone | Outcome | Status | Plan |  -> 앞뒤 빈 셀 포함 7 조각
    if (cells.length < 6) return;
    rows.set('M' + m[1], String(cells[4] == null ? '' : cells[4]).trim().toLowerCase());
  });
  return rows;
}

function readMetrics(repoRoot) {
  try {
    const { derive } = require('../../derive/index.js');
    // Positional repoRoot — the module validates it as a non-empty string and
    // throws on an options object, which is how axis 3 silently reported
    // "model unavailable" on its first run.
    const model = derive(repoRoot, {});
    return model || null;
  } catch (_) { return null; }
}

function fileExists(repoRoot, rel) {
  try { return fs.statSync(path.join(repoRoot, rel)).isFile(); } catch (_) { return false; }
}

function prdContains(repoRoot, needle) {
  try {
    return fs.readFileSync(path.join(repoRoot, PRD_PATH), 'utf8').indexOf(needle) !== -1;
  } catch (_) { return false; }
}

function statusOf(model, id) {
  const m = model && model.metrics && model.metrics[id];
  return m && m.status ? m.status : null;
}

// PR-Codex R1 F2 — 정책 문서의 *존재*는 미산출을 설명하지 않는다.
//
// 이전 술어는 `a3 === 'computed' || fileExists(a3-freshness-policy.md)` 였다. 그 파일은
// 커밋된 정적 파일이라 한 번 착지하면 영구히 참이고, 그러면 A3 가 **무엇 때문에**
// 미산출인지와 무관하게 M4 행이 통과한다 — 토크나이저 부재든, 무관한 측정 회귀든,
// 손상된 입력이든 전부 같은 문을 지난다. 실측으로도 그랬다: 현재 A3 는 토크나이저가
// 아니라 CLAUDE.md 재성장 때문에 `insufficient` 인데 옛 술어는 그 차이를 보지 못했다.
//
// 정책이 sanctioned 로 **설명하는** 미산출은 정확히 둘이고, 둘은 서로 다른 문장이다.
// 그래서 status 와 사유를 함께 대조하고 나머지는 전부 거부한다. 목록에 없는 상태는
// "정책이 설명한 적 없는 고장"이며, 그것을 통과시키면 gate 가 아니라 통과 티켓이다.
//
// **분업 (중요)**: 이 gate 는 *분류*를 소유한다. "크래시 대신 정직한 미산출을 낸다"는
// *동작*은 `lib/tests/msw-metrics.test.js` 의
// 'A3: an unimportable tiktoken degrades to a status, not an unhandled crash' 가
// 실제 CLI 를 spawn 해 stack trace 부재까지 단언한다. 그 probe 를 gate 안으로 옮기면
// (a) 매 실행마다 python 을 띄워 느려지고 (b) tiktoken 이 설치된 환경에서는 그 분기가
// 아예 실행되지 않아 단언이 성립하지 않는다. 분류는 어느 환경에서나 성립한다.
const A3_SANCTIONED_NON_DELIVERY = Object.freeze([
  Object.freeze({
    key: 'tokenizer-unavailable',
    status: 'error',
    re: /tiktoken|No module named|ModuleNotFoundError/i,
    why: 'policy 1절 — 인터프리터는 있으나 tiktoken import 실패',
  }),
  Object.freeze({
    key: 'sealed-pair-stale',
    status: 'insufficient',
    re: /changed since the A3 measurement/i,
    why: 'policy 3절 — CLAUDE.md 재성장. 재측정은 주장을 바꾸므로 stale 을 그대로 둔다',
  }),
]);

// `{ ok, key, detail }`. `ok` 는 "정책이 설명하는 상태인가"이지 "산출됐는가"가 아니다.
function classifyA3(model) {
  const m = model && model.metrics && model.metrics.A3;
  if (!m) return { ok: false, key: 'absent', detail: 'A3 record absent from the derive model' };
  if (m.status === 'computed') return { ok: true, key: 'computed', detail: 'A3.status=computed' };
  // derive 는 `invalid_reason` 으로, 산출기는 `not_delivered_reason` 으로 말한다.
  // 어느 쪽이든 사유가 없으면 대조할 것이 없으므로 분류되지 않는다.
  const reason = String((m.invalid_reason || m.not_delivered_reason) || '');
  for (let i = 0; i < A3_SANCTIONED_NON_DELIVERY.length; i++) {
    const c = A3_SANCTIONED_NON_DELIVERY[i];
    if (m.status === c.status && c.re.test(reason)) {
      return { ok: true, key: c.key, detail: 'A3.status=' + m.status + ' sanctioned=' + c.key };
    }
  }
  return {
    ok: false,
    key: 'unclassified',
    detail: 'A3.status=' + m.status
      + ' reason=' + (reason ? JSON.stringify(reason.slice(0, 120)) : '(none)')
      + ' — not a non-delivery this policy describes',
  };
}

// 행별 술어. 각 항목은 `{ ok, detail }` 을 낸다 — 거짓일 때 *무엇이* 거짓인지
// 말하지 않으면 운영자는 gate 를 끄는 쪽으로 간다.
function predicates(repoRoot, model) {
  const findings = (model && model.sources && model.sources.findings) || {};

  const M5 = function () {
    const s = statusOf(model, 'A4');
    return { ok: s === 'computed', detail: 'A4.status=' + s };
  };

  const M8 = function () {
    const a1 = statusOf(model, 'A1');
    const b3 = statusOf(model, 'B3');
    const a2 = statusOf(model, 'A2');
    // A2 는 산출되지 않아도, 조사 문서가 실재하고 그 결론이 PRD 에 반영됐으면
    // 통과한다(UI6). 파일 실재만 보면 "조사했다"가 "반영했다"로 읽히므로 둘 다 본다.
    const a2Doc = fileExists(repoRoot, 'docs/multi-session-work-loop/a2-producer-investigation.md');
    const a2Revised = prdContains(repoRoot, 'a2-producer-investigation.md');
    const a2Ok = a2 === 'computed' || (a2Doc && a2Revised);
    // 귀속은 좌변·우변 중 하나라도 서면 되고, 둘 다 0 이면 Task 4 의 "파생 불가"
    // 기록이 PRD 에 있어야 한다.
    const gate = Number(findings.with_gate_decision || 0);
    const pr = Number(findings.with_remediation_pr || 0);
    const attribOk = gate > 0 || pr > 0 || prdContains(repoRoot, '귀속 파생 불가');
    return {
      ok: a1 === 'computed' && b3 === 'computed' && a2Ok && attribOk,
      detail: 'A1=' + a1 + ' B3=' + b3 + ' A2=' + a2 +
        ' a2Doc=' + a2Doc + ' a2Revised=' + a2Revised +
        ' with_gate_decision=' + gate + ' with_remediation_pr=' + pr,
    };
  };

  const M4 = function () {
    const b1 = statusOf(model, 'B1');
    const c1 = statusOf(model, 'C1');
    // 분류가 먼저다 — 어떤 미산출인지 모르는 채로는 그것이 설명된 미산출인지 말할 수 없다.
    const a3 = classifyA3(model);
    // 정책 문서는 여전히 필요하다: 분류가 가리키는 문장이 디스크에 실재해야 인용
    // 가능하다. 다만 이제 **필요조건이지 충분조건이 아니다** — 그 역전이 F2 의 수정이다.
    const a3Policy = fileExists(repoRoot, 'docs/multi-session-work-loop/a3-freshness-policy.md');
    const a3Ok = a3.key === 'computed' || (a3.ok && a3Policy);
    return {
      ok: b1 === 'computed' && c1 === 'computed' && a3Ok,
      detail: 'B1=' + b1 + ' C1=' + c1 + ' a3=' + a3.detail + ' a3Policy=' + a3Policy,
    };
  };

  // M9 자기 행 (구현 시점 deviation — plan 의 7a 표에는 없었다).
  //
  // 없으면 순환이 닫히지 않는다: PRD 9행 Outcome 은 M9 의 완료를
  // `/mccp:archive-complete` 성공으로 정의하는데, §3.11 C3 의
  // `rawRowCount === complete + dropped` 는 M9 행이 in-progress 인 한 거짓이므로
  // 그 성공이 영원히 오지 않는다. 해소는 완료 판정을 "술어 통과 ∧ PRD 정본화"로
  // 옮기는 것이고, 그러려면 M9 에게도 술어가 있어야 한다.
  //
  // 술어에 "이 gate 가 통과한다"를 넣지 않는다 — 자기 참조라 아무것도 반증하지
  // 못한다. 대신 Task 1~5 가 남긴 **산출물의 실재**와 나머지 세 행의 정본화를 본다.
  const M9 = function () {
    const artifacts = [
      'docs/multi-session-work-loop/a3-freshness-policy.md',
      'docs/multi-session-work-loop/a2-producer-investigation.md',
      'plugins/mccp/scripts/lib/tests/msw-m9-producers.test.js',
    ];
    const missing = artifacts.filter(function (f) { return !fileExists(repoRoot, f); });
    return {
      ok: missing.length === 0,
      detail: missing.length ? 'missing artifacts: ' + missing.join(', ') : 'all M9 artifacts present',
    };
  };

  return { M4: M4, M5: M5, M8: M8, M9: M9 };
}

// 축 3 본체. **flip 된 행만** 검사한다: 아직 비정본인 행은 M9 가 손대지 않았다는
// 뜻이고, 그것은 위반이 아니라 정직한 미완이다(plan 7a: "술어가 거짓인 행은 flip
// 하지 않는다"). 검사 대상은 "정본 complete 가 된 M9 관할 행"이다.
function predicateCrossCheck(repoRoot) {
  const rows = readMilestoneStatuses(repoRoot);
  if (!rows) {
    return { ok: false, reason: 'PRD unreadable — cannot tell which rows were flipped', rows: [] };
  }
  const model = readMetrics(repoRoot);
  if (!model) {
    return { ok: false, reason: 'derive model unavailable — predicates cannot be evaluated', rows: [] };
  }

  const preds = predicates(repoRoot, model);
  const out = [];
  let ok = true;

  Object.keys(preds).sort().forEach(function (id) {
    const status = rows.has(id) ? rows.get(id) : null;
    const flipped = status === 'complete';
    if (!flipped) {
      out.push({ milestone: id, status: status, flipped: false, checked: false });
      return;
    }
    const r = preds[id]();
    out.push({ milestone: id, status: status, flipped: true, checked: true, ok: r.ok, detail: r.detail });
    if (!r.ok) ok = false;
  });

  return { ok: ok, rows: out };
}

function evaluateGate(opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || process.cwd();
  const registry = producerRegistry(repoRoot);
  const lint = staticLint(repoRoot);
  const cross = predicateCrossCheck(repoRoot);
  return {
    ok: registry.ok && lint.ok && cross.ok,
    approved_site_count: APPROVED_PRODUCER_SITES.length,
    registry: registry,
    static_lint: lint,
    predicate_cross_check: cross,
  };
}

function runCli(argv) {
  const result = evaluateGate({ repoRoot: process.cwd() });
  if (argv.indexOf('--json') !== -1 || true) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  evaluateGate: evaluateGate,
  classifyA3: classifyA3,
  A3_SANCTIONED_NON_DELIVERY: A3_SANCTIONED_NON_DELIVERY,
  producerRegistry: producerRegistry,
  staticLint: staticLint,
  predicateCrossCheck: predicateCrossCheck,
  readMilestoneStatuses: readMilestoneStatuses,
  predicates: predicates,
  runCli: runCli,
  APPROVED_PRODUCER_SITES: APPROVED_PRODUCER_SITES,
  SELF_EXEMPT: SELF_EXEMPT,
  PRD_PATH: PRD_PATH,
};
