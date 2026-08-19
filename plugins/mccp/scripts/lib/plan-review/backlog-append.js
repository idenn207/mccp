'use strict';

// review-loop-bypass M2 — 단일통과 토글이 떨어뜨린 지적을 backlog 원장에 적재한다.
//
// M1이 연 완화 경로는 정확히 하나다(decide.js:322의 `quorum.passed !== true`).
// 그 분기가 `block:false`를 반환하는 순간 `quorum.blockingFindings`는 어디로도
// 가지 않는다 — l2.json과 리뷰 기록에는 남지만 둘 다 매 실행 덮어쓰기되고
// worktree와 함께 사라진다. 이 모듈이 그 집합을
// `.claude/plans/codex-findings-backlog.md`로 옮기고, 적재를 완화의 부수효과가
// 아니라 **전제조건**으로 만든다(DD1) — 적재할 수 없으면 완화하지 않는다.
//
// 순수 오라클 + 얇은 I/O 경계는 decide.js:229의 규약을 따른다. env를 읽지 않고,
// 유일한 I/O는 `appendRows` 하나다.
//
// ── 적재 대상 (DD2) ──
// `decision.quorum.blockingFindings` **정확히 그 집합**이다. 토글이 실제로
// 떨어뜨리는 것이 그 배열이므로, 적재 대상과 완화 대상이 같아야 "유실 0"이
// 산술로 성립한다. `l2.json`은 읽지 않는다 — 원시 리뷰어 결과를 두 번째 입력으로
// 받으면 같은 사실의 출처가 둘이 되어 어느 쪽이 정본인지 답할 수 없다.
// severity `UNKNOWN`(판독 불가)과 `FAIL`(bare verdict 합성)도 그 배열의
// 원소이므로 함께 적재한다. **적재는 판정이 아니다.**
//
// ── 소비자 계약 (DD4) ──
// derive/sources/backlog.js:37이 셀을 리터럴 파이프로 분할하고 셀 수가 모자란
// 행을 조용히 `continue`로 버린다. 그래서 렌더 전에 파이프를 HTML 수치 참조로
// 치환한다 — 마크다운은 그것을 파이프로 렌더하고 파서는 분할하지 않는다
// (`&#124;`에는 리터럴 파이프 문자가 없다). 열은 정확히 4개를 유지한다:
// backlog.js:6의 헤더 정규식이 그 4열을 리터럴로 고정하므로 5번째 열을 만들면
// 파서가 표 전체를 찾지 못해 기존 행이 한꺼번에 사라진다.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { reviewRecordPath } = require('./record');

// 소비자와 **같은** 정규식이다. 작성자가 파서보다 느슨한 헤더를 인정하면
// 파서가 못 읽는 위치에 append하게 되고, 그것은 적재가 아니라 유실이다.
const HEADER_RE = /^\|\s*Date\s*\|\s*Severity\s*\|\s*Source plan\s*\|\s*Finding\s*\|\s*$/;

const BACKLOG_REL = ['.claude', 'plans', 'codex-findings-backlog.md'];

// 셀 상한. 표 셀을 무제한으로 두면 대시보드 rail이 읽지 못하는 폭이 된다.
// 절단이 정보를 잃는 대신 각 행이 원문 경로(리뷰 기록)를 함께 싣는다.
const CELL_MAX = 200;

// repo 밖 경로의 자리표시자. write.js:45-52 `normalizeReceiptCwd`가 E7
// (절대경로가 git-tracked 증거로 커밋되는 사고)을 닫을 때 쓴 규약과 같다.
const OUTSIDE_REPO = '<outside-repo>';

const DIGEST_HEX = 8;

// 필드 구분자. 소스에 리터럴 제어문자를 박지 않으려고 fromCharCode로 만든다 —
// 구분자가 없으면 ("ab","c")와 ("a","bc")가 같은 digest를 낸다.
const NUL = String.fromCharCode(0);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function backlogPath(repoRoot) {
  return path.join.apply(path, [repoRoot].concat(BACKLOG_REL));
}

