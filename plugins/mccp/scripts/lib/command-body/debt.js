'use strict';

// 열거된 seam 부채 + 상한 래칫 (diverse-agent-review M5 Task 4).
//
// `env-contract/evidence-debt.js` 의 형태를 축자로 계승한다: 열거 + 상한 상수 +
// 로드 시점 `assertShape` throw + test 가 상한과 길이를 짝으로 단언.
//
// ── 왜 열거인가 ──
// 상한만 두고 열거하지 않으면 그 숫자를 **사후에 맞출 수 있어** "debt 길이가 상한과 같다"가
// 언제나 green 이 된다. 열거된 앵커가 규칙 출력과 어긋나면 그 자체가 red 다.
//
// ── 면제 키가 (file, rule, textDigest) 인 이유 ──
// 위치에만 결속하면 같은 파일·같은 줄에 같은 규칙 클래스의 **다른** 위반이 들어설 때
// 면제가 그대로 승계된다. 커맨드 본문이 편집되면 줄번호가 통째로 밀리는데, 그 대량
// 재번호가 바로 신규 위반이 조용히 흡수되는 지점이다. `line` 은 사람이 찾아가기 위한
// **비결속 메타데이터**이고 매칭에 쓰이지 않는다.
//
// ── 같은 키가 둘 이상일 수 있다 ──
// 실측에서 세 쌍이 digest 를 공유한다(plan.md:1997/2638 · prp-implement.md:984/996 ·
// prp-implement.md:1787/1810) — 문자열이 같은 코드가 두 곳에 있기 때문이다. 그래서 면제는
// 키의 **존재**가 아니라 **개수**로 소비된다. 존재로 판정하면 한 줄을 고쳐도 나머지 한 줄의
// 면제가 남아 신규 위반 하나를 조용히 흡수한다.

const crypto = require('crypto');

// 부채 항목. 규칙 출력의 `text` 를 정규화해 digest 로 만든다.
const SEAM_DEBT = Object.freeze([
  Object.freeze({ file: 'plugins/mccp/commands/dashboard-audit.md', line: 21, rule: 'S3', textDigest: 'd38ec0e859b4', why: 'stale-audit enumerate: node instrumentation discards stderr behind an or-fallback' }),
  Object.freeze({ file: 'plugins/mccp/commands/milestone-close.md', line: 32, rule: 'S3', textDigest: '0615a3650b55', why: 'cost-state get-tier: node instrumentation discards stderr behind an or-fallback' }),
  Object.freeze({ file: 'plugins/mccp/commands/plan.md', line: 1997, rule: 'S3', textDigest: 'e6a7993c5073', why: 'L3 lock-owner probe: node -e in a substitution discards stderr' }),
  Object.freeze({ file: 'plugins/mccp/commands/plan.md', line: 2638, rule: 'S3', textDigest: 'e6a7993c5073', why: 'same probe as :1997, second occurrence' }),
  Object.freeze({ file: 'plugins/mccp/commands/pr.md', line: 1398, rule: 'S2', textDigest: '765ecfa44f86', why: 'gh pr checks terminates the block with a non-blocking call' }),
  Object.freeze({ file: 'plugins/mccp/commands/prp-implement.md', line: 181, rule: 'S2', textDigest: 'b0ef963c3679', why: 'git pull terminates the Phase 2 block with a non-blocking call' }),
  Object.freeze({ file: 'plugins/mccp/commands/prp-implement.md', line: 654, rule: 'S2', textDigest: '2c4ac79f6d6a', why: 'pre-diff untracked loop: the non-blocking call is the last statement before done' }),
  Object.freeze({ file: 'plugins/mccp/commands/prp-implement.md', line: 984, rule: 'S1', textDigest: 'ebe512ec7380', why: 'ultracode phase-lock ENTER_EXIT never read after capture in this fence — dead failure branch' }),
  Object.freeze({ file: 'plugins/mccp/commands/prp-implement.md', line: 996, rule: 'S1', textDigest: 'ebe512ec7380', why: 'ultracode phase-lock retry recapture, same dead-branch shape as :984' }),
  Object.freeze({ file: 'plugins/mccp/commands/prp-implement.md', line: 1408, rule: 'S2', textDigest: 'feb74a8a01e7', why: 'the then-branch half of the :1410 pair — same if/else, terminated by else' }),
  Object.freeze({ file: 'plugins/mccp/commands/prp-implement.md', line: 1410, rule: 'S2', textDigest: '429ceffa1535', why: 'git diff terminates the else-branch with a non-blocking call' }),
  Object.freeze({ file: 'plugins/mccp/commands/prp-implement.md', line: 1413, rule: 'S2', textDigest: '8d5494532106', why: 'cur-diff untracked loop: the non-blocking call is the last statement before done' }),
  Object.freeze({ file: 'plugins/mccp/commands/prp-implement.md', line: 1787, rule: 'S1', textDigest: '7a465908794c', why: 'auto-chain CHAIN_EXIT never read after capture in this fence' }),
  Object.freeze({ file: 'plugins/mccp/commands/prp-implement.md', line: 1810, rule: 'S1', textDigest: '7a465908794c', why: 'auto-chain pr-step recapture, same shape as :1787' }),
  Object.freeze({ file: 'plugins/mccp/commands/santa-loop.md', line: 281, rule: 'S1', textDigest: 'dd113879ed6d', why: 'BEGIN_EXIT read exists but in a DIFFERENT fence — cross-fence state loss, not a missing branch' }),
  Object.freeze({ file: 'plugins/mccp/commands/santa-loop.md', line: 517, rule: 'S2', textDigest: '1d706d7e3e48', why: 'CLI probe terminates the block with a non-blocking call' }),
  Object.freeze({ file: 'plugins/mccp/commands/work.md', line: 316, rule: 'S3', textDigest: '3f68b4a9d18e', why: 'fleet-reason probe: node -e in a substitution discards stderr' }),
  Object.freeze({ file: 'plugins/mccp/commands/work.md', line: 782, rule: 'S2', textDigest: 'a73ef58c567b', why: 'rollback-apply terminates the if-branch with a non-blocking call' }),
]);

