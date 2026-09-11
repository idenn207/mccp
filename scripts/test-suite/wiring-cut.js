#!/usr/bin/env node
'use strict';

// 축 D 음성 통제 — **절단 셋**의 적용과 복원 (DD5).
//
// PRD는 "1회 실증"이라 적지만 재현 불가한 이벤트로 두면 M3 자신이 우산의 서명 실패
// 모드("기계는 만들어지고 그것을 부르는 한 줄이 빠진다")를 반복한다 — 훗날 커버리지가
// 다시 깨져도 그것을 잡을 기계가 없다. 그래서 절단을 스크립트로 고정한다.
//
// ── 셋인 이유는 증명해야 할 명제가 셋이기 때문이다 ──────────────────────────
//   A (소비 경로)  붉은 test 파일 1개를 **심는다**. workflow는 무변경.
//                  → 스위트 red가 `gate.js` **1단계**를 거쳐 체크 red까지 도달한다.
//   B (구조)       tracked test 파일 **1개 삭제**.
//                  → 커버리지가 **떨어지지 않는데도** 삭제 래칫이 **2단계**에서 막는다.
//   오라클 왕복    판정 줄의 토큰 하나 제거.
//                  → 배선이 조용히 사라지면 `wiring-cut.test.js`가 붉어진다.
//
// A가 workflow를 건드리지 **않는** 것이 요건이다. 판정 줄에서 인자를 지우는 옛 A는
// 이 계획 자신의 fail-closed 규칙(부재는 통과가 아니다)과 충돌해, 절단된 트리에서
// `gate.js`가 1단계에 **도달하기 전에** 인자 검증에서 죽었다 — 그 실험은 소비 경로가
// 아니라 인자 검증을 재고 있었고 요구된 증거는 두 원인 어느 쪽에서도 참이라 판별력이
// 없었다(L2 R7). A의 증거가 `stage=1`인 것이 그 판별자다.
//
// ── 복원의 판정은 `git status --porcelain`이다 ──────────────────────────────
// `git diff --exit-code`만으로는 부족하다 — A는 파일을 **index에 심으므로**
// worktree diff에 나타나지 않는다. 실증이 영구 파손으로 남지 않게 하는 것이 그 검사다.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadExclusions } = require('./exclusions');
const { globToRegExp, toPosix } = require('./enumerate');

const WORKFLOW = '.github/workflows/test-suite.yml';

// 절단 B 가드의 두 입력. **둘 다 판독 실패에 사유 코드가 있다** — rule (a)에만 극성을
// 주고 rule (b)를 try/catch로 삼키면 "못 읽음 = 목록에 없음"이 되어 rule (b)가 조용히
// 자기를 끄고, 아래 `git rm`이 보호 대상에 도달한다(security-reviewer S1).
// `exclusions.js:14-17`이 정확히 그 반대 방향 조용한 실패를 경고한다.
const EXCLUSIONS_FILE = '.github/test-suite-exclusions.json';

// 이 목록의 신뢰 도메인은 **체크아웃된 worktree**다(security-reviewer S3). self-test
// step의 리터럴 목록을 깎은 브랜치를 체크아웃한 채 --apply-delete를 돌리면 allow-list가
// 그 편집본을 반영한다. 이 CLI는 CI가 아니라 운영자가 도는 진단이라 폭발 반경이 좁고,
// 근본 처방(pinned ref 판독)은 backlog다. **신뢰하는 브랜치에서만 돌려라.**

// 사유 코드는 그것을 내는 모듈이 소유한다 — `gate.js:44-70`의 **형태만** 빌리고
// 그 열거에 넣지 않는다. `test-suite-coverage.test.js:969-982`의 "죽은 선언 0" 스캔이
// producer 소스를 gate/coverage/inputs 셋으로만 훑으므로, 여기 코드를 저쪽에 넣으면
// hits<2로 확정 red가 되고 그 test는 머지 차단 workflow의 판정 선행 step이다(L2 흡수 B).
const DELETE_REFUSAL_REASONS = [
  'selftest_target',            // (a) 판정보다 앞선 자기 test step이 이름으로 부른다
  'quarantined_target',         // (b) 격리 목록에 걸린다 → Enumerate sanity가 먼저 죽는다
  'not_tracked_test',           // (c) tracked *.test.js가 아니다
  'selftest_list_unreadable',   // (a)의 입력 판독 실패/0건 → 전면 거부
  'quarantine_list_unreadable', // (b)의 입력 판독 실패 → 전면 거부
];

