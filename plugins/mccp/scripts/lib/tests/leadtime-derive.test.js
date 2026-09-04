'use strict';

// leadtime-observability M4 — derive 진입점의 git 증인 토글 회귀 test.
//
// ── 이 파일이 단언하지 **않는** 것: spawn 횟수 (DD7) ────────────────────────
//
// **이것은 spawn 계수가 아니다.** `execFileSync` 는 `leadtime.js` 모듈 최상위에서
// require 되고 `audit()` 이 내부 바인딩을 직접 부르므로, export 를 monkey-patch 해도
// 가로채지 못한다 — 주입된 실행기 seam 이 이 저장소에 **존재하지 않는다**. 프로세스
// 수를 세는 단언은 그래서 쓸 수 없고, 쓸 수 있는 척하지도 않는다.
//
// 대신 둘을 단언한다.
//
//   결과 단언 — 토글 off 에서 강등이 산출물에 실리고, 백분위와 커버리지는 on 과
//               **동일**하다. 즉 꺼진 것은 축이 아니라 증인이다.
//   정적 단언 — `readGitTouchedPaths` 호출이 정확히 1건이고 그것이 `allowGit` 삼항
//               안에 있다(`session-identity.test.js` 의 소스 스캔 단언과 같은 형태).
//
// 둘을 합치면 "그 분기를 타지 않았다"와 "그 분기가 spawn 의 유일한 관문이다"가 각각
// 고정된다. 합쳐도 spawn 계수가 되지는 않는다 — 그 한계가 이 주석의 요점이다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { scanLeadtime } = require('../leadtime-derive');
const { audit, summarizeForSurface } = require('../leadtime');
const { formatLeadtimeLine } = require('../leadtime-surface');

// 실코퍼스를 쓰되 단언은 **관계**다 — 카운트를 단언하지 않으므로 코퍼스가 자라도
// 붉어지지 않는다(`leadtime.test.js` 헤더 규약).
const ROOT = process.cwd();

function withToggle(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'MCCP_LEADTIME_GIT');
  const prev = process.env.MCCP_LEADTIME_GIT;
  if (value === null) delete process.env.MCCP_LEADTIME_GIT;
  else process.env.MCCP_LEADTIME_GIT = value;
  try {
    return fn();
  } finally {
    if (had) process.env.MCCP_LEADTIME_GIT = prev;
    else delete process.env.MCCP_LEADTIME_GIT;
  }
}

// ── 1. 토글이 렌더 경로에 실제로 도달한다 ───────────────────────────────────

test('MCCP_LEADTIME_GIT=off reaches the render path and states the degradation', () => {
  // M3 는 `allowGit: true` 를 하드코딩했으므로 이 단언은 그 시절 반드시 실패한다 —
  // 배선이 실재하는지를 고정하는 것이 이 test 의 목적이다.
  const off = withToggle('off', () => scanLeadtime(ROOT, { leadtimeScan: true }));
  assert.ok(off, 'the leadtime axis is loaded in this repository');
  assert.ok(off.degradations.includes('git-disabled'),
    'turning the witness off must be stated in the artifact, never silent: '
    + JSON.stringify(off.degradations));
});

test('an unset toggle keeps the witness on — the default does not quietly reduce observation', () => {
  const bare = withToggle(null, () => scanLeadtime(ROOT, { leadtimeScan: true }));
  assert.ok(bare, 'the leadtime axis is loaded in this repository');
  assert.ok(!bare.degradations.includes('git-disabled'),
    'the registry default is on; a silent off would remove observation without saying so');
});

// ── 2. 꺼진 것은 증인이지 축이 아니다 (DD6) ─────────────────────────────────

test('the toggle removes the witness, not the distribution', () => {
  const on = withToggle('on', () => scanLeadtime(ROOT, { leadtimeScan: true }));
  const off = withToggle('off', () => scanLeadtime(ROOT, { leadtimeScan: true }));
  assert.deepEqual(off.panel_span, on.panel_span, 'percentiles are untouched');
  assert.deepEqual(off.coverage, on.coverage, 'corpus coverage is untouched');
  assert.deepEqual(off.post_panel_span.by_anchor, on.post_panel_span.by_anchor,
    'both anchor series are untouched');
  assert.ok(!on.degradations.includes('git-disabled'),
    'the on run carries no such degradation — otherwise the signal means nothing');
});

