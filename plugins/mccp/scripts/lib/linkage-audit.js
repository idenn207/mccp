'use strict';

// review-record-linkage M1 — 결정층(ship receipt) ↔ 내용층(패널 레코드) 링크 baseline.
//
// read-only · LLM-free · standalone. `evidence-audit.js` 형태 미러(두 층을 대조하는
// 감사 도구는 `cli.js` 하위가 아니라 독립 실행이다). 게이트 경로를 한 줄도 읽지
// 않고 **쓰기 0건**이다.
//
// 임계값을 갖지 않는다. 세는 것은 이 도구가 하고, 판정은 문서
// (`docs/review-record-linkage/frozen-baseline.md`)가 한다.
//
// ── 정의는 이 파일이 소유하지 않는다 ─────────────────────────────────────────
//
//   D1/D2/D3 + 5개 대조   → `plan-review/linkage-defs.js` (순수 · dep-free)
//   패널 소속 · Measurement → `plan-review/corpus.js#parseRecord` (기존 소유자)
//
// 후자를 **재구현하지 않는 것**이 핵심이다. `corpus.js`가 이미 서명 정규식
// (`:211`)과 펜스 파서(`:242-273`)를 갖고 `kind` 4분류를 낸다. 여기서 같은 규칙을
// 다시 쓰면 두 도구가 같은 코퍼스에 다른 소속 건수를 보고할 수 있고, 그때 어느
// 쪽이 맞는지 말해 줄 것이 없다.
//
// ── 동결은 트리다 — 파티션이 아니다 (santa-loop R0 흡수) ────────────────────
//
// `corpus.js`는 "지금"을 세지만 이 도구는 "동결된 과거"를 센다. 초판은 그것을
// **살아 있는 작업 트리를 자기신고 타임스탬프로 pre/post 파티션**해서 구현했다.
// 그 설계는 자기가 내건 주장을 만족하지 못한다 — 두 리뷰어가 독립적으로 같은
// 결론에 도달했고 셋 다 실측으로 확인됐다:
//
//   1. ref 는 *날짜 하나*만 주고, 무엇을 셀지는 작업 트리가 정한다. 경계 커밋이
//      이 브랜치의 조상이 아니면(실제로 아니었다) 트리가 다르다 — `647dfec` 의
//      트리에는 ship 75건이 있는데 도구는 작업 트리의 71건을 세고, 그 차이는
//      어느 카운터에도 나타나지 않았다.
//   2. `measurement.recorded_at` 은 불변이 아니다. 리뷰 레코드는 PRD slug 당
//      1파일이라 같은 결정의 재실행이 덮어쓰고, 그 순간 레코드가 pre 에서 post 로
//      이동해 "불변"이라던 분모가 내려간다.
//   3. origin/main 을 병합하면(머지는 선택이 아니다) 경계보다 앞선 파일이 새로
//      들어와 동결 바이트가 움직인다.
//
// 그래서 멤버십을 **고정 SHA 의 트리**가 정한다. 파일 목록은 `git ls-tree -r`,
// 내용은 `git show <ref>:<path>` 로 읽는다. 트리는 정의상 불변이므로 위 세 벡터가
// 한꺼번에 닫히고, "ref 하나가 이 값들을 고정한다"가 산문이 아니라 사실이 된다.
// 작업 트리는 이제 `post_baseline`(진단 전용) 계산에만 쓰인다.
//
// `--frozen-only` 가 방출하는 것:
//
//   baseline                 ref · 해소된 시각 · tree_files · baseline.state
//   pre_baseline             경계 트리에 실재하는 코퍼스 전체
//   unreadable_at_baseline   트리에 있는데 읽거나 파싱하지 못한 것
//
// 마지막 항목이 "부재 ≠ 0" 규율의 자리다. 이전의 `undated_at_baseline` 은 날짜가
// 멤버십을 정할 때만 의미가 있었고, 트리에 있으나 작업 트리에 없는 파일은 애초에
// 세어지지도 않아 `files: []` 로 완전 커버리지를 주장했다. 이제 트리에서 직접
// 읽으므로 그 상태가 존재할 수 없고, 남는 결손은 오직 *읽기/파싱 실패*뿐이다.
//
// ── state가 둘인 이유 ────────────────────────────────────────────────────────
//
// `baseline.state`는 동결 계산만 반영해 불변이고 동결 블록에 실린다. 전역 `state`
// 는 코퍼스 전체를 보고 `--json`에만 있다. 하나로 합치면 경계 밖 사건이 동결
// 바이트를 움직인다.
//
// `unresolved`가 자기 exit code를 갖는 것은 미러 선례(`corpus.js:670`)를 **의도적
// 으로 벗어난 지점**이다. 거기서는 `k_split.state='unresolved'`여도 종료가 exit 0
// 이라, 동결의 유일한 기계 장치가 무너진 상태에서 도구가 성공을 보고한다.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const corpus = require('./plan-review/corpus');
const defs = require('./plan-review/linkage-defs');