class DeleteRefusal extends Error {
  constructor(reason, message) {
    super(message);
    // 미선언 사유 방출을 fail-closed로 막는다(`gate.js`의 reasons_undeclared와 같은 역할).
    if (DELETE_REFUSAL_REASONS.indexOf(reason) < 0) {
      throw new Error('wiring-cut: undeclared refusal reason "' + reason + '"');
    }
    this.name = 'DeleteRefusal';
    this.reason = reason;
  }
}

const errText = function (err) { return String((err && err.message) || err).split('\n')[0]; };

// 보호 목록을 **산문에 적지 않고** workflow에서 파싱한다 — 산문 목록은 workflow가
// 바뀌면 조용히 낡는다. step의 `name:`이 아니라 **명령 형태**(`node --test`)로 식별하므로
// step을 개명해도 목록이 살아남는다. 이 함수는 순수하고 export된다: 파괴적 CLI를 거치지
// 않고도 파서를 직접 반증할 수 있어야 하기 때문이다(Implement-Codex R1 F1 완화).
function parseSelfTestTargets(workflowText) {
  const lines = String(workflowText).split(/\r?\n/);
  const steps = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^(\s*)-\s+name:\s*(.+?)\s*$/);
    if (m) {
      if (cur) steps.push(cur);
      cur = { name: m[2].replace(/^['"]|['"]$/g, ''), body: '' };
      continue;
    }
    if (cur) cur.body += line + '\n';
  }
  if (cur) steps.push(cur);

  const targets = new Set();
  const named = [];
  for (const st of steps) {
    if (!/\bnode\s+--test\b/.test(st.body)) continue;
    named.push(st.name);
    for (const t of st.body.match(/[A-Za-z0-9_.\/-]+\.test\.js\b/g) || []) targets.add(toPosix(t));
  }
  return { steps: named, targets: Array.from(targets).sort() };
}

function trackedTests() {
  return git(['ls-files', '-z', '--', '*.test.js'])
    .split('\0').filter(Boolean).map(toPosix);
}

function readSelfTestTargets(workflow) {
  let text;
  try {
    text = fs.readFileSync(workflow, 'utf8');
  } catch (err) {
    throw new DeleteRefusal('selftest_list_unreadable',
      'cannot read ' + workflow + ' (' + errText(err) + ') — refusing every target');
  }
  const parsed = parseSelfTestTargets(text);
  // **0건은 통과가 아니라 거부다.** step이 개명·이동·주석화되면 목록이 조용히 비고,
  // 그때 (a)가 아무것도 거부하지 않으면 (c)가 tracked *.test.js를 허용하므로
  // `scripts/tests/wiring-cut.test.js` 자신이 다시 적격이 된다 — 가드가 정확히 자기가
  // 막으려던 것을 허용한다(E10b: 그 파일이 사라지면 판정보다 앞선 step이 먼저 죽어
  // gate.json이 생성되지 않는다).
  if (parsed.targets.length === 0) {
    throw new DeleteRefusal('selftest_list_unreadable',
      'no `node --test` step in ' + workflow + ' names a *.test.js literal — ' +
      'the self-test step was renamed, moved or commented out. Restore it before cutting.');
  }
  return parsed;
}

function readQuarantinePatterns(exclusionsFile) {
  try {
    return loadExclusions(exclusionsFile).map(function (e) { return e.pattern; });
  } catch (err) {
    // 판독/파싱/스키마 실패를 "격리 없음"으로 접지 않는다(S1).
    throw new DeleteRefusal('quarantine_list_unreadable',
      'cannot load ' + exclusionsFile + ' (' + errText(err) + ') — refusing every target');
  }
}

/** 거부는 **mutating call 앞에서** throw한다(S2). `git rm` 뒤의 크래시도 비영점이라,
 *  exit code만 보는 판정자는 "삭제 전 거부"와 "삭제 후 크래시"를 구분하지 못한다. */
function assertDeletable(target, opts) {
  const o = opts || {};
  const workflow = o.workflow || WORKFLOW;
  const exclusionsFile = o.exclusionsFile || EXCLUSIONS_FILE;
  const posix = toPosix(target);

  const parsed = readSelfTestTargets(workflow);
  if (parsed.targets.indexOf(posix) >= 0) {
    throw new DeleteRefusal('selftest_target',
      posix + ' is named by the judgment-preceding self-test step (' +
      (parsed.steps.join(', ') || '?') + ') in ' + workflow +
      ' — deleting it kills the producer of the axis-D evidence itself');
  }

  const patterns = readQuarantinePatterns(exclusionsFile);
  const hit = patterns.filter(function (p) { return globToRegExp(p).test(posix); })[0];
  if (hit) {
    throw new DeleteRefusal('quarantined_target',
      posix + ' matches quarantine pattern "' + hit + '" — deleting it drops excluded ' +
      'from ' + patterns.length + ' to ' + (patterns.length - 1) + ', so the Enumerate sanity ' +
      'equality assertion dies before judgment and no gate.json is produced');
  }

  if (!/\.test\.js$/.test(posix) || trackedTests().indexOf(posix) < 0) {
    throw new DeleteRefusal('not_tracked_test',
      posix + ' is not a tracked *.test.js file');
  }
}

// 심는 붉은 test의 경로. 격리 패턴 어디에도 걸리지 않아야 한다((e5a)) — 걸리면
// (i) 그 파일이 실행되지 않아 스위트 red가 애초에 발생하지 않고 (ii)
// `max_excluded_files` 등가 단언이 판정보다 앞선 자기 test 단계를 red로 만들어
// `gate.json`이 생성되지 않는다. 즉 축 D 증거의 producer가 사라진다.
const RED_FILE = 'scripts/tests/wiring-cut-negative-control.test.js';

const RED_BODY = [
  "'use strict';",
  '',
  '// 축 D 절단 A가 심는 **신호**다. 탐지기가 아니다 — 연기 감지기를 시험할 때',
  '// 연기를 피우는 것과 같다. 이 파일의 존재를 단언하는 test는 없고, 판정 경로의',
  '// 어떤 단계도 이것을 이름으로 알지 못한다. 그래서 A는 순환이 아니다.',
  '//',
  '// 이 파일은 `wiring-cut.js --apply-red`가 만들고 `--revert-red`가 지운다.',
  '// 저장소에 커밋된 채로 남으면 안 된다.',
  '',
  "const test = require('node:test');",
  "const assert = require('node:assert');",
  '',
  "test('axis-D negative control: this file exists to make the suite red', () => {",
  "  assert.strictEqual('cut', 'intact', 'wiring-cut axis D: planted failure (expected)');",
  '});',
  '',
].join('\n');

// 오라클 왕복이 제거하는 토큰. 판정 줄에서 이 인자가 사라지면 `wiring-cut.test.js`의
// 단언 1이 붉어져야 한다.
const ORACLE_TOKEN = ' --floor-from .github/test-suite-floor.json';

function git(args, opts) {
  return execFileSync('git', args, Object.assign({
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }, opts || {}));
}

function statePath() {
  const rel = git(['rev-parse', '--git-path', 'mccp/tmp']).trim();
  fs.mkdirSync(rel, { recursive: true });
  return path.join(rel, 'wiring-cut-state.json');
}

function readState() {
  const p = statePath();
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return {}; }
}

