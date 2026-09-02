'use strict';

// diverse-agent-review M11 — 승인 레코드 dossier 결속 오라클.
//
// #8이 답한 것은 "승인이 발급되는가"였고 답은 예였다 — converged 5건. 그 답이
// 생기자마자 이전에는 성립하지 않던 질문이 성립한다: **그 승인은 옳았는가.**
//
// 이 도구는 그 질문에 답하지 **않는다.** M8이 세운 분업을 그대로 쓴다 — 도구는
// 세고 결속하며, 판정은 문서가 한다(DN2). 출력은 verdict가 아니라 레코드별
// **dossier**다: 앵커 검증 · 채널별 존재 여부 · 조인된 증거 행의 축자 인용과 출처.
// "false-approve" 판정 분기를 넣으면 그 분기의 임계가 곧 날조된 임계다(UI9).
//
// read-only · LLM-free · fs + child_process(git) 외 의존 없음. 게이트 경로를 한
// 줄도 건드리지 않는다(UI5): `cli.js` 하위 subcommand가 아니라 `evidence-audit.js`
// 선례대로 standalone이다.
//
// ── 미탐의 정의는 세 관문의 논리곱이다 (DN1) ─────────────────────────────────
//
//   G1 앵커     — 결함이 **리뷰된 본문**에 실재하는가. 승인 이후에 생긴 것은
//                 미탐이 아니다.
//   G2 사거리   — 그 실행에서 **실제로 발화한 관점**의 렌즈 안인가. 아무도 보지
//                 않기로 한 축은 놓친 것이 아니다.
//   G3 독립 기록 — 승인 시각 **이후에** 패널 아닌 생산자가 남긴 기록에 적혀 있는가.
//                 감사자의 의견은 증거가 아니다.
//
// G3이 무게중심이다. 감사자가 지금 plan을 읽어 "여기 결함이 있다"고 적으면 그것은
// 같은 모델이 같은 본문을 다시 읽은 것이고, PRD가 High로 지목한 작성자=리뷰어
// blind spot을 감사 층에서 재현하는 것이다. 이 도구는 G1·G3의 **기계적 부분**만
// 결속하고(앵커 복구 · 시각 순서), G2와 "이 서술이 정말 결함인가"는 산문이므로
// 문서가 판정한다.
//
// ── 승인 판정의 정본은 레코드다. ship receipt는 증인일 뿐이다 ────────────────
//
// plan L2 architect/HIGH가 정확히 지적한 것: 승인 verdict는 `.claude/reviews/`에서
// 오고 증거는 `.claude/receipts/mccp-pr-codex/`에서 온다 — 둘이 어긋나면 무엇이
// 이기는가. 답: **레코드가 이긴다.** `corpus.js#aggregate`가 내린
// `verdict==='converged'`를 이 도구는 재계산하지 않는다(두 판정이 갈라지면 어느
// 쪽이 계약인지 알 수 없게 된다). ship receipt가 어긋나면 판정이 바뀌는 것이
// 아니라 `proof_backing`이 `uncorroborated`로 떨어지고 state가 `degraded`가 된다.
//
// ── 이름으로 결속하지 않는다 (Implement-Codex R1 F1) ─────────────────────────
//
// 이 코퍼스에 **실재하는** 함정이다(가설이 아니다). 레코드
// `plan-review-impeccable-detection-contract.md`의 `plan_path`는
// `.claude/plans/impeccable-detection-contract-m6.plan.md`인데, 레코드 파일명에서
// slug를 뽑으면 `impeccable-detection-contract`가 되고 그 이름의 ship receipt는
// **존재한다** — 다만 그 receipt의 `plan_hash`(`sha256:c7d1d27d…`)는 이 레코드의
// `reviewed_plan_hash`(`sha256:887fc89d…`)와 다르고 애초에 **다른 plan의 봉인**이다.
// 이름으로 결속하면 다른 plan의 `findings`가 이 승인의 "승인 후 증거"로 계수된다.
//
// 그래서 ship receipt 귀속은 이름이 아니라 **해시**로 한다: 전 ship receipt를
// `plan_hash`로 색인하고 레코드의 `reviewed_plan_hash`와 일치하는 것만 증인으로
// 인정한다(`attribution:'hash_proven'`). 나머지 채널(report·backlog·downstream)은
// 해시가 없어 원리상 slug 귀속뿐이므로 `attribution:'slug_claimed'`로 **표기**하고,
// 그 부정확성을 산출 문서가 그대로 적는다. 표기하지 않으면 증명된 결속과 주장된
// 결속이 한 칸에 섞인다.
//
// ── 구조적 0을 관측으로 착각하지 않는다 (DN3) ───────────────────────────────
//
// cross-model 채널(`pr_codex`)은 이 코퍼스에서 전건 비어 있고, 그 이유는 Codex가
// 결함을 못 찾아서가 아니라 **애초에 발화하지 않았기 때문**이다 — receipt 자신이
// `meta.codex_disabled=true` · `resolution.codex_verdict='skipped'` · `findings=[]`로
// 그렇게 적고 있다. 그 채널은 `structurally_empty`로 **명시 보고**되고 어떤
// 카운터에도 0으로 기여하지 않는다.
//
// plan L2 architect/HIGH가 여기에 반론했다 — "전건 `structurally_empty`면 상시
// 켜진 상수라 DN3 자기 원칙(항상 켜진 신호는 정보를 나르지 않는다)과 모순이다".
// 범주가 다르다: 그 원칙은 **state 승격**에 대한 것이지 **보고**에 대한 것이 아니다.
// `structurally_empty`는 state를 바꾸지 않는 보고이고, 그 보고가 없으면 0이
// 관측으로 오독된다 — DN3이 막으려는 바로 그것이다. 다만 지적의 실질은 옳으므로
// 그 사실 자체가 출력에 실린다(`channel_summary.<name>.can_ground_absence`): 한
// 레코드도 `present`를 내지 않은 채널은 **보지 않은 것**이지 보고 없었던 것이
// 아니므로 "미탐 없음"의 근거가 될 수 없다.
//
// ── 경로는 파일시스템에 닿기 전에 검증한다 (DN13 + security-reviewer C1·C2·H1) ─
//
// `measurement.plan_path`는 마크다운에서 파싱한 **신뢰되지 않은 입력**이고 앵커
// 재계산은 그것을 `path.resolve` → `readFileSync` → `git`으로 넘긴다. 형제 축인
// `review_proof.dispatch_evidence[]`는 이미 `isRepoRelativeEvidencePath`로 검증되는데
// 이쪽만 무검증인 것은 비대칭이며 기댈 근거가 없다.
//
// 정본 validator를 **재사용하되 재구현하지 않는다**(두 개가 갈라지는 순간 어느
// 쪽이 계약인지 알 수 없다). 그러나 정본만으로는 부족하다는 것이 실측이다:
//
//   isRepoRelativeEvidencePath('--all')  → true   ← git 옵션 주입
//   isRepoRelativeEvidencePath('-n')     → true
//   isRepoRelativeEvidencePath('CON')    → true   ← win32에서 읽으면 stdin 대기 정지
//
// 배열 인자(`execFileSync`)는 **셸** 주입만 막지 프로그램의 옵션 파싱은 못 막는다.
// 그래서 이 도구는 정본 위에 자기 층 셋을 얹는다 — 선행 대시 거부 · Windows 예약
// 장치명 거부 · `realpathSync` 봉쇄(읽기 **전에**) — 그리고 모든 git 호출에 `--`
// 구분자를 쓴다. 정본 자신의 구멍은 `dispatch_evidence[]`에도 열려 있지만 그
// 파일은 게이트 경로 소유물이라(UI5 · Validation 8) 이 milestone이 고치지 않고
// 원장으로 이연했다.
//
// 순서가 계약이다: **거부는 읽기 전에 일어난다.** 읽고 나서 판정하면 검증이
// 아무것도 막지 못한다. 그래서 경로 판정은 순수 함수(`auditPathVerdict`)이고
// I/O는 주입된 `io` 객체를 통해서만 일어난다 — test가 io 스텁으로 호출 0회를
// 단언할 수 있는 것이 이 분리의 목적이다.
//
// ── 승인 수용은 corpus 판정 ∧ 레코드 자기 정합 (Implement-Codex R1 F2) ───────
//
// `corpus.js`가 이미 top-level verdict를 `converged`로 분류했다는 이유로 그
// 레코드를 무조건 표본에 넣으면, `Verdict: converged`인데 자기 `## Measurement`의
// `quorum.passed=false`인 레코드도 승인으로 남는다 — 자기 측정이 부인하는 승인이다.
// 그래서 **추가 관문**을 둔다(재계산이 아니라 관문이다): 모순 레코드는 표본에서
// 빠지고 `quorum_contradiction`으로 보고되며 state를 `degraded`로 만든다.
//
// ── state precedence ladder (evidence-audit.js · corpus.js 미러) ─────────────
//
//   degraded (exit 1) — 소스 read 실패(hard) · 파싱 실패 · `proof_backing`이
//                       `corroborated`가 아닌 레코드 ≥1 · quorum 모순 ≥1.
//   blind    (exit 2) — 승인 레코드 0건. **부재는 결함 부재가 아니다.** 이때
//                       어떤 카운터도 보고하지 않는다.
//   ok       (exit 0) — 승인 ≥1이고 위 어느 것도 아니다.
//
// `unauditable`(본문 복구 불가 · 경로 거부 · 시각 부재)은 `degraded`로 만들지
// **않는다** — 그것은 고장이 아니라 코퍼스의 경계이고, 넣으면 항상 켜진다
// (`corpus.js:44-52`가 `pre_measurement`에 대해 내린 것과 같은 판단). `durability`의
// `untracked`도 같은 이유로 state를 바꾸지 않고 보고만 한다.
//
// 반대로 `uncorroborated`를 `degraded`로 올리는 것은 DN15의 요구다: 사라진
// plan-gate receipt를 대신할 유일한 독립 증인이 그것이므로, 증인이 없는데 `ok`를
// 보고하면 검증 불가한 증거 위에서 통과하는 것이다. 이 신호가 상수가 아님은
// 실측이 보증한다 — 승인 5건 중 4건이 해시 일치, 1건이 receipt 부재다.
//
// ── 임계값·비율을 갖지 않는다 (DN8 · DN11 · UI9) ────────────────────────────
//
// 표본은 5(감사 가능한 것은 그보다 적다)이고, 재실행 덮어쓰기(O3) 생존 편향의
// 방향이 불분명하며, 코퍼스 커버리지는 하한이다. "false-approve 비율"은 PRD
// Open Questions의 표현이지 이 도구가 산출할 수 있는 양이 아니며, 그 사실 자체가
// 산출물의 일부다. 관측 빈도로 적고 확률로 부르지 않는다.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const corpus = require('./corpus');
const { isRepoRelativeEvidencePath } = require('../review-verdict');
const { receiptIntegrityOk } = require('../evidence-audit');
const {
  sha256,
  canonicalizeMarkdown,
  canonicalizeMarkdownStructural,
  isPlanPath,
} = require('../../receipt/hash');