// ── 상수 ─────────────────────────────────────────────────────────────────────

// DD8 — 기본 경계는 이름이 붙은 불변 커밋이다.
//
// **전체 SHA 다** (santa-loop R0 흡수). 7자 축약은 객체가 늘면 ambiguous 해질 수
// 있고 동명 branch/tag 에 가려질 수 있는데, 그 실패는 `unresolved`(exit 3)로
// 나타나 커밋된 동결 test 를 영구 red 로 만든다. 축약을 쓸 이유가 없다.
//
// 기계 확인한 조건은 하나로 줄었다: **origin/main 에서 도달 가능**해야 한다
// (branch-local SHA 를 쓰면 머지 후 커밋된 동결 test 가 영구히 unresolved 가 된다).
// 초판이 함께 걸었던 "ship receipt 71건 전부가 이 시각보다 앞선다" 는 삭제했다 —
// 실제로 **거짓**이었고(이 ref 의 트리는 75건이다), 그 문장이 참이어야 할 이유도
// 이제 없다. 멤버십은 날짜가 아니라 트리가 정하므로, 트리에 있다는 것이 곧 경계
// 이전이라는 뜻이다.
const DEFAULT_BASELINE_REF = '647dfecba75eecd9287ee538ca5f7056c7ba71da';

// git tree 경로는 항상 POSIX 다. 작업 트리 스캔(진단용)에만 플랫폼 구분자가
// 필요하므로, 정본은 POSIX 로 두고 필요한 쪽에서 변환한다 — 반대로 하면 Windows
// 에서 `tree.has()` 가 영원히 거짓이 되어 코퍼스가 통째로 비어 보인다.
const SHIP_RECEIPT_SUBDIR = '.claude/receipts/mccp-pr-codex';

// 비재귀 2경로. corpus.js REVIEW_SUBDIRS 와 동일 — 여기서 좁히면 두 도구의 소속
// 판정이 갈린다(archive/ 하위에 실제 패널 레코드가 산다).
const REVIEW_SUBDIRS = Object.freeze([
  '.claude/reviews',
  '.claude/reviews/archive',
]);

const STATE_EXIT_CODES = Object.freeze({
  ok: 0,
  degraded: 1,
  blind: 2,
  unresolved: 3,
});

function exitCodeForState(state) {
  const code = STATE_EXIT_CODES[state];
  return typeof code === 'number' ? code : 1;   // 미지 state → 비영점 (fail-closed)
}

// 파일명 관례. **정의가 아니라 라벨이다** — 실측 일치율 24/71 이고 그 불일치의
// 지배 원인은 chore ship 이 아니라 시간 경계다(41/71 이 최초 패널 레코드보다 앞선다).
// 세되 D2 판정에 쓰지 않는다.
const REVIEW_NAME_PREFIX = 'plan-review-';

