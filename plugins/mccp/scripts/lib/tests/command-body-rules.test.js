'use strict';

// diverse-agent-review M5 Task 3 — 변이 test.
//
// 규칙이 통과한다는 사실만으로는 규칙이 작동한다는 증거가 되지 않는다. 그것이 이 milestone 이
// 닫으려는 실패("단위 test 통과 ≠ 경로 작동") 자체이므로, 규칙마다 **합성 위반에 red 1건 /
// 위반만 제거한 짝에 green 0건**을 단언한다. 짝 단언이 없으면 규칙은 공허하게 green 일 수 있다.
//
// 합성 본문은 실제 결함 이력의 형태를 그대로 쓴다.

const test = require('node:test');
const assert = require('node:assert/strict');

const rules = require('../command-body/rules');

function fence(lines) {
  return ['```bash'].concat(lines, ['```']).join('\n');
}
function run(lines) {
  return rules.runRules(fence(lines), 'f.md');
}
function only(list, rule) {
  return list.filter(function (v) { return v.rule === rule; });
}

// ── S1 ──────────────────────────────────────────────────────────────────────

test('S1 red — a captured exit never read again in the same fence', function () {
  const hits = only(run([
    'node thing.js',
    'RUN_EXIT=$?',
  ]), 'S1');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 3);
  assert.match(hits[0].why, /never read again inside this fence/);
});

test('S1 green — the paired body reads it after capture', function () {
  const hits = only(run([
    'node thing.js',
    'RUN_EXIT=$?',
    'if [ "$RUN_EXIT" != "0" ]; then exit 1; fi',
  ]), 'S1');
  assert.deepEqual(hits, []);
});

test('S1 — "after" is part of the predicate: a read BEFORE a recapture does not exempt it', function () {
  // prp-implement.md:984/996 의 형태. 첫 캡처는 읽히므로 통과, 재캡처는 위반.
  const hits = only(run([
    'run_once',
    'ENTER_EXIT=$?',
    'echo "$ENTER_EXIT"',
    'run_twice',
    'ENTER_EXIT=$?',
  ]), 'S1');
  assert.equal(hits.length, 1, 'exactly the recapture is a violation');
  assert.equal(hits[0].line, 6);
});

test('S1 — a read in the NEXT fence does not count (shell state does not cross a fence)', function () {
  const src = [
    '```bash',
    'run_it',
    'BEGIN_EXIT=$?',
    '```',
    'prose',
    '```bash',
    'if [ "$BEGIN_EXIT" = "2" ]; then echo no; fi',
    '```',
  ].join('\n');
  const hits = only(rules.runRules(src, 'f.md'), 'S1');
  assert.equal(hits.length, 1, 'santa-loop.md:281 shape — the branch exists but in another fence');
  assert.equal(hits[0].line, 3);
});

// ── S1 lexical 제외 (Implement-Codex R1 F2) ──────────────────────────────────
// 주석·홑따옴표·heredoc 본문 안의 `$VAR` 는 실행 read 가 아니다. 그것을 read 로 세면 죽은
// 캡처가 읽힌 것으로 접혀 규칙이 겨냥한 클래스에서 false negative 가 난다. 제외 컨텍스트마다
// 짝을 둔다 — 하나만 두면 나머지 경로가 조용히 열린다.

test('F2 — a comment-only mention does not count as a read', function () {
  const hits = only(run([
    'node thing.js',
    'RUN_EXIT=$?',
    '# later we look at $RUN_EXIT',
  ]), 'S1');
  assert.equal(hits.length, 1, 'a comment is not an executable read');
});

test('F2 — a single-quoted mention does not count as a read', function () {
  const hits = only(run([
    'node thing.js',
    'RUN_EXIT=$?',
    "echo 'literal $RUN_EXIT stays unexpanded'",
  ]), 'S1');
  assert.equal(hits.length, 1, 'single quotes suppress expansion, so this is data');
});

