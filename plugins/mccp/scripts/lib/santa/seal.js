'use strict';

// santa-loop-materialize M2 — 봉인(seal).
//
// 원장 집계 → 결정적 리포트 렌더 → review proof 구성 → receipt write.
// M2의 유일한 신규 모듈이고, 원장을 **변경하지 않는다**(DD5).
//
// ── 두 가지 구조적 선택 (둘 다 리뷰에서 유래) ──────────────────────────────
//
// 1) 원장은 **한 번만** 읽는다 (Implement-Codex R1 F1, HIGH).
//    `ledger.readReviewers`/`aggregate`는 각자 내부에서 `read()`를 부르므로,
//    라운드별로 나란히 부르면 N+2회 읽게 되고 읽기에는 lock이 없다. 그 사이 다른
//    CLI 호출이 mutate하면 라운드 메타·리뷰어 quorum·집계가 **동시에 존재한 적
//    없는** 조합이 되어, 감사 앵커가 실재하지 않은 상태를 영구 봉인한다.
//    그래서 `ledger.read()` 스냅샷 하나에서 `ledger.reviewersFrom` /
//    `ledger.aggregateFrom`(둘 다 순수)로 전부 파생한다. raw 소거는 여전히
//    ledger 모듈 안에서 일어나므로 UI4 이중 방어도 보존된다.
//
// 2) **파일 쓰기 2곳 모두** containment를 갖는다 (security-reviewer S1, MEDIUM).
//    plan은 리포트 경로만 `assertContained`로 봉인했다. proof도 같은 방식으로
//    `.claude/state/santa-loop` 안에 갇힌다 — SLUG_RE가 `.`·`/`를 배제하지만
//    디렉토리 검증은 2차 방어이고, 한쪽만 거는 것은 근거 없는 비대칭이다.
//
// cap의 출처는 **원장 state이지 env가 아니다**. `ledger.aggregateFrom`에
// `state.cap`을 명시 전달한다 — `aggregate(opts)`의 env 폴백을 타면 라운드를
// 실제로 게이트한 값과 다른 cap이 `santa_cap`에 실려 receipt가 원장을 오기한다.
//
// 종료(`exitReason`)는 cap과 **무관하게** 파생된다: `beginRound`가 거부된 시점에
// 남긴 마커에서만 나온다. 라운드 수로 되짚던 이전 방식은 캡 *도달*과 *거부*를
// 뭉개 마지막 허용 라운드의 수렴까지 divergent로 봉인했다(PR-Codex F1).
//
// 그리고 **마커는 관측이지 종료가 아니다**. 판정은 마커를 보지 않고 라운드에서만
// 나오며(`deriveVerdict`), 마커는 수렴하지 않은 원장에 한해 "왜 끝났는지"로
// 투영된다. 이 구분이 없으면 이미 수렴한 slug에 `/mccp:santa-loop`를 재진입하는
// 것만으로 — Step 3의 정상 캡 거부가 마커를 쓰므로 — converged receipt가
// divergent로 덮인다(code-review H1).

const fs = require('fs');
const path = require('path');

const ledger = require('./ledger');
const { assertContained } = require('../path-containment');
const { SLUG_RE } = require('../../receipt/decision');
const { gitRepoRoot, planAwareMarkdownHash } = require('../../receipt/hash');
const { write } = require('../../receipt/write');

const GATE_ID = 'mccp-santa-review';
const REVIEW_SOURCE = 'multi-agent';

// 라운드 표를 몇 행까지 펼칠지. 4행 이상이면 상위 3행 + <details> collapse
// (design critique H4). cap이 최대 10이라 표가 10행이 될 수 있다.
const ROUND_TABLE_EXPANDED = 3;

class SantaSealError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SantaSealError';
    // `SANTA_` 접두는 우연이 아니다 — cli.js의 catch-all이 그 접두를 보고
    // EX_USAGE(2)로 매핑한다. 신규 exit code는 만들지 않는다.
    this.code = code;
  }
}