// ── 경로 정규화 (DD4 · security C3/H5/H11) ────────────────────────────────────
//
// backlog는 git-tracked이므로 절대경로를 실으면 작업트리 경로가 — 오래된
// worktree에서는 이전 저장소 이름까지 — 커밋된다. 이것은 가정이 아니라 이
// 저장소가 이미 겪은 사고(E7)이고, `write.js#normalizeReceiptCwd`가 정확히 그
// 유출을 닫으려고 도입됐다. 같은 규약을 따른다.
//
// 현재 backlog 22행이 전부 repo-relative인 것은 **관례일 뿐 강제가 아니므로**
// 오라클이 강제한다.
function normalizeRepoPath(rawPath, repoRoot) {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') return OUTSIDE_REPO;
  if (rawPath.indexOf('\0') !== -1) return OUTSIDE_REPO;
  if (typeof repoRoot !== 'string' || repoRoot.trim() === '') return OUTSIDE_REPO;

  const abs = path.resolve(repoRoot, rawPath);
  const rel = path.relative(path.resolve(repoRoot), abs);

  // `..`로 시작하면 저장소 밖이다. 절대경로를 대신 싣는 것이 바로 E7이므로
  // 자리표시자로 떨어뜨린다. 빈 문자열(= repoRoot 자신)도 파일 경로가 아니다.
  if (rel === '' || rel === '..' || rel.indexOf('..' + path.sep) === 0 || path.isAbsolute(rel)) {
    return OUTSIDE_REPO;
  }
  return rel.split(path.sep).join('/');
}

// ── 셀 이스케이프 (DD4 · security H6/H7/H9) ───────────────────────────────────
//
// 순서가 계약이다:
//   1. 개행 접기 — CR·LF·CRLF와 그 연속을 공백 하나로. `\r?\n`은 bare CR을
//      놓치고, 놓친 CR은 셀 안에서 행을 찢는다 (fix-task.js:52와 같은 규약).
//   2. 절단 — **이스케이프 이전** raw 텍스트에 적용한다. 이스케이프 이후에
//      자르면 `&#124;` 한가운데가 잘려 `&#1` 같은 미완성 엔티티가 남는다.
//      raw에서 자르면 엔티티는 절단 후 생성되므로 잘릴 수 없다.
//      경계가 UTF-16 high surrogate면 한 칸 물려 서로게이트 쌍을 깨지 않는다.
//   3. 이스케이프 — `&`를 **먼저** 치환한다. 나중에 하면 방금 생성한
//      `&#124;`의 `&`까지 이중 이스케이프된다.
//   4. `id=` 무력화 — claim 안의 리터럴 `id=`를 `id&#61;`로 바꾼다. 그래야
//      셀 안의 유일한 리터럴 `id=`가 `renderRow`가 붙인 멱등 태그뿐이 되고,
//      중복 스캔이 claim 텍스트에 오염되지 않는다.
function escapeCell(text) {
  const raw = (text === null || text === undefined) ? '' : String(text);

  // `\s`는 bare CR · LF · CRLF · 탭 · form feed · 유니코드 공백을 모두 포함한다.
  // 여기서 `\r?\n`을 쓰면 bare CR이 빠져나가 셀 안에서 행을 찢는다 —
  // fix-task.js:52가 `[\r\n]+`를 쓰는 것과 같은 이유이고, 이쪽은 그 상위집합이다.
  const flat = raw.replace(/\s+/g, ' ').trim();

  let cut = flat;
  if (cut.length > CELL_MAX) {
    let end = CELL_MAX - 1;
    const code = cut.charCodeAt(end);
    // high surrogate에서 자르면 짝이 깨져 파일에 U+FFFD가 남는다.
    if (code >= 0xd800 && code <= 0xdbff) end -= 1;
    cut = cut.slice(0, end) + '…';
  }

  return cut
    .replace(/&/g, '&amp;')
    .replace(/\|/g, '&#124;')
    .replace(/id=/gi, 'id&#61;');
}

// ── 멱등 digest (DD3) ─────────────────────────────────────────────────────────
//
// `reviewedPlanHash`로 keying하는 이유는 M1의 dispatch 로그와 같다: 같은 본문에
// 대한 재실행은 같은 digest라 중복되지 않고, 흡수로 본문이 바뀐 뒤의 새 실행은
// 새 digest 그룹이라 정직하게 새 행이 쌓인다.
//
// NUL로 잇는 것은 필드 경계를 모호하지 않게 하기 위해서다 — 구분자 없이 이으면
// `("ab","c")`와 `("a","bc")`가 같은 digest를 낸다.
function rowDigest(parts) {
  const o = isPlainObject(parts) ? parts : {};
  const fields = [
    typeof o.reviewedPlanHash === 'string' ? o.reviewedPlanHash : '',
    typeof o.perspective === 'string' ? o.perspective : '',
    typeof o.severity === 'string' ? o.severity : '',
    typeof o.claim === 'string' ? o.claim : '',
  ];
  return crypto.createHash('sha256').update(fields.join(NUL), 'utf8')
    .digest('hex').slice(0, DIGEST_HEX);
}

