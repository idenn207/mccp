'use strict';

// multi-session-work-loop M7 Task 1 — finding 레지스트리 기판.
//
// Assertion roster: C1-REGISTRY-APPEND · C1-REGISTRY-ALLOWLIST ·
// C1-REGISTRY-TRACKED · C1-ID-SECONDARY-KEY · C1-REGISTRY-PATH-NORMALIZED ·
// C1-DEGRADED-MARKER · C1-BATCH-ATOMIC · C1-MERGE-UNION

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const reg = require('../../state/findings-registry');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-findings-'));
  try {
    return fn(dir);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* best effort */ }
  }
}

function opened(overrides) {
  return Object.assign({
    kind: 'finding_opened',
    gate_id: 'mccp-plan-codex',
    perspective: 'security',
    severity: 'HIGH',
    claim: 'sanitizer functions are not exported from module.exports',
    round: 1,
  }, overrides || {});
}

// ── C1-REGISTRY-APPEND ───────────────────────────────────────────────────────
test('C1-REGISTRY-APPEND: re-observing the same finding is idempotent at the fold', () => {
  withTempDir((dir) => {
    const opts = { dir: dir, repoRoot: REPO_ROOT };
    const a = reg.appendFindings('wu-alpha', [opened()], opts);
    const b = reg.appendFindings('wu-alpha', [opened()], opts);
    assert.strictEqual(a.ok, true);
    assert.strictEqual(b.ok, true);

    const shard = reg.readShard('wu-alpha', opts);
    // 두 줄이 디스크에 남지만(append-only — 관측을 지우지 않는다)
    assert.strictEqual(shard.events.length, 2, 'both raw events persist');
    // 계상은 finding_id 로 dedupe 되어 1건이다.
    assert.strictEqual(shard.findings.length, 1, 'folded to a single finding');
    assert.strictEqual(shard.counts.total, 1);
    assert.strictEqual(shard.counts.open, 1);
    assert.strictEqual(shard.degraded, false, 'idempotent re-observation is not a degradation');
  });
});

test('C1-REGISTRY-APPEND: closure folds last-write-wins and only fixed/invalidated resolve', () => {
  withTempDir((dir) => {
    const opts = { dir: dir, repoRoot: REPO_ROOT };
    const ev = opened();
    reg.appendFindings('wu-alpha', [ev], opts);
    const id = reg.deriveFindingId({
      work_unit: 'wu-alpha',
      gate_id: ev.gate_id,
      perspective: ev.perspective,
      severity: ev.severity,
      claim: ev.claim,
    });
    reg.appendFindings('wu-alpha', [
      { kind: 'finding_closed', finding_id: id, closure_type: 'deferred' },
    ], opts);
    let shard = reg.readShard('wu-alpha', opts);
    assert.strictEqual(shard.counts.deferred, 1);
    assert.strictEqual(shard.counts.resolved, 0, 'deferred is not a resolution (UI5)');

    reg.appendFindings('wu-alpha', [
      { kind: 'finding_closed', finding_id: id, closure_type: 'fixed' },
    ], opts);
    shard = reg.readShard('wu-alpha', opts);
    assert.strictEqual(shard.counts.deferred, 0, 'last write wins');
    assert.strictEqual(shard.counts.fixed, 1);
    assert.strictEqual(shard.counts.resolved, 1);
  });
});

// ── C1-REGISTRY-ALLOWLIST ────────────────────────────────────────────────────
test('C1-REGISTRY-ALLOWLIST: fields outside the allowlist never reach disk', () => {
  withTempDir((dir) => {
    const opts = { dir: dir, repoRoot: REPO_ROOT };
    reg.appendFindings('wu-allow', [opened({
      claim_text: 'the full reviewer prose that must not be persisted',
      evidence: 'plugins/mccp/scripts/lib/intent-context.js:892',
      secret_token: 'ghp_deadbeef',
    })], opts);

    const raw = fs.readFileSync(path.join(dir, 'wu-allow.jsonl'), 'utf8');
    assert.ok(raw.indexOf('secret_token') === -1, 'unknown key dropped');
    assert.ok(raw.indexOf('ghp_deadbeef') === -1, 'unknown value dropped');
    assert.ok(raw.indexOf('claim_text') === -1, 'reviewer prose is not an allowlist field');
    assert.ok(raw.indexOf('the full reviewer prose') === -1);

    const line = JSON.parse(raw.trim().split('\n')[0]);
    Object.keys(line).forEach((k) => {
      assert.ok(reg.ALLOWED_FIELDS.has(k), 'persisted key ' + k + ' is on the allowlist');
    });
  });
});