function warn(line) {
  process.stderr.write('[mccp:linkage-audit] ' + line + '\n');
}

function toPosix(p) { return String(p).replace(/\\/g, '/'); }

// ── 수집 ─────────────────────────────────────────────────────────────────────

// 비재귀 판정은 `stat.isFile()` 이 아니라 **경로 형태**로 낸다. `ls-tree -r` 의
// 목록에는 디렉토리 엔트리가 아예 없으므로 세그먼트 수가 유일한 판별자다.
function underDirNonRecursive(relPath, dirPosix, ext) {
  if (relPath.indexOf(dirPosix + '/') !== 0) return null;
  const rest = relPath.slice(dirPosix.length + 1);
  if (rest.indexOf('/') !== -1) return null;           // 하위 디렉토리 — 이 디렉토리 소속이 아니다
  if (!rest.endsWith(ext)) return null;
  return rest;
}

// 경계 트리에서 파일 목록을 뽑는다. 트리를 못 읽으면 빈 목록이 아니라 `null` 이다 —
// 그 구분이 "코퍼스가 비었다" 와 "코퍼스를 못 봤다" 를 가른다.
function corpusPathsInTree(tree, dirPosix, ext) {
  if (!(tree instanceof Set)) return null;
  const out = [];
  tree.forEach(function (rel) {
    if (underDirNonRecursive(rel, dirPosix, ext) !== null) out.push(rel);
  });
  return out.sort();
}

function readShipReceipts(root, ref, tree) {
  const out = { receipts: [], read_error: false, parse_failures: 0, parse_errors: [], unreadable: [] };
  const paths = corpusPathsInTree(tree, SHIP_RECEIPT_SUBDIR, '.json');
  if (paths === null) { out.read_error = true; return out; }
  paths.forEach(function (rel) {
    const name = rel.slice(SHIP_RECEIPT_SUBDIR.length + 1);
    const r = git(root, ['show', ref + ':' + rel]);
    if (!r.ok) { out.read_error = true; out.unreadable.push(rel); return; }
    try {
      out.receipts.push({ name: rel, slug: name.replace(/\.json$/, ''), body: JSON.parse(r.out) });
    } catch (err) {
      out.parse_failures += 1;
      out.parse_errors.push({ record: rel, error: err.message });
      out.unreadable.push(rel);
    }
  });
  return out;
}

function readReviewRecords(root, ref, tree) {
  const out = { records: [], read_error: false, sources: [], unreadable: [] };
  if (!(tree instanceof Set)) { out.read_error = true; return out; }
  REVIEW_SUBDIRS.forEach(function (sub) {
    const paths = corpusPathsInTree(tree, sub, '.md') || [];
    const src = { dir: sub, present: paths.length > 0, files: 0 };
    paths.forEach(function (rel) {
      const r = git(root, ['show', ref + ':' + rel]);
      if (!r.ok) { out.read_error = true; out.unreadable.push(rel); return; }
      out.records.push({ name: rel, basename: rel.slice(sub.length + 1), text: r.out });
      src.files += 1;
    });
    out.sources.push(src);
  });
  return out;
}

// 진단 전용 (동결 대상 아님) — 작업 트리에 있으나 경계 트리에 없는 코퍼스 파일.
// 동결 계산에는 한 줄도 기여하지 않는다.
function liveCorpusNotInTree(root, tree) {
  const out = { ships: 0, records: 0 };
  if (!(tree instanceof Set)) return out;
  const scan = function (subPosix, ext, key) {
    const dir = path.join(root, subPosix.split('/').join(path.sep));
    let names;
    try { names = fs.readdirSync(dir); } catch (_err) { return; }
    names.forEach(function (name) {
      if (!name.endsWith(ext)) return;
      let stat;
      try { stat = fs.statSync(path.join(dir, name)); } catch (_err) { return; }
      if (!stat.isFile()) return;
      if (!tree.has(subPosix + '/' + name)) out[key] += 1;
    });
  };
  scan(SHIP_RECEIPT_SUBDIR, '.json', 'ships');
  REVIEW_SUBDIRS.forEach(function (d) { scan(d, '.md', 'records'); });
  return out;
}