// ── 순수 1: 투영 (raw 소거 경계) ─────────────────────────────────────────────
//
// `state.rounds[].reviewers[]`의 원소는 `{envelope, raw}`이고 `raw`에는
// `checks`·`suggestions` 전문이 들어 있다. `.claude/reviews/`는 git-tracked이므로
// 그것이 한 번이라도 새면 리뷰어 전문이 영구 커밋된다. 그래서 렌더러에 state를
// 통째로 넘기지 않고 여기서 먼저 투영한다 — renderReport는 `raw`를 실을 인자가 없다.
function project(state) {
  const rounds = (state && Array.isArray(state.rounds)) ? state.rounds : [];
  return {
    rounds: rounds.map(function (r, i) {
      return {
        index: Number.isInteger(r.index) ? r.index : i,
        started_at: r.started_at || null,
        verdict: r.verdict === undefined ? null : r.verdict,
        reviewers: ledger.reviewersFrom(state, i).map(function (e) {
          return {
            id: e.id,
            model: e.model,
            verdict: e.verdict,
            criticalIssueCount: Array.isArray(e.criticalIssues) ? e.criticalIssues.length : 0,
          };
        }),
      };
    }),
  };
}

function distinctIds(round) {
  const seen = [];
  ((round && round.reviewers) || []).forEach(function (r) {
    if (seen.indexOf(r.id) === -1) seen.push(r.id);
  });
  return seen;
}

// ── 판정 ─────────────────────────────────────────────────────────────────────
//
// converged는 좁다: FINAL 라운드가 NICE이고, distinct id가 2 이상일 때만이다.
//
// **전원 PASS 절은 santa-adjudication M1에서 제거됐다**(code-review H1). M1이 판정
// 입력을 리뷰어의 `verdict` 문자열에서 병합·중복제거된 blocking 건수로 옮겼으므로
// (`gate.decideAdjudicatedVerdict`의 완화), MEDIUM만 낸 `FAIL`은 라운드를 NICE로
// 두는 것이 **설계된 결과**다. 그런데 이 함수는 그 리뷰어를 이유로 divergent를 냈다.
// 실측: 라운드 verdict=NICE인데 봉인이 divergent → Step 5.5가 `exit 1`로 push를
// 막고, git-tracked receipt에 divergent가 실리고, `fix-task.md`에
// `divergent_unresolved` 에스컬레이션까지 남았다. M1의 1순위 경로가 end-to-end로
// 도달 불가였다는 뜻이다.
//
// **"더 엄격한 쪽이 이긴다"는 두 층이 같은 질문에 답할 때만 미덕이다.** 리뷰어의
// `verdict` 문자열은 이제 어느 층에서도 판정 입력이 아니므로, 그것을 다시 게이트하는
// 봉인은 엄격한 것이 아니라 **다른 질문에 답하면서 게이트를 반박**하는 것이다.
// 그 축의 판정은 `rounds[fin].verdict`가 이미 담고 있다(그 값이 곧 완화를 포함한
// 게이트의 결론이다). 남는 `distinctIds >= 2`는 폐기하지 않는다 — 그것은 게이트와
// **같은 질문**을 독립적으로 한 번 더 세는 교차 검사이고, 두 값이 갈리면 즉시 red가
// 되는 것이 DD8이 감수한 대가의 대가다.
//
// **거부 마커는 여기 입력이 아니다.** 마커는 "거부가 관측됐다"는 사실이고 판정이
// 필요로 하는 것은 "루프가 수렴 없이 끝났는가"인데, 둘은 갈린다 — 이미 수렴해
// 봉인된 slug에서 `/mccp:santa-loop`를 다시 돌리면 Step 3의 `begin-round`가 캡에서
// 정상 거부되고, 그 거부가 마커를 쓴다. 마커를 판정에 먹이면 그 재진입 하나가
// **이미 converged로 봉인된 receipt를 divergent로 덮어쓴다**(F1이 산술로 만들던
// 오봉인을 마커로 재현하는 것이다).
//
// 마커를 빼도 구멍이 생기지 않는다: 진짜 캡 소진은 반드시 non-NICE 최종 라운드로
// 끝난다. NICE는 루프의 종료 조건이라 그 뒤로 라운드를 열 일이 없고, 거부는 항상
// FINAL 라운드 뒤에만 온다(마지막이 OPEN이면 `beginRound`는 멱등 반환이라
// `decideRound`에 닿지도 않는다). 따라서 종료를 만든 거부는 예외 없이 아래
// `fin.verdict !== 'NICE'` 절이 잡는다. 마커의 몫은 판정이 아니라 **왜 끝났는지**를
// receipt에 적는 것이고, 그 투영은 `seal()`이 한다.
//
// distinct id < 2에서 converged를 막는 것은 P1의 lifecycle 검사를
// 앞당기는 것이 아니라 — 중복 record를 거부하지도 판정을 바꾸지도 않는다 —
// **원장이 보여주지 않는 다양성을 receipt가 주장하지 않게** 하는 것뿐이다.
function deriveVerdict(projection) {
  const rounds = projection.rounds;
  if (rounds.length === 0) return 'divergent';
  const fin = rounds[rounds.length - 1];
  if (fin.verdict !== 'NICE') return 'divergent';
  if (distinctIds(fin).length < 2) return 'divergent';
  return 'converged';
}