test('C1-REGISTRY-ALLOWLIST: number/boolean fields keep their type (round: 0 stays falsy)', () => {
  withTempDir((dir) => {
    const opts = { dir: dir, repoRoot: REPO_ROOT };
    reg.appendFindings('wu-types', [opened({ round: 0 })], opts);
    const line = JSON.parse(fs.readFileSync(path.join(dir, 'wu-types.jsonl'), 'utf8').trim());
    assert.strictEqual(line.round, 0, 'not coerced to the truthy string "0"');
    assert.strictEqual(typeof line.seq, 'number');
    assert.strictEqual(typeof line.batch_expected, 'number');
  });
});

// ── C1-REGISTRY-TRACKED ──────────────────────────────────────────────────────
//
// 레지스트리가 worktree 정리(§3.8)와 함께 사라지면 M7의 표제 결과가 그 자리에서
// 반증된다. 두 축으로 묻는다 — canonical ignore 목록에 없는가, 그리고 git 이
// 실제로 무시하지 않는가.
test('C1-REGISTRY-TRACKED: the registry path matches no canonical ignore entry', () => {
  const gp = require('../gitignore-provision');
  const entries = gp.MCCP_IGNORE_ENTRIES.concat(gp.REPO_ONLY.map((r) => r.entry));
  entries.forEach((e) => {
    assert.ok(
      e.indexOf('.claude/state/findings') === -1,
      'canonical ignore entry ' + JSON.stringify(e) + ' would hide the findings registry',
    );
  });
  // `.claude/state/*.lock` 은 디렉토리 하위 .jsonl 을 잡지 않는다. git 에게 직접 묻는다.
  let ignored = false;
  try {
    execFileSync('git', ['check-ignore', '--', '.claude/state/findings/multi-session-work-loop.jsonl'],
      { cwd: REPO_ROOT, stdio: 'pipe' });
    ignored = true;
  } catch (_e) {
    ignored = false;   // exit 1 = not ignored
  }
  assert.strictEqual(ignored, false, 'git must not ignore the findings registry');
});

// ── C1-ID-SECONDARY-KEY ──────────────────────────────────────────────────────
test('C1-ID-SECONDARY-KEY: matchKey applies only with a single candidate', () => {
  const a = { finding_id: 'aaaa', perspective: 'security', cited_path: 'plugins/mccp/a.js' };
  const b = { finding_id: 'bbbb', perspective: 'security', cited_path: 'plugins/mccp/a.js' };
  const c = { finding_id: 'cccc', perspective: 'test', cited_path: 'plugins/mccp/b.js' };

  assert.strictEqual(reg.matchKeyOf(a), reg.matchKeyOf(b), 'same perspective+path share a key');
  assert.notStrictEqual(reg.matchKeyOf(a), reg.matchKeyOf(c));

  // 단일 후보 — 적용
  assert.strictEqual(reg.findByMatchKey([a, c], reg.matchKeyOf(a)), a);
  // 다중 후보 — 미적용 (분모를 줄이는 방향이므로 보수적으로 포기한다)
  assert.strictEqual(reg.findByMatchKey([a, b, c], reg.matchKeyOf(a)), null);
});

test('C1-ID-SECONDARY-KEY: absent path and the outside-repo placeholder are excluded', () => {
  assert.strictEqual(reg.matchKeyOf({ perspective: 'security', cited_path: null }), null);
  assert.strictEqual(reg.matchKeyOf({ perspective: 'security', cited_path: '' }), null);
  assert.strictEqual(
    reg.matchKeyOf({ perspective: 'security', cited_path: reg.OUTSIDE_REPO }),
    null,
    'the placeholder folds many unrelated paths into one value — never a match key',
  );
  assert.strictEqual(reg.matchKeyOf({ perspective: null, cited_path: 'a.js' }), null);
});