// ── git ──────────────────────────────────────────────────────────────────────
//
// 전부 execFileSync + argv 배열 (shell 미경유). 실패 메시지를 그대로 싣지 않는다 —
// `err.message` 는 호스트 절대경로를 담을 수 있고, 이 출력은 git-tracked 문서에
// 동결된다(`corpus.js:723-725` 가 그 값을 그대로 실어 흘리는 것을 미러하지 않는다).

function git(root, args) {
  try {
    return { ok: true, out: execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) };
  } catch (_err) {
    return { ok: false, out: '' };
  }
}

function resolveBaseline(root, ref) {
  const r = git(root, ['show', '-s', '--format=%cI', ref]);
  if (!r.ok) return { ms: null, iso: null, reason: 'ref did not resolve' };
  const iso = r.out.trim();
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { ms: null, iso: null, reason: 'commit date unparsable' };
  return { ms: ms, iso: iso, reason: null };
}

// 경계 트리의 파일 집합. **코퍼스 멤버십 그 자체다** — 범위를 좁히는 보조 장치가
// 아니라 무엇이 동결 대상인지를 정하는 유일한 원천이다.
function baselineTree(root, ref) {
  const r = git(root, ['ls-tree', '-r', '--name-only', ref]);
  if (!r.ok) return null;
  const set = new Set();
  r.out.split(/\r?\n/).forEach(function (l) { if (l.trim()) set.add(toPosix(l.trim())); });
  return set;
}

// ── 날짜 원천은 삭제됐다 (santa-loop R0) ────────────────────────────────────
//
// 초판은 `receiptIso` / `recordIso` / `addCommitIso` / `bucketOf` 로 날짜를 뽑아
// 멤버십을 정했다. 그 넷은 전부 사라졌다 — 트리가 멤버십을 정하므로 날짜가 답할
// 질문이 남아 있지 않고, 남겨 두면 다음 사람이 "이 도구는 날짜로도 판단한다" 고
// 읽는다. DD5 표(날짜 원천)도 같은 이유로 문서에서 은퇴했다.
//
// 특히 `recordIso` 가 `measurement.recorded_at` 을 신뢰한 것이 결함의 핵심이었다:
// 리뷰 레코드는 PRD slug 당 1파일이라 재실행이 그 값을 덮어쓴다.

// ── 집계 ─────────────────────────────────────────────────────────────────────