// ── 순수 2: 리포트 렌더 ──────────────────────────────────────────────────────
//
// heading depth <= 3 (design critique H1) — `####` 이상을 만들지 않는다.
// /mccp:prp-implement Phase 3.7의 produced-diff grounding lint가 같은 앵커를
// 정적으로 걸므로, 여기서 지키지 않으면 implement 단계에서 hard-block된다.
//
// **집계 수준만 담는다**(UI4). 리뷰어 raw 본문과 critical issue 텍스트는 담지
// 않는다 — 담을 인자가 없다. 운영자용 issue 텍스트는 Step 5 ESCALATION 블록이
// 터미널에 출력한다.
function renderReport(projection, scalars) {
  const s = scalars || {};
  const agg = s.aggregate || {};
  const L = [];

  L.push('# santa-loop review — ' + s.decisionId);
  L.push('');
  L.push('- verdict: `' + s.verdict + '`');
  L.push('- rounds: ' + (agg.rounds === undefined ? 0 : agg.rounds) +
    ' / cap ' + (s.cap === null || s.cap === undefined ? '(unset)' : s.cap));
  L.push('- entries: ' + (agg.entries === undefined ? 0 : agg.entries));
  L.push('- exit reason: ' + (agg.exitReason ? '`' + agg.exitReason + '`' : '(none)'));
  L.push('');
  L.push('> 집계 전용 리포트다. 리뷰어 제출 본문(`checks`/`suggestions`)과 critical');
  L.push('> issue 텍스트는 원장에만 있고 여기에는 실리지 않는다 (UI4).');
  L.push('');

  L.push('## Rounds');
  L.push('');
  const rows = projection.rounds.map(function (r) {
    const who = r.reviewers.length === 0
      ? '(none)'
      : r.reviewers.map(function (x) {
        return x.id + '/' + x.model + ' ' + x.verdict + ' (' + x.criticalIssueCount + ' critical)';
      }).join(' · ');
    return '| ' + r.index + ' | ' + (r.started_at || '(unknown)') + ' | ' +
      (r.verdict === null ? 'OPEN' : r.verdict) + ' | ' + who + ' |';
  });

  const header = ['| # | started | verdict | reviewers |', '|---|---|---|---|'];
  if (rows.length === 0) {
    L.push('라운드가 없다 — 원장에 기록된 라운드가 0건이다.');
  } else if (rows.length <= ROUND_TABLE_EXPANDED) {
    L.push.apply(L, header.concat(rows));
  } else {
    // 상위 3행만 펼치고 나머지는 접는다 (H4). cap 최대 10이라 표가 길어질 수 있다.
    L.push.apply(L, header.concat(rows.slice(0, ROUND_TABLE_EXPANDED)));
    L.push('');
    L.push('<details><summary>+' + (rows.length - ROUND_TABLE_EXPANDED) + ' more</summary>');
    L.push('');
    L.push.apply(L, header.concat(rows.slice(ROUND_TABLE_EXPANDED)));
    L.push('');
    L.push('</details>');
  }
  L.push('');
  return L.join('\n') + '\n';
}