test('C1-ID-SECONDARY-KEY: non-recurrence closure tries finding_id then matchKey', () => {
  const prior = [
    { finding_id: 'id-same', perspective: 'test', cited_path: 'x.js', state: 'open' },
    { finding_id: 'id-reworded', perspective: 'security', cited_path: 'y.js', state: 'open' },
    { finding_id: 'id-gone', perspective: 'architect', cited_path: 'z.js', state: 'open' },
    { finding_id: 'id-closed', perspective: 'test', cited_path: 'w.js', state: 'closed' },
  ];
  const current = [
    { finding_id: 'id-same', perspective: 'test', cited_path: 'x.js' },
    { finding_id: 'id-NEW-TEXT', perspective: 'security', cited_path: 'y.js' },
  ];
  const closures = reg.deriveNonRecurrenceClosures({
    priorFindings: prior, currentFindings: current, roundPassed: true,
  });
  const ids = closures.map((f) => f.finding_id);
  assert.deepStrictEqual(ids, ['id-gone'],
    'id-same matched by id, id-reworded matched by matchKey, id-closed already closed');

  assert.deepStrictEqual(
    reg.deriveNonRecurrenceClosures({ priorFindings: prior, currentFindings: [], roundPassed: false }),
    [],
    'a round that did not pass closes nothing',
  );
});

// ── C1-REGISTRY-PATH-NORMALIZED ──────────────────────────────────────────────
test('C1-REGISTRY-PATH-NORMALIZED: absolute cited_path is folded and never lands raw', () => {
  withTempDir((dir) => {
    const opts = { dir: dir, repoRoot: REPO_ROOT };
    const inside = path.join(REPO_ROOT, 'plugins', 'mccp', 'scripts', 'state', 'findings-registry.js');
    const outside = path.resolve(os.tmpdir(), 'some-other-repo', 'secret.js');

    reg.appendFindings('wu-path', [
      opened({ cited_path: inside, claim: 'inside claim' }),
      opened({ cited_path: outside, claim: 'outside claim' }),
    ], opts);

    const raw = fs.readFileSync(path.join(dir, 'wu-path.jsonl'), 'utf8');
    assert.ok(raw.indexOf(inside) === -1, 'the absolute in-repo path is not persisted');
    assert.ok(raw.indexOf(outside) === -1, 'the absolute outside path is not persisted');
    assert.ok(raw.indexOf('plugins/mccp/scripts/state/findings-registry.js') !== -1,
      'folded to repo-relative posix form');
    assert.ok(raw.indexOf(reg.OUTSIDE_REPO) !== -1, 'outside-repo folds to the placeholder');

    // 호출자가 정규화하지 않아도 성립한다 — 초크 포인트는 레지스트리 안이다.
    const lines = raw.trim().split('\n').map((l) => JSON.parse(l));
    assert.strictEqual(lines[0].cited_path, 'plugins/mccp/scripts/state/findings-registry.js');
    assert.strictEqual(lines[1].cited_path, reg.OUTSIDE_REPO);
  });
});

test('C1-REGISTRY-PATH-NORMALIZED: traversal above the root folds to the placeholder', () => {
  assert.strictEqual(reg.normalizeCitedPath('../../etc/passwd', REPO_ROOT), reg.OUTSIDE_REPO);
  assert.strictEqual(reg.normalizeCitedPath('plugins/./mccp/x.js', REPO_ROOT), 'plugins/mccp/x.js');
  assert.strictEqual(reg.normalizeCitedPath(null, REPO_ROOT), null);
  assert.strictEqual(reg.normalizeCitedPath('   ', REPO_ROOT), null);
});

// ── C1-DEGRADED-MARKER ───────────────────────────────────────────────────────
test('C1-DEGRADED-MARKER: an unwritable path leaves a marker and the reader raises degraded', () => {
  withTempDir((dir) => {
    // 실제 쓰기 불가 경로를 만든다 — 파일을 디렉토리 자리에 두어 mkdir 을 실패시킨다.
    const blocked = path.join(dir, 'blocked');
    fs.writeFileSync(blocked, 'not a directory\n', 'utf8');
    const badOpts = { dir: path.join(blocked, 'findings'), repoRoot: REPO_ROOT };

    const r = reg.appendFindings('wu-degraded', [opened()], badOpts);
    assert.strictEqual(r.ok, false, 'the write really failed');
    assert.ok(/mkdir-failed|append-failed/.test(r.reason), 'reason names the failure: ' + r.reason);

    // 2차 마커는 best-effort — 같은 디스크 실패면 마커도 못 쓴다. 그래서 마커
    // writer 자체를 쓸 수 있는 경로에서 따로 검증한다(계약: 사유 + errno 동봉).
    const okDir = path.join(dir, 'ok');
    const wrote = reg.writeDegradedMarker(okDir, 'wu-degraded', {
      reason: 'append-failed', errno: 'ENOENT', path: '/nope/wu-degraded.jsonl',
    });
    assert.strictEqual(wrote, true);
    const marker = reg.readDegradedMarker(okDir, 'wu-degraded');
    assert.ok(Array.isArray(marker) && marker.length === 1);
    assert.strictEqual(marker[0].reason, 'append-failed');
    assert.strictEqual(marker[0].errno, 'ENOENT');

    // reader 는 마커만으로도 degraded 를 올린다.
    fs.writeFileSync(path.join(okDir, 'wu-degraded.jsonl'), '', 'utf8');
    const shard = reg.readShard('wu-degraded', { dir: okDir, repoRoot: REPO_ROOT });
    assert.strictEqual(shard.degraded, true);
    assert.ok(shard.degraded_reasons.join(' ').indexOf('degraded marker') !== -1);
  });
});

