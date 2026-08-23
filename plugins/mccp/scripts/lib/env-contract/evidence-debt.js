'use strict';

// env-contract/evidence-debt.js — L10 정방향 검사의 **열거된** 면제 목록 (v1.32.0).
//
// **왜 숫자가 아니라 목록인가.** 상한을 숫자로 두면(«29건까지 허용») 하나를 고치고
// 하나를 깨뜨려도 숫자는 그대로다 — 신원을 감추는 계측은 드리프트를 못 본다. 이름으로
// 적으면 새 이름은 즉시 붉고, 목록에 없는 것은 예외 없이 판정된다.
//
// **래칫은 양방향이다.** 목록에 있는데 **실제로는 통과하는** 이름도 실패로 보고한다.
// 그래야 목록이 줄어들기만 하고, 고쳐진 항목이 화석으로 남아 새 드리프트를 가려 주는
// 일이 없다.
//
// **이 목록에 impeccable 축은 하나도 없다.** M5가 그 축을 실제로 고쳤기 때문이고,
// 동시에 «축을 목록에 밀어 넣고 통과시키는» 경로를 구조적으로 막기 위해서다. 그 불변식은
// 아래 `assertShape()`가 **로드 시점에 throw**로 강제한다 — test에만 두면 지켜지지
// 않는다(CLAUDE.md §3.17: 이 저장소의 test는 어떤 CI도 돌리지 않는다).
//
// **이 사이클은 아래 29건을 고칠 책임을 지지 않는다.** 각 항목은 자기 축의 부채이고,
// M5가 대신 갚으면 자기가 검증할 수 없는 파일들을 만지게 된다(DD3). 해소 방법은 하나다 —
// **각 축이 evidence 행을 실제 read site로 옮기고 이 목록에서 자기 이름을 지운다.**
//
// 두 부류가 섞여 있고 성질이 다르다:
//   B  같은 파일 안에 이름이 있지만 evidence 행 ±2 창 밖 — **낡았다**(코드가 움직였다).
//   C  그 파일에 이름이 아예 없다 — **거짓이다**(가리키는 곳이 그 토글이 아니다).
//
// mirror: `state/toggle-snapshot.js`의 `TOGGLE_EXCLUSIONS` — «제외는 정규식이 아니라
//         이름이고, 각 이름에는 실파일 근거가 붙는다» 규약.

const registry = require('./registry');

// axis는 그 항목이 속한 소유 축(= registry domain)이다. 해소 책임의 주소이지
// 분류가 아니다 — 같은 domain 안에서도 고치는 사람이 다를 수 있다.
const EVIDENCE_DEBT = Object.freeze([
  // ── gates — auto-chain · PR override · design-critique 체인 ────────────────
  Object.freeze({ name: 'MCCP_AUTO_CHAIN_SKIP_PR', axis: 'gates', klass: 'B' }),
  Object.freeze({ name: 'MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER', axis: 'gates', klass: 'B' }),
  Object.freeze({ name: 'MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN', axis: 'gates', klass: 'B' }),

  // ── review — codex-intent-context (M1 · M1.5 · M2) ────────────────────────
  Object.freeze({ name: 'MCCP_INTENT_MISLABEL', axis: 'review', klass: 'B' }),
  Object.freeze({ name: 'MCCP_SKIP_INTENT_GATE', axis: 'review', klass: 'B' }),
  Object.freeze({ name: 'MCCP_INTENT_ADJUDICATION_TIMEOUT_MS', axis: 'review', klass: 'B' }),
  Object.freeze({ name: 'MCCP_A11Y_AUTO_INVOKE', axis: 'review', klass: 'B' }),

  // ── observability · hooks ─────────────────────────────────────────────────
  Object.freeze({ name: 'MCCP_MULTI_SESSION_SCAN', axis: 'observability', klass: 'B' }),
  Object.freeze({ name: 'MCCP_GITIGNORE_LOCK_WAIT_MS', axis: 'hooks', klass: 'B' }),

  // ── external — harness가 소유하는 이름들(mccp가 정의하지 않는다) ──────────
  Object.freeze({ name: 'CLAUDE_PID', axis: 'external', klass: 'B' }),
  Object.freeze({ name: 'CLAUDE_RULES_DIR', axis: 'external', klass: 'C' }),
  Object.freeze({ name: 'CLAUDE_PACKAGE_MANAGER', axis: 'external', klass: 'C' }),
  Object.freeze({ name: 'GITHUB_TOKEN', axis: 'external', klass: 'B' }),
  Object.freeze({ name: 'ECC_DISABLED_MCPS', axis: 'external', klass: 'C' }),
  Object.freeze({ name: 'CLV2_HOMUNCULUS_DIR', axis: 'external', klass: 'C' }),

  // ── retired 문서 앵커 — evidence가 `retired.md:1`(파일 머리)을 가리켜 이름이
  //    창 밖이다. 해소는 각 이름의 절 행으로 옮기는 것이며, 이 저장소의
  //    env-contract 축 자신의 부채다. M5는 impeccable 축만 고친다(DD3).
  Object.freeze({ name: 'MCCP_SKIP_OBSERVE', axis: 'retired', klass: 'B' }),
  Object.freeze({ name: 'MCCP_QUALITY_GATE_FIX', axis: 'retired', klass: 'B' }),
  Object.freeze({ name: 'MCCP_QUALITY_GATE_STRICT', axis: 'retired', klass: 'B' }),
  Object.freeze({ name: 'MCCP_STOP_LOOP_QUALITY_CWD', axis: 'retired', klass: 'B' }),
  Object.freeze({ name: 'MCCP_SANTA_MAX_ROUNDS', axis: 'retired', klass: 'B' }),
  Object.freeze({ name: 'MCCP_COST_HARD_CEILING_HIT', axis: 'retired', klass: 'B' }),
  Object.freeze({ name: 'MCCP_ORCHESTRATION_DEBT_DECAY_HOURS', axis: 'retired', klass: 'B' }),
  Object.freeze({ name: 'MCCP_PLAN_REVIEW_L1', axis: 'retired', klass: 'B' }),
  Object.freeze({ name: 'MCCP_PERF_INJECT_QUADRATIC', axis: 'retired', klass: 'B' }),
  Object.freeze({ name: 'MCCP_TEST_SESSION_START_PATH', axis: 'retired', klass: 'B' }),
  Object.freeze({ name: 'MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL', axis: 'retired', klass: 'B' }),

  // ── scan-artifact — 환경변수가 **아닌** 이름들. evidence는 그 오탐을 낳은 줄을
  //    가리킨다. `MCCP_PLAN_REVIEW_`(끝이 밑줄인 접두사)는 경계 일치로는 원리상
  //    A가 될 수 없다 — 오분류가 아니라 그 항목의 성질이다.
  Object.freeze({ name: 'MCCP_PLAN_REVIEW_', axis: 'retired', klass: 'C' }),
  Object.freeze({ name: 'MCCP_IGNORE_ENTRIES', axis: 'retired', klass: 'B' }),
  Object.freeze({ name: 'MCCP_JOURNAL_DEGRADED_UNRECORDED', axis: 'retired', klass: 'B' }),
]);