// ── 순수 3: proof 구성 ───────────────────────────────────────────────────────
//
// DD3 층 매핑. quorum은 **상수가 아니라** FINAL 라운드의 distinct `envelope.id`에서
// 파생한다 — M1이 판정 lifecycle 검사(`{A,B}` 완전성·id 중복 거부)를 P1으로
// 이연했으므로 `record --id A`를 두 번 넣은 라운드가 실재할 수 있고, 거기서
// `{2,2,2,2}`를 그대로 찍으면 receipt가 있지도 않은 모델 다양성을 주장하게 된다.
//
// `layers.l1`은 divergent 경로에서 두 값으로 갈린다. l1의 santa 의미는 "M1의
// 기계 게이트가 이 라운드를 승인했다"이므로, 캡 도달(= begin-round가 거부)에서
// 'converged'를 찍으면 승인하지 않은 게이트가 승인했다고 주장하는 것이 된다.
// `exitReason` 인자는 `seal()`이 투영한 **종료 사유**이지 거부 관측 원본이
// 아니다 — 수렴한 원장에는 null이 오므로 재진입 거부가 l1을 뒤집지 못한다.
// schema는 converged일 때만 층을 게이트하므로 이 구분은 강제되지 않는 정직성
// 축이고, 그래서 test가 유일한 강제다.
function buildProof(input) {
  const o = input || {};
  const projection = o.projection || { rounds: [] };
  const verdict = o.verdict;
  // santa-adjudication M3 — 술어 일반화. **의미 변경이 아니라 부족한 인코딩의
  // 교정이다.** 종료 사유가 `cap_reached` 하나뿐이던 동안 `=== 'cap_reached'`와
  // `!== null`은 같은 술어였고, M3의 `patch_chasing`이 그 둘을 처음으로 가른다.
  // 일반화하지 않으면 patch-chasing 종료가 `l1: 'converged'`로 봉인된다 — 최종
  // 라운드가 NAUGHTY인데 M1 게이트가 그 라운드를 승인했다고 receipt가 적는 것이고,
  // 바로 아래 주석이 막겠다고 쓴 상태다.
  const terminatedWithoutConvergence = o.exitReason !== null && o.exitReason !== undefined;
  const fin = projection.rounds.length
    ? projection.rounds[projection.rounds.length - 1]
    : null;

  const ids = distinctIds(fin);
  const responded = ids.length;
  // `allPass`는 `deriveVerdict`와 **같은 이유로** 빠졌다(code-review H1). 여기서는
  // 결과가 더 조용했다: `review-verdict.js:126`이 `quorum.passed !== true`인 proof를
  // 구조적으로 무효로 보므로, 완화로 converged가 된 라운드는 `verdict:'converged'` +
  // `passed:false`라는 **자기모순 proof**를 만들었다. `passed`가 답해야 하는 질문은
  // "이 판정이 정족수를 갖췄는가"이지 "리뷰어들이 무슨 문자열을 냈는가"가 아니다.
  const passed = verdict === 'converged' && responded >= 2;

  return {
    layers: {
      l1: terminatedWithoutConvergence || projection.rounds.length === 0 ? 'divergent' : 'converged',
      l2: verdict === 'converged' ? 'converged' : 'divergent',
      l3: null,
    },
    verification_verdict: verdict,
    quorum: {
      passed: passed,
      required: 2,
      of: 2,
      responded: responded,
      roles: responded,
    },
    perspectives: ids.map(function (id) { return { perspective: id }; }),
    dispatch_evidence: [o.reportRelPath],
    reviewed_plan_hash: o.reportHash,
  };
}

// ── I/O ──────────────────────────────────────────────────────────────────────