test('C1-DEGRADED-MARKER: a seq gap alone raises degraded (marker-independent)', () => {
  withTempDir((dir) => {
    const opts = { dir: dir, repoRoot: REPO_ROOT };
    reg.appendFindings('wu-gap', [opened({ claim: 'one' })], opts);
    reg.appendFindings('wu-gap', [opened({ claim: 'two' })], opts);
    // seq 2 를 지운다 — "append 가 실패해 사라진" 상태의 재현.
    const file = path.join(dir, 'wu-gap.jsonl');
    const kept = fs.readFileSync(file, 'utf8').trim().split('\n')
      .filter((l) => JSON.parse(l).seq !== 2);
    reg.appendFindings('wu-gap', [opened({ claim: 'three' })], opts);
    const tail = fs.readFileSync(file, 'utf8').trim().split('\n')
      .filter((l) => JSON.parse(l).seq === 3);
    fs.writeFileSync(file, kept.concat(tail).join('\n') + '\n', 'utf8');

    const shard = reg.readShard('wu-gap', opts);
    assert.strictEqual(shard.marker, null, 'no marker was written — the data itself is the signal');
    assert.strictEqual(shard.degraded, true);
    assert.deepStrictEqual(shard.seq.gaps, [2]);
  });
});

test('C1-DEGRADED-MARKER: a duplicate seq masking a gap is caught by the count axis', () => {
  withTempDir((dir) => {
    const file = path.join(dir, 'wu-mask.jsonl');
    fs.mkdirSync(dir, { recursive: true });
    // seq 5 가 둘, seq 6 이 없음 — 인접 중복 축과 산술 축이 각각 잡는다.
    const lines = [1, 2, 3, 4, 5, 5, 7].map((s, i) => JSON.stringify({
      kind: 'finding_opened', finding_id: 'f' + i, work_unit: 'wu-mask', seq: s, batch_expected: 1,
    }));
    fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');

    const shard = reg.readShard('wu-mask', { dir: dir, repoRoot: REPO_ROOT });
    assert.deepStrictEqual(shard.seq.duplicates, [5]);
    assert.deepStrictEqual(shard.seq.gaps, [6]);
    assert.strictEqual(shard.seq.count_mismatch, true, 'max=7 but only 6 distinct seqs');
    assert.strictEqual(shard.degraded, true);
    // 탐지 축이 계상 축을 건드리지 않는다 — 7건 전부 계상된다.
    assert.strictEqual(shard.counts.total, 7);
  });
});

// ── C1-BATCH-ATOMIC ──────────────────────────────────────────────────────────
test('C1-BATCH-ATOMIC: N findings land in one write, each carrying batch_expected: N', () => {
  withTempDir((dir) => {
    const opts = { dir: dir, repoRoot: REPO_ROOT };
    const batch = [1, 2, 3, 4].map((i) => opened({ claim: 'finding number ' + i }));
    const r = reg.appendFindings('wu-batch', batch, opts);
    assert.strictEqual(r.written, 4);
    assert.strictEqual(r.seq_start, 1);
    assert.strictEqual(r.seq_end, 4);

    const lines = fs.readFileSync(path.join(dir, 'wu-batch.jsonl'), 'utf8')
      .trim().split('\n').map((l) => JSON.parse(l));
    assert.strictEqual(lines.length, 4);
    lines.forEach((l, i) => {
      assert.strictEqual(l.batch_expected, 4, 'every line declares the batch size');
      assert.strictEqual(l.seq, i + 1);
    });
    const shard = reg.readShard('wu-batch', opts);
    assert.deepStrictEqual(shard.batch_shortfalls, []);
    assert.strictEqual(shard.degraded, false);
  });
});

