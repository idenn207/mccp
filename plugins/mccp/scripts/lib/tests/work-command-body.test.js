'use strict';

// commands/work.md — orchestrator-step-wiring M2 (Task 8): halt 배선의 정적 강제.
//
// M2 의 명제는 "산문 지시가 아니라 정적 test 가 강제하는 배선" 이다. 이 파일이
// 그 명제 자체다 — 여기 없는 것은 다음 편집에서 조용히 사라질 수 있다.
//
// 강제하는 것 여덟:
//   (a) 모든 비영점 exit 은 같은 블록 안 **앞선** recorder 를 갖는다      (커버리지)
//   (b) 어떤 recorder 도 stderr 를 버리지 않는다                          (UI2)
//   (c) 어떤 recorder 도 분기의 마지막 문장이 아니다                      (DD5)
//   (d) 사이트 표의 shell 행 집합 == 실제 배선된 --site 집합 (양방향)     (DD3)
//   (e) --site 는 유일하고 --step 은 DD7 enum 안이다                      (DD7)
//   (f) UI5 경계 두 지점을 **리터럴로** pin 한다                          (UI5/DD11)
//   (g) 배너가 존재하고 A1 뒤에 오며 같은 fold 형태다                     (지표 5)
//   (h) 표의 분모와 실측 exit 수가 같다                                   (DD3)
//
// mirror: plan-review-command-body.test.js — fence 추출은 `command-body/blocks`
// 오라클을 쓴다. 로컬 복제는 들여쓴 fence 와 `sh`/`shell` 태그를 놓친다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const blocks = require('../command-body/blocks');
const orch = require('../work-orchestrator');

const WORK_MD = path.join(__dirname, '..', '..', '..', 'commands', 'work.md');
const SRC = fs.readFileSync(WORK_MD, 'utf8');
const BASH = blocks.bashBlocks(SRC);

const EXIT_RE = /\bexit\s+[1-9]/;
const REC_RE = /record-halt/;

// 표의 행. site slug 에는 `.` 과 `-` 가 들어가고(`3.wp.no-return`), step 은
// snake_case 다. 둘 중 하나라도 빠뜨리면 매칭이 0건이 되어 이 검사 자체가 조용히
// 무력해지므로, 아래 (d)(h) 는 rows 가 비어 있지 않음을 먼저 단언한다.
function tableRows(enforcement) {
  const re = new RegExp('^\\| `([0-9a-z.-]+)` \\| `([a-z_]+)` \\|[^|]*\\| '
    + enforcement + ' \\|$', 'gm');
  const out = [];
  let m;
  while ((m = re.exec(SRC)) !== null) out.push({ site: m[1], step: m[2] });
  return out;
}

// 배선된 recorder 호출을 한 줄 단위로 훑는다. 인라인 `|| { ...; exit 13; }` 형태는
// 한 줄에 recorder 와 exit 이 함께 있으므로 줄 단위가 옳은 단위다.
function wiredCalls() {
  const out = [];
  BASH.forEach(function (b, bi) {
    (b.lines || []).forEach(function (line, li) {
      if (!REC_RE.test(line)) return;
      const site = (line.match(/--site\s+(\S+)/) || [])[1] || null;
      const step = (line.match(/--step\s+(\S+)/) || [])[1] || null;
      out.push({ block: bi, index: li, line: line, site: site, step: step });
    });
  });
  return out;
}

// recorder 와 exit 을 **문서 순서대로** 이벤트로 편다. 한 줄에 둘 다 있는 인라인
// `|| { ...; record-halt ...; exit 13; }` 형태는 문자 위치로 순서를 정한다 — 줄 단위로
// 뭉뚱그리면 `exit` 이 recorder 보다 앞에 오는 배선을 통과시킨다.
function blockEvents(lines) {
  const events = [];
  (lines || []).forEach(function (line, li) {
    const local = [];
    const recAt = line.search(REC_RE);
    if (recAt >= 0) local.push({ kind: 'rec', at: recAt, index: li, line: line });
    const em = line.match(EXIT_RE);
    if (em) local.push({ kind: 'exit', at: line.indexOf(em[0]), index: li, line: line });
    local.sort(function (x, y) { return x.at - y.at; });
    local.forEach(function (e) { events.push(e); });
  });
  return events;
}