function repoRootOrThrow(cwd) {
  const root = gitRepoRoot(cwd || process.cwd());
  if (!root) {
    throw new SantaSealError('SANTA_NO_REPO_ROOT',
      'could not resolve a git repo root from ' + cwd);
  }
  return root;
}

// tmp + rename. tmp 이름에 pid + nonce를 넣는 이유는 동시 writer가 tmp에서
// 충돌하지 않게 하기 위해서다(고정 이름이면 서로를 덮어쓴다).
function writeAtomic(target, text) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = target + '.' + process.pid + '.' +
    Math.floor(Math.random() * 1e9).toString(36) + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, target);
}

// generic slug 2종은 거부하되 **사유가 다르므로 메시지도 다르다**. 뭉뚱그리면
// 운영자가 받는 진단이 틀린다.
function rejectGenericSlug(decisionId) {
  if (decisionId === 'default') {
    throw new SantaSealError('SANTA_SEAL_GENERIC_SLUG',
      'decision slug is "default" — that is the fallback ledger.js uses when neither an ' +
      'explicit --decision nor a branch could be resolved, i.e. the review scope is UNKNOWN. ' +
      'Sealing an audit anchor in that state would be dishonest. Pass --decision <slug>.');
  }
  if (decisionId === 'main') {
    throw new SantaSealError('SANTA_SEAL_GENERIC_SLUG',
      'decision slug is "main" — a legitimately derived branch slug, but it collides with the ' +
      'generic receipt namespace that store.js#listGenericReceipts quarantines ({default, main} ' +
      'x GATE_IDS). The quarantine marker is gitignored, so a fresh worktree runs the migration ' +
      'once and this receipt would be renamed aside as .legacy.json. Pass --decision <slug> to ' +
      'pin the scope. (CLAUDE.md §3.5 already forbids pushing from main, so this is off-policy ' +
      'anyway — but the flag clears it immediately.)');
  }
}