// 가시화 장치이지 정원이 아니다. 이 숫자를 올리는 것 자체는 금지되지 않으나 **조용히**
// 올릴 수는 없다 — 목록에 한 줄을 append 하면 이 상수도 함께 올려야 하고, test 가
// `SEAM_DEBT_CEILING === SEAM_DEBT.length` 를 짝으로 단언하므로 하나만 고치면 붉어진다.
// 15 → 18 (code-review H1): S2 의 종결자 집합이 `fi`+블록 끝에서 의미 클래스 전체로 넓어져
// 이전에 불가시였던 `else` 1건 · `done` 2건이 드러났다. 규칙이 넓어져 부채가 는 것이지
// 배선이 나빠진 것이 아니다 — `commands/` 는 이 milestone 내내 무편집이다.
const SEAM_DEBT_CEILING = 18;

// ── ASSERT_BASELINE ──────────────────────────────────────────────────────────
// Task 6 이 이전하는 두 test 파일의 `assert.` 호출 수. **교체 전에** 측정했다.
//
// 값은 `origin/main` 의 파일에서 도출됐고 측정 시점의 working tree 와 바이트 동일이었다
// (기준 커밋 `7ceb66e`). 그 사실을 여기 적는 이유는 L2 패널이 지목한 결함 때문이다 —
// baseline 이 그것이 지키려는 변경과 같은 커밋에서 저자가 정하는 값이면 그 검사는 원리상
// 실패할 수 없다. 출처를 봉인하면 최소한 **반증이 가능해진다**: 누구든
// `git show 7ceb66e:<path>` 로 세어 이 숫자와 대조할 수 있다.
//
// 이것이 그 지적의 **완전한** 해소는 아니다 — 기계가 매 실행마다 ground truth 와 대조하는
// 것이 아니라 사람이 대조할 수 있게 만든 것뿐이다. 완전한 해소(도출 가능한 기준과의 자동
// 대조)는 backlog 에 남아 있다.
const ASSERT_BASELINE_SOURCE_REV = '7ceb66e';
const ASSERT_BASELINE = Object.freeze({
  'plan-review-command-body.test.js': 46,
  'review-single-pass-command-body.test.js': 42,
});

const RULES = Object.freeze(['S1', 'S2', 'S3']);
const FILE_RE = /^plugins\/mccp\/commands\/[A-Za-z0-9._-]+\.md$/;
const DIGEST_RE = /^[0-9a-f]{12}$/;

// 규칙 출력의 `text` 를 면제 키로 정규화한다.
// Implement-Codex R1 F5 — 좁은 canonicalization: 줄끝과 부수 들여쓰기만 접고, 토큰을
// 가르는 공백·인용·연산자·리다이렉션·명령 텍스트는 보존한다. 공백만의 재배치는 면제를
// 유지하고 실제 셸 의미 변경은 면제를 무효화한다.
function textDigest(text) {
  const canonical = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 12);
}