function writeState(next) {
  fs.writeFileSync(statePath(), JSON.stringify(next, null, 2) + '\n');
}

// ── 절단 A — 붉은 test 파일을 심는다 ─────────────────────────────────────────
function applyRed() {
  fs.mkdirSync(path.dirname(RED_FILE), { recursive: true });
  fs.writeFileSync(RED_FILE, RED_BODY);
  // **index까지 반영한다.** `git ls-files`가 index를 읽으므로 worktree에만 쓰면
  // 열거가 이 파일을 보지 못하고 스위트가 여전히 green이다 — 절단이 무력해진다.
  git(['add', '--', RED_FILE]);
  const st = readState();
  st.red = { path: RED_FILE };
  writeState(st);
  return RED_FILE;
}

function revertRed() {
  const st = readState();
  const target = (st.red && st.red.path) || RED_FILE;
  try { git(['rm', '--cached', '--quiet', '--', target]); } catch (_) { /* 이미 index 밖 */ }
  if (fs.existsSync(target)) fs.unlinkSync(target);
  delete st.red;
  writeState(st);
  return target;
}

// ── 절단 B — tracked test 파일 1개를 삭제한다 ────────────────────────────────
function applyDelete(target, opts) {
  if (!target) throw new Error('--apply-delete requires a repo-relative path');
  // 가드가 먼저다. 아래 `git rm`은 이 줄을 통과한 뒤에만 실행된다(S2).
  assertDeletable(target, opts);
  // `git rm`이지 worktree 삭제가 아니다. `git ls-files`가 index를 읽으므로 worktree만
  // 지우면 head 집합이 줄지 않아 삭제 래칫이 반응하지 않는다(L2 R8 invariant).
  git(['rm', '--quiet', '--', target]);
  const st = readState();
  st.deleted = { path: target };
  writeState(st);
  return target;
}