const STATE_EXIT_CODES = Object.freeze({
  ok: 0,
  degraded: 1,
  blind: 2,
});

function exitCodeForState(state) {
  const code = STATE_EXIT_CODES[state];
  return typeof code === 'number' ? code : 1;
}

// ── 한도 (security-reviewer C3 · Implement-Codex R1 F3) ──────────────────────
//
// 상한 자체는 편의가 아니라 **종료성 요건**이다. 그러나 상한을 두면 새 실패 모드가
// 생긴다 — 상한 소진과 진짜 부재가 같은 `unrecoverable`로 접히면 오래된 승인이
// 조용히 감사 불가가 된다. 그래서 소진은 `history_limit_exhausted`로 **구분해
// 보고**한다. 상한의 설정 가능성(CLI 플래그·env)은 표면 확대라 원장으로 이연했다.
const MAX_HISTORY_REVS = 200;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;
const GIT_TIMEOUT_MS = 30000;

const SHIP_RECEIPT_DIR = path.join('.claude', 'receipts', 'mccp-pr-codex');
const REPORT_DIR = path.join('.claude', 'PRPs', 'reports');
const BACKLOG_PATH = path.join('.claude', 'plans', 'codex-findings-backlog.md');
const REVIEW_DIR = path.join('.claude', 'reviews');
const ARCHIVED_PLAN_DIR = path.join('.claude', 'PRPs', 'plans', 'archived');

// 보고서에서 잘라내는 절. heading 리터럴 매칭이며 다음 `## `까지가 한 절이다.
// 접두사 매칭인 이유는 실측 — `## Code-review 흡수 (ship 직전, 2026-08-24)`처럼
// 제목에 날짜가 붙는다.
const REPORT_EVIDENCE_HEADINGS = Object.freeze([
  '## Deviations from Plan',
  '## Issues Encountered',
  '## Code-review',
  '## 미충족',
]);

// ── 경로 관문 (순수) ─────────────────────────────────────────────────────────

// win32 예약 장치명. 확장자가 붙어도 장치로 해소되므로 stem으로 검사한다.
const WIN_RESERVED_RE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;