// review MEDIUM-2 — 초판의 (a)/(c) 는 **블록 단위 근사**였다: (a) 는 "이 exit 앞
// 어딘가에 recorder 문자열이 있는가", (c) 는 "이 recorder 뒤 어딘가에 exit 이 있는가"
// 만 물어서, 한 블록에 recorder 1 + exit 3 이면 뒤 두 exit 이 남의 recorder 에
// 무임승차했고 DD5 위반도 옆 분기의 exit 이 가려 줬다. 지금 배선은 블록마다 수가
// 맞아 red 가 아니었지만, 그 test 가 막겠다고 선언한 회귀를 정확히 놓치는 형태였다.
// 그래서 판정을 1:1 **소비**로 바꾼다 — recorder 를 스택에 쌓고 exit 이 하나씩 꺼낸다.
// 남는 exit 은 기록 없는 halt(커버리지 구멍), 남는 recorder 는 뒤에 exit 이 없는
// 배선(DD5)이다. LIFO 라 "가장 가까운 앞선 recorder" 가 소비된다.
function pairBlock(lines) {
  const pending = [];
  const orphanExits = [];
  blockEvents(lines).forEach(function (e) {
    if (e.kind === 'rec') { pending.push(e); return; }
    if (pending.length === 0) orphanExits.push(e);
    else pending.pop();
  });
  return { orphanExits: orphanExits, danglingRecorders: pending };
}

// ── (a) 커버리지: 비영점 exit 은 **자기** recorder 를 갖는다 ────────────────

test('(a) every non-zero exit consumes a record-halt of its own', () => {
  const missing = [];
  BASH.forEach(function (b, bi) {
    pairBlock(b.lines).orphanExits.forEach(function (e) {
      missing.push('block#' + bi + ' line ' + e.index + ': ' + e.line.trim());
    });
  });
  assert.deepEqual(missing, [],
    'a halt that records nothing is exactly the gap M2 closes. Pairing is 1:1 — an '
    + 'earlier branch\'s recorder does not cover this exit:\n' + missing.join('\n'));
});

// ── (b) UI2: stderr 를 버리지 않는다 ───────────────────────────────────────

test('(b) no record-halt invocation discards stderr', () => {
  const offenders = wiredCalls().filter(function (c) {
    return /2>\/dev\/null/.test(c.line) || /2>&1/.test(c.line);
  }).map(function (c) { return c.line.trim(); });
  assert.deepEqual(offenders, [],
    'the recorder reports its own failures on stderr and nowhere else — discarding it '
    + 'restores the silence UI2 forbids:\n' + offenders.join('\n'));
});

// ── (c) DD5: recorder 는 분기의 마지막 문장이 아니다 ───────────────────────

test('(c) no record-halt is the last statement of its failure branch', () => {
  const offenders = [];
  BASH.forEach(function (b, bi) {
    pairBlock(b.lines).danglingRecorders.forEach(function (e) {
      offenders.push('block#' + bi + ' line ' + e.index + ': ' + e.line.trim());
    });
  });
  assert.deepEqual(offenders, [],
    'a `|| true` recorder that ends a branch hands exit 0 to that branch — the halt '
    + 'then reads as a pass. plan-review-command-body.test.js F1 pinned this exact '
    + 'defect in a sibling body, so it is measured, not hypothetical:\n' + offenders.join('\n'));
});

// ── (c2) 판정기 자기 검증 ──────────────────────────────────────────────────
//
// (a)(c) 는 둘 다 `pairBlock` 이 실제로 무언가를 잡을 때에만 의미가 있다. 초판이
// 통과한 이유가 "배선이 옳아서" 가 아니라 "검사가 느슨해서" 였으므로, 이번에는
// 판정기가 각 결함 형태를 실제로 지목하는지 합성 입력으로 확인한다. 이것이 없으면
// 다음 리팩터가 `pairBlock` 을 무해하게 만들어도 (a)(c) 는 계속 green 이다.
test('(c2) the pairing oracle actually catches both defect shapes', () => {
  // recorder 1 + exit 2 — 두 번째 exit 은 남의 recorder 에 무임승차할 수 없다.
  const freeRide = pairBlock([
    'node ... record-halt --step implement --site a.b || true',
    'exit 13',
    'exit 1',
  ]);
  assert.equal(freeRide.orphanExits.length, 1, 'a second exit must not reuse the first recorder');
  assert.equal(freeRide.danglingRecorders.length, 0);

  // recorder 가 분기의 마지막 — 뒤에 exit 이 없다.
  const dangling = pairBlock([
    'exit 13',
    'node ... record-halt --step implement --site a.b || true',
  ]);
  assert.equal(dangling.danglingRecorders.length, 1, 'a trailing recorder must be reported');
  assert.equal(dangling.orphanExits.length, 1, 'an exit before any recorder is uncovered');

  // 같은 줄 인라인은 순서가 문자 위치로 결정된다 — recorder 가 앞이면 정상.
  const inline = pairBlock(['... || { echo x 1>&2; node ... record-halt --site a.b || true; exit 13; }']);
  assert.deepEqual([inline.orphanExits.length, inline.danglingRecorders.length], [0, 0]);

  // 같은 줄인데 exit 이 recorder 보다 **앞** 이면 그 exit 은 기록 없이 나간다.
  const reversed = pairBlock(['... || { exit 13; node ... record-halt --site a.b || true; }']);
  assert.equal(reversed.orphanExits.length, 1, 'character order decides, not line membership');
});