function revertDelete() {
  const st = readState();
  const target = st.deleted && st.deleted.path;
  if (!target) throw new Error('--revert-delete: no recorded deletion to restore');
  git(['checkout', 'HEAD', '--', target]);
  delete st.deleted;
  writeState(st);
  return target;
}

// 결정적 후보 선택 — 적격 집합을 정렬해 첫 원소를 낸다.
//
// **이 선택기는 "삭제해도 나머지가 green" 을 성립시키지 않는다**(Implement-Codex R1 F2 ·
// L2 architect). 그 명제는 전수 스위트 실행 없이 순수 선택기가 판정할 수 없고, 여기에는
// 스위트를 부르는 경로가 없다. 선택기가 보장하는 것은 세 가드를 통과한다는 것뿐이고,
// green-remainder는 절단 B의 **실제 CI run** 이 실증한다 — 다른 test가 삭제 대상에
// 의존하면 그 run 이 stage 1(`suite_red`)에서 멈추고 `## Validation` 의
// `a.stage===b.stage` 단언이 붉어진다. 즉 반증은 선택기가 아니라 판정자가 한다.
function pickDelete(opts) {
  const o = opts || {};
  const parsed = readSelfTestTargets(o.workflow || WORKFLOW);
  const patterns = readQuarantinePatterns(o.exclusionsFile || EXCLUSIONS_FILE);
  const res = patterns.map(globToRegExp);
  const eligible = trackedTests()
    .filter(function (f) { return parsed.targets.indexOf(f) < 0; })
    .filter(function (f) { return !res.some(function (re) { return re.test(f); }); })
    .sort();
  if (!eligible.length) {
    throw new Error('--pick-delete: no tracked *.test.js is eligible under the three guards');
  }
  return eligible[0];
}

// ── 오라클 왕복 — 판정 줄의 토큰 하나를 제거한다 ─────────────────────────────
function applyOracle() {
  const before = fs.readFileSync(WORKFLOW, 'utf8');
  if (before.indexOf(ORACLE_TOKEN) < 0) {
    throw new Error('--apply: the token "' + ORACLE_TOKEN.trim() + '" is not present in ' + WORKFLOW +
      ' — the gate line has already drifted, which is itself the failure this cut tests for');
  }
  const st = readState();
  // **복원 스냅샷을 먼저 남기고 나서 자른다.** git으로 되돌리지 않는 이유는 실측된
  // 결함이다: `git checkout HEAD -- <file>`은 그 파일이 이미 커밋돼 있을 때만 되고,
  // workflow가 아직 untracked인 사이클(= 이 파일을 처음 만드는 바로 그 사이클)에서는
  // `did not match any file(s) known to git`으로 죽어 **잘린 트리가 그대로 남는다**.
  // 그리고 `git status --porcelain`은 untracked 파일의 내용 변화를 보지 못하므로
  // 계획의 잔여 검사가 그 실패를 놓친다 — 즉 복원 실패가 조용하다.
  // 스냅샷 복원은 tracked 여부와 무관하고, 아래 토큰 재확인이 그 복원을 검증한다.
  st.oracle = { file: WORKFLOW, token: ORACLE_TOKEN, snapshot: before };
  writeState(st);
  fs.writeFileSync(WORKFLOW, before.replace(ORACLE_TOKEN, ''));
  return WORKFLOW;
}