// 출력 계약은 정확히 4열이다. 경로 참조와 멱등 태그는 5번째 열이 아니라
// Finding 셀 **안에** 들어간다(DD4). 뒤 두 조각도 같은 셀이므로 이스케이프를
// 거친 값이거나(경로) 생성된 안전한 문자열(태그)이어야 한다.
function renderRow(row) {
  const o = isPlainObject(row) ? row : {};
  const finding = o.finding_cell + ' · 원문 ' + o.review_path + ' · id=' + o.digest;
  return '| ' + o.date + ' | ' + o.severity + ' | ' + o.plan_path + ' | ' + finding + ' |';
}

// ── 행 파생 (순수) ────────────────────────────────────────────────────────────
//
// deriveBacklogRows({decision, planPath, slug, today, repoRoot}) → rows[]
//
// `repoRoot`는 plan의 원래 서명에 없었으나 DD4가 요구한 repo-relative 정규화를
// 순수 함수가 계산할 수 없어 추가했다(L2 security R5 F1이 지목한 자기모순:
// appendRows는 repoRoot를 받는데 정작 렌더링하는 쪽이 못 받았다).
//
// 토글이 적용되지 않은 실행(= `single_pass_reason` 부재)은 **빈 배열**이다.
// 그 경우 지적은 원래의 비수렴 HALT로 저자가 흡수하므로 적재 대상이 아니다.
//
// `reviewed_plan_hash` 부재는 **throw**다. 5.2g2는 `single_pass_reason`이 있을
// 때만 실행되고 그 값을 싣는 유일한 생성자(decide.js:121 `mkSinglePass`)가 같은
// 호출에서 non-null proof를 함께 싣는다(decide.js:341). 그럼에도 부재하면
// 추론하지 않는다 — 다른 경로로 plan을 다시 해싱하면 리뷰어가 읽은 본문이
// 아니라 지금 디스크에 있는 본문의 해시가 되어, DD13이 봉인한 바인딩과 다른
// 값으로 digest를 키잉하게 된다.
function deriveBacklogRows(opts) {
  const o = isPlainObject(opts) ? opts : {};
  const decision = isPlainObject(o.decision) ? o.decision : null;
  if (!decision) {
    throw new Error('deriveBacklogRows: decision must be an object');
  }

  const reason = decision.single_pass_reason;
  if (typeof reason !== 'string' || reason.trim() === '') return [];

  const proof = isPlainObject(decision.review_proof) ? decision.review_proof : null;
  const reviewedPlanHash = proof && typeof proof.reviewed_plan_hash === 'string'
    ? proof.reviewed_plan_hash : '';
  if (reviewedPlanHash === '') {
    throw new Error('deriveBacklogRows: decision.review_proof.reviewed_plan_hash is absent — ' +
      'the idempotency digest may not be keyed by a re-derived hash (DD3)');
  }

  const quorum = isPlainObject(decision.quorum) ? decision.quorum : null;
  const findings = quorum ? quorum.blockingFindings : null;
  if (!Array.isArray(findings)) {
    throw new Error('deriveBacklogRows: decision.quorum.blockingFindings is not an array — ' +
      'the relaxed set is unreadable, so "no loss" cannot be asserted');
  }

  const repoRoot = typeof o.repoRoot === 'string' ? o.repoRoot : '';
  const planPath = normalizeRepoPath(o.planPath, repoRoot);
  const reviewPath = normalizeRepoPath(reviewRecordPath(o.slug), repoRoot);
  const today = (typeof o.today === 'string' && o.today.trim()) ? o.today.trim() : '';

  return findings.map(function (f) {
    const item = isPlainObject(f) ? f : {};
    const perspective = typeof item.perspective === 'string' ? item.perspective : '';
    const severity = typeof item.severity === 'string' && item.severity.trim()
      ? item.severity.trim() : 'UNKNOWN';
    // claim이 문자열이 아니어도 **적재한다**. 판독 불가는 그 자체가 기록할
    // 사실이고, 거르는 것은 유실이다.
    const claim = typeof item.claim === 'string' ? item.claim : '';
    const digest = rowDigest({
      reviewedPlanHash: reviewedPlanHash,
      perspective: perspective,
      severity: severity,
      claim: claim,
    });
    const label = perspective ? ('L2 ' + perspective + ': ') : 'L2: ';
    return {
      date: today,
      severity: severity,
      plan_path: planPath,
      review_path: reviewPath,
      digest: digest,
      perspective: perspective,
      claim: claim,
      finding_cell: escapeCell(label + (claim || '(claim 판독 불가 — 리뷰어가 본문을 싣지 않았다)')),
    };
  });
}