// ── (d) DD3: 표 ↔ 배선 양방향 일치 ─────────────────────────────────────────

test('(d) the site table and the wiring agree in BOTH directions', () => {
  const rows = tableRows('shell');
  assert.ok(rows.length > 0, 'the site-table matcher matched nothing — the check itself is broken');

  const declared = rows.map(function (r) { return r.site; }).sort();
  const wired = wiredCalls().map(function (c) { return c.site; }).sort();

  assert.deepEqual(wired, declared,
    'a table row with no wiring inflates coverage; wiring with no row escapes the '
    + 'denominator. Both directions must hold, or shrinking the table becomes a way '
    + 'to satisfy the coverage metric.');

  // step 도 표와 일치해야 한다 — site 만 맞고 step 이 어긋나면 A1 조인이 깨진다.
  const bySite = {};
  rows.forEach(function (r) { bySite[r.site] = r.step; });
  wiredCalls().forEach(function (c) {
    assert.equal(c.step, bySite[c.site],
      'site=' + c.site + ' is wired with step=' + c.step + ' but the table says '
      + bySite[c.site]);
  });
});

// ── (e) DD7: site 유일성 + step enum ───────────────────────────────────────

test('(e) --site values are unique and --step values are inside the DD7 enum', () => {
  const sites = wiredCalls().map(function (c) { return c.site; });
  assert.equal(new Set(sites).size, sites.length,
    'a duplicated site makes two different halts indistinguishable in the record: '
    + sites.join(', '));

  const bad = wiredCalls().filter(function (c) { return orch.HALT_STEPS.indexOf(c.step) < 0; });
  assert.deepEqual(bad.map(function (c) { return c.step; }), [],
    'a step outside the enum is skipped at runtime with a loud stderr — the wiring '
    + 'would look present while recording nothing');
});

// ── (f) UI5: 리터럴 pin (줄 번호가 아니다) ─────────────────────────────────

test('(f) UI5 boundary: prep-parallel rm -f list and the fleet-results check are untouched', () => {
  // 줄 번호로 pin 하지 않는다 — recorder 삽입이 아래 줄을 전부 밀어내므로 번호 기반
  // 단언은 이 milestone 자신의 변경에 스스로 깨진다.
  const rmTargets = [
    'dispatch-fleet-args.json',
    'dispatch-partitions.json',
    'dispatch-fleet-prepare.json',
    'dispatch-cap-denied.json',
  ];
  const rmLine = SRC.split(/\r?\n/).find(function (l) {
    return l.includes('rm -f "$GITDIR/dispatch-fleet-args.json"');
  });
  assert.ok(rmLine, 'prep-parallel stale-clear line vanished');
  rmTargets.forEach(function (t) {
    assert.ok(SRC.includes('"$GITDIR/' + t + '"'),
      'prep-parallel must still clear ' + t + ' — UI5 put this list out of scope');
  });
  // 예약 토큰은 이 목록에 **들어가면 안 된다**(M3 follow-up R1 F1).
  assert.ok(!/rm -f "\$GITDIR\/dispatch-fleet-args\.json"[^\n]*dispatch-fleet-reservation/.test(SRC),
    'the reservation token must never join the prep-parallel rm -f list');

  assert.ok(SRC.includes('[ ! -d "$GITDIR/dispatch-fleet-results" ]'),
    'the fleet-results directory check is the other UI5 anchor; 3.wp.no-return sits '
    + 'inside the same if block, so an edit there is the realistic way to break it');
});

// ── (g) 지표 5: 배너 pin ───────────────────────────────────────────────────