// M4 리뷰 흡수 — 강등이 **산출물 JSON 에만** 실리면 DD6 의 약속은 절반만 참이다.
// 이 축이 소유하는 표면은 STATUS.md · status.html · `renderHuman` 첫 줄이고, 그
// 셋은 전부 `formatLeadtimeLine` 을 지난다. 리뷰 전에는 그 셋의 출력이 토글 on/off 에서
// 바이트 단위로 같았다 — 운영자가 레버를 당겨도 화면이 그대로였다는 뜻이다.
test('the toggle reaches the SURFACE, not only the artifact — the lever is visible', () => {
  const on = withToggle('on', () => scanLeadtime(ROOT, { leadtimeScan: true }));
  const off = withToggle('off', () => scanLeadtime(ROOT, { leadtimeScan: true }));
  const lineOn = formatLeadtimeLine(on);
  const lineOff = formatLeadtimeLine(off);

  // 한 줄 자체는 같아야 한다 — 꺼진 것은 증인이지 분포가 아니다(DD6).
  assert.equal(lineOff.text, lineOn.text, 'the values are untouched by the witness');
  // 그러나 두 렌더가 통째로 같으면 안 된다. 그 동일성이 리뷰가 잡은 결함이었다.
  assert.notDeepEqual(lineOff.parts, lineOn.parts,
    'an operator who pulled the lever must see that they did');
  assert.ok(lineOff.parts.note && lineOff.parts.note.includes('git-disabled'),
    'the off run names the reason on the surface: ' + JSON.stringify(lineOff.parts.note));
  assert.equal(lineOn.parts.note, null, 'the on run stays quiet — the signal must not over-fire');
});

// ── 3. 층 구분 — derive 가 읽을 수 있는 신호는 degradations 다 ──────────────

test('git_witness lives on the audit result; the projection exposes it only as a degradation', () => {
  const raw = audit({ repoRoot: ROOT, allowGit: false });
  const gw = raw.post_panel_span && raw.post_panel_span.coverage.git_witness;
  assert.ok(gw, 'the axis is loaded');
  assert.equal(gw.available, false);
  assert.equal(gw.reason, 'git-disabled',
    'a witness we never asked is not a witness that said no');
  // DD8 의 투영이 부가 필드를 떨구므로 `scanLeadtime` 반환값에는 `git_witness` 가
  // 없다. 그래서 derive 층에서 읽을 수 있는 신호는 그 파생인 `degradations` 이고,
  // 위 두 절이 단언하는 것이 정확히 그 파생이다.
  assert.equal(summarizeForSurface(raw).post_panel_span.coverage.git_witness, undefined,
    'the projection selects fields — it does not carry the witness object');
});

// ── 4. 정적 단언 — 그 분기가 spawn 의 유일한 관문이다 (DD7) ─────────────────

test('readGitTouchedPaths has exactly one call site, behind the allowGit ternary', () => {
  // 다시 말하지만 이것은 spawn 계수가 아니다. 고정하는 것은 구조뿐이다: 두 번째
  // 호출부가 생기면 위 결과 단언이 지키지 못하는 spawn 경로가 열리므로 여기서 붉어진다.
  const src = fs.readFileSync(require.resolve('../leadtime'), 'utf8');
  const hits = src.split('\n')
    .map((line, i) => ({ line: line, n: i + 1 }))
    .filter((x) => x.line.indexOf('readGitTouchedPaths(') >= 0);
  const defs = hits.filter((x) => x.line.indexOf('function readGitTouchedPaths(') >= 0);
  const calls = hits.filter((x) => x.line.indexOf('function readGitTouchedPaths(') < 0);
  assert.equal(defs.length, 1, 'exactly one definition');
  assert.equal(calls.length, 1,
    'exactly one call site — a second one would be a spawn gate this file does not guard; found lines '
    + JSON.stringify(calls.map((x) => x.n)));
  assert.ok(/\?\s*readGitTouchedPaths\(/.test(calls[0].line),
    'the single call sits behind the allowGit ternary, line ' + calls[0].n + ': ' + calls[0].line);
});