// seal(opts) → { reportPath, proofPath, receiptPath, verdict, aggregate }
//
// 순서가 계약이다: slug 검증이 **경로 조립보다 먼저**이고, 리포트 write가 hash보다
// 먼저이며, receipt write가 마지막이다.
function seal(opts) {
  const o = opts || {};
  const cwd = o.cwd || process.cwd();
  const decisionId = o.decisionId;

  // (1) slug — 경로 조립 이전.
  if (typeof decisionId !== 'string' || !SLUG_RE.test(decisionId)) {
    throw new SantaSealError('SANTA_SEAL_BAD_SLUG',
      'decision slug must match ' + SLUG_RE + '; got ' + JSON.stringify(decisionId));
  }
  rejectGenericSlug(decisionId);

  const repoRoot = repoRootOrThrow(cwd);

  // (2) 원장 스냅샷 **1회**. 이후 모든 파생은 이 객체에서만 나온다.
  const state = ledger.read(o);
  const projection = project(state);

  // (3) 집계 — cap은 state에서. env 폴백을 타면 receipt가 원장을 오기한다.
  const rawAgg = ledger.aggregateFrom(state, state.cap);
  const verdict = deriveVerdict(projection);

  // 거부 관측 → **종료 사유**로의 투영. 수렴한 원장은 캡이 끝낸 것이 아니므로
  // (수렴 뒤에 온 거부는 닫힌 루프에 대한 재진입이다) 그 사실을 종료로 적지
  // 않는다. `santa_exit_reason`의 계약이 "루프가 캡에 의해 종료됐다"이고
  // (`schema.js` — 부재 = 캡이 끝내지 않았다), 관측 원본은 원장이 그대로 갖는다.
  const agg = Object.assign({}, rawAgg, {
    exitReason: verdict === 'converged' ? null : rawAgg.exitReason,
  });

  // (4) 리포트 write (containment 봉인).
  //     두 방어가 서로 다른 것을 막는다. **파일명**은 SLUG_RE가 이미 안전하게
  //     만들었다 — `^[a-z0-9][a-z0-9-]{0,80}$`는 `.`과 `/`를 아예 배제하므로
  //     조립된 이름이 디렉토리를 벗어날 수 없고, 그 검증은 (1)에서 경로 조립보다
  //     **먼저** 끝났다. `assertContained`가 막는 것은 그게 아니라 **심볼릭 링크
  //     탈출**이다(모듈 계약: realpath-anchored containment). 그래서 대상은
  //     파일이 아니라 **디렉토리**이고 gate는 그 부모다 — ledger.js의
  //     `ensureStateDir`와 동형이다. 파일을 대상으로 삼을 수도 없다:
  //     `assertContained`는 realpath를 쓰므로 아직 없는 파일에는 걸 수 없다.
  const reportRel = path.posix.join('.claude', 'reviews', 'santa-review-' + decisionId + '.md');
  const reviewsDir = path.join(repoRoot, '.claude', 'reviews');
  fs.mkdirSync(reviewsDir, { recursive: true });
  assertContained(ledger.canonicalPath(reviewsDir),
    ledger.canonicalPath(path.join(repoRoot, '.claude')), null);
  const reportAbs = path.join(reviewsDir, 'santa-review-' + decisionId + '.md');
  writeAtomic(reportAbs, renderReport(projection, {
    decisionId: decisionId, cap: state.cap, aggregate: agg, verdict: verdict,
  }));

  // (5) 리포트 해시 — write.js가 plan_hash를 계산할 때와 **같은 함수, 같은 입력**
  //     (디스크에서 되읽는다). 메모리 문자열을 따로 해시하면 정규화 경로가 갈릴
  //     여지가 생기는데, 되읽으면 그 질문 자체가 사라진다.
  const reportHash = planAwareMarkdownHash(reportAbs);

  // (6) proof write (containment 봉인 — security-reviewer S1).
  const proofDir = path.join(repoRoot, '.claude', 'state', 'santa-loop');
  fs.mkdirSync(proofDir, { recursive: true });
  assertContained(ledger.canonicalPath(proofDir),
    ledger.canonicalPath(path.join(repoRoot, '.claude', 'state')), null);
  const proofAbs = path.join(proofDir, decisionId + '.proof.json');
  const proof = buildProof({
    reportRelPath: reportRel,
    reportHash: reportHash,
    projection: projection,
    verdict: verdict,
    exitReason: agg.exitReason,
  });
  writeAtomic(proofAbs, JSON.stringify(proof, null, 2) + '\n');

  // (7) receipt. `intentDecision`은 전달하지 않는다 — write.js의
  //     INTENT_IN_SCOPE_GATES는 mccp-plan-codex뿐이라 out-of-scope로 throw한다.
  //     경로는 전부 **repoRoot 기준 상대**이고 `cwd: repoRoot`를 함께 넘긴다 —
  //     write.js는 `args.cwd || process.cwd()`로 해석하므로, cwd를 넘기지 않으면
  //     프로세스가 어디서 실행됐는지에 따라 같은 인자가 다른 파일을 가리킨다.
  const proofRel = path.relative(repoRoot, proofAbs).split(path.sep).join('/');
  const writeArgs = {
    gate: GATE_ID,
    decision: decisionId,
    cwd: repoRoot,
    plan: reportRel,
    'review-verdict': verdict,
    'review-source': REVIEW_SOURCE,
    'review-proof-file': proofRel,
    'santa-rounds': agg.rounds,
    'santa-entries': agg.entries,
    quiet: true,
  };
  if (Number.isInteger(state.cap)) writeArgs['santa-cap'] = state.cap;
  if (agg.exitReason) writeArgs['santa-exit-reason'] = agg.exitReason;

  const receipt = write(writeArgs);

  return {
    reportPath: reportRel,
    proofPath: proofRel,
    receiptPath: receipt.path || null,
    verdict: verdict,
    aggregate: agg,
  };
}

module.exports = {
  project: project,
  renderReport: renderReport,
  buildProof: buildProof,
  deriveVerdict: deriveVerdict,
  seal: seal,
  SantaSealError: SantaSealError,
  GATE_ID: GATE_ID,
};