test('(g) the halt banner exists exactly once, after A1, in the same fold shape', () => {
  const lastHalt = [];
  const a1 = [];
  // 주석 줄은 호출이 아니다. 배너 블록은 자기 출력 포맷의 소유자를 주석에서
  // 이름으로 부르므로, 그것까지 세면 "정확히 1건" 이 구조적으로 성립할 수 없다.
  // 셸(`#`)과 JS(`//`) 양쪽을 거른다 — 이 블록은 `node -e` 안에 JS 를 품는다.
  const isComment = function (line) { return /^\s*(#|\/\/)/.test(line); };
  // 진단 접두 `[mccp:last-halt]` 도 호출이 아니다. reader 가 내지 않은 말을 사유로
  // 삼지 않으려면 배너가 그 접두를 리터럴로 대조해야 하고(review HIGH-2), 그래서 그
  // 문자열은 주석이 아닌 **실행되는 코드**에 실재한다. 이름이 겹칠 뿐 호출이 아니므로
  // 세기 전에 지운다 — 안 지우면 그 방어를 넣는 순간 (g) 가 붉어진다.
  const callSites = function (line) { return line.replace(/\[mccp:last-halt\]/g, ''); };
  BASH.forEach(function (b, bi) {
    (b.lines || []).forEach(function (line, li) {
      if (isComment(line)) return;
      if (/\blast-halt\b/.test(callSites(line))) lastHalt.push({ b: bi, l: li, line: line });
      if (/"a1"/.test(line)) a1.push({ b: bi, l: li });
    });
  });

  assert.equal(lastHalt.length, 1,
    'exactly one banner call is expected; zero means metric 5 is unfalsifiable again, '
    + 'more than one means the entry prints the same halt twice');
  assert.equal(a1.length, 1, 'the A1 banner call is the anchor this one is ordered against');

  const h = lastHalt[0];
  const a = a1[0];
  assert.ok(h.b > a.b || (h.b === a.b && h.l > a.l),
    'the halt line must come after A1 — they are read together, and A1 leads');

  const block = BASH[h.b].lines.join('\n');
  assert.match(block, /spawnSync/,
    'same fold shape as A1: a child-process boundary, so the CLI cannot block entry');
  assert.match(block, /timeout:\s*3000/,
    'same fold shape as A1: a bounded timeout');
  assert.match(block, /halt 배너 생략/,
    'absence and failure must be distinguishable — a silent read failure lets the '
    + 'instrumentation debt accumulate unseen (the exact argument work.md already '
    + 'makes for A1)');
});

// ── (i) supersession producer 가 배선돼 있다 (review HIGH-1) ───────────────
//
// `last-halt` 는 "chain_progress 의 **마지막** 항목이 halted 일 때만" 그 halt 를
// 주장한다. 그 규칙은 halt 뒤에 non-halted 항목이 실제로 쌓일 때에만 발동하는데,
// M2 초판에는 그것을 쌓는 호출자가 명령 본문에 0건이었다 — 그래서 첫 halt 이후
// 모든 진입이 같은 줄을 무기한 재생했고(실측), Task 9 가 전제한 "평소 미표시" 가
// 최초 halt 이후 거짓이 됐다. reader 쪽 규칙만 test 하면 그 사실이 보이지 않으므로
// **producer 의 존재**를 여기서 별도로 고정한다.
test('(i) the progress recorder that makes supersession reachable is wired', () => {
  const progress = [];
  BASH.forEach(function (b, bi) {
    (b.lines || []).forEach(function (line, li) {
      if (/^\s*#/.test(line)) return;
      if (/\brecord-step\b/.test(line)) {
        progress.push({ b: bi, l: li, step: (line.match(/--step\s+(\S+)/) || [])[1] || null,
          status: (line.match(/--status\s+(\S+)/) || [])[1] || null });
      }
    });
  });

  assert.ok(progress.length >= 2,
    'without a progress record after a halt, chain_progress only ever grows halted '
    + 'entries and the trailing-halt rule can never fire — the banner then claims a '
    + 'fixed halt forever. found: ' + JSON.stringify(progress));
  progress.forEach(function (p) {
    assert.equal(p.status, 'ok', 'a progress record reports progress, not another halt');
    assert.ok(orch.HALT_STEPS.indexOf(p.step) >= 0,
      '--step ' + p.step + ' is outside the DD7 enum, so the recorder skips it silently');
  });

  // 두 축이 각각 닫는 대상이 다르다 — implement 축(3.*)과 완주 축(0.dirty-tree ·
  // 2t.commit). 하나로 줄이면 나머지 축의 halt 가 영구히 남는다.
  const steps = progress.map(function (p) { return p.step; });
  assert.ok(steps.indexOf('implement') >= 0, 'the implement axis closes 3.* halts');
  assert.ok(steps.indexOf('pr') >= 0, 'the completion axis closes the detect/commit halts');
});

// ── (h) DD3: 분모 pin ──────────────────────────────────────────────────────

test('(h) the table denominator equals the measured number of non-zero exits', () => {
  let exits = 0;
  BASH.forEach(function (b) {
    (b.lines || []).forEach(function (l) { if (EXIT_RE.test(l)) exits++; });
  });
  const shellRows = tableRows('shell').length;
  const proseRows = tableRows('\\*\\*prose\\*\\*').length;

  assert.ok(shellRows > 0 && proseRows > 0, 'both matchers must actually match');
  assert.equal(shellRows, exits,
    'the first draft of this plan wrote the same number as 10 in four places and 12 in '
    + 'a fifth while the table listed 11. A coverage gate whose denominator disagrees '
    + 'with itself enforces nothing — so the equation is pinned, not narrated.');
  assert.equal(proseRows, 2,
    'the two prose halts stay in the denominator. Dropping them would make coverage '
    + 'read as a false 100%; §3.17 evidence-debt is the same shape — enumerate the '
    + 'debt so it gets paid.');
});