test('F2 — a heredoc body mention does not count as a read', function () {
  const hits = only(run([
    'node thing.js',
    'RUN_EXIT=$?',
    'cat <<EOF',
    'the value was $RUN_EXIT',
    'EOF',
  ]), 'S1');
  assert.equal(hits.length, 1, 'heredoc payload is data, not an executable read');
});

// ── 인용 구분자 heredoc (code-review M1) ─────────────────────────────────────
// `<<'EOF'` 는 확장이 꺼진 진짜 heredoc 이다. 감지를 정제된 줄에서만 하면 `scrubQuotes` 가
// 구분자를 지워 버려 본문이 코드로 스캔되고, 본문의 `$VAR` 가 유령 read 가 되어 S1 이 죽은
// 캡처를 **놓친다**. 코퍼스에 인용 구분자가 8건 있다.

test('M1 — a single-quoted heredoc delimiter still opens a heredoc', function () {
  const hits = only(run([
    'node thing.js',
    'RUN_EXIT=$?',
    "cat > f <<'EOF'",
    'the value was $RUN_EXIT',
    'EOF',
  ]), 'S1');
  assert.equal(hits.length, 1, "a <<'EOF' payload is data — expansion is off, so this is no read");
});

test('M1 — a double-quoted heredoc delimiter behaves the same', function () {
  const hits = only(run([
    'node thing.js',
    'RUN_EXIT=$?',
    'cat > f <<"EOF"',
    'the value was $RUN_EXIT',
    'EOF',
  ]), 'S1');
  assert.equal(hits.length, 1);
});

test('M1 — `<<EOF` written INSIDE single quotes is still data, not a heredoc start', function () {
  // 정제된 줄 판정이 지키는 케이스. 원시 줄만 보면 이 줄이 heredoc 을 열어 나머지 블록이
  // 통째로 데이터가 되고 진짜 위반이 사라진다 — 두 판정이 함께 있어야 하는 이유다.
  const hits = only(run([
    "echo 'usage: cat <<EOF'",
    'node thing.js',
    'RUN_EXIT=$?',
  ]), 'S1');
  assert.equal(hits.length, 1, 'the capture after the quoted mention must still be seen');
});

test('F2 green — a double-quoted expansion IS a read', function () {
  const hits = only(run([
    'node thing.js',
    'RUN_EXIT=$?',
    'echo "exit=$RUN_EXIT"',
  ]), 'S1');
  assert.deepEqual(hits, [], 'double quotes expand — the value is genuinely consumed');
});

// ── S2 ──────────────────────────────────────────────────────────────────────

test('S2 red — a non-blocking call terminates the block', function () {
  const hits = only(run([
    'echo start',
    'gh pr checks --json name 2>/dev/null || true',
  ]), 'S2');
  assert.equal(hits.length, 1);
  assert.match(hits[0].why, /block end/);
});

test('S2 green — the paired body follows it with a real check', function () {
  const hits = only(run([
    'echo start',
    'gh pr checks --json name 2>/dev/null || true',
    'test -f out.json',
  ]), 'S2');
  assert.deepEqual(hits, []);
});

test('S2 red — a non-blocking call terminates an if-branch', function () {
  const hits = only(run([
    'if [ -f x ]; then',
    '  run_it || true',
    'fi',
  ]), 'S2');
  assert.equal(hits.length, 1);
  assert.match(hits[0].why, /fi/);
});

// ── S2 종결자 의미 클래스 (code-review H1) ───────────────────────────────────
// 처음 구현은 `fi` 와 블록 끝만 종결자로 봐서 **같은 if/else 의 반쪽을 놓쳤다**
// (`prp-implement.md:1408` 대 `:1410`). 종결자는 실측 열거가 아니라 의미 클래스이므로
// 클래스 전원에 짝을 둔다 — 반만 구현하면 규칙이 과소 보고하는 쪽으로 조용히 열린다.