function aggregate(input) {
  const o = input || {};
  const root = o.repoRoot || '';
  const ref = o.baselineRef || DEFAULT_BASELINE_REF;
  const ships = o.ships || { receipts: [], read_error: false, parse_failures: 0, parse_errors: [] };
  const reviews = o.reviews || { records: [], read_error: false, sources: [] };
  const baseline = o.baseline || { ms: null, iso: null, reason: 'not resolved' };
  const tree = o.baselineTree instanceof Set ? o.baselineTree : null;

  const result = {
    schema_version: 2,
    baseline: {
      ref: ref,
      resolved_at: baseline.iso,
      state: 'ok',
    },
    corpus_boundary: { record: 0, pre_measurement: 0, out_of_corpus: 0, parse_failure: 0 },
    parse_failures: ships.parse_failures || 0,
    parse_errors: (ships.parse_errors || []).slice(),
    read_error: Boolean(ships.read_error || reviews.read_error),
    sources: reviews.sources || [],
  };

  // 경계가 해소되지 않으면 파티션 자체가 성립하지 않는다. 조용히 다른 지점에서
  // 가르지 않고 여기서 멈춘다 — 비율을 하나도 보고하지 않는다.
  if (!Number.isFinite(baseline.ms)) {
    result.baseline.state = 'unresolved';
    result.baseline.reason = baseline.reason || 'ref did not resolve';
    result.state = 'unresolved';
    return result;
  }

  // 멤버십은 경계 트리가 정한다 — 여기 도달한 것은 **정의상 전부** pre_baseline
  // 이다. 자기신고 타임스탬프로 가르던 초판의 파티션은 삭제했다(헤더 참조):
  // 그것이 세 드리프트 벡터의 공통 뿌리였다.
  const pre = { ships: [], records: [] };

  // ── ship 층 ──
  const eligibility = { eligible: 0, not_eligible: 0, undecidable: 0 };
  const eligibilityReasons = {};
  let nameConventionMatch = 0;
  const reviewSlugs = new Set();

  // ── 리뷰 층 ──
  reviews.records.forEach(function (rec) {
    let parsed;
    try { parsed = corpus.parseRecord(rec.text); }
    catch (err) { parsed = { ok: false, kind: 'parse_failure', measurement: null, error: err.message }; }

    const kind = parsed.kind;
    if (Object.prototype.hasOwnProperty.call(result.corpus_boundary, kind)) result.corpus_boundary[kind] += 1;
    if (kind === 'parse_failure') {
      result.parse_failures += 1;
      result.parse_errors.push({ record: rec.name, error: parsed.error || 'unknown' });
      return;
    }
    if (kind === 'out_of_corpus') return;

    // slug 집합도 경계 트리 안에서만 만들어진다. 초판은 이 집합을 파티션 **전에**
    // 전 레코드로 채웠고, 그래서 경계 이후 레코드 하나가 pre_baseline ship 의
    // slug 와 맞기만 하면 동결된 `filename_convention.match` 가 움직였다.
    if (rec.basename.indexOf(REVIEW_NAME_PREFIX) === 0) {
      reviewSlugs.add(rec.basename.slice(REVIEW_NAME_PREFIX.length).replace(/\.md$/, ''));
    }
    pre.records.push({ rec: rec, parsed: parsed });
  });

  ships.receipts.forEach(function (s) { pre.ships.push(s); });

  // D1 — 분모는 kind='record' 만. pre_measurement 는 읽을 블록이 없으므로
  // "구조 미보유"가 아니라 코퍼스의 시간 경계이고, coverage 가 하한으로 나른다.
  const preMeasurable = pre.records.filter(function (p) { return p.parsed.kind === 'record'; });
  const prePreMeasurement = pre.records.length - preMeasurable.length;

  let selected = 0;
  preMeasurable.forEach(function (p) { if (defs.hasRoundStructure(p.parsed.measurement)) selected += 1; });

  const controls = defs.ROUND_STRUCTURE_CONTROLS.map(function (c) {
    let hits = 0;
    pre.records.forEach(function (p) { if (c.test(p.rec.text)) hits += 1; });
    return { id: c.id, label: c.label, hits: hits, denominator: pre.records.length };
  });

  // D2 · D3 — pre_baseline ship 에 대해.
  const recordBySlug = new Map();
  preMeasurable.forEach(function (p) {
    const b = p.rec.basename;
    if (b.indexOf(REVIEW_NAME_PREFIX) === 0) recordBySlug.set(b.slice(REVIEW_NAME_PREFIX.length).replace(/\.md$/, ''), p.parsed);
  });

  // `join` 은 장식이 아니라 이 수치의 **상한을 알리는 필드**다. review->receipt 은
  // ship 을 순회하며 그 slug 로 레코드를 찾으므로, 파일명이 어긋난 ship 은 레코드가
  // 아무리 정확한 `receipt_hash` 를 실어도 영원히 미계상이다 — 즉 이 방향의
  // 구조적 천장은 `filename_convention.match` 다. 그 사실이 출력에 없으면 M3 이후
  // 소비자가 "링크율 100%" 가 달성 불가인 이유를 알 방법이 없다.
  const link = {
    receipt_to_review: 0,
    review_to_receipt: 0,
    bidirectional: 0,
    denominator: pre.ships.length,
    join: 'filename_convention',
    join_note: 'review->receipt and bidirectional are joined ship-slug <-> plan-review-<slug>.md, so filename_convention.match is their structural ceiling',
  };
  pre.ships.forEach(function (s) {
    const e = defs.classifyShipEligibility(s.body);
    eligibility[e.verdict] = (eligibility[e.verdict] || 0) + 1;
    eligibilityReasons[e.reason] = (eligibilityReasons[e.reason] || 0) + 1;
    if (reviewSlugs.has(s.slug)) nameConventionMatch += 1;
    const l = defs.classifyLink(s.body, { measurement: (recordBySlug.get(s.slug) || {}).measurement });
    if (l.receipt_to_review) link.receipt_to_review += 1;
    if (l.review_to_receipt) link.review_to_receipt += 1;
    if (l.bidirectional) link.bidirectional += 1;
  });

  // 동결 파티션 — ref 하나로 값이 정해지는 것들.
  result.pre_baseline = {
    ships: pre.ships.length,
    records: pre.records.length,
    round_structure: {
      definition: 'measurement.rounds is an integer >= 1',
      selected: selected,
      denominator: preMeasurable.length,
      coverage: {
        measurable: preMeasurable.length,
        pre_measurement: prePreMeasurement,
        counts_are_lower_bound: prePreMeasurement > 0,
      },
      controls: controls,
    },
    ship_eligibility: { counts: eligibility, by_reason: eligibilityReasons },
    linkage: link,
    filename_convention: {
      note: 'label only — NOT the definition of review-eligibility (see ship_eligibility)',
      match: nameConventionMatch,
      denominator: pre.ships.length,
    },
  };

  // 트리에 있는데 읽거나 파싱하지 못한 것. **이것이 "부재 ≠ 0" 의 자리다.**
  // 이전의 `undated_at_baseline` 은 날짜가 멤버십을 정할 때만 의미가 있었고,
  // 트리에 있으나 작업 트리에 없는 파일은 애초에 세어지지도 않아 `files: []` 로
  // 완전 커버리지를 주장했다. 이제 트리에서 직접 읽으므로 그 상태는 존재할 수 없다.
  const unreadable = (ships.unreadable || []).concat(reviews.unreadable || []).sort();
  result.unreadable_at_baseline = {
    ships: (ships.unreadable || []).length,
    records: (reviews.unreadable || []).length,
    files: unreadable,
  };

  // 동결 state 사다리. `unresolved` 는 위에서 이미 반환했다.
  //
  // blind 와 read_error 가 여기 **반드시** 실려야 한다. 초판은 이 둘을 전역
  // `state` 에만 반영하고 `baseline.state` 는 결손 목록만 봤는데, `--frozen-only`
  // 의 종료 코드가 `baseline.state` 를 따르므로 코퍼스를 통째로 못 본 실행이
  // `state: "ok"` + exit 0 + 전 필드 0 인 동결 블록을 내보냈다 — 잘못된 cwd 에서
  // 재생성하면 그 0 들이 문서에 커밋되고 바이트 test 가 그 거짓을 봉인한다.
  const totalCorpus = pre.ships.length + pre.records.length;
  if (tree === null) {
    result.baseline.state = 'degraded';
    result.baseline.reason = 'baseline tree could not be listed — corpus scope unknown, not zero';
  } else if (totalCorpus === 0) {
    result.baseline.state = 'blind';
    result.baseline.reason = 'the boundary tree yielded no corpus file — absence is not a finding of zero';
  } else if (result.read_error || result.parse_failures > 0 || unreadable.length > 0) {
    result.baseline.state = 'degraded';
  }

  // 진단 전용 (동결 대상 아님) — 작업 트리에 있으나 경계 트리에 없는 것.
  result.post_baseline = o.liveNotInTree || { ships: 0, records: 0 };

  if (result.read_error || result.parse_failures > 0) result.state = 'degraded';
  else if (totalCorpus === 0) result.state = 'blind';
  else result.state = 'ok';
  if (totalCorpus === 0) result.state = 'blind';   // blind 가 degraded 를 이긴다

  return result;
}

