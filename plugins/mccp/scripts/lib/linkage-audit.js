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
// DD7 — **강제**의 경계 ref. 위 `DEFAULT_BASELINE_REF` 와는 다른 질문에 답한다:
// 저것은 "동결 baseline 이 어디까지인가", 이것은 "어디부터 라운드 구조를 요구하는가".
//
// 지표 3 의 분모는 PRD 가 이미 "**착지 후** 발행분" 이라 정해 뒀다. 없던 것은 그
// "착지" 를 기계가 아는 방법이고, M1 이 `--baseline-ref` 로 같은 장치를 이미 갖고
// 있으므로 그 모양을 그대로 쓴다. 라이브 파티션 전건을 분모로 쓰면 UI1(소급 금지)
// 때문에 기존 레코드가 영구히 `absent` 라서 종료 코드가 **절대 0 이 될 수 없다** —
// "absent 가 있으면 비영점" 과 "착지 후 exit 0" 이 동시에 참일 수 없었다.
//
// 값은 M4 구현 시점의 `origin/main` tip 이다. 전체 SHA 인 이유는 `DEFAULT_BASELINE_REF`
// 와 같다(축약은 ambiguous 해질 수 있고 그 실패가 `unresolved` 로 나타난다).
//
// **알려진 한계**: SHA 경계는 "M4 를 아는 코드가 생산했는가" 를 정확히 표현하지
// 못한다. 이 커밋 이후에 머지되는 **병렬 브랜치**의 레코드는 M4 이전 코드가 만들었어도
// 경계 이후로 잡힌다. 그때의 정답은 이 상수를 앞으로 미는 것이 아니라 `--since` 로
// 그 사이클의 경계를 주는 것이다 — 상수는 기본값이지 유일한 값이 아니다.
const DEFAULT_M4_BOUNDARY_REF = '2cb173c61b60d8569004de6789dfa1ecadb82b99';

// `--check-round-structure` 의 종료 코드. `STATE_EXIT_CODES` 와 **분리한다** — 저것은
// "코퍼스를 얼마나 읽었는가", 이것은 "경계 이후 레코드가 D1 을 만족하는가" 로 서로
// 다른 질문이고, 같은 표를 나눠 쓰면 한쪽 의미가 바뀔 때 다른 쪽이 조용히 따라간다.
const CHECK_EXIT_CODES = Object.freeze({
  ok: 0,
  violations: 1,        // 경계 이후 레코드에 absent 가 있다 — 이 도구의 본래 목적
  degraded: 2,          // 판정 대상을 다 읽지 못했다 — 통과시키면 fail-open 이다
  unresolved: 3,        // 경계 ref 자체가 해소되지 않았다
});

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

// 파일명 관례. **정의가 아니라 라벨이다** — 경계 트리 실측 일치율 27/75 다.
// (초판 주석의 24/71 과 '41/71 이 최초 패널 레코드보다 앞선다' 는 삭제된 작업-트리
// 파티션에서 나온 수치라 지웠다. 후자는 날짜 비교를 전제하는데 이 도구는 더 이상
// 어떤 날짜도 계산하지 않는다.) 세되 D2 판정에 쓰지 않는다.
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
    const r = gitRev(root, ['show'], ref + ':' + rel);
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
      const r = gitRev(root, ['show'], ref + ':' + rel);
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

// ── ref 가드 (santa-loop R1 흡수) ────────────────────────────────────────────
//
// `-` 로 시작하는 ref 는 git 이 **옵션으로 파싱**하고, `git show` 는 diff 옵션
// `--output=<file>` 을 받는다. 즉 `--baseline-ref '--output=...'` 하나로 "쓰기
// 0건" 을 표제로 내건 도구가 임의 파일을 만든다. 이론이 아니라 재현됐다.
//
// 두 겹으로 막는다. 어느 한쪽만으로도 오늘은 충분하지만 둘 다 얇다: 형태 검증은
// 미래에 새 호출부가 생기면 그 호출부를 덮지 못하고, `--end-of-options` 는
// 그것을 빠뜨린 호출부를 덮지 못한다.
const REF_SHAPE = /^[0-9A-Za-z][0-9A-Za-z._/-]{0,254}$/;

function isSafeRef(ref) {
  return typeof ref === 'string' && REF_SHAPE.test(ref);
}

// `--` 가 아니라 `--end-of-options` 다. `git show -s --format=%cI -- <ref>` 는
// ref 를 **경로**로 해석해 조용히 빈 출력을 내므로, 그것을 쓰면 주입은 막히지만
// 도구가 모든 ref 에 대해 unresolved 가 된다. git 2.24+ 가 요구된다.
function gitRev(root, args, ref) {
  return git(root, args.concat(['--end-of-options', ref]));
}

function resolveBaseline(root, ref) {
  const r = gitRev(root, ['show', '-s', '--format=%cI'], ref);
  if (!r.ok) return { ms: null, iso: null, reason: 'ref did not resolve' };
  const iso = r.out.trim();
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { ms: null, iso: null, reason: 'commit date unparsable' };
  return { ms: ms, iso: iso, reason: null };
}