// auditPathVerdict(p) → { ok, reason }
//
// 정본 `isRepoRelativeEvidencePath`를 재사용하고 그 위에 두 층을 얹는다. **순수
// 함수다** — 어떤 I/O도 하지 않으므로 호출자는 이 판정을 읽기 **전에** 낼 수 있고,
// test는 거부 입력에서 읽기 호출 0회를 단언할 수 있다.
function auditPathVerdict(p) {
  if (!isRepoRelativeEvidencePath(p)) {
    return { ok: false, reason: 'not_repo_relative' };
  }
  const segments = String(p).split('/');
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    // 선행 대시는 git/CLI가 **옵션으로** 파싱한다. 배열 인자는 셸 주입만 막지
    // 프로그램의 옵션 파싱은 못 막으므로 `--` 구분자와 함께 이중으로 막는다.
    if (seg.charAt(0) === '-') {
      return { ok: false, reason: 'leading_dash_segment' };
    }
    const stem = seg.split('.')[0];
    if (WIN_RESERVED_RE.test(stem)) {
      return { ok: false, reason: 'windows_reserved_name' };
    }
  }
  return { ok: true, reason: null };
}

// ── 시각 (순수) ──────────────────────────────────────────────────────────────

// `record.js`가 `toISOString()`으로 쓰므로 정상 레코드는 전부 통과한다.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

// parseIsoStrict(s) → ms | null
//
// `Date.parse` 단독을 쓰지 않는다 — `'Mon Aug 26 2026'`·`'2026-8-16'` 같은 비-ISO
// 문자열도 유효한 수를 돌려주므로 관대한 파서는 형식이 어긋난 시각을 조용히
// 받아들이고 G3의 순서 비교가 엉뚱한 값 위에서 성립한다.
//
// 형식 검사만으로도 부족하다(security-reviewer H2): `2026-02-30T00:00:00Z`는 위
// 정규식을 통과하고 `Date.parse`는 3월 2일을 준다. 그래서 파싱 뒤 `toISOString()`
// 왕복으로 강제 변환을 잡는다. G3의 시간축이 `miss`와 `post_approval`을 가르므로
// 조용한 날짜 이동은 판정을 뒤집는다.
function parseIsoStrict(s) {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  const round = new Date(ms).toISOString();
  // 왕복 대조는 UTC 정규형끼리 비교한다 — 오프셋 표기(`+09:00`)는 정상이므로
  // 문자열 동일성이 아니라 **같은 순간**인지를 본다.
  if (Date.parse(round) !== ms) return null;
  // 강제 변환 탐지: 입력의 날짜 성분이 정규형과 달라졌다면 존재하지 않는 날짜다.
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(s);
  const u = new Date(ms);
  if (/(Z)$/.test(s) && m) {
    if (Number(m[1]) !== u.getUTCFullYear()
      || Number(m[2]) !== u.getUTCMonth() + 1
      || Number(m[3]) !== u.getUTCDate()) {
      return null;
    }
  }
  return ms;
}

// ── 레코드 자기 정합 (순수) ──────────────────────────────────────────────────

// checkQuorumConsistency(measurement) → { ok, reason }
//
// `corpus.js`의 승인 판정을 **재계산하지 않는다**. 그 레코드 자신의 측정이 승인과
// 모순되는지만 본다 — 모순이면 자기 측정이 부인하는 승인이므로 표본에서 뺀다.
function checkQuorumConsistency(measurement) {
  const q = measurement && measurement.quorum;
  if (q === null || q === undefined || typeof q !== 'object' || Array.isArray(q)) {
    return { ok: false, reason: 'quorum_block_absent' };
  }
  const nums = ['responded', 'required', 'roles', 'of'];
  for (let i = 0; i < nums.length; i++) {
    if (!Number.isInteger(q[nums[i]]) || q[nums[i]] < 0) {
      return { ok: false, reason: 'quorum_field_not_integer:' + nums[i] };
    }
  }
  if (q.passed !== true) return { ok: false, reason: 'quorum_not_passed' };
  if (q.responded < q.required) return { ok: false, reason: 'responded_below_required' };
  if (q.roles > q.of) return { ok: false, reason: 'roles_exceeds_fielded' };
  return { ok: true, reason: null };
}

// ── 해시 (순수) ──────────────────────────────────────────────────────────────

// hashContentAs(recordedPath, text) → 'sha256:…'
//
// DN6 — `planAwareMarkdownHash`는 **경로로 함수를 고르고** `isPlanPath`는
// `.claude/plans/*.plan.md`에만 참이다. 승인 레코드 5건 중 3건의 plan은 이후
// `.claude/PRPs/plans/archived/`로 이동했으므로, **현재 경로**로 해시하면 셋 다
// 불일치하고 감사는 "본문이 바뀌었다"는 거짓 결론에 도달한다. 체제는 **기록된
// 경로**가 고르고 내용은 실제 위치에서 온다 — 그래서 경로가 아니라 문자열을 받는다.
function hashContentAs(recordedPath, text) {
  return isPlanPath(recordedPath)
    ? sha256(canonicalizeMarkdownStructural(text))
    : sha256(canonicalizeMarkdown(text));
}

function hashScheme(recordedPath) {
  return isPlanPath(recordedPath) ? 'structural' : 'raw';
}

// ── I/O 층 (주입 가능) ───────────────────────────────────────────────────────

// 모든 파일시스템·git 접근이 이 객체를 통한다. test는 스텁을 주입해 거부 경로에서
// 호출 0회를 단언한다 — 사후 판정은 검증이 아니므로 이 분리가 곧 그 단언의 근거다.
function makeRealIo(root) {
  let rootReal = null;
  try { rootReal = fs.realpathSync(root); } catch (_e) { rootReal = path.resolve(root); }

  // realpath 봉쇄 (security-reviewer C1). 문자열 검사는 symlink를 못 막는다 —
  // `.claude/plans/x.plan.md`가 저장소 밖을 가리키는 symlink여도 문자열로는
  // 통과한다. 선례는 저장소에 이미 있다(`goal-detect.js:92,97`).
  function contained(rel) {
    const abs = path.resolve(rootReal, rel);
    let real;
    try {
      real = fs.realpathSync(abs);
    } catch (_e) {
      // 존재하지 않는 경로는 봉쇄 위반이 아니다 — 부모까지 해소해 판정한다.
      let parentReal;
      try { parentReal = fs.realpathSync(path.dirname(abs)); } catch (_e2) { return null; }
      real = path.join(parentReal, path.basename(abs));
    }
    const relOut = path.relative(rootReal, real);
    if (relOut === '' || relOut.startsWith('..') || path.isAbsolute(relOut)) return null;
    return real;
  }

  function git(args) {
    // `--` 구분자는 호출자가 붙인다(경로 인자가 있는 호출만 필요하므로).
    return execFileSync('git', args, {
      cwd: rootReal,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: GIT_MAX_BUFFER,
      timeout: GIT_TIMEOUT_MS,
    });
  }

  return {
    root: rootReal,
    exists: function (rel) {
      const abs = contained(rel);
      return abs !== null && fs.existsSync(abs);
    },
    readFile: function (rel) {
      const abs = contained(rel);
      if (abs === null) return null;
      try { return fs.readFileSync(abs, 'utf8'); } catch (_e) { return null; }
    },
    readDir: function (rel) {
      const abs = contained(rel);
      if (abs === null) return [];
      try { return fs.readdirSync(abs); } catch (_e) { return []; }
    },
    // git rev-list — 반드시 `--` 구분자. 상한은 git 쪽에서도 건다.
    revList: function (rel) {
      try {
        const out = git(['rev-list', '--max-count=' + (MAX_HISTORY_REVS + 1), '--all', '--', rel]);
        return out.split(/\r?\n/).filter(Boolean);
      } catch (_e) {
        return [];
      }
    },
    showAtRev: function (rev, rel) {
      try { return git(['show', rev + ':' + rel]); } catch (_e) { return null; }
    },
    firstCommitIso: function (rel) {
      try {
        const out = git(['log', '--diff-filter=A', '--format=%aI', '--max-count=1', '--', rel]);
        return out.trim() || null;
      } catch (_e) {
        return null;
      }
    },
    isTracked: function (rel) {
      try {
        git(['ls-files', '--error-unmatch', '--', rel]);
        return true;
      } catch (_e) {
        return false;
      }
    },
  };
}