function revertOracle() {
  const st = readState();
  const rec = st.oracle;
  const file = (rec && rec.file) || WORKFLOW;
  const token = (rec && rec.token) || ORACLE_TOKEN;
  if (!rec || typeof rec.snapshot !== 'string') {
    throw new Error('--revert: no recorded snapshot to restore — run --apply first');
  }
  fs.writeFileSync(file, rec.snapshot);
  const after = fs.readFileSync(file, 'utf8');
  if (after.indexOf(token) < 0) {
    throw new Error('--revert: restored ' + file + ' but the token is still absent — restore failed');
  }
  delete st.oracle;
  writeState(st);
  return file;
}

module.exports = {
  WORKFLOW, RED_FILE, RED_BODY, ORACLE_TOKEN, EXCLUSIONS_FILE,
  DELETE_REFUSAL_REASONS, DeleteRefusal,
  parseSelfTestTargets, assertDeletable, pickDelete,
  applyRed, revertRed, applyDelete, revertDelete, applyOracle, revertOracle,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  // `--workflow <path>` 는 rule (a) 의 입력을 caller 가 정하게 하는 test seam 이다.
  // 기본값은 모듈 상수라 호출 형태는 무변경. **잔여 우회면이 있다**: 자기 test step 은
  // 있으나 다른 파일을 지목하는 합성 workflow 는 목록이 비지 않아 (a) 가 발동하지 않는다
  // (Implement-Codex R1 F1 → backlog). 그래서 파서를 export 해 직접 반증한다.
  const wfIdx = argv.indexOf('--workflow');
  const opts = wfIdx >= 0 ? { workflow: argv[wfIdx + 1] } : {};
  const positional = argv.filter(function (a, i) {
    return i > 0 && a !== '--workflow' && (wfIdx < 0 || i !== wfIdx + 1) && a.indexOf('--') !== 0;
  });
  try {
    let out = '';
    if (mode === '--apply-red') out = applyRed();
    else if (mode === '--revert-red') out = revertRed();
    else if (mode === '--apply-delete') out = applyDelete(positional[0], opts);
    else if (mode === '--pick-delete') out = pickDelete(opts);
    else if (mode === '--revert-delete') out = revertDelete();
    else if (mode === '--apply') out = applyOracle();
    else if (mode === '--revert') out = revertOracle();
    else {
      process.stderr.write(
        'usage: wiring-cut.js --apply|--revert            (oracle round trip: gate-line token)\n' +
        '                     --apply-red|--revert-red    (cut A: plant a red test file, tracked)\n' +
        '                     --apply-delete <path>|--revert-delete   (cut B: delete a tracked test)\n' +
        '                     --pick-delete               (cut B: emit a deterministic eligible target)\n' +
        '                     [--workflow <path>]         (override the rule-(a) input; test seam)\n');
      process.exitCode = 2;
      out = null;
    }
    if (out !== null) process.stdout.write(out + '\n');
  } catch (err) {
    // 거부는 **사유 코드와 함께** 나간다. 비영점만 보면 오타·모듈 로드 실패도 통과하므로
    // `## Validation` 이 코드를 grep 한다.
    const reason = err && err.reason ? ' reason=' + err.reason : '';
    process.stderr.write('[wiring-cut]' + reason + ' ' + String((err && err.message) || err) + '\n');
    process.exitCode = 1;
  }
}