// 경계 트리의 파일 집합. **코퍼스 멤버십 그 자체다** — 범위를 좁히는 보조 장치가
// 아니라 무엇이 동결 대상인지를 정하는 유일한 원천이다.
function baselineTree(root, ref) {
  const r = gitRev(root, ['ls-tree', '-r', '--name-only'], ref);
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

// ── 링크 계산 (M3 — 두 파티션이 공유한다) ───────────────────────────────────
//
// M1 은 이 계산을 `aggregate` 안에 인라인으로 뒀고 그래서 동결 파티션에서만 돌았다.
// M3 는 같은 계산을 라이브 파티션에도 적용해야 하므로 함수로 뽑는다 — **두 벌로
// 만들지 않는다**. 두 파티션이 다른 규칙으로 세면 두 수치를 비교할 근거가 없다.
//
// ── join 이 `explicit_field` 로 바뀌었다 (축 2) ──────────────────────────────
//
// M1 의 join 은 파일명 관례(ship slug ↔ `plan-review-<slug>.md`)였고, 그 실측
// 일치율 27/75 가 review->receipt 방향의 **구조적 천장**이었다. M3 는 receipt 가
// 봉인한 `meta.review_record_path` 로 직접 조회하므로 그 천장이 사라진다.
//
// **봉인된 경로로 파일을 열지 않는다.** 이미 스캔한 코퍼스 맵에서 조회할 뿐이라
// traversal 표면이 생기지 않는다(Task 4 의 containment 는 *쓰기* 경로 전용이다).
// 조회 실패 = 링크 부재다: 실재하지 않는 레코드를 가리키는 봉인 경로는 링크가
// 아니라 dangling 이고, 그것을 세면 지표가 부풀려진다.
//
// ── 해시를 실제로 비교한다 (축 3) ───────────────────────────────────────────
//
// `linkage-defs.js:186` 의 `classifyLink` 는 `review_to_receipt` 를 **비어있지
// 않은 문자열인가**로만 본다. Task 6(b) 가 back-patch 실패를 warn+진행으로 두므로,
// 이전 ship 의 stale 해시가 남은 레코드가 새 receipt 와 짝지어져 `bidirectional`
// 로 계수되는 경로가 실재한다. 여기서 레코드의 `receipt_hash` 가 **그 receipt 의
// 실제 `receipt_hash`** 와 같은지 대조해 확정한다.
//
// `linkage-defs.js` 는 손대지 않는다(UI4 — D3 의 정의는 M1 소유). 감사 쪽에서 더
// 강한 조건을 얹을 뿐이고, `join_note` 가 그 차이를 명시한다.
// M5 DD6 — `resolution.rounds` 와 `meta.round_ledger_count` 를 나란히 센다.
//
//   agree        두 값이 같다
//   ledger_zero  ledger === 0 이면서 rounds === 1 (F7 의 형태)
//   disagree     그 밖의 불일치
//   unreadable   둘 중 하나를 정수로 읽을 수 없다
//
// `unreadable` 이 먼저다 — 비교할 수 없는 것을 비교 결과로 접으면 그 순간 관측이
// 아니라 주장이 된다. `ledger_zero` 는 `agree` 와 겹치지 않는다(0 !== 1).
function countRoundsFidelity(ships) {
  const out = { agree: 0, ledger_zero: 0, disagree: 0, unreadable: 0 };
  (ships || []).forEach(function (s) {
    const body = (s && s.body && typeof s.body === 'object') ? s.body : null;
    const resolution = (body && body.resolution && typeof body.resolution === 'object') ? body.resolution : null;
    const meta = (body && body.meta && typeof body.meta === 'object') ? body.meta : null;
    const rounds = resolution ? resolution.rounds : undefined;
    const ledger = meta ? meta.round_ledger_count : undefined;
    if (!Number.isInteger(rounds) || !Number.isInteger(ledger)) {
      out.unreadable += 1;
      return;
    }
    if (rounds === ledger) { out.agree += 1; return; }
    if (ledger === 0 && rounds === 1) { out.ledger_zero += 1; return; }
    out.disagree += 1;
  });
  return out;
}

function computeLinkage(eligibleShips, eligibility, maps) {
  const byPath = (maps && maps.recordByPath) || new Map();
  const link = {
    receipt_to_review: 0,
    review_to_receipt: 0,
    bidirectional: 0,
    denominator: eligibleShips.length > 0 ? eligibleShips.length : null,
    scope: 'review_eligible_ships',
    coverage: {
      eligible: eligibleShips.length,
      not_eligible: eligibility.not_eligible || 0,
      undecidable: eligibility.undecidable || 0,
      rate_computable: eligibleShips.length > 0,
      note: 'numerators are counted over the eligible set only; denominator is null (NOT 0) when that set is empty, so a link RATE is not computable — see ship_eligibility.by_reason for why',
    },
    join: 'explicit_field',
    join_note: 'joined on the receipt-sealed meta.review_record_path (NOT the filename convention, whose 27/75 match was M1\'s structural ceiling); bidirectional additionally requires the record\'s measurement.receipt_hash to EQUAL that receipt\'s receipt_hash, which is stricter than linkage-defs classifyLink (non-empty string) — a stale hash left by an earlier ship does not count',
  };
  // 두 진단 카운터는 **라이브 파티션 전용**이다. 동결 블록에 새 필드를 더하면
  // 커밋된 바이트가 움직이고, 그 자동 유입이 정확히 `frozenOnly` 화이트리스트가
  // 막으려던 경로다(:492-493 — 전역 `undated` 가 들어온 길). 그 화이트리스트는
  // 최상위 키만 보므로 `pre_baseline.linkage` **안쪽**은 여기서 막아야 한다.
  // 동결 파티션에서 두 값은 항상 0 이기도 하다(자격 ship 0건).
  const diagnostics = maps && maps.diagnostics === true;
  if (diagnostics) {
    link.dangling_record_path = 0;
    link.stale_receipt_hash = 0;
  }
  const bump = function (key) { if (diagnostics) link[key] += 1; };

  eligibleShips.forEach(function (s) {
    const sealed = s.body && s.body.meta && s.body.meta.review_record_path;
    const found = (typeof sealed === 'string' && byPath.has(sealed)) ? byPath.get(sealed) : null;
    if (typeof sealed === 'string' && sealed.length > 0 && found === null) {
      bump('dangling_record_path');
    }
    const l = defs.classifyLink(s.body, { measurement: found === null ? null : found.measurement });
    if (l.receipt_to_review) link.receipt_to_review += 1;
    if (l.review_to_receipt) link.review_to_receipt += 1;
    if (!l.bidirectional) return;

    // 축 3 — 여기서만 확정된다.
    const declared = found && found.measurement && found.measurement.receipt_hash;
    const actual = s.body && s.body.receipt_hash;
    if (typeof actual === 'string' && actual.length > 0 && declared === actual) {
      link.bidirectional += 1;
    } else {
      bump('stale_receipt_hash');
    }
  });
  return link;
}

// 레코드를 **경로**로 색인한다. `rec.name` 은 수집 시점의 repo-relative POSIX 경로
// (`readReviewRecords` 가 tree 목록에서 그대로 받는다)이므로 receipt 가 봉인한
// 값과 같은 어휘다.
//
// ── 아카이브는 링크를 끊는다 (알려진 한계, 침묵하지 않는다) ──────────────────
//
// 색인 키는 **경로 그대로**이고 basename fallback 이 없다. 레코드를
// `.claude/reviews/` 에서 `.claude/reviews/archive/` 로 옮기면 receipt 가 봉인한
// 옛 경로는 더 이상 조회되지 않고 그 ship 은 `dangling_record_path` 로 계수된다.
// receipt 는 hash 봉인이라 새 경로로 고쳐 가리킬 수 없다(§3.12 no-rehash) —
// 즉 아카이브는 **일방향으로 링크를 끊는다**. 이 저장소에는 이미 아카이브된
// 패널 레코드가 실재한다(`.claude/reviews/archive/plan-review-*.md` 4건).
//
// basename 으로 되찾는 fallback 을 **일부러 넣지 않는다**: 그것은 M3 가 없앤
// 파일명 관례 조인을 뒷문으로 되살리는 것이고, 서로 다른 두 디렉토리의 동명
// 레코드를 같은 것으로 보게 만든다. 끊긴 링크를 끊겼다고 보고하는 편이
// 파일명이 우연히 맞는 레코드를 승인 증거로 세는 것보다 낫다.
function recordByPath(records) {
  const m = new Map();
  records.forEach(function (p) {
    if (p.parsed && p.parsed.kind === 'record') m.set(p.rec.name, p.parsed);
  });
  return m;
}

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
  const recordParseFailures = [];

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
      // santa-loop R1 — this record IS in the boundary tree and we could not read
      // its Measurement block, so it belongs in the coverage-gap list. Before this
      // it only bumped a counter and vanished from every denominator, while
      // `unreadable_at_baseline` still affirmed `files: []` — the designated
      // "absence is not zero" field certifying no gap over a corpus it had lost.
      result.parse_failures += 1;
      result.parse_errors.push({ record: rec.name, error: parsed.error || 'unknown' });
      recordParseFailures.push(rec.name);
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
  //
  // slug 색인은 없다. M1 은 ship slug 로 레코드를 찾았고 그 조인이 27/75 천장이었는데,
  // M3 의 조인은 `meta.review_record_path` 경로 조회다. 그 맵을 계속 만들어 넘기면
  // 소비자가 없는 계산이 남고, 다음 사람은 두 조인이 아직 공존한다고 읽는다.
  // `filename_convention` 은 :431 에서 자체적으로 basename 을 훑으므로 영향이 없다.

  // 자격 판정이 먼저다 — 링크는 **리뷰 대상 ship 위에서만** 센다.
  //
  // 초판은 자격을 판정해 놓고 분모로는 `pre.ships.length` 를 썼다. 그 조합은
  // UI2("분모는 전체 ship 이 아니라 리뷰 대상 ship")의 후반부를 위반하고, 전건이
  // `undecidable` 인 코퍼스에서 `0/75` 를 발행한다 — 읽는 사람이 유효 링크율로
  // 오독할 수밖에 없는 수다. 자격 집합 위에서 세면 두 필드가 같은 모집단을 말하게
  // 되고, 자격 집합이 비면 분모는 0 이 아니라 **null**(계산 불가)이다. 0 은
  // "리뷰 대상이 없다"는 판정이고 null 은 "판정 수단이 없다"는 관측이라, 이
  // 도구가 `undecidable` 을 0 으로 접지 않는 이유(DD2)와 같은 구분이다.
  const eligibleShips = [];
  pre.ships.forEach(function (s) {
    const e = defs.classifyShipEligibility(s.body);
    eligibility[e.verdict] = (eligibility[e.verdict] || 0) + 1;
    eligibilityReasons[e.reason] = (eligibilityReasons[e.reason] || 0) + 1;
    if (reviewSlugs.has(s.slug)) nameConventionMatch += 1;
    if (e.verdict === 'eligible') eligibleShips.push(s);
  });

  const link = computeLinkage(eligibleShips, eligibility, {
    recordByPath: recordByPath(pre.records),
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
  const unreadable = (ships.unreadable || [])
    .concat(reviews.unreadable || [])
    .concat(recordParseFailures)
    .sort();
  result.unreadable_at_baseline = {
    ships: (ships.unreadable || []).length,
    records: (reviews.unreadable || []).length + recordParseFailures.length,
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
    // santa-loop R1 — and the partition must not be EMITTED. Before this the
    // frozen view still published pre_baseline zeros plus an empty gap list, so
    // a run that read nothing produced an internally consistent block that a
    // regeneration could commit and the byte test would then seal.
    result.baseline.scope_unknown = true;
  } else if (totalCorpus === 0) {
    result.baseline.state = 'blind';
    result.baseline.reason = 'the boundary tree yielded no corpus file — absence is not a finding of zero';
  } else if (result.read_error || result.parse_failures > 0 || unreadable.length > 0) {
    result.baseline.state = 'degraded';
    // A state with no reason is a gap the reader cannot act on. The blind branch
    // above already says why; this one used to say nothing at all.
    result.baseline.reason = unreadable.length + ' corpus file(s) in the boundary tree could not be read or parsed';
  }

  // ── 라이브 파티션 (M3 축 1) ────────────────────────────────────────────────
  //
  // 지표 2 가 읽는 것은 **여기**다. 동결 파티션은 기준선으로 불변이고, 둘은
  // **결코 합산하지 않는다** — 합치는 순간 동결이 깨진다.
  //
  // 읽기 원천은 작업 트리가 아니라 **`HEAD` 의 트리**다. 이것이 이 축의 급소다:
  // `liveCorpusNotInTree` 는 `fs.readdirSync` 로 작업 트리를 세고 이 파일 자신이
  // 그것을 ":42" 에서 "진단 전용" 이라 선언한다. 그 위에 지표를 얹으면 M3 가
  // 닫으려는 실패가 부활한다 — `MCCP_PR_SKIP_LINK_EVIDENCE` 를 쓰거나 evidence
  // commit 이 실패해도 back-patch 된 레코드는 작업 트리에 남으므로 감사가
  // `bidirectional` 을 만점으로 세고, 히스토리에 증거가 0 인 채로 100% 를 보고한다.
  // 즉 우회가 지표를 강등시키지 않고, acceptance 가 evidence commit 실패와
  // 구별되지 않는다. Task 7 의 "감사가 그대로 보고한다" 는 이 변경이 있어야 참이다.
  //
  // 작업 트리 카운트는 **지우지 않는다**. `post_baseline.ships`/`records` 의 의미는
  // M1 그대로(작업 트리에 있으나 경계 트리에 없는 것)이고, HEAD 카운트는 별도
  // 필드로 나란히 싣는다. 두 값이 갈라지는 것 자체가 "커밋되지 않은 링크가 있다"는
  // 신호이고, 그것이 우회가 실제로 관측되는 지점이다.
  //
  // ── 상태 사다리 (R4 invariant HIGH `9ffdd2e3`) ─────────────────────────────
  //
  // 동결 파티션은 :461-477 에서 이미 이 교훈을 치렀다 — 코퍼스를 통째로 못 본
  // 실행이 `state:"ok"` + 전 필드 0 을 내보냈고, 그 0 들이 문서에 커밋될 수 있었다.
  // 라이브 파티션에 사다리가 없으면 HEAD 판독 실패가 "정상적으로 링크 0건" 과
  // 구별되지 않고, 이 사이클 acceptance 의 세 항목이 **판독이 완전히 실패한
  // 실행에서도 전부 참**이 되어 아무것도 반증하지 못한다.
  //
  // 그래서 `scope_unknown` 일 때 `linkage` 블록을 **방출하지 않는다** — 동결 쪽의
  // `frozenOnly` 가 하는 것과 같은 규율이다. 없는 것을 0 으로 보고하지 않는다.
  const live = o.live || null;
  const post = {
    ships: (o.liveNotInTree && o.liveNotInTree.ships) || 0,
    records: (o.liveNotInTree && o.liveNotInTree.records) || 0,
    note: 'ships/records are the WORKING-TREE diagnostic (present on disk, absent from the boundary tree) and are NOT the metric-2 source; head_* and linkage below read the HEAD tree',
    ref: 'HEAD',
    state: 'ok',
  };
  if (live === null || live.tree === null) {
    post.state = 'degraded';
    post.reason = 'the HEAD tree could not be listed — live corpus scope unknown, NOT zero';
    post.scope_unknown = true;
  } else {
    const liveRecords = [];
    let liveParseFailures = 0;
    (live.reviews.records || []).forEach(function (rec) {
      let parsed;
      try { parsed = corpus.parseRecord(rec.text); }
      catch (err) { parsed = { ok: false, kind: 'parse_failure', measurement: null, error: err.message }; }
      if (parsed.kind === 'parse_failure') { liveParseFailures += 1; return; }
      if (parsed.kind === 'out_of_corpus') return;
      liveRecords.push({ rec: rec, parsed: parsed });
    });
    const liveShips = live.ships.receipts || [];
    post.head_ships = liveShips.length;
    post.head_records = liveRecords.length;

    // review-record-linkage M4 (DD5) — D1 자격 3값 집계. **보고**이지 강제가 아니다.
    // 강제는 `--check-round-structure` 가 하고 그 분모는 M4 착지 경계 이후다(DD7).
    // 동결 파티션의 `round_structure` 는 한 줄도 건드리지 않는다 — 신규 카운트는
    // 라이브에만 나타나야 동결 baseline 이 움직이지 않는다(R6).
    const roundCounts = { present: 0, not_enrolled: 0, absent: 0 };
    const roundReasons = {};
    liveRecords.forEach(function (rec) {
      const c = defs.classifyRoundStructure(rec.parsed.measurement);
      roundCounts[c.verdict] = (roundCounts[c.verdict] || 0) + 1;
      roundReasons[c.reason] = (roundReasons[c.reason] || 0) + 1;
    });
    post.round_structure = {
      definition: 'measurement.rounds is an integer >= 1 (D1); eligibility is 3-valued (DD5)',
      counts: roundCounts,
      by_reason: roundReasons,
      note: 'REPORT only — the enforced denominator is the M4 landing boundary, not this ' +
        'partition (DD7). Run --check-round-structure for the enforcing view.',
    };

    const liveEligibility = { eligible: 0, not_eligible: 0, undecidable: 0 };
    const liveEligibilityReasons = {};
    const liveEligible = [];
    liveShips.forEach(function (s) {
      const base = defs.classifyShipEligibility(s.body);
      // M5 DD5 — 사유 이분화는 **여기에만** 있다. `pre_baseline`(:513)은 동결된
      // 사유 문자열을 그대로 쓴다. 그 대칭을 깨는 것이 요점이다: 동결 블록은
      // 값이 움직이지 않는 것 자체가 계약이고(UI6), 사유를 바꾸면
      // `frozen-baseline.md:318`의 75건 키가 전부 바뀐다. `frozenOnly()`가
      // `pre_baseline`을 통째로 통과시키므로 그 유입을 막는 것은 화이트리스트가
      // 아니라 **여기서 부르지 않는 것**이다.
      const e = defs.refineLiveUndecidableReason(s.body, base);
      liveEligibility[e.verdict] = (liveEligibility[e.verdict] || 0) + 1;
      liveEligibilityReasons[e.reason] = (liveEligibilityReasons[e.reason] || 0) + 1;
      if (e.verdict === 'eligible') liveEligible.push(s);
    });

    const liveUnreadable = (live.ships.unreadable || []).length +
      (live.reviews.unreadable || []).length + liveParseFailures;
    const liveTotal = liveShips.length + liveRecords.length;
    if (liveTotal === 0) {
      post.state = 'blind';
      post.reason = 'the HEAD tree yielded no corpus file — absence is not a finding of zero';
    } else if (live.ships.read_error || live.reviews.read_error || liveUnreadable > 0) {
      post.state = 'degraded';
      post.reason = liveUnreadable + ' corpus file(s) in the HEAD tree could not be read or parsed';
    }
    post.unreadable = liveUnreadable;
    // blind/degraded 여도 판독한 만큼은 싣는다 — 다만 `scope_unknown` 은 아니므로
    // 소비자가 `state` 를 보고 하한임을 안다. `scope_unknown` 만이 방출을 막는다.
    post.ship_eligibility = { counts: liveEligibility, by_reason: liveEligibilityReasons };
    post.linkage = computeLinkage(liveEligible, liveEligibility, {
      recordByPath: recordByPath(liveRecords),
      diagnostics: true,
    });
    // M5 DD6 — `rounds_fidelity`. **판정하지 않고 대조만 한다.**
    //
    // F7이 관측한 형태: skip-path ship 의 `resolution.rounds` 가 리터럴 1 인데
    // `meta.round_ledger_count` 는 0 이다. M2 dropped 노트가 그것을 "소실이 아니라
    // 표현 한계"로 이연했고 해석은 C4 가 소비 시점에 소유한다(UI12). 그래서 여기에는
    // 임계도 종료코드도 붙이지 않는다 — 붙이는 순간 M5 가 C4 의 결정을 선점한다.
    //
    // 라이브 파티션 전용이다. 동결 블록에 새 필드를 더하면 커밋된 바이트가 움직인다.
    post.rounds_fidelity = countRoundsFidelity(liveShips);
  }
  result.post_baseline = post;

  if (result.read_error || result.parse_failures > 0) result.state = 'degraded';
  else if (totalCorpus === 0) result.state = 'blind';
  else result.state = 'ok';
  if (totalCorpus === 0) result.state = 'blind';   // blind 가 degraded 를 이긴다

  return result;
}

// ── 경계 검사 (review-record-linkage M4 — DD4의 2번 · DD7) ──────────────────
//
// DD4 는 "미달 형식은 기록 시점에 거부" 를 둘로 나눴다. 기록 시점은 레코드가 자기
// 비적합을 **선언**하는 것(`record.js`)이고, **강제**는 여기다 — 감사 도구는 게이트가
// 아니므로 진짜로 막아도 계측이 승인을 죽이지 않고, plan 의 `## Validation` 에
// 걸리므로 실효가 있다.
//
// ── ref 취급 (security S1) ──────────────────────────────────────────────────
//
// 이 파일은 `--baseline-ref '--output=...'` 로 임의 파일 쓰기가 **실제 재현된** 이력이
// 있다(:217-224). 그 교훈을 새 플래그에서 되풀이하지 않기 위해 두 겹을 그대로 쓴다:
//   1. `main()` 이 파싱 시점에 `isSafeRef` 로 fail-closed 검증한다.
//   2. ref 는 **절대 다른 문자열과 결합하지 않는다**. `ref + '...HEAD'` 같은 단일 토큰은
//      `--output=/tmp/x...HEAD` 를 만들고 git 의 prefix-match 옵션 파서가 그것을 여전히
//      `--output` 으로 존중한다. 그래서 merge-base 를 **따로** 구해 SHA 로 바꾼 뒤,
//      그 SHA 두 개를 각각 독립 argv 로 넘긴다. ref 가 argv 에 나타나는 유일한 자리는
//      `--end-of-options` 바로 뒤다.
//
// 방향은 3-dot(merge-base) 의미다. 2-dot 트리 diff 를 쓰면 경계 ref 가 HEAD 의 조상이
// 아닐 때(브랜치 작업 중이 정확히 그렇다) 상대편이 추가한 파일이 이쪽에서 "삭제" 로,
// 상대편이 고친 파일이 "수정" 으로 잡혀 남의 레코드가 이 분모에 들어온다.
function checkRoundStructure(opts) {
  const o = opts || {};
  const root = o.repoRoot || process.cwd();
  const ref = o.sinceRef || DEFAULT_M4_BOUNDARY_REF;
  const out = {
    schema_version: 1,
    since_ref: ref,
    merge_base: null,
    state: 'ok',
    in_scope: 0,
    counts: { present: 0, not_enrolled: 0, absent: 0 },
    absent_records: [],
    unreadable: [],
    pre_boundary_records: null,
  };

  const mb = git(root, ['merge-base', '--end-of-options', ref, 'HEAD']);
  if (!mb.ok || !mb.out.trim()) {
    out.state = 'unresolved';
    out.reason = 'the boundary ref did not resolve against HEAD — the enforcement window ' +
      'does not exist, so no record is judged. This is NOT ok/exit 0.';
    return out;
  }
  out.merge_base = mb.out.trim();

  const d = git(root, ['diff', '--name-only', '--diff-filter=AM',
    '--end-of-options', out.merge_base, 'HEAD']);
  if (!d.ok) {
    out.state = 'unresolved';
    out.reason = 'git diff over the enforcement window failed — scope unknown, NOT zero';
    return out;
  }

  const isPanelPath = function (rel) {
    for (let i = 0; i < REVIEW_SUBDIRS.length; i++) {
      const base = underDirNonRecursive(rel, REVIEW_SUBDIRS[i], '.md');
      if (base !== null && base.indexOf(REVIEW_NAME_PREFIX) === 0) return true;
    }
    return false;
  };

  const candidates = d.out.split(/\r?\n/).filter(Boolean).filter(isPanelPath).sort();

  candidates.forEach(function (rel) {
    const r = gitRev(root, ['show'], 'HEAD:' + rel);
    if (!r.ok) { out.state = 'degraded'; out.unreadable.push(rel); return; }
    let parsed;
    try { parsed = corpus.parseRecord(r.out); }
    catch (_err) { parsed = { kind: 'parse_failure', measurement: null }; }
    if (parsed.kind === 'parse_failure') { out.state = 'degraded'; out.unreadable.push(rel); return; }
    // 다른 생산자의 파일은 결손이 아니라 코퍼스 밖이다 — 소속 판정은 `corpus.js` 가
    // 소유하고(M1 DD1a) 이 도구는 그 판정을 그대로 받는다.
    if (parsed.kind === 'out_of_corpus') return;
    out.in_scope += 1;
    const c = defs.classifyRoundStructure(parsed.measurement);
    out.counts[c.verdict] = (out.counts[c.verdict] || 0) + 1;
    if (c.verdict === 'absent') out.absent_records.push({ path: rel, reason: c.reason });
  });

  // 경계 **이전** 레코드는 보고만 한다(DD7) — 목표를 갖지 않는 구간이다.
  const headTree = baselineTree(root, 'HEAD');
  if (headTree instanceof Set) {
    let total = 0;
    REVIEW_SUBDIRS.forEach(function (sub) {
      (corpusPathsInTree(headTree, sub, '.md') || []).forEach(function (rel) {
        if (isPanelPath(rel)) total += 1;
      });
    });
    out.pre_boundary_records = Math.max(0, total - candidates.length);
  }

  // **`degraded` 가 이긴다** (local code-review M2). 초판은 이 자리에 서로를 지우는 두
  // 줄을 뒀다 — 앞줄이 `state !== 'degraded'` 로 degraded 를 보호하고 뒷줄의 `else if` 가
  // 같은 조건을 무조건 덮어써서, 순효과는 "absent 가 있으면 무조건 violations" 였다.
  // 의도(앞줄)와 동작(뒷줄)이 반대라 어느 쪽이 정본인지 코드가 말하지 못했다.
  //
  // 정본은 `degraded` 다. 두 상태가 답하는 질문이 다르기 때문이다 — `violations` 는
  // "본 것 중에 위반이 있다", `degraded` 는 "**다 보지 못했다**" 이고, 후자가 성립하면
  // 전자의 카운트는 하한일 뿐이다. 판정 부재를 위반 개수로 갈음하면 창 안의 파손이
  // 위반 하나에 가려 exit 2 가 exit 1 로 접힌다.
  //
  // 두 사실 모두 소비자에게 남는다: `absent_records` 와 `unreadable` 은 state 와 무관하게
  // 각자 실리고, `main()` 의 경고도 state 가 아니라 그 두 배열의 길이로 발화한다.
  if (out.absent_records.length > 0 && out.state !== 'degraded') out.state = 'violations';
  return out;
}

function checkExitCode(state) {
  const code = CHECK_EXIT_CODES[state];
  return typeof code === 'number' ? code : 1;     // 미지 state → 비영점 (fail-closed)
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
  if (result.baseline.scope_unknown) return out;   // scope unknown != a corpus of zeros
  out.pre_baseline = result.pre_baseline;
  out.unreadable_at_baseline = result.unreadable_at_baseline;
  return out;
}

// M3 — 라이브 파티션의 코퍼스. 동결 쪽과 **같은 판독 경로**(`ls-tree` + `git show`)를
// 쓰고 ref 만 다르다. 작업 트리를 읽지 않는 것이 요점이다(위 post_baseline 주석 참조).
function readLiveCorpus(root, ref) {
  const tree = baselineTree(root, ref);
  if (tree === null) return { tree: null, ships: null, reviews: null };
  return {
    tree: tree,
    ships: readShipReceipts(root, ref, tree),
    reviews: readReviewRecords(root, ref, tree),
  };
}

function audit(opts) {
  const o = opts || {};
  const root = o.repoRoot || process.cwd();
  const ref = o.baselineRef || DEFAULT_BASELINE_REF;
  const liveRef = o.liveRef || 'HEAD';
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
    live: readLiveCorpus(root, liveRef),
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
  // 분모가 null 이면 비율을 인쇄하지 않는다. `0/null` 을 찍으면 사람이 그것을
  // 0% 로 읽는데, 실제 상태는 "리뷰 대상을 판별할 수단이 없다"이다.
  L.push('  linkage: receipt->review=' + p.linkage.receipt_to_review +
    ' review->receipt=' + p.linkage.review_to_receipt +
    ' bidirectional=' + p.linkage.bidirectional +
    (p.linkage.coverage.rate_computable
      ? ' / ' + p.linkage.denominator + ' review-eligible ship(s)'
      : ' — RATE NOT COMPUTABLE, no ship is decidably review-eligible (' +
        p.linkage.coverage.undecidable + ' undecidable)') +
    ' (join=' + p.linkage.join + ')');
  L.push('  filename_convention (label only; also the review->receipt ceiling): ' +
    p.filename_convention.match + '/' + p.filename_convention.denominator);
  L.push('  unreadable_at_baseline: ' + r.unreadable_at_baseline.files.length);
  const lp = r.post_baseline || {};
  L.push('  post_baseline (working-tree diagnostic, not in boundary tree): ships=' +
    lp.ships + ' records=' + lp.records);
  L.push('  post_baseline (LIVE, ref=' + (lp.ref || '?') + '): state=' + lp.state +
    (lp.scope_unknown ? ' — SCOPE UNKNOWN, no linkage reported' : '') +
    (lp.reason ? ' (' + lp.reason + ')' : ''));
  if (lp.linkage) {
    L.push('    head: ships=' + lp.head_ships + ' records=' + lp.head_records);
    if (lp.round_structure) {
      const rc = lp.round_structure.counts;
      L.push('    round_structure (REPORT; enforcement is --check-round-structure): present=' +
        rc.present + ' not_enrolled=' + rc.not_enrolled + ' absent=' + rc.absent);
    }
    if (lp.rounds_fidelity) {
      const rf = lp.rounds_fidelity;
      // 상태만 보고한다. 어느 값이 옳은지는 C4 가 소비 시점에 정한다 (DD6 · UI12).
      L.push('    rounds_fidelity (REPORT only; resolution.rounds vs meta.round_ledger_count): agree=' +
        rf.agree + ' ledger_zero=' + rf.ledger_zero + ' disagree=' + rf.disagree +
        ' unreadable=' + rf.unreadable);
    }
    L.push('    linkage: receipt->review=' + lp.linkage.receipt_to_review +
      ' review->receipt=' + lp.linkage.review_to_receipt +
      ' bidirectional=' + lp.linkage.bidirectional +
      (lp.linkage.coverage.rate_computable
        ? ' / ' + lp.linkage.denominator + ' review-eligible ship(s)'
        : ' — RATE NOT COMPUTABLE (' + lp.linkage.coverage.undecidable + ' undecidable)') +
      ' (join=' + lp.linkage.join +
      ' dangling=' + lp.linkage.dangling_record_path +
      ' stale_hash=' + lp.linkage.stale_receipt_hash + ')');
  }
  return L.join('\n');
}

function printUsage() {
  process.stdout.write([
    'Usage: node plugins/mccp/scripts/lib/linkage-audit.js [--json|--frozen-only] [--repo-root <path>] [--baseline-ref <ref>]',
    '       node plugins/mccp/scripts/lib/linkage-audit.js --check-round-structure [--since <ref>] [--json] [--repo-root <path>]',
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
    '  --check-round-structure',
    '                  ENFORCING view (DD7). Judges only the panel records added or',
    '                  modified in <boundary>...HEAD and exits nonzero when any of them',
    '                  is D1-absent. Records at or before the boundary are reported,',
    '                  never enforced — UI1 forbids retrofitting them.',
    '  --since <ref>   boundary for --check-round-structure (default: the pinned M4',
    '                  landing boundary). Same safe-ref shape rule as --baseline-ref.',
    '                  Ignored without --check-round-structure.',
    '',
    'Exit (audit):     0 ok · 1 degraded · 2 blind (zero records) · 3 unresolved (baseline ref).',
    'Exit (--check-round-structure): 0 ok · 1 violations · 2 degraded · 3 unresolved (boundary',
    '                  ref). The two ladders are SEPARATE tables and answer different',
    '                  questions — 1 and 2 mean the opposite things between them.',
    '',
  ].join('\n'));
}

function main(argv) {
  let asJson = false;
  let frozen = false;
  let repoRoot = null;
  let ref = DEFAULT_BASELINE_REF;
  let checkRounds = false;
  let sinceRef = DEFAULT_M4_BOUNDARY_REF;
  let sinceGiven = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') asJson = true;
    else if (a === '--frozen-only') frozen = true;
    else if (a === '--repo-root') { repoRoot = argv[++i]; if (!repoRoot) { warn('--repo-root requires a path'); process.exit(1); } }
    else if (a === '--baseline-ref') {
      ref = argv[++i];
      if (!ref) { warn('--baseline-ref requires a ref'); process.exit(1); }
      // santa-loop R1 — fail-CLOSED on a ref shape git could read as an option.
      // The call sites also pass `--end-of-options`, but this tool's headline
      // claim is that it writes nothing, and a claim that categorical should not
      // rest on one layer.
      if (!isSafeRef(ref)) {
        warn('--baseline-ref "' + ref + '" is not a safe ref shape (must start with an ' +
          'alphanumeric and contain only [0-9A-Za-z._/-]). A leading "-" would be parsed ' +
          'by git as an option, and `git show --output=<file>` writes to disk.');
        process.exit(1);
      }
    }
    else if (a === '--check-round-structure') checkRounds = true;
    else if (a === '--since') {
      sinceRef = argv[++i];
      sinceGiven = true;
      if (!sinceRef) { warn('--since requires a ref'); process.exit(1); }
      // security S1 — same fail-CLOSED shape rule as --baseline-ref, and for the same
      // measured reason: a leading "-" is parsed by git as an option and
      // `git show --output=<file>` writes to disk. The ref is additionally never
      // concatenated into a range token (see checkRoundStructure).
      if (!isSafeRef(sinceRef)) {
        warn('--since "' + sinceRef + '" is not a safe ref shape (must start with an ' +
          'alphanumeric and contain only [0-9A-Za-z._/-]).');
        process.exit(1);
      }
    }
    else if (a === '-h' || a === '--help') { printUsage(); process.exit(0); }
    else warn('unknown argument "' + a + '" (ignored — loud fail-open).');
  }
  if (!repoRoot) {
    const r = git(process.cwd(), ['rev-parse', '--show-toplevel']);
    repoRoot = r.ok ? r.out.trim() : process.cwd();
  }

  // `--since` 는 `--check-round-structure` 전용이다. 조용히 무시하면 서브커맨드 이름을
  // 오타 낸 호출(그 오타는 unknown-argument 로 loud fail-open 된다)이 `--since` 만 남긴
  // 채 전체 감사를 돌리고, 호출자는 자기가 경계 검사를 돌렸다고 믿는다.
  if (sinceGiven && !checkRounds) {
    warn('--since was given without --check-round-structure and has NO effect — the ' +
      'boundary window only exists for that check. Did a flag name get mistyped?');
  }

  if (checkRounds) {
    const chk = checkRoundStructure({ repoRoot: repoRoot, sinceRef: sinceRef });
    if (asJson) process.stdout.write(JSON.stringify(chk, null, 2) + '\n');
    else {
      process.stdout.write('round-structure check — state=' + chk.state +
        ' since=' + chk.since_ref + ' (merge-base ' + (chk.merge_base || 'unresolved') + ')\n' +
        '  in_scope=' + chk.in_scope + ' present=' + chk.counts.present +
        ' not_enrolled=' + chk.counts.not_enrolled + ' absent=' + chk.counts.absent + '\n' +
        '  before the boundary (reported, NOT enforced): ' +
        (chk.pre_boundary_records === null ? 'unknown' : chk.pre_boundary_records) + '\n');
    }
    if (chk.in_scope === 0 && chk.state === 'ok') {
      warn('VACUOUS PASS — no panel record was added or modified in the enforcement window, ' +
        'so exit 0 means "nothing to judge", not "every record carries rounds". The window ' +
        'is <' + chk.since_ref + '>...HEAD and it reads the HEAD tree, so an uncommitted ' +
        'record is not yet in scope.');
    }
    chk.unreadable.forEach(function (f) { warn('  unreadable in the enforcement window: ' + f); });
    chk.absent_records.forEach(function (a) {
      warn('  D1 ABSENT: ' + a.path + ' — ' + a.reason);
    });
    // 경고는 `state` 가 아니라 **각 배열의 길이**로 발화한다. state 는 하나만 이길 수
    // 있으므로(위 M2 주석), state 로 분기하면 degraded 가 이긴 실행에서 위반 요약이
    // 사라지고 그 반대도 마찬가지다. 두 사실은 배타적이지 않다.
    if (chk.absent_records.length > 0) {
      warn('VIOLATIONS — ' + chk.absent_records.length + ' record(s) landed after the M4 ' +
        'boundary without a round structure. Regenerate them with a build that carries the ' +
        'axis, or state the boundary explicitly with --since.');
    }
    if (chk.unreadable.length > 0) {
      warn('DEGRADED — ' + chk.unreadable.length + ' record(s) in the window could not be ' +
        'read or parsed. Absence of a judgement is not a pass, and the violation count ' +
        'beside it is a LOWER BOUND.');
    }
    if (chk.state === 'unresolved') warn('UNRESOLVED — ' + chk.reason);
    process.exit(checkExitCode(chk.state));
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
  readLiveCorpus: readLiveCorpus,
  computeLinkage: computeLinkage,
  countRoundsFidelity: countRoundsFidelity,
  DEFAULT_BASELINE_REF: DEFAULT_BASELINE_REF,
  STATE_EXIT_CODES: STATE_EXIT_CODES,
  exitCodeForState: exitCodeForState,
  checkRoundStructure: checkRoundStructure,
  checkExitCode: checkExitCode,
  DEFAULT_M4_BOUNDARY_REF: DEFAULT_M4_BOUNDARY_REF,
  CHECK_EXIT_CODES: CHECK_EXIT_CODES,
};

if (require.main === module) main(process.argv.slice(2));