// 키 구분자는 NUL 이다 — 경로에도 규칙 이름에도 hex digest 에도 나타날 수 없으므로 두 필드가
// 우연히 합쳐져 다른 항목과 같은 키가 되는 일이 없다. 이 키는 **비교 전용**이며 어느 소비처도
// 되파싱하지 않는다(`buildDebtBudget` 주석 참조).
const KEY_SEP = String.fromCharCode(0);

function debtKey(entry) {
  return entry.file + KEY_SEP + entry.rule + KEY_SEP + entry.textDigest;
}

// 위반 → 면제 키. 규칙 출력에는 digest 가 없으므로 여기서 만든다.
function violationKey(violation) {
  return violation.file + KEY_SEP + violation.rule + KEY_SEP + textDigest(violation.text);
}

// 로드 시점 자기 검증. 위반은 **throw** 다 — 관대한 방향으로 실패하면 목록이 조용히
// 전체 면제가 된다.
function assertShape(list) {
  if (!Array.isArray(list)) throw new Error('command-body/debt: export must be an array');
  if (list.length > SEAM_DEBT_CEILING) {
    throw new Error('command-body/debt: ' + list.length + ' rows exceed SEAM_DEBT_CEILING='
      + SEAM_DEBT_CEILING + '. The ceiling is a visibility device, not a quota — raising it is '
      + 'allowed, but it must be its own edit so the diff records that the ratchet loosened. '
      + 'Fixing a row (repairing the seam in the command body) is the other way out.');
  }
  list.forEach(function (row, i) {
    if (!row || typeof row !== 'object') throw new Error('command-body/debt[' + i + ']: not an object');
    const keys = Object.keys(row).sort().join(',');
    if (keys !== 'file,line,rule,textDigest,why') {
      throw new Error('command-body/debt[' + i + ']: keys must be {file, line, rule, textDigest, why}, got {' + keys + '}');
    }
    if (!FILE_RE.test(row.file)) throw new Error('command-body/debt[' + i + ']: bad file ' + JSON.stringify(row.file));
    if (RULES.indexOf(row.rule) === -1) throw new Error('command-body/debt[' + i + ']: unknown rule ' + row.rule);
    if (!DIGEST_RE.test(row.textDigest)) throw new Error('command-body/debt[' + i + ']: bad textDigest ' + JSON.stringify(row.textDigest));
    if (!Number.isInteger(row.line) || row.line < 1) throw new Error('command-body/debt[' + i + ']: bad line ' + row.line);
    if (typeof row.why !== 'string' || row.why.trim().split(/\s+/).length < 3) {
      throw new Error('command-body/debt[' + i + ']: why must be a substantive sentence');
    }
  });
  return list;
}

assertShape(SEAM_DEBT);

// 면제는 키의 존재가 아니라 **개수**로 소비된다(헤더 참조). 소비 가능한 잔량 맵을 만든다.
//
// 값은 개수만이 아니라 `{count, row}` 다 — 소비되지 않고 남은 항목(화석)을 보고할 때
// 원본 row 가 필요하기 때문이다. 키에서 필드를 되파싱하면 구분자 규약이 두 모듈에 나뉘어
// 어긋날 수 있고, 실제로 한 번 어긋났다: 키는 NUL 로 join 되는데 소비처가 공백으로 split 해
// 화석 필터가 전부 false 가 되고 **래칫의 축소 방향이 조용히 꺼졌다.** 구조를 들고 다니면
// 그 실패가 존재할 수 없다.
function buildDebtBudget(list) {
  const budget = new Map();
  (list || SEAM_DEBT).forEach(function (row) {
    const k = debtKey(row);
    const slot = budget.get(k);
    if (slot) slot.count += 1;
    else budget.set(k, { count: 1, row: row });
  });
  return budget;
}

module.exports = {
  SEAM_DEBT: SEAM_DEBT,
  SEAM_DEBT_CEILING: SEAM_DEBT_CEILING,
  ASSERT_BASELINE: ASSERT_BASELINE,
  ASSERT_BASELINE_SOURCE_REV: ASSERT_BASELINE_SOURCE_REV,
  textDigest: textDigest,
  debtKey: debtKey,
  violationKey: violationKey,
  buildDebtBudget: buildDebtBudget,
  assertShape: assertShape,
  RULES: RULES,
};