// ── 앵커 복구 ────────────────────────────────────────────────────────────────

// resolveAnchor(io, recordedPath, reviewedHash) → anchor
//
// 판정: on_disk · from_git · unrecoverable · unauditable. 근거(적용한 체제 ·
// 검사한 위치 · 순회한 리비전 수)를 함께 낸다 — 판정만 내면 왜 그렇게 됐는지
// 사후에 대조할 수 없다.
function resolveAnchor(io, recordedPath, reviewedHash) {
  const verdict = auditPathVerdict(recordedPath);
  if (!verdict.ok) {
    // **파일시스템에 닿지 않는다.** 읽고 나서 판정하는 순서면 검증이 아무것도
    // 막지 못한다.
    return {
      state: 'unauditable',
      reason: 'plan_path_rejected:' + verdict.reason,
      scheme: null,
      locations_checked: [],
      revisions_scanned: 0,
      history_limit_exhausted: false,
      recovered_from: null,
      current_hash: null,
    };
  }
  const scheme = hashScheme(recordedPath);
  const base = path.basename(recordedPath);

  // 실제 위치 후보: 기록된 경로, 그리고 아카이브. 각 후보도 같은 관문을 통과해야
  // 한다 — 파생 경로라고 검증을 건너뛰면 관문이 우회된다.
  const candidates = [recordedPath, path.join(ARCHIVED_PLAN_DIR, base).replace(/\\/g, '/')];
  const checked = [];
  let currentHash = null;

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    if (!auditPathVerdict(cand).ok) continue;
    if (!io.exists(cand)) { checked.push({ location: cand, found: false }); continue; }
    const text = io.readFile(cand);
    if (text === null) { checked.push({ location: cand, found: false, read_error: true }); continue; }
    const h = hashContentAs(recordedPath, text);
    if (currentHash === null) currentHash = h;
    checked.push({ location: cand, found: true, hash: h, matches_reviewed: h === reviewedHash });
    if (h === reviewedHash) {
      return {
        state: 'on_disk',
        reason: null,
        scheme: scheme,
        locations_checked: checked,
        revisions_scanned: 0,
        history_limit_exhausted: false,
        recovered_from: cand,
        current_hash: currentHash,
      };
    }
  }

  // 디스크에 현재 본문이 없거나 다르면 이력을 본다. 상한 소진과 진짜 부재를
  // 구분하는 것이 여기의 유일한 미묘함이다.
  let revs = [];
  for (let i = 0; i < candidates.length; i++) {
    if (!auditPathVerdict(candidates[i]).ok) continue;
    revs = revs.concat(io.revList(candidates[i]).map(function (r) {
      return { rev: r, at: candidates[i] };
    }));
  }
  const exhausted = revs.length > MAX_HISTORY_REVS;
  const scan = revs.slice(0, MAX_HISTORY_REVS);
  for (let i = 0; i < scan.length; i++) {
    const text = io.showAtRev(scan[i].rev, scan[i].at);
    if (text === null) continue;
    if (hashContentAs(recordedPath, text) === reviewedHash) {
      return {
        state: 'from_git',
        reason: null,
        scheme: scheme,
        locations_checked: checked,
        revisions_scanned: i + 1,
        history_limit_exhausted: false,
        recovered_from: scan[i].rev + ':' + scan[i].at,
        current_hash: currentHash,
      };
    }
  }
  return {
    state: 'unauditable',
    // 상한 소진을 진짜 부재로 접지 않는다 — 접으면 오래된 승인이 조용히 감사
    // 불가가 되고, 그 조용함이 정확히 이 milestone이 막으려는 형태다.
    reason: exhausted ? 'history_limit_exhausted' : 'unrecoverable',
    scheme: scheme,
    locations_checked: checked,
    revisions_scanned: scan.length,
    history_limit_exhausted: exhausted,
    recovered_from: null,
    current_hash: currentHash,
  };
}

// ── ship receipt 색인 (해시 귀속) ────────────────────────────────────────────

// indexShipReceipts(io) → { byPlanHash, corrupt, read_error, count }
//
// 이름이 아니라 `plan_hash`로 색인한다(R1 F1). **증인을 믿기 전에 증인이 온전한지
// 먼저 본다** — `receiptIntegrityOk`(receipt_hash 재계산 + schema 검증)를 통과하지
// 못한 receipt는 corroboration에 쓰지 않는다. 검증 없이 읽으면 위조·손상된
// receipt가 사라진 proof를 대신하는 증인 노릇을 하게 되고, 그것은 증인이 없는
// 것보다 나쁘다.
function indexShipReceipts(io) {
  const out = { byPlanHash: {}, corruptByPlanHash: {}, corrupt: 0, count: 0, read_error: false };
  const names = io.readDir(SHIP_RECEIPT_DIR);
  names.forEach(function (name) {
    if (!name.endsWith('.json')) return;
    const rel = (SHIP_RECEIPT_DIR + '/' + name).replace(/\\/g, '/');
    const text = io.readFile(rel);
    if (text === null) { out.read_error = true; return; }
    let receipt;
    try { receipt = JSON.parse(text); } catch (_e) { out.corrupt += 1; return; }
    out.count += 1;
    if (!receipt || typeof receipt.plan_hash !== 'string') return;
    if (!receiptIntegrityOk(receipt)) {
      out.corrupt += 1;
      if (!out.corruptByPlanHash[receipt.plan_hash]) out.corruptByPlanHash[receipt.plan_hash] = [];
      out.corruptByPlanHash[receipt.plan_hash].push({ slug: name.replace(/\.json$/, ''), receipt: receipt });
      return;
    }
    if (!out.byPlanHash[receipt.plan_hash]) out.byPlanHash[receipt.plan_hash] = [];
    out.byPlanHash[receipt.plan_hash].push({ slug: name.replace(/\.json$/, ''), receipt: receipt });
  });
  return out;
}