// 이미 적재된 행인지 판정한다. 앵커는 태그 뒤에 셀 종료(` · ` 없는 파이프)가
// 오는 형태다 — claim 안의 `id=`는 escapeCell이 이미 무력화했지만, 스캔 쪽도
// 느슨하게 두면 두 방어 중 하나만 남는다.
function hasDigest(body, digest) {
  const re = new RegExp('id=' + digest + '\\s*\\|');
  return re.test(body);
}

// ── 유일한 I/O ────────────────────────────────────────────────────────────────
//
// appendRows({repoRoot, rows}) → {appended, skipped_duplicate, rows}
//
// **전체 rewrite를 하지 않는다.** 중복 스캔은 read지만 쓰기는 `appendFileSync`
// 단일 호출이다(security C2/H8 흡수). backlog는 append-only 원장이므로
// read-modify-write가 애초에 불필요하고, 그것을 하지 않으면 동시 writer가
// 서로의 append를 덮어쓸 창 자체가 없다. 남는 것은 중복 1행의 가능성뿐이고,
// 그것은 유실이 아니며 아래 loud stderr로 관측된다.
//
// **어떤 경로에서도 기존 행을 지우거나 고치지 않는다** — 과거 행에는 이미
// 사람이 단 흡수 주석이 붙어 있다.
function appendRows(opts) {
  const o = isPlainObject(opts) ? opts : {};
  const repoRoot = typeof o.repoRoot === 'string' ? o.repoRoot : '';
  const rows = Array.isArray(o.rows) ? o.rows : [];
  if (repoRoot === '') throw new Error('appendRows: repoRoot is required');

  const target = backlogPath(repoRoot);
  let body;
  try {
    body = fs.readFileSync(target, 'utf8');
  } catch (e) {
    throw new Error('appendRows: cannot read the backlog at ' + target + ' (' +
      (e && e.code ? e.code : String(e)) + ') — 적재할 원장이 없으면 완화하지 않는다');
  }

  // 헤더가 없으면 append하지 않고 **실패한다**. 파서가 못 읽을 위치에 쓰는 것은
  // 적재가 아니다.
  const lines = body.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (HEADER_RE.test(lines[i])) { headerIdx = i; break; }
  }
  if (headerIdx === -1) {
    throw new Error('appendRows: the backlog at ' + target + ' has no ' +
      '`| Date | Severity | Source plan | Finding |` header row — derive/sources/backlog.js ' +
      'anchors the table on exactly that line, so anything appended without it is ' +
      'invisible to every consumer');
  }

  const fresh = [];
  let skippedDuplicate = 0;
  rows.forEach(function (r) {
    if (hasDigest(body, r.digest)) {
      skippedDuplicate += 1;
      // 조용한 skip은 digest 충돌과 정상 멱등을 구분할 수 없게 만든다.
      process.stderr.write('[mccp:backlog-append] skip duplicate id=' + r.digest +
        ' (' + r.severity + ' · ' + r.perspective + ') — 이미 적재된 지적이거나 ' +
        'digest 충돌이다\n');
      return;
    }
    fresh.push(r);
  });

  if (fresh.length === 0) {
    return { appended: 0, skipped_duplicate: skippedDuplicate, rows: [] };
  }

  // 파일이 개행으로 끝나지 않으면 새 행이 앞 행 끝에 붙어 한 행으로 읽힌다
  // (security H10). 마지막 바이트를 보고 필요할 때만 선행 개행을 넣는다.
  const needsLeadingNewline = body.length > 0 && !/\n$/.test(body);
  const chunk = (needsLeadingNewline ? '\n' : '') +
    fresh.map(renderRow).join('\n') + '\n';

  fs.appendFileSync(target, chunk, 'utf8');

  return {
    appended: fresh.length,
    skipped_duplicate: skippedDuplicate,
    rows: fresh.map(function (r) {
      return { digest: r.digest, severity: r.severity, perspective: r.perspective };
    }),
  };
}

module.exports = {
  deriveBacklogRows: deriveBacklogRows,
  appendRows: appendRows,
  escapeCell: escapeCell,
  rowDigest: rowDigest,
  renderRow: renderRow,
  normalizeRepoPath: normalizeRepoPath,
  backlogPath: backlogPath,
  HEADER_RE: HEADER_RE,
  CELL_MAX: CELL_MAX,
  OUTSIDE_REPO: OUTSIDE_REPO,
};