test('C1-BATCH-ATOMIC: a truncated batch surfaces as a shortfall, not as silence', () => {
  withTempDir((dir) => {
    const opts = { dir: dir, repoRoot: REPO_ROOT };
    reg.appendFindings('wu-trunc', [1, 2, 3].map((i) => opened({ claim: 'claim ' + i })), opts);
    const file = path.join(dir, 'wu-trunc.jsonl');
    const raw = fs.readFileSync(file, 'utf8');
    // 마지막 줄을 중간에서 잘라낸다 — 부분 착지의 재현.
    const cut = raw.slice(0, raw.lastIndexOf('\n', raw.length - 2) + 1 + 20);
    fs.writeFileSync(file, cut, 'utf8');

    const shard = reg.readShard('wu-trunc', opts);
    assert.strictEqual(shard.malformed, 1, 'the severed line is isolated, not parsed');
    assert.strictEqual(shard.batch_shortfalls.length, 1);
    assert.strictEqual(shard.batch_shortfalls[0].expected, 3);
    assert.strictEqual(shard.batch_shortfalls[0].found, 2);
    assert.strictEqual(shard.degraded, true);
  });
});

test('C1-BATCH-ATOMIC: no public API appends events one at a time', () => {
  // DD8 이 없앤 "말미 k개 유실"이 API 표면으로 되돌아오는 것을 막는 유일한 지점이다.
  // 단건 append 는 N=1 인 batch 이지 별도 경로가 아니다.
  const exported = Object.keys(reg);
  assert.ok(exported.indexOf('appendFindings') !== -1, 'the batch API exists');
  ['appendFinding', 'appendEvent', 'append', 'writeFinding', 'appendLine'].forEach((name) => {
    assert.strictEqual(exported.indexOf(name), -1,
      'no sequential-append surface may exist (' + name + ')');
  });
  // 계약을 소스에서도 고정한다 — 시그니처가 배열을 받는다.
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'plugins', 'mccp', 'scripts', 'state', 'findings-registry.js'), 'utf8');
  assert.ok(/function appendFindings\(workUnit, events, opts\)/.test(src));
  // 주석 줄은 제외한다 — 채택하지 **않은** 것을 설명하는 행위가 위반이 되면
  // 설계 근거를 쓸 수 없다(b2-coverage-gate.js 의 isCommentLine 과 같은 이유).
  const code = src.split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  assert.ok(code.indexOf('evictLRU') === -1,
    'a git-tracked audit corpus is never evicted (DD4)');
  assert.ok(code.indexOf('unlinkSync') === -1,
    'the registry never deletes a shard');
});

test('C1-BATCH-ATOMIC: an over-cap shard warns and keeps every line', () => {
  withTempDir((dir) => {
    const opts = { dir: dir, repoRoot: REPO_ROOT };
    const file = path.join(dir, 'wu-cap.jsonl');
    fs.mkdirSync(dir, { recursive: true });
    const filler = JSON.stringify({
      kind: 'finding_opened', finding_id: 'pre', work_unit: 'wu-cap', seq: 1, batch_expected: 1,
      claim_digest: 'x'.repeat(200),
    }) + '\n';
    fs.writeFileSync(file, filler.repeat(Math.ceil(reg.PER_FILE_MAX_BYTES / filler.length) + 1), 'utf8');
    const sizeBefore = fs.statSync(file).size;
    assert.ok(sizeBefore > reg.PER_FILE_MAX_BYTES);

    const r = reg.appendFindings('wu-cap', [opened()], opts);
    assert.strictEqual(r.ok, true, 'the cap warns, it does not block');
    assert.ok(fs.statSync(file).size > sizeBefore, 'nothing was evicted');
  });
});