// ── 채널 ────────────────────────────────────────────────────────────────────

// sliceReportSections(text) → [{ heading, lines }]
function sliceReportSections(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line)) {
      if (cur) out.push(cur);
      cur = null;
      const hit = REPORT_EVIDENCE_HEADINGS.some(function (h) { return line.indexOf(h) === 0; });
      if (hit) cur = { heading: line.trim(), lines: [] };
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  if (cur) out.push(cur);
  return out;
}

// 증거로 실을 만한 줄만 남긴다 — 빈 줄 · 표 구분선 · 주석은 뺀다. 내용은 **축자**로
// 남긴다(요약하면 그 요약이 판정이 된다, DN2).
function evidenceLines(sectionLines) {
  return sectionLines
    .map(function (l) { return l.replace(/\s+$/, ''); })
    .filter(function (l) {
      if (l.trim() === '') return false;
      if (/^\s*<!--/.test(l)) return false;
      if (/^\s*\|?\s*-{3,}/.test(l)) return false;
      return true;
    });
}

function classifyReportChannel(io, slug) {
  const rel = (REPORT_DIR + '/' + slug + '-report.md').replace(/\\/g, '/');
  if (!auditPathVerdict(rel).ok) {
    return { state: 'absent', reason: 'derived_path_rejected', source: rel, sections: [] };
  }
  if (!io.exists(rel)) {
    return { state: 'absent', reason: 'no_report_at_slug', source: rel, sections: [] };
  }
  const text = io.readFile(rel);
  if (text === null) {
    return { state: 'absent', reason: 'read_error', source: rel, sections: [], read_error: true };
  }
  const sections = sliceReportSections(text);
  if (sections.length === 0) {
    // 파일이 있는데 아무 절도 못 잡은 것을 "증거 없음"으로 세면 파서 고장이
    // 관측으로 둔갑한다.
    return { state: 'absent', reason: 'no_evidence_sections_matched', source: rel, sections: [] };
  }
  return { state: 'present', reason: null, source: rel, sections: sections };
}

function backlogRowsFor(io, slug, planPath) {
  const text = io.readFile(BACKLOG_PATH.replace(/\\/g, '/'));
  if (text === null) return { read: false, rows: [] };
  const rows = [];
  String(text).split(/\r?\n/).forEach(function (line) {
    if (!/^\|/.test(line)) return;
    if (/^\|\s*-{3,}/.test(line)) return;
    const cells = corpus.splitRow(line);
    if (cells.length < 4) return;
    if (cells[0] === 'Date') return;                 // 헤더
    const src = cells[2];
    // 3열은 자유 텍스트라 정확 매칭이 원리상 불가능하다. 느슨 매칭하되 **어느
    // 부분 문자열로 걸렸는지**를 근거로 동봉해 그 부정확성을 사후 대조 가능하게
    // 남긴다.
    let matchedOn = null;
    if (planPath && src.indexOf(planPath) !== -1) matchedOn = planPath;
    else if (src.indexOf(slug) !== -1) matchedOn = slug;
    if (!matchedOn) return;
    rows.push({ date: cells[0], severity: cells[1], source_plan: src, finding: cells[3], matched_on: matchedOn });
  });
  return { read: true, rows: rows };
}

