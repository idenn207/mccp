'use strict';

// env-contract-integrity M3 / Task 7 — 세 게이트 본문의 배선 정적 단언.
//
// **이 파일이 주장할 수 있는 것의 범위를 먼저 좁힌다.** 명령 본문은 실행 파일이 아니라
// LLM이 읽는 산문이므로, 어떤 test도 "본문이 지시대로 실행됐다"를 증명하지 못한다.
// 여기서 잡는 것은 **배선 누락과 위치 drift**뿐이다 — 게이트 하나가 봉인을 빠뜨리면
// 그 게이트에서는 캡이 통째로 무효가 되는데(원장 키를 모르므로 셀 수조차 없다), 그
// 누락은 실행해 보기 전에는 조용하다. 그것이 review-single-pass-command-body.test.js가
// PRD Risk 5에 대해 하는 일과 정확히 같은 종류의 보장이고, 그 이상은 아니다.
//
// 실행 축은 다른 곳이 덮는다: 두 chokepoint가 실제로 거부하는지는
// review-rounds/tests/enforcement.test.js가 진짜 spawn과 자식 프로세스로 확인하고,
// 원장이 receipt에 실리는지는 receipt/tests/round-ledger-fields.test.js가 확인한다.
// 세 축이 모두 있어야 "캡이 기계로 강제된다"가 성립하며, 어느 하나도 나머지를 대신하지
// 않는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const COMMANDS = path.join(__dirname, '..', '..', '..', 'commands');
const CODEX_RUNNER = path.join(__dirname, '..', 'pr-phase-helpers', 'codex-runner.js');

function read(name) {
  return fs.readFileSync(path.join(COMMANDS, name), 'utf8');
}

// 실행되는 것은 fenced bash 블록뿐이다. 같은 토큰이 표와 서술에도 등장하므로 산문을
// 배선으로 세면 안 된다.
function bashBlocks(src) {
  const out = [];
  let cur = null;
  src.split(/\r?\n/).forEach(function (line) {
    if (/^```bash\s*$/.test(line)) { cur = []; return; }
    if (/^```\s*$/.test(line)) { if (cur) out.push(cur.join('\n')); cur = null; return; }
    if (cur) cur.push(line);
  });
  return out;
}

// 소스 안에서 fenced bash 블록의 **실행 줄**에 속한 패턴의 첫 위치.
//
// 산문과 주석을 함께 세면 순서를 잘못 판정한다 — 실측으로, 봉인 블록에 붙인 «이 호출은
// codex-invoke.js보다 앞서야 한다»는 설명 주석 자체가 "첫 codex-invoke 언급"으로 잡혀
// 올바른 배선이 붉게 나왔다. 위치 계약은 실행되는 줄에 대한 것이므로 `#` 줄은 뺀다.
function firstIndexInBash(src, re) {
  let best = -1;
  let offset = 0;
  const lines = src.split(/\r?\n/);
  let inBash = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^```bash\s*$/.test(line)) { inBash = true; offset += line.length + 1; continue; }
    if (/^```\s*$/.test(line)) { inBash = false; offset += line.length + 1; continue; }
    const isComment = /^\s*#/.test(line);
    if (inBash && !isComment && re.test(line) && best === -1) best = offset;
    offset += line.length + 1;
  }
  return best;
}

const GATES = [
  ['plan.md', 'mccp-plan-codex'],
  ['prp-implement.md', 'mccp-implement-codex'],
  ['pr.md', 'mccp-pr-codex'],
];

// ── 봉인 배선 ────────────────────────────────────────────────────────────────

test('every gate seals the round policy at entry, with its own gate id', () => {
  // 봉인이 없으면 그 게이트에서는 강제가 **구조적으로 불가능**하다 — 원장 키(gate id +
  // decision slug)가 봉인에만 있으므로 세는 것 자체가 안 된다. 게이트 하나를 빠뜨리는
  // 것은 그 게이트의 캡을 조용히 끄는 것과 같다.
  GATES.forEach(function (g) {
    const blocks = bashBlocks(read(g[0]));
    const sealing = blocks.filter(function (b) {
      return /review-rounds\/cli\.js"?\s+seal/.test(b);
    });
    assert.equal(sealing.length, 1,
      g[0] + ' must seal the round policy exactly once (found ' + sealing.length + ')');
    assert.ok(sealing[0].indexOf('--gate ' + g[1]) !== -1,
      g[0] + ' must seal under its own gate id ' + g[1] + ' — one shared ledger would ' +
      'let a decision that spent its plan rounds get zero implement reviews');
    assert.match(sealing[0], /--decision\s+"\$ROUND_SLUG"/,
      g[0] + ' must seal a derived decision slug, not a literal');
  });
});

