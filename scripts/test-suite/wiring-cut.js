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

const WORKFLOW = '.github/workflows/test-suite.yml';

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
function applyDelete(target) {
  if (!target) throw new Error('--apply-delete requires a repo-relative path');
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
  WORKFLOW, RED_FILE, RED_BODY, ORACLE_TOKEN,
  applyRed, revertRed, applyDelete, revertDelete, applyOracle, revertOracle,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  try {
    let out = '';
    if (mode === '--apply-red') out = applyRed();
    else if (mode === '--revert-red') out = revertRed();
    else if (mode === '--apply-delete') out = applyDelete(argv[1]);
    else if (mode === '--revert-delete') out = revertDelete();
    else if (mode === '--apply') out = applyOracle();
    else if (mode === '--revert') out = revertOracle();
    else {
      process.stderr.write(
        'usage: wiring-cut.js --apply|--revert            (oracle round trip: gate-line token)\n' +
        '                     --apply-red|--revert-red    (cut A: plant a red test file, tracked)\n' +
        '                     --apply-delete <path>|--revert-delete   (cut B: delete a tracked test)\n');
      process.exitCode = 2;
      out = null;
    }
    if (out !== null) process.stdout.write(out + '\n');
  } catch (err) {
    process.stderr.write('[wiring-cut] ' + String((err && err.message) || err) + '\n');
    process.exitCode = 1;
  }
}