function downstreamReviewsFor(io, slug, recordRel) {
  const hits = [];
  io.readDir(REVIEW_DIR).forEach(function (name) {
    if (!name.endsWith('.md')) return;
    const rel = (REVIEW_DIR + '/' + name).replace(/\\/g, '/');
    if (rel === recordRel) return;                       // 자기 자신
    if (name.indexOf(slug) === -1) return;
    const text = io.readFile(rel);
    if (text === null) return;
    // 패널 레코드는 downstream 증거가 아니다 — 같은 생산자다(G3).
    const first = text.split(/\r?\n/).find(function (l) { return l.trim() !== ''; });
    if (typeof first === 'string' && /^#\s+Plan Review Panel\s+—/.test(first.trim())) return;
    hits.push({ source: rel, first_line: (first || '').trim() });
  });
  return hits;
}

// ── 레코드별 dossier ─────────────────────────────────────────────────────────

function buildDossier(io, entry, ctx) {
  // **정규화하지 않는다.** 초판은 두 경로에 `.replace(/\\/g, '/')`를 걸었는데, 그것이
  // 정본 validator의 역슬래시 거부를 통째로 무력화한다 — `a\b.md`가 `a/b.md`로 바뀌어
  // 관문을 통과하고, Windows 스타일 탈출 입력이 정상 repo-relative 경로처럼 보이게
  // 된다(회귀로 실측됨 — test 항목 9가 `plan_path_rejected` 대신 `unrecoverable`을
  // 관측했다). 검증은 **원본 문자열**에 대해 이뤄져야 하고, 정규화는 검증이 통과한
  // 뒤에나 의미가 있다. `corpus.js`는 이미 forward slash로 경로를 내므로 정상
  // 코퍼스는 아무것도 잃지 않으며, 만약 backslash가 들어오면 fail-closed로
  // `unauditable`이 되는 것이 옳은 방향이다.
  const recordRel = String(entry.record);
  const planPath = entry.plan_path === null || entry.plan_path === undefined
    ? null : String(entry.plan_path);

  const d = {
    record: recordRel,
    plan_path: planPath,
    slug: null,
    slug_source: null,
    slug_collision: false,
    durability: 'unknown',
    approved_at: null,
    quorum_check: { ok: false, reason: 'measurement_unreadable' },
    anchor: null,
    hash_chain: { reviewed: null, ship: null, current: null, edited_after_approval: null },
    proof_backing: 'no_ship_receipt',
    proof_backing_detail: null,
    lenses: [],
    channels: {},
    candidates: [],
  };

  // durability — 이 감사가 재현 가능한가를 **주장이 아니라 측정**으로 답한다.
  // state를 바꾸지는 않는다(항상 켜지면 정보를 나르지 않는다).
  d.durability = auditPathVerdict(recordRel).ok
    ? (io.isTracked(recordRel) ? 'tracked' : 'untracked')
    : 'unknown';

  const recText = auditPathVerdict(recordRel).ok ? io.readFile(recordRel) : null;
  const parsed = recText === null ? null : corpus.parseRecord(recText);
  const meas = parsed && parsed.measurement ? parsed.measurement : null;

  if (parsed) {
    d.lenses = (parsed.refutation || []).map(function (r) { return r.perspective; }).filter(Boolean);
  }
  if (meas) {
    d.quorum_check = checkQuorumConsistency(meas);
    d.hash_chain.reviewed = typeof meas.reviewed_plan_hash === 'string' ? meas.reviewed_plan_hash : null;
    const ms = parseIsoStrict(meas.recorded_at);
    d.approved_at = ms === null ? null : new Date(ms).toISOString();
    d.approved_at_ms = ms;
  } else {
    d.approved_at_ms = null;
  }

  // slug — plan_path basename. 레코드 파일명이 아니다(R1 F1 실측).
  if (planPath !== null && /\.plan\.md$/.test(planPath)) {
    d.slug = path.basename(planPath, '.plan.md');
    d.slug_source = 'plan_path_basename';
    d.slug_collision = (ctx.slugCounts[d.slug] || 0) > 1;
  }

  // 앵커
  d.anchor = planPath === null
    ? {
      state: 'unauditable', reason: 'plan_path_absent', scheme: null,
      locations_checked: [], revisions_scanned: 0, history_limit_exhausted: false,
      recovered_from: null, current_hash: null,
    }
    : resolveAnchor(io, planPath, d.hash_chain.reviewed);
  d.hash_chain.current = d.anchor.current_hash;

  // proof_backing — 사라진 plan-gate receipt를 대신하는 유일한 독립 증인.
  // **해시로만** 귀속한다.
  const reviewed = d.hash_chain.reviewed;
  const proven = reviewed ? (ctx.ships.byPlanHash[reviewed] || []) : [];
  const corruptHit = reviewed ? (ctx.ships.corruptByPlanHash[reviewed] || []) : [];
  let shipReceipt = null;
  if (proven.length > 0) {
    shipReceipt = proven[0].receipt;
    d.proof_backing = 'corroborated';
    d.proof_backing_detail = { receipt_slug: proven[0].slug, basis: 'plan_hash == reviewed_plan_hash' };
    d.hash_chain.ship = shipReceipt.plan_hash;
  } else if (corruptHit.length > 0) {
    d.proof_backing = 'receipt_corrupt';
    d.proof_backing_detail = { receipt_slug: corruptHit[0].slug, basis: 'receiptIntegrityOk failed' };
  } else {
    // slug 이름의 receipt가 있는지는 **진단으로만** 본다 — 있어도 증인이 아니다.
    const slugRel = d.slug === null ? null : (SHIP_RECEIPT_DIR + '/' + d.slug + '.json').replace(/\\/g, '/');
    const slugExists = slugRel !== null && auditPathVerdict(slugRel).ok && io.exists(slugRel);
    d.proof_backing = 'no_ship_receipt';
    d.proof_backing_detail = {
      receipt_slug: null,
      basis: 'no ship receipt seals this reviewed_plan_hash',
      slug_addressed_receipt_exists: slugExists,
    };
  }
  d.hash_chain.edited_after_approval = (d.hash_chain.reviewed !== null && d.hash_chain.ship !== null)
    ? d.hash_chain.reviewed !== d.hash_chain.ship
    : null;

  // ── 채널 ──
  const report = d.slug === null
    ? { state: 'absent', reason: 'no_slug', source: null, sections: [] }
    : classifyReportChannel(io, d.slug);
  d.channels.report = { state: report.state, reason: report.reason, source: report.source };

  const backlog = d.slug === null ? { read: false, rows: [] } : backlogRowsFor(io, d.slug, planPath);
  d.channels.backlog = {
    state: !backlog.read ? 'absent' : (backlog.rows.length > 0 ? 'present' : 'absent'),
    reason: !backlog.read ? 'backlog_unreadable' : (backlog.rows.length > 0 ? null : 'no_rows_naming_this_plan'),
    source: BACKLOG_PATH.replace(/\\/g, '/'),
  };

  const downstream = d.slug === null ? [] : downstreamReviewsFor(io, d.slug, recordRel);
  d.channels.downstream_reviews = {
    state: downstream.length > 0 ? 'present' : 'absent',
    reason: downstream.length > 0 ? null : 'no_non_panel_review_names_this_slug',
    source: REVIEW_DIR.replace(/\\/g, '/'),
  };

  // pr_codex — DN3. `codex_disabled` 또는 `codex_verdict==='skipped'`면 **반드시**
  // `structurally_empty`이며 어떤 카운터에도 0으로 기여하지 않는다.
  if (shipReceipt === null) {
    d.channels.pr_codex = {
      state: 'absent',
      reason: d.proof_backing === 'receipt_corrupt' ? 'witness_receipt_corrupt' : 'no_hash_proven_ship_receipt',
      source: null,
    };
  } else {
    const disabled = !!(shipReceipt.meta && shipReceipt.meta.codex_disabled);
    const skipped = !!(shipReceipt.resolution && shipReceipt.resolution.codex_verdict === 'skipped');
    const findings = Array.isArray(shipReceipt.findings) ? shipReceipt.findings : [];
    const src = (SHIP_RECEIPT_DIR + '/' + d.proof_backing_detail.receipt_slug + '.json').replace(/\\/g, '/');
    if (disabled || skipped) {
      d.channels.pr_codex = {
        state: 'structurally_empty',
        reason: 'codex_disabled=' + disabled + ' codex_verdict=' +
          ((shipReceipt.resolution && shipReceipt.resolution.codex_verdict) || null),
        source: src,
      };
    } else {
      d.channels.pr_codex = {
        state: findings.length > 0 ? 'present' : 'absent',
        reason: findings.length > 0 ? null : 'codex_ran_and_recorded_no_findings',
        source: src,
      };
    }
  }

  // ── candidates — 축자. 판정 라벨은 붙이지 않는다(DN2) ──
  const push = function (channel, source, section, text, attribution, datedAt) {
    const ms = datedAt === null || datedAt === undefined ? null : parseIsoStrict(datedAt);
    d.candidates.push({
      channel: channel,
      source: source,
      section: section,
      text: text,
      attribution: attribution,
      dated_at: ms === null ? (datedAt || null) : new Date(ms).toISOString(),
      // 순수한 순서 사실이다. `miss`/`post_approval` 같은 **판정 라벨이 아니다** —
      // G3의 시간 관문에 필요한 재료일 뿐이고, 판정은 문서가 한다.
      recorded_after_approval: (ms === null || d.approved_at_ms === null) ? null : ms > d.approved_at_ms,
    });
  };

  if (report.state === 'present') {
    const iso = io.firstCommitIso(report.source);
    report.sections.forEach(function (sec) {
      evidenceLines(sec.lines).forEach(function (line) {
        push('report', report.source, sec.heading, line, 'slug_claimed', iso);
      });
    });
  }
  backlog.rows.forEach(function (r) {
    push('backlog', BACKLOG_PATH.replace(/\\/g, '/'), 'row(matched_on=' + r.matched_on + ')',
      '| ' + r.date + ' | ' + r.severity + ' | ' + r.source_plan + ' | ' + r.finding + ' |',
      'slug_claimed', r.date.length === 10 ? r.date + 'T00:00:00Z' : null);
  });
  downstream.forEach(function (h) {
    const iso = io.firstCommitIso(h.source);
    push('downstream_reviews', h.source, h.first_line, h.first_line, 'slug_claimed', iso);
  });
  if (d.channels.pr_codex.state === 'present') {
    (shipReceipt.findings || []).forEach(function (f) {
      push('pr_codex', d.channels.pr_codex.source, 'findings[]',
        typeof f === 'string' ? f : JSON.stringify(f), 'hash_proven', null);
    });
  }

  return d;
}

// ── 집계 ────────────────────────────────────────────────────────────────────

function audit(opts) {
  const o = opts || {};
  const root = o.repoRoot || process.cwd();
  const io = o.io || makeRealIo(root);

  let corpusResult = o.corpusResult;
  let corpusError = null;
  if (!corpusResult) {
    try {
      corpusResult = corpus.audit({ repoRoot: io.root || root });
    } catch (err) {
      corpusError = err.message;
      corpusResult = null;
    }
  }

  const entries = (corpusResult && corpusResult.pass_path && Array.isArray(corpusResult.pass_path.entries))
    ? corpusResult.pass_path.entries : [];

  // blind — 승인 레코드 0건. 어떤 카운터도 보고하지 않는다.
  if (entries.length === 0) {
    return {
      state: corpusError ? 'degraded' : 'blind',
      repo_root: io.root || root,
      corpus_state: corpusResult ? corpusResult.state : null,
      corpus_records: corpusResult ? corpusResult.records : null,
      read_error: !!corpusError,
      corpus_error: corpusError,
      coverage: { approved: 0, auditable: 0, unauditable: 0 },
      records: [],
      notes: [
        'no approved (converged) plan-review records — absence is NOT a finding of zero.',
        'no counts, ratios or channel maps are reported in this state.',
      ],
    };
  }

  const slugCounts = {};
  entries.forEach(function (e) {
    if (e.plan_path && /\.plan\.md$/.test(String(e.plan_path))) {
      const s = path.basename(String(e.plan_path).replace(/\\/g, '/'), '.plan.md');
      slugCounts[s] = (slugCounts[s] || 0) + 1;
    }
  });

  const ships = indexShipReceipts(io);
  const ctx = { ships: ships, slugCounts: slugCounts };

  const admitted = [];
  const rejected = [];
  entries.forEach(function (e) {
    let d;
    try {
      d = buildDossier(io, e, ctx);
    } catch (err) {
      // 예외가 audit()을 벗어나지 않는다 — 조용한 붕괴가 조용한 0이 된다.
      rejected.push({ record: String(e.record), reason: 'dossier_build_failed:' + err.message });
      return;
    }
    if (!d.quorum_check.ok) {
      // 자기 측정이 부인하는 승인은 표본에서 뺀다(R1 F2). 버리는 것이 아니라
      // 별도 축으로 보고한다.
      rejected.push({ record: d.record, reason: 'quorum_contradiction:' + d.quorum_check.reason, dossier: d });
      return;
    }
    admitted.push(d);
  });

  const auditable = admitted.filter(function (d) {
    return (d.anchor.state === 'on_disk' || d.anchor.state === 'from_git') && d.approved_at !== null;
  });
  const unauditable = admitted.length - auditable.length;

  const uncorroborated = admitted.filter(function (d) { return d.proof_backing !== 'corroborated'; });
  const untracked = admitted.filter(function (d) { return d.durability !== 'tracked'; });

  // 채널이 실제로 무언가를 **보여줬는가** — plan L2 architect/HIGH의 실질을 출력에
  // 싣는다. Acceptance가 요구하는 구분("보았고 없었다" vs "볼 수 있는 채널이 비어
  // 있었다")은 이 축 없이는 산문으로만 주장된다.
  //
  // 판별자를 "상태가 여러 개인가"로 두면 **틀린다**: `absent`와
  // `structurally_empty`는 *이유*가 다를 뿐 둘 다 관측이 아니므로, 둘이 섞여 있다는
  // 것만으로 그 채널이 무언가를 가렸다고 말할 수 없다(실측에서 실제로 그렇게
  // 오작동했다 — receipt가 없는 레코드 1건이 섞이자 `pr_codex`가 변별한다고
  // 보고했다). 근거가 되는 상태는 `present` 하나뿐이다.
  const channelNames = ['report', 'backlog', 'downstream_reviews', 'pr_codex'];
  const channelSummary = {};
  channelNames.forEach(function (name) {
    const states = {};
    let bearing = 0;
    admitted.forEach(function (d) {
      const ch = d.channels[name];
      const s = ch ? ch.state : 'absent';
      states[s] = (states[s] || 0) + 1;
      if (s === 'present') bearing += 1;
    });
    channelSummary[name] = {
      states: states,
      evidence_bearing_records: bearing,
      // 이 채널이 "미탐 없음"의 근거가 될 수 있는가. 한 레코드도 증거를 내지
      // 않았다면 그 채널은 **보지 않은 것**이지 보고 없었던 것이 아니다.
      can_ground_absence: bearing > 0,
    };
  });

  const hardReadError = !!corpusError || ships.read_error;
  const parseFailures = rejected.filter(function (r) {
    return r.reason.indexOf('dossier_build_failed') === 0;
  }).length;

  // state precedence ladder — evidence-audit.js 미러. 가장 심각한 것부터.
  //
  // **`blind`는 여기서 나오지 않는다.** `blind`가 뜻하는 것은 "코퍼스에 승인
  // 레코드가 없었다"이고 그 판정은 `entries.length === 0`에서 이미 조기 반환됐다.
  // 여기까지 왔다는 것은 승인 레코드가 **있었다**는 뜻이므로, 그것이 전부 거부돼
  // `admitted`가 비었다면 그것은 부재가 아니라 **고장**이다(`degraded`). 이 구분을
  // 놓치면 레코드를 하나도 못 읽은 실행이 "승인이 없었다"로 보고되고, 그것은 이
  // milestone이 막으려는 오독(부재를 관측으로 읽기)을 도구 자신이 저지르는 것이다.
  // (회귀로 실측됨 — test 항목 6.)
  let state;
  if (hardReadError) state = 'degraded';
  else if (rejected.length > 0 || uncorroborated.length > 0) state = 'degraded';
  else state = 'ok';

  return {
    state: state,
    repo_root: io.root || root,
    corpus_state: corpusResult ? corpusResult.state : null,
    corpus_records: corpusResult ? corpusResult.records : null,
    read_error: hardReadError,
    corpus_error: corpusError,
    parse_failures: parseFailures,
    // 정확히 세 키. `approved === auditable + unauditable`이 항등식으로 성립한다.
    coverage: {
      approved: admitted.length,
      auditable: auditable.length,
      unauditable: unauditable,
    },
    rejected: rejected.map(function (r) { return { record: r.record, reason: r.reason }; }),
    proof_backing_summary: {
      corroborated: admitted.length - uncorroborated.length,
      not_corroborated: uncorroborated.length,
    },
    durability_summary: {
      tracked: admitted.length - untracked.length,
      untracked: untracked.length,
    },
    channel_summary: channelSummary,
    ship_receipts_indexed: ships.count,
    ship_receipts_corrupt: ships.corrupt,
    history_scan_limit: MAX_HISTORY_REVS,
    records: admitted,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function renderHuman(r) {
  const L = [];
  L.push('approval audit (' + r.repo_root + ') — state=' + r.state);
  if (r.state === 'blind') {
    L.push('  0 approved records. Absence is NOT a finding of zero — no counts reported.');
    return L.join('\n');
  }
  L.push('  coverage      : approved=' + r.coverage.approved +
    ' auditable=' + r.coverage.auditable +
    ' unauditable=' + r.coverage.unauditable);
  L.push('  proof_backing : corroborated=' + r.proof_backing_summary.corroborated +
    ' not_corroborated=' + r.proof_backing_summary.not_corroborated);
  L.push('  durability    : tracked=' + r.durability_summary.tracked +
    ' untracked=' + r.durability_summary.untracked);
  Object.keys(r.channel_summary || {}).forEach(function (name) {
    const c = r.channel_summary[name];
    L.push('  ch ' + name.padEnd(19) + ': ' + JSON.stringify(c.states) +
      ' evidence_bearing=' + c.evidence_bearing_records +
      ' can_ground_absence=' + c.can_ground_absence);
  });
  if (r.rejected.length) {
    L.push('  rejected      : ' + r.rejected.length);
    r.rejected.forEach(function (x) { L.push('    - ' + x.record + ' — ' + x.reason); });
  }
  r.records.forEach(function (d) {
    L.push('  ── ' + d.slug + ' (' + d.record + ')');
    L.push('     anchor=' + d.anchor.state + (d.anchor.reason ? ('/' + d.anchor.reason) : '') +
      ' scheme=' + d.anchor.scheme + ' revs=' + d.anchor.revisions_scanned);
    L.push('     proof_backing=' + d.proof_backing + ' durability=' + d.durability +
      ' approved_at=' + d.approved_at);
    L.push('     lenses=' + JSON.stringify(d.lenses));
    L.push('     channels=' + Object.keys(d.channels).map(function (k) {
      return k + ':' + d.channels[k].state;
    }).join(' '));
    L.push('     candidates=' + d.candidates.length);
  });
  L.push('');
  L.push('  This tool binds; it does not judge. No miss/false-approve verdict is emitted (DN2),');
  L.push('  and no ratio is reported (DN8).');
  return L.join('\n');
}

function printUsage() {
  process.stdout.write([
    'Usage: node plugins/mccp/scripts/lib/plan-review/approval-audit.js [--json] [--repo-root <path>]',
    '',
    'Read-only, LLM-free dossier binding for APPROVED (converged) plan-review records.',
    'Binds each approval to post-approval defect evidence recorded by OTHER producers.',
    'It counts and binds — it does not judge (DN2) and reports no ratio (DN8).',
    '',
    'Exit: 0 ok · 1 degraded (read/parse failure, or a non-corroborated approval)',
    '      2 blind (zero approved records).',
    '',
  ].join('\n'));
}

function warn(msg) {
  process.stderr.write('[mccp:approval-audit] ' + msg + '\n');
}

function main(argv) {
  let asJson = false;
  let repoRoot = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') {
      asJson = true;
    } else if (a === '--repo-root') {
      repoRoot = argv[i + 1];
      i++;
      if (!repoRoot) { warn('--repo-root requires a path argument'); process.exit(1); }
    } else if (a === '-h' || a === '--help') {
      printUsage();
      process.exit(0);
    } else {
      warn('unknown argument "' + a + '" (ignored — loud fail-open).');
    }
  }
  if (!repoRoot) {
    try {
      repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch (_err) {
      repoRoot = process.cwd();
    }
  }

  const result = audit({ repoRoot: repoRoot });
  if (asJson) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else process.stdout.write(renderHuman(result) + '\n');

  switch (result.state) {
    case 'blind':
      warn('BLIND — 0 approved records. Absence is NOT a finding of zero; no ratio is reported.');
      break;
    case 'degraded':
      if (result.read_error) warn('DEGRADED — a source could not be read (corpus_error=' + result.corpus_error + ').');
      result.rejected.forEach(function (x) { warn('  rejected: ' + x.record + ' — ' + x.reason); });
      result.records.filter(function (d) { return d.proof_backing !== 'corroborated'; })
        .forEach(function (d) {
          warn('  not corroborated: ' + d.slug + ' — proof_backing=' + d.proof_backing +
            ' (the plan-gate receipt is gone; the ship receipt is the only independent witness)');
        });
      break;
    default:
      break;
  }
  // 상태와 무관하게 코퍼스 경계를 항상 말한다.
  if (result.coverage && result.coverage.unauditable > 0) {
    warn('coverage: ' + result.coverage.unauditable + ' of ' + result.coverage.approved +
      ' approved record(s) are unauditable (reviewed body unrecoverable, path rejected, or no ' +
      'usable approval timestamp). They are NOT counted as "no defect found".');
  }
  if (result.channel_summary && result.coverage.approved > 0) {
    Object.keys(result.channel_summary).forEach(function (name) {
      const c = result.channel_summary[name];
      if (!c.can_ground_absence) {
        warn('channel "' + name + '" yielded evidence for 0 of ' + result.coverage.approved +
          ' approved record(s) (' + JSON.stringify(c.states) + ') — it was NOT looked through, ' +
          'so it cannot ground any claim of "no miss".');
      }
    });
  }

  process.exit(exitCodeForState(result.state));
}

module.exports = {
  audit: audit,
  buildDossier: buildDossier,
  resolveAnchor: resolveAnchor,
  auditPathVerdict: auditPathVerdict,
  parseIsoStrict: parseIsoStrict,
  checkQuorumConsistency: checkQuorumConsistency,
  hashContentAs: hashContentAs,
  hashScheme: hashScheme,
  sliceReportSections: sliceReportSections,
  indexShipReceipts: indexShipReceipts,
  makeRealIo: makeRealIo,
  renderHuman: renderHuman,
  exitCodeForState: exitCodeForState,
  STATE_EXIT_CODES: STATE_EXIT_CODES,
  MAX_HISTORY_REVS: MAX_HISTORY_REVS,
};

if (require.main === module) {
  main(process.argv.slice(2));
}