test('the sealed slug is derived, and derived for THIS command', () => {
  // 슬러그가 어긋나면 봉인과 원장이 서로 다른 파일을 가리켜 캡이 항상 0에서 시작한다.
  const expected = {
    'plan.md': 'mccp:plan',
    'prp-implement.md': 'mccp:prp-implement',
    'pr.md': 'mccp:pr',
  };
  GATES.forEach(function (g) {
    const b = bashBlocks(read(g[0])).filter(function (x) {
      return /review-rounds\/cli\.js"?\s+seal/.test(x);
    })[0];
    assert.match(b, /ROUND_SLUG=\$\(node[\s\S]{0,200}derive-decision/,
      g[0] + ' must derive the slug in the same block as the seal');
    assert.ok(b.indexOf('--command ' + expected[g[0]]) !== -1,
      g[0] + ' must derive the slug for ' + expected[g[0]]);
  });
});

test('the seal precedes the first Codex invocation in every gate', () => {
  // 위치가 계약이다. 봉인이 첫 호출 뒤에 오면 그 호출은 등록되지 않은 채 지나가고,
  // 캡은 두 번째 호출부터만 세기 시작한다 — 캡 1에서는 예산이 사실상 2가 된다.
  GATES.forEach(function (g) {
    const src = read(g[0]);
    const seal = firstIndexInBash(src, /review-rounds\/cli\.js"?\s+seal/);
    const invoke = firstIndexInBash(src, /(codex-invoke\.js|codex-runner\.js)/);
    assert.ok(seal > -1, g[0] + ' must seal in a bash block');
    if (invoke === -1) return;          // this gate calls Codex through another file
    assert.ok(seal < invoke,
      g[0] + ' must seal BEFORE the first Codex invocation (seal@' + seal +
      ' invoke@' + invoke + ')');
  });
});

test('plan.md seals before the L2 panel launch, not just before Codex', () => {
  // 이 게이트에는 리뷰어 채널이 둘이고 패널이 **먼저** 발화한다. Codex 앞에만 두면
  // 패널 채널이 등록되지 않은 채 지나가 그 라운드가 어디에도 세어지지 않는다.
  const src = read('plan.md');
  const seal = firstIndexInBash(src, /review-rounds\/cli\.js"?\s+seal/);
  const emit = firstIndexInBash(src, /emit-workflow-args/);
  assert.ok(seal > -1 && emit > -1, 'both wiring points must exist');
  assert.ok(seal < emit,
    'the round seal must precede emit-workflow-args (seal@' + seal + ' emit@' + emit + ')');
});

// ── round-cap-reached 처리 ───────────────────────────────────────────────────

test('plan.md and prp-implement.md branch on round-cap-reached', () => {
  // 이 분기가 없으면 `round-cap-reached`가 기존 "Codex unavailable" 조건에 걸려
  // MCCP-GATE-STOP으로 끝난다 — 정상적인 예산 소진이 환경 장애로 보고되고, 운영자는
  // 있지도 않은 문제를 고치러 /codex:setup으로 간다.
  ['plan.md', 'prp-implement.md'].forEach(function (name) {
    const blocks = bashBlocks(read(name));
    const branching = blocks.filter(function (b) {
      return /elif\s+\[\s*"\$CODEX_CLASS"\s*=\s*"round-cap-reached"\s*\]/.test(b);
    });
    assert.ok(branching.length > 0,
      name + ' must carry an explicit round-cap-reached branch');
  });
});

test('the unavailable guard exempts round-cap-reached in both bodies', () => {
  // 분기를 추가하고 앞의 조건을 고치지 않으면 그 분기는 도달 불가다 — 첫 조건이 먼저
  // 참이 되어 GATE-STOP으로 빠진다.
  ['plan.md', 'prp-implement.md'].forEach(function (name) {
    const blocks = bashBlocks(read(name));
    const guard = blocks.filter(function (b) {
      return /CODEX_CLASS"\s*!=\s*"ok"/.test(b) && /MCCP_ALLOW_CODEX_UNAVAILABLE/.test(b);
    })[0];
    assert.ok(guard, name + ' must have the unavailable guard');
    assert.match(guard, /\[\s*"\$CODEX_CLASS"\s*!=\s*"round-cap-reached"\s*\]/,
      name + ' must exempt round-cap-reached from the unavailable guard, or the new ' +
      'branch below it is unreachable');
  });
});

test('both bodies map round-cap-reached to divergent, never to unavailable', () => {
  // DD4. `unavailable`은 "Codex에 닿지 못했다"를 주장하고, 그것은 cross-gate dedupe
  // 축에서 다르게 읽힌다. `divergent`는 dedupe를 닫힌 채로 둔다.
  ['plan.md', 'prp-implement.md'].forEach(function (name) {
    const blocks = bashBlocks(read(name));
    const verdict = blocks.filter(function (b) {
      return /CODEX_VERDICT="skipped"/.test(b) && /CODEX_VERDICT="unavailable"/.test(b);
    })[0];
    assert.ok(verdict, name + ' must derive CODEX_VERDICT');
    // 분기를 직접 겨냥한다. 같은 블록에 위쪽 guard의 `round-cap-reached`도 있으므로
    // 단순 indexOf는 guard를 잡고 그 뒤 500자에서 GATE-STOP 문구를 읽는다.
    assert.match(verdict,
      /elif\s+\[\s*"\$CODEX_CLASS"\s*=\s*"round-cap-reached"\s*\];\s*then[\s\S]{0,800}?CODEX_VERDICT="divergent"/,
      name + ' must map round-cap-reached to divergent in the verdict derivation');
    const divergentAt = verdict.indexOf('CODEX_VERDICT="divergent"');
    const unavailableAt = verdict.indexOf('CODEX_VERDICT="unavailable"');
    assert.ok(divergentAt > -1 && unavailableAt > -1);
    assert.ok(divergentAt < unavailableAt,
      name + ' must test round-cap-reached BEFORE the catch-all unavailable branch, ' +
      'which matches every class that is not "ok"');
  });
});

test('pr.md routes round-cap-reached through codex-runner, and says so', () => {
  // 이 게이트의 Codex 호출은 자식 프로세스(codex-runner.js) 안에 있으므로 셸 분기가
  // 본문에 없다. 그 사실이 본문에 적혀 있지 않으면 다음 독자는 배선 누락으로 읽는다.
  assert.match(read('pr.md'), /round-cap-reached/,
    'pr.md must state where its round-cap handling lives');
  const runner = fs.readFileSync(CODEX_RUNNER, 'utf8');
  assert.match(runner, /codexClass === 'round-cap-reached'/,
    'codex-runner.js must distinguish a spent budget from a broken Codex');
  assert.match(runner, /MCCP_GATE_ROUND_CAP/,
    'and must name the recovery path rather than sending the operator to /codex:setup');
});

// ── 게이트는 자기 캡을 해제할 수 없다 ───────────────────────────────────────

test('no gate body assigns or unsets MCCP_ROUND_LEDGER', () => {
  // `MCCP_CODEX_DISABLED`에 대한 같은 금지와 같은 이유다(실측: 게이트가 R1에서 정책을
  // 존중한 뒤 "소진됐다"고 판단해 R2를 위해 되돌렸다). 게이트가 자기 강제 모드를
  // observe로 내릴 수 있으면 캡은 게이트의 재량이 되고, 재량은 강제가 아니다.
  ['plan.md', 'prp-implement.md', 'pr.md'].forEach(function (name) {
    bashBlocks(read(name)).forEach(function (b) {
      assert.doesNotMatch(b, /^\s*(export\s+)?MCCP_ROUND_LEDGER=/m,
        name + ' must never assign MCCP_ROUND_LEDGER — it is operator policy, not gate state');
      assert.doesNotMatch(b, /\bunset\s+MCCP_ROUND_LEDGER\b/,
        name + ' must never unset MCCP_ROUND_LEDGER');
    });
  });
});

test('no gate body clears the round seal or the ledger', () => {
  // `review-rounds/cli.js clear`는 진단용이고 원장은 건드리지 않지만, 게이트가 그것을
  // 부르면 "막히면 clear"가 규범이 되어 캡이 장식이 된다. 원장 디렉토리 삭제는 더 직접적이다.
  ['plan.md', 'prp-implement.md', 'pr.md'].forEach(function (name) {
    bashBlocks(read(name)).forEach(function (b) {
      assert.doesNotMatch(b, /review-rounds\/cli\.js"?\s+clear/,
        name + ' must not clear the round seal');
      assert.doesNotMatch(b, /rm\s+-[rf]{1,2}\s+.*state\/review-rounds/,
        name + ' must not delete the round ledger');
    });
  });
});

test('the prose no longer claims the cap is only prose', () => {
  // 산문을 강제로 착각하게 두는 것이 이 축의 원래 실패였다. 세 본문 모두 캡이 이제
  // 기계라는 것과, 봉인이 없으면 그렇지 않다는 것을 함께 말해야 한다.
  ['plan.md', 'prp-implement.md', 'pr.md'].forEach(function (name) {
    const src = read(name);
    // 버전 번호는 **pin하지 않는다.** 이 단언이 지키는 것은 "캡이 이제 기계다"라는
    // 문장의 존재이지 그것이 어느 릴리스에 실렸는지가 아니다. 리터럴을 박으면 §3.7의
    // forward-only 상향(이 브랜치만 해도 이번 사이클에 두 번 겪었다)마다 무관한 test가
    // 붉어지고, 그 붉음을 끄는 가장 쉬운 방법이 단언을 지우는 것이 된다.
    assert.match(src, /이 캡은 v[\d.]+부터 산문이 아니다/,
      name + ' must state that the cap is now mechanical');
  });
  ['plan.md', 'prp-implement.md'].forEach(function (name) {
    assert.match(read(name), /meta\.round_cap=null/,
      name + ' must also state how a degraded (unsealed) run is visible');
  });
});