// ── C1-MERGE-UNION ───────────────────────────────────────────────────────────
//
// 파일 내용 grep 도 `.gitattributes` 문자열 단언도 아니다 — 선언이 있어도 glob 이
// 어긋나면 미적용이므로 git 에게 직접 묻는다.
test('C1-MERGE-UNION: git resolves merge=union for the registry glob', () => {
  const ask = (rel) => execFileSync('git', ['check-attr', 'merge', '--', rel],
    { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

  // 실제 work_unit 경로 하나
  assert.match(ask('.claude/state/findings/multi-session-work-loop.jsonl'), /: merge: union$/);
  // 아직 존재하지 않는 임의 이름 하나 — glob 이 특정 파일이 아니라 패턴에 걸리는가
  assert.match(ask('.claude/state/findings/zzz-future-work-unit.jsonl'), /: merge: union$/);
  // 인접 경로에는 걸리지 않는다(과잉 적용 방지)
  assert.doesNotMatch(ask('.claude/state/STATE.md'), /: merge: union$/);
});

// ── 종결 vocabulary (DD2 / DD7) ──────────────────────────────────────────────
test('CLOSURE_FROM_ADJUDICATION is total over ADJUDICATION_VERDICTS and ACCEPT_NOW maps to null', () => {
  const ic = require('../intent-context');
  ic.ADJUDICATION_VERDICTS.forEach((v) => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(reg.CLOSURE_FROM_ADJUDICATION, v),
      'adjudication verdict ' + v + ' has no closure mapping',
    );
  });
  assert.strictEqual(reg.CLOSURE_FROM_ADJUDICATION.ACCEPT_NOW, null,
    'accepting an intent is not resolving a finding (DD2)');
  assert.strictEqual(reg.CLOSURE_FROM_ADJUDICATION.DEFER_TO_BACKLOG, 'deferred');
  assert.strictEqual(reg.CLOSURE_FROM_ADJUDICATION.REJECT_YAGNI, 'rejected');
  assert.strictEqual(reg.CLOSURE_FROM_ADJUDICATION.REJECTED_BY_DESIGN, 'invalidated');
  assert.deepStrictEqual(reg.RESOLVING_CLOSURE_TYPES, ['fixed', 'invalidated']);
});

// ── local review 흡수 (H2 · H4 · L3 · M1) ────────────────────────────────────
//
// 아래 단언들은 manifest 하한(32)을 넓히지 않는다. 하한은 상한이 아니고, plan 의
// `## Assertion Roster` 는 `plan_hash` 로 봉인돼 있어 편집하면 §3.11 가드 2 가
// 그 사이클의 PR 을 막는다. 그래서 기존 id 아래에 회귀 단언만 더한다.

test('C1-ID-SECONDARY-KEY: 대조 불가한 비재발은 종결하지 않는다 (오차 방향 정정)', () => {
  // 고쳐지지 않은 결함 1건이 라운드 사이 문면만 바뀐 채 수렴한 형태. 이전 구현은
  // 2차 키를 적용할 수 없다는 이유로 prior 를 `fixed` 로 닫아 참값 0/1 을 1/2 로
  // 보고했다 — 설계 §2/UI5 가 조작 경로로 지목한 **부풀리는** 방향이다.
  const priorNoPath = [{ finding_id: 'p', state: 'open', perspective: 'security', cited_path: null }];
  const currentSameAxis = [{ finding_id: 'c', perspective: 'security', cited_path: null }];
  assert.deepStrictEqual(
    reg.deriveNonRecurrenceClosures({
      priorFindings: priorNoPath, currentFindings: currentSameAxis, roundPassed: true,
    }),
    [],
    'cited_path 가 없어 대조가 성립하지 않으면 분자를 사지 않는다',
  );

  // `<outside-repo>` 는 여러 경로가 접힌 값이라 2차 키에서 제외되고, 그 제외가
  // 종결 근거가 되어서도 안 된다.
  assert.deepStrictEqual(
    reg.deriveNonRecurrenceClosures({
      priorFindings: [{ finding_id: 'p', state: 'open', perspective: 'security', cited_path: reg.OUTSIDE_REPO }],
      currentFindings: [{ finding_id: 'c', perspective: 'security', cited_path: reg.OUTSIDE_REPO }],
      roundPassed: true,
    }),
    [],
  );

  // 같은 키에 후보가 여럿이면 "어느 것인지 모른다"이지 "사라졌다"가 아니다.
  assert.deepStrictEqual(
    reg.deriveNonRecurrenceClosures({
      priorFindings: [{ finding_id: 'p', state: 'open', perspective: 'x', cited_path: 'a.js' }],
      currentFindings: [
        { finding_id: 'q', perspective: 'x', cited_path: 'a.js' },
        { finding_id: 'r', perspective: 'x', cited_path: 'a.js' },
      ],
      roundPassed: true,
    }),
    [],
  );

  // **통상 경로는 살아 있어야 한다** — 정정이 지표를 죽이면 그것도 실패다.
  assert.strictEqual(
    reg.deriveNonRecurrenceClosures({
      priorFindings: priorNoPath, currentFindings: [], roundPassed: true,
    }).length, 1, '수렴 라운드가 비었으면 명백한 소멸이다');
  assert.strictEqual(
    reg.deriveNonRecurrenceClosures({
      priorFindings: priorNoPath,
      currentFindings: [{ finding_id: 'c', perspective: 'test', cited_path: null }],
      roundPassed: true,
    }).length, 1, '그 축의 finding 이 하나도 없으면 소멸이다');
});