const AXIS_FORBIDDEN_RE = /^(MCCP_)?IMPECCABLE_/;
const KLASSES = Object.freeze(['B', 'C']);

// 로드 시점 자기 검증. 위반은 **throw**다 — 관대한 방향으로 실패하면 목록이 조용히
// 전체 면제가 된다(Implement-Codex R1 F1). lint L10은 이 throw를 잡아 problem으로
// 적으므로, 목록이 깨지면 면제 집합은 빈 집합이 되고 정방향 검사가 전부 그대로 돈다.
function assertShape(list) {
  if (!Array.isArray(list)) throw new Error('env-contract/evidence-debt: export must be an array');
  const seen = new Set();
  list.forEach(function (row, i) {
    if (!row || typeof row !== 'object') throw new Error('evidence-debt[' + i + ']: not an object');
    const keys = Object.keys(row).sort().join(',');
    if (keys !== 'axis,klass,name') throw new Error('evidence-debt[' + i + ']: keys must be {name, axis, klass}, got {' + keys + '}');
    if (!registry.NAME_RE.test(row.name)) throw new Error('evidence-debt[' + i + ']: bad name ' + JSON.stringify(row.name));
    if (AXIS_FORBIDDEN_RE.test(row.name)) {
      throw new Error('evidence-debt: ' + row.name + ' is on the impeccable axis, which M5 fixed. '
        + 'Exempting it here would reopen exactly the path this list exists to close.');
    }
    if (KLASSES.indexOf(row.klass) === -1) throw new Error('evidence-debt[' + i + ']: klass must be B or C');
    if (registry.DOMAINS.indexOf(row.axis) === -1) throw new Error('evidence-debt[' + i + ']: unknown axis ' + row.axis);
    if (seen.has(row.name)) throw new Error('evidence-debt: duplicate ' + row.name);
    seen.add(row.name);
    if (!registry.get(row.name)) {
      throw new Error('evidence-debt: ' + row.name + ' is not in the registry — a name that no longer '
        + 'exists cannot carry debt. Delete the row.');
    }
  });
  return list;
}

assertShape(EVIDENCE_DEBT);

function names() {
  return EVIDENCE_DEBT.map(function (r) { return r.name; });
}

module.exports = {
  EVIDENCE_DEBT: EVIDENCE_DEBT,
  names: names,
  assertShape: assertShape,
  AXIS_FORBIDDEN_RE: AXIS_FORBIDDEN_RE,
};