test('S2 red — a non-blocking call terminates a then-branch (next token is else)', function () {
  const hits = only(run([
    'if [ -n "$REV" ]; then',
    '  git diff "$REV" > out.txt 2>/dev/null || true',
    'else',
    '  git diff HEAD > out.txt 2>/dev/null || true',
    'fi',
  ]), 'S2');
  assert.equal(hits.length, 2, 'both halves of the if/else pair are violations');
  assert.deepEqual(hits.map(function (h) { return h.line; }), [3, 5]);
  assert.match(hits[0].why, /\(else\)/);
  assert.match(hits[1].why, /\(fi\)/);
});

test('S2 red — a non-blocking call terminates a loop body (next token is done)', function () {
  const hits = only(run([
    'for f in $(git ls-files --others); do',
    '  git diff --no-index /dev/null "$f" >> out.txt 2>/dev/null || true',
    'done',
  ]), 'S2');
  assert.equal(hits.length, 1);
  assert.match(hits[0].why, /\(done\)/);
});

test('S2 — the terminator is matched on the FIRST token, so `done < file` still counts', function () {
  const hits = only(run([
    'while read -r l; do',
    '  handle "$l" || true',
    'done < "$SRC"',
  ]), 'S2');
  assert.equal(hits.length, 1, 'a terminator carrying a redirection is still a terminator');
});

test('S2 — elif / esac / ;; complete the class even though the corpus has none', function () {
  ['elif [ -f y ]; then', 'esac', ';;'].forEach(function (term) {
    const hits = only(run(['run_it || true', term]), 'S2');
    assert.equal(hits.length, 1, term + ' must terminate the branch');
  });
});

test('S2 green — an ordinary next statement is not a terminator', function () {
  const hits = only(run([
    'run_it || true',
    'echo still going',
    'fi',
  ]), 'S2');
  assert.deepEqual(hits, [], 'only the LAST statement of a branch is the violation');
});

test('S2 — a helper body is exempt (the caller decides the exit)', function () {
  const hits = only(run([
    'helper() {',
    '  run_it || true',
    '}',
  ]), 'S2');
  assert.deepEqual(hits, [], 'inherits the escape the existing F1 check uses');
});

// ── S3 ──────────────────────────────────────────────────────────────────────

test('S3 red — fail-open node instrumentation discards stderr', function () {
  const hits = only(run([
    'TIER=$(node "$ROOT/scripts/lib/cost-state.js" get-tier 2>/dev/null || echo "green")',
  ]), 'S3');
  assert.equal(hits.length, 1);
  assert.match(hits[0].why, /only diagnostic channel/);
});

test('S3 green — the paired body keeps stderr', function () {
  const hits = only(run([
    'TIER=$(node "$ROOT/scripts/lib/cost-state.js" get-tier || echo "green")',
  ]), 'S3');
  assert.deepEqual(hits, []);
});

// 술어의 세 조건이 곱이라는 것을 각각 반증한다. 하나라도 or 로 느슨해지면 아래가 붉어진다.
test('S3 — a non-instrumentation command is not a violation even when fail-open', function () {
  const hits = only(run([
    'git diff HEAD > out.txt 2>/dev/null || true',
  ]), 'S3');
  assert.deepEqual(hits, [], 'git failure is a normal path; it has no loud-fail-open contract');
});

test('S3 — a node call that is NOT fail-open is not a violation', function () {
  const hits = only(run([
    'node thing.js 2>/dev/null',
    'echo done',
  ]), 'S3');
  assert.deepEqual(hits, [], 'without a fallback or substitution the call still stops the gate');
});

// ── 규칙 집합 자체 ───────────────────────────────────────────────────────────

test('RULES enumerates exactly the three implemented rules', function () {
  assert.deepEqual(rules.RULES.slice(), ['S1', 'S2', 'S3']);
  rules.RULES.forEach(function (r) {
    assert.equal(typeof rules[r.toLowerCase()], 'function', r + ' must have an implementation');
  });
});

test('scrubQuotes preserves length so callers can map back to columns', function () {
  const line = "echo 'abc' \"def\"";
  assert.equal(rules.scrubQuotes(line).length, line.length);
});