test('C1-BATCH-ATOMIC: 잘못된 kind 는 seq 를 소진하기 전에 거절된다', () => {
  withTempDir((dir) => {
    const opts = { dir: dir, repoRoot: REPO_ROOT };
    const first = reg.appendFindings('wu-kind', [opened()], opts);
    assert.strictEqual(first.seq_end, 1);

    const bad = reg.appendFindings('wu-kind', [
      opened({ claim: 'b' }),
      opened({ kind: 'typo_kind', claim: 'c' }),
      opened({ claim: 'd' }),
    ], opts);
    assert.strictEqual(bad.ok, false);
    assert.match(bad.reason, /invalid_kind/);

    // 번호가 소진됐다면 다음 write 는 5 에서 시작하고 샤드는 영구히 degraded 가 된다.
    // 레지스트리는 evict 도 재작성도 하지 않으므로(DD4) 그 상태는 되돌릴 수 없고,
    // `--acceptance` 의 non-degraded 축을 영원히 통과하지 못한다.
    const next = reg.appendFindings('wu-kind', [opened({ claim: 'e' })], opts);
    assert.strictEqual(next.seq_start, 2, '호출자 버그가 seq 를 소진하면 안 된다');

    const shard = reg.readShard('wu-kind', opts);
    assert.strictEqual(shard.degraded, false, 'kind 거절은 유실이 아니다');
    assert.deepStrictEqual(shard.seq.gaps, []);
  });
});

test('C1-REGISTRY-PATH-NORMALIZED: repoRoot 부재 시 트리 밖 상대경로도 placeholder 다', () => {
  assert.strictEqual(reg.normalizeCitedPath('../../secret.js', null), reg.OUTSIDE_REPO);
  assert.strictEqual(reg.normalizeCitedPath('..', null), reg.OUTSIDE_REPO);
  assert.strictEqual(reg.normalizeCitedPath('/etc/passwd', null), reg.OUTSIDE_REPO);
  // 트리 안 상대경로는 그대로 통과한다 — 정규화가 값을 잃으면 2차 키가 죽는다.
  assert.strictEqual(reg.normalizeCitedPath('lib/a.js', null), 'lib/a.js');
});

test('C1-REGISTRY-ALLOWLIST: 레지스트리 소스에 리터럴 NUL 바이트가 없다', () => {
  // `finding_id` 파생과 `matchKey` 는 U+0000 을 구분자로 쓰는데, 그것을 **소스에 raw
  // 바이트로** 박으면 `file(1)`·grep·ripgrep 이 이 모듈을 binary 로 보고 건너뛴다.
  // 이 저장소는 grep 기반 감사에 의존하고 coverage gate 자체가 텍스트 lint 이므로,
  // 핵심 모듈이 검색에서 사라지는 것은 무해하지 않다. 이스케이프(`\0`)는 런타임
  // 문자열이 동일하므로 해시도 불변이다.
  const buf = fs.readFileSync(path.join(REPO_ROOT, 'plugins', 'mccp', 'scripts',
    'state', 'findings-registry.js'));
  assert.strictEqual(buf.includes(0), false, 'source must stay plain text for grep-based audit');
  // 그럼에도 구분자는 여전히 NUL 이어야 한다(값이 바뀌면 committed 샤드의 id 가 깨진다).
  const key = reg.matchKeyOf({ perspective: 'security', cited_path: 'a.js' });
  assert.ok(key.indexOf(String.fromCharCode(0)) !== -1, 'separator is still U+0000');
});