// ── frozen projection ────────────────────────────────────────────────────────
//
// 화이트리스트다. 새 필드가 생겨도 자동으로 동결 블록에 새어 들어가지 않는다 —
// 그 자동 유입이 정확히 전역 `undated` 가 들어왔던 경로다.
function frozenOnly(result) {
  const out = {
    schema_version: result.schema_version,
    baseline: result.baseline,
  };
  if (result.baseline.state === 'unresolved') return out;
  out.pre_baseline = result.pre_baseline;
  out.unreadable_at_baseline = result.unreadable_at_baseline;
  return out;
}

function audit(opts) {
  const o = opts || {};
  const root = o.repoRoot || process.cwd();
  const ref = o.baselineRef || DEFAULT_BASELINE_REF;
  const baseline = resolveBaseline(root, ref);
  const tree = Number.isFinite(baseline.ms) ? baselineTree(root, ref) : null;
  return aggregate({
    repoRoot: root,
    baselineRef: ref,
    ships: readShipReceipts(root, ref, tree),
    reviews: readReviewRecords(root, ref, tree),
    baseline: baseline,
    baselineTree: tree,
    liveNotInTree: liveCorpusNotInTree(root, tree),
  });
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function renderHuman(r) {
  const L = [];
  L.push('linkage baseline — state=' + r.state + ' baseline=' + r.baseline.ref +
    ' (' + (r.baseline.resolved_at || 'unresolved') + ') baseline.state=' + r.baseline.state);
  if (r.baseline.state === 'unresolved') {
    L.push('  (no partition reported — the freeze boundary itself did not resolve)');
    return L.join('\n');
  }
  const p = r.pre_baseline;
  L.push('  corpus boundary: ' + JSON.stringify(r.corpus_boundary));
  L.push('  pre_baseline: ships=' + p.ships + ' records=' + p.records);
  L.push('  round_structure: ' + p.round_structure.selected + '/' + p.round_structure.denominator +
    ' (' + p.round_structure.definition + ')' +
    (p.round_structure.coverage.counts_are_lower_bound
      ? ' — LOWER BOUND, ' + p.round_structure.coverage.pre_measurement + ' record(s) predate the Measurement block'
      : ''));
  L.push('  controls: ' + p.round_structure.controls.map(function (c) { return c.id + '=' + c.hits + '/' + c.denominator; }).join(' '));
  L.push('  ship_eligibility: ' + JSON.stringify(p.ship_eligibility.counts));
  L.push('  linkage: receipt->review=' + p.linkage.receipt_to_review +
    ' review->receipt=' + p.linkage.review_to_receipt +
    ' bidirectional=' + p.linkage.bidirectional + ' / ' + p.linkage.denominator +
    ' (join=' + p.linkage.join + ')');
  L.push('  filename_convention (label only; also the review->receipt ceiling): ' +
    p.filename_convention.match + '/' + p.filename_convention.denominator);
  L.push('  unreadable_at_baseline: ' + r.unreadable_at_baseline.files.length);
  L.push('  post_baseline (diagnostic — live tree, not in boundary tree): ships=' +
    r.post_baseline.ships + ' records=' + r.post_baseline.records);
  return L.join('\n');
}

function printUsage() {
  process.stdout.write([
    'Usage: node plugins/mccp/scripts/lib/linkage-audit.js [--json|--frozen-only] [--repo-root <path>] [--baseline-ref <ref>]',
    '',
    'Read-only, LLM-free baseline for the ship-receipt <-> plan-review-record linkage.',
    'Counts only — it holds no thresholds and makes no judgement.',
    '',
    '  --frozen-only   emit ONLY what the pinned boundary fixes (baseline, pre_baseline,',
    '                  unreadable_at_baseline). This is what the frozen-baseline doc commits.',
    '                  The corpus is read from the boundary TREE, so these values do not',
    '                  move when the working tree does.',
    '  --json          full output, including the mutable post_baseline diagnostic.',
    '',
    'Exit: 0 ok · 1 degraded · 2 blind (zero records) · 3 unresolved (baseline ref).',
    '',
  ].join('\n'));
}

function main(argv) {
  let asJson = false;
  let frozen = false;
  let repoRoot = null;
  let ref = DEFAULT_BASELINE_REF;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') asJson = true;
    else if (a === '--frozen-only') frozen = true;
    else if (a === '--repo-root') { repoRoot = argv[++i]; if (!repoRoot) { warn('--repo-root requires a path'); process.exit(1); } }
    else if (a === '--baseline-ref') { ref = argv[++i]; if (!ref) { warn('--baseline-ref requires a ref'); process.exit(1); } }
    else if (a === '-h' || a === '--help') { printUsage(); process.exit(0); }
    else warn('unknown argument "' + a + '" (ignored — loud fail-open).');
  }
  if (!repoRoot) {
    const r = git(process.cwd(), ['rev-parse', '--show-toplevel']);
    repoRoot = r.ok ? r.out.trim() : process.cwd();
  }

  const result = audit({ repoRoot: repoRoot, baselineRef: ref });

  if (frozen) process.stdout.write(JSON.stringify(frozenOnly(result), null, 2) + '\n');
  else if (asJson) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else process.stdout.write(renderHuman(result) + '\n');

  switch (result.state) {
    case 'unresolved':
      warn('UNRESOLVED — baseline ref "' + ref + '" did not resolve (' +
        (result.baseline.reason || 'unknown') + '). The freeze boundary does not exist, ' +
        'so no partition is reported. This is NOT ok/exit 0.');
      break;
    case 'blind':
      warn('BLIND — 0 records. Absence is NOT a finding of zero; no ratio is reported.');
      break;
    case 'degraded':
      warn('DEGRADED — read_error=' + result.read_error +
        ' parse_failures=' + result.parse_failures +
        ' unreadable_at_baseline=' + (((result.unreadable_at_baseline || {}).files || []).length) + '.');
      (result.parse_errors || []).forEach(function (e) { warn('  parse failure: ' + e.record + ' — ' + e.error); });
      (((result.unreadable_at_baseline || {}).files) || []).forEach(function (f) { warn('  unreadable: ' + f); });
      break;
    default:
      break;
  }
  if (result.pre_baseline && result.pre_baseline.round_structure.coverage.counts_are_lower_bound) {
    warn('coverage: ' + result.pre_baseline.round_structure.coverage.pre_measurement +
      ' pre_baseline record(s) predate the `## Measurement` block — round_structure is a LOWER BOUND.');
  }
  // `--frozen-only` 는 동결 뷰만 방출하므로 종료 코드도 동결 뷰를 따른다. 전역
  // state 를 쓰면 경계 **밖**의 무관한 결손(예: 오늘 추가된 날짜 없는 파일)이
  // 동결 검증을 붉게 만든다 — 내용 바이트에서 방금 제거한 그 결합을 종료 코드로
  // 되돌리는 셈이다. 전역 진단은 `--json` 이 답한다.
  process.exit(exitCodeForState(frozen ? result.baseline.state : result.state));
}

module.exports = {
  aggregate: aggregate,
  audit: audit,
  frozenOnly: frozenOnly,
  readShipReceipts: readShipReceipts,
  readReviewRecords: readReviewRecords,
  resolveBaseline: resolveBaseline,
  baselineTree: baselineTree,
  liveCorpusNotInTree: liveCorpusNotInTree,
  DEFAULT_BASELINE_REF: DEFAULT_BASELINE_REF,
  STATE_EXIT_CODES: STATE_EXIT_CODES,
  exitCodeForState: exitCodeForState,
};

if (require.main === module) main(process.argv.slice(2));
